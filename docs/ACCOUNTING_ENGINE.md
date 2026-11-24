# Mesin Akuntansi & Aturan Perhitungan Pribadi

Dokumen ini membedah seluruh aturan akuntansi pribadi, rumus keuangan, standar tanggal, Chart of Accounts, skema KPR, penyusutan aset tetap, perpajakan, strategi pelunasan utang, serta audit integritas *General Ledger* yang diimplementasikan di **Nusantara Wealth** (berpusat di `src/utils/accountingEngine.ts`, `src/coaUtils.ts`, `src/categoryHierarchy.ts`, `src/utils/kprPresets.ts`, dan modul perhitungan komponen).

---

## 1. Standar Tanggal Lokal (Bebas Pergeseran UTC)

Untuk mencegah pergeseran tanggal H-1 akibat konversi `.toISOString()` pada zona waktu `UTC+7`/`UTC+8`/`UTC+9` (khususnya antara pukul `00:00` hingga `07:00` WIB), seluruh mesin akuntansi mewajibkan penggunaan utilitas tanggal lokal berikut:

- **`toLocalYYYYMMDD(dateInput?: Date | string)`**: Menghasilkan string `YYYY-MM-DD` berdasarkan komponen `getFullYear()`, `getMonth() + 1`, dan `getDate()` waktu lokal perangkat.
- **`parseLocalDate(dateStr: string)`**: Mem-parsing string `YYYY-MM-DD` (atau ISO ber-prefix tanggal) menjadi objek `Date` pada `00:00:00` waktu lokal tanpa tafsir UTC midnight.
- **`normalizeLedgerDateYYYYMMDD(dateStr?: string)`**: Menormalkan format tanggal jurnal yang masuk menjadi `YYYY-MM-DD` yang konsisten untuk pengelompokan periode bulanan (`YYYY-MM`) maupun tahunan (`YYYY`).

---

## 2. Chart of Accounts (`src/coaUtils.ts`) & Hirarki Kategori (`src/categoryHierarchy.ts`)

Seluruh kategori transaksi diikat ke kode akun standar 4 digit (**COA**) agar laporan keuangan mengikuti kaidah *double-entry*:

| Rentang Kode COA | Kelas Akun (`AccountCOA.type`) | Contoh Akun Utama |
| :--- | :--- | :--- |
| **`11xx – 12xx`** | Aset Lancar (`asset`) | `1110` Kas Tunai, `1120` Rekening Bank, `1130` Dompet Digital, `1140` Dana Darurat |
| **`13xx – 16xx`** | Investasi & Aset Tetap (`asset`) | `1310` Reksadana & Saham, `1320` Logam Mulia, `1510` Properti/Bangunan, `1520` Kendaraan, `1690` Akumulasi Penyusutan Aset Tetap |
| **`21xx – 23xx`** | Liabilitas / Utang (`liability`) | `2110` Utang Kartu Kredit, `2120` Utang PayLater, `2210` Utang KTA/Pribadi, `2310` Utang KPR Jangka Panjang |
| **`31xx`** | Ekuitas / Modal (`equity`) | `3110` Modal Awal & Saldo Penyesuaian Ekuitas, `3120` Laba Ditahan / Surplus Akumulasi |
| **`41xx – 49xx`** | Pendapatan (`income`) | `4110` Gaji & Tunjangan, `4210` Pendapatan Bisnis/Sampingan, `4310` Dividen, Bunga & Kupon |
| **`51xx – 59xx`** | Beban (`expense`) | `5110` Konsumsi & Makanan, `5210` Transportasi, `5810` Beban Bunga KPR/Utang, `5960` Beban Penyusutan Aset Tetap |

Pemetaan kategori ke COA diputuskan secara deterministik oleh `resolveCategoryCoaInfo()` (`src/categoryHierarchy.ts`) dan `resolveTransactionCoaCodes()` (`src/utils/kprPresets.ts`):
1. Cek kata kunci/prefix khusus KPR (pokok KPR -> `2310`, bunga KPR -> `5810`, biaya penutupan -> COA yang dikonfigurasi pada `KprCoaMappingConfig`).
2. Cek node kategori di `Master Category Hierarchy` (`coaCode` eksplisit pada `CategoryNode`).
3. Fallback berbasis tipe transaksi & heuristik nama kategori melalui `inferFallbackCoaCode()`.

---

## 3. Klasifikasi Akuntansi Transaksi (`classifyTransaction`)

Setiap objek `Transaction` diklasifikasikan oleh `classifyTransaction(tx, accounts)` menjadi salah satu dari **11 `TransactionAccountingNature`**:

1. `operating_income`: Pendapatan operasional riil (`type === 'income'`) yang bukan pencairan utang atau injeksi modal awal.
2. `operating_expense`: Beban operasional riil (`type === 'expense'`) di luar pelunasan pokok utang, pembelian aset tetap, atau transfer internal.
3. `internal_transfer`: Pemindahan dana antar akun likuid milik sendiri (`type === 'transfer'`) — **netral** terhadap Laba-Rugi dan Net Worth.
4. `debt_principal_pay`: Pembayaran pokok utang/cicilan kartu kredit/KTA/KPR (mengurangi kas dan mengurangi liabilitas).
5. `debt_proceeds`: Pencairan pinjaman baru (menambah kas sekaligus menambah liabilitas — **bukan** pendapatan).
6. `emergency_fund_transfer`: Penyetoran atau penarikan antara rekening kas dan kantong Dana Darurat (`1140`).
7. `investment_buy`: Pembelian instrumen investasi (reklasifikasi dari Kas `11xx` ke Aset Investasi `13xx`).
8. `investment_sell`: Penjualan/pencairan instrumen investasi (mengubah Aset Investasi `13xx` menjadi Kas `11xx`, dengan selisih realisasi dicatat sebagai gain/loss).
9. `fixed_asset_buy`: Perolehan aset tetap/properti/kendaraan (`15xx`).
10. `equity_injection`: Penyesuaian saldo awal/ekuitas (`3110`) — tidak masuk Laba-Rugi.
11. `non_cash_adjustment`: Penyesuaian akuntansi non-kas seperti jurnal penyusutan akhir tahun (`Dr 5960 / Cr 1690`) yang ditandai `isAdjustment` atau deskripsi penyusutan.

---

## 4. Laporan Keuangan Utama

### 4.1 Laporan Laba-Rugi Operasional (`calculateIncomeStatementSummary`)
- **Pendapatan Operasional**: Jumlah seluruh transaksi `operating_income` pada periode target.
- **Beban Operasional**: Jumlah seluruh transaksi `operating_expense` ditambah **porsi bunga KPR/pinjaman (`interestPart`)** apabila transaksi angsuran memiliki komponen pokok & bunga (`resolveDebtInstallmentAccounting()`).
- **Pemisahan Angsuran KPR (`calculateKprInstallmentBreakdown`)**:
  - Jika transaksi merupakan pembayaran utang bertipe KPR, nominal angsuran dipisahkan menjadi:
    - `principalPart` -> mengurangi saldo liabilitas `2310` (masuk Arus Kas Pendanaan / Neraca, **bukan** beban Laba-Rugi).
    - `interestPart` -> diakui sebagai beban bunga `5810` pada Laporan Laba-Rugi & Arus Kas Operasi.
- **Surplus / Tabungan Bersih (*Net Operating Savings*)**:
  $$\text{NetSavings} = \text{OperatingIncome} - \text{OperatingExpense}$$
  > **Catatan Audit**: Transfer ke tabungan/dana darurat maupun pembelian investasi **tidak** dikurangkan lagi dari `NetSavings` dan **tidak** dihitung dua kali sebagai beban operasional.

### 4.2 Laporan Arus Kas 3 Pilar (`calculateCashFlowSummary`)
Mengelompokkan aliran kas **tunai/bank/e-wallet riil** menjadi 3 aktivitas:
1. **Arus Kas Operasi (*Operating Cash Flow*)**:
   - Arus masuk dari `operating_income` pada akun non-kredit.
   - Arus keluar dari `operating_expense` **hanya pada akun kas/bank/e-wallet** (pengeluaran via `credit_card` atau `paylater` dikecualikan agar tidak menghitung beban non-tunai sebelum kas benar-benar keluar), ditambah porsi bunga pinjaman/KPR.
2. **Arus Kas Investasi (*Investing Cash Flow*)**:
   - Arus masuk: `investment_sell`, dividen/kupon tunai.
   - Arus keluar: `investment_buy`, `fixed_asset_buy`, serta biaya perolehan awal properti tunai.
3. **Arus Kas Pendanaan (*Financing Cash Flow*)**:
   - Arus masuk: `debt_proceeds`, `equity_injection`.
   - Arus keluar: `debt_principal_pay` (pelunasan pokok utang, tagihan kartu kredit/paylater ketika dibayar dengan kas/bank, dan pokok angsuran KPR).

### 4.3 Neraca & Anti-Double-Counting KPR (`calculateBalanceSheet` & `syncKprDebtsToFixedAssets`)
$$\text{Total Aset} = \text{Kas \& Bank} + \text{Dana Darurat} + \text{Portofolio Investasi} + \text{Nilai Buku Bersih Aset Tetap}$$
$$\text{Total Liabilitas} = \text{Tagihan Kartu Kredit/PayLater} + \text{Total Sisa Pokok Utang (KTA, Pinjaman, KPR)}$$
$$\text{Kekayaan Bersih (Net Worth)} = \text{Total Aset} - \text{Total Liabilitas}$$

**Mekanisme Anti-Double-Counting Properti KPR**:
- Ketika utang bertipe KPR masih berjalan, nilai basis aset tetap yang disinkronkan oleh `syncKprDebtsToFixedAssets()` adalah:
  $$\text{BasisEkuitasKPR} = \begin{cases} \text{NilaiPerolehanPenuh}, & \text{jika KPR lunas (`kprIsPaidOff === true`)} \\ \max(0, \text{NilaiPerolehanPenuh} - \text{SisaPokokKPR}), & \text{jika KPR masih berjalan} \end{cases}$$
- Dengan demikian, ketika nanti Neraca menghitung `Total Aset - Total Liabilitas`, ekuitas rumah yang terhitung tidak tumpang tindih dengan utang pokok KPR yang juga mengurangi ekuitas.

---

## 5. Proyeksi Kekayaan Bersih 6+3 Bulan (`calculateNetWorthTrendWithProjection`)

1. **Histori Aktual 6 Bulan (`calculateNetWorthHistory6Months`)**:
   - Melakukan *rollback* mundur dari posisi aset & liabilitas saat ini berdasarkan arus transaksi historis tiap bulan (`YYYY-MM`) untuk 6 bulan terakhir.
2. **Proyeksi 3 Bulan ke Depan**:
   - Menghitung kemiringan (*slope*) regresi linear dari 6 titik historis Net Worth melalui `computeLinearRegressionSlope()`.
   - Menghitung rata-rata arus kas operasional bersih bulanan (3–6 bulan).
   - Memadukan proyeksi dengan bobot seimbang (**50% tren regresi linear historis + 50% rata-rata surplus operasional bulanan**) untuk memproyeksikan titik bulan +1, +2, dan +3.

---

## 6. Rasio Kesehatan Keuangan CFP (`calculateCFPFinancialHealthRatios`) & Likuiditas

Keempat rasio standar *Certified Financial Planner* dihitung sebagai berikut:

| Rasio | Rumus | Ideal (`healthy`) | Waspada (`warning`) | Kritis (`danger`) |
| :--- | :--- | :--- | :--- | :--- |
| **Debt-to-Income (DTI)** | `totalMonthlyDebtService / avgMonthlyIncome * 100%` | `<= 30%` | `> 30% s.d. 40%` | `> 40%` |
| **Savings Ratio** | `(avgMonthlyIncome - avgMonthlyExpense) / avgMonthlyIncome * 100%` | `>= 20%` | `10% s.d. < 20%` | `< 10%` |
| **Emergency Fund Coverage** | `totalEmergencyFund / avgMonthlyExpense` (dalam bulan) | `>= 6 bulan` | `3 s.d. < 6 bulan` | `< 3 bulan` |
| **Liquidity / Current Ratio** | `(liquidCash + emergencyBalance) / currentLiabilities` | `>= 1.5x` | `1.0x s.d. < 1.5x` | `< 1.0x` |

- **Definisi Kewajiban Lancar (`currentLiabilities`)**:
  - Pada `calculateCFPFinancialHealthRatios`: menggunakan total tagihan berjalan `credit_card` dan `paylater` (mengecualikan pokok utang jangka panjang seperti KPR).
  - Pada `LiquidityProjectionCard`: menggunakan `creditPaylaterLiabilities + shortTermDebtPortion`, di mana `shortTermDebtPortion = sum(min(debt.balance, debt.minPayment * 12))` agar kewajiban cicilan 12 bulan ke depan tercermin akurat.
- **Skor Kesehatan (0–100)**: Dimulai dari `100`, dikurangi `25` poin untuk setiap rasio berstatus `danger` dan `12` poin untuk setiap rasio berstatus `warning` (batas bawah `0`).

---

## 7. Penyusutan Akhir Tahun Otomatis Aset Tetap

- Fungsi `calculateAssetDepreciation()` (overloaded untuk per-aset dan agregat) menghitung akumulasi penyusutan metode garis lurus (*straight-line*) dengan memperhitungkan `usefulLifeYears`, `salvageValue`, dan `rateEffectiveDate` (untuk perubahan nilai/tarif di tengah masa manfaat).
- `computePendingYearEndFixedAssetDepreciations()` mendeteksi apakah tahun buku yang telah berakhir memiliki beban penyusutan yang belum dijurnal.
- `buildSyncedFixedAssetDepreciationAdjustment()` dan `buildBatchSyncedFixedAssetDepreciationAdjustments()` membuat entri penyesuaian non-kas:
  - **Debit**: `5960` (Beban Penyusutan Aset Tetap)
  - **Kredit**: `1690` (Akumulasi Penyusutan Aset Tetap)
  - Sekaligus memajukan `rateEffectiveDate` aset ke awal periode berikutnya agar tahun yang sama tidak disusutkan dua kali.

---

## 8. Skema KPR & Biaya Penutupan (`src/utils/kprPresets.ts` & `KprAmortizationChart.tsx`)

- **Biaya Penutupan (`calculateKprClosingCosts`)**: Menghitung rincian `dpAmount`, `bphtbTax` (Bea Perolehan Hak atas Tanah dan Bangunan setelah NPOPTKP sesuai preset), `provisiAmount`, `notaryFee`, `insuranceFee`, `adminFee`, serta total kebutuhan kas awal (*cash to close*).
- **3 Skema Amortisasi (`computeKprSchedule`)**:
  1. **`annuity` (Anuitas/Efektif)**: Angsuran bulanan tetap dengan rumus $P \cdot \frac{r(1+r)^n}{(1+r)^n - 1}$, di mana porsi bunga menurun dan porsi pokok meningkat tiap bulan.
  2. **`tiered` (Berjenjang / Fixed-then-Floating)**: Menghitung suku bunga *fixed* pada tahun-tahun awal dan beralih ke suku bunga *floating* pada sisa tenor dengan re-amortisasi sisa pokok.
  3. **`flat` (Bunga Tetap)**: Pokok bulanan tetap ($P/n$) dan bunga dihitung konstan terhadap pokok awal ($P \cdot r_{annual} / 12$).

---

## 9. Pajak Penghasilan (UU HPP 2026) & Zakat Profesi

### 9.1 Kalkulator Pajak (`TaxCalculatorCard.tsx`)
Menghitung estimasi pajak tahunan berdasarkan histori pemasukan tahun terpilih untuk 3 profil:
1. **Karyawan (PPh 21)**: Pengurangan Biaya Jabatan (`5%` maks Rp 6.000.000/tahun) + pengurang tambahan -> PTKP (`TK/0` Rp 54 jt s.d. `K/3` Rp 72 jt) -> PKP dikenakan 5 lapis tarif progresif UU HPP:
   - Lapisan 1 (`<= Rp 60 jt`): `5%`
   - Lapisan 2 (`> Rp 60 jt – 250 jt`): `15%`
   - Lapisan 3 (`> Rp 250 jt – 500 jt`): `25%`
   - Lapisan 4 (`> Rp 500 jt – 5 M`): `30%`
   - Lapisan 5 (`> Rp 5 M`): `35%`
2. **UMKM / PP 55 Tahun 2022**: Omzet bruto `<= Rp 500 Juta/tahun` dikenakan `0%` (Bebas Pajak), dan selisih omzet `> Rp 500 Juta` dikenakan PPh Final `0.5%`.
3. **Pekerja Bebas / Freelance (NPPN 50%)**: Penghasilan neto dihitung `50%` dari bruto dikurangi pengurang tambahan dan PTKP, lalu dikenakan **5 lapis penuh tarif progresif UU HPP** (`5%`, `15%`, `25%`, `30%`, `35%`).

### 9.2 Zakat Profesi (`ReportsTab.tsx`)
- Nisab tahunan mengacu pada harga emas (85 gram) dibagi 12 untuk ambang bulanan.
- Basis pemasukan dihitung secara dinamis sesuai **bulan filter aktif** yang sedang dilihat pengguna (tidak dikunci statis ke bulan berjalan kalender sistem) dengan tarif `2.5%` apabila memenuhi nisab.

---

## 10. Strategi Pelunasan Utang (`DebtPriorityScheduler.tsx` & `AiAnalysisTab.tsx`)

- Mendukung metode **Avalanche** (urutkan bunga tahunan `interestRate` tertinggi lebih dulu -> paling hemat total bunga) dan **Snowball** (urutkan sisa saldo `balance` terkecil lebih dulu -> kemenangan psikologis cepat).
- Menggunakan mekanisme **Freed Monthly Payment Rollover**: ketika satu pos utang mencapai saldo `0`, seluruh anggaran cicilan minimum + dana ekstra yang sebelumnya dialokasikan ke utang tersebut otomatis digulirkan ke utang prioritas berikutnya pada bulan yang sama/berikutnya hingga seluruh utang lunas.

---

## 11. Audit Integritas General Ledger (`auditLedgerIntegrity` & `calculateAccountGLBalance`)

1. **`calculateAccountGLBalance(account, transactions)`**: Merekonstruksi saldo akhir buku besar setiap akun dari `startingBalance` ditambah/dikurangi seluruh `getTransactionAccountDelta()` yang merujuk akun tersebut.
2. **`auditLedgerIntegrity(accounts, transactions, categories)`**: Memeriksa:
   - Selisih antara saldo `currentBalance` akun vs saldo rekonstruksi GL.
   - Transaksi yatim (*orphan*) yang merujuk `accountId` / `toAccountId` tidak valid.
   - Transaksi dengan kategori yang belum terdaftar pada `MasterCategoryManager` atau belum memiliki pemetaan COA.
   - Duplikasi kode COA dan COA yatim (`scanCoaDuplicatesAndUnused()`).
3. **`previewSafeAnomalyCleanupImpact()` & `buildTransactionDeletionPlan()`**: Mempratinjau dampak saldo akun, sisa utang, dan nilai investasi sebelum menghapus/membersihkan entri anomali, termasuk pemulihan proporsional unit dan `initialCapital` investasi ketika transaksi `investment_buy`/`investment_sell` dibatalkan.

---

## 12. Alur Kerja `AccountingEngine` (Panduan Teknis Pengembang Bahasa Indonesia)

Bagian ini menjadi peta pemeliharaan kode bagi tim pengembang untuk memahami urutan pemrosesan data dari jurnal transaksi mentah hingga menjadi laporan keuangan, visualisasi Sankey, dan audit integritas.

### 12.1 Diagram Alir End-to-End `AccountingEngine`

```text
  [1] Raw Transaction[] / Account[] / Debt[] / FixedAsset[] / InvestmentAsset[]
         │
         ▼
  [2] Normalisasi Tanggal & Validasi Nominal
         ├── normalizeLedgerDateYYYYMMDD(tx.date)  <-- Bounded Map Cache (4096) + fast-path YYYY-MM-DD
         └── normalizeAbsAmount(tx.amount)
         │
         ▼
  [3] Klasifikasi Akuntansi (`classifyTransaction(tx, accounts)`) -> 11 Nature
         ├── operating_income / operating_expense
         ├── internal_transfer / equity_injection / non_cash_adjustment
         ├── emergency_fund_transfer / investment_buy / investment_sell / fixed_asset_buy
         └── debt_proceeds / debt_principal_pay
                                    │
                                    ▼ (khusus angsuran utang/KPR)
                             resolveDebtInstallmentAccounting(tx, debt)
                               ├── principalPayAmount -> mengurangi Liabilitas (22xx/2310)
                               └── interestExpenseAmount -> masuk Beban Bunga (5810)
         │
         ├────────────────────────────────────────────────────────┐
         ▼                                                        ▼
  [4A] Pipeline Laporan Resmi                               [4B] Pipeline Sankey O(1) (`cashFlowSankey.ts`)
         ├── calculateIncomeStatementSummary()                     ├── buildSankeyPeriodIndex(transactions)
         ├── calculateCashFlowStatement() (3 Pilar Tunai)          │     ├── all[] (pre-classified nature)
         ├── syncKprDebtsToFixedAssets() (Anti-Double-Count)       │     ├── byMonth Map<YYYY-MM, Entry[]>
         ├── calculateBalanceSheet()                               │     ├── byQuarter Map<YYYY-QQ, Entry[]>
         ├── calculateCFPFinancialHealthRatios()                   │     └── byYear Map<YYYY, Entry[]>
         └── calculateNetWorthTrendWithProjection()                ├── lookupSankeyPeriodEntries() -> O(1)
                                                                   └── aggregatePeriodCashFlowIndexed()
                                                                         ├── SankeyCashFlowSummary (KPI)
                                                                         ├── SankeyFlowChart (d3-sankey)
                                                                         └── TransactionDrillDownTable
         │
         ▼
  [5] Otomasi Akhir Tahun & Audit GL (`App.tsx` & `AccountingIntegrityModal`)
         ├── computePendingYearEndFixedAssetDepreciations() (Dr 5960 / Cr 1690)
         └── auditLedgerIntegrity() + calculateAccountGLBalance()
```

### 12.2 Tahapan Eksekusi & Tanggung Jawab Modul

1. **Tahap Normalisasi (`normalizeLedgerDateYYYYMMDD`, `toLocalYYYYMMDD`, `parseLocalDate`)**:
   - Seluruh tanggal wajib dinormalkan ke string lokal `YYYY-MM-DD`.
   - Jangan pernah menggunakan `new Date().toISOString().split('T')[0]` karena memicu pergeseran tanggal ke kemarin pada pukul `00:00–06:59` WIB.
   - Cache terikat (`MAX_LEDGER_DATE_CACHE_SIZE = 4096`) memastikan pengurutan maupun pemfilteran ribuan transaksi tidak mengulang regex atau alokasi objek `Date`.
2. **Tahap Klasifikasi (`classifyTransaction`)**:
   - Menentukan sifat akuntansi transaksi berdasarkan `tx.type`, `coaCode`, prefix/kata kunci kategori, serta tautan `linkedDebtId`, `linkedInvestmentId`, `linkedFixedAssetId`, dan flag `isAdjustment`.
   - Aturan emas pemeliharaan: **transaksi mutasi aset/liabilitas (`transfer`, `debt_principal_pay`, `debt_proceeds`, `investment_buy`, `equity_injection`, `non_cash_adjustment`) tidak boleh masuk sebagai `operating_income` atau `operating_expense` di Laporan Laba-Rugi**.
3. **Tahap Pemisahan Utang & KPR (`resolveDebtInstallmentAccounting` & `syncKprDebtsToFixedAssets`)**:
   - Untuk angsuran utang ber-bunga/KPR, engine membaca `tx.linkedKprBreakdown` atau menghitung porsi bunga efektif dan pokok cicilan secara otomatis agar Laba-Rugi hanya menanggung beban bunga (`5810`), sementara Neraca dan Arus Kas Pendanaan mencatat pengurangan pokok (`2310`).
   - Pada sisi Aset Tetap, `syncKprDebtsToFixedAssets` mengunci nilai basis properti KPR pada porsi ekuitas bersih (`NilaiPerolehan - SisaPokokKPR`) selama KPR aktif, sehingga ketika Neraca menghitung `Total Aset - Total Liabilitas`, tidak terjadi pengurangan dua kali.
4. **Tahap Mutasi Saldo & Rekonstruksi GL (`getTransactionAccountDelta` & `calculateAccountGLBalance`)**:
   - Setiap transaksi menghasilkan delta terarah untuk akun likuid (`cash`, `bank`, `e-wallet`) maupun akun kredit (`credit_card`, `paylater`, meningkatkan/mengurangi `usedLimit` dan `currentBalance`).
   - Ketika menambah jenis transaksi baru, pengembang wajib memperbarui `getTransactionAccountDelta()` agar `auditLedgerIntegrity()` tetap konsisten 100% dengan saldo akun.
5. **Tahap Pre-Indexing Sankey (`src/utils/cashFlowSankey.ts`)**:
   - `buildSankeyPeriodIndex(transactions)` berjalan satu kali per perubahan referensi `transactions`, mengelompokkan transaksi ke `Map` `byMonth`, `byQuarter`, dan `byYear` sekaligus menyimpan hasil `classifyTransaction` per entri.
   - Saat pengguna berpindah tab periode (`Semua`, `Bulanan`, `Kuartal`, `Tahunan`) di `SankeyCashFlowSummary` / `SankeyFlowChart`, `lookupSankeyPeriodEntries()` mengambil bucket secara `O(1)`, kemudian `aggregatePeriodCashFlowIndexed()` menyusun ringkasan kas dan struktur simpul/arus D3 dalam satu lintasan tanpa mengulang klasifikasi.
6. **Tahap Otomasi Penyusutan & Audit (`computePendingYearEndFixedAssetDepreciations` & `App.tsx`)**:
   - Di `App.tsx`, pengecekan penyusutan akhir tahun membaca `transactionsRef.current` dan hanya dipicu ketika `currentUser`, `loadingPg`, `fixedAssets`, atau `debts` berubah (bukan pada setiap transaksi harian) demi menjaga responsivitas jurnal.
