import React, { useMemo, useState } from 'react';
import {
  Account,
  Debt,
  FixedAsset,
  FixedAssetAdjustment,
  FixedAssetCategory,
  InvestmentAsset,
} from '../types';
import {
  applyAccountBalanceChange,
  calculateAssetDepreciation,
  calculateCombinedPortfolioWealth,
  calculateFixedAssetValuation,
  getTransactionAccountDelta,
  isCreditAccount,
  syncKprDebtsToFixedAssets,
  toLocalYYYYMMDD,
} from '../utils/accountingEngine';
import { formatterIDR } from '../utils/formatters';
import { FormattedNumberInput } from './FormattedNumberInput';
import { showToast } from '../utils/toast';
import {
  Building2,
  Car,
  Edit2,
  Gem,
  Home,
  Laptop,
  Layers,
  Package,
  Plus,
  SlidersHorizontal,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
  Wrench,
  X,
  Check,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';

export interface FixedAssetCreatePayload {
  name: string;
  category: FixedAssetCategory;
  purchasePrice: number;
  acquisitionDate: string;
  annualRatePct: number;
  fundingMode: 'account_deduction' | 'direct_record';
  linkedAccountId?: string;
  notes?: string;
}

interface FixedAssetSectionProps {
  investments: InvestmentAsset[];
  fixedAssets: FixedAsset[];
  debts: Debt[];
  accounts: Account[];
  onAddFixedAsset?: (payload: FixedAssetCreatePayload) => boolean | void;
  onUpdateFixedAsset?: (id: string, updated: Partial<FixedAsset>) => void;
  onDeleteFixedAsset?: (id: string) => void;
  onAddAdjustment?: (assetId: string, adjustment: Omit<FixedAssetAdjustment, 'id'>) => void;
  onDeleteAdjustment?: (assetId: string, adjustmentId: string) => void;
  onSyncAssetDepreciation?: (assetId: string) => void;
  showCombinedBanner?: boolean;
}

const FIXED_ASSET_CATEGORIES: FixedAssetCategory[] = [
  'Properti & Tanah',
  'Kendaraan',
  'Elektronik & Perangkat',
  'Mesin & Usaha',
  'Barang Berharga & Koleksi',
  'Lainnya',
];

const RATE_PRESETS: Array<{ label: string; rate: number; category?: FixedAssetCategory }> = [
  { label: '+5%/thn Properti', rate: 5, category: 'Properti & Tanah' },
  { label: '-10%/thn Kendaraan', rate: -10, category: 'Kendaraan' },
  { label: '-20%/thn Elektronik', rate: -20, category: 'Elektronik & Perangkat' },
  { label: '0%/thn Tetap', rate: 0 },
];

const DEFAULT_RATE_BY_CATEGORY: Record<FixedAssetCategory, number> = {
  'Properti & Tanah': 5,
  Kendaraan: -10,
  'Elektronik & Perangkat': -20,
  'Mesin & Usaha': -10,
  'Barang Berharga & Koleksi': 3,
  Lainnya: 0,
};

const getCategoryIcon = (cat: FixedAssetCategory) => {
  switch (cat) {
    case 'Properti & Tanah':
      return Home;
    case 'Kendaraan':
      return Car;
    case 'Elektronik & Perangkat':
      return Laptop;
    case 'Mesin & Usaha':
      return Wrench;
    case 'Barang Berharga & Koleksi':
      return Gem;
    default:
      return Package;
  }
};

export const FixedAssetSection: React.FC<FixedAssetSectionProps> = ({
  investments = [],
  fixedAssets = [],
  debts = [],
  accounts = [],
  onAddFixedAsset,
  onUpdateFixedAsset,
  onDeleteFixedAsset,
  onAddAdjustment,
  onDeleteAdjustment,
  onSyncAssetDepreciation,
  showCombinedBanner = true,
}) => {
  const todayStr = toLocalYYYYMMDD();

  const syncedFixedAssets = useMemo(
    () => syncKprDebtsToFixedAssets(fixedAssets, debts, todayStr),
    [fixedAssets, debts, todayStr]
  );

  const combinedWealth = useMemo(
    () => calculateCombinedPortfolioWealth(investments, syncedFixedAssets, debts, todayStr),
    [investments, syncedFixedAssets, debts, todayStr]
  );

  const [filterMode, setFilterMode] = useState<'all' | 'kpr' | 'direct'>('all');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Modal 1: Add Fixed Asset
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [addCategory, setAddCategory] = useState<FixedAssetCategory>('Kendaraan');
  const [addPrice, setAddPrice] = useState<number>(0);
  const [addDate, setAddDate] = useState<string>(todayStr);
  const [addRatePct, setAddRatePct] = useState<number>(-10);
  const [addFundingMode, setAddFundingMode] = useState<'account_deduction' | 'direct_record'>(
    'account_deduction'
  );
  const [addAccountId, setAddAccountId] = useState<string>('');
  const [addNotes, setAddNotes] = useState<string>('');

  // Modal 2: Edit Fixed Asset
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState<FixedAssetCategory>('Lainnya');
  const [editPrice, setEditPrice] = useState<number>(0);
  const [editDate, setEditDate] = useState<string>(todayStr);
  const [editRatePct, setEditRatePct] = useState<number>(0);
  const [editNotes, setEditNotes] = useState<string>('');

  // Modal 3: Revaluation & Rate Adjustment
  const [revalAssetId, setRevalAssetId] = useState<string | null>(null);
  const [revalRateInput, setRevalRateInput] = useState<number>(0);
  const [revalResetEffectiveToday, setRevalResetEffectiveToday] = useState<boolean>(false);
  const [adjType, setAdjType] = useState<'appreciation' | 'depreciation'>('appreciation');
  const [adjAmount, setAdjAmount] = useState<number>(0);
  const [adjDate, setAdjDate] = useState<string>(todayStr);
  const [adjNote, setAdjNote] = useState<string>('');

  const filteredAssets = useMemo(() => {
    return syncedFixedAssets.filter((asset) => {
      if (filterMode === 'kpr') return Boolean(asset.isKprLinked);
      if (filterMode === 'direct') return !asset.isKprLinked;
      return true;
    });
  }, [syncedFixedAssets, filterMode]);

  const openAddModal = () => {
    const defaultAcc =
      accounts.find((a) => !isCreditAccount(a) && a.currentBalance > 0) || accounts[0];
    setAddName('');
    setAddCategory('Kendaraan');
    setAddPrice(0);
    setAddDate(todayStr);
    setAddRatePct(DEFAULT_RATE_BY_CATEGORY['Kendaraan']);
    setAddFundingMode(accounts.length > 0 ? 'account_deduction' : 'direct_record');
    setAddAccountId(defaultAcc?.id || '');
    setAddNotes('');
    setIsAddModalOpen(true);
  };

  const handleSelectAddCategory = (cat: FixedAssetCategory) => {
    setAddCategory(cat);
    setAddRatePct(DEFAULT_RATE_BY_CATEGORY[cat]);
  };

  const selectedFundingAccount = useMemo(
    () => accounts.find((a) => a.id === addAccountId),
    [accounts, addAccountId]
  );

  const isLiquidInsufficient = useMemo(() => {
    if (addFundingMode !== 'account_deduction' || !selectedFundingAccount) return false;
    if (isCreditAccount(selectedFundingAccount)) return false;
    return addPrice > selectedFundingAccount.currentBalance;
  }, [addFundingMode, selectedFundingAccount, addPrice]);

  const projectedAccountBalance = useMemo(() => {
    if (addFundingMode !== 'account_deduction' || !selectedFundingAccount) return 0;
    return applyAccountBalanceChange(
      selectedFundingAccount,
      getTransactionAccountDelta({ type: 'expense', amount: addPrice || 0 })
    ).currentBalance;
  }, [addFundingMode, selectedFundingAccount, addPrice]);

  const handleSubmitAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addName.trim() || addPrice <= 0) {
      showToast({
        type: 'warning',
        title: 'Data Aset Belum Lengkap',
        message: 'Masukkan nama aset tetap dan harga perolehan lebih dari Rp 0.',
      });
      return;
    }

    if (addFundingMode === 'account_deduction') {
      if (!addAccountId || !selectedFundingAccount) {
        showToast({
          type: 'warning',
          title: 'Pilih Rekening Sumber',
          message: 'Pilih rekening pembayar atau ubah mode ke Catat Aset Langsung.',
        });
        return;
      }
      if (isLiquidInsufficient) {
        showToast({
          type: 'error',
          title: 'Saldo Rekening Tidak Mencukupi',
          message: `Saldo ${selectedFundingAccount.name} tidak mencukupi untuk pembelian senilai ${formatterIDR.format(addPrice)}.`,
        });
        return;
      }
    }

    const ok = onAddFixedAsset?.({
      name: addName.trim(),
      category: addCategory,
      purchasePrice: addPrice,
      acquisitionDate: addDate || todayStr,
      annualRatePct: Number.isFinite(addRatePct) ? addRatePct : 0,
      fundingMode: addFundingMode,
      linkedAccountId: addFundingMode === 'account_deduction' ? addAccountId : undefined,
      notes: addNotes.trim() || undefined,
    });

    if (ok !== false) {
      setIsAddModalOpen(false);
    }
  };

  const openEditModal = (asset: FixedAsset) => {
    setEditingAssetId(asset.id);
    setEditName(asset.name);
    setEditCategory(asset.category);
    setEditPrice(asset.purchasePrice);
    setEditDate(asset.acquisitionDate);
    setEditRatePct(asset.annualRatePct);
    setEditNotes(asset.notes || '');
  };

  const editingAsset = useMemo(
    () => syncedFixedAssets.find((a) => a.id === editingAssetId) || null,
    [syncedFixedAssets, editingAssetId]
  );

  const handleSubmitEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAsset || !onUpdateFixedAsset) return;
    if (!editName.trim() || editPrice <= 0) {
      showToast({
        type: 'warning',
        title: 'Input Tidak Valid',
        message: 'Nama aset dan nilai perolehan harus valid.',
      });
      return;
    }

    onUpdateFixedAsset(editingAsset.id, {
      name: editName.trim(),
      category: editCategory,
      ...(editingAsset.isKprLinked ? {} : { purchasePrice: editPrice }),
      acquisitionDate: editDate || editingAsset.acquisitionDate,
      annualRatePct: Number.isFinite(editRatePct) ? editRatePct : 0,
      notes: editNotes.trim() || undefined,
    });
    setEditingAssetId(null);
  };

  const openRevalModal = (asset: FixedAsset) => {
    setRevalAssetId(asset.id);
    setRevalRateInput(asset.annualRatePct);
    setRevalResetEffectiveToday(false);
    setAdjType(asset.annualRatePct >= 0 ? 'appreciation' : 'depreciation');
    setAdjAmount(0);
    setAdjDate(todayStr);
    setAdjNote('');
  };

  const revalAsset = useMemo(
    () => syncedFixedAssets.find((a) => a.id === revalAssetId) || null,
    [syncedFixedAssets, revalAssetId]
  );

  const handleSaveRateUpdate = () => {
    if (!revalAsset || !onUpdateFixedAsset) return;
    onUpdateFixedAsset(revalAsset.id, {
      annualRatePct: Number.isFinite(revalRateInput) ? revalRateInput : 0,
      ...(revalResetEffectiveToday ? { rateEffectiveDate: todayStr } : {}),
    });
    showToast({
      type: 'success',
      title: 'Laju Perubahan Nilai Diperbarui',
      message: `Laju tahunan ${revalAsset.name} diatur menjadi ${revalRateInput >= 0 ? '+' : ''}${revalRateInput}%/thn.`,
    });
  };

  const handleAddManualAdjustment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!revalAsset || !onAddAdjustment) return;
    if (!adjAmount || adjAmount <= 0) {
      showToast({
        type: 'warning',
        title: 'Nominal Penyesuaian Kosong',
        message: 'Masukkan nominal penambahan nilai atau penyusutan lebih dari Rp 0.',
      });
      return;
    }
    onAddAdjustment(revalAsset.id, {
      date: adjDate || todayStr,
      type: adjType,
      amount: Math.round(adjAmount),
      note:
        adjNote.trim() ||
        (adjType === 'appreciation'
          ? 'Penambahan nilai / apresiasi aset'
          : 'Penyusutan / penyesuaian nilai aset'),
    });
    setAdjAmount(0);
    setAdjNote('');
  };

  return (
    <section className="space-y-6">
      {/* COMBINED WEALTH BANNER (INVESTASI FINANSIAL + ASET TETAP & KPR) */}
      {showCombinedBanner && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div className="flex items-start sm:items-center gap-3">
              <div className="p-2.5 rounded-xl bg-slate-900 dark:bg-blue-600 text-white shrink-0">
                <Layers className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-black text-slate-900 dark:text-slate-100 tracking-tight">
                  Kombinasi Kekayaan Aset (Investasi Finansial + Aset Tetap)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                  Akumulasi nilai pasar portofolio investasi, ekuitas pokok lunas KPR, serta nilai buku aset tetap setelah apresiasi dan penyusutan.
                </p>
              </div>
            </div>

            {onAddFixedAsset && (
              <button
                type="button"
                onClick={openAddModal}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold transition cursor-pointer shrink-0"
              >
                <Plus className="h-4 w-4" />
                Catat / Beli Aset Tetap
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* KPI 1: Total Kombinasi */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-1">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                Total Kombinasi Aset
              </span>
              <span className="text-2xl font-black font-mono tabular-nums text-slate-900 dark:text-slate-100 block">
                {formatterIDR.format(combinedWealth.totalCombinedWealth)}
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium block">
                {investments.length} instrumen investasi · {syncedFixedAssets.length} aset tetap
              </span>
            </div>

            {/* KPI 2: Investasi Finansial */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-1">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                Investasi Finansial
              </span>
              <span className="text-xl font-black font-mono tabular-nums text-blue-600 dark:text-blue-400 block">
                {formatterIDR.format(combinedWealth.totalInvestmentValue)}
              </span>
              <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 font-bold block">
                Porsi {combinedWealth.investmentSharePct.toFixed(1)}% · Gain{' '}
                {combinedWealth.totalInvestmentGain >= 0 ? '+' : ''}
                {formatterIDR.format(combinedWealth.totalInvestmentGain)}
              </span>
            </div>

            {/* KPI 3: Nilai Buku Aset Tetap & KPR */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-1">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                Nilai Buku Aset Tetap &amp; KPR
              </span>
              <span className="text-xl font-black font-mono tabular-nums text-emerald-600 dark:text-emerald-400 block">
                {formatterIDR.format(combinedWealth.totalFixedAssetBookValue)}
              </span>
              <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 font-bold block">
                Porsi {combinedWealth.fixedAssetSharePct.toFixed(1)}% · Basis{' '}
                {formatterIDR.format(combinedWealth.totalFixedAssetBasis)}
              </span>
            </div>

            {/* KPI 4: Efek Apresiasi / Penyusutan Bersih */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-1">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                Apresiasi / Penyusutan Bersih
              </span>
              <span
                className={`text-xl font-black font-mono tabular-nums block ${
                  combinedWealth.totalFixedAssetNetChange >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {combinedWealth.totalFixedAssetNetChange >= 0 ? '+' : ''}
                {formatterIDR.format(combinedWealth.totalFixedAssetNetChange)}
              </span>
              <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 font-medium block">
                +{formatterIDR.format(combinedWealth.totalFixedAssetAppreciation)} · -
                {formatterIDR.format(combinedWealth.totalFixedAssetDepreciation)}
              </span>
            </div>
          </div>

          {/* Dual-Segment Proportion Bar */}
          {combinedWealth.totalCombinedWealth > 0 && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px] font-bold text-slate-600 dark:text-slate-300">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-blue-600 inline-block" />
                  Investasi Finansial ({combinedWealth.investmentSharePct.toFixed(1)}%)
                </span>
                <span className="flex items-center gap-1.5">
                  Aset Tetap &amp; Ekuitas KPR ({combinedWealth.fixedAssetSharePct.toFixed(1)}%)
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-600 inline-block" />
                </span>
              </div>
              <div className="h-2.5 w-full rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800 flex">
                <div
                  className="bg-blue-600 transition-all duration-500"
                  style={{ width: `${combinedWealth.investmentSharePct}%` }}
                />
                <div
                  className="bg-emerald-600 transition-all duration-500"
                  style={{ width: `${combinedWealth.fixedAssetSharePct}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* FIXED ASSETS & KPR REGISTRY */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <Building2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                Daftar Aset Tetap, Properti KPR &amp; Penyusutan
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                Properti KPR otomatis diakui bertahap sesuai pokok yang lunas hingga menjadi aset tetap penuh 100%.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-bold">
              {(
                [
                  { id: 'all', label: `Semua (${syncedFixedAssets.length})` },
                  {
                    id: 'kpr',
                    label: `Properti KPR (${combinedWealth.activeKprAssetCount + combinedWealth.paidOffKprAssetCount})`,
                  },
                  { id: 'direct', label: `Aset Lain (${combinedWealth.directFixedAssetCount})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterMode(tab.id)}
                  className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                    filterMode === tab.id
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {onAddFixedAsset && (
              <button
                type="button"
                onClick={openAddModal}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold transition cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                Tambah Aset Tetap
              </button>
            )}
          </div>
        </div>

        {filteredAssets.length === 0 ? (
          <div className="py-12 px-4 text-center border border-dashed border-slate-200 dark:border-slate-700 rounded-2xl bg-slate-50/50 dark:bg-slate-800/30 space-y-3">
            <Building2 className="h-10 w-10 text-slate-300 dark:text-slate-600 mx-auto" />
            <div className="space-y-1 max-w-md mx-auto">
              <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                Belum Ada Aset Tetap Terdaftar
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Catat pembelian aset tetap (kendaraan, elektronik, tanah/properti) dengan opsi potong saldo rekening atau pencatatan langsung, atau tambahkan fasilitas KPR di tab Utang &amp; KPR agar ekuitasnya otomatis tersinkron ke sini.
              </p>
            </div>
            {onAddFixedAsset && (
              <button
                type="button"
                onClick={openAddModal}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold transition cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                Catat Aset Tetap Pertama
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredAssets.map((asset) => {
              const val = calculateFixedAssetValuation(asset, debts, todayStr);
              const Icon = getCategoryIcon(asset.category);
              const fundingLabel = asset.isKprLinked
                ? val.isPaidOff
                  ? 'Lunas · Aset Tetap Penuh'
                  : `KPR Aktif · ${val.ownershipPct.toFixed(1)}% Pokok Lunas`
                : asset.fundingMode === 'account_deduction'
                ? 'Potong Saldo Rekening'
                : 'Catat Aset Langsung';

              return (
                <div key={asset.id} className="py-5 first:pt-1 last:pb-1 space-y-4">
                  {/* Top Row: Name + Metadata + Actions */}
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 shrink-0">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-sm font-black text-slate-900 dark:text-slate-100 truncate">
                            {asset.name}
                          </h4>
                          <span
                            className={`text-[11px] font-bold ${
                              asset.isKprLinked
                                ? val.isPaidOff
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-amber-600 dark:text-amber-400'
                                : 'text-blue-600 dark:text-blue-400'
                            }`}
                          >
                            · {fundingLabel}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                          {asset.category} · Perolehan {asset.acquisitionDate} · Laju{' '}
                          <span className="font-mono tabular-nums font-bold text-slate-700 dark:text-slate-300">
                            {asset.annualRatePct >= 0 ? '+' : ''}
                            {asset.annualRatePct.toFixed(1)}%/thn
                          </span>
                          {asset.notes ? ` · ${asset.notes}` : ''}
                        </p>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {onSyncAssetDepreciation && (() => {
                        const dep = calculateAssetDepreciation(asset, debts, todayStr);
                        if (!dep.isDepreciable || dep.cappedDepreciationAmount <= 0 || !dep.draftAdjustment) {
                          return null;
                        }
                        return (
                          <button
                            type="button"
                            onClick={() => onSyncAssetDepreciation(asset.id)}
                            title={dep.draftAdjustment.note}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/50 dark:hover:bg-amber-950 text-amber-800 dark:text-amber-300 text-xs font-bold transition cursor-pointer"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                            <span>Sinkronkan Penyusutan ({formatterIDR.format(dep.cappedDepreciationAmount)})</span>
                          </button>
                        );
                      })()}
                      <button
                        type="button"
                        onClick={() => openRevalModal(asset)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition cursor-pointer"
                      >
                        <SlidersHorizontal className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                        Revaluasi &amp; Laju
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditModal(asset)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition cursor-pointer"
                      >
                        <Edit2 className="h-3.5 w-3.5 text-slate-500" />
                        Edit
                      </button>

                      {onDeleteFixedAsset && (
                        confirmDeleteId === asset.id ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                onDeleteFixedAsset(asset.id);
                                setConfirmDeleteId(null);
                              }}
                              className="px-2.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition cursor-pointer"
                            >
                              Yakin Hapus
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold transition cursor-pointer"
                            >
                              Batal
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={val.isKprActive}
                            onClick={() => setConfirmDeleteId(asset.id)}
                            title={
                              val.isKprActive
                                ? 'KPR masih aktif — kelola atau lunasi fasilitas KPR melalui tab Perhitungan Utang & KPR.'
                                : 'Hapus aset tetap ini'
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold transition cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Hapus
                          </button>
                        )
                      )}
                    </div>
                  </div>

                  {/* KPR Equity Progress Bar (for KPR-linked properties) */}
                  {asset.isKprLinked && (
                    <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-2">
                      <div className="flex flex-wrap justify-between items-center gap-2 text-xs">
                        <span className="font-bold text-slate-700 dark:text-slate-200">
                          Progres Kepemilikan Pokok Properti KPR
                        </span>
                        <span className="font-mono tabular-nums font-black text-emerald-700 dark:text-emerald-400">
                          {val.ownershipPct.toFixed(1)}% Lunas ({formatterIDR.format(val.basisValue)} /{' '}
                          {formatterIDR.format(val.fullAcquisitionValue)})
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            val.isPaidOff ? 'bg-emerald-600' : 'bg-blue-600'
                          }`}
                          style={{ width: `${Math.min(100, Math.max(0, val.ownershipPct))}%` }}
                        />
                      </div>
                      {val.remainingKprPrincipal > 0 && (
                        <p className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                          Sisa pokok pinjaman KPR belum lunas: {formatterIDR.format(val.remainingKprPrincipal)}
                        </p>
                      )}
                    </div>
                  )}

                  {/* 4 Numeric Valuation Metrics */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                        Basis Diakui
                      </span>
                      <span className="font-mono tabular-nums font-extrabold text-slate-900 dark:text-slate-100 mt-0.5 block">
                        {formatterIDR.format(val.basisValue)}
                      </span>
                    </div>

                    <div className="p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                        Efek Laju ({val.elapsedDays} hr)
                      </span>
                      <span
                        className={`font-mono tabular-nums font-extrabold mt-0.5 block ${
                          val.autoAdjustment >= 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {val.autoAdjustment >= 0 ? '+' : ''}
                        {formatterIDR.format(val.autoAdjustment)}
                      </span>
                    </div>

                    <div className="p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                        Revaluasi Manual ({(asset.manualAdjustments || []).length})
                      </span>
                      <span
                        className={`font-mono tabular-nums font-extrabold mt-0.5 block ${
                          val.manualNetAdjustment >= 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {val.manualNetAdjustment >= 0 ? '+' : ''}
                        {formatterIDR.format(val.manualNetAdjustment)}
                      </span>
                    </div>

                    <div className="p-3 rounded-xl border border-emerald-200/70 dark:border-emerald-800/60 bg-emerald-50/50 dark:bg-emerald-950/20">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 block">
                        Nilai Buku Bersih
                      </span>
                      <span className="font-mono tabular-nums font-black text-emerald-700 dark:text-emerald-300 text-sm mt-0.5 block">
                        {formatterIDR.format(val.currentBookValue)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL 1: TAMBAH / BELI ASET TETAP BARU */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-black text-slate-900 dark:text-slate-100 text-sm uppercase tracking-wider flex items-center gap-2">
                <Building2 className="h-4 w-4 text-blue-600" />
                Catat / Beli Aset Tetap Baru
              </h3>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitAdd} className="space-y-4 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Nama Aset Tetap
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Motor Honda PCX, MacBook Pro, Apartemen Studio"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Kategori Aset
                  </label>
                  <select
                    value={addCategory}
                    onChange={(e) => handleSelectAddCategory(e.target.value as FixedAssetCategory)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {FIXED_ASSET_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Tanggal Perolehan
                  </label>
                  <input
                    type="date"
                    required
                    value={addDate}
                    onChange={(e) => setAddDate(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Harga Perolehan / Beli (Rp)
                  </label>
                  <FormattedNumberInput
                    required
                    placeholder="Contoh: 35.000.000"
                    value={addPrice}
                    onChange={(_, numVal) => setAddPrice(numVal)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 font-mono tabular-nums font-black text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Laju Nilai Tahunan (%/thn)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={addRatePct}
                    onChange={(e) => setAddRatePct(Number(e.target.value))}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 font-mono tabular-nums font-black text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {RATE_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setAddRatePct(preset.rate)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                      addRatePct === preset.rate
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {/* Funding Mode Switcher */}
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                  Dampak ke Saldo Rekening
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAddFundingMode('account_deduction')}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                      addFundingMode === 'account_deduction'
                        ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/30 text-blue-900 dark:text-blue-200'
                        : 'border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <div className="font-extrabold flex items-center gap-1.5">
                      <Wallet className="h-3.5 w-3.5" />
                      Potong Saldo Rekening
                    </div>
                    <p className="text-[11px] opacity-80 mt-0.5">
                      Otomatis mencatat transaksi &amp; mengurangi saldo rekening pembayar.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAddFundingMode('direct_record')}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                      addFundingMode === 'direct_record'
                        ? 'border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200'
                        : 'border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <div className="font-extrabold flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5" />
                      Catat Aset Langsung
                    </div>
                    <p className="text-[11px] opacity-80 mt-0.5">
                      Menambahkan aset yang sudah dimiliki tanpa mengubah saldo kas/bank.
                    </p>
                  </button>
                </div>
              </div>

              {addFundingMode === 'account_deduction' && (
                <div className="space-y-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1">
                      Rekening Pembayar
                    </label>
                    <select
                      value={addAccountId}
                      onChange={(e) => setAddAccountId(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">-- Pilih Rekening --</option>
                      {accounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name} ({formatterIDR.format(acc.currentBalance)})
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedFundingAccount && (
                    <div
                      className={`p-2.5 rounded-xl border text-[11px] font-mono tabular-nums flex justify-between ${
                        isLiquidInsufficient
                          ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300'
                          : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      <span>Saldo {selectedFundingAccount.name}:</span>
                      <span className="font-bold">
                        {formatterIDR.format(selectedFundingAccount.currentBalance)} &rarr;{' '}
                        {formatterIDR.format(projectedAccountBalance)}
                      </span>
                    </div>
                  )}

                  {isLiquidInsufficient && (
                    <p className="text-[11px] font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      Saldo rekening likuid tidak mencukupi. Pilih rekening lain atau gunakan Catat Aset Langsung.
                    </p>
                  )}
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Catatan (Opsional)
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Pembelian tunai resmi / nomor seri aset"
                  value={addNotes}
                  onChange={(e) => setAddNotes(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={addPrice <= 0 || !addName.trim() || isLiquidInsufficient}
                  className="px-4 py-2 rounded-xl text-xs font-extrabold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white cursor-pointer transition inline-flex items-center gap-1.5"
                >
                  <Check className="h-3.5 w-3.5" />
                  Simpan Aset Tetap
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: EDIT ASET TETAP */}
      {editingAsset && (
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-black text-slate-900 dark:text-slate-100 text-sm uppercase tracking-wider flex items-center gap-2">
                <Edit2 className="h-4 w-4 text-blue-600" />
                Edit Detail Aset Tetap
              </h3>
              <button
                type="button"
                onClick={() => setEditingAssetId(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitEdit} className="space-y-4 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Nama Aset
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 font-bold text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Kategori
                  </label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value as FixedAssetCategory)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 font-bold text-slate-800 dark:text-slate-100"
                  >
                    {FIXED_ASSET_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Tanggal Perolehan
                  </label>
                  <input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 font-bold text-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Harga Perolehan (Rp)
                  </label>
                  <FormattedNumberInput
                    value={editPrice}
                    disabled={Boolean(editingAsset.isKprLinked)}
                    onChange={(_, numVal) => setEditPrice(numVal)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100 disabled:opacity-60"
                  />
                  {editingAsset.isKprLinked && (
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      Mengikuti harga properti KPR
                    </span>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Laju Tahunan (%/thn)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={editRatePct}
                    onChange={(e) => setEditRatePct(Number(e.target.value))}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Catatan
                </label>
                <input
                  type="text"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 font-medium text-slate-800 dark:text-slate-100"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingAssetId(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-extrabold bg-blue-600 hover:bg-blue-700 text-white cursor-pointer inline-flex items-center gap-1.5"
                >
                  <Check className="h-3.5 w-3.5" />
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: REVALUASI MANUAL & PENYESUAIAN LAJU TAHUNAN */}
      {revalAsset && (
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-5">
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-black text-slate-900 dark:text-slate-100 text-sm uppercase tracking-wider flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4 text-blue-600" />
                  Revaluasi &amp; Laju Nilai: {revalAsset.name}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Sesuaikan persentase otomatis tahunan atau catat penambahan/penyusutan nilai manual.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRevalAssetId(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {(() => {
              const liveVal = calculateFixedAssetValuation(revalAsset, debts, todayStr);
              const depPreview = calculateAssetDepreciation(revalAsset, debts, todayStr);
              return (
                <div className="space-y-3">
                  <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 grid grid-cols-3 gap-3 text-xs">
                    <div>
                      <span className="text-[10px] font-bold uppercase text-slate-500 block">
                        Basis Diakui
                      </span>
                      <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100">
                        {formatterIDR.format(liveVal.basisValue)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase text-slate-500 block">
                        Total Penyesuaian
                      </span>
                      <span
                        className={`font-mono tabular-nums font-bold ${
                          liveVal.totalNetValueChange >= 0 ? 'text-emerald-600' : 'text-rose-600'
                        }`}
                      >
                        {liveVal.totalNetValueChange >= 0 ? '+' : ''}
                        {formatterIDR.format(liveVal.totalNetValueChange)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase text-slate-500 block">
                        Nilai Buku Kini
                      </span>
                      <span className="font-mono tabular-nums font-black text-blue-600 dark:text-blue-400">
                        {formatterIDR.format(liveVal.currentBookValue)}
                      </span>
                    </div>
                  </div>

                  {onSyncAssetDepreciation &&
                    depPreview.isDepreciable &&
                    depPreview.cappedDepreciationAmount > 0 &&
                    depPreview.draftAdjustment && (
                      <div className="p-3.5 rounded-xl border border-amber-200 dark:border-amber-800/80 bg-amber-50/70 dark:bg-amber-950/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                        <div className="space-y-0.5">
                          <span className="font-bold text-amber-900 dark:text-amber-200 block">
                            Draft Penyusutan Siap Sinkron ({depPreview.annualRatePct}%/thn · {depPreview.elapsedDays} hari)
                          </span>
                          <span className="text-[11px] text-amber-800 dark:text-amber-300 font-mono tabular-nums">
                            Nominal: -{formatterIDR.format(depPreview.cappedDepreciationAmount)} · Proyeksi Buku: {formatterIDR.format(depPreview.projectedBookValueAfter)}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => onSyncAssetDepreciation(revalAsset.id)}
                          className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold transition cursor-pointer whitespace-nowrap shrink-0"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          <span>Sinkronkan Sekarang</span>
                        </button>
                      </div>
                    )}
                </div>
              );
            })()}

            {/* Section A: Laju Persentase Tahunan */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-extrabold text-slate-800 dark:text-slate-200 uppercase text-[11px] tracking-wider">
                  1. Laju Otomatis Tahunan (% / thn)
                </span>
                <span className="text-[11px] text-slate-500 font-mono">
                  Positif = Apresiasi · Negatif = Penyusutan
                </span>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.5"
                  value={revalRateInput}
                  onChange={(e) => setRevalRateInput(Number(e.target.value))}
                  className="w-32 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 font-mono tabular-nums font-black text-slate-900 dark:text-slate-100"
                />
                <button
                  type="button"
                  onClick={handleSaveRateUpdate}
                  className="px-3.5 py-2 rounded-xl bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-700 text-white font-bold cursor-pointer transition"
                >
                  Terapkan Laju
                </button>
              </div>

              <label className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={revalResetEffectiveToday}
                  onChange={(e) => setRevalResetEffectiveToday(e.target.checked)}
                  className="rounded border-slate-300"
                />
                Mulai hitung efek laju baru per hari ini ({todayStr})
              </label>
            </div>

            {/* Section B: Catat Penyesuaian Nilai Manual */}
            <form
              onSubmit={handleAddManualAdjustment}
              className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3 text-xs"
            >
              <span className="font-extrabold text-slate-800 dark:text-slate-200 uppercase text-[11px] tracking-wider block">
                2. Tambah Penyesuaian Nilai Manual
              </span>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAdjType('appreciation')}
                  className={`py-2 px-3 rounded-xl border font-bold flex items-center justify-center gap-1.5 cursor-pointer transition ${
                    adjType === 'appreciation'
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <TrendingUp className="h-3.5 w-3.5" />
                  Penambahan Nilai (+)
                </button>
                <button
                  type="button"
                  onClick={() => setAdjType('depreciation')}
                  className={`py-2 px-3 rounded-xl border font-bold flex items-center justify-center gap-1.5 cursor-pointer transition ${
                    adjType === 'depreciation'
                      ? 'bg-rose-600 text-white border-rose-600'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <TrendingDown className="h-3.5 w-3.5" />
                  Penyusutan Manual (-)
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                    Nominal Penyesuaian (Rp)
                  </label>
                  <FormattedNumberInput
                    value={adjAmount}
                    onChange={(_, numVal) => setAdjAmount(numVal)}
                    placeholder="Contoh: 5.000.000"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                    Tanggal Penyesuaian
                  </label>
                  <input
                    type="date"
                    value={adjDate}
                    onChange={(e) => setAdjDate(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 font-bold text-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                  Keterangan / Alasan Penyesuaian
                </label>
                <input
                  type="text"
                  value={adjNote}
                  onChange={(e) => setAdjNote(e.target.value)}
                  placeholder="Contoh: Renovasi rumah, apresiasi NJOP, atau depresiasi servis besar"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 font-medium text-slate-800 dark:text-slate-100"
                />
              </div>

              <button
                type="submit"
                disabled={!adjAmount || adjAmount <= 0}
                className="w-full py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-extrabold cursor-pointer transition"
              >
                Catat Penyesuaian Nilai
              </button>
            </form>

            {/* Section C: Riwayat Penyesuaian Manual */}
            <div className="space-y-2 text-xs">
              <span className="font-extrabold text-slate-700 dark:text-slate-300 uppercase text-[11px] tracking-wider block">
                Riwayat Revaluasi Manual ({(revalAsset.manualAdjustments || []).length})
              </span>
              {(revalAsset.manualAdjustments || []).length === 0 ? (
                <p className="text-[11px] text-slate-400 italic">
                  Belum ada catatan penyesuaian manual untuk aset ini.
                </p>
              ) : (
                <div className="max-h-40 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl">
                  {(revalAsset.manualAdjustments || []).map((adj) => (
                    <div
                      key={adj.id}
                      className="p-2.5 flex items-center justify-between gap-2 bg-slate-50/40 dark:bg-slate-800/30"
                    >
                      <div className="min-w-0">
                        <p className="font-bold text-slate-800 dark:text-slate-200 truncate">
                          {adj.note}
                        </p>
                        <span className="text-[10px] font-mono text-slate-400">{adj.date}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`font-mono tabular-nums font-black ${
                            adj.type === 'appreciation' ? 'text-emerald-600' : 'text-rose-600'
                          }`}
                        >
                          {adj.type === 'appreciation' ? '+' : '-'}
                          {formatterIDR.format(adj.amount)}
                        </span>
                        {onDeleteAdjustment && (
                          <button
                            type="button"
                            onClick={() => onDeleteAdjustment(revalAsset.id, adj.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                            title="Hapus penyesuaian"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
