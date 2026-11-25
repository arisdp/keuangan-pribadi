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

export interface CategoryAnomalyDetectionResult {
  referenceYM: string;
  anomalies: DetectedCategoryAnomaly[];
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

function shiftMonthYYYYMM(baseYM: string, deltaMonths: number): string {
  const [yStr, mStr] = baseYM.split('-');
  const baseDate = new Date(Number(yStr), Number(mStr) - 1 + deltaMonths, 1);
  return `${baseDate.getFullYear()}-${String(baseDate.getMonth() + 1).padStart(2, '0')}`;
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

export function detectCategorySpendingAnomalies(params: {
  transactions: Transaction[];
  budgets: CategoryBudget[];
  accounts?: Account[];
  masterCategories?: CategoryNode[];
}): CategoryAnomalyDetectionResult {
  const { transactions, budgets, accounts = [], masterCategories = [] } = params;

  const accountNameMap = new Map<string, string>();
  accounts.forEach((acc) => accountNameMap.set(acc.id, acc.name));

  const masterExpenseCategories = getMasterExpenseCategoryNames(budgets, masterCategories);

  const expenseTxs = transactions.filter((tx) => isOperatingExpense(tx) && tx.amount > 0);
  if (expenseTxs.length === 0) {
    return { referenceYM: toLocalYYYYMMDD().slice(0, 7), anomalies: [] };
  }

  const calendarYM = toLocalYYYYMMDD().slice(0, 7);
  const monthlyTotalsByCategory = new Map<string, Map<string, number>>();
  const monthlyTxsByCategory = new Map<string, Map<string, TriggerTransactionItem[]>>();
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

    let catTotals = monthlyTotalsByCategory.get(cat);
    if (!catTotals) {
      catTotals = new Map<string, number>();
      monthlyTotalsByCategory.set(cat, catTotals);
    }
    catTotals.set(ym, (catTotals.get(ym) || 0) + absAmount);

    let catTxs = monthlyTxsByCategory.get(cat);
    if (!catTxs) {
      catTxs = new Map<string, TriggerTransactionItem[]>();
      monthlyTxsByCategory.set(cat, catTxs);
    }
    const list = catTxs.get(ym) || [];
    list.push({
      tx,
      normalizedDate,
      absAmount,
      accountName: accountNameMap.get(tx.accountId) || 'Akun Lainnya',
      isDefaultTrigger: false,
    });
    catTxs.set(ym, list);
  });

  const hasCurrentMonthData = Array.from(monthlyTotalsByCategory.values()).some(
    (m) => (m.get(calendarYM) || 0) > 0
  );
  const evalYM = hasCurrentMonthData ? calendarYM : latestAvailableYM || calendarYM;
  const prevThreeMonths = [
    shiftMonthYYYYMM(evalYM, -1),
    shiftMonthYYYYMM(evalYM, -2),
    shiftMonthYYYYMM(evalYM, -3),
  ];

  const budgetLimitMap = new Map<
    string,
    { displayName: string; limit: number; spent: number }
  >();
  budgets
    .filter((b) => b.type === 'expense' && b.limit > 0)
    .forEach((b) => {
      const displayName = b.category.trim();
      const key = displayName.toLowerCase();
      const spent = monthlyTotalsByCategory.get(displayName)?.get(evalYM) || 0;
      budgetLimitMap.set(key, { displayName, limit: b.limit, spent });
    });

  const detected: DetectedCategoryAnomaly[] = [];

  monthlyTotalsByCategory.forEach((ymMap, cat) => {
    const currentAmt = ymMap.get(evalYM) || 0;
    if (currentAmt <= 0) return;

    const prevAmounts = prevThreeMonths.map((pm) => ymMap.get(pm) || 0);
    const activePrevMonths = prevAmounts.filter((v) => v > 0);
    if (activePrevMonths.length === 0) return;

    const avg3M =
      prevAmounts.reduce((s, v) => s + v, 0) / Math.max(1, activePrevMonths.length);
    if (avg3M <= 0) return;

    const ratio = currentAmt / avg3M;
    const increasePct = Math.round((ratio - 1) * 100);
    // Flag strictly > 30% above 3-month baseline
    if (ratio <= 1.3 || increasePct <= 30) return;

    const excessAmount = Math.max(0, Math.round(currentAmt - avg3M));
    const budgetInfo = budgetLimitMap.get(cat.toLowerCase());
    const budgetLimit = budgetInfo?.limit || 0;

    const rawTriggers = [...(monthlyTxsByCategory.get(cat)?.get(evalYM) || [])].sort(
      (a, b) => b.absAmount - a.absAmount
    );

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
      anomalyKey: `${evalYM}:${cat}`,
      category: cat,
      currentMonthAmount: Math.round(currentAmt),
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
    anomalies: detected,
  };
}
