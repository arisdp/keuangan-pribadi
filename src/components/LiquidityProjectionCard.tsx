import React, { useState, useMemo } from 'react';
import { Transaction, Account, Debt } from '../types';
import {
  calculateTotalLiquidCash,
  calculateCreditPaylaterBills,
  calculateMonthlyDebtService,
  classifyTransaction,
} from '../utils/accountingEngine';
import { formatterIDR } from '../utils/formatters';
import {
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  AlertTriangle,
  Scale,
  Info,
  Calendar,
  Sliders,
  CheckCircle2,
  BarChart3,
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts';

interface LiquidityProjectionCardProps {
  transactions: Transaction[];
  accounts: Account[];
  debts: Debt[];
}

export const LiquidityProjectionCard: React.FC<LiquidityProjectionCardProps> = ({
  transactions,
  accounts,
  debts,
}) => {
  // Scenario Adjustment Modifiers (in %)
  const [inflowAdjustmentPct, setInflowAdjustmentPct] = useState<number>(0);
  const [outflowAdjustmentPct, setOutflowAdjustmentPct] = useState<number>(0);

  // 1. Calculate Historical Monthly Averages (Cash Inflows & Outflows excluding internal transfers & loan proceeds)
  const historicalAverages = useMemo(() => {
    const monthlyData: Record<string, { income: number; expense: number }> = {};

    transactions.forEach((tx) => {
      if (!tx.date) return;
      const nature = classifyTransaction(tx);
      if (nature === 'internal_transfer' || nature === 'debt_proceeds') return;

      const ym = tx.date.substring(0, 7);
      if (!monthlyData[ym]) {
        monthlyData[ym] = { income: 0, expense: 0 };
      }

      if (nature === 'operating_income') {
        monthlyData[ym].income += Math.abs(tx.amount);
      } else if (
        nature === 'operating_expense' ||
        nature === 'debt_principal_pay' ||
        nature === 'emergency_fund_transfer' ||
        nature === 'investment_buy'
      ) {
        if (tx.type !== 'income') {
          monthlyData[ym].expense += Math.abs(tx.amount);
        }
      }
    });

    const months = Object.keys(monthlyData);
    if (months.length === 0) {
      return { avgIncome: 5000000, avgExpense: 3500000, avgNet: 1500000 };
    }

    const totalInc = Object.values(monthlyData).reduce((sum, m) => sum + m.income, 0);
    const totalExp = Object.values(monthlyData).reduce((sum, m) => sum + m.expense, 0);

    const avgIncome = totalInc / months.length;
    const avgExpense = totalExp / months.length;
    const avgNet = avgIncome - avgExpense;

    return { avgIncome, avgExpense, avgNet, monthCount: months.length };
  }, [transactions]);

  // 2. Current Liquid Assets & Current Short-Term Liabilities
  const currentBaseline = useMemo(() => {
    const liquidAssets = Math.max(0, calculateTotalLiquidCash(accounts));
    const creditPaylaterLiabilities = calculateCreditPaylaterBills(accounts);
    const debtLiabilities = debts.reduce((sum, d) => sum + Math.max(0, d.balance || 0), 0);

    const currentLiabilities = creditPaylaterLiabilities + debtLiabilities;

    // Current Ratio (Liquidity Ratio)
    const currentRatio = currentLiabilities > 0 ? liquidAssets / currentLiabilities : 5.0;

    return {
      liquidAssets,
      currentLiabilities,
      currentRatio,
    };
  }, [accounts, debts]);

  // 3. Generate 6-Month Projection Data
  const projectionData = useMemo(() => {
    const projectedInflow = historicalAverages.avgIncome * (1 + inflowAdjustmentPct / 100);
    const projectedOutflow = historicalAverages.avgExpense * (1 + outflowAdjustmentPct / 100);
    const netMonthlyCashflow = projectedInflow - projectedOutflow;

    const data: Array<{
      monthIndex: number;
      monthName: string;
      projectedLiquidAssets: number;
      projectedLiabilities: number;
      currentRatio: number;
      netCashflow: number;
      status: 'optimal' | 'adequate' | 'risk';
      statusLabel: string;
    }> = [];

    const now = new Date();
    let accumLiquidAssets = currentBaseline.liquidAssets;
    let accumLiabilities = currentBaseline.currentLiabilities;

    for (let m = 0; m <= 6; m++) {
      const projDate = new Date(now.getFullYear(), now.getMonth() + m, 1);
      const monthLabel = m === 0 ? 'Bulan Ini (Base)' : projDate.toLocaleDateString('id-ID', { month: 'short', year: 'numeric' });

      if (m > 0) {
        accumLiquidAssets = Math.max(0, accumLiquidAssets + netMonthlyCashflow);
        // Gradually payoff liabilities based on debt & credit card min payments
        const minDebtPay = calculateMonthlyDebtService(accounts, debts);
        accumLiabilities = Math.max(0, accumLiabilities - minDebtPay * 0.5);
      }

      const ratio = accumLiabilities > 0 ? accumLiquidAssets / accumLiabilities : Math.min(10, accumLiquidAssets / 1000000);
      const roundedRatio = Math.round(ratio * 100) / 100;

      let status: 'optimal' | 'adequate' | 'risk' = 'optimal';
      let statusLabel = 'Sangat Solven (Ideal)';

      if (roundedRatio < 1.0) {
        status = 'risk';
        statusLabel = 'Bahaya Insolvensi (< 1.0)';
      } else if (roundedRatio < 1.5) {
        status = 'adequate';
        statusLabel = 'Cukup Waspada (1.0 - 1.5)';
      }

      data.push({
        monthIndex: m,
        monthName: monthLabel,
        projectedLiquidAssets: accumLiquidAssets,
        projectedLiabilities: accumLiabilities,
        currentRatio: roundedRatio,
        netCashflow: netMonthlyCashflow,
        status,
        statusLabel,
      });
    }

    return {
      monthlyInflow: projectedInflow,
      monthlyOutflow: projectedOutflow,
      netMonthlyCashflow,
      data,
    };
  }, [historicalAverages, currentBaseline, inflowAdjustmentPct, outflowAdjustmentPct, accounts, debts]);

  // Solvency Advisory Message
  const solvencyAdvisory = useMemo(() => {
    const riskMonths = projectionData.data.filter((d) => d.status === 'risk');
    const minRatio = Math.min(...projectionData.data.map((d) => d.currentRatio));

    if (riskMonths.length > 0) {
      return {
        type: 'danger',
        title: '⚠️ Peringatan Risiko Likuiditas & Solvabilitas Terdeteksi!',
        message: `Proyeksi menunjukkan Rasio Likuiditas turun di bawah 1.0 pada ${riskMonths.length} bulan ke depan. Aset lancar Anda tidak memadai untuk menutupi kewajiban jangka pendek. Disarankan menekan pengeluaran non-esensial atau menambah cadangan kas.`,
      };
    } else if (minRatio < 1.5) {
      return {
        type: 'warning',
        title: '⚡ Rasio Likuiditas Cukup Moderat (Waspada)',
        message: `Rasio likuiditas berada pada rentang 1.0 - 1.5. Solvabilitas keuangan Anda aman, namun disarankan memperbesar alokasi tabungan untuk menjaga daya tahan dari pengeluaran darurat.`,
      };
    } else {
      return {
        type: 'success',
        title: '🛡️ Solvabilitas Sangat Sehat & Prima (Current Ratio > 1.5)',
        message: `Rasio likuiditas terproyeksi stabil di atas 1.5 selama 6 bulan ke depan. Aset lancar Anda sangat memadai untuk melunasi seluruh kewajiban jangka pendek tanpa mengganggu stabilitas kas.`,
      };
    }
  }, [projectionData]);

  return (
    <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-md space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-tr from-indigo-600 via-blue-600 to-cyan-500 text-white rounded-2xl shadow-sm">
            <Scale className="h-6 w-6" />
          </div>
          <div>
            <h3 className="font-extrabold text-slate-900 dark:text-slate-100 text-base flex items-center gap-2">
              <span>Proyeksi Rasio Likuiditas & Solvabilitas (6 Bulan Ke Depan)</span>
              <span className="px-2.5 py-0.5 bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 text-[10px] font-black rounded-full uppercase border border-blue-300 dark:border-blue-800">
                Current Ratio Forecast
              </span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Simulasi tren Rasio Lancar (Current Ratio = Aset Lancar / Kewajiban Jangka Pendek) untuk menjaga kesehatan solvabilitas jangka menengah.
            </p>
          </div>
        </div>

        {/* Current Ratio Badge */}
        <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800/80 px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
            Current Ratio Saat Ini:
          </span>
          <span
            className={`text-lg font-black font-mono px-3 py-0.5 rounded-xl text-white shadow-xs ${
              currentBaseline.currentRatio >= 2.0
                ? 'bg-emerald-600'
                : currentBaseline.currentRatio >= 1.0
                ? 'bg-amber-500'
                : 'bg-rose-600'
            }`}
          >
            {currentBaseline.currentRatio.toFixed(2)}x
          </span>
        </div>
      </div>

      {/* Advisory Banner */}
      <div
        className={`p-4 rounded-2xl border flex items-start gap-3.5 text-xs font-medium ${
          solvencyAdvisory.type === 'danger'
            ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200'
            : solvencyAdvisory.type === 'warning'
            ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200'
            : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
        }`}
      >
        {solvencyAdvisory.type === 'danger' ? (
          <AlertTriangle className="h-5 w-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
        ) : solvencyAdvisory.type === 'warning' ? (
          <Info className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        ) : (
          <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
        )}

        <div className="space-y-1">
          <h4 className="font-extrabold text-xs uppercase tracking-wider">{solvencyAdvisory.title}</h4>
          <p className="leading-relaxed">{solvencyAdvisory.message}</p>
        </div>
      </div>

      {/* Interactive Scenario Controls */}
      <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sliders className="h-4 w-4 text-blue-600" />
            <h4 className="text-xs font-black uppercase text-slate-800 dark:text-slate-200">
              Simulasi Skenario "What-If" Arus Kas Bulanan
            </h4>
          </div>

          <button
            type="button"
            onClick={() => {
              setInflowAdjustmentPct(0);
              setOutflowAdjustmentPct(0);
            }}
            className="text-[10px] font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 underline cursor-pointer"
          >
            Reset Skenario
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Slider 1: Inflow Adjustment */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold">
              <span className="text-slate-600 dark:text-slate-300 flex items-center gap-1">
                <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                Penyesuaian Pemasukan Bulanan ({inflowAdjustmentPct > 0 ? `+${inflowAdjustmentPct}%` : `${inflowAdjustmentPct}%`})
              </span>
              <span className="font-mono text-emerald-600 dark:text-emerald-400">
                {formatterIDR.format(projectionData.monthlyInflow)} / bln
              </span>
            </div>
            <input
              type="range"
              min="-50"
              max="50"
              step="5"
              value={inflowAdjustmentPct}
              onChange={(e) => setInflowAdjustmentPct(parseInt(e.target.value))}
              className="w-full accent-emerald-600 cursor-pointer h-2 bg-slate-200 dark:bg-slate-700 rounded-lg"
            />
            <div className="flex justify-between text-[10px] text-slate-400 font-mono">
              <span>-50% (Penurunan)</span>
              <span>0% (Rata-rata Historis)</span>
              <span>+50% (Peningkatan)</span>
            </div>
          </div>

          {/* Slider 2: Outflow Adjustment */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold">
              <span className="text-slate-600 dark:text-slate-300 flex items-center gap-1">
                <TrendingDown className="h-3.5 w-3.5 text-rose-500" />
                Penyesuaian Pengeluaran Bulanan ({outflowAdjustmentPct > 0 ? `+${outflowAdjustmentPct}%` : `${outflowAdjustmentPct}%`})
              </span>
              <span className="font-mono text-rose-600 dark:text-rose-400">
                {formatterIDR.format(projectionData.monthlyOutflow)} / bln
              </span>
            </div>
            <input
              type="range"
              min="-50"
              max="50"
              step="5"
              value={outflowAdjustmentPct}
              onChange={(e) => setOutflowAdjustmentPct(parseInt(e.target.value))}
              className="w-full accent-rose-600 cursor-pointer h-2 bg-slate-200 dark:bg-slate-700 rounded-lg"
            />
            <div className="flex justify-between text-[10px] text-slate-400 font-mono">
              <span>-50% (Hemat)</span>
              <span>0% (Rata-rata Historis)</span>
              <span>+50% (Pengeluaran Ekstra)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Projection Chart */}
      <div className="space-y-2">
        <h4 className="text-xs font-black uppercase text-slate-700 dark:text-slate-300 flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-blue-500" />
          <span>Grafik Tren Proyeksi Current Ratio & Aset Lancar (6 Bulan)</span>
        </h4>

        <div className="h-72 w-full bg-slate-50/50 dark:bg-slate-800/30 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={projectionData.data} margin={{ top: 20, right: 30, left: 10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="monthName" tick={{ fontSize: 11, fontWeight: 700, fill: '#64748b' }} />
              <YAxis
                yAxisId="left"
                orientation="left"
                tickFormatter={(v) => `${v.toFixed(1)}x`}
                tick={{ fontSize: 11, fontWeight: 700, fill: '#3b82f6' }}
                domain={[0, 'auto']}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tickFormatter={(v) => `Rp ${(v / 1000000).toFixed(0)}Jt`}
                tick={{ fontSize: 10, fill: '#94a3b8' }}
              />
              <Tooltip
                formatter={(value: any, name: string) => {
                  if (name === 'Current Ratio (Likuiditas)') return [`${value}x`, name];
                  return [formatterIDR.format(Number(value)), name];
                }}
                contentStyle={{
                  backgroundColor: '#0f172a',
                  borderColor: '#334155',
                  borderRadius: '12px',
                  color: '#fff',
                  fontSize: '12px',
                  fontWeight: 'bold',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
              <ReferenceLine yAxisId="left" y={1.0} label={{ value: 'Batas Minimal Likuiditas (1.0x)', fill: '#ef4444', fontSize: 10, fontWeight: 'bold' }} stroke="#ef4444" strokeDasharray="4 4" />
              <ReferenceLine yAxisId="left" y={1.5} label={{ value: 'Batas Ideal (1.5x)', fill: '#10b981', fontSize: 10, fontWeight: 'bold' }} stroke="#10b981" strokeDasharray="4 4" />

              <Bar yAxisId="right" dataKey="projectedLiquidAssets" name="Proyeksi Aset Lancar (Rp)" fill="#3b82f6" opacity={0.3} radius={[6, 6, 0, 0]} />
              <Line yAxisId="left" type="monotone" dataKey="currentRatio" name="Current Ratio (Likuiditas)" stroke="#2563eb" strokeWidth={3} dot={{ r: 5, fill: '#2563eb' }} activeDot={{ r: 8 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Projection Detail Table */}
      <div className="space-y-3">
        <h4 className="text-xs font-black uppercase text-slate-700 dark:text-slate-300 flex items-center gap-2">
          <Calendar className="h-4 w-4 text-emerald-500" />
          <span>Tabel Detail Proyeksi Bulanan</span>
        </h4>

        <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
          <table className="w-full text-left text-xs font-medium">
            <thead className="bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-[10px] font-extrabold text-slate-400 uppercase">
              <tr>
                <th className="py-2.5 px-3">Bulan</th>
                <th className="py-2.5 px-3 font-mono text-right">Aset Lancar (Kas)</th>
                <th className="py-2.5 px-3 font-mono text-right">Kewajiban Jangka Pendek</th>
                <th className="py-2.5 px-3 font-mono text-right">Arus Kas Net Bulanan</th>
                <th className="py-2.5 px-3 font-mono text-center">Current Ratio</th>
                <th className="py-2.5 px-3 text-center">Status Solvabilitas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-800 dark:text-slate-200">
              {projectionData.data.map((row) => (
                <tr key={row.monthIndex} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-slate-100">{row.monthName}</td>
                  <td className="py-2.5 px-3 font-mono text-right font-bold text-blue-600 dark:text-blue-400">
                    {formatterIDR.format(row.projectedLiquidAssets)}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-right font-bold text-rose-600 dark:text-rose-400">
                    {formatterIDR.format(row.projectedLiabilities)}
                  </td>
                  <td
                    className={`py-2.5 px-3 font-mono text-right font-extrabold ${
                      row.netCashflow >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {row.netCashflow >= 0 ? `+${formatterIDR.format(row.netCashflow)}` : formatterIDR.format(row.netCashflow)}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-center font-black text-sm text-slate-900 dark:text-slate-100">
                    {row.currentRatio.toFixed(2)}x
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <span
                      className={`px-2.5 py-0.5 text-[10px] font-black rounded-full border inline-flex items-center gap-1 ${
                        row.status === 'optimal'
                          ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                          : row.status === 'adequate'
                          ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800'
                          : 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-800'
                      }`}
                    >
                      {row.status === 'optimal' ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : (
                        <AlertTriangle className="h-3 w-3" />
                      )}
                      {row.statusLabel}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
