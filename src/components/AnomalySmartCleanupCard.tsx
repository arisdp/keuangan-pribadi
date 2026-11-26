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
} from 'lucide-react';
import { CategoryNode } from '../categoryHierarchy';
import { Account, CategoryBudget, Transaction } from '../types';
import {
  AnomalyDateRangeFilter,
  DetectedCategoryAnomaly,
  TriggerTransactionItem,
  detectCategorySpendingAnomalies,
  formatAnomalyMonthLabelID,
  getAvailableExpenseMonths,
  getMasterExpenseCategoryNames,
  getMonthDateRange,
  getQuarterDateRange,
} from '../utils/anomalyDetection';
import { toLocalYYYYMMDD } from '../utils/accountingEngine';
import { formatterIDR } from '../utils/formatters';
import { SmartCleanupTransactionDetailModal } from './SmartCleanupTransactionDetailModal';

interface BatchCategoryAssignment {
  transactionIds: string[];
  targetCategory: string;
}

type SmartCleanupPeriodMode = 'latest' | 'month' | 'quarter' | 'custom';

interface AnomalySmartCleanupCardProps {
  transactions: Transaction[];
  budgets: CategoryBudget[];
  accounts?: Account[];
  masterCategories?: CategoryNode[];
  externalMonthFilter?: { ym: string; nonce: number } | null;
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

  const [selectedTxMap, setSelectedTxMap] = useState<Record<string, Set<string>>>({});
  const [targetCategoryMap, setTargetCategoryMap] = useState<Record<string, string>>({});
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [sortByCategory, setSortByCategory] = useState<Record<string, SmartCleanupSortConfig>>({});
  const [detailTarget, setDetailTarget] = useState<{
    category: string;
    txId: string;
    recommendedTarget: string;
  } | null>(null);

  useEffect(() => {
    if (!externalMonthFilter?.ym) return;
    setFilterMode('month');
    setSelectedMonth(externalMonthFilter.ym);
  }, [externalMonthFilter]);

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
        </div>
      </div>

      {anomalies.length === 0 ? (
        <div className="p-5 rounded-xl border border-emerald-200 dark:border-emerald-800/70 bg-emerald-50/50 dark:bg-emerald-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div>
              <p className="font-bold text-emerald-900 dark:text-emerald-200">
                Pola Pengeluaran {periodLabel} Terkendali
              </p>
              <p className="text-emerald-800 dark:text-emerald-300 mt-0.5">
                Tidak ada kategori operasional yang mengalami lonjakan &gt; 30% dibandingkan{' '}
                {baselineLabel.toLowerCase()}.
              </p>
            </div>
          </div>

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
            const visibleTriggers = isExpanded ? sortedTriggers : sortedTriggers.slice(0, 4);

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

                {/* Trigger Transactions Table with Sortable Headers, Select-All & Click-for-Detail */}
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
