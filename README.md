# Nusantara Wealth

**Nusantara Wealth** adalah aplikasi manajemen keuangan pribadi dan keluarga berbasis web (*Full-Stack Progressive Web App*) yang mengintegrasikan pencatatan transaksi harian, penganggaran bulanan, pengelolaan utang & simulasi KPR, pelacakan investasi, dana darurat, laporan akuntansi standar, serta analisis cerdas bertenaga **Google Gemini AI** dengan dukungan sinkronisasi cloud **PostgreSQL (Neon)**.

---

## Daftar Isi

- [Fitur Utama](#-fitur-utama)
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

- **Sinkronisasi Cloud & Penanganan Konflik**: Data pengguna disinkronkan secara otomatis antara browser dan PostgreSQL (`/api/db/sync`). Jika terdapat perbedaan data antara perangkat lokal dan cloud, modal **Sync Conflict** memungkinkan pengguna memilih sumber data yang ingin dipertahankan.
- **Penyimpanan Lokal Terenkripsi**: Penyimpanan cache `LocalStorage` menggunakan lapisan enkripsi (`secureStorage`) agar informasi keuangan pengguna tidak tersimpan sebagai teks polos.
- **Proteksi Log Produksi**: Utilitas logger global menonaktifkan `console.log`/`info`/`debug`/`warn` di lingkungan produksi untuk mencegah kebocoran data finansial pada konsol browser.
- **Backup & Restore**: Fitur cadangkan (*export*) dan pulihkan (*import*) seluruh data aplikasi ke dalam berkas JSON melalui tombol **Backup** di header global.
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
