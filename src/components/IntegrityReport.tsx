import React, { useState, useMemo, useCallback } from 'react';
import { Account, Transaction, InvestmentAsset, Debt, CategoryBudget } from '../types';
import { CategoryNode, flattenCategoryHierarchy } from '../categoryHierarchy';
import { getStoredCoaList, getAccountCoaMapping, AccountCOA, CoaScanResult } from '../coaUtils';
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Info,
  CheckCircle2,
  RefreshCw,
  Search,
  Filter,
  Wand2,
  Download,
  ExternalLink,
  Layers,
  ListChecks,
  Scale,
  TrendingUp,
  CreditCard,
  Building2,
  Trash2,
  Check,
  Zap,
  Activity,
  ChevronRight,
  Shield,
  FileCheck2,
} from 'lucide-react';

import {
  auditLedgerIntegrity,
  calculateAccountGLBalance,
  reassignOrphanTransactionWithBalanceSync,
  removeDuplicateTransactionsWithBalanceSync,
  setAccountTargetBalance,
  toLocalYYYYMMDD,
} from '../utils/accountingEngine';
import { formatterIDR } from '../utils/formatters';

export type DiscrepancySeverity = 'critical' | 'warning' | 'info';
export type DiscrepancyCategory = 'accounts' | 'transactions' | 'investments' | 'categories' | 'debts';

export interface DiscrepancyItem {
  id: string;
  category: DiscrepancyCategory;
  severity: DiscrepancySeverity;
  title: string;
  description: string;
  affectedRecordName: string;
  affectedRecordId?: string;
  recordType?: string;
  expectedValue?: string | number;
  actualValue?: string | number;
  variance?: number;
  autoFixable?: boolean;
  fixType?:
    | 'reconcile-account'
    | 'remove-orphan-tx'
    | 'remove-duplicate-tx'
    | 'add-missing-cat'
    | 'reconcile-investment'
    | 'link-coa';
  payload?: any;
}

interface IntegrityReportProps {
  accounts: Account[];
  transactions: Transaction[];
  investments?: InvestmentAsset[];
  masterCategories?: CategoryNode[];
  debts?: Debt[];
  budgets?: CategoryBudget[];
  onOpenIntegrityModal?: () => void;
  onOpenModalFix?: () => void;
  onHarmonizeCategories?: (missingCategories: string[]) => void;
  onUpdateAccounts?: (updatedAccounts: Account[]) => void;
  onUpdateTransactions?: (updatedTransactions: Transaction[]) => void;
  onUpdateInvestments?: (updatedInvestments: InvestmentAsset[]) => void;
  coaScanResult?: CoaScanResult;
  onRescanCoa?: () => CoaScanResult | void;
  className?: string;
}

export const IntegrityReport: React.FC<IntegrityReportProps> = ({
  accounts = [],
  transactions = [],
  investments = [],
  masterCategories = [],
  debts = [],
  budgets = [],
  onOpenIntegrityModal,
  onOpenModalFix,
  onHarmonizeCategories,
  onUpdateAccounts,
  onUpdateTransactions,
  onUpdateInvestments,
  coaScanResult,
  onRescanCoa,
  className = '',
}) => {
  const [activeTab, setActiveTab] = useState<DiscrepancyCategory | 'all'>('all');
  const [severityFilter, setSeverityFilter] = useState<DiscrepancySeverity | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [orphanReassignTargets, setOrphanReassignTargets] = useState<Record<number, string>>({});

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4500);
  }, []);

  // Set of lowercase master category names for quick lookup
  const allMasterCategoryNames = useMemo(() => {
    const names = new Set<string>();
    const traverse = (nodes: CategoryNode[]) => {
      nodes.forEach((node) => {
        if (node?.name) {
          names.add(node.name.toLowerCase().trim());
        }
        if (node?.children) traverse(node.children);
      });
    };
    if (Array.isArray(masterCategories)) {
      traverse(masterCategories);
    }
    return names;
  }, [masterCategories]);

  // Comprehensive Discrepancy Scanning Engine
  const discrepancies = useMemo<DiscrepancyItem[]>(() => {
    const list: DiscrepancyItem[] = [];
    const safeAccounts = Array.isArray(accounts) ? accounts : [];
    const safeTransactions = Array.isArray(transactions) ? transactions : [];
    const safeInvestments = Array.isArray(investments) ? investments : [];
    const safeDebts = Array.isArray(debts) ? debts : [];
    const safeBudgets = Array.isArray(budgets) ? budgets : [];
    const currentCoasList = getStoredCoaList();

    const accountMap = new Map<string, Account>();
    safeAccounts.forEach((acc) => {
      if (acc?.id) accountMap.set(acc.id, acc);
    });

    // 1. ACCOUNT BALANCES & COA CHECKS (Menggunakan mesin GL terpusat termasuk initialDebt)
    safeAccounts.forEach((acc) => {
      if (!acc) return;
      const gl = calculateAccountGLBalance(acc, safeTransactions);
      const glBalance = gl.glCalculatedBalance;
      const recordedBal = gl.recordedBalance;
      const variance = gl.difference;

      if (Math.abs(variance) > 0) {
        list.push({
          id: `disc-acc-bal-${acc.id}`,
          category: 'accounts',
          severity: Math.abs(variance) >= 100000 ? 'critical' : 'warning',
          title: `Selisih Saldo Akun "${acc.name}"`,
          description: `Saldo GL terhitung Rp ${glBalance.toLocaleString('id-ID')} berbeda dengan saldo kas tercatat Rp ${recordedBal.toLocaleString('id-ID')} (Selisih: ${variance > 0 ? '+' : ''}Rp ${variance.toLocaleString('id-ID')}).`,
          affectedRecordName: acc.name,
          affectedRecordId: acc.id,
          recordType: acc.type,
          expectedValue: formatterIDR.format(glBalance),
          actualValue: formatterIDR.format(recordedBal),
          variance,
          autoFixable: true,
          fixType: 'reconcile-account',
          payload: { accountId: acc.id, targetBalance: glBalance },
        });
      }

      // Check COA Mapping
      const mapping = getAccountCoaMapping(acc, currentCoasList);
      if (mapping.isOrphaned || !acc.coaCode) {
        list.push({
          id: `disc-acc-coa-${acc.id}`,
          category: 'accounts',
          severity: 'warning',
          title: `Akun "${acc.name}" Belum Terhubung ke Master COA`,
          description: `Akun belum memiliki kode Chart of Accounts (COA) terdaftar atau terhubung ke node yatim.`,
          affectedRecordName: acc.name,
          affectedRecordId: acc.id,
          recordType: acc.type,
          autoFixable: true,
          fixType: 'link-coa',
          payload: { accountId: acc.id, accountName: acc.name, accountType: acc.type },
        });
      }

      // Check Negative Cash Balances
      if ((acc.type === 'cash' || acc.type === 'bank' || acc.type === 'e-wallet') && recordedBal < 0) {
        list.push({
          id: `disc-acc-neg-${acc.id}`,
          category: 'accounts',
          severity: 'warning',
          title: `Saldo Kas Negatif pada "${acc.name}"`,
          description: `Rekening kas/bank memiliki saldo minus ${formatterIDR.format(recordedBal)}.`,
          affectedRecordName: acc.name,
          affectedRecordId: acc.id,
          recordType: acc.type,
          actualValue: formatterIDR.format(recordedBal),
        });
      }
    });

    // 2. TRANSACTION DATASET CHECKS (Orphan Account References & Duplicate Ledger Entries via accountingEngine)
    const ledgerAudit = auditLedgerIntegrity(safeTransactions, safeAccounts);
    ledgerAudit.orphanTransactions.forEach((orphan) => {
      const tx = orphan.transaction;
      list.push({
        id: `disc-tx-orphan-${orphan.index}-${tx.id || 'noid'}`,
        category: 'transactions',
        severity: 'critical',
        title:
          orphan.reason === 'missing_account_id'
            ? 'Transaksi Tanpa Referensi Akun'
            : 'Transaksi Yatim - Akun Tidak Ditemukan',
        description:
          orphan.reason === 'missing_account_id'
            ? `Transaksi "${tx.description || tx.category || 'Tanpa Keterangan'}" (${tx.date}, ${formatterIDR.format(tx.amount)}) tidak memiliki ID rekening yang valid.`
            : `Transaksi "${tx.description || tx.category || 'Tanpa Keterangan'}" (${tx.date}, ${formatterIDR.format(tx.amount)}) mereferensikan Account ID "${tx.accountId}" yang tidak ada di sistem.`,
        affectedRecordName: tx.description || tx.category || tx.id || 'Transaksi Yatim',
        affectedRecordId: tx.id,
        expectedValue: 'Account ID Valid',
        actualValue: tx.accountId || '(Kosong)',
        autoFixable: true,
        fixType: 'remove-orphan-tx',
        payload: { transactionId: tx.id, txIndex: orphan.index, reason: orphan.reason },
      });
    });

    ledgerAudit.duplicateIdGroups.forEach((grp) => {
      const sample = grp.items[0]?.transaction;
      list.push({
        id: `disc-tx-dup-id-${grp.groupKey}`,
        category: 'transactions',
        severity: 'critical',
        title: `ID Transaksi Duplikat di Buku Besar (${grp.items.length}x)`,
        description: `${grp.fingerprintLabel} · Nominal ${formatterIDR.format(sample?.amount || 0)} muncul ${grp.items.length} kali dengan ID yang sama.`,
        affectedRecordName: sample?.description || sample?.category || sample?.id || 'ID Duplikat',
        affectedRecordId: sample?.id,
        expectedValue: '1 Entri Unik',
        actualValue: `${grp.items.length} Entri Identik`,
        autoFixable: true,
        fixType: 'remove-duplicate-tx',
        payload: { duplicateIndices: grp.duplicateIndices, kind: grp.kind },
      });
    });

    ledgerAudit.sameDayDuplicateGroups.forEach((grp) => {
      const sample = grp.items[0]?.transaction;
      list.push({
        id: `disc-tx-dup-sameday-${grp.groupKey}`,
        category: 'transactions',
        severity: 'warning',
        title: `Potensi Entri Identik di Hari Sama (${grp.items.length}x)`,
        description: `${grp.fingerprintLabel} · Nominal ${formatterIDR.format(sample?.amount || 0)} tercatat ${grp.items.length} kali pada tanggal yang sama.`,
        affectedRecordName: sample?.description || sample?.category || sample?.id || 'Entri Ganda',
        affectedRecordId: sample?.id,
        expectedValue: '1 Entri per Kejadian',
        actualValue: `${grp.items.length} Entri Identik`,
        autoFixable: true,
        fixType: 'remove-duplicate-tx',
        payload: { duplicateIndices: grp.duplicateIndices, kind: grp.kind },
      });
    });

    const missingCategoriesSeen = new Set<string>();
    safeTransactions.forEach((tx) => {
      if (!tx) return;

      // Check Unmapped Category
      const catName = (tx.category || '').trim();
      if (catName && allMasterCategoryNames.size > 0 && !allMasterCategoryNames.has(catName.toLowerCase())) {
        if (!missingCategoriesSeen.has(catName.toLowerCase())) {
          missingCategoriesSeen.add(catName.toLowerCase());
          list.push({
            id: `disc-tx-cat-${catName}`,
            category: 'categories',
            severity: 'warning',
            title: `Kategori "${catName}" Belum Terdaftar`,
            description: `Kategori "${catName}" digunakan dalam transaksi tetapi belum terdaftar dalam pohon Master COA & Kategori.`,
            affectedRecordName: catName,
            recordType: tx.type,
            autoFixable: true,
            fixType: 'add-missing-cat',
            payload: { categoryName: catName, type: tx.type },
          });
        }
      }

      // Check Broken Investment Links
      if (tx.linkedInvestmentId && safeInvestments.length > 0) {
        const invExists = safeInvestments.some((i) => i.id === tx.linkedInvestmentId);
        if (!invExists) {
          list.push({
            id: `disc-tx-link-inv-${tx.id}`,
            category: 'transactions',
            severity: 'warning',
            title: `Relasi Investasi Putus pada Transaksi`,
            description: `Transaksi "${tx.description || tx.id}" terhubung ke ID Investasi "${tx.linkedInvestmentId}" yang telah dihapus.`,
            affectedRecordName: tx.description || tx.id,
            affectedRecordId: tx.id,
          });
        }
      }

      // Check Broken Debt Links (supports both loan/KPR debts and acc-debt-* credit/paylater accounts)
      if (tx.linkedDebtId) {
        const isAccountDebt = tx.linkedDebtId.startsWith('acc-debt-');
        const targetExists = isAccountDebt
          ? safeAccounts.some((a) => a.id === tx.linkedDebtId!.replace('acc-debt-', ''))
          : safeDebts.length === 0 || safeDebts.some((d) => d.id === tx.linkedDebtId);
        if (!targetExists) {
          list.push({
            id: `disc-tx-link-debt-${tx.id}`,
            category: 'transactions',
            severity: 'warning',
            title: isAccountDebt
              ? 'Relasi Tagihan Kartu Kredit / PayLater Putus'
              : 'Relasi Utang Putus pada Transaksi',
            description: `Transaksi "${tx.description || tx.id}" terhubung ke ID Utang/Tagihan "${tx.linkedDebtId}" yang telah dihapus.`,
            affectedRecordName: tx.description || tx.id,
            affectedRecordId: tx.id,
          });
        }
      }

      // Invalid Transaction Amounts
      if (typeof tx.amount !== 'number' || isNaN(tx.amount) || tx.amount <= 0) {
        list.push({
          id: `disc-tx-invalid-amt-${tx.id}`,
          category: 'transactions',
          severity: 'info',
          title: `Nominal Transaksi Tidak Valid`,
          description: `Transaksi "${tx.description || tx.id}" (${tx.date}) memiliki nominal nol atau tidak valid.`,
          affectedRecordName: tx.description || tx.id,
          affectedRecordId: tx.id,
          actualValue: String(tx.amount),
        });
      }
    });

    // 3. INVESTMENT DATASET CHECKS
    safeInvestments.forEach((inv) => {
      if (!inv) return;
      const unitPrice = inv.currentUnitPrice || inv.unitPrice || inv.purchaseUnitPrice || 0;
      const quantity = inv.quantity || inv.units || 0;

      if (quantity > 0 && unitPrice > 0) {
        const calculatedValuation = quantity * unitPrice;
        const recordedBal = inv.balance || 0;
        const diff = Math.abs(calculatedValuation - recordedBal);

        if (diff > 1000) {
          list.push({
            id: `disc-inv-val-${inv.id}`,
            category: 'investments',
            severity: 'warning',
            title: `Discrepancy Valuasi Investasi "${inv.name}"`,
            description: `Valuasi terhitung (${quantity} ${inv.unitName || 'unit'} @ Rp ${unitPrice.toLocaleString('id-ID')} = Rp ${calculatedValuation.toLocaleString('id-ID')}) tidak cocok dengan saldo tercatat Rp ${recordedBal.toLocaleString('id-ID')}.`,
            affectedRecordName: inv.name,
            affectedRecordId: inv.id,
            expectedValue: formatterIDR.format(calculatedValuation),
            actualValue: formatterIDR.format(recordedBal),
            variance: recordedBal - calculatedValuation,
            autoFixable: true,
            fixType: 'reconcile-investment',
            payload: { investmentId: inv.id, targetBalance: calculatedValuation },
          });
        }
      } else if (quantity > 0 && unitPrice <= 0) {
        list.push({
          id: `disc-inv-noprice-${inv.id}`,
          category: 'investments',
          severity: 'info',
          title: `Harga Unit Belum Didefinisikan pada "${inv.name}"`,
          description: `Portofolio memiliki ${quantity} ${inv.unitName || 'unit'} tetapi harga per unit (Current Price) belum ditentukan.`,
          affectedRecordName: inv.name,
          affectedRecordId: inv.id,
        });
      }
    });

    // 4. DEBT & BUDGET CHECKS
    safeDebts.forEach((debt) => {
      if (!debt) return;
      if (debt.balance < 0) {
        list.push({
          id: `disc-debt-neg-${debt.id}`,
          category: 'debts',
          severity: 'warning',
          title: `Saldo Utang Negatif pada "${debt.name}"`,
          description: `Saldo kewajiban bernilai negatif (${formatterIDR.format(debt.balance)}).`,
          affectedRecordName: debt.name,
          affectedRecordId: debt.id,
          actualValue: formatterIDR.format(debt.balance),
        });
      }
    });

    safeBudgets.forEach((b) => {
      if (!b) return;
      if (b.category && allMasterCategoryNames.size > 0 && !allMasterCategoryNames.has(b.category.toLowerCase())) {
        list.push({
          id: `disc-budget-cat-${b.category}`,
          category: 'categories',
          severity: 'info',
          title: `Anggaran Menggunakan Kategori Belum Terdaftar`,
          description: `Anggaran diset untuk kategori "${b.category}" yang tidak ada pada Master COA.`,
          affectedRecordName: b.category,
        });
      }
    });

    return list;
  }, [accounts, transactions, investments, debts, budgets, masterCategories, allMasterCategoryNames]);

  // Handle Manual Trigger for Re-scan
  const handleTriggerReScan = () => {
    setIsScanning(true);
    if (onRescanCoa) {
      onRescanCoa();
    }
    setTimeout(() => {
      setIsScanning(false);
      showToast('Pemindaian ulang integritas dataset selesai disinkronkan!');
    }, 450);
  };

  // Filtered Discrepancies
  const filteredDiscrepancies = useMemo(() => {
    return discrepancies.filter((item) => {
      const matchCategory = activeTab === 'all' || item.category === activeTab;
      const matchSeverity = severityFilter === 'all' || item.severity === severityFilter;
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        item.title.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.affectedRecordName.toLowerCase().includes(q);

      return matchCategory && matchSeverity && matchSearch;
    });
  }, [discrepancies, activeTab, severityFilter, searchQuery]);

  // Overall Integrity Metrics
  const metrics = useMemo(() => {
    const totalDiscrepancies = discrepancies.length;
    const criticalCount = discrepancies.filter((d) => d.severity === 'critical').length;
    const warningCount = discrepancies.filter((d) => d.severity === 'warning').length;
    const infoCount = discrepancies.filter((d) => d.severity === 'info').length;
    const fixableCount = discrepancies.filter((d) => d.autoFixable).length;

    const totalRecords = accounts.length + transactions.length + investments.length + debts.length;
    // Score calculation (100 minus weighted penalties)
    const penalty = criticalCount * 15 + warningCount * 5 + infoCount * 1;
    const healthScore = Math.max(0, Math.min(100, 100 - penalty));

    return {
      totalDiscrepancies,
      criticalCount,
      warningCount,
      infoCount,
      fixableCount,
      totalRecords,
      healthScore,
    };
  }, [discrepancies, accounts.length, transactions.length, investments.length, debts.length]);

  // Single Orphan Reassignment Handler
  const handleReassignOrphanTx = (item: DiscrepancyItem) => {
    const txIndex = item.payload?.txIndex;
    if (typeof txIndex !== 'number' || !onUpdateTransactions) return;
    const defaultTarget =
      accounts.find((a) => a.type === 'bank' || a.type === 'cash' || a.type === 'e-wallet')?.id ||
      accounts[0]?.id ||
      '';
    const targetAccId = orphanReassignTargets[txIndex] || defaultTarget;
    if (!targetAccId) return;

    const { updatedTransactions, updatedAccounts, changed } = reassignOrphanTransactionWithBalanceSync(
      transactions,
      accounts,
      txIndex,
      targetAccId
    );
    if (!changed) return;

    onUpdateTransactions(updatedTransactions);
    if (onUpdateAccounts) {
      onUpdateAccounts(updatedAccounts);
    }
    const targetAccName = accounts.find((a) => a.id === targetAccId)?.name || targetAccId;
    showToast(`Transaksi "${item.affectedRecordName}" dialihkan ke rekening "${targetAccName}" dan saldo disinkronkan.`);
  };

  // Single Discrepancy Auto-Fix Handler
  const handleFixSingleDiscrepancy = (item: DiscrepancyItem) => {
    if (!item.autoFixable || !item.fixType) return;

    if (item.fixType === 'reconcile-account' && item.payload?.accountId && onUpdateAccounts) {
      const { accountId, targetBalance } = item.payload;
      const updated = accounts.map((acc) =>
        acc.id === accountId ? setAccountTargetBalance(acc, targetBalance) : acc
      );
      onUpdateAccounts(updated);
      showToast(`Berhasil merekonsiliasi saldo akun "${item.affectedRecordName}" ke ${formatterIDR.format(targetBalance)}!`);
    } else if (item.fixType === 'remove-orphan-tx' && onUpdateTransactions) {
      const { txIndex, transactionId } = item.payload || {};
      if (typeof txIndex === 'number') {
        const res = removeDuplicateTransactionsWithBalanceSync(transactions, accounts, [txIndex]);
        onUpdateTransactions(res.updatedTransactions);
        if (onUpdateAccounts) {
          onUpdateAccounts(res.updatedAccounts);
        }
      } else {
        const updated = transactions.filter((t) => t.id !== transactionId);
        onUpdateTransactions(updated);
      }
      showToast(`Berhasil menghapus transaksi yatim "${item.affectedRecordName}"!`);
    } else if (
      item.fixType === 'remove-duplicate-tx' &&
      Array.isArray(item.payload?.duplicateIndices) &&
      onUpdateTransactions
    ) {
      const { updatedTransactions, updatedAccounts, removedCount } = removeDuplicateTransactionsWithBalanceSync(
        transactions,
        accounts,
        item.payload.duplicateIndices
      );
      onUpdateTransactions(updatedTransactions);
      if (onUpdateAccounts) {
        onUpdateAccounts(updatedAccounts);
      }
      showToast(`Berhasil menghapus ${removedCount} salinan duplikat dan menyinkronkan saldo rekening.`);
    } else if (item.fixType === 'add-missing-cat' && item.payload?.categoryName && onHarmonizeCategories) {
      onHarmonizeCategories([item.payload.categoryName]);
      showToast(`Berhasil menambahkan kategori "${item.payload.categoryName}" ke Master Category Hierarchy!`);
    } else if (item.fixType === 'reconcile-investment' && item.payload?.investmentId && onUpdateInvestments) {
      const { investmentId, targetBalance } = item.payload;
      const updated = investments.map((inv) =>
        inv.id === investmentId ? { ...inv, balance: targetBalance } : inv
      );
      onUpdateInvestments(updated);
      showToast(`Berhasil menyelaraskan valuasi investasi "${item.affectedRecordName}" ke ${formatterIDR.format(targetBalance)}!`);
    } else if (item.fixType === 'link-coa' && item.payload?.accountId && onUpdateAccounts) {
      const { accountId, accountType, accountName } = item.payload;
      const coaList = getStoredCoaList();
      // Find best match by type
      const defaultCoa = coaList.find((c) => {
        if (accountType === 'cash') return c.code === '1100';
        if (accountType === 'bank') return c.category === 'Asset';
        if (accountType === 'credit-card' || accountType === 'paylater') return c.category === 'Liability';
        return c.category === 'Asset';
      }) || coaList[0];

      const codeToAssign = defaultCoa ? defaultCoa.code : '1100';
      const updated = accounts.map((acc) =>
        acc.id === accountId ? { ...acc, coaCode: codeToAssign } : acc
      );
      onUpdateAccounts(updated);
      showToast(`Berhasil menghubungkan akun "${accountName}" ke COA [${codeToAssign}]!`);
    }
  };

  // Bulk Fix All Discrepancies
  const handleBulkFixAll = () => {
    const fixableItems = discrepancies.filter((d) => d.autoFixable);
    if (fixableItems.length === 0) return;

    let updatedAccounts = [...accounts];
    let updatedTransactions = [...transactions];
    let updatedInvestments = [...investments];
    const missingCatsToAdd: string[] = [];
    const duplicateIndicesToRemove: number[] = [];
    const orphanIndicesToRemove: number[] = [];

    const currentCoasList = getStoredCoaList();

    fixableItems.forEach((item) => {
      if (item.fixType === 'remove-duplicate-tx' && Array.isArray(item.payload?.duplicateIndices)) {
        duplicateIndicesToRemove.push(...item.payload.duplicateIndices);
      } else if (item.fixType === 'remove-orphan-tx' && typeof item.payload?.txIndex === 'number') {
        orphanIndicesToRemove.push(item.payload.txIndex);
      }
    });

    const allRemovedTxIndices = Array.from(new Set([...duplicateIndicesToRemove, ...orphanIndicesToRemove]));
    if (allRemovedTxIndices.length > 0) {
      const dedupRes = removeDuplicateTransactionsWithBalanceSync(
        updatedTransactions,
        updatedAccounts,
        allRemovedTxIndices
      );
      updatedTransactions = dedupRes.updatedTransactions;
      updatedAccounts = dedupRes.updatedAccounts;
    }

    fixableItems.forEach((item) => {
      if (item.fixType === 'reconcile-account' && item.payload?.accountId) {
        updatedAccounts = updatedAccounts.map((acc) => {
          if (acc.id !== item.payload.accountId) return acc;
          const freshTarget =
            allRemovedTxIndices.length > 0
              ? calculateAccountGLBalance(acc, updatedTransactions).glCalculatedBalance
              : item.payload.targetBalance;
          return setAccountTargetBalance(acc, freshTarget);
        });
      } else if (item.fixType === 'add-missing-cat' && item.payload?.categoryName) {
        missingCatsToAdd.push(item.payload.categoryName);
      } else if (item.fixType === 'reconcile-investment' && item.payload?.investmentId) {
        updatedInvestments = updatedInvestments.map((inv) =>
          inv.id === item.payload.investmentId ? { ...inv, balance: item.payload.targetBalance } : inv
        );
      } else if (item.fixType === 'link-coa' && item.payload?.accountId) {
        const defaultCoa = currentCoasList.find((c) => c.category === 'Asset') || currentCoasList[0];
        updatedAccounts = updatedAccounts.map((acc) =>
          acc.id === item.payload.accountId ? { ...acc, coaCode: defaultCoa ? defaultCoa.code : '1100' } : acc
        );
      }
    });

    if (onUpdateAccounts && updatedAccounts !== accounts) {
      onUpdateAccounts(updatedAccounts);
    }
    if (onUpdateTransactions && updatedTransactions !== transactions) {
      onUpdateTransactions(updatedTransactions);
    }
    if (onUpdateInvestments && updatedInvestments !== investments) {
      onUpdateInvestments(updatedInvestments);
    }
    if (onHarmonizeCategories && missingCatsToAdd.length > 0) {
      onHarmonizeCategories(missingCatsToAdd);
    }

    showToast(`Berhasil memperbaiki ${fixableItems.length} anomali dataset secara otomatis!`);
  };

  // Export Audit Summary CSV
  const handleExportCSV = () => {
    if (filteredDiscrepancies.length === 0) {
      showToast('Tidak ada anomali untuk diekspor.');
      return;
    }

    const headers = ['Dataset', 'Tingkat Bahaya', 'Judul Anomali', 'Deskripsi Rincian', 'Nama Rekor', 'Nilai Ekspektasi', 'Nilai Aktual'];
    const rows = filteredDiscrepancies.map((d) => [
      `"${d.category}"`,
      `"${d.severity}"`,
      `"${d.title.replace(/"/g, '""')}"`,
      `"${d.description.replace(/"/g, '""')}"`,
      `"${d.affectedRecordName.replace(/"/g, '""')}"`,
      `"${d.expectedValue || '-'}"`,
      `"${d.actualValue || '-'}"`,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Integrity_Report_Audit_${toLocalYYYYMMDD()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl border border-slate-700 flex items-center gap-3 text-xs font-bold animate-fadeIn">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Header Card */}
      <div className="p-6 bg-gradient-to-br from-slate-900 via-slate-850 to-slate-900 text-white rounded-3xl border border-slate-700/80 shadow-xl space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-700/60 pb-5">
          <div className="flex items-center gap-3.5">
            <div
              className={`p-3.5 rounded-2xl border ${
                metrics.healthScore >= 90
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                  : metrics.healthScore >= 70
                  ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                  : 'bg-rose-500/20 text-rose-400 border-rose-500/30'
              }`}
            >
              {metrics.healthScore >= 90 ? <ShieldCheck className="h-7 w-7" /> : <ShieldAlert className="h-7 w-7" />}
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-tight flex items-center gap-2.5">
                <span>Laporan Integritas & Audit Dataset</span>
                <span
                  className={`px-3 py-0.5 text-[10px] font-black rounded-full uppercase border ${
                    metrics.healthScore >= 90
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : metrics.healthScore >= 70
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                  }`}
                >
                  {metrics.healthScore}% {metrics.healthScore >= 90 ? 'Sehat 100%' : 'Anomali Terdeteksi'}
                </span>
              </h2>
              <p className="text-xs text-slate-400 font-medium">
                Pemeriksaan komprehensif lintas dataset (Rekening, Transaksi, Portofolio Investasi, &amp; Master COA)
                {coaScanResult ? (
                  <span className="font-mono tabular-nums text-slate-300">
                    {' '}
                    · {coaScanResult.totalLedgerAnomalies} anomali ledger · {coaScanResult.totalDuplicates} COA duplikat
                    {coaScanResult.scannedAt ? ` · Dipindai ${coaScanResult.scannedAt}` : ''}
                  </span>
                ) : null}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={handleTriggerReScan}
              disabled={isScanning}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-extrabold rounded-xl border border-slate-700 transition cursor-pointer flex items-center gap-2"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isScanning ? 'animate-spin' : ''}`} />
              <span>Scan Ulang</span>
            </button>

            {(onOpenModalFix || onOpenIntegrityModal) && (
              <button
                type="button"
                onClick={onOpenModalFix || onOpenIntegrityModal}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-extrabold rounded-xl shadow-md transition cursor-pointer flex items-center gap-2"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span>Modal Rekonsiliasi Full</span>
              </button>
            )}
          </div>
        </div>

        {/* Dashboard Stat Overview Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-4 bg-slate-800/60 rounded-2xl border border-slate-700/60 space-y-1">
            <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5 text-blue-400" />
              <span>Skor Integritas</span>
            </div>
            <div className="text-2xl font-black font-mono text-emerald-400">{metrics.healthScore}%</div>
            <div className="text-[10px] text-slate-400 font-medium">Dari {metrics.totalRecords} total rekor</div>
          </div>

          <div className="p-4 bg-slate-800/60 rounded-2xl border border-slate-700/60 space-y-1">
            <div className="text-[10px] font-black uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
              <ShieldAlert className="h-3.5 w-3.5" />
              <span>Anomali Kritis</span>
            </div>
            <div className="text-2xl font-black font-mono text-rose-400">{metrics.criticalCount}</div>
            <div className="text-[10px] text-slate-400 font-medium">Membutuhkan tindakan cepat</div>
          </div>

          <div className="p-4 bg-slate-800/60 rounded-2xl border border-slate-700/60 space-y-1">
            <div className="text-[10px] font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>Peringatan / Discrepancy</span>
            </div>
            <div className="text-2xl font-black font-mono text-amber-400">{metrics.warningCount}</div>
            <div className="text-[10px] text-slate-400 font-medium">Selisih saldo & unmapped COA</div>
          </div>

          <div className="p-4 bg-slate-800/60 rounded-2xl border border-slate-700/60 space-y-1">
            <div className="text-[10px] font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <Wand2 className="h-3.5 w-3.5" />
              <span>Dapat Di-autofix</span>
            </div>
            <div className="text-2xl font-black font-mono text-emerald-400">{metrics.fixableCount}</div>
            <div className="text-[10px] text-slate-400 font-medium">Dapat disolusikan 1-Klik</div>
          </div>
        </div>

        {/* Auto-Fix Banner Action */}
        {metrics.fixableCount > 0 && (
          <div className="p-4 bg-gradient-to-r from-emerald-950/60 to-teal-950/60 border border-emerald-500/40 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5">
              <Zap className="h-5 w-5 text-emerald-400 shrink-0" />
              <div>
                <strong className="text-emerald-300 font-bold">Auto-Fix Engine Tersedia!</strong>
                <p className="text-slate-300 text-[11px]">
                  Sistem menemukan <strong>{metrics.fixableCount} anomali</strong> yang dapat disinkronkan secara otomatis (rekonsiliasi saldo GL, hapus transaksi yatim, & daftarkan kategori).
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleBulkFixAll}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-xl shadow-md transition cursor-pointer shrink-0 flex items-center gap-1.5"
            >
              <Wand2 className="h-3.5 w-3.5" />
              <span>Perbaiki Semua ({metrics.fixableCount})</span>
            </button>
          </div>
        )}
      </div>

      {/* Filter and Control Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Dataset Tabs */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition cursor-pointer whitespace-nowrap ${
                activeTab === 'all'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Semua ({discrepancies.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('accounts')}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition cursor-pointer whitespace-nowrap ${
                activeTab === 'accounts'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Akun & Saldo ({discrepancies.filter((d) => d.category === 'accounts').length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('transactions')}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition cursor-pointer whitespace-nowrap ${
                activeTab === 'transactions'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Transaksi ({discrepancies.filter((d) => d.category === 'transactions').length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('investments')}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition cursor-pointer whitespace-nowrap ${
                activeTab === 'investments'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Investasi ({discrepancies.filter((d) => d.category === 'investments').length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('categories')}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition cursor-pointer whitespace-nowrap ${
                activeTab === 'categories'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Master COA/Kategori ({discrepancies.filter((d) => d.category === 'categories').length})
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* Search Input */}
            <div className="relative flex-1 sm:w-60">
              <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari anomali..."
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Severity Filter Dropdown */}
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value as any)}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Semua Severity</option>
              <option value="critical">🔴 Critical</option>
              <option value="warning">🟡 Warning</option>
              <option value="info">🔵 Info</option>
            </select>

            <button
              type="button"
              onClick={handleExportCSV}
              title="Ekspor Laporan Audit ke CSV"
              className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl transition cursor-pointer border border-slate-200 dark:border-slate-700"
            >
              <Download className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Discrepancy Items List */}
      <div className="space-y-3">
        {filteredDiscrepancies.length > 0 ? (
          filteredDiscrepancies.map((item) => (
            <div
              key={item.id}
              className={`p-5 rounded-2xl border transition shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                item.severity === 'critical'
                  ? 'bg-rose-50/70 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/60'
                  : item.severity === 'warning'
                  ? 'bg-amber-50/70 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/60'
                  : 'bg-blue-50/70 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900/60'
              }`}
            >
              <div className="flex items-start gap-3.5 min-w-0 flex-1">
                <div
                  className={`p-2.5 rounded-xl shrink-0 mt-0.5 ${
                    item.severity === 'critical'
                      ? 'bg-rose-600 text-white'
                      : item.severity === 'warning'
                      ? 'bg-amber-500 text-white'
                      : 'bg-blue-600 text-white'
                  }`}
                >
                  {item.severity === 'critical' ? (
                    <ShieldAlert className="h-5 w-5" />
                  ) : item.severity === 'warning' ? (
                    <AlertTriangle className="h-5 w-5" />
                  ) : (
                    <Info className="h-5 w-5" />
                  )}
                </div>

                <div className="space-y-1.5 min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`px-2 py-0.5 text-[9px] font-black uppercase rounded-full border ${
                        item.severity === 'critical'
                          ? 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border-rose-300'
                          : item.severity === 'warning'
                          ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border-amber-300'
                          : 'bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 border-blue-300'
                      }`}
                    >
                      {item.severity}
                    </span>

                    <span className="px-2 py-0.5 text-[9px] font-extrabold uppercase rounded-md bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      {item.category}
                    </span>

                    <h4 className="font-extrabold text-slate-900 dark:text-slate-100 text-xs sm:text-sm">
                      {item.title}
                    </h4>
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-300 font-medium leading-relaxed">
                    {item.description}
                  </p>

                  {(item.expectedValue !== undefined || item.actualValue !== undefined) && (
                    <div className="flex items-center gap-4 text-[11px] font-mono pt-1 text-slate-700 dark:text-slate-300">
                      {item.expectedValue !== undefined && (
                        <div>
                          <span className="text-slate-400">Ekspektasi (GL/Calculated):</span>{' '}
                          <strong className="text-emerald-600 dark:text-emerald-400">{item.expectedValue}</strong>
                        </div>
                      )}
                      {item.actualValue !== undefined && (
                        <div>
                          <span className="text-slate-400">Aktual Tercatat:</span>{' '}
                          <strong className="text-rose-600 dark:text-rose-400">{item.actualValue}</strong>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2 shrink-0 self-end md:self-center">
                {item.fixType === 'remove-orphan-tx' &&
                  typeof item.payload?.txIndex === 'number' &&
                  accounts.length > 0 &&
                  onUpdateTransactions && (
                    <>
                      <select
                        value={
                          orphanReassignTargets[item.payload.txIndex] ||
                          accounts.find((a) => a.type === 'bank' || a.type === 'cash' || a.type === 'e-wallet')?.id ||
                          accounts[0]?.id ||
                          ''
                        }
                        onChange={(e) => {
                          const txIdx = item.payload.txIndex as number;
                          const val = e.target.value;
                          setOrphanReassignTargets((prev) => ({ ...prev, [txIdx]: val }));
                        }}
                        className="px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {accounts.map((acc) => (
                          <option key={acc.id} value={acc.id}>
                            {acc.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => handleReassignOrphanTx(item)}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold rounded-xl shadow-xs transition cursor-pointer whitespace-nowrap"
                      >
                        Alihkan Akun
                      </button>
                    </>
                  )}
                {item.autoFixable && (
                  <button
                    type="button"
                    onClick={() => handleFixSingleDiscrepancy(item)}
                    className={`px-3.5 py-1.5 text-white text-xs font-extrabold rounded-xl shadow-xs transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                      item.fixType === 'remove-orphan-tx' || item.fixType === 'remove-duplicate-tx'
                        ? 'bg-rose-600 hover:bg-rose-700'
                        : 'bg-emerald-600 hover:bg-emerald-500'
                    }`}
                  >
                    <Wand2 className="h-3.5 w-3.5" />
                    <span>
                      {item.fixType === 'remove-orphan-tx'
                        ? 'Hapus'
                        : item.fixType === 'remove-duplicate-tx'
                        ? 'Hapus Salinan'
                        : 'Auto-Fix'}
                    </span>
                  </button>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="p-10 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-center space-y-3">
            <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h4 className="font-extrabold text-slate-800 dark:text-slate-100 text-sm">
                Dataset Bebas dari Anomali!
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto font-medium">
                Tidak ditemukan selisih saldo, transaksi yatim, atau kategori unmapped pada filter yang dipilih. Seluruh struktur jurnal dan pembukuan dalam keadaan seimbang.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
