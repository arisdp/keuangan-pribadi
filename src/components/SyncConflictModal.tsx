import React from 'react';
import { Database, HardDrive, AlertTriangle, ArrowRight, Check, Layers } from 'lucide-react';
import { SyncDataPackage, generateSyncSummary, mergeSyncData } from '../utils/syncConflictDetector';

interface SyncConflictModalProps {
  isOpen: boolean;
  localData: SyncDataPackage;
  cloudData: SyncDataPackage;
  onSelectLocal: () => void;
  onSelectCloud: () => void;
  onMerge: (merged: SyncDataPackage) => void;
  onClose: () => void;
}

export const SyncConflictModal: React.FC<SyncConflictModalProps> = ({
  isOpen,
  localData,
  cloudData,
  onSelectLocal,
  onSelectCloud,
  onMerge,
  onClose,
}) => {
  if (!isOpen) return null;

  const localSummary = generateSyncSummary(localData, 'local');
  const cloudSummary = generateSyncSummary(cloudData, 'cloud');

  const formatIDR = (val: number) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(val);

  const formatDate = (isoStr?: string) => {
    if (!isoStr) return 'Tidak Diketahui';
    try {
      return new Date(isoStr).toLocaleString('id-ID', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch {
      return isoStr;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-6 text-slate-100">
        
        {/* Header */}
        <div className="flex items-start gap-4 pb-4 border-b border-slate-800">
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 shrink-0">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
              Perbedaan Data Terdeteksi (Konflik Sinkronisasi)
            </h2>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Ditemukan perbedaan antara data keuangan di **Penyimpanan Lokal** perangkat ini dengan data tersimpan di **Cloud Database PostgreSQL**. Silakan pilih versi yang ingin Anda gunakan.
            </p>
          </div>
        </div>

        {/* Comparison Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* Card 1: Local Data */}
          <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/80 hover:border-blue-500/50 transition space-y-3 relative group">
            <div className="flex items-center justify-between pb-2 border-b border-slate-700/60">
              <div className="flex items-center gap-2 text-blue-400 font-bold text-xs uppercase tracking-wider">
                <HardDrive className="h-4 w-4" />
                <span>Penyimpanan Lokal</span>
              </div>
              <span className="px-2 py-0.5 text-[9px] font-black rounded bg-blue-500/20 text-blue-300">
                Lokal Perangkat
              </span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between text-slate-300">
                <span className="text-slate-400">Total Transaksi:</span>
                <span className="font-extrabold text-white">{localSummary.transactionCount} catatan</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span className="text-slate-400">Master Rekening:</span>
                <span className="font-extrabold text-white">{localSummary.accountCount} akun</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span className="text-slate-400">Total Saldo:</span>
                <span className="font-mono font-bold text-emerald-400">{formatIDR(localSummary.totalBalance)}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span className="text-slate-400">Investasi & Utang:</span>
                <span className="font-extrabold text-slate-200">
                  {localSummary.investmentCount} inv / {localSummary.debtCount} utang
                </span>
              </div>
              <div className="flex justify-between text-slate-400 text-[10px] pt-1">
                <span>Diperbarui:</span>
                <span className="font-mono text-slate-300">{formatDate(localSummary.lastUpdated)}</span>
              </div>
            </div>

            <button
              onClick={onSelectLocal}
              className="w-full py-2.5 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-extrabold transition flex items-center justify-center gap-2 cursor-pointer shadow-md"
            >
              <Check className="h-4 w-4" />
              <span>Gunakan Data Lokal</span>
            </button>
          </div>

          {/* Card 2: Cloud Data */}
          <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/80 hover:border-emerald-500/50 transition space-y-3 relative group">
            <div className="flex items-center justify-between pb-2 border-b border-slate-700/60">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase tracking-wider">
                <Database className="h-4 w-4" />
                <span>Cloud PostgreSQL</span>
              </div>
              <span className="px-2 py-0.5 text-[9px] font-black rounded bg-emerald-500/20 text-emerald-300">
                Server Cloud
              </span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between text-slate-300">
                <span className="text-slate-400">Total Transaksi:</span>
                <span className="font-extrabold text-white">{cloudSummary.transactionCount} catatan</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span className="text-slate-400">Master Rekening:</span>
                <span className="font-extrabold text-white">{cloudSummary.accountCount} akun</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span className="text-slate-400">Total Saldo:</span>
                <span className="font-mono font-bold text-emerald-400">{formatIDR(cloudSummary.totalBalance)}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span className="text-slate-400">Investasi & Utang:</span>
                <span className="font-extrabold text-slate-200">
                  {cloudSummary.investmentCount} inv / {cloudSummary.debtCount} utang
                </span>
              </div>
              <div className="flex justify-between text-slate-400 text-[10px] pt-1">
                <span>Diperbarui:</span>
                <span className="font-mono text-slate-300">{formatDate(cloudSummary.lastUpdated)}</span>
              </div>
            </div>

            <button
              onClick={onSelectCloud}
              className="w-full py-2.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold transition flex items-center justify-center gap-2 cursor-pointer shadow-md"
            >
              <Check className="h-4 w-4" />
              <span>Gunakan Data Cloud</span>
            </button>
          </div>

        </div>

        {/* Merge Option & Action Footer */}
        <div className="pt-2 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            onClick={() => onMerge(mergeSyncData(localData, cloudData))}
            className="w-full sm:w-auto px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-slate-600 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <Layers className="h-4 w-4 text-purple-400" />
            <span>Gabungkan Keduanya (Merge Unique Records)</span>
          </button>

          <button
            onClick={onClose}
            className="w-full sm:w-auto text-xs text-slate-400 hover:text-slate-200 py-1.5 px-3 transition cursor-pointer"
          >
            Batal (Pilih Nanti)
          </button>
        </div>

      </div>
    </div>
  );
};
