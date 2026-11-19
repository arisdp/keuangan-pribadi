import {
  Account,
  AccountType,
  Debt,
  EmergencyFundTransaction,
  InvestmentAsset,
  KprCoaMappingConfig,
  Transaction,
} from '../types';

export const ENGINE_DEFAULT_KPR_COA_MAPPING: KprCoaMappingConfig = {
  propertyAssetCode: '1600',
  principalLiabilityCode: '2310',
  interestExpenseCode: '5810',
  accruedInterestCode: '2390',
  provisiAdminLegalCode: '5820',
  taxInsuranceCode: '5830',
  disbursementIncomeCategory: 'Pencairan KPR',
  principalPaymentCategory: 'Cicilan KPR',
  interestExpenseCategory: 'Beban Bunga KPR',
};

export function resolveEffectiveKprCoaForEngine(
  baseMapping?: Partial<KprCoaMappingConfig>,
  debtSnapshot?: Partial<KprCoaMappingConfig>
): KprCoaMappingConfig {
  const base: KprCoaMappingConfig = {
    ...ENGINE_DEFAULT_KPR_COA_MAPPING,
    ...(baseMapping || {}),
  };
  if (!debtSnapshot) return base;
  return {
    propertyAssetCode: debtSnapshot.propertyAssetCode || base.propertyAssetCode,
    principalLiabilityCode: debtSnapshot.principalLiabilityCode || base.principalLiabilityCode,
    interestExpenseCode: debtSnapshot.interestExpenseCode || base.interestExpenseCode,
    accruedInterestCode: debtSnapshot.accruedInterestCode || base.accruedInterestCode,
    provisiAdminLegalCode: debtSnapshot.provisiAdminLegalCode || base.provisiAdminLegalCode,
    taxInsuranceCode: debtSnapshot.taxInsuranceCode || base.taxInsuranceCode,
    disbursementIncomeCategory: debtSnapshot.disbursementIncomeCategory || base.disbursementIncomeCategory,
    principalPaymentCategory: debtSnapshot.principalPaymentCategory || base.principalPaymentCategory,
    interestExpenseCategory: debtSnapshot.interestExpenseCategory || base.interestExpenseCategory,
  };
}

export interface KprInstallmentSplitResult {
  isKpr: boolean;
  scheme: 'annuity' | 'tiered' | 'flat';
  activeAnnualRate: number;
  phaseLabel: 'Fixed' | 'Floating' | 'Flat' | 'Anuitas';
  elapsedMonths: number;
  paymentAmount: number;
  principalPart: number;
  interestPart: number;
  remainingBalanceAfter: number;
  effectiveCoa: KprCoaMappingConfig;
  principalDebitCode: string;
  interestExpenseCode: string;
  interestExpenseCategory: string;
  creditAccountCoaCode?: string;
}

/**
 * Menghitung porsi pokok & bunga cicilan KPR/pinjaman secara otomatis berdasarkan
 * skema bunga (tiered fixed/floating, annuity, flat), umur pinjaman, dan mapping COA efektif.
 */
export function calculateKprInstallmentBreakdown(params: {
  debt: Pick<
    Debt,
    | 'name'
    | 'category'
    | 'balance'
    | 'interestRate'
    | 'startDate'
    | 'kprScheme'
    | 'propertyPrice'
    | 'downPayment'
    | 'fixedRate'
    | 'fixedYears'
    | 'floatingRate'
    | 'kprCoaSnapshot'
  >;
  paymentAmount: number;
  paymentDate?: string;
  baseCoaMapping?: Partial<KprCoaMappingConfig>;
  creditAccountCoaCode?: string;
}): KprInstallmentSplitResult {
  const { debt, paymentAmount, paymentDate, baseCoaMapping, creditAccountCoaCode } = params;
  const effectiveCoa = resolveEffectiveKprCoaForEngine(baseCoaMapping, debt.kprCoaSnapshot);
  const isKpr =
    debt.category === 'KPR / Properti' ||
    Boolean(debt.kprScheme) ||
    /\bkpr\b/i.test(debt.name || '');

  const scheme: 'annuity' | 'tiered' | 'flat' = debt.kprScheme || 'annuity';
  const rawRemBalance = Number(debt.balance);
  const remBalance = Number.isFinite(rawRemBalance) ? Math.max(0, rawRemBalance) : 0;
  const safePay = normalizeAbsAmount(paymentAmount);

  let elapsedMonths = 1;
  const payDateStr = (paymentDate || new Date().toISOString().split('T')[0]).slice(0, 10);
  const startStr = (debt.startDate || '').slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(startStr) && /^\d{4}-\d{2}-\d{2}$/.test(payDateStr)) {
    const [sy, sm] = startStr.split('-').map(Number);
    const [py, pm] = payDateStr.split('-').map(Number);
    elapsedMonths = Math.max(1, (py - sy) * 12 + (pm - sm) + 1);
  }

  let activeAnnualRate = Math.max(0, Number(debt.interestRate) || 0);
  let phaseLabel: 'Fixed' | 'Floating' | 'Flat' | 'Anuitas' = 'Anuitas';

  if (scheme === 'tiered') {
    const fixedMonths = Math.max(0, Math.round((debt.fixedYears || 0) * 12));
    if (fixedMonths > 0 && elapsedMonths <= fixedMonths) {
      activeAnnualRate = Math.max(0, Number(debt.fixedRate ?? debt.interestRate) || 0);
      phaseLabel = 'Fixed';
    } else {
      activeAnnualRate = Math.max(0, Number(debt.floatingRate ?? debt.interestRate) || 0);
      phaseLabel = 'Floating';
    }
  } else if (scheme === 'flat') {
    activeAnnualRate = Math.max(0, Number(debt.interestRate ?? debt.fixedRate) || 0);
    phaseLabel = 'Flat';
  } else {
    activeAnnualRate = Math.max(0, Number(debt.interestRate ?? debt.fixedRate) || 0);
    phaseLabel = 'Anuitas';
  }

  let rawMonthlyInterest = 0;
  if (remBalance > 0 && activeAnnualRate > 0) {
    if (scheme === 'flat' && debt.propertyPrice && debt.downPayment !== undefined) {
      const initialPrincipal = Math.max(remBalance, debt.propertyPrice - debt.downPayment);
      rawMonthlyInterest = Math.round(initialPrincipal * (activeAnnualRate / 100 / 12));
    } else {
      rawMonthlyInterest = Math.round(remBalance * (activeAnnualRate / 100 / 12));
    }
  }

  const interestPart = safePay > 0 ? Math.min(safePay, Math.max(0, rawMonthlyInterest)) : 0;
  const principalPart = Math.min(remBalance, Math.max(0, safePay - interestPart));
  const remainingBalanceAfter = Math.max(0, remBalance - principalPart);

  return {
    isKpr,
    scheme,
    activeAnnualRate,
    phaseLabel,
    elapsedMonths,
    paymentAmount: safePay,
    principalPart,
    interestPart,
    remainingBalanceAfter,
    effectiveCoa,
    principalDebitCode: isKpr ? effectiveCoa.principalLiabilityCode : '2300',
    interestExpenseCode: isKpr ? effectiveCoa.interestExpenseCode : '5810',
    interestExpenseCategory: isKpr ? effectiveCoa.interestExpenseCategory : 'Beban Bunga Pinjaman / KPR',
    creditAccountCoaCode,
  };
}

/**
 * Menyelaraskan rincian pokok/bunga & kode COA efektif pada transaksi cicilan utang/KPR
 * sebelum dicatat ke Jurnal Transaksi.
 */
export function resolveDebtInstallmentAccounting(params: {
  tx: Pick<
    Transaction,
    'amount' | 'date' | 'coaDebitCode' | 'coaCreditCode' | 'linkedKprBreakdown'
  >;
  debt: Debt;
  baseCoaMapping?: Partial<KprCoaMappingConfig>;
  sourceAccountCoaCode: string;
}): {
  linkedKprBreakdown?: Transaction['linkedKprBreakdown'];
  coaDebitCode?: string;
  coaCreditCode?: string;
  principalPayAmount: number;
  interestExpenseAmount: number;
} {
  const { tx, debt, baseCoaMapping, sourceAccountCoaCode } = params;
  const safeAmt = normalizeAbsAmount(tx.amount);
  const effectiveCoa = resolveEffectiveKprCoaForEngine(baseCoaMapping, debt.kprCoaSnapshot);
  const isKpr =
    debt.category === 'KPR / Properti' ||
    Boolean(debt.kprScheme) ||
    /\bkpr\b/i.test(debt.name || '');

  const principalCoaCode = isKpr ? effectiveCoa.principalLiabilityCode : '2300';
  const interestCoaCode = isKpr ? effectiveCoa.interestExpenseCode : '5810';
  const interestCategory = isKpr ? effectiveCoa.interestExpenseCategory : 'Beban Bunga Pinjaman / KPR';

  if (tx.linkedKprBreakdown) {
    const interestPart = Math.min(safeAmt, Math.max(0, Number(tx.linkedKprBreakdown.interestPart) || 0));
    const principalPart = Math.max(
      0,
      tx.linkedKprBreakdown.principalPart !== undefined
        ? Number(tx.linkedKprBreakdown.principalPart) || 0
        : safeAmt - interestPart
    );
    return {
      linkedKprBreakdown: {
        principalPart,
        interestPart,
        principalCoaCode: tx.linkedKprBreakdown.principalCoaCode || principalCoaCode,
        interestCoaCode: tx.linkedKprBreakdown.interestCoaCode || interestCoaCode,
        interestCategory: tx.linkedKprBreakdown.interestCategory || interestCategory,
      },
      coaDebitCode: tx.coaDebitCode || (isKpr ? effectiveCoa.principalLiabilityCode : undefined),
      coaCreditCode: tx.coaCreditCode || (isKpr ? sourceAccountCoaCode : undefined),
      principalPayAmount: principalPart,
      interestExpenseAmount: interestPart,
    };
  }

  // Hitung otomatis dari skema pinjaman KPR / berbunga
  const split = calculateKprInstallmentBreakdown({
    debt,
    paymentAmount: safeAmt,
    paymentDate: tx.date,
    baseCoaMapping,
    creditAccountCoaCode: sourceAccountCoaCode,
  });

  // Jika pelunasan persis sama dengan sisa pokok dan bukan angsuran berulang dengan bunga, tetap hormati jika >0 rate -> split otomatis
  const shouldAttachBreakdown = isKpr || (debt.interestRate || 0) > 0;
  if (!shouldAttachBreakdown) {
    return {
      coaDebitCode: tx.coaDebitCode,
      coaCreditCode: tx.coaCreditCode,
      principalPayAmount: safeAmt,
      interestExpenseAmount: 0,
    };
  }

  return {
    linkedKprBreakdown: {
      principalPart: split.principalPart,
      interestPart: split.interestPart,
      principalCoaCode: split.principalDebitCode,
      interestCoaCode: split.interestExpenseCode,
      interestCategory: split.interestExpenseCategory,
    },
    coaDebitCode: tx.coaDebitCode || (isKpr ? split.principalDebitCode : undefined),
    coaCreditCode: tx.coaCreditCode || (isKpr ? sourceAccountCoaCode : undefined),
    principalPayAmount: split.principalPart,
    interestExpenseAmount: split.interestPart,
  };
}

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
    const amt = normalizeAbsAmount(tx.amount);
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

export function normalizeAbsAmount(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? Math.abs(num) : 0;
}

export function getTransactionAccountDelta(
  tx: Pick<Transaction, 'type' | 'amount' | 'isAdjustment'>
): number {
  if (!tx || tx.isAdjustment) return 0;
  const amount = normalizeAbsAmount(tx.amount);
  if (amount === 0) return 0;
  return tx.type === 'income' ? amount : -amount;
}

export function applyAccountBalanceChange(acc: Account, delta: number): Account {
  const safeDelta = Number.isFinite(delta) ? delta : 0;
  const rawCurrentBalance = Number(acc?.currentBalance);
  const baseBalance = Number.isFinite(rawCurrentBalance) ? rawCurrentBalance : 0;
  const nextBalance = baseBalance + safeDelta;
  if (!isCreditAccount(acc)) {
    return {
      ...acc,
      currentBalance: nextBalance,
    };
  }

  const rawLimit = Number(acc.creditLimit ?? acc.startingBalance ?? 0);
  const limit = Number.isFinite(rawLimit) ? Math.max(0, rawLimit) : 0;
  return {
    ...acc,
    currentBalance: nextBalance,
    usedLimit: Math.max(0, limit - nextBalance),
  };
}

/**
 * Menetapkan saldo absolut rekening (mis. saat rekonsiliasi GL) sekaligus
 * menyinkronkan usedLimit kartu kredit/PayLater secara terpusat.
 */
export function setAccountTargetBalance(acc: Account, targetBalance: number): Account {
  const safeTarget = Number.isFinite(targetBalance) ? targetBalance : 0;
  const rawCurrent = Number(acc?.currentBalance);
  const currentBalance = Number.isFinite(rawCurrent) ? rawCurrent : 0;
  const delta = safeTarget - currentBalance;
  return applyAccountBalanceChange(acc, delta);
}

/**
 * Memperbarui saldo awal / batas limit serta nama rekening secara seragam
 * melalui mesin perubahan saldo terpusat.
 */
export function updateAccountMetadataAndStartingBalance(
  acc: Account,
  newStartingBalance: number,
  newName?: string
): Account {
  const safeStart = normalizeAbsAmount(newStartingBalance);
  const oldStart = normalizeAbsAmount(acc?.startingBalance);
  const diff = safeStart - oldStart;
  const updatedBase: Account = {
    ...acc,
    name: newName !== undefined ? newName : acc.name,
    startingBalance: safeStart,
    creditLimit: isCreditAccount(acc) ? safeStart : acc.creditLimit,
  };
  return applyAccountBalanceChange(updatedBase, diff);
}

/**
 * Menerapkan atau membalikkan kumpulan transaksi ke daftar rekening
 * menggunakan getTransactionAccountDelta dan applyAccountBalanceChange.
 */
export function applyTransactionsToAccounts(
  accounts: Account[],
  txs: Pick<Transaction, 'accountId' | 'type' | 'amount' | 'isAdjustment'>[],
  mode: 'apply' | 'revert' = 'apply'
): Account[] {
  if (!txs || txs.length === 0) return accounts;
  const sign = mode === 'revert' ? -1 : 1;
  const deltaByAccount = new Map<string, number>();

  txs.forEach((tx) => {
    if (!tx || !tx.accountId) return;
    const delta = getTransactionAccountDelta(tx) * sign;
    if (delta === 0) return;
    deltaByAccount.set(tx.accountId, (deltaByAccount.get(tx.accountId) || 0) + delta);
  });

  if (deltaByAccount.size === 0) return accounts;

  return accounts.map((acc) => {
    const netDelta = deltaByAccount.get(acc.id);
    if (!netDelta) return acc;
    return applyAccountBalanceChange(acc, netDelta);
  });
}

/**
 * Menerapkan atau membalikkan pembayaran tagihan rekening kredit / PayLater
 * melalui getTransactionAccountDelta dan applyAccountBalanceChange secara seragam.
 */
export function applyCreditBillPayment(
  acc: Account,
  paymentAmount: number,
  mode: 'pay' | 'revert' = 'pay'
): Account {
  const safePayment = normalizeAbsAmount(paymentAmount);
  const delta = getTransactionAccountDelta({
    type: mode === 'pay' ? 'income' : 'expense',
    amount: safePayment,
  });
  return applyAccountBalanceChange(acc, delta);
}

/**
 * Membentuk objek rekening baru dengan saldo awal, limit kredit, dan usedLimit
 * yang konsisten melalui mesin perubahan saldo terpusat.
 */
export function createAccountRecord(params: {
  id: string;
  name: string;
  type: AccountType;
  startingBalance: number;
  accountNumber?: string;
  initialDebt?: number;
  dueDay?: number;
  interestRate?: number;
  minPayment?: number;
}): Account {
  const safeStart = normalizeAbsAmount(params.startingBalance);
  const creditAccount = isCreditAccount({ type: params.type });
  const safeInitialDebt = creditAccount ? normalizeAbsAmount(params.initialDebt) : undefined;

  const baseAccount: Account = {
    id: params.id,
    name: params.name,
    type: params.type,
    startingBalance: safeStart,
    currentBalance: safeStart,
    accountNumber: params.accountNumber,
    creditLimit: creditAccount ? safeStart : undefined,
    usedLimit: creditAccount ? 0 : undefined,
    initialDebt: safeInitialDebt,
    dueDay: creditAccount ? params.dueDay : undefined,
    interestRate: creditAccount ? params.interestRate : undefined,
    minPayment: creditAccount ? params.minPayment : undefined,
  };

  if (creditAccount && safeInitialDebt && safeInitialDebt > 0) {
    const debtDelta = getTransactionAccountDelta({ type: 'expense', amount: safeInitialDebt });
    return applyAccountBalanceChange(baseAccount, debtDelta);
  }

  return baseAccount;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatValidDateParts(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() + 1 !== month ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/**
 * Menormalkan berbagai format tanggal transaksi (ISO timestamp, YYYY-MM-DD,
 * YYYY/MM/DD, DD/MM/YYYY, dan DD-MM-YYYY) menjadi format kanonis YYYY-MM-DD.
 */
export function normalizeLedgerDateYYYYMMDD(rawDate: unknown): string {
  if (typeof rawDate !== 'string') return '';
  const trimmed = rawDate.trim();
  if (!trimmed) return '';

  // 1. YYYY-MM-DD atau ISO 8601 (2026-11-18T10:30:00Z)
  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|T|\s)/);
  if (isoMatch) {
    const formatted = formatValidDateParts(
      Number(isoMatch[1]),
      Number(isoMatch[2]),
      Number(isoMatch[3])
    );
    if (formatted) return formatted;
  }

  // 2. YYYY/MM/DD atau YYYY/M/D (termasuk opsional waktu)
  const slashYearFirstMatch = trimmed.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})(?:$|T|\s)/);
  if (slashYearFirstMatch) {
    const formatted = formatValidDateParts(
      Number(slashYearFirstMatch[1]),
      Number(slashYearFirstMatch[2]),
      Number(slashYearFirstMatch[3])
    );
    if (formatted) return formatted;
  }

  // 3. DD/MM/YYYY atau DD-MM-YYYY (termasuk D/M/YYYY, D-M-YYYY, dan opsional waktu)
  const dayFirstMatch = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:$|T|\s)/);
  if (dayFirstMatch) {
    const formatted = formatValidDateParts(
      Number(dayFirstMatch[3]),
      Number(dayFirstMatch[2]),
      Number(dayFirstMatch[1])
    );
    if (formatted) return formatted;
  }

  // 4. Fallback parser standar Date jika format teks lain valid
  const parsedMs = Date.parse(trimmed);
  if (!Number.isNaN(parsedMs)) {
    const dt = new Date(parsedMs);
    const formatted = formatValidDateParts(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
    if (formatted) return formatted;
  }

  return trimmed;
}

export interface OrphanTransactionIssue {
  transaction: Transaction;
  index: number;
  reason: 'missing_account_id' | 'account_not_found';
}

export interface DuplicateTransactionGroup {
  groupKey: string;
  kind: 'duplicate_id' | 'same_day_identical';
  keepIndex: number;
  duplicateIndices: number[];
  items: Array<{ transaction: Transaction; index: number }>;
  fingerprintLabel: string;
}

export interface LedgerIntegrityAuditResult {
  orphanTransactions: OrphanTransactionIssue[];
  duplicateIdGroups: DuplicateTransactionGroup[];
  sameDayDuplicateGroups: DuplicateTransactionGroup[];
  totalOrphans: number;
  totalDuplicateIdRows: number;
  totalSameDayDuplicateRows: number;
  totalIssues: number;
  isLedgerClean: boolean;
}

/**
 * Memeriksa integritas referensi akun dan potensi data ganda di buku besar:
 * 1) Transaksi non-penyesuaian tanpa accountId atau accountId tidak terdaftar di Master Akun.
 * 2) ID transaksi yang muncul lebih dari satu kali.
 * 3) Entri identik di hari yang sama (tanggal dinormalisasi YYYY-MM-DD, akun, tipe, kategori, nominal, dan deskripsi sama).
 */
export function auditLedgerIntegrity(
  transactions: Transaction[],
  accounts: Account[]
): LedgerIntegrityAuditResult {
  const safeTxs = Array.isArray(transactions) ? transactions : [];
  const safeAccounts = Array.isArray(accounts) ? accounts : [];
  const validAccountIds = new Set(safeAccounts.filter((a) => a && a.id).map((a) => a.id));

  const orphanTransactions: OrphanTransactionIssue[] = [];
  const byId = new Map<string, Array<{ transaction: Transaction; index: number }>>();
  const bySameDaySignature = new Map<string, Array<{ transaction: Transaction; index: number }>>();

  safeTxs.forEach((tx, index) => {
    if (!tx) return;

    // 1. Cek referensi akun valid untuk seluruh transaksi selain jurnal penyesuaian non-kas
    if (!tx.isAdjustment) {
      const trimmedAccId = (tx.accountId || '').trim();
      if (!trimmedAccId) {
        orphanTransactions.push({
          transaction: tx,
          index,
          reason: 'missing_account_id',
        });
      } else if (!validAccountIds.has(trimmedAccId)) {
        orphanTransactions.push({
          transaction: tx,
          index,
          reason: 'account_not_found',
        });
      }
    }

    // 2. Kumpulkan berdasarkan ID transaksi
    const txId = (tx.id || '').trim();
    if (txId) {
      const arr = byId.get(txId) || [];
      arr.push({ transaction: tx, index });
      byId.set(txId, arr);
    }

    // 3. Kumpulkan berdasarkan sidik jari entri identik pada hari yang sama (normalisasi YYYY-MM-DD)
    const datePart = normalizeLedgerDateYYYYMMDD(tx.date);
    const accPart = (tx.accountId || '').trim();
    const typePart = tx.type || 'expense';
    const catPart = (tx.category || '').trim().replace(/\s+/g, ' ').toLowerCase();
    const amtPart = Math.round(normalizeAbsAmount(tx.amount) * 100);
    const descPart = (tx.description || '').trim().replace(/\s+/g, ' ').toLowerCase();
    const adjPart = tx.isAdjustment ? 'adj' : 'std';
    const sig = `${datePart}|${accPart}|${typePart}|${catPart}|${amtPart}|${descPart}|${adjPart}`;
    const sigArr = bySameDaySignature.get(sig) || [];
    sigArr.push({ transaction: tx, index });
    bySameDaySignature.set(sig, sigArr);
  });

  const duplicateIdGroups: DuplicateTransactionGroup[] = [];
  const duplicateIdRowIndices = new Set<number>();

  byId.forEach((items, id) => {
    if (items.length > 1) {
      const keepIndex = items[0].index;
      const duplicateIndices = items.slice(1).map((it) => it.index);
      duplicateIndices.forEach((idx) => duplicateIdRowIndices.add(idx));
      const sample = items[0].transaction;
      const normalizedSampleDate = normalizeLedgerDateYYYYMMDD(sample.date) || sample.date;
      duplicateIdGroups.push({
        groupKey: `dup-id-${id}`,
        kind: 'duplicate_id',
        keepIndex,
        duplicateIndices,
        items,
        fingerprintLabel: `ID "${id}" · ${normalizedSampleDate} · ${sample.description || sample.category}`,
      });
    }
  });

  const sameDayDuplicateGroups: DuplicateTransactionGroup[] = [];
  bySameDaySignature.forEach((items, sig) => {
    if (items.length > 1) {
      // Hindari penghitungan ganda apabila salinan identik sudah ditandai sebagai ID duplikat
      const nonIdDupItems = items.filter((it) => !duplicateIdRowIndices.has(it.index));
      if (nonIdDupItems.length > 1) {
        const keepIndex = nonIdDupItems[0].index;
        const duplicateIndices = nonIdDupItems.slice(1).map((it) => it.index);
        const sample = nonIdDupItems[0].transaction;
        const normalizedSampleDate = normalizeLedgerDateYYYYMMDD(sample.date) || sample.date;
        sameDayDuplicateGroups.push({
          groupKey: `dup-sameday-${sig}`,
          kind: 'same_day_identical',
          keepIndex,
          duplicateIndices,
          items: nonIdDupItems,
          fingerprintLabel: `${normalizedSampleDate} · ${sample.category} · ${sample.description || sample.category}`,
        });
      }
    }
  });

  const totalOrphans = orphanTransactions.length;
  const totalDuplicateIdRows = duplicateIdGroups.reduce((s, g) => s + g.duplicateIndices.length, 0);
  const totalSameDayDuplicateRows = sameDayDuplicateGroups.reduce((s, g) => s + g.duplicateIndices.length, 0);
  const totalIssues = totalOrphans + totalDuplicateIdRows + totalSameDayDuplicateRows;

  return {
    orphanTransactions,
    duplicateIdGroups,
    sameDayDuplicateGroups,
    totalOrphans,
    totalDuplicateIdRows,
    totalSameDayDuplicateRows,
    totalIssues,
    isLedgerClean: totalIssues === 0,
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
    if (!tx || tx.isAdjustment) return;
    if (tx.accountId === acc.id) {
      txCount += 1;
      calculatedDelta += getTransactionAccountDelta(tx);
    } else if (
      isCreditAccount(acc) &&
      tx.linkedDebtAction === 'pay' &&
      tx.linkedDebtId === `acc-debt-${acc.id}`
    ) {
      txCount += 1;
      calculatedDelta += getTransactionAccountDelta({ type: 'income', amount: tx.amount });
    }
  });

  const rawStart = Number(acc?.startingBalance);
  const startingBal = Number.isFinite(rawStart) ? rawStart : 0;
  const initialDebt = isCreditAccount(acc) ? normalizeAbsAmount(acc?.initialDebt) : 0;
  const glCalculatedBalance = startingBal - initialDebt + calculatedDelta;
  const rawRecorded = Number(acc?.currentBalance);
  const recordedBalance = Number.isFinite(rawRecorded) ? rawRecorded : 0;
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

/**
 * Mengalihkan transaksi yatim ke rekening valid sekaligus menyinkronkan saldo rekening tujuan
 * menggunakan getTransactionAccountDelta dan applyAccountBalanceChange.
 */
export function reassignOrphanTransactionWithBalanceSync(
  transactions: Transaction[],
  accounts: Account[],
  txIndex: number,
  targetAccountId: string
): { updatedTransactions: Transaction[]; updatedAccounts: Account[]; changed: boolean } {
  const safeTxs = Array.isArray(transactions) ? transactions : [];
  const safeAccounts = Array.isArray(accounts) ? accounts : [];
  const targetTx = safeTxs[txIndex];
  const targetAcc = safeAccounts.find((a) => a.id === targetAccountId);

  if (!targetTx || !targetAcc || targetTx.accountId === targetAccountId) {
    return { updatedTransactions: safeTxs, updatedAccounts: safeAccounts, changed: false };
  }

  const updatedTransactions = safeTxs.map((tx, idx) =>
    idx === txIndex ? { ...tx, accountId: targetAccountId } : tx
  );

  const delta = getTransactionAccountDelta(targetTx);
  if (delta === 0) {
    return { updatedTransactions, updatedAccounts: safeAccounts, changed: true };
  }

  const updatedAccounts = safeAccounts.map((acc) => {
    if (acc.id !== targetAccountId) return acc;
    return applyAccountBalanceChange(acc, delta);
  });

  return { updatedTransactions, updatedAccounts, changed: true };
}

/**
 * Menghapus baris transaksi ganda pada indeks terpilih sekaligus membalikkan dampak saldonya
 * secara aman hanya jika saldo rekening tercatat masih memuat dampak entri ganda tersebut.
 */
export function removeDuplicateTransactionsWithBalanceSync(
  transactions: Transaction[],
  accounts: Account[],
  indicesToRemove: number[]
): { updatedTransactions: Transaction[]; updatedAccounts: Account[]; removedCount: number } {
  const safeTxs = Array.isArray(transactions) ? transactions : [];
  const safeAccounts = Array.isArray(accounts) ? accounts : [];
  const removeSet = new Set(indicesToRemove.filter((i) => i >= 0 && i < safeTxs.length));

  if (removeSet.size === 0) {
    return { updatedTransactions: safeTxs, updatedAccounts: safeAccounts, removedCount: 0 };
  }

  const removedTxs = safeTxs.filter((_, idx) => removeSet.has(idx));
  const updatedTransactions = safeTxs.filter((_, idx) => !removeSet.has(idx));

  const affectedAccountIds = new Set<string>();
  removedTxs.forEach((t) => {
    if (!t || t.isAdjustment) return;
    if (t.accountId) affectedAccountIds.add(t.accountId);
    if (t.linkedDebtAction === 'pay' && t.linkedDebtId?.startsWith('acc-debt-')) {
      const linkedCreditAccId = t.linkedDebtId.replace('acc-debt-', '');
      if (linkedCreditAccId) affectedAccountIds.add(linkedCreditAccId);
    }
  });

  const updatedAccounts = safeAccounts.map((acc) => {
    if (!affectedAccountIds.has(acc.id)) return acc;
    const glBefore = calculateAccountGLBalance(acc, safeTxs);
    const glAfter = calculateAccountGLBalance(acc, updatedTransactions);

    // Jika saldo tercatat sebelumnya sudah mengecualikan baris duplikat, jangan kurangi lagi
    if (Math.abs((acc.currentBalance || 0) - glAfter.glCalculatedBalance) < 1) {
      return acc;
    }

    const revertDelta = glAfter.glCalculatedBalance - glBefore.glCalculatedBalance;
    if (revertDelta === 0) return acc;
    return applyAccountBalanceChange(acc, revertDelta);
  });

  return {
    updatedTransactions,
    updatedAccounts,
    removedCount: removedTxs.length,
  };
}

export interface AccountCleanupImpactPreview {
  accountId: string;
  accountName: string;
  accountType: AccountType;
  currentBalance: number;
  netBalanceDelta: number;
  projectedBalance: number;
  affectedRowCount: number;
  glAlreadyExcludedCount: number;
}

export interface AnomalyCleanupPreviewResult {
  updatedTransactions: Transaction[];
  updatedAccounts: Account[];
  accountImpacts: AccountCleanupImpactPreview[];
  removedDuplicateCount: number;
  reassignedOrphanCount: number;
  deletedOrphanCount: number;
  totalAffectedRows: number;
}

/**
 * Mensimulasikan sekaligus mengeksekusi pembersihan baris duplikat dan perbaikan transaksi yatim
 * secara aman, menghasilkan pratinjau total dampak saldo per rekening sebelum eksekusi.
 */
export function previewSafeAnomalyCleanupImpact(
  transactions: Transaction[],
  accounts: Account[],
  params: {
    duplicateIndicesToRemove?: number[];
    orphanReassignments?: Array<{ txIndex: number; targetAccountId: string }>;
    orphanIndicesToDelete?: number[];
  }
): AnomalyCleanupPreviewResult {
  const safeTxs = Array.isArray(transactions) ? transactions : [];
  const safeAccounts = Array.isArray(accounts) ? accounts : [];

  const dupSet = new Set(
    (params.duplicateIndicesToRemove || []).filter((i) => i >= 0 && i < safeTxs.length)
  );
  const delOrphanSet = new Set(
    (params.orphanIndicesToDelete || []).filter((i) => i >= 0 && i < safeTxs.length && !dupSet.has(i))
  );
  const reassignMap = new Map<number, string>();
  (params.orphanReassignments || []).forEach(({ txIndex, targetAccountId }) => {
    if (
      txIndex >= 0 &&
      txIndex < safeTxs.length &&
      !dupSet.has(txIndex) &&
      !delOrphanSet.has(txIndex) &&
      safeAccounts.some((a) => a.id === targetAccountId)
    ) {
      reassignMap.set(txIndex, targetAccountId);
    }
  });

  const removeCombinedSet = new Set<number>([...dupSet, ...delOrphanSet]);

  // 1. Terapkan pengalihan transaksi yatim ke daftar transaksi kerja & hitung delta pengalihan
  const orphanDeltaByAccount = new Map<string, number>();
  const touchedCountByAccount = new Map<string, number>();

  const txsWithReassign = safeTxs.map((tx, idx) => {
    const newAccId = reassignMap.get(idx);
    if (!newAccId || !tx || tx.accountId === newAccId) return tx;
    const delta = getTransactionAccountDelta(tx);
    if (delta !== 0) {
      orphanDeltaByAccount.set(newAccId, (orphanDeltaByAccount.get(newAccId) || 0) + delta);
    }
    touchedCountByAccount.set(newAccId, (touchedCountByAccount.get(newAccId) || 0) + 1);
    return { ...tx, accountId: newAccId };
  });

  // 2. Hitung dampak penghapusan baris duplikat (dan orphan yang dihapus jika sempat merujuk akun)
  const finalTransactions = txsWithReassign.filter((_, idx) => !removeCombinedSet.has(idx));
  const duplicateRowCountByAccount = new Map<string, number>();

  safeTxs.forEach((tx, idx) => {
    if (!tx || tx.isAdjustment) return;
    if (dupSet.has(idx)) {
      if (tx.accountId) {
        duplicateRowCountByAccount.set(
          tx.accountId,
          (duplicateRowCountByAccount.get(tx.accountId) || 0) + 1
        );
        touchedCountByAccount.set(
          tx.accountId,
          (touchedCountByAccount.get(tx.accountId) || 0) + 1
        );
      }
      if (tx.linkedDebtAction === 'pay' && tx.linkedDebtId?.startsWith('acc-debt-')) {
        const linkedCreditAccId = tx.linkedDebtId.replace('acc-debt-', '');
        if (linkedCreditAccId && linkedCreditAccId !== tx.accountId) {
          duplicateRowCountByAccount.set(
            linkedCreditAccId,
            (duplicateRowCountByAccount.get(linkedCreditAccId) || 0) + 1
          );
          touchedCountByAccount.set(
            linkedCreditAccId,
            (touchedCountByAccount.get(linkedCreditAccId) || 0) + 1
          );
        }
      }
    }
  });

  // 3. Simulasikan saldo akhir setiap rekening dengan aturan proteksi GL aman
  const accountImpacts: AccountCleanupImpactPreview[] = [];
  const updatedAccounts = safeAccounts.map((acc) => {
    const orphanDelta = orphanDeltaByAccount.get(acc.id) || 0;
    const hasDupRemoval = duplicateRowCountByAccount.has(acc.id);
    const hasOrphanChange = orphanDelta !== 0 || touchedCountByAccount.has(acc.id);

    if (!hasDupRemoval && !hasOrphanChange) return acc;

    let workingAcc = acc;
    let glAlreadyExcludedCount = 0;

    if (hasDupRemoval) {
      // Gunakan perbandingan GL pada baseline transaksi sebelum pengalihan agar akurat
      const glBefore = calculateAccountGLBalance(acc, safeTxs);
      const txsAfterDupRemovalOnly = safeTxs.filter((_, idx) => !dupSet.has(idx));
      const glAfterDupOnly = calculateAccountGLBalance(acc, txsAfterDupRemovalOnly);

      if (Math.abs((acc.currentBalance || 0) - glAfterDupOnly.glCalculatedBalance) < 1) {
        glAlreadyExcludedCount = duplicateRowCountByAccount.get(acc.id) || 0;
      } else {
        const revertDelta = glAfterDupOnly.glCalculatedBalance - glBefore.glCalculatedBalance;
        if (revertDelta !== 0) {
          workingAcc = applyAccountBalanceChange(workingAcc, revertDelta);
        }
      }
    }

    if (orphanDelta !== 0) {
      workingAcc = applyAccountBalanceChange(workingAcc, orphanDelta);
    }

    const rawCur = Number(acc?.currentBalance);
    const currentBalance = Number.isFinite(rawCur) ? rawCur : 0;
    const rawProj = Number(workingAcc?.currentBalance);
    const projectedBalance = Number.isFinite(rawProj) ? rawProj : 0;
    const netBalanceDelta = projectedBalance - currentBalance;
    const affectedRowCount = touchedCountByAccount.get(acc.id) || 0;

    if (affectedRowCount > 0 || netBalanceDelta !== 0) {
      accountImpacts.push({
        accountId: acc.id,
        accountName: acc.name,
        accountType: acc.type,
        currentBalance,
        netBalanceDelta,
        projectedBalance,
        affectedRowCount,
        glAlreadyExcludedCount,
      });
    }

    return workingAcc;
  });

  return {
    updatedTransactions: finalTransactions,
    updatedAccounts,
    accountImpacts,
    removedDuplicateCount: dupSet.size,
    reassignedOrphanCount: reassignMap.size,
    deletedOrphanCount: delOrphanSet.size,
    totalAffectedRows: dupSet.size + reassignMap.size + delOrphanSet.size,
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
  kprInterestExpense: number;
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
  let kprInterestExpense = 0;

  (transactions || []).forEach((tx) => {
    const amt = normalizeAbsAmount(tx.amount);
    const nature = classifyTransaction(tx);
    switch (nature) {
      case 'operating_income':
        operatingIncome += amt;
        break;
      case 'operating_expense':
        operatingExpense += amt;
        break;
      case 'debt_principal_pay':
        if (tx.linkedKprBreakdown) {
          const interestPart = Math.max(0, Number(tx.linkedKprBreakdown.interestPart) || 0);
          const principalPart = Math.max(
            0,
            tx.linkedKprBreakdown.principalPart !== undefined
              ? Number(tx.linkedKprBreakdown.principalPart) || 0
              : Math.max(0, amt - interestPart)
          );
          operatingExpense += interestPart;
          kprInterestExpense += interestPart;
          debtPrincipalPayments += principalPart;
        } else {
          debtPrincipalPayments += amt;
        }
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
    kprInterestExpense,
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
  nonCashCreditOutflows: number;
  netFinancing: number;
  netCashChange: number;
}

export function calculateCashFlowStatement(
  transactions: Transaction[],
  accounts: Account[] = []
): CashFlowSummary {
  const creditAccountIds = new Set(getCreditAccounts(accounts).map((a) => a.id));

  let operatingInflows = 0;
  let operatingOutflows = 0;
  let investmentInflows = 0;
  let investmentOutflows = 0;
  let savingInflows = 0;
  let savingOutflows = 0;
  let debtProceedsInflows = 0;
  let debtPaymentOutflows = 0;
  let nonCashCreditOutflows = 0;

  (transactions || []).forEach((tx) => {
    const amt = normalizeAbsAmount(tx.amount);
    const nature = classifyTransaction(tx);
    const isCreditCharge = Boolean(tx.accountId && creditAccountIds.has(tx.accountId));

    switch (nature) {
      case 'operating_income':
        if (!isCreditCharge) operatingInflows += amt;
        break;
      case 'operating_expense':
        if (isCreditCharge) nonCashCreditOutflows += amt;
        else operatingOutflows += amt;
        break;
      case 'debt_principal_pay':
        if (tx.linkedKprBreakdown) {
          const interestPart = Math.max(0, Number(tx.linkedKprBreakdown.interestPart) || 0);
          const principalPart = Math.max(
            0,
            Number(tx.linkedKprBreakdown.principalPart) || Math.max(0, amt - interestPart)
          );
          if (isCreditCharge) {
            nonCashCreditOutflows += amt;
          } else {
            operatingOutflows += interestPart;
            debtPaymentOutflows += principalPart;
          }
        } else {
          if (isCreditCharge) nonCashCreditOutflows += amt;
          else debtPaymentOutflows += amt;
        }
        break;
      case 'debt_proceeds':
        if (tx.type === 'income') debtProceedsInflows += amt;
        else if (!isCreditCharge) debtPaymentOutflows += amt;
        break;
      case 'investment_buy':
        if (isCreditCharge) nonCashCreditOutflows += amt;
        else investmentOutflows += amt;
        break;
      case 'investment_sell':
        if (!isCreditCharge) investmentInflows += amt;
        break;
      case 'emergency_fund_transfer':
        if (tx.type === 'income') {
          if (!isCreditCharge) savingInflows += amt;
        } else {
          if (isCreditCharge) nonCashCreditOutflows += amt;
          else savingOutflows += amt;
        }
        break;
      default:
        break;
    }
  });

  const netOperating = operatingInflows - operatingOutflows;
  const netInvesting =
    investmentInflows + savingInflows - (investmentOutflows + savingOutflows);
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
    nonCashCreditOutflows,
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
      const amt = normalizeAbsAmount(tx.amount);
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
        case 'debt_principal_pay': {
          // Membayar pokok utang mengurangi kas & mengurangi pokok utang; porsi bunga mengurangi kas/Net Worth
          const principalPart = tx.linkedKprBreakdown
            ? Math.max(0, Number(tx.linkedKprBreakdown.principalPart) || 0)
            : amt;
          rolledAssets += amt;
          rolledDebts += principalPart;
          break;
        }
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
            // Transfer pembayaran ke CC menurunkan utang CC & menurunkan kas bank -> netral terhadap Net Worth
            rolledAssets += amt;
            rolledDebts += amt;
          } else if (onCreditCard && tx.type === 'expense') {
            rolledAssets -= amt;
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
