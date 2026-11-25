import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CreditCard,
  FolderSearch,
  PiggyBank,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import {
  Account,
  EmergencyFundConfig,
  EmergencyFundTransaction,
  Transaction,
} from '../types';
import {
  calculateTotalEmergencyFund,
  getAccountCreditBill,
  isCreditAccount,
  normalizeLedgerDateYYYYMMDD,
  parseLocalDate,
  toLocalYYYYMMDD,
} from '../utils/accountingEngine';
import { formatterIDR } from '../utils/formatters';
import { showToast } from '../utils/toast';

interface DashboardHealthScannerCardProps {
  transactions: Transaction[];
  accounts: Account[];
  emergencyConfig: EmergencyFundConfig;
  emergencyTransactions: EmergencyFundTransaction[];
  isFocusMode?: boolean;
  onQuickAction: (tab: string) => void;
}

const UNCATEGORIZED_TOKENS = new Set([
  '',
  '-',
  'none',
  'null',
  'n/a',
  'tanpa kategori',
  'uncategorized',
  'tidak berkategori',
]);

export const DashboardHealthScannerCard: React.FC<DashboardHealthScannerCardProps> = ({
  transactions,
  accounts,
  emergencyConfig,
  emergencyTransactions,
  isFocusMode = false,
  onQuickAction,
}) => {
  const [lastManualScanTime, setLastManualScanTime] = useState<string>(() =>
    new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
  );

  const maskMoney = (amount: number) =>
    isFocusMode ? 'Rp ••••••' : formatterIDR.format(amount);

  const scanResults = useMemo(() => {
    // 1. Scan transaksi tanpa kategori
    const uncategorizedTxs = transactions.filter((tx) => {
      const normalized = (tx.category || '').trim().toLowerCase();
      return UNCATEGORIZED_TOKENS.has(normalized);
    });
    const uncategorizedAmount = uncategorizedTxs.reduce(
      (sum, tx) => sum + Math.abs(tx.amount || 0),
      0
    );

    // 2. Scan akun tidak aktif (>90 hari tanpa transaksi atau saldo Rp 0)
    const todayStr = toLocalYYYYMMDD();
    const todayDate = parseLocalDate(todayStr);
    const latestTxDateByAccount = new Map<string, string>();

    transactions.forEach((tx) => {
      if (!tx.accountId) return;
      const normDate = normalizeLedgerDateYYYYMMDD(tx.date);
      if (!normDate) return;
      const currentLatest = latestTxDateByAccount.get(tx.accountId);
      if (!currentLatest || normDate > currentLatest) {
        latestTxDateByAccount.set(tx.accountId, normDate);
      }
    });

    const inactiveAccounts = accounts
      .map((acc) => {
        const lastDateStr = latestTxDateByAccount.get(acc.id);
        let daysSinceLastTx: number | null = null;
        if (lastDateStr) {
          const lastDate = parseLocalDate(lastDateStr);
          daysSinceLastTx = Math.floor(
            (todayDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
          );
        }

        const isZeroBalance = isCreditAccount(acc)
          ? acc.currentBalance === 0 && getAccountCreditBill(acc) === 0
          : Math.abs(acc.currentBalance || 0) === 0;

        const isDormant90Days =
          daysSinceLastTx === null || daysSinceLastTx > 90;

        if (!isZeroBalance && !isDormant90Days) return null;

        const reasons: string[] = [];
        if (daysSinceLastTx === null) {
          reasons.push('Belum ada mutasi transaksi');
        } else if (daysSinceLastTx > 90) {
          reasons.push(`Tanpa transaksi ${daysSinceLastTx} hari`);
        }
        if (isZeroBalance) {
          reasons.push('Saldo Rp 0');
        }

        return {
          id: acc.id,
          name: acc.name,
          reason: reasons.join(' · '),
        };
      })
      .filter((item): item is { id: string; name: string; reason: string } => item !== null);

    // 3. Evaluasi target saldo dana darurat
    const stabilityMultiplier =
      emergencyConfig.jobStability === 'high'
        ? 3
        : emergencyConfig.jobStability === 'medium'
        ? 6
        : 9;
    const totalMonthsTarget =
      stabilityMultiplier + Math.max(0, emergencyConfig.dependents || 0);
    const monthlyBaseExpense = Math.max(0, emergencyConfig.monthlyExpense || 0);
    const recommendedEmergencyTarget = monthlyBaseExpense * totalMonthsTarget;
    const currentEmergencyBalance = calculateTotalEmergencyFund(emergencyTransactions);
    const emergencyDeficit = Math.max(
      0,
      recommendedEmergencyTarget - currentEmergencyBalance
    );
    const emergencyProgressPct =
      recommendedEmergencyTarget > 0
        ? Math.min(
            100,
            Math.round((currentEmergencyBalance / recommendedEmergencyTarget) * 100)
          )
        : 0;

    const emergencyStatus: 'healthy' | 'below_target' | 'unconfigured' =
      recommendedEmergencyTarget <= 0
        ? 'unconfigured'
        : currentEmergencyBalance < recommendedEmergencyTarget
        ? 'below_target'
        : 'healthy';

    const issueCount =
      (uncategorizedTxs.length > 0 ? 1 : 0) +
      (inactiveAccounts.length > 0 ? 1 : 0) +
      (emergencyStatus !== 'healthy' ? 1 : 0);

    return {
      uncategorizedTxs,
      uncategorizedAmount,
      inactiveAccounts,
      totalAccounts: accounts.length,
      totalMonthsTarget,
      recommendedEmergencyTarget,
      currentEmergencyBalance,
      emergencyDeficit,
      emergencyProgressPct,
      emergencyStatus,
      issueCount,
    };
  }, [transactions, accounts, emergencyConfig, emergencyTransactions]);

  const handleManualRescan = () => {
    const nowTime = new Date().toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
    });
    setLastManualScanTime(nowTime);
    showToast({
      type: scanResults.issueCount === 0 ? 'success' : 'warning',
      title: 'Pemeriksaan Kesehatan Keuangan Selesai',
      message:
        scanResults.issueCount === 0
          ? 'Tidak ada transaksi tanpa kategori, akun tidak aktif, maupun kekurangan dana darurat.'
          : `Ditemukan ${scanResults.issueCount} area yang memerlukan perhatian di Dashboard.`,
    });
  };

  return (
    <section className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-5">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div className="flex items-start sm:items-center gap-3">
          <div
            className={`p-2.5 rounded-xl shrink-0 ${
              scanResults.issueCount === 0
                ? 'bg-emerald-600 text-white'
                : 'bg-amber-600 text-white'
            }`}
          >
            {scanResults.issueCount === 0 ? (
              <ShieldCheck className="h-5 w-5" />
            ) : (
              <ShieldAlert className="h-5 w-5" />
            )}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-black text-slate-900 dark:text-slate-100 tracking-tight">
                Pemeriksaan Kesehatan Keuangan
              </h2>
              <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                · Scan Otomatis {lastManualScanTime} ·{' '}
                {scanResults.issueCount === 0
                  ? 'Semua Normal'
                  : `${scanResults.issueCount} Peringatan`}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
              Memindai transaksi tanpa kategori, rekening tidak aktif (&gt; 90 hari tanpa mutasi atau saldo Rp 0), serta kecukupan dana darurat terhadap target ideal.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleManualRescan}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0 self-start sm:self-auto"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Pindai Ulang</span>
        </button>
      </div>

      {/* Explicit Emergency Fund Below-Target Warning Banner */}
      {scanResults.emergencyStatus === 'below_target' && (
        <div className="p-4 rounded-xl border border-rose-200 dark:border-rose-800/80 bg-rose-50/70 dark:bg-rose-950/30 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="text-xs font-extrabold text-rose-900 dark:text-rose-200">
                Peringatan: Saldo Dana Darurat di Bawah Target Ideal ({scanResults.emergencyProgressPct}%)
              </p>
              <p className="text-xs text-rose-800 dark:text-rose-300 font-medium">
                Saldo saat ini{' '}
                <span className="font-mono tabular-nums font-bold">
                  {maskMoney(scanResults.currentEmergencyBalance)}
                </span>{' '}
                dari target {scanResults.totalMonthsTarget} bulan pengeluaran{' '}
                <span className="font-mono tabular-nums font-bold">
                  {maskMoney(scanResults.recommendedEmergencyTarget)}
                </span>
                . Kekurangan sebesar{' '}
                <span className="font-mono tabular-nums font-extrabold">
                  {maskMoney(scanResults.emergencyDeficit)}
                </span>
                .
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onQuickAction('emergency-fund')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0 self-start md:self-center"
          >
            <span>Isi Dana Darurat</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* 3-Card Health Scan Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
        {/* Check 1: Transaksi Tanpa Kategori */}
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                <FolderSearch className="h-4 w-4 text-slate-500 dark:text-slate-400 shrink-0" />
                <span>Transaksi Tanpa Kategori</span>
              </span>
              <span
                className={`inline-flex items-center gap-1 text-[11px] font-bold ${
                  scanResults.uncategorizedTxs.length > 0
                    ? 'text-amber-700 dark:text-amber-400'
                    : 'text-emerald-700 dark:text-emerald-400'
                }`}
              >
                {scanResults.uncategorizedTxs.length > 0 ? (
                  <>
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    <span>Perlu Kategori</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                    <span>Lengkap</span>
                  </>
                )}
              </span>
            </div>

            <div>
              <div className="text-2xl font-black font-mono tabular-nums text-slate-900 dark:text-slate-100">
                {scanResults.uncategorizedTxs.length}{' '}
                <span className="text-xs font-sans font-semibold text-slate-500 dark:text-slate-400">
                  dari {transactions.length} transaksi
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                {scanResults.uncategorizedTxs.length > 0 ? (
                  <>
                    Total nilai belum terkategori{' '}
                    <span className="font-mono tabular-nums font-bold text-slate-700 dark:text-slate-200">
                      {maskMoney(scanResults.uncategorizedAmount)}
                    </span>
                    .
                  </>
                ) : (
                  'Seluruh transaksi telah memiliki kategori yang jelas untuk laporan dan anggaran.'
                )}
              </p>
            </div>

            {scanResults.uncategorizedTxs.length > 0 && (
              <div className="pt-2 border-t border-slate-200/70 dark:border-slate-700/70 space-y-1 text-[11px] text-slate-600 dark:text-slate-300">
                {scanResults.uncategorizedTxs.slice(0, 2).map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between gap-2 truncate">
                    <span className="truncate">
                      {tx.description || 'Transaksi tanpa keterangan'}
                    </span>
                    <span className="font-mono tabular-nums font-semibold shrink-0">
                      {maskMoney(tx.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => onQuickAction('transactions')}
            className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0"
          >
            <span>
              {scanResults.uncategorizedTxs.length > 0
                ? 'Lengkapi di Jurnal Transaksi'
                : 'Buka Jurnal Transaksi'}
            </span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Check 2: Akun Tidak Aktif */}
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                <CreditCard className="h-4 w-4 text-slate-500 dark:text-slate-400 shrink-0" />
                <span>Akun Tidak Aktif</span>
              </span>
              <span
                className={`inline-flex items-center gap-1 text-[11px] font-bold ${
                  scanResults.inactiveAccounts.length > 0
                    ? 'text-amber-700 dark:text-amber-400'
                    : 'text-emerald-700 dark:text-emerald-400'
                }`}
              >
                {scanResults.inactiveAccounts.length > 0 ? (
                  <>
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    <span>Perlu Tinjauan</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                    <span>Semua Aktif</span>
                  </>
                )}
              </span>
            </div>

            <div>
              <div className="text-2xl font-black font-mono tabular-nums text-slate-900 dark:text-slate-100">
                {scanResults.inactiveAccounts.length}{' '}
                <span className="text-xs font-sans font-semibold text-slate-500 dark:text-slate-400">
                  dari {scanResults.totalAccounts} rekening
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                {scanResults.totalAccounts === 0
                  ? 'Belum ada rekening terdaftar pada Master Akun.'
                  : scanResults.inactiveAccounts.length > 0
                  ? 'Akun tanpa transaksi lebih dari 90 hari atau bersaldo Rp 0.'
                  : 'Seluruh rekening aktif bertransaksi dalam 90 hari terakhir dengan saldo positif.'}
              </p>
            </div>

            {scanResults.inactiveAccounts.length > 0 && (
              <div className="pt-2 border-t border-slate-200/70 dark:border-slate-700/70 space-y-1 text-[11px] text-slate-600 dark:text-slate-300">
                {scanResults.inactiveAccounts.slice(0, 3).map((acc) => (
                  <div key={acc.id} className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                      {acc.name}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400 truncate shrink-0">
                      {acc.reason}
                    </span>
                  </div>
                ))}
                {scanResults.inactiveAccounts.length > 3 && (
                  <div className="text-[11px] text-slate-400">
                    +{scanResults.inactiveAccounts.length - 3} rekening tidak aktif lainnya
                  </div>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => onQuickAction('accounts')}
            className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0"
          >
            <span>Kelola Master Akun</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Check 3: Saldo Dana Darurat vs Target */}
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                <PiggyBank className="h-4 w-4 text-slate-500 dark:text-slate-400 shrink-0" />
                <span>Target Dana Darurat</span>
              </span>
              <span
                className={`inline-flex items-center gap-1 text-[11px] font-bold ${
                  scanResults.emergencyStatus === 'healthy'
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : scanResults.emergencyStatus === 'below_target'
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-amber-700 dark:text-amber-400'
                }`}
              >
                {scanResults.emergencyStatus === 'healthy' ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                    <span>Target Tercapai</span>
                  </>
                ) : scanResults.emergencyStatus === 'below_target' ? (
                  <>
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    <span>Di Bawah Target</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    <span>Belum Diatur</span>
                  </>
                )}
              </span>
            </div>

            <div>
              <div className="text-2xl font-black font-mono tabular-nums text-slate-900 dark:text-slate-100">
                {scanResults.emergencyStatus === 'unconfigured'
                  ? maskMoney(scanResults.currentEmergencyBalance)
                  : `${scanResults.emergencyProgressPct}%`}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                {scanResults.emergencyStatus === 'unconfigured' ? (
                  'Pengeluaran bulanan target dana darurat belum ditetapkan.'
                ) : (
                  <>
                    Saldo{' '}
                    <span className="font-mono tabular-nums font-bold text-slate-700 dark:text-slate-200">
                      {maskMoney(scanResults.currentEmergencyBalance)}
                    </span>{' '}
                    /{' '}
                    <span className="font-mono tabular-nums font-bold text-slate-700 dark:text-slate-200">
                      {maskMoney(scanResults.recommendedEmergencyTarget)}
                    </span>{' '}
                    ({scanResults.totalMonthsTarget} bln).
                  </>
                )}
              </p>
            </div>

            {scanResults.emergencyStatus !== 'unconfigured' && (
              <div className="space-y-1.5 pt-1">
                <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      scanResults.emergencyStatus === 'healthy'
                        ? 'bg-emerald-600'
                        : 'bg-rose-600'
                    }`}
                    style={{ width: `${scanResults.emergencyProgressPct}%` }}
                  />
                </div>
                {scanResults.emergencyDeficit > 0 && (
                  <div className="flex justify-between text-[11px] font-semibold text-rose-700 dark:text-rose-400">
                    <span>Kekurangan:</span>
                    <span className="font-mono tabular-nums">
                      {maskMoney(scanResults.emergencyDeficit)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => onQuickAction('emergency-fund')}
            className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0"
          >
            <span>
              {scanResults.emergencyStatus === 'unconfigured'
                ? 'Atur Target Dana Darurat'
                : scanResults.emergencyStatus === 'below_target'
                ? 'Top Up Dana Darurat'
                : 'Kelola Dana Darurat'}
            </span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </section>
  );
};
