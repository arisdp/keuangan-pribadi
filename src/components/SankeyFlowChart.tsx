import React, { useMemo, useState } from 'react';
import { Transaction } from '../types';
import { classifyTransaction } from '../utils/accountingEngine';
import { formatterIDR } from '../utils/formatters';
import { sankey as d3Sankey, sankeyLinkHorizontal, SankeyNode, SankeyLink } from 'd3-sankey';
import { 
  GitCommit, 
  AlertTriangle, 
  CheckCircle2, 
  Zap,
} from 'lucide-react';

interface SankeyFlowChartProps {
  transactions: Transaction[];
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
}

type CustomSankeyNode = SankeyNode<CustomSankeyNodeExtra, CustomSankeyLinkExtra>;
type CustomSankeyLink = SankeyLink<CustomSankeyNodeExtra, CustomSankeyLinkExtra>;

export const SankeyFlowChart: React.FC<SankeyFlowChartProps> = ({ transactions }) => {
  const [hoveredNode, setHoveredNode] = useState<CustomSankeyNode | null>(null);
  const [hoveredLink, setHoveredLink] = useState<CustomSankeyLink | null>(null);

  // 1. CONSTRUCT SANKEY GRAPH DATA FROM TRANSACTIONS (Accounting-accurate classification)
  const sankeyData = useMemo(() => {
    const incomeCategoryMap: Record<string, number> = {};
    const expenseCategoryMap: Record<string, number> = {};
    let totalSaving = 0;
    let totalInvestment = 0;
    let totalDebtPayment = 0;

    transactions.forEach((tx) => {
      const amt = Math.abs(tx.amount || 0);
      if (amt <= 0) return;

      const nature = classifyTransaction(tx);
      switch (nature) {
        case 'operating_income': {
          const cat = tx.category || 'Pendapatan Lain-lain';
          incomeCategoryMap[cat] = (incomeCategoryMap[cat] || 0) + amt;
          break;
        }
        case 'operating_expense': {
          const cat = tx.category || 'Beban Lainnya';
          expenseCategoryMap[cat] = (expenseCategoryMap[cat] || 0) + amt;
          break;
        }
        case 'emergency_fund_transfer': {
          if (tx.type !== 'income') totalSaving += amt;
          break;
        }
        case 'investment_buy': {
          totalInvestment += amt;
          break;
        }
        case 'debt_principal_pay': {
          if (tx.type !== 'income') totalDebtPayment += amt;
          break;
        }
        default:
          // Exclude internal_transfer, debt_proceeds, equity_injection, investment_sell from consumption Sankey
          break;
      }
    });

    const totalIncome = Object.values(incomeCategoryMap).reduce((a, b) => a + b, 0);
    const totalExpense = Object.values(expenseCategoryMap).reduce((a, b) => a + b, 0);
    const netSurplus = Math.max(
      0,
      totalIncome - (totalExpense + totalSaving + totalInvestment + totalDebtPayment)
    );

    // Nodes List
    const nodesExtra: CustomSankeyNodeExtra[] = [];
    const linksExtra: { source: number; target: number; value: number }[] = [];

    // Helper index tracker
    const nodeIndexMap = new Map<string, number>();

    const addNode = (id: string, name: string, categoryType: CustomSankeyNodeExtra['categoryType'], color: string) => {
      if (nodeIndexMap.has(id)) return nodeIndexMap.get(id)!;
      const idx = nodesExtra.length;
      nodesExtra.push({ id, name, categoryType, color });
      nodeIndexMap.set(id, idx);
      return idx;
    };

    // --- LEFT COLUMN: INCOME SOURCES ---
    const incomeNodeIds: { id: string; amount: number }[] = [];
    if (Object.keys(incomeCategoryMap).length === 0) {
      addNode('inc-default', 'Pendapatan Default', 'income', '#10b981');
      incomeNodeIds.push({ id: 'inc-default', amount: 1000000 });
    } else {
      Object.entries(incomeCategoryMap).forEach(([cat, amount]) => {
        const nodeId = `inc-${cat}`;
        addNode(nodeId, cat, 'income', '#059669');
        incomeNodeIds.push({ id: nodeId, amount });
      });
    }

    // --- MIDDLE COLUMN: MAIN POOL ---
    const poolIdx = addNode('pool-total', 'Total Arus Kas Masuk', 'pool', '#3b82f6');

    // Connect Income Nodes -> Main Pool
    incomeNodeIds.forEach((inc) => {
      const incIdx = nodeIndexMap.get(inc.id)!;
      if (inc.amount > 0) {
        linksExtra.push({ source: incIdx, target: poolIdx, value: inc.amount });
      }
    });

    // --- MIDDLE-RIGHT COLUMN: ALLOCATION HUB NODES ---
    const opPoolIdx = addNode('pool-op', 'Pengeluaran Operasional', 'pool', '#f43f5e');
    const debtPoolIdx = addNode('pool-debt', 'Cicilan & Pelunasan Utang', 'debt', '#f59e0b');
    const savPoolIdx = addNode('pool-sav', 'Alokasi Tabungan & Darurat', 'savings', '#0284c7');
    const invPoolIdx = addNode('pool-inv', 'Alokasi Portofolio Investasi', 'investment', '#8b5cf6');

    if (totalExpense > 0) {
      linksExtra.push({ source: poolIdx, target: opPoolIdx, value: totalExpense });
    }
    if (totalDebtPayment > 0) {
      linksExtra.push({ source: poolIdx, target: debtPoolIdx, value: totalDebtPayment });
    }
    if (totalSaving > 0) {
      linksExtra.push({ source: poolIdx, target: savPoolIdx, value: totalSaving });
    }
    if (totalInvestment > 0) {
      linksExtra.push({ source: poolIdx, target: invPoolIdx, value: totalInvestment });
    }
    if (netSurplus > 0) {
      const surplusIdx = addNode('pool-surplus', 'Surplus Kas Belum Dialokasi', 'savings', '#10b981');
      linksExtra.push({ source: poolIdx, target: surplusIdx, value: netSurplus });
    }

    // --- RIGHT COLUMN: EXPENSE BREAKDOWNS ---
    const expenseColors = ['#e11d48', '#ea580c', '#d97706', '#ca8a04', '#65a30d', '#2563eb', '#9333ea'];
    let expColorIdx = 0;

    Object.entries(expenseCategoryMap).forEach(([cat, amount]) => {
      if (amount > 0) {
        const catIdx = addNode(
          `exp-${cat}`,
          cat,
          'expense',
          expenseColors[expColorIdx % expenseColors.length]
        );
        expColorIdx++;
        linksExtra.push({ source: opPoolIdx, target: catIdx, value: amount });
      }
    });

    return {
      nodesExtra,
      linksExtra,
      totalIncome,
      totalExpense,
      totalDebtPayment,
      totalSaving,
      totalInvestment,
      netSurplus,
    };
  }, [transactions]);

  // 2. RUN D3 SANKEY LAYOUT ALGORITHM
  const width = 850;
  const height = 420;

  const sankeyGraph = useMemo(() => {
    if (sankeyData.nodesExtra.length === 0 || sankeyData.linksExtra.length === 0) {
      return null;
    }

    // Clone data for d3 mutation
    const nodesCopy: CustomSankeyNodeExtra[] = JSON.parse(JSON.stringify(sankeyData.nodesExtra));
    const linksCopy: CustomSankeyLinkExtra[] = JSON.parse(JSON.stringify(sankeyData.linksExtra));

    const sankeyLayout = d3Sankey<CustomSankeyNodeExtra, CustomSankeyLinkExtra>()
      .nodeWidth(18)
      .nodePadding(20)
      .extent([[10, 10], [width - 10, height - 10]]);

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

  // 3. LEAK DETECTOR ALGORITHM
  const leaks = useMemo(() => {
    const list: { title: string; desc: string; severity: 'high' | 'medium' | 'info'; amount: number }[] = [];
    const inc = sankeyData.totalIncome;

    if (inc > 0) {
      // Leak 1: Expense ratio > 70%
      const expRatio = (sankeyData.totalExpense / inc) * 100;
      if (expRatio > 70) {
        list.push({
          title: 'Kebocoran Konsumsi Tinggi',
          desc: `Total pengeluaran memakan ${expRatio.toFixed(1)}% dari seluruh pemasukan. Idealnya < 70%.`,
          severity: expRatio > 85 ? 'high' : 'medium',
          amount: sankeyData.totalExpense,
        });
      }

      // Leak 2: Savings & Investment < 20%
      const savRatio = ((sankeyData.totalSaving + sankeyData.totalInvestment) / inc) * 100;
      if (savRatio < 20) {
        list.push({
          title: 'Alokasi Pertumbuhan Aset Rendah',
          desc: `Hanya ${savRatio.toFixed(1)}% pemasukan yang dialokasikan ke tabungan & investasi (Target CFP >= 20%).`,
          severity: savRatio < 10 ? 'high' : 'medium',
          amount: sankeyData.totalSaving + sankeyData.totalInvestment,
        });
      }

      // Leak 3: Unallocated Surplus
      if (sankeyData.netSurplus > 0) {
        list.push({
          title: 'Kas Mangkrak Belum Berinvestasi',
          desc: `Terdapat ${formatterIDR.format(sankeyData.netSurplus)} sisa kas mengendap yang belum dialokasikan ke tujuan investasi spesifik.`,
          severity: 'info',
          amount: sankeyData.netSurplus,
        });
      }
    }

    return list;
  }, [sankeyData]);

  return (
    <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-md space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-tr from-blue-600 to-indigo-600 text-white rounded-2xl shadow-sm">
            <GitCommit className="h-6 w-6" />
          </div>
          <div>
            <h3 className="font-extrabold text-slate-900 dark:text-slate-100 text-base flex items-center gap-2">
              <span>Diagram Alir Sankey & Deteksi Kebocoran Kas</span>
              <span className="px-2.5 py-0.5 bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 text-[10px] font-black rounded-full uppercase border border-blue-300 dark:border-blue-800">
                d3 Fund Flow
              </span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Visualisasi interaktif jalur arus dana dari sumber pendapatan menuju alokasi operasional & portofolio.
            </p>
          </div>
        </div>

        {/* Legend pills */}
        <div className="flex items-center gap-2 flex-wrap text-[10px] font-extrabold">
          <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 rounded-lg flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500" /> Income
          </span>
          <span className="px-2.5 py-1 bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 rounded-lg flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-rose-500" /> Expense
          </span>
          <span className="px-2.5 py-1 bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 rounded-lg flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-500" /> Cicilan Utang
          </span>
          <span className="px-2.5 py-1 bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300 rounded-lg flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-sky-500" /> Savings
          </span>
          <span className="px-2.5 py-1 bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 rounded-lg flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-purple-500" /> Investment
          </span>
        </div>
      </div>

      {/* Sankey Chart Render */}
      {!sankeyGraph || sankeyGraph.nodes.length === 0 ? (
        <div className="p-12 text-center bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
          <GitCommit className="h-10 w-10 text-slate-400 mx-auto animate-pulse" />
          <p className="text-xs text-slate-500 font-bold">
            Belum ada transaksi arus kas untuk membentuk Diagram Sankey.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="w-full overflow-x-auto bg-slate-900/5 dark:bg-slate-950 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
            <svg
              viewBox={`0 0 ${width} ${height}`}
              className="w-full h-auto min-w-[700px] select-none"
            >
              {/* Links */}
              <g fill="none" strokeOpacity={0.4}>
                {sankeyGraph.links.map((link, idx) => {
                  const pathGenerator = sankeyLinkHorizontal();
                  const d = pathGenerator(link as any) || undefined;
                  const sourceNode = link.source as CustomSankeyNode;
                  const isHovered = hoveredLink === link || (hoveredNode && (link.source === hoveredNode || link.target === hoveredNode));

                  return (
                    <path
                      key={idx}
                      d={d}
                      stroke={sourceNode.color || '#94a3b8'}
                      strokeWidth={Math.max(2, link.width || 0)}
                      strokeOpacity={isHovered ? 0.8 : 0.35}
                      className="transition-all duration-200 cursor-pointer hover:stroke-opacity-80"
                      onMouseEnter={() => setHoveredLink(link)}
                      onMouseLeave={() => setHoveredLink(null)}
                    >
                      <title>{`${(link.source as CustomSankeyNode).name} ➔ ${(link.target as CustomSankeyNode).name}: ${formatterIDR.format(link.value)}`}</title>
                    </path>
                  );
                })}
              </g>

              {/* Nodes */}
              <g>
                {sankeyGraph.nodes.map((node, idx) => {
                  const nodeWidth = (node.x1 || 0) - (node.x0 || 0);
                  const nodeHeight = Math.max(12, (node.y1 || 0) - (node.y0 || 0));
                  const isHovered = hoveredNode === node;

                  return (
                    <g
                      key={idx}
                      transform={`translate(${node.x0}, ${node.y0})`}
                      className="cursor-pointer"
                      onMouseEnter={() => setHoveredNode(node)}
                      onMouseLeave={() => setHoveredNode(null)}
                    >
                      {/* Node Rect */}
                      <rect
                        width={nodeWidth}
                        height={nodeHeight}
                        fill={node.color}
                        rx={4}
                        className={`transition-all duration-200 ${isHovered ? 'filter brightness-125 stroke-2 stroke-white' : ''}`}
                      >
                        <title>{`${node.name}: ${formatterIDR.format(node.value || 0)}`}</title>
                      </rect>

                      {/* Node Label Text */}
                      <text
                        x={(node.x0 || 0) < width / 2 ? nodeWidth + 8 : -8}
                        y={nodeHeight / 2}
                        dy="0.35em"
                        textAnchor={(node.x0 || 0) < width / 2 ? 'start' : 'end'}
                        className="text-[11px] font-extrabold fill-slate-800 dark:fill-slate-100 pointer-events-none drop-shadow-xs"
                      >
                        {node.name} ({formatterIDR.format(node.value || 0)})
                      </text>
                    </g>
                  );
                })}
              </g>
            </svg>
          </div>

          {/* Hover Details Card */}
          {(hoveredNode || hoveredLink) && (
            <div className="p-3 bg-slate-900 text-white rounded-xl text-xs flex items-center justify-between font-mono animate-fadeIn">
              {hoveredNode && (
                <span>
                  ⚡ Node Focused: <strong>{hoveredNode.name}</strong> ➔ Volume: {formatterIDR.format(hoveredNode.value || 0)}
                </span>
              )}
              {hoveredLink && (
                <span>
                  🔀 Flow Stream: <strong>{(hoveredLink.source as CustomSankeyNode).name}</strong> ➔ <strong>{(hoveredLink.target as CustomSankeyNode).name}</strong>: {formatterIDR.format(hoveredLink.value)}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Leak Alerts Section */}
      <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
        <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-500" />
          <span>Hasil Analisis Kebocoran Arus Kas (Fund Leak Audit)</span>
        </h4>

        {leaks.length === 0 ? (
          <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center gap-3 text-emerald-900 dark:text-emerald-200 text-xs font-medium">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
            <div>
              <strong>Arus Kas Sangat Efisien!</strong> Tidak terdeteksi adanya kebocoran signifikan. Alokasi operasional dan pertumbuhan aset berjalan sesuai norma CFP.
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {leaks.map((leak, idx) => (
              <div
                key={idx}
                className={`p-4 rounded-xl border space-y-1 ${
                  leak.severity === 'high'
                    ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200'
                    : leak.severity === 'medium'
                    ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200'
                    : 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-200'
                }`}
              >
                <div className="flex items-center justify-between font-extrabold text-xs">
                  <span className="flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    {leak.title}
                  </span>
                  <span className="font-mono text-[11px]">
                    {formatterIDR.format(leak.amount)}
                  </span>
                </div>
                <p className="text-[11px] opacity-90 leading-relaxed font-medium">
                  {leak.desc}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
