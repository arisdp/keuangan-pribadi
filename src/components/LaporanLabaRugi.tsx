import React, { useState, useMemo, useEffect, useRef, useTransition } from 'react';
import { Transaction, Account, KprCoaMappingConfig } from '../types';
import {
  CategoryNode,
  DEFAULT_CATEGORY_HIERARCHY,
  flattenCategoryHierarchy,
  resolveCategoryCoaInfo,
  ResolvedCategoryCoaInfo,
} from '../categoryHierarchy';
import { getStoredCoaList } from '../coaUtils';
import {
  calculateMonthlyIncomeStatementSeries,
  MonthlyIncomeStatementPoint,
  MonthlyIncomeCategoryBreakdown,
  parseLocalDate,
} from '../utils/accountingEngine';
import { SankeyPeriodIndex } from '../utils/cashFlowSankey';
import { formatterIDR } from '../utils/formatters';
import {
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  FileSpreadsheet,
  Download,
  Calendar,
  ChevronDown,
  ChevronRight,
  Filter,
  Search,
  Check,
  X,
  Info,
  Sparkles,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from 'recharts';

interface NetProfitTrendPoint extends MonthlyIncomeStatementPoint {
  momDeltaAmount: number | null;
  momGrowthPct: number | null;
  prevNetProfitLoss: number | null;
  momByDataKey: Record<string, { delta: number | null; pct: number | null }>;
  [dynamicKey: string]: unknown;
}

interface FilterCategoryOption {
  categoryName: string;
  kind: 'income' | 'expense';
  periodTotal: number;
  coaInfo: ResolvedCategoryCoaInfo;
}

interface ActiveComparisonSeriesMeta {
  dataKey: string;
  categoryName: string;
  kind: 'income' | 'expense';
  color: string;
  coaInfo: ResolvedCategoryCoaInfo;
  totalPeriodAmount: number;
}

interface IncomeStatementAiSummary {
  headline: string;
  trendExplanation: string;
  keyDrivers: string[];
  actionableNote: string;
  generatedAt?: string;
}

export type IncomeStatementPeriodRange = '3m' | '6m' | '12m' | 'ytd';

interface LaporanLabaRugiProps {
  transactions: Transaction[];
  accounts?: Account[];
  masterCategories?: CategoryNode[];
  kprCoaMapping?: KprCoaMappingConfig;
  periodIndex?: SankeyPeriodIndex;
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

const SHORT_MONTH_NAMES = [
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

const COMPARISON_SERIES_COLORS = [
  '#2563eb', // blue-600
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#7c3aed', // violet-600
  '#0891b2', // cyan-600
  '#e11d48', // rose-600
];

const MAX_VISUAL_SERIES = 6;

function formatShortDateID(dateStr: string): string {
  if (!dateStr) return '-';
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const day = parseInt(match[3], 10);
    const monthIdx = parseInt(match[2], 10) - 1;
    const monthName = SHORT_MONTH_NAMES[monthIdx] || match[2];
    return `${day} ${monthName}`;
  }
  const dt = parseLocalDate(dateStr);
  if (dt) {
    return `${dt.getDate()} ${SHORT_MONTH_NAMES[dt.getMonth()] || ''}`.trim();
  }
  return dateStr;
}

function formatCompactAxisIDR(val: number): string {
  const sign = val < 0 ? '-' : '';
  const abs = Math.abs(val);
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(1)}M`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}Jt`;
  if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)}Rb`;
  return `${sign}${abs}`;
}

export const LaporanLabaRugi: React.FC<LaporanLabaRugiProps> = ({
  transactions,
  accounts = [],
  masterCategories = DEFAULT_CATEGORY_HIERARCHY,
  kprCoaMapping,
  periodIndex,
  onExportMonthCSV,
  onExportMonthPDF,
  onSelectedMonthChange,
}) => {
  const [isPending, startTransition] = useTransition();
  const [periodRange, setPeriodRange] = useState<IncomeStatementPeriodRange>('6m');
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [expandedCategoryKey, setExpandedCategoryKey] = useState<string | null>(null);
  const [expandedTableMonthKey, setExpandedTableMonthKey] = useState<string | null>(null);

  // Multi-select category filter state ([] = Semua Kategori)
  const [selectedFilterCategories, setSelectedFilterCategories] = useState<string[]>([]);
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [categorySearchQuery, setCategorySearchQuery] = useState('');
  const categoryDropdownRef = useRef<HTMLDivElement>(null);

  // Hover-to-highlight state synced between LineChart and tables/breakdowns
  const [hoveredMonthKey, setHoveredMonthKey] = useState<string | null>(null);

  // AI Performance Summary Strip state & session cache
  const [aiSummary, setAiSummary] = useState<IncomeStatementAiSummary | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiRefreshNonce, setAiRefreshNonce] = useState(0);
  const aiCacheRef = useRef<Map<string, IncomeStatementAiSummary>>(new Map());
  const lastForcedNonceRef = useRef<number>(0);

  const onSelectedMonthChangeRef = useRef(onSelectedMonthChange);
  onSelectedMonthChangeRef.current = onSelectedMonthChange;

  const coaList = useMemo(() => getStoredCoaList(), [masterCategories]);

  // Close multi-select dropdown on outside click or Escape key
  useEffect(() => {
    if (!isCategoryDropdownOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (
        categoryDropdownRef.current &&
        !categoryDropdownRef.current.contains(e.target as Node)
      ) {
        setIsCategoryDropdownOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsCategoryDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isCategoryDropdownOpen]);

  const accountNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    accounts.forEach((acc) => {
      if (acc?.id) {
        map[acc.id] = acc.name || acc.id;
      }
    });
    return map;
  }, [accounts]);

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

  // Base full series from accounting engine (O(1) month lookup via periodIndex Map when provided)
  const series = useMemo(() => {
    return calculateMonthlyIncomeStatementSeries(
      transactions,
      kprCoaMapping,
      monthsCount,
      periodIndex?.byMonth
    );
  }, [transactions, kprCoaMapping, monthsCount, periodIndex]);

  // Available operating categories (from period transactions + Master Categories) paired with COA metadata
  const filterCategoryGroups = useMemo(() => {
    const incomeMap = new Map<string, FilterCategoryOption>();
    const expenseMap = new Map<string, FilterCategoryOption>();

    const registerCategory = (name: string, kind: 'income' | 'expense', addAmount: number) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const key = trimmed.toLowerCase();
      const targetMap = kind === 'income' ? incomeMap : expenseMap;
      const existing = targetMap.get(key);
      if (existing) {
        existing.periodTotal += addAmount;
      } else {
        targetMap.set(key, {
          categoryName: trimmed,
          kind,
          periodTotal: addAmount,
          coaInfo: resolveCategoryCoaInfo(
            trimmed,
            masterCategories,
            coaList,
            kprCoaMapping,
            kind
          ),
        });
      }
    };

    // 1. From active period breakdown
    series.months.forEach((m) => {
      m.incomeCategories.forEach((c) => registerCategory(c.category, 'income', c.amount));
      m.expenseCategories.forEach((c) => registerCategory(c.category, 'expense', c.amount));
    });

    // 2. Include all operating leaf categories from Master Categories (excluding pure Neraca 1xxx-3xxx nodes)
    const flat = flattenCategoryHierarchy(masterCategories);
    flat.forEach((node) => {
      if (node.type !== 'item') return;
      if (node.transactionType === 'income') {
        const info = resolveCategoryCoaInfo(
          node.name,
          masterCategories,
          coaList,
          kprCoaMapping,
          'income'
        );
        if (info.coaCategory === 'Income') {
          registerCategory(node.name, 'income', 0);
        }
      } else if (node.transactionType === 'expense') {
        const info = resolveCategoryCoaInfo(
          node.name,
          masterCategories,
          coaList,
          kprCoaMapping,
          'expense'
        );
        if (info.coaCategory === 'Expense') {
          registerCategory(node.name, 'expense', 0);
        }
      }
    });

    const sortOpts = (a: FilterCategoryOption, b: FilterCategoryOption) => {
      if (b.periodTotal !== a.periodTotal) return b.periodTotal - a.periodTotal;
      return a.categoryName.localeCompare(b.categoryName, 'id-ID');
    };

    return {
      income: Array.from(incomeMap.values()).sort(sortOpts),
      expense: Array.from(expenseMap.values()).sort(sortOpts),
    };
  }, [series.months, masterCategories, coaList, kprCoaMapping]);

  const categoryKindLookup = useMemo(() => {
    const map = new Map<string, FilterCategoryOption>();
    filterCategoryGroups.income.forEach((opt) =>
      map.set(opt.categoryName.toLowerCase(), opt)
    );
    filterCategoryGroups.expense.forEach((opt) =>
      map.set(opt.categoryName.toLowerCase(), opt)
    );
    return map;
  }, [filterCategoryGroups]);

  const isCategoryFilterActive = selectedFilterCategories.length > 0;

  // Filtered monthly & KPI series respecting selectedFilterCategories
  const filteredSeries = useMemo(() => {
    if (!isCategoryFilterActive) {
      return series;
    }

    const selectedSet = new Set(selectedFilterCategories.map((c) => c.toLowerCase().trim()));

    const months: MonthlyIncomeStatementPoint[] = series.months.map((m) => {
      const rawIncomeCats = m.incomeCategories.filter((c) =>
        selectedSet.has(c.category.toLowerCase().trim())
      );
      const rawExpenseCats = m.expenseCategories.filter((c) =>
        selectedSet.has(c.category.toLowerCase().trim())
      );

      const totalIncome = rawIncomeCats.reduce((sum, c) => sum + c.amount, 0);
      const totalExpense = rawExpenseCats.reduce((sum, c) => sum + c.amount, 0);
      const netProfitLoss = totalIncome - totalExpense;
      const marginPct = totalIncome > 0 ? (netProfitLoss / totalIncome) * 100 : 0;

      const incomeCategories = rawIncomeCats.map((c) => ({
        ...c,
        percentage: totalIncome > 0 ? (c.amount / totalIncome) * 100 : 0,
      }));
      const expenseCategories = rawExpenseCats.map((c) => ({
        ...c,
        percentage: totalExpense > 0 ? (c.amount / totalExpense) * 100 : 0,
      }));

      const txIds = new Set<string>();
      incomeCategories.forEach((c) => c.transactions.forEach((tx) => txIds.add(tx.id)));
      expenseCategories.forEach((c) => c.transactions.forEach((tx) => txIds.add(tx.id)));

      const kprInterestExpense = expenseCategories
        .filter((c) =>
          c.transactions.some((tx) => tx.isKprInterestSplit)
        )
        .reduce((sum, c) => sum + c.amount, 0);

      return {
        ...m,
        totalIncome,
        totalExpense,
        netProfitLoss,
        marginPct,
        kprInterestExpense,
        txCount: txIds.size,
        incomeCategories,
        expenseCategories,
      };
    });

    const totalIncome6M = months.reduce((s, m) => s + m.totalIncome, 0);
    const totalExpense6M = months.reduce((s, m) => s + m.totalExpense, 0);
    const netProfitLoss6M = totalIncome6M - totalExpense6M;
    const avgMarginPct6M = totalIncome6M > 0 ? (netProfitLoss6M / totalIncome6M) * 100 : 0;
    const surplusMonthsCount = months.filter((m) => m.netProfitLoss > 0).length;
    const deficitMonthsCount = months.filter((m) => m.netProfitLoss < 0).length;

    return {
      months,
      totalIncome6M,
      totalExpense6M,
      netProfitLoss6M,
      avgMarginPct6M,
      surplusMonthsCount,
      deficitMonthsCount,
    };
  }, [series, isCategoryFilterActive, selectedFilterCategories]);

  // Active comparison series (when 1+ categories are selected in dropdown)
  const activeChartSeries = useMemo<ActiveComparisonSeriesMeta[]>(() => {
    if (!isCategoryFilterActive) return [];

    const enriched = selectedFilterCategories.map((catName) => {
      const lower = catName.toLowerCase().trim();
      let periodAmount = 0;
      let inferredKind: 'income' | 'expense' | undefined;

      series.months.forEach((m) => {
        m.incomeCategories.forEach((c) => {
          if (c.category.toLowerCase().trim() === lower) {
            periodAmount += c.amount;
            inferredKind = 'income';
          }
        });
        m.expenseCategories.forEach((c) => {
          if (c.category.toLowerCase().trim() === lower) {
            periodAmount += c.amount;
            inferredKind = 'expense';
          }
        });
      });

      const optMeta = categoryKindLookup.get(lower);
      const kind = inferredKind || optMeta?.kind || 'expense';
      const coaInfo =
        optMeta?.coaInfo ||
        resolveCategoryCoaInfo(catName, masterCategories, coaList, kprCoaMapping, kind);

      return {
        categoryName: optMeta?.categoryName || catName,
        kind,
        coaInfo,
        totalPeriodAmount: periodAmount,
      };
    });

    // Sort descending by total period amount so largest categories appear first; cap visual series at 6
    enriched.sort((a, b) => b.totalPeriodAmount - a.totalPeriodAmount);

    return enriched.slice(0, MAX_VISUAL_SERIES).map((item, idx) => ({
      dataKey: `cat_${idx}`,
      categoryName: item.categoryName,
      kind: item.kind,
      color: COMPARISON_SERIES_COLORS[idx % COMPARISON_SERIES_COLORS.length],
      coaInfo: item.coaInfo,
      totalPeriodAmount: item.totalPeriodAmount,
    }));
  }, [
    isCategoryFilterActive,
    selectedFilterCategories,
    series.months,
    categoryKindLookup,
    masterCategories,
    coaList,
    kprCoaMapping,
  ]);

  const selectedMonthData = useMemo(() => {
    return (
      filteredSeries.months.find((m) => m.monthKey === selectedMonthKey) ||
      filteredSeries.months[filteredSeries.months.length - 1]
    );
  }, [filteredSeries, selectedMonthKey]);

  useEffect(() => {
    if (selectedMonthData && onSelectedMonthChangeRef.current) {
      onSelectedMonthChangeRef.current(selectedMonthData);
    }
  }, [selectedMonthData]);

  // Reset open category drilldown when switching month, period range, or category filter
  useEffect(() => {
    setExpandedCategoryKey(null);
  }, [selectedMonthData?.monthKey, periodRange, selectedFilterCategories]);

  // Reset open table row accordion and hovered month when changing period range or category filter
  useEffect(() => {
    setExpandedTableMonthKey(null);
    setHoveredMonthKey(null);
  }, [periodRange, selectedFilterCategories]);

  const hasAnyTransactionsInRange = useMemo(
    () => filteredSeries.months.some((m) => m.txCount > 0),
    [filteredSeries.months]
  );

  // Hover-to-highlight derived month point and active categories (amount > 0)
  const hoveredMonthPoint = useMemo(() => {
    if (!hoveredMonthKey) return null;
    return filteredSeries.months.find((m) => m.monthKey === hoveredMonthKey) || null;
  }, [hoveredMonthKey, filteredSeries.months]);

  const hoveredActiveCategorySet = useMemo(() => {
    const activeSet = new Set<string>();
    if (!hoveredMonthPoint) return activeSet;
    hoveredMonthPoint.incomeCategories.forEach((c) => {
      if (c.amount > 0) activeSet.add(c.category.toLowerCase().trim());
    });
    hoveredMonthPoint.expenseCategories.forEach((c) => {
      if (c.amount > 0) activeSet.add(c.category.toLowerCase().trim());
    });
    return activeSet;
  }, [hoveredMonthPoint]);

  // Compact deterministic payload for AI Performance Summary
  const aiSummaryPayload = useMemo(() => {
    const sortedCategories = [...selectedFilterCategories]
      .sort((a, b) => a.localeCompare(b, 'id-ID'))
      .map((catName) => {
        const opt = categoryKindLookup.get(catName.toLowerCase().trim());
        const coaInfo =
          opt?.coaInfo ||
          resolveCategoryCoaInfo(catName, masterCategories, coaList, kprCoaMapping);
        return {
          name: opt?.categoryName || catName,
          kind: opt?.kind || 'expense',
          coaCode: coaInfo.coaCode,
          coaName: coaInfo.coaName,
        };
      });

    return {
      periodRange,
      periodLabel: activePeriodMeta.badgeText,
      selectedCategories: sortedCategories,
      totals: {
        totalIncome: filteredSeries.totalIncome6M,
        totalExpense: filteredSeries.totalExpense6M,
        netProfitLoss: filteredSeries.netProfitLoss6M,
        avgMarginPct: Number(filteredSeries.avgMarginPct6M.toFixed(1)),
        surplusMonthsCount: filteredSeries.surplusMonthsCount,
        deficitMonthsCount: filteredSeries.deficitMonthsCount,
      },
      months: filteredSeries.months.map((m) => ({
        monthKey: m.monthKey,
        monthLabel: m.monthLabel,
        fullMonthLabel: m.fullMonthLabel,
        totalIncome: m.totalIncome,
        totalExpense: m.totalExpense,
        netProfitLoss: m.netProfitLoss,
        marginPct: Number(m.marginPct.toFixed(1)),
        topIncomeCategories: m.incomeCategories.slice(0, 5).map((c) => ({
          category: c.category,
          amount: c.amount,
        })),
        topExpenseCategories: m.expenseCategories.slice(0, 5).map((c) => ({
          category: c.category,
          amount: c.amount,
        })),
      })),
    };
  }, [
    periodRange,
    activePeriodMeta.badgeText,
    selectedFilterCategories,
    categoryKindLookup,
    masterCategories,
    coaList,
    kprCoaMapping,
    filteredSeries,
  ]);

  const aiCacheKey = useMemo(() => JSON.stringify(aiSummaryPayload), [aiSummaryPayload]);

  useEffect(() => {
    if (!hasAnyTransactionsInRange) {
      setAiLoading(false);
      setAiError(null);
      setAiSummary(null);
      return;
    }

    const isForcedReload = aiRefreshNonce !== lastForcedNonceRef.current;
    if (!isForcedReload && aiCacheRef.current.has(aiCacheKey)) {
      setAiSummary(aiCacheRef.current.get(aiCacheKey) || null);
      setAiError(null);
      setAiLoading(false);
      return;
    }

    const controller = new AbortController();
    setAiLoading(true);
    setAiError(null);

    const delayMs = isForcedReload ? 0 : 550;
    const timerId = window.setTimeout(async () => {
      try {
        lastForcedNonceRef.current = aiRefreshNonce;
        const res = await fetch('/api/income-statement-summary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(aiSummaryPayload),
          signal: controller.signal,
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            data?.error || `Gagal memuat ringkasan AI (HTTP ${res.status}).`
          );
        }

        const formatted: IncomeStatementAiSummary = {
          headline: String(data?.headline || ''),
          trendExplanation: String(data?.trendExplanation || ''),
          keyDrivers: Array.isArray(data?.keyDrivers)
            ? data.keyDrivers.map(String)
            : [],
          actionableNote: String(data?.actionableNote || ''),
          generatedAt: data?.generatedAt ? String(data.generatedAt) : undefined,
        };

        aiCacheRef.current.set(aiCacheKey, formatted);
        if (!controller.signal.aborted) {
          setAiSummary(formatted);
          setAiError(null);
          setAiLoading(false);
        }
      } catch (err: any) {
        if (controller.signal.aborted || err?.name === 'AbortError') return;
        setAiError(
          err?.message || 'Gagal menghubungi layanan AI untuk merangkum performa.'
        );
        setAiLoading(false);
      }
    }, delayMs);

    return () => {
      window.clearTimeout(timerId);
      controller.abort();
    };
  }, [aiCacheKey, aiSummaryPayload, aiRefreshNonce, hasAnyTransactionsInRange]);

  // Trend & multi-category comparison data for LineChart & BarChart
  const trendChartData = useMemo<NetProfitTrendPoint[]>(() => {
    return filteredSeries.months.map((m, idx) => {
      const prevMonth = idx > 0 ? filteredSeries.months[idx - 1] : null;
      const prevNetProfitLoss = prevMonth ? prevMonth.netProfitLoss : null;
      const momDeltaAmount =
        prevNetProfitLoss !== null ? m.netProfitLoss - prevNetProfitLoss : null;
      const momGrowthPct =
        prevNetProfitLoss !== null && prevNetProfitLoss !== 0
          ? ((m.netProfitLoss - prevNetProfitLoss) / Math.abs(prevNetProfitLoss)) * 100
          : null;

      const row: NetProfitTrendPoint = {
        ...m,
        prevNetProfitLoss,
        momDeltaAmount,
        momGrowthPct,
        momByDataKey: {},
      };

      if (activeChartSeries.length > 0) {
        activeChartSeries.forEach((s) => {
          const targetLower = s.categoryName.toLowerCase().trim();
          const getCatMonthAmount = (monthPt: MonthlyIncomeStatementPoint) => {
            const inc = monthPt.incomeCategories.find(
              (c) => c.category.toLowerCase().trim() === targetLower
            );
            const exp = monthPt.expenseCategories.find(
              (c) => c.category.toLowerCase().trim() === targetLower
            );
            return (inc?.amount || 0) + (exp?.amount || 0);
          };

          const currVal = getCatMonthAmount(m);
          row[s.dataKey] = currVal;

          if (prevMonth) {
            const prevVal = getCatMonthAmount(prevMonth);
            const delta = currVal - prevVal;
            const pct = prevVal !== 0 ? (delta / Math.abs(prevVal)) * 100 : null;
            row.momByDataKey[s.dataKey] = { delta, pct };
          } else {
            row.momByDataKey[s.dataKey] = { delta: null, pct: null };
          }
        });
      }

      return row;
    });
  }, [filteredSeries.months, activeChartSeries]);

  const latestTrendPoint = trendChartData[trendChartData.length - 1];

  if (!selectedMonthData) {
    return null;
  }

  const toggleCategoryAccordion = (catKey: string) => {
    setExpandedCategoryKey((prev) => (prev === catKey ? null : catKey));
  };

  const handleTableRowClick = (monthKey: string) => {
    startTransition(() => {
      setSelectedMonthKey(monthKey);
      setExpandedTableMonthKey((prev) => (prev === monthKey ? null : monthKey));
    });
  };

  const toggleFilterCategory = (categoryName: string) => {
    startTransition(() => {
      setSelectedFilterCategories((prev) => {
        const exists = prev.some(
          (c) => c.toLowerCase().trim() === categoryName.toLowerCase().trim()
        );
        if (exists) {
          return prev.filter(
            (c) => c.toLowerCase().trim() !== categoryName.toLowerCase().trim()
          );
        }
        return [...prev, categoryName];
      });
    });
  };

  const selectAllByKind = (kind: 'income' | 'expense') => {
    const names = filterCategoryGroups[kind].map((opt) => opt.categoryName);
    startTransition(() => setSelectedFilterCategories(names));
  };

  const clearCategoryFilter = () => {
    startTransition(() => setSelectedFilterCategories([]));
    setCategorySearchQuery('');
  };

  const searchLower = categorySearchQuery.trim().toLowerCase();
  const visibleIncomeOptions = filterCategoryGroups.income.filter(
    (opt) =>
      !searchLower ||
      opt.categoryName.toLowerCase().includes(searchLower) ||
      opt.coaInfo.coaCode.toLowerCase().includes(searchLower) ||
      opt.coaInfo.coaName.toLowerCase().includes(searchLower)
  );
  const visibleExpenseOptions = filterCategoryGroups.expense.filter(
    (opt) =>
      !searchLower ||
      opt.categoryName.toLowerCase().includes(searchLower) ||
      opt.coaInfo.coaCode.toLowerCase().includes(searchLower) ||
      opt.coaInfo.coaName.toLowerCase().includes(searchLower)
  );

  const filterButtonLabel =
    selectedFilterCategories.length === 0
      ? 'Filter: Semua Kategori'
      : selectedFilterCategories.length === 1
      ? `Kategori: ${selectedFilterCategories[0]}`
      : `Filter: ${selectedFilterCategories.length} Kategori`;

  const renderTableAccordionGroup = (
    categories: MonthlyIncomeCategoryBreakdown[],
    totalAmount: number,
    kind: 'income' | 'expense'
  ) => {
    const isIncome = kind === 'income';
    const title = isIncome ? 'Pendapatan Operasional' : 'Beban & Pengeluaran Operasional';
    const totalColor = isIncome ? 'text-emerald-700' : 'text-amber-700';

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 text-xs font-extrabold text-slate-800">
          <span className="flex items-center gap-1.5">
            {isIncome ? (
              <ArrowUpRight className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
            ) : (
              <ArrowDownRight className="h-3.5 w-3.5 text-amber-600 shrink-0" />
            )}
            <span>{title}</span>
          </span>
          <span className={`font-mono tabular-nums ${totalColor}`}>
            {formatterIDR.format(totalAmount)}
          </span>
        </div>

        {categories.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-2.5 text-[11px] text-slate-500">
            {isCategoryFilterActive
              ? 'Tidak ada transaksi kategori terpilih pada kelompok ini.'
              : isIncome
              ? 'Belum ada transaksi pendapatan operasional pada bulan ini.'
              : 'Belum ada transaksi pengeluaran operasional pada bulan ini.'}
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-200 overflow-hidden">
            {categories.map((cat) => {
              const catKey = `${kind}:${cat.category}`;
              const isCatExpanded = expandedCategoryKey === catKey;
              const isHoveredActive =
                !hoveredMonthPoint ||
                hoveredActiveCategorySet.has(cat.category.toLowerCase().trim());
              const coaInfo = resolveCategoryCoaInfo(
                cat.category,
                masterCategories,
                coaList,
                kprCoaMapping,
                kind
              );

              return (
                <div
                  key={`${kind}-acc-${cat.category}`}
                  className={`transition-opacity duration-150 ${
                    isHoveredActive ? 'opacity-100' : 'opacity-30'
                  }`}
                >
                  <button
                    type="button"
                    aria-expanded={isCatExpanded}
                    onClick={() => toggleCategoryAccordion(catKey)}
                    className={`w-full text-left px-3 py-2.5 flex items-center justify-between gap-2 text-xs transition-colors cursor-pointer focus:outline-none focus-visible:bg-blue-50 ${
                      isCatExpanded
                        ? 'bg-slate-100/90 border-b border-slate-200'
                        : hoveredMonthPoint && isHoveredActive
                        ? 'bg-blue-50/40 hover:bg-blue-50/70'
                        : 'bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      {isCatExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5 text-slate-600 shrink-0" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      )}
                      <span className="font-mono tabular-nums text-[11px] font-bold text-blue-700 shrink-0">
                        [{coaInfo.coaCode}]
                      </span>
                      <span
                        className={`truncate ${
                          isCatExpanded ? 'font-bold text-slate-900' : 'font-semibold text-slate-800'
                        }`}
                      >
                        {cat.category}
                      </span>
                      <span className="text-[10px] text-slate-500 shrink-0">
                        · {cat.transactions.length} transaksi · {cat.percentage.toFixed(0)}%
                      </span>
                    </div>
                    <span className={`font-mono tabular-nums font-bold shrink-0 ${totalColor}`}>
                      {formatterIDR.format(cat.amount)}
                    </span>
                  </button>

                  {isCatExpanded && (
                    <div className="bg-slate-50/50">
                      <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 text-[11px] text-slate-600 leading-snug">
                        <span className="font-mono font-bold text-blue-700">
                          [{coaInfo.coaCode}] {coaInfo.coaName}
                        </span>
                        {' · '}
                        <span className="font-semibold text-slate-700">{coaInfo.reportName}:</span>{' '}
                        {coaInfo.reportExplanation}
                      </div>

                      {cat.transactions.length === 0 ? (
                        <div className="px-3 py-2.5 text-[11px] text-slate-500">
                          Tidak ada rincian transaksi untuk kategori ini.
                        </div>
                      ) : (
                        <div className="overflow-x-auto max-h-60 overflow-y-auto">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                <th className="py-1.5 px-3 whitespace-nowrap">Tanggal</th>
                                <th className="py-1.5 px-3">Deskripsi</th>
                                <th className="py-1.5 px-3 whitespace-nowrap">Akun / Sumber</th>
                                <th className="py-1.5 px-3 text-right whitespace-nowrap">Nominal</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-[11px] bg-white">
                              {cat.transactions.map((tx) => {
                                const accountLabel = tx.isAdjustment
                                  ? 'Jurnal Non-Kas'
                                  : accountNameMap[tx.accountId] ||
                                    tx.accountId ||
                                    'Akun Tidak Tercatat';
                                return (
                                  <tr key={`${kind}-tx-${tx.id}`} className="hover:bg-slate-50/70">
                                    <td className="py-1.5 px-3 text-slate-500 font-mono tabular-nums whitespace-nowrap">
                                      {formatShortDateID(tx.date)}
                                    </td>
                                    <td
                                      className="py-1.5 px-3 text-slate-800 font-medium max-w-[200px] truncate"
                                      title={tx.description}
                                    >
                                      {tx.description}
                                    </td>
                                    <td
                                      className="py-1.5 px-3 text-slate-500 whitespace-nowrap max-w-[130px] truncate"
                                      title={accountLabel}
                                    >
                                      {accountLabel}
                                    </td>
                                    <td
                                      className={`py-1.5 px-3 text-right font-mono tabular-nums font-semibold whitespace-nowrap ${totalColor}`}
                                    >
                                      {formatterIDR.format(tx.amount)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderCategoryDrilldownList = (
    categories: MonthlyIncomeCategoryBreakdown[],
    kind: 'income' | 'expense'
  ) => {
    const isIncome = kind === 'income';
    const barColorClass = isIncome ? 'bg-emerald-500' : 'bg-amber-500';
    const amountColorClass = isIncome ? 'text-emerald-700' : 'text-amber-700';

    return (
      <div className="space-y-2">
        {categories.map((cat) => {
          const catKey = `${kind}:${cat.category}`;
          const isExpanded = expandedCategoryKey === catKey;
          const isHoveredActive =
            !hoveredMonthPoint ||
            hoveredActiveCategorySet.has(cat.category.toLowerCase().trim());
          const txCount = cat.transactions.length;
          const coaInfo = resolveCategoryCoaInfo(
            cat.category,
            masterCategories,
            coaList,
            kprCoaMapping,
            kind
          );

          return (
            <div
              key={catKey}
              className={`rounded-xl border transition-all duration-150 ${
                !isHoveredActive ? 'opacity-30' : 'opacity-100'
              } ${
                isExpanded
                  ? 'border-slate-300 bg-slate-50/70'
                  : hoveredMonthPoint && isHoveredActive
                  ? 'border-blue-300 bg-blue-50/40'
                  : 'border-transparent hover:border-slate-200 hover:bg-slate-50/60'
              }`}
            >
              <button
                type="button"
                aria-expanded={isExpanded}
                onClick={() => toggleCategoryAccordion(catKey)}
                className="w-full text-left px-2.5 py-2 rounded-xl space-y-1.5 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-1.5 min-w-0">
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5 text-slate-600 shrink-0" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    )}
                    <span className="font-mono tabular-nums text-[11px] font-bold text-blue-700 shrink-0">
                      [{coaInfo.coaCode}]
                    </span>
                    <span
                      className={`truncate ${
                        isExpanded ? 'font-bold text-slate-900' : 'font-medium text-slate-700'
                      }`}
                    >
                      {cat.category}
                    </span>
                    <span className="text-[11px] text-slate-400 shrink-0">
                      · {txCount} trx
                    </span>
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
                    className={`h-full ${barColorClass} rounded-full`}
                    style={{ width: `${Math.min(100, Math.max(2, cat.percentage))}%` }}
                  />
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-slate-200 bg-white rounded-b-xl overflow-hidden">
                  <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 text-[11px] text-slate-600 leading-snug">
                    <span className="font-mono font-bold text-blue-700">
                      [{coaInfo.coaCode}] {coaInfo.coaName}
                    </span>
                    {' · '}
                    {coaInfo.reportExplanation}
                  </div>
                  {txCount === 0 ? (
                    <div className="px-3 py-2.5 text-[11px] text-slate-500">
                      Tidak ada rincian transaksi untuk kategori ini.
                    </div>
                  ) : (
                    <div className="max-h-60 overflow-y-auto overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            <th className="py-2 px-3 whitespace-nowrap">Tanggal</th>
                            <th className="py-2 px-3">Deskripsi</th>
                            <th className="py-2 px-3 whitespace-nowrap">Akun / Sumber</th>
                            <th className="py-2 px-3 text-right whitespace-nowrap">Nominal</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-[11px]">
                          {cat.transactions.map((tx) => {
                            const accountLabel = tx.isAdjustment
                              ? 'Jurnal Non-Kas'
                              : accountNameMap[tx.accountId] ||
                                tx.accountId ||
                                'Akun Tidak Tercatat';
                            return (
                              <tr key={tx.id} className="hover:bg-slate-50/80">
                                <td className="py-2 px-3 text-slate-500 font-mono tabular-nums whitespace-nowrap">
                                  {formatShortDateID(tx.date)}
                                </td>
                                <td className="py-2 px-3 text-slate-800 font-medium max-w-[160px] truncate" title={tx.description}>
                                  {tx.description}
                                </td>
                                <td className="py-2 px-3 text-slate-500 whitespace-nowrap max-w-[110px] truncate" title={accountLabel}>
                                  {accountLabel}
                                </td>
                                <td
                                  className={`py-2 px-3 text-right font-mono tabular-nums font-bold whitespace-nowrap ${amountColorClass}`}
                                >
                                  {formatterIDR.format(tx.amount)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const singleSelectedSeries =
    selectedFilterCategories.length === 1 && activeChartSeries.length === 1
      ? activeChartSeries[0]
      : null;

  return (
    <div className={`space-y-6 animate-fadeIn transition-opacity duration-150 ${isPending ? 'opacity-75' : 'opacity-100'}`}>
      {/* Header, Period & Multi-Select Category Filter, 4-KPI Summary Strip */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <TrendingUp className="h-5 w-5 text-blue-600 shrink-0" />
              <h3 className="text-base font-black text-slate-900 tracking-tight">
                Laporan Laba-Rugi Bulanan ({activePeriodMeta.badgeText})
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Menghitung Pendapatan Operasional (COA 4xxx) dikurangi Beban Operasional & Bunga KPR (COA 5xxx). Transfer internal (1xxx) dan pelunasan pokok utang (2xxx) dikecualikan agar Laba Bersih tetap objektif.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {isPending && (
              <span
                role="status"
                aria-live="polite"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 whitespace-nowrap shrink-0"
              >
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-blue-600" />
                <span>Memperbarui...</span>
              </span>
            )}
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
                    onClick={() => startTransition(() => setPeriodRange(opt.id))}
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

            {/* Multi-Select Category Filter Dropdown */}
            <div ref={categoryDropdownRef} className="relative">
              <button
                type="button"
                aria-expanded={isCategoryDropdownOpen}
                aria-haspopup="listbox"
                onClick={() => setIsCategoryDropdownOpen((prev) => !prev)}
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0 ${
                  isCategoryFilterActive
                    ? 'bg-blue-50 border-blue-300 text-blue-800 hover:bg-blue-100'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Filter className="h-3.5 w-3.5 shrink-0" />
                <span className="max-w-[165px] truncate">{filterButtonLabel}</span>
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform shrink-0 ${
                    isCategoryDropdownOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {isCategoryDropdownOpen && (
                <div className="absolute right-0 mt-2 w-[320px] sm:w-[390px] bg-white border border-slate-200 rounded-2xl shadow-xl z-40 overflow-hidden">
                  <div className="p-3 border-b border-slate-100 space-y-2.5 bg-slate-50/70">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-black text-slate-900">
                        Filter Multi-Pilih Kategori
                      </span>
                      <span className="text-[11px] font-semibold text-slate-500">
                        {selectedFilterCategories.length === 0
                          ? 'Menampilkan semua'
                          : `${selectedFilterCategories.length} dipilih`}
                      </span>
                    </div>

                    <div className="relative">
                      <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        value={categorySearchQuery}
                        onChange={(e) => setCategorySearchQuery(e.target.value)}
                        placeholder="Cari nama kategori atau kode COA (mis. 5100)..."
                        className="w-full bg-white border border-slate-200 rounded-xl pl-8 pr-7 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      {categorySearchQuery && (
                        <button
                          type="button"
                          onClick={() => setCategorySearchQuery('')}
                          className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      <button
                        type="button"
                        onClick={() => selectAllByKind('income')}
                        className="px-2 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold border border-emerald-200 transition cursor-pointer"
                      >
                        Semua Pendapatan
                      </button>
                      <button
                        type="button"
                        onClick={() => selectAllByKind('expense')}
                        className="px-2 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold border border-amber-200 transition cursor-pointer"
                      >
                        Semua Pengeluaran
                      </button>
                      {isCategoryFilterActive && (
                        <button
                          type="button"
                          onClick={clearCategoryFilter}
                          className="px-2 py-1 rounded-lg bg-slate-200/80 hover:bg-slate-300 text-slate-700 font-bold transition cursor-pointer ml-auto"
                        >
                          Reset
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 p-2 space-y-2">
                    {/* Income Group */}
                    <div className="pt-1">
                      <p className="px-2 pb-1 text-[10px] font-extrabold uppercase tracking-wider text-emerald-700">
                        Pendapatan Operasional (4xxx)
                      </p>
                      {visibleIncomeOptions.length === 0 ? (
                        <p className="px-2 py-1.5 text-[11px] text-slate-400">
                          Tidak ada kategori pendapatan yang cocok.
                        </p>
                      ) : (
                        <div className="space-y-0.5">
                          {visibleIncomeOptions.map((opt) => {
                            const isChecked = selectedFilterCategories.some(
                              (c) => c.toLowerCase().trim() === opt.categoryName.toLowerCase()
                            );
                            return (
                              <button
                                key={`filter-inc-${opt.categoryName}`}
                                type="button"
                                onClick={() => toggleFilterCategory(opt.categoryName)}
                                className={`w-full text-left px-2.5 py-2 rounded-xl flex items-center justify-between gap-2 text-xs transition cursor-pointer ${
                                  isChecked
                                    ? 'bg-blue-50 text-blue-950 font-bold'
                                    : 'hover:bg-slate-50 text-slate-700'
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span
                                    className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                                      isChecked
                                        ? 'bg-blue-600 border-blue-600 text-white'
                                        : 'border-slate-300 bg-white'
                                    }`}
                                  >
                                    {isChecked && <Check className="h-3 w-3" />}
                                  </span>
                                  <div className="min-w-0">
                                    <p className="truncate leading-tight">{opt.categoryName}</p>
                                    <p className="text-[10px] text-slate-400 font-mono truncate">
                                      [{opt.coaInfo.coaCode}] {opt.coaInfo.coaName}
                                    </p>
                                  </div>
                                </div>
                                {opt.periodTotal > 0 && (
                                  <span className="font-mono tabular-nums text-[11px] font-bold text-emerald-700 shrink-0">
                                    {formatterIDR.format(opt.periodTotal)}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Expense Group */}
                    <div className="pt-2">
                      <p className="px-2 pb-1 text-[10px] font-extrabold uppercase tracking-wider text-amber-700">
                        Beban & Pengeluaran Operasional (5xxx)
                      </p>
                      {visibleExpenseOptions.length === 0 ? (
                        <p className="px-2 py-1.5 text-[11px] text-slate-400">
                          Tidak ada kategori pengeluaran yang cocok.
                        </p>
                      ) : (
                        <div className="space-y-0.5">
                          {visibleExpenseOptions.map((opt) => {
                            const isChecked = selectedFilterCategories.some(
                              (c) => c.toLowerCase().trim() === opt.categoryName.toLowerCase()
                            );
                            return (
                              <button
                                key={`filter-exp-${opt.categoryName}`}
                                type="button"
                                onClick={() => toggleFilterCategory(opt.categoryName)}
                                className={`w-full text-left px-2.5 py-2 rounded-xl flex items-center justify-between gap-2 text-xs transition cursor-pointer ${
                                  isChecked
                                    ? 'bg-blue-50 text-blue-950 font-bold'
                                    : 'hover:bg-slate-50 text-slate-700'
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span
                                    className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                                      isChecked
                                        ? 'bg-blue-600 border-blue-600 text-white'
                                        : 'border-slate-300 bg-white'
                                    }`}
                                  >
                                    {isChecked && <Check className="h-3 w-3" />}
                                  </span>
                                  <div className="min-w-0">
                                    <p className="truncate leading-tight">{opt.categoryName}</p>
                                    <p className="text-[10px] text-slate-400 font-mono truncate">
                                      [{opt.coaInfo.coaCode}] {opt.coaInfo.coaName}
                                    </p>
                                  </div>
                                </div>
                                {opt.periodTotal > 0 && (
                                  <span className="font-mono tabular-nums text-[11px] font-bold text-amber-700 shrink-0">
                                    {formatterIDR.format(opt.periodTotal)}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
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

        {/* Active Multi-Category Filter Summary Strip */}
        {isCategoryFilterActive && (
          <div className="rounded-xl border border-blue-200 bg-blue-50/50 px-4 py-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-bold text-slate-700 mr-1">
                  Kategori Aktif ({selectedFilterCategories.length}):
                </span>
                {selectedFilterCategories.map((catName) => {
                  const opt = categoryKindLookup.get(catName.toLowerCase().trim());
                  const coaCode =
                    opt?.coaInfo.coaCode ||
                    resolveCategoryCoaInfo(catName, masterCategories, coaList, kprCoaMapping)
                      .coaCode;
                  const isChipHoveredActive =
                    !hoveredMonthPoint ||
                    hoveredActiveCategorySet.has(catName.toLowerCase().trim());
                  return (
                    <button
                      key={`active-chip-${catName}`}
                      type="button"
                      onClick={() => toggleFilterCategory(catName)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border text-xs font-semibold text-slate-800 hover:border-rose-300 hover:text-rose-700 transition-all duration-150 cursor-pointer ${
                        !isChipHoveredActive
                          ? 'opacity-35 border-slate-200'
                          : hoveredMonthPoint
                          ? 'opacity-100 border-blue-400 ring-1 ring-blue-200'
                          : 'border-slate-200'
                      }`}
                      title="Klik untuk hapus dari filter"
                    >
                      <span className="font-mono text-[10px] font-bold text-blue-700">
                        [{coaCode}]
                      </span>
                      <span>{catName}</span>
                      <X className="h-3 w-3 text-slate-400" />
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={clearCategoryFilter}
                className="text-xs font-bold text-blue-700 hover:text-blue-900 underline cursor-pointer shrink-0"
              >
                Reset ke Semua Kategori
              </button>
            </div>
            {singleSelectedSeries && (
              <p className="text-[11px] text-slate-600">
                <span className="font-mono font-bold text-blue-700">
                  [{singleSelectedSeries.coaInfo.coaCode}] {singleSelectedSeries.coaInfo.coaName}
                </span>
                {' · '}
                {singleSelectedSeries.coaInfo.reportExplanation}
              </p>
            )}
            {selectedFilterCategories.length > MAX_VISUAL_SERIES && (
              <p className="text-[11px] text-slate-500">
                Menampilkan {MAX_VISUAL_SERIES} kategori dengan nominal terbesar pada grafik; KPI dan tabel tetap menghitung seluruh {selectedFilterCategories.length} kategori terpilih.
              </p>
            )}
          </div>
        )}

        {/* Compact AI Performance Summary Strip directly below category filter bar */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3.5 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <Sparkles className="h-4 w-4 text-blue-600 shrink-0" />
              <span className="text-xs font-black text-slate-900 tracking-tight">
                Ringkasan Performa AI
              </span>
              <span className="text-[11px] text-slate-500 truncate">
                ·{' '}
                {isCategoryFilterActive
                  ? `${selectedFilterCategories.length} kategori terpilih`
                  : 'Semua kategori operasional'}{' '}
                · {activePeriodMeta.label}
              </span>
              {aiSummary?.generatedAt && !aiLoading && !aiError && (
                <span className="text-[10px] font-mono text-slate-400">
                  ({aiSummary.generatedAt})
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => setAiRefreshNonce((prev) => prev + 1)}
              disabled={aiLoading || !hasAnyTransactionsInRange}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed text-[11px] font-bold text-slate-700 transition cursor-pointer shrink-0"
              title="Perbarui analisis ringkasan AI untuk filter aktif"
            >
              <RefreshCw className={`h-3 w-3 ${aiLoading ? 'animate-spin text-blue-600' : ''}`} />
              <span>{aiLoading ? 'Menganalisis...' : 'Muat Ulang'}</span>
            </button>
          </div>

          {!hasAnyTransactionsInRange ? (
            <p className="text-xs text-slate-500">
              Belum ada transaksi pada kombinasi periode dan kategori aktif untuk dirangkum oleh AI.
            </p>
          ) : aiLoading ? (
            <div className="space-y-2 py-0.5" aria-busy="true" aria-label="Memuat ringkasan AI">
              <div className="h-3.5 w-2/3 bg-slate-200/80 rounded" />
              <div className="h-3 w-full bg-slate-200/60 rounded" />
            </div>
          ) : aiError ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50/70 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-rose-700">
              <span className="flex items-center gap-1.5 min-w-0">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span className="leading-snug">{aiError}</span>
              </span>
              <button
                type="button"
                onClick={() => setAiRefreshNonce((prev) => prev + 1)}
                className="px-2.5 py-1 rounded-md bg-white border border-rose-200 hover:bg-rose-100 text-[11px] font-bold text-rose-700 transition cursor-pointer shrink-0"
              >
                Coba Lagi
              </button>
            </div>
          ) : aiSummary ? (
            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-900 leading-snug">
                {aiSummary.headline}
              </p>
              <p className="text-xs text-slate-600 leading-relaxed">
                {aiSummary.trendExplanation}
              </p>
              {aiSummary.keyDrivers.length > 0 && (
                <ul className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-0.5">
                  {aiSummary.keyDrivers.map((driver, idx) => (
                    <li
                      key={`ai-driver-${idx}`}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] text-slate-700 leading-snug"
                    >
                      {driver}
                    </li>
                  ))}
                </ul>
              )}
              {aiSummary.actionableNote && (
                <p className="text-[11px] text-slate-700 font-medium pt-0.5">
                  <span className="font-bold text-blue-700">Catatan:</span>{' '}
                  {aiSummary.actionableNote}
                </p>
              )}
            </div>
          ) : null}
        </div>

        {/* 4-KPI Period Summary Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Total Pendapatan ({activePeriodMeta.label})
            </p>
            <p className="text-lg font-black text-emerald-700 font-mono tabular-nums mt-1">
              {formatterIDR.format(filteredSeries.totalIncome6M)}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              {isCategoryFilterActive
                ? 'Pendapatan kategori terpilih'
                : 'Akumulasi pendapatan operasional'}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Total Pengeluaran ({activePeriodMeta.label})
            </p>
            <p className="text-lg font-black text-amber-700 font-mono tabular-nums mt-1">
              {formatterIDR.format(filteredSeries.totalExpense6M)}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              {isCategoryFilterActive
                ? 'Pengeluaran kategori terpilih'
                : 'Beban operasional & bunga pinjaman'}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Akumulasi Laba / Rugi ({activePeriodMeta.label})
            </p>
            <p
              className={`text-lg font-black font-mono tabular-nums mt-1 ${
                filteredSeries.netProfitLoss6M >= 0 ? 'text-blue-700' : 'text-rose-700'
              }`}
            >
              {filteredSeries.netProfitLoss6M < 0 ? '-' : '+'}
              {formatterIDR.format(Math.abs(filteredSeries.netProfitLoss6M))}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              {filteredSeries.surplusMonthsCount} bln surplus ·{' '}
              {filteredSeries.deficitMonthsCount} bln defisit
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Rata-rata Margin Bersih
            </p>
            <p
              className={`text-lg font-black font-mono tabular-nums mt-1 ${
                filteredSeries.avgMarginPct6M >= 0 ? 'text-slate-900' : 'text-rose-700'
              }`}
            >
              {filteredSeries.avgMarginPct6M.toFixed(1)}%
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              Rasio Laba Bersih terhadap Pendapatan
            </p>
          </div>
        </div>
      </div>

      {/* Recharts Line Chart: Net Profit Trend OR Multi-Category Comparison Trend */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-black text-slate-900">
              {activeChartSeries.length > 1
                ? `Perbandingan Tren Kategori Terpilih (${activePeriodMeta.badgeText})`
                : singleSelectedSeries
                ? `Tren Kategori: [${singleSelectedSeries.coaInfo.coaCode}] ${singleSelectedSeries.categoryName} (${activePeriodMeta.badgeText})`
                : `Tren Pertumbuhan Laba Bersih (${activePeriodMeta.badgeText})`}
            </h4>
            <p className="text-xs text-slate-500 mt-0.5">
              {activeChartSeries.length > 1
                ? 'Menampilkan seri garis terpisah untuk membandingkan pergerakan MoM antar kategori terpilih.'
                : singleSelectedSeries
                ? 'Melacak pergerakan nominal kategori terpilih dari bulan ke bulan beserta perubahan MoM pada tooltip.'
                : 'Melacak pergerakan Laba / Rugi bersih dari bulan ke bulan. Klik titik bulan untuk menyinkronkan tabel dan rincian kategori.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {hoveredMonthPoint && (
              <span className="text-[11px] font-semibold text-blue-700">
                Sorotan {hoveredMonthPoint.monthLabel}: {hoveredActiveCategorySet.size} kategori aktif
              </span>
            )}
            {!isCategoryFilterActive &&
              latestTrendPoint &&
              latestTrendPoint.momDeltaAmount !== null && (
                <div className="flex items-center gap-2 text-xs shrink-0">
                  <span className="text-slate-500">Perubahan MoM terakhir:</span>
                  <span
                    className={`inline-flex items-center gap-1 font-mono tabular-nums font-black ${
                      latestTrendPoint.momDeltaAmount >= 0 ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                  >
                    {latestTrendPoint.momDeltaAmount >= 0 ? (
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    ) : (
                      <ArrowDownRight className="h-3.5 w-3.5" />
                    )}
                    {latestTrendPoint.momDeltaAmount < 0 ? '-' : '+'}
                    {formatterIDR.format(Math.abs(latestTrendPoint.momDeltaAmount))}
                    {latestTrendPoint.momGrowthPct !== null && (
                      <span className="font-semibold text-[11px]">
                        ({latestTrendPoint.momGrowthPct >= 0 ? '+' : ''}
                        {latestTrendPoint.momGrowthPct.toFixed(1)}%)
                      </span>
                    )}
                  </span>
                </div>
              )}
          </div>
        </div>

        <div
          className="w-full h-[255px]"
          onMouseLeave={() => setHoveredMonthKey(null)}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={trendChartData}
              margin={{ top: 14, right: 16, left: 8, bottom: 8 }}
              onMouseMove={(chartState: unknown) => {
                const state = chartState as
                  | {
                      activeLabel?: string;
                      activeTooltipIndex?: number;
                      activePayload?: Array<{ payload?: NetProfitTrendPoint }>;
                    }
                  | undefined;
                const payloadKey = state?.activePayload?.[0]?.payload?.monthKey;
                if (payloadKey) {
                  setHoveredMonthKey((prev) => (prev === payloadKey ? prev : payloadKey));
                  return;
                }
                if (state?.activeLabel) {
                  const matched = trendChartData.find((pt) => pt.monthLabel === state.activeLabel);
                  if (matched) {
                    setHoveredMonthKey((prev) =>
                      prev === matched.monthKey ? prev : matched.monthKey
                    );
                  }
                  return;
                }
                if (
                  typeof state?.activeTooltipIndex === 'number' &&
                  trendChartData[state.activeTooltipIndex]
                ) {
                  const mk = trendChartData[state.activeTooltipIndex].monthKey;
                  setHoveredMonthKey((prev) => (prev === mk ? prev : mk));
                }
              }}
              onMouseLeave={() => setHoveredMonthKey(null)}
              onClick={(chartState) => {
                const activeLabel = (chartState as { activeLabel?: string } | undefined)?.activeLabel;
                if (!activeLabel) return;
                const matched = trendChartData.find((pt) => pt.monthLabel === activeLabel);
                if (matched) setSelectedMonthKey(matched.monthKey);
              }}
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
                tickFormatter={formatCompactAxisIDR}
                tick={{ fontSize: 11, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                width={68}
              />
              <ReferenceLine y={0} stroke="#64748b" strokeDasharray="4 4" strokeWidth={1.25} />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const pt = payload[0]?.payload as NetProfitTrendPoint | undefined;
                  if (!pt) return null;

                  // Multi-category or single-category tooltip with MoM
                  if (activeChartSeries.length > 0) {
                    return (
                      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-md text-xs space-y-2 min-w-[260px]">
                        <div className="font-black text-slate-900 border-b border-slate-100 pb-1 flex items-center justify-between gap-2">
                          <span>{pt.fullMonthLabel}</span>
                          <span className="text-[10px] font-semibold text-slate-500">
                            {pt.txCount} transaksi
                          </span>
                        </div>
                        <div className="space-y-1.5">
                          {activeChartSeries.map((s) => {
                            const val = Number(pt[s.dataKey] ?? 0);
                            const mom = pt.momByDataKey[s.dataKey];
                            return (
                              <div key={`tip-line-${s.dataKey}`} className="space-y-0.5">
                                <div className="flex items-center justify-between gap-3">
                                  <span className="flex items-center gap-1.5 min-w-0">
                                    <span
                                      className="w-2.5 h-2.5 rounded-full shrink-0"
                                      style={{ backgroundColor: s.color }}
                                    />
                                    <span className="font-mono text-[10px] font-bold text-slate-500 shrink-0">
                                      [{s.coaInfo.coaCode}]
                                    </span>
                                    <span className="font-semibold text-slate-800 truncate max-w-[130px]">
                                      {s.categoryName}
                                    </span>
                                  </span>
                                  <span className="font-mono tabular-nums font-bold text-slate-900 shrink-0">
                                    {formatterIDR.format(val)}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between text-[10px] pl-4 text-slate-500">
                                  <span>MoM:</span>
                                  {!mom || mom.delta === null ? (
                                    <span>Periode awal</span>
                                  ) : (
                                    <span
                                      className={`font-mono tabular-nums font-semibold ${
                                        mom.delta >= 0 ? 'text-emerald-700' : 'text-rose-700'
                                      }`}
                                    >
                                      {mom.delta < 0 ? '-' : '+'}
                                      {formatterIDR.format(Math.abs(mom.delta))}
                                      {mom.pct !== null
                                        ? ` (${mom.pct >= 0 ? '+' : ''}${mom.pct.toFixed(1)}%)`
                                        : ''}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  }

                  // Default Net Profit MoM tooltip
                  const isProfit = pt.netProfitLoss >= 0;
                  const momDelta = pt.momDeltaAmount;
                  const momPct = pt.momGrowthPct;
                  return (
                    <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-md text-xs space-y-1.5 min-w-[235px]">
                      <div className="font-black text-slate-900 border-b border-slate-100 pb-1 flex items-center justify-between gap-2">
                        <span>{pt.fullMonthLabel}</span>
                        <span className="text-[10px] font-semibold text-slate-500">
                          {pt.txCount} transaksi
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-slate-600">
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
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-slate-600">Perubahan MoM:</span>
                        {momDelta === null ? (
                          <span className="text-slate-400 font-medium">Periode awal</span>
                        ) : (
                          <span
                            className={`font-mono tabular-nums font-bold ${
                              momDelta >= 0 ? 'text-emerald-700' : 'text-rose-700'
                            }`}
                          >
                            {momDelta < 0 ? '-' : '+'}
                            {formatterIDR.format(Math.abs(momDelta))}
                            {momPct !== null
                              ? ` (${momPct >= 0 ? '+' : ''}${momPct.toFixed(1)}%)`
                              : ' (Baru)'}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-4 text-[11px] text-slate-500 border-t border-slate-100 pt-1">
                        <span>Margin Bersih:</span>
                        <span className="font-mono tabular-nums font-semibold">
                          {pt.marginPct.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  );
                }}
              />

              {activeChartSeries.length > 0 ? (
                <>
                  {activeChartSeries.map((s) => {
                    const isSeriesActiveInHoveredMonth =
                      !hoveredMonthPoint ||
                      hoveredActiveCategorySet.has(s.categoryName.toLowerCase().trim());

                    return (
                      <Line
                        key={s.dataKey}
                        type="monotone"
                        dataKey={s.dataKey}
                        name={`[${s.coaInfo.coaCode}] ${s.categoryName}`}
                        stroke={s.color}
                        strokeOpacity={isSeriesActiveInHoveredMonth ? 1 : 0.14}
                        strokeWidth={
                          hoveredMonthPoint && isSeriesActiveInHoveredMonth
                            ? 3.25
                            : isSeriesActiveInHoveredMonth
                            ? 2.5
                            : 1.5
                        }
                        dot={(dotProps: {
                          cx?: number;
                          cy?: number;
                          payload?: NetProfitTrendPoint;
                          index?: number;
                        }) => {
                          const { cx, cy, payload, index } = dotProps;
                          if (typeof cx !== 'number' || typeof cy !== 'number' || !payload) {
                            return <g key={`empty-series-dot-${s.dataKey}-${index ?? 0}`} />;
                          }
                          const val = Number(payload[s.dataKey] ?? 0);
                          const isHoveredMonth = payload.monthKey === hoveredMonthKey;
                          const isPointHighlighted =
                            hoveredMonthPoint !== null && isHoveredMonth && val > 0;
                          const dotOpacity = isSeriesActiveInHoveredMonth ? 1 : 0.16;

                          return (
                            <circle
                              key={`series-dot-${s.dataKey}-${payload.monthKey}`}
                              cx={cx}
                              cy={cy}
                              r={isPointHighlighted ? 6.5 : isSeriesActiveInHoveredMonth ? 4 : 3}
                              fill={s.color}
                              fillOpacity={dotOpacity}
                              stroke={isPointHighlighted ? '#0f172a' : '#ffffff'}
                              strokeOpacity={dotOpacity}
                              strokeWidth={isPointHighlighted ? 2.5 : 2}
                              className="cursor-pointer"
                              onMouseEnter={() => setHoveredMonthKey(payload.monthKey)}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedMonthKey(payload.monthKey);
                              }}
                            />
                          );
                        }}
                        activeDot={
                          isSeriesActiveInHoveredMonth
                            ? {
                                r: 6.5,
                                stroke: '#0f172a',
                                strokeWidth: 2,
                                fill: s.color,
                                cursor: 'pointer',
                              }
                            : false
                        }
                      />
                    );
                  })}
                </>
              ) : (
                <Line
                  type="monotone"
                  dataKey="netProfitLoss"
                  name="Laba Bersih"
                  stroke="#2563eb"
                  strokeWidth={2.5}
                  dot={(dotProps: { cx?: number; cy?: number; payload?: NetProfitTrendPoint; index?: number }) => {
                    const { cx, cy, payload, index } = dotProps;
                    if (typeof cx !== 'number' || typeof cy !== 'number' || !payload) {
                      return <g key={`empty-dot-${index ?? 0}`} />;
                    }
                    const isSelected = payload.monthKey === selectedMonthData.monthKey;
                    const isHovered = payload.monthKey === hoveredMonthKey;
                    const isDimmedByHover = hoveredMonthKey !== null && !isHovered;
                    const isLoss = payload.netProfitLoss < 0;
                    const fillColor = isLoss ? '#e11d48' : '#2563eb';
                    return (
                      <circle
                        key={`trend-dot-${payload.monthKey}`}
                        cx={cx}
                        cy={cy}
                        r={isHovered ? 7 : isSelected ? 6 : 4}
                        fill={fillColor}
                        fillOpacity={isDimmedByHover ? 0.4 : 1}
                        stroke={isHovered || isSelected ? '#0f172a' : '#ffffff'}
                        strokeOpacity={isDimmedByHover ? 0.4 : 1}
                        strokeWidth={isHovered || isSelected ? 2.5 : 2}
                        className="cursor-pointer"
                        onMouseEnter={() => setHoveredMonthKey(payload.monthKey)}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedMonthKey(payload.monthKey);
                        }}
                      />
                    );
                  }}
                  activeDot={{
                    r: 7,
                    stroke: '#0f172a',
                    strokeWidth: 2,
                    fill: '#2563eb',
                    cursor: 'pointer',
                  }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Synchronized Hover Legend for Multi-Series Category Lines */}
        {activeChartSeries.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
            {activeChartSeries.map((s) => {
              const isSeriesActiveInHoveredMonth =
                !hoveredMonthPoint ||
                hoveredActiveCategorySet.has(s.categoryName.toLowerCase().trim());
              const hoveredTrendRow = hoveredMonthPoint
                ? trendChartData.find((pt) => pt.monthKey === hoveredMonthPoint.monthKey)
                : null;
              const hoveredSeriesVal = hoveredTrendRow
                ? Number(hoveredTrendRow[s.dataKey] ?? 0)
                : null;

              return (
                <div
                  key={`line-legend-${s.dataKey}`}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] transition-all duration-150 ${
                    !isSeriesActiveInHoveredMonth
                      ? 'opacity-30 border-slate-200 bg-white'
                      : hoveredMonthPoint
                      ? 'opacity-100 border-blue-300 bg-blue-50/50 font-bold text-slate-900'
                      : 'border-slate-200 bg-slate-50/70 text-slate-700 font-semibold'
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: s.color }}
                  />
                  <span className="font-mono text-[10px] font-bold text-slate-500">
                    [{s.coaInfo.coaCode}]
                  </span>
                  <span className="truncate max-w-[140px]">{s.categoryName}</span>
                  {hoveredSeriesVal !== null && (
                    <span className="font-mono tabular-nums text-[10px] font-bold text-slate-900 pl-0.5">
                      {formatterIDR.format(hoveredSeriesVal)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recharts Bar Chart: 3-Series OR Per-Category Grouped Bars */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-black text-slate-900">
              {activeChartSeries.length > 0
                ? `Grafik Batang Perbandingan Kategori (${activePeriodMeta.badgeText})`
                : `Grafik Perbandingan Laba / Rugi Bulanan (${activePeriodMeta.badgeText})`}
            </h4>
            <p className="text-xs text-slate-500 mt-0.5">
              {activeChartSeries.length > 0
                ? 'Menampilkan batang terpisah per kategori terpilih setiap bulan untuk memudahkan perbandingan besaran nominal.'
                : 'Menampilkan seri Pendapatan, Pengeluaran, dan Laba/Rugi bersih per bulan. Klik batang atau baris tabel untuk memeriksa rincian kategori.'}
            </p>
          </div>

          {activeChartSeries.length === 0 && (
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
          )}
        </div>

        {!hasAnyTransactionsInRange && (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
            {isCategoryFilterActive ? (
              <>
                Belum ada transaksi untuk kategori terpilih pada rentang{' '}
                <span className="font-bold">{activePeriodMeta.badgeText}</span>.
              </>
            ) : (
              <>
                Belum ada transaksi tercatat pada rentang{' '}
                <span className="font-bold">{activePeriodMeta.badgeText}</span>. Tambahkan transaksi atau pilih rentang waktu lain untuk melihat perbandingan grafik.
              </>
            )}
          </div>
        )}

        <div className="w-full h-[340px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={trendChartData}
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
                tickFormatter={formatCompactAxisIDR}
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
                  const pt = payload[0]?.payload as NetProfitTrendPoint | undefined;
                  if (!pt) return null;

                  if (activeChartSeries.length > 0) {
                    return (
                      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-md text-xs space-y-1.5 min-w-[250px]">
                        <div className="font-black text-slate-900 border-b border-slate-100 pb-1 flex items-center justify-between gap-2">
                          <span>{pt.fullMonthLabel}</span>
                          <span className="text-[10px] font-semibold text-slate-500">
                            {pt.txCount} transaksi
                          </span>
                        </div>
                        {activeChartSeries.map((s) => {
                          const val = Number(pt[s.dataKey] ?? 0);
                          return (
                            <div
                              key={`tip-bar-${s.dataKey}`}
                              className="flex items-center justify-between gap-3"
                            >
                              <span className="flex items-center gap-1.5 min-w-0">
                                <span
                                  className="w-2.5 h-2.5 rounded-xs shrink-0"
                                  style={{ backgroundColor: s.color }}
                                />
                                <span className="font-mono text-[10px] font-bold text-slate-500 shrink-0">
                                  [{s.coaInfo.coaCode}]
                                </span>
                                <span className="text-slate-700 font-medium truncate max-w-[130px]">
                                  {s.categoryName}
                                </span>
                              </span>
                              <span className="font-mono tabular-nums font-bold text-slate-900 shrink-0">
                                {formatterIDR.format(val)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  }

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
              <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />

              {activeChartSeries.length > 0 ? (
                activeChartSeries.map((s) => (
                  <Bar
                    key={`bar-${s.dataKey}`}
                    dataKey={s.dataKey}
                    name={`[${s.coaInfo.coaCode}] ${s.categoryName}`}
                    fill={s.color}
                    radius={[6, 6, 0, 0]}
                    maxBarSize={monthsCount > 8 ? 16 : 26}
                    className="cursor-pointer"
                    onClick={(barData) => {
                      const mk = (barData as { monthKey?: string } | undefined)?.monthKey;
                      if (mk) setSelectedMonthKey(mk);
                    }}
                  />
                ))
              ) : (
                <>
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
                    {filteredSeries.months.map((entry) => (
                      <Cell
                        key={`net-cell-${entry.monthKey}`}
                        fill={entry.netProfitLoss >= 0 ? '#2563eb' : '#e11d48'}
                      />
                    ))}
                  </Bar>
                </>
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Interactive Monthly Summary Table + Selected Month Category Breakdown with COA Explanations */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left: Interactive Monthly Summary Table */}
        <div className="xl:col-span-7 bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-2">
            <div>
              <h4 className="text-sm font-black text-slate-900">
                Tabel Rekap Laba-Rugi per Bulan
                {isCategoryFilterActive && ' (Terfilter)'}
              </h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Klik baris bulan untuk menampilkan rincian kategori, kode COA, dan transaksi pemicunya.
              </p>
            </div>
            <span className="text-xs font-semibold text-slate-500 shrink-0">
              {filteredSeries.months.length} bulan
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
                {filteredSeries.months.map((m) => {
                  const isSelected = m.monthKey === selectedMonthData.monthKey;
                  const isRowExpanded = expandedTableMonthKey === m.monthKey;
                  const isHoveredTableRow = hoveredMonthKey === m.monthKey;
                  const isDimmedByHover = hoveredMonthKey !== null && !isHoveredTableRow;
                  const isProfit = m.netProfitLoss > 0;
                  const isLoss = m.netProfitLoss < 0;
                  return (
                    <React.Fragment key={m.monthKey}>
                      <tr
                        tabIndex={0}
                        aria-selected={isSelected}
                        aria-expanded={isRowExpanded}
                        onClick={() => handleTableRowClick(m.monthKey)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleTableRowClick(m.monthKey);
                          }
                        }}
                        className={`cursor-pointer transition-all duration-150 focus:outline-none focus-visible:bg-blue-50 ${
                          isDimmedByHover ? 'opacity-45' : 'opacity-100'
                        } ${
                          isHoveredTableRow
                            ? 'bg-blue-50/90 ring-1 ring-inset ring-blue-300'
                            : isRowExpanded || isSelected
                            ? 'bg-blue-50/80 hover:bg-blue-50'
                            : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            {isRowExpanded ? (
                              <ChevronDown className="h-4 w-4 text-blue-600 shrink-0" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
                            )}
                            <div>
                              <p
                                className={`font-bold ${
                                  isRowExpanded || isSelected ? 'text-blue-900' : 'text-slate-800'
                                }`}
                              >
                                {m.fullMonthLabel}
                              </p>
                              <p className="text-[10px] text-slate-400">
                                {m.txCount} transaksi
                              </p>
                            </div>
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

                      {isRowExpanded && (
                        <tr className="bg-slate-50/90">
                          <td colSpan={6} className="p-4 border-t border-slate-200">
                            <div className="space-y-4">
                              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200">
                                <div>
                                  <p className="text-xs font-black text-slate-900">
                                    Rincian Kategori, COA & Transaksi — {m.fullMonthLabel}
                                  </p>
                                  <p className="text-[11px] text-slate-500 font-mono tabular-nums mt-0.5">
                                    {formatterIDR.format(m.totalIncome)} −{' '}
                                    {formatterIDR.format(m.totalExpense)} ={' '}
                                    <span
                                      className={`font-bold ${
                                        isLoss
                                          ? 'text-rose-700'
                                          : isProfit
                                          ? 'text-blue-700'
                                          : 'text-slate-700'
                                      }`}
                                    >
                                      {isLoss ? '-' : isProfit ? '+' : ''}
                                      {formatterIDR.format(Math.abs(m.netProfitLoss))}
                                    </span>
                                    <span className="font-sans text-slate-400 ml-2">
                                      · Klik kategori untuk buka penjelasan COA & transaksi
                                    </span>
                                  </p>
                                </div>

                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setExpandedTableMonthKey(null);
                                  }}
                                  className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-[11px] font-bold text-slate-600 transition cursor-pointer whitespace-nowrap shrink-0"
                                >
                                  Tutup Rincian
                                </button>
                              </div>

                              <div className="space-y-4">
                                {renderTableAccordionGroup(
                                  m.incomeCategories,
                                  m.totalIncome,
                                  'income'
                                )}
                                {renderTableAccordionGroup(
                                  m.expenseCategories,
                                  m.totalExpense,
                                  'expense'
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-900 text-white text-xs font-bold">
                  <td className="py-3 px-4">Total {activePeriodMeta.label}</td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-300">
                    {formatterIDR.format(filteredSeries.totalIncome6M)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-amber-300">
                    {formatterIDR.format(filteredSeries.totalExpense6M)}
                  </td>
                  <td
                    className={`py-3 px-4 text-right font-mono tabular-nums font-black ${
                      filteredSeries.netProfitLoss6M >= 0 ? 'text-blue-300' : 'text-rose-300'
                    }`}
                  >
                    {filteredSeries.netProfitLoss6M < 0 ? '-' : '+'}
                    {formatterIDR.format(Math.abs(filteredSeries.netProfitLoss6M))}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums">
                    {filteredSeries.avgMarginPct6M.toFixed(1)}%
                  </td>
                  <td className="py-3 px-4 text-center text-[10px] text-slate-300">
                    Agregat
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Right: Selected Month Category Breakdown + COA & Inline Transaction Drilldown */}
        <div className="xl:col-span-5 bg-white p-5 rounded-2xl border border-slate-200 space-y-5">
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3.5">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-blue-600">
                Rincian Kategori & COA Bulan Terpilih
              </p>
              <h4 className="text-base font-black text-slate-900 mt-0.5">
                {selectedMonthData.fullMonthLabel}
              </h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {selectedMonthData.txCount} transaksi tercatat · Klik kategori untuk lihat pos COA & transaksi
              </p>
              {hoveredMonthPoint && (
                <p className="text-[11px] font-semibold text-blue-700 mt-1">
                  Menyorot kategori aktif pada {hoveredMonthPoint.fullMonthLabel} ({hoveredActiveCategorySet.size} kategori)
                </p>
              )}
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

          {/* Operating Income Categories with Drilldown */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs font-extrabold text-slate-800 px-1">
              <span className="flex items-center gap-1.5">
                <ArrowUpRight className="h-4 w-4 text-emerald-600" />
                Pendapatan Operasional (4xxx)
              </span>
              <span className="font-mono tabular-nums text-emerald-700">
                {formatterIDR.format(selectedMonthData.totalIncome)}
              </span>
            </div>

            {selectedMonthData.incomeCategories.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                {isCategoryFilterActive
                  ? 'Tidak ada transaksi pendapatan pada kategori terpilih di bulan ini.'
                  : 'Belum ada pendapatan operasional tercatat pada bulan ini.'}
              </div>
            ) : (
              renderCategoryDrilldownList(selectedMonthData.incomeCategories, 'income')
            )}
          </div>

          {/* Operating Expense Categories with Drilldown */}
          <div className="space-y-2.5 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between text-xs font-extrabold text-slate-800 px-1">
              <span className="flex items-center gap-1.5">
                <ArrowDownRight className="h-4 w-4 text-amber-600" />
                Beban & Pengeluaran Operasional (5xxx)
              </span>
              <span className="font-mono tabular-nums text-amber-700">
                {formatterIDR.format(selectedMonthData.totalExpense)}
              </span>
            </div>

            {selectedMonthData.expenseCategories.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                {isCategoryFilterActive
                  ? 'Tidak ada transaksi pengeluaran pada kategori terpilih di bulan ini.'
                  : 'Belum ada pengeluaran operasional tercatat pada bulan ini.'}
              </div>
            ) : (
              renderCategoryDrilldownList(selectedMonthData.expenseCategories, 'expense')
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

          {/* Compact Accounting Guide: How Master Categories & COA connect to this report */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-2 text-[11px] text-slate-600">
            <div className="flex items-center gap-1.5 font-extrabold text-slate-800">
              <Info className="h-3.5 w-3.5 text-blue-600 shrink-0" />
              <span>Cara Membaca Keterkaitan Kategori & COA di Laporan Ini</span>
            </div>
            <ul className="space-y-1 leading-relaxed">
              <li>
                <span className="font-mono font-bold text-emerald-700">[4100–4400]</span>{' '}
                <strong className="text-slate-800">Pendapatan Operasional:</strong> Gaji, usaha sampingan, bunga bank, dan hasil investasi yang menambah Laba Bersih.
              </li>
              <li>
                <span className="font-mono font-bold text-amber-700">[5100–5960]</span>{' '}
                <strong className="text-slate-800">Beban Operasional:</strong> Konsumsi, tagihan, transportasi, bunga KPR (<span className="font-mono">[5810]</span>), dan penyusutan non-kas (<span className="font-mono">[5950/5960]</span>).
              </li>
              <li>
                <span className="font-mono font-bold text-slate-600">[1xxx–3xxx]</span>{' '}
                <strong className="text-slate-800">Pos Neraca (Dikecualikan):</strong> Transfer antar akun, alokasi dana darurat/investasi, serta pelunasan pokok utang/KPR dicatat langsung di Neraca agar Laba-Rugi tetap murni.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
