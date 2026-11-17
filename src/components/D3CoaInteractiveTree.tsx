import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { CategoryNode } from '../categoryHierarchy';
import { Transaction } from '../types';
import { AccountCOA, DEFAULT_COA_LIST } from './MasterCategoryManager';
import {
  FolderTree,
  Search,
  Move,
  Layers,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Tag,
  CheckCircle2,
  Sparkles,
  Info,
  ArrowRight,
  GripVertical,
  Filter,
} from 'lucide-react';

interface D3CoaInteractiveTreeProps {
  categories: CategoryNode[];
  coaList?: AccountCOA[];
  transactions: Transaction[];
  onReassignCategory: (txId: string, newCategory: string) => void;
}

interface TreeNodeData {
  id: string;
  name: string;
  code?: string;
  type?: 'root' | 'type' | 'group' | 'item';
  normalBalance?: 'Debet' | 'Kredit';
  categoryType?: string;
  txCount: number;
  totalAmount: number;
  children?: TreeNodeData[];
  _children?: TreeNodeData[]; // for collapse state
}

const formatterIDR = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

export const D3CoaInteractiveTree: React.FC<D3CoaInteractiveTreeProps> = ({
  categories,
  coaList = DEFAULT_COA_LIST,
  transactions,
  onReassignCategory,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [searchTxQuery, setSearchTxQuery] = useState('');
  const [draggedTxId, setDraggedTxId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Map category to tx stats
  const safeTransactions = useMemo(() => (Array.isArray(transactions) ? transactions : []), [transactions]);
  const safeCoaList = useMemo(() => (Array.isArray(coaList) ? coaList : DEFAULT_COA_LIST), [coaList]);

  const categoryStats = useMemo(() => {
    const stats: Record<string, { count: number; totalAmount: number }> = {};
    safeTransactions.forEach((tx) => {
      if (!tx) return;
      const cat = tx.category || 'Lain-lain';
      if (!stats[cat]) {
        stats[cat] = { count: 0, totalAmount: 0 };
      }
      stats[cat].count += 1;
      stats[cat].totalAmount += Math.abs(tx.amount || 0);
    });
    return stats;
  }, [safeTransactions]);

  // Build Hierarchical COA Tree Data
  const treeData = useMemo<TreeNodeData>(() => {
    const coaGroups: Record<string, { name: string; category: string; code: string; items: AccountCOA[] }> = {
      Asset: { name: '1000 - ASET / HARTA', category: 'Asset', code: '1000', items: [] },
      Liability: { name: '2000 - KEWAJIBAN / UTANG', category: 'Liability', code: '2000', items: [] },
      Equity: { name: '3000 - EKUITAS / MODAL', category: 'Equity', code: '3000', items: [] },
      Income: { name: '4000 - PENDAPATAN / OMSET', category: 'Income', code: '4000', items: [] },
      Expense: { name: '5000 - BEBAN / PENGELUARAN', category: 'Expense', code: '5000', items: [] },
    };

    safeCoaList.forEach((item) => {
      if (item && item.category && coaGroups[item.category]) {
        coaGroups[item.category].items.push(item);
      }
    });

    const rootChildren: TreeNodeData[] = Object.values(coaGroups).map((grp) => {
      let grpTxCount = 0;
      let grpTotalAmt = 0;

      const accountNodes: TreeNodeData[] = (grp.items.map((acc): TreeNodeData | null => {
        if (!acc) return null;
        const name = acc.name || 'Unnamed COA';
        const code = acc.code || '0000';
        // Find matching stats
        const stat = categoryStats[name] || { count: 0, totalAmount: 0 };
        grpTxCount += stat.count;
        grpTotalAmt += stat.totalAmount;

        return {
          id: `coa-${code}`,
          name,
          code,
          type: 'item' as const,
          normalBalance: acc.normalBalance || 'Debet',
          categoryType: acc.category || grp.category,
          txCount: stat.count,
          totalAmount: stat.totalAmount,
        };
      })).filter((n): n is TreeNodeData => n !== null);

      return {
        id: `grp-${grp.code}`,
        name: grp.name,
        code: grp.code,
        type: 'group' as const,
        categoryType: grp.category,
        txCount: grpTxCount,
        totalAmount: grpTotalAmt,
        children: accountNodes,
      };
    });

    const totalTx = safeTransactions.length;
    const totalSum = safeTransactions.reduce((s, t) => s + Math.abs(t?.amount || 0), 0);

    return {
      id: 'root-coa',
      name: 'Chart of Accounts (COA)',
      type: 'root',
      txCount: totalTx,
      totalAmount: totalSum,
      children: rootChildren,
    };
  }, [safeCoaList, categoryStats, safeTransactions]);

  // Render D3 Tree
  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    try {
      const container = containerRef.current;
      const width = container.clientWidth || 900;
      const height = 620;

      const svg = d3.select(svgRef.current);
      svg.selectAll('*').remove(); // Clear previous render

      svg.attr('width', width).attr('height', height);

      const g = svg.append('g').attr('class', 'tree-viewport');

      // Zoom setup
      const zoomBehavior = d3
        .zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.4, 2.5])
        .on('zoom', (event) => {
          g.attr('transform', event.transform);
        });

      svg.call(zoomBehavior as any);

      // Initial center transform
      const initialTransform = d3.zoomIdentity.translate(80, height / 2).scale(0.85);
      svg.call(zoomBehavior.transform as any, initialTransform);

      // D3 Hierarchy & Tree Layout
      const root = d3.hierarchy<TreeNodeData>(treeData);
      const treeLayout = d3.tree<TreeNodeData>().nodeSize([48, 220]);

      treeLayout(root);

      // Links
      const linkGenerator = d3
        .linkHorizontal<any, d3.HierarchyPointNode<TreeNodeData>>()
        .x((d) => d.y)
        .y((d) => d.x);

      g.append('g')
        .attr('class', 'links')
        .selectAll('path')
        .data(root.links())
        .enter()
        .append('path')
        .attr('d', linkGenerator as any)
        .attr('fill', 'none')
        .attr('stroke', (d) => {
          const catType = d.target?.data?.categoryType;
          if (catType === 'Asset') return '#10b981';
          if (catType === 'Liability') return '#ef4444';
          if (catType === 'Equity') return '#8b5cf6';
          if (catType === 'Income') return '#3b82f6';
          if (catType === 'Expense') return '#f59e0b';
          return '#cbd5e1';
        })
        .attr('stroke-opacity', 0.5)
        .attr('stroke-width', 2);

      // Nodes
      const nodes = g
        .append('g')
        .attr('class', 'nodes')
        .selectAll('g')
        .data(root.descendants())
        .enter()
        .append('g')
        .attr('transform', (d) => `translate(${d.y},${d.x})`)
        .style('cursor', 'pointer');

      // Node rect background
      nodes
        .append('rect')
        .attr('x', -8)
        .attr('y', -18)
        .attr('width', (d) => (d.data?.type === 'root' ? 180 : d.data?.type === 'group' ? 220 : 250))
        .attr('height', 36)
        .attr('rx', 8)
        .attr('fill', (d) => {
          if (d.data?.id === hoveredNodeId) return '#ecfdf5';
          if (d.data?.type === 'root') return '#0f172a';
          if (d.data?.type === 'group') return '#f8fafc';
          return '#ffffff';
        })
        .attr('stroke', (d) => {
          if (d.data?.id === hoveredNodeId) return '#10b981';
          const catType = d.data?.categoryType;
          if (catType === 'Asset') return '#10b981';
          if (catType === 'Liability') return '#f43f5e';
          if (catType === 'Equity') return '#a855f7';
          if (catType === 'Income') return '#3b82f6';
          if (catType === 'Expense') return '#f59e0b';
          return '#e2e8f0';
        })
        .attr('stroke-width', (d) => (d.data?.id === hoveredNodeId ? 2.5 : 1.5))
        .attr('filter', 'drop-shadow(0 2px 4px rgba(0,0,0,0.05))');

      // Node circle indicator
      nodes
        .append('circle')
        .attr('cx', 0)
        .attr('cy', 0)
        .attr('r', 5)
        .attr('fill', (d) => {
          const catType = d.data?.categoryType;
          if (catType === 'Asset') return '#10b981';
          if (catType === 'Liability') return '#f43f5e';
          if (catType === 'Equity') return '#a855f7';
          if (catType === 'Income') return '#3b82f6';
          if (catType === 'Expense') return '#f59e0b';
          return '#3b82f6';
        });

      // Node title text
      nodes
        .append('text')
        .attr('x', 12)
        .attr('y', -2)
        .attr('fill', (d) => (d.data?.type === 'root' ? '#ffffff' : '#1e293b'))
        .attr('font-size', '11px')
        .attr('font-weight', (d) => (d.data?.type === 'item' ? '600' : '800'))
        .text((d) => {
          const name = d.data?.name || '';
          return name.length > 28 ? name.substring(0, 26) + '...' : name;
        });

      // Node badge text (Tx Count & Amount)
      nodes
        .append('text')
        .attr('x', 12)
        .attr('y', 11)
        .attr('fill', (d) => (d.data?.type === 'root' ? '#94a3b8' : '#64748b'))
        .attr('font-size', '9px')
        .attr('font-family', 'monospace')
        .text((d) => `${d.data?.txCount || 0} tx • ${formatterIDR.format(d.data?.totalAmount || 0)}`);

      // HTML5 Drop Event handler on nodes
      nodes.each(function (d) {
        const nodeElem = d3.select(this);
        const nodeData = d.data;
        if (!nodeData) return;

        // Make group or item nodes drop targets
        if (nodeData.type === 'item' || nodeData.type === 'group') {
          const domNode = nodeElem.node() as SVGElement;
          if (domNode) {
            domNode.addEventListener('dragover', (e: DragEvent) => {
              e.preventDefault();
              setHoveredNodeId(nodeData.id);
            });

            domNode.addEventListener('dragleave', () => {
              setHoveredNodeId(null);
            });

            domNode.addEventListener('drop', (e: DragEvent) => {
              e.preventDefault();
              setHoveredNodeId(null);
              const txId = e.dataTransfer?.getData('text/plain');
              if (txId && nodeData.name) {
                // Extract clean category name (strip code if present)
                const cleanCategoryName = nodeData.name.replace(/^\d+\s*-\s*/, '');
                onReassignCategory(txId, cleanCategoryName);

                const matchedTx = safeTransactions.find((t) => t.id === txId);
                const txDesc = matchedTx?.description || matchedTx?.category || 'Transaksi';
                setToastMessage(
                  `Berhasil memindahkan "${txDesc}" ke kategori "${cleanCategoryName}"!`
                );

                setTimeout(() => setToastMessage(null), 4000);
              }
            });
          }
        }
      });
    } catch (err) {
      console.error('Error rendering D3 COA Tree Canvas:', err);
    }
  }, [treeData, hoveredNodeId, safeTransactions, onReassignCategory]);

  // Filtered transactions for Draggable Drawer
  const filteredDrawerTxs = useMemo(() => {
    if (!searchTxQuery.trim()) return transactions.slice(0, 20);
    const q = searchTxQuery.toLowerCase();
    return transactions.filter(
      (t) =>
        t.category.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        String(t.amount).includes(q)
    ).slice(0, 30);
  }, [transactions, searchTxQuery]);

  const handleResetZoom = () => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    const initialTransform = d3.zoomIdentity.translate(80, 620 / 2).scale(0.85);
    svg.transition().duration(500).call(d3.zoom().transform as any, initialTransform);
  };

  return (
    <div className="space-y-4">
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white p-3.5 rounded-2xl shadow-lg border border-emerald-400 flex items-center justify-between gap-3 text-xs font-extrabold animate-slide-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-200 shrink-0" />
            <span>{toastMessage}</span>
          </div>
          <button
            onClick={() => setToastMessage(null)}
            className="text-emerald-200 hover:text-white transition cursor-pointer text-xs uppercase"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Main Split Layout: Drawer + D3 Canvas */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* LEFT DRAWER: Draggable Transaction Pills */}
        <div className="lg:col-span-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 rounded-xl">
                <Move className="h-4 w-4" />
              </div>
              <div>
                <h4 className="text-xs font-black text-slate-800 dark:text-slate-100 uppercase tracking-wider">
                  Drag Transaksi ke Tree
                </h4>
                <p className="text-[10px] text-slate-500 font-medium">
                  Tarik transaksi di bawah dan lepas pada node COA untuk mere-kategorisasi
                </p>
              </div>
            </div>
            <span className="text-[10px] bg-slate-100 dark:bg-slate-800 font-bold px-2 py-0.5 rounded-full text-slate-600 dark:text-slate-300">
              {transactions.length} Tx
            </span>
          </div>

          {/* Search Tx Input */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Cari transaksi untuk di-drag..."
              value={searchTxQuery}
              onChange={(e) => setSearchTxQuery(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Draggable Transaction Cards Container */}
          <div className="max-h-[500px] overflow-y-auto space-y-2 pr-1">
            {filteredDrawerTxs.map((tx) => (
              <div
                key={tx.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', tx.id);
                  setDraggedTxId(tx.id);
                }}
                onDragEnd={() => setDraggedTxId(null)}
                className={`p-3 bg-slate-50 dark:bg-slate-800/80 hover:bg-blue-50 dark:hover:bg-blue-950/40 border border-slate-200 dark:border-slate-700 rounded-xl transition cursor-grab active:cursor-grabbing flex items-center justify-between gap-2 group shadow-2xs ${
                  draggedTxId === tx.id ? 'opacity-40 border-dashed border-blue-500' : ''
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <GripVertical className="h-4 w-4 text-slate-300 dark:text-slate-600 group-hover:text-blue-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                      {tx.description || tx.category}
                    </p>
                    <p className="text-[10px] text-slate-500 flex items-center gap-1">
                      <Tag className="h-3 w-3 text-slate-400" />
                      <span className="font-semibold text-blue-600 dark:text-blue-400">{tx.category}</span>
                      <span>• {tx.date}</span>
                    </p>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span
                    className={`text-xs font-extrabold font-mono ${
                      tx.type === 'income'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {formatterIDR.format(tx.amount)}
                  </span>
                </div>
              </div>
            ))}

            {filteredDrawerTxs.length === 0 && (
              <p className="text-xs text-center text-slate-400 py-6">
                Tidak ada transaksi yang cocok dengan pencarian.
              </p>
            )}
          </div>
        </div>

        {/* RIGHT D3 TREE VIEWPORT */}
        <div
          ref={containerRef}
          className="lg:col-span-8 bg-slate-950 rounded-2xl border border-slate-800 shadow-xl overflow-hidden relative flex flex-col min-h-[620px]"
        >
          {/* Header Controls */}
          <div className="p-3.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-3 text-white">
            <div className="flex items-center gap-2">
              <FolderTree className="h-4 w-4 text-blue-400" />
              <span className="text-xs font-black uppercase tracking-wider">
                Pohon Visual COA (D3 Interactive Canvas)
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleResetZoom}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[10px] font-extrabold transition cursor-pointer flex items-center gap-1 border border-slate-700"
                title="Reset Tampilan Tree ke Tengah"
              >
                <RotateCcw className="h-3 w-3" />
                Reset View
              </button>
            </div>
          </div>

          {/* Legend Banner */}
          <div className="bg-slate-900/80 px-4 py-2 border-b border-slate-800 flex flex-wrap items-center gap-4 text-[10px] font-bold text-slate-300">
            <span className="text-slate-400 uppercase font-extrabold">Legenda COA:</span>
            <span className="flex items-center gap-1 text-emerald-400">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> 1000 Aset
            </span>
            <span className="flex items-center gap-1 text-rose-400">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" /> 2000 Kewajiban
            </span>
            <span className="flex items-center gap-1 text-purple-400">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-500 inline-block" /> 3000 Ekuitas
            </span>
            <span className="flex items-center gap-1 text-blue-400">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" /> 4000 Pendapatan
            </span>
            <span className="flex items-center gap-1 text-amber-400">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" /> 5000 Beban
            </span>
          </div>

          {/* SVG Canvas */}
          <div className="flex-1 w-full h-[540px] relative bg-radial from-slate-900 to-slate-950">
            <svg ref={svgRef} className="w-full h-full select-none"></svg>
          </div>
        </div>
      </div>
    </div>
  );
};
