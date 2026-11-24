import { Account, KprCoaMappingConfig, KprPreset, Transaction } from '../types';
import { AccountCOA, getAccountCoaMapping } from '../coaUtils';

export const DEFAULT_KPR_COA_MAPPING: KprCoaMappingConfig = {
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

export const DEFAULT_KPR_PRESETS: KprPreset[] = [
  {
    id: 'kpr-swasta-tiered',
    name: 'KPR Bank Swasta (Fixed 3 Thn + Floating)',
    description: 'Skema umum bank swasta nasional dengan bunga promo fixed 3 tahun awal dilanjutkan floating.',
    scheme: 'tiered',
    tenorYears: 15,
    dpPercent: 20,
    annualRate: 8.5,
    fixedRate: 5.5,
    fixedYears: 3,
    floatingRate: 11.5,
    floatingCapRate: 13.5,
    earlyRepaymentPenaltyPct: 2.0,
    provisiPct: 1.0,
    adminFee: 1000000,
    appraisalFee: 500000,
    notaryAjbPct: 1.25,
    bphtbPct: 3.5,
    insurancePct: 1.2,
    isDefault: true,
  },
  {
    id: 'kpr-flpp-subsidi',
    name: 'KPR Subsidi FLPP (Bunga Tetap 5%)',
    description: 'Program KPR subsidi pemerintah dengan suku bunga anuitas tetap 5% sepanjang tenor dan bebas BPHTB.',
    scheme: 'annuity',
    tenorYears: 15,
    dpPercent: 10,
    annualRate: 5.0,
    fixedRate: 5.0,
    fixedYears: 15,
    floatingRate: 5.0,
    floatingCapRate: 5.0,
    earlyRepaymentPenaltyPct: 0,
    provisiPct: 0.5,
    adminFee: 350000,
    appraisalFee: 250000,
    notaryAjbPct: 1.0,
    bphtbPct: 0,
    insurancePct: 0.75,
    isDefault: true,
  },
  {
    id: 'kpr-tenor-20',
    name: 'KPR Tenor Panjang (20 Tahun Cicilan Ringan)',
    description: 'Cocok untuk meminimalkan beban cicilan bulanan (DTI) dengan masa fixed 5 tahun.',
    scheme: 'tiered',
    tenorYears: 20,
    dpPercent: 15,
    annualRate: 8.8,
    fixedRate: 6.2,
    fixedYears: 5,
    floatingRate: 11.8,
    floatingCapRate: 14.0,
    earlyRepaymentPenaltyPct: 2.5,
    provisiPct: 1.0,
    adminFee: 1000000,
    appraisalFee: 750000,
    notaryAjbPct: 1.25,
    bphtbPct: 3.5,
    insurancePct: 1.5,
    isDefault: true,
  },
  {
    id: 'kpr-syariah-flat',
    name: 'KPR Syariah / Margin Tetap',
    description: 'Cicilan tetap hingga lunas dengan margin setara flat 6.5% per tahun tanpa risiko floating.',
    scheme: 'flat',
    tenorYears: 10,
    dpPercent: 20,
    annualRate: 6.5,
    fixedRate: 6.5,
    fixedYears: 10,
    floatingRate: 6.5,
    floatingCapRate: 6.5,
    earlyRepaymentPenaltyPct: 0,
    provisiPct: 0.5,
    adminFee: 750000,
    appraisalFee: 500000,
    notaryAjbPct: 1.0,
    bphtbPct: 3.5,
    insurancePct: 1.0,
    isDefault: true,
  },
];

export interface KprClosingCostBreakdown {
  provisiFee: number;
  adminFee: number;
  appraisalFee: number;
  notaryAjbFee: number;
  bphtbTax: number;
  insuranceFee: number;
  totalClosingCosts: number;
}

export function calculateKprClosingCosts(
  propertyPrice: number,
  principal: number,
  preset: Pick<KprPreset, 'provisiPct' | 'adminFee' | 'appraisalFee' | 'notaryAjbPct' | 'bphtbPct' | 'insurancePct'>
): KprClosingCostBreakdown {
  const safePrice = Math.max(0, propertyPrice || 0);
  const safePrincipal = Math.max(0, principal || 0);

  const provisiFee = Math.round(safePrincipal * (Math.max(0, preset.provisiPct || 0) / 100));
  const adminFee = Math.round(Math.max(0, preset.adminFee || 0));
  const appraisalFee = Math.round(Math.max(0, preset.appraisalFee || 0));
  const notaryAjbFee = Math.round(safePrice * (Math.max(0, preset.notaryAjbPct || 0) / 100));
  const bphtbTax = Math.round(safePrice * (Math.max(0, preset.bphtbPct || 0) / 100));
  const insuranceFee = Math.round(safePrincipal * (Math.max(0, preset.insurancePct || 0) / 100));

  const totalClosingCosts = provisiFee + adminFee + appraisalFee + notaryAjbFee + bphtbTax + insuranceFee;

  return {
    provisiFee,
    adminFee,
    appraisalFee,
    notaryAjbFee,
    bphtbTax,
    insuranceFee,
    totalClosingCosts,
  };
}

let memoryKprPresets: KprPreset[] = DEFAULT_KPR_PRESETS;
let memoryKprCoaMapping: KprCoaMappingConfig = DEFAULT_KPR_COA_MAPPING;

export function getStoredKprPresets(_username?: string): KprPreset[] {
  return memoryKprPresets.map((p: KprPreset) => ({
    ...p,
    appraisalFee: p.appraisalFee ?? 500000,
    floatingCapRate: p.floatingCapRate ?? Math.max(p.floatingRate || 0, 13),
    earlyRepaymentPenaltyPct: p.earlyRepaymentPenaltyPct ?? (p.scheme === 'tiered' ? 2.0 : 0),
  }));
}

export function saveStoredKprPresets(presets: KprPreset[], _username?: string): void {
  memoryKprPresets = Array.isArray(presets) && presets.length > 0 ? presets : DEFAULT_KPR_PRESETS;
}

export function resetStoredKprPresets(_username?: string): KprPreset[] {
  saveStoredKprPresets(DEFAULT_KPR_PRESETS);
  return DEFAULT_KPR_PRESETS;
}

export function getStoredKprCoaMapping(_username?: string): KprCoaMappingConfig {
  return {
    ...DEFAULT_KPR_COA_MAPPING,
    ...memoryKprCoaMapping,
  };
}

export function saveStoredKprCoaMapping(mapping: KprCoaMappingConfig, _username?: string): void {
  memoryKprCoaMapping = {
    ...DEFAULT_KPR_COA_MAPPING,
    ...(mapping || {}),
  };
}

export function resetStoredKprCoaMapping(_username?: string): KprCoaMappingConfig {
  saveStoredKprCoaMapping(DEFAULT_KPR_COA_MAPPING);
  return DEFAULT_KPR_COA_MAPPING;
}

export function resolveEffectiveKprCoaMapping(
  baseMapping: KprCoaMappingConfig = DEFAULT_KPR_COA_MAPPING,
  presetOrSnapshot?: Partial<Pick<KprPreset, 'coaMappingOverrides'>> | Partial<KprCoaMappingConfig>
): KprCoaMappingConfig {
  if (!presetOrSnapshot) return baseMapping;
  const overrides =
    'coaMappingOverrides' in presetOrSnapshot
      ? presetOrSnapshot.coaMappingOverrides
      : (presetOrSnapshot as Partial<KprCoaMappingConfig>);
  if (!overrides) return baseMapping;

  const overrideAccruedInterest =
    'accruedInterestCode' in overrides && typeof overrides.accruedInterestCode === 'string'
      ? overrides.accruedInterestCode
      : undefined;

  return {
    propertyAssetCode: overrides.propertyAssetCode || baseMapping.propertyAssetCode,
    principalLiabilityCode: overrides.principalLiabilityCode || baseMapping.principalLiabilityCode,
    interestExpenseCode: overrides.interestExpenseCode || baseMapping.interestExpenseCode,
    accruedInterestCode: overrideAccruedInterest || baseMapping.accruedInterestCode,
    provisiAdminLegalCode: overrides.provisiAdminLegalCode || baseMapping.provisiAdminLegalCode,
    taxInsuranceCode: overrides.taxInsuranceCode || baseMapping.taxInsuranceCode,
    disbursementIncomeCategory: baseMapping.disbursementIncomeCategory,
    principalPaymentCategory: baseMapping.principalPaymentCategory,
    interestExpenseCategory: baseMapping.interestExpenseCategory,
  };
}

export function resolveTransactionCoaCodes(
  tx: Pick<Transaction, 'type' | 'category' | 'accountId' | 'coaDebitCode' | 'coaCreditCode' | 'isAdjustment'>,
  accounts: Account[],
  coaList: AccountCOA[],
  kprCoaMapping: KprCoaMappingConfig = DEFAULT_KPR_COA_MAPPING
): {
  debitCode: string;
  debitName: string;
  creditCode: string;
  creditName: string;
  isKprRelated: boolean;
} {
  const coaName = (code: string) => coaList.find((c) => c.code === code)?.name || `COA ${code}`;

  if (tx.coaDebitCode && tx.coaCreditCode) {
    return {
      debitCode: tx.coaDebitCode,
      debitName: coaName(tx.coaDebitCode),
      creditCode: tx.coaCreditCode,
      creditName: coaName(tx.coaCreditCode),
      isKprRelated:
        tx.coaDebitCode === kprCoaMapping.propertyAssetCode ||
        tx.coaDebitCode === kprCoaMapping.principalLiabilityCode ||
        tx.coaDebitCode === kprCoaMapping.interestExpenseCode ||
        tx.coaDebitCode === kprCoaMapping.provisiAdminLegalCode ||
        tx.coaDebitCode === kprCoaMapping.taxInsuranceCode ||
        tx.coaCreditCode === kprCoaMapping.principalLiabilityCode,
    };
  }

  const acc = accounts.find((a) => a.id === tx.accountId);
  const accCoa = acc ? getAccountCoaMapping(acc, coaList) : { code: '1200', name: coaName('1200') };
  const catLower = (tx.category || '').trim().toLowerCase();

  if (catLower === kprCoaMapping.disbursementIncomeCategory.toLowerCase() || catLower === 'pencairan kpr') {
    if (tx.type === 'income') {
      return {
        debitCode: accCoa.code,
        debitName: accCoa.name,
        creditCode: kprCoaMapping.principalLiabilityCode,
        creditName: coaName(kprCoaMapping.principalLiabilityCode),
        isKprRelated: true,
      };
    }
    return {
      debitCode: kprCoaMapping.propertyAssetCode,
      debitName: coaName(kprCoaMapping.propertyAssetCode),
      creditCode: accCoa.code,
      creditName: accCoa.name,
      isKprRelated: true,
    };
  }

  if (catLower === kprCoaMapping.principalPaymentCategory.toLowerCase() || catLower === 'cicilan kpr') {
    return {
      debitCode: kprCoaMapping.principalLiabilityCode,
      debitName: coaName(kprCoaMapping.principalLiabilityCode),
      creditCode: accCoa.code,
      creditName: accCoa.name,
      isKprRelated: true,
    };
  }

  if (catLower === kprCoaMapping.interestExpenseCategory.toLowerCase() || catLower === 'beban bunga kpr') {
    return {
      debitCode: kprCoaMapping.interestExpenseCode,
      debitName: coaName(kprCoaMapping.interestExpenseCode),
      creditCode: accCoa.code,
      creditName: accCoa.name,
      isKprRelated: true,
    };
  }

  if (catLower === 'biaya provisi & admin kpr' || catLower === 'biaya notaris & ajb') {
    return {
      debitCode: kprCoaMapping.provisiAdminLegalCode,
      debitName: coaName(kprCoaMapping.provisiAdminLegalCode),
      creditCode: accCoa.code,
      creditName: accCoa.name,
      isKprRelated: true,
    };
  }

  if (catLower === 'pajak properti (bphtb & pbb)' || catLower === 'asuransi kpr & properti') {
    return {
      debitCode: kprCoaMapping.taxInsuranceCode,
      debitName: coaName(kprCoaMapping.taxInsuranceCode),
      creditCode: accCoa.code,
      creditName: accCoa.name,
      isKprRelated: true,
    };
  }

  if (catLower === 'uang muka (dp) kpr') {
    return {
      debitCode: kprCoaMapping.propertyAssetCode,
      debitName: coaName(kprCoaMapping.propertyAssetCode),
      creditCode: accCoa.code,
      creditName: accCoa.name,
      isKprRelated: true,
    };
  }

  if (tx.type === 'income') {
    return {
      debitCode: accCoa.code,
      debitName: accCoa.name,
      creditCode: '4400',
      creditName: coaName('4400'),
      isKprRelated: false,
    };
  }

  return {
    debitCode: '5900',
    debitName: coaName('5900'),
    creditCode: accCoa.code,
    creditName: accCoa.name,
    isKprRelated: false,
  };
}
