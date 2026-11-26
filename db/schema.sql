-- Schema PostgreSQL untuk Aplikasi Keuangan Nusantara Wealth
-- Definisi Tabel Users dan Tabel Relasi Keuangan Dasar

-- 1. Tabel Users
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(255) PRIMARY KEY,
    username VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    full_name VARCHAR(255) NOT NULL,
    is_premium BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tabel Rekening / Akun Keuangan (Accounts)
CREATE TABLE IF NOT EXISTS accounts (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    starting_balance DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    current_balance DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    account_number VARCHAR(100),
    credit_limit DECIMAL(15, 2),
    used_limit DECIMAL(15, 2),
    initial_debt DECIMAL(15, 2),
    opening_date VARCHAR(50),
    opening_balance_entry_id VARCHAR(255),
    due_day INT,
    interest_rate DECIMAL(5, 2),
    min_payment DECIMAL(15, 2)
);

-- 3. Tabel Jurnal Transaksi (Transactions)
CREATE TABLE IF NOT EXISTS transactions (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date VARCHAR(50) NOT NULL,
    account_id VARCHAR(255) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- 'income', 'expense', 'saving', 'investment'
    category VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    linked_debt_id VARCHAR(255),
    linked_debt_action VARCHAR(50),
    linked_investment_id VARCHAR(255),
    linked_investment_action VARCHAR(50),
    linked_account_id VARCHAR(255),
    debt_disbursement_mode VARCHAR(50),
    debt_disbursement_coa_code VARCHAR(50),
    reconciliation_evidence_reference TEXT,
    reconciliation_evidence_confirmed_at VARCHAR(50),
    reconciliation_actual_balance DECIMAL(15, 2),
    reconciliation_recorded_balance DECIMAL(15, 2)
);

-- 3a. Double-entry journal entries and debit/credit lines
CREATE TABLE IF NOT EXISTS journal_entries (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    transaction_id VARCHAR(255),
    date VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    source_type VARCHAR(50) NOT NULL,
    evidence_reference TEXT,
    evidence_confirmed_at VARCHAR(50),
    reconciliation_actual_balance DECIMAL(15, 2)
);

CREATE TABLE IF NOT EXISTS journal_lines (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    journal_entry_id VARCHAR(255) NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
    line_number INT NOT NULL,
    coa_code VARCHAR(50) NOT NULL,
    debit DECIMAL(15, 2) NOT NULL DEFAULT 0,
    credit DECIMAL(15, 2) NOT NULL DEFAULT 0,
    CONSTRAINT journal_lines_one_side_only CHECK (
        debit >= 0 AND credit >= 0 AND ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0) OR (debit = 0 AND credit = 0))
    ),
    CONSTRAINT journal_lines_entry_line_unique UNIQUE (journal_entry_id, line_number)
);

-- 4. Tabel Transaksi Berulang / Terjadwal (Recurring Transactions)
CREATE TABLE IF NOT EXISTS recurring_transactions (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    category VARCHAR(100) NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    account_id VARCHAR(255) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    frequency VARCHAR(50) NOT NULL,
    day_of_month INT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    description TEXT,
    last_processed_date VARCHAR(50)
);

-- 5. Tabel Investasi (Investments)
CREATE TABLE IF NOT EXISTS investments (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    balance DECIMAL(15, 2) NOT NULL,
    date_added VARCHAR(50) NOT NULL,
    initial_capital DECIMAL(15, 2),
    quantity DECIMAL(15, 4),
    unit_price DECIMAL(15, 2),
    units DECIMAL(15, 4),
    unit_name VARCHAR(50),
    purchase_unit_price DECIMAL(15, 2),
    current_unit_price DECIMAL(15, 2),
    dividends_or_interest DECIMAL(15, 2)
);

-- 6. Tabel Riwayat Harga Investasi (Investment Price History)
CREATE TABLE IF NOT EXISTS investment_price_history (
    id VARCHAR(255) PRIMARY KEY,
    asset_id VARCHAR(255) NOT NULL REFERENCES investments(id) ON DELETE CASCADE,
    asset_name VARCHAR(255) NOT NULL,
    date VARCHAR(50) NOT NULL,
    unit_price DECIMAL(15, 2) NOT NULL,
    previous_unit_price DECIMAL(15, 2),
    change_percentage DECIMAL(8, 4),
    note TEXT
);

-- 7. Tabel Anggaran Kategori (Budgets)
CREATE TABLE IF NOT EXISTS budgets (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL,
    limit_amount DECIMAL(15, 2) NOT NULL
);

-- 8. Tabel Utang (Debts)
CREATE TABLE IF NOT EXISTS debts (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    balance DECIMAL(15, 2) NOT NULL,
    interest_rate DECIMAL(5, 2) NOT NULL,
    min_payment DECIMAL(15, 2) NOT NULL,
    purpose VARCHAR(100) NOT NULL,
    category VARCHAR(100) NOT NULL,
    due_day INT
);

-- 9. Tabel Riwayat Pembayaran Utang (Debt Payments)
CREATE TABLE IF NOT EXISTS debt_payments (
    id VARCHAR(255) PRIMARY KEY,
    debt_id VARCHAR(255) NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
    date VARCHAR(50) NOT NULL,
    amount_paid DECIMAL(15, 2) NOT NULL
);

-- 10. Tabel Konfigurasi Dana Darurat (Emergency Fund Configs)
CREATE TABLE IF NOT EXISTS emergency_fund_configs (
    user_id VARCHAR(255) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    job_stability VARCHAR(50) NOT NULL,
    dependents INT NOT NULL,
    monthly_expense DECIMAL(15, 2) NOT NULL
);

-- 11. Tabel Transaksi Dana Darurat (Emergency Fund Transactions)
CREATE TABLE IF NOT EXISTS emergency_fund_transactions (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date VARCHAR(50) NOT NULL,
    type VARCHAR(50) NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    location VARCHAR(255) NOT NULL,
    description TEXT NOT NULL
);

-- 12. Tabel Target Menabung (Savings Goals)
CREATE TABLE IF NOT EXISTS savings_goals (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    target_amount DECIMAL(15, 2) NOT NULL,
    current_amount DECIMAL(15, 2) NOT NULL,
    target_date VARCHAR(50) NOT NULL,
    category VARCHAR(100),
    notes TEXT
);
