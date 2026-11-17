import React, { useState, useMemo } from 'react';
import { Account, CategoryBudget, AccountType, Transaction } from '../types';
import { CategoryNode, flattenCategoryHierarchy } from '../categoryHierarchy';
import { FormattedNumberInput } from './FormattedNumberInput';
import { BudgetRebalancingCard } from './BudgetRebalancingCard';
import { Wallet, Settings, Pencil, Plus, Trash2, ShieldAlert, BarChart3, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Info, Filter, ArrowUpRight, Flame, ShieldCheck } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';

interface BudgetTabProps {
  accounts: Account[];
  budgets: CategoryBudget[];
  transactions: Transaction[];
  masterCategories?: CategoryNode[];
  onUpdateAccountBalance: (accountId: string, newStartingBalance: number) => void;
  onAddAccount: (name: string, type: AccountType, startingBalance: number) => void;
  onDeleteAccount: (accountId: string) => void;
  onUpdateBudgetLimit: (category: string, newLimit: number) => void;
  onAddBudgetCategory: (category: string, type: 'expense' | 'saving' | 'investment', limit: number) => void;
  onDeleteBudgetCategory: (category: string) => void;
}

export const BudgetTab: React.FC<BudgetTabProps> = ({
  accounts,
  budgets,
  transactions,
  masterCategories = [],
  onUpdateAccountBalance,
  onAddAccount,
  onDeleteAccount,
  onUpdateBudgetLimit,
  onAddBudgetCategory,
  onDeleteBudgetCategory,
}) => {
  // Add Account states
  const [newAccName, setNewAccName] = useState('');
  const [newAccType, setNewAccType] = useState<AccountType>('bank');
  const [newAccBalance, setNewAccBalance] = useState('');

  // Add Budget states
  const [newBudCat, setNewBudCat] = useState('');
  const [newBudType, setNewBudType] = useState<'expense' | 'saving' | 'investment'>('expense');
  const [newBudLimit, setNewBudLimit] = useState('');

  // Filter states for Real-time Budget Comparison Chart
  const now = new Date();
  const defaultMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [selectedMonth, setSelectedMonth] = useState<string>(defaultMonthStr);
  const [filterType, setFilterType] = useState<'all' | 'expense' | 'saving' | 'investment'>('expense');

  // MODE FOKUS STATES & ALERTS
  const [isFocusModeActive, setIsFocusModeActive] = useState<boolean>(true);
  const [isFocusModalOpen, setIsFocusModalOpen] = useState<boolean>(true);
  const [dismissedFocusAlerts, setDismissedFocusAlerts] = useState<string[]>([]);

  const formatterIDR = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  });

  const handleAddAccountSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccName || !newAccBalance || parseFloat(newAccBalance) < 0) {
      alert('Mohon isi nama akun dan saldo awal dengan benar.');
      return;
    }
    onAddAccount(newAccName, newAccType, parseFloat(newAccBalance));
    setNewAccName('');
    setNewAccBalance('');
  };

  const handleAddBudgetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBudCat || !newBudLimit || parseFloat(newBudLimit) < 0) {
      alert('Mohon isi nama kategori dan batas limit anggaran dengan benar.');
      return;
    }
    onAddBudgetCategory(newBudCat, newBudType, parseFloat(newBudLimit));
    setNewBudCat('');
    setNewBudLimit('');
  };

  // Compute actual vs budget comparison list
  const budgetComparisonList = useMemo(() => {
    const filteredBudgets = filterType === 'all' 
      ? budgets 
      : budgets.filter(b => b.type === filterType);

    return filteredBudgets.map((b) => {
      const actualSpent = transactions
        .filter((t) => {
          const isCategoryMatch = t.category.toLowerCase() === b.category.toLowerCase();
          const isTypeMatch = t.type === b.type;
          const isMonthMatch = selectedMonth ? t.date.startsWith(selectedMonth) : true;
          return isCategoryMatch && isTypeMatch && isMonthMatch;
        })
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);

      const percentage = b.limit > 0 ? Math.round((actualSpent / b.limit) * 100) : 0;
      const remaining = b.limit - actualSpent;
      const isOver = actualSpent > b.limit;

      let status: 'safe' | 'warning' | 'danger' = 'safe';
      if (percentage >= 100) status = 'danger';
      else if (percentage >= 80) status = 'warning';

      return {
        category: b.category,
        type: b.type,
        limit: b.limit,
        actualSpent,
        remaining,
        percentage,
        isOver,
        status,
      };
    });
  }, [budgets, transactions, selectedMonth, filterType]);

  // Overall Summary Metrics
  const summaryMetrics = useMemo(() => {
    const totalLimit = budgetComparisonList.reduce((sum, item) => sum + item.limit, 0);
    const totalSpent = budgetComparisonList.reduce((sum, item) => sum + item.actualSpent, 0);
    const overallPercentage = totalLimit > 0 ? Math.round((totalSpent / totalLimit) * 100) : 0;
    const overBudgetCount = budgetComparisonList.filter((item) => item.isOver).length;
    const remainingTotal = totalLimit - totalSpent;

    return {
      totalLimit,
      totalSpent,
      remainingTotal,
      overallPercentage,
      overBudgetCount,
    };
  }, [budgetComparisonList]);

  // MODE FOKUS: Categories that reached or exceeded 90% limit
  const focusAlertCategories = useMemo(() => {
    return budgetComparisonList.filter((item) => item.percentage >= 90 && item.limit > 0);
  }, [budgetComparisonList]);

  // Prepare chart dataset for Recharts
  const chartData = useMemo(() => {
    return budgetComparisonList.map((item) => ({
      name: item.category,
      'Limit Anggaran': item.limit,
      'Realisasi Aktual': item.actualSpent,
      percentage: item.percentage,
      status: item.status,
      remaining: item.remaining,
    }));
  }, [budgetComparisonList]);

  return (
    <div className="space-y-8">
      {/* REAL-TIME BUDGET VS ACTUAL COMPARISON DASHBOARD */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 p-6 rounded-2xl text-white shadow-xl border border-slate-700/60 space-y-6">
        {/* Header and Control Toolbar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-700/60 pb-5">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-500/20 border border-blue-400/30 rounded-2xl text-blue-400 shadow-inner">
              <BarChart3 className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-base font-black tracking-tight text-white flex items-center gap-2">
                Grafik Perbandingan Real-Time Anggaran vs Pengeluaran
                <span className="text-[10px] font-extrabold bg-blue-500/30 text-blue-300 border border-blue-400/30 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                  Disiplin Keuangan
                </span>
              </h3>
              <p className="text-xs text-slate-300 font-medium mt-0.5">
                Pantau deviasi antara batas limit anggaran bulanan dan realisasi transaksi aktual secara langsung.
              </p>
            </div>
          </div>

          {/* Month & Category Type Selectors & Mode Fokus Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Mode Fokus Toggle Button */}
            <button
              type="button"
              onClick={() => {
                const nextState = !isFocusModeActive;
                setIsFocusModeActive(nextState);
                if (nextState) setIsFocusModalOpen(true);
              }}
              className={`px-3 py-1.5 rounded-xl border text-xs font-black transition flex items-center gap-1.5 cursor-pointer ${
                isFocusModeActive
                  ? 'bg-amber-500/20 text-amber-300 border-amber-400/50 hover:bg-amber-500/30 shadow-xs'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
              }`}
              title="Toggle Mode Fokus Peringatan 90% Batas Anggaran"
            >
              <ShieldAlert className={`h-4 w-4 ${isFocusModeActive ? 'text-amber-400 animate-pulse' : 'text-slate-500'}`} />
              <span>Mode Fokus: {isFocusModeActive ? 'AKTIF' : 'NONAKTIF'}</span>
            </button>

            {/* Peringatan Pop-up Button if active alerts exist */}
            {isFocusModeActive && focusAlertCategories.length > 0 && (
              <button
                type="button"
                onClick={() => setIsFocusModalOpen(true)}
                className="px-3 py-1.5 bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white rounded-xl font-extrabold text-xs shadow-md border border-rose-400/40 transition flex items-center gap-1.5 animate-bounce cursor-pointer"
              >
                <AlertTriangle className="h-4 w-4 text-white" />
                <span>Pop-Up Peringatan ({focusAlertCategories.length})</span>
              </button>
            )}

            {/* Month picker */}
            <div className="flex items-center gap-1.5 bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700">
              <span className="text-[11px] font-bold text-slate-400">Bulan:</span>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer"
              />
            </div>

            {/* Type selector */}
            <div className="flex items-center gap-1 bg-slate-800/80 p-1 rounded-xl border border-slate-700">
              <button
                type="button"
                onClick={() => setFilterType('expense')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  filterType === 'expense'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Pengeluaran
              </button>
              <button
                type="button"
                onClick={() => setFilterType('saving')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  filterType === 'saving'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Tabungan
              </button>
              <button
                type="button"
                onClick={() => setFilterType('investment')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  filterType === 'investment'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Investasi
              </button>
              <button
                type="button"
                onClick={() => setFilterType('all')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  filterType === 'all'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Semua
              </button>
            </div>
          </div>
        </div>

        {/* SUMMARY METRIC CARDS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 bg-slate-800/70 border border-slate-700/80 rounded-2xl space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Total Limit Anggaran
            </span>
            <div className="text-lg font-black text-white">
              {formatterIDR.format(summaryMetrics.totalLimit)}
            </div>
            <p className="text-[11px] text-slate-400">
              Batas alokasi {filterType === 'all' ? 'semua' : filterType}
            </p>
          </div>

          <div className="p-4 bg-slate-800/70 border border-slate-700/80 rounded-2xl space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Realisasi Aktual ({selectedMonth})
            </span>
            <div className={`text-lg font-black ${summaryMetrics.totalSpent > summaryMetrics.totalLimit ? 'text-rose-400' : 'text-emerald-400'}`}>
              {formatterIDR.format(summaryMetrics.totalSpent)}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] font-bold">
              <span className={`px-1.5 py-0.2 rounded ${summaryMetrics.overallPercentage >= 100 ? 'bg-rose-500/30 text-rose-300' : 'bg-emerald-500/30 text-emerald-300'}`}>
                {summaryMetrics.overallPercentage}% Terpakai
              </span>
            </div>
          </div>

          <div className="p-4 bg-slate-800/70 border border-slate-700/80 rounded-2xl space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Sisa Anggaran / Defisit
            </span>
            <div className={`text-lg font-black ${summaryMetrics.remainingTotal < 0 ? 'text-rose-400' : 'text-teal-300'}`}>
              {summaryMetrics.remainingTotal < 0 ? `Defisit -${formatterIDR.format(Math.abs(summaryMetrics.remainingTotal))}` : formatterIDR.format(summaryMetrics.remainingTotal)}
            </div>
            <p className="text-[11px] text-slate-400">
              {summaryMetrics.remainingTotal < 0 ? 'Melebihi alokasi total' : 'Saldo aman tersisa'}
            </p>
          </div>

          <div className="p-4 bg-slate-800/70 border border-slate-700/80 rounded-2xl space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Status Disiplin
            </span>
            <div className="flex items-center gap-2 pt-0.5">
              {summaryMetrics.overBudgetCount > 0 ? (
                <div className="flex items-center gap-1.5 text-rose-400 font-extrabold text-sm">
                  <AlertTriangle className="h-5 w-5 shrink-0 animate-bounce text-rose-400" />
                  <span>{summaryMetrics.overBudgetCount} Kategori Overbudget</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-emerald-400 font-extrabold text-sm">
                  <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-400" />
                  <span>100% Disiplin Aman</span>
                </div>
              )}
            </div>
            <p className="text-[11px] text-slate-400">
              {summaryMetrics.overBudgetCount > 0 ? 'Perlu evaluasi pengeluaran' : 'Semua kategori dalam batas limit'}
            </p>
          </div>
        </div>

        {/* BAR CHART COMPARISON */}
        {chartData.length === 0 ? (
          <div className="p-8 text-center bg-slate-800/40 rounded-xl border border-slate-700/50 space-y-2">
            <Info className="h-8 w-8 text-slate-500 mx-auto" />
            <p className="text-sm font-semibold text-slate-300">Belum ada kategori anggaran terdaftar.</p>
            <p className="text-xs text-slate-400">Tambahkan limit anggaran kategori di bawah untuk mengaktifkan grafik perbandingan real-time ini.</p>
          </div>
        ) : (
          <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-700/50 space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-slate-300 border-b border-slate-800 pb-2">
              <span>Perbandingan Real-Time per Kategori (Nominal Rp)</span>
              <div className="flex items-center gap-4 text-[11px]">
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-xs bg-slate-500 inline-block"></span> Limit Anggaran
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-xs bg-blue-500 inline-block"></span> Realisasi Normal (&lt;80%)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-xs bg-amber-500 inline-block"></span> Waspada (80-99%)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-xs bg-rose-500 inline-block"></span> Overbudget (&ge;100%)
                </span>
              </div>
            </div>

            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 20, right: 30, left: 20, bottom: 25 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.5} />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: '#cbd5e1', fontWeight: 600 }}
                    interval={0}
                  />
                  <YAxis
                    tickFormatter={(value) => `Rp ${value.toLocaleString('id-ID')}`}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                    width={90}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }}
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        const limit = data['Limit Anggaran'];
                        const spent = data['Realisasi Aktual'];
                        const remaining = data.remaining;
                        const pct = data.percentage;

                        return (
                          <div className="bg-slate-900 border border-slate-700 p-3 rounded-xl shadow-xl text-xs space-y-1.5 text-white">
                            <p className="font-extrabold text-sm border-b border-slate-800 pb-1 text-blue-300">
                              {label}
                            </p>
                            <div className="space-y-1">
                              <div className="flex justify-between gap-4 text-slate-300">
                                <span>Limit Anggaran:</span>
                                <span className="font-bold">{formatterIDR.format(limit)}</span>
                              </div>
                              <div className="flex justify-between gap-4 text-slate-300">
                                <span>Realisasi Aktual:</span>
                                <span className="font-bold">{formatterIDR.format(spent)}</span>
                              </div>
                              <div className="flex justify-between gap-4 border-t border-slate-800 pt-1">
                                <span>Sisa / Defisit:</span>
                                <span className={`font-black ${remaining < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                                  {remaining < 0 ? `Defisit -${formatterIDR.format(Math.abs(remaining))}` : formatterIDR.format(remaining)}
                                </span>
                              </div>
                              <div className="pt-1 flex items-center justify-between">
                                <span className="text-[10px] text-slate-400 uppercase font-bold">Penyerapan:</span>
                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                                  pct >= 100 ? 'bg-rose-500/30 text-rose-300 border border-rose-500/50' :
                                  pct >= 80 ? 'bg-amber-500/30 text-amber-300 border border-amber-500/50' :
                                  'bg-emerald-500/30 text-emerald-300 border border-emerald-500/50'
                                }`}>
                                  {pct}% ({pct >= 100 ? 'Melebihi Limit' : pct >= 80 ? 'Waspada' : 'Aman'})
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                  <Bar dataKey="Limit Anggaran" fill="#64748b" radius={[4, 4, 0, 0]} maxBarSize={40} />
                  <Bar dataKey="Realisasi Aktual" radius={[4, 4, 0, 0]} maxBarSize={40}>
                    {chartData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={
                          entry.percentage >= 100
                            ? '#f43f5e'
                            : entry.percentage >= 80
                            ? '#f59e0b'
                            : '#10b981'
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* CATEGORY BREAKDOWN PROGRESS LIST */}
        {budgetComparisonList.length > 0 && (
          <div className="space-y-3 pt-2">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center justify-between">
              <span>Detail Penyerapan Anggaran per Kategori</span>
              <span className="text-[11px] font-normal text-slate-400">{budgetComparisonList.length} Kategori Dipantau</span>
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {budgetComparisonList.map((item) => (
                <div
                  key={item.category}
                  className="p-3.5 bg-slate-800/80 border border-slate-700/70 rounded-xl space-y-2 hover:bg-slate-800 transition"
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <h5 className="font-bold text-sm text-white truncate">{item.category}</h5>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold">
                        Limit: {formatterIDR.format(item.limit)}
                      </span>
                    </div>

                    <span
                      className={`text-[10px] font-black px-2.5 py-0.5 rounded-full border shrink-0 ${
                        item.status === 'danger'
                          ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                          : item.status === 'warning'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                          : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      }`}
                    >
                      {item.status === 'danger' ? 'Melebihi Limit' : item.status === 'warning' ? 'Hampir Habis' : 'Aman'}
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full bg-slate-700 h-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        item.status === 'danger'
                          ? 'bg-rose-500'
                          : item.status === 'warning'
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min(100, item.percentage)}%` }}
                    ></div>
                  </div>

                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-slate-300">
                      Realisasi: <span className="font-extrabold text-white">{formatterIDR.format(item.actualSpent)}</span>
                    </span>
                    <span className={item.remaining < 0 ? 'text-rose-400 font-bold' : 'text-teal-300 font-bold'}>
                      {item.remaining < 0 ? `Over -${formatterIDR.format(Math.abs(item.remaining))}` : `Sisa ${formatterIDR.format(item.remaining)}`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* SARAN OTOMATIS REBALANCING ANGGARAN */}
      <BudgetRebalancingCard
        budgets={budgets}
        transactions={transactions}
        onUpdateBudgetLimit={onUpdateBudgetLimit}
        selectedMonthStr={selectedMonth}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* 1. SEKTOR PENGATURAN REKENING & SALDO AWAL */}
      <div className="space-y-6">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Wallet className="h-5 w-5 text-blue-600" />
            <h3 className="font-semibold text-slate-800 text-sm uppercase tracking-wider">Atur Rekening & Saldo Awal</h3>
          </div>

          <div className="space-y-4">
            {accounts.map((acc) => (
              <div key={acc.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-lg gap-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-white rounded-lg border border-slate-100 text-slate-500 shadow-xxs">
                    <Wallet className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-700 text-sm">{acc.name}</h4>
                    <span className="text-[10px] uppercase font-bold text-slate-400 px-1.5 py-0.5 bg-slate-200 rounded">
                      {acc.type}
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">Rp</span>
                    <FormattedNumberInput
                      value={acc.startingBalance}
                      onChange={(_, numVal) => onUpdateAccountBalance(acc.id, numVal)}
                      className="bg-white border border-slate-200 rounded-md pl-8 pr-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 font-semibold w-32"
                      title="Ubah Saldo Awal"
                    />
                  </div>
                  {accounts.length > 1 && (
                    <button
                      onClick={() => onDeleteAccount(acc.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition cursor-pointer"
                      title="Hapus Rekening"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Form Tambah Rekening */}
          <form onSubmit={handleAddAccountSubmit} className="mt-6 pt-6 border-t border-slate-100 space-y-3">
            <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider">Tambah Rekening Baru</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                type="text"
                placeholder="Nama Akun (e.g. Bank BCA)"
                value={newAccName}
                onChange={(e) => setNewAccName(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700"
                required
              />
              <select
                value={newAccType}
                onChange={(e) => setNewAccType(e.target.value as AccountType)}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700"
              >
                <option value="bank">Bank</option>
                <option value="cash">Tunai (Cash)</option>
                <option value="e-wallet">E-Wallet</option>
                <option value="credit-card">Kartu Kredit</option>
                <option value="paylater">PayLater / SPayLater</option>
              </select>
              <FormattedNumberInput
                placeholder="Saldo Awal (Rp)"
                value={newAccBalance}
                onChange={(val) => setNewAccBalance(val)}
                className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 font-semibold"
                required
              />
            </div>
            <button
              type="submit"
              className="flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 font-bold py-1.5 px-3 rounded-lg text-xs transition cursor-pointer"
            >
              <Plus className="h-4 w-4" /> Tambah Rekening
            </button>
          </form>
        </div>
      </div>

      {/* 2. SEKTOR PENGATURAN ANGGARAN & KATEGORI */}
      <div className="space-y-6">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Settings className="h-5 w-5 text-blue-600" />
            <h3 className="font-semibold text-slate-800 text-sm uppercase tracking-wider">Batas Anggaran Kategori</h3>
          </div>

          <div className="space-y-4">
            {budgets.map((b) => (
              <div key={b.category} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-lg gap-4">
                <div>
                  <h4 className="font-bold text-slate-700 text-sm">{b.category}</h4>
                  <span className={`inline-block text-[9px] uppercase font-bold px-1.5 py-0.5 rounded ${
                    b.type === 'expense' ? 'bg-rose-50 text-rose-600' :
                    b.type === 'saving' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'
                  }`}>
                    {b.type === 'expense' ? 'Pengeluaran' : b.type === 'saving' ? 'Tabungan' : 'Investasi'}
                  </span>
                </div>

                <div className="flex items-center space-x-2">
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">Rp</span>
                    <FormattedNumberInput
                      value={b.limit}
                      onChange={(_, numVal) => onUpdateBudgetLimit(b.category, numVal)}
                      className="bg-white border border-slate-200 rounded-md pl-8 pr-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 font-semibold w-36"
                      title="Ubah Anggaran"
                    />
                  </div>
                  <button
                    onClick={() => onDeleteBudgetCategory(b.category)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition cursor-pointer"
                    title="Hapus Kategori"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Form Tambah Anggaran */}
          <form onSubmit={handleAddBudgetSubmit} className="mt-6 pt-6 border-t border-slate-100 space-y-3">
            <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider">Tambah Kategori Anggaran</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                type="text"
                placeholder="Nama Kategori (e.g. Pendidikan)"
                value={newBudCat}
                onChange={(e) => setNewBudCat(e.target.value)}
                list="budget-master-categories"
                className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700"
                required
              />
              <datalist id="budget-master-categories">
                {masterCategories && masterCategories.length > 0 && 
                  flattenCategoryHierarchy(masterCategories)
                    .filter(n => n.type !== 'type')
                    .map(n => <option key={n.id} value={n.name} />)
                }
              </datalist>
              <select
                value={newBudType}
                onChange={(e) => setNewBudType(e.target.value as 'expense' | 'saving' | 'investment')}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700"
              >
                <option value="expense">Pengeluaran</option>
                <option value="saving">Tabungan</option>
                <option value="investment">Investasi</option>
              </select>
              <FormattedNumberInput
                placeholder="Limit Batas (Rp)"
                value={newBudLimit}
                onChange={(val) => setNewBudLimit(val)}
                className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 font-semibold"
                required
              />
            </div>
            <button
              type="submit"
              className="flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 font-bold py-1.5 px-3 rounded-lg text-xs transition cursor-pointer"
            >
              <Plus className="h-4 w-4" /> Tambah Kategori
            </button>
          </form>
        </div>
      </div>
    </div>

      {/* MODE FOKUS POP-UP WARNING MODAL (TAMPIL APABILA ADA KATEGORI MENCAPAI >= 90% ANGGARAN) */}
      {isFocusModeActive && isFocusModalOpen && focusAlertCategories.length > 0 && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border-2 border-rose-500/80 rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden space-y-0">
            {/* Modal Header */}
            <div className="p-5 bg-gradient-to-r from-rose-600 via-amber-600 to-rose-700 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-white/20 backdrop-blur-xs rounded-2xl border border-white/30 shadow-inner">
                  <ShieldAlert className="h-6 w-6 text-white animate-bounce" />
                </div>
                <div>
                  <h3 className="font-black text-base uppercase tracking-wider flex items-center gap-2">
                    PERINGATAN MODE FOKUS!
                  </h3>
                  <p className="text-xs text-rose-100 font-medium">
                    {focusAlertCategories.length} Kategori telah menyerap &ge;90% dari batas anggaran!
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsFocusModalOpen(false)}
                className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition cursor-pointer"
                title="Tutup Pop-up Peringatan"
              >
                <AlertTriangle className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-2xl text-xs text-rose-800 dark:text-rose-200 font-medium leading-relaxed">
                🚨 <strong>Perhatian Keuangan:</strong> Mode Fokus aktif dan mendeteksi bahwa pengeluaran pada kategori di bawah ini telah mendekati atau melampaui <strong>90% batas limit anggaran bulanan</strong>. Mohon batasi transaksi tambahan agar tidak membengkak!
              </div>

              {/* List of High Alert Categories */}
              <div className="space-y-3">
                {focusAlertCategories.map((cat, idx) => (
                  <div
                    key={idx}
                    className={`p-4 rounded-2xl border transition space-y-2.5 ${
                      cat.percentage >= 100
                        ? 'bg-rose-50/80 dark:bg-rose-950/60 border-rose-300 dark:border-rose-800'
                        : 'bg-amber-50/80 dark:bg-amber-950/50 border-amber-300 dark:border-amber-800'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">{cat.category}</h4>
                        <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">
                          Limit: {formatterIDR.format(cat.limit)}
                        </span>
                      </div>

                      <span
                        className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wide border shadow-xs ${
                          cat.percentage >= 100
                            ? 'bg-rose-600 text-white border-rose-700'
                            : 'bg-amber-500 text-slate-950 border-amber-600'
                        }`}
                      >
                        {cat.percentage}% {cat.percentage >= 100 ? 'MELEBIHI LIMIT' : 'SANGAT KRITIS'}
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-slate-200 dark:bg-slate-700 h-2.5 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          cat.percentage >= 100 ? 'bg-rose-600' : 'bg-amber-500'
                        }`}
                        style={{ width: `${Math.min(100, cat.percentage)}%` }}
                      ></div>
                    </div>

                    <div className="flex items-center justify-between text-xs font-bold pt-1">
                      <span className="text-slate-700 dark:text-slate-300">
                        Terpakai: <strong className="font-mono text-slate-900 dark:text-slate-100">{formatterIDR.format(cat.actualSpent)}</strong>
                      </span>
                      <span className={cat.remaining < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-amber-700 dark:text-amber-300'}>
                        {cat.remaining < 0
                          ? `Over -${formatterIDR.format(Math.abs(cat.remaining))}`
                          : `Sisa Hanya ${formatterIDR.format(cat.remaining)}`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-700/80 flex flex-col sm:flex-row items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setIsFocusModeActive(false)}
                className="text-xs font-bold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 underline cursor-pointer"
              >
                Nonaktifkan Mode Fokus
              </button>

              <button
                type="button"
                onClick={() => setIsFocusModalOpen(false)}
                className="w-full sm:w-auto px-6 py-2.5 bg-slate-900 hover:bg-slate-800 dark:bg-rose-600 dark:hover:bg-rose-500 text-white font-extrabold text-xs rounded-xl shadow-md transition cursor-pointer flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="h-4 w-4" />
                Saya Mengerti & Mengontrol Pengeluaran
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

