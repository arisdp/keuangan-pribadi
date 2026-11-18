import {
  Account,
  Debt,
  EmergencyFundTransaction,
  InvestmentAsset,
  Transaction,
} from '../types';

/**
 * Klasifikasi sifat akuntansi transaksi agar Laba Rugi Operasional terpisah
 * dari pembayaran pokok utang, pencairan pinjaman, mutasi internal, dan swap aset.
 */
export type TransactionAccountingNature =
  | 'operating_income'
  | 'operating_expense'
  | 'internal_transfer'
  | 'debt_principal_pay'
  | 'debt_proceeds'
  | 'emergency_fund_transfer'
  | 'investment_buy'
  | 'investment_sell'
  | 'equity_injection'
  | 'non_cash_adjustment';

const DEBT_PAY_CATEGORIES = new Set([
  'cicilan / pelunasan utang',
  'cicilan kpr',
  'pelunasan utang',
  'pembayaran utang',
  'bayar cicilan',
  'pembayaran kpr',
]);

const DEBT_PROCEEDS_CATEGORIES = new Set([
  'penerimaan utang baru',
  'pengeluaran pencairan pinjaman',
  'pencairan utang',
  'pencairan pinjaman',
  'pencairan kpr',
]);

const EMERGENCY_CATEGORIES = new Set([
  'tabungan darurat',
  'pencairan dana darurat',
  'penarikan dana darurat',
]);

const EQUITY_CATEGORIES = new Set([
  'modal awal keuangan',
  'modal awal',
]);

export function isCreditAccount(acc?: Pick<Account, 'type'> | null): boolean {
  if (!acc) return false;
  return acc.type === 'credit-card' || acc.type === 'paylater';
}

export function getLiquidAccounts(accounts: Account[]): Account[] {
  return (accounts || []).filter((a) => !isCreditAccount(a));
}

export function getCreditAccounts(accounts: Account[]): Account[] {
  return (accounts || []).filter((a) => isCreditAccount(a));
}

export function getAccountCreditBill(acc: Account): number {
  if (!isCreditAccount(acc)) return 0;
  if (typeof acc.usedLimit === 'number' && Number.isFinite(acc.usedLimit)) {
    return Math.max(0, acc.usedLimit);
  }
  const limit = acc.creditLimit ?? acc.startingBalance ?? 0;
  return Math.max(0, limit - (acc.currentBalance || 0));
}

export function calculateTotalLiquidCash(accounts: Account[]): number {
  return getLiquidAccounts(accounts).reduce((sum, a) => sum + (a.currentBalance || 0), 0);
}

export function calculateCreditPaylaterBills(accounts: Account[]): number {
  return getCreditAccounts(accounts).reduce((sum, a) => sum + getAccountCreditBill(a), 0);
}

export function calculateTotalEmergencyFund(
  emergencyTransactions: EmergencyFundTransaction[]
): number {
  return (emergencyTransactions || []).reduce((sum, tx) => {
    const amt = Math.abs(tx.amount || 0);
    return tx.type === 'addition' ? sum + amt : sum - amt;
  }, 0);
}

export function calculateTotalInvestments(investments: InvestmentAsset[]): number {
  return (investments || []).reduce((sum, inv) => sum + (inv.balance || 0), 0);
}

export function calculateTotalDebts(accounts: Account[], debts: Debt[]): number {
  const loanDebts = (debts || []).reduce((sum, d) => sum + Math.max(0, d.balance || 0), 0);
  return loanDebts + calculateCreditPaylaterBills(accounts);
}

export function calculateMonthlyDebtService(accounts: Account[], debts: Debt[]): number {
  const loanMin = (debts || [])
    .filter((d) => (d.balance || 0) > 0)
    .reduce((sum, d) => sum + Math.max(0, d.minPayment || 0), 0);

  const creditMin = getCreditAccounts(accounts).reduce((sum, acc) => {
    const bill = getAccountCreditBill(acc);
    if (bill <= 0) return sum;
    if (typeof acc.minPayment === 'number' && acc.minPayment >= 0) {
      return sum + acc.minPayment;
    }
    return sum + Math.max(bill * 0.1, 50000);
  }, 0);

  return loanMin + creditMin;
}

export function getTransactionAccountDelta(
  tx: Pick<Transaction, 'type' | 'amount' | 'isAdjustment'>
): number {
  if (tx.isAdjustment) return 0;
  const amount = Number(tx.amount) || 0;
  return tx.type === 'income' ? amount : -amount;
}

export function applyAccountBalanceChange(acc: Account, delta: number): Account {
  const nextBalance = (acc.currentBalance || 0) + delta;
  if (!isCreditAccount(acc)) {
    return {
      ...acc,
      currentBalance: nextBalance,
    };
  }

  const limit = acc.creditLimit ?? acc.startingBalance ?? 0;
  return {
    ...acc,
    currentBalance: nextBalance,
    usedLimit: Math.max(0, limit - nextBalance),
  };
}

export function calculateAccountGLBalance(
  acc: Account,
  transactions: Transaction[]
): {
  startingBal: number;
  initialDebt: number;
  calculatedDelta: number;
  glCalculatedBalance: number;
  recordedBalance: number;
  difference: number;
  txCount: number;
} {
  let calculatedDelta = 0;
  let txCount = 0;

  (transactions || []).forEach((tx) => {
    if (tx && !tx.isAdjustment && tx.accountId === acc.id) {
      txCount += 1;
      calculatedDelta += getTransactionAccountDelta(tx);
    }
  });

  const startingBal = acc.startingBalance || 0;
  const initialDebt = isCreditAccount(acc) ? (acc.initialDebt || 0) : 0;
  const glCalculatedBalance = startingBal - initialDebt + calculatedDelta;
  const recordedBalance = acc.currentBalance || 0;
  const difference = recordedBalance - glCalculatedBalance;

  return {
    startingBal,
    initialDebt,
    calculatedDelta,
    glCalculatedBalance,
    recordedBalance,
    difference,
    txCount,
  };
}

export function classifyTransaction(
  tx: Pick<
    Transaction,
    'type' | 'category' | 'linkedDebtAction' | 'linkedInvestmentAction' | 'isAdjustment' | 'adjustmentType'
  >
): TransactionAccountingNature {
  const catLower = (tx.category || '').trim().toLowerCase();

  if (
    tx.isAdjustment ||
    catLower === 'depresiasi aset investasi' ||
    catLower === 'akrual bunga utang'
  ) {
    return 'non_cash_adjustment';
  }

  if (
    catLower === 'mutasi masuk' ||
    catLower === 'mutasi keluar' ||
    catLower.startsWith('mutasi ')
  ) {
    return 'internal_transfer';
  }

  if (tx.linkedDebtAction === 'pay' || DEBT_PAY_CATEGORIES.has(catLower)) {
    return 'debt_principal_pay';
  }

  if (tx.linkedDebtAction === 'create' || DEBT_PROCEEDS_CATEGORIES.has(catLower)) {
    return 'debt_proceeds';
  }

  if (EQUITY_CATEGORIES.has(catLower)) {
    return 'equity_injection';
  }

  if (tx.type === 'saving' || EMERGENCY_CATEGORIES.has(catLower)) {
    return 'emergency_fund_transfer';
  }

  if (tx.linkedInvestmentAction === 'buy' || tx.type === 'investment') {
    return 'investment_buy';
  }

  if (tx.linkedInvestmentAction === 'sell' || catLower === 'penjualan investasi') {
    return 'investment_sell';
  }

  return tx.type === 'income' ? 'operating_income' : 'operating_expense';
}

export function isOperatingIncome(tx: Transaction): boolean {
  return classifyTransaction(tx) === 'operating_income';
}

export function isOperatingExpense(tx: Transaction): boolean {
  return classifyTransaction(tx) === 'operating_expense';
}

export function isInternalTransfer(tx: Pick<Transaction, 'category' | 'type' | 'linkedDebtAction' | 'linkedInvestmentAction'>): boolean {
  return classifyTransaction(tx) === 'internal_transfer';
}

export interface IncomeStatementSummary {
  operatingIncome: number;
  operatingExpense: number;
  netOperatingProfit: number;
  debtPrincipalPayments: number;
  debtProceedsIn: number;
  debtProceedsOut: number;
  investmentPurchases: number;
  investmentSales: number;
  emergencyAdditions: number;
  emergencyWithdrawals: number;
  nonCashAdjustments: number;
}

export function calculateIncomeStatementSummary(
  transactions: Transaction[]
): IncomeStatementSummary {
  let operatingIncome = 0;
  let operatingExpense = 0;
  let debtPrincipalPayments = 0;
  let debtProceedsIn = 0;
  let debtProceedsOut = 0;
  let investmentPurchases = 0;
  let investmentSales = 0;
  let emergencyAdditions = 0;
  let emergencyWithdrawals = 0;
  let nonCashAdjustments = 0;

  (transactions || []).forEach((tx) => {
    const amt = Math.abs(tx.amount || 0);
    const nature = classifyTransaction(tx);
    switch (nature) {
      case 'operating_income':
        operatingIncome += amt;
        break;
      case 'operating_expense':
        operatingExpense += amt;
        break;
      case 'debt_principal_pay':
        debtPrincipalPayments += amt;
        break;
      case 'debt_proceeds':
        if (tx.type === 'income') debtProceedsIn += amt;
        else debtProceedsOut += amt;
        break;
      case 'investment_buy':
        investmentPurchases += amt;
        break;
      case 'investment_sell':
        investmentSales += amt;
        break;
      case 'emergency_fund_transfer':
        if (tx.type === 'income') emergencyWithdrawals += amt;
        else emergencyAdditions += amt;
        break;
      case 'non_cash_adjustment':
        nonCashAdjustments += amt;
        break;
      default:
        break;
    }
  });

  return {
    operatingIncome,
    operatingExpense,
    netOperatingProfit: operatingIncome - operatingExpense,
    debtPrincipalPayments,
    debtProceedsIn,
    debtProceedsOut,
    investmentPurchases,
    investmentSales,
    emergencyAdditions,
    emergencyWithdrawals,
    nonCashAdjustments,
  };
}

export interface CashFlowSummary {
  operatingInflows: number;
  operatingOutflows: number;
  netOperating: number;
  investmentInflows: number;
  investmentOutflows: number;
  savingInflows: number;
  savingOutflows: number;
  netInvesting: number;
  financingInflows: number;
  financingOutflows: number;
  debtPaymentOutflows: number;
  debtProceedsInflows: number;
  netFinancing: number;
  netCashChange: number;
}

export function calculateCashFlowStatement(
  transactions: Transaction[]
): CashFlowSummary {
  const inc = calculateIncomeStatementSummary(transactions);

  const operatingInflows = inc.operatingIncome;
  const operatingOutflows = inc.operatingExpense;
  const netOperating = operatingInflows - operatingOutflows;

  // Aktivitas Investasi & Cadangan Aset (Investasi + Dana Darurat)
  const investmentInflows = inc.investmentSales;
  const investmentOutflows = inc.investmentPurchases;
  const savingInflows = inc.emergencyWithdrawals;
  const savingOutflows = inc.emergencyAdditions;
  const netInvesting =
    investmentInflows + savingInflows - (investmentOutflows + savingOutflows);

  // Aktivitas Pendanaan (Pencairan Pinjaman Baru & Pembayaran Pokok Utang/KPR)
  const debtProceedsInflows = inc.debtProceedsIn;
  const debtPaymentOutflows = inc.debtPrincipalPayments + inc.debtProceedsOut;
  const financingInflows = debtProceedsInflows;
  const financingOutflows = debtPaymentOutflows;
  const netFinancing = financingInflows - financingOutflows;

  const netCashChange = netOperating + netInvesting + netFinancing;

  return {
    operatingInflows,
    operatingOutflows,
    netOperating,
    investmentInflows,
    investmentOutflows,
    savingInflows,
    savingOutflows,
    netInvesting,
    financingInflows,
    financingOutflows,
    debtPaymentOutflows,
    debtProceedsInflows,
    netFinancing,
    netCashChange,
  };
}

export interface BalanceSheetSummary {
  liquidAssets: number;
  emergencyAssets: number;
  investmentAssets: number;
  totalAssets: number;
  creditCardPaylaterBills: number;
  activeDebtsBalance: number;
  totalLiabilities: number;
  equity: number;
  isBalanced: boolean;
}

export function calculateBalanceSheet(
  accounts: Account[],
  emergencyTransactions: EmergencyFundTransaction[],
  investments: InvestmentAsset[],
  debts: Debt[]
): BalanceSheetSummary {
  const liquidAssets = calculateTotalLiquidCash(accounts);
  const emergencyAssets = calculateTotalEmergencyFund(emergencyTransactions);
  const investmentAssets = calculateTotalInvestments(investments);
  const totalAssets = liquidAssets + emergencyAssets + investmentAssets;

  const creditCardPaylaterBills = calculateCreditPaylaterBills(accounts);
  const activeDebtsBalance = (debts || []).reduce((sum, d) => sum + Math.max(0, d.balance || 0), 0);
  const totalLiabilities = creditCardPaylaterBills + activeDebtsBalance;

  const equity = totalAssets - totalLiabilities;
  const isBalanced = Math.abs(totalAssets - (totalLiabilities + equity)) < 1;

  return {
    liquidAssets,
    emergencyAssets,
    investmentAssets,
    totalAssets,
    creditCardPaylaterBills,
    activeDebtsBalance,
    totalLiabilities,
    equity,
    isBalanced,
  };
}

export interface NetWorthHistoryPoint {
  date: string;
  netWorth: number;
  assets: number;
  debts: number;
  ratio: number;
  status: 'Sehat' | 'Waspada' | 'Kritis';
}

export function calculateNetWorthHistory30Days(
  transactions: Transaction[],
  accounts: Account[],
  currentAssets: number,
  currentDebts: number,
  systemTodayStr: string
): NetWorthHistoryPoint[] {
  const accountTypeMap = new Map<string, Account>();
  (accounts || []).forEach((a) => accountTypeMap.set(a.id, a));

  const today = new Date(`${systemTodayStr}T00:00:00`);
  const points: NetWorthHistoryPoint[] = [];

  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${day}`;

    const txsAfter = (transactions || []).filter(
      (tx) => tx.date > dateStr && tx.date <= systemTodayStr
    );

    let rolledAssets = currentAssets;
    let rolledDebts = currentDebts;

    txsAfter.forEach((tx) => {
      const amt = Math.abs(tx.amount || 0);
      const nature = classifyTransaction(tx);
      const acc = accountTypeMap.get(tx.accountId);
      const onCreditCard = isCreditAccount(acc);

      switch (nature) {
        case 'operating_income':
        case 'equity_injection':
          if (onCreditCard) {
            // Refund/credit ke kartu kredit mengurangi tagihan utang CC
            rolledDebts += amt;
          } else {
            rolledAssets -= amt;
          }
          break;
        case 'operating_expense':
          if (onCreditCard) {
            // Belanja kartu kredit meningkatkan utang CC saat terjadi; rollback menguranginya
            rolledDebts -= amt;
          } else {
            rolledAssets += amt;
          }
          break;
        case 'debt_principal_pay':
          // Membayar pokok utang mengurangi kas & mengurangi utang secara bersamaan -> netral terhadap Net Worth
          rolledAssets += amt;
          rolledDebts += amt;
          break;
        case 'debt_proceeds':
          if (tx.type === 'income') {
            rolledAssets -= amt;
            rolledDebts -= amt;
          } else {
            rolledAssets += amt;
            rolledDebts -= amt;
          }
          break;
        case 'internal_transfer':
          if (onCreditCard && tx.type === 'income') {
            // Transfer pembayaran ke CC menurunkan utang CC & menurunkan aset likuid -> netral
            rolledDebts += amt;
          } else if (onCreditCard && tx.type === 'expense') {
            rolledDebts -= amt;
          }
          // Transfer antar akun likuid berdampak 0 pada total aset & utang
          break;
        case 'emergency_fund_transfer':
        case 'investment_buy':
        case 'investment_sell':
          // Pemindahan antar pos aset (Kas <-> Dana Darurat / Investasi) berdampak 0 pada Total Aset & Net Worth
          break;
        case 'non_cash_adjustment':
          if (tx.adjustmentType === 'debt_interest_accrual') {
            rolledDebts -= amt;
          } else {
            rolledAssets += amt;
          }
          break;
      }
    });

    const rolledNetWorth = rolledAssets - rolledDebts;
    const ratio = rolledAssets > 0 ? (rolledDebts / rolledAssets) * 100 : rolledDebts > 0 ? 100 : 0;
    let status: 'Sehat' | 'Waspada' | 'Kritis' = 'Sehat';
    if (rolledDebts > 0) {
      if (ratio <= 35) status = 'Sehat';
      else if (ratio <= 75) status = 'Waspada';
      else status = 'Kritis';
    }

    points.push({
      date: d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }),
      netWorth: rolledNetWorth,
      assets: rolledAssets,
      debts: rolledDebts,
      ratio,
      status,
    });
  }

  return points;
}

export interface CFPHealthRatiosResult {
  monthlyIncome: number;
  monthlyExpense: number;
  monthlySavingsAndInvest: number;
  monthlyDebtService: number;
  liquidCash: number;
  emergencyBalance: number;
  totalInvestmentValue: number;
  totalAssets: number;
  totalLiabilities: number;
  currentLiabilities: number;
  netWorth: number;
  dtiRatio: number;
  dtiStatus: 'ideal' | 'warning' | 'danger';
  savingsRatio: number;
  savingsStatus: 'ideal' | 'warning' | 'danger';
  emergencyMonths: number;
  emergencyStatus: 'ideal' | 'warning' | 'danger';
  liquidityRatio: number;
  liquidityStatus: 'ideal' | 'warning' | 'danger';
  solvencyRatio: number;
  healthScore: number;
}

export function calculateCFPFinancialHealthRatios(
  transactions: Transaction[],
  accounts: Account[],
  debts: Debt[],
  investments: InvestmentAsset[],
  emergencyTransactions: EmergencyFundTransaction[] = []
): CFPHealthRatiosResult {
  const now = new Date();
  const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const monthTxs = (transactions || []).filter(
    (tx) => tx.date && tx.date.startsWith(currentYM)
  );
  const incSummary = calculateIncomeStatementSummary(monthTxs);

  const monthlyIncome = incSummary.operatingIncome;
  const monthlyExpense = incSummary.operatingExpense;
  const monthlySavingsAndInvest = incSummary.emergencyAdditions + incSummary.investmentPurchases;

  const monthlyDebtService = calculateMonthlyDebtService(accounts, debts);

  const liquidCash = calculateTotalLiquidCash(accounts);
  const emergencyBalance = calculateTotalEmergencyFund(emergencyTransactions);
  const totalInvestmentValue = calculateTotalInvestments(investments);
  const totalAssets = liquidCash + emergencyBalance + totalInvestmentValue;

  const creditLiabilities = calculateCreditPaylaterBills(accounts);
  const loanDebts = (debts || []).reduce((sum, d) => sum + Math.max(0, d.balance || 0), 0);
  const totalLiabilities = loanDebts + creditLiabilities;
  const currentLiabilities = creditLiabilities;

  const netWorth = totalAssets - totalLiabilities;

  const dtiRatio = monthlyIncome > 0 ? (monthlyDebtService / monthlyIncome) * 100 : 0;
  let dtiStatus: 'ideal' | 'warning' | 'danger' = 'ideal';
  if (dtiRatio > 40) dtiStatus = 'danger';
  else if (dtiRatio > 30) dtiStatus = 'warning';

  const savingsRatio = monthlyIncome > 0 ? (monthlySavingsAndInvest / monthlyIncome) * 100 : 0;
  let savingsStatus: 'ideal' | 'warning' | 'danger' = 'ideal';
  if (savingsRatio < 10) savingsStatus = 'danger';
  else if (savingsRatio < 20) savingsStatus = 'warning';

  const totalLiquidReserve = liquidCash + emergencyBalance;
  const emergencyMonths = monthlyExpense > 0 ? totalLiquidReserve / monthlyExpense : 0;
  let emergencyStatus: 'ideal' | 'warning' | 'danger' = 'ideal';
  if (emergencyMonths < 3) emergencyStatus = 'danger';
  else if (emergencyMonths < 6) emergencyStatus = 'warning';

  const liquidityRatio =
    currentLiabilities > 0 ? totalLiquidReserve / currentLiabilities : 99;
  let liquidityStatus: 'ideal' | 'warning' | 'danger' = 'ideal';
  if (liquidityRatio < 1.0) liquidityStatus = 'danger';
  else if (liquidityRatio < 1.5) liquidityStatus = 'warning';

  const solvencyRatio = totalAssets > 0 ? (netWorth / totalAssets) * 100 : 100;

  let score = 100;
  if (dtiStatus === 'danger') score -= 25;
  else if (dtiStatus === 'warning') score -= 12;

  if (savingsStatus === 'danger') score -= 25;
  else if (savingsStatus === 'warning') score -= 12;

  if (emergencyStatus === 'danger') score -= 25;
  else if (emergencyStatus === 'warning') score -= 12;

  if (liquidityStatus === 'danger') score -= 25;
  else if (liquidityStatus === 'warning') score -= 12;

  const healthScore = Math.max(0, Math.min(100, score));

  return {
    monthlyIncome,
    monthlyExpense,
    monthlySavingsAndInvest,
    monthlyDebtService,
    liquidCash,
    emergencyBalance,
    totalInvestmentValue,
    totalAssets,
    totalLiabilities,
    currentLiabilities,
    netWorth,
    dtiRatio,
    dtiStatus,
    savingsRatio,
    savingsStatus,
    emergencyMonths,
    emergencyStatus,
    liquidityRatio,
    liquidityStatus,
    solvencyRatio,
    healthScore,
  };
}
