import { Account, CategoryBudget, Debt, EmergencyFundConfig, EmergencyFundTransaction, Transaction, InvestmentAsset, RecurringTransaction } from './types';

export const INITIAL_ACCOUNTS: Account[] = [
  { id: 'acc-1', name: 'Dompet Tunai', type: 'cash', startingBalance: 500000, currentBalance: 335000 },
  { id: 'acc-2', name: 'Bank Mandiri', type: 'bank', startingBalance: 12000000, currentBalance: 11050000 },
  { id: 'acc-3', name: 'GoPay', type: 'e-wallet', startingBalance: 800000, currentBalance: 80000 },
  { id: 'acc-4', name: 'SPayLater', type: 'paylater', startingBalance: 5000000, currentBalance: 3800000, creditLimit: 5000000, usedLimit: 1200000, dueDay: 13 },
];

export const INITIAL_BUDGETS: CategoryBudget[] = [
  { category: 'Makanan', type: 'expense', limit: 2000000 },
  { category: 'Transportasi', type: 'expense', limit: 800000 },
  { category: 'Hiburan', type: 'expense', limit: 1000000 },
  { category: 'Utilitas & Tagihan', type: 'expense', limit: 1200000 },
  { category: 'Belanja Bulanan', type: 'expense', limit: 1500000 },
  { category: 'Tabungan Darurat', type: 'saving', limit: 1000000 },
  { category: 'Investasi Saham', type: 'investment', limit: 1500000 },
];

export const INITIAL_TRANSACTIONS: Transaction[] = [
  {
    id: 'tx-1',
    date: '2026-07-01',
    accountId: 'acc-2',
    type: 'income',
    category: 'Gaji Utama',
    description: 'Gaji bulanan Juli',
    amount: 15000000,
  },
  {
    id: 'tx-2',
    date: '2026-07-05',
    accountId: 'acc-2',
    type: 'income',
    category: 'Sampingan',
    description: 'Proyek desain lepas',
    amount: 2500000,
  },
  {
    id: 'tx-3',
    date: '2026-07-02',
    accountId: 'acc-1',
    type: 'expense',
    category: 'Makanan',
    description: 'Makan malam di restoran',
    amount: 120000,
  },
  {
    id: 'tx-4',
    date: '2026-07-03',
    accountId: 'acc-2',
    type: 'expense',
    category: 'Belanja Bulanan',
    description: 'Kebutuhan pokok Supermarket',
    amount: 450000,
  },
  {
    id: 'tx-5',
    date: '2026-07-04',
    accountId: 'acc-3',
    type: 'expense',
    category: 'Utilitas & Tagihan',
    description: 'Pembelian token listrik PLN',
    amount: 300000,
  },
  {
    id: 'tx-6',
    date: '2026-07-05',
    accountId: 'acc-3',
    type: 'expense',
    category: 'Hiburan',
    description: 'Langganan Netflix & Spotify',
    amount: 186000,
  },
  {
    id: 'tx-7',
    date: '2026-07-06',
    accountId: 'acc-3',
    type: 'expense',
    category: 'Hiburan',
    description: 'Tiket bioskop & popcorn',
    amount: 150000,
  },
  {
    id: 'tx-8',
    date: '2026-07-07',
    accountId: 'acc-3',
    type: 'expense',
    category: 'Transportasi',
    description: 'Isi ulang saldo e-money & MRT',
    amount: 85000,
  },
  {
    id: 'tx-9',
    date: '2026-07-08',
    accountId: 'acc-1',
    type: 'expense',
    category: 'Makanan',
    description: 'Makan siang kantor',
    amount: 450000,
  },
  {
    id: 'tx-10',
    date: '2026-07-10',
    accountId: 'acc-2',
    type: 'saving',
    category: 'Tabungan Darurat',
    description: 'Tabungan Dana Darurat Bulanan',
    amount: 1000000,
  },
  {
    id: 'tx-11',
    date: '2026-07-11',
    accountId: 'acc-2',
    type: 'investment',
    category: 'Investasi Saham',
    description: 'Beli Reksa Dana Saham',
    amount: 1000000,
  },
];

export const INITIAL_DEBTS: Debt[] = [
  {
    id: 'debt-1',
    name: 'Kartu Kredit BCA',
    balance: 3500000,
    interestRate: 21, // 21% APR
    minPayment: 350000,
    purpose: 'consumptive',
    category: 'Kartu Kredit',
    dueDay: 15,
  },
  {
    id: 'debt-2',
    name: 'KTA Bank Mandiri',
    balance: 12000000,
    interestRate: 12, // 12% APR
    minPayment: 800000,
    purpose: 'productive',
    category: 'Pinjaman Bank',
    dueDay: 14,
  },
];

export const INITIAL_EMERGENCY_CONFIG: EmergencyFundConfig = {
  jobStability: 'medium',
  dependents: 1,
  monthlyExpense: 4500000,
};

export const INITIAL_EMERGENCY_TXS: EmergencyFundTransaction[] = [
  {
    id: 'etx-1',
    date: '2026-07-01',
    type: 'addition',
    amount: 3500000,
    location: 'Reksadana Pasar Uang',
    description: 'Saldo awal simpanan dana darurat',
  },
  {
    id: 'etx-2',
    date: '2026-07-10',
    type: 'addition',
    amount: 1000000,
    location: 'Reksadana Pasar Uang',
    description: 'Setoran rutin bulan Juli',
  },
];

export const INITIAL_INVESTMENTS: InvestmentAsset[] = [
  {
    id: 'inv-1',
    name: 'Saham BBCA',
    category: 'Saham',
    balance: 4500000,
    dateAdded: '2026-06-15',
    initialCapital: 4000000,
    quantity: 500,
    units: 500,
    unitName: 'Lembar',
    purchaseUnitPrice: 8000,
    currentUnitPrice: 9000,
    unitPrice: 9000,
    dividendsOrInterest: 125000,
    priceHistory: [
      { id: 'ph-1', assetId: 'inv-1', assetName: 'Saham BBCA', date: '2026-06-15', unitPrice: 8000, note: 'Pembelian Awal' },
      { id: 'ph-2', assetId: 'inv-1', assetName: 'Saham BBCA', date: '2026-07-01', unitPrice: 8500, previousUnitPrice: 8000, changePercentage: 6.25, note: 'Laporan Kuartal II Positif' },
      { id: 'ph-3', assetId: 'inv-1', assetName: 'Saham BBCA', date: '2026-07-15', unitPrice: 9000, previousUnitPrice: 8500, changePercentage: 5.88, note: 'Aksi Korporasi & Dividen' },
    ]
  },
  {
    id: 'inv-2',
    name: 'Reksadana Suco Sukuk',
    category: 'Reksadana',
    balance: 2000000,
    dateAdded: '2026-07-01',
    initialCapital: 1950000,
    quantity: 1000,
    units: 1000,
    unitName: 'Unit',
    purchaseUnitPrice: 1950,
    currentUnitPrice: 2000,
    unitPrice: 2000,
    dividendsOrInterest: 45000,
    priceHistory: [
      { id: 'ph-4', assetId: 'inv-2', assetName: 'Reksadana Suco Sukuk', date: '2026-07-01', unitPrice: 1950, note: 'Pembelian Awal' },
      { id: 'ph-5', assetId: 'inv-2', assetName: 'Reksadana Suco Sukuk', date: '2026-07-10', unitPrice: 1980, previousUnitPrice: 1950, changePercentage: 1.54, note: 'Nav Mingguan Naik' },
      { id: 'ph-6', assetId: 'inv-2', assetName: 'Reksadana Suco Sukuk', date: '2026-07-20', unitPrice: 2000, previousUnitPrice: 1980, changePercentage: 1.01, note: 'Bagi Hasil Bulanan' },
    ]
  },
  {
    id: 'inv-3',
    name: 'Emas ANTAM',
    category: 'Logam Mulia (Emas)',
    balance: 1500000,
    dateAdded: '2026-05-10',
    initialCapital: 1400000,
    quantity: 1,
    units: 1,
    unitName: 'Gram',
    purchaseUnitPrice: 1400000,
    currentUnitPrice: 1500000,
    unitPrice: 1500000,
    priceHistory: [
      { id: 'ph-7', assetId: 'inv-3', assetName: 'Emas ANTAM', date: '2026-05-10', unitPrice: 1400000, note: 'Pembelian Awal' },
      { id: 'ph-8', assetId: 'inv-3', assetName: 'Emas ANTAM', date: '2026-06-20', unitPrice: 1450000, previousUnitPrice: 1400000, changePercentage: 3.57, note: 'Kenaikan Harga Emas Dunia' },
      { id: 'ph-9', assetId: 'inv-3', assetName: 'Emas ANTAM', date: '2026-07-18', unitPrice: 1500000, previousUnitPrice: 1450000, changePercentage: 3.45, note: 'Update Harga Butik Antam' },
    ]
  },
];

export const INITIAL_RECURRING_TRANSACTIONS: RecurringTransaction[] = [
  {
    id: 'rec-1',
    title: 'Gaji Utama Bulanan',
    type: 'income',
    category: 'Gaji Utama',
    amount: 15000000,
    accountId: 'acc-2',
    frequency: 'monthly',
    dayOfMonth: 1,
    isActive: true,
    description: 'Gaji bulanan masuk ke Bank Mandiri',
    lastProcessedDate: '2026-07-01',
  },
  {
    id: 'rec-2',
    title: 'Langganan Netflix & Spotify',
    type: 'expense',
    category: 'Hiburan',
    amount: 186000,
    accountId: 'acc-3',
    frequency: 'monthly',
    dayOfMonth: 5,
    isActive: true,
    description: 'Tagihan bulanan hiburan digital',
    lastProcessedDate: '2026-07-05',
  },
  {
    id: 'rec-3',
    title: 'Tagihan Wi-Fi & Internet',
    type: 'expense',
    category: 'Utilitas & Tagihan',
    amount: 350000,
    accountId: 'acc-2',
    frequency: 'monthly',
    dayOfMonth: 10,
    isActive: true,
    description: 'Tagihan langganan internet kantor/rumah',
    lastProcessedDate: '',
  },
];
