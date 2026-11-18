const idNumberFormatter = new Intl.NumberFormat('id-ID');

/**
 * Formats a raw number or numeric string into a thousands-separated string using id-ID locale.
 * e.g. 1000000 -> "1.000.000"
 */
export function formatCurrency(value: string | number | null | undefined): string {
  if (value === undefined || value === null || value === '') return '';
  const str = String(value);

  const isNegative = str.startsWith('-');
  const digits = str.replace(/\D/g, '');

  if (!digits) return isNegative ? '-' : '';

  const num = parseInt(digits, 10);
  if (isNaN(num)) return '';

  const formatted = idNumberFormatter.format(num);
  return isNegative ? `-${formatted}` : formatted;
}

/**
 * Parses a input string (with dots/commas/separators) into raw numeric string and number.
 * e.g. "1.000.000" -> { rawString: "1000000", numberValue: 1000000 }
 */
export function parseCurrencyInput(value: string, allowNegative = false): { rawString: string; numberValue: number } {
  const isNegative = allowNegative && value.includes('-');
  const digits = value.replace(/\D/g, '');

  if (!digits) {
    return { rawString: isNegative ? '-' : '', numberValue: 0 };
  }

  const rawString = isNegative ? `-${digits}` : digits;
  const numberValue = parseFloat(rawString) || 0;

  return { rawString, numberValue };
}

export const formatterIDR = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatCurrencyIDR(value: number): string {
  const safeVal = Number.isFinite(value) ? value : 0;
  return formatterIDR.format(safeVal);
}

export function formatShortIDR(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000_000) return `${sign}Rp ${(abs / 1_000_000_000).toFixed(1)}M`;
  if (abs >= 1_000_000) return `${sign}Rp ${(abs / 1_000_000).toFixed(1)}Jt`;
  if (abs >= 1_000) return `${sign}Rp ${(abs / 1_000).toFixed(0)}rb`;
  return `${sign}Rp ${Math.round(abs)}`;
}

