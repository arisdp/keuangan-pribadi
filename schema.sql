-- =============================================================================
-- NUSANTARA WEALTH DATABASE SCHEMA (PostgreSQL / Cloud SQL)
-- 
-- IMPORTANT DEPLOYMENT & MIGRATION NOTE:
-- Explicit UNIQUE constraints are defined on 'username' and 'email' in the 'users' table.
-- 
-- MIGRATION INSTRUCTIONS FOR EXISTING PRODUCTION DATA:
-- If your production database already contains a 'users' table without unique constraints:
-- 1. Deduplicate any existing users with duplicate usernames or emails:
--    DELETE FROM users a USING users b WHERE a.ctid < b.ctid AND a.username = b.username;
-- 2. Add the unique constraints manually if not re-creating the table:
--    ALTER TABLE users ADD CONSTRAINT users_username_unique UNIQUE (username);
--    ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE (email);
-- 3. Ensure all table schema changes are executed against your Cloud SQL instance.
-- =============================================================================

CREATE TABLE IF NOT EXISTS "users" (
	"id" text PRIMARY KEY NOT NULL,
	"username" text UNIQUE NOT NULL,
	"password" text NOT NULL,
	"password_hash" text,
	"email" text UNIQUE,
	"full_name" text NOT NULL,
	"is_premium" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"starting_balance" numeric(15, 2) NOT NULL,
	"current_balance" numeric(15, 2) NOT NULL,
	"account_number" text,
	"credit_limit" numeric(15, 2),
	"used_limit" numeric(15, 2),
	"initial_debt" numeric(15, 2),
	"due_day" integer,
	"interest_rate" numeric(5, 2),
	"min_payment" numeric(15, 2)
);

CREATE TABLE "budgets" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"category" text NOT NULL,
	"type" text NOT NULL,
	"limit_amount" numeric(15, 2) NOT NULL
);

CREATE TABLE "debt_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"debt_id" text NOT NULL,
	"date" text NOT NULL,
	"amount_paid" numeric(15, 2) NOT NULL
);

CREATE TABLE "debts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"balance" numeric(15, 2) NOT NULL,
	"interest_rate" numeric(5, 2) NOT NULL,
	"min_payment" numeric(15, 2) NOT NULL,
	"purpose" text NOT NULL,
	"category" text NOT NULL,
	"due_day" integer
);

CREATE TABLE "emergency_fund_configs" (
	"user_id" text PRIMARY KEY NOT NULL,
	"job_stability" text NOT NULL,
	"dependents" integer NOT NULL,
	"monthly_expense" numeric(15, 2) NOT NULL
);

CREATE TABLE "emergency_fund_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"date" text NOT NULL,
	"type" text NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"location" text NOT NULL,
	"description" text NOT NULL
);

CREATE TABLE "investment_price_history" (
	"id" text PRIMARY KEY NOT NULL,
	"asset_id" text NOT NULL,
	"asset_name" text NOT NULL,
	"date" text NOT NULL,
	"unit_price" numeric(15, 2) NOT NULL,
	"previous_unit_price" numeric(15, 2),
	"change_percentage" numeric(8, 4),
	"note" text
);

CREATE TABLE "investments" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"balance" numeric(15, 2) NOT NULL,
	"date_added" text NOT NULL,
	"initial_capital" numeric(15, 2),
	"quantity" numeric(15, 4),
	"unit_price" numeric(15, 2),
	"units" numeric(15, 4),
	"unit_name" text,
	"purchase_unit_price" numeric(15, 2),
	"current_unit_price" numeric(15, 2),
	"dividends_or_interest" numeric(15, 2)
);

CREATE TABLE "recurring_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"type" text NOT NULL,
	"category" text NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"account_id" text NOT NULL,
	"frequency" text NOT NULL,
	"day_of_month" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"description" text,
	"last_processed_date" text
);

CREATE TABLE "savings_goals" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"target_amount" numeric(15, 2) NOT NULL,
	"current_amount" numeric(15, 2) NOT NULL,
	"target_date" text NOT NULL,
	"category" text,
	"notes" text
);

CREATE TABLE "transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"date" text NOT NULL,
	"account_id" text NOT NULL,
	"type" text NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"linked_debt_id" text,
	"linked_debt_action" text,
	"linked_investment_id" text,
	"linked_investment_action" text
);

ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_debt_id_debts_id_fk" FOREIGN KEY ("debt_id") REFERENCES "public"."debts"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "debts" ADD CONSTRAINT "debts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "emergency_fund_configs" ADD CONSTRAINT "emergency_fund_configs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "emergency_fund_transactions" ADD CONSTRAINT "emergency_fund_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "investment_price_history" ADD CONSTRAINT "investment_price_history_asset_id_investments_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."investments"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "investments" ADD CONSTRAINT "investments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "recurring_transactions" ADD CONSTRAINT "recurring_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "recurring_transactions" ADD CONSTRAINT "recurring_transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "savings_goals" ADD CONSTRAINT "savings_goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;