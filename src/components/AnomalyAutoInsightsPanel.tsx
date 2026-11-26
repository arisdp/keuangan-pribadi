import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, RefreshCw, Sparkles } from 'lucide-react';
import { AnomalyDistributionSlice } from '../utils/anomalyDetection';
import { formatterIDR } from '../utils/formatters';

export interface AnomalyCategoryActionInsight {
  mainCategory: string;
  priorityLevel: 'high' | 'medium';
  monthlySavingsTarget: number;
  rootCauseHint: string;
  actionSteps: string[];
}

export interface AnomalyAutoInsightsResponse {
  executiveSummary: string;
  insights: AnomalyCategoryActionInsight[];
  generatedAt: string;
}

interface AnomalyAutoInsightsPanelProps {
  monthCount: 1 | 6 | 12;
  periodRangeLabel: string;
  metricMode: 'frequency' | 'excess';
  topSlices: AnomalyDistributionSlice[];
  selectedMainCategory: string | null;
  onSelectMainCategory?: (mainCategory: string) => void;
}

const sessionInsightsCache = new Map<string, AnomalyAutoInsightsResponse>();

function setSessionCache(key: string, value: AnomalyAutoInsightsResponse) {
  if (sessionInsightsCache.size >= 24) {
    const oldestKey = sessionInsightsCache.keys().next().value;
    if (oldestKey) sessionInsightsCache.delete(oldestKey);
  }
  sessionInsightsCache.set(key, value);
}

export const AnomalyAutoInsightsPanel: React.FC<AnomalyAutoInsightsPanelProps> = ({
  monthCount,
  periodRangeLabel,
  metricMode,
  topSlices,
  selectedMainCategory,
  onSelectMainCategory,
}) => {
  const topThree = useMemo(() => topSlices.slice(0, 3), [topSlices]);

  const requestSignature = useMemo(() => {
    if (topThree.length === 0) return '';
    const sliceSig = topThree
      .map(
        (s) =>
          `${s.mainCategory}:${s.spikeCount}:${s.totalExcessAmount}:${s.maxSpikePct}:${s.subCategories
            .slice(0, 3)
            .map((sub) => sub.category)
            .join('+')}`
      )
      .join('|');
    return `${monthCount}::${metricMode}::${periodRangeLabel}::${sliceSig}`;
  }, [monthCount, metricMode, periodRangeLabel, topThree]);

  const [data, setData] = useState<AnomalyAutoInsightsResponse | null>(() =>
    requestSignature ? sessionInsightsCache.get(requestSignature) || null : null
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState<number>(0);

  const sliceByMainCategory = useMemo(() => {
    const map = new Map<string, AnomalyDistributionSlice>();
    topThree.forEach((s) => map.set(s.mainCategory.toLowerCase(), s));
    return map;
  }, [topThree]);

  const fetchAutoInsights = useCallback(
    async (signal: AbortSignal, bypassCache: boolean) => {
      if (!requestSignature || topThree.length === 0) {
        setData(null);
        setError(null);
        setLoading(false);
        return;
      }

      if (!bypassCache) {
        const cached = sessionInsightsCache.get(requestSignature);
        if (cached) {
          setData(cached);
          setError(null);
          setLoading(false);
          return;
        }
      }

      setLoading(true);
      setError(null);

      try {
        const res = await fetch('/api/anomaly-auto-insights', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal,
          body: JSON.stringify({
            periodLabel: periodRangeLabel,
            metricMode,
            monthCount,
            topCategories: topThree.map((s) => ({
              mainCategory: s.mainCategory,
              spikeCount: s.spikeCount,
              totalExcessAmount: s.totalExcessAmount,
              maxSpikePct: s.maxSpikePct,
              sharePct:
                metricMode === 'frequency' ? s.frequencySharePct : s.excessSharePct,
              subCategories: s.subCategories.slice(0, 5),
              sampleTransactions: s.sampleTransactions.slice(0, 5),
            })),
          }),
        });

        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            payload?.error || 'Gagal memuat Insight Otomatis AI dari server.'
          );
        }

        const result: AnomalyAutoInsightsResponse = {
          executiveSummary: String(payload?.executiveSummary || '').trim(),
          insights: Array.isArray(payload?.insights) ? payload.insights : [],
          generatedAt: String(payload?.generatedAt || '').trim(),
        };

        if (!signal.aborted) {
          setSessionCache(requestSignature, result);
          setData(result);
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
        if (!signal.aborted) {
          setError(
            err?.message ||
              'Tidak dapat terhubung ke layanan AI untuk Insight Otomatis.'
          );
        }
      } finally {
        if (!signal.aborted) {
          setLoading(false);
        }
      }
    },
    [metricMode, monthCount, periodRangeLabel, requestSignature, topThree]
  );

  useEffect(() => {
    if (!requestSignature || topThree.length === 0) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }

    const bypassCache = refreshNonce > 0;
    if (!bypassCache) {
      const cached = sessionInsightsCache.get(requestSignature);
      if (cached) {
        setData(cached);
        setError(null);
        setLoading(false);
        return;
      }
    }

    const controller = new AbortController();
    const timerId = window.setTimeout(() => {
      fetchAutoInsights(controller.signal, bypassCache);
    }, bypassCache ? 0 : 250);

    return () => {
      window.clearTimeout(timerId);
      controller.abort();
    };
  }, [fetchAutoInsights, refreshNonce, requestSignature, topThree.length]);

  const handleManualRefresh = () => {
    if (requestSignature) {
      sessionInsightsCache.delete(requestSignature);
    }
    setRefreshNonce((prev) => prev + 1);
  };

  if (topThree.length === 0) {
    return null;
  }

  const totalMonthlySavingsTarget =
    data?.insights.reduce(
      (sum, item) => sum + (Number(item.monthlySavingsTarget) || 0),
      0
    ) || 0;

  return (
    <div
      id="anomaly-auto-insights-panel"
      className="border-t border-slate-200 dark:border-slate-800 pt-5 space-y-4"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-0.5 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Sparkles className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <h4 className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
              Insight Otomatis
            </h4>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              · Top {topThree.length} Kategori Utama · {periodRangeLabel}
              {data?.generatedAt ? ` · Diperbarui ${data.generatedAt}` : ''}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Saran tindakan otomatis bertenaga AI untuk menekan pengeluaran pada kategori utama yang paling sering melonjak.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {totalMonthlySavingsTarget > 0 && !loading && (
            <div className="text-right">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                Potensi Hemat Total
              </span>
              <span className="text-xs font-mono tabular-nums font-extrabold text-emerald-700 dark:text-emerald-400">
                {formatterIDR.format(totalMonthlySavingsTarget)}/bln
              </span>
            </div>
          )}

          <button
            type="button"
            disabled={loading}
            onClick={handleManualRefresh}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/70 text-slate-700 dark:text-slate-200 disabled:opacity-60 transition cursor-pointer disabled:cursor-wait whitespace-nowrap shrink-0 inline-flex items-center gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Menganalisis...' : 'Perbarui'}</span>
          </button>
        </div>
      </div>

      {/* Loading Skeleton State */}
      {loading && (
        <div className="space-y-3" aria-busy="true" aria-label="Memuat Insight Otomatis AI">
          <div className="h-4 w-3/4 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {topThree.map((slice) => (
              <div
                key={slice.mainCategory}
                className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20 space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="h-4 w-32 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
                  <div className="h-4 w-20 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
                </div>
                <div className="h-3.5 w-full rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
                <div className="space-y-2 pt-1">
                  <div className="h-3 w-11/12 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
                  <div className="h-3 w-4/5 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error State */}
      {!loading && error && (
        <div
          role="alert"
          className="p-4 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50/70 dark:bg-rose-950/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
        >
          <div className="flex items-start gap-2.5 text-rose-800 dark:text-rose-200">
            <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={handleManualRefresh}
            className="px-3 py-1.5 rounded-lg font-bold bg-white dark:bg-slate-900 border border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition cursor-pointer whitespace-nowrap shrink-0"
          >
            Coba Lagi
          </button>
        </div>
      )}

      {/* Populated Insights State */}
      {!loading && !error && data && (
        <div className="space-y-3.5">
          {data.executiveSummary && (
            <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
              {data.executiveSummary}
            </p>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {data.insights.map((insight, index) => {
              const matchedSlice =
                sliceByMainCategory.get(insight.mainCategory.toLowerCase()) ||
                topThree[index];
              const swatchColor = matchedSlice?.color || '#4f46e5';
              const isFocused =
                selectedMainCategory !== null &&
                selectedMainCategory.toLowerCase() ===
                  insight.mainCategory.toLowerCase();

              return (
                <article
                  key={insight.mainCategory}
                  onClick={() => {
                    if (onSelectMainCategory && matchedSlice) {
                      onSelectMainCategory(matchedSlice.mainCategory);
                    }
                  }}
                  className={`p-4 rounded-xl border transition-colors flex flex-col justify-between gap-3 ${
                    onSelectMainCategory ? 'cursor-pointer' : ''
                  } ${
                    isFocused
                      ? 'border-slate-400 dark:border-slate-500 bg-slate-50 dark:bg-slate-800/60'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/20 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <div className="space-y-2.5">
                    {/* Card Header: Swatch + Category Name + Unboxed Metadata */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-xs shrink-0"
                          style={{ backgroundColor: swatchColor }}
                        />
                        <h5 className="text-xs font-extrabold text-slate-900 dark:text-slate-100 truncate">
                          {insight.mainCategory}
                        </h5>
                      </div>

                      <span
                        className={`text-[11px] font-bold shrink-0 ${
                          insight.priorityLevel === 'high'
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-amber-700 dark:text-amber-300'
                        }`}
                      >
                        {insight.priorityLevel === 'high'
                          ? 'Prioritas Tinggi'
                          : 'Perlu Perhatian'}
                      </span>
                    </div>

                    {/* Quantitative Context & Target Hemat Row */}
                    <div className="flex items-center justify-between gap-2 py-2 border-y border-slate-200/70 dark:border-slate-800 text-xs">
                      <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                        {matchedSlice ? `${matchedSlice.spikeCount}x lonjakan` : ''}
                        {matchedSlice ? ` · +${matchedSlice.maxSpikePct}% puncak` : ''}
                      </span>

                      <div className="text-right shrink-0">
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 mr-1.5">
                          Target hemat
                        </span>
                        <span className="font-mono tabular-nums font-extrabold text-emerald-700 dark:text-emerald-400">
                          {formatterIDR.format(insight.monthlySavingsTarget)}/bln
                        </span>
                      </div>
                    </div>

                    {/* Root Cause Hint */}
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      {insight.rootCauseHint}
                    </p>

                    {/* Action Steps */}
                    <ol className="space-y-1.5 text-xs text-slate-700 dark:text-slate-200">
                      {insight.actionSteps.map((step, stepIdx) => (
                        <li key={stepIdx} className="flex items-start gap-2 leading-relaxed">
                          <span className="font-mono tabular-nums font-bold text-slate-400 dark:text-slate-500 shrink-0">
                            {stepIdx + 1}.
                          </span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
