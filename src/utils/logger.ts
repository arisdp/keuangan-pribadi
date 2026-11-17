const isProductionEnvironment = (): boolean => {
  try {
    if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
      if ((import.meta as any).env.PROD === true || (import.meta as any).env.MODE === 'production') {
        return true;
      }
    }
    if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production') {
      return true;
    }
  } catch {
    // Fallback safely
  }
  return false;
};

const noop = () => {};

const rawConsole = {
  log: typeof console !== 'undefined' ? console.log.bind(console) : noop,
  info: typeof console !== 'undefined' ? console.info.bind(console) : noop,
  warn: typeof console !== 'undefined' ? console.warn.bind(console) : noop,
  error: typeof console !== 'undefined' ? console.error.bind(console) : noop,
  debug: typeof console !== 'undefined' ? console.debug.bind(console) : noop,
};

let isLoggerInitialized = false;

/**
 * Menginisialisasi proteksi logger global.
 * Di lingkungan produksi, seluruh console.log / info / debug / table / dir
 * otomatis dinonaktifkan untuk mencegah kebocoran data aplikasi di konsol browser.
 */
export const initGlobalLogger = (): void => {
  if (isLoggerInitialized) return;
  isLoggerInitialized = true;

  if (isProductionEnvironment() && typeof window !== 'undefined' && typeof window.console !== 'undefined') {
    window.console.log = noop;
    window.console.info = noop;
    window.console.debug = noop;
    window.console.trace = noop;
    window.console.table = noop;
    window.console.dir = noop;
    window.console.group = noop;
    window.console.groupCollapsed = noop;
    window.console.warn = noop;
  }
};

export const logger = {
  log: (...args: unknown[]) => {
    if (!isProductionEnvironment()) rawConsole.log(...args);
  },
  info: (...args: unknown[]) => {
    if (!isProductionEnvironment()) rawConsole.info(...args);
  },
  warn: (...args: unknown[]) => {
    if (!isProductionEnvironment()) rawConsole.warn(...args);
  },
  error: (...args: unknown[]) => {
    if (!isProductionEnvironment()) rawConsole.error(...args);
  },
  debug: (...args: unknown[]) => {
    if (!isProductionEnvironment()) rawConsole.debug(...args);
  },
};
