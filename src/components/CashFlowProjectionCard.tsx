import React, { useMemo, useState } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { Wallet, AlertTriangle, TrendingUp, CalendarRange } from 'lucide-react';
import { Account, Debt, RecurringTransaction, Transaction } from '../types';
import {
  getLiquidAccounts,
  isOperatingExpense,
  isOperatingIncome,
  normalizeLedgerDateYYYYMMDD,
  toLocalYYYYMMDD,
} from '../utils/accountingEngine';
import { formatterIDR } from '../utils/formatters';

interface CashFlowProjectionCardProps {
  accounts: Account[];
  transactions: Transaction[];
  recurringTransactions: RecurringTransaction[];
  debts: Debt[];
}

interface ProjectionRow {
  stepLabel: string;
  ym: string;
  isCurrentAnchor: boolean;
  startingBalance: number;
  inflow: number;
  recurringInflow: number;
  variableInflow: number;
  operatingOutflow: number;
  recurringOutflow: number;
  variableOutflow: number;
  debtPayment: number;
  netCashFlow: number;
  projectedBalance: number;
}

const MONTHS_SHORT_ID = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
];

function formatMonthLabel(ym: string): string {
  const [yStr, mStr] = ym.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return ym;
  return `${MONTHS_SHORT_ID[m - 1]} ${String(y).slice(-2)}`;
}

function shiftMonthYYYYMM(baseYM: string, deltaMonths: number): string {
  const [yStr, mStr] = baseYM.split('-');
  const baseDate = new Date(Number(yStr), Number(mStr) - 1 + deltaMonths, 1);
  return `${baseDate.getFullYear()}-${String(baseDate.getMonth() + 1).padStart(2, '0')}`;
}

function formatCompactIDR(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}M`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}Jt`;
  if (abs >= 1_000) return `${Math.round(value / 1_000)}rb`;
  return String(Math.round(value));
}

export const CashFlowProjectionCard: React.FC<CashFlowProjectionCardProps> = ({
  accounts,
  transactions,
  recurringTransactions,
  debts,
}) => {
  const liquidAccounts = useMemo(() => getLiquidAccounts(accounts), [accounts]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('all');
  const [includeVariableHistory, setIncludeVariableHistory] = useState<boolean>(true);
  const [includeDebtInSingleAccount, setIncludeDebtInSingleAccount] = useState<boolean>(false);

  const effectiveAccountId = useMemo(() => {
    if (selectedAccountId === 'all') return 'all';
    const exists = liquidAccounts.some((a) => a.id === selectedAccountId);
    return exists ? selectedAccountId : 'all';
  }, [selectedAccountId, liquidAccounts]);

  const includeDebts =
    effectiveAccountId === 'all' ? true : includeDebtInSingleAccount;

  const {
    projectionRows,
    startingBalance,
    avgNetCashFlowPerMonth,
    totalThreeMonthDebtPayments,
    monthThreeEndingBalance,
    firstDeficitRow,
    activeRecurringCount,
    activeDebtCount,
  } = useMemo(() => {
    const liquidAccountSet = new Set(liquidAccounts.map((a) => a.id));
    const scopedAccounts =
      effectiveAccountId === 'all'
        ? liquidAccounts
        : liquidAccounts.filter((a) => a.id === effectiveAccountId);

    const initialLiquidBalance = scopedAccounts.reduce(
      (sum, acc) => sum + (Number(acc.currentBalance) || 0),
      0
    );

    const activeRecurring = recurringTransactions.filter((r) => {
      if (!r.isActive || r.amount <= 0) return false;
      if (effectiveAccountId === 'all') {
        return !r.accountId || liquidAccountSet.has(r.accountId);
      }
      return r.accountId === effectiveAccountId;
    });

    const recurringIncomePerMonth = activeRecurring
      .filter((r) => r.type === 'income')
      .reduce((sum, r) => sum + Math.abs(r.amount || 0), 0);

    const recurringOutflowPerMonth = activeRecurring
      .filter((r) => r.type !== 'income')
      .reduce((sum, r) => sum + Math.abs(r.amount || 0), 0);

    // Build signature set of active recurring items to avoid double-counting in historical average
    const recurringSignatures = new Set(
      activeRecurring.map(
        (r) =>
          `${r.type}|${(r.category || '').trim().toLowerCase()}|${Math.round(
            Math.abs(r.amount || 0)
          )}`
      )
    );

    const currentYM = toLocalYYYYMMDD().slice(0, 7);
    const trailingThreeMonths = [
      shiftMonthYYYYMM(currentYM, -1),
      shiftMonthYYYYMM(currentYM, -2),
      shiftMonthYYYYMM(currentYM, -3),
    ];
    const trailingSet = new Set(trailingThreeMonths);
    const monthsWithHistory = new Set<string>();

    let variableIncomeSum = 0;
    let variableExpenseSum = 0;

    transactions.forEach((tx) => {
      if (tx.amount <= 0) return;
      if (effectiveAccountId === 'all') {
        if (tx.accountId && !liquidAccountSet.has(tx.accountId) && accounts.some((a) => a.id === tx.accountId)) {
          // Include operating flows cleanly even when paid via CC, or scope to liquid accounts?
          // Keep cash-flow grounded to liquid account movements when filtering a single account,
          // and all operating income/expense when viewing 'all' liquid accounts.
        }
      } else if (tx.accountId !== effectiveAccountId) {
        return;
      }

      const normDate = normalizeLedgerDateYYYYMMDD(tx.date);
      if (!normDate) return;
      const ym = normDate.slice(0, 7);
      if (!trailingSet.has(ym)) return;

      const absAmt = Math.abs(tx.amount || 0);
      const sig = `${tx.type}|${(tx.category || '').trim().toLowerCase()}|${Math.round(absAmt)}`;
      if (recurringSignatures.has(sig)) return;

      if (isOperatingIncome(tx)) {
        monthsWithHistory.add(ym);
        variableIncomeSum += absAmt;
      } else if (isOperatingExpense(tx)) {
        monthsWithHistory.add(ym);
        variableExpenseSum += absAmt;
      }
    });

    const divisor = Math.max(1, monthsWithHistory.size || 3);
    const avgVarIncome = includeVariableHistory
      ? Math.round(variableIncomeSum / divisor)
      : 0;
    const avgVarExpense = includeVariableHistory
      ? Math.round(variableExpenseSum / divisor)
      : 0;

    // Simulate active debt balances over the next 3 months
    const simDebts = debts
      .filter((d) => (d.balance || 0) > 0 && (d.minPayment || 0) > 0)
      .map((d) => ({
        remainingBalance: Math.max(0, d.balance || 0),
        minPayment: Math.max(0, d.minPayment || 0),
        monthlyRate: Math.max(0, d.interestRate || 0) / 100 / 12,
      }));

    const rows: ProjectionRow[] = [
      {
        stepLabel: 'Saat Ini',
        ym: currentYM,
        isCurrentAnchor: true,
        startingBalance: Math.round(initialLiquidBalance),
        inflow: 0,
        recurringInflow: 0,
        variableInflow: 0,
        operatingOutflow: 0,
        recurringOutflow: 0,
        variableOutflow: 0,
        debtPayment: 0,
        netCashFlow: 0,
        projectedBalance: Math.round(initialLiquidBalance),
      },
    ];

    let runningBalance = initialLiquidBalance;
    let totalDebtPaid = 0;

    for (let step = 1; step <= 3; step++) {
      const targetYM = shiftMonthYYYYMM(currentYM, step);
      let monthlyDebtOutflow = 0;

      if (includeDebts) {
        simDebts.forEach((d) => {
          if (d.remainingBalance <= 0) return;
          const accruedInterest = d.remainingBalance * d.monthlyRate;
          const totalOwedThisMonth = d.remainingBalance + accruedInterest;
          const payment = Math.min(totalOwedThisMonth, d.minPayment);
          d.remainingBalance = Math.max(0, totalOwedThisMonth - payment);
          monthlyDebtOutflow += payment;
        });
      }

      const totalInflow = Math.round(recurringIncomePerMonth + avgVarIncome);
      const totalOpOutflow = Math.round(recurringOutflowPerMonth + avgVarExpense);
      const roundedDebt = Math.round(monthlyDebtOutflow);
      const netFlow = totalInflow - totalOpOutflow - roundedDebt;
      const monthStart = Math.round(runningBalance);
      runningBalance = runningBalance + netFlow;
      totalDebtPaid += roundedDebt;

      rows.push({
        stepLabel: formatMonthLabel(targetYM),
        ym: targetYM,
        isCurrentAnchor: false,
        startingBalance: monthStart,
        inflow: totalInflow,
        recurringInflow: Math.round(recurringIncomePerMonth),
        variableInflow: avgVarIncome,
        operatingOutflow: totalOpOutflow,
        recurringOutflow: Math.round(recurringOutflowPerMonth),
        variableOutflow: avgVarExpense,
        debtPayment: roundedDebt,
        netCashFlow: Math.round(netFlow),
        projectedBalance: Math.round(runningBalance),
      });
    }

    const forwardRows = rows.slice(1);
    const avgNet =
      forwardRows.length > 0
        ? Math.round(
            forwardRows.reduce((s, r) => s + r.netCashFlow, 0) / forwardRows.length
          )
        : 0;
    const deficit = forwardRows.find((r) => r.projectedBalance < 0) || null;
    const endingM3 = forwardRows[forwardRows.length - 1]?.projectedBalance ?? initialLiquidBalance;

    return {
      projectionRows: rows,
      startingBalance: Math.round(initialLiquidBalance),
      avgNetCashFlowPerMonth: avgNet,
      totalThreeMonthDebtPayments: Math.round(totalDebtPaid),
      monthThreeEndingBalance: Math.round(endingM3),
      firstDeficitRow: deficit,
      activeRecurringCount: activeRecurring.length,
      activeDebtCount: simDebts.length,
    };
  }, [
    accounts,
    liquidAccounts,
    effectiveAccountId,
    recurringTransactions,
    transactions,
    debts,
    includeVariableHistory,
    includeDebts,
  ]);

  const hasNegativeProjection = projectionRows.some((r) => r.projectedBalance < 0);

  return (
    <section className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-5">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-blue-600 text-white shrink-0">
            <TrendingUp className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                Proyeksi Arus Kas 3 Bulan Ke Depan (Cash Flow Projection)
              </h3>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                · {activeRecurringCount} jadwal rutin · {activeDebtCount} kewajiban utang
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
              Simulasi saldo kas likuid selama 90 hari ke depan dari pendapatan rutin, tren pengeluaran historis, dan jadwal cicilan utang.
            </p>
          </div>
        </div>

        {/* Scope & Calculation Controls */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <select
            value={effectiveAccountId}
            onChange={(e) => setSelectedAccountId(e.target.value)}
            aria-label="Pilih cakupan rekening proyeksi arus kas"
            className="px-3 py-2 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-blue-500/30 cursor-pointer"
          >
            <option value="all">Semua Rekening Likuid ({liquidAccounts.length})</option>
            {liquidAccounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.name} ({formatterIDR.format(acc.currentBalance || 0)})
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setIncludeVariableHistory((prev) => !prev)}
            aria-pressed={includeVariableHistory}
            className={`px-3 py-2 rounded-lg text-xs font-semibold border transition cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
              includeVariableHistory
                ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300'
                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
            }`}
          >
            <CalendarRange className="h-3.5 w-3.5" />
            <span>{includeVariableHistory ? 'Rutin + Tren Historis' : 'Jadwal Rutin Saja'}</span>
          </button>

          {effectiveAccountId !== 'all' && activeDebtCount > 0 && (
            <button
              type="button"
              onClick={() => setIncludeDebtInSingleAccount((prev) => !prev)}
              aria-pressed={includeDebtInSingleAccount}
              className={`px-3 py-2 rounded-lg text-xs font-semibold border transition cursor-pointer whitespace-nowrap shrink-0 ${
                includeDebtInSingleAccount
                  ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300'
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              {includeDebtInSingleAccount ? 'Termasuk Cicilan Utang' : 'Tanpa Cicilan Utang'}
            </button>
          )}
        </div>
      </div>

      {liquidAccounts.length === 0 ? (
        <div className="py-10 px-4 text-center border border-dashed border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-slate-800/30 space-y-2">
          <Wallet className="h-7 w-7 text-slate-400 mx-auto" />
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
            Belum Ada Rekening Kas Likuid
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Tambahkan rekening Kas, Bank, atau e-Wallet untuk menjalankan proyeksi saldo 3 bulan ke depan.
          </p>
        </div>
      ) : (
        <>
          {/* Deficit Warning Banner */}
          {firstDeficitRow && (
            <div className="p-4 rounded-xl border border-rose-200 dark:border-rose-800/80 bg-rose-50/70 dark:bg-rose-950/30 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div className="text-xs space-y-0.5">
                <p className="font-bold text-rose-900 dark:text-rose-200">
                  Peringatan Risiko Defisit Kas pada {firstDeficitRow.stepLabel}
                </p>
                <p className="text-rose-800 dark:text-rose-300">
                  Saldo diproyeksikan turun ke{' '}
                  <span className="font-mono tabular-nums font-bold">
                    {formatterIDR.format(firstDeficitRow.projectedBalance)}
                  </span>{' '}
                  akibat arus kas keluar &amp; cicilan utang lebih besar dari estimasi pemasukan. Pertimbangkan menekan pengeluaran variabel atau mengalihkan dana ke rekening terkait.
                </p>
              </div>
            </div>
          )}

          {/* 4-Column KPI Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 space-y-1">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block">
                Saldo Kas Likuid Saat Ini
              </span>
              <span className="text-base font-extrabold font-mono tabular-nums text-slate-900 dark:text-slate-100 block">
                {formatterIDR.format(startingBalance)}
              </span>
            </div>

            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 space-y-1">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block">
                Est. Arus Kas Bersih / Bln
              </span>
              <span
                className={`text-base font-extrabold font-mono tabular-nums block ${
                  avgNetCashFlowPerMonth >= 0
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {avgNetCashFlowPerMonth >= 0 ? '+' : ''}
                {formatterIDR.format(avgNetCashFlowPerMonth)}
              </span>
            </div>

            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 space-y-1">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block">
                Total Cicilan Utang (3 Bln)
              </span>
              <span className="text-base font-extrabold font-mono tabular-nums text-slate-900 dark:text-slate-100 block">
                {formatterIDR.format(totalThreeMonthDebtPayments)}
              </span>
            </div>

            <div
              className={`p-3.5 rounded-xl border space-y-1 ${
                monthThreeEndingBalance < 0
                  ? 'border-rose-200 dark:border-rose-800/70 bg-rose-50/50 dark:bg-rose-950/20'
                  : 'border-blue-200 dark:border-blue-800/70 bg-blue-50/50 dark:bg-blue-950/20'
              }`}
            >
              <span
                className={`text-[11px] font-semibold block ${
                  monthThreeEndingBalance < 0
                    ? 'text-rose-700 dark:text-rose-300'
                    : 'text-blue-700 dark:text-blue-300'
                }`}
              >
                Proyeksi Saldo Bulan +3
              </span>
              <span
                className={`text-base font-extrabold font-mono tabular-nums block ${
                  monthThreeEndingBalance < 0
                    ? 'text-rose-700 dark:text-rose-200'
                    : 'text-blue-800 dark:text-blue-200'
                }`}
              >
                {formatterIDR.format(monthThreeEndingBalance)}
              </span>
            </div>
          </div>

          {/* Recharts Projection Visualization */}
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={projectionRows}
                margin={{ top: 12, right: 12, left: 4, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis
                  dataKey="stepLabel"
                  tick={{ fill: '#475569', fontSize: 11, fontWeight: 600 }}
                  axisLine={{ stroke: '#cbd5e1' }}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) => formatCompactIDR(Number(v) || 0)}
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={60}
                />
                {hasNegativeProjection && (
                  <ReferenceLine y={0} stroke="#dc2626" strokeDasharray="3 3" />
                )}
                <Tooltip
                  cursor={{ fill: 'rgba(148, 163, 184, 0.12)' }}
                  content={({ active, payload }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    const row = payload[0].payload as ProjectionRow;
                    return (
                      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 shadow-lg text-xs space-y-2 min-w-[250px]">
                        <div className="flex items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-1.5">
                          <span className="font-extrabold text-slate-900 dark:text-slate-100">
                            {row.stepLabel} ({row.ym})
                          </span>
                          <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                            {row.isCurrentAnchor ? 'Posisi Awal' : 'Proyeksi'}
                          </span>
                        </div>

                        {!row.isCurrentAnchor && (
                          <div className="space-y-1">
                            <div className="flex justify-between gap-4 text-emerald-700 dark:text-emerald-400 font-semibold">
                              <span>Est. Pemasukan:</span>
                              <span className="font-mono tabular-nums">
                                +{formatterIDR.format(row.inflow)}
                              </span>
                            </div>
                            <div className="flex justify-between gap-4 text-amber-700 dark:text-amber-400 font-semibold">
                              <span>Est. Pengeluaran:</span>
                              <span className="font-mono tabular-nums">
                                -{formatterIDR.format(row.operatingOutflow)}
                              </span>
                            </div>
                            <div className="flex justify-between gap-4 text-rose-600 dark:text-rose-400 font-semibold">
                              <span>Cicilan Utang:</span>
                              <span className="font-mono tabular-nums">
                                -{formatterIDR.format(row.debtPayment)}
                              </span>
                            </div>
                            <div
                              className={`flex justify-between gap-4 font-bold pt-1 border-t border-slate-100 dark:border-slate-800 ${
                                row.netCashFlow >= 0
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : 'text-rose-600 dark:text-rose-400'
                              }`}
                            >
                              <span>Arus Kas Bersih:</span>
                              <span className="font-mono tabular-nums">
                                {row.netCashFlow >= 0 ? '+' : ''}
                                {formatterIDR.format(row.netCashFlow)}
                              </span>
                            </div>
                          </div>
                        )}

                        <div className="pt-1 border-t border-slate-100 dark:border-slate-800 flex justify-between gap-4 font-extrabold text-blue-700 dark:text-blue-300">
                          <span>Saldo Akhir Proyeksi:</span>
                          <span className="font-mono tabular-nums">
                            {formatterIDR.format(row.projectedBalance)}
                          </span>
                        </div>
                      </div>
                    );
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', fontWeight: 600, paddingTop: '8px' }} />

                <Bar
                  dataKey="inflow"
                  name="Est. Pemasukan"
                  fill="#16a34a"
                  radius={[3, 3, 0, 0]}
                  barSize={26}
                />
                <Bar
                  dataKey="operatingOutflow"
                  name="Est. Pengeluaran"
                  stackId="outflow"
                  fill="#d97706"
                  barSize={26}
                />
                <Bar
                  dataKey="debtPayment"
                  name="Cicilan Utang"
                  stackId="outflow"
                  fill="#dc2626"
                  radius={[3, 3, 0, 0]}
                  barSize={26}
                />
                <Line
                  type="monotone"
                  dataKey="projectedBalance"
                  name="Proyeksi Saldo Rekening"
                  stroke="#2563eb"
                  strokeWidth={2.75}
                  dot={{ r: 4, fill: '#2563eb', strokeWidth: 1.5, stroke: '#ffffff' }}
                  activeDot={{ r: 6 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* 3-Month Forward Projection Breakdown Table */}
          <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/60 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 px-3 whitespace-nowrap">Bulan</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">Saldo Awal</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">Est. Pemasukan</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">Est. Pengeluaran</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">Cicilan Utang</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">Arus Kas Bersih</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">Proyeksi Saldo Akhir</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {projectionRows.slice(1).map((row) => (
                  <tr
                    key={row.ym}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      {row.stepLabel}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {formatterIDR.format(row.startingBalance)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                      +{formatterIDR.format(row.inflow)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-amber-700 dark:text-amber-400 whitespace-nowrap">
                      -{formatterIDR.format(row.operatingOutflow)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-rose-600 dark:text-rose-400 whitespace-nowrap">
                      -{formatterIDR.format(row.debtPayment)}
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right font-mono tabular-nums font-bold whitespace-nowrap ${
                        row.netCashFlow >= 0
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {row.netCashFlow >= 0 ? '+' : ''}
                      {formatterIDR.format(row.netCashFlow)}
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right font-mono tabular-nums font-extrabold whitespace-nowrap ${
                        row.projectedBalance < 0
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-blue-700 dark:text-blue-300'
                      }`}
                    >
                      {formatterIDR.format(row.projectedBalance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
};
