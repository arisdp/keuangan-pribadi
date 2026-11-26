import { getAccountCoaMapping, AccountCOA, DEFAULT_COA_LIST } from '../coaUtils';
import { Account, JournalEntry, JournalLine, Transaction } from '../types';
import { resolveTransactionCoaCodes } from './kprPresets';
import { isCreditAccount, normalizeAbsAmount } from './accountingEngine';

export interface JournalLedger {
  entries: JournalEntry[];
  lines: JournalLine[];
}

export interface CoaLedgerBalance {
  coaCode: string;
  debitTotal: number;
  creditTotal: number;
  balance: number;
}

const LIABILITY_CODE = '2300';
const OPENING_EQUITY_CODE = '3100';

const getAmount = (value: unknown): number => {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.abs(amount) : 0;
};

const getAccountCode = (accountId: string | undefined, accounts: Account[], coaList: AccountCOA[]): string => {
  const account = accounts.find((item) => item.id === accountId);
  return account ? getAccountCoaMapping(account, coaList).code : '1200';
};

const makeEntry = (
  id: string,
  date: string,
  description: string,
  debitCode: string,
  creditCode: string,
  amount: number,
  sourceType: JournalEntry['sourceType'],
  transactionId?: string,
  evidenceReference?: string,
  evidenceConfirmedAt?: string,
  reconciliationActualBalance?: number
): JournalLedger => ({
  entries: [{
    id,
    date,
    description,
    transactionId,
    sourceType,
    evidenceReference,
    evidenceConfirmedAt,
    reconciliationActualBalance,
  }],
  lines: [
    { id: `${id}-debit`, journalEntryId: id, lineNumber: 1, coaCode: debitCode, debit: amount, credit: 0, transactionId },
    { id: `${id}-credit`, journalEntryId: id, lineNumber: 2, coaCode: creditCode, debit: 0, credit: amount, transactionId },
  ],
});

const combineLedgers = (ledgers: JournalLedger[]): JournalLedger => ({
  entries: ledgers.flatMap((ledger) => ledger.entries),
  lines: ledgers.flatMap((ledger) => ledger.lines),
});

export function buildTransactionJournal(
  transaction: Transaction,
  accounts: Account[],
  coaList: AccountCOA[] = DEFAULT_COA_LIST
): JournalLedger {
  const amount = getAmount(transaction.amount);
  const sourceCode = getAccountCode(transaction.accountId, accounts, coaList);
  const transactionId = transaction.id;
  const date = transaction.date;
  const description = transaction.description || transaction.category;
  if (
    transaction.adjustmentType === 'reconciliation' &&
    (!transaction.reconciliationEvidenceReference?.trim() || !transaction.reconciliationEvidenceConfirmedAt?.trim())
  ) {
    return { entries: [], lines: [] };
  }

  if (transaction.linkedDebtAction === 'create') {
    const liabilityCode = /kpr|properti/i.test(transaction.category) ? '2310' : LIABILITY_CODE;
    const isCashDisbursement = transaction.debtDisbursementMode !== 'direct_asset' &&
      transaction.debtDisbursementMode !== 'direct_expense';
    const debitCode = isCashDisbursement
      ? sourceCode
      : transaction.debtDisbursementCoaCode || (transaction.debtDisbursementMode === 'direct_asset' ? '1610' : '5900');
    return makeEntry(
      `journal-${transactionId}`,
      date,
      description,
      debitCode,
      liabilityCode,
      amount,
      'transaction',
      transactionId
    );
  }

  if (transaction.linkedDebtAction === 'pay' && transaction.linkedDebtId?.startsWith('acc-debt-')) {
    const liabilityAccountId = transaction.linkedDebtId.slice('acc-debt-'.length);
    const liabilityCode = getAccountCode(liabilityAccountId, accounts, coaList);
    return makeEntry(
      `journal-${transactionId}`,
      date,
      description,
      liabilityCode,
      sourceCode,
      amount,
      'transaction',
      transactionId
    );
  }

  if (transaction.linkedDebtAction === 'pay' && transaction.linkedKprBreakdown) {
    const principal = Math.min(amount, getAmount(transaction.linkedKprBreakdown.principalPart));
    const interest = Math.min(amount - principal, getAmount(transaction.linkedKprBreakdown.interestPart));
    const entries: JournalLedger[] = [];
    if (principal > 0) {
      entries.push(makeEntry(
        `journal-${transactionId}-principal`,
        date,
        `${description} — pokok`,
        transaction.linkedKprBreakdown.principalCoaCode || transaction.coaDebitCode || LIABILITY_CODE,
        sourceCode,
        principal,
        'transaction',
        transactionId
      ));
    }
    if (interest > 0) {
      entries.push(makeEntry(
        `journal-${transactionId}-interest`,
        date,
        `${description} — bunga`,
        transaction.linkedKprBreakdown.interestCoaCode || '5810',
        sourceCode,
        interest,
        'transaction',
        transactionId
      ));
    }
    if (entries.length > 0) return combineLedgers(entries);
  }

  if (transaction.linkedAccountId) {
    const linkedCode = getAccountCode(transaction.linkedAccountId, accounts, coaList);
    const isTransferOut = transaction.category.toLowerCase() === 'mutasi keluar';
    return makeEntry(
      `journal-${transactionId}`,
      date,
      description,
      isTransferOut ? linkedCode : sourceCode,
      isTransferOut ? sourceCode : linkedCode,
      amount,
      'transaction',
      transactionId
    );
  }

  let debitCode: string;
  let creditCode: string;
  if (transaction.linkedFixedAssetAction === 'buy') {
    debitCode = transaction.coaDebitCode || '1610';
    creditCode = sourceCode;
  } else if (transaction.linkedInvestmentAction === 'buy' || transaction.type === 'investment') {
    debitCode = transaction.coaDebitCode || '1500';
    creditCode = sourceCode;
  } else if (transaction.linkedInvestmentAction === 'sell') {
    debitCode = sourceCode;
    creditCode = transaction.coaCreditCode || '1500';
  } else if (transaction.category === 'Tabungan Darurat') {
    debitCode = '1400';
    creditCode = sourceCode;
  } else if (transaction.category === 'Pencairan Dana Darurat') {
    debitCode = sourceCode;
    creditCode = '1400';
  } else if (transaction.coaDebitCode && transaction.coaCreditCode) {
    debitCode = transaction.coaDebitCode;
    creditCode = transaction.coaCreditCode;
  } else {
    const resolved = resolveTransactionCoaCodes(transaction, accounts, coaList);
    debitCode = resolved.debitCode;
    creditCode = resolved.creditCode;
  }

  return makeEntry(
    `journal-${transactionId}`,
    date,
    description,
    debitCode,
    creditCode,
    amount,
    transaction.isAdjustment ? 'adjustment' : 'transaction',
    transactionId,
    transaction.reconciliationEvidenceReference,
    transaction.reconciliationEvidenceConfirmedAt,
    transaction.reconciliationActualBalance
  );
}

export function buildJournalLedger(
  transactions: Transaction[],
  accounts: Account[],
  coaList: AccountCOA[] = DEFAULT_COA_LIST
): JournalLedger {
  const transactionLedgers = (transactions || []).map((transaction) =>
    buildTransactionJournal(transaction, accounts, coaList)
  );
  const openingLedgers = (accounts || []).flatMap((account) => {
    const creditAccount = isCreditAccount(account);
    const openingAmount = creditAccount
      ? getAmount(account.initialDebt)
      : getAmount(account.startingBalance);
    if (openingAmount === 0) return [];
    const accountCode = getAccountCode(account.id, accounts, coaList);
    const id = account.openingBalanceEntryId || `opening-${account.id}`;
    const ledger = creditAccount
      ? makeEntry(id, account.openingDate || '', `Saldo awal kewajiban — ${account.name}`, OPENING_EQUITY_CODE, accountCode, openingAmount, 'opening_balance')
      : makeEntry(id, account.openingDate || '', `Saldo awal — ${account.name}`, accountCode, OPENING_EQUITY_CODE, openingAmount, 'opening_balance');
    return [ledger];
  });
  return combineLedgers([...openingLedgers, ...transactionLedgers]);
}

export function calculateCoaLedgerBalances(lines: JournalLine[], coaList: AccountCOA[] = DEFAULT_COA_LIST): CoaLedgerBalance[] {
  const totals = new Map<string, { debitTotal: number; creditTotal: number }>();
  (lines || []).forEach((line) => {
    const total = totals.get(line.coaCode) || { debitTotal: 0, creditTotal: 0 };
    total.debitTotal += getAmount(line.debit);
    total.creditTotal += getAmount(line.credit);
    totals.set(line.coaCode, total);
  });
  return Array.from(totals, ([coaCode, total]) => {
    const coa = coaList.find((item) => item.code === coaCode);
    const balance = coa?.normalBalance === 'Kredit'
      ? total.creditTotal - total.debitTotal
      : total.debitTotal - total.creditTotal;
    return { coaCode, ...total, balance };
  });
}

export function areJournalLinesBalanced(lines: JournalLine[], tolerance = 0.005): boolean {
  const debit = (lines || []).reduce((sum, line) => sum + getAmount(line.debit), 0);
  const credit = (lines || []).reduce((sum, line) => sum + getAmount(line.credit), 0);
  return Math.abs(debit - credit) <= tolerance;
}

export function reconcileCreditAccountBalances(account: Account, lines: JournalLine[]): {
  startingBalance: number;
  initialDebt: number;
  usedLimit: number;
  ledgerLiability: number;
} {
  const accountCode = account.coaCode || getAccountCoaMapping(account).code;
  const ledgerLiability = calculateCoaLedgerBalances(lines).find((balance) => balance.coaCode === accountCode)?.balance || 0;
  return {
    startingBalance: normalizeAbsAmount(account.startingBalance),
    initialDebt: normalizeAbsAmount(account.initialDebt),
    usedLimit: normalizeAbsAmount(account.usedLimit),
    ledgerLiability,
  };
}
