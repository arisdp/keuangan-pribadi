import {
  Account,
  AccountType,
  CategoryBudget,
  Debt,
  EmergencyFundTransaction,
  FixedAsset,
  FixedAssetAdjustment,
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
    const interestPart = Math.min(safeAmt, normalizeAbsAmount(tx.linkedKprBreakdown.interestPart));
    const principalPart =
      tx.linkedKprBreakdown.principalPart !== undefined
        ? Math.min(safeAmt, normalizeAbsAmount(tx.linkedKprBreakdown.principalPart))
        : Math.max(0, safeAmt - interestPart);
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
  | 'fixed_asset_buy'
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
  const limit = normalizeAbsAmount(acc.creditLimit ?? acc.startingBalance ?? 0);
  const rawCur = Number(acc.currentBalance);
  const curBal = Number.isFinite(rawCur) ? rawCur : 0;
  return Math.max(0, limit - curBal);
}

export function getCreditOverlimitAmount(acc?: Pick<Account, 'type' | 'currentBalance'> | null): number {
  if (!acc || !isCreditAccount(acc)) return 0;
  const rawCur = Number(acc.currentBalance);
  if (!Number.isFinite(rawCur) || rawCur >= 0) return 0;
  return Math.abs(rawCur);
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

export function isKprDebtRecord(
  debt?: Pick<Debt, 'category' | 'kprScheme' | 'name'> | null
): boolean {
  if (!debt) return false;
  return (
    debt.category === 'KPR / Properti' ||
    Boolean(debt.kprScheme) ||
    /\bkpr\b/i.test(debt.name || '')
  );
}

export function getKprPropertyGrossPrice(
  debt: Pick<Debt, 'propertyPrice' | 'balance' | 'downPayment'>
): number {
  const explicitPrice = normalizeAbsAmount(debt.propertyPrice);
  if (explicitPrice > 0) return explicitPrice;
  return normalizeAbsAmount(debt.balance) + normalizeAbsAmount(debt.downPayment);
}

/**
 * Menyelaraskan daftar KPR di modul Hutang menjadi entri Aset Tetap terhubung.
 * - Saat KPR aktif: aset tetap mengikuti harga properti dengan ekuitas pokok lunas bertahap.
 * - Saat KPR lunas (balance === 0): status terkunci sebagai Aset Tetap Penuh (100% Lunas)
 *   dan tetap dipertahankan meskipun riwayat utang KPR dihapus/diarsipkan.
 */
export function syncKprDebtsToFixedAssets(
  fixedAssets: FixedAsset[],
  debts: Debt[],
  todayStr?: string
): FixedAsset[] {
  const safeFixedAssets = Array.isArray(fixedAssets) ? fixedAssets : [];
  const safeDebts = Array.isArray(debts) ? debts : [];
  const defaultDate =
    normalizeLedgerDateYYYYMMDD(todayStr) || new Date().toISOString().split('T')[0];

  const kprDebts = safeDebts.filter((d) => isKprDebtRecord(d));
  const kprDebtMap = new Map<string, Debt>();
  kprDebts.forEach((d) => kprDebtMap.set(d.id, d));

  const nextAssets: FixedAsset[] = [];
  const handledDebtIds = new Set<string>();

  for (const asset of safeFixedAssets) {
    if (!asset.isKprLinked || !asset.linkedDebtId) {
      nextAssets.push(asset);
      continue;
    }

    const matchedDebt = kprDebtMap.get(asset.linkedDebtId);
    if (matchedDebt) {
      handledDebtIds.add(matchedDebt.id);
      const grossPrice = Math.max(
        normalizeAbsAmount(asset.purchasePrice),
        getKprPropertyGrossPrice(matchedDebt)
      );
      const remBalance = Math.max(0, normalizeAbsAmount(matchedDebt.balance));
      const isPaidOff = remBalance <= 0;

      nextAssets.push({
        ...asset,
        purchasePrice: grossPrice,
        kprIsPaidOff: isPaidOff || Boolean(asset.kprIsPaidOff),
        kprPaidPrincipalLock:
          isPaidOff || asset.kprIsPaidOff ? grossPrice : asset.kprPaidPrincipalLock,
      });
    } else if (asset.kprIsPaidOff || (asset.kprPaidPrincipalLock || 0) > 0) {
      // KPR sudah lunas (atau memiliki porsi lunas terkunci) dan utang diarsipkan: pertahankan sebagai Aset Tetap Penuh
      const lockedVal = asset.kprPaidPrincipalLock || normalizeAbsAmount(asset.purchasePrice);
      nextAssets.push({
        ...asset,
        purchasePrice: Math.max(normalizeAbsAmount(asset.purchasePrice), lockedVal),
        kprIsPaidOff: true,
        kprPaidPrincipalLock: Math.max(normalizeAbsAmount(asset.purchasePrice), lockedVal),
      });
    }
  }

  for (const debt of kprDebts) {
    if (handledDebtIds.has(debt.id)) continue;
    const grossPrice = getKprPropertyGrossPrice(debt);
    if (grossPrice <= 0) continue;
    const remBalance = Math.max(0, normalizeAbsAmount(debt.balance));
    const isPaidOff = remBalance <= 0;
    const acqDate = normalizeLedgerDateYYYYMMDD(debt.startDate) || defaultDate;

    nextAssets.push({
      id: `fa-kpr-${debt.id}`,
      name: debt.name.replace(/^kpr\s+/i, 'Properti ').trim() || `Properti KPR: ${debt.name}`,
      category: 'Properti & Tanah',
      purchasePrice: grossPrice,
      acquisitionDate: acqDate,
      annualRatePct: 5, // Default apresiasi properti konservatif 5%/tahun (dapat disesuaikan pengguna)
      rateEffectiveDate: acqDate,
      fundingMode: 'kpr_linked',
      linkedDebtId: debt.id,
      isKprLinked: true,
      kprIsPaidOff: isPaidOff,
      kprPaidPrincipalLock: isPaidOff ? grossPrice : undefined,
      manualAdjustments: [],
      notes: 'Tersinkronisasi otomatis dari fasilitas KPR (bertahap sesuai porsi pokok lunas).',
    });
  }

  return nextAssets;
}

export interface FixedAssetValuationResult {
  assetId: string;
  fullAcquisitionValue: number;
  basisValue: number; // Harga perolehan (aset biasa) atau porsi pokok lunas (KPR)
  remainingKprPrincipal: number;
  ownershipRatio: number; // 0..1
  ownershipPct: number; // 0..100
  isKprActive: boolean;
  isPaidOff: boolean;
  elapsedDays: number;
  annualRatePct: number;
  autoAdjustment: number; // + apresiasi otomatis, - penyusutan otomatis
  manualAppreciation: number;
  manualDepreciation: number;
  manualNetAdjustment: number;
  totalNetValueChange: number;
  currentBookValue: number;
}

export function calculateFixedAssetValuation(
  asset: FixedAsset,
  debts: Debt[] = [],
  asOfDateStr?: string
): FixedAssetValuationResult {
  const safeAsOfStr =
    normalizeLedgerDateYYYYMMDD(asOfDateStr) || new Date().toISOString().split('T')[0];
  const linkedDebt = asset.linkedDebtId
    ? (debts || []).find((d) => d.id === asset.linkedDebtId)
    : undefined;

  let fullAcquisitionValue = normalizeAbsAmount(asset.purchasePrice);
  let remainingKprPrincipal = 0;
  let basisValue = fullAcquisitionValue;
  let isPaidOff = true;
  let isKprActive = false;

  if (asset.isKprLinked) {
    if (linkedDebt) {
      fullAcquisitionValue = Math.max(fullAcquisitionValue, getKprPropertyGrossPrice(linkedDebt));
      remainingKprPrincipal = Math.max(0, normalizeAbsAmount(linkedDebt.balance));
      isPaidOff = remainingKprPrincipal <= 0;
      isKprActive = !isPaidOff;
      basisValue = isPaidOff
        ? fullAcquisitionValue
        : Math.max(0, fullAcquisitionValue - remainingKprPrincipal);
    } else {
      isPaidOff = true;
      isKprActive = false;
      basisValue =
        asset.kprPaidPrincipalLock !== undefined
          ? Math.max(0, normalizeAbsAmount(asset.kprPaidPrincipalLock))
          : fullAcquisitionValue;
    }
  }

  const ownershipRatio =
    fullAcquisitionValue > 0 ? Math.min(1, Math.max(0, basisValue / fullAcquisitionValue)) : 1;
  const ownershipPct = ownershipRatio * 100;

  const effectiveStartStr =
    normalizeLedgerDateYYYYMMDD(asset.rateEffectiveDate || asset.acquisitionDate) || safeAsOfStr;
  const asOfMs = Date.parse(`${safeAsOfStr}T00:00:00Z`);
  const startMs = Date.parse(`${effectiveStartStr}T00:00:00Z`);
  const elapsedDays =
    Number.isFinite(asOfMs) && Number.isFinite(startMs)
      ? Math.max(0, Math.floor((asOfMs - startMs) / 86400000))
      : 0;

  const rawRate = Number(asset.annualRatePct);
  const annualRatePct = Number.isFinite(rawRate) ? rawRate : 0;
  const autoAdjustment =
    basisValue > 0 && annualRatePct !== 0 && elapsedDays > 0
      ? Math.round(basisValue * (annualRatePct / 100) * (elapsedDays / 365))
      : 0;

  let manualAppreciation = 0;
  let manualDepreciation = 0;
  (asset.manualAdjustments || []).forEach((adj) => {
    if (!adj) return;
    const amt = normalizeAbsAmount(adj.amount);
    if (adj.type === 'appreciation') manualAppreciation += amt;
    else manualDepreciation += amt;
  });

  const manualNetAdjustment = manualAppreciation - manualDepreciation;
  const totalNetValueChange = autoAdjustment + manualNetAdjustment;
  const currentBookValue = Math.max(0, Math.round(basisValue + totalNetValueChange));

  return {
    assetId: asset.id,
    fullAcquisitionValue,
    basisValue,
    remainingKprPrincipal,
    ownershipRatio,
    ownershipPct,
    isKprActive,
    isPaidOff,
    elapsedDays,
    annualRatePct,
    autoAdjustment,
    manualAppreciation,
    manualDepreciation,
    manualNetAdjustment,
    totalNetValueChange,
    currentBookValue,
  };
}

export interface FixedAssetDepreciationResult {
  assetId: string;
  isDepreciable: boolean;
  annualRatePct: number; // Besaran % penyusutan tahunan (positif)
  depreciationBase: number;
  currentBookValueBefore: number;
  elapsedDays: number;
  annualDepreciationAmount: number;
  proratedDepreciationAmount: number;
  cappedDepreciationAmount: number;
  projectedBookValueAfter: number;
  effectiveStartDate: string;
  asOfDate: string;
  draftAdjustment: FixedAssetAdjustment | null;
}

export interface CalculateAssetDepreciationOptions {
  periodDaysOverride?: number;
  periodKey?: string;
  isAutoYearEnd?: boolean;
  note?: string;
  adjustmentId?: string;
}

export interface BatchFixedAssetDepreciationDraftEntry {
  assetId: string;
  assetName: string;
  adjustment: FixedAssetAdjustment;
  depreciationAmount: number;
  elapsedDays: number;
}

export interface BatchFixedAssetDepreciationResult {
  items: FixedAssetDepreciationResult[];
  draftAdjustments: BatchFixedAssetDepreciationDraftEntry[];
  totalDepreciationAmount: number;
  pendingCount: number;
  eligibleCount: number;
  asOfDate: string;
}

function calculateSingleAssetDepreciation(
  asset: FixedAsset,
  debts: Debt[] = [],
  asOfDateStr?: string,
  periodDaysOrOptions?: number | CalculateAssetDepreciationOptions
): FixedAssetDepreciationResult {
  const safeAsOfStr =
    normalizeLedgerDateYYYYMMDD(asOfDateStr) || new Date().toISOString().split('T')[0];
  const valuation = calculateFixedAssetValuation(asset, debts, safeAsOfStr);
  const effectiveStartDate =
    normalizeLedgerDateYYYYMMDD(asset.rateEffectiveDate || asset.acquisitionDate) || safeAsOfStr;

  const opts: CalculateAssetDepreciationOptions =
    typeof periodDaysOrOptions === 'number'
      ? { periodDaysOverride: periodDaysOrOptions }
      : periodDaysOrOptions || {};

  const isDepreciable = valuation.annualRatePct < 0 && valuation.basisValue > 0;
  const annualRatePct = isDepreciable ? Math.abs(valuation.annualRatePct) : 0;
  const depreciationBase = valuation.basisValue;
  const currentBookValueBefore = Math.max(
    0,
    Math.round(valuation.basisValue + valuation.manualNetAdjustment)
  );

  let elapsedDays = valuation.elapsedDays;
  if (opts.periodDaysOverride !== undefined && Number.isFinite(opts.periodDaysOverride)) {
    elapsedDays = Math.max(0, Math.floor(opts.periodDaysOverride));
  }

  const annualDepreciationAmount =
    isDepreciable && depreciationBase > 0
      ? Math.round(depreciationBase * (annualRatePct / 100))
      : 0;

  const proratedDepreciationAmount =
    isDepreciable && elapsedDays > 0 && depreciationBase > 0
      ? Math.round(depreciationBase * (annualRatePct / 100) * (elapsedDays / 365))
      : 0;

  const cappedDepreciationAmount = Math.min(
    currentBookValueBefore,
    Math.max(0, proratedDepreciationAmount)
  );
  const projectedBookValueAfter = Math.max(0, currentBookValueBefore - cappedDepreciationAmount);

  const resolvedPeriodKey = opts.periodKey || safeAsOfStr.slice(0, 7);
  const resolvedId =
    opts.adjustmentId ||
    (opts.isAutoYearEnd
      ? `fa-yearend-${asset.id}-${safeAsOfStr.slice(0, 4)}`
      : `fa-sync-${asset.id}-${safeAsOfStr}`);

  const draftAdjustment: FixedAssetAdjustment | null =
    isDepreciable && cappedDepreciationAmount > 0
      ? {
          id: resolvedId,
          date: safeAsOfStr,
          type: 'depreciation',
          amount: cappedDepreciationAmount,
          note:
            opts.note ||
            (opts.isAutoYearEnd
              ? `Penyusutan Otomatis Akhir Tahun ${safeAsOfStr.slice(0, 4)} (${annualRatePct}%/thn · ${elapsedDays} hr)`
              : `Sinkronisasi Penyusutan (${annualRatePct}%/thn · ${elapsedDays} hr s.d. ${safeAsOfStr})`),
          ...(opts.isAutoYearEnd ? { isAutoYearEnd: true } : {}),
          periodKey: resolvedPeriodKey,
        }
      : null;

  return {
    assetId: asset.id,
    isDepreciable,
    annualRatePct,
    depreciationBase,
    currentBookValueBefore,
    elapsedDays,
    annualDepreciationAmount,
    proratedDepreciationAmount,
    cappedDepreciationAmount,
    projectedBookValueAfter,
    effectiveStartDate,
    asOfDate: safeAsOfStr,
    draftAdjustment,
  };
}

/**
 * Menghitung penyusutan tahunan berbasis persentase untuk satu FixedAsset atau seluruh daftar FixedAsset[].
 * Hanya aset dengan annualRatePct < 0 dan basis nilai > 0 yang diproses serta menghasilkan draft FixedAssetAdjustment
 * yang valid dan siap diposting sebagai jurnal penyesuaian non-kas.
 */
export function calculateAssetDepreciation(
  asset: FixedAsset,
  debts?: Debt[],
  asOfDateStr?: string,
  periodDaysOrOptions?: number | CalculateAssetDepreciationOptions
): FixedAssetDepreciationResult;
export function calculateAssetDepreciation(
  assets: FixedAsset[],
  debts?: Debt[],
  asOfDateStr?: string,
  periodDaysOrOptions?: number | CalculateAssetDepreciationOptions
): BatchFixedAssetDepreciationResult;
export function calculateAssetDepreciation(
  assetOrAssets: FixedAsset | FixedAsset[],
  debts: Debt[] = [],
  asOfDateStr?: string,
  periodDaysOrOptions?: number | CalculateAssetDepreciationOptions
): FixedAssetDepreciationResult | BatchFixedAssetDepreciationResult {
  if (Array.isArray(assetOrAssets)) {
    const safeAsOfStr =
      normalizeLedgerDateYYYYMMDD(asOfDateStr) || new Date().toISOString().split('T')[0];
    const items: FixedAssetDepreciationResult[] = [];
    const draftAdjustments: BatchFixedAssetDepreciationDraftEntry[] = [];
    let totalDepreciationAmount = 0;

    for (const asset of assetOrAssets) {
      if (!asset || !Number.isFinite(Number(asset.annualRatePct)) || Number(asset.annualRatePct) >= 0) {
        continue;
      }
      const res = calculateSingleAssetDepreciation(asset, debts, safeAsOfStr, periodDaysOrOptions);
      if (!res.isDepreciable) continue;
      items.push(res);
      if (res.draftAdjustment && res.cappedDepreciationAmount > 0) {
        draftAdjustments.push({
          assetId: asset.id,
          assetName: asset.name,
          adjustment: res.draftAdjustment,
          depreciationAmount: res.cappedDepreciationAmount,
          elapsedDays: res.elapsedDays,
        });
        totalDepreciationAmount += res.cappedDepreciationAmount;
      }
    }

    return {
      items,
      draftAdjustments,
      totalDepreciationAmount,
      pendingCount: draftAdjustments.length,
      eligibleCount: items.length,
      asOfDate: safeAsOfStr,
    };
  }

  return calculateSingleAssetDepreciation(assetOrAssets, debts, asOfDateStr, periodDaysOrOptions);
}

export interface FixedAssetLifecycleMetrics {
  assetId: string;
  isDepreciable: boolean;
  annualRatePct: number;
  annualRatePctAbs: number;
  acquisitionDate: string;
  asOfDate: string;
  totalAgeDays: number;
  elapsedAgeYears: number;
  estimatedUsefulLifeYears: number;
  estimatedUsefulLifeDays: number;
  remainingLifeDays: number;
  remainingLifeYears: number;
  ageProgressPct: number;
  bookValueRemainingPct: number;
  accumulatedDepreciationRecorded: number;
  pendingDepreciationAmount: number;
  annualDepreciationAmount: number;
  monthlyDepreciationAmount: number;
  projectedBookValueAfterSync: number;
  lifecycleStatus:
    | 'Habis Masa Manfaat'
    | 'Mendekati Akhir Manfaat'
    | 'Aktif Menyusut'
    | 'Apresiasi / Non-Susut';
}

/**
 * Menghitung metrik masa pakai berjalan vs estimasi umur ekonomis aset tetap
 * serta rincian penyusutan untuk ditampilkan pada panel detail aset.
 */
export function calculateFixedAssetLifecycleMetrics(
  asset: FixedAsset,
  valuation: FixedAssetValuationResult,
  depreciation?: FixedAssetDepreciationResult,
  asOfDateStr?: string
): FixedAssetLifecycleMetrics {
  const safeAsOfStr =
    normalizeLedgerDateYYYYMMDD(asOfDateStr) ||
    depreciation?.asOfDate ||
    new Date().toISOString().split('T')[0];
  const safeAcqStr = normalizeLedgerDateYYYYMMDD(asset.acquisitionDate) || safeAsOfStr;

  const asOfMs = Date.parse(`${safeAsOfStr}T00:00:00Z`);
  const acqMs = Date.parse(`${safeAcqStr}T00:00:00Z`);
  const totalAgeDays =
    Number.isFinite(asOfMs) && Number.isFinite(acqMs)
      ? Math.max(0, Math.floor((asOfMs - acqMs) / 86400000))
      : valuation.elapsedDays;
  const elapsedAgeYears = totalAgeDays / 365;

  const isDepreciable = valuation.annualRatePct < 0 && valuation.basisValue > 0;
  const annualRatePctAbs = Math.abs(valuation.annualRatePct);
  const estimatedUsefulLifeYears =
    isDepreciable && annualRatePctAbs > 0 ? 100 / annualRatePctAbs : 0;
  const estimatedUsefulLifeDays =
    estimatedUsefulLifeYears > 0 ? Math.round(estimatedUsefulLifeYears * 365) : 0;

  const remainingLifeDays =
    estimatedUsefulLifeDays > 0 ? Math.max(0, estimatedUsefulLifeDays - totalAgeDays) : 0;
  const remainingLifeYears = remainingLifeDays / 365;
  const ageProgressPct =
    estimatedUsefulLifeDays > 0
      ? Math.min(100, Math.max(0, (totalAgeDays / estimatedUsefulLifeDays) * 100))
      : asset.isKprLinked
      ? Math.min(100, Math.max(0, valuation.ownershipPct))
      : 0;

  const bookValueRemainingPct =
    valuation.basisValue > 0
      ? Math.min(100, Math.max(0, (valuation.currentBookValue / valuation.basisValue) * 100))
      : 0;

  const annualDepreciationAmount =
    depreciation?.annualDepreciationAmount ??
    (isDepreciable ? Math.round(valuation.basisValue * (annualRatePctAbs / 100)) : 0);
  const monthlyDepreciationAmount = Math.round(annualDepreciationAmount / 12);
  const pendingDepreciationAmount = depreciation?.cappedDepreciationAmount ?? 0;
  const projectedBookValueAfterSync =
    depreciation?.projectedBookValueAfter ??
    Math.max(0, valuation.currentBookValue - pendingDepreciationAmount);

  let lifecycleStatus: FixedAssetLifecycleMetrics['lifecycleStatus'] = 'Apresiasi / Non-Susut';
  if (isDepreciable) {
    if (valuation.currentBookValue <= 0 || ageProgressPct >= 100) {
      lifecycleStatus = 'Habis Masa Manfaat';
    } else if (ageProgressPct >= 80) {
      lifecycleStatus = 'Mendekati Akhir Manfaat';
    } else {
      lifecycleStatus = 'Aktif Menyusut';
    }
  }

  return {
    assetId: asset.id,
    isDepreciable,
    annualRatePct: valuation.annualRatePct,
    annualRatePctAbs,
    acquisitionDate: safeAcqStr,
    asOfDate: safeAsOfStr,
    totalAgeDays,
    elapsedAgeYears,
    estimatedUsefulLifeYears,
    estimatedUsefulLifeDays,
    remainingLifeDays,
    remainingLifeYears,
    ageProgressPct,
    bookValueRemainingPct,
    accumulatedDepreciationRecorded: valuation.manualDepreciation,
    pendingDepreciationAmount,
    annualDepreciationAmount,
    monthlyDepreciationAmount,
    projectedBookValueAfterSync,
    lifecycleStatus,
  };
}

export interface SyncedFixedAssetDepreciationResult {
  updatedAsset: FixedAsset;
  adjustment: FixedAssetAdjustment | null;
  adjustingTransaction: Transaction | null;
  depreciation: FixedAssetDepreciationResult;
  applied: boolean;
}

/**
 * Menghasilkan sekaligus menerapkan FixedAssetAdjustment tersinkronisasi dari
 * calculateAssetDepreciation beserta jurnal penyesuaian non-kas berpasangan (Dr 5960 / Cr 1690)
 * dan memajukan rateEffectiveDate agar penyusutan periode tersebut tidak dihitung dua kali.
 */
export function buildSyncedFixedAssetDepreciationAdjustment(
  asset: FixedAsset,
  debts: Debt[] = [],
  asOfDateStr?: string,
  options?: CalculateAssetDepreciationOptions & {
    existingTransactions?: Transaction[];
  }
): SyncedFixedAssetDepreciationResult {
  const dep = calculateAssetDepreciation(asset, debts, asOfDateStr, options);
  const existingAdjustments = Array.isArray(asset.manualAdjustments)
    ? asset.manualAdjustments
    : [];
  const existingTxs = Array.isArray(options?.existingTransactions)
    ? options.existingTransactions
    : [];

  if (!dep.isDepreciable || dep.cappedDepreciationAmount <= 0 || !dep.draftAdjustment) {
    return {
      updatedAsset: asset,
      adjustment: null,
      adjustingTransaction: null,
      depreciation: dep,
      applied: false,
    };
  }

  const adj = dep.draftAdjustment;
  const alreadyInAsset = existingAdjustments.some(
    (item) =>
      item.id === adj.id ||
      (Boolean(adj.isAutoYearEnd) && Boolean(item.isAutoYearEnd) && item.periodKey === adj.periodKey)
  );
  const alreadyPostedTx = existingTxs.some(
    (tx) =>
      tx.isAdjustment &&
      tx.adjustmentType === 'fixed_asset_depreciation' &&
      tx.linkedFixedAssetId === asset.id &&
      (tx.linkedFixedAssetAdjustmentId === adj.id ||
        (Boolean(adj.isAutoYearEnd) && tx.adjustmentPeriodKey === adj.periodKey))
  );

  if (alreadyInAsset || alreadyPostedTx) {
    return {
      updatedAsset: asset,
      adjustment: null,
      adjustingTransaction: null,
      depreciation: dep,
      applied: false,
    };
  }

  const yearLabel = dep.asOfDate.slice(0, 4);
  const txId = options?.isAutoYearEnd
    ? `tx-adj-fa-${asset.id}-${yearLabel}`
    : `tx-adj-fa-sync-${asset.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const adjustingTransaction: Transaction = {
    id: txId,
    date: dep.asOfDate,
    accountId: '',
    type: 'expense',
    category: 'Penyusutan Aset Tetap',
    description: options?.isAutoYearEnd
      ? `[Penyesuaian Akhir Tahun ${yearLabel}] Penyusutan ${asset.name} (${dep.elapsedDays} hr @ ${dep.annualRatePct}%/thn)`
      : `[Sinkronisasi Penyusutan] ${asset.name} (${dep.elapsedDays} hr @ ${dep.annualRatePct}%/thn)`,
    amount: dep.cappedDepreciationAmount,
    isAdjustment: true,
    adjustmentType: 'fixed_asset_depreciation',
    adjustmentPeriodKey: adj.periodKey || dep.asOfDate.slice(0, 7),
    adjustmentRatePct: dep.annualRatePct,
    adjustmentDurationDays: dep.elapsedDays,
    linkedFixedAssetId: asset.id,
    linkedFixedAssetAdjustmentId: adj.id,
    previousRateEffectiveDate: dep.effectiveStartDate,
    coaDebitCode: '5960',
    coaCreditCode: '1690',
  };

  const updatedAsset: FixedAsset = {
    ...asset,
    manualAdjustments: [adj, ...existingAdjustments],
    rateEffectiveDate: dep.asOfDate,
  };

  return {
    updatedAsset,
    adjustment: adj,
    adjustingTransaction,
    depreciation: dep,
    applied: true,
  };
}

export interface BatchSyncedFixedAssetDepreciationResult {
  updatedAssets: FixedAsset[];
  newAdjustingTransactions: Transaction[];
  appliedCount: number;
  totalDepreciationPosted: number;
}

/**
 * Memproses seluruh aset tetap dengan annualRatePct < 0 secara atomik untuk posting
 * jurnal penyesuaian non-kas serentak tanpa hitung ganda.
 */
export function buildBatchSyncedFixedAssetDepreciationAdjustments(
  assets: FixedAsset[] = [],
  debts: Debt[] = [],
  asOfDateStr?: string,
  options?: CalculateAssetDepreciationOptions & {
    existingTransactions?: Transaction[];
  }
): BatchSyncedFixedAssetDepreciationResult {
  const safeAssets = Array.isArray(assets) ? assets : [];
  const runningTxs = Array.isArray(options?.existingTransactions)
    ? [...options.existingTransactions]
    : [];
  const newAdjustingTransactions: Transaction[] = [];
  let appliedCount = 0;
  let totalDepreciationPosted = 0;

  const updatedAssets = safeAssets.map((asset) => {
    if (!asset || !Number.isFinite(Number(asset.annualRatePct)) || Number(asset.annualRatePct) >= 0) {
      return asset;
    }
    const synced = buildSyncedFixedAssetDepreciationAdjustment(asset, debts, asOfDateStr, {
      ...options,
      existingTransactions: runningTxs,
    });
    if (!synced.applied || !synced.adjustingTransaction || !synced.adjustment) {
      return asset;
    }
    runningTxs.push(synced.adjustingTransaction);
    newAdjustingTransactions.push(synced.adjustingTransaction);
    appliedCount += 1;
    totalDepreciationPosted += synced.adjustment.amount;
    return synced.updatedAsset;
  });

  return {
    updatedAssets,
    newAdjustingTransactions,
    appliedCount,
    totalDepreciationPosted,
  };
}

export interface PendingYearEndDepreciationResult {
  newAdjustingTransactions: Transaction[];
  updatedFixedAssets: FixedAsset[];
  postedCount: number;
  totalDepreciationPosted: number;
}

/**
 * Memeriksa periode tutup buku akhir tahun (31 Desember) sejak tanggal acuan aset tetap
 * hingga tanggal hari ini. Menghasilkan jurnal penyesuaian non-kas (Dr 5960 / Cr 1690)
 * beserta pembaruan acuan nilai aset tanpa hitung ganda.
 */
export function computePendingYearEndFixedAssetDepreciations(
  fixedAssets: FixedAsset[] = [],
  debts: Debt[] = [],
  transactions: Transaction[] = [],
  todayStr?: string
): PendingYearEndDepreciationResult {
  const safeTodayStr =
    normalizeLedgerDateYYYYMMDD(todayStr) || new Date().toISOString().split('T')[0];
  const currentYear = parseInt(safeTodayStr.slice(0, 4), 10);
  if (!Number.isFinite(currentYear)) {
    return {
      newAdjustingTransactions: [],
      updatedFixedAssets: fixedAssets,
      postedCount: 0,
      totalDepreciationPosted: 0,
    };
  }

  const safeTxs = Array.isArray(transactions) ? transactions : [];
  const safeAssets = Array.isArray(fixedAssets) ? fixedAssets : [];
  const newAdjustingTransactions: Transaction[] = [];
  let hasAnyAssetChange = false;
  let totalDepreciationPosted = 0;

  const updatedFixedAssets = safeAssets.map((asset) => {
    if (!asset || !Number.isFinite(Number(asset.annualRatePct)) || Number(asset.annualRatePct) >= 0) {
      return asset;
    }

    const baseAcqDate = normalizeLedgerDateYYYYMMDD(asset.acquisitionDate) || safeTodayStr;
    let workingEffectiveDate =
      normalizeLedgerDateYYYYMMDD(asset.rateEffectiveDate || asset.acquisitionDate) || safeTodayStr;
    const startYear = parseInt(workingEffectiveDate.slice(0, 4), 10);
    if (!Number.isFinite(startYear) || startYear > currentYear) {
      return asset;
    }

    let workingAsset: FixedAsset = {
      ...asset,
      manualAdjustments: Array.isArray(asset.manualAdjustments) ? [...asset.manualAdjustments] : [],
    };
    let assetChanged = false;

    for (let year = startYear; year <= currentYear; year++) {
      const yearEndStr = `${year}-12-31`;
      if (safeTodayStr < yearEndStr) {
        break;
      }

      if (workingEffectiveDate >= yearEndStr) {
        continue;
      }

      const periodKey = `${year}-12`;
      const alreadyPostedTx = safeTxs.some(
        (tx) =>
          tx.isAdjustment &&
          tx.adjustmentType === 'fixed_asset_depreciation' &&
          tx.linkedFixedAssetId === workingAsset.id &&
          tx.adjustmentPeriodKey === periodKey
      );
      const alreadyInAsset = (workingAsset.manualAdjustments || []).some(
        (adj) => adj.isAutoYearEnd && adj.periodKey === periodKey
      );

      if (alreadyPostedTx || alreadyInAsset) {
        if (workingEffectiveDate < yearEndStr) {
          workingEffectiveDate = yearEndStr;
          workingAsset.rateEffectiveDate = yearEndStr;
          assetChanged = true;
        }
        continue;
      }

      let periodDays = 0;
      const prevYearEndStr = `${year - 1}-12-31`;
      const yearStartStr = `${year}-01-01`;
      if (workingEffectiveDate === prevYearEndStr || workingEffectiveDate <= yearStartStr) {
        periodDays = 365;
      } else {
        const startMs = Date.parse(`${workingEffectiveDate}T00:00:00Z`);
        const endMs = Date.parse(`${yearEndStr}T00:00:00Z`);
        if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs) {
          const rawDiff = Math.floor((endMs - startMs) / 86400000);
          const includesAcqDay = workingEffectiveDate === baseAcqDate ? 1 : 0;
          periodDays = Math.min(365, Math.max(1, rawDiff + includesAcqDay));
        }
      }

      if (periodDays <= 0) {
        continue;
      }

      const synced = buildSyncedFixedAssetDepreciationAdjustment(
        workingAsset,
        debts,
        yearEndStr,
        {
          periodDaysOverride: periodDays,
          periodKey,
          isAutoYearEnd: true,
          existingTransactions: safeTxs,
        }
      );

      if (!synced.applied || !synced.adjustingTransaction) {
        continue;
      }

      newAdjustingTransactions.push(synced.adjustingTransaction);
      workingAsset = synced.updatedAsset;
      workingEffectiveDate = yearEndStr;
      assetChanged = true;
      totalDepreciationPosted += synced.depreciation.cappedDepreciationAmount;
    }

    if (assetChanged) {
      hasAnyAssetChange = true;
      return workingAsset;
    }
    return asset;
  });

  return {
    newAdjustingTransactions,
    updatedFixedAssets: hasAnyAssetChange ? updatedFixedAssets : safeAssets,
    postedCount: newAdjustingTransactions.length,
    totalDepreciationPosted,
  };
}

export function calculateTotalFixedAssets(
  fixedAssets: FixedAsset[] = [],
  debts: Debt[] = [],
  asOfDateStr?: string
): number {
  const synced = syncKprDebtsToFixedAssets(fixedAssets, debts, asOfDateStr);
  return synced.reduce(
    (sum, asset) => sum + calculateFixedAssetValuation(asset, debts, asOfDateStr).currentBookValue,
    0
  );
}

export interface CombinedPortfolioWealthSummary {
  totalInvestmentValue: number;
  totalInvestmentCost: number;
  totalInvestmentGain: number;
  totalFixedAssetBookValue: number;
  totalFixedAssetBasis: number;
  totalFixedAssetAppreciation: number;
  totalFixedAssetDepreciation: number;
  totalFixedAssetNetChange: number;
  totalCombinedWealth: number;
  investmentSharePct: number;
  fixedAssetSharePct: number;
  activeKprAssetCount: number;
  paidOffKprAssetCount: number;
  directFixedAssetCount: number;
}

export function calculateCombinedPortfolioWealth(
  investments: InvestmentAsset[] = [],
  fixedAssets: FixedAsset[] = [],
  debts: Debt[] = [],
  asOfDateStr?: string
): CombinedPortfolioWealthSummary {
  const totalInvestmentValue = calculateTotalInvestments(investments);
  const totalInvestmentCost = (investments || []).reduce(
    (sum, inv) => sum + (inv.initialCapital !== undefined ? inv.initialCapital : inv.balance || 0),
    0
  );
  const totalInvestmentGain = totalInvestmentValue - totalInvestmentCost;

  const synced = syncKprDebtsToFixedAssets(fixedAssets, debts, asOfDateStr);
  let totalFixedAssetBookValue = 0;
  let totalFixedAssetBasis = 0;
  let totalFixedAssetAppreciation = 0;
  let totalFixedAssetDepreciation = 0;
  let activeKprAssetCount = 0;
  let paidOffKprAssetCount = 0;
  let directFixedAssetCount = 0;

  synced.forEach((asset) => {
    const val = calculateFixedAssetValuation(asset, debts, asOfDateStr);
    totalFixedAssetBookValue += val.currentBookValue;
    totalFixedAssetBasis += val.basisValue;
    if (val.autoAdjustment > 0) totalFixedAssetAppreciation += val.autoAdjustment;
    if (val.autoAdjustment < 0) totalFixedAssetDepreciation += Math.abs(val.autoAdjustment);
    totalFixedAssetAppreciation += val.manualAppreciation;
    totalFixedAssetDepreciation += val.manualDepreciation;

    if (asset.isKprLinked) {
      if (val.isPaidOff) paidOffKprAssetCount += 1;
      else activeKprAssetCount += 1;
    } else {
      directFixedAssetCount += 1;
    }
  });

  const totalFixedAssetNetChange = totalFixedAssetAppreciation - totalFixedAssetDepreciation;
  const totalCombinedWealth = totalInvestmentValue + totalFixedAssetBookValue;
  const investmentSharePct =
    totalCombinedWealth > 0 ? (totalInvestmentValue / totalCombinedWealth) * 100 : 0;
  const fixedAssetSharePct =
    totalCombinedWealth > 0 ? (totalFixedAssetBookValue / totalCombinedWealth) * 100 : 0;

  return {
    totalInvestmentValue,
    totalInvestmentCost,
    totalInvestmentGain,
    totalFixedAssetBookValue,
    totalFixedAssetBasis,
    totalFixedAssetAppreciation,
    totalFixedAssetDepreciation,
    totalFixedAssetNetChange,
    totalCombinedWealth,
    investmentSharePct,
    fixedAssetSharePct,
    activeKprAssetCount,
    paidOffKprAssetCount,
    directFixedAssetCount,
  };
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

  const limit = normalizeAbsAmount(acc.creditLimit ?? acc.startingBalance ?? 0);
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
    | 'type'
    | 'category'
    | 'linkedDebtAction'
    | 'linkedInvestmentAction'
    | 'linkedFixedAssetAction'
    | 'linkedFixedAssetId'
    | 'isAdjustment'
    | 'adjustmentType'
  >
): TransactionAccountingNature {
  const catLower = (tx.category || '').trim().toLowerCase();

  if (
    tx.isAdjustment ||
    catLower === 'depresiasi aset investasi' ||
    catLower === 'penyusutan aset tetap' ||
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

  if (
    tx.linkedFixedAssetAction === 'buy' ||
    Boolean(tx.linkedFixedAssetId) ||
    catLower === 'pembelian aset tetap'
  ) {
    return 'fixed_asset_buy';
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
  fixedAssetPurchases: number;
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
  let fixedAssetPurchases = 0;
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
          const interestPart = normalizeAbsAmount(tx.linkedKprBreakdown.interestPart);
          const principalPart =
            tx.linkedKprBreakdown.principalPart !== undefined
              ? normalizeAbsAmount(tx.linkedKprBreakdown.principalPart)
              : Math.max(0, amt - interestPart);
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
      case 'fixed_asset_buy':
        fixedAssetPurchases += amt;
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
    fixedAssetPurchases,
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
  fixedAssetOutflows: number;
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
  let fixedAssetOutflows = 0;
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
          const interestPart = normalizeAbsAmount(tx.linkedKprBreakdown.interestPart);
          const principalPart =
            tx.linkedKprBreakdown.principalPart !== undefined
              ? normalizeAbsAmount(tx.linkedKprBreakdown.principalPart)
              : Math.max(0, amt - interestPart);
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
      case 'fixed_asset_buy':
        if (isCreditCharge) nonCashCreditOutflows += amt;
        else fixedAssetOutflows += amt;
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
    investmentInflows + savingInflows - (investmentOutflows + fixedAssetOutflows + savingOutflows);
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
    fixedAssetOutflows,
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
  fixedAssetsBasis: number;
  fixedAssetsNetAdjustment: number;
  fixedAssetsValue: number;
  combinedInvestmentAndFixedAssets: number;
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
  debts: Debt[],
  fixedAssets: FixedAsset[] = []
): BalanceSheetSummary {
  const liquidAssets = calculateTotalLiquidCash(accounts);
  const emergencyAssets = calculateTotalEmergencyFund(emergencyTransactions);
  const combinedWealth = calculateCombinedPortfolioWealth(investments, fixedAssets, debts);
  const investmentAssets = combinedWealth.totalInvestmentValue;
  const fixedAssetsBasis = combinedWealth.totalFixedAssetBasis;
  const fixedAssetsNetAdjustment = combinedWealth.totalFixedAssetNetChange;
  const fixedAssetsValue = combinedWealth.totalFixedAssetBookValue;
  const combinedInvestmentAndFixedAssets = combinedWealth.totalCombinedWealth;
  const totalAssets = liquidAssets + emergencyAssets + investmentAssets + fixedAssetsValue;

  const creditCardPaylaterBills = calculateCreditPaylaterBills(accounts);
  const activeDebtsBalance = (debts || []).reduce((sum, d) => sum + Math.max(0, d.balance || 0), 0);
  const totalLiabilities = creditCardPaylaterBills + activeDebtsBalance;

  const equity = totalAssets - totalLiabilities;
  const isBalanced = Math.abs(totalAssets - (totalLiabilities + equity)) < 1;

  return {
    liquidAssets,
    emergencyAssets,
    investmentAssets,
    fixedAssetsBasis,
    fixedAssetsNetAdjustment,
    fixedAssetsValue,
    combinedInvestmentAndFixedAssets,
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

export interface NetWorthMonthlyTrendPoint extends NetWorthHistoryPoint {
  monthKey: string;
  monthLabel: string;
  cutoffDate: string;
  deltaFromPrev: number;
  deltaPctFromPrev: number;
}

function rollbackAssetsAndDebtsAtDate(
  transactions: Transaction[],
  accountTypeMap: Map<string, Account>,
  cutoffDateStr: string,
  systemTodayStr: string,
  currentAssets: number,
  currentDebts: number
): {
  netWorth: number;
  assets: number;
  debts: number;
  ratio: number;
  status: 'Sehat' | 'Waspada' | 'Kritis';
} {
  let rolledAssets = currentAssets;
  let rolledDebts = currentDebts;

  if (cutoffDateStr < systemTodayStr) {
    for (const tx of transactions) {
      if (!tx || !tx.date || tx.date <= cutoffDateStr || tx.date > systemTodayStr) {
        continue;
      }
      const amt = normalizeAbsAmount(tx.amount);
      const nature = classifyTransaction(tx);
      const acc = accountTypeMap.get(tx.accountId);
      const onCreditCard = isCreditAccount(acc);

      switch (nature) {
        case 'operating_income':
        case 'equity_injection':
          if (onCreditCard) {
            rolledDebts += amt;
          } else {
            rolledAssets -= amt;
          }
          break;
        case 'operating_expense':
          if (onCreditCard) {
            rolledDebts -= amt;
          } else {
            rolledAssets += amt;
          }
          break;
        case 'debt_principal_pay': {
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
            rolledAssets += amt;
            rolledDebts += amt;
          } else if (onCreditCard && tx.type === 'expense') {
            rolledAssets -= amt;
            rolledDebts -= amt;
          }
          break;
        case 'emergency_fund_transfer':
        case 'investment_buy':
        case 'investment_sell':
          break;
        case 'fixed_asset_buy':
          if (onCreditCard) {
            rolledAssets -= amt;
            rolledDebts -= amt;
          }
          break;
        case 'non_cash_adjustment':
          if (tx.adjustmentType === 'debt_interest_accrual') {
            rolledDebts -= amt;
          } else if (tx.type === 'income') {
            rolledAssets -= amt;
          } else {
            rolledAssets += amt;
          }
          break;
      }
    }
  }

  const netWorth = rolledAssets - rolledDebts;
  const ratio = rolledAssets > 0 ? (rolledDebts / rolledAssets) * 100 : rolledDebts > 0 ? 100 : 0;
  let status: 'Sehat' | 'Waspada' | 'Kritis' = 'Sehat';
  if (rolledDebts > 0) {
    if (ratio <= 35) status = 'Sehat';
    else if (ratio <= 75) status = 'Waspada';
    else status = 'Kritis';
  }

  return {
    netWorth,
    assets: rolledAssets,
    debts: rolledDebts,
    ratio,
    status,
  };
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

  const safeTxs = Array.isArray(transactions) ? transactions : [];
  const today = new Date(`${systemTodayStr}T00:00:00`);
  const points: NetWorthHistoryPoint[] = [];

  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${day}`;

    const snapshot = rollbackAssetsAndDebtsAtDate(
      safeTxs,
      accountTypeMap,
      dateStr,
      systemTodayStr,
      currentAssets,
      currentDebts
    );

    points.push({
      date: d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }),
      ...snapshot,
    });
  }

  return points;
}

const SHORT_MONTHS_ID = [
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

/**
 * Menghitung tren bulanan Total Net Worth, Total Aset, dan Total Kewajiban selama 6 bulan terakhir
 * menggunakan mesin rollback transaksi terpadu agar sinkron 100% dengan posisi Neraca saat ini.
 */
export function calculateNetWorthHistory6Months(
  transactions: Transaction[],
  accounts: Account[],
  currentAssets: number,
  currentDebts: number,
  systemTodayStr: string
): NetWorthMonthlyTrendPoint[] {
  const accountTypeMap = new Map<string, Account>();
  (accounts || []).forEach((a) => accountTypeMap.set(a.id, a));

  const safeTxs = Array.isArray(transactions) ? transactions : [];
  const safeTodayStr =
    normalizeLedgerDateYYYYMMDD(systemTodayStr) || new Date().toISOString().split('T')[0];
  const baseYear = parseInt(safeTodayStr.slice(0, 4), 10);
  const baseMonth = parseInt(safeTodayStr.slice(5, 7), 10); // 1..12

  const points: NetWorthMonthlyTrendPoint[] = [];

  for (let i = 5; i >= 0; i--) {
    const refDate = new Date(baseYear, baseMonth - 1 - i, 1);
    const year = refDate.getFullYear();
    const monthIdx = refDate.getMonth(); // 0..11
    const monthKey = `${year}-${String(monthIdx + 1).padStart(2, '0')}`;
    const monthLabel = `${SHORT_MONTHS_ID[monthIdx]} '${String(year).slice(-2)}`;

    const lastDay = new Date(year, monthIdx + 1, 0).getDate();
    const monthEndStr = `${monthKey}-${String(lastDay).padStart(2, '0')}`;
    const cutoffDate = i === 0 ? safeTodayStr : monthEndStr < safeTodayStr ? monthEndStr : safeTodayStr;

    const snapshot = rollbackAssetsAndDebtsAtDate(
      safeTxs,
      accountTypeMap,
      cutoffDate,
      safeTodayStr,
      currentAssets,
      currentDebts
    );

    const prevNetWorth = points.length > 0 ? points[points.length - 1].netWorth : snapshot.netWorth;
    const deltaFromPrev = points.length > 0 ? snapshot.netWorth - prevNetWorth : 0;
    const deltaPctFromPrev =
      points.length > 0 && Math.abs(prevNetWorth) > 0
        ? (deltaFromPrev / Math.abs(prevNetWorth)) * 100
        : 0;

    points.push({
      date: monthLabel,
      monthKey,
      monthLabel,
      cutoffDate,
      deltaFromPrev,
      deltaPctFromPrev,
      ...snapshot,
    });
  }

  return points;
}

export interface NetWorthCombinedTrendPoint {
  monthKey: string;
  monthLabel: string;
  cutoffDate: string;
  isProjection: boolean;
  // Historical actual series (M-5 .. M0)
  netWorth?: number;
  assets?: number;
  debts?: number;
  // Dashed projection continuation series (anchored at M0 -> +1 .. +3)
  projectedNetWorth?: number;
  projectedAssets?: number;
  projectedDebts?: number;
  // Unified display values for Tooltip/calculations
  displayNetWorth: number;
  displayAssets: number;
  displayDebts: number;
  ratio: number;
  status: 'Sehat' | 'Waspada' | 'Kritis';
  deltaFromPrev: number;
  deltaPctFromPrev: number;
}

export interface NetWorthTrendWithProjectionResult {
  points: NetWorthCombinedTrendPoint[];
  historicalPoints: NetWorthCombinedTrendPoint[];
  currentMonthLabel: string;
  currentNetWorth: number;
  projectedNetWorth3M: number;
  projectedAssets3M: number;
  projectedDebts3M: number;
  projectedDeltaAmount: number;
  projectedDeltaPct: number;
  historicalSlopeMonthly: number;
  avgNetCashFlowMonthly: number;
  blendedMonthlyGrowth: number;
  activeCashFlowMonths: number;
}

function computeLinearRegressionSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumXX += i * i;
  }
  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) return 0;
  return (n * sumXY - sumX * sumY) / denominator;
}

/**
 * Menggabungkan riwayat Net Worth 6 bulan terakhir dengan proyeksi 3 bulan ke depan
 * menggunakan kombinasi tren regresi historis 6 bulan dan rata-rata surplus arus kas operasional.
 */
export function calculateNetWorthTrendWithProjection(
  transactions: Transaction[],
  accounts: Account[],
  currentAssets: number,
  currentDebts: number,
  systemTodayStr: string
): NetWorthTrendWithProjectionResult {
  const safeTxs = Array.isArray(transactions) ? transactions : [];
  const safeTodayStr =
    normalizeLedgerDateYYYYMMDD(systemTodayStr) || new Date().toISOString().split('T')[0];

  const hist = calculateNetWorthHistory6Months(
    safeTxs,
    accounts,
    currentAssets,
    currentDebts,
    safeTodayStr
  );

  const histMonthKeys = new Set(hist.map((p) => p.monthKey));
  const activeCashFlowMonthSet = new Set<string>();
  let totalOperatingIncome6M = 0;
  let totalOperatingExpense6M = 0;

  for (const tx of safeTxs) {
    if (!tx || !tx.date || tx.date > safeTodayStr) continue;
    const mKey = tx.date.slice(0, 7);
    if (!histMonthKeys.has(mKey)) continue;
    if (isOperatingIncome(tx)) {
      totalOperatingIncome6M += normalizeAbsAmount(tx.amount);
      activeCashFlowMonthSet.add(mKey);
    } else if (isOperatingExpense(tx)) {
      totalOperatingExpense6M += normalizeAbsAmount(tx.amount);
      activeCashFlowMonthSet.add(mKey);
    }
  }

  const activeCashFlowMonths = activeCashFlowMonthSet.size;
  const avgNetCashFlowMonthly =
    activeCashFlowMonths > 0
      ? (totalOperatingIncome6M - totalOperatingExpense6M) / activeCashFlowMonths
      : 0;

  const historicalSlopeMonthly = computeLinearRegressionSlope(hist.map((p) => p.netWorth));
  const historicalDebtSlope = computeLinearRegressionSlope(hist.map((p) => p.debts));

  // Gabungan 50% tren regresi historis 6 bulan + 50% rata-rata surplus arus kas bulanan
  const blendedMonthlyGrowth =
    activeCashFlowMonths > 0
      ? historicalSlopeMonthly * 0.5 + avgNetCashFlowMonthly * 0.5
      : historicalSlopeMonthly;

  const lastHist = hist[hist.length - 1];
  const currentMonthLabel = lastHist?.monthLabel || '';
  const currentNetWorth = lastHist?.netWorth ?? currentAssets - currentDebts;

  const historicalPoints: NetWorthCombinedTrendPoint[] = hist.map((p, idx) => {
    const isAnchor = idx === hist.length - 1;
    return {
      monthKey: p.monthKey,
      monthLabel: p.monthLabel,
      cutoffDate: p.cutoffDate,
      isProjection: false,
      netWorth: p.netWorth,
      assets: p.assets,
      debts: p.debts,
      ...(isAnchor
        ? {
            projectedNetWorth: p.netWorth,
            projectedAssets: p.assets,
            projectedDebts: p.debts,
          }
        : {}),
      displayNetWorth: p.netWorth,
      displayAssets: p.assets,
      displayDebts: p.debts,
      ratio: p.ratio,
      status: p.status,
      deltaFromPrev: p.deltaFromPrev,
      deltaPctFromPrev: p.deltaPctFromPrev,
    };
  });

  const baseYear = parseInt(safeTodayStr.slice(0, 4), 10);
  const baseMonth = parseInt(safeTodayStr.slice(5, 7), 10);
  const projectionPoints: NetWorthCombinedTrendPoint[] = [];
  let prevDisplayNetWorth = currentNetWorth;

  for (let step = 1; step <= 3; step++) {
    const refDate = new Date(baseYear, baseMonth - 1 + step, 1);
    const year = refDate.getFullYear();
    const monthIdx = refDate.getMonth();
    const monthKey = `${year}-${String(monthIdx + 1).padStart(2, '0')}`;
    const monthLabel = `${SHORT_MONTHS_ID[monthIdx]} '${String(year).slice(-2)}`;
    const lastDay = new Date(year, monthIdx + 1, 0).getDate();
    const cutoffDate = `${monthKey}-${String(lastDay).padStart(2, '0')}`;

    const baseDebts = lastHist ? lastHist.debts : currentDebts;
    const projectedDebts = Math.max(0, Math.round(baseDebts + historicalDebtSlope * step));
    const targetNetWorth = Math.round(currentNetWorth + blendedMonthlyGrowth * step);
    const projectedAssets = Math.max(0, targetNetWorth + projectedDebts);
    const projectedNetWorth = projectedAssets - projectedDebts;

    const deltaFromPrev = projectedNetWorth - prevDisplayNetWorth;
    const deltaPctFromPrev =
      Math.abs(prevDisplayNetWorth) > 0
        ? (deltaFromPrev / Math.abs(prevDisplayNetWorth)) * 100
        : 0;
    prevDisplayNetWorth = projectedNetWorth;

    const ratio =
      projectedAssets > 0
        ? (projectedDebts / projectedAssets) * 100
        : projectedDebts > 0
        ? 100
        : 0;
    let status: 'Sehat' | 'Waspada' | 'Kritis' = 'Sehat';
    if (projectedDebts > 0) {
      if (ratio <= 35) status = 'Sehat';
      else if (ratio <= 75) status = 'Waspada';
      else status = 'Kritis';
    }

    projectionPoints.push({
      monthKey,
      monthLabel,
      cutoffDate,
      isProjection: true,
      projectedNetWorth,
      projectedAssets,
      projectedDebts,
      displayNetWorth: projectedNetWorth,
      displayAssets: projectedAssets,
      displayDebts: projectedDebts,
      ratio,
      status,
      deltaFromPrev,
      deltaPctFromPrev,
    });
  }

  const lastProj = projectionPoints[projectionPoints.length - 1];
  const projectedNetWorth3M = lastProj?.displayNetWorth ?? currentNetWorth;
  const projectedAssets3M = lastProj?.displayAssets ?? currentAssets;
  const projectedDebts3M = lastProj?.displayDebts ?? currentDebts;
  const projectedDeltaAmount = projectedNetWorth3M - currentNetWorth;
  const projectedDeltaPct =
    Math.abs(currentNetWorth) > 0
      ? (projectedDeltaAmount / Math.abs(currentNetWorth)) * 100
      : 0;

  return {
    points: [...historicalPoints, ...projectionPoints],
    historicalPoints,
    currentMonthLabel,
    currentNetWorth,
    projectedNetWorth3M,
    projectedAssets3M,
    projectedDebts3M,
    projectedDeltaAmount,
    projectedDeltaPct,
    historicalSlopeMonthly: Math.round(historicalSlopeMonthly),
    avgNetCashFlowMonthly: Math.round(avgNetCashFlowMonthly),
    blendedMonthlyGrowth: Math.round(blendedMonthlyGrowth),
    activeCashFlowMonths,
  };
}

export interface CFPHealthRatiosResult {
  monthlyIncome: number;
  monthlyExpense: number;
  monthlySavingsAndInvest: number;
  monthlyDebtService: number;
  liquidCash: number;
  emergencyBalance: number;
  totalInvestmentValue: number;
  totalFixedAssetValue: number;
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
  emergencyTransactions: EmergencyFundTransaction[] = [],
  fixedAssets: FixedAsset[] = []
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
  const totalFixedAssetValue = calculateTotalFixedAssets(fixedAssets, debts);
  const totalAssets = liquidCash + emergencyBalance + totalInvestmentValue + totalFixedAssetValue;

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
    totalFixedAssetValue,
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

export type WeeklyPrioritySeverity = 'high' | 'medium' | 'positive';

export interface WeeklyFinancialPriorityItem {
  id: string;
  rank: 1 | 2 | 3;
  severity: WeeklyPrioritySeverity;
  urgencyLabel: 'Mendesak' | 'Perlu Perhatian' | 'Terkendali';
  categoryLabel: string;
  title: string;
  metricSummary: string;
  description: string;
  actionLabel: string;
  targetTab:
    | 'budget'
    | 'debts'
    | 'emergency-fund'
    | 'investments'
    | 'transactions'
    | 'reports';
  urgencyScore: number;
}

export interface WeeklyFinancialPrioritiesResult {
  priorities: WeeklyFinancialPriorityItem[];
  thisWeekExpense: number;
  prevWeekExpense: number;
  weekDeltaAmount: number;
  weekDeltaPct: number;
  thisWeekIncome: number;
  thisWeekTxCount: number;
  prevWeekTxCount: number;
  topCategoryThisWeek: string | null;
  topCategoryAmount: number;
  anomalyCount: number;
  weekRangeLabel: string;
}

function shiftDateStringDays(baseDateStr: string, deltaDays: number): string {
  const [y, m, d] = baseDateStr.split('-').map((n) => parseInt(n, 10));
  const dt = new Date(y, (m || 1) - 1, (d || 1) + deltaDays);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function defaultFormatRp(amount: number): string {
  const abs = Math.abs(Math.round(amount));
  const formatted = abs.toLocaleString('id-ID');
  return amount < 0 ? `-Rp ${formatted}` : `Rp ${formatted}`;
}

/**
 * Menganalisis tren transaksi 7 hari terakhir vs 7 hari sebelumnya, batas anggaran aktif,
 * jatuh tempo utang, cakupan dana darurat, dan optimalisasi kas untuk menyusun
 * tepat 3 prioritas keuangan utama pengguna minggu ini.
 */
export function calculateWeeklyFinancialPriorities(params: {
  transactions: Transaction[];
  accounts: Account[];
  budgets: CategoryBudget[];
  debts: Debt[];
  investments: InvestmentAsset[];
  emergencyTransactions: EmergencyFundTransaction[];
  systemTodayStr: string;
  formatCurrency?: (amount: number) => string;
}): WeeklyFinancialPrioritiesResult {
  const {
    transactions = [],
    accounts = [],
    budgets = [],
    debts = [],
    investments = [],
    emergencyTransactions = [],
    systemTodayStr,
    formatCurrency = defaultFormatRp,
  } = params;

  const safeTodayStr =
    normalizeLedgerDateYYYYMMDD(systemTodayStr) || new Date().toISOString().split('T')[0];
  const weekStartStr = shiftDateStringDays(safeTodayStr, -6);
  const prevWeekStartStr = shiftDateStringDays(safeTodayStr, -13);
  const prevWeekEndStr = shiftDateStringDays(safeTodayStr, -7);
  const currentMonthPrefix = safeTodayStr.slice(0, 7);

  const formatShortId = (dStr: string) => {
    const [, mm, dd] = dStr.split('-').map((n) => parseInt(n, 10));
    return `${dd} ${SHORT_MONTHS_ID[(mm || 1) - 1]}`;
  };
  const weekRangeLabel = `${formatShortId(weekStartStr)} - ${formatShortId(safeTodayStr)}`;

  let thisWeekExpense = 0;
  let prevWeekExpense = 0;
  let thisWeekIncome = 0;
  let thisWeekTxCount = 0;
  let prevWeekTxCount = 0;

  const thisWeekCategoryMap: Record<string, number> = {};
  const prevWeekCategoryMap: Record<string, number> = {};
  let largestWeekTx: { category: string; description: string; amount: number; date: string } | null = null;

  let monthOperatingIncome = 0;
  let monthOperatingExpense = 0;
  const monthExpenseByCategory: Record<string, number> = {};

  for (const tx of transactions) {
    if (!tx || !tx.date || tx.isAdjustment) continue;
    const txDate = normalizeLedgerDateYYYYMMDD(tx.date);
    if (!txDate || txDate > safeTodayStr) continue;

    const amt = normalizeAbsAmount(tx.amount);
    const isOpExp = isOperatingExpense(tx);
    const isOpInc = isOperatingIncome(tx);

    if (txDate >= weekStartStr && txDate <= safeTodayStr) {
      thisWeekTxCount += 1;
      if (isOpExp) {
        thisWeekExpense += amt;
        const cat = tx.category || 'Lainnya';
        thisWeekCategoryMap[cat] = (thisWeekCategoryMap[cat] || 0) + amt;
        if (!largestWeekTx || amt > largestWeekTx.amount) {
          largestWeekTx = {
            category: cat,
            description: tx.description || cat,
            amount: amt,
            date: txDate,
          };
        }
      } else if (isOpInc) {
        thisWeekIncome += amt;
      }
    } else if (txDate >= prevWeekStartStr && txDate <= prevWeekEndStr) {
      prevWeekTxCount += 1;
      if (isOpExp) {
        prevWeekExpense += amt;
        const cat = tx.category || 'Lainnya';
        prevWeekCategoryMap[cat] = (prevWeekCategoryMap[cat] || 0) + amt;
      }
    }

    if (txDate.startsWith(currentMonthPrefix)) {
      if (isOpInc) {
        monthOperatingIncome += amt;
      } else if (isOpExp) {
        monthOperatingExpense += amt;
        const cat = tx.category || 'Lainnya';
        monthExpenseByCategory[cat] = (monthExpenseByCategory[cat] || 0) + amt;
      }
    }
  }

  const weekDeltaAmount = thisWeekExpense - prevWeekExpense;
  const weekDeltaPct =
    prevWeekExpense > 0
      ? (weekDeltaAmount / prevWeekExpense) * 100
      : thisWeekExpense > 0
      ? 100
      : 0;

  let topCategoryThisWeek: string | null = null;
  let topCategoryAmount = 0;
  for (const [cat, amt] of Object.entries(thisWeekCategoryMap)) {
    if (amt > topCategoryAmount) {
      topCategoryAmount = amt;
      topCategoryThisWeek = cat;
    }
  }

  // Detect category spike (7d vs prev 7d)
  let topSpikeCategory: { category: string; thisAmt: number; prevAmt: number; jumpAmt: number; jumpPct: number } | null = null;
  for (const [cat, thisAmt] of Object.entries(thisWeekCategoryMap)) {
    const prevAmt = prevWeekCategoryMap[cat] || 0;
    const jumpAmt = thisAmt - prevAmt;
    if (jumpAmt > 0 && thisAmt >= 150000) {
      const jumpPct = prevAmt > 0 ? (jumpAmt / prevAmt) * 100 : 100;
      if (!topSpikeCategory || jumpAmt > topSpikeCategory.jumpAmt) {
        topSpikeCategory = { category: cat, thisAmt, prevAmt, jumpAmt, jumpPct };
      }
    }
  }

  // Budget audit for active month
  const overBudgets: Array<{ category: string; limit: number; actual: number; overAmt: number; pct: number }> = [];
  const nearBudgets: Array<{ category: string; limit: number; actual: number; remaining: number; pct: number }> = [];

  for (const b of budgets) {
    if (!b || b.type !== 'expense') continue;
    const limit = Number((b as any).monthlyLimit || b.limit || 0);
    if (limit <= 0) continue;
    const matchedCat = Object.keys(monthExpenseByCategory).find(
      (k) => k.toLowerCase() === b.category.toLowerCase()
    );
    const actual = matchedCat ? monthExpenseByCategory[matchedCat] : 0;
    const pct = (actual / limit) * 100;
    if (actual > limit) {
      overBudgets.push({
        category: b.category,
        limit,
        actual,
        overAmt: actual - limit,
        pct,
      });
    } else if (pct >= 80) {
      nearBudgets.push({
        category: b.category,
        limit,
        actual,
        remaining: Math.max(0, limit - actual),
        pct,
      });
    }
  }
  overBudgets.sort((a, b) => b.overAmt - a.overAmt);
  nearBudgets.sort((a, b) => b.pct - a.pct);

  // Upcoming debts & credit card bills within 7 days
  const [ty, tm, td] = safeTodayStr.split('-').map((n) => parseInt(n, 10));
  const todayLocal = new Date(ty, (tm || 1) - 1, td || 1);
  const dueSoonDebts: Array<{ name: string; amount: number; daysLeft: number }> = [];

  for (const d of debts) {
    if (!d || d.balance <= 0) continue;
    let daysLeft: number | null = null;
    if (d.dueDate) {
      const dueStr = normalizeLedgerDateYYYYMMDD(d.dueDate);
      if (dueStr) {
        const [dy, dmo, dda] = dueStr.split('-').map((n) => parseInt(n, 10));
        const dueDt = new Date(dy, (dmo || 1) - 1, dda || 1);
        daysLeft = Math.ceil((dueDt.getTime() - todayLocal.getTime()) / (1000 * 60 * 60 * 24));
      }
    } else if (d.dueDay && d.dueDay >= 1 && d.dueDay <= 31) {
      let targetDt = new Date(todayLocal.getFullYear(), todayLocal.getMonth(), d.dueDay);
      if (d.dueDay < todayLocal.getDate()) {
        targetDt = new Date(todayLocal.getFullYear(), todayLocal.getMonth() + 1, d.dueDay);
      }
      daysLeft = Math.ceil((targetDt.getTime() - todayLocal.getTime()) / (1000 * 60 * 60 * 24));
    }
    if (daysLeft !== null && daysLeft <= 7) {
      dueSoonDebts.push({
        name: d.name,
        amount: d.minPayment > 0 ? Math.min(d.minPayment, d.balance) : d.balance,
        daysLeft,
      });
    }
  }

  for (const acc of getCreditAccounts(accounts)) {
    const bill = getAccountCreditBill(acc);
    if (bill <= 0 || !acc.dueDay) continue;
    let targetDt = new Date(todayLocal.getFullYear(), todayLocal.getMonth(), acc.dueDay);
    if (acc.dueDay < todayLocal.getDate()) {
      targetDt = new Date(todayLocal.getFullYear(), todayLocal.getMonth() + 1, acc.dueDay);
    }
    const daysLeft = Math.ceil((targetDt.getTime() - todayLocal.getTime()) / (1000 * 60 * 60 * 24));
    if (daysLeft <= 7) {
      dueSoonDebts.push({
        name: acc.name,
        amount: acc.minPayment && acc.minPayment > 0 ? Math.min(acc.minPayment, bill) : bill,
        daysLeft,
      });
    }
  }
  dueSoonDebts.sort((a, b) => a.daysLeft - b.daysLeft);

  const liquidCash = calculateTotalLiquidCash(accounts);
  const emergencyBalance = calculateTotalEmergencyFund(emergencyTransactions);
  const totalInvestments = calculateTotalInvestments(investments);
  const monthlyDebtService = calculateMonthlyDebtService(accounts, debts);
  const dtiRatioPct = monthOperatingIncome > 0 ? (monthlyDebtService / monthOperatingIncome) * 100 : 0;

  const anomalyCount =
    overBudgets.length +
    (weekDeltaPct >= 25 && weekDeltaAmount >= 250000 ? 1 : 0) +
    (largestWeekTx && largestWeekTx.amount >= 1000000 ? 1 : 0);

  type CandidatePriority = Omit<WeeklyFinancialPriorityItem, 'rank'>;
  const candidates: CandidatePriority[] = [];

  // 1. Over-budget / near-budget priority
  if (overBudgets.length > 0) {
    const topOver = overBudgets[0];
    candidates.push({
      id: 'prio-budget-over',
      severity: 'high',
      urgencyLabel: 'Mendesak',
      categoryLabel: 'Kendali Anggaran',
      title: `Rem Pengeluaran ${topOver.category}`,
      metricSummary: `Over ${formatCurrency(topOver.overAmt)} (${Math.round(topOver.pct)}%)`,
      description: `Realisasi kategori ${topOver.category} bulan ini mencapai ${formatCurrency(topOver.actual)} dari batas ${formatCurrency(topOver.limit)}. Hentikan belanja non-esensial di pos ini hingga akhir bulan.`,
      actionLabel: 'Tinjau Anggaran',
      targetTab: 'budget',
      urgencyScore: 96,
    });
  } else if (nearBudgets.length > 0) {
    const topNear = nearBudgets[0];
    candidates.push({
      id: 'prio-budget-near',
      severity: 'medium',
      urgencyLabel: 'Perlu Perhatian',
      categoryLabel: 'Kendali Anggaran',
      title: `Jaga Sisa Limit ${topNear.category}`,
      metricSummary: `Sisa ${formatCurrency(topNear.remaining)} (${Math.round(topNear.pct)}% terpakai)`,
      description: `Anggaran ${topNear.category} sudah terpakai ${Math.round(topNear.pct)}%. Batasi pengeluaran minggu ini agar tidak melampaui plafon ${formatCurrency(topNear.limit)}.`,
      actionLabel: 'Pantau Anggaran',
      targetTab: 'budget',
      urgencyScore: 76,
    });
  }

  // 2. Debt due soon or high DTI priority
  if (dueSoonDebts.length > 0) {
    const topDue = dueSoonDebts[0];
    const isCritical = topDue.daysLeft <= 3;
    const duePhrase =
      topDue.daysLeft < 0
        ? `terlewat ${Math.abs(topDue.daysLeft)} hari`
        : topDue.daysLeft === 0
        ? 'jatuh tempo hari ini'
        : `dalam ${topDue.daysLeft} hari`;
    candidates.push({
      id: 'prio-debt-due',
      severity: isCritical ? 'high' : 'medium',
      urgencyLabel: isCritical ? 'Mendesak' : 'Perlu Perhatian',
      categoryLabel: 'Kewajiban & Jatuh Tempo',
      title: `Siapkan Tagihan ${topDue.name}`,
      metricSummary: `${formatCurrency(topDue.amount)} · ${topDue.daysLeft <= 0 ? 'Segera Bayar' : `${topDue.daysLeft} hari lagi`}`,
      description: `Pembayaran ${topDue.name} ${duePhrase}. Pastikan saldo kas likuid (${formatCurrency(liquidCash)}) mencukupi untuk menghindari denda keterlambatan.`,
      actionLabel: 'Kelola Utang',
      targetTab: 'debts',
      urgencyScore: isCritical ? 94 : 79,
    });
  } else if (dtiRatioPct > 35) {
    candidates.push({
      id: 'prio-dti-high',
      severity: 'medium',
      urgencyLabel: 'Perlu Perhatian',
      categoryLabel: 'Rasio Beban Utang',
      title: 'Tekan Rasio Cicilan Utang (DTI)',
      metricSummary: `${dtiRatioPct.toFixed(1)}% dari pemasukan`,
      description: `Kewajiban cicilan bulanan (${formatCurrency(monthlyDebtService)}) melampaui batas ideal 35%. Prioritaskan pelunasan utang berbunga tertinggi terlebih dahulu.`,
      actionLabel: 'Simulasi Pelunasan',
      targetTab: 'debts',
      urgencyScore: 78,
    });
  }

  // 3. Weekly spending trend spike priority
  if (thisWeekExpense > prevWeekExpense && weekDeltaAmount >= 100000 && (weekDeltaPct >= 12 || prevWeekExpense === 0)) {
    const spikeNote = topSpikeCategory
      ? ` Lonjakan terbesar berasal dari pos ${topSpikeCategory.category} (${formatCurrency(topSpikeCategory.thisAmt)}).`
      : '';
    const isHighSpike = weekDeltaPct >= 30 || weekDeltaAmount >= 750000;
    candidates.push({
      id: 'prio-weekly-spike',
      severity: isHighSpike ? 'high' : 'medium',
      urgencyLabel: isHighSpike ? 'Mendesak' : 'Perlu Perhatian',
      categoryLabel: 'Tren Transaksi 7 Hari',
      title: topSpikeCategory
        ? `Kendalikan Lonjakan ${topSpikeCategory.category}`
        : 'Rem Laju Pengeluaran Minggu Ini',
      metricSummary: `+${formatCurrency(weekDeltaAmount)} (${prevWeekExpense > 0 ? `+${weekDeltaPct.toFixed(0)}%` : 'Minggu Aktif'})`,
      description: `Pengeluaran 7 hari terakhir mencapai ${formatCurrency(thisWeekExpense)}, naik dibanding minggu sebelumnya (${formatCurrency(prevWeekExpense)}).${spikeNote}`,
      actionLabel: 'Cek Mutasi',
      targetTab: 'transactions',
      urgencyScore: isHighSpike ? 89 : 74,
    });
  }

  // 4. Current month cashflow deficit priority
  if (monthOperatingExpense > monthOperatingIncome && monthOperatingExpense > 0) {
    const deficit = monthOperatingExpense - monthOperatingIncome;
    candidates.push({
      id: 'prio-cashflow-deficit',
      severity: 'high',
      urgencyLabel: 'Mendesak',
      categoryLabel: 'Arus Kas Operasional',
      title: 'Tutup Defisit Arus Kas Bulan Ini',
      metricSummary: `Defisit ${formatCurrency(deficit)}`,
      description: `Pengeluaran operasional bulan berjalan (${formatCurrency(monthOperatingExpense)}) melampaui pemasukan (${formatCurrency(monthOperatingIncome)}). Tunda pembelian sekunder hingga arus kas kembali surplus.`,
      actionLabel: 'Buka Laporan',
      targetTab: 'reports',
      urgencyScore: 91,
    });
  }

  // 5. Emergency fund coverage priority
  const baselineMonthlyExpense = Math.max(monthOperatingExpense, thisWeekExpense * 4, 2500000);
  const targetEmergency = Math.max(5000000, baselineMonthlyExpense * 3);
  if (emergencyBalance < targetEmergency) {
    const coverageMonths = baselineMonthlyExpense > 0 ? emergencyBalance / baselineMonthlyExpense : 0;
    const gap = targetEmergency - emergencyBalance;
    const isVeryLow = coverageMonths < 1.5;
    candidates.push({
      id: 'prio-emergency-gap',
      severity: isVeryLow ? 'high' : 'medium',
      urgencyLabel: isVeryLow ? 'Mendesak' : 'Perlu Perhatian',
      categoryLabel: 'Ketahanan Dana Darurat',
      title: 'Perkuat Cadangan Dana Darurat',
      metricSummary: `${coverageMonths.toFixed(1)} bln (Target 3 bln)`,
      description: `Saldo dana darurat saat ini ${formatCurrency(emergencyBalance)}, masih butuh ${formatCurrency(gap)} untuk menutup minimal 3 bulan pengeluaran aman.`,
      actionLabel: 'Isi Dana Darurat',
      targetTab: 'emergency-fund',
      urgencyScore: isVeryLow ? 84 : 69,
    });
  }

  // 6. Idle cash optimization priority
  if (liquidCash > 10000000 && totalInvestments < liquidCash * 0.25) {
    const suggestedAlloc = Math.round(liquidCash * 0.2);
    candidates.push({
      id: 'prio-idle-cash',
      severity: 'medium',
      urgencyLabel: 'Perlu Perhatian',
      categoryLabel: 'Optimalisasi Aset',
      title: 'Alokasikan Kas Menganggur',
      metricSummary: `Kas ${formatCurrency(liquidCash)} · Inv. ${formatCurrency(totalInvestments)}`,
      description: `Porsi dana likuid cukup besar dibanding portofolio investasi. Pertimbangkan mengalihkan sekitar ${formatCurrency(suggestedAlloc)} ke instrumen produktif agar tidak tergerus inflasi.`,
      actionLabel: 'Kelola Portofolio',
      targetTab: 'investments',
      urgencyScore: 60,
    });
  }

  // 7. Positive / maintenance fallbacks so there are always 3 well-grounded priorities
  if (thisWeekExpense <= prevWeekExpense) {
    const savedVsPrev = Math.max(0, prevWeekExpense - thisWeekExpense);
    candidates.push({
      id: 'prio-weekly-disciplined',
      severity: 'positive',
      urgencyLabel: 'Terkendali',
      categoryLabel: 'Tren Transaksi 7 Hari',
      title:
        thisWeekTxCount === 0
          ? 'Catat Transaksi Rutin Minggu Ini'
          : 'Pertahankan Efisiensi Mingguan',
      metricSummary:
        thisWeekTxCount === 0
          ? '0 transaksi 7 hari terakhir'
          : savedVsPrev > 0
          ? `Hemat ${formatCurrency(savedVsPrev)} vs minggu lalu`
          : `${formatCurrency(thisWeekExpense)} (Stabil)`,
      description:
        thisWeekTxCount === 0
          ? 'Belum ada transaksi tercatat dalam 7 hari terakhir. Pastikan seluruh mutasi harian dicatat agar proyeksi arus kas tetap akurat.'
          : `Total pengeluaran 7 hari terakhir (${formatCurrency(thisWeekExpense)}) lebih terkendali dibanding minggu sebelumnya (${formatCurrency(prevWeekExpense)}).`,
      actionLabel: 'Lihat Transaksi',
      targetTab: 'transactions',
      urgencyScore: 48,
    });
  }

  const monthSurplus = monthOperatingIncome - monthOperatingExpense;
  if (monthSurplus > 0) {
    const allocTarget = Math.round(monthSurplus * 0.3);
    candidates.push({
      id: 'prio-surplus-invest',
      severity: 'positive',
      urgencyLabel: 'Terkendali',
      categoryLabel: 'Alokasi Surplus',
      title: 'Kunci Surplus Bulan Ini ke Investasi',
      metricSummary: `Surplus ${formatCurrency(monthSurplus)}`,
      description: `Arus kas operasional bulan ini mencatat surplus bersih ${formatCurrency(monthSurplus)}. Sisihkan sekitar ${formatCurrency(allocTarget)} sebelum terpakai konsumsi.`,
      actionLabel: 'Tambah Investasi',
      targetTab: 'investments',
      urgencyScore: 44,
    });
  }

  candidates.push({
    id: 'prio-review-reports',
    severity: 'positive',
    urgencyLabel: 'Terkendali',
    categoryLabel: 'Evaluasi Berkala',
    title: 'Tinjau Neraca & Laba-Rugi Bulanan',
    metricSummary: `${thisWeekTxCount} transaksi minggu ini`,
    description: topCategoryThisWeek
      ? `Pos pengeluaran terbesar minggu ini adalah ${topCategoryThisWeek} (${formatCurrency(topCategoryAmount)}). Pastikan pencatatan pos dan saldo akun sudah rekonsiliasi rapi.`
      : 'Lakukan peninjauan rutin pada laporan neraca dan laba-rugi untuk memastikan seluruh saldo rekening serta aset tetap sinkron.',
    actionLabel: 'Buka Laporan',
    targetTab: 'reports',
    urgencyScore: 35,
  });

  // Deduplicate by id & sort descending by urgencyScore, pick top 3
  const uniqueMap = new Map<string, CandidatePriority>();
  for (const c of candidates) {
    if (!uniqueMap.has(c.id)) uniqueMap.set(c.id, c);
  }

  const sortedTop3 = Array.from(uniqueMap.values())
    .sort((a, b) => b.urgencyScore - a.urgencyScore)
    .slice(0, 3)
    .map((item, idx) => ({
      ...item,
      rank: (idx + 1) as 1 | 2 | 3,
    }));

  return {
    priorities: sortedTop3,
    thisWeekExpense,
    prevWeekExpense,
    weekDeltaAmount,
    weekDeltaPct,
    thisWeekIncome,
    thisWeekTxCount,
    prevWeekTxCount,
    topCategoryThisWeek,
    topCategoryAmount,
    anomalyCount,
    weekRangeLabel,
  };
}

