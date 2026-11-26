import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Info,
  Calendar,
  RotateCcw,
  Loader2,
  Wand2,
  X,
  LayoutGrid,
  List,
} from 'lucide-react';
import { CategoryNode } from '../categoryHierarchy';
import { Account, CategoryBudget, Transaction } from '../types';
import {
  AnomalyDateRangeFilter,
  Category30DaySparklineSummary,
  DetectedCategoryAnomaly,
  TriggerTransactionItem,
  buildCategory30DaySparkline,
  detectCategorySpendingAnomalies,
  formatAnomalyMonthLabelID,
  getAvailableExpenseMonths,
  getMasterExpenseCategoryNames,
  getMonthDateRange,
  getQuarterDateRange,
  resolveSparklineAnchorDate,
} from '../utils/anomalyDetection';
import { toLocalYYYYMMDD } from '../utils/accountingEngine';
import { formatterIDR } from '../utils/formatters';
import { CategorySpikeSparkline } from './CategorySpikeSparkline';
import { SmartCleanupTransactionDetailModal } from './SmartCleanupTransactionDetailModal';

interface BatchCategoryAssignment {
  transactionIds: string[];
  targetCategory: string;
}

interface AiCategorySuggestion {
  suggestedCategory: string;
  confidence: 'high' | 'medium' | 'low';
  rationale: string;
  recommendedTxIds: string[];
  generatedAt: string;
}

type SmartCleanupPeriodMode = 'latest' | 'month' | 'quarter' | 'custom';

interface AnomalySmartCleanupCardProps {
  transactions: Transaction[];
  budgets: CategoryBudget[];
  accounts?: Account[];
  masterCategories?: CategoryNode[];
  externalMonthFilter?: { ym: string; nonce: number } | null;
  externalCategoryFilter?: {
    category?: string;
    startDate?: string;
    endDate?: string;
    nonce: number;
  } | null;
  onReassignTransactionCategories?: (
    transactionIds: string[],
    targetCategory: string
  ) => void;
  onBatchReassignTransactionCategories?: (
    assignments: BatchCategoryAssignment[]
  ) => void;
}

type SmartCleanupSortKey = 'date' | 'description' | 'amount';

interface SmartCleanupSortConfig {
  key: SmartCleanupSortKey;
  direction: 'asc' | 'desc';
}

const DEFAULT_SORT_CONFIG: SmartCleanupSortConfig = {
  key: 'amount',
  direction: 'desc',
};

function sortAnomalyTriggers(
  triggers: TriggerTransactionItem[],
  sortConfig: SmartCleanupSortConfig,
  fallbackCategory: string
): TriggerTransactionItem[] {
  const dirFactor = sortConfig.direction === 'asc' ? 1 : -1;
  return [...triggers].sort((a, b) => {
    if (sortConfig.key === 'date') {
      const dateCmp = a.normalizedDate.localeCompare(b.normalizedDate);
      if (dateCmp !== 0) return dateCmp * dirFactor;
      return b.absAmount - a.absAmount;
    }

    if (sortConfig.key === 'description') {
      const descA = (a.tx.description?.trim() || fallbackCategory).toLowerCase();
      const descB = (b.tx.description?.trim() || fallbackCategory).toLowerCase();
      const descCmp = descA.localeCompare(descB, 'id', { sensitivity: 'base' });
      if (descCmp !== 0) return descCmp * dirFactor;
      return b.absAmount - a.absAmount;
    }

    const amountCmp = a.absAmount - b.absAmount;
    if (amountCmp !== 0) return amountCmp * dirFactor;
    return b.normalizedDate.localeCompare(a.normalizedDate);
  });
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
  externalMonthFilter = null,
  externalCategoryFilter = null,
  onReassignTransactionCategories,
  onBatchReassignTransactionCategories,
}) => {
  const availableMonths = useMemo(
    () => getAvailableExpenseMonths(transactions),
    [transactions]
  );

  const calendarYM = toLocalYYYYMMDD().slice(0, 7);
  const defaultLatestYM =
    availableMonths.length > 0
      ? availableMonths[availableMonths.length - 1]
      : calendarYM;
  const defaultYear = Number(defaultLatestYM.slice(0, 4)) || new Date().getFullYear();
  const defaultMonthNum = Number(defaultLatestYM.slice(5, 7)) || 1;
  const defaultQuarter = (Math.floor((defaultMonthNum - 1) / 3) + 1) as 1 | 2 | 3 | 4;

  const [filterMode, setFilterMode] = useState<SmartCleanupPeriodMode>('latest');
  const [selectedMonth, setSelectedMonth] = useState<string>(defaultLatestYM);
  const [selectedYear, setSelectedYear] = useState<number>(defaultYear);
  const [selectedQuarter, setSelectedQuarter] = useState<1 | 2 | 3 | 4>(defaultQuarter);
  const [customStartDate, setCustomStartDate] = useState<string>(
    getMonthDateRange(defaultLatestYM).startDate
  );
  const [customEndDate, setCustomEndDate] = useState<string>(
    getMonthDateRange(defaultLatestYM).endDate
  );
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string | null>(null);

  const [selectedTxMap, setSelectedTxMap] = useState<Record<string, Set<string>>>({});
  const [targetCategoryMap, setTargetCategoryMap] = useState<Record<string, string>>({});
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [sortByCategory, setSortByCategory] = useState<Record<string, SmartCleanupSortConfig>>({});
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [detailTarget, setDetailTarget] = useState<{
    category: string;
    txId: string;
    recommendedTarget: string;
  } | null>(null);
  const [aiSuggestionsByKey, setAiSuggestionsByKey] = useState<
    Record<string, AiCategorySuggestion>
  >({});
  const [aiLoadingAll, setAiLoadingAll] = useState<boolean>(false);
  const [aiLoadingCategoryKey, setAiLoadingCategoryKey] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  useEffect(() => {
    if (!externalMonthFilter?.ym) return;
    setFilterMode('month');
    setSelectedMonth(externalMonthFilter.ym);
  }, [externalMonthFilter]);

  useEffect(() => {
    if (!externalCategoryFilter) return;
    if (externalCategoryFilter.startDate && externalCategoryFilter.endDate) {
      setFilterMode('custom');
      setCustomStartDate(externalCategoryFilter.startDate);
      setCustomEndDate(externalCategoryFilter.endDate);
    }
    setActiveCategoryFilter(
      externalCategoryFilter.category ? externalCategoryFilter.category.trim() : null
    );
  }, [externalCategoryFilter]);

  const availableYears = useMemo(() => {
    const yearSet = new Set<number>([defaultYear]);
    availableMonths.forEach((ym) => {
      const y = Number(ym.slice(0, 4));
      if (Number.isFinite(y)) yearSet.add(y);
    });
    return Array.from(yearSet).sort((a, b) => b - a);
  }, [availableMonths, defaultYear]);

  const monthOptionsDesc = useMemo(() => {
    const set = new Set<string>(availableMonths);
    if (selectedMonth) set.add(selectedMonth);
    return Array.from(set).sort().reverse();
  }, [availableMonths, selectedMonth]);

  const isCustomRangeInvalid =
    filterMode === 'custom' &&
    Boolean(customStartDate && customEndDate && customStartDate > customEndDate);

  const activeDateRange = useMemo<AnomalyDateRangeFilter | null>(() => {
    if (filterMode === 'latest') return null;
    if (filterMode === 'month') {
      return getMonthDateRange(selectedMonth || defaultLatestYM);
    }
    if (filterMode === 'quarter') {
      return getQuarterDateRange(selectedYear, selectedQuarter);
    }
    if (customStartDate && customEndDate && customStartDate <= customEndDate) {
      return {
        startDate: customStartDate,
        endDate: customEndDate,
      };
    }
    return null;
  }, [
    filterMode,
    selectedMonth,
    defaultLatestYM,
    selectedYear,
    selectedQuarter,
    customStartDate,
    customEndDate,
  ]);

  const resetDateFilter = () => {
    setFilterMode('latest');
    setSelectedMonth(defaultLatestYM);
    setSelectedYear(defaultYear);
    setSelectedQuarter(defaultQuarter);
    const defaultRange = getMonthDateRange(defaultLatestYM);
    setCustomStartDate(defaultRange.startDate);
    setCustomEndDate(defaultRange.endDate);
    setActiveCategoryFilter(null);
  };

  const accountById = useMemo(() => {
    const map = new Map<string, Account>();
    accounts.forEach((acc) => map.set(acc.id, acc));
    return map;
  }, [accounts]);

  const masterExpenseCategories = useMemo(
    () => getMasterExpenseCategoryNames(budgets, masterCategories),
    [budgets, masterCategories]
  );

  const {
    referenceYM,
    periodLabel,
    baselineLabel,
    isMultiMonthNormalized,
    anomalies,
  } = useMemo(
    () =>
      detectCategorySpendingAnomalies({
        transactions,
        budgets,
        accounts,
        masterCategories,
        dateRange: activeDateRange,
      }),
    [transactions, budgets, accounts, masterCategories, activeDateRange]
  );

  const sparklinesByCategory = useMemo(() => {
    const anchorEndDate = resolveSparklineAnchorDate(referenceYM, activeDateRange);
    const map = new Map<string, Category30DaySparklineSummary>();
    anomalies.forEach((anom) => {
      map.set(
        anom.category,
        buildCategory30DaySparkline({
          transactions,
          category: anom.category,
          threeMonthAvgAmount: anom.threeMonthAvgAmount,
          anchorEndDate,
        })
      );
    });
    return map;
  }, [anomalies, transactions, referenceYM, activeDateRange]);

  const activePeriodKey = activeDateRange
    ? `${activeDateRange.startDate}..${activeDateRange.endDate}`
    : 'latest';
  const lastPeriodKeyRef = useRef<string>(activePeriodKey);

  // Initialize default checked trigger transactions & recommended targets when anomalies or period filter update
  useEffect(() => {
    const periodChanged = lastPeriodKeyRef.current !== activePeriodKey;
    lastPeriodKeyRef.current = activePeriodKey;

    if (periodChanged) {
      setExpandedCategories(new Set());
      setDetailTarget(null);
    }

    setSelectedTxMap((prev) => {
      const next: Record<string, Set<string>> = {};
      anomalies.forEach((anom) => {
        if (!periodChanged) {
          const existing = prev[anom.category];
          const validIds = new Set(anom.triggers.map((t) => t.tx.id));
          if (existing) {
            const kept = new Set(Array.from(existing).filter((id) => validIds.has(id)));
            if (kept.size > 0) {
              next[anom.category] = kept;
              return;
            }
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
        next[anom.category] =
          !periodChanged && prev[anom.category]
            ? prev[anom.category]
            : anom.recommendedTarget;
      });
      return next;
    });
  }, [anomalies, activePeriodKey]);

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

  const handleSortColumn = (category: string, key: SmartCleanupSortKey) => {
    setSortByCategory((prev) => {
      const current = prev[category] || DEFAULT_SORT_CONFIG;
      if (current.key === key) {
        return {
          ...prev,
          [category]: {
            key,
            direction: current.direction === 'asc' ? 'desc' : 'asc',
          },
        };
      }
      const initialDirection: 'asc' | 'desc' = key === 'description' ? 'asc' : 'desc';
      return {
        ...prev,
        [category]: {
          key,
          direction: initialDirection,
        },
      };
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

  const activeDetailItem = useMemo(() => {
    if (!detailTarget) return null;
    const matchingAnomaly = anomalies.find((a) => a.category === detailTarget.category);
    if (!matchingAnomaly) return null;
    const matchingTrigger = matchingAnomaly.triggers.find(
      (t) => t.tx.id === detailTarget.txId
    );
    if (!matchingTrigger) return null;
    return {
      anomaly: matchingAnomaly,
      item: matchingTrigger,
    };
  }, [detailTarget, anomalies]);

  const requestAiCategorySuggestions = async (
    targetAnomalies: DetectedCategoryAnomaly[],
    scope: 'all' | string
  ) => {
    if (targetAnomalies.length === 0) return;
    setAiError(null);
    if (scope === 'all') {
      setAiLoadingAll(true);
    } else {
      setAiLoadingCategoryKey(scope);
    }

    try {
      const budgetHints = budgets
        .filter((b) => b.type === 'expense' && b.limit > 0)
        .map((b) => {
          const matchingAnom = anomalies.find(
            (a) => a.category.toLowerCase() === b.category.trim().toLowerCase()
          );
          return {
            category: b.category.trim(),
            limit: b.limit,
            spent: matchingAnom ? matchingAnom.currentMonthAmount : 0,
          };
        });

      const response = await fetch('/api/smart-cleanup-suggest-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          anomalies: targetAnomalies.map((anom) => ({
            anomalyCategory: anom.category,
            increasePct: anom.increasePct,
            currentMonthAmount: anom.currentMonthAmount,
            threeMonthAvgAmount: anom.threeMonthAvgAmount,
            transactions: anom.triggers.map((t) => ({
              id: t.tx.id,
              description: t.tx.description?.trim() || anom.category,
              amount: t.absAmount,
              date: t.normalizedDate,
              accountName: t.accountName,
            })),
          })),
          availableCategories: masterExpenseCategories,
          budgetHints,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          data?.error || 'Gagal meminta saran kategori AI untuk Smart Cleanup.'
        );
      }

      const returnedSuggestions: Array<{
        anomalyCategory: string;
        suggestedCategory: string;
        confidence: 'high' | 'medium' | 'low';
        rationale: string;
        recommendedTxIds: string[];
      }> = Array.isArray(data?.suggestions) ? data.suggestions : [];

      const generatedAt = String(data?.generatedAt || '').trim();
      const nextSuggestionEntries: Record<string, AiCategorySuggestion> = {};
      const nextTargets: Record<string, string> = {};
      const nextSelections: Record<string, Set<string>> = {};

      targetAnomalies.forEach((anom) => {
        const match = returnedSuggestions.find(
          (s) =>
            String(s.anomalyCategory || '').trim().toLowerCase() ===
            anom.category.trim().toLowerCase()
        );
        if (!match || !match.suggestedCategory) return;

        nextSuggestionEntries[anom.anomalyKey] = {
          suggestedCategory: match.suggestedCategory,
          confidence: match.confidence || 'medium',
          rationale: match.rationale,
          recommendedTxIds: Array.isArray(match.recommendedTxIds)
            ? match.recommendedTxIds
            : [],
          generatedAt,
        };
        nextTargets[anom.category] = match.suggestedCategory;

        if (Array.isArray(match.recommendedTxIds) && match.recommendedTxIds.length > 0) {
          const validIds = new Set(anom.triggers.map((t) => t.tx.id));
          const aiIds = match.recommendedTxIds.filter((id) => validIds.has(id));
          if (aiIds.length > 0) {
            nextSelections[anom.category] = new Set(aiIds);
          }
        }
      });

      setAiSuggestionsByKey((prev) => ({ ...prev, ...nextSuggestionEntries }));
      if (Object.keys(nextTargets).length > 0) {
        setTargetCategoryMap((prev) => ({ ...prev, ...nextTargets }));
      }
      if (Object.keys(nextSelections).length > 0) {
        setSelectedTxMap((prev) => ({ ...prev, ...nextSelections }));
      }
    } catch (err: any) {
      setAiError(
        err?.message || 'Terjadi kendala saat meminta saran kategori AI.'
      );
    } finally {
      if (scope === 'all') {
        setAiLoadingAll(false);
      } else {
        setAiLoadingCategoryKey(null);
      }
    }
  };

  const displayedAnomalies = useMemo(() => {
    if (!activeCategoryFilter) return anomalies;
    const targetLower = activeCategoryFilter.trim().toLowerCase();
    return anomalies.filter((a) => a.category.toLowerCase() === targetLower);
  }, [anomalies, activeCategoryFilter]);

  const hasAnyAiSuggestions = anomalies.some((a) => Boolean(aiSuggestionsByKey[a.anomalyKey]));

  const renderSortIcon = (
    activeConfig: SmartCleanupSortConfig,
    columnKey: SmartCleanupSortKey
  ) => {
    if (activeConfig.key !== columnKey) {
      return <ArrowUpDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />;
    }
    return activeConfig.direction === 'asc' ? (
      <ArrowUp className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
    );
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
                · Periode {periodLabel} · {baselineLabel}
                {isMultiMonthNormalized ? ' (laju bulanan ternormalisasi)' : ''}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
              Filter periode waktu untuk menghitung ulang lonjakan kategori, klik baris untuk detail transaksi, atau centang transaksi pemicu untuk dipindahkan ke kategori budget yang tepat.
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

          {anomalies.length > 0 && (
            <button
              type="button"
              disabled={aiLoadingAll}
              onClick={() => requestAiCategorySuggestions(anomalies, 'all')}
              className="px-3.5 py-2 rounded-lg text-xs font-bold border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 disabled:opacity-60 transition cursor-pointer disabled:cursor-wait whitespace-nowrap shrink-0 inline-flex items-center gap-1.5"
            >
              {aiLoadingAll ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Menganalisis Deskripsi...</span>
                </>
              ) : (
                <>
                  <Wand2 className="h-3.5 w-3.5" />
                  <span>
                    {hasAnyAiSuggestions
                      ? 'Perbarui Suggested Category AI'
                      : 'Suggested Category AI'}
                  </span>
                </>
              )}
            </button>
          )}

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

      {aiError && (
        <div
          role="alert"
          className="p-3.5 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50/70 dark:bg-rose-950/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
        >
          <div className="flex items-start gap-2.5 text-rose-800 dark:text-rose-200">
            <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <span>{aiError}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {anomalies.length > 0 && (
              <button
                type="button"
                onClick={() => requestAiCategorySuggestions(anomalies, 'all')}
                className="px-3 py-1.5 rounded-lg font-bold bg-white dark:bg-slate-900 border border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition cursor-pointer whitespace-nowrap shrink-0"
              >
                Coba Lagi
              </button>
            )}
            <button
              type="button"
              onClick={() => setAiError(null)}
              aria-label="Tutup pesan error saran AI"
              className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-100 dark:hover:bg-rose-900/40 transition cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Period Date-Range Filter Toolbar */}
      <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 mr-1">
            <Calendar className="h-3.5 w-3.5 text-slate-500" />
            <span>Filter Periode:</span>
          </span>

          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-900 rounded-lg">
            {(
              [
                { id: 'latest', label: 'Bulan Terkini' },
                { id: 'month', label: 'Pilih Bulan' },
                { id: 'quarter', label: 'Kuartal' },
                { id: 'custom', label: 'Rentang Kustom' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setFilterMode(opt.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer whitespace-nowrap shrink-0 ${
                  filterMode === opt.id
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {filterMode === 'month' && (
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              aria-label="Pilih bulan analisis anomali"
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 cursor-pointer"
            >
              {monthOptionsDesc.map((ym) => (
                <option key={ym} value={ym}>
                  {formatAnomalyMonthLabelID(ym)}
                </option>
              ))}
            </select>
          )}

          {filterMode === 'quarter' && (
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                aria-label="Pilih tahun kuartal"
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 cursor-pointer font-mono tabular-nums"
              >
                {availableYears.map((yr) => (
                  <option key={yr} value={yr}>
                    {yr}
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-1 p-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg">
                {([1, 2, 3, 4] as const).map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setSelectedQuarter(q)}
                    className={`px-2.5 py-1 rounded-md text-xs font-mono font-bold transition cursor-pointer whitespace-nowrap shrink-0 ${
                      selectedQuarter === q
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                    }`}
                  >
                    Q{q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {filterMode === 'custom' && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                aria-label="Tanggal mulai filter Smart Cleanup"
                className="px-2.5 py-1.5 rounded-lg text-xs font-mono tabular-nums border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
              />
              <span className="text-slate-400 font-semibold">s/d</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                aria-label="Tanggal akhir filter Smart Cleanup"
                className="px-2.5 py-1.5 rounded-lg text-xs font-mono tabular-nums border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
              />
              {isCustomRangeInvalid && (
                <span className="text-rose-600 dark:text-rose-400 font-semibold">
                  Tanggal mulai harus &le; tanggal akhir
                </span>
              )}
            </div>
          )}

          {filterMode !== 'latest' && (
            <button
              type="button"
              onClick={resetDateFilter}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer whitespace-nowrap shrink-0 inline-flex items-center gap-1"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Reset</span>
            </button>
          )}

          {/* Global View Mode Toggle: Tabel vs Grid Ringkas */}
          <div
            role="group"
            aria-label="Mode tampilan daftar transaksi Smart Cleanup"
            className="flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-900 rounded-lg shrink-0"
          >
            <button
              type="button"
              onClick={() => setViewMode('table')}
              aria-pressed={viewMode === 'table'}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 ${
                viewMode === 'table'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <List className="h-3.5 w-3.5" />
              <span>Tabel</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              aria-pressed={viewMode === 'grid'}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 ${
                viewMode === 'grid'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span>Grid Ringkas</span>
            </button>
          </div>
        </div>
      </div>

      {/* Active Category Deep-Link Filter Indicator */}
      {activeCategoryFilter && (
        <div className="px-4 py-2.5 rounded-xl border border-blue-200 dark:border-blue-800/80 bg-blue-50/70 dark:bg-blue-950/30 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-1.5 text-blue-900 dark:text-blue-200">
            <span>Menampilkan anomali khusus kategori:</span>
            <strong className="font-extrabold">{activeCategoryFilter}</strong>
            {anomalies.length > displayedAnomalies.length && (
              <span className="text-blue-700 dark:text-blue-300">
                · ({anomalies.length - displayedAnomalies.length} kategori lain disembunyikan)
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setActiveCategoryFilter(null)}
            className="px-3 py-1 rounded-lg font-bold bg-white dark:bg-slate-900 border border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/40 transition cursor-pointer whitespace-nowrap shrink-0"
          >
            Tampilkan Semua Kategori
          </button>
        </div>
      )}

      {displayedAnomalies.length === 0 ? (
        <div className="p-5 rounded-xl border border-emerald-200 dark:border-emerald-800/70 bg-emerald-50/50 dark:bg-emerald-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div>
              <p className="font-bold text-emerald-900 dark:text-emerald-200">
                {activeCategoryFilter
                  ? `Tidak Ada Lonjakan > 30% untuk "${activeCategoryFilter}" pada Periode ${periodLabel}`
                  : `Pola Pengeluaran ${periodLabel} Terkendali`}
              </p>
              <p className="text-emerald-800 dark:text-emerald-300 mt-0.5">
                {activeCategoryFilter
                  ? `Kategori "${activeCategoryFilter}" tidak melampaui ambang batas +30% dibandingkan ${baselineLabel.toLowerCase()} pada rentang tanggal terpilih.`
                  : `Tidak ada kategori operasional yang mengalami lonjakan > 30% dibandingkan ${baselineLabel.toLowerCase()}.`}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {activeCategoryFilter && (
              <button
                type="button"
                onClick={() => setActiveCategoryFilter(null)}
                className="px-3.5 py-2 rounded-lg text-xs font-bold bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition cursor-pointer whitespace-nowrap shrink-0"
              >
                Tampilkan Semua Kategori
              </button>
            )}
            {filterMode !== 'latest' && (
              <button
                type="button"
                onClick={resetDateFilter}
                className="px-3.5 py-2 rounded-lg text-xs font-bold bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition cursor-pointer whitespace-nowrap shrink-0"
              >
                Kembali ke Bulan Terkini
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {displayedAnomalies.map((anom) => {
            const checkedIds = selectedTxMap[anom.category] || new Set<string>();
            const selectedCount = checkedIds.size;
            const allTriggerCount = anom.triggers.length;
            const allSelected =
              allTriggerCount > 0 &&
              anom.triggers.every((item) => checkedIds.has(item.tx.id));
            const someSelected = selectedCount > 0 && !allSelected;

            const activeSort = sortByCategory[anom.category] || DEFAULT_SORT_CONFIG;
            const sortedTriggers = sortAnomalyTriggers(
              anom.triggers,
              activeSort,
              anom.category
            );

            const selectedSubtotal = anom.triggers
              .filter((t) => checkedIds.has(t.tx.id))
              .reduce((s, t) => s + t.absAmount, 0);
            const targetCat = targetCategoryMap[anom.category] || anom.recommendedTarget;
            const isExpanded = expandedCategories.has(anom.category);
            const collapsedLimit = viewMode === 'grid' ? 8 : 4;
            const visibleTriggers = isExpanded
              ? sortedTriggers
              : sortedTriggers.slice(0, collapsedLimit);

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
                {/* Anomaly Metrics Header + 30-Day Spike Frequency Sparkline */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="min-w-0">
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
                        {isMultiMonthNormalized ? 'Laju/bln periode:' : 'Periode ini:'}{' '}
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

                  {sparklinesByCategory.get(anom.category) && (
                    <CategorySpikeSparkline
                      category={anom.category}
                      summary={sparklinesByCategory.get(anom.category)!}
                    />
                  )}
                </div>

                {/* Smart Cleanup Recommendation & AI Suggested Category Bar */}
                {(() => {
                  const aiSuggestion = aiSuggestionsByKey[anom.anomalyKey];
                  const isAnalyzingThis =
                    aiLoadingAll || aiLoadingCategoryKey === anom.anomalyKey;
                  const matchesAiChoice =
                    Boolean(aiSuggestion) &&
                    targetCat.toLowerCase() ===
                      aiSuggestion.suggestedCategory.toLowerCase();

                  return (
                    <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                      <div className="space-y-1 text-xs min-w-0">
                        <div className="font-bold text-slate-900 dark:text-slate-100 flex flex-wrap items-center gap-1.5">
                          <span>
                            {aiSuggestion
                              ? 'Suggested Category (AI)'
                              : 'Saran Smart Cleanup'}
                          </span>
                          <ArrowRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span
                            className={
                              aiSuggestion
                                ? 'text-indigo-700 dark:text-indigo-300'
                                : 'text-blue-700 dark:text-blue-300'
                            }
                          >
                            {aiSuggestion && !matchesAiChoice
                              ? `${aiSuggestion.suggestedCategory} (dipilih: ${targetCat})`
                              : `Pindahkan ke ${targetCat}`}
                          </span>
                          {aiSuggestion && (
                            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                              ·{' '}
                              {aiSuggestion.confidence === 'high'
                                ? 'Keyakinan Tinggi'
                                : aiSuggestion.confidence === 'low'
                                ? 'Keyakinan Rendah'
                                : 'Keyakinan Sedang'}
                              {aiSuggestion.generatedAt
                                ? ` · ${aiSuggestion.generatedAt}`
                                : ''}
                            </span>
                          )}
                          {aiSuggestion && !matchesAiChoice && (
                            <button
                              type="button"
                              onClick={() =>
                                setTargetCategoryMap((prev) => ({
                                  ...prev,
                                  [anom.category]: aiSuggestion.suggestedCategory,
                                }))
                              }
                              className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer whitespace-nowrap ml-1"
                            >
                              Gunakan Saran AI
                            </button>
                          )}
                        </div>
                        <p className="text-slate-500 dark:text-slate-400">
                          {aiSuggestion
                            ? aiSuggestion.rationale
                            : anom.recommendationReason}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          disabled={isAnalyzingThis}
                          onClick={() =>
                            requestAiCategorySuggestions([anom], anom.anomalyKey)
                          }
                          className="px-3 py-2 rounded-lg text-xs font-bold border border-indigo-200 dark:border-indigo-800 bg-indigo-50/80 dark:bg-indigo-950/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 disabled:opacity-60 transition cursor-pointer disabled:cursor-wait whitespace-nowrap shrink-0 inline-flex items-center gap-1.5"
                        >
                          {isAnalyzingThis ? (
                            <>
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              <span>Menganalisis...</span>
                            </>
                          ) : (
                            <>
                              <Wand2 className="h-3.5 w-3.5" />
                              <span>{aiSuggestion ? 'Analisis Ulang AI' : 'Saran AI'}</span>
                            </>
                          )}
                        </button>

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
                  );
                })()}

                {/* Trigger Transactions Table or Compact Grid */}
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 overflow-hidden">
                  {viewMode === 'table' ? (
                    <div className="overflow-x-auto">
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
                            <th
                              aria-sort={
                                activeSort.key === 'date'
                                  ? activeSort.direction === 'asc'
                                    ? 'ascending'
                                    : 'descending'
                                  : 'none'
                              }
                              className="py-2 px-3 whitespace-nowrap"
                            >
                              <button
                                type="button"
                                onClick={() => handleSortColumn(anom.category, 'date')}
                                className={`inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 transition cursor-pointer whitespace-nowrap shrink-0 ${
                                  activeSort.key === 'date'
                                    ? 'text-blue-700 dark:text-blue-300 font-extrabold'
                                    : ''
                                }`}
                              >
                                <span>Tanggal</span>
                                {renderSortIcon(activeSort, 'date')}
                              </button>
                            </th>
                            <th
                              aria-sort={
                                activeSort.key === 'description'
                                  ? activeSort.direction === 'asc'
                                    ? 'ascending'
                                    : 'descending'
                                  : 'none'
                              }
                              className="py-2 px-3"
                            >
                              <button
                                type="button"
                                onClick={() => handleSortColumn(anom.category, 'description')}
                                className={`inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 transition cursor-pointer whitespace-nowrap shrink-0 ${
                                  activeSort.key === 'description'
                                    ? 'text-blue-700 dark:text-blue-300 font-extrabold'
                                    : ''
                                }`}
                              >
                                <span>Deskripsi Transaksi Pemicu</span>
                                {renderSortIcon(activeSort, 'description')}
                              </button>
                            </th>
                            <th className="py-2 px-3 whitespace-nowrap">Akun</th>
                            <th
                              aria-sort={
                                activeSort.key === 'amount'
                                  ? activeSort.direction === 'asc'
                                    ? 'ascending'
                                    : 'descending'
                                  : 'none'
                              }
                              className="py-2 px-3 text-right whitespace-nowrap"
                            >
                              <button
                                type="button"
                                onClick={() => handleSortColumn(anom.category, 'amount')}
                                className={`inline-flex items-center justify-end gap-1 hover:text-slate-900 dark:hover:text-slate-100 transition cursor-pointer whitespace-nowrap shrink-0 ml-auto ${
                                  activeSort.key === 'amount'
                                    ? 'text-blue-700 dark:text-blue-300 font-extrabold'
                                    : ''
                                }`}
                              >
                                <span>Nominal</span>
                                {renderSortIcon(activeSort, 'amount')}
                              </button>
                            </th>
                            <th className="py-2 px-3 text-right whitespace-nowrap w-16">
                              Rincian
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                          {visibleTriggers.map((item) => {
                            const isChecked = checkedIds.has(item.tx.id);
                            return (
                              <tr
                                key={item.tx.id}
                                onClick={() =>
                                  setDetailTarget({
                                    category: anom.category,
                                    txId: item.tx.id,
                                    recommendedTarget: anom.recommendedTarget,
                                  })
                                }
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
                                <td className="py-2 px-3 font-medium text-slate-900 dark:text-slate-100 max-w-[260px] truncate">
                                  {item.tx.description?.trim() || anom.category}
                                </td>
                                <td className="py-2 px-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                                  {item.accountName}
                                </td>
                                <td className="py-2 px-3 text-right font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                                  {formatterIDR.format(item.absAmount)}
                                </td>
                                <td className="py-2 px-3 text-right whitespace-nowrap">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDetailTarget({
                                        category: anom.category,
                                        txId: item.tx.id,
                                        recommendedTarget: anom.recommendedTarget,
                                      });
                                    }}
                                    aria-label={`Lihat detail transaksi ${item.tx.description || anom.category}`}
                                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                                  >
                                    <Info className="h-3.5 w-3.5" />
                                    <span>Detail</span>
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div>
                      {/* Compact Grid Header Bar (Select-All + Sort Controls) */}
                      <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/60 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                        <label className="inline-flex items-center gap-2 font-bold text-slate-600 dark:text-slate-300 cursor-pointer">
                          <SelectAllCheckbox
                            allSelected={allSelected}
                            someSelected={someSelected}
                            onToggle={() => toggleSelectAllForCategory(anom)}
                            ariaLabel={`Pilih semua transaksi pada ${anom.category}`}
                          />
                          <span>Pilih Semua ({allTriggerCount})</span>
                        </label>

                        <div className="flex flex-wrap items-center gap-2 text-slate-500 dark:text-slate-400">
                          <span className="font-semibold">Urutkan:</span>
                          {(
                            [
                              { key: 'amount', label: 'Nominal' },
                              { key: 'date', label: 'Tanggal' },
                              { key: 'description', label: 'Deskripsi' },
                            ] as const
                          ).map((col) => (
                            <button
                              key={col.key}
                              type="button"
                              onClick={() => handleSortColumn(anom.category, col.key)}
                              className={`inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-white dark:hover:bg-slate-800 transition cursor-pointer whitespace-nowrap shrink-0 ${
                                activeSort.key === col.key
                                  ? 'text-blue-700 dark:text-blue-300 font-extrabold bg-white dark:bg-slate-800'
                                  : 'font-semibold hover:text-slate-900 dark:hover:text-slate-100'
                              }`}
                            >
                              <span>{col.label}</span>
                              {renderSortIcon(activeSort, col.key)}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Responsive Compact Grid Cards */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 p-3">
                        {visibleTriggers.map((item) => {
                          const isChecked = checkedIds.has(item.tx.id);
                          const displayDesc =
                            item.tx.description?.trim() || anom.category;
                          return (
                            <div
                              key={item.tx.id}
                              role="button"
                              tabIndex={0}
                              onClick={() =>
                                setDetailTarget({
                                  category: anom.category,
                                  txId: item.tx.id,
                                  recommendedTarget: anom.recommendedTarget,
                                })
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  setDetailTarget({
                                    category: anom.category,
                                    txId: item.tx.id,
                                    recommendedTarget: anom.recommendedTarget,
                                  });
                                }
                              }}
                              className={`p-3 rounded-xl border text-left transition-colors cursor-pointer flex flex-col justify-between gap-2 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-500 ${
                                isChecked
                                  ? 'border-blue-300 dark:border-blue-700 bg-blue-50/45 dark:bg-blue-950/25 hover:bg-blue-50/75 dark:hover:bg-blue-950/35'
                                  : 'border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/20 hover:bg-slate-100/70 dark:hover:bg-slate-800/50'
                              }`}
                            >
                              {/* Top Row: Checkbox + Nominal */}
                              <div className="flex items-center justify-between gap-2">
                                <div
                                  className="flex items-center"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() =>
                                      toggleTriggerTx(anom.category, item.tx.id)
                                    }
                                    aria-label={`Pilih transaksi ${displayDesc}`}
                                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                  />
                                </div>
                                <span className="text-xs font-mono tabular-nums font-extrabold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                                  {formatterIDR.format(item.absAmount)}
                                </span>
                              </div>

                              {/* Middle: Deskripsi */}
                              <p
                                title={displayDesc}
                                className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate"
                              >
                                {displayDesc}
                              </p>

                              {/* Bottom Row: Tanggal + Detail cue */}
                              <div className="flex items-center justify-between gap-2 text-[11px]">
                                <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                                  {item.normalizedDate}
                                </span>
                                <span className="font-semibold text-blue-600 dark:text-blue-400">
                                  Detail
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="px-3 py-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="text-slate-500 dark:text-slate-400">
                      Dipilih:{' '}
                      <strong className="font-mono tabular-nums text-slate-800 dark:text-slate-100">
                        {selectedCount} dari {allTriggerCount} transaksi (
                        {formatterIDR.format(selectedSubtotal)})
                      </strong>
                    </span>

                    {anom.triggers.length > collapsedLimit && (
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

      {/* Click-for-Detail Transaction Modal */}
      {activeDetailItem && (
        <SmartCleanupTransactionDetailModal
          isOpen={true}
          onClose={() => setDetailTarget(null)}
          item={activeDetailItem.item}
          anomalyCategory={activeDetailItem.anomaly.category}
          recommendedTarget={activeDetailItem.anomaly.recommendedTarget}
          selectedTargetCategory={
            targetCategoryMap[activeDetailItem.anomaly.category] ||
            activeDetailItem.anomaly.recommendedTarget
          }
          aiSuggestion={aiSuggestionsByKey[activeDetailItem.anomaly.anomalyKey]}
          account={accountById.get(activeDetailItem.item.tx.accountId)}
          isSelectedForCleanup={(
            selectedTxMap[activeDetailItem.anomaly.category] || new Set<string>()
          ).has(activeDetailItem.item.tx.id)}
          onToggleSelectForCleanup={() =>
            toggleTriggerTx(
              activeDetailItem.anomaly.category,
              activeDetailItem.item.tx.id
            )
          }
          onMoveSingleTransaction={
            onReassignTransactionCategories
              ? (txId, targetCategory) =>
                  onReassignTransactionCategories([txId], targetCategory)
              : undefined
          }
        />
      )}
    </section>
  );
};
