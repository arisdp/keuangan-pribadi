import React, { useState } from 'react';
import {
  Shield,
  Download,
  Upload,
  Key,
  Eye,
  EyeOff,
  Lock,
  CheckCircle2,
  AlertCircle,
  FileJson,
  HardDrive,
  RefreshCw,
  X,
  Sparkles,
  Database,
  RotateCcw
} from 'lucide-react';
import {
  encryptBackupData,
  decryptBackupData,
  EncryptedBackupPayload
} from '../utils/cryptoBackup';
import {
  Transaction,
  Account,
  CategoryBudget,
  Debt,
  InvestmentAsset,
  FixedAsset,
  EmergencyFundConfig,
  EmergencyFundTransaction,
  RecurringTransaction,
  SavingsGoal,
  User
} from '../types';
import { CategoryNode } from '../categoryHierarchy';

interface BackupDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  appData: {
    transactions: Transaction[];
    accounts: Account[];
    budgets: CategoryBudget[];
    debts: Debt[];
    investments: InvestmentAsset[];
    fixedAssets?: FixedAsset[];
    emergencyConfig: EmergencyFundConfig;
    emergencyTransactions: EmergencyFundTransaction[];
    masterCategories: CategoryNode[];
    recurringTransactions: RecurringTransaction[];
    savingsGoals: SavingsGoal[];
  };
  onRestoreData: (restoredData: any) => void;
  onOpenResetModal?: () => void;
}

export const BackupDataModal: React.FC<BackupDataModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  appData,
  onRestoreData,
  onOpenResetModal,
}) => {
  const [activeTab, setActiveTab] = useState<'backup' | 'restore' | 'reset'>('backup');
  
  // Backup states
  const [passphrase, setPassphrase] = useState<string>('');
  const [showPassphrase, setShowPassphrase] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [backupSuccessNotice, setBackupSuccessNotice] = useState<string | null>(null);
  const [backupErrorNotice, setBackupErrorNotice] = useState<string | null>(null);

  // Restore states
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restorePassphrase, setRestorePassphrase] = useState<string>('');
  const [showRestorePassphrase, setShowRestorePassphrase] = useState<boolean>(false);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [restoreSuccessNotice, setRestoreSuccessNotice] = useState<string | null>(null);
  const [restoreErrorNotice, setRestoreErrorNotice] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleExportBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    setBackupSuccessNotice(null);
    setBackupErrorNotice(null);

    if (!passphrase || passphrase.length < 4) {
      setBackupErrorNotice('Kata sandi enkripsi minimal harus 4 karakter untuk keamanan file.');
      return;
    }

    setIsExporting(true);
    try {
      const payload = await encryptBackupData(appData, passphrase, currentUser?.username);
      
      const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
        JSON.stringify(payload, null, 2)
      )}`;
      const downloadAnchor = document.createElement('a');
      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `NusantaraWealth_Backup_${currentUser?.username || 'user'}_${dateStr}_encrypted.json`;
      
      downloadAnchor.setAttribute('href', jsonString);
      downloadAnchor.setAttribute('download', filename);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      setBackupSuccessNotice(`Berhasil mengunduh file backup terenkripsi '${filename}'! Simpan kata sandi Anda untuk proses restore.`);
    } catch (err: any) {
      console.error('Backup Encryption Error:', err);
      setBackupErrorNotice(err?.message || 'Gagal mengenkripsi data backup.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRestoreErrorNotice(null);
    setRestoreSuccessNotice(null);
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (!file.name.endsWith('.json')) {
        setRestoreErrorNotice('Format file harus berupa .json.');
        return;
      }
      setRestoreFile(file);
    }
  };

  const handleExecuteRestore = async (e: React.FormEvent) => {
    e.preventDefault();
    setRestoreErrorNotice(null);
    setRestoreSuccessNotice(null);

    if (!restoreFile) {
      setRestoreErrorNotice('Silakan pilih file backup .json terlebih dahulu.');
      return;
    }

    if (!restorePassphrase) {
      setRestoreErrorNotice('Masukkan kata sandi enkripsi file backup.');
      return;
    }

    setIsImporting(true);
    try {
      const text = await restoreFile.text();
      const payload: EncryptedBackupPayload = JSON.parse(text);

      const decrypted = await decryptBackupData(payload, restorePassphrase);
      
      // Basic validation of decrypted structure
      if (typeof decrypted !== 'object' || decrypted === null) {
        throw new Error('Struktur data backup tidak valid.');
      }

      onRestoreData(decrypted);
      setRestoreSuccessNotice('Data berhasil didekripsi dan dipulihkan sepenuhnya ke dalam aplikasi!');
      
      setTimeout(() => {
        onClose();
        setRestoreSuccessNotice(null);
      }, 2000);
    } catch (err: any) {
      console.error('Restore Error:', err);
      setRestoreErrorNotice(err?.message || 'Gagal mendekripsi file. Pastikan kata sandi benar.');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-2xl max-w-2xl w-full p-6 space-y-5 border border-slate-200 shadow-2xl max-h-[90vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-tr from-blue-600 to-indigo-600 text-white rounded-xl shadow-md">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-slate-800 text-sm sm:text-base uppercase tracking-wide">
                  Backup & Pemulihan Data Terenkripsi
                </h3>
                <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded font-black text-[10px] uppercase">
                  AES-256-GCM
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium">
                Simpan cadangan data lokal terenkripsi atau pulihkan data keuangan Anda secara aman.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 font-bold text-xs p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('backup')}
            className={`flex-1 py-2 rounded-lg text-xs font-extrabold transition flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'backup'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Download className="h-4 w-4 shrink-0" />
            <span className="truncate">1. Backup (.json)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('restore')}
            className={`flex-1 py-2 rounded-lg text-xs font-extrabold transition flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'restore'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Upload className="h-4 w-4 shrink-0" />
            <span className="truncate">2. Restore Data</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('reset')}
            className={`flex-1 py-2 rounded-lg text-xs font-extrabold transition flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'reset'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-200'
            }`}
          >
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-500 activeTab === 'reset' ? 'text-white' : ''" />
            <span className="truncate">3. Reset (Zona Bahaya)</span>
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-4">
          
          {/* TAB 1: BACKUP EXPORT */}
          {activeTab === 'backup' && (
            <form onSubmit={handleExportBackup} className="space-y-4">
              
              {backupSuccessNotice && (
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2.5 animate-fadeIn">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                  <p className="font-bold">{backupSuccessNotice}</p>
                </div>
              )}

              {backupErrorNotice && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2.5 animate-fadeIn">
                  <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
                  <p className="font-bold">{backupErrorNotice}</p>
                </div>
              )}

              {/* Data Summary Grid */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">
                  Ringkasan Komponen Data yang Di-Backup:
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs font-medium text-slate-700">
                  <div className="p-2 bg-white rounded-lg border border-slate-200/80 flex items-center justify-between">
                    <span>Transaksi:</span>
                    <span className="font-mono font-bold text-blue-600">{appData.transactions.length}</span>
                  </div>
                  <div className="p-2 bg-white rounded-lg border border-slate-200/80 flex items-center justify-between">
                    <span>Master Akun:</span>
                    <span className="font-mono font-bold text-blue-600">{appData.accounts.length}</span>
                  </div>
                  <div className="p-2 bg-white rounded-lg border border-slate-200/80 flex items-center justify-between">
                    <span>Batas Anggaran:</span>
                    <span className="font-mono font-bold text-blue-600">{appData.budgets.length}</span>
                  </div>
                  <div className="p-2 bg-white rounded-lg border border-slate-200/80 flex items-center justify-between">
                    <span>Catatan Utang:</span>
                    <span className="font-mono font-bold text-blue-600">{appData.debts.length}</span>
                  </div>
                  <div className="p-2 bg-white rounded-lg border border-slate-200/80 flex items-center justify-between">
                    <span>Portofolio Investasi:</span>
                    <span className="font-mono font-bold text-blue-600">{appData.investments.length}</span>
                  </div>
                  <div className="p-2 bg-white rounded-lg border border-slate-200/80 flex items-center justify-between">
                    <span>Target Menabung:</span>
                    <span className="font-mono font-bold text-blue-600">{appData.savingsGoals.length}</span>
                  </div>
                </div>
              </div>

              {/* Passphrase Input */}
              <div className="space-y-1.5">
                <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                  Kata Sandi Enkripsi Backup
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Key className="h-4 w-4" />
                  </div>
                  <input
                    type={showPassphrase ? 'text' : 'password'}
                    name="backup-passphrase"
                    autoComplete="new-password"
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    placeholder="Masukkan kata sandi rahasia (contoh: RahasiaKeluarga2026)"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-10 py-2.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassphrase(!showPassphrase)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showPassphrase ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 font-medium">
                  🔒 File JSON akan dienkripsi dengan standar <strong className="text-slate-600 font-bold">AES-256-GCM (PBKDF2 SHA-256)</strong>. Catat kata sandi ini karena dibutuhkan untuk restore di kemudian hari.
                </p>
              </div>

              {/* Export Button */}
              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={isExporting}
                  className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:brightness-110 disabled:opacity-50 text-white font-extrabold rounded-xl transition cursor-pointer text-xs uppercase tracking-wider shadow-md flex items-center justify-center gap-2"
                >
                  {isExporting ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Mengenkripsi Data...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4" />
                      Unduh Backup Terenkripsi (.json)
                    </>
                  )}
                </button>
              </div>

            </form>
          )}

          {/* TAB 2: RESTORE IMPORT */}
          {activeTab === 'restore' && (
            <form onSubmit={handleExecuteRestore} className="space-y-4">
              
              {restoreSuccessNotice && (
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2.5 animate-fadeIn">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                  <p className="font-bold">{restoreSuccessNotice}</p>
                </div>
              )}

              {restoreErrorNotice && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2.5 animate-fadeIn">
                  <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
                  <p className="font-bold">{restoreErrorNotice}</p>
                </div>
              )}

              {/* File Dropzone */}
              <div className="space-y-1.5">
                <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                  Pilih File Backup Terenkripsi (.json)
                </label>
                <div className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-2xl p-6 text-center bg-slate-50/50 hover:bg-blue-50/30 transition cursor-pointer relative">
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleFileChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="space-y-2 pointer-events-none">
                    <FileJson className="h-8 w-8 text-blue-600 mx-auto" />
                    {restoreFile ? (
                      <div className="space-y-0.5">
                        <p className="font-extrabold text-xs text-slate-800">{restoreFile.name}</p>
                        <p className="text-[10px] text-slate-400">
                          {(restoreFile.size / 1024).toFixed(1)} KB — File Siap Dekripsi
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-0.5">
                        <p className="font-bold text-xs text-slate-700">
                          Klik untuk memilih file backup atau seret ke sini
                        </p>
                        <p className="text-[10px] text-slate-400">Hanya menerima format file backup terenkripsi .json</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Restore Passphrase Input */}
              <div className="space-y-1.5">
                <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                  Kata Sandi Dekripsi
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Key className="h-4 w-4" />
                  </div>
                  <input
                    type={showRestorePassphrase ? 'text' : 'password'}
                    name="restore-passphrase"
                    autoComplete="current-password"
                    value={restorePassphrase}
                    onChange={(e) => setRestorePassphrase(e.target.value)}
                    placeholder="Masukkan kata sandi yang digunakan saat membuat backup"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-10 py-2.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowRestorePassphrase(!showRestorePassphrase)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showRestorePassphrase ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Warning Box */}
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <p>
                  <strong className="font-extrabold">Perhatian:</strong> Memulihkan data dari file backup akan menggantikan data aktif Anda saat ini dengan data hasil cadangan.
                </p>
              </div>

              {/* Submit Restore */}
              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={isImporting || !restoreFile}
                  className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:brightness-110 disabled:opacity-40 text-white font-extrabold rounded-xl transition cursor-pointer text-xs uppercase tracking-wider shadow-md flex items-center justify-center gap-2"
                >
                  {isImporting ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Mendekripsi Data...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4" />
                      Dekripsi & Pulihkan Data
                    </>
                  )}
                </button>
              </div>

            </form>
          )}

          {/* TAB 3: RESET DATA (ZONA BAHAYA) */}
          {activeTab === 'reset' && (
            <div className="space-y-4 p-5 bg-rose-50/60 border border-rose-200 rounded-2xl animate-fadeIn">
              <div className="flex items-start gap-3.5">
                <div className="p-3 bg-rose-100 text-rose-600 rounded-2xl shrink-0">
                  <AlertCircle className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                  <h4 className="font-black text-rose-950 text-sm sm:text-base">
                    Zona Risiko: Reset Seluruh Data Keuangan
                  </h4>
                  <p className="text-xs text-rose-800 leading-relaxed font-medium">
                    Tindakan ini akan menghapus seluruh transaksi lama, utang, investasi, transaksi berulang, dan target, serta hanya menyisakan data default awal (saldo akun &amp; limit anggaran Rp 0) agar perhitungan dimulai bersih dari awal.
                  </p>
                </div>
              </div>

              <div className="p-3.5 bg-white border border-rose-200/80 rounded-xl space-y-2 text-xs font-medium text-slate-700">
                <span className="font-extrabold text-slate-800 block text-[11px] uppercase tracking-wider">
                  Rekomendasi Keamanan:
                </span>
                <p className="text-slate-600 leading-relaxed text-[11px]">
                  Sebelum melakukan reset, disarankan untuk mengunduh <strong>Backup File (.json)</strong> di Tab 1 terlebih dahulu agar data dapat dipulihkan sewaktu-waktu jika diperlukan.
                </p>
              </div>

              <div className="pt-3 border-t border-rose-200/80 flex items-center justify-between gap-3">
                <span className="text-[10px] font-bold text-rose-700 uppercase tracking-wider">
                  Memerlukan Konfirmasi "HAPUS"
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    if (onOpenResetModal) onOpenResetModal();
                  }}
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs rounded-xl transition cursor-pointer shadow-md flex items-center gap-2"
                >
                  <RotateCcw className="h-4 w-4" />
                  <span>Buka Konfirmasi Reset Data</span>
                </button>
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
};
