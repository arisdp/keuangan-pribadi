import {
  AccountCOA,
  DEFAULT_COA_LIST,
  getCoaReportScope,
  getStoredCoaList,
} from './coaUtils';
import { KprCoaMappingConfig } from './types';

export interface CategoryNode {
  id: string;
  name: string;
  type: 'type' | 'group' | 'subgroup' | 'item';
  transactionType?:
    | 'income'
    | 'expense'
    | 'equity'
    | 'saving'
    | 'investment'
    | 'asset'
    | 'liability';
  coaCode?: string;
  reportExplanation?: string;
  parentId?: string | null;
  children?: CategoryNode[];
}

export const DEFAULT_CATEGORY_HIERARCHY: CategoryNode[] = [
  {
    id: 'type-asset',
    name: 'Aset & Alokasi Kekayaan',
    type: 'type',
    transactionType: 'asset',
    coaCode: '1200',
    reportExplanation:
      'Mencatat alokasi kas, dana darurat, investasi, dan perolehan aset tetap pada Neraca (1xxx) tanpa langsung menjadi beban di Laba-Rugi.',
    children: [
      {
        id: 'grp-kas-bank',
        name: 'Kas, Bank & Transfer Internal',
        type: 'group',
        transactionType: 'asset',
        coaCode: '1200',
        reportExplanation:
          'Pergerakan dana antar akun likuid (Kas/Bank/e-Wallet); netral di Laba-Rugi dan hanya menggeser posisi kas di Neraca.',
        parentId: 'type-asset',
        children: [
          {
            id: 'item-transfer-antar-akun',
            name: 'Transfer Antar Akun',
            type: 'item',
            transactionType: 'asset',
            coaCode: '1200',
            reportExplanation:
              'Memindahkan saldo antar rekening sendiri (1100–1300) di Neraca; dikecualikan dari Pendapatan/Beban Laba-Rugi.',
            parentId: 'grp-kas-bank',
          },
        ],
      },
      {
        id: 'grp-dana-darurat',
        name: 'Tabungan & Dana Darurat',
        type: 'group',
        transactionType: 'saving',
        coaCode: '1400',
        reportExplanation:
          'Alokasi penyisihan dana cadangan ke akun Aset Lancar (1400) di Neraca.',
        parentId: 'type-asset',
        children: [
          {
            id: 'item-tabungan-darurat',
            name: 'Tabungan Darurat',
            type: 'item',
            transactionType: 'saving',
            coaCode: '1400',
            reportExplanation:
              'Menambah pos Alokasi Dana Darurat (1400) di Neraca sebagai cadangan likuid; bukan beban konsumtif Laba-Rugi.',
            parentId: 'grp-dana-darurat',
          },
          {
            id: 'item-tabungan-berjangka',
            name: 'Tabungan Berjangka',
            type: 'item',
            transactionType: 'saving',
            coaCode: '1400',
            reportExplanation:
              'Penyisihan tabungan tujuan (1400) di Neraca untuk rencana keuangan jangka menengah.',
            parentId: 'grp-dana-darurat',
          },
          {
            id: 'item-tabungan-haji-nikah',
            name: 'Tabungan Haji/Nikah',
            type: 'item',
            transactionType: 'saving',
            coaCode: '1400',
            reportExplanation:
              'Dana cadangan tujuan khusus pada pos Tabungan/Dana Darurat (1400) di Neraca.',
            parentId: 'grp-dana-darurat',
          },
          {
            id: 'item-rencana-liburan',
            name: 'Rencana Liburan',
            type: 'item',
            transactionType: 'saving',
            coaCode: '1400',
            reportExplanation:
              'Alokasi tabungan khusus rencana perjalanan (1400) di Neraca sebelum direalisasikan menjadi beban.',
            parentId: 'grp-dana-darurat',
          },
        ],
      },
      {
        id: 'grp-investasi-aset',
        name: 'Portofolio Investasi',
        type: 'group',
        transactionType: 'investment',
        coaCode: '1500',
        reportExplanation:
          'Penempatan modal pada instrumen saham, reksadana, dan emas yang dicatat sebagai Aset Investasi (1500) di Neraca.',
        parentId: 'type-asset',
        children: [
          {
            id: 'item-beli-investasi-baru',
            name: 'Beli Investasi Baru',
            type: 'item',
            transactionType: 'investment',
            coaCode: '1500',
            reportExplanation:
              'Mengonversi kas menjadi Portofolio Investasi (1500) di Neraca; hanya keuntungan/depresiasinya yang masuk Laba-Rugi.',
            parentId: 'grp-investasi-aset',
          },
          {
            id: 'item-investasi-saham',
            name: 'Investasi Saham',
            type: 'item',
            transactionType: 'investment',
            coaCode: '1500',
            reportExplanation:
              'Pembelian instrumen ekuitas saham pada pos Portofolio Investasi (1500) di Neraca.',
            parentId: 'grp-investasi-aset',
          },
          {
            id: 'item-reksadana',
            name: 'Reksadana',
            type: 'item',
            transactionType: 'investment',
            coaCode: '1500',
            reportExplanation:
              'Penempatan dana ke unit penyertaan reksadana pada pos Portofolio Investasi (1500) di Neraca.',
            parentId: 'grp-investasi-aset',
          },
          {
            id: 'item-logam-mulia',
            name: 'Logam Mulia (Emas)',
            type: 'item',
            transactionType: 'investment',
            coaCode: '1500',
            reportExplanation:
              'Kepemilikan aset emas fisik/digital yang tercatat di pos Portofolio Investasi (1500) di Neraca.',
            parentId: 'grp-investasi-aset',
          },
        ],
      },
      {
        id: 'grp-aset-tetap',
        name: 'Aset Tetap & Properti',
        type: 'group',
        transactionType: 'asset',
        coaCode: '1610',
        reportExplanation:
          'Nilai perolehan aset berwujud jangka panjang (1600/1610) di Neraca.',
        parentId: 'type-asset',
        children: [
          {
            id: 'item-pembelian-aset-tetap',
            name: 'Pembelian Aset Tetap',
            type: 'item',
            transactionType: 'asset',
            coaCode: '1610',
            reportExplanation:
              'Kapitalisasi pembelian kendaraan, elektronik, atau peralatan ke pos Aset Tetap (1610) di Neraca.',
            parentId: 'grp-aset-tetap',
          },
          {
            id: 'item-perolehan-properti-kpr',
            name: 'Perolehan Properti & KPR',
            type: 'item',
            transactionType: 'asset',
            coaCode: '1600',
            reportExplanation:
              'Mencatat nilai aset properti KPR pada pos Aset Properti & KPR (1600) di Neraca.',
            parentId: 'grp-aset-tetap',
          },
        ],
      },
    ],
  },
  {
    id: 'type-liability',
    name: 'Kewajiban & Utang',
    type: 'type',
    transactionType: 'liability',
    coaCode: '2100',
    reportExplanation:
      'Mencatat saldo dan pelunasan pokok kewajiban (2xxx) pada Neraca; hanya porsi bunga/adminnya yang masuk ke Beban Laba-Rugi.',
    children: [
      {
        id: 'grp-kewajiban-lancar',
        name: 'Kartu Kredit & PayLater',
        type: 'group',
        transactionType: 'liability',
        coaCode: '2100',
        reportExplanation:
          'Tagihan kewajiban jangka pendek (2100–2200) di Neraca.',
        parentId: 'type-liability',
        children: [
          {
            id: 'item-pembayaran-kartu-kredit',
            name: 'Pembayaran Kartu Kredit',
            type: 'item',
            transactionType: 'liability',
            coaCode: '2100',
            reportExplanation:
              'Mengurangi Utang Kartu Kredit (2100) di Neraca; tidak dihitung ganda sebagai beban di Laba-Rugi karena belanja asalnya sudah tercatat.',
            parentId: 'grp-kewajiban-lancar',
          },
          {
            id: 'item-pembayaran-paylater',
            name: 'Pembayaran Paylater',
            type: 'item',
            transactionType: 'liability',
            coaCode: '2200',
            reportExplanation:
              'Mengurangi Utang Paylater (2200) di Neraca saat pelunasan tagihan.',
            parentId: 'grp-kewajiban-lancar',
          },
        ],
      },
      {
        id: 'grp-kewajiban-jangka-panjang',
        name: 'Pinjaman & Pokok KPR',
        type: 'group',
        transactionType: 'liability',
        coaCode: '2310',
        reportExplanation:
          'Pelunasan pokok pinjaman KTA maupun fasilitas KPR (2300–2310) di Neraca.',
        parentId: 'type-liability',
        children: [
          {
            id: 'item-pelunasan-pokok-pinjaman',
            name: 'Pelunasan Pokok Pinjaman / KTA',
            type: 'item',
            transactionType: 'liability',
            coaCode: '2300',
            reportExplanation:
              'Menurunkan saldo Pinjaman Personal / Bank / KTA (2300) di Neraca.',
            parentId: 'grp-kewajiban-jangka-panjang',
          },
          {
            id: 'item-pembayaran-pokok-kpr',
            name: 'Pembayaran Pokok KPR',
            type: 'item',
            transactionType: 'liability',
            coaCode: '2310',
            reportExplanation:
              'Menurunkan Utang Pokok KPR (2310) di Neraca; porsi bunga cicilan otomatis dipisah ke Beban Bunga KPR [5810] di Laba-Rugi.',
            parentId: 'grp-kewajiban-jangka-panjang',
          },
        ],
      },
    ],
  },
  {
    id: 'type-equity',
    name: 'Ekuitas',
    type: 'type',
    transactionType: 'equity',
    coaCode: '3100',
    reportExplanation:
      'Mencatat modal awal dan akumulasi kekayaan bersih (3xxx) di Neraca; dikecualikan dari Laba-Rugi operasional.',
    children: [
      {
        id: 'grp-modal-awal',
        name: 'Modal Awal',
        type: 'group',
        transactionType: 'equity',
        coaCode: '3100',
        reportExplanation:
          'Setoran saldo awal seluruh akun kas, bank, dan aset pada Modal Awal Keuangan (3100).',
        parentId: 'type-equity',
        children: [
          {
            id: 'item-modal-awal',
            name: 'Modal Awal Keuangan',
            type: 'item',
            transactionType: 'equity',
            coaCode: '3100',
            reportExplanation:
              'Masuk ke pos Modal Awal Keuangan (3100) di Neraca; tidak dihitung sebagai Pendapatan pada Laporan Laba-Rugi.',
            parentId: 'grp-modal-awal',
          },
          {
            id: 'item-saldo-laba-ditahan',
            name: 'Saldo Laba Ditahan',
            type: 'item',
            transactionType: 'equity',
            coaCode: '3200',
            reportExplanation:
              'Akumulasi surplus/defisit periode sebelumnya pada pos Saldo Laba Ditahan (3200) di Neraca.',
            parentId: 'grp-modal-awal',
          },
        ],
      },
    ],
  },
  {
    id: 'type-income',
    name: 'Pendapatan',
    type: 'type',
    transactionType: 'income',
    coaCode: '4100',
    reportExplanation:
      'Seluruh pemasukan yang menambah Pendapatan Operasional dan menaikkan Laba Bersih pada Laporan Laba-Rugi (4xxx).',
    children: [
      {
        id: 'grp-pendapatan-tetap',
        name: 'Pendapatan Tetap',
        type: 'group',
        transactionType: 'income',
        coaCode: '4100',
        reportExplanation:
          'Penerimaan rutin bulanan dari gaji/honor tetap yang masuk ke Pendapatan Operasional (4100) di Laba-Rugi.',
        parentId: 'type-income',
        children: [
          {
            id: 'item-gaji',
            name: 'Gaji',
            type: 'item',
            transactionType: 'income',
            coaCode: '4100',
            reportExplanation:
              'Masuk ke pos Pendapatan Gaji Utama (4100) pada Pendapatan Operasional Laporan Laba-Rugi.',
            parentId: 'grp-pendapatan-tetap',
          },
          {
            id: 'item-gaji-utama',
            name: 'Gaji Utama',
            type: 'item',
            transactionType: 'income',
            coaCode: '4100',
            reportExplanation:
              'Komponen pendapatan gaji bulanan utama pada akun COA 4100 yang menambah Laba Bersih di Laporan Laba-Rugi.',
            parentId: 'grp-pendapatan-tetap',
          },
        ],
      },
      {
        id: 'grp-pendapatan-tidak-tetap',
        name: 'Pendapatan Tidak Tetap',
        type: 'group',
        transactionType: 'income',
        coaCode: '4200',
        reportExplanation:
          'Penerimaan variabel seperti proyek lepas, bunga bank, dividen, dan pendapatan lain-lain (4200–4400) di Laporan Laba-Rugi.',
        parentId: 'type-income',
        children: [
          {
            id: 'subgrp-pendapatan-bank',
            name: 'Pendapatan Bank',
            type: 'subgroup',
            transactionType: 'income',
            coaCode: '4300',
            reportExplanation:
              'Imbal hasil bunga simpanan bank & hasil investasi (4300) pada Laporan Laba-Rugi.',
            parentId: 'grp-pendapatan-tidak-tetap',
            children: [
              {
                id: 'item-bunga-bank',
                name: 'Bunga Bank',
                type: 'item',
                transactionType: 'income',
                coaCode: '4300',
                reportExplanation:
                  'Masuk ke pos Hasil Investasi & Dividen (4300) pada Pendapatan Operasional Laporan Laba-Rugi.',
                parentId: 'subgrp-pendapatan-bank',
              },
              {
                id: 'item-dividen-hasil-investasi',
                name: 'Dividen & Hasil Investasi',
                type: 'item',
                transactionType: 'income',
                coaCode: '4300',
                reportExplanation:
                  'Realisasi kupon, dividen, atau profit investasi pada pos COA 4300 yang menambah Laba Bersih di Laporan Laba-Rugi.',
                parentId: 'subgrp-pendapatan-bank',
              },
              {
                id: 'item-apresiasi-aset-tetap',
                name: 'Apresiasi Aset Tetap',
                type: 'item',
                transactionType: 'income',
                coaCode: '4310',
                reportExplanation:
                  'Kenaikan nilai pasar/revaluasi aset tetap & properti pada pos COA 4310 di Laporan Laba-Rugi.',
                parentId: 'subgrp-pendapatan-bank',
              },
            ],
          },
          {
            id: 'subgrp-pendapatan-lainnya',
            name: 'Pendapatan Lainnya',
            type: 'subgroup',
            transactionType: 'income',
            coaCode: '4400',
            reportExplanation:
              'Pendapatan sampingan, refund, dan arus kas masuk non-rutin.',
            parentId: 'grp-pendapatan-tidak-tetap',
            children: [
              {
                id: 'item-pendapatan-lain',
                name: 'Pendapatan Lain-Lain',
                type: 'item',
                transactionType: 'income',
                coaCode: '4400',
                reportExplanation:
                  'Masuk ke pos Pendapatan Lain-lain (4400) pada Pendapatan Operasional Laporan Laba-Rugi.',
                parentId: 'subgrp-pendapatan-lainnya',
              },
              {
                id: 'item-refund',
                name: 'Refund',
                type: 'item',
                transactionType: 'income',
                coaCode: '4400',
                reportExplanation:
                  'Pengembalian dana transaksi pada pos Pendapatan Lain-lain (4400) di Laporan Laba-Rugi.',
                parentId: 'subgrp-pendapatan-lainnya',
              },
              {
                id: 'item-sampingan',
                name: 'Sampingan',
                type: 'item',
                transactionType: 'income',
                coaCode: '4200',
                reportExplanation:
                  'Pendapatan proyek freelance, bonus, atau usaha sampingan pada pos COA 4200 di Laporan Laba-Rugi.',
                parentId: 'subgrp-pendapatan-lainnya',
              },
              {
                id: 'item-hadiah',
                name: 'Hadiah',
                type: 'item',
                transactionType: 'income',
                coaCode: '4400',
                reportExplanation:
                  'Penerimaan hadiah atau hibah dana pada pos Pendapatan Lain-lain (4400) di Laporan Laba-Rugi.',
                parentId: 'subgrp-pendapatan-lainnya',
              },
              {
                id: 'item-pencairan-dana-darurat',
                name: 'Pencairan Dana Darurat',
                type: 'item',
                transactionType: 'income',
                coaCode: '1400',
                reportExplanation:
                  'Penarikan kembali dana cadangan dari Alokasi Dana Darurat (1400) ke kas utama di Neraca; bersifat pergeseran aset.',
                parentId: 'subgrp-pendapatan-lainnya',
              },
              {
                id: 'item-penerimaan-utang',
                name: 'Penerimaan Utang Baru',
                type: 'item',
                transactionType: 'income',
                coaCode: '2300',
                reportExplanation:
                  'Arus kas masuk dari pinjaman baru yang dicatat sebagai Kewajiban (2300) di Neraca dan dikecualikan dari Laba Operasional.',
                parentId: 'subgrp-pendapatan-lainnya',
              },
              {
                id: 'item-pencairan-kpr',
                name: 'Pencairan KPR',
                type: 'item',
                transactionType: 'income',
                coaCode: '2310',
                reportExplanation:
                  'Plafon pencairan kredit pemilikan rumah yang membentuk Utang Pokok KPR (2310) di Neraca; bukan pendapatan operasional.',
                parentId: 'subgrp-pendapatan-lainnya',
              },
              {
                id: 'item-penjualan-investasi',
                name: 'Penjualan Investasi',
                type: 'item',
                transactionType: 'income',
                coaCode: '4300',
                reportExplanation:
                  'Pencairan/realisasi hasil penjualan portofolio investasi yang masuk ke pos Hasil Investasi (4300).',
                parentId: 'subgrp-pendapatan-lainnya',
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'type-expense',
    name: 'Pengeluaran',
    type: 'type',
    transactionType: 'expense',
    coaCode: '5100',
    reportExplanation:
      'Seluruh biaya operasional, bunga pinjaman, dan penyusutan (5xxx) yang mengurangi Laba Bersih di Laporan Laba-Rugi.',
    children: [
      {
        id: 'grp-bank-finansial',
        name: 'Bank dan Finansial',
        type: 'group',
        transactionType: 'expense',
        coaCode: '5910',
        reportExplanation:
          'Biaya administrasi bank, pajak bunga, dan biaya transfer pada Beban Biaya Bank (5910) di Laba-Rugi.',
        parentId: 'type-expense',
        children: [
          {
            id: 'item-biaya-bank',
            name: 'Biaya Bank',
            type: 'item',
            transactionType: 'expense',
            coaCode: '5910',
            reportExplanation:
              'Masuk ke pos Beban Biaya Bank & Admin Transaksi (5910) sebagai pengurang Laba Bersih di Laporan Laba-Rugi.',
            parentId: 'grp-bank-finansial',
          },
          {
            id: 'item-biaya-pajak-bank',
            name: 'Biaya Pajak Bank',
            type: 'item',
            transactionType: 'expense',
            coaCode: '5910',
            reportExplanation:
              'Potongan pajak atas jasa giro/bunga bank pada pos COA 5910 di Beban Operasional Laba-Rugi.',
            parentId: 'grp-bank-finansial',
          },
          {
            id: 'item-biaya-transaksi',
            name: 'Biaya Transaksi',
            type: 'item',
            transactionType: 'expense',
            coaCode: '5910',
            reportExplanation:
              'Biaya admin BI-FAST, top-up, atau transfer antar bank pada pos COA 5910 di Laporan Laba-Rugi.',
            parentId: 'grp-bank-finansial',
          },
        ],
      },
      {
        id: 'grp-belanja-online',
        name: 'Belanja Online',
        type: 'group',
        transactionType: 'expense',
        coaCode: '5200',
        reportExplanation:
          'Belanja kebutuhan fisik harian dan e-commerce pada pos COA 5200 di Laporan Laba-Rugi.',
        parentId: 'type-expense',
        children: [
          {
            id: 'item-belanja-online',
            name: 'Belanja Online',
            type: 'item',
            transactionType: 'expense',
            coaCode: '5200',
            reportExplanation:
              'Masuk ke pos Beban Belanja Harian & Rumah Tangga (5200) pada Laporan Laba-Rugi.',
            parentId: 'grp-belanja-online',
          },
          {
            id: 'item-belanja-bulanan',
            name: 'Belanja Bulanan',
            type: 'item',
            transactionType: 'expense',
            coaCode: '5200',
            reportExplanation:
              'Pengeluaran sembako & kebutuhan rutin rumah tangga pada pos COA 5200 di Laporan Laba-Rugi.',
            parentId: 'grp-belanja-online',
          },
        ],
      },
      {
        id: 'grp-kebutuhan-pribadi',
        name: 'Kebutuhan Pribadi',
        type: 'group',
        transactionType: 'expense',
        coaCode: '5100',
        reportExplanation:
          'Pengeluaran konsumsi makanan & gaya hidup pribadi (5100 & 5500) di Laporan Laba-Rugi.',
        parentId: 'type-expense',
        children: [
          {
            id: 'item-hiburan',
            name: 'Hiburan',
            type: 'item',
            transactionType: 'expense',
            coaCode: '5500',
            reportExplanation:
              'Masuk ke pos Beban Hiburan & Langganan Digital (5500) sebagai beban non-esensial di Laporan Laba-Rugi.',
            parentId: 'grp-kebutuhan-pribadi',
          },
          {
            id: 'item-makanan',
            name: 'Makanan',
            type: 'item',
            transactionType: 'expense',
            coaCode: '5100',
            reportExplanation:
              'Konsumsi harian, makan siang, dan restoran pada pos Beban Makanan & Minuman (5100) di Laporan Laba-Rugi.',
            parentId: 'grp-kebutuhan-pribadi',
          },
        ],
      },
      {
        id: 'grp-kebutuhan-rumah-tangga',
        name: 'Kebutuhan Rumah Tangga',
        type: 'group',
        transactionType: 'expense',
        coaCode: '5300',
        reportExplanation:
          'Tagihan utilitas, kebutuhan pokok, dan pemeliharaan tempat tinggal (5200–5830) di Laporan Laba-Rugi.',
        parentId: 'type-expense',
        children: [
          {
            id: 'item-kebutuhan-pokok',
            name: 'Kebutuhan Pokok',
            type: 'item',
            transactionType: 'expense',
            coaCode: '5200',
            reportExplanation:
              'Masuk ke pos Beban Belanja Harian & Rumah Tangga (5200) di Laporan Laba-Rugi.',
            parentId: 'grp-kebutuhan-rumah-tangga',
          },
          {
            id: 'item-properti',
            name: 'Properti',
            type: 'item',
            transactionType: 'expense',
            coaCode: '5830',
            reportExplanation:
              'Biaya IPL, pajak, atau perawatan rutin properti pada pos COA 5830 di Laporan Laba-Rugi.',
            parentId: 'grp-kebutuhan-rumah-tangga',
          },
          {
            id: 'item-utilitas',
            name: 'Utilitas & Tagihan',
            type: 'item',
            transactionType: 'expense',
            coaCode: '5300',
            reportExplanation:
              'Tagihan listrik, air PDAM, internet Wi-Fi, dan pulsa pada pos COA 5300 di Laporan Laba-Rugi.',
            parentId: 'grp-kebutuhan-rumah-tangga',
          },
        ],
      },
      {
        id: 'grp-kesehatan',
        name: 'Kesehatan',
        type: 'group',
        transactionType: 'expense',
        coaCode: '5600',
        reportExplanation:
          'Biaya layanan medis, obat-obatan, pemeriksaan laboratorium, dan perawatan tubuh (5600) di Laba-Rugi.',
        parentId: 'type-expense',
        children: [
          {
            id: 'item-perawatan-tubuh',
            name: 'Biaya Perawatan Tubuh',
            type: 'item',
            transactionType: 'expense',
            coaCode: '5600',
            reportExplanation:
              'Masuk ke pos Beban Kesehatan & Medis (5600) pada Laporan Laba-Rugi.',
            parentId: 'grp-kesehatan',
          },
          {
            id: 'item-tes-kesehatan',
            name: 'Biaya Tes Kesehatan',
            type: 'item',
            transactionType: 'expense',
            coaCode: '5600',
            reportExplanation:
              'Pemeriksaan laboratorium & medical check-up pada pos Beban Kesehatan & Medis (5600) di Laba-Rugi.',
            parentId: 'grp-kesehatan',
          },
          {
            id: 'item-kesehatan-umum',
            name: 'Kesehatan',
            type: 'item',
            transactionType: 'expense',
            coaCode: '5600',
            reportExplanation:
              'Pengeluaran dokter, obat-obatan, dan asuransi medis pada pos COA 5600 di Laporan Laba-Rugi.',
            parentId: 'grp-kesehatan',
          },
        ],
      },
      {
        id: 'grp-pengeluaran-lainnya',
        name: 'Pengeluaran Lainnya',
        type: 'group',
        transactionType: 'expense',
        coaCode: '5900',
        reportExplanation:
          'Pengeluaran umum lain-lain serta catatan transaksi penarikan tunai / pelunasan utang.',
        parentId: 'type-expense',
        children: [
          {
            id: 'item-biaya-lain',
            name: 'Biaya Lain-Lain',
            type: 'item',
            transactionType: 'expense',
            coaCode: '5900',
            reportExplanation:
              'Masuk ke pos Beban Operasional Lainnya (5900) sebagai pengurang Laba Bersih di Laporan Laba-Rugi.',
            parentId: 'grp-pengeluaran-lainnya',
          },
          {
            id: 'item-tarik-atm',
            name: 'Tarik ATM',
            type: 'item',
            transactionType: 'expense',
            coaCode: '1100',
            reportExplanation:
              'Perpindahan saldo dari Bank (1200) ke Kas Tunai (1100) di Neraca; otomatis netral bila ditandai transfer internal.',
            parentId: 'grp-pengeluaran-lainnya',
          },
          {
            id: 'item-topup-ewallet',
            name: 'Topup e-Wallet',
            type: 'item',
            transactionType: 'expense',
            coaCode: '1300',
            reportExplanation:
              'Pengisian saldo E-Wallet (1300) dari Bank (1200) di Neraca; netral di Laba-Rugi bila merupakan transfer antar akun.',
            parentId: 'grp-pengeluaran-lainnya',
          },
          {
            id: 'item-cicilan-utang',
            name: 'Cicilan / Pelunasan Utang',
            type: 'item',
            transactionType: 'expense',
            coaCode: '5800',
            reportExplanation:
              'Terkait pos Angsuran Utang & Bunga (5800) dan pengurangan Pokok Utang (2100–2310) di Neraca; pelunasan pokok murni dikecualikan dari beban operasional.',
            parentId: 'grp-pengeluaran-lainnya',
          },
        ],
      },
      {
        id: 'grp-sosial',
        name: 'Sosial & Pendidikan',
        type: 'group',
        transactionType: 'expense',
        coaCode: '5750',
        reportExplanation:
          'Pengeluaran donasi sosial (5750) dan pendidikan/pengembangan diri (5700) di Laporan Laba-Rugi.',
        parentId: 'type-expense',
        children: [
          {
            id: 'item-sosial',
            name: 'Sosial',
            type: 'item',
            transactionType: 'expense',
            coaCode: '5750',
            reportExplanation:
              'Masuk ke pos Beban Sosial, Zakat & Donasi (5750) pada Laporan Laba-Rugi.',
            parentId: 'grp-sosial',
          },
          {
            id: 'item-pendidikan',
            name: 'Pendidikan',
            type: 'item',
            transactionType: 'expense',
            coaCode: '5700',
            reportExplanation:
              'Biaya sekolah, buku, kursus, dan pelatihan pada pos Beban Pendidikan (5700) di Laporan Laba-Rugi.',
            parentId: 'grp-sosial',
          },
        ],
      },
      {
        id: 'grp-transportasi',
        name: 'Transportasi',
        type: 'group',
        transactionType: 'expense',
        coaCode: '5400',
        reportExplanation:
          'Seluruh biaya mobilitas harian pada pos Beban Transportasi & Bensin (5400) di Laba-Rugi.',
        parentId: 'type-expense',
        children: [
          {
            id: 'item-transportasi',
            name: 'Transportasi',
            type: 'item',
            transactionType: 'expense',
            coaCode: '5400',
            reportExplanation:
              'BBM, tol, parkir, tiket komuter, dan ojek online pada pos COA 5400 di Laporan Laba-Rugi.',
            parentId: 'grp-transportasi',
          },
        ],
      },
      {
        id: 'grp-kpr-properti',
        name: 'KPR & Pembiayaan Properti',
        type: 'group',
        transactionType: 'expense',
        coaCode: '5810',
        reportExplanation:
          'Memisahkan komponen angsuran KPR antara pengurangan pokok utang (Neraca 2310) dan beban bunga/biaya akad (Laba-Rugi 5810–5830).',
        parentId: 'type-expense',
        children: [
          {
            id: 'item-cicilan-kpr',
            name: 'Cicilan KPR',
            type: 'item',
            transactionType: 'expense',
            coaCode: '5800',
            reportExplanation:
              'Angsuran KPR bulanan: porsi bunga otomatis dicatat ke Beban Bunga KPR [5810] di Laba-Rugi, sementara porsi pokok mengurangi Utang KPR [2310] di Neraca.',
            parentId: 'grp-kpr-properti',
          },
          {
            id: 'item-beban-bunga-kpr',
            name: 'Beban Bunga KPR',
            type: 'item',
            transactionType: 'expense',
            coaCode: '5810',
            reportExplanation:
              'Porsi bunga KPR pada pos COA 5810 yang langsung mengurangi Laba Bersih di Laporan Laba-Rugi.',
            parentId: 'grp-kpr-properti',
          },
          {
            id: 'item-biaya-provisi-kpr',
            name: 'Biaya Provisi & Admin KPR',
            type: 'item',
            transactionType: 'expense',
            coaCode: '5820',
            reportExplanation:
              'Biaya provisi bank dan administrasi kredit pada pos COA 5820 di Laporan Laba-Rugi.',
            parentId: 'grp-kpr-properti',
          },
          {
            id: 'item-biaya-notaris-ajb',
            name: 'Biaya Notaris & AJB',
            type: 'item',
            transactionType: 'expense',
            coaCode: '5820',
            reportExplanation:
              'Biaya jasa notaris, akta jual beli, dan balik nama sertifikat pada pos COA 5820 di Laporan Laba-Rugi.',
            parentId: 'grp-kpr-properti',
          },
          {
            id: 'item-pajak-properti-kpr',
            name: 'Pajak Properti (BPHTB & PBB)',
            type: 'item',
            transactionType: 'expense',
            coaCode: '5830',
            reportExplanation:
              'Biaya pajak perolehan tanah/bangunan (BPHTB) dan PBB pada pos COA 5830 di Laporan Laba-Rugi.',
            parentId: 'grp-kpr-properti',
          },
          {
            id: 'item-asuransi-kpr',
            name: 'Asuransi KPR & Properti',
            type: 'item',
            transactionType: 'expense',
            coaCode: '5830',
            reportExplanation:
              'Premi asuransi jiwa kredit & kebakaran properti pada pos COA 5830 di Laporan Laba-Rugi.',
            parentId: 'grp-kpr-properti',
          },
          {
            id: 'item-dp-kpr',
            name: 'Uang Muka (DP) KPR',
            type: 'item',
            transactionType: 'expense',
            coaCode: '1600',
            reportExplanation:
              'Kapitalisasi uang muka pembelian rumah ke pos Aset Properti & KPR (1600) di Neraca.',
            parentId: 'grp-kpr-properti',
          },
        ],
      },
      {
        id: 'grp-penyesuaian-akuntansi',
        name: 'Penyesuaian Akuntansi (Non-Kas)',
        type: 'group',
        transactionType: 'expense',
        coaCode: '5950',
        reportExplanation:
          'Jurnal penyesuaian periodik atas penurunan nilai investasi, penyusutan aset tetap, dan akrual bunga (5950, 5960, 5810) di Laba-Rugi.',
        parentId: 'type-expense',
        children: [
          {
            id: 'item-depresiasi-investasi',
            name: 'Depresiasi Aset Investasi',
            type: 'item',
            transactionType: 'expense',
            coaCode: '5950',
            reportExplanation:
              'Beban non-kas (5950) atas penurunan nilai pasar investasi di Laba-Rugi dengan akun kontra [1590] di Neraca.',
            parentId: 'grp-penyesuaian-akuntansi',
          },
          {
            id: 'item-penyusutan-aset-tetap',
            name: 'Penyusutan Aset Tetap',
            type: 'item',
            transactionType: 'expense',
            coaCode: '5960',
            reportExplanation:
              'Beban penyusutan periodik kendaraan & elektronik (5960) di Laba-Rugi dengan akun kontra Akumulasi Penyusutan [1690] di Neraca.',
            parentId: 'grp-penyesuaian-akuntansi',
          },
          {
            id: 'item-akrual-bunga-utang',
            name: 'Akrual Bunga Utang',
            type: 'item',
            transactionType: 'expense',
            coaCode: '5810',
            reportExplanation:
              'Pengakuan beban bunga pinjaman berjalan (5810) di Laba-Rugi dengan pasangan Utang Bunga Akrual [2390] di Neraca.',
            parentId: 'grp-penyesuaian-akuntansi',
          },
        ],
      },
    ],
  },
];

// Merge any newly added system default nodes & backfill COA metadata onto existing stored nodes without overwriting user edits
export function mergeMissingDefaultCategories(storedNodes: CategoryNode[]): CategoryNode[] {
  const existingNames = new Set<string>();
  const collectNames = (nodes: CategoryNode[]) => {
    nodes.forEach((n) => {
      if (n.name) existingNames.add(n.name.toLowerCase().trim());
      if (n.children) collectNames(n.children);
    });
  };
  collectNames(storedNodes);

  const cloned: CategoryNode[] = JSON.parse(JSON.stringify(storedNodes));

  const mergeBranch = (
    targetParentChildren: CategoryNode[],
    defaultNodes: CategoryNode[],
    parentId?: string
  ) => {
    defaultNodes.forEach((defNode) => {
      const defLower = defNode.name.toLowerCase().trim();
      const existingTarget = targetParentChildren.find(
        (t) => t.id === defNode.id || t.name.toLowerCase().trim() === defLower
      );
      if (!existingTarget && !existingNames.has(defLower)) {
        targetParentChildren.push({
          ...JSON.parse(JSON.stringify(defNode)),
          parentId: parentId ?? defNode.parentId,
        });
        existingNames.add(defLower);
      } else if (existingTarget) {
        if (!existingTarget.coaCode && defNode.coaCode) {
          existingTarget.coaCode = defNode.coaCode;
        }
        if (!existingTarget.reportExplanation && defNode.reportExplanation) {
          existingTarget.reportExplanation = defNode.reportExplanation;
        }
        if (!existingTarget.transactionType && defNode.transactionType) {
          existingTarget.transactionType = defNode.transactionType;
        }
        if (defNode.children && defNode.children.length > 0) {
          if (!existingTarget.children) existingTarget.children = [];
          mergeBranch(existingTarget.children, defNode.children, existingTarget.id);
        }
      }
    });
  };

  mergeBranch(cloned, DEFAULT_CATEGORY_HIERARCHY);
  return cloned;
}

let memoryCategories: CategoryNode[] = DEFAULT_CATEGORY_HIERARCHY;

// In-memory category helper (authoritative persistence handled by PostgreSQL)
export function getStoredCategories(_username?: string): CategoryNode[] {
  if (Array.isArray(memoryCategories) && memoryCategories.length > 0) {
    return mergeMissingDefaultCategories(memoryCategories);
  }
  return DEFAULT_CATEGORY_HIERARCHY;
}

export function saveStoredCategories(categories: CategoryNode[], _username?: string) {
  memoryCategories =
    Array.isArray(categories) && categories.length > 0
      ? mergeMissingDefaultCategories(categories)
      : DEFAULT_CATEGORY_HIERARCHY;
}

// Helper to flatten categories into an array of options with path strings
export interface CategoryFlatOption {
  id: string;
  name: string;
  path: string;
  level: number;
  type: 'type' | 'group' | 'subgroup' | 'item';
  transactionType?: string;
  coaCode?: string;
  reportExplanation?: string;
  parentId?: string | null;
}

export function flattenCategoryHierarchy(
  nodes: CategoryNode[],
  parentPath = '',
  level = 0,
  inheritedTransactionType?: CategoryNode['transactionType']
): CategoryFlatOption[] {
  let result: CategoryFlatOption[] = [];

  for (const node of nodes) {
    const currentPath = parentPath ? `${parentPath} > ${node.name}` : node.name;
    const effectiveTxType = node.transactionType || inheritedTransactionType;
    result.push({
      id: node.id,
      name: node.name,
      path: currentPath,
      level,
      type: node.type,
      transactionType: effectiveTxType,
      coaCode: node.coaCode,
      reportExplanation: node.reportExplanation,
      parentId: node.parentId,
    });

    if (node.children && node.children.length > 0) {
      result = result.concat(
        flattenCategoryHierarchy(node.children, currentPath, level + 1, effectiveTxType)
      );
    }
  }

  return result;
}

// Helper to find a category node by ID or Name
export function findCategoryNode(nodes: CategoryNode[], term: string): CategoryNode | null {
  const lower = term.toLowerCase().trim();
  for (const node of nodes) {
    if (node.id === term || node.name.toLowerCase().trim() === lower) {
      return node;
    }
    if (node.children) {
      const found = findCategoryNode(node.children, term);
      if (found) return found;
    }
  }
  return null;
}

// Add a category node under a parent ID (supports optional COA link & report explanation)
export function addCategoryNode(
  nodes: CategoryNode[],
  parentId: string,
  newNodeName: string,
  nodeType: 'group' | 'subgroup' | 'item',
  coaCode?: string,
  reportExplanation?: string
): CategoryNode[] {
  const newNode: CategoryNode = {
    id: `cat-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    name: newNodeName.trim(),
    type: nodeType,
    parentId,
    coaCode: coaCode?.trim() || undefined,
    reportExplanation: reportExplanation?.trim() || undefined,
    children: nodeType === 'item' ? undefined : [],
  };

  const recursiveAdd = (tree: CategoryNode[]): CategoryNode[] => {
    return tree.map((node) => {
      if (node.id === parentId) {
        return {
          ...node,
          children: [...(node.children || []), newNode],
        };
      }
      if (node.children) {
        return {
          ...node,
          children: recursiveAdd(node.children),
        };
      }
      return node;
    });
  };

  return recursiveAdd(nodes);
}

// Update COA code & report explanation on an existing category node
export function updateCategoryNodeCoa(
  nodes: CategoryNode[],
  targetId: string,
  coaCode: string,
  reportExplanation?: string
): CategoryNode[] {
  const trimmedCode = coaCode.trim();
  const trimmedExpl = reportExplanation?.trim();
  return nodes.map((node) => {
    if (node.id === targetId) {
      return {
        ...node,
        coaCode: trimmedCode || undefined,
        reportExplanation:
          reportExplanation !== undefined ? trimmedExpl || undefined : node.reportExplanation,
      };
    }
    if (node.children) {
      return {
        ...node,
        children: updateCategoryNodeCoa(node.children, targetId, coaCode, reportExplanation),
      };
    }
    return node;
  });
}

// Delete a category node by ID
export function deleteCategoryNode(nodes: CategoryNode[], targetId: string): CategoryNode[] {
  return nodes
    .filter((node) => node.id !== targetId)
    .map((node) => {
      if (node.children) {
        return {
          ...node,
          children: deleteCategoryNode(node.children, targetId),
        };
      }
      return node;
    });
}

// Rename a category node by ID
export function renameCategoryNode(
  nodes: CategoryNode[],
  targetId: string,
  newName: string
): CategoryNode[] {
  return nodes.map((node) => {
    if (node.id === targetId) {
      return { ...node, name: newName.trim() };
    }
    if (node.children) {
      return {
        ...node,
        children: renameCategoryNode(node.children, targetId, newName),
      };
    }
    return node;
  });
}

export interface ResolvedCategoryCoaInfo {
  coaCode: string;
  coaName: string;
  coaCategory: AccountCOA['category'];
  normalBalance: 'Debet' | 'Kredit';
  reportName: 'Laporan Laba-Rugi' | 'Neraca (Posisi Keuangan)';
  categoryLabelID: string;
  reportExplanation: string;
  isExplicitNodeLink: boolean;
}

function inferFallbackCoaCode(
  categoryName: string,
  kindHint?: 'income' | 'expense',
  kprCoaMapping?: KprCoaMappingConfig
): string {
  const lower = categoryName.toLowerCase().trim();

  if (kprCoaMapping) {
    if (
      kprCoaMapping.interestExpenseCategory &&
      lower === kprCoaMapping.interestExpenseCategory.toLowerCase().trim()
    ) {
      return kprCoaMapping.interestExpenseCode || '5810';
    }
    if (
      kprCoaMapping.principalPaymentCategory &&
      lower === kprCoaMapping.principalPaymentCategory.toLowerCase().trim()
    ) {
      return kprCoaMapping.principalLiabilityCode || '2310';
    }
    if (
      kprCoaMapping.disbursementIncomeCategory &&
      lower === kprCoaMapping.disbursementIncomeCategory.toLowerCase().trim()
    ) {
      return kprCoaMapping.principalLiabilityCode || '2310';
    }
  }

  // KPR & Non-cash adjustments
  if (lower.includes('bunga kpr') || lower.includes('akrual bunga')) return '5810';
  if (lower.includes('provisi') || lower.includes('notaris') || lower.includes('ajb')) return '5820';
  if (lower.includes('bphtb') || lower.includes('pbb') || lower.includes('asuransi kpr') || lower === 'properti') return '5830';
  if (lower.includes('dp kpr') || lower.includes('uang muka')) return '1600';
  if (lower.includes('pokok kpr') || lower.includes('pencairan kpr')) return '2310';
  if (lower.includes('depresiasi') && lower.includes('investasi')) return '5950';
  if (lower.includes('penyusutan')) return '5960';

  // Assets / Savings / Liabilities
  if (lower.includes('dana darurat') || lower.includes('tabungan')) return '1400';
  if (
    lower.includes('beli investasi') ||
    lower.includes('investasi saham') ||
    lower.includes('reksadana') ||
    lower.includes('emas')
  ) {
    return '1500';
  }
  if (lower.includes('aset tetap')) return lower.includes('apresiasi') ? '4310' : '1610';
  if (lower.includes('kartu kredit')) return '2100';
  if (lower.includes('paylater')) return '2200';
  if (lower.includes('modal awal')) return '3100';
  if (lower.includes('laba ditahan')) return '3200';
  if (lower.includes('tarik atm')) return '1100';
  if (lower.includes('topup') || lower.includes('e-wallet')) return '1300';
  if (lower.includes('transfer')) return '1200';

  // Income keywords
  if (lower.includes('gaji') || lower.includes('tunjangan')) return '4100';
  if (lower.includes('sampingan') || lower.includes('freelance') || lower.includes('usaha') || lower.includes('proyek')) return '4200';
  if (lower.includes('bunga bank') || lower.includes('dividen') || lower.includes('hasil investasi') || lower.includes('penjualan investasi')) return '4300';
  if (lower.includes('apresiasi')) return '4310';
  if (lower.includes('refund') || lower.includes('hadiah') || lower.includes('pendapatan lain')) return '4400';

  // Expense keywords
  if (lower.includes('makan') || lower.includes('minum') || lower.includes('kopi') || lower.includes('kuliner')) return '5100';
  if (lower.includes('belanja') || lower.includes('kebutuhan pokok') || lower.includes('rumah tangga')) return '5200';
  if (lower.includes('utilitas') || lower.includes('listrik') || lower.includes('air') || lower.includes('internet') || lower.includes('tagihan')) return '5300';
  if (lower.includes('transport') || lower.includes('bensin') || lower.includes('parkir') || lower.includes('tol')) return '5400';
  if (lower.includes('hiburan') || lower.includes('streaming') || lower.includes('libur')) return '5500';
  if (lower.includes('kesehatan') || lower.includes('dokter') || lower.includes('obat') || lower.includes('perawatan tubuh')) return '5600';
  if (lower.includes('pendidikan') || lower.includes('kursus') || lower.includes('buku')) return '5700';
  if (lower.includes('sosial') || lower.includes('donasi') || lower.includes('zakat') || lower.includes('sedekah')) return '5750';
  if (lower.includes('cicilan') || lower.includes('angsuran') || lower.includes('pelunasan utang')) return '5800';
  if (lower.includes('biaya bank') || lower.includes('pajak bank') || lower.includes('biaya transaksi')) return '5910';

  return kindHint === 'income' ? '4400' : '5900';
}

/**
 * Resolves any transaction/report category name to its linked Master COA entry and clear accounting explanation.
 */
export function resolveCategoryCoaInfo(
  categoryName: string,
  masterCategories: CategoryNode[] = DEFAULT_CATEGORY_HIERARCHY,
  customCoaList?: AccountCOA[],
  kprCoaMapping?: KprCoaMappingConfig,
  kindHint?: 'income' | 'expense'
): ResolvedCategoryCoaInfo {
  const activeCoas =
    customCoaList && customCoaList.length > 0 ? customCoaList : getStoredCoaList();
  const bracketMatch = categoryName.match(/\[(\d{4})\]\s*$/);
  const bracketCoaCode = bracketMatch ? bracketMatch[1] : undefined;
  const cleanedName = bracketMatch
    ? categoryName.replace(/\s*\[\d{4}\]\s*$/, '').trim()
    : categoryName;
  const normalized = cleanedName.toLowerCase().trim();

  // Prefer leaf (item) matches over group/type matches in masterCategories
  const flat = flattenCategoryHierarchy(masterCategories);
  const matchedNode =
    flat.find((n) => n.type === 'item' && n.name.toLowerCase().trim() === normalized) ||
    flat.find((n) => n.type !== 'type' && n.name.toLowerCase().trim() === normalized) ||
    flat.find((n) => n.name.toLowerCase().trim() === normalized);

  // Also check default hierarchy as fallback for explicit explanations on older saved trees
  const defaultFlat = flattenCategoryHierarchy(DEFAULT_CATEGORY_HIERARCHY);
  const defaultNode =
    defaultFlat.find((n) => n.type === 'item' && n.name.toLowerCase().trim() === normalized) ||
    defaultFlat.find((n) => n.name.toLowerCase().trim() === normalized);

  const explicitCode = bracketCoaCode || matchedNode?.coaCode || defaultNode?.coaCode;
  const resolvedCode =
    explicitCode || inferFallbackCoaCode(cleanedName, kindHint, kprCoaMapping);

  const coaObj =
    activeCoas.find((c) => c.code === resolvedCode) ||
    DEFAULT_COA_LIST.find((c) => c.code === resolvedCode) || {
      code: resolvedCode,
      name: kindHint === 'income' ? 'Pendapatan Lain-lain' : 'Beban Operasional Lainnya',
      category: (kindHint === 'income' ? 'Income' : 'Expense') as AccountCOA['category'],
      normalBalance: (kindHint === 'income' ? 'Kredit' : 'Debet') as 'Debet' | 'Kredit',
      description: 'Kategori transaksi tercatat pada buku besar.',
    };

  const scope = getCoaReportScope(coaObj.category);
  const explanation =
    matchedNode?.reportExplanation ||
    defaultNode?.reportExplanation ||
    `${coaObj.description} (${scope.impactSummary})`;

  return {
    coaCode: coaObj.code,
    coaName: coaObj.name,
    coaCategory: coaObj.category,
    normalBalance: coaObj.normalBalance,
    reportName: scope.reportName,
    categoryLabelID: scope.categoryLabelID,
    reportExplanation: explanation,
    isExplicitNodeLink: Boolean(matchedNode?.coaCode),
  };
}

/**
 * Returns all leaf/group category nodes linked to a specific COA code (bi-directional COA -> Categories lookup).
 */
export function getCategoriesLinkedToCoa(
  coaCode: string,
  masterCategories: CategoryNode[] = DEFAULT_CATEGORY_HIERARCHY
): CategoryFlatOption[] {
  const flat = flattenCategoryHierarchy(masterCategories);
  return flat.filter((opt) => opt.type !== 'type' && opt.coaCode === coaCode);
}
