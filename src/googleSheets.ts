import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import config from '../firebase-applet-config.json';
import { UserFinancialData, User } from './types';

const app = initializeApp(config);
const auth = getAuth(app);

let accessToken: string | null = null;
let spreadsheetId: string | null = null;

export function loadGoogleIdentityServices(): Promise<void> {
  return Promise.resolve();
}

export async function loginWithGoogleSheets(): Promise<User> {
  const provider = new GoogleAuthProvider();
  provider.addScope('https://www.googleapis.com/auth/spreadsheets');
  provider.addScope('https://www.googleapis.com/auth/drive.file');

  try {
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Gagal mendapatkan token akses dari Google Auth.');
    }
    accessToken = credential.accessToken;
    
    return {
      username: result.user.email || 'user@example.com',
      fullName: result.user.displayName || 'Pengguna Google',
      isPremium: true
    };
  } catch (error: any) {
    console.error('Firebase sign-in error:', error);
    throw new Error(error?.message || 'Gagal login via Firebase Auth.');
  }
}

export function logoutGoogleSheets() {
  signOut(auth).catch(err => console.error('Gagal sign out Firebase:', err));
  accessToken = null;
  spreadsheetId = null;
}

export function isGoogleSheetsSyncActive(): boolean {
  return accessToken !== null;
}

// Find or create spreadsheet
async function getSpreadsheetId(): Promise<string> {
  if (spreadsheetId) return spreadsheetId;
  if (!accessToken) throw new Error("Not authenticated with Google Workspace");

  // Search for existing file
  const query = encodeURIComponent("name = 'Nusantara Wealth Data' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false");
  const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&spaces=drive`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const searchData = await searchRes.json();

  if (searchData.files && searchData.files.length > 0) {
    spreadsheetId = searchData.files[0].id;
    return spreadsheetId!;
  }

  // Create new spreadsheet
  const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      properties: {
        title: 'Nusantara Wealth Data'
      },
      sheets: [
        {
          properties: {
            title: 'Sheet1'
          }
        }
      ]
    })
  });
  const createData = await createRes.json();
  spreadsheetId = createData.spreadsheetId;
  return spreadsheetId!;
}

export async function uploadFinancesToSheets(data: UserFinancialData): Promise<void> {
  if (!accessToken) return;
  const sheetId = await getSpreadsheetId();
  
  // Store the JSON data in chunks to avoid the 50,000 character limit per cell
  const jsonString = JSON.stringify({
    ...data,
    updatedAt: new Date().toISOString()
  });

  // Chunk string into 40,000 character pieces
  const chunkSize = 40000;
  const chunks = [];
  for (let i = 0; i < jsonString.length; i += chunkSize) {
    chunks.push([jsonString.slice(i, i + chunkSize)]);
  }

  // Clear previous data first in case the new data is smaller
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Sheet1!A:A:clear`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Sheet1!A1?valueInputOption=RAW`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      range: 'Sheet1!A1',
      majorDimension: 'ROWS',
      values: chunks
    })
  });
}

export async function downloadFinancesFromSheets(): Promise<UserFinancialData | null> {
  if (!accessToken) return null;
  const sheetId = await getSpreadsheetId();
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Sheet1!A:A`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const data = await res.json();
  
  if (data.values && data.values.length > 0) {
    try {
      // Reassemble chunks
      const fullJsonString = data.values.map((row: string[]) => row[0]).join('');
      const parsedData = JSON.parse(fullJsonString);
      // Remove updatedAt wrapper
      delete parsedData.updatedAt;
      return parsedData as UserFinancialData;
    } catch (e) {
      console.error("Failed to parse Sheets data:", e);
      return null;
    }
  }
  return null;
}
