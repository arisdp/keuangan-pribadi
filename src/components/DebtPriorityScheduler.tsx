import React, { useState, useMemo } from 'react';
import { Debt } from '../types';
import { FormattedNumberInput } from './FormattedNumberInput';
import { Flame, Snowflake, Sparkles, ShieldAlert, CheckCircle2, TrendingDown, Calendar, ArrowRight, DollarSign, Award, Clock, AlertTriangle, RefreshCw } from 'lucide-react';

interface DebtPrioritySchedulerProps {
  debts: Debt[];
}

interface DebtScheduleItem {
  id: string;
  name: string;
  balance: number;
  interestRate: number; // APR %
  minPayment: number;
  purpose?: string;
  rank: number;
  payoffMonths: number;
  payoffDate: string;
  totalInterestPaid: number;
  recommendedMonthlyPayment: number;
  strategyReason: string;
}

export const DebtPriorityScheduler: React.FC<DebtPrioritySchedulerProps> = ({ debts }) => {
  const [extraPayment, setExtraPayment] = useState<number>(500000); // Default 500k extra monthly snowball/avalanche buffer
  const [activeStrategy, setActiveStrategy] = useState<'avalanche' | 'snowball'>('avalanche');
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanCompleted, setScanCompleted] = useState<boolean>(true);

  const formatterIDR = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

  const activeDebts = useMemo(() => debts.filter((d) => d.balance > 0), [debts]);

  // Compute simulation for both Avalanche (highest APR first) and Snowball (lowest balance first)
  const computeSchedule = (strategy: 'avalanche' | 'snowball') => {
    if (activeDebts.length === 0) {
      return {
        scheduleList: [],
        totalMonths: 0,
        totalInterestPaid: 0,
        totalPaid: 0,
      };
    }

    // Sort debts based on strategy
    const sortedDebts = [...activeDebts].map((d) => ({
      ...d,
      currentBalance: d.balance,
      rate: (d.interestRate || 0) / 100 / 12, // monthly rate
      minPay: d.minPayment || (d as any).minimumPayment || Math.max(100000, d.balance * 0.03),
    }));

    if (strategy === 'avalanche') {
      // Highest interest rate APR first
      sortedDebts.sort((a, b) => (b.interestRate || 0) - (a.interestRate || 0));
    } else {
      // Smallest balance first
      sortedDebts.sort((a, b) => a.balance - b.balance);
    }

    // Month-by-month step simulator
    let month = 0;
    let totalInterestAccumulated = 0;
    let totalPaidAccumulated = 0;

    const debtStats: Record<string, { payoffMonth: number; totalInterest: number }> = {};
    sortedDebts.forEach((d) => {
      debtStats[d.id] = { payoffMonth: 0, totalInterest: 0 };
    });

    const activeList = sortedDebts.map((d) => ({ ...d }));

    while (activeList.some((d) => d.currentBalance > 0) && month < 360) {
      month++;

      // 1. Calculate interest for active debts
      activeList.forEach((d) => {
        if (d.currentBalance > 0) {
          const monthlyInterest = d.currentBalance * d.rate;
          d.currentBalance += monthlyInterest;
          debtStats[d.id].totalInterest += monthlyInterest;
          totalInterestAccumulated += monthlyInterest;
        }
      });

      // 2. Pay minimums
      let extraCash = extraPayment;

      activeList.forEach((d) => {
        if (d.currentBalance > 0) {
          const payAmt = Math.min(d.currentBalance, d.minPay);
          d.currentBalance -= payAmt;
          totalPaidAccumulated += payAmt;

          if (d.currentBalance <= 0) {
            d.currentBalance = 0;
            if (debtStats[d.id].payoffMonth === 0) {
              debtStats[d.id].payoffMonth = month;
            }
          }
        }
      });

      // 3. Throw extra cash at highest priority active debt
      const targetDebt = activeList.find((d) => d.currentBalance > 0);
      if (targetDebt && extraCash > 0) {
        const payAmt = Math.min(targetDebt.currentBalance, extraCash);
        targetDebt.currentBalance -= payAmt;
        totalPaidAccumulated += payAmt;
        extraCash -= payAmt;

        if (targetDebt.currentBalance <= 0) {
          targetDebt.currentBalance = 0;
          if (debtStats[targetDebt.id].payoffMonth === 0) {
            debtStats[targetDebt.id].payoffMonth = month;
          }
        }
      }
    }

    // Build formatted output list
    const now = new Date();

    const scheduleList: DebtScheduleItem[] = sortedDebts.map((d, index) => {
      const stats = debtStats[d.id];
      const payoffMonths = stats.payoffMonth || month;

      const payoffDate = new Date(now.getFullYear(), now.getMonth() + payoffMonths, 1);
      const payoffDateStr = payoffDate.toLocaleDateString('id-ID', {
        month: 'short',
        year: 'numeric',
      });

      const isFirst = index === 0;
      const recMonthly = isFirst ? d.minPay + extraPayment : d.minPay;

      let reason = '';
      if (strategy === 'avalanche') {
        reason = isFirst
          ? `Suku bunga tertinggi (${d.interestRate}% APR). Alokasikan cicilan utama + ekstra ${formatterIDR.format(extraPayment)}/bln untuk menekan beban bunga.`
          : `Bayar cicilan minimum (${formatterIDR.format(d.minPay)}) sampai utang prioritas sebelumnya lunas.`;
      } else {
        reason = isFirst
          ? `Saldo terkecil (${formatterIDR.format(d.balance)}). Fokus lunasi pertama untuk kemenangan finansial cepat.`
          : `Bayar cicilan minimum (${formatterIDR.format(d.minPay)}) sampai utang prioritas sebelumnya lunas.`;
      }

      return {
        id: d.id,
        name: d.name,
        balance: d.balance,
        interestRate: d.interestRate || 0,
        minPayment: d.minPay,
        purpose: d.purpose,
        rank: index + 1,
        payoffMonths,
        payoffDate: payoffDateStr,
        totalInterestPaid: Math.round(stats.totalInterest),
        recommendedMonthlyPayment: recMonthly,
        strategyReason: reason,
      };
    });

    return {
      scheduleList,
      totalMonths: month,
      totalInterestPaid: Math.round(totalInterestAccumulated),
      totalPaid: Math.round(totalPaidAccumulated),
    };
  };

  const avalancheRes = useMemo(() => computeSchedule('avalanche'), [activeDebts, extraPayment]);
  const snowballRes = useMemo(() => computeSchedule('snowball'), [activeDebts, extraPayment]);

  const currentRes = activeStrategy === 'avalanche' ? avalancheRes : snowballRes;

  const interestSavedByAvalanche = Math.max(0, snowballRes.totalInterestPaid - avalancheRes.totalInterestPaid);

  const handleScanDebts = () => {
    setIsScanning(true);
    setTimeout(() => {
      setIsScanning(false);
      setScanCompleted(true);
    }, 600);
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-6">
      {/* HEADER BANNER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-amber-500 to-rose-600 text-white rounded-2xl shadow-md">
            <Flame className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
              Pemindaian Utang & Penjadwalan Prioritas Pembayaran Bunga Minimal
              <span className="text-[10px] font-extrabold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                Interest Optimizer
              </span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Pemindai otomatis yang menyusun jadwal pelunasan utang prioritas untuk menekan total beban bunga.
            </p>
          </div>
        </div>

        {/* SCAN ACTION BUTTON */}
        <button
          onClick={handleScanDebts}
          disabled={isScanning || activeDebts.length === 0}
          className="px-4 py-2.5 bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center gap-2 cursor-pointer disabled:opacity-50 shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${isScanning ? 'animate-spin' : ''}`} />
          <span>{isScanning ? 'Pindai Portofolio Utang...' : 'Pindai Utang & Optimasi Sekarang'}</span>
        </button>
      </div>

      {activeDebts.length === 0 ? (
        <div className="p-8 text-center space-y-3 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-2xl border border-emerald-200 dark:border-emerald-800/60">
          <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
          <h4 className="text-sm font-extrabold text-emerald-900 dark:text-emerald-200">
            Selamat! Tidak Ada Entri Utang Aktif
          </h4>
          <p className="text-xs text-emerald-700 dark:text-emerald-300 max-w-md mx-auto">
            Portofolio Anda saat ini bebas dari kewajiban pinjaman. Pertahankan disiplin keuangan Anda dan tingkatkan alokasi ke portofolio investasi & dana darurat.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* SIMULATION INPUT & STRATEGY TOGGLE TOOLBAR */}
          <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Extra Payment Input */}
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 rounded-xl">
                <DollarSign className="w-5 h-5" />
              </div>
              <div>
                <label className="text-[10px] font-extrabold uppercase text-slate-500 dark:text-slate-400 block">
                  Uang Ekstra Pelunasan per Bulan (Buffer Cash)
                </label>
                <div className="w-48 mt-0.5">
                  <FormattedNumberInput
                    value={extraPayment}
                    onChange={(val) => setExtraPayment(typeof val === 'number' ? val : parseFloat(val) || 0)}
                    placeholder="Contoh: 500000"
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>

            {/* Strategy Buttons */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Strategi Prioritas:</span>
              <button
                onClick={() => setActiveStrategy('avalanche')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  activeStrategy === 'avalanche'
                    ? 'bg-amber-500 text-slate-950 font-black shadow-md'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                }`}
              >
                <Flame className="w-4 h-4 text-amber-900" />
                <span>Avalanche (Bunga APR)</span>
              </button>

              <button
                onClick={() => setActiveStrategy('snowball')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  activeStrategy === 'snowball'
                    ? 'bg-sky-500 text-white font-black shadow-md'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                }`}
              >
                <Snowflake className="w-4 h-4" />
                <span>Snowball (Saldo Terkecil)</span>
              </button>
            </div>
          </div>

          {/* KEY SUMMARY STATS BANNER */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1">
              <span className="text-[10px] font-extrabold uppercase text-slate-500 dark:text-slate-400 block">
                Total Estimasi Waktu Bebas Utang
              </span>
              <p className="text-base font-extrabold text-slate-800 dark:text-slate-100 font-mono">
                {Math.floor(currentRes.totalMonths / 12) > 0
                  ? `${Math.floor(currentRes.totalMonths / 12)} Thn `
                  : ''}
                {currentRes.totalMonths % 12} Bulan ({currentRes.totalMonths} Bulan Total)
              </p>
            </div>

            <div className="p-4 bg-rose-50/70 dark:bg-rose-950/30 rounded-xl border border-rose-200 dark:border-rose-800/60 space-y-1">
              <span className="text-[10px] font-extrabold uppercase text-rose-700 dark:text-rose-300 block">
                Total Beban Bunga Dibayar
              </span>
              <p className="text-base font-extrabold text-rose-800 dark:text-rose-200 font-mono">
                {formatterIDR.format(currentRes.totalInterestPaid)}
              </p>
            </div>

            <div className="p-4 bg-emerald-50/70 dark:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-800/60 space-y-1 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-extrabold uppercase text-emerald-700 dark:text-emerald-300 block">
                  Potensi Penghematan Bunga AI
                </span>
                <p className="text-base font-extrabold text-emerald-800 dark:text-emerald-200 font-mono">
                  {interestSavedByAvalanche > 0 ? formatterIDR.format(interestSavedByAvalanche) : 'Sudah Maksimal Optimal'}
                </p>
              </div>
              <Award className="w-8 h-8 text-emerald-600 shrink-0" />
            </div>
          </div>

          {/* PRIORITY PAYMENT SCHEDULE TABLE */}
          <div className="space-y-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>Jadwal Rekomendasi Alokasi Pembayaran Prioritas ({activeStrategy === 'avalanche' ? 'Avalanche Method' : 'Snowball Method'}):</span>
            </h4>

            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase">
                  <tr>
                    <th className="p-3 text-center">Urutan Prioritas</th>
                    <th className="p-3">Nama Akun Utang</th>
                    <th className="p-3">Saldo Utang</th>
                    <th className="p-3">Bunga APR</th>
                    <th className="p-3 font-semibold text-indigo-600 dark:text-indigo-400">Rekomendasi Bayar / Bln</th>
                    <th className="p-3">Target Bebas Utang</th>
                    <th className="p-3 text-right">Est. Beban Bunga</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                  {currentRes.scheduleList.map((item) => (
                    <tr
                      key={item.id}
                      className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition ${
                        item.rank === 1 ? 'bg-amber-50/40 dark:bg-amber-950/20' : ''
                      }`}
                    >
                      <td className="p-3 text-center">
                        <span
                          className={`px-2.5 py-0.5 rounded-full font-black text-[10px] ${
                            item.rank === 1
                              ? 'bg-amber-500 text-slate-950 shadow-2xs'
                              : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          #PRIORITAS {item.rank}
                        </span>
                      </td>

                      <td className="p-3 font-bold text-slate-800 dark:text-slate-100">
                        {item.name}
                        {item.rank === 1 && (
                          <span className="block text-[10px] font-extrabold text-amber-600 dark:text-amber-400">
                            ★ Target Fokus Utama
                          </span>
                        )}
                      </td>

                      <td className="p-3 font-mono font-bold text-slate-800 dark:text-slate-200">
                        {formatterIDR.format(item.balance)}
                      </td>

                      <td className="p-3 font-mono font-bold text-amber-600 dark:text-amber-400">
                        {item.interestRate}% APR
                      </td>

                      <td className="p-3 font-mono font-extrabold text-indigo-700 dark:text-indigo-300 bg-indigo-50/60 dark:bg-indigo-950/40 rounded-lg">
                        {formatterIDR.format(item.recommendedMonthlyPayment)}
                      </td>

                      <td className="p-3 font-mono font-bold text-slate-700 dark:text-slate-300">
                        {item.payoffDate} ({item.payoffMonths} Bln)
                      </td>

                      <td className="p-3 font-mono font-bold text-right text-rose-600 dark:text-rose-400">
                        {formatterIDR.format(item.totalInterestPaid)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* AI STRATEGY RECOMMENDATION SUMMARY BOX */}
            <div className="p-4 bg-indigo-50/60 dark:bg-indigo-950/30 rounded-xl border border-indigo-200 dark:border-indigo-800 space-y-2 text-xs">
              <div className="flex items-center gap-2 text-indigo-900 dark:text-indigo-200 font-extrabold uppercase">
                <Sparkles className="w-4 h-4 text-indigo-600" />
                <span>Rekomendasi Penjadwalan AI Gemini:</span>
              </div>
              <p className="text-indigo-800 dark:text-indigo-300 leading-relaxed">
                Prioritaskan melunasi <strong>{currentRes.scheduleList[0]?.name}</strong> dengan mengalokasikan seluruh uang ekstra sebesar <strong>{formatterIDR.format(extraPayment)}</strong> per bulan. Untuk utang lainnya, bayar cukup cicilan minimum agar reputasi kredit terjaga tanpa tertekan denda.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
