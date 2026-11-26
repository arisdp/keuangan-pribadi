import {
  CategoryNode,
  DEFAULT_CATEGORY_HIERARCHY,
  flattenCategoryHierarchy,
} from '../categoryHierarchy';
import { Account, CategoryBudget, Transaction } from '../types';
import {
  isOperatingExpense,
  normalizeLedgerDateYYYYMMDD,
  toLocalYYYYMMDD,
} from './accountingEngine';
import { formatterIDR } from './formatters';

export interface TriggerTransactionItem {
  tx: Transaction;
  normalizedDate: string;
  absAmount: number;
  accountName: string;
  isDefaultTrigger: boolean;
}

export interface DetectedCategoryAnomaly {
  anomalyKey: string;
  category: string;
  currentMonthAmount: number;
  threeMonthAvgAmount: number;
  increasePct: number;
  excessAmount: number;
  budgetLimit: number;
  triggers: TriggerTransactionItem[];
  recommendedTarget: string;
  recommendationReason: string;
}

export interface AnomalyDateRangeFilter {
  startDate: string; // YYYY-MM-DD inclusive
  endDate: string; // YYYY-MM-DD inclusive
  label?: string;
}

export interface CategoryAnomalyDetectionResult {
  referenceYM: string;
  periodLabel: string;
  baselineLabel: string;
  isMultiMonthNormalized: boolean;
  anomalies: DetectedCategoryAnomaly[];
}

export type AnomalySeverityLevel = 'none' | 'elevated' | 'severe';

export interface CategoryAnomalyTimelinePoint {
  idx: number;
  ym: string;
  monthLabel: string;
  totalSpending: number;
  totalBudget: number;
  maxSpikePct: number;
  anomalyCount: number;
  spikingCategories: string[];
  severityLevel: AnomalySeverityLevel;
  severityLabel: string;
  categoryAmounts: Record<string, number>;
  categorySpikePct: Record<string, number>;
}

export interface TopAnomalyCategoryMeta {
  category: string;
  color: string;
  spikeMonthsCount: number;
  peakSpikePct: number;
  totalExcessAmount: number;
  latestAmount: number;
}

export interface CategoryAnomalyTimelineResult {
  months: string[];
  topCategories: TopAnomalyCategoryMeta[];
  totalMonthlyBudget: number;
  series: CategoryAnomalyTimelinePoint[];
  severeMonthsCount: number;
  elevatedMonthsCount: number;
}

const MONTHS_SHORT_ID = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
];

const TREND_LINE_COLORS = [
  '#2563eb', // Blue
  '#dc2626', // Crimson
  '#d97706', // Amber
  '#0d9488', // Teal
  '#4f46e5', // Indigo
];

const KEYWORD_CATEGORY_RULES: Array<{ pattern: RegExp; candidates: string[] }> = [
  {
    pattern: /listrik|pln|pdam|air|wifi|internet|indihome|biznet|pulsa|paket data|telkom/i,
    candidates: ['Utilitas & Tagihan', 'Tagihan & Utilitas'],
  },
  {
    pattern: /bensin|pertamina|shell|bp|tol|parkir|gojek|grab|maxim|kereta|krl|mrt|ojol/i,
    candidates: ['Transportasi'],
  },
  {
    pattern: /tokopedia|shopee|lazada|blibli|tiktok shop|paket|ongkir/i,
    candidates: ['Belanja Online', 'Belanja Bulanan'],
  },
  {
    pattern: /supermarket|alfamart|indomaret|superindo|hypermart|sembako|beras|sabun|dapur/i,
    candidates: ['Belanja Bulanan', 'Kebutuhan Pokok'],
  },
  {
    pattern: /apotek|dokter|klinik|rumah sakit|rs|obat|medical|lab|vitamin|bpjs/i,
    candidates: ['Kesehatan', 'Biaya Tes Kesehatan', 'Biaya Perawatan Tubuh'],
  },
  {
    pattern: /netflix|spotify|youtube|bioskop|xxi|cgv|steam|game|konser|tiket/i,
    candidates: ['Hiburan'],
  },
  {
    pattern: /kopi|cafe|resto|warung|makan|gofood|grabfood|shopeefood|lunch|dinner/i,
    candidates: ['Makanan'],
  },
  {
    pattern: /zakat|infak|sedekah|donasi|sumbangan|sosial/i,
    candidates: ['Sosial'],
  },
  {
    pattern: /buku|kursus|sekolah|kuliah|les|seminar|pelatihan/i,
    candidates: ['Pendidikan'],
  },
];

export function formatAnomalyMonthLabelID(ym: string): string {
  const [yStr, mStr] = ym.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return ym;
  return `${MONTHS_SHORT_ID[m - 1]} ${y}`;
}

export function formatAnomalyDateShortID(ymd: string): string {
  const parts = ymd.split('-');
  if (parts.length !== 3) return ymd;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d) || m < 1 || m > 12) {
    return ymd;
  }
  return `${String(d).padStart(2, '0')} ${MONTHS_SHORT_ID[m - 1]} ${y}`;
}

function shiftMonthYYYYMM(baseYM: string, deltaMonths: number): string {
  const [yStr, mStr] = baseYM.split('-');
  const baseDate = new Date(Number(yStr), Number(mStr) - 1 + deltaMonths, 1);
  return `${baseDate.getFullYear()}-${String(baseDate.getMonth() + 1).padStart(2, '0')}`;
}

function getLastDayOfMonthYYYYMMDD(ym: string): string {
  const [yStr, mStr] = ym.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return `${ym}-28`;
  const lastDay = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

export function getMonthDateRange(ym: string): AnomalyDateRangeFilter {
  return {
    startDate: `${ym}-01`,
    endDate: getLastDayOfMonthYYYYMMDD(ym),
    label: formatAnomalyMonthLabelID(ym),
  };
}

export function getQuarterDateRange(
  year: number,
  quarter: 1 | 2 | 3 | 4
): AnomalyDateRangeFilter {
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  const startYM = `${year}-${String(startMonth).padStart(2, '0')}`;
  const endYM = `${year}-${String(endMonth).padStart(2, '0')}`;
  return {
    startDate: `${startYM}-01`,
    endDate: getLastDayOfMonthYYYYMMDD(endYM),
    label: `Q${quarter} ${year} (${MONTHS_SHORT_ID[startMonth - 1]}–${MONTHS_SHORT_ID[endMonth - 1]})`,
  };
}

export function getAvailableExpenseMonths(transactions: Transaction[]): string[] {
  const set = new Set<string>();
  transactions.forEach((tx) => {
    if (!isOperatingExpense(tx) || tx.amount <= 0) return;
    const normalizedDate = normalizeLedgerDateYYYYMMDD(tx.date);
    if (!normalizedDate) return;
    set.add(normalizedDate.slice(0, 7));
  });
  return Array.from(set).sort();
}

export function getMasterExpenseCategoryNames(
  budgets: CategoryBudget[],
  masterCategories: CategoryNode[] = []
): string[] {
  const hierarchy =
    masterCategories && masterCategories.length > 0
      ? masterCategories
      : DEFAULT_CATEGORY_HIERARCHY;
  const flat = flattenCategoryHierarchy(hierarchy);
  const items = flat
    .filter((n) => n.type === 'item' && n.transactionType === 'expense')
    .map((n) => n.name.trim())
    .filter(Boolean);
  const budgetCats = budgets
    .filter((b) => b.type === 'expense')
    .map((b) => b.category.trim())
    .filter(Boolean);
  return Array.from(new Set([...budgetCats, ...items]));
}

function computeMonthSpanForDateRange(startDate: string, endDate: string): {
  monthSpan: number;
  isMultiMonthNormalized: boolean;
} {
  const startYM = startDate.slice(0, 7);
  const endYM = endDate.slice(0, 7);

  if (startYM === endYM) {
    return { monthSpan: 1, isMultiMonthNormalized: false };
  }

  const [sy, sm] = startYM.split('-').map(Number);
  const [ey, em] = endYM.split('-').map(Number);
  const startIsFirstDay = startDate.endsWith('-01');
  const endIsLastDay = endDate === getLastDayOfMonthYYYYMMDD(endYM);

  if (startIsFirstDay && endIsLastDay && Number.isFinite(sy) && Number.isFinite(ey)) {
    const wholeMonths = Math.max(1, (ey - sy) * 12 + (em - sm) + 1);
    return { monthSpan: wholeMonths, isMultiMonthNormalized: wholeMonths > 1 };
  }

  const sDt = new Date(`${startDate}T00:00:00`);
  const eDt = new Date(`${endDate}T00:00:00`);
  const daySpan = Math.max(
    1,
    Math.round((eDt.getTime() - sDt.getTime()) / (1000 * 60 * 60 * 24)) + 1
  );
  if (daySpan <= 31) {
    return { monthSpan: 1, isMultiMonthNormalized: false };
  }
  return {
    monthSpan: Math.max(1, daySpan / 30.4375),
    isMultiMonthNormalized: true,
  };
}

export function detectCategorySpendingAnomalies(params: {
  transactions: Transaction[];
  budgets: CategoryBudget[];
  accounts?: Account[];
  masterCategories?: CategoryNode[];
  dateRange?: AnomalyDateRangeFilter | null;
}): CategoryAnomalyDetectionResult {
  const { transactions, budgets, accounts = [], masterCategories = [], dateRange } = params;

  const accountNameMap = new Map<string, string>();
  accounts.forEach((acc) => accountNameMap.set(acc.id, acc.name));

  const masterExpenseCategories = getMasterExpenseCategoryNames(budgets, masterCategories);

  const calendarYM = toLocalYYYYMMDD().slice(0, 7);
  const expenseTxs = transactions.filter((tx) => isOperatingExpense(tx) && tx.amount > 0);
  if (expenseTxs.length === 0) {
    return {
      referenceYM: calendarYM,
      periodLabel: dateRange?.label || formatAnomalyMonthLabelID(calendarYM),
      baselineLabel: 'Rata-rata 3 bln sebelumnya',
      isMultiMonthNormalized: false,
      anomalies: [],
    };
  }

  const monthlyTotalsByCategory = new Map<string, Map<string, number>>();
  const monthlyTxsByCategory = new Map<string, Map<string, TriggerTransactionItem[]>>();
  const periodTotalsByCategory = new Map<string, number>();
  const periodTxsByCategory = new Map<string, TriggerTransactionItem[]>();
  let latestAvailableYM = '';

  const hasValidDateRange = Boolean(
    dateRange &&
      dateRange.startDate &&
      dateRange.endDate &&
      dateRange.startDate <= dateRange.endDate
  );

  expenseTxs.forEach((tx) => {
    const normalizedDate = normalizeLedgerDateYYYYMMDD(tx.date);
    if (!normalizedDate) return;
    const ym = normalizedDate.slice(0, 7);
    if (!latestAvailableYM || ym > latestAvailableYM) {
      latestAvailableYM = ym;
    }

    const rawCat = (tx.category || '').trim();
    const cat = rawCat && rawCat !== '-' ? rawCat : 'Tanpa Kategori';
    const absAmount = Math.abs(tx.amount || 0);

    let catTotals = monthlyTotalsByCategory.get(cat);
    if (!catTotals) {
      catTotals = new Map<string, number>();
      monthlyTotalsByCategory.set(cat, catTotals);
    }
    catTotals.set(ym, (catTotals.get(ym) || 0) + absAmount);

    const txItem: TriggerTransactionItem = {
      tx,
      normalizedDate,
      absAmount,
      accountName: accountNameMap.get(tx.accountId) || 'Akun Lainnya',
      isDefaultTrigger: false,
    };

    let catTxs = monthlyTxsByCategory.get(cat);
    if (!catTxs) {
      catTxs = new Map<string, TriggerTransactionItem[]>();
      monthlyTxsByCategory.set(cat, catTxs);
    }
    const list = catTxs.get(ym) || [];
    list.push(txItem);
    catTxs.set(ym, list);

    if (
      hasValidDateRange &&
      normalizedDate >= dateRange!.startDate &&
      normalizedDate <= dateRange!.endDate
    ) {
      periodTotalsByCategory.set(cat, (periodTotalsByCategory.get(cat) || 0) + absAmount);
      const pList = periodTxsByCategory.get(cat) || [];
      pList.push({ ...txItem });
      periodTxsByCategory.set(cat, pList);
    }
  });

  const hasCurrentMonthData = Array.from(monthlyTotalsByCategory.values()).some(
    (m) => (m.get(calendarYM) || 0) > 0
  );
  const fallbackEvalYM = hasCurrentMonthData ? calendarYM : latestAvailableYM || calendarYM;
  const evalYM = hasValidDateRange ? dateRange!.endDate.slice(0, 7) : fallbackEvalYM;
  const baselineAnchorYM = hasValidDateRange ? dateRange!.startDate.slice(0, 7) : evalYM;

  const prevThreeMonths = [
    shiftMonthYYYYMM(baselineAnchorYM, -1),
    shiftMonthYYYYMM(baselineAnchorYM, -2),
    shiftMonthYYYYMM(baselineAnchorYM, -3),
  ];

  const { monthSpan, isMultiMonthNormalized } = hasValidDateRange
    ? computeMonthSpanForDateRange(dateRange!.startDate, dateRange!.endDate)
    : { monthSpan: 1, isMultiMonthNormalized: false };

  const periodLabel = hasValidDateRange
    ? dateRange!.label ||
      `${formatAnomalyDateShortID(dateRange!.startDate)} – ${formatAnomalyDateShortID(
        dateRange!.endDate
      )}`
    : formatAnomalyMonthLabelID(evalYM);

  const baselineLabel = `Rata-rata ${formatAnomalyMonthLabelID(
    prevThreeMonths[2]
  )}–${formatAnomalyMonthLabelID(prevThreeMonths[0])}`;

  const budgetLimitMap = new Map<
    string,
    { displayName: string; limit: number; spent: number }
  >();
  budgets
    .filter((b) => b.type === 'expense' && b.limit > 0)
    .forEach((b) => {
      const displayName = b.category.trim();
      const key = displayName.toLowerCase();
      const rawPeriodSpent = hasValidDateRange
        ? periodTotalsByCategory.get(displayName) || 0
        : monthlyTotalsByCategory.get(displayName)?.get(evalYM) || 0;
      const spent = rawPeriodSpent / monthSpan;
      budgetLimitMap.set(key, { displayName, limit: b.limit, spent });
    });

  const detected: DetectedCategoryAnomaly[] = [];

  const categoryKeys = hasValidDateRange
    ? Array.from(periodTotalsByCategory.keys())
    : Array.from(monthlyTotalsByCategory.keys());

  categoryKeys.forEach((cat) => {
    const ymMap = monthlyTotalsByCategory.get(cat);
    if (!ymMap) return;

    const rawPeriodTotal = hasValidDateRange
      ? periodTotalsByCategory.get(cat) || 0
      : ymMap.get(evalYM) || 0;
    if (rawPeriodTotal <= 0) return;

    const normalizedCurrentAmt = rawPeriodTotal / monthSpan;

    const prevAmounts = prevThreeMonths.map((pm) => ymMap.get(pm) || 0);
    const activePrevMonths = prevAmounts.filter((v) => v > 0);
    if (activePrevMonths.length === 0) return;

    const avg3M =
      prevAmounts.reduce((s, v) => s + v, 0) / Math.max(1, activePrevMonths.length);
    if (avg3M <= 0) return;

    const ratio = normalizedCurrentAmt / avg3M;
    const increasePct = Math.round((ratio - 1) * 100);
    // Flag strictly > 30% above 3-month baseline
    if (ratio <= 1.3 || increasePct <= 30) return;

    const excessAmount = Math.max(0, Math.round(rawPeriodTotal - avg3M * monthSpan));
    const budgetInfo = budgetLimitMap.get(cat.toLowerCase());
    const budgetLimit = budgetInfo?.limit || 0;

    const sourceTriggers = hasValidDateRange
      ? periodTxsByCategory.get(cat) || []
      : monthlyTxsByCategory.get(cat)?.get(evalYM) || [];

    const rawTriggers = [...sourceTriggers].sort((a, b) => b.absAmount - a.absAmount);

    let accumulatedExcess = 0;
    const markedTriggers = rawTriggers.map((item, idx) => {
      const isTrigger = idx === 0 || accumulatedExcess < excessAmount;
      if (isTrigger) accumulatedExcess += item.absAmount;
      return {
        ...item,
        isDefaultTrigger: isTrigger,
      };
    });

    const triggerDescriptions = markedTriggers
      .filter((t) => t.isDefaultTrigger)
      .map((t) => t.tx.description || '')
      .join(' ');

    let recommendedTarget = '';
    let recommendationReason = '';

    for (const rule of KEYWORD_CATEGORY_RULES) {
      if (rule.pattern.test(triggerDescriptions)) {
        const matchingBudget = rule.candidates.find((c) => {
          const lower = c.toLowerCase();
          return lower !== cat.toLowerCase() && budgetLimitMap.has(lower);
        });
        if (matchingBudget) {
          const bInfo = budgetLimitMap.get(matchingBudget.toLowerCase())!;
          const headroom = Math.max(0, bInfo.limit - bInfo.spent);
          recommendedTarget = bInfo.displayName;
          recommendationReason =
            headroom > 0
              ? `Deskripsi transaksi cocok dengan pos "${bInfo.displayName}" yang masih memiliki sisa pagu ${formatterIDR.format(headroom)}.`
              : `Deskripsi transaksi pemicu lebih sesuai dicatat pada pos anggaran "${bInfo.displayName}".`;
          break;
        }

        const matchingMaster = rule.candidates.find((c) => {
          const lower = c.toLowerCase();
          return (
            lower !== cat.toLowerCase() &&
            masterExpenseCategories.some((m) => m.toLowerCase() === lower)
          );
        });
        if (matchingMaster) {
          recommendedTarget = matchingMaster;
          recommendationReason = `Deskripsi transaksi pemicu lebih tepat masuk ke kategori "${matchingMaster}".`;
          break;
        }
      }
    }

    if (!recommendedTarget) {
      const availableBudgets = Array.from(budgetLimitMap.values())
        .filter((b) => b.displayName.toLowerCase() !== cat.toLowerCase())
        .sort((a, b) => b.limit - b.spent - (a.limit - a.spent));

      if (availableBudgets.length > 0) {
        const topBudget = availableBudgets[0];
        const headroom = Math.max(0, topBudget.limit - topBudget.spent);
        recommendedTarget = topBudget.displayName;
        recommendationReason =
          headroom > 0
            ? `Pos budget "${topBudget.displayName}" masih memiliki ruang pagu ${formatterIDR.format(headroom)} untuk menyerap transaksi insidental.`
            : `Pertimbangkan relokasi transaksi outlier ke kategori terpantau "${topBudget.displayName}".`;
      } else {
        const fallbackMaster =
          masterExpenseCategories.find((m) => m.toLowerCase() !== cat.toLowerCase()) ||
          'Biaya Lain-Lain';
        recommendedTarget = fallbackMaster;
        recommendationReason = `Relokasikan transaksi pemicu dari kategori "${cat}" ke pos yang lebih spesifik.`;
      }
    }

    detected.push({
      anomalyKey: hasValidDateRange
        ? `${dateRange!.startDate}..${dateRange!.endDate}:${cat}`
        : `${evalYM}:${cat}`,
      category: cat,
      currentMonthAmount: Math.round(normalizedCurrentAmt),
      threeMonthAvgAmount: Math.round(avg3M),
      increasePct,
      excessAmount,
      budgetLimit,
      triggers: markedTriggers,
      recommendedTarget,
      recommendationReason,
    });
  });

  detected.sort((a, b) => b.increasePct - a.increasePct);

  return {
    referenceYM: evalYM,
    periodLabel,
    baselineLabel,
    isMultiMonthNormalized,
    anomalies: detected,
  };
}

export function buildCategoryAnomalyTimeline(params: {
  transactions: Transaction[];
  budgets: CategoryBudget[];
  monthCount?: 6 | 12;
}): CategoryAnomalyTimelineResult {
  const { transactions, budgets, monthCount = 6 } = params;

  const calendarYM = toLocalYYYYMMDD().slice(0, 7);
  const expenseTxs = transactions.filter((tx) => isOperatingExpense(tx) && tx.amount > 0);
  const monthlyTotalsByCategory = new Map<string, Map<string, number>>();
  const monthlyTotalSpend = new Map<string, number>();
  let latestAvailableYM = '';

  expenseTxs.forEach((tx) => {
    const normalizedDate = normalizeLedgerDateYYYYMMDD(tx.date);
    if (!normalizedDate) return;
    const ym = normalizedDate.slice(0, 7);
    if (!latestAvailableYM || ym > latestAvailableYM) {
      latestAvailableYM = ym;
    }

    const rawCat = (tx.category || '').trim();
    const cat = rawCat && rawCat !== '-' ? rawCat : 'Tanpa Kategori';
    const absAmount = Math.abs(tx.amount || 0);

    let catMap = monthlyTotalsByCategory.get(cat);
    if (!catMap) {
      catMap = new Map<string, number>();
      monthlyTotalsByCategory.set(cat, catMap);
    }
    catMap.set(ym, (catMap.get(ym) || 0) + absAmount);
    monthlyTotalSpend.set(ym, (monthlyTotalSpend.get(ym) || 0) + absAmount);
  });

  const hasCurrentMonth = (monthlyTotalSpend.get(calendarYM) || 0) > 0;
  const endYM = hasCurrentMonth ? calendarYM : latestAvailableYM || calendarYM;
  const months: string[] = [];
  for (let i = monthCount - 1; i >= 0; i -= 1) {
    months.push(shiftMonthYYYYMM(endYM, -i));
  }

  const totalMonthlyBudget = budgets
    .filter((b) => b.type === 'expense' && b.limit > 0)
    .reduce((sum, b) => sum + b.limit, 0);

  // Score every category across the timeline window
  interface CategoryScore {
    category: string;
    spikeMonthsCount: number;
    peakSpikePct: number;
    totalExcessAmount: number;
    totalWindowAmount: number;
    latestAmount: number;
  }

  const categoryScores: CategoryScore[] = [];
  const categoryMonthlySpikes = new Map<string, Map<string, number>>();

  monthlyTotalsByCategory.forEach((ymMap, cat) => {
    let spikeMonthsCount = 0;
    let peakSpikePct = 0;
    let totalExcessAmount = 0;
    let totalWindowAmount = 0;
    const spikeMap = new Map<string, number>();

    months.forEach((ym) => {
      const currentAmt = ymMap.get(ym) || 0;
      totalWindowAmount += currentAmt;
      if (currentAmt <= 0) return;

      const prevMonths = [
        shiftMonthYYYYMM(ym, -1),
        shiftMonthYYYYMM(ym, -2),
        shiftMonthYYYYMM(ym, -3),
      ];
      const prevAmounts = prevMonths.map((pm) => ymMap.get(pm) || 0);
      const activePrev = prevAmounts.filter((v) => v > 0);
      if (activePrev.length === 0) return;

      const avg3M =
        prevAmounts.reduce((s, v) => s + v, 0) / Math.max(1, activePrev.length);
      if (avg3M <= 0) return;

      const ratio = currentAmt / avg3M;
      const spikePct = Math.round((ratio - 1) * 100);
      spikeMap.set(ym, spikePct);

      if (ratio > 1.3 && spikePct > 30) {
        spikeMonthsCount += 1;
        if (spikePct > peakSpikePct) peakSpikePct = spikePct;
        totalExcessAmount += Math.max(0, Math.round(currentAmt - avg3M));
      }
    });

    categoryMonthlySpikes.set(cat, spikeMap);

    if (totalWindowAmount > 0) {
      categoryScores.push({
        category: cat,
        spikeMonthsCount,
        peakSpikePct,
        totalExcessAmount,
        totalWindowAmount,
        latestAmount: Math.round(ymMap.get(endYM) || 0),
      });
    }
  });

  categoryScores.sort((a, b) => {
    if (b.spikeMonthsCount !== a.spikeMonthsCount) {
      return b.spikeMonthsCount - a.spikeMonthsCount;
    }
    if (b.totalExcessAmount !== a.totalExcessAmount) {
      return b.totalExcessAmount - a.totalExcessAmount;
    }
    if (b.peakSpikePct !== a.peakSpikePct) {
      return b.peakSpikePct - a.peakSpikePct;
    }
    return b.totalWindowAmount - a.totalWindowAmount;
  });

  const topCategories: TopAnomalyCategoryMeta[] = categoryScores
    .slice(0, 5)
    .map((score, idx) => ({
      category: score.category,
      color: TREND_LINE_COLORS[idx % TREND_LINE_COLORS.length],
      spikeMonthsCount: score.spikeMonthsCount,
      peakSpikePct: score.peakSpikePct,
      totalExcessAmount: score.totalExcessAmount,
      latestAmount: score.latestAmount,
    }));

  let severeMonthsCount = 0;
  let elevatedMonthsCount = 0;

  const series: CategoryAnomalyTimelinePoint[] = months.map((ym, idx) => {
    const categoryAmounts: Record<string, number> = {};
    const categorySpikePct: Record<string, number> = {};

    topCategories.forEach((meta) => {
      categoryAmounts[meta.category] = Math.round(
        monthlyTotalsByCategory.get(meta.category)?.get(ym) || 0
      );
      const pct = categoryMonthlySpikes.get(meta.category)?.get(ym);
      if (pct !== undefined) {
        categorySpikePct[meta.category] = pct;
      }
    });

    let maxSpikePct = 0;
    let anomalyCount = 0;
    const spikingCategories: string[] = [];

    categoryMonthlySpikes.forEach((spikeMap, cat) => {
      const pct = spikeMap.get(ym);
      if (pct !== undefined && pct > 30) {
        anomalyCount += 1;
        spikingCategories.push(cat);
        if (pct > maxSpikePct) maxSpikePct = pct;
      }
    });

    let severityLevel: AnomalySeverityLevel = 'none';
    let severityLabel = 'Normal';
    if (maxSpikePct >= 60 || anomalyCount >= 3) {
      severityLevel = 'severe';
      severityLabel = 'Lonjakan Tinggi (≥ +60%)';
      severeMonthsCount += 1;
    } else if (anomalyCount >= 1) {
      severityLevel = 'elevated';
      severityLabel = 'Lonjakan Sedang (+31%–59%)';
      elevatedMonthsCount += 1;
    }

    return {
      idx,
      ym,
      monthLabel: formatAnomalyMonthLabelID(ym),
      totalSpending: Math.round(monthlyTotalSpend.get(ym) || 0),
      totalBudget: Math.round(totalMonthlyBudget),
      maxSpikePct,
      anomalyCount,
      spikingCategories,
      severityLevel,
      severityLabel,
      categoryAmounts,
      categorySpikePct,
    };
  });

  return {
    months,
    topCategories,
    totalMonthlyBudget: Math.round(totalMonthlyBudget),
    series,
    severeMonthsCount,
    elevatedMonthsCount,
  };
}

