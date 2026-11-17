import React, { useState } from 'react';
import { Debt, Account } from '../types';
import { FormattedNumberInput } from './FormattedNumberInput';
import { CreditCard, Calculator, ListOrdered, CheckCircle2, AlertCircle, Plus, Trash2, ShieldAlert, ArrowLeftRight, Info, Calendar, Clock, Zap, TrendingDown, Sparkles, HelpCircle, RefreshCw, ArrowRight } from 'lucide-react';

export function getDaysUntilDue(dueDate?: string, dueDay?: number) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (dueDate) {
    const due = new Date(dueDate);
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
  onAddDebt: (debt: Omit<Debt, 'id'>) => void;
  onDeleteDebt: (id: string) => void;
  onPayDebt: (debtId: string, amount: number, sourceAccountId: string) => void;
  onTransferFunds?: (amount: number, fromAccountId: string, toAccountId: string, description: string) => void;
}

export const DebtTab: React.FC<DebtTabProps> = ({
  debts,
  accounts,
  onAddDebt,
  onDeleteDebt,
  onPayDebt,
  onTransferFunds,
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
  const [category, setCategory] = useState('Kartu Kredit');
  const [dueDayInput, setDueDayInput] = useState('');

  // Pay Debt Form State
  const [payDebtId, setPayDebtId] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [sourceAccountId, setSourceAccountId] = useState('');

  const formatterIDR = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  });

  // Extract credit cards and paylaters into virtual debts
  const accountDebts = accounts
    .filter(acc => acc.type === 'credit-card' || acc.type === 'paylater')
    .map(acc => {
      const defaultAPR = acc.type === 'credit-card' ? 21 : 24;
      const rate = acc.interestRate !== undefined ? acc.interestRate : defaultAPR;
      
      const calculatedMin = Math.max((acc.usedLimit || 0) * 0.1, (acc.usedLimit && acc.usedLimit > 0) ? 50000 : 0);
      const min = acc.minPayment !== undefined ? acc.minPayment : calculatedMin;

      return {
        id: acc.id,
        name: acc.name,
        balance: acc.usedLimit || 0,
        interestRate: rate,
        minPayment: min,
        purpose: 'consumptive',
        category: acc.type === 'credit-card' ? 'Kartu Kredit' : 'PayLater / Fintech',
        dueDay: acc.dueDay,
        isAccount: true,
      };
    });

  const allDebts = [
    ...debts.map(d => ({ ...d, isAccount: false })),
    ...accountDebts
  ];

  const liquidAccounts = accounts.filter(a => a.type !== 'credit-card' && a.type !== 'paylater');

  // Pre-select first available liquid account when selecting a debt
  React.useEffect(() => {
    if (payDebtId) {
      const firstLiquid = liquidAccounts.find(a => a.currentBalance > 0);
      if (firstLiquid) {
        setSourceAccountId(firstLiquid.id);
      }
    } else {
      setSourceAccountId('');
    }
  }, [payDebtId]);

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
  const totalMinPayment = allDebts.reduce((sum, d) => sum + d.minPayment, 0);

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

      // Baseline simulation
      let balBase = debt.balance;
      let mBase = 0;
      let intBaseAcc = 0;
      while (balBase > 0 && mBase < 360) {
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
      while (balAcc > 0 && mAcc < 360) {
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

  const handleAddDebtSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const b = parseFloat(balance);
    const i = parseFloat(interestRate);
    const m = parseFloat(minPayment);
    const d = parseInt(dueDayInput) || undefined;

    if (!name || isNaN(b) || b <= 0 || isNaN(i) || isNaN(m)) {
      showAlert('Formulir Tidak Valid', 'Mohon isi semua data hutang dengan benar.');
      return;
    }

    onAddDebt({
      name,
      balance: b,
      interestRate: i,
      minPayment: m,
      purpose,
      category,
      dueDay: d,
    });

    // Reset Form
    setName('');
    setBalance('');
    setInterestRate('');
    setMinPayment('');
    setDueDayInput('');
    showAlert('Hutang Disimpan', `Hutang "${name}" berhasil disimpan!`);
  };

  const handlePaySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(payAmount);
    if (!payDebtId || isNaN(amt) || amt <= 0 || !sourceAccountId) {
      showAlert('Formulir Tidak Valid', 'Mohon isi semua data pembayaran hutang dengan benar.');
      return;
    }

    // Verify source account balance
    const sourceAcc = accounts.find(a => a.id === sourceAccountId);
    if (!sourceAcc) {
      showAlert('Formulir Tidak Valid', 'Rekening sumber tidak valid.');
      return;
    }
    if (sourceAcc.currentBalance < amt) {
      showAlert('Saldo Kurang', `Saldo ${sourceAcc.name} (${formatterIDR.format(sourceAcc.currentBalance)}) tidak mencukupi untuk pembayaran sebesar ${formatterIDR.format(amt)}.`);
      return;
    }

    // Find the combined debt object
    const targetDebt = allDebts.find(d => d.id === payDebtId);
    if (!targetDebt) {
      showAlert('Formulir Tidak Valid', 'Hutang tidak ditemukan.');
      return;
    }

    if (targetDebt.balance < amt) {
      showAlert('Jumlah Melebihi', `Jumlah bayar melebihi saldo hutang saat ini (${formatterIDR.format(targetDebt.balance)}).`);
      return;
    }

    // Perform payment
    if (targetDebt.isAccount) {
      if (onTransferFunds) {
        onTransferFunds(amt, sourceAccountId, payDebtId, `Pelunasan Tagihan: ${targetDebt.name}`);
        setPayAmount('');
        setPayDebtId('');
        showAlert('Pembayaran Berhasil', 'Pembayaran tagihan kartu kredit/paylater berhasil dicatat! Sisa limit dan rekening kas Anda telah diperbarui.');
      } else {
        showAlert('Error', 'Fungsi mutasi dana tidak tersedia.');
      }
    } else {
      onPayDebt(payDebtId, amt, sourceAccountId);
      setPayAmount('');
      setPayDebtId('');
      showAlert('Pembayaran Berhasil', 'Pembayaran cicilan hutang berhasil dicatat! Saldo hutang dan kas Anda telah diperbarui.');
    }
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

  return (
    <div className="space-y-8">
      {/* WHAT-IF DEBT PAYOFF SIMULATOR */}
      <div className="bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-950 p-6 rounded-2xl text-white shadow-xl border border-indigo-800/50 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-indigo-800/40 pb-5">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-500/20 border border-amber-400/30 rounded-2xl text-amber-400 shadow-inner">
              <Calculator className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-base font-black tracking-tight text-white flex items-center gap-2">
                Kalkulator Simulasi "Apa yang Terjadi Jika" (What-If)
                <span className="text-[10px] font-extrabold bg-amber-500/30 text-amber-300 border border-amber-400/30 px-2.5 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1">
                  <Zap className="h-3 w-3" /> Percepatan Lunas
                </span>
              </h3>
              <p className="text-xs text-slate-300 font-medium mt-0.5">
                Simulasikan dampak pembayaran ekstra atau lump-sum terhadap durasi bebas utang dan penghematan biaya bunga.
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Column 1: Centralized Guidance Panel */}
      <div className="space-y-6 lg:col-span-1">
        <div className="bg-slate-900 text-white p-6 rounded-xl border border-slate-850 shadow-md space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
            <Info className="h-5 w-5 text-blue-400" />
            <h3 className="font-semibold text-sm uppercase tracking-wider text-slate-100">
              Pencatatan Terpusat
            </h3>
          </div>
          
          <p className="text-xs text-slate-300 leading-relaxed">
            Sesuai dengan kebijakan integrasi sistem keuangan terpadu, seluruh pencatatan hutang baru maupun pembayaran cicilan dilakukan secara terpusat melalui menu <strong>Jurnal Transaksi</strong>.
          </p>

          <div className="space-y-3 pt-2">
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-850 space-y-1">
              <span className="text-[10px] uppercase font-black text-blue-400 block">
                1. Menerima Hutang Baru
              </span>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Pilih jenis transaksi <strong>Pemasukan (Income)</strong>, gunakan kategori <strong>"Penerimaan Utang Baru"</strong>. Ini akan menambah dana di rekening Anda dan otomatis mendaftarkan catatan hutang baru.
              </p>
            </div>

            <div className="bg-slate-950 p-3 rounded-lg border border-slate-850 space-y-1">
              <span className="text-[10px] uppercase font-black text-emerald-400 block">
                2. Membayar Cicilan / Pelunasan
              </span>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Pilih jenis transaksi <strong>Pengeluaran (Expense)</strong>, gunakan kategori <strong>"Cicilan / Pelunasan Utang"</strong>. Anda dapat memilih target hutang yang ingin dilunasi dari formulir transaksi.
              </p>
            </div>
          </div>

          <div className="p-3 bg-blue-950/40 border border-blue-900/30 text-blue-300 rounded-lg text-[10px] leading-relaxed">
            💡 Tips: Seluruh perhitungan kalkulator bunga, rasio DTI, dan prioritas pelunasan di tab ini akan otomatis ter-update secara real-time.
          </div>
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
                className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase transition ${
                  strategy === 'snowball'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Snowball
              </button>
              <button
                onClick={() => setStrategy('avalanche')}
                className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase transition ${
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
              Hebat! Tidak ada catatan hutang aktif. Keuangan Anda berada di jalan bebas hutang.
            </div>
          ) : (
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Prioritas Alokasi Dana Tambahan (Urutan Pelunasan):
              </h4>

              <div className="space-y-3">
                {orderedDebts.map((d, index) => {
                  const dueInfo = getDaysUntilDue((d as any).dueDate, d.dueDay);
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
                          {d.isAccount && (
                            <span className="text-[9px] uppercase font-extrabold bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                              <ArrowLeftRight className="h-2.5 w-2.5 shrink-0" />
                              Terkoneksi Rekening
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
                        </div>
                      </div>
                    </div>

                    <div className="flex sm:flex-col items-baseline sm:items-end justify-between sm:justify-start gap-2 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100/70">
                      <div className="text-right">
                        <span className="text-xs text-slate-400 font-medium">Sisa Saldo</span>
                        <p className="font-bold text-slate-800 text-sm font-mono mt-0.5">
                          {formatterIDR.format(d.balance)}
                        </p>
                      </div>

                      <div className="text-right sm:mt-1 space-y-0.5">
                        <span className="text-[10px] text-slate-400 font-bold block">
                          Bunga: <strong className="text-slate-600 font-mono">{d.interestRate}% APR</strong>
                        </span>
                        <span className="text-[10px] text-slate-400 font-bold block">
                          Min. Bayar: <strong className="text-slate-600 font-mono">{formatterIDR.format(d.minPayment)}</strong>
                        </span>
                        <span className="text-[10px] text-slate-400 font-bold block flex items-center justify-end gap-1">
                          <Calendar className="h-3 w-3 text-amber-500 shrink-0" />
                          <span>Tgl Jatuh Tempo:</span>
                          <strong className="text-amber-600 font-mono">
                            {(d as any).dueDate ? (d as any).dueDate : d.dueDay ? `Tgl ${d.dueDay}` : '-'}
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
                  Lakukan pembayaran minimum untuk semua utang lainnya. Sisa budget dana bebas pelunasan utang bulan ini wajib Anda salurkan seutuhnya langsung ke <strong>{orderedDebts[0]?.name}</strong> untuk mempercepat pelunasan total!
                </p>
              </div>

              {/* Action options */}
              <div className="flex justify-end gap-2">
                <button
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
  </div>
);
};
