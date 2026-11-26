import React, { useEffect, useMemo, useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { CheckCircle2, PieChart as PieChartIcon } from 'lucide-react';
import { CategoryNode } from '../categoryHierarchy';
import { Transaction } from '../types';
import {
  AnomalyDistributionSlice,
  buildAnomalyDistributionByMainCategory,
} from '../utils/anomalyDetection';
import { formatterIDR } from '../utils/formatters';
import { AnomalyAutoInsightsPanel } from './AnomalyAutoInsightsPanel';

interface AnomalyDistributionPieChartProps {
  transactions: Transaction[];
  masterCategories?: CategoryNode[];
}

type DistributionMetricMode = 'frequency' | 'excess';

interface PieChartDatum extends AnomalyDistributionSlice {
  value: number;
  sharePct: number;
}

interface CustomPieTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: PieChartDatum }>;
  metricMode: DistributionMetricMode;
}

const DistributionPieTooltip: React.FC<CustomPieTooltipProps> = ({
  active,
  payload,
  metricMode,
}) => {
  if (!active || !payload || payload.length === 0) return null;
  const slice = payload[0]?.payload;
  if (!slice) return null;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 shadow-lg text-xs min-w-[210px] space-y-1.5">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-2.5 h-2.5 rounded-xs shrink-0"
            style={{ backgroundColor: slice.color }}
          />
          <span className="font-extrabold text-slate-900 dark:text-slate-100 truncate">
            {slice.mainCategory}
          </span>
        </div>
        <span className="font-mono tabular-nums font-bold text-slate-700 dark:text-slate-200 shrink-0">
          {slice.sharePct.toFixed(1)}%
        </span>
      </div>

      <div className="flex items-center justify-between gap-3 text-slate-600 dark:text-slate-300">
        <span>Frekuensi Anomali</span>
        <span
          className={`font-mono tabular-nums font-bold ${
            metricMode === 'frequency'
              ? 'text-slate-900 dark:text-slate-100'
              : ''
          }`}
        >
          {slice.spikeCount}x kejadian
        </span>
      </div>

      <div className="flex items-center justify-between gap-3 text-slate-600 dark:text-slate-300">
        <span>Total Selisih Lonjakan</span>
        <span
          className={`font-mono tabular-nums font-bold ${
            metricMode === 'excess'
              ? 'text-rose-600 dark:text-rose-400'
              : ''
          }`}
        >
          +{formatterIDR.format(slice.totalExcessAmount)}
        </span>
      </div>

      <div className="flex items-center justify-between gap-3 text-[11px] text-slate-500 dark:text-slate-400">
        <span>Puncak Lonjakan</span>
        <span className="font-mono tabular-nums font-bold text-rose-600 dark:text-rose-400">
          +{slice.maxSpikePct}%
        </span>
      </div>
    </div>
  );
};

export const AnomalyDistributionPieChart: React.FC<
  AnomalyDistributionPieChartProps
> = ({ transactions, masterCategories = [] }) => {
  const [monthCount, setMonthCount] = useState<1 | 6 | 12>(6);
  const [metricMode, setMetricMode] = useState<DistributionMetricMode>('frequency');
  const [selectedMainCategory, setSelectedMainCategory] = useState<string | null>(
    null
  );

  const distribution = useMemo(
    () =>
      buildAnomalyDistributionByMainCategory({
        transactions,
        masterCategories,
        monthCount,
      }),
    [transactions, masterCategories, monthCount]
  );

  const chartData = useMemo<PieChartDatum[]>(() => {
    const mapped = distribution.slices.map((slice) => ({
      ...slice,
      value:
        metricMode === 'frequency'
          ? slice.spikeCount
          : Math.max(1, slice.totalExcessAmount),
      sharePct:
        metricMode === 'frequency'
          ? slice.frequencySharePct
          : slice.excessSharePct,
    }));
    if (metricMode === 'excess') {
      return mapped.sort((a, b) => b.totalExcessAmount - a.totalExcessAmount);
    }
    return mapped;
  }, [distribution.slices, metricMode]);

  useEffect(() => {
    if (!selectedMainCategory) return;
    if (!chartData.some((d) => d.mainCategory === selectedMainCategory)) {
      setSelectedMainCategory(null);
    }
  }, [chartData, selectedMainCategory]);

  const topProblematic = chartData[0] || null;

  return (
    <section
      id="anomaly-distribution-pie-section"
      className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-5"
    >
      {/* Header & Controls */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-rose-600 text-white shrink-0">
            <PieChartIcon className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                Distribusi Anomali per Kategori Utama
              </h3>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                · {distribution.periodRangeLabel} ·{' '}
                <span className="font-mono tabular-nums">
                  {distribution.totalSpikeEvents}
                </span>{' '}
                kejadian lonjakan
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
              Proporsi kategori utama yang paling sering mengalami lonjakan pengeluaran (&gt; +30%) dibandingkan rata-rata 3 bulan sebelumnya.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Timeframe Segmented Control */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            {(
              [
                { value: 1, label: 'Bulan Terkini' },
                { value: 6, label: '6 Bulan' },
                { value: 12, label: '12 Bulan' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setMonthCount(opt.value)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition cursor-pointer whitespace-nowrap shrink-0 ${
                  monthCount === opt.value
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Metric Segmented Control */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => setMetricMode('frequency')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition cursor-pointer whitespace-nowrap shrink-0 ${
                metricMode === 'frequency'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Frekuensi Anomali
            </button>
            <button
              type="button"
              onClick={() => setMetricMode('excess')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition cursor-pointer whitespace-nowrap shrink-0 ${
                metricMode === 'excess'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Nominal Lonjakan
            </button>
          </div>
        </div>
      </div>

      {/* Empty State or Chart + Breakdown Grid */}
      {chartData.length === 0 ? (
        <div className="p-6 rounded-xl border border-emerald-200 dark:border-emerald-800/70 bg-emerald-50/40 dark:bg-emerald-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div>
              <p className="font-bold text-emerald-900 dark:text-emerald-200">
                Belum Ada Distribusi Anomali pada Periode {distribution.periodRangeLabel}
              </p>
              <p className="text-emerald-800 dark:text-emerald-300 mt-0.5">
                Tidak ditemukan kategori utama yang melonjak melebihi 30% dibanding rata-rata 3 bulan sebelumnya.
              </p>
            </div>
          </div>

          {monthCount < 12 && (
            <button
              type="button"
              onClick={() => setMonthCount(12)}
              className="px-3.5 py-2 rounded-lg text-xs font-bold bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition cursor-pointer whitespace-nowrap shrink-0"
            >
              Perluas ke 12 Bulan
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* Left: Donut Pie Chart */}
          <div className="lg:col-span-5 flex flex-col items-center">
            <div className="relative w-full h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    dataKey="value"
                    nameKey="mainCategory"
                    cx="50%"
                    cy="50%"
                    innerRadius={64}
                    outerRadius={104}
                    paddingAngle={2}
                    stroke="none"
                    isAnimationActive={false}
                    onClick={(_, index) => {
                      const clicked = chartData[index];
                      if (!clicked) return;
                      setSelectedMainCategory((prev) =>
                        prev === clicked.mainCategory
                          ? null
                          : clicked.mainCategory
                      );
                    }}
                    className="cursor-pointer focus:outline-hidden"
                  >
                    {chartData.map((slice) => {
                      const isDimmed =
                        selectedMainCategory !== null &&
                        selectedMainCategory !== slice.mainCategory;
                      return (
                        <Cell
                          key={slice.mainCategory}
                          fill={slice.color}
                          fillOpacity={isDimmed ? 0.35 : 0.92}
                        />
                      );
                    })}
                  </Pie>
                  <Tooltip
                    content={<DistributionPieTooltip metricMode={metricMode} />}
                  />
                </PieChart>
              </ResponsiveContainer>

              {/* Center Metric Readout */}
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center px-6">
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  {metricMode === 'frequency' ? 'Total Kejadian' : 'Total Lonjakan'}
                </span>
                <span className="text-base font-extrabold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-0.5">
                  {metricMode === 'frequency'
                    ? `${distribution.totalSpikeEvents}x`
                    : formatterIDR.format(distribution.totalExcessAmount)}
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  {chartData.length} kategori utama
                </span>
              </div>
            </div>

            {topProblematic && (
              <p className="text-xs text-slate-600 dark:text-slate-300 text-center mt-1">
                Paling sering bermasalah:{' '}
                <strong className="text-slate-900 dark:text-slate-100">
                  {topProblematic.mainCategory}
                </strong>{' '}
                <span className="font-mono tabular-nums text-rose-600 dark:text-rose-400 font-bold">
                  ({topProblematic.sharePct.toFixed(1)}% · {topProblematic.spikeCount}x)
                </span>
              </p>
            )}
          </div>

          {/* Right: Main Category Proportion List & Sub-Category Expandable Detail */}
          <div className="lg:col-span-7 divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            {chartData.map((slice) => {
              const isSelected = selectedMainCategory === slice.mainCategory;
              return (
                <div
                  key={slice.mainCategory}
                  className={`transition-colors ${
                    isSelected
                      ? 'bg-slate-50 dark:bg-slate-800/60'
                      : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/30'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedMainCategory((prev) =>
                        prev === slice.mainCategory ? null : slice.mainCategory
                      )
                    }
                    className="w-full text-left px-4 py-3 flex flex-col gap-2 cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="w-3 h-3 rounded-xs shrink-0"
                          style={{ backgroundColor: slice.color }}
                        />
                        <div className="min-w-0">
                          <span className="text-xs font-extrabold text-slate-900 dark:text-slate-100 block truncate">
                            {slice.mainCategory}
                          </span>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 block truncate">
                            {slice.subCategories.map((s) => s.category).join(' · ')}
                          </span>
                        </div>
                      </div>

                      <div className="text-right shrink-0 space-y-0.5">
                        <div className="text-xs font-mono tabular-nums font-extrabold text-slate-900 dark:text-slate-100">
                          {slice.sharePct.toFixed(1)}%
                        </div>
                        <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                          {slice.spikeCount}x · +{formatterIDR.format(slice.totalExcessAmount)}
                        </div>
                      </div>
                    </div>

                    {/* Hairline Proportion Bar */}
                    <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-200"
                        style={{
                          width: `${Math.min(100, Math.max(3, slice.sharePct))}%`,
                          backgroundColor: slice.color,
                        }}
                      />
                    </div>
                  </button>

                  {isSelected && (
                    <div className="px-4 pb-3 pt-1 border-t border-slate-100 dark:border-slate-800/80 space-y-1.5 text-[11px]">
                      <span className="font-bold text-slate-600 dark:text-slate-300 block">
                        Rincian Sub-Kategori Penyumbang ({slice.subCategories.length}):
                      </span>
                      <div className="space-y-1">
                        {slice.subCategories.map((sub) => (
                          <div
                            key={sub.category}
                            className="flex items-center justify-between gap-3 text-slate-600 dark:text-slate-300"
                          >
                            <span className="truncate font-medium">{sub.category}</span>
                            <span className="font-mono tabular-nums shrink-0">
                              {sub.spikeCount}x · puncak{' '}
                              <strong className="text-rose-600 dark:text-rose-400">
                                +{sub.peakSpikePct}%
                              </strong>{' '}
                              · +{formatterIDR.format(sub.totalExcessAmount)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* AI Automatic Insights for Top 3 Problematic Main Categories */}
      {chartData.length > 0 && (
        <AnomalyAutoInsightsPanel
          monthCount={monthCount}
          periodRangeLabel={distribution.periodRangeLabel}
          metricMode={metricMode}
          topSlices={chartData}
          selectedMainCategory={selectedMainCategory}
          onSelectMainCategory={(cat) =>
            setSelectedMainCategory((prev) => (prev === cat ? null : cat))
          }
        />
      )}
    </section>
  );
};
