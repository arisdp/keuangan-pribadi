import { Debt, Transaction } from '../types';
import {
  classifyTransaction,
  normalizeLedgerDateYYYYMMDD,
  resolveDebtInstallmentAccounting,
  toLocalYYYYMMDD,
} from './accountingEngine';

export type SankeyPeriodMode = 'all' | 'monthly' | 'quarterly' | 'yearly';
export type QuarterNum = 1 | 2 | 3 | 4;

export interface SankeyLedgerEntry {
  tx: Transaction;
  effectiveAmount: number;
  attributionLabel?: string;
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

export function aggregatePeriodCashFlow(
  filteredTransactions: Transaction[],
  debts: Debt[] = []
): PeriodCashFlowAggregation {
  const debtLookup = new Map<string, Debt>();
  debts.forEach((d) => debtLookup.set(d.id, d));

  const incomeCategoryMap: Record<string, { total: number; entries: SankeyLedgerEntry[] }> = {};
  const expenseCategoryMap: Record<string, { total: number; entries: SankeyLedgerEntry[] }> = {};
  const savingEntries: SankeyLedgerEntry[] = [];
  const investmentEntries: SankeyLedgerEntry[] = [];
  const debtEntries: SankeyLedgerEntry[] = [];
  const allIncomeEntries: SankeyLedgerEntry[] = [];
  const allExpenseEntries: SankeyLedgerEntry[] = [];

  let totalSaving = 0;
  let totalInvestment = 0;
  let totalDebtPayment = 0;

  filteredTransactions.forEach((tx) => {
    const amt = Math.abs(tx.amount || 0);
    if (amt <= 0) return;

    const nature = classifyTransaction(tx);
    switch (nature) {
      case 'operating_income': {
        const cat = tx.category || 'Pendapatan Lain-lain';
        if (!incomeCategoryMap[cat]) incomeCategoryMap[cat] = { total: 0, entries: [] };
        incomeCategoryMap[cat].total += amt;
        const entry: SankeyLedgerEntry = { tx, effectiveAmount: amt };
        incomeCategoryMap[cat].entries.push(entry);
        allIncomeEntries.push(entry);
        break;
      }
      case 'operating_expense': {
        const cat = tx.category || 'Beban Lainnya';
        if (!expenseCategoryMap[cat]) expenseCategoryMap[cat] = { total: 0, entries: [] };
        expenseCategoryMap[cat].total += amt;
        const entry: SankeyLedgerEntry = { tx, effectiveAmount: amt };
        expenseCategoryMap[cat].entries.push(entry);
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
            if (!expenseCategoryMap[interestCat]) {
              expenseCategoryMap[interestCat] = { total: 0, entries: [] };
            }
            expenseCategoryMap[interestCat].total += interestAmt;
            const interestEntry: SankeyLedgerEntry = {
              tx,
              effectiveAmount: interestAmt,
              attributionLabel: 'Porsi Bunga KPR/Utang',
            };
            expenseCategoryMap[interestCat].entries.push(interestEntry);
            allExpenseEntries.push(interestEntry);
          }
        }
        break;
      }
      default:
        break;
    }
  });

  const totalIncome = Object.values(incomeCategoryMap).reduce((s, item) => s + item.total, 0);
  const totalExpense = Object.values(expenseCategoryMap).reduce((s, item) => s + item.total, 0);
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
