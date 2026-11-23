import React, { useState } from 'react';
import { InvestmentAsset } from '../types';
import { FormattedNumberInput } from './FormattedNumberInput';
import { X, Calculator, TrendingUp, DollarSign, Calendar, Sparkles, ArrowUpRight, BarChart2, Layers } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

interface InvestmentSimulationCalculatorProps {
  isOpen: boolean;
  onClose: () => void;
  investments: InvestmentAsset[];
}

export const InvestmentSimulationCalculator: React.FC<InvestmentSimulationCalculatorProps> = ({
  isOpen,
  onClose,
  investments,
}) => {
  const [selectedAssetId, setSelectedAssetId] = useState<string>(investments[0]?.id || 'all');
  const [calcMode, setCalcMode] = useState<'targetPrice' | 'growthRate'>('targetPrice');
  
  // State Inputs
  const [targetUnitPrice, setTargetUnitPrice] = useState<number>(12000);
  const [annualGrowthRate, setAnnualGrowthRate] = useState<number>(12); // % per tahun
  const [yearsHorizon, setYearsHorizon] = useState<number>(3); // tahun
  const [monthlyDca, setMonthlyDca] = useState<number>(500000); // Rp / bulan

  const formatterIDR = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  });

  if (!isOpen) return null;

  // Selected asset or entire portfolio stats
  const isAll = selectedAssetId === 'all';
  const targetAsset = investments.find((i) => i.id === selectedAssetId);

  const currentQty = isAll
    ? 1
    : targetAsset
    ? targetAsset.quantity ?? targetAsset.units ?? 1
    : 1;

  const currentBalance = isAll
    ? investments.reduce((sum, i) => sum + i.balance, 0)
    : targetAsset
    ? targetAsset.balance
    : 0;

  const currentInitialCap = isAll
    ? investments.reduce((sum, i) => sum + (i.initialCapital !== undefined ? i.initialCapital : i.balance), 0)
    : targetAsset
    ? targetAsset.initialCapital !== undefined
      ? targetAsset.initialCapital
      : targetAsset.balance
    : 0;

  const currentPricePerUnit = currentQty > 0 ? currentBalance / currentQty : 0;

  // Calculate projected growth rate if in target price mode
  let effectiveGrowthRate = annualGrowthRate;
  if (calcMode === 'targetPrice' && currentPricePerUnit > 0) {
    const totalGrowth = targetUnitPrice / currentPricePerUnit;
    if (totalGrowth > 0 && yearsHorizon > 0) {
      effectiveGrowthRate = (Math.pow(totalGrowth, 1 / yearsHorizon) - 1) * 100;
    }
  }

  // Calculate year by year simulation
  const monthlyRate = effectiveGrowthRate / 100 / 12;
  const totalMonths = yearsHorizon * 12;

  let projectedBalance = currentBalance;
  let totalDcaInvested = 0;

  const yearlyProjectionData = [
    {
      year: 'Saat Ini',
      totalValuation: Math.round(currentBalance),
      totalCapital: Math.round(currentInitialCap),
      netProfit: Math.round(currentBalance - currentInitialCap),
    },
  ];

  for (let m = 1; m <= totalMonths; m++) {
    // Add growth
    projectedBalance = projectedBalance * (1 + monthlyRate);
    // Add DCA
    projectedBalance += monthlyDca;
    totalDcaInvested += monthlyDca;

    if (m % 12 === 0) {
      const yearNum = m / 12;
      const totalCapNow = currentInitialCap + totalDcaInvested;
      yearlyProjectionData.push({
        year: `Tahun ke-${yearNum}`,
        totalValuation: Math.round(projectedBalance),
        totalCapital: Math.round(totalCapNow),
        netProfit: Math.round(projectedBalance - totalCapNow),
      });
    }
  }

  const finalValuation = projectedBalance;
  const finalTotalCapital = currentInitialCap + totalDcaInvested;
  const finalNetProfit = finalValuation - finalTotalCapital;
  const finalRoiPct = finalTotalCapital > 0 ? (finalNetProfit / finalTotalCapital) * 100 : 0;

  // Benchmark Comparisons (simulasi DCA bulanan agar setara/apple-to-apple dengan skenario target)
  const simulateBenchmarkDca = (annualRate: number) => {
    let bal = currentBalance;
    const mRate = annualRate / 12;
    for (let m = 1; m <= totalMonths; m++) {
      bal = bal * (1 + mRate) + monthlyDca;
    }
    return bal;
  };
  const bankDepositValuation = simulateBenchmarkDca(0.04);
  const sbnValuation = simulateBenchmarkDca(0.065);

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-4xl w-full shadow-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="p-5 sm:p-6 bg-gradient-to-r from-blue-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-500/30 border border-blue-400/40 rounded-xl text-blue-300">
              <Calculator className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
                Kalkulator Simulasi & Proyeksi Keuntungan Target
              </h3>
              <p className="text-xs text-slate-300">
                Prediksi potensi imbal hasil bersih & skenario DCA di masa depan
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* Inputs Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 dark:bg-slate-850 p-5 rounded-2xl border border-slate-200 dark:border-slate-800">
            {/* Left Inputs */}
            <div className="space-y-4">
              <div>
                <label className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider block mb-1">
                  Pilih Aset Investasi
                </label>
                <select
                  value={selectedAssetId}
                  onChange={(e) => {
                    setSelectedAssetId(e.target.value);
                    const inv = investments.find((i) => i.id === e.target.value);
                    if (inv) {
                      const qty = inv.quantity ?? inv.units ?? 1;
                      const p = inv.unitPrice ?? inv.currentUnitPrice ?? (inv.balance / qty);
                      setTargetUnitPrice(Math.round(p * 1.3));
                    }
                  }}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-bold text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">Seluruh Portofolio Investasi ({formatterIDR.format(investments.reduce((s,i)=>s+i.balance,0))})</option>
                  {investments.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.name} ({inv.category})
                    </option>
                  ))}
                </select>
              </div>

              {/* Current Asset Status Card */}
              <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Valuasi Saat Ini:</span>
                  <span className="font-extrabold text-slate-800 dark:text-slate-200">
                    {formatterIDR.format(currentBalance)}
                  </span>
                </div>
                {!isAll && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Harga Unit Saat Ini:</span>
                    <span className="font-bold text-blue-600 dark:text-blue-400 font-mono">
                      {formatterIDR.format(currentPricePerUnit)} / {targetAsset?.unitName || 'Unit'}
                    </span>
                  </div>
                )}
              </div>

              {/* Mode Selection */}
              <div>
                <label className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider block mb-1">
                  Metode Proyeksi Keuntungan
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCalcMode('targetPrice')}
                    disabled={isAll}
                    className={`p-2.5 rounded-xl border text-xs font-extrabold transition cursor-pointer ${
                      calcMode === 'targetPrice' && !isAll
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                        : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Target Harga per Unit
                  </button>
                  <button
                    type="button"
                    onClick={() => setCalcMode('growthRate')}
                    className={`p-2.5 rounded-xl border text-xs font-extrabold transition cursor-pointer ${
                      calcMode === 'growthRate' || isAll
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                        : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Target Growth % / Tahun
                  </button>
                </div>
              </div>
            </div>

            {/* Right Inputs */}
            <div className="space-y-4">
              {calcMode === 'targetPrice' && !isAll ? (
                <div>
                  <label className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider block mb-1">
                    Target Harga Unit di Masa Depan (Rp)
                  </label>
                  <FormattedNumberInput
                    value={targetUnitPrice}
                    onChange={(_, numVal) => setTargetUnitPrice(numVal)}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-sm font-black font-mono text-blue-600 dark:text-blue-400"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Proyeksi kenaikan harga: +
                    {currentPricePerUnit > 0
                      ? (((targetUnitPrice - currentPricePerUnit) / currentPricePerUnit) * 100).toFixed(1)
                      : 0}
                    %
                  </p>
                </div>
              ) : (
                <div>
                  <label className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider block mb-1">
                    Target Pertumbuhan Tahunan (% Annual Return)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={annualGrowthRate}
                    onChange={(e) => setAnnualGrowthRate(Number(e.target.value))}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-sm font-black font-mono text-blue-600 dark:text-blue-400"
                  />
                </div>
              )}

              <div>
                <label className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider block mb-1">
                  Jangka Waktu Investasi (Tahun)
                </label>
                <div className="flex gap-2">
                  {[1, 3, 5, 10].map((yr) => (
                    <button
                      key={yr}
                      type="button"
                      onClick={() => setYearsHorizon(yr)}
                      className={`flex-1 py-2 rounded-lg border text-xs font-bold transition cursor-pointer ${
                        yearsHorizon === yr
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      {yr} Thn
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider block mb-1">
                  Rencana Top Up DCA Bulanan (Rp)
                </label>
                <FormattedNumberInput
                  value={monthlyDca}
                  onChange={(_, numVal) => setMonthlyDca(numVal)}
                  placeholder="Contoh: 500.000"
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-bold font-mono"
                />
              </div>
            </div>
          </div>

          {/* Results Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-2xl shadow-lg space-y-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-blue-200">
                Proyeksi Valuasi Akhir
              </span>
              <p className="text-2xl font-black font-mono tracking-tight">
                {formatterIDR.format(finalValuation)}
              </p>
              <p className="text-[11px] text-blue-100 font-medium">
                Setelah {yearsHorizon} tahun ({yearsHorizon * 12} bulan)
              </p>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-850 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                Total Modal Terinvestasi
              </span>
              <p className="text-xl font-bold font-mono text-slate-800 dark:text-slate-100">
                {formatterIDR.format(finalTotalCapital)}
              </p>
              <p className="text-[11px] text-slate-500">
                Modal Awal + Top Up DCA ({formatterIDR.format(totalDcaInvested)})
              </p>
            </div>

            <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 rounded-2xl border border-emerald-200 dark:border-emerald-800/60 space-y-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                Estimasi Keuntungan Bersih (Gain)
              </span>
              <p className="text-xl font-black font-mono text-emerald-600 dark:text-emerald-400">
                +{formatterIDR.format(finalNetProfit)}
              </p>
              <p className="text-[11px] font-extrabold text-emerald-700 dark:text-emerald-300">
                Return on Investment (ROI): +{finalRoiPct.toFixed(2)}%
              </p>
            </div>
          </div>

          {/* Projection Area Chart */}
          <div className="p-5 bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-3">
            <h4 className="text-xs font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-blue-600" />
              Grafik Pertumbuhan Valuasi Portofolio vs Total Modal
            </h4>

            <div className="h-56 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={yearlyProjectionData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorCap" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#64748b" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#64748b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="year" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(val: any) => [formatterIDR.format(Number(val)), '']} />
                  <Area
                    type="monotone"
                    dataKey="totalValuation"
                    name="Valuasi Portofolio"
                    stroke="#2563eb"
                    fillOpacity={1}
                    fill="url(#colorVal)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="totalCapital"
                    name="Total Modal Investasi"
                    stroke="#64748b"
                    fillOpacity={1}
                    fill="url(#colorCap)"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Benchmark Comparison Card */}
          <div className="p-4 bg-slate-50 dark:bg-slate-850 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
            <h4 className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <BarChart2 className="h-4 w-4 text-blue-600" />
              Perbandingan Hasil Dengan Instrumen Pembanding (Benchmark)
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
              <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] text-slate-400 font-sans block">Deposito Bank (~4%)</span>
                <span className="font-bold text-slate-700 dark:text-slate-300">
                  {formatterIDR.format(bankDepositValuation)}
                </span>
              </div>

              <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] text-slate-400 font-sans block">Sukuk / SBN (~6.5%)</span>
                <span className="font-bold text-slate-700 dark:text-slate-300">
                  {formatterIDR.format(sbnValuation)}
                </span>
              </div>

              <div className="p-3 bg-blue-50 dark:bg-blue-950/40 rounded-xl border border-blue-200 dark:border-blue-900/50">
                <span className="text-[10px] text-blue-600 dark:text-blue-400 font-sans font-bold block">
                  Skenario Target Anda ({effectiveGrowthRate.toFixed(1)}%)
                </span>
                <span className="font-black text-blue-600 dark:text-blue-400">
                  {formatterIDR.format(finalValuation)}
                </span>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2 border-t border-slate-200 dark:border-slate-800">
            <button
              onClick={onClose}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl transition cursor-pointer"
            >
              Selesai Simulasi
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
