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
import { useState, useEffect, useRef } from 'react';
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
  User,
  RecurringTransaction,
  SavingsGoal,
  KprPreset,
  KprCoaMappingConfig
} from './types';
import {
  DEFAULT_KPR_COA_MAPPING,
  DEFAULT_KPR_PRESETS,
  getStoredKprPresets,
  saveStoredKprPresets,
  resetStoredKprPresets,
  getStoredKprCoaMapping,
  saveStoredKprCoaMapping,
  resetStoredKprCoaMapping,
  resolveEffectiveKprCoaMapping
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
  getStoredCategories, 
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
import {
  validateMasterIntegrityOnLoad,
  getStoredCoaList,
  getAccountCoaMapping,
  factoryResetMasterData,
  DEFAULT_COA_LIST,
  saveStoredCoaList,
  clearMasterChangeLogs,
  scanCoaDuplicatesAndUnused,
  CoaScanResult
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
  FolderTree
} from 'lucide-react';

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const mainScrollRef = useRef<HTMLDivElement | null>(null);

  const scrollWorkspaceToTop = () => {
    mainScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // --- 1. CURRENT USER STATE ---
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = secureStorage.getItem('fin_current_user');
    return saved ? JSON.parse(saved) : null;
  });

  // --- 2. CORE STATES WITH LOCALSTORAGE PERSISTENCE (USER SPECIFIC) ---
  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    const user = secureStorage.getItem('fin_current_user');
    if (user) {
      const u: User = JSON.parse(user);
      const saved = secureStorage.getItem(`fin_${u.username}_transactions`);
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });

  const [accounts, setAccounts] = useState<Account[]>(() => {
    const user = secureStorage.getItem('fin_current_user');
    if (user) {
      const u: User = JSON.parse(user);
      const saved = secureStorage.getItem(`fin_${u.username}_accounts`);
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });

  const [budgets, setBudgets] = useState<CategoryBudget[]>(() => {
    const user = secureStorage.getItem('fin_current_user');
    if (user) {
      const u: User = JSON.parse(user);
      const saved = secureStorage.getItem(`fin_${u.username}_budgets`);
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });

  const [debts, setDebts] = useState<Debt[]>(() => {
    const user = secureStorage.getItem('fin_current_user');
    if (user) {
      const u: User = JSON.parse(user);
      const saved = secureStorage.getItem(`fin_${u.username}_debts`);
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });

  const [investments, setInvestments] = useState<InvestmentAsset[]>(() => {
    const user = secureStorage.getItem('fin_current_user');
    if (user) {
      const u: User = JSON.parse(user);
      const saved = secureStorage.getItem(`fin_${u.username}_investments`);
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });

  const [fixedAssets, setFixedAssets] = useState<FixedAsset[]>(() => {
    const user = secureStorage.getItem('fin_current_user');
    if (user) {
      const u: User = JSON.parse(user);
      const saved = secureStorage.getItem(`fin_${u.username}_fixed_assets`);
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });

  const [emergencyConfig, setEmergencyConfig] = useState<EmergencyFundConfig>(() => {
    const user = secureStorage.getItem('fin_current_user');
    if (user) {
      const u: User = JSON.parse(user);
      const saved = secureStorage.getItem(`fin_${u.username}_emergency_config`);
      return saved ? JSON.parse(saved) : { jobStability: 'medium', dependents: 0, monthlyExpense: 0 };
    }
    return { jobStability: 'medium', dependents: 0, monthlyExpense: 0 };
  });

  const [emergencyTransactions, setEmergencyTransactions] = useState<EmergencyFundTransaction[]>(() => {
    const user = secureStorage.getItem('fin_current_user');
    if (user) {
      const u: User = JSON.parse(user);
      const saved = secureStorage.getItem(`fin_${u.username}_emergency_transactions`);
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });

  // --- MASTER CATEGORIES STATE (HIERARCHICAL) ---
  const [masterCategories, setMasterCategories] = useState<CategoryNode[]>(() => {
    const user = secureStorage.getItem('fin_current_user');
    const u = user ? JSON.parse(user) : null;
    return getStoredCategories(u?.username);
  });

  useEffect(() => {
    saveStoredCategories(masterCategories, currentUser?.username);
  }, [masterCategories, currentUser]);

  // --- KPR PRESETS & COA MAPPING STATE ---
  const [kprPresets, setKprPresets] = useState<KprPreset[]>(() => {
    const user = secureStorage.getItem('fin_current_user');
    const u = user ? JSON.parse(user) : null;
    return getStoredKprPresets(u?.username);
  });

  useEffect(() => {
    saveStoredKprPresets(kprPresets, currentUser?.username);
  }, [kprPresets, currentUser]);

  const [kprCoaMapping, setKprCoaMapping] = useState<KprCoaMappingConfig>(() => {
    const user = secureStorage.getItem('fin_current_user');
    const u = user ? JSON.parse(user) : null;
    return getStoredKprCoaMapping(u?.username);
  });

  useEffect(() => {
    saveStoredKprCoaMapping(kprCoaMapping, currentUser?.username);
  }, [kprCoaMapping, currentUser]);

  // --- RECURRING TRANSACTIONS STATE ---
  const [recurringTransactions, setRecurringTransactions] = useState<RecurringTransaction[]>(() => {
    const user = secureStorage.getItem('fin_current_user');
    if (user) {
      const u: User = JSON.parse(user);
      const saved = secureStorage.getItem(`fin_${u.username}_recurring_transactions`);
      if (saved !== null) return JSON.parse(saved);
    }
    return [];
  });

  // Sync recurring transactions to localStorage
  useEffect(() => {
    if (currentUser) {
      secureStorage.setItem(`fin_${currentUser.username}_recurring_transactions`, JSON.stringify(recurringTransactions));
    }
  }, [recurringTransactions, currentUser]);

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
  const [savingsGoals, setSavingsGoals] = useState<SavingsGoal[]>(() => {
    const user = secureStorage.getItem('fin_current_user');
    if (user) {
      const u: User = JSON.parse(user);
      const saved = secureStorage.getItem(`fin_${u.username}_savings_goals`);
      if (saved !== null) return JSON.parse(saved);
    }
    return [];
  });

  // Sync savings goals to localStorage
  useEffect(() => {
    if (currentUser) {
      secureStorage.setItem(`fin_${currentUser.username}_savings_goals`, JSON.stringify(savingsGoals));
    }
  }, [savingsGoals, currentUser]);

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

  // Automatic scheduled transaction processing on mount / active user
  useEffect(() => {
    if (!currentUser || recurringTransactions.length === 0) return;

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
  }, [currentUser]);

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
    scanCoaDuplicatesAndUnused(getStoredCoaList(), accounts, transactions)
  );

  const handleRescanCoa = (): CoaScanResult => {
    const freshScan = scanCoaDuplicatesAndUnused(getStoredCoaList(), accounts, transactions);
    setCoaScanResult(freshScan);
    return freshScan;
  };

  useEffect(() => {
    setCoaScanResult(scanCoaDuplicatesAndUnused(getStoredCoaList(), accounts, transactions));
  }, [accounts, transactions, showIntegrityModal, activeTab]);

  // --- AUTOMATIC DATA INTEGRITY VALIDATION ON APPLICATION LOAD ---
  useEffect(() => {
    if (!currentUser || (accounts.length === 0 && transactions.length === 0)) return;
    if (startupIntegrityCheckedUserRef.current === currentUser.username) return;
    startupIntegrityCheckedUserRef.current = currentUser.username;

    const coaList = getStoredCoaList();
    const result = validateMasterIntegrityOnLoad(accounts, coaList, transactions);

    // If orphaned accounts, unlinked COAs, orphaned transactions, or duplicate ledger entries exist, prompt user
    if (!result.isValid || result.totalIssuesCount > 0) {
      setShowIntegrityModal(true);
    }
  }, [currentUser, accounts, transactions]);

  const handleRestoreData = (restoredData: any) => {
    if (!currentUser) return;
    const username = currentUser.username;

    if (Array.isArray(restoredData.transactions)) {
      setTransactions(restoredData.transactions);
      secureStorage.setItem(`fin_${username}_transactions`, JSON.stringify(restoredData.transactions));
    }
    if (Array.isArray(restoredData.accounts)) {
      setAccounts(restoredData.accounts);
      secureStorage.setItem(`fin_${username}_accounts`, JSON.stringify(restoredData.accounts));
    }
    if (Array.isArray(restoredData.budgets)) {
      setBudgets(restoredData.budgets);
      secureStorage.setItem(`fin_${username}_budgets`, JSON.stringify(restoredData.budgets));
    }
    if (Array.isArray(restoredData.debts)) {
      setDebts(restoredData.debts);
      secureStorage.setItem(`fin_${username}_debts`, JSON.stringify(restoredData.debts));
    }
    if (Array.isArray(restoredData.investments)) {
      setInvestments(restoredData.investments);
      secureStorage.setItem(`fin_${username}_investments`, JSON.stringify(restoredData.investments));
    }
    if (Array.isArray(restoredData.fixedAssets)) {
      setFixedAssets(restoredData.fixedAssets);
      secureStorage.setItem(`fin_${username}_fixed_assets`, JSON.stringify(restoredData.fixedAssets));
    }
    if (restoredData.emergencyConfig) {
      setEmergencyConfig(restoredData.emergencyConfig);
      secureStorage.setItem(`fin_${username}_emergency_config`, JSON.stringify(restoredData.emergencyConfig));
    }
    if (Array.isArray(restoredData.emergencyTransactions)) {
      setEmergencyTransactions(restoredData.emergencyTransactions);
      secureStorage.setItem(`fin_${username}_emergency_transactions`, JSON.stringify(restoredData.emergencyTransactions));
    }
    if (Array.isArray(restoredData.masterCategories)) {
      setMasterCategories(restoredData.masterCategories);
      saveStoredCategories(restoredData.masterCategories, username);
    }
    if (Array.isArray(restoredData.recurringTransactions)) {
      setRecurringTransactions(restoredData.recurringTransactions);
      secureStorage.setItem(`fin_${username}_recurring_transactions`, JSON.stringify(restoredData.recurringTransactions));
    }
    if (Array.isArray(restoredData.savingsGoals)) {
      setSavingsGoals(restoredData.savingsGoals);
      secureStorage.setItem(`fin_${username}_savings_goals`, JSON.stringify(restoredData.savingsGoals));
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

  // --- Cloud Sync State ---
  const [cloudSync, setCloudSync] = useState<boolean>(false);
  const [loadingPg, setLoadingPg] = useState<boolean>(false);
  const [loadingCloudData, setLoadingCloudData] = useState<boolean>(false);

  // Sync Conflict Modal State
  const [conflictState, setConflictState] = useState<{
    isOpen: boolean;
    localData: SyncDataPackage;
    cloudData: SyncDataPackage;
  }>({
    isOpen: false,
    localData: {},
    cloudData: {}
  });

  const applySyncPackage = (pkg: SyncDataPackage) => {
    const hasCloudState =
      (Array.isArray(pkg.accounts) && pkg.accounts.length > 0) ||
      (Array.isArray(pkg.transactions) && pkg.transactions.length > 0) ||
      (Array.isArray(pkg.budgets) && pkg.budgets.length > 0) ||
      (Array.isArray(pkg.fixedAssets) && pkg.fixedAssets.length > 0);

    if (!hasCloudState) return;

    if (Array.isArray(pkg.transactions)) setTransactions(pkg.transactions);
    if (Array.isArray(pkg.accounts) && pkg.accounts.length > 0) setAccounts(pkg.accounts);
    if (Array.isArray(pkg.budgets)) setBudgets(pkg.budgets);
    if (Array.isArray(pkg.debts)) setDebts(pkg.debts);
    if (Array.isArray(pkg.investments)) setInvestments(pkg.investments);
    if (Array.isArray(pkg.fixedAssets)) setFixedAssets(pkg.fixedAssets);
    if (pkg.emergencyConfig) setEmergencyConfig(pkg.emergencyConfig);
    if (Array.isArray(pkg.emergencyTransactions)) setEmergencyTransactions(pkg.emergencyTransactions);
    if (Array.isArray(pkg.recurringTransactions)) setRecurringTransactions(pkg.recurringTransactions);
    if (Array.isArray(pkg.savingsGoals)) setSavingsGoals(pkg.savingsGoals);
  };

  useEffect(() => {
    // Check if google sheets auth is active initially
    setCloudSync(isGoogleSheetsSyncActive());
  }, [currentUser]);

  
  // Download from Postgres on login & detect data conflicts
  useEffect(() => {
    if (currentUser) {
      const activeUserId = currentUser.uid || (currentUser as any).id || `user-${currentUser.username}`;
      const loadPgData = async () => {
        setLoadingPg(true);
        try {
          const pgData = await syncFromPostgres(activeUserId);
          if (pgData) {
            let localDataStr = secureStorage.getItem(`nusantara_wealth_backup_${activeUserId}`);
            let localDataPkg: SyncDataPackage | null = null;
            if (localDataStr) {
              try { localDataPkg = JSON.parse(localDataStr); } catch {}
            }

            if (localDataPkg && detectDataConflict(localDataPkg, pgData)) {
              setConflictState({
                isOpen: true,
                localData: localDataPkg,
                cloudData: pgData
              });
            } else {
              applySyncPackage(pgData);
            }
          }
        } catch {
          // Fallback handled inside syncFromPostgres via LocalStorage
        } finally {
          setLoadingPg(false);
        }
      };
      loadPgData();
    }
  }, [currentUser]);

  // Debounced upload to Postgres on state change (prevents duplicate startup syncs & UI jank)
  useEffect(() => {
    if (!currentUser || loadingPg) return;
    const activeUserId = currentUser.uid || (currentUser as any).id || `user-${currentUser.username}`;
    const timer = setTimeout(() => {
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
        userFullName: currentUser.fullName,
        username: currentUser.username
      }, activeUserId).catch(() => {});
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
    currentUser,
    loadingPg
  ]);

// Download from Cloud on login
  useEffect(() => {
    if (currentUser && cloudSync) {
      const loadCloudData = async () => {
        setLoadingCloudData(true);
        try {
          const cloudData = await downloadFinancesFromSheets();
          if (cloudData) {
            setTransactions(cloudData.transactions || []);
            setAccounts(cloudData.accounts || []);
            setBudgets(cloudData.budgets || []);
            setDebts(cloudData.debts || []);
            setInvestments(cloudData.investments || []);
            setFixedAssets(cloudData.fixedAssets || []);
            setEmergencyConfig(cloudData.emergencyFund || { jobStability: 'medium', dependents: 0, monthlyExpense: 0 });
            setEmergencyTransactions(cloudData.emergencyTransactions || []);
          }
        } catch {
          // Ignore cloud sync read errors silently
        } finally {
          setLoadingCloudData(false);
        }
      };
      loadCloudData();
    }
  }, [currentUser, cloudSync]);

  // Upload to Cloud on state change
  useEffect(() => {
    if (currentUser && cloudSync && !loadingCloudData) {
      uploadFinancesToSheets({
        transactions,
        accounts,
        budgets,
        debts,
        investments,
        fixedAssets,
        emergencyFund: emergencyConfig,
        emergencyTransactions
      }).catch(() => {});
    }
  }, [
    transactions,
    accounts,
    budgets,
    debts,
    investments,
    fixedAssets,
    emergencyConfig,
    emergencyTransactions,
    currentUser,
    cloudSync,
    loadingCloudData
  ]);

  // Sync to localStorage as offline cache fallback
  useEffect(() => {
    if (currentUser) {
      secureStorage.setItem(`fin_${currentUser.username}_transactions`, JSON.stringify(transactions));
    }
  }, [transactions, currentUser]);

  useEffect(() => {
    if (currentUser) {
      secureStorage.setItem(`fin_${currentUser.username}_accounts`, JSON.stringify(accounts));
    }
  }, [accounts, currentUser]);

  useEffect(() => {
    if (currentUser) {
      secureStorage.setItem(`fin_${currentUser.username}_budgets`, JSON.stringify(budgets));
    }
  }, [budgets, currentUser]);

  useEffect(() => {
    if (currentUser) {
      secureStorage.setItem(`fin_${currentUser.username}_debts`, JSON.stringify(debts));
    }
  }, [debts, currentUser]);

  useEffect(() => {
    if (currentUser) {
      secureStorage.setItem(`fin_${currentUser.username}_investments`, JSON.stringify(investments));
    }
  }, [investments, currentUser]);

  useEffect(() => {
    if (currentUser) {
      secureStorage.setItem(`fin_${currentUser.username}_fixed_assets`, JSON.stringify(fixedAssets));
    }
  }, [fixedAssets, currentUser]);

  // Sinkronisasi otomatis fasilitas KPR di modul Utang ke daftar Aset Tetap
  useEffect(() => {
    setFixedAssets((prev) => {
      const next = syncKprDebtsToFixedAssets(prev, debts);
      return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
    });
  }, [debts]);

  // Penyesuaian penyusutan aset tetap otomatis jika tanggal mencapai akhir tahun (atau tutup tahun sebelumnya belum terposting)
  useEffect(() => {
    if (!currentUser || loadingPg || fixedAssets.length === 0) return;

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const result = computePendingYearEndFixedAssetDepreciations(
      fixedAssets,
      debts,
      transactions,
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
  }, [currentUser, loadingPg, fixedAssets, debts, transactions]);

  useEffect(() => {
    if (currentUser) {
      secureStorage.setItem(`fin_${currentUser.username}_emergency_config`, JSON.stringify(emergencyConfig));
    }
  }, [emergencyConfig, currentUser]);

  useEffect(() => {
    if (currentUser) {
      secureStorage.setItem(`fin_${currentUser.username}_emergency_transactions`, JSON.stringify(emergencyTransactions));
    }
  }, [emergencyTransactions, currentUser]);

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
    minPayment?: number
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

    setTransactions((prev) =>
      prev.map((t) =>
        sourceLowerSet.has(String(t.category || '').trim().toLowerCase())
          ? { ...t, category: cleanTarget }
          : t
      )
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
      setActiveTab('dashboard');

      // 2. Reset auxiliary master COA, logs, and investment goals back to clean default state
      saveStoredCoaList(DEFAULT_COA_LIST);
      clearMasterChangeLogs();
      secureStorage.setItem('nusantara_investment_goals', JSON.stringify([]));
      window.dispatchEvent(new CustomEvent('nusantara:data-reset'));

      // 3. Persist clean state synchronously to encrypted LocalStorage & immediately sync wipe to Cloud DB
      if (currentUser) {
        const username = currentUser.username;
        const activeUserId = currentUser.uid || (currentUser as any).id || `user-${username}`;

        secureStorage.setItem(`fin_${username}_transactions`, JSON.stringify([]));
        secureStorage.setItem(`fin_${username}_accounts`, JSON.stringify(cleanAccounts));
        secureStorage.setItem(`fin_${username}_budgets`, JSON.stringify(cleanBudgets));
        secureStorage.setItem(`fin_${username}_debts`, JSON.stringify([]));
        secureStorage.setItem(`fin_${username}_investments`, JSON.stringify([]));
        secureStorage.setItem(`fin_${username}_fixed_assets`, JSON.stringify([]));
        secureStorage.setItem(`fin_${username}_recurring_transactions`, JSON.stringify([]));
        secureStorage.setItem(`fin_${username}_savings_goals`, JSON.stringify([]));
        secureStorage.setItem(`fin_${username}_emergency_config`, JSON.stringify(cleanEmergencyConfig));
        secureStorage.setItem(`fin_${username}_emergency_transactions`, JSON.stringify([]));
        saveStoredCategories(DEFAULT_CATEGORY_HIERARCHY, username);

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
          userFullName: currentUser.fullName,
          username: currentUser.username
        };

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
            emergencyTransactions: []
          }).catch(() => {});
        }
      }

      setShowResetDataModal(false);
      setResetConfirmText('');
      showToast({
        type: 'success',
        title: 'Data Berhasil Direset ke Awal',
        message: 'Seluruh transaksi lama, utang, investasi, dan target telah dihapus. Hanya data default (saldo Rp 0) yang dipertahankan.',
        duration: 5000
      });
    } finally {
      setIsResettingData(false);
    }
  };

  const handleLoginSuccess = (user: User, dataChoice: 'empty' | 'sample') => {
    setCurrentUser(user);
    secureStorage.setItem('fin_current_user', JSON.stringify(user));

    const username = user.username;
    const hasData = secureStorage.getItem(`fin_${username}_accounts`);
    if (!hasData) {
      if (dataChoice === 'sample') {
        setTransactions(INITIAL_TRANSACTIONS);
        setAccounts(INITIAL_ACCOUNTS);
        setBudgets(INITIAL_BUDGETS);
        setDebts(INITIAL_DEBTS);
        setInvestments(INITIAL_INVESTMENTS);
        setFixedAssets(syncKprDebtsToFixedAssets([], INITIAL_DEBTS));
        setRecurringTransactions(INITIAL_RECURRING_TRANSACTIONS);
        setSavingsGoals([
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
        ]);
        setEmergencyConfig(INITIAL_EMERGENCY_CONFIG);
        setEmergencyTransactions(INITIAL_EMERGENCY_TXS);
      } else {
        const { cleanAccounts, cleanBudgets, cleanEmergencyConfig } = getDefaultCleanStarterData();

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
        secureStorage.setItem('nusantara_investment_goals', JSON.stringify([]));
      }
    } else {
      setTransactions(JSON.parse(secureStorage.getItem(`fin_${username}_transactions`) || '[]'));
      setAccounts(JSON.parse(secureStorage.getItem(`fin_${username}_accounts`) || '[]'));
      setBudgets(JSON.parse(secureStorage.getItem(`fin_${username}_budgets`) || '[]'));
      const loadedDebts = JSON.parse(secureStorage.getItem(`fin_${username}_debts`) || '[]');
      setDebts(loadedDebts);
      setInvestments(JSON.parse(secureStorage.getItem(`fin_${username}_investments`) || '[]'));
      const loadedFixed = JSON.parse(secureStorage.getItem(`fin_${username}_fixed_assets`) || '[]');
      setFixedAssets(syncKprDebtsToFixedAssets(loadedFixed, loadedDebts));
      setRecurringTransactions(JSON.parse(secureStorage.getItem(`fin_${username}_recurring_transactions`) || '[]'));
      setSavingsGoals(JSON.parse(secureStorage.getItem(`fin_${username}_savings_goals`) || '[]'));
      setEmergencyConfig(JSON.parse(secureStorage.getItem(`fin_${username}_emergency_config`) || '{"jobStability":"medium","dependents":0,"monthlyExpense":0}'));
      setEmergencyTransactions(JSON.parse(secureStorage.getItem(`fin_${username}_emergency_transactions`) || '[]'));
    }
    setMasterCategories(getStoredCategories(username));
    setKprPresets(getStoredKprPresets(username));
    setKprCoaMapping(getStoredKprCoaMapping(username));
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
                            scrollWorkspaceToTop();
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
                                  ? 'text-blue-400 animate-pulse'
                                  : 'text-slate-400'
                              }`}
                            />
                            <span className="truncate">{tab.label}</span>
                          </div>
                          {tab.badge && (
                            <span
                              className={`px-1.5 py-0.5 text-[9px] font-black rounded ${
                                isActive
                                  ? 'bg-blue-700 text-white'
                                  : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                              }`}
                            >
                              {tab.badge}
                            </span>
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
                    <button
                      key={tab.id}
                      onClick={() => {
                        setActiveTab(tab.id);
                        setMobileMenuOpen(false);
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
                      {tab.badge && (
                        <span className={`px-1.5 py-0.5 text-[9px] font-black rounded ${isActive ? 'bg-blue-700 text-white' : 'bg-blue-500/20 text-blue-300'}`}>
                          {tab.badge}
                        </span>
                      )}
                    </button>
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
                      onResetKprPresets={() => setKprPresets(resetStoredKprPresets(currentUser?.username))}
                      onUpdateKprCoaMapping={(updated) => setKprCoaMapping(updated)}
                      onResetKprCoaMapping={() => setKprCoaMapping(resetStoredKprCoaMapping(currentUser?.username))}
                      onUpdateCategories={(newCats) => setMasterCategories(newCats)}
                      onResetToDefault={() => setMasterCategories(DEFAULT_CATEGORY_HIERARCHY)}
                      onOpenBackupModal={() => setShowBackupModal(true)}
                      onUpdateAccounts={(updated) => {
                        setAccounts(updated);
                        if (currentUser) {
                          secureStorage.setItem(`fin_${currentUser.username}_accounts`, JSON.stringify(updated));
                        }
                      }}
                      onFactoryReset={() => {
                        const { resetAccounts } = factoryResetMasterData();
                        setAccounts(resetAccounts);
                        setMasterCategories(DEFAULT_CATEGORY_HIERARCHY);
                        setKprPresets(resetStoredKprPresets(currentUser?.username));
                        setKprCoaMapping(resetStoredKprCoaMapping(currentUser?.username));
                        if (currentUser) {
                          secureStorage.setItem(`fin_${currentUser.username}_accounts`, JSON.stringify(resetAccounts));
                        }
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
                    budgets={budgets}
                    debts={debts}
                    investments={investments}
                    emergencyTransactions={emergencyTransactions}
                    fixedAssets={fixedAssets}
                    masterCategories={masterCategories}
                    kprCoaMapping={kprCoaMapping}
                    onUpdateMasterCategories={(newCats) => setMasterCategories(newCats)}
                    onResetMasterCategories={() => setMasterCategories(DEFAULT_CATEGORY_HIERARCHY)}
                    onUpdateAccounts={(updated) => {
                      setAccounts(updated);
                      if (currentUser) {
                        secureStorage.setItem(`fin_${currentUser.username}_accounts`, JSON.stringify(updated));
                      }
                    }}
                    onUpdateTransactions={(updated) => {
                      setTransactions(updated);
                      if (currentUser) {
                        secureStorage.setItem(`fin_${currentUser.username}_transactions`, JSON.stringify(updated));
                      }
                    }}
                    onUpdateInvestments={(updated) => {
                      setInvestments(updated);
                      if (currentUser) {
                        secureStorage.setItem(`fin_${currentUser.username}_investments`, JSON.stringify(updated));
                      }
                    }}
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
                    debts={combinedDebtsForAi}
                    emergencyConfig={emergencyConfig}
                    emergencyBalance={totalEmergencyBalance}
                    investments={investments}
                    masterCategories={masterCategories}
                    onApplyBudgetSuggestion={handleApplyBudgetSuggestion}
                    onConsolidateCategories={handleConsolidateCategories}
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
          onUpdateAccounts={(updatedAccs) => {
            setAccounts(updatedAccs);
            if (currentUser) {
              secureStorage.setItem(`fin_${currentUser.username}_accounts`, JSON.stringify(updatedAccs));
            }
          }}
          onUpdateTransactions={(updatedTxs) => {
            setTransactions(updatedTxs);
            if (currentUser) {
              secureStorage.setItem(`fin_${currentUser.username}_transactions`, JSON.stringify(updatedTxs));
            }
          }}
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
                userFullName: currentUser.fullName,
                username: currentUser.username
              }, activeUserId);
            }
            showToast({
              type: 'info',
              title: 'Pilihan Versi Lokal Diaktifkan',
              message: 'Data perangkat lokal digunakan dan diperbarui ke Cloud PostgreSQL.'
            });
          }}
          onSelectCloud={() => {
            setConflictState((prev) => ({ ...prev, isOpen: false }));
            applySyncPackage(conflictState.cloudData);
            showToast({
              type: 'info',
              title: 'Pilihan Versi Cloud Diaktifkan',
              message: 'Data dari Cloud PostgreSQL berhasil diterapkan.'
            });
          }}
          onMerge={(mergedPkg) => {
            setConflictState((prev) => ({ ...prev, isOpen: false }));
            applySyncPackage(mergedPkg);
            if (currentUser) {
              const activeUserId = currentUser.uid || (currentUser as any).id || `user-${currentUser.username}`;
              syncToPostgres({
                ...mergedPkg,
                userFullName: currentUser.fullName,
                username: currentUser.username
              }, activeUserId);
            }
            showToast({
              type: 'success',
              title: 'Data Berhasil Digabungkan (Merged)',
              message: 'Seluruh catatan transaksi & rekening unik digabungkan dengan sukses.'
            });
          }}
        />

        {/* GLOBAL TOAST NOTIFICATIONS */}
        <GlobalToastContainer />

      </div>
    </div>
  );
};

