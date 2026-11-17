import React, { useState, useEffect } from 'react';
import { fetchUsersInspection, UsersInspectionResult } from '../apiClient';
import { RefreshCw, Search, Eye, Table, Check, AlertCircle, ShieldCheck } from 'lucide-react';

export const DatabaseDiagnostics: React.FC = () => {
  const [dataState, setDataState] = useState<UsersInspectionResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const loadData = async () => {
    setIsLoading(true);
    try {
      const res = await fetchUsersInspection();
      setDataState(res);
    } catch {
      // Error state is rendered in UI table
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const rows = dataState?.rows || [];
  const fields = dataState?.fields || (rows.length > 0 ? Object.keys(rows[0]) : ['id', 'username', 'email', 'full_name', 'is_premium', 'created_at']);

  const filteredRows = rows.filter((row) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return fields.some((f) => String(row[f] ?? '').toLowerCase().includes(q));
  });

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4 animate-fadeIn">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div>
          <h3 className="font-extrabold text-slate-800 dark:text-slate-100 text-base flex items-center gap-2">
            <Table className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            <span>Diagnostik Baris Tabel Database (`users`)</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
            Menampilkan data aktual hasil query <code className="font-mono text-indigo-600 dark:text-indigo-400">SELECT * FROM users</code> dari server PostgreSQL Cloud.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 rounded-xl text-xs font-extrabold border border-indigo-200 dark:border-indigo-800 flex items-center gap-1.5">
            <Eye className="h-3.5 w-3.5" />
            {rows.length} Total Baris
          </span>

          <button
            onClick={loadData}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Muat Ulang</span>
          </button>
        </div>
      </div>

      {/* SEARCH FILTER */}
      <div className="relative">
        <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-slate-400" />
        <input
          type="text"
          placeholder="Cari data pengguna (id, username, email, nama)..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-4 py-2 text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* DATA GRID TABLE */}
      <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-2xl max-h-96 shadow-xs">
        <table className="w-full text-left text-xs whitespace-nowrap">
          <thead className="bg-slate-100 dark:bg-slate-800/90 text-slate-600 dark:text-slate-300 font-extrabold text-[10px] uppercase tracking-wider sticky top-0 border-b border-slate-200 dark:border-slate-800 z-10">
            <tr>
              <th className="py-3 px-4">#</th>
              {fields.map((f) => (
                <th key={f} className="py-3 px-4 font-mono font-black text-indigo-600 dark:text-indigo-400">
                  {f}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-slate-800 dark:text-slate-200">
            {isLoading ? (
              <tr>
                <td colSpan={fields.length + 1} className="py-10 text-center text-slate-400">
                  <div className="flex items-center justify-center gap-2 font-sans text-xs">
                    <RefreshCw className="h-4 w-4 animate-spin text-blue-600" />
                    <span>Mengeksekusi SELECT * FROM users di server...</span>
                  </div>
                </td>
              </tr>
            ) : filteredRows.length > 0 ? (
              filteredRows.map((row, idx) => (
                <tr key={row.id || idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                  <td className="py-2.5 px-4 text-slate-400 text-[11px] font-sans font-bold">{idx + 1}</td>
                  {fields.map((f) => {
                    const val = row[f];
                    const isHashField = f === 'password_hash' || f === 'password';
                    return (
                      <td key={f} className="py-2.5 px-4 text-[11px]">
                        {val === null || val === undefined ? (
                          <span className="text-slate-400 italic">null</span>
                        ) : typeof val === 'boolean' ? (
                          <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${val ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                            {val ? 'TRUE' : 'FALSE'}
                          </span>
                        ) : isHashField ? (
                          <span className="text-amber-600 dark:text-amber-400 font-mono text-[10px]" title={String(val)}>
                            {String(val).length > 20 ? `${String(val).substring(0, 16)}...` : String(val)}
                          </span>
                        ) : (
                          <span>{String(val)}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={fields.length + 1} className="py-8 text-center text-slate-400 font-sans text-xs">
                  {dataState?.error ? (
                    <span className="text-rose-600 font-bold">Error: {dataState.error} - {dataState.details}</span>
                  ) : (
                    'Tidak ada baris pengguna ditemukan di tabel users.'
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
