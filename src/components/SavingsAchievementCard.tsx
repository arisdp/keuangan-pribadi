import React, { useMemo, useState, useEffect, useRef } from 'react';
import { CategoryBudget, SavingsGoal, Transaction } from '../types';
import {
  classifyTransaction,
  isInternalTransfer,
  isOperatingExpense,
  isOperatingIncome,
} from '../utils/accountingEngine';
import {
  PiggyBank,
  Target,
  Wallet,
  CheckCircle2,
  TrendingUp,
  ArrowUpRight,
  Plus,
  ArrowDown,
  Sparkles,
  RefreshCw,
  AlertCircle,
  Calendar,
} from 'lucide-react';

interface SavingsAchievementCardProps {
  budgets: CategoryBudget[];
  transactions: Transaction[];
  savingsGoals: SavingsGoal[];
  activeMonthStr: string;
  activeMonthLabel: string;
  formatValue: (amount: number, isSensitive?: boolean) => string;
  onOpenBudgetTab: () => void;
  onOpenAddGoal: () => void;
  onScrollToGoals: () => void;
}

interface SavingBudgetBreakdownItem {
  category: string;
  limit: number;
  actual: number;
  rawPct: number;
  remaining: number;
}

interface SavingsProjectionAiResult {
  projectedTotalDate: string;
  estimatedMonthsRemaining: number;
  nearestGoalTitle: string;
  nearestGoalProjectedDate: string;
  nearestGoalStatus: string;
  projectionSummary: string;
  accelerationTip: string;
  generatedAt?: string;
}

const MONTH_NAMES_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

function getLast3CalendarMonths(activeMonthStr: string): Array<{ monthKey: string; monthLabel: string }> {
  const parts = activeMonthStr.split('-');
  const baseYear = parseInt(parts[0] || '', 10) || new Date().getFullYear();
  const baseMonth = parseInt(parts[1] || '', 10) || new Date().getMonth() + 1;

  const list: Array<{ monthKey: string; monthLabel: string }> = [];
  for (let offset = 2; offset >= 0; offset--) {
    const dt = new Date(baseYear, baseMonth - 1 - offset, 1);
    const y = dt.getFullYear();
    const m = dt.getMonth() + 1;
    const monthKey = `${y}-${String(m).padStart(2, '0')}`;
    const monthLabel = `${MONTH_NAMES_ID[m - 1] || String(m)} ${y}`;
    list.push({ monthKey, monthLabel });
  }
  return list;
}

export const SavingsAchievementCard: React.FC<SavingsAchievementCardProps> = ({
  budgets,
  transactions,
  savingsGoals,
  activeMonthStr,
  activeMonthLabel,
  formatValue,
  onOpenBudgetTab,
  onOpenAddGoal,
  onScrollToGoals,
}) => {
  const [hoveredRing, setHoveredRing] = useState<'budget' | 'goal' | null>(null);

  // AI Projection states & session cache
  const [aiProjection, setAiProjection] = useState<SavingsProjectionAiResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiRefreshNonce, setAiRefreshNonce] = useState(0);
  const aiCacheRef = useRef<Map<string, SavingsProjectionAiResult>>(new Map());
  const lastForcedNonceRef = useRef<number>(0);

  const metrics = useMemo(() => {
    // 1. Rencana Anggaran (khusus tipe 'saving' pada bulan berjalan)
    const savingBudgets = (budgets || []).filter(
      (b) => b.type === 'saving' && (b.limit || 0) > 0
    );

    const monthlySavingTxs = (transactions || []).filter((tx) => {
      if (!tx.date || !tx.date.startsWith(activeMonthStr)) return false;
      if (tx.type !== 'saving') return false;
      if (isInternalTransfer(tx) || classifyTransaction(tx) === 'debt_proceeds') {
        return false;
      }
      return true;
    });

    const budgetItems: SavingBudgetBreakdownItem[] = savingBudgets.map((b) => {
      const catLower = b.category.toLowerCase().trim();
      const actual = monthlySavingTxs
        .filter((tx) => (tx.category || '').toLowerCase().trim() === catLower)
        .reduce((sum, tx) => sum + Math.abs(tx.amount || 0), 0);
      const limit = Math.max(0, b.limit || 0);
      const rawPct = limit > 0 ? (actual / limit) * 100 : 0;
      return {
        category: b.category,
        limit,
        actual,
        rawPct,
        remaining: Math.max(0, limit - actual),
      };
    });

    const totalBudgetLimit = budgetItems.reduce((sum, item) => sum + item.limit, 0);
    const totalBudgetActual = budgetItems.reduce((sum, item) => sum + item.actual, 0);
    const budgetRawPct =
      totalBudgetLimit > 0 ? (totalBudgetActual / totalBudgetLimit) * 100 : 0;
    const budgetCappedPct = Math.min(100, Math.max(0, budgetRawPct));
    const budgetRemainingGap = Math.max(0, totalBudgetLimit - totalBudgetActual);
    const hasBudgetTarget = totalBudgetLimit > 0;

    // 2. Target Tabungan (akumulasi seluruh goal aktif)
    const activeGoals = (savingsGoals || []).filter((g) => (g.targetAmount || 0) > 0);
    const totalGoalTarget = activeGoals.reduce(
      (sum, g) => sum + Math.max(0, g.targetAmount || 0),
      0
    );
    const totalGoalSaved = activeGoals.reduce(
      (sum, g) => sum + Math.max(0, g.currentAmount || 0),
      0
    );
    const completedGoalsCount = activeGoals.filter(
      (g) => (g.currentAmount || 0) >= (g.targetAmount || 0)
    ).length;
    const goalRawPct =
      totalGoalTarget > 0 ? (totalGoalSaved / totalGoalTarget) * 100 : 0;
    const goalCappedPct = Math.min(100, Math.max(0, goalRawPct));
    const goalRemainingGap = Math.max(0, totalGoalTarget - totalGoalSaved);
    const hasGoalTarget = totalGoalTarget > 0;

    const goalHighlights = [...activeGoals]
      .map((g) => {
        const currentAmount = Math.max(0, g.currentAmount || 0);
        const pct =
          g.targetAmount > 0
            ? Math.min(100, Math.max(0, (currentAmount / g.targetAmount) * 100))
            : 0;
        return {
          id: g.id,
          title: g.title,
          currentAmount,
          targetAmount: g.targetAmount,
          remaining: Math.max(0, g.targetAmount - currentAmount),
          targetDate: g.targetDate || '',
          pct,
        };
      })
      .sort((a, b) => {
        const aDone = a.pct >= 100 ? 1 : 0;
        const bDone = b.pct >= 100 ? 1 : 0;
        if (aDone !== bDone) return aDone - bDone;
        return b.pct - a.pct;
      });

    // Target terdekat yang belum terpenuhi (sisa nominal terkecil)
    const incompleteGoals = goalHighlights.filter((g) => g.remaining > 0);
    const nearestIncompleteGoal =
      incompleteGoals.length > 0
        ? [...incompleteGoals].sort((a, b) => {
            if (a.remaining !== b.remaining) return a.remaining - b.remaining;
            return b.pct - a.pct;
          })[0]
        : null;

    // 3. Penggabungan rata-rata progres
    let combinedPct: number | null = null;
    let sourceMode: 'both' | 'budget_only' | 'goal_only' | 'empty' = 'empty';

    if (hasBudgetTarget && hasGoalTarget) {
      combinedPct = (budgetCappedPct + goalCappedPct) / 2;
      sourceMode = 'both';
    } else if (hasBudgetTarget) {
      combinedPct = budgetCappedPct;
      sourceMode = 'budget_only';
    } else if (hasGoalTarget) {
      combinedPct = goalCappedPct;
      sourceMode = 'goal_only';
    }

    // 4. Laju menabung rata-rata 3 bulan terakhir (untuk proyeksi AI)
    const last3MonthsMeta = getLast3CalendarMonths(activeMonthStr);
    const monthlyHistory3M = last3MonthsMeta.map(({ monthKey, monthLabel }) => {
      const mTxs = (transactions || []).filter(
        (tx) =>
          tx.date &&
          tx.date.startsWith(monthKey) &&
          !isInternalTransfer(tx) &&
          classifyTransaction(tx) !== 'debt_proceeds'
      );
      const operatingIncome = mTxs
        .filter(isOperatingIncome)
        .reduce((sum, tx) => sum + Math.abs(tx.amount || 0), 0);
      const operatingExpense = mTxs
        .filter(isOperatingExpense)
        .reduce((sum, tx) => sum + Math.abs(tx.amount || 0), 0);
      const directSavingAmount = mTxs
        .filter((tx) => tx.type === 'saving')
        .reduce((sum, tx) => sum + Math.abs(tx.amount || 0), 0);
      const netCashSurplus = operatingIncome - operatingExpense;

      return {
        monthKey,
        monthLabel,
        operatingIncome,
        operatingExpense,
        directSavingAmount,
        netCashSurplus,
      };
    });

    const avgDirectSaving3M =
      monthlyHistory3M.reduce((sum, m) => sum + m.directSavingAmount, 0) / 3;
    const avgNetSurplus3M =
      monthlyHistory3M.reduce((sum, m) => sum + m.netCashSurplus, 0) / 3;
    const effectiveMonthlySavingRate =
      avgDirectSaving3M > 0 ? avgDirectSaving3M : Math.max(0, avgNetSurplus3M);
    const rateBasisLabel =
      avgDirectSaving3M > 0
        ? 'Rata-rata setoran tabungan 3 bln'
        : 'Rata-rata surplus kas 3 bln';

    return {
      budgetItems,
      totalBudgetLimit,
      totalBudgetActual,
      budgetRawPct,
      budgetCappedPct,
      budgetRemainingGap,
      hasBudgetTarget,
      activeGoalsCount: activeGoals.length,
      completedGoalsCount,
      totalGoalTarget,
      totalGoalSaved,
      goalRawPct,
      goalCappedPct,
      goalRemainingGap,
      hasGoalTarget,
      goalHighlights,
      nearestIncompleteGoal,
      combinedPct,
      sourceMode,
      monthlyHistory3M,
      avgDirectSaving3M,
      avgNetSurplus3M,
      effectiveMonthlySavingRate,
      rateBasisLabel,
    };
  }, [budgets, transactions, savingsGoals, activeMonthStr]);

  // Deterministic AI request payload
  const aiRequestPayload = useMemo(() => {
    const now = new Date();
    const currentDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
      2,
      '0'
    )}-${String(now.getDate()).padStart(2, '0')}`;

    return {
      currentDateStr,
      activeMonthLabel,
      monthlyHistory3M: metrics.monthlyHistory3M,
      avgDirectSaving3M: Math.round(metrics.avgDirectSaving3M),
      avgNetSurplus3M: Math.round(metrics.avgNetSurplus3M),
      effectiveMonthlySavingRate: Math.round(metrics.effectiveMonthlySavingRate),
      totalBudgetLimit: metrics.totalBudgetLimit,
      totalBudgetActual: metrics.totalBudgetActual,
      totalGoalSaved: metrics.totalGoalSaved,
      totalGoalTarget: metrics.totalGoalTarget,
      remainingTotalGoalGap: metrics.goalRemainingGap,
      nearestGoal: metrics.nearestIncompleteGoal
        ? {
            title: metrics.nearestIncompleteGoal.title,
            currentAmount: metrics.nearestIncompleteGoal.currentAmount,
            targetAmount: metrics.nearestIncompleteGoal.targetAmount,
            remainingAmount: metrics.nearestIncompleteGoal.remaining,
            targetDate: metrics.nearestIncompleteGoal.targetDate || null,
            progressPct: Number(metrics.nearestIncompleteGoal.pct.toFixed(1)),
          }
        : null,
    };
  }, [activeMonthLabel, metrics]);

  const aiCacheKey = useMemo(() => JSON.stringify(aiRequestPayload), [aiRequestPayload]);
  const shouldFetchAiProjection = metrics.hasGoalTarget && metrics.goalRemainingGap > 0;

  useEffect(() => {
    if (!shouldFetchAiProjection) {
      setAiLoading(false);
      setAiError(null);
      setAiProjection(null);
      return;
    }

    const isForcedReload = aiRefreshNonce !== lastForcedNonceRef.current;
    if (!isForcedReload && aiCacheRef.current.has(aiCacheKey)) {
      setAiProjection(aiCacheRef.current.get(aiCacheKey) || null);
      setAiError(null);
      setAiLoading(false);
      return;
    }

    const controller = new AbortController();
    setAiLoading(true);
    setAiError(null);

    const delayMs = isForcedReload ? 0 : 600;
    const timerId = window.setTimeout(async () => {
      try {
        lastForcedNonceRef.current = aiRefreshNonce;
        const res = await fetch('/api/savings-projection', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(aiRequestPayload),
          signal: controller.signal,
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            data?.error || `Gagal memuat estimasi AI (HTTP ${res.status}).`
          );
        }

        const formatted: SavingsProjectionAiResult = {
          projectedTotalDate: String(data?.projectedTotalDate || ''),
          estimatedMonthsRemaining: Number.isFinite(Number(data?.estimatedMonthsRemaining))
            ? Number(data.estimatedMonthsRemaining)
            : -1,
          nearestGoalTitle: String(data?.nearestGoalTitle || ''),
          nearestGoalProjectedDate: String(data?.nearestGoalProjectedDate || ''),
          nearestGoalStatus: String(data?.nearestGoalStatus || ''),
          projectionSummary: String(data?.projectionSummary || ''),
          accelerationTip: String(data?.accelerationTip || ''),
          generatedAt: data?.generatedAt ? String(data.generatedAt) : undefined,
        };

        aiCacheRef.current.set(aiCacheKey, formatted);
        if (!controller.signal.aborted) {
          setAiProjection(formatted);
          setAiError(null);
          setAiLoading(false);
        }
      } catch (err: any) {
        if (controller.signal.aborted || err?.name === 'AbortError') return;
        setAiError(
          err?.message ||
            'Gagal menghubungi layanan AI untuk memproyeksikan tanggal target.'
        );
        setAiLoading(false);
      }
    }, delayMs);

    return () => {
      window.clearTimeout(timerId);
      controller.abort();
    };
  }, [aiCacheKey, aiRequestPayload, aiRefreshNonce, shouldFetchAiProjection]);

  const statusMeta = useMemo(() => {
    const pct = metrics.combinedPct ?? 0;
    if (pct >= 100) {
      return {
        label: 'Target Terpenuhi',
        textClass: 'text-emerald-700 dark:text-emerald-400',
        headlineColor: 'text-emerald-700 dark:text-emerald-400',
      };
    }
    if (pct >= 75) {
      return {
        label: 'Hampir Tercapai',
        textClass: 'text-blue-700 dark:text-blue-400',
        headlineColor: 'text-blue-700 dark:text-blue-400',
      };
    }
    if (pct >= 40) {
      return {
        label: 'Berjalan Baik',
        textClass: 'text-indigo-700 dark:text-indigo-400',
        headlineColor: 'text-slate-900 dark:text-white',
      };
    }
    return {
      label: 'Tahap Awal',
      textClass: 'text-amber-700 dark:text-amber-400',
      headlineColor: 'text-slate-900 dark:text-white',
    };
  }, [metrics.combinedPct]);

  // Dual Concentric SVG Ring geometry (viewBox 156x156, center 78,78)
  const outerRadius = 64;
  const outerCircumference = 2 * Math.PI * outerRadius;
  const outerDashOffset =
    outerCircumference * (1 - metrics.budgetCappedPct / 100);

  const innerRadius = 47;
  const innerCircumference = 2 * Math.PI * innerRadius;
  const innerDashOffset =
    innerCircumference * (1 - metrics.goalCappedPct / 100);

  const nearestStatusColor = useMemo(() => {
    const status = (aiProjection?.nearestGoalStatus || '').toLowerCase();
    if (status.includes('cepat') || status.includes('tercapai') || status.includes('tepat')) {
      return 'text-emerald-700 dark:text-emerald-400';
    }
    if (status.includes('lewat') || status.includes('perlu')) {
      return 'text-amber-700 dark:text-amber-400';
    }
    return 'text-blue-700 dark:text-blue-400';
  }, [aiProjection?.nearestGoalStatus]);

  return (
    <section
      aria-label="Pencapaian Tabungan Gabungan"
      className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
    >
      {/* Header + Dual Concentric Circular Progress Ring & Proportion Legend */}
      <div className="p-5 sm:p-6 border-b border-slate-200 dark:border-slate-800">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          {/* Left Title & Context */}
          <div className="space-y-3 min-w-0 flex-1">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200/70 dark:border-emerald-800/50 shrink-0">
                <PiggyBank className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-black text-slate-900 dark:text-slate-100 tracking-tight">
                  Pencapaian Tabungan Gabungan
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                  {activeMonthLabel} ·{' '}
                  {metrics.sourceMode === 'both'
                    ? 'Proporsi progres real-time antara Rencana Anggaran Tabungan (cincin luar) & Target Tabungan (cincin dalam)'
                    : metrics.sourceMode === 'budget_only'
                    ? 'Dihitung dari Rencana Anggaran Tabungan bulan ini (Target Tabungan belum ditambahkan)'
                    : metrics.sourceMode === 'goal_only'
                    ? 'Dihitung dari Target Tabungan kumulatif (pos Anggaran Tabungan belum diatur)'
                    : 'Gabungan pos anggaran Tabungan bulanan dan Target Tabungan kumulatif Anda'}
                </p>
              </div>
            </div>

            {metrics.combinedPct !== null && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs pt-1">
                <span
                  className={`inline-flex items-center gap-1.5 font-bold ${statusMeta.textClass}`}
                >
                  {metrics.combinedPct >= 100 ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                  ) : (
                    <TrendingUp className="h-4 w-4 shrink-0" />
                  )}
                  <span>Status: {statusMeta.label}</span>
                </span>
                <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">
                  ·
                </span>
                <span className="text-slate-600 dark:text-slate-300 font-mono tabular-nums">
                  Sisa jarak ke 100%: {Math.max(0, 100 - metrics.combinedPct).toFixed(1)}%
                </span>
              </div>
            )}
          </div>

          {/* Right: Dual Concentric Circular Progress Ring + Proportion Legend */}
          {metrics.combinedPct !== null && (
            <div className="flex flex-col sm:flex-row items-center gap-5 shrink-0">
              <div className="relative w-36 h-36 sm:w-40 sm:h-40 shrink-0 flex items-center justify-center">
                <svg
                  viewBox="0 0 156 156"
                  className="w-full h-full -rotate-90"
                  role="img"
                  aria-label={`Grafik melingkar konsentris ganda: Rencana Anggaran Tabungan ${metrics.budgetCappedPct.toFixed(
                    1
                  )} persen, Target Tabungan ${metrics.goalCappedPct.toFixed(
                    1
                  )} persen, Gabungan ${metrics.combinedPct.toFixed(1)} persen`}
                >
                  {/* Outer Track + Progress: Rencana Anggaran Tabungan */}
                  <circle
                    cx="78"
                    cy="78"
                    r={outerRadius}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="11"
                    className="text-slate-100 dark:text-slate-800"
                  />
                  <circle
                    cx="78"
                    cy="78"
                    r={outerRadius}
                    fill="none"
                    stroke="#2563EB"
                    strokeWidth="11"
                    strokeLinecap="round"
                    strokeDasharray={outerCircumference}
                    strokeDashoffset={outerDashOffset}
                    className="transition-all duration-500 ease-out"
                    style={{
                      opacity: hoveredRing === 'goal' ? 0.28 : 1,
                    }}
                  />

                  {/* Inner Track + Progress: Target Tabungan Kumulatif */}
                  <circle
                    cx="78"
                    cy="78"
                    r={innerRadius}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="11"
                    className="text-slate-100 dark:text-slate-800"
                  />
                  <circle
                    cx="78"
                    cy="78"
                    r={innerRadius}
                    fill="none"
                    stroke="#059669"
                    strokeWidth="11"
                    strokeLinecap="round"
                    strokeDasharray={innerCircumference}
                    strokeDashoffset={innerDashOffset}
                    className="transition-all duration-500 ease-out"
                    style={{
                      opacity: hoveredRing === 'budget' ? 0.28 : 1,
                    }}
                  />
                </svg>

                {/* Center Combined Readout */}
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-4">
                  <span
                    className={`text-xl sm:text-2xl font-black font-mono tabular-nums tracking-tight ${statusMeta.headlineColor}`}
                  >
                    {metrics.combinedPct.toFixed(1)}%
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-0.5">
                    Gabungan
                  </span>
                </div>
              </div>

              {/* Interactive Proportion Legend */}
              <div className="w-full sm:w-64 divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                <div
                  onMouseEnter={() => setHoveredRing('budget')}
                  onMouseLeave={() => setHoveredRing(null)}
                  className={`py-2.5 flex items-start justify-between gap-3 transition-opacity duration-150 cursor-default ${
                    hoveredRing === 'goal' ? 'opacity-40' : 'opacity-100'
                  }`}
                >
                  <div className="flex items-start gap-2 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-600 mt-1 shrink-0" />
                    <div className="min-w-0">
                      <span className="font-bold text-slate-800 dark:text-slate-100 block leading-tight">
                        Anggaran Tabungan
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums block mt-0.5">
                        {metrics.hasBudgetTarget
                          ? `${formatValue(metrics.totalBudgetActual)} / ${formatValue(
                              metrics.totalBudgetLimit
                            )}`
                          : 'Belum diatur'}
                      </span>
                    </div>
                  </div>
                  <span className="font-mono tabular-nums font-black text-blue-700 dark:text-blue-400 shrink-0">
                    {metrics.hasBudgetTarget ? `${metrics.budgetRawPct.toFixed(1)}%` : '—'}
                  </span>
                </div>

                <div
                  onMouseEnter={() => setHoveredRing('goal')}
                  onMouseLeave={() => setHoveredRing(null)}
                  className={`py-2.5 flex items-start justify-between gap-3 transition-opacity duration-150 cursor-default ${
                    hoveredRing === 'budget' ? 'opacity-40' : 'opacity-100'
                  }`}
                >
                  <div className="flex items-start gap-2 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 mt-1 shrink-0" />
                    <div className="min-w-0">
                      <span className="font-bold text-slate-800 dark:text-slate-100 block leading-tight">
                        Target Tabungan
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums block mt-0.5">
                        {metrics.hasGoalTarget
                          ? `${formatValue(metrics.totalGoalSaved)} / ${formatValue(
                              metrics.totalGoalTarget
                            )}`
                          : 'Belum ada target'}
                      </span>
                    </div>
                  </div>
                  <span className="font-mono tabular-nums font-black text-emerald-700 dark:text-emerald-400 shrink-0">
                    {metrics.hasGoalTarget ? `${metrics.goalRawPct.toFixed(1)}%` : '—'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Empty State vs 2-Column Breakdown */}
      {metrics.sourceMode === 'empty' ? (
        <div className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50 dark:bg-slate-800/30">
          <div className="space-y-1">
            <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
              Belum ada target anggaran Tabungan maupun Target Tabungan yang aktif
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Atur batas alokasi tabungan bulanan di Rencana Anggaran atau buat Target Tabungan untuk melihat grafik cincin ganda dan proyeksi tanggal pencapaian AI.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onOpenBudgetTab}
              className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 transition cursor-pointer whitespace-nowrap"
            >
              Atur Anggaran Tabungan
            </button>
            <button
              type="button"
              onClick={onOpenAddGoal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-xs font-bold text-white transition cursor-pointer whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Buat Target Tabungan</span>
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-slate-800">
            {/* Column 1: Rencana Anggaran (Tabungan Bulan Berjalan) */}
            <div className="p-5 flex flex-col justify-between gap-4">
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-xs font-extrabold text-slate-800 dark:text-slate-100">
                      <Wallet className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                      <span>Rencana Anggaran · Pos Tabungan</span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {metrics.hasBudgetTarget
                        ? `${metrics.budgetItems.length} kategori tabungan pada ${activeMonthLabel}`
                        : `Belum ada anggaran bertipe Tabungan pada ${activeMonthLabel}`}
                    </p>
                  </div>
                  <span className="text-base font-black font-mono tabular-nums text-blue-700 dark:text-blue-400 shrink-0">
                    {metrics.hasBudgetTarget ? `${metrics.budgetRawPct.toFixed(1)}%` : '—'}
                  </span>
                </div>

                {metrics.hasBudgetTarget ? (
                  <>
                    <div
                      role="progressbar"
                      aria-label="Progres Rencana Anggaran Tabungan bulan ini"
                      aria-valuenow={Math.round(metrics.budgetCappedPct)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"
                    >
                      <div
                        className="h-full rounded-full bg-blue-600 transition-all duration-500 ease-out"
                        style={{ width: `${metrics.budgetCappedPct}%` }}
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-0.5 text-[11px]">
                      <div>
                        <span className="text-slate-500 dark:text-slate-400 block">Terealisasi</span>
                        <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100 block mt-0.5">
                          {formatValue(metrics.totalBudgetActual)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 dark:text-slate-400 block">Target Bulan Ini</span>
                        <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100 block mt-0.5">
                          {formatValue(metrics.totalBudgetLimit)}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-500 dark:text-slate-400 block">Sisa Target</span>
                        <span
                          className={`font-mono tabular-nums font-bold block mt-0.5 ${
                            metrics.budgetRemainingGap === 0
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {metrics.budgetRemainingGap === 0
                            ? 'Terpenuhi'
                            : formatValue(metrics.budgetRemainingGap)}
                        </span>
                      </div>
                    </div>

                    {metrics.budgetItems.length > 0 && (
                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
                        {metrics.budgetItems.slice(0, 3).map((item) => (
                          <div
                            key={`sav-bud-${item.category}`}
                            className="flex items-center justify-between gap-2 text-[11px]"
                          >
                            <span className="text-slate-700 dark:text-slate-300 font-medium truncate">
                              {item.category}
                            </span>
                            <span className="font-mono tabular-nums text-slate-600 dark:text-slate-400 shrink-0">
                              {formatValue(item.actual)} / {formatValue(item.limit)}{' '}
                              <strong className="text-slate-900 dark:text-slate-100">
                                ({item.rawPct.toFixed(0)}%)
                              </strong>
                            </span>
                          </div>
                        ))}
                        {metrics.budgetItems.length > 3 && (
                          <p className="text-[10px] text-slate-400">
                            +{metrics.budgetItems.length - 3} kategori tabungan lainnya di Rencana Anggaran
                          </p>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400 py-2">
                    Tambahkan kategori anggaran bertipe <strong className="text-slate-700 dark:text-slate-200">Tabungan</strong> di modul Rencana Anggaran untuk melacak target setoran bulanan Anda.
                  </p>
                )}
              </div>

              <div className="pt-1 flex items-center justify-end">
                <button
                  type="button"
                  onClick={onOpenBudgetTab}
                  className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 transition cursor-pointer"
                >
                  <span>{metrics.hasBudgetTarget ? 'Kelola Rencana Anggaran' : 'Buat Anggaran Tabungan'}</span>
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Column 2: Target Tabungan (Kumulatif Goal Tracker) */}
            <div className="p-5 flex flex-col justify-between gap-4">
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-xs font-extrabold text-slate-800 dark:text-slate-100">
                      <Target className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span>Target Tabungan · Akumulasi Goal</span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {metrics.hasGoalTarget
                        ? `${metrics.completedGoalsCount} dari ${metrics.activeGoalsCount} target terpenuhi`
                        : 'Belum ada target tabungan jangka pendek/panjang'}
                    </p>
                  </div>
                  <span className="text-base font-black font-mono tabular-nums text-emerald-700 dark:text-emerald-400 shrink-0">
                    {metrics.hasGoalTarget ? `${metrics.goalRawPct.toFixed(1)}%` : '—'}
                  </span>
                </div>

                {metrics.hasGoalTarget ? (
                  <>
                    <div
                      role="progressbar"
                      aria-label="Progres akumulasi Target Tabungan"
                      aria-valuenow={Math.round(metrics.goalCappedPct)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"
                    >
                      <div
                        className="h-full rounded-full bg-emerald-600 transition-all duration-500 ease-out"
                        style={{ width: `${metrics.goalCappedPct}%` }}
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-0.5 text-[11px]">
                      <div>
                        <span className="text-slate-500 dark:text-slate-400 block">Terkumpul</span>
                        <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100 block mt-0.5">
                          {formatValue(metrics.totalGoalSaved)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 dark:text-slate-400 block">Total Target</span>
                        <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100 block mt-0.5">
                          {formatValue(metrics.totalGoalTarget)}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-500 dark:text-slate-400 block">Kekurangan</span>
                        <span
                          className={`font-mono tabular-nums font-bold block mt-0.5 ${
                            metrics.goalRemainingGap === 0
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {metrics.goalRemainingGap === 0
                            ? 'Lunas 100%'
                            : formatValue(metrics.goalRemainingGap)}
                        </span>
                      </div>
                    </div>

                    {metrics.goalHighlights.length > 0 && (
                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
                        {metrics.goalHighlights.slice(0, 3).map((goal) => (
                          <div
                            key={`sav-goal-${goal.id}`}
                            className="flex items-center justify-between gap-2 text-[11px]"
                          >
                            <span className="text-slate-700 dark:text-slate-300 font-medium truncate">
                              {goal.title}
                            </span>
                            <span className="font-mono tabular-nums text-slate-600 dark:text-slate-400 shrink-0">
                              {goal.remaining === 0
                                ? 'Tercapai'
                                : `Kurang ${formatValue(goal.remaining)}`}{' '}
                              <strong className="text-slate-900 dark:text-slate-100">
                                ({goal.pct.toFixed(0)}%)
                              </strong>
                            </span>
                          </div>
                        ))}
                        {metrics.goalHighlights.length > 3 && (
                          <p className="text-[10px] text-slate-400">
                            +{metrics.goalHighlights.length - 3} target tabungan lainnya di bawah
                          </p>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400 py-2">
                    Tambahkan <strong className="text-slate-700 dark:text-slate-200">Target Tabungan</strong> (seperti dana liburan, DP properti, atau pendidikan) untuk memantau progres kumulatif Anda.
                  </p>
                )}
              </div>

              <div className="pt-1 flex flex-wrap items-center justify-end gap-4">
                <button
                  type="button"
                  onClick={onOpenAddGoal}
                  className="inline-flex items-center gap-1 text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Tambah Target</span>
                </button>
                <button
                  type="button"
                  onClick={onScrollToGoals}
                  className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 dark:text-emerald-400 hover:text-emerald-900 dark:hover:text-emerald-300 transition cursor-pointer"
                >
                  <span>Lihat Detail Target</span>
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* AI Savings Target Completion Date Projection Footer Strip */}
          <div className="border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 px-5 sm:px-6 py-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                <Sparkles className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <span className="text-xs font-black text-slate-900 dark:text-slate-100 tracking-tight">
                  Estimasi Tanggal Pencapaian Target (AI)
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  · {metrics.rateBasisLabel}:{' '}
                  <strong className="text-slate-800 dark:text-slate-200">
                    {formatValue(Math.round(metrics.effectiveMonthlySavingRate))}/bln
                  </strong>
                </span>
                {aiProjection?.generatedAt && !aiLoading && !aiError && (
                  <span className="text-[10px] font-mono text-slate-400">
                    ({aiProjection.generatedAt})
                  </span>
                )}
              </div>

              {shouldFetchAiProjection && (
                <button
                  type="button"
                  onClick={() => setAiRefreshNonce((prev) => prev + 1)}
                  disabled={aiLoading}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-[11px] font-bold text-slate-700 dark:text-slate-200 transition cursor-pointer shrink-0"
                  title="Hitung ulang estimasi tanggal pencapaian target berbasis AI"
                >
                  <RefreshCw
                    className={`h-3 w-3 ${aiLoading ? 'animate-spin text-blue-600' : ''}`}
                  />
                  <span>{aiLoading ? 'Memproyeksikan...' : 'Muat Ulang'}</span>
                </button>
              )}
            </div>

            {!metrics.hasGoalTarget ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Tambahkan minimal 1 Target Tabungan agar AI dapat memproyeksikan bulan pencapaian berdasarkan laju menabung 3 bulan terakhir Anda.
              </p>
            ) : metrics.goalRemainingGap === 0 ? (
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>
                  Seluruh Target Tabungan aktif telah tercapai 100% ({formatValue(metrics.totalGoalSaved)} terkumpul).
                </span>
              </div>
            ) : aiLoading ? (
              <div
                className="grid grid-cols-1 md:grid-cols-2 gap-4 py-1"
                aria-busy="true"
                aria-label="Memuat estimasi proyeksi tanggal target AI"
              >
                <div className="space-y-2">
                  <div className="h-3.5 w-1/2 bg-slate-200 dark:bg-slate-800 rounded" />
                  <div className="h-3 w-5/6 bg-slate-200/70 dark:bg-slate-800/70 rounded" />
                </div>
                <div className="space-y-2">
                  <div className="h-3.5 w-2/3 bg-slate-200 dark:bg-slate-800 rounded" />
                  <div className="h-3 w-full bg-slate-200/70 dark:bg-slate-800/70 rounded" />
                </div>
              </div>
            ) : aiError ? (
              <div className="rounded-lg border border-rose-200 dark:border-rose-800/60 bg-rose-50/70 dark:bg-rose-950/30 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-rose-700 dark:text-rose-300">
                <span className="flex items-center gap-1.5 min-w-0">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span className="leading-snug">{aiError}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setAiRefreshNonce((prev) => prev + 1)}
                  className="px-2.5 py-1 rounded-md bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-800 hover:bg-rose-100 text-[11px] font-bold text-rose-700 dark:text-rose-300 transition cursor-pointer shrink-0"
                >
                  Coba Lagi
                </button>
              </div>
            ) : aiProjection ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-0 md:divide-x md:divide-slate-200/80 dark:md:divide-slate-800 pt-2 border-t border-slate-200/70 dark:border-slate-800">
                  {/* Total Remaining Goals Projection */}
                  <div className="space-y-1 md:pr-4">
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block">
                      Proyeksi Seluruh Sisa Target ({formatValue(metrics.goalRemainingGap)})
                    </span>
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="inline-flex items-center gap-1.5 text-sm font-black font-mono tabular-nums text-slate-900 dark:text-slate-100">
                        <Calendar className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                        {aiProjection.projectedTotalDate}
                      </span>
                      {aiProjection.estimatedMonthsRemaining > 0 && (
                        <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                          (±{aiProjection.estimatedMonthsRemaining} bulan lagi)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Closest Active Goal Highlight */}
                  <div className="space-y-1 md:pl-4">
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block truncate">
                      Sorotan Target Terdekat:{' '}
                      <strong className="text-slate-800 dark:text-slate-200">
                        {aiProjection.nearestGoalTitle ||
                          metrics.nearestIncompleteGoal?.title ||
                          '-'}
                      </strong>
                    </span>
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="text-sm font-black font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                        {aiProjection.nearestGoalProjectedDate}
                      </span>
                      {aiProjection.nearestGoalStatus && (
                        <span className={`text-[11px] font-bold ${nearestStatusColor}`}>
                          · {aiProjection.nearestGoalStatus}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-1 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  <p>{aiProjection.projectionSummary}</p>
                  {aiProjection.accelerationTip && (
                    <p className="text-[11px] font-medium text-slate-700 dark:text-slate-300">
                      <strong className="text-blue-700 dark:text-blue-400">Saran:</strong>{' '}
                      {aiProjection.accelerationTip}
                    </p>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
};
