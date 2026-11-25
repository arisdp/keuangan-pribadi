import React from 'react';
import {
  CategoryAnomalyDetectionResult,
  formatAnomalyMonthLabelID,
} from '../utils/anomalyDetection';
import { formatterIDR } from '../utils/formatters';

interface AnomalyTopSummaryTooltipProps {
  detectionResult: CategoryAnomalyDetectionResult;
  isFocusMode?: boolean;
  className?: string;
}

export const AnomalyTopSummaryTooltip: React.FC<AnomalyTopSummaryTooltipProps> = ({
  detectionResult,
  isFocusMode = false,
  className = '',
}) => {
  const { referenceYM, anomalies } = detectionResult;
  const topThree = anomalies.slice(0, 3);
  if (topThree.length === 0) return null;

  const maskMoney = (amount: number) =>
    isFocusMode ? 'Rp ••••••' : formatterIDR.format(amount);

  return (
    <div
      role="tooltip"
      className={`w-80 max-w-[calc(100vw-2rem)] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl p-3.5 text-xs space-y-2.5 pointer-events-none ${className}`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
        <span className="font-extrabold text-slate-900 dark:text-slate-100">
          Top {topThree.length} Kategori Anomali (&gt;30%)
        </span>
        <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
          {formatAnomalyMonthLabelID(referenceYM)}
        </span>
      </div>

      <div className="space-y-2">
        {topThree.map((anom, idx) => {
          const isSevere = anom.increasePct >= 60;
          return (
            <div
              key={anom.anomalyKey}
              className="pt-1.5 first:pt-0 border-t first:border-t-0 border-slate-100 dark:border-slate-800/80 space-y-1"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-slate-800 dark:text-slate-100 truncate">
                  {idx + 1}. {anom.category}
                </span>
                <span
                  className={`font-mono tabular-nums font-extrabold whitespace-nowrap shrink-0 ${
                    isSevere
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-amber-700 dark:text-amber-300'
                  }`}
                >
                  +{anom.increasePct}%
                </span>
              </div>

              <div className="flex items-center justify-between gap-2 text-[11px] text-slate-600 dark:text-slate-300">
                <span>
                  Aktual:{' '}
                  <strong className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                    {maskMoney(anom.currentMonthAmount)}
                  </strong>
                </span>
                <span>
                  Rata-rata:{' '}
                  <strong className="font-mono tabular-nums">
                    {maskMoney(anom.threeMonthAvgAmount)}
                  </strong>
                </span>
              </div>

              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="text-slate-500 dark:text-slate-400">Selisih lonjakan</span>
                <span className="font-mono tabular-nums font-bold text-rose-600 dark:text-rose-400">
                  +{maskMoney(anom.excessAmount)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {anomalies.length > 3 && (
        <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
          +{anomalies.length - 3} kategori lainnya terdeteksi di Smart Cleanup
        </div>
      )}
    </div>
  );
};
