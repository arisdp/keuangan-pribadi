import { pgTable, text, timestamp, integer, decimal, boolean, jsonb } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  password: text('password').notNull(),
  passwordHash: text('password_hash'),
  email: text('email').unique(),
  fullName: text('full_name').notNull(),
  isPremium: boolean('is_premium').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const accounts = pgTable('accounts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  type: text('type').notNull(), 
  startingBalance: decimal('starting_balance', { precision: 15, scale: 2 }).notNull(),
  currentBalance: decimal('current_balance', { precision: 15, scale: 2 }).notNull(),
  accountNumber: text('account_number'),
  creditLimit: decimal('credit_limit', { precision: 15, scale: 2 }),
  usedLimit: decimal('used_limit', { precision: 15, scale: 2 }),
  initialDebt: decimal('initial_debt', { precision: 15, scale: 2 }),
  dueDay: integer('due_day'),
  interestRate: decimal('interest_rate', { precision: 5, scale: 2 }),
  minPayment: decimal('min_payment', { precision: 15, scale: 2 }),
  coaCode: text('coa_code'),
});

export const transactions = pgTable('transactions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  date: text('date').notNull(),
  accountId: text('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // 'income' | 'expense' | 'saving' | 'investment'
  category: text('category').notNull(),
  description: text('description').notNull(),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  linkedDebtId: text('linked_debt_id'),
  linkedDebtAction: text('linked_debt_action'),
  linkedInvestmentId: text('linked_investment_id'),
  linkedInvestmentAction: text('linked_investment_action'),
  linkedFixedAssetId: text('linked_fixed_asset_id'),
  linkedFixedAssetAction: text('linked_fixed_asset_action'),
  linkedEmergencyTxId: text('linked_emergency_tx_id'),
  unitPrice: decimal('unit_price', { precision: 15, scale: 2 }),
  units: decimal('units', { precision: 15, scale: 4 }),
  unitName: text('unit_name'),
  isAdjustment: boolean('is_adjustment').default(false),
  adjustmentType: text('adjustment_type'),
  adjustmentPeriodKey: text('adjustment_period_key'),
  adjustmentRatePct: decimal('adjustment_rate_pct', { precision: 6, scale: 2 }),
  adjustmentDurationDays: integer('adjustment_duration_days'),
  linkedFixedAssetAdjustmentId: text('linked_fixed_asset_adjustment_id'),
  previousRateEffectiveDate: text('previous_rate_effective_date'),
  coaDebitCode: text('coa_debit_code'),
  coaCreditCode: text('coa_credit_code'),
  linkedKprBreakdown: jsonb('linked_kpr_breakdown'),
});

export const recurringTransactions = pgTable('recurring_transactions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  type: text('type').notNull(),
  category: text('category').notNull(),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  accountId: text('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  frequency: text('frequency').notNull(),
  dayOfMonth: integer('day_of_month').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  description: text('description'),
  lastProcessedDate: text('last_processed_date'),
});

export const investments = pgTable('investments', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  category: text('category').notNull(),
  balance: decimal('balance', { precision: 15, scale: 2 }).notNull(),
  dateAdded: text('date_added').notNull(),
  initialCapital: decimal('initial_capital', { precision: 15, scale: 2 }),
  quantity: decimal('quantity', { precision: 15, scale: 4 }),
  unitPrice: decimal('unit_price', { precision: 15, scale: 2 }),
  units: decimal('units', { precision: 15, scale: 4 }),
  unitName: text('unit_name'),
  purchaseUnitPrice: decimal('purchase_unit_price', { precision: 15, scale: 2 }),
  currentUnitPrice: decimal('current_unit_price', { precision: 15, scale: 2 }),
  dividendsOrInterest: decimal('dividends_or_interest', { precision: 15, scale: 2 }),
});

export const investmentPriceHistory = pgTable('investment_price_history', {
  id: text('id').primaryKey(),
  assetId: text('asset_id').notNull().references(() => investments.id, { onDelete: 'cascade' }),
  assetName: text('asset_name').notNull(),
  date: text('date').notNull(),
  unitPrice: decimal('unit_price', { precision: 15, scale: 2 }).notNull(),
  previousUnitPrice: decimal('previous_unit_price', { precision: 15, scale: 2 }),
  changePercentage: decimal('change_percentage', { precision: 8, scale: 4 }),
  note: text('note'),
});

export const budgets = pgTable('budgets', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  category: text('category').notNull(),
  type: text('type').notNull(), // 'expense' | 'saving' | 'investment'
  limitAmount: decimal('limit_amount', { precision: 15, scale: 2 }).notNull(),
});

export const debts = pgTable('debts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  balance: decimal('balance', { precision: 15, scale: 2 }).notNull(),
  interestRate: decimal('interest_rate', { precision: 5, scale: 2 }).notNull(),
  minPayment: decimal('min_payment', { precision: 15, scale: 2 }).notNull(),
  purpose: text('purpose').notNull(),
  category: text('category').notNull(),
  dueDay: integer('due_day'),
  dueDate: text('due_date'),
  startDate: text('start_date'),
  kprScheme: text('kpr_scheme'),
  kprPresetId: text('kpr_preset_id'),
  propertyPrice: decimal('property_price', { precision: 15, scale: 2 }),
  downPayment: decimal('down_payment', { precision: 15, scale: 2 }),
  tenorMonths: integer('tenor_months'),
  fixedRate: decimal('fixed_rate', { precision: 5, scale: 2 }),
  fixedYears: integer('fixed_years'),
  floatingRate: decimal('floating_rate', { precision: 5, scale: 2 }),
  kprFeesSummary: jsonb('kpr_fees_summary'),
  kprCoaSnapshot: jsonb('kpr_coa_snapshot'),
});

export const fixedAssets = pgTable('fixed_assets', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  category: text('category').notNull(),
  purchasePrice: decimal('purchase_price', { precision: 15, scale: 2 }).notNull(),
  acquisitionDate: text('acquisition_date').notNull(),
  annualRatePct: decimal('annual_rate_pct', { precision: 6, scale: 2 }).notNull().default('0'),
  rateEffectiveDate: text('rate_effective_date'),
  fundingMode: text('funding_mode').notNull().default('direct_record'),
  linkedAccountId: text('linked_account_id'),
  linkedTransactionId: text('linked_transaction_id'),
  linkedDebtId: text('linked_debt_id'),
  isKprLinked: boolean('is_kpr_linked').default(false),
  kprPaidPrincipalLock: decimal('kpr_paid_principal_lock', { precision: 15, scale: 2 }),
  kprIsPaidOff: boolean('kpr_is_paid_off').default(false),
  manualAdjustments: jsonb('manual_adjustments'),
  notes: text('notes'),
});

export const debtPayments = pgTable('debt_payments', {
  id: text('id').primaryKey(),
  debtId: text('debt_id').notNull().references(() => debts.id, { onDelete: 'cascade' }),
  date: text('date').notNull(),
  amountPaid: decimal('amount_paid', { precision: 15, scale: 2 }).notNull(),
});

export const emergencyFundConfigs = pgTable('emergency_fund_configs', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  jobStability: text('job_stability').notNull(),
  dependents: integer('dependents').notNull(),
  monthlyExpense: decimal('monthly_expense', { precision: 15, scale: 2 }).notNull(),
});

export const emergencyFundTransactions = pgTable('emergency_fund_transactions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  date: text('date').notNull(),
  type: text('type').notNull(),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  location: text('location').notNull(),
  description: text('description').notNull(),
});

export const savingsGoals = pgTable('savings_goals', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  targetAmount: decimal('target_amount', { precision: 15, scale: 2 }).notNull(),
  currentAmount: decimal('current_amount', { precision: 15, scale: 2 }).notNull(),
  targetDate: text('target_date').notNull(),
  category: text('category'),
  notes: text('notes'),
});

export const userMasterConfigs = pgTable('user_master_configs', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  coaList: jsonb('coa_list'),
  masterCategories: jsonb('master_categories'),
  kprPresets: jsonb('kpr_presets'),
  kprCoaMapping: jsonb('kpr_coa_mapping'),
  masterChangeLogs: jsonb('master_change_logs'),
  investmentGoals: jsonb('investment_goals'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
