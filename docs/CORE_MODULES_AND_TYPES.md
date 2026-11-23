# Referensi Lengkap Modul Inti & Tipe Data

Dokumen ini menjadi kamus rujukan super detail bagi pengembang untuk seluruh tipe domain (`src/types.ts`), seluruh fungsi di mesin akuntansi (`src/utils/accountingEngine.ts`), master COA & kategori (`src/coaUtils.ts`, `src/categoryHierarchy.ts`), utilitas KPR, klien API, utilitas ekspor, enkripsi, formatter, logger, dan dataset awal.

---

## 1. Tipe Data Domain (`src/types.ts`)

| Tipe / Interface | Field Penting & Keterangan |
| :--- | :--- |
| `TransactionType` | `'income' \| 'expense' \| 'transfer' \| 'saving' \| 'investment'` |
| `AccountType` | `'cash' \| 'bank' \| 'e-wallet' \| 'credit_card' \| 'paylater'` |
| `Account` | `id`, `name`, `type`, `startingBalance`, `currentBalance`, opsional `creditLimit`, `usedLimit`, `dueDay`, `coaCode` |
| `Transaction` | `id`, `date` (`YYYY-MM-DD`), `accountId`, `toAccountId?`, `type`, `category`, `description`, `amount`, `debtId?`, `investmentAssetId?`, `investmentUnits?`, `fixedAssetId?`, `isAdjustment?`, `coaCode?` |
| `RecurringTransaction` | `id`, `title`, `type`, `category`, `amount`, `accountId`, `toAccountId?`, `frequency` (`'daily'\|'weekly'\|'monthly'\|'yearly'`), `dayOfMonth`, `isActive`, `description`, `lastProcessedDate` |
| `RiskProfile` | `'Konservatif' \| 'Moderat' \| 'Agresif'` |
| `InvestmentPriceHistory` | `id`, `assetId`, `assetName`, `date`, `unitPrice`, `previousUnitPrice?`, `changePercentage?`, `note?` |
| `InvestmentAsset` | `id`, `name`, `category`, `balance`, `dateAdded`, `initialCapital`, `quantity?`, `units?`, `unitName?`, `purchaseUnitPrice?`, `currentUnitPrice?`, `unitPrice?`, `dividendsOrInterest?`, `priceHistory?` |
| `FixedAssetCategory` | Kategori aset tetap (`'Properti & Bangunan'`, `'Kendaraan'`, `'Elektronik & Peralatan'`, `'Mesin & Aset Produktif'`, `'Lainnya'`) |
| `FixedAssetAdjustment` | `id`, `date`, `type` (`'revaluation' \| 'depreciation' \| 'impairment' \| 'addition'`), `amount`, `note`, `previousValue`, `newValue` |
| `FixedAsset` | `id`, `name`, `category`, `acquisitionDate`, `acquisitionCost`, `currentValue`, `usefulLifeYears`, `salvageValue`, `isDepreciable`, `linkedDebtId?`, `kprFullAcquisitionValue?`, `kprIsPaidOff?`, `kprPaidPrincipalLock?`, `rateEffectiveDate?`, `adjustments?` |
| `CategoryBudget` | `category`, `type` (`'expense' \| 'saving' \| 'investment'`), `limit` |
| `KprCoaMappingConfig` | Pemetaan kode COA KPR: `propertyAssetCoa`, `kprLiabilityCoa`, `interestExpenseCoa`, `closingCostExpenseCoa`, `dpCashCoa` |
| `KprPreset` | Template skema & biaya penutupan KPR (DP %, BPHTB %, NPOPTKP, Provisi %, Notaris, Asuransi, Admin) |
| `Debt` | `id`, `name`, `balance`, `interestRate`, `minPayment`, `purpose` (`'productive'\|'consumptive'`), `category`, `dueDay`, serta atribut KPR opsional (`isKpr`, `kprScheme`, `kprTenorMonths`, `kprFixedMonths`, `kprFloatingRate`, `kprPropertyValue`, `kprDownPayment`, `kprStartDate`, `kprLinkedFixedAssetId`, `kprIsPaidOff`) |
| `DebtPayment` | `id`, `debtId`, `date`, `amount`, `principalAmount`, `interestAmount`, `accountId`, `note?` |
| `EmergencyFundConfig` | `jobStability` (`'high'\|'medium'\|'low'`), `dependents`, `monthlyExpense` |
| `EmergencyFundTransaction` | `id`, `date`, `type` (`'addition'\|'withdrawal'`), `amount`, `location`, `description` |
| `SavingsGoal` | `id`, `title`, `targetAmount`, `currentAmount`, `targetDate`, `category`, `notes?`, `linkedAccountId?` |
| `InvestmentGoal` | `id`, `title`, `targetAmount`, `currentAmount`, `targetDate`, `category`, `notes?`, `monthlyContribution?`, `annualReturnRate?` |
| `User` | `id`, `username`, `email`, `fullName`, `isGuest?`, `authProvider?` |
| `UserFinancialData` | Paket lengkap seluruh array state keuangan pengguna untuk ekspor/sync |
| `AIAnalysisResult`, `AIMonthlyComparisonResult`, `AIDiversificationResult`, `AICategoryConsolidationResult`, `CategoryConsolidationSource`, `CategoryConsolidationGroup` | Kontrak tipe payload hasil analitik Gemini AI |

---

## 2. Mesin Akuntansi (`src/utils/accountingEngine.ts`)

Berisi 3.729 baris logika akuntansi inti. Berikut seluruh kelompok simbol & fungsi ekspor utamanya:

### 2.1 Utilitas Tanggal & Nominal
- `toLocalYYYYMMDD(dateInput?)`: Format `YYYY-MM-DD` sesuai waktu lokal.
- `parseLocalDate(dateStr)`: Parse aman ke `Date` lokal pukul `00:00:00`.
- `normalizeLedgerDateYYYYMMDD(dateStr?)`: Normalisasi string tanggal transaksi.
- `normalizeAbsAmount(amount)`: Memastikan nilai nominal non-negatif berpresisi aman.

### 2.2 Klasifikasi & Rekening
- `TransactionAccountingNature` (union 11 sifat akuntansi transaksi).
- `isCreditAccount(account)`: Mengembalikan `true` untuk `'credit_card'` dan `'paylater'`.
- `getLiquidAccounts(accounts)`: Memfilter akun non-kredit (`cash`, `bank`, `e-wallet`).
- `getAccountCreditBill(account)`: Menghitung tagihan terpakai kartu kredit/paylater (`usedLimit` atau `creditLimit - currentBalance`).
- `calculateTotalLiquidCash(accounts)`: Total saldo akun likuid.
- `calculateTotalCreditCardDebt(accounts)`: Total kewajiban berjalan seluruh akun kredit/paylater.
- `calculateTotalEmergencyFund(transactions)`: Total neto `addition - withdrawal` pada transaksi dana darurat.
- `classifyTransaction(tx, accounts)`: Mengklasifikasikan transaksi ke salah satu dari 11 `TransactionAccountingNature`.
- `getTransactionAccountDelta(tx, accountId, accounts)`: Mengembalikan perubahan saldo (`+`/`-`) pada `accountId` tertentu akibat transaksi `tx`.
- `applyAccountBalanceChange(...)`, `applyCreditBillPayment(...)`, `applyTransactionsToAccounts(...)`, `createAccountRecord(...)`, `updateAccountMetadataAndStartingBalance(...)`, `calculateAccountGLBalance(...)`: Mutasi saldo dan rekonstruksi saldo buku besar per akun.

### 2.3 Angsuran KPR, Aset Tetap, & Penyusutan
- `calculateKprInstallmentBreakdown(debt, paymentAmount)`: Memecah cicilan KPR menjadi `{ principalPart, interestPart }`.
- `resolveDebtInstallmentAccounting(tx, debts)`: Menghubungkan transaksi pembayaran utang dengan catatan utang (termasuk KPR) untuk menentukan porsi pokok vs beban bunga.
- `syncKprDebtsToFixedAssets(debts, fixedAssets)`: Menjaga konsistensi nilai ekuitas properti KPR vs sisa pokok utang agar tidak terjadi double counting di Neraca, dan mengunci `kprIsPaidOff` saat utang lunas.
- `calculateFixedAssetValuation(asset)`: Menghitung nilai perolehan, akumulasi penyusutan, nilai buku bersih, serta basis KPR.
- `calculateAssetDepreciation(...)` (overloaded tunggal & batch): Menghitung jadwal dan beban penyusutan garis lurus.
- `computePendingYearEndFixedAssetDepreciations(fixedAssets, transactions, asOfDate?)`: Mendeteksi aset yang belum dijurnal penyusutannya di akhir tahun.
- `buildSyncedFixedAssetDepreciationAdjustment(...)` & `buildBatchSyncedFixedAssetDepreciationAdjustments(...)`: Membentuk entri jurnal penyesuaian `Dr 5960 / Cr 1690` sekaligus memperbarui `rateEffectiveDate`.

### 2.4 Laporan Keuangan, Rasio CFP, Prioritas Mingguan, & Audit GL
- `calculateIncomeStatementSummary(...)`: Menghasilkan ringkasan Laba-Rugi Operasional (Pendapatan, Beban Operasional + Bunga, Surplus Bersih, rincian per kategori & COA).
- `calculateCashFlowSummary(...)`: Menghasilkan Arus Kas 3 pilar (Operasi, Investasi, Pendanaan) bebas non-tunai kartu kredit.
- `calculateBalanceSheet(...)`: Menghasilkan struktur Neraca lengkap (Aset Lancar, Investasi, Aset Tetap Bersih, Liabilitas Jangka Pendek & Panjang, Ekuitas/Net Worth).
- `calculateNetWorthHistory6Months(...)`: *Rollback* historis kekayaan bersih 6 bulan ke belakang.
- `computeLinearRegressionSlope(values)`: Menghitung kemiringan regresi linear sederhana.
- `calculateNetWorthTrendWithProjection(...)`: Menggabungkan histori 6 bulan + proyeksi 3 bulan ke depan (`50% slope + 50% rata-rata surplus operasional`).
- `calculateCFPFinancialHealthRatios(...)`: Menghitung DTI, Savings Ratio, Emergency Months, Liquidity Ratio, dan skor total (0–100).
- `generateWeeklyFinancialPriorities(...)`: Menyusun daftar prioritas tindakan mingguan (tagihan jatuh tempo, rasio kritis, anggaran mendekati limit, atau surplus siap dialokasikan).
- `auditLedgerIntegrity(...)`, `previewSafeAnomalyCleanupImpact(...)`, `buildTransactionDeletionPlan(...)`: Pemeriksaan selisih saldo GL, deteksi transaksi yatim, simulasi dampak pembersihan anomali, dan rencana penghapusan aman (termasuk pemulihan unit investasi).

---

## 3. Master COA, Kategori, & Preset KPR

### 3.1 `src/coaUtils.ts` (741 baris)
- `AccountCOA` (interface), `DEFAULT_COA_LIST` (daftar akun COA standar `1110–5990`), `CoaReportScopeInfo`, `getCoaReportScope()`.
- Persistensi COA & log perubahan: `getStoredCoaList()`, `saveStoredCoaList()`, `getAccountCoaMapping()`, `MasterChangeLog`, `getMasterChangeLogs()`, `addMasterChangeLog()`, `clearMasterChangeLogs()`.
- Integritas & Pembersihan: `MasterIntegrityReport`, `validateMasterIntegrityOnLoad()`, `CoaSyncReportItem`, `CoaSyncReport`, `synchronizeAccountsAndCOA()`, `ScannedLedgerAnomalyRow`, `CoaScanResult`, `scanCoaDuplicatesAndUnused()`, `autoMergeAndCleanupCoas()`, `factoryResetMasterData()`.

### 3.2 `src/categoryHierarchy.ts` (1.343 baris)
- `CategoryNode`, `DEFAULT_CATEGORY_HIERARCHY` (struktur pohon kategori default dengan pemetaan `coaCode`).
- Utilitas CRUD & Migrasi: `mergeMissingDefaultCategories()`, `getStoredCategories()`, `saveStoredCategories()`, `CategoryFlatOption`, `flattenCategoryHierarchy()`, `findCategoryNode()`, `addCategoryNode()`, `updateCategoryNodeCoa()`, `deleteCategoryNode()`, `renameCategoryNode()`.
- Resolusi COA: `ResolvedCategoryCoaInfo`, `inferFallbackCoaCode()`, `resolveCategoryCoaInfo()`, `getCategoriesLinkedToCoa()`.

### 3.3 `src/utils/kprPresets.ts` (361 baris)
- Konstanta default: `DEFAULT_KPR_COA_MAPPING`, `DEFAULT_KPR_PRESETS`.
- Perhitungan biaya KPR: `KprClosingCostBreakdown`, `calculateKprClosingCosts()`.
- Persistensi & Resolusi: `getStoredKprPresets()`, `saveStoredKprPresets()`, `resetStoredKprPresets()`, `getStoredKprCoaMapping()`, `saveStoredKprCoaMapping()`, `resetStoredKprCoaMapping()`, `resolveEffectiveKprCoaMapping()`, `resolveTransactionCoaCodes()`.

---

## 4. Klien API, Ekspor Laporan, & Utilitas Pendukung

| Berkas | Simbol & Fungsi Ekspor |
| :--- | :--- |
| **`src/apiClient.ts`** (801 baris) | `DEFAULT_POSTGRES_PROVIDER`, `DEFAULT_POSTGRES_SSL_MODE`, `PostgresSslMode`, `PostgresConnectionConfig`, `parseSecurePostgresConfig`, `getSecureDatabaseConfig`, `PostgresUserCredentials`, `HealthCheckResult`, `ClientLogEntry`, `logClientInteraction`, `getClientInteractionLogs`, `clearClientInteractionLogs`, `fetchServerDbLogs`, `ColumnInfo`, `TableSchemaResult`, `checkTableSchema`, `UsersInspectionResult`, `fetchUsersInspection`, `fixUsersSchema`, `rebuildDatabaseSchema`, `checkPostgresHealth`, `loginUserPostgres`, `registerUserPostgres`, `requestForgotPasswordPostgres`, `syncToPostgres`, `syncFromPostgres`. |
| **`src/googleSheets.ts`** (152 baris) | `loadGoogleIdentityServices`, `loginWithGoogleSheets`, `logoutGoogleSheets`, `isGoogleSheetsSyncActive`, `uploadFinancesToSheets`, `downloadFinancesFromSheets`. |
| **`src/utils/exportFinancialReports.ts`** (854 baris) | `exportIncomeStatementToCSV`, `exportBalanceSheetToCSV`, `exportCashFlowToCSV`, `exportBudgetRealizationToCSV`, `exportReportSectionToPDF`, `MonthlyBalanceAndIncomeSummary`, `buildMonthlyBalanceAndIncomeSummary`, `exportMonthlyBalanceAndIncomePDF`. |
| **`src/utils/exportInvestment.ts`** (298 baris) | `exportInvestmentsToCSV`, `exportInvestmentsToPDF`. |
| **`src/utils/cryptoBackup.ts`** (131 baris) | `EncryptedBackupPayload`, `encryptBackupData`, `decryptBackupData`. |
| **`src/utils/secureStorage.ts`** (133 baris) | `encryptStorageValue`, `decryptStorageValue`, `secureStorage`. |
| **`src/utils/syncConflictDetector.ts`** (101 baris) | `SyncSummary`, `SyncDataPackage`, `generateSyncSummary`, `detectDataConflict`, `mergeSyncData`. |
| **`src/utils/formatters.ts`** (62 baris) | `formatCurrency`, `parseCurrencyInput`, `formatterIDR`, `formatCurrencyIDR`, `formatShortIDR`. |
| **`src/utils/dbLogger.ts`** (94 baris) | `DbLogContext`, `DbLogEntry`, `dbLogger`. |
| **`src/utils/logger.ts`** (68 baris) | `initGlobalLogger`, `logger`. |
| **`src/utils/toast.ts`** (56 baris) | `ToastItem`, `notifyToastsChange`, `showToast`, `removeToast`, `clearAllToasts`, `subscribeToasts`. |
| **`src/initialData.ts`** (273 baris) | `INITIAL_ACCOUNTS`, `INITIAL_BUDGETS`, `INITIAL_TRANSACTIONS`, `INITIAL_DEBTS`, `INITIAL_EMERGENCY_CONFIG`, `INITIAL_EMERGENCY_TXS`, `INITIAL_INVESTMENTS`, `INITIAL_RECURRING_TRANSACTIONS`. |
