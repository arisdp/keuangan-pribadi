import React from 'react';
import { Account, Debt, FixedAsset, FixedAssetAdjustment, InvestmentAsset, Transaction } from '../types';
import { FormattedNumberInput } from './FormattedNumberInput';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Legend, BarChart, Bar } from 'recharts';
import { TrendingUp, Wallet, ArrowUpRight, ArrowDownLeft, Info, Activity, Landmark, Edit2, Check, X, BarChart2, Layers, Plus, Calculator, RefreshCw, Coins, Sparkles, History, FileSpreadsheet, FileText, Download, DollarSign, Percent, Gift, Target, AlertTriangle } from 'lucide-react';
import { AIDiversificationModal } from './AIDiversificationModal';
import { PriceHistoryModal } from './PriceHistoryModal';
import { InvestmentSimulationCalculator } from './InvestmentSimulationCalculator';
import { DividendReinvestmentModal } from './DividendReinvestmentModal';
import { InvestmentGoalSection } from './InvestmentGoalSection';
import { InflationPurchasingPowerCalculator } from './InflationPurchasingPowerCalculator';
import { InvestmentRoiD3Chart } from './InvestmentRoiD3Chart';
import { FixedAssetCreatePayload, FixedAssetSection } from './FixedAssetSection';
import { exportInvestmentsToCSV, exportInvestmentsToPDF } from '../utils/exportInvestment';
import {
  applyAccountBalanceChange,
  calculateCombinedPortfolioWealth,
  calculateFixedAssetValuation,
  getLiquidAccounts,
  getTransactionAccountDelta,
  parseLocalDate,
  syncKprDebtsToFixedAssets,
  toLocalYYYYMMDD,
} from '../utils/accountingEngine';
import { showToast } from '../utils/toast';

interface InvestmentTabProps {
  investments: InvestmentAsset[];
  transactions: Transaction[];
  accounts?: Account[];
  fixedAssets?: FixedAsset[];
  debts?: Debt[];
  onUpdateInvestment?: (id: string, updatedFields: Partial<InvestmentAsset>) => void;
  onAddFixedAsset?: (payload: FixedAssetCreatePayload) => boolean | void;
  onUpdateFixedAsset?: (id: string, updated: Partial<FixedAsset>) => void;
  onDeleteFixedAsset?: (id: string) => void;
  onAddFixedAssetAdjustment?: (assetId: string, adjustment: Omit<FixedAssetAdjustment, 'id'>) => void;
  onDeleteFixedAssetAdjustment?: (assetId: string, adjustmentId: string) => void;
  onSyncFixedAssetDepreciation?: (assetId: string) => void;
  onAddTransaction?: (tx: Omit<Transaction, 'id'> & {
    linkedInvestmentId?: string;
    linkedInvestmentAction?: 'buy' | 'sell';
    unitPrice?: number;
    units?: number;
    unitName?: string;
    newInvestmentDetails?: {
      name: string;
      category: string;
      unitPrice?: number;
      units?: number;
      unitName?: string;
    };
  }) => boolean | void;
}

export const InvestmentTab: React.FC<InvestmentTabProps> = ({
  investments = [],
  transactions = [],
  accounts = [],
  fixedAssets = [],
  debts = [],
  onUpdateInvestment,
  onAddFixedAsset,
  onUpdateFixedAsset,
  onDeleteFixedAsset,
  onAddFixedAssetAdjustment,
  onDeleteFixedAssetAdjustment,
  onSyncFixedAssetDepreciation,
  onAddTransaction,
}) => {
  const formatterIDR = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  });

  // New Modals State
  const [isAiModalOpen, setIsAiModalOpen] = React.useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = React.useState(false);
  const [isSimulationModalOpen, setIsSimulationModalOpen] = React.useState(false);
  const [isDripModalOpen, setIsDripModalOpen] = React.useState(false);
  const [dripInitialAssetId, setDripInitialAssetId] = React.useState<string | null>(null);

  // Scope & Pie Chart Allocation View Mode
  const [portfolioScope, setPortfolioScope] = React.useState<'all' | 'financial' | 'fixed'>('all');
  const [pieViewMode, setPieViewMode] = React.useState<'category' | 'asset' | 'combined'>('category');

  // Edit State
  const [editingAssetId, setEditingAssetId] = React.useState<string | null>(null);
  const [editName, setEditName] = React.useState('');
  const [editCategory, setEditCategory] = React.useState('');
  const [editUnits, setEditUnits] = React.useState<number>(1);
  const [editUnitName, setEditUnitName] = React.useState<string>('Gram');
  const [editPurchaseUnitPrice, setEditPurchaseUnitPrice] = React.useState<number>(0);
  const [editCurrentUnitPrice, setEditCurrentUnitPrice] = React.useState<number>(0);
  const [editDividendsOrInterest, setEditDividendsOrInterest] = React.useState<number>(0);

  // Quick Price Update State
  const [updatePriceAssetId, setUpdatePriceAssetId] = React.useState<string | null>(null);
  const [quickCurrentPrice, setQuickCurrentPrice] = React.useState<number>(0);

  // Quick Dividend / Interest Logger State
  const [logDividendAssetId, setLogDividendAssetId] = React.useState<string | null>(null);
  const [logDividendAmount, setLogDividendAmount] = React.useState<number>(0);
  const [logDividendNote, setLogDividendNote] = React.useState<string>('Bagi Hasil / Dividen');
  const [logDividendAccountId, setLogDividendAccountId] = React.useState<string>('');

  // Selected asset for Price History Line Chart
  const [selectedPriceChartAssetId, setSelectedPriceChartAssetId] = React.useState<string>('all');
  const [lineChartMode, setLineChartMode] = React.useState<'unitPrice' | 'valuation'>('unitPrice');

  // Top Up / Buy More (DCA - Dollar Cost Averaging) State
  const [topUpAssetId, setTopUpAssetId] = React.useState<string | null>(null);
  const [topUpUnits, setTopUpUnits] = React.useState<number>(1);
  const [topUpUnitPrice, setTopUpUnitPrice] = React.useState<number>(0);
  const [topUpAccountId, setTopUpAccountId] = React.useState<string>('');

  const liquidCashAccounts = React.useMemo(() => getLiquidAccounts(accounts), [accounts]);

  // Helper function to get default unit name by category
  const getDefaultUnitName = (cat: string) => {
    switch (cat) {
      case 'Logam Mulia (Emas)': return 'Gram';
      case 'Saham': return 'Lembar';
      case 'Reksadana': return 'Unit';
      case 'Cryptocurrency': return 'Koin';
      case 'Bisnis Riil': return 'Paket';
      default: return 'Unit';
    }
  };

  // 1. Calculate Total Invested Portfolio & Total Modal Awal (Cost Basis)
  const totalPortfolioValue = investments.reduce((sum, inv) => sum + inv.balance, 0);
  const totalInitialCapital = investments.reduce((sum, inv) => sum + (inv.initialCapital !== undefined ? inv.initialCapital : inv.balance), 0);
  
  // Total Growth Calculation
  const totalGrowthAmount = totalPortfolioValue - totalInitialCapital;
  const growthPercentage = totalInitialCapital > 0 ? (totalGrowthAmount / totalInitialCapital) * 100 : 0;

  // 1b. Total Dividends / Interest & True Yield Calculation
  const totalDividendsOrInterest = investments.reduce((sum, inv) => sum + (inv.dividendsOrInterest || 0), 0);
  const trueTotalReturnAmount = totalGrowthAmount + totalDividendsOrInterest;
  const totalDividendYieldPct = totalInitialCapital > 0 ? (totalDividendsOrInterest / totalInitialCapital) * 100 : 0;
  const totalTrueYieldPct = totalInitialCapital > 0 ? (trueTotalReturnAmount / totalInitialCapital) * 100 : 0;

  // 2. Group by Category & Asset for Pie Chart
  const categoryAllocation = investments.reduce((acc: { [key: string]: number }, inv) => {
    acc[inv.category] = (acc[inv.category] || 0) + inv.balance;
    return acc;
  }, {});

  const pieDataCategory = Object.keys(categoryAllocation).map((cat) => ({
    name: cat,
    value: categoryAllocation[cat],
  })).sort((a, b) => b.value - a.value);

  const pieDataAsset = investments
    .filter((inv) => inv.balance > 0)
    .map((inv) => ({
      name: inv.name,
      value: inv.balance,
      category: inv.category,
    }))
    .sort((a, b) => b.value - a.value);

  const syncedFixedAssets = React.useMemo(
    () => syncKprDebtsToFixedAssets(fixedAssets, debts),
    [fixedAssets, debts]
  );

  const combinedWealth = React.useMemo(
    () => calculateCombinedPortfolioWealth(investments, syncedFixedAssets, debts),
    [investments, syncedFixedAssets, debts]
  );

  const pieDataCombined = React.useMemo(() => {
    const map: Record<string, number> = {};
    investments.forEach((inv) => {
      if (inv.balance > 0) {
        const key = `Investasi · ${inv.category}`;
        map[key] = (map[key] || 0) + inv.balance;
      }
    });
    syncedFixedAssets.forEach((asset) => {
      const bookVal = calculateFixedAssetValuation(asset, debts).currentBookValue;
      if (bookVal > 0) {
        const key = asset.isKprLinked
          ? `Aset KPR · ${asset.name}`
          : `Aset Tetap · ${asset.category}`;
        map[key] = (map[key] || 0) + bookVal;
      }
    });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [investments, syncedFixedAssets, debts]);

  const pieData =
    pieViewMode === 'combined'
      ? pieDataCombined
      : pieViewMode === 'category'
      ? pieDataCategory
      : pieDataAsset;
  const pieTotalValue =
    pieViewMode === 'combined' ? combinedWealth.totalCombinedWealth : totalPortfolioValue;

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#0d9488'];

  // 3. Filter Investment Transactions from Jurnal
  const investmentTxs = transactions.filter(
    (tx) => tx.type === 'investment' || tx.category === 'Penjualan Investasi'
  );

  // --- Calculate Portfolio Growth Trend ---
  const formatCompactIDR = (value: number) => {
    if (value >= 1000000000) {
      return `Rp ${(value / 1000000000).toFixed(1)} M`;
    }
    if (value >= 1000000) {
      return `Rp ${(value / 1000000).toFixed(1)} Jt`;
    }
    if (value >= 1000) {
      return `Rp ${(value / 1000).toFixed(0)} Rb`;
    }
    return `Rp ${value}`;
  };

  const uniqueDates = Array.from(new Set([
    ...investments.map(inv => inv.dateAdded),
    ...investmentTxs.map(tx => tx.date)
  ])).sort();

  const todayStr = toLocalYYYYMMDD();
  if (uniqueDates.length === 0) {
    uniqueDates.push(todayStr);
  } else if (!uniqueDates.includes(todayStr)) {
    uniqueDates.push(todayStr);
  }
  uniqueDates.sort();

  interface RunningAsset {
    id: string;
    name: string;
    category: string;
    balance: number;
    initialCapital: number;
    dateAdded: string;
  }

  interface AssetSnapshot {
    name: string;
    category: string;
    balance: number;
  }

  const runningAssets: RunningAsset[] = investments.map(inv => ({
    id: inv.id,
    name: inv.name,
    category: inv.category,
    balance: inv.balance,
    initialCapital: inv.initialCapital !== undefined ? inv.initialCapital : inv.balance,
    dateAdded: inv.dateAdded
  }));

  const trendDataMap: { [date: string]: { totalValue: number; totalCapital: number; assetsSnapshot: AssetSnapshot[] } } = {};

  for (let i = uniqueDates.length - 1; i >= 0; i--) {
    const date = uniqueDates[i];
    
    const totalValue = runningAssets.reduce((sum, asset) => {
      return date >= asset.dateAdded ? sum + asset.balance : sum;
    }, 0);

    const totalCapital = runningAssets.reduce((sum, asset) => {
      return date >= asset.dateAdded ? sum + asset.initialCapital : sum;
    }, 0);

    const assetsSnapshot = runningAssets
      .filter(asset => date >= asset.dateAdded && asset.balance > 0)
      .map(asset => ({
        name: asset.name,
        category: asset.category,
        balance: asset.balance,
      }))
      .sort((a, b) => b.balance - a.balance);

    trendDataMap[date] = { totalValue, totalCapital, assetsSnapshot };

    const txsOnDate = investmentTxs.filter(tx => tx.date === date);
    for (const tx of txsOnDate) {
      const assetIndex = runningAssets.findIndex(asset => 
        asset.id === tx.linkedInvestmentId || 
        tx.description.toLowerCase().includes(asset.name.toLowerCase()) ||
        asset.name.toLowerCase().includes(tx.description.toLowerCase())
      );

      if (assetIndex > -1) {
        const asset = runningAssets[assetIndex];
        if (tx.type === 'investment') {
          asset.balance = Math.max(0, asset.balance - tx.amount);
          asset.initialCapital = Math.max(0, asset.initialCapital - tx.amount);
        } else {
          asset.balance = asset.balance + tx.amount;
          asset.initialCapital = asset.initialCapital + tx.amount;
        }
      }
    }
  }

  const trendChartData = uniqueDates.map(date => {
    const { totalValue, totalCapital, assetsSnapshot } = trendDataMap[date];
    const dateObj = parseLocalDate(date) || new Date();
    const displayDate = dateObj.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short'
    });
    const fullDate = dateObj.toLocaleDateString('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    return {
      date,
      displayDate,
      fullDate,
      'Nilai Portofolio': totalValue,
      'Modal Investasi': totalCapital,
      'Keuntungan': totalValue - totalCapital,
      assetsSnapshot,
    };
  });

  if (trendChartData.length === 1) {
    const singlePoint = trendChartData[0];
    const dateObj = parseLocalDate(singlePoint.date) || new Date();
    dateObj.setDate(dateObj.getDate() - 30);
    const prevDateStr = toLocalYYYYMMDD(dateObj);
    const prevDisplayDate = dateObj.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short'
    });
    const prevFullDate = dateObj.toLocaleDateString('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
    trendChartData.unshift({
      date: prevDateStr,
      displayDate: prevDisplayDate,
      fullDate: prevFullDate,
      'Nilai Portofolio': 0,
      'Modal Investasi': 0,
      'Keuntungan': 0,
      assetsSnapshot: []
    });
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const value = data['Nilai Portofolio'];
      const capital = data['Modal Investasi'];
      const profit = value - capital;
      const roi = capital > 0 ? (profit / capital) * 100 : 0;
      const assets = data.assetsSnapshot || [];
      const fullDate = data.fullDate || label;

      return (
        <div className="bg-slate-900/95 backdrop-blur-md border border-slate-800 text-white p-4 rounded-xl shadow-2xl text-xs space-y-3 font-medium min-w-[280px]">
          <div className="border-b border-slate-800 pb-2">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Detail Portofolio Bulanan</p>
            <p className="text-[12px] font-bold text-slate-100 mt-0.5">{fullDate}</p>
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between items-center gap-6">
              <span className="text-slate-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                Nilai Portofolio
              </span>
              <strong className="font-mono text-blue-400 text-[12px]">{formatterIDR.format(value)}</strong>
            </div>
            <div className="flex justify-between items-center gap-6">
              <span className="text-slate-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-slate-400 inline-block" />
                Modal Investasi
              </span>
              <strong className="font-mono text-slate-300">{formatterIDR.format(capital)}</strong>
            </div>
            <div className="flex justify-between items-center gap-6 border-t border-slate-800/80 pt-2 mt-1">
              <span className="text-slate-400 font-semibold">Imbal Hasil (ROI)</span>
              <div className="text-right">
                <strong className={`font-mono text-[12px] block ${profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {profit >= 0 ? '+' : ''}{formatterIDR.format(profit)}
                </strong>
                <span className={`text-[10px] font-bold block ${profit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {profit >= 0 ? '+' : ''}{roi.toFixed(2)}%
                </span>
              </div>
            </div>
          </div>

          {assets.length > 0 && (
            <div className="border-t border-slate-800/80 pt-2.5 space-y-1.5">
              <p className="text-[9px] uppercase tracking-wider text-slate-400 font-bold mb-1">Rincian Aset Terdaftar</p>
              <div className="max-h-28 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
                {assets.map((asset: any, idx: number) => {
                  const assetShare = value > 0 ? (asset.balance / value) * 100 : 0;
                  return (
                    <div key={idx} className="flex justify-between items-center text-[11px] gap-2">
                      <div className="flex flex-col min-w-0">
                        <span className="text-slate-200 font-semibold truncate">{asset.name}</span>
                        <span className="text-[9px] text-slate-400/85 truncate">{asset.category}</span>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-mono text-slate-200 block">{formatterIDR.format(asset.balance)}</span>
                        <span className="text-[9px] text-slate-400 font-bold block font-mono">{assetShare.toFixed(1)}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  // Start Edit Asset
  const startEditing = (inv: InvestmentAsset) => {
    const qty = inv.quantity ?? inv.units ?? 1;
    const initialCap = inv.initialCapital !== undefined ? inv.initialCapital : inv.balance;
    const avgBuyPrice = inv.purchaseUnitPrice || (initialCap / qty);
    const currPrice = inv.unitPrice ?? inv.currentUnitPrice ?? (inv.balance / qty);

    setEditingAssetId(inv.id);
    setEditName(inv.name);
    setEditCategory(inv.category);
    setEditUnits(qty);
    setEditUnitName(inv.unitName || getDefaultUnitName(inv.category));
    setEditPurchaseUnitPrice(avgBuyPrice);
    setEditCurrentUnitPrice(currPrice);
  };

  const saveEdit = () => {
    if (editingAssetId && onUpdateInvestment) {
      const totalCapital = editUnits * editPurchaseUnitPrice;
      const totalValuation = editUnits * editCurrentUnitPrice;

      onUpdateInvestment(editingAssetId, {
        name: editName,
        category: editCategory,
        quantity: editUnits,
        units: editUnits,
        unitName: editUnitName,
        purchaseUnitPrice: editPurchaseUnitPrice,
        unitPrice: editCurrentUnitPrice,
        currentUnitPrice: editCurrentUnitPrice,
        initialCapital: totalCapital,
        balance: totalValuation,
      });
      setEditingAssetId(null);
    }
  };

  // Start Quick Price Update (Penyesuaian Harga Satuan Hari Ini)
  const startQuickPriceUpdate = (inv: InvestmentAsset) => {
    const qty = inv.quantity ?? inv.units ?? 1;
    const currPrice = inv.unitPrice ?? inv.currentUnitPrice ?? (inv.balance / qty);

    setUpdatePriceAssetId(inv.id);
    setQuickCurrentPrice(currPrice);
  };

  const saveQuickPriceUpdate = () => {
    if (updatePriceAssetId && onUpdateInvestment) {
      const inv = investments.find(i => i.id === updatePriceAssetId);
      if (inv) {
        const qty = inv.quantity ?? inv.units ?? 1;
        const newBalance = qty * quickCurrentPrice;

        onUpdateInvestment(updatePriceAssetId, {
          unitPrice: quickCurrentPrice,
          currentUnitPrice: quickCurrentPrice,
          balance: newBalance,
        });
      }
      setUpdatePriceAssetId(null);
    }
  };

  // Start Top Up / Buy More (Perhitungan Pembelian Lagi / Average Buy Price DCA)
  const startTopUp = (inv: InvestmentAsset) => {
    const qty = inv.quantity ?? inv.units ?? 1;
    const currPrice = inv.unitPrice ?? inv.currentUnitPrice ?? (inv.balance / qty);

    setTopUpAssetId(inv.id);
    setTopUpUnits(1);
    setTopUpUnitPrice(currPrice);
    const defaultAcc = liquidCashAccounts.find((a) => a.type === 'bank' && a.currentBalance > 0) || liquidCashAccounts[0];
    setTopUpAccountId(defaultAcc?.id || '');
  };

  const saveTopUp = () => {
    if (!topUpAssetId) return;
    const inv = investments.find(i => i.id === topUpAssetId);
    if (!inv) return;

    const totalCost = Math.round((topUpUnits || 0) * (topUpUnitPrice || 0));
    if (topUpUnits <= 0 || topUpUnitPrice <= 0 || totalCost <= 0) {
      showToast({
        type: 'warning',
        title: 'Input Top Up Tidak Valid',
        message: 'Jumlah unit dan harga satuan beli harus lebih besar dari Rp 0.',
      });
      return;
    }

    if (onAddTransaction) {
      if (!topUpAccountId) {
        showToast({
          type: 'warning',
          title: 'Pilih Rekening Sumber Kas',
          message: 'Silakan pilih rekening bank/kas sumber dana pembelian aset ini.',
        });
        return;
      }
      const sourceAcc = liquidCashAccounts.find((a) => a.id === topUpAccountId);
      if (!sourceAcc || sourceAcc.currentBalance < totalCost) {
        showToast({
          type: 'error',
          title: 'Saldo Kas Tidak Mencukupi',
          message: `Saldo ${sourceAcc?.name || 'rekening'} tidak cukup untuk Top Up senilai ${formatterIDR.format(totalCost)}.`,
        });
        return;
      }

      const unitNameVal = inv.unitName || getDefaultUnitName(inv.category);
      const ok = onAddTransaction({
        date: toLocalYYYYMMDD(),
        accountId: topUpAccountId,
        type: 'investment',
        category: 'Investasi',
        description: `Top Up DCA ${inv.name} (${topUpUnits} ${unitNameVal})`,
        amount: totalCost,
        linkedInvestmentId: inv.id,
        linkedInvestmentAction: 'buy',
        unitPrice: topUpUnitPrice,
        units: topUpUnits,
        unitName: unitNameVal,
        newInvestmentDetails: {
          name: inv.name,
          category: inv.category,
          unitPrice: topUpUnitPrice,
          units: topUpUnits,
          unitName: unitNameVal,
        },
      });
      if (ok === false) return;
      showToast({
        type: 'success',
        title: 'Top Up Investasi Tercatat',
        message: `Pembelian ${topUpUnits} ${unitNameVal} ${inv.name} (${formatterIDR.format(totalCost)}) berhasil diposting ke Jurnal dan memotong saldo ${sourceAcc.name}.`,
      });
      setTopUpAssetId(null);
      return;
    }

    if (onUpdateInvestment) {
      const oldUnits = inv.quantity ?? inv.units ?? 1;
      const initialCap = inv.initialCapital !== undefined ? inv.initialCapital : inv.balance;
      const oldAvgBuyPrice = inv.purchaseUnitPrice || (initialCap / oldUnits);
      const currPrice = inv.unitPrice ?? inv.currentUnitPrice ?? (inv.balance / oldUnits);

      const newTotalUnits = oldUnits + topUpUnits;
      const newWeightedAvgBuyPrice = ((oldUnits * oldAvgBuyPrice) + (topUpUnits * topUpUnitPrice)) / newTotalUnits;
      const newTotalInitialCapital = newTotalUnits * newWeightedAvgBuyPrice;
      const newTotalBalance = newTotalUnits * currPrice;

      onUpdateInvestment(topUpAssetId, {
        quantity: newTotalUnits,
        units: newTotalUnits,
        purchaseUnitPrice: newWeightedAvgBuyPrice,
        initialCapital: newTotalInitialCapital,
        balance: newTotalBalance,
      });
      setTopUpAssetId(null);
    }
  };

  // Save Log Dividend / Interest
  const saveLogDividend = () => {
    if (!logDividendAssetId) return;
    const inv = investments.find(i => i.id === logDividendAssetId);
    if (!inv) return;

    if (!logDividendAmount || logDividendAmount <= 0) {
      showToast({
        type: 'warning',
        title: 'Nominal Dividen Tidak Valid',
        message: 'Masukkan jumlah imbal hasil / dividen yang lebih besar dari Rp 0.',
      });
      return;
    }

    if (onAddTransaction) {
      if (!logDividendAccountId) {
        showToast({
          type: 'warning',
          title: 'Pilih Rekening Tujuan Kas',
          message: 'Silakan pilih rekening bank/kas penerima dana dividen ini.',
        });
        return;
      }
      const targetAcc = liquidCashAccounts.find((a) => a.id === logDividendAccountId);
      const ok = onAddTransaction({
        date: toLocalYYYYMMDD(),
        accountId: logDividendAccountId,
        type: 'income',
        category: 'Hasil Investasi / Dividen',
        description: `${logDividendNote || 'Dividen / Bagi Hasil'}: ${inv.name}`,
        amount: logDividendAmount,
        linkedInvestmentId: inv.id,
      });
      if (ok === false) return;
      showToast({
        type: 'success',
        title: 'Dividen Tersinkronisasi ke Kas',
        message: `Penerimaan dividen ${inv.name} sebesar ${formatterIDR.format(logDividendAmount)} masuk ke ${targetAcc?.name || 'rekening'} dan Jurnal Transaksi.`,
      });
      setLogDividendAssetId(null);
      return;
    }

    if (onUpdateInvestment) {
      const currentDividends = inv.dividendsOrInterest || 0;
      const newDividendsTotal = currentDividends + logDividendAmount;
      onUpdateInvestment(logDividendAssetId, {
        dividendsOrInterest: newDividendsTotal
      });
      setLogDividendAssetId(null);
    }
  };

  // Category styles
  const getCategoryStyles = (category: string) => {
    switch (category) {
      case 'Saham':
        return 'bg-blue-50 text-blue-700 border-blue-100';
      case 'Reksadana':
        return 'bg-purple-50 text-purple-700 border-purple-100';
      case 'Logam Mulia (Emas)':
        return 'bg-amber-50 text-amber-700 border-amber-100';
      case 'Cryptocurrency':
        return 'bg-orange-50 text-orange-700 border-orange-100';
      case 'Bisnis Riil':
        return 'bg-emerald-50 text-emerald-700 border-emerald-100';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-100';
    }
  };

  // Category Performance
  const categoryPerformance = React.useMemo(() => {
    const performanceMap: {
      [category: string]: {
        name: string;
        initialCapital: number;
        currentValue: number;
        assetCount: number;
      };
    } = {};

    investments.forEach((inv) => {
      const category = inv.category;
      const initialCap = inv.initialCapital !== undefined ? inv.initialCapital : inv.balance;
      
      if (!performanceMap[category]) {
        performanceMap[category] = {
          name: category,
          initialCapital: 0,
          currentValue: 0,
          assetCount: 0,
        };
      }

      performanceMap[category].initialCapital += initialCap;
      performanceMap[category].currentValue += inv.balance;
      performanceMap[category].assetCount += 1;
    });

    return Object.values(performanceMap).map((perf) => {
      const gain = perf.currentValue - perf.initialCapital;
      const roi = perf.initialCapital > 0 ? (gain / perf.initialCapital) * 100 : 0;
      return {
        ...perf,
        gain,
        roi,
      };
    }).sort((a, b) => b.roi - a.roi);
  }, [investments]);

  return (
    <div id="investment-tab-content" className="space-y-6">
      {/* Top Action Toolbar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Coins className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          <span className="font-extrabold text-sm text-slate-800 dark:text-slate-100">
            Fitur Lanjutan Investasi
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* AI Diversification Button */}
          <button
            onClick={() => setIsAiModalOpen(true)}
            className="px-3.5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-extrabold text-xs rounded-xl shadow-sm transition flex items-center gap-1.5 cursor-pointer"
          >
            <Sparkles className="h-4 w-4" />
            Analisis Diversifikasi AI
          </button>

          {/* Price History Button */}
          <button
            onClick={() => setIsHistoryModalOpen(true)}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-extrabold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer"
          >
            <History className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            Riwayat Harga Unit
          </button>

          {/* Target Goals Jump Button */}
          <button
            onClick={() => {
              const el = document.getElementById('investment-goals-section');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }}
            className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:hover:bg-indigo-950/60 dark:text-indigo-300 font-extrabold text-xs rounded-xl border border-indigo-200 dark:border-indigo-800 transition flex items-center gap-1.5 cursor-pointer"
          >
            <Target className="h-4 w-4" />
            Target Investasi
          </button>

          {/* Inflation Calculator Jump Button */}
          <button
            onClick={() => {
              const el = document.getElementById('inflation-calculator-section');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }}
            className="px-3 py-2 bg-teal-50 hover:bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:hover:bg-teal-950/60 dark:text-teal-300 font-extrabold text-xs rounded-xl border border-teal-200 dark:border-teal-800 transition flex items-center gap-1.5 cursor-pointer"
          >
            <Calculator className="h-4 w-4" />
            Kalkulator Inflasi
          </button>

          {/* Simulation Calculator Button */}
          <button
            onClick={() => setIsSimulationModalOpen(true)}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-extrabold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer"
          >
            <Calculator className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            Kalkulator Simulasi
          </button>

          {/* Dividend Reinvestment (DRIP) Calculator Button */}
          <button
            onClick={() => {
              setDripInitialAssetId(investments[0]?.id || 'all');
              setIsDripModalOpen(true);
            }}
            className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-xs whitespace-nowrap shrink-0"
          >
            <RefreshCw className="h-4 w-4" />
            Kalkulator DRIP Dividen
          </button>

          {/* Export CSV */}
          <button
            onClick={() => exportInvestmentsToCSV(investments, syncedFixedAssets, debts)}
            className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:hover:bg-emerald-950/60 dark:text-emerald-300 font-extrabold text-xs rounded-xl border border-emerald-200 dark:border-emerald-800 transition flex items-center gap-1.5 cursor-pointer"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Ekspor CSV
          </button>

          {/* Export PDF */}
          <button
            onClick={() => exportInvestmentsToPDF(investments, 'investment-tab-content')}
            className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:hover:bg-rose-950/60 dark:text-rose-300 font-extrabold text-xs rounded-xl border border-rose-200 dark:border-rose-800 transition flex items-center gap-1.5 cursor-pointer"
          >
            <FileText className="h-4 w-4" />
            Ekspor PDF
          </button>
        </div>
      </div>

      {/* Portfolio Scope Switcher */}
      <div className="bg-white dark:bg-slate-900 p-2 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'all', label: 'Semua Kekayaan (Gabungan)' },
              { id: 'financial', label: `Investasi Finansial (${investments.length})` },
              { id: 'fixed', label: `Aset Tetap & KPR (${syncedFixedAssets.length})` },
            ] as const
          ).map((scope) => (
            <button
              key={scope.id}
              type="button"
              onClick={() => setPortfolioScope(scope.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                portfolioScope === scope.id
                  ? 'bg-slate-900 dark:bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {scope.label}
            </button>
          ))}
        </div>
        <div className="px-3 text-xs text-slate-500 dark:text-slate-400 font-medium">
          Kombinasi Kekayaan:{' '}
          <strong className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {formatterIDR.format(combinedWealth.totalCombinedWealth)}
          </strong>
        </div>
      </div>

      {/* Combined Wealth + Fixed Assets & KPR Section */}
      {(portfolioScope === 'all' || portfolioScope === 'fixed') && (
        <FixedAssetSection
          investments={investments}
          fixedAssets={syncedFixedAssets}
          debts={debts}
          accounts={accounts}
          onAddFixedAsset={onAddFixedAsset}
          onUpdateFixedAsset={onUpdateFixedAsset}
          onDeleteFixedAsset={onDeleteFixedAsset}
          onAddAdjustment={onAddFixedAssetAdjustment}
          onDeleteAdjustment={onDeleteFixedAssetAdjustment}
          onSyncAssetDepreciation={onSyncFixedAssetDepreciation}
          showCombinedBanner={true}
        />
      )}

      {portfolioScope !== 'fixed' && (
      <div className="space-y-6">
      {/* Upper Grid: Portfolio Summary & Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left: Financial Health / Summary */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Landmark className="h-5 w-5 text-blue-600" />
              <h3 className="font-semibold text-slate-800 text-sm uppercase tracking-wider">
                Ringkasan Portofolio Investasi
              </h3>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {/* Card 1: Nilai Saat Ini */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-1.5">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">
                  Total Nilai Portofolio (Valuasi)
                </span>
                <span className="text-2xl font-black text-slate-800 font-mono tracking-tight block">
                  {formatterIDR.format(totalPortfolioValue)}
                </span>
                <div className="flex justify-between items-center text-[10px] uppercase font-bold text-slate-500 pt-2 border-t border-slate-200/60">
                  <span>Total Modal Beli:</span>
                  <span className="font-mono text-slate-700">{formatterIDR.format(totalInitialCapital)}</span>
                </div>
              </div>

              {/* Card 2: Growth summary */}
              <div className={`p-4 rounded-xl border space-y-1.5 ${
                totalGrowthAmount >= 0 
                  ? 'bg-emerald-50/50 border-emerald-100 text-emerald-900' 
                  : 'bg-rose-50/50 border-rose-100 text-rose-900'
              }`}>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">
                  Capital Gain & Unrealized Profit/Loss
                </span>
                <div className="flex items-baseline gap-2">
                  <span className={`text-xl font-black font-mono tracking-tight ${
                    totalGrowthAmount >= 0 ? 'text-emerald-700' : 'text-rose-700'
                  }`}>
                    {totalGrowthAmount >= 0 ? '+' : ''}{formatterIDR.format(totalGrowthAmount)}
                  </span>
                  <span className={`text-xs font-bold font-mono px-2 py-0.5 rounded-md ${
                    totalGrowthAmount >= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                  }`}>
                    {totalGrowthAmount >= 0 ? '+' : ''}{growthPercentage.toFixed(2)}%
                  </span>
                </div>
              </div>

              {/* Card 3: True Yield / Dividend summary */}
              <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100 space-y-1.5">
                <span className="text-[10px] uppercase font-bold text-blue-400 block">
                  Dividen / Bunga / Imbal Hasil
                </span>
                <div className="flex justify-between items-center">
                  <div className="flex items-baseline gap-1">
                    <span className="text-xl font-black text-blue-700 font-mono tracking-tight block">
                      +{formatterIDR.format(totalDividendsOrInterest)}
                    </span>
                  </div>
                  <span className="text-[10px] uppercase font-bold text-blue-600 bg-blue-100 px-2 py-0.5 rounded border border-blue-200">
                    Yield: {totalDividendYieldPct.toFixed(2)}%
                  </span>
                </div>
                <div className="flex justify-between items-center text-[10px] uppercase font-bold text-blue-800 pt-2 border-t border-blue-200/60 mt-1">
                  <span>True Total Return (ROI):</span>
                  <span className="font-mono font-black">{totalTrueYieldPct.toFixed(2)}%</span>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 text-[11px] text-slate-500 font-medium leading-relaxed bg-blue-50/60 p-3 rounded-xl border border-blue-100/60 mt-4 flex items-start gap-2">
            <Gift className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <strong className="text-slate-800 font-bold block mb-0.5">True Yield Portofolio:</strong>
              Mengkalkulasikan keuntungan bersih berdasarkan (Unrealized Capital Gain + Passive Income Dividen/Bunga) dari investasi Anda.
            </div>
          </div>
        </div>

        {/* Right: Pie Chart Distribution */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm lg:col-span-2 space-y-4">
          <div className="flex flex-wrap justify-between items-center gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-blue-600" />
              <h3 className="font-semibold text-slate-800 text-sm uppercase tracking-wider">
                Alokasi Diversifikasi Portofolio (Pie Chart)
              </h3>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
              <button
                onClick={() => setPieViewMode('category')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  pieViewMode === 'category'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Per Kategori
              </button>
              <button
                onClick={() => setPieViewMode('asset')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  pieViewMode === 'asset'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Per Aset
              </button>
              <button
                onClick={() => setPieViewMode('combined')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  pieViewMode === 'combined'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Gabungan + Tetap
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
            <div className="h-56 w-full relative">
              {pieData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-400 text-xs font-semibold">
                  Belum ada instrumen investasi terdaftar.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={85}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {pieData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(val: number, name: string) => [
                        `${formatterIDR.format(val)} (${pieTotalValue > 0 ? ((val / pieTotalValue) * 100).toFixed(1) : 0}%)`,
                        name
                      ]}
                      contentStyle={{ background: '#0f172a', color: '#fff', borderRadius: '10px', fontSize: '11px', border: '1px solid #334155' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">
                  Porsi {pieViewMode === 'combined' ? 'Gabungan Investasi & Aset Tetap' : pieViewMode === 'category' ? 'Kategori Aset' : 'Instrumen Aset'}:
                </span>
                {pieData.length > 0 && (
                  <span className="text-[10px] bg-blue-50 text-blue-700 font-extrabold px-2 py-0.5 rounded border border-blue-100">
                    Terbesar: {pieData[0].name} ({pieTotalValue > 0 ? ((pieData[0].value / pieTotalValue) * 100).toFixed(1) : 0}%)
                  </span>
                )}
              </div>

              {pieData.length === 0 ? (
                <p className="text-xs text-slate-400 italic">Tambahkan aset untuk melihat alokasi.</p>
              ) : (
                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                  {pieData.map((entry, index) => {
                    const sharePct = pieTotalValue > 0 ? (entry.value / pieTotalValue) * 100 : 0;
                    return (
                      <div key={entry.name} className="flex justify-between items-center text-xs p-2 rounded-lg bg-slate-50 border border-slate-100 hover:bg-slate-100/80 transition">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                          <span className="font-bold text-slate-700 truncate">{entry.name}</span>
                        </div>
                        <div className="text-right font-mono shrink-0">
                          <span className="font-bold text-slate-800 block">{formatterIDR.format(entry.value)}</span>
                          <span className="text-[10px] text-blue-600 font-extrabold block">{sharePct.toFixed(1)}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* D3.js Historical Monthly ROI Performance Comparison Chart */}
      <InvestmentRoiD3Chart investments={investments} transactions={transactions} />

      {/* Middle Section: AreaChart Portfolio Growth Trend */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-blue-600" />
            <h3 className="font-semibold text-slate-800 text-sm uppercase tracking-wider">
              Grafik Tren Akumulasi Portofolio Investasi Bulanan
            </h3>
          </div>
          <span className="text-[10px] text-blue-600 font-bold bg-blue-50 px-2.5 py-1 rounded-full border border-blue-100 uppercase tracking-wider">
            AreaChart Accumulation Trend
          </span>
        </div>

        <div className="h-72 w-full mt-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={trendChartData}
              margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
            >
              <defs>
                <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.01}/>
                </linearGradient>
                <linearGradient id="colorCapital" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#94a3b8" stopOpacity={0.01}/>
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis 
                dataKey="displayDate" 
                stroke="#94a3b8" 
                fontSize={10} 
                tickLine={false}
                axisLine={false}
                dy={10}
              />
              <YAxis 
                stroke="#94a3b8" 
                fontSize={10} 
                tickLine={false}
                axisLine={false}
                tickFormatter={formatCompactIDR}
                dx={-5}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend 
                verticalAlign="top" 
                height={36} 
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: '11px', fontWeight: 'bold' }}
              />
              <Area 
                type="monotone" 
                dataKey="Nilai Portofolio" 
                stroke="#3b82f6" 
                strokeWidth={2.5}
                fillOpacity={1} 
                fill="url(#colorValue)" 
              />
              <Area 
                type="monotone" 
                dataKey="Modal Investasi" 
                stroke="#94a3b8" 
                strokeWidth={2}
                strokeDasharray="4 4"
                fillOpacity={1} 
                fill="url(#colorCapital)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Visualisasi Bar Chart: Distribusi & Valuasi Aset Berdasarkan Kategori */}
        <div className="border-t border-slate-100 pt-5 mt-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5">
            <div className="flex items-center gap-2">
              <BarChart2 className="h-4 w-4 text-blue-600" />
              <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
                Grafik Perbandingan Modal vs Valuasi per Kategori
              </h4>
            </div>
            <span className="text-[10px] text-blue-600 font-bold bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-md uppercase tracking-wider">
              Bar Chart Diversifikasi
            </span>
          </div>

          {categoryPerformance.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs font-semibold">
              Belum ada data kategori aset terdaftar.
            </div>
          ) : (
            <div className="h-64 w-full bg-slate-50/50 p-4 rounded-xl border border-slate-150">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={categoryPerformance.map((perf) => ({
                    category: perf.name,
                    'Modal Investasi': perf.initialCapital,
                    'Nilai Saat Ini': perf.currentValue,
                  }))}
                  margin={{ top: 10, right: 10, left: -10, bottom: 20 }}
                >
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis 
                    dataKey="category" 
                    tick={{ fontSize: 10, fill: '#64748b' }} 
                    interval={0}
                  />
                  <YAxis 
                    tickFormatter={(val) => formatCompactIDR(val)}
                    tick={{ fontSize: 10, fill: '#64748b' }}
                  />
                  <Tooltip 
                    formatter={(value: number) => [formatterIDR.format(value), '']}
                    contentStyle={{ background: '#0f172a', color: '#fff', borderRadius: '8px', fontSize: '11px' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                  <Bar dataKey="Modal Investasi" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Nilai Saat Ini" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Visualisasi Line Chart: Tren Kenaikan / Penurunan Harga Satuan & Valuasi Investasi */}
        <div className="border-t border-slate-100 pt-5 mt-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-emerald-600" />
              <div>
                <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-2">
                  <span>Grafik Tren Pergerakan Harga Satuan & Growth Aset</span>
                  <span className="text-[9px] bg-emerald-100 text-emerald-800 font-black px-2 py-0.5 rounded-full border border-emerald-200">
                    LineChart (Recharts)
                  </span>
                </h4>
                <p className="text-[10px] text-slate-500 font-medium">
                  Visualisasi perubahan nilai per unit dan pertumbuhan total portofolio investasi dari waktu ke waktu
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Toggle Mode: Harga Satuan vs Total Valuasi */}
              <div className="flex items-center bg-white p-0.5 rounded-lg border border-slate-200 text-[11px] font-bold">
                <button
                  onClick={() => setLineChartMode('unitPrice')}
                  className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                    lineChartMode === 'unitPrice'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Harga per Unit
                </button>
                <button
                  onClick={() => setLineChartMode('valuation')}
                  className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                    lineChartMode === 'valuation'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Total Valuasi
                </button>
              </div>

              {/* Filter Aset */}
              <div className="flex items-center gap-1.5">
                <select
                  value={selectedPriceChartAssetId}
                  onChange={(e) => setSelectedPriceChartAssetId(e.target.value)}
                  className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-[11px] font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-xs"
                >
                  <option value="all">🌐 Semua Instrumen</option>
                  {investments.map(inv => (
                    <option key={inv.id} value={inv.id}>{inv.name}</option>
                  ))}
                </select>

                <button
                  onClick={() => setIsHistoryModalOpen(true)}
                  className="flex items-center gap-1 bg-white hover:bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg border border-slate-200 text-[11px] font-bold transition shadow-xs cursor-pointer"
                  title="Lihat & Input Riwayat Perubahan Harga"
                >
                  <History className="h-3.5 w-3.5 text-emerald-600" />
                  <span className="hidden md:inline">Log Harga</span>
                </button>
              </div>
            </div>
          </div>

          {(() => {
            // Compute history data for each asset with fallback
            const assetHistoriesMap = investments.map(inv => {
              const rawHistory = inv.priceHistory || [];
              const qty = inv.units || inv.quantity || 1;
              let points: { date: string; unitPrice: number; valuation: number }[] = rawHistory.map(ph => ({
                date: ph.date,
                unitPrice: ph.unitPrice,
                valuation: ph.unitPrice * qty,
              }));

              // If no price history exists yet, build points from purchase & current unit price
              if (points.length === 0) {
                const addedDate = inv.dateAdded || '2026-01-01';
                const today = toLocalYYYYMMDD();
                const purchasePrice = inv.purchaseUnitPrice || (inv.units ? inv.balance / inv.units : inv.balance) || 0;
                const currentPrice = inv.currentUnitPrice || inv.unitPrice || purchasePrice;

                points.push({
                  date: addedDate,
                  unitPrice: purchasePrice,
                  valuation: purchasePrice * qty,
                });

                if (today !== addedDate) {
                  points.push({
                    date: today,
                    unitPrice: currentPrice,
                    valuation: currentPrice * qty,
                  });
                }
              }

              // Deduplicate points by date, taking latest point for each date
              const dateMap = new Map<string, { date: string; unitPrice: number; valuation: number }>();
              points.forEach(p => dateMap.set(p.date, p));
              const deduplicatedPoints = Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));

              return {
                id: inv.id,
                name: inv.name,
                category: inv.category,
                unitName: inv.unitName || getDefaultUnitName(inv.category),
                qty,
                points: deduplicatedPoints,
              };
            });

            // Unique chronological dates
            const allDates = Array.from(
              new Set(assetHistoriesMap.flatMap(a => a.points.map(p => p.date)))
            ).sort();

            const priceChartData = allDates.map(date => {
              const dataPoint: any = { date };
              const dateObj = parseLocalDate(date) || new Date();
              dataPoint.displayDate = dateObj.toLocaleDateString('id-ID', {
                day: 'numeric',
                month: 'short'
              });

              assetHistoriesMap.forEach(asset => {
                if (selectedPriceChartAssetId !== 'all' && asset.id !== selectedPriceChartAssetId) return;

                const validPoints = asset.points
                  .filter(p => p.date <= date)
                  .sort((a, b) => b.date.localeCompare(a.date));

                if (validPoints.length > 0) {
                  const p = validPoints[0];
                  dataPoint[asset.name] = lineChartMode === 'unitPrice' ? p.unitPrice : p.valuation;
                }
              });

              return dataPoint;
            });

            if (priceChartData.length === 0 || investments.length === 0) {
              return (
                <div className="text-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-400 text-xs font-semibold">
                  Belum ada instrumen investasi terdaftar untuk menampilkan grafik garis.
                </div>
              );
            }

            return (
              <div className="space-y-3">
                <div className="h-72 w-full bg-slate-50/70 p-4 rounded-xl border border-slate-200 shadow-inner">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={priceChartData}
                      margin={{ top: 15, right: 15, left: -10, bottom: 20 }}
                    >
                      <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis 
                        dataKey="displayDate" 
                        tick={{ fontSize: 10, fill: '#64748b' }} 
                        interval="preserveStartEnd"
                        tickMargin={10}
                      />
                      <YAxis 
                        tickFormatter={(val) => formatCompactIDR(val)}
                        tick={{ fontSize: 10, fill: '#64748b' }}
                        domain={['auto', 'auto']}
                      />
                      <Tooltip 
                        formatter={(value: number, name: string) => [
                          `${formatterIDR.format(value)}${lineChartMode === 'unitPrice' ? ' / Unit' : ''}`,
                          name
                        ]}
                        labelFormatter={(label) => `📅 Tanggal: ${label}`}
                        contentStyle={{ background: '#0f172a', color: '#fff', borderRadius: '10px', fontSize: '11px', border: '1px solid #334155' }}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                      {investments.map((inv, idx) => {
                        if (selectedPriceChartAssetId !== 'all' && inv.id !== selectedPriceChartAssetId) return null;
                        return (
                          <Line
                            key={inv.id}
                            type="monotone"
                            dataKey={inv.name}
                            stroke={COLORS[idx % COLORS.length]}
                            strokeWidth={2.5}
                            dot={{ r: 4, strokeWidth: 2, fill: '#ffffff' }}
                            activeDot={{ r: 7, strokeWidth: 0, fill: COLORS[idx % COLORS.length] }}
                            connectNulls
                          />
                        );
                      })}
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Sub-Panel Highlight Stats for Selected Asset */}
                {selectedPriceChartAssetId !== 'all' && (() => {
                  const targetInv = investments.find(i => i.id === selectedPriceChartAssetId);
                  if (!targetInv) return null;

                  const purchase = targetInv.purchaseUnitPrice || (targetInv.units ? targetInv.balance / targetInv.units : targetInv.balance) || 0;
                  const current = targetInv.currentUnitPrice || targetInv.unitPrice || purchase;
                  const diff = current - purchase;
                  const pct = purchase > 0 ? (diff / purchase) * 100 : 0;
                  const uName = targetInv.unitName || getDefaultUnitName(targetInv.category);

                  return (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-emerald-50/60 p-3 rounded-xl border border-emerald-100 text-xs">
                      <div>
                        <span className="text-[10px] font-bold text-slate-500 uppercase block">Harga Beli Rata-Rata</span>
                        <span className="font-mono font-bold text-slate-800">{formatterIDR.format(purchase)} / {uName}</span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-500 uppercase block">Harga Pasar Sekarang</span>
                        <span className="font-mono font-bold text-emerald-700">{formatterIDR.format(current)} / {uName}</span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-500 uppercase block">Selisih Unit (P/L)</span>
                        <span className={`font-mono font-black ${diff >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {diff >= 0 ? '+' : ''}{formatterIDR.format(diff)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-500 uppercase block">Persentase Perubahan</span>
                        <span className={`font-mono font-black inline-flex items-center gap-1 ${pct >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {pct >= 0 ? '▲ +' : '▼ '}{pct.toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })()}
        </div>
      </div>

      {/* Main Portfolio Asset Table & Detailed Unit Calculation Ledger */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-blue-600" />
            <h3 className="font-semibold text-slate-800 text-sm uppercase tracking-wider">
              Daftar Kepemilikan & Perhitungan Harga Satuan Investasi
            </h3>
          </div>
          <span className="text-[10px] text-slate-500 font-bold bg-slate-100 px-3 py-1 rounded-full border border-slate-200 uppercase">
            {investments.length} Instrumen Aktif
          </span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          {investments.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-xs font-semibold">
              Belum ada instrumen investasi terdaftar dalam portofolio Anda.
            </div>
          ) : (
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-bold text-[9px] border-b border-slate-200">
                <tr>
                  <th className="py-3 px-3">Instrumen & Kategori</th>
                  <th className="py-3 px-3 text-center">Jumlah Unit / Kuantitas</th>
                  <th className="py-3 px-3 text-right">Harga Beli Rata-Rata (Avg Price)</th>
                  <th className="py-3 px-3 text-right">Harga Satuan Hari Ini</th>
                  <th className="py-3 px-3 text-right">Total Modal Beli</th>
                  <th className="py-3 px-3 text-right">Valuasi Saat Ini</th>
                  <th className="py-3 px-3 text-right">Gain / Loss (ROI)</th>
                  {onUpdateInvestment && <th className="py-3 px-3 text-center">Kelola & Aksi</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {investments.map((inv) => {
                  const units = inv.units && inv.units > 0 ? inv.units : 1;
                  const unitName = inv.unitName || getDefaultUnitName(inv.category);
                  const initialCap = inv.initialCapital !== undefined ? inv.initialCapital : inv.balance;
                  const avgBuyPrice = inv.purchaseUnitPrice || (initialCap / units);
                  const currentPrice = inv.currentUnitPrice || (inv.balance / units);
                  
                  const gain = inv.balance - initialCap;
                  const gainPercent = initialCap > 0 ? (gain / initialCap) * 100 : 0;
                  const badgeStyles = getCategoryStyles(inv.category);

                  // Calculate historical trend vs previous recorded unit price
                  const sortedHistory = (inv.priceHistory || []).slice().sort((a, b) => a.date.localeCompare(b.date));
                  let prevRecordedPrice = avgBuyPrice;
                  if (sortedHistory.length > 1) {
                    prevRecordedPrice = sortedHistory[sortedHistory.length - 2].unitPrice;
                  } else if (sortedHistory.length === 1) {
                    prevRecordedPrice = sortedHistory[0].unitPrice;
                  }

                  const trendDiffVsPrev = currentPrice - prevRecordedPrice;
                  const trendPctVsPrev = prevRecordedPrice > 0 ? ((currentPrice - prevRecordedPrice) / prevRecordedPrice) * 100 : 0;
                  const trendDiffVsAvg = currentPrice - avgBuyPrice;
                  const trendPctVsAvg = avgBuyPrice > 0 ? ((currentPrice - avgBuyPrice) / avgBuyPrice) * 100 : 0;

                  const isTrendUp = trendDiffVsPrev > 0;
                  const isTrendDown = trendDiffVsPrev < 0;

                  return (
                    <tr key={inv.id} className="hover:bg-slate-50/80 transition">
                      {/* Name & Category + Trend Indicator */}
                      <td className="py-3.5 px-3">
                        <span className="font-extrabold text-slate-900 text-sm block mb-1">{inv.name}</span>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase border ${badgeStyles}`}>
                            {inv.category}
                          </span>

                          {/* Badge Indikator Tren Harga Satuan */}
                          <div className="relative group inline-block">
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-black border cursor-help shadow-2xs transition ${
                              isTrendUp
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200'
                                : isTrendDown
                                ? 'bg-rose-100 text-rose-800 border-rose-300 hover:bg-rose-200'
                                : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                            }`}>
                              {isTrendUp ? '📈 Naik ' : isTrendDown ? '📉 Turun ' : '➖ Stabil '}
                              {isTrendUp ? `+${trendPctVsPrev.toFixed(1)}%` : `${trendPctVsPrev.toFixed(1)}%`}
                            </span>

                            {/* Tooltip Riwayat & Tren Pergerakan Harga */}
                            <div className="absolute left-0 bottom-full mb-1.5 hidden group-hover:block w-64 p-3 bg-slate-900/95 text-white text-[10px] rounded-xl shadow-2xl z-50 pointer-events-none backdrop-blur-xs border border-slate-700/80">
                              <div className="font-extrabold text-blue-300 border-b border-slate-700 pb-1 mb-1.5 flex justify-between items-center">
                                <span>📊 Indikator Tren Harga Satuan</span>
                                <span className="text-[9px] text-slate-400 font-mono">1 {unitName}</span>
                              </div>
                              <div className="space-y-1.5">
                                <div className="flex justify-between items-center text-slate-200">
                                  <span>Arah Pergerakan:</span>
                                  <span className={`font-mono font-black ${isTrendUp ? 'text-emerald-400' : isTrendDown ? 'text-rose-400' : 'text-slate-300'}`}>
                                    {isTrendUp ? '📈 Tren Naik (Bullish)' : isTrendDown ? '📉 Tren Turun (Bearish)' : '➖ Harga Stabil'}
                                  </span>
                                </div>
                                <div className="flex justify-between items-center text-slate-300">
                                  <span>Perubahan vs Log Lalu:</span>
                                  <span className={`font-mono font-bold ${trendDiffVsPrev >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {trendDiffVsPrev >= 0 ? '▲ +' : '▼ '}{trendPctVsPrev.toFixed(2)}% ({formatterIDR.format(trendDiffVsPrev)})
                                  </span>
                                </div>
                                <div className="flex justify-between items-center text-slate-300">
                                  <span>Perubahan vs Avg Beli:</span>
                                  <span className={`font-mono font-bold ${trendDiffVsAvg >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {trendDiffVsAvg >= 0 ? '▲ +' : '▼ '}{trendPctVsAvg.toFixed(2)}% ({formatterIDR.format(trendDiffVsAvg)})
                                  </span>
                                </div>
                                <div className="flex justify-between items-center pt-1 border-t border-slate-800 text-slate-400 text-[9px]">
                                  <span>Harga Log Sebelum:</span>
                                  <span className="font-mono text-slate-300">{formatterIDR.format(prevRecordedPrice)}</span>
                                </div>
                                <div className="flex justify-between items-center text-slate-400 text-[9px]">
                                  <span>Harga Satuan Hari Ini:</span>
                                  <span className="font-mono text-blue-400 font-extrabold">{formatterIDR.format(currentPrice)}</span>
                                </div>
                                {sortedHistory.length > 0 && (
                                  <div className="pt-1.5 border-t border-slate-800 space-y-1">
                                    <span className="text-[9px] font-bold text-blue-300 block">Riwayat Log Harga ({sortedHistory.length}):</span>
                                    {sortedHistory.slice(-3).reverse().map((h, idx) => (
                                      <div key={idx} className="flex justify-between text-[9px] font-mono text-slate-300">
                                        <span className="text-slate-400">{h.date}</span>
                                        <span className="font-bold text-emerald-300">{formatterIDR.format(h.unitPrice)}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Units / Quantity */}
                      <td className="py-3.5 px-3 text-center">
                        <span className="font-mono font-extrabold text-slate-800 text-xs block">
                          {units.toLocaleString('id-ID', { maximumFractionDigits: 4 })} {unitName}
                        </span>
                        <span className="text-[9px] text-slate-400 font-bold block uppercase">Kuantitas Aset</span>
                      </td>

                      {/* Average Buy Price */}
                      <td className="py-3.5 px-3 text-right">
                        <span className="font-mono font-bold text-slate-700 text-xs block">
                          {formatterIDR.format(avgBuyPrice)}
                        </span>
                        <span className="text-[9px] text-slate-400 font-semibold block">per {unitName}</span>
                      </td>

                      {/* Current Unit Market Price */}
                      <td className="py-3.5 px-3 text-right">
                        <div className="inline-flex flex-col items-end">
                          <span className="font-mono font-extrabold text-blue-600 text-xs block">
                            {formatterIDR.format(currentPrice)}
                          </span>
                          <span className="text-[9px] text-slate-400 font-semibold block mb-1">per {unitName}</span>
                          {onUpdateInvestment && (
                            <button
                              onClick={() => startQuickPriceUpdate(inv)}
                              className="text-[10px] text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 font-bold px-2 py-0.5 rounded border border-blue-200 transition cursor-pointer flex items-center gap-1"
                              title="Update Harga Pasar Hari Ini"
                            >
                              <RefreshCw className="h-3 w-3" /> Update Harga Hari Ini
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Total Modal Beli */}
                      <td className="py-3.5 px-3 text-right font-mono text-slate-600 text-xs font-semibold">
                        {formatterIDR.format(initialCap)}
                      </td>

                      {/* Valuasi Saat Ini */}
                      <td className="py-3.5 px-3 text-right font-mono font-extrabold text-slate-900 text-xs">
                        {formatterIDR.format(inv.balance)}
                      </td>

                      {/* Gain / Loss */}
                      <td className="py-3.5 px-3 text-right">
                        {(() => {
                          const unitPriceGainLoss = currentPrice - avgBuyPrice;
                          const unitPriceGainLossPct = avgBuyPrice > 0 ? ((currentPrice - avgBuyPrice) / avgBuyPrice) * 100 : 0;
                          return (
                            <div>
                              <span className={`font-mono text-xs font-black block ${
                                gain >= 0 ? 'text-emerald-600' : 'text-rose-600'
                              }`}>
                                {gain >= 0 ? '+' : ''}{gainPercent.toFixed(2)}%
                              </span>
                              <span className={`text-[10px] font-bold block ${
                                gain >= 0 ? 'text-emerald-500' : 'text-rose-500'
                              }`}>
                                {gain >= 0 ? '+' : ''}{formatterIDR.format(gain)}
                              </span>

                              {/* Visual Indicator & Tooltip for Per-Unit P/L */}
                              <div className="relative group inline-block mt-1">
                                <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-black font-mono border cursor-help ${
                                  unitPriceGainLoss >= 0
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : 'bg-rose-50 text-rose-700 border-rose-200'
                                }`}>
                                  {unitPriceGainLoss >= 0 ? '▲ +' : '▼ '}
                                  {unitPriceGainLossPct.toFixed(1)}% / {unitName}
                                </span>

                                {/* Tooltip */}
                                <div className="absolute right-0 bottom-full mb-1.5 hidden group-hover:block w-52 p-2.5 bg-slate-900/95 text-white text-[10px] rounded-xl shadow-xl z-50 pointer-events-none backdrop-blur-xs border border-slate-700/50">
                                  <div className="font-extrabold text-blue-300 border-b border-slate-700 pb-1 mb-1.5 flex justify-between items-center">
                                    <span>P/L per {unitName}</span>
                                    <span className="text-[9px] text-slate-400">Harga Satuan</span>
                                  </div>
                                  <div className="space-y-1">
                                    <div className="flex justify-between items-center text-slate-300">
                                      <span>Harga Beli (Avg):</span>
                                      <span className="font-mono font-bold">{formatterIDR.format(avgBuyPrice)}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-slate-300">
                                      <span>Harga Sekarang:</span>
                                      <span className="font-mono font-bold text-blue-400">{formatterIDR.format(currentPrice)}</span>
                                    </div>
                                    <div className="flex justify-between items-center pt-1 border-t border-slate-800 font-extrabold">
                                      <span>Selisih/Unit:</span>
                                      <span className={`font-mono ${unitPriceGainLoss >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {unitPriceGainLoss >= 0 ? '+' : ''}{formatterIDR.format(unitPriceGainLoss)}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </td>

                      {/* Actions */}
                      {onUpdateInvestment && (
                        <td className="py-3.5 px-3 text-center">
                          <div className="flex items-center justify-center gap-1.5 flex-wrap">
                            <button
                              onClick={() => startTopUp(inv)}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold px-2.5 py-1 rounded-lg transition cursor-pointer flex items-center gap-1 shadow-xs"
                              title="Beli Lagi & Hitung Harga Beli Rata-Rata (DCA)"
                            >
                              <Plus className="h-3 w-3" /> Top Up (DCA)
                            </button>
                            <button
                              onClick={() => {
                                setLogDividendAssetId(inv.id);
                                setLogDividendAmount(0);
                                setLogDividendNote('Bagi Hasil / Dividen');
                                const defaultAcc = liquidCashAccounts.find((a) => a.type === 'bank') || liquidCashAccounts[0];
                                setLogDividendAccountId(defaultAcc?.id || '');
                              }}
                              className="bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold px-2.5 py-1 rounded-lg transition cursor-pointer flex items-center gap-1 shadow-xs"
                              title="Catat Pendapatan Dividen/Bunga"
                            >
                              <Gift className="h-3 w-3" /> Catat Dividen
                            </button>
                            <button
                              onClick={() => {
                                setDripInitialAssetId(inv.id);
                                setIsDripModalOpen(true);
                              }}
                              className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-[10px] font-bold px-2.5 py-1 rounded-lg transition cursor-pointer flex items-center gap-1 whitespace-nowrap"
                              title="Simulasi Reinvestasi Dividen (DRIP) berdasarkan tren historis aset ini"
                            >
                              <RefreshCw className="h-3 w-3" /> DRIP
                            </button>
                            <button
                              onClick={() => startEditing(inv)}
                              className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition cursor-pointer border border-slate-200"
                              title="Edit Detail Aset"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Histori Mutasi Investasi Jurnal */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <Activity className="h-5 w-5 text-blue-600" />
          <h3 className="font-semibold text-slate-800 text-sm uppercase tracking-wider">
            Histori Mutasi Investasi Jurnal
          </h3>
        </div>

        <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
          {investmentTxs.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs font-semibold">
              Belum ada transaksi jual/beli investasi dalam jurnal.
            </div>
          ) : (
            investmentTxs.map((tx) => (
              <div key={tx.id} className="p-3 bg-slate-50 hover:bg-slate-100 transition rounded-lg border border-slate-100 text-xs flex justify-between items-center">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`inline-block px-1.5 py-0.5 rounded font-bold uppercase text-[8px] ${
                      tx.type === 'investment' ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'
                    }`}>
                      {tx.type === 'investment' ? 'Beli / Tambah' : 'Likuid / Jual'}
                    </span>
                    <strong className="text-slate-800 font-bold">{tx.category}</strong>
                  </div>
                  <p className="text-slate-500 font-medium text-[11px] leading-tight">{tx.description}</p>
                  <span className="text-[9px] text-slate-400 font-mono block">{tx.date}</span>
                </div>
                <div className="text-right">
                  <span className={`font-bold font-mono block ${
                    tx.type === 'investment' ? 'text-blue-600' : 'text-emerald-600'
                  }`}>
                    {tx.type === 'investment' ? '-' : '+'}{formatterIDR.format(tx.amount)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* TARGET & GOALS INVESTASI */}
      <div id="investment-goals-section">
        <InvestmentGoalSection investments={investments} />
      </div>

      {/* KALKULATOR INFLASI & DAYA BELI MASA DEPAN */}
      <div id="inflation-calculator-section">
        <InflationPurchasingPowerCalculator investments={investments} />
      </div>
      </div>
      )}

      {/* MODAL 1: EDIT DETAIL INSTRUMEN ASET */}
      {editingAssetId && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-md p-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3 mb-4">
              <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider flex items-center gap-2">
                <Edit2 className="h-4 w-4 text-blue-600" />
                Edit Detail Instrumen Investasi
              </h3>
              <button 
                onClick={() => setEditingAssetId(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Nama Instrumen Investasi
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 font-bold"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Kategori Aset
                </label>
                <select
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 font-semibold"
                >
                  <option value="Logam Mulia (Emas)">Logam Mulia (Emas)</option>
                  <option value="Saham">Saham</option>
                  <option value="Reksadana">Reksadana</option>
                  <option value="Cryptocurrency">Cryptocurrency</option>
                  <option value="Bisnis Riil">Bisnis Riil</option>
                  <option value="Lainnya">Lainnya</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Jumlah Unit / Kuantitas
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={editUnits}
                    onChange={(e) => setEditUnits(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-mono font-bold text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Nama Satuan (cth: Gram)
                  </label>
                  <input
                    type="text"
                    value={editUnitName}
                    onChange={(e) => setEditUnitName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-semibold text-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Harga Beli Rata-Rata / Unit (Rp)
                  </label>
                  <FormattedNumberInput
                    value={editPurchaseUnitPrice}
                    onChange={(_, numVal) => setEditPurchaseUnitPrice(numVal)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-mono font-bold text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Harga Satuan Hari Ini (Rp)
                  </label>
                  <FormattedNumberInput
                    value={editCurrentUnitPrice}
                    onChange={(_, numVal) => setEditCurrentUnitPrice(numVal)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-mono font-bold text-blue-600"
                  />
                </div>
              </div>

              {(() => {
                const previewCapital = editUnits * editPurchaseUnitPrice;
                const previewValuation = editUnits * editCurrentUnitPrice;
                const previewGain = previewValuation - previewCapital;
                const previewGrowthPct = previewCapital > 0 ? (previewGain / previewCapital) * 100 : 0;

                return (
                  <div className="p-3 bg-[slate-50] bg-slate-50 rounded-xl border border-slate-200 space-y-1.5 font-mono text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Total Modal Beli Basis:</span>
                      <span className="font-bold text-slate-800">{formatterIDR.format(previewCapital)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Total Valuasi Portofolio:</span>
                      <span className="font-extrabold text-blue-600">{formatterIDR.format(previewValuation)}</span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-slate-200/80">
                      <span className="text-slate-600 font-semibold">Estimasi Unrealized Gain/Loss:</span>
                      <span className={`font-black ${previewGain >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {previewGain >= 0 ? '+' : ''}{formatterIDR.format(previewGain)} ({previewGain >= 0 ? '+' : ''}{previewGrowthPct.toFixed(2)}%)
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="flex justify-end gap-2 mt-6 border-t border-slate-100 pt-4">
              <button
                onClick={() => setEditingAssetId(null)}
                className="px-4 py-2 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-50 cursor-pointer transition"
              >
                Batal
              </button>
              <button
                onClick={saveEdit}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white cursor-pointer transition flex items-center gap-1 shadow-sm"
              >
                <Check className="h-3.5 w-3.5" /> Simpan Perubahan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: QUICK UPDATE HARGA SATUAN HARI INI */}
      {updatePriceAssetId && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-sm p-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3 mb-4">
              <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-blue-600" />
                Update Harga Satuan Pasar Hari Ini
              </h3>
              <button 
                onClick={() => setUpdatePriceAssetId(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {(() => {
              const inv = investments.find(i => i.id === updatePriceAssetId);
              if (!inv) return null;
              const units = inv.units && inv.units > 0 ? inv.units : 1;
              const unitName = inv.unitName || getDefaultUnitName(inv.category);
              const previewBalance = units * quickCurrentPrice;
              const initialCap = inv.initialCapital !== undefined ? inv.initialCapital : inv.balance;
              const previewGain = previewBalance - initialCap;

              return (
                <div className="space-y-4 text-xs">
                  <p className="text-slate-600 font-medium">
                    Masukkan harga pasar terbaru per 1 <strong>{unitName}</strong> untuk instrumen <strong>{inv.name}</strong>:
                  </p>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Harga Per 1 {unitName} Hari Ini (Rp)
                    </label>
                    <input
                      type="number"
                      value={quickCurrentPrice}
                      onChange={(e) => setQuickCurrentPrice(Number(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-mono font-black text-blue-600 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-xl space-y-1 font-mono text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Jumlah Unit:</span>
                      <span className="font-bold text-slate-800">{units} {unitName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Valuasi Baru:</span>
                      <span className="font-black text-slate-900">{formatterIDR.format(previewBalance)}</span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-blue-200/60">
                      <span className="text-slate-500">Estimasi Gain/Loss:</span>
                      <span className={`font-black ${previewGain >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {previewGain >= 0 ? '+' : ''}{formatterIDR.format(previewGain)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="flex justify-end gap-2 mt-6 border-t border-slate-100 pt-4">
              <button
                onClick={() => setUpdatePriceAssetId(null)}
                className="px-4 py-2 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-50 cursor-pointer transition"
              >
                Batal
              </button>
              <button
                onClick={saveQuickPriceUpdate}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white cursor-pointer transition flex items-center gap-1 shadow-sm"
              >
                <Check className="h-3.5 w-3.5" /> Terapkan Harga Baru
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: TOP UP / BELI LAGI (KALKULATOR AVERAGE BUY PRICE DCA) */}
      {topUpAssetId && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-md p-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3 mb-4">
              <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider flex items-center gap-2">
                <Calculator className="h-4 w-4 text-emerald-600" />
                Tambah Pembelian & Kalkulasi Harga Beli Rata-Rata (DCA)
              </h3>
              <button 
                onClick={() => setTopUpAssetId(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {(() => {
              const inv = investments.find(i => i.id === topUpAssetId);
              if (!inv) return null;

              const oldUnits = inv.units && inv.units > 0 ? inv.units : 1;
              const unitName = inv.unitName || getDefaultUnitName(inv.category);
              const initialCap = inv.initialCapital !== undefined ? inv.initialCapital : inv.balance;
              const oldAvgBuyPrice = inv.purchaseUnitPrice || (initialCap / oldUnits);
              const currPrice = inv.currentUnitPrice || (inv.balance / oldUnits);

              // Calculated values for new purchase:
              const newTopUpCost = topUpUnits * topUpUnitPrice;
              const newTotalUnits = oldUnits + topUpUnits;
              const newAvgBuyPrice = newTotalUnits > 0 ? ((oldUnits * oldAvgBuyPrice) + newTopUpCost) / newTotalUnits : 0;
              const newTotalInitialCapital = newTotalUnits * newAvgBuyPrice;
              const newTotalValuation = newTotalUnits * currPrice;

              return (
                <div className="space-y-4 text-xs">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1 font-mono text-[11px]">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                      Kondisi Kepemilikan Saat Ini ({inv.name}):
                    </span>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Unit Saat Ini:</span>
                      <span className="font-bold text-slate-800">{oldUnits} {unitName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Harga Beli Rata-Rata Lama:</span>
                      <span className="font-bold text-slate-800">{formatterIDR.format(oldAvgBuyPrice)} / {unitName}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                        Jumlah Unit Tambahan Dibeli
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={topUpUnits}
                        onChange={(e) => setTopUpUnits(Number(e.target.value))}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-mono font-extrabold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                        Harga Beli Satuan Baru (Rp)
                      </label>
                      <FormattedNumberInput
                        value={topUpUnitPrice}
                        onChange={(_, numVal) => setTopUpUnitPrice(numVal)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-mono font-extrabold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>

                  {/* Rekening Sumber Kas Wajib untuk Posting Jurnal Otomatis */}
                  {onAddTransaction && (() => {
                    const selectedTopUpAcc = liquidCashAccounts.find((a) => a.id === topUpAccountId);
                    const isInsufficient = Boolean(selectedTopUpAcc && newTopUpCost > selectedTopUpAcc.currentBalance);
                    const projectedBal = selectedTopUpAcc
                      ? applyAccountBalanceChange(
                          selectedTopUpAcc,
                          getTransactionAccountDelta({ type: 'investment', amount: newTopUpCost })
                        ).currentBalance
                      : 0;
                    return (
                      <div className="space-y-2">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                            Rekening Sumber Dana (Wajib Sinkron Jurnal & Kas)
                          </label>
                          <select
                            value={topUpAccountId}
                            onChange={(e) => setTopUpAccountId(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          >
                            <option value="">-- Pilih Rekening Kas / Bank --</option>
                            {liquidCashAccounts.map((acc) => (
                              <option key={acc.id} value={acc.id}>
                                {acc.name} ({formatterIDR.format(acc.currentBalance)})
                              </option>
                            ))}
                          </select>
                        </div>
                        {selectedTopUpAcc && (
                          <div className={`p-2.5 rounded-xl border text-[11px] font-mono tabular-nums flex justify-between ${isInsufficient ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-slate-50 border-slate-200 text-slate-700'}`}>
                            <span>Saldo {selectedTopUpAcc.name}:</span>
                            <span className="font-bold">
                              {formatterIDR.format(selectedTopUpAcc.currentBalance)} &rarr; {formatterIDR.format(projectedBal)}
                            </span>
                          </div>
                        )}
                        {isInsufficient && (
                          <p className="text-[11px] font-bold text-rose-600 flex items-center gap-1">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                            Saldo rekening tidak mencukupi untuk pembelian tambahan ini.
                          </p>
                        )}
                      </div>
                    );
                  })()}

                  {/* Calculated Average Result Box */}
                  <div className="p-3 bg-emerald-50/80 border border-emerald-200 rounded-xl space-y-1.5 font-mono text-[11px]">
                    <span className="text-[10px] font-bold text-emerald-800 uppercase block mb-1">
                      Hasil Rekalkulasi Rata-Rata Beli (Average Buy Price):
                    </span>
                    <div className="flex justify-between">
                      <span className="text-emerald-900">Total Biaya Beli Baru:</span>
                      <span className="font-bold text-emerald-950">{formatterIDR.format(newTopUpCost)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-emerald-900">Total Unit Baru:</span>
                      <span className="font-bold text-emerald-950">{newTotalUnits} {unitName}</span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-emerald-200">
                      <span className="text-emerald-900 font-extrabold">Harga Beli Rata-Rata Baru:</span>
                      <span className="font-black text-emerald-700 text-xs">{formatterIDR.format(newAvgBuyPrice)} / {unitName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-emerald-900">Valuasi Total Portofolio:</span>
                      <span className="font-bold text-emerald-950">{formatterIDR.format(newTotalValuation)}</span>
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="flex justify-end gap-2 mt-6 border-t border-slate-100 pt-4">
              <button
                onClick={() => setTopUpAssetId(null)}
                className="px-4 py-2 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-50 cursor-pointer transition"
              >
                Batal
              </button>
              <button
                onClick={saveTopUp}
                disabled={Boolean(onAddTransaction && (!topUpAccountId || (() => {
                  const acc = liquidCashAccounts.find((a) => a.id === topUpAccountId);
                  return !acc || acc.currentBalance < Math.round((topUpUnits || 0) * (topUpUnitPrice || 0));
                })()))}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white cursor-pointer transition flex items-center gap-1 shadow-sm"
              >
                <Check className="h-3.5 w-3.5" /> Simpan &amp; Posting Jurnal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: CATAT DIVIDEN / BUNGA */}
      {logDividendAssetId && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-sm p-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3 mb-4">
              <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider flex items-center gap-2">
                <Gift className="h-4 w-4 text-blue-600" />
                Catat Dividen / Bunga
              </h3>
              <button 
                onClick={() => setLogDividendAssetId(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {(() => {
              const inv = investments.find(i => i.id === logDividendAssetId);
              if (!inv) return null;
              
              const currentDividends = inv.dividendsOrInterest || 0;
              const initialCap = inv.initialCapital !== undefined ? inv.initialCapital : inv.balance;
              const previewTotal = currentDividends + logDividendAmount;
              const previewYield = initialCap > 0 ? (previewTotal / initialCap) * 100 : 0;

              return (
                <div className="space-y-4 text-xs">
                  <p className="text-slate-600 font-medium">
                    Catat imbal hasil / dividen yang baru diterima untuk instrumen <strong>{inv.name}</strong>.
                  </p>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Jumlah Imbal Hasil (Rp)
                    </label>
                    <input
                      type="number"
                      value={logDividendAmount}
                      onChange={(e) => setLogDividendAmount(Number(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-mono font-black text-blue-600 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {onAddTransaction && (() => {
                    const selectedDivAcc = liquidCashAccounts.find((a) => a.id === logDividendAccountId);
                    const projectedDivBal = selectedDivAcc
                      ? applyAccountBalanceChange(
                          selectedDivAcc,
                          getTransactionAccountDelta({ type: 'income', amount: logDividendAmount || 0 })
                        ).currentBalance
                      : 0;
                    return (
                      <div className="space-y-2">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                            Rekening Kas / Bank Penerima (Wajib Sinkron Jurnal)
                          </label>
                          <select
                            value={logDividendAccountId}
                            onChange={(e) => setLogDividendAccountId(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">-- Pilih Rekening Kas / Bank --</option>
                            {liquidCashAccounts.map((acc) => (
                              <option key={acc.id} value={acc.id}>
                                {acc.name} ({formatterIDR.format(acc.currentBalance)})
                              </option>
                            ))}
                          </select>
                        </div>
                        {selectedDivAcc && (
                          <div className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 text-[11px] font-mono tabular-nums flex justify-between text-slate-700">
                            <span>Saldo {selectedDivAcc.name}:</span>
                            <span className="font-bold text-emerald-700">
                              {formatterIDR.format(selectedDivAcc.currentBalance)} &rarr; {formatterIDR.format(projectedDivBal)}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-xl space-y-1.5 font-mono text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Imbal Hasil Sebelumnya:</span>
                      <span className="font-bold text-slate-800">{formatterIDR.format(currentDividends)}</span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-blue-200/60">
                      <span className="text-blue-800 font-extrabold block">Total Akumulasi Imbal Hasil Baru:</span>
                      <span className="font-black text-blue-600 block text-right">{formatterIDR.format(previewTotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">True Yield dari Modal Beli:</span>
                      <span className="font-bold text-blue-800">{previewYield.toFixed(2)}%</span>
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="flex justify-end gap-2 mt-6 border-t border-slate-100 pt-4">
              <button
                onClick={() => setLogDividendAssetId(null)}
                className="px-4 py-2 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-50 cursor-pointer transition"
              >
                Batal
              </button>
              <button
                onClick={saveLogDividend}
                disabled={Boolean(onAddTransaction && (!logDividendAccountId || logDividendAmount <= 0))}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white cursor-pointer transition flex items-center gap-1 shadow-sm"
              >
                <Check className="h-3.5 w-3.5" /> Simpan &amp; Posting Dividen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Feature Modals */}
      <AIDiversificationModal
        isOpen={isAiModalOpen}
        onClose={() => setIsAiModalOpen(false)}
        investments={investments}
      />

      <PriceHistoryModal
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        investments={investments}
        onUpdateInvestment={onUpdateInvestment}
      />

      <InvestmentSimulationCalculator
        isOpen={isSimulationModalOpen}
        onClose={() => setIsSimulationModalOpen(false)}
        investments={investments}
      />

      <DividendReinvestmentModal
        isOpen={isDripModalOpen}
        onClose={() => setIsDripModalOpen(false)}
        investments={investments}
        transactions={transactions}
        initialAssetId={dripInitialAssetId}
      />
    </div>
  );
};
