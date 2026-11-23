import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Transaction, Account, TransactionType, CategoryBudget, Debt, InvestmentAsset, RecurringTransaction, KprCoaMappingConfig } from '../types';
import { CategoryNode, flattenCategoryHierarchy } from '../categoryHierarchy';
import { FormattedNumberInput } from './FormattedNumberInput';
import { PlusCircle, ArrowLeftRight, Trash2, Calendar, FileText, DollarSign, ArrowUpRight, ArrowDownLeft, Wallet, Percent, Search, AlertTriangle, ShieldCheck, Sparkles, Repeat, Play, Power, Clock, CheckCircle2, RefreshCw, Coins, Info, Filter, SlidersHorizontal, CheckSquare, Square, X, RotateCcw, ChevronDown, ChevronUp, Tag, Flame, Bell, BellRing, Award, Layers, Home } from 'lucide-react';
import { getStoredCoaList, getAccountCoaMapping, AccountCOA } from '../coaUtils';
import { DEFAULT_KPR_COA_MAPPING, resolveEffectiveKprCoaMapping, resolveTransactionCoaCodes } from '../utils/kprPresets';
import { showToast } from '../utils/toast';
import {
  applyAccountBalanceChange,
  applyCreditBillPayment,
  calculateKprInstallmentBreakdown,
  getAccountCreditBill,
  getTransactionAccountDelta,
  isCreditAccount,
  normalizeAbsAmount,
  toLocalYYYYMMDD,
} from '../utils/accountingEngine';

interface TransactionsTabProps {
  transactions: Transaction[];
  accounts: Account[];
  budgets: CategoryBudget[];
  debts: Debt[];
  investments: InvestmentAsset[];
  recurringTransactions?: RecurringTransaction[];
  masterCategories?: CategoryNode[];
  kprCoaMapping?: KprCoaMappingConfig;
  preselectedPayDebtId?: string | null;
  onClearPreselectedPayDebt?: () => void;
  onAddTransaction: (tx: Omit<Transaction, 'id'> & {
    linkedDebtId?: string;
    linkedDebtAction?: 'create' | 'pay';
    linkedInvestmentId?: string;
    linkedInvestmentAction?: 'buy' | 'sell';
    unitPrice?: number;
    units?: number;
    unitName?: string;
    newDebtDetails?: {
      name: string;
      interestRate: number;
      minPayment: number;
      purpose: 'productive' | 'consumptive';
      category: string;
    };
    newInvestmentDetails?: {
      name: string;
      category: string;
      unitPrice?: number;
      units?: number;
      unitName?: string;
    };
  }) => boolean | void;
  onDeleteTransaction: (id: string) => void;
  onTransferFunds: (amount: number, fromAccountId: string, toAccountId: string, description: string) => void;
  onAddRecurringTransaction?: (rec: Omit<RecurringTransaction, 'id'>) => void;
  onUpdateRecurringTransaction?: (rec: RecurringTransaction) => void;
  onDeleteRecurringTransaction?: (id: string) => void;
  onToggleRecurringTransaction?: (id: string) => void;
  onManualRunRecurring?: (id: string) => void;
  onBatchUpdateCategories?: (updates: { id: string; category: string }[]) => void;
}

export const TransactionsTab: React.FC<TransactionsTabProps> = ({
  transactions,
  accounts,
  budgets,
  debts = [],
  investments = [],
  recurringTransactions = [],
  masterCategories = [],
  kprCoaMapping = DEFAULT_KPR_COA_MAPPING,
  preselectedPayDebtId = null,
  onClearPreselectedPayDebt,
  onAddTransaction,
  onDeleteTransaction,
  onTransferFunds,
  onAddRecurringTransaction,
  onUpdateRecurringTransaction,
  onDeleteRecurringTransaction,
  onToggleRecurringTransaction,
  onManualRunRecurring,
  onBatchUpdateCategories,
}) => {
  // Combine explicit debts with credit/paylater accounts that have bills
  const accountDebts = accounts
    .filter(a => isCreditAccount(a) && getAccountCreditBill(a) > 0)
    .map(a => {
      const bill = getAccountCreditBill(a);
      return {
        id: `acc-debt-${a.id}`,
        name: `${a.name} (Tagihan)`,
        balance: bill,
        interestRate: 0,
        minPayment: a.minPayment ?? bill * 0.1,
        purpose: 'consumptive' as const,
        category: a.type === 'credit-card' ? 'Kartu Kredit' : 'PayLater / Fintech',
        dueDay: a.dueDay,
        isAccount: true as const,
      };
    });

  const allDebts = [...debts.map(d => ({ ...d, isAccount: false as const })), ...accountDebts];

  // Helper function: Calculate days until due for recurring transactions
  const getDaysUntilDue = (dayOfMonth: number) => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const todayDate = now.getDate();

    const lastDayThisMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const validDayThisMonth = Math.min(dayOfMonth, lastDayThisMonth);

    let targetDate = new Date(currentYear, currentMonth, validDayThisMonth);
    const startOfToday = new Date(currentYear, currentMonth, todayDate);

    if (targetDate.getTime() < startOfToday.getTime()) {
      const lastDayNextMonth = new Date(currentYear, currentMonth + 2, 0).getDate();
      const validDayNextMonth = Math.min(dayOfMonth, lastDayNextMonth);
      targetDate = new Date(currentYear, currentMonth + 1, validDayNextMonth);
    }

    const diffMs = targetDate.getTime() - startOfToday.getTime();
    return Math.round(diffMs / (1000 * 60 * 60 * 24));
  };

  const handleEnablePushNotifications = async () => {
    if (!('Notification' in window)) {
      showToast({
        type: 'warning',
        title: 'Tidak Didukung Browser',
        message: 'Browser Anda tidak mendukung Web Notification API.',
      });
      return;
    }

    try {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        showToast({
          type: 'success',
          title: 'Pemberitahuan Push Aktif',
          message: 'Pengingat otomatis akan dikirim saat tagihan rutin jatuh tempo dalam 3 hari.',
        });
        
        if ('serviceWorker' in navigator) {
          const payload = {
            type: 'CHECK_RECURRING_DUE',
            recurringTransactions
          };
          if (navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage(payload);
            navigator.serviceWorker.controller.postMessage({ type: 'TEST_NOTIFICATION' });
          } else {
            navigator.serviceWorker.ready.then((reg) => {
              reg.active?.postMessage(payload);
              reg.active?.postMessage({ type: 'TEST_NOTIFICATION' });
            });
          }
        }
      } else {
        showToast({
          type: 'warning',
          title: 'Izin Notifikasi Ditolak',
          message: 'Izin pemberitahuan belum diberikan atau diblokir di setelan browser.',
        });
      }
    } catch (err) {
      console.error('Notification permission error:', err);
    }
  };

  // Add Transaction Form States
  const [date, setDate] = useState<string>(toLocalYYYYMMDD());
  const [accountId, setAccountId] = useState<string>(accounts[0]?.id || '');
  const [type, setType] = useState<TransactionType>('expense');
  const [category, setCategory] = useState<string>('Makanan');
  const [description, setDescription] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [isSuggestingCategory, setIsSuggestingCategory] = useState<boolean>(false);
  const [hasManuallySelectedCategory, setHasManuallySelectedCategory] = useState<boolean>(false);

  const isDebtPayCategory = (cat: string) => {
    const normalized = cat.trim().toLowerCase();
    return (
      normalized === 'cicilan / pelunasan utang' ||
      normalized === 'cicilan kpr' ||
      normalized === 'pelunasan utang' ||
      normalized === kprCoaMapping.principalPaymentCategory.trim().toLowerCase()
    );
  };
  const isDebtPayMode = type === 'expense' && isDebtPayCategory(category);

  // Natural Language AI Transaction Parsing States
  const [naturalLanguageInput, setNaturalLanguageInput] = useState<string>('');
  const [isParsingNaturalTx, setIsParsingNaturalTx] = useState<boolean>(false);
  const [naturalTxParseNotice, setNaturalTxParseNotice] = useState<string | null>(null);

  const handleParseNaturalLanguageTx = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!naturalLanguageInput.trim()) return;

    setIsParsingNaturalTx(true);
    setNaturalTxParseNotice(null);

    try {
      const budgetCategories = budgets.map(b => b.category);
      const historyCategories = Array.from(new Set(transactions.map(t => t.category).filter(Boolean)));
      const masterCatNames = masterCategories ? flattenCategoryHierarchy(masterCategories).map(c => c.name) : [];
      const combinedCategories = Array.from(new Set([...budgetCategories, ...historyCategories, ...masterCatNames, 'Makanan', 'Transportasi', 'Hiburan', 'Utilitas & Tagihan', 'Belanja Bulanan', 'Gaji Utama']));

      const res = await fetch('/api/parse-natural-transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          promptText: naturalLanguageInput,
          availableAccounts: accounts.map(a => ({ id: a.id, name: a.name, type: a.type })),
          availableCategories: combinedCategories,
        })
      });

      if (!res.ok) {
        throw new Error(`Gagal memproses AI (${res.status})`);
      }

      const data = await res.json();

      if (data.type && ['expense', 'income', 'saving', 'investment'].includes(data.type)) {
        setType(data.type as TransactionType);
      }
      if (data.amount) {
        setAmount(data.amount.toString());
      }
      if (data.description) {
        setDescription(data.description);
      }
      if (data.category) {
        setCategory(data.category);
        setHasManuallySelectedCategory(true);
      }
      if (data.accountId && accounts.some(a => a.id === data.accountId)) {
        setAccountId(data.accountId);
      }
      if (data.date) {
        setDate(data.date);
      }

      setNaturalTxParseNotice(data.explanation || 'Form transaksi berhasil diisi secara otomatis oleh AI Gemini! Silakan periksa atau langsung simpan.');
    } catch (err: any) {
      console.error("Natural Language Parse Error:", err);
      // Fallback local regex parsing
      const text = naturalLanguageInput.toLowerCase();
      let extractedAmt = 0;

      const jtMatch = text.match(/(\d+([.,]\d+)?)\s*(juta|jt)/);
      const rbMatch = text.match(/(\d+([.,]\d+)?)\s*(ribu|rb|k)/);
      const numMatch = text.match(/(\d+[\d.,]*)/);

      if (jtMatch) {
        extractedAmt = parseFloat(jtMatch[1].replace(',', '.')) * 1000000;
      } else if (rbMatch) {
        extractedAmt = parseFloat(rbMatch[1].replace(',', '.')) * 1000;
      } else if (numMatch) {
        extractedAmt = parseFloat(numMatch[1].replace(/\./g, '').replace(',', '.'));
      }

      if (extractedAmt > 0) {
        setAmount(extractedAmt.toString());
      }

      if (text.includes('gaji') || text.includes('dapat') || text.includes('masuk') || text.includes('terima')) {
        setType('income');
      }

      setDescription(naturalLanguageInput);
      setNaturalTxParseNotice('Data terisi secara lokal. Silakan periksa rincian sebelum menyimpan.');
    } finally {
      setIsParsingNaturalTx(false);
    }
  };

  // --- AI DATA CLEANUP STATES ---
  const [isCleanupModalOpen, setIsCleanupModalOpen] = useState<boolean>(false);
  const [isAnalyzingCleanup, setIsAnalyzingCleanup] = useState<boolean>(false);
  const [cleanupSuggestions, setCleanupSuggestions] = useState<Array<{
    id: string;
    originalCategory: string;
    suggestedCategory: string;
    confidence: string;
    reason: string;
    selected: boolean;
  }>>([]);
  const [cleanupSuccessNotice, setCleanupSuccessNotice] = useState<string | null>(null);

  // Uncategorized / "Lainnya" transactions list
  const uncategorizedTransactions = React.useMemo(() => {
    return transactions.filter(t => 
      !t.category || 
      ['lainnya', 'lain-lain', 'uncategorized', 'umum', 'tanpa kategori'].includes(t.category.trim().toLowerCase())
    );
  }, [transactions]);

  const handleRunCleanupAI = async () => {
    if (uncategorizedTransactions.length === 0) return;
    setIsAnalyzingCleanup(true);
    setCleanupSuccessNotice(null);

    try {
      const budgetCategories = budgets.map(b => b.category);
      const historyCategories = Array.from(new Set(transactions.map(t => t.category).filter(Boolean)));
      const masterCatNames = masterCategories ? flattenCategoryHierarchy(masterCategories).map(c => c.name) : [];
      const combinedCategories = Array.from(new Set([...budgetCategories, ...historyCategories, ...masterCatNames, 'Makanan & Minuman', 'Transportasi', 'Hiburan', 'Utilitas & Tagihan', 'Belanja Bulanan', 'Gaji Utama', 'Operasional Usaha', 'Kesehatan']));

      const res = await fetch('/api/suggest-category-cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uncategorizedTransactions: uncategorizedTransactions.map(t => ({
            id: t.id,
            description: t.description,
            amount: t.amount,
            type: t.type,
            category: t.category,
            date: t.date,
          })),
          availableCategories: combinedCategories,
        })
      });

      if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
      const data = await res.json();

      if (data.suggestions && Array.isArray(data.suggestions)) {
        const mapped = data.suggestions.map((s: any) => ({
          id: s.id,
          originalCategory: s.originalCategory || 'Lainnya',
          suggestedCategory: s.suggestedCategory || 'Umum',
          confidence: s.confidence || 'high',
          reason: s.reason || 'Berdasarkan analisis kata kunci deskripsi transaksi.',
          selected: true,
        }));
        setCleanupSuggestions(mapped);
      } else {
        setCleanupSuggestions([]);
      }
    } catch (err: any) {
      console.error("AI Cleanup Error:", err);
      // Fallback local heuristic
      const fallbackSuggestions = uncategorizedTransactions.map(t => {
        const desc = t.description.toLowerCase();
        let cat = 'Lainnya';
        if (desc.includes('kopi') || desc.includes('makan') || desc.includes('nasi') || desc.includes('resto') || desc.includes('cafe')) {
          cat = 'Makanan & Minuman';
        } else if (desc.includes('bensin') || desc.includes('gojek') || desc.includes('grab') || desc.includes('parkir') || desc.includes('tol')) {
          cat = 'Transportasi';
        } else if (desc.includes('listrik') || desc.includes('air') || desc.includes('wifi') || desc.includes('indihome') || desc.includes('pulsa')) {
          cat = 'Utilitas & Tagihan';
        } else if (desc.includes('supermarket') || desc.includes('alfamart') || desc.includes('indomaret') || desc.includes('belanja')) {
          cat = 'Belanja Bulanan';
        } else if (desc.includes('gaji') || desc.includes('bonus') || desc.includes('thr')) {
          cat = 'Gaji Utama';
        } else if (t.type === 'expense') {
          cat = 'Pengeluaran Umum';
        } else {
          cat = 'Pemasukan Lainnya';
        }

        return {
          id: t.id,
          originalCategory: t.category || 'Lainnya',
          suggestedCategory: cat,
          confidence: 'medium',
          reason: 'Dianalisis secara otomatis dari deskripsi transaksi.',
          selected: true,
        };
      });
      setCleanupSuggestions(fallbackSuggestions);
    } finally {
      setIsAnalyzingCleanup(false);
    }
  };

  const handleApplyCleanupBatch = () => {
    const selectedUpdates = cleanupSuggestions
      .filter(s => s.selected)
      .map(s => ({ id: s.id, category: s.suggestedCategory }));

    if (selectedUpdates.length > 0 && onBatchUpdateCategories) {
      onBatchUpdateCategories(selectedUpdates);
      setCleanupSuccessNotice(`Berhasil memperbarui ${selectedUpdates.length} kategori transaksi secara otomatis!`);
      setCleanupSuggestions([]);
      setTimeout(() => {
        setIsCleanupModalOpen(false);
        setCleanupSuccessNotice(null);
      }, 1600);
    }
  };

  // Load Master COA list from coaUtils or localStorage
  const storedCoaList = React.useMemo(() => getStoredCoaList(), []);

  // Top Frequent Master COA Categories per Transaction Type based on usage history
  const masterCoaCategoryAutosuggestions = React.useMemo(() => {
    // Map transaction type to COA Category
    const coaTypeMap: Record<TransactionType, 'Income' | 'Expense' | 'Asset' | 'Liability'> = {
      income: 'Income',
      expense: 'Expense',
      saving: 'Asset',
      investment: 'Asset',
    };

    const targetCoaCategory = coaTypeMap[type];
    const relevantCoas = storedCoaList.filter((c) => c.category === targetCoaCategory);

    // Count usage frequency of each category in history for current transaction type
    const counts: Record<string, number> = {};
    transactions.forEach((tx) => {
      if (tx.type === type && tx.category) {
        counts[tx.category] = (counts[tx.category] || 0) + 1;
      }
    });

    // Map Master COA items to suggestions with usage counts
    const coaSuggestions = relevantCoas.map((coa) => {
      let usageCount = counts[coa.name] || 0;
      // Match against existing historical category names
      Object.entries(counts).forEach(([catName, cnt]) => {
        if (
          catName !== coa.name &&
          (catName.toLowerCase().includes(coa.name.toLowerCase()) ||
            coa.name.toLowerCase().includes(catName.toLowerCase()))
        ) {
          usageCount += cnt;
        }
      });

      return {
        coaCode: coa.code,
        coaName: coa.name,
        categoryName: coa.name,
        description: coa.description,
        count: usageCount,
        isMasterCoa: true,
      };
    });

    // Also include top historical categories not explicitly in COA list
    const otherHistorySuggestions: Array<{
      coaCode: string;
      coaName: string;
      categoryName: string;
      description: string;
      count: number;
      isMasterCoa: boolean;
    }> = [];

    Object.entries(counts).forEach(([catName, cnt]) => {
      const isAlreadyInCoa = coaSuggestions.some(
        (c) => c.coaName.toLowerCase() === catName.toLowerCase()
      );
      if (!isAlreadyInCoa) {
        otherHistorySuggestions.push({
          coaCode: 'MISC',
          coaName: catName,
          categoryName: catName,
          description: 'Kategori histori transaksi',
          count: cnt,
          isMasterCoa: false,
        });
      }
    });

    // Combine and sort by usage count DESC, then Master COA priority, then coaCode
    return [...coaSuggestions, ...otherHistorySuggestions].sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      if (a.isMasterCoa && !b.isMasterCoa) return -1;
      if (!a.isMasterCoa && b.isMasterCoa) return 1;
      return a.coaCode.localeCompare(b.coaCode);
    });
  }, [type, transactions, storedCoaList]);

  // Match Description with Master COA & Historical Transactions for Autosuggestion
  const masterCoaDescriptionSuggestion = React.useMemo(() => {
    const query = description.trim().toLowerCase();
    if (query.length < 2) return null;

    // Check exact or keyword match with Master COA items first
    for (const item of masterCoaCategoryAutosuggestions) {
      const nameLower = item.coaName.toLowerCase();
      const descLower = item.description.toLowerCase();
      const words = query.split(/\s+/).filter((w) => w.length >= 3);

      const isKeywordMatch = words.some(
        (w) => nameLower.includes(w) || descLower.includes(w)
      );

      if (isKeywordMatch || nameLower.includes(query) || query.includes(nameLower)) {
        return {
          category: item.categoryName,
          coaCode: item.coaCode,
          coaName: item.coaName,
          count: item.count,
          reason: item.isMasterCoa
            ? `Kata kunci "${query}" cocok dengan Kode COA ${item.coaCode} (${item.coaName})`
            : `Cocok dengan histori kategori ${item.categoryName}`,
          isMasterCoa: item.isMasterCoa,
        };
      }
    }

    // Fallback to checking sample transactions description match
    const catCounts: Record<string, { count: number; sampleDesc: string }> = {};
    transactions.forEach((tx) => {
      if (
        tx.type === type &&
        tx.description &&
        tx.description.toLowerCase().includes(query) &&
        tx.category
      ) {
        if (!catCounts[tx.category]) {
          catCounts[tx.category] = { count: 1, sampleDesc: tx.description };
        } else {
          catCounts[tx.category].count += 1;
        }
      }
    });

    const sortedHist = Object.entries(catCounts).sort((a, b) => b[1].count - a[1].count);
    if (sortedHist.length > 0) {
      const topCat = sortedHist[0][0];
      const matchedCoa = storedCoaList.find((c) => c.name.toLowerCase() === topCat.toLowerCase());
      return {
        category: topCat,
        coaCode: matchedCoa ? matchedCoa.code : 'HISTORI',
        coaName: topCat,
        count: sortedHist[0][1].count,
        reason: `Cocok histori "${sortedHist[0][1].sampleDesc}" → Kategori ${topCat}`,
        isMasterCoa: !!matchedCoa,
      };
    }

    return null;
  }, [description, type, masterCoaCategoryAutosuggestions, transactions, storedCoaList]);

  // Auto-apply suggested category if description matches Master COA/Histori and user hasn't explicitly chosen
  React.useEffect(() => {
    if (
      masterCoaDescriptionSuggestion &&
      !hasManuallySelectedCategory &&
      masterCoaDescriptionSuggestion.category !== category
    ) {
      setCategory(masterCoaDescriptionSuggestion.category);
    }
  }, [masterCoaDescriptionSuggestion, hasManuallySelectedCategory, category]);

  // Default to top-ranked Master COA category when type changes if user hasn't manually locked in
  React.useEffect(() => {
    if (masterCoaCategoryAutosuggestions.length > 0) {
      const topCat = masterCoaCategoryAutosuggestions[0].categoryName;
      if (!hasManuallySelectedCategory) {
        setCategory(topCat);
      }
    }
  }, [type, masterCoaCategoryAutosuggestions, hasManuallySelectedCategory]);

  const handleSuggestCategory = async () => {
    if (!description.trim()) return;
    setIsSuggestingCategory(true);
    try {
      const budgetCategories = budgets.map(b => b.category);
      const historyCategories = Array.from(new Set(transactions.map(t => t.category).filter(Boolean)));
      const masterCatNames = masterCategories ? flattenCategoryHierarchy(masterCategories).map(c => c.name) : [];
      const combinedCategories = Array.from(new Set([...budgetCategories, ...historyCategories, ...masterCatNames]));

      const res = await fetch('/api/suggest-category', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          description, 
          existingCategories: combinedCategories,
          transactionHistory: transactions.slice(0, 30).map(t => ({ description: t.description, category: t.category, type: t.type }))
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.category) {
          setCategory(data.category);
        }
      }
    } catch (err) {
      console.error('Failed to suggest category', err);
    } finally {
      setIsSuggestingCategory(false);
    }
  };

  // Linked Features Form States
  const [linkedDebtId, setLinkedDebtId] = useState<string>('');
  const [splitPrincipalInterest, setSplitPrincipalInterest] = useState<boolean>(true);
  const [interestPortion, setInterestPortion] = useState<string>('0');

  const estimateMonthlyDebtInterest = (
    debt?: { balance: number; interestRate?: number; isAccount?: boolean; [key: string]: any },
    payAmt?: number
  ) => {
    if (!debt || debt.isAccount || !debt.interestRate || debt.interestRate <= 0 || debt.balance <= 0) return 0;
    const split = calculateKprInstallmentBreakdown({
      debt: debt as Debt,
      paymentAmount: payAmt && payAmt > 0 ? payAmt : (debt.minPayment || debt.balance || 0),
      paymentDate: date,
      baseCoaMapping: kprCoaMapping,
    });
    return split.interestPart;
  };

  const activateDebtPaymentMode = (targetDebtId?: string) => {
    setType('expense');
    setCategory('Cicilan / Pelunasan Utang');
    setHasManuallySelectedCategory(true);

    const liquidAccs = accounts.filter((a) => a.type !== 'credit-card' && a.type !== 'paylater');
    const currentAcc = accounts.find((a) => a.id === accountId);
    if (!currentAcc || currentAcc.type === 'credit-card' || currentAcc.type === 'paylater') {
      const preferred =
        liquidAccs.find((a) => a.type === 'bank' && a.currentBalance > 0) ||
        liquidAccs.find((a) => a.currentBalance > 0) ||
        liquidAccs[0];
      if (preferred) {
        setAccountId(preferred.id);
      }
    }

    if (targetDebtId && targetDebtId !== '__choose__') {
      setLinkedDebtId(targetDebtId);
      const matched = allDebts.find((d) => d.id === targetDebtId && d.balance > 0);
      if (matched) {
        const defaultAmt =
          matched.minPayment > 0 ? Math.min(matched.minPayment, matched.balance) : matched.balance;
        const roundedAmt = Math.round(defaultAmt);
        setAmount(String(roundedAmt));
        const hasRate = !matched.isAccount && (matched.interestRate || 0) > 0;
        setSplitPrincipalInterest(hasRate);
        setInterestPortion(String(estimateMonthlyDebtInterest(matched, roundedAmt)));
        const isKpr = matched.category === 'KPR / Properti' || Boolean((matched as Debt).kprScheme);
        if (isKpr) {
          setCategory(kprCoaMapping.principalPaymentCategory || 'Cicilan KPR');
        }
        setDescription(
          isKpr ? `Pembayaran Cicilan KPR: ${matched.name}` : `Pembayaran Cicilan Hutang: ${matched.name}`
        );
      }
    }
  };

  // Pre-fill Jurnal Transaksi form when navigated from DebtTab
  React.useEffect(() => {
    if (!preselectedPayDebtId) return;
    activateDebtPaymentMode(preselectedPayDebtId);
    onClearPreselectedPayDebt?.();
    setTimeout(() => {
      document.getElementById('tx-input-form-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }, [preselectedPayDebtId]);

  const [newDebtName, setNewDebtName] = useState<string>('');
  const [newDebtInterestRate, setNewDebtInterestRate] = useState<string>('');
  const [newDebtMinPayment, setNewDebtMinPayment] = useState<string>('');
  const [newDebtPurpose, setNewDebtPurpose] = useState<'productive' | 'consumptive'>('consumptive');
  const [newDebtCategory, setNewDebtCategory] = useState<string>('Pinjaman Bank');

  const [newInvestmentName, setNewInvestmentName] = useState<string>('');
  const [newInvestmentCategory, setNewInvestmentCategory] = useState<string>('Saham');
  const [linkedInvestmentId, setLinkedInvestmentId] = useState<string>('');

  // Investment Unit Calculation Form States
  const [invUnitPrice, setInvUnitPrice] = useState<string>('');
  const [invQuantity, setInvQuantity] = useState<string>('');
  const [invUnitName, setInvUnitName] = useState<string>('Lot');
  const [stockValidationError, setStockValidationError] = useState<string | null>(null);

  const getDefaultUnitForCategory = (cat: string) => {
    switch (cat) {
      case 'Saham':
      case 'Investasi Saham':
        return 'Lot';
      case 'Logam Mulia (Emas)':
        return 'Gram';
      case 'Reksadana':
        return 'Unit';
      case 'Cryptocurrency':
        return 'Koin';
      case 'Bisnis Riil':
        return 'Paket';
      default:
        return 'Unit';
    }
  };

  // Sync unit defaults when investment category changes
  React.useEffect(() => {
    if (type === 'investment' || category === 'Beli Investasi Baru' || category === 'Penjualan Investasi') {
      const cat = newInvestmentCategory || category;
      const defUnit = getDefaultUnitForCategory(cat);
      setInvUnitName(defUnit);
    }
  }, [type, category, newInvestmentCategory]);

  // Sync unit price if an existing investment asset is selected
  React.useEffect(() => {
    if (linkedInvestmentId) {
      const asset = investments.find(inv => inv.id === linkedInvestmentId);
      if (asset) {
        if (asset.unitPrice || asset.currentUnitPrice) {
          setInvUnitPrice((asset.unitPrice || asset.currentUnitPrice || 0).toString());
        }
        if (asset.unitName) {
          setInvUnitName(asset.unitName);
        }
      }
    }
  }, [linkedInvestmentId, investments]);

  // Handle unit price or quantity change and calculate total nominal amount
  const handleUnitPriceOrQtyChange = (newPriceStr: string, newQtyStr: string, unitNameStr: string) => {
    setInvUnitPrice(newPriceStr);
    setInvQuantity(newQtyStr);
    setInvUnitName(unitNameStr);
    setStockValidationError(null);

    const p = parseFloat(newPriceStr);
    const q = parseFloat(newQtyStr);
    if (!isNaN(p) && p > 0 && !isNaN(q) && q > 0) {
      const multiplier = unitNameStr === 'Lot' ? 100 : 1;
      const calculatedTotal = p * q * multiplier;
      setAmount(calculatedTotal.toString());
    }
  };

  // Handle total amount change and sync missing unit price or quantity
  const handleAmountChangeWithUnitSync = (newAmountVal: string) => {
    setAmount(newAmountVal);
    const tot = parseFloat(newAmountVal);
    const p = parseFloat(invUnitPrice);
    const q = parseFloat(invQuantity);
    const multiplier = invUnitName === 'Lot' ? 100 : 1;

    if (!isNaN(tot) && tot > 0) {
      if (!isNaN(q) && q > 0 && (isNaN(p) || p <= 0)) {
        const calcP = tot / (q * multiplier);
        setInvUnitPrice(calcP.toString());
      } else if (!isNaN(p) && p > 0 && (isNaN(q) || q <= 0)) {
        const calcQ = tot / (p * multiplier);
        setInvQuantity(calcQ % 1 === 0 ? calcQ.toString() : calcQ.toFixed(2));
      }
    }
  };

  // Transfer Form States
  const [transferAmount, setTransferAmount] = useState<string>('');
  const [fromAccount, setFromAccount] = useState<string>('');
  const [toAccount, setToAccount] = useState<string>('');
  const [transferDesc, setTransferDesc] = useState<string>('');

  // Filters (Multi-Criteria)
  const [filterType, setFilterType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [filterMinAmount, setFilterMinAmount] = useState<string>('');
  const [filterMaxAmount, setFilterMaxAmount] = useState<string>('');
  const [filterAccountId, setFilterAccountId] = useState<string>('all');
  const [showMultiCategoryPanel, setShowMultiCategoryPanel] = useState<boolean>(false);

  // Toast Notifications State & Handler
  interface Toast {
    id: string;
    message: string;
    type: 'warning' | 'info' | 'success';
    title?: string;
    category?: string;
    limit?: number;
    spent?: number;
    over?: number;
  }
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Track newly added transactions for CSS highlight animation & action feedback banner
  const [newlyAddedTxIds, setNewlyAddedTxIds] = useState<Set<string>>(new Set());
  const [actionBanner, setActionBanner] = useState<{ id: string; type: 'add' | 'delete'; message: string } | null>(null);
  const prevTxIdsRef = React.useRef<Set<string>>(new Set(transactions.map((t) => t.id)));

  React.useEffect(() => {
    const currentTxIds = new Set(transactions.map((t) => t.id));
    const addedIds = transactions
      .filter((t) => !prevTxIdsRef.current.has(t.id))
      .map((t) => t.id);

    if (addedIds.length > 0) {
      setNewlyAddedTxIds((prev) => {
        const next = new Set(prev);
        addedIds.forEach((id) => next.add(id));
        return next;
      });

      const newlyAddedTx = transactions.find((t) => t.id === addedIds[0]);
      if (newlyAddedTx) {
        setActionBanner({
          id: Date.now().toString(),
          type: 'add',
          message: `Transaksi baru "${newlyAddedTx.description || newlyAddedTx.category}" (Rp ${Math.abs(newlyAddedTx.amount).toLocaleString('id-ID')}) berhasil ditambahkan!`,
        });
        setTimeout(() => setActionBanner(null), 3500);
      }

      const timer = setTimeout(() => {
        setNewlyAddedTxIds((prev) => {
          const next = new Set(prev);
          addedIds.forEach((id) => next.delete(id));
          return next;
        });
      }, 3200);

      prevTxIdsRef.current = currentTxIds;
      return () => clearTimeout(timer);
    }
    prevTxIdsRef.current = currentTxIds;
  }, [transactions]);

  const handleDeleteTx = (tx: Transaction) => {
    onDeleteTransaction(tx.id);
    setActionBanner({
      id: Date.now().toString(),
      type: 'delete',
      message: `Transaksi "${tx.description || tx.category}" (Rp ${Math.abs(tx.amount).toLocaleString('id-ID')}) telah dihapus.`,
    });
    setTimeout(() => setActionBanner(null), 3500);
  };

  const addToast = (toast: Omit<Toast, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 6500);
  };

  const formatterIDR = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  });

  // Live budget remaining calculation
  const getLiveBudgetWarning = () => {
    if (type !== 'expense' || !amount || parseFloat(amount) <= 0) return null;
    const parsedAmount = parseFloat(amount);
    const txMonth = date.substring(0, 7);
    const budgetForCat = budgets.find(
      (b) => b.category.toLowerCase() === category.toLowerCase() && b.type === 'expense'
    );
    if (!budgetForCat) return null;

    const alreadySpent = transactions
      .filter(
        (tx) =>
          tx.type === 'expense' &&
          tx.category.toLowerCase() === category.toLowerCase() &&
          tx.date.startsWith(txMonth)
      )
      .reduce((sum, tx) => sum + normalizeAbsAmount(tx.amount), 0);

    const limit = budgetForCat.limit;
    const sisa = limit - alreadySpent;
    const totalProposed = alreadySpent + parsedAmount;

    if (totalProposed > limit) {
      return {
        limit,
        alreadySpent,
        sisa,
        exceeded: totalProposed - limit,
      };
    }
    return null;
  };

  const liveWarning = getLiveBudgetWarning();

  const handleAddTxSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = normalizeAbsAmount(parseFloat(amount));
    if (!accountId || !category || !parsedAmount || parsedAmount <= 0) {
      showToast({
        type: 'warning',
        title: 'Data Transaksi Belum Lengkap',
        message: 'Mohon pilih akun, kategori, dan masukkan nominal transaksi (> Rp 0) dengan benar.',
        duration: 4500,
      });
      return;
    }

    // Capture special fields
    const isDebtPay = isDebtPayMode;
    const isDebtCreate = category === 'Penerimaan Utang Baru';
    const isInvBuy = (type as string) === 'investment' || category === 'Beli Investasi Baru';
    const isInvSell = category === 'Penjualan Investasi';
    const isInvestmentContext = isInvBuy || isInvSell || (type as string) === 'investment' || linkedInvestmentId !== '';

    // Strict validation for unified Debt & KPR installment payment / payoff
    if (isDebtPay) {
      if (!linkedDebtId) {
        showToast({
          type: 'warning',
          title: 'Pilih Hutang atau KPR Target',
          message: 'Silakan pilih kewajiban hutang atau KPR yang akan dibayar / dilunasi.',
          duration: 4500,
        });
        return;
      }

      const targetDebt = allDebts.find((d) => d.id === linkedDebtId);
      if (!targetDebt) {
        showToast({
          type: 'error',
          title: 'Target Hutang Tidak Ditemukan',
          message: 'Data hutang atau KPR yang dipilih tidak tersedia.',
          duration: 5000,
        });
        return;
      }

      if (linkedDebtId === `acc-debt-${accountId}`) {
        showToast({
          type: 'warning',
          title: 'Rekening Pembayar Tidak Valid',
          message: 'Gunakan rekening kas/bank lain untuk membayar tagihan kartu kredit/paylater ini.',
          duration: 5000,
        });
        return;
      }

      const sourceAcc = accounts.find((a) => a.id === accountId);
      if (!sourceAcc || sourceAcc.currentBalance < parsedAmount) {
        showToast({
          type: 'error',
          title: 'Dana Tidak Mencukupi',
          message: `Saldo ${sourceAcc ? sourceAcc.name : 'rekening'} (${formatterIDR.format(sourceAcc?.currentBalance || 0)}) tidak cukup untuk membayar cicilan sebesar ${formatterIDR.format(parsedAmount)}.`,
          duration: 6000,
        });
        return;
      }

      const activeDebtTarget = targetDebt;
      const isLoanBreakdownActive =
        !activeDebtTarget.isAccount &&
        splitPrincipalInterest &&
        (activeDebtTarget.interestRate || 0) > 0;
      const rawInt = isLoanBreakdownActive ? Math.max(0, parseFloat(interestPortion) || 0) : 0;
      const cappedInt = Math.min(parsedAmount, rawInt);
      const effectivePrincipalPay = isLoanBreakdownActive
        ? Math.max(0, parsedAmount - cappedInt)
        : parsedAmount;

      if (effectivePrincipalPay > activeDebtTarget.balance) {
        showToast({
          type: 'warning',
          title: 'Pokok Melebihi Sisa Hutang',
          message: `Porsi pokok pembayaran (${formatterIDR.format(effectivePrincipalPay)}) melebihi sisa pokok "${activeDebtTarget.name}" (${formatterIDR.format(activeDebtTarget.balance)}).`,
          duration: 5000,
        });
        return;
      }
    }

    if (type === 'expense' && !isDebtPay) {
      const txMonth = date.substring(0, 7);
      const budgetForCat = budgets.find(
        (b) => b.category.toLowerCase() === category.toLowerCase() && b.type === 'expense'
      );
      if (budgetForCat) {
        const alreadySpent = transactions
          .filter(
            (tx) =>
              tx.type === 'expense' &&
              tx.category.toLowerCase() === category.toLowerCase() &&
              tx.date.startsWith(txMonth)
          )
          .reduce((sum, tx) => sum + normalizeAbsAmount(tx.amount), 0);
        
        const limit = budgetForCat.limit;
        const totalProposed = alreadySpent + parsedAmount;
        if (totalProposed > limit) {
          const exceeded = totalProposed - limit;
          // Trigger the toast notification
          addToast({
            type: 'warning',
            title: 'Melebihi Anggaran Bulanan!',
            message: `Transaksi pengeluaran sebesar ${formatterIDR.format(parsedAmount)} pada kategori "${category}" telah melebihi sisa anggaran bulanan Anda.`,
            category,
            limit,
            spent: alreadySpent,
            over: exceeded,
          });
        }
      }
    }

    const parsedUnitPrice = parseFloat(invUnitPrice);
    const parsedQty = parseFloat(invQuantity);

    // Validation for Stock minimum lot rule (1 Lot = 100 lembar)
    const isStockCategory = category === 'Saham' || category === 'Investasi Saham' || newInvestmentCategory === 'Saham';
    if (isStockCategory && isInvBuy) {
      if (invUnitName === 'Lot' && (isNaN(parsedQty) || parsedQty < 1)) {
        setStockValidationError("⚠️ Transaksi Saham wajib minimal 1 Lot (100 lembar saham). Silakan masukkan kuantitas minimal 1 Lot.");
        return;
      }
      if (invUnitName === 'Lembar' && (isNaN(parsedQty) || parsedQty < 100)) {
        setStockValidationError("⚠️ Transaksi Saham wajib minimal 100 lembar (1 Lot). Silakan masukkan kuantitas minimal 100 lembar.");
        return;
      }
    }
    setStockValidationError(null);

    const effectiveUnits = !isNaN(parsedQty) && parsedQty > 0
      ? (invUnitName === 'Lot' ? parsedQty * 100 : parsedQty)
      : undefined;
    const effectiveUnitPrice = !isNaN(parsedUnitPrice) && parsedUnitPrice > 0
      ? parsedUnitPrice
      : (effectiveUnits && parsedAmount > 0 ? parsedAmount / effectiveUnits : undefined);
    const effectiveUnitName = invUnitName === 'Lot' ? 'Lembar' : invUnitName;

    let resolvedCoaDebitCode: string | undefined;
    let resolvedCoaCreditCode: string | undefined;
    const sourceAccObj = accounts.find((a) => a.id === accountId);
    const sourceAccCoa = sourceAccObj ? getAccountCoaMapping(sourceAccObj, storedCoaList) : { code: '1200', name: 'Rekening Bank' };

    if (isDebtPay && linkedDebtId) {
      const targetDebt = allDebts.find((d) => d.id === linkedDebtId);
      const isKprDebt = Boolean(
        targetDebt && (targetDebt.category === 'KPR / Properti' || Boolean((targetDebt as Debt).kprScheme))
      );
      if (isKprDebt && targetDebt) {
        const effKprCoa = resolveEffectiveKprCoaMapping(kprCoaMapping, (targetDebt as Debt).kprCoaSnapshot);
        resolvedCoaDebitCode = effKprCoa.principalLiabilityCode;
        resolvedCoaCreditCode = sourceAccCoa.code;
      }
    }

    if (!resolvedCoaDebitCode || !resolvedCoaCreditCode) {
      const autoCoa = resolveTransactionCoaCodes({ type, category, accountId }, accounts, storedCoaList, kprCoaMapping);
      if (autoCoa.isKprRelated) {
        resolvedCoaDebitCode = autoCoa.debitCode;
        resolvedCoaCreditCode = autoCoa.creditCode;
      }
    }

    let resolvedKprBreakdown: Transaction['linkedKprBreakdown'] | undefined;
    if (isDebtPay && linkedDebtId) {
      const targetDebt = allDebts.find((d) => d.id === linkedDebtId);
      if (targetDebt && !targetDebt.isAccount) {
        const splitInfo = calculateKprInstallmentBreakdown({
          debt: targetDebt as Debt,
          paymentAmount: parsedAmount,
          paymentDate: date,
          baseCoaMapping: kprCoaMapping,
          creditAccountCoaCode: sourceAccCoa.code,
        });
        if (splitPrincipalInterest && (targetDebt.interestRate || 0) > 0) {
          const interestAmt = Math.min(parsedAmount, Math.max(0, parseFloat(interestPortion) || 0));
          const principalAmt = Math.max(0, parsedAmount - interestAmt);
          resolvedKprBreakdown = {
            principalPart: principalAmt,
            interestPart: interestAmt,
            principalCoaCode: splitInfo.principalDebitCode,
            interestCoaCode: splitInfo.interestExpenseCode,
            interestCategory: splitInfo.interestExpenseCategory,
          };
        } else if (splitInfo.isKpr || (targetDebt.interestRate || 0) > 0) {
          resolvedKprBreakdown = {
            principalPart: parsedAmount,
            interestPart: 0,
            principalCoaCode: splitInfo.principalDebitCode,
            interestCoaCode: splitInfo.interestExpenseCode,
            interestCategory: splitInfo.interestExpenseCategory,
          };
        }
      }
    }

    const didSave = onAddTransaction({
      date,
      accountId,
      type,
      category,
      description: description || category,
      amount: parsedAmount,
      coaDebitCode: resolvedCoaDebitCode,
      coaCreditCode: resolvedCoaCreditCode,
      linkedKprBreakdown: resolvedKprBreakdown,
      unitPrice: isInvestmentContext ? effectiveUnitPrice : undefined,
      units: isInvestmentContext ? effectiveUnits : undefined,
      unitName: isInvestmentContext ? effectiveUnitName : undefined,
      linkedDebtId: isDebtPay ? linkedDebtId : undefined,
      linkedDebtAction: isDebtPay ? 'pay' : (isDebtCreate ? 'create' : undefined),
      linkedInvestmentId: isInvSell ? linkedInvestmentId : undefined,
      linkedInvestmentAction: isInvBuy ? 'buy' : (isInvSell ? 'sell' : undefined),
      newDebtDetails: isDebtCreate ? {
        name: newDebtName || description || "Hutang Baru",
        interestRate: parseFloat(newDebtInterestRate) || 12,
        minPayment: parseFloat(newDebtMinPayment) || (parsedAmount * 0.05),
        purpose: newDebtPurpose,
        category: newDebtCategory,
      } : undefined,
      newInvestmentDetails: isInvBuy ? {
        name: newInvestmentName || description || "Aset Investasi",
        category: newInvestmentCategory,
        unitPrice: effectiveUnitPrice,
        units: effectiveUnits,
        unitName: effectiveUnitName,
      } : undefined,
    });

    if (didSave === false) return;

    // Reset form
    setDescription('');
    setAmount('');
    setHasManuallySelectedCategory(false);
    setNewDebtName('');
    setNewDebtMinPayment('');
    setNewInvestmentName('');
    setLinkedDebtId('');
    setLinkedInvestmentId('');
    setInvUnitPrice('');
    setInvQuantity('');
  };

  const handleTransferSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = normalizeAbsAmount(parseFloat(transferAmount));
    if (!fromAccount || !toAccount || !parsedAmount || parsedAmount <= 0) {
      showToast({
        type: 'warning',
        title: 'Data Mutasi Belum Lengkap',
        message: 'Mohon lengkapi rekening asal, tujuan, dan nominal transfer yang valid.',
      });
      return;
    }
    if (fromAccount === toAccount) {
      showToast({
        type: 'warning',
        title: 'Rekening Sama',
        message: 'Rekening asal dan rekening tujuan transfer tidak boleh sama.',
      });
      return;
    }

    // Check balance
    const sourceAcc = accounts.find(a => a.id === fromAccount);
    if (sourceAcc && sourceAcc.currentBalance < parsedAmount) {
      showToast({
        type: 'error',
        title: 'Saldo Tidak Mencukupi',
        message: `Saldo ${sourceAcc.name} (${formatterIDR.format(sourceAcc.currentBalance)}) tidak mencukupi untuk transfer.`,
      });
      return;
    }

    onTransferFunds(parsedAmount, fromAccount, toAccount, transferDesc || 'Transfer Antar Rekening');
    // Reset form
    setTransferAmount('');
    setTransferDesc('');
  };

  // Recurring Transaction Form State
  const [showRecModal, setShowRecModal] = useState<boolean>(false);
  const [recTitle, setRecTitle] = useState<string>('');
  const [recType, setRecType] = useState<TransactionType>('expense');
  const [recCategory, setRecCategory] = useState<string>('Utilitas & Tagihan');
  const [recAmount, setRecAmount] = useState<string>('');
  const [recAccountId, setRecAccountId] = useState<string>(accounts[0]?.id || '');
  const [recDayOfMonth, setRecDayOfMonth] = useState<number>(1);
  const [recDescription, setRecDescription] = useState<string>('');
  const [editingRecId, setEditingRecId] = useState<string | null>(null);
  const [deleteRecurringConfirm, setDeleteRecurringConfirm] = useState<{ id: string; title: string } | null>(null);

  const handleOpenAddRecModal = () => {
    setEditingRecId(null);
    setRecTitle('');
    setRecType('expense');
    setRecCategory('Utilitas & Tagihan');
    setRecAmount('');
    setRecAccountId(accounts[0]?.id || '');
    setRecDayOfMonth(1);
    setRecDescription('');
    setShowRecModal(true);
  };

  const handleEditRec = (rec: RecurringTransaction) => {
    setEditingRecId(rec.id);
    setRecTitle(rec.title);
    setRecType(rec.type);
    setRecCategory(rec.category);
    setRecAmount(rec.amount.toString());
    setRecAccountId(rec.accountId);
    setRecDayOfMonth(rec.dayOfMonth);
    setRecDescription(rec.description || '');
    setShowRecModal(true);
  };

  const handleSaveRecSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(recAmount);
    if (!recTitle.trim() || isNaN(parsedAmount) || parsedAmount <= 0) {
      showToast({
        type: 'warning',
        title: 'Input Tidak Lengkap',
        message: 'Mohon lengkapi judul dan nominal transaksi rutin yang valid.',
      });
      return;
    }

    if (editingRecId && onUpdateRecurringTransaction) {
      onUpdateRecurringTransaction({
        id: editingRecId,
        title: recTitle.trim(),
        type: recType,
        category: recCategory,
        amount: parsedAmount,
        accountId: recAccountId || accounts[0]?.id || '',
        frequency: 'monthly',
        dayOfMonth: recDayOfMonth,
        isActive: true,
        description: recDescription.trim(),
      });
    } else if (onAddRecurringTransaction) {
      onAddRecurringTransaction({
        title: recTitle.trim(),
        type: recType,
        category: recCategory,
        amount: parsedAmount,
        accountId: recAccountId || accounts[0]?.id || '',
        frequency: 'monthly',
        dayOfMonth: recDayOfMonth,
        isActive: true,
        description: recDescription.trim(),
      });
    }

    setShowRecModal(false);
  };

  // Get categories based on selected transaction type dynamically from Master COA and Master Categories
  const getCategoriesByType = (t: TransactionType) => {
    const defaults: Record<TransactionType, string[]> = {
      income: ['Gaji Utama', 'Sampingan', 'Penerimaan Utang Baru', 'Penjualan Investasi', 'Pencairan Dana Darurat', 'Hadiah', 'Lainnya'],
      saving: ['Tabungan Darurat', 'Tabungan Haji/Nikah', 'Rencana Liburan', 'Tabungan Berjangka'],
      investment: ['Beli Investasi Baru', 'Investasi Saham', 'Reksadana', 'Logam Mulia (Emas)', 'Cryptocurrency', 'Bisnis Riil'],
      expense: ['Cicilan / Pelunasan Utang', 'Makanan', 'Transportasi', 'Hiburan', 'Utilitas & Tagihan', 'Belanja Bulanan', 'Pendidikan', 'Kesehatan', 'Lainnya'],
    };

    const categorySet = new Set<string>();

    // Add Master COA items corresponding to transaction type first
    const coaTypeMap: Record<TransactionType, string> = {
      income: 'Income',
      expense: 'Expense',
      saving: 'Asset',
      investment: 'Asset',
    };
    const targetCoaCat = coaTypeMap[t];
    storedCoaList
      .filter((c) => c.category === targetCoaCat)
      .forEach((c) => categorySet.add(c.name));

    // Add defaults
    (defaults[t] || defaults.expense).forEach((cat) => categorySet.add(cat));

    // Add master categories hierarchy
    if (masterCategories && masterCategories.length > 0) {
      const flat = flattenCategoryHierarchy(masterCategories);
      flat.forEach(node => {
        if (node.type !== 'type') {
          const pathStr = node.path;
          if (t === 'income' && (pathStr.includes('Pendapatan') || pathStr.includes('Penerimaan') || node.transactionType === 'income')) {
            categorySet.add(node.name);
          } else if (t === 'expense' && (pathStr.includes('Pengeluaran') || pathStr.includes('Beban') || node.transactionType === 'expense')) {
            categorySet.add(node.name);
          } else if (t === 'saving' && (pathStr.includes('Tabungan') || node.transactionType === 'saving')) {
            categorySet.add(node.name);
          } else if (t === 'investment' && (pathStr.includes('Investasi') || node.transactionType === 'investment')) {
            categorySet.add(node.name);
          } else if (node.type === 'item') {
            categorySet.add(node.name);
          }
        }
      });
    }

    // Sort categories prioritizing most frequently used in transaction history
    const typeCounts: Record<string, number> = {};
    transactions.forEach((tx) => {
      if (tx.type === t && tx.category) {
        typeCounts[tx.category] = (typeCounts[tx.category] || 0) + 1;
      }
    });

    return Array.from(categorySet).sort((a, b) => {
      const countA = typeCounts[a] || 0;
      const countB = typeCounts[b] || 0;
      if (countB !== countA) return countB - countA;
      return a.localeCompare(b);
    });
  };

  const groupedCategories = React.useMemo(() => {
    const expenseSet = new Set<string>([
      'Makanan', 'Transportasi', 'Hiburan', 'Utilitas & Tagihan', 'Belanja Bulanan', 
      'Pendidikan', 'Kesehatan', 'Cicilan / Pelunasan Utang', 'Lainnya'
    ]);
    const incomeSet = new Set<string>([
      'Gaji Utama', 'Sampingan', 'Penerimaan Utang Baru', 'Penjualan Investasi', 
      'Pencairan Dana Darurat', 'Hadiah', 'Lainnya'
    ]);
    const savingSet = new Set<string>([
      'Tabungan Darurat', 'Tabungan Haji/Nikah', 'Rencana Liburan', 'Tabungan Berjangka'
    ]);
    const investmentSet = new Set<string>([
      'Beli Investasi Baru', 'Investasi Saham', 'Reksadana', 'Logam Mulia (Emas)', 'Cryptocurrency', 'Bisnis Riil'
    ]);

    if (masterCategories && masterCategories.length > 0) {
      const flat = flattenCategoryHierarchy(masterCategories);
      flat.forEach(node => {
        if (node.type !== 'type') {
          const pathStr = node.path;
          if (node.transactionType === 'saving' || pathStr.includes('Tabungan')) savingSet.add(node.name);
          else if (node.transactionType === 'investment' || pathStr.includes('Portofolio Investasi')) investmentSet.add(node.name);
          else if (pathStr.includes('Pendapatan') || node.transactionType === 'income') incomeSet.add(node.name);
          else if (pathStr.includes('Pengeluaran') || node.transactionType === 'expense') expenseSet.add(node.name);
          else if (node.transactionType === 'asset' || node.transactionType === 'liability' || node.transactionType === 'equity') {
            // Balance sheet allocation / debt principal nodes stay out of operating expenseSet unless explicitly typed
          } else if (node.type === 'item') {
            expenseSet.add(node.name);
          }
        }
      });
    }

    transactions.forEach(tx => {
      if (!tx.category) return;
      if (tx.type === 'expense') expenseSet.add(tx.category);
      else if (tx.type === 'income') incomeSet.add(tx.category);
      else if (tx.type === 'saving') savingSet.add(tx.category);
      else if (tx.type === 'investment') investmentSet.add(tx.category);
      else expenseSet.add(tx.category);
    });

    budgets.forEach(b => {
      if (b.category) {
        if (b.type === 'expense') expenseSet.add(b.category);
        else incomeSet.add(b.category);
      }
    });

    return {
      expense: Array.from(expenseSet).sort(),
      income: Array.from(incomeSet).sort(),
      saving: Array.from(savingSet).sort(),
      investment: Array.from(investmentSet).sort(),
    };
  }, [transactions, budgets, masterCategories]);

  const allCategories = React.useMemo(() => {
    const cats = new Set<string>();
    const defaultCats = [
      'Makanan', 'Transportasi', 'Hiburan', 'Utilitas & Tagihan', 'Belanja Bulanan', 
      'Pendidikan', 'Kesehatan', 'Cicilan / Pelunasan Utang', 'Gaji Utama', 'Sampingan', 
      'Penerimaan Utang Baru', 'Penjualan Investasi', 'Tabungan Darurat', 'Beli Investasi Baru'
    ];
    defaultCats.forEach(c => cats.add(c));

    if (masterCategories && masterCategories.length > 0) {
      const flat = flattenCategoryHierarchy(masterCategories);
      flat.forEach(node => {
        if (node.type !== 'type') {
          cats.add(node.name);
        }
      });
    }

    transactions.forEach(tx => {
      if (tx.category) cats.add(tx.category);
    });
    budgets.forEach(b => {
      if (b.category) cats.add(b.category);
    });
    return Array.from(cats).sort();
  }, [transactions, budgets, masterCategories]);

  // Helper functions for Multi-Category & Multi-Criteria filtering
  const toggleCategorySelection = (cat: string) => {
    setSelectedCategories(prev => {
      if (prev.includes(cat)) {
        return prev.filter(c => c !== cat);
      } else {
        return [...prev, cat];
      }
    });
    if (filterCategory !== 'all') {
      setFilterCategory('all');
    }
  };

  const toggleSelectAllCategoryGroup = (groupCats: string[]) => {
    setSelectedCategories(prev => {
      const allIncluded = groupCats.every(c => prev.includes(c));
      if (allIncluded) {
        // Deselect group
        return prev.filter(c => !groupCats.includes(c));
      } else {
        // Select all in group
        const set = new Set([...prev, ...groupCats]);
        return Array.from(set);
      }
    });
    if (filterCategory !== 'all') {
      setFilterCategory('all');
    }
  };

  const hasActiveFilters = Boolean(
    filterType !== 'all' ||
    searchQuery.trim() !== '' ||
    filterStartDate !== '' ||
    filterEndDate !== '' ||
    filterCategory !== 'all' ||
    selectedCategories.length > 0 ||
    filterMinAmount !== '' ||
    filterMaxAmount !== '' ||
    filterAccountId !== 'all'
  );

  const handleResetAllFilters = () => {
    setFilterType('all');
    setSearchQuery('');
    setFilterStartDate('');
    setFilterEndDate('');
    setFilterCategory('all');
    setSelectedCategories([]);
    setFilterMinAmount('');
    setFilterMaxAmount('');
    setFilterAccountId('all');
  };

  const filteredTransactions = transactions.filter(tx => {
    const matchesType = filterType === 'all' || tx.type === filterType;
    const query = searchQuery.trim().toLowerCase();
    const acc = accounts.find(a => a.id === tx.accountId);
    const accName = tx.isAdjustment ? 'jurnal penyesuaian non-kas' : (acc ? acc.name.toLowerCase() : '');

    const matchesSearch = !query || 
      tx.description.toLowerCase().includes(query) || 
      tx.category.toLowerCase().includes(query) ||
      accName.includes(query) ||
      tx.amount.toString().includes(query) ||
      tx.date.includes(query);
    
    // Custom date range filter
    let matchesStartDate = true;
    if (filterStartDate) {
      matchesStartDate = tx.date >= filterStartDate;
    }
    let matchesEndDate = true;
    if (filterEndDate) {
      matchesEndDate = tx.date <= filterEndDate;
    }

    // Min & Max Amount Range filter
    let matchesMinAmount = true;
    const minAmt = parseFloat(filterMinAmount);
    if (!isNaN(minAmt) && minAmt >= 0) {
      matchesMinAmount = tx.amount >= minAmt;
    }
    let matchesMaxAmount = true;
    const maxAmt = parseFloat(filterMaxAmount);
    if (!isNaN(maxAmt) && maxAmt >= 0) {
      matchesMaxAmount = tx.amount <= maxAmt;
    }
    
    // Multi-category & single category filter
    let matchesCategory = true;
    if (selectedCategories.length > 0) {
      matchesCategory = selectedCategories.includes(tx.category);
    } else if (filterCategory !== 'all') {
      matchesCategory = tx.category === filterCategory;
    }
    
    // Account filter
    const matchesAccount = filterAccountId === 'all' || tx.accountId === filterAccountId;
    
    return matchesType && matchesSearch && matchesStartDate && matchesEndDate && matchesMinAmount && matchesMaxAmount && matchesCategory && matchesAccount;
  });

  const filteredIncomeTotal = filteredTransactions
    .filter(tx => !tx.isAdjustment && tx.type === 'income')
    .reduce((sum, tx) => sum + Math.abs(tx.amount || 0), 0);

  const filteredExpenseTotal = filteredTransactions
    .filter(tx => !tx.isAdjustment && tx.type === 'expense')
    .reduce((sum, tx) => sum + Math.abs(tx.amount || 0), 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Forms Column (Forms to Add Tx & Perform Mutasi) */}
      <div className="space-y-6 lg:col-span-1">
        
        {/* Input Transaksi Baru */}
        <div id="tx-input-form-card" className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
              <PlusCircle className="h-5 w-5 text-blue-600" />
              <h3 className="font-semibold text-slate-800 text-sm uppercase tracking-wider">Input Transaksi</h3>
            </div>
            {allDebts.filter((d) => d.balance > 0).length > 0 && (
              <button
                type="button"
                onClick={() => activateDebtPaymentMode()}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1 transition cursor-pointer border ${
                  isDebtPayMode
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                    : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                }`}
              >
                <Wallet className="h-3 w-3" />
                Bayar Hutang / KPR
              </button>
            )}
          </div>

          {/* AI Natural Language Input Section */}
          <div className="mb-5 p-3.5 bg-gradient-to-br from-indigo-900 via-slate-900 to-blue-950 rounded-xl text-white shadow-md border border-indigo-700/50 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-blue-400 animate-pulse" />
                <span className="text-xs font-black tracking-tight text-white">Input Bahasa Alami (Gemini AI)</span>
              </div>
              <span className="text-[9px] bg-blue-500/20 text-blue-300 font-extrabold px-2 py-0.5 rounded-full border border-blue-400/30 uppercase tracking-wider">
                Otomatis
              </span>
            </div>
            
            <p className="text-[11px] text-slate-300 leading-snug">
              Ketik transaksi dalam bahasa biasa (misal: <em className="text-blue-200">"Beli kopi starbucks 45rb pakai OVO"</em> atau <em className="text-blue-200">"Gaji 12 juta masuk Mandiri"</em>) lalu AI Gemini akan otomatis mengkategorikan & mengisi jumlahnya!
            </p>

            <form onSubmit={handleParseNaturalLanguageTx} className="space-y-2">
              <div className="relative">
                <input
                  type="text"
                  value={naturalLanguageInput}
                  onChange={(e) => setNaturalLanguageInput(e.target.value)}
                  placeholder="Contoh: Makan siang bakso 35 ribu tunai kemarin..."
                  className="w-full bg-slate-950/80 border border-slate-700 rounded-lg pl-3 pr-24 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
                />
                <button
                  type="submit"
                  disabled={isParsingNaturalTx || !naturalLanguageInput.trim()}
                  className="absolute right-1 top-1 bottom-1 px-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-md text-[11px] font-extrabold transition flex items-center gap-1 cursor-pointer"
                >
                  {isParsingNaturalTx ? (
                    <RefreshCw className="h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                  <span>{isParsingNaturalTx ? 'Analisis...' : 'Isi Form'}</span>
                </button>
              </div>
            </form>

            {naturalTxParseNotice && (
              <div className="p-2.5 bg-blue-950/60 border border-blue-500/40 rounded-lg text-[11px] text-blue-200 flex items-start gap-2 animate-fade-in">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                <p className="leading-snug">{naturalTxParseNotice}</p>
              </div>
            )}
          </div>
          
          <form onSubmit={handleAddTxSubmit} className="space-y-4">
            {/* Tipe Transaksi */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Tipe Transaksi</label>
              <div className="grid grid-cols-4 gap-1 bg-slate-100 p-1 rounded-lg">
                {(['expense', 'income', 'saving', 'investment'] as TransactionType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setType(t);
                      setHasManuallySelectedCategory(false);
                      const typeCounts: Record<string, number> = {};
                      transactions.forEach((tx) => {
                        if (tx.type === t && tx.category) {
                          typeCounts[tx.category] = (typeCounts[tx.category] || 0) + 1;
                        }
                      });
                      const topForType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
                      const cats = getCategoriesByType(t);
                      if (topForType) {
                        setCategory(topForType);
                      } else if (cats.length > 0) {
                        setCategory(cats[0]);
                      }
                    }}
                    className={`text-[10px] py-1.5 rounded-md font-bold uppercase transition ${
                      type === t 
                        ? 'bg-white text-blue-600 shadow-sm' 
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {t === 'expense' ? 'Keluar' : t === 'income' ? 'Masuk' : t === 'saving' ? 'Nabung' : 'Invest'}
                  </button>
                ))}
              </div>
            </div>

            {/* Tanggal */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Tanggal</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700"
                  required
                />
              </div>
            </div>

            {/* Akun Sumber/Penerima */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Akun Keuangan</label>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700"
              >
                {accounts.map(acc => {
                  const isCreditOrPaylater = acc.type === 'credit-card' || acc.type === 'paylater';
                  const label = isCreditOrPaylater ? 'Sisa Limit: ' : 'Saldo: ';
                  return (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({label}{formatterIDR.format(acc.currentBalance)})
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Kategori dengan Autosuggestion Master COA */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">Kategori</label>
                  {isSuggestingCategory && (
                    <span className="flex items-center gap-1 text-[10px] text-blue-600 font-bold bg-blue-50 px-1.5 py-0.5 rounded-full animate-pulse">
                      <Sparkles className="h-3 w-3" />
                      AI Menganalisis...
                    </span>
                  )}
                </div>
                {masterCoaDescriptionSuggestion && (
                  <span className="text-[10px] font-black text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse">
                    <Award className="h-3 w-3 text-blue-600" />
                    Autosuggest Master COA
                  </span>
                )}
              </div>

              <select
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  setHasManuallySelectedCategory(true);
                }}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 font-semibold"
              >
                {getCategoriesByType(type).map((cat) => {
                  const coaMatch = storedCoaList.find(c => c.name.toLowerCase() === cat.toLowerCase());
                  const count = masterCoaCategoryAutosuggestions.find(c => c.categoryName.toLowerCase() === cat.toLowerCase())?.count || 0;
                  const label = coaMatch ? `[COA ${coaMatch.code}] ${cat}${count > 0 ? ` (${count}x)` : ''}` : `${cat}${count > 0 ? ` (${count}x)` : ''}`;
                  return <option key={cat} value={cat}>{label}</option>;
                })}
                {category && !getCategoriesByType(type).includes(category) && (
                  <option key={category} value={category}>{category}</option>
                )}
              </select>

              {/* Master COA Keyword Match Recommendation Banner */}
              {masterCoaDescriptionSuggestion && (
                <div className="mt-2 p-2.5 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 text-blue-900 font-medium min-w-0">
                    <Sparkles className="h-4 w-4 text-blue-600 shrink-0 animate-pulse" />
                    <div className="truncate text-[11px]">
                      <span className="font-extrabold text-blue-800">Autosuggestion COA:</span>{' '}
                      <span className="font-black bg-blue-200/80 px-1.5 py-0.5 rounded text-blue-950 font-mono">
                        [{masterCoaDescriptionSuggestion.coaCode}]
                      </span>{' '}
                      <span className="font-bold">{masterCoaDescriptionSuggestion.category}</span>{' '}
                      <span className="text-[10px] text-blue-600 font-bold">
                        ({masterCoaDescriptionSuggestion.count}x terpakai)
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setCategory(masterCoaDescriptionSuggestion.category);
                      setHasManuallySelectedCategory(true);
                    }}
                    className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-[10px] rounded-lg transition shrink-0 cursor-pointer shadow-xs flex items-center gap-1"
                  >
                    Gunakan COA
                  </button>
                </div>
              )}

              {/* Top Frequent Master COA Categories Quick Chips */}
              {masterCoaCategoryAutosuggestions.length > 0 && (
                <div className="mt-2.5 space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    <span className="flex items-center gap-1 text-slate-600">
                      <Flame className="h-3 w-3 text-amber-500 fill-amber-500" /> Kategori Master COA Terpopuler ({type.toUpperCase()})
                    </span>
                    <span className="text-[9px] text-slate-400 font-normal">Sering Digunakan</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {masterCoaCategoryAutosuggestions.slice(0, 6).map((item) => {
                      const isSelected = category === item.categoryName;
                      return (
                        <button
                          key={`${item.coaCode}-${item.categoryName}`}
                          type="button"
                          onClick={() => {
                            setCategory(item.categoryName);
                            setHasManuallySelectedCategory(true);
                          }}
                          className={`text-[11px] px-2.5 py-1 rounded-lg border font-bold transition flex items-center gap-1.5 cursor-pointer ${
                            isSelected
                              ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700'
                          }`}
                        >
                          {item.isMasterCoa && (
                            <span
                              className={`text-[9px] font-mono font-black px-1 py-0.2 rounded ${
                                isSelected ? 'bg-blue-700 text-blue-100' : 'bg-slate-200 text-slate-700'
                              }`}
                            >
                              {item.coaCode}
                            </span>
                          )}
                          <span>{item.categoryName}</span>
                          <span
                            className={`text-[9px] px-1.5 py-0.2 rounded-full font-extrabold ${
                              isSelected ? 'bg-blue-800 text-blue-100' : 'bg-slate-200 text-slate-600'
                            }`}
                          >
                            {item.count}x
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* --- Kaitan Khusus Modul (Hutang, Investasi, dsb.) --- */}
            
            {/* 1. Pembayaran Cicilan Hutang & KPR (Satu Proses Terpusat) */}
            {isDebtPayMode && (() => {
              const activeDebtsList = allDebts.filter((d) => d.balance > 0);
              const selectedDebtObj = activeDebtsList.find((d) => d.id === linkedDebtId);
              const sourceAccObj = accounts.find((a) => a.id === accountId);
              const parsedPayAmt = Math.abs(parseFloat(amount) || 0);
              const canSplitLoan = Boolean(
                selectedDebtObj && !selectedDebtObj.isAccount && (selectedDebtObj.interestRate || 0) > 0
              );
              const activeInterestAmt =
                canSplitLoan && splitPrincipalInterest
                  ? Math.min(parsedPayAmt, Math.abs(parseFloat(interestPortion) || 0))
                  : 0;
              const effectivePrincipalPay = Math.max(0, parsedPayAmt - activeInterestAmt);
              const isInsufficientSource = Boolean(sourceAccObj && parsedPayAmt > 0 && sourceAccObj.currentBalance < parsedPayAmt);
              const isOverDebtBalance = Boolean(selectedDebtObj && effectivePrincipalPay > selectedDebtObj.balance);
              const isSameCardAccount = Boolean(linkedDebtId && linkedDebtId === `acc-debt-${accountId}`);

              return (
                <div className="bg-emerald-50/70 p-4 rounded-xl border border-emerald-200 space-y-3 animate-slide-in">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase text-emerald-900">
                      <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                      Pembayaran Cicilan Hutang &amp; KPR
                    </div>
                    <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 uppercase">
                      1 Proses Terintegrasi
                    </span>
                  </div>
                  <p className="text-[11px] text-emerald-800/90 leading-snug">
                    Mencatat pengeluaran jurnal, memotong saldo rekening sumber, dan mengurangi sisa pokok hutang/KPR secara bersamaan tanpa duplikasi.
                  </p>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                      Pilih Hutang / KPR yang Dibayar atau Dilunasi
                    </label>
                    {activeDebtsList.length === 0 ? (
                      <div className="text-xs text-rose-600 bg-rose-50 px-3 py-2 rounded-lg border border-rose-100 font-medium">
                        Belum ada catatan utang atau KPR aktif. Silakan tambah utang atau KPR baru melalui menu <strong>Hutang</strong> terlebih dahulu.
                      </div>
                    ) : (
                      <select
                        value={linkedDebtId}
                          onChange={(e) => {
                          const nextId = e.target.value;
                          setLinkedDebtId(nextId);
                          const picked = activeDebtsList.find((d) => d.id === nextId);
                          if (picked) {
                            const suggested =
                              picked.minPayment > 0 ? Math.min(picked.minPayment, picked.balance) : picked.balance;
                            const roundedSuggested = Math.round(suggested);
                            setAmount(String(roundedSuggested));
                            const hasRate = !picked.isAccount && (picked.interestRate || 0) > 0;
                            setSplitPrincipalInterest(hasRate);
                            setInterestPortion(String(estimateMonthlyDebtInterest(picked, roundedSuggested)));
                            const isKpr =
                              picked.category === 'KPR / Properti' || Boolean((picked as Debt).kprScheme);
                            if (isKpr) {
                              setCategory(kprCoaMapping.principalPaymentCategory || 'Cicilan KPR');
                            } else if (category.trim().toLowerCase() === (kprCoaMapping.principalPaymentCategory || 'Cicilan KPR').toLowerCase()) {
                              setCategory('Cicilan / Pelunasan Utang');
                            }
                            setDescription(
                              isKpr
                                ? `Pembayaran Cicilan KPR: ${picked.name}`
                                : `Pembayaran Cicilan Hutang: ${picked.name}`
                            );
                          }
                        }}
                        className="w-full bg-white border border-emerald-300 rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800 font-bold cursor-pointer"
                        required
                      >
                        <option value="">-- Pilih Hutang / KPR / Tagihan --</option>
                        {activeDebtsList.map((d) => {
                          const isKpr = d.category === 'KPR / Properti' || Boolean((d as Debt).kprScheme);
                          return (
                            <option key={d.id} value={d.id}>
                              {isKpr ? '[KPR] ' : ''}{d.name} — Sisa: {formatterIDR.format(d.balance)}
                            </option>
                          );
                        })}
                      </select>
                    )}
                  </div>

                  {selectedDebtObj && (
                    <div className="bg-white rounded-xl border border-emerald-200/80 p-3 space-y-2.5 text-[11px]">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {(selectedDebtObj.category === 'KPR / Properti' || Boolean((selectedDebtObj as Debt).kprScheme)) && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded text-[9px] font-extrabold uppercase shrink-0">
                              <Home className="h-2.5 w-2.5" /> KPR
                            </span>
                          )}
                          <span className="font-extrabold text-slate-800 truncate">{selectedDebtObj.name}</span>
                        </div>
                        <span className="text-[10px] font-bold text-slate-500">
                          Bunga {selectedDebtObj.interestRate}% • Jth Tempo Tgl {selectedDebtObj.dueDay || '-'}
                        </span>
                      </div>

                      {(selectedDebtObj.category === 'KPR / Properti' || Boolean((selectedDebtObj as Debt).kprScheme)) && (() => {
                        const effCoa = resolveEffectiveKprCoaMapping(kprCoaMapping, (selectedDebtObj as Debt).kprCoaSnapshot);
                        const srcCoa = sourceAccObj ? getAccountCoaMapping(sourceAccObj, storedCoaList) : { code: '1200', name: 'Bank' };
                        const schemePreview = calculateKprInstallmentBreakdown({
                          debt: selectedDebtObj as Debt,
                          paymentAmount: parsedPayAmt > 0 ? parsedPayAmt : (selectedDebtObj.minPayment || selectedDebtObj.balance || 0),
                          paymentDate: date,
                          baseCoaMapping: kprCoaMapping,
                          creditAccountCoaCode: srcCoa.code,
                        });
                        return (
                          <div className="text-[10px] font-mono tabular-nums text-indigo-700 bg-indigo-50/70 border border-indigo-100 rounded-lg px-2.5 py-1.5 space-y-0.5">
                            <div>
                              Skema KPR: <strong>{schemePreview.phaseLabel} ({schemePreview.activeAnnualRate}%/thn)</strong> · Bulan ke-{schemePreview.elapsedMonths}
                            </div>
                            <div>
                              COA Pokok: Dr {effCoa.principalLiabilityCode} · COA Bunga L/R: Dr {effCoa.interestExpenseCode} ({effCoa.interestExpenseCategory}) · Cr {srcCoa.code}
                            </div>
                          </div>
                        );
                      })()}

                      <div className="grid grid-cols-2 gap-2 text-[10px]">
                        <div className="bg-slate-50 p-2 rounded-lg">
                          <span className="text-slate-500 block font-semibold">Sisa Pokok Saat Ini</span>
                          <strong className="text-rose-600 font-mono text-xs">
                            {formatterIDR.format(selectedDebtObj.balance)}
                          </strong>
                        </div>
                        <div className="bg-slate-50 p-2 rounded-lg">
                          <span className="text-slate-500 block font-semibold">Cicilan Bulanan</span>
                          <strong className="text-slate-800 font-mono text-xs">
                            {formatterIDR.format(selectedDebtObj.minPayment || 0)}
                          </strong>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {selectedDebtObj.minPayment > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              const cicilan = Math.round(Math.min(selectedDebtObj.minPayment, selectedDebtObj.balance));
                              setAmount(String(cicilan));
                              const hasRate = !selectedDebtObj.isAccount && (selectedDebtObj.interestRate || 0) > 0;
                              setSplitPrincipalInterest(hasRate);
                              setInterestPortion(String(estimateMonthlyDebtInterest(selectedDebtObj, cicilan)));
                              const isKpr =
                                selectedDebtObj.category === 'KPR / Properti' ||
                                Boolean((selectedDebtObj as Debt).kprScheme);
                              setDescription(
                                isKpr
                                  ? `Pembayaran Cicilan KPR: ${selectedDebtObj.name}`
                                  : `Pembayaran Cicilan Hutang: ${selectedDebtObj.name}`
                              );
                            }}
                            className="flex-1 py-1.5 px-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-[10px] font-extrabold transition cursor-pointer"
                          >
                            Isi Cicilan ({formatterIDR.format(Math.min(selectedDebtObj.minPayment, selectedDebtObj.balance))})
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            const payoff = Math.round(selectedDebtObj.balance);
                            setAmount(String(payoff));
                            setSplitPrincipalInterest(false);
                            setInterestPortion('0');
                            const isKpr =
                              selectedDebtObj.category === 'KPR / Properti' ||
                              Boolean((selectedDebtObj as Debt).kprScheme);
                            setDescription(
                              isKpr
                                ? `Pelunasan Penuh KPR: ${selectedDebtObj.name}`
                                : `Pelunasan Penuh Hutang: ${selectedDebtObj.name}`
                            );
                          }}
                          className="flex-1 py-1.5 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-extrabold transition cursor-pointer"
                        >
                          Lunasi Penuh ({formatterIDR.format(selectedDebtObj.balance)})
                        </button>
                      </div>

                      {canSplitLoan && (
                        <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2 text-[10px]">
                          <div className="flex items-center justify-between gap-2">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={splitPrincipalInterest}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  setSplitPrincipalInterest(checked);
                                  if (checked) {
                                    setInterestPortion(
                                      String(estimateMonthlyDebtInterest(selectedDebtObj, parsedPayAmt))
                                    );
                                  } else {
                                    setInterestPortion('0');
                                  }
                                }}
                                className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                              />
                              <span className="font-bold text-slate-700">
                                Pisahkan Pokok &amp; Bunga ke Laba Rugi
                              </span>
                            </label>
                            {splitPrincipalInterest && (
                              <button
                                type="button"
                                onClick={() =>
                                  setInterestPortion(String(estimateMonthlyDebtInterest(selectedDebtObj, parsedPayAmt)))
                                }
                                className="px-2 py-0.5 rounded bg-white border border-slate-200 hover:bg-slate-100 text-[10px] font-bold text-indigo-700 transition cursor-pointer whitespace-nowrap shrink-0"
                              >
                                Hitung Otomatis
                              </button>
                            )}
                          </div>
                          {splitPrincipalInterest && (
                            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200/80">
                              <div>
                                <span className="text-slate-500 block font-semibold mb-1">
                                  Porsi Bunga (Beban Laba Rugi)
                                </span>
                                <input
                                  type="number"
                                  min="0"
                                  max={Math.max(0, parsedPayAmt)}
                                  value={interestPortion}
                                  onChange={(e) => setInterestPortion(e.target.value)}
                                  className="w-full bg-white border border-slate-200 rounded px-2 py-1 font-mono tabular-nums font-bold text-slate-800"
                                />
                              </div>
                              <div className="flex flex-col justify-between bg-white border border-slate-200 rounded px-2 py-1">
                                <span className="text-slate-500 font-semibold">Porsi Pokok (- Utang)</span>
                                <span className="font-mono tabular-nums font-bold text-emerald-700">
                                  {formatterIDR.format(effectivePrincipalPay)}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {parsedPayAmt > 0 && (
                        <div className="pt-2 border-t border-slate-100 space-y-1 text-[10px]">
                          {sourceAccObj && (
                            <div className="flex justify-between gap-2">
                              <span className="text-slate-500 font-semibold">Saldo {sourceAccObj.name}:</span>
                              <span className={`font-mono font-bold ${isInsufficientSource ? 'text-rose-600' : 'text-slate-800'}`}>
                                {formatterIDR.format(sourceAccObj.currentBalance)} &rarr;{' '}
                                {formatterIDR.format(
                                  applyAccountBalanceChange(
                                    sourceAccObj,
                                    getTransactionAccountDelta({ type: 'expense', amount: parsedPayAmt })
                                  ).currentBalance
                                )}
                              </span>
                            </div>
                          )}
                          {(() => {
                            const creditCardTarget = selectedDebtObj.isAccount
                              ? accounts.find((a) => `acc-debt-${a.id}` === selectedDebtObj.id)
                              : null;
                            if (creditCardTarget) {
                              const projectedCard = applyCreditBillPayment(creditCardTarget, parsedPayAmt, 'pay');
                              const nextBill = getAccountCreditBill(projectedCard);
                              return (
                                <>
                                  <div className="flex justify-between gap-2">
                                    <span className="text-slate-500 font-semibold">Sisa Tagihan Setelah Bayar:</span>
                                    <span className={`font-mono tabular-nums font-bold ${isOverDebtBalance ? 'text-rose-600' : 'text-emerald-700'}`}>
                                      {isOverDebtBalance
                                        ? 'Nominal melebihi sisa tagihan!'
                                        : nextBill <= 0
                                        ? 'Rp 0 (LUNAS!)'
                                        : formatterIDR.format(nextBill)}
                                    </span>
                                  </div>
                                  <div className="flex justify-between gap-2">
                                    <span className="text-slate-500 font-semibold">Proyeksi Sisa Limit {creditCardTarget.name}:</span>
                                    <span className="font-mono tabular-nums font-bold text-slate-800">
                                      {formatterIDR.format(creditCardTarget.currentBalance)} &rarr; {formatterIDR.format(projectedCard.currentBalance)}
                                    </span>
                                  </div>
                                </>
                              );
                            }
                            return (
                              <div className="flex justify-between gap-2">
                                <span className="text-slate-500 font-semibold">Sisa Pokok Setelah Bayar:</span>
                                <span className={`font-mono tabular-nums font-bold ${isOverDebtBalance ? 'text-rose-600' : 'text-emerald-700'}`}>
                                  {isOverDebtBalance
                                    ? 'Porsi pokok melebihi sisa utang!'
                                    : selectedDebtObj.balance - effectivePrincipalPay <= 0
                                    ? 'Rp 0 (LUNAS!)'
                                    : formatterIDR.format(selectedDebtObj.balance - effectivePrincipalPay)}
                                </span>
                              </div>
                            );
                          })()}
                        </div>
                      )}

                      {(isInsufficientSource || isOverDebtBalance || isSameCardAccount) && (
                        <div className="p-2 bg-rose-50 border border-rose-200 rounded-lg text-[10px] font-bold text-rose-700 flex items-start gap-1.5">
                          <AlertTriangle className="h-3.5 w-3.5 text-rose-600 shrink-0 mt-0.5" />
                          <span>
                            {isSameCardAccount
                              ? 'Tidak dapat membayar tagihan kartu/paylater menggunakan rekening tagihan yang sama.'
                              : isInsufficientSource
                              ? `Saldo ${sourceAccObj?.name} tidak mencukupi untuk nominal cicilan ini.`
                              : `Porsi pokok pembayaran (${formatterIDR.format(effectivePrincipalPay)}) melebihi sisa pokok hutang (${formatterIDR.format(selectedDebtObj.balance)}).`}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* 2. Penerimaan Hutang Baru */}
            {type === 'income' && category === 'Penerimaan Utang Baru' && (
              <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100 space-y-3 animate-slide-in">
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-blue-800">
                  <ShieldCheck className="h-4 w-4 text-blue-600 shrink-0" />
                  Pencatatan Hutang Baru
                </div>
                <div className="space-y-2.5 text-xs">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Nama Hutang / Kreditur</label>
                    <input
                      type="text"
                      placeholder="e.g. Pinjaman Bank Mandiri"
                      value={newDebtName}
                      onChange={(e) => setNewDebtName(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 font-medium"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Bunga APR (%)</label>
                      <input
                        type="number"
                        placeholder="e.g. 12"
                        value={newDebtInterestRate}
                        onChange={(e) => setNewDebtInterestRate(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 font-semibold"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Cicilan Min/Bulan (Rp)</label>
                      <FormattedNumberInput
                        placeholder="e.g. 400.000"
                        value={newDebtMinPayment}
                        onChange={(val) => setNewDebtMinPayment(val)}
                        className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 font-semibold"
                        required
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Tujuan Hutang</label>
                      <select
                        value={newDebtPurpose}
                        onChange={(e) => setNewDebtPurpose(e.target.value as 'productive' | 'consumptive')}
                        className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700"
                      >
                        <option value="consumptive">Konsumtif</option>
                        <option value="productive">Produktif</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Kategori Hutang</label>
                      <select
                        value={newDebtCategory}
                        onChange={(e) => setNewDebtCategory(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700"
                      >
                        <option value="Pinjaman Bank">Pinjaman Bank</option>
                        <option value="Kredit Motor/Mobil">Kredit Kendaraan</option>
                        <option value="KPR Rumah">KPR Rumah</option>
                        <option value="Lainnya">Lainnya</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 3. Beli / Tambah Investasi Baru */}
            {(type === 'investment' || category === 'Beli Investasi Baru') && (
              <div className="bg-emerald-50/40 p-4 rounded-xl border border-emerald-100 space-y-3 animate-slide-in">
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-emerald-800">
                  <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                  Koneksi Pembelian Investasi
                </div>
                <div className="space-y-2.5 text-xs">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Nama Aset / Saham / Reksadana</label>
                    <input
                      type="text"
                      placeholder="e.g. Saham BBRI, Emas Antam, dsb."
                      value={newInvestmentName}
                      onChange={(e) => setNewInvestmentName(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 font-semibold"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Kategori Aset</label>
                    <select
                      value={newInvestmentCategory}
                      onChange={(e) => setNewInvestmentCategory(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 font-medium"
                    >
                      <option value="Saham">Saham</option>
                      <option value="Reksadana">Reksadana</option>
                      <option value="Logam Mulia (Emas)">Logam Mulia (Emas)</option>
                      <option value="Cryptocurrency">Cryptocurrency</option>
                      <option value="Bisnis Riil">Bisnis Riil</option>
                      <option value="Lainnya">Lainnya</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* 4. Likuidasi / Penjualan Investasi */}
            {type === 'income' && category === 'Penjualan Investasi' && (
              <div className="bg-amber-50/50 p-4 rounded-xl border border-amber-100 space-y-3 animate-slide-in">
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-amber-800">
                  <ShieldCheck className="h-4 w-4 text-amber-600 shrink-0" />
                  Koneksi Likuidasi Investasi
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Pilih Aset Investasi yang Dijual</label>
                  {investments.length === 0 ? (
                    <div className="text-xs text-rose-600 bg-rose-50 px-3 py-2 rounded-lg border border-rose-100 font-medium">
                      Belum ada portofolio investasi yang aktif. Tambahkan investasi melalui menu "Investasi & Portofolio" atau "Beli Investasi Baru".
                    </div>
                  ) : (
                    <select
                      value={linkedInvestmentId}
                      onChange={(e) => setLinkedInvestmentId(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 font-semibold"
                      required
                    >
                      <option value="">-- Pilih Instrumen Investasi --</option>
                      {investments.map(inv => (
                        <option key={inv.id} value={inv.id}>
                          {inv.name} ({formatterIDR.format(inv.balance)})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            )}

            {/* 5. Perhitungan Satuan Investasi (Kuantitas x Harga Satuan) */}
            {(type === 'investment' || category === 'Beli Investasi Baru' || category === 'Penjualan Investasi' || linkedInvestmentId !== '') && (
              <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100 space-y-3 animate-slide-in">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-indigo-800">
                    <Coins className="h-4 w-4 text-indigo-600 shrink-0" />
                    Perhitungan Satuan Investasi
                  </div>
                  <span className="text-[10px] bg-indigo-100 text-indigo-700 font-semibold px-2 py-0.5 rounded-full">
                    Otomatis Hitung Nominal
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                  {/* Satuan */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Jenis Satuan
                    </label>
                    <select
                      value={invUnitName}
                      onChange={(e) => handleUnitPriceOrQtyChange(invUnitPrice, invQuantity, e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-700 font-semibold"
                    >
                      <option value="Lot">Lot (1 Lot = 100 Lembar)</option>
                      <option value="Lembar">Lembar</option>
                      <option value="Gram">Gram</option>
                      <option value="Unit">Unit</option>
                      <option value="Koin">Koin / Token</option>
                      <option value="Paket">Paket / Porsi</option>
                      <option value="Lainnya">Lainnya</option>
                    </select>
                  </div>

                  {/* Kuantitas */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Jumlah ({invUnitName})
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      placeholder={invUnitName === 'Lot' ? 'Min 1' : 'e.g. 10'}
                      value={invQuantity}
                      onChange={(e) => handleUnitPriceOrQtyChange(invUnitPrice, e.target.value, invUnitName)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-700 font-semibold"
                    />
                  </div>

                  {/* Harga Satuan dengan Tooltip Rumus */}
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        Harga per {invUnitName === 'Lot' ? 'Lembar' : invUnitName} (Rp)
                      </label>
                      <div className="relative group inline-block">
                        <Info className="h-3.5 w-3.5 text-indigo-500 hover:text-indigo-700 cursor-help" />
                        <div className="absolute right-0 sm:left-1/2 sm:-translate-x-1/2 bottom-full mb-1.5 hidden group-hover:block w-64 p-2.5 bg-slate-900 text-white text-[10px] rounded-xl shadow-xl z-50 pointer-events-none border border-slate-700">
                          <div className="font-extrabold text-indigo-300 border-b border-slate-700 pb-1 mb-1">
                            📐 Rumus Otomatis Total Nominal
                          </div>
                          <p className="text-slate-200 font-medium leading-relaxed">
                            <strong className="text-white">Total Nominal</strong> = Harga Satuan × Jumlah Unit {invUnitName === 'Lot' ? '× 100 (1 Lot = 100 Lembar)' : ''}
                          </p>
                          <div className="mt-1.5 bg-slate-800 p-1.5 rounded text-[9px] font-mono text-indigo-200">
                            {invUnitName === 'Lot'
                              ? 'Contoh: 2 Lot x Rp 5.000 x 100 = Rp 1.000.000'
                              : `Contoh: 10 ${invUnitName} x Rp 50.000 = Rp 500.000`}
                          </div>
                        </div>
                      </div>
                    </div>
                    <FormattedNumberInput
                      placeholder="Harga Satuan"
                      value={invUnitPrice}
                      onChange={(val) => handleUnitPriceOrQtyChange(val, invQuantity, invUnitName)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-700 font-semibold"
                    />
                  </div>
                </div>

                {/* Validation Alert for Stock Lot Rule */}
                {stockValidationError && (
                  <div className="bg-rose-50 border border-rose-200 p-2.5 rounded-lg text-rose-800 text-[11px] font-bold flex items-center gap-2 animate-shake">
                    <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
                    <span>{stockValidationError}</span>
                  </div>
                )}

                {/* Saham Minimum Lot Realtime Warning */}
                {(category === 'Saham' || category === 'Investasi Saham' || newInvestmentCategory === 'Saham') &&
                  parseFloat(invQuantity) > 0 &&
                  ((invUnitName === 'Lot' && parseFloat(invQuantity) < 1) || (invUnitName === 'Lembar' && parseFloat(invQuantity) < 100)) && (
                  <div className="bg-amber-50 border border-amber-200 p-2.5 rounded-lg text-amber-800 text-[11px] font-medium flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="font-extrabold block">Aturan Minimal Transaksi Saham:</strong>
                      Pembelian saham wajib minimal <span className="font-bold underline">1 Lot (100 lembar)</span>. Kuantitas yang Anda masukkan ({invQuantity} {invUnitName}) kurang dari batas minimum.
                    </div>
                  </div>
                )}

                {/* Saham Minimum Lot Notice */}
                {invUnitName === 'Lot' && (
                  <p className="text-[10px] text-indigo-700 bg-indigo-100/60 p-2 rounded-lg font-medium">
                    💡 <span className="font-bold">Info Saham:</span> 1 Lot = 100 lembar saham. Minimal transaksi adalah 1 Lot. Harga satuan diisi harga per lembar.
                  </p>
                )}

                {/* Dynamic Summary Breakdown Banner */}
                {parseFloat(invQuantity) > 0 && parseFloat(invUnitPrice) > 0 && (
                  <div className="bg-white p-2.5 rounded-lg border border-indigo-100 text-[11px] space-y-1">
                    <div className="flex justify-between items-center text-slate-600 font-medium">
                      <span>Rincian Pembelian:</span>
                      <span className="font-bold text-indigo-700">
                        {invUnitName === 'Lot'
                          ? `${invQuantity} Lot (${parseFloat(invQuantity) * 100} Lembar)`
                          : `${invQuantity} ${invUnitName}`}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-slate-600 font-medium">
                      <span>Harga per {invUnitName === 'Lot' ? 'Lembar' : invUnitName}:</span>
                      <span className="font-bold text-slate-800">
                        {formatterIDR.format(parseFloat(invUnitPrice))}
                      </span>
                    </div>
                    <div className="flex justify-between items-center pt-1 border-t border-slate-100 text-indigo-900 font-black">
                      <span>Total Hasil Perhitungan:</span>
                      <span className="text-sm text-indigo-600">
                        {formatterIDR.format(
                          (invUnitName === 'Lot' ? parseFloat(invQuantity) * 100 : parseFloat(invQuantity)) *
                            parseFloat(invUnitPrice)
                        )}
                      </span>
                    </div>
                    <div className="mt-1 pt-1.5 border-t border-dashed border-indigo-100 text-[10px] text-indigo-700/90 leading-relaxed font-medium">
                      💡 <span className="font-bold">Sistem Investasi DCA:</span> Pembelian baru ini akan memperbarui <span className="font-bold">Harga Pasar Terkini</span> dan secara otomatis menghitung ulang <span className="font-bold">Harga Rata-Rata Beli (DCA)</span> portofolio Anda.
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Keterangan */}
            <div>
              <div className="flex justify-between items-end mb-1">
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">Keterangan / Memo</label>
                <button 
                  type="button" 
                  onClick={handleSuggestCategory}
                  disabled={!description.trim() || isSuggestingCategory}
                  className="flex items-center gap-1 text-[10px] text-blue-600 hover:text-blue-700 font-bold bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded cursor-pointer transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Sparkles className="h-3 w-3" />
                  Auto-Kategori
                </button>
              </div>
              <div className="relative">
                <FileText className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Contoh: Beli saham BBRI / Emas 5 gram"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onBlur={() => {
                    if (!hasManuallySelectedCategory) {
                      handleSuggestCategory();
                    }
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700"
                />
              </div>
            </div>

            {/* Jumlah Transaksi */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Total Nominal (Rupiah)</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400">Rp</span>
                <FormattedNumberInput
                  placeholder="0"
                  value={amount}
                  onChange={(val) => handleAmountChangeWithUnitSync(val)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 font-semibold"
                  required
                />
              </div>
            </div>

            {/* Live Warning Block */}
            {liveWarning && (
              <div id="live-budget-warning" className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-rose-700 space-y-1 animate-slide-in">
                <div className="flex items-center gap-1.5 font-bold text-[10px] uppercase tracking-wider text-rose-800">
                  <AlertTriangle className="h-4 w-4 animate-pulse text-rose-600 shrink-0" />
                  Over-Budget Terdeteksi!
                </div>
                <p className="text-[10px] text-rose-600 font-medium">
                  Pengeluaran ini akan melebihi sisa anggaran kategori <span className="font-bold">{category}</span> sebesar <span className="font-extrabold">{formatterIDR.format(liveWarning.exceeded)}</span>.
                </p>
                <div className="grid grid-cols-2 gap-2 pt-1.5 text-[9px] font-mono border-t border-rose-100 mt-1">
                  <div>
                    <span className="text-rose-500 block">Sisa Anggaran:</span>
                    <span className="font-black text-rose-700">{formatterIDR.format(liveWarning.sisa)}</span>
                  </div>
                  <div>
                    <span className="text-rose-500 block">Kelebihan:</span>
                    <span className="font-black text-rose-700">-{formatterIDR.format(liveWarning.exceeded)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Pratinjau Dampak Saldo Rekening (Non-Debt Mode) */}
            {!isDebtPayMode && (() => {
              const selectedAcc = accounts.find((a) => a.id === accountId);
              const parsedAmt = Math.abs(parseFloat(amount) || 0);
              if (!selectedAcc || parsedAmt <= 0) return null;
              const delta = getTransactionAccountDelta({ type, amount: parsedAmt });
              const projectedAcc = applyAccountBalanceChange(selectedAcc, delta);
              const isCredit = isCreditAccount(selectedAcc);
              const currentBill = isCredit ? getAccountCreditBill(selectedAcc) : 0;
              const projectedBill = isCredit ? getAccountCreditBill(projectedAcc) : 0;
              const isNegativeProjected = delta < 0 && projectedAcc.currentBalance < 0;

              return (
                <div className={`rounded-xl border p-3 text-[11px] space-y-1.5 ${
                  isNegativeProjected
                    ? 'bg-rose-50/70 border-rose-200'
                    : 'bg-slate-50 border-slate-200'
                }`}>
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <span>Pratinjau Dampak Saldo ({selectedAcc.name})</span>
                    <span className={`font-mono tabular-nums font-extrabold ${
                      delta >= 0 ? 'text-emerald-600' : 'text-rose-600'
                    }`}>
                      {delta >= 0 ? '+' : ''}
                      {formatterIDR.format(delta)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-slate-600 font-medium">
                      {isCredit ? 'Sisa Limit:' : 'Saldo Rekening:'}
                    </span>
                    <span className={`font-mono tabular-nums font-bold ${
                      isNegativeProjected ? 'text-rose-700' : 'text-slate-900'
                    }`}>
                      {formatterIDR.format(selectedAcc.currentBalance)} &rarr; {formatterIDR.format(projectedAcc.currentBalance)}
                    </span>
                  </div>
                  {isCredit && (
                    <div className="flex items-center justify-between gap-2 text-[10px] pt-1 border-t border-slate-200/80">
                      <span className="text-slate-500 font-semibold">Tagihan Terpakai:</span>
                      <span className="font-mono tabular-nums font-bold text-rose-700">
                        {formatterIDR.format(currentBill)} &rarr; {formatterIDR.format(projectedBill)}
                      </span>
                    </div>
                  )}
                  {isNegativeProjected && (
                    <p className="text-[10px] text-rose-700 font-semibold pt-0.5 font-mono tabular-nums">
                      {isCredit
                        ? `Status: Overlimit (melebihi limit sebesar ${formatterIDR.format(Math.abs(projectedAcc.currentBalance))}) · Transaksi tetap diizinkan.`
                        : 'Nominal melebihi saldo kas rekening saat ini.'}
                    </p>
                  )}
                </div>
              );
            })()}

            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-4 rounded-lg text-xs uppercase tracking-wider transition cursor-pointer"
            >
              Simpan Transaksi
            </button>
          </form>
        </div>

        {/* Transfer Rekening (Mutasi Dana) */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <ArrowLeftRight className="h-5 w-5 text-blue-600" />
            <h3 className="font-semibold text-slate-800 text-sm uppercase tracking-wider">Mutasi Dana (Transfer)</h3>
          </div>

          <form onSubmit={handleTransferSubmit} className="space-y-4">
            {/* Rekening Asal */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Rekening Asal</label>
              <select
                value={fromAccount}
                onChange={(e) => setFromAccount(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700"
              >
                <option value="">-- Pilih Rekening Asal --</option>
                {accounts.map(acc => {
                  const isCreditOrPaylater = acc.type === 'credit-card' || acc.type === 'paylater';
                  const label = isCreditOrPaylater ? 'Sisa Limit: ' : 'Saldo: ';
                  return (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({label}{formatterIDR.format(acc.currentBalance)})
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Rekening Tujuan */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Rekening Tujuan</label>
              <select
                value={toAccount}
                onChange={(e) => setToAccount(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700"
              >
                <option value="">-- Pilih Rekening Tujuan --</option>
                {accounts.map(acc => {
                  const isCreditOrPaylater = acc.type === 'credit-card' || acc.type === 'paylater';
                  const label = isCreditOrPaylater ? 'Sisa Limit: ' : 'Saldo: ';
                  return (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({label}{formatterIDR.format(acc.currentBalance)})
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Nominal Transfer */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Nominal Transfer</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400">Rp</span>
                <FormattedNumberInput
                  placeholder="0"
                  value={transferAmount}
                  onChange={(val) => setTransferAmount(val)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 font-semibold"
                  required
                />
              </div>
            </div>

            {/* Deskripsi */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Keterangan / Catatan</label>
              <input
                type="text"
                placeholder="Contoh: Isi saldo dompet tunai dari bank"
                value={transferDesc}
                onChange={(e) => setTransferDesc(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700"
              />
            </div>

            {/* Pratinjau Saldo Mutasi Dana */}
            {(() => {
              const sourceAcc = accounts.find((a) => a.id === fromAccount);
              const destAcc = accounts.find((a) => a.id === toAccount);
              const parsedTransferAmt = Math.abs(parseFloat(transferAmount) || 0);
              if (!sourceAcc || !destAcc || fromAccount === toAccount || parsedTransferAmt <= 0) return null;

              const outDelta = getTransactionAccountDelta({ type: 'expense', amount: parsedTransferAmt });
              const inDelta = getTransactionAccountDelta({ type: 'income', amount: parsedTransferAmt });
              const projectedSource = applyAccountBalanceChange(sourceAcc, outDelta);
              const projectedDest = applyAccountBalanceChange(destAcc, inDelta);
              const isInsufficient = projectedSource.currentBalance < 0;

              return (
                <div className={`rounded-xl border p-3 text-[11px] space-y-1.5 ${
                  isInsufficient ? 'bg-rose-50/70 border-rose-200' : 'bg-slate-50 border-slate-200'
                }`}>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Pratinjau Proyeksi Saldo Mutasi
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-600 font-medium truncate">Asal ({sourceAcc.name}):</span>
                    <span className={`font-mono tabular-nums font-bold shrink-0 ${
                      isInsufficient ? 'text-rose-700' : 'text-rose-600'
                    }`}>
                      {formatterIDR.format(sourceAcc.currentBalance)} &rarr; {formatterIDR.format(projectedSource.currentBalance)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-600 font-medium truncate">Tujuan ({destAcc.name}):</span>
                    <span className="font-mono tabular-nums font-bold text-emerald-700 shrink-0">
                      {formatterIDR.format(destAcc.currentBalance)} &rarr; {formatterIDR.format(projectedDest.currentBalance)}
                    </span>
                  </div>
                  {isCreditAccount(destAcc) && (
                    <div className="flex items-center justify-between gap-2 text-[10px] pt-1 border-t border-slate-200/80">
                      <span className="text-slate-500 font-semibold">Sisa Tagihan {destAcc.name}:</span>
                      <span className="font-mono tabular-nums font-bold text-slate-800">
                        {formatterIDR.format(getAccountCreditBill(destAcc))} &rarr; {formatterIDR.format(getAccountCreditBill(projectedDest))}
                      </span>
                    </div>
                  )}
                </div>
              );
            })()}

            <button
              type="submit"
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-4 rounded-lg text-xs uppercase tracking-wider transition cursor-pointer"
            >
              Lakukan Transfer
            </button>
          </form>
        </div>

      </div>

      {/* Transaction Log History & Recurring Transactions Column */}
      <div className="lg:col-span-2 space-y-6">
        
        {/* RECURRING TRANSACTIONS MANAGEMENT CARD */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm animate-fadeIn">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-2">
                <Repeat className="h-5 w-5 text-blue-600 shrink-0" />
                <h3 className="font-extrabold text-slate-800 text-sm uppercase tracking-wider">Jadwal Transaksi Rutin (Otomatisasi Bulanan)</h3>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Jadwalkan pengeluaran atau pemasukan tetap (Gaji, Langganan, Tagihan Wi-Fi) agar otomatis tercatat &amp; siap dengan pemberitahuan push lokal (sw.js).
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0">
              <button
                type="button"
                onClick={handleEnablePushNotifications}
                className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold px-3 py-2 rounded-lg transition cursor-pointer shadow-xs"
                title="Aktifkan & Tes Pemberitahuan Push Lokal Service Worker (Tagihan <= 3 Hari)"
              >
                <BellRing className="h-4 w-4 animate-bounce" />
                <span>Pengingat Push SW</span>
              </button>

              <button
                onClick={handleOpenAddRecModal}
                className="flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3.5 py-2 rounded-lg transition cursor-pointer shrink-0 shadow-sm"
              >
                <PlusCircle className="h-4 w-4" />
                + Jadwal Baru
              </button>
            </div>
          </div>

          {recurringTransactions.length === 0 ? (
            <div className="text-center py-6 bg-slate-50/50 rounded-xl border border-dashed border-slate-200 text-slate-400 text-xs">
              Belum ada jadwal transaksi rutin. Klik tombol "+ Jadwal Baru" untuk membuat jadwal pengeluaran/pemasukan bulanan.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {recurringTransactions.map((rec) => {
                const acc = accounts.find((a) => a.id === rec.accountId);
                const accName = acc ? acc.name : 'Rekening';
                const isIncome = rec.type === 'income';
                const daysUntilDue = getDaysUntilDue(rec.dayOfMonth || 1);
                const isDueSoon = rec.isActive && daysUntilDue <= 3;

                return (
                  <div
                    key={rec.id}
                    className={`p-4 rounded-xl border transition-all duration-300 ${
                      isDueSoon
                        ? 'bg-amber-50/40 border-amber-300/80 shadow-sm ring-1 ring-amber-200'
                        : rec.isActive
                        ? 'bg-white border-slate-200 hover:border-blue-300 hover:shadow-md'
                        : 'bg-slate-50/80 border-slate-200 opacity-60'
                    }`}
                  >
                    {/* Due Notification Warning Badge if <= 3 days */}
                    {isDueSoon && (
                      <div className="mb-2.5 p-1.5 px-2.5 bg-gradient-to-r from-amber-500 to-rose-600 text-white rounded-lg flex items-center justify-between gap-1.5 text-[10px] font-black uppercase tracking-wider shadow-xs animate-pulse">
                        <div className="flex items-center gap-1.5">
                          <Bell className="h-3.5 w-3.5" />
                          <span>
                            {daysUntilDue === 0
                              ? '⚠️ Jatuh Tempo Hari Ini!'
                              : daysUntilDue === 1
                              ? '⏰ Jatuh Tempo Besok!'
                              : `⏰ Jatuh Tempo Dalam ${daysUntilDue} Hari`}
                          </span>
                        </div>
                        <span className="text-[9px] bg-white/20 px-1.5 py-0.5 rounded font-mono">SW Push Ready</span>
                      </div>
                    )}

                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-extrabold text-xs text-slate-800">{rec.title}</span>
                          <span
                            className={`text-[9px] px-2 py-0.5 rounded font-black uppercase tracking-wider ${
                              isIncome ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-50 text-rose-600 border border-rose-100'
                            }`}
                          >
                            {rec.category}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 truncate max-w-[200px]" title={rec.description}>
                          {rec.description || 'Tanpa keterangan'}
                        </p>
                      </div>

                      <span
                        className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase shrink-0 ${
                          rec.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {rec.isActive ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </div>

                    <div className="flex items-baseline justify-between mb-3 bg-slate-50 p-2.5 rounded-lg border border-slate-100 font-mono">
                      <span className="text-[10px] text-slate-400 font-bold uppercase">Nominal:</span>
                      <span className={`text-sm font-black ${isIncome ? 'text-emerald-600' : 'text-slate-800'}`}>
                        {isIncome ? '+' : '-'}{formatterIDR.format(rec.amount)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-500 font-semibold mb-3 border-t border-slate-100 pt-2">
                      <span className="flex items-center gap-1 text-slate-600">
                        <Clock className="h-3 w-3 text-blue-500" />
                        Tgl {rec.dayOfMonth} Bulanan ({accName})
                      </span>
                      {rec.lastProcessedDate && (
                        <span className="text-slate-400 font-mono text-[9px]">
                          Terakhir: {rec.lastProcessedDate}
                        </span>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center justify-between gap-1.5 border-t border-slate-100 pt-2">
                      <button
                        onClick={() => {
                          if (onManualRunRecurring) {
                            onManualRunRecurring(rec.id);
                            showToast({
                              type: 'success',
                              title: 'Transaksi Rutin Dicatat',
                              message: `'${rec.title}' (${formatterIDR.format(rec.amount)}) berhasil ditambahkan ke jurnal transaksi.`,
                            });
                          }
                        }}
                        className="flex-1 flex items-center justify-center gap-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-[10px] font-bold py-1.5 px-2 rounded-lg transition cursor-pointer"
                        title="Eksekusi transaksi ini ke jurnal transaksi sekarang"
                      >
                        <Play className="h-3 w-3 fill-emerald-600" />
                        Jalankan Now
                      </button>

                      <button
                        onClick={() => onToggleRecurringTransaction && onToggleRecurringTransaction(rec.id)}
                        className={`p-1.5 rounded-lg border text-[10px] transition cursor-pointer ${
                          rec.isActive
                            ? 'bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-200'
                            : 'bg-blue-50 hover:bg-blue-100 text-blue-600 border-blue-200'
                        }`}
                        title={rec.isActive ? 'Nonaktifkan Jadwal' : 'Aktifkan Jadwal'}
                      >
                        <Power className="h-3.5 w-3.5" />
                      </button>

                      <button
                        onClick={() => handleEditRec(rec)}
                        className="p-1.5 rounded-lg border bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200 text-[10px] transition cursor-pointer"
                        title="Edit Jadwal"
                      >
                        Edit
                      </button>

                      <button
                        onClick={() => setDeleteRecurringConfirm({ id: rec.id, title: rec.title })}
                        className="p-1.5 rounded-lg border bg-rose-50 hover:bg-rose-100 text-rose-600 border-rose-200 text-[10px] transition cursor-pointer"
                        title="Hapus Jadwal"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* HISTORI JURNAL TRANSAKSI CARD */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider">Histori Jurnal Transaksi</h3>
                <button
                  onClick={() => {
                    setIsCleanupModalOpen(true);
                    if (cleanupSuggestions.length === 0) {
                      handleRunCleanupAI();
                    }
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition border cursor-pointer ${
                    uncategorizedTransactions.length > 0
                      ? 'bg-gradient-to-r from-amber-500 via-indigo-600 to-blue-600 text-white border-amber-400/80 shadow-sm hover:brightness-110'
                      : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
                  }`}
                  title="Gunakan AI Gemini untuk meninjau & mengategori transaksi 'Lainnya'"
                >
                  <Sparkles className="h-3.5 w-3.5 animate-pulse text-amber-300" />
                  <span>Kategori AI ({uncategorizedTransactions.length} "Lainnya")</span>
                </button>
              </div>
              <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                Gunakan pencarian teks dan filter kategori untuk menemukan catatan keuangan secara cepat.
              </p>
            </div>
          
          <div className="flex flex-wrap sm:flex-nowrap gap-2 items-center">
            <div className="relative flex-1 min-w-[150px]">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Cari deskripsi, kategori, akun..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-7 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 font-medium placeholder-slate-400"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 font-bold text-xs"
                  title="Hapus pencarian"
                >
                  ✕
                </button>
              )}
            </div>

            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 font-semibold"
            >
              <option value="all">Semua Tipe</option>
              <option value="expense">Keluar (Expense)</option>
              <option value="income">Masuk (Income)</option>
              <option value="saving">Nabung (Saving)</option>
              <option value="investment">Investasi (Investment)</option>
            </select>

            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 font-semibold max-w-[180px] sm:max-w-[210px] truncate"
            >
              <option value="all">Semua Kategori</option>
              <optgroup label="🔴 Kategori Pengeluaran">
                {groupedCategories.expense.map((cat) => {
                  const count = transactions.filter((t) => t.category === cat).length;
                  return (
                    <option key={`hdr-exp-${cat}`} value={cat}>
                      {cat} ({count})
                    </option>
                  );
                })}
              </optgroup>
              <optgroup label="🟢 Kategori Pemasukan">
                {groupedCategories.income.map((cat) => {
                  const count = transactions.filter((t) => t.category === cat).length;
                  return (
                    <option key={`hdr-inc-${cat}`} value={cat}>
                      {cat} ({count})
                    </option>
                  );
                })}
              </optgroup>
              <optgroup label="🔵 Tabungan & Investasi">
                {groupedCategories.saving.concat(groupedCategories.investment).map((cat) => {
                  const count = transactions.filter((t) => t.category === cat).length;
                  return (
                    <option key={`hdr-si-${cat}`} value={cat}>
                      {cat} ({count})
                    </option>
                  );
                })}
              </optgroup>
            </select>
          </div>
        </div>

        {/* Active Filter Badges & Reset Bar */}
        {hasActiveFilters && (
          <div className="bg-blue-50/80 p-3 rounded-xl border border-blue-200/80 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-extrabold text-blue-900 uppercase tracking-wider flex items-center gap-1">
                <SlidersHorizontal className="h-3 w-3 text-blue-600" /> Filter Aktif:
              </span>

              {(filterStartDate || filterEndDate) && (
                <span className="text-[11px] text-emerald-800 font-bold bg-emerald-100/80 px-2.5 py-0.5 rounded-full border border-emerald-300 flex items-center gap-1.5 shadow-2xs">
                  <span>📅 Tanggal: {filterStartDate || 'Awal'} s/d {filterEndDate || 'Hari Ini'}</span>
                  <button onClick={() => { setFilterStartDate(''); setFilterEndDate(''); }} className="text-emerald-700 hover:text-emerald-900 font-black cursor-pointer">✕</button>
                </span>
              )}

              {(filterMinAmount || filterMaxAmount) && (
                <span className="text-[11px] text-amber-800 font-bold bg-amber-100/80 px-2.5 py-0.5 rounded-full border border-amber-300 flex items-center gap-1.5 shadow-2xs">
                  <span>💵 Nominal: {filterMinAmount ? `≥ Rp ${parseInt(filterMinAmount).toLocaleString('id-ID')}` : ''} {filterMinAmount && filterMaxAmount ? '-' : ''} {filterMaxAmount ? `≤ Rp ${parseInt(filterMaxAmount).toLocaleString('id-ID')}` : ''}</span>
                  <button onClick={() => { setFilterMinAmount(''); setFilterMaxAmount(''); }} className="text-amber-700 hover:text-amber-900 font-black cursor-pointer">✕</button>
                </span>
              )}

              {selectedCategories.length > 0 && (
                <span className="text-[11px] text-blue-800 font-bold bg-blue-100/90 px-2.5 py-0.5 rounded-full border border-blue-300 flex items-center gap-1.5 shadow-2xs">
                  <span>🏷️ {selectedCategories.length} Kategori ({selectedCategories.slice(0, 2).join(', ')}{selectedCategories.length > 2 ? ` +${selectedCategories.length - 2}` : ''})</span>
                  <button onClick={() => setSelectedCategories([])} className="text-blue-700 hover:text-blue-900 font-black cursor-pointer" title="Kosongkan kategori">✕</button>
                </span>
              )}

              {filterCategory !== 'all' && selectedCategories.length === 0 && (
                <span className="text-[11px] text-blue-800 font-bold bg-blue-100/90 px-2.5 py-0.5 rounded-full border border-blue-300 flex items-center gap-1.5 shadow-2xs">
                  <span>🏷️ Kategori: {filterCategory}</span>
                  <button onClick={() => setFilterCategory('all')} className="text-blue-700 hover:text-blue-900 font-black cursor-pointer">✕</button>
                </span>
              )}

              {filterAccountId !== 'all' && (
                <span className="text-[11px] text-indigo-800 font-bold bg-indigo-100/80 px-2.5 py-0.5 rounded-full border border-indigo-300 flex items-center gap-1.5 shadow-2xs">
                  <span>💳 Akun: {accounts.find(a => a.id === filterAccountId)?.name || filterAccountId}</span>
                  <button onClick={() => setFilterAccountId('all')} className="text-indigo-700 hover:text-indigo-900 font-black cursor-pointer">✕</button>
                </span>
              )}

              {filterType !== 'all' && (
                <span className="text-[11px] text-purple-800 font-bold bg-purple-100/80 px-2.5 py-0.5 rounded-full border border-purple-300 flex items-center gap-1.5 shadow-2xs">
                  <span>📊 Tipe: {filterType}</span>
                  <button onClick={() => setFilterType('all')} className="text-purple-700 hover:text-purple-900 font-black cursor-pointer">✕</button>
                </span>
              )}

              {searchQuery && (
                <span className="text-[11px] text-cyan-800 font-bold bg-cyan-100/80 px-2.5 py-0.5 rounded-full border border-cyan-300 flex items-center gap-1.5 shadow-2xs">
                  <span>🔍 Cari: "{searchQuery}"</span>
                  <button onClick={() => setSearchQuery('')} className="text-cyan-700 hover:text-cyan-900 font-black cursor-pointer">✕</button>
                </span>
              )}
            </div>

            <button
              onClick={handleResetAllFilters}
              className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs cursor-pointer transition ml-auto"
            >
              <RotateCcw className="h-3 w-3" />
              Reset Semua Filter
            </button>
          </div>
        )}

        {/* Multi-Criteria Filter Controls Panel */}
        <div className="bg-slate-50/90 p-4 rounded-xl border border-slate-200/80 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/70 pb-3">
            <span className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <Filter className="h-4 w-4 text-blue-600" />
              Filter Lanjutan Multi-Kriteria (Tanggal, Nominal & Multi-Kategori)
            </span>
            <button
              type="button"
              onClick={() => setShowMultiCategoryPanel(!showMultiCategoryPanel)}
              className="px-3 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition shadow-2xs"
            >
              <Tag className="h-3.5 w-3.5 text-blue-600" />
              {showMultiCategoryPanel ? 'Tutup Panel Checklist Kategori' : 'Buka Checklist Banyak Kategori'}
              {showMultiCategoryPanel ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          </div>

          {/* Grid Rows for Date Range, Amount Range, Account */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
            {/* Rentang Tanggal Box */}
            <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-extrabold text-slate-600 uppercase tracking-wider flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5 text-blue-600" /> Rentang Tanggal
                </label>
                {(filterStartDate || filterEndDate) && (
                  <button onClick={() => { setFilterStartDate(''); setFilterEndDate(''); }} className="text-[10px] text-rose-600 hover:underline font-bold">Reset</button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[9px] font-bold text-slate-400 block mb-0.5">Mulai:</span>
                  <input
                    type="date"
                    value={filterStartDate}
                    onChange={(e) => setFilterStartDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700"
                  />
                </div>
                <div>
                  <span className="text-[9px] font-bold text-slate-400 block mb-0.5">Selesai:</span>
                  <input
                    type="date"
                    value={filterEndDate}
                    onChange={(e) => setFilterEndDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700"
                  />
                </div>
              </div>
              {/* Presets Tanggal */}
              <div className="flex items-center gap-1 flex-wrap pt-1">
                <button
                  type="button"
                  onClick={() => {
                    const todayStr = toLocalYYYYMMDD();
                    setFilterStartDate(todayStr);
                    setFilterEndDate(todayStr);
                  }}
                  className="px-2 py-0.5 rounded bg-slate-100 hover:bg-blue-100 hover:text-blue-700 text-[10px] font-bold text-slate-600 cursor-pointer transition"
                >
                  Hari Ini
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const today = new Date();
                    const todayStr = toLocalYYYYMMDD(today);
                    const d = new Date(today.getTime());
                    d.setDate(today.getDate() - 6);
                    setFilterStartDate(toLocalYYYYMMDD(d));
                    setFilterEndDate(todayStr);
                  }}
                  className="px-2 py-0.5 rounded bg-slate-100 hover:bg-blue-100 hover:text-blue-700 text-[10px] font-bold text-slate-600 cursor-pointer transition"
                >
                  7 Hari
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const today = new Date();
                    const todayStr = toLocalYYYYMMDD(today);
                    const d = new Date(today.getTime());
                    d.setDate(today.getDate() - 29);
                    setFilterStartDate(toLocalYYYYMMDD(d));
                    setFilterEndDate(todayStr);
                  }}
                  className="px-2 py-0.5 rounded bg-slate-100 hover:bg-blue-100 hover:text-blue-700 text-[10px] font-bold text-slate-600 cursor-pointer transition"
                >
                  30 Hari
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const today = new Date();
                    const year = today.getFullYear();
                    const month = String(today.getMonth() + 1).padStart(2, '0');
                    setFilterStartDate(`${year}-${month}-01`);
                    setFilterEndDate(toLocalYYYYMMDD(today));
                  }}
                  className="px-2 py-0.5 rounded bg-slate-100 hover:bg-blue-100 hover:text-blue-700 text-[10px] font-bold text-slate-600 cursor-pointer transition"
                >
                  Bulan Ini
                </button>
              </div>
            </div>

            {/* Rentang Nominal Box */}
            <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-extrabold text-slate-600 uppercase tracking-wider flex items-center gap-1">
                  <DollarSign className="h-3.5 w-3.5 text-emerald-600" /> Rentang Nominal (Rp)
                </label>
                {(filterMinAmount || filterMaxAmount) && (
                  <button onClick={() => { setFilterMinAmount(''); setFilterMaxAmount(''); }} className="text-[10px] text-rose-600 hover:underline font-bold">Reset</button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[9px] font-bold text-slate-400 block mb-0.5">Min (Rp):</span>
                  <input
                    type="number"
                    placeholder="Contoh: 50000"
                    value={filterMinAmount}
                    onChange={(e) => setFilterMinAmount(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium text-slate-700"
                  />
                </div>
                <div>
                  <span className="text-[9px] font-bold text-slate-400 block mb-0.5">Max (Rp):</span>
                  <input
                    type="number"
                    placeholder="Contoh: 1000000"
                    value={filterMaxAmount}
                    onChange={(e) => setFilterMaxAmount(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium text-slate-700"
                  />
                </div>
              </div>
              {/* Presets Nominal */}
              <div className="flex items-center gap-1 flex-wrap pt-1">
                <button
                  type="button"
                  onClick={() => { setFilterMinAmount(''); setFilterMaxAmount('100000'); }}
                  className="px-2 py-0.5 rounded bg-slate-100 hover:bg-emerald-100 hover:text-emerald-700 text-[10px] font-bold text-slate-600 cursor-pointer transition"
                >
                  &lt; 100rb
                </button>
                <button
                  type="button"
                  onClick={() => { setFilterMinAmount('100000'); setFilterMaxAmount('1000000'); }}
                  className="px-2 py-0.5 rounded bg-slate-100 hover:bg-emerald-100 hover:text-emerald-700 text-[10px] font-bold text-slate-600 cursor-pointer transition"
                >
                  100rb - 1Jt
                </button>
                <button
                  type="button"
                  onClick={() => { setFilterMinAmount('1000000'); setFilterMaxAmount('5000000'); }}
                  className="px-2 py-0.5 rounded bg-slate-100 hover:bg-emerald-100 hover:text-emerald-700 text-[10px] font-bold text-slate-600 cursor-pointer transition"
                >
                  1Jt - 5Jt
                </button>
                <button
                  type="button"
                  onClick={() => { setFilterMinAmount('5000000'); setFilterMaxAmount(''); }}
                  className="px-2 py-0.5 rounded bg-slate-100 hover:bg-emerald-100 hover:text-emerald-700 text-[10px] font-bold text-slate-600 cursor-pointer transition"
                >
                  &gt; 5Jt
                </button>
              </div>
            </div>

            {/* Account & Single Category Quick Select Box */}
            <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs space-y-2 lg:col-span-1 md:col-span-2">
              <label className="text-[10px] font-extrabold text-slate-600 uppercase tracking-wider flex items-center gap-1">
                <Wallet className="h-3.5 w-3.5 text-indigo-600" /> Filter Akun Keuangan
              </label>
              <select
                value={filterAccountId}
                onChange={(e) => setFilterAccountId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 font-semibold text-slate-700"
              >
                <option value="all">Semua Akun Keuangan</option>
                {accounts.map(acc => (
                  <option key={acc.id} value={acc.id}>{acc.name} ({acc.accountNumber || 'Utama'})</option>
                ))}
              </select>
              <p className="text-[10px] text-slate-400 font-medium leading-tight pt-1">
                Gunakan panel kriteria untuk menyaring pencatatan transaksi secara presisi.
              </p>
            </div>
          </div>

          {/* Quick Multi-Category Pills Strip */}
          <div className="space-y-2 pt-1 border-t border-slate-200/80">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                <Tag className="h-3 w-3 text-blue-500" /> Pilih Kategori (Klik untuk menambah / mengurangi filter multi-kategori):
              </span>
              {selectedCategories.length > 0 && (
                <button
                  onClick={() => setSelectedCategories([])}
                  className="text-[10px] text-rose-600 font-extrabold hover:underline cursor-pointer"
                >
                  Reset Semua Kategori Terpilih ({selectedCategories.length}) ✕
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 scrollbar-none">
              <button
                onClick={() => {
                  setSelectedCategories([]);
                  setFilterCategory('all');
                }}
                className={`px-3 py-1 rounded-full text-xs font-extrabold whitespace-nowrap transition cursor-pointer flex items-center gap-1 ${
                  selectedCategories.length === 0 && filterCategory === 'all'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
                }`}
              >
                Semua Kategori ({transactions.length})
              </button>
              {allCategories.map((cat) => {
                const isSelected = selectedCategories.includes(cat) || filterCategory === cat;
                const count = transactions.filter((t) => t.category === cat).length;
                if (count === 0 && !isSelected) return null;

                return (
                  <button
                    key={cat}
                    onClick={() => toggleCategorySelection(cat)}
                    className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 border ${
                      isSelected
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs ring-2 ring-blue-300/50'
                        : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                    }`}
                  >
                    {isSelected ? <CheckSquare className="h-3 w-3 text-white" /> : <Square className="h-3 w-3 text-slate-300" />}
                    <span>{cat}</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                      isSelected ? 'bg-blue-800 text-white' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Expandable Multi-Category Checklist Panel */}
          {showMultiCategoryPanel && (
            <div className="bg-white p-4 rounded-xl border border-blue-200 shadow-sm space-y-4 animate-in fade-in duration-200">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div className="flex items-center gap-2">
                  <Tag className="h-4 w-4 text-blue-600" />
                  <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
                    Checklist Banyak Kategori Sekaligus ({selectedCategories.length} Terpilih)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSelectedCategories(allCategories)}
                    className="text-[11px] font-bold text-blue-600 hover:text-blue-800 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 cursor-pointer"
                  >
                    Pilih Semua ({allCategories.length})
                  </button>
                  <button
                    onClick={() => setSelectedCategories([])}
                    className="text-[11px] font-bold text-slate-500 hover:text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 cursor-pointer"
                  >
                    Kosongkan
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                {/* 🔴 Pengeluaran Group */}
                <div className="space-y-2 bg-rose-50/40 p-3 rounded-lg border border-rose-100">
                  <div className="flex items-center justify-between border-b border-rose-200/60 pb-1.5">
                    <span className="font-extrabold text-rose-800 text-[11px] uppercase tracking-wider flex items-center gap-1">
                      🔴 Pengeluaran ({groupedCategories.expense.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleSelectAllCategoryGroup(groupedCategories.expense)}
                      className="text-[10px] font-bold text-rose-700 hover:underline cursor-pointer"
                    >
                      {groupedCategories.expense.every(c => selectedCategories.includes(c)) ? 'Kosongkan' : 'Pilih Semua'}
                    </button>
                  </div>
                  <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                    {groupedCategories.expense.map((cat) => {
                      const isChecked = selectedCategories.includes(cat);
                      const count = transactions.filter((t) => t.category === cat).length;
                      return (
                        <label
                          key={`chk-exp-${cat}`}
                          className={`flex items-center justify-between p-1.5 rounded-md cursor-pointer transition select-none ${
                            isChecked ? 'bg-rose-100/80 font-bold text-rose-900' : 'hover:bg-rose-100/40 text-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleCategorySelection(cat)}
                              className="rounded text-rose-600 focus:ring-rose-500 h-3.5 w-3.5 cursor-pointer"
                            />
                            <span>{cat}</span>
                          </div>
                          <span className="text-[10px] text-slate-400 font-semibold">({count})</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* 🟢 Pemasukan Group */}
                <div className="space-y-2 bg-emerald-50/40 p-3 rounded-lg border border-emerald-100">
                  <div className="flex items-center justify-between border-b border-emerald-200/60 pb-1.5">
                    <span className="font-extrabold text-emerald-800 text-[11px] uppercase tracking-wider flex items-center gap-1">
                      🟢 Pemasukan ({groupedCategories.income.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleSelectAllCategoryGroup(groupedCategories.income)}
                      className="text-[10px] font-bold text-emerald-700 hover:underline cursor-pointer"
                    >
                      {groupedCategories.income.every(c => selectedCategories.includes(c)) ? 'Kosongkan' : 'Pilih Semua'}
                    </button>
                  </div>
                  <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                    {groupedCategories.income.map((cat) => {
                      const isChecked = selectedCategories.includes(cat);
                      const count = transactions.filter((t) => t.category === cat).length;
                      return (
                        <label
                          key={`chk-inc-${cat}`}
                          className={`flex items-center justify-between p-1.5 rounded-md cursor-pointer transition select-none ${
                            isChecked ? 'bg-emerald-100/80 font-bold text-emerald-900' : 'hover:bg-emerald-100/40 text-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleCategorySelection(cat)}
                              className="rounded text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5 cursor-pointer"
                            />
                            <span>{cat}</span>
                          </div>
                          <span className="text-[10px] text-slate-400 font-semibold">({count})</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* 🔵 Tabungan & Investasi Group */}
                <div className="space-y-2 bg-blue-50/40 p-3 rounded-lg border border-blue-100">
                  <div className="flex items-center justify-between border-b border-blue-200/60 pb-1.5">
                    <span className="font-extrabold text-blue-800 text-[11px] uppercase tracking-wider flex items-center gap-1">
                      🔵 Tabungan & Investasi ({groupedCategories.saving.concat(groupedCategories.investment).length})
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleSelectAllCategoryGroup(groupedCategories.saving.concat(groupedCategories.investment))}
                      className="text-[10px] font-bold text-blue-700 hover:underline cursor-pointer"
                    >
                      {groupedCategories.saving.concat(groupedCategories.investment).every(c => selectedCategories.includes(c)) ? 'Kosongkan' : 'Pilih Semua'}
                    </button>
                  </div>
                  <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                    {groupedCategories.saving.concat(groupedCategories.investment).map((cat) => {
                      const isChecked = selectedCategories.includes(cat);
                      const count = transactions.filter((t) => t.category === cat).length;
                      return (
                        <label
                          key={`chk-si-${cat}`}
                          className={`flex items-center justify-between p-1.5 rounded-md cursor-pointer transition select-none ${
                            isChecked ? 'bg-blue-100/80 font-bold text-blue-900' : 'hover:bg-blue-100/40 text-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleCategorySelection(cat)}
                              className="rounded text-blue-600 focus:ring-blue-500 h-3.5 w-3.5 cursor-pointer"
                            />
                            <span>{cat}</span>
                          </div>
                          <span className="text-[10px] text-slate-400 font-semibold">({count})</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Filter Results Summary Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-blue-50/50 rounded-xl border border-blue-100 text-xs font-semibold text-slate-600">
          <div className="flex items-center gap-3 flex-wrap">
            <span>
              Menampilkan <span className="font-extrabold text-blue-700">{filteredTransactions.length}</span> dari <span className="font-bold">{transactions.length}</span> transaksi
            </span>
            {filteredTransactions.length > 0 && (
              <div className="flex items-center gap-3 text-[11px] font-mono border-l border-blue-200 pl-3">
                <span className="text-emerald-700 font-bold">
                  Masuk: +{formatterIDR.format(filteredIncomeTotal)}
                </span>
                <span className="text-rose-700 font-bold">
                  Keluar: -{formatterIDR.format(filteredExpenseTotal)}
                </span>
              </div>
            )}
          </div>

          {(filterStartDate || filterEndDate || filterCategory !== 'all' || filterAccountId !== 'all' || filterType !== 'all' || searchQuery) && (
            <button
              onClick={() => {
                setFilterStartDate('');
                setFilterEndDate('');
                setFilterCategory('all');
                setFilterAccountId('all');
                setFilterType('all');
                setSearchQuery('');
              }}
              className="text-[10px] text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 transition cursor-pointer bg-white hover:bg-blue-100 px-2.5 py-1 rounded-lg border border-blue-200 shadow-2xs"
            >
              Reset Filter
            </button>
          )}
        </div>

        {/* Action Feedback Banner with Framer Motion */}
        <AnimatePresence>
          {actionBanner && (
            <motion.div
              initial={{ opacity: 0, y: -15, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.98 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className={`p-3.5 rounded-xl border text-xs font-extrabold flex items-center justify-between gap-3 shadow-md ${
                actionBanner.type === 'add'
                  ? 'bg-emerald-600 text-white border-emerald-700'
                  : 'bg-rose-600 text-white border-rose-700'
              }`}
            >
              <div className="flex items-center gap-2.5">
                {actionBanner.type === 'add' ? (
                  <CheckCircle2 className="h-4.5 w-4.5 text-emerald-200 shrink-0 animate-bounce" />
                ) : (
                  <Trash2 className="h-4.5 w-4.5 text-rose-200 shrink-0 animate-pulse" />
                )}
                <span>{actionBanner.message}</span>
              </div>
              <button
                onClick={() => setActionBanner(null)}
                className="p-1 hover:bg-white/20 rounded-lg transition text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Transaction Table */}
        <div className="overflow-x-auto">
          {filteredTransactions.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">
              Tidak ada jurnal transaksi yang cocok dengan kriteria filter.
            </div>
          ) : (
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold text-[10px] border-b border-slate-100">
                <tr>
                  <th className="py-3 px-4">Tanggal</th>
                  <th className="py-3 px-4">Akun</th>
                  <th className="py-3 px-4">Kategori</th>
                  <th className="py-3 px-4">Deskripsi</th>
                  <th className="py-3 px-4 text-right">Jumlah</th>
                  <th className="py-3 px-4 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <AnimatePresence initial={false}>
                  {filteredTransactions.map((tx) => {
                    const acc = accounts.find(a => a.id === tx.accountId);
                    const isNewlyAdded = newlyAddedTxIds.has(tx.id);
                    return (
                      <motion.tr
                        key={tx.id}
                        initial={{ opacity: 0, y: -16, scale: 0.98, backgroundColor: 'rgba(219, 234, 254, 0.7)' }}
                        animate={{
                          opacity: 1,
                          y: 0,
                          scale: 1,
                          backgroundColor: isNewlyAdded ? 'rgba(219, 234, 254, 0.3)' : 'rgba(255, 255, 255, 0)',
                        }}
                        exit={{
                          opacity: 0,
                          x: -30,
                          scale: 0.95,
                          backgroundColor: 'rgba(254, 226, 226, 0.6)',
                        }}
                        transition={{ duration: 0.3, ease: 'easeOut' }}
                        className={`hover:bg-slate-50 transition-colors ${
                          isNewlyAdded ? 'animate-highlight-row font-semibold' : ''
                        }`}
                      >
                        <td className="py-3.5 px-4 font-mono text-slate-500 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span>{tx.date}</span>
                            {isNewlyAdded && (
                              <span className="px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider bg-blue-600 text-white rounded-md animate-pulse shadow-xs shrink-0">
                                BARU
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-slate-700 whitespace-nowrap">
                          {tx.isAdjustment ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[10px] font-bold border border-indigo-200">
                              Non-Kas / Penyesuaian
                            </span>
                          ) : (
                            acc ? acc.name : 'Unknown Account'
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={`inline-block px-2 py-0.5 rounded font-bold uppercase text-[9px] ${
                            tx.type === 'income' ? 'bg-emerald-50 text-emerald-600' :
                            tx.type === 'expense' ? 'bg-rose-50 text-rose-600' :
                            tx.type === 'saving' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'
                          }`}>
                            {tx.category}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-slate-800 font-medium max-w-[200px]" title={tx.description}>
                          <div className="truncate font-semibold">{tx.description}</div>
                          {(() => {
                            const coaInfo = resolveTransactionCoaCodes(tx, accounts, storedCoaList, kprCoaMapping);
                            if ((tx.coaDebitCode && tx.coaCreditCode) || coaInfo.isKprRelated) {
                              return (
                                <div className="mt-0.5 text-[10px] font-mono tabular-nums text-slate-500 truncate">
                                  Dr {coaInfo.debitCode} · Cr {coaInfo.creditCode}
                                </div>
                              );
                            }
                            return null;
                          })()}
                          {(tx.unitPrice || tx.units) && (
                            <div className="flex items-center gap-1 mt-0.5 text-[10px] text-indigo-600 font-bold">
                              <Coins className="h-3 w-3 shrink-0" />
                              <span>
                                {tx.units
                                  ? tx.unitName === 'Lembar' && tx.units >= 100 && tx.units % 100 === 0
                                    ? `${tx.units / 100} Lot (${tx.units} Lembar)`
                                    : `${tx.units} ${tx.unitName || 'Unit'}`
                                  : ''}
                                {tx.units && tx.unitPrice ? ' @ ' : ''}
                                {tx.unitPrice ? formatterIDR.format(tx.unitPrice) : ''}
                              </span>
                            </div>
                          )}
                        </td>
                        <td className={`py-3.5 px-4 font-mono font-bold text-right text-sm whitespace-nowrap ${
                          tx.type === 'income' ? 'text-emerald-600' :
                          tx.type === 'expense' ? 'text-rose-600' :
                          tx.type === 'saving' ? 'text-blue-600' : 'text-purple-600'
                        }`}>
                          {tx.type === 'income' ? '+' : '-'} {formatterIDR.format(tx.amount)}
                        </td>
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          <button
                            onClick={() => handleDeleteTx(tx)}
                            className="p-1.5 hover:bg-rose-50 rounded text-slate-400 hover:text-rose-600 transition cursor-pointer"
                            title="Hapus Transaksi"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          )}
        </div>
      </div>
      </div>

      {/* Toast Notifications Container Overlay */}
      <div className="fixed top-4 right-4 z-[9999] space-y-3 max-w-sm w-full pointer-events-none px-4 sm:px-0">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="pointer-events-auto bg-slate-900/95 backdrop-blur-md text-white p-4 rounded-xl border border-rose-500/30 shadow-2xl flex items-start gap-3 animate-slide-in transition-all duration-300"
            id={`toast-alert-${toast.id}`}
          >
            <div className="p-1.5 bg-rose-500/20 text-rose-400 rounded-lg shrink-0 mt-0.5 animate-pulse">
              <AlertTriangle className="h-4.5 w-4.5" />
            </div>
            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-rose-400">
                  {toast.title}
                </span>
                <button
                  onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
                  className="text-slate-400 hover:text-white transition text-[10px] uppercase font-extrabold px-2 py-0.5 bg-slate-800 rounded cursor-pointer"
                >
                  Tutup
                </button>
              </div>
              <p className="text-[11px] text-slate-200 leading-relaxed font-semibold">
                {toast.message}
              </p>
              
              {/* Detail Anggaran */}
              {toast.limit !== undefined && toast.spent !== undefined && toast.over !== undefined && (
                <div className="mt-2.5 pt-2 border-t border-slate-800/80 space-y-1 text-[10px] font-mono">
                  <div className="flex justify-between text-slate-400">
                    <span>Batas Anggaran:</span>
                    <span className="text-slate-200 font-bold">{formatterIDR.format(toast.limit)}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Sudah Terpakai:</span>
                    <span className="text-slate-200 font-bold">{formatterIDR.format(toast.spent)}</span>
                  </div>
                  <div className="flex justify-between text-rose-400 font-bold">
                    <span>Kelebihan (Over):</span>
                    <span>{formatterIDR.format(toast.over)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* MODAL TAMBAH / EDIT TRANSAKSI BERULANG */}
      {showRecModal && (
        <div className="fixed inset-0 z-[999] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Repeat className="h-5 w-5 text-blue-600" />
                <h3 className="font-extrabold text-slate-800 text-sm uppercase tracking-wider">
                  {editingRecId ? 'Edit Jadwal Transaksi Rutin' : 'Tambah Jadwal Transaksi Rutin'}
                </h3>
              </div>
              <button
                onClick={() => setShowRecModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-xs p-1 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveRecSubmit} className="space-y-4 text-xs">
              {/* Judul Jadwal */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Nama / Judul Jadwal
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Gaji Bulanan, Tagihan Indihome, Langganan Netflix"
                  value={recTitle}
                  onChange={(e) => setRecTitle(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-800"
                  required
                />
              </div>

              {/* Tipe Transaksi */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Tipe Transaksi
                </label>
                <div className="grid grid-cols-4 gap-1 bg-slate-100 p-1 rounded-lg">
                  {(['expense', 'income', 'saving', 'investment'] as TransactionType[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        setRecType(t);
                        const cats = getCategoriesByType(t);
                        if (cats.length > 0) setRecCategory(cats[0]);
                      }}
                      className={`text-[10px] py-1.5 rounded-md font-bold uppercase transition ${
                        recType === t ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      {t === 'expense' ? 'Keluar' : t === 'income' ? 'Masuk' : t === 'saving' ? 'Nabung' : 'Invest'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Kategori */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Kategori
                </label>
                <select
                  value={recCategory}
                  onChange={(e) => setRecCategory(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-800"
                >
                  {getCategoriesByType(recType).map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              {/* Nominal */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Nominal (Rp)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">Rp</span>
                  <FormattedNumberInput
                    placeholder="0"
                    value={recAmount}
                    onChange={(val) => setRecAmount(val)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 font-extrabold"
                    required
                  />
                </div>
              </div>

              {/* Rekening */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Rekening Sumber / Target
                </label>
                <select
                  value={recAccountId}
                  onChange={(e) => setRecAccountId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-800"
                >
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({formatterIDR.format(acc.currentBalance)})
                    </option>
                  ))}
                </select>
              </div>

              {/* Tanggal Eksekusi Bulanan */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Jatuh Tempo Bulanan (Tanggal 1 - 28)
                </label>
                <select
                  value={recDayOfMonth}
                  onChange={(e) => setRecDayOfMonth(parseInt(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-800"
                >
                  {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                    <option key={day} value={day}>
                      Setiap Tanggal {day} Setiap Bulan
                    </option>
                  ))}
                </select>
              </div>

              {/* Deskripsi */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Catatan Tambahan
                </label>
                <input
                  type="text"
                  placeholder="Keterangan singkat..."
                  value={recDescription}
                  onChange={(e) => setRecDescription(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 font-medium"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowRecModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-lg transition cursor-pointer text-xs"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition cursor-pointer text-xs uppercase tracking-wider shadow-sm"
                >
                  Simpan Jadwal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AI TRANSACTION CLEANUP & AUTO-CATEGORIZATION MODAL */}
      {isCleanupModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 space-y-5 border border-slate-200 shadow-2xl max-h-[90vh] flex flex-col overflow-hidden">
            
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-tr from-amber-500 to-indigo-600 text-white rounded-xl shadow-md">
                  <Sparkles className="h-5 w-5 animate-pulse" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-800 text-sm uppercase tracking-wider">
                    Pembersihan & Auto-Kategorisasi Transaksi AI Gemini
                  </h3>
                  <p className="text-xs text-slate-400 font-medium">
                    Meninjau {uncategorizedTransactions.length} transaksi yang dikategorikan "Lainnya" atau tanpa kategori.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsCleanupModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-xs p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {cleanupSuccessNotice && (
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2.5 animate-fadeIn">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                  <p className="font-bold">{cleanupSuccessNotice}</p>
                </div>
              )}

              {isAnalyzingCleanup ? (
                <div className="py-12 text-center space-y-4 bg-gradient-to-b from-indigo-50/50 to-white rounded-2xl border border-indigo-100">
                  <RefreshCw className="h-8 w-8 text-indigo-600 animate-spin mx-auto" />
                  <div className="space-y-1">
                    <p className="font-bold text-slate-800 text-sm">AI Gemini Sedang Menganalisis Transaksi...</p>
                    <p className="text-xs text-slate-500 max-w-md mx-auto">
                      AI sedang mengevaluasi deskripsi, nominal, dan konteks belanja untuk menemukan kategori paling presisi.
                    </p>
                  </div>
                </div>
              ) : uncategorizedTransactions.length === 0 ? (
                <div className="py-10 text-center space-y-3 bg-slate-50 rounded-2xl border border-slate-200 text-slate-500">
                  <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
                  <p className="font-bold text-slate-800 text-sm">Semua Transaksi Sudah Berkategori Rapi!</p>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    Tidak ditemukan transaksi dengan kategori "Lainnya" atau tanpa kategori. Semua catatan keuangan Anda sudah dikelompokkan dengan baik.
                  </p>
                </div>
              ) : cleanupSuggestions.length === 0 ? (
                <div className="py-8 text-center space-y-3 bg-indigo-50/40 rounded-2xl border border-indigo-100">
                  <Sparkles className="h-8 w-8 text-indigo-600 mx-auto" />
                  <p className="font-bold text-slate-800 text-sm">Siap Memulai Analisis AI</p>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    Klik tombol di bawah ini untuk memulai pembersihan otomatis {uncategorizedTransactions.length} transaksi yang perlu ditinjau.
                  </p>
                  <button
                    onClick={handleRunCleanupAI}
                    className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-blue-600 hover:brightness-110 text-white font-bold rounded-xl text-xs shadow-md transition cursor-pointer"
                  >
                    Mulai Analisis AI Gemini
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-600 bg-slate-100 p-2.5 rounded-xl border border-slate-200">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={cleanupSuggestions.every(s => s.selected)}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setCleanupSuggestions(prev => prev.map(s => ({ ...s, selected: checked })));
                        }}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4 cursor-pointer"
                      />
                      <span>Pilih Semua ({cleanupSuggestions.filter(s => s.selected).length} dari {cleanupSuggestions.length} Transaksi)</span>
                    </div>

                    <button
                      onClick={handleRunCleanupAI}
                      className="flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 font-extrabold cursor-pointer"
                    >
                      <RefreshCw className="h-3 w-3" />
                      Analisis Ulang
                    </button>
                  </div>

                  <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                    {cleanupSuggestions.map((item, idx) => {
                      const originalTx = transactions.find(t => t.id === item.id);
                      if (!originalTx) return null;

                      return (
                        <div
                          key={item.id || idx}
                          className={`p-3.5 rounded-xl border transition-all ${
                            item.selected
                              ? 'bg-white border-indigo-200 shadow-xs'
                              : 'bg-slate-50 border-slate-200 opacity-60'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3 min-w-0">
                              <input
                                type="checkbox"
                                checked={item.selected}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  setCleanupSuggestions(prev => prev.map(s => s.id === item.id ? { ...s, selected: checked } : s));
                                }}
                                className="mt-1 rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4 cursor-pointer shrink-0"
                              />

                              <div className="min-w-0 space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-extrabold text-xs text-slate-800">{originalTx.description || 'Tanpa Keterangan'}</span>
                                  <span className="font-mono font-bold text-xs text-slate-600">{formatterIDR.format(originalTx.amount)}</span>
                                  <span className="text-[10px] text-slate-400">({originalTx.date})</span>
                                </div>

                                <div className="flex items-center gap-2 text-xs flex-wrap">
                                  <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded font-semibold text-[10px]">
                                    Kategori Lama: {item.originalCategory}
                                  </span>
                                  <span className="text-slate-400 font-bold">→</span>
                                  <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-md font-bold text-xs shadow-2xs flex items-center gap-1">
                                    <Sparkles className="h-3 w-3 text-emerald-600" />
                                    {item.suggestedCategory}
                                  </span>
                                </div>

                                <p className="text-[11px] text-indigo-900/80 italic bg-indigo-50/50 p-1.5 rounded-md border border-indigo-100/60 mt-1">
                                  💡 {item.reason}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-100 shrink-0">
              <button
                type="button"
                onClick={() => setIsCleanupModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl transition cursor-pointer text-xs"
              >
                Batal
              </button>

              {cleanupSuggestions.length > 0 && (
                <button
                  type="button"
                  onClick={handleApplyCleanupBatch}
                  disabled={cleanupSuggestions.filter(s => s.selected).length === 0}
                  className="px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:brightness-110 disabled:opacity-40 text-white font-extrabold rounded-xl transition cursor-pointer text-xs uppercase tracking-wider shadow-md flex items-center gap-1.5"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Terapkan ({cleanupSuggestions.filter(s => s.selected).length} Perubahan)
                </button>
              )}
            </div>

          </div>
        </div>
      )}

      {/* IN-APP CONFIRMATION MODAL: DELETE RECURRING */}
      {deleteRecurringConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-rose-100 text-rose-600 rounded-xl shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <h4 className="font-extrabold text-sm text-slate-800">Hapus Jadwal Rutin?</h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Apakah Anda yakin ingin menghapus jadwal transaksi rutin <strong>"{deleteRecurringConfirm.title}"</strong>?
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeleteRecurringConfirm(null)}
                className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteRecurringTransaction && onDeleteRecurringTransaction(deleteRecurringConfirm.id);
                  showToast({
                    type: 'success',
                    title: 'Jadwal Rutin Dihapus',
                    message: `Jadwal '${deleteRecurringConfirm.title}' berhasil dihapus.`,
                  });
                  setDeleteRecurringConfirm(null);
                }}
                className="px-4 py-2 rounded-xl text-xs font-extrabold text-white bg-rose-600 hover:bg-rose-700 transition cursor-pointer shadow-xs"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
