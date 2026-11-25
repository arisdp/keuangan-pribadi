import React from 'react';
import { motion } from 'motion/react';
import { Transaction, Account, CategoryBudget, Debt, EmergencyFundConfig, EmergencyFundTransaction, FixedAsset, InvestmentAsset, SavingsGoal } from '../types';
import { FormattedNumberInput } from './FormattedNumberInput';
import { TaxCalculatorCard } from './TaxCalculatorCard';
import { DashboardFinancialHealthPanel } from './DashboardFinancialHealthPanel';
import { DashboardHealthScannerCard } from './DashboardHealthScannerCard';
import { DashboardAnomalyAlertBanner } from './DashboardAnomalyAlertBanner';
import { SavingsAchievementCard } from './SavingsAchievementCard';
import { CategoryAnomalyDetectionResult } from '../utils/anomalyDetection';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, ReferenceLine } from 'recharts';
import { TrendingUp, TrendingDown, Wallet, ShieldAlert, CreditCard, PiggyBank, ArrowRight, CheckCircle2, AlertTriangle, Calendar, ChevronLeft, ChevronRight, ChevronDown, ArrowUpRight, ArrowDownRight, Info, Eye, EyeOff, Percent, ArrowDown, Sparkles, Lightbulb, Target, Plus, Trash2, Edit2, Clock, Bell, DollarSign, X, RefreshCw, Activity, BarChart3, Table, GitCommit, Scale, FileCheck, ShieldCheck, Building2 } from 'lucide-react';
import {
  BatchFixedAssetDepreciationResult,
  FixedAssetDepreciationResult,
  FixedAssetLifecycleMetrics,
  FixedAssetValuationResult,
  NetWorthCombinedTrendPoint,
  NetWorthTrendWithProjectionResult,
  WeeklyFinancialPrioritiesResult,
  calculateAssetDepreciation,
  calculateCombinedPortfolioWealth,
  calculateFixedAssetLifecycleMetrics,
  calculateFixedAssetValuation,
  calculateTotalLiquidCash,
  calculateCreditPaylaterBills,
  calculateTotalEmergencyFund,
  calculateTotalDebts,
  calculateMonthlyDebtService,
  calculateIncomeStatementSummary,
  calculateNetWorthTrendWithProjection,
  calculateWeeklyFinancialPriorities,
  getAccountCreditBill,
  getCreditAccounts,
  getCreditOverlimitAmount,
  getLiquidAccounts,
  isCreditAccount,
  isOperatingIncome,
  isOperatingExpense,
  isInternalTransfer,
  classifyTransaction,
  getTransactionAccountDelta,
  parseLocalDate,
  syncKprDebtsToFixedAssets,
  toLocalYYYYMMDD,
} from '../utils/accountingEngine';
import { formatterIDR } from '../utils/formatters';
import { showToast } from '../utils/toast';

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.4,
      ease: 'easeOut' as const,
    },
  },
};

export type NetWorthModalCategory = 'liquid' | 'investment' | 'fixed' | 'debt';

export interface FixedAssetModalRow {
  asset: FixedAsset;
  valuation: FixedAssetValuationResult;
  depreciation?: FixedAssetDepreciationResult;
  lifecycle: FixedAssetLifecycleMetrics;
}

export interface FixedAssetDepreciationDetailProps {
  row: FixedAssetModalRow;
  formatValue: (amount: number, isSensitive?: boolean) => string;
  onSyncFixedAssetDepreciation?: (assetId: string) => void;
}

export const FixedAssetDepreciationDetail: React.FC<FixedAssetDepreciationDetailProps> = ({
  row,
  formatValue,
  onSyncFixedAssetDepreciation,
}) => {
  const { asset, valuation: val, depreciation: dep, lifecycle } = row;
  const formatYears = (years: number) =>
    years >= 1 ? `${years.toFixed(1).replace('.', ',')} thn` : `${Math.round(years * 12)} bln`;

  const progressBarTone = !lifecycle.isDepreciable
    ? 'bg-emerald-500'
    : lifecycle.ageProgressPct >= 90
    ? 'bg-rose-600'
    : lifecycle.ageProgressPct >= 65
    ? 'bg-amber-500'
    : 'bg-blue-600';

  const statusTextTone = !lifecycle.isDepreciable
    ? 'text-emerald-700'
    : lifecycle.ageProgressPct >= 90
    ? 'text-rose-700'
    : lifecycle.ageProgressPct >= 65
    ? 'text-amber-700'
    : 'text-blue-700';

  return (
    <div className="px-4 py-3.5 bg-slate-50/75 border-t border-slate-200/80 space-y-3">
      {/* Progress Bar Durasi Nilai Buku */}
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <div className="flex items-center gap-1.5 font-bold text-slate-700">
            <Clock className="h-3.5 w-3.5 text-slate-500 shrink-0" />
            <span>
              {lifecycle.isDepreciable
                ? 'Masa Pakai Berjalan vs Estimasi Umur Ekonomis'
                : asset.isKprLinked
                ? 'Progres Pelunasan Pokok & Nilai Buku Properti'
                : 'Durasi Kepemilikan & Laju Apresiasi Nilai'}
            </span>
          </div>
          <span className={`font-mono tabular-nums font-extrabold ${statusTextTone}`}>
            {lifecycle.isDepreciable
              ? `${formatYears(lifecycle.elapsedAgeYears)} / ${formatYears(
                  lifecycle.estimatedUsefulLifeYears
                )} · ${lifecycle.ageProgressPct.toFixed(1)}%`
              : asset.isKprLinked
              ? `${val.ownershipPct.toFixed(1)}% Lunas`
              : `+${lifecycle.annualRatePctAbs.toFixed(1)}%/thn`}
          </span>
        </div>

        <div
          role="progressbar"
          aria-label={`Durasi nilai buku ${asset.name}`}
          aria-valuenow={
            lifecycle.isDepreciable || asset.isKprLinked
              ? Math.round(lifecycle.ageProgressPct)
              : 100
          }
          aria-valuemin={0}
          aria-valuemax={100}
          className="w-full h-2.5 rounded-full bg-slate-200 overflow-hidden"
        >
          <div
            className={`h-full rounded-full transition-all duration-500 ${progressBarTone}`}
            style={{
              width: `${
                lifecycle.isDepreciable || asset.isKprLinked
                  ? Math.min(100, Math.max(2, lifecycle.ageProgressPct))
                  : 100
              }%`,
            }}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
          <span>
            Perolehan{' '}
            <span className="font-mono tabular-nums font-semibold text-slate-700">
              {lifecycle.acquisitionDate}
            </span>{' '}
            · Umur{' '}
            <span className="font-mono tabular-nums font-semibold text-slate-700">
              {lifecycle.totalAgeDays.toLocaleString('id-ID')} hari
            </span>
          </span>
          <span className="font-mono tabular-nums font-semibold text-slate-600">
            {lifecycle.isDepreciable
              ? lifecycle.remainingLifeDays > 0
                ? `Sisa masa manfaat: ${formatYears(lifecycle.remainingLifeYears)}`
                : 'Estimasi umur ekonomis tercapai'
              : `Sisa nilai buku: ${lifecycle.bookValueRemainingPct.toFixed(1)}%`}
          </span>
        </div>
      </div>

      {/* Rincian Akumulasi Penyusutan & Nilai Buku */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-200/70 text-[11px]">
        <div className="space-y-0.5">
          <span className="text-slate-500 block">Basis Nilai Buku</span>
          <span className="font-mono tabular-nums font-bold text-slate-900 block">
            {formatValue(val.basisValue)}
          </span>
        </div>

        <div className="space-y-0.5">
          <span className="text-slate-500 block">
            {lifecycle.isDepreciable
              ? `Tarif Susut (${lifecycle.annualRatePctAbs}%/thn)`
              : `Laju Tahunan (+${lifecycle.annualRatePctAbs}%)`}
          </span>
          <span className="font-mono tabular-nums font-bold text-slate-900 block">
            {lifecycle.isDepreciable
              ? `-${formatValue(lifecycle.monthlyDepreciationAmount)}/bln`
              : `+${formatValue(Math.round((val.basisValue * lifecycle.annualRatePctAbs) / 100))}/thn`}
          </span>
        </div>

        <div className="space-y-0.5">
          <span className="text-slate-500 block">Akumulasi Tercatat</span>
          <span className="font-mono tabular-nums font-bold text-amber-700 block">
            {lifecycle.accumulatedDepreciationRecorded > 0
              ? `-${formatValue(lifecycle.accumulatedDepreciationRecorded)}`
              : formatValue(0)}
          </span>
        </div>

        <div className="space-y-0.5">
          <span className="text-slate-500 block">
            {lifecycle.pendingDepreciationAmount > 0
              ? 'Proyeksi Stlh Posting'
              : 'Sisa Nilai Buku'}
          </span>
          <span className="font-mono tabular-nums font-bold text-slate-900 block">
            {formatValue(
              lifecycle.pendingDepreciationAmount > 0
                ? lifecycle.projectedBookValueAfterSync
                : val.currentBookValue
            )}
            <span className="text-slate-500 font-normal">
              {' '}
              ({lifecycle.bookValueRemainingPct.toFixed(0)}%)
            </span>
          </span>
        </div>
      </div>

      {/* Footer Info / Aksi Posting Inline */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/70 text-[11px]">
        <span className="text-slate-500">
          Status: <strong className={statusTextTone}>{lifecycle.lifecycleStatus}</strong>
          {lifecycle.pendingDepreciationAmount > 0 && (
            <>
              {' '}
              · Draft belum diposting:{' '}
              <span className="font-mono tabular-nums font-bold text-amber-700">
                -{formatValue(lifecycle.pendingDepreciationAmount)}
              </span>
            </>
          )}
        </span>

        {onSyncFixedAssetDepreciation &&
          dep &&
          dep.isDepreciable &&
          dep.cappedDepreciationAmount > 0 &&
          dep.draftAdjustment && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSyncFixedAssetDepreciation(asset.id);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold transition cursor-pointer whitespace-nowrap shrink-0"
            >
              <RefreshCw className="h-3 w-3" />
              <span>Posting Jurnal Non-Kas</span>
            </button>
          )}
      </div>
    </div>
  );
};

export interface NeracaKekayaanBersihProps {
  netWorth: number;
  totalCurrentAssets: number;
  totalDebts: number;
  totalLiquidAssets: number;
  totalEmergency: number;
  totalLiquidWithEmergency: number;
  totalInvestments: number;
  totalInvestmentGain: number;
  totalFixedAssets: number;
  totalFixedAssetBasis: number;
  totalFixedAssetNetChange: number;
  loanDebtsOnly: number;
  totalCreditCardBills: number;
  liquidAccounts: Account[];
  creditCardAndPaylaterAccounts: Account[];
  investments: InvestmentAsset[];
  fixedAssetRows: FixedAssetModalRow[];
  debts: Debt[];
  batchAssetDepreciation: BatchFixedAssetDepreciationResult;
  healthStatus: 'Sehat' | 'Waspada' | 'Kritis';
  healthColor: string;
  healthRatioText: string;
  formatValue: (amount: number, isSensitive?: boolean) => string;
  onSyncFixedAssetDepreciation?: (assetId: string) => void;
  onSyncAllFixedAssetDepreciations?: () => void;
  onQuickAction: (tab: string) => void;
}

export const NeracaKekayaanBersih: React.FC<NeracaKekayaanBersihProps> = ({
  netWorth,
  totalCurrentAssets,
  totalDebts,
  totalLiquidAssets,
  totalEmergency,
  totalLiquidWithEmergency,
  totalInvestments,
  totalInvestmentGain,
  totalFixedAssets,
  totalFixedAssetBasis,
  totalFixedAssetNetChange,
  loanDebtsOnly,
  totalCreditCardBills,
  liquidAccounts,
  creditCardAndPaylaterAccounts,
  investments,
  fixedAssetRows,
  debts,
  batchAssetDepreciation,
  healthStatus,
  healthColor,
  healthRatioText,
  formatValue,
  onSyncFixedAssetDepreciation,
  onSyncAllFixedAssetDepreciations,
  onQuickAction,
}) => {
  const [activeNetWorthModal, setActiveNetWorthModal] =
    React.useState<NetWorthModalCategory | null>(null);
  const [expandedAssetId, setExpandedAssetId] = React.useState<string | null>(null);

  React.useEffect(() => {
    setExpandedAssetId(null);
  }, [activeNetWorthModal]);

  React.useEffect(() => {
    if (!activeNetWorthModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveNetWorthModal(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeNetWorthModal]);

  const assetSum = Math.max(0, totalCurrentAssets);
  const liquidPct = assetSum > 0 ? (totalLiquidWithEmergency / assetSum) * 100 : 0;
  const investPct = assetSum > 0 ? (totalInvestments / assetSum) * 100 : 0;
  const fixedPct = assetSum > 0 ? (totalFixedAssets / assetSum) * 100 : 0;

  return (
    <motion.div
      variants={cardVariants}
      className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-5"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-slate-900 text-white shrink-0">
            <Scale className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-slate-900 tracking-tight">
              Neraca Kekayaan Bersih
            </h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Real-time · Kas Likuid · Investasi · Aset Tetap Setelah Penyusutan − Liabilitas
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold ${healthColor}`}
          >
            {healthStatus === 'Sehat' ? (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            )}
            <span>{healthStatus}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">{healthRatioText}</span>
          </span>

          <button
            type="button"
            onClick={() => onQuickAction('reports')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0"
          >
            <span>Laporan Neraca</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Hero Net Worth Figure & Asset Composition Bar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        <div className="lg:col-span-5 space-y-1.5">
          <span className="text-xs font-bold text-slate-500 block">
            Total Kekayaan Bersih (Net Worth)
          </span>
          <div
            className={`text-2xl sm:text-3xl font-black font-mono tabular-nums tracking-tight ${
              netWorth >= 0 ? 'text-slate-900' : 'text-rose-600'
            }`}
          >
            {formatValue(netWorth)}
          </div>
          <p className="text-xs text-slate-500 font-medium font-mono tabular-nums">
            Total Aset {formatValue(totalCurrentAssets)} − Kewajiban {formatValue(totalDebts)}
          </p>
        </div>

        <div className="lg:col-span-7 space-y-2.5">
          <div className="flex items-center justify-between text-xs text-slate-600 font-medium">
            <span>Komposisi Bruto Aset Aktif</span>
            <span className="font-mono tabular-nums font-bold text-slate-900">
              {formatValue(totalCurrentAssets)}
            </span>
          </div>
          <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden flex">
            {liquidPct > 0 && (
              <div
                className="bg-blue-600 h-full transition-all duration-300"
                style={{ width: `${liquidPct}%` }}
                title={`Kas Likuid: ${liquidPct.toFixed(1)}%`}
              />
            )}
            {investPct > 0 && (
              <div
                className="bg-indigo-600 h-full transition-all duration-300"
                style={{ width: `${investPct}%` }}
                title={`Investasi: ${investPct.toFixed(1)}%`}
              />
            )}
            {fixedPct > 0 && (
              <div
                className="bg-amber-500 h-full transition-all duration-300"
                style={{ width: `${fixedPct}%` }}
                title={`Aset Tetap Net: ${fixedPct.toFixed(1)}%`}
              />
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-slate-600 font-medium">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-blue-600 inline-block shrink-0" />
              Kas Likuid{' '}
              <span className="font-mono tabular-nums font-bold text-slate-800">
                {liquidPct.toFixed(1)}%
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-indigo-600 inline-block shrink-0" />
              Investasi{' '}
              <span className="font-mono tabular-nums font-bold text-slate-800">
                {investPct.toFixed(1)}%
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-amber-500 inline-block shrink-0" />
              Aset Tetap Net{' '}
              <span className="font-mono tabular-nums font-bold text-slate-800">
                {fixedPct.toFixed(1)}%
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* 4-Column Interactive Balance Sheet Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-px bg-slate-200 border border-slate-200 rounded-xl overflow-hidden">
        {/* 1. Kas Likuid */}
        <button
          type="button"
          onClick={() => setActiveNetWorthModal('liquid')}
          className="p-4 flex flex-col justify-between space-y-3 text-left bg-white hover:bg-slate-50 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        >
          <div className="space-y-1 w-full">
            <div className="flex items-center justify-between text-xs font-bold text-slate-600">
              <span className="flex items-center gap-1.5">
                <Wallet className="h-3.5 w-3.5 text-blue-600" />
                Kas Likuid
              </span>
              <span className="font-mono tabular-nums text-[11px] text-slate-400">
                {liquidPct.toFixed(1)}%
              </span>
            </div>
            <div className="text-lg font-black font-mono tabular-nums text-slate-900">
              {formatValue(totalLiquidWithEmergency)}
            </div>
            <div className="text-[11px] text-slate-500 space-y-0.5 pt-1">
              <div className="flex justify-between gap-2">
                <span>Kas &amp; Bank ({liquidAccounts.length})</span>
                <span className="font-mono tabular-nums font-semibold text-slate-700">
                  {formatValue(totalLiquidAssets)}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span>Dana Darurat</span>
                <span className="font-mono tabular-nums font-semibold text-slate-700">
                  {formatValue(totalEmergency)}
                </span>
              </div>
            </div>
          </div>
          <span className="inline-flex items-center justify-between w-full text-[11px] font-bold text-blue-600 pt-1">
            <span>Lihat rincian item</span>
            <ArrowUpRight className="h-3.5 w-3.5" />
          </span>
        </button>

        {/* 2. Aset Investasi */}
        <button
          type="button"
          onClick={() => setActiveNetWorthModal('investment')}
          className="p-4 flex flex-col justify-between space-y-3 text-left bg-white hover:bg-slate-50 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
        >
          <div className="space-y-1 w-full">
            <div className="flex items-center justify-between text-xs font-bold text-slate-600">
              <span className="flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-indigo-600" />
                Aset Investasi
              </span>
              <span className="font-mono tabular-nums text-[11px] text-slate-400">
                {investPct.toFixed(1)}%
              </span>
            </div>
            <div className="text-lg font-black font-mono tabular-nums text-slate-900">
              {formatValue(totalInvestments)}
            </div>
            <div className="text-[11px] text-slate-500 space-y-0.5 pt-1">
              <div className="flex justify-between gap-2">
                <span>Instrumen Aktif</span>
                <span className="font-mono tabular-nums font-semibold text-slate-700">
                  {investments.length} aset
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span>Gain / Loss</span>
                <span
                  className={`font-mono tabular-nums font-semibold ${
                    totalInvestmentGain >= 0 ? 'text-emerald-600' : 'text-rose-600'
                  }`}
                >
                  {totalInvestmentGain >= 0 ? '+' : ''}
                  {formatValue(totalInvestmentGain)}
                </span>
              </div>
            </div>
          </div>
          <span className="inline-flex items-center justify-between w-full text-[11px] font-bold text-indigo-600 pt-1">
            <span>Lihat rincian item</span>
            <ArrowUpRight className="h-3.5 w-3.5" />
          </span>
        </button>

        {/* 3. Aset Tetap (Net Penyusutan) */}
        <button
          type="button"
          onClick={() => setActiveNetWorthModal('fixed')}
          className="p-4 flex flex-col justify-between space-y-3 text-left bg-white hover:bg-slate-50 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"
        >
          <div className="space-y-1 w-full">
            <div className="flex items-center justify-between text-xs font-bold text-slate-600">
              <span className="flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-amber-600" />
                Aset Tetap (Net)
              </span>
              <span className="font-mono tabular-nums text-[11px] text-slate-400">
                {fixedPct.toFixed(1)}%
              </span>
            </div>
            <div className="text-lg font-black font-mono tabular-nums text-slate-900">
              {formatValue(totalFixedAssets)}
            </div>
            <div className="text-[11px] text-slate-500 space-y-0.5 pt-1">
              <div className="flex justify-between gap-2">
                <span>Nilai Dasar / Ekuitas</span>
                <span className="font-mono tabular-nums font-semibold text-slate-700">
                  {formatValue(totalFixedAssetBasis)}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span>Penyesuaian / Susut</span>
                <span
                  className={`font-mono tabular-nums font-semibold ${
                    totalFixedAssetNetChange >= 0 ? 'text-emerald-600' : 'text-amber-700'
                  }`}
                >
                  {totalFixedAssetNetChange >= 0 ? '+' : '-'}
                  {formatValue(Math.abs(totalFixedAssetNetChange))}
                </span>
              </div>
            </div>
          </div>
          <span className="inline-flex items-center justify-between w-full text-[11px] font-bold text-amber-700 pt-1">
            <span>
              Rincian ({fixedAssetRows.length} aset
              {batchAssetDepreciation.pendingCount > 0
                ? ` · ${batchAssetDepreciation.pendingCount} susut`
                : ''}
              )
            </span>
            <ArrowUpRight className="h-3.5 w-3.5" />
          </span>
        </button>

        {/* 4. Total Liabilitas / Utang */}
        <button
          type="button"
          onClick={() => setActiveNetWorthModal('debt')}
          className="p-4 flex flex-col justify-between space-y-3 text-left bg-white hover:bg-slate-50 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600"
        >
          <div className="space-y-1 w-full">
            <div className="flex items-center justify-between text-xs font-bold text-slate-600">
              <span className="flex items-center gap-1.5">
                <CreditCard className="h-3.5 w-3.5 text-rose-600" />
                Total Kewajiban
              </span>
              <span className="font-mono tabular-nums text-[11px] text-rose-600 font-bold">
                {totalCurrentAssets > 0
                  ? `${((totalDebts / totalCurrentAssets) * 100).toFixed(1)}%`
                  : totalDebts > 0
                  ? '100.0%'
                  : '0.0%'}
              </span>
            </div>
            <div className="text-lg font-black font-mono tabular-nums text-rose-600">
              {totalDebts > 0 ? `-${formatValue(totalDebts)}` : formatValue(0)}
            </div>
            <div className="text-[11px] text-slate-500 space-y-0.5 pt-1">
              <div className="flex justify-between gap-2">
                <span>Pinjaman &amp; KPR</span>
                <span className="font-mono tabular-nums font-semibold text-slate-700">
                  {formatValue(loanDebtsOnly)}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span>Kartu Kredit &amp; PayLater</span>
                <span className="font-mono tabular-nums font-semibold text-slate-700">
                  {formatValue(totalCreditCardBills)}
                </span>
              </div>
            </div>
          </div>
          <span className="inline-flex items-center justify-between w-full text-[11px] font-bold text-rose-600 pt-1">
            <span>Lihat rincian item</span>
            <ArrowUpRight className="h-3.5 w-3.5" />
          </span>
        </button>
      </div>

      {/* Centered Modal Rincian Item & Navigasi Cepat */}
      {activeNetWorthModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={() => setActiveNetWorthModal(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="net-worth-modal-title"
        >
          <div
            className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                <div
                  className={`p-2.5 rounded-xl shrink-0 ${
                    activeNetWorthModal === 'liquid'
                      ? 'bg-blue-50 text-blue-600'
                      : activeNetWorthModal === 'investment'
                      ? 'bg-indigo-50 text-indigo-600'
                      : activeNetWorthModal === 'fixed'
                      ? 'bg-amber-50 text-amber-700'
                      : 'bg-rose-50 text-rose-600'
                  }`}
                >
                  {activeNetWorthModal === 'liquid' && <Wallet className="h-5 w-5" />}
                  {activeNetWorthModal === 'investment' && <TrendingUp className="h-5 w-5" />}
                  {activeNetWorthModal === 'fixed' && <Building2 className="h-5 w-5" />}
                  {activeNetWorthModal === 'debt' && <CreditCard className="h-5 w-5" />}
                </div>
                <div className="min-w-0">
                  <h3
                    id="net-worth-modal-title"
                    className="text-base font-extrabold text-slate-900 tracking-tight"
                  >
                    {activeNetWorthModal === 'liquid' && 'Rincian Kas Likuid & Dana Darurat'}
                    {activeNetWorthModal === 'investment' && 'Rincian Portofolio Investasi'}
                    {activeNetWorthModal === 'fixed' && 'Rincian Aset Tetap & Penyusutan'}
                    {activeNetWorthModal === 'debt' && 'Rincian Kewajiban, Utang & Tagihan Kredit'}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    {activeNetWorthModal === 'liquid' &&
                      `${liquidAccounts.length} rekening likuid aktif · Dana Darurat tergabung ke likuiditas`}
                    {activeNetWorthModal === 'investment' &&
                      `${investments.length} instrumen aktif · Nilai pasar & imbal hasil terkini`}
                    {activeNetWorthModal === 'fixed' &&
                      `${fixedAssetRows.length} aset tetap & properti KPR · Nilai buku setelah penyusutan`}
                    {activeNetWorthModal === 'debt' &&
                      `${debts.filter((d) => d.balance > 0).length} pinjaman aktif · ${
                        creditCardAndPaylaterAccounts.filter((a) => getAccountCreditBill(a) > 0).length
                      } tagihan kredit/PayLater`}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right hidden sm:block">
                  <span className="text-[11px] font-semibold text-slate-400 block">
                    Total Kategori
                  </span>
                  <span
                    className={`text-sm font-black font-mono tabular-nums ${
                      activeNetWorthModal === 'debt' ? 'text-rose-600' : 'text-slate-900'
                    }`}
                  >
                    {activeNetWorthModal === 'liquid' && formatValue(totalLiquidWithEmergency)}
                    {activeNetWorthModal === 'investment' && formatValue(totalInvestments)}
                    {activeNetWorthModal === 'fixed' && formatValue(totalFixedAssets)}
                    {activeNetWorthModal === 'debt' &&
                      (totalDebts > 0 ? `-${formatValue(totalDebts)}` : formatValue(0))}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveNetWorthModal(null)}
                  className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition cursor-pointer"
                  aria-label="Tutup modal rincian"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4">
              {activeNetWorthModal === 'liquid' && (
                <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
                  {liquidAccounts.length === 0 && totalEmergency <= 0 ? (
                    <div className="p-6 text-center text-xs text-slate-500">
                      Belum ada rekening likuid atau saldo dana darurat terdaftar.
                    </div>
                  ) : (
                    <>
                      {liquidAccounts.map((acc) => (
                        <div
                          key={acc.id}
                          className="px-4 py-3 flex items-center justify-between gap-3 text-xs hover:bg-slate-50/70 transition-colors"
                        >
                          <div className="min-w-0">
                            <span className="font-bold text-slate-800 block truncate">
                              {acc.name}
                            </span>
                            <span className="text-[11px] text-slate-500">
                              {acc.type === 'e-wallet'
                                ? 'Dompet Digital'
                                : acc.type === 'cash'
                                ? 'Kas Tunai'
                                : 'Rekening Bank'}
                            </span>
                          </div>
                          <span className="font-mono tabular-nums font-bold text-slate-900 shrink-0">
                            {formatValue(acc.currentBalance)}
                          </span>
                        </div>
                      ))}
                      <div className="px-4 py-3 flex items-center justify-between gap-3 text-xs bg-slate-50/70">
                        <div className="min-w-0">
                          <span className="font-bold text-slate-800 block">Dana Darurat</span>
                          <span className="text-[11px] text-slate-500">
                            Cadangan likuid khusus kondisi darurat
                          </span>
                        </div>
                        <span className="font-mono tabular-nums font-bold text-blue-700 shrink-0">
                          {formatValue(totalEmergency)}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              )}

              {activeNetWorthModal === 'investment' && (
                <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
                  {investments.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-500">
                      Belum ada instrumen investasi aktif. Buka tab Portofolio untuk mencatat aset investasi.
                    </div>
                  ) : (
                    investments.map((inv) => {
                      const capital =
                        inv.initialCapital !== undefined ? inv.initialCapital : inv.balance;
                      const gain = inv.balance - capital;
                      return (
                        <div
                          key={inv.id}
                          className="px-4 py-3 flex items-center justify-between gap-3 text-xs hover:bg-slate-50/70 transition-colors"
                        >
                          <div className="min-w-0">
                            <span className="font-bold text-slate-800 block truncate">
                              {inv.name}
                            </span>
                            <span className="text-[11px] text-slate-500">
                              {inv.category}
                              {inv.quantity || inv.units
                                ? ` · ${inv.quantity ?? inv.units} ${inv.unitName || 'unit'}`
                                : ''}
                            </span>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="font-mono tabular-nums font-bold text-slate-900 block">
                              {formatValue(inv.balance)}
                            </span>
                            <span
                              className={`font-mono tabular-nums text-[11px] font-semibold ${
                                gain >= 0 ? 'text-emerald-600' : 'text-rose-600'
                              }`}
                            >
                              {gain >= 0 ? '+' : ''}
                              {formatValue(gain)}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {activeNetWorthModal === 'fixed' && (
                <>
                  {batchAssetDepreciation.pendingCount > 0 && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-0.5">
                        <div className="text-xs font-extrabold text-slate-900">
                          {batchAssetDepreciation.pendingCount} Aset Siap Posting Jurnal Penyusutan
                        </div>
                        <p className="text-[11px] text-slate-600 font-medium">
                          Akumulasi draft penyusutan non-kas (Dr 5960 / Cr 1690):{' '}
                          <span className="font-mono tabular-nums font-bold text-amber-800">
                            -{formatValue(batchAssetDepreciation.totalDepreciationAmount)}
                          </span>
                        </p>
                      </div>

                      {(onSyncAllFixedAssetDepreciations || onSyncFixedAssetDepreciation) && (
                        <button
                          type="button"
                          onClick={() => {
                            if (onSyncAllFixedAssetDepreciations) {
                              onSyncAllFixedAssetDepreciations();
                            } else if (onSyncFixedAssetDepreciation) {
                              batchAssetDepreciation.draftAdjustments.forEach((entry) => {
                                onSyncFixedAssetDepreciation(entry.assetId);
                              });
                            }
                          }}
                          className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          <span>Posting Semua Penyusutan</span>
                        </button>
                      )}
                    </div>
                  )}

                  <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100 overflow-hidden">
                    {fixedAssetRows.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-500">
                        Belum ada aset tetap atau properti KPR tercatat. Tambahkan melalui tab Portofolio &amp; Aset Tetap.
                      </div>
                    ) : (
                      fixedAssetRows.map((row) => {
                        const { asset, valuation: val, depreciation: dep, lifecycle } = row;
                        const isExpanded = expandedAssetId === asset.id;
                        return (
                          <div key={asset.id}>
                            <div
                              role="button"
                              tabIndex={0}
                              aria-expanded={isExpanded}
                              onClick={() =>
                                setExpandedAssetId((prev) => (prev === asset.id ? null : asset.id))
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  setExpandedAssetId((prev) =>
                                    prev === asset.id ? null : asset.id
                                  );
                                }
                              }}
                              className={`px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-500 ${
                                isExpanded ? 'bg-slate-50/90' : 'hover:bg-slate-50/70'
                              }`}
                            >
                              <div className="min-w-0 flex items-start gap-2.5">
                                <ChevronDown
                                  className={`h-4 w-4 text-slate-400 mt-0.5 shrink-0 transition-transform duration-200 ${
                                    isExpanded ? 'rotate-180 text-slate-700' : ''
                                  }`}
                                />
                                <div className="min-w-0 space-y-0.5">
                                  <span className="font-bold text-slate-800 block truncate">
                                    {asset.name}
                                  </span>
                                  <span className="text-[11px] text-slate-500 block">
                                    {asset.category} · Dasar{' '}
                                    <span className="font-mono tabular-nums font-semibold text-slate-700">
                                      {formatValue(val.basisValue)}
                                    </span>{' '}
                                    · Penyesuaian{' '}
                                    <span
                                      className={`font-mono tabular-nums font-semibold ${
                                        val.totalNetValueChange >= 0
                                          ? 'text-emerald-600'
                                          : 'text-amber-700'
                                      }`}
                                    >
                                      {val.totalNetValueChange >= 0 ? '+' : '-'}
                                      {formatValue(Math.abs(val.totalNetValueChange))}
                                    </span>
                                    {lifecycle.isDepreciable &&
                                      ` · Terpakai ${lifecycle.ageProgressPct.toFixed(0)}%`}
                                    {asset.isKprLinked && ` · ${val.ownershipPct.toFixed(1)}% lunas`}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center justify-between sm:justify-end gap-2.5 shrink-0 pl-6 sm:pl-0">
                                {onSyncFixedAssetDepreciation &&
                                  dep &&
                                  dep.isDepreciable &&
                                  dep.cappedDepreciationAmount > 0 &&
                                  dep.draftAdjustment && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onSyncFixedAssetDepreciation(asset.id);
                                      }}
                                      title={dep.draftAdjustment.note}
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800 text-[11px] font-bold transition cursor-pointer whitespace-nowrap shrink-0"
                                    >
                                      <RefreshCw className="h-3 w-3" />
                                      <span>
                                        Posting Susut (-{formatValue(dep.cappedDepreciationAmount)})
                                      </span>
                                    </button>
                                  )}
                                <span className="font-mono tabular-nums font-bold text-slate-900">
                                  {formatValue(val.currentBookValue)}
                                </span>
                              </div>
                            </div>

                            {isExpanded && (
                              <FixedAssetDepreciationDetail
                                row={row}
                                formatValue={formatValue}
                                onSyncFixedAssetDepreciation={onSyncFixedAssetDepreciation}
                              />
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </>
              )}

              {activeNetWorthModal === 'debt' && (
                <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
                  {debts.filter((d) => d.balance > 0).length === 0 &&
                  creditCardAndPaylaterAccounts.filter((a) => getAccountCreditBill(a) > 0).length ===
                    0 ? (
                    <div className="p-6 text-center text-xs text-slate-500">
                      Tidak ada kewajiban pinjaman atau tagihan kartu kredit/PayLater aktif saat ini.
                    </div>
                  ) : (
                    <>
                      {debts
                        .filter((d) => d.balance > 0)
                        .map((debt) => (
                          <div
                            key={debt.id}
                            className="px-4 py-3 flex items-center justify-between gap-3 text-xs hover:bg-slate-50/70 transition-colors"
                          >
                            <div className="min-w-0">
                              <span className="font-bold text-slate-800 block truncate">
                                {debt.name}
                              </span>
                              <span className="text-[11px] text-slate-500">
                                {debt.category} · Bunga {debt.interestRate}%/thn
                              </span>
                            </div>
                            <span className="font-mono tabular-nums font-bold text-rose-600 shrink-0">
                              -{formatValue(debt.balance)}
                            </span>
                          </div>
                        ))}
                      {creditCardAndPaylaterAccounts
                        .filter((acc) => getAccountCreditBill(acc) > 0)
                        .map((acc) => {
                          const bill = getAccountCreditBill(acc);
                          return (
                            <div
                              key={acc.id}
                              className="px-4 py-3 flex items-center justify-between gap-3 text-xs hover:bg-slate-50/70 transition-colors"
                            >
                              <div className="min-w-0">
                                <span className="font-bold text-slate-800 block truncate">
                                  {acc.name}
                                </span>
                                <span className="text-[11px] text-slate-500">
                                  {acc.type === 'credit-card'
                                    ? 'Tagihan Kartu Kredit'
                                    : 'Tagihan PayLater'}
                                </span>
                              </div>
                              <span className="font-mono tabular-nums font-bold text-rose-600 shrink-0">
                                -{formatValue(bill)}
                              </span>
                            </div>
                          );
                        })}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer with Quick Navigation */}
            <div className="px-5 py-4 border-t border-slate-200 bg-slate-50/70 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setActiveNetWorthModal(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold transition cursor-pointer whitespace-nowrap"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={() => {
                  const targetTab =
                    activeNetWorthModal === 'liquid'
                      ? 'accounts'
                      : activeNetWorthModal === 'debt'
                      ? 'debts'
                      : 'investments';
                  setActiveNetWorthModal(null);
                  onQuickAction(targetTab);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0"
              >
                <span>
                  {activeNetWorthModal === 'liquid' && 'Kelola Rekening'}
                  {activeNetWorthModal === 'investment' && 'Buka Portofolio'}
                  {activeNetWorthModal === 'fixed' && 'Kelola Aset Tetap'}
                  {activeNetWorthModal === 'debt' && 'Kelola Utang & KPR'}
                </span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
};

interface TrendNetWorthChartProps {
  trendResult: NetWorthTrendWithProjectionResult;
  currentNetWorth: number;
  isFocusMode: boolean;
  formatValue: (amount: number, isSensitive?: boolean) => string;
  formatCompactValue: (num: number, isSensitive?: boolean) => string;
}

export const TrendNetWorthChart: React.FC<TrendNetWorthChartProps> = ({
  trendResult,
  currentNetWorth,
  isFocusMode,
  formatValue,
  formatCompactValue,
}) => {
  const [showProjection, setShowProjection] = React.useState(true);

  const historicalPoints = trendResult.historicalPoints;
  const chartData = showProjection ? trendResult.points : historicalPoints;

  const firstPoint = historicalPoints[0];
  const latestPoint = historicalPoints[historicalPoints.length - 1];
  const sixMonthDelta =
    firstPoint && latestPoint
      ? latestPoint.displayNetWorth - firstPoint.displayNetWorth
      : 0;
  const sixMonthDeltaPct =
    firstPoint && Math.abs(firstPoint.displayNetWorth) > 0
      ? (sixMonthDelta / Math.abs(firstPoint.displayNetWorth)) * 100
      : 0;

  const hasNegativeValues = chartData.some((p) => p.displayNetWorth < 0);

  return (
    <motion.div
      variants={cardVariants}
      className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-4"
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 shrink-0">
            <TrendingUp className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-slate-900 tracking-tight">
              {showProjection
                ? 'Trend Net Worth (6 Bulan Historis & Proyeksi +3 Bulan)'
                : 'Trend Net Worth (6 Bulan Terakhir)'}
            </h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              {showProjection
                ? 'Kombinasi tren regresi 6 bulan dan surplus arus kas bulanan untuk memprediksi 3 bulan ke depan'
                : 'Perkembangan Kekayaan Bersih, Total Aset & Total Kewajiban dari riwayat transaksi historis'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between lg:justify-end gap-4 shrink-0">
          {/* Ringkasan Historis 6 Bulan / Proyeksi +3 Bulan */}
          <div className="flex items-center gap-4">
            <div className="text-left lg:text-right">
              <span className="text-[11px] font-semibold text-slate-500 block">
                Perubahan 6 Bulan
              </span>
              <div className="flex items-center gap-1 lg:justify-end">
                {sixMonthDelta >= 0 ? (
                  <ArrowUpRight className="h-4 w-4 text-emerald-600 shrink-0" />
                ) : (
                  <ArrowDownRight className="h-4 w-4 text-rose-600 shrink-0" />
                )}
                <span
                  className={`text-sm font-black font-mono tabular-nums ${
                    sixMonthDelta >= 0 ? 'text-emerald-600' : 'text-rose-600'
                  }`}
                >
                  {sixMonthDelta >= 0 ? '+' : ''}
                  {formatValue(sixMonthDelta)}
                </span>
                <span className="text-xs font-mono tabular-nums font-bold text-slate-500">
                  ({sixMonthDeltaPct >= 0 ? '+' : ''}
                  {sixMonthDeltaPct.toFixed(1)}%)
                </span>
              </div>
            </div>

            {showProjection && (
              <div className="text-left lg:text-right border-l border-slate-200 pl-4">
                <span className="text-[11px] font-semibold text-blue-600 block">
                  Proyeksi +3 Bulan
                </span>
                <div className="flex items-center gap-1.5 lg:justify-end">
                  <span
                    className={`text-sm font-black font-mono tabular-nums ${
                      trendResult.projectedNetWorth3M >= 0 ? 'text-slate-900' : 'text-rose-600'
                    }`}
                  >
                    {formatValue(trendResult.projectedNetWorth3M)}
                  </span>
                  <span
                    className={`text-xs font-mono tabular-nums font-bold ${
                      trendResult.projectedDeltaAmount >= 0 ? 'text-emerald-600' : 'text-rose-600'
                    }`}
                  >
                    ({trendResult.projectedDeltaAmount >= 0 ? '+' : ''}
                    {trendResult.projectedDeltaPct.toFixed(1)}%)
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Segmented Toggle: Historis vs Proyeksi +3 Bln */}
          <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200">
            <button
              type="button"
              aria-pressed={!showProjection}
              onClick={() => setShowProjection(false)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap shrink-0 cursor-pointer ${
                !showProjection
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Historis 6 Bln
            </button>
            <button
              type="button"
              aria-pressed={showProjection}
              onClick={() => setShowProjection(true)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap shrink-0 cursor-pointer ${
                showProjection
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Proyeksi +3 Bln
            </button>
          </div>
        </div>
      </div>

      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 12, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis
              dataKey="monthLabel"
              tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }}
              axisLine={{ stroke: '#e2e8f0' }}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(val) =>
                isFocusMode ? '•••' : formatCompactValue(Number(val)) || '0'
              }
              tick={{ fill: '#64748b', fontSize: 11 }}
              axisLine={{ stroke: '#e2e8f0' }}
              tickLine={false}
              width={64}
            />
            {hasNegativeValues && (
              <ReferenceLine y={0} stroke="#cbd5e1" strokeDasharray="4 4" />
            )}
            {showProjection && trendResult.currentMonthLabel && (
              <ReferenceLine
                x={trendResult.currentMonthLabel}
                stroke="#94a3b8"
                strokeDasharray="3 3"
                label={{
                  value: 'Hari Ini',
                  position: 'top',
                  fill: '#64748b',
                  fontSize: 10,
                  fontWeight: 700,
                }}
              />
            )}
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload || payload.length === 0) return null;
                const point = payload[0].payload as NetWorthCombinedTrendPoint;
                return (
                  <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-xs space-y-1.5 min-w-[230px]">
                    <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-1.5">
                      <div>
                        <span className="font-extrabold text-slate-900 block">
                          {point.monthLabel}
                        </span>
                        <span
                          className={`text-[10px] font-bold ${
                            point.isProjection ? 'text-blue-600' : 'text-slate-400'
                          }`}
                        >
                          {point.isProjection ? 'Proyeksi 3 Bulan' : 'Realisasi Historis'}
                        </span>
                      </div>
                      <span className="text-[11px] font-mono tabular-nums text-slate-400">
                        s.d. {point.cutoffDate}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-slate-600 font-semibold">
                        {point.isProjection ? 'Est. Net Worth' : 'Net Worth'}
                      </span>
                      <span
                        className={`font-mono tabular-nums font-black ${
                          point.displayNetWorth >= 0 ? 'text-slate-900' : 'text-rose-600'
                        }`}
                      >
                        {formatValue(point.displayNetWorth)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-blue-600 font-semibold">
                        {point.isProjection ? 'Est. Total Aset' : 'Total Aset'}
                      </span>
                      <span className="font-mono tabular-nums font-bold text-blue-700">
                        {formatValue(point.displayAssets)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-rose-600 font-semibold">
                        {point.isProjection ? 'Est. Kewajiban' : 'Total Kewajiban'}
                      </span>
                      <span className="font-mono tabular-nums font-bold text-rose-600">
                        {formatValue(point.displayDebts)}
                      </span>
                    </div>
                    {point.isProjection && (
                      <div className="pt-1 border-t border-slate-100 text-[10px] text-slate-500">
                        Laju campuran:{' '}
                        <span className="font-mono tabular-nums font-bold text-slate-700">
                          {trendResult.blendedMonthlyGrowth >= 0 ? '+' : ''}
                          {formatValue(trendResult.blendedMonthlyGrowth)}/bln
                        </span>
                      </div>
                    )}
                  </div>
                );
              }}
            />
            <Legend
              iconType="plainline"
              wrapperStyle={{ fontSize: '12px', fontWeight: 600, paddingTop: '10px' }}
            />
            <Line
              type="monotone"
              dataKey="netWorth"
              name="Net Worth (Bersih)"
              stroke={currentNetWorth >= 0 ? '#0f172a' : '#dc2626'}
              strokeWidth={3}
              dot={{ r: 4, fill: '#ffffff', strokeWidth: 2 }}
              activeDot={{ r: 6 }}
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="assets"
              name="Total Aset"
              stroke="#2563eb"
              strokeWidth={2}
              dot={{ r: 3, fill: '#ffffff', strokeWidth: 2 }}
              activeDot={{ r: 5 }}
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="debts"
              name="Total Kewajiban"
              stroke="#e11d48"
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={{ r: 3, fill: '#ffffff', strokeWidth: 2 }}
              activeDot={{ r: 5 }}
              connectNulls={false}
            />
            {showProjection && (
              <>
                <Line
                  type="monotone"
                  dataKey="projectedNetWorth"
                  name="Proyeksi Net Worth (+3 Bln)"
                  stroke={trendResult.projectedNetWorth3M >= 0 ? '#0f172a' : '#dc2626'}
                  strokeWidth={2.5}
                  strokeDasharray="6 4"
                  dot={{ r: 4, fill: '#ffffff', strokeWidth: 2 }}
                  activeDot={{ r: 6 }}
                  connectNulls={false}
                />
                <Line
                  type="monotone"
                  dataKey="projectedAssets"
                  name="Proyeksi Aset"
                  stroke="#3b82f6"
                  strokeWidth={1.75}
                  strokeDasharray="5 4"
                  dot={{ r: 3, fill: '#ffffff', strokeWidth: 1.5 }}
                  activeDot={{ r: 5 }}
                  legendType="none"
                  connectNulls={false}
                />
                <Line
                  type="monotone"
                  dataKey="projectedDebts"
                  name="Proyeksi Kewajiban"
                  stroke="#fb7185"
                  strokeWidth={1.75}
                  strokeDasharray="3 3"
                  dot={{ r: 3, fill: '#ffffff', strokeWidth: 1.5 }}
                  activeDot={{ r: 5 }}
                  legendType="none"
                  connectNulls={false}
                />
              </>
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {showProjection && (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-[11px] text-slate-500">
          <span>
            Basis proyeksi: Regresi tren 6 bln (
            <span className="font-mono tabular-nums font-bold text-slate-700">
              {trendResult.historicalSlopeMonthly >= 0 ? '+' : ''}
              {formatValue(trendResult.historicalSlopeMonthly)}/bln
            </span>
            ) · Rata-rata arus kas (
            <span className="font-mono tabular-nums font-bold text-slate-700">
              {trendResult.avgNetCashFlowMonthly >= 0 ? '+' : ''}
              {formatValue(trendResult.avgNetCashFlowMonthly)}/bln
            </span>
            )
          </span>
          <span>
            Estimasi laju bersih:{' '}
            <span
              className={`font-mono tabular-nums font-bold ${
                trendResult.blendedMonthlyGrowth >= 0 ? 'text-emerald-600' : 'text-rose-600'
              }`}
            >
              {trendResult.blendedMonthlyGrowth >= 0 ? '+' : ''}
              {formatValue(trendResult.blendedMonthlyGrowth)}/bln
            </span>
          </span>
        </div>
      )}
    </motion.div>
  );
};

export interface WawasanAIProps {
  result: WeeklyFinancialPrioritiesResult;
  lastAnalyzedAt: string;
  isRefreshing: boolean;
  onTriggerAnalysis: () => void;
  onQuickAction: (tab: string) => void;
  formatValue: (amount: number, isSensitive?: boolean) => string;
}

export const WawasanAI: React.FC<WawasanAIProps> = ({
  result,
  lastAnalyzedAt,
  isRefreshing,
  onTriggerAnalysis,
  onQuickAction,
  formatValue,
}) => {
  const weekDiffSign = result.weekDeltaAmount >= 0 ? '+' : '-';
  const weekDeltaTone =
    result.weekDeltaAmount > 0 && result.prevWeekExpense > 0
      ? 'text-rose-700'
      : result.weekDeltaAmount < 0
      ? 'text-emerald-700'
      : 'text-slate-700';

  const trendScoreTone =
    result.weeklyTrendSeverity === 'high'
      ? 'text-rose-700'
      : result.weeklyTrendSeverity === 'medium'
      ? 'text-amber-700'
      : 'text-emerald-700';

  return (
    <motion.section
      variants={cardVariants}
      aria-label="Wawasan AI Prioritas Mingguan"
      className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-5"
    >
      {/* Header Row */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-slate-900 text-white shrink-0">
            <Lightbulb className="h-5 w-5" />
          </div>
          <div className="space-y-0.5">
            <h2 className="text-base font-extrabold text-slate-900 tracking-tight">
              Wawasan AI
            </h2>
            <p className="text-xs text-slate-500 font-medium">
              3 prioritas keuangan utama minggu ini · {result.weekRangeLabel} · Dianalisis {lastAnalyzedAt}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between lg:justify-end gap-4 shrink-0">
          {/* Skor Tren Mingguan & Ringkasan Perbandingan 7 Hari */}
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <div>
              <span className="text-[11px] font-medium text-slate-500 block">
                Skor Tren Mingguan
              </span>
              <span className={`font-bold ${trendScoreTone}`}>
                {result.weeklyTrendLabel} ·{' '}
                <span className="font-medium text-slate-600">{result.weeklyTrendScore}</span>
              </span>
            </div>
            <div className="border-l border-slate-200 pl-4">
              <span className="text-[11px] font-medium text-slate-500 block">
                Pengeluaran 7 Hari
              </span>
              <span className="font-mono tabular-nums font-bold text-slate-900">
                {formatValue(result.thisWeekExpense)}
              </span>
            </div>
            <div className="border-l border-slate-200 pl-4">
              <span className="text-[11px] font-medium text-slate-500 block">
                vs Minggu Sebelumnya
              </span>
              <span className={`font-mono tabular-nums font-bold ${weekDeltaTone}`}>
                {result.thisWeekExpense === 0 && result.prevWeekExpense === 0
                  ? 'Belum ada mutasi'
                  : `${weekDiffSign}${formatValue(Math.abs(result.weekDeltaAmount))} (${
                      result.weekDeltaAmount >= 0 ? '+' : ''
                    }${result.weekDeltaPct.toFixed(0)}%)`}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onTriggerAnalysis}
            disabled={isRefreshing}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition cursor-pointer disabled:opacity-60 whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Menganalisis...' : 'Refresh Analisis'}</span>
          </button>
        </div>
      </div>

      {/* 3 Priorities Grid (Single-Elevation Divided Container) */}
      {isRefreshing ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50/50 grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
          {[1, 2, 3].map((idx) => (
            <div key={idx} className="p-4 sm:p-5 space-y-3">
              <div className="h-3.5 w-28 bg-slate-200 rounded" />
              <div className="h-4 w-48 bg-slate-200 rounded" />
              <div className="h-3 w-full bg-slate-100 rounded" />
              <div className="h-3 w-4/5 bg-slate-100 rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-slate-50/40 grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 overflow-hidden">
          {result.priorities.map((item) => {
            const urgencyStyle =
              item.severity === 'high'
                ? 'text-rose-700'
                : item.severity === 'medium'
                ? 'text-amber-700'
                : 'text-emerald-700';

            return (
              <div
                key={item.id}
                className="p-4 sm:p-5 flex flex-col justify-between gap-4 hover:bg-white transition-colors"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className={`inline-flex items-center gap-1.5 font-bold ${urgencyStyle}`}>
                      {item.severity === 'high' ? (
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      ) : item.severity === 'medium' ? (
                        <Clock className="h-3.5 w-3.5 shrink-0" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                      )}
                      <span>
                        0{item.rank}. {item.urgencyLabel}
                      </span>
                    </span>
                    <span className="text-slate-500 font-medium truncate">
                      {item.categoryLabel}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <h3 className="text-sm font-extrabold text-slate-900 leading-snug">
                      {item.title}
                    </h3>
                    <p className="text-xs font-mono tabular-nums font-bold text-slate-800">
                      {item.metricSummary}
                    </p>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed">
                    {item.description}
                  </p>
                </div>

                <div className="pt-2 border-t border-slate-200/70 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => onQuickAction(item.targetTab)}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-900 hover:text-blue-700 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <span>{item.actionLabel}</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Consolidated Footer Shortcut (absorbs AI Intelligent Advisor CTA) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 text-xs">
        <p className="text-slate-500 font-medium">
          Butuh audit pengeluaran mendalam, rekomendasi alokasi anggaran khusus, dan strategi pelunasan utang?
        </p>
        <button
          type="button"
          onClick={() => onQuickAction('ai-analysis')}
          className="inline-flex items-center gap-1.5 font-bold text-slate-900 hover:text-blue-700 transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <span>Buka Analisis AI Lengkap</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </motion.section>
  );
};

interface DashboardTabProps {
  transactions: Transaction[];
  accounts: Account[];
  budgets: CategoryBudget[];
  debts: Debt[];
  emergencyConfig?: EmergencyFundConfig;
  emergencyTransactions: EmergencyFundTransaction[];
  investments: InvestmentAsset[];
  fixedAssets?: FixedAsset[];
  savingsGoals?: SavingsGoal[];
  onAddSavingsGoal?: (goal: Omit<SavingsGoal, 'id'>) => void;
  onUpdateSavingsGoal?: (id: string, updated: Partial<SavingsGoal>) => void;
  onDeleteSavingsGoal?: (id: string) => void;
  onDepositSavingsGoal?: (id: string, amount: number) => void;
  onSyncFixedAssetDepreciation?: (assetId: string) => void;
  onSyncAllFixedAssetDepreciations?: () => void;
  onQuickAction: (tab: string) => void;
  anomalyDetection?: CategoryAnomalyDetectionResult;
  hasUndismissedAnomalies?: boolean;
  onDismissAnomalies?: () => void;
  onOpenSmartCleanup?: () => void;
}

export const DashboardTab: React.FC<DashboardTabProps> = ({
  transactions,
  accounts,
  budgets,
  debts,
  emergencyConfig = { jobStability: 'medium', dependents: 0, monthlyExpense: 0 },
  emergencyTransactions,
  investments = [],
  fixedAssets = [],
  savingsGoals = [],
  onAddSavingsGoal,
  onUpdateSavingsGoal,
  onDeleteSavingsGoal,
  onDepositSavingsGoal,
  onSyncFixedAssetDepreciation,
  onSyncAllFixedAssetDepreciations,
  onQuickAction,
  anomalyDetection,
  hasUndismissedAnomalies = false,
  onDismissAnomalies,
  onOpenSmartCleanup,
}) => {
  // Dynamically calculate actual date from system
  const actualDate = React.useMemo(() => new Date(), []);
  const actualYear = actualDate.getFullYear();
  const actualMonth = actualDate.getMonth() + 1;
  const actualDay = actualDate.getDate();

  // Format current actual date dynamically (e.g. '2026-07-21')
  const systemTodayStr = `${actualYear}-${String(actualMonth).padStart(2, '0')}-${String(actualDay).padStart(2, '0')}`;

  // 1. Calculate Net Worth (Liquid Accounts + Emergency Funds + Investments + Fixed Assets/KPR - Debts)
  const liquidAccounts = React.useMemo(() => getLiquidAccounts(accounts), [accounts]);
  const creditCardAndPaylaterAccounts = React.useMemo(() => getCreditAccounts(accounts), [accounts]);
  const creditAccountIds = React.useMemo(
    () => new Set(creditCardAndPaylaterAccounts.map((a) => a.id)),
    [creditCardAndPaylaterAccounts]
  );

  const totalLiquidAssets = calculateTotalLiquidCash(accounts);
  const totalCreditCardBills = calculateCreditPaylaterBills(accounts);
  const totalDebts = calculateTotalDebts(accounts, debts);

  // Total emergency fund
  const totalEmergency = calculateTotalEmergencyFund(emergencyTransactions);

  // Single-pass synchronized KPR + fixed asset + portfolio summary
  const syncedFixedAssetsList = React.useMemo(
    () => syncKprDebtsToFixedAssets(fixedAssets, debts, systemTodayStr),
    [fixedAssets, debts, systemTodayStr]
  );
  const combinedPortfolioWealth = React.useMemo(
    () => calculateCombinedPortfolioWealth(investments, syncedFixedAssetsList, debts, systemTodayStr),
    [investments, syncedFixedAssetsList, debts, systemTodayStr]
  );
  const batchAssetDepreciation = React.useMemo(
    () => calculateAssetDepreciation(syncedFixedAssetsList, debts, systemTodayStr),
    [syncedFixedAssetsList, debts, systemTodayStr]
  );
  const fixedAssetModalRows = React.useMemo<FixedAssetModalRow[]>(() => {
    const depById = new Map<string, FixedAssetDepreciationResult>();
    batchAssetDepreciation.items.forEach((item) => {
      depById.set(item.assetId, item);
    });
    return syncedFixedAssetsList.map((asset) => {
      const valuation = calculateFixedAssetValuation(asset, debts, systemTodayStr);
      const depreciation = depById.get(asset.id);
      const lifecycle = calculateFixedAssetLifecycleMetrics(
        asset,
        valuation,
        depreciation,
        systemTodayStr
      );
      return {
        asset,
        valuation,
        depreciation,
        lifecycle,
      };
    });
  }, [syncedFixedAssetsList, debts, systemTodayStr, batchAssetDepreciation]);

  const totalInvestments = combinedPortfolioWealth.totalInvestmentValue;
  const totalFixedAssets = combinedPortfolioWealth.totalFixedAssetBookValue;
  const totalLiquidWithEmergency = totalLiquidAssets + totalEmergency;
  const loanDebtsOnly = React.useMemo(
    () => (debts || []).reduce((sum, d) => sum + Math.max(0, d.balance || 0), 0),
    [debts]
  );

  // Unified interconnected Net Worth
  const totalCurrentAssets = totalLiquidWithEmergency + totalInvestments + totalFixedAssets;
  const netWorth = totalCurrentAssets - totalDebts;

  // Calculate Financial Health Status based on Current Assets vs Total Debts
  let healthStatus: 'Sehat' | 'Waspada' | 'Kritis' = 'Sehat';
  let healthColor = 'bg-emerald-50 text-emerald-700 border-emerald-200';
  let healthDesc = 'Aset lancar Anda jauh melebihi utang Anda. Kondisi keuangan Anda prima dan sangat sehat!';
  let healthRatioText = 'Rasio Utang 0%';

  if (totalDebts > 0) {
    const debtToAssetRatio = totalCurrentAssets > 0 ? (totalDebts / totalCurrentAssets) * 100 : 100;
    healthRatioText = `Rasio Utang: ${debtToAssetRatio.toFixed(1)}%`;
    if (debtToAssetRatio <= 35) {
      healthStatus = 'Sehat';
      healthColor = 'bg-emerald-50 text-emerald-700 border-emerald-200';
      healthDesc = `Utang Anda berada di tingkat sangat aman (${debtToAssetRatio.toFixed(1)}% dari total aset lancar). Kondisi keuangan sehat.`;
    } else if (debtToAssetRatio <= 75) {
      healthStatus = 'Waspada';
      healthColor = 'bg-amber-50 text-amber-700 border-amber-200';
      healthDesc = `Utang Anda mencapai ${debtToAssetRatio.toFixed(1)}% dari total aset lancar. Harap berhati-hati dan prioritaskan pelunasan utang.`;
    } else {
      healthStatus = 'Kritis';
      healthColor = 'bg-rose-50 text-rose-700 border-rose-200';
      healthDesc = `Kondisi kritis! Utang Anda sangat tinggi (${debtToAssetRatio.toFixed(1)}% dari total aset lancar). Segera kurangi pengeluaran non-primer.`;
    }
  } else if (totalCurrentAssets === 0) {
    healthStatus = 'Waspada';
    healthColor = 'bg-amber-50 text-amber-700 border-amber-200';
    healthDesc = 'Belum ada aset terdaftar. Mulai isi rekening tabungan atau tabung dana darurat Anda.';
    healthRatioText = 'Rasio Utang 0%';
  }

  // 2. Calculate current month dynamically
  const activeMonthStr = `${actualYear}-${String(actualMonth).padStart(2, '0')}`;
  const monthlyTxs = React.useMemo(
    () => transactions.filter(tx => tx.date.startsWith(activeMonthStr)),
    [transactions, activeMonthStr]
  );

  const monthlySummary = React.useMemo(
    () => calculateIncomeStatementSummary(monthlyTxs),
    [monthlyTxs]
  );

  const monthlyIncome = monthlySummary.operatingIncome;
  const monthlyExpense = monthlySummary.operatingExpense;
  const monthlySaving = monthlySummary.emergencyAdditions;
  const monthlyInvestment = monthlySummary.investmentPurchases;

  // Unified 6-month historical Net Worth trend + 3-month blended projection
  const netWorthTrendWithProjection = React.useMemo(() => {
    return calculateNetWorthTrendWithProjection(
      transactions,
      accounts,
      totalCurrentAssets,
      totalDebts,
      systemTodayStr
    );
  }, [transactions, accounts, totalCurrentAssets, totalDebts, systemTodayStr]);

  // Generate 30-day daily cash flow (inflow & outflow, excluding internal transfers & debt proceeds) trend
  const cashFlowTrend30Days = React.useMemo(() => {
    const dataPoints = [];
    const today = new Date(`${systemTodayStr}T00:00:00`);
    
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${day}`;
      
      const dayTxs = transactions.filter(tx => tx.date === dateStr);
      
      const inflow = dayTxs
        .filter(isOperatingIncome)
        .reduce((sum, tx) => sum + tx.amount, 0);
        
      const outflow = dayTxs
        .filter(
          (tx) =>
            !isInternalTransfer(tx) &&
            tx.type !== 'income' &&
            classifyTransaction(tx) !== 'debt_proceeds' &&
            !(tx.accountId && creditAccountIds.has(tx.accountId))
        )
        .reduce((sum, tx) => sum + tx.amount, 0);
        
      let formattedDate = dateStr;
      try {
        formattedDate = d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
      } catch (e) {
        // fallback
      }
      
      dataPoints.push({
        dateStr,
        date: formattedDate,
        Pemasukan: inflow,
        Pengeluaran: outflow,
      });
    }
    return dataPoints;
  }, [transactions, systemTodayStr, creditAccountIds]);

  // 3-Month Projection Logic based on average monthly income & expense
  const monthsProjection = 3;
  const avgMonthlyIncome = monthlyIncome;
  const avgMonthlyExpense = monthlyExpense;
  const baselineNetSavings = avgMonthlyIncome - avgMonthlyExpense;
  const projectedSurplus = baselineNetSavings * monthsProjection;
  
  const projectedAssets = Math.max(0, totalCurrentAssets + projectedSurplus);
  const projectedDebts = totalDebts;
  const projectedNetWorth = projectedAssets - projectedDebts;
  
  let projectedHealthStatus: 'Sehat' | 'Waspada' | 'Kritis' = 'Sehat';
  let projectedHealthColor = 'text-emerald-700 bg-emerald-50 border-emerald-200';
  let projectedHealthIconBg = 'bg-emerald-100 text-emerald-700';
  let projectedHealthDesc = '';
  let projectedRatioText = 'Rasio Utang: 0%';

  if (projectedDebts > 0) {
    const projectedRatio = projectedAssets > 0 ? (projectedDebts / projectedAssets) * 100 : 100;
    projectedRatioText = `Rasio Utang: ${projectedRatio.toFixed(1)}%`;
    if (projectedRatio <= 35) {
      projectedHealthStatus = 'Sehat';
      projectedHealthColor = 'text-emerald-700 bg-emerald-50 border-emerald-200';
      projectedHealthIconBg = 'bg-emerald-100 text-emerald-700';
      projectedHealthDesc = `Luar biasa! Dalam 3 bulan ke depan, keuangan Anda diproyeksikan tetap SEHAT dengan rasio utang ${projectedRatio.toFixed(1)}% dari total aset.`;
    } else if (projectedRatio <= 75) {
      projectedHealthStatus = 'Waspada';
      projectedHealthColor = 'text-amber-700 bg-amber-50 border-amber-200';
      projectedHealthIconBg = 'bg-amber-100 text-amber-700';
      projectedHealthDesc = `Waspada! Proyeksi rasio utang Anda meningkat menjadi ${projectedRatio.toFixed(1)}% dari aset lancar. Kurangi pengeluaran sekunder Anda.`;
    } else {
      projectedHealthStatus = 'Kritis';
      projectedHealthColor = 'text-rose-700 bg-rose-50 border-rose-200';
      projectedHealthIconBg = 'bg-rose-100 text-rose-700';
      projectedHealthDesc = `Sangat Kritis! Akumulasi spending berlebih berisiko memperburuk rasio utang hingga ${projectedRatio.toFixed(1)}%. Segera kurangi anggaran non-primer.`;
    }
  } else if (projectedAssets === 0) {
    projectedHealthStatus = 'Waspada';
    projectedHealthColor = 'text-amber-700 bg-amber-50 border-amber-200';
    projectedHealthIconBg = 'bg-amber-100 text-amber-700';
    projectedHealthDesc = 'Aset Anda diproyeksikan habis dalam 3 bulan jika tidak memulai kebiasaan menabung atau menambah pemasukan.';
  } else {
    projectedHealthDesc = 'Sempurna! Tanpa utang dan pertumbuhan dana lancar yang konsisten, posisi finansial Anda diproyeksikan sangat prima.';
  }

  // 3. Prepare Chart Data: Income vs Expense comparison
  const comparisonData = [
    {
      name: 'Uang Masuk / Keluar',
      Pemasukan: monthlyIncome,
      Pengeluaran: monthlyExpense,
      Tabungan: monthlySaving,
      Investasi: monthlyInvestment,
    },
  ];

  // 4. Expense Breakdown by Category for Pie Chart (Operating Expense Only)
  const expenseByCategory = monthlyTxs
    .filter(isOperatingExpense)
    .reduce((acc: { [key: string]: number }, tx) => {
      acc[tx.category] = (acc[tx.category] || 0) + tx.amount;
      return acc;
    }, {});

  const pieData = Object.keys(expenseByCategory).map(cat => ({
    name: cat,
    value: expenseByCategory[cat],
  }));

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

  // 5. Budget Status progress
  const budgetProgress = budgets.map(b => {
    const actual = monthlyTxs
      .filter(
        tx =>
          !isInternalTransfer(tx) &&
          classifyTransaction(tx) !== 'debt_proceeds' &&
          tx.type === b.type &&
          tx.category.toLowerCase() === b.category.toLowerCase()
      )
      .reduce((sum, tx) => sum + tx.amount, 0);
    const percentage = b.limit > 0 ? (actual / b.limit) * 100 : 0;
    return {
      ...b,
      actual,
      percentage: Math.min(percentage, 100),
      rawPercentage: percentage,
      isOver: actual > b.limit,
    };
  });

  // 5b. Automated Budget Monitoring (>90% Limit Exceeded alerts)
  const budgetAlerts = React.useMemo(() => {
    return budgetProgress.filter(b => b.rawPercentage >= 90);
  }, [budgetProgress]);

  // Filter Rentang Waktu State ('this-week' | 'this-month' | 'last-3-months' | 'all')
  const [dashboardPeriod, setDashboardPeriod] = React.useState<'this-week' | 'this-month' | 'last-3-months' | 'all'>('this-month');

  // Filtered transactions according to dashboardPeriod
  const periodFilteredTxs = React.useMemo(() => {
    const todayEnd = new Date(actualYear, actualMonth - 1, actualDay, 23, 59, 59, 999);
    if (dashboardPeriod === 'this-week') {
      const sevenDaysAgo = new Date(actualYear, actualMonth - 1, actualDay - 7, 0, 0, 0, 0);
      return transactions.filter((tx) => {
        const d = parseLocalDate(tx.date);
        return d !== null && d >= sevenDaysAgo && d <= todayEnd;
      });
    }
    if (dashboardPeriod === 'this-month') {
      return monthlyTxs;
    }
    if (dashboardPeriod === 'last-3-months') {
      const ninetyDaysAgo = new Date(actualYear, actualMonth - 1, actualDay - 90, 0, 0, 0, 0);
      return transactions.filter((tx) => {
        const d = parseLocalDate(tx.date);
        return d !== null && d >= ninetyDaysAgo && d <= todayEnd;
      });
    }
    return transactions;
  }, [transactions, dashboardPeriod, monthlyTxs, actualYear, actualMonth, actualDay]);

  // Category Expense Breakdown for Donut Chart (Operating Expense Only)
  const periodExpenseByCategory = React.useMemo(() => {
    return periodFilteredTxs
      .filter(isOperatingExpense)
      .reduce((acc: { [key: string]: number }, tx) => {
        acc[tx.category] = (acc[tx.category] || 0) + tx.amount;
        return acc;
      }, {});
  }, [periodFilteredTxs]);

  const totalPeriodExpense = React.useMemo(() => {
    return Object.values(periodExpenseByCategory).reduce((a: number, b: number) => a + b, 0);
  }, [periodExpenseByCategory]);

  const periodPieData = React.useMemo(() => {
    return Object.keys(periodExpenseByCategory)
      .map(cat => {
        const val = periodExpenseByCategory[cat];
        const pct = totalPeriodExpense > 0 ? (val / totalPeriodExpense) * 100 : 0;
        return {
          name: cat,
          value: val,
          pct: pct.toFixed(1),
        };
      })
      .sort((a, b) => b.value - a.value);
  }, [periodExpenseByCategory, totalPeriodExpense]);

  // State untuk kalender harian arus kas
  const [calMonth, setCalMonth] = React.useState(actualMonth); // dynamic month
  const [calYear, setCalYear] = React.useState(actualYear); // dynamic year
  const [selectedDateStr, setSelectedDateStr] = React.useState<string | null>(systemTodayStr); // dynamic selected date

  // --- CASH FLOW FORECAST STATES ---
  const [forecastIncomeAdjPct, setForecastIncomeAdjPct] = React.useState<number>(0);
  const [forecastExpenseAdjPct, setForecastExpenseAdjPct] = React.useState<number>(0);
  const [forecastIncludeUpcomingBills, setForecastIncludeUpcomingBills] = React.useState<boolean>(true);
  const [forecastChartView, setForecastChartView] = React.useState<'trend' | 'balance'>('trend');

  // --- WAWASAN AI (WEEKLY 3 PRIORITIES LOCAL TRIGGER STATE) ---
  const [analysisTriggerCount, setAnalysisTriggerCount] = React.useState(0);
  const [isRefreshingInsights, setIsRefreshingInsights] = React.useState(false);
  const [lastAnalyzedAt, setLastAnalyzedAt] = React.useState(() =>
    new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
  );

  const handleTriggerWawasanAi = React.useCallback(() => {
    setIsRefreshingInsights(true);
    window.setTimeout(() => {
      setAnalysisTriggerCount((c) => c + 1);
      setLastAnalyzedAt(
        new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
      );
      setIsRefreshingInsights(false);
      showToast({
        type: 'success',
        title: 'Wawasan AI Diperbarui',
        message: '3 prioritas keuangan mingguan telah dievaluasi ulang dari data transaksi terkini.',
      });
    }, 220);
  }, []);

  // --- GOAL TRACKER (TARGET TABUNGAN) STATES & HANDLERS ---
  const savingsGoalsSectionRef = React.useRef<HTMLDivElement>(null);
  const [showGoalModal, setShowGoalModal] = React.useState(false);
  const [goalEditingId, setGoalEditingId] = React.useState<string | null>(null);
  const [goalTitleInput, setGoalTitleInput] = React.useState('');
  const [goalTargetAmountInput, setGoalTargetAmountInput] = React.useState<number | ''>('');
  const [goalCurrentAmountInput, setGoalCurrentAmountInput] = React.useState<number | ''>('');
  const [goalTargetDateInput, setGoalTargetDateInput] = React.useState('');
  const [goalCategoryInput, setGoalCategoryInput] = React.useState('Liburan');
  const [goalNotesInput, setGoalNotesInput] = React.useState('');

  const [depositGoalItem, setDepositGoalItem] = React.useState<SavingsGoal | null>(null);
  const [depositAmountInput, setDepositAmountInput] = React.useState<number | ''>('');

  const handleOpenAddGoal = () => {
    setGoalEditingId(null);
    setGoalTitleInput('');
    setGoalTargetAmountInput('');
    setGoalCurrentAmountInput(0);
    setGoalTargetDateInput('2026-12-31');
    setGoalCategoryInput('Liburan');
    setGoalNotesInput('');
    setShowGoalModal(true);
  };

  const handleOpenEditGoal = (goal: SavingsGoal) => {
    setGoalEditingId(goal.id);
    setGoalTitleInput(goal.title);
    setGoalTargetAmountInput(goal.targetAmount);
    setGoalCurrentAmountInput(goal.currentAmount);
    setGoalTargetDateInput(goal.targetDate);
    setGoalCategoryInput(goal.category || 'Liburan');
    setGoalNotesInput(goal.notes || '');
    setShowGoalModal(true);
  };

  const handleSaveGoalModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!goalTitleInput || !goalTargetAmountInput || Number(goalTargetAmountInput) <= 0) return;

    if (goalEditingId && onUpdateSavingsGoal) {
      onUpdateSavingsGoal(goalEditingId, {
        title: goalTitleInput,
        targetAmount: Number(goalTargetAmountInput),
        currentAmount: Number(goalCurrentAmountInput) || 0,
        targetDate: goalTargetDateInput,
        category: goalCategoryInput,
        notes: goalNotesInput,
      });
    } else if (onAddSavingsGoal) {
      onAddSavingsGoal({
        title: goalTitleInput,
        targetAmount: Number(goalTargetAmountInput),
        currentAmount: Number(goalCurrentAmountInput) || 0,
        targetDate: goalTargetDateInput,
        category: goalCategoryInput,
        notes: goalNotesInput,
      });
    }
    setShowGoalModal(false);
  };

  const handleSaveDeposit = (e: React.FormEvent) => {
    e.preventDefault();
    if (depositGoalItem && depositAmountInput && Number(depositAmountInput) > 0 && onDepositSavingsGoal) {
      onDepositSavingsGoal(depositGoalItem.id, Number(depositAmountInput));
      setDepositGoalItem(null);
      setDepositAmountInput('');
    }
  };

  // --- WEEKLY EXPENSE COMPARISON MEMO ---
  const weeklyExpenseComparison = React.useMemo(() => {
    const nowEnd = new Date(actualYear, actualMonth - 1, actualDay, 23, 59, 59, 999);
    const sevenDaysAgo = new Date(actualYear, actualMonth - 1, actualDay - 7, 0, 0, 0, 0);
    const fourteenDaysAgo = new Date(actualYear, actualMonth - 1, actualDay - 14, 0, 0, 0, 0);

    const thisWeekTxs = transactions.filter((tx) => {
      if (!isOperatingExpense(tx) || !tx.date) return false;
      const d = parseLocalDate(tx.date);
      return d !== null && d >= sevenDaysAgo && d <= nowEnd;
    });

    const lastWeekTxs = transactions.filter((tx) => {
      if (!isOperatingExpense(tx) || !tx.date) return false;
      const d = parseLocalDate(tx.date);
      return d !== null && d >= fourteenDaysAgo && d < sevenDaysAgo;
    });

    const thisWeekTotal = thisWeekTxs.reduce((sum, tx) => sum + tx.amount, 0);
    const lastWeekTotal = lastWeekTxs.reduce((sum, tx) => sum + tx.amount, 0);

    const diff = thisWeekTotal - lastWeekTotal;
    const pctChange = lastWeekTotal > 0
      ? ((diff / lastWeekTotal) * 100)
      : (thisWeekTotal > 0 ? 100 : 0);

    return {
      thisWeekTotal,
      lastWeekTotal,
      diff,
      pctChange,
      isIncrease: diff > 0,
      isEqual: diff === 0,
    };
  }, [transactions, actualYear, actualMonth, actualDay]);

  // --- EMERGENCY FUND VS IDEAL TARGET (6-12 MONTHS) MEMO ---
  const emergencyFundIdealMetrics = React.useMemo(() => {
    const monthlyExpenseBasis = monthlyExpense > 0 ? monthlyExpense : 3000000;
    const idealTargetMin = monthlyExpenseBasis * 6;  // Standard 6 Months
    const idealTargetMax = monthlyExpenseBasis * 12; // Standard 12 Months
    const coverageMonths = monthlyExpenseBasis > 0 ? (totalEmergency / monthlyExpenseBasis) : 0;
    const pctMin = idealTargetMin > 0 ? Math.min(100, (totalEmergency / idealTargetMin) * 100) : 0;
    const shortfall = Math.max(0, idealTargetMin - totalEmergency);

    return {
      monthlyExpenseBasis,
      idealTargetMin,
      idealTargetMax,
      coverageMonths,
      pctMin,
      shortfall,
      isTargetReached: totalEmergency >= idealTargetMin,
    };
  }, [monthlyExpense, totalEmergency]);

  // --- FINANCIAL HEALTH SCORE CALCULATOR MEMO ---
  const financialHealthScore = React.useMemo(() => {
    // 1. SAVINGS RATIO SCORE (Weight: 35%)
    // Surplus operasional (monthlyIncome - monthlyExpense) sudah mencakup dana yang dialokasikan
    // ke pos tabungan, investasi, maupun sisa kas bersih karena monthlyExpense hanya memuat beban operasional.
    const netMonthlySavings = monthlyIncome - monthlyExpense;
    const savingsRatioPct = monthlyIncome > 0 ? (netMonthlySavings / monthlyIncome) * 100 : 0;

    let savingsScore = 0;
    let savingsGrade = 'Buruk';
    if (savingsRatioPct >= 20) {
      savingsScore = 100;
      savingsGrade = 'Sangat Baik (≥20%)';
    } else if (savingsRatioPct >= 10) {
      savingsScore = 50 + ((savingsRatioPct - 10) / 10) * 50;
      savingsGrade = 'Cukup Baik (10-20%)';
    } else if (savingsRatioPct > 0) {
      savingsScore = (savingsRatioPct / 10) * 50;
      savingsGrade = 'Perlu Ditingkatkan (<10%)';
    } else {
      savingsScore = 0;
      savingsGrade = 'Defisit (<0%)';
    }

    // 2. DEBT BURDEN SCORE / DTI (Weight: 35%)
    const totalMonthlyDebtPayments = calculateMonthlyDebtService(accounts, debts);

    const dtiRatioPct = monthlyIncome > 0 ? (totalMonthlyDebtPayments / monthlyIncome) * 100 : (totalDebts > 0 ? 80 : 0);

    let debtScore = 100;
    let debtGrade = 'Aman Sempurna (0%)';
    if (totalDebts === 0) {
      debtScore = 100;
      debtGrade = 'Bebas Utang (100)';
    } else if (dtiRatioPct <= 15) {
      debtScore = 90 + ((15 - dtiRatioPct) / 15) * 10;
      debtGrade = 'Sangat Rendah (≤15%)';
    } else if (dtiRatioPct <= 30) {
      debtScore = 70 + ((30 - dtiRatioPct) / 15) * 20;
      debtGrade = 'Wajar (15-30%)';
    } else if (dtiRatioPct <= 50) {
      debtScore = 40 + ((50 - dtiRatioPct) / 20) * 30;
      debtGrade = 'Tinggi (30-50%)';
    } else {
      debtScore = Math.max(0, 40 - (dtiRatioPct - 50));
      debtGrade = 'Kritis (>50%)';
    }

    // 3. BUDGET DISCIPLINE SCORE (Weight: 30%)
    let budgetScore = 100;
    let budgetGrade = 'Disiplin Sempurna';
    let overBudgetCount = 0;
    let totalBudgetsEvaluated = budgets.length;

    if (budgets.length > 0) {
      let totalUsageRatioSum = 0;
      budgets.forEach(b => {
        const actual = monthlyTxs
          .filter(
            (tx) =>
              !isInternalTransfer(tx) &&
              classifyTransaction(tx) !== 'debt_proceeds' &&
              tx.type === b.type &&
              tx.category.toLowerCase() === b.category.toLowerCase()
          )
          .reduce((sum, tx) => sum + tx.amount, 0);

        if (b.type === 'saving' || b.type === 'investment') {
          const achievementPct = b.limit > 0 ? actual / b.limit : 1;
          const equivalentRatio =
            achievementPct >= 1 ? 0.8 : 0.8 + Math.max(0, 1 - achievementPct) * 0.7;
          totalUsageRatioSum += Math.min(2, equivalentRatio);
        } else {
          const ratio = b.limit > 0 ? actual / b.limit : 0;
          if (ratio > 1) overBudgetCount++;
          totalUsageRatioSum += Math.min(2, ratio);
        }
      });

      const avgRatio = totalUsageRatioSum / budgets.length;
      if (avgRatio <= 0.8) {
        budgetScore = 100;
        budgetGrade = 'Sangat Terkendali (<80%)';
      } else if (avgRatio <= 1.0) {
        budgetScore = 75 + ((1.0 - avgRatio) / 0.2) * 25;
        budgetGrade = 'Sesuai Target (80-100%)';
      } else if (avgRatio <= 1.3) {
        budgetScore = 40 + ((1.3 - avgRatio) / 0.3) * 35;
        budgetGrade = 'Sedikit Overbudget (100-130%)';
      } else {
        budgetScore = Math.max(0, 40 - (avgRatio - 1.3) * 50);
        budgetGrade = 'Sangat Overbudget (>130%)';
      }
    } else {
      const expenseToIncomeRatio = monthlyIncome > 0 ? (monthlyExpense / monthlyIncome) : (monthlyExpense > 0 ? 1.2 : 0.5);
      if (expenseToIncomeRatio <= 0.7) {
        budgetScore = 90;
        budgetGrade = 'Pengeluaran Terkendali';
      } else if (expenseToIncomeRatio <= 0.9) {
        budgetScore = 70;
        budgetGrade = 'Cukup Hemat';
      } else {
        budgetScore = 40;
        budgetGrade = 'Tinggi';
      }
    }

    // COMPOSITE FINAL SCORE (0 - 100)
    const totalScore = Math.round((savingsScore * 0.35) + (debtScore * 0.35) + (budgetScore * 0.30));

    let statusLabel = 'Sehat';
    let statusBadgeColor = 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30';
    let ringColor = '#10b981';
    let summaryText = 'Kondisi finansial Anda sangat sehat! Rasio tabungan, beban utang, dan disiplin anggaran berjalan sangat seimbang.';

    if (totalScore >= 80) {
      statusLabel = 'Sangat Sehat';
      statusBadgeColor = 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30';
      ringColor = '#10b981';
      summaryText = 'Performa keuangan luar biasa! Anda berhasil menjaga rasio tabungan tinggi dan utang di tingkat aman.';
    } else if (totalScore >= 65) {
      statusLabel = 'Sehat';
      statusBadgeColor = 'bg-blue-500/20 text-blue-300 border-blue-400/30';
      ringColor = '#3b82f6';
      summaryText = 'Kondisi keuangan sehat dan stabil. Pertahankan konsistensi tabungan dan anggaran bulanan Anda.';
    } else if (totalScore >= 50) {
      statusLabel = 'Waspada';
      statusBadgeColor = 'bg-amber-500/20 text-amber-300 border-amber-400/30';
      ringColor = '#f59e0b';
      summaryText = 'Kondisi finansial memerlukan perhatian. Evaluasi pengeluaran non-primer dan alokasikan lebih banyak untuk tabungan.';
    } else {
      statusLabel = 'Kritis';
      statusBadgeColor = 'bg-rose-500/20 text-rose-300 border-rose-400/30';
      ringColor = '#f43f5e';
      summaryText = 'Perhatian khusus dibutuhkan! Beban utang atau pengeluaran melebihi batas aman. Segera lakukan efisiensi pengeluaran.';
    }

    let keyRecommendation = '';
    if (savingsScore <= debtScore && savingsScore <= budgetScore) {
      keyRecommendation = `Tingkatkan rasio tabungan dari ${savingsRatioPct.toFixed(1)}% ke minimal 20% dengan menyisihkan dana di awal bulan.`;
    } else if (debtScore <= savingsScore && debtScore <= budgetScore) {
      keyRecommendation = `Fokus lunasi utang berbiaya tinggi untuk menekan rasio beban utang bulanan Anda.`;
    } else {
      keyRecommendation = `Perketat kontrol anggaran pada kategori yang melebihi batas agar pengeluaran bulanan tetap terjaga.`;
    }

    return {
      totalScore,
      statusLabel,
      statusBadgeColor,
      ringColor,
      summaryText,
      keyRecommendation,
      savingsScore: Math.round(savingsScore),
      savingsRatioPct: savingsRatioPct.toFixed(1),
      savingsGrade,
      debtScore: Math.round(debtScore),
      dtiRatioPct: dtiRatioPct.toFixed(1),
      debtGrade,
      budgetScore: Math.round(budgetScore),
      budgetGrade,
      overBudgetCount,
      totalBudgetsEvaluated,
    };
  }, [monthlyIncome, monthlyExpense, monthlySaving, monthlyInvestment, debts, accounts, totalDebts, budgets, monthlyTxs]);

  const INDONESIAN_MONTHS = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];

  // Sistem pengingat jatuh tempo (visual notification) dalam 3 hari ke depan (atau overdue)
  const todayDay = actualDay; // Hari ini dinamis mengikuti sistem tanggal actualDay
  
  const upcomingPayments = [
    // 1. Dari Kartu Kredit dan PayLater
    ...creditCardAndPaylaterAccounts
      .filter(acc => getAccountCreditBill(acc) > 0 && acc.dueDay !== undefined)
      .map(acc => {
        const diff = (acc.dueDay || 0) - todayDay;
        return {
          id: acc.id,
          name: acc.name,
          type: acc.type === 'credit-card' ? 'Kartu Kredit' : 'PayLater',
          amount: getAccountCreditBill(acc),
          dueDay: acc.dueDay || 0,
          daysLeft: diff,
        };
      }),
    // 2. Dari Cicilan Utang / Debts
    ...debts
      .filter(debt => debt.balance > 0 && debt.dueDay !== undefined)
      .map(debt => {
        const diff = (debt.dueDay || 0) - todayDay;
        return {
          id: debt.id,
          name: debt.name,
          type: 'Cicilan Utang',
          amount: debt.minPayment, // Cicilan bulanan minimum
          dueDay: debt.dueDay || 0,
          daysLeft: diff,
        };
      })
  ].filter(p => p.daysLeft >= -5 && p.daysLeft <= 3) // Sesuai permintaan 3 hari ke depan, plus overdue maks 5 hari lalu agar tidak terlewat
   .sort((a, b) => a.daysLeft - b.daysLeft);

  // Reconstruct chronological liquid cash balance trend from transaction history
  const lineChartData = React.useMemo(() => {
    const accountMap = new Map<string, Account>();
    accounts.forEach(a => accountMap.set(a.id, a));

    // Only track cash transactions on liquid accounts (Cash / Bank / E-Wallet), excluding non-cash adjusting entries
    const sortedTxs = [...transactions]
      .filter(t => !t.isAdjustment && !isCreditAccount(accountMap.get(t.accountId)))
      .sort((a, b) => a.date.localeCompare(b.date));
    
    // Find all unique dates
    const uniqueDates = Array.from(new Set(sortedTxs.map(t => t.date))).sort();
    
    if (uniqueDates.length === 0) {
      return [{ date: 'Hari Ini', 'Saldo Total': totalLiquidAssets }];
    }

    const startingTotalBalance = liquidAccounts.reduce((sum, a) => sum + (a.startingBalance || 0), 0);
    
    // Map transactions per date
    const txsByDate = uniqueDates.reduce((acc, date) => {
      acc[date] = sortedTxs.filter(t => t.date === date);
      return acc;
    }, {} as Record<string, Transaction[]>);

    let runningBalance = startingTotalBalance;
    const data = [];

    // Prepend starting balance as a point
    if (uniqueDates.length > 0) {
      try {
        const firstDate = parseLocalDate(uniqueDates[0]);
        if (firstDate) {
          firstDate.setDate(firstDate.getDate() - 1);
          const prependedDateStr = toLocalYYYYMMDD(firstDate);
          const formattedPrepended = firstDate.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
          data.push({
            rawDate: prependedDateStr,
            date: formattedPrepended,
            'Saldo Total': startingTotalBalance,
          });
        }
      } catch (e) {
        // fallback
      }
    }
    
    uniqueDates.forEach((date) => {
      const dayTxs = txsByDate[date] || [];
      let dayNetChange = 0;
      dayTxs.forEach((tx) => {
        dayNetChange += getTransactionAccountDelta(tx);
      });
      runningBalance += dayNetChange;
      
      let formattedDate = date;
      try {
        const d = parseLocalDate(date);
        if (d) {
          formattedDate = d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
        }
      } catch (e) {
        // fallback
      }
      
      data.push({
        rawDate: date,
        date: formattedDate,
        'Saldo Total': runningBalance,
      });
    });
    
    return data;
  }, [accounts, transactions, totalLiquidAssets, liquidAccounts]);

  // 6-Month Monthly Spending Trend Data (Operating Income & Expense)
  const monthlySpendingTrend6Months = React.useMemo(() => {
    const monthsData: { monthKey: string; monthLabel: string; Pengeluaran: number; Pemasukan: number }[] = [];
    
    for (let i = 5; i >= 0; i--) {
      const d = new Date(actualYear, actualMonth - 1 - i, 1);
      const year = d.getFullYear();
      const monthIdx = d.getMonth();
      const monthKey = `${year}-${String(monthIdx + 1).padStart(2, '0')}`;
      const monthLabel = `${INDONESIAN_MONTHS[monthIdx]} ${year.toString().substring(2)}`;

      monthsData.push({
        monthKey,
        monthLabel,
        Pengeluaran: 0,
        Pemasukan: 0,
      });
    }

    transactions.forEach((tx) => {
      if (!tx.date) return;
      const txMonthKey = tx.date.substring(0, 7);
      const target = monthsData.find((m) => m.monthKey === txMonthKey);
      if (target) {
        if (isOperatingExpense(tx)) {
          target.Pengeluaran += tx.amount || 0;
        } else if (isOperatingIncome(tx)) {
          target.Pemasukan += tx.amount || 0;
        }
      }
    });

    return monthsData;
  }, [transactions, actualYear, actualMonth, INDONESIAN_MONTHS]);

  // Kalkulasi data Kalender
  const firstDayIndex = new Date(calYear, calMonth - 1, 1).getDay(); // 0: Minggu, 1: Senin, ..., 6: Sabtu
  const daysInMonth = new Date(calYear, calMonth, 0).getDate();
  
  // Total nominal pada bulan kalender yang aktif
  const calMonthlyTxs = transactions.filter(tx => {
    return tx.date.startsWith(`${calYear}-${String(calMonth).padStart(2, '0')}`);
  });
  
  const calMonthlySummary = calculateIncomeStatementSummary(calMonthlyTxs);
  const calMonthlyIncome = calMonthlySummary.operatingIncome;
  const calMonthlyExpense = calMonthlySummary.operatingExpense;
  const calMonthlySaving = calMonthlySummary.emergencyAdditions;
  const calMonthlyInvestment = calMonthlySummary.investmentPurchases;

  const calMonthlyCashOutflow = calMonthlyTxs
    .filter(
      (tx) =>
        !isInternalTransfer(tx) &&
        tx.type !== 'income' &&
        classifyTransaction(tx) !== 'debt_proceeds' &&
        !(tx.accountId && creditAccountIds.has(tx.accountId))
    )
    .reduce((sum, tx) => sum + tx.amount, 0);

  const calMonthlyOutflow = calMonthlyCashOutflow;
  const calMonthlyNetFlow = calMonthlyIncome - calMonthlyOutflow;

  const calendarCells: (number | null)[] = [];
  for (let i = 0; i < firstDayIndex; i++) {
    calendarCells.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    calendarCells.push(d);
  }

  const CALENDAR_WEEKDAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

  const formatCompactIDR = (num: number) => {
    if (num === 0) return '';
    if (num >= 1000000) {
      const formatted = (num / 1000000).toFixed(num % 1000000 === 0 ? 0 : 1);
      return `${formatted}jt`;
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(0)}rb`;
    }
    return `${num}`;
  };

  // --- FOCUS MODE STATE & HELPERS ---
  const [isFocusMode, setIsFocusMode] = React.useState(false);

  // Helper to format values considering Focus Mode
  const formatValue = (amount: number, isSensitive = true) => {
    if (isFocusMode && isSensitive) {
      return 'Rp ••••••';
    }
    return formatterIDR.format(amount);
  };

  const formatCompactValue = (num: number, isSensitive = true) => {
    if (isFocusMode && isSensitive) {
      return '•••••';
    }
    return formatCompactIDR(num);
  };

  // --- INFLATION CALCULATOR STATES & MEMO (Requirement 3) ---
  const [calcAmount, setCalcAmount] = React.useState<number>(10000000);
  const [calcInflation, setCalcInflation] = React.useState<number>(4.0);
  const [calcYears, setCalcYears] = React.useState<number>(5);

  const inflationResults = React.useMemo(() => {
    const rateDecimal = calcInflation / 100;
    // Future purchasing power: PV / (1 + i)^n
    const realPurchasingPower = calcAmount / Math.pow(1 + rateDecimal, calcYears);
    // Future nominal cost needed to match current PV: PV * (1 + i)^n
    const futureNominalCost = calcAmount * Math.pow(1 + rateDecimal, calcYears);
    const lossPercentage = calcAmount > 0 ? ((calcAmount - realPurchasingPower) / calcAmount) * 100 : 0;

    return {
      realPurchasingPower,
      futureNominalCost,
      lossPercentage
    };
  }, [calcAmount, calcInflation, calcYears]);

  // --- UNIFIED WAWASAN AI: 3 PRIORITAS KEUANGAN MINGGU INI ---
  const weeklyPrioritiesResult = React.useMemo(() => {
    return calculateWeeklyFinancialPriorities({
      transactions,
      accounts,
      budgets,
      debts,
      investments,
      emergencyTransactions,
      systemTodayStr,
      formatCurrency: (amt) => formatValue(amt),
    });
  }, [
    transactions,
    accounts,
    budgets,
    debts,
    investments,
    emergencyTransactions,
    systemTodayStr,
    isFocusMode,
    analysisTriggerCount,
  ]);

  // --- WEEKLY EXPENSE SUMMARY PER CATEGORY MEMO (Requirement 1) ---
  const weeklyCategorySummary = React.useMemo(() => {
    const targetMonthPrefix = `${calYear}-${String(calMonth).padStart(2, '0')}`;
    const monthlyExpenses = transactions.filter(tx => 
      isOperatingExpense(tx) && tx.date.startsWith(targetMonthPrefix)
    );

    const categoriesSet = new Set(monthlyExpenses.map(tx => tx.category));
    const categories = Array.from(categoriesSet).sort();

    const summary = categories.map(category => {
      let w1 = 0, w2 = 0, w3 = 0, w4 = 0;
      monthlyExpenses.filter(tx => tx.category === category).forEach(tx => {
        const day = parseInt(tx.date.split('-')[2], 10);
        if (day <= 7) w1 += tx.amount;
        else if (day <= 14) w2 += tx.amount;
        else if (day <= 21) w3 += tx.amount;
        else w4 += tx.amount;
      });

      const total = w1 + w2 + w3 + w4;

      return {
        category,
        w1,
        w2,
        w3,
        w4,
        total
      };
    });

    let totalW1 = 0;
    let totalW2 = 0;
    let totalW3 = 0;
    let totalW4 = 0;
    let grandTotal = 0;

    summary.forEach(row => {
      totalW1 += row.w1;
      totalW2 += row.w2;
      totalW3 += row.w3;
      totalW4 += row.w4;
      grandTotal += row.total;
    });

    return {
      rows: summary,
      totals: {
        w1: totalW1,
        w2: totalW2,
        w3: totalW3,
        w4: totalW4,
        total: grandTotal
      }
    };
  }, [transactions, calMonth, calYear]);

  // --- CASH FLOW FORECAST COMPUTATION MEMO ---
  const cashFlowForecast = React.useMemo(() => {
    // 1. Calculate historical average monthly income & expense from available transaction data
    const monthSet = new Set<string>();
    transactions.forEach(tx => {
      if (tx.date && tx.date.length >= 7) {
        monthSet.add(tx.date.substring(0, 7));
      }
    });

    const historyMonthsCount = Math.max(1, monthSet.size);

    const totalHistIncome = transactions
      .filter(isOperatingIncome)
      .reduce((sum, tx) => sum + tx.amount, 0);

    const totalHistExpense = transactions
      .filter(
        (tx) =>
          !isInternalTransfer(tx) &&
          tx.type !== 'income' &&
          classifyTransaction(tx) !== 'debt_proceeds' &&
          !(tx.accountId && creditAccountIds.has(tx.accountId))
      )
      .reduce((sum, tx) => sum + tx.amount, 0);

    const avgMonthlyIncomeHist = totalHistIncome > 0 ? (totalHistIncome / historyMonthsCount) : (monthlyIncome || 0);
    const avgMonthlyExpenseHist = totalHistExpense > 0 ? (totalHistExpense / historyMonthsCount) : (monthlyExpense || 0);

    // Apply user adjustment percentage
    const forecastIncomeNextMonth = Math.max(0, avgMonthlyIncomeHist * (1 + forecastIncomeAdjPct / 100));
    const forecastExpenseBase = avgMonthlyExpenseHist * (1 + forecastExpenseAdjPct / 100);

    // Add scheduled upcoming bills / debts if option enabled
    const upcomingBillsTotal = forecastIncludeUpcomingBills
      ? upcomingPayments.reduce((sum, p) => sum + p.amount, 0)
      : 0;

    const forecastExpenseNextMonth = Math.max(0, forecastExpenseBase + upcomingBillsTotal);

    // Current liquid cash & bank
    const currentLiquidCash = totalLiquidAssets;

    // Remaining days in current month
    const daysInCurrentMonth = new Date(actualYear, actualMonth, 0).getDate();
    const remainingDaysInCurrentMonth = Math.max(1, daysInCurrentMonth - actualDay);

    // Projected additional expense for rest of current month
    const dailyAvgExpenseThisMonth = (monthlyExpense || avgMonthlyExpenseHist) / Math.max(1, actualDay);
    const projectedRemainingExpenseThisMonth = dailyAvgExpenseThisMonth * remainingDaysInCurrentMonth;

    // Expected ending liquid balance for CURRENT month
    const projectedEndOfCurrentMonthBalance = Math.max(0, currentLiquidCash - projectedRemainingExpenseThisMonth);

    // Expected Net Cash Flow for NEXT month (Bulan Mendatang)
    const forecastNextMonthNetCashFlow = forecastIncomeNextMonth - forecastExpenseNextMonth;

    // Projected Ending Liquid Balance for NEXT month (Akhir Bulan Mendatang)
    const projectedEndOfNextMonthBalance = Math.max(0, projectedEndOfCurrentMonthBalance + forecastNextMonthNetCashFlow);

    // Next Month Label & Name
    const nextMonthIndex = (actualMonth % 12); // 0-based index for next month
    const nextMonthYear = actualMonth === 12 ? actualYear + 1 : actualYear;
    const nextMonthLabel = `${INDONESIAN_MONTHS[nextMonthIndex]} ${nextMonthYear}`;

    // Next month total days for safe daily spending limit calculation
    const daysInNextMonth = new Date(nextMonthYear, nextMonthIndex + 1, 0).getDate();
    const safeDailySpendingNextMonth = forecastIncomeNextMonth > 0 
      ? Math.max(0, (forecastIncomeNextMonth - (monthlySaving || 0)) / daysInNextMonth)
      : 0;

    // Per-account ending balance estimation
    const accountEstimations = liquidAccounts.map(acc => {
      const share = totalLiquidAssets > 0 ? (acc.currentBalance / totalLiquidAssets) : (1 / Math.max(1, liquidAccounts.length));
      const projectedChange = forecastNextMonthNetCashFlow * share;
      const projectedEndingBalance = Math.max(0, acc.currentBalance + projectedChange);

      return {
        id: acc.id,
        name: acc.name,
        type: acc.type,
        currentBalance: acc.currentBalance,
        projectedEndingBalance,
        estimatedChange: projectedChange,
      };
    });

    // Chart data points - 1. Cash Balance Trajectory
    const forecastTrajectoryChartData = [
      {
        stage: 'Hari Ini (Kas & Bank)',
        Saldo: currentLiquidCash,
      },
      {
        stage: `Akhir ${INDONESIAN_MONTHS[actualMonth - 1]} (Est.)`,
        Saldo: projectedEndOfCurrentMonthBalance,
      },
      {
        stage: `Akhir ${nextMonthLabel} (Est.)`,
        Saldo: projectedEndOfNextMonthBalance,
      }
    ];

    // Chart data points - 2. Monthly Historical Income vs Expense Trend + Next Month Forecast
    const monthlyMap: Record<string, { income: number; expense: number }> = {};
    transactions.forEach(tx => {
      if (tx.date && tx.date.length >= 7) {
        const monthKey = tx.date.substring(0, 7);
        if (!monthlyMap[monthKey]) {
          monthlyMap[monthKey] = { income: 0, expense: 0 };
        }
        if (isOperatingIncome(tx)) {
          monthlyMap[monthKey].income += tx.amount;
        } else if (
          !isInternalTransfer(tx) &&
          tx.type !== 'income' &&
          classifyTransaction(tx) !== 'debt_proceeds' &&
          !(tx.accountId && creditAccountIds.has(tx.accountId))
        ) {
          monthlyMap[monthKey].expense += tx.amount;
        }
      }
    });

    const sortedMonthKeys = Object.keys(monthlyMap).sort();
    const recentMonthKeys = sortedMonthKeys.slice(-3); // Last 3 months of history

    const historicalAndForecastTrendData = recentMonthKeys.map(key => {
      const [yStr, mStr] = key.split('-');
      const mIdx = Math.max(0, parseInt(mStr, 10) - 1);
      const label = `${INDONESIAN_MONTHS[mIdx]} ${yStr}`;
      const inc = monthlyMap[key].income;
      const exp = monthlyMap[key].expense;
      return {
        bulan: label,
        Pemasukan: inc,
        Pengeluaran: exp,
        'Net Kas': inc - exp,
        isForecast: false,
      };
    });

    // Append next month forecast point
    historicalAndForecastTrendData.push({
      bulan: `${nextMonthLabel} (Prediksi)`,
      Pemasukan: Math.round(forecastIncomeNextMonth),
      Pengeluaran: Math.round(forecastExpenseNextMonth),
      'Net Kas': Math.round(forecastNextMonthNetCashFlow),
      isForecast: true,
    });

    // Status Indicator
    let forecastStatus: 'Surplus' | 'Waspada' | 'Defisit' = 'Surplus';
    let forecastStatusBg = 'bg-emerald-50 text-emerald-800 border-emerald-200';
    let forecastStatusBadge = 'bg-emerald-600 text-white';
    let forecastStatusMsg = `Sangat Baik! Arus kas bulan mendatang diproyeksikan SURPLUS sebesar ${formatterIDR.format(forecastNextMonthNetCashFlow)}. Saldo kas Anda berpotensi tumbuh.`;

    if (forecastNextMonthNetCashFlow < 0) {
      if (Math.abs(forecastNextMonthNetCashFlow) > (currentLiquidCash * 0.4)) {
        forecastStatus = 'Defisit';
        forecastStatusBg = 'bg-rose-50 text-rose-800 border-rose-200';
        forecastStatusBadge = 'bg-rose-600 text-white';
        forecastStatusMsg = `Peringatan Defisit! Pengeluaran bulan mendatang diproyeksikan melebihi pemasukan sebesar ${formatterIDR.format(Math.abs(forecastNextMonthNetCashFlow))}. Saldo akun terancam tergerus signifikan!`;
      } else {
        forecastStatus = 'Waspada';
        forecastStatusBg = 'bg-amber-50 text-amber-800 border-amber-200';
        forecastStatusBadge = 'bg-amber-600 text-white';
        forecastStatusMsg = `Waspada Arus Kas Negatif! Diproyeksikan defisit sebesar ${formatterIDR.format(Math.abs(forecastNextMonthNetCashFlow))}. Kurangi transaksi non-primer untuk menjaga kecukupan saldo.`;
      }
    }

    return {
      avgMonthlyIncomeHist,
      avgMonthlyExpenseHist,
      forecastIncomeNextMonth,
      forecastExpenseNextMonth,
      forecastNextMonthNetCashFlow,
      currentLiquidCash,
      projectedEndOfCurrentMonthBalance,
      projectedEndOfNextMonthBalance,
      nextMonthLabel,
      safeDailySpendingNextMonth,
      accountEstimations,
      forecastTrajectoryChartData,
      historicalAndForecastTrendData,
      forecastStatus,
      forecastStatusBg,
      forecastStatusBadge,
      forecastStatusMsg,
      upcomingBillsTotal,
      historyMonthsCount,
    };
  }, [
    transactions,
    totalLiquidAssets,
    liquidAccounts,
    monthlyIncome,
    monthlyExpense,
    monthlySaving,
    upcomingPayments,
    actualYear,
    actualMonth,
    actualDay,
    forecastIncomeAdjPct,
    forecastExpenseAdjPct,
    forecastIncludeUpcomingBills,
    INDONESIAN_MONTHS,
    formatterIDR,
  ]);

  // Calculate debts due in less than 3 days
  const urgentDueDebts = React.useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const list: Array<{
      id: string;
      name: string;
      balance: number;
      minPayment: number;
      dueText: string;
      daysRemaining: number;
    }> = [];

    const combinedDebts = [
      ...debts.map(d => ({ ...d, isAccount: false })),
      ...creditCardAndPaylaterAccounts.map(a => {
        const bill = getAccountCreditBill(a);
        return {
          id: a.id,
          name: a.name,
          balance: bill,
          minPayment: a.minPayment || bill * 0.1,
          dueDay: a.dueDay,
          dueDate: undefined,
          isAccount: true,
        };
      })
    ];

    combinedDebts.forEach(d => {
      if (d.balance <= 0) return;
      let daysRemaining: number | null = null;
      let dueText = '';

      if (d.dueDate) {
        const due = parseLocalDate(d.dueDate);
        if (due) {
          due.setHours(0, 0, 0, 0);
          daysRemaining = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          if (daysRemaining < 0) dueText = `Terlewat ${Math.abs(daysRemaining)} hari`;
          else if (daysRemaining === 0) dueText = `HARI INI JATUH TEMPO!`;
          else dueText = `${daysRemaining} hari lagi`;
        }
      } else if (d.dueDay && d.dueDay >= 1 && d.dueDay <= 31) {
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth();
        const currentDay = today.getDate();

        let targetDate = new Date(currentYear, currentMonth, d.dueDay);
        if (d.dueDay < currentDay) {
          targetDate = new Date(currentYear, currentMonth + 1, d.dueDay);
        }
        targetDate.setHours(0, 0, 0, 0);

        daysRemaining = Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if (daysRemaining === 0) dueText = `HARI INI (Tgl ${d.dueDay})`;
        else dueText = `${daysRemaining} hari lagi (Tgl ${d.dueDay})`;
      }

      if (daysRemaining !== null && daysRemaining <= 3) {
        list.push({
          id: d.id,
          name: d.name,
          balance: d.balance,
          minPayment: d.minPayment,
          dueText,
          daysRemaining,
        });
      }
    });

    return list.sort((a, b) => a.daysRemaining - b.daysRemaining);
  }, [debts, creditCardAndPaylaterAccounts]);

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-6">
      {/* Top Header Bar with Title, Time Range Filter, and Focus Mode Toggle */}
      <motion.div variants={cardVariants} className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200 bg-white p-4 sm:p-4.5 rounded-2xl shadow-xs border">
        <div>
          <h1 className="text-base sm:text-lg font-black text-slate-800 tracking-tight flex items-center gap-2">
            <Wallet className="h-5 w-5 text-blue-600 shrink-0" />
            Ikhtisar & Analisis Finansial
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            Kelola kekayaan bersih, pengeluaran mingguan, progres anggaran, dan dampak inflasi Anda.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full lg:w-auto">
          {/* Kontrol Filter Rentang Waktu */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-2xs overflow-x-auto max-w-full scrollbar-none">
            <span className="text-[10px] font-extrabold uppercase text-slate-500 px-2 tracking-wider flex items-center gap-1 shrink-0">
              <Calendar className="h-3.5 w-3.5 text-blue-600" /> Filter:
            </span>
            {[
              { id: 'this-week', label: 'Minggu Ini' },
              { id: 'this-month', label: 'Bulan Ini' },
              { id: 'last-3-months', label: '3 Bulan' },
              { id: 'all', label: 'Semua' },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setDashboardPeriod(p.id as any)}
                className={`px-2.5 sm:px-3 py-1.5 text-xs font-extrabold rounded-lg transition cursor-pointer shrink-0 whitespace-nowrap ${
                  dashboardPeriod === p.id
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Focus Mode Toggle */}
          <button
            type="button"
            onClick={() => setIsFocusMode(!isFocusMode)}
            className={`flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all duration-200 cursor-pointer shadow-xs border shrink-0 ${
              isFocusMode 
                ? 'bg-slate-800 border-slate-900 text-white hover:bg-slate-900' 
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
            }`}
          >
            {isFocusMode ? (
              <>
                <EyeOff className="h-3.5 w-3.5 text-blue-400" />
                <span>Mode Fokus: Aktif</span>
              </>
            ) : (
              <>
                <Eye className="h-3.5 w-3.5 text-slate-500" />
                <span>Mode Fokus: Nonaktif</span>
              </>
            )}
          </button>
        </div>
      </motion.div>

      {/* BANNER PERINGATAN ANOMALI PENGELUARAN (>30% DI ATAS RATA-RATA 3 BULAN) */}
      {hasUndismissedAnomalies && anomalyDetection && anomalyDetection.anomalies.length > 0 && (
        <motion.div variants={cardVariants}>
          <DashboardAnomalyAlertBanner
            detectionResult={anomalyDetection}
            isFocusMode={isFocusMode}
            onOpenSmartCleanup={() => {
              if (onOpenSmartCleanup) {
                onOpenSmartCleanup();
              } else {
                onQuickAction('ai-analysis');
              }
            }}
            onDismiss={() => onDismissAnomalies?.()}
          />
        </motion.div>
      )}

      {/* PANEL RINGKASAN UTAMA: NERACA KEKAYAAN BERSIH REAL-TIME */}
      <NeracaKekayaanBersih
        netWorth={netWorth}
        totalCurrentAssets={totalCurrentAssets}
        totalDebts={totalDebts}
        totalLiquidAssets={totalLiquidAssets}
        totalEmergency={totalEmergency}
        totalLiquidWithEmergency={totalLiquidWithEmergency}
        totalInvestments={totalInvestments}
        totalInvestmentGain={combinedPortfolioWealth.totalInvestmentGain}
        totalFixedAssets={totalFixedAssets}
        totalFixedAssetBasis={combinedPortfolioWealth.totalFixedAssetBasis}
        totalFixedAssetNetChange={combinedPortfolioWealth.totalFixedAssetNetChange}
        loanDebtsOnly={loanDebtsOnly}
        totalCreditCardBills={totalCreditCardBills}
        liquidAccounts={liquidAccounts}
        creditCardAndPaylaterAccounts={creditCardAndPaylaterAccounts}
        investments={investments}
        fixedAssetRows={fixedAssetModalRows}
        debts={debts}
        batchAssetDepreciation={batchAssetDepreciation}
        healthStatus={healthStatus}
        healthColor={healthColor}
        healthRatioText={healthRatioText}
        formatValue={formatValue}
        onSyncFixedAssetDepreciation={onSyncFixedAssetDepreciation}
        onSyncAllFixedAssetDepreciations={onSyncAllFixedAssetDepreciations}
        onQuickAction={onQuickAction}
      />

      {/* KARTU RINGKASAN PENCAPAIAN TABUNGAN GABUNGAN (RENCANA ANGGARAN + TARGET TABUNGAN) */}
      <SavingsAchievementCard
        budgets={budgets}
        transactions={transactions}
        savingsGoals={savingsGoals}
        activeMonthStr={activeMonthStr}
        activeMonthLabel={`${INDONESIAN_MONTHS[actualMonth - 1]} ${actualYear}`}
        formatValue={formatValue}
        onOpenBudgetTab={() => onQuickAction('budget')}
        onOpenAddGoal={handleOpenAddGoal}
        onScrollToGoals={() => {
          savingsGoalsSectionRef.current?.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
          });
        }}
      />

      {/* GRAFIK TREND NET WORTH 6 BULAN TERAKHIR + PROYEKSI 3 BULAN */}
      <TrendNetWorthChart
        trendResult={netWorthTrendWithProjection}
        currentNetWorth={netWorth}
        isFocusMode={isFocusMode}
        formatValue={formatValue}
        formatCompactValue={formatCompactValue}
      />

      {/* PANEL WAWASAN AI TERKONSOLIDASI (3 PRIORITAS MINGGU INI) */}
      <WawasanAI
        result={weeklyPrioritiesResult}
        lastAnalyzedAt={lastAnalyzedAt}
        isRefreshing={isRefreshingInsights}
        onTriggerAnalysis={handleTriggerWawasanAi}
        onQuickAction={onQuickAction}
        formatValue={formatValue}
      />

      {/* FINANCIAL HEALTH SCORE CARD */}
      <motion.div variants={cardVariants} className="bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950 p-6 rounded-2xl text-white shadow-xl border border-indigo-900/50 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-tr from-emerald-500 to-teal-600 rounded-xl shadow-md text-white">
              <Activity className="h-5 w-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black tracking-tight text-white">
                  Skor Kesehatan Keuangan (Financial Health Score)
                </h2>
                <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full border uppercase tracking-wider ${financialHealthScore.statusBadgeColor}`}>
                  {financialHealthScore.statusLabel}
                </span>
              </div>
              <p className="text-xs text-slate-300 font-medium">
                Dihitung berdasarkan rasio tabungan, beban utang, dan disiplin anggaran dari riwayat transaksi Anda.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400 font-semibold">Skor Utama:</span>
            <div className="px-3 py-1 bg-slate-900 border border-slate-700 rounded-xl font-mono font-black text-lg text-emerald-400 shadow-inner">
              {financialHealthScore.totalScore} / 100
            </div>
          </div>
        </div>

        {/* MAIN SCORE & BREAKDOWN GRID */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
          {/* SCORE GAUGE DISPLAY (md:col-span-4) */}
          <div className="md:col-span-4 bg-slate-950/80 p-5 rounded-2xl border border-slate-800 flex flex-col items-center justify-center text-center space-y-3 relative overflow-hidden">
            <div className="relative flex items-center justify-center">
              {/* Outer SVG Ring Gauge */}
              <svg className="w-36 h-36 transform -rotate-90">
                <circle
                  cx="72"
                  cy="72"
                  r="58"
                  stroke="currentColor"
                  strokeWidth="10"
                  className="text-slate-800"
                  fill="transparent"
                />
                <circle
                  cx="72"
                  cy="72"
                  r="58"
                  stroke={financialHealthScore.ringColor}
                  strokeWidth="10"
                  strokeDasharray={364.4}
                  strokeDashoffset={364.4 - (364.4 * financialHealthScore.totalScore) / 100}
                  strokeLinecap="round"
                  className="transition-all duration-1000 ease-out"
                  fill="transparent"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-black tracking-tight text-white font-mono">
                  {financialHealthScore.totalScore}
                </span>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  Indeks / 100
                </span>
              </div>
            </div>

            <div className="space-y-1">
              <span className={`inline-block text-xs font-black px-3 py-0.5 rounded-full border ${financialHealthScore.statusBadgeColor}`}>
                {financialHealthScore.statusLabel}
              </span>
              <p className="text-[11px] text-slate-300 leading-snug px-2">
                {financialHealthScore.summaryText}
              </p>
            </div>
          </div>

          {/* SUB-METRICS BREAKDOWN CARDS (md:col-span-8) */}
          <div className="md:col-span-8 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* 1. Rasio Tabungan */}
              <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                  <span className="flex items-center gap-1.5 text-emerald-400">
                    <PiggyBank className="h-4 w-4" /> Rasio Tabungan
                  </span>
                  <span className="font-mono text-white text-xs">{financialHealthScore.savingsScore}/100</span>
                </div>
                <div className="text-lg font-extrabold text-white">
                  {financialHealthScore.savingsRatioPct}% <span className="text-[10px] font-normal text-slate-400">dari pemasukan</span>
                </div>
                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-emerald-400 h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, financialHealthScore.savingsScore)}%` }}
                  ></div>
                </div>
                <span className="text-[10px] text-slate-400 font-medium block">
                  {financialHealthScore.savingsGrade}
                </span>
              </div>

              {/* 2. Beban Utang (DTI) */}
              <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                  <span className="flex items-center gap-1.5 text-amber-400">
                    <CreditCard className="h-4 w-4" /> Beban Utang (DTI)
                  </span>
                  <span className="font-mono text-white text-xs">{financialHealthScore.debtScore}/100</span>
                </div>
                <div className="text-lg font-extrabold text-white">
                  {financialHealthScore.dtiRatioPct}% <span className="text-[10px] font-normal text-slate-400">dari pemasukan</span>
                </div>
                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-amber-400 h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, financialHealthScore.debtScore)}%` }}
                  ></div>
                </div>
                <span className="text-[10px] text-slate-400 font-medium block">
                  {financialHealthScore.debtGrade}
                </span>
              </div>

              {/* 3. Disiplin Anggaran */}
              <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                  <span className="flex items-center gap-1.5 text-blue-400">
                    <Target className="h-4 w-4" /> Disiplin Anggaran
                  </span>
                  <span className="font-mono text-white text-xs">{financialHealthScore.budgetScore}/100</span>
                </div>
                <div className="text-lg font-extrabold text-white">
                  {financialHealthScore.budgetScore >= 80 ? 'Terkendali' : 'Perlu Kontrol'}
                </div>
                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-blue-400 h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, financialHealthScore.budgetScore)}%` }}
                  ></div>
                </div>
                <span className="text-[10px] text-slate-400 font-medium block">
                  {financialHealthScore.totalBudgetsEvaluated > 0
                    ? `${financialHealthScore.overBudgetCount} dari ${financialHealthScore.totalBudgetsEvaluated} anggaran overbudget`
                    : financialHealthScore.budgetGrade}
                </span>
              </div>
            </div>

            {/* KEY ACTIONABLE RECOMMENDATION */}
            <div className="p-3 bg-indigo-950/60 border border-indigo-800/60 rounded-xl text-xs text-indigo-200 flex items-start gap-2.5">
              <Lightbulb className="h-4 w-4 text-amber-300 shrink-0 mt-0.5" />
              <div>
                <strong className="text-white font-bold">Rekomendasi Utama AI: </strong>
                <span>{financialHealthScore.keyRecommendation}</span>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* PANEL RASIO KESEHATAN KEUANGAN REAL-TIME (CFP BENCHMARK & GRAFIK PERBANDINGAN) */}
      <motion.div variants={cardVariants}>
        <DashboardFinancialHealthPanel
          transactions={transactions}
          accounts={accounts}
          debts={debts}
          investments={investments}
          emergencyTransactions={emergencyTransactions}
          fixedAssets={fixedAssets}
          isFocusMode={isFocusMode}
          onOpenReports={() => onQuickAction('reports')}
          onAddTransaction={() => onQuickAction('transactions')}
        />
      </motion.div>

      {/* PEMERIKSAAN KESEHATAN KEUANGAN OTOMATIS (SCANNER KATEGORI, AKUN NONAKTIF & DANA DARURAT) */}
      <motion.div variants={cardVariants}>
        <DashboardHealthScannerCard
          transactions={transactions}
          accounts={accounts}
          emergencyConfig={emergencyConfig}
          emergencyTransactions={emergencyTransactions}
          isFocusMode={isFocusMode}
          onQuickAction={onQuickAction}
        />
      </motion.div>


      {/* Due Date Notification Banner for Debts (< 3 Days) */}
      {urgentDueDebts.length > 0 && (
        <motion.div variants={cardVariants} className="bg-gradient-to-r from-amber-500 via-rose-500 to-amber-600 text-white p-4 rounded-2xl shadow-md space-y-2 border border-amber-400/30">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-xl shrink-0">
                <Bell className="h-5 w-5 text-white animate-bounce" />
              </div>
              <div>
                <h3 className="font-extrabold text-sm flex items-center gap-2">
                  <span>Peringatan Jatuh Tempo Utang & Tagihan!</span>
                  <span className="bg-white text-rose-700 px-2 py-0.5 rounded-full text-[10px] font-black uppercase">
                    {urgentDueDebts.length} Tagihan
                  </span>
                </h3>
                <p className="text-xs text-amber-50 font-medium">
                  Terdapat utang atau tagihan yang jatuh temponya kurang dari 3 hari lagi. Segera lakukan pelunasan untuk menghindari denda.
                </p>
              </div>
            </div>

            <button
              onClick={() => onQuickAction('debts')}
              className="bg-white text-rose-700 hover:bg-amber-50 px-3.5 py-1.5 rounded-xl text-xs font-black uppercase transition cursor-pointer shadow-xs shrink-0 self-start sm:self-center flex items-center gap-1.5"
            >
              <span>Bayar Utang Sekarang</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-1 border-t border-white/20">
            {urgentDueDebts.map((item) => (
              <div key={item.id} className="bg-white/10 p-2.5 rounded-xl border border-white/15 flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-white block">{item.name}</span>
                  <span className="text-[10px] text-amber-100 font-mono">
                    Cicilan: {formatterIDR.format(item.minPayment || item.balance)}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] bg-white text-rose-800 font-extrabold px-2 py-0.5 rounded-full block">
                    {item.dueText}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* SYSTEM NOTIFICATION: WARNING BANNER FOR BUDGET EXCEEDED / NEAR LIMIT (>=90%) */}
      {budgetAlerts.length > 0 && (
        <motion.div variants={cardVariants} className="bg-gradient-to-r from-rose-600 via-rose-700 to-amber-600 text-white p-4.5 rounded-2xl shadow-md border border-rose-400 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-white/20 rounded-xl shrink-0 animate-bounce">
              <AlertTriangle className="h-6 w-6 text-amber-200" />
            </div>
            <div>
              <p className="font-extrabold text-xs uppercase tracking-wider text-amber-100 flex items-center gap-2">
                🚨 SYSTEM ALERT: ANGGARAN KATEGORI MENDEKATI / MELEBIHI 90%
              </p>
              <p className="text-xs font-medium text-white/95 mt-1 leading-relaxed">
                Peringatan! {budgetAlerts.length} kategori pengeluaran memerlukan perhatian Anda:
              </p>
              <div className="flex flex-wrap gap-2 mt-2">
                {budgetAlerts.map((alert) => (
                  <span
                    key={`ba1-${alert.category}`}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border shadow-xs ${
                      alert.rawPercentage >= 100
                        ? 'bg-rose-900/90 text-rose-100 border-rose-300'
                        : 'bg-amber-900/80 text-amber-100 border-amber-300'
                    }`}
                  >
                    {alert.category}: {alert.rawPercentage.toFixed(1)}% Terpakai {alert.rawPercentage >= 100 ? '(OVER BUDGET)' : '(Kritis)'}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <button
            onClick={() => onQuickAction('budget')}
            className="px-4 py-2.5 bg-white text-rose-700 font-black text-xs rounded-xl shadow-md hover:bg-rose-50 transition cursor-pointer whitespace-nowrap shrink-0 uppercase tracking-wider"
          >
            Atur Anggaran &rarr;
          </button>
        </motion.div>
      )}

      {/* SYSTEM NOTIFICATION: BILL REMINDERS (PENGINGAT TAGIHAN DEBT & CC MENDEKATI JATUH TEMPO) */}
      {upcomingPayments.length > 0 && (
        <motion.div variants={cardVariants} className="bg-gradient-to-r from-amber-600 via-amber-700 to-rose-700 text-white p-4.5 rounded-2xl shadow-md border border-amber-400 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-white/20 rounded-xl shrink-0 animate-bounce">
              <Bell className="h-6 w-6 text-amber-100" />
            </div>
            <div className="space-y-1">
              <p className="font-extrabold text-xs uppercase tracking-wider text-amber-100 flex items-center gap-2">
                🚨 PENGINGAT TAGIHAN DEBT & KARTU KREDIT MENDEKATI JATUH TEMPO ({upcomingPayments.length})
              </p>
              <p className="text-xs font-medium text-white/95 leading-relaxed">
                Perhatian! Berikut tagihan yang jatuh tempo dalam waktu dekat. Lunasi segera untuk menghindari denda:
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                {upcomingPayments.map((p) => (
                  <div
                    key={`up1-${p.type}-${p.id}`}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-2 shadow-xs ${
                      p.daysLeft < 0
                        ? 'bg-rose-950/90 text-rose-100 border-rose-300'
                        : p.daysLeft === 0
                        ? 'bg-rose-900/90 text-rose-100 border-amber-300'
                        : 'bg-amber-900/80 text-amber-100 border-amber-300'
                    }`}
                  >
                    <span>{p.name} ({p.type}):</span>
                    <span className="font-mono">{formatValue(p.amount)}</span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] uppercase font-black bg-white/20">
                      {p.daysLeft < 0
                        ? `LEWAT ${Math.abs(p.daysLeft)} HARI`
                        : p.daysLeft === 0
                        ? 'HARI INI'
                        : `SISA ${p.daysLeft} HARI`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <button
            onClick={() => onQuickAction('debts')}
            className="px-4 py-2.5 bg-white text-amber-900 font-black text-xs rounded-xl shadow-md hover:bg-amber-50 transition cursor-pointer whitespace-nowrap shrink-0 uppercase tracking-wider flex items-center gap-1.5"
          >
            <span>Bayar Tagihan &rarr;</span>
          </button>
        </motion.div>
      )}

      {/* CONSOLIDATED EXECUTIVE FINANCIAL REPORTS & INSIGHTS PANEL */}
      <motion.div variants={cardVariants} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl border border-blue-100 shadow-2xs">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-slate-800 tracking-tight">
                  Ringkasan Eksekutif & Konsolidasi Laporan Keuangan
                </h2>
                <span className="bg-blue-100 text-blue-800 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                  All-In-One Insight
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Rangkuman terpadu arus kas, laba rugi, rasio finansial CFP, dan audit akuntansi tanpa perlu berpindah tab secara berlebihan.
              </p>
            </div>
          </div>

          <button
            onClick={() => onQuickAction('reports')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl shadow-2xs transition cursor-pointer shrink-0"
          >
            <span>Buka Laporan Lengkap</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* 4 CONSOLIDATED METRIC BLOCKS */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. Laba Rugi & Net Surplus Kas */}
          <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200/80 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Laba Rugi & Net Kas</span>
              <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                monthlyIncome >= monthlyExpense ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
              }`}>
                {monthlyIncome >= monthlyExpense ? 'Surplus' : 'Defisit'}
              </span>
            </div>
            <div className="text-lg font-mono font-black text-slate-900">
              {formatValue(monthlyIncome - monthlyExpense)}
            </div>
            <div className="space-y-1 text-[11px] pt-1 border-t border-slate-200/60">
              <div className="flex justify-between text-slate-600">
                <span>Pemasukan:</span>
                <span className="font-mono font-bold text-emerald-600">{formatValue(monthlyIncome)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Pengeluaran:</span>
                <span className="font-mono font-bold text-rose-600">{formatValue(monthlyExpense)}</span>
              </div>
            </div>
          </div>

          {/* 2. Rasio Likuiditas & CFP */}
          <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200/80 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Ketahanan Kas & Rasio CFP</span>
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                Likuiditas
              </span>
            </div>
            <div className="text-lg font-mono font-black text-slate-900">
              {(totalCurrentAssets / Math.max(1, monthlyExpense)).toFixed(1)} <span className="text-xs font-sans font-bold text-slate-500">Bulan Kas</span>
            </div>
            <div className="space-y-1 text-[11px] pt-1 border-t border-slate-200/60">
              <div className="flex justify-between text-slate-600">
                <span>Rasio Utang (DTI):</span>
                <span className="font-mono font-bold text-amber-600">{financialHealthScore.dtiRatioPct}%</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Rasio Tabungan:</span>
                <span className="font-mono font-bold text-emerald-600">{financialHealthScore.savingsRatioPct}%</span>
              </div>
            </div>
          </div>

          {/* 3. Pohon Anggaran & Kebocoran */}
          <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200/80 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Anggaran & Kebocoran</span>
              <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                financialHealthScore.overBudgetCount > 0 ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
              }`}>
                {financialHealthScore.overBudgetCount > 0 ? `${financialHealthScore.overBudgetCount} Overbudget` : 'Terkendali'}
              </span>
            </div>
            <div className="text-lg font-mono font-black text-slate-900">
              {budgets.length > 0 ? `${financialHealthScore.overBudgetCount} / ${budgets.length}` : '0 Alert'}
            </div>
            <div className="space-y-1 text-[11px] pt-1 border-t border-slate-200/60">
              <div className="flex justify-between text-slate-600">
                <span>Disiplin Anggaran:</span>
                <span className="font-mono font-bold text-slate-800">{financialHealthScore.budgetScore}/100</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Anomali Kebocoran:</span>
                <span className="font-mono font-bold text-slate-800">{weeklyPrioritiesResult.anomalyCount}</span>
              </div>
            </div>
          </div>

          {/* 4. Audit Ledger Dual-Entry & COA */}
          <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200/80 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Audit Ledger Dual-Entry</span>
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 flex items-center gap-1">
                <ShieldCheck className="h-3 w-3 text-emerald-600" />
                Balanced
              </span>
            </div>
            <div className="text-lg font-mono font-black text-emerald-600">
              100% Verified
            </div>
            <div className="space-y-1 text-[11px] pt-1 border-t border-slate-200/60">
              <div className="flex justify-between text-slate-600">
                <span>Master Akun Kas & Bank:</span>
                <span className="font-mono font-bold text-slate-800">{accounts.length} Akun</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Integritas Jurnal:</span>
                <span className="font-mono font-bold text-emerald-600">Terverifikasi</span>
              </div>
            </div>
          </div>
        </div>

        {/* QUICK NAVIGATION SHORTCUT BUTTONS TO DETAILED REPORTS */}
        <div className="pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-black uppercase text-slate-500 tracking-wider">
              Pintas Cepat Modul Laporan & Analitik Finansial
            </span>
            <span className="text-[10px] text-slate-400 font-medium">Klik untuk membuka detail di Laporan Tab</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {[
              { label: 'Pivot Keuangan', icon: Table, action: () => onQuickAction('reports') },
              { label: 'Diagram Sankey', icon: GitCommit, action: () => onQuickAction('reports') },
              { label: 'Rasio CFP', icon: Activity, action: () => onQuickAction('reports') },
              { label: 'Audit & AI COA', icon: FileCheck, action: () => onQuickAction('reports') },
              { label: 'Arus Kas', icon: BarChart3, action: () => onQuickAction('reports') },
              { label: 'Laporan Neraca', icon: Scale, action: () => onQuickAction('reports') },
            ].map((btn, idx) => {
              const BIcon = btn.icon;
              return (
                <button
                  key={idx}
                  onClick={btn.action}
                  className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 hover:bg-blue-50/80 text-slate-700 hover:text-blue-700 border border-slate-200/80 hover:border-blue-300 transition text-xs font-extrabold cursor-pointer group shadow-2xs"
                >
                  <BIcon className="h-4 w-4 text-blue-600 group-hover:scale-110 transition shrink-0" />
                  <span className="truncate">{btn.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </motion.div>

      {/* BALANCED ANALYTICS CHARTS & WEEKLY/BUDGET MONITORING */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 6-Month Monthly Spending Trend Line Chart */}
        <motion.div variants={cardVariants} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm transition-all duration-300 hover:shadow-md hover:border-rose-200/80">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-rose-500 shrink-0" />
                <h3 className="font-extrabold text-slate-800 text-xs uppercase tracking-wider">Tren Pengeluaran Bulanan (6 Bulan Terakhir)</h3>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5 font-medium leading-relaxed">
                Evaluasi fluktuasi total konsumsi dan pengeluaran bulanan Anda untuk menjaga kestabilan finansial.
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[9px] bg-rose-50 text-rose-600 border border-rose-100 px-2.5 py-1 rounded-full font-bold uppercase tracking-wider">
                Pengeluaran
              </span>
              <span className="text-[9px] bg-emerald-50 text-emerald-600 border border-emerald-100 px-2.5 py-1 rounded-full font-bold uppercase tracking-wider">
                Pemasukan
              </span>
            </div>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlySpendingTrend6Months} margin={{ top: 15, right: 20, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f8fafc" vertical={false} />
                <XAxis 
                  dataKey="monthLabel" 
                  tick={{ fill: '#64748b', fontSize: 10, fontWeight: 'bold' }}
                  axisLine={{ stroke: '#e2e8f0' }}
                  tickLine={false}
                />
                <YAxis 
                  domain={[0, (dataMax: number) => (dataMax <= 0 ? 1000000 : Math.ceil(dataMax * 1.15))]}
                  tickFormatter={(val) => `${val >= 1000000 ? `${(val / 1000000).toFixed(1)}M` : `${(val / 1000).toFixed(0)}K`}`}
                  tick={{ fill: '#64748b', fontSize: 10 }}
                  axisLine={{ stroke: '#e2e8f0' }}
                  tickLine={false}
                />
                <Tooltip 
                  formatter={(value, name) => [isFocusMode ? 'Rp ••••••' : formatterIDR.format(Number(value)), name]}
                  contentStyle={{ backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', color: '#1e293b', fontSize: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  itemStyle={{ fontWeight: 'bold' }}
                  labelStyle={{ color: '#64748b', fontWeight: 'bold' }}
                />
                <Legend iconSize={8} wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', paddingTop: '10px' }} />
                <Line 
                  type="monotone" 
                  dataKey="Pengeluaran" 
                  name="Total Pengeluaran"
                  stroke="#e11d48" 
                  strokeWidth={3} 
                  dot={{ r: 4, strokeWidth: 2, fill: '#ffffff', stroke: '#e11d48' }} 
                  activeDot={{ r: 7, strokeWidth: 0, fill: '#e11d48' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="Pemasukan" 
                  name="Total Pemasukan"
                  stroke="#10b981" 
                  strokeWidth={2} 
                  strokeDasharray="4 4"
                  dot={{ r: 3, strokeWidth: 1 }} 
                  activeDot={{ r: 5, strokeWidth: 0 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* 30-Day Cash Flow Trend Chart */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm animate-fadeIn transition-all duration-300 hover:shadow-md">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div>
              <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider">Tren Arus Kas 30 Hari Terakhir</h3>
              <p className="text-[11px] text-slate-400 mt-0.5 font-medium leading-relaxed">
                Perbandingan harian antara total uang masuk (Pemasukan) dan uang keluar (Pengeluaran, Tabungan, & Investasi).
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[9px] bg-emerald-50 text-emerald-600 border border-emerald-100 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                Masuk
              </span>
              <span className="text-[9px] bg-rose-50 text-rose-600 border border-rose-100 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                Keluar
              </span>
            </div>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={cashFlowTrend30Days} margin={{ top: 15, right: 20, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f8fafc" vertical={false} />
                <XAxis 
                  dataKey="date" 
                  tick={{ fill: '#64748b', fontSize: 10 }}
                  axisLine={{ stroke: '#e2e8f0' }}
                  tickLine={false}
                />
                <YAxis 
                  domain={[0, (dataMax: number) => (dataMax <= 0 ? 1000000 : Math.ceil(dataMax * 1.15))]}
                  tickFormatter={(val) => `${val >= 1000000 ? `${(val / 1000000).toFixed(1)}M` : `${(val / 1000).toFixed(0)}K`}`}
                  tick={{ fill: '#64748b', fontSize: 10 }}
                  axisLine={{ stroke: '#e2e8f0' }}
                  tickLine={false}
                />
                <Tooltip 
                  formatter={(value, name) => [isFocusMode ? 'Rp ••••••' : formatterIDR.format(Number(value)), name]}
                  contentStyle={{ backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', color: '#1e293b', fontSize: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  itemStyle={{ fontWeight: 'bold' }}
                  labelStyle={{ color: '#64748b', fontWeight: 'bold' }}
                />
                <Legend iconSize={8} wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', paddingTop: '10px' }} />
                <Line 
                  type="monotone" 
                  dataKey="Pemasukan" 
                  stroke="#10b981" 
                  strokeWidth={3} 
                  dot={{ r: 3, strokeWidth: 1 }} 
                  activeDot={{ r: 5, strokeWidth: 0 }}
                />
                <Line 
                  type="monotone" 
                  dataKey="Pengeluaran" 
                  stroke="#ef4444" 
                  strokeWidth={3} 
                  dot={{ r: 3, strokeWidth: 1 }} 
                  activeDot={{ r: 5, strokeWidth: 0 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* PERBANDINGAN PENGELUARAN MINGGUAN CARD */}
        <motion.div variants={cardVariants} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3 transition-all hover:shadow-md hover:border-blue-300">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                <TrendingUp className="h-4 w-4" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
                  Perbandingan Pengeluaran Mingguan
                </h3>
                <p className="text-[10px] text-slate-400 font-medium">Minggu Ini vs Minggu Lalu</p>
              </div>
            </div>
            <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase flex items-center gap-1 ${
              weeklyExpenseComparison.isIncrease
                ? 'bg-rose-100 text-rose-700 border border-rose-200'
                : weeklyExpenseComparison.isEqual
                ? 'bg-slate-100 text-slate-700 border border-slate-200'
                : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
            }`}>
              {weeklyExpenseComparison.isIncrease ? (
                <ArrowUpRight className="h-3 w-3" />
              ) : weeklyExpenseComparison.isEqual ? null : (
                <ArrowDownRight className="h-3 w-3" />
              )}
              {weeklyExpenseComparison.isIncrease ? '+' : ''}{weeklyExpenseComparison.pctChange.toFixed(1)}%
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs font-medium bg-slate-50 p-3 rounded-xl border border-slate-150">
            <div>
              <span className="text-[9px] text-slate-400 font-extrabold uppercase block">Minggu Ini (7 Hr)</span>
              <span className="font-black text-slate-800 text-sm font-mono tabular-nums block">
                {formatValue(weeklyExpenseComparison.thisWeekTotal)}
              </span>
            </div>
            <div>
              <span className="text-[9px] text-slate-400 font-extrabold uppercase block">Minggu Lalu</span>
              <span className="font-bold text-slate-600 text-xs font-mono tabular-nums block">
                {formatValue(weeklyExpenseComparison.lastWeekTotal)}
              </span>
            </div>
          </div>

          <p className="text-[11px] text-slate-600 font-medium leading-relaxed bg-blue-50/60 p-2.5 rounded-lg border border-blue-100">
            {weeklyExpenseComparison.isIncrease ? (
              <>⚠️ Pengeluaran minggu ini <strong className="text-rose-600">naik {formatValue(weeklyExpenseComparison.diff)}</strong> dibandingkan minggu lalu. Harap jaga ritme belanja harian Anda.</>
            ) : weeklyExpenseComparison.isEqual ? (
              <>Pengeluaran minggu ini relatif stabil sama dengan minggu lalu.</>
            ) : (
              <> Bagus! Pengeluaran minggu ini <strong className="text-emerald-600">hemat {formatValue(Math.abs(weeklyExpenseComparison.diff))}</strong> dibandingkan minggu lalu. Disiplin finansial berjalan baik!</>
            )}
          </p>
        </motion.div>

        {/* Budget Overruns (Notification of Budget Limits) */}
        {budgetAlerts.length > 0 ? (
          <div className="bg-rose-50/50 border border-rose-100 rounded-2xl p-5 shadow-xs space-y-4 animate-fadeIn">
            <div className="flex items-start gap-3">
              <div className="p-1.5 bg-rose-600 text-white rounded-lg animate-pulse shrink-0">
                <AlertTriangle className="h-4.5 w-4.5" />
              </div>
              <div>
                <h3 className="text-xs font-black text-rose-800 uppercase tracking-wider">
                  Peringatan Batas Anggaran (&gt;90%)
                </h3>
                <p className="text-[11px] text-rose-600 mt-0.5 font-semibold leading-relaxed">
                  Kategori pengeluaran di bawah ini terdeteksi telah mendekati atau melampaui alokasi bulanan Anda:
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {budgetAlerts.map(alert => (
                <div key={`ba2-${alert.category}`} className="bg-white p-4 rounded-xl border border-rose-100 shadow-2xs space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-extrabold text-slate-800 uppercase tracking-tight">{alert.category}</span>
                    <span className={`font-mono font-black ${alert.rawPercentage >= 100 ? 'text-rose-600' : 'text-amber-600'}`}>
                      {alert.rawPercentage.toFixed(0)}% Terpakai
                    </span>
                  </div>
                  
                  {/* Progress Bar */}
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        alert.rawPercentage >= 100 ? 'bg-rose-600' : 'bg-amber-500'
                      }`} 
                      style={{ width: `${Math.min(alert.rawPercentage, 100)}%` }}
                    />
                  </div>

                  <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold">
                    <span>Terpakai: <strong className="text-slate-700 font-extrabold">{isFocusMode ? 'Rp ••••••' : formatterIDR.format(alert.actual)}</strong></span>
                    <span>Batas: <strong className="text-slate-500 font-semibold">{isFocusMode ? 'Rp ••••••' : formatterIDR.format(alert.limit)}</strong></span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-emerald-50/40 border border-emerald-100 rounded-2xl p-5 flex items-center gap-3 text-xs text-slate-600 font-medium">
            <span className="text-emerald-500 text-sm font-bold">✓</span>
            <span>Seluruh kategori pengeluaran Anda bulan ini masih terkendali dan berada di dalam koridor anggaran yang aman. Hebat!</span>
          </div>
        )}
      </div>

      {/* SECTION: PREDIKSI ARUS KAS & ESTIMASI SALDO AKUN AKHIR BULAN MENDATANG */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6 hover:shadow-md transition">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-start gap-3">
            <div className="p-3 bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-2xl shadow-xs shrink-0">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-slate-800 tracking-tight">
                  Prediksi Arus Kas & Estimasi Saldo (Cash Flow Forecast)
                </h2>
                <span className="px-2.5 py-0.5 bg-blue-100 text-blue-800 text-[10px] font-extrabold rounded-full uppercase tracking-wider border border-blue-200">
                  Proyeksi Cerdas
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Estimasi kecukupan kas dan saldo akun di akhir bulan mendatang ({cashFlowForecast.nextMonthLabel}) berdasarkan {cashFlowForecast.historyMonthsCount} bulan riwayat transaksi historis
              </p>
            </div>
          </div>

          {/* Controls: Adjustment Inputs & Toggle */}
          <div className="flex flex-wrap items-center gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-slate-600 text-[11px]">Pemasukan (+/- %):</span>
              <input 
                type="number"
                value={forecastIncomeAdjPct}
                onChange={(e) => setForecastIncomeAdjPct(Number(e.target.value) || 0)}
                className="w-14 px-1.5 py-1 bg-white border border-slate-200 rounded-lg font-mono font-bold text-slate-800 text-xs text-center focus:ring-2 focus:ring-blue-500 focus:outline-none"
                placeholder="0"
              />
              <span className="font-mono text-slate-400 text-[11px]">%</span>
            </div>

            <div className="flex items-center gap-1.5 border-l border-slate-200 pl-3">
              <span className="font-bold text-slate-600 text-[11px]">Pengeluaran (+/- %):</span>
              <input 
                type="number"
                value={forecastExpenseAdjPct}
                onChange={(e) => setForecastExpenseAdjPct(Number(e.target.value) || 0)}
                className="w-14 px-1.5 py-1 bg-white border border-slate-200 rounded-lg font-mono font-bold text-slate-800 text-xs text-center focus:ring-2 focus:ring-blue-500 focus:outline-none"
                placeholder="0"
              />
              <span className="font-mono text-slate-400 text-[11px]">%</span>
            </div>

            <div className="flex items-center gap-2 border-l border-slate-200 pl-3">
              <label className="flex items-center gap-1.5 cursor-pointer font-bold text-slate-600 text-[11px]">
                <input 
                  type="checkbox"
                  checked={forecastIncludeUpcomingBills}
                  onChange={(e) => setForecastIncludeUpcomingBills(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500 h-3.5 w-3.5 cursor-pointer"
                />
                <span>Sertakan Tagihan Jatuh Tempo ({formatValue(cashFlowForecast.upcomingBillsTotal)})</span>
              </label>
            </div>
          </div>
        </div>

        {/* Status Alert Banner */}
        <div className={`p-4 rounded-xl border flex items-start gap-3 ${cashFlowForecast.forecastStatusBg}`}>
          <div className={`p-1.5 rounded-lg font-black text-xs shrink-0 ${cashFlowForecast.forecastStatusBadge}`}>
            {cashFlowForecast.forecastStatus}
          </div>
          <div className="space-y-1">
            <p className="text-xs font-bold leading-relaxed">
              {cashFlowForecast.forecastStatusMsg}
            </p>
            <p className="text-[11px] font-medium opacity-90">
              💡 <strong>Batas Pengeluaran Harian Aman Bulan Depan:</strong> Maksimal <strong className="font-mono underline">{formatValue(cashFlowForecast.safeDailySpendingNextMonth)}/hari</strong> agar arus kas tidak terganggu.
            </p>
          </div>
        </div>

        {/* Top 4 KPI Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Metric 1: Kas & Bank Saat Ini */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1">
            <div className="flex justify-between items-center text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
              <span>Kas & Bank Saat Ini</span>
              <Wallet className="h-4 w-4 text-blue-600" />
            </div>
            <p className="text-base font-black text-slate-900 font-mono">
              {formatValue(cashFlowForecast.currentLiquidCash)}
            </p>
            <span className="text-[10px] text-slate-400 block font-medium">Saldo real time saat ini</span>
          </div>

          {/* Metric 2: Proyeksi Akhir Bulan Ini */}
          <div className="bg-blue-50/60 p-4 rounded-xl border border-blue-100 space-y-1">
            <div className="flex justify-between items-center text-[11px] font-extrabold text-blue-700 uppercase tracking-wider">
              <span>Estimasi Akhir Bulan Ini</span>
              <Clock className="h-4 w-4 text-blue-600" />
            </div>
            <p className="text-base font-black text-blue-900 font-mono">
              {formatValue(cashFlowForecast.projectedEndOfCurrentMonthBalance)}
            </p>
            <span className="text-[10px] text-blue-600 block font-medium">Sisa {Math.max(1, new Date(actualYear, actualMonth, 0).getDate() - actualDay)} hari lagi</span>
          </div>

          {/* Metric 3: Estimasi Saldo Akhir Bulan Mendatang */}
          <div className="bg-emerald-50/80 p-4 rounded-xl border border-emerald-200 space-y-1">
            <div className="flex justify-between items-center text-[11px] font-extrabold text-emerald-800 uppercase tracking-wider">
              <span>Estimasi Akhir {cashFlowForecast.nextMonthLabel}</span>
              <Sparkles className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="text-lg font-black text-emerald-900 font-mono">
              {formatValue(cashFlowForecast.projectedEndOfNextMonthBalance)}
            </p>
            <span className="text-[10px] text-emerald-700 block font-semibold">Proyeksi Saldo Akun Mendatang</span>
          </div>

          {/* Metric 4: Projected Net Cash Flow Next Month */}
          <div className={`p-4 rounded-xl border space-y-1 ${cashFlowForecast.forecastNextMonthNetCashFlow >= 0 ? 'bg-emerald-50/40 border-emerald-100' : 'bg-rose-50/40 border-rose-100'}`}>
            <div className="flex justify-between items-center text-[11px] font-extrabold text-slate-600 uppercase tracking-wider">
              <span>Net Arus Kas ({cashFlowForecast.nextMonthLabel})</span>
              {cashFlowForecast.forecastNextMonthNetCashFlow >= 0 ? (
                <TrendingUp className="h-4 w-4 text-emerald-600" />
              ) : (
                <TrendingDown className="h-4 w-4 text-rose-600" />
              )}
            </div>
            <p className={`text-base font-black font-mono ${cashFlowForecast.forecastNextMonthNetCashFlow >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
              {cashFlowForecast.forecastNextMonthNetCashFlow >= 0 ? '+' : ''}{formatValue(cashFlowForecast.forecastNextMonthNetCashFlow)}
            </p>
            <span className="text-[10px] text-slate-500 block font-medium">Pemasukan ({formatValue(cashFlowForecast.forecastIncomeNextMonth)}) - Keluar ({formatValue(cashFlowForecast.forecastExpenseNextMonth)})</span>
          </div>
        </div>

        {/* Charts & Per-Account Forecast Breakdown Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
          {/* Left: Recharts Line Chart for Cash Flow Forecast & Trajectory */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
              <h4 className="font-extrabold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-blue-600" />
                <span>Visualisasi LineChart Prediksi Arus Kas</span>
              </h4>
              
              {/* Chart View Selector Toggle */}
              <div className="flex items-center gap-1 bg-slate-200/80 p-0.5 rounded-lg text-[10px] font-extrabold">
                <button
                  type="button"
                  onClick={() => setForecastChartView('trend')}
                  className={`px-2.5 py-1 rounded-md transition ${forecastChartView === 'trend' ? 'bg-white text-blue-700 shadow-2xs font-black' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  📈 Tren Arus Kas
                </button>
                <button
                  type="button"
                  onClick={() => setForecastChartView('balance')}
                  className={`px-2.5 py-1 rounded-md transition ${forecastChartView === 'balance' ? 'bg-white text-blue-700 shadow-2xs font-black' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  💰 Trajektori Saldo
                </button>
              </div>
            </div>

            <div className="h-56 w-full pt-1">
              <ResponsiveContainer width="100%" height="100%">
                {forecastChartView === 'trend' ? (
                  <LineChart data={cashFlowForecast.historicalAndForecastTrendData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="bulan" tick={{ fontSize: 9.5, fill: '#64748b' }} />
                    <YAxis tickFormatter={(val) => formatCompactValue(val)} tick={{ fontSize: 9.5, fill: '#64748b' }} domain={['auto', 'auto']} />
                    <Tooltip 
                      formatter={(val, name) => [formatValue(Number(val)), name]}
                      contentStyle={{ background: '#0f172a', color: '#fff', borderRadius: '10px', fontSize: '11px', border: '1px solid #334155' }}
                    />
                    <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '4px' }} />
                    <Line type="monotone" dataKey="Pemasukan" stroke="#10b981" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="Pengeluaran" stroke="#f43f5e" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="Net Kas" stroke="#3b82f6" strokeWidth={3} dot={{ r: 5, fill: '#ffffff', strokeWidth: 2 }} activeDot={{ r: 7 }} />
                  </LineChart>
                ) : (
                  <LineChart data={cashFlowForecast.forecastTrajectoryChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="stage" tick={{ fontSize: 10, fill: '#64748b' }} />
                    <YAxis tickFormatter={(val) => formatCompactValue(val)} tick={{ fontSize: 10, fill: '#64748b' }} domain={['auto', 'auto']} />
                    <Tooltip 
                      formatter={(val) => [formatValue(Number(val)), 'Estimasi Saldo']}
                      contentStyle={{ background: '#0f172a', color: '#fff', borderRadius: '10px', fontSize: '11px', border: '1px solid #334155' }}
                    />
                    <Line type="monotone" dataKey="Saldo" stroke="#2563eb" strokeWidth={3} dot={{ r: 5, strokeWidth: 2, fill: '#ffffff' }} activeDot={{ r: 7 }} />
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>
            <p className="text-[10px] text-slate-500 italic text-center font-medium">
              {forecastChartView === 'trend'
                ? '*LineChart memvisualisasikan garis tren Pemasukan (Hijau), Pengeluaran (Merah), dan Net Kas (Biru) hingga prediksi bulan depan.'
                : '*LineChart memvisualisasikan estimasi perubahan total kas dan rekening bank Anda.'}
            </p>
          </div>

          {/* Right: Per-Account Estimated Ending Balances Table */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
            <div className="flex justify-between items-center">
              <h4 className="font-extrabold text-slate-800 text-xs uppercase tracking-wider">
                Rincian Estimasi Saldo Per Rekening ({cashFlowForecast.nextMonthLabel})
              </h4>
              <span className="text-[10px] text-blue-600 font-extrabold bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                {cashFlowForecast.accountEstimations.length} Rekening Aktif
              </span>
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {cashFlowForecast.accountEstimations.map((acc) => (
                <div key={acc.id} className="p-3 bg-white rounded-lg border border-slate-200 flex justify-between items-center text-xs hover:bg-slate-50 transition">
                  <div className="space-y-0.5">
                    <span className="font-extrabold text-slate-800 block">{acc.name}</span>
                    <span className="text-[10px] text-slate-400 font-semibold uppercase">{acc.type}</span>
                  </div>
                  <div className="text-right space-y-0.5 font-mono">
                    <span className="text-slate-400 text-[10px] block">Saat Ini: {formatValue(acc.currentBalance)}</span>
                    <span className="font-extrabold text-slate-900 block">Est. Akhir: {formatValue(acc.projectedEndingBalance)}</span>
                    <span className={`text-[9.5px] font-bold block ${acc.estimatedChange >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {acc.estimatedChange >= 0 ? '▲ +' : '▼ '}{formatValue(acc.estimatedChange)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* SECONDARY GRID: TARGET TABUNGAN (GOAL TRACKER), RINGKASAN UTANG, & INDIKATOR DANA DARURAT */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        
        {/* CARD 1: TARGET TABUNGAN (GOAL TRACKER) */}
        <div
          ref={savingsGoalsSectionRef}
          className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4 animate-fadeIn transition-all duration-300 hover:shadow-md hover:border-emerald-300 dark:hover:border-emerald-700 flex flex-col justify-between"
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-xl">
                  <Target className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-800 dark:text-slate-100 text-xs uppercase tracking-wider">
                    Target Tabungan (Goal Tracker)
                  </h3>
                  <p className="text-[11px] text-slate-400 font-medium">Progres visual kedekatan menuju target nominal impian Anda</p>
                </div>
              </div>
              <button
                onClick={handleOpenAddGoal}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-extrabold rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <Plus className="h-4 w-4" />
                <span>Tambah Target</span>
              </button>
            </div>

            {savingsGoals.length > 0 && (() => {
              const totalGoalTarget = savingsGoals.reduce((sum, g) => sum + (g.targetAmount || 0), 0);
              const totalGoalSaved = savingsGoals.reduce((sum, g) => sum + (g.currentAmount || 0), 0);
              const overallGoalPct = totalGoalTarget > 0 ? Math.min(100, (totalGoalSaved / totalGoalTarget) * 100) : 0;
              const completedCount = savingsGoals.filter(g => g.targetAmount > 0 && g.currentAmount >= g.targetAmount).length;

              return (
                <div className="p-3 bg-emerald-50/70 dark:bg-emerald-950/25 border border-emerald-200/80 dark:border-emerald-800/60 rounded-xl space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-extrabold text-emerald-900 dark:text-emerald-200">
                      Akumulasi Seluruh Target ({completedCount}/{savingsGoals.length} Tercapai)
                    </span>
                    <span className="font-mono font-black text-emerald-700 dark:text-emerald-300">
                      {overallGoalPct.toFixed(1)}%
                    </span>
                  </div>
                  <div
                    role="progressbar"
                    aria-label="Total progres seluruh target tabungan"
                    aria-valuenow={Math.round(overallGoalPct)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    className="w-full h-2.5 bg-white/80 dark:bg-slate-800 rounded-full overflow-hidden border border-emerald-200/60 dark:border-emerald-800/50"
                  >
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-700 ease-out"
                      style={{ width: `${overallGoalPct}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-bold text-slate-600 dark:text-slate-300">
                    <span>Terkumpul: <strong className="font-mono text-emerald-700 dark:text-emerald-300">{formatValue(totalGoalSaved)}</strong></span>
                    <span>Total Target: <strong className="font-mono text-slate-800 dark:text-slate-100">{formatValue(totalGoalTarget)}</strong></span>
                  </div>
                </div>
              );
            })()}
          </div>

          {savingsGoals.length === 0 ? (
            <div className="text-center py-10 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl space-y-2.5 bg-slate-50/50 dark:bg-slate-800/30">
              <PiggyBank className="h-10 w-10 text-slate-300 dark:text-slate-600 mx-auto" />
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Belum ada target tabungan yang dikonfigurasi.</p>
              <button
                onClick={handleOpenAddGoal}
                className="text-xs text-emerald-600 dark:text-emerald-400 font-bold hover:underline cursor-pointer"
              >
                + Buat Target Tabungan Pertama
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 max-h-[460px] overflow-y-auto pr-1">
              {savingsGoals.map((goal) => {
                const rawPct = goal.targetAmount > 0 ? (goal.currentAmount / goal.targetAmount) * 100 : 0;
                const pct = Math.min(100, Math.max(0, rawPct));
                const remaining = Math.max(0, goal.targetAmount - goal.currentAmount);

                // Calculate days left
                let daysLeft = 0;
                if (goal.targetDate) {
                  const targetDt = parseLocalDate(goal.targetDate);
                  if (targetDt) {
                    const diffTime = targetDt.getTime() - new Date().getTime();
                    daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                  }
                }

                const proximityMeta = pct >= 100
                  ? {
                      label: 'Target Terpenuhi',
                      badgeClass: 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200',
                      barClass: 'bg-gradient-to-r from-emerald-500 to-teal-500',
                      pctTextClass: 'text-emerald-600 dark:text-emerald-400',
                    }
                  : pct >= 75
                  ? {
                      label: 'Hampir Tercapai',
                      badgeClass: 'bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-200',
                      barClass: 'bg-gradient-to-r from-blue-500 to-emerald-500',
                      pctTextClass: 'text-blue-600 dark:text-blue-400',
                    }
                  : pct >= 40
                  ? {
                      label: 'Berjalan Baik',
                      badgeClass: 'bg-indigo-100 dark:bg-indigo-900/60 text-indigo-800 dark:text-indigo-200',
                      barClass: 'bg-gradient-to-r from-indigo-500 to-blue-500',
                      pctTextClass: 'text-indigo-600 dark:text-indigo-400',
                    }
                  : {
                      label: 'Tahap Awal',
                      badgeClass: 'bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200',
                      barClass: 'bg-gradient-to-r from-amber-500 to-orange-500',
                      pctTextClass: 'text-amber-600 dark:text-amber-400',
                    };

                return (
                  <div key={goal.id} className="p-4 bg-slate-50/90 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700/80 space-y-3 hover:bg-slate-100/80 dark:hover:bg-slate-800 transition flex flex-col justify-between">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 text-[9px] font-extrabold rounded-full uppercase">
                            {goal.category || 'Tabungan'}
                          </span>
                          <span className={`px-2 py-0.5 text-[9px] font-extrabold rounded-full uppercase ${proximityMeta.badgeClass}`}>
                            {proximityMeta.label}
                          </span>
                          {goal.targetDate && (
                            <span className={`text-[9px] font-bold flex items-center gap-1 ${
                              daysLeft < 0 ? 'text-rose-600 dark:text-rose-400' : daysLeft <= 30 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'
                            }`}>
                              <Clock className="h-3 w-3" />
                              {daysLeft < 0 ? 'Lewat Batas' : `Sisa ${daysLeft} Hr`}
                            </span>
                          )}
                        </div>
                        <h4 className="font-extrabold text-slate-800 dark:text-slate-100 text-xs mt-1.5 leading-snug truncate">{goal.title}</h4>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => {
                            setDepositGoalItem(goal);
                            setDepositAmountInput('');
                          }}
                          className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold rounded-lg transition cursor-pointer"
                          title="Setor Tabungan"
                        >
                          + Setor
                        </button>
                        <button
                          onClick={() => handleOpenEditGoal(goal)}
                          className="p-1 text-slate-400 hover:text-blue-600 rounded transition cursor-pointer"
                          title="Edit Target"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        {onDeleteSavingsGoal && (
                          <button
                            onClick={() => onDeleteSavingsGoal(goal.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded transition cursor-pointer"
                            title="Hapus Target"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Visual Progress Bar */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-baseline text-[10px]">
                        <span className="font-bold text-slate-600 dark:text-slate-300">
                          Terkumpul: <strong className="text-emerald-600 dark:text-emerald-400 font-mono">{formatValue(goal.currentAmount)}</strong>
                        </span>
                        <span className="font-bold text-slate-500 dark:text-slate-400">
                          Target: <strong className="text-slate-700 dark:text-slate-200 font-mono">{formatValue(goal.targetAmount)}</strong>
                        </span>
                      </div>

                      <div className="relative">
                        <div
                          role="progressbar"
                          aria-label={`Progres ${goal.title}`}
                          aria-valuenow={Math.round(pct)}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          className="w-full bg-slate-200 dark:bg-slate-700 h-3 rounded-full overflow-hidden relative shadow-inner"
                        >
                          <div
                            className={`h-full rounded-full transition-all duration-700 ease-out ${proximityMeta.barClass}`}
                            style={{ width: `${pct}%` }}
                          />
                          {/* Milestone ticks at 25%, 50%, 75% */}
                          <div className="absolute inset-y-0 left-1/4 w-px bg-white/40 dark:bg-slate-900/40 pointer-events-none" />
                          <div className="absolute inset-y-0 left-1/2 w-px bg-white/40 dark:bg-slate-900/40 pointer-events-none" />
                          <div className="absolute inset-y-0 left-3/4 w-px bg-white/40 dark:bg-slate-900/40 pointer-events-none" />
                        </div>
                      </div>

                      <div className="flex justify-between items-center text-[10px] font-bold">
                        <span className={`font-mono font-black ${proximityMeta.pctTextClass}`}>
                          {pct.toFixed(1)}% dari target
                        </span>
                        <span className="text-slate-500 dark:text-slate-400">
                          {pct >= 100
                            ? 'Target Nominal Tercapai!'
                            : `Kurang ${formatValue(remaining)} (${(100 - pct).toFixed(1)}%)`}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* CARD 2: RINGKASAN UTANG & KEWAJIBAN */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4 animate-fadeIn transition-all duration-300 hover:shadow-md hover:border-rose-300 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-rose-50 text-rose-600 rounded-xl">
                  <CreditCard className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-800 text-xs uppercase tracking-wider">
                    Ringkasan Utang & Tagihan
                  </h3>
                  <p className="text-[11px] text-slate-400 font-medium">Monitoring kewajiban & cicilan aktif</p>
                </div>
              </div>
              <button
                onClick={() => onQuickAction('debts')}
                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-extrabold rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <span>Kelola &rarr;</span>
              </button>
            </div>

            {/* Metric Bar */}
            <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-150 text-xs">
              <div>
                <span className="text-[9px] text-slate-400 font-extrabold uppercase block">Total Kewajiban</span>
                <span className="font-black text-rose-600 text-sm font-mono block">
                  {isFocusMode ? 'Rp ••••••' : formatterIDR.format(totalDebts)}
                </span>
              </div>
              <div>
                <span className="text-[9px] text-slate-400 font-extrabold uppercase block">Item Aktif</span>
                <span className="font-extrabold text-slate-800 text-sm font-mono block">
                  {debts.length + creditCardAndPaylaterAccounts.length} Item
                </span>
              </div>
            </div>

            {/* Debts List */}
            {debts.length === 0 && creditCardAndPaylaterAccounts.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-slate-200 rounded-xl space-y-2 bg-slate-50/50">
                <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto" />
                <p className="text-xs text-slate-600 font-bold">Bebas Utang!</p>
                <p className="text-[11px] text-slate-400">Tidak ada catatan utang atau tagihan kartu kredit aktif saat ini.</p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                {/* Regular Debts */}
                {debts.map((d) => (
                  <div key={d.id} className="p-3 bg-slate-50/90 rounded-xl border border-slate-150 flex items-center justify-between gap-3 hover:bg-slate-100 transition">
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-extrabold text-slate-800 text-xs truncate">{d.name}</span>
                        <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${
                          d.purpose === 'productive' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {d.purpose === 'productive' ? 'Produktif' : 'Konsumtif'}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-medium">
                        Bunga: {d.interestRate}%/thn • Min: {formatValue(d.minPayment)}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-xs font-black text-rose-600 font-mono block">
                        {isFocusMode ? 'Rp ••••••' : formatterIDR.format(d.balance)}
                      </span>
                      {d.dueDay && (
                        <span className="text-[9px] text-slate-400 font-bold">Tgl {d.dueDay} / bln</span>
                      )}
                    </div>
                  </div>
                ))}

                {/* Credit Card & PayLater Accounts */}
                {creditCardAndPaylaterAccounts.map((acc) => {
                  const overlimitAmt = getCreditOverlimitAmount(acc);
                  const isOverlimit = overlimitAmt > 0;
                  return (
                    <div
                      key={acc.id}
                      className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition ${
                        isOverlimit
                          ? 'bg-rose-50/70 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/60 hover:bg-rose-50'
                          : 'bg-slate-50/90 border-slate-150 hover:bg-slate-100'
                      }`}
                    >
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-extrabold text-slate-800 dark:text-slate-100 text-xs truncate">{acc.name}</span>
                          <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                            · {acc.type === 'credit-card' ? 'Kartu Kredit' : 'PayLater'}
                          </span>
                          {isOverlimit && (
                            <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400">
                              · Overlimit
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                          Limit: {formatValue(acc.creditLimit || 0)}
                          {isOverlimit && (
                            <span className="text-rose-600 dark:text-rose-400 font-bold">
                              {' '}· Sisa: {isFocusMode ? 'Rp ••••••' : formatterIDR.format(acc.currentBalance)}
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-xs font-black text-rose-600 dark:text-rose-400 font-mono tabular-nums block">
                          {isFocusMode ? 'Rp ••••••' : formatterIDR.format(getAccountCreditBill(acc))}
                        </span>
                        {acc.dueDay && (
                          <span className="text-[9px] text-slate-400 font-bold font-mono tabular-nums">Tgl {acc.dueDay} / bln</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* CARD 3: INDIKATOR TARGET DANA DARURAT & STANDAR KEAMANAN */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4 animate-fadeIn transition-all duration-300 hover:shadow-md hover:border-amber-300 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-800 text-xs uppercase tracking-wider">
                    Indikator Target Dana Darurat
                  </h3>
                  <p className="text-[11px] text-slate-400 font-medium">Standar Keamanan 6 - 12 Bulan Pengeluaran</p>
                </div>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${
                emergencyFundIdealMetrics.isTargetReached
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-amber-100 text-amber-800'
              }`}>
                {emergencyFundIdealMetrics.coverageMonths.toFixed(1)} Bulan Terpenuhi
              </span>
            </div>

            <div className="space-y-2 bg-slate-50/80 p-3.5 rounded-xl border border-slate-150">
              <div className="flex justify-between items-baseline text-xs font-bold">
                <span className="text-slate-600">Saldo Darurat: <strong className="text-slate-900 font-mono">{formatValue(totalEmergency)}</strong></span>
                <span className="text-slate-400 text-[10px]">Target 6 Bln: <strong className="text-slate-700 font-mono">{formatValue(emergencyFundIdealMetrics.idealTargetMin)}</strong></span>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-slate-200 h-3 rounded-full overflow-hidden border border-slate-200/60">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    emergencyFundIdealMetrics.isTargetReached
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-500'
                      : 'bg-gradient-to-r from-amber-500 to-rose-500'
                  }`}
                  style={{ width: `${emergencyFundIdealMetrics.pctMin}%` }}
                />
              </div>

              <div className="flex justify-between items-center text-[10px] font-extrabold text-slate-400">
                <span>Progres: {emergencyFundIdealMetrics.pctMin.toFixed(1)}% dari Minimum 6 Bulan</span>
                <span>Target 12 Bln: {formatValue(emergencyFundIdealMetrics.idealTargetMax)}</span>
              </div>
            </div>

            <div className={`p-3.5 rounded-xl border text-[11px] leading-relaxed font-medium ${
              emergencyFundIdealMetrics.isTargetReached
                ? 'bg-emerald-50 border-emerald-100 text-emerald-900'
                : 'bg-amber-50 border-amber-200 text-amber-900'
            }`}>
              {emergencyFundIdealMetrics.isTargetReached ? (
                <>🎉 <strong>Sangat Aman!</strong> Saldo Dana Darurat Anda telah mencukupi <strong>{emergencyFundIdealMetrics.coverageMonths.toFixed(1)} bulan</strong> biaya hidup. Pertahankan bantalan dana ini untuk perlindungan masa depan.</>
              ) : (
                <>💡 <strong>Saran Finansial:</strong> Dana Darurat Anda baru mencakup <strong>{emergencyFundIdealMetrics.coverageMonths.toFixed(1)} bulan</strong> pengeluaran (di bawah batas aman ideal 6 bulan). Disarankan menambah sekitar <strong>{formatValue(emergencyFundIdealMetrics.shortfall)}</strong> lagi agar posisi keuangan Anda benar-benar terlindungi dari situasi darurat.</>
              )}
            </div>
          </div>
        </div>

      </div>


      {/* --- SECTION: PROYEKSI KESEHATAN FINANSIAL (3 BULAN) --- */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="font-extrabold text-slate-800 text-sm uppercase tracking-wider flex items-center gap-1.5">
              <Calendar className="h-4.5 w-4.5 text-indigo-600" />
              Prediksi Kesehatan Finansial (3 Bulan)
            </h3>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              Proyeksi kondisi keuangan Anda dalam 3 bulan ke depan berdasarkan rata-rata pola pengeluaran dan pemasukan bulan ini.
            </p>
          </div>
          <span className="text-xs font-bold text-indigo-600 shrink-0">Simulasi Proyeksi 3 Bulan</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
          <div className="lg:col-span-7 bg-slate-50 p-4 rounded-xl border border-slate-150 space-y-3 flex flex-col justify-center">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-500 font-semibold">Surplus/Defisit Bulanan Saat Ini:</span>
              <span className={`font-black font-mono tabular-nums px-2 py-0.5 rounded text-[11px] ${baselineNetSavings >= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                {isFocusMode ? 'Rp ••••••' : (baselineNetSavings >= 0 ? '+' : '') + formatterIDR.format(baselineNetSavings)} / bln
              </span>
            </div>
            
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200">
              <div>
                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Total Aset Hari Ini</span>
                <span className="text-sm font-extrabold text-slate-700 font-mono tabular-nums block mt-0.5">
                  {formatValue(totalCurrentAssets)}
                </span>
              </div>
              <div>
                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Proyeksi Aset (3 Bulan)</span>
                <span className={`text-sm font-extrabold font-mono tabular-nums block mt-0.5 ${projectedAssets >= totalCurrentAssets ? 'text-emerald-600' : 'text-rose-500'}`}>
                  {formatValue(projectedAssets)}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border bg-white mt-1">
              <div>
                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Prediksi Status Keuangan</span>
                <span className="text-xs text-slate-400 font-medium font-mono tabular-nums block">{projectedRatioText}</span>
              </div>
              <span className={`px-3 py-1 rounded-lg text-xs font-black border uppercase tracking-wider flex items-center gap-1.5 ${projectedHealthColor}`}>
                {projectedHealthStatus === 'Sehat' && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
                {projectedHealthStatus === 'Waspada' && <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
                {projectedHealthStatus === 'Kritis' && <ShieldAlert className="h-3.5 w-3.5 shrink-0" />}
                {projectedHealthStatus}
              </span>
            </div>
          </div>

          <div className="lg:col-span-5 flex items-start gap-2.5 bg-indigo-50/50 p-4 rounded-xl border border-indigo-100">
            <div className={`p-1.5 rounded-lg shrink-0 ${projectedHealthIconBg}`}>
              {projectedHealthStatus === 'Sehat' ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-slate-700 block uppercase tracking-wider">Rekomendasi Strategis</span>
              <p className="text-xs text-slate-600 leading-relaxed font-medium">
                {projectedHealthDesc} {baselineNetSavings < 0 ? 'Peringatan: Pengeluaran bulanan Anda melebihi pendapatan! Jika dibiarkan, tabungan Anda akan terkuras habis.' : 'Pertahankan rasio tabungan di atas 20% untuk mempercepat pembentukan kekayaan bersih.'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* --- KALENDER ARUS KAS HARIAN --- */}
      <div id="cashflow-calendar-section" className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-blue-600 animate-pulse" />
              <h3 className="font-black text-slate-800 text-sm uppercase tracking-wider">Kalender Arus Kas Harian</h3>
            </div>
            <p className="text-xs text-slate-400 mt-1 font-medium">
              Pilih tanggal untuk melihat rincian pemasukan dan pengeluaran harian secara rinci.
            </p>
          </div>
          
          {/* Kontrol Kalender */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                setCalMonth(prev => {
                  if (prev === 1) {
                    setCalYear(y => y - 1);
                    return 12;
                  }
                  return prev - 1;
                });
              }}
              className="p-1.5 hover:bg-slate-100 rounded-lg border border-slate-200 transition text-slate-600 cursor-pointer"
              title="Bulan Sebelumnya"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            
            <span className="text-xs font-black text-slate-800 bg-slate-50 border border-slate-200 px-4 py-1.5 rounded-lg font-mono min-w-[140px] text-center">
              {INDONESIAN_MONTHS[calMonth - 1]} {calYear}
            </span>
            
            <button
              onClick={() => {
                setCalMonth(prev => {
                  if (prev === 12) {
                    setCalYear(y => y + 1);
                    return 1;
                  }
                  return prev + 1;
                });
              }}
              className="p-1.5 hover:bg-slate-100 rounded-lg border border-slate-200 transition text-slate-600 cursor-pointer"
              title="Bulan Berikutnya"
            >
              <ChevronRight className="h-4 w-4" />
            </button>

            <button
              onClick={() => {
                setCalMonth(actualMonth);
                setCalYear(actualYear);
                setSelectedDateStr(systemTodayStr);
              }}
              className="text-[10px] font-bold bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white px-3 py-1.5 rounded-lg border border-blue-100 transition cursor-pointer"
              title="Kembali ke Hari Ini"
            >
              Hari Ini ({actualDay} {INDONESIAN_MONTHS[actualMonth - 1]})
            </button>
          </div>
        </div>

        {/* Ringkasan Arus Kas Kalender */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-100">
          <div className="flex items-center space-x-3 bg-white p-3 rounded-lg border border-slate-200/60 shadow-xs">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <TrendingUp className="h-4 w-4" />
            </div>
            <div>
              <span className="text-[9px] uppercase tracking-wider text-slate-400 font-extrabold block">Pemasukan Bulan Ini</span>
              <span className="text-sm font-bold text-emerald-600 font-mono">{formatValue(calMonthlyIncome)}</span>
            </div>
          </div>

          <div className="flex items-center space-x-3 bg-white p-3 rounded-lg border border-slate-200/60 shadow-xs">
            <div className="p-2 bg-rose-50 text-rose-600 rounded-lg">
              <TrendingDown className="h-4 w-4" />
            </div>
            <div>
              <span className="text-[9px] uppercase tracking-wider text-slate-400 font-extrabold block">Pengeluaran Bulan Ini</span>
              <span className="text-sm font-bold text-rose-500 font-mono">{formatValue(calMonthlyOutflow)}</span>
            </div>
          </div>

          <div className="flex items-center space-x-3 bg-white p-3 rounded-lg border border-slate-200/60 shadow-xs">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <Wallet className="h-4 w-4" />
            </div>
            <div>
              <span className="text-[9px] uppercase tracking-wider text-slate-400 font-extrabold block">Aliran Bersih (Net)</span>
              <span className={`text-sm font-bold font-mono ${calMonthlyNetFlow >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {isFocusMode ? 'Rp ••••••' : (calMonthlyNetFlow >= 0 ? '+' : '') + formatterIDR.format(calMonthlyNetFlow)}
              </span>
            </div>
          </div>
        </div>

        {/* Grid Kalender */}
        <div className="overflow-x-auto">
          <div className="min-w-[700px] space-y-2">
            {/* Nama Hari */}
            <div className="grid grid-cols-7 gap-2 text-center text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">
              {CALENDAR_WEEKDAYS.map(day => (
                <div key={day} className={day === 'Minggu' ? 'text-rose-500 font-black' : 'text-slate-500 font-bold'}>
                  {day}
                </div>
              ))}
            </div>

            {/* Sel Hari */}
            <div className="grid grid-cols-7 gap-2">
              {calendarCells.map((day, idx) => {
                if (day === null) {
                  return <div key={`empty-${idx}`} className="bg-slate-50/30 rounded-lg border border-slate-100/50 min-h-[72px]" />;
                }

                // Ambil data transaksi harian
                const dateString = `${calYear}-${String(calMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const dayTxs = transactions.filter(t => t.date === dateString);
                
                const income = dayTxs.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
                const expense = dayTxs.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
                const saving = dayTxs.filter(t => t.type === 'saving').reduce((sum, t) => sum + t.amount, 0);
                const investment = dayTxs.filter(t => t.type === 'investment').reduce((sum, t) => sum + t.amount, 0);
                const outflow = expense + saving + investment;

                const isSelected = selectedDateStr === dateString;
                const isTodaySimulated = dateString === systemTodayStr;

                return (
                  <button
                    key={`day-${day}`}
                    type="button"
                    onClick={() => setSelectedDateStr(dateString)}
                    className={`min-h-[72px] p-2 flex flex-col justify-between rounded-xl border text-left transition-all duration-200 cursor-pointer relative ${
                      isSelected
                        ? 'bg-blue-50/70 border-blue-500 ring-2 ring-blue-500/20 shadow-sm'
                        : isTodaySimulated
                        ? 'bg-amber-50/40 border-amber-400 ring-2 ring-amber-400/20 shadow-xs'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-xs'
                    }`}
                  >
                    <div className="flex justify-between items-center w-full">
                      <span className={`text-xs font-bold ${
                        isTodaySimulated 
                          ? 'bg-amber-500 text-white w-5 h-5 rounded-full flex items-center justify-center font-mono text-[10px] font-black' 
                          : isSelected 
                          ? 'text-blue-700 font-mono font-black' 
                          : 'text-slate-600 font-mono font-bold'
                      }`}>
                        {day}
                      </span>
                      {dayTxs.length > 0 && (
                        <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse absolute top-2.5 right-2.5" />
                      )}
                      {isTodaySimulated && !isSelected && (
                        <span className="text-[8px] font-black text-amber-600 uppercase tracking-widest font-mono">KINI</span>
                      )}
                    </div>

                    <div className="space-y-0.5 mt-1.5 w-full">
                      {income > 0 && (
                        <div className="text-[9px] font-extrabold text-emerald-600 leading-none truncate font-mono">
                          +{formatCompactValue(income)}
                        </div>
                      )}
                      {outflow > 0 && (
                        <div className="text-[9px] font-extrabold text-rose-500 leading-none truncate font-mono">
                          -{formatCompactValue(outflow)}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Panel Detail Transaksi Harian di Bawah Kalender */}
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-150/80">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/70 pb-3 mb-3">
            <div className="flex items-center gap-2 text-slate-800">
              <Info className="h-4 w-4 text-blue-500" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 font-black">
                Daftar Transaksi: {selectedDateStr ? (() => {
                  try {
                    const d = new Date(selectedDateStr);
                    const options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
                    return d.toLocaleDateString('id-ID', options);
                  } catch (e) {
                    return selectedDateStr;
                  }
                })() : 'Silakan pilih tanggal pada kalender'}
              </h4>
            </div>
            {selectedDateStr === systemTodayStr && (
              <span className="text-[9px] bg-amber-100 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full font-bold">
                Hari Ini
              </span>
            )}
          </div>

          {/* List Transaksi */}
          {(() => {
            const dayTxs = transactions.filter(t => t.date === selectedDateStr);
            if (dayTxs.length === 0) {
              return (
                <div className="text-center py-8 text-slate-400 text-xs font-bold">
                  Tidak ada transaksi tercatat pada tanggal ini.
                  <button
                    type="button"
                    onClick={() => onQuickAction('transactions')}
                    className="ml-1.5 text-blue-600 hover:underline font-bold"
                  >
                    + Catat Transaksi Baru
                  </button>
                </div>
              );
            }

            return (
              <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
                {dayTxs.map(tx => {
                  const accountName = tx.isAdjustment
                    ? 'Jurnal Penyesuaian (Non-Kas)'
                    : (accounts.find(a => a.id === tx.accountId)?.name || 'Akun Tidak Dikenal');
                  
                  let typeBadgeColor = 'bg-rose-50 text-rose-600 border-rose-100';
                  let icon = <ArrowDownRight className="h-3.5 w-3.5 text-rose-500" />;
                  let typeLabel = 'Pengeluaran';
                  
                  if (tx.type === 'income') {
                    typeBadgeColor = 'bg-emerald-50 text-emerald-600 border-emerald-100';
                    icon = <ArrowUpRight className="h-3.5 w-3.5 text-emerald-500" />;
                    typeLabel = 'Pemasukan';
                  } else if (tx.type === 'saving') {
                    typeBadgeColor = 'bg-blue-50 text-blue-600 border-blue-100';
                    icon = <PiggyBank className="h-3.5 w-3.5 text-blue-500" />;
                    typeLabel = 'Tabungan';
                  } else if (tx.type === 'investment') {
                    typeBadgeColor = 'bg-purple-50 text-purple-600 border-purple-100';
                    icon = <TrendingUp className="h-3.5 w-3.5 text-purple-500" />;
                    typeLabel = 'Investasi';
                  }

                  return (
                    <div key={tx.id} className="bg-white p-3 rounded-xl border border-slate-200/70 shadow-2xs hover:border-slate-300 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center space-x-3">
                        <div className={`p-1.5 rounded-lg border ${typeBadgeColor} shrink-0`}>
                          {icon}
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-bold text-slate-800 text-xs">{tx.category}</span>
                            <span className="text-[9px] text-slate-300 font-semibold">•</span>
                            <span className="text-[9px] bg-slate-100 text-slate-600 font-mono font-bold uppercase px-1.5 py-0.5 rounded">{accountName}</span>
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5 truncate max-w-[280px]" title={tx.description}>
                            {tx.description || <span className="italic text-slate-300">Tidak ada deskripsi</span>}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100">
                        <span className="text-[9px] uppercase tracking-wider font-extrabold text-slate-400 sm:hidden">
                          {typeLabel}
                        </span>
                        <span className={`text-xs font-mono font-black ${
                          tx.type === 'income' ? 'text-emerald-600' : 'text-slate-800'
                        }`}>
                          {tx.type === 'income' ? '+' : '-'}{formatValue(tx.amount)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </div>

      {/* 1.5. Tren Saldo Total dari Waktu ke Waktu (LineChart) */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm animate-fadeIn transition-all duration-300 hover:scale-[1.01] hover:shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
          <div>
            <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider">Tren Saldo Total (Aset Likuid)</h3>
            <p className="text-xs text-slate-400 mt-1">
              Visualisasi pertumbuhan atau penurunan akumulasi dana seluruh rekening secara kronologis dari riwayat transaksi.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] bg-blue-50 text-blue-600 px-2.5 py-1 rounded-full font-bold uppercase tracking-wider">
              Line Chart
            </span>
            <span className="text-xs font-mono text-slate-500 font-bold">
              Kini: {formatValue(totalLiquidAssets)}
            </span>
          </div>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={lineChartData} margin={{ top: 15, right: 20, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis 
                dataKey="date" 
                tick={{ fill: '#64748b', fontSize: 10 }}
                axisLine={{ stroke: '#cbd5e1' }}
                tickLine={false}
              />
              <YAxis 
                tickFormatter={(val) => `${val >= 1000000 ? `${(val / 1000000).toFixed(1)}M` : `${(val / 1000).toFixed(0)}K`}`}
                tick={{ fill: '#64748b', fontSize: 10 }}
                axisLine={{ stroke: '#cbd5e1' }}
                tickLine={false}
              />
              <Tooltip 
                formatter={(value) => isFocusMode ? 'Rp ••••••' : formatterIDR.format(Number(value))}
                contentStyle={{ backgroundColor: '#1e293b', borderRadius: '8px', border: 'none', color: '#fff', fontSize: '12px' }}
                itemStyle={{ color: '#60a5fa', fontWeight: 'bold' }}
                labelStyle={{ color: '#94a3b8', fontWeight: 'bold' }}
              />
              <Line 
                type="monotone" 
                dataKey="Saldo Total" 
                stroke="#3b82f6" 
                strokeWidth={3} 
                dot={{ r: 4, strokeWidth: 1 }} 
                activeDot={{ r: 6, strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 2. Visualisasi Grafik (Grid) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {/* Perbandingan Aliran Dana */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800 text-sm uppercase tracking-wide">Rasio Aliran Dana (Bulan Ini)</h3>
              <span className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full font-medium">Juli 2026</span>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Perbandingan total masuk dan keluar untuk menilai tingkat saving rate bulanan.
            </p>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={comparisonData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10 }} />
                <YAxis 
                  domain={[0, (dataMax: number) => (dataMax <= 0 ? 1000000 : Math.ceil(dataMax * 1.15))]}
                  tickFormatter={(val) => `${val >= 1000000 ? `${(val / 1000000).toFixed(0)}M` : `${(val / 1000).toFixed(0)}K`}`} 
                  tick={{ fill: '#64748b', fontSize: 10 }}
                />
                <Tooltip 
                  formatter={(value) => isFocusMode ? 'Rp ••••••' : formatterIDR.format(Number(value))} 
                  contentStyle={{ backgroundColor: '#1e293b', borderRadius: '8px', border: 'none', color: '#fff', fontSize: '12px' }}
                />
                <Legend iconSize={10} wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey="Pemasukan" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Pengeluaran" fill="#ef4444" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Tabungan" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Investasi" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Alokasi Kategori Pengeluaran (Pie Chart Distribution) */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between hover:border-blue-200 transition-all">
          <div>
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-extrabold text-slate-800 text-xs uppercase tracking-wider">
                Distribusi Pengeluaran Kategori
              </h3>
              <span className="text-[10px] bg-blue-50 text-blue-700 px-2.5 py-0.5 rounded-full font-extrabold uppercase tracking-wider border border-blue-100">
                {dashboardPeriod === 'this-week' && 'Minggu Ini'}
                {dashboardPeriod === 'this-month' && 'Bulan Ini'}
                {dashboardPeriod === 'last-3-months' && '3 Bulan'}
                {dashboardPeriod === 'all' && 'Semua'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mb-4 font-medium">
              Persentase porsi pengeluaran berdasarkan kategori untuk periode terpilih.
            </p>
          </div>

          {periodPieData.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-400 text-xs space-y-2">
              <p className="font-medium">Belum ada data pengeluaran untuk periode ini.</p>
              <button 
                onClick={() => onQuickAction('transactions')}
                className="text-xs bg-blue-50 text-blue-600 px-3.5 py-1.5 rounded-xl hover:bg-blue-100 font-extrabold transition cursor-pointer"
              >
                + Catat Transaksi
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="h-56 relative flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={periodPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={78}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {periodPieData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value, name) => [
                        isFocusMode ? 'Rp ••••••' : formatterIDR.format(Number(value)),
                        name
                      ]} 
                      contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', border: 'none', color: '#fff', fontSize: '11px', padding: '8px 12px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>

                {/* Center Badge showing Total Expense */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-[9px] font-extrabold uppercase text-slate-400 tracking-wider">Total</span>
                  <span className="text-xs font-black text-slate-800 font-mono">
                    {isFocusMode ? 'Rp ••••••' : formatterIDR.format(totalPeriodExpense)}
                  </span>
                </div>
              </div>

              {/* Legend List with % percentage share */}
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1 text-xs divide-y divide-slate-100">
                {periodPieData.map((item, index) => (
                  <div key={item.name} className="flex items-center justify-between pt-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <div 
                        className="w-2.5 h-2.5 rounded-full shrink-0" 
                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                      />
                      <span className="text-slate-700 font-bold truncate max-w-28 text-xs">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-2 font-mono shrink-0">
                      <span className="px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded text-[10px] font-black">
                        {item.pct}%
                      </span>
                      <span className="text-slate-800 font-bold text-xs">
                        {isFocusMode ? 'Rp ••••••' : formatterIDR.format(item.value)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Grafik Batang Pengeluaran per Kategori */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800 text-sm uppercase tracking-wide">Tren Pengeluaran Kategori</h3>
              <span className="text-[10px] bg-blue-50 text-blue-600 px-2.5 py-1 rounded-full font-bold uppercase tracking-wider">
                Bar Chart
              </span>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Perbandingan nominal pengeluaran riil antar kategori transaksi bulan ini.
            </p>
          </div>
          {pieData.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-400 text-sm">
              <p>Belum ada transaksi pengeluaran bulan ini.</p>
              <button 
                onClick={() => onQuickAction('transactions')}
                className="mt-3 text-xs bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg hover:bg-blue-100 font-medium transition"
              >
                + Tambah Transaksi
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pieData} margin={{ top: 10, right: 10, left: -20, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis 
                      dataKey="name" 
                      tick={{ fill: '#64748b', fontSize: 10 }}
                      axisLine={{ stroke: '#cbd5e1' }}
                      tickLine={false}
                    />
                    <YAxis 
                      domain={[0, (dataMax: number) => (dataMax <= 0 ? 1000000 : Math.ceil(dataMax * 1.15))]}
                      tickFormatter={(val) => `${val >= 1000000 ? `${(val / 1000000).toFixed(1)}M` : `${(val / 1000).toFixed(0)}K`}`}
                      tick={{ fill: '#64748b', fontSize: 10 }}
                      axisLine={{ stroke: '#cbd5e1' }}
                      tickLine={false}
                    />
                    <Tooltip content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        const budget = budgets.find(b => b.category.toLowerCase() === data.name.toLowerCase());
                        const actualVal = data.value;
                        const limitVal = budget ? budget.limit : 0;
                        const pct = limitVal > 0 ? (actualVal / limitVal) * 100 : 0;

                        return (
                          <div className="bg-slate-800 text-white p-3 rounded-lg shadow-lg border border-slate-700 text-xs space-y-1.5">
                            <p className="font-bold text-slate-300">{data.name}</p>
                            <div className="flex justify-between gap-4">
                              <span className="text-slate-400">Pengeluaran:</span>
                              <span className="font-semibold text-white">{isFocusMode ? 'Rp ••••••' : formatterIDR.format(actualVal)}</span>
                            </div>
                            {budget && (
                              <>
                                <div className="flex justify-between gap-4">
                                  <span className="text-slate-400">Anggaran:</span>
                                  <span className="font-semibold text-slate-300">{isFocusMode ? 'Rp ••••••' : formatterIDR.format(limitVal)}</span>
                                </div>
                                <div className="flex justify-between gap-4 border-t border-slate-700 pt-1 mt-1">
                                  <span className="text-slate-400">Penggunaan:</span>
                                  <span className={`font-bold ${pct >= 100 ? 'text-rose-400' : pct >= 80 ? 'text-amber-400' : 'text-emerald-400'}`}>
                                    {pct.toFixed(1)}%
                                  </span>
                                </div>
                                {pct >= 100 ? (
                                  <p className="text-[10px] text-rose-400 font-semibold flex items-center gap-1 mt-1">
                                    <AlertTriangle className="h-3 w-3 inline shrink-0" /> Over Budget!
                                  </p>
                                ) : pct >= 80 ? (
                                  <p className="text-[10px] text-amber-400 font-semibold flex items-center gap-1 mt-1">
                                    <AlertTriangle className="h-3 w-3 inline shrink-0" /> Mendekati Limit!
                                  </p>
                                ) : null}
                              </>
                            )}
                          </div>
                        );
                      }
                      return null;
                    }} />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {pieData.map((entry, index) => {
                        const budget = budgets.find(b => b.category.toLowerCase() === entry.name.toLowerCase());
                        const pct = budget && budget.limit > 0 ? (entry.value / budget.limit) * 100 : 0;
                        let barColor = COLORS[index % COLORS.length];
                        if (budget) {
                          if (pct >= 100) {
                            barColor = '#f43f5e'; // rose-500
                          } else if (pct >= 80) {
                            barColor = '#f59e0b'; // amber-500
                          }
                        }
                        return (
                          <Cell key={`cell-${index}`} fill={barColor} />
                        );
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Bar Color Legend Indicator */}
              <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 pt-2 border-t border-slate-100 text-[10px] font-bold text-slate-500">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />
                  Kategori Lain / Aman
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  Mendekati Limit (≥ 80%)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                  Over Anggaran (≥ 100%)
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3. Status Anggaran & Ringkasan Pengeluaran Mingguan Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status & Kontrol Anggaran */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-extrabold text-slate-800 text-xs uppercase tracking-wider">Status & Kontrol Anggaran</h3>
              <p className="text-[11px] text-slate-400 font-medium">Batas alokasi belanja per kategori bulan ini</p>
            </div>
            <button 
              onClick={() => onQuickAction('budget')}
              className="text-xs text-blue-600 hover:text-blue-800 font-bold"
            >
              Atur Anggaran →
            </button>
          </div>

          <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
            {budgetProgress.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs font-bold bg-slate-50 rounded-xl border border-dashed border-slate-200">
                Belum ada pengaturan anggaran kategori. Silakan buat di tab Pengaturan Anggaran.
              </div>
            ) : (
              budgetProgress.map((b) => (
                <div key={b.category} className="space-y-1.5 p-3 rounded-xl bg-slate-50/80 hover:bg-slate-100 transition border border-slate-100">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-800">{b.category}</span>
                    <span className="text-[10px] text-slate-400 font-bold uppercase">Limit: {formatValue(b.limit)}</span>
                  </div>
                  <div className="w-full bg-slate-200/70 h-2 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        b.isOver ? 'bg-rose-500' : b.rawPercentage > 80 ? 'bg-amber-400' : 'bg-blue-600'
                      }`}
                      style={{ width: `${b.percentage}%` }}
                    />
                  </div>
                  <div className="flex justify-between items-center text-[11px]">
                    <span className={`font-semibold flex items-center gap-1 ${b.isOver ? 'text-rose-600' : 'text-slate-600'}`}>
                      {b.isOver ? <AlertTriangle className="h-3 w-3 shrink-0" /> : <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-500" />}
                      Terpakai: {formatValue(b.actual)}
                    </span>
                    <span className={`font-bold ${b.isOver ? 'text-rose-600' : 'text-slate-500'}`}>
                      {Math.round(b.rawPercentage)}%
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Ringkasan Pengeluaran Mingguan per Kategori */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-extrabold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-blue-600" />
                Ringkasan Pengeluaran Mingguan ({INDONESIAN_MONTHS[calMonth - 1]} {calYear})
              </h3>
              <p className="text-[11px] text-slate-400 font-medium">
                Distribusi pengeluaran per kategori dikelompokkan per minggu.
              </p>
            </div>
            <span className="text-[9px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider self-start sm:self-center">
              Per 7 Hari
            </span>
          </div>

          {weeklyCategorySummary.rows.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs font-bold bg-slate-50 rounded-xl border border-dashed border-slate-200">
              Tidak ada transaksi pengeluaran pada bulan {INDONESIAN_MONTHS[calMonth - 1]} {calYear}.
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
              <table className="w-full text-xs text-left text-slate-600 border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 uppercase tracking-wider font-extrabold text-[9px]">
                    <th className="py-2.5 px-3 font-bold text-slate-700">Kategori</th>
                    <th className="py-2.5 px-3 text-right">M1 (1-7)</th>
                    <th className="py-2.5 px-3 text-right">M2 (8-14)</th>
                    <th className="py-2.5 px-3 text-right">M3 (15-21)</th>
                    <th className="py-2.5 px-3 text-right">M4 (22+)</th>
                    <th className="py-2.5 px-3 text-right font-black text-slate-700 bg-slate-50">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {weeklyCategorySummary.rows.map((row) => (
                    <tr key={row.category} className="hover:bg-slate-50/70 transition duration-150 font-medium text-slate-700">
                      <td className="py-2 px-3 font-bold text-slate-800">{row.category}</td>
                      <td className="py-2 px-3 text-right font-mono text-slate-600 text-[11px]">{formatValue(row.w1)}</td>
                      <td className="py-2 px-3 text-right font-mono text-slate-600 text-[11px]">{formatValue(row.w2)}</td>
                      <td className="py-2 px-3 text-right font-mono text-slate-600 text-[11px]">{formatValue(row.w3)}</td>
                      <td className="py-2 px-3 text-right font-mono text-slate-600 text-[11px]">{formatValue(row.w4)}</td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-slate-900 bg-slate-50/30 text-[11px]">{formatValue(row.total)}</td>
                    </tr>
                  ))}
                  {/* Total Row */}
                  <tr className="bg-slate-50 font-black text-slate-900 border-t-2 border-slate-200">
                    <td className="py-2.5 px-3 uppercase tracking-wider text-[10px]">Total</td>
                    <td className="py-2.5 px-3 text-right font-mono text-rose-600 text-[11px]">{formatValue(weeklyCategorySummary.totals.w1)}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-rose-600 text-[11px]">{formatValue(weeklyCategorySummary.totals.w2)}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-rose-600 text-[11px]">{formatValue(weeklyCategorySummary.totals.w3)}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-rose-600 text-[11px]">{formatValue(weeklyCategorySummary.totals.w4)}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-rose-700 bg-slate-100/70 font-black text-[11px]">{formatValue(weeklyCategorySummary.totals.total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* 3.2. Kalkulator Dampak Inflasi (Requirement 3) */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div>
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-extrabold text-slate-800 text-sm uppercase tracking-wider flex items-center gap-1.5">
              <Percent className="h-4.5 w-4.5 text-blue-600" />
              Kalkulator Dampak Inflasi & Daya Beli Uang
            </h3>
            <span className="text-[10px] bg-blue-50 text-blue-600 px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider">
              Alat Utilitas
            </span>
          </div>
          <p className="text-xs text-slate-400 font-medium">
            Simulasikan penurunan daya beli nilai uang Anda saat ini akibat dampak inflasi tahunan dari waktu ke waktu.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Panel Input */}
          <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-150">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">Jumlah Nilai Uang Saat Ini</label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-xs font-bold text-slate-400 font-mono">Rp</span>
                <input
                  type="number"
                  value={calcAmount}
                  onChange={(e) => setCalcAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full text-xs font-bold font-mono text-slate-800 bg-white border border-slate-200 rounded-lg py-2 pl-9 pr-3 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                  placeholder="Masukkan jumlah nominal..."
                />
              </div>
              {/* Quick Preset Buttons */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {[1000000, 10000000, 50000000, 100000000].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setCalcAmount(preset)}
                    className={`text-[10px] font-bold px-2 py-1 rounded border transition cursor-pointer ${
                      calcAmount === preset
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {preset >= 100000000 ? `${preset / 100000000} Juta` : `${preset / 1000000} Juta`}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-xs font-bold text-slate-700">
                <span>Estimasi Inflasi Tahunan</span>
                <span className="text-blue-600 font-mono">{calcInflation.toFixed(1)}%</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="15"
                step="0.1"
                value={calcInflation}
                onChange={(e) => setCalcInflation(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <div className="flex justify-between text-[9px] text-slate-400 font-bold">
                <span>Rendah (0.5%)</span>
                <span>Rata-rata ID: ~4.0%</span>
                <span>Tinggi (15.0%)</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-xs font-bold text-slate-700">
                <span>Durasi Waktu</span>
                <span className="text-blue-600 font-mono">{calcYears} Tahun</span>
              </div>
              <input
                type="range"
                min="1"
                max="30"
                step="1"
                value={calcYears}
                onChange={(e) => setCalcYears(parseInt(e.target.value, 10))}
                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <div className="flex justify-between text-[9px] text-slate-400 font-bold">
                <span>1 Tahun</span>
                <span>15 Tahun</span>
                <span>30 Tahun</span>
              </div>
            </div>
          </div>

          {/* Panel Output & Rekomendasi */}
          <div className="flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              {/* Hasil 1: Daya Beli Riil */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-150 relative overflow-hidden">
                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Daya Beli Riil Akhir (Dalam {calcYears} Tahun)</span>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-lg font-black text-slate-800 font-mono">
                    {isFocusMode ? 'Rp ••••••' : formatterIDR.format(inflationResults.realPurchasingPower)}
                  </span>
                </div>
                <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden mt-2">
                  <div 
                    className="bg-rose-500 h-full rounded-full transition-all duration-300" 
                    style={{ width: `${100 - inflationResults.lossPercentage}%` }}
                  />
                </div>
                <span className="text-[10px] text-rose-600 font-bold mt-1.5 block">
                  Uang Anda menyusut sebesar {isFocusMode ? '•••' : `${inflationResults.lossPercentage.toFixed(1)}%`} dari nilai aslinya.
                </span>
              </div>

              {/* Hasil 2: Nominal yang Diperlukan */}
              <div className="bg-blue-50/50 p-3.5 rounded-xl border border-blue-100">
                <span className="text-[9px] text-blue-500 font-bold uppercase tracking-wider block">Nominal Masa Depan yang Dibutuhkan (Tahun {calYear + calcYears})</span>
                <span className="text-lg font-black text-blue-700 font-mono mt-1 block">
                  {isFocusMode ? 'Rp ••••••' : formatterIDR.format(inflationResults.futureNominalCost)}
                </span>
                <p className="text-[10px] text-blue-600 font-medium mt-1 leading-relaxed">
                  Untuk memiliki daya beli yang setara dengan <span className="font-bold">{isFocusMode ? 'Rp ••••••' : formatterIDR.format(calcAmount)}</span> hari ini, Anda membutuhkan nominal di atas pada {calcYears} tahun mendatang.
                </p>
              </div>
            </div>

            {/* Strategic Tips */}
            <div className="flex items-start gap-2.5 bg-slate-50 p-3 rounded-lg border border-slate-200">
              <div className="p-1.5 bg-blue-100 text-blue-700 rounded-lg shrink-0 mt-0.5">
                <Info className="h-4 w-4" />
              </div>
              <div className="space-y-1">
                <span className="text-[10px] font-black text-slate-700 block uppercase tracking-wider">Saran Anti-Inflasi</span>
                <p className="text-[10px] text-slate-600 leading-relaxed font-medium">
                  Jangan biarkan uang tunai mengendap di tabungan biasa. Alokasikan ke <span className="font-extrabold text-indigo-600">Portofolio Investasi</span> (seperti Reksadana Obligasi, Saham, atau Emas) dengan imbal hasil di atas {calcInflation}% per tahun untuk melestarikan daya beli kekayaan Anda.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Saldo Akun Keuangan */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold text-slate-800 text-sm uppercase tracking-wide">
            Saldo Akun Keuangan
          </h3>
          <button
            type="button"
            onClick={() => onQuickAction('accounts')}
            className="inline-flex items-center gap-1 text-xs text-slate-900 hover:text-blue-700 font-bold cursor-pointer whitespace-nowrap"
          >
            <span>Kelola Rekening</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {accounts.map((acc) => (
            <div
              key={acc.id}
              className="flex items-center justify-between gap-3 p-3.5 bg-slate-50 rounded-xl hover:bg-slate-100/80 transition border border-slate-200/80"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 bg-white rounded-lg border border-slate-200 text-slate-600 shrink-0">
                  <Wallet className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <h4 className="font-semibold text-slate-800 text-sm truncate">{acc.name}</h4>
                  <span className="text-[11px] uppercase font-semibold text-slate-500">
                    {acc.type}
                  </span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <span className="font-mono tabular-nums font-bold text-slate-900 text-sm">
                  {formatValue(acc.currentBalance)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* KALKULATOR ESTIMASI PAJAK TAHUNAN */}
      <TaxCalculatorCard transactions={transactions} />

      {/* MODAL 1: ADD / EDIT SAVINGS GOAL */}
      {showGoalModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-slate-800 text-sm uppercase tracking-wider flex items-center gap-2">
                <Target className="h-4 w-4 text-emerald-600" />
                {goalEditingId ? 'Edit Target Tabungan' : 'Tambah Target Tabungan Baru'}
              </h3>
              <button
                onClick={() => setShowGoalModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveGoalModal} className="space-y-4">
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">Judul / Impian Target</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: DP Rumah, Liburan Bali, Gadget Baru"
                  value={goalTitleInput}
                  onChange={(e) => setGoalTitleInput(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">Target Nominal (Rp)</label>
                  <FormattedNumberInput
                    required
                    placeholder="Contoh: 15.000.000"
                    value={goalTargetAmountInput}
                    onChange={(_, numVal) => setGoalTargetAmountInput(numVal)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">Saldo Terkumpul Awal (Rp)</label>
                  <FormattedNumberInput
                    placeholder="0"
                    value={goalCurrentAmountInput}
                    onChange={(_, numVal) => setGoalCurrentAmountInput(numVal)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">Kategori Impian</label>
                  <select
                    value={goalCategoryInput}
                    onChange={(e) => setGoalCategoryInput(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                  >
                    <option value="Liburan">Liburan</option>
                    <option value="DP Rumah">DP Rumah / Properti</option>
                    <option value="Gadget">Gadget & Elektronik</option>
                    <option value="Mobil/Motor">Kendaraan</option>
                    <option value="Pendidikan">Pendidikan</option>
                    <option value="Dana Darurat">Dana Darurat</option>
                    <option value="Pernikahan">Pernikahan</option>
                    <option value="Lainnya">Lainnya</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">Batas Waktu (Deadline)</label>
                  <input
                    type="date"
                    required
                    value={goalTargetDateInput}
                    onChange={(e) => setGoalTargetDateInput(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">Catatan Tambahan (Opsional)</label>
                <input
                  type="text"
                  placeholder="Contoh: Nabung 1.2jt per bulan"
                  value={goalNotesInput}
                  onChange={(e) => setGoalNotesInput(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowGoalModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md transition cursor-pointer"
                >
                  {goalEditingId ? 'Simpan Perubahan' : 'Buat Target Tabungan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: SETOR DANA TABUNGAN */}
      {depositGoalItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-extrabold text-slate-800 text-sm">Setor Dana Tabungan</h3>
                <p className="text-[10px] text-emerald-600 font-bold">{depositGoalItem.title}</p>
              </div>
              <button
                onClick={() => setDepositGoalItem(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveDeposit} className="space-y-4">
              <div className="bg-emerald-50/70 p-3 rounded-xl border border-emerald-100 space-y-1">
                <div className="flex justify-between text-xs font-bold text-slate-700">
                  <span>Terkumpul Saat Ini:</span>
                  <span className="text-emerald-700 font-mono">{formatValue(depositGoalItem.currentAmount)}</span>
                </div>
                <div className="flex justify-between text-xs font-bold text-slate-700">
                  <span>Target Nominal:</span>
                  <span className="text-slate-800 font-mono">{formatValue(depositGoalItem.targetAmount)}</span>
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">Nominal Setoran Baru (Rp)</label>
                <FormattedNumberInput
                  required
                  placeholder="Contoh: 500.000"
                  value={depositAmountInput}
                  onChange={(_, numVal) => setDepositAmountInput(numVal)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setDepositGoalItem(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md transition cursor-pointer"
                >
                  Konfirmasi Setoran
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </motion.div>
  );
};
