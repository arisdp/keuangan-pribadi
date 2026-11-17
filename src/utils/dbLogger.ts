export interface DbLogContext {
  action?: string;
  userId?: string;
  username?: string;
  email?: string;
  table?: string;
  [key: string]: any;
}

export interface DbLogEntry {
  id: string;
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  message: string;
  pgErrorCode?: string;
  detail?: string;
  context?: DbLogContext;
}

const recentServerLogs: DbLogEntry[] = [];
const MAX_LOGS = 20;

function pushLog(entry: DbLogEntry) {
  recentServerLogs.unshift(entry);
  if (recentServerLogs.length > MAX_LOGS) {
    recentServerLogs.pop();
  }
}

export const dbLogger = {
  info: (message: string, context?: DbLogContext) => {
    const timestamp = new Date().toISOString();
    const entry: DbLogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp,
      level: 'INFO',
      message,
      context
    };
    pushLog(entry);
    console.log(`[DB INFO ${timestamp}] ${message}`, context ? JSON.stringify(context) : '');
  },

  warn: (message: string, context?: DbLogContext) => {
    const timestamp = new Date().toISOString();
    const entry: DbLogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp,
      level: 'WARN',
      message,
      context
    };
    pushLog(entry);
    console.warn(`[DB WARN ${timestamp}] ${message}`, context ? JSON.stringify(context) : '');
  },

  error: (message: string, error?: any, context?: DbLogContext) => {
    const timestamp = new Date().toISOString();
    const pgErrorCode = error?.code || error?.routine || 'UNKNOWN_ERR';
    const detail = error?.detail || error?.message || String(error);

    let categorizedCause = 'Uncategorized DB Error';
    if (pgErrorCode === '23505') {
      categorizedCause = 'SQL Unique Constraint Violation (Duplicate Key)';
    } else if (pgErrorCode === '23503') {
      categorizedCause = 'Foreign Key Constraint Violation';
    } else if (pgErrorCode === '08006' || pgErrorCode === '57P01' || detail.includes('ECONNREFUSED')) {
      categorizedCause = 'Database Connection Failure';
    }

    const entry: DbLogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp,
      level: 'ERROR',
      message: `${message} (${categorizedCause})`,
      pgErrorCode,
      detail,
      context
    };
    pushLog(entry);

    console.error(`[DB ERROR ${timestamp}] [${categorizedCause}] Code: ${pgErrorCode} - ${message}`, {
      detail,
      context,
      stack: error?.stack,
    });
  },

  getRecentLogs: (limit = 5): DbLogEntry[] => {
    return recentServerLogs.slice(0, limit);
  }
};

