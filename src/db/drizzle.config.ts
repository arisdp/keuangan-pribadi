import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

const connectionUrl =
  process.env.NEON_DATABASE_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  '';

if (!connectionUrl) {
  throw new Error('NEON_DATABASE_URL or DATABASE_URL environment variable is required for Drizzle Kit.');
}

const parsed = new URL(connectionUrl);
const sslMode = (
  process.env.DATABASE_SSL_MODE ||
  parsed.searchParams.get('sslmode') ||
  'require'
).toLowerCase();

export default defineConfig({
  out: './drizzle',
  schema: './src/db/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    host: parsed.hostname,
    port: parsed.port ? parseInt(parsed.port, 10) : 5432,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, '') || 'neondb',
    ssl:
      sslMode === 'disable'
        ? false
        : { rejectUnauthorized: sslMode === 'verify-full' || sslMode === 'verify-ca' },
  },
});

