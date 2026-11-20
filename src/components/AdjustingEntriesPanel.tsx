import React, { useMemo, useState, useEffect } from 'react';
import { Debt, InvestmentAsset, KprCoaMappingConfig, Transaction } from '../types';
import { AccountCOA, getStoredCoaList } from '../coaUtils';
import { DEFAULT_KPR_COA_MAPPING, resolveEffectiveKprCoaMapping } from '../utils/kprPresets';
import { formatterIDR } from '../utils/formatters';
import { showToast } from '../utils/toast';
import {
  AlertTriangle,
  BookOpenCheck,
  Calendar,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  History,
  Info,
  Percent,
  RotateCcw,
  Scale,
  TrendingDown,
} from 'lucide-react';

export interface AdjustingEntryDraft {
  id: string;
  type: 'investment_depreciation' | 'debt_interest_accrual';
  targetId: string;
  targetName: string;
  startDate: string;
  cutoffDate: string;
  periodKey: string;
  durationDays: number;
  annualRatePct: number;
  baseBalance: number;
  adjustmentAmount: number;
  projectedBalance: number;
  coaDebitCode: string;
  coaDebitName: string;
  coaCreditCode: string;
  coaCreditName: string;
  alreadyPostedThisPeriod: boolean;
}

interface AdjustingEntriesPanelProps {
  transactions: Transaction[];
  investments: InvestmentAsset[];
  debts: Debt[];
  kprCoaMapping?: KprCoaMappingConfig;
  coaList?: AccountCOA[];
  onApplyAdjustments: (entries: AdjustingEntryDraft[]) => void;
  onReverseAdjustment: (txId: string) => void;
}

const calcDaysBetween = (startStr: string, endStr: string): number => {
  const start = new Date(`${startStr}T00:00:00`);
  const end = new Date(`${endStr}T00:00:00`);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 30;
  const diffMs = end.getTime() - start.getTime();
  if (diffMs < 0) return 0;
  return Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1);
};

export const AdjustingEntriesPanel: React.FC<AdjustingEntriesPanelProps> = ({
  transactions,
  investments,
  debts,
  kprCoaMapping = DEFAULT_KPR_COA_MAPPING,
  coaList,
  onApplyAdjustments,
  onReverseAdjustment,
}) => {
  const activeCoas = useMemo(() => (coaList && coaList.length > 0 ? coaList : getStoredCoaList()), [coaList]);
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [cutoffDate, setCutoffDate] = useState<string>(todayStr);
  const [filterType, setFilterType] = useState<'all' | 'investment_depreciation' | 'debt_interest_accrual'>('all');
  const [defaultDepreciationRate, setDefaultDepreciationRate] = useState<number>(5);

  // Per-item overrides (ratePct & durationDays)
  const [rateOverrides, setRateOverrides] = useState<Record<string, number>>({});
  const [durationOverrides, setDurationOverrides] = useState<Record<string, number>>({});
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [reverseConfirmTx, setReverseConfirmTx] = useState<Transaction | null>(null);

  const periodKey = useMemo(() => {
    return cutoffDate && cutoffDate.length >= 7 ? cutoffDate.slice(0, 7) : todayStr.slice(0, 7);
  }, [cutoffDate, todayStr]);

  // Existing posted adjusting entries from transactions
  const postedAdjustments = useMemo(() => {
    return (transactions || [])
      .filter((tx) => tx.isAdjustment)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [transactions]);

  // Lookup map of debt start dates from linked creation transactions if debt.startDate is absent
  const debtCreationDateMap = useMemo(() => {
    const map = new Map<string, string>();
    (transactions || []).forEach((tx) => {
      if (tx.linkedDebtId && tx.linkedDebtAction === 'create' && tx.date) {
        const existing = map.get(tx.linkedDebtId);
        if (!existing || tx.date < existing) {
          map.set(tx.linkedDebtId, tx.date);
        }
      }
    });
    return map;
  }, [transactions]);

  // Compute default 30-day fallback date string
  const thirtyDaysAgoFromCutoff = useMemo(() => {
    const d = new Date(`${cutoffDate}T00:00:00`);
    if (isNaN(d.getTime())) return todayStr;
    d.setDate(d.getDate() - 29);
    return d.toISOString().split('T')[0];
  }, [cutoffDate, todayStr]);

  // Build candidate adjusting entries
  const drafts = useMemo<AdjustingEntryDraft[]>(() => {
    const list: AdjustingEntryDraft[] = [];

    // 1. Investment Asset Depreciation / Value Correction
    (investments || [])
      .filter((inv) => (inv.balance || 0) > 0)
      .forEach((inv) => {
        const draftId = `adj-inv-${inv.id}`;
        const startDate = inv.dateAdded || thirtyDaysAgoFromCutoff;
        const computedDays = calcDaysBetween(startDate, cutoffDate);
        const durationDays =
          durationOverrides[draftId] !== undefined ? Math.max(0, durationOverrides[draftId]) : computedDays;
        const annualRatePct =
          rateOverrides[draftId] !== undefined ? Math.max(0, rateOverrides[draftId]) : defaultDepreciationRate;

        const rawAmount = Math.round(inv.balance * (annualRatePct / 100) * (durationDays / 365));
        const adjustmentAmount = Math.min(inv.balance, Math.max(0, rawAmount));
        const projectedBalance = Math.max(0, inv.balance - adjustmentAmount);

        const alreadyPostedThisPeriod = postedAdjustments.some(
          (tx) =>
            tx.adjustmentType === 'investment_depreciation' &&
            tx.linkedInvestmentId === inv.id &&
            tx.adjustmentPeriodKey === periodKey
        );

        list.push({
          id: draftId,
          type: 'investment_depreciation',
          targetId: inv.id,
          targetName: inv.name,
          startDate,
          cutoffDate,
          periodKey,
          durationDays,
          annualRatePct,
          baseBalance: inv.balance,
          adjustmentAmount,
          projectedBalance,
          coaDebitCode: '5950',
          coaDebitName: 'Beban Depresiasi & Penurunan Nilai Investasi',
          coaCreditCode: '1590',
          coaCreditName: 'Akumulasi Penyesuaian Nilai Investasi',
          alreadyPostedThisPeriod,
        });
      });

    // 2. Debt Interest Accrual
    (debts || [])
      .filter((debt) => (debt.balance || 0) > 0 && (debt.interestRate || 0) > 0)
      .forEach((debt) => {
        const draftId = `adj-debt-${debt.id}`;
        const startDate =
          debt.startDate || debtCreationDateMap.get(debt.id) || thirtyDaysAgoFromCutoff;
        const computedDays = calcDaysBetween(startDate, cutoffDate);
        const durationDays =
          durationOverrides[draftId] !== undefined ? Math.max(0, durationOverrides[draftId]) : computedDays;
        const annualRatePct =
          rateOverrides[draftId] !== undefined ? Math.max(0, rateOverrides[draftId]) : debt.interestRate;

        const adjustmentAmount = Math.max(
          0,
          Math.round(debt.balance * (annualRatePct / 100) * (durationDays / 365))
        );
        const projectedBalance = debt.balance + adjustmentAmount;

        const alreadyPostedThisPeriod = postedAdjustments.some(
          (tx) =>
            tx.adjustmentType === 'debt_interest_accrual' &&
            tx.linkedDebtId === debt.id &&
            tx.adjustmentPeriodKey === periodKey
        );

        const isKprDebt =
          debt.category === 'KPR / Properti' || Boolean(debt.kprScheme) || /\bkpr\b/i.test(debt.name);
        const effKprCoa = resolveEffectiveKprCoaMapping(kprCoaMapping, debt.kprCoaSnapshot);
        const debitCode = isKprDebt ? effKprCoa.interestExpenseCode : '5810';
        const creditCode = isKprDebt ? effKprCoa.accruedInterestCode : '2390';
        const debitName =
          activeCoas.find((c) => c.code === debitCode)?.name || 'Beban Bunga KPR & Pinjaman Akrual';
        const creditName =
          activeCoas.find((c) => c.code === creditCode)?.name || 'Utang Bunga Akrual';

        list.push({
          id: draftId,
          type: 'debt_interest_accrual',
          targetId: debt.id,
          targetName: debt.name,
          startDate,
          cutoffDate,
          periodKey,
          durationDays,
          annualRatePct,
          baseBalance: debt.balance,
          adjustmentAmount,
          projectedBalance,
          coaDebitCode: debitCode,
          coaDebitName: debitName,
          coaCreditCode: creditCode,
          coaCreditName: creditName,
          alreadyPostedThisPeriod,
        });
      });

    return list;
  }, [
    investments,
    debts,
    cutoffDate,
    periodKey,
    defaultDepreciationRate,
    rateOverrides,
    durationOverrides,
    postedAdjustments,
    debtCreationDateMap,
    thirtyDaysAgoFromCutoff,
    kprCoaMapping,
    activeCoas,
  ]);

  const filteredDrafts = useMemo(() => {
    if (filterType === 'all') return drafts;
    return drafts.filter((d) => d.type === filterType);
  }, [drafts, filterType]);

  // Auto-select unposted items with amount > 0 whenever periodKey or draft set changes initially
  useEffect(() => {
    setSelectedIds((prev) => {
      const next: Record<string, boolean> = {};
      drafts.forEach((d) => {
        if (prev[d.id] !== undefined) {
          next[d.id] = prev[d.id] && !d.alreadyPostedThisPeriod && d.adjustmentAmount > 0;
        } else {
          next[d.id] = !d.alreadyPostedThisPeriod && d.adjustmentAmount > 0;
        }
      });
      return next;
    });
  }, [periodKey, drafts.length]);

  const selectedDrafts = useMemo(
    () => filteredDrafts.filter((d) => selectedIds[d.id] && d.adjustmentAmount > 0),
    [filteredDrafts, selectedIds]
  );

  const summaryTotals = useMemo(() => {
    const depTotal = selectedDrafts
      .filter((d) => d.type === 'investment_depreciation')
      .reduce((s, d) => s + d.adjustmentAmount, 0);
    const interestTotal = selectedDrafts
      .filter((d) => d.type === 'debt_interest_accrual')
      .reduce((s, d) => s + d.adjustmentAmount, 0);
    const postedPeriodTotal = postedAdjustments
      .filter((tx) => tx.adjustmentPeriodKey === periodKey)
      .reduce((s, tx) => s + tx.amount, 0);
    return { depTotal, interestTotal, postedPeriodTotal };
  }, [selectedDrafts, postedAdjustments, periodKey]);

  const toggleSelectAll = () => {
    const selectable = filteredDrafts.filter((d) => !d.alreadyPostedThisPeriod && d.adjustmentAmount > 0);
    if (selectable.length === 0) return;
    const allChecked = selectable.every((d) => selectedIds[d.id]);
    setSelectedIds((prev) => {
      const next = { ...prev };
      selectable.forEach((d) => {
        next[d.id] = !allChecked;
      });
      return next;
    });
  };

  const handleApplySelected = () => {
    if (selectedDrafts.length === 0) {
      showToast({
        type: 'warning',
        title: 'Tidak Ada Jurnal Terpilih',
        message: 'Centang minimal satu jurnal penyesuaian dengan nominal lebih dari Rp 0.',
      });
      return;
    }

    onApplyAdjustments(selectedDrafts);
    setSelectedIds((prev) => {
      const next = { ...prev };
      selectedDrafts.forEach((d) => {
        next[d.id] = false;
      });
      return next;
    });
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* HEADER & NON-CASH ACCOUNTING PRINCIPLE BANNER */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-start gap-3.5">
            <div className="p-3 rounded-xl bg-slate-900 dark:bg-blue-600 text-white shrink-0">
              <BookOpenCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                  Adjusting Entries (Jurnal Penyesuaian Otomatis)
                </h3>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                  Jurnal Non-Kas + Sinkron Neraca
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-1">
                Menghitung penyusutan aset investasi dan akrual bunga utang berdasarkan durasi kepemilikan tanpa mengubah saldo rekening kas/bank, sekaligus menyinkronkan nilai aset & kewajiban pada Neraca.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700">
              <Calendar className="h-4 w-4 text-slate-500 shrink-0" />
              <div className="flex flex-col">
                <span className="text-[10px] font-bold uppercase text-slate-400 leading-none">
                  Tanggal Cutoff
                </span>
                <input
                  type="date"
                  value={cutoffDate}
                  onChange={(e) => setCutoffDate(e.target.value || todayStr)}
                  className="bg-transparent text-xs font-mono font-bold text-slate-800 dark:text-slate-100 focus:outline-none mt-0.5"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleApplySelected}
              disabled={selectedDrafts.length === 0}
              className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 text-white text-xs font-extrabold transition cursor-pointer disabled:cursor-not-allowed whitespace-nowrap shrink-0 flex items-center gap-2"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>Terapkan Jurnal ({selectedDrafts.length})</span>
            </button>
          </div>
        </div>

        {/* 3 SUMMARY METRICS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-1">
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              <span>Depresiasi Investasi Terpilih</span>
              <TrendingDown className="h-4 w-4 text-amber-600" />
            </div>
            <p className="text-xl font-black font-mono tabular-nums text-slate-900 dark:text-slate-100">
              {formatterIDR.format(summaryTotals.depTotal)}
            </p>
            <p className="text-[11px] text-slate-500 font-medium">
              Dr 5950 Beban Depresiasi · Cr 1590 Akumulasi Nilai
            </p>
          </div>

          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-1">
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              <span>Akrual Bunga Utang Terpilih</span>
              <Percent className="h-4 w-4 text-rose-600" />
            </div>
            <p className="text-xl font-black font-mono tabular-nums text-slate-900 dark:text-slate-100">
              {formatterIDR.format(summaryTotals.interestTotal)}
            </p>
            <p className="text-[11px] text-slate-500 font-medium">
              Dr 5810 Beban Bunga Akrual · Cr 2390 Utang Bunga Akrual
            </p>
          </div>

          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-1">
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              <span>Penyesuaian Periode {periodKey}</span>
              <Scale className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="text-xl font-black font-mono tabular-nums text-slate-900 dark:text-slate-100">
              {formatterIDR.format(summaryTotals.postedPeriodTotal)}
            </p>
            <p className="text-[11px] text-slate-500 font-medium">
              {postedAdjustments.filter((tx) => tx.adjustmentPeriodKey === periodKey).length} entri non-kas terposting periode ini
            </p>
          </div>
        </div>

        {/* FILTER & GLOBAL RATE CONTROLS */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-fit">
            {[
              { id: 'all', label: `Semua Item (${drafts.length})` },
              {
                id: 'investment_depreciation',
                label: `Depresiasi Investasi (${drafts.filter((d) => d.type === 'investment_depreciation').length})`,
              },
              {
                id: 'debt_interest_accrual',
                label: `Akrual Bunga Utang (${drafts.filter((d) => d.type === 'debt_interest_accrual').length})`,
              },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterType(tab.id as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                  filterType === tab.id
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="font-bold text-slate-500 dark:text-slate-400">Tarif Depresiasi Default (%/thn):</span>
            <div className="flex items-center gap-1">
              {[3, 5, 10].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setDefaultDepreciationRate(r)}
                  className={`px-2 py-1 rounded-lg font-mono text-xs font-bold border cursor-pointer transition ${
                    defaultDepreciationRate === r
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {r}%
                </button>
              ))}
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={defaultDepreciationRate}
                onChange={(e) => setDefaultDepreciationRate(Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)))}
                className="w-16 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono font-bold text-xs text-right text-slate-800 dark:text-slate-100"
              />
            </div>
          </div>
        </div>

        {/* PREVIEW TABLE OR EMPTY STATE */}
        {filteredDrafts.length === 0 ? (
          <div className="py-10 px-4 text-center border border-dashed border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-slate-800/30 space-y-2">
            <Info className="h-8 w-8 text-slate-400 mx-auto" />
            <h4 className="text-sm font-extrabold text-slate-700 dark:text-slate-200">
              Belum Ada Aset Investasi atau Utang Berbunga Aktif
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Tambahkan portofolio investasi atau kewajiban pinjaman/KPR berbunga agar sistem dapat menghitung jurnal penyesuaian depresiasi dan akrual bunga secara otomatis.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/70 text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <th className="py-2.5 px-3 w-10 text-center">
                    <input
                      type="checkbox"
                      onChange={toggleSelectAll}
                      checked={
                        filteredDrafts.some((d) => !d.alreadyPostedThisPeriod && d.adjustmentAmount > 0) &&
                        filteredDrafts
                          .filter((d) => !d.alreadyPostedThisPeriod && d.adjustmentAmount > 0)
                          .every((d) => selectedIds[d.id])
                      }
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      aria-label="Pilih semua jurnal penyesuaian"
                    />
                  </th>
                  <th className="py-2.5 px-3">Pos Aset / Utang & Jurnal Berpasangan</th>
                  <th className="py-2.5 px-3 text-right">Durasi (Hari)</th>
                  <th className="py-2.5 px-3 text-right">Tarif %/Thn</th>
                  <th className="py-2.5 px-3 text-right">Saldo Tercatat</th>
                  <th className="py-2.5 px-3 text-right">Nominal Penyesuaian</th>
                  <th className="py-2.5 px-3 text-right">Saldo Setelah Sinkron</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredDrafts.map((item) => {
                  const isChecked = Boolean(selectedIds[item.id]);
                  const isDep = item.type === 'investment_depreciation';
                  return (
                    <tr
                      key={item.id}
                      className={`transition-colors ${
                        item.alreadyPostedThisPeriod
                          ? 'bg-slate-50/60 dark:bg-slate-800/30 opacity-75'
                          : isChecked
                          ? 'bg-blue-50/40 dark:bg-blue-950/20'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <td className="py-2.5 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={item.adjustmentAmount <= 0}
                          onChange={(e) =>
                            setSelectedIds((prev) => ({
                              ...prev,
                              [item.id]: e.target.checked,
                            }))
                          }
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                      </td>
                      <td className="py-2.5 px-3 min-w-[240px]">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${
                              isDep
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                            }`}
                          >
                            {isDep ? 'Depresiasi Aset' : 'Akrual Bunga'}
                          </span>
                          <span className="font-extrabold text-slate-900 dark:text-slate-100 truncate">
                            {item.targetName}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
                          Dr <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{item.coaDebitCode}</span> {item.coaDebitName} · Cr{' '}
                          <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{item.coaCreditCode}</span> {item.coaCreditName}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          Acuan tgl: {item.startDate} &rarr; {item.cutoffDate}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <input
                          type="number"
                          min={0}
                          max={3650}
                          value={item.durationDays}
                          onChange={(e) =>
                            setDurationOverrides((prev) => ({
                              ...prev,
                              [item.id]: Math.max(0, parseInt(e.target.value) || 0),
                            }))
                          }
                          className="w-20 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-right font-mono tabular-nums font-bold text-slate-800 dark:text-slate-100"
                        />
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.1}
                          value={item.annualRatePct}
                          onChange={(e) =>
                            setRateOverrides((prev) => ({
                              ...prev,
                              [item.id]: Math.max(0, parseFloat(e.target.value) || 0),
                            }))
                          }
                          className="w-16 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-right font-mono tabular-nums font-bold text-slate-800 dark:text-slate-100"
                        />
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {formatterIDR.format(item.baseBalance)}
                      </td>
                      <td
                        className={`py-2.5 px-3 text-right font-mono tabular-nums font-black whitespace-nowrap ${
                          isDep ? 'text-amber-700 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {isDep ? '-' : '+'}
                        {formatterIDR.format(item.adjustmentAmount)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-extrabold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        {formatterIDR.format(item.projectedBalance)}
                      </td>
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        {item.alreadyPostedThisPeriod ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold">
                            <CheckCircle2 className="h-3 w-3" />
                            Terposting ({item.periodKey})
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-[10px] font-bold">
                            <Clock className="h-3 w-3" />
                            Siap Posting
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* HISTORY OF POSTED ADJUSTING ENTRIES */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <History className="h-4.5 w-4.5 text-slate-600 dark:text-slate-300" />
            <div>
              <h4 className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
                Riwayat Jurnal Penyesuaian Non-Kas Terposting ({postedAdjustments.length})
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Pembalikan jurnal akan menghapus entri non-kas dan otomatis memulihkan saldo aset/utang sebelum penyesuaian.
              </p>
            </div>
          </div>
        </div>

        {postedAdjustments.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
            <FileSpreadsheet className="h-7 w-7 text-slate-300 mx-auto mb-2" />
            Belum ada jurnal penyesuaian yang diposting.
          </div>
        ) : (
          <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/70 text-[10px] font-extrabold uppercase tracking-wider text-slate-500 border-b border-slate-200 dark:border-slate-800">
                  <th className="py-2.5 px-3">Tanggal</th>
                  <th className="py-2.5 px-3">Kategori & Keterangan</th>
                  <th className="py-2.5 px-3">Pasangan COA</th>
                  <th className="py-2.5 px-3 text-right">Durasi / Tarif</th>
                  <th className="py-2.5 px-3 text-right">Nominal</th>
                  <th className="py-2.5 px-3 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {postedAdjustments.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-2.5 px-3 font-mono tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {tx.date}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="font-extrabold text-slate-800 dark:text-slate-100 block">{tx.category}</span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">{tx.description}</span>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      Dr {tx.coaDebitCode || '-'} / Cr {tx.coaCreditCode || '-'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {tx.adjustmentDurationDays ?? '-'} hr · {tx.adjustmentRatePct ?? '-'}%
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums font-black text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      {formatterIDR.format(tx.amount)}
                    </td>
                    <td className="py-2.5 px-3 text-center whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setReverseConfirmTx(tx)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[11px] font-bold transition cursor-pointer"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Balikkan
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* IN-APP REVERSE CONFIRMATION MODAL */}
      {reverseConfirmTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-rose-100 text-rose-600 shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <h4 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
                  Balikkan Jurnal Penyesuaian?
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Entri <strong>{reverseConfirmTx.description}</strong> senilai{' '}
                  <span className="font-mono font-bold">{formatterIDR.format(reverseConfirmTx.amount)}</span> akan dihapus dan saldo aset investasi, aset tetap, atau utang terkait akan dikembalikan seperti semula.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setReverseConfirmTx(null)}
                className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  onReverseAdjustment(reverseConfirmTx.id);
                  setReverseConfirmTx(null);
                }}
                className="px-4 py-2 rounded-xl text-xs font-extrabold text-white bg-rose-600 hover:bg-rose-700 cursor-pointer"
              >
                Ya, Balikkan Jurnal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
