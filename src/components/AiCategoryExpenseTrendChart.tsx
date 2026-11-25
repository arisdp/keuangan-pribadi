import React, { useEffect, useMemo, useState } from 'react';
import {
  ComposedChart,
  Bar,
  Cell,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  BarChart3,
  Layers,
  TrendingDown,
  Sparkles,
  X,
  ChevronDown,
  ChevronUp,
  History,
  PieChart as PieChartIcon,
} from 'lucide-react';
import { CategoryNode } from '../categoryHierarchy';
import {
  AIAnalysisResult,
  AIMonthlyComparisonResult,
  Account,
  CategoryBudget,
  Transaction,
} from '../types';
import {
  isOperatingExpense,
  normalizeLedgerDateYYYYMMDD,
  toLocalYYYYMMDD,
} from '../utils/accountingEngine';
import { formatterIDR } from '../utils/formatters';
import { CategorySubCategoryModal } from './CategorySubCategoryModal';

interface TrendAnalysisSnapshot {
  totalThreeMonthAvg?: number;
  topSavingsRecommendations?: Array<{
    category: string;
    potentialSavingsAmount: number;
  }>;
  categoryAnalyses?: Array<{
    category: string;
    budgetLimit: number;
    currentMonthAmount: number;
    threeMonthAvgAmount: number;
  }>;
}

interface AiCategoryExpenseTrendChartProps {
  transactions: Transaction[];
  budgets: CategoryBudget[];
  accounts?: Account[];
  masterCategories?: CategoryNode[];
  aiAnalysisResult: AIAnalysisResult | null;
  trendAnalysisResult: TrendAnalysisSnapshot | null;
  compareResult?: AIMonthlyComparisonResult | null;
}

interface SelectedBarFilter {
  ym: string;
  monthLabel: string;
  category: string;
}

interface NormalizedExpenseItem {
  tx: Transaction;
  normalizedDate: string;
  ym: string;
  rawCategory: string;
  absAmount: number;
}

const CATEGORY_PALETTE = [
  '#2563eb', // Blue
  '#4f46e5', // Indigo
  '#0d9488', // Teal
  '#d97706', // Amber
  '#dc2626', // Crimson
  '#64748b', // Slate (Lainnya)
];

const MONTHS_SHORT_ID = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
];

const DEFAULT_VISIBLE_ROWS = 10;

function formatMonthLabel(ym: string): string {
  const [yStr, mStr] = ym.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return ym;
  return `${MONTHS_SHORT_ID[m - 1]} ${String(y).slice(-2)}`;
}

function formatDisplayDateID(ymd: string): string {
  const parts = ymd.split('-');
  if (parts.length !== 3) return ymd;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d) || m < 1 || m > 12) {
    return ymd;
  }
  return `${String(d).padStart(2, '0')} ${MONTHS_SHORT_ID[m - 1]} ${y}`;
}

function formatCompactIDR(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}M`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}Jt`;
  if (abs >= 1_000) return `${Math.round(value / 1_000)}rb`;
  return String(Math.round(value));
}

function shiftMonthYYYYMM(baseYM: string, deltaMonths: number): string {
  const [yStr, mStr] = baseYM.split('-');
  const baseDate = new Date(Number(yStr), Number(mStr) - 1 + deltaMonths, 1);
  return `${baseDate.getFullYear()}-${String(baseDate.getMonth() + 1).padStart(2, '0')}`;
}

export const AiCategoryExpenseTrendChart: React.FC<AiCategoryExpenseTrendChartProps> = ({
  transactions,
  budgets,
  accounts = [],
  masterCategories = [],
  aiAnalysisResult,
  trendAnalysisResult,
}) => {
  const [chartMode, setChartMode] = useState<'bar' | 'area'>('bar');
  const [periodWindow, setPeriodWindow] = useState<'3m' | '6m' | '12m'>('6m');
  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(new Set());
  const [selectedBarFilter, setSelectedBarFilter] = useState<SelectedBarFilter | null>(null);
  const [showAllRows, setShowAllRows] = useState(false);
  const [showYoYTrend, setShowYoYTrend] = useState(false);
  const [legendModalCategory, setLegendModalCategory] = useState<string | null>(null);

  const monthCount = periodWindow === '3m' ? 3 : periodWindow === '12m' ? 12 : 6;

  const accountNameMap = useMemo(() => {
    const map = new Map<string, string>();
    accounts.forEach((acc) => {
      map.set(acc.id, acc.name);
    });
    return map;
  }, [accounts]);

  const {
    chartRows,
    timelineMonths,
    timelineMonthSet,
    primaryCategories,
    categorySeriesKeys,
    hasExpenses,
    hasAnyYoYHistory,
    avgMonthlyExpense,
    aiMonthlyTarget,
    potentialMonthlySavings,
    targetSourceLabel,
    topCategory,
    normalizedExpenses,
  } = useMemo(() => {
    const expenseTxs = transactions.filter((tx) => isOperatingExpense(tx) && tx.amount > 0);
    if (expenseTxs.length === 0) {
      return {
        chartRows: [] as Record<string, any>[],
        timelineMonths: [] as string[],
        timelineMonthSet: new Set<string>(),
        primaryCategories: [] as string[],
        categorySeriesKeys: [] as string[],
        hasExpenses: false,
        hasAnyYoYHistory: false,
        avgMonthlyExpense: 0,
        aiMonthlyTarget: 0,
        potentialMonthlySavings: 0,
        targetSourceLabel: 'Belum ada transaksi pengeluaran',
        topCategory: null as { name: string; total: number; sharePct: number } | null,
        normalizedExpenses: [] as NormalizedExpenseItem[],
      };
    }

    const monthlyByCat = new Map<string, Map<string, number>>();
    const parsedItems: NormalizedExpenseItem[] = [];
    let latestYM = toLocalYYYYMMDD().slice(0, 7);

    expenseTxs.forEach((tx) => {
      const normalized = normalizeLedgerDateYYYYMMDD(tx.date);
      if (!normalized) return;
      const ym = normalized.slice(0, 7);
      if (ym > latestYM) latestYM = ym;

      const rawCat = (tx.category || '').trim();
      const cat = rawCat && rawCat !== '-' ? rawCat : 'Tanpa Kategori';
      const absAmount = Math.abs(tx.amount || 0);

      parsedItems.push({
        tx,
        normalizedDate: normalized,
        ym,
        rawCategory: cat,
        absAmount,
      });

      let catMap = monthlyByCat.get(ym);
      if (!catMap) {
        catMap = new Map<string, number>();
        monthlyByCat.set(ym, catMap);
      }
      catMap.set(cat, (catMap.get(cat) || 0) + absAmount);
    });

    const monthsList: string[] = [];
    for (let i = monthCount - 1; i >= 0; i--) {
      monthsList.push(shiftMonthYYYYMM(latestYM, -i));
    }
    const monthsSet = new Set(monthsList);

    const totalByCategory = new Map<string, number>();
    let windowGrandTotal = 0;

    monthsList.forEach((ym) => {
      const catMap = monthlyByCat.get(ym);
      if (!catMap) return;
      catMap.forEach((amt, cat) => {
        totalByCategory.set(cat, (totalByCategory.get(cat) || 0) + amt);
        windowGrandTotal += amt;
      });
    });

    const sortedCategories = Array.from(totalByCategory.entries()).sort((a, b) => b[1] - a[1]);
    const topFiveCats = sortedCategories.slice(0, 5).map(([cat]) => cat);
    const hasOthers = sortedCategories.length > 5;
    const keys = hasOthers ? [...topFiveCats, 'Lainnya'] : topFiveCats;

    const monthsWithDataCount = Math.max(
      1,
      monthsList.filter((ym) => {
        const catMap = monthlyByCat.get(ym);
        return catMap && catMap.size > 0;
      }).length
    );
    const avgExpense = Math.round(windowGrandTotal / monthsWithDataCount);

    // Derive AI-recommended monthly target cap
    const expenseBudgets = budgets.filter((b) => b.type === 'expense' && b.limit > 0);
    const totalConfiguredBudget = expenseBudgets.reduce((s, b) => s + b.limit, 0);

    let derivedTarget = 0;
    let sourceLabel = 'Target Efisiensi 10% vs Rata-Rata Pengeluaran';

    if (aiAnalysisResult?.budgetSuggestions && aiAnalysisResult.budgetSuggestions.length > 0) {
      const suggestedMap = new Map<string, number>();
      let currentSumInSuggestions = 0;
      let suggestedSum = 0;

      aiAnalysisResult.budgetSuggestions.forEach((sug) => {
        const key = sug.category.trim().toLowerCase();
        suggestedMap.set(key, Math.max(0, sug.recommendedBudget || 0));
        currentSumInSuggestions += Math.max(0, sug.currentBudget || 0);
        suggestedSum += Math.max(0, sug.recommendedBudget || 0);
      });

      if (totalConfiguredBudget > 0) {
        let mergedBudgetTarget = 0;
        expenseBudgets.forEach((b) => {
          const override = suggestedMap.get(b.category.trim().toLowerCase());
          mergedBudgetTarget += override !== undefined ? override : b.limit;
        });
        aiAnalysisResult.budgetSuggestions.forEach((sug) => {
          const existsInBudgets = expenseBudgets.some(
            (b) => b.category.trim().toLowerCase() === sug.category.trim().toLowerCase()
          );
          if (!existsInBudgets) {
            mergedBudgetTarget += Math.max(0, sug.recommendedBudget || 0);
          }
        });
        derivedTarget = Math.round(mergedBudgetTarget);
      } else if (avgExpense > 0 && currentSumInSuggestions > 0) {
        const netSavingsDelta = Math.max(0, currentSumInSuggestions - suggestedSum);
        derivedTarget = Math.max(0, Math.round(avgExpense - netSavingsDelta));
      } else {
        derivedTarget = Math.round(suggestedSum);
      }
      sourceLabel = 'Target Penyesuaian Anggaran Gemini AI';
    } else if (
      trendAnalysisResult?.topSavingsRecommendations &&
      trendAnalysisResult.topSavingsRecommendations.length > 0
    ) {
      const aiSavingsTotal = trendAnalysisResult.topSavingsRecommendations.reduce(
        (s, r) => s + Math.max(0, r.potentialSavingsAmount || 0),
        0
      );
      const baseReference =
        (trendAnalysisResult.totalThreeMonthAvg || 0) > 0
          ? trendAnalysisResult.totalThreeMonthAvg!
          : avgExpense;
      derivedTarget = Math.max(0, Math.round(baseReference - aiSavingsTotal));
      sourceLabel = 'Target Hemat dari Analisis Tren 3 Bulan AI';
    } else if (totalConfiguredBudget > 0) {
      derivedTarget = Math.round(totalConfiguredBudget * 0.9);
      sourceLabel = 'Baseline Target Hemat 10% di Bawah Pagu Anggaran';
    } else {
      derivedTarget = Math.round(avgExpense * 0.9);
    }

    const topFiveSet = new Set(topFiveCats);
    let anyYoY = false;

    const rows = monthsList.map((ym) => {
      const catMap = monthlyByCat.get(ym);
      const yoyYm = shiftMonthYYYYMM(ym, -12);
      const prevCatMap = monthlyByCat.get(yoyYm);

      const row: Record<string, any> = {
        ym,
        yoyYm,
        monthLabel: formatMonthLabel(ym),
        targetHematAI: derivedTarget,
      };
      let totalMonthExpense = 0;
      let totalVisibleExpense = 0;

      topFiveCats.forEach((cat) => {
        const val = catMap?.get(cat) || 0;
        row[cat] = Math.round(val);
        totalMonthExpense += val;
        if (!hiddenCategories.has(cat)) {
          totalVisibleExpense += val;
        }
      });

      if (hasOthers && catMap) {
        let otherSum = 0;
        catMap.forEach((val, cat) => {
          if (!topFiveCats.includes(cat)) {
            otherSum += val;
          }
        });
        row['Lainnya'] = Math.round(otherSum);
        totalMonthExpense += otherSum;
        if (!hiddenCategories.has('Lainnya')) {
          totalVisibleExpense += otherSum;
        }
      } else if (hasOthers) {
        row['Lainnya'] = 0;
      }

      row.totalAktual = Math.round(totalMonthExpense);
      row.totalVisibleAktual = Math.round(totalVisibleExpense);

      if (prevCatMap && prevCatMap.size > 0) {
        anyYoY = true;
        let yoyVisibleSum = 0;
        prevCatMap.forEach((val, cat) => {
          const bucketKey = topFiveSet.has(cat) ? cat : 'Lainnya';
          if (!hiddenCategories.has(bucketKey)) {
            yoyVisibleSum += val;
          }
        });
        row.yoyActual = Math.round(yoyVisibleSum);
      } else {
        row.yoyActual = null;
      }

      return row;
    });

    const topEntry = sortedCategories[0];
    const computedTopCategory =
      topEntry && windowGrandTotal > 0
        ? {
            name: topEntry[0],
            total: Math.round(topEntry[1]),
            sharePct: Math.round((topEntry[1] / windowGrandTotal) * 100),
          }
        : null;

    return {
      chartRows: rows,
      timelineMonths: monthsList,
      timelineMonthSet: monthsSet,
      primaryCategories: topFiveCats,
      categorySeriesKeys: keys,
      hasExpenses: windowGrandTotal > 0,
      hasAnyYoYHistory: anyYoY,
      avgMonthlyExpense: avgExpense,
      aiMonthlyTarget: derivedTarget,
      potentialMonthlySavings: Math.max(0, avgExpense - derivedTarget),
      targetSourceLabel: sourceLabel,
      topCategory: computedTopCategory,
      normalizedExpenses: parsedItems,
    };
  }, [
    transactions,
    budgets,
    aiAnalysisResult,
    trendAnalysisResult,
    monthCount,
    hiddenCategories,
  ]);

  // Clear stale bar filter when period window or hidden categories invalidate it
  useEffect(() => {
    if (!selectedBarFilter) return;
    const isMonthValid = timelineMonthSet.has(selectedBarFilter.ym);
    const isCatValid =
      categorySeriesKeys.includes(selectedBarFilter.category) &&
      !hiddenCategories.has(selectedBarFilter.category);
    if (!isMonthValid || !isCatValid) {
      setSelectedBarFilter(null);
      setShowAllRows(false);
    }
  }, [selectedBarFilter, timelineMonthSet, categorySeriesKeys, hiddenCategories]);

  useEffect(() => {
    if (!hasExpenses && legendModalCategory) {
      setLegendModalCategory(null);
    }
  }, [hasExpenses, legendModalCategory]);

  const toggleCategoryVisibility = (cat: string) => {
    setHiddenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
      } else if (next.size < categorySeriesKeys.length - 1) {
        next.add(cat);
      }
      return next;
    });
  };

  const handleBarSegmentClick = (category: string, barItem: any, index: number) => {
    const row = barItem?.payload ?? chartRows[index];
    if (!row || !row.ym) return;
    const value = Number(row[category] || 0);
    if (value <= 0) return;

    setSelectedBarFilter((prev) => {
      if (prev && prev.ym === row.ym && prev.category === category) {
        return null;
      }
      return {
        ym: String(row.ym),
        monthLabel: String(row.monthLabel || formatMonthLabel(String(row.ym))),
        category,
      };
    });
    setShowAllRows(false);
  };

  const handleClearBarFilter = () => {
    setSelectedBarFilter(null);
    setShowAllRows(false);
  };

  const visibleSeriesKeys = categorySeriesKeys.filter((k) => !hiddenCategories.has(k));

  const primarySet = useMemo(() => new Set(primaryCategories), [primaryCategories]);

  // Detailed transactions list filtered either by active window (default) or clicked bar segment
  const { filteredItems, filteredTotalAmount } = useMemo(() => {
    const items = normalizedExpenses.filter((item) => {
      if (!timelineMonthSet.has(item.ym)) return false;

      const bucketKey = primarySet.has(item.rawCategory) ? item.rawCategory : 'Lainnya';
      if (hiddenCategories.has(bucketKey)) return false;

      if (selectedBarFilter) {
        if (item.ym !== selectedBarFilter.ym) return false;
        if (selectedBarFilter.category === 'Lainnya') {
          if (primarySet.has(item.rawCategory)) return false;
        } else {
          if (item.rawCategory !== selectedBarFilter.category) return false;
        }
      }

      return true;
    });

    items.sort((a, b) => {
      if (b.normalizedDate !== a.normalizedDate) {
        return b.normalizedDate.localeCompare(a.normalizedDate);
      }
      return b.absAmount - a.absAmount;
    });

    const total = items.reduce((sum, item) => sum + item.absAmount, 0);
    return { filteredItems: items, filteredTotalAmount: total };
  }, [normalizedExpenses, timelineMonthSet, primarySet, hiddenCategories, selectedBarFilter]);

  const displayedItems = showAllRows
    ? filteredItems
    : filteredItems.slice(0, DEFAULT_VISIBLE_ROWS);

  const windowRangeLabel =
    timelineMonths.length > 0
      ? `${formatMonthLabel(timelineMonths[0])} – ${formatMonthLabel(
          timelineMonths[timelineMonths.length - 1]
        )}`
      : '';

  return (
    <section className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-5">
      {/* Header Row */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-blue-600 text-white shrink-0">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                Tren Pengeluaran Bulanan per Kategori &amp; Target Hemat AI
              </h3>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                · {targetSourceLabel}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
              Klik batang grafik untuk memfilter transaksi, atau klik label kategori di legenda bawah grafik untuk membuka diagram pie sub-kategori.
            </p>
          </div>
        </div>

        {/* Interactive Controls */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => setChartMode('bar')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                chartMode === 'bar'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <BarChart3 className="h-3.5 w-3.5" />
              <span>Batang</span>
            </button>
            <button
              type="button"
              onClick={() => setChartMode('area')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                chartMode === 'area'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              <span>Area</span>
            </button>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            {([
              { id: '3m', label: '3 Bln' },
              { id: '6m', label: '6 Bln' },
              { id: '12m', label: '12 Bln' },
            ] as const).map((win) => (
              <button
                key={win.id}
                type="button"
                onClick={() => setPeriodWindow(win.id)}
                className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer whitespace-nowrap shrink-0 ${
                  periodWindow === win.id
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {win.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setShowYoYTrend((prev) => !prev)}
            aria-pressed={showYoYTrend}
            className={`px-3 py-2 rounded-lg text-xs font-semibold border transition cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
              showYoYTrend
                ? 'bg-violet-50 dark:bg-violet-950/40 border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300'
                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
            }`}
          >
            <History className="h-3.5 w-3.5" />
            <span>YoY Trend</span>
          </button>
        </div>
      </div>

      {!hasExpenses ? (
        <div className="py-10 px-4 text-center border border-dashed border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-slate-800/30 space-y-2">
          <Sparkles className="h-7 w-7 text-slate-400 mx-auto" />
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
            Belum Ada Data Pengeluaran Operasional
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Catat transaksi pengeluaran di Jurnal Transaksi untuk memantau tren kategori bulanan beserta target penghematan AI secara instan.
          </p>
        </div>
      ) : (
        <>
          {/* 4-Column KPI Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 space-y-1">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block">
                Rata-Rata Pengeluaran / Bln
              </span>
              <span className="text-base font-extrabold font-mono tabular-nums text-slate-900 dark:text-slate-100 block">
                {formatterIDR.format(avgMonthlyExpense)}
              </span>
            </div>

            <div className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-800/70 bg-emerald-50/50 dark:bg-emerald-950/20 space-y-1">
              <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                <TrendingDown className="h-3.5 w-3.5" />
                <span>Target Hemat AI / Bln</span>
              </span>
              <span className="text-base font-extrabold font-mono tabular-nums text-emerald-800 dark:text-emerald-200 block">
                {formatterIDR.format(aiMonthlyTarget)}
              </span>
            </div>

            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 space-y-1">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block">
                Potensi Penghematan / Bln
              </span>
              <span className="text-base font-extrabold font-mono tabular-nums text-blue-700 dark:text-blue-400 block">
                {potentialMonthlySavings > 0
                  ? `+${formatterIDR.format(potentialMonthlySavings)}`
                  : 'Sudah di Bawah Target'}
              </span>
            </div>

            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 space-y-1">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block">
                Kategori Dominan ({periodWindow.toUpperCase()})
              </span>
              <span className="text-sm font-extrabold text-slate-900 dark:text-slate-100 block truncate">
                {topCategory ? `${topCategory.name} (${topCategory.sharePct}%)` : '-'}
              </span>
            </div>
          </div>

          {/* Category Filter Chips + Optional Missing YoY Helper */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            {categorySeriesKeys.length > 1 ? (
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mr-1">
                  Filter Kategori:
                </span>
                {categorySeriesKeys.map((cat, idx) => {
                  const isHidden = hiddenCategories.has(cat);
                  const color = CATEGORY_PALETTE[idx % CATEGORY_PALETTE.length];
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => toggleCategoryVisibility(cat)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                        isHidden
                          ? 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-400 line-through'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                      }`}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-xs shrink-0"
                        style={{ backgroundColor: isHidden ? '#cbd5e1' : color }}
                      />
                      <span>{cat}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div />
            )}

            {showYoYTrend && !hasAnyYoYHistory && (
              <span className="text-[11px] font-medium text-amber-700 dark:text-amber-300">
                Belum ada catatan transaksi 12 bulan sebelumnya pada rentang ini.
              </span>
            )}
          </div>

          {/* Recharts Stacked Bar / Area + AI Target Line + Optional YoY Trend Line */}
          <div className="h-84 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartRows}
                margin={{ top: 12, right: 12, left: 4, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis
                  dataKey="monthLabel"
                  tick={{ fill: '#475569', fontSize: 11, fontWeight: 600 }}
                  axisLine={{ stroke: '#cbd5e1' }}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) => formatCompactIDR(Number(v) || 0)}
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(148, 163, 184, 0.12)' }}
                  content={({ active, payload }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    const row = payload[0].payload as Record<string, any>;
                    const totalActual = Number(row.totalAktual || 0);
                    const totalVisible = Number(row.totalVisibleAktual ?? totalActual);
                    const target = Number(row.targetHematAI || 0);
                    const diff = totalActual - target;
                    const yoyVal =
                      row.yoyActual === null || row.yoyActual === undefined
                        ? null
                        : Number(row.yoyActual);
                    const yoyDiff = yoyVal !== null ? totalVisible - yoyVal : null;
                    const yoyPct =
                      yoyVal !== null && yoyVal > 0
                        ? Math.round(((totalVisible - yoyVal) / yoyVal) * 1000) / 10
                        : null;

                    return (
                      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 shadow-lg text-xs space-y-2 min-w-[250px]">
                        <div className="flex items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-1.5">
                          <span className="font-extrabold text-slate-900 dark:text-slate-100">
                            {row.monthLabel} ({row.ym})
                          </span>
                          <span
                            className={`text-[10px] font-bold ${
                              diff > 0
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-emerald-600 dark:text-emerald-400'
                            }`}
                          >
                            {diff > 0 ? 'Melebihi Target' : 'Sesuai Target AI'}
                          </span>
                        </div>

                        <div className="space-y-1">
                          {visibleSeriesKeys.map((cat) => {
                            const val = Number(row[cat] || 0);
                            if (val <= 0) return null;
                            const colorIdx = categorySeriesKeys.indexOf(cat);
                            const color = CATEGORY_PALETTE[colorIdx % CATEGORY_PALETTE.length];
                            const isActiveSegment =
                              selectedBarFilter?.ym === row.ym &&
                              selectedBarFilter?.category === cat;
                            return (
                              <div
                                key={cat}
                                className={`flex items-center justify-between gap-4 ${
                                  isActiveSegment ? 'font-bold text-blue-700 dark:text-blue-300' : ''
                                }`}
                              >
                                <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 truncate max-w-[140px]">
                                  <span
                                    className="w-2 h-2 rounded-xs shrink-0"
                                    style={{ backgroundColor: color }}
                                  />
                                  <span className="truncate">{cat}</span>
                                </span>
                                <span className="font-mono tabular-nums font-bold text-slate-800 dark:text-slate-100">
                                  {formatterIDR.format(val)}
                                </span>
                              </div>
                            );
                          })}
                        </div>

                        <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800 space-y-1">
                          <div className="flex justify-between gap-4 font-bold text-slate-900 dark:text-slate-100">
                            <span>Total Aktual:</span>
                            <span className="font-mono tabular-nums">
                              {formatterIDR.format(totalActual)}
                            </span>
                          </div>
                          <div className="flex justify-between gap-4 font-semibold text-emerald-700 dark:text-emerald-400">
                            <span>Target Hemat AI:</span>
                            <span className="font-mono tabular-nums">
                              {formatterIDR.format(target)}
                            </span>
                          </div>
                          <div
                            className={`flex justify-between gap-4 font-bold ${
                              diff > 0
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-emerald-600 dark:text-emerald-400'
                            }`}
                          >
                            <span>{diff > 0 ? 'Selisih Berlebih:' : 'Ruang Penghematan:'}</span>
                            <span className="font-mono tabular-nums">
                              {diff > 0 ? '+' : ''}
                              {formatterIDR.format(Math.abs(diff))}
                            </span>
                          </div>

                          {showYoYTrend && (
                            <div className="pt-1 mt-1 border-t border-slate-100 dark:border-slate-800 space-y-0.5">
                              <div className="flex justify-between gap-4 font-semibold text-violet-700 dark:text-violet-300">
                                <span>YoY ({formatMonthLabel(row.yoyYm)}):</span>
                                <span className="font-mono tabular-nums">
                                  {yoyVal !== null ? formatterIDR.format(yoyVal) : 'Tidak ada data'}
                                </span>
                              </div>
                              {yoyDiff !== null && (
                                <div
                                  className={`flex justify-between gap-4 text-[11px] font-bold ${
                                    yoyDiff > 0
                                      ? 'text-rose-600 dark:text-rose-400'
                                      : 'text-emerald-600 dark:text-emerald-400'
                                  }`}
                                >
                                  <span>Perubahan YoY:</span>
                                  <span className="font-mono tabular-nums">
                                    {yoyDiff > 0 ? '+' : '-'}
                                    {formatterIDR.format(Math.abs(yoyDiff))}
                                    {yoyPct !== null
                                      ? ` (${yoyPct > 0 ? '+' : ''}${yoyPct}%)`
                                      : ''}
                                  </span>
                                </div>
                              )}
                            </div>
                          )}

                          {chartMode === 'bar' && (
                            <p className="text-[10px] text-slate-400 dark:text-slate-500 pt-1">
                              Klik batang kategori untuk memfilter rincian transaksi
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  }}
                />
                <Legend
                  content={() => (
                    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 pt-3 text-[11px] font-semibold">
                      {visibleSeriesKeys.map((cat) => {
                        const colorIdx = categorySeriesKeys.indexOf(cat);
                        const color = CATEGORY_PALETTE[colorIdx % CATEGORY_PALETTE.length];
                        return (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => setLegendModalCategory(cat)}
                            title={`Lihat diagram pie sub-kategori ${cat}`}
                            className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 hover:underline underline-offset-4 transition cursor-pointer whitespace-nowrap shrink-0"
                          >
                            <span
                              className="w-2.5 h-2.5 rounded-xs shrink-0"
                              style={{ backgroundColor: color }}
                            />
                            <span>{cat}</span>
                            <PieChartIcon className="h-3 w-3 text-slate-400" />
                          </button>
                        );
                      })}

                      <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 whitespace-nowrap shrink-0">
                        <span className="w-4 border-t-2 border-dashed border-emerald-600 inline-block" />
                        <span>Target Hemat AI</span>
                      </span>

                      {showYoYTrend && (
                        <span className="inline-flex items-center gap-1.5 text-violet-700 dark:text-violet-300 whitespace-nowrap shrink-0">
                          <span className="w-4 border-t-2 border-dashed border-violet-600 inline-block" />
                          <span>YoY Trend (Tahun Lalu)</span>
                        </span>
                      )}
                    </div>
                  )}
                />

                {visibleSeriesKeys.map((cat) => {
                  const colorIdx = categorySeriesKeys.indexOf(cat);
                  const color = CATEGORY_PALETTE[colorIdx % CATEGORY_PALETTE.length];
                  return chartMode === 'bar' ? (
                    <Bar
                      key={cat}
                      dataKey={cat}
                      stackId="expense"
                      fill={color}
                      radius={[2, 2, 0, 0]}
                      className="cursor-pointer"
                      onClick={(barData, idx) => handleBarSegmentClick(cat, barData, idx)}
                    >
                      {chartRows.map((row, rowIdx) => {
                        const isSelected =
                          selectedBarFilter?.ym === row.ym &&
                          selectedBarFilter?.category === cat;
                        const hasFilter = selectedBarFilter !== null;
                        return (
                          <Cell
                            key={`cell-${cat}-${row.ym || rowIdx}`}
                            fill={color}
                            fillOpacity={hasFilter ? (isSelected ? 1 : 0.3) : 1}
                            stroke={isSelected ? '#0f172a' : 'none'}
                            strokeWidth={isSelected ? 1.5 : 0}
                            className="cursor-pointer"
                          />
                        );
                      })}
                    </Bar>
                  ) : (
                    <Area
                      key={cat}
                      type="monotone"
                      dataKey={cat}
                      stackId="expense"
                      stroke={color}
                      fill={color}
                      fillOpacity={0.35}
                      strokeWidth={1.75}
                    />
                  );
                })}

                <Line
                  type="monotone"
                  dataKey="targetHematAI"
                  name="Target Hemat AI"
                  stroke="#16a34a"
                  strokeWidth={2.5}
                  strokeDasharray="6 4"
                  dot={{ r: 3.5, fill: '#16a34a', strokeWidth: 1.5, stroke: '#ffffff' }}
                  activeDot={{ r: 5 }}
                />

                {showYoYTrend && (
                  <Line
                    type="monotone"
                    dataKey="yoyActual"
                    name="YoY Trend"
                    stroke="#7c3aed"
                    strokeWidth={2.25}
                    strokeDasharray="4 4"
                    connectNulls={false}
                    dot={{ r: 3.5, fill: '#7c3aed', strokeWidth: 1.5, stroke: '#ffffff' }}
                    activeDot={{ r: 5 }}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Interactive Drill-Down Detailed Transactions Table */}
          <div className="pt-5 border-t border-slate-100 dark:border-slate-800 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
                  {selectedBarFilter
                    ? `Rincian Transaksi: ${selectedBarFilter.category} (${selectedBarFilter.monthLabel})`
                    : `Rincian Transaksi Pengeluaran (${windowRangeLabel})`}
                </h4>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  <span>{filteredItems.length} transaksi</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums font-bold text-slate-700 dark:text-slate-200">
                    Total {formatterIDR.format(filteredTotalAmount)}
                  </span>
                  {selectedBarFilter?.category === 'Lainnya' && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>Mencakup seluruh kategori minor di luar 5 besar</span>
                    </>
                  )}
                </div>
              </div>

              {selectedBarFilter ? (
                <button
                  type="button"
                  onClick={handleClearBarFilter}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5 self-start sm:self-auto"
                >
                  <X className="h-3.5 w-3.5" />
                  <span>Tampilkan Semua</span>
                </button>
              ) : (
                chartMode === 'bar' && (
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    Pilih batang bulan &amp; kategori di grafik untuk mempersempit daftar
                  </span>
                )
              )}
            </div>

            {filteredItems.length === 0 ? (
              <div className="py-8 px-4 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/40 dark:bg-slate-800/20 space-y-2">
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Tidak ada transaksi pengeluaran yang cocok dengan filter saat ini.
                </p>
                {selectedBarFilter && (
                  <button
                    type="button"
                    onClick={handleClearBarFilter}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:opacity-90 transition cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Tampilkan Semua Transaksi
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/60 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                      <th className="py-2.5 px-3 whitespace-nowrap">Tanggal</th>
                      <th className="py-2.5 px-3">Deskripsi</th>
                      <th className="py-2.5 px-3 whitespace-nowrap">Akun</th>
                      <th className="py-2.5 px-3 whitespace-nowrap">Kategori</th>
                      <th className="py-2.5 px-3 text-right whitespace-nowrap">Nominal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {displayedItems.map(({ tx, normalizedDate, rawCategory, absAmount }) => {
                      const accountName =
                        accountNameMap.get(tx.accountId) || 'Akun Tidak Ditemukan';
                      const bucketKey = primarySet.has(rawCategory) ? rawCategory : 'Lainnya';
                      const colorIdx = categorySeriesKeys.indexOf(bucketKey);
                      const dotColor =
                        colorIdx >= 0
                          ? CATEGORY_PALETTE[colorIdx % CATEGORY_PALETTE.length]
                          : '#64748b';

                      return (
                        <tr
                          key={tx.id}
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          <td className="py-2.5 px-3 font-mono tabular-nums text-slate-600 dark:text-slate-300 whitespace-nowrap">
                            {formatDisplayDateID(normalizedDate)}
                          </td>
                          <td className="py-2.5 px-3 font-medium text-slate-900 dark:text-slate-100 max-w-[280px] truncate">
                            {tx.description?.trim() || rawCategory}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                            {accountName}
                          </td>
                          <td className="py-2.5 px-3 text-slate-700 dark:text-slate-200 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1.5">
                              <span
                                className="w-2 h-2 rounded-xs shrink-0"
                                style={{ backgroundColor: dotColor }}
                              />
                              <span>{rawCategory}</span>
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                            {formatterIDR.format(absAmount)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {filteredItems.length > DEFAULT_VISIBLE_ROWS && (
                  <div className="px-3 py-2.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between gap-2 text-xs">
                    <span className="text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                      Menampilkan {displayedItems.length} dari {filteredItems.length} transaksi
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowAllRows((prev) => !prev)}
                      className="px-3 py-1 rounded-md font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1"
                    >
                      {showAllRows ? (
                        <>
                          <span>Ringkas Daftar</span>
                          <ChevronUp className="h-3.5 w-3.5" />
                        </>
                      ) : (
                        <>
                          <span>Tampilkan Semua ({filteredItems.length})</span>
                          <ChevronDown className="h-3.5 w-3.5" />
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* Legend Sub-Category Pie Drill-Down Modal */}
      {legendModalCategory && (
        <CategorySubCategoryModal
          isOpen={true}
          onClose={() => setLegendModalCategory(null)}
          categoryKey={legendModalCategory}
          transactions={transactions}
          masterCategories={masterCategories}
          timelineMonthSet={timelineMonthSet}
          primaryCategories={primaryCategories}
          windowRangeLabel={windowRangeLabel}
        />
      )}
    </section>
  );
};
