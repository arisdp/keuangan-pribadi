import { Debt, Transaction } from '../types';
import {
  classifyTransaction,
  normalizeLedgerDateYYYYMMDD,
  resolveDebtInstallmentAccounting,
  toLocalYYYYMMDD,
  TransactionAccountingNature,
} from './accountingEngine';

export type SankeyPeriodMode = 'all' | 'monthly' | 'quarterly' | 'yearly';
export type ReportsPeriodFilter = 'this-month' | 'last-3-months' | 'this-year' | 'all';
export type QuarterNum = 1 | 2 | 3 | 4;

export interface SankeyLedgerEntry {
  tx: Transaction;
  effectiveAmount: number;
  attributionLabel?: string;
}

export interface IndexedSankeyTransaction {
  tx: Transaction;
  normalizedDate: string;
  nature: TransactionAccountingNature;
}

export interface SankeyPeriodIndex {
  all: IndexedSankeyTransaction[];
  allTransactions: Transaction[];
  byMonth: Map<string, IndexedSankeyTransaction[]>;
  byQuarter: Map<string, IndexedSankeyTransaction[]>;
  byYear: Map<string, IndexedSankeyTransaction[]>;
  availableMonthKeys: string[];
  availableYears: string[];
  currentLocalDate: string;
  currentLocalMonth: string;
  currentLocalYear: string;
  currentLocalQuarter: QuarterNum;
}

export interface SankeySubCategoryShare {
  label: string;
  amount: number;
  count: number;
  sharePct: number;
}

export interface SankeyDrilldownSelection {
  key: string;
  kind: 'node' | 'link';
  title: string;
  subtitle: string;
  volume: number;
  periodRangeLabel: string;
  totalIncome: number;
  totalExpense: number;
  totalDebtPayment: number;
  totalSaving: number;
  totalInvestment: number;
  netSurplus: number;
  netDeficit: number;
  isResidualNode: boolean;
  isDeficitNode: boolean;
  groupByAccount: boolean;
  subCategoryBreakdown: SankeySubCategoryShare[];
  entries: SankeyLedgerEntry[];
}

export interface PeriodCashFlowAggregation {
  incomeCategoryMap: Record<string, { total: number; entries: SankeyLedgerEntry[] }>;
  expenseCategoryMap: Record<string, { total: number; entries: SankeyLedgerEntry[] }>;
  savingEntries: SankeyLedgerEntry[];
  investmentEntries: SankeyLedgerEntry[];
  debtEntries: SankeyLedgerEntry[];
  allIncomeEntries: SankeyLedgerEntry[];
  allExpenseEntries: SankeyLedgerEntry[];
  totalIncome: number;
  totalExpense: number;
  totalDebtPayment: number;
  totalSaving: number;
  totalInvestment: number;
  totalAllocatedOutflow: number;
  rawNetBalance: number;
  netSurplus: number;
  netDeficit: number;
}

export const QUARTER_LABELS: Record<QuarterNum, string> = {
  1: 'Q1 (Jan–Mar)',
  2: 'Q2 (Apr–Jun)',
  3: 'Q3 (Jul–Sep)',
  4: 'Q4 (Okt–Des)',
};

const EMPTY_INDEXED_ENTRIES: IndexedSankeyTransaction[] = [];

export function formatMonthLabelID(monthKey: string): string {
  const [yStr, mStr] = monthKey.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  if (!y || !m) return monthKey;
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
}

export function getQuarterFromMonth(monthNum: number): QuarterNum {
  if (monthNum <= 3) return 1;
  if (monthNum <= 6) return 2;
  if (monthNum <= 9) return 3;
  return 4;
}

export function getPeriodRangeLabel(
  periodMode: SankeyPeriodMode,
  selectedMonth: string,
  selectedQuarter: QuarterNum,
  selectedYear: string
): string {
  if (periodMode === 'all') return 'Seluruh Periode';
  if (periodMode === 'monthly') return formatMonthLabelID(selectedMonth);
  if (periodMode === 'quarterly') {
    return `${QUARTER_LABELS[selectedQuarter]} ${selectedYear}`;
  }
  return `Tahun ${selectedYear}`;
}

export function buildSankeyPeriodIndex(transactions: Transaction[]): SankeyPeriodIndex {
  const todayLocal = toLocalYYYYMMDD();
  const currentLocalMonth = todayLocal.slice(0, 7);
  const currentLocalYear = todayLocal.slice(0, 4);
  const currentLocalQuarter = getQuarterFromMonth(Number(todayLocal.slice(5, 7)) || 1);

  const all: IndexedSankeyTransaction[] = new Array(transactions.length);
  const byMonth = new Map<string, IndexedSankeyTransaction[]>();
  const byQuarter = new Map<string, IndexedSankeyTransaction[]>();
  const byYear = new Map<string, IndexedSankeyTransaction[]>();
  const yearSet = new Set<string>([currentLocalYear]);

  for (let i = 0; i < transactions.length; i += 1) {
    const tx = transactions[i];
    const normalizedDate = normalizeLedgerDateYYYYMMDD(tx.date);
    const nature = classifyTransaction(tx);
    const indexed: IndexedSankeyTransaction = { tx, normalizedDate, nature };
    all[i] = indexed;

    if (normalizedDate.length >= 7) {
      const year = normalizedDate.slice(0, 4);
      const monthKey = normalizedDate.slice(0, 7);
      const monthNum = Number(normalizedDate.slice(5, 7)) || 1;
      const quarterKey = `${year}-Q${getQuarterFromMonth(monthNum)}`;

      yearSet.add(year);

      let monthBucket = byMonth.get(monthKey);
      if (!monthBucket) {
        monthBucket = [];
        byMonth.set(monthKey, monthBucket);
      }
      monthBucket.push(indexed);

      let quarterBucket = byQuarter.get(quarterKey);
      if (!quarterBucket) {
        quarterBucket = [];
        byQuarter.set(quarterKey, quarterBucket);
      }
      quarterBucket.push(indexed);

      let yearBucket = byYear.get(year);
      if (!yearBucket) {
        yearBucket = [];
        byYear.set(year, yearBucket);
      }
      yearBucket.push(indexed);
    }
  }

  const availableMonthKeys = Array.from(byMonth.keys()).sort((a, b) => b.localeCompare(a));
  const availableYears = Array.from(yearSet).sort((a, b) => b.localeCompare(a));

  return {
    all,
    allTransactions: transactions,
    byMonth,
    byQuarter,
    byYear,
    availableMonthKeys,
    availableYears,
    currentLocalDate: todayLocal,
    currentLocalMonth,
    currentLocalYear,
    currentLocalQuarter,
  };
}

export function lookupSankeyPeriodEntries(
  index: SankeyPeriodIndex,
  periodMode: SankeyPeriodMode,
  selectedMonth: string,
  selectedQuarter: QuarterNum,
  selectedYear: string
): IndexedSankeyTransaction[] {
  if (periodMode === 'all') return index.all;
  if (periodMode === 'monthly') return index.byMonth.get(selectedMonth) ?? EMPTY_INDEXED_ENTRIES;
  if (periodMode === 'quarterly') {
    return index.byQuarter.get(`${selectedYear}-Q${selectedQuarter}`) ?? EMPTY_INDEXED_ENTRIES;
  }
  if (periodMode === 'yearly') return index.byYear.get(selectedYear) ?? EMPTY_INDEXED_ENTRIES;
  return index.all;
}

/**
 * Lookup O(1) berbasis Map periode untuk filter umum ReportsTab:
 * - 'all'           -> seluruh dataset terindeks
 * - 'this-month'    -> bucket bulan berjalan (byMonth)
 * - 'this-year'     -> bucket tahun berjalan (byYear)
 * - 'last-3-months' -> gabungan 4 bucket bulan kalender terakhir lalu dipangkas batas tanggal lokal
 */
export function lookupReportsPeriodEntries(
  index: SankeyPeriodIndex,
  periodFilter: ReportsPeriodFilter
): IndexedSankeyTransaction[] {
  if (periodFilter === 'all') return index.all;
  if (periodFilter === 'this-month') {
    return index.byMonth.get(index.currentLocalMonth) ?? EMPTY_INDEXED_ENTRIES;
  }
  if (periodFilter === 'this-year') {
    return index.byYear.get(index.currentLocalYear) ?? EMPTY_INDEXED_ENTRIES;
  }

  const now = new Date();
  const startDateObj = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
  const startStr = toLocalYYYYMMDD(startDateObj);
  const endStr = index.currentLocalDate;

  const result: IndexedSankeyTransaction[] = [];
  for (let offset = 3; offset >= 0; offset -= 1) {
    const dt = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const mk = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
    const bucket = index.byMonth.get(mk);
    if (!bucket) continue;
    for (let i = 0; i < bucket.length; i += 1) {
      const entry = bucket[i];
      if (entry.normalizedDate >= startStr && entry.normalizedDate <= endStr) {
        result.push(entry);
      }
    }
  }
  return result;
}

export function lookupReportsPeriodTransactions(
  index: SankeyPeriodIndex,
  periodFilter: ReportsPeriodFilter
): Transaction[] {
  if (periodFilter === 'all') return index.allTransactions;
  const entries = lookupReportsPeriodEntries(index, periodFilter);
  const txs = new Array<Transaction>(entries.length);
  for (let i = 0; i < entries.length; i += 1) {
    txs[i] = entries[i].tx;
  }
  return txs;
}

export function getAvailablePeriodOptions(transactions: Transaction[]) {
  const todayLocal = toLocalYYYYMMDD();
  const currentLocalMonth = todayLocal.slice(0, 7);
  const currentLocalYear = todayLocal.slice(0, 4);
  const currentLocalQuarter = getQuarterFromMonth(Number(todayLocal.slice(5, 7)) || 1);

  const monthSet = new Set<string>();
  transactions.forEach((tx) => {
    const norm = normalizeLedgerDateYYYYMMDD(tx.date);
    if (norm && norm.length >= 7) monthSet.add(norm.slice(0, 7));
  });
  const availableMonthKeys = Array.from(monthSet).sort((a, b) => b.localeCompare(a));

  const yearSet = new Set<string>([currentLocalYear]);
  availableMonthKeys.forEach((mk) => yearSet.add(mk.slice(0, 4)));
  const availableYears = Array.from(yearSet).sort((a, b) => b.localeCompare(a));

  return {
    availableMonthKeys,
    availableYears,
    currentLocalMonth,
    currentLocalYear,
    currentLocalQuarter,
  };
}

export function filterTransactionsBySankeyPeriod(
  transactions: Transaction[],
  periodMode: SankeyPeriodMode,
  selectedMonth: string,
  selectedQuarter: QuarterNum,
  selectedYear: string
): Transaction[] {
  if (periodMode === 'all') return transactions;

  return transactions.filter((tx) => {
    const normDate = normalizeLedgerDateYYYYMMDD(tx.date);
    if (!normDate || normDate.length < 7) return false;
    const yr = normDate.slice(0, 4);
    const monthKey = normDate.slice(0, 7);
    const mNum = Number(normDate.slice(5, 7)) || 1;

    if (periodMode === 'monthly') return monthKey === selectedMonth;
    if (periodMode === 'quarterly') {
      return yr === selectedYear && getQuarterFromMonth(mNum) === selectedQuarter;
    }
    if (periodMode === 'yearly') return yr === selectedYear;
    return true;
  });
}

function accumulateCashFlowFromClassified(
  items: ReadonlyArray<{ tx: Transaction; nature: TransactionAccountingNature }>,
  debts: Debt[]
): PeriodCashFlowAggregation {
  const debtLookup = new Map<string, Debt>();
  for (let i = 0; i < debts.length; i += 1) {
    debtLookup.set(debts[i].id, debts[i]);
  }

  const incomeCategoryMap: Record<string, { total: number; entries: SankeyLedgerEntry[] }> = {};
  const expenseCategoryMap: Record<string, { total: number; entries: SankeyLedgerEntry[] }> = {};
  const savingEntries: SankeyLedgerEntry[] = [];
  const investmentEntries: SankeyLedgerEntry[] = [];
  const debtEntries: SankeyLedgerEntry[] = [];
  const allIncomeEntries: SankeyLedgerEntry[] = [];
  const allExpenseEntries: SankeyLedgerEntry[] = [];

  let totalIncome = 0;
  let totalExpense = 0;
  let totalSaving = 0;
  let totalInvestment = 0;
  let totalDebtPayment = 0;

  for (let i = 0; i < items.length; i += 1) {
    const { tx, nature } = items[i];
    const amt = Math.abs(tx.amount || 0);
    if (amt <= 0) continue;

    switch (nature) {
      case 'operating_income': {
        const cat = tx.category || 'Pendapatan Lain-lain';
        let bucket = incomeCategoryMap[cat];
        if (!bucket) {
          bucket = { total: 0, entries: [] };
          incomeCategoryMap[cat] = bucket;
        }
        bucket.total += amt;
        totalIncome += amt;
        const entry: SankeyLedgerEntry = { tx, effectiveAmount: amt };
        bucket.entries.push(entry);
        allIncomeEntries.push(entry);
        break;
      }
      case 'operating_expense': {
        const cat = tx.category || 'Beban Lainnya';
        let bucket = expenseCategoryMap[cat];
        if (!bucket) {
          bucket = { total: 0, entries: [] };
          expenseCategoryMap[cat] = bucket;
        }
        bucket.total += amt;
        totalExpense += amt;
        const entry: SankeyLedgerEntry = { tx, effectiveAmount: amt };
        bucket.entries.push(entry);
        allExpenseEntries.push(entry);
        break;
      }
      case 'emergency_fund_transfer': {
        if (tx.type !== 'income') {
          totalSaving += amt;
          savingEntries.push({ tx, effectiveAmount: amt });
        }
        break;
      }
      case 'investment_buy': {
        totalInvestment += amt;
        investmentEntries.push({ tx, effectiveAmount: amt });
        break;
      }
      case 'debt_principal_pay': {
        if (tx.type !== 'income') {
          let principalAmt = amt;
          let interestAmt = 0;
          let interestCat = 'Beban Bunga Pinjaman / KPR';

          if (tx.linkedKprBreakdown) {
            interestAmt = Math.min(amt, Math.abs(tx.linkedKprBreakdown.interestPart || 0));
            principalAmt =
              tx.linkedKprBreakdown.principalPart !== undefined
                ? Math.min(amt, Math.abs(tx.linkedKprBreakdown.principalPart))
                : Math.max(0, amt - interestAmt);
            if (tx.linkedKprBreakdown.interestCategory) {
              interestCat = tx.linkedKprBreakdown.interestCategory;
            }
          } else if (tx.linkedDebtId && debtLookup.has(tx.linkedDebtId)) {
            const debt = debtLookup.get(tx.linkedDebtId)!;
            const split = resolveDebtInstallmentAccounting({
              tx,
              debt,
              sourceAccountCoaCode: '1120',
            });
            principalAmt = split.principalPayAmount;
            interestAmt = split.interestExpenseAmount;
            if (split.linkedKprBreakdown?.interestCategory) {
              interestCat = split.linkedKprBreakdown.interestCategory;
            }
          }

          if (principalAmt > 0) {
            totalDebtPayment += principalAmt;
            debtEntries.push({
              tx,
              effectiveAmount: principalAmt,
              attributionLabel: interestAmt > 0 ? 'Pokok Utang/KPR' : undefined,
            });
          }
          if (interestAmt > 0) {
            let interestBucket = expenseCategoryMap[interestCat];
            if (!interestBucket) {
              interestBucket = { total: 0, entries: [] };
              expenseCategoryMap[interestCat] = interestBucket;
            }
            interestBucket.total += interestAmt;
            totalExpense += interestAmt;
            const interestEntry: SankeyLedgerEntry = {
              tx,
              effectiveAmount: interestAmt,
              attributionLabel: 'Porsi Bunga KPR/Utang',
            };
            interestBucket.entries.push(interestEntry);
            allExpenseEntries.push(interestEntry);
          }
        }
        break;
      }
      default:
        break;
    }
  }

  const totalAllocatedOutflow =
    totalExpense + totalDebtPayment + totalSaving + totalInvestment;
  const rawNetBalance = totalIncome - totalAllocatedOutflow;
  const netSurplus = Math.max(0, rawNetBalance);
  const netDeficit = Math.max(0, -rawNetBalance);

  return {
    incomeCategoryMap,
    expenseCategoryMap,
    savingEntries,
    investmentEntries,
    debtEntries,
    allIncomeEntries,
    allExpenseEntries,
    totalIncome,
    totalExpense,
    totalDebtPayment,
    totalSaving,
    totalInvestment,
    totalAllocatedOutflow,
    rawNetBalance,
    netSurplus,
    netDeficit,
  };
}

export function aggregatePeriodCashFlowIndexed(
  indexedEntries: ReadonlyArray<IndexedSankeyTransaction>,
  debts: Debt[] = []
): PeriodCashFlowAggregation {
  return accumulateCashFlowFromClassified(indexedEntries, debts);
}

export function aggregatePeriodCashFlow(
  filteredTransactions: Transaction[],
  debts: Debt[] = []
): PeriodCashFlowAggregation {
  const classified: IndexedSankeyTransaction[] = new Array(filteredTransactions.length);
  for (let i = 0; i < filteredTransactions.length; i += 1) {
    const tx = filteredTransactions[i];
    classified[i] = {
      tx,
      normalizedDate: normalizeLedgerDateYYYYMMDD(tx.date),
      nature: classifyTransaction(tx),
    };
  }
  return accumulateCashFlowFromClassified(classified, debts);
}
