import React, { useState } from 'react';
import { InvestmentAsset, InvestmentPriceHistory } from '../types';
import { parseLocalDate, toLocalYYYYMMDD } from '../utils/accountingEngine';
import { X, TrendingUp, Calendar, Plus, History, ArrowUpRight, ArrowDownRight, Tag, LineChart as LineChartIcon } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

interface PriceHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  investments: InvestmentAsset[];
  onUpdateInvestment?: (id: string, updatedFields: Partial<InvestmentAsset>) => void;
}

export const PriceHistoryModal: React.FC<PriceHistoryModalProps> = ({
  isOpen,
  onClose,
  investments,
  onUpdateInvestment,
}) => {
  const [selectedAssetId, setSelectedAssetId] = useState<string>('all');
  const [showAddForm, setShowAddForm] = useState(false);

  // Form State
  const [addAssetId, setAddAssetId] = useState<string>(investments[0]?.id || '');
  const [addDate, setAddDate] = useState<string>(toLocalYYYYMMDD());
  const [addUnitPrice, setAddUnitPrice] = useState<number>(0);
  const [addNote, setAddNote] = useState<string>('Pembaruan Harga Pasar');

  const formatterIDR = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  });

  if (!isOpen) return null;

  // Flatten all price history from all investments
  const allLogs: InvestmentPriceHistory[] = [];
  investments.forEach((inv) => {
    if (inv.priceHistory && inv.priceHistory.length > 0) {
      allLogs.push(...inv.priceHistory);
    } else {
      // Synthesize initial entry if no history
      const qty = inv.quantity ?? inv.units ?? 1;
      const currPrice = inv.unitPrice ?? inv.currentUnitPrice ?? (inv.balance / qty);
      allLogs.push({
        id: `ph-default-${inv.id}`,
        assetId: inv.id,
        assetName: inv.name,
        date: inv.dateAdded || toLocalYYYYMMDD(),
        unitPrice: currPrice,
        note: 'Harga Pembelian Awal',
      });
    }
  });

  // Filter logs
  const filteredLogs = allLogs
    .filter((log) => selectedAssetId === 'all' || log.assetId === selectedAssetId)
    .sort((a, b) => (parseLocalDate(b.date)?.getTime() ?? 0) - (parseLocalDate(a.date)?.getTime() ?? 0));

  // Chart data sorted chronologically
  const chartLogs = [...filteredLogs].sort(
    (a, b) => (parseLocalDate(a.date)?.getTime() ?? 0) - (parseLocalDate(b.date)?.getTime() ?? 0)
  );

  const chartData = chartLogs.map((log) => ({
    date: log.date,
    price: log.unitPrice,
    assetName: log.assetName,
  }));

  const handleAddPriceLog = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addAssetId || addUnitPrice <= 0) return;

    const targetInv = investments.find((i) => i.id === addAssetId);
    if (!targetInv || !onUpdateInvestment) return;

    const qty = targetInv.quantity ?? targetInv.units ?? 1;
    const oldPrice = targetInv.unitPrice ?? targetInv.currentUnitPrice ?? (targetInv.balance / qty);
    const changePct = oldPrice > 0 ? ((addUnitPrice - oldPrice) / oldPrice) * 100 : 0;

    const newLog: InvestmentPriceHistory = {
      id: `ph-${Date.now()}`,
      assetId: targetInv.id,
      assetName: targetInv.name,
      date: addDate,
      unitPrice: addUnitPrice,
      previousUnitPrice: oldPrice,
      changePercentage: Number(changePct.toFixed(2)),
      note: addNote || 'Pembaruan Harga Satuan',
    };

    const existingHistory = targetInv.priceHistory || [];
    const updatedHistory = [...existingHistory, newLog];
    const newBalance = qty * addUnitPrice;

    onUpdateInvestment(targetInv.id, {
      unitPrice: addUnitPrice,
      currentUnitPrice: addUnitPrice,
      balance: newBalance,
      priceHistory: updatedHistory,
    });

    setShowAddForm(false);
    setAddNote('Pembaruan Harga Pasar');
  };

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-4xl w-full shadow-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="p-5 sm:p-6 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600/30 border border-blue-500/40 rounded-xl text-blue-400">
              <History className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
                Riwayat & Tren Perubahan Harga Unit
              </h3>
              <p className="text-xs text-slate-400">
                Lacak pergerakan histori harga per unit aset investasi Anda dari waktu ke waktu
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-50 dark:bg-slate-850 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-600 dark:text-slate-300 whitespace-nowrap">
                Filter Aset:
              </span>
              <select
                value={selectedAssetId}
                onChange={(e) => setSelectedAssetId(e.target.value)}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Semua Aset Portofolio ({investments.length})</option>
                {investments.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.name} ({inv.category})
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() => {
                setShowAddForm(!showAddForm);
                if (selectedAssetId !== 'all') setAddAssetId(selectedAssetId);
                else setAddAssetId(investments[0]?.id || '');
              }}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
            >
              <Plus className="h-4 w-4" />
              {showAddForm ? 'Tutup Form' : 'Catat Perubahan Harga Baru'}
            </button>
          </div>

          {/* Add Form */}
          {showAddForm && (
            <form
              onSubmit={handleAddPriceLog}
              className="p-4 bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40 rounded-xl space-y-4 animate-in fade-in duration-200"
            >
              <h4 className="text-xs font-black text-blue-900 dark:text-blue-200 uppercase tracking-wider flex items-center gap-2">
                <Plus className="h-4 w-4 text-blue-600" />
                Input Perubahan Harga Unit Terbaru
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Pilih Aset
                  </label>
                  <select
                    value={addAssetId}
                    onChange={(e) => setAddAssetId(e.target.value)}
                    required
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-xs font-semibold"
                  >
                    {investments.map((inv) => (
                      <option key={inv.id} value={inv.id}>
                        {inv.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Tanggal Perubahan
                  </label>
                  <input
                    type="date"
                    value={addDate}
                    onChange={(e) => setAddDate(e.target.value)}
                    required
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-xs font-semibold"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Harga Unit Baru (Rp)
                  </label>
                  <input
                    type="number"
                    value={addUnitPrice || ''}
                    onChange={(e) => setAddUnitPrice(Number(e.target.value))}
                    placeholder="Contoh: 9500"
                    required
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-xs font-bold font-mono"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Catatan / Event
                  </label>
                  <input
                    type="text"
                    value={addNote}
                    onChange={(e) => setAddNote(e.target.value)}
                    placeholder="Contoh: Laporan Keuangan Q2"
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-xs"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-200/50 rounded-lg cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-lg transition cursor-pointer"
                >
                  Simpan Catatan Harga
                </button>
              </div>
            </form>
          )}

          {/* Recharts Price Trend Chart */}
          {chartData.length > 1 && (
            <div className="p-4 bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-2">
              <h4 className="text-xs font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
                <LineChartIcon className="h-4 w-4 text-blue-600" />
                Grafik Pergerakan Harga Unit (Histori)
              </h4>

              <div className="h-48 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} domain={['auto', 'auto']} />
                    <Tooltip
                      formatter={(val: any) => [formatterIDR.format(Number(val)), 'Harga Unit']}
                    />
                    <Line
                      type="monotone"
                      dataKey="price"
                      stroke="#2563eb"
                      strokeWidth={3}
                      dot={{ r: 4, fill: '#2563eb' }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Table */}
          <div className="space-y-3">
            <h4 className="text-xs font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <History className="h-4 w-4 text-blue-600" />
              Tabel Catatan Histori Harga Unit ({filteredLogs.length})
            </h4>

            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800 text-[10px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    <th className="p-3">Tanggal</th>
                    <th className="p-3">Nama Aset</th>
                    <th className="p-3 text-right">Harga Unit Lalu</th>
                    <th className="p-3 text-right">Harga Unit Baru</th>
                    <th className="p-3 text-center">Perubahan (%)</th>
                    <th className="p-3">Catatan / Keterangan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs font-mono">
                  {filteredLogs.map((log) => {
                    const prevPrice = log.previousUnitPrice || log.unitPrice;
                    const change = log.changePercentage !== undefined
                      ? log.changePercentage
                      : prevPrice > 0
                      ? ((log.unitPrice - prevPrice) / prevPrice) * 100
                      : 0;

                    return (
                      <tr
                        key={log.id}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                      >
                        <td className="p-3 font-sans font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 text-slate-400" />
                          {log.date}
                        </td>
                        <td className="p-3 font-sans font-bold text-slate-900 dark:text-slate-100">
                          {log.assetName}
                        </td>
                        <td className="p-3 text-right text-slate-500">
                          {formatterIDR.format(prevPrice)}
                        </td>
                        <td className="p-3 text-right font-extrabold text-blue-600 dark:text-blue-400">
                          {formatterIDR.format(log.unitPrice)}
                        </td>
                        <td className="p-3 text-center">
                          <span
                            className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                              change > 0
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                : change < 0
                                ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                            }`}
                          >
                            {change > 0 && <ArrowUpRight className="h-3 w-3" />}
                            {change < 0 && <ArrowDownRight className="h-3 w-3" />}
                            {change > 0 ? '+' : ''}
                            {change.toFixed(2)}%
                          </span>
                        </td>
                        <td className="p-3 font-sans text-slate-600 dark:text-slate-400 italic text-[11px]">
                          {log.note || '-'}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredLogs.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-400 font-sans text-xs">
                        Belum ada riwayat perubahan harga untuk aset ini.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-end pt-2 border-t border-slate-200 dark:border-slate-800">
            <button
              onClick={onClose}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl transition cursor-pointer"
            >
              Tutup Modal
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
