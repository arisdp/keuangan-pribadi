import React, { useState, useMemo, useEffect } from 'react';
import { Account, Transaction } from '../types';
import { CategoryNode } from '../categoryHierarchy';
import {
  getStoredCoaList,
  getAccountCoaMapping,
  getMasterChangeLogs,
  addMasterChangeLog,
  clearMasterChangeLogs,
  scanCoaDuplicatesAndUnused,
  autoMergeAndCleanupCoas,
  MasterChangeLog,
  AccountCOA,
} from '../coaUtils';
import {
  ShieldCheck,
  ShieldAlert,
  X,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Scale,
  ListChecks,
  Sparkles,
  ArrowRightLeft,
  Calculator,
  PlusCircle,
  FileCheck2,
  Check,
  Layers,
  History,
  Link,
  Search,
  Trash2,
  CheckCheck,
  Download,
  Wand2,
  Activity,
  TrendingUp,
  Zap,
  BarChart3,
} from 'lucide-react';

import {
  auditLedgerIntegrity,
  calculateAccountGLBalance,
  reassignOrphanTransactionWithBalanceSync,
  removeDuplicateTransactionsWithBalanceSync,
} from '../utils/accountingEngine';
import { formatterIDR } from '../utils/formatters';
import { showToast } from '../utils/toast';

interface AccountingIntegrityModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: Account[];
  transactions: Transaction[];
  masterCategories: CategoryNode[];
  onHarmonize: (updatedAccounts: Account[], missingCategoriesToAdd: string[]) => void;
  onApplyAdjustmentEntries?: (entries: Omit<Transaction, 'id'>[]) => void;
  onUpdateAccounts?: (updatedAccounts: Account[]) => void;
  onUpdateTransactions?: (updatedTransactions: Transaction[]) => void;
  defaultTab?: 'audit' | 'auto-reconcile' | 'manual-reconcile' | 'change-log';
}

export const AccountingIntegrityModal: React.FC<AccountingIntegrityModalProps> = ({
  isOpen,
  onClose,
  accounts,
  transactions,
  masterCategories,
  onHarmonize,
  onApplyAdjustmentEntries,
  onUpdateAccounts,
  onUpdateTransactions,
  defaultTab = 'audit',
}) => {
  const [activeTab, setActiveTab] = useState<'audit' | 'auto-reconcile' | 'manual-reconcile' | 'change-log'>(defaultTab);
  const [customActualBalances, setCustomActualBalances] = useState<Record<string, number>>({});
  const [reconciliationSuccessMessage, setReconciliationSuccessMessage] = useState<string | null>(null);
  const [orphanTargetAccounts, setOrphanTargetAccounts] = useState<Record<number, string>>({});

  // COA List state for manual reconciliation
  const [activeCoaList, setActiveCoaList] = useState<AccountCOA[]>([]);
  // Manual Account COA code map state: accountId -> coaCode
  const [manualAccountMappings, setManualAccountMappings] = useState<Record<string, string>>({});
  const [manualSyncMessage, setManualSyncMessage] = useState<string | null>(null);
  const [accountFilterQuery, setAccountFilterQuery] = useState('');

  // Master Change Log state
  const [changeLogs, setChangeLogs] = useState<MasterChangeLog[]>([]);
  const [logFilterAction, setLogFilterAction] = useState<string>('ALL');
  const [logSearchQuery, setLogSearchQuery] = useState<string>('');
  const [showClearLogsConfirm, setShowClearLogsConfirm] = useState<boolean>(false);

  // Sync state on modal open
  useEffect(() => {
    if (isOpen) {
      if (defaultTab) {
        setActiveTab(defaultTab);
      }
      const currentCoas = getStoredCoaList();
      setActiveCoaList(currentCoas);

      // Initialize manual mappings from existing acc.coaCode or dynamic fallback
      const initialMap: Record<string, string> = {};
      accounts.forEach((acc) => {
        const mapping = getAccountCoaMapping(acc, currentCoas);
        initialMap[acc.id] = acc.coaCode || mapping.code;
      });
      setManualAccountMappings(initialMap);

      // Load change logs
      setChangeLogs(getMasterChangeLogs());
    }
  }, [isOpen, accounts, defaultTab]);

  // Helper to extract all category names from hierarchical tree
  const allMasterCategoryNames = useMemo(() => {
    const names = new Set<string>();
    const traverse = (nodes: CategoryNode[]) => {
      nodes.forEach((node) => {
        names.add(node.name.toLowerCase().trim());
        if (node.children) traverse(node.children);
      });
    };
    traverse(masterCategories);
    return names;
  }, [masterCategories]);

  // 1. ACCOUNT BALANCES INTEGRITY AUDIT (Menggunakan Mesin GL Terpusat termasuk initialDebt)
  const accountAudit = useMemo(() => {
    return accounts.map((acc) => {
      const gl = calculateAccountGLBalance(acc, transactions);

      // Actual cash balance (user input override or recorded current balance)
      const actualCashBalance = customActualBalances[acc.id] !== undefined
        ? customActualBalances[acc.id]
        : gl.recordedBalance;

      const difference = actualCashBalance - gl.glCalculatedBalance;

      return {
        id: acc.id,
        name: acc.name,
        type: acc.type,
        startingBal: gl.startingBal,
        recordedBalance: gl.recordedBalance,
        calculatedDelta: gl.calculatedDelta,
        glCalculatedBalance: gl.glCalculatedBalance,
        actualCashBalance,
        difference,
        txCount: gl.txCount,
      };
    });
  }, [accounts, transactions, customActualBalances]);

  // 2. PROPOSED AUTO-RECONCILIATION ADJUSTMENT ENTRIES
  const proposedAdjustmentEntries = useMemo(() => {
    const entries: Array<{
      accountId: string;
      accountName: string;
      type: 'income' | 'expense';
      category: string;
      description: string;
      amount: number;
      debitCreditNote: string;
      difference: number;
    }> = [];

    const todayStr = new Date().toISOString().split('T')[0];

    accountAudit.forEach((acc) => {
      if (Math.abs(acc.difference) > 0) {
        if (acc.difference < 0) {
          // Cash shortfall / missing cash
          const absDiff = Math.abs(acc.difference);
          entries.push({
            accountId: acc.id,
            accountName: acc.name,
            type: 'expense',
            category: 'Beban Operasional Lainnya',
            description: `[Auto-Reconciliation] Entri Penyesuaian Defisit Kas Akhir Bulan - ${acc.name}`,
            amount: absDiff,
            debitCreditNote: `Debet: Beban Penyesuaian (${formatterIDR.format(absDiff)}) | Kredit: ${acc.name} (${formatterIDR.format(absDiff)})`,
            difference: acc.difference,
          });
        } else {
          // Cash surplus
          entries.push({
            accountId: acc.id,
            accountName: acc.name,
            type: 'income',
            category: 'Pendapatan Lain-lain',
            description: `[Auto-Reconciliation] Entri Penyesuaian Surplus Kas Akhir Bulan - ${acc.name}`,
            amount: acc.difference,
            debitCreditNote: `Debet: ${acc.name} (${formatterIDR.format(acc.difference)}) | Kredit: Pendapatan Penyesuaian (${formatterIDR.format(acc.difference)})`,
            difference: acc.difference,
          });
        }
      }
    });

    return entries;
  }, [accountAudit]);

  // 3. CHART OF ACCOUNTS (COA) MAPPING AUDIT
  const categoryAudit = useMemo(() => {
    const txCategoryMap = new Map<string, { count: number; totalAmount: number; type: string }>();

    transactions.forEach((tx) => {
      const catName = (tx.category || 'Lain-lain').trim();
      const existing = txCategoryMap.get(catName) || { count: 0, totalAmount: 0, type: tx.type };
      txCategoryMap.set(catName, {
        count: existing.count + 1,
        totalAmount: existing.totalAmount + tx.amount,
        type: tx.type,
      });
    });

    const unmappedCategories: { name: string; count: number; totalAmount: number; type: string }[] = [];
    const mappedCategories: { name: string; count: number; totalAmount: number; type: string }[] = [];

    txCategoryMap.forEach((val, name) => {
      const isMapped = allMasterCategoryNames.has(name.toLowerCase());
      if (isMapped) {
        mappedCategories.push({ name, ...val });
      } else {
        unmappedCategories.push({ name, ...val });
      }
    });

    return {
      unmappedCategories,
      mappedCategories,
      totalCategoriesInTx: txCategoryMap.size,
    };
  }, [transactions, allMasterCategoryNames]);

  const ledgerAudit = useMemo(
    () => auditLedgerIntegrity(transactions, accounts),
    [transactions, accounts]
  );

  const isIntegrityValid = categoryAudit.unmappedCategories.length === 0 && ledgerAudit.isLedgerClean;

  // Integration Health Level Progress Bar Metrics
  const healthMetrics = useMemo(() => {
    let validCoaAccountsCount = 0;
    accounts.forEach((acc) => {
      const mapping = getAccountCoaMapping(acc, activeCoaList);
      if (!mapping.isOrphaned && mapping.code) {
        validCoaAccountsCount++;
      }
    });

    const accountCoaPct = accounts.length > 0 ? Math.round((validCoaAccountsCount / accounts.length) * 100) : 100;
    const mappedCatCount = categoryAudit.mappedCategories.length;
    const totalCatCount = categoryAudit.totalCategoriesInTx;
    const categoryMappingPct = totalCatCount > 0 ? Math.round((mappedCatCount / totalCatCount) * 100) : 100;
    const reconciledCount = accountAudit.filter((a) => a.difference === 0).length;
    const balanceReconciledPct = accounts.length > 0 ? Math.round((reconciledCount / accounts.length) * 100) : 100;
    const validLedgerCount = Math.max(0, transactions.length - ledgerAudit.totalIssues);
    const ledgerValidPct =
      transactions.length > 0 ? Math.round((validLedgerCount / transactions.length) * 100) : 100;
    const overallHealthScore = Math.round(
      (accountCoaPct + categoryMappingPct + balanceReconciledPct + ledgerValidPct) / 4
    );

    return {
      validCoaAccountsCount,
      totalAccounts: accounts.length,
      accountCoaPct,
      mappedCatCount,
      totalCatCount,
      categoryMappingPct,
      reconciledCount,
      balanceReconciledPct,
      ledgerValidPct,
      overallHealthScore,
    };
  }, [accounts, activeCoaList, categoryAudit, accountAudit, transactions.length, ledgerAudit.totalIssues]);

  // Helper to compute string similarity (0.0 - 1.0) for Auto-Fix
  const calculateSimilarity = (str1: string, str2: string): number => {
    const s1 = str1.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    const s2 = str2.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    if (!s1 || !s2) return 0;
    if (s1 === s2) return 1.0;
    if (s1.includes(s2) || s2.includes(s1)) return 0.88;

    const tokens1 = s1.split(/\s+/);
    const tokens2 = s2.split(/\s+/);

    let matchCount = 0;
    tokens1.forEach((t1) => {
      if (t1.length > 1 && tokens2.some((t2) => t2 === t1 || t2.includes(t1) || t1.includes(t2))) {
        matchCount++;
      }
    });

    const tokenRatio = matchCount / Math.max(tokens1.length, tokens2.length);

    const keywords = [
      'bank',
      'bca',
      'mandiri',
      'bni',
      'bri',
      'cimb',
      'jago',
      'blu',
      'kas',
      'cash',
      'dompet',
      'wallet',
      'gopay',
      'shopeepay',
      'ovo',
      'dana',
      'piutang',
      'utang',
      'investasi',
      'saham',
      'reksadana',
      'modal',
      'aset',
    ];
    let keywordBonus = 0;
    keywords.forEach((kw) => {
      if (s1.includes(kw) && s2.includes(kw)) {
        keywordBonus += 0.25;
      }
    });

    return Math.min(1.0, tokenRatio * 0.75 + keywordBonus);
  };

  // Smart AI Auto-Fix suggestions based on name similarity
  const smartFixSuggestions = useMemo(() => {
    const suggestions: Array<{
      accountId: string;
      accountName: string;
      accountType: string;
      currentCoaCode: string;
      suggestedCoaCode: string;
      suggestedCoaName: string;
      suggestedCoaCategory: string;
      confidence: number;
      reason: string;
    }> = [];

    accounts.forEach((acc) => {
      const currentMapping = getAccountCoaMapping(acc, activeCoaList);
      // If account has an orphaned COA, or no explicit coaCode
      if (currentMapping.isOrphaned || !acc.coaCode) {
        let bestMatch: AccountCOA | null = null;
        let highestScore = 0;

        activeCoaList.forEach((coa) => {
          const nameScore = calculateSimilarity(acc.name, coa.name);
          const typeScore = calculateSimilarity(acc.type, coa.category);
          const combinedScore = nameScore * 0.7 + typeScore * 0.3;

          if (combinedScore > highestScore) {
            highestScore = combinedScore;
            bestMatch = coa;
          }
        });

        if (bestMatch && highestScore >= 0.35 && (bestMatch as AccountCOA).code !== currentMapping.code) {
          suggestions.push({
            accountId: acc.id,
            accountName: acc.name,
            accountType: acc.type,
            currentCoaCode: currentMapping.code,
            suggestedCoaCode: (bestMatch as AccountCOA).code,
            suggestedCoaName: (bestMatch as AccountCOA).name,
            suggestedCoaCategory: (bestMatch as AccountCOA).category,
            confidence: Math.min(99, Math.max(62, Math.round(highestScore * 100))),
            reason: `Kemiripan nama "${acc.name}" (${acc.type}) dengan COA [${(bestMatch as AccountCOA).code}] ${
              (bestMatch as AccountCOA).name
            }`,
          });
        }
      }
    });

    return suggestions;
  }, [accounts, activeCoaList]);

  // Handlers for Smart Auto-Fix
  const handleApplySingleSmartFix = (sugg: (typeof smartFixSuggestions)[0]) => {
    setManualAccountMappings((prev) => ({
      ...prev,
      [sugg.accountId]: sugg.suggestedCoaCode,
    }));

    const updated = accounts.map((acc) =>
      acc.id === sugg.accountId ? { ...acc, coaCode: sugg.suggestedCoaCode } : acc
    );

    if (onUpdateAccounts) {
      onUpdateAccounts(updated);
    } else {
      onHarmonize(updated, []);
    }

    addMasterChangeLog(
      'Account',
      sugg.accountName,
      'RECONCILE',
      `Auto-Fix AI: Menghubungkan akun "${sugg.accountName}" ke COA [${sugg.suggestedCoaCode}] ${sugg.suggestedCoaName} (Match ${sugg.confidence}%)`,
      'System AI Auto-Fix'
    );

    setChangeLogs(getMasterChangeLogs());
    setManualSyncMessage(`Saran Auto-Fix AI berhasil diterapkan pada akun "${sugg.accountName}"!`);
    setTimeout(() => setManualSyncMessage(null), 5000);
  };

  const handleApplyAllSmartFixes = () => {
    if (smartFixSuggestions.length === 0) return;

    const newMappings = { ...manualAccountMappings };
    smartFixSuggestions.forEach((sugg) => {
      newMappings[sugg.accountId] = sugg.suggestedCoaCode;
    });
    setManualAccountMappings(newMappings);

    const updated = accounts.map((acc) => {
      const sugg = smartFixSuggestions.find((s) => s.accountId === acc.id);
      return sugg ? { ...acc, coaCode: sugg.suggestedCoaCode } : acc;
    });

    if (onUpdateAccounts) {
      onUpdateAccounts(updated);
    } else {
      onHarmonize(updated, []);
    }

    smartFixSuggestions.forEach((sugg) => {
      addMasterChangeLog(
        'Account',
        sugg.accountName,
        'RECONCILE',
        `Auto-Fix AI (1-Klik): Menghubungkan "${sugg.accountName}" ke COA [${sugg.suggestedCoaCode}] ${sugg.suggestedCoaName} (${sugg.confidence}% Cocok)`,
        'System AI Auto-Fix'
      );
    });

    setChangeLogs(getMasterChangeLogs());
    setManualSyncMessage(
      `Berhasil mengaplikasikan Auto-Fix AI pada ${smartFixSuggestions.length} akun secara otomatis!`
    );
    setTimeout(() => setManualSyncMessage(null), 5000);
  };

  // Scan for duplicate and unused COA nodes
  const scanResult = useMemo(() => {
    return scanCoaDuplicatesAndUnused(activeCoaList, accounts, transactions);
  }, [activeCoaList, accounts, transactions]);

  // Filter change logs
  const filteredChangeLogs = useMemo(() => {
    return changeLogs.filter((log) => {
      const matchAction = logFilterAction === 'ALL' || log.action === logFilterAction;
      const query = logSearchQuery.toLowerCase().trim();
      const matchSearch =
        !query ||
        log.targetName.toLowerCase().includes(query) ||
        log.details.toLowerCase().includes(query) ||
        log.targetType.toLowerCase().includes(query);
      return matchAction && matchSearch;
    });
  }, [changeLogs, logFilterAction, logSearchQuery]);

  // Export change logs to CSV
  const handleExportLogsCSV = () => {
    if (filteredChangeLogs.length === 0) {
      showToast({
        type: 'warning',
        title: 'Tidak Ada Log',
        message: 'Tidak ada log riwayat perubahan yang sesuai untuk diekspor.',
      });
      return;
    }
    const headers = ['Waktu', 'Tipe Target', 'Nama Target', 'Aksi', 'Rincian Perubahan', 'Diubah Oleh'];
    const rows = filteredChangeLogs.map((log) => [
      `"${log.timestamp}"`,
      `"${log.targetType}"`,
      `"${log.targetName.replace(/"/g, '""')}"`,
      `"${log.action}"`,
      `"${log.details.replace(/"/g, '""')}"`,
      `"${log.updatedBy}"`,
    ]);
    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Log_Perubahan_MasterData_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!isOpen) return null;

  const handleHarmonizeClick = () => {
    const missingNames = categoryAudit.unmappedCategories.map((c) => c.name);
    onHarmonize(accounts, missingNames);
  };

  const defaultValidAccountId =
    accounts.find((a) => a.type === 'bank' || a.type === 'cash' || a.type === 'e-wallet')?.id ||
    accounts[0]?.id ||
    '';

  const handleReassignOrphan = (txIndex: number) => {
    if (!onUpdateTransactions) return;
    const targetAccountId = orphanTargetAccounts[txIndex] || defaultValidAccountId;
    if (!targetAccountId) return;

    const { updatedTransactions, updatedAccounts, changed } = reassignOrphanTransactionWithBalanceSync(
      transactions,
      accounts,
      txIndex,
      targetAccountId
    );
    if (!changed) return;

    onUpdateTransactions(updatedTransactions);
    if (onUpdateAccounts) {
      onUpdateAccounts(updatedAccounts);
    }
    const targetAcc = accounts.find((a) => a.id === targetAccountId);
    const tx = transactions[txIndex];
    addMasterChangeLog(
      'Account',
      targetAcc?.name || targetAccountId,
      'RECONCILE',
      `Mengalihkan transaksi yatim "${tx?.description || tx?.category || txIndex}" (${formatterIDR.format(tx?.amount || 0)}) ke rekening "${targetAcc?.name || targetAccountId}".`,
      'Audit Integritas'
    );
    setChangeLogs(getMasterChangeLogs());
    setReconciliationSuccessMessage(
      `Transaksi "${tx?.description || tx?.category}" dialihkan ke ${targetAcc?.name || targetAccountId} dan saldo telah disinkronkan.`
    );
    setTimeout(() => setReconciliationSuccessMessage(null), 5000);
  };

  const handleDeleteOrphan = (txIndex: number) => {
    if (!onUpdateTransactions) return;
    const tx = transactions[txIndex];
    const updatedTransactions = transactions.filter((_, idx) => idx !== txIndex);
    onUpdateTransactions(updatedTransactions);
    addMasterChangeLog(
      'Account',
      tx?.description || tx?.category || 'Transaksi Yatim',
      'DELETE',
      `Menghapus transaksi tanpa referensi akun valid (${tx?.date || '-'} · ${formatterIDR.format(tx?.amount || 0)}).`,
      'Audit Integritas'
    );
    setChangeLogs(getMasterChangeLogs());
    setReconciliationSuccessMessage(`Transaksi yatim "${tx?.description || tx?.category}" berhasil dihapus dari buku besar.`);
    setTimeout(() => setReconciliationSuccessMessage(null), 5000);
  };

  const handleRemoveDuplicates = (indicesToRemove: number[], label: string) => {
    if (!onUpdateTransactions || indicesToRemove.length === 0) return;
    const { updatedTransactions, updatedAccounts, removedCount } = removeDuplicateTransactionsWithBalanceSync(
      transactions,
      accounts,
      indicesToRemove
    );
    if (removedCount === 0) return;

    onUpdateTransactions(updatedTransactions);
    if (onUpdateAccounts) {
      onUpdateAccounts(updatedAccounts);
    }
    addMasterChangeLog(
      'Account',
      label,
      'RECONCILE',
      `Menghapus ${removedCount} entri duplikat di buku besar dan menyinkronkan saldo rekening terkait.`,
      'Audit Integritas'
    );
    setChangeLogs(getMasterChangeLogs());
    setReconciliationSuccessMessage(`Berhasil membersihkan ${removedCount} entri ganda dan menyinkronkan saldo rekening.`);
    setTimeout(() => setReconciliationSuccessMessage(null), 5000);
  };

  const handleExecuteAutoReconciliation = () => {
    if (proposedAdjustmentEntries.length === 0) {
      showToast({
        type: 'info',
        title: 'Rekonsiliasi Seimbang',
        message: 'Tidak ditemukan selisih antara saldo GL dan saldo kas sebenarnya. Rekonsiliasi 100% seimbang!',
      });
      return;
    }

    if (!onApplyAdjustmentEntries) return;

    const todayStr = new Date().toISOString().split('T')[0];
    const newTxEntries: Omit<Transaction, 'id'>[] = proposedAdjustmentEntries.map((e) => ({
      date: todayStr,
      accountId: e.accountId,
      type: e.type,
      category: e.category,
      description: e.description,
      amount: e.amount,
    }));

    onApplyAdjustmentEntries(newTxEntries);

    setReconciliationSuccessMessage(
      `Berhasil mengeksekusi ${newTxEntries.length} Jurnal Penyesuaian (Adjustment Entries)! Saldo Buku Besar (GL) dan Kas Fisik kini 100% tersinkronisasi.`
    );

    setTimeout(() => {
      setReconciliationSuccessMessage(null);
    }, 6000);
  };

  // Handle Auto Merge & Cleanup of Duplicates/Unused COAs
  const handleAutoMergeAndCleanup = () => {
    const { updatedCoaList, updatedAccounts, summaryMessage } = autoMergeAndCleanupCoas(
      activeCoaList,
      accounts,
      transactions
    );

    setActiveCoaList(updatedCoaList);
    if (onUpdateAccounts) {
      onUpdateAccounts(updatedAccounts);
    } else {
      onHarmonize(updatedAccounts, []);
    }

    setChangeLogs(getMasterChangeLogs());
    setManualSyncMessage(summaryMessage);
    setTimeout(() => setManualSyncMessage(null), 6000);
  };

  // Save Manual Account COA Mappings
  const handleSaveManualAccountMappings = () => {
    const updated = accounts.map((acc) => {
      const selectedCode = manualAccountMappings[acc.id];
      if (selectedCode) {
        return { ...acc, coaCode: selectedCode };
      }
      return acc;
    });

    if (onUpdateAccounts) {
      onUpdateAccounts(updated);
    } else {
      onHarmonize(updated, []);
    }

    // Add change log entries
    accounts.forEach((acc) => {
      const oldCode = acc.coaCode;
      const newCode = manualAccountMappings[acc.id];
      if (newCode && newCode !== oldCode) {
        const coaItem = activeCoaList.find((c) => c.code === newCode);
        addMasterChangeLog(
          'Account',
          acc.name,
          'RECONCILE',
          `Relasi ID COA diperbarui secara manual dari [${oldCode || 'Auto'}] ke [${newCode} - ${coaItem ? coaItem.name : ''}]`,
          'User Admin'
        );
      }
    });

    setChangeLogs(getMasterChangeLogs());

    setManualSyncMessage(
      `Berhasil memperbarui ${accounts.length} relasi ID Akun ke Master COA secara sistematis!`
    );
    setTimeout(() => setManualSyncMessage(null), 5000);
  };

  const handleClearLogs = () => {
    setShowClearLogsConfirm(true);
  };

  const confirmClearLogs = () => {
    clearMasterChangeLogs();
    setChangeLogs([]);
    setShowClearLogsConfirm(false);
    showToast({
      type: 'success',
      title: 'Riwayat Log Dibersihkan',
      message: 'Seluruh log perubahan master data berhasil dihapus.',
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-4xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden my-8 space-y-0">
        {/* Modal Header */}
        <div className="p-6 bg-slate-900 text-white flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div
              className={`p-3 rounded-2xl ${
                isIntegrityValid ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
              }`}
            >
              {isIntegrityValid ? <ShieldCheck className="h-6 w-6" /> : <ShieldAlert className="h-6 w-6" />}
            </div>
            <div>
              <h3 className="text-base font-extrabold flex items-center gap-2">
                <span>Integritas Akuntansi & Auto-Reconciliation</span>
                <span
                  className={`px-2.5 py-0.5 text-[10px] font-black rounded-full uppercase border ${
                    isIntegrityValid
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  }`}
                >
                  {isIntegrityValid ? 'COA Valid 100%' : 'Anomali COA Terdeteksi'}
                </span>
              </h3>
              <p className="text-xs text-slate-400 font-medium">
                Pemeriksaan Hirarki Buku Besar (GL), Verifikasi COA & Sistem Rekonsiliasi Otomatis
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* SUB TAB SELECTOR */}
            <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-xl border border-slate-700 flex-wrap">
              <button
                type="button"
                onClick={() => setActiveTab('audit')}
                className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'audit'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <ListChecks className="h-3.5 w-3.5" />
                1. Audit COA & GL
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('auto-reconcile')}
                className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'auto-reconcile'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                2. Auto-Reconcile
                {proposedAdjustmentEntries.length > 0 && (
                  <span className="px-1.5 py-0.2 bg-rose-500 text-white text-[9px] font-black rounded-full">
                    {proposedAdjustmentEntries.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('manual-reconcile')}
                className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'manual-reconcile'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Link className="h-3.5 w-3.5" />
                3. Rekonsiliasi Manual COA
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('change-log')}
                className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'change-log'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <History className="h-3.5 w-3.5" />
                4. Log Riwayat Master
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* HEALTH INTEGRITY DASHBOARD PROGRESS BAR */}
          <div className="p-5 bg-gradient-to-br from-slate-900 via-slate-850 to-slate-900 text-white rounded-2xl border border-slate-700/80 shadow-lg space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-700/60 pb-3">
              <div className="flex items-center gap-3">
                <div
                  className={`p-2.5 rounded-xl border ${
                    healthMetrics.overallHealthScore >= 90
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                      : healthMetrics.overallHealthScore >= 70
                      ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                      : 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                  }`}
                >
                  <Activity className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-extrabold text-white flex items-center gap-2">
                    <span>Tingkat Kesehatan Integrasi Data Akuntansi</span>
                    <span
                      className={`px-2.5 py-0.5 text-[10px] font-black rounded-full uppercase border ${
                        healthMetrics.overallHealthScore >= 90
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          : healthMetrics.overallHealthScore >= 70
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                          : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                      }`}
                    >
                      {healthMetrics.overallHealthScore}%{' '}
                      {healthMetrics.overallHealthScore >= 90
                        ? 'Sangat Sehat'
                        : healthMetrics.overallHealthScore >= 70
                        ? 'Perlu Perhatian'
                        : 'Anomali Tingkat Tinggi'}
                    </span>
                  </h4>
                  <p className="text-[11px] text-slate-400 font-medium">
                    Visualisasi persentase kelengkapan COA, pemetaan kategori, & keseimbangan saldo GL untuk transparansi audit data.
                  </p>
                </div>
              </div>

              <div className="text-right shrink-0">
                <div className="text-2xl font-black font-mono text-emerald-400">
                  {healthMetrics.overallHealthScore}%
                </div>
                <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                  Skor Integritas GL
                </div>
              </div>
            </div>

            {/* Progress Bars Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
              {/* Progress 1: Valid COA Accounts */}
              <div className="space-y-1.5 p-3 bg-slate-800/60 rounded-xl border border-slate-700/60">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-slate-300 flex items-center gap-1.5">
                    <Link className="h-3.5 w-3.5 text-blue-400" />
                    <span>Koneksi COA Rekening</span>
                  </span>
                  <span className="font-mono text-blue-400 font-extrabold">{healthMetrics.accountCoaPct}%</span>
                </div>
                <div className="w-full bg-slate-700 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-blue-500 h-full rounded-full transition-all duration-500"
                    style={{ width: `${healthMetrics.accountCoaPct}%` }}
                  />
                </div>
                <div className="text-[10px] text-slate-400 flex justify-between font-mono">
                  <span>
                    {healthMetrics.validCoaAccountsCount} dari {healthMetrics.totalAccounts} Akun COA Valid
                  </span>
                  <span>{healthMetrics.accountCoaPct === 100 ? 'Valid' : 'Perlu Relasi'}</span>
                </div>
              </div>

              {/* Progress 2: Category Mapping */}
              <div className="space-y-1.5 p-3 bg-slate-800/60 rounded-xl border border-slate-700/60">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-slate-300 flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-purple-400" />
                    <span>Pemetaan Kategori COA</span>
                  </span>
                  <span className="font-mono text-purple-400 font-extrabold">
                    {healthMetrics.categoryMappingPct}%
                  </span>
                </div>
                <div className="w-full bg-slate-700 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-purple-500 h-full rounded-full transition-all duration-500"
                    style={{ width: `${healthMetrics.categoryMappingPct}%` }}
                  />
                </div>
                <div className="text-[10px] text-slate-400 flex justify-between font-mono">
                  <span>
                    {healthMetrics.mappedCatCount} dari {healthMetrics.totalCatCount} Kategori Terdaftar
                  </span>
                  <span>
                    {healthMetrics.categoryMappingPct === 100
                      ? 'Terdaftar 100%'
                      : `${categoryAudit.unmappedCategories.length} Anomali`}
                  </span>
                </div>
              </div>

              {/* Progress 3: Balance Reconciliation */}
              <div className="space-y-1.5 p-3 bg-slate-800/60 rounded-xl border border-slate-700/60">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-slate-300 flex items-center gap-1.5">
                    <Scale className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Keseimbangan Saldo GL vs Kas</span>
                  </span>
                  <span className="font-mono text-emerald-400 font-extrabold">
                    {healthMetrics.balanceReconciledPct}%
                  </span>
                </div>
                <div className="w-full bg-slate-700 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                    style={{ width: `${healthMetrics.balanceReconciledPct}%` }}
                  />
                </div>
                <div className="text-[10px] text-slate-400 flex justify-between font-mono">
                  <span>
                    {healthMetrics.reconciledCount} dari {healthMetrics.totalAccounts} Akun Reconciled
                  </span>
                  <span>{healthMetrics.balanceReconciledPct === 100 ? 'Seimbang' : 'Ada Selisih'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Success Banner */}
          {reconciliationSuccessMessage && (
            <div className="p-4 bg-emerald-500 text-white rounded-2xl flex items-center justify-between gap-3 text-xs font-extrabold shadow-lg animate-fadeIn">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-100 shrink-0" />
                <span>{reconciliationSuccessMessage}</span>
              </div>
              <button
                onClick={() => setReconciliationSuccessMessage(null)}
                className="text-emerald-100 hover:text-white text-xs uppercase"
              >
                Tutup
              </button>
            </div>
          )}

          {/* TAB 1: AUDIT COA & BUKU BESAR */}
          {activeTab === 'audit' && (
            <div className="space-y-6">
              {/* Status Banner */}
              {isIntegrityValid ? (
                <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-2xl flex items-center gap-3 text-emerald-900 dark:text-emerald-200 text-xs font-medium">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                  <div>
                    <strong>Seluruh Struktur Jurnal Valid!</strong> Semua {categoryAudit.totalCategoriesInTx} kategori transaksi terdaftar dengan sempurna dalam Master Chart of Accounts (COA).
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-2xl flex items-center gap-3 text-amber-900 dark:text-amber-200 text-xs font-medium">
                  <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
                  <div>
                    <strong>Anomali MAPPING COA Terdeteksi!</strong> Terdapat <strong>{categoryAudit.unmappedCategories.length} kategori transaksi</strong> yang digunakan pada log transaksi tetapi belum terdaftar resmi pada pohon Master COA.
                  </div>
                </div>
              )}

              {/* Unmapped Categories */}
              {categoryAudit.unmappedCategories.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    <span>Anomali Kategori Belum Terdaftar ({categoryAudit.unmappedCategories.length} Item)</span>
                  </h4>

                  <div className="overflow-x-auto border border-amber-200 dark:border-amber-900/60 rounded-xl bg-amber-50/50 dark:bg-amber-950/20">
                    <table className="w-full text-left text-xs font-medium">
                      <thead className="bg-amber-100/60 dark:bg-amber-900/40 border-b border-amber-200 dark:border-amber-800 text-[10px] font-extrabold text-amber-900 dark:text-amber-200 uppercase">
                        <tr>
                          <th className="py-2.5 px-3">Nama Kategori</th>
                          <th className="py-2.5 px-3">Tipe</th>
                          <th className="py-2.5 px-3 text-center">Jumlah Transaksi</th>
                          <th className="py-2.5 px-3 text-right">Total Akumulasi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-amber-200/60 dark:divide-amber-900/40 text-slate-800 dark:text-slate-200">
                        {categoryAudit.unmappedCategories.map((item, idx) => (
                          <tr key={idx} className="hover:bg-amber-100/40 dark:hover:bg-amber-900/20">
                            <td className="py-2 px-3 font-bold text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                              {item.name}
                            </td>
                            <td className="py-2 px-3 uppercase text-[10px] font-extrabold text-slate-500 dark:text-slate-400">
                              {item.type}
                            </td>
                            <td className="py-2 px-3 text-center font-mono font-bold">{item.count} tx</td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                              {formatterIDR.format(item.totalAmount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Ledger Reference & Duplicate Audit Panel */}
              <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div className="space-y-0.5">
                    <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-800 dark:text-slate-100 flex items-center gap-2">
                      {ledgerAudit.isLedgerClean ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
                      )}
                      <span>Validasi Referensi Akun &amp; Duplikasi Buku Besar</span>
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {transactions.length} entri buku besar dipindai · {ledgerAudit.totalOrphans} transaksi yatim ·{' '}
                      {ledgerAudit.totalDuplicateIdRows} ID duplikat · {ledgerAudit.totalSameDayDuplicateRows} entri identik di hari sama
                    </p>
                  </div>

                  {!ledgerAudit.isLedgerClean &&
                    (ledgerAudit.totalDuplicateIdRows > 0 || ledgerAudit.totalSameDayDuplicateRows > 0) &&
                    onUpdateTransactions && (
                      <button
                        type="button"
                        onClick={() =>
                          handleRemoveDuplicates(
                            [
                              ...ledgerAudit.duplicateIdGroups.flatMap((g) => g.duplicateIndices),
                              ...ledgerAudit.sameDayDuplicateGroups.flatMap((g) => g.duplicateIndices),
                            ],
                            'Pembersihan Semua Duplikat Buku Besar'
                          )
                        }
                        className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold rounded-xl transition cursor-pointer shrink-0 whitespace-nowrap"
                      >
                        Bersihkan Semua Duplikat ({ledgerAudit.totalDuplicateIdRows + ledgerAudit.totalSameDayDuplicateRows})
                      </button>
                    )}
                </div>

                {ledgerAudit.isLedgerClean ? (
                  <p className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">
                    Seluruh transaksi non-penyesuaian terhubung ke rekening valid dan tidak ditemukan data ganda di buku besar.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {/* Orphan Transactions */}
                    {ledgerAudit.orphanTransactions.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-[11px] font-extrabold text-rose-700 dark:text-rose-300">
                          Transaksi Tanpa Referensi Akun Valid ({ledgerAudit.orphanTransactions.length})
                        </div>
                        <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-[10px] font-extrabold text-slate-500 uppercase">
                              <tr>
                                <th className="py-2 px-3">Tanggal</th>
                                <th className="py-2 px-3">Transaksi</th>
                                <th className="py-2 px-3">Akun Bermasalah</th>
                                <th className="py-2 px-3 text-right">Nominal</th>
                                <th className="py-2 px-3 text-right">Perbaikan</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                              {ledgerAudit.orphanTransactions.map((orphan) => {
                                const tx = orphan.transaction;
                                const selectedAcc = orphanTargetAccounts[orphan.index] || defaultValidAccountId;
                                return (
                                  <tr key={`${orphan.index}-${tx.id}`}>
                                    <td className="py-2 px-3 font-mono tabular-nums text-slate-600 dark:text-slate-300 whitespace-nowrap">
                                      {tx.date}
                                    </td>
                                    <td className="py-2 px-3">
                                      <div className="font-bold text-slate-800 dark:text-slate-100">
                                        {tx.description || tx.category}
                                      </div>
                                      <div className="text-[10px] text-slate-500">
                                        {tx.category} · {tx.type}
                                      </div>
                                    </td>
                                    <td className="py-2 px-3 font-mono text-[11px] text-rose-600 dark:text-rose-400">
                                      {orphan.reason === 'missing_account_id' ? '(Kosong)' : tx.accountId}
                                    </td>
                                    <td className="py-2 px-3 font-mono tabular-nums text-right font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                                      {formatterIDR.format(tx.amount)}
                                    </td>
                                    <td className="py-2 px-3">
                                      {onUpdateTransactions && (
                                        <div className="flex items-center justify-end gap-1.5">
                                          {accounts.length > 0 && (
                                            <>
                                              <select
                                                value={selectedAcc}
                                                onChange={(e) =>
                                                  setOrphanTargetAccounts((prev) => ({
                                                    ...prev,
                                                    [orphan.index]: e.target.value,
                                                  }))
                                                }
                                                className="px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-[11px] font-semibold text-slate-800 dark:text-slate-100 max-w-[140px]"
                                              >
                                                {accounts.map((acc) => (
                                                  <option key={acc.id} value={acc.id}>
                                                    {acc.name}
                                                  </option>
                                                ))}
                                              </select>
                                              <button
                                                type="button"
                                                onClick={() => handleReassignOrphan(orphan.index)}
                                                className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold rounded-lg transition cursor-pointer whitespace-nowrap"
                                              >
                                                Alihkan
                                              </button>
                                            </>
                                          )}
                                          <button
                                            type="button"
                                            onClick={() => handleDeleteOrphan(orphan.index)}
                                            className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold rounded-lg transition cursor-pointer whitespace-nowrap"
                                          >
                                            Hapus
                                          </button>
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Duplicate Groups (ID Duplicates + Same-Day Identical) */}
                    {(ledgerAudit.duplicateIdGroups.length > 0 || ledgerAudit.sameDayDuplicateGroups.length > 0) && (
                      <div className="space-y-2">
                        <div className="text-[11px] font-extrabold text-amber-800 dark:text-amber-300">
                          Potensi Data Ganda di Buku Besar (
                          {ledgerAudit.duplicateIdGroups.length + ledgerAudit.sameDayDuplicateGroups.length} Kelompok)
                        </div>
                        <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl">
                          {[...ledgerAudit.duplicateIdGroups, ...ledgerAudit.sameDayDuplicateGroups].map((grp) => {
                            const sample = grp.items[0]?.transaction;
                            return (
                              <div
                                key={grp.groupKey}
                                className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                              >
                                <div className="space-y-0.5 min-w-0">
                                  <div className="font-bold text-slate-900 dark:text-slate-100 truncate">
                                    {grp.kind === 'duplicate_id' ? 'ID Duplikat' : 'Entri Identik Hari Sama'} ·{' '}
                                    {sample?.description || sample?.category}
                                  </div>
                                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                                    {sample?.date} · {grp.items.length}x tercatat ·{' '}
                                    {formatterIDR.format(sample?.amount || 0)}
                                  </div>
                                </div>
                                {onUpdateTransactions && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleRemoveDuplicates(grp.duplicateIndices, grp.fingerprintLabel)
                                    }
                                    className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-extrabold rounded-lg transition cursor-pointer shrink-0 whitespace-nowrap"
                                  >
                                    Hapus {grp.duplicateIndices.length} Salinan
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Account Balances Ledger Table */}
              <div className="space-y-3">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <ListChecks className="h-4 w-4 text-blue-500" />
                    <span>Audit Saldo Buku Besar (GL) & Log Transaksi ({accounts.length} Akun)</span>
                  </span>
                </h4>

                <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                  <table className="w-full text-left text-xs font-medium">
                    <thead className="bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-[10px] font-extrabold text-slate-400 uppercase">
                      <tr>
                        <th className="py-2.5 px-3">Nama Rekening / Akun</th>
                        <th className="py-2.5 px-3">Tipe</th>
                        <th className="py-2.5 px-3 font-mono text-center">Jumlah Tx</th>
                        <th className="py-2.5 px-3 font-mono text-right">Saldo GL Terhitung</th>
                        <th className="py-2.5 px-3 font-mono text-right">Saldo Kas Tercatat</th>
                        <th className="py-2.5 px-3 text-center">Status Audit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                      {accountAudit.map((acc) => (
                        <tr key={acc.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-slate-100">{acc.name}</td>
                          <td className="py-2.5 px-3 text-[10px] font-extrabold uppercase text-slate-500 dark:text-slate-400">
                            {acc.type}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-center font-bold">{acc.txCount} tx</td>
                          <td className="py-2.5 px-3 font-mono text-right font-bold text-slate-900 dark:text-slate-100">
                            {formatterIDR.format(acc.glCalculatedBalance)}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-right font-bold text-slate-900 dark:text-slate-100">
                            {formatterIDR.format(acc.actualCashBalance)}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {acc.difference === 0 ? (
                              <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-[10px] font-black rounded-full border border-emerald-300 dark:border-emerald-800 inline-flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3" /> Reconciled
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 text-[10px] font-black rounded-full border border-rose-300 dark:border-rose-800 inline-flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" /> Unreconciled
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: AUTO-RECONCILIATION & JURNAL PENYESUAIAN */}
          {activeTab === 'auto-reconcile' && (
            <div className="space-y-6">
              {/* Informational Header */}
              <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-slate-850 border border-blue-200 dark:border-slate-700 rounded-2xl space-y-2">
                <div className="flex items-center gap-2 text-blue-900 dark:text-blue-300 font-extrabold text-sm">
                  <RefreshCw className="h-5 w-5 text-blue-600 animate-spin-slow" />
                  <span>Sistem Rekonsiliasi Otomatis Akhir Bulan (Auto-Reconciliation Engine)</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Sistem membandingkan saldo buku besar (GL) dari riwayat transaksi ter-rekam dengan fisik saldo kas sebenarnya di rekening bank / dompet. Jika ditemukan selisih, sistem secara otomatis mengusulkan <strong>Entri Penyesuaian (Adjustment Entries)</strong> sesuai standar akuntansi dual-entry.
                </p>
              </div>

              {/* Physical Cash Verification Input Table */}
              <div className="space-y-3">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <Calculator className="h-4 w-4 text-emerald-500" />
                  <span>1. Verifikasi Saldo Kas Fisik Sebenarnya (End-of-Month Statement)</span>
                </h4>

                <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                  <table className="w-full text-left text-xs font-medium">
                    <thead className="bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-[10px] font-extrabold text-slate-400 uppercase">
                      <tr>
                        <th className="py-2.5 px-3">Nama Rekening</th>
                        <th className="py-2.5 px-3 font-mono text-right">Saldo GL Terhitung</th>
                        <th className="py-2.5 px-3 font-mono text-right">Saldo Kas Sebenarnya (Rp)</th>
                        <th className="py-2.5 px-3 font-mono text-right">Selisih (Variance)</th>
                        <th className="py-2.5 px-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-800 dark:text-slate-200">
                      {accountAudit.map((acc) => (
                        <tr key={acc.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-slate-100">{acc.name}</td>
                          <td className="py-2.5 px-3 font-mono text-right font-bold text-slate-600 dark:text-slate-400">
                            {formatterIDR.format(acc.glCalculatedBalance)}
                          </td>
                          <td className="py-2 px-3 text-right">
                            <input
                              type="number"
                              value={acc.actualCashBalance}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0;
                                setCustomActualBalances((prev) => ({ ...prev, [acc.id]: val }));
                              }}
                              className="w-36 text-right font-mono font-extrabold bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </td>
                          <td
                            className={`py-2.5 px-3 font-mono text-right font-extrabold ${
                              acc.difference === 0
                                ? 'text-slate-400'
                                : acc.difference > 0
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-rose-600 dark:text-rose-400'
                            }`}
                          >
                            {acc.difference > 0 ? `+${formatterIDR.format(acc.difference)}` : formatterIDR.format(acc.difference)}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {acc.difference === 0 ? (
                              <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-[10px] font-black rounded-full border border-emerald-300 dark:border-emerald-800 inline-flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3" /> Match 100%
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 text-[10px] font-black rounded-full border border-amber-300 dark:border-amber-800 inline-flex items-center gap-1">
                                Selisih {formatterIDR.format(Math.abs(acc.difference))}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Proposed Adjustment Entries Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <FileCheck2 className="h-4 w-4 text-blue-500" />
                    <span>2. Usulan Jurnal Penyesuaian Otomatis ({proposedAdjustmentEntries.length} Entri)</span>
                  </h4>

                  {proposedAdjustmentEntries.length > 0 && (
                    <button
                      type="button"
                      onClick={handleExecuteAutoReconciliation}
                      className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl font-extrabold text-xs shadow-md hover:brightness-110 transition flex items-center gap-2 cursor-pointer"
                    >
                      <Sparkles className="h-4 w-4 text-amber-300" />
                      <span>Eksekusi Jurnal Penyesuaian ({proposedAdjustmentEntries.length})</span>
                    </button>
                  )}
                </div>

                {proposedAdjustmentEntries.length > 0 ? (
                  <div className="space-y-3">
                    {proposedAdjustmentEntries.map((e, idx) => (
                      <div
                        key={idx}
                        className="p-4 bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-700 rounded-2xl space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2.5 py-0.5 text-[10px] font-black uppercase rounded-full ${
                                e.type === 'income'
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                  : 'bg-rose-100 text-rose-800 border border-rose-300'
                              }`}
                            >
                              {e.type === 'income' ? 'Penyesuaian Surplus (+)' : 'Penyesuaian Defisit (-)'}
                            </span>
                            <span className="font-extrabold text-xs text-slate-800 dark:text-slate-100">
                              Rekening: {e.accountName}
                            </span>
                          </div>

                          <span className="font-mono font-black text-sm text-slate-900 dark:text-slate-100">
                            {formatterIDR.format(e.amount)}
                          </span>
                        </div>

                        <p className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                          <strong>Deskripsi:</strong> {e.description}
                        </p>

                        <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-xl text-[10px] font-mono text-slate-600 dark:text-slate-400">
                          {e.debitCreditNote}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-300 dark:border-slate-700 rounded-2xl space-y-2">
                    <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto" />
                    <p className="text-xs font-extrabold text-slate-800 dark:text-slate-200">
                      Seluruh Rekening Kas & Bank Ter-rekonsiliasi Sempurna!
                    </p>
                    <p className="text-[11px] text-slate-500 max-w-md mx-auto">
                      Tidak ada selisih saldo antara Buku Besar (GL) dan saldo kas fisik. Tidak diperlukan entri penyesuaian tambahan.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: REKONSILIASI MANUAL COA & RELASI AKUN */}
          {activeTab === 'manual-reconcile' && (
            <div className="space-y-6">
              <div className="p-4 bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-2xl space-y-2">
                <div className="flex items-center gap-2 text-purple-900 dark:text-purple-300 font-extrabold text-sm">
                  <Link className="h-5 w-5 text-purple-600" />
                  <span>Rekonsiliasi Manual & Pemindaian Otomatis COA</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Pindai COA duplikat atau tidak terpakai, gabungkan ke COA induk secara otomatis, dan sesuaikan relasi ID antara Akun Rekening dengan Master COA secara permanen.
                </p>
              </div>

              {/* AUTO SCANNER & MERGE CARD */}
              <div className="p-4 bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900 text-white rounded-2xl border border-purple-800/60 shadow-lg space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-purple-800/40 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-purple-500/20 text-purple-300 rounded-xl border border-purple-500/30">
                      <Sparkles className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-extrabold text-white">Hasil Pemindaian Otomatis COA</h4>
                      <p className="text-[11px] text-purple-200">
                        {scanResult.totalDuplicates === 0 && scanResult.totalUnused === 0
                          ? 'Tidak ditemukan duplikat atau COA yatim. Master COA Anda sangat bersih!'
                          : `Terdeteksi ${scanResult.totalDuplicates} COA duplikat dan ${scanResult.totalUnused} COA tidak terpakai.`}
                      </p>
                    </div>
                  </div>

                  {(scanResult.totalDuplicates > 0 || scanResult.totalUnused > 0) && (
                    <button
                      type="button"
                      onClick={handleAutoMergeAndCleanup}
                      className="px-4 py-2 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white text-xs font-black rounded-xl shadow-md transition cursor-pointer flex items-center justify-center gap-2 shrink-0"
                    >
                      <RefreshCw className="h-4 w-4 animate-spin-slow" />
                      <span>Gabung Duplikat & Bersihkan COA Otomatis</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-300">COA Duplikat:</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                        scanResult.duplicateCodes.length > 0 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-emerald-500/20 text-emerald-300'
                      }`}>
                        {scanResult.duplicateCodes.length} Kelompok
                      </span>
                    </div>
                    {scanResult.duplicateCodes.length > 0 ? (
                      <div className="text-[11px] text-amber-200 space-y-1">
                        {scanResult.duplicateCodes.map((d) => (
                          <div key={d.code} className="truncate">
                            • Kode [{d.code}]: {d.items.map((i) => i.name).join(' | ')}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-400">Tidak ada kode COA ganda.</p>
                    )}
                  </div>

                  <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-300">COA Tidak Terpakai:</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                        scanResult.totalUnused > 0 ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' : 'bg-emerald-500/20 text-emerald-300'
                      }`}>
                        {scanResult.totalUnused} Node
                      </span>
                    </div>
                    {scanResult.totalUnused > 0 ? (
                      <div className="text-[11px] text-blue-200 truncate">
                        • COA: {scanResult.unusedCoas.map((u) => `[${u.code}] ${u.name}`).slice(0, 3).join(', ')}
                        {scanResult.totalUnused > 3 && ` (+${scanResult.totalUnused - 3} lainnya)`}
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-400">Semua COA terhubung secara aktif.</p>
                    )}
                  </div>

                  <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-300">Duplikat Buku Besar:</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                        scanResult.totalLedgerDuplicates > 0 ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-emerald-500/20 text-emerald-300'
                      }`}>
                        {scanResult.totalLedgerDuplicates} Entri
                      </span>
                    </div>
                    {scanResult.totalLedgerDuplicates > 0 ? (
                      <div className="space-y-2">
                        <p className="text-[11px] text-rose-200">
                          {scanResult.ledgerDuplicateIdGroups.length} grup ID duplikat · {scanResult.ledgerSameDayDuplicateGroups.length} grup identik hari sama.
                        </p>
                        {onUpdateTransactions && (
                          <button
                            type="button"
                            onClick={() => {
                              const allDupIndices = [
                                ...scanResult.ledgerDuplicateIdGroups.flatMap((g) => g.duplicateIndices),
                                ...scanResult.ledgerSameDayDuplicateGroups.flatMap((g) => g.duplicateIndices),
                              ];
                              handleRemoveDuplicates(allDupIndices, 'Pembersihan Duplikat Buku Besar (COA Scanner)');
                            }}
                            className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-[10px] font-bold transition cursor-pointer"
                          >
                            Bersihkan Aman Saldo
                          </button>
                        )}
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-400">Tidak ada ID ganda atau entri identik harian.</p>
                    )}
                  </div>
                </div>
              </div>

              {manualSyncMessage && (
                <div className="p-3.5 bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center justify-between shadow-sm animate-fadeIn">
                  <span className="flex items-center gap-2">
                    <CheckCheck className="h-4 w-4" />
                    {manualSyncMessage}
                  </span>
                  <button onClick={() => setManualSyncMessage(null)} className="text-white text-xs hover:underline cursor-pointer">
                    Tutup
                  </button>
                </div>
              )}

              {/* SMART AI AUTO-FIX RECOMMENDATIONS */}
              {smartFixSuggestions.length > 0 && (
                <div className="p-4 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-slate-800 dark:to-slate-850 border border-amber-300 dark:border-amber-800/70 rounded-2xl space-y-3 animate-fadeIn">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-xl border border-amber-500/30">
                        <Wand2 className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-amber-950 dark:text-amber-200 uppercase tracking-wider flex items-center gap-2">
                          <span>Rekomendasi Auto-Fix AI ({smartFixSuggestions.length} Akun Belum Terhubung)</span>
                          <span className="px-2 py-0.5 bg-amber-500 text-white text-[9px] font-black rounded-full">
                            Kemiripan Nama
                          </span>
                        </h4>
                        <p className="text-[11px] text-slate-600 dark:text-slate-300">
                          Sistem kecerdasan AI mendeteksi kemiripan nama akun dengan Master COA untuk perbaikan relasi cepat 1-klik.
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleApplyAllSmartFixes}
                      className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white text-xs font-extrabold rounded-xl shadow-md transition cursor-pointer flex items-center justify-center gap-1.5 shrink-0"
                    >
                      <Zap className="h-4 w-4 fill-current text-amber-200" />
                      <span>Terapkan Semua Saran Auto-Fix ({smartFixSuggestions.length})</span>
                    </button>
                  </div>

                  <div className="space-y-2 pt-1">
                    {smartFixSuggestions.map((sugg) => (
                      <div
                        key={sugg.accountId}
                        className="p-3 bg-white dark:bg-slate-900 border border-amber-200 dark:border-slate-700 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-slate-900 dark:text-slate-100">{sugg.accountName}</span>
                            <span className="text-[10px] font-mono uppercase bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-500">
                              {sugg.accountType}
                            </span>
                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-full border border-emerald-200">
                              {sugg.confidence}% Cocok
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            Disarankan terhubung ke:{' '}
                            <strong className="text-amber-800 dark:text-amber-300">
                              [{sugg.suggestedCoaCode}] {sugg.suggestedCoaName}
                            </strong>{' '}
                            ({sugg.suggestedCoaCategory})
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleApplySingleSmartFix(sugg)}
                          className="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 dark:bg-amber-900/40 dark:hover:bg-amber-900/70 dark:text-amber-200 rounded-lg text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1 shrink-0"
                        >
                          <Check className="h-3.5 w-3.5" />
                          <span>Terapkan Auto-Fix</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Account Mapping Table */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="h-4 w-4 absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Cari nama atau tipe rekening..."
                      value={accountFilterQuery}
                      onChange={(e) => setAccountFilterQuery(e.target.value)}
                      className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleSaveManualAccountMappings}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-xs rounded-xl shadow-sm transition cursor-pointer flex items-center gap-1.5 shrink-0 self-start sm:self-auto"
                  >
                    <CheckCheck className="h-4 w-4" />
                    <span>Simpan & Perbarui Relasi Sistem</span>
                  </button>
                </div>

                <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                  <table className="w-full text-left text-xs font-medium">
                    <thead className="bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-[10px] font-extrabold text-slate-400 uppercase">
                      <tr>
                        <th className="py-2.5 px-3">Nama Akun Rekening</th>
                        <th className="py-2.5 px-3">Tipe Rekening</th>
                        <th className="py-2.5 px-3">Status Relasi COA Saat Ini</th>
                        <th className="py-2.5 px-3">Pilih Pemetaan Master COA</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-800 dark:text-slate-200">
                      {accounts
                        .filter((acc) =>
                          !accountFilterQuery ||
                          acc.name.toLowerCase().includes(accountFilterQuery.toLowerCase()) ||
                          acc.type.toLowerCase().includes(accountFilterQuery.toLowerCase())
                        )
                        .map((acc) => {
                          const currentMapping = getAccountCoaMapping(acc, activeCoaList);
                          const selectedCode = manualAccountMappings[acc.id] || currentMapping.code;
                          const isOrphaned = currentMapping.isOrphaned;

                          return (
                            <tr key={acc.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                              <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-slate-100">
                                {acc.name}
                              </td>
                              <td className="py-2.5 px-3 uppercase text-[10px] font-mono text-slate-500 dark:text-slate-400">
                                {acc.type}
                              </td>
                              <td className="py-2.5 px-3">
                                {isOrphaned ? (
                                  <span className="px-2 py-0.5 bg-rose-100 text-rose-800 text-[10px] font-bold rounded-full border border-rose-200 inline-flex items-center gap-1">
                                    <AlertTriangle className="h-3 w-3 text-rose-600" /> COA Terhapus!
                                  </span>
                                ) : currentMapping.isExplicit ? (
                                  <span className="px-2 py-0.5 bg-purple-100 text-purple-800 text-[10px] font-bold rounded-full border border-purple-200 inline-flex items-center gap-1">
                                    Explicit COA {currentMapping.code}
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-[10px] font-bold rounded-full border border-blue-200 inline-flex items-center gap-1">
                                    Auto COA {currentMapping.code}
                                  </span>
                                )}
                              </td>
                              <td className="py-2 px-3">
                                <select
                                  value={selectedCode}
                                  onChange={(e) => {
                                    const code = e.target.value;
                                    setManualAccountMappings((prev) => ({ ...prev, [acc.id]: code }));
                                  }}
                                  className="w-full py-1.5 px-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                                >
                                  {activeCoaList.map((c) => (
                                    <option key={c.code} value={c.code}>
                                      [{c.code}] {c.name} ({c.category})
                                    </option>
                                  ))}
                                </select>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: LOG RIWAYAT PERUBAHAN MASTER DATA */}
          {activeTab === 'change-log' && (
            <div className="space-y-6">
              <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-amber-900 dark:text-amber-300 font-extrabold text-sm">
                    <History className="h-5 w-5 text-amber-600" />
                    <span>Tabel Log Riwayat Perubahan Master Data</span>
                  </div>
                  {changeLogs.length > 0 && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleExportLogsCSV}
                        className="text-xs text-amber-700 dark:text-amber-300 hover:text-amber-900 font-bold flex items-center gap-1.5 bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/40 dark:hover:bg-amber-900/70 px-3 py-1.5 rounded-xl border border-amber-300 dark:border-amber-800 transition cursor-pointer"
                        title="Unduh riwayat log perubahan master data ke format CSV"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>Ekspor Log (CSV)</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleClearLogs}
                        className="text-xs text-rose-600 hover:text-rose-700 font-bold flex items-center gap-1 bg-rose-50 hover:bg-rose-100 px-2.5 py-1.5 rounded-xl border border-rose-200 transition cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Bersihkan Log</span>
                      </button>
                    </div>
                  )}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Lacak kapan dan di mana sebuah COA, Akun, atau Kategori terakhir dimodifikasi untuk transparansi audit dan kemudahan perbaikan ketidakkonsistenan data.
                </p>
              </div>

              {/* Log Filters */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="relative flex-1 w-full">
                  <Search className="h-4 w-4 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Cari dalam log riwayat..."
                    value={logSearchQuery}
                    onChange={(e) => setLogSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <select
                  value={logFilterAction}
                  onChange={(e) => setLogFilterAction(e.target.value)}
                  className="w-full sm:w-48 py-1.5 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="ALL">Semua Aksi</option>
                  <option value="CREATE">CREATE (Tambah)</option>
                  <option value="UPDATE">UPDATE (Ubah)</option>
                  <option value="DELETE">DELETE (Hapus)</option>
                  <option value="RECONCILE">RECONCILE (Rekonsiliasi)</option>
                  <option value="SYNC">SYNC (Sinkronisasi)</option>
                </select>
              </div>

              {/* Log Table */}
              <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                <table className="w-full text-left text-xs font-medium">
                  <thead className="bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-[10px] font-extrabold text-slate-400 uppercase">
                    <tr>
                      <th className="py-2.5 px-3">Waktu</th>
                      <th className="py-2.5 px-3">Tipe & Target</th>
                      <th className="py-2.5 px-3">Aksi</th>
                      <th className="py-2.5 px-3">Rincian Perubahan</th>
                      <th className="py-2.5 px-3">Oleh</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-800 dark:text-slate-200">
                    {filteredChangeLogs.length > 0 ? (
                      filteredChangeLogs.map((log) => {
                        let badgeColor = 'bg-slate-100 text-slate-700';
                        if (log.action === 'CREATE') badgeColor = 'bg-emerald-100 text-emerald-800 border border-emerald-200';
                        if (log.action === 'UPDATE') badgeColor = 'bg-blue-100 text-blue-800 border border-blue-200';
                        if (log.action === 'DELETE') badgeColor = 'bg-rose-100 text-rose-800 border border-rose-200';
                        if (log.action === 'RECONCILE') badgeColor = 'bg-purple-100 text-purple-800 border border-purple-200';
                        if (log.action === 'SYNC') badgeColor = 'bg-amber-100 text-amber-800 border border-amber-200';

                        return (
                          <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                              {log.timestamp}
                            </td>
                            <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-slate-100">
                              <span className="text-[10px] font-mono uppercase bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded mr-1.5 text-slate-700 dark:text-slate-300">
                                {log.targetType}
                              </span>
                              {log.targetName}
                            </td>
                            <td className="py-2.5 px-3">
                              <span className={`px-2 py-0.5 text-[10px] font-black rounded-full uppercase ${badgeColor}`}>
                                {log.action}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300 font-medium">
                              {log.details}
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-slate-400 text-[11px]">
                              {log.updatedBy}
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-400">
                          Belum ada riwayat log perubahan master data.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-5 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-500 dark:text-slate-400 font-medium text-center sm:text-left">
            <span>Standar Akuntansi Dual-Entry Keuangan Nusantara Wealth</span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 font-bold text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
            >
              Tutup
            </button>

            {activeTab === 'audit' && !isIntegrityValid && (
              <button
                type="button"
                onClick={handleHarmonizeClick}
                className="flex-1 sm:flex-initial px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl font-extrabold text-xs shadow-md hover:from-emerald-700 hover:to-teal-700 transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <RefreshCw className="h-4 w-4" />
                <span>Otomatis Daftarkan & Harmoniskan COA</span>
              </button>
            )}

            {activeTab === 'auto-reconcile' && proposedAdjustmentEntries.length > 0 && (
              <button
                type="button"
                onClick={handleExecuteAutoReconciliation}
                className="flex-1 sm:flex-initial px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl font-extrabold text-xs shadow-md hover:brightness-110 transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <Sparkles className="h-4 w-4 text-amber-300" />
                <span>Eksekusi Auto-Reconciliation ({proposedAdjustmentEntries.length})</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* In-App Confirmation Modal for Clearing Logs */}
      {showClearLogsConfirm && (
        <div className="fixed inset-0 z-[70] bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-sm w-full p-5 border border-slate-200 dark:border-slate-700 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-rose-100 text-rose-600 rounded-xl shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <h4 className="font-extrabold text-sm text-slate-800 dark:text-white">
                  Bersihkan Riwayat Log?
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Apakah Anda yakin ingin membersihkan seluruh riwayat log perubahan master data? Tindakan ini tidak dapat dibatalkan.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowClearLogsConfirm(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmClearLogs}
                className="px-4 py-2 rounded-xl text-xs font-extrabold text-white bg-rose-600 hover:bg-rose-700 transition cursor-pointer shadow-xs"
              >
                Ya, Bersihkan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
