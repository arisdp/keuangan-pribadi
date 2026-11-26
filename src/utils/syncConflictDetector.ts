import type { JournalEntry, JournalLine } from '../types';

export interface SyncSummary {
  transactionCount: number;
  accountCount: number;
  totalBalance: number;
  investmentCount: number;
  debtCount: number;
  lastUpdated?: string;
  source: 'local' | 'cloud';
}

export interface SyncDataPackage {
  transactions?: any[];
  accounts?: any[];
  budgets?: any[];
  debts?: any[];
  investments?: any[];
  fixedAssets?: any[];
  recurringTransactions?: any[];
  savingsGoals?: any[];
  emergencyConfig?: any;
  emergencyTransactions?: any[];
  journalEntries?: JournalEntry[];
  journalLines?: JournalLine[];
  _lastUpdated?: string;
}

export function generateSyncSummary(data: SyncDataPackage | null | undefined, source: 'local' | 'cloud'): SyncSummary {
  if (!data) {
    return {
      transactionCount: 0,
      accountCount: 0,
      totalBalance: 0,
      investmentCount: 0,
      debtCount: 0,
      source
    };
  }

  const accounts = Array.isArray(data.accounts) ? data.accounts : [];
  const transactions = Array.isArray(data.transactions) ? data.transactions : [];
  const investments = Array.isArray(data.investments) ? data.investments : [];
  const debts = Array.isArray(data.debts) ? data.debts : [];

  const totalBalance = accounts.reduce((sum, acc) => {
    const val = typeof acc.currentBalance === 'number' ? acc.currentBalance : parseFloat(acc.currentBalance) || 0;
    return sum + val;
  }, 0);

  return {
    transactionCount: transactions.length,
    accountCount: accounts.length,
    totalBalance,
    investmentCount: investments.length,
    debtCount: debts.length,
    lastUpdated: data._lastUpdated,
    source
  };
}

export function detectDataConflict(localData: SyncDataPackage | null, cloudData: SyncDataPackage | null): boolean {
  if (!localData || !cloudData) return false;

  const localSummary = generateSyncSummary(localData, 'local');
  const cloudSummary = generateSyncSummary(cloudData, 'cloud');

  // If both have records but differ in key metrics
  if (localSummary.transactionCount === 0 && cloudSummary.transactionCount === 0) {
    return false;
  }

  const hasTxDiff = localSummary.transactionCount !== cloudSummary.transactionCount;
  const hasAccDiff = localSummary.accountCount !== cloudSummary.accountCount;
  const hasBalanceDiff = Math.abs(localSummary.totalBalance - cloudSummary.totalBalance) > 1;

  return hasTxDiff || hasAccDiff || hasBalanceDiff;
}

export function mergeSyncData(localData: SyncDataPackage, cloudData: SyncDataPackage): SyncDataPackage {
  const deduplicateById = (arr1: any[] = [], arr2: any[] = []) => {
    const map = new Map<string, any>();
    [...arr1, ...arr2].forEach((item) => {
      if (item && item.id) {
        map.set(String(item.id), item);
      }
    });
    return Array.from(map.values());
  };

  return {
    accounts: deduplicateById(localData.accounts, cloudData.accounts),
    transactions: deduplicateById(localData.transactions, cloudData.transactions),
    budgets: deduplicateById(localData.budgets, cloudData.budgets),
    debts: deduplicateById(localData.debts, cloudData.debts),
    investments: deduplicateById(localData.investments, cloudData.investments),
    fixedAssets: deduplicateById(localData.fixedAssets, cloudData.fixedAssets),
    recurringTransactions: deduplicateById(localData.recurringTransactions, cloudData.recurringTransactions),
    savingsGoals: deduplicateById(localData.savingsGoals, cloudData.savingsGoals),
    emergencyConfig: localData.emergencyConfig || cloudData.emergencyConfig,
    emergencyTransactions: deduplicateById(localData.emergencyTransactions, cloudData.emergencyTransactions),
    _lastUpdated: new Date().toISOString()
  };
}
