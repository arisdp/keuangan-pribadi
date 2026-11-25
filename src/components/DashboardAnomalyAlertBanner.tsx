import React, { useState } from 'react';
import { AlertTriangle, ArrowRight, X } from 'lucide-react';
import {
  CategoryAnomalyDetectionResult,
  formatAnomalyMonthLabelID,
} from '../utils/anomalyDetection';
import { formatterIDR } from '../utils/formatters';
import { AnomalyTopSummaryTooltip } from './AnomalyTopSummaryTooltip';

interface DashboardAnomalyAlertBannerProps {
  detectionResult: CategoryAnomalyDetectionResult;
  isFocusMode?: boolean;
  onOpenSmartCleanup: () => void;
  onDismiss: () => void;
}

export const DashboardAnomalyAlertBanner: React.FC<DashboardAnomalyAlertBannerProps> = ({
  detectionResult,
  isFocusMode = false,
  onOpenSmartCleanup,
  onDismiss,
}) => {
  const [showTooltip, setShowTooltip] = useState(false);

  const { referenceYM, anomalies } = detectionResult;
  if (anomalies.length === 0) return null;

  const hasSevereSpike = anomalies.some((a) => a.increasePct >= 60);
  const topAnomalies = anomalies.slice(0, 3);
  const remainingCount = Math.max(0, anomalies.length - topAnomalies.length);

  const maskMoney = (amount: number) =>
    isFocusMode ? 'Rp ••••••' : formatterIDR.format(amount);

  return (
    <section
      aria-label="Peringatan anomali pengeluaran kategori"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onFocus={() => setShowTooltip(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setShowTooltip(false);
        }
      }}
      className={`relative p-4 sm:p-5 rounded-2xl border transition-colors ${
        hasSevereSpike
          ? 'bg-rose-50/75 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800/80'
          : 'bg-amber-50/75 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/80'
      }`}
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={`p-2 rounded-xl shrink-0 text-white ${
              hasSevereSpike ? 'bg-rose-600' : 'bg-amber-600'
            }`}
          >
            <AlertTriangle className="h-5 w-5" />
          </div>

          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3
                className={`text-sm font-extrabold tracking-tight ${
                  hasSevereSpike
                    ? 'text-rose-950 dark:text-rose-100'
                    : 'text-amber-950 dark:text-amber-100'
                }`}
              >
                Peringatan Lonjakan Pengeluaran &gt; 30% ({anomalies.length} Kategori)
              </h3>
              <span
                className={`text-xs font-medium ${
                  hasSevereSpike
                    ? 'text-rose-700 dark:text-rose-300'
                    : 'text-amber-800 dark:text-amber-300'
                }`}
              >
                · Periode {formatAnomalyMonthLabelID(referenceYM)} vs rata-rata 3 bln
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
              {topAnomalies.map((anom, idx) => (
                <React.Fragment key={anom.anomalyKey}>
                  {idx > 0 && (
                    <span
                      aria-hidden="true"
                      className="text-slate-400 dark:text-slate-500"
                    >
                      ·
                    </span>
                  )}
                  <span
                    className={`font-medium ${
                      hasSevereSpike
                        ? 'text-rose-900 dark:text-rose-200'
                        : 'text-amber-900 dark:text-amber-200'
                    }`}
                  >
                    <strong className="font-bold">{anom.category}</strong>{' '}
                    <span className="font-mono tabular-nums font-extrabold">
                      (+{anom.increasePct}%, +{maskMoney(anom.excessAmount)})
                    </span>
                  </span>
                </React.Fragment>
              ))}
              {remainingCount > 0 && (
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  +{remainingCount} kategori lainnya
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenSmartCleanup}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold text-white transition cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
              hasSevereSpike
                ? 'bg-rose-600 hover:bg-rose-700'
                : 'bg-amber-600 hover:bg-amber-700'
            }`}
          >
            <span>Tinjau &amp; Smart Cleanup</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={onDismiss}
            aria-label="Tutup sementara peringatan anomali"
            className="px-3 py-2 rounded-lg text-xs font-semibold border border-slate-300/80 dark:border-slate-700 bg-white/80 dark:bg-slate-900/70 text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800 transition cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1"
          >
            <X className="h-3.5 w-3.5" />
            <span>Tutup Sementara</span>
          </button>
        </div>
      </div>

      {showTooltip && (
        <div className="absolute left-4 top-full mt-2 z-40">
          <AnomalyTopSummaryTooltip
            detectionResult={detectionResult}
            isFocusMode={isFocusMode}
          />
        </div>
      )}
    </section>
  );
};
