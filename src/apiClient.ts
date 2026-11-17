import { showToast } from './utils/toast';

export const DEFAULT_POSTGRES_PROVIDER = 'Neon PostgreSQL';
export const DEFAULT_POSTGRES_SSL_MODE: PostgresSslMode = 'require';

export type PostgresSslMode = 'disable' | 'allow' | 'prefer' | 'require' | 'verify-ca' | 'verify-full';

export interface PostgresConnectionConfig {
  provider: string;
  configured: boolean;
  host: string;
  port: number;
  database: string;
  username?: string;
  sslMode: PostgresSslMode;
  ssl: false | {
    mode: PostgresSslMode;
    rejectUnauthorized: boolean;
  };
  isPooled?: boolean;
  sanitizedUrl: string;
}

export function parseSecurePostgresConfig(connectionUrl?: string): PostgresConnectionConfig {
  const cleanUrl = (connectionUrl || '').trim();
  if (!cleanUrl) {
    return {
      provider: DEFAULT_POSTGRES_PROVIDER,
      configured: false,
      host: 'neon.tech (server-env)',
      port: 5432,
      database: 'neondb',
      sslMode: DEFAULT_POSTGRES_SSL_MODE,
      ssl: {
        mode: DEFAULT_POSTGRES_SSL_MODE,
        rejectUnauthorized: false,
      },
      isPooled: true,
      sanitizedUrl: 'postgresql://***@ep-xxx.neon.tech/neondb?sslmode=require',
    };
  }

  const parsed = new URL(cleanUrl);
  const rawSslMode = (parsed.searchParams.get('sslmode') || DEFAULT_POSTGRES_SSL_MODE).toLowerCase() as PostgresSslMode;
  const sslEnabled = rawSslMode !== 'disable';
  const isStrictVerify = rawSslMode === 'verify-full' || rawSslMode === 'verify-ca';

  const host = parsed.hostname;
  const port = parsed.port ? parseInt(parsed.port, 10) : 5432;
  const database = parsed.pathname.replace(/^\//, '') || 'neondb';
  const username = decodeURIComponent(parsed.username);

  return {
    provider: DEFAULT_POSTGRES_PROVIDER,
    configured: true,
    host,
    port,
    database,
    username,
    sslMode: rawSslMode,
    ssl: sslEnabled
      ? {
          mode: rawSslMode,
          rejectUnauthorized: isStrictVerify,
        }
      : false,
    isPooled: host.includes('-pooler'),
    sanitizedUrl: `postgresql://${username || '***'}:***@${host}:${port}/${database}?sslmode=${rawSslMode}`,
  };
}

let activePostgresConfig: PostgresConnectionConfig = parseSecurePostgresConfig();

export const getSecureDatabaseConfig = (): PostgresConnectionConfig => activePostgresConfig;

const buildSecureDbHeaders = (extraHeaders: Record<string, string> = {}): Record<string, string> => ({
  'X-Database-Provider': 'neon-postgresql',
  'X-Database-SSL-Mode': activePostgresConfig.sslMode,
  ...extraHeaders,
});

export interface PostgresUserCredentials {
  username?: string;
  email?: string;
  password?: string;
}

export interface HealthCheckResult {
  online: boolean;
  status: 'ok' | 'error' | 'unreachable';
  database: 'connected' | 'disconnected';
  latencyMs: number;
  details?: string;
  provider?: string;
  host?: string;
  port?: number;
  databaseName?: string;
  sslMode?: string;
  sslEnabled?: boolean;
  timestamp: string;
}

export interface ClientLogEntry {
  id: string;
  timestamp: string;
  action: string;
  status: 'SUCCESS' | 'FAILURE' | 'WARNING';
  statusCode?: number;
  message: string;
  details?: string;
  errorCode?: string;
}

const CLIENT_LOGS_KEY = 'nusantara_client_db_logs';
const MAX_CLIENT_LOGS = 20;

export const logClientInteraction = (entry: Omit<ClientLogEntry, 'id' | 'timestamp'>) => {
  try {
    const existingStr = localStorage.getItem(CLIENT_LOGS_KEY);
    const logs: ClientLogEntry[] = existingStr ? JSON.parse(existingStr) : [];
    const newEntry: ClientLogEntry = {
      id: `clog-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      ...entry
    };
    logs.unshift(newEntry);
    if (logs.length > MAX_CLIENT_LOGS) {
      logs.length = MAX_CLIENT_LOGS;
    }
    localStorage.setItem(CLIENT_LOGS_KEY, JSON.stringify(logs));
  } catch {
    // Ignore storage quota errors silently
  }
};

export const getClientInteractionLogs = (): ClientLogEntry[] => {
  try {
    const existingStr = localStorage.getItem(CLIENT_LOGS_KEY);
    return existingStr ? JSON.parse(existingStr) : [];
  } catch {
    return [];
  }
};

export const clearClientInteractionLogs = () => {
  try {
    localStorage.removeItem(CLIENT_LOGS_KEY);
  } catch {}
};

export const fetchServerDbLogs = async (limit = 5) => {
  try {
    const res = await fetch(`/api/db/logs?limit=${limit}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.logs || [];
  } catch {
    return [];
  }
};

export interface ColumnInfo {
  column_name: string;
  data_type: string;
  is_nullable?: string;
  column_default?: string | null;
}

export interface TableSchemaResult {
  success: boolean;
  tableName: string;
  columns: ColumnInfo[];
  error?: string;
  details?: string;
}

export const checkTableSchema = async (tableName = 'users'): Promise<TableSchemaResult> => {
  try {
    const res = await fetch(`/api/db/schema?table=${encodeURIComponent(tableName)}`);
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Server HTTP ${res.status}: ${errText}`);
    }
    const data: TableSchemaResult = await res.json();
    return data;
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    return {
      success: false,
      tableName,
      columns: [],
      error: 'Failed to inspect table schema',
      details: errMsg
    };
  }
};

export interface UsersInspectionResult {
  success: boolean;
  rows: any[];
  rowCount: number;
  fields: string[];
  error?: string;
  details?: string;
}

export const fetchUsersInspection = async (): Promise<UsersInspectionResult> => {
  try {
    const res = await fetch('/api/db/inspect-users');
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Server HTTP ${res.status}: ${errText}`);
    }
    const data: UsersInspectionResult = await res.json();
    return data;
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    return {
      success: false,
      rows: [],
      rowCount: 0,
      fields: [],
      error: 'Failed to inspect users records',
      details: errMsg
    };
  }
};

export const fixUsersSchema = async (): Promise<{ success: boolean; message: string; details?: string }> => {
  try {
    const res = await fetch('/api/db/fix-users-schema', { method: 'POST' });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.details || data.error || `HTTP ${res.status}`);
    }
    return data;
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    return {
      success: false,
      message: 'Gagal memperbarui skema database',
      details: errMsg
    };
  }
};

export const rebuildDatabaseSchema = async (): Promise<{ success: boolean; message: string; details?: string }> => {
  try {
    const res = await fetch('/api/db/rebuild-schema', { method: 'POST' });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.details || data.error || `HTTP ${res.status}`);
    }
    return data;
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    return {
      success: false,
      message: 'Gagal membuat ulang skema database',
      details: errMsg
    };
  }
};

export const checkPostgresHealth = async (): Promise<HealthCheckResult> => {
  const startTime = Date.now();
  if (!navigator.onLine) {
    const offlineResult: HealthCheckResult = {
      online: false,
      status: 'unreachable',
      database: 'disconnected',
      latencyMs: 0,
      details: 'Perangkat tidak terhubung ke jaringan internet (Offline).',
      timestamp: new Date().toISOString()
    };
    logClientInteraction({
      action: 'PING /api/db/health',
      status: 'FAILURE',
      message: 'Network offline',
      details: offlineResult.details,
      errorCode: 'OFFLINE'
    });
    return offlineResult;
  }

  try {
    const res = await fetch('/api/db/health', {
      method: 'GET',
      cache: 'no-store',
      headers: buildSecureDbHeaders(),
    });
    const latencyMs = Date.now() - startTime;
    let data: any = {};
    try {
      data = await res.json();
    } catch {
      data = {};
    }

    const connInfo = data.connection || activePostgresConfig;
    if (data.connection) {
      activePostgresConfig = {
        ...activePostgresConfig,
        provider: connInfo.provider || DEFAULT_POSTGRES_PROVIDER,
        configured: Boolean(connInfo.configured ?? true),
        host: connInfo.host || activePostgresConfig.host,
        port: connInfo.port || activePostgresConfig.port,
        database: connInfo.database || activePostgresConfig.database,
        sslMode: (connInfo.sslMode || DEFAULT_POSTGRES_SSL_MODE) as PostgresSslMode,
        isPooled: Boolean(connInfo.isPooled),
        sanitizedUrl: `postgresql://***@${connInfo.host || 'neon.tech'}:${connInfo.port || 5432}/${connInfo.database || 'neondb'}?sslmode=${connInfo.sslMode || DEFAULT_POSTGRES_SSL_MODE}`,
      };
    }

    if (res.ok && data.status === 'ok') {
      const okResult: HealthCheckResult = {
        online: true,
        status: 'ok',
        database: 'connected',
        latencyMs,
        provider: connInfo.provider || DEFAULT_POSTGRES_PROVIDER,
        host: connInfo.host || activePostgresConfig.host,
        port: connInfo.port || activePostgresConfig.port,
        databaseName: connInfo.database || activePostgresConfig.database,
        sslMode: connInfo.sslMode || activePostgresConfig.sslMode,
        sslEnabled: connInfo.sslEnabled ?? true,
        details: `Koneksi ke server API dan ${connInfo.provider || DEFAULT_POSTGRES_PROVIDER} (${connInfo.host || 'neon.tech'}, SSL: ${connInfo.sslMode || DEFAULT_POSTGRES_SSL_MODE}) berjalan normal.`,
        timestamp: data.timestamp || new Date().toISOString()
      };
      logClientInteraction({
        action: 'PING /api/db/health',
        status: 'SUCCESS',
        statusCode: res.status,
        message: `Koneksi ${connInfo.provider || DEFAULT_POSTGRES_PROVIDER} normal`,
        details: `Host: ${okResult.host}:${okResult.port}/${okResult.databaseName} | SSL: ${okResult.sslMode} | Latency: ${latencyMs}ms`
      });
      return okResult;
    } else {
      const errResult: HealthCheckResult = {
        online: true,
        status: 'error',
        database: 'disconnected',
        latencyMs,
        provider: connInfo.provider || DEFAULT_POSTGRES_PROVIDER,
        host: connInfo.host || activePostgresConfig.host,
        port: connInfo.port || activePostgresConfig.port,
        databaseName: connInfo.database || activePostgresConfig.database,
        sslMode: connInfo.sslMode || activePostgresConfig.sslMode,
        sslEnabled: connInfo.sslEnabled ?? true,
        details: data.details || data.error || `Server HTTP ${res.status}: Gagal terhubung ke database.`,
        timestamp: new Date().toISOString()
      };
      logClientInteraction({
        action: 'PING /api/db/health',
        status: 'FAILURE',
        statusCode: res.status,
        message: 'Database server offline/terputus',
        details: errResult.details,
        errorCode: `HTTP_${res.status}`
      });
      return errResult;
    }
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    const failResult: HealthCheckResult = {
      online: true,
      status: 'unreachable',
      database: 'disconnected',
      latencyMs,
      details: `Koneksi jaringan ke backend server terputus: ${err?.message || 'Network error'}`,
      timestamp: new Date().toISOString()
    };
    logClientInteraction({
      action: 'PING /api/db/health',
      status: 'FAILURE',
      message: 'Server unreachable',
      details: failResult.details,
      errorCode: 'FETCH_FAILED'
    });
    return failResult;
  }
};

export const loginUserPostgres = async (credentials: PostgresUserCredentials) => {
  let res: Response;
  const usernameOrEmail = credentials.username || credentials.email || 'unknown';

  try {
    res = await fetch('/api/db/auth/login', {
      method: 'POST',
      headers: buildSecureDbHeaders({
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify(credentials),
    });
  } catch (netErr: any) {
    logClientInteraction({
      action: `POST /api/db/auth/login [${usernameOrEmail}]`,
      status: 'FAILURE',
      message: 'Jaringan terputus saat login',
      details: netErr?.message || 'Network error',
      errorCode: 'NET_ERROR'
    });
    throw new Error('Gagal terhubung ke server. Periksa koneksi internet atau status server database.');
  }

  let data: any = {};
  try {
    data = await res.json();
  } catch {
    data = { error: 'Format respon dari server tidak valid' };
  }

  if (!res.ok) {
    const errorMsg = data.error || data.details || 'Gagal verifikasi kredensial PostgreSQL';
    logClientInteraction({
      action: `POST /api/db/auth/login [${usernameOrEmail}]`,
      status: 'FAILURE',
      statusCode: res.status,
      message: errorMsg,
      details: data.details || `Server response code: ${res.status}`,
      errorCode: res.status === 500 ? 'DB_QUERY_ERR' : `HTTP_${res.status}`
    });

    const errObj: any = new Error(res.status === 500 ? `[Database Error] ${errorMsg}` : errorMsg);
    errObj.details = data.details || '';
    throw errObj;
  }

  logClientInteraction({
    action: `POST /api/db/auth/login [${usernameOrEmail}]`,
    status: 'SUCCESS',
    statusCode: res.status,
    message: `Login pengguna '${data.user?.username || usernameOrEmail}' berhasil`
  });

  return data;
};

export const registerUserPostgres = async (userData: { username: string; password?: string; email?: string; fullName: string }) => {
  let res: Response;
  try {
    res = await fetch('/api/db/auth/register', {
      method: 'POST',
      headers: buildSecureDbHeaders({
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify(userData),
    });
  } catch (netErr: any) {
    logClientInteraction({
      action: `POST /api/db/auth/register [${userData.username}]`,
      status: 'FAILURE',
      message: 'Koneksi terputus saat pendaftaran',
      details: netErr?.message || 'Network error',
      errorCode: 'NET_ERROR'
    });
    throw new Error('Koneksi terputus. Tidak dapat terhubung ke server database.');
  }

  let data: any = {};
  try {
    data = await res.json();
  } catch {
    data = { error: 'Gagal memproses respon dari server' };
  }

  if (!res.ok) {
    const errorMsg = data.error || data.details || 'Gagal mendaftar pengguna PostgreSQL';
    logClientInteraction({
      action: `POST /api/db/auth/register [${userData.username}]`,
      status: 'FAILURE',
      statusCode: res.status,
      message: errorMsg,
      details: data.details || `Server response code: ${res.status}`,
      errorCode: res.status === 500 ? 'DB_QUERY_ERR' : `HTTP_${res.status}`
    });

    if (res.status === 500) {
      throw new Error(`[Database Error] ${errorMsg}`);
    }
    throw new Error(errorMsg);
  }

  logClientInteraction({
    action: `POST /api/db/auth/register [${userData.username}]`,
    status: 'SUCCESS',
    statusCode: res.status,
    message: `Pendaftaran pengguna '${userData.username}' berhasil`
  });

  return data;
};

export const requestForgotPasswordPostgres = async (identifier: string) => {
  let res: Response;
  try {
    res = await fetch('/api/db/auth/forgot-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ identifier }),
    });
  } catch (netErr: any) {
    logClientInteraction({
      action: `POST /api/db/auth/forgot-password [${identifier}]`,
      status: 'FAILURE',
      message: 'Gagal jaringan saat reset password',
      details: netErr?.message,
      errorCode: 'NET_ERROR'
    });
    throw new Error('Gagal terhubung ke server. Periksa jaringan Anda.');
  }

  let data: any = {};
  try {
    data = await res.json();
  } catch {
    data = { error: 'Format respon server tidak valid' };
  }

  if (!res.ok) {
    const errorMsg = data.error || data.details || 'Gagal memproses permintaan reset password';
    logClientInteraction({
      action: `POST /api/db/auth/forgot-password [${identifier}]`,
      status: 'FAILURE',
      statusCode: res.status,
      message: errorMsg,
      details: data.details,
      errorCode: `HTTP_${res.status}`
    });
    throw new Error(errorMsg);
  }

  logClientInteraction({
    action: `POST /api/db/auth/forgot-password [${identifier}]`,
    status: 'SUCCESS',
    statusCode: res.status,
    message: `Permintaan reset password dikirim untuk '${identifier}'`
  });

  return data;
};

export const syncToPostgres = async (data: any, userId: string) => {
  if (!userId || typeof userId !== 'string' || !userId.trim()) {
    return { success: false, fallback: true, error: 'User ID is missing' };
  }

  const cleanUserId = userId.trim();
  const LOCAL_STORAGE_KEY = `nusantara_wealth_backup_${cleanUserId}`;

  // Enforce valid userId association across accounts and all child data collections
  const sanitizedData = { ...data };
  if (Array.isArray(sanitizedData.accounts)) {
    sanitizedData.accounts = sanitizedData.accounts.map((acc: any) => ({
      ...acc,
      userId: acc.userId && String(acc.userId).trim() ? String(acc.userId).trim() : cleanUserId
    }));
  }
  if (Array.isArray(sanitizedData.transactions)) {
    sanitizedData.transactions = sanitizedData.transactions.map((t: any) => ({
      ...t,
      userId: t.userId && String(t.userId).trim() ? String(t.userId).trim() : cleanUserId
    }));
  }
  
  // Always save a copy to localStorage as resilient offline backup
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({
      ...sanitizedData,
      _lastUpdated: new Date().toISOString()
    }));
  } catch {
    // Ignore LocalStorage write quota error silently
  }

  // Exponential backoff retry mechanism with error classification
  const maxRetries = 3;
  let attempt = 0;
  let lastErrorMsg = '';

  while (attempt <= maxRetries) {
    try {
      if (attempt > 0) {
        const backoffDelay = Math.pow(2, attempt - 1) * 1000;
        await new Promise((resolve) => setTimeout(resolve, backoffDelay));
      }

      const res = await fetch('/api/db/sync', {
        method: 'POST',
        headers: buildSecureDbHeaders({
          'Content-Type': 'application/json',
          'X-User-Id': cleanUserId
        }),
        body: JSON.stringify(sanitizedData)
      });

      if (!res.ok) {
        let errData: any = {};
        let rawText = '';
        try {
          rawText = await res.text();
          errData = JSON.parse(rawText);
        } catch {
          errData = { details: rawText || `HTTP ${res.status}` };
        }

        const details = errData.details || errData.error || rawText || `HTTP ${res.status}`;
        const sqlState = String(errData.sqlState || errData.code || `HTTP_${res.status}`);
        lastErrorMsg = `Server HTTP ${res.status}: ${details}`;

        const isSchemaError = 
          ['42703', '42P01', '23502', '23505', '22P02', '42000'].includes(sqlState) ||
          /column|relation|schema|does not exist|table|constraint/i.test(details);

        const isConnectionError = 
          ['08000', '08001', '08003', '08006', '57P01', '57P02', '57P03'].includes(sqlState) ||
          /terminated|connection|CLOSED|ECONNREFUSED|ECONNRESET|ETIMEDOUT|timeout/i.test(details) ||
          res.status >= 500;

        if (isSchemaError) {
          logClientInteraction({
            action: 'POST /api/db/sync',
            status: 'FAILURE',
            statusCode: res.status,
            message: 'Database Schema Error',
            details: `SQL State [${sqlState}]`,
            errorCode: `SCHEMA_ERR_${sqlState}`
          });

          showToast({
            type: 'warning',
            title: `Kesalahan Skema Database (SQL ${sqlState})`,
            message: `[Error ${sqlState}]: ${details}. Data aman tersimpan di cadangan lokal.`,
            duration: 6000
          });

          return { success: false, fallback: true, error: lastErrorMsg, isSchemaError: true, sqlState };
        }

        if (isConnectionError) {
          logClientInteraction({
            action: 'POST /api/db/sync',
            status: 'WARNING',
            statusCode: res.status,
            message: 'Koneksi DB terputus / error transient',
            details: `SQL State [${sqlState}]`,
            errorCode: `CONN_ERR_${sqlState}`
          });

          if (attempt < maxRetries) {
            attempt++;
            try {
              await checkPostgresHealth();
            } catch {}
            continue;
          }
        }

        showToast({
          type: 'warning',
          title: `Mode Cadangan Lokal (SQL ${sqlState})`,
          message: `Gagal sinkron [SQL ${sqlState}]: ${details}. Data tersimpan di perangkat.`,
          duration: 5000
        });

        return { success: false, fallback: true, error: lastErrorMsg, sqlState };
      }

      logClientInteraction({
        action: 'POST /api/db/sync',
        status: 'SUCCESS',
        statusCode: res.status,
        message: 'Data berhasil disinkronisasi ke Neon PostgreSQL'
      });
      
      if (attempt > 0) {
        showToast({
          type: 'success',
          title: 'Koneksi Server Pulih',
          message: 'Data berhasil disinkronkan ke Neon PostgreSQL setelah reconnect/retry.',
          duration: 3500
        });
      }

      return { success: true, fallback: false };
    } catch (error: any) {
      const errorDetails = error?.message || String(error);
      const sqlState = String(error?.code || 'FETCH_NET_ERR');
      lastErrorMsg = errorDetails;

      if (attempt < maxRetries) {
        attempt++;
        try {
          await checkPostgresHealth();
        } catch {}
        continue;
      }

      logClientInteraction({
        action: 'POST /api/db/sync',
        status: 'FAILURE',
        message: 'Gagal koneksi sinkronisasi cloud DB, beralih ke cadangan lokal',
        details: `SQL State [${sqlState}]`,
        errorCode: 'NET_CONN_ERROR'
      });
      
      showToast({
        type: 'error',
        title: `Gagal Koneksi Cloud (${sqlState})`,
        message: `[Error ${sqlState}]: ${errorDetails}. Beroperasi dengan cadangan lokal.`,
        duration: 5000
      });

      return { success: false, fallback: true, error: lastErrorMsg, sqlState };
    }
  }

  return { success: false, fallback: true, error: lastErrorMsg };
};

export const syncFromPostgres = async (userId: string) => {
  const LOCAL_STORAGE_KEY = `nusantara_wealth_backup_${userId}`;

  try {
    const res = await fetch('/api/db/sync', {
      headers: buildSecureDbHeaders({
        'X-User-Id': userId
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Server returned HTTP ${res.status}: ${errText || 'DB Query Failed'}`);
    }

    const data = await res.json();

    logClientInteraction({
      action: 'GET /api/db/sync',
      status: 'SUCCESS',
      statusCode: res.status,
      message: 'Berhasil mengunduh data dari Neon PostgreSQL'
    });

    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({
        ...data,
        _lastUpdated: new Date().toISOString()
      }));
    } catch {}

    return data;
  } catch (error: any) {
    const errorMsg = error?.message || 'Database sync query failed';

    logClientInteraction({
      action: 'GET /api/db/sync',
      status: 'FAILURE',
      message: 'Gagal mengunduh data cloud DB, memulihkan cadangan lokal',
      details: errorMsg,
      errorCode: 'SYNC_FETCH_FAILED'
    });
    
    try {
      const cachedStr = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (cachedStr) {
        const cachedData = JSON.parse(cachedStr);
        
        logClientInteraction({
          action: 'RESTORE_CACHE',
          status: 'SUCCESS',
          message: 'Berhasil memulihkan data lokal pengguna dari LocalStorage',
          details: `Diperbarui pada: ${cachedData._lastUpdated || 'Sebelumnya'}`
        });

        return {
          ...cachedData,
          _restoredFromCache: true,
          _syncErrorMessage: errorMsg
        };
      }
    } catch (restoreErr: any) {
      logClientInteraction({
        action: 'RESTORE_CACHE',
        status: 'FAILURE',
        message: 'Gagal membaca cadangan LocalStorage',
        details: restoreErr?.message,
        errorCode: 'CACHE_PARSE_ERROR'
      });
    }

    return null;
  }
};


