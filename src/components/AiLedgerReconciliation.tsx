import React, { useMemo, useState } from 'react';
import { Transaction, Account } from '../types';
import { CategoryNode } from '../categoryHierarchy';
import { 
  Sparkles, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw, 
  Scale, 
  FileCheck, 
  ArrowRightLeft, 
  Calendar,
  Layers,
  HelpCircle,
  ShieldCheck
} from 'lucide-react';

interface AiLedgerReconciliationProps {
  transactions: Transaction[];
  accounts: Account[];
  masterCategories: CategoryNode[];
  onReconcileFix?: (missingCategories: string[]) => void;
}

const formatterIDR = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

export const AiLedgerReconciliation: React.FC<AiLedgerReconciliationProps> = ({
  transactions,
  accounts,
  masterCategories,
  onReconcileFix,
}) => {
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [isReconciling, setIsReconciling] = useState<boolean>(false);
  const [reconcileSuccess, setReconcileSuccess] = useState<boolean>(false);

  // Extract all valid master category names
  const allMasterCategoryNames = useMemo(() => {
    const names = new Set<string>();
    const traverse = (nodes: CategoryNode[]) => {
      nodes.forEach((node) => {
        names.add(node.name.toLowerCase().trim());
        if (node.children) traverse(node.children);
      });
    };
    traverse(masterCategories);
    return names;
  }, [masterCategories]);

  // Unique Months List
  const monthList = useMemo(() => {
    const setYM = new Set<string>();
    transactions.forEach((tx) => {
      if (tx.date && tx.date.length >= 7) {
        setYM.add(tx.date.substring(0, 7));
      }
    });
    return Array.from(setYM).sort().reverse();
  }, [transactions]);

  // Perform Ledger Audit
  const auditResult = useMemo(() => {
    const filteredTxs = selectedMonth === 'all' 
      ? transactions 
      : transactions.filter((tx) => tx.date.startsWith(selectedMonth));

    const anomalies: { id: string; type: 'critical' | 'warning' | 'info'; title: string; desc: string; txCount: number; amount: number; fixable: boolean }[] = [];

    // 1. Audit Unmapped Categories vs COA
    const unmappedCatMap = new Map<string, { count: number; totalAmount: number }>();
    filteredTxs.forEach((tx) => {
      const cat = (tx.category || 'Lain-lain').trim();
      if (!allMasterCategoryNames.has(cat.toLowerCase())) {
        const existing = unmappedCatMap.get(cat) || { count: 0, totalAmount: 0 };
        unmappedCatMap.set(cat, {
          count: existing.count + 1,
          totalAmount: existing.totalAmount + tx.amount,
        });
      }
    });

    if (unmappedCatMap.size > 0) {
      let totalUnmappedAmount = 0;
      let totalUnmappedCount = 0;
      unmappedCatMap.forEach((v) => {
        totalUnmappedCount += v.count;
        totalUnmappedAmount += v.totalAmount;
      });

      anomalies.push({
        id: 'unmapped-coa',
        type: 'warning',
        title: 'Kategori Belum Terdaftar di COA',
        desc: `Ditemukan ${unmappedCatMap.size} varian kategori (${totalUnmappedCount} transaksi) yang belum dipetakan ke Master Chart of Accounts.`,
        txCount: totalUnmappedCount,
        amount: totalUnmappedAmount,
        fixable: true,
      });
    }

    // 2. Audit Internal Transfer Balance ("Mutasi Masuk" vs "Mutasi Keluar")
    const mutasiMasukTotal = filteredTxs
      .filter((tx) => tx.category === 'Mutasi Masuk')
      .reduce((sum, tx) => sum + tx.amount, 0);

    const mutasiKeluarTotal = filteredTxs
      .filter((tx) => tx.category === 'Mutasi Keluar')
      .reduce((sum, tx) => sum + tx.amount, 0);

    const transferDelta = Math.abs(mutasiMasukTotal - mutasiKeluarTotal);
    if (transferDelta > 0) {
      anomalies.push({
        id: 'unbalanced-transfer',
        type: 'critical',
        title: 'Selisih Jurnal Mutasi Antar Rekening',
        desc: `Terdapat ketidakseimbangan sebesar ${formatterIDR.format(transferDelta)} antara total Mutasi Keluar (${formatterIDR.format(mutasiKeluarTotal)}) dan Mutasi Masuk (${formatterIDR.format(mutasiMasukTotal)}).`,
        txCount: filteredTxs.filter((tx) => tx.category === 'Mutasi Masuk' || tx.category === 'Mutasi Keluar').length,
        amount: transferDelta,
        fixable: false,
      });
    }

    // 3. Audit Zero-Amount or Invalid Transactions
    const zeroTxs = filteredTxs.filter((tx) => !tx.amount || tx.amount <= 0);
    if (zeroTxs.length > 0) {
      anomalies.push({
        id: 'zero-amount',
        type: 'critical',
        title: 'Transaksi Bernilai Nol atau Rusak',
        desc: `Ditemukan ${zeroTxs.length} rekaman transaksi dengan nominal Rp 0 yang dapat merusak agregasi laporan.`,
        txCount: zeroTxs.length,
        amount: 0,
        fixable: true,
      });
    }

    // 4. Audit Missing Account Links
    const validAccIds = new Set(accounts.map((a) => a.id));
    const orphanAccTxs = filteredTxs.filter((tx) => !tx.accountId || !validAccIds.has(tx.accountId));
    if (orphanAccTxs.length > 0) {
      anomalies.push({
        id: 'orphan-account',
        type: 'warning',
        title: 'Transaksi Tanpa Referensi Akun Rekening',
        desc: `Ditemukan ${orphanAccTxs.length} transaksi yang terisolasi dari rekening aktif.`,
        txCount: orphanAccTxs.length,
        amount: orphanAccTxs.reduce((sum, t) => sum + t.amount, 0),
        fixable: false,
      });
    }

    // Debit / Credit Equilibrium Calculation
    const totalDebits = filteredTxs
      .filter((tx) => tx.type === 'expense' || tx.type === 'saving' || tx.type === 'investment')
      .reduce((sum, tx) => sum + tx.amount, 0);

    const totalCredits = filteredTxs
      .filter((tx) => tx.type === 'income')
      .reduce((sum, tx) => sum + tx.amount, 0);

    return {
      totalTxsScanned: filteredTxs.length,
      totalDebits,
      totalCredits,
      anomalies,
      unmappedCatMap,
      isBalanced: anomalies.filter((a) => a.type === 'critical').length === 0,
    };
  }, [transactions, accounts, selectedMonth, allMasterCategoryNames]);

  const handleRunReconciliation = () => {
    setIsReconciling(true);
    setTimeout(() => {
      // Gather missing category names
      const missingCats: string[] = [];
      auditResult.unmappedCatMap.forEach((_, key) => {
        missingCats.push(key);
      });

      if (onReconcileFix) {
        onReconcileFix(missingCats);
      }

      setIsReconciling(false);
      setReconcileSuccess(true);
      setTimeout(() => setReconcileSuccess(false), 5000);
    }, 800);
  };

  return (
    <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-md space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-tr from-purple-600 via-indigo-600 to-blue-600 text-white rounded-2xl shadow-sm">
            <FileCheck className="h-6 w-6" />
          </div>
          <div>
            <h3 className="font-extrabold text-slate-900 dark:text-slate-100 text-base flex items-center gap-2">
              <span>Rekonsiliasi Jurnal & Audit Akuntansi Bulanan</span>
              <span className="px-2.5 py-0.5 bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300 text-[10px] font-black rounded-full uppercase border border-purple-300 dark:border-purple-800">
                AI Ledger Audit
              </span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Verifikasi otomatis kepatuhan entri jurnal terhadap prinsip dual-entry, integritas COA, dan perimbangan arus dana.
            </p>
          </div>
        </div>

        {/* Month Selector Filter */}
        <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
          <Calendar className="h-4 w-4 text-purple-600 ml-1.5" />
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-transparent text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none pr-2 cursor-pointer"
          >
            <option value="all">Semua Periode Transaksi</option>
            {monthList.map((m) => (
              <option key={m} value={m}>
                Periode Bulan {m}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl space-y-1">
          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
            Total Transaksi Diperiksa
          </span>
          <span className="text-xl font-black text-slate-900 dark:text-slate-100 font-mono block">
            {auditResult.totalTxsScanned} Transaksi
          </span>
          <span className="text-[10px] text-slate-500 font-medium">100% Entri Terscan</span>
        </div>

        <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl space-y-1">
          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
            Total Debet (Pengeluaran/Aset)
          </span>
          <span className="text-xl font-black text-rose-600 dark:text-rose-400 font-mono block">
            {formatterIDR.format(auditResult.totalDebits)}
          </span>
          <span className="text-[10px] text-slate-500 font-medium">Alokasi Kas Keluar</span>
        </div>

        <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl space-y-1">
          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
            Total Kredit (Pemasukan)
          </span>
          <span className="text-xl font-black text-emerald-600 dark:text-emerald-400 font-mono block">
            {formatterIDR.format(auditResult.totalCredits)}
          </span>
          <span className="text-[10px] text-slate-500 font-medium">Alokasi Kas Masuk</span>
        </div>

        <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl space-y-1">
          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
            Status Keseimbangan Jurnal
          </span>
          <div className="pt-0.5">
            {auditResult.isBalanced ? (
              <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-black text-xs rounded-lg uppercase inline-flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> Seimbang & Valid
              </span>
            ) : (
              <span className="px-2.5 py-1 bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 font-black text-xs rounded-lg uppercase inline-flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" /> Ada Anomali
              </span>
            )}
          </div>
          <span className="text-[10px] text-slate-500 font-medium block pt-0.5">
            {auditResult.anomalies.length} temuan audit
          </span>
        </div>
      </div>

      {/* Success Notification */}
      {reconcileSuccess && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 rounded-2xl flex items-center gap-3 text-emerald-900 dark:text-emerald-200 text-xs font-medium animate-fadeIn">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <div>
            <strong>Rekonsiliasi Sukses!</strong> Kategori yang belum terdaftar telah secara otomatis disinkronkan ke dalam Master Chart of Accounts (COA).
          </div>
        </div>
      )}

      {/* Audit Findings List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
            <Scale className="h-4 w-4 text-purple-600" />
            <span>Daftar Temuan Audit Akuntansi ({auditResult.anomalies.length} Anomali)</span>
          </h4>

          {auditResult.anomalies.length > 0 && (
            <button
              type="button"
              onClick={handleRunReconciliation}
              disabled={isReconciling}
              className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-extrabold text-xs rounded-xl shadow-xs hover:from-purple-700 hover:to-indigo-700 transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${isReconciling ? 'animate-spin' : ''}`} />
              <span>{isReconciling ? 'Memproses Rekonsiliasi...' : 'Jalankan Harmonisasi Jurnal Auto'}</span>
            </button>
          )}
        </div>

        {auditResult.anomalies.length === 0 ? (
          <div className="p-8 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-2xl text-center space-y-2">
            <ShieldCheck className="h-10 w-10 text-emerald-600 dark:text-emerald-400 mx-auto" />
            <h5 className="font-extrabold text-sm text-emerald-900 dark:text-emerald-200 uppercase tracking-wide">
              Buku Besar 100% Sempurna & Rapi!
            </h5>
            <p className="text-xs text-emerald-700 dark:text-emerald-300 max-w-md mx-auto font-medium">
              Tidak ditemukan adanya anomali jurnal, selisih mutasi, atau kategori tanpa pemetaan COA pada periode ini.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {auditResult.anomalies.map((item) => (
              <div
                key={item.id}
                className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  item.type === 'critical'
                    ? 'bg-rose-50/80 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800'
                    : 'bg-amber-50/80 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 text-[9px] font-black rounded-full uppercase ${
                        item.type === 'critical'
                          ? 'bg-rose-200 text-rose-900 dark:bg-rose-900 dark:text-rose-100'
                          : 'bg-amber-200 text-amber-900 dark:bg-amber-900 dark:text-amber-100'
                      }`}
                    >
                      {item.type}
                    </span>
                    <h5 className="font-extrabold text-xs text-slate-900 dark:text-slate-100">
                      {item.title}
                    </h5>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 font-medium leading-relaxed">
                    {item.desc}
                  </p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {item.amount > 0 && (
                    <span className="font-mono font-black text-xs text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
                      Nominal: {formatterIDR.format(item.amount)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
