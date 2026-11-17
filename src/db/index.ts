import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import fs from 'fs';
import * as schema from './schema';

const { Pool } = pg;

export type PostgresSslMode = 'disable' | 'allow' | 'prefer' | 'require' | 'verify-ca' | 'verify-full';

export interface DbConnectionMetadata {
  provider: string;
  configured: boolean;
  host: string;
  port: number;
  database: string;
  sslMode: PostgresSslMode;
  sslEnabled: boolean;
  rejectUnauthorized: boolean;
  isPooled: boolean;
}

function resolveOptionalCaCert(): string | undefined {
  const rawCa = process.env.DATABASE_SSL_CA || process.env.PGSSLROOTCERT;
  if (!rawCa) return undefined;
  const trimmed = rawCa.trim();
  if (trimmed.includes('BEGIN CERTIFICATE')) {
    return trimmed;
  }
  if (fs.existsSync(trimmed)) {
    return fs.readFileSync(trimmed, 'utf8');
  }
  return undefined;
}

export function resolveNeonConnectionUrl(): string {
  const candidates = [
    process.env.NEON_DATABASE_URL,
    process.env.DATABASE_URL,
    process.env.POSTGRES_URL,
    process.env.POSTGRES_PRISMA_URL,
  ];

  for (const candidate of candidates) {
    if (candidate && candidate.trim()) {
      return candidate.trim();
    }
  }
  return '';
}

export function buildNeonPoolConfig(connectionUrl: string): {
  poolConfig: pg.PoolConfig;
  metadata: DbConnectionMetadata;
} {
  if (!connectionUrl) {
    return {
      poolConfig: {
        max: 1,
        connectionTimeoutMillis: 3000,
      },
      metadata: {
        provider: 'Neon PostgreSQL',
        configured: false,
        host: 'unconfigured',
        port: 5432,
        database: 'neondb',
        sslMode: 'require',
        sslEnabled: true,
        rejectUnauthorized: false,
        isPooled: false,
      },
    };
  }

  const parsed = new URL(connectionUrl);
  const rawSslMode = (
    process.env.DATABASE_SSL_MODE ||
    parsed.searchParams.get('sslmode') ||
    'require'
  ).toLowerCase() as PostgresSslMode;

  const caCert = resolveOptionalCaCert();
  const isStrictVerify =
    rawSslMode === 'verify-full' ||
    rawSslMode === 'verify-ca' ||
    process.env.DATABASE_SSL_STRICT === 'true';
  const sslEnabled = rawSslMode !== 'disable';
  const rejectUnauthorized = isStrictVerify ? true : Boolean(caCert);

  const sslConfig: pg.PoolConfig['ssl'] = sslEnabled
    ? {
        rejectUnauthorized,
        ...(caCert ? { ca: caCert } : {}),
      }
    : false;

  const host = parsed.hostname;
  const port = parsed.port ? parseInt(parsed.port, 10) : 5432;
  const database = parsed.pathname.replace(/^\//, '') || 'neondb';
  const user = decodeURIComponent(parsed.username);
  const password = decodeURIComponent(parsed.password);
  const isPooled = host.includes('-pooler');

  const poolConfig: pg.PoolConfig = {
    host,
    port,
    database,
    user,
    password,
    ssl: sslConfig,
    // Neon serverless compute auto-suspends after inactivity; allow up to 15s for cold wake-up
    // and release idle clients after 20s so Neon can scale to zero cleanly.
    max: 10,
    idleTimeoutMillis: 20000,
    connectionTimeoutMillis: 15000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
  };

  const metadata: DbConnectionMetadata = {
    provider: 'Neon PostgreSQL',
    configured: true,
    host,
    port,
    database,
    sslMode: rawSslMode,
    sslEnabled,
    rejectUnauthorized,
    isPooled,
  };

  return { poolConfig, metadata };
}

const activeConnectionUrl = resolveNeonConnectionUrl();
const { poolConfig, metadata: dbConnectionMetadata } = buildNeonPoolConfig(activeConnectionUrl);

export const isDatabaseConfigured = dbConnectionMetadata.configured;

if (isDatabaseConfigured) {
  console.log(
    `[DB] Initializing ${dbConnectionMetadata.provider} pool -> ${dbConnectionMetadata.host}:${dbConnectionMetadata.port}/${dbConnectionMetadata.database} (pooled=${dbConnectionMetadata.isPooled}, sslmode=${dbConnectionMetadata.sslMode})`
  );
} else {
  console.warn(
    '[DB] NEON_DATABASE_URL / DATABASE_URL is not set yet. Set your Neon PostgreSQL connection string in environment/Secrets.'
  );
}

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.warn('[DB Pool Warning] Neon connection reset or idle client error:', err?.message || err);
});

export const db = drizzle({ client: pool, schema });
export { pool, dbConnectionMetadata };

