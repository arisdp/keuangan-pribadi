import React, { useEffect, useMemo, useState } from 'react';
import { KprCoaMappingConfig, KprPreset } from '../types';
import { AccountCOA } from '../coaUtils';
import { CategoryNode, flattenCategoryHierarchy } from '../categoryHierarchy';
import {
  DEFAULT_KPR_COA_MAPPING,
  calculateKprClosingCosts,
  resolveEffectiveKprCoaMapping,
} from '../utils/kprPresets';
import { formatterIDR } from '../utils/formatters';
import { showToast } from '../utils/toast';
import {
  AlertTriangle,
  BookOpenCheck,
  CheckCircle2,
  Home,
  Layers,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Trash2,
  X,
} from 'lucide-react';

interface MasterKprPresetsPanelProps {
  presets: KprPreset[];
  coaList: AccountCOA[];
  categories: CategoryNode[];
  kprCoaMapping?: KprCoaMappingConfig;
  onUpdatePresets: (updated: KprPreset[], logDetail?: string) => void;
  onResetPresets: () => void;
  onUpdateKprCoaMapping?: (updated: KprCoaMappingConfig) => void;
  onResetKprCoaMapping?: () => void;
  onSyncKprMasterData?: () => void;
}

const REQUIRED_KPR_CATEGORIES = [
  'Pencairan KPR',
  'Cicilan KPR',
  'Beban Bunga KPR',
  'Biaya Provisi & Admin KPR',
  'Biaya Notaris & AJB',
  'Pajak Properti (BPHTB & PBB)',
  'Asuransi KPR & Properti',
  'Uang Muka (DP) KPR',
];

const EMPTY_FORM: Omit<KprPreset, 'id'> = {
  name: '',
  description: '',
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
  coaMappingOverrides: {},
};

export const MasterKprPresetsPanel: React.FC<MasterKprPresetsPanelProps> = ({
  presets,
  coaList,
  categories,
  kprCoaMapping = DEFAULT_KPR_COA_MAPPING,
  onUpdatePresets,
  onResetPresets,
  onUpdateKprCoaMapping,
  onResetKprCoaMapping,
  onSyncKprMasterData,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [formState, setFormState] = useState<Omit<KprPreset, 'id'>>(EMPTY_FORM);
  const [draftCoaMapping, setDraftCoaMapping] = useState<KprCoaMappingConfig>(kprCoaMapping);
  const [previewPresetId, setPreviewPresetId] = useState<string>(presets[0]?.id || '');
  const [samplePropertyPrice, setSamplePropertyPrice] = useState<number>(600000000);
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => void;
  } | null>(null);

  useEffect(() => {
    setDraftCoaMapping(kprCoaMapping);
  }, [kprCoaMapping]);

  useEffect(() => {
    if (presets.length > 0 && !presets.some((p) => p.id === previewPresetId)) {
      setPreviewPresetId(presets[0].id);
    }
  }, [presets, previewPresetId]);

  const flatCategoryList = useMemo(() => {
    return flattenCategoryHierarchy(categories);
  }, [categories]);

  const flatCategoryNames = useMemo(() => {
    return new Set(flatCategoryList.map((f) => f.name.toLowerCase().trim()));
  }, [flatCategoryList]);

  const requiredCoaCodes = useMemo(() => {
    return Array.from(
      new Set([
        '1600',
        '2310',
        '2390',
        '5810',
        '5820',
        '5830',
        draftCoaMapping.propertyAssetCode,
        draftCoaMapping.principalLiabilityCode,
        draftCoaMapping.interestExpenseCode,
        draftCoaMapping.accruedInterestCode,
        draftCoaMapping.provisiAdminLegalCode,
        draftCoaMapping.taxInsuranceCode,
      ])
    );
  }, [draftCoaMapping]);

  const kprCoaStatuses = useMemo(() => {
    const codeMap = new Map(coaList.map((c) => [c.code, c]));
    return requiredCoaCodes.map((code) => ({
      code,
      coa: codeMap.get(code),
      exists: codeMap.has(code),
    }));
  }, [coaList, requiredCoaCodes]);

  const kprCategoryStatuses = useMemo(() => {
    return REQUIRED_KPR_CATEGORIES.map((name) => ({
      name,
      exists: flatCategoryNames.has(name.toLowerCase().trim()),
    }));
  }, [flatCategoryNames]);

  const missingCoaCount = kprCoaStatuses.filter((s) => !s.exists).length;
  const missingCategoryCount = kprCategoryStatuses.filter((s) => !s.exists).length;

  const isCoaMappingDirty = useMemo(() => {
    return JSON.stringify(draftCoaMapping) !== JSON.stringify(kprCoaMapping);
  }, [draftCoaMapping, kprCoaMapping]);

  const sortedCoas = useMemo(() => {
    return [...coaList].sort((a, b) => a.code.localeCompare(b.code));
  }, [coaList]);

  const coaNameByCode = (code: string) => {
    return coaList.find((c) => c.code === code)?.name || `COA ${code}`;
  };

  const selectedPreviewPreset = useMemo(() => {
    return presets.find((p) => p.id === previewPresetId) || presets[0];
  }, [presets, previewPresetId]);

  // Live double-entry journal preview for chosen preset + draft COA mapping
  const journalSimulation = useMemo(() => {
    const preset = selectedPreviewPreset || EMPTY_FORM;
    const price = Math.max(0, samplePropertyPrice || 600000000);
    const dp = Math.round(price * ((preset.dpPercent || 0) / 100));
    const principal = Math.max(0, price - dp);
    const fees = calculateKprClosingCosts(price, principal, preset);
    const effectiveCoa = resolveEffectiveKprCoaMapping(draftCoaMapping, preset);

    const activeRate = preset.scheme === 'tiered' ? preset.fixedRate : preset.annualRate;
    const monthlyRate = activeRate > 0 ? activeRate / 100 / 12 : 0;
    const months = Math.max(1, (preset.tenorYears || 15) * 12);
    let month1Payment = 0;
    let month1Interest = 0;
    let month1Principal = 0;

    if (principal > 0) {
      if (preset.scheme === 'flat') {
        month1Principal = Math.round(principal / months);
        month1Interest = Math.round(principal * monthlyRate);
        month1Payment = month1Principal + month1Interest;
      } else if (monthlyRate > 0) {
        const factor = Math.pow(1 + monthlyRate, months);
        month1Payment = Math.round((principal * (monthlyRate * factor)) / (factor - 1));
        month1Interest = Math.round(principal * monthlyRate);
        month1Principal = Math.max(0, month1Payment - month1Interest);
      } else {
        month1Principal = Math.round(principal / months);
        month1Payment = month1Principal;
      }
    }

    const totalProvisiLegal = fees.provisiFee + fees.adminFee + fees.appraisalFee + fees.notaryAjbFee;
    const totalTaxInsurance = fees.bphtbTax + fees.insuranceFee;
    const estimatedMonthlyAccrual = Math.round(principal * ((activeRate || 0) / 100) * (30 / 365));

    return {
      price,
      dp,
      principal,
      fees,
      effectiveCoa,
      lines: [
        {
          event: '1. Pembayaran Uang Muka (DP Properti)',
          category: 'Uang Muka (DP) KPR',
          debitCode: effectiveCoa.propertyAssetCode,
          debitName: coaNameByCode(effectiveCoa.propertyAssetCode),
          creditCode: '1200',
          creditName: coaNameByCode('1200'),
          amount: dp,
        },
        {
          event: '2. Pencairan Plafon Pokok Utang KPR',
          category: effectiveCoa.disbursementIncomeCategory,
          debitCode: effectiveCoa.propertyAssetCode,
          debitName: coaNameByCode(effectiveCoa.propertyAssetCode),
          creditCode: effectiveCoa.principalLiabilityCode,
          creditName: coaNameByCode(effectiveCoa.principalLiabilityCode),
          amount: principal,
        },
        {
          event: '3. Biaya Provisi, Admin, Appraisal & Legal/AJB',
          category: 'Biaya Provisi & Admin KPR',
          debitCode: effectiveCoa.provisiAdminLegalCode,
          debitName: coaNameByCode(effectiveCoa.provisiAdminLegalCode),
          creditCode: '1200',
          creditName: coaNameByCode('1200'),
          amount: totalProvisiLegal,
        },
        {
          event: '4. Pajak BPHTB & Premi Asuransi Properti',
          category: 'Pajak Properti (BPHTB & PBB)',
          debitCode: effectiveCoa.taxInsuranceCode,
          debitName: coaNameByCode(effectiveCoa.taxInsuranceCode),
          creditCode: '1200',
          creditName: coaNameByCode('1200'),
          amount: totalTaxInsurance,
        },
        {
          event: '5a. Cicilan Pokok KPR Bulan ke-1 (Mengurangi Utang)',
          category: effectiveCoa.principalPaymentCategory,
          debitCode: effectiveCoa.principalLiabilityCode,
          debitName: coaNameByCode(effectiveCoa.principalLiabilityCode),
          creditCode: '1200',
          creditName: coaNameByCode('1200'),
          amount: month1Principal,
        },
        {
          event: '5b. Porsi Beban Bunga KPR Bulan ke-1 (Laba Rugi)',
          category: effectiveCoa.interestExpenseCategory,
          debitCode: effectiveCoa.interestExpenseCode,
          debitName: coaNameByCode(effectiveCoa.interestExpenseCode),
          creditCode: '1200',
          creditName: coaNameByCode('1200'),
          amount: month1Interest,
        },
        {
          event: '6. Jurnal Penyesuaian Akrual Bunga (Non-Kas 30 Hari)',
          category: 'Akrual Bunga Utang',
          debitCode: effectiveCoa.interestExpenseCode,
          debitName: coaNameByCode(effectiveCoa.interestExpenseCode),
          creditCode: effectiveCoa.accruedInterestCode,
          creditName: coaNameByCode(effectiveCoa.accruedInterestCode),
          amount: estimatedMonthlyAccrual,
        },
      ],
    };
  }, [selectedPreviewPreset, samplePropertyPrice, draftCoaMapping, coaList]);

  const openCreateForm = () => {
    setEditingId(null);
    setFormState(EMPTY_FORM);
    setIsFormOpen(true);
  };

  const openEditForm = (preset: KprPreset) => {
    setEditingId(preset.id);
    setFormState({
      name: preset.name,
      description: preset.description,
      scheme: preset.scheme,
      tenorYears: preset.tenorYears,
      dpPercent: preset.dpPercent,
      annualRate: preset.annualRate,
      fixedRate: preset.fixedRate,
      fixedYears: preset.fixedYears,
      floatingRate: preset.floatingRate,
      floatingCapRate: preset.floatingCapRate ?? Math.max(preset.floatingRate || 0, 13.5),
      earlyRepaymentPenaltyPct: preset.earlyRepaymentPenaltyPct ?? (preset.scheme === 'tiered' ? 2.0 : 0),
      provisiPct: preset.provisiPct,
      adminFee: preset.adminFee,
      appraisalFee: preset.appraisalFee ?? 500000,
      notaryAjbPct: preset.notaryAjbPct,
      bphtbPct: preset.bphtbPct,
      insurancePct: preset.insurancePct,
      coaMappingOverrides: preset.coaMappingOverrides ? { ...preset.coaMappingOverrides } : {},
      isDefault: preset.isDefault,
    });
    setIsFormOpen(true);
  };

  const handleSavePreset = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = formState.name.trim();
    if (!cleanName) {
      showToast({
        type: 'warning',
        title: 'Nama Preset Wajib Diisi',
        message: 'Masukkan nama preset skema KPR terlebih dahulu.',
      });
      return;
    }

    const cleanOverrides: KprPreset['coaMappingOverrides'] = {};
    if (formState.coaMappingOverrides?.propertyAssetCode) {
      cleanOverrides.propertyAssetCode = formState.coaMappingOverrides.propertyAssetCode;
    }
    if (formState.coaMappingOverrides?.principalLiabilityCode) {
      cleanOverrides.principalLiabilityCode = formState.coaMappingOverrides.principalLiabilityCode;
    }
    if (formState.coaMappingOverrides?.interestExpenseCode) {
      cleanOverrides.interestExpenseCode = formState.coaMappingOverrides.interestExpenseCode;
    }
    if (formState.coaMappingOverrides?.provisiAdminLegalCode) {
      cleanOverrides.provisiAdminLegalCode = formState.coaMappingOverrides.provisiAdminLegalCode;
    }
    if (formState.coaMappingOverrides?.taxInsuranceCode) {
      cleanOverrides.taxInsuranceCode = formState.coaMappingOverrides.taxInsuranceCode;
    }

    const sanitized: Omit<KprPreset, 'id'> = {
      ...formState,
      name: cleanName,
      description: formState.description.trim() || 'Preset skema & biaya KPR kustom',
      tenorYears: Math.max(1, Math.min(35, Math.round(formState.tenorYears || 15))),
      dpPercent: Math.max(0, Math.min(90, Number(formState.dpPercent) || 0)),
      annualRate: Math.max(0, Math.min(40, Number(formState.annualRate) || 0)),
      fixedRate: Math.max(0, Math.min(40, Number(formState.fixedRate) || 0)),
      fixedYears: Math.max(1, Math.min(35, Math.round(formState.fixedYears || 1))),
      floatingRate: Math.max(0, Math.min(40, Number(formState.floatingRate) || 0)),
      floatingCapRate: Math.max(0, Math.min(45, Number(formState.floatingCapRate) || 0)),
      earlyRepaymentPenaltyPct: Math.max(0, Math.min(10, Number(formState.earlyRepaymentPenaltyPct) || 0)),
      provisiPct: Math.max(0, Math.min(10, Number(formState.provisiPct) || 0)),
      adminFee: Math.max(0, Math.round(Number(formState.adminFee) || 0)),
      appraisalFee: Math.max(0, Math.round(Number(formState.appraisalFee) || 0)),
      notaryAjbPct: Math.max(0, Math.min(10, Number(formState.notaryAjbPct) || 0)),
      bphtbPct: Math.max(0, Math.min(10, Number(formState.bphtbPct) || 0)),
      insurancePct: Math.max(0, Math.min(10, Number(formState.insurancePct) || 0)),
      coaMappingOverrides: Object.keys(cleanOverrides).length > 0 ? cleanOverrides : undefined,
    };

    if (editingId) {
      const updated = presets.map((p) => (p.id === editingId ? { ...sanitized, id: editingId } : p));
      onUpdatePresets(updated, `Pembaruan preset skema & biaya KPR: ${cleanName}`);
      showToast({
        type: 'success',
        title: 'Preset KPR Diperbarui',
        message: `Preset "${cleanName}" beserta suku bunga, biaya awal, dan pemetaan COA-nya berhasil diperbarui.`,
      });
    } else {
      const newPreset: KprPreset = {
        ...sanitized,
        id: `kpr-preset-${Date.now()}`,
        isDefault: false,
      };
      onUpdatePresets([newPreset, ...presets], `Penambahan preset skema & biaya KPR baru: ${cleanName}`);
      showToast({
        type: 'success',
        title: 'Preset KPR Ditambahkan',
        message: `Preset "${cleanName}" berhasil ditambahkan ke Master Data KPR dan sinkron ke Kalkulator KPR.`,
      });
    }

    setIsFormOpen(false);
    setEditingId(null);
  };

  const handleSaveCoaMapping = () => {
    onUpdateKprCoaMapping?.(draftCoaMapping);
    showToast({
      type: 'success',
      title: 'Pemetaan COA KPR Disimpan',
      message: 'Konfigurasi kode COA & kategori jurnal KPR telah disimpan dan aktif di seluruh modul transaksi & akrual.',
    });
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* SECTION 1: STATUS KELENGKAPAN MASTER COA & KATEGORI KPR */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-blue-600 text-white shrink-0">
              <Home className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100">
                Konfigurasi Master Data KPR, Suku Bunga & Pemetaan COA
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                Kelola pemetaan akun Chart of Accounts (COA) khusus KPR, paket suku bunga, komponen biaya akad awal, serta simulasi jurnal double-entry.
              </p>
            </div>
          </div>

          {onSyncKprMasterData && (
            <button
              type="button"
              onClick={() => {
                onSyncKprMasterData();
                showToast({
                  type: 'success',
                  title: 'Master Data KPR Disinkronkan',
                  message: 'Kode COA KPR dan kategori transaksi KPR telah dipastikan lengkap.',
                });
              }}
              className="px-3.5 py-2 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 text-blue-700 dark:text-blue-300 text-xs font-extrabold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>
                {missingCoaCount + missingCategoryCount > 0
                  ? `Lengkapi COA & Kategori KPR (${missingCoaCount + missingCategoryCount})`
                  : 'Verifikasi COA & Kategori KPR'}
              </span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* COA KPR Status */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3 bg-slate-50/50 dark:bg-slate-800/30">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-blue-600" />
                Kode COA KPR Aktif
              </h4>
              <span className="text-[11px] font-mono tabular-nums font-bold text-slate-500">
                {kprCoaStatuses.filter((s) => s.exists).length}/{requiredCoaCodes.length} Aktif
              </span>
            </div>
            <div className="divide-y divide-slate-200/70 dark:divide-slate-700/60">
              {kprCoaStatuses.map((item) => (
                <div key={item.code} className="py-2 flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0 flex items-center gap-2">
                    <span className="font-mono font-bold text-slate-900 dark:text-slate-100 shrink-0">
                      {item.code}
                    </span>
                    <span className="text-slate-300 dark:text-slate-600">·</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200 truncate">
                      {item.coa?.name || 'Belum Terdaftar'}
                    </span>
                  </div>
                  <span
                    className={`text-[11px] font-bold shrink-0 ${
                      item.exists ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {item.exists ? 'Terdaftar' : 'Hilang'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Kategori KPR Status */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3 bg-slate-50/50 dark:bg-slate-800/30">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                Kategori Transaksi KPR
              </h4>
              <span className="text-[11px] font-mono tabular-nums font-bold text-slate-500">
                {kprCategoryStatuses.filter((s) => s.exists).length}/{REQUIRED_KPR_CATEGORIES.length} Aktif
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {kprCategoryStatuses.map((cat) => (
                <div
                  key={cat.name}
                  className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-between gap-2 text-xs"
                >
                  <span className="font-semibold text-slate-700 dark:text-slate-200 truncate">
                    {cat.name}
                  </span>
                  <span
                    className={`text-[10px] font-bold shrink-0 ${
                      cat.exists ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {cat.exists ? 'Aktif' : 'Hilang'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2: MATRIKS PEMETAAN KODE COA KPR & SIMULASI JURNAL */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-start gap-2.5">
            <BookOpenCheck className="h-5 w-5 text-indigo-600 mt-0.5 shrink-0" />
            <div>
              <h4 className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
                Pemetaan Kode COA & Kategori Jurnal KPR
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Menentukan kode perkiraan Debit/Kredit otomatis saat pencairan KPR, pembayaran biaya akad, cicilan pokok/bunga, dan jurnal penyesuaian akrual.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onResetKprCoaMapping && (
              <button
                type="button"
                onClick={() =>
                  setConfirmAction({
                    title: 'Reset Pemetaan COA KPR ke Standar?',
                    message: 'Kode COA KPR akan dikembalikan ke konfigurasi standar (1600, 2310, 2390, 5810, 5820, 5830).',
                    confirmLabel: 'Ya, Reset Pemetaan',
                    onConfirm: () => {
                      onResetKprCoaMapping();
                      setConfirmAction(null);
                      showToast({
                        type: 'success',
                        title: 'Pemetaan COA KPR Direset',
                        message: 'Pemetaan kode COA KPR dikembalikan ke standar default.',
                      });
                    },
                  })
                }
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Reset COA</span>
              </button>
            )}
            {onUpdateKprCoaMapping && (
              <button
                type="button"
                onClick={handleSaveCoaMapping}
                disabled={!isCoaMappingDirty}
                className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-1.5 whitespace-nowrap ${
                  isCoaMappingDirty
                    ? 'bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                }`}
              >
                <Save className="h-3.5 w-3.5" />
                <span>Simpan Pemetaan COA</span>
              </button>
            )}
          </div>
        </div>

        {/* COA Mapping Dropdown Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
          <div className="space-y-1">
            <label className="font-bold text-slate-700 dark:text-slate-200 block">
              COA Aset Properti &amp; DP (Debet)
            </label>
            <select
              value={draftCoaMapping.propertyAssetCode}
              onChange={(e) => setDraftCoaMapping({ ...draftCoaMapping, propertyAssetCode: e.target.value })}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold text-slate-800 dark:text-slate-100"
            >
              {sortedCoas.map((c) => (
                <option key={c.code} value={c.code}>
                  [{c.code}] {c.name} ({c.category})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="font-bold text-slate-700 dark:text-slate-200 block">
              COA Utang Pokok KPR (Kredit / Pelunasan Debet)
            </label>
            <select
              value={draftCoaMapping.principalLiabilityCode}
              onChange={(e) => setDraftCoaMapping({ ...draftCoaMapping, principalLiabilityCode: e.target.value })}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold text-slate-800 dark:text-slate-100"
            >
              {sortedCoas.map((c) => (
                <option key={c.code} value={c.code}>
                  [{c.code}] {c.name} ({c.category})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="font-bold text-slate-700 dark:text-slate-200 block">
              COA Beban Bunga KPR &amp; Akrual (Debet)
            </label>
            <select
              value={draftCoaMapping.interestExpenseCode}
              onChange={(e) => setDraftCoaMapping({ ...draftCoaMapping, interestExpenseCode: e.target.value })}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold text-slate-800 dark:text-slate-100"
            >
              {sortedCoas.map((c) => (
                <option key={c.code} value={c.code}>
                  [{c.code}] {c.name} ({c.category})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="font-bold text-slate-700 dark:text-slate-200 block">
              COA Utang Bunga Akrual (Kredit Penyesuaian)
            </label>
            <select
              value={draftCoaMapping.accruedInterestCode}
              onChange={(e) => setDraftCoaMapping({ ...draftCoaMapping, accruedInterestCode: e.target.value })}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold text-slate-800 dark:text-slate-100"
            >
              {sortedCoas.map((c) => (
                <option key={c.code} value={c.code}>
                  [{c.code}] {c.name} ({c.category})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="font-bold text-slate-700 dark:text-slate-200 block">
              COA Biaya Provisi, Admin, Appraisal &amp; Notaris
            </label>
            <select
              value={draftCoaMapping.provisiAdminLegalCode}
              onChange={(e) => setDraftCoaMapping({ ...draftCoaMapping, provisiAdminLegalCode: e.target.value })}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold text-slate-800 dark:text-slate-100"
            >
              {sortedCoas.map((c) => (
                <option key={c.code} value={c.code}>
                  [{c.code}] {c.name} ({c.category})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="font-bold text-slate-700 dark:text-slate-200 block">
              COA Pajak Properti (BPHTB) &amp; Asuransi KPR
            </label>
            <select
              value={draftCoaMapping.taxInsuranceCode}
              onChange={(e) => setDraftCoaMapping({ ...draftCoaMapping, taxInsuranceCode: e.target.value })}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold text-slate-800 dark:text-slate-100"
            >
              {sortedCoas.map((c) => (
                <option key={c.code} value={c.code}>
                  [{c.code}] {c.name} ({c.category})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Category Bindings Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
          <div className="space-y-1">
            <label className="font-bold text-slate-600 dark:text-slate-300 block">
              Kategori Pencairan KPR
            </label>
            <select
              value={draftCoaMapping.disbursementIncomeCategory}
              onChange={(e) =>
                setDraftCoaMapping({ ...draftCoaMapping, disbursementIncomeCategory: e.target.value })
              }
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold text-slate-800 dark:text-slate-100"
            >
              <option value="Pencairan KPR">Pencairan KPR</option>
              {flatCategoryList
                .filter((c) => c.name !== 'Pencairan KPR')
                .map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="font-bold text-slate-600 dark:text-slate-300 block">
              Kategori Angsuran Pokok KPR
            </label>
            <select
              value={draftCoaMapping.principalPaymentCategory}
              onChange={(e) =>
                setDraftCoaMapping({ ...draftCoaMapping, principalPaymentCategory: e.target.value })
              }
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold text-slate-800 dark:text-slate-100"
            >
              <option value="Cicilan KPR">Cicilan KPR</option>
              {flatCategoryList
                .filter((c) => c.name !== 'Cicilan KPR')
                .map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="font-bold text-slate-600 dark:text-slate-300 block">
              Kategori Beban Bunga KPR
            </label>
            <select
              value={draftCoaMapping.interestExpenseCategory}
              onChange={(e) =>
                setDraftCoaMapping({ ...draftCoaMapping, interestExpenseCategory: e.target.value })
              }
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold text-slate-800 dark:text-slate-100"
            >
              <option value="Beban Bunga KPR">Beban Bunga KPR</option>
              {flatCategoryList
                .filter((c) => c.name !== 'Beban Bunga KPR')
                .map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
            </select>
          </div>
        </div>

        {/* Live Double-Entry Journal Simulation Preview */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div>
              <h5 className="text-xs font-extrabold uppercase tracking-wider text-slate-800 dark:text-slate-100">
                Simulasi Dampak Jurnal Akuntansi KPR (Double-Entry Preview)
              </h5>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Memeriksa keakuratan akun Debit &amp; Kredit sebelum transaksi KPR atau akrual dicatat.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <select
                value={selectedPreviewPreset?.id || ''}
                onChange={(e) => setPreviewPresetId(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold text-slate-700 dark:text-slate-200"
              >
                {presets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold text-slate-500">Harga Properti:</span>
                <input
                  type="number"
                  min={50000000}
                  step={50000000}
                  value={samplePropertyPrice}
                  onChange={(e) => setSamplePropertyPrice(Number(e.target.value) || 0)}
                  className="w-36 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono tabular-nums font-bold text-slate-800 dark:text-slate-100"
                />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/70 text-[10px] font-extrabold uppercase tracking-wider text-slate-500 border-b border-slate-200 dark:border-slate-800">
                  <th className="py-2.5 px-3">Peristiwa Jurnal KPR</th>
                  <th className="py-2.5 px-3">Kategori</th>
                  <th className="py-2.5 px-3">Akun Debit (Dr)</th>
                  <th className="py-2.5 px-3">Akun Kredit (Cr)</th>
                  <th className="py-2.5 px-3 text-right">Estimasi Nominal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {journalSimulation.lines.map((line) => (
                  <tr key={line.event} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-2.5 px-3 font-bold text-slate-800 dark:text-slate-100">
                      {line.event}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300 font-medium">
                      {line.category}
                    </td>
                    <td className="py-2.5 px-3 font-mono tabular-nums text-[11px] text-emerald-700 dark:text-emerald-400 font-bold">
                      {line.debitCode} · {line.debitName}
                    </td>
                    <td className="py-2.5 px-3 font-mono tabular-nums text-[11px] text-rose-700 dark:text-rose-400 font-bold">
                      {line.creditCode} · {line.creditName}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums font-extrabold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      {formatterIDR.format(line.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* SECTION 3: KATALOG PRESET SKEMA SUKU BUNGA & BIAYA AWAL KPR */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <h4 className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
              Katalog Preset Skema Bunga &amp; Biaya Akad Awal KPR ({presets.length})
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Setiap preset memuat tenor, DP, struktur bunga, biaya appraisal/provisi/notaris/BPHTB/asuransi, serta override COA opsional untuk Kalkulator KPR.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() =>
                setConfirmAction({
                  title: 'Reset Preset KPR ke Bawaan?',
                  message: 'Seluruh preset KPR kustom akan diganti dengan 4 paket preset standar KPR Indonesia.',
                  confirmLabel: 'Ya, Reset Preset',
                  onConfirm: () => {
                    onResetPresets();
                    setConfirmAction(null);
                    showToast({
                      type: 'success',
                      title: 'Preset KPR Direset',
                      message: 'Katalog preset skema & biaya KPR kembali ke daftar bawaan.',
                    });
                  },
                })
              }
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold transition cursor-pointer flex items-center gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Reset Bawaan</span>
            </button>
            <button
              type="button"
              onClick={openCreateForm}
              className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold transition cursor-pointer flex items-center gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Tambah Preset KPR</span>
            </button>
          </div>
        </div>

        {/* PRESETS TABLE */}
        <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/70 text-[10px] font-extrabold uppercase tracking-wider text-slate-500 border-b border-slate-200 dark:border-slate-800">
                <th className="py-2.5 px-3">Nama Preset &amp; Skema</th>
                <th className="py-2.5 px-3">Struktur Suku Bunga</th>
                <th className="py-2.5 px-3 text-right">Tenor / DP</th>
                <th className="py-2.5 px-3 text-right">Provisi / Admin / Appraisal</th>
                <th className="py-2.5 px-3 text-right">Notaris / BPHTB / Asuransi</th>
                <th className="py-2.5 px-3">Pemetaan COA</th>
                <th className="py-2.5 px-3 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {presets.map((preset) => {
                const effCoa = resolveEffectiveKprCoaMapping(draftCoaMapping, preset);
                const hasOverrides = Boolean(
                  preset.coaMappingOverrides && Object.keys(preset.coaMappingOverrides).length > 0
                );
                return (
                  <tr key={preset.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-3 min-w-[220px]">
                      <span className="font-extrabold text-slate-900 dark:text-slate-100 block">
                        {preset.name}
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2">
                        {preset.description}
                      </span>
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span className="font-bold text-blue-700 dark:text-blue-400 text-[11px]">
                        {preset.scheme === 'tiered'
                          ? 'Berjenjang'
                          : preset.scheme === 'annuity'
                          ? 'Anuitas'
                          : 'Flat'}
                      </span>
                      <p className="font-mono tabular-nums text-[11px] font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                        {preset.scheme === 'tiered'
                          ? `${preset.fixedRate}% (${preset.fixedYears}th) -> ${preset.floatingRate}%`
                          : `${preset.annualRate}% / thn`}
                      </p>
                      <span className="text-[10px] font-mono tabular-nums text-slate-500">
                        Cap {preset.floatingCapRate ?? preset.floatingRate}% · Penalti {preset.earlyRepaymentPenaltyPct ?? 0}%
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                      <span className="font-bold text-slate-800 dark:text-slate-200 block">
                        {preset.tenorYears} Tahun
                      </span>
                      <span className="text-[11px] text-slate-500">DP {preset.dpPercent}%</span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                      <span className="font-bold text-slate-800 dark:text-slate-200 block">
                        {preset.provisiPct}% · {formatterIDR.format(preset.adminFee)}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        Appraisal {formatterIDR.format(preset.appraisalFee ?? 0)}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-[11px] text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {preset.notaryAjbPct}% · {preset.bphtbPct}% · {preset.insurancePct}%
                    </td>
                    <td className="py-3 px-3 font-mono tabular-nums text-[11px] whitespace-nowrap">
                      <span className="text-slate-700 dark:text-slate-200 font-bold block">
                        Utang {effCoa.principalLiabilityCode} · Bunga {effCoa.interestExpenseCode}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {hasOverrides ? 'Override Kustom' : 'Mengikuti Master COA'}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEditForm(preset)}
                          className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-blue-50 text-slate-600 hover:text-blue-700 transition cursor-pointer"
                          title="Edit Preset"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmAction({
                              title: `Hapus Preset "${preset.name}"?`,
                              message: 'Preset yang dihapus tidak akan muncul lagi di Kalkulator KPR.',
                              confirmLabel: 'Ya, Hapus',
                              onConfirm: () => {
                                onUpdatePresets(
                                  presets.filter((p) => p.id !== preset.id),
                                  `Penghapusan preset KPR: ${preset.name}`
                                );
                                setConfirmAction(null);
                                showToast({
                                  type: 'info',
                                  title: 'Preset Dihapus',
                                  message: `Preset "${preset.name}" telah dihapus.`,
                                });
                              },
                            })
                          }
                          className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-rose-50 text-slate-600 hover:text-rose-700 transition cursor-pointer"
                          title="Hapus Preset"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ADD / EDIT PRESET MODAL */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <form
            onSubmit={handleSavePreset}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h4 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
                {editingId ? 'Edit Preset Skema, Biaya & COA KPR' : 'Tambah Preset Skema, Biaya & COA KPR'}
              </h4>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="sm:col-span-2 space-y-1">
                <label className="font-bold text-slate-600 dark:text-slate-300 block">Nama Paket Preset</label>
                <input
                  type="text"
                  required
                  value={formState.name}
                  onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                  placeholder="Misal: KPR Fix 3 Thn 5.88%"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold text-slate-800 dark:text-slate-100"
                />
              </div>

              <div className="sm:col-span-2 space-y-1">
                <label className="font-bold text-slate-600 dark:text-slate-300 block">Deskripsi Singkat</label>
                <input
                  type="text"
                  value={formState.description}
                  onChange={(e) => setFormState({ ...formState, description: e.target.value })}
                  placeholder="Keterangan program bunga dan komponen biaya awal"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-600 dark:text-slate-300 block">Skema Bunga</label>
                <select
                  value={formState.scheme}
                  onChange={(e) => setFormState({ ...formState, scheme: e.target.value as any })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold text-slate-800 dark:text-slate-100"
                >
                  <option value="tiered">Berjenjang (Fixed + Floating)</option>
                  <option value="annuity">Anuitas Efektif</option>
                  <option value="flat">Bunga Flat</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="font-bold text-slate-600 dark:text-slate-300 block">Tenor (Thn)</label>
                  <input
                    type="number"
                    min={1}
                    max={35}
                    value={formState.tenorYears}
                    onChange={(e) => setFormState({ ...formState, tenorYears: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-600 dark:text-slate-300 block">DP (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={90}
                    step={0.5}
                    value={formState.dpPercent}
                    onChange={(e) => setFormState({ ...formState, dpPercent: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold"
                  />
                </div>
              </div>

              {formState.scheme === 'tiered' ? (
                <>
                  <div className="space-y-1">
                    <label className="font-bold text-slate-600 dark:text-slate-300 block">Bunga Fixed (%/thn)</label>
                    <input
                      type="number"
                      step={0.1}
                      value={formState.fixedRate}
                      onChange={(e) => setFormState({ ...formState, fixedRate: Number(e.target.value) })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="font-bold text-slate-600 dark:text-slate-300 block">Masa Fixed (Thn)</label>
                      <input
                        type="number"
                        min={1}
                        max={35}
                        value={formState.fixedYears}
                        onChange={(e) => setFormState({ ...formState, fixedYears: Number(e.target.value) })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-slate-600 dark:text-slate-300 block">Floating (%/thn)</label>
                      <input
                        type="number"
                        step={0.1}
                        value={formState.floatingRate}
                        onChange={(e) => setFormState({ ...formState, floatingRate: Number(e.target.value) })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div className="sm:col-span-2 space-y-1">
                  <label className="font-bold text-slate-600 dark:text-slate-300 block">Suku Bunga Tahunan (%)</label>
                  <input
                    type="number"
                    step={0.1}
                    value={formState.annualRate}
                    onChange={(e) => setFormState({ ...formState, annualRate: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold"
                  />
                </div>
              )}

              <div className="space-y-1">
                <label className="font-bold text-slate-600 dark:text-slate-300 block">Batas Cap Floating (%/thn)</label>
                <input
                  type="number"
                  step={0.1}
                  value={formState.floatingCapRate ?? 13.5}
                  onChange={(e) => setFormState({ ...formState, floatingCapRate: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold"
                />
              </div>
              <div className="space-y-1">
                <label className="font-bold text-slate-600 dark:text-slate-300 block">Penalti Pelunasan Dipercepat (%)</label>
                <input
                  type="number"
                  step={0.1}
                  value={formState.earlyRepaymentPenaltyPct ?? 0}
                  onChange={(e) => setFormState({ ...formState, earlyRepaymentPenaltyPct: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold"
                />
              </div>

              <div className="sm:col-span-2 pt-2 border-t border-slate-100 dark:border-slate-800 font-extrabold text-[11px] uppercase tracking-wider text-slate-500">
                Komponen Biaya Akad Awal KPR
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-600 dark:text-slate-300 block">Provisi Bank (% Plafon)</label>
                <input
                  type="number"
                  step={0.1}
                  value={formState.provisiPct}
                  onChange={(e) => setFormState({ ...formState, provisiPct: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="font-bold text-slate-600 dark:text-slate-300 block">Biaya Admin (Rp)</label>
                  <input
                    type="number"
                    step={50000}
                    value={formState.adminFee}
                    onChange={(e) => setFormState({ ...formState, adminFee: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-600 dark:text-slate-300 block">Appraisal (Rp)</label>
                  <input
                    type="number"
                    step={50000}
                    value={formState.appraisalFee ?? 500000}
                    onChange={(e) => setFormState({ ...formState, appraisalFee: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="font-bold text-slate-600 dark:text-slate-300 block">Notaris &amp; AJB (% Harga)</label>
                <input
                  type="number"
                  step={0.1}
                  value={formState.notaryAjbPct}
                  onChange={(e) => setFormState({ ...formState, notaryAjbPct: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="font-bold text-slate-600 dark:text-slate-300 block">BPHTB (% Harga)</label>
                  <input
                    type="number"
                    step={0.1}
                    value={formState.bphtbPct}
                    onChange={(e) => setFormState({ ...formState, bphtbPct: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-600 dark:text-slate-300 block">Asuransi (% Plafon)</label>
                  <input
                    type="number"
                    step={0.1}
                    value={formState.insurancePct}
                    onChange={(e) => setFormState({ ...formState, insurancePct: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold"
                  />
                </div>
              </div>

              {/* Optional Per-Preset COA Override */}
              <div className="sm:col-span-2 pt-2 border-t border-slate-100 dark:border-slate-800 font-extrabold text-[11px] uppercase tracking-wider text-slate-500">
                Override Pemetaan COA Khusus Preset (Opsional)
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-600 dark:text-slate-300 block">COA Utang Pokok KPR</label>
                <select
                  value={formState.coaMappingOverrides?.principalLiabilityCode || ''}
                  onChange={(e) =>
                    setFormState({
                      ...formState,
                      coaMappingOverrides: {
                        ...formState.coaMappingOverrides,
                        principalLiabilityCode: e.target.value || undefined,
                      },
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold"
                >
                  <option value="">Ikuti Master COA ({draftCoaMapping.principalLiabilityCode})</option>
                  {sortedCoas.map((c) => (
                    <option key={c.code} value={c.code}>
                      [{c.code}] {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="font-bold text-slate-600 dark:text-slate-300 block">COA Beban Bunga / Margin KPR</label>
                <select
                  value={formState.coaMappingOverrides?.interestExpenseCode || ''}
                  onChange={(e) =>
                    setFormState({
                      ...formState,
                      coaMappingOverrides: {
                        ...formState.coaMappingOverrides,
                        interestExpenseCode: e.target.value || undefined,
                      },
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold"
                >
                  <option value="">Ikuti Master COA ({draftCoaMapping.interestExpenseCode})</option>
                  {sortedCoas.map((c) => (
                    <option key={c.code} value={c.code}>
                      [{c.code}] {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl text-xs font-extrabold text-white bg-blue-600 hover:bg-blue-700 cursor-pointer"
              >
                Simpan Preset KPR
              </button>
            </div>
          </form>
        </div>
      )}

      {/* IN-APP CONFIRMATION MODAL */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-amber-100 text-amber-700 shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <h4 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
                  {confirmAction.title}
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-300">{confirmAction.message}</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmAction.onConfirm}
                className="px-4 py-2 rounded-xl text-xs font-extrabold text-white bg-blue-600 hover:bg-blue-700 cursor-pointer"
              >
                {confirmAction.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
