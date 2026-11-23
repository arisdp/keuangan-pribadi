import React, { useState, useMemo } from 'react';
import { Transaction, Account, CategoryBudget } from '../types';
import { isOperatingExpense, isOperatingIncome, parseLocalDate } from '../utils/accountingEngine';
import { Calculator, Sparkles, TrendingUp, PiggyBank, ArrowUpRight, CheckCircle2, Sliders, Calendar, ShieldCheck, Flame, PieChart as PieIcon } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

interface WhatIfSavingsSimulatorProps {
  transactions: Transaction[];
  accounts?: Account[];
  emergencyBalance?: number;
  budgets?: CategoryBudget[];
}

export const WhatIfSavingsSimulator: React.FC<WhatIfSavingsSimulatorProps> = ({
  transactions = [],
  accounts = [],
  emergencyBalance = 0,
  budgets = [],
}) => {
  // Current liquid savings balance (Cash, Bank, E-Wallet)
  const currentLiquidBalance = useMemo(() => {
    const accountSum = accounts
      .filter((a) => a.type !== 'credit-card' && a.type !== 'paylater')
      .reduce((sum, a) => sum + a.currentBalance, 0);
    return accountSum + (emergencyBalance || 0);
  }, [accounts, emergencyBalance]);

  // Extract monthly expense categories and spending averages
  const { categoryAverages, totalMonthlyExpense } = useMemo(() => {
    const expenseTxs = transactions.filter((t) => isOperatingExpense(t));
    if (expenseTxs.length === 0) {
      return { categoryAverages: [], totalMonthlyExpense: 0 };
    }

    // Determine total months span in dataset (at least 1)
    const dates = expenseTxs.map((t) => t.date).filter(Boolean).sort();
    const startDate = (dates[0] && parseLocalDate(dates[0])) || new Date();
    const endDate = (dates[dates.length - 1] && parseLocalDate(dates[dates.length - 1])) || new Date();
    const monthDiff = Math.max(
      1,
      (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth()) + 1
    );

    const catSums: Record<string, number> = {};
    expenseTxs.forEach((tx) => {
      catSums[tx.category] = (catSums[tx.category] || 0) + tx.amount;
    });

    const categoryAverages = Object.entries(catSums).map(([cat, total]) => {
      const avgMonthly = total / monthDiff;
      return {
        category: cat,
        total,
        avgMonthly: Math.round(avgMonthly),
      };
    }).sort((a, b) => b.avgMonthly - a.avgMonthly);

    const totalMonthlyExpense = categoryAverages.reduce((sum, c) => sum + c.avgMonthly, 0);

    return { categoryAverages, totalMonthlyExpense };
  }, [transactions]);

  // Selected categories for reduction (default: all top expense categories)
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(() => {
    return new Set(categoryAverages.map((c) => c.category));
  });

  // Reduction percentage: default 10% as requested
  const [reductionPct, setReductionPct] = useState<number>(10);

  // Timeframe horizon in years (1, 3, 5, 10)
  const [projectionYears, setProjectionYears] = useState<number>(3);

  // Estimated annual return rate (%) if extra savings are invested
  const [investmentReturnRate, setInvestmentReturnRate] = useState<number>(6);

  // Calculate monthly income baseline average
  const avgMonthlyIncome = useMemo(() => {
    const incomeTxs = transactions.filter((t) => isOperatingIncome(t));
    if (incomeTxs.length === 0) return totalMonthlyExpense * 1.3; // Default estimate
    const totalInc = incomeTxs.reduce((sum, t) => sum + t.amount, 0);
    const dates = incomeTxs.map((t) => t.date).filter(Boolean).sort();
    const startDate = (dates[0] && parseLocalDate(dates[0])) || new Date();
    const endDate = (dates[dates.length - 1] && parseLocalDate(dates[dates.length - 1])) || new Date();
    const monthDiff = Math.max(
      1,
      (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth()) + 1
    );
    return Math.round(totalInc / monthDiff);
  }, [transactions, totalMonthlyExpense]);

  // Calculate monthly savings under What-If scenario
  const selectedMonthlyExpense = useMemo(() => {
    return categoryAverages
      .filter((c) => selectedCategories.has(c.category))
      .reduce((sum, c) => sum + c.avgMonthly, 0);
  }, [categoryAverages, selectedCategories]);

  const monthlyAmountSaved = useMemo(() => {
    return Math.round(selectedMonthlyExpense * (reductionPct / 100));
  }, [selectedMonthlyExpense, reductionPct]);

  const baselineMonthlyNetSavings = Math.max(0, avgMonthlyIncome - totalMonthlyExpense);
  const whatIfMonthlyNetSavings = baselineMonthlyNetSavings + monthlyAmountSaved;

  // Chart data for monthly projections
  const projectionChartData = useMemo(() => {
    const totalMonths = projectionYears * 12;
    const data = [];

    let baselineBalance = currentLiquidBalance;
    let whatIfBalance = currentLiquidBalance;
    const monthlyRate = investmentReturnRate / 100 / 12;

    // Initial Month 0
    data.push({
      month: 0,
      label: 'M-0 (Sekarang)',
      baseline: Math.round(baselineBalance),
      whatIf: Math.round(whatIfBalance),
      selisih: 0,
    });

    for (let m = 1; m <= totalMonths; m++) {
      // Compound interest + monthly contribution
      baselineBalance = (baselineBalance + baselineMonthlyNetSavings) * (1 + monthlyRate);
      whatIfBalance = (whatIfBalance + whatIfMonthlyNetSavings) * (1 + monthlyRate);

      if (m % 3 === 0 || m === totalMonths) {
        const yearNum = (m / 12).toFixed(m % 12 === 0 ? 0 : 1);
        data.push({
          month: m,
          label: `Bln ${m} (${yearNum} thn)`,
          baseline: Math.round(baselineBalance),
          whatIf: Math.round(whatIfBalance),
          selisih: Math.round(whatIfBalance - baselineBalance),
        });
      }
    }

    return data;
  }, [currentLiquidBalance, baselineMonthlyNetSavings, whatIfMonthlyNetSavings, projectionYears, investmentReturnRate]);

  const finalProjectedExtra = useMemo(() => {
    if (projectionChartData.length === 0) return 0;
    const last = projectionChartData[projectionChartData.length - 1];
    return last.whatIf - last.baseline;
  }, [projectionChartData]);

  const toggleCategory = (catName: string) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(catName)) {
        next.delete(catName);
      } else {
        next.add(catName);
      }
      return next;
    });
  };

  const toggleAllCategories = () => {
    if (selectedCategories.size === categoryAverages.length) {
      setSelectedCategories(new Set());
    } else {
      setSelectedCategories(new Set(categoryAverages.map((c) => c.category)));
    }
  };

  const formatterIDR = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2.5 bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-xl shadow-xs">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                Simulasi Interactive "What-If" Hemat Tabungan
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Proyeksikan akumulasi saldo tabungan dan aset Anda di masa depan dengan menekan pengeluaran kategori tertentu.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
            Saldo Likuid Saat Ini: <strong className="text-indigo-600 dark:text-indigo-400 font-mono ml-1">{formatterIDR.format(currentLiquidBalance)}</strong>
          </span>
        </div>
      </div>

      {/* Simulator Control Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Category Toggles & Reduction Sliders (5 cols) */}
        <div className="lg:col-span-5 space-y-5 bg-slate-50 dark:bg-slate-800/60 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-700/60">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
              <Sliders className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>1. Target Pengurangan Pengeluaran</span>
            </h4>
            <button
              onClick={toggleAllCategories}
              className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              {selectedCategories.size === categoryAverages.length ? 'Pilih Tidak Ada' : 'Pilih Semua'}
            </button>
          </div>

          {/* Preset Buttons for % Reduction */}
          <div>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-2">
              Persentase Hemat / Efisiensi (%):
            </label>
            <div className="flex flex-wrap gap-2">
              {[5, 10, 15, 20, 25, 30].map((pct) => (
                <button
                  key={pct}
                  onClick={() => setReductionPct(pct)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    reductionPct === pct
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 hover:border-indigo-300'
                  }`}
                >
                  {pct}% {pct === 10 && '(Rekomendasi)'}
                </button>
              ))}
            </div>

            {/* Custom Range Slider */}
            <div className="mt-3 flex items-center gap-3">
              <input
                type="range"
                min="1"
                max="50"
                value={reductionPct}
                onChange={(e) => setReductionPct(Number(e.target.value))}
                className="w-full accent-indigo-600 cursor-pointer h-2 bg-slate-200 dark:bg-slate-700 rounded-lg"
              />
              <span className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400 w-10 text-right">
                {reductionPct}%
              </span>
            </div>
          </div>

          {/* Timeframe & Return Horizon */}
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200/80 dark:border-slate-700/80">
            <div>
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block mb-1">
                Jangka Waktu Proyeksi:
              </label>
              <select
                value={projectionYears}
                onChange={(e) => setProjectionYears(Number(e.target.value))}
                className="w-full text-xs bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 font-semibold text-slate-800 dark:text-slate-100"
              >
                <option value={1}>1 Tahun (12 Bln)</option>
                <option value={3}>3 Tahun (36 Bln)</option>
                <option value={5}>5 Tahun (60 Bln)</option>
                <option value={10}>10 Tahun (120 Bln)</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block mb-1">
                Return Investasi (%/thn):
              </label>
              <select
                value={investmentReturnRate}
                onChange={(e) => setInvestmentReturnRate(Number(e.target.value))}
                className="w-full text-xs bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 font-semibold text-slate-800 dark:text-slate-100"
              >
                <option value={0}>0% (Tabungan Tunai)</option>
                <option value={4}>4% (Deposito / Obligasi)</option>
                <option value={6}>6% (Reksadana Campuran)</option>
                <option value={8}>8% (Portofolio Saham)</option>
                <option value={12}>12% (Agresif Growth)</option>
              </select>
            </div>
          </div>

          {/* Category List Toggle Cards */}
          <div className="space-y-2 pt-2 border-t border-slate-200/80 dark:border-slate-700/80">
            <span className="text-[11px] font-extrabold uppercase text-slate-500 dark:text-slate-400 block mb-1">
              Pilih Kategori Kebutuhan yang Dihemat:
            </span>
            <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin">
              {categoryAverages.length === 0 ? (
                <p className="text-xs text-slate-400 italic">Belum ada data pengeluaran terdeteksi.</p>
              ) : (
                categoryAverages.map((cat) => {
                  const isChecked = selectedCategories.has(cat.category);
                  const catSaved = Math.round(cat.avgMonthly * (reductionPct / 100));

                  return (
                    <div
                      key={cat.category}
                      onClick={() => toggleCategory(cat.category)}
                      className={`flex items-center justify-between p-2.5 rounded-xl border text-xs cursor-pointer transition ${
                        isChecked
                          ? 'bg-white dark:bg-slate-700 border-indigo-200 dark:border-indigo-600 shadow-2xs'
                          : 'bg-slate-100/60 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 opacity-60'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate pr-2">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}} // handled by div click
                          className="rounded text-indigo-600 focus:ring-indigo-500 accent-indigo-600"
                        />
                        <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                          {cat.category}
                        </span>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-slate-500 text-[10px] block">Rata-rata: {formatterIDR.format(cat.avgMonthly)}/bln</span>
                        <span className="text-indigo-600 dark:text-indigo-400 font-bold font-mono text-[11px]">
                          Hemat: +{formatterIDR.format(catSaved)}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Projection Dashboard & Chart (7 cols) */}
        <div className="lg:col-span-7 space-y-5 flex flex-col justify-between">
          
          {/* Key Simulation Outcome Banner */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 rounded-2xl border border-emerald-200 dark:border-emerald-800/80">
              <span className="text-[10px] uppercase font-extrabold text-emerald-700 dark:text-emerald-400 tracking-wider block">
                Tambahan Hemat Bulanan
              </span>
              <p className="text-xl font-black text-emerald-700 dark:text-emerald-300 font-mono mt-1">
                +{formatterIDR.format(monthlyAmountSaved)}
              </p>
              <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
                Hemat Rp {formatterIDR.format(monthlyAmountSaved * 12)} / tahun
              </p>
            </div>

            <div className="p-4 bg-indigo-50 dark:bg-indigo-950/40 rounded-2xl border border-indigo-200 dark:border-indigo-800/80">
              <span className="text-[10px] uppercase font-extrabold text-indigo-700 dark:text-indigo-400 tracking-wider block">
                Ekstra Akumulasi ({projectionYears} Tahun)
              </span>
              <p className="text-xl font-black text-indigo-700 dark:text-indigo-300 font-mono mt-1">
                +{formatterIDR.format(finalProjectedExtra)}
              </p>
              <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-0.5">
                Pertumbuhan compounding {investmentReturnRate}% p.a.
              </p>
            </div>
          </div>

          {/* Projection Line Chart */}
          <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-700 pb-2">
              <h4 className="text-xs font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
                <span>Proyeksi Pertumbuhan Saldo ({projectionYears} Tahun)</span>
              </h4>
              <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-md font-bold">
                +{reductionPct}% Efisiensi
              </span>
            </div>

            <div className="h-60 w-full mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={projectionChartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis
                    tickFormatter={(v) => `${(v / 1000000).toFixed(0)}Jt`}
                    tick={{ fontSize: 10 }}
                  />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      formatterIDR.format(value),
                      name === 'whatIf' ? `Dengan Simulasi (${reductionPct}% Hemat)` : 'Tanpa Simulasi (Status Quo)',
                    ]}
                  />
                  <Legend
                    formatter={(value) => (value === 'whatIf' ? `Dengan Simulasi Hemat ${reductionPct}%` : 'Tanpa Simulasi')}
                  />
                  <Line
                    type="monotone"
                    dataKey="baseline"
                    name="baseline"
                    stroke="#94a3b8"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="whatIf"
                    name="whatIf"
                    stroke="#10b981"
                    strokeWidth={3}
                    dot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* AI Financial Insight Note */}
          <div className="bg-amber-50/80 dark:bg-amber-950/30 p-4 rounded-xl border border-amber-200 dark:border-amber-800/60 flex items-start gap-3">
            <PiggyBank className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900 dark:text-amber-200 space-y-1">
              <p className="font-bold">Rekomendasi Strategi AI:</p>
              <p>
                Dengan menghemat <strong>{reductionPct}%</strong> pada {selectedCategories.size} kategori pilihan Anda, Anda bisa mengalokasikan <strong>{formatterIDR.format(monthlyAmountSaved)}</strong> setiap bulan langsung ke portofolio investasi atau Dana Darurat. Dalam <strong>{projectionYears} tahun</strong>, keputusan kecil ini menghasilkan nilai tambah bersih sebesar <strong>{formatterIDR.format(finalProjectedExtra)}</strong>!
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
