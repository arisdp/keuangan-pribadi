import React, { useState, useMemo } from 'react';
import { CategoryBudget, Transaction } from '../types';
import { RefreshCw, Sparkles, ArrowRight, CheckCircle2, TrendingUp, TrendingDown, AlertCircle, Sliders, Check, RotateCcw } from 'lucide-react';

interface BudgetRebalancingCardProps {
  budgets: CategoryBudget[];
  transactions: Transaction[];
  onUpdateBudgetLimit: (category: string, newLimit: number) => void;
  selectedMonthStr?: string; // Current month e.g. '2026-07'
}

export interface RebalanceSuggestion {
  category: string;
  type: 'expense' | 'saving' | 'investment';
  currentLimit: number;
  prevMonthActual: number;
  variance: number; // prevMonthActual - currentLimit
  status: 'overspent' | 'underspent' | 'balanced';
  proposedLimit: number;
  recommendationReason: string;
}

export const BudgetRebalancingCard: React.FC<BudgetRebalancingCardProps> = ({
  budgets,
  transactions,
  onUpdateBudgetLimit,
  selectedMonthStr,
}) => {
  // Determine previous month YYYY-MM
  const now = new Date();
  const currentYm = selectedMonthStr || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  
  const [targetYm, setTargetYm] = useState<string>(() => {
    const [y, m] = currentYm.split('-').map(Number);
    const prevDate = new Date(y, m - 2, 1);
    return `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
  });

  // Safety buffer % added to actual spending for overspent categories
  const [bufferPercent, setBufferPercent] = useState<number>(5);

  // Filter category type
  const [activeType, setActiveType] = useState<'all' | 'expense' | 'saving' | 'investment'>('expense');

  // Track applied items in session
  const [appliedCategories, setAppliedCategories] = useState<Set<string>>(new Set());

  const formatterIDR = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

  // Compute actual spending in target month per budget category
  const rebalanceSuggestions: RebalanceSuggestion[] = useMemo(() => {
    const filteredBudgets = activeType === 'all'
      ? budgets
      : budgets.filter((b) => b.type === activeType);

    return filteredBudgets.map((b) => {
      // Calculate actual spent in target month
      const prevMonthActual = transactions
        .filter((t) => {
          const isCategoryMatch = t.category.toLowerCase() === b.category.toLowerCase();
          const isTypeMatch = t.type === b.type;
          const isMonthMatch = t.date.startsWith(targetYm);
          return isCategoryMatch && isTypeMatch && isMonthMatch;
        })
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);

      const variance = prevMonthActual - b.limit;
      let status: 'overspent' | 'underspent' | 'balanced' = 'balanced';
      let proposedLimit = b.limit;
      let recommendationReason = '';

      // Threshold criteria
      if (b.limit === 0 && prevMonthActual > 0) {
        status = 'overspent';
        proposedLimit = Math.ceil((prevMonthActual * (1 + bufferPercent / 100)) / 50000) * 50000;
        recommendationReason = `Kategori ini belum memiliki limit tetapi memiliki pengeluaran ${formatterIDR.format(prevMonthActual)} bulan lalu. Dibuatkan limit baru.`;
      } else if (variance > 0) {
        // Overspent
        status = 'overspent';
        // Propose increasing limit to actual + buffer, rounded up to nearest 50k
        const rawProposed = prevMonthActual * (1 + bufferPercent / 100);
        proposedLimit = Math.ceil(rawProposed / 50000) * 50000;
        const increaseAmt = proposedLimit - b.limit;
        recommendationReason = `Pengeluaran melebihi limit sebesar ${formatterIDR.format(variance)}. Disarankan menaikkan limit +${formatterIDR.format(increaseAmt)} (termasuk buffer ${bufferPercent}%) agar realistis.`;
      } else if (prevMonthActual < b.limit * 0.75 && b.limit > 100000) {
        // Significantly Underspent (less than 75% utilized)
        status = 'underspent';
        const unused = b.limit - prevMonthActual;
        // Reduce limit by 70% of unused portion, rounded to nearest 50k
        const reduction = Math.floor((unused * 0.7) / 50000) * 50000;
        proposedLimit = Math.max(50000, b.limit - reduction);
        recommendationReason = `Hanya terpakai ${Math.round((prevMonthActual / b.limit) * 100)}% dari limit (${formatterIDR.format(prevMonthActual)}). Disarankan memangkas limit -${formatterIDR.format(b.limit - proposedLimit)} untuk rebalancing ke kategori lain.`;
      } else {
        status = 'balanced';
        proposedLimit = b.limit;
        recommendationReason = `Pengunaan anggaran seimbang (${Math.round((prevMonthActual / Math.max(1, b.limit)) * 100)}%). Limit saat ini sudah optimal.`;
      }

      return {
        category: b.category,
        type: b.type,
        currentLimit: b.limit,
        prevMonthActual,
        variance,
        status,
        proposedLimit,
        recommendationReason,
      };
    }).sort((a, b) => {
      // Prioritize items that need action (overspent first, then underspent)
      const order = { overspent: 1, underspent: 2, balanced: 3 };
      return order[a.status] - order[b.status];
    });
  }, [budgets, transactions, targetYm, bufferPercent, activeType]);

  const actionableSuggestions = useMemo(() => {
    return rebalanceSuggestions.filter((s) => s.status !== 'balanced' && s.proposedLimit !== s.currentLimit);
  }, [rebalanceSuggestions]);

  // Overall Rebalancing Stats
  const totalCurrentLimit = useMemo(() => rebalanceSuggestions.reduce((a, b) => a + b.currentLimit, 0), [rebalanceSuggestions]);
  const totalProposedLimit = useMemo(() => rebalanceSuggestions.reduce((a, b) => a + b.proposedLimit, 0), [rebalanceSuggestions]);
  const netChange = totalProposedLimit - totalCurrentLimit;

  const handleApplySingle = (category: string, newLimit: number) => {
    onUpdateBudgetLimit(category, newLimit);
    setAppliedCategories((prev) => new Set(prev).add(category));
  };

  const handleApplyAll = () => {
    if (actionableSuggestions.length === 0) return;
    actionableSuggestions.forEach((item) => {
      onUpdateBudgetLimit(item.category, item.proposedLimit);
    });
    const allCatNames = new Set(actionableSuggestions.map((s) => s.category));
    setAppliedCategories(allCatNames);
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-2xl shadow-md">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
              Saran Otomatis Rebalancing Anggaran
              <span className="text-[10px] font-extrabold bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                AI Smart Rebalancer
              </span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Optimalkan limit anggaran secara fleksibel berdasarkan realisasi pengeluaran riil bulan sebelumnya.
            </p>
          </div>
        </div>

        {/* Toolbar Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Target Month Picker */}
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Realisasi Acuan:</span>
            <input
              type="month"
              value={targetYm}
              onChange={(e) => {
                setTargetYm(e.target.value);
                setAppliedCategories(new Set());
              }}
              className="bg-transparent text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer"
            />
          </div>

          {/* Buffer % Selector */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 px-1.5">Buffer:</span>
            {[0, 5, 10].map((b) => (
              <button
                key={b}
                onClick={() => setBufferPercent(b)}
                className={`px-2 py-0.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  bufferPercent === b
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                +{b}%
              </button>
            ))}
          </div>

          {/* Type Filter */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
            {(['expense', 'saving', 'investment', 'all'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setActiveType(t)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold capitalize transition cursor-pointer ${
                  activeType === t
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                {t === 'expense' ? 'Pengeluaran' : t === 'saving' ? 'Tabungan' : t === 'investment' ? 'Investasi' : 'Semua'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Rebalancing Impact Summary Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
          <span className="text-[10px] font-extrabold uppercase text-slate-500 dark:text-slate-400 block">
            Total Limit Saat Ini
          </span>
          <p className="text-base font-bold text-slate-800 dark:text-slate-100 mt-1">
            {formatterIDR.format(totalCurrentLimit)}
          </p>
        </div>

        <div className="p-3.5 bg-indigo-50/70 dark:bg-indigo-950/30 rounded-xl border border-indigo-200 dark:border-indigo-800/60">
          <span className="text-[10px] font-extrabold uppercase text-indigo-700 dark:text-indigo-300 block">
            Total usulan rebalance
          </span>
          <p className="text-base font-bold text-indigo-800 dark:text-indigo-200 mt-1">
            {formatterIDR.format(totalProposedLimit)}
          </p>
          <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 mt-0.5 block">
            {netChange >= 0 ? `Net Penyesuaian: +${formatterIDR.format(netChange)}` : `Net Penyesuaian: ${formatterIDR.format(netChange)}`}
          </span>
        </div>

        <div className="p-3.5 bg-emerald-50/70 dark:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-800/60 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-extrabold uppercase text-emerald-700 dark:text-emerald-300 block">
              Saran Perbaikan
            </span>
            <p className="text-base font-extrabold text-emerald-800 dark:text-emerald-200 mt-1">
              {actionableSuggestions.length} Kategori
            </p>
          </div>
          <button
            onClick={handleApplyAll}
            disabled={actionableSuggestions.length === 0}
            className="px-3.5 py-2 bg-gradient-to-r from-emerald-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 text-white text-xs font-bold rounded-xl shadow-md transition flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Terapkan Semua</span>
          </button>
        </div>
      </div>

      {/* Suggestion Cards Grid */}
      <div className="space-y-3">
        <h4 className="text-xs font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
          <Sliders className="w-3.5 h-3.5 text-indigo-600" />
          <span>Daftar Rekomendasi Rebalancing (Acuan Realisasi {targetYm}):</span>
        </h4>

        {rebalanceSuggestions.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400 italic bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
            Tidak ada kategori anggaran ditemukan untuk filter ini.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {rebalanceSuggestions.map((item) => {
              const isApplied = appliedCategories.has(item.category);
              const isNeedsAction = item.status !== 'balanced' && item.proposedLimit !== item.currentLimit;

              return (
                <div
                  key={item.category}
                  className={`p-4 rounded-xl border transition space-y-3 relative overflow-hidden ${
                    item.status === 'overspent'
                      ? 'bg-rose-50/40 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/40'
                      : item.status === 'underspent'
                      ? 'bg-amber-50/40 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/40'
                      : 'bg-slate-50/50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/60'
                  }`}
                >
                  {/* Status Tag Header */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 truncate">
                      <span className="font-bold text-sm text-slate-800 dark:text-slate-100 truncate">
                        {item.category}
                      </span>
                      <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                        {item.type}
                      </span>
                    </div>

                    <span
                      className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase flex items-center gap-1 shrink-0 ${
                        item.status === 'overspent'
                          ? 'bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                          : item.status === 'underspent'
                          ? 'bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                          : 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                      }`}
                    >
                      {item.status === 'overspent' && <TrendingUp className="w-3 h-3" />}
                      {item.status === 'underspent' && <TrendingDown className="w-3 h-3" />}
                      {item.status === 'balanced' && <CheckCircle2 className="w-3 h-3" />}
                      <span>
                        {item.status === 'overspent'
                          ? 'Overspent / Defisit'
                          : item.status === 'underspent'
                          ? 'Underspent / Surplus'
                          : 'Optimal'}
                      </span>
                    </span>
                  </div>

                  {/* Financial Comparison Metrics */}
                  <div className="grid grid-cols-3 gap-2 bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-medium">Limit Lama:</span>
                      <span className="font-bold text-slate-700 dark:text-slate-300">
                        {formatterIDR.format(item.currentLimit)}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-400 block font-medium">Aktual ({targetYm}):</span>
                      <span className="font-bold text-slate-800 dark:text-slate-100">
                        {formatterIDR.format(item.prevMonthActual)}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] text-indigo-600 dark:text-indigo-400 block font-extrabold">
                        Usulan Limit Baru:
                      </span>
                      <span className="font-extrabold text-indigo-700 dark:text-indigo-300">
                        {formatterIDR.format(item.proposedLimit)}
                      </span>
                    </div>
                  </div>

                  {/* Recommendation Reason */}
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                    {item.recommendationReason}
                  </p>

                  {/* Apply Button */}
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[10px] text-slate-400">
                      {isApplied ? '✓ Sudah diterapkan' : isNeedsAction ? 'Direkomendasikan' : 'Sudah optimal'}
                    </span>

                    {isNeedsAction && (
                      <button
                        onClick={() => handleApplySingle(item.category, item.proposedLimit)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                          isApplied
                            ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                            : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs'
                        }`}
                      >
                        {isApplied ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Telah Di-rebalance</span>
                          </>
                        ) : (
                          <>
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Terapkan ({formatterIDR.format(item.proposedLimit)})</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
