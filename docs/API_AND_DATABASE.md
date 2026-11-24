# Spesifikasi Backend API, Gemini AI, & Database PostgreSQL

Dokumen ini merinci seluruh lapisan server (`server.ts`, `src/server/api.ts`), skema Drizzle ORM (`src/db/schema.ts`, `src/db/index.ts`, `src/db/drizzle.config.ts`), mekanisme isolasi data multi-pengguna, seluruh endpoint REST `/api/db/*`, dan seluruh endpoint analitik **Gemini AI** di `/api/*`.

---

## 1. Konfigurasi Database & Migrasi (`src/db/`)

### 1.1 Resolusi Koneksi & SSL (`src/db/index.ts`)
- Fungsi `resolveDatabaseUrl()` mencari string koneksi berurutan dari `NEON_DATABASE_URL`, `DATABASE_URL`, lalu fallback lingkungan Neon yang tersedia.
- Fungsi `resolveSslConfig()` mendeteksi `DATABASE_SSL_MODE` (`disable`, `allow`, `prefer`, `require`, `verify-ca`, `verify-full`) dan parameter `?sslmode=` pada URL koneksi; untuk Neon PostgreSQL defaultnya mengaktifkan SSL dengan `rejectUnauthorized: false` bila diperlukan agar kompatibel di lingkungan container.
- Pool `pg.Pool` diekspor bersama instance Drizzle ORM (`db`).
- Fungsi **`ensureTablesExist()`** dijalankan saat startup `server.ts` untuk membuat 13 tabel dengan `CREATE TABLE IF NOT EXISTS` dan menjalankan **`fixFkConstraints()`** guna memastikan relasi foreign-key konsisten tanpa memblokir sinkronisasi penuh per-user.

### 1.2 Skema 13 Tabel PostgreSQL (`src/db/schema.ts`)

| # | Nama Tabel SQL | Kolom Kunci & Relasi Utama |
| :--- | :--- | :--- |
| 1 | `users` | `id` (PK), `username` (unique), `passwordHash`, `email`, `fullName`, `createdAt` |
| 2 | `accounts` | `id` (PK), `userId` (FK -> `users.id`), `name`, `type`, `startingBalance`, `currentBalance`, `creditLimit`, `usedLimit`, `dueDay`, `coaCode` |
| 3 | `transactions` | `id` (PK), `userId`, `date`, `accountId`, `toAccountId`, `type`, `category`, `description`, `amount`, `debtId`, `investmentAssetId`, `investmentUnits`, `fixedAssetId`, `isAdjustment`, `coaCode` |
| 4 | `recurring_transactions` | `id` (PK), `userId`, `title`, `type`, `category`, `amount`, `accountId`, `toAccountId`, `frequency`, `dayOfMonth`, `isActive`, `description`, `lastProcessedDate` |
| 5 | `investments` | `id` (PK), `userId`, `name`, `category`, `balance`, `dateAdded`, `initialCapital`, `quantity`, `units`, `unitName`, `purchaseUnitPrice`, `currentUnitPrice`, `unitPrice`, `dividendsOrInterest` |
| 6 | `investment_price_history` | `id` (PK), `userId`, `assetId` (FK -> `investments.id`), `assetName`, `date`, `unitPrice`, `previousUnitPrice`, `changePercentage`, `note` |
| 7 | `budgets` | `id` (PK), `userId`, `category`, `type`, `limitAmount` |
| 8 | `debts` | `id` (PK), `userId`, `name`, `balance`, `interestRate`, `minPayment`, `purpose`, `category`, `dueDay`, `isKpr`, `kprScheme`, `kprTenorMonths`, `kprFixedMonths`, `kprFloatingRate`, `kprPropertyValue`, `kprDownPayment`, `kprStartDate`, `kprLinkedFixedAssetId`, `kprIsPaidOff` |
| 9 | `fixed_assets` | `id` (PK), `userId`, `name`, `category`, `acquisitionDate`, `acquisitionCost`, `currentValue`, `usefulLifeYears`, `salvageValue`, `isDepreciable`, `linkedDebtId`, `kprFullAcquisitionValue`, `kprIsPaidOff`, `kprPaidPrincipalLock`, `rateEffectiveDate`, `adjustmentsJson` |
| 10 | `debt_payments` | `id` (PK), `userId`, `debtId`, `date`, `amount`, `principalAmount`, `interestAmount`, `accountId`, `note` |
| 11 | `emergency_fund_configs` | `id` (PK), `userId`, `jobStability`, `dependents`, `monthlyExpense` |
| 12 | `emergency_fund_transactions` | `id` (PK), `userId`, `date`, `type`, `amount`, `location`, `description` |
| 13 | `savings_goals` | `id` (PK), `userId`, `title`, `targetAmount`, `currentAmount`, `targetDate`, `category`, `notes`, `linkedAccountId` |

> **Drizzle Kit (`src/db/drizzle.config.ts`)**: Mengarahkan `schema` ke `./src/db/schema.ts` dengan dialect `postgresql` untuk kebutuhan inspeksi/push skema CLI.

---

## 2. Router Database & Isolasi Multi-User (`src/server/api.ts`)

Router Express `apiRouter` dipasang pada prefix **`/api/db`** di `server.ts`.

### 2.1 Utilitas Keamanan & Ketahanan
- **Password Hashing**: Menggunakan `crypto.scryptSync` dengan salt acak 16-byte (`format: salt:hash`) dan verifikasi `crypto.timingSafeEqual` (serta kompatibilitas verifikasi hash SHA-256 lama bila ada).
- **Retry Koneksi (`withDbRetry`)**: Menjalankan operasi query/transaksi hingga 3 percobaan ulang dengan jeda backoff apabila Neon PostgreSQL mengalami *timeout* atau *cold start*.
- **Isolasi ID per User (`ensureUserScopedId` & `deduplicateById`)**: Memastikan setiap baris milik user tertentu memiliki ID unik yang diawali `${userId}_` agar dua pengguna dengan ID lokal bawaan yang sama (mis. `acc-1`) tidak saling menimpa di tabel bersama.
- **Seed Akun Demo Default**: Pada inisialisasi database, akun demo **`user-ariesd`** (`username: 'ariesD'`, `email: 'ariesd@nusantara.app'`) dipastikan tersedia.

### 2.2 Urutan Middleware & Otorisasi `X-User-Id`
Pada `src/server/api.ts`, route diagnostik publik dan auth didefinisikan terlebih dahulu sebelum guard header `X-User-Id` (baris ~797):

**A. Endpoint Publik / Diagnostik & Autentikasi (`/api/db/*` tanpa wajib header `X-User-Id`)**:
| Method & Path | Fungsi |
| :--- | :--- |
| `GET /api/db/health` | Memeriksa koneksi pool Neon PostgreSQL & mengembalikan status/latensi. |
| `GET /api/db/logs` | Mengambil catatan interaksi database terbaru dari server (`dbLogger`, maks 20 entri, parameter `?limit=`). |
| `GET /api/db/schema` | Menginspeksi struktur kolom tabel pada `information_schema.columns` (`?table=users`, dll.). |
| `GET /api/db/inspect-users` | Menginspeksi ringkasan pengguna & tabel terkait untuk debugging admin. |
| `POST /api/db/fix-users-schema` | Menambahkan kolom yang kurang & memperbaiki constraint tabel `users`. |
| `POST /api/db/rebuild-schema` | Menjalankan ulang `ensureTablesExist()` & `fixFkConstraints()`. |
| `POST /api/db/auth/login` | Autentikasi berdasarkan `username`/`email` + `password` via scrypt; mengembalikan profil `User`. |
| `POST /api/db/auth/register` | Mendaftarkan pengguna baru dengan password ter-hash `scrypt` + validasi duplikasi username/email. |
| `POST /api/db/auth/forgot-password` | Penanganan reset / verifikasi akun berdasarkan identifier (`username`/`email`). |
| `POST /api/db/init-user` | Memastikan baris user ada pada tabel `users` (khususnya saat sinkronisasi user Google/Firebase/Lokal). |

**B. Middleware Guard & Endpoint Terproteksi (`X-User-Id`)**:
Middleware `apiRouter.use` memvalidasi keberadaan header `X-User-Id` (atau fallback field `userId` pada body bila relevan) untuk menolak permintaan anonim dengan HTTP `401`, lalu melayani:

| Method & Path | Fungsi |
| :--- | :--- |
| `GET /api/db/sync` | Mengambil seluruh 12 koleksi finansial milik `userId` (accounts, transactions, recurringTransactions, investments, priceHistory, budgets, debts, fixedAssets, debtPayments, emergencyConfig, emergencyTransactions, savingsGoals) dalam satu respons JSON. |
| `POST /api/db/sync` | Menerima payload finansial penuh milik `userId`, membungkusnya dalam `db.transaction` dengan `withDbRetry`, membersihkan entri lama milik `userId` secara terurut (FK-safe), menerapkan `ensureUserScopedId` & `deduplicateById`, lalu menyisipkan ulang secara atomik. |

---

## 3. Endpoint Utama Server & 12 Endpoint Gemini AI (`server.ts`)

### 3.1 Endpoint Utilitas (`server.ts`)
| Method & Path | Fungsi |
| :--- | :--- |
| `GET /api/health` | Status kesehatan server Express + info environment. |
| `GET /api/firebase-config` | Mengembalikan konfigurasi Firebase Web SDK dari environment server (`FIREBASE_*`). |

### 3.2 Endpoint AI Berbasis `gemini-2.5-flash` (dengan Fallback Rules-Based)
Seluruh endpoint di bawah menggunakan SDK `@google/genai` dengan model **`gemini-2.5-flash`** dan `responseMimeType: "application/json"`. Apabila `GEMINI_API_KEY` belum diisi atau terjadi kegagalan panggilan API eksternal, server otomatis mengeksekusi **fungsi fallback deterministik (*rules-based*)** sehingga UI tetap berfungsi penuh tanpa crash:

| Endpoint (`POST`) | Input Ringkas | Output Utama |
| :--- | :--- | :--- |
| `/api/analyze` | Ringkasan pemasukan, pengeluaran, utang, dana darurat, investasi, anggaran | `AIAnalysisResult`: skor kesehatan, ringkasan, kekuatan, peringatan, rekomendasi langkah. |
| `/api/detect-anomalies` | Daftar transaksi terbaru & rata-rata kategori | Daftar anomali transaksi (lonjakan nominal, pengeluaran tak biasa, duplikasi potensial). |
| `/api/compare-monthly-expenses` | Data pengeluaran bulan berjalan vs bulan lalu per kategori | `AIMonthlyComparisonResult`: selisih bersih, kategori naik/turun paling signifikan, saran pengendalian. |
| `/api/analyze-3month-trend` | Agregasi pengeluaran 3 bulan terakhir per kategori | Tren 3 bulan, proyeksi kategori rawan bocor, dan rekomendasi efisiensi. |
| `/api/suggest-category` | Deskripsi & nominal transaksi baru + daftar kategori tersedia | Rekomendasi `category` dan `type` paling sesuai beserta alasan singkat. |
| `/api/analyze-diversification` | Daftar aset investasi (`investments`) & `riskProfile` | `AIDiversificationResult`: evaluasi alokasi aset, risiko konsentrasi, dan target rebalancing. |
| `/api/weekly-insights` | Transaksi 7 hari terakhir, anggaran, tagihan jatuh tempo | Sorotan mingguan & tips aksi cepat yang dapat ditindaklanjuti. |
| `/api/parse-natural-transaction` | Teks natural Bahasa Indonesia (mis. *"Beli kopi 35rb pakai GoPay"*) + daftar akun & kategori | Ekstraksi terstruktur `{ type, amount, category, accountId, description, date }`. |
| `/api/suggest-category-cleanup` | Daftar kategori & histori transaksi jarang dipakai/duplikat | Saran penggabungan atau pembersihan kategori tidak aktif. |
| `/api/analyze-category-consolidation` | Daftar seluruh kategori & jumlah transaksi masing-masing | `AICategoryConsolidationResult`: kelompok kategori mirip yang aman dikonsolidasikan beserta mapping target. |

### 3.3 Endpoint AI Berbasis `gemini-4-hydrogen` (`ThinkingLevel.LOW` + `responseSchema` Ketat)
Tiga endpoint analitik tingkat lanjut menggunakan model **`gemini-4-hydrogen`** dengan konfigurasi `thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }` dan skema JSON terstruktur (`responseSchema`). Jika `GEMINI_API_KEY` tidak tersedia, server mengembalikan HTTP **`503`**; jika AI mengembalikan respons kosong, mengembalikan HTTP **`502`**:

| Endpoint (`POST`) | Input Utama | Output Terstruktur (`responseSchema`) |
| :--- | :--- | :--- |
| `/api/income-statement-summary` | Periode laporan, pendapatan, beban, rasio tabungan, rincian kategori Laba-Rugi | Ringkasan eksekutif naratif Laba-Rugi, evaluasi efisiensi beban, & rekomendasi taktis. |
| `/api/savings-projection` | Total target tabungan, akumulasi tabungan saat ini, rata-rata laju menabung 3 bulan terakhir, daftar `savingsGoals` & proyeksi matematis dasar | Tanggal estimasi pencapaian total target (`projectedCompletionDate`), status laju (`on_track` / `needs_boost` / `stagnant`), sorotan target terdekat (*nearest goal spotlight*), selisih bulanan yang disarankan, dan pesan strategi personal. |
| `/api/estimate-asset-yield` | `assetName`, `ticker?`, `shouldExtractTicker?`, `category`, `currentBalance`, referensi `localYieldPct` & `localGrowthPct` | Menggunakan `googleSearch` grounding untuk mengekstrak/menstandarkan simbol pasar (`extractedTicker`), mengembalikan `estimatedDividendYieldPct`, `estimatedPriceGrowthPct`, `suggestedPayoutFrequency`, `rationale`, dan daftar sitasi web `sources`. |

---

## 4. Alur Kerja Sinkronisasi Data: Neon PostgreSQL & Google Sheets (Panduan Pengembang)

Nusantara Wealth mendukung **3 lapis persistensi** yang bekerja paralel tanpa memblokir antarmuka pengguna: (1) **Local Encrypted Storage (`secureStorage`)**, (2) **Neon PostgreSQL (`/api/db/sync`)**, dan (3) **Google Sheets Backup (`src/googleSheets.ts`)**.

### 4.1 Diagram Alir Sinkronisasi End-to-End

```text
  [Mutasi State React di App.tsx] (transactions, accounts, budgets, debts, dll.)
         │
         ├──► [1] Local Batch Persistence (debounce 150ms + beforeunload flush)
         │          └── Cek dirty reference per slice -> JSON.stringify -> XOR NW_ENC_V1 -> localStorage
         │
         ├──► [2] Neon PostgreSQL Sync (debounce 450ms + signature dedup)
         │          └── signature = `${activeUserId}:${JSON.stringify(payload)}`
         │                └── Berubah? -> syncToPostgres(payload, activeUserId) (`src/apiClient.ts`)
         │                      └── POST /api/db/sync (Header: X-User-Id) (`src/server/api.ts`)
         │                            └── withDbRetry(3x) -> db.transaction()
         │                                  ├── Hapus baris lama milik userId (urutan FK-safe)
         │                                  ├── ensureUserScopedId(`${userId}_${id}`)
         │                                  ├── deduplicateById()
         │                                  └── Bulk INSERT ke 13 tabel PostgreSQL
         │
         └──► [3] Google Sheets Cloud Sync (debounce 650ms + signature dedup)
                    └── Hanya aktif jika `cloudSync === true` & `!loadingCloudData`
                          └── signature = `${username}:${JSON.stringify(sheetsPayload)}`
                                └── Berubah? -> uploadFinancesToSheets() (`src/googleSheets.ts`)
                                      ├── Cek token akses Firebase GoogleAuthProvider
                                      ├── Cari/buat spreadsheet "Nusantara Wealth Data" (Drive API)
                                      └── Clear Sheet1!A:A -> Bagi JSON per 40.000 char -> PUT values
```

### 4.2 Siklus Login, Penarikan Awal (*Hydration*), & Resolusi Konflik (`SyncConflictModal`)

1. **Saat Login ke Neon PostgreSQL (`App.tsx` -> `loadPgData`)**:
   - `App.tsx` menandai `loadingPg = true` agar efek auto-upload tertunda selama proses *hydration* awal.
   - Memanggil `syncFromPostgres(activeUserId)` (`GET /api/db/sync` dengan header `X-User-Id`).
   - Secara paralel membaca snapshot backup lokal `nusantara_wealth_backup_${activeUserId}` dari `secureStorage`.
   - Memanggil `detectDataConflict(localDataPkg, pgData)` (`src/utils/syncConflictDetector.ts`):
     - **Jika konflik terdeteksi** (kedua sumber non-kosong namun jumlah item atau total saldo/utang berbeda): `SyncConflictModal` terbuka dan pengguna memilih **Gunakan Data Lokal**, **Gunakan Data Cloud**, atau **Gabungkan Cerdas (`mergeSyncData`)** yang menggabungkan himpunan ID unik secara aman.
     - **Jika tidak ada konflik**: `applySyncPackage(pgData)` langsung menghidrasi state aplikasi.
   - Setelah `finally { setLoadingPg(false) }`, perubahan state berikutnya otomatis dijadwalkan untuk sinkronisasi inkremental kembali ke Postgres.
2. **Saat Login dengan Google Sheets (`App.tsx` -> `loadCloudData`)**:
   - `App.tsx` menandai `loadingCloudData = true`, memanggil `downloadFinancesFromSheets()` (`GET` `Sheet1!A:A`, menggabungkan potongan 40.000 karakter kembali menjadi `UserFinancialData`), mengisi state lokal, lalu melepaskan `loadingCloudData = false`.

### 4.3 Mekanisme Detail Google Sheets (`src/googleSheets.ts`)

- **Autentikasi**: Memanfaatkan konfigurasi dari `GET /api/firebase-config` + Firebase `GoogleAuthProvider` (`signInWithPopup`) dengan dua scope minimal:
  - `https://www.googleapis.com/auth/spreadsheets`
  - `https://www.googleapis.com/auth/drive.file`
- **Batasan Sel Google Sheets (50.000 karakter/sel)**:
  - Karena seluruh JSON finansial dapat melampaui 50.000 karakter pada dataset besar, `uploadFinancesToSheets()` memecah string JSON menjadi *chunks* berukuran maksimal **`40.000` karakter** dan menuliskannya baris demi baris ke kolom `Sheet1!A:A`.
  - Saat membaca kembali, `downloadFinancesFromSheets()` menggabungkan seluruh baris kolom A (`rows.map(r => r[0] || '').join('')`) sebelum melakukan `JSON.parse`.
- **Optimasi Batching**: Pemanggilan di `App.tsx` kini didebounce **`650ms`** dan dicegah mengirim ulang payload identik melalui `lastSheetsSyncSignatureRef` (reset otomatis pada blok `.catch()` bila jaringan gagal atau token kedaluwarsa).

### 4.4 Checklist Pemeliharaan Bagi Tim Pengembang

- **Menambah Entitas/Koleksi Baru ke Sinkronisasi**:
  1. Tambahkan tabel/kolom di `src/db/schema.ts` + DDL migrasi aman di `ensureTablesExist()` (`src/db/index.ts`).
  2. Perbarui `GET /api/db/sync` dan `POST /api/db/sync` di `src/server/api.ts` (wajib memakai `ensureUserScopedId` & `deduplicateById` di dalam transaksi `withDbRetry`).
  3. Tambahkan field baru ke payload `syncToPostgres`, `lastPersistedSlicesRef` (di `App.tsx`), `UserFinancialData` (`src/googleSheets.ts` bila perlu dicadangkan ke Sheets), dan `SyncDataPackage` (`src/utils/syncConflictDetector.ts`).
- **Menjaga Performa Saat Menambah Efek Sinkronisasi**:
  - Jangan pernah memanggil `secureStorage.setItem` secara sinkron di banyak `useEffect` terpisah untuk setiap slice state; daftarkan slice baru ke batch writer `150ms` di `App.tsx`.
  - Jangan menghapus *signature guard* (`lastPgSyncSignatureRef` / `lastSheetsSyncSignatureRef`) karena mencegah siklus upload ganda setelah *hydration* atau saat state di-set ulang dengan nilai yang sama.
