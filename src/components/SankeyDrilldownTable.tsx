import React, { useEffect, useMemo, useState } from 'react';
import { Account } from '../types';
import { normalizeLedgerDateYYYYMMDD } from '../utils/accountingEngine';
import { SankeyDrilldownSelection } from '../utils/cashFlowSankey';
import { formatterIDR } from '../utils/formatters';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Info,
  RotateCcw,
  Search,
  Table2,
  X,
} from 'lucide-react';

export interface SankeyDrilldownTableProps {
  selection: SankeyDrilldownSelection;
  accounts: Account[];
  onClearSelection: () => void;
}

type SortField = 'date' | 'amount';
type SortDirection = 'asc' | 'desc';

export const SankeyDrilldownTable: React.FC<SankeyDrilldownTableProps> = ({
  selection,
  accounts,
  onClearSelection,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedSubCategory, setSelectedSubCategory] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Reset search & sub-category filter whenever user clicks a different Sankey node/flow
  useEffect(() => {
    setSearchQuery('');
    setSelectedSubCategory(null);
  }, [selection.key]);

  const accountLookup = useMemo(() => {
    const map = new Map<string, Account>();
    accounts.forEach((a) => map.set(a.id, a));
    return map;
  }, [accounts]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const filteredAndSortedEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const filtered = selection.entries.filter(({ tx, attributionLabel }) => {
      const accName = accountLookup.get(tx.accountId)?.name || tx.accountId || '';
      const groupLabel = selection.groupByAccount
        ? accName
        : attributionLabel === 'Porsi Bunga KPR/Utang'
        ? 'Beban Bunga KPR / Pinjaman'
        : tx.category || accName;

      if (selectedSubCategory && groupLabel !== selectedSubCategory) return false;
      if (!q) return true;

      const normDate = normalizeLedgerDateYYYYMMDD(tx.date);
      return (
        (tx.description || '').toLowerCase().includes(q) ||
        (tx.category || '').toLowerCase().includes(q) ||
        accName.toLowerCase().includes(q) ||
        normDate.toLowerCase().includes(q) ||
        (attributionLabel || '').toLowerCase().includes(q)
      );
    });

    return filtered.slice().sort((a, b) => {
      if (sortField === 'amount') {
        const diff = a.effectiveAmount - b.effectiveAmount;
        return sortDirection === 'asc' ? diff : -diff;
      }
      const dateA = normalizeLedgerDateYYYYMMDD(a.tx.date) || a.tx.date || '';
      const dateB = normalizeLedgerDateYYYYMMDD(b.tx.date) || b.tx.date || '';
      const cmp = dateA.localeCompare(dateB);
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [
    selection.entries,
    selection.groupByAccount,
    searchQuery,
    selectedSubCategory,
    sortField,
    sortDirection,
    accountLookup,
  ]);

  const filteredSubtotal = useMemo(
    () => filteredAndSortedEntries.reduce((sum, item) => sum + item.effectiveAmount, 0),
    [filteredAndSortedEntries]
  );

  const hasActiveFilter = Boolean(searchQuery.trim() || selectedSubCategory);
  const incomeSharePct =
    selection.totalIncome > 0
      ? ((selection.volume / selection.totalIncome) * 100).toFixed(1)
      : null;

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="h-3.5 w-3.5 text-blue-600" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 text-blue-600" />
    );
  };

  return (
    <section
      aria-label={`Rincian Transaksi ${selection.title}`}
      className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-5 animate-fadeIn"
    >
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="p-2.5 bg-slate-900 text-white rounded-xl shrink-0">
            <Table2 className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h4 className="font-bold text-slate-900 text-base truncate">{selection.title}</h4>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-600 mt-0.5">
              <span>{selection.subtitle}</span>
              <span aria-hidden="true">·</span>
              <span className="font-semibold text-slate-700">{selection.periodRangeLabel}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums font-bold text-slate-900">
                {formatterIDR.format(selection.volume)}
              </span>
              {incomeSharePct !== null && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    {incomeSharePct}% dari pemasukan
                  </span>
                </>
              )}
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {selection.entries.length} transaksi penyusun
              </span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onClearSelection}
          className="px-3.5 py-2 bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg transition inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 self-start lg:self-auto"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Tutup Rincian &amp; Tampilkan Semua Aliran
        </button>
      </div>

      {/* Special Accounting Explanation for Calculated Surplus or Deficit Nodes */}
      {selection.isResidualNode || selection.isDeficitNode ? (
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 flex items-start gap-3">
          <Info
            className={`h-4 w-4 shrink-0 mt-0.5 ${
              selection.isDeficitNode ? 'text-rose-600' : 'text-emerald-600'
            }`}
          />
          <div className="space-y-1.5">
            <p className="font-semibold text-slate-900">
              {selection.isDeficitNode
                ? `Ringkasan Penyeimbang Defisit Periode ${selection.periodRangeLabel}`
                : `Ringkasan Surplus Kas Periode ${selection.periodRangeLabel}`}
            </p>
            <p className="font-mono tabular-nums text-slate-600 leading-relaxed">
              Pemasukan ({formatterIDR.format(selection.totalIncome)}) - Pengeluaran (
              {formatterIDR.format(selection.totalExpense)}) - Pokok Utang (
              {formatterIDR.format(selection.totalDebtPayment)}) - Tabungan (
              {formatterIDR.format(selection.totalSaving)}) - Investasi (
              {formatterIDR.format(selection.totalInvestment)}) ={' '}
              <strong
                className={selection.isDeficitNode ? 'text-rose-700' : 'text-emerald-700'}
              >
                {selection.isDeficitNode
                  ? `-${formatterIDR.format(selection.netDeficit)}`
                  : formatterIDR.format(selection.netSurplus)}
              </strong>
            </p>
            <p className="text-slate-500">
              {selection.isDeficitNode
                ? 'Simpul ini menampung selisih penarikan kas/saldo awal karena total arus keluar melebihi pemasukan pada periode terpilih.'
                : 'Simpul ini merupakan sisa kas bersih yang belum dipindahkan ke pos pengeluaran, utang, tabungan, maupun investasi.'}
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Sub-Category / Account Share Breakdown */}
          {selection.subCategoryBreakdown.length > 0 && (
            <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-800">
                  {selection.groupByAccount
                    ? 'Proporsi Per Rekening Sumber/Tujuan (Klik untuk filter tabel)'
                    : 'Proporsi Per Sub-Kategori (Klik untuk filter tabel)'}
                </span>
                {selectedSubCategory && (
                  <button
                    type="button"
                    onClick={() => setSelectedSubCategory(null)}
                    className="text-xs font-semibold text-blue-600 hover:underline cursor-pointer whitespace-nowrap"
                  >
                    Semua Sub-Kategori
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {selection.subCategoryBreakdown.map((item) => {
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
                      className={`w-full text-left p-2.5 rounded-lg border transition cursor-pointer ${
                        isSelected
                          ? 'bg-blue-50 border-blue-300'
                          : 'bg-white border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-xs mb-1.5">
                        <span className="font-semibold text-slate-800 truncate">
                          {item.label}{' '}
                          <span className="text-slate-500 font-normal font-mono tabular-nums">
                            ({item.count})
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

          {/* Search & Sort Controls Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari deskripsi, kategori, rekening, atau tanggal..."
                aria-label="Cari transaksi pada rincian Sankey"
                className="w-full pl-9 pr-8 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Hapus kata kunci pencarian"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <span className="text-xs text-slate-500">Urutkan:</span>
              <button
                type="button"
                onClick={() => toggleSort('date')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  sortField === 'date'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                Tanggal
                {sortField === 'date' ? (
                  sortDirection === 'asc' ? (
                    <ArrowUp className="h-3.5 w-3.5" />
                  ) : (
                    <ArrowDown className="h-3.5 w-3.5" />
                  )
                ) : (
                  <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />
                )}
              </button>
              <button
                type="button"
                onClick={() => toggleSort('amount')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  sortField === 'amount'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                Nominal
                {sortField === 'amount' ? (
                  sortDirection === 'asc' ? (
                    <ArrowUp className="h-3.5 w-3.5" />
                  ) : (
                    <ArrowDown className="h-3.5 w-3.5" />
                  )
                ) : (
                  <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />
                )}
              </button>
            </div>
          </div>

          {/* Transaction Table */}
          {filteredAndSortedEntries.length === 0 ? (
            <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <p className="text-sm font-semibold text-slate-700">
                Tidak ada transaksi yang cocok dengan filter saat ini.
              </p>
              <p className="text-xs text-slate-500">
                Ubah kata kunci pencarian atau tampilkan semua sub-kategori untuk melihat rincian.
              </p>
              {hasActiveFilter && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedSubCategory(null);
                  }}
                  className="mt-2 px-3.5 py-2 text-xs font-semibold text-blue-700 bg-white border border-blue-200 hover:bg-blue-50 rounded-lg transition cursor-pointer"
                >
                  Reset Filter Tabel
                </button>
              )}
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto max-h-80">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 sticky top-0 z-10">
                    <tr>
                      <th className="py-2.5 px-3.5 font-semibold">
                        <button
                          type="button"
                          onClick={() => toggleSort('date')}
                          className="inline-flex items-center gap-1 hover:text-slate-900 cursor-pointer"
                        >
                          Tanggal
                          {renderSortIcon('date')}
                        </button>
                      </th>
                      <th className="py-2.5 px-3.5 font-semibold">Deskripsi</th>
                      <th className="py-2.5 px-3.5 font-semibold">Kategori</th>
                      <th className="py-2.5 px-3.5 font-semibold">Rekening</th>
                      <th className="py-2.5 px-3.5 font-semibold text-right">
                        <button
                          type="button"
                          onClick={() => toggleSort('amount')}
                          className="inline-flex items-center gap-1 hover:text-slate-900 cursor-pointer ml-auto"
                        >
                          Nominal
                          {renderSortIcon('amount')}
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredAndSortedEntries.map(
                      ({ tx, effectiveAmount, attributionLabel }, idx) => {
                        const acc = accountLookup.get(tx.accountId);
                        return (
                          <tr key={`${tx.id}-${idx}`} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-2.5 px-3.5 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                              {normalizeLedgerDateYYYYMMDD(tx.date)}
                            </td>
                            <td className="py-2.5 px-3.5 text-slate-900 font-medium">
                              <div>{tx.description || '-'}</div>
                              {attributionLabel && (
                                <span className="text-[11px] text-slate-500">
                                  Atribusi: {attributionLabel}
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3.5 text-slate-600 whitespace-nowrap">
                              {tx.category}
                            </td>
                            <td className="py-2.5 px-3.5 text-slate-600 whitespace-nowrap">
                              {acc?.name || tx.accountId}
                            </td>
                            <td className="py-2.5 px-3.5 text-right font-mono tabular-nums font-bold text-slate-900 whitespace-nowrap">
                              {formatterIDR.format(effectiveAmount)}
                            </td>
                          </tr>
                        );
                      }
                    )}
                  </tbody>
                </table>
              </div>

              {/* Footer Filtered Subtotal Summary */}
              <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div className="text-slate-600 font-mono tabular-nums">
                  Menampilkan <strong>{filteredAndSortedEntries.length}</strong> dari{' '}
                  <strong>{selection.entries.length}</strong> transaksi
                  {selectedSubCategory ? ` · Filter: ${selectedSubCategory}` : ''}
                </div>
                <div className="font-mono tabular-nums text-slate-700">
                  {hasActiveFilter ? 'Subtotal Terfilter: ' : 'Total Rincian: '}
                  <strong className="text-slate-900">
                    {formatterIDR.format(filteredSubtotal)}
                  </strong>
                  {hasActiveFilter && selection.volume > 0 && (
                    <span className="text-slate-500">
                      {' '}
                      / {formatterIDR.format(selection.volume)} (
                      {((filteredSubtotal / selection.volume) * 100).toFixed(1)}%)
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
};
