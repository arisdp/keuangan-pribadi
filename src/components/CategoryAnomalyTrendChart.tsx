import React, { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity, Flame, Layers, RotateCcw, Target } from 'lucide-react';
import { CategoryBudget, Transaction } from '../types';
import {
  buildCategoryAnomalyTimeline,
  CategoryAnomalyTimelinePoint,
  TopAnomalyCategoryMeta,
} from '../utils/anomalyDetection';
import { formatterIDR } from '../utils/formatters';

interface CategoryAnomalyTrendChartProps {
  transactions: Transaction[];
  budgets: CategoryBudget[];
  onSelectMonthForCleanup?: (ym: string) => void;
}

interface FlatChartPoint {
  idx: number;
  ym: string;
  monthLabel: string;
  totalSpending: number;
  totalBudget: number;
  maxSpikePct: number;
  anomalyCount: number;
  spikingCategories: string[];
  severityLevel: CategoryAnomalyTimelinePoint['severityLevel'];
  severityLabel: string;
  categorySpikePct: Record<string, number>;
  [seriesKey: string]: unknown;
}

const formatCompactIDR = (value: number): string => {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}M`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}jt`;
  if (abs >= 1_000) return `${Math.round(value / 1_000)}rb`;
  return String(value);
};

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    dataKey?: string;
    value?: number;
    payload?: FlatChartPoint;
  }>;
  topCategories: TopAnomalyCategoryMeta[];
  activeSeriesKeys: Set<string>;
  showBudgetLine: boolean;
}

const AnomalyTrendTooltip: React.FC<CustomTooltipProps> = ({
  active,
  payload,
  topCategories,
  activeSeriesKeys,
  showBudgetLine,
}) => {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  const visibleMeta = topCategories.filter((m) => activeSeriesKeys.has(m.category));

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 shadow-lg text-xs min-w-[240px] max-w-[320px] space-y-2.5">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-2">
        <span className="font-extrabold text-slate-900 dark:text-slate-100">
          {point.monthLabel}
        </span>
        <span
          className={`font-semibold ${
            point.severityLevel === 'severe'
              ? 'text-rose-600 dark:text-rose-400'
              : point.severityLevel === 'elevated'
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-emerald-600 dark:text-emerald-400'
          }`}
        >
          {point.severityLabel}
        </span>
      </div>

      <div className="space-y-1.5">
        {visibleMeta.map((meta, idx) => {
          const originalIdx = topCategories.findIndex((t) => t.category === meta.category);
          const rawVal = Number(point[`cat_${originalIdx}`] || 0);
          const spikePct = point.categorySpikePct?.[meta.category];
          const isSpike = spikePct !== undefined && spikePct > 30;

          return (
            <div
              key={`${meta.category}-${idx}`}
              className="flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-2.5 h-2.5 rounded-xs shrink-0"
                  style={{ backgroundColor: meta.color }}
                />
                <span className="truncate font-medium text-slate-700 dark:text-slate-200">
                  {meta.category}
                </span>
              </div>
              <div className="flex items-center gap-1.5 font-mono tabular-nums shrink-0">
                <span className="font-bold text-slate-900 dark:text-slate-100">
                  {formatterIDR.format(rawVal)}
                </span>
                {spikePct !== undefined && (
                  <span
                    className={`text-[11px] font-bold ${
                      isSpike
                        ? spikePct >= 60
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-amber-600 dark:text-amber-400'
                        : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    ({spikePct >= 0 ? `+${spikePct}%` : `${spikePct}%`})
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1 text-[11px] text-slate-500 dark:text-slate-400">
        <div className="flex items-center justify-between gap-2">
          <span>Total Pengeluaran Bulan Ini</span>
          <span className="font-mono tabular-nums font-bold text-slate-800 dark:text-slate-200">
            {formatterIDR.format(point.totalSpending)}
          </span>
        </div>
        {showBudgetLine && point.totalBudget > 0 && (
          <div className="flex items-center justify-between gap-2">
            <span>Total Pagu Budget Bulanan</span>
            <span className="font-mono tabular-nums font-bold text-slate-700 dark:text-slate-300">
              {formatterIDR.format(point.totalBudget)}
            </span>
          </div>
        )}
        {point.anomalyCount > 0 && (
          <div className="text-amber-700 dark:text-amber-300 font-medium pt-0.5">
            {point.anomalyCount} kategori melonjak &gt; +30% (maks +{point.maxSpikePct}%)
          </div>
        )}
      </div>
    </div>
  );
};

export const CategoryAnomalyTrendChart: React.FC<CategoryAnomalyTrendChartProps> = ({
  transactions,
  budgets,
  onSelectMonthForCleanup,
}) => {
  const [monthWindow, setMonthWindow] = useState<6 | 12>(6);
  const [showSeverityHeatmap, setShowSeverityHeatmap] = useState<boolean>(true);
  const [showBudgetLine, setShowBudgetLine] = useState<boolean>(false);
  const [selectedCategories, setSelectedCategories] = useState<Set<string> | null>(null);

  const timeline = useMemo(
    () =>
      buildCategoryAnomalyTimeline({
        transactions,
        budgets,
        monthCount: monthWindow,
      }),
    [transactions, budgets, monthWindow]
  );

  // Sync active categories when topCategories set updates
  useEffect(() => {
    setSelectedCategories((prev) => {
      const validNames = new Set(timeline.topCategories.map((c) => c.category));
      if (validNames.size === 0) return new Set();
      if (!prev) return validNames;
      const kept = new Set(Array.from(prev).filter((cat) => validNames.has(cat)));
      return kept.size > 0 ? kept : validNames;
    });
  }, [timeline.topCategories]);

  const activeCategorySet = useMemo(() => {
    if (selectedCategories) return selectedCategories;
    return new Set(timeline.topCategories.map((c) => c.category));
  }, [selectedCategories, timeline.topCategories]);

  const chartData = useMemo<FlatChartPoint[]>(() => {
    return timeline.series.map((pt) => {
      const flat: FlatChartPoint = {
        idx: pt.idx,
        ym: pt.ym,
        monthLabel: pt.monthLabel,
        totalSpending: pt.totalSpending,
        totalBudget: pt.totalBudget,
        maxSpikePct: pt.maxSpikePct,
        anomalyCount: pt.anomalyCount,
        spikingCategories: pt.spikingCategories,
        severityLevel: pt.severityLevel,
        severityLabel: pt.severityLabel,
        categorySpikePct: pt.categorySpikePct,
      };
      timeline.topCategories.forEach((meta, idx) => {
        flat[`cat_${idx}`] = pt.categoryAmounts[meta.category] || 0;
      });
      return flat;
    });
  }, [timeline]);

  const hasAnySpending = useMemo(
    () => chartData.some((d) => d.totalSpending > 0),
    [chartData]
  );

  const toggleCategoryChip = (category: string) => {
    setSelectedCategories((prev) => {
      const current = new Set(
        prev ? prev : timeline.topCategories.map((c) => c.category)
      );
      if (current.has(category)) {
        current.delete(category);
      } else {
        current.add(category);
      }
      return current;
    });
  };

  const resetAllCategories = () => {
    setSelectedCategories(new Set(timeline.topCategories.map((c) => c.category)));
  };

  const anomalyMonths = useMemo(
    () => chartData.filter((pt) => pt.severityLevel !== 'none'),
    [chartData]
  );

  const handleChartClick = (state: {
    activeTooltipIndex?: number | string | null;
    activeLabel?: string | number;
  }) => {
    if (!onSelectMonthForCleanup) return;
    const rawIdx =
      state?.activeTooltipIndex !== undefined && state?.activeTooltipIndex !== null
        ? Number(state.activeTooltipIndex)
        : state?.activeLabel !== undefined
        ? Number(state.activeLabel)
        : NaN;
    if (!Number.isFinite(rawIdx)) return;
    const clickedPoint = chartData[Math.round(rawIdx)];
    if (clickedPoint?.ym) {
      onSelectMonthForCleanup(clickedPoint.ym);
    }
  };

  return (
    <section
      id="category-anomaly-trend-section"
      className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-5"
    >
      {/* Header & Controls */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-slate-900 dark:bg-slate-800 text-white shrink-0">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                Tren Anomali Pengeluaran per Kategori &amp; Heatmap Keparahan
              </h3>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                · {monthWindow} Bulan Terakhir · {timeline.severeMonthsCount} Bulan Tinggi ·{' '}
                {timeline.elevatedMonthsCount} Bulan Sedang
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
              Pantau lintasan belanja kategori berpemicu anomali terhadap rata-rata 3 bulan sebelumnya dan aktifkan overlay zona keparahan.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* 6M / 12M Segmented Window */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => setMonthWindow(6)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition cursor-pointer whitespace-nowrap shrink-0 ${
                monthWindow === 6
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              6 Bulan
            </button>
            <button
              type="button"
              onClick={() => setMonthWindow(12)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition cursor-pointer whitespace-nowrap shrink-0 ${
                monthWindow === 12
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              12 Bulan
            </button>
          </div>

          {/* Severity Heatmap Toggle */}
          <button
            type="button"
            onClick={() => setShowSeverityHeatmap((prev) => !prev)}
            aria-pressed={showSeverityHeatmap}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold border transition cursor-pointer whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 ${
              showSeverityHeatmap
                ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300'
                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
            }`}
          >
            <Flame className="h-3.5 w-3.5 shrink-0" />
            <span>Overlay Heatmap Keparahan</span>
          </button>

          {/* Optional Total Budget Line Toggle */}
          {timeline.totalMonthlyBudget > 0 && (
            <button
              type="button"
              onClick={() => setShowBudgetLine((prev) => !prev)}
              aria-pressed={showBudgetLine}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold border transition cursor-pointer whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 ${
                showBudgetLine
                  ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-800 text-blue-700 dark:text-blue-300'
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              <Target className="h-3.5 w-3.5 shrink-0" />
              <span>Batas Total Budget</span>
            </button>
          )}
        </div>
      </div>

      {/* Category Toggle Chips + Severity Legend */}
      {hasAnySpending && timeline.topCategories.length > 0 && (
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 inline-flex items-center gap-1 mr-1">
              <Layers className="h-3.5 w-3.5" />
              <span>Kategori Anomali Teratas:</span>
            </span>
            {timeline.topCategories.map((meta) => {
              const isActive = activeCategorySet.has(meta.category);
              return (
                <button
                  key={meta.category}
                  type="button"
                  onClick={() => toggleCategoryChip(meta.category)}
                  aria-pressed={isActive}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer whitespace-nowrap shrink-0 inline-flex items-center gap-2 ${
                    isActive
                      ? 'bg-slate-900 dark:bg-slate-100 border-slate-900 dark:border-slate-100 text-white dark:text-slate-900'
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-xs shrink-0"
                    style={{
                      backgroundColor: meta.color,
                      opacity: isActive ? 1 : 0.4,
                    }}
                  />
                  <span>{meta.category}</span>
                  <span className="font-mono tabular-nums text-[11px] opacity-80">
                    {meta.spikeMonthsCount > 0 ? `${meta.spikeMonthsCount}x` : 'stabil'}
                  </span>
                </button>
              );
            })}

            {activeCategorySet.size < timeline.topCategories.length && (
              <button
                type="button"
                onClick={resetAllCategories}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition cursor-pointer whitespace-nowrap shrink-0 inline-flex items-center gap-1"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Tampilkan Semua</span>
              </button>
            )}
          </div>

          {showSeverityHeatmap && (
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600 dark:text-slate-300 shrink-0">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-amber-500/25 border border-amber-500/50 inline-block" />
                <span>Zona Sedang (+31%–59%)</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-rose-600/25 border border-rose-600/50 inline-block" />
                <span>Zona Tinggi (≥ +60%)</span>
              </span>
            </div>
          )}
        </div>
      )}

      {/* Main Chart Viewport or Empty States */}
      {!hasAnySpending ? (
        <div className="p-8 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20 text-center space-y-2 text-xs">
          <p className="font-bold text-slate-700 dark:text-slate-200">
            Belum Ada Riwayat Pengeluaran Operasional
          </p>
          <p className="text-slate-500 dark:text-slate-400">
            Catat transaksi pengeluaran di beberapa bulan untuk menampilkan tren kategori dan heatmap keparahan anomali.
          </p>
        </div>
      ) : activeCategorySet.size === 0 ? (
        <div className="p-8 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20 text-center space-y-3 text-xs">
          <p className="font-bold text-slate-700 dark:text-slate-200">
            Semua Kategori Grafik Sedang Disembunyikan
          </p>
          <button
            type="button"
            onClick={resetAllCategories}
            className="px-4 py-2 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white transition cursor-pointer"
          >
            Tampilkan Kategori Teratas
          </button>
        </div>
      ) : (
        <div className="w-full h-[340px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              margin={{ top: 14, right: 16, left: 6, bottom: 8 }}
              onClick={handleChartClick}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="rgba(148, 163, 184, 0.25)"
              />

              <XAxis
                dataKey="idx"
                type="number"
                domain={[-0.48, Math.max(0, chartData.length - 1) + 0.48]}
                ticks={chartData.map((d) => d.idx)}
                tickFormatter={(val: number) => chartData[val]?.monthLabel || ''}
                tick={{ fontSize: 11, fill: '#64748b' }}
                axisLine={{ stroke: '#cbd5e1' }}
                tickLine={false}
              />

              <YAxis
                yAxisId="spend"
                tickFormatter={formatCompactIDR}
                tick={{ fontSize: 11, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                width={64}
              />

              <Tooltip
                content={
                  <AnomalyTrendTooltip
                    topCategories={timeline.topCategories}
                    activeSeriesKeys={activeCategorySet}
                    showBudgetLine={showBudgetLine}
                  />
                }
              />

              {/* Color-banded vertical ReferenceArea severity zones */}
              {showSeverityHeatmap &&
                chartData.map((pt) => {
                  if (pt.severityLevel === 'none') return null;
                  const isSevere = pt.severityLevel === 'severe';
                  return (
                    <ReferenceArea
                      key={`severity-band-${pt.ym}`}
                      x1={pt.idx - 0.45}
                      x2={pt.idx + 0.45}
                      yAxisId="spend"
                      fill={isSevere ? '#dc2626' : '#d97706'}
                      fillOpacity={isSevere ? 0.14 : 0.1}
                      stroke={isSevere ? '#dc2626' : '#d97706'}
                      strokeOpacity={isSevere ? 0.28 : 0.22}
                      strokeWidth={1}
                      ifOverflow="extendDomain"
                      zIndex={0}
                    />
                  );
                })}

              {/* Optional Total Budget Benchmark Line */}
              {showBudgetLine && timeline.totalMonthlyBudget > 0 && (
                <ReferenceLine
                  y={timeline.totalMonthlyBudget}
                  yAxisId="spend"
                  stroke="#0f172a"
                  strokeDasharray="5 4"
                  strokeWidth={1.5}
                  label={{
                    value: `Total Budget ${formatCompactIDR(timeline.totalMonthlyBudget)}`,
                    position: 'insideTopRight',
                    fill: '#475569',
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                />
              )}

              {/* Category Spending Lines */}
              {timeline.topCategories.map((meta, idx) => {
                if (!activeCategorySet.has(meta.category)) return null;
                return (
                  <Line
                    key={meta.category}
                    yAxisId="spend"
                    type="monotone"
                    dataKey={`cat_${idx}`}
                    name={meta.category}
                    stroke={meta.color}
                    strokeWidth={2.5}
                    dot={{ r: 3.5, strokeWidth: 2, fill: '#ffffff' }}
                    activeDot={{ r: 5.5, strokeWidth: 2 }}
                    isAnimationActive={false}
                  />
                );
              })}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Spike Month Quick-Jump Footer */}
      {anomalyMonths.length > 0 && onSelectMonthForCleanup && (
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-slate-500 dark:text-slate-400">
            Bulan dengan lonjakan terdeteksi (klik untuk filter Smart Cleanup):
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {anomalyMonths.map((pt) => (
              <button
                key={pt.ym}
                type="button"
                onClick={() => onSelectMonthForCleanup(pt.ym)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-mono tabular-nums font-bold border transition cursor-pointer whitespace-nowrap shrink-0 ${
                  pt.severityLevel === 'severe'
                    ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/40'
                    : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40'
                }`}
              >
                {pt.monthLabel} (+{pt.maxSpikePct}%)
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};
