ALTER TABLE accounts ADD COLUMN IF NOT EXISTS opening_date text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS opening_balance_entry_id text;

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS linked_account_id text;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS debt_disbursement_mode text;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS debt_disbursement_coa_code text;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS reconciliation_evidence_reference text;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS reconciliation_evidence_confirmed_at text;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS reconciliation_actual_balance numeric(15, 2);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS reconciliation_recorded_balance numeric(15, 2);

CREATE TABLE IF NOT EXISTS journal_entries (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  transaction_id text,
  date text NOT NULL,
  description text NOT NULL,
  source_type text NOT NULL,
  evidence_reference text,
  evidence_confirmed_at text,
  reconciliation_actual_balance numeric(15, 2)
);
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS reconciliation_actual_balance numeric(15, 2);

CREATE INDEX IF NOT EXISTS journal_entries_user_date_idx
  ON journal_entries(user_id, date);
CREATE INDEX IF NOT EXISTS journal_entries_transaction_idx
  ON journal_entries(user_id, transaction_id);

CREATE TABLE IF NOT EXISTS journal_lines (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  journal_entry_id text NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  line_number integer NOT NULL,
  coa_code text NOT NULL,
  debit numeric(15, 2) NOT NULL DEFAULT 0,
  credit numeric(15, 2) NOT NULL DEFAULT 0,
  CONSTRAINT journal_lines_one_side_only CHECK (
    debit >= 0 AND credit >= 0 AND ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0) OR (debit = 0 AND credit = 0))
  ),
  CONSTRAINT journal_lines_entry_line_unique UNIQUE (journal_entry_id, line_number)
);

CREATE INDEX IF NOT EXISTS journal_lines_user_coa_idx
  ON journal_lines(user_id, coa_code);
