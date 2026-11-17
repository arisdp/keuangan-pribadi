const ENCRYPTION_PREFIX = 'NW_ENC_V1:';
const SECRET_SALT = 'NusantaraWealth#2026!VaultKey';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const getDerivedKeyBytes = (): Uint8Array => {
  const originPart = typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : 'nusantara-wealth-app';
  return textEncoder.encode(`${SECRET_SALT}::${originPart}`);
};

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
};

const base64ToBytes = (base64: string): Uint8Array => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

/**
 * Mengenkripsi string plaintext menggunakan rolling XOR cipher + UTF-8 Base64.
 */
export const encryptStorageValue = (plainText: string): string => {
  if (!plainText) return plainText;
  try {
    const inputBytes = textEncoder.encode(plainText);
    const keyBytes = getDerivedKeyBytes();
    const outBytes = new Uint8Array(inputBytes.length);

    for (let i = 0; i < inputBytes.length; i++) {
      const keyByte = keyBytes[i % keyBytes.length];
      const mix = (i * 31 + keyByte) & 0xff;
      outBytes[i] = inputBytes[i] ^ keyByte ^ mix;
    }

    return `${ENCRYPTION_PREFIX}${bytesToBase64(outBytes)}`;
  } catch {
    return plainText;
  }
};

/**
 * Mendekripsi string terenkripsi dari LocalStorage.
 * Mendukung fallback aman jika data lama belum terenkripsi.
 */
export const decryptStorageValue = (storedValue: string): string => {
  if (!storedValue || !storedValue.startsWith(ENCRYPTION_PREFIX)) {
    return storedValue;
  }

  try {
    const payload = storedValue.slice(ENCRYPTION_PREFIX.length);
    const cipherBytes = base64ToBytes(payload);
    const keyBytes = getDerivedKeyBytes();
    const outBytes = new Uint8Array(cipherBytes.length);

    for (let i = 0; i < cipherBytes.length; i++) {
      const keyByte = keyBytes[i % keyBytes.length];
      const mix = (i * 31 + keyByte) & 0xff;
      outBytes[i] = cipherBytes[i] ^ keyByte ^ mix;
    }

    return textDecoder.decode(outBytes);
  } catch {
    return storedValue;
  }
};

/**
 * Pembungkus LocalStorage terenkripsi untuk melindungi data keuangan di perangkat publik.
 */
export const secureStorage = {
  getItem(key: string): string | null {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return null;
      const raw = window.localStorage.getItem(key);
      if (raw === null) return null;
      return decryptStorageValue(raw);
    } catch {
      return null;
    }
  },

  setItem(key: string, value: string): void {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      const encrypted = encryptStorageValue(value);
      window.localStorage.setItem(key, encrypted);
    } catch {
      // Abaikan error kuota penyimpanan secara aman
    }
  },

  removeItem(key: string): void {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      window.localStorage.removeItem(key);
    } catch {
      // Abaikan
    }
  },

  getJSON<T>(key: string, fallback: T): T {
    try {
      const decrypted = this.getItem(key);
      if (!decrypted) return fallback;
      return JSON.parse(decrypted) as T;
    } catch {
      return fallback;
    }
  },

  setJSON<T>(key: string, data: T): void {
    try {
      this.setItem(key, JSON.stringify(data));
    } catch {
      // Abaikan
    }
  },
};
