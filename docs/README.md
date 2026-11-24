# Dokumentasi Teknis Nusantara Wealth

Dokumentasi komprehensif aplikasi **Nusantara Wealth** — sistem manajemen keuangan pribadi berbasis *double-entry personal accounting*, perencanaan anggaran, portofolio investasi & aset tetap, simulasi pelunasan utang & KPR, serta wawasan analitik berbasis Gemini AI.

---

## Peta Dokumentasi (`/docs`)

| Berkas | Cakupan Utama |
| :--- | :--- |
| **[ACCOUNTING_ENGINE_LIFECYCLE_AND_INTEGRITY.md](./ACCOUNTING_ENGINE_LIFECYCLE_AND_INTEGRITY.md)** | **Panduan Teknis Mendalam (Bahasa Indonesia)**: Siklus hidup lengkap 6-fase `AccountingEngine` (normalisasi tanggal cache `4096`, 11 sifat akuntansi, pemisahan KPR, anti-double-counting, penyusutan akhir tahun `5960/1690`), serta **Protokol Penuh Validasi Integritas *Ledger*** lengkap dengan diagram alur kode dan matriks perbaikan anomali (`auditLedgerIntegrity`, `calculateAccountGLBalance`, `previewSafeAnomalyCleanupImpact`). |
| **[DATA_SYNCHRONIZATION_PROTOCOL.md](./DATA_SYNCHRONIZATION_PROTOCOL.md)** | **Panduan Teknis Mendalam (Bahasa Indonesia)**: Mekanisme sinkronisasi data dua arah antara **Lokal Terenkripsi (`150ms`)**, **Neon PostgreSQL (`450ms`)**, dan **Google Sheets (`650ms`)**, mencakup hidrasi login, `SyncConflictModal` & `mergeSyncData`, deduplikasi signature, transaksi atomik server (`withDbRetry` + urutan DELETE aman FK), isolasi `${userId}_`, serta chunking `40.000` karakter Google Sheets API v4. |
| **[ARCHITECTURE.md](./ARCHITECTURE.md)** | Arsitektur full-stack (React 19 + Vite + Express + Neon PostgreSQL), alur state di `src/App.tsx`, navigasi `NAV_GROUPS`, persistensi `secureStorage` ter-batch (`150ms`), cadangan terenkripsi AES-GCM-256, sinkronisasi cloud & deteksi konflik, Google Sheets/Firebase Auth, dan PWA Service Worker (`public/sw.js`). |
| **[ACCOUNTING_ENGINE.md](./ACCOUNTING_ENGINE.md)** | Aturan akuntansi pribadi, standar tanggal lokal bebas UTC & cache `normalizeLedgerDateYYYYMMDD`, Chart of Accounts (`1xxx–5xxx`), 11 klasifikasi transaksi, Laba-Rugi Operasional, Arus Kas 3 pilar, Neraca & properti KPR anti-double-counting, proyeksi Net Worth 6+3 bulan, CFP 4 rasio kesehatan, skema KPR & penyusutan aset tetap otomatis, Pajak UU HPP 2026 & Zakat, strategi utang Avalanche/Snowball rollover, serta ringkasan alur kerja `AccountingEngine`. |
| **[API_AND_DATABASE.md](./API_AND_DATABASE.md)** | Spesifikasi backend (`server.ts`, `src/server/api.ts`), skema Drizzle ORM 13 tabel Neon PostgreSQL (`src/db/schema.ts`), migrasi & perbaikan FK (`src/db/index.ts`), mekanisme isolasi user `X-User-Id` & prefix `${userId}_`, endpoint REST `/api/db/*`, 13 endpoint AI (`gemini-2.5-flash` & `gemini-4-hydrogen`), serta ringkasan kontrak sinkronisasi database. |
| **[CORE_MODULES_AND_TYPES.md](./CORE_MODULES_AND_TYPES.md)** | Referensi super detail seluruh tipe data & interface (`src/types.ts`), seluruh fungsi di `src/utils/accountingEngine.ts`, pre-indexing `Map` periode `src/utils/cashFlowSankey.ts`, sistem COA & integritas master (`src/coaUtils.ts`), hirarki kategori (`src/categoryHierarchy.ts`), preset & mapping KPR (`src/utils/kprPresets.ts`), klien HTTP PostgreSQL (`src/apiClient.ts`), utilitas ekspor CSV/PDF, enkripsi, formatter, logger, toast, dan data awal (`src/initialData.ts`). |
| **[COMPONENTS_AND_EXTENSION_GUIDE.md](./COMPONENTS_AND_EXTENSION_GUIDE.md)** | Katalog lengkap seluruh **53 komponen React** di `src/components/` lengkap dengan seluruh *exports*, tanda tangan `Props`, dan perilaku akuntansi/performa internal (termasuk `SankeyCashFlowSummary`, `TransactionDrillDownTable`, `LaporanLabaRugi`, `HierarchicalPivotReport`), ditambah panduan pengembangan lanjutan & pola optimasi dataset besar. |

---

## Ringkasan Kapabilitas Aplikasi

1. **Jurnal & Multi-Akun**: Pencatatan transaksi `income`, `expense`, `transfer`, `saving`, `investment` lintas akun `cash`, `bank`, `e-wallet`, `credit_card`, dan `paylater`, termasuk deteksi transaksi rutin berulang (*recurring*) dan penyesuaian non-kas.
2. **Double-Entry Personal Accounting**: Pemetaan otomatis kategori ke Chart of Accounts (`1xxx–5xxx`), pemisahan beban bunga & angsuran pokok KPR, koreksi basis ekuitas properti KPR agar tidak terjadi penghitungan ganda aset vs liabilitas, serta audit integritas *General Ledger* (`auditLedgerIntegrity`).
3. **Dashboard, Sankey Cash Flow, & Pusat Laporan Tanpa Jank**: Kartu *Ringkasan Pencapaian Tabungan* (`SavingsAchievementCard`), visualisasi aliran kas **Sankey + Ringkasan Arus Kas (`SankeyCashFlowSummary`) + `TransactionDrillDownTable`**, serta perluasan indeks periode berbasis `Map` (`SankeyPeriodIndex`) dan React `useTransition` (dengan indikator status *"Memperbarui..."*) di seluruh tab periode `ReportsTab` (`Arus Kas`, `Sankey`, `LaporanLabaRugi`, `HierarchicalPivotReport`, serta analitik tren/YoY/heatmap).
4. **Perencanaan, Simulasi, & DRIP Investasi**: Rencana Anggaran & *Budget Rebalancing*, Dana Darurat, Target Investasi (`InvestmentGoalSection`), Simulator *What-If*, Kalkulator Reinvestasi Dividen (`DividendReinvestmentModal` dengan ekstraksi ticker otomatis & grounding pasar Gemini AI), Kalkulator Daya Beli Inflasi, serta Kalkulator Pajak PPh 21 / PPh OP (UU HPP 5 lapis + UMKM PP 55/2022 + Freelance NPPN 50%) & Zakat.
5. **Utang, KPR & Aset**: Manajemen utang konsumtif/produktif, penjadwal prioritas **Avalanche vs Snowball** dengan *monthly freed payment rollover*, kalkulator amortisasi KPR (`annuity`, `tiered`, `flat`), penyusutan tahunan otomatis aset tetap (`Dr 5960 / Cr 1690`), dan histori harga investasi.
6. **Sinkronisasi, Backup & Ekspor**: Persistensi lokal terenkripsi (`NW_ENC_V1`) berbasis batch dirty-check (`150ms`), sinkronisasi otomatis Neon PostgreSQL (`450ms` debounce + deduplikasi signature payload + `SyncConflictModal`), dukungan Google Sheets (`650ms` debounce + chunking `40.000` karakter per baris), ekspor CSV/PDF laporan keuangan & portofolio, serta cadangan JSON terenkripsi PBKDF2 + AES-GCM-256.

---

## Stack Teknologi (`package.json`)

| Lapisan | Teknologi & Versi |
| :--- | :--- |
| **Frontend UI** | React `^19.0.1`, React DOM `^19.0.1`, TypeScript `~5.8.2`, Tailwind CSS `^4.1.14` (`@tailwindcss/vite`), Lucide React `^0.546.0`, Motion `^12.23.24` |
| **Visualisasi Data** | D3 `^7.9.0`, `d3-sankey` `^0.12.3`, Recharts `^3.9.2` |
| **Ekspor Dokumen** | `jspdf` `^4.2.1`, `html2canvas` `^1.4.1` |
| **Backend & Server** | Express `^4.21.2`, Vite `^6.2.3` (middleware mode pada dev), `tsx` `^4.21.0`, `esbuild` `^0.25.0`, `dotenv` `^17.2.3` |
| **Database & ORM** | PostgreSQL (`pg` `^8.22.0`, Neon SSL), Drizzle ORM `^0.45.2`, `drizzle-kit` `^0.31.10` |
| **AI & Integrasi Eksternal** | `@google/genai` `^3.6.1`, Firebase `^12.16.0`, `googleapis` `^173.0.0` |

---

## Struktur Direktori Proyek

```text
/
├── .env.example                 # Template variabel lingkungan (Gemini, App URL, Firebase, Neon DB)
├── index.html                   # Entry HTML, Google Fonts, manifest PWA, meta tags
├── package.json                 # Skrip NPM & dependensi runtime/dev
├── server.ts                    # Server Express utama (port 3000), Vite dev/static, & 12 endpoint Gemini AI
├── public/
│   ├── manifest.json            # Konfigurasi Web App Manifest PWA
│   └── sw.js                    # Service Worker PWA (cache strategi + notifikasi tagihan <= 3 hari)
├── docs/                        # Dokumentasi teknis terstruktur (berkas ini)
└── src/
    ├── main.tsx                 # Entry point React, initGlobalLogger, registrasi /sw.js, ThemeProvider
    ├── App.tsx                  # Orchestrator state, NAV_GROUPS, handler domain, & auto-sync cloud/lokal
    ├── ThemeContext.tsx         # Context tema (light mode aktif)
    ├── index.css                # Entry Tailwind CSS v4
    ├── types.ts                 # Definisi seluruh tipe domain & interface laporan
    ├── initialData.ts           # Dataset demo awal (akun, anggaran, transaksi, utang, investasi, rutin)
    ├── coaUtils.ts              # Chart of Accounts (DEFAULT_COA_LIST), log master, sinkronisasi & scan duplikat
    ├── categoryHierarchy.ts     # Pohon kategori bertingkat & pemetaan kategori -> COA
    ├── apiClient.ts             # Klien fetch ke /api/db/* & parser koneksi PostgreSQL
    ├── googleSheets.ts          # Integrasi Firebase Google Auth & Google Sheets chunked sync
    ├── db/
    │   ├── drizzle.config.ts    # Konfigurasi Drizzle Kit (schema.ts -> PostgreSQL)
    │   ├── index.ts             # Pool PG Neon, ensureTablesExist, fixFkConstraints, dengan retry & SSL
    │   └── schema.ts            # Skema 13 tabel Drizzle ORM PostgreSQL
    ├── server/
    │   └── api.ts               # Router Express /api/db (auth, schema diagnostics, init-user, /sync)
    ├── utils/
    │   ├── accountingEngine.ts  # Inti logika akuntansi, cache tanggal, KPR, penyusutan, CFP ratios, audit GL
    │   ├── cashFlowSankey.ts    # Pre-indexing periode O(1) (SankeyPeriodIndex) & agregator arus kas Sankey
    │   ├── cryptoBackup.ts      # Enkripsi & dekripsi cadangan JSON (PBKDF2 100k SHA-256 + AES-GCM-256)
    │   ├── dbLogger.ts          # Buffer log koneksi & operasi database (maks 20 entri)
    │   ├── exportFinancialReports.ts # Ekspor CSV & PDF Laba-Rugi, Neraca, Arus Kas, Anggaran, & Ringkasan Bulanan
    │   ├── exportInvestment.ts  # Ekspor CSV & PDF portofolio investasi
    │   ├── formatters.ts        # Formatter IDR & parser input angka terformat
    │   ├── kprPresets.ts        # Preset penutupan KPR (DP, BPHTB, Provisi, Notaris) & mapping COA KPR
    │   ├── logger.ts            # Wrapper global console logger (mematikan log debug di production)
    │   ├── secureStorage.ts     # Wrapper localStorage tersandi ringan (NW_ENC_V1:)
    │   ├── syncConflictDetector.ts # Ringkasan paket data, deteksi konflik lokal vs cloud, & smart merge
    │   └── toast.ts             # Store pub-sub notifikasi toast global
    └── components/              # 53 komponen React UI, visualisasi D3, & modal analitik
```

---

## Setup Lokal & Skrip NPM

### Variabel Lingkungan (`.env.example`)
Salin `.env.example` menjadi `.env` saat menjalankan secara lokal:
- `GEMINI_API_KEY`: API key Gemini untuk 12 endpoint analitik AI di `server.ts`.
- `APP_URL`: URL publik applet/server.
- `NEON_DATABASE_URL` / `DATABASE_URL` & `DATABASE_SSL_MODE="require"`: Koneksi utama Neon PostgreSQL.
- `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, `FIREBASE_STORAGE_BUCKET`, `FIREBASE_MESSAGING_SENDER_ID`, `FIREBASE_APP_ID`: Opsional untuk autentikasi & konfigurasi Firebase client via `/api/firebase-config`.

### Skrip NPM (`package.json`)
| Skrip | Perintah | Fungsi |
| :--- | :--- | :--- |
| `npm run dev` | `tsx server.ts` | Menjalankan Express + Vite middleware pada **port 3000**. |
| `npm run build` | `vite build && esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs` | Membangun frontend ke `dist/` dan membundel backend ke `dist/server.cjs`. |
| `npm start` | `node dist/server.cjs` | Menjalankan server produksi yang telah dibundel. |
| `npm run lint` | `tsc --noEmit` | Verifikasi tipe TypeScript penuh tanpa menghasilkan artefak build. |
| `npm run clean` | `rm -rf dist server.js` | Membersihkan hasil build. |

---

## Ringkasan Audit & Perbaikan Perhitungan Akuntansi Pribadi

Audit menyeluruh terhadap seluruh kalkulasi akuntansi pribadi di aplikasi telah dilakukan dan diselesaikan langsung pada kode sumber:

1. **Penghapusan Pergeseran Tanggal UTC (`toISOString().split('T')[0]`)**: Seluruh tanggal transaksi, penyusutan, histori harga, arus kas, dan filter rentang tanggal kini memakai format lokal (`toLocalYYYYMMDD`, `parseLocalDate`, `normalizeLedgerDateYYYYMMDD`) sehingga pengguna di WIB/WITA/WIT tidak mengalami pergeseran H-1 pada jam `00:00–07:00`.
2. **Pencegahan Double-Counting Tabungan Bersih (*Net Savings*)**: Saldo tabungan bersih di Dashboard dan Laporan kini dihitung murni dari arus operasional bersih (`operatingIncome - operatingExpense`), bukan menjumlahkan transfer tabungan ke arus kas masuk/keluar operasional.
3. **Pemisahan Pengeluaran Non-Tunai Kartu Kredit & PayLater**: Transaksi berbasis `credit_card` / `paylater` dikecualikan dari arus kas keluar tunai pada laporan Arus Kas dan Proyeksi Likuiditas, sementara pelunasan tagihannya dihitung saat kas benar-benar keluar.
4. **Rasio Likuiditas Jangka Pendek (`LiquidityProjectionCard` & CFP)**: Pembagi rasio lancar memperhitungkan kewajiban jangka pendek aktual (tagihan kartu kredit/paylater + porsi utang jatuh tempo <= 12 bulan), bukan membagi dengan total utang jangka panjang seperti pokok KPR 15 tahun.
5. **Kelengkapan Lapisan 5 Pajak UU HPP (35%)**: Pada `TaxCalculatorCard`, profil pekerja bebas (*Freelance NPPN 50%*) kini menyertakan lapisan ke-5 (`> Rp 5 Miliar` dengan tarif `35%`) selaras dengan profil karyawan.
6. **Basis Bulan Dinamis Zakat Profesi**: Basis kalkulasi Zakat pada `ReportsTab` menggunakan bulan aktif/terpilih secara dinamis agar tidak terkunci pada bulan kalender saat ini saja.
7. **Rollover Strategi Pelunasan Utang (`DebtPriorityScheduler`)**: Simulasi Snowball dan Avalanche meneruskan cicilan utang yang sudah lunas ke prioritas utang berikutnya secara berantai (*freed monthly rollover*).
8. **Pemulihan Unit & Biaya Rata-Rata Investasi Saat Penghapusan Transaksi**: Menghapus transaksi beli/jual investasi di `App.tsx` mengembalikan kuantitas unit dan `initialCapital` secara proporsional.
9. **Konsistensi Kalkulator *What-If*, *DCA*, & *Investment Goal***: Perhitungan imbal hasil majemuk bulanan dan durasi pencapaian target dinormalisasi untuk kasus kontribusi nol, bunga nol, atau saldo awal nol.
