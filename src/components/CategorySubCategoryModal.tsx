import React, { useEffect, useMemo, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { X, PieChart as PieChartIcon } from 'lucide-react';
import { CategoryNode, DEFAULT_CATEGORY_HIERARCHY } from '../categoryHierarchy';
import { Transaction } from '../types';
import { isOperatingExpense, normalizeLedgerDateYYYYMMDD } from '../utils/accountingEngine';
import { formatterIDR } from '../utils/formatters';

interface CategorySubCategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  categoryKey: string;
  transactions: Transaction[];
  masterCategories?: CategoryNode[];
  timelineMonthSet: Set<string>;
  primaryCategories: string[];
  windowRangeLabel: string;
}

interface SubCategorySlice {
  name: string;
  value: number;
  count: number;
  percentage: number;
  color: string;
}

const PIE_PALETTE = [
  '#2563eb', // Blue
  '#0d9488', // Teal
  '#d97706', // Amber
  '#4f46e5', // Indigo
  '#dc2626', // Crimson
  '#0891b2', // Cyan
  '#64748b', // Slate
];

function findCategoryGroupContext(
  hierarchy: CategoryNode[],
  targetName: string
): { groupName: string; siblingNames: Set<string> } | null {
  const normalizedTarget = targetName.trim().toLowerCase();

  const collectLeafNames = (node: CategoryNode): string[] => {
    if (!node.children || node.children.length === 0) {
      return node.name ? [node.name.trim()] : [];
    }
    const items: string[] = [];
    node.children.forEach((child) => {
      items.push(...collectLeafNames(child));
    });
    return items;
  };

  for (const typeNode of hierarchy) {
    for (const groupNode of typeNode.children || []) {
      const groupLeaves = collectLeafNames(groupNode);
      if (groupNode.name.trim().toLowerCase() === normalizedTarget && groupLeaves.length > 0) {
        return {
          groupName: groupNode.name.trim(),
          siblingNames: new Set(groupLeaves.map((n) => n.toLowerCase())),
        };
      }
      const matchesLeaf = groupLeaves.some((leaf) => leaf.toLowerCase() === normalizedTarget);
      if (matchesLeaf && groupLeaves.length > 1) {
        return {
          groupName: groupNode.name.trim(),
          siblingNames: new Set(groupLeaves.map((n) => n.toLowerCase())),
        };
      }
    }
  }

  return null;
}

function normalizeMerchantLabel(description: string | undefined, fallbackCategory: string): string {
  const raw = (description || '').trim();
  if (!raw) return `${fallbackCategory} (Tanpa Catatan)`;
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  return cleaned.length > 36 ? `${cleaned.slice(0, 34)}…` : cleaned;
}

export const CategorySubCategoryModal: React.FC<CategorySubCategoryModalProps> = ({
  isOpen,
  onClose,
  categoryKey,
  transactions,
  masterCategories = [],
  timelineMonthSet,
  primaryCategories,
  windowRangeLabel,
}) => {
  const isOthersBucket = categoryKey === 'Lainnya';

  const hierarchySource =
    masterCategories && masterCategories.length > 0
      ? masterCategories
      : DEFAULT_CATEGORY_HIERARCHY;

  const groupContext = useMemo(() => {
    if (isOthersBucket) return null;
    return findCategoryGroupContext(hierarchySource, categoryKey);
  }, [hierarchySource, categoryKey, isOthersBucket]);

  const [breakdownMode, setBreakdownMode] = useState<'descriptions' | 'siblings'>('descriptions');

  useEffect(() => {
    setBreakdownMode('descriptions');
  }, [categoryKey]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const { slices, totalAmount, totalTxCount, breakdownSubtitle } = useMemo(() => {
    const primarySet = new Set(primaryCategories);
    const activeMode = groupContext && breakdownMode === 'siblings' ? 'siblings' : 'descriptions';

    const bucketTotals = new Map<string, { amount: number; count: number; displayName: string }>();
    let grandTotal = 0;
    let txCount = 0;

    transactions.forEach((tx) => {
      if (!isOperatingExpense(tx) || tx.amount <= 0) return;
      const normalizedDate = normalizeLedgerDateYYYYMMDD(tx.date);
      if (!normalizedDate) return;
      const ym = normalizedDate.slice(0, 7);
      if (!timelineMonthSet.has(ym)) return;

      const rawCat = (tx.category || '').trim();
      const cat = rawCat && rawCat !== '-' ? rawCat : 'Tanpa Kategori';
      const absAmount = Math.abs(tx.amount || 0);

      let matchesScope = false;
      let sliceLabel = '';

      if (isOthersBucket) {
        if (!primarySet.has(cat)) {
          matchesScope = true;
          sliceLabel = cat;
        }
      } else if (activeMode === 'siblings' && groupContext) {
        if (groupContext.siblingNames.has(cat.toLowerCase())) {
          matchesScope = true;
          sliceLabel = cat;
        }
      } else {
        if (cat === categoryKey) {
          matchesScope = true;
          sliceLabel = normalizeMerchantLabel(tx.description, cat);
        }
      }

      if (!matchesScope) return;

      grandTotal += absAmount;
      txCount += 1;

      const mapKey = sliceLabel.toLowerCase();
      const existing = bucketTotals.get(mapKey);
      if (existing) {
        existing.amount += absAmount;
        existing.count += 1;
      } else {
        bucketTotals.set(mapKey, {
          amount: absAmount,
          count: 1,
          displayName: sliceLabel,
        });
      }
    });

    const sortedEntries = Array.from(bucketTotals.values()).sort((a, b) => b.amount - a.amount);

    const topEntries = sortedEntries.slice(0, 6);
    const remainingEntries = sortedEntries.slice(6);

    const computedSlices: SubCategorySlice[] = topEntries.map((entry, idx) => ({
      name: entry.displayName,
      value: Math.round(entry.amount),
      count: entry.count,
      percentage: grandTotal > 0 ? Math.round((entry.amount / grandTotal) * 1000) / 10 : 0,
      color: PIE_PALETTE[idx % (PIE_PALETTE.length - 1)],
    }));

    if (remainingEntries.length > 0) {
      const remAmount = remainingEntries.reduce((s, e) => s + e.amount, 0);
      const remCount = remainingEntries.reduce((s, e) => s + e.count, 0);
      computedSlices.push({
        name: `Lainnya (${remainingEntries.length} pos)`,
        value: Math.round(remAmount),
        count: remCount,
        percentage: grandTotal > 0 ? Math.round((remAmount / grandTotal) * 1000) / 10 : 0,
        color: PIE_PALETTE[PIE_PALETTE.length - 1],
      });
    }

    const subtitle = isOthersBucket
      ? 'Komposisi kategori minor di luar 5 besar'
      : activeMode === 'siblings' && groupContext
      ? `Komposisi kategori dalam grup ${groupContext.groupName}`
      : `Komposisi pos pengeluaran & deskripsi di ${categoryKey}`;

    return {
      slices: computedSlices,
      totalAmount: Math.round(grandTotal),
      totalTxCount: txCount,
      breakdownSubtitle: subtitle,
    };
  }, [
    transactions,
    timelineMonthSet,
    primaryCategories,
    isOthersBucket,
    categoryKey,
    groupContext,
    breakdownMode,
  ]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-fadeIn"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="category-drilldown-modal-title"
    >
      <div
        className="w-full max-w-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 p-5 sm:p-6 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-blue-600 text-white shrink-0">
              <PieChartIcon className="h-5 w-5" />
            </div>
            <div>
              <h3
                id="category-drilldown-modal-title"
                className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-slate-100"
              >
                Rincian Sub-Kategori: {categoryKey}
              </h3>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-1">
                <span>{breakdownSubtitle}</span>
                <span aria-hidden="true">·</span>
                <span>{windowRangeLabel}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums font-bold text-slate-700 dark:text-slate-200">
                  {totalTxCount} transaksi ({formatterIDR.format(totalAmount)})
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup modal rincian kategori"
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Optional Group Scope Switcher when leaf category belongs to a multi-item hierarchy group */}
        {!isOthersBucket && groupContext && (
          <div className="px-5 sm:px-6 pt-4 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Mode Pengelompokan:
            </span>
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <button
                type="button"
                onClick={() => setBreakdownMode('descriptions')}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition cursor-pointer whitespace-nowrap shrink-0 ${
                  breakdownMode === 'descriptions'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Deskripsi &amp; Merchant
              </button>
              <button
                type="button"
                onClick={() => setBreakdownMode('siblings')}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition cursor-pointer whitespace-nowrap shrink-0 ${
                  breakdownMode === 'siblings'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Grup: {groupContext.groupName}
              </button>
            </div>
          </div>
        )}

        {/* Body */}
        <div className="p-5 sm:p-6">
          {slices.length === 0 ? (
            <div className="py-10 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-500 dark:text-slate-400">
              Tidak ada data pengeluaran untuk rincian kategori ini pada rentang waktu yang dipilih.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
              {/* Left: Pie / Donut Chart */}
              <div className="md:col-span-5 h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={slices}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={52}
                      outerRadius={88}
                      paddingAngle={2}
                    >
                      {slices.map((slice) => (
                        <Cell key={slice.name} fill={slice.color} stroke="none" />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload || payload.length === 0) return null;
                        const item = payload[0].payload as SubCategorySlice;
                        return (
                          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 shadow-lg text-xs space-y-1">
                            <div className="font-bold text-slate-900 dark:text-slate-100">
                              {item.name}
                            </div>
                            <div className="font-mono tabular-nums font-bold text-slate-800 dark:text-slate-200">
                              {formatterIDR.format(item.value)} ({item.percentage}%)
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400">
                              {item.count} transaksi
                            </div>
                          </div>
                        );
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Right: Ranked Breakdown Table */}
              <div className="md:col-span-7 overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/60 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                      <th className="py-2.5 px-3">Sub-Kategori / Pos</th>
                      <th className="py-2.5 px-3 text-right whitespace-nowrap">Transaksi</th>
                      <th className="py-2.5 px-3 text-right whitespace-nowrap">Nominal</th>
                      <th className="py-2.5 px-3 text-right whitespace-nowrap">Porsi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {slices.map((slice) => (
                      <tr
                        key={slice.name}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="py-2.5 px-3 font-medium text-slate-800 dark:text-slate-100 max-w-[200px] truncate">
                          <span className="inline-flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-xs shrink-0"
                              style={{ backgroundColor: slice.color }}
                            />
                            <span className="truncate">{slice.name}</span>
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300 whitespace-nowrap">
                          {slice.count}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                          {formatterIDR.format(slice.value)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300 whitespace-nowrap">
                          {slice.percentage}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
