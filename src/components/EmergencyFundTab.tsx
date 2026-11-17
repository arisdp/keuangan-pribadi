import React, { useState } from 'react';
import { EmergencyFundConfig, EmergencyFundTransaction } from '../types';
import { FormattedNumberInput } from './FormattedNumberInput';
import { PiggyBank, Calculator, History, AlertTriangle, ShieldCheck, TrendingUp, Info, BarChart2, LineChart as LineChartIcon } from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ReferenceLine,
  AreaChart,
  Area,
  CartesianGrid,
  Cell
} from 'recharts';

interface EmergencyFundTabProps {
  config: EmergencyFundConfig;
  transactions: EmergencyFundTransaction[];
  onUpdateConfig: (config: EmergencyFundConfig) => void;
  onAddTransaction: (tx: Omit<EmergencyFundTransaction, 'id'>) => void;
  onDeleteTransaction: (id: string) => void;
}

export const EmergencyFundTab: React.FC<EmergencyFundTabProps> = ({
  config,
  transactions,
  onUpdateConfig,
  onAddTransaction,
  onDeleteTransaction,
}) => {
  // Calculator Form State
  const [jobStability, setJobStability] = useState<'high' | 'medium' | 'low'>(config.jobStability);
  const [dependents, setDependents] = useState<number>(config.dependents);
  const [monthlyExpense, setMonthlyExpense] = useState<string>(config.monthlyExpense.toString());
  const [chartViewMode, setChartViewMode] = useState<'milestones' | 'accumulation'>('milestones');

  // Ledger Form State
  const [txDate, setTxDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [txType, setTxType] = useState<'addition' | 'reduction'>('addition');
  const [txAmount, setTxAmount] = useState<string>('');
  const [txLocation, setTxLocation] = useState<string>('Reksadana Pasar Uang');
  const [txDesc, setTxDesc] = useState<string>('');

  // 1. Calculations
  const getMultiplier = (stability: 'high' | 'medium' | 'low') => {
    if (stability === 'high') return 3;
    if (stability === 'medium') return 6;
    return 9;
  };

  const multiplier = getMultiplier(jobStability);
  const totalMonthsMultiplier = multiplier + dependents;
  const parsedMonthlyExpense = parseFloat(monthlyExpense) || 0;
  const recommendedTarget = parsedMonthlyExpense * totalMonthsMultiplier;

  // Current balance
  const currentBalance = transactions.reduce((sum, tx) => {
    return tx.type === 'addition' ? sum + tx.amount : sum - tx.amount;
  }, 0);

  const progressPercentage = recommendedTarget > 0 ? (currentBalance / recommendedTarget) * 100 : 0;
  const progressClamped = Math.min(progressPercentage, 100);
  const gapAmount = Math.max(recommendedTarget - currentBalance, 0);

  const formatterIDR = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  });

  const formatShortIDR = (val: number) => {
    if (val >= 1_000_000_000) return `${(val / 1_000_000_000).toFixed(1)}M`;
    if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}Jt`;
    if (val >= 1_000) return `${(val / 1_000).toFixed(0)}rb`;
    return val.toString();
  };

  // Recharts Data 1: Milestones
  const milestoneData = [
    { name: '1 Bulan', target: parsedMonthlyExpense * 1, fill: '#64748b' },
    { name: '3 Bulan', target: parsedMonthlyExpense * 3, fill: '#3b82f6' },
    { name: '6 Bulan', target: parsedMonthlyExpense * 6, fill: '#6366f1' },
    { name: `Target (${totalMonthsMultiplier}B)`, target: recommendedTarget, fill: '#8b5cf6' },
    { name: 'Saldo Saat Ini', target: currentBalance, fill: currentBalance >= recommendedTarget ? '#10b981' : '#f59e0b' },
  ];

  // Recharts Data 2: Cumulative Accumulation Timeline
  const sortedTransactions = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
  let runningTotal = 0;
  const timelineData = sortedTransactions.map((tx) => {
    runningTotal += tx.type === 'addition' ? tx.amount : -tx.amount;
    return {
      date: tx.date,
      balance: runningTotal,
      target: recommendedTarget,
      description: tx.description || tx.location
    };
  });

  // If no transactions yet, provide a baseline node
  if (timelineData.length === 0) {
    timelineData.push({
      date: 'Awal',
      balance: 0,
      target: recommendedTarget,
      description: 'Mulai Menabung'
    });
  }

  const handleUpdateConfigSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateConfig({
      jobStability,
      dependents,
      monthlyExpense: parsedMonthlyExpense,
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* 1. Emergency Fund Calculator & Setup */}
      <div className="space-y-6 lg:col-span-1">
        
        {/* Kalkulator Dana Darurat */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Calculator className="h-5 w-5 text-blue-600" />
            <h3 className="font-semibold text-slate-800 text-sm uppercase tracking-wider">Kalkulator Dana Darurat</h3>
          </div>

          <form onSubmit={handleUpdateConfigSubmit} className="space-y-4">
            {/* Kestabilan Pekerjaan */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                <span>Stabilitas Pekerjaan</span>
                <span className="text-[10px] text-slate-400 capitalize font-normal">
                  (High: 3 bln, Med: 6 bln, Low: 9 bln)
                </span>
              </label>
              <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-lg">
                {(['high', 'medium', 'low'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setJobStability(s)}
                    className={`text-[10px] py-1.5 rounded-md font-bold uppercase transition cursor-pointer ${
                      jobStability === s 
                        ? 'bg-white text-blue-600 shadow-sm' 
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {s === 'high' ? 'Tinggi' : s === 'medium' ? 'Sedang' : 'Rendah'}
                  </button>
                ))}
              </div>
            </div>

            {/* Jumlah Tanggungan */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                Jumlah Tanggungan (+1 bln / orang)
              </label>
              <input
                type="number"
                min="0"
                max="10"
                value={dependents}
                onChange={(e) => setDependents(parseInt(e.target.value) || 0)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 font-semibold"
                required
              />
            </div>

            {/* Pengeluaran Bulanan Esensial */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                Pengeluaran Bulanan Esensial
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">Rp</span>
                <FormattedNumberInput
                  placeholder="0"
                  value={monthlyExpense}
                  onChange={(val) => setMonthlyExpense(val)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 font-semibold"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-4 rounded-lg text-xs uppercase tracking-wider transition cursor-pointer"
            >
              Simpan & Terapkan Kalkulasi
            </button>
          </form>

          {/* Kalkulasi Detil Box */}
          <div className="mt-5 p-4 bg-blue-50 rounded-lg border border-blue-100 text-xs text-blue-950 space-y-2">
            <div className="flex justify-between">
              <span>Faktor Risiko Pekerjaan:</span>
              <strong className="capitalize">{multiplier} Bulan Pengeluaran</strong>
            </div>
            <div className="flex justify-between">
              <span>Tambahan Tanggungan:</span>
              <strong>{dependents} Bulan Pengeluaran</strong>
            </div>
            <div className="border-t border-blue-200 pt-2 flex justify-between font-bold text-sm">
              <span>Total Rasio Kelipatan:</span>
              <span>{totalMonthsMultiplier}x Pengeluaran Bulanan</span>
            </div>
          </div>
        </div>

      </div>

      {/* 2. Visual Progress & Deposit Tracker Form */}
      <div className="space-y-6 lg:col-span-2">
        
        {/* Progress & Target Status Card */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <PiggyBank className="h-5 w-5 text-blue-600" />
              <h3 className="font-semibold text-slate-800 text-sm uppercase tracking-wider">Status Kesehatan Dana Darurat</h3>
            </div>

            {/* Toggle Recharts View */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs font-bold">
              <button
                onClick={() => setChartViewMode('milestones')}
                className={`px-2.5 py-1 rounded-md transition flex items-center gap-1.5 cursor-pointer ${
                  chartViewMode === 'milestones' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <BarChart2 className="h-3.5 w-3.5" />
                <span>Level Target</span>
              </button>
              <button
                onClick={() => setChartViewMode('accumulation')}
                className={`px-2.5 py-1 rounded-md transition flex items-center gap-1.5 cursor-pointer ${
                  chartViewMode === 'accumulation' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <LineChartIcon className="h-3.5 w-3.5" />
                <span>Tren Akumulasi</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
            {/* Circular Progress Gauge */}
            <div className="flex flex-col items-center justify-center p-4 border-r border-slate-100 last:border-0 md:col-span-1">
              <div className="relative w-28 h-28 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                  <path
                    className="text-slate-100"
                    strokeWidth="3.5"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  <path
                    className={`${progressPercentage >= 100 ? 'text-emerald-500' : 'text-blue-600'} transition-all duration-1000`}
                    strokeDasharray={`${progressClamped}, 100`}
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
                <div className="absolute text-center">
                  <span className="text-xl font-black text-slate-800 font-mono">
                    {Math.round(progressPercentage)}%
                  </span>
                </div>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-3 uppercase tracking-wider">Tingkat Aman</p>
            </div>

            {/* Balances Status */}
            <div className="md:col-span-2 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Terkumpul Saat Ini</span>
                  <p className="text-base font-bold text-slate-800 font-mono mt-1">
                    {formatterIDR.format(currentBalance)}
                  </p>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Target Ideal Keamanan</span>
                  <p className="text-base font-bold text-slate-800 font-mono mt-1">
                    {formatterIDR.format(recommendedTarget)}
                  </p>
                </div>
              </div>

              {gapAmount > 0 ? (
                <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg text-xs flex items-center gap-2.5">
                  <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                  <span>
                    Anda masih membutuhkan <strong>{formatterIDR.format(gapAmount)}</strong> lagi untuk mencapai zona aman finansial keluarga Anda.
                  </span>
                </div>
              ) : (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-lg text-xs flex items-center gap-2.5">
                  <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span>
                    <strong>Luar biasa!</strong> Dana darurat Anda sudah terpenuhi 100% dan berada di level aman stabil terhadap risiko pekerjaan.
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Recharts Visual Section */}
          <div className="pt-4 border-t border-slate-100">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
              {chartViewMode === 'milestones' ? 'Visual Perbandingan Level Target Dana Darurat' : 'Grafik Riwayat Akumulasi Dana Darurat'}
            </h4>

            <div className="h-56 w-full bg-slate-50/70 p-3 rounded-xl border border-slate-150">
              <ResponsiveContainer width="100%" height="100%">
                {chartViewMode === 'milestones' ? (
                  <BarChart data={milestoneData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={formatShortIDR} tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <Tooltip
                      formatter={(val: any) => [formatterIDR.format(Number(val)), 'Nominal']}
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', color: '#f8fafc', fontSize: '11px' }}
                    />
                    <Bar dataKey="target" radius={[6, 6, 0, 0]}>
                      {milestoneData.map((entry, idx) => (
                        <Cell key={`cell-${idx}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                ) : (
                  <AreaChart data={timelineData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="balanceGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={formatShortIDR} tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <Tooltip
                      formatter={(val: any) => [formatterIDR.format(Number(val)), 'Saldo Akumulasi']}
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', color: '#f8fafc', fontSize: '11px' }}
                    />
                    {recommendedTarget > 0 && (
                      <ReferenceLine y={recommendedTarget} stroke="#8b5cf6" strokeDasharray="3 3" label={{ value: 'Target Ideal', fill: '#8b5cf6', fontSize: 10 }} />
                    )}
                    <Area type="monotone" dataKey="balance" stroke="#3b82f6" strokeWidth={2.5} fillOpacity={1} fill="url(#balanceGrad)" />
                  </AreaChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>

        </div>

        {/* Deposit/Withdraw Form & History Log */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-4 justify-between">
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-blue-600" />
              <h3 className="font-semibold text-slate-800 text-sm uppercase tracking-wider">Pencatatan Penyetoran / Mutasi</h3>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Guidance Info Panel */}
            <div className="md:col-span-1 p-5 bg-slate-900 text-white rounded-xl border border-slate-850 shadow-md space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
                <Info className="h-5 w-5 text-blue-400" />
                <h3 className="font-semibold text-xs uppercase tracking-wider text-slate-100">
                  Mutasi Terpusat
                </h3>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                Pencatatan mutasi masuk dan keluar untuk Dana Darurat sekarang terintegrasi dan dilakukan secara terpadu melalui menu <strong>Jurnal Transaksi</strong>.
              </p>
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-850 space-y-1">
                <span className="text-[9px] uppercase font-bold text-emerald-400 block">
                  1. Menabung Dana Darurat
                </span>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Log transaksi tipe <strong>Tabungan (Saving)</strong> dengan Kategori <strong>"Tabungan Darurat"</strong>. Dana akan otomatis ditarik dari rekening pilihan Anda dan ditambahkan di sini.
                </p>
              </div>
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-850 space-y-1">
                <span className="text-[9px] uppercase font-bold text-rose-400 block">
                  2. Menarik Dana Darurat
                </span>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Log transaksi tipe <strong>Pemasukan (Income)</strong> dengan Kategori <strong>"Pencairan Dana Darurat"</strong> untuk mencairkan tabungan kembali ke rekening kas utama Anda.
                </p>
              </div>
            </div>

            {/* List Log */}
            <div className="md:col-span-2 space-y-3 max-h-96 overflow-y-auto pr-1">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Riwayat Pencatatan</h4>
              {transactions.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-xs">
                  Belum ada catatan mutasi dana darurat.
                </div>
              ) : (
                transactions.slice().reverse().map(tx => (
                  <div key={tx.id} className="flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 transition rounded-lg border border-slate-100 text-xs">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <span className={`inline-block px-1.5 py-0.5 rounded font-bold uppercase text-[8px] ${
                          tx.type === 'addition' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                        }`}>
                          {tx.type === 'addition' ? 'Masuk' : 'Keluar'}
                        </span>
                        <strong className="text-slate-800">{tx.location}</strong>
                      </div>
                      <p className="text-slate-500">{tx.description}</p>
                      <span className="text-[10px] text-slate-400 font-mono">{tx.date}</span>
                    </div>

                    <div className="text-right flex items-center gap-3">
                      <span className={`font-bold font-mono ${tx.type === 'addition' ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {tx.type === 'addition' ? '+' : '-'} {formatterIDR.format(tx.amount)}
                      </span>
                      <button
                        onClick={() => onDeleteTransaction(tx.id)}
                        className="p-1 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded transition cursor-pointer"
                        title="Hapus Catatan"
                      >
                        &times;
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
