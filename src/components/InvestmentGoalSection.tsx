import React, { useState, useEffect } from 'react';
import { InvestmentGoal, InvestmentAsset } from '../types';
import { FormattedNumberInput } from './FormattedNumberInput';
import { secureStorage } from '../utils/secureStorage';
import { logger } from '../utils/logger';
import {
  Target,
  Plus,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Edit2,
  Trash2,
  ArrowUpRight,
  Sparkles,
  Info,
  DollarSign,
  Layers,
  ChevronRight,
  Coins,
  X,
  TrendingUp,
  Percent
} from 'lucide-react';

interface InvestmentGoalSectionProps {
  investments?: InvestmentAsset[];
}

export function getGoalDaysRemaining(targetDateStr: string): {
  days: number;
  status: 'completed' | 'urgent' | 'upcoming' | 'overdue';
  label: string;
} {
  if (!targetDateStr) return { days: 0, status: 'upcoming', label: 'Belum diatur' };
  const target = new Date(targetDateStr);
  const now = new Date();
  target.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);

  const diffTime = target.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { days: Math.abs(diffDays), status: 'overdue', label: `Terlewat ${Math.abs(diffDays)} hari` };
  } else if (diffDays === 0) {
    return { days: 0, status: 'urgent', label: 'Jatuh tempo hari ini!' };
  } else if (diffDays <= 30) {
    return { days: diffDays, status: 'urgent', label: `${diffDays} hari lagi` };
  } else {
    return { days: diffDays, status: 'upcoming', label: `${diffDays} hari lagi` };
  }
}

export function calculateInvestmentDuration(
  currentAmount: number,
  targetAmount: number,
  monthlyContribution: number,
  annualReturnRatePercent: number
): { months: number; years: number; remMonths: number; targetReachedDateStr: string } {
  const remainingNeeded = Math.max(0, targetAmount - currentAmount);
  if (remainingNeeded <= 0) {
    return { months: 0, years: 0, remMonths: 0, targetReachedDateStr: 'Terpenuhi Saat Ini' };
  }

  const r = (annualReturnRatePercent || 0) / 100 / 12;

  if ((monthlyContribution || 0) <= 0 && r <= 0) {
    return { months: 999, years: 99, remMonths: 11, targetReachedDateStr: 'Atur top-up rutin bulanan' };
  }

  let months = 0;
  if (r <= 0) {
    months = Math.ceil(remainingNeeded / monthlyContribution);
  } else if ((monthlyContribution || 0) <= 0) {
    if (currentAmount <= 0) {
      return { months: 999, years: 99, remMonths: 11, targetReachedDateStr: 'Perlu saldo awal atau top-up' };
    }
    const ratio = targetAmount / currentAmount;
    months = Math.ceil(Math.log(ratio) / Math.log(1 + r));
  } else {
    const numerator = targetAmount * r + monthlyContribution;
    const denominator = currentAmount * r + monthlyContribution;
    if (denominator <= 0) {
      months = Math.ceil(remainingNeeded / monthlyContribution);
    } else {
      months = Math.ceil(Math.log(numerator / denominator) / Math.log(1 + r));
    }
  }

  if (isNaN(months) || !isFinite(months) || months < 0) {
    months = 999;
  }

  const years = Math.floor(months / 12);
  const remMonths = months % 12;

  const targetDate = new Date();
  targetDate.setMonth(targetDate.getMonth() + months);
  const targetReachedDateStr = targetDate.toLocaleDateString('id-ID', {
    month: 'long',
    year: 'numeric',
  });

  return { months, years, remMonths, targetReachedDateStr };
}

const DEFAULT_INVESTMENT_GOALS: InvestmentGoal[] = [
  {
    id: 'inv-goal-1',
    title: 'Beli Emas Antam 100 Gram',
    targetAmount: 140000000,
    currentAmount: 95000000,
    targetDate: '2026-12-31',
    category: 'Logam Mulia (Emas)',
    notes: 'Untuk akumulasi portofolio lindung nilai jangka panjang keluarga',
    monthlyContribution: 2500000,
    annualReturnRate: 8,
  },
  {
    id: 'inv-goal-2',
    title: 'Dana Pensiun Mandiri 2030',
    targetAmount: 500000000,
    currentAmount: 220000000,
    targetDate: '2030-08-17',
    category: 'Reksadana',
    notes: 'Target akumulasi Reksadana Saham & Obligasi untuk masa tua',
    monthlyContribution: 3500000,
    annualReturnRate: 11,
  },
  {
    id: 'inv-goal-3',
    title: 'DP Rumah & Properti Pertama',
    targetAmount: 150000000,
    currentAmount: 135000000,
    targetDate: '2026-10-15',
    category: 'Saham',
    notes: 'Alokasi keuntungan deviden saham & capital gain',
    monthlyContribution: 2000000,
    annualReturnRate: 10,
  },
];

export const InvestmentGoalSection: React.FC<InvestmentGoalSectionProps> = ({
  investments = [],
}) => {
  const formatterIDR = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  });

  const [goals, setGoals] = useState<InvestmentGoal[]>(() => {
    try {
      const saved = secureStorage.getItem('nusantara_investment_goals');
      if (saved !== null) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      logger.error('Failed to parse investment goals:', e);
    }
    return DEFAULT_INVESTMENT_GOALS;
  });

  useEffect(() => {
    const handleDataReset = () => {
      setGoals([]);
    };
    window.addEventListener('nusantara:data-reset', handleDataReset);
    return () => window.removeEventListener('nusantara:data-reset', handleDataReset);
  }, []);

  useEffect(() => {
    try {
      secureStorage.setItem('nusantara_investment_goals', JSON.stringify(goals));
    } catch (e) {
      logger.error('Failed to save investment goals:', e);
    }
  }, [goals]);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingGoal, setEditingGoal] = useState<InvestmentGoal | null>(null);

  // Form States
  const [formTitle, setFormTitle] = useState<string>('');
  const [formTargetAmount, setFormTargetAmount] = useState<number>(0);
  const [formCurrentAmount, setFormCurrentAmount] = useState<number>(0);
  const [formTargetDate, setFormTargetDate] = useState<string>('');
  const [formCategory, setFormCategory] = useState<string>('Logam Mulia (Emas)');
  const [formLinkedAssetId, setFormLinkedAssetId] = useState<string>('');
  const [formNotes, setFormNotes] = useState<string>('');
  const [formMonthlyContribution, setFormMonthlyContribution] = useState<number>(1000000);
  const [formAnnualReturnRate, setFormAnnualReturnRate] = useState<number>(10);

  // Top Up Contribution Modal State
  const [topUpGoal, setTopUpGoal] = useState<InvestmentGoal | null>(null);
  const [topUpAmount, setTopUpAmount] = useState<number>(0);

  const handleOpenAddModal = () => {
    setEditingGoal(null);
    setFormTitle('');
    setFormTargetAmount(10000000);
    setFormCurrentAmount(0);
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);
    setFormTargetDate(futureDate.toISOString().split('T')[0]);
    setFormCategory('Logam Mulia (Emas)');
    setFormLinkedAssetId('');
    setFormNotes('');
    setFormMonthlyContribution(1000000);
    setFormAnnualReturnRate(10);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (goal: InvestmentGoal) => {
    setEditingGoal(goal);
    setFormTitle(goal.title);
    setFormTargetAmount(goal.targetAmount);
    setFormCurrentAmount(goal.currentAmount);
    setFormTargetDate(goal.targetDate);
    setFormCategory(goal.category || 'Logam Mulia (Emas)');
    setFormLinkedAssetId(goal.linkedAssetId || '');
    setFormNotes(goal.notes || '');
    setFormMonthlyContribution(goal.monthlyContribution ?? 1000000);
    setFormAnnualReturnRate(goal.annualReturnRate ?? 10);
    setIsModalOpen(true);
  };

  const handleSaveGoal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) return;

    let finalCurrentAmount = formCurrentAmount;
    // If linked to an asset, sync amount if chosen
    if (formLinkedAssetId) {
      const linkedAsset = investments.find((i) => i.id === formLinkedAssetId);
      if (linkedAsset) {
        finalCurrentAmount = linkedAsset.balance;
      }
    }

    if (editingGoal) {
      setGoals((prev) =>
        prev.map((g) =>
          g.id === editingGoal.id
            ? {
                ...g,
                title: formTitle,
                targetAmount: formTargetAmount,
                currentAmount: finalCurrentAmount,
                targetDate: formTargetDate,
                category: formCategory,
                linkedAssetId: formLinkedAssetId || undefined,
                notes: formNotes,
                monthlyContribution: formMonthlyContribution,
                annualReturnRate: formAnnualReturnRate,
              }
            : g
        )
      );
    } else {
      const newGoal: InvestmentGoal = {
        id: `inv-goal-${Date.now()}`,
        title: formTitle,
        targetAmount: formTargetAmount,
        currentAmount: finalCurrentAmount,
        targetDate: formTargetDate,
        category: formCategory,
        linkedAssetId: formLinkedAssetId || undefined,
        notes: formNotes,
        monthlyContribution: formMonthlyContribution,
        annualReturnRate: formAnnualReturnRate,
      };
      setGoals((prev) => [newGoal, ...prev]);
    }

    setIsModalOpen(false);
  };

  const handleDeleteGoal = (id: string) => {
    if (window.confirm('Apakah Anda yakin ingin menghapus target investasi ini?')) {
      setGoals((prev) => prev.filter((g) => g.id !== id));
    }
  };

  const handleExecuteTopUp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!topUpGoal || topUpAmount <= 0) return;

    setGoals((prev) =>
      prev.map((g) =>
        g.id === topUpGoal.id
          ? { ...g, currentAmount: g.currentAmount + topUpAmount }
          : g
      )
    );

    setTopUpGoal(null);
    setTopUpAmount(0);
  };

  // Summary Metrics
  const totalTargetValue = goals.reduce((sum, g) => sum + g.targetAmount, 0);
  const totalAccumulatedValue = goals.reduce((sum, g) => sum + g.currentAmount, 0);
  const overallCompletionPct =
    totalTargetValue > 0 ? Math.min(100, (totalAccumulatedValue / totalTargetValue) * 100) : 0;
  const completedGoalsCount = goals.filter((g) => g.currentAmount >= g.targetAmount).length;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-6">
      
      {/* Header & Main Summary */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-tr from-blue-600 to-indigo-600 text-white rounded-xl shadow-md">
            <Target className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base sm:text-lg font-black text-slate-800 dark:text-slate-100 uppercase tracking-tight">
                Target & Goals Investasi Spesifik
              </h3>
              <span className="px-2.5 py-0.5 bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 font-extrabold text-[10px] rounded-full uppercase">
                {goals.length} Target
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Pantau akumulasi portofolio, persentase ketercapaian, dan pengingat tanggal jatuh tempo.
            </p>
          </div>
        </div>

        <button
          onClick={handleOpenAddModal}
          className="px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-extrabold text-xs rounded-xl shadow-sm transition flex items-center gap-2 cursor-pointer uppercase tracking-wider"
        >
          <Plus className="h-4 w-4" />
          Tambah Target Baru
        </button>
      </div>

      {/* Summary Scorecards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Total Target */}
        <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-100 dark:border-slate-700/50 space-y-1">
          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
            Total Target Investasi
          </span>
          <span className="text-xl font-black text-slate-800 dark:text-slate-100 font-mono">
            {formatterIDR.format(totalTargetValue)}
          </span>
          <div className="text-[11px] text-slate-500 font-medium flex items-center justify-between pt-1">
            <span>Tercapai:</span>
            <span className="font-bold text-emerald-600 font-mono">
              {formatterIDR.format(totalAccumulatedValue)}
            </span>
          </div>
        </div>

        {/* Overall Progress */}
        <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-100 dark:border-slate-700/50 space-y-2">
          <div className="flex justify-between items-center text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
            <span>Total Ketercapaian Goals</span>
            <span className="font-mono text-blue-600 dark:text-blue-400 font-black text-xs">
              {overallCompletionPct.toFixed(1)}%
            </span>
          </div>
          <div className="w-full bg-slate-200 dark:bg-slate-700 h-2.5 rounded-full overflow-hidden">
            <div
              className="bg-gradient-to-r from-blue-500 to-indigo-600 h-full rounded-full transition-all duration-500"
              style={{ width: `${overallCompletionPct}%` }}
            />
          </div>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
            Sisa kekurang modal akumulasi: <strong className="font-mono text-slate-700 dark:text-slate-200">{formatterIDR.format(Math.max(0, totalTargetValue - totalAccumulatedValue))}</strong>
          </p>
        </div>

        {/* Goal Statuses */}
        <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-100 dark:border-slate-700/50 flex flex-col justify-between">
          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
            Status Target
          </span>
          <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-200 pt-1">
            <span className="flex items-center gap-1.5 text-emerald-600">
              <CheckCircle2 className="h-4 w-4" />
              {completedGoalsCount} Target Selesai
            </span>
            <span className="flex items-center gap-1.5 text-blue-600">
              <Clock className="h-4 w-4" />
              {goals.length - completedGoalsCount} Dalam Proses
            </span>
          </div>
        </div>
      </div>

      {/* Goal Cards Grid */}
      {goals.length === 0 ? (
        <div className="p-8 text-center bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 space-y-3">
          <Target className="h-10 w-10 text-slate-300 mx-auto" />
          <p className="text-xs text-slate-500 font-bold">Belum ada target investasi yang dibuat.</p>
          <button
            onClick={handleOpenAddModal}
            className="px-4 py-2 bg-blue-600 text-white font-bold text-xs rounded-xl shadow-sm hover:bg-blue-700 transition"
          >
            Buat Target Investasi Pertama
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {goals.map((goal) => {
            const currentVal = goal.linkedAssetId
              ? investments.find((i) => i.id === goal.linkedAssetId)?.balance ?? goal.currentAmount
              : goal.currentAmount;

            const progressPct = Math.min(100, Math.max(0, (currentVal / goal.targetAmount) * 100));
            const isCompleted = progressPct >= 100;
            const remainingVal = Math.max(0, goal.targetAmount - currentVal);
            const dueInfo = getGoalDaysRemaining(goal.targetDate);

            // Linked asset info if available
            const linkedAsset = goal.linkedAssetId
              ? investments.find((i) => i.id === goal.linkedAssetId)
              : null;

            return (
              <div
                key={goal.id}
                className={`p-5 rounded-2xl border transition-all duration-200 flex flex-col justify-between space-y-4 shadow-xs relative overflow-hidden ${
                  isCompleted
                    ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800'
                    : dueInfo.status === 'urgent' || dueInfo.status === 'overdue'
                    ? 'bg-amber-50/40 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800'
                    : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700/80 hover:border-blue-300'
                }`}
              >
                {/* Top Badge & Category */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="px-2.5 py-1 bg-slate-100 dark:bg-slate-700/80 text-slate-700 dark:text-slate-200 font-extrabold text-[10px] rounded-lg uppercase tracking-wider">
                      {goal.category || 'Investasi'}
                    </span>

                    {/* Due Date Badge */}
                    {isCompleted ? (
                      <span className="px-2.5 py-1 bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 font-extrabold text-[10px] rounded-lg flex items-center gap-1 uppercase">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Target Terpenuhi
                      </span>
                    ) : dueInfo.status === 'overdue' ? (
                      <span className="px-2.5 py-1 bg-rose-100 dark:bg-rose-900/60 text-rose-800 dark:text-rose-300 font-extrabold text-[10px] rounded-lg flex items-center gap-1 uppercase">
                        <AlertTriangle className="h-3.5 w-3.5" /> {dueInfo.label}
                      </span>
                    ) : dueInfo.status === 'urgent' ? (
                      <span className="px-2.5 py-1 bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 font-extrabold text-[10px] rounded-lg flex items-center gap-1 uppercase animate-pulse">
                        <Clock className="h-3.5 w-3.5" /> {dueInfo.label}
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-extrabold text-[10px] rounded-lg flex items-center gap-1 uppercase">
                        <Calendar className="h-3.5 w-3.5" /> {dueInfo.label}
                      </span>
                    )}
                  </div>

                  <h4 className="font-extrabold text-sm text-slate-800 dark:text-slate-100 line-clamp-1">
                    {goal.title}
                  </h4>

                  {goal.notes && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 font-medium">
                      {goal.notes}
                    </p>
                  )}

                  {linkedAsset && (
                    <div className="p-2 bg-blue-50/70 dark:bg-blue-950/40 rounded-lg text-[10px] text-blue-800 dark:text-blue-300 font-semibold flex items-center justify-between">
                      <span>Aset Terhubung:</span>
                      <span className="font-bold">{linkedAsset.name}</span>
                    </div>
                  )}

                  {/* PREDIKSI DURASI WAKTU HINGGA MENCAPAI TARGET */}
                  {!isCompleted && (
                    <div className="p-3 bg-gradient-to-br from-indigo-50/90 to-blue-50/70 dark:from-indigo-950/40 dark:to-blue-950/30 rounded-xl border border-indigo-200/80 dark:border-indigo-800/60 space-y-1.5">
                      <div className="flex items-center justify-between text-[10px] font-black uppercase text-indigo-900 dark:text-indigo-300">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                          Prediksi Waktu Target:
                        </span>
                        {(() => {
                          const dur = calculateInvestmentDuration(
                            currentVal,
                            goal.targetAmount,
                            goal.monthlyContribution || 1000000,
                            goal.annualReturnRate || 10
                          );
                          return (
                            <span className="bg-indigo-600 text-white font-mono px-2 py-0.5 rounded text-[10px]">
                              {dur.months === 0
                                ? 'Selesai'
                                : dur.months >= 999
                                ? 'Membutuhkan Top-up'
                                : dur.years > 0
                                ? `~${dur.years} Thn ${dur.remMonths} Bln`
                                : `~${dur.months} Bulan`}
                            </span>
                          );
                        })()}
                      </div>

                      {(() => {
                        const dur = calculateInvestmentDuration(
                          currentVal,
                          goal.targetAmount,
                          goal.monthlyContribution || 1000000,
                          goal.annualReturnRate || 10
                        );
                        return (
                          <div className="text-[11px] font-medium text-slate-700 dark:text-slate-300 space-y-0.5">
                            <div className="flex justify-between">
                              <span className="text-[10px] text-slate-500">Target Tercapai:</span>
                              <strong className="text-indigo-700 dark:text-indigo-300 font-bold">{dur.targetReachedDateStr}</strong>
                            </div>
                            <div className="flex justify-between text-[10px] text-slate-500 pt-0.5 border-t border-indigo-100 dark:border-indigo-900/60">
                              <span>Top-up: {formatterIDR.format(goal.monthlyContribution || 1000000)}/bln</span>
                              <span>Return: {goal.annualReturnRate || 10}%/thn</span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>

                {/* Progress Bar & Amounts */}
                <div className="space-y-2">
                  <div className="flex justify-between items-end">
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold uppercase block">Terkumpul</span>
                      <span className="font-mono font-black text-sm text-slate-800 dark:text-slate-100">
                        {formatterIDR.format(currentVal)}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 font-bold uppercase block">Target</span>
                      <span className="font-mono font-bold text-xs text-slate-600 dark:text-slate-300">
                        {formatterIDR.format(goal.targetAmount)}
                      </span>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full bg-slate-100 dark:bg-slate-700 h-3 rounded-full overflow-hidden p-0.5 border border-slate-200/60 dark:border-slate-600/60">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isCompleted
                          ? 'bg-emerald-500'
                          : progressPct >= 75
                          ? 'bg-blue-500'
                          : progressPct >= 40
                          ? 'bg-indigo-500'
                          : 'bg-amber-500'
                      }`}
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>

                  <div className="flex justify-between items-center text-[10px] font-bold text-slate-500 dark:text-slate-400">
                    <span className="font-mono text-blue-600 dark:text-blue-400">{progressPct.toFixed(1)}% Tercapai</span>
                    {isCompleted ? (
                      <span className="text-emerald-600 font-extrabold">Selesai!</span>
                    ) : (
                      <span>Sisa: <strong className="font-mono text-slate-700 dark:text-slate-200">{formatterIDR.format(remainingVal)}</strong></span>
                    )}
                  </div>
                </div>

                {/* Target Date Detail & Actions */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between">
                  <div className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5 text-slate-400" />
                    <span>Jatuh Tempo: <strong className="text-slate-700 dark:text-slate-300 font-bold">{goal.targetDate}</strong></span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setTopUpGoal(goal);
                        setTopUpAmount(0);
                      }}
                      className="px-2.5 py-1 bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 rounded-lg text-[10px] font-extrabold transition cursor-pointer flex items-center gap-1"
                      title="Tambah Modal Saldo Target"
                    >
                      <Plus className="h-3 w-3" /> Top Up
                    </button>
                    <button
                      onClick={() => handleOpenEditModal(goal)}
                      className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition cursor-pointer"
                      title="Edit Target"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteGoal(goal.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition cursor-pointer"
                      title="Hapus Target"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      )}

      {/* Modal 1: Add / Edit Goal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-extrabold text-sm sm:text-base text-slate-800 dark:text-slate-100 uppercase tracking-wider flex items-center gap-2">
                <Target className="h-5 w-5 text-blue-600" />
                {editingGoal ? 'Edit Target Investasi' : 'Tambah Target Investasi Baru'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveGoal} className="space-y-4 text-xs">
              
              {/* Title */}
              <div className="space-y-1">
                <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                  Nama Target Investasi
                </label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Contoh: Beli Emas 100 Gram, Dana Pensiun, DP Rumah"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              {/* Target Amount & Current Amount */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                    Target Dana (Rp)
                  </label>
                  <FormattedNumberInput
                    value={formTargetAmount}
                    onChange={(val) => setFormTargetAmount(typeof val === 'number' ? val : parseFloat(val) || 0)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-xs font-mono font-bold text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                    Saldo Terkumpul Saat Ini (Rp)
                  </label>
                  <FormattedNumberInput
                    value={formCurrentAmount}
                    onChange={(val) => setFormCurrentAmount(typeof val === 'number' ? val : parseFloat(val) || 0)}
                    disabled={!!formLinkedAssetId}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-xs font-mono font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                  />
                </div>
              </div>

              {/* Target Date & Category */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                    Tanggal Jatuh Tempo (Target Date)
                  </label>
                  <input
                    type="date"
                    value={formTargetDate}
                    onChange={(e) => setFormTargetDate(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                    Kategori Instrumen
                  </label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="Logam Mulia (Emas)">Logam Mulia (Emas)</option>
                    <option value="Saham">Saham</option>
                    <option value="Reksadana">Reksadana</option>
                    <option value="Cryptocurrency">Cryptocurrency</option>
                    <option value="Bisnis Riil">Bisnis Riil / Surat Berharga</option>
                    <option value="Properti / Lahan">Properti / Lahan</option>
                    <option value="Lainnya">Lainnya</option>
                  </select>
                </div>
              </div>

              {/* Monthly Top-up Contribution & Annual Return Rate (For Duration Prediction) */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex items-center gap-1.5 text-[10px] font-extrabold text-indigo-700 dark:text-indigo-400 uppercase tracking-wider">
                  <Clock className="h-3.5 w-3.5 text-indigo-600" />
                  <span>Parameter Prediksi Durasi Waktu</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                      Kontribusi Top-up Bulanan (Rp)
                    </label>
                    <FormattedNumberInput
                      value={formMonthlyContribution}
                      onChange={(val) => setFormMonthlyContribution(typeof val === 'number' ? val : parseFloat(val) || 0)}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                      Asumsi Return Investasi (% / Tahun)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        max="100"
                        value={formAnnualReturnRate}
                        onChange={(e) => setFormAnnualReturnRate(parseFloat(e.target.value) || 0)}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 pr-8"
                      />
                      <span className="absolute right-3 top-2 text-xs font-bold text-slate-400">%</span>
                    </div>
                  </div>
                </div>

                {/* Live Prediction Preview */}
                <div className="p-2 bg-indigo-50/80 dark:bg-indigo-950/60 rounded-lg text-[10px] text-indigo-900 dark:text-indigo-200 font-medium flex items-center justify-between">
                  <span>Hasil Estimasi Durasi:</span>
                  {(() => {
                    const dur = calculateInvestmentDuration(
                      formCurrentAmount,
                      formTargetAmount,
                      formMonthlyContribution,
                      formAnnualReturnRate
                    );
                    return (
                      <span className="font-bold font-mono">
                        {dur.months === 0
                          ? 'Sudah Tercapai'
                          : dur.months >= 999
                          ? 'Tidak dapat dicapai'
                          : `${dur.years > 0 ? `${dur.years} Thn ${dur.remMonths} Bln` : `${dur.months} Bulan`} (${dur.targetReachedDateStr})`}
                      </span>
                    );
                  })()}
                </div>
              </div>

              {/* Linked Asset */}
              {investments.length > 0 && (
                <div className="space-y-1">
                  <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                    Hubungkan dengan Aset Portofolio (Opsional)
                  </label>
                  <select
                    value={formLinkedAssetId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setFormLinkedAssetId(id);
                      if (id) {
                        const linked = investments.find((i) => i.id === id);
                        if (linked) setFormCurrentAmount(linked.balance);
                      }
                    }}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-- Tanpa Hubungkan Aset Spesifik --</option>
                    {investments.map((inv) => (
                      <option key={inv.id} value={inv.id}>
                        {inv.name} ({inv.category}) — {formatterIDR.format(inv.balance)}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-slate-400">
                    Jika dihubungkan, saldo terkumpul target akan disinkronkan otomatis dengan saldo valuasinya.
                  </p>
                </div>
              )}

              {/* Notes */}
              <div className="space-y-1">
                <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                  Catatan Tambahan / Strategi Target
                </label>
                <textarea
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Misal: Alokasikan 20% gaji bulanan ke reksadana saham setiap tanggal 25"
                  rows={2}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Submit Buttons */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-extrabold bg-blue-600 hover:bg-blue-700 text-white shadow-sm cursor-pointer"
                >
                  {editingGoal ? 'Simpan Perubahan' : 'Buat Target'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Quick Top-Up Goal Modal */}
      {topUpGoal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-sm w-full p-5 border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-extrabold text-xs sm:text-sm text-slate-800 dark:text-slate-100 uppercase tracking-wider flex items-center gap-1.5">
                <Plus className="h-4 w-4 text-emerald-600" />
                Tambah Modal Target: {topUpGoal.title}
              </h3>
              <button
                onClick={() => setTopUpGoal(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleExecuteTopUp} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                  Nominal Tambahan Modal (Rp)
                </label>
                <FormattedNumberInput
                  value={topUpAmount}
                  onChange={(val) => setTopUpAmount(typeof val === 'number' ? val : parseFloat(val) || 0)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 font-mono font-bold text-emerald-600 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="p-3 bg-emerald-50/70 dark:bg-emerald-950/40 rounded-xl space-y-1 font-mono text-[11px]">
                <div className="flex justify-between text-slate-600 dark:text-slate-300">
                  <span>Saldo Saat Ini:</span>
                  <span>{formatterIDR.format(topUpGoal.currentAmount)}</span>
                </div>
                <div className="flex justify-between font-bold text-emerald-700 dark:text-emerald-300 pt-1 border-t border-emerald-200/60">
                  <span>Proyeksi Saldo Baru:</span>
                  <span>{formatterIDR.format(topUpGoal.currentAmount + topUpAmount)}</span>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setTopUpGoal(null)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg text-xs font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm cursor-pointer"
                >
                  Simpan Akumulasi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
