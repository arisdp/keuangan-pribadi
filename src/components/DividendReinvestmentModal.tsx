import React, { useEffect, useMemo, useState } from 'react';
import { InvestmentAsset, Transaction } from '../types';
import { FormattedNumberInput } from './FormattedNumberInput';
import { parseLocalDate } from '../utils/accountingEngine';
import { formatterIDR } from '../utils/formatters';
import {
  X,
  RefreshCw,
  TrendingUp,
  Coins,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Info,
  Sparkles,
  ExternalLink,
  AlertTriangle,
  Check,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

export interface DividendReinvestmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  investments: InvestmentAsset[];
  transactions?: Transaction[];
  initialAssetId?: string | null;
}

type PayoutFrequency = 'monthly' | 'quarterly' | 'annually';

interface DerivedHistoricalTrend {
  currentBalance: number;
  initialCapital: number;
  currentUnits: number;
  currentUnitPrice: number;
  totalLoggedDividends: number;
  dividendLogCount: number;
  holdingYears: number;
  suggestedDividendYieldPct: number;
  suggestedPriceGrowthPct: number;
  yieldProvenanceLabel: string;
  growthProvenanceLabel: string;
  hasActualDividendHistory: boolean;
  hasActualPriceHistory: boolean;
}

interface YearlyComparisonRow {
  year: number;
  label: string;
  totalCapitalInvested: number;
  dripTotalValue: number;
  dripAnnualNetDividend: number;
  dripUnitsEstimate: number;
  cashTotalWealth: number;
  cashAssetOnlyValue: number;
  cashCumulativeDividends: number;
  cashAnnualNetDividend: number;
  dripAdvantage: number;
}

function getCategoryBaselineAssumptions(category: string): {
  yieldPct: number;
  growthPct: number;
} {
  switch (category) {
    case 'Saham':
      return { yieldPct: 4.5, growthPct: 8.5 };
    case 'Reksadana':
      return { yieldPct: 5.5, growthPct: 7.0 };
    case 'Obligasi / SBN':
      return { yieldPct: 6.5, growthPct: 1.5 };
    case 'Bisnis Riil':
      return { yieldPct: 8.0, growthPct: 5.0 };
    case 'Logam Mulia (Emas)':
      return { yieldPct: 0.0, growthPct: 7.5 };
    case 'Cryptocurrency':
      return { yieldPct: 0.0, growthPct: 12.0 };
    default:
      return { yieldPct: 4.0, growthPct: 6.5 };
  }
}

function deriveAssetHistoricalTrends(
  selectedAssetId: string,
  investments: InvestmentAsset[],
  transactions: Transaction[]
): DerivedHistoricalTrend {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const targets =
    selectedAssetId === 'all'
      ? investments
      : investments.filter((inv) => inv.id === selectedAssetId);

  if (targets.length === 0) {
    return {
      currentBalance: 0,
      initialCapital: 0,
      currentUnits: 1,
      currentUnitPrice: 0,
      totalLoggedDividends: 0,
      dividendLogCount: 0,
      holdingYears: 1,
      suggestedDividendYieldPct: 4.5,
      suggestedPriceGrowthPct: 8.0,
      yieldProvenanceLabel: 'Belum ada aset terpilih (asumsi standar 4,5%/thn)',
      growthProvenanceLabel: 'Asumsi pertumbuhan harga standar 8,0%/thn',
      hasActualDividendHistory: false,
      hasActualPriceHistory: false,
    };
  }

  let currentBalance = 0;
  let initialCapital = 0;
  let totalUnits = 0;
  let totalLoggedDividends = 0;
  let dividendLogCount = 0;
  let earliestDateMs = now.getTime();
  let weightedPriceCagrSum = 0;
  let weightedPriceWeight = 0;
  let hasActualPriceHistory = false;

  targets.forEach((asset) => {
    const assetBalance = Math.max(0, asset.balance || 0);
    const assetCap = Math.max(
      0,
      asset.initialCapital !== undefined ? asset.initialCapital : assetBalance
    );
    const assetUnits = Math.max(0, asset.quantity ?? asset.units ?? 1);

    currentBalance += assetBalance;
    initialCapital += assetCap;
    totalUnits += assetUnits;

    const addedDate = parseLocalDate(asset.dateAdded);
    if (addedDate && addedDate.getTime() < earliestDateMs) {
      earliestDateMs = addedDate.getTime();
    }

    // Match dividend transactions logged in ledger for this asset
    const matchedDividendTxs = transactions.filter((tx) => {
      if (tx.type !== 'income') return false;
      if (tx.linkedInvestmentId && tx.linkedInvestmentId === asset.id) return true;
      const isDivCategory =
        (tx.category || '').toLowerCase().includes('dividen') ||
        (tx.category || '').toLowerCase().includes('hasil investasi');
      return (
        isDivCategory &&
        (tx.description || '').toLowerCase().includes((asset.name || '').toLowerCase())
      );
    });

    const txDivSum = matchedDividendTxs.reduce(
      (sum, tx) => sum + Math.abs(tx.amount || 0),
      0
    );
    dividendLogCount += matchedDividendTxs.length;

    const assetDivTotal = Math.max(asset.dividendsOrInterest || 0, txDivSum);
    totalLoggedDividends += assetDivTotal;

    // Derive price CAGR per asset from priceHistory or purchase vs current price
    const sortedHistory = (asset.priceHistory || [])
      .filter((pt) => (pt.unitPrice || 0) > 0 && pt.date)
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date));

    let assetAnnualGrowth: number | null = null;
    if (sortedHistory.length >= 2) {
      const firstPt = sortedHistory[0];
      const lastPt = sortedHistory[sortedHistory.length - 1];
      const d1 = parseLocalDate(firstPt.date);
      const d2 = parseLocalDate(lastPt.date);
      if (d1 && d2 && firstPt.unitPrice > 0 && lastPt.unitPrice > 0) {
        const spanDays = Math.max(30, (d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
        const years = spanDays / 365;
        const cagr = (Math.pow(lastPt.unitPrice / firstPt.unitPrice, 1 / years) - 1) * 100;
        if (Number.isFinite(cagr)) {
          assetAnnualGrowth = Math.max(-15, Math.min(35, cagr));
          hasActualPriceHistory = true;
        }
      }
    }

    if (assetAnnualGrowth === null && asset.purchaseUnitPrice && asset.purchaseUnitPrice > 0) {
      const currentUnit =
        asset.currentUnitPrice ||
        asset.unitPrice ||
        (assetUnits > 0 ? assetBalance / assetUnits : 0);
      if (currentUnit > 0 && addedDate) {
        const spanDays = Math.max(30, (now.getTime() - addedDate.getTime()) / (1000 * 60 * 60 * 24));
        const years = spanDays / 365;
        const cagr = (Math.pow(currentUnit / asset.purchaseUnitPrice, 1 / years) - 1) * 100;
        if (Number.isFinite(cagr)) {
          assetAnnualGrowth = Math.max(-15, Math.min(35, cagr));
          hasActualPriceHistory = true;
        }
      }
    }

    const weight = assetBalance > 0 ? assetBalance : 1;
    if (assetAnnualGrowth !== null) {
      weightedPriceCagrSum += assetAnnualGrowth * weight;
      weightedPriceWeight += weight;
    } else {
      const baseline = getCategoryBaselineAssumptions(asset.category);
      weightedPriceCagrSum += baseline.growthPct * weight;
      weightedPriceWeight += weight;
    }
  });

  const elapsedDays = Math.max(
    30,
    Math.round((now.getTime() - earliestDateMs) / (1000 * 60 * 60 * 24))
  );
  const holdingYears = Math.max(1 / 12, elapsedDays / 365);

  // Use average capital/balance denominator for realistic yield estimation
  const yieldBase = initialCapital > 0 ? initialCapital : currentBalance;
  const hasActualDividendHistory = totalLoggedDividends > 0 && yieldBase > 0;

  let suggestedDividendYieldPct = 0;
  let yieldProvenanceLabel = '';

  if (hasActualDividendHistory) {
    // If asset held < 1 year, annualize gently capped at realistic ceiling so newly added dividend logs remain practical
    const annualizingYears = Math.max(0.25, holdingYears);
    const annualizedDiv = totalLoggedDividends / annualizingYears;
    const rawYieldPct = (annualizedDiv / yieldBase) * 100;
    suggestedDividendYieldPct = Number(
      Math.max(0.1, Math.min(25, rawYieldPct)).toFixed(2)
    );
    yieldProvenanceLabel = `Dihitung dari histori dividen ${formatterIDR.format(
      totalLoggedDividends
    )} (${elapsedDays} hari kepemilikan)`;
  } else {
    // Weighted category baseline if no dividends logged yet
    let weightedYieldSum = 0;
    let totalWeight = 0;
    targets.forEach((asset) => {
      const w = asset.balance > 0 ? asset.balance : 1;
      weightedYieldSum += getCategoryBaselineAssumptions(asset.category).yieldPct * w;
      totalWeight += w;
    });
    suggestedDividendYieldPct = Number(
      (totalWeight > 0 ? weightedYieldSum / totalWeight : 4.5).toFixed(2)
    );
    yieldProvenanceLabel =
      targets.length === 1
        ? `Belum ada catatan dividen · Baseline kategori ${targets[0].category}`
        : 'Belum ada catatan dividen · Baseline rata-rata kategori portofolio';
  }

  const suggestedPriceGrowthPct = Number(
    (weightedPriceWeight > 0 ? weightedPriceCagrSum / weightedPriceWeight : 7.5).toFixed(2)
  );
  const growthProvenanceLabel = hasActualPriceHistory
    ? 'Disetahunkan dari riwayat perubahan harga unit'
    : 'Estimasi pertumbuhan harga berdasarkan kategori aset';

  const safeUnits = selectedAssetId === 'all' ? 1 : Math.max(1, totalUnits);
  const currentUnitPrice = safeUnits > 0 ? currentBalance / safeUnits : currentBalance;

  return {
    currentBalance,
    initialCapital,
    currentUnits: safeUnits,
    currentUnitPrice,
    totalLoggedDividends,
    dividendLogCount,
    holdingYears,
    suggestedDividendYieldPct,
    suggestedPriceGrowthPct,
    yieldProvenanceLabel,
    growthProvenanceLabel,
    hasActualDividendHistory,
    hasActualPriceHistory,
  };
}

const GENERIC_TICKER_WORDS = new Set([
  'PORTOFOLIO',
  'PORTFOLIO',
  'BANK',
  'PT',
  'TBK',
  'INDONESIA',
  'GLOBAL',
  'INCOME',
  'GROWTH',
  'SAHAM',
  'OBLIGASI',
  'REKSADANA',
  'REKSA',
  'DANA',
  'EMAS',
  'LOGAM',
  'MULIA',
  'KRIPTO',
  'CRYPTO',
  'DEPOSITO',
  'PASAR',
  'UANG',
  'CAMPURAN',
  'PENDAPATAN',
  'TETAP',
  'INDEKS',
  'DIVIDEN',
  'ASET',
  'INVESTASI',
  'BISNIS',
  'RIIL',
]);

function isGenericOrEmptyTicker(rawTicker: string): boolean {
  const cleaned = rawTicker.trim().toUpperCase();
  if (!cleaned) return true;
  if (GENERIC_TICKER_WORDS.has(cleaned)) return true;
  // Multi-word free text is not a normalized market ticker
  if (/\s+/.test(cleaned)) return true;
  return false;
}

function extractTickerFromAssetName(
  assetId: string,
  investments: InvestmentAsset[]
): string {
  if (assetId === 'all') return '';
  const target = investments.find((i) => i.id === assetId);
  if (!target?.name) return '';

  // Prioritize explicit ticker inside parentheses e.g. "Bank Central Asia (BBCA)"
  const parenMatch = target.name.match(/\(([A-Za-z0-9]{2,6}(?:\.[A-Za-z]{1,4})?)\)/);
  if (parenMatch && !GENERIC_TICKER_WORDS.has(parenMatch[1].toUpperCase())) {
    return parenMatch[1].toUpperCase();
  }

  const cleaned = target.name
    .replace(/\b(saham|reksadana|reksa\s+dana|obligasi|sbn|etf|emas|logam\s+mulia|kripto|crypto)\b/gi, ' ')
    .replace(/[()]/g, ' ')
    .trim();
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  const tickerLike = tokens.find(
    (t) =>
      /^[A-Za-z]{3,6}(\.[A-Za-z]{1,4})?$/.test(t) &&
      !GENERIC_TICKER_WORDS.has(t.toUpperCase()) &&
      (t === t.toUpperCase() || t.includes('.'))
  );
  if (tickerLike) return tickerLike.toUpperCase();

  const fallbackCode = tokens.find(
    (t) =>
      /^[A-Za-z]{4}(\.[A-Za-z]{1,4})?$/.test(t) &&
      !GENERIC_TICKER_WORDS.has(t.toUpperCase())
  );
  return fallbackCode ? fallbackCode.toUpperCase() : '';
}

interface AiYieldEstimate {
  tickerUsed: string;
  estimatedDividendYieldPct: number;
  estimatedPriceGrowthPct: number;
  suggestedPayoutFrequency: PayoutFrequency;
  rationale: string;
  sources: Array<{ title: string; uri: string }>;
  generatedAt: string;
}

export const DividendReinvestmentModal: React.FC<DividendReinvestmentModalProps> = ({
  isOpen,
  onClose,
  investments,
  transactions = [],
  initialAssetId = null,
}) => {
  const defaultAssetId = initialAssetId || investments[0]?.id || 'all';
  const [selectedAssetId, setSelectedAssetId] = useState<string>(defaultAssetId);
  const [horizonYears, setHorizonYears] = useState<number>(10);
  const [annualDividendYieldPct, setAnnualDividendYieldPct] = useState<number>(4.5);
  const [annualPriceGrowthPct, setAnnualPriceGrowthPct] = useState<number>(8.0);
  const [payoutFrequency, setPayoutFrequency] = useState<PayoutFrequency>('annually');
  const [dividendTaxPct, setDividendTaxPct] = useState<number>(0);
  const [monthlyDca, setMonthlyDca] = useState<number>(1000000);
  const [annualDividendGrowthPct, setAnnualDividendGrowthPct] = useState<number>(3.0);
  const [isManuallyEdited, setIsManuallyEdited] = useState<boolean>(false);
  const [showBreakdownTable, setShowBreakdownTable] = useState<boolean>(false);
  const [aiYieldStatus, setAiYieldStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [aiYieldResult, setAiYieldResult] = useState<AiYieldEstimate | null>(null);
  const [aiYieldError, setAiYieldError] = useState<string | null>(null);
  const [tickerInput, setTickerInput] = useState<string>(() =>
    extractTickerFromAssetName(defaultAssetId, investments)
  );
  const [yieldPrepopulatedFromAi, setYieldPrepopulatedFromAi] = useState<boolean>(false);

  // Sync selected asset when modal opens or row asset changes
  useEffect(() => {
    if (!isOpen) return;
    const resolvedId = initialAssetId || investments[0]?.id || 'all';
    setSelectedAssetId(resolvedId);
    setTickerInput(extractTickerFromAssetName(resolvedId, investments));
    const derived = deriveAssetHistoricalTrends(resolvedId, investments, transactions);
    setAnnualDividendYieldPct(derived.suggestedDividendYieldPct);
    setAnnualPriceGrowthPct(derived.suggestedPriceGrowthPct);
    setIsManuallyEdited(false);
    setYieldPrepopulatedFromAi(false);
    setAiYieldStatus('idle');
    setAiYieldResult(null);
    setAiYieldError(null);
  }, [isOpen, initialAssetId, investments, transactions]);

  const historicalTrend = useMemo(
    () => deriveAssetHistoricalTrends(selectedAssetId, investments, transactions),
    [selectedAssetId, investments, transactions]
  );

  const handleAssetChange = (nextId: string) => {
    setSelectedAssetId(nextId);
    setTickerInput(extractTickerFromAssetName(nextId, investments));
    const derived = deriveAssetHistoricalTrends(nextId, investments, transactions);
    setAnnualDividendYieldPct(derived.suggestedDividendYieldPct);
    setAnnualPriceGrowthPct(derived.suggestedPriceGrowthPct);
    setIsManuallyEdited(false);
    setYieldPrepopulatedFromAi(false);
    setAiYieldStatus('idle');
    setAiYieldResult(null);
    setAiYieldError(null);
  };

  const resetToHistoricalTrends = () => {
    setAnnualDividendYieldPct(historicalTrend.suggestedDividendYieldPct);
    setAnnualPriceGrowthPct(historicalTrend.suggestedPriceGrowthPct);
    setIsManuallyEdited(false);
    setYieldPrepopulatedFromAi(false);
  };

  const handleFetchAiYield = async () => {
    const targetAsset = investments.find((i) => i.id === selectedAssetId);
    const queryName =
      selectedAssetId === 'all'
        ? `Portofolio Campuran (${investments.map((i) => i.name).slice(0, 5).join(', ')})`
        : targetAsset?.name || 'Portofolio Investasi';
    const queryCategory =
      selectedAssetId === 'all'
        ? 'Portofolio Multi-Aset Indonesia'
        : targetAsset?.category || 'Investasi';
    const rawInputTicker = tickerInput.trim().toUpperCase();
    const shouldExtractTicker = isGenericOrEmptyTicker(rawInputTicker);

    setAiYieldStatus('loading');
    setAiYieldError(null);

    try {
      const response = await fetch('/api/estimate-asset-yield', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker: rawInputTicker,
          shouldExtractTicker,
          assetName: queryName,
          category: queryCategory,
          currentBalance: historicalTrend.currentBalance,
          localYieldPct: historicalTrend.suggestedDividendYieldPct,
          localGrowthPct: historicalTrend.suggestedPriceGrowthPct,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          payload?.error || 'Gagal mengambil data pasar dari layanan AI.'
        );
      }

      const resolvedTicker = String(
        payload.extractedTicker || rawInputTicker || extractTickerFromAssetName(selectedAssetId, investments) || queryName
      )
        .trim()
        .toUpperCase();

      const fetchedYield = Number(
        (Number(payload.estimatedDividendYieldPct) || 0).toFixed(2)
      );
      const fetchedGrowth = Number(
        (Number(payload.estimatedPriceGrowthPct) || 0).toFixed(2)
      );
      const fetchedFrequency: PayoutFrequency =
        payload.suggestedPayoutFrequency === 'monthly' ||
        payload.suggestedPayoutFrequency === 'quarterly'
          ? payload.suggestedPayoutFrequency
          : 'annually';

      if (resolvedTicker) {
        setTickerInput(resolvedTicker);
      }

      setAiYieldResult({
        tickerUsed: resolvedTicker || rawInputTicker,
        estimatedDividendYieldPct: fetchedYield,
        estimatedPriceGrowthPct: fetchedGrowth,
        suggestedPayoutFrequency: fetchedFrequency,
        rationale: String(payload.rationale || ''),
        sources: Array.isArray(payload.sources) ? payload.sources : [],
        generatedAt: String(payload.generatedAt || ''),
      });

      // Automatically pre-populate Expected Dividend Yield field immediately after fetch
      setAnnualDividendYieldPct(fetchedYield);
      setYieldPrepopulatedFromAi(true);
      setIsManuallyEdited(true);
      setAiYieldStatus('success');
    } catch (err: any) {
      setAiYieldStatus('error');
      setAiYieldError(
        err?.message || 'Tidak dapat menghubungi layanan AI untuk mengambil data pasar.'
      );
    }
  };

  const applyAiGrowthAndFrequency = () => {
    if (!aiYieldResult) return;
    setAnnualDividendYieldPct(
      Number(aiYieldResult.estimatedDividendYieldPct.toFixed(2))
    );
    setAnnualPriceGrowthPct(Number(aiYieldResult.estimatedPriceGrowthPct.toFixed(2)));
    setPayoutFrequency(aiYieldResult.suggestedPayoutFrequency);
    setYieldPrepopulatedFromAi(true);
    setIsManuallyEdited(true);
  };

  const simulation = useMemo(() => {
    const safeHorizon = Math.max(1, Math.min(30, Math.round(horizonYears || 1)));
    const totalMonths = safeHorizon * 12;
    const baseBalance = Math.max(0, historicalTrend.currentBalance);
    const baseCapital = Math.max(0, historicalTrend.initialCapital);
    const baseUnits = Math.max(1, historicalTrend.currentUnits);
    const baseUnitPrice =
      historicalTrend.currentUnitPrice > 0
        ? historicalTrend.currentUnitPrice
        : baseBalance > 0
        ? baseBalance / baseUnits
        : 1000;

    const monthlyPriceRate =
      Math.pow(Math.max(0.01, 1 + (annualPriceGrowthPct || 0) / 100), 1 / 12) - 1;
    const netFactor = Math.max(0, 1 - Math.max(0, Math.min(100, dividendTaxPct || 0)) / 100);
    const payoutIntervalMonths =
      payoutFrequency === 'monthly' ? 1 : payoutFrequency === 'quarterly' ? 3 : 12;

    let dripBalance = baseBalance;
    let dripUnits = baseUnits;
    let dripPendingDividend = 0;
    let dripAnnualDivThisYear = 0;
    let dripCumulativeDivReinvested = 0;

    let cashAssetBalance = baseBalance;
    let cashDividendsPocketed = 0;
    let cashPendingDividend = 0;
    let cashAnnualDivThisYear = 0;

    let projectedUnitPrice = baseUnitPrice;
    let cumulativeDca = 0;

    const yearlyRows: YearlyComparisonRow[] = [
      {
        year: 0,
        label: 'Saat Ini',
        totalCapitalInvested: Math.round(baseCapital),
        dripTotalValue: Math.round(baseBalance),
        dripAnnualNetDividend: 0,
        dripUnitsEstimate: Number(baseUnits.toFixed(2)),
        cashTotalWealth: Math.round(baseBalance),
        cashAssetOnlyValue: Math.round(baseBalance),
        cashCumulativeDividends: 0,
        cashAnnualNetDividend: 0,
        dripAdvantage: 0,
      },
    ];

    for (let m = 1; m <= totalMonths; m++) {
      const yearIndex = Math.floor((m - 1) / 12);
      const divGrowthMultiplier = Math.pow(
        1 + Math.max(0, annualDividendGrowthPct || 0) / 100,
        yearIndex
      );
      const effectiveYieldRate =
        (Math.max(0, annualDividendYieldPct || 0) / 100) * divGrowthMultiplier;
      const monthlyDividendAccrualRate = effectiveYieldRate / 12;

      // 1. Capital price growth
      projectedUnitPrice = Math.max(1, projectedUnitPrice * (1 + monthlyPriceRate));
      dripBalance = dripBalance * (1 + monthlyPriceRate);
      cashAssetBalance = cashAssetBalance * (1 + monthlyPriceRate);

      // 2. Monthly DCA contribution (same for both scenarios)
      const safeDca = Math.max(0, monthlyDca || 0);
      if (safeDca > 0) {
        const addedDcaUnits = safeDca / projectedUnitPrice;
        dripBalance += safeDca;
        dripUnits += addedDcaUnits;
        cashAssetBalance += safeDca;
        cumulativeDca += safeDca;
      }

      // 3. Monthly dividend accrual
      dripPendingDividend += dripBalance * monthlyDividendAccrualRate;
      cashPendingDividend += cashAssetBalance * monthlyDividendAccrualRate;

      // 4. Payout settlement (DRIP reinvests net dividend into new units; Cash pockets net dividend)
      if (m % payoutIntervalMonths === 0 || m === totalMonths) {
        const netDripDiv = dripPendingDividend * netFactor;
        const netCashDiv = cashPendingDividend * netFactor;

        if (netDripDiv > 0) {
          dripBalance += netDripDiv;
          dripUnits += netDripDiv / projectedUnitPrice;
          dripAnnualDivThisYear += netDripDiv;
          dripCumulativeDivReinvested += netDripDiv;
        }
        if (netCashDiv > 0) {
          cashDividendsPocketed += netCashDiv;
          cashAnnualDivThisYear += netCashDiv;
        }

        dripPendingDividend = 0;
        cashPendingDividend = 0;
      }

      if (m % 12 === 0) {
        const yr = m / 12;
        const cashTotalWealth = cashAssetBalance + cashDividendsPocketed;
        yearlyRows.push({
          year: yr,
          label: `Thn ${yr}`,
          totalCapitalInvested: Math.round(baseCapital + cumulativeDca),
          dripTotalValue: Math.round(dripBalance),
          dripAnnualNetDividend: Math.round(dripAnnualDivThisYear),
          dripUnitsEstimate: Number(dripUnits.toFixed(2)),
          cashTotalWealth: Math.round(cashTotalWealth),
          cashAssetOnlyValue: Math.round(cashAssetBalance),
          cashCumulativeDividends: Math.round(cashDividendsPocketed),
          cashAnnualNetDividend: Math.round(cashAnnualDivThisYear),
          dripAdvantage: Math.round(dripBalance - cashTotalWealth),
        });
        dripAnnualDivThisYear = 0;
        cashAnnualDivThisYear = 0;
      }
    }

    const lastRow = yearlyRows[yearlyRows.length - 1];
    const extraAdvantagePct =
      lastRow.cashTotalWealth > 0
        ? (lastRow.dripAdvantage / lastRow.cashTotalWealth) * 100
        : 0;
    const unitGrowthFromDripPct =
      baseUnits > 0 && cumulativeDca === 0
        ? ((dripUnits - baseUnits) / baseUnits) * 100
        : 0;

    return {
      yearlyRows,
      lastRow,
      extraAdvantagePct,
      dripCumulativeDivReinvested: Math.round(dripCumulativeDivReinvested),
      unitGrowthFromDripPct,
      safeHorizon,
    };
  }, [
    historicalTrend,
    horizonYears,
    annualDividendYieldPct,
    annualPriceGrowthPct,
    payoutFrequency,
    dividendTaxPct,
    monthlyDca,
    annualDividendGrowthPct,
  ]);

  if (!isOpen) return null;

  const selectedAsset = investments.find((i) => i.id === selectedAssetId);
  const assetLabel =
    selectedAssetId === 'all'
      ? `Seluruh Portofolio (${investments.length} Aset)`
      : selectedAsset?.name || 'Aset Terpilih';

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-5xl w-full shadow-xl overflow-hidden my-6">
        {/* Header */}
        <div className="px-6 py-5 bg-slate-900 text-white flex items-center justify-between gap-4 border-b border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 bg-emerald-500/20 border border-emerald-400/30 rounded-xl text-emerald-300 shrink-0">
              <RefreshCw className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base sm:text-lg font-bold tracking-tight text-white truncate">
                Kalkulator Reinvestasi Dividen (DRIP)
              </h3>
              <p className="text-xs text-slate-300 truncate">
                Simulasi dampak jangka panjang pemutaran dividen otomatis vs dividen tunai
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup modal"
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[82vh] overflow-y-auto">
          {/* Asset Selection + Historical Provenance Strip */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
              <div className="lg:col-span-5 min-w-0">
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Aset Investasi Target
                </label>
                <select
                  value={selectedAssetId}
                  onChange={(e) => handleAssetChange(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {investments.length > 0 && (
                    <option value="all">
                      Seluruh Portofolio Finansial ({investments.length} Aset ·{' '}
                      {formatterIDR.format(
                        investments.reduce((s, a) => s + (a.balance || 0), 0)
                      )}
                      )
                    </option>
                  )}
                  {investments.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.name} ({inv.category}) · {formatterIDR.format(inv.balance || 0)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="lg:col-span-3 min-w-0">
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Ticker / Simbol Pasar
                </label>
                <input
                  type="text"
                  value={tickerInput}
                  onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
                  placeholder="Otomatis via AI / isi mis. BBCA"
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-mono font-bold uppercase text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="lg:col-span-4 flex items-center justify-start lg:justify-end gap-2 flex-wrap">
                {investments.length > 0 && (
                  <button
                    type="button"
                    onClick={handleFetchAiYield}
                    disabled={aiYieldStatus === 'loading'}
                    title="Ambil rata-rata dividend yield pasar terkini menggunakan Gemini AI berdasarkan ticker aset"
                    className="px-3.5 py-2.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 rounded-xl transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Sparkles
                      className={`h-3.5 w-3.5 ${
                        aiYieldStatus === 'loading' ? 'animate-spin' : ''
                      }`}
                    />
                    {aiYieldStatus === 'loading'
                      ? 'Mengambil Data Pasar...'
                      : 'Ambil Data Pasar'}
                  </button>
                )}
                {isManuallyEdited && (
                  <button
                    type="button"
                    onClick={resetToHistoricalTrends}
                    className="px-3 py-2.5 text-xs font-semibold text-emerald-700 bg-white border border-emerald-300 hover:bg-emerald-50 rounded-xl transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reset ke Tren Historis
                  </button>
                )}
              </div>
            </div>

            {/* Clean unboxed historical provenance metadata */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 pt-2 border-t border-slate-200/80">
              <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                <Info className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                Basis Tren Historis ({assetLabel})
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums text-slate-700">
                Saldo: <strong>{formatterIDR.format(historicalTrend.currentBalance)}</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>{historicalTrend.yieldProvenanceLabel}</span>
              <span aria-hidden="true">·</span>
              <span>{historicalTrend.growthProvenanceLabel}</span>
            </div>

            {/* Optional AI Market Yield Result / Error Strip */}
            {aiYieldStatus === 'error' && aiYieldError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">Gagal mengambil data pasar AI:</span>{' '}
                  {aiYieldError}
                </div>
              </div>
            )}

            {aiYieldStatus === 'success' && aiYieldResult && (
              <div className="p-3.5 bg-white border border-indigo-200 rounded-lg space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span className="inline-flex items-center gap-1 font-bold text-indigo-700">
                      <Sparkles className="h-3.5 w-3.5 shrink-0" />
                      Data Pasar AI ({aiYieldResult.tickerUsed})
                    </span>
                    <span aria-hidden="true" className="text-slate-300">·</span>
                    <span className="font-mono tabular-nums text-emerald-700 font-semibold">
                      Yield Diterapkan: {aiYieldResult.estimatedDividendYieldPct.toFixed(2)}%/thn
                    </span>
                    <span aria-hidden="true" className="text-slate-300">·</span>
                    <span className="font-mono tabular-nums text-slate-800">
                      Est. Harga: <strong>{aiYieldResult.estimatedPriceGrowthPct.toFixed(2)}%/thn</strong>
                    </span>
                    <span aria-hidden="true" className="text-slate-300">·</span>
                    <span className="text-slate-600">
                      Frekuensi:{' '}
                      <strong>
                        {aiYieldResult.suggestedPayoutFrequency === 'monthly'
                          ? 'Bulanan'
                          : aiYieldResult.suggestedPayoutFrequency === 'quarterly'
                          ? 'Kuartalan'
                          : 'Tahunan'}
                      </strong>
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={applyAiGrowthAndFrequency}
                    className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-semibold rounded-lg transition inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Terapkan Juga Growth &amp; Frekuensi
                  </button>
                </div>
                {aiYieldResult.rationale && (
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {aiYieldResult.rationale}
                  </p>
                )}
                {aiYieldResult.sources.length > 0 && (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 pt-1">
                    <span>Sumber referensi:</span>
                    {aiYieldResult.sources.map((src, idx) => (
                      <a
                        key={`${src.uri}-${idx}`}
                        href={src.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-indigo-600 hover:underline"
                      >
                        {src.title}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Simulation Parameter Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Expected Dividend Yield (%/Thn)
                </label>
                <input
                  type="number"
                  min={0}
                  max={50}
                  step={0.1}
                  value={annualDividendYieldPct}
                  onChange={(e) => {
                    setAnnualDividendYieldPct(Math.max(0, Number(e.target.value) || 0));
                    setYieldPrepopulatedFromAi(false);
                    setIsManuallyEdited(true);
                  }}
                  className={`w-full px-3 py-2 border rounded-lg text-sm font-mono tabular-nums font-bold text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                    yieldPrepopulatedFromAi
                      ? 'bg-emerald-50/40 border-emerald-400'
                      : 'bg-white border-slate-300'
                  }`}
                />
                <span className="text-[11px] text-slate-500 font-mono tabular-nums block mt-1">
                  {yieldPrepopulatedFromAi && aiYieldResult
                    ? `Terisi otomatis dari data pasar ${aiYieldResult.tickerUsed}`
                    : `Historis: ${historicalTrend.suggestedDividendYieldPct.toFixed(2)}%/thn`}
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Pertumbuhan Harga / Tahun (%)
                </label>
                <input
                  type="number"
                  min={-20}
                  max={50}
                  step={0.1}
                  value={annualPriceGrowthPct}
                  onChange={(e) => {
                    setAnnualPriceGrowthPct(Number(e.target.value) || 0);
                    setIsManuallyEdited(true);
                  }}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-mono tabular-nums font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <span className="text-[11px] text-slate-500 font-mono tabular-nums block mt-1">
                  Historis: {historicalTrend.suggestedPriceGrowthPct.toFixed(2)}%/thn
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Horizon Simulasi ({simulation.safeHorizon} Tahun)
                </label>
                <input
                  type="range"
                  min={1}
                  max={30}
                  value={horizonYears}
                  onChange={(e) => setHorizonYears(Number(e.target.value))}
                  className="w-full accent-emerald-600 cursor-pointer mt-2"
                />
                <div className="flex justify-between text-[11px] text-slate-400 font-mono tabular-nums mt-0.5">
                  <span>1 thn</span>
                  <span>15 thn</span>
                  <span>30 thn</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Setoran Rutin Bulanan (DCA)
                </label>
                <FormattedNumberInput
                  value={monthlyDca}
                  onChange={(_, numVal) => setMonthlyDca(Math.max(0, numVal))}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-mono tabular-nums font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="Rp 0"
                />
                <span className="text-[11px] text-slate-500 block mt-1">
                  Tambahan investasi tiap bulan
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Frekuensi Pembagian Dividen
                </label>
                <div className="grid grid-cols-3 gap-1 p-1 bg-slate-200/70 rounded-lg">
                  {(
                    [
                      { id: 'monthly', label: 'Bulanan' },
                      { id: 'quarterly', label: 'Kuartal' },
                      { id: 'annually', label: 'Tahunan' },
                    ] as const
                  ).map((freq) => (
                    <button
                      key={freq.id}
                      type="button"
                      onClick={() => setPayoutFrequency(freq.id)}
                      className={`py-1.5 px-2 text-xs font-semibold rounded-md transition cursor-pointer whitespace-nowrap ${
                        payoutFrequency === freq.id
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {freq.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Pajak Dividen (%)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={35}
                    step={0.5}
                    value={dividendTaxPct}
                    onChange={(e) =>
                      setDividendTaxPct(Math.max(0, Math.min(35, Number(e.target.value) || 0)))
                    }
                    className="w-24 px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-mono tabular-nums font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setDividendTaxPct(0)}
                      className={`px-2 py-1.5 text-[11px] font-semibold rounded-lg border cursor-pointer transition whitespace-nowrap ${
                        dividendTaxPct === 0
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                      title="Dividen bebas PPh jika diinvestasikan kembali di dalam negeri (UU Cipta Kerja)"
                    >
                      0%
                    </button>
                    <button
                      type="button"
                      onClick={() => setDividendTaxPct(10)}
                      className={`px-2 py-1.5 text-[11px] font-semibold rounded-lg border cursor-pointer transition whitespace-nowrap ${
                        dividendTaxPct === 10
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                      title="Tarif PPh Final dividen OP 10%"
                    >
                      10%
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Kenaikan Dividen / Tahun (%)
                </label>
                <input
                  type="number"
                  min={0}
                  max={25}
                  step={0.5}
                  value={annualDividendGrowthPct}
                  onChange={(e) =>
                    setAnnualDividendGrowthPct(Math.max(0, Number(e.target.value) || 0))
                  }
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-mono tabular-nums font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <span className="text-[11px] text-slate-500 block mt-1">
                  Asumsi pertumbuhan rasio payout
                </span>
              </div>

              <div className="flex flex-col justify-center bg-white border border-slate-200 rounded-lg px-3.5 py-2.5">
                <span className="text-[11px] text-slate-500 font-medium">
                  Total Modal Disetor ({simulation.safeHorizon} Thn)
                </span>
                <span className="text-sm font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                  {formatterIDR.format(simulation.lastRow.totalCapitalInvested)}
                </span>
              </div>
            </div>
          </div>

          {investments.length === 0 ? (
            <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <Coins className="h-8 w-8 text-slate-400 mx-auto" />
              <p className="text-sm font-semibold text-slate-700">
                Belum ada aset investasi tercatat untuk disimulasikan.
              </p>
              <p className="text-xs text-slate-500">
                Tambahkan aset investasi terlebih dahulu agar kalkulator dapat membaca saldo dan tren historisnya.
              </p>
            </div>
          ) : (
            <>
              {/* 4 KPI Summary Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 bg-white border border-emerald-200 rounded-xl">
                  <span className="text-xs font-semibold text-emerald-700 block">
                    Proyeksi Akhir (Dengan DRIP)
                  </span>
                  <div className="text-lg font-extrabold text-slate-900 font-mono tabular-nums mt-1">
                    {formatterIDR.format(simulation.lastRow.dripTotalValue)}
                  </div>
                  <span className="text-[11px] text-slate-500 font-mono tabular-nums block mt-1">
                    Akumulasi dividen diputar: {formatterIDR.format(simulation.dripCumulativeDivReinvested)}
                  </span>
                </div>

                <div className="p-4 bg-white border border-slate-200 rounded-xl">
                  <span className="text-xs font-semibold text-slate-600 block">
                    Tanpa Reinvestasi (Dividen Tunai)
                  </span>
                  <div className="text-lg font-extrabold text-slate-900 font-mono tabular-nums mt-1">
                    {formatterIDR.format(simulation.lastRow.cashTotalWealth)}
                  </div>
                  <span className="text-[11px] text-slate-500 font-mono tabular-nums block mt-1">
                    Aset {formatterIDR.format(simulation.lastRow.cashAssetOnlyValue)} · Kas{' '}
                    {formatterIDR.format(simulation.lastRow.cashCumulativeDividends)}
                  </span>
                </div>

                <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-xl">
                  <span className="text-xs font-semibold text-emerald-800 block">
                    Keunggulan Ekstra DRIP
                  </span>
                  <div className="text-lg font-extrabold text-emerald-700 font-mono tabular-nums mt-1">
                    +{formatterIDR.format(Math.max(0, simulation.lastRow.dripAdvantage))}
                  </div>
                  <span className="text-[11px] text-emerald-800 font-mono tabular-nums block mt-1">
                    +{Math.max(0, simulation.extraAdvantagePct).toFixed(2)}% lebih tinggi dari Non-DRIP
                  </span>
                </div>

                <div className="p-4 bg-white border border-slate-200 rounded-xl">
                  <span className="text-xs font-semibold text-slate-600 block">
                    Dividen Tahun ke-{simulation.safeHorizon}
                  </span>
                  <div className="text-lg font-extrabold text-indigo-700 font-mono tabular-nums mt-1">
                    {formatterIDR.format(simulation.lastRow.dripAnnualNetDividend)}
                  </div>
                  <span className="text-[11px] text-slate-500 font-mono tabular-nums block mt-1">
                    vs Tanpa DRIP: {formatterIDR.format(simulation.lastRow.cashAnnualNetDividend)}/thn
                  </span>
                </div>
              </div>

              {/* Dual-Curve Comparison Chart */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-emerald-600" />
                      Perbandingan Pertumbuhan Kekayaan: DRIP vs Dividen Tunai
                    </h4>
                    <p className="text-xs text-slate-500">
                      Efek bunga berbunga dari reinvestasi dividen bersih pajak selama{' '}
                      {simulation.safeHorizon} tahun
                    </p>
                  </div>
                </div>

                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={simulation.yearlyRows}
                      margin={{ top: 10, right: 16, left: 8, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="dripGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#059669" stopOpacity={0.28} />
                          <stop offset="95%" stopColor="#059669" stopOpacity={0.02} />
                        </linearGradient>
                        <linearGradient id="cashGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.18} />
                          <stop offset="95%" stopColor="#4f46e5" stopOpacity={0.01} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} />
                      <YAxis
                        tickFormatter={(v) =>
                          v >= 1_000_000_000
                            ? `${(v / 1_000_000_000).toFixed(1)}M`
                            : v >= 1_000_000
                            ? `${(v / 1_000_000).toFixed(0)}jt`
                            : `${v}`
                        }
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        width={56}
                      />
                      <Tooltip
                        formatter={(value: number, name: string) => [
                          formatterIDR.format(value),
                          name,
                        ]}
                        contentStyle={{
                          borderRadius: '10px',
                          border: '1px solid #e2e8f0',
                          fontSize: '12px',
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '12px' }} />
                      <Area
                        type="monotone"
                        dataKey="dripTotalValue"
                        name="Nilai Akhir Dengan DRIP"
                        stroke="#059669"
                        strokeWidth={2.5}
                        fill="url(#dripGradient)"
                      />
                      <Area
                        type="monotone"
                        dataKey="cashTotalWealth"
                        name="Tanpa DRIP (Aset + Kas Dividen)"
                        stroke="#4f46e5"
                        strokeWidth={2}
                        fill="url(#cashGradient)"
                      />
                      <Area
                        type="monotone"
                        dataKey="totalCapitalInvested"
                        name="Total Modal Disetor"
                        stroke="#94a3b8"
                        strokeWidth={1.5}
                        strokeDasharray="4 4"
                        fill="none"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Collapsible Year-by-Year Breakdown Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                <button
                  type="button"
                  onClick={() => setShowBreakdownTable((prev) => !prev)}
                  className="w-full px-5 py-3.5 bg-slate-50 hover:bg-slate-100 flex items-center justify-between text-xs font-bold text-slate-800 cursor-pointer transition"
                >
                  <span>Rincian Proyeksi Tahunan DRIP vs Dividen Tunai</span>
                  {showBreakdownTable ? (
                    <ChevronUp className="h-4 w-4 text-slate-500" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-slate-500" />
                  )}
                </button>

                {showBreakdownTable && (
                  <div className="overflow-x-auto max-h-72">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 sticky top-0">
                        <tr>
                          <th className="py-2.5 px-4 font-semibold">Periode</th>
                          <th className="py-2.5 px-4 font-semibold text-right">Modal Disetor</th>
                          <th className="py-2.5 px-4 font-semibold text-right">Nilai Dengan DRIP</th>
                          <th className="py-2.5 px-4 font-semibold text-right">Dividen/Thn (DRIP)</th>
                          <th className="py-2.5 px-4 font-semibold text-right">Total Non-DRIP</th>
                          <th className="py-2.5 px-4 font-semibold text-right">Selisih DRIP</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                        {simulation.yearlyRows.map((row) => (
                          <tr key={row.year} className="hover:bg-slate-50">
                            <td className="py-2.5 px-4 font-sans font-semibold text-slate-800">
                              {row.label}
                            </td>
                            <td className="py-2.5 px-4 text-right text-slate-600">
                              {formatterIDR.format(row.totalCapitalInvested)}
                            </td>
                            <td className="py-2.5 px-4 text-right font-bold text-emerald-700">
                              {formatterIDR.format(row.dripTotalValue)}
                            </td>
                            <td className="py-2.5 px-4 text-right text-emerald-600">
                              {formatterIDR.format(row.dripAnnualNetDividend)}
                            </td>
                            <td className="py-2.5 px-4 text-right text-slate-700">
                              {formatterIDR.format(row.cashTotalWealth)}
                            </td>
                            <td className="py-2.5 px-4 text-right font-bold text-emerald-700">
                              +{formatterIDR.format(Math.max(0, row.dripAdvantage))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
