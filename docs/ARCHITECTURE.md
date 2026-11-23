# Arsitektur Sistem Nusantara Wealth

Dokumen ini menjelaskan arsitektur teknis menyeluruh dari **Nusantara Wealth** — bagaimana frontend React, state terpusat di `src/App.tsx`, persistensi lokal terenkripsi, sinkronisasi Neon PostgreSQL, Google Sheets/Firebase, Gemini AI, dan PWA Service Worker saling terhubung.

---

## 1. Gambaran Umum Arsitektur Full-Stack

Nusantara Wealth menggunakan arsitektur **Single-Origin Full-Stack** yang dilayani pada **port 3000** melalui `server.ts`:

```text
+-------------------------------------------------------------------------+
| Browser / PWA Client (React 19 + Vite SPA + D3 + Recharts + Tailwind)   |
|  ├── src/main.tsx        -> initGlobalLogger + register('/sw.js')       |
|  ├── src/ThemeContext.tsx -> Light mode enforcement                     |
|  ├── src/App.tsx         -> Central Financial State + Handlers + Sync   |
|  ├── src/utils/          -> accountingEngine, secureStorage, crypto     |
|  └── src/components/     -> 50 UI & Analytics Components                |
+------------------------------------+------------------------------------+
                                     | HTTP JSON / Bearer / X-User-Id
                                     v
+-------------------------------------------------------------------------+
| Express Server (`server.ts`, Port 3000)                                 |
|  ├── Development: vite.middlewares (HMR disabled / SPA fallback)        |
|  ├── Production : express.static('dist/') + SPA index.html fallback     |
|  ├── /api/health & /api/firebase-config                                 |
|  ├── /api/analyze*, /api/detect-anomalies, /api/savings-projection, ... |
|  │     └── @google/genai (gemini-2.5-flash & gemini-4-hydrogen)         |
|  └── /api/db/* (`src/server/api.ts`)                                    |
|        └── Drizzle ORM + pg Pool (`src/db/index.ts`, `src/db/schema.ts`)|
+------------------------------------+------------------------------------+
                                     | SSL (sslmode=require)
                                     v
+-------------------------------------------------------------------------+
| Neon PostgreSQL (13 User-Scoped Financial Tables)                       |
+-------------------------------------------------------------------------+
```

---

## 2. Alur Inisialisasi Aplikasi (`src/main.tsx` & `src/App.tsx`)

1. **`src/main.tsx`**:
   - Memanggil `initGlobalLogger()` (`src/utils/logger.ts`) untuk menekan output `console.log`/`debug`/`info` pada environment non-dev.
   - Mendaftarkan `/sw.js` saat event `window.load` bila browser mendukung `navigator.serviceWorker`.
   - Membungkus `<App />` dengan `<ThemeProvider>` (`src/ThemeContext.tsx`) yang mengunci kelas dokumen ke mode terang (`light`).
2. **State Autentikasi & Sesi (`src/App.tsx`)**:
   - Memeriksa pengguna aktif di `secureStorage` (`currentUser`). Jika belum login, merender `<LoginScreen />`.
   - Ketika pengguna login (baik via Neon PostgreSQL `/api/db/auth/*`, akun demo `user-ariesd`, mode Google Sheets, atau mode Guest lokal), `App.tsx` menentukan kunci isolasi penyimpanan `userId`.
3. **Pemuatan Data & Validasi Integritas Master**:
   - Memuat data lokal terenkripsi per-pengguna via `secureStorage` (akun, transaksi, transaksi rutin, anggaran, utang, dana darurat, investasi, aset tetap, target tabungan, master kategori, master COA, serta preset & mapping KPR).
   - Menjalankan `validateMasterIntegrityOnLoad()` (`src/coaUtils.ts`) dan `synchronizeAccountsAndCOA()` untuk memastikan akun & COA selaras.
   - Menjalankan `syncKprDebtsToFixedAssets()` (`src/utils/accountingEngine.ts`) untuk menyinkronkan nilai ekuitas properti KPR terhadap sisa pokok utang KPR.
   - Menjalankan `scanCoaDuplicatesAndUnused()` untuk menghitung indikator lencana **Audit Akuntansi** pada header aplikasi.
   - Jika PostgreSQL/Google Sheets aktif, memicu penarikan data awal (`syncFromPostgres` atau `downloadFinancesFromSheets`) dan membandingkannya dengan data lokal menggunakan `detectDataConflict()` (`src/utils/syncConflictDetector.ts`).

---

## 3. Struktur Navigasi & State Terpusat (`src/App.tsx`)

Seluruh menu sidebar dan drawer mobile diatur oleh konstanta `NAV_GROUPS` di `src/App.tsx`:

| Grup Navigasi (`groupName`) | ID Tab (`activeTab`) | Label Menu | Komponen Utama |
| :--- | :--- | :--- | :--- |
| **Ringkasan & Analisis** | `dashboard` | Dashboard Utama | `DashboardTab` |
| | `ai-analysis` | Asisten Cerdas AI (`AI`) | `AiAnalysisTab` |
| | `reports` | Laporan & Akuntansi | `ReportsTab` |
| **Operasional Harian** | `transactions` | Jurnal Transaksi | `TransactionsTab` |
| **Perencanaan & Anggaran** | `budget` | Rencana Anggaran | `BudgetTab` |
| | `emergency-fund` | Dana Darurat | `EmergencyFundTab` |
| **Portofolio & Utang** | `investments` | Investasi & Portofolio | `InvestmentTab` |
| | `debts` | Perhitungan Utang & KPR | `DebtTab` |
| **Master Data & Konfigurasi Keuangan** | `accounts` | Master Akun & Rekening | `AccountsTab` |
| | `master-categories` | Master Kategori & COA | `MasterCategoryManager` |

Selain tab di atas, `App.tsx` mengelola modal global di tingkat root:
- `AccountingIntegrityModal` — dipicu dari tombol header **Audit Akuntansi** atau dari laporan integritas.
- `BackupDataModal` — ekspor/impor file `.json` terenkripsi PBKDF2 + AES-GCM-256.
- `SyncConflictModal` — penyelesaian konflik bila ringkasan data lokal dan cloud berbeda signifikan saat sinkronisasi awal.
- `OnboardingModal` — panduan pengguna baru setelah registrasi/login pertama.
- Modal konfirmasi **Logout** dan **Reset Data** (`showLogoutModal`, `showResetDataModal`).
- `GlobalToastContainer` — merender notifikasi pub-sub dari `src/utils/toast.ts`.

---

## 4. Persistensi Lokal & Keamanan Data

### 4.1 Penyimpanan Terenkripsi Ringan (`src/utils/secureStorage.ts`)
- Seluruh kunci sensitif di `localStorage` disimpan menggunakan `secureStorage.setItem(key, value)` yang membungkus payload dengan awalan `NW_ENC_V1:` diikuti hasil enkripsi XOR ber-salt `window.location.origin` + secret aplikasi dalam format Base64 UTF-8 aman.
- Saat membaca (`secureStorage.getItem`), jika nilai belum memiliki awalan `NW_ENC_V1:` (data lama/migrasi), nilai plaintext tetap dibaca lalu otomatis dimigrasi menjadi terenkripsi pada penulisan berikutnya.
- Kunci `localStorage` dipartisi berdasarkan ID pengguna (sehingga pergantian user pada satu browser tidak mencampur data antar profil).

### 4.2 Cadangan Terenkripsi Portabel (`src/utils/cryptoBackup.ts`)
Untuk kebutuhan ekspor cadangan yang aman dibawa lintas perangkat:
- Pengguna memasukkan kata sandi (passphrase) pada `BackupDataModal`.
- `encryptBackupData(data, password)` menggunakan Web Crypto API (`window.crypto.subtle`):
  - **Salt acak**: 16 byte (`crypto.getRandomValues`).
  - **Derivasi kunci**: PBKDF2 (`100.000` iterasi, SHA-256) menghasilkan kunci `AES-GCM` 256-bit.
  - **Enkripsi**: `AES-GCM` dengan IV acak 12 byte.
  - **Format keluaran** (`EncryptedBackupPayload`): `{ app: 'NusantaraWealth', version: '1.0', algorithm: 'AES-GCM-256', kdf: 'PBKDF2-SHA256-100k', timestamp, salt, iv, ciphertext }`.
- `decryptBackupData(payload, password)` memverifikasi struktur payload, menurunkan ulang kunci dengan salt tersimpan, dan mendekripsi JSON. Kegagalan kata sandi melempar pesan kesalahan terstandar.

---

## 5. Mekanisme Sinkronisasi Cloud & Resolusi Konflik

1. **Auto-Sync Debounce (`450ms`)**:
   - Setiap mutasi state utama di `App.tsx` menjadwalkan penulisan ke `secureStorage` dan (bila sesi terhubung ke PostgreSQL atau Google Sheets) menjadwalkan `syncToPostgres()` / `uploadFinancesToSheets()` dengan debounce `450ms` agar perubahan cepat (seperti edit beruntun atau sinkronisasi massal) tergabung dalam satu transaksi.
2. **Transaksi & Retry Eksponensial (`src/apiClient.ts` & `src/server/api.ts`)**:
   - Di sisi server (`POST /api/db/sync`), penyimpanan berjalan dalam transaksi tunggal `db.transaction` yang dibungkus `withDbRetry(..., 3)` untuk menangani *cold-start* atau *transient disconnect* Neon PostgreSQL.
   - Seluruh ID entitas di-scope dengan prefix `${userId}_` (`ensureUserScopedId`) dan dideduplikasi (`deduplicateById`) sebelum penulisan massal.
3. **Deteksi Konflik (`src/utils/syncConflictDetector.ts`)**:
   - `generateSyncSummary()` menghitung metrik `transactionCount`, `accountCount`, `budgetCount`, `debtCount`, `investmentCount`, `fixedAssetCount`, `savingsGoalCount`, serta `totalBalance` dan `totalDebt`.
   - `detectDataConflict(local, cloud)` mendeteksi ketidakcocokan bila kedua sisi memiliki data non-kosong namun jumlah atau nilai agregatnya berbeda.
   - Jika konflik terdeteksi, `SyncConflictModal` memberi pengguna 3 pilihan: **Gunakan Data Lokal**, **Gunakan Data Cloud**, atau **Gabungkan Cerdas (`mergeSyncData`)** yang menggabungkan himpunan ID unik dengan prioritas rekaman lokal/cloud sesuai tipe entitas.

---

## 6. Integrasi Google Sheets & Firebase (`src/googleSheets.ts` & `/api/firebase-config`)

- **`src/googleSheets.ts`**:
  - Mengelola sesi sinkronisasi berbasis Google Identity Services (`loadGoogleIdentityServices`, `loginWithGoogleSheets`, `logoutGoogleSheets`) dan token akses browser via `secureStorage`.
  - `uploadFinancesToSheets(data)` dan `downloadFinancesFromSheets()` menyimpan/memuat serialisasi JSON `UserFinancialData` ke spreadsheet Google Drive pengguna secara sisi-klien (*client-side*).
- **`GET /api/firebase-config` (`server.ts`)**:
  - Menyajikan variabel lingkungan `FIREBASE_*` secara dinamis ke frontend tanpa hardcode di kode sumber klien.

---

## 7. Arsitektur PWA & Notifikasi (`public/manifest.json` & `public/sw.js`)

- **`public/manifest.json`**: Mendefinisikan metadata aplikasi installable (`Nusantara Wealth`, `display: "standalone"`, `start_url: "/"`).
- **`public/sw.js`** (284 baris):
  - **Pre-cache & Cache Versioning**: Menyimpan aset statis inti pada fase `install` dan membersihkan cache versi lama pada fase `activate`.
  - **Strategi Fetch**:
    - Permintaan API (`/api/*`) tidak di-cache secara agresif agar data akuntansi dan respons AI selalu segar (network-only/passthrough).
    - Navigasi dokumen (`navigate`) menggunakan *Network-First* dengan fallback ke cache `/` bila offline.
    - Aset statis (skrip, gaya, ikon, font) menggunakan *Stale-While-Revalidate* atau *Cache-First*.
  - **Pengingat Tagihan Rutin (`<= 3 hari`)**: Service worker dan logika notifikasi di `App.tsx` mendukung pengingat lokal untuk jadwal tagihan/transaksi rutin maupun jatuh tempo utang yang berada dalam rentang `<= 3 hari` ke depan.
