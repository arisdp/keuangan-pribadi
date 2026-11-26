import React from 'react';
import { ArrowRight, Flame, X } from 'lucide-react';
import { SevenDayVelocityAlertResult } from '../utils/anomalyDetection';
import { formatterIDR } from '../utils/formatters';

interface Dashboard7DayVelocityAlertBannerProps {
  velocityResult: SevenDayVelocityAlertResult;
  isFocusMode?: boolean;
  onOpenCategoryInSmartCleanup: (category: string) => void;
  onDismiss: () => void;
}

export const Dashboard7DayVelocityAlertBanner: React.FC<
  Dashboard7DayVelocityAlertBannerProps
> = ({
  velocityResult,
  isFocusMode = false,
  onOpenCategoryInSmartCleanup,
  onDismiss,
}) => {
  const { windowLabel, alerts } = velocityResult;
  if (!alerts || alerts.length === 0) return null;

  const hasHighSeverity = alerts.some((a) => a.severity === 'high');
  const topAlerts = alerts.slice(0, 3);
  const remainingCount = Math.max(0, alerts.length - topAlerts.length);
  const primaryCategory = topAlerts[0].category;

  const maskMoney = (amount: number) =>
    isFocusMode ? 'Rp ••••••' : formatterIDR.format(amount);

  return (
    <section
      aria-label="Peringatan lonjakan frekuensi anomali 7 hari terakhir"
      className={`p-4 sm:p-5 rounded-2xl border transition-colors ${
        hasHighSeverity
          ? 'bg-rose-50/75 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800/80'
          : 'bg-amber-50/75 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/80'
      }`}
    >
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div
            className={`p-2 rounded-xl shrink-0 text-white ${
              hasHighSeverity ? 'bg-rose-600' : 'bg-amber-600'
            }`}
          >
            <Flame className="h-5 w-5" />
          </div>

          <div className="space-y-2 min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <h3
                className={`text-sm font-extrabold tracking-tight ${
                  hasHighSeverity
                    ? 'text-rose-950 dark:text-rose-100'
                    : 'text-amber-950 dark:text-amber-100'
                }`}
              >
                Peringatan Dini: Frekuensi Anomali 7 Hari Terakhir Meningkat Tajam
              </h3>
              <span
                className={`text-xs font-medium ${
                  hasHighSeverity
                    ? 'text-rose-700 dark:text-rose-300'
                    : 'text-amber-800 dark:text-amber-300'
                }`}
              >
                · Periode {windowLabel} · {alerts.length} kategori terdeteksi
              </span>
            </div>

            <div className="divide-y divide-slate-200/70 dark:divide-slate-800/70 border-t border-slate-200/70 dark:border-slate-800/70 pt-1">
              {topAlerts.map((item) => (
                <div
                  key={item.alertKey}
                  className="py-1.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
                    <button
                      type="button"
                      onClick={() => onOpenCategoryInSmartCleanup(item.category)}
                      className={`font-extrabold hover:underline cursor-pointer text-left ${
                        hasHighSeverity
                          ? 'text-rose-900 dark:text-rose-100'
                          : 'text-amber-950 dark:text-amber-100'
                      }`}
                    >
                      {item.category}
                    </button>
                    <span className="text-slate-400 dark:text-slate-500" aria-hidden="true">
                      ·
                    </span>
                    <span
                      className={`font-mono tabular-nums font-bold ${
                        item.severity === 'high'
                          ? 'text-rose-700 dark:text-rose-300'
                          : 'text-amber-800 dark:text-amber-300'
                      }`}
                    >
                      {item.recent7dSpikeDays} hari lonjakan / 7 hr ({item.frequencyMultiplier.toFixed(1)}x laju 3 mgg lalu)
                    </span>
                    <span className="text-slate-400 dark:text-slate-500" aria-hidden="true">
                      ·
                    </span>
                    <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {maskMoney(item.recent7dSpend)} ({item.recent7dTxCount} transaksi)
                    </span>
                    {item.topDescriptions.length > 0 && (
                      <>
                        <span
                          className="text-slate-400 dark:text-slate-500 hidden md:inline"
                          aria-hidden="true"
                        >
                          ·
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[240px] hidden md:inline">
                          Pemicu: {item.topDescriptions.join(', ')}
                        </span>
                      </>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => onOpenCategoryInSmartCleanup(item.category)}
                    className={`text-[11px] font-bold hover:underline cursor-pointer whitespace-nowrap shrink-0 self-start sm:self-center ${
                      hasHighSeverity
                        ? 'text-rose-700 dark:text-rose-300'
                        : 'text-amber-800 dark:text-amber-300'
                    }`}
                  >
                    Filter kategori ini →
                  </button>
                </div>
              ))}
            </div>

            {remainingCount > 0 && (
              <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                +{remainingCount} kategori lainnya juga menunjukkan akselerasi pengeluaran minggu ini.
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onOpenCategoryInSmartCleanup(primaryCategory)}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold text-white transition cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
              hasHighSeverity
                ? 'bg-rose-600 hover:bg-rose-700'
                : 'bg-amber-600 hover:bg-amber-700'
            }`}
          >
            <span>Tinjau {primaryCategory}</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={onDismiss}
            aria-label="Tutup sementara peringatan 7 hari"
            className="px-3 py-2 rounded-lg text-xs font-semibold border border-slate-300/80 dark:border-slate-700 bg-white/80 dark:bg-slate-900/70 text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800 transition cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1"
          >
            <X className="h-3.5 w-3.5" />
            <span>Tutup</span>
          </button>
        </div>
      </div>
    </section>
  );
};
