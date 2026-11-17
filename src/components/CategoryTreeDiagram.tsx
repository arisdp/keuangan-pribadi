import React, { useState, useMemo } from 'react';
import { CategoryNode } from '../categoryHierarchy';
import { Transaction } from '../types';
import {
  GitFork,
  ChevronRight,
  ChevronDown,
  Layers,
  Tag,
  DollarSign,
  Maximize2,
  Minimize2,
  Search,
  CheckCircle2,
  ListFilter,
  PieChart,
  Sparkles,
  Info,
  ArrowRight,
} from 'lucide-react';

interface CategoryTreeDiagramProps {
  categories: CategoryNode[];
  transactions?: Transaction[];
}

export const CategoryTreeDiagram: React.FC<CategoryTreeDiagramProps> = ({
  categories,
  transactions = [],
}) => {
  const [filterType, setFilterType] = useState<'all' | 'equity' | 'income' | 'expense'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNode, setSelectedNode] = useState<CategoryNode | null>(null);

  // State to track expanded nodes
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({
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

  // Calculate totals per category
  const categoryStats = useMemo(() => {
    const amountMap: Record<string, { total: number; count: number }> = {};

    transactions.forEach((tx) => {
      if (!tx.category) return;
      const key = tx.category.toLowerCase().trim();
      if (!amountMap[key]) {
        amountMap[key] = { total: 0, count: 0 };
      }
      amountMap[key].total += tx.amount || 0;
      amountMap[key].count += 1;
    });

    return amountMap;
  }, [transactions]);

  // Recursively calculate stats for a node
  const getNodeCalculatedStats = (node: CategoryNode): { total: number; count: number } => {
    if (node.children && node.children.length > 0) {
      return node.children.reduce(
        (acc, child) => {
          const cStats = getNodeCalculatedStats(child);
          return {
            total: acc.total + cStats.total,
            count: acc.count + cStats.count,
          };
        },
        { total: 0, count: 0 }
      );
    }

    const keyByName = node.name.toLowerCase().trim();
    const keyById = node.id.toLowerCase().trim();
    const directByName = categoryStats[keyByName] || { total: 0, count: 0 };
    const directById = categoryStats[keyById] || { total: 0, count: 0 };

    return {
      total: directByName.total || directById.total || 0,
      count: directByName.count || directById.count || 0,
    };
  };

  const toggleNode = (id: string) => {
    setExpandedNodes((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const expandAll = () => {
    const all: Record<string, boolean> = {};
    const traverse = (nodes: CategoryNode[]) => {
      nodes.forEach((n) => {
        all[n.id] = true;
        if (n.children) traverse(n.children);
      });
    };
    traverse(categories);
    setExpandedNodes(all);
  };

  const collapseAll = () => {
    setExpandedNodes({
      'type-equity': true,
      'type-income': true,
      'type-expense': true,
    });
  };

  const formatterIDR = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  });

  const filteredRootCategories = categories.filter((cat) => {
    if (filterType === 'all') return true;
    if (filterType === 'equity') return cat.transactionType === 'equity' || cat.id === 'type-equity';
    if (filterType === 'income') return cat.transactionType === 'income' || cat.id === 'type-income';
    if (filterType === 'expense') return cat.transactionType === 'expense' || cat.id === 'type-expense';
    return true;
  });

  // Render a visual tree node item
  const renderTreeNodeCard = (node: CategoryNode, isLastChild = false, parentType?: string) => {
    const isExpanded = Boolean(expandedNodes[node.id]);
    const hasChildren = Boolean(node.children && node.children.length > 0);
    const stats = getNodeCalculatedStats(node);

    const matchesSearch =
      !searchQuery ||
      node.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (node.children && node.children.some((c) => c.name.toLowerCase().includes(searchQuery.toLowerCase())));

    if (!matchesSearch) return null;

    // Visual theme styling based on node level & transaction type
    let rootTheme = 'border-slate-200 bg-white text-slate-800';
    let badgeBg = 'bg-slate-100 text-slate-700';
    let iconBg = 'bg-slate-100 text-slate-600';

    if (node.type === 'type') {
      if (node.transactionType === 'equity' || node.id === 'type-equity') {
        rootTheme = 'border-purple-300 bg-gradient-to-r from-purple-50 via-indigo-50 to-white text-purple-950 shadow-sm';
        badgeBg = 'bg-purple-100 text-purple-800 font-extrabold';
        iconBg = 'bg-purple-600 text-white';
      } else if (node.transactionType === 'income' || node.id === 'type-income') {
        rootTheme = 'border-emerald-300 bg-gradient-to-r from-emerald-50 via-teal-50 to-white text-emerald-950 shadow-sm';
        badgeBg = 'bg-emerald-100 text-emerald-800 font-extrabold';
        iconBg = 'bg-emerald-600 text-white';
      } else {
        rootTheme = 'border-rose-300 bg-gradient-to-r from-rose-50 via-orange-50 to-white text-rose-950 shadow-sm';
        badgeBg = 'bg-rose-100 text-rose-800 font-extrabold';
        iconBg = 'bg-rose-600 text-white';
      }
    } else if (node.type === 'group') {
      rootTheme = 'border-slate-300 bg-slate-50/90 hover:bg-slate-100 text-slate-900';
      badgeBg = 'bg-blue-100 text-blue-800 font-bold';
      iconBg = 'bg-blue-100 text-blue-700';
    } else if (node.type === 'subgroup') {
      rootTheme = 'border-amber-200 bg-amber-50/60 hover:bg-amber-50 text-amber-950';
      badgeBg = 'bg-amber-100 text-amber-800 font-medium';
      iconBg = 'bg-amber-100 text-amber-700';
    } else {
      rootTheme = 'border-slate-200 bg-white hover:border-blue-300 text-slate-700 hover:shadow-2xs';
      badgeBg = 'bg-slate-100 text-slate-600';
      iconBg = 'bg-slate-100 text-slate-500';
    }

    const isSelected = selectedNode?.id === node.id;

    return (
      <div key={node.id} className="relative my-2 select-none group/node">
        {/* Branch Connecting Card */}
        <div className="flex items-start gap-2">
          <div
            onClick={() => setSelectedNode(node)}
            className={`flex-1 p-3.5 rounded-2xl border transition-all duration-200 cursor-pointer ${rootTheme} ${
              isSelected ? 'ring-2 ring-blue-500 ring-offset-2 shadow-md' : ''
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                {hasChildren && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleNode(node.id);
                    }}
                    className="p-1 hover:bg-black/5 rounded-lg transition text-slate-600 shrink-0 cursor-pointer"
                  >
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                )}

                <div className={`p-1.5 rounded-xl shrink-0 ${iconBg}`}>
                  {node.type === 'type' ? (
                    <Layers className="h-4 w-4" />
                  ) : node.type === 'group' ? (
                    <GitFork className="h-3.5 w-3.5" />
                  ) : (
                    <Tag className="h-3.5 w-3.5" />
                  )}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-extrabold text-xs sm:text-sm tracking-tight truncate">{node.name}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider ${badgeBg}`}>
                      {node.type === 'type'
                        ? 'Level 1 (Tipe)'
                        : node.type === 'group'
                        ? 'Level 2 (Kelompok)'
                        : node.type === 'subgroup'
                        ? 'Level 3 (Sub Kelompok)'
                        : 'Level 4 (Kategori)'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Transaction Amount Badge */}
              <div className="text-right shrink-0">
                <span className="text-xs font-mono font-black block text-slate-800">
                  {stats.total > 0 ? formatterIDR.format(stats.total) : 'Rp 0'}
                </span>
                <span className="text-[10px] font-semibold text-slate-400">
                  {stats.count} Transaksi
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Children Visual Tree Branch */}
        {hasChildren && isExpanded && (
          <div className="relative pl-6 sm:pl-8 mt-2 space-y-1.5 before:absolute before:left-3 sm:before:left-4 before:top-0 before:bottom-3 before:w-0.5 before:bg-slate-200">
            {node.children!.map((child, idx) => {
              const isLast = idx === node.children!.length - 1;
              return (
                <div key={child.id} className="relative before:absolute before:-left-3 sm:before:-left-4 before:top-5 before:w-3 sm:before:w-4 before:h-0.5 before:bg-slate-200">
                  {renderTreeNodeCard(child, isLast, node.type)}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* Top Header Controls Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
            <GitFork className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-black text-slate-800 text-sm tracking-tight flex items-center gap-2">
              <span>Diagram Pohon Hirarki Kategori (Category Tree Visualizer)</span>
              <span className="text-[10px] bg-indigo-100 text-indigo-800 font-extrabold px-2 py-0.5 rounded-full">Visual Tree</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Eksplorasi hubungan antar tingkat kategori keuangan beserta total akumulasi transaksi secara visual.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Type Filter Buttons */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-bold">
            <button
              type="button"
              onClick={() => setFilterType('all')}
              className={`px-3 py-1 rounded-lg transition ${
                filterType === 'all' ? 'bg-white text-slate-900 shadow-xs font-extrabold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Semua
            </button>
            <button
              type="button"
              onClick={() => setFilterType('income')}
              className={`px-3 py-1 rounded-lg transition ${
                filterType === 'income' ? 'bg-emerald-600 text-white shadow-xs font-extrabold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Pendapatan
            </button>
            <button
              type="button"
              onClick={() => setFilterType('expense')}
              className={`px-3 py-1 rounded-lg transition ${
                filterType === 'expense' ? 'bg-rose-600 text-white shadow-xs font-extrabold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Pengeluaran
            </button>
            <button
              type="button"
              onClick={() => setFilterType('equity')}
              className={`px-3 py-1 rounded-lg transition ${
                filterType === 'equity' ? 'bg-purple-600 text-white shadow-xs font-extrabold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Ekuitas
            </button>
          </div>

          <button
            type="button"
            onClick={expandAll}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            Buka
          </button>
          <button
            type="button"
            onClick={collapseAll}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
          >
            <Minimize2 className="h-3.5 w-3.5" />
            Tutup
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input
          type="text"
          placeholder="Cari node dalam pohon kategori..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-xs"
        />
      </div>

      {/* Main Grid: Tree Visualization + Node Detail Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Visual Tree Column (2 cols) */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <span className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-indigo-600" />
              Bagan Pohon Bertingkat (Tree Nodes)
            </span>
            <span className="text-[11px] text-slate-500 font-semibold">
              Klik pada kotak untuk melihat rincian node
            </span>
          </div>

          <div className="divide-y divide-slate-100 pt-1">
            {filteredRootCategories.map((rootNode) => renderTreeNodeCard(rootNode))}
          </div>
        </div>

        {/* Node Detail Inspector Sidebar (1 col) */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4 h-fit sticky top-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Info className="h-4 w-4 text-indigo-600" />
            <h4 className="font-extrabold text-slate-800 text-xs uppercase tracking-wider">
              Inspektur Detail Kategori
            </h4>
          </div>

          {selectedNode ? (
            <div className="space-y-4 animate-fadeIn">
              <div className="p-3.5 bg-indigo-50/70 border border-indigo-100 rounded-2xl space-y-2">
                <span className="text-[10px] font-black uppercase text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-full">
                  {selectedNode.type}
                </span>
                <h5 className="font-black text-slate-900 text-base">{selectedNode.name}</h5>
                <p className="text-xs text-slate-600 font-medium">ID Node: <code className="bg-slate-200/70 px-1.5 py-0.5 rounded text-[11px]">{selectedNode.id}</code></p>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center py-2 border-b border-slate-100">
                  <span className="text-slate-500 font-semibold">Total Transaksi Terakumulasi</span>
                  <span className="font-mono font-black text-slate-900">
                    {formatterIDR.format(getNodeCalculatedStats(selectedNode).total)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-100">
                  <span className="text-slate-500 font-semibold">Jumlah Catatan Transaksi</span>
                  <span className="font-bold text-slate-800">
                    {getNodeCalculatedStats(selectedNode).count} item
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-100">
                  <span className="text-slate-500 font-semibold">Jumlah Sub-Anak (Children)</span>
                  <span className="font-bold text-slate-800">
                    {selectedNode.children ? selectedNode.children.length : 0} sub
                  </span>
                </div>
              </div>

              {selectedNode.children && selectedNode.children.length > 0 && (
                <div className="space-y-2 pt-2">
                  <span className="text-xs font-extrabold text-slate-800 block">Daftar Sub-Kategori Di Bawahnya:</span>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {selectedNode.children.map((child) => (
                      <div
                        key={child.id}
                        onClick={() => setSelectedNode(child)}
                        className="flex items-center justify-between p-2 bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 rounded-xl transition cursor-pointer text-xs"
                      >
                        <span className="font-bold text-slate-800 truncate">{child.name}</span>
                        <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="py-12 text-center text-slate-400 space-y-2">
              <PieChart className="h-10 w-10 mx-auto text-slate-300" />
              <p className="text-xs font-semibold text-slate-500">
                Pilih salah satu node pada bagan pohon di sebelah kiri untuk melihat rincian detailnya.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
