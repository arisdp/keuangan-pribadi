import React, { useState, useMemo, useRef } from 'react';
import { Transaction, Account, CategoryBudget, Debt, FixedAsset, InvestmentAsset, EmergencyFundTransaction, KprCoaMappingConfig } from '../types';
import { CategoryNode, DEFAULT_CATEGORY_HIERARCHY } from '../categoryHierarchy';
import { CoaScanResult } from '../coaUtils';
import { HierarchicalPivotReport } from './HierarchicalPivotReport';
import { MasterCategoryManager } from './MasterCategoryManager';
import { CategoryTreeDiagram } from './CategoryTreeDiagram';
import { TaxCalculatorCard } from './TaxCalculatorCard';
import { SankeyFlowChart } from './SankeyFlowChart';
import { FinancialHealthRatios } from './FinancialHealthRatios';
import { LiquidityProjectionCard } from './LiquidityProjectionCard';
import { AiLedgerReconciliation } from './AiLedgerReconciliation';
import { MonthlyExpenseD3TrendChart } from './MonthlyExpenseD3TrendChart';
import { IntegrityReport } from './IntegrityReport';
import { AdjustingEntriesPanel, AdjustingEntryDraft } from './AdjustingEntriesPanel';
import {
  exportIncomeStatementToCSV,
  exportBalanceSheetToCSV,
  exportCashFlowToCSV,
  exportBudgetRealizationToCSV,
  exportReportSectionToPDF,
  buildMonthlyBalanceAndIncomeSummary,
  exportMonthlyBalanceAndIncomePDF,
} from '../utils/exportFinancialReports';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import {
  calculateCashFlowStatement,
  calculateBalanceSheet,
  calculateFixedAssetValuation,
  calculateTotalLiquidCash,
  isOperatingIncome,
  isOperatingExpense,
  syncKprDebtsToFixedAssets,
} from '../utils/accountingEngine';
import { formatterIDR } from '../utils/formatters';
import { showToast } from '../utils/toast';
import { 
  FileText, 
  FileSpreadsheet, 
  PieChart as PieChartIcon, 
  BarChart3, 
  BookOpen, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Calendar, 
  CheckCircle2, 
  AlertTriangle, 
  Search, 
  Download, 
  Printer, 
  ShieldCheck, 
  Scale, 
  Layers, 
  HelpCircle,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Sliders,
  Award,
  FolderTree,
  Table,
  GitFork,
  Calculator,
  GitCommit,
  Activity,
  FileCheck,
  LineChart as LineChartIcon,
  X,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, PieChart, Pie, LineChart, Line } from 'recharts';

interface ReportsTabProps {
  transactions: Transaction[];
  accounts: Account[];
  budgets: CategoryBudget[];
  debts: Debt[];
  investments: InvestmentAsset[];
  emergencyTransactions: EmergencyFundTransaction[];
  fixedAssets?: FixedAsset[];
  masterCategories?: CategoryNode[];
  kprCoaMapping?: KprCoaMappingConfig;
  onUpdateMasterCategories?: (newCats: CategoryNode[]) => void;
  onResetMasterCategories?: () => void;
  onUpdateAccounts?: (updatedAccounts: Account[]) => void;
  onUpdateTransactions?: (updatedTransactions: Transaction[]) => void;
  onUpdateInvestments?: (updatedInvestments: InvestmentAsset[]) => void;
  onApplyAdjustments?: (entries: AdjustingEntryDraft[]) => void;
  onReverseAdjustment?: (txId: string) => void;
  onOpenIntegrityModal?: () => void;
  coaScanResult?: CoaScanResult;
  onRescanCoa?: () => CoaScanResult | void;
}


export const ReportsTab: React.FC<ReportsTabProps> = ({
  transactions,
  accounts,
  budgets,
  debts,
  investments,
  emergencyTransactions,
  fixedAssets = [],
  masterCategories = DEFAULT_CATEGORY_HIERARCHY,
  kprCoaMapping,
  onUpdateMasterCategories,
  onResetMasterCategories,
  onUpdateAccounts,
  onUpdateTransactions,
  onUpdateInvestments,
  onApplyAdjustments,
  onReverseAdjustment,
  onOpenIntegrityModal,
  coaScanResult,
  onRescanCoa,
}) => {
  // Sub-tab selection
  const [activeReport, setActiveReport] = useState<'pivot-tree' | 'category-tree' | 'master-categories' | 'cashflow' | 'balance-sheet' | 'adjusting-entries' | 'budget-realization' | 'tax-calculator' | 'advanced-analytics' | 'sankey-flow' | 'financial-ratios' | 'ai-reconciliation' | 'integrity-report'>('pivot-tree');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<'all' | 'financial' | 'analytics' | 'planning'>('all');

  // PDF Export
  const reportRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportMonth, setExportMonth] = useState<number>(() => new Date().getMonth() + 1);
  const [exportYear, setExportYear] = useState<number>(() => new Date().getFullYear());

  const availableExportYears = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const yearSet = new Set<number>([currentYear, currentYear - 1]);
    transactions.forEach((tx) => {
      if (tx?.date && tx.date.length >= 4) {
        const y = parseInt(tx.date.slice(0, 4), 10);
        if (!Number.isNaN(y) && y >= 2000 && y <= currentYear + 5) {
          yearSet.add(y);
        }
      }
    });
    return Array.from(yearSet).sort((a, b) => b - a);
  }, [transactions]);

  const exportPreviewSummary = useMemo(() => {
    return buildMonthlyBalanceAndIncomeSummary({
      month: exportMonth,
      year: exportYear,
      transactions,
      accounts,
      debts,
      investments,
      emergencyTransactions,
      fixedAssets,
      kprCoaMapping,
    });
  }, [
    exportMonth,
    exportYear,
    transactions,
    accounts,
    debts,
    investments,
    emergencyTransactions,
    fixedAssets,
    kprCoaMapping,
  ]);

  const handleExportStructuredPDF = () => {
    setIsExporting(true);
    try {
      const filename = exportMonthlyBalanceAndIncomePDF({
        month: exportMonth,
        year: exportYear,
        transactions,
        accounts,
        debts,
        investments,
        emergencyTransactions,
        fixedAssets,
        kprCoaMapping,
      });
      showToast({
        type: 'success',
        title: 'Laporan PDF Diunduh',
        message: `Ringkasan Neraca & Laba-Rugi ${exportPreviewSummary.periodLabel} (${filename}) berhasil dibuat.`,
      });
      setShowExportModal(false);
    } catch (error) {
      console.error('Failed to export structured PDF:', error);
      showToast({
        type: 'error',
        title: 'Gagal Ekspor PDF',
        message: 'Terjadi kendala saat menyusun dokumen PDF Neraca & Laba-Rugi.',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const exportToPDF = async () => {
    if (!reportRef.current) return;
    setIsExporting(true);
    try {
      const canvas = await html2canvas(reportRef.current, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Laporan_Keuangan_NusantaraWealth_${new Date().toISOString().split('T')[0]}.pdf`);
      setShowExportModal(false);
    } catch (error) {
      console.error('Failed to export PDF:', error);
      showToast({
        type: 'error',
        title: 'Gagal Ekspor PDF',
        message: 'Terjadi kendala saat membuat dokumen PDF laporan keuangan.',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportCSV = () => {
    switch (activeReport) {
      case 'balance-sheet':
        exportBalanceSheetToCSV(balanceSheetData, accounts, debts, investments, syncedFixedAssets);
        break;
      case 'cashflow':
        exportCashFlowToCSV(cashflowData);
        break;
      case 'budget-realization':
        exportBudgetRealizationToCSV(
          budgetVsRealization.map((item) => ({
            ...item,
            limit: item.budgetLimit,
            actual: item.actualSpending,
          }))
        );
        break;
      case 'pivot-tree':
      default:
        exportIncomeStatementToCSV(filteredTxs, periodFilter, kprCoaMapping);
        break;
    }
  };

  // Filter Period State
  const [periodFilter, setPeriodFilter] = useState<'this-month' | 'last-3-months' | 'this-year' | 'all'>('this-month');

  // Search query for Budget vs Realization
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Calculate filtered transactions based on period filter
  const filteredTxs = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const currentYM = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

    return transactions.filter((tx) => {
      if (!tx.date) return false;
      if (periodFilter === 'all') return true;
      if (periodFilter === 'this-month') {
        return tx.date.startsWith(currentYM);
      }
      if (periodFilter === 'this-year') {
        return tx.date.startsWith(`${currentYear}`);
      }
      if (periodFilter === 'last-3-months') {
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(now.getMonth() - 3);
        const txDate = new Date(tx.date);
        return txDate >= threeMonthsAgo && txDate <= now;
      }
      return true;
    });
  }, [transactions, periodFilter]);

  // --- 1. CASHFLOW STATEMENT CALCULATIONS (Standardized 3-Activity Engine) ---
  const cashflowData = useMemo(() => {
    return calculateCashFlowStatement(filteredTxs, accounts);
  }, [filteredTxs, accounts]);

  const syncedFixedAssets = useMemo(() => {
    return syncKprDebtsToFixedAssets(fixedAssets, debts);
  }, [fixedAssets, debts]);

  // --- 2. BALANCE SHEET CALCULATIONS ---
  const balanceSheetData = useMemo(() => {
    return calculateBalanceSheet(accounts, emergencyTransactions, investments, debts, syncedFixedAssets);
  }, [accounts, emergencyTransactions, investments, debts, syncedFixedAssets]);

  // --- 3. BUDGET VS REALIZATION CALCULATIONS ---
  const budgetVsRealization = useMemo(() => {
    const now = new Date();
    const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthlyExpenses = transactions.filter((tx) => isOperatingExpense(tx) && tx.date.startsWith(currentYM));

    // Calculate actual spending per category
    const categorySpendingMap: Record<string, number> = {};
    monthlyExpenses.forEach((tx) => {
      categorySpendingMap[tx.category] = (categorySpendingMap[tx.category] || 0) + tx.amount;
    });

    const result = budgets.map((b) => {
      const actual = categorySpendingMap[b.category] || 0;
      const limit = (b as any).monthlyLimit || b.limit || 0;
      const variance = limit - actual; // Positive = Under budget (save), Negative = Over budget
      const usagePercent = limit > 0 ? (actual / limit) * 100 : 0;

      let status: 'Aman' | 'Waspada' | 'Kritis' | 'Over Budget' = 'Aman';
      let statusBg = 'bg-emerald-50 text-emerald-700 border-emerald-200';

      if (usagePercent > 100) {
        status = 'Over Budget';
        statusBg = 'bg-rose-100 text-rose-800 border-rose-300 font-extrabold animate-pulse';
      } else if (usagePercent >= 90) {
        status = 'Kritis';
        statusBg = 'bg-rose-50 text-rose-700 border-rose-200';
      } else if (usagePercent >= 75) {
        status = 'Waspada';
        statusBg = 'bg-amber-50 text-amber-700 border-amber-200';
      }

      return {
        id: (b as any).id || b.category,
        category: b.category,
        budgetLimit: limit,
        actualSpending: actual,
        variance,
        usagePercent,
        status,
        statusBg,
      };
    });

    // Add unbudgeted expense categories if any
    Object.keys(categorySpendingMap).forEach((cat) => {
      if (!budgets.some((b) => b.category === cat)) {
        const actual = categorySpendingMap[cat];
        result.push({
          id: `unbudgeted-${cat}`,
          category: cat,
          budgetLimit: 0,
          actualSpending: actual,
          variance: -actual,
          usagePercent: 100,
          status: 'Over Budget',
          statusBg: 'bg-rose-100 text-rose-800 border-rose-300',
        });
      }
    });

    return result.filter((item) =>
      item.category.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [budgets, transactions, searchQuery]);

  // Overall Budget Savings & Efficiency Summary
  const overallBudgetSummary = useMemo(() => {
    const totalBudget = budgets.reduce((sum, b) => sum + ((b as any).monthlyLimit || b.limit || 0), 0);
    const totalActual = budgetVsRealization.reduce((sum, b) => sum + b.actualSpending, 0);
    const totalVariance = totalBudget - totalActual;
    const overallUsage = totalBudget > 0 ? (totalActual / totalBudget) * 100 : 0;

    return {
      totalBudget,
      totalActual,
      totalVariance,
      overallUsage,
    };
  }, [budgets, budgetVsRealization]);

  // Visual Chart Data for Budget vs Realization (Recharts)
  const budgetVsRealizationChartData = useMemo(() => {
    return budgetVsRealization.map((item) => ({
      category: item.category,
      'Target Anggaran': item.budgetLimit,
      'Realisasi Pengeluaran': item.actualSpending,
    }));
  }, [budgetVsRealization]);

  // --- 4. ADVANCED ANALYTICS CALCULATIONS ---
  // A. 3-Month Cash Balance Projection
  const projectionData = useMemo(() => {
    // 1. Get average net operating cash flow of the last 3 months
    const now = new Date();
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    const last3MonthsTxs = transactions.filter(tx => {
      const d = new Date(tx.date);
      return d >= threeMonthsAgo && d <= now;
    });

    const totalIncome = last3MonthsTxs.filter(isOperatingIncome).reduce((sum, tx) => sum + tx.amount, 0);
    const totalExpense = last3MonthsTxs.filter(isOperatingExpense).reduce((sum, tx) => sum + tx.amount, 0);
    
    // Average net flow per month over the last 3 months
    const avgNetFlow = (totalIncome - totalExpense) / 3;

    // Current Liquid Assets
    const liquidAssets = calculateTotalLiquidCash(accounts);

    const data = [];
    
    // Current Month
    data.push({
      month: now.toLocaleDateString('id-ID', { month: 'short', year: '2-digit' }),
      Saldo: liquidAssets
    });

    // Next 3 Months Projection
    let projectedBalance = liquidAssets;
    for (let i = 1; i <= 3; i++) {
      projectedBalance += avgNetFlow;
      const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
      data.push({
        month: nextMonthDate.toLocaleDateString('id-ID', { month: 'short', year: '2-digit' }),
        Saldo: Math.max(0, projectedBalance)
      });
    }

    return data;
  }, [transactions, accounts]);

  // B. YoY Comparison (Current Month vs Same Month Last Year)
  const yoyComparisonData = useMemo(() => {
    const now = new Date();
    const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const lastYearYM = `${now.getFullYear() - 1}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const currentMonthExpenses = transactions.filter(tx => isOperatingExpense(tx) && tx.date.startsWith(currentYM));
    const lastYearMonthExpenses = transactions.filter(tx => isOperatingExpense(tx) && tx.date.startsWith(lastYearYM));

    const categoryMap: Record<string, { current: number, lastYear: number }> = {};

    currentMonthExpenses.forEach(tx => {
      if (!categoryMap[tx.category]) categoryMap[tx.category] = { current: 0, lastYear: 0 };
      categoryMap[tx.category].current += tx.amount;
    });

    lastYearMonthExpenses.forEach(tx => {
      if (!categoryMap[tx.category]) categoryMap[tx.category] = { current: 0, lastYear: 0 };
      categoryMap[tx.category].lastYear += tx.amount;
    });

    // Get top 5 categories by total spending across both periods to keep chart clean
    return Object.entries(categoryMap)
      .map(([name, vals]) => ({
        name,
        "Tahun Ini": vals.current,
        "Tahun Lalu": vals.lastYear,
        total: vals.current + vals.lastYear
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [transactions]);

  // C. Daily Expense Heatmap (Last 30 Days)
  const heatmapData = useMemo(() => {
    const data = [];
    const now = new Date();
    const map: Record<string, number> = {};

    // Sum operating expenses by date
    transactions.forEach(tx => {
      if (isOperatingExpense(tx)) {
        map[tx.date] = (map[tx.date] || 0) + tx.amount;
      }
    });

    // Generate last 30 days
    let maxExpense = 0;
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const amount = map[dateStr] || 0;
      if (amount > maxExpense) maxExpense = amount;
      
      data.push({
        date: dateStr,
        label: d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }),
        amount
      });
    }

    return { data, maxExpense };
  }, [transactions]);

  // --- 4. VISUALIZATION DATA FOR RECHARTS ---
  // Monthly spending trend (last 6 months) for Bar Chart
  const monthlySpendingTrend = useMemo(() => {
    const monthsMap: { [key: string]: { monthLabel: string; Pengeluaran: number; Pemasukan: number } } = {};
    const now = new Date();

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const key = `${y}-${m}`;
      const monthLabel = d.toLocaleDateString('id-ID', { month: 'short', year: '2-digit' });
      monthsMap[key] = { monthLabel, Pengeluaran: 0, Pemasukan: 0 };
    }

    transactions.forEach((tx) => {
      if (!tx.date) return;
      const key = tx.date.substring(0, 7);
      if (monthsMap[key]) {
        if (isOperatingExpense(tx)) {
          monthsMap[key].Pengeluaran += tx.amount;
        } else if (isOperatingIncome(tx)) {
          monthsMap[key].Pemasukan += tx.amount;
        }
      }
    });

    return Object.values(monthsMap);
  }, [transactions]);

  // Expense category composition for Pie Chart
  const categoryColors = [
    '#e11d48', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6',
    '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#64748b'
  ];

  const categoryCompositionData = useMemo(() => {
    const map: Record<string, number> = {};
    filteredTxs
      .filter(isOperatingExpense)
      .forEach((tx) => {
        const cat = tx.category || 'Lainnya';
        map[cat] = (map[cat] || 0) + tx.amount;
      });

    const total = Object.values(map).reduce((sum, val) => sum + val, 0);

    return Object.entries(map)
      .map(([name, value], index) => ({
        name,
        value,
        percentage: total > 0 ? ((value / total) * 100).toFixed(1) : '0',
        color: categoryColors[index % categoryColors.length],
      }))
      .sort((a, b) => b.value - a.value);
  }, [filteredTxs]);

  return (
    <div className="space-y-6 animate-fadeIn pb-12" ref={reportRef}>
      {/* HEADER SECTION */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-blue-600 shrink-0" />
            <h2 className="text-xl font-black text-slate-800 tracking-tight">
              Pusat Laporan Keuangan & Akuntansi (Standardized Accounting)
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1 font-medium leading-relaxed max-w-2xl">
            Akses laporan keuangan standar (Arus Kas, Neraca, Chart of Accounts, dan Analisis Budget vs Realisasi) secara real-time.
          </p>
        </div>

        {/* Global Print & Export Actions */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition cursor-pointer whitespace-nowrap shrink-0"
            title="Ekspor Data Laporan Aktif ke Format CSV Spreadsheet"
          >
            <FileSpreadsheet className="h-4 w-4" />
            <span>Ekspor CSV</span>
          </button>
          <button
            type="button"
            onClick={() => setShowExportModal(true)}
            disabled={isExporting}
            className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap shrink-0"
          >
            {isExporting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            <span>{isExporting ? 'Mengekspor...' : 'Ekspor Laporan'}</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer border border-slate-200 whitespace-nowrap shrink-0"
          >
            <Printer className="h-4 w-4 text-slate-600" />
            <span>Cetak</span>
          </button>
        </div>
      </div>

      {/* MODAL EKSPOR LAPORAN PDF TERSTRUKTUR (NERACA & LABA-RUGI BULANAN) */}
      {showExportModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4"
          onClick={() => !isExporting && setShowExportModal(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="export-report-modal-title"
            className="bg-white rounded-2xl border border-slate-200 w-full max-w-lg overflow-hidden shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 rounded-xl bg-slate-900 text-white shrink-0">
                  <FileText className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <h3
                    id="export-report-modal-title"
                    className="text-sm font-extrabold text-slate-900 truncate"
                  >
                    Ekspor Laporan Keuangan (PDF)
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Ringkasan Neraca &amp; Laporan Laba-Rugi Bulanan format A4 rapi
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Tutup modal ekspor"
                disabled={isExporting}
                onClick={() => setShowExportModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-5">
              {/* Pemilih Bulan & Tahun Laporan Laba-Rugi */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label
                    htmlFor="export-report-month"
                    className="block text-xs font-bold text-slate-700"
                  >
                    Bulan Laba-Rugi
                  </label>
                  <select
                    id="export-report-month"
                    value={exportMonth}
                    onChange={(e) => setExportMonth(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  >
                    {[
                      'Januari',
                      'Februari',
                      'Maret',
                      'April',
                      'Mei',
                      'Juni',
                      'Juli',
                      'Agustus',
                      'September',
                      'Oktober',
                      'November',
                      'Desember',
                    ].map((monthName, idx) => (
                      <option key={monthName} value={idx + 1}>
                        {monthName}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="export-report-year"
                    className="block text-xs font-bold text-slate-700"
                  >
                    Tahun
                  </label>
                  <select
                    id="export-report-year"
                    value={exportYear}
                    onChange={(e) => setExportYear(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  >
                    {availableExportYears.map((yr) => (
                      <option key={yr} value={yr}>
                        {yr}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Pratinjau Ringkas Dokumen */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 divide-y divide-slate-200 text-xs">
                <div className="px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-600">
                    <span>Bagian I · Ringkasan Neraca Posisi Terkini</span>
                    <span
                      className={
                        exportPreviewSummary.balanceSheet.isBalanced
                          ? 'text-emerald-700'
                          : 'text-rose-700'
                      }
                    >
                      {exportPreviewSummary.balanceSheet.isBalanced ? 'Seimbang' : 'Cek Balance'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <div>
                      <span className="text-[10px] text-slate-500 block">Total Aset</span>
                      <span className="font-mono tabular-nums font-bold text-slate-900">
                        {formatterIDR.format(exportPreviewSummary.balanceSheet.totalAssets)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">Total Kewajiban</span>
                      <span className="font-mono tabular-nums font-bold text-rose-700">
                        {formatterIDR.format(exportPreviewSummary.balanceSheet.totalLiabilities)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">Ekuitas Bersih</span>
                      <span className="font-mono tabular-nums font-bold text-emerald-700">
                        {formatterIDR.format(exportPreviewSummary.balanceSheet.equity)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-600">
                    <span>Bagian II · Laba-Rugi {exportPreviewSummary.periodLabel}</span>
                    <span className="font-mono tabular-nums text-slate-500 font-medium">
                      {exportPreviewSummary.monthTxCount} transaksi
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <div>
                      <span className="text-[10px] text-slate-500 block">Pendapatan</span>
                      <span className="font-mono tabular-nums font-bold text-emerald-700">
                        {formatterIDR.format(exportPreviewSummary.totalIncome)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">Beban</span>
                      <span className="font-mono tabular-nums font-bold text-rose-700">
                        -{formatterIDR.format(exportPreviewSummary.totalExpense)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">Surplus Bersih</span>
                      <span
                        className={`font-mono tabular-nums font-bold ${
                          exportPreviewSummary.netSurplus >= 0
                            ? 'text-emerald-700'
                            : 'text-rose-700'
                        }`}
                      >
                        {exportPreviewSummary.netSurplus >= 0 ? '+' : ''}
                        {formatterIDR.format(exportPreviewSummary.netSurplus)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-4 border-t border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <button
                type="button"
                disabled={isExporting}
                onClick={exportToPDF}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold transition cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                <FileCheck className="h-3.5 w-3.5" />
                <span>Tangkap Tab Aktif ke PDF</span>
              </button>

              <button
                type="button"
                disabled={isExporting}
                onClick={handleExportStructuredPDF}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                {isExporting ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                <span>{isExporting ? 'Menyusun PDF...' : 'Unduh PDF Laporan'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REPORT SUB-TAB NAVIGATOR (CATEGORIZED GRID UI) */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        {/* Category Filter Pills & Indicator */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-blue-600" />
            <span className="text-xs font-black text-slate-800 uppercase tracking-wider">
              Modul Laporan & Analitik Keuangan
            </span>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {[
              { id: 'all', label: 'Semua Laporan (12)' },
              { id: 'financial', label: 'Laporan Keuangan & Audit (6)' },
              { id: 'analytics', label: 'Analisis, Tren & Visualisasi (3)' },
              { id: 'planning', label: 'Perencanaan, Rasio & Pajak (3)' },
            ].map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategoryFilter(cat.id as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                  selectedCategoryFilter === cat.id
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Responsive Reports Grid (No Horizontal Scroll Needed) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          {[
            // Laporan Keuangan & Akuntansi
            {
              id: 'pivot-tree',
              label: 'Laporan Pivot Keuangan',
              shortDesc: 'Pivot Bertingkat',
              icon: Table,
              category: 'financial',
              badge: 'Laba Rugi',
            },
            {
              id: 'cashflow',
              label: 'Laporan Arus Kas',
              shortDesc: 'Cash Flow Standard',
              icon: BarChart3,
              category: 'financial',
            },
            {
              id: 'balance-sheet',
              label: 'Laporan Neraca',
              shortDesc: 'Aset, Utang & Ekuitas',
              icon: Scale,
              category: 'financial',
            },
            {
              id: 'adjusting-entries',
              label: 'Adjusting Entries',
              shortDesc: 'Depresiasi & Akrual Bunga',
              icon: BookOpen,
              category: 'financial',
              badge: 'Non-Kas',
            },
            {
              id: 'ai-reconciliation',
              label: 'Rekonsiliasi Jurnal & Audit',
              shortDesc: 'Audit COA Otomatis',
              icon: FileCheck,
              category: 'financial',
              badge: 'AI Audit',
            },
            {
              id: 'integrity-report',
              label: 'Laporan Integritas Dataset',
              shortDesc: 'Audit Anomali Dataset',
              icon: ShieldCheck,
              category: 'financial',
              badge: 'Laporan Anomali',
            },

            // Analisis, Tren & Visualisasi
            {
              id: 'advanced-analytics',
              label: 'Analisis, Tren & Prediksi D3',
              shortDesc: 'Grafik D3.js & Proyeksi',
              icon: TrendingUp,
              category: 'analytics',
              badge: 'D3.js & AI',
            },
            {
              id: 'sankey-flow',
              label: 'Diagram Sankey & Kebocoran',
              shortDesc: 'Alur Kas Visual',
              icon: GitCommit,
              category: 'analytics',
            },
            {
              id: 'category-tree',
              label: 'Pohon Kategori Visual',
              shortDesc: 'Tree Diagram',
              icon: GitFork,
              category: 'analytics',
            },

            // Perencanaan, Rasio & Pajak
            {
              id: 'financial-ratios',
              label: 'Rasio Kesehatan CFP',
              shortDesc: 'Solvabilitas & Likuiditas',
              icon: Activity,
              category: 'planning',
            },
            {
              id: 'budget-realization',
              label: 'Budget vs Realisasi',
              shortDesc: 'Evaluasi Anggaran',
              icon: Sliders,
              category: 'planning',
            },
            {
              id: 'tax-calculator',
              label: 'Estimasi Pajak Tahunan',
              shortDesc: 'Kalkulator PPh 21',
              icon: Calculator,
              category: 'planning',
            },
          ]
            .filter((item) => selectedCategoryFilter === 'all' || item.category === selectedCategoryFilter)
            .map((item) => {
              const Icon = item.icon;
              const isActive = activeReport === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveReport(item.id as any);
                    setSearchQuery('');
                  }}
                  className={`p-3 rounded-2xl text-left transition-all cursor-pointer flex flex-col justify-between border ${
                    isActive
                      ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/25 ring-2 ring-blue-500/50'
                      : 'bg-slate-50/80 hover:bg-white text-slate-700 hover:text-blue-600 border-slate-200/80 hover:border-blue-300 hover:shadow-xs'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 mb-2">
                    <div className={`p-2 rounded-xl shrink-0 ${isActive ? 'bg-white/20 text-white' : 'bg-white text-blue-600 shadow-2xs border border-slate-200/60'}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    {item.badge && (
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${isActive ? 'bg-white/20 text-blue-100' : 'bg-blue-100 text-blue-800'}`}>
                        {item.badge}
                      </span>
                    )}
                  </div>
                  <div>
                    <h4 className="text-xs font-black tracking-tight leading-snug">{item.label}</h4>
                    <p className={`text-[10px] font-medium mt-0.5 line-clamp-1 ${isActive ? 'text-blue-100' : 'text-slate-400'}`}>
                      {item.shortDesc}
                    </p>
                  </div>
                </button>
              );
            })}
        </div>
      </div>

      {/* VIEW 0A: LAPORAN PIVOT KEUANGAN BERTINGKAT */}
      {activeReport === 'pivot-tree' && (
        <HierarchicalPivotReport
          transactions={transactions}
          masterCategories={masterCategories}
          kprCoaMapping={kprCoaMapping}
        />
      )}

      {/* VIEW 0A2: MODUL ADJUSTING ENTRIES (JURNAL PENYESUAIAN OTOMATIS) */}
      {activeReport === 'adjusting-entries' && (
        <AdjustingEntriesPanel
          transactions={transactions}
          investments={investments}
          debts={debts}
          kprCoaMapping={kprCoaMapping}
          onApplyAdjustments={(entries) => onApplyAdjustments?.(entries)}
          onReverseAdjustment={(txId) => onReverseAdjustment?.(txId)}
        />
      )}

      {/* VIEW 0B: POHON KATEGORI VISUAL (TREE DIAGRAM) */}
      {activeReport === 'category-tree' && (
        <CategoryTreeDiagram
          categories={masterCategories}
          transactions={transactions}
        />
      )}

      {/* VIEW 0C: DIAGRAM ALIR SANKEY & DETEKSI KEBOCORAN */}
      {activeReport === 'sankey-flow' && (
        <div className="animate-fadeIn">
          <SankeyFlowChart transactions={transactions} />
        </div>
      )}

      {/* VIEW 0D: RASIO KESEHATAN FINANSIAL (CFP BENCHMARK) & PROYEKSI SOLVABILITAS */}
      {activeReport === 'financial-ratios' && (
        <div className="space-y-6 animate-fadeIn">
          <FinancialHealthRatios
            transactions={transactions}
            accounts={accounts}
            debts={debts}
            investments={investments}
            emergencyTransactions={emergencyTransactions}
            fixedAssets={syncedFixedAssets}
          />
          <LiquidityProjectionCard
            transactions={transactions}
            accounts={accounts}
            debts={debts}
          />
        </div>
      )}

      {/* VIEW 0E: REKONSILIASI JURNAL & AUDIT AKUNTANSI BULANAN */}
      {activeReport === 'ai-reconciliation' && (
        <div className="animate-fadeIn">
          <AiLedgerReconciliation
            transactions={transactions}
            accounts={accounts}
            masterCategories={masterCategories}
            onReconcileFix={(missingCategories) => {
              if (missingCategories.length > 0 && onUpdateMasterCategories) {
                // Auto add missing categories into masterCategories tree under 'Pengeluaran Lainnya'
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
                  onUpdateMasterCategories(updatedTree);
                }
              }
            }}
          />
        </div>
      )}

      {/* VIEW 0E2: LAPORAN INTEGRITAS DATASET & AUDIT ANOMALI */}
      {activeReport === 'integrity-report' && (
        <div className="animate-fadeIn">
          <IntegrityReport
            accounts={accounts}
            transactions={transactions}
            masterCategories={masterCategories}
            investments={investments}
            coaScanResult={coaScanResult}
            onRescanCoa={onRescanCoa}
            onOpenIntegrityModal={onOpenIntegrityModal}
            onUpdateAccounts={onUpdateAccounts}
            onUpdateTransactions={onUpdateTransactions}
            onUpdateInvestments={onUpdateInvestments}
            onHarmonizeCategories={(missingCats) => {
              if (missingCats.length > 0 && onUpdateMasterCategories) {
                const updatedTree = JSON.parse(JSON.stringify(masterCategories)) as CategoryNode[];
                const expGroup = updatedTree.find((n) => n.id === 'cat-exp' || n.name.toLowerCase().includes('pengeluaran'));
                if (expGroup && expGroup.children) {
                  const otherGroup = expGroup.children.find((c) => c.name.toLowerCase().includes('lain'));
                  missingCats.forEach((catName) => {
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
                  onUpdateMasterCategories(updatedTree);
                }
              }
            }}
            onOpenModalFix={onOpenIntegrityModal}
          />
        </div>
      )}

      {/* VIEW 0C: KALKULATOR ESTIMASI PAJAK TAHUNAN */}
      {activeReport === 'tax-calculator' && (
        <div className="animate-fadeIn">
          <TaxCalculatorCard transactions={transactions} />
        </div>
      )}

      {/* VIEW 1: REPORT - ARUS KAS (CASH FLOW STATEMENT) */}
      {activeReport === 'cashflow' && (
        <div className="space-y-6 animate-fadeIn">
          {/* Period Filter Bar */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
              <Calendar className="h-4 w-4 text-blue-600" />
              Periode Laporan Arus Kas:
            </span>
            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg">
              {[
                { id: 'this-month', label: 'Bulan Ini' },
                { id: 'last-3-months', label: '3 Bulan Terakhir' },
                { id: 'this-year', label: 'Tahun Ini' },
                { id: 'all', label: 'Semua Periode' },
              ].map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPeriodFilter(p.id as any)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-md transition cursor-pointer ${
                    periodFilter === p.id ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Cashflow Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-1">
              <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Arus Kas Operasional</p>
              <p className={`text-base font-black ${cashflowData.netOperating >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {formatterIDR.format(cashflowData.netOperating)}
              </p>
              <p className="text-[10px] text-slate-400">Pemasukan vs Pengeluaran Rutin</p>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-1">
              <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Arus Kas Investasi & Cadangan</p>
              <p className={`text-base font-black ${cashflowData.netInvesting >= 0 ? 'text-emerald-600' : 'text-blue-600'}`}>
                {formatterIDR.format(cashflowData.netInvesting)}
              </p>
              <p className="text-[10px] text-slate-400">Investasi & Dana Darurat</p>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-1">
              <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Arus Kas Pendanaan</p>
              <p className={`text-base font-black ${cashflowData.netFinancing >= 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                {formatterIDR.format(cashflowData.netFinancing)}
              </p>
              <p className="text-[10px] text-slate-400">Pinjaman Baru & Cicilan Utang</p>
            </div>

            <div className="bg-blue-600 text-white p-5 rounded-xl shadow-md space-y-1">
              <p className="text-[10px] text-blue-200 font-extrabold uppercase tracking-wider">Perubahan Kas Bersih</p>
              <p className="text-lg font-black font-mono">
                {cashflowData.netCashChange >= 0 ? '+' : ''}{formatterIDR.format(cashflowData.netCashChange)}
              </p>
              <p className="text-[10px] text-blue-100">Surplus / Defisit Kas Periode Ini</p>
            </div>
          </div>

          {/* VISUALIZATION SECTION: TREN PENGELUARAN (BAR CHART) & KOMPOSISI KATEGORI (PIE CHART) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* DIAGRAM BATANG: TREN PENGELUARAN BULANAN */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                    <BarChart3 className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-slate-800 text-xs uppercase tracking-wider">
                      Tren Pengeluaran Bulanan (Diagram Batang)
                    </h3>
                    <p className="text-[11px] text-slate-400 font-medium">
                      Perbandingan pengeluaran & pemasukan 6 bulan terakhir
                    </p>
                  </div>
                </div>
                <span className="text-[10px] bg-blue-50 text-blue-600 px-2.5 py-1 rounded-full font-extrabold uppercase">
                  Recharts Bar
                </span>
              </div>

              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlySpendingTrend} margin={{ top: 15, right: 15, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis 
                      dataKey="monthLabel" 
                      tick={{ fill: '#64748b', fontSize: 11, fontWeight: 'bold' }} 
                      axisLine={{ stroke: '#e2e8f0' }}
                      tickLine={false}
                    />
                    <YAxis 
                      tickFormatter={(val) => val >= 1000000 ? `${(val / 1000000).toFixed(1)}M` : `${(val / 1000).toFixed(0)}K`}
                      tick={{ fill: '#64748b', fontSize: 10 }}
                      axisLine={{ stroke: '#e2e8f0' }}
                      tickLine={false}
                    />
                    <Tooltip 
                      formatter={(val: number, name: string) => [formatterIDR.format(Number(val)), name]}
                      contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', color: '#1e293b', fontSize: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontWeight: 'bold' }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px', fontWeight: 'bold', paddingTop: '8px' }} />
                    <Bar dataKey="Pengeluaran" name="Total Pengeluaran" fill="#e11d48" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="Pemasukan" name="Total Pemasukan" fill="#10b981" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* DIAGRAM LINGKARAN: KOMPOSISI KATEGORI PENGELUARAN */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-purple-50 text-purple-600 rounded-xl">
                    <PieChartIcon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-slate-800 text-xs uppercase tracking-wider">
                      Komposisi Kategori Pengeluaran (Diagram Lingkaran)
                    </h3>
                    <p className="text-[11px] text-slate-400 font-medium">
                      Proporsi pengeluaran berdasarkan kategori (Periode Dipilih)
                    </p>
                  </div>
                </div>
                <span className="text-[10px] bg-purple-50 text-purple-600 px-2.5 py-1 rounded-full font-extrabold uppercase">
                  Recharts Pie
                </span>
              </div>

              {categoryCompositionData.length === 0 ? (
                <div className="h-72 flex flex-col items-center justify-center text-center p-6 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                  <PieChartIcon className="h-10 w-10 text-slate-300 mb-2" />
                  <p className="text-xs font-bold text-slate-500">Belum Ada Data Pengeluaran</p>
                  <p className="text-[11px] text-slate-400 max-w-xs mt-1">
                    Tidak ditemukan transaksi pengeluaran pada periode yang Anda pilih saat ini.
                  </p>
                </div>
              ) : (
                <div className="h-72 w-full flex flex-col sm:flex-row items-center justify-center gap-2">
                  <div className="h-full w-full sm:w-3/5">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={categoryCompositionData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={45}
                          outerRadius={75}
                          paddingAngle={3}
                        >
                          {categoryCompositionData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip 
                          formatter={(val: number) => [formatterIDR.format(Number(val)), 'Total']}
                          contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', color: '#1e293b', fontSize: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontWeight: 'bold' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Legend list on the side for clean readability */}
                  <div className="w-full sm:w-2/5 max-h-64 overflow-y-auto space-y-1.5 pr-1 text-xs">
                    {categoryCompositionData.map((item, idx) => (
                      <div key={`pie-leg-${idx}`} className="flex items-center justify-between text-[11px] p-1.5 rounded-lg hover:bg-slate-50 transition">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                          <span className="font-bold text-slate-700 truncate">{item.name}</span>
                        </div>
                        <span className="font-mono font-black text-slate-800 shrink-0 ml-1">
                          {item.percentage}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Detailed Statement Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-extrabold text-slate-800 text-xs uppercase tracking-wider">
                Rincian Laporan Arus Kas (Cash Flow Statement)
              </h3>
              <span className="text-[10px] text-slate-400 font-mono">Standard PSAR / GAAP Format</span>
            </div>

            <div className="divide-y divide-slate-100 text-xs">
              {/* 1. OPERATING ACTIVITIES */}
              <div className="p-4 bg-slate-50/50">
                <p className="font-extrabold text-slate-800 uppercase text-[11px] mb-2 text-blue-700">
                  1. Arus Kas Dari Aktivitas Operasional
                </p>
                <div className="space-y-2 pl-3">
                  <div className="flex justify-between text-slate-600">
                    <span>Penerimaan Kas dari Pendapatan & Gaji</span>
                    <span className="font-mono text-emerald-600 font-bold">+{formatterIDR.format(cashflowData.operatingInflows)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Pengeluaran Kas untuk Beban & Operasional Harian</span>
                    <span className="font-mono text-rose-600 font-bold">-{formatterIDR.format(cashflowData.operatingOutflows)}</span>
                  </div>
                  <div className="flex justify-between font-extrabold text-slate-800 border-t border-slate-200 pt-2">
                    <span>Kas Bersih Dari Aktivitas Operasional</span>
                    <span className={`font-mono ${cashflowData.netOperating >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {formatterIDR.format(cashflowData.netOperating)}
                    </span>
                  </div>
                </div>
              </div>

              {/* 2. INVESTING & RESERVE ACTIVITIES */}
              <div className="p-4">
                <p className="font-extrabold text-slate-800 uppercase text-[11px] mb-2 text-blue-700">
                  2. Arus Kas Dari Aktivitas Investasi & Cadangan Aset
                </p>
                <div className="space-y-2 pl-3">
                  <div className="flex justify-between text-slate-600">
                    <span>Pencairan / Penjualan Portofolio Investasi</span>
                    <span className="font-mono text-emerald-600 font-bold">+{formatterIDR.format(cashflowData.investmentInflows)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Pembelian / Setoran Modal ke Portofolio Investasi</span>
                    <span className="font-mono text-blue-600 font-bold">-{formatterIDR.format(cashflowData.investmentOutflows)}</span>
                  </div>
                  {cashflowData.fixedAssetOutflows > 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span>Pembelian / Akuisisi Aset Tetap</span>
                      <span className="font-mono text-blue-600 font-bold">-{formatterIDR.format(cashflowData.fixedAssetOutflows)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-slate-600">
                    <span>Pencairan Cadangan Dana Darurat</span>
                    <span className="font-mono text-emerald-600 font-bold">+{formatterIDR.format(cashflowData.savingInflows)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Setoran Alokasi Dana Darurat</span>
                    <span className="font-mono text-blue-600 font-bold">-{formatterIDR.format(cashflowData.savingOutflows)}</span>
                  </div>
                  <div className="flex justify-between font-extrabold text-slate-800 border-t border-slate-200 pt-2">
                    <span>Kas Bersih Untuk Aktivitas Investasi & Cadangan</span>
                    <span className={`font-mono ${cashflowData.netInvesting >= 0 ? 'text-emerald-600' : 'text-blue-600'}`}>
                      {formatterIDR.format(cashflowData.netInvesting)}
                    </span>
                  </div>
                </div>
              </div>

              {/* 3. FINANCING ACTIVITIES */}
              <div className="p-4 bg-slate-50/50">
                <p className="font-extrabold text-slate-800 uppercase text-[11px] mb-2 text-blue-700">
                  3. Arus Kas Dari Aktivitas Pendanaan / Pembiayaan
                </p>
                <div className="space-y-2 pl-3">
                  <div className="flex justify-between text-slate-600">
                    <span>Penerimaan / Pencairan Pinjaman Utang Baru</span>
                    <span className="font-mono text-emerald-600 font-bold">+{formatterIDR.format(cashflowData.debtProceedsInflows)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Pembayaran Cicilan Pokok Utang & KPR</span>
                    <span className="font-mono text-amber-600 font-bold">-{formatterIDR.format(cashflowData.debtPaymentOutflows)}</span>
                  </div>
                  <div className="flex justify-between font-extrabold text-slate-800 border-t border-slate-200 pt-2">
                    <span>Kas Bersih Dari Aktivitas Pendanaan</span>
                    <span className={`font-mono ${cashflowData.netFinancing >= 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {formatterIDR.format(cashflowData.netFinancing)}
                    </span>
                  </div>
                </div>
              </div>

              {/* NON-CASH CREDIT USAGE DISCLOSURE */}
              {cashflowData.nonCashCreditOutflows > 0 && (
                <div className="p-4 bg-slate-50/70 flex justify-between items-center text-slate-600">
                  <div>
                    <span className="font-semibold text-slate-700 block">
                      Belanja Non-Kas via Kartu Kredit / PayLater (Terpisah dari Arus Kas Keluar Tunai)
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Beban diakui di Laba Rugi; arus kas keluar dicatat saat pelunasan tagihan kartu.
                    </span>
                  </div>
                  <span className="font-mono font-bold text-slate-700">
                    {formatterIDR.format(cashflowData.nonCashCreditOutflows)}
                  </span>
                </div>
              )}

              {/* TOTAL NET CASH FLOW */}
              <div className="p-4 bg-blue-50/80 border-t-2 border-blue-200 flex justify-between items-center font-extrabold text-sm text-slate-900">
                <span>KENAIKAN / (PENURUNAN) BERSIH KAS & SETARA KAS</span>
                <span className={`font-mono text-base ${cashflowData.netCashChange >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {cashflowData.netCashChange >= 0 ? '+' : ''}{formatterIDR.format(cashflowData.netCashChange)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: REPORT - NERACA (BALANCE SHEET) */}
      {activeReport === 'balance-sheet' && (
        <div className="space-y-6 animate-fadeIn">
          {/* Balance Status Banner */}
          <div
            className={`p-4 rounded-xl border flex items-center justify-between gap-4 ${
              balanceSheetData.isBalanced
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-6 w-6 text-emerald-600 shrink-0" />
              <div>
                <p className="font-extrabold text-xs uppercase tracking-wider">
                  Status Persamaan Dasar Akuntansi (Aset = Kewajiban + Ekuitas)
                </p>
                <p className="text-xs text-slate-600 mt-0.5">
                  Neraca Keuangan Anda dalam kondisi seimbang dan terverifikasi secara matematis.
                </p>
              </div>
            </div>
            <span className="px-3 py-1 bg-emerald-600 text-white text-xs font-black rounded-lg uppercase tracking-wider shrink-0">
              BALANCED (SEIMBANG)
            </span>
          </div>

          {/* Balance Sheet Grid Columns */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* LEFT COLUMN: ASET (ASSETS) */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
                <h3 className="font-extrabold text-xs uppercase tracking-wider text-emerald-400">
                  1. ASET / HARTA (ASSETS)
                </h3>
                <span className="text-[10px] text-slate-400">Sisi Aktiva</span>
              </div>

              <div className="p-4 space-y-4 text-xs">
                {/* Aset Lancar / Kas */}
                <div>
                  <p className="font-bold text-slate-700 uppercase text-[11px] mb-2 border-b pb-1">
                    A. Aset Lancar & Kas Bank
                  </p>
                  <div className="space-y-1.5 pl-2 text-slate-600">
                    {accounts
                      .filter((a) => a.type !== 'credit-card' && a.type !== 'paylater')
                      .map((acc, index) => (
                        <div key={acc.id ? `acc-${acc.id}-${index}` : `acc-${index}`} className="flex justify-between">
                          <span>{acc.name} ({acc.type.toUpperCase()})</span>
                          <span className="font-mono font-semibold">{formatterIDR.format(acc.currentBalance)}</span>
                        </div>
                      ))}
                    <div className="flex justify-between font-bold text-slate-800 border-t pt-1 mt-1">
                      <span>Total Aset Lancar Likuid</span>
                      <span className="font-mono text-emerald-600">{formatterIDR.format(balanceSheetData.liquidAssets)}</span>
                    </div>
                  </div>
                </div>

                {/* Dana Darurat */}
                <div>
                  <p className="font-bold text-slate-700 uppercase text-[11px] mb-2 border-b pb-1">
                    B. Cadangan Dana Darurat
                  </p>
                  <div className="space-y-1.5 pl-2 text-slate-600">
                    <div className="flex justify-between">
                      <span>Saldo Alokasi Dana Darurat</span>
                      <span className="font-mono font-semibold">{formatterIDR.format(balanceSheetData.emergencyAssets)}</span>
                    </div>
                  </div>
                </div>

                {/* Aset Investasi */}
                <div>
                  <p className="font-bold text-slate-700 uppercase text-[11px] mb-2 border-b pb-1">
                    C. Aset Investasi & Portofolio
                  </p>
                  <div className="space-y-1.5 pl-2 text-slate-600">
                    {investments.map((inv, index) => (
                      <div key={inv.id ? `inv-${inv.id}-${index}` : `inv-${index}`} className="flex justify-between">
                        <span>{inv.name} ({(inv as any).assetType || inv.category || (inv as any).type || 'Investasi'})</span>
                        <span className="font-mono font-semibold">{formatterIDR.format(inv.balance)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between font-bold text-slate-800 border-t pt-1 mt-1">
                      <span>Total Aset Investasi</span>
                      <span className="font-mono text-blue-600">{formatterIDR.format(balanceSheetData.investmentAssets)}</span>
                    </div>
                  </div>
                </div>

                {/* Aset Tetap & Ekuitas Properti KPR */}
                <div>
                  <p className="font-bold text-slate-700 uppercase text-[11px] mb-2 border-b pb-1">
                    D. Aset Tetap &amp; Ekuitas Properti KPR
                  </p>
                  <div className="space-y-2 pl-2 text-slate-600">
                    {syncedFixedAssets.length === 0 ? (
                      <div className="text-[11px] text-slate-400 italic">
                        Belum ada aset tetap atau properti KPR tercatat.
                      </div>
                    ) : (
                      syncedFixedAssets.map((fa, index) => {
                        const val = calculateFixedAssetValuation(fa, debts);
                        const statusText = fa.isKprLinked
                          ? val.isPaidOff
                            ? 'Lunas · 100% Aset Tetap'
                            : `KPR ${val.ownershipPct.toFixed(1)}% lunas`
                          : fa.category;
                        return (
                          <div key={fa.id ? `fa-${fa.id}-${index}` : `fa-${index}`} className="flex justify-between items-start gap-2">
                            <div className="min-w-0">
                              <span className="block text-slate-700 font-medium truncate">
                                {fa.name} ({statusText})
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono tabular-nums block">
                                Basis {formatterIDR.format(val.basisValue)} · Penyesuaian{' '}
                                {val.totalNetValueChange >= 0 ? '+' : ''}
                                {formatterIDR.format(val.totalNetValueChange)}
                              </span>
                            </div>
                            <span className="font-mono tabular-nums font-semibold shrink-0">
                              {formatterIDR.format(val.currentBookValue)}
                            </span>
                          </div>
                        );
                      })
                    )}
                    <div className="flex justify-between font-bold text-slate-800 border-t pt-1 mt-1">
                      <span>Total Nilai Buku Aset Tetap</span>
                      <span className="font-mono tabular-nums text-emerald-700">
                        {formatterIDR.format(balanceSheetData.fixedAssetsValue)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* KOMBINASI INVESTASI & ASET TETAP */}
                <div className="p-2.5 bg-blue-50/70 rounded-lg border border-blue-200/80 flex justify-between items-center text-xs font-bold text-blue-900">
                  <span>Kombinasi Portofolio Investasi &amp; Aset Tetap</span>
                  <span className="font-mono tabular-nums">
                    {formatterIDR.format(balanceSheetData.combinedInvestmentAndFixedAssets)}
                  </span>
                </div>

                {/* TOTAL ASET */}
                <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200 flex justify-between items-center font-black text-sm text-emerald-900 mt-4">
                  <span>TOTAL ASET (HARTA)</span>
                  <span className="font-mono text-base">{formatterIDR.format(balanceSheetData.totalAssets)}</span>
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: KEWAJIBAN & EKUITAS (LIABILITIES & EQUITY) */}
            <div className="space-y-6">
              {/* KEWAJIBAN / UTANG */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
                  <h3 className="font-extrabold text-xs uppercase tracking-wider text-rose-400">
                    2. KEWAJIBAN / UTANG (LIABILITIES)
                  </h3>
                  <span className="text-[10px] text-slate-400">Sisi Pasiva (Liabilitas)</span>
                </div>

                <div className="p-4 space-y-3 text-xs">
                  <div className="space-y-1.5 text-slate-600">
                    <div className="flex justify-between">
                      <span>Penggunaan Limit Kartu Kredit & Paylater</span>
                      <span className="font-mono font-semibold text-rose-600">
                        {formatterIDR.format(balanceSheetData.creditCardPaylaterBills)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Pinjaman Bank / Personal / KPR</span>
                      <span className="font-mono font-semibold text-rose-600">
                        {formatterIDR.format(balanceSheetData.activeDebtsBalance)}
                      </span>
                    </div>
                  </div>

                  <div className="p-3 bg-rose-50 rounded-lg border border-rose-200 flex justify-between items-center font-black text-xs text-rose-900 mt-2">
                    <span>TOTAL KEWAJIBAN (UTANG)</span>
                    <span className="font-mono text-sm">{formatterIDR.format(balanceSheetData.totalLiabilities)}</span>
                  </div>
                </div>
              </div>

              {/* EKUITAS / MODAL */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
                  <h3 className="font-extrabold text-xs uppercase tracking-wider text-blue-400">
                    3. EKUITAS / KEKAYAAN BERSIH (EQUITY)
                  </h3>
                  <span className="text-[10px] text-slate-400">Sisi Pasiva (Modal)</span>
                </div>

                <div className="p-4 space-y-3 text-xs">
                  <div className="space-y-1.5 text-slate-600">
                    <div className="flex justify-between">
                      <span>Kekayaan Bersih Terakumulasi (Net Worth)</span>
                      <span className="font-mono font-bold text-blue-600">
                        {formatterIDR.format(balanceSheetData.equity)}
                      </span>
                    </div>
                  </div>

                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-200 flex justify-between items-center font-black text-xs text-blue-900 mt-2">
                    <span>TOTAL EKUITAS</span>
                    <span className="font-mono text-sm">{formatterIDR.format(balanceSheetData.equity)}</span>
                  </div>
                </div>
              </div>

              {/* TOTAL KEWAJIBAN + EKUITAS */}
              <div className="p-4 bg-slate-900 text-white rounded-xl shadow-md flex justify-between items-center font-black text-sm">
                <span>TOTAL KEWAJIBAN + EKUITAS</span>
                <span className="font-mono text-emerald-400 text-base">
                  {formatterIDR.format(balanceSheetData.totalLiabilities + balanceSheetData.equity)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* VIEW 4: BUDGET VS REALISASI (EKSPERIMEN) */}
      {activeReport === 'budget-realization' && (
        <div className="space-y-6 animate-fadeIn">
          {/* Summary Banner */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-1">
              <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Total Batas Anggaran</p>
              <p className="text-base font-black text-slate-800 font-mono">
                {formatterIDR.format(overallBudgetSummary.totalBudget)}
              </p>
              <p className="text-[10px] text-slate-400">Target Batas Pengeluaran Bulan Ini</p>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-1">
              <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Realisasi Pengeluaran</p>
              <p className="text-base font-black text-rose-600 font-mono">
                {formatterIDR.format(overallBudgetSummary.totalActual)}
              </p>
              <p className="text-[10px] text-slate-400">Total Pengeluaran Aktual Terjadi</p>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-1">
              <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Sisa Varian (Penghematan)</p>
              <p
                className={`text-base font-black font-mono ${
                  overallBudgetSummary.totalVariance >= 0 ? 'text-emerald-600' : 'text-rose-600'
                }`}
              >
                {overallBudgetSummary.totalVariance >= 0 ? '+' : ''}{formatterIDR.format(overallBudgetSummary.totalVariance)}
              </p>
              <p className="text-[10px] text-slate-400">
                {overallBudgetSummary.totalVariance >= 0 ? 'Surplus / Sisa Anggaran' : 'Over Budget (Sebut Defisit)'}
              </p>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-1">
              <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">% Penyerapan Anggaran</p>
              <p
                className={`text-base font-black font-mono ${
                  overallBudgetSummary.overallUsage > 100
                    ? 'text-rose-600'
                    : overallBudgetSummary.overallUsage >= 90
                    ? 'text-amber-600'
                    : 'text-emerald-600'
                }`}
              >
                {overallBudgetSummary.overallUsage.toFixed(1)}%
              </p>
              <p className="text-[10px] text-slate-400">Tingkat Efisiensi Keseluruhan</p>
            </div>
          </div>

          {/* RECHARTS VISUALIZATION CHARTS */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* CHART 1: PERBANDINGAN KATEGORI ANGGARAN (TARGET VS REALISASI) */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                    <BarChart3 className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-slate-800 text-xs uppercase tracking-wider">
                      Perbandingan Kategori Anggaran (Budget vs Realisasi)
                    </h3>
                    <p className="text-[11px] text-slate-400 font-medium">
                      Target batas anggaran vs realisasi pengeluaran per kategori
                    </p>
                  </div>
                </div>
                <span className="text-[10px] bg-blue-50 text-blue-600 px-2.5 py-1 rounded-full font-extrabold uppercase">
                  Recharts Bar
                </span>
              </div>

              {budgetVsRealizationChartData.length === 0 ? (
                <div className="h-72 flex flex-col items-center justify-center text-center p-6 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                  <BarChart3 className="h-10 w-10 text-slate-300 mb-2" />
                  <p className="text-xs font-bold text-slate-500">Belum Ada Kategori Anggaran</p>
                </div>
              ) : (
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={budgetVsRealizationChartData} margin={{ top: 15, right: 15, left: -10, bottom: 25 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis
                        dataKey="category"
                        tick={{ fill: '#64748b', fontSize: 10, fontWeight: 'bold' }}
                        axisLine={{ stroke: '#e2e8f0' }}
                        tickLine={false}
                        interval={0}
                        angle={-15}
                        textAnchor="end"
                      />
                      <YAxis
                        tickFormatter={(val) => (val >= 1000000 ? `${(val / 1000000).toFixed(1)}M` : `${(val / 1000).toFixed(0)}K`)}
                        tick={{ fill: '#64748b', fontSize: 10 }}
                        axisLine={{ stroke: '#e2e8f0' }}
                        tickLine={false}
                      />
                      <Tooltip
                        formatter={(val: number, name: string) => [formatterIDR.format(Number(val)), name]}
                        contentStyle={{
                          backgroundColor: '#ffffff',
                          borderRadius: '12px',
                          border: '1px solid #e2e8f0',
                          color: '#1e293b',
                          fontSize: '12px',
                          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                          fontWeight: 'bold',
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px', fontWeight: 'bold', paddingTop: '8px' }} />
                      <Bar dataKey="Target Anggaran" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="Realisasi Pengeluaran" fill="#e11d48" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* CHART 2: TREN PENGELUARAN BULANAN (6 BULAN TERAKHIR) */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                    <TrendingUp className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-slate-800 text-xs uppercase tracking-wider">
                      Grafik Tren Pengeluaran Bulanan (6 Bulan)
                    </h3>
                    <p className="text-[11px] text-slate-400 font-medium">
                      Tren historis pengeluaran dan pemasukan dari waktu ke waktu
                    </p>
                  </div>
                </div>
                <span className="text-[10px] bg-emerald-50 text-emerald-600 px-2.5 py-1 rounded-full font-extrabold uppercase">
                  Recharts Line
                </span>
              </div>

              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthlySpendingTrend} margin={{ top: 15, right: 15, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis
                      dataKey="monthLabel"
                      tick={{ fill: '#64748b', fontSize: 11, fontWeight: 'bold' }}
                      axisLine={{ stroke: '#e2e8f0' }}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={(val) => (val >= 1000000 ? `${(val / 1000000).toFixed(1)}M` : `${(val / 1000).toFixed(0)}K`)}
                      tick={{ fill: '#64748b', fontSize: 10 }}
                      axisLine={{ stroke: '#e2e8f0' }}
                      tickLine={false}
                    />
                    <Tooltip
                      formatter={(val: number, name: string) => [formatterIDR.format(Number(val)), name]}
                      contentStyle={{
                        backgroundColor: '#ffffff',
                        borderRadius: '12px',
                        border: '1px solid #e2e8f0',
                        color: '#1e293b',
                        fontSize: '12px',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                        fontWeight: 'bold',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px', fontWeight: 'bold', paddingTop: '8px' }} />
                    <Line
                      type="monotone"
                      dataKey="Pengeluaran"
                      name="Pengeluaran"
                      stroke="#e11d48"
                      strokeWidth={3}
                      dot={{ r: 4, fill: '#e11d48' }}
                      activeDot={{ r: 6 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="Pemasukan"
                      name="Pemasukan"
                      stroke="#10b981"
                      strokeWidth={3}
                      dot={{ r: 4, fill: '#10b981' }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Search bar */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Cari kategori anggaran..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-800"
              />
            </div>
          </div>

          {/* Comparative Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-extrabold text-slate-800 text-xs uppercase tracking-wider">
                Laporan Eksperimen: Perbandingan Budget vs Realisasi Pengeluaran
              </h3>
              <span className="text-[10px] text-slate-400 font-mono">Bulan Berjalan</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-600 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                    <th className="p-3">Kategori</th>
                    <th className="p-3 text-right">Anggaran (Budget)</th>
                    <th className="p-3 text-right">Realisasi (Actual)</th>
                    <th className="p-3 text-right">Varian (Sisa)</th>
                    <th className="p-3 text-center">Progress Penyerapan</th>
                    <th className="p-3 text-center">Status Varian</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {budgetVsRealization.map((item, index) => (
                    <tr key={item.id ? `bvr-${item.id}-${index}` : `bvr-${item.category}-${index}`} className="hover:bg-slate-50 transition-colors font-medium text-slate-800">
                      <td className="p-3 font-extrabold text-slate-800">{item.category}</td>
                      <td className="p-3 text-right font-mono font-bold text-slate-700">
                        {formatterIDR.format(item.budgetLimit)}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-rose-600">
                        {formatterIDR.format(item.actualSpending)}
                      </td>
                      <td
                        className={`p-3 text-right font-mono font-extrabold ${
                          item.variance >= 0 ? 'text-emerald-600' : 'text-rose-600'
                        }`}
                      >
                        {item.variance >= 0 ? '+' : ''}{formatterIDR.format(item.variance)}
                      </td>
                      <td className="p-3 w-48">
                        <div className="space-y-1">
                          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-200">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${
                                item.usagePercent > 100
                                  ? 'bg-rose-600'
                                  : item.usagePercent >= 90
                                  ? 'bg-amber-500'
                                  : 'bg-emerald-500'
                              }`}
                              style={{ width: `${Math.min(100, item.usagePercent)}%` }}
                            />
                          </div>
                          <p className="text-[10px] text-center font-mono font-bold text-slate-500">
                            {item.usagePercent.toFixed(1)}%
                          </p>
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        <span
                          className={`px-2.5 py-1 rounded-md text-[10px] font-extrabold uppercase border ${item.statusBg}`}
                        >
                          {item.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      {activeReport === 'advanced-analytics' && (
        <div className="space-y-6 animate-fadeIn">
          <MonthlyExpenseD3TrendChart transactions={transactions} />

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="font-black text-slate-800 text-lg mb-1">Analisis & Prediksi Lanjutan</h3>
            <p className="text-xs font-medium text-slate-500 mb-6">Wawasan berbasis data historis untuk proyeksi kas, tren, dan intensitas pengeluaran harian.</p>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Proyeksi Saldo 3 Bulan */}
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 shadow-inner">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp className="h-5 w-5 text-blue-600" />
                  <h4 className="font-bold text-slate-700 text-sm">Proyeksi Saldo Kas Likuid (3 Bulan)</h4>
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={projectionData} margin={{ top: 10, right: 10, left: 20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#64748b', fontWeight: 'bold' }} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={(val) => `Rp${(val / 1000000).toFixed(1)}Jt`} tick={{ fontSize: 10, fill: '#64748b', fontWeight: 'bold' }} axisLine={false} tickLine={false} width={70} />
                      <Tooltip formatter={(val: number) => formatterIDR.format(val)} cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                      <Line type="monotone" dataKey="Saldo" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, fill: '#3b82f6', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6, fill: '#2563eb' }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-[10px] text-slate-500 mt-3 text-center">Berdasarkan rata-rata Arus Kas Bersih 3 bulan terakhir.</p>
              </div>

              {/* YoY Comparison */}
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 shadow-inner">
                <div className="flex items-center gap-2 mb-4">
                  <BarChart3 className="h-5 w-5 text-indigo-600" />
                  <h4 className="font-bold text-slate-700 text-sm">Perbandingan Pengeluaran YoY (Bulan Sama)</h4>
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={yoyComparisonData} margin={{ top: 10, right: 10, left: 20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b', fontWeight: 'bold' }} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={(val) => `Rp${(val / 1000000).toFixed(1)}Jt`} tick={{ fontSize: 10, fill: '#64748b', fontWeight: 'bold' }} axisLine={false} tickLine={false} width={70} />
                      <Tooltip formatter={(val: number) => formatterIDR.format(val)} cursor={{ fill: '#f1f5f9' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', paddingTop: '10px' }} />
                      <Bar dataKey="Tahun Ini" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Tahun Lalu" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-[10px] text-slate-500 mt-3 text-center">Top 5 kategori pengeluaran bulan ini vs bulan yang sama tahun lalu.</p>
              </div>
            </div>

            {/* Heatmap Calendar */}
            <div className="mt-6 bg-slate-50 p-5 rounded-2xl border border-slate-200 shadow-inner">
              <div className="flex items-center gap-2 mb-4">
                <Calendar className="h-5 w-5 text-rose-500" />
                <h4 className="font-bold text-slate-700 text-sm">Intensitas Pengeluaran Harian (30 Hari Terakhir)</h4>
              </div>
              
              <div className="bg-white p-4 rounded-xl border border-slate-200">
                <div className="flex flex-wrap gap-1.5 justify-center md:justify-start">
                  {heatmapData.data.map((day, i) => {
                    let bgClass = "bg-slate-100"; // default empty
                    if (day.amount > 0) {
                      const ratio = day.amount / (heatmapData.maxExpense || 1);
                      if (ratio > 0.75) bgClass = "bg-rose-600";
                      else if (ratio > 0.5) bgClass = "bg-rose-500";
                      else if (ratio > 0.25) bgClass = "bg-rose-400";
                      else bgClass = "bg-rose-300";
                    }
                    return (
                      <div 
                        key={i} 
                        className={`w-6 h-6 md:w-8 md:h-8 rounded-sm ${bgClass} cursor-help transition-all hover:ring-2 ring-slate-400 ring-offset-2`}
                        title={`${day.label}: ${formatterIDR.format(day.amount)}`}
                      ></div>
                    );
                  })}
                </div>
                
                <div className="mt-6 flex items-center justify-end gap-2 text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                  <span>Tidak Ada / Sedikit</span>
                  <div className="flex gap-1 mx-2">
                    <div className="w-4 h-4 rounded-sm bg-slate-100"></div>
                    <div className="w-4 h-4 rounded-sm bg-rose-300"></div>
                    <div className="w-4 h-4 rounded-sm bg-rose-400"></div>
                    <div className="w-4 h-4 rounded-sm bg-rose-500"></div>
                    <div className="w-4 h-4 rounded-sm bg-rose-600"></div>
                  </div>
                  <span>Banyak</span>
                </div>
              </div>
            </div>
            
          </div>
        </div>
      )}

    </div>
  );
};
