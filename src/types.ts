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
  linkedFixedAssetId?: string;
  linkedFixedAssetAction?: 'buy';
  linkedEmergencyTxId?: string;
  linkedAccountId?: string;
  debtDisbursementMode?: 'cash' | 'direct_asset' | 'direct_expense';
  debtDisbursementCoaCode?: string;
  // Investment unit detail properties
  unitPrice?: number;
  units?: number;
  unitName?: string;
  // Non-cash Adjusting Entries properties
  isAdjustment?: boolean;
  adjustmentType?: 'investment_depreciation' | 'debt_interest_accrual' | 'fixed_asset_depreciation' | 'reconciliation';
  reconciliationEvidenceReference?: string;
  reconciliationEvidenceConfirmedAt?: string;
  reconciliationActualBalance?: number;
  reconciliationRecordedBalance?: number;
  adjustmentPeriodKey?: string; // e.g., YYYY-MM
  adjustmentRatePct?: number;
  adjustmentDurationDays?: number;
  linkedFixedAssetAdjustmentId?: string;
  previousRateEffectiveDate?: string;
  coaDebitCode?: string;
  coaCreditCode?: string;
  categoryHistory?: TransactionCategoryHistoryEntry[];
  linkedKprBreakdown?: {
    principalPart?: number;
    interestPart?: number;
    principalCoaCode?: string;
    interestCoaCode?: string;
    interestCategory?: string;
  };
}

export interface TransactionCategoryHistoryEntry {
  fromCategory: string;
  toCategory: string;
  changedAt: string;
  source?: string;
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

export type FixedAssetCategory =
  | 'Properti & Tanah'
  | 'Kendaraan'
  | 'Elektronik & Perangkat'
  | 'Mesin & Usaha'
  | 'Barang Berharga & Koleksi'
  | 'Lainnya';

export interface FixedAssetAdjustment {
  id: string;
  date: string; // YYYY-MM-DD
  type: 'appreciation' | 'depreciation'; // appreciation = penambahan nilai, depreciation = penyusutan manual
  amount: number;
  note: string;
  isAutoYearEnd?: boolean;
  periodKey?: string; // e.g. YYYY-12
}

export interface FixedAsset {
  id: string;
  name: string;
  category: FixedAssetCategory;
  purchasePrice: number; // Harga perolehan penuh atau harga properti KPR
  acquisitionDate: string; // YYYY-MM-DD
  annualRatePct: number; // + untuk apresiasi tahunan %, - untuk penyusutan tahunan %
  rateEffectiveDate?: string; // Tanggal acuan mulai perhitungan laju tahunan
  fundingMode: 'account_deduction' | 'direct_record' | 'kpr_linked';
  linkedAccountId?: string;
  linkedTransactionId?: string;
  linkedDebtId?: string;
  isKprLinked?: boolean;
  kprPaidPrincipalLock?: number;
  kprIsPaidOff?: boolean;
  manualAdjustments?: FixedAssetAdjustment[];
  notes?: string;
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
  openingDate?: string;
  openingBalanceEntryId?: string;
  dueDay?: number; // Hari jatuh tempo bulanan (1-31)
  interestRate?: number; // Suku bunga tahunan % (APR) untuk CC/PayLater
  minPayment?: number; // Cicilan/pembayaran minimum bulanan (Rp) untuk CC/PayLater
  coaCode?: string; // Explicit mapped Master COA Code (e.g. '1200', '1100')
}

export interface JournalEntry {
  id: string;
  date: string;
  description: string;
  transactionId?: string;
  sourceType: 'transaction' | 'opening_balance' | 'adjustment';
  evidenceReference?: string;
  evidenceConfirmedAt?: string;
  reconciliationActualBalance?: number;
}

export interface JournalLine {
  id: string;
  journalEntryId: string;
  lineNumber: 1 | 2;
  coaCode: string;
  debit: number;
  credit: number;
  transactionId?: string;
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
  fixedAssets?: FixedAsset[];
  recurringTransactions?: RecurringTransaction[];
  savingsGoals?: SavingsGoal[];
  investmentGoals?: InvestmentGoal[];
}
