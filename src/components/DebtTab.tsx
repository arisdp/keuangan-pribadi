import React, { useState, useMemo } from 'react';
import { Debt, Account, Transaction, KprPreset, KprCoaMappingConfig } from '../types';
import { FormattedNumberInput } from './FormattedNumberInput';
import { KprAmortizationChart, computeKprSchedule } from './KprAmortizationChart';
import {
  DEFAULT_KPR_PRESETS,
  DEFAULT_KPR_COA_MAPPING,
  calculateKprClosingCosts,
  resolveEffectiveKprCoaMapping,
} from '../utils/kprPresets';
import {
  applyAccountBalanceChange,
  getAccountCreditBill,
  getCreditOverlimitAmount,
  getTransactionAccountDelta,
  isCreditAccount,
  normalizeAbsAmount,
  parseLocalDate,
  toLocalYYYYMMDD,
} from '../utils/accountingEngine';
import {
  Calculator,
  ListOrdered,
  AlertCircle,
  Plus,
  Trash2,
  ShieldAlert,
  ArrowLeftRight,
  Info,
  Calendar,
  Clock,
  Zap,
  Sparkles,
  Home,
  ChevronDown,
  ChevronUp,
  Wallet,
  CheckCircle2,
  Landmark,
  ShieldCheck,
  AlertTriangle,
  TrendingUp,
  BarChart3,
  Percent,
  Edit3,
  RotateCcw,
} from 'lucide-react';

export function getDaysUntilDue(dueDate?: string, dueDay?: number) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (dueDate) {
    const due = parseLocalDate(dueDate);
    if (!due) return { days: null, text: '-', status: 'none' as const };
    due.setHours(0, 0, 0, 0);
    const diffTime = due.getTime() - today.getTime();
    const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (days < 0) {
      return { days, text: `Terlewat ${Math.abs(days)} hari!`, status: 'urgent' as const };
    } else if (days === 0) {
      return { days, text: 'HARI INI!', status: 'urgent' as const };
    } else if (days <= 3) {
      return { days, text: `${days} hari lagi`, status: 'urgent' as const };
    } else if (days <= 7) {
      return { days, text: `${days} hari lagi`, status: 'warning' as const };
    } else {
      return { days, text: `${days} hari lagi`, status: 'safe' as const };
    }
  }

  if (dueDay && dueDay >= 1 && dueDay <= 31) {
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    const currentDay = today.getDate();

    let targetDate = new Date(currentYear, currentMonth, dueDay);
    if (dueDay < currentDay) {
      targetDate = new Date(currentYear, currentMonth + 1, dueDay);
    }
    targetDate.setHours(0, 0, 0, 0);

    const diffTime = targetDate.getTime() - today.getTime();
    const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return { days, text: `HARI INI (Tgl ${dueDay})!`, status: 'urgent' as const };
    } else if (days <= 3) {
      return { days, text: `${days} hari lagi (Tgl ${dueDay})`, status: 'urgent' as const };
    } else if (days <= 7) {
      return { days, text: `${days} hari lagi (Tgl ${dueDay})`, status: 'warning' as const };
    } else {
      return { days, text: `${days} hari lagi (Tgl ${dueDay})`, status: 'safe' as const };
    }
  }

  return { days: null, text: '-', status: 'none' as const };
}

interface DebtTabProps {
  debts: Debt[];
  accounts: Account[];
  transactions?: Transaction[];
  kprPresets?: KprPreset[];
  kprCoaMapping?: KprCoaMappingConfig;
  onAddDebt: (
    debt: Omit<Debt, 'id'>,
    bankLink?:
      | string
      | {
          accountId: string;
          linkAccount?: boolean;
          transactionType?: 'income' | 'expense';
          postKprInitialCostsToJournal?: boolean;
        }
  ) => void;
  onDeleteDebt: (id: string) => void;
  onNavigateToPayDebt?: (debtId?: string) => void;
}

export const DebtTab: React.FC<DebtTabProps> = ({
  debts,
  accounts,
  transactions = [],
  kprPresets = DEFAULT_KPR_PRESETS,
  kprCoaMapping = DEFAULT_KPR_COA_MAPPING,
  onAddDebt,
  onDeleteDebt,
  onNavigateToPayDebt,
}) => {
  // Custom Modal/Dialog States to replace window.confirm and window.alert
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const [alertModal, setAlertModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
  } | null>(null);

  const showConfirm = (title: string, message: string, onConfirm: () => void) => {
    setConfirmModal({ isOpen: true, title, message, onConfirm });
  };

  const showAlert = (title: string, message: string) => {
    setAlertModal({ isOpen: true, title, message });
  };

  // Strategy toggle
  const [strategy, setStrategy] = useState<'snowball' | 'avalanche'>('avalanche');

  // Add Debt form state
  const [name, setName] = useState('');
  const [balance, setBalance] = useState('');
  const [interestRate, setInterestRate] = useState('');
  const [minPayment, setMinPayment] = useState('');
  const [purpose, setPurpose] = useState<'productive' | 'consumptive'>('consumptive');
  const [category, setCategory] = useState('Pinjaman Bank / KTA');
  const [dueDayInput, setDueDayInput] = useState('');
  const [linkBankEnabled, setLinkBankEnabled] = useState<boolean>(false);
  const [addDisburseAccountId, setAddDisburseAccountId] = useState('');
  const [bankLinkTxType, setBankLinkTxType] = useState<'expense' | 'income'>('expense');

  // --- KPR (KREDIT PEMILIKAN RUMAH) CALCULATOR STATE ---
  const [kprName, setKprName] = useState('KPR Rumah Tinggal');
  const [kprPropertyPrice, setKprPropertyPrice] = useState<number>(500000000);
  const [kprDownPayment, setKprDownPayment] = useState<number>(100000000);
  const [kprTenorYears, setKprTenorYears] = useState<number>(15);
  const [kprScheme, setKprScheme] = useState<'annuity' | 'tiered' | 'flat'>('tiered');
  const [kprAnnualRate, setKprAnnualRate] = useState<number>(8.5);
  const [kprFixedRate, setKprFixedRate] = useState<number>(5.5);
  const [kprFixedYears, setKprFixedYears] = useState<number>(3);
  const [kprFloatingRate, setKprFloatingRate] = useState<number>(11.5);
  const [kprDueDay, setKprDueDay] = useState<number>(10);
  const [kprPurpose, setKprPurpose] = useState<'productive' | 'consumptive'>('productive');
  const [kprLinkBankEnabled, setKprLinkBankEnabled] = useState<boolean>(false);
  const [kprDisburseAccountId, setKprDisburseAccountId] = useState<string>('');
  const [kprBankTxType, setKprBankTxType] = useState<'expense' | 'income'>('expense');
  const [kprPostInitialFees, setKprPostInitialFees] = useState<boolean>(false);
  const [showKprAmortization, setShowKprAmortization] = useState<boolean>(false);
  const [kprVisualSource, setKprVisualSource] = useState<'calculator' | 'saved'>('calculator');
  const [selectedSavedKprId, setSelectedSavedKprId] = useState<string>('');
  const [selectedKprPresetId, setSelectedKprPresetId] = useState<string>(kprPresets[0]?.id || '');

  const activeKprPreset = useMemo(() => {
    return kprPresets.find((p) => p.id === selectedKprPresetId) || kprPresets[0] || DEFAULT_KPR_PRESETS[0];
  }, [kprPresets, selectedKprPresetId]);

  const effectiveKprCoa = useMemo(() => {
    return resolveEffectiveKprCoaMapping(kprCoaMapping, activeKprPreset);
  }, [kprCoaMapping, activeKprPreset]);

  const applyKprPreset = (preset: KprPreset) => {
    setSelectedKprPresetId(preset.id);
    setKprScheme(preset.scheme);
    setKprTenorYears(preset.tenorYears);
    setKprDownPayment(Math.round((kprPropertyPrice || 0) * (preset.dpPercent / 100)));
    setKprAnnualRate(preset.annualRate);
    setKprFixedRate(preset.fixedRate);
    setKprFixedYears(Math.min(preset.tenorYears, preset.fixedYears));
    setKprFloatingRate(preset.floatingRate);
  };

  // Debt Payment Capacity optional income simulation override
  const [customMonthlyIncome, setCustomMonthlyIncome] = useState<number | null>(null);
  const [isEditingIncome, setIsEditingIncome] = useState<boolean>(false);

  const formatterIDR = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

  const formatCompactIDR = (value: number) => {
    const absVal = Math.abs(value);
    if (absVal >= 1_000_000_000) return `Rp ${(value / 1_000_000_000).toFixed(1)}M`;
    if (absVal >= 1_000_000) return `Rp ${(value / 1_000_000).toFixed(1)}jt`;
    if (absVal >= 1_000) return `Rp ${Math.round(value / 1_000)}rb`;
    return `Rp ${Math.round(value)}`;
  };

  // Extract credit cards and paylaters into virtual debts
  const accountDebts = accounts
    .filter((acc) => isCreditAccount(acc))
    .map((acc) => {
      const defaultAPR = acc.type === 'credit-card' ? 21 : 24;
      const rate = acc.interestRate !== undefined ? acc.interestRate : defaultAPR;
      const bill = getAccountCreditBill(acc);
      const overlimitAmount = getCreditOverlimitAmount(acc);
      const calculatedMin = Math.max(bill * 0.1, bill > 0 ? 50000 : 0);
      const min = acc.minPayment !== undefined ? acc.minPayment : calculatedMin;

      return {
        id: acc.id,
        name: acc.name,
        balance: bill,
        overlimitAmount,
        remainingLimit: acc.currentBalance,
        interestRate: rate,
        minPayment: min,
        purpose: 'consumptive' as const,
        category: acc.type === 'credit-card' ? 'Kartu Kredit' : 'PayLater / Fintech',
        dueDay: acc.dueDay,
        isAccount: true,
      };
    });

  const allDebts = [
    ...debts.map(d => ({ ...d, isAccount: false })),
    ...accountDebts
  ];

  const liquidAccounts = accounts
    .filter(a => a.type !== 'credit-card' && a.type !== 'paylater')
    .sort((a, b) => (a.type === 'bank' ? -1 : 1) - (b.type === 'bank' ? -1 : 1));

  // Calculate order of payment based on selected strategy (only for debts with balance > 0)
  const getOrderedDebts = () => {
    const list = allDebts.filter(d => d.balance > 0);
    if (strategy === 'snowball') {
      // Order by balance ASC
      return list.sort((a, b) => a.balance - b.balance);
    } else {
      // Order by interest rate DESC
      return list.sort((a, b) => b.interestRate - a.interestRate);
    }
  };

  const orderedDebts = getOrderedDebts();
  const totalDebtBalance = allDebts.reduce((sum, d) => sum + d.balance, 0);
  const totalMinPayment = allDebts
    .filter((d) => d.balance > 0)
    .reduce((sum, d) => sum + d.minPayment, 0);

  // --- KPR CALCULATION MEMO ---
  const kprCalculation = useMemo(() => {
    const propertyPrice = Math.max(0, kprPropertyPrice || 0);
    const downPayment = Math.min(propertyPrice, Math.max(0, kprDownPayment || 0));
    const principal = Math.max(0, propertyPrice - downPayment);
    const dpPercent = propertyPrice > 0 ? (downPayment / propertyPrice) * 100 : 0;
    const tenorYears = Math.max(1, Math.min(35, kprTenorYears || 1));
    const tenorMonths = tenorYears * 12;

    const computed = computeKprSchedule({
      principal,
      tenorMonths,
      scheme: kprScheme,
      annualRate: kprAnnualRate,
      fixedRate: kprFixedRate,
      fixedYears: kprFixedYears,
      floatingRate: kprFloatingRate,
      isEstimate: false,
    });

    const closingCosts = calculateKprClosingCosts(propertyPrice, principal, activeKprPreset);

    return {
      ...computed,
      dpPercent,
      closingCosts,
      totalInitialCashNeeded: downPayment + closingCosts.totalClosingCosts,
    };
  }, [
    kprPropertyPrice,
    kprDownPayment,
    kprTenorYears,
    kprScheme,
    kprAnnualRate,
    kprFixedRate,
    kprFixedYears,
    kprFloatingRate,
    activeKprPreset,
  ]);

  // --- ACTIVE SAVED KPR DEBTS FOR AMORTIZATION VISUALIZATION ---
  const activeKprDebts = useMemo(
    () =>
      debts.filter(
        (d) =>
          d.balance > 0 &&
          (d.category === 'KPR / Properti' || Boolean(d.kprScheme) || /\bkpr\b/i.test(d.name))
      ),
    [debts]
  );

  // --- KAPASITAS PEMBAYARAN UTANG (DEBT-TO-INCOME RATIO) MEMO ---
  const debtCapacitySummary = useMemo(() => {
    const now = new Date();
    const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const incomeTxs = transactions.filter(
      (tx) =>
        tx.type === 'income' &&
        tx.category !== 'Mutasi Masuk' &&
        tx.category !== 'Mutasi Keluar' &&
        tx.linkedDebtAction !== 'create'
    );

    const currentMonthIncome = incomeTxs
      .filter((tx) => tx.date.startsWith(currentYM))
      .reduce((sum, tx) => sum + tx.amount, 0);

    let detectedMonthlyIncome = currentMonthIncome;
    let incomeSourceLabel = `Bulan Berjalan (${currentYM})`;

    if (detectedMonthlyIncome <= 0 && incomeTxs.length > 0) {
      const monthTotals = new Map<string, number>();
      incomeTxs.forEach((tx) => {
        const ym = tx.date.slice(0, 7);
        monthTotals.set(ym, (monthTotals.get(ym) || 0) + tx.amount);
      });
      const sortedMonths = Array.from(monthTotals.keys()).sort((a, b) => b.localeCompare(a));
      if (sortedMonths.length > 0) {
        const latestYM = sortedMonths[0];
        detectedMonthlyIncome = monthTotals.get(latestYM) || 0;
        incomeSourceLabel = `Bulan Terakhir Tercatat (${latestYM})`;
      }
    } else if (incomeTxs.length === 0) {
      incomeSourceLabel = 'Belum ada transaksi pendapatan tercatat';
    }

    const effectiveMonthlyIncome =
      customMonthlyIncome !== null ? Math.max(0, customMonthlyIncome) : detectedMonthlyIncome;

    if (customMonthlyIncome !== null) {
      incomeSourceLabel = 'Simulasi Pendapatan Manual';
    }

    const healthyLimitPct = 30;
    const healthyMaxInstallment = effectiveMonthlyIncome * (healthyLimitPct / 100);
    const hasIncome = effectiveMonthlyIncome > 0;
    const dtiRatio = hasIncome
      ? (totalMinPayment / effectiveMonthlyIncome) * 100
      : totalMinPayment > 0
      ? 100
      : 0;

    const excessOverHealthy = Math.max(0, totalMinPayment - healthyMaxInstallment);
    const remainingHealthyRoom = Math.max(0, healthyMaxInstallment - totalMinPayment);
    const freeCashAfterDebt = Math.max(0, effectiveMonthlyIncome - totalMinPayment);

    let status: 'empty' | 'very-healthy' | 'healthy' | 'warning' | 'danger' | 'no-income' = 'very-healthy';
    if (!hasIncome && totalMinPayment === 0) {
      status = 'empty';
    } else if (!hasIncome && totalMinPayment > 0) {
      status = 'no-income';
    } else if (dtiRatio > 40) {
      status = 'danger';
    } else if (dtiRatio > healthyLimitPct) {
      status = 'warning';
    } else if (dtiRatio > 20) {
      status = 'healthy';
    } else {
      status = 'very-healthy';
    }

    const kprFirstInstallment = Math.round(kprCalculation.firstMonthPayment);
    const projectedWithKprInstallment = totalMinPayment + kprFirstInstallment;
    const projectedWithKprDti = hasIncome
      ? (projectedWithKprInstallment / effectiveMonthlyIncome) * 100
      : projectedWithKprInstallment > 0
      ? 100
      : 0;

    return {
      detectedMonthlyIncome,
      effectiveMonthlyIncome,
      incomeSourceLabel,
      totalMinPayment,
      healthyLimitPct,
      healthyMaxInstallment,
      dtiRatio,
      excessOverHealthy,
      remainingHealthyRoom,
      freeCashAfterDebt,
      status,
      hasIncome,
      kprFirstInstallment,
      projectedWithKprInstallment,
      projectedWithKprDti,
    };
  }, [transactions, customMonthlyIncome, totalMinPayment, kprCalculation.firstMonthPayment]);

  // --- WHAT-IF SIMULATOR STATES & COMPUTATION MEMO ---
  const [selectedSimDebtId, setSelectedSimDebtId] = useState<string>('all');
  const [simExtraMonthly, setSimExtraMonthly] = useState<number>(250000);
  const [simLumpSum, setSimLumpSum] = useState<number>(0);

  const simResult = React.useMemo(() => {
    const targetDebts = selectedSimDebtId === 'all'
      ? allDebts.filter(d => d.balance > 0)
      : allDebts.filter(d => d.id === selectedSimDebtId && d.balance > 0);

    if (targetDebts.length === 0) {
      return {
        totalBalance: 0,
        baseMonths: 0,
        accMonths: 0,
        monthsSaved: 0,
        baseTotalInterest: 0,
        accTotalInterest: 0,
        interestSaved: 0,
        basePayoffDateStr: '-',
        accPayoffDateStr: '-',
      };
    }

    const totalBalance = targetDebts.reduce((sum, d) => sum + d.balance, 0);

    let baseTotalInterest = 0;
    let accTotalInterest = 0;
    let maxBaseMonths = 0;
    let maxAccMonths = 0;

    targetDebts.forEach(debt => {
      const share = totalBalance > 0 ? debt.balance / totalBalance : 1 / targetDebts.length;
      const debtLumpSum = Math.min(debt.balance, simLumpSum * share);
      const debtExtraMonthly = simExtraMonthly * share;

      const monthlyRate = debt.interestRate > 0 ? (debt.interestRate / 100) / 12 : 0;
      const basePay = Math.max(debt.minPayment, debt.balance * monthlyRate + 10000);

      // Baseline simulation (up to 480 months / 40 years for long KPR tenors)
      let balBase = debt.balance;
      let mBase = 0;
      let intBaseAcc = 0;
      while (balBase > 0 && mBase < 480) {
        mBase++;
        const interest = balBase * monthlyRate;
        intBaseAcc += interest;
        const principal = Math.min(balBase, Math.max(1, basePay - interest));
        balBase -= principal;
      }

      // Accelerated simulation
      let balAcc = Math.max(0, debt.balance - debtLumpSum);
      let mAcc = 0;
      let intAccAcc = 0;
      const accPay = basePay + debtExtraMonthly;
      while (balAcc > 0 && mAcc < 480) {
        mAcc++;
        const interest = balAcc * monthlyRate;
        intAccAcc += interest;
        const principal = Math.min(balAcc, Math.max(1, accPay - interest));
        balAcc -= principal;
      }

      baseTotalInterest += intBaseAcc;
      accTotalInterest += intAccAcc;
      if (mBase > maxBaseMonths) maxBaseMonths = mBase;
      if (mAcc > maxAccMonths) maxAccMonths = mAcc;
    });

    const monthsSaved = Math.max(0, maxBaseMonths - maxAccMonths);
    const interestSaved = Math.max(0, baseTotalInterest - accTotalInterest);

    const now = new Date();
    const basePayoffDate = new Date(now.getFullYear(), now.getMonth() + maxBaseMonths, 1);
    const accPayoffDate = new Date(now.getFullYear(), now.getMonth() + maxAccMonths, 1);

    const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    const basePayoffDateStr = maxBaseMonths > 0 ? `${monthNames[basePayoffDate.getMonth()]} ${basePayoffDate.getFullYear()}` : 'Lunas';
    const accPayoffDateStr = maxAccMonths > 0 ? `${monthNames[accPayoffDate.getMonth()]} ${accPayoffDate.getFullYear()}` : 'Lunas';

    return {
      totalBalance,
      baseMonths: maxBaseMonths,
      accMonths: maxAccMonths,
      monthsSaved,
      baseTotalInterest,
      accTotalInterest,
      interestSaved,
      basePayoffDateStr,
      accPayoffDateStr,
    };
  }, [allDebts, selectedSimDebtId, simExtraMonthly, simLumpSum]);

  const executeSaveNewDebt = (
    debtPayload: Omit<Debt, 'id'>,
    bankLink?: { accountId: string; transactionType: 'income' | 'expense' }
  ) => {
    onAddDebt(debtPayload, bankLink);

    const linkedAcc = bankLink ? liquidAccounts.find((a) => a.id === bankLink.accountId) : null;
    const bankActionText = linkedAcc
      ? bankLink?.transactionType === 'expense'
        ? ` Pengeluaran otomatis sebesar ${formatterIDR.format(debtPayload.balance)} telah dipotong dari saldo ${linkedAcc.name}.`
        : ` Dana pencairan sebesar ${formatterIDR.format(debtPayload.balance)} telah ditambahkan ke saldo ${linkedAcc.name}.`
      : '';

    // Reset Add Debt Form
    setName('');
    setBalance('');
    setInterestRate('');
    setMinPayment('');
    setDueDayInput('');
    setLinkBankEnabled(false);
    setAddDisburseAccountId('');

    showAlert(
      'Hutang Disimpan & Tersinkronisasi',
      `Hutang "${debtPayload.name}" telah ditambahkan ke daftar aktif, prioritas Snowball/Avalanche, Simulator What-If, dan Analisis AI.${bankActionText}`
    );
  };

  const handleAddDebtSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const b = parseFloat(balance);
    const i = parseFloat(interestRate);
    const m = parseFloat(minPayment);
    const d = parseInt(dueDayInput) || undefined;

    if (!name.trim() || isNaN(b) || b <= 0 || isNaN(i) || i < 0 || isNaN(m) || m <= 0) {
      showAlert('Formulir Tidak Valid', 'Mohon isi nama, saldo pokok (> 0), bunga APR (>= 0), dan cicilan minimum (> 0) dengan benar.');
      return;
    }

    const todayDateStr = toLocalYYYYMMDD();
    const debtPayload: Omit<Debt, 'id'> = {
      name: name.trim(),
      balance: b,
      interestRate: i,
      minPayment: m,
      purpose,
      category,
      dueDay: d && d >= 1 && d <= 31 ? d : undefined,
      startDate: todayDateStr,
    };

    if (linkBankEnabled) {
      if (!addDisburseAccountId) {
        showAlert('Pilih Akun Bank', 'Silakan pilih akun bank/kas yang akan dihubungkan dengan utang baru ini.');
        return;
      }
      const targetAcc = liquidAccounts.find((a) => a.id === addDisburseAccountId);
      if (!targetAcc) {
        showAlert('Akun Tidak Ditemukan', 'Akun bank/kas yang dipilih tidak tersedia.');
        return;
      }
      if (bankLinkTxType === 'expense' && targetAcc.currentBalance < b) {
        showConfirm(
          'Saldo Kas Lebih Kecil dari Pinjaman',
          `Saldo ${targetAcc.name} (${formatterIDR.format(targetAcc.currentBalance)}) lebih kecil dari nominal pengeluaran otomatis pencairan pinjaman (${formatterIDR.format(b)}). Lanjutkan pencatatan dan sinkronisasi saldo?`,
          () => executeSaveNewDebt(debtPayload, { accountId: targetAcc.id, transactionType: bankLinkTxType })
        );
        return;
      }
      executeSaveNewDebt(debtPayload, { accountId: targetAcc.id, transactionType: bankLinkTxType });
      return;
    }

    executeSaveNewDebt(debtPayload);
  };

  const handleAddKprDebt = () => {
    const cleanName = kprName.trim();
    if (!cleanName) {
      showAlert('Nama KPR Kosong', 'Mohon isi nama/label pinjaman KPR Anda terlebih dahulu.');
      return;
    }
    if (kprCalculation.principal <= 0) {
      showAlert('Pokok KPR Tidak Valid', 'Pokok pinjaman KPR harus lebih besar dari Rp 0 (Harga Properti harus lebih besar dari Uang Muka).');
      return;
    }

    const monthlyInstallment = Math.round(kprCalculation.firstMonthPayment);
    const effectiveApr = Number(kprCalculation.effectiveApr.toFixed(2));
    const safeDueDay = Math.min(31, Math.max(1, Math.round(kprDueDay || 10)));
    const principalAmt = Math.round(kprCalculation.principal);
    const todayDateStr = toLocalYYYYMMDD();

    const kprPayload: Omit<Debt, 'id'> = {
      name: cleanName,
      balance: principalAmt,
      interestRate: effectiveApr,
      minPayment: monthlyInstallment,
      purpose: kprPurpose,
      category: 'KPR / Properti',
      dueDay: safeDueDay,
      startDate: todayDateStr,
      kprScheme,
      kprPresetId: activeKprPreset.id,
      propertyPrice: Math.round(kprPropertyPrice),
      downPayment: Math.round(kprDownPayment),
      tenorMonths: kprCalculation.tenorMonths,
      fixedRate: kprScheme === 'tiered' ? kprFixedRate : kprAnnualRate,
      fixedYears: kprScheme === 'tiered' ? kprFixedYears : undefined,
      floatingRate: kprScheme === 'tiered' ? kprFloatingRate : undefined,
      kprFeesSummary: kprCalculation.closingCosts,
      kprCoaSnapshot: effectiveKprCoa,
    };

    const commitKpr = (bankLink?: {
      accountId: string;
      transactionType: 'income' | 'expense';
      postKprInitialCostsToJournal?: boolean;
    }) => {
      onAddDebt(kprPayload, bankLink);
      const linkedAcc = bankLink ? liquidAccounts.find((a) => a.id === bankLink.accountId) : null;
      const bankSyncMsg = linkedAcc
        ? bankLink?.transactionType === 'expense'
          ? ` Pengeluaran pencairan KPR sebesar ${formatterIDR.format(principalAmt)} otomatis dicatat ke ${linkedAcc.name}.`
          : ` Pencairan dana KPR sebesar ${formatterIDR.format(principalAmt)} otomatis masuk ke ${linkedAcc.name}.`
        : '';
      const feesJournalMsg =
        bankLink?.postKprInitialCostsToJournal && linkedAcc
          ? ` Jurnal COA biaya akad (${formatterIDR.format(kprCalculation.closingCosts.totalClosingCosts)}) & DP ikut dicatat ke ${linkedAcc.name}.`
          : '';

      showAlert(
        'KPR Ditambahkan & Tersinkronisasi',
        `"${cleanName}" dengan pokok ${formatterIDR.format(principalAmt)} dan cicilan ${formatterIDR.format(monthlyInstallment)}/bln berhasil masuk ke daftar hutang aktif serta tersinkronisasi dengan Simulator What-If, Snowball/Avalanche, dan Analisis AI.${bankSyncMsg}${feesJournalMsg}`
      );
      setKprLinkBankEnabled(false);
      setKprPostInitialFees(false);
      setKprDisburseAccountId('');
    };

    if (kprLinkBankEnabled) {
      if (!kprDisburseAccountId) {
        showAlert('Pilih Akun Bank', 'Silakan pilih akun bank/kas yang akan dihubungkan dengan KPR ini.');
        return;
      }
      const targetAcc = liquidAccounts.find((a) => a.id === kprDisburseAccountId);
      if (!targetAcc) {
        showAlert('Akun Tidak Ditemukan', 'Akun bank/kas yang dipilih tidak tersedia.');
        return;
      }
      const totalDebitEstimate =
        (kprBankTxType === 'expense' ? principalAmt : 0) +
        (kprPostInitialFees ? kprCalculation.totalInitialCashNeeded : 0);
      if (totalDebitEstimate > 0 && targetAcc.currentBalance < totalDebitEstimate) {
        showConfirm(
          'Saldo Kas Lebih Kecil dari Total Pencatatan',
          `Saldo ${targetAcc.name} (${formatterIDR.format(targetAcc.currentBalance)}) lebih kecil dari total nominal pencatatan otomatis (${formatterIDR.format(totalDebitEstimate)}). Tetap hubungkan dan sinkronkan?`,
          () =>
            commitKpr({
              accountId: targetAcc.id,
              transactionType: kprBankTxType,
              postKprInitialCostsToJournal: kprPostInitialFees,
            })
        );
        return;
      }
      commitKpr({
        accountId: targetAcc.id,
        transactionType: kprBankTxType,
        postKprInitialCostsToJournal: kprPostInitialFees,
      });
      return;
    }

    commitKpr();
  };

  const handleDeleteTop = () => {
    const topDebt = orderedDebts[0];
    if (!topDebt) return;
    
    if (topDebt.isAccount) {
      showAlert('Info Penghapusan', `"${topDebt.name}" terhubung langsung dengan rekening Kartu Kredit/PayLater Anda di menu Master Akun. Pelunasan atau penghapusan akun dilakukan melalui menu tersebut.`);
    } else {
      showConfirm(
        'Hapus Hutang',
        `Apakah Anda yakin ingin menghapus catatan hutang "${topDebt.name}"?`,
        () => {
          onDeleteDebt(topDebt.id);
          showAlert('Berhasil Dihapus', 'Catatan hutang berhasil dihapus.');
        }
      );
    }
  };

  const topPriorityDebt = orderedDebts[0];

  return (
    <div className="space-y-8">
      {/* SECTION 0: RINGKASAN VISUAL KAPASITAS PEMBAYARAN UTANG (DEBT-TO-INCOME RATIO) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-xl border shrink-0 ${
                debtCapacitySummary.status === 'danger' || debtCapacitySummary.status === 'no-income'
                  ? 'bg-rose-500/20 border-rose-400/40 text-rose-300'
                  : debtCapacitySummary.status === 'warning'
                  ? 'bg-amber-500/20 border-amber-400/40 text-amber-300'
                  : 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300'
              }`}
            >
              <Percent className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm sm:text-base font-black tracking-tight text-white">
                  Kapasitas Pembayaran Utang (Debt Service Ratio)
                </h3>
                <span
                  className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider border ${
                    debtCapacitySummary.status === 'danger' || debtCapacitySummary.status === 'no-income'
                      ? 'bg-rose-500/25 text-rose-200 border-rose-400/40'
                      : debtCapacitySummary.status === 'warning'
                      ? 'bg-amber-500/25 text-amber-200 border-amber-400/40'
                      : debtCapacitySummary.status === 'healthy'
                      ? 'bg-blue-500/25 text-blue-200 border-blue-400/40'
                      : 'bg-emerald-500/25 text-emerald-200 border-emerald-400/40'
                  }`}
                >
                  {debtCapacitySummary.status === 'danger'
                    ? 'Risiko Kritis (> 40%)'
                    : debtCapacitySummary.status === 'warning'
                    ? 'Risiko Tinggi — Melebihi 30%'
                    : debtCapacitySummary.status === 'no-income'
                    ? 'Pendapatan Belum Tercatat'
                    : debtCapacitySummary.status === 'healthy'
                    ? 'Risiko Terkendali (≤ 30%)'
                    : debtCapacitySummary.status === 'empty'
                    ? 'Bebas Cicilan Utang'
                    : 'Risiko Rendah — Sangat Sehat (≤ 20%)'}
                </span>
              </div>
              <p className="text-[11px] text-slate-300 mt-0.5">
                Mengukur rasio total cicilan utang bulanan terhadap total pendapatan bulanan Anda (ambang batas sehat maksimal 30%).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsEditingIncome(!isEditingIncome)}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer border border-white/15"
            >
              <Edit3 className="h-3.5 w-3.5" />
              {isEditingIncome ? 'Tutup Edit Pendapatan' : 'Ubah / Simulasi Pendapatan'}
            </button>
            {customMonthlyIncome !== null && (
              <button
                type="button"
                onClick={() => setCustomMonthlyIncome(null)}
                title="Kembalikan ke data transaksi otomatis"
                className="px-2.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-[11px] font-bold flex items-center gap-1 transition cursor-pointer border border-amber-400/30"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset
              </button>
            )}
          </div>
        </div>

        <div className="p-6 space-y-5">
          {isEditingIncome && (
            <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-xs font-extrabold text-blue-950">
                  Simulasi Pendapatan Bulanan (Opsional)
                </p>
                <p className="text-[11px] text-blue-700 mt-0.5">
                  Otomatis dari transaksi: <strong>{formatterIDR.format(debtCapacitySummary.detectedMonthlyIncome)}</strong>. Masukkan angka lain untuk menguji rasio kapasitas bayar Anda.
                </p>
              </div>
              <div className="w-full sm:w-64">
                <FormattedNumberInput
                  value={customMonthlyIncome !== null ? customMonthlyIncome : debtCapacitySummary.detectedMonthlyIncome}
                  onChange={(val) => setCustomMonthlyIncome(typeof val === 'number' ? val : parseFloat(val) || 0)}
                  placeholder="Contoh: 15.000.000"
                  className="w-full bg-white border border-blue-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}

          {/* 3 Headline Capacity KPI Tiles */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 block">
                Total Cicilan Utang / Bulan
              </span>
              <p className="text-xl font-black text-slate-900 font-mono tabular-nums mt-1">
                {formatterIDR.format(debtCapacitySummary.totalMinPayment)}
              </p>
              <span className="text-[10px] text-slate-500 font-semibold mt-1 block">
                Dari {allDebts.filter((d) => d.balance > 0).length} kewajiban aktif berjalan
              </span>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 block">
                Total Pendapatan Bulanan
              </span>
              <p className="text-xl font-black text-emerald-700 font-mono tabular-nums mt-1">
                {formatterIDR.format(debtCapacitySummary.effectiveMonthlyIncome)}
              </p>
              <span className="text-[10px] text-slate-500 font-semibold mt-1 block truncate">
                Basis: {debtCapacitySummary.incomeSourceLabel}
              </span>
            </div>

            <div
              className={`p-4 rounded-xl border ${
                debtCapacitySummary.status === 'danger' || debtCapacitySummary.status === 'no-income'
                  ? 'bg-rose-50 border-rose-200'
                  : debtCapacitySummary.status === 'warning'
                  ? 'bg-amber-50 border-amber-200'
                  : 'bg-emerald-50 border-emerald-200'
              }`}
            >
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-600 block">
                Rasio Cicilan &amp; Tingkat Risiko
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <p
                  className={`text-2xl font-black font-mono tabular-nums ${
                    debtCapacitySummary.status === 'danger' || debtCapacitySummary.status === 'no-income'
                      ? 'text-rose-700'
                      : debtCapacitySummary.status === 'warning'
                      ? 'text-amber-700'
                      : 'text-emerald-700'
                  }`}
                >
                  {debtCapacitySummary.hasIncome
                    ? `${debtCapacitySummary.dtiRatio.toFixed(1)}%`
                    : debtCapacitySummary.totalMinPayment > 0
                    ? '>100%'
                    : '0.0%'}
                </p>
                <span className="text-[11px] font-bold text-slate-500">
                  (Batas Sehat: ≤ {debtCapacitySummary.healthyLimitPct}%)
                </span>
              </div>
              <span className="text-[10px] font-bold text-slate-600 mt-1 block tabular-nums">
                Plafon Cicilan Sehat (30%): {formatterIDR.format(debtCapacitySummary.healthyMaxInstallment)}/bln
              </span>
            </div>
          </div>

          {/* Visual Debt Capacity Gauge Bar */}
          <div className="p-4 rounded-xl bg-slate-50/90 border border-slate-200 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-700">
              <span>Meteran Rasio Beban Cicilan terhadap Pendapatan (0% – 50%+)</span>
              <div className="flex items-center gap-3 text-[10px] font-extrabold">
                <span className="flex items-center gap-1 text-emerald-700">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> 0–30% Sehat
                </span>
                <span className="flex items-center gap-1 text-amber-700">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" /> 30–40% Waspada
                </span>
                <span className="flex items-center gap-1 text-rose-700">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" /> &gt;40% Kritis
                </span>
              </div>
            </div>

            {/* Gauge Track scaled to 50% max width */}
            <div className="relative h-6 w-full rounded-full overflow-hidden bg-slate-200 flex border border-slate-300/70">
              {/* Background zone tinting: 0-30% is 60% of bar width; 30-40% is 20%; 40-50% is 20% */}
              <div className="h-full bg-emerald-100/80 border-r border-dashed border-emerald-600/50" style={{ width: '60%' }} />
              <div className="h-full bg-amber-100/80 border-r border-dashed border-amber-600/50" style={{ width: '20%' }} />
              <div className="h-full bg-rose-100/80" style={{ width: '20%' }} />

              {/* Active Fill Bar */}
              <div
                className={`absolute top-0 left-0 h-full transition-all duration-500 rounded-l-full flex items-center justify-end pr-2 ${
                  debtCapacitySummary.dtiRatio > 40
                    ? 'bg-gradient-to-r from-amber-500 to-rose-600'
                    : debtCapacitySummary.dtiRatio > 30
                    ? 'bg-gradient-to-r from-emerald-500 to-amber-500'
                    : 'bg-gradient-to-r from-emerald-500 to-teal-500'
                }`}
                style={{
                  width: `${Math.min(100, Math.max(debtCapacitySummary.dtiRatio > 0 ? 3 : 0, (debtCapacitySummary.dtiRatio / 50) * 100))}%`,
                }}
              >
                {debtCapacitySummary.dtiRatio >= 6 && (
                  <span className="text-[10px] font-black text-white drop-shadow-xs">
                    {debtCapacitySummary.dtiRatio.toFixed(1)}%
                  </span>
                )}
              </div>

              {/* 30% Healthy Threshold Marker */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-slate-900 z-10"
                style={{ left: '60%' }}
                title="Ambang Batas Sehat 30%"
              />
            </div>

            <div className="flex justify-between text-[10px] font-bold text-slate-500">
              <span>0%</span>
              <span>15%</span>
              <span className="text-slate-900 font-black">30% (Batas Sehat)</span>
              <span>40% (Waspada)</span>
              <span>50%+</span>
            </div>

            {/* Income Allocation Breakdown Bar */}
            {debtCapacitySummary.hasIncome && (
              <div className="pt-2 border-t border-slate-200/80 grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
                <div className="flex items-center justify-between bg-white px-3 py-2 rounded-lg border border-slate-200">
                  <span className="text-slate-600 font-semibold">Sisa Pendapatan Setelah Cicilan Utang:</span>
                  <span className="font-mono font-extrabold text-slate-900">
                    {formatterIDR.format(debtCapacitySummary.freeCashAfterDebt)}/bln
                  </span>
                </div>
                <div className="flex items-center justify-between bg-white px-3 py-2 rounded-lg border border-slate-200">
                  <span className="text-slate-600 font-semibold">
                    {debtCapacitySummary.dtiRatio > 30 ? 'Kelebihan Beban di Atas Batas 30%:' : 'Sisa Kapasitas Cicilan Aman (≤ 30%):'}
                  </span>
                  <span
                    className={`font-mono font-extrabold ${
                      debtCapacitySummary.dtiRatio > 30 ? 'text-rose-600' : 'text-emerald-600'
                    }`}
                  >
                    {debtCapacitySummary.dtiRatio > 30
                      ? `+${formatterIDR.format(debtCapacitySummary.excessOverHealthy)}/bln`
                      : `${formatterIDR.format(debtCapacitySummary.remainingHealthyRoom)}/bln`}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Actionable Health Advice Banner */}
          {debtCapacitySummary.status === 'warning' || debtCapacitySummary.status === 'danger' ? (
            <div
              className={`p-4 rounded-xl border flex items-start gap-3 ${
                debtCapacitySummary.status === 'danger'
                  ? 'bg-rose-50 border-rose-200 text-rose-950'
                  : 'bg-amber-50 border-amber-200 text-amber-950'
              }`}
            >
              <AlertTriangle
                className={`h-5 w-5 shrink-0 mt-0.5 ${
                  debtCapacitySummary.status === 'danger' ? 'text-rose-600' : 'text-amber-600'
                }`}
              />
              <div className="space-y-1.5 text-xs">
                <p className="font-extrabold">
                  Peringatan: Rasio Cicilan Utang ({debtCapacitySummary.dtiRatio.toFixed(1)}%) Melebihi Ambang Batas Sehat 30%!
                </p>
                <p className="leading-relaxed">
                  Saat ini total cicilan Anda melampaui batas aman sebesar{' '}
                  <strong className="font-mono">{formatterIDR.format(debtCapacitySummary.excessOverHealthy)}/bulan</strong>. Hal ini berisiko menekan arus kas kebutuhan pokok dan dana darurat.
                </p>
                <ul className="list-disc pl-4 space-y-1 text-[11px] font-medium">
                  <li>
                    <strong>Hentikan sementara penambahan utang/cicilan konsumtif baru</strong> hingga rasio kembali di bawah 30%.
                  </li>
                  {topPriorityDebt && (
                    <li>
                      <strong>Prioritaskan pelunasan "{topPriorityDebt.name}"</strong> ({topPriorityDebt.interestRate}% APR, cicilan {formatterIDR.format(topPriorityDebt.minPayment)}/bln) menggunakan metode {strategy === 'avalanche' ? 'Avalanche' : 'Snowball'} agar beban bulanan cepat turun.
                    </li>
                  )}
                  <li>
                    <strong>Pertimbangkan restrukturisasi atau refinancing</strong> (perpanjangan tenor / pengalihan ke bunga lebih rendah) untuk menurunkan cicilan minimum minimal sebesar {formatterIDR.format(debtCapacitySummary.excessOverHealthy)}/bln, serta alokasikan bonus/pendapatan tambahan untuk mengurangi pokok utang.
                  </li>
                </ul>
              </div>
            </div>
          ) : debtCapacitySummary.status === 'no-income' ? (
            <div className="p-4 rounded-xl border bg-amber-50 border-amber-200 text-amber-950 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <p className="font-extrabold">Pendapatan Bulanan Belum Tercatat untuk Menghitung Rasio</p>
                <p className="leading-relaxed">
                  Anda memiliki kewajiban cicilan sebesar <strong>{formatterIDR.format(debtCapacitySummary.totalMinPayment)}/bln</strong>, namun belum ada transaksi pemasukan yang tercatat. Catat transaksi pemasukan di menu <strong>Jurnal Transaksi</strong> atau klik <strong>Ubah / Simulasi Pendapatan</strong> di atas untuk melihat rasio kapasitas pembayaran utang Anda.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl border bg-emerald-50 border-emerald-200 text-emerald-950 flex items-start gap-3">
              <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <p className="font-extrabold">
                  Kapasitas Pembayaran Utang Anda {debtCapacitySummary.status === 'very-healthy' ? 'Sangat Sehat' : 'Terkendali'} (Rasio {debtCapacitySummary.dtiRatio.toFixed(1)}% ≤ 30%)
                </p>
                <p className="leading-relaxed">
                  {debtCapacitySummary.hasIncome
                    ? `Beban cicilan Anda berada di bawah ambang batas sehat 30%. Anda masih memiliki ruang kapasitas cicilan aman sebesar ${formatterIDR.format(debtCapacitySummary.remainingHealthyRoom)}/bulan apabila berencana mengambil pembiayaan produktif (seperti KPR).`
                    : 'Anda belum memiliki cicilan utang aktif maupun tekanan kewajiban bulanan. Pertahankan kondisi bebas utang konsumtif ini.'}
                </p>
              </div>
            </div>
          )}

          {/* Live KPR Impact Comparison on Capacity */}
          {kprCalculation.principal > 0 && debtCapacitySummary.hasIncome && (
            <div className="px-4 py-3 rounded-xl bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-blue-400 shrink-0" />
                <span>
                  Simulasi Dampak jika KPR ({formatterIDR.format(debtCapacitySummary.kprFirstInstallment || kprCalculation.firstMonthPayment)}/bln) Ditambahkan:
                </span>
              </div>
              <div className="flex items-center gap-2 font-mono font-extrabold">
                <span className="text-slate-300">{debtCapacitySummary.dtiRatio.toFixed(1)}%</span>
                <span className="text-slate-500">→</span>
                <span
                  className={
                    debtCapacitySummary.projectedWithKprDti > 30 ? 'text-rose-400' : 'text-emerald-400'
                  }
                >
                  {debtCapacitySummary.projectedWithKprDti.toFixed(1)}%
                </span>
                <span
                  className={`text-[10px] font-sans px-2 py-0.5 rounded-full ${
                    debtCapacitySummary.projectedWithKprDti > 30
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-400/30'
                      : 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                  }`}
                >
                  {debtCapacitySummary.projectedWithKprDti > 30 ? 'Melebihi Batas 30%' : 'Masih Aman ≤ 30%'}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* SECTION 1: KALKULATOR, VISUALISASI & MODEL PERHITUNGAN KPR */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 px-6 py-5 text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="p-3 bg-blue-500/20 border border-blue-400/30 rounded-2xl text-blue-300 shadow-inner shrink-0">
              <Home className="h-6 w-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-black tracking-tight text-white">
                  Model Perhitungan KPR (Kredit Pemilikan Rumah)
                </h3>
                <span className="text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                  Sinkron Otomatis ke Daftar Hutang
                </span>
              </div>
              <p className="text-xs text-slate-300 font-medium mt-0.5">
                Hitung simulasi cicilan Anuitas, Berjenjang (Fixed → Floating), atau Flat, lihat jadwal amortisasi, dan tambahkan langsung ke kewajiban aktif.
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* PRESET MASTER DATA KPR SELECTOR BAR */}
          {kprPresets.length > 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-600">
                  Pilih Preset Skema & Biaya dari Master Data KPR
                </span>
                <span className="text-[11px] text-slate-500 font-medium">
                  Klik preset untuk mengisi otomatis tenor, bunga, DP, dan estimasi biaya akad
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {kprPresets.map((preset) => {
                  const isSelected = activeKprPreset.id === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => applyKprPreset(preset)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                        isSelected
                          ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-blue-300 hover:text-blue-700'
                      }`}
                    >
                      {preset.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* KPR INPUTS (LEFT 7 COLS) */}
            <div className="lg:col-span-7 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2 space-y-1">
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
                    Nama Properti / Pinjaman KPR
                  </label>
                  <input
                    type="text"
                    value={kprName}
                    onChange={(e) => setKprName(e.target.value)}
                    placeholder="Contoh: KPR Rumah Cluster BSD"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
                    Harga Properti (Rp)
                  </label>
                  <FormattedNumberInput
                    value={kprPropertyPrice}
                    onChange={(val) => setKprPropertyPrice(typeof val === 'number' ? val : parseFloat(val) || 0)}
                    placeholder="500.000.000"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                      Uang Muka / DP (Rp)
                    </label>
                    <span className="text-[10px] font-extrabold text-blue-600">
                      {kprCalculation.dpPercent.toFixed(1)}%
                    </span>
                  </div>
                  <FormattedNumberInput
                    value={kprDownPayment}
                    onChange={(val) => setKprDownPayment(typeof val === 'number' ? val : parseFloat(val) || 0)}
                    placeholder="100.000.000"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex gap-1.5 pt-1 flex-wrap">
                    {[10, 15, 20, 30].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => setKprDownPayment(Math.round((kprPropertyPrice || 0) * (pct / 100)))}
                        className="text-[10px] font-bold px-2 py-0.5 rounded-lg border border-slate-200 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 text-slate-600 transition cursor-pointer"
                      >
                        DP {pct}%
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Scheme Selector */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
                  Skema Perhitungan Bunga KPR
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    { id: 'tiered', label: 'Berjenjang (Fixed → Floating)', desc: 'Umum di Bank Indonesia' },
                    { id: 'annuity', label: 'Anuitas Efektif', desc: 'Cicilan tetap sepanjang tenor' },
                    { id: 'flat', label: 'Bunga Flat', desc: 'Pokok & bunga tetap/bln' },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setKprScheme(item.id as 'annuity' | 'tiered' | 'flat')}
                      className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                        kprScheme === item.id
                          ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500'
                          : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <p className={`text-xs font-extrabold ${kprScheme === item.id ? 'text-blue-700' : 'text-slate-700'}`}>
                        {item.label}
                      </p>
                      <p className="text-[10px] text-slate-500 mt-0.5">{item.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Tenor & Rate Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200/80">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
                    Tenor (Tahun)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={35}
                    value={kprTenorYears}
                    onChange={(e) => setKprTenorYears(Math.max(1, Math.min(35, parseInt(e.target.value) || 1)))}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex gap-1 pt-1 flex-wrap">
                    {[5, 10, 15, 20, 25].map((yr) => (
                      <button
                        key={yr}
                        type="button"
                        onClick={() => setKprTenorYears(yr)}
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded border cursor-pointer transition ${
                          kprTenorYears === yr
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-slate-500 border-slate-200 hover:text-slate-800'
                        }`}
                      >
                        {yr}th
                      </button>
                    ))}
                  </div>
                </div>

                {kprScheme === 'tiered' ? (
                  <>
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
                        Bunga Fixed (%/thn)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min={0}
                        max={40}
                        value={kprFixedRate}
                        onChange={(e) => setKprFixedRate(parseFloat(e.target.value) || 0)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <div className="flex items-center gap-1.5 pt-1">
                        <span className="text-[10px] font-semibold text-slate-500">Masa Fixed:</span>
                        <input
                          type="number"
                          min={1}
                          max={kprTenorYears}
                          value={kprFixedYears}
                          onChange={(e) => setKprFixedYears(Math.max(1, Math.min(kprTenorYears, parseInt(e.target.value) || 1)))}
                          className="w-12 bg-white border border-slate-200 rounded px-1.5 py-0.5 text-[10px] font-bold text-slate-800 text-center"
                        />
                        <span className="text-[10px] font-semibold text-slate-500">thn</span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
                        Est. Floating (%/thn)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min={0}
                        max={40}
                        value={kprFloatingRate}
                        onChange={(e) => setKprFloatingRate(parseFloat(e.target.value) || 0)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-[10px] text-slate-400 block pt-1">
                        Berlaku mulai tahun ke-{Math.min(kprTenorYears, kprFixedYears + 1)}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
                      Suku Bunga Tahunan ({kprScheme === 'flat' ? 'Flat' : 'Efektif'} %/thn)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min={0}
                      max={40}
                      value={kprAnnualRate}
                      onChange={(e) => setKprAnnualRate(parseFloat(e.target.value) || 0)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-[10px] text-slate-400 block pt-1">
                      {kprScheme === 'flat'
                        ? `Setara estimasi APR efektif ~${kprCalculation.effectiveApr.toFixed(1)}% untuk perbandingan pelunasan.`
                        : 'Cicilan per bulan tetap sama hingga bulan terakhir.'}
                    </span>
                  </div>
                )}
              </div>

              {/* Extra Sync Options */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                    Tgl Jatuh Tempo / Bln
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={kprDueDay}
                    onChange={(e) => setKprDueDay(Math.min(31, Math.max(1, parseInt(e.target.value) || 1)))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                    Sifat Kewajiban
                  </label>
                  <select
                    value={kprPurpose}
                    onChange={(e) => setKprPurpose(e.target.value as 'productive' | 'consumptive')}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 cursor-pointer"
                  >
                    <option value="productive">Produktif (Aset Properti)</option>
                    <option value="consumptive">Konsumtif</option>
                  </select>
                </div>
              </div>

              {/* Bank Link Toggle for KPR */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-3.5 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Landmark className="h-4 w-4 text-blue-600 shrink-0" />
                    <div>
                      <span className="text-[11px] font-extrabold text-slate-800 block">
                        Hubungkan KPR dengan Akun Bank (Mutasi Pencairan)
                      </span>
                      <span className="text-[10px] text-slate-500 block">
                        Otomatis sinkronkan saldo kas bank & catat transaksi pencairan saat KPR disimpan.
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={kprLinkBankEnabled}
                    onClick={() => {
                      const next = !kprLinkBankEnabled;
                      setKprLinkBankEnabled(next);
                      if (next && !kprDisburseAccountId && liquidAccounts.length > 0) {
                        const preferredBank = liquidAccounts.find((a) => a.type === 'bank') || liquidAccounts[0];
                        setKprDisburseAccountId(preferredBank.id);
                      }
                    }}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                      kprLinkBankEnabled ? 'bg-blue-600' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition duration-200 ${
                        kprLinkBankEnabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {kprLinkBankEnabled && (
                  <div className="space-y-3 pt-2 border-t border-slate-200">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block">
                          Pilih Akun Bank / Kas
                        </label>
                        <select
                          value={kprDisburseAccountId}
                          onChange={(e) => setKprDisburseAccountId(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 cursor-pointer"
                        >
                          <option value="">-- Pilih Akun Bank --</option>
                          {liquidAccounts.map((acc) => (
                            <option key={acc.id} value={acc.id}>
                              {acc.type === 'bank' ? '[Bank] ' : ''}{acc.name} ({formatterIDR.format(acc.currentBalance)})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block">
                          Jenis Transaksi Otomatis
                        </label>
                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            type="button"
                            onClick={() => setKprBankTxType('expense')}
                            className={`py-2 px-2 rounded-xl text-[10px] font-extrabold border transition cursor-pointer ${
                              kprBankTxType === 'expense'
                                ? 'bg-rose-600 text-white border-rose-600'
                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            Pengeluaran (- Kas)
                          </button>
                          <button
                            type="button"
                            onClick={() => setKprBankTxType('income')}
                            className={`py-2 px-2 rounded-xl text-[10px] font-extrabold border transition cursor-pointer ${
                              kprBankTxType === 'income'
                                ? 'bg-emerald-600 text-white border-emerald-600'
                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            Pencairan (+ Kas)
                          </button>
                        </div>
                      </div>
                    </div>

                    <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-white border border-slate-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={kprPostInitialFees}
                        onChange={(e) => setKprPostInitialFees(e.target.checked)}
                        className="mt-0.5 rounded text-blue-600 focus:ring-blue-500 h-3.5 w-3.5 cursor-pointer"
                      />
                      <span className="text-[11px] text-slate-700 leading-snug">
                        <strong className="text-slate-900">Catat Sekaligus Jurnal Biaya Akad &amp; DP ke COA:</strong>{' '}
                        Otomatis memposting Uang Muka (COA {effectiveKprCoa.propertyAssetCode}), Provisi/Admin/Appraisal/Notaris (COA {effectiveKprCoa.provisiAdminLegalCode}), dan BPHTB/Asuransi (COA {effectiveKprCoa.taxInsuranceCode}).
                      </span>
                    </label>
                  </div>
                )}
              </div>
            </div>

            {/* KPR CALCULATION SUMMARY & LIVE SYNC IMPACT (RIGHT 5 COLS) */}
            <div className="lg:col-span-5 flex flex-col justify-between bg-slate-900 text-white rounded-2xl p-5 border border-slate-800 space-y-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-blue-300">
                    Hasil Estimasi KPR
                  </span>
                  <span className="text-[10px] font-bold bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full">
                    Tenor {kprCalculation.tenorMonths} Bulan
                  </span>
                </div>

                <div>
                  <span className="text-[11px] text-slate-400 font-semibold block">
                    {kprScheme === 'tiered'
                      ? `Cicilan Masa Fixed (${kprFixedYears} Tahun Pertama)`
                      : 'Estimasi Cicilan per Bulan'}
                  </span>
                  <p className="text-2xl sm:text-3xl font-black text-emerald-400 font-mono mt-0.5">
                    {formatterIDR.format(kprCalculation.firstMonthPayment)}
                    <span className="text-xs font-bold text-slate-400">/bln</span>
                  </p>
                  {kprScheme === 'tiered' && kprFixedYears < kprTenorYears && (
                    <p className="text-[11px] text-amber-300 font-bold mt-1">
                      Est. Masa Floating (Thn {kprFixedYears + 1}–{kprTenorYears}):{' '}
                      <span className="font-mono">{formatterIDR.format(kprCalculation.floatingMonthPayment)}/bln</span>
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-slate-800/70 p-3 rounded-xl border border-slate-700/60">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Pokok Pinjaman (Plafon)</span>
                    <span className="font-extrabold text-white font-mono mt-1 block">
                      {formatterIDR.format(kprCalculation.principal)}
                    </span>
                  </div>
                  <div className="bg-slate-800/70 p-3 rounded-xl border border-slate-700/60">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Total Estimasi Bunga</span>
                    <span className="font-extrabold text-rose-400 font-mono mt-1 block">
                      {formatterIDR.format(kprCalculation.totalInterest)}
                    </span>
                  </div>
                  <div className="bg-slate-800/70 p-3 rounded-xl border border-slate-700/60">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Komposisi Bulan ke-1</span>
                    <span className="text-[11px] font-bold text-slate-200 mt-1 block">
                      Pokok {formatterIDR.format(kprCalculation.firstMonthPrincipal)} • Bunga {formatterIDR.format(kprCalculation.firstMonthInterest)}
                    </span>
                  </div>
                  <div className="bg-slate-800/70 p-3 rounded-xl border border-slate-700/60">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Total Pembayaran</span>
                    <span className="font-extrabold text-blue-300 font-mono mt-1 block">
                      {formatterIDR.format(kprCalculation.totalPayment)}
                    </span>
                  </div>
                </div>

                {/* Estimasi Biaya Akad & Total Persiapan Awal */}
                <div className="bg-slate-800/70 border border-slate-700/70 rounded-xl p-3.5 space-y-1.5 text-[11px]">
                  <div className="flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider text-slate-300 border-b border-slate-700/60 pb-1.5">
                    <span>Estimasi Biaya Akad ({activeKprPreset.name})</span>
                    <span className="font-mono text-amber-300">
                      {formatterIDR.format(kprCalculation.closingCosts.totalClosingCosts)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-slate-300">
                    <div className="flex justify-between">
                      <span>Provisi ({activeKprPreset.provisiPct}%):</span>
                      <span className="font-mono tabular-nums">{formatCompactIDR(kprCalculation.closingCosts.provisiFee)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Admin &amp; Appraisal:</span>
                      <span className="font-mono tabular-nums">
                        {formatCompactIDR(kprCalculation.closingCosts.adminFee + kprCalculation.closingCosts.appraisalFee)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Notaris/AJB ({activeKprPreset.notaryAjbPct}%):</span>
                      <span className="font-mono tabular-nums">{formatCompactIDR(kprCalculation.closingCosts.notaryAjbFee)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>BPHTB ({activeKprPreset.bphtbPct}%):</span>
                      <span className="font-mono tabular-nums">{formatCompactIDR(kprCalculation.closingCosts.bphtbTax)}</span>
                    </div>
                    <div className="flex justify-between col-span-2">
                      <span>Asuransi Jiwa &amp; Properti ({activeKprPreset.insurancePct}%):</span>
                      <span className="font-mono tabular-nums">{formatCompactIDR(kprCalculation.closingCosts.insuranceFee)}</span>
                    </div>
                  </div>
                  <div className="flex justify-between pt-1.5 border-t border-slate-700/60 font-bold text-white">
                    <span>Total Dana Awal (DP + Biaya Akad):</span>
                    <span className="font-mono tabular-nums text-emerald-300">
                      {formatterIDR.format(kprCalculation.totalInitialCashNeeded)}
                    </span>
                  </div>
                  <div className="pt-1.5 border-t border-slate-700/60 text-[10px] font-mono tabular-nums text-slate-400">
                    Pemetaan COA: Aset {effectiveKprCoa.propertyAssetCode} · Utang {effectiveKprCoa.principalLiabilityCode} · Bunga {effectiveKprCoa.interestExpenseCode} · Legal {effectiveKprCoa.provisiAdminLegalCode} · Pajak {effectiveKprCoa.taxInsuranceCode}
                  </div>
                </div>

                {/* Live Sync Impact Box */}
                <div className="bg-blue-950/60 border border-blue-800/60 rounded-xl p-3.5 space-y-2">
                  <div className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-blue-300">
                    <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                    Dampak Sinkronisasi ke Hutang Berjalan
                  </div>
                  <div className="space-y-1 text-[11px]">
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-300">Total Akumulasi Hutang:</span>
                      <span className="font-mono font-bold text-white">
                        {formatterIDR.format(totalDebtBalance)} →{' '}
                        <span className="text-amber-300">{formatterIDR.format(totalDebtBalance + kprCalculation.principal)}</span>
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-300">Total Cicilan Minimum/Bln:</span>
                      <span className="font-mono font-bold text-white">
                        {formatterIDR.format(totalMinPayment)} →{' '}
                        <span className="text-emerald-300">{formatterIDR.format(totalMinPayment + Math.round(kprCalculation.firstMonthPayment))}</span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  onClick={handleAddKprDebt}
                  className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-extrabold uppercase tracking-wider shadow-lg shadow-blue-900/40 transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  Tambah ke Daftar Utang
                </button>
                <button
                  type="button"
                  onClick={() => setShowKprAmortization(!showKprAmortization)}
                  className="w-full py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-[11px] font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {showKprAmortization ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  {showKprAmortization
                    ? 'Sembunyikan Jadwal Amortisasi Tahunan'
                    : `Lihat Jadwal Amortisasi Tahunan (${kprCalculation.tenorYears} Tahun)`}
                </button>
              </div>
            </div>
          </div>

          <KprAmortizationChart
            calculatorSchedule={kprCalculation}
            calculatorName={kprName}
            calculatorScheme={kprScheme}
            activeKprDebts={activeKprDebts}
            visualSource={kprVisualSource}
            onChangeVisualSource={setKprVisualSource}
            selectedSavedKprId={selectedSavedKprId}
            onChangeSavedKprId={setSelectedSavedKprId}
            showAmortizationTable={showKprAmortization}
            onToggleAmortizationTable={() => setShowKprAmortization((prev) => !prev)}
            formatterIDR={formatterIDR}
            formatCompactIDR={formatCompactIDR}
          />
        </div>
      </div>

      {/* SECTION 2: MANAJEMEN HUTANG & PRIORITAS PELUNASAN */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Column 1: Add New Debt Only (Payments are centralized in Jurnal Transaksi) */}
        <div className="space-y-6 lg:col-span-1">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 bg-blue-600 text-white flex items-center gap-2 border-b border-blue-700/40">
              <Plus className="h-4 w-4 shrink-0" />
              <span className="text-xs font-extrabold uppercase tracking-wider">Tambah Hutang Baru</span>
            </div>

            <form onSubmit={handleAddDebtSubmit} className="p-5 space-y-4">
              <div>
                <h3 className="font-bold text-slate-800 text-sm">Catat Kewajiban Hutang Baru</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Khusus perhitungan &amp; penambahan hutang baru. Otomatis masuk ke daftar prioritas, Simulator What-If, dan Analisis AI.
                </p>
              </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
                    Nama Hutang / Kreditur
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Contoh: KTA Bank Mandiri / Cicilan Mobil"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
                      Kategori
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-bold text-slate-800 cursor-pointer"
                    >
                      <option value="KPR / Properti">KPR / Properti</option>
                      <option value="Pinjaman Bank / KTA">Pinjaman Bank / KTA</option>
                      <option value="Cicilan Kendaraan">Cicilan Kendaraan</option>
                      <option value="Kartu Kredit">Kartu Kredit</option>
                      <option value="PayLater / Fintech">PayLater / Fintech</option>
                      <option value="Pinjaman Keluarga / Lainnya">Pinjaman Lainnya</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
                      Sifat Utang
                    </label>
                    <select
                      value={purpose}
                      onChange={(e) => setPurpose(e.target.value as 'productive' | 'consumptive')}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-bold text-slate-800 cursor-pointer"
                    >
                      <option value="consumptive">Konsumtif</option>
                      <option value="productive">Produktif</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
                    Sisa Pokok Hutang (Rp)
                  </label>
                  <FormattedNumberInput
                    value={balance}
                    onChange={(val) => setBalance(String(val))}
                    placeholder="Contoh: 15.000.000"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
                      Bunga (% APR/Thn)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={interestRate}
                      onChange={(e) => setInterestRate(e.target.value)}
                      placeholder="Contoh: 12"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
                      Tgl Jatuh Tempo
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      value={dueDayInput}
                      onChange={(e) => setDueDayInput(e.target.value)}
                      placeholder="1 - 31"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
                    Cicilan Minimum / Bulan (Rp)
                  </label>
                  <FormattedNumberInput
                    value={minPayment}
                    onChange={(val) => setMinPayment(String(val))}
                    placeholder="Contoh: 750.000"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Bank Account Auto-Sync Toggle */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-start gap-2 min-w-0">
                      <Landmark className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="text-[11px] font-extrabold text-slate-800 block leading-tight">
                          Hubungkan ke Akun Bank
                        </span>
                        <span className="text-[10px] text-slate-500 block mt-0.5 leading-snug">
                          Catat pengeluaran otomatis pencairan pinjaman &amp; sinkronkan saldo kas saat disimpan.
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={linkBankEnabled}
                      onClick={() => {
                        const next = !linkBankEnabled;
                        setLinkBankEnabled(next);
                        if (next && !addDisburseAccountId && liquidAccounts.length > 0) {
                          const preferredBank = liquidAccounts.find((a) => a.type === 'bank') || liquidAccounts[0];
                          setAddDisburseAccountId(preferredBank.id);
                        }
                      }}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                        linkBankEnabled ? 'bg-blue-600' : 'bg-slate-300'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition duration-200 ${
                          linkBankEnabled ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {linkBankEnabled && (
                    <div className="space-y-3 pt-2.5 border-t border-slate-200">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block">
                          Pilih Akun Bank / Kas Terhubung
                        </label>
                        <select
                          value={addDisburseAccountId}
                          onChange={(e) => setAddDisburseAccountId(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 cursor-pointer"
                          required={linkBankEnabled}
                        >
                          <option value="">-- Pilih Akun Bank --</option>
                          {liquidAccounts.map((acc) => (
                            <option key={acc.id} value={acc.id}>
                              {acc.type === 'bank' ? '[Bank] ' : ''}{acc.name} ({formatterIDR.format(acc.currentBalance)})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block">
                          Arah Mutasi Kas Pencairan Pinjaman
                        </label>
                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            type="button"
                            onClick={() => setBankLinkTxType('expense')}
                            className={`py-2 px-2 rounded-xl text-[10px] font-extrabold border transition cursor-pointer ${
                              bankLinkTxType === 'expense'
                                ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            Pengeluaran (- Saldo Kas)
                          </button>
                          <button
                            type="button"
                            onClick={() => setBankLinkTxType('income')}
                            className={`py-2 px-2 rounded-xl text-[10px] font-extrabold border transition cursor-pointer ${
                              bankLinkTxType === 'income'
                                ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            Dana Masuk (+ Saldo Kas)
                          </button>
                        </div>
                      </div>

                      {(() => {
                        const selectedAcc = liquidAccounts.find((a) => a.id === addDisburseAccountId);
                        const parsedBal = normalizeAbsAmount(parseFloat(balance));
                        if (!selectedAcc) return null;
                        const delta = getTransactionAccountDelta({
                          type: bankLinkTxType,
                          amount: parsedBal,
                        });
                        const projectedBankBal = applyAccountBalanceChange(selectedAcc, delta).currentBalance;
                        return (
                          <div className="bg-white border border-blue-100 rounded-xl p-2.5 text-[10px] space-y-1">
                            <div className="flex justify-between gap-2">
                              <span className="text-slate-500 font-semibold">Saldo {selectedAcc.name}:</span>
                              <span className="font-mono font-bold text-slate-800">
                                {formatterIDR.format(selectedAcc.currentBalance)} →{' '}
                                <span className={bankLinkTxType === 'expense' ? 'text-rose-600' : 'text-emerald-600'}>
                                  {formatterIDR.format(projectedBankBal)}
                                </span>
                              </span>
                            </div>
                            <div className="flex justify-between gap-2">
                              <span className="text-slate-500 font-semibold">Total Kewajiban Utang:</span>
                              <span className="font-mono font-bold text-slate-800">
                                {formatterIDR.format(totalDebtBalance)} →{' '}
                                <span className="text-blue-700">{formatterIDR.format(totalDebtBalance + parsedBal)}</span>
                              </span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-extrabold uppercase tracking-wider shadow-sm transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  Simpan &amp; Sinkronkan Hutang
                </button>
              </form>
          </div>

          {/* Centralized Payment & Synchronization Info Card */}
          <div className="bg-slate-900 text-white p-5 rounded-2xl border border-slate-800 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-emerald-400 shrink-0" />
              <h4 className="font-bold text-xs uppercase tracking-wider text-slate-100">
                Pembayaran &amp; Pelunasan Terpusat
              </h4>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              Menu Hutang khusus untuk <strong>perhitungan kapasitas, simulasi &amp; penambahan KPR baru, serta pencatatan hutang baru</strong>. Seluruh pembayaran cicilan hutang maupun KPR dilakukan dalam <strong>satu proses</strong> di menu <strong>Jurnal Transaksi</strong> agar tidak terjadi transaksi ganda.
            </p>
            {onNavigateToPayDebt && (
              <button
                type="button"
                onClick={() => onNavigateToPayDebt()}
                className="w-full py-2.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-[11px] font-extrabold uppercase tracking-wider transition flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
              >
                <Wallet className="h-3.5 w-3.5" />
                Bayar Cicilan di Jurnal Transaksi →
              </button>
            )}
          </div>
        </div>

        {/* Strategy Engine & Debt Payoff Priority */}
        <div className="space-y-6 lg:col-span-2">
          {/* Toggle strategy */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <h3 className="font-semibold text-slate-800 text-sm uppercase tracking-wider flex items-center gap-2">
                  <ListOrdered className="h-5 w-5 text-blue-600" />
                  Urutan Pelunasan Strategis
                </h3>
                <p className="text-xs text-slate-400 mt-1">Pilih simulasi strategi pelunasan utang tercepat & terbaik.</p>
              </div>

              {/* Toggle Buttons */}
              <div className="inline-flex bg-slate-100 p-1 rounded-lg shrink-0">
                <button
                  onClick={() => setStrategy('snowball')}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase transition cursor-pointer ${
                    strategy === 'snowball'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Snowball
                </button>
                <button
                  onClick={() => setStrategy('avalanche')}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase transition cursor-pointer ${
                    strategy === 'avalanche'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Avalanche
                </button>
              </div>
            </div>

            {/* Strategy explanation */}
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-100 text-xs text-slate-600 leading-relaxed mb-6">
              {strategy === 'snowball' ? (
                <p>
                  <strong>Metode Snowball (Bola Salju):</strong> Melunasi utang dari saldo terendah terlebih dahulu. Ini secara psikologis sangat memotivasi karena Anda melihat akun utang lunas dengan cepat satu demi satu, menyuntikkan energi kedisiplinan!
                </p>
              ) : (
                <p>
                  <strong>Metode Avalanche (Longsoran):</strong> Melunasi utang dari suku bunga (APR) tertinggi terlebih dahulu. Ini adalah metode matematika paling optimal yang meminimalkan pengeluaran bunga total, menghemat uang Anda secara maksimal!
                </p>
              )}
            </div>

            {/* Combined stats */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                <span className="text-[10px] uppercase font-bold text-slate-400">Total Akumulasi Hutang</span>
                <p className="text-base font-bold text-rose-600 font-mono mt-1">
                  {formatterIDR.format(totalDebtBalance)}
                </p>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                <span className="text-[10px] uppercase font-bold text-slate-400">Total Cicilan Minimum Bulanan</span>
                <p className="text-base font-bold text-slate-800 font-mono mt-1">
                  {formatterIDR.format(totalMinPayment)}
                </p>
              </div>
            </div>

            {/* Ordered payment list */}
            {allDebts.filter(d => d.balance > 0).length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-sm">
                Hebat! Tidak ada catatan hutang aktif. Gunakan kalkulator KPR atau formulir Tambah Hutang jika ingin mensimulasikan kewajiban baru.
              </div>
            ) : (
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Prioritas Alokasi Dana Tambahan (Urutan Pelunasan):
                </h4>

                <div className="space-y-3">
                  {orderedDebts.map((d, index) => {
                    const dueInfo = getDaysUntilDue((d as Debt).dueDate, d.dueDay);
                    const isKpr = d.category === 'KPR / Properti' || Boolean((d as Debt).kprScheme);
                    const kprTenor = (d as Debt).tenorMonths ? Math.round(((d as Debt).tenorMonths || 0) / 12) : null;
                    return (
                    <div 
                      key={d.id} 
                      className={`p-4 rounded-xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                        index === 0 
                          ? 'bg-rose-50/40 border-rose-100 shadow-xxs ring-1 ring-rose-200/50' 
                          : 'bg-white border-slate-100 hover:border-slate-200'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-lg shrink-0 ${
                          index === 0 ? 'bg-rose-100 text-rose-600' : 'bg-slate-100 text-slate-500'
                        }`}>
                          <span className="text-xs font-black font-mono">#{index + 1}</span>
                        </div>
                        
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h5 className="font-bold text-slate-800 text-sm">{d.name}</h5>
                            {isKpr && (
                              <span className="text-[9px] uppercase font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                                <Home className="h-2.5 w-2.5 shrink-0" />
                                KPR{kprTenor ? ` • ${kprTenor} Thn` : ''}
                              </span>
                            )}
                            {d.isAccount && (
                              <span className="text-[10px] font-semibold text-blue-700 flex items-center gap-1">
                                <ArrowLeftRight className="h-2.5 w-2.5 shrink-0" />
                                Terkoneksi Rekening
                              </span>
                            )}
                            {d.isAccount && (d as typeof accountDebts[number]).overlimitAmount > 0 && (
                              <span className="text-[10px] font-bold text-rose-600 font-mono tabular-nums">
                                · Overlimit (Sisa Limit {formatterIDR.format((d as typeof accountDebts[number]).remainingLimit)})
                              </span>
                            )}
                            {index === 0 && (
                              <span className="text-[9px] uppercase font-extrabold bg-rose-600 text-white px-1.5 py-0.5 rounded-full animate-pulse">
                                PRIORITAS PELUNASAN
                              </span>
                            )}
                            {dueInfo.status === 'urgent' && (
                              <span className="text-[9px] uppercase font-extrabold bg-amber-500 text-white px-2 py-0.5 rounded-full flex items-center gap-1">
                                <Clock className="h-2.5 w-2.5" />
                                {dueInfo.text}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2 mt-1.5 items-center text-[10px] font-bold text-slate-400 uppercase">
                            <span>{d.category}</span>
                            <span className="text-slate-300">•</span>
                            <span className={d.purpose === 'consumptive' ? 'text-amber-600' : 'text-emerald-600'}>
                              {d.purpose === 'consumptive' ? 'Konsumtif' : 'Produktif'}
                            </span>
                            {(d as Debt).kprScheme && (
                              <>
                                <span className="text-slate-300">•</span>
                                <span className="text-indigo-600">
                                  {(d as Debt).kprScheme === 'tiered'
                                    ? 'Fixed → Floating'
                                    : (d as Debt).kprScheme === 'flat'
                                    ? 'Bunga Flat'
                                    : 'Anuitas'}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex sm:flex-col items-baseline sm:items-end justify-between sm:justify-start gap-2 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100/70">
                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            <span className="text-xs text-slate-400 font-medium">Sisa Saldo</span>
                            <p className="font-bold text-slate-800 text-sm font-mono mt-0.5">
                              {formatterIDR.format(d.balance)}
                            </p>
                          </div>
                          {!d.isAccount && (
                            <button
                              type="button"
                              onClick={() =>
                                showConfirm(
                                  'Hapus Hutang',
                                  `Apakah Anda yakin ingin menghapus catatan hutang "${d.name}"?`,
                                  () => {
                                    onDeleteDebt(d.id);
                                    showAlert('Berhasil Dihapus', 'Catatan hutang berhasil dihapus.');
                                  }
                                )
                              }
                              title={`Hapus ${d.name}`}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>

                        <div className="text-right sm:mt-1 space-y-0.5">
                          <span className="text-[10px] text-slate-400 font-bold block">
                            Bunga: <strong className="text-slate-600 font-mono">{d.interestRate}% APR</strong>
                          </span>
                          <span className="text-[10px] text-slate-400 font-bold block">
                            Min. Bayar: <strong className="text-slate-600 font-mono">{formatterIDR.format(d.minPayment)}</strong>
                          </span>
                          <span className="text-[10px] text-slate-400 font-bold flex items-center justify-end gap-1">
                            <Calendar className="h-3 w-3 text-amber-500 shrink-0" />
                            <span>Tgl Jatuh Tempo:</span>
                            <strong className="text-amber-600 font-mono">
                              {(d as Debt).dueDate ? (d as Debt).dueDate : d.dueDay ? `Tgl ${d.dueDay}` : '-'}
                            </strong>
                          </span>
                          {dueInfo.status !== 'none' && (
                            <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded inline-block ${
                              dueInfo.status === 'urgent' ? 'bg-rose-100 text-rose-700' :
                              dueInfo.status === 'warning' ? 'bg-amber-100 text-amber-700' :
                              'bg-emerald-100 text-emerald-700'
                            }`}>
                              {dueInfo.text}
                            </span>
                          )}
                          <div className="pt-1 flex flex-wrap items-center justify-end gap-1.5">
                            {isKpr && !d.isAccount && (
                              <button
                                type="button"
                                onClick={() => {
                                  setKprVisualSource('saved');
                                  setSelectedSavedKprId(d.id);
                                  document
                                    .getElementById('kpr-amortization-chart')
                                    ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white border border-indigo-200 hover:border-indigo-600 rounded-lg text-[10px] font-extrabold transition cursor-pointer"
                              >
                                <BarChart3 className="h-3 w-3" />
                                Grafik Amortisasi
                              </button>
                            )}
                            {onNavigateToPayDebt && (
                              <button
                                type="button"
                                onClick={() => onNavigateToPayDebt(d.isAccount ? `acc-debt-${d.id}` : d.id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white border border-emerald-200 hover:border-emerald-600 rounded-lg text-[10px] font-extrabold transition cursor-pointer"
                              >
                                <Wallet className="h-3 w-3" />
                                Bayar di Jurnal →
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                  })}
                </div>

                {/* Strategy advice card */}
                <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-100 text-xs text-blue-950">
                  <p className="font-bold flex items-center gap-1.5 text-blue-900 mb-1">
                    <ShieldAlert className="h-4 w-4 shrink-0" /> Rekomendasi Alur Pembayaran:
                  </p>
                  <p className="leading-relaxed">
                    Lakukan pembayaran minimum untuk semua utang lainnya, dan salurkan dana bebas pelunasan Anda ke <strong>{orderedDebts[0]?.name}</strong> melalui menu <strong>Jurnal Transaksi</strong> agar saldo hutang dan jurnal tercatat dalam satu proses tanpa duplikasi.
                  </p>
                </div>

                {/* Action options */}
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleDeleteTop}
                    className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition"
                  >
                    <Trash2 className="h-4 w-4" /> Hapus Teratas (Lunas!)
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SECTION 3: WHAT-IF DEBT PAYOFF SIMULATOR */}
      <div className="bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-950 p-6 rounded-2xl text-white shadow-xl border border-indigo-800/50 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-indigo-800/40 pb-5">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-500/20 border border-amber-400/30 rounded-2xl text-amber-400 shadow-inner">
              <Calculator className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-base font-black tracking-tight text-white flex items-center gap-2 flex-wrap">
                Kalkulator Simulasi "Apa yang Terjadi Jika" (What-If)
                <span className="text-[10px] font-extrabold bg-amber-500/30 text-amber-300 border border-amber-400/30 px-2.5 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1">
                  <Zap className="h-3 w-3" /> Percepatan Lunas
                </span>
              </h3>
              <p className="text-xs text-slate-300 font-medium mt-0.5">
                Simulasikan dampak pembayaran ekstra atau lump-sum terhadap durasi bebas utang (termasuk KPR aktif) dan penghematan biaya bunga.
              </p>
            </div>
          </div>
        </div>

        {/* CONTROLS GRID */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-900/80 p-4 rounded-xl border border-slate-800">
          {/* Target Debt Select */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">
              Pilih Utang Target
            </label>
            <select
              value={selectedSimDebtId}
              onChange={(e) => setSelectedSimDebtId(e.target.value)}
              className="w-full bg-slate-800 text-white text-xs font-semibold rounded-xl border border-slate-700 p-2.5 focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="all">Semua Utang Aktif ({allDebts.filter(d => d.balance > 0).length} Utang)</option>
              {allDebts.filter(d => d.balance > 0).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({formatterIDR.format(d.balance)})
                </option>
              ))}
            </select>
          </div>

          {/* Extra Monthly Input */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">
              Tambahan Cicilan Bulanan
            </label>
            <FormattedNumberInput
              value={simExtraMonthly}
              onChange={(val) => setSimExtraMonthly(typeof val === 'number' ? val : parseFloat(val) || 0)}
              placeholder="0"
              className="w-full bg-slate-800 text-white text-xs font-semibold rounded-xl border border-slate-700 p-2.5 focus:outline-none focus:border-indigo-500"
            />
            {/* Quick preset buttons */}
            <div className="flex gap-1 pt-1 flex-wrap">
              {[100000, 250000, 500000, 1000000].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setSimExtraMonthly(amt)}
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border transition cursor-pointer ${
                    simExtraMonthly === amt
                      ? 'bg-amber-500 text-slate-950 border-amber-400 font-extrabold'
                      : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                  }`}
                >
                  +{amt >= 1000000 ? `${amt / 1000000}jt` : `${amt / 1000}rb`}
                </button>
              ))}
            </div>
          </div>

          {/* Lump Sum Extra Input */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">
              Pembayaran Lump-Sum (Bonus/THR)
            </label>
            <FormattedNumberInput
              value={simLumpSum}
              onChange={(val) => setSimLumpSum(typeof val === 'number' ? val : parseFloat(val) || 0)}
              placeholder="0"
              className="w-full bg-slate-800 text-white text-xs font-semibold rounded-xl border border-slate-700 p-2.5 focus:outline-none focus:border-indigo-500"
            />
            {/* Quick preset buttons */}
            <div className="flex gap-1 pt-1 flex-wrap">
              {[0, 1000000, 2500000, 5000000].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setSimLumpSum(amt)}
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border transition cursor-pointer ${
                    simLumpSum === amt
                      ? 'bg-amber-500 text-slate-950 border-amber-400 font-extrabold'
                      : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                  }`}
                >
                  {amt === 0 ? 'Rp 0' : `${amt >= 1000000 ? `${amt / 1000000}jt` : `${amt / 1000}rb`}`}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* RESULTS COMPARISON DISPLAY */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Percepatan Durasi Lunas
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-amber-400">
                {simResult.accMonths} Bulan
              </span>
              <span className="text-xs text-slate-400 line-through">
                {simResult.baseMonths} Bulan (Standar)
              </span>
            </div>
            {simResult.monthsSaved > 0 && (
              <div className="inline-flex items-center gap-1 text-xs font-bold text-emerald-400 bg-emerald-500/20 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                <Zap className="h-3 w-3" /> Lunas {simResult.monthsSaved} Bulan Lebih Cepat!
              </div>
            )}
          </div>

          <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Penghematan Biaya Bunga
            </span>
            <div className="text-2xl font-black text-emerald-400">
              {formatterIDR.format(simResult.interestSaved)}
            </div>
            <p className="text-[11px] text-slate-400">
              Total bunga skema baru: {formatterIDR.format(simResult.accTotalInterest)} (sebelumnya {formatterIDR.format(simResult.baseTotalInterest)})
            </p>
          </div>

          <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Estimasi Tanggal Bebas Utang
            </span>
            <div className="text-lg font-black text-white flex items-center gap-2">
              <Calendar className="h-5 w-5 text-indigo-400 shrink-0" />
              <span>{simResult.accPayoffDateStr}</span>
            </div>
            <p className="text-[11px] text-slate-400">
              Versi standar: {simResult.basePayoffDateStr}
            </p>
          </div>
        </div>

        {/* COMPARISON BAR VISUALIZATION */}
        <div className="bg-slate-900/90 p-4 rounded-xl border border-slate-800 space-y-3">
          <div className="flex items-center justify-between text-xs font-bold text-slate-300">
            <span>Visualisasi Perbandingan Durasi Pelunasan</span>
            <span className="text-amber-300">
              {simResult.monthsSaved > 0 ? `Hemat ${simResult.monthsSaved} Bulan!` : 'Masukkan cicilan ekstra untuk simulasi'}
            </span>
          </div>

          <div className="space-y-2 text-xs">
            {/* Standar bar */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] text-slate-400 font-semibold">
                <span>Pembayaran Standar (Min. Payment)</span>
                <span>{simResult.baseMonths} Bulan</span>
              </div>
              <div className="w-full bg-slate-800 h-3 rounded-full overflow-hidden">
                <div className="bg-slate-500 h-full rounded-full w-full"></div>
              </div>
            </div>

            {/* Simulated bar */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] text-amber-300 font-bold">
                <span>Pembayaran Dipercepat (Simulasi)</span>
                <span>{simResult.accMonths} Bulan</span>
              </div>
              <div className="w-full bg-slate-800 h-3 rounded-full overflow-hidden">
                <div
                  className="bg-gradient-to-r from-amber-500 to-emerald-400 h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${simResult.baseMonths > 0 ? Math.max(5, Math.min(100, (simResult.accMonths / simResult.baseMonths) * 100)) : 0}%`,
                  }}
                ></div>
              </div>
            </div>
          </div>

          <div className="p-3 bg-indigo-950/60 rounded-lg border border-indigo-800/60 text-xs text-indigo-200 leading-relaxed flex items-start gap-2.5">
            <Sparkles className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <strong>Rekomendasi Simulasi:</strong> Dengan menambah pembayaran ekstra sebesar{' '}
              <span className="font-extrabold text-white">{formatterIDR.format(simExtraMonthly)}</span>/bulan
              {simLumpSum > 0 && <span> serta setoran awal <span className="font-extrabold text-white">{formatterIDR.format(simLumpSum)}</span></span>}, Anda akan melunasi utang{' '}
              <span className="font-extrabold text-emerald-300">{simResult.monthsSaved} bulan lebih cepat</span> dan menghemat{' '}
              <span className="font-extrabold text-amber-300">{formatterIDR.format(simResult.interestSaved)}</span> uang Anda dari biaya bunga!
            </div>
          </div>
        </div>
      </div>

      {/* Custom Confirmation Modal */}
      {confirmModal && confirmModal.isOpen && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity" onClick={() => setConfirmModal(null)} />
          <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl max-w-sm w-full overflow-hidden relative z-10 p-6 space-y-4 animate-slide-in">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2 bg-rose-50 rounded-lg">
                <AlertCircle className="h-5 w-5 text-rose-600 animate-pulse" />
              </div>
              <h4 className="font-black text-slate-800 text-xs uppercase tracking-wider">{confirmModal.title}</h4>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed font-semibold">
              {confirmModal.message}
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-[10px] font-black uppercase transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  confirmModal.onConfirm();
                  setConfirmModal(null);
                }}
                className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[10px] font-black uppercase shadow-xs transition cursor-pointer"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Alert Modal */}
      {alertModal && alertModal.isOpen && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity" onClick={() => setAlertModal(null)} />
          <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl max-w-sm w-full overflow-hidden relative z-10 p-6 space-y-4 animate-slide-in">
            <div className="flex items-center gap-3 text-blue-600">
              <div className="p-2 bg-blue-50 rounded-lg">
                <Info className="h-5 w-5 text-blue-600" />
              </div>
              <h4 className="font-black text-slate-800 text-xs uppercase tracking-wider">{alertModal.title}</h4>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed font-semibold">
              {alertModal.message}
            </p>
            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setAlertModal(null)}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[10px] font-black uppercase transition shadow-xs cursor-pointer"
              >
                Mengerti
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
