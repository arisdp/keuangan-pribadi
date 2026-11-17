import { syncToPostgres, syncFromPostgres } from './apiClient';
import { GlobalToastContainer } from './components/GlobalToastContainer';
import { GlobalUserMenu } from './components/GlobalUserMenu';
import { SyncConflictModal } from './components/SyncConflictModal';
import { SyncDataPackage, detectDataConflict } from './utils/syncConflictDetector';
import { showToast } from './utils/toast';
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
  InvestmentAsset,
  User,
  RecurringTransaction,
  SavingsGoal
} from './types';
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
import { MasterCategoryManager } from './components/MasterCategoryManager';
import { ErrorBoundary } from './components/ErrorBoundary';
import { BackupDataModal } from './components/BackupDataModal';
import { AccountingIntegrityModal } from './components/AccountingIntegrityModal';
import { validateMasterIntegrityOnLoad, getStoredCoaList, factoryResetMasterData } from './coaUtils';
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

  // --- RECURRING TRANSACTIONS STATE ---
  const [recurringTransactions, setRecurringTransactions] = useState<RecurringTransaction[]>(() => {
    const user = secureStorage.getItem('fin_current_user');
    if (user) {
      const u: User = JSON.parse(user);
      const saved = secureStorage.getItem(`fin_${u.username}_recurring_transactions`);
      return saved ? JSON.parse(saved) : INITIAL_RECURRING_TRANSACTIONS;
    }
    return INITIAL_RECURRING_TRANSACTIONS;
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
      if (saved) return JSON.parse(saved);
    }
    return [
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
    ];
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

        const newTx: Transaction = {
          id: `tx-rec-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          date: txDate,
          accountId: rec.accountId,
          type: rec.type,
          category: rec.category,
          description: `[Jadwal Otomatis] ${rec.title}${rec.description ? ` - ${rec.description}` : ''}`,
          amount: rec.amount,
        };

        newTxsToAdd.push(newTx);

        // Adjust target account balance
        updatedAccounts = updatedAccounts.map((acc) => {
          if (acc.id === rec.accountId) {
            const balanceDiff = rec.type === 'income' ? rec.amount : -rec.amount;
            const nextBal = Math.max(0, acc.currentBalance + balanceDiff);
            const isCreditOrPaylater = acc.type === 'credit-card' || acc.type === 'paylater';
            return {
              ...acc,
              currentBalance: nextBal,
              usedLimit: isCreditOrPaylater ? (acc.creditLimit || 0) - nextBal : acc.usedLimit,
            };
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
        { id: 'debts', label: 'Utang & Pelunasan', icon: CreditCard },
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
  const [showBackupModal, setShowBackupModal] = useState<boolean>(false);
  const [showIntegrityModal, setShowIntegrityModal] = useState<boolean>(false);

  // --- AUTOMATIC DATA INTEGRITY VALIDATION ON APPLICATION LOAD ---
  useEffect(() => {
    if (!currentUser || accounts.length === 0) return;
    const coaList = getStoredCoaList();
    const result = validateMasterIntegrityOnLoad(accounts, coaList);

    // If orphaned accounts or unlinked COA anomalies exist, prompt user directly by opening the Integrity Modal
    if (!result.isValid || result.totalIssuesCount > 0) {
      setShowIntegrityModal(true);
    }
  }, [currentUser, accounts]);

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
    if (pkg.transactions && pkg.transactions.length > 0) setTransactions(pkg.transactions);
    if (pkg.accounts && pkg.accounts.length > 0) setAccounts(pkg.accounts);
    if (pkg.budgets && pkg.budgets.length > 0) setBudgets(pkg.budgets);
    if (pkg.debts && pkg.debts.length > 0) setDebts(pkg.debts);
    if (pkg.investments && pkg.investments.length > 0) setInvestments(pkg.investments);
    if (pkg.emergencyConfig) setEmergencyConfig(pkg.emergencyConfig);
    if (pkg.emergencyTransactions && pkg.emergencyTransactions.length > 0) setEmergencyTransactions(pkg.emergencyTransactions);
    if (pkg.recurringTransactions && pkg.recurringTransactions.length > 0) setRecurringTransactions(pkg.recurringTransactions);
    if (pkg.savingsGoals && pkg.savingsGoals.length > 0) setSavingsGoals(pkg.savingsGoals);
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
  }) => {
    const txUnitPrice = newTx.unitPrice || newTx.newInvestmentDetails?.unitPrice;
    const txUnits = newTx.units || newTx.newInvestmentDetails?.units;
    const txUnitName = newTx.unitName || newTx.newInvestmentDetails?.unitName;

    const tx: Transaction = {
      id: `tx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      date: newTx.date,
      accountId: newTx.accountId,
      type: newTx.type,
      category: newTx.category,
      description: newTx.description,
      amount: newTx.amount,
      linkedDebtId: newTx.linkedDebtId,
      linkedDebtAction: newTx.linkedDebtAction,
      linkedInvestmentId: newTx.linkedInvestmentId,
      linkedInvestmentAction: newTx.linkedInvestmentAction,
      unitPrice: txUnitPrice,
      units: txUnits,
      unitName: txUnitName,
    };

    setTransactions((prev) => [tx, ...prev]);

    // Update the associated account balance
    setAccounts((prevAccounts) =>
      prevAccounts.map((acc) => {
        if (acc.id === tx.accountId) {
          let balanceDiff = tx.amount;
          if (tx.type === 'expense' || tx.type === 'saving' || tx.type === 'investment') {
            balanceDiff = -tx.amount;
          }
          const nextBalance = acc.currentBalance + balanceDiff;
          const isCreditOrPaylater = acc.type === 'credit-card' || acc.type === 'paylater';
          return {
            ...acc,
            currentBalance: nextBalance,
            usedLimit: isCreditOrPaylater ? (acc.creditLimit || 0) - nextBalance : acc.usedLimit,
          };
        }
        return acc;
      })
    );

    // --- INTERCONNECTED LOGIC ---

    // 1. DANA DARURAT Integration
    if (tx.category === 'Tabungan Darurat' && (tx.type === 'saving' || tx.type === 'income')) {
      const sourceAcc = accounts.find(a => a.id === tx.accountId);
      const etx: EmergencyFundTransaction = {
        id: `etx-${Date.now()}-auto`,
        date: tx.date,
        type: 'addition',
        amount: tx.amount,
        location: sourceAcc ? sourceAcc.name : 'Rekening Utama',
        description: tx.description || 'Penyisihan Dana Darurat Bulanan',
      };
      setEmergencyTransactions((prev) => [...prev, etx]);
    } else if (tx.category === 'Pencairan Dana Darurat') {
      const sourceAcc = accounts.find(a => a.id === tx.accountId);
      const etx: EmergencyFundTransaction = {
        id: `etx-${Date.now()}-auto`,
        date: tx.date,
        type: 'reduction',
        amount: tx.amount,
        location: sourceAcc ? sourceAcc.name : 'Rekening Utama',
        description: tx.description || 'Pencairan Dana Darurat',
      };
      setEmergencyTransactions((prev) => [...prev, etx]);
    }

    // 2. HUTANG Integration
    if (newTx.linkedDebtAction === 'pay' && newTx.linkedDebtId) {
      if (newTx.linkedDebtId.startsWith('acc-debt-')) {
        const targetAccId = newTx.linkedDebtId.replace('acc-debt-', '');
        setAccounts((prevAccounts) =>
          prevAccounts.map((acc) => {
            if (acc.id === targetAccId) {
              return {
                ...acc,
                currentBalance: acc.currentBalance + tx.amount,
                usedLimit: Math.max(0, (acc.usedLimit || 0) - tx.amount),
              };
            }
            return acc;
          })
        );
      } else {
        setDebts((prevDebts) =>
          prevDebts.map((d) => {
            if (d.id === newTx.linkedDebtId) {
              return {
                ...d,
                balance: Math.max(0, d.balance - tx.amount),
              };
            }
            return d;
          })
        );
      }
    } else if (newTx.linkedDebtAction === 'create' && newTx.newDebtDetails) {
      const d: Debt = {
        id: `debt-${Date.now()}`,
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
        const existingIndex = prevInv.findIndex(inv => inv.name.toLowerCase().trim() === nameLower);

        // Determine added quantity and unit purchase price from transaction details
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
              const oldAvgBuy = inv.purchaseUnitPrice ?? (currentQty > 0 ? currentCap / currentQty : buyUnitPrice);

              const newQty = currentQty + addedQty;
              const newCap = currentCap + tx.amount;
              const newAvgBuyPrice = newQty > 0 ? newCap / newQty : oldAvgBuy;
              const effectivePricePerUnit = buyUnitPrice || inv.unitPrice || inv.currentUnitPrice || oldAvgBuy;
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
            id: `inv-${Date.now()}`,
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
            const effectivePrice = txUnitPrice || inv.unitPrice || inv.currentUnitPrice || (inv.balance / currentQty);
            const avgBuy = inv.purchaseUnitPrice ?? (currentCap / currentQty);

            const soldQty = txUnits && txUnits > 0 ? txUnits : (effectivePrice > 0 ? tx.amount / effectivePrice : 0);
            const newQty = Math.max(0, currentQty - soldQty);
            const newCap = Math.max(0, currentCap - (soldQty * avgBuy));
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
    }
  };

  // Delete transaction and reverse balance modification
  const handleDeleteTransaction = (id: string) => {
    const targetTx = transactions.find((t) => t.id === id);
    if (!targetTx) return;

    setTransactions((prev) => prev.filter((t) => t.id !== id));

    setAccounts((prevAccounts) =>
      prevAccounts.map((acc) => {
        if (acc.id === targetTx.accountId) {
          // Reverse balance modification
          let balanceDiff = -targetTx.amount;
          if (targetTx.type === 'expense' || targetTx.type === 'saving' || targetTx.type === 'investment') {
            balanceDiff = targetTx.amount;
          }
          const nextBalance = acc.currentBalance + balanceDiff;
          const isCreditOrPaylater = acc.type === 'credit-card' || acc.type === 'paylater';
          return {
            ...acc,
            currentBalance: nextBalance,
            usedLimit: isCreditOrPaylater ? (acc.creditLimit || 0) - nextBalance : acc.usedLimit,
          };
        }
        return acc;
      })
    );

    // Revert interconnected logic
    // 1. Dana Darurat Revert
    if (targetTx.category === 'Tabungan Darurat' || targetTx.category === 'Pencairan Dana Darurat') {
      setEmergencyTransactions((prev) => 
        prev.filter((etx) => !(etx.amount === targetTx.amount && etx.date === targetTx.date))
      );
    }

    // 2. Debt Revert
    if (targetTx.linkedDebtId && targetTx.linkedDebtAction === 'pay') {
      if (targetTx.linkedDebtId.startsWith('acc-debt-')) {
        const targetAccId = targetTx.linkedDebtId.replace('acc-debt-', '');
        setAccounts((prevAccounts) =>
          prevAccounts.map((acc) => {
            if (acc.id === targetAccId) {
              return {
                ...acc,
                currentBalance: acc.currentBalance - targetTx.amount,
                usedLimit: (acc.usedLimit || 0) + targetTx.amount,
              };
            }
            return acc;
          })
        );
      } else {
        setDebts((prevDebts) =>
          prevDebts.map((d) => {
            if (d.id === targetTx.linkedDebtId) {
              return {
                ...d,
                balance: d.balance + targetTx.amount,
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

    // 3. Investment Revert
    if (targetTx.linkedInvestmentAction === 'buy') {
      setInvestments((prevInv) =>
        prevInv.map((inv) => {
          const descMatch = inv.name.toLowerCase().trim();
          if (targetTx.description.toLowerCase().includes(descMatch)) {
            const currentCap = inv.initialCapital !== undefined ? inv.initialCapital : inv.balance;
            return {
              ...inv,
              balance: Math.max(0, inv.balance - targetTx.amount),
              initialCapital: Math.max(0, currentCap - targetTx.amount),
            };
          }
          return inv;
        }).filter(inv => inv.balance > 0)
      );
    } else if (targetTx.linkedInvestmentId && targetTx.linkedInvestmentAction === 'sell') {
      setInvestments((prevInv) =>
        prevInv.map((inv) => {
          if (inv.id === targetTx.linkedInvestmentId) {
            const currentCap = inv.initialCapital !== undefined ? inv.initialCapital : inv.balance;
            return {
              ...inv,
              balance: inv.balance + targetTx.amount,
              initialCapital: currentCap + targetTx.amount,
            };
          }
          return inv;
        })
      );
    }
  };

  // Perform transfer (Mutasi Dana) between two liquid accounts
  const handleTransferFunds = (
    amount: number,
    fromAccountId: string,
    toAccountId: string,
    description: string
  ) => {
    const dateStr = new Date().toISOString().split('T')[0];

    // Log the transaction as a combined event
    const outTxId = `tx-${Date.now()}-out`;
    const inTxId = `tx-${Date.now()}-in`;

    const fromAcc = accounts.find((a) => a.id === fromAccountId);
    const toAcc = accounts.find((a) => a.id === toAccountId);

    if (!fromAcc || !toAcc) return;

    const outTx: Transaction = {
      id: outTxId,
      date: dateStr,
      accountId: fromAccountId,
      type: 'expense',
      category: 'Mutasi Keluar',
      description: `${description} (Ke ${toAcc.name})`,
      amount,
    };

    const inTx: Transaction = {
      id: inTxId,
      date: dateStr,
      accountId: toAccountId,
      type: 'income',
      category: 'Mutasi Masuk',
      description: `${description} (Dari ${fromAcc.name})`,
      amount,
    };

    setTransactions((prev) => [outTx, inTx, ...prev]);

    setAccounts((prevAccounts) =>
      prevAccounts.map((acc) => {
        if (acc.id === fromAccountId) {
          const nextBalance = acc.currentBalance - amount;
          const isCreditOrPaylater = acc.type === 'credit-card' || acc.type === 'paylater';
          return { 
            ...acc, 
            currentBalance: nextBalance,
            usedLimit: isCreditOrPaylater ? (acc.creditLimit || 0) - nextBalance : acc.usedLimit,
          };
        }
        if (acc.id === toAccountId) {
          const nextBalance = acc.currentBalance + amount;
          const isCreditOrPaylater = acc.type === 'credit-card' || acc.type === 'paylater';
          return { 
            ...acc, 
            currentBalance: nextBalance,
            usedLimit: isCreditOrPaylater ? (acc.creditLimit || 0) - nextBalance : acc.usedLimit,
          };
        }
        return acc;
      })
    );
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

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];

    const newTx: Transaction = {
      id: `tx-rec-manual-${Date.now()}`,
      date: dateStr,
      accountId: target.accountId,
      type: target.type,
      category: target.category,
      description: `[Jadwal Otomatis] ${target.title}${target.description ? ` - ${target.description}` : ''}`,
      amount: target.amount,
    };

    setTransactions((prev) => [newTx, ...prev]);

    setAccounts((prevAccounts) =>
      prevAccounts.map((acc) => {
        if (acc.id === target.accountId) {
          const balanceDiff = target.type === 'income' ? target.amount : -target.amount;
          const nextBal = Math.max(0, acc.currentBalance + balanceDiff);
          const isCreditOrPaylater = acc.type === 'credit-card' || acc.type === 'paylater';
          return {
            ...acc,
            currentBalance: nextBal,
            usedLimit: isCreditOrPaylater ? (acc.creditLimit || 0) - nextBal : acc.usedLimit,
          };
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

  // Update Account details
  const handleUpdateAccountBalance = (accountId: string, newStartingBalance: number, newName?: string) => {
    setAccounts((prev) =>
      prev.map((acc) => {
        if (acc.id === accountId) {
          const isCreditOrPaylater = acc.type === 'credit-card' || acc.type === 'paylater';
          const diff = newStartingBalance - acc.startingBalance;
          const nextBalance = acc.currentBalance + diff;
          return {
            ...acc,
            name: newName !== undefined ? newName : acc.name,
            startingBalance: newStartingBalance,
            currentBalance: nextBalance,
            creditLimit: isCreditOrPaylater ? newStartingBalance : acc.creditLimit,
            usedLimit: isCreditOrPaylater ? (newStartingBalance - nextBalance) : acc.usedLimit,
          };
        }
        return acc;
      })
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
    const isCreditOrPaylater = type === 'credit-card' || type === 'paylater';
    const limit = isCreditOrPaylater ? startingBalance : undefined;
    const debt = isCreditOrPaylater ? initialDebt : undefined;
    const currentBal = isCreditOrPaylater ? startingBalance - initialDebt : startingBalance;

    const newAcc: Account = {
      id: `acc-${Date.now()}`,
      name,
      type,
      startingBalance,
      currentBalance: currentBal,
      accountNumber,
      creditLimit: limit,
      usedLimit: debt,
      initialDebt: debt,
      dueDay: isCreditOrPaylater ? dueDay : undefined,
      interestRate: isCreditOrPaylater ? interestRate : undefined,
      minPayment: isCreditOrPaylater ? minPayment : undefined,
    };
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
      alert('Kategori tersebut sudah terdaftar.');
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
    alert('Kalkulasi dana darurat berhasil diperbarui!');
  };

  const handleAddEmergencyTx = (newEtx: Omit<EmergencyFundTransaction, 'id'>) => {
    const etx: EmergencyFundTransaction = {
      ...newEtx,
      id: `etx-${Date.now()}`,
    };
    setEmergencyTransactions((prev) => [...prev, etx]);

    // Create corresponding transaction log
    // Match first bank account as transaction placeholder
    const matchedAccount = accounts[0];
    if (matchedAccount) {
      handleAddTransaction({
        date: etx.date,
        accountId: matchedAccount.id,
        type: etx.type === 'addition' ? 'saving' : 'income',
        category: 'Tabungan Darurat',
        description: etx.description,
        amount: etx.amount,
      });
    }
  };

  const handleDeleteEmergencyTx = (id: string) => {
    setEmergencyTransactions((prev) => prev.filter((et) => et.id !== id));
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

  // Debt tracker handlers
  const formatCurrencyIDR = (value: number) =>
    new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(value);

  const handleAddDebt = (
    newDebt: Omit<Debt, 'id'>,
    bankLink?:
      | string
      | {
          accountId: string;
          linkAccount?: boolean;
          transactionType?: 'income' | 'expense';
        }
  ) => {
    const uniqueSuffix = Math.random().toString(36).slice(2, 6);
    const debtId = `debt-${Date.now()}-${uniqueSuffix}`;
    const d: Debt = {
      ...newDebt,
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

    if (resolvedAccountId) {
      const targetAcc = accounts.find((a) => a.id === resolvedAccountId);
      if (targetAcc) {
        const tx: Transaction = {
          id: `tx-debt-${Date.now()}-${uniqueSuffix}`,
          date: new Date().toISOString().split('T')[0],
          accountId: targetAcc.id,
          type: resolvedTxType,
          category:
            resolvedTxType === 'expense'
              ? 'Pengeluaran Pencairan Pinjaman'
              : 'Penerimaan Utang Baru',
          description:
            resolvedTxType === 'expense'
              ? `Pengeluaran Pencairan Pinjaman: ${newDebt.name}`
              : `Pencairan Hutang: ${newDebt.name}`,
          amount: newDebt.balance,
          linkedDebtId: debtId,
          linkedDebtAction: 'create',
        };
        setTransactions((prev) => [tx, ...prev]);
        setAccounts((prevAccounts) =>
          prevAccounts.map((acc) => {
            if (acc.id === targetAcc.id) {
              const balanceDiff = resolvedTxType === 'expense' ? -newDebt.balance : newDebt.balance;
              const nextBalance = acc.currentBalance + balanceDiff;
              const isCreditOrPaylater = acc.type === 'credit-card' || acc.type === 'paylater';
              return {
                ...acc,
                currentBalance: nextBalance,
                usedLimit: isCreditOrPaylater ? (acc.creditLimit || 0) - nextBalance : acc.usedLimit,
              };
            }
            return acc;
          })
        );

        showToast({
          type: 'success',
          title: 'Hutang & Rekening Tersinkronisasi',
          message:
            resolvedTxType === 'expense'
              ? `Hutang "${newDebt.name}" dicatat dan saldo ${targetAcc.name} berkurang ${formatCurrencyIDR(newDebt.balance)}.`
              : `Hutang "${newDebt.name}" dicatat dan saldo ${targetAcc.name} bertambah ${formatCurrencyIDR(newDebt.balance)}.`,
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

  const handlePayDebt = (debtId: string, amount: number, sourceAccountId: string): boolean => {
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast({
        type: 'warning',
        title: 'Nominal Tidak Valid',
        message: 'Masukkan nominal pembayaran cicilan yang lebih besar dari Rp 0.',
        duration: 4500,
      });
      return false;
    }

    const matchedDebt = debts.find((d) => d.id === debtId);
    if (!matchedDebt) {
      showToast({
        type: 'error',
        title: 'Hutang Tidak Ditemukan',
        message: 'Data hutang yang dipilih tidak tersedia atau sudah dihapus.',
        duration: 5000,
      });
      return false;
    }

    const paymentSource = accounts.find((a) => a.id === sourceAccountId);
    if (!paymentSource) {
      showToast({
        type: 'error',
        title: 'Akun Sumber Tidak Valid',
        message: 'Silakan pilih rekening sumber dana yang valid untuk membayar cicilan.',
        duration: 5000,
      });
      return false;
    }

    if (paymentSource.currentBalance < amount) {
      showToast({
        type: 'error',
        title: 'Dana Tidak Mencukupi',
        message: `Saldo ${paymentSource.name} (${formatCurrencyIDR(paymentSource.currentBalance)}) tidak cukup untuk melunasi cicilan "${matchedDebt.name}" sebesar ${formatCurrencyIDR(amount)}.`,
        duration: 6000,
      });
      return false;
    }

    if (amount > matchedDebt.balance) {
      showToast({
        type: 'warning',
        title: 'Nominal Melebihi Sisa Hutang',
        message: `Nominal bayar (${formatCurrencyIDR(amount)}) melebihi sisa pokok hutang "${matchedDebt.name}" (${formatCurrencyIDR(matchedDebt.balance)}).`,
        duration: 5000,
      });
      return false;
    }

    handleAddTransaction({
      date: new Date().toISOString().split('T')[0],
      accountId: paymentSource.id,
      type: 'expense',
      category: 'Cicilan / Pelunasan Utang',
      description: `Cicilan Pelunasan Hutang: ${matchedDebt.name}`,
      amount,
      linkedDebtId: debtId,
      linkedDebtAction: 'pay',
    });

    showToast({
      type: 'success',
      title: 'Pembayaran Cicilan Berhasil',
      message: `Pembayaran ${formatCurrencyIDR(amount)} untuk "${matchedDebt.name}" dari ${paymentSource.name} telah dicatat.`,
      duration: 4000,
    });
    return true;
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

  // Reset to clean starting state (All 0)
  const handleResetData = () => {
    setResetConfirmText('');
    setShowResetDataModal(true);
  };

  const executeResetData = () => {
    if (resetConfirmText.trim() !== 'HAPUS') return;

    const cleanAccounts: Account[] = [
      { id: 'acc-1', name: 'Dompet Tunai', type: 'cash', startingBalance: 0, currentBalance: 0 },
      { id: 'acc-2', name: 'Rekening Bank', type: 'bank', startingBalance: 0, currentBalance: 0 },
      { id: 'acc-3', name: 'Gopay / E-Wallet', type: 'e-wallet', startingBalance: 0, currentBalance: 0 },
    ];
    const cleanBudgets: CategoryBudget[] = [
      { category: 'Makanan', type: 'expense', limit: 0 },
      { category: 'Transportasi', type: 'expense', limit: 0 },
      { category: 'Hiburan', type: 'expense', limit: 0 },
      { category: 'Utilitas & Tagihan', type: 'expense', limit: 0 },
      { category: 'Belanja Bulanan', type: 'expense', limit: 0 },
    ];
    const cleanEmergencyConfig: EmergencyFundConfig = {
      jobStability: 'medium',
      dependents: 0,
      monthlyExpense: 0,
    };

    setTransactions([]);
    setAccounts(cleanAccounts);
    setBudgets(cleanBudgets);
    setDebts([]);
    setInvestments([]);
    setEmergencyConfig(cleanEmergencyConfig);
    setEmergencyTransactions([]);
    setActiveTab('dashboard');
    
    if (currentUser) {
      const username = currentUser.username;
      secureStorage.setItem(`fin_${username}_transactions`, JSON.stringify([]));
      secureStorage.setItem(`fin_${username}_accounts`, JSON.stringify(cleanAccounts));
      secureStorage.setItem(`fin_${username}_budgets`, JSON.stringify(cleanBudgets));
      secureStorage.setItem(`fin_${username}_debts`, JSON.stringify([]));
      secureStorage.setItem(`fin_${username}_investments`, JSON.stringify([]));
      secureStorage.setItem(`fin_${username}_emergency_config`, JSON.stringify(cleanEmergencyConfig));
      secureStorage.setItem(`fin_${username}_emergency_transactions`, JSON.stringify([]));
    }

    setShowResetDataModal(false);
    setResetConfirmText('');
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
        setEmergencyConfig(INITIAL_EMERGENCY_CONFIG);
        setEmergencyTransactions(INITIAL_EMERGENCY_TXS);
      } else {
        const cleanAccounts: Account[] = [
          { id: 'acc-1', name: 'Dompet Tunai', type: 'cash', startingBalance: 0, currentBalance: 0 },
          { id: 'acc-2', name: 'Rekening Bank', type: 'bank', startingBalance: 0, currentBalance: 0 },
          { id: 'acc-3', name: 'Gopay / E-Wallet', type: 'e-wallet', startingBalance: 0, currentBalance: 0 },
        ];
        const cleanBudgets: CategoryBudget[] = [
          { category: 'Makanan', type: 'expense', limit: 0 },
          { category: 'Transportasi', type: 'expense', limit: 0 },
          { category: 'Hiburan', type: 'expense', limit: 0 },
          { category: 'Utilitas & Tagihan', type: 'expense', limit: 0 },
          { category: 'Belanja Bulanan', type: 'expense', limit: 0 },
        ];
        const cleanEmergencyConfig: EmergencyFundConfig = {
          jobStability: 'medium',
          dependents: 0,
          monthlyExpense: 0,
        };

        setTransactions([]);
        setAccounts(cleanAccounts);
        setBudgets(cleanBudgets);
        setDebts([]);
        setInvestments([]);
        setEmergencyConfig(cleanEmergencyConfig);
        setEmergencyTransactions([]);
      }
    } else {
      setTransactions(JSON.parse(secureStorage.getItem(`fin_${username}_transactions`) || '[]'));
      setAccounts(JSON.parse(secureStorage.getItem(`fin_${username}_accounts`) || '[]'));
      setBudgets(JSON.parse(secureStorage.getItem(`fin_${username}_budgets`) || '[]'));
      setDebts(JSON.parse(secureStorage.getItem(`fin_${username}_debts`) || '[]'));
      setInvestments(JSON.parse(secureStorage.getItem(`fin_${username}_investments`) || '[]'));
      setEmergencyConfig(JSON.parse(secureStorage.getItem(`fin_${username}_emergency_config`) || '{"jobStability":"medium","dependents":0,"monthlyExpense":0}'));
      setEmergencyTransactions(JSON.parse(secureStorage.getItem(`fin_${username}_emergency_transactions`) || '[]'));
    }
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
    setCurrentUser(null);
    secureStorage.removeItem('fin_current_user');
    setTransactions([]);
    setAccounts([]);
    setBudgets([]);
    setDebts([]);
    setInvestments([]);
    setEmergencyConfig({ jobStability: 'medium', dependents: 0, monthlyExpense: 0 });
    setEmergencyTransactions([]);
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
  const totalEmergencyBalance = emergencyTransactions.reduce((sum, tx) => {
    return tx.type === 'addition' ? sum + tx.amount : sum - tx.amount;
  }, 0);

  // Extract credit cards and paylaters into virtual debts for AI analysis
  const accountDebtsForAi = accounts
    .filter(acc => acc.type === 'credit-card' || acc.type === 'paylater')
    .map(acc => {
      const defaultAPR = acc.type === 'credit-card' ? 21 : 24;
      const rate = acc.interestRate !== undefined ? acc.interestRate : defaultAPR;
      const calculatedMin = Math.max((acc.usedLimit || 0) * 0.1, (acc.usedLimit && acc.usedLimit > 0) ? 50000 : 0);
      const min = acc.minPayment !== undefined ? acc.minPayment : calculatedMin;
      return {
        id: `acc-debt-${acc.id}`,
        name: acc.name,
        balance: acc.usedLimit || 0,
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
              {activeTab === 'debts' && 'Strategi Pelunasan Utang'}
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
                {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(
                  accounts.reduce((sum, a) => sum + a.currentBalance, 0)
                )}
              </p>
            </div>
            
            <button
              onClick={() => setShowIntegrityModal(true)}
              className="text-[10px] uppercase font-extrabold text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 border border-emerald-200 dark:border-emerald-700/60 hover:border-emerald-300 px-2.5 sm:px-3 py-1.5 rounded-lg transition cursor-pointer bg-emerald-50/80 dark:bg-emerald-900/30 flex items-center gap-1.5 shadow-2xs"
              title="Pemeriksaan Integritas Akuntansi & Dual-Entry Ledger"
            >
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="hidden sm:inline">Audit Akuntansi</span>
            </button>

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
                    savingsGoals={savingsGoals}
                    onAddSavingsGoal={handleAddSavingsGoal}
                    onUpdateSavingsGoal={handleUpdateSavingsGoal}
                    onDeleteSavingsGoal={handleDeleteSavingsGoal}
                    onDepositSavingsGoal={handleDepositSavingsGoal}
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
                  />
                )}

                {activeTab === 'budget' && (
                  <BudgetTab
                    accounts={accounts}
                    budgets={budgets}
                    transactions={transactions}
                    masterCategories={masterCategories}
                    onUpdateAccountBalance={handleUpdateAccountBalance}
                    onAddAccount={handleAddAccount}
                    onDeleteAccount={handleDeleteAccount}
                    onUpdateBudgetLimit={handleUpdateBudgetLimit}
                    onAddBudgetCategory={handleAddBudgetCategory}
                    onDeleteBudgetCategory={handleDeleteBudgetCategory}
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
                    onAddDebt={handleAddDebt}
                    onDeleteDebt={handleDeleteDebt}
                    onPayDebt={handlePayDebt}
                    onTransferFunds={handleTransferFunds}
                  />
                )}

                {activeTab === 'investments' && (
                  <InvestmentTab
                    investments={investments}
                    transactions={transactions}
                    onUpdateInvestment={handleUpdateInvestment}
                  />
                )}

                {activeTab === 'master-categories' && (
                  <ErrorBoundary fallbackTitle="Master Data Kategori & COA">
                    <MasterCategoryManager
                      categories={masterCategories}
                      accounts={accounts}
                      transactions={transactions}
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
                    masterCategories={masterCategories}
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
                    onOpenIntegrityModal={() => setShowIntegrityModal(true)}
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
                    onApplyBudgetSuggestion={handleApplyBudgetSuggestion}
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
                    Tindakan ini akan mengosongkan seluruh jurnal transaksi, utang, dan saldo akun Anda.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
                  Untuk mengonfirmasi penghapusan permanen, ketik kata <strong className="text-rose-600 font-black">HAPUS</strong> di bawah ini:
                </p>
                <input
                  type="text"
                  placeholder="Ketik HAPUS"
                  value={resetConfirmText}
                  onChange={(e) => setResetConfirmText(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white uppercase focus:outline-none focus:ring-2 focus:ring-rose-500/50"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={() => {
                    setShowResetDataModal(false);
                    setResetConfirmText('');
                  }}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  disabled={resetConfirmText.trim() !== 'HAPUS'}
                  onClick={executeResetData}
                  className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 dark:disabled:bg-slate-800 text-white font-bold text-xs shadow-md transition cursor-pointer disabled:cursor-not-allowed"
                >
                  Reset Semua Data
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
          onUpdateAccounts={(updatedAccs) => {
            setAccounts(updatedAccs);
            if (currentUser) {
              secureStorage.setItem(`fin_${currentUser.username}_accounts`, JSON.stringify(updatedAccs));
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
            setShowIntegrityModal(false);
            alert('Sistem Akuntansi & Chart of Accounts (COA) Berhasil Diharmoniskan!');
          }}
          onApplyAdjustmentEntries={(adjEntries) => {
            const newTransactions: Transaction[] = adjEntries.map((e, idx) => ({
              ...e,
              id: `tx-adj-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
            }));

            // Update transactions list
            const updatedTxList = [...transactions, ...newTransactions];
            setTransactions(updatedTxList);

            // Update account current balances
            const updatedAccs = accounts.map((acc) => {
              const matchedEntries = newTransactions.filter((t) => t.accountId === acc.id);
              if (matchedEntries.length === 0) return acc;

              let delta = 0;
              matchedEntries.forEach((t) => {
                if (t.type === 'income') delta += t.amount;
                else if (t.type === 'expense') delta -= t.amount;
              });

              return {
                ...acc,
                currentBalance: acc.currentBalance + delta,
              };
            });

            setAccounts(updatedAccs);
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

