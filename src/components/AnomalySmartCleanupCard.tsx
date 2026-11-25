import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  CategoryNode,
  DEFAULT_CATEGORY_HIERARCHY,
  flattenCategoryHierarchy,
} from '../categoryHierarchy';
import { Account, CategoryBudget, Transaction } from '../types';
import {
  isOperatingExpense,
  normalizeLedgerDateYYYYMMDD,
  toLocalYYYYMMDD,
} from '../utils/accountingEngine';
import { formatterIDR } from '../utils/formatters';

interface AnomalySmartCleanupCardProps {
  transactions: Transaction[];
  budgets: CategoryBudget[];
  accounts?: Account[];
  masterCategories?: CategoryNode[];
  onReassignTransactionCategories?: (
    transactionIds: string[],
    targetCategory: string
  ) => void;
}

interface TriggerTransaction {
  tx: Transaction;
  normalizedDate: string;
  absAmount: number;
  accountName: string;
  isDefaultTrigger: boolean;
}

interface DetectedAnomalyItem {
  category: string;
  currentMonthAmount: number;
  threeMonthAvgAmount: number;
  increasePct: number;
  excessAmount: number;
  budgetLimit: number;
  triggers: TriggerTransaction[];
  recommendedTarget: string;
  recommendationReason: string;
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

const KEYWORD_CATEGORY_RULES: Array<{ pattern: RegExp; candidates: string[] }> = [
  {
    pattern: /listrik|pln|pdam|air|wifi|internet|indihome|biznet|pulsa|paket data|telkom/i,
    candidates: ['Utilitas & Tagihan', 'Tagihan & Utilitas'],
  },
  {
    pattern: /bensin|pertamina|shell|bp|tol|parkir|gojek|grab|maxim|kereta|krl|mrt|ojol/i,
    candidates: ['Transportasi'],
  },
  {
    pattern: /tokopedia|shopee|lazada|blibli|tiktok shop|paket|ongkir/i,
    candidates: ['Belanja Online', 'Belanja Bulanan'],
  },
  {
    pattern: /supermarket|alfamart|indomaret|superindo|hypermart|sembako|beras|sabun|dapur/i,
    candidates: ['Belanja Bulanan', 'Kebutuhan Pokok'],
  },
  {
    pattern: /apotek|dokter|klinik|rumah sakit|rs|obat|medical|lab|vitamin|bpjs/i,
    candidates: ['Kesehatan', 'Biaya Tes Kesehatan', 'Biaya Perawatan Tubuh'],
  },
  {
    pattern: /netflix|spotify|youtube|bioskop|xxi|cgv|steam|game|konser|tiket/i,
    candidates: ['Hiburan'],
  },
  {
    pattern: /kopi|cafe|resto|warung|makan|gofood|grabfood|shopeefood|lunch|dinner/i,
    candidates: ['Makanan'],
  },
  {
    pattern: /zakat|infak|sedekah|donasi|sumbangan|sosial/i,
    candidates: ['Sosial'],
  },
  {
    pattern: /buku|kursus|sekolah|kuliah|les|seminar|pelatihan/i,
    candidates: ['Pendidikan'],
  },
];

function formatMonthLabel(ym: string): string {
  const [yStr, mStr] = ym.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return ym;
  return `${MONTHS_SHORT_ID[m - 1]} ${y}`;
}

function shiftMonthYYYYMM(baseYM: string, deltaMonths: number): string {
  const [yStr, mStr] = baseYM.split('-');
  const baseDate = new Date(Number(yStr), Number(mStr) - 1 + deltaMonths, 1);
  return `${baseDate.getFullYear()}-${String(baseDate.getMonth() + 1).padStart(2, '0')}`;
}

export const AnomalySmartCleanupCard: React.FC<AnomalySmartCleanupCardProps> = ({
  transactions,
  budgets,
  accounts = [],
  masterCategories = [],
  onReassignTransactionCategories,
}) => {
  const [selectedTxMap, setSelectedTxMap] = useState<Record<string, Set<string>>>({});
  const [targetCategoryMap, setTargetCategoryMap] = useState<Record<string, string>>({});
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const accountNameMap = useMemo(() => {
    const map = new Map<string, string>();
    accounts.forEach((acc) => map.set(acc.id, acc.name));
    return map;
  }, [accounts]);

  const masterExpenseCategories = useMemo(() => {
    const hierarchy =
      masterCategories && masterCategories.length > 0
        ? masterCategories
        : DEFAULT_CATEGORY_HIERARCHY;
    const flat = flattenCategoryHierarchy(hierarchy);
    const items = flat
      .filter((n) => n.type === 'item' && n.transactionType === 'expense')
      .map((n) => n.name.trim())
      .filter(Boolean);
    const budgetCats = budgets
      .filter((b) => b.type === 'expense')
      .map((b) => b.category.trim())
      .filter(Boolean);
    return Array.from(new Set([...budgetCats, ...items]));
  }, [masterCategories, budgets]);

  const { referenceYM, anomalies } = useMemo(() => {
    const expenseTxs = transactions.filter((tx) => isOperatingExpense(tx) && tx.amount > 0);
    if (expenseTxs.length === 0) {
      return { referenceYM: toLocalYYYYMMDD().slice(0, 7), anomalies: [] as DetectedAnomalyItem[] };
    }

    const calendarYM = toLocalYYYYMMDD().slice(0, 7);
    const monthlyTotalsByCategory = new Map<string, Map<string, number>>();
    const monthlyTxsByCategory = new Map<string, Map<string, TriggerTransaction[]>>();
    let latestAvailableYM = '';

    expenseTxs.forEach((tx) => {
      const normalizedDate = normalizeLedgerDateYYYYMMDD(tx.date);
      if (!normalizedDate) return;
      const ym = normalizedDate.slice(0, 7);
      if (!latestAvailableYM || ym > latestAvailableYM) {
        latestAvailableYM = ym;
      }

      const rawCat = (tx.category || '').trim();
      const cat = rawCat && rawCat !== '-' ? rawCat : 'Tanpa Kategori';
      const absAmount = Math.abs(tx.amount || 0);

      let catTotals = monthlyTotalsByCategory.get(cat);
      if (!catTotals) {
        catTotals = new Map<string, number>();
        monthlyTotalsByCategory.set(cat, catTotals);
      }
      catTotals.set(ym, (catTotals.get(ym) || 0) + absAmount);

      let catTxs = monthlyTxsByCategory.get(cat);
      if (!catTxs) {
        catTxs = new Map<string, TriggerTransaction[]>();
        monthlyTxsByCategory.set(cat, catTxs);
      }
      const list = catTxs.get(ym) || [];
      list.push({
        tx,
        normalizedDate,
        absAmount,
        accountName: accountNameMap.get(tx.accountId) || 'Akun Lainnya',
        isDefaultTrigger: false,
      });
      catTxs.set(ym, list);
    });

    // Use calendar month if it has expenses, otherwise evaluate the latest month with recorded expenses
    const hasCurrentMonthData = Array.from(monthlyTotalsByCategory.values()).some(
      (m) => (m.get(calendarYM) || 0) > 0
    );
    const evalYM = hasCurrentMonthData ? calendarYM : latestAvailableYM || calendarYM;
    const prevThreeMonths = [
      shiftMonthYYYYMM(evalYM, -1),
      shiftMonthYYYYMM(evalYM, -2),
      shiftMonthYYYYMM(evalYM, -3),
    ];

    // Map configured expense budgets & their current utilization in evalYM
    const budgetLimitMap = new Map<string, { displayName: string; limit: number; spent: number }>();
    budgets
      .filter((b) => b.type === 'expense' && b.limit > 0)
      .forEach((b) => {
        const displayName = b.category.trim();
        const key = displayName.toLowerCase();
        const spent = monthlyTotalsByCategory.get(displayName)?.get(evalYM) || 0;
        budgetLimitMap.set(key, { displayName, limit: b.limit, spent });
      });

    const detected: DetectedAnomalyItem[] = [];

    monthlyTotalsByCategory.forEach((ymMap, cat) => {
      const currentAmt = ymMap.get(evalYM) || 0;
      if (currentAmt <= 0) return;

      const prevAmounts = prevThreeMonths.map((pm) => ymMap.get(pm) || 0);
      const activePrevMonths = prevAmounts.filter((v) => v > 0);
      if (activePrevMonths.length === 0) return;

      // Average across trailing months that have prior baseline
      const avg3M =
        prevAmounts.reduce((s, v) => s + v, 0) / Math.max(1, activePrevMonths.length);
      if (avg3M <= 0) return;

      const ratio = currentAmt / avg3M;
      if (ratio < 1.3) return; // Flag >= +30% spike

      const increasePct = Math.round((ratio - 1) * 100);
      const excessAmount = Math.max(0, Math.round(currentAmt - avg3M));
      const budgetInfo = budgetLimitMap.get(cat.toLowerCase());
      const budgetLimit = budgetInfo?.limit || 0;

      const rawTriggers = [...(monthlyTxsByCategory.get(cat)?.get(evalYM) || [])].sort(
        (a, b) => b.absAmount - a.absAmount
      );

      // Mark top outlier transactions contributing to the spike above avg3M
      let accumulatedExcess = 0;
      const markedTriggers = rawTriggers.map((item, idx) => {
        const isTrigger = idx === 0 || accumulatedExcess < excessAmount;
        if (isTrigger) accumulatedExcess += item.absAmount;
        return {
          ...item,
          isDefaultTrigger: isTrigger,
        };
      });

      // Recommend best target budgeted category for Smart Cleanup
      const triggerDescriptions = markedTriggers
        .filter((t) => t.isDefaultTrigger)
        .map((t) => t.tx.description || '')
        .join(' ');

      let recommendedTarget = '';
      let recommendationReason = '';

      // 1. Check description keyword rules against configured expense budgets or master categories
      for (const rule of KEYWORD_CATEGORY_RULES) {
        if (rule.pattern.test(triggerDescriptions)) {
          const matchingBudget = rule.candidates.find((c) => {
            const lower = c.toLowerCase();
            return (
              lower !== cat.toLowerCase() &&
              budgetLimitMap.has(lower)
            );
          });
          if (matchingBudget) {
            const bInfo = budgetLimitMap.get(matchingBudget.toLowerCase())!;
            const headroom = Math.max(0, bInfo.limit - bInfo.spent);
            recommendedTarget = bInfo.displayName;
            recommendationReason =
              headroom > 0
                ? `Deskripsi transaksi cocok dengan pos "${bInfo.displayName}" yang masih memiliki sisa pagu ${formatterIDR.format(headroom)}.`
                : `Deskripsi transaksi pemicu lebih sesuai dicatat pada pos anggaran "${bInfo.displayName}".`;
            break;
          }

          const matchingMaster = rule.candidates.find((c) => {
            const lower = c.toLowerCase();
            return (
              lower !== cat.toLowerCase() &&
              masterExpenseCategories.some((m) => m.toLowerCase() === lower)
            );
          });
          if (matchingMaster) {
            recommendedTarget = matchingMaster;
            recommendationReason = `Deskripsi transaksi pemicu lebih tepat masuk ke kategori "${matchingMaster}".`;
            break;
          }
        }
      }

      // 2. Fallback: pick configured expense budget with highest available headroom
      if (!recommendedTarget) {
        const availableBudgets = Array.from(budgetLimitMap.values())
          .filter((b) => b.displayName.toLowerCase() !== cat.toLowerCase())
          .sort((a, b) => b.limit - b.spent - (a.limit - a.spent));

        if (availableBudgets.length > 0) {
          const topBudget = availableBudgets[0];
          const headroom = Math.max(0, topBudget.limit - topBudget.spent);
          recommendedTarget = topBudget.displayName;
          recommendationReason =
            headroom > 0
              ? `Pos budget "${topBudget.displayName}" masih memiliki ruang pagu ${formatterIDR.format(headroom)} untuk menyerap transaksi insidental.`
              : `Pertimbangkan relokasi transaksi outlier ke kategori terpantau "${topBudget.displayName}".`;
        } else {
          const fallbackMaster =
            masterExpenseCategories.find(
              (m) => m.toLowerCase() !== cat.toLowerCase()
            ) || 'Biaya Lain-Lain';
          recommendedTarget = fallbackMaster;
          recommendationReason = `Relokasikan transaksi pemicu dari kategori "${cat}" ke pos yang lebih spesifik.`;
        }
      }

      detected.push({
        category: cat,
        currentMonthAmount: Math.round(currentAmt),
        threeMonthAvgAmount: Math.round(avg3M),
        increasePct,
        excessAmount,
        budgetLimit,
        triggers: markedTriggers,
        recommendedTarget,
        recommendationReason,
      });
    });

    detected.sort((a, b) => b.increasePct - a.increasePct);

    return {
      referenceYM: evalYM,
      anomalies: detected,
    };
  }, [transactions, budgets, accountNameMap, masterExpenseCategories]);

  // Initialize default checked trigger transactions & recommended targets when anomalies update
  useEffect(() => {
    setSelectedTxMap((prev) => {
      const next: Record<string, Set<string>> = {};
      anomalies.forEach((anom) => {
        const existing = prev[anom.category];
        const validIds = new Set(anom.triggers.map((t) => t.tx.id));
        if (existing) {
          const kept = new Set(Array.from(existing).filter((id) => validIds.has(id)));
          if (kept.size > 0) {
            next[anom.category] = kept;
            return;
          }
        }
        next[anom.category] = new Set(
          anom.triggers.filter((t) => t.isDefaultTrigger).map((t) => t.tx.id)
        );
      });
      return next;
    });

    setTargetCategoryMap((prev) => {
      const next: Record<string, string> = {};
      anomalies.forEach((anom) => {
        next[anom.category] = prev[anom.category] || anom.recommendedTarget;
      });
      return next;
    });
  }, [anomalies]);

  const toggleTriggerTx = (category: string, txId: string) => {
    setSelectedTxMap((prev) => {
      const current = new Set(prev[category] || []);
      if (current.has(txId)) {
        current.delete(txId);
      } else {
        current.add(txId);
      }
      return { ...prev, [category]: current };
    });
  };

  const toggleExpandCategory = (category: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const handleApplyCleanup = (anom: DetectedAnomalyItem) => {
    if (!onReassignTransactionCategories) return;
    const selectedIds = Array.from(selectedTxMap[anom.category] || []);
    const targetCategory = targetCategoryMap[anom.category] || anom.recommendedTarget;
    if (selectedIds.length === 0 || !targetCategory) return;
    onReassignTransactionCategories(selectedIds, targetCategory);
  };

  return (
    <section className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-amber-600 text-white shrink-0">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                Detektor Anomali Pengeluaran (&ge; +30%) &amp; Smart Cleanup
              </h3>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                · Periode {formatMonthLabel(referenceYM)} vs Rata-Rata 3 Bulan
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
              Otomatis mendeteksi kategori yang melonjak minimal 30% di atas rata-rata historis dan menyarankan pemindahan transaksi pemicu ke kategori budget yang lebih tepat.
            </p>
          </div>
        </div>

        <span
          className={`text-xs font-bold whitespace-nowrap shrink-0 ${
            anomalies.length > 0
              ? 'text-amber-700 dark:text-amber-300'
              : 'text-emerald-700 dark:text-emerald-400'
          }`}
        >
          {anomalies.length > 0
            ? `${anomalies.length} Kategori Melonjak`
            : 'Tidak Ada Anomali'}
        </span>
      </div>

      {anomalies.length === 0 ? (
        <div className="p-5 rounded-xl border border-emerald-200 dark:border-emerald-800/70 bg-emerald-50/50 dark:bg-emerald-950/20 flex items-center gap-3 text-xs">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <div>
            <p className="font-bold text-emerald-900 dark:text-emerald-200">
              Pola Pengeluaran {formatMonthLabel(referenceYM)} Terkendali
            </p>
            <p className="text-emerald-800 dark:text-emerald-300 mt-0.5">
              Tidak ada kategori operasional yang mengalami lonjakan &ge; 30% dibandingkan rata-rata 3 bulan sebelumnya.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {anomalies.map((anom) => {
            const checkedIds = selectedTxMap[anom.category] || new Set<string>();
            const selectedCount = checkedIds.size;
            const selectedSubtotal = anom.triggers
              .filter((t) => checkedIds.has(t.tx.id))
              .reduce((s, t) => s + t.absAmount, 0);
            const targetCat = targetCategoryMap[anom.category] || anom.recommendedTarget;
            const isExpanded = expandedCategories.has(anom.category);
            const visibleTriggers = isExpanded ? anom.triggers : anom.triggers.slice(0, 4);

            const targetOptions = masterExpenseCategories.filter(
              (c) => c.toLowerCase() !== anom.category.toLowerCase()
            );
            if (
              targetCat &&
              !targetOptions.some((c) => c.toLowerCase() === targetCat.toLowerCase())
            ) {
              targetOptions.unshift(targetCat);
            }

            const isSevere = anom.increasePct >= 60;

            return (
              <div
                key={anom.category}
                className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/20 space-y-4"
              >
                {/* Anomaly Metrics Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <AlertTriangle
                        className={`h-4 w-4 shrink-0 ${
                          isSevere
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-amber-600 dark:text-amber-400'
                        }`}
                      />
                      <h4 className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
                        {anom.category}
                      </h4>
                      <span
                        className={`text-xs font-mono tabular-nums font-extrabold ${
                          isSevere
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-amber-700 dark:text-amber-300'
                        }`}
                      >
                        +{anom.increasePct}% vs rata-rata 3 bln
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-1">
                      <span>
                        Bulan ini:{' '}
                        <strong className="font-mono tabular-nums text-slate-800 dark:text-slate-100">
                          {formatterIDR.format(anom.currentMonthAmount)}
                        </strong>
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        Rata-rata 3 bln:{' '}
                        <strong className="font-mono tabular-nums text-slate-700 dark:text-slate-200">
                          {formatterIDR.format(anom.threeMonthAvgAmount)}
                        </strong>
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        Selisih lonjakan:{' '}
                        <strong className="font-mono tabular-nums text-rose-600 dark:text-rose-400">
                          +{formatterIDR.format(anom.excessAmount)}
                        </strong>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Smart Cleanup Recommendation & Action Bar */}
                <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="space-y-1 text-xs">
                    <div className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                      <span>Saran Smart Cleanup</span>
                      <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                      <span className="text-blue-700 dark:text-blue-300">
                        Pindahkan ke {targetCat}
                      </span>
                    </div>
                    <p className="text-slate-500 dark:text-slate-400">
                      {anom.recommendationReason}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <select
                      value={targetCat}
                      onChange={(e) =>
                        setTargetCategoryMap((prev) => ({
                          ...prev,
                          [anom.category]: e.target.value,
                        }))
                      }
                      aria-label={`Pilih kategori budget tujuan untuk ${anom.category}`}
                      className="px-3 py-2 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
                    >
                      {targetOptions.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>

                    {onReassignTransactionCategories && (
                      <button
                        type="button"
                        disabled={selectedCount === 0}
                        onClick={() => handleApplyCleanup(anom)}
                        className="px-3.5 py-2 rounded-lg text-xs font-bold bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-500 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 text-white transition cursor-pointer disabled:cursor-not-allowed whitespace-nowrap shrink-0"
                      >
                        Terapkan Smart Cleanup ({selectedCount})
                      </button>
                    )}
                  </div>
                </div>

                {/* Trigger Transactions Table with Checkboxes */}
                <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/60 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                        <th className="py-2 px-3 w-10">Pilih</th>
                        <th className="py-2 px-3 whitespace-nowrap">Tanggal</th>
                        <th className="py-2 px-3">Deskripsi Transaksi Pemicu</th>
                        <th className="py-2 px-3 whitespace-nowrap">Akun</th>
                        <th className="py-2 px-3 text-right whitespace-nowrap">Nominal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                      {visibleTriggers.map((item) => {
                        const isChecked = checkedIds.has(item.tx.id);
                        return (
                          <tr
                            key={item.tx.id}
                            onClick={() => toggleTriggerTx(anom.category, item.tx.id)}
                            className={`cursor-pointer transition-colors ${
                              isChecked
                                ? 'bg-blue-50/40 dark:bg-blue-950/20 hover:bg-blue-50/70 dark:hover:bg-blue-950/30'
                                : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                            }`}
                          >
                            <td
                              className="py-2 px-3"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleTriggerTx(anom.category, item.tx.id)}
                                aria-label={`Pilih transaksi ${item.tx.description || anom.category}`}
                                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                              />
                            </td>
                            <td className="py-2 px-3 font-mono tabular-nums text-slate-600 dark:text-slate-300 whitespace-nowrap">
                              {item.normalizedDate}
                            </td>
                            <td className="py-2 px-3 font-medium text-slate-900 dark:text-slate-100 max-w-[280px] truncate">
                              {item.tx.description?.trim() || anom.category}
                            </td>
                            <td className="py-2 px-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                              {item.accountName}
                            </td>
                            <td className="py-2 px-3 text-right font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                              {formatterIDR.format(item.absAmount)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  <div className="px-3 py-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="text-slate-500 dark:text-slate-400">
                      Dipilih:{' '}
                      <strong className="font-mono tabular-nums text-slate-800 dark:text-slate-100">
                        {selectedCount} transaksi ({formatterIDR.format(selectedSubtotal)})
                      </strong>
                    </span>

                    {anom.triggers.length > 4 && (
                      <button
                        type="button"
                        onClick={() => toggleExpandCategory(anom.category)}
                        className="text-blue-600 dark:text-blue-400 font-semibold hover:underline flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                      >
                        {isExpanded ? (
                          <>
                            <span>Ringkas</span>
                            <ChevronUp className="h-3.5 w-3.5" />
                          </>
                        ) : (
                          <>
                            <span>Lihat Semua ({anom.triggers.length})</span>
                            <ChevronDown className="h-3.5 w-3.5" />
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
