# Siklus Hidup `AccountingEngine` & Protokol Validasi Integritas *Ledger*

Dokumen referensi teknis mendalam berbahasa Indonesia bagi tim pengembang **Nusantara Wealth** mengenai alur hidup internal `AccountingEngine` (`src/utils/accountingEngine.ts`) serta protokol penuh validasi, simulasi dampak, dan perbaikan integritas buku besar (*General Ledger*).

---

## Bagian I — Siklus Hidup `AccountingEngine`

Seluruh kalkulasi akuntansi di aplikasi—mulai dari pencatatan mutasi saldo rekening hingga laporan keuangan standar dan audit GL—berjalan secara terpusat di modul murni (*pure functions*) `src/utils/accountingEngine.ts` dengan dukungan akselerasi indeks periode di `src/utils/cashFlowSankey.ts`.

### 1. Diagram Alur 6-Fase Siklus Hidup Data Akuntansi

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ FASE 1: INGESTI & NORMALISASI TANGGAL AMAN-ZONA-WAKTU                        │
│   Input Transaksi Mentah (ISO / DD/MM/YYYY / YYYY-MM-DD)                     │
│     └──► normalizeLedgerDateYYYYMMDD()                                       │
│            ├── Fast-Path YYYY-MM-DD (tanpa alokasi RegExp/Date berulang)     │
│            └── Bounded FIFO Map Cache (maks 4.096 kunci)                     │
│     └──► buildSankeyPeriodIndex() [O(N) 1x saat state transactions berubah]  │
│            ├── byMonth   : Map<"YYYY-MM", IndexedSankeyTransaction[]>        │
│            ├── byQuarter : Map<"YYYY-Qn", IndexedSankeyTransaction[]>        │
│            └── byYear    : Map<"YYYY",    IndexedSankeyTransaction[]>        │
└──────────────────────────────────┬───────────────────────────────────────────┘
                                   ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ FASE 2: KLASIFIKASI SIFAT AKUNTANSI DOUBLE-ENTRY                             │
│   classifyTransaction(tx) ──► 1 dari 11 TransactionAccountingNature          │
│     1. non_cash_adjustment     (Penyusutan 5960/1690, Akrual Bunga, Adj)     │
│     2. internal_transfer       (Mutasi Masuk / Mutasi Keluar / Antar Akun)   │
│     3. debt_principal_pay      (Cicilan Utang / KPR -> Trigger Split)        │
│     4. debt_proceeds           (Pencairan Pinjaman Baru -> Arus Pendanaan)   │
│     5. equity_injection        (Modal Awal / Setoran Ekuitas)                │
│     6. emergency_fund_transfer (Transfer Dana Darurat)                       │
│     7. fixed_asset_buy         (Pembelian Aset Tetap / Properti)             │
│     8. investment_buy          (Pembelian Instrumen Investasi)               │
│     9. investment_sell         (Penjualan / Pencairan Investasi)             │
│    10. operating_income        (Pendapatan Operasional — COA 4xxx)           │
│    11. operating_expense       (Beban Operasional — COA 5xxx)                │
└──────────────────────────────────┬───────────────────────────────────────────┘
                                   ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ FASE 3: MUTASI SALDO AKUN & PEMISAHAN POKOK vs BUNGA KPR                     │
│   • getTransactionAccountDelta(tx):                                          │
│       tx.isAdjustment === true -> 0 (TIDAK menyentuh saldo kas/bank)         │
│       tx.type === 'income'     -> +|amount|                                  │
│       lainnya                  -> -|amount|                                  │
│   • applyAccountBalanceChange(acc, delta):                                   │
│       Akun Kas/Bank -> currentBalance += delta                               │
│       Akun Kredit   -> currentBalance += delta                               │
│                        usedLimit = max(0, creditLimit - currentBalance)      │
│   • calculateKprInstallmentBreakdown() + resolveDebtInstallmentAccounting(): │
│       Memecah cicilan KPR (annuity/tiered/flat) ->                           │
│         [Pokok Dr 2310 / Cr Kas] + [Beban Bunga Dr 5810 / Cr Kas]            │
└──────────────────────────────────┬───────────────────────────────────────────┘
                                   ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ FASE 4: KONSOLIDASI LAPORAN KEUANGAN & RASIO KESEHATAN (CFP)                 │
│   • calculateIncomeStatementSummary & calculateMonthlyIncomeStatementSeries  │
│     (memakai preIndexedByMonth O(1) bila tersedia)                           │
│   • calculateCashFlowStatement (Operasional / Investasi / Pendanaan)         │
│     -> Mengecualikan pengeluaran non-tunai Credit Card & PayLater            │
│   • syncKprDebtsToFixedAssets + calculateBalanceSheet                        │
│     -> Kunci anti-double-counting ekuitas properti KPR vs sisa pokok utang    │
│   • calculateCFPRatios (Likuiditas Jangka Pendek, Tabungan, Beban Utang, NW) │
└──────────────────────────────────┬───────────────────────────────────────────┘
                                   ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ FASE 5: OTOMATISASI PENYESUAIAN NON-KAS AKHIR TAHUN                          │
│   computePendingYearEndFixedAssetDepreciations()                             │
│     • Berjalan untuk aset bertarif negatif (penyusutan) per 31 Des           │
│     • Idempotent via adjustmentPeriodKey ("YYYY-12") + rateEffectiveDate     │
│     • Jurnal: Dr 5960 (Penyusutan Aset Tetap) / Cr 1690 (Akum. Penyusutan)   │
└──────────────────────────────────┬───────────────────────────────────────────┘
                                   ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ FASE 6: AUDIT & REKONSILIASI INTEGRITAS GENERAL LEDGER (GL)                  │
│   auditLedgerIntegrity() -> previewSafeAnomalyCleanupImpact() -> Harmoni GL │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 2. Aturan Inti Setiap Fase

#### A. Standar Tanggal Lokal Bebas Pergeseran UTC
- **Masalah klasik**: `new Date().toISOString().slice(0, 10)` mengonversi waktu ke UTC, sehingga transaksi pukul `00:00–06:59 WIB` bergeser ke **H-1**.
- **Solusi kanonis**:
  - `toLocalYYYYMMDD(date)`: mengekstrak `getFullYear()`, `getMonth() + 1`, dan `getDate()` lokal.
  - `parseLocalDate(rawDate)`: memanggil `normalizeLedgerDateYYYYMMDD()` lalu membentuk `new Date(y, m - 1, d)` lokal.
  - `normalizeLedgerDateYYYYMMDD(rawDate)`: menerima format `YYYY-MM-DD`, `ISO 8601`, `YYYY/MM/DD`, `DD/MM/YYYY`, dan `DD-MM-YYYY`. Menggunakan *fast-path* langsung untuk string kanonis `YYYY-MM-DD` dan *cache* `Map` FIFO berkapasitas **`4.096`** entri agar pemindaian berulang tetap sub-milidetik tanpa kebocoran memori.

#### B. Akselerasi Indeks Periode `Map` & `useTransition` di Pusat Laporan
- `buildSankeyPeriodIndex(transactions)` memproses daftar transaksi **1 kali** ketika state `transactions` berubah, menghasilkan `byMonth` (`YYYY-MM`), `byQuarter` (`YYYY-Qn`), `byYear` (`YYYY`), `all`, `allTransactions`, serta metadata tanggal lokal (`currentLocalDate`, `currentLocalMonth`, `currentLocalYear`, `currentLocalQuarter`).
- Seluruh tab periode di `ReportsTab` menggunakan indeks ini secara seragam:
  - **`SankeyCashFlowSummary` & `SankeyFlowChart` & `TransactionDrillDownTable`**: `lookupSankeyPeriodEntries()` mengambil bucket secara `O(1)` lalu menghitung `aggregatePeriodCashFlowIndexed()` satu kali saja.
  - **Filter Periode Umum Arus Kas & CSV** (`this-month`, `last-3-months`, `this-year`, `all`): memakai `lookupReportsPeriodTransactions()` / `lookupReportsPeriodEntries()` (menggabungkan paling banyak 4 bucket bulan dari `byMonth` untuk `last-3-months`).
  - **`LaporanLabaRugi` (`3m` / `6m` / `12m` / `ytd`)**: mengirim `periodIndex.byMonth` ke parameter ke-4 `calculateMonthlyIncomeStatementSeries()`, melompati iterasi linier seluruh buku besar.
  - **`HierarchicalPivotReport` (Filter Tahun & Kolom Bulan)** + **Analitik Lanjutan** (`yoyComparisonData`, `monthlySpendingTrend`, `heatmapData`, `projectionData`, `baseBudgetVsRealization`): menarik bucket bulan/tahun langsung dari `Map`.
- Perubahan sub-tab dan filter periode dibungkus React **`useTransition()`** dengan indikator status ringkas (`"Memperbarui..."` + ikon `RefreshCw animate-spin` dan modulasi opasitas halus `opacity-75` -> `opacity-100`).

#### C. Pemisahan Pokok vs Bunga KPR & Anti-Double-Counting
- **Pemisahan Cicilan**: `calculateKprInstallmentBreakdown()` mendukung skema `annuity`, `tiered` (membedakan fase *Fixed* vs *Floating* berdasar `elapsedMonths <= fixedYears * 12`), dan `flat`. Porsi bunga masuk ke Laba-Rugi Operasional (`COA 5810`), sedangkan porsi pokok mengurangi liabilitas (`COA 2310`) dan hanya tampil di arus kas pendanaan serta Sankey node utang.
- **Anti-Double-Counting Neraca**: `syncKprDebtsToFixedAssets()` menyinkronkan setiap liabilitas KPR ke modul aset tetap menggunakan `equityLockMode`:
  - `purchase_price`: properti dinilai penuh pada harga beli/pasar di sisi Aset, sementara sisa pokok utang KPR dikurangkan di sisi Liabilitas.
  - `equity_plus_remaining`: nilai awal disesuaikan otomatis mengikuti akumulasi pokok yang sudah terbayar + sisa pinjaman untuk mencegah lonjakan ekuitas artifisial.

#### D. Otomatisasi Penyusutan Akhir Tahun (`App.tsx` + `accountingEngine.ts`)
- `computePendingYearEndFixedAssetDepreciations()` mengevaluasi aset tetap bertarif negatif (`annualRatePct < 0`) untuk setiap tahun tutup buku `YYYY-12-31` yang telah terlewati (`safeTodayStr >= "${year}-12-31"`).
- Pencatatan bersifat **idempoten** karena memeriksa keberadaan `adjustmentPeriodKey === "${year}-12"` baik di `transactions` maupun di `asset.manualAdjustments`.
- Di `App.tsx`, efek *effect hook* membaca daftar transaksi lewat `transactionsRef` agar penambahan transaksi rutin baru tidak memicu eksekusi ulang penyusutan secara berantai.

---

## Bagian II — Protokol Penuh Validasi Integritas *Ledger*

Integritas antara daftar **Jurnal Transaksi (`transactions`)** dan **Master Rekening (`accounts`)** dijaga oleh tiga fungsi deterministik di `src/utils/accountingEngine.ts` yang dieksekusi dari UI **`IntegrityReport`** dan modal perbaikan terkait:
1. `auditLedgerIntegrity(transactions, accounts)` — Deteksi anomali 3 jalur.
2. `previewSafeAnomalyCleanupImpact(transactions, accounts, params)` — Simulasi dampak saldo sebelum eksekusi.
3. `reassignOrphanTransactionWithBalanceSync(...)` & `removeDuplicateTransactionsWithBalanceSync(...)` — Eksekusi atomik dengan proteksi saldo GL.

### 1. Diagram Alur Kode Protokol Integritas *Ledger*

```text
┌───────────────────────────────────────────────────────────────────────────────┐
│ TAHAP 1: PEMINDAIAN INTEGRITAS (auditLedgerIntegrity)                         │
│                                                                               │
│  Iterasi tunggal safeTxs[0..N-1]:                                             │
│   ├──► Cek Yatim (!tx.isAdjustment):                                          │
│   │      ├── accountId kosong?         ──► reason: 'missing_account_id'       │
│   │      └── !validAccountIds.has(id)? ──► reason: 'account_not_found'        │
│   │                                                                           │
│   ├──► Kumpulkan byId (Map<txId, Row[]>)                                      │
│   │      └── count > 1 ──► duplicateIdGroups                                  │
│   │                        ├── keepIndex = items[0].index                     │
│   │                        └── duplicateIndices = items[1..].index              │
│   │                            (dicatat ke duplicateIdRowIndices: Set<num>)   │
│   │                                                                           │
│   └──► Kumpulkan bySameDaySignature (Sidik Jari 7-Kolom Normalized):          │
│          sig = `${datePart}|${accPart}|${typePart}|${catPart}|                │
│                 ${Math.round(|amount| * 100)}|${descPart}|${adjPart}`         │
│          └── count > 1 ──► Buang baris yang sudah ada di duplicateIdRowIndices│
│                             Jika tersisa > 1 ──► sameDayDuplicateGroups       │
└───────────────────────────────────────┬───────────────────────────────────────┘
                                        ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│ TAHAP 2: SIMULASI DAMPAK SEBELUM EKSEKUSI (previewSafeAnomalyCleanupImpact)   │
│                                                                               │
│  Input: duplicateIndicesToRemove[], orphanReassignments[], orphanIndicesToDel │
│   1. Terapkan pengalihan orphan ──► hitung orphanDeltaByAccount[accId]        │
│   2. Evaluasi setiap rekening terdampak penghapusan duplikat:                 │
│        glBefore = calculateAccountGLBalance(acc, safeTxs)                     │
│        glAfter  = calculateAccountGLBalance(acc, txsTanpaDuplikat)            │
│        ┌───────────────────────────────────────────────────────────────────┐  │
│        │ PENGAMAN SALDO GL (ANTI-OVER-REVERT):                             │  │
│        │ IF |acc.currentBalance - glAfter.glCalculatedBalance| < 1:        │  │
│        │    -> Saldo rekening tercatat SUDAH mengecualikan baris duplikat! │  │
│        │    -> glAlreadyExcludedCount++, revertDelta = 0 (JANGAN kurangi)  │  │
│        │ ELSE:                                                             │  │
│        │    -> revertDelta = glAfter.gl - glBefore.gl                      │  │
│        │    -> workingAcc = applyAccountBalanceChange(workingAcc, revert)  │  │
│        └───────────────────────────────────────────────────────────────────┘  │
│   3. Tambahkan orphanDelta ──► hasilkan AccountCleanupImpactPreview[]         │
└───────────────────────────────────────┬───────────────────────────────────────┘
                                        ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│ TAHAP 3: REKONSILIASI SALDO GENERAL LEDGER (calculateAccountGLBalance)        │
│                                                                               │
│  Untuk setiap rekening acc:                                                   │
│   • calculatedDelta = Σ getTransactionAccountDelta(tx)                        │
│       (termasuk tx pelunasan kartu kredit via linkedDebtId='acc-debt-'+acc.id)│
│   • initialDebt = isCreditAccount(acc) ? |acc.initialDebt| : 0                │
│   • glCalculatedBalance = startingBalance - initialDebt + calculatedDelta     │
│   • difference = acc.currentBalance - glCalculatedBalance                     │
│                                                                               │
│  Jika |difference| > 0 ──► Setarakan via setAccountTargetBalance(acc, gl)     │
└───────────────────────────────────────────────────────────────────────────────┘
```

### 2. Spesifikasi Teknis Aturan Deteksi

1. **Transaksi Yatim (*Orphan Transaction*)**:
   - **Syarat wajib**: `!tx.isAdjustment` (jurnal penyesuaian non-kas seperti penyusutan aset tetap sengaja tidak memiliki `accountId` kas/bank, sehingga dikecualikan agar tidak menimbulkan *false positive*).
   - `missing_account_id`: `tx.accountId` kosong / spasi saja.
   - `account_not_found`: `tx.accountId` terisi namun tidak ditemukan dalam himpunan `validAccountIds` (misal akibat penghapusan rekening lama atau impor data parsial).
2. **Duplikat ID (`duplicate_id`)**:
   - Kelompok baris dengan `tx.id.trim()` sama persis (`items.length > 1`).
   - Elemen pertama (`items[0].index`) selalu dipertahankan sebagai `keepIndex`; sisanya ditandai aman untuk dibersihkan di `duplicateIndices` sekaligus didaftarkan ke `duplicateIdRowIndices`.
3. **Duplikat Identik pada Hari yang Sama (`same_day_identical`)**:
   - Menyusun *fingerprint* deterministik dari 7 atribut yang dinormalisasi:
     - `datePart`: `normalizeLedgerDateYYYYMMDD(tx.date)` (format kanonis `YYYY-MM-DD`, menyamakan `"18/11/2026"` dan `"2026-11-18"`).
     - `accPart`: `tx.accountId.trim()`.
     - `typePart`: `tx.type || 'expense'`.
     - `catPart`: `tx.category.trim().replace(/\s+/g, ' ').toLowerCase()`.
     - `amtPart`: `Math.round(normalizeAbsAmount(tx.amount) * 100)` (presisi sen bilangan bulat, kebal galat *floating-point*).
     - `descPart`: `tx.description.trim().replace(/\s+/g, ' ').toLowerCase()`.
     - `adjPart`: `'adj' | 'std'`.
   - Sebelum memasukkan grup ke `sameDayDuplicateGroups`, indeks yang sudah tertangkap di `duplicateIdRowIndices` disaring terlebih dahulu agar pengembang dan pengguna tidak melihat entri ganda terhitung dua kali.

### 3. Matriks Perbaikan Anomali & Pengamanan Saldo GL

| Jenis Anomali | Kondisi Deteksi Kode | Keparahan | Dampak Saldo GL & Laporan | Mekanisme Perbaikan Aman | Pengaman & Idempotensi |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Transaksi Yatim (`missing_account_id` / `account_not_found`)** | `!tx.isAdjustment` dan `accountId` kosong atau tidak ada di `accounts[]` | Tinggi | Baris tetap terbaca di Laba-Rugi/Arus Kas, tetapi **hilang dari GL rekening** mana pun | **Opsi A**: Alihkan ke rekening valid via `reassignOrphanTransactionWithBalanceSync()`<br>**Opsi B**: Hapus permanen melalui `previewSafeAnomalyCleanupImpact` | Pengalihan memanggil `getTransactionAccountDelta(tx)` & `applyAccountBalanceChange(acc, delta)` sehingga `currentBalance` & `usedLimit` rekening tujuan langsung sinkron; hapus yatim tidak memotong rekening lain. |
| **Duplikat ID (`duplicate_id`)** | `byId.get(id).length > 1` | Kritis | Menggandakan nominal Laba-Rugi, Arus Kas, Sankey, serta mengacaukan primary key DB PostgreSQL | Hapus indeks `duplicateIndices` melalui `removeDuplicateTransactionsWithBalanceSync()` / `previewSafeAnomalyCleanupImpact()` | **Pengaman GL (`< 1`)**: Jika `|acc.currentBalance - glAfter.glCalculatedBalance| < 1`, saldo rekening dianggap *sudah* mengecualikan duplikat sehingga tidak dikurangi ganda (`glAlreadyExcludedCount` naik). |
| **Duplikat Identik Harian (`same_day_identical`)** | Sidik jari 7-kolom sama (`sig`) dengan `nonIdDupItems.length > 1` | Sedang / Peringatan | Menggandakan pencatatan belanja/pemasukan pada hari yang sama (sering terjadi akibat klik ganda impor) | Hapus `duplicateIndices` dengan tetap menjaga `keepIndex` pertama | Disaring terhadap `duplicateIdRowIndices` agar tidak tumpang tindih; membalik saldo kartu kredit tertaut (`acc-debt-${accId}`) jika merupakan pembayaran tagihan duplikat. |
| **Selisih Saldo Akun vs GL (`disc-acc-bal-*`)** | `|acc.currentBalance - gl.glCalculatedBalance| > 0` (`>= 100.000` berstatus `critical`) | Peringatan / Kritis | Neraca & total likuiditas tidak sesuai jumlah histori mutasi riil di Buku Besar | Rekonsiliasi target saldo ke nilai GL via `setAccountTargetBalance(acc, gl.glCalculatedBalance)` | Memperhitungkan `initialDebt` pada akun kredit/PayLater serta memperbarui `usedLimit = max(0, creditLimit - nextBalance)` secara otomatis. |
| **Kategori Tak Terdaftar di Master COA** | Kategori transaksi tidak ada pada daun pohon `masterCategories` | Info / Peringatan | Baris tidak teragregasi pada Laporan Pivot Bertingkat & pemetaan COA Laba-Rugi | Harmonisasi otomatis menambahkan node kategori ke kelompok pengeluaran/pendapatan di `masterCategories` | Memicu pemindaian ulang kode COA (`onRescanCoa`) setelah penyisipan kategori baru. |

---

## Rujukan Berkas Terkait
- Indeks Dokumentasi Utama: [`README.md`](./README.md)
- Referensi Arsitektur Sistem: [`ARCHITECTURE.md`](./ARCHITECTURE.md)
- Referensi Sinkronisasi Dua Arah: [`DATA_SYNCHRONIZATION_PROTOCOL.md`](./DATA_SYNCHRONIZATION_PROTOCOL.md)
- Kamus Tipe & Fungsi Inti: [`CORE_MODULES_AND_TYPES.md`](./CORE_MODULES_AND_TYPES.md)
