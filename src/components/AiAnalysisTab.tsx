import React, { useState } from 'react';
import { Transaction, CategoryBudget, Debt, EmergencyFundConfig, AIAnalysisResult, AIMonthlyComparisonResult, AICategoryConsolidationResult, CategoryConsolidationGroup, InvestmentAsset, Account } from '../types';
import { Sparkles, Loader2, ArrowRightLeft, ShieldCheck, AlertTriangle, ArrowUpRight, ArrowDownRight, CheckCircle2, ChevronRight, HelpCircle, TrendingUp, TrendingDown, Coins, Percent, PiggyBank, Wallet, Calendar, Scale, Flame, Snowflake, Zap, Award, ListOrdered, Layers, ArrowRight, GitMerge } from 'lucide-react';
import { CategoryNode, DEFAULT_CATEGORY_HIERARCHY, flattenCategoryHierarchy } from '../categoryHierarchy';
import { isOperatingExpense } from '../utils/accountingEngine';
import { showToast } from '../utils/toast';
import { FormattedNumberInput } from './FormattedNumberInput';
import { WhatIfSavingsSimulator } from './WhatIfSavingsSimulator';
import { DebtPriorityScheduler } from './DebtPriorityScheduler';
import { OverlimitTrendChart } from './CreditOverlimitTrendAnalyzer';

interface AiAnalysisTabProps {
  transactions: Transaction[];
  budgets: CategoryBudget[];
  accounts?: Account[];
  debts: Debt[];
  emergencyConfig: EmergencyFundConfig;
  emergencyBalance: number;
  investments: InvestmentAsset[];
  masterCategories?: CategoryNode[];
  onApplyBudgetSuggestion: (category: string, recommendedLimit: number) => void;
  onConsolidateCategories?: (sourceCategories: string[], targetCategory: string) => void;
}

export interface DebtPayoffItem {
  id: string;
  name: string;
  balance: number;
  interestRate: number;
  minPayment: number;
  purpose: string;
  payoffMonth: number;
  payoffDateStr: string;
  totalInterestForDebt: number;
  rank: number;
}

export interface DebtPayoffSimulationResult {
  strategy: 'snowball' | 'avalanche';
  totalMonths: number;
  years: number;
  remMonths: number;
  totalInterestPaid: number;
  totalPaid: number;
  debtSequence: DebtPayoffItem[];
}

export function runDebtPayoffSimulation(
  debtsList: Debt[],
  extraMonthly: number,
  strategy: 'snowball' | 'avalanche'
): DebtPayoffSimulationResult {
  const activeDebts = debtsList
    .filter((d) => d.balance > 0)
    .map((d) => ({
      id: d.id,
      name: d.name,
      balance: d.balance,
      originalBalance: d.balance,
      interestRate: d.interestRate || 0,
      minPayment: d.minPayment || 0,
      purpose: d.purpose || 'consumptive',
      payoffMonth: 0,
      totalInterestForDebt: 0,
    }));

  if (activeDebts.length === 0) {
    return {
      strategy,
      totalMonths: 0,
      years: 0,
      remMonths: 0,
      totalInterestPaid: 0,
      totalPaid: 0,
      debtSequence: [],
    };
  }

  // Sort based on strategy
  if (strategy === 'snowball') {
    // Smallest balance first
    activeDebts.sort((a, b) => a.balance - b.balance);
  } else {
    // Highest interest rate first
    activeDebts.sort((a, b) => b.interestRate - a.interestRate);
  }

  const simDebts = activeDebts.map((d) => ({ ...d }));
  let month = 0;
  let totalInterestPaid = 0;
  let totalPaid = 0;
  const maxMonths = 360; // 30 years cap

  while (simDebts.some((d) => d.balance > 0) && month < maxMonths) {
    month++;

    // 1. Accrue interest for this month
    for (const debt of simDebts) {
      if (debt.balance > 0) {
        const monthlyRate = (debt.interestRate || 0) / 100 / 12;
        const interest = debt.balance * monthlyRate;
        debt.balance += interest;
        debt.totalInterestForDebt += interest;
        totalInterestPaid += interest;
      }
    }

    // 2. Minimum payments across active debts
    for (const debt of simDebts) {
      if (debt.balance > 0) {
        const pay = Math.min(debt.balance, debt.minPayment);
        debt.balance -= pay;
        totalPaid += pay;
        if (debt.balance <= 0 && debt.payoffMonth === 0) {
          debt.payoffMonth = month;
        }
      }
    }

    // 3. Extra allocation applied to top priority active debt
    let extraRemaining = extraMonthly;
    for (const debt of simDebts) {
      if (debt.balance > 0 && extraRemaining > 0) {
        const extraPay = Math.min(debt.balance, extraRemaining);
        debt.balance -= extraPay;
        totalPaid += extraPay;
        extraRemaining -= extraPay;
        if (debt.balance <= 0 && debt.payoffMonth === 0) {
          debt.payoffMonth = month;
        }
        break; // apply extra to top priority first
      }
    }
  }

  const years = Math.floor(month / 12);
  const remMonths = month % 12;

  const debtSequence = simDebts.map((d, idx) => {
    const targetDate = new Date();
    targetDate.setMonth(targetDate.getMonth() + (d.payoffMonth || month));
    const payoffDateStr = targetDate.toLocaleDateString('id-ID', {
      month: 'long',
      year: 'numeric',
    });

    return {
      id: d.id,
      name: d.name,
      balance: d.originalBalance,
      interestRate: d.interestRate,
      minPayment: d.minPayment,
      purpose: d.purpose,
      payoffMonth: d.payoffMonth || month,
      payoffDateStr,
      totalInterestForDebt: Math.round(d.totalInterestForDebt),
      rank: idx + 1,
    };
  });

  return {
    strategy,
    totalMonths: month,
    years,
    remMonths,
    totalInterestPaid: Math.round(totalInterestPaid),
    totalPaid: Math.round(totalPaid),
    debtSequence,
  };
}

export const AiAnalysisTab: React.FC<AiAnalysisTabProps> = ({
  transactions,
  budgets,
  accounts = [],
  debts,
  emergencyConfig,
  emergencyBalance,
  investments = [],
  masterCategories = [],
  onApplyBudgetSuggestion,
  onConsolidateCategories,
}) => {
  const formatterIDR = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  });

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AIAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // --- ANOMALY DETECTION STATES ---
  const [anomalyLoading, setAnomalyLoading] = useState(false);
  const [anomalyResult, setAnomalyResult] = useState<{
    status: string;
    analysisPeriod?: string;
    unusualTransactionsCount?: number;
    anomalies: Array<{
      category: string;
      currentMonthAmount: number;
      previousAverageAmount: number;
      increasePercentage: number;
      severity: 'high' | 'medium' | 'low';
      explanation: string;
      recommendation: string;
    }>;
    overallAssessment: string;
    aiAdvice: string;
  } | null>(null);
  const [anomalyError, setAnomalyError] = useState<string | null>(null);

  // --- MONTHLY COMPARISON STATES ---
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareResult, setCompareResult] = useState<AIMonthlyComparisonResult | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);

  // --- 3-MONTH TREND & SAVINGS RECOMMENDATIONS STATES ---
  const [trendLoading, setTrendLoading] = useState(false);
  const [trendResult, setTrendResult] = useState<{
    currentMonthName: string;
    threeMonthsRangeName: string;
    totalCurrentExpense: number;
    totalThreeMonthAvg: number;
    totalDifference: number;
    percentageVsAvg: number;
    trendStatus: 'Meningkat' | 'Penghematan' | 'Stabil';
    overallTrendSummary: string;
    categoryAnalyses: Array<{
      category: string;
      currentMonthAmount: number;
      threeMonthAvgAmount: number;
      budgetLimit: number;
      budgetDiff: number;
      percentageVsAvg: number;
      status: 'Membengkak' | 'Hemat' | 'Sesuai Target';
      savingsRecommendation: string;
    }>;
    topSavingsRecommendations: Array<{
      title: string;
      category: string;
      potentialSavingsAmount: number;
      actionPlan: string;
    }>;
    generalTips: string[];
  } | null>(null);
  const [trendError, setTrendError] = useState<string | null>(null);

  // --- CATEGORY CONSOLIDATION SCANNER STATES ---
  const [consolidationLoading, setConsolidationLoading] = useState(false);
  const [consolidationResult, setConsolidationResult] = useState<AICategoryConsolidationResult | null>(null);
  const [consolidationError, setConsolidationError] = useState<string | null>(null);
  const [appliedGroupIds, setAppliedGroupIds] = useState<string[]>([]);

  const masterCategoryNames = React.useMemo(() => {
    const sourceHierarchy =
      masterCategories && masterCategories.length > 0 ? masterCategories : DEFAULT_CATEGORY_HIERARCHY;
    const flattened = flattenCategoryHierarchy(sourceHierarchy);
    return Array.from(
      new Set(
        flattened
          .filter((node) => node.type === 'item')
          .map((node) => node.name.trim())
          .filter(Boolean)
      )
    );
  }, [masterCategories]);

  const categoryFragmentationMetrics = React.useMemo(() => {
    const scannableTxs = transactions.filter(
      (t) => t.category !== 'Mutasi Masuk' && t.category !== 'Mutasi Keluar'
    );
    const masterLowerSet = new Set(masterCategoryNames.map((n) => n.toLowerCase()));
    const catStats = new Map<string, { name: string; count: number; total: number; isMaster: boolean }>();

    for (const tx of scannableTxs) {
      const catName = String(tx.category || 'Lainnya').trim();
      const key = catName.toLowerCase();
      const existing = catStats.get(key) || {
        name: catName,
        count: 0,
        total: 0,
        isMaster: masterLowerSet.has(key),
      };
      existing.count += 1;
      existing.total += Math.abs(Number(tx.amount) || 0);
      catStats.set(key, existing);
    }

    const entries = Array.from(catStats.values());
    const nonMasterCategories = entries.filter((e) => !e.isMaster);
    const lowFrequencyCategories = entries.filter((e) => !e.isMaster && e.count <= 2);

    return {
      totalScannedTx: scannableTxs.length,
      uniqueCategoriesCount: entries.length,
      nonMasterCount: nonMasterCategories.length,
      lowFrequencyCount: lowFrequencyCategories.length,
      nonMasterSamples: nonMasterCategories.slice(0, 6).map((c) => c.name),
    };
  }, [transactions, masterCategoryNames]);

  const handleRunCategoryConsolidation = async () => {
    setConsolidationLoading(true);
    setConsolidationError(null);
    setAppliedGroupIds([]);
    try {
      const response = await fetch('/api/analyze-category-consolidation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactions,
          masterCategoryNames,
          budgets,
        }),
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Gagal memindai fragmentasi kategori transaksi.');
      }
      const data: AICategoryConsolidationResult = await response.json();
      setConsolidationResult(data);
    } catch (err: any) {
      console.error(err);
      setConsolidationError(err.message || 'Gagal tersambung ke layanan konsolidasi kategori AI.');
    } finally {
      setConsolidationLoading(false);
    }
  };

  const handleApplyConsolidationGroup = (group: CategoryConsolidationGroup) => {
    if (!onConsolidateCategories) return;
    if (appliedGroupIds.includes(group.id)) return;
    const sources = group.sourceCategories.map((s) => s.name).filter(Boolean);
    if (sources.length === 0) return;
    onConsolidateCategories(sources, group.targetMasterCategory);
    setAppliedGroupIds((prev) => (prev.includes(group.id) ? prev : [...prev, group.id]));
  };

  const handleApplyAllConsolidations = () => {
    if (!onConsolidateCategories || !consolidationResult) return;
    const pendingGroups = consolidationResult.consolidationGroups.filter(
      (g) => !appliedGroupIds.includes(g.id)
    );
    if (pendingGroups.length === 0) {
      showToast({
        type: 'info',
        title: 'Semua Rekomendasi Sudah Diterapkan',
        message: 'Tidak ada kelompok kategori tersisa untuk digabungkan.',
      });
      return;
    }

    pendingGroups.forEach((grp) => {
      const sources = grp.sourceCategories.map((s) => s.name).filter(Boolean);
      if (sources.length > 0) {
        onConsolidateCategories(sources, grp.targetMasterCategory);
      }
    });

    setAppliedGroupIds((prev) => [
      ...prev,
      ...pendingGroups.map((g) => g.id).filter((id) => !prev.includes(id)),
    ]);
  };

  const handleRun3MonthTrend = async () => {
    setTrendLoading(true);
    setTrendError(null);
    try {
      const response = await fetch('/api/analyze-3month-trend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions, budgets }),
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Gagal menganalisis tren pengeluaran 3 bulanan.');
      }
      const data = await response.json();
      setTrendResult(data);
    } catch (err: any) {
      console.error(err);
      setTrendError(err.message || 'Gagal tersambung ke layanan analisis tren AI Gemini.');
    } finally {
      setTrendLoading(false);
    }
  };

  const handleRunMonthlyComparison = async () => {
    setCompareLoading(true);
    setCompareError(null);
    try {
      const response = await fetch('/api/compare-monthly-expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions, budgets }),
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Gagal melakukan perbandingan pengeluaran bulanan.');
      }
      const data = await response.json();
      setCompareResult(data);
    } catch (err: any) {
      console.error(err);
      setCompareError(err.message || 'Gagal tersambung ke layanan komparasi bulanan AI Gemini.');
    } finally {
      setCompareLoading(false);
    }
  };

  const handleRunAnomalyDetection = async () => {
    setAnomalyLoading(true);
    setAnomalyError(null);
    try {
      const response = await fetch('/api/detect-anomalies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions, budgets }),
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Gagal mendeteksi anomali pengeluaran.');
      }
      const data = await response.json();
      setAnomalyResult(data);
    } catch (err: any) {
      console.error(err);
      setAnomalyError(err.message || 'Gagal tersambung ke layanan deteksi anomali AI.');
    } finally {
      setAnomalyLoading(false);
    }
  };

  // --- AUTOMATIC WEEKLY & MONTHLY EXPENSE AUDIT WITH SPIKE NOTIFICATIONS ---
  const weeklyMonthlyAudit = React.useMemo(() => {
    const expenseTxs = transactions.filter((t) => isOperatingExpense(t));
    if (expenseTxs.length === 0) {
      return {
        currentWeekTotal: 0,
        prevWeekAvgTotal: 0,
        currentMonthTotal: 0,
        prevMonthAvgTotal: 0,
        categoryAudit: [],
        spikes: [],
      };
    }

    const dates = expenseTxs.map(t => new Date(t.date).getTime()).sort((a, b) => b - a);
    const latestMs = dates[0] || Date.now();
    const ONE_DAY = 24 * 60 * 60 * 1000;

    const currentWeekTxs = expenseTxs.filter(t => {
      const diff = latestMs - new Date(t.date).getTime();
      return diff >= 0 && diff < 7 * ONE_DAY;
    });

    const prev3WeeksTxs = expenseTxs.filter(t => {
      const diff = latestMs - new Date(t.date).getTime();
      return diff >= 7 * ONE_DAY && diff < 28 * ONE_DAY;
    });

    const currentWeekTotal = currentWeekTxs.reduce((s, t) => s + Math.abs(t.amount), 0);
    const prev3WeeksTotal = prev3WeeksTxs.reduce((s, t) => s + Math.abs(t.amount), 0);
    const prevWeekAvgTotal = Math.round(prev3WeeksTotal / 3);

    const currentMonthTxs = expenseTxs.filter(t => {
      const diff = latestMs - new Date(t.date).getTime();
      return diff >= 0 && diff < 30 * ONE_DAY;
    });

    const prev2MonthsTxs = expenseTxs.filter(t => {
      const diff = latestMs - new Date(t.date).getTime();
      return diff >= 30 * ONE_DAY && diff < 90 * ONE_DAY;
    });

    const currentMonthTotal = currentMonthTxs.reduce((s, t) => s + Math.abs(t.amount), 0);
    const prev2MonthsTotal = prev2MonthsTxs.reduce((s, t) => s + Math.abs(t.amount), 0);
    const prevMonthAvgTotal = Math.round(prev2MonthsTotal / 2);

    const categories = Array.from(new Set(expenseTxs.map(t => String(t.category))));

    const categoryAudit = categories.map(cat => {
      const catLower = String(cat).toLowerCase();
      const curWeekCatAmount = currentWeekTxs
        .filter(t => String(t.category).toLowerCase() === catLower)
        .reduce((s, t) => s + Math.abs(t.amount), 0);

      const prev3WeekCatAmount = prev3WeeksTxs
        .filter(t => String(t.category).toLowerCase() === catLower)
        .reduce((s, t) => s + Math.abs(t.amount), 0);

      const prevWeekCatAvg = Math.round(prev3WeekCatAmount / 3);

      const curMonthCatAmount = currentMonthTxs
        .filter(t => String(t.category).toLowerCase() === catLower)
        .reduce((s, t) => s + Math.abs(t.amount), 0);

      const prev2MonthCatAmount = prev2MonthsTxs
        .filter(t => String(t.category).toLowerCase() === catLower)
        .reduce((s, t) => s + Math.abs(t.amount), 0);

      const prevMonthCatAvg = Math.round(prev2MonthCatAmount / 2);

      const spikeRatio = prevWeekCatAvg > 0 ? (curWeekCatAmount / prevWeekCatAvg) : (curWeekCatAmount > 100000 ? 2 : 1);
      const spikePercentage = Math.round((spikeRatio - 1) * 100);
      const isSpike = (spikeRatio >= 1.30 && curWeekCatAmount >= 100000) || (prevWeekCatAvg === 0 && curWeekCatAmount >= 250000);

      return {
        category: cat,
        curWeekCatAmount,
        prevWeekCatAvg,
        curMonthCatAmount,
        prevMonthCatAvg,
        spikeRatio,
        spikePercentage,
        isSpike,
        diffWeekAmount: curWeekCatAmount - prevWeekCatAvg,
      };
    }).filter(c => c.curWeekCatAmount > 0 || c.prevWeekCatAvg > 0);

    const spikes = categoryAudit.filter(c => c.isSpike);

    return {
      currentWeekTotal,
      prevWeekAvgTotal,
      currentMonthTotal,
      prevMonthAvgTotal,
      categoryAudit,
      spikes,
    };
  }, [transactions]);

  // --- DEBT STRUCTURE ANALYSIS & PAYOFF STRATEGY STATES ---
  const [extraDebtPayoff, setExtraDebtPayoff] = useState<number>(500000);
  const [selectedDebtStrategy, setSelectedDebtStrategy] = useState<'avalanche' | 'snowball'>('avalanche');

  const debtAnalysis = React.useMemo(() => {
    const activeDebts = debts.filter((d) => d.balance > 0);
    const totalDebtBalance = activeDebts.reduce((sum, d) => sum + d.balance, 0);
    const totalMinPayment = activeDebts.reduce((sum, d) => sum + (d.minPayment || 0), 0);

    const weightedInterestSum = activeDebts.reduce((sum, d) => sum + (d.balance * (d.interestRate || 0)), 0);
    const avgInterestRate = totalDebtBalance > 0 ? (weightedInterestSum / totalDebtBalance) : 0;

    const highInterestDebts = activeDebts.filter((d) => (d.interestRate || 0) >= 15);
    const consumptiveDebts = activeDebts.filter((d) => d.purpose === 'consumptive');
    const productiveDebts = activeDebts.filter((d) => d.purpose === 'productive');

    const avalancheSim = runDebtPayoffSimulation(activeDebts, extraDebtPayoff, 'avalanche');
    const snowballSim = runDebtPayoffSimulation(activeDebts, extraDebtPayoff, 'snowball');

    const interestSavedByAvalanche = Math.max(0, snowballSim.totalInterestPaid - avalancheSim.totalInterestPaid);
    const monthsSavedByAvalanche = Math.max(0, snowballSim.totalMonths - avalancheSim.totalMonths);

    const recommendedStrategy: 'avalanche' | 'snowball' = 
      interestSavedByAvalanche > 100000 ? 'avalanche' : 'snowball';

    return {
      activeDebts,
      totalDebtBalance,
      totalMinPayment,
      avgInterestRate,
      highInterestDebts,
      consumptiveDebts,
      productiveDebts,
      avalancheSim,
      snowballSim,
      interestSavedByAvalanche,
      monthsSavedByAvalanche,
      recommendedStrategy,
    };
  }, [debts, extraDebtPayoff]);

  // --- KALKULATOR ZAKAT STATES & CALCULATIONS ---
  const [zakatTab, setZakatTab] = useState<'mal' | 'profesi'>('mal');
  const [goldPrice, setGoldPrice] = useState<number>(1100000); // Harga emas per gram (default: Rp 1.100.000)
  const [ricePrice, setRicePrice] = useState<number>(13000); // Harga beras per kg (default: Rp 13.000)
  
  const [customHarta, setCustomHarta] = useState<number | null>(null);
  const [customIncome, setCustomIncome] = useState<number | null>(null);

  // Hitung total saldo riil dari akun Kas & Bank (exclude credit card & paylater)
  const totalCashBank = React.useMemo(() => {
    return accounts
      .filter(a => a.type !== 'credit-card' && a.type !== 'paylater')
      .reduce((sum, a) => sum + (a.currentBalance || 0), 0);
  }, [accounts]);

  // Hitung total nilai investasi riil
  const totalInvestmentsVal = React.useMemo(() => {
    return investments.reduce((sum, i) => sum + (i.balance || 0), 0);
  }, [investments]);

  const totalEmergencyVal = emergencyBalance || 0;

  // Total Harta untuk Zakat Mal (Kas + Investasi + Dana Darurat)
  const currentHarta = customHarta !== null ? customHarta : (totalCashBank + totalInvestmentsVal + totalEmergencyVal);

  // Pendapatan bulanan riil dari transaksi masuk (misal di simulasi bulan Juli 2026 atau terbaru)
  const monthlyIncomeVal = React.useMemo(() => {
    const july2026Txs = transactions.filter(tx => tx.type === 'income' && tx.date.startsWith('2026-07'));
    if (july2026Txs.length > 0) {
      return july2026Txs.reduce((sum, tx) => sum + tx.amount, 0);
    }
    // Jika tidak ada data Juli, cari pendapatan bulan apa saja yang tercatat
    const allIncomes = transactions.filter(tx => tx.type === 'income');
    if (allIncomes.length > 0) {
      return allIncomes.reduce((sum, tx) => sum + tx.amount, 0);
    }
    return 0;
  }, [transactions]);

  const defaultMonthlyIncome = monthlyIncomeVal > 0 ? monthlyIncomeVal : 7500000;
  const currentIncome = customIncome !== null ? customIncome : defaultMonthlyIncome;

  // 1. Zakat Mal (Nisab setara 85 gram emas)
  const nisabMal = 85 * goldPrice;
  const isMalEligible = currentHarta >= nisabMal;
  const zakatMalAmount = isMalEligible ? Math.round(currentHarta * 0.025) : 0;

  // 2. Zakat Profesi (Nisab setara 653 kg beras per tahun, atau 54.4 kg beras per bulan)
  const monthlyNisabProfesi = Math.round((653 * ricePrice) / 12);
  const isProfesiEligible = currentIncome >= monthlyNisabProfesi;
  const zakatProfesiAmount = isProfesiEligible ? Math.round(currentIncome * 0.025) : 0;

  const handleRunAnalysis = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transactions,
          budgets,
          debts,
          emergencyFund: {
            config: emergencyConfig,
            currentBalance: emergencyBalance,
          },
          investments,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Terjadi kesalahan saat memproses data keuangan.');
      }

      const data = await response.json();
      setResult(data);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Gagal tersambung dengan asisten AI Gemini.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Introduction Card */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 text-white p-6 rounded-2xl shadow-lg relative overflow-hidden">
        {/* Decorative ambient background elements */}
        <div className="absolute right-0 top-0 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl" />
        <div className="absolute left-1/3 bottom-0 w-60 h-60 bg-blue-500/10 rounded-full blur-2xl" />

        <div className="relative space-y-4 max-w-3xl">
          <div className="inline-flex items-center gap-2 bg-blue-500/20 text-blue-300 px-3 py-1 rounded-full text-xs font-semibold">
            <Sparkles className="h-3.5 w-3.5 animate-pulse text-blue-400" />
            Asisten Analis Keuangan AI Gemini
          </div>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight">
            Analisis Pengeluaran Otomatis & Rekomendasi Anggaran Cerdas
          </h2>
          <p className="text-xs sm:text-sm text-blue-200 leading-relaxed">
            Asisten AI kami akan membaca seluruh log transaksi bulanan Anda, membandingkan pengeluaran riil terhadap batas anggaran kategori, menilai rasio hutang serta target dana darurat, dan merancang strategi disiplin finansial terbaik yang dirancang khusus untuk kondisi keuangan Anda.
          </p>

          <div className="pt-2 flex flex-wrap gap-3">
            <button
              onClick={handleRunAnalysis}
              disabled={loading}
              className="flex items-center gap-2 bg-white hover:bg-blue-50 text-slate-950 disabled:bg-slate-800 disabled:text-slate-500 font-bold px-5 py-2.5 rounded-xl text-xs uppercase tracking-wider transition cursor-pointer shadow-md disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                  Menganalisis Data Anda...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 text-blue-600 animate-bounce" />
                  Mulai Analisis AI Sekarang
                </>
              )}
            </button>

            <button
              onClick={handleRunMonthlyComparison}
              disabled={compareLoading}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white disabled:bg-slate-800 disabled:text-slate-500 font-bold px-5 py-2.5 rounded-xl text-xs uppercase tracking-wider transition cursor-pointer shadow-md disabled:cursor-not-allowed"
            >
              {compareLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-white" />
                  Membandingkan Bulan Ini vs Lalu...
                </>
              ) : (
                <>
                  <Calendar className="h-4 w-4 text-indigo-200" />
                  Komparasi Pengeluaran Bulanan
                </>
              )}
            </button>

            <button
              onClick={handleRunAnomalyDetection}
              disabled={anomalyLoading}
              className="flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white disabled:bg-slate-800 disabled:text-slate-500 font-bold px-5 py-2.5 rounded-xl text-xs uppercase tracking-wider transition cursor-pointer shadow-md disabled:cursor-not-allowed"
            >
              {anomalyLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-white" />
                  Mendeteksi Anomali...
                </>
              ) : (
                <>
                  <AlertTriangle className="h-4 w-4 text-amber-200" />
                  Deteksi Anomali Pengeluaran
                </>
              )}
            </button>

            <button
              onClick={handleRun3MonthTrend}
              disabled={trendLoading}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white disabled:bg-slate-800 disabled:text-slate-500 font-bold px-5 py-2.5 rounded-xl text-xs uppercase tracking-wider transition cursor-pointer shadow-md disabled:cursor-not-allowed"
            >
              {trendLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-white" />
                  Menganalisis Tren 3 Bulan...
                </>
              ) : (
                <>
                  <TrendingUp className="h-4 w-4 text-emerald-200" />
                  Analisis Tren 3 Bulan & Hemat Anggaran
                </>
              )}
            </button>

            <button
              onClick={() => {
                handleRunCategoryConsolidation();
                document.getElementById('category-consolidation-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              disabled={consolidationLoading}
              className="flex items-center gap-2 bg-amber-400 hover:bg-amber-300 text-slate-950 disabled:bg-slate-800 disabled:text-slate-500 font-extrabold px-5 py-2.5 rounded-xl text-xs uppercase tracking-wider transition cursor-pointer shadow-md disabled:cursor-not-allowed"
            >
              {consolidationLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-slate-950" />
                  Memindai Kategori...
                </>
              ) : (
                <>
                  <GitMerge className="h-4 w-4 text-slate-900" />
                  Pindai & Gabung Kategori
                </>
              )}
            </button>
            
            {(result || anomalyResult || compareResult || trendResult || consolidationResult) && (
              <button
                onClick={() => {
                  setResult(null);
                  setAnomalyResult(null);
                  setCompareResult(null);
                  setTrendResult(null);
                  setConsolidationResult(null);
                  setAppliedGroupIds([]);
                }}
                className="bg-slate-800/40 hover:bg-slate-800/60 text-slate-200 text-xs px-4 py-2.5 rounded-xl border border-slate-700/50 transition cursor-pointer"
              >
                Reset Hasil
              </button>
            )}
          </div>
        </div>
      </div>

      {/* PEMINDAI EFISIENSI & REKOMENDASI PENGGABUNGAN KATEGORI MASTER */}
      <div
        id="category-consolidation-section"
        className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-md space-y-5"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-start gap-3">
            <div className="p-3 bg-gradient-to-tr from-amber-500 to-orange-500 text-white rounded-xl shadow-sm shrink-0">
              <GitMerge className="h-6 w-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-extrabold text-slate-800 dark:text-slate-100 text-base">
                  Pemindai Efisiensi & Penggabungan Kategori Master
                </h3>
                <span className="px-2.5 py-0.5 bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-200 text-[10px] font-black rounded-full uppercase">
                  AI Category Optimizer
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-1 leading-relaxed">
                Memindai seluruh transaksi untuk mendeteksi kategori yang terlalu spesifik (seperti merek kopi, ojol, e-commerce satuan) dan merekomendasikan penggabungan ke kategori master agar laporan & anggaran jauh lebih ringkas.
              </p>
            </div>
          </div>

          <button
            onClick={handleRunCategoryConsolidation}
            disabled={consolidationLoading || categoryFragmentationMetrics.totalScannedTx === 0}
            className="flex items-center justify-center gap-2 bg-slate-900 dark:bg-amber-500 hover:bg-slate-800 dark:hover:bg-amber-400 text-white dark:text-slate-950 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 font-extrabold px-4 py-2.5 rounded-xl text-xs uppercase tracking-wider transition cursor-pointer shadow-sm shrink-0 disabled:cursor-not-allowed"
          >
            {consolidationLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Memindai {categoryFragmentationMetrics.totalScannedTx} Transaksi...
              </>
            ) : (
              <>
                <Layers className="h-4 w-4" />
                {consolidationResult ? 'Pindai Ulang Kategori' : 'Pindai Kategori Transaksi'}
              </>
            )}
          </button>
        </div>

        {/* Live Metrics Preview from Current Transactions */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl">
            <span className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
              Total Transaksi Terpindai
            </span>
            <span className="text-lg font-black text-slate-800 dark:text-slate-100 font-mono mt-0.5 block">
              {categoryFragmentationMetrics.totalScannedTx} <span className="text-xs font-bold text-slate-400 font-sans">Transaksi</span>
            </span>
          </div>

          <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl">
            <span className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
              Kategori Unik Terdeteksi
            </span>
            <span className="text-lg font-black text-slate-800 dark:text-slate-100 font-mono mt-0.5 block">
              {categoryFragmentationMetrics.uniqueCategoriesCount} <span className="text-xs font-bold text-slate-400 font-sans">dari {masterCategoryNames.length} Master</span>
            </span>
          </div>

          <div className={`p-3.5 rounded-xl border ${
            categoryFragmentationMetrics.nonMasterCount > 0
              ? 'bg-amber-50/80 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/70'
              : 'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/70'
          }`}>
            <span className="text-[10px] font-extrabold text-slate-600 dark:text-slate-300 uppercase tracking-wider block">
              Kategori Spesifik di Luar Master
            </span>
            <div className="flex items-baseline justify-between mt-0.5">
              <span className={`text-lg font-black font-mono ${
                categoryFragmentationMetrics.nonMasterCount > 0
                  ? 'text-amber-700 dark:text-amber-300'
                  : 'text-emerald-700 dark:text-emerald-300'
              }`}>
                {categoryFragmentationMetrics.nonMasterCount} <span className="text-xs font-bold font-sans">Kategori</span>
              </span>
              {categoryFragmentationMetrics.nonMasterCount > 0 && (
                <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300">
                  Perlu Konsolidasi
                </span>
              )}
            </div>
          </div>
        </div>

        {categoryFragmentationMetrics.nonMasterSamples.length > 0 && !consolidationResult && !consolidationLoading && (
          <div className="p-3 bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-800/50 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-1.5 text-amber-900 dark:text-amber-200 font-medium">
              <span className="font-bold">Contoh kategori di luar master terdeteksi:</span>
              {categoryFragmentationMetrics.nonMasterSamples.map((sample) => (
                <span
                  key={sample}
                  className="px-2 py-0.5 bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-700 rounded-md text-[11px] font-bold text-amber-800 dark:text-amber-300"
                >
                  {sample}
                </span>
              ))}
            </div>
            <span className="text-[11px] text-amber-700 dark:text-amber-300 font-semibold shrink-0">
              Klik "Pindai Kategori Transaksi" untuk rekomendasi AI
            </span>
          </div>
        )}

        {consolidationError && (
          <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200 rounded-xl flex items-center gap-3 text-xs animate-fadeIn">
            <AlertTriangle className="h-5 w-5 text-rose-500 shrink-0" />
            <div>
              <p className="font-bold">Gagal Memindai Konsolidasi Kategori</p>
              <p className="text-rose-700 dark:text-rose-300">{consolidationError}</p>
            </div>
          </div>
        )}

        {consolidationLoading && (
          <div className="p-8 text-center flex flex-col items-center justify-center space-y-3 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-xl">
            <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
            <div className="space-y-1">
              <p className="font-bold text-slate-800 dark:text-slate-100 text-xs">
                Sedang Memindai Seluruh Transaksi & Mencocokkan Kategori Master...
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Menganalisis kesamaan makna deskripsi, frekuensi kategori mikro, dan struktur master kategori Anda.
              </p>
            </div>
          </div>
        )}

        {consolidationResult && !consolidationLoading && (
          <div className="space-y-4 animate-fadeIn">
            {/* Summary & Batch Merge Bar */}
            <div className="p-4 bg-gradient-to-r from-amber-50 to-orange-50/60 dark:from-amber-950/30 dark:to-orange-950/20 border border-amber-200/80 dark:border-amber-800/60 rounded-xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-black uppercase tracking-wider text-amber-900 dark:text-amber-200">
                  <span>Hasil Pemindaian AI</span>
                  <span className="px-2 py-0.5 bg-white/90 dark:bg-slate-800 text-amber-700 dark:text-amber-300 rounded-full border border-amber-200 dark:border-amber-700 font-mono">
                    {consolidationResult.totalUniqueCategories} Kategori &rarr; {consolidationResult.recommendedMasterCountAfterMerge} Master
                  </span>
                  {consolidationResult.efficiencyGainPercent > 0 && (
                    <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 rounded-full">
                      +{consolidationResult.efficiencyGainPercent}% Lebih Ringkas
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-700 dark:text-slate-300 font-medium leading-relaxed">
                  {consolidationResult.overallSummary}
                </p>
              </div>

              {consolidationResult.consolidationGroups.length > 0 && onConsolidateCategories && (
                <button
                  onClick={handleApplyAllConsolidations}
                  disabled={consolidationResult.consolidationGroups.every((g) => appliedGroupIds.includes(g.id))}
                  className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-100 dark:disabled:bg-emerald-950/50 text-white disabled:text-emerald-700 dark:disabled:text-emerald-300 font-extrabold px-4 py-2.5 rounded-xl text-xs uppercase tracking-wider transition cursor-pointer shrink-0 shadow-xs disabled:cursor-default"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {consolidationResult.consolidationGroups.every((g) => appliedGroupIds.includes(g.id))
                    ? 'Semua Telah Digabungkan'
                    : 'Gabungkan Semua Rekomendasi'}
                </button>
              )}
            </div>

            {consolidationResult.consolidationGroups.length === 0 ? (
              <div className="p-5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/70 rounded-xl flex items-center gap-3 text-xs text-emerald-900 dark:text-emerald-200 font-semibold">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>
                  Struktur kategori transaksi Anda sudah sangat efisien dan konsisten dengan Master Kategori. Tidak diperlukan penggabungan saat ini.
                </span>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {consolidationResult.consolidationGroups.map((group) => {
                  const isApplied = appliedGroupIds.includes(group.id);
                  const txTypeLabel =
                    group.transactionType === 'income'
                      ? 'Pemasukan'
                      : group.transactionType === 'saving'
                      ? 'Tabungan'
                      : group.transactionType === 'investment'
                      ? 'Investasi'
                      : 'Pengeluaran';

                  return (
                    <div
                      key={group.id}
                      className={`p-4 rounded-xl border transition space-y-3 flex flex-col justify-between ${
                        isApplied
                          ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/60'
                          : 'bg-slate-50/80 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700/80 hover:border-amber-300 dark:hover:border-amber-700'
                      }`}
                    >
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <span className="px-2 py-0.5 bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-[10px] font-extrabold rounded-full uppercase">
                              {txTypeLabel}
                            </span>
                            <span
                              className={`px-2 py-0.5 text-[10px] font-extrabold rounded-full uppercase ${
                                group.confidence === 'high'
                                  ? 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200'
                                  : 'bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-200'
                              }`}
                            >
                              {group.confidence === 'high' ? 'Rekomendasi Kuat' : 'Saran Efisiensi'}
                            </span>
                          </div>
                          <span className="text-[11px] font-mono font-bold text-slate-500 dark:text-slate-400">
                            {group.affectedTxCount} tx &bull; {formatterIDR.format(group.affectedTotalAmount)}
                          </span>
                        </div>

                        {/* Mapping Flow: Source Specific Categories -> Target Master Category */}
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-700/70">
                          <div className="flex-1 flex flex-wrap gap-1.5">
                            {group.sourceCategories.map((src) => (
                              <div
                                key={src.name}
                                className="px-2.5 py-1 bg-rose-50 dark:bg-rose-950/40 border border-rose-200/80 dark:border-rose-800/60 rounded-lg text-[11px]"
                                title={
                                  src.sampleDescriptions && src.sampleDescriptions.length > 0
                                    ? `Contoh: ${src.sampleDescriptions.join(', ')}`
                                    : undefined
                                }
                              >
                                <span className="font-bold text-rose-800 dark:text-rose-200">{src.name}</span>
                                <span className="ml-1.5 text-[10px] font-mono text-rose-600 dark:text-rose-300">
                                  ({src.txCount}x &bull; {formatterIDR.format(src.totalAmount)})
                                </span>
                              </div>
                            ))}
                          </div>

                          <div className="flex items-center justify-center shrink-0">
                            <ArrowRight className="h-4 w-4 text-amber-500 rotate-90 sm:rotate-0" />
                          </div>

                          <div className="shrink-0">
                            <span className="text-[9px] font-extrabold text-slate-400 uppercase block mb-0.5">
                              Kategori Master Target
                            </span>
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-black shadow-xs">
                              <Layers className="h-3.5 w-3.5" />
                              {group.targetMasterCategory}
                            </span>
                          </div>
                        </div>

                        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
                          {group.reason}
                        </p>
                      </div>

                      <div className="pt-2 border-t border-slate-200/70 dark:border-slate-700/60 flex items-center justify-between gap-2">
                        <span className="text-[10px] font-semibold text-slate-400">
                          {group.sourceCategories.length} kategori akan disatukan
                        </span>
                        {onConsolidateCategories && (
                          <button
                            onClick={() => handleApplyConsolidationGroup(group)}
                            disabled={isApplied}
                            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[11px] font-extrabold uppercase tracking-wider transition cursor-pointer ${
                              isApplied
                                ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 cursor-default'
                                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs'
                            }`}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {isApplied ? 'Sudah Digabungkan' : 'Terapkan Penggabungan'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ANALISIS VISUAL OVERLIMIT TREND CHART (6 BULAN TERAKHIR) */}
      <OverlimitTrendChart
        accounts={accounts}
        transactions={transactions}
        budgets={budgets}
        onApplyBudgetSuggestion={onApplyBudgetSuggestion}
      />

      {/* SIMULASI WHAT-IF HEMAT 10% & PROYEKSI SALDO MASA DEPAN */}
      <WhatIfSavingsSimulator
        transactions={transactions}
        accounts={accounts}
        emergencyBalance={emergencyBalance}
        budgets={budgets}
      />

      {/* PEMINDAIAN UTANG & REKOMENDASI PENJADWALAN PEMBAYARAN PRIORITAS */}
      <DebtPriorityScheduler debts={debts} />

      {/* AUTOMATIC WEEKLY & MONTHLY EXPENSE AUDIT & LONJAKAN ANOMALI CARD */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-md space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-tr from-amber-500 to-rose-500 text-white rounded-xl shadow-sm">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-800 dark:text-slate-100 text-base flex items-center gap-2">
                Audit Otomatis Pengeluaran Mingguan & Bulanan
                <span className="px-2.5 py-0.5 bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-200 text-[10px] font-black rounded-full uppercase">
                  Real-time Audit Engine
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                Sistem secara otomatis mendeteksi pola transaksi 7 hari terakhir dibanding rata-rata mingguan sebelumnya & memberi notifikasi lonjakan tidak lazim.
              </p>
            </div>
          </div>

          {weeklyMonthlyAudit.spikes.length > 0 ? (
            <div className="px-3.5 py-2 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl flex items-center gap-2 text-rose-800 dark:text-rose-200 font-extrabold text-xs animate-pulse">
              <AlertTriangle className="h-4 w-4 text-rose-600" />
              <span>Peringatan: {weeklyMonthlyAudit.spikes.length} Lonjakan Kategori Ditemukan!</span>
            </div>
          ) : (
            <div className="px-3.5 py-2 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center gap-2 text-emerald-800 dark:text-emerald-200 font-extrabold text-xs">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span>Pengeluaran Mingguan Stabil & Normal</span>
            </div>
          )}
        </div>

        {/* NOTIFIKASI LONJAKAN PENGELUARAN (SPIKE NOTIFICATIONS) */}
        {weeklyMonthlyAudit.spikes.length > 0 && (
          <div className="p-4 bg-gradient-to-br from-rose-50 to-amber-50/50 dark:from-rose-950/30 dark:to-amber-950/20 border-2 border-rose-300 dark:border-rose-800 rounded-2xl space-y-3 shadow-sm">
            <div className="flex items-center gap-2 text-rose-900 dark:text-rose-200 font-black text-xs uppercase tracking-wider">
              <AlertTriangle className="h-5 w-5 text-rose-600 animate-bounce" />
              <span>NOTIFIKASI PERINGATAN: LONJAKAN PENGELUARAN TIDAK LAZIM</span>
            </div>
            <p className="text-xs text-rose-800 dark:text-rose-300 font-medium leading-relaxed">
              Ditemukan pengeluaran pada kategori di bawah ini yang melonjak lebih dari <strong>30%</strong> dibandingkan rata-rata mingguan sebelumnya. Harap periksa apakah transaksi ini direncanakan atau memerlukan evaluasi!
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              {weeklyMonthlyAudit.spikes.map((spike, idx) => (
                <div key={idx} className="p-3.5 bg-white dark:bg-slate-800 border border-rose-200 dark:border-rose-800 rounded-xl shadow-2xs space-y-2">
                  <div className="flex items-center justify-between">
                    <strong className="text-slate-800 dark:text-slate-100 text-xs font-black">{spike.category}</strong>
                    <span className="px-2 py-0.5 bg-rose-600 text-white font-black text-[10px] rounded-md">
                      +{spike.spikePercentage}% LONJAKAN
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] font-bold border-t border-slate-100 dark:border-slate-700/60 pt-1.5">
                    <div>
                      <span className="text-[9px] text-slate-400 block uppercase">7 Hari Terakhir</span>
                      <span className="text-rose-600 dark:text-rose-400 font-mono">{formatterIDR.format(spike.curWeekCatAmount)}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-400 block uppercase">Rata-Rata Mingguan Lalu</span>
                      <span className="text-slate-600 dark:text-slate-300 font-mono">{formatterIDR.format(spike.prevWeekCatAvg)}</span>
                    </div>
                  </div>

                  <p className="text-[10px] text-slate-600 dark:text-slate-300 font-medium bg-rose-50/60 dark:bg-rose-950/40 p-2 rounded-lg border border-rose-100 dark:border-rose-900/60">
                    💡 <strong>Notifikasi Audit:</strong> Pengeluaran minggu ini naik Rp {formatterIDR.format(spike.diffWeekAmount)} dibanding rata-rata. Pertimbangkan untuk membatasi pengeluaran kategori ini di sisa minggu.
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SUMMARY COMPARISON METRICS (WEEKLY & MONTHLY) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl space-y-1">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
              Pengeluaran 7 Hari Terakhir
            </span>
            <span className="text-base font-black text-slate-800 dark:text-slate-100 font-mono block">
              {formatterIDR.format(weeklyMonthlyAudit.currentWeekTotal)}
            </span>
            <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
              Avg Mingguan Lalu: {formatterIDR.format(weeklyMonthlyAudit.prevWeekAvgTotal)}
            </span>
          </div>

          <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl space-y-1">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
              Deviasi Pengeluaran Mingguan
            </span>
            <div className="flex items-center gap-1.5">
              <span className={`text-base font-black font-mono ${
                weeklyMonthlyAudit.currentWeekTotal > weeklyMonthlyAudit.prevWeekAvgTotal ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
              }`}>
                {weeklyMonthlyAudit.currentWeekTotal > weeklyMonthlyAudit.prevWeekAvgTotal ? '+' : ''}
                {formatterIDR.format(weeklyMonthlyAudit.currentWeekTotal - weeklyMonthlyAudit.prevWeekAvgTotal)}
              </span>
            </div>
            <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
              {weeklyMonthlyAudit.currentWeekTotal > weeklyMonthlyAudit.prevWeekAvgTotal ? 'Melonjak dibanding minggu lalu' : 'Hemat dibanding minggu lalu'}
            </span>
          </div>

          <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl space-y-1">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
              Pengeluaran 30 Hari Terakhir
            </span>
            <span className="text-base font-black text-slate-800 dark:text-slate-100 font-mono block">
              {formatterIDR.format(weeklyMonthlyAudit.currentMonthTotal)}
            </span>
            <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
              Avg Bulanan Lalu: {formatterIDR.format(weeklyMonthlyAudit.prevMonthAvgTotal)}
            </span>
          </div>

          <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl space-y-1">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
              Status Audit Otomatis
            </span>
            <div className="text-sm font-extrabold pt-0.5">
              {weeklyMonthlyAudit.spikes.length > 0 ? (
                <span className="text-rose-600 dark:text-rose-400 flex items-center gap-1">
                  <AlertTriangle className="h-4 w-4" /> Perlu Perhatian
                </span>
              ) : (
                <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <ShieldCheck className="h-4 w-4" /> Terkendali Safe
                </span>
              )}
            </div>
            <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
              Audit transaksi diperbarui otomatis
            </span>
          </div>
        </div>

        {/* AUDIT TABLE BREAKDOWN BY CATEGORY */}
        <div className="space-y-3">
          <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center justify-between">
            <span>Hasil Audit Rincian per Kategori Pengeluaran</span>
            <span className="text-[11px] font-normal text-slate-400">{weeklyMonthlyAudit.categoryAudit.length} Kategori Diaudit</span>
          </h4>

          <div className="overflow-x-auto border border-slate-200 dark:border-slate-700/80 rounded-xl">
            <table className="w-full text-left text-xs font-medium">
              <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                <tr>
                  <th className="py-2.5 px-3">Kategori</th>
                  <th className="py-2.5 px-3 font-mono">Minggu Ini (7 Hari)</th>
                  <th className="py-2.5 px-3 font-mono">Avg Mingguan Lalu</th>
                  <th className="py-2.5 px-3 font-mono">Bulan Ini (30 Hari)</th>
                  <th className="py-2.5 px-3 font-mono">Avg Bulanan Lalu</th>
                  <th className="py-2.5 px-3 text-center">Status Audit & Lonjakan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                {weeklyMonthlyAudit.categoryAudit.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                    <td className="py-2.5 px-3 font-bold text-slate-800 dark:text-slate-100">{item.category}</td>
                    <td className="py-2.5 px-3 font-mono text-slate-900 dark:text-slate-100 font-bold">{formatterIDR.format(item.curWeekCatAmount)}</td>
                    <td className="py-2.5 px-3 font-mono text-slate-500 dark:text-slate-400">{formatterIDR.format(item.prevWeekCatAvg)}</td>
                    <td className="py-2.5 px-3 font-mono text-slate-900 dark:text-slate-100 font-bold">{formatterIDR.format(item.curMonthCatAmount)}</td>
                    <td className="py-2.5 px-3 font-mono text-slate-500 dark:text-slate-400">{formatterIDR.format(item.prevMonthCatAvg)}</td>
                    <td className="py-2.5 px-3 text-center">
                      {item.isSpike ? (
                        <span className="px-2.5 py-0.5 bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-200 font-black text-[10px] rounded-full uppercase inline-flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3 text-rose-600" /> Lonjakan +{item.spikePercentage}%
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-200 font-bold text-[10px] rounded-full uppercase">
                          Wajar / Normal
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ANALISIS STRUKTUR UTANG & STRATEGI PELUNASAN (SNOWBALL VS AVALANCHE) */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-md space-y-6">
        {/* Card Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-tr from-rose-600 via-amber-600 to-amber-500 text-white rounded-2xl shadow-sm">
              <Scale className="h-6 w-6" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 dark:text-slate-100 text-base flex items-center gap-2 flex-wrap">
                <span>Analisis Struktur Utang & Strategi Pelunasan Interaktif</span>
                <span className="px-2.5 py-0.5 bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 text-[10px] font-black rounded-full uppercase border border-amber-300 dark:border-amber-800">
                  Snowball vs Avalanche
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                Simulasi strategi pelunasan liabilitas berbasis suku bunga APR dan saldo untuk meminimalkan beban bunga total.
              </p>
            </div>
          </div>

          {/* Quick Stats Pill */}
          {debtAnalysis.activeDebts.length > 0 && (
            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold">
              <span className="text-slate-500 dark:text-slate-400">Total Utang Aktif:</span>
              <span className="font-mono font-black text-rose-600 dark:text-rose-400">
                {formatterIDR.format(debtAnalysis.totalDebtBalance)}
              </span>
            </div>
          )}
        </div>

        {debtAnalysis.activeDebts.length === 0 ? (
          /* ZERO DEBT STATE */
          <div className="p-8 bg-gradient-to-br from-emerald-50/80 to-teal-50/40 dark:from-emerald-950/30 dark:to-teal-950/20 border border-emerald-200 dark:border-emerald-800/80 rounded-2xl text-center space-y-3">
            <div className="inline-flex p-3 bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-300 rounded-full">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <h4 className="font-black text-base text-slate-900 dark:text-slate-100 uppercase tracking-wide">
              Bebas Utang! Portofolio Liabilitas Anda Bersih
            </h4>
            <p className="text-xs text-slate-600 dark:text-slate-300 max-w-lg mx-auto leading-relaxed font-medium">
              Selamat! Saat ini Anda tidak memiliki catatan kewajiban utang aktif. Pertahankan disiplin keuangan ini dengan memperbesar porsi dana darurat dan alokasi investasi rutin bulanan.
            </p>
          </div>
        ) : (
          /* ACTIVE DEBT ANALYSIS & STRATEGY CALCULATOR */
          <div className="space-y-6">
            {/* Top Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-xl space-y-1">
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                  Total Saldo Utang
                </span>
                <span className="text-base font-black text-rose-600 dark:text-rose-400 font-mono block">
                  {formatterIDR.format(debtAnalysis.totalDebtBalance)}
                </span>
                <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                  {debtAnalysis.activeDebts.length} Pinjaman Aktif
                </span>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-xl space-y-1">
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                  Cicilan Minimum Bulanan
                </span>
                <span className="text-base font-black text-slate-800 dark:text-slate-100 font-mono block">
                  {formatterIDR.format(debtAnalysis.totalMinPayment)}
                </span>
                <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                  Komitmen dasar per bulan
                </span>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-xl space-y-1">
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                  Rata-Rata Suku Bunga (APR)
                </span>
                <span className="text-base font-black text-amber-600 dark:text-amber-400 font-mono block">
                  {debtAnalysis.avgInterestRate.toFixed(1)}% / tahun
                </span>
                <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                  Rata-rata tertimbang bunga
                </span>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-xl space-y-1">
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                  Rekomendasi AI Strategi
                </span>
                <div className="pt-0.5">
                  <span className="px-2.5 py-0.5 bg-gradient-to-r from-amber-500 to-rose-600 text-white font-black text-xs rounded-lg uppercase inline-flex items-center gap-1 shadow-xs">
                    {debtAnalysis.recommendedStrategy === 'avalanche' ? (
                      <><Flame className="h-3.5 w-3.5" /> Avalanche</>
                    ) : (
                      <><Snowflake className="h-3.5 w-3.5" /> Snowball</>
                    )}
                  </span>
                </div>
                <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block pt-0.5">
                  {debtAnalysis.recommendedStrategy === 'avalanche' ? 'Hemat Bunga Maksimal' : 'Dorongan Psikologis Cepat'}
                </span>
              </div>
            </div>

            {/* Extra Allocation Input & Strategy Selector Controls */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/80 rounded-2xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                {/* Extra Payment Input */}
                <div className="space-y-1.5 flex-1 max-w-sm">
                  <label className="text-xs font-extrabold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Zap className="h-4 w-4 text-amber-500" />
                    <span>Tambahan Alokasi Bulanan untuk Pelunasan (Rp)</span>
                  </label>
                  <FormattedNumberInput
                    value={extraDebtPayoff}
                    onChange={(_, numVal) => setExtraDebtPayoff(Math.max(0, numVal))}
                    prefix="Rp "
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl font-mono text-sm font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    placeholder="Contoh: 500.000"
                  />
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                    Dana ekstra di luar cicilan minimum yang disisihkan setiap bulan untuk mempercepat pelunasan.
                  </p>
                </div>

                {/* Strategy Tabs */}
                <div className="space-y-1.5">
                  <span className="text-xs font-extrabold text-slate-700 dark:text-slate-300 block">
                    Pilih Tampilan Simulasi Strategi:
                  </span>
                  <div className="flex items-center gap-2 p-1 bg-slate-200 dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-700">
                    <button
                      type="button"
                      onClick={() => setSelectedDebtStrategy('avalanche')}
                      className={`px-3.5 py-2 rounded-lg text-xs font-black transition flex items-center gap-1.5 cursor-pointer ${
                        selectedDebtStrategy === 'avalanche'
                          ? 'bg-gradient-to-r from-amber-600 to-rose-600 text-white shadow-sm'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                      }`}
                    >
                      <Flame className="h-4 w-4" />
                      <span>Metode Avalanche</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSelectedDebtStrategy('snowball')}
                      className={`px-3.5 py-2 rounded-lg text-xs font-black transition flex items-center gap-1.5 cursor-pointer ${
                        selectedDebtStrategy === 'snowball'
                          ? 'bg-gradient-to-r from-sky-600 to-indigo-600 text-white shadow-sm'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                      }`}
                    >
                      <Snowflake className="h-4 w-4" />
                      <span>Metode Snowball</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Side-by-Side Comparison Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Avalanche Card */}
              <div
                className={`p-5 rounded-2xl border transition space-y-3 relative overflow-hidden ${
                  selectedDebtStrategy === 'avalanche'
                    ? 'bg-amber-50/80 dark:bg-amber-950/40 border-amber-400 dark:border-amber-700 shadow-md ring-2 ring-amber-500/30'
                    : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700'
                }`}
              >
                {debtAnalysis.recommendedStrategy === 'avalanche' && (
                  <span className="absolute top-3 right-3 px-2.5 py-0.5 bg-amber-500 text-slate-950 font-black text-[10px] rounded-full uppercase flex items-center gap-1">
                    <Award className="h-3 w-3" /> AI Best Value
                  </span>
                )}

                <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 font-extrabold text-sm">
                  <Flame className="h-5 w-5 text-amber-600" />
                  <span>Metode Avalanche (Bunga Highest First)</span>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-300 font-medium leading-relaxed">
                  Fokus melunasi pinjaman dengan <strong>suku bunga APR tertinggi terlebih dahulu</strong>. Secara matematis paling efisien untuk menghemat total pembayaran bunga.
                </p>

                <div className="space-y-2 pt-2 border-t border-amber-200/80 dark:border-amber-800/80 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">Estimasi Waktu Bebas Utang:</span>
                    <span className="font-mono font-extrabold text-slate-900 dark:text-slate-100">
                      {debtAnalysis.avalancheSim.years > 0 ? `${debtAnalysis.avalancheSim.years} Thn ` : ''}
                      {debtAnalysis.avalancheSim.remMonths} Bulan ({debtAnalysis.avalancheSim.totalMonths} Bulan Total)
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">Total Beban Bunga Dibayar:</span>
                    <span className="font-mono font-black text-rose-600 dark:text-rose-400">
                      {formatterIDR.format(debtAnalysis.avalancheSim.totalInterestPaid)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Snowball Card */}
              <div
                className={`p-5 rounded-2xl border transition space-y-3 relative overflow-hidden ${
                  selectedDebtStrategy === 'snowball'
                    ? 'bg-sky-50/80 dark:bg-sky-950/40 border-sky-400 dark:border-sky-700 shadow-md ring-2 ring-sky-500/30'
                    : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700'
                }`}
              >
                {debtAnalysis.recommendedStrategy === 'snowball' && (
                  <span className="absolute top-3 right-3 px-2.5 py-0.5 bg-sky-500 text-white font-black text-[10px] rounded-full uppercase flex items-center gap-1">
                    <Award className="h-3 w-3" /> AI Best Value
                  </span>
                )}

                <div className="flex items-center gap-2 text-sky-700 dark:text-sky-300 font-extrabold text-sm">
                  <Snowflake className="h-5 w-5 text-sky-500" />
                  <span>Metode Snowball (Saldo Lowest First)</span>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-300 font-medium leading-relaxed">
                  Fokus melunasi pinjaman dengan <strong>saldo terkecil terlebih dahulu</strong> tanpa melihat suku bunga. Memberikan kemenangan mental cepat dan menyederhanakan jumlah rekening tagihan.
                </p>

                <div className="space-y-2 pt-2 border-t border-sky-200/80 dark:border-sky-800/80 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">Estimasi Waktu Bebas Utang:</span>
                    <span className="font-mono font-extrabold text-slate-900 dark:text-slate-100">
                      {debtAnalysis.snowballSim.years > 0 ? `${debtAnalysis.snowballSim.years} Thn ` : ''}
                      {debtAnalysis.snowballSim.remMonths} Bulan ({debtAnalysis.snowballSim.totalMonths} Bulan Total)
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">Total Beban Bunga Dibayar:</span>
                    <span className="font-mono font-black text-rose-600 dark:text-rose-400">
                      {formatterIDR.format(debtAnalysis.snowballSim.totalInterestPaid)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Interest Difference Banner */}
            {debtAnalysis.interestSavedByAvalanche > 0 && (
              <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 rounded-2xl flex items-center gap-3 text-xs text-emerald-900 dark:text-emerald-200 font-medium">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                <div>
                  <strong>Penghematan Bunga:</strong> Menggunakan <strong>Metode Avalanche</strong> berpotensi menghemat bunga sebesar <strong>{formatterIDR.format(debtAnalysis.interestSavedByAvalanche)}</strong> dibandingkan metode Snowball!
                </div>
              </div>
            )}

            {/* Priority Payoff Order List */}
            <div className="space-y-3">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <ListOrdered className="h-4 w-4 text-amber-500" />
                  Urutan Prioritas Pelunasan ({selectedDebtStrategy === 'avalanche' ? 'Metode Avalanche' : 'Metode Snowball'})
                </span>
                <span className="text-[11px] font-normal text-slate-400">
                  {debtAnalysis.activeDebts.length} Item Utang
                </span>
              </h4>

              <div className="overflow-x-auto border border-slate-200 dark:border-slate-700/80 rounded-xl">
                <table className="w-full text-left text-xs font-medium">
                  <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                    <tr>
                      <th className="py-2.5 px-3 text-center">Prioritas</th>
                      <th className="py-2.5 px-3">Nama Pinjaman / Utang</th>
                      <th className="py-2.5 px-3">Sifat Utang</th>
                      <th className="py-2.5 px-3 font-mono">Saldo Sisa</th>
                      <th className="py-2.5 px-3 font-mono">Bunga APR</th>
                      <th className="py-2.5 px-3 font-mono">Cicilan Min</th>
                      <th className="py-2.5 px-3 font-mono">Estimasi Lunas</th>
                      <th className="py-2.5 px-3 font-mono text-right">Est. Bunga</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                    {(selectedDebtStrategy === 'avalanche' ? debtAnalysis.avalancheSim.debtSequence : debtAnalysis.snowballSim.debtSequence).map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={`px-2.5 py-0.5 rounded-full font-black text-[10px] ${
                              item.rank === 1
                                ? 'bg-amber-500 text-slate-950 border border-amber-600 shadow-xs'
                                : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            #{item.rank} {item.rank === 1 ? 'UTAMA' : ''}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-slate-100">
                          {item.name}
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase ${
                              item.purpose === 'productive'
                                ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-200'
                                : 'bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-200'
                            }`}
                          >
                            {item.purpose === 'productive' ? 'Produktif' : 'Konsumtif'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-900 dark:text-slate-100">
                          {formatterIDR.format(item.balance)}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-amber-600 dark:text-amber-400">
                          {item.interestRate}% / thn
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-600 dark:text-slate-400">
                          {formatterIDR.format(item.minPayment)}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-extrabold text-indigo-600 dark:text-indigo-400">
                          {item.payoffDateStr} ({item.payoffMonth} bln)
                        </td>
                        <td className="py-2.5 px-3 font-mono text-right text-rose-600 dark:text-rose-400">
                          {formatterIDR.format(item.totalInterestForDebt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* AI Warning & Advice Footer */}
            {debtAnalysis.highInterestDebts.length > 0 && (
              <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-2xl space-y-2">
                <div className="flex items-center gap-2 text-rose-800 dark:text-rose-300 font-black text-xs uppercase">
                  <AlertTriangle className="h-4 w-4 text-rose-600" />
                  <span>Peringatan Suku Bunga Tinggi ({debtAnalysis.highInterestDebts.length} Pinjaman)</span>
                </div>
                <p className="text-xs text-rose-700 dark:text-rose-300 font-medium leading-relaxed">
                  Ditemukan pinjaman dengan suku bunga APR di atas 15%/tahun. Disarankan untuk memprioritaskan alokasi dana ekstra pada pinjaman tersebut atau mempertimbangkan negosiasi restrukturisasi / pelunasan dipercepat (takeover).
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* MONTHLY COMPARISON RESULTS CARD */}
      {compareResult && (
        <div className="bg-white p-6 rounded-2xl border border-indigo-200 shadow-md space-y-6 animate-fadeIn">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-indigo-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-100 text-indigo-700 rounded-xl">
                <Calendar className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-800 text-base flex items-center gap-2">
                  <span>Komparasi Pengeluaran Bulanan: {compareResult.currentMonthName || 'Bulan Ini'} vs {compareResult.previousMonthName || 'Bulan Lalu'}</span>
                  <span className="px-2.5 py-0.5 bg-indigo-100 text-indigo-800 text-[10px] font-black rounded-full uppercase">
                    Gemini AI Model
                  </span>
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  Analisis perbandingan otomatis dari total transaksi pengeluaran bulan ini dibanding bulan sebelumnya.
                </p>
              </div>
            </div>

            <div className={`px-3 py-1.5 rounded-xl border text-xs font-black flex items-center gap-1.5 self-start sm:self-center ${
              compareResult.trendStatus === 'Penghematan' 
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                : compareResult.trendStatus === 'Meningkat'
                ? 'bg-rose-50 text-rose-800 border-rose-200'
                : 'bg-blue-50 text-blue-800 border-blue-200'
            }`}>
              {compareResult.trendStatus === 'Penghematan' ? (
                <ArrowDownRight className="h-4 w-4 text-emerald-600" />
              ) : compareResult.trendStatus === 'Meningkat' ? (
                <ArrowUpRight className="h-4 w-4 text-rose-600" />
              ) : (
                <Scale className="h-4 w-4 text-blue-600" />
              )}
              <span>Tren: {compareResult.trendStatus.toUpperCase()}</span>
            </div>
          </div>

          {/* Key KPI Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Total {compareResult.previousMonthName || 'Bulan Lalu'}
              </span>
              <span className="text-lg font-black text-slate-700 font-mono block">
                {formatterIDR.format(compareResult.totalPreviousMonthExpense || 0)}
              </span>
            </div>

            <div className="p-4 rounded-xl bg-indigo-50/60 border border-indigo-200 space-y-1">
              <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider block">
                Total {compareResult.currentMonthName || 'Bulan Ini'}
              </span>
              <span className="text-lg font-black text-indigo-900 font-mono block">
                {formatterIDR.format(compareResult.totalCurrentMonthExpense || 0)}
              </span>
            </div>

            <div className={`p-4 rounded-xl border space-y-1 ${
              (compareResult.differenceAmount || 0) > 0 
                ? 'bg-rose-50/70 border-rose-200 text-rose-900'
                : (compareResult.differenceAmount || 0) < 0
                ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                : 'bg-slate-50 border-slate-200 text-slate-800'
            }`}>
              <span className="text-[10px] font-bold uppercase tracking-wider block opacity-70">
                Selisih & Perubahan (%)
              </span>
              <div className="flex items-center gap-2">
                <span className="text-lg font-black font-mono">
                  {formatterIDR.format(Math.abs(compareResult.differenceAmount || 0))}
                </span>
                <span className={`text-xs font-black px-2 py-0.5 rounded-full ${
                  (compareResult.differenceAmount || 0) > 0
                    ? 'bg-rose-200/80 text-rose-900'
                    : (compareResult.differenceAmount || 0) < 0
                    ? 'bg-emerald-200/80 text-emerald-900'
                    : 'bg-slate-200 text-slate-700'
                }`}>
                  {(compareResult.differenceAmount || 0) > 0 ? '+' : ''}{compareResult.percentageChange?.toFixed(1) || 0}%
                </span>
              </div>
            </div>
          </div>

          {/* Executive Summary */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700 font-medium leading-relaxed">
            <strong className="text-slate-900 block mb-1">Evaluasi Komparasi Gemini AI:</strong>
            {compareResult.overallSummary}
          </div>

          {/* Highlights Box: Top Increase & Top Savings */}
          {(compareResult.topIncreaseCategory || compareResult.topSavingsCategory) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {compareResult.topIncreaseCategory && (
                <div className="p-4 rounded-xl bg-rose-50/50 border border-rose-200 space-y-2">
                  <div className="flex items-center gap-2 text-rose-800 font-black text-xs uppercase tracking-wider">
                    <TrendingUp className="h-4 w-4 text-rose-600" />
                    <span>Kenaikan Pengeluaran Terbesar</span>
                  </div>
                  <div className="flex justify-between items-baseline pt-1">
                    <strong className="text-slate-800 text-sm">{compareResult.topIncreaseCategory.category}</strong>
                    <span className="text-rose-600 font-mono font-bold text-xs">
                      +{formatterIDR.format(compareResult.topIncreaseCategory.increaseAmount)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed font-medium bg-white/80 p-2.5 rounded-lg border border-rose-100">
                    {compareResult.topIncreaseCategory.reason}
                  </p>
                </div>
              )}

              {compareResult.topSavingsCategory && (
                <div className="p-4 rounded-xl bg-emerald-50/50 border border-emerald-200 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-800 font-black text-xs uppercase tracking-wider">
                    <TrendingDown className="h-4 w-4 text-emerald-600" />
                    <span>Penghematan Terbesar</span>
                  </div>
                  <div className="flex justify-between items-baseline pt-1">
                    <strong className="text-slate-800 text-sm">{compareResult.topSavingsCategory.category}</strong>
                    <span className="text-emerald-600 font-mono font-bold text-xs">
                      -{formatterIDR.format(compareResult.topSavingsCategory.savingsAmount)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed font-medium bg-white/80 p-2.5 rounded-lg border border-emerald-100">
                    {compareResult.topSavingsCategory.reason}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Category Comparisons Table / Cards */}
          {compareResult.categoryComparisons && compareResult.categoryComparisons.length > 0 && (
            <div className="space-y-3">
              <h4 className="font-extrabold text-slate-800 text-xs uppercase tracking-wider">
                Rincian Perbandingan Pengeluaran per Kategori:
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {compareResult.categoryComparisons.map((cat, idx) => {
                  const isUp = cat.trend === 'Naik' || cat.differenceAmount > 0;
                  const isDown = cat.trend === 'Turun' || cat.differenceAmount < 0;

                  return (
                    <div key={idx} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 hover:bg-slate-100/50 transition">
                      <div className="flex justify-between items-center">
                        <strong className="text-slate-800 text-sm">{cat.category}</strong>
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                          isUp ? 'bg-rose-100 text-rose-700' :
                          isDown ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700'
                        }`}>
                          {isUp ? `+${cat.percentageChange?.toFixed(1) || 0}% (Naik)` : isDown ? `${cat.percentageChange?.toFixed(1) || 0}% (Hemat)` : 'Sama'}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-xs font-bold pt-1 border-t border-slate-200">
                        <div>
                          <span className="text-[10px] text-slate-400 block uppercase">Bulan Lalu</span>
                          <span className="text-slate-600 font-mono">{formatterIDR.format(cat.previousMonthAmount)}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block uppercase">Bulan Ini</span>
                          <span className="text-indigo-900 font-mono">{formatterIDR.format(cat.currentMonthAmount)}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block uppercase">Selisih</span>
                          <span className={`font-mono ${isUp ? 'text-rose-600' : isDown ? 'text-emerald-600' : 'text-slate-500'}`}>
                            {isUp ? '+' : ''}{formatterIDR.format(cat.differenceAmount)}
                          </span>
                        </div>
                      </div>

                      {cat.insight && (
                        <p className="text-xs text-slate-600 leading-relaxed font-medium bg-white/80 p-2.5 rounded-lg border border-slate-200">
                          <strong>Insight Gemini AI:</strong> {cat.insight}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Actionable Recommendations */}
          {compareResult.actionableRecommendations && compareResult.actionableRecommendations.length > 0 && (
            <div className="p-4 bg-indigo-50 border border-indigo-200 text-indigo-950 rounded-xl text-xs leading-relaxed space-y-2">
              <strong className="block font-bold text-indigo-900 text-xs uppercase tracking-wider">
                Rekomendasi Taktis AI untuk Bulan Depan:
              </strong>
              <ul className="list-disc list-inside space-y-1 font-medium">
                {compareResult.actionableRecommendations.map((rec, idx) => (
                  <li key={idx}>{rec}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Compare Error State */}
      {compareError && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-900 rounded-xl flex items-center gap-3 text-sm animate-fadeIn">
          <AlertTriangle className="h-5 w-5 text-rose-500 shrink-0" />
          <div>
            <p className="font-bold">Gagal Melakukan Komparasi Bulanan AI</p>
            <p className="text-xs text-rose-700">{compareError}</p>
          </div>
        </div>
      )}

      {/* 3-MONTH SPENDING TREND & SAVINGS RECOMMENDATIONS CARD */}
      {trendResult && (
        <div className="bg-white p-6 rounded-2xl border border-emerald-200 shadow-md space-y-6 animate-fadeIn">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-emerald-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-100 text-emerald-700 rounded-xl">
                <TrendingUp className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-800 text-base flex items-center gap-2">
                  <span>Analisis Tren 3 Bulan ({trendResult.currentMonthName || 'Bulan Ini'} vs Rata-Rata {trendResult.threeMonthsRangeName || '3 Bulan Terakhir'})</span>
                  <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-black rounded-full uppercase">
                    Gemini AI Model
                  </span>
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  Membandingkan total pengeluaran bulan ini terhadap rata-rata 3 bulan terakhir & mengevaluasi selisih anggaran per kategori.
                </p>
              </div>
            </div>

            <div className={`px-3 py-1.5 rounded-xl border text-xs font-black flex items-center gap-1.5 self-start sm:self-center ${
              trendResult.trendStatus === 'Penghematan' 
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                : trendResult.trendStatus === 'Meningkat'
                ? 'bg-rose-50 text-rose-800 border-rose-200'
                : 'bg-blue-50 text-blue-800 border-blue-200'
            }`}>
              {trendResult.trendStatus === 'Penghematan' ? (
                <ArrowDownRight className="h-4 w-4 text-emerald-600" />
              ) : trendResult.trendStatus === 'Meningkat' ? (
                <ArrowUpRight className="h-4 w-4 text-rose-600" />
              ) : (
                <Scale className="h-4 w-4 text-blue-600" />
              )}
              <span>Tren: {trendResult.trendStatus.toUpperCase()}</span>
            </div>
          </div>

          {/* Key KPI Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Total Bulan Ini ({trendResult.currentMonthName})
              </span>
              <span className="text-base font-black text-slate-800 font-mono block">
                {formatterIDR.format(trendResult.totalCurrentExpense || 0)}
              </span>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Rata-Rata 3 Bulan Terakhir
              </span>
              <span className="text-base font-black text-slate-700 font-mono block">
                {formatterIDR.format(trendResult.totalThreeMonthAvg || 0)}
              </span>
            </div>

            <div className={`p-4 rounded-xl border space-y-1 ${
              trendResult.totalDifference > 0 ? 'bg-rose-50/70 border-rose-200' : 'bg-emerald-50/70 border-emerald-200'
            }`}>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                Selisih vs Rata-Rata
              </span>
              <span className={`text-base font-black font-mono block ${
                trendResult.totalDifference > 0 ? 'text-rose-700' : 'text-emerald-700'
              }`}>
                {trendResult.totalDifference > 0 ? '+' : ''}{formatterIDR.format(trendResult.totalDifference || 0)}
              </span>
            </div>

            <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-200 space-y-1">
              <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">
                Perubahan % vs Rata-Rata
              </span>
              <span className="text-base font-black text-emerald-900 font-mono block">
                {trendResult.percentageVsAvg > 0 ? `+${trendResult.percentageVsAvg.toFixed(1)}%` : `${trendResult.percentageVsAvg?.toFixed(1) || 0}%`}
              </span>
            </div>
          </div>

          {/* Executive Summary */}
          {trendResult.overallTrendSummary && (
            <div className="p-4 bg-emerald-50/50 rounded-xl border border-emerald-100 text-xs text-slate-700 space-y-1">
              <p className="font-extrabold text-emerald-900 flex items-center gap-1.5 uppercase text-[11px] tracking-wider">
                <Sparkles className="h-4 w-4 text-emerald-600" /> Ringkasan Analisis Tren AI:
              </p>
              <p className="leading-relaxed font-medium text-slate-700">
                {trendResult.overallTrendSummary}
              </p>
            </div>
          )}

          {/* Top Savings Recommendations Section */}
          {trendResult.topSavingsRecommendations && trendResult.topSavingsRecommendations.length > 0 && (
            <div className="space-y-3 pt-2">
              <h4 className="font-black text-slate-800 text-xs uppercase tracking-wider flex items-center gap-2">
                <PiggyBank className="h-4 w-4 text-emerald-600" />
                Rekomendasi Utama Penghematan Anggaran
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {trendResult.topSavingsRecommendations.map((rec, idx) => (
                  <div key={idx} className="p-4 rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50/40 border border-emerald-200 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-bold text-xs text-slate-800">{rec.title}</span>
                      <span className="text-[10px] bg-emerald-600 text-white font-extrabold px-2 py-0.5 rounded-full shrink-0">
                        Potensi Hemat: {formatterIDR.format(rec.potentialSavingsAmount)}
                      </span>
                    </div>
                    <span className="text-[10px] font-extrabold text-emerald-700 bg-white/80 border border-emerald-200 px-2 py-0.5 rounded uppercase inline-block">
                      Kategori: {rec.category}
                    </span>
                    <p className="text-xs text-slate-600 leading-relaxed font-medium">
                      {rec.actionPlan}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Category Breakdown & Budget Variance Table */}
          {trendResult.categoryAnalyses && trendResult.categoryAnalyses.length > 0 && (
            <div className="space-y-3 pt-2">
              <h4 className="font-black text-slate-800 text-xs uppercase tracking-wider flex items-center gap-2">
                <Wallet className="h-4 w-4 text-emerald-600" />
                Rincian Kategori vs Rata-Rata 3 Bulan & Batas Anggaran
              </h4>
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                    <tr>
                      <th className="py-2.5 px-3">Kategori</th>
                      <th className="py-2.5 px-3 font-mono">Bulan Ini</th>
                      <th className="py-2.5 px-3 font-mono">Rata2 3 Bulan</th>
                      <th className="py-2.5 px-3 font-mono">Batas Anggaran</th>
                      <th className="py-2.5 px-3 font-mono">Selisih Anggaran</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Saran Penghematan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {trendResult.categoryAnalyses.map((cat, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80 transition">
                        <td className="py-2.5 px-3 font-bold text-slate-800">{cat.category}</td>
                        <td className="py-2.5 px-3 font-mono text-slate-800">{formatterIDR.format(cat.currentMonthAmount)}</td>
                        <td className="py-2.5 px-3 font-mono text-slate-500">{formatterIDR.format(cat.threeMonthAvgAmount)}</td>
                        <td className="py-2.5 px-3 font-mono text-slate-500">
                          {cat.budgetLimit > 0 ? formatterIDR.format(cat.budgetLimit) : '-'}
                        </td>
                        <td className={`py-2.5 px-3 font-mono font-bold ${
                          cat.budgetDiff < 0 ? 'text-rose-600' : 'text-emerald-600'
                        }`}>
                          {cat.budgetLimit > 0 ? (
                            cat.budgetDiff < 0 
                              ? `Membengkak ${formatterIDR.format(Math.abs(cat.budgetDiff))}`
                              : `Sisa ${formatterIDR.format(cat.budgetDiff)}`
                          ) : '-'}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                            cat.status === 'Membengkak' ? 'bg-rose-100 text-rose-700' :
                            cat.status === 'Hemat' ? 'bg-emerald-100 text-emerald-700' :
                            'bg-blue-100 text-blue-700'
                          }`}>
                            {cat.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 text-[11px] leading-snug">{cat.savingsRecommendation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* General Tips */}
          {trendResult.generalTips && trendResult.generalTips.length > 0 && (
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2">
              <span className="font-extrabold text-slate-700 uppercase tracking-wider block text-[10px]">
                Tips Taktis Penghematan Lainnya:
              </span>
              <ul className="list-disc list-inside space-y-1 text-slate-600 font-medium">
                {trendResult.generalTips.map((tip, idx) => (
                  <li key={idx}>{tip}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Trend Error State */}
      {trendError && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-900 rounded-xl flex items-center gap-3 text-sm animate-fadeIn">
          <AlertTriangle className="h-5 w-5 text-rose-500 shrink-0" />
          <div>
            <p className="font-bold">Gagal Menganalisis Tren Pengeluaran 3 Bulan</p>
            <p className="text-xs text-rose-700">{trendError}</p>
          </div>
        </div>
      )}

      {/* ANOMALY DETECTION RESULTS CARD */}
      {anomalyResult && (
        <div className="bg-white p-6 rounded-2xl border border-rose-200 shadow-md space-y-5 animate-fadeIn">
          <div className="flex items-center justify-between border-b border-rose-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-rose-100 text-rose-600 rounded-xl">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-800 text-base flex items-center gap-2">
                  <span>Hasil Deteksi Anomali & Transaksi Tidak Wajar</span>
                  <span className="px-2.5 py-0.5 bg-rose-100 text-rose-800 text-[10px] font-black rounded-full uppercase">
                    Gemini AI Model
                  </span>
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  {anomalyResult.analysisPeriod || 'Perbandingan Pengeluaran Bulan Ini vs Rata-Rata 3 Bulan Sebelumnya'}
                </p>
              </div>
            </div>
            {anomalyResult.unusualTransactionsCount !== undefined && (
              <span className="px-3 py-1 bg-amber-100 text-amber-900 font-extrabold text-xs rounded-xl border border-amber-200">
                {anomalyResult.unusualTransactionsCount} Anomali Ditemukan
              </span>
            )}
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs text-slate-700 font-medium leading-relaxed">
            <strong className="text-slate-900 block mb-1"> Ringkasan Evaluasi AI:</strong>
            {anomalyResult.overallAssessment}
          </div>

          {/* Anomalies List */}
          {anomalyResult.anomalies && anomalyResult.anomalies.length > 0 ? (
            <div className="space-y-4">
              <h4 className="font-extrabold text-slate-800 text-xs uppercase tracking-wider">
                Daftar Lonjakan & Anomali Kategori Pengeluaran:
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {anomalyResult.anomalies.map((anom, idx) => (
                  <div
                    key={idx}
                    className={`p-4 rounded-xl border space-y-3 ${
                      anom.severity === 'high'
                        ? 'bg-rose-50/70 border-rose-200'
                        : anom.severity === 'medium'
                        ? 'bg-amber-50/70 border-amber-200'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-black text-slate-800 text-sm">{anom.category}</span>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                          anom.severity === 'high'
                            ? 'bg-rose-600 text-white'
                            : anom.severity === 'medium'
                            ? 'bg-amber-500 text-white'
                            : 'bg-blue-600 text-white'
                        }`}
                      >
                        +{anom.increasePercentage}% SPIKE ({anom.severity.toUpperCase()})
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs font-bold pt-1 border-t border-slate-200/60">
                      <div>
                        <span className="text-[10px] text-slate-400 block uppercase">Bulan Ini</span>
                        <span className="text-rose-600 font-mono">{formatterIDR.format(anom.currentMonthAmount)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block uppercase">Rata-Rata 3 Bln</span>
                        <span className="text-slate-600 font-mono">{formatterIDR.format(anom.previousAverageAmount)}</span>
                      </div>
                    </div>

                    <p className="text-xs text-slate-600 leading-relaxed font-medium bg-white/80 p-2.5 rounded-lg border border-slate-150">
                      <strong>Penjelasan Anomali:</strong> {anom.explanation}
                    </p>

                    <p className="text-xs text-emerald-800 leading-relaxed font-semibold bg-emerald-50/80 p-2.5 rounded-lg border border-emerald-150">
                      <strong>Saran AI:</strong> {anom.recommendation}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl text-xs font-semibold flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
              <span>Tidak terdeteksi anomali pengeluaran ekstrem. Pengeluaran Anda terpantau wajar dan stabil!</span>
            </div>
          )}

          {anomalyResult.aiAdvice && (
            <div className="p-4 bg-blue-50 border border-blue-200 text-blue-900 rounded-xl text-xs leading-relaxed space-y-1">
              <strong className="block font-bold"> Rekomendasi Utama Asisten Gemini AI:</strong>
              <p className="font-medium">{anomalyResult.aiAdvice}</p>
            </div>
          )}
        </div>
      )}

      {/* Anomaly Error state */}
      {anomalyError && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-900 rounded-xl flex items-center gap-3 text-sm animate-fadeIn">
          <AlertTriangle className="h-5 w-5 text-rose-500 shrink-0" />
          <div>
            <p className="font-bold">Gagal Melakukan Deteksi Anomali AI</p>
            <p className="text-xs text-rose-700">{anomalyError}</p>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-900 rounded-xl flex items-center gap-3 text-sm">
          <AlertTriangle className="h-5 w-5 text-rose-500 shrink-0" />
          <div>
            <p className="font-bold">Gagal Melakukan Analisis AI</p>
            <p className="text-xs text-rose-700 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Loading Ambient Overlay */}
      {loading && (
        <div className="p-12 text-center flex flex-col items-center justify-center space-y-4 bg-white border border-slate-200 rounded-2xl shadow-sm">
          <div className="relative flex items-center justify-center">
            <div className="absolute w-12 h-12 rounded-full border-4 border-blue-100 animate-ping" />
            <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
          </div>
          <div className="space-y-1.5 max-w-sm">
            <h4 className="font-bold text-slate-800 text-sm">Sedang Membaca Alur Keuangan Anda</h4>
            <p className="text-xs text-slate-400">
              Menghitung rasio pengeluaran aktual terhadap limit bulanan, memetakan pelunasan utang, serta memformulasikan tips kedisiplinan...
            </p>
          </div>
        </div>
      )}

      {/* AI RESULT DISPLAY */}
      {result && !loading && (
        <div className="space-y-6">
          {/* 1. Executive Summary */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider mb-3">Ringkasan Eksekutif Keuangan</h3>
            <p className="text-slate-600 text-sm leading-relaxed font-medium">
              {result.summary}
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* 2. Category Expense Analysis */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider">Analisis Kategori Pengeluaran Aktual</h3>
              <div className="space-y-3.5 max-h-[420px] overflow-y-auto pr-1">
                {result.analysis.map((item) => {
                  const isOver = item.status.toLowerCase().includes('berlebih') || item.status.toLowerCase().includes('over');
                  const isWarn = item.status.toLowerCase().includes('peringatan') || item.status.toLowerCase().includes('warn');

                  return (
                    <div key={item.category} className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 hover:bg-slate-100/50 transition">
                      <div className="flex justify-between items-center">
                        <strong className="text-slate-800 text-sm">{item.category}</strong>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                          isOver ? 'bg-rose-100 text-rose-600' :
                          isWarn ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'
                        }`}>
                          {item.status} ({item.percentageOfTotal}%)
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed font-medium">
                        {item.insight}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 3. Budget Recommendation & Adjustments */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider">Rekomendasi Penyesuaian Anggaran</h3>
              
              <div className="space-y-3.5 max-h-[420px] overflow-y-auto pr-1">
                {result.budgetSuggestions.map((sug) => (
                  <div key={sug.category} className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-bold text-slate-800 text-sm">{sug.category}</h4>
                        <div className="flex gap-4 mt-1 text-[11px] font-bold">
                          <span className="text-slate-400">Semula: <strong className="text-slate-600">{formatterIDR.format(sug.currentBudget)}</strong></span>
                          <span className="text-blue-600">Saran AI: <strong className="text-blue-700">{formatterIDR.format(sug.recommendedBudget)}</strong></span>
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          onApplyBudgetSuggestion(sug.category, sug.recommendedBudget);
                          showToast({
                            type: 'success',
                            title: 'Anggaran Diperbarui',
                            message: `Batas anggaran untuk "${sug.category}" berhasil disesuaikan menjadi ${formatterIDR.format(sug.recommendedBudget)}.`,
                          });
                        }}
                        className="bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold uppercase px-3 py-1.5 rounded-lg transition cursor-pointer"
                      >
                        Terapkan
                      </button>
                    </div>
                    
                    <p className="text-xs text-slate-500 leading-relaxed bg-white p-2.5 rounded-lg border border-slate-200 font-medium">
                      <strong>Rasionalisasi AI:</strong> {sug.reason}
                    </p>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* 4. Debt, Emergency Fund, and Investment Strategic Advice */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Debt Strategist */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-3">
              <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider flex items-center gap-1.5">
                <ArrowRightLeft className="h-5 w-5 text-blue-600" />
                Saran Pelunasan Utang
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed font-medium">
                {result.debtAdvice}
              </p>
            </div>

            {/* Emergency Fund Advisor */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-3">
              <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                Saran Dana Darurat
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed font-medium">
                {result.emergencyFundAdvice}
              </p>
            </div>

            {/* Investment Portfolio Advisor */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-3">
              <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider flex items-center gap-1.5">
                <TrendingUp className="h-5 w-5 text-indigo-600" />
                Saran Alokasi Investasi
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed font-medium">
                {result.investmentAdvice || "Belum ada alokasi aset portofolio investasi terdaftar. Anda dapat memulai investasi berkala dari kategori saham, reksadana, atau logam mulia untuk mendiversifikasi aset Anda."}
              </p>
            </div>

          </div>

          {/* 5. Habits / Discipline Tips */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider">Tips Disiplin Finansial Untuk Anda</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {result.disciplineTips.map((tip, idx) => (
                <div key={idx} className="p-4 bg-blue-50/50 border border-blue-100 rounded-xl space-y-2 relative">
                  <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center text-xs font-black text-blue-600">
                    {idx + 1}
                  </div>
                  <p className="text-xs text-slate-700 leading-relaxed font-semibold">
                    {tip}
                  </p>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}

      {/* Placeholder State (on first load) */}
      {!result && !loading && (
        <div className="p-12 text-center flex flex-col items-center justify-center space-y-4 bg-white border border-slate-200 rounded-2xl shadow-sm">
          <div className="p-4 bg-blue-50 text-blue-600 rounded-full">
            <Sparkles className="h-8 w-8 animate-bounce" />
          </div>
          <div className="space-y-1.5 max-w-sm">
            <h4 className="font-bold text-slate-800 text-sm">Menunggu Perintah Analisis</h4>
            <p className="text-xs text-slate-400">
              Silakan pastikan Anda sudah memasukkan transaksi dan anggaran bulanan di tab sebelumnya, lalu klik tombol analisis di atas untuk meminta saran taktis dari AI Gemini.
            </p>
          </div>
        </div>
      )}

      {/* --- INTERACTIVE ZAKAT CALCULATOR --- */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl shrink-0">
              <Coins className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-black text-slate-800 text-sm uppercase tracking-wider">Kalkulator Zakat Mal & Profesi</h3>
              <p className="text-[11px] text-slate-400 font-bold mt-0.5">
                Hitung potensi zakat wajib berdasarkan total saldo aset dan investasi Anda yang memenuhi nisab secara syariah.
              </p>
            </div>
          </div>

          {/* Toggle Tab */}
          <div className="flex bg-slate-100 p-1 rounded-xl self-start sm:self-center shrink-0">
            <button
              onClick={() => setZakatTab('mal')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all duration-150 cursor-pointer ${
                zakatTab === 'mal' 
                  ? 'bg-white text-emerald-700 shadow-xs' 
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Zakat Mal (Harta)
            </button>
            <button
              onClick={() => setZakatTab('profesi')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all duration-150 cursor-pointer ${
                zakatTab === 'profesi' 
                  ? 'bg-white text-emerald-700 shadow-xs' 
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Zakat Profesi
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Inputs & Configurations */}
          <div className="lg:col-span-7 space-y-4">
            {zakatTab === 'mal' ? (
              <div className="space-y-4">
                <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-150/80 space-y-3">
                  <h4 className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Informasi Harta Terhitung (Aplikasi)</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div className="p-3 bg-white rounded-lg border border-slate-200">
                      <span className="text-slate-400 block font-bold text-[10px]">Kas & Tabungan</span>
                      <strong className="text-slate-700 font-mono mt-1 block font-black">{formatterIDR.format(totalCashBank)}</strong>
                    </div>
                    <div className="p-3 bg-white rounded-lg border border-slate-200">
                      <span className="text-slate-400 block font-bold text-[10px]">Portofolio Investasi</span>
                      <strong className="text-slate-700 font-mono mt-1 block font-black">{formatterIDR.format(totalInvestmentsVal)}</strong>
                    </div>
                    <div className="p-3 bg-white rounded-lg border border-slate-200">
                      <span className="text-slate-400 block font-bold text-[10px]">Dana Darurat</span>
                      <strong className="text-slate-700 font-mono mt-1 block font-black">{formatterIDR.format(totalEmergencyVal)}</strong>
                    </div>
                  </div>
                  <div className="pt-1.5 flex items-center justify-between text-[11px] text-slate-400 font-bold uppercase tracking-wider">
                    <span>Total Harta Riil saat ini:</span>
                    <span className="text-slate-700 font-mono font-black">{formatterIDR.format(totalCashBank + totalInvestmentsVal + totalEmergencyVal)}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider flex justify-between items-center">
                    <span>Total Harta yang Dihitung (IDR)</span>
                    <button 
                      onClick={() => setCustomHarta(null)} 
                      disabled={customHarta === null}
                      className="text-[10px] text-blue-600 hover:text-blue-800 disabled:text-slate-300 font-black uppercase tracking-wider transition cursor-pointer"
                    >
                      Gunakan Saldo Riil
                    </button>
                  </label>
                  <input
                    type="number"
                    value={customHarta !== null ? customHarta : (totalCashBank + totalInvestmentsVal + totalEmergencyVal)}
                    onChange={(e) => setCustomHarta(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:bg-white rounded-xl px-4 py-2.5 text-xs font-mono font-black text-slate-800 outline-hidden transition"
                    placeholder="Masukkan nominal harta untuk kalkulasi"
                  />
                  <p className="text-[10px] text-slate-400 font-semibold leading-relaxed">
                    * Zakat Mal dihitung dari total kekayaan mengendap selama 1 tahun (haul) meliputi kas, emas, perak, surat berharga, dan aset likuid lainnya.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider flex justify-between items-center">
                    <span>Harga Emas Saat Ini (IDR / Gram)</span>
                    <span className="text-[10px] text-slate-400 font-mono font-bold">Batas Nisab: 85 Gram Emas</span>
                  </label>
                  <input
                    type="number"
                    value={goldPrice}
                    onChange={(e) => setGoldPrice(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:bg-white rounded-xl px-4 py-2.5 text-xs font-mono font-black text-slate-800 outline-hidden transition"
                    placeholder="Contoh: 1100000"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-150/80 space-y-3">
                  <h4 className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Informasi Penghasilan (Zakat Profesi)</h4>
                  <div className="p-3.5 bg-white rounded-lg border border-slate-200 flex items-center justify-between text-xs">
                    <div>
                      <span className="text-slate-400 block font-bold text-[10px] uppercase tracking-wider">Pendapatan Terdeteksi (Bulan Ini)</span>
                      <strong className="text-slate-700 font-mono text-xs block mt-0.5 font-black">{formatterIDR.format(monthlyIncomeVal)}</strong>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 font-bold block">NISAB BULANAN</span>
                      <strong className="text-emerald-600 font-mono font-black block text-xs">{formatterIDR.format(monthlyNisabProfesi)}</strong>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider flex justify-between items-center">
                    <span>Penghasilan Bulanan (IDR)</span>
                    <button 
                      onClick={() => setCustomIncome(null)} 
                      disabled={customIncome === null}
                      className="text-[10px] text-blue-600 hover:text-blue-800 disabled:text-slate-300 font-black uppercase tracking-wider transition cursor-pointer"
                    >
                      Gunakan Nominal Riil
                    </button>
                  </label>
                  <input
                    type="number"
                    value={currentIncome}
                    onChange={(e) => setCustomIncome(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:bg-white rounded-xl px-4 py-2.5 text-xs font-mono font-black text-slate-800 outline-hidden transition"
                    placeholder="Masukkan nominal penghasilan bulanan"
                  />
                  <p className="text-[10px] text-slate-400 font-semibold leading-relaxed">
                    * Zakat Profesi (Penghasilan) dikeluarkan setiap bulan atau tahun jika pendapatan bersih telah melampaui nisab setara 522 kg perak atau 653 kg beras.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider flex justify-between items-center">
                    <span>Harga Beras Saat Ini (IDR / Kg)</span>
                    <span className="text-[10px] text-slate-400 font-mono font-bold">Batas Nisab: 653 Kg Beras / Tahun</span>
                  </label>
                  <input
                    type="number"
                    value={ricePrice}
                    onChange={(e) => setRicePrice(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:bg-white rounded-xl px-4 py-2.5 text-xs font-mono font-black text-slate-800 outline-hidden transition"
                    placeholder="Contoh: 13000"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Results Summary Box */}
          <div className="lg:col-span-5 flex flex-col justify-between">
            {zakatTab === 'mal' ? (
              <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-50/50 to-teal-50/30 border border-emerald-100 flex-1 flex flex-col justify-between space-y-4">
                <div className="space-y-3.5">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-full font-black uppercase tracking-wider">
                      Zakat Mal (Harta)
                    </span>
                    <span className="text-[10px] text-slate-400 font-bold uppercase">Kadar: 2.5%</span>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">Syarat Batas Nisab Mal</span>
                    <span className="text-xs text-slate-700 font-mono font-black block">
                      {formatterIDR.format(nisabMal)} <span className="text-[10px] font-bold text-slate-400 uppercase font-sans">(85g Emas)</span>
                    </span>
                  </div>

                  <div className="pt-2 border-t border-emerald-100/50 flex items-start gap-2.5">
                    {isMalEligible ? (
                      <div className="p-1 bg-emerald-100 text-emerald-700 rounded-lg">
                        <ShieldCheck className="h-4.5 w-4.5" />
                      </div>
                    ) : (
                      <div className="p-1 bg-slate-100 text-slate-500 rounded-lg">
                        <HelpCircle className="h-4.5 w-4.5" />
                      </div>
                    )}
                    <div>
                      <span className="text-xs font-black text-slate-700 block">Kewajiban Zakat</span>
                      <p className={`text-[11px] font-bold ${isMalEligible ? 'text-emerald-700' : 'text-slate-500'} leading-relaxed mt-0.5`}>
                        {isMalEligible 
                          ? 'Aset Anda SUDAH MELEBIHI nisab haul. Anda wajib membayar Zakat Mal sebesar 2.5%.' 
                          : 'Aset Anda belum mencapai batas nisab emas. Anda belum wajib zakat mal, namun dianjurkan bersedekah.'
                        }
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-emerald-100">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Potensi Zakat Mal Wajib</span>
                  <span className="text-xl font-black text-emerald-600 font-mono mt-1 block">
                    {formatterIDR.format(zakatMalAmount)}
                  </span>
                  <p className="text-[9px] text-slate-400 font-semibold mt-1 leading-relaxed">
                    * Bersihkan harta Anda dengan menyalurkannya kepada lembaga amil zakat terpercaya.
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-50/50 to-teal-50/30 border border-emerald-100 flex-1 flex flex-col justify-between space-y-4">
                <div className="space-y-3.5">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-full font-black uppercase tracking-wider">
                      Zakat Profesi (Bulanan)
                    </span>
                    <span className="text-[10px] text-slate-400 font-bold uppercase">Kadar: 2.5%</span>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">Syarat Batas Nisab Bulanan</span>
                    <span className="text-xs text-slate-700 font-mono font-black block">
                      {formatterIDR.format(monthlyNisabProfesi)} <span className="text-[10px] font-bold text-slate-400 uppercase font-sans">(54.4 Kg Beras)</span>
                    </span>
                  </div>

                  <div className="pt-2 border-t border-emerald-100/50 flex items-start gap-2.5">
                    {isProfesiEligible ? (
                      <div className="p-1 bg-emerald-100 text-emerald-700 rounded-lg">
                        <ShieldCheck className="h-4.5 w-4.5" />
                      </div>
                    ) : (
                      <div className="p-1 bg-slate-100 text-slate-500 rounded-lg">
                        <HelpCircle className="h-4.5 w-4.5" />
                      </div>
                    )}
                    <div>
                      <span className="text-xs font-black text-slate-700 block">Kewajiban Zakat</span>
                      <p className={`text-[11px] font-bold ${isProfesiEligible ? 'text-emerald-700' : 'text-slate-500'} leading-relaxed mt-0.5`}>
                        {isProfesiEligible 
                          ? 'Penghasilan bulanan Anda SUDAH MELEBIHI nisab bulanan. Anda wajib berzakat profesi.' 
                          : 'Penghasilan bulanan Anda di bawah nisab beras. Belum wajib berzakat profesi, silakan berinfaq sukarela.'
                        }
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-emerald-100">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Potensi Zakat Profesi Wajib</span>
                  <span className="text-xl font-black text-emerald-600 font-mono mt-1 block">
                    {formatterIDR.format(zakatProfesiAmount)}
                  </span>
                  <p className="text-[9px] text-slate-400 font-semibold mt-1 leading-relaxed">
                    * Zakat profesi dianjurkan untuk ditunaikan langsung saat menerima penghasilan bulanan.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
