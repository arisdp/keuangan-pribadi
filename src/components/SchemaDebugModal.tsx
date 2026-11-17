import React, { useState, useEffect } from 'react';
import { checkTableSchema, rebuildDatabaseSchema, ColumnInfo, TableSchemaResult } from '../apiClient';
import { Database, RefreshCw, X, CheckCircle2, AlertTriangle, ShieldCheck, Search, Code2, Wrench, Sparkles } from 'lucide-react';
import { showToast } from '../utils/toast';

interface SchemaDebugModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTableName?: string;
}

export const SchemaDebugModal: React.FC<SchemaDebugModalProps> = ({
  isOpen,
  onClose,
  initialTableName = 'users'
}) => {
  const [tableName, setTableName] = useState<string>(initialTableName);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isRebuilding, setIsRebuilding] = useState<boolean>(false);
  const [schemaData, setSchemaData] = useState<TableSchemaResult | null>(null);
  const [filterQuery, setFilterQuery] = useState<string>('');

  const loadSchema = async (targetTable: string) => {
    setIsLoading(true);
    try {
      const res = await checkTableSchema(targetTable);
      setSchemaData(res);
    } catch {
      // Handled via modal state
    } finally {
      setIsLoading(false);
    }
  };

  const handleRebuildSchema = async () => {
    setIsRebuilding(true);
    try {
      const res = await rebuildDatabaseSchema();
      if (res.success) {
        showToast({
          type: 'success',
          title: 'Skema Berhasil Dibuat Ulang',
          message: res.message || 'Tabel users telah dibuat ulang dengan struktur skema terbaru.',
          duration: 5000
        });
        await loadSchema(tableName);
      } else {
        showToast({
          type: 'error',
          title: 'Gagal Rebuild Skema',
          message: res.details || res.message || 'Gagal mengeksekusi DROP & CREATE TABLE.',
          duration: 5000
        });
      }
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Error Sistem',
        message: err?.message || String(err),
        duration: 5000
      });
    } finally {
      setIsRebuilding(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadSchema(tableName);
    }
  }, [isOpen, tableName]);

  if (!isOpen) return null;

  const expectedUsersColumns = [
    { name: 'id', type: 'text', label: 'ID Pengguna' },
    { name: 'username', type: 'text', label: 'Username' },
    { name: 'email', type: 'varchar/text', label: 'Email' },
    { name: 'full_name', type: 'text', label: 'Nama Lengkap' },
    { name: 'password_hash', type: 'varchar/text', label: 'Password Hash (Bcrypt/SHA)' },
    { name: 'password', type: 'text', label: 'Password Plain/Fallback' },
    { name: 'is_premium', type: 'boolean', label: 'Status Premium' },
    { name: 'created_at', type: 'timestamp', label: 'Waktu Buat' },
  ];

  const currentColumns = schemaData?.columns || [];
  const filteredColumns = currentColumns.filter(c => 
    c.column_name.toLowerCase().includes(filterQuery.toLowerCase()) ||
    c.data_type.toLowerCase().includes(filterQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* HEADER */}
        <div className="p-5 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600 text-white rounded-xl shadow-md">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 dark:text-slate-100 text-base flex items-center gap-2">
                Schema Debugger & Inspector
                <span className="px-2 py-0.5 text-[10px] bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-black rounded-full border border-blue-200 dark:border-blue-800">
                  PostgreSQL Real-time
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                Inspeksi struktur kolom & tipe data langsung dari database Cloud PostgreSQL.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* CONTROLS BAR */}
        <div className="p-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">Pilih Tabel:</label>
            <select
              value={tableName}
              onChange={(e) => setTableName(e.target.value)}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="users">users (Pengguna & Auth)</option>
              <option value="accounts">accounts (Rekening / Akun COA)</option>
              <option value="transactions">transactions (Jurnal Transaksi)</option>
              <option value="budgets">budgets (Anggaran Kategori)</option>
              <option value="debts">debts (Utang Piutang)</option>
              <option value="investments">investments (Aset Investasi)</option>
              <option value="emergency_funds">emergency_funds (Dana Darurat)</option>
              <option value="emergency_fund_transactions">emergency_fund_transactions</option>
              <option value="recurring_transactions">recurring_transactions</option>
            </select>

            <button
              onClick={() => loadSchema(tableName)}
              disabled={isLoading}
              className="p-2 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900 rounded-xl transition cursor-pointer disabled:opacity-50"
              title="Refresh Skema Tabel"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Cari kolom atau tipe data..."
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* CONTENT BODY */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {tableName === 'users' && (
            <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-emerald-500" />
                  Validasi Kolom Wajib Autentikasi (`users`)
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-slate-500">
                    {currentColumns.length} Kolom Terdeteksi
                  </span>
                  <button
                    onClick={handleRebuildSchema}
                    disabled={isRebuilding}
                    className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs rounded-xl shadow-xs transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Wrench className={`h-3.5 w-3.5 ${isRebuilding ? 'animate-spin' : ''}`} />
                    <span>{isRebuilding ? 'Memproses DROP & CREATE...' : 'Buat Ulang Skema (DROP & CREATE)'}</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                {expectedUsersColumns.map((col) => {
                  const exists = currentColumns.some(c => c.column_name.toLowerCase() === col.name);
                  return (
                    <div
                      key={col.name}
                      className={`p-2 rounded-xl border flex items-center gap-2 ${
                        exists
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                          : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
                      }`}
                    >
                      {exists ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500" />
                      )}
                      <div className="min-w-0">
                        <p className="font-extrabold font-mono text-[11px] truncate">{col.name}</p>
                        <p className="text-[9px] opacity-80">{exists ? 'Ada' : 'Missing!'}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* SCHEMA COLUMNS TABLE */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 uppercase tracking-wider font-extrabold text-[10px] border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">#</th>
                  <th className="py-3 px-4">Nama Kolom (column_name)</th>
                  <th className="py-3 px-4">Tipe Data (data_type)</th>
                  <th className="py-3 px-4">Nullable</th>
                  <th className="py-3 px-4">Default</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium text-slate-800 dark:text-slate-200">
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw className="h-4 w-4 animate-spin text-blue-600" />
                        <span>Memuat skema database PostgreSQL...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredColumns.length > 0 ? (
                  filteredColumns.map((col, idx) => (
                    <tr key={col.column_name} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                      <td className="py-2.5 px-4 text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                      <td className="py-2.5 px-4 font-mono font-bold text-blue-600 dark:text-blue-400">
                        {col.column_name}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-slate-600 dark:text-slate-300">
                        <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-[11px] border border-slate-200 dark:border-slate-700">
                          {col.data_type}
                        </span>
                      </td>
                      <td className="py-2.5 px-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          col.is_nullable === 'YES' 
                            ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300' 
                            : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                        }`}>
                          {col.is_nullable}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 font-mono text-slate-400 text-[11px]">
                        {col.column_default || '-'}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400 text-xs">
                      Tidak ada kolom ditemukan untuk query ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* FOOTER */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <span className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
            <Code2 className="h-4 w-4 text-blue-500" />
            Tabel: <strong className="text-slate-800 dark:text-slate-100 font-mono">{tableName}</strong>
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100 text-xs font-bold rounded-xl transition cursor-pointer"
          >
            Tutup
          </button>
        </div>

      </div>
    </div>
  );
};
