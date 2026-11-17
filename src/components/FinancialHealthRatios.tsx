import React, { useMemo } from 'react';
import { Transaction, Account, Debt, InvestmentAsset } from '../types';
import { 
  Activity, 
  Award, 
  ShieldCheck, 
  AlertTriangle, 
  CheckCircle2, 
  TrendingUp, 
  Sparkles, 
  Scale, 
  Info,
  DollarSign,
  PieChart
} from 'lucide-react';

interface FinancialHealthRatiosProps {
  transactions: Transaction[];
  accounts: Account[];
  debts: Debt[];
  investments: InvestmentAsset[];
}

const formatterIDR = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

export const FinancialHealthRatios: React.FC<FinancialHealthRatiosProps> = ({
  transactions,
  accounts,
  debts,
  investments,
}) => {
  // CALCULATIONS FOR CFP METRICS & RATIOS
  const metrics = useMemo(() => {
    // 1. Monthly Income (this month or average)
    const now = new Date();
    const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    // Valid transactions excluding internal transfers
    const validTxs = transactions.filter(
      (tx) => tx.category !== 'Mutasi Masuk' && tx.category !== 'Mutasi Keluar'
    );

    const monthlyIncome = validTxs
      .filter((tx) => tx.type === 'income' && tx.date.startsWith(currentYM))
      .reduce((sum, tx) => sum + tx.amount, 0);

    const monthlyExpense = validTxs
      .filter((tx) => tx.type === 'expense' && tx.date.startsWith(currentYM))
      .reduce((sum, tx) => sum + tx.amount, 0);

    const monthlySavingsAndInvest = validTxs
      .filter((tx) => (tx.type === 'saving' || tx.type === 'investment') && tx.date.startsWith(currentYM))
      .reduce((sum, tx) => sum + tx.amount, 0);

    // Monthly Debt Service (from debts min payment or monthly debt expenses)
    const monthlyDebtService = debts.reduce((sum, d) => sum + d.minPayment, 0);

    // Liquid Cash & Bank Assets
    const liquidCash = accounts
      .filter((a) => a.type !== 'credit-card' && a.type !== 'paylater')
      .reduce((sum, a) => sum + a.currentBalance, 0);

    // Total Assets (Liquid + Investments)
    const totalInvestmentValue = investments.reduce((sum, inv) => sum + inv.balance, 0);
    const totalAssets = liquidCash + totalInvestmentValue;

    // Total Liabilities (Credit Cards + Paylater + Debts)
    const totalLiabilities = debts.reduce((sum, d) => sum + d.balance, 0) +
      accounts
        .filter((a) => a.type === 'credit-card' || a.type === 'paylater')
        .reduce((sum, a) => sum + Math.abs(a.currentBalance), 0);

    // Net Worth
    const netWorth = totalAssets - totalLiabilities;

    // --- RATIO 1: DEBT-TO-INCOME (DTI) ---
    const dtiRatio = monthlyIncome > 0 ? (monthlyDebtService / monthlyIncome) * 100 : 0;
    let dtiStatus: 'ideal' | 'warning' | 'danger' = 'ideal';
    if (dtiRatio > 40) dtiStatus = 'danger';
    else if (dtiRatio > 30) dtiStatus = 'warning';

    // --- RATIO 2: SAVINGS RATIO ---
    const savingsRatio = monthlyIncome > 0 ? (monthlySavingsAndInvest / monthlyIncome) * 100 : 0;
    let savingsStatus: 'ideal' | 'warning' | 'danger' = 'ideal';
    if (savingsRatio < 10) savingsStatus = 'danger';
    else if (savingsRatio < 20) savingsStatus = 'warning';

    // --- RATIO 3: EMERGENCY FUND COVERAGE (MONTHS) ---
    const emergencyMonths = monthlyExpense > 0 ? liquidCash / monthlyExpense : 0;
    let emergencyStatus: 'ideal' | 'warning' | 'danger' = 'ideal';
    if (emergencyMonths < 3) emergencyStatus = 'danger';
    else if (emergencyMonths < 6) emergencyStatus = 'warning';

    // --- RATIO 4: LIQUIDITY RATIO ---
    const currentLiabilities = accounts
      .filter((a) => a.type === 'credit-card' || a.type === 'paylater')
      .reduce((sum, a) => sum + Math.abs(a.currentBalance), 0);

    const liquidityRatio = currentLiabilities > 0 ? liquidCash / currentLiabilities : 99;
    let liquidityStatus: 'ideal' | 'warning' | 'danger' = 'ideal';
    if (liquidityRatio < 1.0) liquidityStatus = 'danger';
    else if (liquidityRatio < 1.5) liquidityStatus = 'warning';

    // --- RATIO 5: SOLVENCY RATIO ---
    const solvencyRatio = totalAssets > 0 ? (netWorth / totalAssets) * 100 : 100;

    // OVERALL HEALTH SCORE (0 - 100)
    let score = 100;
    if (dtiStatus === 'danger') score -= 25;
    else if (dtiStatus === 'warning') score -= 12;

    if (savingsStatus === 'danger') score -= 25;
    else if (savingsStatus === 'warning') score -= 12;

    if (emergencyStatus === 'danger') score -= 25;
    else if (emergencyStatus === 'warning') score -= 12;

    if (liquidityStatus === 'danger') score -= 25;
    else if (liquidityStatus === 'warning') score -= 12;

    score = Math.max(0, Math.min(100, score));

    return {
      monthlyIncome,
      monthlyExpense,
      monthlyDebtService,
      liquidCash,
      totalAssets,
      totalLiabilities,
      netWorth,
      dtiRatio,
      dtiStatus,
      savingsRatio,
      savingsStatus,
      emergencyMonths,
      emergencyStatus,
      liquidityRatio,
      liquidityStatus,
      solvencyRatio,
      score,
    };
  }, [transactions, accounts, debts, investments]);

  return (
    <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-md space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-tr from-emerald-600 via-teal-600 to-cyan-500 text-white rounded-2xl shadow-sm">
            <Activity className="h-6 w-6" />
          </div>
          <div>
            <h3 className="font-extrabold text-slate-900 dark:text-slate-100 text-base flex items-center gap-2">
              <span>Dashboard Kesehatan Finansial (CFP Benchmark)</span>
              <span className="px-2.5 py-0.5 bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-[10px] font-black rounded-full uppercase border border-emerald-300 dark:border-emerald-800">
                CFP Ratios
              </span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Analisis rasio kecukupan modal, fleksibilitas kas, dan manajemen utang berdasarkan standar Certified Financial Planner.
            </p>
          </div>
        </div>

        {/* Health Score Pill */}
        <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800/80 px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
            Skor Finansial:
          </span>
          <span className={`text-lg font-black font-mono px-3 py-0.5 rounded-xl text-white shadow-xs ${
            metrics.score >= 80 ? 'bg-emerald-600' : metrics.score >= 50 ? 'bg-amber-500' : 'bg-rose-600'
          }`}>
            {metrics.score} / 100
          </span>
        </div>
      </div>

      {/* Ratios Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Debt-to-Income (DTI) */}
        <div className={`p-5 rounded-2xl border space-y-3 transition ${
          metrics.dtiStatus === 'ideal' 
            ? 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800' 
            : metrics.dtiStatus === 'warning'
            ? 'bg-amber-50/60 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800'
            : 'bg-rose-50/60 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800'
        }`}>
          <div className="flex items-center justify-between text-xs font-extrabold uppercase">
            <span className="text-slate-600 dark:text-slate-300">Debt-to-Income (DTI)</span>
            <span className={`px-2 py-0.5 rounded-md text-[10px] ${
              metrics.dtiStatus === 'ideal' ? 'bg-emerald-200 text-emerald-900 font-black' : metrics.dtiStatus === 'warning' ? 'bg-amber-200 text-amber-900 font-black' : 'bg-rose-200 text-rose-900 font-black'
            }`}>
              {metrics.dtiStatus === 'ideal' ? 'Sangat Sehat' : metrics.dtiStatus === 'warning' ? 'Waspada' : 'Bahaya'}
            </span>
          </div>

          <div className="space-y-1">
            <span className="text-2xl font-black font-mono text-slate-900 dark:text-slate-100 block">
              {metrics.dtiRatio.toFixed(1)}%
            </span>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">
              Beban Cicilan: {formatterIDR.format(metrics.monthlyDebtService)} / bln
            </p>
          </div>

          <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-300 font-medium leading-relaxed">
            Target Benchmark: <strong>&le; 30%</strong> dari total pendapatan.
          </div>
        </div>

        {/* Card 2: Savings Ratio */}
        <div className={`p-5 rounded-2xl border space-y-3 transition ${
          metrics.savingsStatus === 'ideal' 
            ? 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800' 
            : metrics.savingsStatus === 'warning'
            ? 'bg-amber-50/60 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800'
            : 'bg-rose-50/60 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800'
        }`}>
          <div className="flex items-center justify-between text-xs font-extrabold uppercase">
            <span className="text-slate-600 dark:text-slate-300">Rasio Tabungan & Investasi</span>
            <span className={`px-2 py-0.5 rounded-md text-[10px] ${
              metrics.savingsStatus === 'ideal' ? 'bg-emerald-200 text-emerald-900 font-black' : metrics.savingsStatus === 'warning' ? 'bg-amber-200 text-amber-900 font-black' : 'bg-rose-200 text-rose-900 font-black'
            }`}>
              {metrics.savingsStatus === 'ideal' ? 'Sangat Sehat' : metrics.savingsStatus === 'warning' ? 'Waspada' : 'Kurang'}
            </span>
          </div>

          <div className="space-y-1">
            <span className="text-2xl font-black font-mono text-slate-900 dark:text-slate-100 block">
              {metrics.savingsRatio.toFixed(1)}%
            </span>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">
              Persentase pemasukan disimpan/diinvestasikan
            </p>
          </div>

          <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-300 font-medium leading-relaxed">
            Target Benchmark: <strong>&ge; 20%</strong> alokasi rutin bulanan.
          </div>
        </div>

        {/* Card 3: Emergency Fund Coverage */}
        <div className={`p-5 rounded-2xl border space-y-3 transition ${
          metrics.emergencyStatus === 'ideal' 
            ? 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800' 
            : metrics.emergencyStatus === 'warning'
            ? 'bg-amber-50/60 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800'
            : 'bg-rose-50/60 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800'
        }`}>
          <div className="flex items-center justify-between text-xs font-extrabold uppercase">
            <span className="text-slate-600 dark:text-slate-300">Cakupan Dana Darurat</span>
            <span className={`px-2 py-0.5 rounded-md text-[10px] ${
              metrics.emergencyStatus === 'ideal' ? 'bg-emerald-200 text-emerald-900 font-black' : metrics.emergencyStatus === 'warning' ? 'bg-amber-200 text-amber-900 font-black' : 'bg-rose-200 text-rose-900 font-black'
            }`}>
              {metrics.emergencyStatus === 'ideal' ? 'Aman' : metrics.emergencyStatus === 'warning' ? 'Cukup' : 'Kritis'}
            </span>
          </div>

          <div className="space-y-1">
            <span className="text-2xl font-black font-mono text-slate-900 dark:text-slate-100 block">
              {metrics.emergencyMonths.toFixed(1)} Bulan
            </span>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">
              Kas Likuid: {formatterIDR.format(metrics.liquidCash)}
            </p>
          </div>

          <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-300 font-medium leading-relaxed">
            Target Benchmark: <strong>3 - 6 Bulan</strong> pengeluaran rutin.
          </div>
        </div>

        {/* Card 4: Liquidity Ratio */}
        <div className={`p-5 rounded-2xl border space-y-3 transition ${
          metrics.liquidityStatus === 'ideal' 
            ? 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800' 
            : metrics.liquidityStatus === 'warning'
            ? 'bg-amber-50/60 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800'
            : 'bg-rose-50/60 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800'
        }`}>
          <div className="flex items-center justify-between text-xs font-extrabold uppercase">
            <span className="text-slate-600 dark:text-slate-300">Rasio Likuiditas Kas</span>
            <span className={`px-2 py-0.5 rounded-md text-[10px] ${
              metrics.liquidityStatus === 'ideal' ? 'bg-emerald-200 text-emerald-900 font-black' : metrics.liquidityStatus === 'warning' ? 'bg-amber-200 text-amber-900 font-black' : 'bg-rose-200 text-rose-900 font-black'
            }`}>
              {metrics.liquidityStatus === 'ideal' ? 'Sangat Aman' : metrics.liquidityStatus === 'warning' ? 'Pas' : 'Risiko'}
            </span>
          </div>

          <div className="space-y-1">
            <span className="text-2xl font-black font-mono text-slate-900 dark:text-slate-100 block">
              {metrics.liquidityRatio === 99 ? '∞' : metrics.liquidityRatio.toFixed(2)}x
            </span>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">
              Daya bayar kewajiban jangka pendek
            </p>
          </div>

          <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-300 font-medium leading-relaxed">
            Target Benchmark: <strong>&ge; 1.5x</strong> dari utang lancar.
          </div>
        </div>
      </div>

      {/* Advisory Note */}
      <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 rounded-2xl flex items-start gap-3 text-xs text-slate-700 dark:text-slate-300 font-medium">
        <Sparkles className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <strong className="text-slate-900 dark:text-slate-100 block">Rekomendasi Strategis Perencana Keuangan:</strong>
          <p className="leading-relaxed">
            {metrics.score >= 80 
              ? 'Kondisi kesehatan keuangan Anda berada dalam kategori prima! Pertahankan alokasi pertumbuhan aset secara berkala dan diversifikasikan ke instrumen investasi berimbal hasil optimal.'
              : metrics.score >= 50
              ? 'Kondisi keuangan berada dalam taraf stabil namun memerlukan penyesuaian pada porsi utang atau porsi tabungan rutin agar mencapai kemandirian finansial yang kokoh.'
              : 'Disarankan untuk meninjau kembali pengeluaran konsumtif, menghentikan penambahan utang baru, serta memfokuskan alokasi arus kas pada pemulihan dana darurat.'
            }
          </p>
        </div>
      </div>
    </div>
  );
};
