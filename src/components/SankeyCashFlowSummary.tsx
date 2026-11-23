import React from 'react';
import {
  formatMonthLabelID,
  PeriodCashFlowAggregation,
  QUARTER_LABELS,
  QuarterNum,
  SankeyPeriodMode,
} from '../utils/cashFlowSankey';
import { formatterIDR } from '../utils/formatters';
import {
  ArrowDownRight,
  ArrowUpRight,
  Calendar,
  Landmark,
  PiggyBank,
  Scale,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';

export interface SankeyCashFlowSummaryProps {
  summary: PeriodCashFlowAggregation;
  transactionCount: number;
  periodRangeLabel: string;
  periodMode: SankeyPeriodMode;
  onPeriodModeChange: (mode: SankeyPeriodMode) => void;
  selectedMonth: string;
  onSelectedMonthChange: (monthKey: string) => void;
  selectedQuarter: QuarterNum;
  onSelectedQuarterChange: (q: QuarterNum) => void;
  selectedYear: string;
  onSelectedYearChange: (yr: string) => void;
  availableMonthKeys: string[];
  availableYears: string[];
  currentLocalMonth: string;
}

function formatSignedIDR(amount: number): string {
  if (amount < 0) return `-${formatterIDR.format(Math.abs(amount))}`;
  if (amount > 0) return `+${formatterIDR.format(amount)}`;
  return formatterIDR.format(0);
}

export const SankeyCashFlowSummary: React.FC<SankeyCashFlowSummaryProps> = ({
  summary,
  transactionCount,
  periodRangeLabel,
  periodMode,
  onPeriodModeChange,
  selectedMonth,
  onSelectedMonthChange,
  selectedQuarter,
  onSelectedQuarterChange,
  selectedYear,
  onSelectedYearChange,
  availableMonthKeys,
  availableYears,
  currentLocalMonth,
}) => {
  const {
    totalIncome,
    totalExpense,
    totalDebtPayment,
    totalSaving,
    totalInvestment,
    totalAllocatedOutflow,
    rawNetBalance,
    allIncomeEntries,
    allExpenseEntries,
    debtEntries,
    savingEntries,
    investmentEntries,
  } = summary;

  const isDeficit = rawNetBalance < 0;
  const isSurplus = rawNetBalance > 0;
  const savInvTotal = totalSaving + totalInvestment;

  const expShare = totalIncome > 0 ? ((totalExpense / totalIncome) * 100).toFixed(1) : '0.0';
  const netShare =
    totalIncome > 0 ? ((Math.abs(rawNetBalance) / totalIncome) * 100).toFixed(1) : '0.0';
  const debtShare =
    totalIncome > 0 ? ((totalDebtPayment / totalIncome) * 100).toFixed(1) : '0.0';
  const savInvShare = totalIncome > 0 ? ((savInvTotal / totalIncome) * 100).toFixed(1) : '0.0';

  return (
    <section
      aria-label="Ringkasan Arus Kas Periode"
      className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-5"
    >
      {/* Header & Shared Period Controls */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 bg-slate-900 text-white rounded-xl shrink-0">
            <Scale className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 text-base">
              Ringkasan Arus Kas Periode
            </h3>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 mt-0.5">
              <span>Ikhtisar pemasukan, pengeluaran, utang, &amp; saldo bersih</span>
              <span aria-hidden="true">·</span>
              <span className="font-semibold text-slate-700">{periodRangeLabel}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">{transactionCount} transaksi</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div
            role="tablist"
            aria-label="Filter periode ringkasan arus kas dan Sankey"
            className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200"
          >
            {(
              [
                { id: 'all', label: 'Semua' },
                { id: 'monthly', label: 'Bulanan' },
                { id: 'quarterly', label: 'Kuartal (Q1-Q4)' },
                { id: 'yearly', label: 'Tahunan' },
              ] as const
            ).map((btn) => (
              <button
                key={btn.id}
                type="button"
                role="tab"
                aria-selected={periodMode === btn.id}
                onClick={() => onPeriodModeChange(btn.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition cursor-pointer whitespace-nowrap shrink-0 ${
                  periodMode === btn.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>

          {periodMode === 'monthly' && (
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
              <Calendar className="h-3.5 w-3.5 text-slate-500 shrink-0" />
              <select
                value={selectedMonth}
                onChange={(e) => onSelectedMonthChange(e.target.value)}
                aria-label="Pilih bulan"
                className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer"
              >
                {(availableMonthKeys.length > 0 ? availableMonthKeys : [currentLocalMonth]).map(
                  (mk) => (
                    <option key={mk} value={mk}>
                      {formatMonthLabelID(mk)}
                    </option>
                  )
                )}
              </select>
            </div>
          )}

          {periodMode === 'quarterly' && (
            <div className="flex items-center gap-2">
              <select
                value={selectedQuarter}
                onChange={(e) => onSelectedQuarterChange(Number(e.target.value) as QuarterNum)}
                aria-label="Pilih kuartal"
                className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer"
              >
                {([1, 2, 3, 4] as const).map((q) => (
                  <option key={q} value={q}>
                    {QUARTER_LABELS[q]}
                  </option>
                ))}
              </select>
              <select
                value={selectedYear}
                onChange={(e) => onSelectedYearChange(e.target.value)}
                aria-label="Pilih tahun kuartal"
                className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold font-mono tabular-nums text-slate-800 focus:outline-none cursor-pointer"
              >
                {availableYears.map((yr) => (
                  <option key={yr} value={yr}>
                    {yr}
                  </option>
                ))}
              </select>
            </div>
          )}

          {periodMode === 'yearly' && (
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
              <Calendar className="h-3.5 w-3.5 text-slate-500 shrink-0" />
              <select
                value={selectedYear}
                onChange={(e) => onSelectedYearChange(e.target.value)}
                aria-label="Pilih tahun"
                className="bg-transparent text-xs font-semibold font-mono tabular-nums text-slate-800 focus:outline-none cursor-pointer"
              >
                {availableYears.map((yr) => (
                  <option key={yr} value={yr}>
                    Tahun {yr}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Row 1: 3 Primary Cash Flow KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-slate-50/70 border border-slate-200 rounded-xl space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-600">Total Pemasukan</span>
            <ArrowUpRight className="h-4 w-4 text-emerald-600 shrink-0" />
          </div>
          <div className="text-xl font-extrabold text-emerald-700 font-mono tabular-nums">
            {formatterIDR.format(totalIncome)}
          </div>
          <div className="flex items-center gap-x-2 text-[11px] text-slate-500">
            <span className="font-mono tabular-nums">{allIncomeEntries.length} transaksi masuk</span>
            <span aria-hidden="true">·</span>
            <span>{periodRangeLabel}</span>
          </div>
        </div>

        <div className="p-4 bg-slate-50/70 border border-slate-200 rounded-xl space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-600">Total Pengeluaran</span>
            <ArrowDownRight className="h-4 w-4 text-rose-600 shrink-0" />
          </div>
          <div className="text-xl font-extrabold text-rose-700 font-mono tabular-nums">
            {formatterIDR.format(totalExpense)}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500 font-mono tabular-nums">
            <span>{expShare}% dari pemasukan</span>
            <span aria-hidden="true">·</span>
            <span>{allExpenseEntries.length} entri beban</span>
          </div>
        </div>

        <div
          className={`p-4 rounded-xl border space-y-1.5 ${
            isDeficit
              ? 'bg-rose-50/60 border-rose-200'
              : isSurplus
              ? 'bg-emerald-50/60 border-emerald-200'
              : 'bg-slate-50/70 border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span
              className={`text-xs font-bold ${
                isDeficit
                  ? 'text-rose-800'
                  : isSurplus
                  ? 'text-emerald-800'
                  : 'text-slate-700'
              }`}
            >
              {isDeficit ? 'Net Defisit' : 'Net Surplus'}
            </span>
            {isDeficit ? (
              <TrendingDown className="h-4 w-4 text-rose-600 shrink-0" />
            ) : (
              <TrendingUp
                className={`h-4 w-4 shrink-0 ${
                  isSurplus ? 'text-emerald-600' : 'text-slate-400'
                }`}
              />
            )}
          </div>
          <div
            className={`text-xl font-extrabold font-mono tabular-nums ${
              isDeficit
                ? 'text-rose-700'
                : isSurplus
                ? 'text-emerald-700'
                : 'text-slate-900'
            }`}
          >
            {formatSignedIDR(rawNetBalance)}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-slate-600">
            <span>
              {isDeficit
                ? 'Arus keluar melampaui pemasukan'
                : isSurplus
                ? 'Kas bersih belum dialokasi'
                : 'Pemasukan & alokasi keluar seimbang'}
            </span>
            {totalIncome > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">{netShare}% dari pemasukan</span>
              </>
            )}
            {totalAllocatedOutflow > 0 && totalIncome === 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">
                  Total keluar {formatterIDR.format(totalAllocatedOutflow)}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Row 2: Secondary Allocation Details (Debt Principal + Savings & Investment) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-3.5 bg-white border border-slate-200 rounded-xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Landmark className="h-4 w-4 text-amber-600 shrink-0" />
            <div className="min-w-0">
              <span className="text-xs font-semibold text-slate-700 block">
                Cicilan Pokok Utang
              </span>
              <span className="text-[11px] text-slate-500 font-mono tabular-nums block truncate">
                {debtShare}% dari pemasukan · {debtEntries.length} pembayaran pokok
              </span>
            </div>
          </div>
          <span className="text-sm font-bold text-amber-700 font-mono tabular-nums shrink-0">
            {formatterIDR.format(totalDebtPayment)}
          </span>
        </div>

        <div className="p-3.5 bg-white border border-slate-200 rounded-xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <PiggyBank className="h-4 w-4 text-sky-600 shrink-0" />
            <div className="min-w-0">
              <span className="text-xs font-semibold text-slate-700 block">
                Tabungan &amp; Investasi
              </span>
              <span className="text-[11px] text-slate-500 font-mono tabular-nums block truncate">
                {savInvShare}% dari pemasukan · {savingEntries.length + investmentEntries.length} entri (Tabungan {formatterIDR.format(totalSaving)} · Investasi {formatterIDR.format(totalInvestment)})
              </span>
            </div>
          </div>
          <span className="text-sm font-bold text-sky-700 font-mono tabular-nums shrink-0">
            {formatterIDR.format(savInvTotal)}
          </span>
        </div>
      </div>
    </section>
  );
};
