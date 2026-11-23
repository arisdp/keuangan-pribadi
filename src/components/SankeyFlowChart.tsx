import React, { useEffect, useMemo, useState } from 'react';
import { Account, Debt, Transaction } from '../types';
import { normalizeLedgerDateYYYYMMDD } from '../utils/accountingEngine';
import {
  aggregatePeriodCashFlow,
  filterTransactionsBySankeyPeriod,
  formatMonthLabelID,
  getAvailablePeriodOptions,
  getPeriodRangeLabel,
  QUARTER_LABELS,
  QuarterNum,
  SankeyLedgerEntry,
  SankeyPeriodMode,
} from '../utils/cashFlowSankey';
import { formatterIDR } from '../utils/formatters';
import { sankey as d3Sankey, sankeyLinkHorizontal, SankeyNode, SankeyLink } from 'd3-sankey';
import {
  GitCommit,
  AlertTriangle,
  CheckCircle2,
  Zap,
  Calendar,
  Search,
  RotateCcw,
  ArrowRight,
  Info,
} from 'lucide-react';

interface SankeyFlowChartProps {
  transactions: Transaction[];
  accounts?: Account[];
  debts?: Debt[];
  periodMode?: SankeyPeriodMode;
  onPeriodModeChange?: (mode: SankeyPeriodMode) => void;
  selectedMonth?: string;
  onSelectedMonthChange?: (monthKey: string) => void;
  selectedQuarter?: QuarterNum;
  onSelectedQuarterChange?: (q: QuarterNum) => void;
  selectedYear?: string;
  onSelectedYearChange?: (yr: string) => void;
  hidePeriodControls?: boolean;
  hideInlineSummaryStrip?: boolean;
}

interface CustomSankeyNodeExtra {
  id: string;
  name: string;
  categoryType: 'income' | 'pool' | 'expense' | 'savings' | 'investment' | 'debt';
  color: string;
}

interface CustomSankeyLinkExtra {
  source: number | CustomSankeyNode;
  target: number | CustomSankeyNode;
  value: number;
  linkKey?: string;
}

type CustomSankeyNode = SankeyNode<CustomSankeyNodeExtra, CustomSankeyLinkExtra>;
type CustomSankeyLink = SankeyLink<CustomSankeyNodeExtra, CustomSankeyLinkExtra>;

type PinnedSelection =
  | { kind: 'node'; nodeId: string }
  | { kind: 'link'; sourceId: string; targetId: string }
  | null;

export const SankeyFlowChart: React.FC<SankeyFlowChartProps> = ({
  transactions,
  accounts = [],
  debts = [],
  periodMode: controlledPeriodMode,
  onPeriodModeChange,
  selectedMonth: controlledMonth,
  onSelectedMonthChange,
  selectedQuarter: controlledQuarter,
  onSelectedQuarterChange,
  selectedYear: controlledYear,
  onSelectedYearChange,
  hidePeriodControls = false,
  hideInlineSummaryStrip = false,
}) => {
  const {
    availableMonthKeys,
    availableYears,
    currentLocalMonth,
    currentLocalYear,
    currentLocalQuarter,
  } = useMemo(() => getAvailablePeriodOptions(transactions), [transactions]);

  const [hoveredNode, setHoveredNode] = useState<CustomSankeyNode | null>(null);
  const [hoveredLink, setHoveredLink] = useState<CustomSankeyLink | null>(null);
  const [pinnedSelection, setPinnedSelection] = useState<PinnedSelection>(null);

  const [internalPeriodMode, setInternalPeriodMode] = useState<SankeyPeriodMode>('all');
  const [internalMonth, setInternalMonth] = useState<string>(
    () => availableMonthKeys[0] || currentLocalMonth
  );
  const [internalYear, setInternalYear] = useState<string>(
    () => availableYears[0] || currentLocalYear
  );
  const [internalQuarter, setInternalQuarter] = useState<QuarterNum>(currentLocalQuarter);

  const periodMode = controlledPeriodMode ?? internalPeriodMode;
  const selectedMonth = controlledMonth ?? internalMonth;
  const selectedYear = controlledYear ?? internalYear;
  const selectedQuarter = controlledQuarter ?? internalQuarter;

  const setPeriodMode = (next: SankeyPeriodMode) => {
    if (onPeriodModeChange) onPeriodModeChange(next);
    else setInternalPeriodMode(next);
  };
  const setSelectedMonth = (next: string) => {
    if (onSelectedMonthChange) onSelectedMonthChange(next);
    else setInternalMonth(next);
  };
  const setSelectedYear = (next: string) => {
    if (onSelectedYearChange) onSelectedYearChange(next);
    else setInternalYear(next);
  };
  const setSelectedQuarter = (next: QuarterNum) => {
    if (onSelectedQuarterChange) onSelectedQuarterChange(next);
    else setInternalQuarter(next);
  };

  const [selectedSubCategory, setSelectedSubCategory] = useState<string | null>(null);
  const [drilldownSearch, setDrilldownSearch] = useState<string>('');

  useEffect(() => {
    if (!controlledMonth && availableMonthKeys.length > 0 && !availableMonthKeys.includes(internalMonth)) {
      setInternalMonth(availableMonthKeys[0]);
    }
  }, [controlledMonth, availableMonthKeys, internalMonth]);

  useEffect(() => {
    if (!controlledYear && availableYears.length > 0 && !availableYears.includes(internalYear)) {
      setInternalYear(availableYears[0]);
    }
  }, [controlledYear, availableYears, internalYear]);

  // Reset active drill-down cleanly when period filter changes externally or internally
  useEffect(() => {
    setPinnedSelection(null);
    setSelectedSubCategory(null);
    setDrilldownSearch('');
  }, [periodMode, selectedMonth, selectedQuarter, selectedYear]);

  const periodRangeLabel = useMemo(
    () => getPeriodRangeLabel(periodMode, selectedMonth, selectedQuarter, selectedYear),
    [periodMode, selectedMonth, selectedQuarter, selectedYear]
  );

  const filteredTransactions = useMemo(
    () =>
      filterTransactionsBySankeyPeriod(
        transactions,
        periodMode,
        selectedMonth,
        selectedQuarter,
        selectedYear
      ),
    [transactions, periodMode, selectedMonth, selectedQuarter, selectedYear]
  );

  const accountLookup = useMemo(() => {
    const map = new Map<string, Account>();
    accounts.forEach((a) => map.set(a.id, a));
    return map;
  }, [accounts]);

  // 1. Construct Sankey graph data + exact transaction drill-down buckets
  const sankeyData = useMemo(() => {
    const agg = aggregatePeriodCashFlow(filteredTransactions, debts);
    const {
      incomeCategoryMap,
      expenseCategoryMap,
      savingEntries,
      investmentEntries,
      debtEntries,
      allIncomeEntries,
      allExpenseEntries,
      totalIncome,
      totalExpense,
      totalDebtPayment,
      totalSaving,
      totalInvestment,
      totalAllocatedOutflow,
      rawNetBalance,
      netSurplus,
      netDeficit,
    } = agg;

    const nodesExtra: CustomSankeyNodeExtra[] = [];
    const linksExtra: { source: number; target: number; value: number; linkKey: string }[] = [];
    const nodeIndexMap = new Map<string, number>();
    const nodeTransactionsMap = new Map<string, SankeyLedgerEntry[]>();
    const linkTransactionsMap = new Map<string, SankeyLedgerEntry[]>();

    const addNode = (
      id: string,
      name: string,
      categoryType: CustomSankeyNodeExtra['categoryType'],
      color: string,
      entries: SankeyLedgerEntry[]
    ) => {
      if (nodeIndexMap.has(id)) return nodeIndexMap.get(id)!;
      const idx = nodesExtra.length;
      nodesExtra.push({ id, name, categoryType, color });
      nodeIndexMap.set(id, idx);
      nodeTransactionsMap.set(id, entries);
      return idx;
    };

    const addLink = (
      sourceId: string,
      targetId: string,
      value: number,
      entries: SankeyLedgerEntry[]
    ) => {
      if (value <= 0) return;
      const source = nodeIndexMap.get(sourceId);
      const target = nodeIndexMap.get(targetId);
      if (source === undefined || target === undefined) return;
      const linkKey = `${sourceId}-->${targetId}`;
      linksExtra.push({ source, target, value, linkKey });
      linkTransactionsMap.set(linkKey, entries);
    };

    const sortedIncomeEntries = Object.entries(incomeCategoryMap).sort(
      (a, b) => b[1].total - a[1].total
    );

    if (sortedIncomeEntries.length === 0 && totalAllocatedOutflow === 0) {
      return {
        nodesExtra: [],
        linksExtra: [],
        nodeTransactionsMap,
        linkTransactionsMap,
        totalIncome: 0,
        totalExpense: 0,
        totalDebtPayment: 0,
        totalSaving: 0,
        totalInvestment: 0,
        totalAllocatedOutflow: 0,
        rawNetBalance: 0,
        netSurplus: 0,
        netDeficit: 0,
      };
    }

    // Left column: Income Sources (+ deficit balancing node if outflows exceed income)
    const incomeNodeIds: { id: string; amount: number; entries: SankeyLedgerEntry[] }[] = [];
    if (sortedIncomeEntries.length === 0) {
      addNode('inc-none', 'Dana Saldo Awal / Non-Pemasukan', 'income', '#64748b', []);
      incomeNodeIds.push({ id: 'inc-none', amount: totalAllocatedOutflow, entries: [] });
    } else {
      sortedIncomeEntries.forEach(([cat, data]) => {
        const nodeId = `inc-${cat}`;
        addNode(nodeId, cat, 'income', '#059669', data.entries);
        incomeNodeIds.push({ id: nodeId, amount: data.total, entries: data.entries });
      });
      if (netDeficit > 0) {
        addNode('inc-deficit', 'Penarikan Saldo / Net Defisit', 'income', '#dc2626', []);
        incomeNodeIds.push({ id: 'inc-deficit', amount: netDeficit, entries: [] });
      }
    }

    // Middle column: Main cash inflow pool
    const poolAllEntries =
      allIncomeEntries.length > 0
        ? allIncomeEntries
        : [...allExpenseEntries, ...debtEntries, ...savingEntries, ...investmentEntries];
    addNode('pool-total', 'Total Arus Kas Masuk', 'pool', '#2563eb', poolAllEntries);

    incomeNodeIds.forEach((inc) => {
      addLink(inc.id, 'pool-total', inc.amount, inc.entries);
    });

    // Middle-right allocation hubs
    if (totalExpense > 0) {
      addNode('pool-op', 'Pengeluaran Operasional', 'pool', '#e11d48', allExpenseEntries);
      addLink('pool-total', 'pool-op', totalExpense, allExpenseEntries);
    }
    if (totalDebtPayment > 0) {
      addNode('pool-debt', 'Cicilan Pokok Utang', 'debt', '#d97706', debtEntries);
      addLink('pool-total', 'pool-debt', totalDebtPayment, debtEntries);
    }
    if (totalSaving > 0) {
      addNode('pool-sav', 'Tabungan & Dana Darurat', 'savings', '#0284c7', savingEntries);
      addLink('pool-total', 'pool-sav', totalSaving, savingEntries);
    }
    if (totalInvestment > 0) {
      addNode('pool-inv', 'Alokasi Investasi', 'investment', '#7c3aed', investmentEntries);
      addLink('pool-total', 'pool-inv', totalInvestment, investmentEntries);
    }
    if (netSurplus > 0) {
      addNode('pool-surplus', 'Surplus Kas Belum Dialokasi', 'savings', '#10b981', []);
      addLink('pool-total', 'pool-surplus', netSurplus, []);
    }

    // Right column: Expense breakdowns
    const expenseColors = [
      '#e11d48',
      '#ea580c',
      '#d97706',
      '#ca8a04',
      '#0d9488',
      '#2563eb',
      '#9333ea',
    ];
    Object.entries(expenseCategoryMap)
      .sort((a, b) => b[1].total - a[1].total)
      .forEach(([cat, data], idx) => {
        if (data.total > 0) {
          const expNodeId = `exp-${cat}`;
          addNode(
            expNodeId,
            cat,
            'expense',
            expenseColors[idx % expenseColors.length],
            data.entries
          );
          addLink('pool-op', expNodeId, data.total, data.entries);
        }
      });

    return {
      nodesExtra,
      linksExtra,
      nodeTransactionsMap,
      linkTransactionsMap,
      totalIncome,
      totalExpense,
      totalDebtPayment,
      totalSaving,
      totalInvestment,
      totalAllocatedOutflow,
      rawNetBalance,
      netSurplus,
      netDeficit,
    };
  }, [filteredTransactions, debts]);

  // 2. Run D3 Sankey layout algorithm
  const width = 880;
  const height = 430;

  const sankeyGraph = useMemo(() => {
    if (sankeyData.nodesExtra.length === 0 || sankeyData.linksExtra.length === 0) {
      return null;
    }

    const nodesCopy: CustomSankeyNodeExtra[] = JSON.parse(JSON.stringify(sankeyData.nodesExtra));
    const linksCopy: CustomSankeyLinkExtra[] = JSON.parse(JSON.stringify(sankeyData.linksExtra));

    const sankeyLayout = d3Sankey<CustomSankeyNodeExtra, CustomSankeyLinkExtra>()
      .nodeWidth(18)
      .nodePadding(20)
      .extent([
        [12, 12],
        [width - 12, height - 12],
      ]);

    try {
      const graph = sankeyLayout({
        nodes: nodesCopy,
        links: linksCopy,
      });

      return graph as { nodes: CustomSankeyNode[]; links: CustomSankeyLink[] };
    } catch (e) {
      console.error('Sankey layout error:', e);
      return null;
    }
  }, [sankeyData]);

  // Resolve pinned drill-down details + sub-category share breakdown
  const pinnedDetails = useMemo(() => {
    if (!pinnedSelection || !sankeyGraph) return null;

    let title = '';
    let subtitle = '';
    let volume = 0;
    let entries: SankeyLedgerEntry[] = [];
    let isResidualNode = false;
    let groupByAccount = false;

    if (pinnedSelection.kind === 'node') {
      const node = sankeyGraph.nodes.find((n) => n.id === pinnedSelection.nodeId);
      if (!node) return null;
      entries = sankeyData.nodeTransactionsMap.get(node.id) || [];
      title = node.name;
      isResidualNode = node.id === 'pool-surplus';
      groupByAccount = node.id.startsWith('inc-') || node.id.startsWith('exp-');
      subtitle = isResidualNode
        ? 'Sisa kas operasional bersih setelah pengeluaran, cicilan utang, tabungan, dan investasi'
        : groupByAccount
        ? 'Rincian kontribusi per rekening dan transaksi kategori ini'
        : 'Rincian proporsi sub-kategori dan transaksi pada jalur ini';
      volume = node.value || 0;
    } else {
      const link = sankeyGraph.links.find((l) => {
        const src = l.source as CustomSankeyNode;
        const tgt = l.target as CustomSankeyNode;
        return src.id === pinnedSelection.sourceId && tgt.id === pinnedSelection.targetId;
      });
      if (!link) return null;
      const src = link.source as CustomSankeyNode;
      const tgt = link.target as CustomSankeyNode;
      const linkKey = `${src.id}-->${tgt.id}`;
      entries = sankeyData.linkTransactionsMap.get(linkKey) || [];
      title = `${src.name} ➔ ${tgt.name}`;
      subtitle = 'Aliran dana terhubung antara sumber dan tujuan';
      volume = link.value || 0;
      isResidualNode = tgt.id === 'pool-surplus';
      groupByAccount = src.id.startsWith('inc-') || tgt.id.startsWith('exp-');
    }

    // Aggregate sub-category (or account for leaf categories) breakdown
    const groupMap = new Map<string, { label: string; amount: number; count: number }>();
    entries.forEach(({ tx, effectiveAmount, attributionLabel }) => {
      const accName = accountLookup.get(tx.accountId)?.name || tx.accountId || 'Rekening Lain';
      const label = groupByAccount
        ? accName
        : attributionLabel === 'Porsi Bunga KPR/Utang'
        ? 'Beban Bunga KPR / Pinjaman'
        : tx.category || accName;
      const prev = groupMap.get(label) || { label, amount: 0, count: 0 };
      prev.amount += effectiveAmount;
      prev.count += 1;
      groupMap.set(label, prev);
    });

    const totalGroupVolume = Array.from(groupMap.values()).reduce((s, g) => s + g.amount, 0);
    const subCategoryBreakdown = Array.from(groupMap.values())
      .sort((a, b) => b.amount - a.amount)
      .map((item) => ({
        ...item,
        sharePct: totalGroupVolume > 0 ? (item.amount / totalGroupVolume) * 100 : 0,
      }));

    return {
      title,
      subtitle,
      volume,
      entries,
      isResidualNode,
      groupByAccount,
      subCategoryBreakdown,
    };
  }, [pinnedSelection, sankeyGraph, sankeyData, accountLookup]);

  const filteredDrilldownEntries = useMemo(() => {
    if (!pinnedDetails) return [];
    const q = drilldownSearch.trim().toLowerCase();
    const sorted = pinnedDetails.entries
      .slice()
      .sort((a, b) => b.tx.date.localeCompare(a.tx.date));

    return sorted.filter(({ tx, attributionLabel }) => {
      const accName = accountLookup.get(tx.accountId)?.name || tx.accountId || '';
      const groupLabel = pinnedDetails.groupByAccount
        ? accName
        : attributionLabel === 'Porsi Bunga KPR/Utang'
        ? 'Beban Bunga KPR / Pinjaman'
        : tx.category || accName;

      if (selectedSubCategory && groupLabel !== selectedSubCategory) return false;
      if (!q) return true;
      return (
        (tx.description || '').toLowerCase().includes(q) ||
        (tx.category || '').toLowerCase().includes(q) ||
        accName.toLowerCase().includes(q) ||
        (attributionLabel || '').toLowerCase().includes(q)
      );
    });
  }, [pinnedDetails, drilldownSearch, selectedSubCategory, accountLookup]);

  // 3. Leak detector alerts
  const leaks = useMemo(() => {
    const list: { title: string; desc: string; severity: 'high' | 'medium' | 'info'; amount: number }[] = [];
    const inc = sankeyData.totalIncome;

    if (sankeyData.netDeficit > 0) {
      list.push({
        title: 'Defisit Arus Kas Periode',
        desc: `Total arus keluar (${formatterIDR.format(
          sankeyData.totalAllocatedOutflow
        )}) melampaui pemasukan sebesar ${formatterIDR.format(sankeyData.netDeficit)}.`,
        severity: 'high',
        amount: sankeyData.netDeficit,
      });
    }

    if (inc > 0) {
      const expRatio = (sankeyData.totalExpense / inc) * 100;
      if (expRatio > 70) {
        list.push({
          title: 'Rasio Konsumsi Tinggi',
          desc: `Pengeluaran operasional menyerap ${expRatio.toFixed(
            1
          )}% dari pemasukan periode ini (target sehat < 70%).`,
          severity: expRatio > 85 ? 'high' : 'medium',
          amount: sankeyData.totalExpense,
        });
      }

      const savRatio = ((sankeyData.totalSaving + sankeyData.totalInvestment) / inc) * 100;
      if (savRatio < 20) {
        list.push({
          title: 'Alokasi Pertumbuhan Aset Rendah',
          desc: `Baru ${savRatio.toFixed(
            1
          )}% pemasukan yang dialokasikan ke tabungan & investasi (target CFP minimal 20%).`,
          severity: savRatio < 10 ? 'high' : 'medium',
          amount: sankeyData.totalSaving + sankeyData.totalInvestment,
        });
      }

      if (sankeyData.netSurplus > 0) {
        list.push({
          title: 'Surplus Kas Mengendap',
          desc: `Terdapat ${formatterIDR.format(
            sankeyData.netSurplus
          )} surplus kas periode ini yang belum dialokasikan ke tabungan atau investasi.`,
          severity: 'info',
          amount: sankeyData.netSurplus,
        });
      }
    }

    return list;
  }, [sankeyData]);

  const handleSelectPeriodMode = (mode: SankeyPeriodMode) => {
    setPeriodMode(mode);
    setPinnedSelection(null);
    setSelectedSubCategory(null);
    setDrilldownSearch('');
  };

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
      {/* Header & Optional Standalone Period Controls */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 bg-blue-600 text-white rounded-xl shrink-0">
            <GitCommit className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 text-base">
              Diagram Alir Sankey &amp; Audit Kebocoran Kas
            </h3>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 mt-0.5">
              <span>Alur pemasukan ke beban, tabungan, investasi, &amp; utang</span>
              <span aria-hidden="true">·</span>
              <span className="font-semibold text-slate-700">{periodRangeLabel}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">{filteredTransactions.length} transaksi</span>
            </div>
          </div>
        </div>

        {/* Dedicated Period Mode Bar when not hidden by parent summary component */}
        {!hidePeriodControls && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200">
              {(
                [
                  { id: 'all', label: 'Semua' },
                  { id: 'monthly', label: 'Bulanan' },
                  { id: 'quarterly', label: 'Kuartal (Q1-Q4)' },
                  { id: 'yearly', label: 'Tahunan' },
                ] as const
              ).map((btn) => (
                <button
                  key={btn.id}
                  type="button"
                  onClick={() => handleSelectPeriodMode(btn.id)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition cursor-pointer whitespace-nowrap shrink-0 ${
                    periodMode === btn.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {btn.label}
                </button>
              ))}
            </div>

            {periodMode === 'monthly' && (
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
                <Calendar className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                <select
                  value={selectedMonth}
                  onChange={(e) => {
                    setSelectedMonth(e.target.value);
                    setPinnedSelection(null);
                    setSelectedSubCategory(null);
                  }}
                  aria-label="Pilih bulan"
                  className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer"
                >
                  {(availableMonthKeys.length > 0 ? availableMonthKeys : [currentLocalMonth]).map(
                    (mk) => (
                      <option key={mk} value={mk}>
                        {formatMonthLabelID(mk)}
                      </option>
                    )
                  )}
                </select>
              </div>
            )}

            {periodMode === 'quarterly' && (
              <div className="flex items-center gap-2">
                <select
                  value={selectedQuarter}
                  onChange={(e) => {
                    setSelectedQuarter(Number(e.target.value) as QuarterNum);
                    setPinnedSelection(null);
                    setSelectedSubCategory(null);
                  }}
                  aria-label="Pilih kuartal"
                  className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer"
                >
                  {([1, 2, 3, 4] as const).map((q) => (
                    <option key={q} value={q}>
                      {QUARTER_LABELS[q]}
                    </option>
                  ))}
                </select>
                <select
                  value={selectedYear}
                  onChange={(e) => {
                    setSelectedYear(e.target.value);
                    setPinnedSelection(null);
                    setSelectedSubCategory(null);
                  }}
                  aria-label="Pilih tahun kuartal"
                  className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold font-mono tabular-nums text-slate-800 focus:outline-none cursor-pointer"
                >
                  {availableYears.map((yr) => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {periodMode === 'yearly' && (
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
                <Calendar className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                <select
                  value={selectedYear}
                  onChange={(e) => {
                    setSelectedYear(e.target.value);
                    setPinnedSelection(null);
                    setSelectedSubCategory(null);
                  }}
                  aria-label="Pilih tahun"
                  className="bg-transparent text-xs font-semibold font-mono tabular-nums text-slate-800 focus:outline-none cursor-pointer"
                >
                  {availableYears.map((yr) => (
                    <option key={yr} value={yr}>
                      Tahun {yr}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Unboxed Color Key Legend & Hint */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-600">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="inline-flex items-center gap-1.5 font-medium">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-600 inline-block" /> Pemasukan
          </span>
          <span className="inline-flex items-center gap-1.5 font-medium">
            <span className="w-2.5 h-2.5 rounded-sm bg-rose-600 inline-block" /> Pengeluaran
          </span>
          <span className="inline-flex items-center gap-1.5 font-medium">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-600 inline-block" /> Cicilan Pokok Utang
          </span>
          <span className="inline-flex items-center gap-1.5 font-medium">
            <span className="w-2.5 h-2.5 rounded-sm bg-sky-600 inline-block" /> Tabungan &amp; Darurat
          </span>
          <span className="inline-flex items-center gap-1.5 font-medium">
            <span className="w-2.5 h-2.5 rounded-sm bg-violet-600 inline-block" /> Investasi
          </span>
          {sankeyData.netDeficit > 0 && (
            <span className="inline-flex items-center gap-1.5 font-medium">
              <span className="w-2.5 h-2.5 rounded-sm bg-red-600 inline-block" /> Defisit / Tarik Saldo
            </span>
          )}
        </div>
        <span className="text-slate-500">
          Klik node atau jalur aliran untuk lihat proporsi sub-kategori &amp; rincian transaksi
        </span>
      </div>

      {/* Inline Period Cashflow Summary Strip (only shown when rendered standalone without SankeyCashFlowSummary) */}
      {!hideInlineSummaryStrip && (() => {
        const inc = sankeyData.totalIncome;
        const savInvTotal = sankeyData.totalSaving + sankeyData.totalInvestment;
        const expShare = inc > 0 ? ((sankeyData.totalExpense / inc) * 100).toFixed(1) : '0.0';
        const debtShare = inc > 0 ? ((sankeyData.totalDebtPayment / inc) * 100).toFixed(1) : '0.0';
        const savInvShare = inc > 0 ? ((savInvTotal / inc) * 100).toFixed(1) : '0.0';
        const netShare =
          inc > 0 ? ((Math.abs(sankeyData.rawNetBalance) / inc) * 100).toFixed(1) : '0.0';
        const isDeficit = sankeyData.rawNetBalance < 0;

        return (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="p-3.5 bg-slate-50/70 border border-slate-200 rounded-xl">
              <span className="text-[11px] font-semibold text-slate-500 block">
                Total Pemasukan
              </span>
              <span className="text-sm font-bold text-emerald-700 font-mono tabular-nums block mt-0.5">
                {formatterIDR.format(inc)}
              </span>
              <span className="text-[11px] text-slate-500 font-mono tabular-nums block mt-0.5">
                {filteredTransactions.length} transaksi · {periodRangeLabel}
              </span>
            </div>

            <div className="p-3.5 bg-slate-50/70 border border-slate-200 rounded-xl">
              <span className="text-[11px] font-semibold text-slate-500 block">
                Pengeluaran Operasional
              </span>
              <span className="text-sm font-bold text-rose-700 font-mono tabular-nums block mt-0.5">
                {formatterIDR.format(sankeyData.totalExpense)}
              </span>
              <span className="text-[11px] text-slate-500 font-mono tabular-nums block mt-0.5">
                {expShare}% dari pemasukan
              </span>
            </div>

            <div className="p-3.5 bg-slate-50/70 border border-slate-200 rounded-xl">
              <span className="text-[11px] font-semibold text-slate-500 block">
                Cicilan Pokok Utang
              </span>
              <span className="text-sm font-bold text-amber-700 font-mono tabular-nums block mt-0.5">
                {formatterIDR.format(sankeyData.totalDebtPayment)}
              </span>
              <span className="text-[11px] text-slate-500 font-mono tabular-nums block mt-0.5">
                {debtShare}% dari pemasukan
              </span>
            </div>

            <div className="p-3.5 bg-slate-50/70 border border-slate-200 rounded-xl">
              <span className="text-[11px] font-semibold text-slate-500 block">
                Tabungan &amp; Investasi
              </span>
              <span className="text-sm font-bold text-sky-700 font-mono tabular-nums block mt-0.5">
                {formatterIDR.format(savInvTotal)}
              </span>
              <span className="text-[11px] text-slate-500 font-mono tabular-nums block mt-0.5">
                {savInvShare}% dari pemasukan
              </span>
            </div>

            <div className="p-3.5 bg-slate-50/70 border border-slate-200 rounded-xl col-span-2 sm:col-span-1">
              <span className="text-[11px] font-semibold text-slate-500 block">
                {isDeficit ? 'Net Defisit' : 'Net Surplus'}
              </span>
              <span
                className={`text-sm font-bold font-mono tabular-nums block mt-0.5 ${
                  isDeficit ? 'text-rose-700' : 'text-emerald-700'
                }`}
              >
                {sankeyData.rawNetBalance < 0
                  ? `-${formatterIDR.format(Math.abs(sankeyData.rawNetBalance))}`
                  : formatterIDR.format(sankeyData.rawNetBalance)}
              </span>
              <span className="text-[11px] text-slate-500 font-mono tabular-nums block mt-0.5">
                {netShare}% dari pemasukan
              </span>
            </div>
          </div>
        );
      })()}

      {/* Sankey Chart Render */}
      {!sankeyGraph || sankeyGraph.nodes.length === 0 ? (
        <div className="p-10 text-center bg-slate-50 rounded-xl border border-slate-200 space-y-2">
          <GitCommit className="h-9 w-9 text-slate-400 mx-auto" />
          <p className="text-sm font-semibold text-slate-700">
            Belum ada transaksi arus kas pada periode {periodRangeLabel}.
          </p>
          <p className="text-xs text-slate-500">
            Pilih periode lain atau catat transaksi baru untuk melihat visualisasi aliran dana.
          </p>
          {periodMode !== 'all' && (
            <button
              type="button"
              onClick={() => handleSelectPeriodMode('all')}
              className="mt-2 px-3.5 py-2 text-xs font-semibold text-blue-700 bg-white border border-blue-200 hover:bg-blue-50 rounded-lg transition cursor-pointer"
            >
              Tampilkan Semua Periode
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="w-full overflow-x-auto bg-slate-50 p-4 rounded-xl border border-slate-200">
            <svg
              viewBox={`0 0 ${width} ${height}`}
              className="w-full h-auto min-w-[700px] select-none"
            >
              {/* Links */}
              <g fill="none">
                {sankeyGraph.links.map((link, idx) => {
                  const pathGenerator = sankeyLinkHorizontal();
                  const d = pathGenerator(link as any) || undefined;
                  const sourceNode = link.source as CustomSankeyNode;
                  const targetNode = link.target as CustomSankeyNode;

                  const isPinnedLink =
                    pinnedSelection?.kind === 'link' &&
                    pinnedSelection.sourceId === sourceNode.id &&
                    pinnedSelection.targetId === targetNode.id;
                  const isConnectedToPinnedNode =
                    pinnedSelection?.kind === 'node' &&
                    (sourceNode.id === pinnedSelection.nodeId ||
                      targetNode.id === pinnedSelection.nodeId);
                  const isHovered =
                    hoveredLink === link ||
                    (hoveredNode &&
                      (sourceNode.id === hoveredNode.id || targetNode.id === hoveredNode.id));

                  let strokeOpacity = 0.32;
                  if (pinnedSelection) {
                    strokeOpacity = isPinnedLink || isConnectedToPinnedNode ? 0.78 : 0.1;
                  } else if (isHovered) {
                    strokeOpacity = 0.78;
                  }

                  return (
                    <path
                      key={idx}
                      d={d}
                      stroke={sourceNode.color || '#94a3b8'}
                      strokeWidth={Math.max(2, link.width || 0)}
                      strokeOpacity={strokeOpacity}
                      className="transition-all duration-150 cursor-pointer"
                      onMouseEnter={() => setHoveredLink(link)}
                      onMouseLeave={() => setHoveredLink(null)}
                      onClick={() => {
                        setDrilldownSearch('');
                        setSelectedSubCategory(null);
                        setPinnedSelection((prev) =>
                          prev?.kind === 'link' &&
                          prev.sourceId === sourceNode.id &&
                          prev.targetId === targetNode.id
                            ? null
                            : { kind: 'link', sourceId: sourceNode.id, targetId: targetNode.id }
                        );
                      }}
                    >
                      <title>{`${sourceNode.name} ➔ ${targetNode.name}: ${formatterIDR.format(
                        link.value
                      )} (Klik untuk rincian transaksi)`}</title>
                    </path>
                  );
                })}
              </g>

              {/* Nodes */}
              <g>
                {sankeyGraph.nodes.map((node, idx) => {
                  const nodeWidth = (node.x1 || 0) - (node.x0 || 0);
                  const nodeHeight = Math.max(12, (node.y1 || 0) - (node.y0 || 0));
                  const isPinnedNode =
                    pinnedSelection?.kind === 'node' && pinnedSelection.nodeId === node.id;
                  const isConnectedViaLink =
                    pinnedSelection?.kind === 'link' &&
                    (pinnedSelection.sourceId === node.id || pinnedSelection.targetId === node.id);
                  const isConnectedToPinned =
                    pinnedSelection?.kind === 'node' &&
                    sankeyGraph.links.some(
                      (l) =>
                        ((l.source as CustomSankeyNode).id === pinnedSelection.nodeId &&
                          (l.target as CustomSankeyNode).id === node.id) ||
                        ((l.target as CustomSankeyNode).id === pinnedSelection.nodeId &&
                          (l.source as CustomSankeyNode).id === node.id)
                    );
                  const isDimmed =
                    Boolean(pinnedSelection) &&
                    !isPinnedNode &&
                    !isConnectedViaLink &&
                    !isConnectedToPinned;
                  const isHovered = hoveredNode?.id === node.id;

                  return (
                    <g
                      key={idx}
                      transform={`translate(${node.x0}, ${node.y0})`}
                      className="cursor-pointer"
                      style={{ opacity: isDimmed ? 0.28 : 1, transition: 'opacity 150ms ease' }}
                      onMouseEnter={() => setHoveredNode(node)}
                      onMouseLeave={() => setHoveredNode(null)}
                      onClick={() => {
                        setDrilldownSearch('');
                        setSelectedSubCategory(null);
                        setPinnedSelection((prev) =>
                          prev?.kind === 'node' && prev.nodeId === node.id
                            ? null
                            : { kind: 'node', nodeId: node.id }
                        );
                      }}
                    >
                      <rect
                        width={nodeWidth}
                        height={nodeHeight}
                        fill={node.color}
                        rx={4}
                        stroke={isPinnedNode || isHovered ? '#0f172a' : 'none'}
                        strokeWidth={isPinnedNode ? 2 : 1}
                      >
                        <title>{`${node.name}: ${formatterIDR.format(
                          node.value || 0
                        )} (Klik untuk inspeksi)`}</title>
                      </rect>

                      <text
                        x={(node.x0 || 0) < width / 2 ? nodeWidth + 8 : -8}
                        y={nodeHeight / 2}
                        dy="0.35em"
                        textAnchor={(node.x0 || 0) < width / 2 ? 'start' : 'end'}
                        className="text-[11px] font-bold fill-slate-800 pointer-events-none"
                      >
                        {node.name} ({formatterIDR.format(node.value || 0)})
                      </text>
                    </g>
                  );
                })}
              </g>
            </svg>
          </div>

          {/* Live Hover Strip */}
          {(hoveredNode || hoveredLink) && (
            <div className="px-4 py-2.5 bg-slate-900 text-white rounded-xl text-xs flex flex-wrap items-center justify-between gap-2 font-mono tabular-nums">
              {hoveredNode && (
                <span>
                  Node: <strong className="font-sans">{hoveredNode.name}</strong> · Volume:{' '}
                  {formatterIDR.format(hoveredNode.value || 0)}
                </span>
              )}
              {hoveredLink && (
                <span className="inline-flex items-center gap-1.5 flex-wrap">
                  <strong className="font-sans">
                    {(hoveredLink.source as CustomSankeyNode).name}
                  </strong>
                  <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                  <strong className="font-sans">
                    {(hoveredLink.target as CustomSankeyNode).name}
                  </strong>
                  <span>· {formatterIDR.format(hoveredLink.value)}</span>
                </span>
              )}
              <span className="font-sans text-slate-300">
                Klik untuk lihat proporsi &amp; rincian transaksi
              </span>
            </div>
          )}

          {/* Pinned Interactive Drill-Down Panel */}
          {pinnedDetails && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">{pinnedDetails.title}</h4>
                  <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-600 mt-0.5">
                    <span>{pinnedDetails.subtitle}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums font-bold text-slate-900">
                      {formatterIDR.format(pinnedDetails.volume)}
                    </span>
                    {sankeyData.totalIncome > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {((pinnedDetails.volume / sankeyData.totalIncome) * 100).toFixed(1)}% dari
                          pemasukan
                        </span>
                      </>
                    )}
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      {pinnedDetails.entries.length} entri jurnal
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {!pinnedDetails.isResidualNode && pinnedDetails.entries.length > 0 && (
                    <div className="relative">
                      <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={drilldownSearch}
                        onChange={(e) => setDrilldownSearch(e.target.value)}
                        placeholder="Cari deskripsi/rekening..."
                        className="pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setPinnedSelection(null);
                      setSelectedSubCategory(null);
                      setDrilldownSearch('');
                    }}
                    className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Tampilkan Semua Aliran
                  </button>
                </div>
              </div>

              {pinnedDetails.isResidualNode ? (
                <div className="p-4 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 flex items-start gap-2.5">
                  <Info className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-semibold text-slate-900">
                      Ringkasan Surplus Kas Periode {periodRangeLabel}
                    </p>
                    <p className="font-mono tabular-nums text-slate-600">
                      Pemasukan ({formatterIDR.format(sankeyData.totalIncome)}) - Pengeluaran (
                      {formatterIDR.format(sankeyData.totalExpense)}) - Pokok Utang (
                      {formatterIDR.format(sankeyData.totalDebtPayment)}) - Tabungan (
                      {formatterIDR.format(sankeyData.totalSaving)}) - Investasi (
                      {formatterIDR.format(sankeyData.totalInvestment)}) ={' '}
                      <strong className="text-emerald-700">
                        {formatterIDR.format(sankeyData.netSurplus)}
                      </strong>
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {/* Sub-Category / Account Share Breakdown */}
                  {pinnedDetails.subCategoryBreakdown.length > 0 && (
                    <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-800">
                          {pinnedDetails.groupByAccount
                            ? 'Proporsi Per Rekening Sumber/Tujuan'
                            : 'Proporsi Per Sub-Kategori'}
                        </span>
                        {selectedSubCategory && (
                          <button
                            type="button"
                            onClick={() => setSelectedSubCategory(null)}
                            className="text-xs font-semibold text-blue-600 hover:underline cursor-pointer"
                          >
                            Semua Sub-Kategori
                          </button>
                        )}
                      </div>

                      <div className="space-y-2.5">
                        {pinnedDetails.subCategoryBreakdown.map((item) => {
                          const isSelected = selectedSubCategory === item.label;
                          return (
                            <button
                              key={item.label}
                              type="button"
                              onClick={() =>
                                setSelectedSubCategory((prev) =>
                                  prev === item.label ? null : item.label
                                )
                              }
                              className={`w-full text-left p-2 rounded-lg border transition cursor-pointer ${
                                isSelected
                                  ? 'bg-blue-50 border-blue-300'
                                  : 'bg-slate-50/70 border-slate-200/80 hover:bg-slate-100/70'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2 text-xs mb-1">
                                <span className="font-semibold text-slate-800 truncate">
                                  {item.label}{' '}
                                  <span className="text-slate-500 font-normal">
                                    ({item.count} transaksi)
                                  </span>
                                </span>
                                <span className="font-mono tabular-nums text-slate-900 font-bold shrink-0">
                                  {formatterIDR.format(item.amount)} · {item.sharePct.toFixed(1)}%
                                </span>
                              </div>
                              <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    isSelected ? 'bg-blue-600' : 'bg-slate-700'
                                  }`}
                                  style={{ width: `${Math.min(100, Math.max(2, item.sharePct))}%` }}
                                />
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Searchable Transaction Table */}
                  {filteredDrilldownEntries.length === 0 ? (
                    <div className="p-6 text-center bg-white border border-slate-200 rounded-lg text-xs text-slate-500">
                      Tidak ada transaksi yang cocok dengan filter pencarian.
                    </div>
                  ) : (
                    <div className="overflow-x-auto bg-white border border-slate-200 rounded-lg max-h-72">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 sticky top-0">
                          <tr>
                            <th className="py-2.5 px-3 font-semibold">Tanggal</th>
                            <th className="py-2.5 px-3 font-semibold">Deskripsi</th>
                            <th className="py-2.5 px-3 font-semibold">Kategori</th>
                            <th className="py-2.5 px-3 font-semibold">Rekening</th>
                            <th className="py-2.5 px-3 font-semibold text-right">Nominal</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredDrilldownEntries.map(
                            ({ tx, effectiveAmount, attributionLabel }, i) => {
                              const acc = accountLookup.get(tx.accountId);
                              return (
                                <tr key={`${tx.id}-${i}`} className="hover:bg-slate-50">
                                  <td className="py-2.5 px-3 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                                    {normalizeLedgerDateYYYYMMDD(tx.date)}
                                  </td>
                                  <td className="py-2.5 px-3 text-slate-900 font-medium">
                                    <div>{tx.description || '-'}</div>
                                    {attributionLabel && (
                                      <span className="text-[11px] text-slate-500">
                                        Atribusi: {attributionLabel}
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                                    {tx.category}
                                  </td>
                                  <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                                    {acc?.name || tx.accountId}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-slate-900 whitespace-nowrap">
                                    {formatterIDR.format(effectiveAmount)}
                                  </td>
                                </tr>
                              );
                            }
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Leak Alerts Section */}
      <div className="space-y-3 pt-2 border-t border-slate-200">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-500" />
          <span>Hasil Analisis Kebocoran Arus Kas ({periodRangeLabel})</span>
        </h4>

        {leaks.length === 0 ? (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 text-emerald-900 text-xs font-medium">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
            <div>
              <strong>Arus Kas Sangat Efisien!</strong> Tidak terdeteksi adanya kebocoran signifikan
              pada periode ini. Alokasi operasional dan pertumbuhan aset berjalan sesuai norma CFP.
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {leaks.map((leak, idx) => (
              <div
                key={idx}
                className={`p-4 rounded-xl border space-y-1 ${
                  leak.severity === 'high'
                    ? 'bg-rose-50 border-rose-200 text-rose-900'
                    : leak.severity === 'medium'
                    ? 'bg-amber-50 border-amber-200 text-amber-900'
                    : 'bg-blue-50 border-blue-200 text-blue-900'
                }`}
              >
                <div className="flex items-center justify-between font-bold text-xs gap-2">
                  <span className="flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    {leak.title}
                  </span>
                  <span className="font-mono tabular-nums text-[11px] shrink-0">
                    {formatterIDR.format(leak.amount)}
                  </span>
                </div>
                <p className="text-xs opacity-90 leading-relaxed">{leak.desc}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
