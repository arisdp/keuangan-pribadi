import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Bar,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { BarChart3, ChevronDown, ChevronUp, Home, PieChart as PieChartIcon } from 'lucide-react';
import { Debt } from '../types';

export interface KprYearlyRow {
  year: number;
  yearLabel: string;
  phase: string;
  annualTotalPayment: number;
  principalPaidYear: number;
  interestPaidYear: number;
  principalSharePct: number;
  interestSharePct: number;
  avgMonthlyPayment: number;
  avgMonthlyPrincipal: number;
  avgMonthlyInterest: number;
  endingBalance: number;
}

export interface KprMonthlyRow {
  month: number;
  monthLabel: string;
  phase: string;
  principal: number;
  interest: number;
  principalSharePct: number;
  interestSharePct: number;
  totalPayment: number;
  endingBalance: number;
}

export interface KprScheduleResult {
  principal: number;
  tenorYears: number;
  tenorMonths: number;
  firstMonthPayment: number;
  floatingMonthPayment: number;
  firstMonthPrincipal: number;
  firstMonthInterest: number;
  totalInterest: number;
  totalPayment: number;
  effectiveApr: number;
  crossoverYear: number | null;
  isEstimate: boolean;
  yearlySchedule: KprYearlyRow[];
  firstYearMonthlySchedule: KprMonthlyRow[];
}

export const calcAnnuityPayment = (principal: number, annualRatePct: number, months: number) => {
  if (principal <= 0 || months <= 0) return 0;
  if (annualRatePct <= 0) return principal / months;
  const r = annualRatePct / 100 / 12;
  const factor = Math.pow(1 + r, months);
  return (principal * (r * factor)) / (factor - 1);
};

export function computeKprSchedule(params: {
  principal: number;
  tenorMonths: number;
  scheme: 'annuity' | 'tiered' | 'flat';
  annualRate: number;
  fixedRate: number;
  fixedYears: number;
  floatingRate: number;
  isEstimate?: boolean;
}): KprScheduleResult {
  const principal = Math.max(0, params.principal || 0);
  const tenorMonths = Math.max(1, Math.min(480, Math.round(params.tenorMonths || 12)));
  const tenorYears = Math.max(1, Math.ceil(tenorMonths / 12));
  const scheme = params.scheme;
  const annualRate = Math.max(0, params.annualRate || 0);
  const fixedRate = Math.max(0, params.fixedRate || 0);
  const floatingRate = Math.max(0, params.floatingRate || 0);

  if (principal <= 0) {
    return {
      principal: 0,
      tenorYears,
      tenorMonths,
      firstMonthPayment: 0,
      floatingMonthPayment: 0,
      firstMonthPrincipal: 0,
      firstMonthInterest: 0,
      totalInterest: 0,
      totalPayment: 0,
      effectiveApr: 0,
      crossoverYear: null,
      isEstimate: Boolean(params.isEstimate),
      yearlySchedule: [],
      firstYearMonthlySchedule: [],
    };
  }

  const yearlySchedule: KprYearlyRow[] = [];
  const firstYearMonthlySchedule: KprMonthlyRow[] = [];

  let remaining = principal;
  let totalInterest = 0;
  let firstMonthPayment = 0;
  let floatingMonthPayment = 0;
  let firstMonthPrincipal = 0;
  let firstMonthInterest = 0;
  let crossoverYear: number | null = null;

  const fixedMonths =
    scheme === 'tiered'
      ? Math.min(tenorMonths, Math.max(0, Math.round((params.fixedYears || 0) * 12)))
      : 0;

  let currentMonthlyPay =
    scheme === 'annuity'
      ? calcAnnuityPayment(principal, annualRate, tenorMonths)
      : scheme === 'tiered'
      ? calcAnnuityPayment(
          principal,
          fixedMonths > 0 ? fixedRate : floatingRate,
          tenorMonths
        )
      : principal / tenorMonths + principal * (annualRate / 100 / 12);

  for (let year = 1; year <= tenorYears; year++) {
    let yearPrincipal = 0;
    let yearInterest = 0;
    let yearTotalPay = 0;
    let monthsInYear = 0;
    let yearPhase = scheme === 'flat' ? 'Flat' : 'Anuitas';

    for (let m = 1; m <= 12; m++) {
      const monthIndex = (year - 1) * 12 + m;
      if (monthIndex > tenorMonths || remaining <= 0.01) break;

      if (scheme === 'tiered' && fixedMonths > 0 && monthIndex === fixedMonths + 1) {
        const remainingMonths = Math.max(1, tenorMonths - fixedMonths);
        currentMonthlyPay = calcAnnuityPayment(remaining, floatingRate, remainingMonths);
        floatingMonthPayment = currentMonthlyPay;
      }

      const activeRate =
        scheme === 'tiered'
          ? monthIndex <= fixedMonths
            ? fixedRate
            : floatingRate
          : annualRate;

      if (scheme === 'tiered') {
        yearPhase =
          monthIndex <= fixedMonths ? `Fixed ${fixedRate}%` : `Floating ${floatingRate}%`;
      }

      let interestForMonth = 0;
      let principalForMonth = 0;
      let payForMonth = 0;

      if (scheme === 'flat') {
        principalForMonth = Math.min(remaining, principal / tenorMonths);
        interestForMonth = principal * (activeRate / 100 / 12);
        payForMonth = principalForMonth + interestForMonth;
      } else {
        const monthlyRate = activeRate / 100 / 12;
        interestForMonth = remaining * monthlyRate;
        if (monthIndex === tenorMonths) {
          principalForMonth = remaining;
          payForMonth = principalForMonth + interestForMonth;
        } else {
          principalForMonth = Math.min(
            remaining,
            Math.max(0, currentMonthlyPay - interestForMonth)
          );
          payForMonth = principalForMonth + interestForMonth;
        }
      }

      if (monthIndex === 1) {
        firstMonthPayment = payForMonth;
        firstMonthPrincipal = principalForMonth;
        firstMonthInterest = interestForMonth;
        if (scheme !== 'tiered' || fixedMonths >= tenorMonths || fixedMonths === 0) {
          floatingMonthPayment = payForMonth;
        }
      }

      remaining = Math.max(0, remaining - principalForMonth);
      totalInterest += interestForMonth;
      yearPrincipal += principalForMonth;
      yearInterest += interestForMonth;
      yearTotalPay += payForMonth;
      monthsInYear++;

      if (year === 1 && m <= 12) {
        const pShare = payForMonth > 0 ? (principalForMonth / payForMonth) * 100 : 0;
        const iShare = payForMonth > 0 ? (interestForMonth / payForMonth) * 100 : 0;
        firstYearMonthlySchedule.push({
          month: m,
          monthLabel: `Bln ${m}`,
          phase: yearPhase,
          principal: Math.round(principalForMonth),
          interest: Math.round(interestForMonth),
          principalSharePct: Number(pShare.toFixed(1)),
          interestSharePct: Number(iShare.toFixed(1)),
          totalPayment: Math.round(payForMonth),
          endingBalance: Math.round(remaining),
        });
      }
    }

    if (monthsInYear > 0) {
      const annualPrincipalRounded = Math.round(yearPrincipal);
      const annualInterestRounded = Math.round(yearInterest);
      const annualTotalRounded = annualPrincipalRounded + annualInterestRounded;
      const pSharePct =
        annualTotalRounded > 0 ? (annualPrincipalRounded / annualTotalRounded) * 100 : 0;
      const iSharePct =
        annualTotalRounded > 0 ? (annualInterestRounded / annualTotalRounded) * 100 : 0;

      if (crossoverYear === null && annualPrincipalRounded > annualInterestRounded) {
        crossoverYear = year;
      }

      yearlySchedule.push({
        year,
        yearLabel: `Thn ${year}`,
        phase: yearPhase,
        annualTotalPayment: annualTotalRounded,
        principalPaidYear: annualPrincipalRounded,
        interestPaidYear: annualInterestRounded,
        principalSharePct: Number(pSharePct.toFixed(1)),
        interestSharePct: Number(iSharePct.toFixed(1)),
        avgMonthlyPayment: Math.round(yearTotalPay / monthsInYear),
        avgMonthlyPrincipal: Math.round(yearPrincipal / monthsInYear),
        avgMonthlyInterest: Math.round(yearInterest / monthsInYear),
        endingBalance: Math.round(remaining),
      });
    }
  }

  if (scheme === 'tiered' && fixedMonths < tenorMonths && floatingMonthPayment === 0) {
    floatingMonthPayment = firstMonthPayment;
  }

  let effectiveApr = annualRate;
  if (scheme === 'tiered') {
    const floatMonths = Math.max(0, tenorMonths - fixedMonths);
    effectiveApr =
      (fixedRate * fixedMonths + floatingRate * floatMonths) / tenorMonths;
  } else if (scheme === 'flat') {
    effectiveApr = annualRate * 1.85;
  }

  return {
    principal,
    tenorYears,
    tenorMonths,
    firstMonthPayment,
    floatingMonthPayment,
    firstMonthPrincipal,
    firstMonthInterest,
    totalInterest,
    totalPayment: principal + totalInterest,
    effectiveApr,
    crossoverYear,
    isEstimate: Boolean(params.isEstimate),
    yearlySchedule,
    firstYearMonthlySchedule,
  };
}

interface KprAmortizationChartProps {
  calculatorSchedule: KprScheduleResult;
  calculatorName: string;
  calculatorScheme: 'annuity' | 'tiered' | 'flat';
  activeKprDebts: Debt[];
  visualSource: 'calculator' | 'saved';
  onChangeVisualSource: (source: 'calculator' | 'saved') => void;
  selectedSavedKprId: string;
  onChangeSavedKprId: (id: string) => void;
  showAmortizationTable: boolean;
  onToggleAmortizationTable: () => void;
  formatterIDR: Intl.NumberFormat;
  formatCompactIDR: (value: number) => string;
}

export const KprAmortizationChart: React.FC<KprAmortizationChartProps> = ({
  calculatorSchedule,
  calculatorName,
  calculatorScheme,
  activeKprDebts,
  visualSource,
  onChangeVisualSource,
  selectedSavedKprId,
  onChangeSavedKprId,
  showAmortizationTable,
  onToggleAmortizationTable,
  formatterIDR,
  formatCompactIDR,
}) => {
  const [chartView, setChartView] = useState<'yearly-split' | 'first-year-monthly'>('yearly-split');

  const resolvedSavedKpr = useMemo(() => {
    if (activeKprDebts.length === 0) return null;
    return activeKprDebts.find((d) => d.id === selectedSavedKprId) || activeKprDebts[0];
  }, [activeKprDebts, selectedSavedKprId]);

  const savedKprSchedule = useMemo<KprScheduleResult | null>(() => {
    if (!resolvedSavedKpr) return null;

    const scheme: 'annuity' | 'tiered' | 'flat' = resolvedSavedKpr.kprScheme || 'annuity';
    const currentBalance = Math.max(0, resolvedSavedKpr.balance || 0);
    const baseRate = Math.max(0, resolvedSavedKpr.interestRate || 0);
    const fixedRate = resolvedSavedKpr.fixedRate ?? baseRate;
    const floatingRate = resolvedSavedKpr.floatingRate ?? baseRate;
    const rawFixedYears = resolvedSavedKpr.fixedYears ?? 3;

    const origPrincipal =
      resolvedSavedKpr.propertyPrice && resolvedSavedKpr.downPayment !== undefined
        ? Math.max(0, resolvedSavedKpr.propertyPrice - resolvedSavedKpr.downPayment)
        : currentBalance;

    let projectionTenorMonths = resolvedSavedKpr.tenorMonths || 0;
    let isEstimate = !resolvedSavedKpr.tenorMonths;
    let remainingFixedYears = rawFixedYears;

    if (
      projectionTenorMonths <= 0 ||
      (origPrincipal > 0 && currentBalance < origPrincipal * 0.99 && resolvedSavedKpr.minPayment > 0)
    ) {
      const monthlyRate =
        scheme === 'tiered'
          ? floatingRate / 100 / 12
          : baseRate / 100 / 12;
      const payment = Math.max(
        resolvedSavedKpr.minPayment || 0,
        currentBalance * monthlyRate + Math.max(10000, currentBalance / 360)
      );
      let rem = currentBalance;
      let estMonths = 0;
      const cap = resolvedSavedKpr.tenorMonths || 360;
      while (rem > 1 && estMonths < cap) {
        estMonths++;
        const interest = scheme === 'flat' ? currentBalance * monthlyRate : rem * monthlyRate;
        const princ = Math.max(1, payment - interest);
        rem = Math.max(0, rem - princ);
      }
      projectionTenorMonths = Math.max(1, estMonths);
      isEstimate = true;

      if (scheme === 'tiered' && resolvedSavedKpr.tenorMonths) {
        const elapsedMonths = Math.max(0, resolvedSavedKpr.tenorMonths - projectionTenorMonths);
        remainingFixedYears = Math.max(0, Number(((rawFixedYears * 12 - elapsedMonths) / 12).toFixed(2)));
      }
    }

    return computeKprSchedule({
      principal: currentBalance,
      tenorMonths: projectionTenorMonths,
      scheme,
      annualRate:
        scheme === 'flat' && resolvedSavedKpr.fixedRate !== undefined
          ? resolvedSavedKpr.fixedRate
          : baseRate,
      fixedRate,
      fixedYears: remainingFixedYears,
      floatingRate,
      isEstimate,
    });
  }, [resolvedSavedKpr]);

  const activeSchedule =
    visualSource === 'saved' && savedKprSchedule
      ? savedKprSchedule
      : calculatorSchedule;

  const activeMeta = useMemo(() => {
    if (visualSource === 'saved' && resolvedSavedKpr) {
      const sch = resolvedSavedKpr.kprScheme || 'annuity';
      return {
        label: resolvedSavedKpr.name,
        schemeLabel:
          sch === 'tiered' ? 'Fixed → Floating' : sch === 'flat' ? 'Bunga Flat' : 'Anuitas',
        isSaved: true,
      };
    }
    return {
      label: calculatorName.trim() || 'Simulasi KPR',
      schemeLabel:
        calculatorScheme === 'tiered'
          ? 'Fixed → Floating'
          : calculatorScheme === 'flat'
          ? 'Bunga Flat'
          : 'Anuitas',
      isSaved: false,
    };
  }, [visualSource, resolvedSavedKpr, calculatorName, calculatorScheme]);

  const donutData = useMemo(() => {
    const p = Math.round(activeSchedule.principal);
    const i = Math.round(activeSchedule.totalInterest);
    return [
      { name: 'Total Pokok', value: p, color: '#10b981' },
      { name: 'Total Bunga', value: i, color: '#f43f5e' },
    ];
  }, [activeSchedule.principal, activeSchedule.totalInterest]);

  if (calculatorSchedule.principal <= 0 && activeKprDebts.length === 0) {
    return null;
  }

  return (
    <div id="kpr-amortization-chart" className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5 space-y-5">
        {/* Header & Interactive Source Controls */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-100 text-blue-700 shrink-0">
              <BarChart3 className="h-4 w-4" />
            </div>
            <div className="space-y-0.5">
              <h4 className="text-xs sm:text-sm font-black text-slate-800 tracking-tight">
                Visualisasi Amortisasi KPR Tahunan: Porsi Pokok vs Bunga &amp; Sisa Pokok
              </h4>
              <p className="text-[11px] text-slate-500 flex flex-wrap items-center gap-1.5">
                <span className="font-semibold text-slate-700">{activeMeta.label}</span>
                <span aria-hidden="true">·</span>
                <span>Skema {activeMeta.schemeLabel}</span>
                {!(visualSource === 'saved' && activeKprDebts.length === 0) && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      Tenor {activeSchedule.tenorYears} Tahun ({activeSchedule.tenorMonths} Bln)
                    </span>
                  </>
                )}
                {activeSchedule.isEstimate && visualSource === 'saved' && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-amber-700 font-semibold">Proyeksi sisa saldo aktif</span>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex bg-slate-200/80 p-1 rounded-xl gap-1">
              <button
                type="button"
                onClick={() => onChangeVisualSource('calculator')}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition cursor-pointer whitespace-nowrap shrink-0 ${
                  visualSource === 'calculator'
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Simulasi Kalkulator
              </button>
              <button
                type="button"
                onClick={() => onChangeVisualSource('saved')}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition cursor-pointer whitespace-nowrap shrink-0 ${
                  visualSource === 'saved'
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                KPR Aktif Tersimpan ({activeKprDebts.length})
              </button>
            </div>

            {visualSource === 'saved' && activeKprDebts.length > 0 && (
              <select
                aria-label="Pilih KPR Aktif Tersimpan"
                value={resolvedSavedKpr?.id || ''}
                onChange={(e) => onChangeSavedKprId(e.target.value)}
                className="px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-[11px] font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 max-w-[220px] truncate"
              >
                {activeKprDebts.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({formatCompactIDR(item.balance)})
                  </option>
                ))}
              </select>
            )}

            {!(visualSource === 'saved' && activeKprDebts.length === 0) && (
              <div className="inline-flex bg-slate-200/80 p-1 rounded-xl gap-1">
                <button
                  type="button"
                  onClick={() => setChartView('yearly-split')}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition cursor-pointer whitespace-nowrap shrink-0 ${
                    chartView === 'yearly-split'
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Amortisasi Tahunan
                </button>
                <button
                  type="button"
                  onClick={() => setChartView('first-year-monthly')}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition cursor-pointer whitespace-nowrap shrink-0 ${
                    chartView === 'first-year-monthly'
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  12 Bulan Pertama
                </button>
              </div>
            )}
          </div>
        </div>

        {visualSource === 'saved' && activeKprDebts.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center space-y-3">
            <div className="w-11 h-11 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
              <Home className="h-5 w-5" />
            </div>
            <div className="space-y-1 max-w-md mx-auto">
              <h5 className="text-sm font-bold text-slate-800">
                Belum Ada KPR Aktif Tersimpan
              </h5>
              <p className="text-xs text-slate-500">
                Simulasikan KPR pada kalkulator di atas lalu klik{' '}
                <span className="font-semibold text-slate-700">Tambah ke Daftar Utang</span>, atau catat pinjaman berkategori KPR / Properti untuk melihat grafik amortisasinya di sini.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onChangeVisualSource('calculator')}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition cursor-pointer"
            >
              Lihat Simulasi Kalkulator KPR
            </button>
          </div>
        ) : activeSchedule.yearlySchedule.length > 0 ? (
          <>
            {/* Compact Annual KPI Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-semibold text-slate-500 block">
                    {activeMeta.isSaved ? 'Sisa Pokok KPR' : 'Pokok Pinjaman'}
                  </span>
                  <span className="text-sm font-black font-mono tabular-nums text-emerald-700">
                    {formatterIDR.format(activeSchedule.principal)}
                  </span>
                </div>
                <span className="text-xs font-mono tabular-nums font-bold text-emerald-700">
                  {activeSchedule.totalPayment > 0
                    ? `${((activeSchedule.principal / activeSchedule.totalPayment) * 100).toFixed(1)}%`
                    : '0%'}
                </span>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-semibold text-slate-500 block">
                    Estimasi Total Bunga
                  </span>
                  <span className="text-sm font-black font-mono tabular-nums text-rose-600">
                    {formatterIDR.format(activeSchedule.totalInterest)}
                  </span>
                </div>
                <span className="text-xs font-mono tabular-nums font-bold text-rose-600">
                  {activeSchedule.totalPayment > 0
                    ? `${((activeSchedule.totalInterest / activeSchedule.totalPayment) * 100).toFixed(1)}%`
                    : '0%'}
                </span>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-semibold text-slate-500 block">
                    Titik Balik Pokok &gt; Bunga
                  </span>
                  <span className="text-sm font-black font-mono tabular-nums text-blue-700">
                    {activeSchedule.crossoverYear
                      ? activeSchedule.crossoverYear === 1
                        ? 'Sejak Tahun ke-1'
                        : `Tahun ke-${activeSchedule.crossoverYear}`
                      : 'Belum melampaui'}
                  </span>
                </div>
                <span className="text-[11px] font-mono tabular-nums font-bold text-slate-600">
                  {activeSchedule.yearlySchedule[0]
                    ? `Thn 1: ${activeSchedule.yearlySchedule[0].principalSharePct}% Pokok`
                    : '-'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Main Recharts Visualization (8 cols) */}
              <div className="lg:col-span-8 bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between text-[11px] font-bold text-slate-600 gap-2">
                  <span>
                    {chartView === 'yearly-split'
                      ? 'Total Pokok vs Bunga Tahunan (Batang) & Tren Sisa Pokok (Garis)'
                      : 'Rincian Cicilan 12 Bulan Pertama (Pokok vs Bunga)'}
                  </span>
                  <span className="text-[11px] text-slate-400 font-normal whitespace-nowrap shrink-0">
                    {chartView === 'yearly-split'
                      ? 'Sumbu kiri: Total/Thn · Sumbu kanan: Sisa Pokok'
                      : 'Satuan: Rupiah per bulan'}
                  </span>
                </div>

                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    {chartView === 'yearly-split' ? (
                      <ComposedChart
                        data={activeSchedule.yearlySchedule}
                        margin={{ top: 10, right: 8, left: 4, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <XAxis
                          dataKey="yearLabel"
                          tick={{ fontSize: 10, fill: '#64748b', fontWeight: 600 }}
                          axisLine={{ stroke: '#cbd5e1' }}
                          tickLine={false}
                        />
                        <YAxis
                          yAxisId="annual"
                          tickFormatter={(v) => formatCompactIDR(Number(v))}
                          tick={{ fontSize: 10, fill: '#64748b', fontWeight: 600 }}
                          axisLine={false}
                          tickLine={false}
                          width={66}
                        />
                        <YAxis
                          yAxisId="balance"
                          orientation="right"
                          tickFormatter={(v) => formatCompactIDR(Number(v))}
                          tick={{ fontSize: 10, fill: '#2563eb', fontWeight: 600 }}
                          axisLine={false}
                          tickLine={false}
                          width={66}
                        />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload || payload.length === 0) return null;
                            const row = payload[0]?.payload as KprYearlyRow | undefined;
                            if (!row) return null;
                            return (
                              <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-lg text-xs space-y-2 min-w-[235px]">
                                <div className="flex items-center justify-between border-b border-slate-100 pb-1.5 gap-3">
                                  <span className="font-black text-slate-800">
                                    Tahun ke-{row.year}
                                  </span>
                                  <span className="text-[11px] font-semibold text-slate-500">
                                    {row.phase}
                                  </span>
                                </div>
                                <div className="space-y-1 font-mono tabular-nums text-[11px]">
                                  <div className="flex items-center justify-between gap-4">
                                    <span className="font-sans text-slate-600">Total Bayar / Thn</span>
                                    <span className="font-extrabold text-slate-900">
                                      {formatterIDR.format(row.annualTotalPayment)}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between gap-4 text-emerald-700">
                                    <span className="font-sans font-semibold">
                                      Pokok ({row.principalSharePct}%)
                                    </span>
                                    <span className="font-bold">
                                      {formatterIDR.format(row.principalPaidYear)}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between gap-4 text-rose-600">
                                    <span className="font-sans font-semibold">
                                      Bunga ({row.interestSharePct}%)
                                    </span>
                                    <span className="font-bold">
                                      {formatterIDR.format(row.interestPaidYear)}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between gap-4 pt-1 border-t border-slate-100 text-blue-700">
                                    <span className="font-sans font-semibold">Sisa Pokok Akhir</span>
                                    <span className="font-extrabold">
                                      {formatterIDR.format(row.endingBalance)}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          }}
                        />
                        <Legend
                          wrapperStyle={{ fontSize: '11px', fontWeight: 700, paddingTop: '8px' }}
                        />
                        <Bar
                          yAxisId="annual"
                          dataKey="principalPaidYear"
                          name="Total Pokok / Thn"
                          stackId="annual"
                          fill="#10b981"
                          radius={[0, 0, 0, 0]}
                        />
                        <Bar
                          yAxisId="annual"
                          dataKey="interestPaidYear"
                          name="Total Bunga / Thn"
                          stackId="annual"
                          fill="#f43f5e"
                          radius={[4, 4, 0, 0]}
                        />
                        <Line
                          yAxisId="balance"
                          type="monotone"
                          dataKey="endingBalance"
                          name="Sisa Pokok KPR"
                          stroke="#2563eb"
                          strokeWidth={2.5}
                          dot={{ r: 2.5, fill: '#2563eb', strokeWidth: 0 }}
                          activeDot={{ r: 5 }}
                        />
                      </ComposedChart>
                    ) : (
                      <BarChart
                        data={activeSchedule.firstYearMonthlySchedule}
                        margin={{ top: 10, right: 12, left: 4, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <XAxis
                          dataKey="monthLabel"
                          tick={{ fontSize: 10, fill: '#64748b', fontWeight: 600 }}
                          axisLine={{ stroke: '#cbd5e1' }}
                          tickLine={false}
                        />
                        <YAxis
                          tickFormatter={(v) => formatCompactIDR(Number(v))}
                          tick={{ fontSize: 10, fill: '#64748b', fontWeight: 600 }}
                          axisLine={false}
                          tickLine={false}
                          width={66}
                        />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload || payload.length === 0) return null;
                            const row = payload[0]?.payload as KprMonthlyRow | undefined;
                            if (!row) return null;
                            return (
                              <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-lg text-xs space-y-1.5 min-w-[220px]">
                                <div className="flex items-center justify-between border-b border-slate-100 pb-1 gap-3">
                                  <span className="font-black text-slate-800">{row.monthLabel}</span>
                                  <span className="text-[11px] font-semibold text-slate-500">{row.phase}</span>
                                </div>
                                <div className="space-y-1 font-mono tabular-nums text-[11px]">
                                  <div className="flex justify-between gap-4">
                                    <span className="font-sans text-slate-600">Cicilan Total</span>
                                    <span className="font-extrabold text-slate-900">
                                      {formatterIDR.format(row.totalPayment)}
                                    </span>
                                  </div>
                                  <div className="flex justify-between gap-4 text-emerald-700">
                                    <span className="font-sans font-semibold">
                                      Pokok ({row.principalSharePct}%)
                                    </span>
                                    <span className="font-bold">{formatterIDR.format(row.principal)}</span>
                                  </div>
                                  <div className="flex justify-between gap-4 text-rose-600">
                                    <span className="font-sans font-semibold">
                                      Bunga ({row.interestSharePct}%)
                                    </span>
                                    <span className="font-bold">{formatterIDR.format(row.interest)}</span>
                                  </div>
                                  <div className="flex justify-between gap-4 pt-1 border-t border-slate-100 text-blue-700">
                                    <span className="font-sans font-semibold">Sisa Pokok</span>
                                    <span className="font-extrabold">
                                      {formatterIDR.format(row.endingBalance)}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          }}
                        />
                        <Legend
                          wrapperStyle={{ fontSize: '11px', fontWeight: 700, paddingTop: '8px' }}
                        />
                        <Bar
                          dataKey="principal"
                          name="Porsi Pokok / Bln"
                          stackId="cicilan-bln"
                          fill="#10b981"
                          radius={[0, 0, 0, 0]}
                        />
                        <Bar
                          dataKey="interest"
                          name="Porsi Bunga / Bln"
                          stackId="cicilan-bln"
                          fill="#f43f5e"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    )}
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Side Breakdown Donut: Total Tenor Principal vs Interest Ratio (4 cols) */}
              <div className="lg:col-span-4 bg-white rounded-xl border border-slate-200 p-4 flex flex-col justify-between space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <PieChartIcon className="h-4 w-4 text-indigo-600 shrink-0" />
                    <span className="text-[11px] font-extrabold text-slate-800 uppercase tracking-wider">
                      Proporsi Total Tenor ({activeSchedule.tenorYears} Thn)
                    </span>
                  </div>
                </div>

                <div className="h-40 w-full relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={donutData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={46}
                        outerRadius={68}
                        paddingAngle={3}
                      >
                        {donutData.map((entry, idx) => (
                          <Cell key={`kpr-cell-${idx}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number | string, name: string) => [
                          formatterIDR.format(Number(value)),
                          name,
                        ]}
                        contentStyle={{
                          borderRadius: '10px',
                          border: '1px solid #e2e8f0',
                          fontSize: '11px',
                          fontWeight: 700,
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-[9px] font-bold uppercase text-slate-400">Total Bayar</span>
                    <span className="text-[11px] font-black text-slate-900 font-mono tabular-nums">
                      {formatCompactIDR(activeSchedule.totalPayment)}
                    </span>
                  </div>
                </div>

                <div className="space-y-2 text-[11px]">
                  <div className="flex items-center justify-between bg-emerald-50/70 px-2.5 py-2 rounded-lg border border-emerald-100">
                    <span className="font-bold text-emerald-900">
                      Total Pokok (
                      {activeSchedule.totalPayment > 0
                        ? ((activeSchedule.principal / activeSchedule.totalPayment) * 100).toFixed(1)
                        : '0'}
                      %)
                    </span>
                    <span className="font-mono tabular-nums font-extrabold text-emerald-700">
                      {formatterIDR.format(activeSchedule.principal)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between bg-rose-50/70 px-2.5 py-2 rounded-lg border border-rose-100">
                    <span className="font-bold text-rose-900">
                      Total Bunga (
                      {activeSchedule.totalPayment > 0
                        ? ((activeSchedule.totalInterest / activeSchedule.totalPayment) * 100).toFixed(1)
                        : '0'}
                      %)
                    </span>
                    <span className="font-mono tabular-nums font-extrabold text-rose-700">
                      {formatterIDR.format(activeSchedule.totalInterest)}
                    </span>
                  </div>

                  {activeSchedule.yearlySchedule[0] && (
                    <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                      <span>Porsi Tahun ke-1:</span>
                      <span className="font-mono tabular-nums font-bold text-slate-700">
                        {activeSchedule.yearlySchedule[0].principalSharePct}% Pokok ·{' '}
                        {activeSchedule.yearlySchedule[0].interestSharePct}% Bunga
                      </span>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={onToggleAmortizationTable}
                    className="w-full py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {showAmortizationTable ? (
                      <>
                        <ChevronUp className="h-3.5 w-3.5" />
                        Sembunyikan Tabel Jadwal Tahunan
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-3.5 w-3.5" />
                        Buka Tabel Jadwal Tahunan ({activeSchedule.tenorYears} Thn)
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>

      {/* Collapsible Yearly Amortization Schedule Table */}
      {showAmortizationTable && activeSchedule.yearlySchedule.length > 0 && (
        <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/70">
          <div className="px-4 py-3 bg-slate-100 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
              Jadwal Amortisasi KPR per Tahun — {activeMeta.label}
            </h4>
            <span className="text-[11px] font-bold text-slate-500 font-mono tabular-nums">
              {activeMeta.isSaved ? 'Sisa Pokok' : 'Plafon'} {formatterIDR.format(activeSchedule.principal)} ·{' '}
              {activeSchedule.tenorYears} Tahun
            </span>
          </div>
          <div className="overflow-x-auto max-h-72 overflow-y-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-100/90 sticky top-0 text-[10px] uppercase font-extrabold text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2.5">Tahun</th>
                  <th className="px-4 py-2.5">Fase / Bunga</th>
                  <th className="px-4 py-2.5 text-right">Cicilan / Bln</th>
                  <th className="px-4 py-2.5 text-right">Pokok / Thn (% Porsi)</th>
                  <th className="px-4 py-2.5 text-right">Bunga / Thn (% Porsi)</th>
                  <th className="px-4 py-2.5 text-right">Sisa Pokok KPR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 bg-white">
                {activeSchedule.yearlySchedule.map((row) => (
                  <tr key={row.year} className="hover:bg-blue-50/40 transition">
                    <td className="px-4 py-2 font-bold text-slate-800 whitespace-nowrap">
                      Thn ke-{row.year}
                    </td>
                    <td className="px-4 py-2 text-[11px] font-semibold text-slate-600 whitespace-nowrap">
                      <span
                        className={
                          row.phase.startsWith('Floating') ? 'text-amber-700' : 'text-blue-700'
                        }
                      >
                        {row.phase}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums font-bold text-slate-800">
                      {formatterIDR.format(row.avgMonthlyPayment)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-emerald-700 font-semibold">
                      {formatterIDR.format(row.principalPaidYear)}{' '}
                      <span className="text-[10px] text-emerald-600 font-bold">
                        ({row.principalSharePct}%)
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-rose-600 font-semibold">
                      {formatterIDR.format(row.interestPaidYear)}{' '}
                      <span className="text-[10px] text-rose-500 font-bold">
                        ({row.interestSharePct}%)
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums font-extrabold text-slate-900">
                      {formatterIDR.format(row.endingBalance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
