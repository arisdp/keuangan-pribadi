import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { Transaction } from '../types';
import { TrendingUp, TrendingDown, Calendar, Filter, Sparkles, AlertCircle, ArrowUpRight, ArrowDownRight, Layers } from 'lucide-react';

interface MonthlyExpenseD3TrendChartProps {
  transactions: Transaction[];
}

interface MonthlyData {
  monthKey: string; // YYYY-MM
  label: string;    // e.g. "Jan 26"
  fullLabel: string; // e.g. "Januari 2026"
  totalExpense: number;
  categoryBreakdown: Record<string, number>;
  momChangePercent: number | null; // % change vs previous month
}

export const MonthlyExpenseD3TrendChart: React.FC<MonthlyExpenseD3TrendChartProps> = ({ transactions }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const [timeRange, setTimeRange] = useState<'6m' | '12m' | 'all'>('12m');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [hoveredPoint, setHoveredPoint] = useState<{
    data: MonthlyData;
    x: number;
    y: number;
  } | null>(null);

  const formatterIDR = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

  // Unique expense categories
  const categoriesList = useMemo(() => {
    const cats = new Set<string>();
    transactions
      .filter((t) => t.type === 'expense' && !t.category.toLowerCase().includes('mutasi'))
      .forEach((t) => {
        if (t.category) cats.add(t.category);
      });
    return Array.from(cats).sort();
  }, [transactions]);

  // Aggregate monthly expense data
  const monthlyDataList = useMemo(() => {
    const isInternal = (cat: string) => cat.toLowerCase().includes('mutasi');
    const filteredTxs = transactions.filter((t) => {
      const isExpense = t.type === 'expense' && !isInternal(t.category);
      if (!isExpense) return false;
      if (selectedCategory !== 'all' && t.category !== selectedCategory) return false;
      return true;
    });

    const monthMap: Record<string, { total: number; categories: Record<string, number> }> = {};

    filteredTxs.forEach((t) => {
      if (!t.date) return;
      const key = t.date.substring(0, 7); // YYYY-MM
      if (!monthMap[key]) {
        monthMap[key] = { total: 0, categories: {} };
      }
      monthMap[key].total += Math.abs(t.amount);
      const cat = t.category || 'Lainnya';
      monthMap[key].categories[cat] = (monthMap[key].categories[cat] || 0) + Math.abs(t.amount);
    });

    let keys = Object.keys(monthMap).sort();

    // If no data, generate dummy structure for display
    if (keys.length === 0) {
      const now = new Date();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        monthMap[k] = { total: 0, categories: {} };
      }
      keys = Object.keys(monthMap).sort();
    }

    // Apply time range slicing
    if (timeRange === '6m') {
      keys = keys.slice(-6);
    } else if (timeRange === '12m') {
      keys = keys.slice(-12);
    }

    const monthNamesIndo = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];
    const monthShortIndo = [
      'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
      'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des'
    ];

    const result: MonthlyData[] = [];

    keys.forEach((key, index) => {
      const [yearStr, monthStr] = key.split('-');
      const monthIdx = parseInt(monthStr, 10) - 1;
      const label = `${monthShortIndo[monthIdx]} '${yearStr.slice(2)}`;
      const fullLabel = `${monthNamesIndo[monthIdx]} ${yearStr}`;

      const totalExpense = monthMap[key].total;
      const categoryBreakdown = monthMap[key].categories;

      let momChangePercent: number | null = null;
      if (index > 0) {
        const prevTotal = result[index - 1].totalExpense;
        if (prevTotal > 0) {
          momChangePercent = ((totalExpense - prevTotal) / prevTotal) * 100;
        } else if (totalExpense > 0) {
          momChangePercent = 100;
        } else {
          momChangePercent = 0;
        }
      }

      result.push({
        monthKey: key,
        label,
        fullLabel,
        totalExpense,
        categoryBreakdown,
        momChangePercent,
      });
    });

    return result;
  }, [transactions, selectedCategory, timeRange]);

  // Overall Statistics
  const totalPeriodExpense = useMemo(() => monthlyDataList.reduce((acc, m) => acc + m.totalExpense, 0), [monthlyDataList]);
  const avgMonthlyExpense = useMemo(() => monthlyDataList.length > 0 ? totalPeriodExpense / monthlyDataList.length : 0, [totalPeriodExpense, monthlyDataList]);

  const peakMonth = useMemo(() => {
    if (monthlyDataList.length === 0) return null;
    return [...monthlyDataList].sort((a, b) => b.totalExpense - a.totalExpense)[0];
  }, [monthlyDataList]);

  const lowestMonth = useMemo(() => {
    if (monthlyDataList.length === 0) return null;
    return [...monthlyDataList].sort((a, b) => a.totalExpense - b.totalExpense)[0];
  }, [monthlyDataList]);

  // Render D3 SVG Chart
  useEffect(() => {
    if (!svgRef.current || !containerRef.current || monthlyDataList.length === 0) return;

    const container = containerRef.current;
    const width = container.clientWidth || 700;
    const height = 320;
    const margin = { top: 30, right: 30, bottom: 45, left: 75 };

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    svg.attr('width', width).attr('height', height);

    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    // Gradient definition for area under line
    const defs = svg.append('defs');
    const gradient = defs
      .append('linearGradient')
      .attr('id', 'expense-area-gradient')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%');

    gradient.append('stop').attr('offset', '0%').attr('stop-color', '#e11d48').attr('stop-opacity', 0.35);
    gradient.append('stop').attr('offset', '100%').attr('stop-color', '#e11d48').attr('stop-opacity', 0.0);

    // X Scale
    const xScale = d3
      .scalePoint<string>()
      .domain(monthlyDataList.map((d) => d.label))
      .range([0, innerWidth])
      .padding(0.2);

    // Y Scale
    const maxVal = d3.max(monthlyDataList, (d: MonthlyData) => d.totalExpense) || 1000000;
    const yScale = d3
      .scaleLinear()
      .domain([0, (maxVal as number) * 1.15])
      .range([innerHeight, 0])
      .nice();

    // Horizontal Grid Lines
    const yAxisTicks = yScale.ticks(5);
    g.selectAll('.grid-line')
      .data(yAxisTicks)
      .enter()
      .append('line')
      .attr('class', 'grid-line')
      .attr('x1', 0)
      .attr('x2', innerWidth)
      .attr('y1', (d) => yScale(d))
      .attr('y2', (d) => yScale(d))
      .attr('stroke', '#f1f5f9')
      .attr('stroke-dasharray', '3,3');

    // X Axis
    const xAxis = d3.axisBottom(xScale);
    const xAxisG = g
      .append('g')
      .attr('transform', `translate(0, ${innerHeight})`)
      .call(xAxis);

    xAxisG.selectAll('text')
      .style('font-size', '11px')
      .style('font-weight', '700')
      .style('fill', '#64748b');

    xAxisG.selectAll('line').remove();
    xAxisG.select('.domain').attr('stroke', '#cbd5e1');

    // Y Axis
    const yAxis = d3.axisLeft(yScale).ticks(5).tickFormat((d) => {
      const val = d as number;
      if (val >= 1000000000) return `Rp${(val / 1000000000).toFixed(1)}B`;
      if (val >= 1000000) return `Rp${(val / 1000000).toFixed(1)}Jt`;
      if (val >= 1000) return `Rp${(val / 1000).toFixed(0)}rb`;
      return `Rp${val}`;
    });

    const yAxisG = g.call(yAxis);
    yAxisG.selectAll('text')
      .style('font-size', '10px')
      .style('font-weight', '700')
      .style('fill', '#64748b');

    yAxisG.selectAll('line').remove();
    yAxisG.select('.domain').remove();

    // Average Baseline Line
    if (avgMonthlyExpense > 0) {
      const avgY = yScale(avgMonthlyExpense);
      g.append('line')
        .attr('x1', 0)
        .attr('x2', innerWidth)
        .attr('y1', avgY)
        .attr('y2', avgY)
        .attr('stroke', '#94a3b8')
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '5,5');

      g.append('text')
        .attr('x', innerWidth - 5)
        .attr('y', avgY - 6)
        .attr('text-anchor', 'end')
        .style('font-size', '10px')
        .style('font-weight', '700')
        .style('fill', '#64748b')
        .text(`Rata-rata: ${formatterIDR.format(avgMonthlyExpense)}`);
    }

    // Area Generator
    const areaGenerator = d3
      .area<MonthlyData>()
      .x((d) => xScale(d.label) || 0)
      .y0(innerHeight)
      .y1((d) => yScale(d.totalExpense))
      .curve(d3.curveMonotoneX);

    g.append('path')
      .datum(monthlyDataList)
      .attr('fill', 'url(#expense-area-gradient)')
      .attr('d', areaGenerator);

    // Line Generator
    const lineGenerator = d3
      .line<MonthlyData>()
      .x((d) => xScale(d.label) || 0)
      .y((d) => yScale(d.totalExpense))
      .curve(d3.curveMonotoneX);

    g.append('path')
      .datum(monthlyDataList)
      .attr('fill', 'none')
      .attr('stroke', '#e11d48')
      .attr('stroke-width', 3.5)
      .attr('d', lineGenerator);

    // Data Circles & Hover Events
    g.selectAll('.data-circle')
      .data(monthlyDataList)
      .enter()
      .append('circle')
      .attr('class', 'data-circle')
      .attr('cx', (d: MonthlyData) => xScale(d.label) || 0)
      .attr('cy', (d: MonthlyData) => yScale(d.totalExpense))
      .attr('r', 5.5)
      .attr('fill', '#ffffff')
      .attr('stroke', '#e11d48')
      .attr('stroke-width', 2.5)
      .style('cursor', 'pointer')
      .on('mouseenter', (event, d) => {
        d3.select(event.currentTarget)
          .transition()
          .duration(150)
          .attr('r', 8)
          .attr('fill', '#e11d48')
          .attr('stroke', '#ffffff');

        const [cx, cy] = d3.pointer(event, container);
        setHoveredPoint({
          data: d,
          x: cx,
          y: cy,
        });
      })
      .on('mouseleave', (event) => {
        d3.select(event.currentTarget)
          .transition()
          .duration(150)
          .attr('r', 5.5)
          .attr('fill', '#ffffff')
          .attr('stroke', '#e11d48');

        setHoveredPoint(null);
      });

  }, [monthlyDataList, avgMonthlyExpense]);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-6">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-rose-500 text-white rounded-2xl shadow-md">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
              Grafik Tren Pengeluaran Bulanan (Interactive D3.js)
              <span className="text-[10px] font-extrabold bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                Fluctuation Analytics
              </span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Visualisasi tren dinamis untuk memantau lonjakan dan pola variasi pengeluaran dari bulan ke bulan.
            </p>
          </div>
        </div>

        {/* CONTROLS */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Category Filter */}
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer max-w-[150px] truncate"
            >
              <option value="all">Semua Kategori</option>
              {categoriesList.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Time Range Filter */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
            {(
              [
                { id: '6m', label: '6 Bulan' },
                { id: '12m', label: '12 Bulan' },
                { id: 'all', label: 'Semua' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                onClick={() => setTimeRange(t.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  timeRange === t.id
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI METRICS OVERVIEW */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
          <span className="text-[10px] font-extrabold uppercase text-slate-500 dark:text-slate-400 block">
            Rata-rata Pengeluaran / Bulan
          </span>
          <p className="text-base font-bold text-slate-800 dark:text-slate-100 mt-1">
            {formatterIDR.format(avgMonthlyExpense)}
          </p>
        </div>

        <div className="p-3.5 bg-rose-50/70 dark:bg-rose-950/30 rounded-xl border border-rose-200 dark:border-rose-800/60">
          <span className="text-[10px] font-extrabold uppercase text-rose-700 dark:text-rose-300 block">
            Bulan Pengeluaran Tertinggi
          </span>
          <p className="text-base font-bold text-rose-800 dark:text-rose-200 mt-1">
            {peakMonth ? `${peakMonth.fullLabel}: ${formatterIDR.format(peakMonth.totalExpense)}` : '-'}
          </p>
        </div>

        <div className="p-3.5 bg-emerald-50/70 dark:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-800/60">
          <span className="text-[10px] font-extrabold uppercase text-emerald-700 dark:text-emerald-300 block">
            Bulan Pengeluaran Terhemat
          </span>
          <p className="text-base font-bold text-emerald-800 dark:text-emerald-200 mt-1">
            {lowestMonth ? `${lowestMonth.fullLabel}: ${formatterIDR.format(lowestMonth.totalExpense)}` : '-'}
          </p>
        </div>
      </div>

      {/* SVG CHART CONTAINER */}
      <div ref={containerRef} className="relative w-full overflow-hidden pt-2">
        <svg ref={svgRef} className="w-full h-auto overflow-visible" />

        {/* HOVER TOOLTIP POPUP */}
        {hoveredPoint && (
          <div
            className="absolute z-30 pointer-events-none bg-slate-900 text-white text-xs p-3.5 rounded-xl shadow-2xl border border-slate-700 space-y-2 min-w-[200px] animate-fadeIn"
            style={{
              left: Math.min(hoveredPoint.x + 15, (containerRef.current?.clientWidth || 500) - 220),
              top: Math.max(10, hoveredPoint.y - 70),
            }}
          >
            <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-1.5">
              <span className="font-extrabold text-slate-200">{hoveredPoint.data.fullLabel}</span>
              {hoveredPoint.data.momChangePercent !== null && (
                <span
                  className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-md flex items-center gap-0.5 ${
                    hoveredPoint.data.momChangePercent > 0
                      ? 'bg-rose-950 text-rose-300 border border-rose-800'
                      : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                  }`}
                >
                  {hoveredPoint.data.momChangePercent > 0 ? (
                    <ArrowUpRight className="w-3 h-3" />
                  ) : (
                    <ArrowDownRight className="w-3 h-3" />
                  )}
                  {Math.abs(hoveredPoint.data.momChangePercent).toFixed(1)}% MoM
                </span>
              )}
            </div>

            <div>
              <span className="text-[10px] text-slate-400 block font-medium">Total Pengeluaran:</span>
              <span className="text-sm font-extrabold text-rose-400">
                {formatterIDR.format(hoveredPoint.data.totalExpense)}
              </span>
            </div>

            {/* Top Categories Breakdown */}
            {Object.keys(hoveredPoint.data.categoryBreakdown).length > 0 && (
              <div className="pt-1.5 border-t border-slate-800/80 space-y-1">
                <span className="text-[9px] font-extrabold uppercase text-slate-400 block">
                  Top Rincian Kategori:
                </span>
                {Object.entries(hoveredPoint.data.categoryBreakdown)
                  .sort((a, b) => (b[1] as number) - (a[1] as number))
                  .slice(0, 3)
                  .map(([cat, amt]) => (
                    <div key={cat} className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-300 truncate max-w-[120px]">{cat}:</span>
                      <span className="font-mono font-bold text-slate-100">{formatterIDR.format(amt as number)}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
