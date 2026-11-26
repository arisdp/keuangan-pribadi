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

export interface CategoryDailySparklinePoint {
  date: string;
  dateLabel: string;
  amount: number;
  dailyBaseline: number;
  spikeThreshold: number;
  isSpikeDay: boolean;
  rolling7dSpikeCount: number;
}

export interface Category30DaySparklineSummary {
  anchorEndDate: string;
  dailyThreshold: number;
  spikeDaysCount: number;
  patternClassification: 'chronic' | 'recurring' | 'incidental';
  patternLabel: string;
  points: CategoryDailySparklinePoint[];
}

export interface AnomalyDistributionSlice {
  mainCategory: string;
  color: string;
  spikeCount: number;
  totalExcessAmount: number;
  maxSpikePct: number;
  frequencySharePct: number;
  excessSharePct: number;
  subCategories: Array<{
    category: string;
    spikeCount: number;
    totalExcessAmount: number;
    peakSpikePct: number;
  }>;
  sampleTransactions: Array<{
    description: string;
    amount: number;
    date: string;
    category: string;
  }>;
}

export interface AnomalyDistributionResult {
  monthCount: 1 | 6 | 12;
  periodRangeLabel: string;
  totalSpikeEvents: number;
  totalExcessAmount: number;
  slices: AnomalyDistributionSlice[];
}

export interface SevenDayVelocityAlertItem {
  alertKey: string;
  category: string;
  recent7dSpikeDays: number;
  recent7dTxCount: number;
  prior21dWeeklyAvgSpikeDays: number;
  frequencyMultiplier: number;
  recent7dSpend: number;
  prior21dWeeklyAvgSpend: number;
  spendIncreasePct: number;
  dailyThreshold: number;
  severity: 'high' | 'medium';
  spikeDates: string[];
  topDescriptions: string[];
}

export interface SevenDayVelocityAlertResult {
  anchorEndDate: string;
  windowStartDate: string;
  windowEndDate: string;
  windowLabel: string;
  alerts: SevenDayVelocityAlertItem[];
}

export interface HistoricalCategoryAnomalyProfile {
  category: string;
  budgetLimit: number;
  total12MonthSpend: number;
  avgMonthlySpend: number;
  spikeCount12M: number;
  maxSpikePct: number;
  spikedMonths: Array<{
    ym: string;
    monthLabel: string;
    amount: number;
    baseline3M: number;
    spikePct: number;
  }>;
  topRepeatedMerchants: Array<{
    description: string;
    txCount: number;
    totalAmount: number;
    avgAmount: number;
    lastDate: string;
  }>;
  recentLargestTxs: Array<{
    date: string;
    description: string;
    amount: number;
  }>;
}

export interface HistoricalAnomalyChatContext {
  referencePeriod: string;
  totalExpenseTransactionsAnalyzed: number;
  active7DayAlerts: Array<{
    category: string;
    recent7dSpikeDays: number;
    frequencyMultiplier: number;
    recent7dSpend: number;
    windowLabel: string;
  }>;
  categoryProfiles: HistoricalCategoryAnomalyProfile[];
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
  if (daySpan <= 25 && (!startIsFirstDay || !endIsLastDay)) {
    return {
      monthSpan: Math.max(0.05, daySpan / 30.4375),
      isMultiMonthNormalized: true,
    };
  }
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

function addDaysYYYYMMDD(baseYMD: string, deltaDays: number): string {
  const parts = baseYMD.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
    return baseYMD;
  }
  const dt = new Date(parts[0], parts[1] - 1, parts[2] + deltaDays);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(
    dt.getDate()
  ).padStart(2, '0')}`;
}

export function resolveSparklineAnchorDate(
  referenceYM: string,
  activeDateRange: AnomalyDateRangeFilter | null
): string {
  const today = toLocalYYYYMMDD();
  if (activeDateRange?.endDate) {
    if (
      activeDateRange.endDate > today &&
      activeDateRange.startDate <= today
    ) {
      return today;
    }
    return activeDateRange.endDate;
  }
  const todayYM = today.slice(0, 7);
  if (referenceYM === todayYM) return today;
  return getLastDayOfMonthYYYYMMDD(referenceYM);
}

export function buildCategory30DaySparkline(params: {
  transactions: Transaction[];
  category: string;
  threeMonthAvgAmount: number;
  anchorEndDate: string;
}): Category30DaySparklineSummary {
  const { transactions, category, threeMonthAvgAmount, anchorEndDate } = params;
  const targetCatLower = category.trim().toLowerCase();

  const dates: string[] = [];
  for (let offset = -29; offset <= 0; offset += 1) {
    dates.push(addDaysYYYYMMDD(anchorEndDate, offset));
  }
  const startDate = dates[0];
  const endDate = dates[dates.length - 1];

  const dailyTotals = new Map<string, number>();
  transactions.forEach((tx) => {
    if (!isOperatingExpense(tx) || tx.amount <= 0) return;
    const rawCat = (tx.category || '').trim();
    const normalizedCat = (rawCat && rawCat !== '-' ? rawCat : 'Tanpa Kategori').toLowerCase();
    if (normalizedCat !== targetCatLower) return;

    const normalizedDate = normalizeLedgerDateYYYYMMDD(tx.date);
    if (!normalizedDate || normalizedDate < startDate || normalizedDate > endDate) return;
    dailyTotals.set(
      normalizedDate,
      (dailyTotals.get(normalizedDate) || 0) + Math.abs(tx.amount || 0)
    );
  });

  const dailyBaseline = Math.max(0, Math.round(threeMonthAvgAmount / 30));
  const dailyThreshold = Math.max(1, Math.round(dailyBaseline * 1.3));

  const rawPoints = dates.map((ymd) => {
    const amount = Math.round(dailyTotals.get(ymd) || 0);
    const parts = ymd.split('-');
    const dayNum = Number(parts[2]);
    const monthNum = Number(parts[1]);
    const dateLabel =
      Number.isFinite(dayNum) && Number.isFinite(monthNum) && monthNum >= 1 && monthNum <= 12
        ? `${dayNum} ${MONTHS_SHORT_ID[monthNum - 1]}`
        : ymd;
    const isSpikeDay = amount > dailyThreshold;
    return {
      date: ymd,
      dateLabel,
      amount,
      dailyBaseline,
      spikeThreshold: dailyThreshold,
      isSpikeDay,
      rolling7dSpikeCount: 0,
    };
  });

  let spikeDaysCount = 0;
  const points: CategoryDailySparklinePoint[] = rawPoints.map((pt, idx) => {
    if (pt.isSpikeDay) spikeDaysCount += 1;
    let rolling7d = 0;
    for (let j = Math.max(0, idx - 6); j <= idx; j += 1) {
      if (rawPoints[j].isSpikeDay) rolling7d += 1;
    }
    return {
      ...pt,
      rolling7dSpikeCount: rolling7d,
    };
  });

  let patternClassification: Category30DaySparklineSummary['patternClassification'] = 'incidental';
  let patternLabel = 'Insidental';
  if (spikeDaysCount >= 5) {
    patternClassification = 'chronic';
    patternLabel = 'Pola Kronis';
  } else if (spikeDaysCount >= 2) {
    patternClassification = 'recurring';
    patternLabel = 'Berulang';
  }

  return {
    anchorEndDate: endDate,
    dailyThreshold,
    spikeDaysCount,
    patternClassification,
    patternLabel,
    points,
  };
}

const DISTRIBUTION_PIE_COLORS = [
  '#dc2626', // Crimson
  '#d97706', // Amber
  '#2563eb', // Blue
  '#4f46e5', // Indigo
  '#0d9488', // Teal
  '#0891b2', // Cyan
  '#64748b', // Slate
];

function buildCategoryToMainGroupMap(
  masterCategories: CategoryNode[] = []
): Map<string, string> {
  const hierarchy =
    masterCategories && masterCategories.length > 0
      ? masterCategories
      : DEFAULT_CATEGORY_HIERARCHY;
  const map = new Map<string, string>();

  const walkGroup = (node: CategoryNode, groupName: string) => {
    if (node.name) {
      map.set(node.name.trim().toLowerCase(), groupName);
    }
    if (node.children) {
      node.children.forEach((child) => walkGroup(child, groupName));
    }
  };

  hierarchy.forEach((typeNode) => {
    if (typeNode.type === 'group') {
      walkGroup(typeNode, typeNode.name.trim());
      return;
    }
    (typeNode.children || []).forEach((child) => {
      if (child.type === 'group') {
        walkGroup(child, child.name.trim());
      } else if (child.name) {
        map.set(child.name.trim().toLowerCase(), child.name.trim());
      }
    });
  });

  return map;
}

export function buildAnomalyDistributionByMainCategory(params: {
  transactions: Transaction[];
  masterCategories?: CategoryNode[];
  monthCount?: 1 | 6 | 12;
}): AnomalyDistributionResult {
  const { transactions, masterCategories = [], monthCount = 6 } = params;

  const calendarYM = toLocalYYYYMMDD().slice(0, 7);
  const expenseTxs = transactions.filter((tx) => isOperatingExpense(tx) && tx.amount > 0);
  const monthlyTotalsByCategory = new Map<string, Map<string, number>>();
  const monthlyTxsByCategory = new Map<
    string,
    Map<string, Array<{ description: string; amount: number; date: string; category: string }>>
  >();
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

    let txCatMap = monthlyTxsByCategory.get(cat);
    if (!txCatMap) {
      txCatMap = new Map();
      monthlyTxsByCategory.set(cat, txCatMap);
    }
    let txArr = txCatMap.get(ym);
    if (!txArr) {
      txArr = [];
      txCatMap.set(ym, txArr);
    }
    txArr.push({
      description: (tx.description || '').trim() || cat,
      amount: absAmount,
      date: normalizedDate,
      category: cat,
    });

    monthlyTotalSpend.set(ym, (monthlyTotalSpend.get(ym) || 0) + absAmount);
  });

  const hasCurrentMonth = (monthlyTotalSpend.get(calendarYM) || 0) > 0;
  const endYM = hasCurrentMonth ? calendarYM : latestAvailableYM || calendarYM;
  const months: string[] = [];
  for (let i = monthCount - 1; i >= 0; i -= 1) {
    months.push(shiftMonthYYYYMM(endYM, -i));
  }

  const periodRangeLabel =
    monthCount === 1
      ? formatAnomalyMonthLabelID(endYM)
      : `${formatAnomalyMonthLabelID(months[0])}–${formatAnomalyMonthLabelID(
          months[months.length - 1]
        )}`;

  const categoryToGroup = buildCategoryToMainGroupMap(masterCategories);

  interface GroupBucket {
    mainCategory: string;
    spikeCount: number;
    totalExcessAmount: number;
    maxSpikePct: number;
    subMap: Map<
      string,
      { category: string; spikeCount: number; totalExcessAmount: number; peakSpikePct: number }
    >;
    sampleTransactions: Array<{
      description: string;
      amount: number;
      date: string;
      category: string;
    }>;
  }

  const groupBuckets = new Map<string, GroupBucket>();
  let totalSpikeEvents = 0;
  let totalExcessAmount = 0;

  monthlyTotalsByCategory.forEach((ymMap, cat) => {
    const mainGroup = categoryToGroup.get(cat.trim().toLowerCase()) || cat;

    months.forEach((ym) => {
      const currentAmt = ymMap.get(ym) || 0;
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
      if (ratio <= 1.3 || spikePct <= 30) return;

      const excess = Math.max(0, Math.round(currentAmt - avg3M));
      totalSpikeEvents += 1;
      totalExcessAmount += excess;

      let bucket = groupBuckets.get(mainGroup);
      if (!bucket) {
        bucket = {
          mainCategory: mainGroup,
          spikeCount: 0,
          totalExcessAmount: 0,
          maxSpikePct: 0,
          subMap: new Map(),
          sampleTransactions: [],
        };
        groupBuckets.set(mainGroup, bucket);
      }

      bucket.spikeCount += 1;
      bucket.totalExcessAmount += excess;
      if (spikePct > bucket.maxSpikePct) {
        bucket.maxSpikePct = spikePct;
      }

      const spikedMonthTxs = monthlyTxsByCategory.get(cat)?.get(ym) || [];
      if (spikedMonthTxs.length > 0) {
        bucket.sampleTransactions.push(...spikedMonthTxs);
      }

      const existingSub = bucket.subMap.get(cat);
      if (existingSub) {
        existingSub.spikeCount += 1;
        existingSub.totalExcessAmount += excess;
        if (spikePct > existingSub.peakSpikePct) {
          existingSub.peakSpikePct = spikePct;
        }
      } else {
        bucket.subMap.set(cat, {
          category: cat,
          spikeCount: 1,
          totalExcessAmount: excess,
          peakSpikePct: spikePct,
        });
      }
    });
  });

  const sortedBuckets = Array.from(groupBuckets.values()).sort((a, b) => {
    if (b.spikeCount !== a.spikeCount) return b.spikeCount - a.spikeCount;
    return b.totalExcessAmount - a.totalExcessAmount;
  });

  const slices: AnomalyDistributionSlice[] = sortedBuckets.map((bucket, idx) => ({
    mainCategory: bucket.mainCategory,
    color: DISTRIBUTION_PIE_COLORS[idx % DISTRIBUTION_PIE_COLORS.length],
    spikeCount: bucket.spikeCount,
    totalExcessAmount: bucket.totalExcessAmount,
    maxSpikePct: bucket.maxSpikePct,
    frequencySharePct:
      totalSpikeEvents > 0
        ? Math.round((bucket.spikeCount / totalSpikeEvents) * 1000) / 10
        : 0,
    excessSharePct:
      totalExcessAmount > 0
        ? Math.round((bucket.totalExcessAmount / totalExcessAmount) * 1000) / 10
        : 0,
    subCategories: Array.from(bucket.subMap.values()).sort(
      (a, b) => b.spikeCount - a.spikeCount || b.totalExcessAmount - a.totalExcessAmount
    ),
    sampleTransactions: [...bucket.sampleTransactions]
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6),
  }));

  return {
    monthCount,
    periodRangeLabel,
    totalSpikeEvents,
    totalExcessAmount,
    slices,
  };
}

export function detect7DayFrequencyVelocityAlerts(params: {
  transactions: Transaction[];
}): SevenDayVelocityAlertResult {
  const { transactions } = params;
  const today = toLocalYYYYMMDD();
  const expenseTxs = transactions.filter((tx) => isOperatingExpense(tx) && tx.amount > 0);

  let latestTxDate = '';
  const monthlyTotalsByCategory = new Map<string, Map<string, number>>();
  const dailyTotalsByCategory = new Map<string, Map<string, number>>();
  const dailyTxDetailsByCategory = new Map<
    string,
    Array<{ date: string; description: string; amount: number }>
  >();

  expenseTxs.forEach((tx) => {
    const normalizedDate = normalizeLedgerDateYYYYMMDD(tx.date);
    if (!normalizedDate) return;
    if (!latestTxDate || normalizedDate > latestTxDate) {
      latestTxDate = normalizedDate;
    }

    const rawCat = (tx.category || '').trim();
    const cat = rawCat && rawCat !== '-' ? rawCat : 'Tanpa Kategori';
    const absAmount = Math.abs(tx.amount || 0);
    const ym = normalizedDate.slice(0, 7);

    let mMap = monthlyTotalsByCategory.get(cat);
    if (!mMap) {
      mMap = new Map<string, number>();
      monthlyTotalsByCategory.set(cat, mMap);
    }
    mMap.set(ym, (mMap.get(ym) || 0) + absAmount);

    let dMap = dailyTotalsByCategory.get(cat);
    if (!dMap) {
      dMap = new Map<string, number>();
      dailyTotalsByCategory.set(cat, dMap);
    }
    dMap.set(normalizedDate, (dMap.get(normalizedDate) || 0) + absAmount);

    const list = dailyTxDetailsByCategory.get(cat) || [];
    list.push({
      date: normalizedDate,
      description: (tx.description || '').trim() || cat,
      amount: absAmount,
    });
    dailyTxDetailsByCategory.set(cat, list);
  });

  const sevenDaysAgoFromToday = addDaysYYYYMMDD(today, -6);
  const anchorEndDate =
    latestTxDate && latestTxDate >= sevenDaysAgoFromToday
      ? today
      : latestTxDate || today;
  const windowStartDate = addDaysYYYYMMDD(anchorEndDate, -6);
  const prior21StartDate = addDaysYYYYMMDD(anchorEndDate, -27);
  const prior21EndDate = addDaysYYYYMMDD(anchorEndDate, -7);
  const windowLabel = `${formatAnomalyDateShortID(
    windowStartDate
  )}–${formatAnomalyDateShortID(anchorEndDate)}`;

  const anchorYM = anchorEndDate.slice(0, 7);
  const prevThreeMonths = [
    shiftMonthYYYYMM(anchorYM, -1),
    shiftMonthYYYYMM(anchorYM, -2),
    shiftMonthYYYYMM(anchorYM, -3),
  ];

  const alerts: SevenDayVelocityAlertItem[] = [];

  dailyTotalsByCategory.forEach((dMap, cat) => {
    const mMap = monthlyTotalsByCategory.get(cat);
    const prevAmounts = prevThreeMonths.map((pm) => mMap?.get(pm) || 0);
    const activePrevMonths = prevAmounts.filter((v) => v > 0);
    const avg3M =
      activePrevMonths.length > 0
        ? prevAmounts.reduce((s, v) => s + v, 0) / activePrevMonths.length
        : 0;

    let recent7dSpend = 0;
    let prior21dSpend = 0;

    dMap.forEach((amt, dt) => {
      if (dt >= windowStartDate && dt <= anchorEndDate) {
        recent7dSpend += amt;
      } else if (dt >= prior21StartDate && dt <= prior21EndDate) {
        prior21dSpend += amt;
      }
    });

    if (recent7dSpend <= 0) return;

    const dailyBaseline =
      avg3M > 0
        ? avg3M / 30
        : prior21dSpend > 0
        ? prior21dSpend / 21
        : 0;
    const dailyThreshold =
      dailyBaseline > 0 ? Math.max(10000, Math.round(dailyBaseline * 1.3)) : 0;

    const spikeDates: string[] = [];
    let prior21dSpikeDays = 0;

    dMap.forEach((amt, dt) => {
      const isSpikeDay = dailyThreshold > 0 ? amt > dailyThreshold : amt > 0;
      if (!isSpikeDay) return;
      if (dt >= windowStartDate && dt <= anchorEndDate) {
        spikeDates.push(dt);
      } else if (dt >= prior21StartDate && dt <= prior21EndDate) {
        prior21dSpikeDays += 1;
      }
    });

    spikeDates.sort();
    const recent7dSpikeDays = spikeDates.length;
    const prior21dWeeklyAvgSpikeDays =
      Math.round((prior21dSpikeDays / 3) * 10) / 10;
    const prior21dWeeklyAvgSpend = Math.round(prior21dSpend / 3);

    const recent7dTxs = (dailyTxDetailsByCategory.get(cat) || []).filter(
      (t) => t.date >= windowStartDate && t.date <= anchorEndDate
    );
    const recent7dTxCount = recent7dTxs.length;

    const freqRatio =
      prior21dWeeklyAvgSpikeDays > 0
        ? recent7dSpikeDays / prior21dWeeklyAvgSpikeDays
        : recent7dSpikeDays;

    const hasSharpFrequencyJump =
      (recent7dSpikeDays >= 2 &&
        (prior21dWeeklyAvgSpikeDays === 0 || freqRatio >= 1.5) &&
        (prior21dWeeklyAvgSpend === 0 || recent7dSpend > prior21dWeeklyAvgSpend * 1.25)) ||
      (recent7dTxCount >= 4 &&
        prior21dWeeklyAvgSpikeDays <= 1 &&
        recent7dSpend > Math.max(1, prior21dWeeklyAvgSpend) * 1.5);

    if (!hasSharpFrequencyJump) return;

    const frequencyMultiplier = Math.max(
      1.5,
      Math.round(freqRatio * 10) / 10
    );
    const spendIncreasePct =
      prior21dWeeklyAvgSpend > 0
        ? Math.round(
            ((recent7dSpend - prior21dWeeklyAvgSpend) / prior21dWeeklyAvgSpend) * 100
          )
        : 100;

    const severity: 'high' | 'medium' =
      recent7dSpikeDays >= 4 || (recent7dSpikeDays >= 3 && spendIncreasePct >= 100)
        ? 'high'
        : 'medium';

    const topDescriptions = Array.from(
      new Set(
        [...recent7dTxs]
          .sort((a, b) => b.amount - a.amount)
          .map((t) => t.description)
      )
    ).slice(0, 3);

    alerts.push({
      alertKey: `7d:${anchorEndDate}:${cat}`,
      category: cat,
      recent7dSpikeDays,
      recent7dTxCount,
      prior21dWeeklyAvgSpikeDays,
      frequencyMultiplier,
      recent7dSpend: Math.round(recent7dSpend),
      prior21dWeeklyAvgSpend,
      spendIncreasePct,
      dailyThreshold,
      severity,
      spikeDates,
      topDescriptions,
    });
  });

  alerts.sort(
    (a, b) =>
      b.recent7dSpikeDays - a.recent7dSpikeDays ||
      b.frequencyMultiplier - a.frequencyMultiplier ||
      b.recent7dSpend - a.recent7dSpend
  );

  return {
    anchorEndDate,
    windowStartDate,
    windowEndDate: anchorEndDate,
    windowLabel,
    alerts,
  };
}

export function buildHistoricalAnomalyChatContext(params: {
  transactions: Transaction[];
  budgets: CategoryBudget[];
}): HistoricalAnomalyChatContext {
  const { transactions, budgets } = params;
  const calendarYM = toLocalYYYYMMDD().slice(0, 7);
  const expenseTxs = transactions.filter((tx) => isOperatingExpense(tx) && tx.amount > 0);

  const monthlyTotalsByCategory = new Map<string, Map<string, number>>();
  const monthlyTotalSpend = new Map<string, number>();
  const txsByCategory = new Map<
    string,
    Array<{ date: string; description: string; amount: number }>
  >();
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

    let mMap = monthlyTotalsByCategory.get(cat);
    if (!mMap) {
      mMap = new Map<string, number>();
      monthlyTotalsByCategory.set(cat, mMap);
    }
    mMap.set(ym, (mMap.get(ym) || 0) + absAmount);
    monthlyTotalSpend.set(ym, (monthlyTotalSpend.get(ym) || 0) + absAmount);

    const list = txsByCategory.get(cat) || [];
    list.push({
      date: normalizedDate,
      description: (tx.description || '').trim() || cat,
      amount: Math.round(absAmount),
    });
    txsByCategory.set(cat, list);
  });

  const hasCurrentMonth = (monthlyTotalSpend.get(calendarYM) || 0) > 0;
  const endYM = hasCurrentMonth ? calendarYM : latestAvailableYM || calendarYM;
  const months12: string[] = [];
  for (let i = 11; i >= 0; i -= 1) {
    months12.push(shiftMonthYYYYMM(endYM, -i));
  }
  const month12Set = new Set(months12);

  const budgetByCatLower = new Map<string, number>();
  budgets
    .filter((b) => b.type === 'expense' && b.limit > 0)
    .forEach((b) => {
      budgetByCatLower.set(b.category.trim().toLowerCase(), Math.round(b.limit));
    });

  const profiles: HistoricalCategoryAnomalyProfile[] = [];

  monthlyTotalsByCategory.forEach((ymMap, cat) => {
    let total12MonthSpend = 0;
    let activeMonths = 0;
    const spikedMonths: HistoricalCategoryAnomalyProfile['spikedMonths'] = [];

    months12.forEach((ym) => {
      const amt = Math.round(ymMap.get(ym) || 0);
      if (amt <= 0) return;
      total12MonthSpend += amt;
      activeMonths += 1;

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

      const ratio = amt / avg3M;
      const spikePct = Math.round((ratio - 1) * 100);
      if (ratio > 1.3 && spikePct > 30) {
        spikedMonths.push({
          ym,
          monthLabel: formatAnomalyMonthLabelID(ym),
          amount: amt,
          baseline3M: Math.round(avg3M),
          spikePct,
        });
      }
    });

    if (total12MonthSpend <= 0) return;

    const catTxs12M = (txsByCategory.get(cat) || []).filter((t) =>
      month12Set.has(t.date.slice(0, 7))
    );
    const merchantAgg = new Map<
      string,
      { description: string; txCount: number; totalAmount: number; lastDate: string }
    >();
    catTxs12M.forEach((t) => {
      const key = t.description.toLowerCase();
      const prev = merchantAgg.get(key);
      if (prev) {
        prev.txCount += 1;
        prev.totalAmount += t.amount;
        if (t.date > prev.lastDate) prev.lastDate = t.date;
      } else {
        merchantAgg.set(key, {
          description: t.description,
          txCount: 1,
          totalAmount: t.amount,
          lastDate: t.date,
        });
      }
    });

    const topRepeatedMerchants = Array.from(merchantAgg.values())
      .sort((a, b) => b.totalAmount - a.totalAmount || b.txCount - a.txCount)
      .slice(0, 5)
      .map((m) => ({
        description: m.description,
        txCount: m.txCount,
        totalAmount: Math.round(m.totalAmount),
        avgAmount: Math.round(m.totalAmount / Math.max(1, m.txCount)),
        lastDate: m.lastDate,
      }));

    const recentLargestTxs = [...catTxs12M]
      .sort((a, b) => b.amount - a.amount || b.date.localeCompare(a.date))
      .slice(0, 4);

    const maxSpikePct = spikedMonths.reduce(
      (max, item) => (item.spikePct > max ? item.spikePct : max),
      0
    );

    profiles.push({
      category: cat,
      budgetLimit: budgetByCatLower.get(cat.toLowerCase()) || 0,
      total12MonthSpend: Math.round(total12MonthSpend),
      avgMonthlySpend: Math.round(total12MonthSpend / Math.max(1, activeMonths)),
      spikeCount12M: spikedMonths.length,
      maxSpikePct,
      spikedMonths: spikedMonths.sort((a, b) => b.ym.localeCompare(a.ym)).slice(0, 6),
      topRepeatedMerchants,
      recentLargestTxs,
    });
  });

  profiles.sort(
    (a, b) =>
      b.spikeCount12M - a.spikeCount12M ||
      b.maxSpikePct - a.maxSpikePct ||
      b.total12MonthSpend - a.total12MonthSpend
  );

  const sevenDayResult = detect7DayFrequencyVelocityAlerts({ transactions });

  return {
    referencePeriod: `${formatAnomalyMonthLabelID(months12[0])}–${formatAnomalyMonthLabelID(
      months12[months12.length - 1]
    )}`,
    totalExpenseTransactionsAnalyzed: expenseTxs.length,
    active7DayAlerts: sevenDayResult.alerts.slice(0, 5).map((a) => ({
      category: a.category,
      recent7dSpikeDays: a.recent7dSpikeDays,
      frequencyMultiplier: a.frequencyMultiplier,
      recent7dSpend: a.recent7dSpend,
      windowLabel: sevenDayResult.windowLabel,
    })),
    categoryProfiles: profiles.slice(0, 15),
  };
}



