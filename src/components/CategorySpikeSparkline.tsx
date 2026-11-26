import React from 'react';
import {
  Bar,
  BarChart,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  YAxis,
} from 'recharts';
import {
  Category30DaySparklineSummary,
  CategoryDailySparklinePoint,
} from '../utils/anomalyDetection';
import { formatterIDR } from '../utils/formatters';

interface CategorySpikeSparklineProps {
  category: string;
  summary: Category30DaySparklineSummary;
}

interface SparklineTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: CategoryDailySparklinePoint }>;
}

const SparklineTooltip: React.FC<SparklineTooltipProps> = ({ active, payload }) => {
  if (!active || !payload || payload.length === 0) return null;
  const pt = payload[0]?.payload;
  if (!pt) return null;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-2 shadow-md text-[11px] space-y-0.5 whitespace-nowrap z-50">
      <div className="font-bold text-slate-900 dark:text-slate-100 flex items-center justify-between gap-3">
        <span>{pt.dateLabel}</span>
        <span
          className={
            pt.isSpikeDay
              ? 'text-rose-600 dark:text-rose-400 font-extrabold'
              : 'text-slate-400 font-medium'
          }
        >
          {pt.isSpikeDay ? 'Lonjakan' : 'Normal'}
        </span>
      </div>
      <div className="font-mono tabular-nums font-bold text-slate-800 dark:text-slate-200">
        {formatterIDR.format(pt.amount)}
      </div>
      <div className="text-slate-500 dark:text-slate-400 font-mono tabular-nums">
        7 hr terakhir: {pt.rolling7dSpikeCount}x lonjakan
      </div>
    </div>
  );
};

export const CategorySpikeSparkline: React.FC<CategorySpikeSparklineProps> = ({
  category,
  summary,
}) => {
  const { points, dailyThreshold, spikeDaysCount, patternClassification, patternLabel } =
    summary;

  const maxAmount = Math.max(
    dailyThreshold * 1.25,
    ...points.map((p) => p.amount),
    1
  );

  const labelToneClass =
    patternClassification === 'chronic'
      ? 'text-rose-600 dark:text-rose-400'
      : patternClassification === 'recurring'
      ? 'text-amber-700 dark:text-amber-300'
      : 'text-slate-600 dark:text-slate-300';

  const spikeBarColor =
    patternClassification === 'chronic' ? '#dc2626' : '#d97706';

  return (
    <div
      className="flex items-center gap-3 w-full md:w-auto md:min-w-[260px] md:max-w-[300px] shrink-0"
      aria-label={`Sparkline frekuensi lonjakan 30 hari kategori ${category}: ${spikeDaysCount} hari lonjakan (${patternLabel})`}
    >
      <div className="flex-1 min-w-[130px] h-[42px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={points}
            margin={{ top: 4, right: 2, left: 2, bottom: 2 }}
            barCategoryGap={1}
          >
            <YAxis domain={[0, maxAmount]} hide />
            <ReferenceLine
              y={dailyThreshold}
              stroke="#94a3b8"
              strokeDasharray="2 2"
              strokeWidth={1}
            />
            <Tooltip
              content={<SparklineTooltip />}
              cursor={{ fill: 'rgba(148, 163, 184, 0.16)' }}
            />
            <Bar dataKey="amount" radius={[1.5, 1.5, 0, 0]} isAnimationActive={false}>
              {points.map((pt) => (
                <Cell
                  key={pt.date}
                  fill={pt.isSpikeDay ? spikeBarColor : '#94a3b8'}
                  fillOpacity={pt.isSpikeDay ? 0.92 : 0.35}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="text-right shrink-0 space-y-0.5">
        <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block whitespace-nowrap">
          Tren Lonjakan 30 Hr
        </span>
        <div className={`text-xs font-bold whitespace-nowrap ${labelToneClass}`}>
          <span className="font-mono tabular-nums">{spikeDaysCount}/30 hr</span>
          <span aria-hidden="true"> · </span>
          <span>{patternLabel}</span>
        </div>
      </div>
    </div>
  );
};
