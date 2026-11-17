export interface EncryptedBackupPayload {
  version: string;
  app: string;
  exportDate: string;
  username?: string;
  encrypted: boolean;
  algorithm: string;
  salt: string;
  iv: string;
  ciphertext: string;
}

function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBuffer(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function encryptBackupData(
  dataObj: object,
  passphrase: string,
  username?: string
): Promise<EncryptedBackupPayload> {
  const enc = new TextEncoder();
  const jsonStr = JSON.stringify(dataObj);
  const dataBytes = enc.encode(jsonStr);

  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  const derivedKey = await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );

  const ciphertextBuf = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    derivedKey,
    dataBytes
  );

  return {
    version: '1.0',
    app: 'Nusantara Wealth',
    exportDate: new Date().toISOString(),
    username,
    encrypted: true,
    algorithm: 'AES-GCM-256-PBKDF2',
    salt: bufferToBase64(salt.buffer),
    iv: bufferToBase64(iv.buffer),
    ciphertext: bufferToBase64(ciphertextBuf),
  };
}

export async function decryptBackupData(
  payload: EncryptedBackupPayload,
  passphrase: string
): Promise<any> {
  if (!payload.encrypted || !payload.ciphertext || !payload.salt || !payload.iv) {
    throw new Error('Format file backup tidak valid atau tidak terenkripsi.');
  }

  const enc = new TextEncoder();
  const dec = new TextDecoder();

  const salt = base64ToBuffer(payload.salt);
  const iv = base64ToBuffer(payload.iv);
  const ciphertext = base64ToBuffer(payload.ciphertext);

  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  const derivedKey = await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );

  try {
    const decryptedBuf = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      derivedKey,
      ciphertext
    );
    const jsonStr = dec.decode(decryptedBuf);
    return JSON.parse(jsonStr);
  } catch (err) {
    throw new Error('Kata sandi enkripsi salah atau file terkorupsi.');
  }
}
