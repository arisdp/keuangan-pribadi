import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { CategoryNode } from '../categoryHierarchy';
import { Account, CategoryBudget, Transaction } from '../types';
import {
  DetectedCategoryAnomaly,
  detectCategorySpendingAnomalies,
  formatAnomalyMonthLabelID,
  getMasterExpenseCategoryNames,
} from '../utils/anomalyDetection';
import { formatterIDR } from '../utils/formatters';

interface BatchCategoryAssignment {
  transactionIds: string[];
  targetCategory: string;
}

interface AnomalySmartCleanupCardProps {
  transactions: Transaction[];
  budgets: CategoryBudget[];
  accounts?: Account[];
  masterCategories?: CategoryNode[];
  onReassignTransactionCategories?: (
    transactionIds: string[],
    targetCategory: string
  ) => void;
  onBatchReassignTransactionCategories?: (
    assignments: BatchCategoryAssignment[]
  ) => void;
}

const SelectAllCheckbox: React.FC<{
  allSelected: boolean;
  someSelected: boolean;
  onToggle: () => void;
  ariaLabel: string;
}> = ({ allSelected, someSelected, onToggle, ariaLabel }) => {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = someSelected && !allSelected;
    }
  }, [someSelected, allSelected]);

  return (
    <input
      ref={inputRef}
      type="checkbox"
      checked={allSelected}
      onChange={onToggle}
      aria-label={ariaLabel}
      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
    />
  );
};

export const AnomalySmartCleanupCard: React.FC<AnomalySmartCleanupCardProps> = ({
  transactions,
  budgets,
  accounts = [],
  masterCategories = [],
  onReassignTransactionCategories,
  onBatchReassignTransactionCategories,
}) => {
  const [selectedTxMap, setSelectedTxMap] = useState<Record<string, Set<string>>>({});
  const [targetCategoryMap, setTargetCategoryMap] = useState<Record<string, string>>({});
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const masterExpenseCategories = useMemo(
    () => getMasterExpenseCategoryNames(budgets, masterCategories),
    [budgets, masterCategories]
  );

  const { referenceYM, anomalies } = useMemo(
    () =>
      detectCategorySpendingAnomalies({
        transactions,
        budgets,
        accounts,
        masterCategories,
      }),
    [transactions, budgets, accounts, masterCategories]
  );

  // Initialize default checked trigger transactions & recommended targets when anomalies update
  useEffect(() => {
    setSelectedTxMap((prev) => {
      const next: Record<string, Set<string>> = {};
      anomalies.forEach((anom) => {
        const existing = prev[anom.category];
        const validIds = new Set(anom.triggers.map((t) => t.tx.id));
        if (existing) {
          const kept = new Set(Array.from(existing).filter((id) => validIds.has(id)));
          if (kept.size > 0) {
            next[anom.category] = kept;
            return;
          }
        }
        next[anom.category] = new Set(
          anom.triggers.filter((t) => t.isDefaultTrigger).map((t) => t.tx.id)
        );
      });
      return next;
    });

    setTargetCategoryMap((prev) => {
      const next: Record<string, string> = {};
      anomalies.forEach((anom) => {
        next[anom.category] = prev[anom.category] || anom.recommendedTarget;
      });
      return next;
    });
  }, [anomalies]);

  const toggleTriggerTx = (category: string, txId: string) => {
    setSelectedTxMap((prev) => {
      const current = new Set(prev[category] || []);
      if (current.has(txId)) {
        current.delete(txId);
      } else {
        current.add(txId);
      }
      return { ...prev, [category]: current };
    });
  };

  const toggleSelectAllForCategory = (anom: DetectedCategoryAnomaly) => {
    setSelectedTxMap((prev) => {
      const current = prev[anom.category] || new Set<string>();
      const allIds = anom.triggers.map((t) => t.tx.id);
      const isAllChecked = allIds.length > 0 && allIds.every((id) => current.has(id));
      return {
        ...prev,
        [anom.category]: isAllChecked ? new Set<string>() : new Set<string>(allIds),
      };
    });
  };

  const toggleExpandCategory = (category: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const handleApplyCleanup = (anom: DetectedCategoryAnomaly) => {
    if (!onReassignTransactionCategories) return;
    const selectedIds = Array.from(selectedTxMap[anom.category] || []);
    const targetCategory = targetCategoryMap[anom.category] || anom.recommendedTarget;
    if (selectedIds.length === 0 || !targetCategory) return;
    onReassignTransactionCategories(selectedIds, targetCategory);
  };

  const { totalSelectedCount, totalSelectedAmount, pendingAssignments } = useMemo(() => {
    let count = 0;
    let amount = 0;
    const assignments: BatchCategoryAssignment[] = [];

    anomalies.forEach((anom) => {
      const checkedSet = selectedTxMap[anom.category];
      if (!checkedSet || checkedSet.size === 0) return;

      const selectedIds: string[] = [];
      anom.triggers.forEach((item) => {
        if (checkedSet.has(item.tx.id)) {
          selectedIds.push(item.tx.id);
          count += 1;
          amount += item.absAmount;
        }
      });

      const targetCategory = targetCategoryMap[anom.category] || anom.recommendedTarget;
      if (selectedIds.length > 0 && targetCategory) {
        assignments.push({ transactionIds: selectedIds, targetCategory });
      }
    });

    return {
      totalSelectedCount: count,
      totalSelectedAmount: Math.round(amount),
      pendingAssignments: assignments,
    };
  }, [anomalies, selectedTxMap, targetCategoryMap]);

  const handleApplyAllSmartCleanup = () => {
    if (pendingAssignments.length === 0) return;
    if (onBatchReassignTransactionCategories) {
      onBatchReassignTransactionCategories(pendingAssignments);
      return;
    }
    if (onReassignTransactionCategories) {
      pendingAssignments.forEach((item) => {
        onReassignTransactionCategories(item.transactionIds, item.targetCategory);
      });
    }
  };

  return (
    <section
      id="anomaly-smart-cleanup-section"
      className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-5"
    >
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-amber-600 text-white shrink-0">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                Detektor Anomali Pengeluaran (&gt; +30%) &amp; Smart Cleanup
              </h3>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                · Periode {formatAnomalyMonthLabelID(referenceYM)} vs Rata-Rata 3 Bulan
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
              Centang transaksi pemicu pada satu atau beberapa kategori anomali, lalu pindahkan ke kategori budget yang lebih tepat sekaligus atau per kategori.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <span
            className={`text-xs font-bold whitespace-nowrap shrink-0 ${
              anomalies.length > 0
                ? 'text-amber-700 dark:text-amber-300'
                : 'text-emerald-700 dark:text-emerald-400'
            }`}
          >
            {anomalies.length > 0
              ? `${anomalies.length} Kategori Melonjak`
              : 'Tidak Ada Anomali'}
          </span>

          {anomalies.length > 0 &&
            (onBatchReassignTransactionCategories || onReassignTransactionCategories) && (
              <button
                type="button"
                disabled={totalSelectedCount === 0}
                onClick={handleApplyAllSmartCleanup}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 text-white transition cursor-pointer disabled:cursor-not-allowed whitespace-nowrap shrink-0"
              >
                Terapkan Semua Smart Cleanup ({totalSelectedCount} ·{' '}
                {formatterIDR.format(totalSelectedAmount)})
              </button>
            )}
        </div>
      </div>

      {anomalies.length === 0 ? (
        <div className="p-5 rounded-xl border border-emerald-200 dark:border-emerald-800/70 bg-emerald-50/50 dark:bg-emerald-950/20 flex items-center gap-3 text-xs">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <div>
            <p className="font-bold text-emerald-900 dark:text-emerald-200">
              Pola Pengeluaran {formatAnomalyMonthLabelID(referenceYM)} Terkendali
            </p>
            <p className="text-emerald-800 dark:text-emerald-300 mt-0.5">
              Tidak ada kategori operasional yang mengalami lonjakan &gt; 30% dibandingkan rata-rata 3 bulan sebelumnya.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {anomalies.map((anom) => {
            const checkedIds = selectedTxMap[anom.category] || new Set<string>();
            const selectedCount = checkedIds.size;
            const allTriggerCount = anom.triggers.length;
            const allSelected =
              allTriggerCount > 0 &&
              anom.triggers.every((item) => checkedIds.has(item.tx.id));
            const someSelected = selectedCount > 0 && !allSelected;

            const selectedSubtotal = anom.triggers
              .filter((t) => checkedIds.has(t.tx.id))
              .reduce((s, t) => s + t.absAmount, 0);
            const targetCat = targetCategoryMap[anom.category] || anom.recommendedTarget;
            const isExpanded = expandedCategories.has(anom.category);
            const visibleTriggers = isExpanded ? anom.triggers : anom.triggers.slice(0, 4);

            const targetOptions = masterExpenseCategories.filter(
              (c) => c.toLowerCase() !== anom.category.toLowerCase()
            );
            if (
              targetCat &&
              !targetOptions.some((c) => c.toLowerCase() === targetCat.toLowerCase())
            ) {
              targetOptions.unshift(targetCat);
            }

            const isSevere = anom.increasePct >= 60;

            return (
              <div
                key={anom.anomalyKey}
                className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/20 space-y-4"
              >
                {/* Anomaly Metrics Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <AlertTriangle
                        className={`h-4 w-4 shrink-0 ${
                          isSevere
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-amber-600 dark:text-amber-400'
                        }`}
                      />
                      <h4 className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
                        {anom.category}
                      </h4>
                      <span
                        className={`text-xs font-mono tabular-nums font-extrabold ${
                          isSevere
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-amber-700 dark:text-amber-300'
                        }`}
                      >
                        +{anom.increasePct}% vs rata-rata 3 bln
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-1">
                      <span>
                        Bulan ini:{' '}
                        <strong className="font-mono tabular-nums text-slate-800 dark:text-slate-100">
                          {formatterIDR.format(anom.currentMonthAmount)}
                        </strong>
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        Rata-rata 3 bln:{' '}
                        <strong className="font-mono tabular-nums text-slate-700 dark:text-slate-200">
                          {formatterIDR.format(anom.threeMonthAvgAmount)}
                        </strong>
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        Selisih lonjakan:{' '}
                        <strong className="font-mono tabular-nums text-rose-600 dark:text-rose-400">
                          +{formatterIDR.format(anom.excessAmount)}
                        </strong>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Smart Cleanup Recommendation & Action Bar */}
                <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="space-y-1 text-xs">
                    <div className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                      <span>Saran Smart Cleanup</span>
                      <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                      <span className="text-blue-700 dark:text-blue-300">
                        Pindahkan ke {targetCat}
                      </span>
                    </div>
                    <p className="text-slate-500 dark:text-slate-400">
                      {anom.recommendationReason}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <select
                      value={targetCat}
                      onChange={(e) =>
                        setTargetCategoryMap((prev) => ({
                          ...prev,
                          [anom.category]: e.target.value,
                        }))
                      }
                      aria-label={`Pilih kategori budget tujuan untuk ${anom.category}`}
                      className="px-3 py-2 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
                    >
                      {targetOptions.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>

                    {onReassignTransactionCategories && (
                      <button
                        type="button"
                        disabled={selectedCount === 0}
                        onClick={() => handleApplyCleanup(anom)}
                        className="px-3.5 py-2 rounded-lg text-xs font-bold bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 dark:hover:bg-slate-600 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 text-white transition cursor-pointer disabled:cursor-not-allowed whitespace-nowrap shrink-0"
                      >
                        Terapkan Kategori Ini ({selectedCount})
                      </button>
                    )}
                  </div>
                </div>

                {/* Trigger Transactions Table with Select-All Header Checkbox */}
                <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/60 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                        <th className="py-2 px-3 w-10">
                          <SelectAllCheckbox
                            allSelected={allSelected}
                            someSelected={someSelected}
                            onToggle={() => toggleSelectAllForCategory(anom)}
                            ariaLabel={`Pilih semua transaksi pada ${anom.category}`}
                          />
                        </th>
                        <th className="py-2 px-3 whitespace-nowrap">Tanggal</th>
                        <th className="py-2 px-3">Deskripsi Transaksi Pemicu</th>
                        <th className="py-2 px-3 whitespace-nowrap">Akun</th>
                        <th className="py-2 px-3 text-right whitespace-nowrap">Nominal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                      {visibleTriggers.map((item) => {
                        const isChecked = checkedIds.has(item.tx.id);
                        return (
                          <tr
                            key={item.tx.id}
                            onClick={() => toggleTriggerTx(anom.category, item.tx.id)}
                            className={`cursor-pointer transition-colors ${
                              isChecked
                                ? 'bg-blue-50/40 dark:bg-blue-950/20 hover:bg-blue-50/70 dark:hover:bg-blue-950/30'
                                : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                            }`}
                          >
                            <td
                              className="py-2 px-3"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleTriggerTx(anom.category, item.tx.id)}
                                aria-label={`Pilih transaksi ${item.tx.description || anom.category}`}
                                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                              />
                            </td>
                            <td className="py-2 px-3 font-mono tabular-nums text-slate-600 dark:text-slate-300 whitespace-nowrap">
                              {item.normalizedDate}
                            </td>
                            <td className="py-2 px-3 font-medium text-slate-900 dark:text-slate-100 max-w-[280px] truncate">
                              {item.tx.description?.trim() || anom.category}
                            </td>
                            <td className="py-2 px-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                              {item.accountName}
                            </td>
                            <td className="py-2 px-3 text-right font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                              {formatterIDR.format(item.absAmount)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  <div className="px-3 py-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="text-slate-500 dark:text-slate-400">
                      Dipilih:{' '}
                      <strong className="font-mono tabular-nums text-slate-800 dark:text-slate-100">
                        {selectedCount} dari {allTriggerCount} transaksi (
                        {formatterIDR.format(selectedSubtotal)})
                      </strong>
                    </span>

                    {anom.triggers.length > 4 && (
                      <button
                        type="button"
                        onClick={() => toggleExpandCategory(anom.category)}
                        className="text-blue-600 dark:text-blue-400 font-semibold hover:underline flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                      >
                        {isExpanded ? (
                          <>
                            <span>Ringkas</span>
                            <ChevronUp className="h-3.5 w-3.5" />
                          </>
                        ) : (
                          <>
                            <span>Lihat Semua ({anom.triggers.length})</span>
                            <ChevronDown className="h-3.5 w-3.5" />
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
