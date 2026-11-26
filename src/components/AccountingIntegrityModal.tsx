import React, { useState, useMemo, useEffect } from 'react';
import { Account, Transaction } from '../types';
import { CategoryNode } from '../categoryHierarchy';
import { toLocalYYYYMMDD } from '../utils/accountingEngine';
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
  CoaScanResult,
  ScannedLedgerAnomalyRow,
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
  isCreditAccount,
  previewSafeAnomalyCleanupImpact,
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
  coaScanResult?: CoaScanResult;
  onRescanCoa?: () => CoaScanResult | void;
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
  coaScanResult,
  onRescanCoa,
  defaultTab = 'audit',
}) => {
  const [activeTab, setActiveTab] = useState<'audit' | 'auto-reconcile' | 'manual-reconcile' | 'change-log'>(defaultTab);
  const [customActualBalances, setCustomActualBalances] = useState<Record<string, number>>({});
  const [reconciliationConfirmed, setReconciliationConfirmed] = useState(false);
  const [reconciliationEvidenceNote, setReconciliationEvidenceNote] = useState('');
  const [reconciliationSuccessMessage, setReconciliationSuccessMessage] = useState<string | null>(null);
  const [orphanTargetAccounts, setOrphanTargetAccounts] = useState<Record<number, string>>({});
  const [orphanActionModes, setOrphanActionModes] = useState<Record<number, 'reassign' | 'delete'>>({});
  const [selectedAnomalyKeys, setSelectedAnomalyKeys] = useState<Set<string>>(new Set());
  const [anomalyFilterKind, setAnomalyFilterKind] = useState<
    'all' | 'duplicate_id' | 'same_day_identical' | 'orphan_transaction'
  >('all');
  const [showCleanupConfirm, setShowCleanupConfirm] = useState<boolean>(false);

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
    return accounts.filter((acc) => !isCreditAccount(acc)).map((acc) => {
      const gl = calculateAccountGLBalance(acc, transactions);
      const lastReconciliation = transactions.reduce<Transaction | undefined>((latest, transaction) => {
        if (
          transaction.accountId !== acc.id ||
          transaction.adjustmentType !== 'reconciliation' ||
          !transaction.reconciliationEvidenceReference?.trim() ||
          !transaction.reconciliationEvidenceConfirmedAt?.trim() ||
          transaction.reconciliationActualBalance == null ||
          transaction.reconciliationRecordedBalance == null
        ) return latest;
        if (!latest || (transaction.reconciliationEvidenceConfirmedAt || '') >
          (latest.reconciliationEvidenceConfirmedAt || '')) return transaction;
        return latest;
      }, undefined);
      const reconciledActualBalance = lastReconciliation
        ? Number(lastReconciliation.reconciliationActualBalance) +
          gl.recordedBalance - Number(lastReconciliation.reconciliationRecordedBalance)
        : gl.recordedBalance;

      // Actual cash balance (user input override or recorded current balance)
      const actualCashBalance = customActualBalances[acc.id] !== undefined
        ? customActualBalances[acc.id]
        : reconciledActualBalance;

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
      actualBalance: number;
      recordedBalance: number;
    }> = [];

    accountAudit.forEach((acc) => {
      const absDiff = Math.abs(acc.difference);
      if (absDiff > 0) {
        if (acc.difference < 0) {
          // Cash shortfall / missing cash
          entries.push({
            accountId: acc.id,
            accountName: acc.name,
            type: 'expense',
            category: 'Beban Operasional Lainnya',
            description: `[Auto-Reconciliation] Entri Penyesuaian Defisit Kas Akhir Bulan - ${acc.name}`,
            amount: absDiff,
            debitCreditNote: `Debet: Beban Penyesuaian (${formatterIDR.format(absDiff)}) | Kredit: ${acc.name} (${formatterIDR.format(absDiff)})`,
            difference: acc.difference,
            actualBalance: acc.actualCashBalance,
            recordedBalance: acc.recordedBalance,
          });
        } else {
          // Cash surplus
          entries.push({
            accountId: acc.id,
            accountName: acc.name,
            type: 'income',
            category: 'Pendapatan Lain-lain',
            description: `[Auto-Reconciliation] Entri Penyesuaian Surplus Kas Akhir Bulan - ${acc.name}`,
            amount: absDiff,
            debitCreditNote: `Debet: ${acc.name} (${formatterIDR.format(absDiff)}) | Kredit: Pendapatan Penyesuaian (${formatterIDR.format(absDiff)})`,
            difference: acc.difference,
            actualBalance: acc.actualCashBalance,
            recordedBalance: acc.recordedBalance,
          });
        }
      }
    });

    return entries;
  }, [accountAudit, accounts]);

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

  // State hasil pemindaian COA & anomali buku besar (tersinkron dengan state App.tsx + manual Pindai Ulang)
  const [localScanResult, setLocalScanResult] = useState<CoaScanResult>(() =>
    coaScanResult || scanCoaDuplicatesAndUnused(getStoredCoaList(), accounts, transactions)
  );
  const scanResult = coaScanResult || localScanResult;
  const [lastScannedAt, setLastScannedAt] = useState<string>(() => scanResult.scannedAt || '');
  const [isRescanning, setIsRescanning] = useState<boolean>(false);

  useEffect(() => {
    if (coaScanResult) {
      setLocalScanResult(coaScanResult);
      if (coaScanResult.scannedAt) {
        setLastScannedAt(coaScanResult.scannedAt);
      }
      return;
    }
    if (!isOpen) return;
    const effectiveCoas = activeCoaList.length > 0 ? activeCoaList : getStoredCoaList();
    const nextScan = scanCoaDuplicatesAndUnused(effectiveCoas, accounts, transactions);
    setLocalScanResult(nextScan);
    setLastScannedAt(nextScan.scannedAt);
  }, [isOpen, coaScanResult, activeCoaList, accounts, transactions]);

  const handleManualRescan = () => {
    setIsRescanning(true);
    const freshCoas = getStoredCoaList();
    setActiveCoaList(freshCoas);
    const externalScan = onRescanCoa ? onRescanCoa() : undefined;
    const nextScan = externalScan || scanCoaDuplicatesAndUnused(freshCoas, accounts, transactions);
    setLocalScanResult(nextScan);
    setLastScannedAt(nextScan.scannedAt);
    setShowCleanupConfirm(false);
    setTimeout(() => setIsRescanning(false), 350);
  };

  const fallbackValidAccountId =
    accounts.find((a) => a.type === 'bank' || a.type === 'cash' || a.type === 'e-wallet')?.id ||
    accounts[0]?.id ||
    '';

  useEffect(() => {
    const activeKeys = new Set(scanResult.ledgerAnomalies.map((row) => row.rowKey));
    setSelectedAnomalyKeys((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set<string>();
      prev.forEach((k) => {
        if (activeKeys.has(k)) next.add(k);
      });
      return next.size === prev.size ? prev : next;
    });
    setShowCleanupConfirm(false);
  }, [scanResult.ledgerAnomalies]);

  const filteredAnomalyRows = useMemo<ScannedLedgerAnomalyRow[]>(() => {
    if (anomalyFilterKind === 'all') return scanResult.ledgerAnomalies;
    return scanResult.ledgerAnomalies.filter((r) => r.kind === anomalyFilterKind);
  }, [scanResult.ledgerAnomalies, anomalyFilterKind]);

  const selectedAnomalyRows = useMemo<ScannedLedgerAnomalyRow[]>(() => {
    return scanResult.ledgerAnomalies.filter((r) => selectedAnomalyKeys.has(r.rowKey));
  }, [scanResult.ledgerAnomalies, selectedAnomalyKeys]);

  const cleanupPreview = useMemo(() => {
    const duplicateIndicesToRemove: number[] = [];
    const orphanReassignments: Array<{ txIndex: number; targetAccountId: string }> = [];
    const orphanIndicesToDelete: number[] = [];

    selectedAnomalyRows.forEach((row) => {
      if (row.kind === 'duplicate_id' || row.kind === 'same_day_identical') {
        duplicateIndicesToRemove.push(row.txIndex);
      } else if (row.kind === 'orphan_transaction') {
        const mode = orphanActionModes[row.txIndex] || (accounts.length > 0 ? 'reassign' : 'delete');
        const targetAccId = orphanTargetAccounts[row.txIndex] || fallbackValidAccountId;
        if (mode === 'reassign' && targetAccId) {
          orphanReassignments.push({ txIndex: row.txIndex, targetAccountId: targetAccId });
        } else {
          orphanIndicesToDelete.push(row.txIndex);
        }
      }
    });

    return previewSafeAnomalyCleanupImpact(transactions, accounts, {
      duplicateIndicesToRemove,
      orphanReassignments,
      orphanIndicesToDelete,
    });
  }, [
    selectedAnomalyRows,
    orphanActionModes,
    orphanTargetAccounts,
    fallbackValidAccountId,
    transactions,
    accounts,
  ]);

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
    link.setAttribute('download', `Log_Perubahan_MasterData_${toLocalYYYYMMDD()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!isOpen) return null;

  const handleHarmonizeClick = () => {
    const missingNames = categoryAudit.unmappedCategories.map((c) => c.name);
    onHarmonize(accounts, missingNames);
  };

  const toggleAnomalyRow = (rowKey: string) => {
    setSelectedAnomalyKeys((prev) => {
      const next = new Set(prev);
      if (next.has(rowKey)) next.delete(rowKey);
      else next.add(rowKey);
      return next;
    });
    setShowCleanupConfirm(false);
  };

  const toggleSelectAllFilteredAnomalies = () => {
    const visibleKeys = filteredAnomalyRows.map((r) => r.rowKey);
    const allVisibleSelected =
      visibleKeys.length > 0 && visibleKeys.every((k) => selectedAnomalyKeys.has(k));

    setSelectedAnomalyKeys((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        visibleKeys.forEach((k) => next.delete(k));
      } else {
        visibleKeys.forEach((k) => next.add(k));
      }
      return next;
    });
    setShowCleanupConfirm(false);
  };

  const handleExecuteSelectedAnomalyCleanup = () => {
    if (!onUpdateTransactions || cleanupPreview.totalAffectedRows === 0) return;

    onUpdateTransactions(cleanupPreview.updatedTransactions);
    if (onUpdateAccounts) {
      onUpdateAccounts(cleanupPreview.updatedAccounts);
    }

    const summaryParts: string[] = [];
    if (cleanupPreview.removedDuplicateCount > 0) {
      summaryParts.push(`${cleanupPreview.removedDuplicateCount} duplikat dihapus`);
    }
    if (cleanupPreview.reassignedOrphanCount > 0) {
      summaryParts.push(`${cleanupPreview.reassignedOrphanCount} transaksi yatim dialihkan`);
    }
    if (cleanupPreview.deletedOrphanCount > 0) {
      summaryParts.push(`${cleanupPreview.deletedOrphanCount} transaksi yatim dihapus`);
    }

    const impactDetail =
      cleanupPreview.accountImpacts.length > 0
        ? ` | Dampak saldo: ${cleanupPreview.accountImpacts
            .map(
              (imp) =>
                `${imp.accountName} (${imp.netBalanceDelta >= 0 ? '+' : ''}${formatterIDR.format(
                  imp.netBalanceDelta
                )})`
            )
            .join(', ')}`
        : '';

    addMasterChangeLog(
      'Account',
      'Pembersihan Anomali & Duplikat Selektif',
      'RECONCILE',
      `${summaryParts.join(', ')}${impactDetail}`,
      'Audit Integritas'
    );
    setChangeLogs(getMasterChangeLogs());

    const msg = `Pembersihan aman selesai: ${summaryParts.join(', ')} dengan sinkronisasi saldo ${cleanupPreview.accountImpacts.length} rekening.`;
    setSelectedAnomalyKeys(new Set());
    setShowCleanupConfirm(false);
    setReconciliationSuccessMessage(msg);
    setManualSyncMessage(msg);
    setTimeout(() => {
      setReconciliationSuccessMessage(null);
      setManualSyncMessage(null);
    }, 6000);
  };

  const renderUnifiedAnomalyDetailPanel = (titleLabel: string) => {
    const visibleKeys = filteredAnomalyRows.map((r) => r.rowKey);
    const allVisibleSelected =
      visibleKeys.length > 0 && visibleKeys.every((k) => selectedAnomalyKeys.has(k));

    return (
      <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="space-y-0.5 min-w-0">
            <h4 className="text-xs font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              {scanResult.totalLedgerAnomalies === 0 ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
              )}
              <span>{titleLabel}</span>
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              {transactions.length} entri dipindai · {scanResult.ledgerDuplicateIdGroups.length} grup ID duplikat ·{' '}
              {scanResult.ledgerSameDayDuplicateGroups.length} grup identik hari sama · {scanResult.totalLedgerOrphans}{' '}
              transaksi yatim{lastScannedAt ? ` · Dipindai ${lastScannedAt}` : ''}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleManualRescan}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-200 transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRescanning ? 'animate-spin' : ''}`} />
              <span>Pindai Ulang</span>
            </button>
            {scanResult.ledgerAnomalies.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={toggleSelectAllFilteredAnomalies}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-200 transition cursor-pointer whitespace-nowrap shrink-0"
                >
                  {allVisibleSelected ? 'Batal Pilih Tampak' : `Pilih Semua (${filteredAnomalyRows.length})`}
                </button>
                {selectedAnomalyKeys.size > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedAnomalyKeys(new Set());
                      setShowCleanupConfirm(false);
                    }}
                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 transition cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Kosongkan ({selectedAnomalyKeys.size})
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Segmented Filter Controls */}
        {scanResult.ledgerAnomalies.length > 0 && (
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-lg overflow-x-auto">
            {[
              { id: 'all' as const, label: `Semua (${scanResult.totalLedgerAnomalies})` },
              {
                id: 'duplicate_id' as const,
                label: `ID Duplikat (${scanResult.ledgerAnomalies.filter((r) => r.kind === 'duplicate_id').length})`,
              },
              {
                id: 'same_day_identical' as const,
                label: `Identik Harian (${
                  scanResult.ledgerAnomalies.filter((r) => r.kind === 'same_day_identical').length
                })`,
              },
              {
                id: 'orphan_transaction' as const,
                label: `Transaksi Yatim (${scanResult.totalLedgerOrphans})`,
              },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setAnomalyFilterKind(tab.id)}
                className={`px-3 py-1.5 rounded-md text-[11px] font-bold transition cursor-pointer whitespace-nowrap shrink-0 ${
                  anomalyFilterKind === tab.id
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* Populated vs Empty State */}
        {scanResult.ledgerAnomalies.length === 0 ? (
          <div className="py-5 px-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>
              Tidak ditemukan entri ID duplikat, duplikasi identik harian, maupun transaksi tanpa referensi akun valid.
            </span>
          </div>
        ) : filteredAnomalyRows.length === 0 ? (
          <div className="py-5 px-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-xs text-slate-500 dark:text-slate-400 text-center">
            Tidak ada baris anomali pada kategori filter ini.
          </div>
        ) : (
          <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="py-2.5 px-3 w-9 text-center">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleSelectAllFilteredAnomalies}
                      aria-label="Pilih semua baris anomali tampak"
                      className="h-3.5 w-3.5 rounded border-slate-300 dark:border-slate-600 accent-blue-600 cursor-pointer"
                    />
                  </th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Tanggal</th>
                  <th className="py-2.5 px-3">Transaksi &amp; Jenis Temuan</th>
                  <th className="py-2.5 px-3">Rekening / Tindakan</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">Nominal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredAnomalyRows.map((row) => {
                  const tx = row.transaction;
                  const isChecked = selectedAnomalyKeys.has(row.rowKey);
                  const accObj = accounts.find((a) => a.id === tx.accountId);
                  const orphanMode = orphanActionModes[row.txIndex] || (accounts.length > 0 ? 'reassign' : 'delete');
                  const targetAccId = orphanTargetAccounts[row.txIndex] || fallbackValidAccountId;
                  const kindLabel =
                    row.kind === 'duplicate_id'
                      ? 'ID Duplikat'
                      : row.kind === 'same_day_identical'
                      ? 'Identik Harian'
                      : 'Transaksi Yatim';
                  const kindTextClass =
                    row.kind === 'orphan_transaction'
                      ? 'text-rose-600 dark:text-rose-400'
                      : row.kind === 'duplicate_id'
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-amber-700 dark:text-amber-400';

                  return (
                    <tr
                      key={row.rowKey}
                      className={`transition-colors ${
                        isChecked
                          ? 'bg-blue-50/70 dark:bg-blue-950/30'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="py-2.5 px-3 text-center align-top">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleAnomalyRow(row.rowKey)}
                          aria-label={`Pilih baris ${tx.description || tx.category}`}
                          className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 dark:border-slate-600 accent-blue-600 cursor-pointer"
                        />
                      </td>
                      <td className="py-2.5 px-3 font-mono tabular-nums text-[11px] text-slate-600 dark:text-slate-300 whitespace-nowrap align-top">
                        <div>{row.normalizedDate || tx.date || '-'}</div>
                        {tx.date && row.normalizedDate && tx.date.trim() !== row.normalizedDate && (
                          <div className="text-[10px] text-slate-400 dark:text-slate-500">
                            Asli: {tx.date}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 align-top min-w-[200px]">
                        <div className="font-bold text-slate-800 dark:text-slate-100">
                          {tx.description || tx.category || 'Tanpa Keterangan'}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap items-center gap-x-1.5">
                          <span className={`font-bold ${kindTextClass}`}>{kindLabel}</span>
                          <span aria-hidden="true">·</span>
                          <span>{tx.category}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono text-[10px]">ID: {tx.id || '-'}</span>
                          <span aria-hidden="true">·</span>
                          <span>{row.issueSummary}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 align-top min-w-[210px]">
                        {row.kind === 'orphan_transaction' ? (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <select
                              value={orphanMode}
                              onChange={(e) => {
                                const nextMode = e.target.value as 'reassign' | 'delete';
                                setOrphanActionModes((prev) => ({ ...prev, [row.txIndex]: nextMode }));
                                setShowCleanupConfirm(false);
                              }}
                              className="px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-[11px] font-semibold text-slate-800 dark:text-slate-100"
                            >
                              {accounts.length > 0 && <option value="reassign">Alihkan</option>}
                              <option value="delete">Hapus Baris</option>
                            </select>
                            {orphanMode === 'reassign' && accounts.length > 0 && (
                              <select
                                value={targetAccId}
                                onChange={(e) => {
                                  setOrphanTargetAccounts((prev) => ({
                                    ...prev,
                                    [row.txIndex]: e.target.value,
                                  }));
                                  setShowCleanupConfirm(false);
                                }}
                                className="px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-[11px] font-semibold text-slate-800 dark:text-slate-100 max-w-[145px]"
                              >
                                {accounts.map((acc) => (
                                  <option key={acc.id} value={acc.id}>
                                    {acc.name}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        ) : (
                          <div className="text-[11px] text-slate-600 dark:text-slate-300">
                            <div className="font-semibold text-slate-800 dark:text-slate-100">
                              {accObj ? accObj.name : tx.accountId || '(Tanpa Rekening)'}
                            </div>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400">
                              Salinan dihapus aman · Baris asli tetap tersimpan
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-mono tabular-nums text-right font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap align-top">
                        <span className={tx.type === 'income' ? 'text-emerald-700 dark:text-emerald-400' : ''}>
                          {tx.type === 'income' ? '+' : '-'}
                          {formatterIDR.format(Math.abs(tx.amount || 0))}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Live Per-Account Balance Impact Preview & Safe Confirmation */}
        {selectedAnomalyRows.length > 0 && onUpdateTransactions && (
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-700 pb-2.5">
              <div>
                <h5 className="text-xs font-extrabold text-slate-800 dark:text-slate-100">
                  Pratinjau Dampak Saldo per Rekening ({selectedAnomalyRows.length} Baris Dipilih)
                </h5>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {cleanupPreview.removedDuplicateCount} duplikat dihapus · {cleanupPreview.reassignedOrphanCount}{' '}
                  yatim dialihkan · {cleanupPreview.deletedOrphanCount} yatim dihapus
                </p>
              </div>
              {!showCleanupConfirm ? (
                <button
                  type="button"
                  onClick={() => setShowCleanupConfirm(true)}
                  className="px-4 py-2 bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition cursor-pointer whitespace-nowrap shrink-0"
                >
                  Bersihkan Aman ({selectedAnomalyRows.length} Baris)
                </button>
              ) : (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowCleanupConfirm(false)}
                    className="px-3 py-1.5 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-lg transition cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={handleExecuteSelectedAnomalyCleanup}
                    className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold rounded-lg transition cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Konfirmasi &amp; Sinkron Saldo
                  </button>
                </div>
              )}
            </div>

            {cleanupPreview.accountImpacts.length > 0 ? (() => {
              const totalCurrent = cleanupPreview.accountImpacts.reduce((s, imp) => s + imp.currentBalance, 0);
              const totalNetDelta = cleanupPreview.accountImpacts.reduce((s, imp) => s + imp.netBalanceDelta, 0);
              const totalProjected = cleanupPreview.accountImpacts.reduce((s, imp) => s + imp.projectedBalance, 0);
              return (
                <div className="space-y-2.5">
                  <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100/80 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-[10px] font-bold text-slate-500 uppercase">
                        <tr>
                          <th className="py-2 px-3">Rekening Terdampak</th>
                          <th className="py-2 px-3 text-right">Saldo Saat Ini</th>
                          <th className="py-2 px-3 text-right">Koreksi Bersih</th>
                          <th className="py-2 px-3 text-right">Proyeksi Saldo Akhir</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {cleanupPreview.accountImpacts.map((imp) => (
                          <tr key={imp.accountId}>
                            <td className="py-2 px-3">
                              <div className="font-bold text-slate-800 dark:text-slate-100">{imp.accountName}</div>
                              <div className="text-[10px] text-slate-500 dark:text-slate-400">
                                {imp.affectedRowCount} baris dipilih
                                {imp.glAlreadyExcludedCount > 0 &&
                                  ` · ${imp.glAlreadyExcludedCount} duplikat sudah tidak terhitung di saldo`}
                              </div>
                            </td>
                            <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300 whitespace-nowrap">
                              {formatterIDR.format(imp.currentBalance)}
                            </td>
                            <td
                              className={`py-2 px-3 text-right font-mono tabular-nums font-bold whitespace-nowrap ${
                                imp.netBalanceDelta > 0
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : imp.netBalanceDelta < 0
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : 'text-slate-500 dark:text-slate-400'
                              }`}
                            >
                              {imp.netBalanceDelta > 0 ? '+' : ''}
                              {formatterIDR.format(imp.netBalanceDelta)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono tabular-nums font-extrabold text-slate-900 dark:text-white whitespace-nowrap">
                              {formatterIDR.format(imp.projectedBalance)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-700 text-xs font-extrabold">
                        <tr>
                          <td className="py-2 px-3 text-slate-800 dark:text-slate-100">
                            Total Dampak ({cleanupPreview.accountImpacts.length} Rekening)
                          </td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-200 whitespace-nowrap">
                            {formatterIDR.format(totalCurrent)}
                          </td>
                          <td
                            className={`py-2 px-3 text-right font-mono tabular-nums whitespace-nowrap ${
                              totalNetDelta > 0
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : totalNetDelta < 0
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            {totalNetDelta > 0 ? '+' : ''}
                            {formatterIDR.format(totalNetDelta)}
                          </td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-900 dark:text-white whitespace-nowrap">
                            {formatterIDR.format(totalProjected)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {showCleanupConfirm && (
                    <div className="p-2.5 rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50/70 dark:bg-rose-950/30 text-[11px] text-rose-800 dark:text-rose-200 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
                      <span>
                        Konfirmasi eksekusi: <strong>{cleanupPreview.totalAffectedRows} baris anomali</strong> akan dibersihkan dengan total koreksi bersih{' '}
                        <strong className="font-mono tabular-nums">
                          {totalNetDelta > 0 ? '+' : ''}
                          {formatterIDR.format(totalNetDelta)}
                        </strong>{' '}
                        pada {cleanupPreview.accountImpacts.length} rekening.
                      </span>
                    </div>
                  )}
                </div>
              );
            })() : (
              <p className="text-[11px] text-slate-600 dark:text-slate-300">
                Baris terpilih tidak memengaruhi saldo rekening aktif saat ini (entri yatim tanpa rekening valid atau sudah tersinkron di GL).
              </p>
            )}
          </div>
        )}
      </div>
    );
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
    if (!reconciliationConfirmed) {
      showToast({
        type: 'warning',
        title: 'Konfirmasi Bukti Rekonsiliasi',
        message: 'Tinjau saldo terhadap bukti rekening dan konfirmasi hasilnya sebelum membuat jurnal penyesuaian.',
      });
      return;
    }

    const todayStr = toLocalYYYYMMDD();
    const evidenceReference =
      reconciliationEvidenceNote.trim() || `Saldo fisik ditinjau dan dikonfirmasi pengguna pada ${todayStr}`;
    const newTxEntries: Omit<Transaction, 'id'>[] = proposedAdjustmentEntries.map((e) => {
      const account = accounts.find((item) => item.id === e.accountId);
      const accountCode = account ? getAccountCoaMapping(account, activeCoaList).code : '1200';
      return {
        date: todayStr,
        accountId: e.accountId,
        type: e.type,
        category: e.category,
        description: e.description,
        amount: e.amount,
        isAdjustment: true,
        adjustmentType: 'reconciliation',
        reconciliationEvidenceReference: evidenceReference,
        reconciliationEvidenceConfirmedAt: new Date().toISOString(),
        reconciliationActualBalance: e.actualBalance,
        reconciliationRecordedBalance: e.recordedBalance,
        coaDebitCode: e.type === 'income' ? accountCode : '5900',
        coaCreditCode: e.type === 'income' ? '4400' : accountCode,
      };
    });

    onApplyAdjustmentEntries(newTxEntries);
    setReconciliationConfirmed(false);
    setReconciliationEvidenceNote('');

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
                  {isIntegrityValid
                    ? 'COA & Buku Besar Valid 100%'
                    : categoryAudit.unmappedCategories.length > 0 && !ledgerAudit.isLedgerClean
                    ? 'Anomali COA & Buku Besar'
                    : categoryAudit.unmappedCategories.length > 0
                    ? 'Anomali COA Terdeteksi'
                    : 'Anomali Buku Besar'}
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
                    <strong>Seluruh Struktur Jurnal &amp; Referensi Valid!</strong> Semua {categoryAudit.totalCategoriesInTx} kategori transaksi terdaftar dalam Master COA serta tidak ada entri duplikat maupun transaksi yatim.
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-2xl flex items-center gap-3 text-amber-900 dark:text-amber-200 text-xs font-medium">
                  <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
                  <div>
                    <strong>Anomali Integritas Terdeteksi!</strong>{' '}
                    {categoryAudit.unmappedCategories.length > 0 && (
                      <span>
                        Terdapat <strong>{categoryAudit.unmappedCategories.length} kategori transaksi</strong> yang belum terdaftar di pohon Master COA.{' '}
                      </span>
                    )}
                    {ledgerAudit.totalIssues > 0 && (
                      <span>
                        Ditemukan <strong>{ledgerAudit.totalIssues} anomali buku besar</strong> ({ledgerAudit.totalDuplicateIdRows} ID duplikat, {ledgerAudit.totalSameDayDuplicateRows} identik hari sama, {ledgerAudit.totalOrphans} transaksi yatim).
                      </span>
                    )}
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

              {/* Unified Ledger Reference & Duplicate Audit Panel (Per-Row Selection & Balance Preview) */}
              {renderUnifiedAnomalyDetailPanel('Validasi Referensi Akun & Duplikasi Buku Besar')}

              {/* Account Balances Ledger Table */}
              <div className="space-y-3">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <ListChecks className="h-4 w-4 text-blue-500" />
                    <span>Audit Saldo Buku Besar (GL) & Log Transaksi ({accountAudit.length} Akun Kas)</span>
                  </span>
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Auto-reconcile kas hanya berlaku untuk kas, bank, dan e-wallet. Saldo kartu kredit/paylater dicatat terpisah sebagai kewajiban.
                </p>

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
                        <th className="py-2.5 px-3 font-mono text-right">Saldo Aktual Kas/Bank/E-Wallet (Rp)</th>
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

              {proposedAdjustmentEntries.length > 0 && (
                <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-800 dark:bg-amber-950/20">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    Catatan bukti pemeriksaan (opsional)
                  </label>
                  <input
                    type="text"
                    value={reconciliationEvidenceNote}
                    onChange={(e) => setReconciliationEvidenceNote(e.target.value)}
                    placeholder="Contoh: mutasi bank tanggal 30/11 telah diperiksa"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                  <label className="flex items-start gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={reconciliationConfirmed}
                      onChange={(e) => setReconciliationConfirmed(e.target.checked)}
                      className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>Saya telah memeriksa saldo terhadap bukti rekening dan mengonfirmasi selisih ini.</span>
                  </label>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">
                    Konfirmasi hanya membuat jurnal penyesuaian; saldo rekening tidak diubah otomatis.
                  </p>
                </div>
              )}

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
                      disabled={!reconciliationConfirmed}
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

                        <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-xl text-[10px] font-mono text-slate-600 dark:text-slate-400 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                          <span>{e.debitCreditNote}</span>
                          <span className="font-bold text-slate-800 dark:text-slate-200 tabular-nums">
                            Saldo aplikasi tidak diubah; bukti saldo akhir: {formatterIDR.format(e.actualBalance)}
                          </span>
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
                        {lastScannedAt ? ` · Dipindai ${lastScannedAt}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleManualRescan}
                      className="px-3.5 py-2 bg-slate-800/80 hover:bg-slate-700/90 border border-purple-500/40 text-purple-100 text-xs font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${isRescanning ? 'animate-spin' : ''}`} />
                      <span>Pindai Ulang</span>
                    </button>
                    {(scanResult.totalDuplicates > 0 || scanResult.totalUnused > 0) && (
                      <button
                        type="button"
                        onClick={handleAutoMergeAndCleanup}
                        className="px-4 py-2 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white text-xs font-black rounded-xl shadow-md transition cursor-pointer flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
                      >
                        <RefreshCw className="h-4 w-4 animate-spin-slow" />
                        <span>Gabung Duplikat & Bersihkan COA Otomatis</span>
                      </button>
                    )}
                  </div>
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
                      <span className="font-bold text-slate-300">Anomali Buku Besar:</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                        scanResult.totalLedgerAnomalies > 0 ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-emerald-500/20 text-emerald-300'
                      }`}>
                        {scanResult.totalLedgerAnomalies} Baris
                      </span>
                    </div>
                    {scanResult.totalLedgerAnomalies > 0 ? (
                      <div className="space-y-2">
                        <p className="text-[11px] text-rose-200">
                          {scanResult.totalLedgerDuplicates} duplikat · {scanResult.totalLedgerOrphans} transaksi yatim siap diseleksi di bawah.
                        </p>
                        {scanResult.totalLedgerDuplicates > 0 && onUpdateTransactions && (
                          <button
                            type="button"
                            onClick={() => {
                              const dupKeys = scanResult.ledgerAnomalies
                                .filter((r) => r.kind === 'duplicate_id' || r.kind === 'same_day_identical')
                                .map((r) => r.rowKey);
                              setSelectedAnomalyKeys(new Set(dupKeys));
                              setShowCleanupConfirm(true);
                            }}
                            className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-[10px] font-bold transition cursor-pointer whitespace-nowrap"
                          >
                            Pilih &amp; Pratinjau Duplikat
                          </button>
                        )}
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-400">Tidak ada ID ganda, identik harian, maupun yatim.</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Detail Panel Seleksi Per Baris Hasil Pemindaian scanCoaDuplicatesAndUnused */}
              {renderUnifiedAnomalyDetailPanel('Detail Anomali & Duplikat Hasil Pemindaian COA & Buku Besar')}

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

            {activeTab === 'audit' && categoryAudit.unmappedCategories.length > 0 && (
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
                disabled={!reconciliationConfirmed}
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
