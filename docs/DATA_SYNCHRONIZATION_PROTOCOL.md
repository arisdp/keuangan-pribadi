# Protokol Sinkronisasi Data Dua Arah (Lokal, PostgreSQL & Google Sheets)

Panduan teknis mendalam berbahasa Indonesia untuk tim pengembang **Nusantara Wealth** mengenai mekanisme sinkronisasi data dua arah (*bidirectional sync*) antara **Penyimpanan Lokal Terenkripsi**, **Neon PostgreSQL** (`Drizzle ORM` + Express API), dan **Google Sheets / Drive API v4**, termasuk deteksi konflik, *batching/debounce*, deduplikasi *signature*, dan pemulihan kegagalan.

---

## 1. Arsitektur 3-Lapis Persistensi & Sinkronisasi

Aplikasi menempatkan state React di `src/App.tsx` sebagai sumber kebenaran interaktif (*in-memory source of truth*), lalu menyinkronkannya ke tiga lapisan penyimpanan dengan ritme *debounce* berbeda sesuai biaya I/O masing-masing:

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ LAYER 1: IN-MEMORY ORCHESTRATOR (src/App.tsx)                                │
│  10 Slice Domain: transactions, accounts, budgets, debts, investments,       │
│  fixedAssets, recurringTransactions, savingsGoals, emergencyConfig,          │
│  emergencyTransactions                                                       │
└──────┬─────────────────────────────┬────────────────────────────┬────────────┘
       │ 150ms Debounce              │ 450ms Debounce             │ 650ms Debounce
       │ (Dirty-Check per Slice)     │ + Signature Deduplication  │ + Signature Dedup
       ▼                             ▼                            ▼
┌──────────────────────┐  ┌──────────────────────────┐  ┌──────────────────────┐
│ LAYER 2A: LOKAL      │  │ LAYER 2B: NEON POSTGRES  │  │ LAYER 2C: GOOGLE     │
│ secureStorage        │  │ POST/GET /api/db/sync    │  │ SHEETS API v4        │
│ Prefix: NW_ENC_V1:   │  │ Header: X-User-Id        │  │ Spreadsheets+Drive   │
│ + beforeunload flush │  │ Retry 3x Exp + DB Retry  │  │ Chunk 40.000 char    │
└──────────────────────┘  └──────────────────────────┘  └──────────────────────┘
```

---

## 2. Alur Siklus Hidup Sinkronisasi Dua Arah

### A. Diagram Urutan Hidrasi, Deteksi Konflik, & Simpan Otomatis

```text
[Pengguna Login]
       │
       ├──► 1. Hidrasi PostgreSQL: syncFromPostgres(activeUserId)
       │        ├── GET /api/db/sync (Header X-User-Id: activeUserId)
       │        ├── Server query 10 tabel berfilter userId + mapToNum()
       │        ├── Berhasil? -> Simpan snapshot ke secureStorage
       │        │   (`nusantara_wealth_backup_${activeUserId}`)
       │        ├── Cek Konflik: detectDataConflict(localDataPkg, pgData)
       │        │     ├── Sama / lokal kosong -> applySyncPackage(pgData)
       │        │     └── Berbeda -> Buka SyncConflictModal (3 Opsi):
       │        │           [1] Gunakan Data Lokal
       │        │           [2] Gunakan Data Cloud PostgreSQL
       │        │           [3] Gabungkan Keduanya (mergeSyncData by id)
       │        └── Gagal/Offline? -> Pulihkan snapshot dari secureStorage
       │
       ├──► 2. Hidrasi Google Sheets (jika cloudSync aktif via Firebase OAuth):
       │        └── downloadFinancesFromSheets() -> rakit ulang chunk Sheet1!A:A
       │
[Mutasi State Domain di Aplikasi]
       │
       ├──► Jalur A (150ms): flushDirtySlices() -> tulis slice yang berubah
       │                      referensinya ke `fin_${username}_*` (NW_ENC_V1:)
       │                      + flush paksa sinkron pada event `beforeunload`
       │
       ├──► Jalur B (450ms): Hitung signature `${activeUserId}:${JSON(payload)}`
       │                      Jika !== lastPgSyncSignatureRef -> syncToPostgres()
       │                      Jika gagal -> reset lastPgSyncSignatureRef = ''
       │
       └──► Jalur C (650ms): Jika cloudSync aktif & !loadingCloudData:
                              Hitung signature `${username}:${JSON(sheetsPayload)}`
                              Jika !== lastSheetsSyncSignatureRef -> uploadFinancesToSheets()
```

### B. Mekanisme Deteksi Konflik & Smart Merge (`src/utils/syncConflictDetector.ts`)

1. **`generateSyncSummary(data, source)`**: Menghitung jumlah catatan (`transactionCount`, `accountCount`, `investmentCount`, `debtCount`), total saldo (`totalBalance` seluruh rekening), dan `_lastUpdated`.
2. **`detectDataConflict(localData, cloudData)`**:
   - Mengembalikan `false` bila kedua sisi memiliki `transactionCount === 0`.
   - Menandai konflik (`true`) jika terjadi selisih jumlah transaksi, selisih jumlah rekening, **atau** selisih total saldo absolut `> Rp 1`.
3. **`mergeSyncData(localData, cloudData)`** (*Opsi "Gabungkan Keduanya"* di `SyncConflictModal`):
   - Menjalankan `deduplicateById([...localArr, ...cloudArr])` memakai `Map<string, any>` berdasar kunci `String(item.id)` di seluruh koleksi array (*cloud record menimpa lokal bila ID sama, sambil mempertahankan seluruh ID unik dari kedua sisi*).
   - Mengatur `_lastUpdated` menjadi timestamp ISO baru dan langsung memicu unggahan sinkronisasi ke cloud.

---

## 3. Protokol Sinkronisasi Neon PostgreSQL (`src/apiClient.ts` & `src/server/api.ts`)

### A. Protokol Sisi Klien (`syncToPostgres` & `syncFromPostgres`)
1. **Isolasi Kepemilikan Data Sebelum Kirim**: `syncToPostgres` menormalisasi properti `userId` pada seluruh item `accounts` dan `transactions` dengan `cleanUserId` yang tervalidasi.
2. **Resiliensi Offline Pertama (*Local-First Snapshot*)**: Sebelum menyentuh jaringan, payload lengkap + `_lastUpdated` langsung disimpan ke `secureStorage` (`nusantara_wealth_backup_${cleanUserId}`).
3. **Exponential Backoff & Klasifikasi Error SQLSTATE (`maxRetries = 3`)**:
   - Jeda tunggu antar percobaan: `Math.pow(2, attempt - 1) * 1000` (`1.000ms`, `2.000ms`, `4.000ms`).
   - **Schema Error (`42703`, `42P01`, `23502`, `23505`, `22P02`, `42000`)**: Dihentikan segera (*fail-fast*, tidak di-retry sia-sia) dan menampilkan toast peringatan SQLSTATE tanpa menghapus cadangan lokal.
   - **Connection / Compute Cold-Start Error (`08000`–`08006`, `57P01`–`57P03`, HTTP `>= 500`, atau `FETCH_NET_ERR`)**: Memanggil `checkPostgresHealth()` lalu mengulang hingga 3 kali.

### B. Protokol Sisi Server (`GET /api/db/sync` & `POST /api/db/sync`)
1. **Pembacaan (`GET /api/db/sync`)**:
   - Memanggil `ensureUserExists(userId)` lalu mengambil seluruh 10 tabel yang terfilter `eq(table.userId, userId)`, ditambah `investmentPriceHistory` dan `debtPayments` yang dipetakan ke aset/utang induk masing-masing.
   - Tipe numerik `NUMERIC/DECIMAL` PostgreSQL (yang dikembalikan driver `pg` sebagai string) dikonversi kembali menjadi tipe `number` JavaScript melalui helper `mapToNum()` khusus untuk kolom berakhiran/mengandung kata kunci finansial (`amount`, `balance`, `price`, `rate`, `limit`, `payment`, `quantity`, `units`, `dividends`, `debt`, `lock`) agar kolom tanggal string tidak rusak.
   - Mengonversi kolom database `budgets.limitAmount` menjadi `budgets.limit` sesuai kontrak tipe frontend.
2. **Penulisan Atomik (`POST /api/db/sync`)**:
   - Dibungkus `withDbRetry(..., 3)` dengan backoff linier `400ms * attempt` untuk mengatasi error transien koneksi atau *compute wake-up* Neon (`57P01/02/03`, `08000/01/03/06`) serta me-reset cache `ensureTablesPromise = null`.
   - Seluruh mutasi berjalan di dalam **satu transaksi atomik SQL (`db.transaction`)**:
     - **Langkah 0**: `INSERT ... ON CONFLICT (id) DO UPDATE` pada tabel `users`.
     - **Langkah 1–8 (Urutan `DELETE` Aman *Foreign-Key*)**:
       1. `transactions` (berdasarkan `user_id`, `account_id` milik user, prefix `${userId}_%`, atau baris *orphan* yang `account_id`-nya tidak eksis di tabel `accounts`).
       2. `recurring_transactions` (pola aman yang sama).
       3. `debt_payments` (berdasarkan `debt_id` milik user, prefix, atau *orphan*).
       4. `investment_price_history` (berdasarkan `asset_id` milik user, prefix, atau *orphan*).
       5. Tabel anak mandiri (`emergency_fund_transactions`, `budgets`, `savings_goals`, `emergency_fund_configs`).
       6. Tabel induk domain (`fixed_assets`, `investments`, `debts`).
       7. Pembersihan pengaman tambahan pada `transactions` & `recurring_transactions` untuk `account_id` milik user.
       8. `accounts` (`WHERE user_id = ${userId}`).
     - **Isolasi ID & Deduplikasi Sebelum `INSERT`**:
       - `ensureUserScopedId(id, prefix, idx)`: memastikan setiap ID baris diawali `${userId}_` sehingga dua akun pengguna berbeda tidak pernah bertabrakan primary key global di PostgreSQL meskipun awalnya memakai ID demo bawaan yang sama (misal `acc-1`).
       - `deduplicateById(arr)`: menjamin tidak ada `23505 duplicate key` saat bulk `INSERT`.
       - Bila `accounts` hasil pemetaan kosong, server otomatis menyisipkan rekening dasar `${userId}_acc_default` (`"Dompet Tunai"`) agar *foreign key* transaksi tidak pernah menggantung.

---

## 4. Protokol Sinkronisasi Google Sheets (`src/googleSheets.ts`)

Google Sheets berfungsi sebagai opsi sinkronisasi portabel milik pengguna langsung di akun Google Drive pribadinya menggunakan **Firebase GoogleAuthProvider** (Client-Side OAuth).

| Tahap | Implementasi & Konstanta | Catatan Operasional |
| :--- | :--- | :--- |
| **Autentikasi & Scope** | `signInWithPopup(auth, provider)` dengan scope:<br>• `https://www.googleapis.com/auth/spreadsheets`<br>• `https://www.googleapis.com/auth/drive.file` | Hanya memicu permintaan token saat pengguna masuk lewat integrasi Google Sheets; token disimpan di memori modul (`accessToken`). |
| **Penemuan Berkas Drive** | `GET drive/v3/files` dengan query:<br>`name = 'Nusantara Wealth Data' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false` | Jika belum ditemukan, memanggil `POST sheets.googleapis.com/v4/spreadsheets` membuat berkas baru dengan lembar `Sheet1`. ID disimpan di cache variabel `spreadsheetId`. |
| **Batas Sel 50.000 Karakter** | Google Sheets menolak sel tunggal dengan panjang `> 50.000` karakter | Data JSON (+ `updatedAt`) dipotong menjadi potongan berukuran maksimal **`40.000` karakter** (`chunkSize = 40000`) ke dalam array baris 1-kolom `[[chunk0], [chunk1], ...]`. |
| **Protokol Tulis Aman** | 1. `POST .../values/Sheet1!A:A:clear`<br>2. `PUT .../values/Sheet1!A1?valueInputOption=RAW` | Menghapus kolom `A:A` terlebih dahulu wajib dilakukan agar sisa chunk lama (saat ukuran data mengecil) tidak ikut tergabung saat `downloadFinancesFromSheets()`. |
| **Protokol Baca & Rekonstruksi** | `GET .../values/Sheet1!A:A` | Menggabungkan seluruh baris `row[0]` secara berurutan (`join('')`), mem-parse JSON, lalu menghapus properti pembungkus `updatedAt`. |
| **Perlindungan Kuota & Balapan** | Debounce `650ms` + pengecekan `lastSheetsSyncSignatureRef` | Memastikan perubahan berturut-turut dalam satu aksi pengguna (misal transaksi + penyesuaian saldo + update utang) hanya mengirim 1 permintaan bersih ke Google API. |

---

## 5. Matriks Penanganan Kegagalan Sinkronisasi

| Skenario Kegagalan | Perilaku Sistem Saat Ini | Dampak ke Data Pengguna | Langkah Pemulihan Otomatis / Manual |
| :--- | :--- | :--- | :--- |
| **Jaringan Terputus Saat Simpan (`POST /api/db/sync`)** | Client retry 3x dengan jeda eksponensial + `checkPostgresHealth()`. Signature `lastPgSyncSignatureRef` di-reset ke `''`. | **Nol kehilangan data** — seluruh slice tersimpan di `secureStorage` (`150ms`) & snapshot cadangan `nusantara_wealth_backup_*`. | Perubahan berikutnya akan mendeteksi signature kosong dan mengunggah ulang status terbaru ke PostgreSQL. |
| **Neon Compute Cold-Start / Koneksi Terputus Sementara** | Server `withDbRetry(3)` menunggu `400ms * attempt` dan me-reset `ensureTablesPromise` sebelum mengulang transaksi atomik. | Transaksi di-rollback penuh oleh PostgreSQL apabila gagal di tengah jalan (tidak ada kondisi terhapus separuh). | Permintaan berikutnya atau retry otomatis mengeksekusi transaksi dari kondisi bersih. |
| **Mismatch Data Antar Perangkat saat Login** | `detectDataConflict()` memicu `SyncConflictModal` sebelum menimpa state lokal atau cloud. | Mencegah data perangkat offline terhapus sepihak oleh state cloud lama (atau sebaliknya). | Pengguna memilih **Lokal**, **Cloud**, atau **Merge** (`mergeSyncData`). |
| **Token OAuth Google Sheets Kedaluwarsa / Dibatalkan** | `uploadFinancesToSheets` gagal dan `catch` mereset `lastSheetsSyncSignatureRef = ''`; penyimpanan lokal & Postgres tetap berjalan independen. | State lokal dan PostgreSQL tidak terdampak. | Login ulang Google Sheets untuk menyegarkan `accessToken` di sesi browser. |

---

## Rujukan Berkas Terkait
- Indeks Dokumentasi Utama: [`README.md`](./README.md)
- Referensi Arsitektur Sistem: [`ARCHITECTURE.md`](./ARCHITECTURE.md)
- Referensi Siklus Hidup & Integritas: [`ACCOUNTING_ENGINE_LIFECYCLE_AND_INTEGRITY.md`](./ACCOUNTING_ENGINE_LIFECYCLE_AND_INTEGRITY.md)
- Spesifikasi Tabel & Endpoint API: [`API_AND_DATABASE.md`](./API_AND_DATABASE.md)
