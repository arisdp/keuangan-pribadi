import React, { useState, useMemo } from 'react';
import { KprCoaMappingConfig, Transaction } from '../types';
import { CategoryNode } from '../categoryHierarchy';
import { calculateIncomeStatementSummary, classifyTransaction, isInternalTransfer } from '../utils/accountingEngine';
import { DEFAULT_KPR_COA_MAPPING } from '../utils/kprPresets';
import { formatterIDR } from '../utils/formatters';
import {
  ChevronRight,
  ChevronDown,
  Printer,
  Search,
  Maximize2,
  Minimize2,
  Table,
  Filter,
} from 'lucide-react';

interface HierarchicalPivotReportProps {
  transactions: Transaction[];
  masterCategories: CategoryNode[];
  kprCoaMapping?: KprCoaMappingConfig;
}

interface MonthColumn {
  key: string; // "2024-08"
  label: string; // "Agt 2024"
  fullLabel: string; // "Bulan 8 (Agustus 2024)"
}

export const HierarchicalPivotReport: React.FC<HierarchicalPivotReportProps> = ({
  transactions,
  masterCategories,
  kprCoaMapping = DEFAULT_KPR_COA_MAPPING,
}) => {
  // Filter Year State
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Expand / Collapse state for tree rows
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({
    'type-equity': true,
    'type-income': true,
    'type-expense': true,
    'grp-modal-awal': true,
    'grp-pendapatan-tetap': true,
    'grp-pendapatan-tidak-tetap': true,
    'grp-bank-finansial': true,
    'grp-belanja-online': true,
    'grp-kebutuhan-pribadi': true,
    'grp-kebutuhan-rumah-tangga': true,
    'grp-kesehatan': true,
    'grp-pengeluaran-lainnya': true,
    'grp-sosial': true,
    'grp-transportasi': true,
  });

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const expandAll = () => {
    const all: Record<string, boolean> = {};
    const traverse = (nodes: CategoryNode[]) => {
      nodes.forEach((n) => {
        all[n.id] = true;
        if (n.children) traverse(n.children);
      });
    };
    traverse(masterCategories);
    setExpandedRows(all);
  };

  const collapseAll = () => {
    setExpandedRows({});
  };

  // Extract available years from transactions
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    const currentYear = new Date().getFullYear().toString();
    years.add(currentYear);

    transactions.forEach((tx) => {
      if (tx.date && tx.date.length >= 4) {
        years.add(tx.date.substring(0, 4));
      }
    });

    return Array.from(years).sort().reverse();
  }, [transactions]);

  // Generate dynamic Month Columns from non-transfer transactions
  const monthColumns = useMemo<MonthColumn[]>(() => {
    const monthKeys = new Set<string>();

    transactions.forEach((tx) => {
      if (!tx.date || isInternalTransfer(tx)) return;
      const ym = tx.date.substring(0, 7); // "YYYY-MM"
      if (selectedYear === 'all' || ym.startsWith(selectedYear)) {
        monthKeys.add(ym);
      }
    });

    // If no transactions exist for filter, default to current 3 months
    if (monthKeys.size === 0) {
      const now = new Date();
      for (let i = 2; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        monthKeys.add(`${y}-${m}`);
      }
    }

    const sorted = Array.from(monthKeys).sort();

    return sorted.map((ym) => {
      const [yStr, mStr] = ym.split('-');
      const mNum = parseInt(mStr, 10);
      const dateObj = new Date(parseInt(yStr, 10), mNum - 1, 1);
      const monthName = dateObj.toLocaleDateString('id-ID', { month: 'long' });
      const monthShort = dateObj.toLocaleDateString('id-ID', { month: 'short' });

      return {
        key: ym,
        label: `${monthShort} ${yStr}`,
        fullLabel: `Bulan ${mNum} (${monthName} ${yStr})`,
      };
    });
  }, [transactions, selectedYear]);

  // Build Transaction Amount Map per category name/id and per month (excluding internal transfers)
  const categoryMonthAmountMap = useMemo(() => {
    const map: Record<string, number> = {};
    const leafNames = new Set<string>();
    const collectLeafNames = (nodes: CategoryNode[]) => {
      nodes.forEach((n) => {
        if (!n.children || n.children.length === 0) {
          leafNames.add(n.name.toLowerCase().trim());
        } else {
          collectLeafNames(n.children);
        }
      });
    };
    collectLeafNames(masterCategories);

    transactions.forEach((tx) => {
      if (!tx.date || !tx.amount || isInternalTransfer(tx)) return;
      const ym = tx.date.substring(0, 7);
      if (selectedYear !== 'all' && !ym.startsWith(selectedYear)) return;

      const nature = classifyTransaction(tx);
      if (nature === 'debt_principal_pay' && tx.linkedKprBreakdown) {
        const interestPart = Math.max(0, Number(tx.linkedKprBreakdown.interestPart) || 0);
        if (interestPart > 0) {
          const rawInterestCat = (
            tx.linkedKprBreakdown.interestCategory ||
            kprCoaMapping.interestExpenseCategory ||
            'Beban Bunga KPR'
          )
            .toLowerCase()
            .trim();
          const defaultKprInterestCat = (kprCoaMapping.interestExpenseCategory || 'Beban Bunga KPR')
            .toLowerCase()
            .trim();
          const targetCatKey = leafNames.has(rawInterestCat)
            ? rawInterestCat
            : leafNames.has(defaultKprInterestCat)
            ? defaultKprInterestCat
            : 'beban bunga kpr';
          const compositeKey = `${targetCatKey}_${ym}`;
          map[compositeKey] = (map[compositeKey] || 0) + interestPart;
        }
        return;
      }

      const catKey = tx.category.toLowerCase().trim();
      const compositeKey = `${catKey}_${ym}`;
      map[compositeKey] = (map[compositeKey] || 0) + tx.amount;
    });

    return map;
  }, [transactions, selectedYear, masterCategories, kprCoaMapping]);

  // Calculate values for a category node (recursive aggregation)
  const getNodeValues = (node: CategoryNode): { monthValues: Record<string, number>; totalOverall: number } => {
    const monthValues: Record<string, number> = {};
    monthColumns.forEach((m) => {
      monthValues[m.key] = 0;
    });

    if (node.children && node.children.length > 0) {
      // Sum child nodes
      node.children.forEach((child) => {
        const childVal = getNodeValues(child);
        monthColumns.forEach((m) => {
          monthValues[m.key] += childVal.monthValues[m.key] || 0;
        });
      });
    } else {
      // Leaf item node: match direct category name or id
      const nameKey = node.name.toLowerCase().trim();
      const idKey = node.id.toLowerCase().trim();

      monthColumns.forEach((m) => {
        const amtByName = categoryMonthAmountMap[`${nameKey}_${m.key}`] || 0;
        const amtById = categoryMonthAmountMap[`${idKey}_${m.key}`] || 0;
        monthValues[m.key] = amtByName || amtById || 0;
      });
    }

    const totalOverall = Object.values(monthValues).reduce((sum, val) => sum + val, 0);

    return { monthValues, totalOverall };
  };

  // Render Category Row recursively matching spreadsheet tree view
  const renderTreeRow = (node: CategoryNode, depth = 0): React.ReactNode => {
    const hasChildren = Boolean(node.children && node.children.length > 0);
    const isExpanded = Boolean(expandedRows[node.id]);
    const { monthValues, totalOverall } = getNodeValues(node);

    const matchesSearch =
      !searchQuery ||
      node.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (node.children && node.children.some((c) => c.name.toLowerCase().includes(searchQuery.toLowerCase())));

    if (!matchesSearch && depth === 0) return null;

    // Row styling based on hierarchy level
    let rowBg = 'hover:bg-slate-50';
    let textStyle = 'text-slate-700 font-medium';
    let indentPadding = `${depth * 24 + 12}px`;

    if (node.type === 'type') {
      rowBg = 'bg-slate-100/90 hover:bg-slate-200/80 font-black text-slate-900 border-t-2 border-slate-300';
      textStyle = 'text-slate-900 font-black text-xs uppercase tracking-wider';
    } else if (node.type === 'group') {
      rowBg = 'bg-slate-50/80 font-bold text-slate-800 border-t border-slate-200';
      textStyle = 'text-slate-800 font-extrabold text-xs';
    } else if (node.type === 'subgroup') {
      rowBg = 'font-semibold text-slate-700';
      textStyle = 'text-slate-700 font-bold text-xs';
    }

    return (
      <React.Fragment key={node.id}>
        <tr className={`transition-colors border-b border-slate-100 ${rowBg}`}>
          {/* Row Title Column */}
          <td className="py-2.5 pr-4 text-xs select-none" style={{ paddingLeft: indentPadding }}>
            <div className="flex items-center gap-2">
              {hasChildren ? (
                <button
                  type="button"
                  onClick={() => toggleRow(node.id)}
                  className="p-1 hover:bg-slate-200 rounded-md transition text-slate-600 cursor-pointer"
                >
                  {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
              ) : (
                <span className="w-5 inline-block text-slate-300 text-center">•</span>
              )}
              <span className={textStyle}>{node.name}</span>
            </div>
          </td>

          {/* Month Columns */}
          {monthColumns.map((m) => {
            const val = monthValues[m.key] || 0;
            return (
              <td
                key={m.key}
                className={`py-2.5 px-3 text-right font-mono text-xs whitespace-nowrap ${
                  node.type === 'type' ? 'font-black text-slate-900' : 'font-semibold text-slate-700'
                }`}
              >
                {val === 0 ? '-' : formatterIDR.format(val)}
              </td>
            );
          })}

          {/* Grand Total Column for Row */}
          <td className="py-2.5 px-4 text-right font-mono font-black text-xs bg-slate-100/50 text-slate-900 border-l border-slate-200 whitespace-nowrap">
            {totalOverall === 0 ? '-' : formatterIDR.format(totalOverall)}
          </td>
        </tr>

        {/* Children Rows */}
        {hasChildren && isExpanded && node.children!.map((child) => renderTreeRow(child, depth + 1))}
      </React.Fragment>
    );
  };

  // Operating Net Profit per Month (Laba Rugi Operasional murni) & Total Hierarchy Accumulation
  const operatingNetPerMonth = useMemo(() => {
    const monthTotals: Record<string, number> = {};
    monthColumns.forEach((m) => {
      const monthTxs = transactions.filter((tx) => tx.date && tx.date.startsWith(m.key));
      monthTotals[m.key] = calculateIncomeStatementSummary(monthTxs).netOperatingProfit;
    });
    const totalOverall = Object.values(monthTotals).reduce((sum, v) => sum + v, 0);
    return { monthTotals, totalOverall };
  }, [transactions, monthColumns]);

  // Grand Total Summary per Month across all Categories
  const grandTotalPerMonth = useMemo(() => {
    const monthTotals: Record<string, number> = {};
    monthColumns.forEach((m) => {
      monthTotals[m.key] = 0;
    });

    masterCategories.forEach((node) => {
      const { monthValues } = getNodeValues(node);
      monthColumns.forEach((m) => {
        // Net effect: Income / Equity (+) vs Expense (-)
        if (node.transactionType === 'expense') {
          monthTotals[m.key] -= monthValues[m.key] || 0;
        } else {
          monthTotals[m.key] += monthValues[m.key] || 0;
        }
      });
    });

    const totalOverall = Object.values(monthTotals).reduce((sum, v) => sum + v, 0);

    return { monthTotals, totalOverall };
  }, [masterCategories, monthColumns, categoryMonthAmountMap]);

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* Top Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
            <Table className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-black text-slate-800 text-sm tracking-tight">
              Laporan Pivot Keuangan (Tabel Bertingkat Excel)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Visualisasi rekapitulasi transaksi aktual berdasarkan hirarki master kategori.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Year Filter */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl">
            <Filter className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-xs font-bold text-slate-600">Tahun:</span>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="bg-transparent text-xs font-black text-slate-800 focus:outline-none cursor-pointer"
            >
              <option value="all">Semua Tahun</option>
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={expandAll}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            Buka Semua
          </button>

          <button
            type="button"
            onClick={collapseAll}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
          >
            <Minimize2 className="h-3.5 w-3.5" />
            Tutup Semua
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center gap-1 px-3.5 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer border border-slate-200"
          >
            <Printer className="h-3.5 w-3.5" />
            Cetak
          </button>
        </div>
      </div>

      {/* Search Input */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input
          type="text"
          placeholder="Cari baris kategori dalam pivot..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs"
        />
      </div>

      {/* Main Pivot Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-left border-collapse">
          {/* Table Header */}
          <thead>
            <tr className="bg-slate-900 text-white text-xs font-extrabold uppercase tracking-wider border-b border-slate-800">
              <th className="py-3 px-4 min-w-[280px]">Jumlah dari Jumlah Transaksi Real</th>
              <th colSpan={monthColumns.length} className="py-2 px-3 text-center border-l border-slate-800 bg-slate-800">
                Column Labels (Bulan Transaksi)
              </th>
              <th className="py-3 px-4 text-right min-w-[150px] border-l border-slate-800 bg-blue-900">
                Total Jumlah
              </th>
            </tr>
            <tr className="bg-slate-800 text-slate-200 text-[11px] font-bold border-b border-slate-700">
              <th className="py-2 px-4 text-slate-400">Kategori Keuangan</th>
              {monthColumns.map((m) => (
                <th key={m.key} className="py-2 px-3 text-right font-mono border-l border-slate-700/50 min-w-[120px]">
                  {m.label}
                </th>
              ))}
              <th className="py-2 px-4 text-right font-mono border-l border-slate-700 bg-blue-950 text-blue-200">
                Grand Total
              </th>
            </tr>
          </thead>

          {/* Table Body Tree */}
          <tbody className="divide-y divide-slate-100">
            {masterCategories.map((typeNode) => renderTreeRow(typeNode))}
          </tbody>

          {/* Table Footer / Operating Laba Rugi & Grand Total Rows */}
          <tfoot>
            <tr className="bg-emerald-700 text-white font-black text-xs border-t-2 border-emerald-400">
              <td className="py-3 px-4 uppercase tracking-wider">
                SURPLUS / DEFISIT OPERASIONAL (LABA RUGI BERSIH)
              </td>
              {monthColumns.map((m) => {
                const total = operatingNetPerMonth.monthTotals[m.key] || 0;
                return (
                  <td key={m.key} className="py-3 px-3 text-right font-mono text-xs whitespace-nowrap">
                    {total === 0 ? 'Rp 0' : formatterIDR.format(total)}
                  </td>
                );
              })}
              <td className="py-3 px-4 text-right font-mono text-sm bg-emerald-900 border-l border-emerald-500 whitespace-nowrap">
                {formatterIDR.format(operatingNetPerMonth.totalOverall)}
              </td>
            </tr>
            <tr className="bg-blue-600 text-white font-black text-xs border-t border-blue-400">
              <td className="py-3 px-4 uppercase tracking-wider">
                AKUMULASI BERSIH SELURUH KATEGORI (TERMASUK NON-OPERASIONAL)
              </td>
              {monthColumns.map((m) => {
                const total = grandTotalPerMonth.monthTotals[m.key] || 0;
                return (
                  <td key={m.key} className="py-3 px-3 text-right font-mono text-xs whitespace-nowrap">
                    {total === 0 ? 'Rp 0' : formatterIDR.format(total)}
                  </td>
                );
              })}
              <td className="py-3 px-4 text-right font-mono text-sm bg-blue-800 border-l border-blue-500 whitespace-nowrap">
                {formatterIDR.format(grandTotalPerMonth.totalOverall)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};
