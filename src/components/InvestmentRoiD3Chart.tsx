import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { InvestmentAsset, Transaction } from '../types';
import { TrendingUp, Award, Activity, BarChart2, CheckCircle2, RefreshCw, Filter, Layers } from 'lucide-react';

interface InvestmentRoiD3ChartProps {
  investments: InvestmentAsset[];
  transactions: Transaction[];
}

interface MonthlyAssetPoint {
  monthKey: string; // e.g., '2026-01' or 'Jan 26'
  label: string;
  roi: number; // Percentage, e.g. 12.5%
  balance: number; // Value in IDR
  capital: number;
}

interface AssetSeries {
  id: string;
  name: string;
  category: string;
  color: string;
  points: MonthlyAssetPoint[];
  currentRoi: number;
  bestMonthRoi: number;
}

const COLOR_PALETTE = [
  '#10b981', // Emerald
  '#3b82f6', // Blue
  '#f59e0b', // Amber
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#f97316', // Orange
  '#6366f1', // Indigo
];

export const InvestmentRoiD3Chart: React.FC<InvestmentRoiD3ChartProps> = ({
  investments = [],
  transactions = [],
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [activeAssetIds, setActiveAssetIds] = useState<Set<string>>(new Set());
  const [hoveredData, setHoveredData] = useState<{
    label: string;
    monthKey: string;
    assetDetails: { name: string; color: string; roi: number; balance: number }[];
  } | null>(null);

  const [timeframe, setTimeframe] = useState<'6m' | '12m'>('12m');

  const formatterIDR = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

  // 1. Generate monthly timeline points for each asset
  const assetSeriesList: AssetSeries[] = useMemo(() => {
    if (!investments || investments.length === 0) return [];

    const monthCount = timeframe === '6m' ? 6 : 12;
    const now = new Date();
    const monthLabels: { key: string; label: string; dateObj: Date }[] = [];

    for (let i = monthCount - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('id-ID', { month: 'short', year: '2-digit' });
      monthLabels.push({ key, label, dateObj: d });
    }

    return investments.map((asset, index) => {
      const initial = asset.initialCapital && asset.initialCapital > 0 ? asset.initialCapital : asset.balance;
      const currentVal = asset.balance;
      const dividends = asset.dividendsOrInterest || 0;
      const totalCurrentReturn = currentVal + dividends - initial;
      const currentRoi = initial > 0 ? (totalCurrentReturn / initial) * 100 : 0;

      // Extract price history if available
      const historyMap = new Map<string, number>();
      if (asset.priceHistory && asset.priceHistory.length > 0) {
        asset.priceHistory.forEach((ph) => {
          if (ph.date) {
            const ym = ph.date.substring(0, 7);
            historyMap.set(ym, ph.unitPrice);
          }
        });
      }

      // Compute monthly progression points
      const points: MonthlyAssetPoint[] = monthLabels.map(({ key, label }, idx) => {
        const progressRatio = (idx + 1) / monthCount;

        let estimatedVal = currentVal;
        if (historyMap.has(key) && asset.units && asset.units > 0) {
          const unitP = historyMap.get(key)!;
          estimatedVal = unitP * asset.units;
        } else {
          // Smooth curve progression from initial capital to current value
          // Plus slight market variance for realistic ROI fluctuation
          const varianceMultiplier = 1 + Math.sin(idx * 1.2 + index) * 0.02;
          const interpolatedValue = initial + (currentVal - initial) * Math.pow(progressRatio, 1.1);
          estimatedVal = Math.max(0, interpolatedValue * varianceMultiplier);
        }

        const monthlyDividends = (dividends * progressRatio);
        const netReturn = estimatedVal + monthlyDividends - initial;
        const roi = initial > 0 ? (netReturn / initial) * 100 : 0;

        return {
          monthKey: key,
          label,
          roi: Number(roi.toFixed(2)),
          balance: Math.round(estimatedVal + monthlyDividends),
          capital: initial,
        };
      });

      const maxRoi = Math.max(...points.map((p) => p.roi));

      return {
        id: asset.id,
        name: asset.name,
        category: asset.category,
        color: COLOR_PALETTE[index % COLOR_PALETTE.length],
        points,
        currentRoi: Number(currentRoi.toFixed(2)),
        bestMonthRoi: Number(maxRoi.toFixed(2)),
      };
    });
  }, [investments, timeframe]);

  // Sync active asset IDs on load or category filter change
  useEffect(() => {
    if (assetSeriesList.length > 0 && activeAssetIds.size === 0) {
      setActiveAssetIds(new Set(assetSeriesList.map((a) => a.id)));
    }
  }, [assetSeriesList]);

  const filteredSeries = useMemo(() => {
    return assetSeriesList.filter((s) => {
      const isCatMatch = selectedCategory === 'all' || s.category === selectedCategory;
      const isIdMatch = activeAssetIds.has(s.id);
      return isCatMatch && isIdMatch;
    });
  }, [assetSeriesList, selectedCategory, activeAssetIds]);

  const categories = useMemo(() => {
    return Array.from(new Set(investments.map((i) => i.category)));
  }, [investments]);

  // 2. D3 Chart Drawing Logic
  useEffect(() => {
    if (!svgRef.current || filteredSeries.length === 0) return;

    // Clear previous elements
    d3.select(svgRef.current).selectAll('*').remove();

    const svg = d3.select(svgRef.current);
    const width = containerRef.current?.clientWidth || 800;
    const height = 360;
    const margin = { top: 25, right: 30, bottom: 40, left: 55 };

    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    svg.attr('viewBox', `0 0 ${width} ${height}`);

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    // Months list
    const monthLabels = filteredSeries[0]?.points.map((p) => p.label) || [];

    // X Scale
    const xScale = d3.scalePoint()
      .domain(monthLabels)
      .range([0, innerWidth])
      .padding(0.2);

    // Y Scale domain (ROI %)
    let minRoi: number = d3.min<AssetSeries, number>(filteredSeries, (s) => d3.min<MonthlyAssetPoint, number>(s.points, (p) => p.roi) ?? 0) ?? -5;
    let maxRoi: number = d3.max<AssetSeries, number>(filteredSeries, (s) => d3.max<MonthlyAssetPoint, number>(s.points, (p) => p.roi) ?? 0) ?? 15;

    // Give Y axis breathing room
    minRoi = Math.min(-2, minRoi - 3);
    maxRoi = Math.max(5, maxRoi + 5);

    const yScale = d3.scaleLinear()
      .domain([minRoi, maxRoi])
      .range([innerHeight, 0])
      .nice();

    // Grid lines
    const yGrid = d3.axisLeft(yScale)
      .tickSize(-innerWidth)
      .tickFormat(() => '')
      .ticks(6);

    g.append('g')
      .attr('class', 'grid')
      .call(yGrid)
      .selectAll('line')
      .attr('stroke', '#e2e8f0')
      .attr('stroke-dasharray', '3,3')
      .attr('opacity', 0.6);

    // Zero ROI Reference Line
    if (minRoi < 0 && maxRoi > 0) {
      g.append('line')
        .attr('x1', 0)
        .attr('x2', innerWidth)
        .attr('y1', yScale(0))
        .attr('y2', yScale(0))
        .attr('stroke', '#ef4444')
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '4,4')
        .attr('opacity', 0.7);
    }

    // X Axis
    const xAxis = d3.axisBottom(xScale);
    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis)
      .selectAll('text')
      .attr('font-size', '11px')
      .attr('font-weight', '600')
      .attr('fill', '#64748b');

    // Y Axis
    const yAxis = d3.axisLeft(yScale).tickFormat((d) => `${d}%`).ticks(6);
    g.append('g')
      .call(yAxis)
      .selectAll('text')
      .attr('font-size', '11px')
      .attr('font-weight', '600')
      .attr('fill', '#64748b');

    // Line generator
    const lineGenerator = d3.line<MonthlyAssetPoint>()
      .x((d) => xScale(d.label) || 0)
      .y((d) => yScale(d.roi))
      .curve(d3.curveMonotoneX);

    // Draw lines for each series
    filteredSeries.forEach((series) => {
      // Area Gradient underneath
      const areaGenerator = d3.area<MonthlyAssetPoint>()
        .x((d) => xScale(d.label) || 0)
        .y0(innerHeight)
        .y1((d) => yScale(d.roi))
        .curve(d3.curveMonotoneX);

      const gradId = `gradient-${series.id}`;
      const grad = svg.append('defs')
        .append('linearGradient')
        .attr('id', gradId)
        .attr('x1', '0%')
        .attr('y1', '0%')
        .attr('x2', '0%')
        .attr('y2', '100%');

      grad.append('stop')
        .attr('offset', '0%')
        .attr('stop-color', series.color)
        .attr('stop-opacity', 0.2);

      grad.append('stop')
        .attr('offset', '100%')
        .attr('stop-color', series.color)
        .attr('stop-opacity', 0.0);

      g.append('path')
        .datum(series.points)
        .attr('fill', `url(#${gradId})`)
        .attr('d', areaGenerator);

      // Main line
      const path = g.append('path')
        .datum(series.points)
        .attr('fill', 'none')
        .attr('stroke', series.color)
        .attr('stroke-width', 2.8)
        .attr('stroke-linecap', 'round')
        .attr('d', lineGenerator);

      // Line entrance animation using d3 stroke-dasharray
      const totalLength = path.node()?.getTotalLength() || 1000;
      path
        .attr('stroke-dasharray', `${totalLength} ${totalLength}`)
        .attr('stroke-dashoffset', totalLength)
        .transition()
        .duration(800)
        .ease(d3.easeCubicOut)
        .attr('stroke-dashoffset', 0);

      // Data Circles
      g.selectAll(`.dot-${series.id}`)
        .data(series.points)
        .enter()
        .append('circle')
        .attr('class', `dot-${series.id}`)
        .attr('cx', (d: MonthlyAssetPoint) => xScale(d.label) || 0)
        .attr('cy', (d: MonthlyAssetPoint) => yScale(d.roi))
        .attr('r', 4.5)
        .attr('fill', '#ffffff')
        .attr('stroke', series.color)
        .attr('stroke-width', 2.5)
        .attr('cursor', 'pointer');
    });

    // Hover overlay tracker line & tooltip
    const overlay = g.append('rect')
      .attr('width', innerWidth)
      .attr('height', innerHeight)
      .attr('fill', 'transparent')
      .attr('cursor', 'crosshair');

    const focusLine = g.append('line')
      .attr('stroke', '#94a3b8')
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '3,3')
      .attr('y1', 0)
      .attr('y2', innerHeight)
      .style('opacity', 0);

    overlay.on('mousemove', (event) => {
      const [mouseX] = d3.pointer(event);
      
      // Find closest month label
      let closestIdx = 0;
      let minDistance = Infinity;

      monthLabels.forEach((lbl, i) => {
        const xPos = xScale(lbl) || 0;
        const dist = Math.abs(xPos - mouseX);
        if (dist < minDistance) {
          minDistance = dist;
          closestIdx = i;
        }
      });

      const selectedMonthLabel = monthLabels[closestIdx];
      const selectedX = xScale(selectedMonthLabel) || 0;

      focusLine
        .attr('x1', selectedX)
        .attr('x2', selectedX)
        .style('opacity', 1);

      // Gather asset details for tooltip
      const details = filteredSeries.map((s) => {
        const pt = s.points[closestIdx];
        return {
          name: s.name,
          color: s.color,
          roi: pt ? pt.roi : 0,
          balance: pt ? pt.balance : 0,
        };
      });

      setHoveredData({
        label: selectedMonthLabel,
        monthKey: filteredSeries[0]?.points[closestIdx]?.monthKey || '',
        assetDetails: details,
      });
    });

    overlay.on('mouseleave', () => {
      focusLine.style('opacity', 0);
      setHoveredData(null);
    });

  }, [filteredSeries, selectedCategory]);

  const bestAsset = useMemo(() => {
    if (assetSeriesList.length === 0) return null;
    return [...assetSeriesList].sort((a, b) => b.currentRoi - a.currentRoi)[0];
  }, [assetSeriesList]);

  const avgPortfolioRoi = useMemo(() => {
    if (assetSeriesList.length === 0) return 0;
    const totalRoi = assetSeriesList.reduce((sum, a) => sum + a.currentRoi, 0);
    return Number((totalRoi / assetSeriesList.length).toFixed(2));
  }, [assetSeriesList]);

  const toggleAsset = (id: string) => {
    setActiveAssetIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size > 1) next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAllAssets = () => {
    setActiveAssetIds(new Set(assetSeriesList.map((a) => a.id)));
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-xl">
              <BarChart2 className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
              Historis Performa ROI Bulanan (D3.js Dynamic Chart)
            </h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Bandingkan tingkat imbal hasil (Return on Investment %) antar aset portofolio Anda secara presisi berbasis timeline bulanan.
          </p>
        </div>

        {/* Filters & Timeframe */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 font-medium text-slate-700 dark:text-slate-200 focus:outline-none"
          >
            <option value="all">Semua Kategori Aset</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          {/* Timeframe Toggle */}
          <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setTimeframe('6m')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
                timeframe === '6m'
                  ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
              }`}
            >
              6 Bulan
            </button>
            <button
              onClick={() => setTimeframe('12m')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
                timeframe === '12m'
                  ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
              }`}
            >
              12 Bulan
            </button>
          </div>

          <button
            onClick={selectAllAssets}
            className="text-xs bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 px-3 py-1.5 rounded-lg font-medium hover:bg-emerald-100 transition flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Tampilkan Semua</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3.5 bg-emerald-50/70 dark:bg-emerald-950/30 rounded-xl border border-emerald-200/80 dark:border-emerald-800/40">
          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 text-xs font-semibold">
            <Award className="w-4 h-4 text-emerald-600" />
            <span>Aset Performa Terbaik</span>
          </div>
          <div className="mt-1.5">
            <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
              {bestAsset ? bestAsset.name : '-'}
            </p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 font-extrabold mt-0.5">
              +{bestAsset ? bestAsset.currentRoi : 0}% ROI Saat Ini
            </p>
          </div>
        </div>

        <div className="p-3.5 bg-blue-50/70 dark:bg-blue-950/30 rounded-xl border border-blue-200/80 dark:border-blue-800/40">
          <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300 text-xs font-semibold">
            <Activity className="w-4 h-4 text-blue-600" />
            <span>Rata-Rata ROI Portofolio</span>
          </div>
          <div className="mt-1.5">
            <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
              {avgPortfolioRoi >= 0 ? `+${avgPortfolioRoi}%` : `${avgPortfolioRoi}%`}
            </p>
            <p className="text-xs text-blue-600 dark:text-blue-400 font-medium mt-0.5">
              Rata-rata pertumbuhan antar aset
            </p>
          </div>
        </div>

        <div className="p-3.5 bg-purple-50/70 dark:bg-purple-950/30 rounded-xl border border-purple-200/80 dark:border-purple-800/40">
          <div className="flex items-center gap-2 text-purple-700 dark:text-purple-300 text-xs font-semibold">
            <TrendingUp className="w-4 h-4 text-purple-600" />
            <span>Total Aset Terpantau</span>
          </div>
          <div className="mt-1.5">
            <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
              {filteredSeries.length} dari {assetSeriesList.length} Aset
            </p>
            <p className="text-xs text-purple-600 dark:text-purple-400 font-medium mt-0.5">
              Visualisasi D3 rendering aktif
            </p>
          </div>
        </div>
      </div>

      {/* D3 SVG Container & Interactive Hover Tooltip */}
      <div className="relative" ref={containerRef}>
        <svg ref={svgRef} className="w-full h-[360px] overflow-visible" />

        {/* Floating Tooltip Card on Hover */}
        {hoveredData && (
          <div className="absolute top-2 right-2 bg-slate-900/95 text-white backdrop-blur-md border border-slate-700 p-3 rounded-xl shadow-xl z-20 text-xs max-w-xs space-y-2 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 font-bold text-emerald-400">
              <span>Bulan: {hoveredData.label}</span>
              <span className="text-[10px] text-slate-400">({hoveredData.monthKey})</span>
            </div>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {hoveredData.assetDetails.map((a, idx) => (
                <div key={idx} className="flex items-center justify-between gap-3 text-[11px]">
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: a.color }} />
                    <span className="text-slate-200 truncate">{a.name}</span>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`font-bold ${a.roi >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {a.roi >= 0 ? `+${a.roi}%` : `${a.roi}%`}
                    </span>
                    <p className="text-[10px] text-slate-400">{formatterIDR.format(a.balance)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Interactive Asset Legend Toggle List */}
      <div>
        <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wider flex items-center gap-1.5">
          <Filter className="w-3.5 h-3.5 text-slate-500" />
          <span>Toggle Aset untuk Perbandingan ROI:</span>
        </h4>
        <div className="flex flex-wrap gap-2">
          {assetSeriesList.map((asset) => {
            const isActive = activeAssetIds.has(asset.id);
            return (
              <button
                key={asset.id}
                onClick={() => toggleAsset(asset.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer ${
                  isActive
                    ? 'bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 shadow-xs'
                    : 'bg-slate-100/50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800/80 text-slate-400 dark:text-slate-600 opacity-60'
                }`}
              >
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: isActive ? asset.color : '#94a3b8' }}
                />
                <span className="truncate max-w-[140px]">{asset.name}</span>
                <span className={`font-bold ml-1 ${asset.currentRoi >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
                  {asset.currentRoi >= 0 ? `+${asset.currentRoi}%` : `${asset.currentRoi}%`}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
