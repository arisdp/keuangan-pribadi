import { syncToPostgres, syncFromPostgres } from './apiClient';
import { GlobalToastContainer } from './components/GlobalToastContainer';
import { GlobalUserMenu } from './components/GlobalUserMenu';
import { SyncConflictModal } from './components/SyncConflictModal';
import { SyncDataPackage, detectDataConflict } from './utils/syncConflictDetector';
import { showToast } from './utils/toast';
import { formatCurrencyIDR } from './utils/formatters';
import {
  applyAccountBalanceChange,
  applyCreditBillPayment,
  applyTransactionsToAccounts,
  buildBatchSyncedFixedAssetDepreciationAdjustments,
  buildSyncedFixedAssetDepreciationAdjustment,
  calculateTotalEmergencyFund,
  calculateTotalLiquidCash,
  computePendingYearEndFixedAssetDepreciations,
  createAccountRecord,
  getAccountCreditBill,
  getLiquidAccounts,
  getTransactionAccountDelta,
  isCreditAccount,
  normalizeAbsAmount,
  resolveDebtInstallmentAccounting,
  syncKprDebtsToFixedAssets,
  toLocalYYYYMMDD,
  updateAccountMetadataAndStartingBalance,
} from './utils/accountingEngine';
import { secureStorage } from './utils/secureStorage';
import {
  detect7DayFrequencyVelocityAlerts,
  detectCategorySpendingAnomalies,
} from './utils/anomalyDetection';
import { AnomalyTopSummaryTooltip } from './components/AnomalyTopSummaryTooltip';
import { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Transaction, 
  Account, 
  AccountType,
  CategoryBudget, 
  Debt, 
  EmergencyFundConfig, 
  EmergencyFundTransaction,
  FixedAsset,
  FixedAssetAdjustment,
  FixedAssetCategory,
  InvestmentAsset,
  InvestmentGoal,
  User,
  RecurringTransaction,
  SavingsGoal,
  KprPreset,
  KprCoaMappingConfig
} from './types';
import { buildJournalLedger } from './utils/accountingLedger';
import {
  DEFAULT_KPR_COA_MAPPING,
  DEFAULT_KPR_PRESETS,
  saveStoredKprPresets,
  resetStoredKprPresets,
  saveStoredKprCoaMapping,
  resetStoredKprCoaMapping,
  resolveEffectiveKprCoaMapping,
} from './utils/kprPresets';
import { 
  INITIAL_ACCOUNTS, 
  INITIAL_BUDGETS, 
  INITIAL_TRANSACTIONS, 
  INITIAL_DEBTS, 
  INITIAL_EMERGENCY_CONFIG, 
  INITIAL_EMERGENCY_TXS,
  INITIAL_INVESTMENTS,
  INITIAL_RECURRING_TRANSACTIONS
} from './initialData';
import { 
  CategoryNode, 
  DEFAULT_CATEGORY_HIERARCHY, 
  mergeMissingDefaultCategories,
  saveStoredCategories 
} from './categoryHierarchy';

import { DashboardTab } from './components/DashboardTab';
import { TransactionsTab } from './components/TransactionsTab';
import { BudgetTab } from './components/BudgetTab';
import { EmergencyFundTab } from './components/EmergencyFundTab';
import { DebtTab } from './components/DebtTab';
import { AiAnalysisTab } from './components/AiAnalysisTab';
import { AccountsTab } from './components/AccountsTab';
import { InvestmentTab } from './components/InvestmentTab';
import { LoginScreen } from './components/LoginScreen';
import { OnboardingModal } from './components/OnboardingModal';
import { ReportsTab } from './components/ReportsTab';
import { AdjustingEntryDraft } from './components/AdjustingEntriesPanel';
import { MasterCategoryManager } from './components/MasterCategoryManager';
import { ErrorBoundary } from './components/ErrorBoundary';
import { BackupDataModal } from './components/BackupDataModal';
import { AccountingIntegrityModal } from './components/AccountingIntegrityModal';
import { DEFAULT_INVESTMENT_GOALS } from './components/InvestmentGoalSection';
import {
  validateMasterIntegrityOnLoad,
  getStoredCoaList,
  getAccountCoaMapping,
  factoryResetMasterData,
  DEFAULT_COA_LIST,
  scanCoaDuplicatesAndUnused,
  CoaScanResult,
  AccountCOA,
  MasterChangeLog,
  getMasterChangeLogs,
  hydrateMasterCoaAndLogs,
  subscribeMasterConfigUpdates,
} from './coaUtils';
import { motion, AnimatePresence } from 'motion/react';
import { useTheme } from './ThemeContext';
import { 
  isGoogleSheetsSyncActive, 
  uploadFinancesToSheets, 
  downloadFinancesFromSheets, 
  logoutGoogleSheets 
} from './googleSheets';

import { 
  TrendingUp, 
  TrendingDown, 
  LayoutDashboard, 
  ArrowRightLeft, 
  Settings, 
  PiggyBank, 
  Activity, 
  Sparkles, 
  Coins, 
  Menu, 
  X,
  CreditCard,
  LogOut,
  HelpCircle,
  Sun,
  Moon,
  Shield,
  ShieldCheck,
  BookOpen,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  FolderTree,
  Database,
  RefreshCw
} from 'lucide-react';

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const mainScrollRef = useRef<HTMLDivElement | null>(null);

  const scrollWorkspaceToTop = () => {
    mainScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // --- 1. CURRENT USER SESSION ---
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = secureStorage.getItem('fin_current_user');
    return saved ? JSON.parse(saved) : null;
  });

  // --- 2. CORE STATES (IN-MEMORY, AUTHORITATIVELY HYDRATED FROM POSTGRESQL) ---
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [budgets, setBudgets] = useState<CategoryBudget[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [investments, setInvestments] = useState<InvestmentAsset[]>([]);
  const [fixedAssets, setFixedAssets] = useState<FixedAsset[]>([]);
  const [emergencyConfig, setEmergencyConfig] = useState<EmergencyFundConfig>({
    jobStability: 'medium',
    dependents: 0,
    monthlyExpense: 0,
  });
  const [emergencyTransactions, setEmergencyTransactions] = useState<EmergencyFundTransaction[]>([]);

  // --- MASTER DATA & CONFIG STATES (POSTGRESQL BACKED) ---
  const [masterCategories, setMasterCategories] = useState<CategoryNode[]>(DEFAULT_CATEGORY_HIERARCHY);
  const [coaList, setCoaList] = useState<AccountCOA[]>(() => [...DEFAULT_COA_LIST]);
  const [masterChangeLogs, setMasterChangeLogs] = useState<MasterChangeLog[]>([]);
  const [kprPresets, setKprPresets] = useState<KprPreset[]>(DEFAULT_KPR_PRESETS);
  const [kprCoaMapping, setKprCoaMapping] = useState<KprCoaMappingConfig>(DEFAULT_KPR_COA_MAPPING);
  const [investmentGoals, setInvestmentGoals] = useState<InvestmentGoal[]>([]);
  const journalLedger = useMemo(
    () => buildJournalLedger(transactions, accounts, coaList),
    [transactions, accounts, coaList]
  );

  useEffect(() => {
    saveStoredCategories(masterCategories);
  }, [masterCategories]);

  useEffect(() => {
    saveStoredKprPresets(kprPresets);
  }, [kprPresets]);

  useEffect(() => {
    saveStoredKprCoaMapping(kprCoaMapping);
  }, [kprCoaMapping]);

  useEffect(() => {
    const unsubscribe = subscribeMasterConfigUpdates(() => {
      const latestCoas = getStoredCoaList();
      setCoaList((prev) => (JSON.stringify(prev) === JSON.stringify(latestCoas) ? prev : latestCoas));
      const latestLogs = getMasterChangeLogs();
      setMasterChangeLogs((prev) => (JSON.stringify(prev) === JSON.stringify(latestLogs) ? prev : latestLogs));
    });
    return unsubscribe;
  }, []);

  // --- RECURRING TRANSACTIONS STATE ---
  const [recurringTransactions, setRecurringTransactions] = useState<RecurringTransaction[]>([]);

  // Sync recurring transactions to Service Worker (sw.js) for local push notifications (due <= 3 days)
  useEffect(() => {
    if ('serviceWorker' in navigator && recurringTransactions && recurringTransactions.length > 0) {
      const notifySW = () => {
        const payload = {
          type: 'CHECK_RECURRING_DUE',
          recurringTransactions
        };
        if (navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage(payload);
        } else {
          navigator.serviceWorker.ready.then((reg) => {
            reg.active?.postMessage(payload);
          }).catch(() => {});
        }
      };

      notifySW();

      const handleFocus = () => notifySW();
      window.addEventListener('focus', handleFocus);
      return () => window.removeEventListener('focus', handleFocus);
    }
  }, [recurringTransactions]);

  // --- SAVINGS GOALS (GOAL TRACKER) STATE ---
  const [savingsGoals, setSavingsGoals] = useState<SavingsGoal[]>([]);

  const handleAddSavingsGoal = (newGoal: Omit<SavingsGoal, 'id'>) => {
    const goal: SavingsGoal = {
      ...newGoal,
      id: `goal-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    };
    setSavingsGoals((prev) => [goal, ...prev]);
  };

  const handleUpdateSavingsGoal = (id: string, updated: Partial<SavingsGoal>) => {
    setSavingsGoals((prev) =>
      prev.map((g) => (g.id === id ? { ...g, ...updated } : g))
    );
  };

  const handleDeleteSavingsGoal = (id: string) => {
    setSavingsGoals((prev) => prev.filter((g) => g.id !== id));
  };

  const handleDepositSavingsGoal = (id: string, amount: number) => {
    setSavingsGoals((prev) =>
      prev.map((g) =>
        g.id === id ? { ...g, currentAmount: g.currentAmount + amount } : g
      )
    );
  };

  // --- Cloud & PostgreSQL Authoritative Sync State ---
  const [cloudSync, setCloudSync] = useState<boolean>(false);
  const [loadingPg, setLoadingPg] = useState<boolean>(false);
  const [isPgHydrated, setIsPgHydrated] = useState<boolean>(false);
  const [pgHydrationError, setPgHydrationError] = useState<string | null>(null);
  const [pgReloadCounter, setPgReloadCounter] = useState<number>(0);
  const [loadingCloudData, setLoadingCloudData] = useState<boolean>(false);
  const pendingInitialSeedRef = useRef<'empty' | 'sample' | null>(null);

  // Automatic scheduled transaction processing after PostgreSQL hydration
  useEffect(() => {
    if (!currentUser || loadingPg || !isPgHydrated || recurringTransactions.length === 0) return;

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const currentDay = now.getDate();
    const currentYM = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

    let newTxsToAdd: Transaction[] = [];
    let updatedAccounts = [...accounts];
    let updatedRecurring = [...recurringTransactions];
    let hasChanges = false;

    updatedRecurring = updatedRecurring.map((rec) => {
      if (!rec.isActive) return rec;

      const isProcessedThisMonth = rec.lastProcessedDate && rec.lastProcessedDate.startsWith(currentYM);
      if (isProcessedThisMonth) return rec;

      if (currentDay >= rec.dayOfMonth) {
        const scheduledDayStr = String(Math.min(rec.dayOfMonth, 28)).padStart(2, '0');
        const txDate = `${currentYM}-${scheduledDayStr}`;

        const normalizedRecAmt = normalizeAbsAmount(rec.amount);
        const newTx: Transaction = {
          id: `tx-rec-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          date: txDate,
          accountId: rec.accountId,
          type: rec.type,
          category: rec.category,
          description: `[Jadwal Otomatis] ${rec.title}${rec.description ? ` - ${rec.description}` : ''}`,
          amount: normalizedRecAmt,
        };

        newTxsToAdd.push(newTx);

        // Adjust target account balance using centralized accounting engine
        updatedAccounts = updatedAccounts.map((acc) => {
          if (acc.id === rec.accountId) {
            return applyAccountBalanceChange(acc, getTransactionAccountDelta(newTx));
          }
          return acc;
        });

        hasChanges = true;
        return {
          ...rec,
          lastProcessedDate: txDate,
        };
      }

      return rec;
    });

    if (hasChanges && newTxsToAdd.length > 0) {
      setTransactions((prev) => [...newTxsToAdd, ...prev]);
      setAccounts(updatedAccounts);
      setRecurringTransactions(updatedRecurring);
    }
  }, [currentUser, loadingPg, isPgHydrated]);

  // UI Navigation states & Grouped Sub-menus
  const NAV_GROUPS = [
    {
      groupName: 'Ringkasan & Analisis',
      items: [
        { id: 'dashboard', label: 'Dashboard Utama', icon: LayoutDashboard },
        { id: 'ai-analysis', label: 'Asisten Cerdas AI', icon: Sparkles, isAi: true, badge: 'AI' },
        { id: 'reports', label: 'Laporan & Akuntansi', icon: BookOpen },
      ],
    },
    {
      groupName: 'Operasional Harian',
      items: [
        { id: 'transactions', label: 'Jurnal Transaksi', icon: ArrowRightLeft },
      ],
    },
    {
      groupName: 'Perencanaan & Anggaran',
      items: [
        { id: 'budget', label: 'Rencana Anggaran', icon: Settings },
        { id: 'emergency-fund', label: 'Dana Darurat', icon: PiggyBank },
      ],
    },
    {
      groupName: 'Portofolio & Utang',
      items: [
        { id: 'investments', label: 'Investasi & Portofolio', icon: TrendingUp },
        { id: 'debts', label: 'Perhitungan Utang & KPR', icon: CreditCard },
      ],
    },
    {
      groupName: 'Master Data & Konfigurasi Keuangan',
      items: [
        { id: 'accounts', label: 'Master Akun & Rekening', icon: Coins },
        { id: 'master-categories', label: 'Master Kategori & COA', icon: FolderTree },
      ],
    },
  ];

  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [pendingPayDebtId, setPendingPayDebtId] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [openNavGroups, setOpenNavGroups] = useState<Record<string, boolean>>({
    'Ringkasan & Analisis': true,
    'Operasional Harian': true,
    'Perencanaan & Anggaran': true,
    'Portofolio & Utang': true,
    'Master Data & Konfigurasi Keuangan': true,
  });

  const toggleNavGroup = (groupName: string) => {
    setOpenNavGroups((prev) => ({
      ...prev,
      [groupName]: !prev[groupName],
    }));
  };

  // Modals for Logout, Reset Data, and Encrypted Backup
  const [showLogoutModal, setShowLogoutModal] = useState<boolean>(false);
  const [showResetDataModal, setShowResetDataModal] = useState<boolean>(false);
  const [resetConfirmText, setResetConfirmText] = useState<string>('');
  const [isResettingData, setIsResettingData] = useState<boolean>(false);
  const [showBackupModal, setShowBackupModal] = useState<boolean>(false);
  const [showIntegrityModal, setShowIntegrityModal] = useState<boolean>(false);
  const startupIntegrityCheckedUserRef = useRef<string | null>(null);

  // --- CENTRALIZED COA & LEDGER ANOMALY SCAN STATE (LIFTED) ---
  const [coaScanResult, setCoaScanResult] = useState<CoaScanResult>(() =>
    scanCoaDuplicatesAndUnused(DEFAULT_COA_LIST, [], [])
  );

  const handleRescanCoa = (): CoaScanResult => {
    const freshScan = scanCoaDuplicatesAndUnused(coaList, accounts, transactions);
    setCoaScanResult(freshScan);
    return freshScan;
  };

  useEffect(() => {
    setCoaScanResult(scanCoaDuplicatesAndUnused(coaList, accounts, transactions));
  }, [coaList, accounts, transactions, showIntegrityModal, activeTab]);

  // --- AUTOMATIC DATA INTEGRITY VALIDATION ON APPLICATION LOAD (POST-POSTGRES HYDRATION) ---
  useEffect(() => {
    if (!currentUser || !isPgHydrated || (accounts.length === 0 && transactions.length === 0)) return;
    if (startupIntegrityCheckedUserRef.current === currentUser.username) return;
    startupIntegrityCheckedUserRef.current = currentUser.username;

    const result = validateMasterIntegrityOnLoad(accounts, coaList, transactions);

    // If orphaned accounts, unlinked COAs, orphaned transactions, or duplicate ledger entries exist, prompt user
    if (!result.isValid || result.totalIssuesCount > 0) {
      setShowIntegrityModal(true);
    }
  }, [currentUser, isPgHydrated, accounts, transactions, coaList]);

  const handleRestoreData = (restoredData: any) => {
    if (!currentUser) return;

    if (Array.isArray(restoredData.transactions)) {
      setTransactions(restoredData.transactions);
    }
    if (Array.isArray(restoredData.accounts)) {
      setAccounts(restoredData.accounts);
    }
    if (Array.isArray(restoredData.budgets)) {
      setBudgets(restoredData.budgets);
    }
    if (Array.isArray(restoredData.debts)) {
      setDebts(restoredData.debts);
    }
    if (Array.isArray(restoredData.investments)) {
      setInvestments(restoredData.investments);
    }
    if (Array.isArray(restoredData.fixedAssets)) {
      setFixedAssets(restoredData.fixedAssets);
    }
    if (restoredData.emergencyConfig) {
      setEmergencyConfig(restoredData.emergencyConfig);
    }
    if (Array.isArray(restoredData.emergencyTransactions)) {
      setEmergencyTransactions(restoredData.emergencyTransactions);
    }
    if (Array.isArray(restoredData.masterCategories)) {
      const mergedCats = mergeMissingDefaultCategories(restoredData.masterCategories);
      setMasterCategories(mergedCats);
      saveStoredCategories(mergedCats);
    }
    if (Array.isArray(restoredData.recurringTransactions)) {
      setRecurringTransactions(restoredData.recurringTransactions);
    }
    if (Array.isArray(restoredData.savingsGoals)) {
      setSavingsGoals(restoredData.savingsGoals);
    }
    if (Array.isArray(restoredData.coaList)) {
      hydrateMasterCoaAndLogs(restoredData.coaList, restoredData.masterChangeLogs || masterChangeLogs, true);
    }
    if (Array.isArray(restoredData.kprPresets)) {
      setKprPresets(restoredData.kprPresets);
    }
    if (restoredData.kprCoaMapping && typeof restoredData.kprCoaMapping === 'object') {
      setKprCoaMapping({ ...DEFAULT_KPR_COA_MAPPING, ...restoredData.kprCoaMapping });
    }
    if (Array.isArray(restoredData.investmentGoals)) {
      setInvestmentGoals(restoredData.investmentGoals);
    }
  };

  // Onboarding Tutorial State
  const [showOnboarding, setShowOnboarding] = useState<boolean>(false);

  useEffect(() => {
    if (currentUser) {
      const seen = secureStorage.getItem(`fin_${currentUser.username}_onboarding_seen`);
      if (!seen) {
        setShowOnboarding(true);
      }
    }
  }, [currentUser]);

  // Sync Conflict Modal State (retained for optional Google Sheets cloud resolution)
  const [conflictState, setConflictState] = useState<{
    isOpen: boolean;
    localData: SyncDataPackage;
    cloudData: SyncDataPackage;
  }>({
    isOpen: false,
    localData: {},
    cloudData: {}
  });

  const applySyncPackage = (pkg: SyncDataPackage & Record<string, any>) => {
    const nextTransactions = Array.isArray(pkg.transactions) ? pkg.transactions : [];
    const rawAccounts = Array.isArray(pkg.accounts) ? pkg.accounts : [];
    const nextBudgets = Array.isArray(pkg.budgets) ? pkg.budgets : [];
    const nextDebts = Array.isArray(pkg.debts) ? pkg.debts : [];
    const nextInvestments = Array.isArray(pkg.investments) ? pkg.investments : [];
    const nextFixedAssets = syncKprDebtsToFixedAssets(
      Array.isArray(pkg.fixedAssets) ? pkg.fixedAssets : [],
      nextDebts
    );
    const nextEmergencyConfig = pkg.emergencyConfig || { jobStability: 'medium', dependents: 0, monthlyExpense: 0 };
    const nextEmergencyTxs = Array.isArray(pkg.emergencyTransactions) ? pkg.emergencyTransactions : [];
    const nextRecurring = Array.isArray(pkg.recurringTransactions) ? pkg.recurringTransactions : [];
    const nextSavingsGoals = Array.isArray(pkg.savingsGoals) ? pkg.savingsGoals : [];

    const nextMasterCategories =
      Array.isArray(pkg.masterCategories) && pkg.masterCategories.length > 0
        ? mergeMissingDefaultCategories(pkg.masterCategories)
        : DEFAULT_CATEGORY_HIERARCHY;
    const nextKprPresets =
      Array.isArray(pkg.kprPresets) && pkg.kprPresets.length > 0
        ? pkg.kprPresets
        : DEFAULT_KPR_PRESETS;
    const nextKprCoaMapping =
      pkg.kprCoaMapping && typeof pkg.kprCoaMapping === 'object'
        ? { ...DEFAULT_KPR_COA_MAPPING, ...pkg.kprCoaMapping }
        : DEFAULT_KPR_COA_MAPPING;
    const nextCoaList =
      Array.isArray(pkg.coaList) && pkg.coaList.length > 0
        ? pkg.coaList
        : [...DEFAULT_COA_LIST];
    const earliestTransactionDateByAccount = new Map<string, string>();
    nextTransactions.forEach((transaction) => {
      if (!transaction.accountId || !transaction.date) return;
      const current = earliestTransactionDateByAccount.get(transaction.accountId);
      if (!current || transaction.date < current) {
        earliestTransactionDateByAccount.set(transaction.accountId, transaction.date);
      }
    });
    const nextAccounts = rawAccounts.map((account) => {
      const openingMetadata = {
        openingDate:
          account.openingDate ||
          earliestTransactionDateByAccount.get(account.id) ||
          toLocalYYYYMMDD(),
        openingBalanceEntryId: account.openingBalanceEntryId || `opening-${account.id}`,
      };
      if (!isCreditAccount(account)) return { ...account, ...openingMetadata };
      const currentBalance = Number(account.currentBalance);
      const limit = normalizeAbsAmount(account.creditLimit ?? account.startingBalance);
      const recordedAvailableLimit = Number.isFinite(currentBalance)
        ? currentBalance
        : Math.max(0, limit - normalizeAbsAmount(account.usedLimit));
      const historicalBalanceMovement = nextTransactions.reduce((movement, transaction) => {
        if (transaction.accountId === account.id) {
          return movement + getTransactionAccountDelta(transaction);
        }
        if (
          transaction.linkedDebtAction === 'pay' &&
          transaction.linkedDebtId === `acc-debt-${account.id}`
        ) {
          return movement + getTransactionAccountDelta({ type: 'income', amount: transaction.amount });
        }
        return movement;
      }, 0);
      const legacyInitialDebt = Math.max(0, limit + historicalBalanceMovement - recordedAvailableLimit);
      return {
        ...account,
        ...openingMetadata,
        initialDebt:
          account.initialDebt != null && Number.isFinite(Number(account.initialDebt))
            ? normalizeAbsAmount(account.initialDebt)
            : legacyInitialDebt,
        usedLimit: Math.max(0, limit - recordedAvailableLimit),
      };
    });
    const nextJournalLedger = buildJournalLedger(nextTransactions, nextAccounts, nextCoaList);
    const nextChangeLogs = Array.isArray(pkg.masterChangeLogs) ? pkg.masterChangeLogs : [];
    const nextInvestmentGoals = Array.isArray(pkg.investmentGoals) ? pkg.investmentGoals : [];

    setTransactions(nextTransactions);
    setAccounts(nextAccounts);
    setBudgets(nextBudgets);
    setDebts(nextDebts);
    setInvestments(nextInvestments);
    setFixedAssets(nextFixedAssets);
    setEmergencyConfig(nextEmergencyConfig);
    setEmergencyTransactions(nextEmergencyTxs);
    setRecurringTransactions(nextRecurring);
    setSavingsGoals(nextSavingsGoals);

    setMasterCategories(nextMasterCategories);
    saveStoredCategories(nextMasterCategories);
    setKprPresets(nextKprPresets);
    saveStoredKprPresets(nextKprPresets);
    setKprCoaMapping(nextKprCoaMapping);
    saveStoredKprCoaMapping(nextKprCoaMapping);

    hydrateMasterCoaAndLogs(nextCoaList, nextChangeLogs, false);
    setCoaList(getStoredCoaList());
    setMasterChangeLogs(getMasterChangeLogs());
    setInvestmentGoals(nextInvestmentGoals);

    return {
      transactions: nextTransactions,
      accounts: nextAccounts,
      budgets: nextBudgets,
      debts: nextDebts,
      investments: nextInvestments,
      fixedAssets: nextFixedAssets,
      recurringTransactions: nextRecurring,
      savingsGoals: nextSavingsGoals,
      emergencyConfig: nextEmergencyConfig,
      emergencyTransactions: nextEmergencyTxs,
      coaList: getStoredCoaList(),
      masterCategories: nextMasterCategories,
      kprPresets: nextKprPresets,
      kprCoaMapping: nextKprCoaMapping,
      masterChangeLogs: getMasterChangeLogs(),
      investmentGoals: nextInvestmentGoals,
      journalEntries: nextJournalLedger.entries,
      journalLines: nextJournalLedger.lines,
    };
  };

  useEffect(() => {
    // Check if google sheets auth is active initially
    setCloudSync(isGoogleSheetsSyncActive());
  }, [currentUser]);

  const lastPgSyncSignatureRef = useRef<string>('');
  const lastSheetsSyncSignatureRef = useRef<string>('');
  const transactionsRef = useRef<Transaction[]>(transactions);
  transactionsRef.current = transactions;

  // Authoritative Download from PostgreSQL on login / reload (NEVER loads browser financial cache or overwrites with sample)
  useEffect(() => {
    if (!currentUser) {
      setIsPgHydrated(false);
      setPgHydrationError(null);
      return;
    }

    const activeUserId = currentUser.uid || (currentUser as any).id || `user-${currentUser.username}`;
    let cancelled = false;

    const loadPgData = async () => {
      setLoadingPg(true);
      setIsPgHydrated(false);
      setPgHydrationError(null);

      try {
        const pgData = await syncFromPostgres(activeUserId);
        if (cancelled) return;

        if (!pgData || pgData._syncError) {
          setPgHydrationError(
            pgData?._syncErrorMessage || 'Gagal terhubung ke database PostgreSQL untuk memuat data keuangan Anda.'
          );
          return;
        }

        const pendingSeed = pendingInitialSeedRef.current;
        pendingInitialSeedRef.current = null;

        // Seed ONLY during brand-new account registration when PostgreSQL has no saved state yet
        if (pendingSeed && !pgData.hasSavedState) {
          const starterPkg =
            pendingSeed === 'sample'
              ? {
                  transactions: INITIAL_TRANSACTIONS,
                  accounts: INITIAL_ACCOUNTS,
                  budgets: INITIAL_BUDGETS,
                  debts: INITIAL_DEBTS,
                  investments: INITIAL_INVESTMENTS,
                  fixedAssets: syncKprDebtsToFixedAssets([], INITIAL_DEBTS),
                  recurringTransactions: INITIAL_RECURRING_TRANSACTIONS,
                  savingsGoals: [
                    {
                      id: 'goal-1',
                      title: 'Dana Liburan Akhir Tahun',
                      targetAmount: 15000000,
                      currentAmount: 6500000,
                      targetDate: '2026-12-25',
                      category: 'Liburan',
                      notes: 'Target menabung bulanan Rp 1.500.000'
                    },
                    {
                      id: 'goal-2',
                      title: 'DP Rumah Impian',
                      targetAmount: 100000000,
                      currentAmount: 42000000,
                      targetDate: '2028-06-01',
                      category: 'Rumah',
                      notes: 'Alokasi dari bonus tahunan & simpanan rutin'
                    }
                  ],
                  emergencyConfig: INITIAL_EMERGENCY_CONFIG,
                  emergencyTransactions: INITIAL_EMERGENCY_TXS,
                  coaList: [...DEFAULT_COA_LIST],
                  masterCategories: DEFAULT_CATEGORY_HIERARCHY,
                  kprPresets: DEFAULT_KPR_PRESETS,
                  kprCoaMapping: DEFAULT_KPR_COA_MAPPING,
                  masterChangeLogs: [],
                  investmentGoals: DEFAULT_INVESTMENT_GOALS,
                }
              : (() => {
                  const { cleanAccounts, cleanBudgets, cleanEmergencyConfig } = getDefaultCleanStarterData();
                  return {
                    transactions: [],
                    accounts: cleanAccounts,
                    budgets: cleanBudgets,
                    debts: [],
                    investments: [],
                    fixedAssets: [],
                    recurringTransactions: [],
                    savingsGoals: [],
                    emergencyConfig: cleanEmergencyConfig,
                    emergencyTransactions: [],
                    coaList: [...DEFAULT_COA_LIST],
                    masterCategories: DEFAULT_CATEGORY_HIERARCHY,
                    kprPresets: DEFAULT_KPR_PRESETS,
                    kprCoaMapping: DEFAULT_KPR_COA_MAPPING,
                    masterChangeLogs: [],
                    investmentGoals: [],
                  };
                })();

          const applied = applySyncPackage(starterPkg);
          const payloadToSave = {
            ...applied,
            userFullName: currentUser.fullName,
            username: currentUser.username,
          };
          lastPgSyncSignatureRef.current = `${activeUserId}:${JSON.stringify(payloadToSave)}`;
          await syncToPostgres(payloadToSave, activeUserId);
          if (!cancelled) {
            setIsPgHydrated(true);
          }
          return;
        }

        // Standard authoritative hydration from PostgreSQL
        const applied = applySyncPackage(pgData);
        const hydratedPayload = {
          ...applied,
          userFullName: currentUser.fullName,
          username: currentUser.username,
        };
        lastPgSyncSignatureRef.current =
          Array.isArray(pgData.journalEntries) && Array.isArray(pgData.journalLines)
            ? `${activeUserId}:${JSON.stringify(hydratedPayload)}`
            : '';
        setIsPgHydrated(true);
      } catch (err: any) {
        if (!cancelled) {
          setPgHydrationError(err?.message || 'Terjadi kesalahan saat memuat data dari PostgreSQL.');
        }
      } finally {
        if (!cancelled) {
          setLoadingPg(false);
        }
      }
    };

    loadPgData();
    return () => {
      cancelled = true;
    };
  }, [currentUser, pgReloadCounter]);

  // Debounced upload to PostgreSQL on state change + signature deduplication
  useEffect(() => {
    if (!currentUser || loadingPg || !isPgHydrated || pgHydrationError) return;
    const activeUserId = currentUser.uid || (currentUser as any).id || `user-${currentUser.username}`;
    const timer = setTimeout(() => {
      const payload = {
        transactions,
        accounts,
        budgets,
        debts,
        investments,
        fixedAssets,
        recurringTransactions,
        savingsGoals,
        emergencyConfig,
        emergencyTransactions,
        coaList,
        masterCategories,
        kprPresets,
        kprCoaMapping,
        masterChangeLogs,
        investmentGoals,
        journalEntries: journalLedger.entries,
        journalLines: journalLedger.lines,
        userFullName: currentUser.fullName,
        username: currentUser.username
      };
      const signature = `${activeUserId}:${JSON.stringify(payload)}`;
      if (signature === lastPgSyncSignatureRef.current) return;
      lastPgSyncSignatureRef.current = signature;

      syncToPostgres(payload, activeUserId).then((res) => {
        if (!res?.success) {
          lastPgSyncSignatureRef.current = '';
        }
      }).catch(() => {
        lastPgSyncSignatureRef.current = '';
      });
    }, 450);

    return () => clearTimeout(timer);
  }, [
    transactions,
    accounts,
    budgets,
    debts,
    investments,
    fixedAssets,
    recurringTransactions,
    savingsGoals,
    emergencyConfig,
    emergencyTransactions,
    coaList,
    masterCategories,
    kprPresets,
    kprCoaMapping,
    masterChangeLogs,
    investmentGoals,
    journalLedger,
    currentUser,
    loadingPg,
    isPgHydrated,
    pgHydrationError
  ]);

  // Optional Google Sheets sync: download only when Postgres is already hydrated and Sheets is enabled
  useEffect(() => {
    if (currentUser && cloudSync && isPgHydrated) {
      const loadCloudData = async () => {
        setLoadingCloudData(true);
        try {
          const cloudData = await downloadFinancesFromSheets();
          if (cloudData) {
            const currentPgPkg: SyncDataPackage = {
              transactions,
              accounts,
              budgets,
              debts,
              investments,
              fixedAssets,
              emergencyConfig,
              emergencyTransactions,
              journalEntries: journalLedger.entries,
              journalLines: journalLedger.lines,
            };
            if (detectDataConflict(currentPgPkg, cloudData)) {
              setConflictState({
                isOpen: true,
                localData: currentPgPkg,
                cloudData: {
                  ...cloudData,
                  emergencyConfig: cloudData.emergencyFund || emergencyConfig,
                },
              });
            }
          }
        } catch {
          // Ignore cloud sync read errors silently
        } finally {
          setLoadingCloudData(false);
        }
      };
      loadCloudData();
    }
  }, [currentUser, cloudSync, isPgHydrated]);

  // Debounced upload to Google Sheets (650ms) + payload signature deduplication
  useEffect(() => {
    if (!currentUser || !cloudSync || loadingCloudData || !isPgHydrated) return;
    const timer = setTimeout(() => {
      const sheetsPayload = {
        transactions,
        accounts,
        budgets,
        debts,
        investments,
        fixedAssets,
        emergencyFund: emergencyConfig,
        emergencyTransactions,
        investmentGoals,
      };
      const signature = `${currentUser.username}:${JSON.stringify(sheetsPayload)}`;
      if (signature === lastSheetsSyncSignatureRef.current) return;
      lastSheetsSyncSignatureRef.current = signature;

      uploadFinancesToSheets(sheetsPayload).catch(() => {
        lastSheetsSyncSignatureRef.current = '';
      });
    }, 650);

    return () => clearTimeout(timer);
  }, [
    transactions,
    accounts,
    budgets,
    debts,
    investments,
    fixedAssets,
    emergencyConfig,
    emergencyTransactions,
    investmentGoals,
    currentUser,
    cloudSync,
    loadingCloudData,
    isPgHydrated
  ]);

  // Sinkronisasi otomatis fasilitas KPR di modul Utang ke daftar Aset Tetap
  useEffect(() => {
    setFixedAssets((prev) => {
      const next = syncKprDebtsToFixedAssets(prev, debts);
      return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
    });
  }, [debts]);

  // Penyesuaian penyusutan aset tetap otomatis jika tanggal mencapai akhir tahun (setelah hidrasi PostgreSQL selesai)
  useEffect(() => {
    if (!currentUser || loadingPg || !isPgHydrated || fixedAssets.length === 0) return;

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const result = computePendingYearEndFixedAssetDepreciations(
      fixedAssets,
      debts,
      transactionsRef.current,
      todayStr
    );

    if (result.postedCount > 0) {
      setTransactions((prev) => {
        const existingIds = new Set(prev.map((t) => t.id));
        const uniqueNewTxs = result.newAdjustingTransactions.filter((t) => !existingIds.has(t.id));
        return uniqueNewTxs.length > 0 ? [...uniqueNewTxs, ...prev] : prev;
      });
      setFixedAssets(result.updatedFixedAssets);
      showToast({
        type: 'info',
        title: 'Penyusutan Akhir Tahun Otomatis Diterapkan',
        message: `${result.postedCount} jurnal penyesuaian penyusutan aset tetap (total ${formatCurrencyIDR(result.totalDepreciationPosted)}) diposting dan nilai buku disinkronkan.`,
        duration: 5000,
      });
    }
  }, [currentUser, loadingPg, isPgHydrated, fixedAssets, debts]);

  // --- 2. CORE ACTION HANDLERS ---

  // Add a standard log transaction
  const handleAddTransaction = (newTx: Omit<Transaction, 'id'> & {
    id?: string;
    linkedDebtId?: string;
    linkedDebtAction?: 'create' | 'pay';
    linkedInvestmentId?: string;
    linkedInvestmentAction?: 'buy' | 'sell';
    linkedFixedAssetId?: string;
    linkedFixedAssetAction?: 'buy';
    unitPrice?: number;
    units?: number;
    unitName?: string;
    newDebtDetails?: {
      name: string;
      interestRate: number;
      minPayment: number;
      purpose: 'productive' | 'consumptive';
      category: string;
      disbursementMode: 'cash' | 'direct_asset' | 'direct_expense';
      disbursementCoaCode?: string;
    };
    newInvestmentDetails?: {
      name: string;
      category: string;
      unitPrice?: number;
      units?: number;
      unitName?: string;
    };
  }): boolean => {
    // Normalisasi Math.abs sejak gerbang masuk agar validasi & delta saldo selalu konsisten
    const normalizedAmount = normalizeAbsAmount(newTx.amount);

    // Protection & validation for unified Debt / KPR installment payment or payoff
    let payTargetLabel = '';
    let isFullDebtPayoff = false;
    let resolvedDebtAccounting: ReturnType<typeof resolveDebtInstallmentAccounting> | null = null;
    if (newTx.linkedDebtAction === 'pay') {
      if (!newTx.linkedDebtId) {
        showToast({
          type: 'warning',
          title: 'Pilih Target Hutang / KPR',
          message: 'Silakan pilih hutang atau cicilan KPR yang ingin dibayar terlebih dahulu.',
          duration: 4500,
        });
        return false;
      }

      if (normalizedAmount <= 0) {
        showToast({
          type: 'warning',
          title: 'Nominal Tidak Valid',
          message: 'Masukkan nominal pembayaran cicilan yang lebih besar dari Rp 0.',
          duration: 4500,
        });
        return false;
      }

      const paymentSource = accounts.find((a) => a.id === newTx.accountId);
      if (!paymentSource) {
        showToast({
          type: 'error',
          title: 'Akun Sumber Tidak Valid',
          message: 'Silakan pilih rekening sumber dana yang valid untuk membayar cicilan.',
          duration: 5000,
        });
        return false;
      }

      if (paymentSource.currentBalance < normalizedAmount) {
        showToast({
          type: 'error',
          title: 'Dana Tidak Mencukupi',
          message: `Saldo ${paymentSource.name} (${formatCurrencyIDR(paymentSource.currentBalance)}) tidak cukup untuk membayar cicilan sebesar ${formatCurrencyIDR(normalizedAmount)}.`,
          duration: 6000,
        });
        return false;
      }

      if (newTx.linkedDebtId.startsWith('acc-debt-')) {
        const targetAccId = newTx.linkedDebtId.replace('acc-debt-', '');
        if (targetAccId === paymentSource.id) {
          showToast({
            type: 'warning',
            title: 'Rekening Pembayar Sama',
            message: 'Pilih rekening kas/bank lain sebagai sumber dana pembayaran tagihan ini.',
            duration: 5000,
          });
          return false;
        }
        const targetDebtAcc = accounts.find((a) => a.id === targetAccId);
        if (!targetDebtAcc) {
          showToast({
            type: 'error',
            title: 'Tagihan Tidak Ditemukan',
            message: 'Data tagihan kartu kredit/paylater tidak ditemukan.',
            duration: 5000,
          });
          return false;
        }
        const currentDebtBal = getAccountCreditBill(targetDebtAcc);
        if (normalizedAmount > currentDebtBal) {
          showToast({
            type: 'warning',
            title: 'Nominal Melebihi Sisa Tagihan',
            message: `Nominal bayar (${formatCurrencyIDR(normalizedAmount)}) melebihi sisa tagihan "${targetDebtAcc.name}" (${formatCurrencyIDR(currentDebtBal)}).`,
            duration: 5000,
          });
          return false;
        }
        payTargetLabel = targetDebtAcc.name;
        isFullDebtPayoff = currentDebtBal - normalizedAmount <= 0;
      } else {
        const matchedDebt = debts.find((d) => d.id === newTx.linkedDebtId);
        if (!matchedDebt) {
          showToast({
            type: 'error',
            title: 'Hutang Tidak Ditemukan',
            message: 'Data hutang atau KPR yang dipilih tidak tersedia atau sudah dihapus.',
            duration: 5000,
          });
          return false;
        }
        const bankCoa = getAccountCoaMapping(paymentSource, getStoredCoaList());
        resolvedDebtAccounting = resolveDebtInstallmentAccounting({
          tx: {
            amount: normalizedAmount,
            date: newTx.date,
            coaDebitCode: newTx.coaDebitCode,
            coaCreditCode: newTx.coaCreditCode,
            linkedKprBreakdown: newTx.linkedKprBreakdown,
          },
          debt: matchedDebt,
          baseCoaMapping: kprCoaMapping,
          sourceAccountCoaCode: bankCoa.code,
        });
        const principalPayAmt = resolvedDebtAccounting.principalPayAmount;
        if (principalPayAmt > matchedDebt.balance) {
          showToast({
            type: 'warning',
            title: 'Pokok Melebihi Sisa Hutang',
            message: `Porsi pokok pembayaran (${formatCurrencyIDR(principalPayAmt)}) melebihi sisa pokok "${matchedDebt.name}" (${formatCurrencyIDR(matchedDebt.balance)}).`,
            duration: 5000,
          });
          return false;
        }
        payTargetLabel = matchedDebt.name;
        isFullDebtPayoff = matchedDebt.balance - principalPayAmt <= 0;
      }
    }

    const txUnitPrice = newTx.unitPrice || newTx.newInvestmentDetails?.unitPrice;
    const txUnits = newTx.units || newTx.newInvestmentDetails?.units;
    const txUnitName = newTx.unitName || newTx.newInvestmentDetails?.unitName;

    const txId = newTx.id || `tx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Pre-generate linked entity IDs so tx carries exact two-way references
    let resolvedDebtId = newTx.linkedDebtId;
    if (newTx.linkedDebtAction === 'create' && newTx.newDebtDetails && !resolvedDebtId) {
      resolvedDebtId = `debt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    }

    let resolvedInvestmentId = newTx.linkedInvestmentId;
    if (newTx.linkedInvestmentAction === 'buy' && newTx.newInvestmentDetails && !resolvedInvestmentId) {
      const nameLower = newTx.newInvestmentDetails.name.toLowerCase().trim();
      const existingInv = investments.find((inv) => inv.name.toLowerCase().trim() === nameLower);
      resolvedInvestmentId = existingInv
        ? existingInv.id
        : `inv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    }

    const isEmergencyAddition =
      newTx.category === 'Tabungan Darurat' && newTx.type === 'saving';
    const isEmergencyReduction = newTx.category === 'Pencairan Dana Darurat';
    const resolvedEmergencyTxId =
      isEmergencyAddition || isEmergencyReduction
        ? `etx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
        : undefined;

    let resolvedCoaDebitCode = resolvedDebtAccounting?.coaDebitCode || newTx.coaDebitCode;
    let resolvedCoaCreditCode = resolvedDebtAccounting?.coaCreditCode || newTx.coaCreditCode;
    if ((!resolvedCoaDebitCode || !resolvedCoaCreditCode) && newTx.linkedDebtAction === 'pay' && resolvedDebtId && !resolvedDebtId.startsWith('acc-debt-')) {
      const targetDebt = debts.find((d) => d.id === resolvedDebtId);
      const isKprDebt = Boolean(targetDebt && (targetDebt.category === 'KPR / Properti' || Boolean(targetDebt.kprScheme)));
      if (isKprDebt && targetDebt) {
        const payAcc = accounts.find((a) => a.id === newTx.accountId);
        const coaList = getStoredCoaList();
        const bankCoa = payAcc ? getAccountCoaMapping(payAcc, coaList) : { code: '1200', name: 'Bank' };
        const effKpr = resolveEffectiveKprCoaMapping(kprCoaMapping, targetDebt.kprCoaSnapshot);
        resolvedCoaDebitCode = effKpr.principalLiabilityCode;
        resolvedCoaCreditCode = bankCoa.code;
      }
    }

    const resolvedKprBreakdown = resolvedDebtAccounting?.linkedKprBreakdown ?? newTx.linkedKprBreakdown;

    const tx: Transaction = {
      id: txId,
      date: newTx.date,
      accountId: newTx.accountId,
      type: newTx.type,
      category: newTx.category,
      description: newTx.description,
      amount: normalizedAmount,
      ...(resolvedCoaDebitCode ? { coaDebitCode: resolvedCoaDebitCode } : {}),
      ...(resolvedCoaCreditCode ? { coaCreditCode: resolvedCoaCreditCode } : {}),
      ...(resolvedKprBreakdown ? { linkedKprBreakdown: resolvedKprBreakdown } : {}),
      linkedDebtId: resolvedDebtId,
      linkedDebtAction: newTx.linkedDebtAction,
      linkedInvestmentId: resolvedInvestmentId,
      linkedInvestmentAction: newTx.linkedInvestmentAction,
      linkedFixedAssetId: newTx.linkedFixedAssetId,
      linkedFixedAssetAction: newTx.linkedFixedAssetAction,
      linkedEmergencyTxId: resolvedEmergencyTxId,
      debtDisbursementMode: newTx.debtDisbursementMode,
      debtDisbursementCoaCode: newTx.debtDisbursementCoaCode,
      unitPrice: txUnitPrice,
      units: txUnits,
      unitName: txUnitName,
    };

    setTransactions((prev) => [tx, ...prev]);

    // Update the associated account balance via unified engine
    setAccounts((prevAccounts) =>
      prevAccounts.map((acc) => {
        if (acc.id === tx.accountId) {
          return applyAccountBalanceChange(acc, getTransactionAccountDelta(tx));
        }
        return acc;
      })
    );

    // --- INTERCONNECTED LOGIC ---

    // 1. DANA DARURAT Integration (Single entry with bidirectional link)
    if (resolvedEmergencyTxId && (isEmergencyAddition || isEmergencyReduction)) {
      const sourceAcc = accounts.find((a) => a.id === tx.accountId);
      const etx: EmergencyFundTransaction = {
        id: resolvedEmergencyTxId,
        date: tx.date,
        type: isEmergencyAddition ? 'addition' : 'reduction',
        amount: tx.amount,
        location: sourceAcc ? sourceAcc.name : 'Rekening Utama',
        description:
          tx.description ||
          (isEmergencyAddition ? 'Penyisihan Dana Darurat Bulanan' : 'Pencairan Dana Darurat'),
        linkedTransactionId: tx.id,
      };
      setEmergencyTransactions((prev) => [...prev, etx]);
    }

    // 2. HUTANG Integration
    if (newTx.linkedDebtAction === 'pay' && resolvedDebtId) {
      if (resolvedDebtId.startsWith('acc-debt-')) {
        const targetAccId = resolvedDebtId.replace('acc-debt-', '');
        setAccounts((prevAccounts) =>
          prevAccounts.map((acc) => {
            if (acc.id === targetAccId) {
              return applyCreditBillPayment(acc, tx.amount, 'pay');
            }
            return acc;
          })
        );
      } else {
        const principalPayAmt = tx.linkedKprBreakdown
          ? Math.max(0, Number(tx.linkedKprBreakdown.principalPart) || 0)
          : (resolvedDebtAccounting?.principalPayAmount ?? tx.amount);
        setDebts((prevDebts) =>
          prevDebts.map((d) => {
            if (d.id === resolvedDebtId) {
              return {
                ...d,
                balance: Math.max(0, d.balance - principalPayAmt),
              };
            }
            return d;
          })
        );
      }

      if (payTargetLabel) {
        showToast({
          type: 'success',
          title: isFullDebtPayoff ? 'Pelunasan Hutang / KPR Berhasil' : 'Pembayaran Cicilan Berhasil',
          message: isFullDebtPayoff
            ? `"${payTargetLabel}" sebesar ${formatCurrencyIDR(tx.amount)} telah lunas dan tercatat di Jurnal Transaksi.`
            : `Cicilan ${formatCurrencyIDR(tx.amount)} untuk "${payTargetLabel}" berhasil dicatat dan saldo hutang diperbarui.`,
          duration: 4500,
        });
      }
    } else if (newTx.linkedDebtAction === 'create' && newTx.newDebtDetails && resolvedDebtId) {
      const d: Debt = {
        id: resolvedDebtId,
        name: newTx.newDebtDetails.name,
        balance: tx.amount,
        interestRate: newTx.newDebtDetails.interestRate,
        minPayment: newTx.newDebtDetails.minPayment,
        purpose: newTx.newDebtDetails.purpose,
        category: newTx.newDebtDetails.category,
        dueDay: 15,
      };
      setDebts((prev) => [...prev, d]);
    }

    // 3. INVESTASI Integration
    if (newTx.linkedInvestmentAction === 'buy' && newTx.newInvestmentDetails) {
      setInvestments((prevInv) => {
        const nameLower = newTx.newInvestmentDetails!.name.toLowerCase().trim();
        const existingIndex = prevInv.findIndex(
          (inv) =>
            (resolvedInvestmentId && inv.id === resolvedInvestmentId) ||
            inv.name.toLowerCase().trim() === nameLower
        );

        let addedQty = 1;
        let buyUnitPrice = tx.amount;

        if (txUnits && txUnits > 0 && txUnitPrice && txUnitPrice > 0) {
          addedQty = txUnits;
          buyUnitPrice = txUnitPrice;
        } else if (txUnitPrice && txUnitPrice > 0) {
          buyUnitPrice = txUnitPrice;
          addedQty = tx.amount / txUnitPrice;
        } else if (txUnits && txUnits > 0) {
          addedQty = txUnits;
          buyUnitPrice = tx.amount / txUnits;
        }

        if (existingIndex > -1) {
          return prevInv.map((inv, idx) => {
            if (idx === existingIndex) {
              const currentCap = inv.initialCapital !== undefined ? inv.initialCapital : inv.balance;
              const currentQty = inv.quantity ?? inv.units ?? 0;
              const oldAvgBuy =
                inv.purchaseUnitPrice ?? (currentQty > 0 ? currentCap / currentQty : buyUnitPrice);

              const newQty = currentQty + addedQty;
              const newCap = currentCap + tx.amount;
              const newAvgBuyPrice = newQty > 0 ? newCap / newQty : oldAvgBuy;
              const effectivePricePerUnit =
                buyUnitPrice || inv.unitPrice || inv.currentUnitPrice || oldAvgBuy;
              const newBalance = newQty * effectivePricePerUnit;

              return {
                ...inv,
                quantity: newQty,
                units: newQty,
                initialCapital: newCap,
                purchaseUnitPrice: newAvgBuyPrice,
                unitPrice: effectivePricePerUnit,
                currentUnitPrice: effectivePricePerUnit,
                balance: newBalance,
                unitName: txUnitName || inv.unitName || 'Unit',
              };
            }
            return inv;
          });
        } else {
          const invAsset: InvestmentAsset = {
            id: resolvedInvestmentId || `inv-${Date.now()}`,
            name: newTx.newInvestmentDetails!.name,
            category: newTx.newInvestmentDetails!.category,
            balance: tx.amount,
            initialCapital: tx.amount,
            dateAdded: tx.date,
            quantity: addedQty,
            units: addedQty,
            unitPrice: buyUnitPrice,
            currentUnitPrice: buyUnitPrice,
            purchaseUnitPrice: buyUnitPrice,
            unitName: txUnitName || 'Unit',
          };
          return [...prevInv, invAsset];
        }
      });
    } else if (newTx.linkedInvestmentAction === 'sell' && newTx.linkedInvestmentId) {
      setInvestments((prevInv) =>
        prevInv.map((inv) => {
          if (inv.id === newTx.linkedInvestmentId) {
            const currentCap = inv.initialCapital !== undefined ? inv.initialCapital : inv.balance;
            const currentQty = inv.quantity ?? inv.units ?? 1;
            const effectivePrice =
              txUnitPrice || inv.unitPrice || inv.currentUnitPrice || inv.balance / currentQty;
            const avgBuy = inv.purchaseUnitPrice ?? currentCap / currentQty;

            const soldQty =
              txUnits && txUnits > 0 ? txUnits : effectivePrice > 0 ? tx.amount / effectivePrice : 0;
            const newQty = Math.max(0, currentQty - soldQty);
            const newCap = Math.max(0, currentCap - soldQty * avgBuy);
            const newBalance = Math.max(0, newQty * effectivePrice);

            return {
              ...inv,
              quantity: newQty,
              units: newQty,
              initialCapital: newCap,
              balance: newBalance,
              currentUnitPrice: effectivePrice,
              unitPrice: effectivePrice,
            };
          }
          return inv;
        })
      );
    } else if (tx.type === 'income' && resolvedInvestmentId && !newTx.linkedInvestmentAction) {
      setInvestments((prevInv) =>
        prevInv.map((inv) =>
          inv.id === resolvedInvestmentId
            ? { ...inv, dividendsOrInterest: (inv.dividendsOrInterest || 0) + tx.amount }
            : inv
        )
      );
    }

    return true;
  };

  // Delete transaction and reverse balance & interconnected entities atomically
  const handleDeleteTransaction = (id: string) => {
    const targetTx = transactions.find((t) => t.id === id);
    if (!targetTx) return;

    const safeTxAmount = normalizeAbsAmount(targetTx.amount);
    setTransactions((prev) => prev.filter((t) => t.id !== id));

    // If Non-Cash Adjusting Entry, reverse asset depreciation or debt interest accrual without touching cash accounts
    if (targetTx.isAdjustment) {
      if (targetTx.adjustmentType === 'investment_depreciation' && targetTx.linkedInvestmentId) {
        setInvestments((prevInv) =>
          prevInv.map((inv) => {
            if (inv.id === targetTx.linkedInvestmentId) {
              const restoredBal = inv.balance + safeTxAmount;
              const qty = inv.quantity ?? inv.units ?? 0;
              const nextUnitPrice = qty > 0 ? restoredBal / qty : inv.currentUnitPrice ?? inv.unitPrice;
              return {
                ...inv,
                balance: restoredBal,
                ...(qty > 0 ? { unitPrice: nextUnitPrice, currentUnitPrice: nextUnitPrice } : {}),
              };
            }
            return inv;
          })
        );
      } else if (targetTx.adjustmentType === 'debt_interest_accrual' && targetTx.linkedDebtId) {
        setDebts((prevDebts) =>
          prevDebts.map((d) => {
            if (d.id === targetTx.linkedDebtId) {
              return {
                ...d,
                balance: Math.max(0, d.balance - safeTxAmount),
              };
            }
            return d;
          })
        );
      } else if (targetTx.adjustmentType === 'fixed_asset_depreciation' && targetTx.linkedFixedAssetId) {
        setFixedAssets((prevAssets) =>
          prevAssets.map((fa) => {
            if (fa.id !== targetTx.linkedFixedAssetId) return fa;
            const remainingAdjustments = (fa.manualAdjustments || []).filter(
              (adj) =>
                adj.id !== targetTx.linkedFixedAssetAdjustmentId &&
                !(adj.isAutoYearEnd && targetTx.adjustmentPeriodKey && adj.periodKey === targetTx.adjustmentPeriodKey)
            );
            const restoredRateEffectiveDate =
              fa.rateEffectiveDate === targetTx.date
                ? targetTx.previousRateEffectiveDate || fa.acquisitionDate
                : fa.rateEffectiveDate;
            return {
              ...fa,
              manualAdjustments: remainingAdjustments,
              rateEffectiveDate: restoredRateEffectiveDate,
            };
          })
        );
      }
      return;
    }

    setAccounts((prevAccounts) =>
      prevAccounts.map((acc) => {
        if (acc.id === targetTx.accountId) {
          return applyAccountBalanceChange(acc, -getTransactionAccountDelta(targetTx));
        }
        return acc;
      })
    );

    // 1. Dana Darurat Revert (exact linked ID first, single-match fallback for legacy rows)
    if (
      targetTx.linkedEmergencyTxId ||
      targetTx.category === 'Tabungan Darurat' ||
      targetTx.category === 'Pencairan Dana Darurat'
    ) {
      setEmergencyTransactions((prev) => {
        if (targetTx.linkedEmergencyTxId) {
          return prev.filter(
            (etx) =>
              etx.id !== targetTx.linkedEmergencyTxId &&
              etx.linkedTransactionId !== targetTx.id
          );
        }
        const byLinkedTx = prev.some((etx) => etx.linkedTransactionId === targetTx.id);
        if (byLinkedTx) {
          return prev.filter((etx) => etx.linkedTransactionId !== targetTx.id);
        }
        let removedOne = false;
        return prev.filter((etx) => {
          if (!removedOne && etx.amount === targetTx.amount && etx.date === targetTx.date) {
            removedOne = true;
            return false;
          }
          return true;
        });
      });
    }

    // 2. Debt Revert
    if (targetTx.linkedDebtId && targetTx.linkedDebtAction === 'pay') {
      if (targetTx.linkedDebtId.startsWith('acc-debt-')) {
        const targetAccId = targetTx.linkedDebtId.replace('acc-debt-', '');
        setAccounts((prevAccounts) =>
          prevAccounts.map((acc) => {
            if (acc.id === targetAccId) {
              return applyCreditBillPayment(acc, safeTxAmount, 'revert');
            }
            return acc;
          })
        );
      } else {
        const principalPayAmt = targetTx.linkedKprBreakdown
          ? normalizeAbsAmount(targetTx.linkedKprBreakdown.principalPart)
          : safeTxAmount;
        setDebts((prevDebts) =>
          prevDebts.map((d) => {
            if (d.id === targetTx.linkedDebtId) {
              return {
                ...d,
                balance: d.balance + principalPayAmt,
              };
            }
            return d;
          })
        );
      }
    } else if (targetTx.linkedDebtAction === 'create') {
      setDebts((prev) =>
        prev.filter((d) =>
          targetTx.linkedDebtId
            ? d.id !== targetTx.linkedDebtId
            : !(d.balance === targetTx.amount && d.name === targetTx.description)
        )
      );
    }

    // 3. Investment Revert (by linkedInvestmentId first, preserving unit quantities & market valuation)
    if (targetTx.linkedInvestmentAction === 'buy') {
      setInvestments((prevInv) =>
        prevInv
          .map((inv) => {
            const isMatched = targetTx.linkedInvestmentId
              ? inv.id === targetTx.linkedInvestmentId
              : targetTx.description.toLowerCase().includes(inv.name.toLowerCase().trim());

            if (isMatched) {
              const currentCap = inv.initialCapital !== undefined ? inv.initialCapital : inv.balance;
              const currentQty = inv.quantity ?? inv.units ?? 0;
              const unitPx = targetTx.unitPrice || inv.unitPrice || inv.currentUnitPrice || 0;
              const qtyToRemove =
                targetTx.units && targetTx.units > 0
                  ? targetTx.units
                  : unitPx > 0
                  ? targetTx.amount / unitPx
                  : inv.balance > 0 && currentQty > 0
                  ? (currentQty * targetTx.amount) / inv.balance
                  : 0;

              const newQty = Math.max(0, currentQty - qtyToRemove);
              const newCap = Math.max(0, currentCap - targetTx.amount);
              const effectiveCurrentPrice =
                inv.currentUnitPrice ||
                inv.unitPrice ||
                (currentQty > 0 ? inv.balance / currentQty : unitPx);
              const newBal = newQty > 0 ? Math.max(0, newQty * effectiveCurrentPrice) : 0;
              const nextAvgBuyPrice =
                newQty > 0 ? newCap / newQty : inv.purchaseUnitPrice;

              return {
                ...inv,
                quantity: newQty,
                units: newQty,
                balance: newBal,
                initialCapital: newCap,
                ...(nextAvgBuyPrice !== undefined ? { purchaseUnitPrice: nextAvgBuyPrice } : {}),
              };
            }
            return inv;
          })
          .filter((inv) => inv.balance > 0 || (inv.quantity ?? inv.units ?? 0) > 0)
      );
    } else if (targetTx.linkedInvestmentAction === 'sell') {
      setInvestments((prevInv) =>
        prevInv.map((inv) => {
          const isMatched = targetTx.linkedInvestmentId
            ? inv.id === targetTx.linkedInvestmentId
            : targetTx.description.toLowerCase().includes(inv.name.toLowerCase().trim());

          if (isMatched) {
            const currentCap = inv.initialCapital !== undefined ? inv.initialCapital : inv.balance;
            const currentQty = inv.quantity ?? inv.units ?? 0;
            const unitPx = targetTx.unitPrice || inv.unitPrice || inv.currentUnitPrice || 0;
            const qtyToRestore =
              targetTx.units && targetTx.units > 0
                ? targetTx.units
                : unitPx > 0
                ? targetTx.amount / unitPx
                : inv.balance > 0 && currentQty > 0
                ? (currentQty * targetTx.amount) / inv.balance
                : 0;
            const avgBuy =
              inv.purchaseUnitPrice ?? (currentQty > 0 ? currentCap / currentQty : unitPx);
            const capToRestore =
              qtyToRestore > 0 && avgBuy > 0 ? qtyToRestore * avgBuy : targetTx.amount;
            const restoredQty = currentQty + qtyToRestore;
            const effectiveCurrentPrice =
              inv.currentUnitPrice ||
              inv.unitPrice ||
              (currentQty > 0 ? inv.balance / currentQty : unitPx);
            const restoredBal =
              restoredQty > 0 && effectiveCurrentPrice > 0
                ? restoredQty * effectiveCurrentPrice
                : inv.balance + targetTx.amount;

            return {
              ...inv,
              quantity: restoredQty,
              units: restoredQty,
              balance: restoredBal,
              initialCapital: currentCap + capToRestore,
            };
          }
          return inv;
        })
      );
    } else if (
      targetTx.type === 'income' &&
      targetTx.linkedInvestmentId &&
      !targetTx.linkedInvestmentAction
    ) {
      setInvestments((prevInv) =>
        prevInv.map((inv) =>
          inv.id === targetTx.linkedInvestmentId
            ? {
                ...inv,
                dividendsOrInterest: Math.max(0, (inv.dividendsOrInterest || 0) - targetTx.amount),
              }
            : inv
        )
      );
    }

    // 4. Fixed Asset Revert
    if (targetTx.linkedFixedAssetAction === 'buy' || targetTx.linkedFixedAssetId) {
      setFixedAssets((prevFa) =>
        prevFa.filter(
          (fa) =>
            fa.id !== targetTx.linkedFixedAssetId &&
            fa.linkedTransactionId !== targetTx.id
        )
      );
    }
  };

  // Perform transfer (Mutasi Dana) between two accounts
  const handleTransferFunds = (
    amount: number,
    fromAccountId: string,
    toAccountId: string,
    description: string
  ) => {
    const dateStr = toLocalYYYYMMDD();

    const outTxId = `tx-${Date.now()}-out`;
    const inTxId = `tx-${Date.now()}-in`;

    const fromAcc = accounts.find((a) => a.id === fromAccountId);
    const toAcc = accounts.find((a) => a.id === toAccountId);

    const rawTransferAmt = Number(amount);
    const normalizedTransferAmt = Number.isFinite(rawTransferAmt) ? Math.abs(rawTransferAmt) : 0;
    if (!fromAcc || !toAcc || normalizedTransferAmt <= 0) return;

    const outTx: Transaction = {
      id: outTxId,
      date: dateStr,
      accountId: fromAccountId,
      type: 'expense',
      category: 'Mutasi Keluar',
      description: `${description} (Ke ${toAcc.name})`,
      amount: normalizedTransferAmt,
    };

    const inTx: Transaction = {
      id: inTxId,
      date: dateStr,
      accountId: toAccountId,
      type: 'income',
      category: 'Mutasi Masuk',
      description: `${description} (Dari ${fromAcc.name})`,
      amount: normalizedTransferAmt,
    };

    setTransactions((prev) => [outTx, inTx, ...prev]);

    setAccounts((prevAccounts) => applyTransactionsToAccounts(prevAccounts, [outTx, inTx], 'apply'));
  };

  // Handlers for Recurring Transactions
  const handleAddRecurringTransaction = (recData: Omit<RecurringTransaction, 'id'>) => {
    const newRec: RecurringTransaction = {
      ...recData,
      id: `rec-${Date.now()}`,
    };
    setRecurringTransactions((prev) => [...prev, newRec]);
  };

  const handleUpdateRecurringTransaction = (updatedRec: RecurringTransaction) => {
    setRecurringTransactions((prev) =>
      prev.map((r) => (r.id === updatedRec.id ? updatedRec : r))
    );
  };

  const handleDeleteRecurringTransaction = (id: string) => {
    setRecurringTransactions((prev) => prev.filter((r) => r.id !== id));
  };

  const handleToggleRecurringTransaction = (id: string) => {
    setRecurringTransactions((prev) =>
      prev.map((r) => (r.id === id ? { ...r, isActive: !r.isActive } : r))
    );
  };

  const handleManualRunRecurringTransaction = (id: string) => {
    const target = recurringTransactions.find((r) => r.id === id);
    if (!target) return;

    const dateStr = toLocalYYYYMMDD();

    const newTx: Transaction = {
      id: `tx-rec-manual-${Date.now()}`,
      date: dateStr,
      accountId: target.accountId,
      type: target.type,
      category: target.category,
      description: `[Jadwal Otomatis] ${target.title}${target.description ? ` - ${target.description}` : ''}`,
      amount: normalizeAbsAmount(target.amount),
    };

    setTransactions((prev) => [newTx, ...prev]);

    setAccounts((prevAccounts) =>
      prevAccounts.map((acc) => {
        if (acc.id === target.accountId) {
          return applyAccountBalanceChange(acc, getTransactionAccountDelta(newTx));
        }
        return acc;
      })
    );

    setRecurringTransactions((prev) =>
      prev.map((r) => (r.id === id ? { ...r, lastProcessedDate: dateStr } : r))
    );
  };

  // Batch Update Transaction Categories (AI Cleanup)
  const handleBatchUpdateCategories = (updates: { id: string; category: string }[]) => {
    if (!updates || updates.length === 0) return;
    const updateMap = new Map(updates.map(u => [u.id, u.category]));
    setTransactions((prev) =>
      prev.map((tx) => {
        const newCat = updateMap.get(tx.id);
        if (newCat) {
          return { ...tx, category: newCat };
        }
        return tx;
      })
    );
  };

  // Update Account details via centralized accounting engine
  const handleUpdateAccountBalance = (accountId: string, newStartingBalance: number, newName?: string) => {
    setAccounts((prev) =>
      prev.map((acc) =>
        acc.id === accountId
          ? updateAccountMetadataAndStartingBalance(acc, newStartingBalance, newName)
          : acc
      )
    );
  };

  const handleAddAccount = (
    name: string, 
    type: AccountType, 
    startingBalance: number, 
    accountNumber?: string,
    initialDebt: number = 0,
    dueDay?: number,
    interestRate?: number,
    minPayment?: number,
    openingDate?: string
  ) => {
    const newAcc = createAccountRecord({
      id: `acc-${Date.now()}`,
      name,
      type,
      startingBalance,
      accountNumber,
      initialDebt,
      dueDay,
      interestRate,
      minPayment,
      openingDate,
    });
    setAccounts((prev) => [...prev, newAcc]);
  };

  const handleDeleteAccount = (id: string) => {
    setAccounts((prev) => prev.filter((acc) => acc.id !== id));
    setTransactions((prev) => prev.filter((tx) => tx.accountId !== id));
  };

  // Update category budget ceilings
  const handleUpdateBudgetLimit = (category: string, newLimit: number) => {
    setBudgets((prev) =>
      prev.map((b) => (b.category === category ? { ...b, limit: newLimit } : b))
    );
  };

  const handleAddBudgetCategory = (
    category: string,
    type: 'expense' | 'saving' | 'investment',
    limit: number
  ) => {
    const isExist = budgets.some((b) => b.category.toLowerCase() === category.toLowerCase());
    if (isExist) {
      showToast({
        type: 'warning',
        title: 'Kategori Sudah Terdaftar',
        message: `Kategori anggaran "${category}" sudah ada dalam daftar Anda.`,
      });
      return;
    }
    setBudgets((prev) => [...prev, { category, type, limit }]);
  };

  const handleDeleteBudgetCategory = (category: string) => {
    setBudgets((prev) => prev.filter((b) => b.category !== category));
  };

  // Emergency Fund configs
  const handleUpdateEmergencyConfig = (config: EmergencyFundConfig) => {
    setEmergencyConfig(config);
    showToast({
      type: 'success',
      title: 'Target Dana Darurat Diperbarui',
      message: 'Kalkulasi target dana darurat Anda berhasil disimpan.',
    });
  };

  const handleAddEmergencyTx = (newEtx: Omit<EmergencyFundTransaction, 'id'>) => {
    const matchedAccount = getLiquidAccounts(accounts)[0] || accounts[0];
    if (matchedAccount) {
      // Single-source entry through handleAddTransaction so no duplicate emergency row is created
      handleAddTransaction({
        date: newEtx.date,
        accountId: matchedAccount.id,
        type: newEtx.type === 'addition' ? 'saving' : 'income',
        category: newEtx.type === 'addition' ? 'Tabungan Darurat' : 'Pencairan Dana Darurat',
        description: newEtx.description,
        amount: newEtx.amount,
      });
    } else {
      const etx: EmergencyFundTransaction = {
        ...newEtx,
        id: `etx-${Date.now()}`,
      };
      setEmergencyTransactions((prev) => [...prev, etx]);
    }
  };

  const handleDeleteEmergencyTx = (id: string) => {
    const targetEtx = emergencyTransactions.find((et) => et.id === id);
    if (!targetEtx) return;

    const linkedTx = transactions.find(
      (t) =>
        (targetEtx.linkedTransactionId && t.id === targetEtx.linkedTransactionId) ||
        t.linkedEmergencyTxId === id ||
        (!targetEtx.linkedTransactionId &&
          (t.category === 'Tabungan Darurat' || t.category === 'Pencairan Dana Darurat') &&
          t.amount === targetEtx.amount &&
          t.date === targetEtx.date)
    );

    if (linkedTx) {
      handleDeleteTransaction(linkedTx.id);
    } else {
      setEmergencyTransactions((prev) => prev.filter((et) => et.id !== id));
    }

    showToast({
      type: 'info',
      title: 'Mutasi Dana Darurat Dihapus',
      message: 'Catatan dana darurat dan jurnal rekening terkait telah dibatalkan.',
    });
  };

  // Investment handlers
  const handleUpdateInvestment = (id: string, updatedFields: Partial<InvestmentAsset>) => {
    setInvestments((prev) =>
      prev.map((inv) => {
        if (inv.id === id) {
          const merged = { ...inv, ...updatedFields };
          if (updatedFields.quantity !== undefined) {
            merged.units = updatedFields.quantity;
          } else if (updatedFields.units !== undefined) {
            merged.quantity = updatedFields.units;
          }
          if (updatedFields.unitPrice !== undefined) {
            merged.currentUnitPrice = updatedFields.unitPrice;
          } else if (updatedFields.currentUnitPrice !== undefined) {
            merged.unitPrice = updatedFields.currentUnitPrice;
          }
          return merged;
        }
        return inv;
      })
    );
  };

  // Fixed Assets & KPR Equity Handlers
  const handleAddFixedAsset = (payload: {
    name: string;
    category: FixedAssetCategory;
    purchasePrice: number;
    acquisitionDate: string;
    annualRatePct: number;
    fundingMode: 'account_deduction' | 'direct_record';
    linkedAccountId?: string;
    notes?: string;
  }): boolean => {
    const normalizedPrice = normalizeAbsAmount(payload.purchasePrice);
    if (!payload.name.trim() || normalizedPrice <= 0) return false;

    const suffix = Math.random().toString(36).slice(2, 6);
    const fixedAssetId = `fa-${Date.now()}-${suffix}`;
    let linkedTxId: string | undefined;

    if (payload.fundingMode === 'account_deduction') {
      const sourceAcc = accounts.find((a) => a.id === payload.linkedAccountId);
      if (!sourceAcc) {
        showToast({
          type: 'error',
          title: 'Rekening Tidak Ditemukan',
          message: 'Pilih rekening sumber dana yang valid untuk mencatat pembelian aset tetap.',
        });
        return false;
      }
      if (!isCreditAccount(sourceAcc) && sourceAcc.currentBalance < normalizedPrice) {
        showToast({
          type: 'error',
          title: 'Saldo Rekening Tidak Mencukupi',
          message: `Saldo ${sourceAcc.name} (${formatCurrencyIDR(sourceAcc.currentBalance)}) kurang dari harga beli ${formatCurrencyIDR(normalizedPrice)}.`,
        });
        return false;
      }

      const preTxId = `tx-fa-${Date.now()}-${suffix}`;
      const bankCoa = getAccountCoaMapping(sourceAcc, getStoredCoaList());
      const ok = handleAddTransaction({
        id: preTxId,
        date: payload.acquisitionDate || toLocalYYYYMMDD(),
        accountId: sourceAcc.id,
        type: 'expense',
        category: 'Pembelian Aset Tetap',
        description: `Pembelian Aset Tetap: ${payload.name.trim()}`,
        amount: normalizedPrice,
        coaDebitCode: '1610',
        coaCreditCode: bankCoa.code,
        linkedFixedAssetId: fixedAssetId,
        linkedFixedAssetAction: 'buy',
      });
      if (!ok) return false;
      linkedTxId = preTxId;
    }

    const newAsset: FixedAsset = {
      id: fixedAssetId,
      name: payload.name.trim(),
      category: payload.category,
      purchasePrice: normalizedPrice,
      acquisitionDate: payload.acquisitionDate || toLocalYYYYMMDD(),
      annualRatePct: Number.isFinite(payload.annualRatePct) ? payload.annualRatePct : 0,
      rateEffectiveDate: payload.acquisitionDate || toLocalYYYYMMDD(),
      fundingMode: payload.fundingMode,
      linkedAccountId: payload.fundingMode === 'account_deduction' ? payload.linkedAccountId : undefined,
      linkedTransactionId: linkedTxId,
      isKprLinked: false,
      manualAdjustments: [],
      notes: payload.notes,
    };

    setFixedAssets((prev) => [newAsset, ...prev]);
    showToast({
      type: 'success',
      title: 'Aset Tetap Ditambahkan',
      message:
        payload.fundingMode === 'account_deduction'
          ? `Aset "${newAsset.name}" (${formatCurrencyIDR(normalizedPrice)}) berhasil dicatat dan dipotong dari saldo rekening.`
          : `Aset "${newAsset.name}" (${formatCurrencyIDR(normalizedPrice)}) berhasil dicatat langsung ke daftar aset tetap.`,
    });
    return true;
  };

  const handleUpdateFixedAsset = (id: string, updated: Partial<FixedAsset>) => {
    setFixedAssets((prev) =>
      prev.map((asset) => (asset.id === id ? { ...asset, ...updated } : asset))
    );
  };

  const handleDeleteFixedAsset = (id: string) => {
    setFixedAssets((prev) => prev.filter((asset) => asset.id !== id));
    showToast({
      type: 'info',
      title: 'Aset Tetap Dihapus',
      message: 'Data aset tetap telah dihapus dari daftar kepemilikan.',
    });
  };

  const handleAddFixedAssetAdjustment = (
    assetId: string,
    adjustment: Omit<FixedAssetAdjustment, 'id'>
  ) => {
    const newAdj: FixedAssetAdjustment = {
      ...adjustment,
      amount: normalizeAbsAmount(adjustment.amount),
      id: `fa-adj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    };
    setFixedAssets((prev) =>
      prev.map((asset) =>
        asset.id === assetId
          ? {
              ...asset,
              manualAdjustments: [newAdj, ...(asset.manualAdjustments || [])],
            }
          : asset
      )
    );
    showToast({
      type: 'success',
      title: 'Penyesuaian Nilai Tercatat',
      message: `${adjustment.type === 'appreciation' ? 'Penambahan nilai' : 'Penyusutan'} sebesar ${formatCurrencyIDR(newAdj.amount)} berhasil disimpan.`,
    });
  };

  const handleDeleteFixedAssetAdjustment = (assetId: string, adjustmentId: string) => {
    setFixedAssets((prev) =>
      prev.map((asset) =>
        asset.id === assetId
          ? {
              ...asset,
              manualAdjustments: (asset.manualAdjustments || []).filter(
                (adj) => adj.id !== adjustmentId
              ),
            }
          : asset
      )
    );
  };

  const handleSyncFixedAssetDepreciation = (assetId: string) => {
    const target =
      fixedAssets.find((fa) => fa.id === assetId) ||
      syncKprDebtsToFixedAssets(fixedAssets, debts).find((fa) => fa.id === assetId);
    if (!target) return;

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const synced = buildSyncedFixedAssetDepreciationAdjustment(target, debts, todayStr, {
      existingTransactions: transactions,
    });

    if (!synced.applied || !synced.adjustingTransaction || !synced.adjustment) {
      showToast({
        type: 'info',
        title: 'Tidak Ada Penyusutan Tertunda',
        message: `Penyusutan untuk "${target.name}" sudah tersinkronisasi sampai tanggal ${todayStr}.`,
      });
      return;
    }

    setFixedAssets((prev) =>
      prev.some((fa) => fa.id === assetId)
        ? prev.map((fa) => (fa.id === assetId ? synced.updatedAsset : fa))
        : [...prev, synced.updatedAsset]
    );
    setTransactions((prev) => {
      if (prev.some((t) => t.id === synced.adjustingTransaction!.id)) return prev;
      return [synced.adjustingTransaction!, ...prev];
    });
    showToast({
      type: 'success',
      title: 'Penyusutan Aset Tetap Disinkronkan',
      message: `Penyusutan "${target.name}" sebesar ${formatCurrencyIDR(synced.adjustment.amount)} (${synced.depreciation.elapsedDays} hr) telah dicatat ke riwayat aset & jurnal penyesuaian.`,
      duration: 4500,
    });
  };

  const handleSyncAllFixedAssetDepreciations = () => {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const syncedList = syncKprDebtsToFixedAssets(fixedAssets, debts, todayStr);
    const batch = buildBatchSyncedFixedAssetDepreciationAdjustments(syncedList, debts, todayStr, {
      existingTransactions: transactions,
    });

    if (batch.appliedCount === 0 || batch.newAdjustingTransactions.length === 0) {
      showToast({
        type: 'info',
        title: 'Semua Penyusutan Sudah Sinkron',
        message: `Tidak ada penyusutan tertunda untuk aset tetap bersaldo susut sampai tanggal ${todayStr}.`,
      });
      return;
    }

    const updatedById = new Map<string, FixedAsset>();
    batch.updatedAssets.forEach((asset) => {
      updatedById.set(asset.id, asset);
    });
    const modifiedIds = new Set<string>(
      batch.newAdjustingTransactions
        .map((tx) => tx.linkedFixedAssetId)
        .filter((id): id is string => Boolean(id))
    );

    setFixedAssets((prev) => {
      const existingIds = new Set(prev.map((a) => a.id));
      const merged = prev.map((a) => (modifiedIds.has(a.id) ? updatedById.get(a.id) || a : a));
      batch.updatedAssets.forEach((a) => {
        if (modifiedIds.has(a.id) && !existingIds.has(a.id)) {
          merged.push(a);
        }
      });
      return merged;
    });

    setTransactions((prev) => {
      const existingIds = new Set(prev.map((t) => t.id));
      const toAdd = batch.newAdjustingTransactions.filter((t) => !existingIds.has(t.id));
      return toAdd.length > 0 ? [...toAdd, ...prev] : prev;
    });

    showToast({
      type: 'success',
      title: `${batch.appliedCount} Jurnal Penyusutan Diposting`,
      message: `Total penyusutan sebesar ${formatCurrencyIDR(batch.totalDepreciationPosted)} telah dicatat ke jurnal non-kas (Dr 5960 / Cr 1690) dan nilai buku diperbarui.`,
      duration: 5000,
    });
  };

  // Debt tracker handlers

  const handleAddDebt = (
    newDebt: Omit<Debt, 'id'>,
    bankLink?:
      | string
      | {
          accountId: string;
          linkAccount?: boolean;
          transactionType?: 'income' | 'expense';
          postKprInitialCostsToJournal?: boolean;
        }
  ) => {
    const normalizedDebtBalance = normalizeAbsAmount(newDebt.balance);
    const normalizedDebtMinPayment = normalizeAbsAmount(newDebt.minPayment);
    const normalizedDownPayment = normalizeAbsAmount(newDebt.downPayment);
    const uniqueSuffix = Math.random().toString(36).slice(2, 6);
    const debtId = `debt-${Date.now()}-${uniqueSuffix}`;
    const d: Debt = {
      ...newDebt,
      balance: normalizedDebtBalance,
      minPayment: normalizedDebtMinPayment,
      ...(newDebt.downPayment !== undefined ? { downPayment: normalizedDownPayment } : {}),
      id: debtId,
    };
    setDebts((prev) => [...prev, d]);

    const shouldLinkAccount =
      typeof bankLink === 'string'
        ? Boolean(bankLink.trim())
        : Boolean(bankLink?.accountId && bankLink.linkAccount !== false);

    const resolvedAccountId = shouldLinkAccount
      ? typeof bankLink === 'string'
        ? bankLink
        : bankLink?.accountId
      : undefined;

    const resolvedTxType: 'income' | 'expense' =
      typeof bankLink === 'object' && bankLink?.transactionType
        ? bankLink.transactionType
        : 'expense';

    const shouldPostKprInitialCosts =
      typeof bankLink === 'object' && Boolean(bankLink?.postKprInitialCostsToJournal);

    if (resolvedAccountId) {
      const targetAcc = accounts.find((a) => a.id === resolvedAccountId);
      if (targetAcc) {
        const todayStr = toLocalYYYYMMDD();
        const isKprDebt = newDebt.category === 'KPR / Properti' || Boolean(newDebt.kprScheme);
        const coaList = getStoredCoaList();
        const bankCoa = getAccountCoaMapping(targetAcc, coaList);
        const effKprCoa = resolveEffectiveKprCoaMapping(kprCoaMapping, newDebt.kprCoaSnapshot);

        const primaryTx: Transaction = {
          id: `tx-debt-${Date.now()}-${uniqueSuffix}`,
          date: todayStr,
          accountId: targetAcc.id,
          type: resolvedTxType,
          category: isKprDebt
            ? resolvedTxType === 'income'
              ? effKprCoa.disbursementIncomeCategory || 'Pencairan KPR'
              : 'Pengeluaran Pencairan Pinjaman'
            : resolvedTxType === 'expense'
              ? 'Pengeluaran Pencairan Pinjaman'
              : 'Penerimaan Utang Baru',
          description:
            resolvedTxType === 'expense'
              ? `Pengeluaran Pencairan Pinjaman: ${newDebt.name}`
              : isKprDebt
                ? `Pencairan KPR: ${newDebt.name}`
                : `Pencairan Hutang: ${newDebt.name}`,
          amount: normalizedDebtBalance,
          linkedDebtId: debtId,
          linkedDebtAction: 'create',
          ...(isKprDebt
            ? {
                coaDebitCode: resolvedTxType === 'income' ? bankCoa.code : effKprCoa.propertyAssetCode,
                coaCreditCode: resolvedTxType === 'income' ? effKprCoa.principalLiabilityCode : bankCoa.code,
              }
            : {}),
        };

        const generatedTxs: Transaction[] = [primaryTx];
        let totalInitialCashOutflow = 0;

        if (isKprDebt && shouldPostKprInitialCosts) {
          const dpAmount = Math.round(normalizedDownPayment);
          if (dpAmount > 0) {
            generatedTxs.push({
              id: `tx-kpr-dp-${Date.now()}-${uniqueSuffix}`,
              date: todayStr,
              accountId: targetAcc.id,
              type: 'expense',
              category: 'Uang Muka (DP) KPR',
              description: `Uang Muka (DP) Properti KPR: ${newDebt.name}`,
              amount: dpAmount,
              linkedDebtId: debtId,
              coaDebitCode: effKprCoa.propertyAssetCode,
              coaCreditCode: bankCoa.code,
            });
            totalInitialCashOutflow += dpAmount;
          }

          if (newDebt.kprFeesSummary) {
            const provisiLegalFee = Math.round(
              normalizeAbsAmount(newDebt.kprFeesSummary.provisiFee) +
                normalizeAbsAmount(newDebt.kprFeesSummary.adminFee) +
                normalizeAbsAmount(newDebt.kprFeesSummary.appraisalFee) +
                normalizeAbsAmount(newDebt.kprFeesSummary.notaryAjbFee)
            );
            if (provisiLegalFee > 0) {
              generatedTxs.push({
                id: `tx-kpr-admin-${Date.now()}-${uniqueSuffix}`,
                date: todayStr,
                accountId: targetAcc.id,
                type: 'expense',
                category: 'Biaya Provisi & Admin KPR',
                description: `Biaya Provisi, Admin, Appraisal & Notaris KPR: ${newDebt.name}`,
                amount: provisiLegalFee,
                linkedDebtId: debtId,
                coaDebitCode: effKprCoa.provisiAdminLegalCode,
                coaCreditCode: bankCoa.code,
              });
              totalInitialCashOutflow += provisiLegalFee;
            }

            const taxInsuranceFee = Math.round(
              normalizeAbsAmount(newDebt.kprFeesSummary.bphtbTax) +
                normalizeAbsAmount(newDebt.kprFeesSummary.insuranceFee)
            );
            if (taxInsuranceFee > 0) {
              generatedTxs.push({
                id: `tx-kpr-tax-${Date.now()}-${uniqueSuffix}`,
                date: todayStr,
                accountId: targetAcc.id,
                type: 'expense',
                category: 'Pajak Properti (BPHTB & PBB)',
                description: `BPHTB & Asuransi Akad KPR: ${newDebt.name}`,
                amount: taxInsuranceFee,
                linkedDebtId: debtId,
                coaDebitCode: effKprCoa.taxInsuranceCode,
                coaCreditCode: bankCoa.code,
              });
              totalInitialCashOutflow += taxInsuranceFee;
            }
          }
        }

        setTransactions((prev) => [...generatedTxs, ...prev]);
        setAccounts((prevAccounts) =>
          applyTransactionsToAccounts(prevAccounts, generatedTxs, 'apply')
        );

        const initialFeeNote =
          totalInitialCashOutflow > 0
            ? ` + ${generatedTxs.length - 1} jurnal COA DP & biaya akad (${formatCurrencyIDR(totalInitialCashOutflow)})`
            : '';

        showToast({
          type: 'success',
          title: 'Hutang & Rekening Tersinkronisasi',
          message:
            resolvedTxType === 'expense'
              ? `Hutang "${newDebt.name}" dicatat dan saldo ${targetAcc.name} berkurang ${formatCurrencyIDR(normalizedDebtBalance)}${initialFeeNote}.`
              : `Hutang "${newDebt.name}" dicatat dan saldo ${targetAcc.name} bertambah ${formatCurrencyIDR(normalizedDebtBalance)}${initialFeeNote}.`,
          duration: 4500,
        });
      } else {
        showToast({
          type: 'warning',
          title: 'Akun Terhubung Tidak Ditemukan',
          message: `Hutang "${newDebt.name}" disimpan, namun akun bank tujuan tidak ditemukan untuk sinkronisasi saldo.`,
          duration: 5000,
        });
      }
    }
  };

  const handleDeleteDebt = (id: string) => {
    setDebts((prev) => prev.filter((d) => d.id !== id));
  };

  // --- ADJUSTING ENTRIES HANDLERS (NON-CASH JOURNAL + BALANCE SYNC) ---
  const handleApplyAdjustingEntries = (entries: AdjustingEntryDraft[]) => {
    if (!entries || entries.length === 0) return;

    const newTxs: Transaction[] = [];
    const invDepTotals = new Map<string, number>();
    const debtInterestTotals = new Map<string, number>();

    entries.forEach((entry, idx) => {
      const normalizedAdjAmt = normalizeAbsAmount(entry.adjustmentAmount);
      if (normalizedAdjAmt <= 0) return;
      const isDep = entry.type === 'investment_depreciation';

      newTxs.push({
        id: `tx-adj-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
        date: entry.cutoffDate,
        accountId: '',
        type: 'expense',
        category: isDep ? 'Depresiasi Aset Investasi' : 'Akrual Bunga Utang',
        description: isDep
          ? `[Penyesuaian Non-Kas] Depresiasi ${entry.targetName} (${entry.durationDays} hr @ ${entry.annualRatePct}%/thn)`
          : `[Penyesuaian Non-Kas] Akrual Bunga ${entry.targetName} (${entry.durationDays} hr @ ${entry.annualRatePct}% APR)`,
        amount: normalizedAdjAmt,
        isAdjustment: true,
        adjustmentType: entry.type,
        adjustmentPeriodKey: entry.periodKey,
        adjustmentRatePct: entry.annualRatePct,
        adjustmentDurationDays: entry.durationDays,
        coaDebitCode: entry.coaDebitCode,
        coaCreditCode: entry.coaCreditCode,
        ...(isDep
          ? { linkedInvestmentId: entry.targetId }
          : { linkedDebtId: entry.targetId }),
      });

      if (isDep) {
        invDepTotals.set(entry.targetId, (invDepTotals.get(entry.targetId) || 0) + normalizedAdjAmt);
      } else {
        debtInterestTotals.set(entry.targetId, (debtInterestTotals.get(entry.targetId) || 0) + normalizedAdjAmt);
      }
    });

    if (newTxs.length === 0) return;

    setTransactions((prev) => [...newTxs, ...prev]);

    if (invDepTotals.size > 0) {
      setInvestments((prevInv) =>
        prevInv.map((inv) => {
          const depAmt = invDepTotals.get(inv.id);
          if (!depAmt) return inv;
          const nextBal = Math.max(0, inv.balance - depAmt);
          const qty = inv.quantity ?? inv.units ?? 0;
          const nextUnitPrice = qty > 0 ? nextBal / qty : inv.currentUnitPrice ?? inv.unitPrice;
          return {
            ...inv,
            balance: nextBal,
            ...(qty > 0 ? { unitPrice: nextUnitPrice, currentUnitPrice: nextUnitPrice } : {}),
          };
        })
      );
    }

    if (debtInterestTotals.size > 0) {
      setDebts((prevDebts) =>
        prevDebts.map((debt) => {
          const accAmt = debtInterestTotals.get(debt.id);
          if (!accAmt) return debt;
          return {
            ...debt,
            balance: debt.balance + accAmt,
          };
        })
      );
    }

    showToast({
      type: 'success',
      title: 'Jurnal Penyesuaian Diterapkan',
      message: `${newTxs.length} jurnal non-kas berhasil diposting dan nilai aset investasi / utang pada Neraca telah disinkronkan.`,
      duration: 4500,
    });
  };

  const handleReverseAdjustingEntry = (txId: string) => {
    const target = transactions.find((t) => t.id === txId && t.isAdjustment);
    if (!target) return;
    handleDeleteTransaction(txId);
    showToast({
      type: 'info',
      title: 'Jurnal Penyesuaian Dibalikkan',
      message: `Entri "${target.description}" dihapus dan saldo aset/utang terkait dikembalikan.`,
      duration: 4000,
    });
  };

  // AI suggestion application handler
  const handleApplyBudgetSuggestion = (category: string, recommendedLimit: number) => {
    setBudgets((prev) => {
      const exists = prev.some((b) => b.category.toLowerCase() === category.toLowerCase());
      if (exists) {
        return prev.map((b) =>
          b.category.toLowerCase() === category.toLowerCase() ? { ...b, limit: recommendedLimit } : b
        );
      } else {
        // Add if not exist
        return [...prev, { category, type: 'expense', limit: recommendedLimit }];
      }
    });
  };

  // AI category consolidation handler: merges overly-specific transaction categories into a master category
  const handleConsolidateCategories = (sourceCategories: string[], targetCategory: string) => {
    const cleanTarget = targetCategory.trim();
    if (!cleanTarget || !Array.isArray(sourceCategories) || sourceCategories.length === 0) return;

    const sourceLowerSet = new Set(
      sourceCategories
        .map((s) => String(s || '').trim().toLowerCase())
        .filter((s) => s && s !== cleanTarget.toLowerCase())
    );

    if (sourceLowerSet.size === 0) return;

    const affectedTxCount = transactions.filter((t) =>
      sourceLowerSet.has(String(t.category || '').trim().toLowerCase())
    ).length;

    const changedAt = new Date().toISOString();
    setTransactions((prev) =>
      prev.map((t) => {
        const oldCat = String(t.category || '').trim();
        if (!sourceLowerSet.has(oldCat.toLowerCase())) return t;
        const nextHistory = [
          ...(Array.isArray(t.categoryHistory) ? t.categoryHistory : []),
          {
            fromCategory: oldCat || 'Tanpa Kategori',
            toCategory: cleanTarget,
            changedAt,
            source: 'Penggabungan Kategori AI',
          },
        ];
        return { ...t, category: cleanTarget, categoryHistory: nextHistory };
      })
    );

    setBudgets((prev) => {
      let extraLimit = 0;
      let inferredType: CategoryBudget['type'] = 'expense';

      const remaining = prev.filter((b) => {
        const lowerCat = String(b.category || '').trim().toLowerCase();
        if (sourceLowerSet.has(lowerCat)) {
          extraLimit += Number(b.limit) || 0;
          inferredType = b.type;
          return false;
        }
        return true;
      });

      const targetLower = cleanTarget.toLowerCase();
      const hasTarget = remaining.some((b) => String(b.category || '').trim().toLowerCase() === targetLower);

      if (hasTarget) {
        return remaining.map((b) =>
          String(b.category || '').trim().toLowerCase() === targetLower
            ? { ...b, limit: (Number(b.limit) || 0) + extraLimit }
            : b
        );
      }

      if (extraLimit > 0) {
        return [...remaining, { category: cleanTarget, type: inferredType, limit: extraLimit }];
      }

      return remaining;
    });

    showToast({
      type: 'success',
      title: 'Kategori Berhasil Digabungkan',
      message: `${sourceLowerSet.size} kategori (${affectedTxCount} transaksi) digabungkan ke kategori master "${cleanTarget}".`,
      duration: 4500,
    });
  };

  // Shared >30% category spending anomaly alert state for Dashboard & AI navigation indicator
  const anomalyDetectionResult = useMemo(
    () =>
      detectCategorySpendingAnomalies({
        transactions,
        budgets,
        accounts,
        masterCategories,
      }),
    [transactions, budgets, accounts, masterCategories]
  );

  const [dismissedAnomalyKeys, setDismissedAnomalyKeys] = useState<Set<string>>(() => new Set());
  const [dismissed7dAlertKeys, setDismissed7dAlertKeys] = useState<Set<string>>(() => new Set());
  const [pendingSmartCleanupTarget, setPendingSmartCleanupTarget] = useState<{
    category?: string;
    startDate?: string;
    endDate?: string;
    nonce: number;
  } | null>(null);

  const undismissedAnomalies = useMemo(
    () =>
      anomalyDetectionResult.anomalies.filter(
        (anom) => !dismissedAnomalyKeys.has(anom.anomalyKey)
      ),
    [anomalyDetectionResult.anomalies, dismissedAnomalyKeys]
  );

  const handleDismissAnomalies = () => {
    setDismissedAnomalyKeys((prev) => {
      const next = new Set(prev);
      anomalyDetectionResult.anomalies.forEach((anom) => {
        next.add(anom.anomalyKey);
      });
      return next;
    });
  };

  const sevenDayVelocityResult = useMemo(
    () => detect7DayFrequencyVelocityAlerts({ transactions }),
    [transactions]
  );

  const undismissed7dAlerts = useMemo(
    () =>
      sevenDayVelocityResult.alerts.filter(
        (item) => !dismissed7dAlertKeys.has(item.alertKey)
      ),
    [sevenDayVelocityResult.alerts, dismissed7dAlertKeys]
  );

  const handleDismiss7dAlerts = () => {
    setDismissed7dAlertKeys((prev) => {
      const next = new Set(prev);
      sevenDayVelocityResult.alerts.forEach((item) => {
        next.add(item.alertKey);
      });
      return next;
    });
  };

  const handleOpenAiSmartCleanup = (target?: {
    category?: string;
    startDate?: string;
    endDate?: string;
  }) => {
    if (target && (target.category || (target.startDate && target.endDate))) {
      setPendingSmartCleanupTarget({
        category: target.category,
        startDate: target.startDate,
        endDate: target.endDate,
        nonce: Date.now(),
      });
    } else {
      setPendingSmartCleanupTarget({
        category: undefined,
        nonce: Date.now(),
      });
    }
    setActiveTab('ai-analysis');
    setMobileMenuOpen(false);
    window.setTimeout(() => {
      const targetEl = document.getElementById('anomaly-smart-cleanup-section');
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 260);
  };

  // Targeted Smart Cleanup handler: moves only selected trigger transactions into a target budgeted category
  const handleReassignTransactionCategories = (
    transactionIds: string[],
    targetCategory: string
  ) => {
    const cleanTarget = targetCategory.trim();
    if (!cleanTarget || !Array.isArray(transactionIds) || transactionIds.length === 0) return;

    const idSet = new Set(transactionIds);
    const matchedCount = transactions.filter(
      (t) => idSet.has(t.id) && String(t.category || '').trim() !== cleanTarget
    ).length;

    if (matchedCount === 0) return;

    const changedAt = new Date().toISOString();
    setTransactions((prev) =>
      prev.map((t) => {
        if (!idSet.has(t.id)) return t;
        const oldCat = String(t.category || '').trim() || 'Tanpa Kategori';
        if (oldCat === cleanTarget) return t;
        const nextHistory = [
          ...(Array.isArray(t.categoryHistory) ? t.categoryHistory : []),
          {
            fromCategory: oldCat,
            toCategory: cleanTarget,
            changedAt,
            source: 'Smart Cleanup',
          },
        ];
        return { ...t, category: cleanTarget, categoryHistory: nextHistory };
      })
    );

    showToast({
      type: 'success',
      title: 'Smart Cleanup Diterapkan',
      message: `${matchedCount} transaksi pemicu berhasil dipindahkan ke kategori "${cleanTarget}".`,
      duration: 4500,
    });
  };

  // Atomic cross-category batch Smart Cleanup handler
  const handleBatchReassignTransactionCategories = (
    assignments: Array<{ transactionIds: string[]; targetCategory: string }>
  ) => {
    if (!Array.isArray(assignments) || assignments.length === 0) return;

    const txIdToTarget = new Map<string, string>();
    const targetCategorySet = new Set<string>();

    assignments.forEach((item) => {
      const cleanTarget = String(item.targetCategory || '').trim();
      if (!cleanTarget || !Array.isArray(item.transactionIds)) return;
      item.transactionIds.forEach((id) => {
        txIdToTarget.set(id, cleanTarget);
      });
    });

    if (txIdToTarget.size === 0) return;

    let movedCount = 0;
    transactions.forEach((t) => {
      const nextTarget = txIdToTarget.get(t.id);
      if (nextTarget && String(t.category || '').trim() !== nextTarget) {
        movedCount += 1;
        targetCategorySet.add(nextTarget);
      }
    });

    if (movedCount === 0) return;

    const changedAt = new Date().toISOString();
    setTransactions((prev) =>
      prev.map((t) => {
        const nextTarget = txIdToTarget.get(t.id);
        if (!nextTarget) return t;
        const oldCat = String(t.category || '').trim() || 'Tanpa Kategori';
        if (oldCat === nextTarget) return t;
        const nextHistory = [
          ...(Array.isArray(t.categoryHistory) ? t.categoryHistory : []),
          {
            fromCategory: oldCat,
            toCategory: nextTarget,
            changedAt,
            source: 'Smart Cleanup Massal',
          },
        ];
        return { ...t, category: nextTarget, categoryHistory: nextHistory };
      })
    );

    showToast({
      type: 'success',
      title: 'Smart Cleanup Massal Diterapkan',
      message: `${movedCount} transaksi pemicu dipindahkan ke ${targetCategorySet.size} kategori budget tujuan.`,
      duration: 4500,
    });
  };

  const [aiNavTooltipPos, setAiNavTooltipPos] = useState<{ top: number; left: number } | null>(null);
  const [showMobileAiTooltip, setShowMobileAiTooltip] = useState(false);

  const getDefaultCleanStarterData = () => {
    const cleanAccounts: Account[] = [
      { id: 'acc-1', name: 'Dompet Tunai', type: 'cash', startingBalance: 0, currentBalance: 0, coaCode: '1100' },
      { id: 'acc-2', name: 'Rekening Bank', type: 'bank', startingBalance: 0, currentBalance: 0, coaCode: '1200' },
      { id: 'acc-3', name: 'Gopay / E-Wallet', type: 'e-wallet', startingBalance: 0, currentBalance: 0, coaCode: '1300' },
    ];
    const cleanBudgets: CategoryBudget[] = [
      { category: 'Makanan', type: 'expense', limit: 0 },
      { category: 'Transportasi', type: 'expense', limit: 0 },
      { category: 'Hiburan', type: 'expense', limit: 0 },
      { category: 'Utilitas & Tagihan', type: 'expense', limit: 0 },
      { category: 'Belanja Bulanan', type: 'expense', limit: 0 },
      { category: 'Tabungan Darurat', type: 'saving', limit: 0 },
      { category: 'Investasi Saham', type: 'investment', limit: 0 },
    ];
    const cleanEmergencyConfig: EmergencyFundConfig = {
      jobStability: 'medium',
      dependents: 0,
      monthlyExpense: 0,
    };
    return { cleanAccounts, cleanBudgets, cleanEmergencyConfig };
  };

  // Reset to clean starting state (Delete all old transactions & user records, keep only clean default data with 0 balances)
  const handleResetData = () => {
    setResetConfirmText('');
    setShowResetDataModal(true);
  };

  const executeResetData = async () => {
    if (resetConfirmText.trim() !== 'HAPUS' || isResettingData) return;

    setIsResettingData(true);
    try {
      const { cleanAccounts, cleanBudgets, cleanEmergencyConfig } = getDefaultCleanStarterData();

      // 1. Wipe all historical/transactional states and restore only clean default starter data
      setTransactions([]);
      setAccounts(cleanAccounts);
      setBudgets(cleanBudgets);
      setDebts([]);
      setInvestments([]);
      setFixedAssets([]);
      setRecurringTransactions([]);
      setSavingsGoals([]);
      setEmergencyConfig(cleanEmergencyConfig);
      setEmergencyTransactions([]);
      setMasterCategories(DEFAULT_CATEGORY_HIERARCHY);
      setKprPresets(DEFAULT_KPR_PRESETS);
      setKprCoaMapping(DEFAULT_KPR_COA_MAPPING);
      setInvestmentGoals([]);
      setActiveTab('dashboard');

      // 2. Reset auxiliary master COA, logs, and investment goals back to clean default state
      hydrateMasterCoaAndLogs(DEFAULT_COA_LIST, [], true);
      saveStoredCategories(DEFAULT_CATEGORY_HIERARCHY);
      saveStoredKprPresets(DEFAULT_KPR_PRESETS);
      saveStoredKprCoaMapping(DEFAULT_KPR_COA_MAPPING);
      setCoaList([...DEFAULT_COA_LIST]);
      setMasterChangeLogs([]);
      window.dispatchEvent(new CustomEvent('nusantara:data-reset'));

      // 3. Immediately persist clean state to PostgreSQL (single source of truth)
      if (currentUser) {
        const activeUserId = currentUser.uid || (currentUser as any).id || `user-${currentUser.username}`;

        const cleanPayload = {
          transactions: [],
          accounts: cleanAccounts,
          budgets: cleanBudgets,
          debts: [],
          investments: [],
          fixedAssets: [],
          recurringTransactions: [],
          savingsGoals: [],
          emergencyConfig: cleanEmergencyConfig,
          emergencyTransactions: [],
          coaList: [...DEFAULT_COA_LIST],
          masterCategories: DEFAULT_CATEGORY_HIERARCHY,
          kprPresets: DEFAULT_KPR_PRESETS,
          kprCoaMapping: DEFAULT_KPR_COA_MAPPING,
          masterChangeLogs: [],
          investmentGoals: [],
          userFullName: currentUser.fullName,
          username: currentUser.username
        };

        lastPgSyncSignatureRef.current = `${activeUserId}:${JSON.stringify(cleanPayload)}`;
        await syncToPostgres(cleanPayload, activeUserId);

        if (cloudSync) {
          uploadFinancesToSheets({
            transactions: [],
            accounts: cleanAccounts,
            budgets: cleanBudgets,
            debts: [],
            investments: [],
            fixedAssets: [],
            emergencyFund: cleanEmergencyConfig,
            emergencyTransactions: [],
            investmentGoals: [],
          }).catch(() => {});
        }
      }

      setShowResetDataModal(false);
      setResetConfirmText('');
      showToast({
        type: 'success',
        title: 'Data Berhasil Direset ke Awal',
        message: 'Seluruh transaksi lama, utang, investasi, dan target telah dihapus di PostgreSQL. Hanya data default (saldo Rp 0) yang dipertahankan.',
        duration: 5000
      });
    } finally {
      setIsResettingData(false);
    }
  };

  const handleLoginSuccess = (
    user: User,
    dataChoice: 'empty' | 'sample',
    isNewRegistration = false
  ) => {
    pendingInitialSeedRef.current = isNewRegistration ? dataChoice : null;
    lastPgSyncSignatureRef.current = '';
    startupIntegrityCheckedUserRef.current = null;
    setIsPgHydrated(false);
    setPgHydrationError(null);
    setCurrentUser(user);
    secureStorage.setItem('fin_current_user', JSON.stringify(user));
    setActiveTab('dashboard');
  };

  const handleLogout = () => {
    setShowLogoutModal(true);
  };

  const executeLogout = () => {
    if (cloudSync) {
      try {
        logoutGoogleSheets();
      } catch {}
    }
    startupIntegrityCheckedUserRef.current = null;
    pendingInitialSeedRef.current = null;
    lastPgSyncSignatureRef.current = '';
    setIsPgHydrated(false);
    setPgHydrationError(null);
    setCurrentUser(null);
    secureStorage.removeItem('fin_current_user');
    setTransactions([]);
    setAccounts([]);
    setBudgets([]);
    setDebts([]);
    setInvestments([]);
    setFixedAssets([]);
    setRecurringTransactions([]);
    setSavingsGoals([]);
    setEmergencyConfig({ jobStability: 'medium', dependents: 0, monthlyExpense: 0 });
    setEmergencyTransactions([]);
    setMasterCategories(DEFAULT_CATEGORY_HIERARCHY);
    setKprPresets(DEFAULT_KPR_PRESETS);
    setKprCoaMapping(DEFAULT_KPR_COA_MAPPING);
    setInvestmentGoals([]);
    hydrateMasterCoaAndLogs(DEFAULT_COA_LIST, [], false);
    setCoaList([...DEFAULT_COA_LIST]);
    setMasterChangeLogs([]);
    setShowLogoutModal(false);
    setMobileMenuOpen(false);
  };

  const handleCloseOnboarding = () => {
    if (currentUser) {
      secureStorage.setItem(`fin_${currentUser.username}_onboarding_seen`, 'true');
    }
    setShowOnboarding(false);
  };

  // Helper calculation for total Emergency balance
  const totalEmergencyBalance = calculateTotalEmergencyFund(emergencyTransactions);

  // Extract credit cards and paylaters into virtual debts for AI analysis
  const accountDebtsForAi = accounts
    .filter(acc => acc.type === 'credit-card' || acc.type === 'paylater')
    .map(acc => {
      const defaultAPR = acc.type === 'credit-card' ? 21 : 24;
      const rate = acc.interestRate !== undefined ? acc.interestRate : defaultAPR;
      const bill = getAccountCreditBill(acc);
      const calculatedMin = Math.max(bill * 0.1, bill > 0 ? 50000 : 0);
      const min = acc.minPayment !== undefined ? acc.minPayment : calculatedMin;
      return {
        id: `acc-debt-${acc.id}`,
        name: acc.name,
        balance: bill,
        interestRate: rate,
        minPayment: min,
        purpose: 'consumptive' as const,
        category: acc.type === 'credit-card' ? 'Kartu Kredit' : 'PayLater / Fintech',
        dueDay: acc.dueDay,
      };
    });

  const combinedDebtsForAi = [
    ...debts,
    ...accountDebtsForAi
  ];

  if (!currentUser) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  if (!isPgHydrated) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl text-center space-y-5">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
            {pgHydrationError ? (
              <AlertTriangle className="h-7 w-7 text-rose-400" />
            ) : (
              <Database className="h-7 w-7 animate-pulse" />
            )}
          </div>

          {pgHydrationError ? (
            <>
              <div className="space-y-2">
                <h2 className="text-lg font-extrabold text-white">Gagal Memuat Data dari PostgreSQL</h2>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Untuk menjaga konsistensi saldo dan mencegah perbedaan data antar komputer, aplikasi hanya memuat data langsung dari PostgreSQL.
                </p>
                <div className="p-2.5 bg-rose-950/60 border border-rose-800/60 rounded-xl text-[11px] font-mono text-rose-300 break-words">
                  {pgHydrationError}
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setPgReloadCounter((c) => c + 1)}
                  className="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  <span>Coba Muat Ulang</span>
                </button>
                <button
                  type="button"
                  onClick={executeLogout}
                  className="py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 transition cursor-pointer"
                >
                  Keluar Akun
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <h2 className="text-lg font-extrabold text-white">Menyinkronkan Ledger PostgreSQL...</h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                Mengambil data rekening, transaksi, Master COA, kategori, dan portofolio terbaru untuk{' '}
                <strong className="text-slate-200">{currentUser.fullName || currentUser.username}</strong>.
              </p>
              <div className="flex items-center justify-center gap-2 pt-2 text-[11px] font-semibold text-blue-400">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                <span>PostgreSQL Single Source of Truth</span>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen lg:h-screen lg:overflow-hidden bg-slate-50 dark:bg-slate-950 flex font-sans text-slate-900 dark:text-slate-100 transition-colors duration-200">
      
      {/* SIDEBAR FOR DESKTOP */}
      <aside className="hidden lg:flex lg:h-full w-64 bg-slate-900 text-white flex-col shrink-0 border-r border-slate-800/80">
        <div className="p-6 flex items-center gap-3 border-b border-slate-800 shrink-0">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center font-bold text-white shadow-sm">N</div>
          <span className="text-xl font-bold tracking-tight text-white">Nusantara Wealth</span>
        </div>
        
        <nav className="flex-1 min-h-0 px-3 py-4 space-y-4 overflow-y-auto">
          {NAV_GROUPS.map((group) => {
            const isOpen = openNavGroups[group.groupName] ?? true;
            const hasActiveChild = group.items.some((item) => item.id === activeTab);

            return (
              <div key={group.groupName} className="space-y-1">
                <button
                  onClick={() => toggleNavGroup(group.groupName)}
                  className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider hover:text-slate-200 transition cursor-pointer group"
                >
                  <span className="flex items-center gap-1.5 truncate">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${hasActiveChild ? 'bg-blue-500 shadow-xs' : 'bg-slate-600'}`} />
                    {group.groupName}
                  </span>
                  {isOpen ? (
                    <ChevronDown className="h-3.5 w-3.5 text-slate-500 group-hover:text-slate-300 shrink-0" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-slate-500 group-hover:text-slate-300 shrink-0" />
                  )}
                </button>

                {isOpen && (
                  <div className="space-y-0.5 pl-1">
                    {group.items.map((tab) => {
                      const Icon = tab.icon;
                      const isActive = activeTab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          onClick={() => {
                            setActiveTab(tab.id);
                            setAiNavTooltipPos(null);
                            scrollWorkspaceToTop();
                          }}
                          onMouseEnter={(e) => {
                            if (tab.id === 'ai-analysis' && anomalyDetectionResult.anomalies.length > 0) {
                              const rect = e.currentTarget.getBoundingClientRect();
                              setAiNavTooltipPos({
                                top: Math.min(rect.top, window.innerHeight - 260),
                                left: rect.right + 10,
                              });
                            }
                          }}
                          onMouseLeave={() => {
                            if (tab.id === 'ai-analysis') {
                              setAiNavTooltipPos(null);
                            }
                          }}
                          onFocus={(e) => {
                            if (tab.id === 'ai-analysis' && anomalyDetectionResult.anomalies.length > 0) {
                              const rect = e.currentTarget.getBoundingClientRect();
                              setAiNavTooltipPos({
                                top: Math.min(rect.top, window.innerHeight - 260),
                                left: rect.right + 10,
                              });
                            }
                          }}
                          onBlur={() => {
                            if (tab.id === 'ai-analysis') {
                              setAiNavTooltipPos(null);
                            }
                          }}
                          className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer text-left ${
                            isActive
                              ? 'bg-blue-600 text-white font-semibold shadow-sm'
                              : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Icon
                              className={`h-4 w-4 shrink-0 ${
                                isActive
                                  ? 'text-white'
                                  : tab.isAi
                                  ? 'text-blue-400'
                                  : 'text-slate-400'
                              }`}
                            />
                            <span className="truncate">{tab.label}</span>
                          </div>
                          {tab.id === 'ai-analysis' && anomalyDetectionResult.anomalies.length > 0 ? (
                            <span
                              className={`px-1.5 py-0.5 text-[9px] font-black rounded whitespace-nowrap shrink-0 ${
                                isActive
                                  ? 'bg-amber-400 text-slate-950'
                                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                              }`}
                            >
                              {anomalyDetectionResult.anomalies.length} Anomali
                            </span>
                          ) : (
                            tab.badge && (
                              <span
                                className={`px-1.5 py-0.5 text-[9px] font-black rounded ${
                                  isActive
                                    ? 'bg-blue-700 text-white'
                                    : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                }`}
                              >
                                {tab.badge}
                              </span>
                            )
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {aiNavTooltipPos && anomalyDetectionResult.anomalies.length > 0 && (
          <div
            className="fixed z-50"
            style={{ top: aiNavTooltipPos.top, left: aiNavTooltipPos.left }}
          >
            <AnomalyTopSummaryTooltip detectionResult={anomalyDetectionResult} />
          </div>
        )}

        {/* Help Onboarding Trigger */}
        <div className="px-4 mb-3">
          <button
            onClick={() => setShowOnboarding(true)}
            className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-slate-800 text-xs font-bold text-slate-200 hover:text-white hover:bg-slate-700/80 transition-all cursor-pointer border border-slate-700/40"
          >
            <HelpCircle className="h-3.5 w-3.5" />
            Panduan Nusantara Wealth
          </button>
        </div>

        {/* User Card Segment */}
        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center justify-between bg-slate-800/40 p-2.5 rounded-xl border border-slate-800/60">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white font-extrabold text-sm shadow-inner shrink-0">
                {currentUser?.fullName ? currentUser.fullName.charAt(0).toUpperCase() : 'U'}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-100 truncate">{currentUser?.fullName || 'Pengguna'}</p>
                <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Premium Member</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              title="Keluar (Logout)"
              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition shrink-0 cursor-pointer"
            >
              <LogOut className="h-4.5 w-4.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* MAIN CONTAINER */}
      <div className="flex-1 flex flex-col min-h-screen lg:min-h-0 lg:h-full min-w-0">
        
        {/* Header */}
        <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4 sm:px-6 lg:px-8 shrink-0 sticky top-0 z-20 transition-colors duration-200 gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer shrink-0"
              title="Buka Navigasi"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            
            <h1 className="text-sm sm:text-base lg:text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight truncate hidden sm:block">
              {activeTab === 'dashboard' && 'Ringkasan Keuangan: Dashboard'}
              {activeTab === 'transactions' && 'Pencatatan Transaksi & Mutasi'}
              {activeTab === 'accounts' && 'Master Akun & Rekening Keuangan'}
              {activeTab === 'budget' && 'Rencana Anggaran & Batas Kategori'}
              {activeTab === 'emergency-fund' && 'Kalkulator & Dana Darurat'}
              {activeTab === 'debts' && 'Perhitungan Utang & Simulasi KPR'}
              {activeTab === 'investments' && 'Investasi & Manajemen Portofolio'}
              {activeTab === 'reports' && 'Laporan Keuangan Standar (PSAR / GAAP)'}
              {activeTab === 'ai-analysis' && 'Saran & Analisis Cerdas AI'}
              {activeTab === 'master-categories' && 'Master Data & Konfigurasi Keuangan'}
            </h1>

            {/* Quick Responsive Nav Dropdown for Compact Screens */}
            <div className="block sm:hidden md:block lg:hidden shrink-0">
              <select
                value={activeTab}
                onChange={(e) => {
                  setActiveTab(e.target.value);
                  scrollWorkspaceToTop();
                }}
                className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                {NAV_GROUPS.map((group) => (
                  <optgroup key={group.groupName} label={group.groupName}>
                    {group.items.map((tab) => (
                      <option key={tab.id} value={tab.id}>
                        {tab.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div className="hidden md:block text-right">
              <p className="text-[9px] text-slate-400 dark:text-slate-500 uppercase font-extrabold tracking-wider">Total Kas & Bank</p>
              <p className="text-xs sm:text-sm font-black text-blue-600 dark:text-blue-400 font-mono">
                {formatCurrencyIDR(calculateTotalLiquidCash(accounts))}
              </p>
            </div>
            
            {(() => {
              const totalSyncedIssues = coaScanResult.totalLedgerAnomalies + coaScanResult.totalDuplicates;
              return (
                <button
                  onClick={() => setShowIntegrityModal(true)}
                  className={`text-[10px] uppercase font-extrabold px-2.5 sm:px-3 py-1.5 rounded-lg border transition cursor-pointer flex items-center gap-1.5 shadow-2xs whitespace-nowrap shrink-0 ${
                    totalSyncedIssues > 0
                      ? 'text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-700/70 bg-rose-50/90 dark:bg-rose-950/40 hover:border-rose-400'
                      : 'text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 border-emerald-200 dark:border-emerald-700/60 hover:border-emerald-300 bg-emerald-50/80 dark:bg-emerald-900/30'
                  }`}
                  title="Pemeriksaan Integritas Akuntansi & Dual-Entry Ledger"
                >
                  {totalSyncedIssues > 0 ? (
                    <AlertTriangle className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                  ) : (
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  )}
                  <span className="hidden sm:inline">Audit Akuntansi</span>
                  {totalSyncedIssues > 0 && (
                    <span className="font-mono tabular-nums">({totalSyncedIssues})</span>
                  )}
                </button>
              );
            })()}

            <button
              onClick={() => setShowBackupModal(true)}
              className="text-[10px] uppercase font-extrabold text-blue-700 dark:text-blue-400 hover:text-blue-800 border border-blue-200 dark:border-blue-700/60 hover:border-blue-300 px-2.5 sm:px-3 py-1.5 rounded-lg transition cursor-pointer bg-blue-50/80 dark:bg-blue-900/30 flex items-center gap-1.5 shadow-2xs"
              title="Cadangkan Seluruh Data Aplikasi ke File JSON Terenkripsi"
            >
              <Shield className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
              <span className="hidden sm:inline">Backup</span>
            </button>

            <GlobalUserMenu currentUser={currentUser} onLogout={handleLogout} />
          </div>
        </header>

        {/* MOBILE DRAWER NAVIGATION */}
        {mobileMenuOpen && (
          <div className="lg:hidden bg-slate-900 text-white p-4 space-y-4 border-b border-slate-800 sticky top-16 z-20 shadow-xl max-h-[80vh] overflow-y-auto">
            {NAV_GROUPS.map((group) => (
              <div key={group.groupName} className="space-y-1">
                <div className="px-2 py-1 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider border-b border-slate-800/80 mb-1">
                  {group.groupName}
                </div>
                {group.items.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <div key={tab.id} className="relative">
                      <button
                        onClick={() => {
                          setActiveTab(tab.id);
                          setShowMobileAiTooltip(false);
                          setMobileMenuOpen(false);
                        }}
                        onMouseEnter={() => {
                          if (tab.id === 'ai-analysis' && anomalyDetectionResult.anomalies.length > 0) {
                            setShowMobileAiTooltip(true);
                          }
                        }}
                        onMouseLeave={() => {
                          if (tab.id === 'ai-analysis') setShowMobileAiTooltip(false);
                        }}
                        onFocus={() => {
                          if (tab.id === 'ai-analysis' && anomalyDetectionResult.anomalies.length > 0) {
                            setShowMobileAiTooltip(true);
                          }
                        }}
                        onBlur={() => {
                          if (tab.id === 'ai-analysis') setShowMobileAiTooltip(false);
                        }}
                        className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-bold transition ${
                          isActive
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-white' : tab.isAi ? 'text-blue-400' : 'text-slate-400'}`} />
                          <span className="truncate">{tab.label}</span>
                        </div>
                        {tab.id === 'ai-analysis' && anomalyDetectionResult.anomalies.length > 0 ? (
                          <span
                            className={`px-1.5 py-0.5 text-[9px] font-black rounded whitespace-nowrap shrink-0 ${
                              isActive ? 'bg-amber-400 text-slate-950' : 'bg-amber-500/20 text-amber-300'
                            }`}
                          >
                            {anomalyDetectionResult.anomalies.length} Anomali
                          </span>
                        ) : (
                          tab.badge && (
                            <span className={`px-1.5 py-0.5 text-[9px] font-black rounded ${isActive ? 'bg-blue-700 text-white' : 'bg-blue-500/20 text-blue-300'}`}>
                              {tab.badge}
                            </span>
                          )
                        )}
                      </button>

                      {tab.id === 'ai-analysis' &&
                        showMobileAiTooltip &&
                        anomalyDetectionResult.anomalies.length > 0 && (
                          <div className="mt-1.5 z-40">
                            <AnomalyTopSummaryTooltip detectionResult={anomalyDetectionResult} />
                          </div>
                        )}
                    </div>
                  );
                })}
              </div>
            ))}

            <div className="pt-3 border-t border-slate-800 space-y-2.5">
              <div className="flex items-center gap-3 px-3 py-2 bg-slate-800/60 rounded-xl border border-slate-800">
                <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-extrabold text-xs shrink-0">
                  {currentUser?.fullName ? currentUser.fullName.charAt(0).toUpperCase() : 'U'}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-100 truncate">{currentUser?.fullName || 'Pengguna'}</p>
                  <p className="text-[10px] text-slate-400 truncate">@{currentUser?.username || 'user'} • Premium Member</p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-xs font-bold uppercase tracking-wider text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
              >
                <LogOut className="h-4.5 w-4.5 shrink-0" />
                Keluar (Logout)
              </button>
            </div>
          </div>
        )}

        {/* VIEW BODY CONTENT */}
        <div
          ref={mainScrollRef}
          className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-slate-50 dark:bg-slate-950 transition-colors duration-200"
        >
          <div className="max-w-7xl mx-auto">
            {/* Render Active Tab with Smooth Fade-in Transition */}
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.22, ease: 'easeInOut' }}
              >
                {activeTab === 'dashboard' && (
                  <DashboardTab
                    transactions={transactions}
                    accounts={accounts}
                    budgets={budgets}
                    debts={debts}
                    emergencyConfig={emergencyConfig}
                    emergencyTransactions={emergencyTransactions}
                    investments={investments}
                    fixedAssets={fixedAssets}
                    savingsGoals={savingsGoals}
                    onAddSavingsGoal={handleAddSavingsGoal}
                    onUpdateSavingsGoal={handleUpdateSavingsGoal}
                    onDeleteSavingsGoal={handleDeleteSavingsGoal}
                    onDepositSavingsGoal={handleDepositSavingsGoal}
                    onSyncFixedAssetDepreciation={handleSyncFixedAssetDepreciation}
                    onSyncAllFixedAssetDepreciations={handleSyncAllFixedAssetDepreciations}
                    anomalyDetection={anomalyDetectionResult}
                    hasUndismissedAnomalies={undismissedAnomalies.length > 0}
                    onDismissAnomalies={handleDismissAnomalies}
                    sevenDayVelocityResult={sevenDayVelocityResult}
                    hasUndismissed7dAlerts={undismissed7dAlerts.length > 0}
                    onDismiss7dAlerts={handleDismiss7dAlerts}
                    onOpenSmartCleanup={handleOpenAiSmartCleanup}
                    onQuickAction={(tab) => {
                      setActiveTab(tab);
                      scrollWorkspaceToTop();
                    }}
                  />
                )}

                {activeTab === 'transactions' && (
                  <TransactionsTab
                    transactions={transactions}
                    accounts={accounts}
                    budgets={budgets}
                    debts={debts}
                    investments={investments}
                    recurringTransactions={recurringTransactions}
                    masterCategories={masterCategories}
                    kprCoaMapping={kprCoaMapping}
                    preselectedPayDebtId={pendingPayDebtId}
                    onClearPreselectedPayDebt={() => setPendingPayDebtId(null)}
                    onAddTransaction={handleAddTransaction}
                    onDeleteTransaction={handleDeleteTransaction}
                    onTransferFunds={handleTransferFunds}
                    onAddRecurringTransaction={handleAddRecurringTransaction}
                    onUpdateRecurringTransaction={handleUpdateRecurringTransaction}
                    onDeleteRecurringTransaction={handleDeleteRecurringTransaction}
                    onToggleRecurringTransaction={handleToggleRecurringTransaction}
                    onManualRunRecurring={handleManualRunRecurringTransaction}
                    onBatchUpdateCategories={handleBatchUpdateCategories}
                  />
                )}

                {activeTab === 'accounts' && (
                  <AccountsTab
                    accounts={accounts}
                    transactions={transactions}
                    onUpdateAccountBalance={handleUpdateAccountBalance}
                    onAddAccountWithNumber={handleAddAccount}
                    onDeleteAccount={handleDeleteAccount}
                    onTransferFunds={handleTransferFunds}
                    onAddTransaction={handleAddTransaction}
                  />
                )}

                {activeTab === 'budget' && (
                  <BudgetTab
                    accounts={accounts}
                    budgets={budgets}
                    transactions={transactions}
                    masterCategories={masterCategories}
                    onUpdateBudgetLimit={handleUpdateBudgetLimit}
                    onAddBudgetCategory={handleAddBudgetCategory}
                    onDeleteBudgetCategory={handleDeleteBudgetCategory}
                    onNavigateToAccounts={() => {
                      setActiveTab('accounts');
                      scrollWorkspaceToTop();
                    }}
                  />
                )}

                {activeTab === 'emergency-fund' && (
                  <EmergencyFundTab
                    config={emergencyConfig}
                    transactions={emergencyTransactions}
                    onUpdateConfig={handleUpdateEmergencyConfig}
                    onAddTransaction={handleAddEmergencyTx}
                    onDeleteTransaction={handleDeleteEmergencyTx}
                  />
                )}

                {activeTab === 'debts' && (
                  <DebtTab
                    debts={debts}
                    accounts={accounts}
                    transactions={transactions}
                    kprPresets={kprPresets}
                    kprCoaMapping={kprCoaMapping}
                    onAddDebt={handleAddDebt}
                    onDeleteDebt={handleDeleteDebt}
                    onNavigateToPayDebt={(debtId) => {
                      setPendingPayDebtId(debtId || '__choose__');
                      setActiveTab('transactions');
                      scrollWorkspaceToTop();
                    }}
                  />
                )}

                {activeTab === 'investments' && (
                  <InvestmentTab
                    investments={investments}
                    transactions={transactions}
                    accounts={accounts}
                    fixedAssets={fixedAssets}
                    debts={debts}
                    investmentGoals={investmentGoals}
                    onUpdateInvestmentGoals={setInvestmentGoals}
                    onUpdateInvestment={handleUpdateInvestment}
                    onAddFixedAsset={handleAddFixedAsset}
                    onUpdateFixedAsset={handleUpdateFixedAsset}
                    onDeleteFixedAsset={handleDeleteFixedAsset}
                    onAddFixedAssetAdjustment={handleAddFixedAssetAdjustment}
                    onDeleteFixedAssetAdjustment={handleDeleteFixedAssetAdjustment}
                    onSyncFixedAssetDepreciation={handleSyncFixedAssetDepreciation}
                    onAddTransaction={handleAddTransaction}
                  />
                )}

                {activeTab === 'master-categories' && (
                  <ErrorBoundary fallbackTitle="Master Data Kategori & COA">
                    <MasterCategoryManager
                      categories={masterCategories}
                      accounts={accounts}
                      transactions={transactions}
                      kprPresets={kprPresets}
                      kprCoaMapping={kprCoaMapping}
                      onUpdateKprPresets={(updated) => setKprPresets(updated)}
                      onResetKprPresets={() => setKprPresets(resetStoredKprPresets())}
                      onUpdateKprCoaMapping={(updated) => setKprCoaMapping(updated)}
                      onResetKprCoaMapping={() => setKprCoaMapping(resetStoredKprCoaMapping())}
                      onUpdateCategories={(newCats) => setMasterCategories(newCats)}
                      onResetToDefault={() => setMasterCategories(DEFAULT_CATEGORY_HIERARCHY)}
                      onOpenBackupModal={() => setShowBackupModal(true)}
                      onUpdateAccounts={(updated) => setAccounts(updated)}
                      onFactoryReset={() => {
                        const { resetAccounts } = factoryResetMasterData();
                        setAccounts(resetAccounts);
                        setMasterCategories(DEFAULT_CATEGORY_HIERARCHY);
                        setKprPresets(resetStoredKprPresets());
                        setKprCoaMapping(resetStoredKprCoaMapping());
                      }}
                      onReassignTransactionCategory={(txId, newCategory) => {
                        setTransactions((prev) =>
                          prev.map((t) => (t.id === txId ? { ...t, category: newCategory } : t))
                        );
                      }}
                      onBulkMoveTransactions={(sourceCategories, targetCategory) => {
                        setTransactions((prev) =>
                          prev.map((t) =>
                            sourceCategories.includes(t.category)
                              ? { ...t, category: targetCategory }
                              : t
                          )
                        );
                      }}
                    />
                  </ErrorBoundary>
                )}

                {activeTab === 'reports' && (
                  <ReportsTab
                    transactions={transactions}
                    accounts={accounts}
                    journalLines={journalLedger.lines}
                    coaList={coaList}
                    budgets={budgets}
                    debts={debts}
                    investments={investments}
                    emergencyTransactions={emergencyTransactions}
                    fixedAssets={fixedAssets}
                    masterCategories={masterCategories}
                    kprCoaMapping={kprCoaMapping}
                    onUpdateMasterCategories={(newCats) => setMasterCategories(newCats)}
                    onResetMasterCategories={() => setMasterCategories(DEFAULT_CATEGORY_HIERARCHY)}
                    onUpdateAccounts={(updated) => setAccounts(updated)}
                    onUpdateTransactions={(updated) => setTransactions(updated)}
                    onUpdateInvestments={(updated) => setInvestments(updated)}
                    onApplyAdjustments={handleApplyAdjustingEntries}
                    onReverseAdjustment={handleReverseAdjustingEntry}
                    onOpenIntegrityModal={() => setShowIntegrityModal(true)}
                    coaScanResult={coaScanResult}
                    onRescanCoa={handleRescanCoa}
                  />
                )}

                {activeTab === 'ai-analysis' && (
                  <AiAnalysisTab
                    transactions={transactions}
                    budgets={budgets}
                    accounts={accounts}
                    recurringTransactions={recurringTransactions}
                    debts={combinedDebtsForAi}
                    emergencyConfig={emergencyConfig}
                    emergencyBalance={totalEmergencyBalance}
                    investments={investments}
                    masterCategories={masterCategories}
                    externalCleanupTarget={pendingSmartCleanupTarget}
                    onApplyBudgetSuggestion={handleApplyBudgetSuggestion}
                    onConsolidateCategories={handleConsolidateCategories}
                    onReassignTransactionCategories={handleReassignTransactionCategories}
                    onBatchReassignTransactionCategories={handleBatchReassignTransactionCategories}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* MODERN FOOTER */}
        <footer className="bg-white border-t border-slate-200 py-4 text-center text-[10px] text-slate-400 font-bold uppercase tracking-widest shrink-0">
          <p>Nusantara Wealth Keuangan AI • Powered by Gemini & Professional Polish Design</p>
        </footer>

        {/* Onboarding Tutorial Modal */}
        <OnboardingModal
          isOpen={showOnboarding}
          onClose={handleCloseOnboarding}
          username={currentUser ? currentUser.fullName : ''}
          isCloudSyncActive={cloudSync}
        />

        {/* LOGOUT CONFIRMATION MODAL */}
        {showLogoutModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4 animate-fadeIn">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5">
              <div className="flex items-center gap-3.5">
                <div className="p-3 bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 rounded-xl shrink-0">
                  <LogOut className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 dark:text-slate-100 text-base">Konfirmasi Keluar (Logout)</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                    Apakah Anda yakin ingin keluar dari akun Nusantara Wealth?
                  </p>
                </div>
              </div>

              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300">
                Pengguna saat ini: <strong className="text-slate-900 dark:text-slate-100 font-black">{currentUser?.fullName || currentUser?.username}</strong>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={() => setShowLogoutModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  onClick={executeLogout}
                  className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md transition cursor-pointer flex items-center gap-2"
                >
                  <LogOut className="h-4 w-4" />
                  Ya, Keluar Akun
                </button>
              </div>
            </div>
          </div>
        )}

        {/* RESET DATA MODAL */}
        {showResetDataModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4 animate-fadeIn">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5">
              <div className="flex items-center gap-3.5">
                <div className="p-3 bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 rounded-xl shrink-0">
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 dark:text-slate-100 text-base">Reset Seluruh Data Keuangan</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                    Menghapus seluruh transaksi lama, utang, investasi, transaksi berulang, dan target, serta menyisakan data default awal (saldo Rp 0).
                  </p>
                </div>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl text-[11px] text-slate-600 dark:text-slate-300 space-y-1">
                <p className="font-bold text-slate-800 dark:text-slate-200">Yang akan dipertahankan (kondisi awal Rp 0):</p>
                <p>• Akun default (Dompet Tunai, Rekening Bank, Gopay / E-Wallet) saldo Rp 0</p>
                <p>• Kategori master, COA standar, &amp; anggaran default limit Rp 0</p>
              </div>

              <div className="space-y-3">
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
                  Untuk mengonfirmasi penghapusan permanen (lokal &amp; cloud), ketik kata <strong className="text-rose-600 font-black">HAPUS</strong> di bawah ini:
                </p>
                <input
                  type="text"
                  placeholder="Ketik HAPUS"
                  value={resetConfirmText}
                  onChange={(e) => setResetConfirmText(e.target.value)}
                  disabled={isResettingData}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white uppercase focus:outline-none focus:ring-2 focus:ring-rose-500/50"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={() => {
                    setShowResetDataModal(false);
                    setResetConfirmText('');
                  }}
                  disabled={isResettingData}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  disabled={resetConfirmText.trim() !== 'HAPUS' || isResettingData}
                  onClick={executeResetData}
                  className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 dark:disabled:bg-slate-800 text-white font-bold text-xs shadow-md transition cursor-pointer disabled:cursor-not-allowed"
                >
                  {isResettingData ? 'Mereset Data...' : 'Reset Semua Data'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* BACKUP & RESTORE DATA MODAL */}
        <BackupDataModal
          isOpen={showBackupModal}
          onClose={() => setShowBackupModal(false)}
          currentUser={currentUser}
          appData={{
            transactions,
            accounts,
            budgets,
            debts,
            investments,
            fixedAssets,
            emergencyConfig,
            emergencyTransactions,
            journalEntries: journalLedger.entries,
            journalLines: journalLedger.lines,
            masterCategories,
            recurringTransactions,
            savingsGoals,
          }}
          onRestoreData={handleRestoreData}
          onOpenResetModal={handleResetData}
        />

        {/* ACCOUNTING INTEGRITY AUDIT MODAL */}
        <AccountingIntegrityModal
          isOpen={showIntegrityModal}
          onClose={() => setShowIntegrityModal(false)}
          accounts={accounts}
          transactions={transactions}
          masterCategories={masterCategories}
          coaScanResult={coaScanResult}
          onRescanCoa={handleRescanCoa}
          onUpdateAccounts={(updatedAccs) => setAccounts(updatedAccs)}
          onUpdateTransactions={(updatedTxs) => setTransactions(updatedTxs)}
          onHarmonize={(updatedAccs, missingCategories) => {
            if (missingCategories.length > 0) {
              const updatedTree = JSON.parse(JSON.stringify(masterCategories)) as CategoryNode[];
              const expGroup = updatedTree.find((n) => n.id === 'cat-exp' || n.name.toLowerCase().includes('pengeluaran'));
              if (expGroup && expGroup.children) {
                const otherGroup = expGroup.children.find((c) => c.name.toLowerCase().includes('lain'));
                missingCategories.forEach((catName) => {
                  const newNode: CategoryNode = {
                    id: `cat-auto-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
                    name: catName,
                    type: 'item',
                    transactionType: 'expense',
                  };
                  if (otherGroup && otherGroup.children) {
                    otherGroup.children.push(newNode);
                  } else if (expGroup.children) {
                    expGroup.children.push(newNode);
                  }
                });
                setMasterCategories(updatedTree);
              }
            }
            handleRescanCoa();
            setShowIntegrityModal(false);
            showToast({
              type: 'success',
              title: 'Sistem Akuntansi Diharmoniskan',
              message: 'Chart of Accounts (COA) dan relasi akun berhasil diharmoniskan.',
            });
          }}
          onApplyAdjustmentEntries={(adjEntries) => {
            const newTransactions: Transaction[] = adjEntries.map((e, idx) => ({
              ...e,
              amount: normalizeAbsAmount(e.amount),
              id: `tx-adj-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
            }));

            // Update transactions list
            const updatedTxList = [...transactions, ...newTransactions];
            setTransactions(updatedTxList);

            // Update account current balances & credit card usedLimit consistently
            setAccounts((prevAccounts) =>
              applyTransactionsToAccounts(prevAccounts, newTransactions, 'apply')
            );
          }}
        />

        {/* DATA CONFLICT RESOLUTION MODAL */}
        <SyncConflictModal
          isOpen={conflictState.isOpen}
          localData={conflictState.localData}
          cloudData={conflictState.cloudData}
          onClose={() => setConflictState((prev) => ({ ...prev, isOpen: false }))}
          onSelectLocal={() => {
            setConflictState((prev) => ({ ...prev, isOpen: false }));
            if (currentUser) {
              const activeUserId = currentUser.uid || (currentUser as any).id || `user-${currentUser.username}`;
              syncToPostgres({
                transactions,
                accounts,
                budgets,
                debts,
                investments,
                fixedAssets,
                recurringTransactions,
                savingsGoals,
                emergencyConfig,
                emergencyTransactions,
                coaList,
                masterCategories,
                kprPresets,
                kprCoaMapping,
                masterChangeLogs,
                investmentGoals,
                journalEntries: journalLedger.entries,
                journalLines: journalLedger.lines,
                userFullName: currentUser.fullName,
                username: currentUser.username
              }, activeUserId);
            }
            showToast({
              type: 'info',
              title: 'Pilihan Data PostgreSQL Diaktifkan',
              message: 'Data utama dari PostgreSQL dipertahankan dan disinkronkan.'
            });
          }}
          onSelectCloud={() => {
            setConflictState((prev) => ({ ...prev, isOpen: false }));
            applySyncPackage({
              recurringTransactions,
              savingsGoals,
              coaList,
              masterCategories,
              kprPresets,
              kprCoaMapping,
              masterChangeLogs,
              investmentGoals,
              ...conflictState.cloudData,
            });
            showToast({
              type: 'info',
              title: 'Pilihan Versi Cloud Diaktifkan',
              message: 'Data dari Google Sheets diterapkan dan akan disinkronkan ke PostgreSQL.'
            });
          }}
          onMerge={(mergedPkg) => {
            setConflictState((prev) => ({ ...prev, isOpen: false }));
            const fullMerged = applySyncPackage({
              recurringTransactions,
              savingsGoals,
              coaList,
              masterCategories,
              kprPresets,
              kprCoaMapping,
              masterChangeLogs,
              investmentGoals,
              ...mergedPkg,
            });
            if (currentUser) {
              const activeUserId = currentUser.uid || (currentUser as any).id || `user-${currentUser.username}`;
              syncToPostgres({
                ...fullMerged,
                userFullName: currentUser.fullName,
                username: currentUser.username
              }, activeUserId);
            }
            showToast({
              type: 'success',
              title: 'Data Berhasil Digabungkan (Merged)',
              message: 'Seluruh catatan transaksi & rekening unik digabungkan dengan sukses ke PostgreSQL.'
            });
          }}
        />

        {/* GLOBAL TOAST NOTIFICATIONS */}
        <GlobalToastContainer />

      </div>
    </div>
  );
};

