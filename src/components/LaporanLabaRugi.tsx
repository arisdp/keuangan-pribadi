import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Transaction, KprCoaMappingConfig } from '../types';
import {
  calculateMonthlyIncomeStatementSeries,
  MonthlyIncomeStatementPoint,
} from '../utils/accountingEngine';
import { formatterIDR } from '../utils/formatters';
import {
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  FileSpreadsheet,
  Download,
  Calendar,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from 'recharts';

export type IncomeStatementPeriodRange = '3m' | '6m' | '12m' | 'ytd';

interface LaporanLabaRugiProps {
  transactions: Transaction[];
  kprCoaMapping?: KprCoaMappingConfig;
  onExportMonthCSV?: (monthPoint: MonthlyIncomeStatementPoint) => void;
  onExportMonthPDF?: (monthPoint: MonthlyIncomeStatementPoint) => void;
  onSelectedMonthChange?: (monthPoint: MonthlyIncomeStatementPoint) => void;
}

const PERIOD_OPTIONS: Array<{
  id: IncomeStatementPeriodRange;
  label: string;
  badgeText: string;
}> = [
  { id: '3m', label: '3 Bulan', badgeText: '3 Bulan Terakhir' },
  { id: '6m', label: '6 Bulan', badgeText: '6 Bulan Terakhir' },
  { id: '12m', label: '12 Bulan', badgeText: '12 Bulan Terakhir' },
  { id: 'ytd', label: 'Tahun Ini', badgeText: 'Tahun Berjalan' },
];

export const LaporanLabaRugi: React.FC<LaporanLabaRugiProps> = ({
  transactions,
  kprCoaMapping,
  onExportMonthCSV,
  onExportMonthPDF,
  onSelectedMonthChange,
}) => {
  const [periodRange, setPeriodRange] = useState<IncomeStatementPeriodRange>('6m');
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const onSelectedMonthChangeRef = useRef(onSelectedMonthChange);
  onSelectedMonthChangeRef.current = onSelectedMonthChange;

  const monthsCount = useMemo(() => {
    switch (periodRange) {
      case '3m':
        return 3;
      case '12m':
        return 12;
      case 'ytd':
        return new Date().getMonth() + 1;
      case '6m':
      default:
        return 6;
    }
  }, [periodRange]);

  const activePeriodMeta = useMemo(
    () => PERIOD_OPTIONS.find((opt) => opt.id === periodRange) || PERIOD_OPTIONS[1],
    [periodRange]
  );

  const series = useMemo(() => {
    return calculateMonthlyIncomeStatementSeries(transactions, kprCoaMapping, monthsCount);
  }, [transactions, kprCoaMapping, monthsCount]);

  const selectedMonthData = useMemo(() => {
    return (
      series.months.find((m) => m.monthKey === selectedMonthKey) ||
      series.months[series.months.length - 1]
    );
  }, [series, selectedMonthKey]);

  useEffect(() => {
    if (selectedMonthData && onSelectedMonthChangeRef.current) {
      onSelectedMonthChangeRef.current(selectedMonthData);
    }
  }, [selectedMonthData]);

  const hasAnyTransactionsInRange = useMemo(
    () => series.months.some((m) => m.txCount > 0),
    [series.months]
  );

  if (!selectedMonthData) {
    return null;
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header, Period Filter & 4-KPI Summary Strip */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-blue-600 shrink-0" />
              <h3 className="text-base font-black text-slate-900 tracking-tight">
                Laporan Laba-Rugi Bulanan ({activePeriodMeta.badgeText})
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Menghitung selisih Pendapatan Operasional dikurangi Pengeluaran Operasional per bulan (mengecualikan transfer internal & pelunasan pokok utang, serta memperhitungkan beban bunga KPR).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {/* Period Range Filter */}
            <div
              role="group"
              aria-label="Filter rentang waktu Laporan Laba-Rugi"
              className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200"
            >
              <span className="pl-2 pr-1 text-slate-400 hidden sm:inline-flex items-center">
                <Calendar className="h-3.5 w-3.5" />
              </span>
              {PERIOD_OPTIONS.map((opt) => {
                const isActive = periodRange === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setPeriodRange(opt.id)}
                    aria-pressed={isActive}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      isActive
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            {onExportMonthCSV && (
              <button
                type="button"
                onClick={() => onExportMonthCSV(selectedMonthData)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                <span>Ekspor CSV ({selectedMonthData.monthLabel})</span>
              </button>
            )}

            {onExportMonthPDF && (
              <button
                type="button"
                onClick={() => onExportMonthPDF(selectedMonthData)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Ekspor PDF ({selectedMonthData.monthLabel})</span>
              </button>
            )}
          </div>
        </div>

        {/* 4-KPI Period Summary Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Total Pendapatan ({activePeriodMeta.label})
            </p>
            <p className="text-lg font-black text-emerald-700 font-mono tabular-nums mt-1">
              {formatterIDR.format(series.totalIncome6M)}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              Akumulasi pendapatan operasional
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Total Pengeluaran ({activePeriodMeta.label})
            </p>
            <p className="text-lg font-black text-amber-700 font-mono tabular-nums mt-1">
              {formatterIDR.format(series.totalExpense6M)}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              Beban operasional & bunga pinjaman
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Akumulasi Laba / Rugi ({activePeriodMeta.label})
            </p>
            <p
              className={`text-lg font-black font-mono tabular-nums mt-1 ${
                series.netProfitLoss6M >= 0 ? 'text-blue-700' : 'text-rose-700'
              }`}
            >
              {series.netProfitLoss6M < 0 ? '-' : '+'}
              {formatterIDR.format(Math.abs(series.netProfitLoss6M))}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              {series.surplusMonthsCount} bln surplus · {series.deficitMonthsCount} bln defisit
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Rata-rata Margin Bersih
            </p>
            <p
              className={`text-lg font-black font-mono tabular-nums mt-1 ${
                series.avgMarginPct6M >= 0 ? 'text-slate-900' : 'text-rose-700'
              }`}
            >
              {series.avgMarginPct6M.toFixed(1)}%
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              Rasio Laba Bersih terhadap Pendapatan
            </p>
          </div>
        </div>
      </div>

      {/* Recharts 3-Series Comparison Bar Chart */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-black text-slate-900">
              Grafik Perbandingan Laba / Rugi Bulanan ({activePeriodMeta.badgeText})
            </h4>
            <p className="text-xs text-slate-500 mt-0.5">
              Menampilkan seri Pendapatan, Pengeluaran, dan Laba/Rugi bersih per bulan. Klik batang atau baris tabel untuk memeriksa rincian kategori.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold text-slate-600 shrink-0">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500 inline-block" />
              Pendapatan
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-amber-500 inline-block" />
              Pengeluaran
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-blue-600 inline-block" />
              Laba Bersih
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-rose-600 inline-block" />
              Rugi Bersih
            </span>
          </div>
        </div>

        {!hasAnyTransactionsInRange && (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
            Belum ada transaksi tercatat pada rentang <span className="font-bold">{activePeriodMeta.badgeText}</span>. Tambahkan transaksi atau pilih rentang waktu lain untuk melihat perbandingan grafik.
          </div>
        )}

        <div className="w-full h-[340px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={series.months}
              margin={{ top: 16, right: 16, left: 8, bottom: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey="monthLabel"
                tick={{ fontSize: monthsCount > 8 ? 11 : 12, fill: '#475569', fontWeight: 600 }}
                axisLine={{ stroke: '#cbd5e1' }}
                tickLine={false}
                interval={0}
              />
              <YAxis
                tickFormatter={(val: number) => {
                  const sign = val < 0 ? '-' : '';
                  const abs = Math.abs(val);
                  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(1)}M`;
                  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}Jt`;
                  if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)}Rb`;
                  return `${sign}${abs}`;
                }}
                tick={{ fontSize: 11, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                width={68}
              />
              <ReferenceLine y={0} stroke="#64748b" strokeWidth={1.5} />
              <Tooltip
                cursor={{ fill: '#f1f5f9', opacity: 0.6 }}
                content={({ active, payload }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const pt = payload[0]?.payload as MonthlyIncomeStatementPoint | undefined;
                  if (!pt) return null;
                  const isProfit = pt.netProfitLoss >= 0;
                  return (
                    <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-md text-xs space-y-1.5 min-w-[230px]">
                      <div className="font-black text-slate-900 border-b border-slate-100 pb-1 flex items-center justify-between gap-2">
                        <span>{pt.fullMonthLabel}</span>
                        <span className="text-[10px] font-semibold text-slate-500">
                          {pt.txCount} transaksi
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-slate-600">Pendapatan:</span>
                        <span className="font-mono tabular-nums font-bold text-emerald-700">
                          {formatterIDR.format(pt.totalIncome)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-slate-600">Pengeluaran:</span>
                        <span className="font-mono tabular-nums font-bold text-amber-700">
                          {formatterIDR.format(pt.totalExpense)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-1">
                        <span className="font-bold text-slate-800">
                          {isProfit ? 'Laba Bersih:' : 'Rugi Bersih:'}
                        </span>
                        <span
                          className={`font-mono tabular-nums font-black ${
                            isProfit ? 'text-blue-700' : 'text-rose-700'
                          }`}
                        >
                          {isProfit ? '+' : '-'}
                          {formatterIDR.format(Math.abs(pt.netProfitLoss))}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-4 text-[11px] text-slate-500">
                        <span>Margin Laba/Rugi:</span>
                        <span className="font-mono tabular-nums font-semibold">
                          {pt.marginPct.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  );
                }}
              />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
              <Bar
                dataKey="totalIncome"
                name="Pendapatan"
                fill="#10b981"
                radius={[6, 6, 0, 0]}
                maxBarSize={monthsCount > 8 ? 18 : 28}
                className="cursor-pointer"
                onClick={(barData) => {
                  const mk = (barData as { monthKey?: string } | undefined)?.monthKey;
                  if (mk) setSelectedMonthKey(mk);
                }}
              />
              <Bar
                dataKey="totalExpense"
                name="Pengeluaran"
                fill="#f59e0b"
                radius={[6, 6, 0, 0]}
                maxBarSize={monthsCount > 8 ? 18 : 28}
                className="cursor-pointer"
                onClick={(barData) => {
                  const mk = (barData as { monthKey?: string } | undefined)?.monthKey;
                  if (mk) setSelectedMonthKey(mk);
                }}
              />
              <Bar
                dataKey="netProfitLoss"
                name="Laba / Rugi"
                fill="#2563eb"
                radius={[6, 6, 0, 0]}
                maxBarSize={monthsCount > 8 ? 18 : 28}
                className="cursor-pointer"
                onClick={(barData) => {
                  const mk = (barData as { monthKey?: string } | undefined)?.monthKey;
                  if (mk) setSelectedMonthKey(mk);
                }}
              >
                {series.months.map((entry) => (
                  <Cell
                    key={`net-cell-${entry.monthKey}`}
                    fill={entry.netProfitLoss >= 0 ? '#2563eb' : '#e11d48'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Interactive Monthly Summary Table + Selected Month Category Breakdown */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left: Interactive Monthly Summary Table */}
        <div className="xl:col-span-7 bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-2">
            <div>
              <h4 className="text-sm font-black text-slate-900">
                Tabel Rekap Laba-Rugi per Bulan
              </h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Klik baris bulan untuk menampilkan rincian kategori pendapatan dan pengeluaran.
              </p>
            </div>
            <span className="text-xs font-semibold text-slate-500 shrink-0">
              {series.months.length} bulan
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">Bulan</th>
                  <th className="py-3 px-4 text-right">Pendapatan</th>
                  <th className="py-3 px-4 text-right">Pengeluaran</th>
                  <th className="py-3 px-4 text-right">Laba / Rugi Bersih</th>
                  <th className="py-3 px-4 text-right">Margin</th>
                  <th className="py-3 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {series.months.map((m) => {
                  const isSelected = m.monthKey === selectedMonthData.monthKey;
                  const isProfit = m.netProfitLoss > 0;
                  const isLoss = m.netProfitLoss < 0;
                  return (
                    <tr
                      key={m.monthKey}
                      tabIndex={0}
                      aria-selected={isSelected}
                      onClick={() => setSelectedMonthKey(m.monthKey)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedMonthKey(m.monthKey);
                        }
                      }}
                      className={`cursor-pointer transition-colors focus:outline-none focus-visible:bg-blue-50 ${
                        isSelected ? 'bg-blue-50/80 hover:bg-blue-50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-3 px-4">
                        <div>
                          <p
                            className={`font-bold ${
                              isSelected ? 'text-blue-900' : 'text-slate-800'
                            }`}
                          >
                            {m.fullMonthLabel}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {m.txCount} transaksi
                          </p>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-emerald-700">
                        {formatterIDR.format(m.totalIncome)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-amber-700">
                        {formatterIDR.format(m.totalExpense)}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono tabular-nums font-black ${
                          isLoss
                            ? 'text-rose-700'
                            : isProfit
                            ? 'text-blue-700'
                            : 'text-slate-600'
                        }`}
                      >
                        {isLoss ? '-' : isProfit ? '+' : ''}
                        {formatterIDR.format(Math.abs(m.netProfitLoss))}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600 font-semibold">
                        {m.marginPct.toFixed(1)}%
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                            isLoss
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : isProfit
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}
                        >
                          {isLoss ? 'Rugi' : isProfit ? 'Laba' : 'Impas'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-900 text-white text-xs font-bold">
                  <td className="py-3 px-4">Total {activePeriodMeta.label}</td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-300">
                    {formatterIDR.format(series.totalIncome6M)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-amber-300">
                    {formatterIDR.format(series.totalExpense6M)}
                  </td>
                  <td
                    className={`py-3 px-4 text-right font-mono tabular-nums font-black ${
                      series.netProfitLoss6M >= 0 ? 'text-blue-300' : 'text-rose-300'
                    }`}
                  >
                    {series.netProfitLoss6M < 0 ? '-' : '+'}
                    {formatterIDR.format(Math.abs(series.netProfitLoss6M))}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums">
                    {series.avgMarginPct6M.toFixed(1)}%
                  </td>
                  <td className="py-3 px-4 text-center text-[10px] text-slate-300">
                    Agregat
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Right: Selected Month Category Breakdown */}
        <div className="xl:col-span-5 bg-white p-5 rounded-2xl border border-slate-200 space-y-5">
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3.5">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-blue-600">
                Rincian Kategori Bulan Terpilih
              </p>
              <h4 className="text-base font-black text-slate-900 mt-0.5">
                {selectedMonthData.fullMonthLabel}
              </h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {selectedMonthData.txCount} transaksi tercatat pada periode ini
              </p>
            </div>
            <span
              className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold border shrink-0 ${
                selectedMonthData.netProfitLoss > 0
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : selectedMonthData.netProfitLoss < 0
                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                  : 'bg-slate-100 text-slate-600 border-slate-200'
              }`}
            >
              {selectedMonthData.netProfitLoss > 0
                ? 'Surplus / Laba'
                : selectedMonthData.netProfitLoss < 0
                ? 'Defisit / Rugi'
                : 'Impas'}
            </span>
          </div>

          {/* Operating Income Categories */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs font-extrabold text-slate-800">
              <span className="flex items-center gap-1.5">
                <ArrowUpRight className="h-4 w-4 text-emerald-600" />
                Pendapatan Operasional
              </span>
              <span className="font-mono tabular-nums text-emerald-700">
                {formatterIDR.format(selectedMonthData.totalIncome)}
              </span>
            </div>

            {selectedMonthData.incomeCategories.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                Belum ada pendapatan operasional tercatat pada bulan ini.
              </div>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {selectedMonthData.incomeCategories.map((cat) => (
                  <div key={`inc-${cat.category}`} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-slate-700 font-medium truncate">
                        {cat.category}
                      </span>
                      <span className="font-mono tabular-nums font-bold text-slate-900 shrink-0">
                        {formatterIDR.format(cat.amount)}{' '}
                        <span className="text-[10px] font-normal text-slate-400">
                          ({cat.percentage.toFixed(0)}%)
                        </span>
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full"
                        style={{ width: `${Math.min(100, Math.max(2, cat.percentage))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Operating Expense Categories */}
          <div className="space-y-2.5 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between text-xs font-extrabold text-slate-800">
              <span className="flex items-center gap-1.5">
                <ArrowDownRight className="h-4 w-4 text-amber-600" />
                Beban & Pengeluaran Operasional
              </span>
              <span className="font-mono tabular-nums text-amber-700">
                {formatterIDR.format(selectedMonthData.totalExpense)}
              </span>
            </div>

            {selectedMonthData.expenseCategories.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                Belum ada pengeluaran operasional tercatat pada bulan ini.
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {selectedMonthData.expenseCategories.map((cat) => (
                  <div key={`exp-${cat.category}`} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-slate-700 font-medium truncate">
                        {cat.category}
                      </span>
                      <span className="font-mono tabular-nums font-bold text-slate-900 shrink-0">
                        {formatterIDR.format(cat.amount)}{' '}
                        <span className="text-[10px] font-normal text-slate-400">
                          ({cat.percentage.toFixed(0)}%)
                        </span>
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-500 rounded-full"
                        style={{ width: `${Math.min(100, Math.max(2, cat.percentage))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Net Profit/Loss Equation Footer */}
          <div
            className={`rounded-xl border p-3.5 space-y-1.5 ${
              selectedMonthData.netProfitLoss >= 0
                ? 'bg-blue-50/70 border-blue-200'
                : 'bg-rose-50/70 border-rose-200'
            }`}
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-700">
                Selisih Laba / Rugi ({selectedMonthData.monthLabel})
              </span>
              <span
                className={`text-sm font-black font-mono tabular-nums ${
                  selectedMonthData.netProfitLoss >= 0
                    ? 'text-blue-700'
                    : 'text-rose-700'
                }`}
              >
                {selectedMonthData.netProfitLoss < 0 ? '-' : '+'}
                {formatterIDR.format(Math.abs(selectedMonthData.netProfitLoss))}
              </span>
            </div>
            <p className="text-[11px] text-slate-600 font-mono tabular-nums">
              {formatterIDR.format(selectedMonthData.totalIncome)} −{' '}
              {formatterIDR.format(selectedMonthData.totalExpense)} (Margin{' '}
              {selectedMonthData.marginPct.toFixed(1)}%)
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
