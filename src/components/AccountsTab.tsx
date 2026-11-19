import React, { useState } from 'react';
import { Account, AccountType, Transaction } from '../types';
import { FormattedNumberInput } from './FormattedNumberInput';
import { Plus, Trash2, CreditCard, Wallet, Banknote, ShieldCheck, Info, Sparkles, Check, X, AlertCircle, Percent, DollarSign, FileText, Calendar, ArrowUpRight, ArrowDownLeft, RefreshCw, Layers, Building2, CheckCircle2 } from 'lucide-react';
import { getAccountCoaMapping, synchronizeAccountsAndCOA, CoaSyncReport } from '../coaUtils';
import {
  applyAccountBalanceChange,
  applyCreditBillPayment,
  calculateCreditPaylaterBills,
  calculateTotalLiquidCash,
  getAccountCreditBill,
  getCreditAccounts,
  getLiquidAccounts,
  getTransactionAccountDelta,
  isCreditAccount,
} from '../utils/accountingEngine';

interface AccountsTabProps {
  accounts: Account[];
  transactions: Transaction[];
  onUpdateAccountBalance: (accountId: string, newStartingBalance: number, newName?: string) => void;
  onAddAccountWithNumber: (
    name: string,
    type: AccountType,
    startingBalance: number,
    accountNumber?: string,
    initialDebt?: number,
    dueDay?: number,
    interestRate?: number,
    minPayment?: number
  ) => void;
  onDeleteAccount: (accountId: string) => void;
  onTransferFunds?: (amount: number, fromAccountId: string, toAccountId: string, description: string) => void;
  onAddTransaction?: (tx: Omit<Transaction, 'id'> & {
    linkedDebtId?: string;
    linkedDebtAction?: 'pay' | 'create';
  }) => boolean | void;
}

export const AccountsTab: React.FC<AccountsTabProps> = ({
  accounts,
  transactions = [],
  onUpdateAccountBalance,
  onAddAccountWithNumber,
  onDeleteAccount,
  onTransferFunds,
  onAddTransaction,
}) => {
  // Selected Account to filter transactions
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
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

  // Manual COA Sync Report Modal
  const [syncReportModal, setSyncReportModal] = useState<{
    isOpen: boolean;
    report: CoaSyncReport | null;
  }>({
    isOpen: false,
    report: null,
  });

  const handleManualCoaSync = () => {
    const { report } = synchronizeAccountsAndCOA(accounts);
    setSyncReportModal({
      isOpen: true,
      report,
    });
  };

  const showConfirm = (title: string, message: string, onConfirm: () => void) => {
    setConfirmModal({ isOpen: true, title, message, onConfirm });
  };

  const showAlert = (title: string, message: string) => {
    setAlertModal({ isOpen: true, title, message });
  };

  // Form states
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('bank');
  const [startingBalance, setStartingBalance] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [initialDebt, setInitialDebt] = useState('');
  const [dueDayInput, setDueDayInput] = useState('');
  const [interestRateInput, setInterestRateInput] = useState('');
  const [minPaymentInput, setMinPaymentInput] = useState('');

  // Editing state for starting balances (limits)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tempName, setTempName] = useState<string>('');
  const [tempBalance, setTempBalance] = useState<string>('');

  // Repayment / Bayar Tagihan state
  const [payingId, setPayingId] = useState<string | null>(null);
  const [sourceAccountId, setSourceAccountId] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDescription, setPaymentDescription] = useState('Pembayaran Tagihan');

  const formatterIDR = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  });

  // Calculate stats via centralized accounting engine
  const liquidAccounts = getLiquidAccounts(accounts);
  const creditCardAndPaylaterAccounts = getCreditAccounts(accounts);

  const totalLiquidBalance = calculateTotalLiquidCash(accounts);
  const totalCreditLimit = creditCardAndPaylaterAccounts.reduce((sum, a) => sum + (a.creditLimit || 0), 0);
  const totalCreditBill = calculateCreditPaylaterBills(accounts);
  const cashBalance = accounts.filter(a => a.type === 'cash').reduce((sum, a) => sum + a.currentBalance, 0);

  const isSelectedCreditOrPaylater = isCreditAccount({ type });

  // Filtered transactions for the selected account
  const selectedAccount = selectedAccountId ? accounts.find(acc => acc.id === selectedAccountId) : null;
  const filteredTxs = selectedAccount ? (transactions || []).filter(tx => tx.accountId === selectedAccount.id) : [];
  const selectedAccountIncome = filteredTxs
    .filter(tx => tx.type === 'income')
    .reduce((sum, tx) => sum + tx.amount, 0);
  const selectedAccountExpense = filteredTxs
    .filter(tx => tx.type === 'expense' || tx.type === 'saving' || tx.type === 'investment')
    .reduce((sum, tx) => sum + tx.amount, 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showAlert('Formulir Tidak Valid', 'Nama akun tidak boleh kosong.');
      return;
    }
    const balanceVal = parseFloat(startingBalance);
    if (isNaN(balanceVal) || balanceVal < 0) {
      showAlert('Formulir Tidak Valid', isSelectedCreditOrPaylater ? 'Limit maksimal harus bernilai positif.' : 'Saldo awal harus bernilai positif.');
      return;
    }

    const debtVal = isSelectedCreditOrPaylater ? (parseFloat(initialDebt) || 0) : 0;
    if (isSelectedCreditOrPaylater && debtVal < 0) {
      showAlert('Formulir Tidak Valid', 'Saldo awal hutang harus bernilai positif.');
      return;
    }
    if (isSelectedCreditOrPaylater && debtVal > balanceVal) {
      showAlert('Formulir Tidak Valid', 'Saldo awal hutang tidak boleh melebihi limit maksimal.');
      return;
    }

    const parsedDueDay = isSelectedCreditOrPaylater ? (parseInt(dueDayInput) || undefined) : undefined;
    const parsedInterestRate = isSelectedCreditOrPaylater ? (parseFloat(interestRateInput) || undefined) : undefined;
    const parsedMinPayment = isSelectedCreditOrPaylater ? (parseFloat(minPaymentInput) || undefined) : undefined;

    onAddAccountWithNumber(
      name,
      type,
      balanceVal,
      accountNumber.trim() || undefined,
      debtVal,
      parsedDueDay,
      parsedInterestRate,
      parsedMinPayment
    );
    
    // Reset form
    setName('');
    setType('bank');
    setStartingBalance('');
    setAccountNumber('');
    setInitialDebt('');
    setDueDayInput('');
    setInterestRateInput('');
    setMinPaymentInput('');
    showAlert('Akun Ditambahkan', `Akun "${name}" berhasil didaftarkan.`);
  };

  const startEditing = (acc: Account) => {
    setEditingId(acc.id);
    setTempName(acc.name);
    setTempBalance(acc.startingBalance.toString());
  };

  const saveEditing = (id: string) => {
    if (!tempName.trim()) {
      showAlert('Formulir Tidak Valid', 'Nama akun tidak boleh kosong.');
      return;
    }
    const val = parseFloat(tempBalance);
    if (isNaN(val) || val < 0) {
      showAlert('Formulir Tidak Valid', 'Saldo / limit harus bernilai positif.');
      return;
    }
    onUpdateAccountBalance(id, val, tempName.trim());
    setEditingId(null);
    showAlert('Perubahan Disimpan', 'Nama dan saldo/limit akun berhasil diperbarui.');
  };

  const initiatePayment = (card: Account) => {
    setPayingId(card.id);
    setPaymentAmount(getAccountCreditBill(card).toString());
    setPaymentDescription(`Pembayaran Tagihan ${card.name}`);
    
    // Pre-select first available liquid account
    const availableSource = liquidAccounts.find(a => a.currentBalance > 0);
    if (availableSource) {
      setSourceAccountId(availableSource.id);
    } else {
      setSourceAccountId('');
    }
  };

  const handlePayBillSubmit = (e: React.FormEvent, card: Account) => {
    e.preventDefault();
    
    const rawVal = parseFloat(paymentAmount);
    const amountVal = Number.isFinite(rawVal) ? Math.abs(rawVal) : 0;
    if (isNaN(rawVal) || amountVal <= 0) {
      showAlert('Formulir Tidak Valid', 'Jumlah pembayaran harus bernilai positif.');
      return;
    }

    if (!sourceAccountId) {
      showAlert('Formulir Tidak Valid', 'Pilih rekening sumber pembayaran.');
      return;
    }

    const sourceAcc = accounts.find(a => a.id === sourceAccountId);
    if (!sourceAcc) return;

    if (sourceAcc.currentBalance < amountVal) {
      showAlert('Saldo Kurang', `Saldo rekening ${sourceAcc.name} (${formatterIDR.format(sourceAcc.currentBalance)}) tidak mencukupi untuk pembayaran sebesar ${formatterIDR.format(amountVal)}.`);
      return;
    }

    const executeCardPayment = () => {
      if (onAddTransaction) {
        const cardCoa = getAccountCoaMapping(card);
        const srcCoa = getAccountCoaMapping(sourceAcc);
        const ok = onAddTransaction({
          date: new Date().toISOString().split('T')[0],
          accountId: sourceAccountId,
          type: 'expense',
          category: 'Cicilan / Pelunasan Utang',
          description: paymentDescription || `Pembayaran Tagihan ${card.name}`,
          amount: amountVal,
          linkedDebtId: `acc-debt-${card.id}`,
          linkedDebtAction: 'pay',
          coaDebitCode: cardCoa.code,
          coaCreditCode: srcCoa.code,
        });
        if (ok === false) return;
      } else if (onTransferFunds) {
        onTransferFunds(amountVal, sourceAccountId, card.id, paymentDescription);
        showAlert('Pembayaran Berhasil', `Pembayaran tagihan "${card.name}" sebesar ${formatterIDR.format(amountVal)} berhasil dicatat.`);
      }
      setPayingId(null);
      setPaymentAmount('');
      setSourceAccountId('');
    };

    const usedLimitVal = getAccountCreditBill(card);
    if (amountVal > usedLimitVal) {
      if (onAddTransaction) {
        showAlert(
          'Nominal Melebihi Sisa Tagihan',
          `Jumlah pembayaran (${formatterIDR.format(amountVal)}) melebihi total tagihan "${card.name}" (${formatterIDR.format(usedLimitVal)}).`
        );
        return;
      }
      showConfirm(
        'Konfirmasi Pembayaran Lebih',
        `Jumlah pembayaran (${formatterIDR.format(amountVal)}) melebihi total tagihan Anda (${formatterIDR.format(usedLimitVal)}). Lanjutkan pembayaran?`,
        executeCardPayment
      );
      return;
    }

    executeCardPayment();
  };

  return (
    <div className="space-y-6">
      {/* 1. Summary Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Liquid (Aset Lancar) */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-lg shrink-0">
            <Wallet className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total Kas & Bank (Aset Likuid)</p>
            <h3 className="text-lg font-black text-slate-800 mt-1 truncate">{formatterIDR.format(totalLiquidBalance)}</h3>
          </div>
        </div>

        {/* Tagihan Kartu Kredit / PayLater (Liabilitas) */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-4">
          <div className={`p-3 rounded-lg shrink-0 ${totalCreditBill > 0 ? 'bg-rose-50 text-rose-600 animate-pulse' : 'bg-slate-50 text-slate-400'}`}>
            <AlertCircle className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total Tagihan (Kredit & PayLater)</p>
            <h3 className={`text-lg font-black mt-1 truncate ${totalCreditBill > 0 ? 'text-rose-600' : 'text-slate-800'}`}>
              {formatterIDR.format(totalCreditBill)}
            </h3>
          </div>
        </div>

        {/* Total Limit Kredit & PayLater */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg shrink-0">
            <CreditCard className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total Limit Tersedia</p>
            <h3 className="text-lg font-black text-slate-800 mt-1 truncate">{formatterIDR.format(totalCreditLimit)}</h3>
          </div>
        </div>

        {/* Tunai */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg shrink-0">
            <Banknote className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Uang Tunai (Kas Fisik)</p>
            <h3 className="text-lg font-black text-slate-800 mt-1 truncate">{formatterIDR.format(cashBalance)}</h3>
          </div>
        </div>
      </div>

      {/* 2. Main Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left: Accounts Cards List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider flex items-center gap-2">
                <span>Daftar Rekening, Kredit & PayLater</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">Kelola rekening bank, dompet digital, tunai, kartu kredit, serta limit PayLater Anda.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleManualCoaSync}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-extrabold text-xs rounded-xl border border-blue-200 transition cursor-pointer shadow-xs"
                title="Singkronkan manual data Master Akun Rekening dengan Master COA jika terjadi ketidaksesuaian nama/kode"
              >
                <RefreshCw className="h-3.5 w-3.5 text-blue-600" />
                <span>Sinkron Manual COA</span>
              </button>
              <span className="text-xs bg-slate-100 text-slate-600 font-semibold px-2.5 py-1 rounded-full">
                {accounts.length} Akun
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {accounts.map((acc) => {
              // Decide background styling based on type
              let cardBg = 'from-slate-950 to-slate-850 text-white border-slate-800';
              let typeLabel = 'Rekening Bank';
              let badgeColor = 'bg-blue-500/25 text-blue-200';
              let icon = <CreditCard className="h-5 w-5 text-blue-400" />;

              if (acc.type === 'cash') {
                cardBg = 'from-emerald-950 to-slate-900 text-white border-emerald-900/50';
                typeLabel = 'Dompet Tunai';
                badgeColor = 'bg-emerald-500/20 text-emerald-300';
                icon = <Banknote className="h-5 w-5 text-emerald-400" />;
              } else if (acc.type === 'e-wallet') {
                cardBg = 'from-indigo-950 to-slate-900 text-white border-indigo-900/50';
                typeLabel = 'Dompet Digital';
                badgeColor = 'bg-purple-500/20 text-purple-300';
                icon = <Wallet className="h-5 w-5 text-purple-400" />;
              } else if (acc.type === 'credit-card') {
                cardBg = 'from-rose-950 to-slate-950 text-white border-rose-900/40';
                typeLabel = 'Kartu Kredit';
                badgeColor = 'bg-rose-500/25 text-rose-300';
                icon = <CreditCard className="h-5 w-5 text-rose-400 animate-pulse" />;
              } else if (acc.type === 'paylater') {
                cardBg = 'from-violet-950 to-slate-900 text-white border-violet-900/40';
                typeLabel = 'PayLater / SPayLater';
                badgeColor = 'bg-violet-500/25 text-violet-300';
                icon = <CreditCard className="h-5 w-5 text-violet-400 animate-pulse" />;
              }

              const isCreditOrPaylater = isCreditAccount(acc);
              const accountCreditBill = getAccountCreditBill(acc);
              const usedLimitPercent = isCreditOrPaylater && acc.creditLimit ? (accountCreditBill / acc.creditLimit) * 100 : 0;
              const isSelected = selectedAccountId === acc.id;

              return (
                <div 
                  key={acc.id} 
                  onClick={() => setSelectedAccountId(isSelected ? null : acc.id)}
                  className={`bg-gradient-to-br ${cardBg} p-5 rounded-2xl border shadow-md relative flex flex-col justify-between min-h-[12rem] h-auto transition-all hover:scale-[1.02] hover:shadow-lg cursor-pointer ${
                    isSelected ? 'ring-4 ring-blue-500/70 border-blue-500 shadow-blue-500/10' : 'hover:border-white/20'
                  }`}
                >
                  {/* Top Line */}
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-[9px] uppercase font-bold tracking-widest px-2 py-0.5 rounded ${badgeColor}`}>
                          {typeLabel}
                        </span>
                        {(() => {
                          const coaMap = getAccountCoaMapping(acc);
                          return (
                            <span className="text-[9px] font-mono font-black px-2 py-0.5 rounded bg-white/10 text-emerald-300 border border-emerald-500/30 flex items-center gap-1" title={`Terikat pada Master COA: ${coaMap.code} - ${coaMap.name}`}>
                              <CheckCircle2 className="h-2.5 w-2.5 text-emerald-400" />
                              COA {coaMap.code}
                            </span>
                          );
                        })()}
                        {isSelected && (
                          <span className="text-[9px] uppercase font-extrabold tracking-widest px-1.5 py-0.5 rounded bg-blue-600 text-white animate-pulse">
                            Aktif
                          </span>
                        )}
                      </div>
                      {editingId === acc.id ? (
                        <input
                          type="text"
                          value={tempName}
                          onChange={(e) => setTempName(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          className="bg-slate-900 border border-slate-700/60 rounded text-slate-100 px-2 py-1 text-xs font-bold mt-1 focus:outline-none focus:border-blue-500 w-full"
                          placeholder="Nama Akun"
                          required
                        />
                      ) : (
                        <h4 className="font-black text-slate-100 text-base tracking-tight leading-tight mt-1">{acc.name}</h4>
                      )}
                    </div>
                    <div className="p-2 bg-white/10 rounded-lg">
                      {icon}
                    </div>
                  </div>

                  {/* Mid: Account Details / Credit Card usage indicators */}
                  <div className="my-3 space-y-2">
                    {!isCreditOrPaylater ? (
                      <div>
                        {acc.type === 'bank' || acc.accountNumber ? (
                          <p className="font-mono text-xs tracking-wider text-slate-400">
                            {acc.accountNumber || '•••• •••• •••• ••••'}
                          </p>
                        ) : (
                          <p className="text-[10px] text-slate-500 italic">Dompet fisik / non-rekening</p>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <p className="font-mono text-xs tracking-wider text-rose-300">
                          {acc.accountNumber || 'ID AKUN: --'}
                        </p>
                        
                        {/* Custom visual progress bar for used limit */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] font-bold text-slate-400">
                            <span>Batas Pemakaian</span>
                            <span className={usedLimitPercent >= 90 ? 'text-rose-400' : usedLimitPercent >= 75 ? 'text-amber-400' : 'text-slate-300'}>
                              {usedLimitPercent.toFixed(0)}% Terpakai
                            </span>
                          </div>
                          <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                            <div 
                              className={`h-full rounded-full transition-all duration-500 ${
                                usedLimitPercent >= 90 ? 'bg-rose-500' : usedLimitPercent >= 75 ? 'bg-amber-500' : 'bg-emerald-500'
                              }`}
                              style={{ width: `${Math.min(usedLimitPercent, 100)}%` }}
                            />
                          </div>
                        </div>

                        {/* Credit stats list */}
                        <div className="grid grid-cols-3 gap-2 text-[10px] pt-1 font-semibold text-slate-400">
                          <div>
                            <span className="block text-[8px] text-slate-500 uppercase tracking-widest">Sisa Limit</span>
                            <span className="text-slate-200 font-mono text-xs">{formatterIDR.format(acc.currentBalance)}</span>
                          </div>
                          <div className="text-center">
                            <span className="block text-[8px] text-slate-500 uppercase tracking-widest font-bold">Hutang Terpakai</span>
                            <span className="text-rose-300 font-mono text-xs block">{formatterIDR.format(accountCreditBill)}</span>
                          </div>
                          <div className="text-right">
                            <span className="block text-[8px] text-slate-500 uppercase tracking-widest font-bold">Jatuh Tempo</span>
                            <span className="text-amber-300 font-mono text-xs block">{acc.dueDay ? `Tgl ${acc.dueDay}` : '-'}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Inline Repayment Repay Section */}
                  {payingId === acc.id && isCreditOrPaylater && (
                    <form 
                      onSubmit={(e) => handlePayBillSubmit(e, acc)}
                      onClick={(e) => e.stopPropagation()}
                      className="bg-slate-900 border border-rose-950/50 p-3.5 rounded-xl space-y-3 mt-2 text-slate-200 text-xs"
                    >
                      <div className="flex justify-between items-center pb-1.5 border-b border-slate-800">
                        <span className="font-bold text-rose-300 flex items-center gap-1.5">
                          <Sparkles className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                          Proses Pelunasan Tagihan
                        </span>
                        <button 
                          type="button" 
                          onClick={(e) => { e.stopPropagation(); setPayingId(null); }}
                          className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Sumber Pembayaran</label>
                        <select
                          value={sourceAccountId}
                          onChange={(e) => setSourceAccountId(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-full bg-slate-950 border border-slate-850 rounded px-2 py-1 text-xs text-slate-200"
                          required
                        >
                          <option value="">-- Pilih Rekening Sumber --</option>
                          {liquidAccounts.map(la => (
                            <option key={la.id} value={la.id}>
                              {la.name} ({formatterIDR.format(la.currentBalance)})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Jumlah Bayar</label>
                          <FormattedNumberInput
                            value={paymentAmount}
                            onChange={(val) => setPaymentAmount(val)}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full bg-slate-950 border border-slate-850 rounded px-2 py-1 text-xs text-slate-200 font-mono font-bold"
                            placeholder="0"
                            required
                          />
                        </div>
                        <div className="flex items-end justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setPaymentAmount(accountCreditBill.toString()); }}
                            className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded text-[10px] font-semibold h-7"
                          >
                            Lunas
                          </button>
                          <button
                            type="submit"
                            className="bg-rose-600 hover:bg-rose-500 text-white px-3 py-1 rounded text-[10px] font-bold h-7 cursor-pointer flex items-center gap-1"
                          >
                            <Check className="h-3 w-3" /> Bayar
                          </button>
                        </div>
                      </div>

                      {(() => {
                        const payVal = Math.abs(parseFloat(paymentAmount) || 0);
                        const sourceAcc = liquidAccounts.find((la) => la.id === sourceAccountId);
                        if (!sourceAcc || payVal <= 0) return null;
                        const sourceDelta = getTransactionAccountDelta({ type: 'expense', amount: payVal });
                        const projectedSource = applyAccountBalanceChange(sourceAcc, sourceDelta);
                        const projectedCard = applyCreditBillPayment(acc, payVal, 'pay');
                        const currentBill = getAccountCreditBill(acc);
                        const projectedBill = getAccountCreditBill(projectedCard);

                        return (
                          <div className="bg-slate-950/90 border border-slate-800 rounded-lg p-2 space-y-1 text-[10px]">
                            <div className="flex justify-between gap-2">
                              <span className="text-slate-400">Saldo {sourceAcc.name}:</span>
                              <span className={`font-mono tabular-nums font-bold ${projectedSource.currentBalance < 0 ? 'text-rose-400' : 'text-slate-200'}`}>
                                {formatterIDR.format(sourceAcc.currentBalance)} &rarr; {formatterIDR.format(projectedSource.currentBalance)}
                              </span>
                            </div>
                            <div className="flex justify-between gap-2">
                              <span className="text-slate-400">Sisa Tagihan:</span>
                              <span className="font-mono tabular-nums font-bold text-emerald-400">
                                {formatterIDR.format(currentBill)} &rarr; {formatterIDR.format(projectedBill)}
                              </span>
                            </div>
                          </div>
                        );
                      })()}
                    </form>
                  )}

                  {/* Bottom line: Balances & Actions */}
                  {payingId !== acc.id && (
                    <div className="flex justify-between items-end border-t border-slate-850/80 pt-3 mt-2">
                      {!isCreditOrPaylater ? (
                        <div>
                          <p className="text-[8px] text-slate-500 uppercase font-bold tracking-widest">Saldo Saat Ini</p>
                          <p className="font-mono font-bold text-slate-100 text-base leading-tight mt-0.5">
                            {formatterIDR.format(acc.currentBalance)}
                          </p>
                        </div>
                      ) : (
                        <div>
                          <p className="text-[8px] text-slate-500 uppercase font-bold tracking-widest">Total Limit {acc.type === 'paylater' ? 'PayLater' : 'Kartu'}</p>
                          <p className="font-mono font-bold text-rose-300 text-base leading-tight mt-0.5">
                            {formatterIDR.format(acc.creditLimit || 0)}
                          </p>
                        </div>
                      )}

                      <div className="flex items-center gap-1 shrink-0">
                        {isCreditOrPaylater && onTransferFunds && (
                          <button
                            onClick={(e) => { e.stopPropagation(); initiatePayment(acc); }}
                            disabled={accountCreditBill <= 0}
                            className={`text-[10px] font-bold py-1 px-2.5 rounded-lg transition shrink-0 ${
                              accountCreditBill > 0
                                ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-sm'
                                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                            }`}
                            title="Bayar tagihan ini untuk memulihkan limit"
                          >
                            Bayar Tagihan
                          </button>
                        )}

                        {editingId === acc.id ? (
                          <div 
                            className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-lg border border-slate-800"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide px-1 shrink-0">
                              {isCreditOrPaylater ? 'Limit:' : 'Saldo:'}
                            </span>
                            <FormattedNumberInput
                              value={tempBalance}
                              onChange={(val) => setTempBalance(val)}
                              onClick={(e) => e.stopPropagation()}
                              className="bg-slate-950 border border-slate-850 rounded text-slate-100 px-2 py-1 text-xs font-mono w-28 focus:outline-none focus:border-blue-500 font-bold"
                              placeholder="Saldo"
                            />
                            <button
                              onClick={(e) => { e.stopPropagation(); saveEditing(acc.id); }}
                              className="bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold px-2 py-1.5 rounded cursor-pointer transition hover:scale-105 active:scale-95 shrink-0"
                            >
                              Simpan
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setEditingId(null); }}
                              className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold px-2 py-1.5 rounded cursor-pointer transition shrink-0"
                            >
                              Batal
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); startEditing(acc); }}
                            className="text-[10px] bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white font-bold py-1 px-2.5 rounded-lg transition shrink-0"
                            title={isCreditOrPaylater ? "Ubah nama & limit" : "Ubah nama & saldo awal"}
                          >
                            Edit Akun
                          </button>
                        )}

                        {accounts.length > 1 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              showConfirm(
                                'Hapus Master Akun',
                                `Apakah Anda yakin ingin menghapus akun "${acc.name}"? Seluruh riwayat transaksi yang berkaitan dengan akun ini juga akan dihapus permanen.`,
                                () => {
                                  onDeleteAccount(acc.id);
                                }
                              );
                            }}
                            className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-white/5 rounded-lg transition cursor-pointer"
                            title="Hapus Akun"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Selected Account Transactions Panel */}
          {selectedAccount ? (
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4 animate-slide-in mt-6">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider">
                      Histori Jurnal: {selectedAccount.name}
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Menampilkan {filteredTxs.length} transaksi untuk akun ini.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedAccountId(null)}
                  className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition flex items-center gap-1 text-xs font-bold"
                  title="Tutup Jurnal"
                >
                  <X className="h-4 w-4" /> Tutup
                </button>
              </div>

              {/* Quick Mini Stats inside the panel */}
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded-lg border border-slate-100">
                <div className="space-y-0.5">
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Total Pendapatan (Masuk)</span>
                  <span className="font-mono text-xs font-bold text-emerald-600 block">{formatterIDR.format(selectedAccountIncome)}</span>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Total Pengeluaran (Keluar)</span>
                  <span className="font-mono text-xs font-bold text-rose-600 block">{formatterIDR.format(selectedAccountExpense)}</span>
                </div>
              </div>

              {/* Transaction List / Table */}
              <div className="overflow-x-auto max-h-96 overflow-y-auto border border-slate-100 rounded-lg">
                {filteredTxs.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-xs font-semibold">
                    Belum ada transaksi tercatat untuk akun ini.
                  </div>
                ) : (
                  <table className="w-full text-left text-xs text-slate-600">
                    <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold text-[9px] border-b border-slate-100 sticky top-0">
                      <tr>
                        <th className="py-2.5 px-3">Tanggal</th>
                        <th className="py-2.5 px-3">Kategori</th>
                        <th className="py-2.5 px-3">Deskripsi</th>
                        <th className="py-2.5 px-3 text-right">Jumlah</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredTxs.map((tx) => (
                        <tr key={tx.id} className="hover:bg-slate-50/80 transition">
                          <td className="py-2.5 px-3 font-mono text-slate-500 whitespace-nowrap">
                            {tx.date}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className={`inline-block px-1.5 py-0.5 rounded font-bold uppercase text-[8px] ${
                              tx.type === 'income' ? 'bg-emerald-50 text-emerald-600' :
                              tx.type === 'expense' ? 'bg-rose-50 text-rose-600' :
                              tx.type === 'saving' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'
                            }`}>
                              {tx.category}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-800 font-medium max-w-[120px] truncate" title={tx.description}>
                            {tx.description}
                          </td>
                          <td className={`py-2.5 px-3 font-mono font-bold text-right text-xs whitespace-nowrap ${
                            tx.type === 'income' ? 'text-emerald-600' : 'text-rose-600'
                          }`}>
                            {tx.type === 'income' ? '+' : '-'}{formatterIDR.format(tx.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 border border-slate-200 border-dashed p-4 rounded-xl text-center text-xs text-slate-500 font-semibold flex items-center justify-center gap-2 mt-6">
              <Info className="h-4 w-4 text-blue-500" />
              💡 Tips: Klik pada salah satu kartu rekening di atas untuk memfilter & melihat histori transaksinya secara langsung.
            </div>
          )}
        </div>

        {/* Right: Add Account Form */}
        <div>
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <Plus className="h-5 w-5 text-blue-600" />
              <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider">Tambah Akun Baru</h3>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Nama Akun / Rekening</label>
                <input
                  type="text"
                  placeholder={
                    type === 'credit-card' ? 'e.g. Visa Platinum Mandiri, CC BCA' : 
                    type === 'paylater' ? 'e.g. SPayLater, GoPay Later' :
                    'e.g. Bank Mandiri, Dompet Utama'
                  }
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 font-medium placeholder-slate-400"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Tipe Akun</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as AccountType)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 font-medium"
                >
                  <option value="bank">Bank (M-Banking / Kartu Debit)</option>
                  <option value="cash">Uang Tunai (Cash / Dompet Fisik)</option>
                  <option value="e-wallet">E-Wallet (OVO, GoPay, ShopeePay)</option>
                  <option value="credit-card">Kartu Kredit (Limit Pemakaian)</option>
                  <option value="paylater">PayLater (SPayLater, GoPay Later, dll)</option>
                </select>
              </div>

              {(type === 'bank' || type === 'credit-card' || type === 'paylater') && (
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                    {type === 'credit-card' ? 'Nomor Kartu Kredit (Opsional)' : type === 'paylater' ? 'ID Akun / Virtual Account (Opsional)' : 'Nomor Rekening'}
                  </label>
                  <input
                    type="text"
                    placeholder={
                      type === 'credit-card' ? 'e.g. 4512-••••-••••-8812' : 
                      type === 'paylater' ? 'e.g. SPAYLATER-9201' : 
                      'e.g. 1240-0092-2391'
                    }
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 font-mono"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                  {isSelectedCreditOrPaylater ? 'Limit Kredit / PayLater Maksimal' : 'Saldo Awal (Starting Balance)'}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400">Rp</span>
                  <FormattedNumberInput
                    placeholder="0"
                    value={startingBalance}
                    onChange={(val) => setStartingBalance(val)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 font-mono font-semibold"
                    required
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  {isSelectedCreditOrPaylater 
                    ? 'Total limit pemakaian maksimal yang diberikan kepada Anda.' 
                    : 'Saldo ini akan menjadi nominal patokan awal pembukuan Anda.'}
                </p>
              </div>

              {isSelectedCreditOrPaylater && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 flex items-center gap-1 text-slate-700 font-black">
                      <AlertCircle className="h-3 w-3 text-amber-500" />
                      Saldo Awal Hutang (Pemakaian Berjalan)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400">Rp</span>
                      <FormattedNumberInput
                        placeholder="0"
                        value={initialDebt}
                        onChange={(val) => setInitialDebt(val)}
                        className="w-full bg-amber-50/50 border border-amber-200 rounded-lg pl-9 pr-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400 text-slate-700 font-mono font-semibold"
                      />
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">
                      Masukkan jumlah hutang pemakaian berjalan Anda saat ini jika Anda sudah memakai limit ini sebelum pencatatan dimulai.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 flex items-center gap-1 text-slate-700 font-black">
                      <AlertCircle className="h-3 w-3 text-blue-500" />
                      Tanggal Jatuh Tempo Bulanan (1-31)
                    </label>
                    <input
                      type="number"
                      placeholder="e.g. 15"
                      value={dueDayInput}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        if (!isNaN(val) && val >= 1 && val <= 31) {
                          setDueDayInput(e.target.value);
                        } else if (e.target.value === '') {
                          setDueDayInput('');
                        }
                      }}
                      min="1"
                      max="31"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 font-mono font-semibold"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
                      Tanggal jatuh tempo tagihan kartu kredit atau PayLater bulanan Anda.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 flex items-center gap-1 text-slate-700 font-black">
                        <Percent className="h-3 w-3 text-indigo-500" />
                        Bunga Setahun (APR %)
                      </label>
                      <input
                        type="number"
                        placeholder="e.g. 21"
                        step="0.1"
                        value={interestRateInput}
                        onChange={(e) => setInterestRateInput(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 font-semibold"
                      />
                      <p className="text-[9px] text-slate-400 mt-0.5">Suku bunga tahunan (default: CC 21%, PayLater 24%).</p>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 flex items-center gap-1 text-slate-700 font-black">
                        <DollarSign className="h-3 w-3 text-emerald-500" />
                        Cicilan Min Bulanan (Rp)
                      </label>
                      <FormattedNumberInput
                        placeholder="e.g. 100.000"
                        value={minPaymentInput}
                        onChange={(val) => setMinPaymentInput(val)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 font-mono font-semibold"
                      />
                      <p className="text-[9px] text-slate-400 mt-0.5">Pembayaran minimum bulanan wajib (default: 10% tagihan).</p>
                    </div>
                  </div>
                </>
              )}

              <button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg text-xs transition cursor-pointer flex items-center justify-center gap-2 shadow-sm animate-fade-in"
              >
                <Plus className="h-4 w-4" /> Simpan Akun Baru
              </button>
            </form>

            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 flex items-start gap-2.5">
              <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
              <p className="text-[10px] text-slate-500 leading-normal">
                Akun yang ditambahkan akan otomatis terdaftar sebagai opsi pengirim/penerima dana saat Anda mencatat transaksi baru atau mutasi dana.
              </p>
            </div>
          </div>
        </div>

      </div>

      {/* 3. Safety Check Alert banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
        <ShieldCheck className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
        <div>
          <h4 className="text-xs font-bold text-blue-800">Keamanan Data Terjamin</h4>
          <p className="text-[10px] text-blue-600 mt-1 leading-relaxed">
            Seluruh nomor rekening, nomor kartu kredit, detail PayLater, dan data saldo awal disimpan secara aman di penyimpanan lokal peramban Anda. Tidak ada data yang dikirimkan ke server luar demi menjaga privasi penuh Anda.
          </p>
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

      {/* Manual COA Sync Report Modal */}
      {syncReportModal && syncReportModal.isOpen && syncReportModal.report && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 animate-fadeIn">
          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs transition-opacity" onClick={() => setSyncReportModal({ isOpen: false, report: null })} />
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden relative z-10 p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2 text-emerald-600">
                <CheckCircle2 className="h-6 w-6" />
                <h3 className="font-extrabold text-slate-800 text-sm uppercase tracking-wider">
                  Hasil Sinkronisasi Manual Akun & COA
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSyncReportModal({ isOpen: false, report: null })}
                className="text-slate-400 hover:text-slate-600 font-bold text-xs p-1 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed font-medium">
              {syncReportModal.report.summaryMessage}
            </p>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2 max-h-60 overflow-y-auto">
              <div className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider flex justify-between border-b border-slate-200 pb-1.5">
                <span>Akun Rekening</span>
                <span>Terkoneksi Master COA</span>
              </div>
              {syncReportModal.report.items.map((item) => (
                <div key={item.accountId} className="flex items-center justify-between text-xs py-1 border-b border-slate-100 last:border-none">
                  <div>
                    <p className="font-bold text-slate-800">{item.accountName}</p>
                    <p className="text-[10px] text-slate-400 font-mono uppercase">{item.type}</p>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-black text-blue-700 bg-blue-50 px-2 py-0.5 rounded text-[11px]">
                      COA {item.coaCode}
                    </span>
                    <p className="text-[10px] font-semibold text-slate-500 mt-0.5">{item.coaName}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSyncReportModal({ isOpen: false, report: null })}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-extrabold transition shadow-xs cursor-pointer"
              >
                Tutup & Simpan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
