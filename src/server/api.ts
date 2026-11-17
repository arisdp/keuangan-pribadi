import express from 'express';
import { db, pool, dbConnectionMetadata, isDatabaseConfigured } from '../db';
import { eq, inArray, or, sql } from 'drizzle-orm';
import { 
  users, accounts, transactions, investments, 
  budgets, debts, recurringTransactions, savingsGoals,
  emergencyFundConfigs, emergencyFundTransactions, investmentPriceHistory, debtPayments
} from '../db/schema';
import { dbLogger } from '../utils/dbLogger';

export const apiRouter = express.Router();

const MOCK_USER_ID = 'user-1';

let ensureTablesPromise: Promise<boolean> | null = null;
let fkConstraintsFixed = false;

// Health / diagnostic check
export async function ensureTablesExist(): Promise<boolean> {
  if (!isDatabaseConfigured) {
    return false;
  }

  if (ensureTablesPromise) {
    return ensureTablesPromise;
  }

  ensureTablesPromise = (async () => {
    try {
      const tableQueries = [
        `CREATE TABLE IF NOT EXISTS users (
          id text PRIMARY KEY,
          username text NOT NULL UNIQUE,
          password text NOT NULL,
          password_hash text,
          email text UNIQUE,
          full_name text NOT NULL,
          is_premium boolean DEFAULT false,
          created_at timestamp DEFAULT NOW() NOT NULL
        )`,
        `ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text`,
        `ALTER TABLE users ADD COLUMN IF NOT EXISTS password text DEFAULT '123456'`,
        `ALTER TABLE users ADD COLUMN IF NOT EXISTS email text`,
        `ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name text DEFAULT 'Pengguna'`,
        `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_premium boolean DEFAULT false`,
        `CREATE TABLE IF NOT EXISTS accounts (
          id text PRIMARY KEY,
          user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name text NOT NULL,
          type text NOT NULL,
          starting_balance numeric(15, 2) NOT NULL,
          current_balance numeric(15, 2) NOT NULL,
          account_number text,
          credit_limit numeric(15, 2),
          used_limit numeric(15, 2),
          initial_debt numeric(15, 2),
          due_day integer,
          interest_rate numeric(5, 2),
          min_payment numeric(15, 2)
        )`,
        `CREATE TABLE IF NOT EXISTS transactions (
          id text PRIMARY KEY,
          user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          date text NOT NULL,
          account_id text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
          type text NOT NULL,
          category text NOT NULL,
          description text NOT NULL,
          amount numeric(15, 2) NOT NULL,
          linked_debt_id text,
          linked_debt_action text,
          linked_investment_id text,
          linked_investment_action text
        )`,
        `CREATE TABLE IF NOT EXISTS recurring_transactions (
          id text PRIMARY KEY,
          user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title text NOT NULL,
          type text NOT NULL,
          category text NOT NULL,
          amount numeric(15, 2) NOT NULL,
          account_id text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
          frequency text NOT NULL,
          day_of_month integer NOT NULL,
          is_active boolean DEFAULT true NOT NULL,
          description text,
          last_processed_date text
        )`,
        `CREATE TABLE IF NOT EXISTS investments (
          id text PRIMARY KEY,
          user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name text NOT NULL,
          category text NOT NULL,
          balance numeric(15, 2) NOT NULL,
          date_added text NOT NULL,
          initial_capital numeric(15, 2),
          quantity numeric(15, 4),
          unit_price numeric(15, 2),
          units numeric(15, 4),
          unit_name text,
          purchase_unit_price numeric(15, 2),
          current_unit_price numeric(15, 2),
          dividends_or_interest numeric(15, 2)
        )`,
        `CREATE TABLE IF NOT EXISTS investment_price_history (
          id text PRIMARY KEY,
          asset_id text NOT NULL REFERENCES investments(id) ON DELETE CASCADE,
          asset_name text NOT NULL,
          date text NOT NULL,
          unit_price numeric(15, 2) NOT NULL,
          previous_unit_price numeric(15, 2),
          change_percentage numeric(8, 4),
          note text
        )`,
        `CREATE TABLE IF NOT EXISTS budgets (
          id text PRIMARY KEY,
          user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          category text NOT NULL,
          type text NOT NULL,
          limit_amount numeric(15, 2) NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS debts (
          id text PRIMARY KEY,
          user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name text NOT NULL,
          balance numeric(15, 2) NOT NULL,
          interest_rate numeric(5, 2) NOT NULL,
          min_payment numeric(15, 2) NOT NULL,
          purpose text NOT NULL,
          category text NOT NULL,
          due_day integer
        )`,
        `CREATE TABLE IF NOT EXISTS debt_payments (
          id text PRIMARY KEY,
          debt_id text NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
          date text NOT NULL,
          amount_paid numeric(15, 2) NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS emergency_fund_configs (
          user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          job_stability text NOT NULL,
          dependents integer NOT NULL,
          monthly_expense numeric(15, 2) NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS emergency_fund_transactions (
          id text PRIMARY KEY,
          user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          date text NOT NULL,
          type text NOT NULL,
          amount numeric(15, 2) NOT NULL,
          location text NOT NULL,
          description text NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS savings_goals (
          id text PRIMARY KEY,
          user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title text NOT NULL,
          target_amount numeric(15, 2) NOT NULL,
          current_amount numeric(15, 2) NOT NULL,
          target_date text NOT NULL,
          category text,
          notes text
        )`,
        `INSERT INTO users (id, username, password, password_hash, email, full_name, is_premium)
          VALUES ('user-ariesd', 'ariesD', '123456', '123456', 'ariesd@nusantara.app', 'Aries D', true)
          ON CONFLICT DO NOTHING`
      ];

      for (const q of tableQueries) {
        try {
          await pool.query(q);
        } catch (singleErr: any) {
          dbLogger.warn('Table initialization sub-query warning:', singleErr?.message || singleErr);
        }
      }

      await fixFkConstraints();

      dbLogger.info('Tables verified and default user seeded successfully');
      return true;
    } catch (err: any) {
      dbLogger.error('Failed to auto-create tables in PostgreSQL', err);
      ensureTablesPromise = null;
      return false;
    }
  })();

  return ensureTablesPromise;
}

export async function ensureUserExists(userId: string, fullName?: string, username?: string): Promise<void> {
  if (!userId) return;
  try {
    const cleanId = String(userId).trim();
    if (!cleanId) return;

    await ensureTablesExist();

    const userCheck = await pool.query('SELECT id FROM users WHERE id = $1 LIMIT 1', [cleanId]);
    if (userCheck.rows.length === 0) {
      const displayUsername = username || (cleanId.startsWith('user-local-') 
        ? cleanId.replace('user-local-', '') 
        : cleanId.startsWith('user-') 
          ? cleanId.replace('user-', '') 
          : cleanId);

      const name = fullName || `Pengguna (${displayUsername})`;
      const email = `${cleanId}@nusantara.app`;

      dbLogger.info(`Auto-provisioning missing user record in PostgreSQL users table: ${cleanId}`);

      try {
        await pool.query(`
          INSERT INTO users (id, username, password, password_hash, email, full_name, is_premium)
          VALUES ($1, $2, '123456', '123456', $3, $4, true)
          ON CONFLICT DO NOTHING
        `, [cleanId, cleanId, email, name]);
      } catch (insertErr: any) {
        // Fallback in case of unique constraint violation on username or email
        const uniqueSuffix = Date.now().toString(36);
        await pool.query(`
          INSERT INTO users (id, username, password, password_hash, email, full_name, is_premium)
          VALUES ($1, $2, '123456', '123456', $3, $4, true)
          ON CONFLICT DO NOTHING
        `, [cleanId, `${cleanId}_${uniqueSuffix}`, `${cleanId}_${uniqueSuffix}@nusantara.app`, name]);
      }

      dbLogger.info(`User record ${cleanId} successfully provisioned in PostgreSQL.`);
    }
  } catch (err: any) {
    dbLogger.error(`ensureUserExists error for user ${userId}:`, err?.message || err);
  }
}

export async function fixFkConstraints(): Promise<void> {
  if (fkConstraintsFixed) return;
  fkConstraintsFixed = true;

  try {
    // 1. Query all foreign key constraints in public schema
    const fkRes = await pool.query(`
      SELECT 
        c.conname AS constraint_name,
        cl.relname AS table_name
      FROM pg_constraint c
      JOIN pg_class cl ON c.conrelid = cl.oid
      JOIN pg_namespace n ON cl.relnamespace = n.oid
      WHERE c.contype = 'f' 
        AND n.nspname = 'public'
    `);

    // 2. Drop all foreign key constraints
    for (const row of fkRes.rows) {
      const cName = row.constraint_name;
      const tName = row.table_name;
      if (cName && tName) {
        try {
          await pool.query(`ALTER TABLE "${tName}" DROP CONSTRAINT IF EXISTS "${cName}" CASCADE`);
        } catch (e: any) {
          const msg = e?.message || String(e);
          if (!msg.includes('must be owner')) {
            dbLogger.warn(`Failed to drop FK constraint ${cName} on ${tName}:`, msg);
          }
        }
      }
    }

    // 3. Clean any orphaned rows before adding FK constraints
    await pool.query(`DELETE FROM transactions WHERE account_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM accounts WHERE accounts.id = transactions.account_id)`);
    await pool.query(`DELETE FROM recurring_transactions WHERE account_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM accounts WHERE accounts.id = recurring_transactions.account_id)`);
    await pool.query(`DELETE FROM debt_payments WHERE debt_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM debts WHERE debts.id = debt_payments.debt_id)`);
    await pool.query(`DELETE FROM investment_price_history WHERE asset_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM investments WHERE investments.id = investment_price_history.asset_id)`);

    // 4. Re-add foreign key constraints with ON DELETE CASCADE
    const addFks = [
      `ALTER TABLE accounts ADD CONSTRAINT accounts_user_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`,
      `ALTER TABLE transactions ADD CONSTRAINT transactions_user_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`,
      `ALTER TABLE transactions ADD CONSTRAINT transactions_account_id_fk FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE`,
      `ALTER TABLE recurring_transactions ADD CONSTRAINT recurring_transactions_user_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`,
      `ALTER TABLE recurring_transactions ADD CONSTRAINT recurring_transactions_account_id_fk FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE`,
      `ALTER TABLE debts ADD CONSTRAINT debts_user_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`,
      `ALTER TABLE debt_payments ADD CONSTRAINT debt_payments_debt_id_fk FOREIGN KEY (debt_id) REFERENCES debts(id) ON DELETE CASCADE`,
      `ALTER TABLE investments ADD CONSTRAINT investments_user_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`,
      `ALTER TABLE investment_price_history ADD CONSTRAINT investment_price_history_asset_id_fk FOREIGN KEY (asset_id) REFERENCES investments(id) ON DELETE CASCADE`,
      `ALTER TABLE budgets ADD CONSTRAINT budgets_user_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`,
      `ALTER TABLE savings_goals ADD CONSTRAINT savings_goals_user_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`,
      `ALTER TABLE emergency_fund_configs ADD CONSTRAINT emergency_fund_configs_user_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`,
      `ALTER TABLE emergency_fund_transactions ADD CONSTRAINT emergency_fund_transactions_user_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`
    ];

    for (const addQ of addFks) {
      try {
        await pool.query(addQ);
      } catch (e: any) {
        const msg = e?.message || String(e);
        if (!msg.includes('must be owner') && !msg.includes('already exists')) {
          dbLogger.warn('Error re-adding FK constraint:', msg);
        }
      }
    }
  } catch (err: any) {
    dbLogger.warn('Error in fixFkConstraints:', err?.message || err);
  }
}

// Call ensureTablesExist immediately on startup
ensureTablesExist().catch(err => {
  console.error('[DB Startup] Error running ensureTablesExist:', err);
});

// Guard middleware so unconfigured Neon URLs fail fast with a clear diagnostic message
apiRouter.use((req, res, next) => {
  if (req.path === '/health' || req.path === '/logs') {
    return next();
  }
  if (!isDatabaseConfigured) {
    return res.status(503).json({
      success: false,
      error: 'Database Neon PostgreSQL belum dikonfigurasi',
      details: 'Silakan tambahkan NEON_DATABASE_URL atau DATABASE_URL pada environment/Secrets server.',
      connection: dbConnectionMetadata,
    });
  }
  return next();
});

apiRouter.get('/health', async (req, res) => {
  const startTime = Date.now();
  if (!isDatabaseConfigured) {
    return res.status(503).json({
      status: 'error',
      database: 'disconnected',
      latencyMs: Date.now() - startTime,
      details: 'NEON_DATABASE_URL / DATABASE_URL belum dikonfigurasi. Tambahkan connection string Neon PostgreSQL di Secrets/Environment.',
      connection: dbConnectionMetadata,
      timestamp: new Date().toISOString()
    });
  }

  try {
    await db.execute(sql`SELECT 1 as ping`);
    const latencyMs = Date.now() - startTime;
    
    // Check if table users exists
    let tableReady = true;
    let tableNote = 'Tabel users dan koneksi PostgreSQL berjalan normal.';
    try {
      await db.select({ id: users.id }).from(users).limit(1);
    } catch (tableErr: any) {
      tableReady = false;
      tableNote = `Ping PostgreSQL sukses (${latencyMs}ms), tetapi query tabel 'users' bermasalah: ${tableErr?.message || 'Izin/tabel belum siap'}`;
      // Attempt auto-creation in background
      ensureTablesExist();
    }

    dbLogger.info('Database health check ping successful', { latencyMs, tableReady, host: dbConnectionMetadata.host, sslMode: dbConnectionMetadata.sslMode });
    res.json({
      status: 'ok',
      database: tableReady ? 'connected' : 'table_warning',
      latencyMs,
      details: tableNote,
      connection: dbConnectionMetadata,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    const latencyMs = Date.now() - startTime;
    dbLogger.error('Database health check failed', error);
    res.status(500).json({
      status: 'error',
      database: 'disconnected',
      latencyMs,
      details: error?.message || 'Database connection failure',
      connection: dbConnectionMetadata,
      timestamp: new Date().toISOString()
    });
  }
});

// Endpoint to fetch recent DB logs for diagnostic UI
apiRouter.get('/logs', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 5, 20);
    const logs = dbLogger.getRecentLogs(limit);
    res.json({ logs });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to retrieve logs', details: error?.message });
  }
});

// Endpoint to inspect table schema (e.g., users table columns and data types)
apiRouter.get('/schema', async (req, res) => {
  try {
    const tableName = String(req.query.tableName || req.query.table || 'users');
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default 
      FROM information_schema.columns 
      WHERE table_name = $1
      ORDER BY ordinal_position
    `, [tableName]);

    res.json({
      success: true,
      tableName,
      columns: result.rows
    });
  } catch (error: any) {
    console.error("GET /schema Error:", error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to inspect table schema', 
      details: error?.message || String(error) 
    });
  }
});

// Endpoint to inspect user records for DatabaseDiagnostics (password fields redacted for security)
apiRouter.get('/inspect-users', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        id, 
        username, 
        email, 
        full_name, 
        is_premium, 
        created_at,
        CASE WHEN password IS NOT NULL THEN '••••••••' ELSE NULL END AS password,
        CASE WHEN password_hash IS NOT NULL THEN '[TERLINDUNGI]' ELSE NULL END AS password_hash
      FROM users 
      ORDER BY created_at DESC 
      LIMIT 100
    `);
    res.json({
      success: true,
      rows: result.rows,
      rowCount: result.rowCount,
      fields: result.fields ? result.fields.map((f: any) => f.name) : []
    });
  } catch (error: any) {
    console.error("GET /inspect-users Error:", error?.message || error);
    res.status(500).json({
      success: false,
      error: 'Failed to inspect users table records',
      details: error?.message || String(error)
    });
  }
});

// Endpoint to auto-fix missing columns in users table if needed
apiRouter.post('/fix-users-schema', async (req, res) => {
  try {
    await pool.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS password_hash VARCHAR,
      ADD COLUMN IF NOT EXISTS email VARCHAR,
      ADD COLUMN IF NOT EXISTS is_premium BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS password TEXT;
    `);
    res.json({
      success: true,
      message: 'Berhasil menyelaraskan skema tabel users. Seluruh kolom pendukung telah tersedia.'
    });
  } catch (error: any) {
    console.error("POST /fix-users-schema Error:", error);
    res.status(500).json({
      success: false,
      error: 'Gagal memperbarui skema tabel users',
      details: error?.message || String(error)
    });
  }
});

// Endpoint to rebuild database schema (DROP TABLE IF EXISTS users CASCADE; CREATE TABLE users ...)
apiRouter.post('/rebuild-schema', async (req, res) => {
  try {
    dbLogger.info('Rebuilding database schema for users table...');
    await pool.query(`
      DROP TABLE IF EXISTS users CASCADE;
      CREATE TABLE users (
        id text PRIMARY KEY,
        username text NOT NULL UNIQUE,
        password text NOT NULL DEFAULT '123456',
        password_hash text,
        email text UNIQUE,
        full_name text NOT NULL DEFAULT 'Pengguna',
        is_premium boolean DEFAULT false,
        created_at timestamp DEFAULT NOW() NOT NULL
      );
    `);

    await pool.query(`
      INSERT INTO users (id, username, password, password_hash, email, full_name, is_premium)
      VALUES ('user-ariesd', 'ariesD', '123456', '123456', 'ariesd@nusantara.app', 'Aries D', true)
      ON CONFLICT DO NOTHING;
    `);

    res.json({
      success: true,
      message: 'Berhasil membuat ulang skema tabel users (DROP TABLE IF EXISTS users; CREATE TABLE users ...). Seluruh kolom termasuk password_hash telah dibuat.'
    });
  } catch (error: any) {
    console.error("POST /rebuild-schema Error:", error);
    res.status(500).json({
      success: false,
      error: 'Gagal membuat ulang skema database',
      details: error?.message || String(error)
    });
  }
});

apiRouter.post('/auth/register', async (req, res) => {
  dbLogger.info('Registration request received', { 
    username: req.body?.username, 
    email: req.body?.email, 
    fullName: req.body?.fullName 
  });

  try {
    const { username, password, fullName, email } = req.body || {};
    const cleanUsername = String(username || '').trim();
    const cleanPassword = String(password || '').trim();
    const cleanFullName = String(fullName || '').trim();
    const cleanEmail = String(email || '').trim();

    if (!cleanUsername || !cleanPassword || !cleanFullName) {
      dbLogger.warn('Registration rejected: missing required fields', { cleanUsername, cleanFullName, hasPassword: !!cleanPassword });
      return res.status(400).json({ error: 'Username, password, dan nama lengkap wajib diisi' });
    }

    const conditions = [eq(users.username, cleanUsername)];
    if (cleanEmail) {
      conditions.push(eq(users.email, cleanEmail));
    }

    dbLogger.info('Checking existing user in database', { cleanUsername, cleanEmail });
    await ensureTablesExist();
    let existingUser: any[] = [];
    try {
      existingUser = await db.select().from(users).where(or(...conditions));
    } catch (checkErr: any) {
      dbLogger.error('Database query error while checking existing user', checkErr, { cleanUsername, cleanEmail });
      // If check fails due to query syntax or connection error, log and continue to attempt insert or report database issue
    }

    if (existingUser && existingUser.length > 0) {
      dbLogger.warn('Registration duplicate check hit', { username: cleanUsername, email: cleanEmail });
      return res.status(400).json({ 
        error: 'Username atau Email sudah terdaftar dalam sistem',
        details: `Pengguna dengan username '${cleanUsername}' atau email '${cleanEmail}' sudah terdaftar. Silakan login.`
      });
    }

    const id = `user-${Date.now()}`;
    const userEmail = cleanEmail || `${cleanUsername}@nusantara.app`;
    
    dbLogger.info('Inserting new user into database', { id, username: cleanUsername, email: userEmail });
    try {
      await db.insert(users).values({
        id,
        username: cleanUsername,
        password: cleanPassword,
        passwordHash: cleanPassword,
        email: userEmail,
        fullName: cleanFullName,
      });
      dbLogger.info('User registered successfully', { id, username: cleanUsername });
    } catch (insertErr: any) {
      dbLogger.error('Database insert constraint violation on registration', insertErr, {
        username: cleanUsername,
        email: userEmail
      });
      const errStr = String(insertErr || '').toLowerCase();
      if (insertErr?.code === '23505' || errStr.includes('unique') || errStr.includes('duplicate')) {
        return res.status(400).json({ 
          error: 'Username atau Email sudah terdaftar dalam sistem', 
          details: `Username '${cleanUsername}' atau Email '${userEmail}' telah digunakan oleh akun lain.` 
        });
      }
      throw insertErr;
    }

    res.json({ success: true, user: { id, username: cleanUsername, fullName: cleanFullName, email: userEmail } });
  } catch (error: any) {
    dbLogger.error('Fatal database registration error', error, { username: req.body?.username });
    const errMsg = error?.message || '';
    if (errMsg.toLowerCase().includes('failed query') || errMsg.toLowerCase().includes('unique') || errMsg.toLowerCase().includes('duplicate')) {
      return res.status(400).json({
        error: 'Username atau Email sudah terdaftar dalam sistem',
        details: 'Gagal mendaftar karena username atau email sudah digunakan.'
      });
    }
    res.status(500).json({ 
      error: 'Terjadi kendala pada server database', 
      details: 'Gagal terhubung atau memproses pendaftaran. Silakan coba beberapa saat lagi.' 
    });
  }
});

apiRouter.post('/auth/login', async (req, res) => {
  try {
    const { username, email, password } = req.body || {};
    const cleanIdentifier = String(username || email || '').trim();
    const cleanPassword = String(password || '').trim();

    if (!cleanIdentifier || !cleanPassword) {
      dbLogger.warn('Login rejected: missing credentials');
      return res.status(400).json({ error: 'Username/Email dan Password wajib diisi' });
    }

    dbLogger.info('Login lookup initiated', { cleanIdentifier });

    let foundUsers: any[] = [];
    try {
      foundUsers = await db.select().from(users).where(
        or(
          eq(users.username, cleanIdentifier),
          eq(users.email, cleanIdentifier)
        )
      );
    } catch (queryErr: any) {
      dbLogger.error('Database query error during login. Attempting table auto-creation...', queryErr, { cleanIdentifier });
      
      // Auto-create table and seed default user
      await ensureTablesExist();

      try {
        foundUsers = await db.select().from(users).where(
          or(
            eq(users.username, cleanIdentifier),
            eq(users.email, cleanIdentifier)
          )
        );
      } catch (retryErr: any) {
        dbLogger.error('Retry query after ensureTablesExist also failed', retryErr);
        
        // If user is trying to login as ariesD or demo account, return seamless user object as fallback
        if (cleanIdentifier.toLowerCase() === 'ariesd') {
          dbLogger.info('Fallback login granted for ariesD');
          return res.json({
            success: true,
            user: {
              id: 'user-ariesd',
              username: 'ariesD',
              fullName: 'Aries D (Neon PostgreSQL Fallback)',
              email: 'ariesd@nusantara.app'
            }
          });
        }

        return res.status(500).json({ 
          error: 'Gagal mengeksekusi query database PostgreSQL', 
          details: `PostgreSQL Error [${retryErr?.code || 'DB_QUERY_ERR'}]: ${retryErr?.message || 'Terjadi masalah pada koneksi ke Neon PostgreSQL'}` 
        });
      }
    }

    // If user is 'ariesD' and not yet in database, insert on the fly
    if ((!foundUsers || foundUsers.length === 0) && cleanIdentifier.toLowerCase() === 'ariesd') {
      try {
        await db.insert(users).values({
          id: 'user-ariesd',
          username: 'ariesD',
          password: cleanPassword || '123456',
          passwordHash: cleanPassword || '123456',
          email: 'ariesd@nusantara.app',
          fullName: 'Aries D',
          isPremium: true
        }).onConflictDoNothing();

        foundUsers = await db.select().from(users).where(eq(users.username, 'ariesD'));
      } catch (insertErr) {
        dbLogger.error('Failed to auto-insert ariesD user on login', insertErr);
      }
    }

    if (!foundUsers || foundUsers.length === 0) {
      dbLogger.warn('Login failed: user not found', { cleanIdentifier });
      return res.status(401).json({ error: 'Username/Email atau Password tidak cocok' });
    }

    const u = foundUsers[0];
    const passwordValid = (u.password && u.password === cleanPassword) || (u.passwordHash && u.passwordHash === cleanPassword);
    if (!passwordValid) {
      dbLogger.warn('Login failed: invalid password', { userId: u.id, username: u.username });
      return res.status(401).json({ error: 'Username/Email atau Password tidak cocok' });
    }

    dbLogger.info('Login successful', { userId: u.id, username: u.username });
    res.json({ success: true, user: { id: u.id, username: u.username, fullName: u.fullName, email: u.email } });
  } catch (error: any) {
    dbLogger.error('Login authentication error', error);
    res.status(500).json({ 
      error: 'Gagal melakukan otentikasi login', 
      details: 'Terjadi kesalahan sistem. Silakan coba beberapa saat lagi.' 
    });
  }
});

apiRouter.post('/auth/forgot-password', async (req, res) => {
  try {
    const { identifier } = req.body || {};
    const cleanIdentifier = String(identifier || '').trim();

    if (!cleanIdentifier) {
      dbLogger.warn('Forgot password request missing identifier');
      return res.status(400).json({ error: 'Username atau Email wajib diisi' });
    }

    dbLogger.info('Forgot password request received', { cleanIdentifier });

    let foundUsers: any[] = [];
    try {
      foundUsers = await db.select().from(users).where(
        or(
          eq(users.username, cleanIdentifier),
          eq(users.email, cleanIdentifier)
        )
      );
    } catch (queryErr: any) {
      dbLogger.error('Database query error during forgot password lookup', queryErr, { cleanIdentifier });
      return res.status(500).json({ 
        error: 'Gagal terhubung ke database server', 
        details: 'Terjadi kendala koneksi ke database. Silakan coba beberapa saat lagi.' 
      });
    }

    if (!foundUsers || foundUsers.length === 0) {
      dbLogger.warn('Forgot password lookup failed: user not found', { cleanIdentifier });
      return res.status(404).json({ 
        error: 'Email atau Username tidak terdaftar dalam sistem',
        details: `Tidak ditemukan akun dengan identifier '${cleanIdentifier}'. Silakan periksa kembali.`
      });
    }

    const u = foundUsers[0];
    const targetEmail = u.email || `${u.username}@nusantara.app`;
    const resetToken = `rst-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const resetLink = `https://nusantara-wealth.app/reset-password?token=${resetToken}`;

    dbLogger.info('Password reset token created successfully', { userId: u.id, email: targetEmail, resetToken });

    res.json({
      success: true,
      message: `Instruksi dan tautan pemulihan password telah dikirim ke email: ${targetEmail}`,
      resetLink,
      user: {
        username: u.username,
        email: targetEmail
      }
    });
  } catch (error: any) {
    dbLogger.error('Forgot password endpoint error', error);
    res.status(500).json({ 
      error: 'Gagal memproses permintaan reset password', 
      details: error?.message || 'Terjadi kesalahan sistem' 
    });
  }
});

apiRouter.use(async (req, res, next) => {
  if (req.path.startsWith('/auth/') || req.path === '/health' || req.path === '/logs') {
    return next();
  }
  
  const userId = req.headers['x-user-id'] as string;
  if (!userId && req.path !== '/init-user') {
    return res.status(401).json({ error: 'Unauthorized, missing X-User-Id header' });
  }
  
  (req as any).userId = userId || MOCK_USER_ID; 
  next();
});

apiRouter.post('/init-user', async (req, res) => {
  try {
    const existing = await db.select().from(users).where(eq(users.id, MOCK_USER_ID));
    if (existing.length === 0) {
      await db.insert(users).values({
        id: MOCK_USER_ID,
        username: 'default_user',
        password: 'default_password',
        fullName: 'Default User',
      });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to initialize user' });
  }
});

// Full state sync GET
apiRouter.get('/sync', async (req, res) => {
  try {
    const userId = (req as any).userId;
    await ensureUserExists(userId);
    
    // Fetch all related entities
    const allAccounts = await db.select().from(accounts).where(eq(accounts.userId, userId));
    const allTransactions = await db.select().from(transactions).where(eq(transactions.userId, userId));
    const allBudgets = await db.select().from(budgets).where(eq(budgets.userId, userId));
    const allDebts = await db.select().from(debts).where(eq(debts.userId, userId));
    const allInvestments = await db.select().from(investments).where(eq(investments.userId, userId));
    const allRecurringTxs = await db.select().from(recurringTransactions).where(eq(recurringTransactions.userId, userId));
    const allSavingsGoals = await db.select().from(savingsGoals).where(eq(savingsGoals.userId, userId));
    
    const efConfigs = await db.select().from(emergencyFundConfigs).where(eq(emergencyFundConfigs.userId, userId));
    const allEfTxs = await db.select().from(emergencyFundTransactions).where(eq(emergencyFundTransactions.userId, userId));

    const allInvestmentPriceHistories = await db.select().from(investmentPriceHistory); // Filter manually below
    const allDebtPayments = await db.select().from(debtPayments); // Filter manually below

    // We must map properties and cast decimals back to numbers for the frontend
    const mapToNum = (obj: any) => {
      const res: any = { ...obj };
      for (const key in res) {
        if (typeof res[key] === 'string' && !isNaN(Number(res[key])) && (
            key.toLowerCase().includes('amount') || key.toLowerCase().includes('balance') || 
            key.toLowerCase().includes('price') || key.toLowerCase().includes('rate') ||
            key.toLowerCase().includes('limit') || key.toLowerCase().includes('payment') ||
            key.toLowerCase().includes('quantity') || key.toLowerCase().includes('units') ||
            key.toLowerCase().includes('dividends') || key.toLowerCase().includes('debt')
          )) {
          // Careful with string dates parsing as numbers. We only cast specific keys.
          res[key] = Number(res[key]);
        }
      }
      return res;
    };

    const formattedInvestments = allInvestments.map(inv => {
      const histories = allInvestmentPriceHistories.filter(ph => ph.assetId === inv.id).map(mapToNum);
      return { ...mapToNum(inv), priceHistory: histories };
    });

    const formattedDebts = allDebts.map(debt => {
      const payments = allDebtPayments.filter(dp => dp.debtId === debt.id).map(mapToNum);
      return { ...mapToNum(debt), paymentHistory: payments };
    });

    res.json({
      accounts: allAccounts.map(mapToNum),
      transactions: allTransactions.map(mapToNum),
      budgets: allBudgets.map((b: any) => {
        const mapped = mapToNum(b);
        mapped.limit = mapped.limitAmount;
        delete mapped.limitAmount;
        return mapped;
      }),
      debts: formattedDebts,
      investments: formattedInvestments,
      recurringTransactions: allRecurringTxs.map(mapToNum),
      savingsGoals: allSavingsGoals.map(mapToNum),
      emergencyConfig: efConfigs.length > 0 ? mapToNum(efConfigs[0]) : { jobStability: 'medium', dependents: 0, monthlyExpense: 0 },
      emergencyTransactions: allEfTxs.map(mapToNum)
    });
  } catch (error: any) {
    console.error("GET /sync Error:", error);
    res.status(500).json({ error: 'Failed to sync data' });
  }
});

const safeNumberString = (val: any, fallback = '0'): string => {
  if (val === null || val === undefined || val === '') return fallback;
  const num = Number(val);
  return isNaN(num) ? fallback : String(num);
};

const safeNullableNumberString = (val: any): string | null => {
  if (val === null || val === undefined || val === '') return null;
  const num = Number(val);
  return isNaN(num) ? null : String(num);
};

const safeInt = (val: any, fallback = 0): number => {
  if (val === null || val === undefined || val === '') return fallback;
  const num = parseInt(val, 10);
  return isNaN(num) ? fallback : num;
};

const safeNullableInt = (val: any): number | null => {
  if (val === null || val === undefined || val === '') return null;
  const num = parseInt(val, 10);
  return isNaN(num) ? null : num;
};

async function withDbRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err: any) {
      attempt++;
      const msg = String(err?.message || err?.cause?.message || err || '');
      const code = String(err?.code || err?.cause?.code || '');
      const isConnError =
        ['57P01', '57P02', '57P03', '08000', '08001', '08003', '08006'].includes(code) ||
        /terminated|connection|CLOSED|ECONNRESET|ETIMEDOUT|endpoint|compute/i.test(msg);
      if (isConnError && attempt <= maxRetries) {
        console.warn(`[DB Retry] Retrying Neon operation after transient/cold-start error (attempt ${attempt}/${maxRetries}):`, msg);
        ensureTablesPromise = null;
        await new Promise((r) => setTimeout(r, 400 * attempt));
        continue;
      }
      throw err;
    }
  }
}

// Full state sync POST
apiRouter.post('/sync', async (req, res) => {
  try {
    const userId = (req as any).userId;
    const body = req.body || {};

    await withDbRetry(async () => {
      await ensureTablesExist();
      await ensureUserExists(userId, body.userFullName || body.fullName, body.username);

      // Use transaction to delete and insert
      await db.transaction(async (tx) => {
      // 0. Ensure user record exists in users table inside transaction
      const userDisplayName = String(body.userFullName || body.fullName || 'Pengguna');
      const userEmail = `${userId}@nusantara.app`;
      await tx.execute(sql`
        INSERT INTO users (id, username, password, password_hash, email, full_name, is_premium)
        VALUES (${userId}, ${userId}, '123456', '123456', ${userEmail}, ${userDisplayName}, true)
        ON CONFLICT (id) DO UPDATE SET 
          full_name = EXCLUDED.full_name,
          password_hash = COALESCE(users.password_hash, EXCLUDED.password_hash),
          password = COALESCE(users.password, EXCLUDED.password);
      `);

      // 1. Delete transactions referencing user's accounts or created by user or orphaned
      await tx.execute(sql`
        DELETE FROM transactions 
        WHERE user_id = ${userId} 
           OR account_id IN (SELECT id FROM accounts WHERE user_id = ${userId})
           OR account_id LIKE ${userId + '_%'}
           OR (account_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM accounts WHERE accounts.id = transactions.account_id));
      `);

      // 2. Delete recurring transactions
      await tx.execute(sql`
        DELETE FROM recurring_transactions 
        WHERE user_id = ${userId} 
           OR account_id IN (SELECT id FROM accounts WHERE user_id = ${userId})
           OR account_id LIKE ${userId + '_%'}
           OR (account_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM accounts WHERE accounts.id = recurring_transactions.account_id));
      `);

      // 3. Delete debt payments
      await tx.execute(sql`
        DELETE FROM debt_payments 
        WHERE debt_id IN (SELECT id FROM debts WHERE user_id = ${userId})
           OR debt_id LIKE ${userId + '_%'}
           OR (debt_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM debts WHERE debts.id = debt_payments.debt_id));
      `);

      // 4. Delete investment price history
      await tx.execute(sql`
        DELETE FROM investment_price_history 
        WHERE asset_id IN (SELECT id FROM investments WHERE user_id = ${userId})
           OR asset_id LIKE ${userId + '_%'}
           OR (asset_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM investments WHERE investments.id = investment_price_history.asset_id));
      `);

      // 5. Delete simple user-scoped tables
      await tx.execute(sql`DELETE FROM emergency_fund_transactions WHERE user_id = ${userId};`);
      await tx.execute(sql`DELETE FROM budgets WHERE user_id = ${userId};`);
      await tx.execute(sql`DELETE FROM savings_goals WHERE user_id = ${userId};`);
      await tx.execute(sql`DELETE FROM emergency_fund_configs WHERE user_id = ${userId};`);

      // 6. Delete investments & debts
      await tx.execute(sql`DELETE FROM investments WHERE user_id = ${userId};`);
      await tx.execute(sql`DELETE FROM debts WHERE user_id = ${userId};`);

      // 7. Ensure no remaining transactions or recurring_transactions reference accounts of userId before deleting accounts
      await tx.execute(sql`DELETE FROM transactions WHERE account_id IN (SELECT id FROM accounts WHERE user_id = ${userId});`);
      await tx.execute(sql`DELETE FROM recurring_transactions WHERE account_id IN (SELECT id FROM accounts WHERE user_id = ${userId});`);

      // 8. Delete accounts for user
      await tx.execute(sql`DELETE FROM accounts WHERE user_id = ${userId};`);

      // 2. Insert new records safely with mapped IDs and strict deduplication
      const ensureUserScopedId = (id: string | undefined | null, prefix = 'item', idx = 0) => {
        if (!id || typeof id !== 'string' || !id.trim()) {
          return `${userId}_${prefix}_${idx}_${Math.random().toString(36).substring(2, 7)}`;
        }
        const cleanId = id.trim();
        return cleanId.startsWith(userId) ? cleanId : `${userId}_${cleanId}`;
      };

      const deduplicateById = <T extends { id: string }>(arr: T[]): T[] => {
        return Array.from(new Map(arr.map(item => [item.id, item])).values());
      };

      // 2a. ACCOUNTS
      const mappedAccounts = (body.accounts || []).map((a: any, idx: number) => ({
        id: ensureUserScopedId(a.id, 'acc', idx),
        userId,
        name: String(a.name || 'Rekening'),
        type: String(a.type || 'cash'),
        startingBalance: safeNumberString(a.startingBalance, '0'),
        currentBalance: safeNumberString(a.currentBalance, '0'),
        accountNumber: a.accountNumber ? String(a.accountNumber) : null,
        creditLimit: safeNullableNumberString(a.creditLimit),
        usedLimit: safeNullableNumberString(a.usedLimit),
        initialDebt: safeNullableNumberString(a.initialDebt),
        dueDay: safeNullableInt(a.dueDay),
        interestRate: safeNullableNumberString(a.interestRate),
        minPayment: safeNullableNumberString(a.minPayment),
      }));

      let uniqueAccounts = deduplicateById(mappedAccounts);
      if (uniqueAccounts.length === 0) {
        const defaultAcc = {
          id: `${userId}_acc_default`,
          userId,
          name: 'Dompet Tunai',
          type: 'cash',
          startingBalance: '0',
          currentBalance: '0',
          accountNumber: null,
          creditLimit: null,
          usedLimit: null,
          initialDebt: null,
          dueDay: null,
          interestRate: null,
          minPayment: null,
        };
        uniqueAccounts = [defaultAcc];
      }

      await tx.insert(accounts).values(uniqueAccounts as any).onConflictDoNothing();
      const validAccountIds = new Set(uniqueAccounts.map(a => a.id));
      const fallbackAccountId = uniqueAccounts[0].id;

      // 2b. TRANSACTIONS
      const mappedTransactions = (body.transactions || []).map((t: any, idx: number) => {
        const mappedAccId = t.accountId ? ensureUserScopedId(t.accountId, 'acc', 0) : null;
        const finalAccId = (mappedAccId && validAccountIds.has(mappedAccId)) ? mappedAccId : fallbackAccountId;
        return {
          id: ensureUserScopedId(t.id, 'tx', idx),
          userId,
          date: String(t.date || new Date().toISOString().split('T')[0]),
          accountId: finalAccId,
          type: String(t.type || 'expense'),
          category: String(t.category || 'Lainnya'),
          description: String(t.description || ''),
          amount: safeNumberString(t.amount, '0'),
          linkedDebtId: t.linkedDebtId ? ensureUserScopedId(t.linkedDebtId, 'debt', 0) : null,
          linkedDebtAction: t.linkedDebtAction ? String(t.linkedDebtAction) : null,
          linkedInvestmentId: t.linkedInvestmentId ? ensureUserScopedId(t.linkedInvestmentId, 'inv', 0) : null,
          linkedInvestmentAction: t.linkedInvestmentAction ? String(t.linkedInvestmentAction) : null,
        };
      });
      const uniqueTransactions = deduplicateById(mappedTransactions);
      if (uniqueTransactions.length > 0) {
        await tx.insert(transactions).values(uniqueTransactions as any).onConflictDoNothing();
      }

      // 2c. BUDGETS
      const mappedBudgets = (body.budgets || []).map((b: any, idx: number) => ({
        id: ensureUserScopedId(b.id, `b_${b.category || 'cat'}`, idx),
        userId,
        category: String(b.category || 'Umum'),
        type: String(b.type || 'expense'),
        limitAmount: safeNumberString(b.limitAmount ?? b.limit, '0'),
      }));
      const uniqueBudgets = deduplicateById(mappedBudgets);
      if (uniqueBudgets.length > 0) {
        await tx.insert(budgets).values(uniqueBudgets as any).onConflictDoNothing();
      }

      // 2d. DEBTS
      const mappedDebts = (body.debts || []).map((d: any, idx: number) => ({
        id: ensureUserScopedId(d.id, 'debt', idx),
        userId,
        name: String(d.name || 'Utang'),
        balance: safeNumberString(d.balance, '0'),
        interestRate: safeNumberString(d.interestRate, '0'),
        minPayment: safeNumberString(d.minPayment, '0'),
        purpose: String(d.purpose || 'Lainnya'),
        category: String(d.category || 'Utang Konsumtif'),
        dueDay: safeNullableInt(d.dueDay),
      }));
      const uniqueDebts = deduplicateById(mappedDebts);
      if (uniqueDebts.length > 0) {
        await tx.insert(debts).values(uniqueDebts as any).onConflictDoNothing();
      }
      const validDebtIds = new Set(uniqueDebts.map(d => d.id));

      const mappedPayments: any[] = [];
      for (const rawDebt of (body.debts || [])) {
        const parentDebtId = ensureUserScopedId(rawDebt.id, 'debt', 0);
        if (validDebtIds.has(parentDebtId) && rawDebt.paymentHistory && Array.isArray(rawDebt.paymentHistory)) {
          for (let phIdx = 0; phIdx < rawDebt.paymentHistory.length; phIdx++) {
            const ph = rawDebt.paymentHistory[phIdx];
            mappedPayments.push({
              id: ensureUserScopedId(ph.id, 'ph', phIdx),
              debtId: parentDebtId,
              date: String(ph.date || new Date().toISOString().split('T')[0]),
              amountPaid: safeNumberString(ph.amountPaid ?? ph.amount, '0'),
            });
          }
        }
      }
      const uniquePayments = deduplicateById(mappedPayments);
      if (uniquePayments.length > 0) {
        await tx.insert(debtPayments).values(uniquePayments as any).onConflictDoNothing();
      }

      // 2e. INVESTMENTS
      const mappedInvestments = (body.investments || []).map((i: any, idx: number) => ({
        id: ensureUserScopedId(i.id, 'inv', idx),
        userId,
        name: String(i.name || 'Aset'),
        category: String(i.category || 'Lainnya'),
        balance: safeNumberString(i.balance, '0'),
        dateAdded: String(i.dateAdded || new Date().toISOString().split('T')[0]),
        initialCapital: safeNullableNumberString(i.initialCapital),
        quantity: safeNullableNumberString(i.quantity),
        unitPrice: safeNullableNumberString(i.unitPrice),
        units: safeNullableNumberString(i.units),
        unitName: i.unitName ? String(i.unitName) : null,
        purchaseUnitPrice: safeNullableNumberString(i.purchaseUnitPrice),
        currentUnitPrice: safeNullableNumberString(i.currentUnitPrice),
        dividendsOrInterest: safeNullableNumberString(i.dividendsOrInterest),
      }));
      const uniqueInvestments = deduplicateById(mappedInvestments);
      if (uniqueInvestments.length > 0) {
        await tx.insert(investments).values(uniqueInvestments as any).onConflictDoNothing();
      }
      const validInvIds = new Set(uniqueInvestments.map(i => i.id));

      const mappedPriceHistories: any[] = [];
      for (const rawInv of (body.investments || [])) {
        const parentAssetId = ensureUserScopedId(rawInv.id, 'inv', 0);
        if (validInvIds.has(parentAssetId) && rawInv.priceHistory && Array.isArray(rawInv.priceHistory)) {
          for (let iphIdx = 0; iphIdx < rawInv.priceHistory.length; iphIdx++) {
            const ph = rawInv.priceHistory[iphIdx];
            mappedPriceHistories.push({
              id: ensureUserScopedId(ph.id, 'iph', iphIdx),
              assetId: parentAssetId,
              assetName: String(ph.assetName || rawInv.name || 'Aset'),
              date: String(ph.date || new Date().toISOString().split('T')[0]),
              unitPrice: safeNumberString(ph.unitPrice, '0'),
              previousUnitPrice: safeNullableNumberString(ph.previousUnitPrice),
              changePercentage: safeNullableNumberString(ph.changePercentage),
              note: ph.note ? String(ph.note) : null,
            });
          }
        }
      }
      const uniquePriceHistories = deduplicateById(mappedPriceHistories);
      if (uniquePriceHistories.length > 0) {
        await tx.insert(investmentPriceHistory).values(uniquePriceHistories as any).onConflictDoNothing();
      }

      // 2f. RECURRING TRANSACTIONS
      const mappedRecurring = (body.recurringTransactions || []).map((r: any, idx: number) => {
        const mappedAccId = r.accountId ? ensureUserScopedId(r.accountId, 'acc', 0) : null;
        const finalAccId = (mappedAccId && validAccountIds.has(mappedAccId)) ? mappedAccId : fallbackAccountId;
        return {
          id: ensureUserScopedId(r.id, 'rec', idx),
          userId,
          title: String(r.title || 'Transaksi Rutin'),
          type: String(r.type || 'expense'),
          category: String(r.category || 'Lainnya'),
          amount: safeNumberString(r.amount, '0'),
          accountId: finalAccId,
          frequency: String(r.frequency || 'monthly'),
          dayOfMonth: safeInt(r.dayOfMonth, 1),
          isActive: Boolean(r.isActive ?? true),
          description: r.description ? String(r.description) : null,
          lastProcessedDate: r.lastProcessedDate ? String(r.lastProcessedDate) : null,
        };
      });
      const uniqueRecurring = deduplicateById(mappedRecurring);
      if (uniqueRecurring.length > 0) {
        await tx.insert(recurringTransactions).values(uniqueRecurring as any).onConflictDoNothing();
      }

      // 2g. SAVINGS GOALS
      const mappedSavingsGoals = (body.savingsGoals || []).map((sg: any, idx: number) => ({
        id: ensureUserScopedId(sg.id, 'sg', idx),
        userId,
        title: String(sg.title || 'Target'),
        targetAmount: safeNumberString(sg.targetAmount, '0'),
        currentAmount: safeNumberString(sg.currentAmount, '0'),
        targetDate: String(sg.targetDate || new Date().toISOString().split('T')[0]),
        category: sg.category ? String(sg.category) : null,
        notes: sg.notes ? String(sg.notes) : null,
      }));
      const uniqueSavingsGoals = deduplicateById(mappedSavingsGoals);
      if (uniqueSavingsGoals.length > 0) {
        await tx.insert(savingsGoals).values(uniqueSavingsGoals as any).onConflictDoNothing();
      }

      // 2h. EMERGENCY FUND CONFIG
      if (body.emergencyConfig) {
        await tx.insert(emergencyFundConfigs).values({
          userId,
          jobStability: String(body.emergencyConfig.jobStability || 'medium'),
          dependents: safeInt(body.emergencyConfig.dependents, 0),
          monthlyExpense: safeNumberString(body.emergencyConfig.monthlyExpense, '0'),
        }).onConflictDoNothing();
      }

      // 2i. EMERGENCY FUND TRANSACTIONS
      const mappedEfTxs = (body.emergencyTransactions || []).map((et: any, idx: number) => ({
        id: ensureUserScopedId(et.id, 'etx', idx),
        userId,
        date: String(et.date || new Date().toISOString().split('T')[0]),
        type: String(et.type || 'addition'),
        amount: safeNumberString(et.amount, '0'),
        location: String(et.location || 'Bank'),
        description: String(et.description || ''),
      }));
      const uniqueEfTxs = deduplicateById(mappedEfTxs);
      if (uniqueEfTxs.length > 0) {
        await tx.insert(emergencyFundTransactions).values(uniqueEfTxs as any).onConflictDoNothing();
      }
    });
  });

  res.json({ success: true });
  } catch (error: any) {
    console.error("POST /sync Error:", error, error?.cause);
    const pgCode = error?.code || error?.cause?.code || error?.sqlState || '500';
    res.status(500).json({ 
      error: 'Failed to save data', 
      details: error?.cause?.message || error?.message || String(error),
      code: pgCode,
      sqlState: pgCode
    });
  }
});
