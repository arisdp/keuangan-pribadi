import React, { useMemo, useState } from 'react';
import { Account, CategoryBudget, Transaction } from '../types';
import {
  getAccountCreditBill,
  getCreditAccounts,
  getCreditOverlimitAmount,
  getTransactionAccountDelta,
  normalizeAbsAmount,
  normalizeLedgerDateYYYYMMDD,
} from '../utils/accountingEngine';
import { showToast } from '../utils/toast';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  CreditCard,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface CreditOverlimitTrendAnalyzerProps {
  accounts: Account[];
  transactions: Transaction[];
  budgets?: CategoryBudget[];
  onApplyBudgetSuggestion?: (category: string, recommendedLimit: number) => void;
}

interface TimelinePoint {
  date: string;
  label: string;
  usedLimit: number;
  creditLimit: number;
  utilizationPct: number;
  overlimitAmount: number;
  dailySpend: number;
  dailyPayment: number;
}

interface OverlimitEvent {
  date: string;
  accountId: string;
  accountName: string;
  usedLimit: number;
  creditLimit: number;
  overlimitAmount: number;
  utilizationPct: number;
  triggerCategory: string;
}

interface MonthlyTrendBucket {
  monthKey: string;
  label: string;
  usedLimit: number;
  endUsedLimit: number;
  peakUsedLimit: number;
  creditLimit: number;
  utilizationPct: number;
  endUtilizationPct: number;
  peakUtilizationPct: number;
  overlimitAmount: number;
  monthlySpend: number;
  monthlyPayment: number;
  overlimitCount: number;
}

interface CardTrendSummary {
  account: Account;
  accountTypeLabel: string;
  creditLimit: number;
  currentBill: number;
  remainingLimit: number;
  overlimitAmount: number;
  utilizationPct: number;
  peakUtilizationPct: number;
  peakUsedLimit: number;
  peakDate: string;
  recent30dSpend: number;
  recent30dPayment: number;
  prev30dSpend: number;
  netMonthlyBurn: number;
  dailyBurnRate: number;
  spendChangePct: number;
  estimatedDaysToOverlimit: number | null;
  overlimitEventsCount: number;
  riskStatus: 'overlimit' | 'rising-risk' | 'recurring-history' | 'healthy';
  timeline: TimelinePoint[];
}

const formatShortDate = (isoDate: string): string => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate;
  const [y, m, d] = isoDate.split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${String(d).padStart(2, '0')} ${months[(m - 1) % 12]} ${String(y).slice(-2)}`;
};

const formatMonthLabel = (monthKey: string): string => {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return monthKey;
  const [y, m] = monthKey.split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${months[(m - 1) % 12]} '${String(y).slice(-2)}`;
};

const toIsoDate = (ms: number): string => {
  const dt = new Date(ms);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const parseIsoMs = (isoDate: string): number => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return Date.now();
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
};

export const CreditOverlimitTrendAnalyzer: React.FC<CreditOverlimitTrendAnalyzerProps> = ({
  accounts = [],
  transactions = [],
  budgets = [],
  onApplyBudgetSuggestion,
}) => {
  const creditAccounts = useMemo(() => getCreditAccounts(accounts), [accounts]);

  const [selectedAccountId, setSelectedAccountId] = useState<string>('ALL');
  const [timeframe, setTimeframe] = useState<'6m' | '30d' | '90d' | 'all'>('6m');
  const [chartMetric, setChartMetric] = useState<'pct' | 'idr'>('pct');
  const [targetUtilizationPct, setTargetUtilizationPct] = useState<30 | 50 | 80>(30);
  const [appliedCategories, setAppliedCategories] = useState<string[]>([]);

  const formatterIDR = useMemo(
    () =>
      new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }),
    []
  );

  const effectiveAccountId =
    selectedAccountId !== 'ALL' && !creditAccounts.some((a) => a.id === selectedAccountId)
      ? 'ALL'
      : selectedAccountId;

  const { cardSummaries, allOverlimitEvents, latestReferenceMs } = useMemo(() => {
    const allDatesMs: number[] = [];

    const normalizedTxs = (transactions || [])
      .filter((tx) => tx && !tx.isAdjustment)
      .map((tx) => {
        const normDate = normalizeLedgerDateYYYYMMDD(tx.date);
        const validDate = /^\d{4}-\d{2}-\d{2}$/.test(normDate) ? normDate : toIsoDate(Date.now());
        const ms = parseIsoMs(validDate);
        allDatesMs.push(ms);
        return { ...tx, normDate: validDate, ms };
      })
      .sort((a, b) => a.ms - b.ms);

    const refMs = allDatesMs.length > 0 ? Math.max(...allDatesMs, Date.now()) : Date.now();
    const ONE_DAY = 24 * 60 * 60 * 1000;
    const recentCutoffMs = refMs - 30 * ONE_DAY;
    const prevCutoffMs = refMs - 60 * ONE_DAY;

    const events: OverlimitEvent[] = [];

    const summaries: CardTrendSummary[] = creditAccounts.map((acc) => {
      const creditLimit = normalizeAbsAmount(acc.creditLimit ?? acc.startingBalance ?? 0);
      const currentBill = getAccountCreditBill(acc);
      const remainingLimit = Number.isFinite(Number(acc.currentBalance))
        ? Number(acc.currentBalance)
        : creditLimit - currentBill;
      const overlimitAmount = getCreditOverlimitAmount(acc);
      const utilizationPct =
        creditLimit > 0 ? (currentBill / creditLimit) * 100 : currentBill > 0 ? 100 : 0;

      // Filter transactions that affect this credit / PayLater account
      const accTxs = normalizedTxs.filter(
        (tx) =>
          tx.accountId === acc.id ||
          (tx.linkedDebtAction === 'pay' && tx.linkedDebtId === `acc-debt-${acc.id}`)
      );

      let totalReplayUsedDelta = 0;
      const byDateMap = new Map<
        string,
        { spend: number; payment: number; topCategory: string; topCategoryAmt: number }
      >();

      let recent30dSpend = 0;
      let recent30dPayment = 0;
      let prev30dSpend = 0;

      accTxs.forEach((tx) => {
        const isBillPay =
          tx.linkedDebtAction === 'pay' && tx.linkedDebtId === `acc-debt-${acc.id}`;
        const delta = isBillPay
          ? getTransactionAccountDelta({ type: 'income', amount: tx.amount })
          : getTransactionAccountDelta(tx);
        // Increasing usedLimit corresponds to negative delta on credit account
        const usedChange = -delta;
        totalReplayUsedDelta += usedChange;

        const amt = normalizeAbsAmount(tx.amount);
        const existing = byDateMap.get(tx.normDate) || {
          spend: 0,
          payment: 0,
          topCategory: tx.category || 'Transaksi Kredit',
          topCategoryAmt: 0,
        };

        if (usedChange > 0) {
          existing.spend += usedChange;
          if (amt >= existing.topCategoryAmt) {
            existing.topCategoryAmt = amt;
            existing.topCategory = tx.category || 'Lainnya';
          }
          if (tx.ms >= recentCutoffMs && tx.ms <= refMs) {
            recent30dSpend += usedChange;
          } else if (tx.ms >= prevCutoffMs && tx.ms < recentCutoffMs) {
            prev30dSpend += usedChange;
          }
        } else if (usedChange < 0) {
          const payAmt = Math.abs(usedChange);
          existing.payment += payAmt;
          if (tx.ms >= recentCutoffMs && tx.ms <= refMs) {
            recent30dPayment += payAmt;
          }
        }

        byDateMap.set(tx.normDate, existing);
      });

      // Anchor starting used limit so replay lands accurately on currentBill
      let runningUsed = Math.max(0, currentBill - totalReplayUsedDelta);
      const sortedDates = Array.from(byDateMap.keys()).sort();

      const timeline: TimelinePoint[] = [];
      let peakUsedLimit = currentBill;
      let peakUtilizationPct = utilizationPct;
      let peakDate = sortedDates[sortedDates.length - 1] || toIsoDate(refMs);
      let overlimitEventsCount = 0;
      let wasPreviouslyOverlimit = creditLimit > 0 && runningUsed > creditLimit;

      if (sortedDates.length === 0) {
        const todayIso = toIsoDate(refMs);
        timeline.push({
          date: todayIso,
          label: formatShortDate(todayIso),
          usedLimit: currentBill,
          creditLimit,
          utilizationPct: Number(utilizationPct.toFixed(1)),
          overlimitAmount,
          dailySpend: 0,
          dailyPayment: 0,
        });
      } else {
        // Add baseline anchor right before first transaction if non-zero initial debt existed
        if (runningUsed > 0) {
          const firstMs = parseIsoMs(sortedDates[0]) - ONE_DAY;
          const anchorIso = toIsoDate(firstMs);
          const anchorPct = creditLimit > 0 ? (runningUsed / creditLimit) * 100 : 0;
          timeline.push({
            date: anchorIso,
            label: formatShortDate(anchorIso),
            usedLimit: runningUsed,
            creditLimit,
            utilizationPct: Number(anchorPct.toFixed(1)),
            overlimitAmount: creditLimit > 0 ? Math.max(0, runningUsed - creditLimit) : 0,
            dailySpend: 0,
            dailyPayment: 0,
          });
        }

        sortedDates.forEach((dateStr) => {
          const day = byDateMap.get(dateStr)!;
          runningUsed = Math.max(0, runningUsed + day.spend - day.payment);
          const dayPct =
            creditLimit > 0 ? (runningUsed / creditLimit) * 100 : runningUsed > 0 ? 100 : 0;
          const dayOverlimit = creditLimit > 0 ? Math.max(0, runningUsed - creditLimit) : 0;

          if (runningUsed >= peakUsedLimit) {
            peakUsedLimit = runningUsed;
            peakUtilizationPct = dayPct;
            peakDate = dateStr;
          }

          if (dayOverlimit > 0 && (!wasPreviouslyOverlimit || day.spend > 0)) {
            overlimitEventsCount += 1;
            events.push({
              date: dateStr,
              accountId: acc.id,
              accountName: acc.name,
              usedLimit: runningUsed,
              creditLimit,
              overlimitAmount: dayOverlimit,
              utilizationPct: Number(dayPct.toFixed(1)),
              triggerCategory: day.topCategory,
            });
          }
          wasPreviouslyOverlimit = dayOverlimit > 0;

          timeline.push({
            date: dateStr,
            label: formatShortDate(dateStr),
            usedLimit: runningUsed,
            creditLimit,
            utilizationPct: Number(dayPct.toFixed(1)),
            overlimitAmount: dayOverlimit,
            dailySpend: day.spend,
            dailyPayment: day.payment,
          });
        });

        // Ensure today's current snapshot is represented if latest tx is older
        const lastDate = sortedDates[sortedDates.length - 1];
        const todayIso = toIsoDate(refMs);
        if (lastDate < todayIso) {
          timeline.push({
            date: todayIso,
            label: formatShortDate(todayIso),
            usedLimit: currentBill,
            creditLimit,
            utilizationPct: Number(utilizationPct.toFixed(1)),
            overlimitAmount,
            dailySpend: 0,
            dailyPayment: 0,
          });
        }
      }

      const netMonthlyBurn = recent30dSpend - recent30dPayment;
      const dailyBurnRate = netMonthlyBurn / 30;
      const spendChangePct =
        prev30dSpend > 0
          ? ((recent30dSpend - prev30dSpend) / prev30dSpend) * 100
          : recent30dSpend > 0
          ? 100
          : 0;

      const estimatedDaysToOverlimit =
        overlimitAmount === 0 && dailyBurnRate > 0 && remainingLimit > 0
          ? Math.max(1, Math.ceil(remainingLimit / dailyBurnRate))
          : null;

      let riskStatus: CardTrendSummary['riskStatus'] = 'healthy';
      if (overlimitAmount > 0 || utilizationPct > 100) {
        riskStatus = 'overlimit';
      } else if (
        utilizationPct >= 75 ||
        (estimatedDaysToOverlimit !== null && estimatedDaysToOverlimit <= 45)
      ) {
        riskStatus = 'rising-risk';
      } else if (overlimitEventsCount > 0) {
        riskStatus = 'recurring-history';
      }

      return {
        account: acc,
        accountTypeLabel: acc.type === 'credit-card' ? 'Kartu Kredit' : 'PayLater',
        creditLimit,
        currentBill,
        remainingLimit,
        overlimitAmount,
        utilizationPct,
        peakUtilizationPct,
        peakUsedLimit,
        peakDate,
        recent30dSpend,
        recent30dPayment,
        prev30dSpend,
        netMonthlyBurn,
        dailyBurnRate,
        spendChangePct,
        estimatedDaysToOverlimit,
        overlimitEventsCount,
        riskStatus,
        timeline,
      };
    });

    events.sort((a, b) => b.date.localeCompare(a.date));

    return {
      cardSummaries: summaries,
      allOverlimitEvents: events,
      latestReferenceMs: refMs,
    };
  }, [creditAccounts, transactions]);

  const activeScope = useMemo(() => {
    const selectedCards =
      effectiveAccountId === 'ALL'
        ? cardSummaries
        : cardSummaries.filter((c) => c.account.id === effectiveAccountId);

    const totalLimit = selectedCards.reduce((s, c) => s + c.creditLimit, 0);
    const totalUsed = selectedCards.reduce((s, c) => s + c.currentBill, 0);
    const totalRemaining = selectedCards.reduce((s, c) => s + c.remainingLimit, 0);
    const totalOverlimit = selectedCards.reduce((s, c) => s + c.overlimitAmount, 0);
    const utilizationPct =
      totalLimit > 0 ? (totalUsed / totalLimit) * 100 : totalUsed > 0 ? 100 : 0;

    const recent30dSpend = selectedCards.reduce((s, c) => s + c.recent30dSpend, 0);
    const recent30dPayment = selectedCards.reduce((s, c) => s + c.recent30dPayment, 0);
    const prev30dSpend = selectedCards.reduce((s, c) => s + c.prev30dSpend, 0);
    const netMonthlyBurn = recent30dSpend - recent30dPayment;
    const dailyBurnRate = netMonthlyBurn / 30;
    const spendChangePct =
      prev30dSpend > 0
        ? ((recent30dSpend - prev30dSpend) / prev30dSpend) * 100
        : recent30dSpend > 0
        ? 100
        : 0;

    const estimatedDaysToOverlimit =
      totalOverlimit === 0 && dailyBurnRate > 0 && totalRemaining > 0
        ? Math.max(1, Math.ceil(totalRemaining / dailyBurnRate))
        : null;

    const relevantEvents =
      effectiveAccountId === 'ALL'
        ? allOverlimitEvents
        : allOverlimitEvents.filter((e) => e.accountId === effectiveAccountId);

    let riskStatus: CardTrendSummary['riskStatus'] = 'healthy';
    if (totalOverlimit > 0 || utilizationPct > 100) {
      riskStatus = 'overlimit';
    } else if (
      utilizationPct >= 75 ||
      (estimatedDaysToOverlimit !== null && estimatedDaysToOverlimit <= 45)
    ) {
      riskStatus = 'rising-risk';
    } else if (relevantEvents.length > 0) {
      riskStatus = 'recurring-history';
    }

    // Build combined timeline across selected cards
    const dateSet = new Set<string>();
    selectedCards.forEach((c) => c.timeline.forEach((pt) => dateSet.add(pt.date)));
    const sortedDates = Array.from(dateSet).sort();

    const perCardIndex = new Map<string, number>();
    selectedCards.forEach((c) => perCardIndex.set(c.account.id, 0));

    const combinedTimeline: TimelinePoint[] = sortedDates.map((dateStr) => {
      let sumUsed = 0;
      let sumLimit = 0;
      let sumSpend = 0;
      let sumPay = 0;

      selectedCards.forEach((c) => {
        let idx = perCardIndex.get(c.account.id) || 0;
        while (idx + 1 < c.timeline.length && c.timeline[idx + 1].date <= dateStr) {
          idx++;
        }
        perCardIndex.set(c.account.id, idx);

        const pt = c.timeline[idx];
        if (pt && pt.date <= dateStr) {
          sumUsed += pt.usedLimit;
          sumLimit += pt.creditLimit;
          if (pt.date === dateStr) {
            sumSpend += pt.dailySpend;
            sumPay += pt.dailyPayment;
          }
        } else {
          sumLimit += c.creditLimit;
        }
      });

      const pct = sumLimit > 0 ? (sumUsed / sumLimit) * 100 : sumUsed > 0 ? 100 : 0;
      return {
        date: dateStr,
        label: formatShortDate(dateStr),
        usedLimit: sumUsed,
        creditLimit: sumLimit,
        utilizationPct: Number(pct.toFixed(1)),
        overlimitAmount: sumLimit > 0 ? Math.max(0, sumUsed - sumLimit) : 0,
        dailySpend: sumSpend,
        dailyPayment: sumPay,
      };
    });

    // Apply timeframe filter relative to latestReferenceMs
    const ONE_DAY = 24 * 60 * 60 * 1000;
    const windowDays = timeframe === '30d' ? 30 : timeframe === '90d' ? 90 : timeframe === '6m' ? 180 : null;
    let filteredTimeline = combinedTimeline;
    if (windowDays !== null && combinedTimeline.length > 0) {
      const cutoffIso = toIsoDate(latestReferenceMs - windowDays * ONE_DAY);
      const inside = combinedTimeline.filter((pt) => pt.date >= cutoffIso);
      const prePoint = [...combinedTimeline].reverse().find((pt) => pt.date < cutoffIso);
      filteredTimeline = prePoint ? [{ ...prePoint, date: cutoffIso, label: formatShortDate(cutoffIso) }, ...inside] : inside;
    }

    // Build rolling 6-month monthly buckets ending at latestReferenceMs month
    const refDt = new Date(latestReferenceMs);
    const sixMonthKeys: string[] = [];
    for (let offset = 5; offset >= 0; offset--) {
      const mDt = new Date(refDt.getFullYear(), refDt.getMonth() - offset, 1);
      sixMonthKeys.push(`${mDt.getFullYear()}-${String(mDt.getMonth() + 1).padStart(2, '0')}`);
    }

    const monthly6MoData: MonthlyTrendBucket[] = sixMonthKeys.map((monthKey) => {
      const monthEndIso = `${monthKey}-31`;
      const inMonthPts = combinedTimeline.filter((pt) => pt.date.startsWith(monthKey));
      const priorPt = [...combinedTimeline].reverse().find((pt) => pt.date < `${monthKey}-01`);
      const lastUpToMonthPt = [...combinedTimeline].reverse().find((pt) => pt.date <= monthEndIso);

      const monthlySpend = inMonthPts.reduce((s, pt) => s + pt.dailySpend, 0);
      const monthlyPayment = inMonthPts.reduce((s, pt) => s + pt.dailyPayment, 0);

      const candidateUsedValues = [
        ...(priorPt ? [priorPt.usedLimit] : []),
        ...inMonthPts.map((pt) => pt.usedLimit),
      ];
      const peakUsedLimit =
        candidateUsedValues.length > 0
          ? Math.max(...candidateUsedValues)
          : lastUpToMonthPt
          ? lastUpToMonthPt.usedLimit
          : 0;
      const endUsedLimit =
        inMonthPts.length > 0
          ? inMonthPts[inMonthPts.length - 1].usedLimit
          : lastUpToMonthPt
          ? lastUpToMonthPt.usedLimit
          : 0;

      const effectiveMonthLimit =
        inMonthPts.length > 0
          ? inMonthPts[inMonthPts.length - 1].creditLimit
          : lastUpToMonthPt?.creditLimit || totalLimit;

      const peakUtilizationPct =
        effectiveMonthLimit > 0 ? (peakUsedLimit / effectiveMonthLimit) * 100 : 0;
      const endUtilizationPct =
        effectiveMonthLimit > 0 ? (endUsedLimit / effectiveMonthLimit) * 100 : 0;

      const overlimitCount = relevantEvents.filter((ev) => ev.date.startsWith(monthKey)).length;

      return {
        monthKey,
        label: formatMonthLabel(monthKey),
        usedLimit: Number(peakUsedLimit.toFixed(0)),
        endUsedLimit: Number(endUsedLimit.toFixed(0)),
        peakUsedLimit: Number(peakUsedLimit.toFixed(0)),
        creditLimit: effectiveMonthLimit,
        utilizationPct: Number(peakUtilizationPct.toFixed(1)),
        endUtilizationPct: Number(endUtilizationPct.toFixed(1)),
        peakUtilizationPct: Number(peakUtilizationPct.toFixed(1)),
        overlimitAmount:
          effectiveMonthLimit > 0 ? Math.max(0, peakUsedLimit - effectiveMonthLimit) : 0,
        monthlySpend,
        monthlyPayment,
        overlimitCount,
      };
    });

    const firstHalfMonths = monthly6MoData.slice(0, 3);
    const secondHalfMonths = monthly6MoData.slice(3, 6);
    const firstHalfAvgUtilPct =
      firstHalfMonths.reduce((s, m) => s + m.peakUtilizationPct, 0) /
      Math.max(1, firstHalfMonths.length);
    const secondHalfAvgUtilPct =
      secondHalfMonths.reduce((s, m) => s + m.peakUtilizationPct, 0) /
      Math.max(1, secondHalfMonths.length);
    const utilizationSlopePct = secondHalfAvgUtilPct - firstHalfAvgUtilPct;
    const monthsWithOverlimit6Mo = monthly6MoData.filter(
      (m) => m.peakUtilizationPct > 100 || m.overlimitAmount > 0
    ).length;
    const firstHalfOverlimitMonths = firstHalfMonths.filter(
      (m) => m.peakUtilizationPct > 100 || m.overlimitAmount > 0
    ).length;
    const secondHalfOverlimitMonths = secondHalfMonths.filter(
      (m) => m.peakUtilizationPct > 100 || m.overlimitAmount > 0
    ).length;

    let consecutiveRisingMonths = 0;
    for (let i = monthly6MoData.length - 1; i > 0; i--) {
      if (monthly6MoData[i].peakUtilizationPct > monthly6MoData[i - 1].peakUtilizationPct + 2) {
        consecutiveRisingMonths += 1;
      } else {
        break;
      }
    }

    const isOverlimitBehaviorIncreasing =
      secondHalfOverlimitMonths > firstHalfOverlimitMonths ||
      (utilizationSlopePct >= 8 && secondHalfAvgUtilPct >= 65) ||
      (consecutiveRisingMonths >= 2 && secondHalfAvgUtilPct >= 60) ||
      (totalOverlimit > 0 && utilizationSlopePct >= 0);

    const sixMonthEscalation = {
      firstHalfAvgUtilPct,
      secondHalfAvgUtilPct,
      utilizationSlopePct,
      monthsWithOverlimit6Mo,
      firstHalfOverlimitMonths,
      secondHalfOverlimitMonths,
      consecutiveRisingMonths,
      isEscalating: isOverlimitBehaviorIncreasing,
    };

    const peakPct =
      combinedTimeline.length > 0
        ? Math.max(...combinedTimeline.map((pt) => pt.utilizationPct), utilizationPct)
        : utilizationPct;

    return {
      selectedCards,
      totalLimit,
      totalUsed,
      totalRemaining,
      totalOverlimit,
      utilizationPct,
      peakPct,
      recent30dSpend,
      recent30dPayment,
      netMonthlyBurn,
      dailyBurnRate,
      spendChangePct,
      estimatedDaysToOverlimit,
      riskStatus,
      relevantEvents,
      chartData: filteredTimeline,
      monthly6MoData,
      sixMonthEscalation,
    };
  }, [cardSummaries, effectiveAccountId, allOverlimitEvents, timeframe, latestReferenceMs]);

  // Top spending categories driving selected credit/PayLater usage
  const topCreditCategories = useMemo(() => {
    const selectedAccountIds = new Set(activeScope.selectedCards.map((c) => c.account.id));
    const catMap = new Map<string, { total: number; count: number }>();

    (transactions || []).forEach((tx) => {
      if (!tx || tx.isAdjustment || tx.type === 'income') return;
      if (!selectedAccountIds.has(tx.accountId)) return;
      const amt = normalizeAbsAmount(tx.amount);
      if (amt <= 0) return;
      const cat = String(tx.category || 'Lainnya').trim();
      const cur = catMap.get(cat) || { total: 0, count: 0 };
      cur.total += amt;
      cur.count += 1;
      catMap.set(cat, cur);
    });

    const totalSpend = Array.from(catMap.values()).reduce((s, c) => s + c.total, 0);
    const overOrHighRisk =
      activeScope.riskStatus === 'overlimit' || activeScope.riskStatus === 'rising-risk';
    const trimMultiplier = activeScope.riskStatus === 'overlimit' ? 0.65 : overOrHighRisk ? 0.8 : 0.9;

    return Array.from(catMap.entries())
      .map(([category, stats]) => {
        const existingBudget = budgets.find(
          (b) => b.category.toLowerCase() === category.toLowerCase()
        );
        const sharePct = totalSpend > 0 ? (stats.total / totalSpend) * 100 : 0;
        const rawCap = Math.max(50000, Math.round((stats.total * trimMultiplier) / 50000) * 50000);
        const suggestedCap =
          existingBudget && existingBudget.limit > 0
            ? Math.min(existingBudget.limit, rawCap)
            : rawCap;
        return {
          category,
          totalSpend: stats.total,
          txCount: stats.count,
          sharePct,
          currentBudgetLimit: existingBudget?.limit || 0,
          suggestedCap,
        };
      })
      .sort((a, b) => b.totalSpend - a.totalSpend)
      .slice(0, 4);
  }, [activeScope.selectedCards, activeScope.riskStatus, transactions, budgets]);

  // Proactive limit targets & safe daily spending cap
  const proactivePlan = useMemo(() => {
    const targetCeiling = activeScope.totalLimit * (targetUtilizationPct / 100);
    const repaymentNeededForTarget = Math.max(0, activeScope.totalUsed - targetCeiling);
    const repaymentToExitOverlimit = activeScope.totalOverlimit;
    const repaymentToSafe80 = Math.max(0, activeScope.totalUsed - activeScope.totalLimit * 0.8);
    const safeHeadroom = Math.max(0, targetCeiling - activeScope.totalUsed);

    // Estimate remaining days to next nearest dueDay across selected cards
    const todayDate = new Date(latestReferenceMs);
    const currentDay = todayDate.getDate();
    const dueDays = activeScope.selectedCards
      .map((c) => c.account.dueDay)
      .filter((d): d is number => typeof d === 'number' && d >= 1 && d <= 31);

    let daysLeftInCycle = 30;
    if (dueDays.length > 0) {
      const diffs = dueDays.map((d) => (d >= currentDay ? d - currentDay : 30 - currentDay + d));
      daysLeftInCycle = Math.max(1, Math.min(...diffs));
    }

    const safeDailySpendingCap =
      safeHeadroom > 0 ? Math.floor(safeHeadroom / daysLeftInCycle) : 0;
    const safeWeeklySpendingCap = safeDailySpendingCap * 7;

    return {
      targetCeiling,
      repaymentNeededForTarget,
      repaymentToExitOverlimit,
      repaymentToSafe80,
      safeHeadroom,
      daysLeftInCycle,
      safeDailySpendingCap,
      safeWeeklySpendingCap,
    };
  }, [activeScope, targetUtilizationPct, latestReferenceMs]);

  const cardComparisonData = useMemo(() => {
    return cardSummaries.map((c) => ({
      name: c.account.name.length > 18 ? `${c.account.name.slice(0, 16)}…` : c.account.name,
      fullName: c.account.name,
      currentPct: Number(c.utilizationPct.toFixed(1)),
      peakPct: Number(c.peakUtilizationPct.toFixed(1)),
      usedLimit: c.currentBill,
      creditLimit: c.creditLimit,
      overlimitAmount: c.overlimitAmount,
    }));
  }, [cardSummaries]);

  const statusMeta = {
    overlimit: {
      label: 'Overlimit Aktif',
      textClass: 'text-rose-700 dark:text-rose-400',
      surfaceClass: 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800/70',
      summary: `Pemakaian kredit saat ini melampaui batas limit sebesar ${formatterIDR.format(
        activeScope.totalOverlimit
      )}. Segera lakukan pelunasan minimal agar terhindar dari denda overlimit dan lonjakan bunga.`,
    },
    'rising-risk': {
      label: 'Tren Mendekati Overlimit',
      textClass: 'text-amber-700 dark:text-amber-400',
      surfaceClass: 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/70',
      summary:
        activeScope.estimatedDaysToOverlimit !== null
          ? `Utilisasi berada pada zona waspada (${activeScope.utilizationPct.toFixed(
              1
            )}%) dengan laju pemakaian bersih ${formatterIDR.format(
              Math.max(0, activeScope.dailyBurnRate)
            )}/hari. Tanpa pengendalian belanja, limit berisiko tembus overlimit dalam sekitar ${
              activeScope.estimatedDaysToOverlimit
            } hari.`
          : `Utilisasi mencapai ${activeScope.utilizationPct.toFixed(
              1
            )}% (di atas ambang aman 75%). Batasi pemakaian baru agar ruang limit tetap tersedia.`,
    },
    'recurring-history': {
      label: 'Riwayat Overlimit Terdeteksi',
      textClass: 'text-amber-700 dark:text-amber-400',
      surfaceClass: 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/60',
      summary: `Saat ini saldo berada di bawah limit (${activeScope.utilizationPct.toFixed(
        1
      )}%), namun tercatat ${
        activeScope.relevantEvents.length
      } kejadian menembus batas limit pada riwayat transaksi. Pertahankan batas belanja harian agar pola overlimit tidak berulang.`,
    },
    healthy: {
      label: 'Utilisasi Terkendali',
      textClass: 'text-emerald-700 dark:text-emerald-400',
      surfaceClass: 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/60',
      summary: `Pemakaian kartu kredit dan PayLater berada pada level sehat (${activeScope.utilizationPct.toFixed(
        1
      )}%) tanpa indikasi tren mendekati batas limit.`,
    },
  }[activeScope.riskStatus];

  const handleApplyCap = (category: string, capAmount: number) => {
    if (!onApplyBudgetSuggestion) return;
    onApplyBudgetSuggestion(category, capAmount);
    setAppliedCategories((prev) => (prev.includes(category) ? prev : [...prev, category]));
    showToast({
      type: 'success',
      title: 'Batas Pengeluaran Diterapkan',
      message: `Anggaran kategori "${category}" ditetapkan sebesar ${formatterIDR.format(
        capAmount
      )} untuk menjaga limit kredit tetap aman.`,
    });
  };

  if (creditAccounts.length === 0) {
    return (
      <section className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl shrink-0">
            <CreditCard className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Analisis Tren Overlimit Kartu Kredit & PayLater
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-2xl">
              Tambahkan akun bertipe Kartu Kredit atau PayLater pada menu Master Akun & Rekening untuk memantau grafik utilisasi historis, mendeteksi potensi overlimit lebih dini, dan menghitung batas belanja harian yang aman.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-6">
      {/* Header & Interactive Scope Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div className="flex items-start gap-3">
          <div
            className={`p-2.5 rounded-xl shrink-0 ${
              activeScope.riskStatus === 'overlimit'
                ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
                : activeScope.riskStatus === 'rising-risk' ||
                  activeScope.riskStatus === 'recurring-history'
                ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
            }`}
          >
            {activeScope.riskStatus === 'overlimit' ? (
              <ShieldAlert className="h-5 w-5" />
            ) : activeScope.riskStatus === 'healthy' ? (
              <ShieldCheck className="h-5 w-5" />
            ) : (
              <AlertTriangle className="h-5 w-5" />
            )}
          </div>

          <div className="space-y-1">
            <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
              Overlimit Trend Chart — Analisis 6 Bulan & Kontrol Batas Kredit
            </h3>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
              <span className={`font-semibold ${statusMeta.textClass}`}>{statusMeta.label}</span>
              <span aria-hidden="true">·</span>
              <span>{activeScope.selectedCards.length} Rekening Kredit/PayLater</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                Utilisasi {activeScope.utilizationPct.toFixed(1)}% (Puncak {activeScope.peakPct.toFixed(1)}%)
              </span>
              {activeScope.sixMonthEscalation.isEscalating && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-semibold text-rose-600 dark:text-rose-400">
                    Tren 6 Bulan Meningkat ({activeScope.sixMonthEscalation.utilizationSlopePct >= 0 ? '+' : ''}
                    {activeScope.sixMonthEscalation.utilizationSlopePct.toFixed(1)}%)
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Account & Timeframe Filter Controls */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-x-auto max-w-full">
            <button
              type="button"
              onClick={() => setSelectedAccountId('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap shrink-0 ${
                effectiveAccountId === 'ALL'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Semua Kartu ({creditAccounts.length})
            </button>
            {cardSummaries.map((c) => (
              <button
                key={c.account.id}
                type="button"
                onClick={() => setSelectedAccountId(c.account.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap shrink-0 max-w-[160px] truncate ${
                  effectiveAccountId === c.account.id
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
                title={c.account.name}
              >
                {c.account.name}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
            {([
              { id: '6m', label: '6 Bulan' },
              { id: '30d', label: '30 Hari' },
              { id: '90d', label: '90 Hari' },
              { id: 'all', label: 'Semua' },
            ] as const).map((tf) => (
              <button
                key={tf.id}
                type="button"
                onClick={() => setTimeframe(tf.id)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap shrink-0 ${
                  timeframe === tf.id
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI Strip (4 Metrics) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-1">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block">
            Limit Terpakai Saat Ini
          </span>
          <span
            className={`text-lg font-bold font-mono tabular-nums block ${
              activeScope.totalOverlimit > 0
                ? 'text-rose-600 dark:text-rose-400'
                : 'text-slate-900 dark:text-slate-100'
            }`}
          >
            {formatterIDR.format(activeScope.totalUsed)}
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums block">
            dari Plafon {formatterIDR.format(activeScope.totalLimit)}
          </span>
        </div>

        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-1">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block">
            {activeScope.totalOverlimit > 0 ? 'Selisih Overlimit / Sisa Limit' : 'Sisa Limit Tersedia'}
          </span>
          <span
            className={`text-lg font-bold font-mono tabular-nums block ${
              activeScope.totalRemaining < 0
                ? 'text-rose-600 dark:text-rose-400'
                : activeScope.utilizationPct >= 75
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-emerald-600 dark:text-emerald-400'
            }`}
          >
            {activeScope.totalRemaining < 0
              ? `-${formatterIDR.format(Math.abs(activeScope.totalRemaining))}`
              : formatterIDR.format(activeScope.totalRemaining)}
          </span>
          <span
            className={`text-xs font-medium block ${
              activeScope.totalOverlimit > 0
                ? 'text-rose-600 dark:text-rose-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {activeScope.totalOverlimit > 0
              ? `Melebihi limit ${formatterIDR.format(activeScope.totalOverlimit)}`
              : `Utilisasi ${activeScope.utilizationPct.toFixed(1)}%`}
          </span>
        </div>

        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-1">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block">
            Laju Pemakaian Bersih (30 Hari)
          </span>
          <div className="flex items-center gap-1.5">
            {activeScope.netMonthlyBurn > 0 ? (
              <ArrowUpRight className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" />
            ) : (
              <ArrowDownRight className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            )}
            <span
              className={`text-lg font-bold font-mono tabular-nums ${
                activeScope.netMonthlyBurn > 0
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-emerald-600 dark:text-emerald-400'
              }`}
            >
              {activeScope.netMonthlyBurn > 0 ? '+' : ''}
              {formatterIDR.format(activeScope.netMonthlyBurn)}
            </span>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums block">
            Belanja {formatterIDR.format(activeScope.recent30dSpend)} · Bayar{' '}
            {formatterIDR.format(activeScope.recent30dPayment)}
          </span>
        </div>

        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-1">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block">
            Batas Belanja Harian Aman
          </span>
          <span className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 block">
            {formatterIDR.format(proactivePlan.safeDailySpendingCap)}
            <span className="text-xs font-sans font-medium text-slate-500 dark:text-slate-400">
              {' '}
              / hari
            </span>
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400 block">
            Target utilisasi {targetUtilizationPct}% · Sisa siklus {proactivePlan.daysLeftInCycle} hr
          </span>
        </div>
      </div>

      {/* Proactive Alert & Advisory Banner (includes 6-Month Escalation Detection) */}
      <div
        className={`p-4 rounded-xl border ${
          activeScope.sixMonthEscalation.isEscalating && activeScope.riskStatus === 'healthy'
            ? 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/70'
            : statusMeta.surfaceClass
        } space-y-2`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {activeScope.riskStatus === 'overlimit' ? (
              <ShieldAlert className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" />
            ) : activeScope.sixMonthEscalation.isEscalating || activeScope.riskStatus !== 'healthy' ? (
              <TrendingUp className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            )}
            <span
              className={`text-xs font-bold ${
                activeScope.sixMonthEscalation.isEscalating && activeScope.riskStatus === 'healthy'
                  ? 'text-amber-700 dark:text-amber-400'
                  : statusMeta.textClass
              }`}
            >
              Diagnosis Proaktif (6 Bulan): {statusMeta.label}
              {activeScope.sixMonthEscalation.isEscalating ? ' · Tren Overlimit Meningkat' : ''}
            </span>
          </div>

          <span className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300">
            {activeScope.sixMonthEscalation.monthsWithOverlimit6Mo} dari 6 bln menyentuh overlimit ·{' '}
            {activeScope.relevantEvents.length} kejadian
          </span>
        </div>
        <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
          {statusMeta.summary}
        </p>
        {activeScope.sixMonthEscalation.isEscalating && (
          <p className="text-xs text-rose-700 dark:text-rose-300 font-medium leading-relaxed pt-1 border-t border-rose-200/70 dark:border-rose-800/50">
            Peringatan Eskalasi 6 Bulan: Rata-rata utilisasi puncak 3 bulan terakhir ({activeScope.sixMonthEscalation.secondHalfAvgUtilPct.toFixed(1)}%) naik{' '}
            <strong className="font-mono tabular-nums">
              +{Math.max(0, activeScope.sixMonthEscalation.utilizationSlopePct).toFixed(1)}%
            </strong>{' '}
            dibanding 3 bulan sebelumnya ({activeScope.sixMonthEscalation.firstHalfAvgUtilPct.toFixed(1)}%). Saran proaktif: tetapkan batas belanja kredit bulanan maksimal{' '}
            <strong className="font-mono tabular-nums">
              {formatterIDR.format(
                Math.max(
                  0,
                  Math.round(
                    Math.min(
                      activeScope.totalLimit * (targetUtilizationPct / 100),
                      Math.max(activeScope.recent30dPayment * 0.85, activeScope.totalLimit * 0.25)
                    )
                  )
                )
              )}
            </strong>{' '}
            dan hentikan cicilan/pembelian konsumtif baru hingga rasio turun di bawah {targetUtilizationPct}%.
          </p>
        )}
      </div>

      {/* Main Visual Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Primary Visual Anchor: 6-Month Overlimit Trend Chart or Daily Utilization Line Chart */}
        <div className="lg:col-span-8 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {timeframe === '6m'
                  ? 'Overlimit Trend Chart (6 Bulan Terakhir)'
                  : 'Grafik Tren Utilisasi Kredit & Ambang Overlimit'}
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {timeframe === '6m'
                  ? 'Batang menunjukkan puncak utilisasi bulanan dan garis menunjukkan posisi akhir bulan terhadap batas 100%.'
                  : 'Garis merah menandai batas plafon 100% (Overlimit) dan garis kuning menandai peringatan dini 80%.'}
              </p>
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setChartMetric('pct')}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition cursor-pointer whitespace-nowrap shrink-0 ${
                  chartMetric === 'pct'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Utilisasi (%)
              </button>
              <button
                type="button"
                onClick={() => setChartMetric('idr')}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition cursor-pointer whitespace-nowrap shrink-0 ${
                  chartMetric === 'idr'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Nominal (Rp)
              </button>
            </div>
          </div>

          <div className="h-[290px] w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              {timeframe === '6m' ? (
                <ComposedChart
                  data={activeScope.monthly6MoData}
                  margin={{ top: 14, right: 18, left: 4, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" opacity={0.45} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={{ stroke: '#cbd5e1' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                    domain={
                      chartMetric === 'pct'
                        ? [0, Math.max(115, Math.ceil(activeScope.peakPct / 10) * 10 + 10)]
                        : [0, 'auto']
                    }
                    tickFormatter={(v) =>
                      chartMetric === 'pct'
                        ? `${v}%`
                        : v >= 1_000_000
                        ? `${(v / 1_000_000).toFixed(1)}jt`
                        : `${Math.round(v / 1000)}rb`
                    }
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || payload.length === 0) return null;
                      const pt = payload[0].payload as MonthlyTrendBucket;
                      const isOver = pt.peakUtilizationPct > 100 || pt.overlimitAmount > 0;
                      const isWarn = !isOver && pt.peakUtilizationPct >= 80;
                      return (
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 shadow-md text-xs space-y-1.5 min-w-[230px]">
                          <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-1.5">
                            <span className="font-bold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
                              {pt.label} ({pt.monthKey})
                            </span>
                            <span
                              className={`font-semibold ${
                                isOver
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : isWarn
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-emerald-600 dark:text-emerald-400'
                              }`}
                            >
                              {isOver ? 'Overlimit' : isWarn ? 'Waspada' : 'Aman'}
                            </span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span className="text-slate-500 dark:text-slate-400">Puncak Utilisasi</span>
                            <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100">
                              {pt.peakUtilizationPct.toFixed(1)}% ({formatterIDR.format(pt.peakUsedLimit)})
                            </span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span className="text-slate-500 dark:text-slate-400">Akhir Bulan</span>
                            <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
                              {pt.endUtilizationPct.toFixed(1)}% ({formatterIDR.format(pt.endUsedLimit)})
                            </span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span className="text-slate-500 dark:text-slate-400">Belanja / Bayar</span>
                            <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
                              +{formatterIDR.format(pt.monthlySpend)} / -{formatterIDR.format(pt.monthlyPayment)}
                            </span>
                          </div>
                          {pt.overlimitAmount > 0 && (
                            <div className="flex justify-between gap-4 text-rose-600 dark:text-rose-400 font-semibold pt-1 border-t border-slate-100 dark:border-slate-800">
                              <span>Puncak Kelebihan Limit</span>
                              <span className="font-mono tabular-nums">
                                +{formatterIDR.format(pt.overlimitAmount)}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    }}
                  />
                  {chartMetric === 'pct' ? (
                    <>
                      <ReferenceLine
                        y={100}
                        stroke="#dc2626"
                        strokeDasharray="5 4"
                        strokeWidth={1.75}
                        label={{
                          value: '100% Batas Overlimit',
                          position: 'insideTopRight',
                          fill: '#dc2626',
                          fontSize: 10,
                          fontWeight: 600,
                        }}
                      />
                      <ReferenceLine
                        y={80}
                        stroke="#d97706"
                        strokeDasharray="4 4"
                        strokeWidth={1.25}
                        label={{
                          value: '80% Peringatan',
                          position: 'insideBottomRight',
                          fill: '#d97706',
                          fontSize: 10,
                          fontWeight: 600,
                        }}
                      />
                      <Bar dataKey="peakUtilizationPct" name="Puncak Bulanan (%)" radius={[6, 6, 0, 0]} maxBarSize={42}>
                        {activeScope.monthly6MoData.map((entry) => (
                          <Cell
                            key={entry.monthKey}
                            fill={
                              entry.peakUtilizationPct > 100
                                ? '#dc2626'
                                : entry.peakUtilizationPct >= 80
                                ? '#d97706'
                                : '#334155'
                            }
                          />
                        ))}
                      </Bar>
                      <Line
                        type="monotone"
                        dataKey="endUtilizationPct"
                        name="Utilisasi Akhir Bulan (%)"
                        stroke="#2563eb"
                        strokeWidth={2.25}
                        dot={{ r: 3.5, fill: '#2563eb', stroke: '#ffffff', strokeWidth: 1.5 }}
                      />
                    </>
                  ) : (
                    <>
                      {activeScope.totalLimit > 0 && (
                        <ReferenceLine
                          y={activeScope.totalLimit}
                          stroke="#dc2626"
                          strokeDasharray="5 4"
                          strokeWidth={1.75}
                          label={{
                            value: 'Plafon Maksimum',
                            position: 'insideTopRight',
                            fill: '#dc2626',
                            fontSize: 10,
                            fontWeight: 600,
                          }}
                        />
                      )}
                      {activeScope.totalLimit > 0 && (
                        <ReferenceLine
                          y={Math.round(activeScope.totalLimit * 0.8)}
                          stroke="#d97706"
                          strokeDasharray="4 4"
                          strokeWidth={1.25}
                        />
                      )}
                      <Bar dataKey="peakUsedLimit" name="Puncak Pemakaian (Rp)" radius={[6, 6, 0, 0]} maxBarSize={42}>
                        {activeScope.monthly6MoData.map((entry) => (
                          <Cell
                            key={entry.monthKey}
                            fill={
                              entry.peakUtilizationPct > 100
                                ? '#dc2626'
                                : entry.peakUtilizationPct >= 80
                                ? '#d97706'
                                : '#334155'
                            }
                          />
                        ))}
                      </Bar>
                      <Line
                        type="monotone"
                        dataKey="endUsedLimit"
                        name="Saldo Terpakai Akhir Bulan (Rp)"
                        stroke="#2563eb"
                        strokeWidth={2.25}
                        dot={{ r: 3.5, fill: '#2563eb', stroke: '#ffffff', strokeWidth: 1.5 }}
                      />
                    </>
                  )}
                </ComposedChart>
              ) : (
                <ComposedChart
                  data={activeScope.chartData}
                  margin={{ top: 12, right: 18, left: 4, bottom: 4 }}
                >
                  <defs>
                    <linearGradient id="creditUtilGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#dc2626" stopOpacity={0.28} />
                      <stop offset="55%" stopColor="#d97706" stopOpacity={0.14} />
                      <stop offset="95%" stopColor="#0f172a" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" opacity={0.45} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={{ stroke: '#cbd5e1' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                    domain={
                      chartMetric === 'pct'
                        ? [0, Math.max(115, Math.ceil(activeScope.peakPct / 10) * 10 + 10)]
                        : [0, 'auto']
                    }
                    tickFormatter={(v) =>
                      chartMetric === 'pct'
                        ? `${v}%`
                        : v >= 1_000_000
                        ? `${(v / 1_000_000).toFixed(1)}jt`
                        : `${Math.round(v / 1000)}rb`
                    }
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || payload.length === 0) return null;
                      const pt = payload[0].payload as TimelinePoint;
                      const isOver = pt.utilizationPct > 100 || pt.overlimitAmount > 0;
                      const isWarn = !isOver && pt.utilizationPct >= 80;
                      return (
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 shadow-md text-xs space-y-1.5 min-w-[210px]">
                          <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-1.5">
                            <span className="font-bold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
                              {pt.date}
                            </span>
                            <span
                              className={`font-semibold ${
                                isOver
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : isWarn
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-emerald-600 dark:text-emerald-400'
                              }`}
                            >
                              {isOver ? 'Overlimit' : isWarn ? 'Waspada' : 'Aman'}
                            </span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span className="text-slate-500 dark:text-slate-400">Terpakai</span>
                            <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100">
                              {formatterIDR.format(pt.usedLimit)}
                            </span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span className="text-slate-500 dark:text-slate-400">Plafon Limit</span>
                            <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
                              {formatterIDR.format(pt.creditLimit)}
                            </span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span className="text-slate-500 dark:text-slate-400">Utilisasi</span>
                            <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100">
                              {pt.utilizationPct.toFixed(1)}%
                            </span>
                          </div>
                          {pt.overlimitAmount > 0 && (
                            <div className="flex justify-between gap-4 text-rose-600 dark:text-rose-400 font-semibold pt-1 border-t border-slate-100 dark:border-slate-800">
                              <span>Kelebihan Limit</span>
                              <span className="font-mono tabular-nums">
                                +{formatterIDR.format(pt.overlimitAmount)}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    }}
                  />
                  {chartMetric === 'pct' ? (
                    <>
                      <ReferenceLine
                        y={100}
                        stroke="#dc2626"
                        strokeDasharray="5 4"
                        strokeWidth={1.75}
                        label={{
                          value: '100% Batas Overlimit',
                          position: 'insideTopRight',
                          fill: '#dc2626',
                          fontSize: 10,
                          fontWeight: 600,
                        }}
                      />
                      <ReferenceLine
                        y={80}
                        stroke="#d97706"
                        strokeDasharray="4 4"
                        strokeWidth={1.25}
                        label={{
                          value: '80% Peringatan',
                          position: 'insideBottomRight',
                          fill: '#d97706',
                          fontSize: 10,
                          fontWeight: 600,
                        }}
                      />
                      {targetUtilizationPct < 80 && (
                        <ReferenceLine
                          y={targetUtilizationPct}
                          stroke="#16a34a"
                          strokeDasharray="3 3"
                          strokeWidth={1.25}
                        />
                      )}
                      <Area
                        type="monotone"
                        dataKey="utilizationPct"
                        name="Utilisasi (%)"
                        stroke="#dc2626"
                        strokeWidth={2.25}
                        fill="url(#creditUtilGradient)"
                        activeDot={{ r: 5, fill: '#dc2626', stroke: '#ffffff', strokeWidth: 2 }}
                      />
                    </>
                  ) : (
                    <>
                      {activeScope.totalLimit > 0 && (
                        <ReferenceLine
                          y={activeScope.totalLimit}
                          stroke="#dc2626"
                          strokeDasharray="5 4"
                          strokeWidth={1.75}
                          label={{
                            value: 'Plafon Maksimum',
                            position: 'insideTopRight',
                            fill: '#dc2626',
                            fontSize: 10,
                            fontWeight: 600,
                          }}
                        />
                      )}
                      {activeScope.totalLimit > 0 && (
                        <ReferenceLine
                          y={Math.round(activeScope.totalLimit * 0.8)}
                          stroke="#d97706"
                          strokeDasharray="4 4"
                          strokeWidth={1.25}
                        />
                      )}
                      <Area
                        type="monotone"
                        dataKey="usedLimit"
                        name="Pemakaian (Rp)"
                        stroke="#dc2626"
                        strokeWidth={2.25}
                        fill="url(#creditUtilGradient)"
                        activeDot={{ r: 5, fill: '#dc2626', stroke: '#ffffff', strokeWidth: 2 }}
                      />
                    </>
                  )}
                </ComposedChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>

        {/* Secondary Visual: Card Comparison Bar Chart + Target Selector */}
        <div className="lg:col-span-4 space-y-4 border-t lg:border-t-0 lg:border-l border-slate-200 dark:border-slate-800 pt-4 lg:pt-0 lg:pl-6">
          <div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Perbandingan Utilisasi per Akun
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Utilisasi saat ini dibandingkan rekor puncak historis (%).
            </p>
          </div>

          <div className="h-[180px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={cardComparisonData}
                layout="vertical"
                margin={{ top: 4, right: 16, left: 0, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" opacity={0.35} horizontal={false} />
                <XAxis
                  type="number"
                  domain={[0, Math.max(120, Math.ceil(activeScope.peakPct / 10) * 10)]}
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  tickFormatter={(v) => `${v}%`}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={95}
                  tick={{ fontSize: 11, fill: '#475569' }}
                />
                <Tooltip
                  formatter={(value: unknown, name: unknown) => [
                    `${Number(value || 0).toFixed(1)}%`,
                    name === 'currentPct' ? 'Saat Ini' : 'Puncak Historis',
                  ]}
                />
                <ReferenceLine x={100} stroke="#dc2626" strokeDasharray="4 3" />
                <Bar dataKey="peakPct" name="Puncak Historis" fill="#cbd5e1" radius={[0, 4, 4, 0]} barSize={10} />
                <Bar dataKey="currentPct" name="Saat Ini" fill="#dc2626" radius={[0, 4, 4, 0]} barSize={10} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Interactive Proactive Target Utilization Control */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Simulasi Target Utilisasi Aman
              </span>
              <span className="text-xs font-mono tabular-nums font-bold text-emerald-700 dark:text-emerald-400">
                {targetUtilizationPct}%
              </span>
            </div>

            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
              {([
                { val: 30, label: '30% Ideal' },
                { val: 50, label: '50% Moderat' },
                { val: 80, label: '80% Maks' },
              ] as const).map((opt) => (
                <button
                  key={opt.val}
                  type="button"
                  onClick={() => setTargetUtilizationPct(opt.val)}
                  className={`py-1.5 px-2 rounded-md text-xs font-semibold transition cursor-pointer whitespace-nowrap shrink-0 ${
                    targetUtilizationPct === opt.val
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="space-y-1.5 text-xs pt-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500 dark:text-slate-400">Plafon Target ({targetUtilizationPct}%)</span>
                <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100">
                  {formatterIDR.format(proactivePlan.targetCeiling)}
                </span>
              </div>
              {proactivePlan.repaymentNeededForTarget > 0 ? (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-rose-600 dark:text-rose-400 font-medium">
                    Pelunasan Menuju Target
                  </span>
                  <span className="font-mono tabular-nums font-bold text-rose-600 dark:text-rose-400">
                    {formatterIDR.format(proactivePlan.repaymentNeededForTarget)}
                  </span>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                    Batas Belanja Mingguan Aman
                  </span>
                  <span className="font-mono tabular-nums font-bold text-emerald-700 dark:text-emerald-400">
                    {formatterIDR.format(proactivePlan.safeWeeklySpendingCap)}
                  </span>
                </div>
              )}
              {proactivePlan.repaymentToExitOverlimit > 0 && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-rose-700 dark:text-rose-400 font-semibold">
                    Wajib Bayar Bebas Overlimit
                  </span>
                  <span className="font-mono tabular-nums font-bold text-rose-700 dark:text-rose-400">
                    {formatterIDR.format(proactivePlan.repaymentToExitOverlimit)}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Per-Card Risk & Proactive Action Matrix */}
      <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Rincian Risiko & Rekomendasi Batas Pengeluaran per Kartu
          </h4>
          <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {cardSummaries.length} Akun Dipantau
          </span>
        </div>

        <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 font-semibold">
              <tr>
                <th className="py-2.5 px-3">Rekening</th>
                <th className="py-2.5 px-3 text-right">Terpakai / Plafon</th>
                <th className="py-2.5 px-3 text-right">Sisa Limit</th>
                <th className="py-2.5 px-3 text-right">Utilisasi (Puncak)</th>
                <th className="py-2.5 px-3">Status & Proyeksi</th>
                <th className="py-2.5 px-3">Saran Proaktif</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {cardSummaries.map((card) => {
                const targetCeiling = card.creditLimit * (targetUtilizationPct / 100);
                const payTarget = Math.max(0, card.currentBill - targetCeiling);
                const safeHeadroom = Math.max(0, targetCeiling - card.currentBill);

                return (
                  <tr key={card.account.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition">
                    <td className="py-3 px-3">
                      <div className="font-bold text-slate-900 dark:text-slate-100">{card.account.name}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {card.accountTypeLabel}
                        {card.account.dueDay ? ` · Jatuh tempo tgl ${card.account.dueDay}` : ''}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums">
                      <div className="font-bold text-slate-900 dark:text-slate-100">
                        {formatterIDR.format(card.currentBill)}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        / {formatterIDR.format(card.creditLimit)}
                      </div>
                    </td>
                    <td
                      className={`py-3 px-3 text-right font-mono tabular-nums font-bold ${
                        card.remainingLimit < 0
                          ? 'text-rose-600 dark:text-rose-400'
                          : card.utilizationPct >= 75
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      {card.remainingLimit < 0
                        ? `-${formatterIDR.format(Math.abs(card.remainingLimit))}`
                        : formatterIDR.format(card.remainingLimit)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums">
                      <span
                        className={`font-bold ${
                          card.utilizationPct > 100
                            ? 'text-rose-600 dark:text-rose-400'
                            : card.utilizationPct >= 75
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        {card.utilizationPct.toFixed(1)}%
                      </span>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        Puncak {card.peakUtilizationPct.toFixed(0)}%
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      {card.riskStatus === 'overlimit' ? (
                        <div className="text-rose-600 dark:text-rose-400 font-semibold">
                          Overlimit {formatterIDR.format(card.overlimitAmount)}
                        </div>
                      ) : card.riskStatus === 'rising-risk' ? (
                        <div className="text-amber-600 dark:text-amber-400 font-semibold">
                          {card.estimatedDaysToOverlimit !== null
                            ? `Berisiko tembus ~${card.estimatedDaysToOverlimit} hari lagi`
                            : 'Mendekati batas limit'}
                        </div>
                      ) : card.riskStatus === 'recurring-history' ? (
                        <div className="text-amber-600 dark:text-amber-400 font-semibold">
                          Pernah overlimit ({card.overlimitEventsCount}x)
                        </div>
                      ) : (
                        <div className="text-emerald-600 dark:text-emerald-400 font-semibold">
                          Terkendali
                        </div>
                      )}
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                        30h: +{formatterIDR.format(card.recent30dSpend)}
                      </div>
                    </td>
                    <td className="py-3 px-3 max-w-[260px]">
                      {card.overlimitAmount > 0 ? (
                        <span className="text-slate-700 dark:text-slate-300 leading-snug block">
                          Bekukan pemakaian baru dan bayar minimal{' '}
                          <strong className="font-mono tabular-nums text-rose-600 dark:text-rose-400">
                            {formatterIDR.format(card.overlimitAmount)}
                          </strong>{' '}
                          (atau{' '}
                          <strong className="font-mono tabular-nums">
                            {formatterIDR.format(payTarget)}
                          </strong>{' '}
                          untuk target {targetUtilizationPct}%).
                        </span>
                      ) : payTarget > 0 ? (
                        <span className="text-slate-700 dark:text-slate-300 leading-snug block">
                          Kurangi saldo terpakai sebesar{' '}
                          <strong className="font-mono tabular-nums text-amber-700 dark:text-amber-400">
                            {formatterIDR.format(payTarget)}
                          </strong>{' '}
                          agar kembali ke zona aman {targetUtilizationPct}%.
                        </span>
                      ) : (
                        <span className="text-slate-700 dark:text-slate-300 leading-snug block">
                          Batasi belanja kredit maksimal{' '}
                          <strong className="font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                            {formatterIDR.format(safeHeadroom)}
                          </strong>{' '}
                          hingga siklus tagihan berikutnya.
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top Credit Spending Drivers + Proactive Category Budget Cap Suggestions */}
      {topCreditCategories.length > 0 && (
        <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Kategori Pemicu Pemakaian Kredit & Usulan Batas Anggaran Proaktif
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Terapkan batas anggaran bulanan pada kategori utama agar pemakaian kartu kredit & PayLater tidak kembali mendekati limit.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {topCreditCategories.map((item) => {
              const isApplied = appliedCategories.includes(item.category);
              return (
                <div
                  key={item.category}
                  className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-bold text-slate-900 dark:text-slate-100">
                        {item.category}
                      </span>
                      <span aria-hidden="true" className="text-slate-400">
                        ·
                      </span>
                      <span className="text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                        {item.sharePct.toFixed(0)}% porsi ({item.txCount}x)
                      </span>
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-300 font-mono tabular-nums">
                      Total Kredit: <strong>{formatterIDR.format(item.totalSpend)}</strong>
                      <span aria-hidden="true" className="mx-1.5 text-slate-400">
                        ·
                      </span>
                      Saran Batas:{' '}
                      <strong className="text-emerald-700 dark:text-emerald-400">
                        {formatterIDR.format(item.suggestedCap)}/bln
                      </strong>
                    </div>
                    {item.currentBudgetLimit > 0 && (
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                        Anggaran aktif saat ini: {formatterIDR.format(item.currentBudgetLimit)}
                      </div>
                    )}
                  </div>

                  {onApplyBudgetSuggestion && (
                    <button
                      type="button"
                      onClick={() => handleApplyCap(item.category, item.suggestedCap)}
                      disabled={isApplied}
                      className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap shrink-0 ${
                        isApplied
                          ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 cursor-default'
                          : 'bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white text-white dark:text-slate-900'
                      }`}
                    >
                      {isApplied ? 'Batas Diterapkan' : 'Terapkan Batas'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Historical Overlimit Events Log (if any) */}
      {activeScope.relevantEvents.length > 0 && (
        <div className="space-y-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
          <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300">
            Riwayat Kejadian Menembus Batas Limit ({activeScope.relevantEvents.length})
          </h4>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            {activeScope.relevantEvents.slice(0, 5).map((ev, idx) => (
              <div
                key={`${ev.accountId}-${ev.date}-${idx}`}
                className="px-3.5 py-2.5 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-2 text-xs"
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100">
                    {ev.date}
                  </span>
                  <span aria-hidden="true" className="text-slate-400">
                    ·
                  </span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {ev.accountName}
                  </span>
                  <span aria-hidden="true" className="text-slate-400">
                    ·
                  </span>
                  <span className="text-slate-500 dark:text-slate-400">
                    Pemicu: {ev.triggerCategory}
                  </span>
                </div>
                <div className="font-mono tabular-nums font-bold text-rose-600 dark:text-rose-400">
                  +{formatterIDR.format(ev.overlimitAmount)} ({ev.utilizationPct.toFixed(1)}%)
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};

export const OverlimitTrendChart = CreditOverlimitTrendAnalyzer;
