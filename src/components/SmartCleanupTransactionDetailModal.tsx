import React, { useEffect, useMemo } from 'react';
import {
  X,
  CreditCard,
  Wallet,
  Building2,
  Smartphone,
  Clock,
  ArrowRight,
  Receipt,
  Tag,
} from 'lucide-react';
import { Account, AccountType, Transaction } from '../types';
import { getMasterChangeLogs } from '../coaUtils';
import { TriggerTransactionItem } from '../utils/anomalyDetection';
import { formatterIDR } from '../utils/formatters';

interface SmartCleanupTransactionDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: TriggerTransactionItem | null;
  anomalyCategory: string;
  recommendedTarget: string;
  selectedTargetCategory: string;
  account?: Account;
  isSelectedForCleanup: boolean;
  onToggleSelectForCleanup: () => void;
  onMoveSingleTransaction?: (txId: string, targetCategory: string) => void;
}

const PAYMENT_METHOD_LABEL: Record<AccountType, string> = {
  cash: 'Tunai (Kas)',
  bank: 'Transfer / Rekening Bank',
  'e-wallet': 'Dompet Digital (e-Wallet)',
  'credit-card': 'Kartu Kredit',
  paylater: 'PayLater / Cicilan',
};

function renderAccountTypeIcon(type?: AccountType) {
  switch (type) {
    case 'cash':
      return <Wallet className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />;
    case 'bank':
      return <Building2 className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />;
    case 'e-wallet':
      return <Smartphone className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0" />;
    case 'credit-card':
    case 'paylater':
      return <CreditCard className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />;
    default:
      return <Wallet className="h-4 w-4 text-slate-500 shrink-0" />;
  }
}

function formatHistoryTimestamp(iso: string): string {
  try {
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return iso;
    return dt.toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export const SmartCleanupTransactionDetailModal: React.FC<
  SmartCleanupTransactionDetailModalProps
> = ({
  isOpen,
  onClose,
  item,
  anomalyCategory,
  recommendedTarget,
  selectedTargetCategory,
  account,
  isSelectedForCleanup,
  onToggleSelectForCleanup,
  onMoveSingleTransaction,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const tx: Transaction | null = item?.tx ?? null;

  const relatedMasterLogs = useMemo(() => {
    if (!tx) return [];
    const currentCatLower = String(tx.category || anomalyCategory).trim().toLowerCase();
    const allLogs = getMasterChangeLogs();
    return allLogs
      .filter((log) => {
        const targetLower = String(log.targetName || '').trim().toLowerCase();
        const detailsLower = String(log.details || '').trim().toLowerCase();
        return (
          targetLower === currentCatLower ||
          (currentCatLower.length >= 3 && detailsLower.includes(currentCatLower))
        );
      })
      .slice(0, 4);
  }, [tx, anomalyCategory]);

  if (!isOpen || !item || !tx) return null;

  const paymentMethodText = account
    ? PAYMENT_METHOD_LABEL[account.type] || account.type
    : 'Metode Tidak Tercatat';
  const accountDisplayName = account?.name || item.accountName || 'Akun Tidak Ditemukan';
  const categoryHistoryList = [...(tx.categoryHistory || [])].reverse();
  const effectiveTarget = selectedTargetCategory || recommendedTarget;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-fadeIn"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="smart-cleanup-tx-detail-title"
    >
      <div
        className="w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 p-5 sm:p-6 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-start gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-blue-600 text-white shrink-0">
              <Receipt className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3
                id="smart-cleanup-tx-detail-title"
                className="text-base font-extrabold text-slate-900 dark:text-slate-100 truncate"
              >
                {tx.description?.trim() || anomalyCategory}
              </h3>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-1">
                <span className="font-mono tabular-nums">{item.normalizedDate}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums font-extrabold text-slate-900 dark:text-slate-100">
                  {formatterIDR.format(item.absAmount)}
                </span>
                <span aria-hidden="true">·</span>
                <span>Kategori saat ini: {tx.category || anomalyCategory}</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup modal detail transaksi"
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 sm:p-6 space-y-5 text-xs">
          {/* Account & Payment Method Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 space-y-1.5">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block">
                Nama Akun Asal
              </span>
              <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100 text-sm">
                {renderAccountTypeIcon(account?.type)}
                <span className="truncate">{accountDisplayName}</span>
              </div>
              {(account?.accountNumber || account?.coaCode || tx.coaCreditCode) && (
                <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  {account?.accountNumber ? `No. ${account.accountNumber}` : ''}
                  {account?.accountNumber && (account?.coaCode || tx.coaCreditCode)
                    ? ' · '
                    : ''}
                  {account?.coaCode || tx.coaCreditCode
                    ? `COA ${account?.coaCode || tx.coaCreditCode}`
                    : ''}
                </div>
              )}
            </div>

            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 space-y-1.5">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block">
                Metode Pembayaran
              </span>
              <div className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                {paymentMethodText}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {tx.isAdjustment
                  ? 'Entri Penyesuaian Akuntansi'
                  : tx.linkedDebtId
                  ? 'Terkait Cicilan Utang'
                  : 'Pengeluaran Operasional Langsung'}
              </div>
            </div>
          </div>

          {/* Previous Category History Section */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-1.5 text-xs">
                <Clock className="h-3.5 w-3.5 text-slate-500" />
                <span>Riwayat Kategori Sebelumnya</span>
              </h4>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                {categoryHistoryList.length > 0
                  ? `${categoryHistoryList.length} perubahan tercatat`
                  : 'Kategori awal'}
              </span>
            </div>

            {categoryHistoryList.length > 0 ? (
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800/80">
                {categoryHistoryList.map((entry, idx) => (
                  <div
                    key={`${entry.changedAt}-${idx}`}
                    className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div className="flex flex-wrap items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-100">
                      <span className="text-slate-500 dark:text-slate-400 line-through">
                        {entry.fromCategory}
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span className="text-blue-700 dark:text-blue-300">
                        {entry.toCategory}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums shrink-0">
                      {entry.source && <span>{entry.source}</span>}
                      {entry.source && <span aria-hidden="true">·</span>}
                      <span>{formatHistoryTimestamp(entry.changedAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-3.5 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/20 text-slate-600 dark:text-slate-300 space-y-1">
                <p className="font-medium">
                  Transaksi ini belum pernah dipindahkan dan masih menggunakan kategori awal{' '}
                  <strong className="text-slate-900 dark:text-slate-100">
                    {tx.category || anomalyCategory}
                  </strong>
                  .
                </p>
                {relatedMasterLogs.length > 0 && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Catatan Master Kategori terkait:{' '}
                    {relatedMasterLogs[0].details}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Cleanup Selection & Single-Transaction Action */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <label className="inline-flex items-center gap-2 cursor-pointer font-semibold text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                checked={isSelectedForCleanup}
                onChange={onToggleSelectForCleanup}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <span>Sertakan dalam antrean Smart Cleanup</span>
            </label>

            <div className="flex items-center gap-2 shrink-0">
              {onMoveSingleTransaction && effectiveTarget && (
                <button
                  type="button"
                  onClick={() => {
                    onMoveSingleTransaction(tx.id, effectiveTarget);
                    onClose();
                  }}
                  className="px-3.5 py-2 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white transition cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5"
                >
                  <Tag className="h-3.5 w-3.5" />
                  <span>Pindahkan ke {effectiveTarget}</span>
                </button>
              )}

              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer whitespace-nowrap shrink-0"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
