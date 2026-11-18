export type TransactionType = 'income' | 'expense' | 'saving' | 'investment';

export interface Transaction {
  id: string;
  date: string;
  accountId: string;
  type: TransactionType;
  category: string;
  description: string;
  amount: number;
  // Optional linked properties for unified inputs
  linkedDebtId?: string;
  linkedDebtAction?: 'create' | 'pay';
  linkedInvestmentId?: string;
  linkedInvestmentAction?: 'buy' | 'sell';
  linkedEmergencyTxId?: string;
  // Investment unit detail properties
  unitPrice?: number;
  units?: number;
  unitName?: string;
  // Non-cash Adjusting Entries properties
  isAdjustment?: boolean;
  adjustmentType?: 'investment_depreciation' | 'debt_interest_accrual';
  adjustmentPeriodKey?: string; // e.g., YYYY-MM
  adjustmentRatePct?: number;
  adjustmentDurationDays?: number;
  coaDebitCode?: string;
  coaCreditCode?: string;
  linkedKprBreakdown?: {
    principalPart?: number;
    interestPart?: number;
  };
}

export interface RecurringTransaction {
  id: string;
  title: string;
  type: TransactionType;
  category: string;
  amount: number;
  accountId: string;
  frequency: 'monthly';
  dayOfMonth: number; // 1 to 31
  isActive: boolean;
  description?: string;
  lastProcessedDate?: string; // e.g. YYYY-MM-DD
}

export interface InvestmentPriceHistory {
  id: string;
  assetId: string;
  assetName: string;
  date: string;
  unitPrice: number;
  previousUnitPrice?: number;
  changePercentage?: number;
  note?: string;
}

export type RiskProfile = 'konservatif' | 'moderat' | 'agresif';

export interface AIDiversificationResult {
  riskProfile: RiskProfile;
  alignmentScore: number; // 0 - 100
  overallSummary: string;
  currentBreakdown: Array<{
    category: string;
    value: number;
    percentage: number;
  }>;
  recommendedBreakdown: Array<{
    category: string;
    recommendedPercentage: number;
    targetValue: number;
    action: 'Beli' | 'Jual' | 'Pertahankan';
    adjustmentAmount: number;
  }>;
  riskAssessment: string;
  tacticalSteps: string[];
}

export interface InvestmentAsset {
  id: string;
  name: string;
  category: string;
  balance: number;
  dateAdded: string;
  initialCapital?: number;
  quantity?: number; // Total kuantitas unit
  unitPrice?: number; // Harga per unit saat ini (Current Price per Unit)
  units?: number; // Total kuantitas unit (misal: 10 gram, 500 lembar, 1250 unit)
  unitName?: string; // Nama satuan (misal: 'Gram', 'Lot', 'Lembar', 'Unit', 'Keping')
  purchaseUnitPrice?: number; // Harga Beli Rata-rata per unit (Average Buy Price)
  currentUnitPrice?: number; // Harga Satuan Hari Ini (Current Unit Price)
  priceHistory?: InvestmentPriceHistory[];
  dividendsOrInterest?: number; // Akumulasi Hasil Pasif Dividen / Bunga / Kupon (Rp)
}

export type AccountType = 'cash' | 'bank' | 'e-wallet' | 'credit-card' | 'paylater';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  startingBalance: number;
  currentBalance: number;
  accountNumber?: string;
  creditLimit?: number;
  usedLimit?: number;
  initialDebt?: number;
  dueDay?: number; // Hari jatuh tempo bulanan (1-31)
  interestRate?: number; // Suku bunga tahunan % (APR) untuk CC/PayLater
  minPayment?: number; // Cicilan/pembayaran minimum bulanan (Rp) untuk CC/PayLater
  coaCode?: string; // Explicit mapped Master COA Code (e.g. '1200', '1100')
}

export interface CategoryBudget {
  category: string;
  type: 'expense' | 'saving' | 'investment';
  limit: number;
}

export interface KprCoaMappingConfig {
  propertyAssetCode: string; // e.g. '1600'
  principalLiabilityCode: string; // e.g. '2310'
  interestExpenseCode: string; // e.g. '5810'
  accruedInterestCode: string; // e.g. '2390'
  provisiAdminLegalCode: string; // e.g. '5820'
  taxInsuranceCode: string; // e.g. '5830'
  disbursementIncomeCategory: string; // e.g. 'Pencairan KPR'
  principalPaymentCategory: string; // e.g. 'Cicilan KPR'
  interestExpenseCategory: string; // e.g. 'Beban Bunga KPR'
}

export interface Debt {
  id: string;
  name: string;
  balance: number;
  interestRate: number; // Annual % (APR)
  minPayment: number;
  purpose: 'productive' | 'consumptive';
  category: string;
  dueDay?: number; // Hari jatuh tempo bulanan (1-31)
  dueDate?: string; // Tanggal Jatuh Tempo spesifik (YYYY-MM-DD)
  startDate?: string; // Tanggal mulai pinjaman (YYYY-MM-DD) untuk akrual bunga
  // Optional KPR (Kredit Pemilikan Rumah) metadata
  kprScheme?: 'annuity' | 'tiered' | 'flat';
  kprPresetId?: string;
  propertyPrice?: number;
  downPayment?: number;
  tenorMonths?: number;
  fixedRate?: number;
  fixedYears?: number;
  floatingRate?: number;
  kprFeesSummary?: {
    provisiFee: number;
    adminFee: number;
    appraisalFee?: number;
    notaryAjbFee: number;
    bphtbTax: number;
    insuranceFee: number;
    totalClosingCosts: number;
  };
  kprCoaSnapshot?: Partial<KprCoaMappingConfig>;
}

export interface DebtPayment {
  id: string;
  debtId: string;
  date: string;
  amountPaid: number;
}

export interface EmergencyFundConfig {
  jobStability: 'high' | 'medium' | 'low';
  dependents: number;
  monthlyExpense: number;
}

export interface EmergencyFundTransaction {
  id: string;
  date: string;
  type: 'addition' | 'reduction';
  amount: number;
  location: string;
  description: string;
  linkedTransactionId?: string;
}

export interface AIAnalysisResult {
  summary: string;
  analysis: Array<{
    category: string;
    percentageOfTotal: number;
    status: string;
    insight: string;
  }>;
  budgetSuggestions: Array<{
    category: string;
    currentBudget: number;
    recommendedBudget: number;
    reason: string;
  }>;
  debtAdvice: string;
  emergencyFundAdvice: string;
  investmentAdvice?: string;
  disciplineTips: string[];
}

export interface AIMonthlyComparisonResult {
  currentMonthName: string;
  previousMonthName: string;
  totalCurrentMonthExpense: number;
  totalPreviousMonthExpense: number;
  differenceAmount: number;
  percentageChange: number;
  trendStatus: 'Meningkat' | 'Penghematan' | 'Stabil';
  overallSummary: string;
  categoryComparisons: Array<{
    category: string;
    previousMonthAmount: number;
    currentMonthAmount: number;
    differenceAmount: number;
    percentageChange: number;
    trend: 'Naik' | 'Turun' | 'Sama';
    insight: string;
  }>;
  topIncreaseCategory?: {
    category: string;
    increaseAmount: number;
    reason: string;
  };
  topSavingsCategory?: {
    category: string;
    savingsAmount: number;
    reason: string;
  };
  actionableRecommendations: string[];
}

export interface CategoryConsolidationSource {
  name: string;
  txCount: number;
  totalAmount: number;
  sampleDescriptions: string[];
}

export interface CategoryConsolidationGroup {
  id: string;
  targetMasterCategory: string;
  transactionType: TransactionType;
  sourceCategories: CategoryConsolidationSource[];
  affectedTxCount: number;
  affectedTotalAmount: number;
  confidence: 'high' | 'medium';
  reason: string;
}

export interface AICategoryConsolidationResult {
  totalUniqueCategories: number;
  totalTransactionsScanned: number;
  recommendedMasterCountAfterMerge: number;
  efficiencyGainPercent: number;
  overallSummary: string;
  consolidationGroups: CategoryConsolidationGroup[];
  isFallback?: boolean;
}

export interface User {
  username: string;
  fullName: string;
  password?: string;
  isPremium?: boolean;
  uid?: string;
}

export interface SavingsGoal {
  id: string;
  title: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string; // YYYY-MM-DD
  category?: string;
  notes?: string;
}

export interface InvestmentGoal {
  id: string;
  title: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string; // YYYY-MM-DD
  category?: string;
  linkedAssetId?: string;
  notes?: string;
  monthlyContribution?: number; // Routine top-up per month (Rp)
  annualReturnRate?: number; // Expected annual return % (e.g., 8, 10)
}

export interface KprPreset {
  id: string;
  name: string;
  description: string;
  scheme: 'annuity' | 'tiered' | 'flat';
  tenorYears: number;
  dpPercent: number;
  annualRate: number;
  fixedRate: number;
  fixedYears: number;
  floatingRate: number;
  floatingCapRate?: number;
  earlyRepaymentPenaltyPct?: number;
  provisiPct: number;
  adminFee: number;
  appraisalFee?: number;
  notaryAjbPct: number;
  bphtbPct: number;
  insurancePct: number;
  coaMappingOverrides?: Partial<
    Pick<
      KprCoaMappingConfig,
      'propertyAssetCode' | 'principalLiabilityCode' | 'interestExpenseCode' | 'provisiAdminLegalCode' | 'taxInsuranceCode'
    >
  >;
  isDefault?: boolean;
}

export interface UserFinancialData {
  transactions: Transaction[];
  accounts: Account[];
  budgets: CategoryBudget[];
  debts: Debt[];
  emergencyFund: EmergencyFundConfig;
  emergencyTransactions: EmergencyFundTransaction[];
  investments: InvestmentAsset[];
  recurringTransactions?: RecurringTransaction[];
  savingsGoals?: SavingsGoal[];
  investmentGoals?: InvestmentGoal[];
}
