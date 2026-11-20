import React, { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { Activity, ArrowRight, PlusCircle } from 'lucide-react';
import {
  Account,
  Debt,
  EmergencyFundTransaction,
  FixedAsset,
  InvestmentAsset,
  Transaction,
} from '../types';
import { calculateCFPFinancialHealthRatios } from '../utils/accountingEngine';
import { formatterIDR } from '../utils/formatters';

interface DashboardFinancialHealthPanelProps {
  transactions: Transaction[];
  accounts: Account[];
  debts: Debt[];
  investments: InvestmentAsset[];
  emergencyTransactions: EmergencyFundTransaction[];
  fixedAssets?: FixedAsset[];
  isFocusMode?: boolean;
  onOpenReports?: () => void;
  onAddTransaction?: () => void;
}

export const DashboardFinancialHealthPanel: React.FC<DashboardFinancialHealthPanelProps> = ({
  transactions,
  accounts,
  debts,
  investments,
  emergencyTransactions,
  fixedAssets = [],
  isFocusMode = false,
  onOpenReports,
  onAddTransaction,
}) => {
  const metrics = useMemo(
    () =>
      calculateCFPFinancialHealthRatios(
        transactions,
        accounts,
        debts,
        investments,
        emergencyTransactions,
        fixedAssets
      ),
    [transactions, accounts, debts, investments, emergencyTransactions, fixedAssets]
  );

  const hasFinancialActivity =
    transactions.length > 0 ||
    accounts.some((a) => Math.abs(a.currentBalance) > 0) ||
    debts.some((d) => d.balance > 0);

  const maskMoney = (amount: number) =>
    isFocusMode ? 'Rp ••••••' : formatterIDR.format(amount);

  const liquidityDisplayPct = useMemo(() => {
    if (metrics.currentLiabilities <= 0) {
      return metrics.liquidCash + metrics.emergencyBalance > 0 ? 200 : 0;
    }
    return Math.min(200, Math.round(metrics.liquidityRatio * 100));
  }, [metrics]);

  const chartData = useMemo(
    () => [
      {
        name: 'Likuiditas Kas',
        Aktual: liquidityDisplayPct,
        'Standar CFP': 150,
        actualLabel:
          metrics.currentLiabilities <= 0
            ? metrics.liquidCash + metrics.emergencyBalance > 0
              ? 'Bebas Utang Lancar (≥1.5x)'
              : '0.00x'
            : `${metrics.liquidityRatio.toFixed(2)}x (${Math.round(metrics.liquidityRatio * 100)}%)`,
        targetLabel: '≥ 1.50x (150%)',
        statusText:
          metrics.liquidityStatus === 'ideal'
            ? 'Ideal'
            : metrics.liquidityStatus === 'warning'
            ? 'Waspada'
            : 'Kritis',
      },
      {
        name: 'Beban Utang (DTI)',
        Aktual: Number(Math.min(100, metrics.dtiRatio).toFixed(1)),
        'Standar CFP': 30,
        actualLabel: `${metrics.dtiRatio.toFixed(1)}%`,
        targetLabel: '≤ 30.0%',
        statusText:
          metrics.dtiStatus === 'ideal'
            ? 'Ideal'
            : metrics.dtiStatus === 'warning'
            ? 'Waspada'
            : 'Kritis',
      },
      {
        name: 'Rasio Tabungan',
        Aktual: Number(Math.min(100, metrics.savingsRatio).toFixed(1)),
        'Standar CFP': 20,
        actualLabel: `${metrics.savingsRatio.toFixed(1)}%`,
        targetLabel: '≥ 20.0%',
        statusText:
          metrics.savingsStatus === 'ideal'
            ? 'Ideal'
            : metrics.savingsStatus === 'warning'
            ? 'Waspada'
            : 'Kurang',
      },
    ],
    [metrics, liquidityDisplayPct]
  );

  const getStatusStyle = (status: 'ideal' | 'warning' | 'danger') => {
    if (status === 'ideal') {
      return {
        badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        dot: 'bg-[#16A34A]',
        text: 'Ideal',
      };
    }
    if (status === 'warning') {
      return {
        badge: 'bg-amber-50 text-amber-700 border-amber-200',
        dot: 'bg-[#D97706]',
        text: 'Waspada',
      };
    }
    return {
      badge: 'bg-rose-50 text-rose-700 border-rose-200',
      dot: 'bg-[#DC2626]',
      text: 'Kritis',
    };
  };

  const liquidityBadge = getStatusStyle(metrics.liquidityStatus);
  const dtiBadge = getStatusStyle(metrics.dtiStatus);
  const savingsBadge = getStatusStyle(metrics.savingsStatus);

  return (
    <section className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-5">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div className="flex items-start sm:items-center gap-3">
          <div className="p-2.5 rounded-xl bg-slate-900 dark:bg-blue-600 text-white shrink-0">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-black text-slate-900 dark:text-slate-100 tracking-tight">
                Rasio Kesehatan Keuangan
              </h2>
              <span className="text-[11px] font-mono tabular-nums font-bold text-slate-500 dark:text-slate-400">
                · Real-Time CFP · Skor {metrics.healthScore}/100
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
              Evaluasi otomatis Rasio Likuiditas, Beban Utang terhadap Pendapatan (DTI), dan Rasio Tabungan bulan berjalan terhadap tolok ukur Certified Financial Planner.
            </p>
          </div>
        </div>

        {onOpenReports && (
          <button
            type="button"
            onClick={onOpenReports}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0"
          >
            <span>Lihat Analisis CFP Lengkap</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {!hasFinancialActivity ? (
        <div className="py-10 px-4 text-center border border-dashed border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-slate-800/30 space-y-3">
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
            Belum Ada Data Transaksi untuk Menghitung Rasio Kesehatan Keuangan
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-lg mx-auto">
            Catat transaksi pemasukan, pengeluaran, tabungan, atau kewajiban cicilan Anda agar rasio likuiditas, DTI, dan rasio tabungan dapat dibandingkan dengan standar CFP.
          </p>
          {onAddTransaction && (
            <button
              type="button"
              onClick={onAddTransaction}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold transition cursor-pointer"
            >
              <PlusCircle className="h-4 w-4" />
              Catat Transaksi Pertama
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* LEFT 7 COLS: 3 RATIO CARDS */}
          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Card 1: Rasio Likuiditas */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 flex flex-col justify-between space-y-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Likuiditas Kas
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${liquidityBadge.badge}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${liquidityBadge.dot}`} />
                    {liquidityBadge.text}
                  </span>
                </div>

                <div>
                  <div className="text-2xl font-black font-mono tabular-nums text-slate-900 dark:text-slate-100">
                    {metrics.liquidityRatio >= 99 ? '∞' : `${metrics.liquidityRatio.toFixed(2)}x`}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
                    Cadangan {metrics.emergencyMonths.toFixed(1)} bln pengeluaran
                  </p>
                </div>
              </div>

              <div className="pt-2.5 border-t border-slate-200/70 dark:border-slate-700/70 space-y-1 text-[11px]">
                <div className="flex justify-between gap-1 text-slate-600 dark:text-slate-300">
                  <span>Kas & Darurat:</span>
                  <span className="font-mono tabular-nums font-bold">
                    {maskMoney(metrics.liquidCash + metrics.emergencyBalance)}
                  </span>
                </div>
                <div className="flex justify-between gap-1 text-slate-500 dark:text-slate-400">
                  <span>Standar CFP:</span>
                  <span className="font-mono tabular-nums font-bold text-slate-700 dark:text-slate-200">
                    &ge; 1.50x
                  </span>
                </div>
              </div>
            </div>

            {/* Card 2: Rasio Beban Utang (DTI) */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 flex flex-col justify-between space-y-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Beban Utang (DTI)
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${dtiBadge.badge}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${dtiBadge.dot}`} />
                    {dtiBadge.text}
                  </span>
                </div>

                <div>
                  <div className="text-2xl font-black font-mono tabular-nums text-slate-900 dark:text-slate-100">
                    {metrics.dtiRatio.toFixed(1)}%
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
                    Porsi cicilan terhadap pemasukan
                  </p>
                </div>
              </div>

              <div className="pt-2.5 border-t border-slate-200/70 dark:border-slate-700/70 space-y-1 text-[11px]">
                <div className="flex justify-between gap-1 text-slate-600 dark:text-slate-300">
                  <span>Cicilan / Bln:</span>
                  <span className="font-mono tabular-nums font-bold">
                    {maskMoney(metrics.monthlyDebtService)}
                  </span>
                </div>
                <div className="flex justify-between gap-1 text-slate-500 dark:text-slate-400">
                  <span>Batas CFP:</span>
                  <span className="font-mono tabular-nums font-bold text-slate-700 dark:text-slate-200">
                    &le; 30.0%
                  </span>
                </div>
              </div>
            </div>

            {/* Card 3: Rasio Tabungan */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 flex flex-col justify-between space-y-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Rasio Tabungan
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${savingsBadge.badge}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${savingsBadge.dot}`} />
                    {metrics.savingsStatus === 'danger' ? 'Kurang' : savingsBadge.text}
                  </span>
                </div>

                <div>
                  <div className="text-2xl font-black font-mono tabular-nums text-slate-900 dark:text-slate-100">
                    {metrics.savingsRatio.toFixed(1)}%
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
                    Alokasi tabungan & investasi
                  </p>
                </div>
              </div>

              <div className="pt-2.5 border-t border-slate-200/70 dark:border-slate-700/70 space-y-1 text-[11px]">
                <div className="flex justify-between gap-1 text-slate-600 dark:text-slate-300">
                  <span>Tabung / Bln:</span>
                  <span className="font-mono tabular-nums font-bold">
                    {maskMoney(metrics.monthlySavingsAndInvest)}
                  </span>
                </div>
                <div className="flex justify-between gap-1 text-slate-500 dark:text-slate-400">
                  <span>Target CFP:</span>
                  <span className="font-mono tabular-nums font-bold text-slate-700 dark:text-slate-200">
                    &ge; 20.0%
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT 5 COLS: RECHARTS CFP BENCHMARK COMPARISON CHART */}
          <div className="lg:col-span-5 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/30 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div>
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                  Aktual vs Standar Benchmark CFP
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Perbandingan persentase rasio bulan ini terhadap standar CFP
                </p>
              </div>
            </div>

            <div className="h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 10, right: 10, left: -16, bottom: 0 }}
                  barGap={6}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: '#475569', fontSize: 11, fontWeight: 700 }}
                    axisLine={{ stroke: '#cbd5e1' }}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v) => `${v}%`}
                    domain={[0, 200]}
                    tick={{ fill: '#64748b', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <ReferenceLine y={100} stroke="#cbd5e1" strokeDasharray="2 2" />
                  <Tooltip
                    cursor={{ fill: 'rgba(148, 163, 184, 0.12)' }}
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null;
                      const row = payload[0].payload;
                      return (
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 shadow-lg text-xs space-y-1">
                          <div className="font-extrabold text-slate-900 dark:text-slate-100 flex items-center justify-between gap-3">
                            <span>{row.name}</span>
                            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
                              {row.statusText}
                            </span>
                          </div>
                          <div className="flex justify-between gap-4 text-slate-600 dark:text-slate-300">
                            <span>Kondisi Aktual:</span>
                            <span className="font-mono tabular-nums font-bold text-blue-600 dark:text-blue-400">
                              {row.actualLabel}
                            </span>
                          </div>
                          <div className="flex justify-between gap-4 text-slate-500 dark:text-slate-400">
                            <span>Standar CFP:</span>
                            <span className="font-mono tabular-nums font-bold text-slate-800 dark:text-slate-200">
                              {row.targetLabel}
                            </span>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: '11px', fontWeight: 700, paddingTop: '6px' }}
                  />
                  <Bar dataKey="Aktual" name="Aktual Anda" fill="#2563eb" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="Standar CFP" name="Standar CFP" fill="#94a3b8" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
