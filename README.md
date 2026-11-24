# Nusantara Wealth

**Nusantara Wealth** adalah aplikasi manajemen keuangan pribadi dan keluarga berbasis web (*Full-Stack Progressive Web App*) yang mengintegrasikan pencatatan transaksi harian, penganggaran bulanan, pengelolaan utang & simulasi KPR, pelacakan investasi, dana darurat, laporan akuntansi standar, serta analisis cerdas bertenaga **Google Gemini AI** dengan dukungan sinkronisasi cloud **PostgreSQL (Neon)**.

---

## Daftar Isi

- [Fitur Utama](#-fitur-utama)
- [Ringkasan Eksekutif AccountingEngine & Sinkronisasi Data](#-ringkasan-eksekutif-accountingengine--sinkronisasi-data)
- [Teknologi yang Digunakan](#-teknologi-yang-digunakan)
- [Struktur Navigasi Aplikasi](#-struktur-navigasi-aplikasi)
- [Keamanan, Sinkronisasi & PWA](#-keamanan-sinkronisasi--pwa)
- [Instalasi & Konfigurasi Lokal](#-instalasi--konfigurasi-lokal)
- [Cara Menggunakan Aplikasi](#-cara-menggunakan-aplikasi)
- [Ringkasan Endpoint API](#-ringkasan-endpoint-api)

---

## Fitur Utama

### 1. Ringkasan & Analisis
- **Dashboard Utama**:
  - Ringkasan posisi kekayaan bersih (*Net Worth*), total saldo kas & bank, pemasukan vs pengeluaran bulanan, serta grafik tren dan komposisi arus kas.
  - **Goal Tracker (Target Tabungan)**: Membuat dan memantau progres target tabungan (misalnya dana liburan atau DP rumah) lengkap dengan simulasi setoran.
  - **Mode Fokus Privasi**: Menyembunyikan nominal saldo sensitif di layar saat mengakses aplikasi di tempat umum.
  - **Kalkulator Pajak**: Estimasi pajak penghasilan berdasarkan riwayat pemasukan yang tercatat.
- **Asisten Cerdas AI (Google Gemini)**:
  - Analisis kesehatan arus kas dan rekomendasi anggaran otomatis berdasarkan pola transaksi nyata.
  - Deteksi anomali pengeluaran (*spend spikes*) dan transaksi mencurigakan.
  - Perbandingan pengeluaran antar bulan dan analisis tren 3 bulan terakhir.
  - Wawasan mingguan (*Weekly Insights*), simulator tabungan *What-If*, penjadwal prioritas utang AI, serta kalkulator **Zakat Mal & Zakat Profesi**.
- **Laporan & Akuntansi**:
  - Laporan keuangan terstruktur (*Hierarchical Pivot Report*), diagram aliran dana (**Sankey Flow Chart**), dan **Rasio Kesehatan Keuangan** (DTI, Rasio Tabungan, Rasio Likuiditas, Solvabilitas).
  - Proyeksi likuiditas jangka pendek–menengah, **Rekonsiliasi Ledger AI**, dan ekspor/cetak laporan PDF.

### 2. Operasional Harian
- **Jurnal Transaksi**:
  - Pencatatan transaksi lengkap untuk tipe **Pemasukan**, **Pengeluaran**, **Tabungan**, dan **Investasi** yang otomatis memperbarui saldo rekening, dana darurat, portofolio investasi, dan sisa pokok utang terkait.
  - **Input Natural Language AI**: Catat transaksi dengan kalimat bebas (misalnya *"Beli kopi 45rb pakai Gopay"*) untuk otomatis mengisi nominal, kategori, dan akun.
  - **Saran Kategori Otomatis**, **Transfer / Mutasi Antar Rekening**, dan **Transaksi Berulang (*Recurring*)** otomatis beserta pengingat jatuh tempo via Service Worker.
  - Pembaruan kategori transaksi secara massal (*batch update*).

### 3. Perencanaan & Anggaran
- **Rencana Anggaran (*Budgeting*)**:
  - Menetapkan batas anggaran bulanan per kategori pengeluaran, tabungan, atau investasi.
  - Visualisasi realisasi vs pagu anggaran (*Budget Gauge Chart*) serta rekomendasi **Budget Rebalancing**.
- **Dana Darurat**:
  - Kalkulator kebutuhan dana darurat ideal berdasarkan pengeluaran bulanan, stabilitas pekerjaan, dan jumlah tanggungan.
  - Pencatatan mutasi penambahan maupun pencairan dana darurat dengan pelacakan lokasi penyimpanan dana.

### 4. Portofolio & Utang
- **Investasi & Portofolio**:
  - Pencatatan aset investasi berbasis unit (`Gram`, `Lot`, `Lembar`, `Unit`), harga beli rata-rata, harga pasar terkini, pencatatan hasil pasif (dividen/kupon/bunga), dan riwayat perubahan harga (*Price History*).
  - Dilengkapi grafik ROI (**D3.js**), **Target Investasi**, **Simulasi Pertumbuhan Investasi**, **Kalkulator Inflasi & Daya Beli**, serta **Analisis Diversifikasi Portofolio AI** sesuai profil risiko (*Konservatif*, *Moderat*, *Agresif*).
- **Utang & Pelunasan (`DebtTab`)**:
  - **Kapasitas Pembayaran Utang (*Debt Service Ratio*)**: Menghitung otomatis rasio cicilan utang bulanan terhadap total pendapatan bulanan (dari transaksi atau **Simulasi Pendapatan Manual**), dilengkapi meteran risiko visual (`0%–50%+`), indikator tingkat risiko (*Risiko Rendah* ≤ 20%, *Terkendali* ≤ 30%, *Risiko Tinggi* > 30%, *Kritis* > 40%), peringatan otomatis saat melewati batas sehat **30%**, serta simulasi dampak apabila KPR baru ditambahkan.
  - **Kalkulator & Visualisasi Data KPR**: Mendukung skema **Berjenjang (Fixed → Floating)**, **Anuitas Efektif**, dan **Bunga Flat**. Menyajikan grafik **Recharts** bertumpuk untuk membandingkan **Porsi Pokok vs Porsi Bunga** (tampilan **Tahunan sepanjang tenor** maupun **Rincian 12 Bulan Pertama**), **Tren Sisa Pokok**, grafik donat komposisi bulan pertama, tabel amortisasi tahunan, serta tombol **Tambah ke Daftar Utang** yang langsung menyimpan hasil perhitungan ke daftar utang aktif.
  - **Tambah Utang & Hubungkan ke Akun Bank**: Opsi menghubungkan utang baru dengan akun kas/bank (otomatis membuat transaksi pengeluaran atau dana masuk saat disimpan).
  - **Bayar Cicilan dengan Proteksi Saldo**: Mencegah pembayaran cicilan melebihi saldo rekening sumber maupun sisa pokok utang, lengkap dengan notifikasi toast jika dana tidak mencukupi.
  - **Strategi Snowball & Avalanche** + **What-If Payoff Simulator**: Menghitung urutan pelunasan optimal serta simulasi percepatan bebas utang dengan cicilan ekstra atau *lump-sum* (bonus/THR).

### 5. Master Data & Konfigurasi Keuangan
- **Master Akun & Rekening**: Mengelola akun Kas Tunai, Rekening Bank, E-Wallet, Kartu Kredit, dan PayLater (termasuk limit kredit, limit terpakai, tanggal jatuh tempo, dan APR).
- **Master Kategori & COA (*Chart of Accounts*)**: Struktur kategori hierarkis yang terhubung dengan kode akun akuntansi (COA), visualisasi **Pohon Interaktif D3.js**, pembersihan kategori berbantuan AI, serta **Audit Integritas Akuntansi** (*Dual-Entry Ledger*).

---

## Ringkasan Eksekutif AccountingEngine & Sinkronisasi Data

Untuk menjaga konsistensi laporan keuangan dan saldo buku besar lintas perangkat, Nusantara Wealth memisahkan orkestrasi akuntansi deterministik dan persistensi database cloud ke dalam dua lapisan terintegrasi:

### 1. Alur Kerja `AccountingEngine` (`src/utils/accountingEngine.ts`)
- **Normalisasi Tanggal Lokal Bebas UTC**: Seluruh perhitungan memakai zona waktu lokal (`toLocalYYYYMMDD`, `parseLocalDate`, `normalizeLedgerDateYYYYMMDD` dengan cache LRU `4096` entri) agar transaksi jam `00:00–07:00` WIB tidak pernah bergeser H-1 ke bulan sebelumnya.
- **Klasifikasi 11 Sifat Akuntansi & Anti-Double-Counting**: Memisahkan arus **Operasional (`income`/`expense`)**, **Tabungan & Investasi**, **Transfer Internal**, **Belanja Non-Tunai Kartu Kredit/PayLater**, **Pelunasan Tagihan Kredit**, serta **Pemecahan Angsuran KPR (Pokok vs Bunga)** sehingga saldo tabungan bersih, kas tunai, ekuitas properti KPR, dan neraca selalu seimbang tanpa penghitungan ganda.
- **Mesin GL & Audit Integritas**: Menghitung saldo buku besar per akun (`calculateAccountGLBalance`), mendeteksi transaksi yatim maupun entri duplikat (`auditLedgerIntegrity`), menyimulasikan dampak koreksi saldo (`previewSafeAnomalyCleanupImpact`), dan membukukan penyusutan aset tetap akhir tahun secara otomatis (`Dr 5960 / Cr 1690`).
- **Visualisasi Sankey Berperforma Tinggi**: Modul `src/utils/cashFlowSankey.ts` membangun indeks periode berbasis `Map` (`O(1)` per periode `Semua`, `Bulanan`, `Kuartal`, `Tahunan`) yang dipadukan dengan `useTransition` dan paginasi `TransactionDrillDownTable` di `ReportsTab`.

### 2. Mekanisme Sinkronisasi Data (`PostgreSQL Single Source of Truth` & `Google Sheets`)
- **PostgreSQL sebagai Sumber Tunggal (*Single Source of Truth*)**: Seluruh data transaksi, rekening (termasuk `coaCode`), anggaran, utang & KPR, aset tetap, investasi & histori harga, dana darurat, transaksi berulang, target tabungan & investasi, hingga konfigurasi master (`coaList`, `masterCategories`, `kprPresets`, `kprCoaMapping`, `masterChangeLogs`) **dimuat langsung saat login dari `/api/db/sync` dan disimpan secara atomik di PostgreSQL**—tanpa menyimpan atau memulihkan data keuangan di `localStorage` browser maupun menimpa data pengguna dengan dataset sampel saat login di komputer berbeda.
- **Debounced Cloud Sync & Isolasi User**: Perubahan pada aplikasi memicu pembaruan terdeduplikasi (*payload signature*) ke `POST /api/db/sync` (debounce `450ms`), diproses dalam transaksi database PostgreSQL yang terisolasi per `userId` (`withDbRetry` + urutan penghapusan aman *foreign-key*).
- **Sinkronisasi Google Sheets Opsional**: Apabila pengguna mengaktifkan integrasi Google Sheets, sinkronisasi berjalan setelah hidrasi PostgreSQL selesai (`650ms` debounce dengan *chunking* `40.000` karakter per sel) dan membandingkan perbedaan paket melalui `SyncConflictModal` sebelum menulis ke PostgreSQL.

```mermaid
flowchart LR
    PG[(Neon PostgreSQL<br/>Single Source of Truth)] -->|GET /api/db/sync<br/>Hidrasi Penuh Saat Login| State[App State &<br/>Master COA/Kategori/KPR]
    State --> Engine[AccountingEngine<br/>Normalisasi Tanggal Lokal,<br/>11 Sifat Akuntansi & KPR]
    Engine --> UI[ReportsTab Sankey,<br/>Laporan & Audit Integritas]
    State -->|Debounce 450ms<br/>POST /api/db/sync| PG
    State <-->|Opsional 650ms<br/>SyncConflictModal| Sheets[(Google Sheets API)]
```

### 3. Panduan Teknis Mendalam (`/docs`)
Tim pengembang dan auditor dapat menelusuri dokumentasi teknis lengkap pada direktori `./docs`:
- **[Protokol Validasi Integritas Ledger & Panduan Modal](./docs/LedgerIntegrity.md)** — Diagram alur Mermaid siklus validasi integritas, matriks perbaikan anomali COA/transaksi, serta panduan langkah demi langkah `AccountingIntegrityModal`.
- **[Siklus Hidup AccountingEngine & Integritas Ledger](./docs/ACCOUNTING_ENGINE_LIFECYCLE_AND_INTEGRITY.md)** — Penjabaran lengkap 6 fase siklus hidup `AccountingEngine`, rumus klasifikasi KPR/kredit, dan algoritma audit GL.
- **[Protokol Sinkronisasi Data (PostgreSQL & Sheets)](./docs/DATA_SYNCHRONIZATION_PROTOCOL.md)** — Arsitektur hidrasi, skema transaksi atomik `/api/db/sync`, resolusi konflik, dan chunking Google Sheets API v4.
- **[Indeks Dokumentasi Teknis Lengkap](./docs/README.md)** — Peta seluruh dokumen arsitektur, API/database Drizzle, modul inti, dan katalog 53 komponen UI.

---

## Teknologi yang Digunakan

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, Motion
- **Visualisasi Data**: Recharts, D3.js (`d3`, `d3-sankey`), Lucide Icons
- **Backend**: Express.js (`server.ts`), `tsx`
- **Database**: PostgreSQL (Neon Cloud PostgreSQL via `pg` + SSL), Drizzle ORM
- **Kecerdasan Buatan**: `@google/genai` (Google Gemini API via endpoint server `/api/*`)
- **Utilitas Lain**: `jspdf` & `html2canvas` (ekspor laporan PDF), `googleapis` (integrasi Google Sheets opsional), Progressive Web App (`manifest.json` + `sw.js`)

---

## Struktur Navigasi Aplikasi

Menu samping (*sidebar*) pada layar desktop terkunci setinggi viewport penuh dengan area konten yang dapat digulir secara mandiri dan terbagi menjadi 5 kelompok:

1. **Ringkasan & Analisis**: *Dashboard Utama*, *Asisten Cerdas AI*, *Laporan & Akuntansi*
2. **Operasional Harian**: *Jurnal Transaksi*
3. **Perencanaan & Anggaran**: *Rencana Anggaran*, *Dana Darurat*
4. **Portofolio & Utang**: *Investasi & Portofolio*, *Utang & Pelunasan*
5. **Master Data & Konfigurasi Keuangan**: *Master Akun & Rekening*, *Master Kategori & COA*

---

## Keamanan, Sinkronisasi & PWA

- **PostgreSQL sebagai Sumber Tunggal (*Single Source of Truth*)**: Seluruh data finansial dan konfigurasi master (`Master COA`, kategori, KPR, `coaCode` rekening, dan log master) diambil dan disimpan langsung pada PostgreSQL (`/api/db/sync`) melalui query berparameter Drizzle ORM yang terisolasi per `userId`. Browser tidak lagi menyimpan salinan data keuangan di `LocalStorage`, sehingga membuka akun dari komputer yang berbeda selalu menampilkan data yang 100% identik.
- **Sinkronisasi Google Sheets & Penanganan Konflik**: Bila integrasi Google Sheets diaktifkan, perbedaan antara dataset PostgreSQL dan Google Sheets dideteksi otomatis dan diselesaikan lewat **Sync Conflict Modal**.
- **Penyimpanan Sesi Terenkripsi & Proteksi Log Produksi**: Sesi login pengguna (`fin_current_user`) dilindungi lapisan sandi (`secureStorage`), sedangkan utilitas logger global menonaktifkan `console.log`/`info`/`debug`/`warn` di lingkungan produksi untuk mencegah kebocoran data finansial pada konsol browser.
- **Backup & Restore**: Fitur cadangkan (*export*) dan pulihkan (*import*) seluruh data aplikasi ke dalam berkas JSON terenkripsi AES-GCM-256 melalui tombol **Backup** di header global.
- **Progressive Web App (PWA)**: Mendukung instalasi aplikasi ke perangkat serta pengingat transaksi berulang via Service Worker (`/sw.js`).

---

## Instalasi & Konfigurasi Lokal

### 1. Prasyarat
- **Node.js** versi `>= 20`
- **npm**
- Instance PostgreSQL (disarankan **Neon PostgreSQL**)
- Kunci API **Google Gemini** (`GEMINI_API_KEY`) untuk fitur AI penuh *(tersedia respons fallback otomatis apabila API key belum diisi)*

### 2. Instalasi Dependensi
```bash
npm install
```

### 3. Konfigurasi Variabel Lingkungan
Salin berkas `.env.example` menjadi `.env` lalu lengkapi nilainya:

```bash
cp .env.example .env
```

Variabel utama di `.env`:
```env
# API Key Google Gemini (untuk fitur Asisten AI, deteksi anomali, & input natural language)
GEMINI_API_KEY="your_gemini_api_key"

# URL Aplikasi
APP_URL="http://localhost:3000"

# Koneksi Database Utama Neon PostgreSQL
NEON_DATABASE_URL="postgresql://USER:PASSWORD@ep-your-endpoint.region.aws.neon.tech/neondb?sslmode=require"
DATABASE_URL="postgresql://USER:PASSWORD@ep-your-endpoint.region.aws.neon.tech/neondb?sslmode=require"
DATABASE_SSL_MODE="require"

# Opsional: Konfigurasi Firebase Web
FIREBASE_API_KEY=""
FIREBASE_AUTH_DOMAIN=""
FIREBASE_PROJECT_ID=""
FIREBASE_STORAGE_BUCKET=""
FIREBASE_MESSAGING_SENDER_ID=""
FIREBASE_APP_ID=""
```

### 4. Menjalankan Aplikasi
- **Mode Pengembangan (Development Server port `3000`)**:
  ```bash
  npm run dev
  ```
  Server otomatis melakukan migrasi/pengecekan skema tabel PostgreSQL saat startup (`ensureTablesExist`) dan menyajikan aplikasi di `http://localhost:3000`.

- **Pemeriksaan Tipe TypeScript**:
  ```bash
  npm run lint
  ```

- **Build & Menjalankan Mode Produksi**:
  ```bash
  npm run build
  npm start
  ```

---

## Cara Menggunakan Aplikasi

### Langkah 1: Masuk atau Buat Akun
1. Buka aplikasi di browser (`http://localhost:3000`).
2. Pada halaman login, klik tab **Daftar Akun Baru** untuk membuat akun pengguna baru (atau masuk dengan kredensial yang sudah terdaftar).
3. Saat pertama kali masuk, ikuti panduan singkat (*Onboarding*) atau langsung mulai menata rekening awal Anda.

### Langkah 2: Atur Master Akun & Kategori
1. Buka menu **Master Akun & Rekening** untuk menambahkan dompet tunai, rekening bank, e-wallet, kartu kredit, atau akun paylater beserta saldo awal.
2. Buka **Master Kategori & COA** jika ingin menyesuaikan hierarki kategori pemasukan/pengeluaran atau memeriksa pemetaan kode akuntansi melalui **Audit Integritas Akuntansi** di header atas.

### Langkah 3: Tetapkan Anggaran & Dana Darurat
1. Masuk ke **Rencana Anggaran** untuk mengisi batas pengeluaran bulanan setiap kategori.
2. Buka **Dana Darurat** untuk menghitung target dana darurat ideal sesuai jumlah tanggungan dan stabilitas penghasilan Anda.

### Langkah 4: Catat Transaksi Harian & Transaksi Berulang
1. Buka **Jurnal Transaksi** untuk mencatat pemasukan, pengeluaran, mutasi transfer antar rekening, tabungan, maupun pembelian/penjualan investasi.
2. Gunakan kolom input pintar (*Natural Language*) jika ingin mencatat cepat dengan kalimat sehari-hari.
3. Aktifkan **Transaksi Berulang** untuk tagihan rutin (seperti internet, listrik, atau gaji) agar tercatat otomatis sesuai tanggal jatuh tempo.

### Langkah 5: Kelola Utang, Simulasi KPR & Cek Kapasitas Bayar
1. Buka menu **Utang & Pelunasan**.
2. Di panel teratas **Kapasitas Pembayaran Utang**, periksa rasio cicilan utang terhadap pendapatan bulanan Anda. Jika rasio melebihi **30%**, ikuti saran pelunasan prioritas yang ditampilkan. Anda juga dapat menekan **Ubah / Simulasi Pendapatan** untuk menguji skenario penghasilan berbeda.
3. Pada **Model Perhitungan KPR**, masukkan harga properti, uang muka (DP), tenor, dan skema bunga (*Berjenjang Fixed → Floating*, *Anuitas*, atau *Flat*). Amati rincian **Grafik Recharts** (*Tahunan*, *Rincian 12 Bulan Pertama*, dan *Tren Sisa Pokok*) lalu klik **Tambah ke Daftar Utang** untuk langsung menyimpannya ke daftar kewajiban aktif.
4. Untuk mencatat utang manual, gunakan formulir **Tambah Hutang** (tersedia toggle **Hubungkan ke Akun Bank** untuk sinkronisasi transaksi pengeluaran/pencairan otomatis).
5. Untuk melunasi cicilan, buka tab **Bayar Cicilan**—sistem otomatis memvalidasi kecukupan saldo rekening sumber sebelum transaksi diproses.
6. Gunakan toggle **Snowball / Avalanche** dan **Simulator What-If** di bagian bawah untuk merencanakan percepatan bebas utang.

### Langkah 6: Pantau Investasi, Laporan & Analisis AI
1. Catat portofolio di **Investasi & Portofolio** dan pantau dampaknya terhadap inflasi serta proyeksi target aset Anda.
2. Buka **Laporan & Akuntansi** untuk melihat aliran kas (*Sankey*), pivot laporan, dan rasio kesehatan finansial, atau ekspor laporan ke PDF.
3. Gunakan **Asisten Cerdas AI** kapan saja untuk mendapatkan ringkasan evaluasi keuangan, deteksi anomali pengeluaran, serta rekomendasi penyesuaian anggaran.
4. Gunakan tombol **Backup** di header atas secara berkala untuk menyimpan salinan cadangan data Anda.

---

## Ringkasan Endpoint API

| Method | Endpoint | Fungsi |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Pemeriksaan status server |
| `GET` | `/api/db/health` | Pemeriksaan koneksi database PostgreSQL |
| `POST` | `/api/db/auth/register` | Registrasi akun pengguna baru |
| `POST` | `/api/db/auth/login` | Autentikasi pengguna |
| `POST` | `/api/db/auth/forgot-password` | Pemulihan kata sandi pengguna |
| `GET` / `POST` | `/api/db/sync` | Mengambil dan menyinkronkan data keuangan ke PostgreSQL |
| `POST` | `/api/analyze` | Analisis keuangan menyeluruh oleh Gemini AI |
| `POST` | `/api/detect-anomalies` | Deteksi anomali & lonjakan pengeluaran oleh AI |
| `POST` | `/api/compare-monthly-expenses` | Perbandingan pengeluaran antar bulan oleh AI |
| `POST` | `/api/analyze-3month-trend` | Analisis tren pengeluaran 3 bulan terakhir oleh AI |
| `POST` | `/api/weekly-insights` | Wawasan pengeluaran mingguan oleh AI |
| `POST` | `/api/suggest-category` | Saran kategori transaksi otomatis oleh AI |
| `POST` | `/api/parse-natural-transaction` | Parsing kalimat transaksi natural language oleh AI |
| `POST` | `/api/analyze-diversification` | Evaluasi diversifikasi portofolio investasi oleh AI |
| `POST` | `/api/suggest-category-cleanup` | Rekomendasi perapihan kategori master COA oleh AI |
