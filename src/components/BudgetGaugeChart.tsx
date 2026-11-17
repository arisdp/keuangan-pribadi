import React, { useState, useMemo } from 'react';
import { CategoryBudget, Transaction } from '../types';
import { CategoryNode } from '../categoryHierarchy';
import {
  Gauge,
  AlertTriangle,
  CheckCircle2,
  PieChart as PieChartIcon,
  TrendingUp,
  DollarSign,
  Info,
  Calendar,
  Filter,
} from 'lucide-react';

interface BudgetGaugeChartProps {
  budgets: CategoryBudget[];
  transactions: Transaction[];
  masterCategories?: CategoryNode[];
}

export const BudgetGaugeChart: React.FC<BudgetGaugeChartProps> = ({
  budgets,
  transactions,
  masterCategories = [],
}) => {
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const formatterIDR = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

  // Available months from transactions or current month
  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    const now = new Date();
    const curr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    months.add(curr);

    transactions.forEach((tx) => {
      if (tx.date && tx.date.length >= 7) {
        months.add(tx.date.substring(0, 7));
      }
    });

    return Array.from(months).sort().reverse();
  }, [transactions]);

  // Map category spent for selected month
  const categorySpentMap = useMemo(() => {
    const map: Record<string, number> = {};

    transactions.forEach((tx) => {
      if (!tx.date || !tx.amount) return;
      if (tx.type !== 'expense') return; // budget applies to expenses
      const ym = tx.date.substring(0, 7);
      if (ym !== selectedMonth) return;

      const catKey = tx.category.toLowerCase().trim();
      map[catKey] = (map[catKey] || 0) + tx.amount;
    });

    return map;
  }, [transactions, selectedMonth]);

  // Combine budget limits with actual spent
  const gaugeData = useMemo(() => {
    // If no budgets exist, fallback to default category budgets from expenses
    const activeBudgets = budgets.length > 0 ? budgets : [
      { id: 'b1', category: 'Kebutuhan Rumah Tangga', limitAmount: 7000000, isAlertActive: true },
      { id: 'b2', category: 'Belanja Online', limitAmount: 3000000, isAlertActive: true },
      { id: 'b3', category: 'Kebutuhan Pribadi', limitAmount: 2500000, isAlertActive: true },
      { id: 'b4', category: 'Pengeluaran Lainnya', limitAmount: 4000000, isAlertActive: true },
      { id: 'b5', category: 'Kesehatan', limitAmount: 2000000, isAlertActive: true },
      { id: 'b6', category: 'Transportasi', limitAmount: 1800000, isAlertActive: true },
      { id: 'b7', category: 'Bank dan Finansial', limitAmount: 500000, isAlertActive: true },
    ];

    return activeBudgets.map((b) => {
      const catLower = b.category.toLowerCase().trim();
      
      // Calculate spent including child categories if matched
      let spent = categorySpentMap[catLower] || 0;

      // Also search if cat lower matches any subcategories
      Object.keys(categorySpentMap).forEach((k) => {
        if (k !== catLower && k.includes(catLower)) {
          spent += categorySpentMap[k];
        }
      });

      const limit = b.limitAmount || 1;
      const percentage = Math.min(Math.round((spent / limit) * 100), 200); // cap visual at 200%

      let status: 'safe' | 'warning' | 'danger' = 'safe';
      if (percentage >= 100) status = 'danger';
      else if (percentage >= 80) status = 'warning';

      return {
        id: b.id,
        category: b.category,
        limit,
        spent,
        remaining: Math.max(0, limit - spent),
        percentage,
        actualPercentage: Math.round((spent / limit) * 100),
        status,
      };
    });
  }, [budgets, categorySpentMap]);

  // Overall total stats
  const overallStats = useMemo(() => {
    const totalLimit = gaugeData.reduce((sum, item) => sum + item.limit, 0);
    const totalSpent = gaugeData.reduce((sum, item) => sum + item.spent, 0);
    const overallPct = totalLimit > 0 ? Math.round((totalSpent / totalLimit) * 100) : 0;
    
    return {
      totalLimit,
      totalSpent,
      remaining: Math.max(0, totalLimit - totalSpent),
      overallPct,
    };
  }, [gaugeData]);

  // Helper to render SVG Semi-Circle Gauge Chart
  const renderSemiCircleGauge = (percentage: number, status: 'safe' | 'warning' | 'danger') => {
    const radius = 60;
    const strokeWidth = 12;
    const cx = 80;
    const cy = 80;

    // Semi-circle circumference = PI * radius = ~188.5
    const circumference = Math.PI * radius;
    // Cap visual fill at 100%
    const fillPercent = Math.min(percentage, 100) / 100;
    const strokeDashoffset = circumference * (1 - fillPercent);

    let gaugeColor = '#10B981'; // emerald
    if (status === 'warning') gaugeColor = '#F59E0B'; // amber
    if (status === 'danger') gaugeColor = '#EF4444'; // rose

    return (
      <div className="relative flex flex-col items-center justify-center">
        <svg width="160" height="95" className="overflow-visible">
          {/* Background Arc */}
          <path
            d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
            fill="none"
            stroke="#E2E8F0"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          {/* Active Progress Arc */}
          <path
            d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
            fill="none"
            stroke={gaugeColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-700 ease-out"
          />
        </svg>

        {/* Center Percentage Display */}
        <div className="absolute top-[38px] text-center">
          <span className="text-xl font-black text-slate-900 tracking-tight">
            {percentage}%
          </span>
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 -mt-1">
            Terpakai
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Top Header Card */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-xl shadow-md">
            <Gauge className="h-6 w-6" />
          </div>
          <div>
            <h3 className="font-black text-slate-900 text-base tracking-tight flex items-center gap-2">
              <span>Meter Penggunaan Anggaran (Real-Time Budget Gauge)</span>
              <span className="bg-emerald-100 text-emerald-800 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                Live Status
              </span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Pantau persentase konsumsi anggaran per kelompok kategori secara visual dengan indikator meter.
            </p>
          </div>
        </div>

        {/* Month Selector */}
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 p-2 rounded-xl">
          <Calendar className="h-4 w-4 text-slate-400 ml-1" />
          <span className="text-xs font-bold text-slate-600">Periode:</span>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-transparent text-xs font-black text-slate-800 focus:outline-none cursor-pointer"
          >
            {availableMonths.map((m) => {
              const [y, mon] = m.split('-');
              const dateObj = new Date(parseInt(y, 10), parseInt(mon, 10) - 1, 1);
              const name = dateObj.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
              return (
                <option key={m} value={m}>
                  {name}
                </option>
              );
            })}
          </select>
        </div>
      </div>

      {/* Overview Metric Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-xs font-bold text-slate-500">Total Pagu Anggaran</span>
          <div className="text-lg font-black font-mono text-slate-900">
            {formatterIDR.format(overallStats.totalLimit)}
          </div>
          <span className="text-[11px] text-slate-400">Pagu gabungan kategori</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-xs font-bold text-slate-500">Total Terpakai (Realisasi)</span>
          <div className="text-lg font-black font-mono text-rose-600">
            {formatterIDR.format(overallStats.totalSpent)}
          </div>
          <span className="text-[11px] text-slate-400">Total belanja bulan ini</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-xs font-bold text-slate-500">Sisa Anggaran Aman</span>
          <div className="text-lg font-black font-mono text-emerald-600">
            {formatterIDR.format(overallStats.remaining)}
          </div>
          <span className="text-[11px] text-slate-400">Pagu tersisa belum terpakai</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-xs font-bold text-slate-500">Rata-rata Konsumsi Pagu</span>
          <div className="flex items-center gap-2">
            <span className="text-lg font-black text-slate-900">{overallStats.overallPct}%</span>
            <span
              className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                overallStats.overallPct >= 100
                  ? 'bg-rose-100 text-rose-800'
                  : overallStats.overallPct >= 80
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              {overallStats.overallPct >= 100 ? 'Over Budget' : overallStats.overallPct >= 80 ? 'Waspada' : 'Aman'}
            </span>
          </div>
          <span className="text-[11px] text-slate-400">Tingkat pemakaian global</span>
        </div>
      </div>

      {/* Grid of Category Gauge Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {gaugeData.map((item) => {
          let statusBg = 'bg-emerald-50 text-emerald-800 border-emerald-200';
          let statusText = 'Aman (<80%)';
          let StatusIcon = CheckCircle2;

          if (item.status === 'warning') {
            statusBg = 'bg-amber-50 text-amber-800 border-amber-200';
            statusText = 'Waspada (80%-99%)';
            StatusIcon = AlertTriangle;
          } else if (item.status === 'danger') {
            statusBg = 'bg-rose-50 text-rose-800 border-rose-200';
            statusText = 'Melebihi Limit (>=100%)';
            StatusIcon = AlertTriangle;
          }

          return (
            <div
              key={item.id}
              className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3 flex flex-col justify-between hover:shadow-md transition duration-200"
            >
              {/* Category Header */}
              <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                  <h4 className="font-extrabold text-slate-800 text-sm">{item.category}</h4>
                  <span className="text-[11px] text-slate-400 font-semibold">Kelompok Anggaran</span>
                </div>
                <div className={`flex items-center gap-1 text-[10px] font-extrabold px-2.5 py-1 rounded-full border ${statusBg}`}>
                  <StatusIcon className="h-3 w-3" />
                  {statusText}
                </div>
              </div>

              {/* Gauge Meter Display */}
              <div className="py-1">
                {renderSemiCircleGauge(item.actualPercentage, item.status)}
              </div>

              {/* Detailed Financial Breakdown */}
              <div className="bg-slate-50 p-3.5 rounded-xl space-y-2 text-xs border border-slate-100">
                <div className="flex justify-between items-center text-slate-600">
                  <span className="font-medium">Limit Pagu:</span>
                  <span className="font-mono font-bold text-slate-900">
                    {formatterIDR.format(item.limit)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-slate-600">
                  <span className="font-medium">Terpakai Bulan Ini:</span>
                  <span className="font-mono font-bold text-rose-600">
                    {formatterIDR.format(item.spent)}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-1.5 border-t border-slate-200 text-slate-700 font-bold">
                  <span>Sisa Saldo Limit:</span>
                  <span className={`font-mono ${item.remaining === 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                    {formatterIDR.format(item.remaining)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
