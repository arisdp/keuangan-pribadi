import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_COA_LIST } from '../coaUtils';
import { Account, Transaction } from '../types';
import {
  calculateAccountGLBalance,
  calculateCashFlowStatement,
  calculateIncomeStatementSummary,
  getTransactionAccountDelta,
} from './accountingEngine';
import {
  areJournalLinesBalanced,
  buildJournalLedger,
  buildTransactionJournal,
  calculateCoaLedgerBalances,
} from './accountingLedger';

const bank: Account = {
  id: 'bank-1',
  name: 'Bank',
  type: 'bank',
  startingBalance: 0,
  currentBalance: 0,
  coaCode: '1200',
};

const transaction = (overrides: Partial<Transaction>): Transaction => ({
  id: 'tx-1',
  date: '2025-01-01',
  accountId: bank.id,
  type: 'expense',
  category: 'Belanja',
  description: 'Test',
  amount: 100,
  ...overrides,
});

test('posts ordinary income and expenses as balanced two-line journal entries', () => {
  const expense = buildTransactionJournal(transaction({}), [bank]);
  assert.equal(expense.entries.length, 1);
  assert.equal(expense.lines.length, 2);
  assert.deepEqual(expense.lines.map((line) => [line.coaCode, line.debit, line.credit]), [
    ['5900', 100, 0],
    ['1200', 0, 100],
  ]);
  assert.equal(areJournalLinesBalanced(expense.lines), true);

  const income = buildTransactionJournal(transaction({ type: 'income' }), [bank]);
  assert.deepEqual(income.lines.map((line) => [line.coaCode, line.debit, line.credit]), [
    ['1200', 100, 0],
    ['4400', 0, 100],
  ]);
});

test('posts a loan disbursement to cash or directly to the selected asset or expense account', () => {
  const cashLoan = buildTransactionJournal(transaction({
    linkedDebtAction: 'create',
    category: 'Pinjaman Baru',
    debtDisbursementMode: 'cash',
  }), [bank]);
  assert.deepEqual(cashLoan.lines.map((line) => line.coaCode), ['1200', '2300']);
  assert.equal(getTransactionAccountDelta(transaction({
    type: 'income',
    linkedDebtAction: 'create',
    debtDisbursementMode: 'cash',
  })), 100);

  const directAssetLoan = buildTransactionJournal(transaction({
    linkedDebtAction: 'create',
    category: 'Pinjaman Baru',
    debtDisbursementMode: 'direct_asset',
    debtDisbursementCoaCode: '1610',
  }), [bank]);
  assert.deepEqual(directAssetLoan.lines.map((line) => line.coaCode), ['1610', '2300']);

  const directExpenseLoan = buildTransactionJournal(transaction({
    linkedDebtAction: 'create',
    category: 'Pinjaman Baru',
    debtDisbursementMode: 'direct_expense',
    debtDisbursementCoaCode: '5900',
  }), [bank]);
  assert.deepEqual(directExpenseLoan.lines.map((line) => line.coaCode), ['5900', '2300']);
  assert.equal(getTransactionAccountDelta(transaction({
    linkedDebtAction: 'create',
    debtDisbursementMode: 'direct_expense',
  })), 0);

  const directExpense = transaction({
    linkedDebtAction: 'create',
    category: 'Pinjaman Baru',
    debtDisbursementMode: 'direct_expense',
  });
  assert.equal(calculateIncomeStatementSummary([directExpense]).operatingExpense, 100);
  assert.equal(calculateCashFlowStatement([directExpense], [bank]).netCashChange, 0);

  const directAsset = transaction({
    linkedDebtAction: 'create',
    category: 'Pinjaman Baru',
    debtDisbursementMode: 'direct_asset',
    debtDisbursementCoaCode: '1610',
  });
  assert.equal(calculateIncomeStatementSummary([directAsset]).debtProceedsIn, 0);
  assert.equal(calculateCashFlowStatement([directAsset], [bank]).netCashChange, 0);
});

test('posts opening credit-card debt separately from its available limit', () => {
  const creditAccount: Account = {
    id: 'card-1',
    name: 'Card',
    type: 'credit-card',
    startingBalance: 50000,
    currentBalance: 35000,
    initialDebt: 15000,
    usedLimit: 15000,
    openingDate: '2025-01-01',
    openingBalanceEntryId: 'opening-card-1',
    coaCode: '2100',
  };
  const ledger = buildJournalLedger([], [creditAccount]);
  assert.equal(ledger.entries[0].date, '2025-01-01');
  assert.deepEqual(ledger.lines.map((line) => [line.coaCode, line.debit, line.credit]), [
    ['3100', 15000, 0],
    ['2100', 0, 15000],
  ]);
});

test('requires confirmed evidence before posting a reconciliation adjustment', () => {
  const pending = buildTransactionJournal(transaction({
    isAdjustment: true,
    adjustmentType: 'reconciliation',
    coaDebitCode: '1200',
    coaCreditCode: '4400',
  }), [bank]);
  assert.deepEqual(pending, { entries: [], lines: [] });

  const unconfirmed = buildTransactionJournal(transaction({
    isAdjustment: true,
    adjustmentType: 'reconciliation',
    reconciliationEvidenceReference: 'Reviewed statement',
    coaDebitCode: '1200',
    coaCreditCode: '4400',
  }), [bank]);
  assert.deepEqual(unconfirmed, { entries: [], lines: [] });

  const confirmed = buildTransactionJournal(transaction({
    isAdjustment: true,
    adjustmentType: 'reconciliation',
    reconciliationEvidenceReference: 'Reviewed statement',
    reconciliationEvidenceConfirmedAt: '2025-01-02T00:00:00.000Z',
    reconciliationActualBalance: 125,
    coaDebitCode: '1200',
    coaCreditCode: '4400',
  }), [bank]);
  assert.equal(confirmed.entries[0].evidenceReference, 'Reviewed statement');
  assert.equal(confirmed.entries[0].evidenceConfirmedAt, '2025-01-02T00:00:00.000Z');
  assert.equal(confirmed.entries[0].reconciliationActualBalance, 125);
  assert.equal(areJournalLinesBalanced(confirmed.lines), true);

  const reconciliationTransaction = transaction({
    type: 'income',
    isAdjustment: true,
    adjustmentType: 'reconciliation',
    reconciliationEvidenceReference: 'Reviewed statement',
    reconciliationEvidenceConfirmedAt: '2025-01-02T00:00:00.000Z',
  });
  const accountGl = calculateAccountGLBalance(bank, [reconciliationTransaction]);
  assert.equal(accountGl.glCalculatedBalance, 100);
  assert.equal(accountGl.recordedBalance, 0);
  assert.equal(getTransactionAccountDelta(reconciliationTransaction), 0);
  assert.equal(calculateIncomeStatementSummary([reconciliationTransaction]).operatingIncome, 100);
  assert.equal(calculateCashFlowStatement([reconciliationTransaction], [bank]).netCashChange, 0);
});

test('calculates balances using each COA normal balance and checks total debit against credit', () => {
  const lines = [
    { id: '1', journalEntryId: 'e1', lineNumber: 1 as const, coaCode: '1200', debit: 250, credit: 0 },
    { id: '2', journalEntryId: 'e1', lineNumber: 2 as const, coaCode: '2300', debit: 0, credit: 250 },
  ];
  const balances = calculateCoaLedgerBalances(lines, DEFAULT_COA_LIST);
  assert.equal(balances.find((balance) => balance.coaCode === '1200')?.balance, 250);
  assert.equal(balances.find((balance) => balance.coaCode === '2300')?.balance, 250);
  assert.equal(areJournalLinesBalanced(lines), true);
});
