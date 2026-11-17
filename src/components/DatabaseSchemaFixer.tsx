import React, { useState, useEffect } from 'react';
import { checkTableSchema, fixUsersSchema, TableSchemaResult } from '../apiClient';
import { AlertTriangle, CheckCircle2, Wrench, RefreshCw, ShieldAlert, Sparkles, Database } from 'lucide-react';
import { showToast } from '../utils/toast';

export const DatabaseSchemaFixer: React.FC = () => {
  const [schemaResult, setSchemaResult] = useState<TableSchemaResult | null>(null);
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [isFixing, setIsFixing] = useState<boolean>(false);

  const localModelFields = [
    { key: 'id', expectedType: 'text', required: true, description: 'ID unik pengguna' },
    { key: 'username', expectedType: 'text', required: true, description: 'Username login' },
    { key: 'email', expectedType: 'character varying / text', required: false, description: 'Alamat email pengguna' },
    { key: 'full_name', expectedType: 'text', required: true, description: 'Nama lengkap tampilan' },
    { key: 'password_hash', expectedType: 'character varying / text', required: true, description: 'Hash password terenkripsi' },
    { key: 'password', expectedType: 'text', required: false, description: 'Password plain (cadangan)' },
    { key: 'is_premium', expectedType: 'boolean', required: false, description: 'Status langganan premium' },
    { key: 'created_at', expectedType: 'timestamp', required: true, description: 'Waktu pendaftaran' },
  ];

  const verifySchema = async () => {
    setIsChecking(true);
    try {
      const res = await checkTableSchema('users');
      setSchemaResult(res);
    } catch {
      // Schema status rendered in UI
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    verifySchema();
  }, []);

  const currentColumns = schemaResult?.columns || [];
  const missingFields = localModelFields.filter(f => 
    !currentColumns.some(c => c.column_name.toLowerCase() === f.key.toLowerCase())
  );

  const handleFixSchema = async () => {
    setIsFixing(true);
    try {
      const res = await fixUsersSchema();
      if (res.success) {
        showToast({
          type: 'success',
          title: 'Skema Berhasil Diperbarui',
          message: res.message || 'Tabel users sekarang sudah memiliki seluruh kolom yang dibutuhkan.',
          duration: 4000
        });
        await verifySchema();
      } else {
        showToast({
          type: 'error',
          title: 'Gagal Memperbarui Skema',
          message: res.details || res.message || 'Terjadi kesalahan saat mengeksekusi DDL ALTER TABLE.',
          duration: 5000
        });
      }
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Kesalahan Sistem',
        message: err?.message || String(err),
        duration: 5000
      });
    } finally {
      setIsFixing(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-5 animate-fadeIn">
      {/* TITLE */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-500 text-white rounded-xl shadow-md">
            <Wrench className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-extrabold text-slate-800 dark:text-slate-100 text-base flex items-center gap-2">
              <span>Database Schema Fixer & Compatibility Validator</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
              Membandingkan model aplikasi lokal dengan skema remote PostgreSQL untuk mendeteksi mismatch kolom seperti <code className="font-mono text-amber-600">password_hash</code>.
            </p>
          </div>
        </div>

        <button
          onClick={verifySchema}
          disabled={isChecking}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isChecking ? 'animate-spin' : ''}`} />
          <span>Cek Ulang Skema</span>
        </button>
      </div>

      {/* WARNING ALERT IF MISMATCH DETECTED */}
      {missingFields.length > 0 ? (
        <div className="p-4 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-2xl space-y-3">
          <div className="flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="font-black text-amber-900 dark:text-amber-200 text-xs uppercase tracking-wide">
                Peringatan: Ketidakcocokan Skema Terdeteksi ({missingFields.length} Kolom Hilang)
              </h4>
              <p className="text-xs text-amber-800 dark:text-amber-300 font-medium leading-relaxed">
                Tabel database <code className="font-mono font-bold">users</code> di server belum memiliki kolom berikut:{' '}
                <strong className="font-mono underline">{missingFields.map(m => m.key).join(', ')}</strong>.
                Hal ini menyebabkan error SQL State <code className="font-mono font-bold">42703</code> ("column password_hash does not exist") saat sinkronisasi atau registrasi.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end pt-2">
            <button
              onClick={handleFixSchema}
              disabled={isFixing}
              className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black shadow-md transition cursor-pointer disabled:opacity-50"
            >
              <Sparkles className={`h-4 w-4 ${isFixing ? 'animate-spin' : ''}`} />
              <span>Perbaiki Skema Otomatis (ALTER TABLE)</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-2xl flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <div>
            <h4 className="font-extrabold text-emerald-900 dark:text-emerald-200 text-xs">
              Skema Database 100% Cocok & Kompatibel
            </h4>
            <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
              Seluruh kolom model aplikasi lokal (<code className="font-mono">id, username, email, full_name, password_hash, is_premium</code>) lengkap ada di tabel <code className="font-mono">users</code>.
            </p>
          </div>
        </div>
      )}

      {/* COMPARISON LIST */}
      <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 uppercase tracking-wider font-extrabold text-[10px] border-b border-slate-200 dark:border-slate-800">
            <tr>
              <th className="py-3 px-4">Nama Kolom Model</th>
              <th className="py-3 px-4">Keterangan Fungsi</th>
              <th className="py-3 px-4">Wajib / Optional</th>
              <th className="py-3 px-4">Status Remote PostgreSQL</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium text-slate-800 dark:text-slate-200">
            {localModelFields.map((col) => {
              const matchedCol = currentColumns.find(c => c.column_name.toLowerCase() === col.key.toLowerCase());
              return (
                <tr key={col.key} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                  <td className="py-2.5 px-4 font-mono font-bold text-slate-900 dark:text-slate-100">
                    {col.key}
                  </td>
                  <td className="py-2.5 px-4 text-slate-600 dark:text-slate-400">
                    {col.description}
                  </td>
                  <td className="py-2.5 px-4">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      col.required ? 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-600'
                    }`}>
                      {col.required ? 'Wajib' : 'Optional'}
                    </span>
                  </td>
                  <td className="py-2.5 px-4">
                    {matchedCol ? (
                      <span className="px-2.5 py-1 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 rounded-lg text-[11px] font-extrabold flex items-center gap-1 w-fit">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        Ada ({matchedCol.data_type})
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 rounded-lg text-[11px] font-extrabold flex items-center gap-1 w-fit">
                        <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />
                        HILANG (Missing Column)
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
