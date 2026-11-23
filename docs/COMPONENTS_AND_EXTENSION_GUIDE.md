# Katalog 51 Komponen UI & Panduan Pengembangan Lanjutan

Dokumen ini mendata seluruh **51 komponen React** pada `src/components/` beserta ukuran berkas, simbol ekspor, interface `Props`, peran domainnya, serta panduan terstruktur untuk menambah fitur baru di masa mendatang.

---

## 1. Shell, Autentikasi, Navigasi, & Utilitas UI (7 Komponen)

| Berkas & Ukuran | Exports & `Props` | Peran Utama |
| :--- | :--- | :--- |
| `LoginScreen.tsx` (677L) | `LoginScreen` (`onLoginSuccess: (user: User, dataChoice: 'empty' \| 'sample') => void`) | Layar login/registrasi PostgreSQL, akun demo `ariesD`, mode Guest lokal, & login Google Sheets. |
| `OnboardingModal.tsx` (319L) | `OnboardingModal` (`isOpen`, `onClose`, `username`, `isCloudSyncActive`) | Panduan langkah awal untuk pengguna baru. |
| `GlobalUserMenu.tsx` (44L) | `GlobalUserMenu` (`currentUser`, `onLogout`) | Dropdown profil pengguna & pemicu modal keluar. |
| `GlobalToastContainer.tsx` (65L) | `GlobalToastContainer` | Subscriber global yang merender tumpukan notifikasi toast dari `src/utils/toast.ts`. |
| `FormattedNumberInput.tsx` (59L) | `FormattedNumberInputProps`, `FormattedNumberInput` | Input angka terformat pemisah ribuan Indonesia (`1.000.000`) dengan konversi numerik bersih. |
| `ErrorBoundary.tsx` (86L) | `ErrorBoundary` (`children`, `fallbackTitle?`, `onReset?`) | Penangkap error render React per tab agar kegagalan satu modul tidak meruntuhkan seluruh aplikasi. |
| `ThemeContext.tsx` (`src/`) | `ThemeProvider`, `useTheme` | Pengelola tema terang (*light mode*) global. |

---

## 2. Tab Inti Dashboard, Transaksi, & Analitik AI (6 Komponen)

| Berkas & Ukuran | Exports & `Props` | Peran Utama |
| :--- | :--- | :--- |
| `DashboardTab.tsx` (5557L) | `DashboardTab`, `NeracaKekayaanBersih`, `TrendNetWorthChart`, `WawasanAI`, `FixedAssetDepreciationDetail`, `NetWorthModalCategory`, `FixedAssetModalRow` (`transactions`, `accounts`, `budgets`, `debts`, `emergencyTransactions`, `investments`, `fixedAssets?`, `savingsGoals?`, handler navigasi & penyusutan) | Pusat ringkasan finansial: Net Worth, Laba-Rugi bulan berjalan, kartu pencapaian tabungan, tren Net Worth 6+3 bulan, panel kesehatan CFP, wawasan mingguan, dan rincian modal aset/utang/penyusutan. |
| `SavingsAchievementCard.tsx` (1041L) | `SavingsAchievementCard` (`budgets`, `transactions`, `savingsGoals`, `activeMonthStr`, `activeMonthLabel`, `formatValue`, `onOpenBudgetTab`, handler CRUD `savingsGoals`) | Kartu ringkasan pencapaian tabungan dengan **grafik cincin konsentris ganda** (progres Rencana Anggaran Tabungan bulan berjalan vs akumulasi Target Tabungan), CRUD Target Tabungan, serta **proyeksi tanggal pencapaian target berbasis AI** (`/api/savings-projection`) otomatis dengan jeda singkat + tombol muat ulang. |
| `DashboardFinancialHealthPanel.tsx` (412L) | `DashboardFinancialHealthPanel` (`transactions`, `accounts`, `debts`, `investments`, `emergencyTransactions`, `fixedAssets?`, `isFocusMode?`, `onOpenReports?`) | Panel ringkasan 4 rasio kesehatan CFP & skor agregat pada Dashboard. |
| `TransactionsTab.tsx` (4054L) | `TransactionsTab` (`transactions`, `accounts`, `budgets`, `debts`, `investments`, `recurringTransactions?`, `masterCategories?`, `kprCoaMapping?`, `onAddTransaction`, `onDeleteTransaction`, dll.) | Jurnal transaksi harian, input natural language AI (`/api/parse-natural-transaction`), saran kategori AI (`/api/suggest-category`), pengelola transaksi berulang (*recurring*), transfer antar akun, dan pencatatan angsuran utang/KPR. |
| `AiAnalysisTab.tsx` (2645L) | `AiAnalysisTab`, `runDebtPayoffSimulation`, `DebtPayoffItem`, `DebtPayoffSimulationResult` (`transactions`, `budgets`, `accounts?`, `debts`, `emergencyConfig`, `emergencyBalance`, `investments`, `masterCategories?`) | Pusat asisten AI (skor kesehatan `/api/analyze`, anomali `/api/detect-anomalies`, perbandingan bulanan `/api/compare-monthly-expenses`, tren 3 bulan `/api/analyze-3month-trend`, konsolidasi kategori, dan simulasi utang). |
| `MonthlyExpenseD3TrendChart.tsx` (486L) | `MonthlyExpenseD3TrendChart` (`transactions`) | Grafik tren pengeluaran bulanan interaktif berbasis D3. |

---

## 3. Anggaran, Dana Darurat, Likuiditas, Pajak, & Simulator (9 Komponen)

| Berkas & Ukuran | Exports & `Props` | Peran Utama |
| :--- | :--- | :--- |
| `BudgetTab.tsx` (821L) | `BudgetTab` (`accounts`, `budgets`, `transactions`, `masterCategories?`, `onUpdateBudgetLimit`, `onAddBudgetCategory`, handler edit/hapus) | Manajemen batas anggaran bulanan per kategori (`expense`, `saving`, `investment`) & realisasi bulan terpilih. |
| `BudgetGaugeChart.tsx` (343L) | `BudgetGaugeChart` (`budgets`, `transactions`, `masterCategories?`) | Grafik gauge visual tingkat pemakaian anggaran secara real-time. |
| `BudgetRebalancingCard.tsx` (387L) | `BudgetRebalancingCard`, `RebalanceSuggestion` (`budgets`, `transactions`, `onUpdateBudgetLimit`, `selectedMonthStr?`) | Rekomendasi penyeimbangan ulang pos anggaran berdasarkan realisasi histori. |
| `EmergencyFundTab.tsx` (458L) | `EmergencyFundTab` (`config`, `transactions`, `onUpdateConfig`, `onAddTransaction`, `onDeleteTransaction`) | Perhitungan target dana darurat dinamis (`jobStability` & `dependents` x `monthlyExpense`) & buku mutasi dana darurat. |
| `LiquidityProjectionCard.tsx` (487L) | `LiquidityProjectionCard` (`transactions`, `accounts`, `debts`, `emergencyTransactions?`, `emergencyBalance?`) | Rasio lancar (*Current Ratio*) dengan pemisahan kewajiban jangka pendek (CC/PayLater + porsi 12 bulan utang) serta pengecualian belanja non-tunai kartu kredit. |
| `FinancialHealthRatios.tsx` (218L) | `FinancialHealthRatios` (`transactions`, `accounts`, `debts`, `investments`, `emergencyTransactions?`, `fixedAssets?`) | Kartu rincian 4 indikator CFP (*DTI, Savings Ratio, Emergency Months, Liquidity Ratio*). |
| `TaxCalculatorCard.tsx` (472L) | `TaxCalculatorCard`, `TaxProfileType`, `PTKPOption`, `PTKP_LIST` (`transactions`, `className?`) | Kalkulator PPh 21 Karyawan (5 lapis UU HPP), UMKM PP 55/2022 (`0% <= 500jt`, `0.5% > 500jt`), dan Freelance NPPN 50% (5 lapis UU HPP termasuk lapis `35% > Rp 5M`). |
| `WhatIfSavingsSimulator.tsx` (441L) | `WhatIfSavingsSimulator` (`transactions`, `accounts?`, `emergencyBalance?`, `budgets?`) | Simulator skenario *What-If* perubahan pengeluaran/tabungan bulanan terhadap akumulasi kekayaan di masa depan. |
| `InflationPurchasingPowerCalculator.tsx` (419L) | `InflationPurchasingPowerCalculator` (`investments?`) | Kalkulator pengikisan daya beli inflasi terhadap nilai riil aset dan target dana masa depan. |

---

## 4. Laporan Akuntansi, Master Kategori, COA, & Integritas (13 Komponen)

| Berkas & Ukuran | Exports & `Props` | Peran Utama |
| :--- | :--- | :--- |
| `ReportsTab.tsx` (2118L) | `ReportsTab` (`transactions`, `accounts`, `budgets`, `debts`, `investments`, `emergencyTransactions`, `fixedAssets?`, `masterCategories?`, handler ekspor & penyesuaian) | Pusat laporan resmi (Laba-Rugi, Neraca, Arus Kas, Pivot COA, Zakat Profesi dinamis per bulan terpilih, Tax Calculator, Ekspor CSV/PDF). |
| `LaporanLabaRugi.tsx` (2549L) | `LaporanLabaRugi`, `IncomeStatementPeriodRange` (`transactions`, `accounts?`, `masterCategories?`, `kprCoaMapping?`, `onExportMonthCSV?`, `onExportMonthPDF?`) | Laporan Laba-Rugi Operasional rinci per periode, pemisahan bunga KPR, serta ringkasan eksekutif AI (`/api/income-statement-summary`). |
| `HierarchicalPivotReport.tsx` (479L) | `HierarchicalPivotReport` (`transactions`, `masterCategories`, `kprCoaMapping?`) | Tabel pivot bertingkat berbasis hirarki kategori dan kode COA. |
| `SankeyFlowChart.tsx` (599L) | `SankeyFlowChart` (`transactions`, `accounts?`, `debts?`) | Diagram aliran dana Sankey (`d3-sankey`) dari sumber pemasukan ke pengeluaran, tabungan, investasi, dan cicilan utang/KPR dengan filter periode lokal & klik *drill-down* rincian transaksi. |
| `AdjustingEntriesPanel.tsx` (733L) | `AdjustingEntriesPanel`, `AdjustingEntryDraft` (`transactions`, `investments`, `debts`, `kprCoaMapping?`, `coaList?`, `onApplyAdjustments`, `onReverseAdjustment`) | Panel pembuatan & pembalikan jurnal penyesuaian non-kas (penyusutan, akrual, revaluasi). |
| `MasterCategoryManager.tsx` (2928L) | `MasterCategoryManager` (`categories`, `accounts?`, `transactions?`, `kprPresets?`, `kprCoaMapping?`, handler CRUD kategori, COA, & KPR) | Pengelola master pohon kategori, kode COA (`1xxx–5xxx`), konsolidasi AI, log perubahan, dan panel preset KPR. |
| `CategoryTreeDiagram.tsx` (457L) | `CategoryTreeDiagram` (`categories`, `transactions?`) | Visualisasi pohon kategori statis/terstruktur. |
| `D3CoaInteractiveTree.tsx` (510L) | `D3CoaInteractiveTree` (`categories`, `coaList?`, `transactions`, `onReassignCategory`) | Pohon COA interaktif D3 yang mendukung peninjauan dan pemindahan kategori transaksi. |
| `AccountsTab.tsx` (1256L) | `AccountsTab` (`accounts`, `transactions`, `onUpdateAccountBalance`, `onAddAccountWithNumber`, handler edit/hapus/pembayaran CC) | Master Akun & Rekening (Kas, Bank, E-Wallet, Kartu Kredit, PayLater), limit kredit, & rekonsiliasi saldo awal. |
| `CreditOverlimitTrendAnalyzer.tsx` (1860L) | `CreditOverlimitTrendAnalyzer`, `OverlimitTrendChart` (`accounts`, `transactions`, `budgets?`, `onApplyBudgetSuggestion?`) | Analisis tren pembengkakan pengeluaran dan utilisasi kredit terhadap batas anggaran. |
| `IntegrityReport.tsx` (1067L) | `IntegrityReport`, `DiscrepancySeverity`, `DiscrepancyCategory`, `DiscrepancyItem` (`accounts`, `transactions`, `investments?`, `masterCategories?`, `debts?`, `budgets?`, `onOpenIntegrityModal?`, `onOpenModalFix?`) | Laporan deteksi ketidaksesuaian saldo GL, transaksi yatim, dan duplikasi kategori/COA. |
| `AccountingIntegrityModal.tsx` (2270L) | `AccountingIntegrityModal` (`isOpen`, `onClose`, `accounts`, `transactions`, `masterCategories`, `onHarmonize`, `onApplyAdjustments`, ...) | Modal audit menyeluruh + perbaikan satu-klik harmonisasi akun, kategori hilang, dan pembersihan anomali aman. |
| `AiLedgerReconciliation.tsx` (373L) | `AiLedgerReconciliation` (`transactions`, `accounts`, `masterCategories`, `onReconcileFix?`) | Panel bantu rekonsiliasi buku besar berbasis aturan & AI. |

---

## 5. Utang, KPR, Aset Tetap, & Portofolio Investasi (9 Komponen)

| Berkas & Ukuran | Exports & `Props` | Peran Utama |
| :--- | :--- | :--- |
| `DebtTab.tsx` (2428L) | `DebtTab`, `getDaysUntilDue` (`debts`, `accounts`, `transactions?`, `kprPresets?`, `kprCoaMapping?`, `onAddDebt`, handler bayar & hapus) | Manajemen utang produktif/konsumtif, pengingat jatuh tempo, input KPR terhubung ke Aset Tetap, dan integrasi pembayaran. |
| `DebtPriorityScheduler.tsx` (419L) | `DebtPriorityScheduler` (`debts`) | Penjadwal prioritas pelunasan Avalanche vs Snowball dengan *freed monthly payment rollover*. |
| `KprAmortizationChart.tsx` (993L) | `KprAmortizationChart`, `computeKprSchedule`, `calcAnnuityPayment`, `KprYearlyRow`, `KprMonthlyRow`, `KprScheduleResult` (`calculatorSchedule`, `calculatorName`, `calculatorScheme`, `activeKprDebts`, `visualSource`, `onChangeVisualSource`) | Kalkulator & visualisasi jadwal amortisasi KPR tahunan/bulanan (`annuity`, `tiered`, `flat`). |
| `MasterKprPresetsPanel.tsx` (1307L) | `MasterKprPresetsPanel` (`presets`, `coaList`, `categories`, `kprCoaMapping?`, `onUpdatePresets`, `onResetPresets`, `onUpdateKprCoaMapping`) | Pengaturan preset DP, BPHTB, NPOPTKP, biaya provisi/notaris, serta mapping COA transaksi KPR. |
| `FixedAssetSection.tsx` (1393L) | `FixedAssetSection`, `FixedAssetCreatePayload` (`investments`, `fixedAssets`, `debts`, `accounts`, `onAddFixedAsset?`, `onUpdateFixedAsset?`, ...) | Pengelola properti, kendaraan, dan aset tetap produktif, revaluasi, integrasi ekuitas KPR, & penyusutan tahunan. |
| `InvestmentTab.tsx` (2286L) | `InvestmentTab` (`investments`, `transactions`, `accounts?`, `fixedAssets?`, `debts?`, `onUpdateInvestment?`, `onAddFixedAsset?`, ...) | Portofolio investasi (beli/jual unit, dividen/kupon, ROI, *unrealized vs realized gain*, ekspor CSV/PDF). |
| `InvestmentGoalSection.tsx` (958L) | `InvestmentGoalSection`, `getGoalDaysRemaining`, `calculateInvestmentDuration` (`investments?`) | Pelacak target investasi berjangka beserta kalkulasi logaritmik waktu pencapaian dengan bunga majemuk & top-up bulanan. |
| `InvestmentRoiD3Chart.tsx` (592L) | `InvestmentRoiD3Chart` (`investments`, `transactions`) | Visualisasi D3 ROI per aset dan pertumbuhan portofolio terhadap modal pokok. |
| `InvestmentSimulationCalculator.tsx` (434L) | `InvestmentSimulationCalculator` (`isOpen`, `onClose`, `investments`) | Modal kalkulator simulasi DCA & bunga majemuk portofolio investasi. |
| `DividendReinvestmentModal.tsx` (631L) | `DividendReinvestmentModal`, `DividendReinvestmentModalProps` (`isOpen`, `onClose`, `investments`, `transactions?`, `initialAssetId?`) | Modal Kalkulator Reinvestasi Dividen (DRIP) dengan estimasi tren yield historis & pertumbuhan harga per aset, perbandingan skenario DRIP vs Dividen Tunai, pajak dividen, & DCA bulanan. |
| `PriceHistoryModal.tsx` (383L) | `PriceHistoryModal` (`isOpen`, `onClose`, `investments`, `onUpdateInvestment?`) | Modal pencatatan & grafik riwayat perubahan harga unit aset investasi. |
| `AIDiversificationModal.tsx` (495L) | `AIDiversificationModal` (`isOpen`, `onClose`, `investments`) | Modal analisis diversifikasi aset & profil risiko melalui `/api/analyze-diversification`. |

*(Catatan: Kelompok Portofolio/Utang mencakup 12 berkas di atas; bersama kelompok 1–4 dan kelompok 6 di bawah, total tepat **51 berkas** di `src/components/`).*

---

## 6. Cadangan, Diagnostik Database, & Sinkronisasi (6 Komponen)

| Berkas & Ukuran | Exports & `Props` | Peran Utama |
| :--- | :--- | :--- |
| `BackupDataModal.tsx` (526L) | `BackupDataModal` (`isOpen`, `onClose`, `currentUser`, `appData`, handler restore/reset) | Ekspor & impor file cadangan JSON terenkripsi PBKDF2 + AES-GCM-256 (`src/utils/cryptoBackup.ts`). |
| `SyncConflictModal.tsx` (182L) | `SyncConflictModal` (`isOpen`, `localData`, `cloudData`, `onSelectLocal`, `onSelectCloud`, `onMerge`, `onClose`) | Resolusi interaktif ketika data lokal berbeda dengan Neon PostgreSQL saat sinkronisasi awal. |
| `DatabaseDiagnostics.tsx` (145L) | `DatabaseDiagnostics` | Panel uji kesehatan koneksi Neon PostgreSQL & log server (`/api/db/health`, `/api/db/logs`). |
| `DatabaseSchemaFixer.tsx` (196L) | `DatabaseSchemaFixer` | Utilitas perbaikan skema kolom `users` & pembangunan ulang tabel (`/api/db/fix-users-schema`, `/api/db/rebuild-schema`). |
| `SchemaDebugModal.tsx` (295L) | `SchemaDebugModal` (`isOpen`, `onClose`, `initialTableName?`) | Inspektur kolom tabel PostgreSQL langsung dari `information_schema.columns` (`/api/db/schema`). |

---

## 7. Panduan Pengembangan Lanjutan (*Extension Guide*)

### 7.1 Menambah Tab / Modul Baru
1. Buat komponen baru di `src/components/<NamaTab>.tsx` dengan interface `Props` eksplisit dan gunakan `ErrorBoundary` saat merender di `src/App.tsx`.
2. Daftarkan item baru ke grup yang sesuai di `NAV_GROUPS` pada `src/App.tsx` (id unik, label Indonesia, dan ikon dari `lucide-react`).
3. Tambahkan percabangan render `activeTab === '<id-baru>'` di blok konten utama `App.tsx`.
4. Jika memerlukan penyimpanan lokal baru, gunakan `secureStorage` dengan kunci ber-prefix `userId` (hindari `localStorage` mentah).

### 7.2 Menambah Kategori & Kode COA Baru
1. Tambahkan node ke `DEFAULT_CATEGORY_HIERARCHY` di `src/categoryHierarchy.ts` dengan `coaCode` valid.
2. Bila memakai kode akun baru, daftarkan pada `DEFAULT_COA_LIST` di `src/coaUtils.ts` sesuai rentang kelas (`1xxx` Aset, `2xxx` Liabilitas, `3xxx` Ekuitas, `4xxx` Pendapatan, `5xxx` Beban).
3. Pemakai eksisting otomatis menerima kategori default baru melalui `mergeMissingDefaultCategories()`.
4. Pastikan klasifikasi transaksi di `classifyTransaction()` (`src/utils/accountingEngine.ts`) tidak memperlakukan transaksi non-operasional (seperti transfer/utang/aset) sebagai `operating_income`/`operating_expense`.

### 7.3 Menambah Field Baru pada Transaksi atau Entitas Keuangan
1. Perbarui interface pada `src/types.ts`.
2. Tambahkan kolom baru di `src/db/schema.ts` **dan** pernyataan `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` di `ensureTablesExist()` (`src/db/index.ts`).
3. Perbarui pemetaan baca/tulis pada `GET /api/db/sync` dan `POST /api/db/sync` di `src/server/api.ts`.
4. Perbarui normalisasi tanggal/angka bila field berupa tanggal (wajib gunakan `toLocalYYYYMMDD` / `parseLocalDate`, dilarang memakai `.toISOString().split('T')[0]`).

### 7.4 Menambah Endpoint Gemini AI Baru
1. Tambahkan route `POST /api/<endpoint-baru>` pada `server.ts`.
2. Gunakan SDK `@google/genai`:
   - Untuk tugas ringan/cepat dengan fallback deterministik: gunakan `gemini-2.5-flash` + `responseMimeType: "application/json"` + fungsi fallback lokal bila `GEMINI_API_KEY` kosong.
   - Untuk penalaran finansial terstruktur ketat: gunakan `gemini-4-hydrogen` + `thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }` + `responseSchema` lengkap, serta kembalikan status `503`/`502` secara eksplisit jika layanan AI tidak tersedia.
3. Jaga agar `GEMINI_API_KEY` hanya dibaca di sisi server (`process.env.GEMINI_API_KEY`), tidak pernah dikirim ke bundle frontend.
