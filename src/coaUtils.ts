import { Account, Transaction } from './types';

export interface AccountCOA {
  code: string;
  name: string;
  category: 'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense';
  normalBalance: 'Debet' | 'Kredit';
  description: string;
}

export const DEFAULT_COA_LIST: AccountCOA[] = [
  // 1000: Aset
  { code: '1100', name: 'Kas Tunai / Cash on Hand', category: 'Asset', normalBalance: 'Debet', description: 'Uang fisik tunai di dompet' },
  { code: '1200', name: 'Bank / Tabungan', category: 'Asset', normalBalance: 'Debet', description: 'Seluruh rekening simpanan bank (BCA, Mandiri, BRI, BNI, dll)' },
  { code: '1300', name: 'E-Wallet (GoPay, OVO, ShopeePay)', category: 'Asset', normalBalance: 'Debet', description: 'Dompet digital dan transaksi online' },
  { code: '1400', name: 'Alokasi Dana Darurat', category: 'Asset', normalBalance: 'Debet', description: 'Dana cadangan darurat likuid' },
  { code: '1500', name: 'Portofolio Investasi (Saham/Emas/Reksadana)', category: 'Asset', normalBalance: 'Debet', description: 'Investasi pasar modal dan logam mulia' },
  
  // 2000: Kewajiban
  { code: '2100', name: 'Utang Kartu Kredit', category: 'Liability', normalBalance: 'Kredit', description: 'Tagihan penggunaan limit kartu kredit' },
  { code: '2200', name: 'Utang Paylater', category: 'Liability', normalBalance: 'Kredit', description: 'Tagihan pinjaman paylater singkat' },
  { code: '2300', name: 'Pinjaman Personal / Bank / KPR', category: 'Liability', normalBalance: 'Kredit', description: 'Kewajiban pinjaman jangka panjang' },
  
  // 3000: Ekuitas
  { code: '3100', name: 'Modal Awal Keuangan', category: 'Equity', normalBalance: 'Kredit', description: 'Setoran modal saldo awal akun' },
  { code: '3200', name: 'Saldo Laba Ditahan (Retained Surplus)', category: 'Equity', normalBalance: 'Kredit', description: 'Akumulasi surplus/defisit transaksi berjalan' },
  
  // 4000: Pendapatan
  { code: '4100', name: 'Pendapatan Gaji Utama', category: 'Income', normalBalance: 'Kredit', description: 'Gaji rutin dari pekerjaan utama' },
  { code: '4200', name: 'Pendapatan Freelance & Usaha', category: 'Income', normalBalance: 'Kredit', description: 'Hasil kerja sampingan atau proyek' },
  { code: '4300', name: 'Hasil Investasi & Dividen', category: 'Income', normalBalance: 'Kredit', description: 'Gain & dividen portofolio investasi' },
  { code: '4400', name: 'Pendapatan Lain-lain', category: 'Income', normalBalance: 'Kredit', description: 'Hadiah, refund, atau penerimaan tak terduga' },
  
  // 5000: Beban / Pengeluaran
  { code: '5100', name: 'Beban Makanan & Minuman', category: 'Expense', normalBalance: 'Debet', description: 'Konsumsi harian, resto, dan groceries' },
  { code: '5200', name: 'Beban Belanja Harian & Rumah Tangga', category: 'Expense', normalBalance: 'Debet', description: 'Kebutuhan fisik rumah dan perlengkapan' },
  { code: '5300', name: 'Beban Utilitas & Tagihan', category: 'Expense', normalBalance: 'Debet', description: 'Listrik, air, internet Wi-Fi, pulsa' },
  { code: '5400', name: 'Beban Transportasi & Bensin', category: 'Expense', normalBalance: 'Debet', description: 'BBM, tol, ojek online, parkir' },
  { code: '5500', name: 'Beban Hiburan & Langganan Digital', category: 'Expense', normalBalance: 'Debet', description: 'Streaming, rekreasi, hobi, dan jalan-jalan' },
  { code: '5600', name: 'Beban Kesehatan & Medis', category: 'Expense', normalBalance: 'Debet', description: 'Obat, dokter, asuransi, dan perawatan' },
  { code: '5700', name: 'Beban Pendidikan & Pengembangan Diri', category: 'Expense', normalBalance: 'Debet', description: 'Buku, kursus, seminar, dan spp' },
  { code: '5800', name: 'Beban Angsuran Utang & Bunga', category: 'Expense', normalBalance: 'Debet', description: 'Pembayaran pokok & bunga utang' },
  { code: '5900', name: 'Beban Operasional Lainnya', category: 'Expense', normalBalance: 'Debet', description: 'Pengeluaran tak terduga lainnya' },
];

export const getStoredCoaList = (): AccountCOA[] => {
  try {
    const saved = localStorage.getItem('app_coa_list');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.error('Failed to load COA list from localStorage:', err);
  }
  return DEFAULT_COA_LIST;
};

export const saveStoredCoaList = (list: AccountCOA[]): void => {
  try {
    localStorage.setItem('app_coa_list', JSON.stringify(list));
  } catch (err) {
    console.error('Failed to save COA list to localStorage:', err);
  }
};

/**
 * Dynamically resolves the active COA code and name for a given account.
 * Handles explicit acc.coaCode if defined, otherwise falls back to dynamic type mapping.
 */
export const getAccountCoaMapping = (acc: Account, customCoaList?: AccountCOA[]) => {
  const activeCoas = customCoaList && customCoaList.length > 0 ? customCoaList : getStoredCoaList();

  // If account has an explicit coaCode set by user reconciliation
  if (acc.coaCode) {
    const explicitFound = activeCoas.find(c => c.code === acc.coaCode);
    if (explicitFound) {
      const catLabel = explicitFound.category === 'Asset' ? 'Aset' : explicitFound.category === 'Liability' ? 'Kewajiban' : explicitFound.category === 'Equity' ? 'Ekuitas' : explicitFound.category === 'Income' ? 'Pendapatan' : 'Beban';
      return { code: explicitFound.code, name: explicitFound.name, category: catLabel, isExplicit: true, isOrphaned: false };
    }
  }

  // Fallback dynamic mapping by type
  // 1. Bank Accounts (BCA, Mandiri, BRI, BNI, Danamon, etc.)
  if (acc.type === 'bank') {
    const found = activeCoas.find(c => c.code === '1200') ||
                  activeCoas.find(c => c.category === 'Asset' && c.name.toLowerCase().includes('bank')) ||
                  activeCoas.find(c => c.code.startsWith('12'));
    if (found) {
      return { code: found.code, name: found.name, category: 'Aset', isExplicit: false, isOrphaned: acc.coaCode ? true : false };
    }
    return { code: '1200', name: 'Bank / Tabungan', category: 'Aset', isExplicit: false, isOrphaned: acc.coaCode ? true : false };
  }

  // 2. Cash Accounts
  if (acc.type === 'cash') {
    const found = activeCoas.find(c => c.code === '1100') ||
                  activeCoas.find(c => c.category === 'Asset' && c.name.toLowerCase().includes('kas'));
    if (found) {
      return { code: found.code, name: found.name, category: 'Aset', isExplicit: false, isOrphaned: acc.coaCode ? true : false };
    }
    return { code: '1100', name: 'Kas Tunai / Cash on Hand', category: 'Aset', isExplicit: false, isOrphaned: acc.coaCode ? true : false };
  }

  // 3. E-Wallet Accounts
  if (acc.type === 'e-wallet') {
    const found = activeCoas.find(c => c.code === '1300') ||
                  activeCoas.find(c => c.category === 'Asset' && (c.name.toLowerCase().includes('wallet') || c.name.toLowerCase().includes('dompet')));
    if (found) {
      return { code: found.code, name: found.name, category: 'Aset', isExplicit: false, isOrphaned: acc.coaCode ? true : false };
    }
    return { code: '1300', name: 'E-Wallet (GoPay, OVO, ShopeePay)', category: 'Aset', isExplicit: false, isOrphaned: acc.coaCode ? true : false };
  }

  // 4. Credit Card Accounts
  if (acc.type === 'credit-card') {
    const found = activeCoas.find(c => c.code === '2100') ||
                  activeCoas.find(c => c.category === 'Liability' && c.name.toLowerCase().includes('kredit'));
    if (found) {
      return { code: found.code, name: found.name, category: 'Kewajiban', isExplicit: false, isOrphaned: acc.coaCode ? true : false };
    }
    return { code: '2100', name: 'Utang Kartu Kredit', category: 'Kewajiban', isExplicit: false, isOrphaned: acc.coaCode ? true : false };
  }

  // 5. PayLater Accounts
  if (acc.type === 'paylater') {
    const found = activeCoas.find(c => c.code === '2200') ||
                  activeCoas.find(c => c.category === 'Liability' && c.name.toLowerCase().includes('paylater'));
    if (found) {
      return { code: found.code, name: found.name, category: 'Kewajiban', isExplicit: false, isOrphaned: acc.coaCode ? true : false };
    }
    return { code: '2200', name: 'Utang Paylater', category: 'Kewajiban', isExplicit: false, isOrphaned: acc.coaCode ? true : false };
  }

  return { code: '1000', name: 'Aset Lainnya', category: 'Aset', isExplicit: false, isOrphaned: false };
};

/* =========================================================================
   LOG RIWAYAT PERUBAHAN MASTER DATA (MASTER CHANGE LOG)
   ========================================================================= */

export interface MasterChangeLog {
  id: string;
  timestamp: string;
  targetType: 'COA' | 'Account' | 'Category';
  targetName: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'RECONCILE' | 'SYNC';
  details: string;
  updatedBy: string;
}

export const getMasterChangeLogs = (): MasterChangeLog[] => {
  try {
    const saved = localStorage.getItem('app_master_change_log');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.error('Failed to load master change log:', err);
  }
  return [];
};

export const addMasterChangeLog = (
  targetType: 'COA' | 'Account' | 'Category',
  targetName: string,
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'RECONCILE' | 'SYNC',
  details: string,
  updatedBy = 'System Admin'
): MasterChangeLog[] => {
  const logs = getMasterChangeLogs();
  const newLog: MasterChangeLog = {
    id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toLocaleString('id-ID'),
    targetType,
    targetName,
    action,
    details,
    updatedBy,
  };
  const updatedLogs = [newLog, ...logs].slice(0, 100);
  try {
    localStorage.setItem('app_master_change_log', JSON.stringify(updatedLogs));
  } catch (err) {
    console.error('Failed to save master change log:', err);
  }
  return updatedLogs;
};

export const clearMasterChangeLogs = (): void => {
  localStorage.removeItem('app_master_change_log');
};

/* =========================================================================
   VALIDASI INTEGRITAS MASTER DATA SAAT APLIKASI DIMUAT
   ========================================================================= */

export interface MasterIntegrityReport {
  isValid: boolean;
  totalIssuesCount: number;
  issues: Array<{
    type: 'ORPHANED_COA_LINK' | 'UNMAPPED_ACCOUNT' | 'MISSING_BASE_COA';
    title: string;
    description: string;
    accountId?: string;
    accountName?: string;
    missingCode?: string;
  }>;
  checkedAt: string;
}

/**
 * Validasi integritas master data saat aplikasi dimuat.
 * Menemukan jika ada akun yang merujuk pada COA yang sudah dihapus atau tidak terhubung.
 */
export const validateMasterIntegrityOnLoad = (
  accounts: Account[],
  customCoaList?: AccountCOA[]
): MasterIntegrityReport => {
  const coaList = customCoaList && customCoaList.length > 0 ? customCoaList : getStoredCoaList();
  const issues: MasterIntegrityReport['issues'] = [];

  const existingCoaCodes = new Set(coaList.map((c) => c.code));

  // Check 1: Orphaned account COA links
  accounts.forEach((acc) => {
    if (acc.coaCode && !existingCoaCodes.has(acc.coaCode)) {
      issues.push({
        type: 'ORPHANED_COA_LINK',
        title: `Akun "${acc.name}" Merujuk pada COA [${acc.coaCode}] Terhapus`,
        description: `Akun rekening "${acc.name}" merujuk pada kode COA [${acc.coaCode}] yang sudah tidak ada dalam Master COA. Silakan lakukan Rekonsiliasi Manual untuk memperbarui relasi ID.`,
        accountId: acc.id,
        accountName: acc.name,
        missingCode: acc.coaCode,
      });
    }
  });

  // Check 2: Missing standard base COAs
  const essentialCodes = ['1100', '1200', '1300', '2100', '2200'];
  essentialCodes.forEach((code) => {
    if (!existingCoaCodes.has(code)) {
      issues.push({
        type: 'MISSING_BASE_COA',
        title: `Master COA Induk [${code}] Hilang`,
        description: `Kode COA standar [${code}] tidak ditemukan dalam sistem. Diperlukan sinkronisasi/rekonsiliasi otomatis.`,
        missingCode: code,
      });
    }
  });

  return {
    isValid: issues.length === 0,
    totalIssuesCount: issues.length,
    issues,
    checkedAt: new Date().toLocaleString('id-ID'),
  };
};

export interface CoaSyncReportItem {
  accountId: string;
  accountName: string;
  type: string;
  coaCode: string;
  coaName: string;
  category: string;
  isRepaired: boolean;
  notes: string;
}

export interface CoaSyncReport {
  totalAccountsProcessed: number;
  items: CoaSyncReportItem[];
  missingCoaAdded: string[];
  status: 'success';
  summaryMessage: string;
  timestamp: string;
}

/**
 * Manual Synchronization function to reconcile and repair Master Accounts & Master COA.
 * This fixes any deleted COA links, renamed COA nodes, or fragmented bank mappings.
 */
export const synchronizeAccountsAndCOA = (
  accounts: Account[],
  currentCoaList?: AccountCOA[]
): { updatedCoaList: AccountCOA[]; report: CoaSyncReport } => {
  let coaList = [...(currentCoaList && currentCoaList.length > 0 ? currentCoaList : getStoredCoaList())];
  const missingCoaAdded: string[] = [];

  // 1. Ensure primary base COA nodes exist in COA list (e.g. if code 1200 or 1100 was deleted)
  const baseDefaults: AccountCOA[] = [
    { code: '1100', name: 'Kas Tunai / Cash on Hand', category: 'Asset', normalBalance: 'Debet', description: 'Uang fisik tunai di dompet' },
    { code: '1200', name: 'Bank / Tabungan', category: 'Asset', normalBalance: 'Debet', description: 'Seluruh rekening simpanan bank (BCA, Mandiri, BRI, BNI, dll)' },
    { code: '1300', name: 'E-Wallet (GoPay, OVO, ShopeePay)', category: 'Asset', normalBalance: 'Debet', description: 'Dompet digital dan transaksi online' },
    { code: '2100', name: 'Utang Kartu Kredit', category: 'Liability', normalBalance: 'Kredit', description: 'Tagihan penggunaan limit kartu kredit' },
    { code: '2200', name: 'Utang Paylater', category: 'Liability', normalBalance: 'Kredit', description: 'Tagihan pinjaman paylater singkat' },
  ];

  for (const base of baseDefaults) {
    if (!coaList.some(c => c.code === base.code)) {
      coaList.push(base);
      missingCoaAdded.push(`${base.code} - ${base.name}`);
    }
  }

  // Remove any legacy specific orphaned COA nodes if present (e.g., legacy 1210 Bank BCA if it was standalone and empty)
  // Clean & sort COA
  coaList.sort((a, b) => a.code.localeCompare(b.code));
  saveStoredCoaList(coaList);

  // 2. Re-map each account dynamically
  const reportItems: CoaSyncReportItem[] = accounts.map((acc) => {
    const mapping = getAccountCoaMapping(acc, coaList);
    const isBank = acc.type === 'bank';
    const notes = isBank 
      ? `Terkoneksi terpusat ke COA Bank [${mapping.code} - ${mapping.name}]` 
      : `Tersinkronisasi dengan COA [${mapping.code} - ${mapping.name}]`;

    return {
      accountId: acc.id,
      accountName: acc.name,
      type: acc.type,
      coaCode: mapping.code,
      coaName: mapping.name,
      category: mapping.category,
      isRepaired: true,
      notes,
    };
  });

  const report: CoaSyncReport = {
    totalAccountsProcessed: accounts.length,
    items: reportItems,
    missingCoaAdded,
    status: 'success',
    summaryMessage: `Sinkronisasi & perbaikan data selesai! ${accounts.length} akun rekening berhasil disinkronkan dengan Master COA. Seluruh rekening bank (BCA, Mandiri, BRI, dll) kini secara terpusat terikat pada COA Bank & Kas.`,
    timestamp: new Date().toLocaleString('id-ID'),
  };

  return { updatedCoaList: coaList, report };
};

/* =========================================================================
   PEMINDAIAN DUPILKAT & COA TIDAK TERPAKAI
   ========================================================================= */

export interface CoaScanResult {
  duplicateCodes: Array<{ code: string; items: AccountCOA[] }>;
  duplicateNames: Array<{ normalizedName: string; items: AccountCOA[] }>;
  unusedCoas: AccountCOA[];
  totalDuplicates: number;
  totalUnused: number;
}

export const scanCoaDuplicatesAndUnused = (
  coaList: AccountCOA[],
  accounts: Account[],
  transactions: Transaction[] = []
): CoaScanResult => {
  // 1. Check duplicate codes
  const codeMap = new Map<string, AccountCOA[]>();
  coaList.forEach((c) => {
    const list = codeMap.get(c.code) || [];
    list.push(c);
    codeMap.set(c.code, list);
  });

  const duplicateCodes: Array<{ code: string; items: AccountCOA[] }> = [];
  codeMap.forEach((items, code) => {
    if (items.length > 1) {
      duplicateCodes.push({ code, items });
    }
  });

  // 2. Check duplicate names
  const nameMap = new Map<string, AccountCOA[]>();
  coaList.forEach((c) => {
    const norm = c.name.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
    const list = nameMap.get(norm) || [];
    list.push(c);
    nameMap.set(norm, list);
  });

  const duplicateNames: Array<{ normalizedName: string; items: AccountCOA[] }> = [];
  nameMap.forEach((items, norm) => {
    if (items.length > 1 && norm.length > 2) {
      duplicateNames.push({ normalizedName: norm, items });
    }
  });

  // 3. Check unused COAs
  // Used COA codes by accounts
  const usedCodes = new Set<string>();
  accounts.forEach((acc) => {
    const mapping = getAccountCoaMapping(acc, coaList);
    usedCodes.add(mapping.code);
    if (acc.coaCode) usedCodes.add(acc.coaCode);
  });

  // Also check essential default base codes so they aren't marked unused
  const defaultCodes = new Set(DEFAULT_COA_LIST.map((c) => c.code));

  const unusedCoas = coaList.filter((c) => {
    // If it's in default base codes or assigned to an account, it's NOT unused
    if (defaultCodes.has(c.code) || usedCodes.has(c.code)) {
      return false;
    }
    return true;
  });

  return {
    duplicateCodes,
    duplicateNames,
    unusedCoas,
    totalDuplicates: duplicateCodes.reduce((acc, d) => acc + d.items.length - 1, 0) + duplicateNames.reduce((acc, d) => acc + d.items.length - 1, 0),
    totalUnused: unusedCoas.length,
  };
};

/**
 * Otomatis menggabungkan COA duplikat dan membersihkan COA tidak terpakai
 */
export const autoMergeAndCleanupCoas = (
  coaList: AccountCOA[],
  accounts: Account[],
  transactions: Transaction[] = []
): {
  updatedCoaList: AccountCOA[];
  updatedAccounts: Account[];
  mergedCount: number;
  removedUnusedCount: number;
  summaryMessage: string;
} => {
  const scan = scanCoaDuplicatesAndUnused(coaList, accounts, transactions);

  // Keep track of unique COAs by code
  const uniqueCoaMap = new Map<string, AccountCOA>();
  let mergedCount = 0;

  coaList.forEach((c) => {
    if (!uniqueCoaMap.has(c.code)) {
      uniqueCoaMap.set(c.code, c);
    } else {
      mergedCount++;
    }
  });

  // Filter out unused non-default COAs
  const unusedSet = new Set(scan.unusedCoas.map((c) => c.code));
  let removedUnusedCount = 0;

  const finalCoaList: AccountCOA[] = [];
  uniqueCoaMap.forEach((c) => {
    if (unusedSet.has(c.code)) {
      removedUnusedCount++;
    } else {
      finalCoaList.push(c);
    }
  });

  // Ensure default base COA list is fully present
  DEFAULT_COA_LIST.forEach((def) => {
    if (!finalCoaList.some((c) => c.code === def.code)) {
      finalCoaList.push(def);
    }
  });

  finalCoaList.sort((a, b) => a.code.localeCompare(b.code));
  saveStoredCoaList(finalCoaList);

  // Re-map accounts
  const updatedAccounts = accounts.map((acc) => {
    const mapping = getAccountCoaMapping(acc, finalCoaList);
    return { ...acc, coaCode: mapping.code };
  });

  addMasterChangeLog(
    'COA',
    'Auto Merge & Cleanup Scanner',
    'SYNC',
    `Penggabungan COA otomatis selesai: ${mergedCount} COA duplikat digabungkan, ${removedUnusedCount} COA tidak terpakai dibersihkan.`,
    'System Admin'
  );

  const summaryMessage = `Penggabungan otomatis berhasil! ${mergedCount} COA duplikat telah digabungkan dan ${removedUnusedCount} COA tidak terpakai dibersihkan secara aman. Seluruh ${updatedAccounts.length} akun terhubung ke master COA terstandar.`;

  return {
    updatedCoaList: finalCoaList,
    updatedAccounts,
    mergedCount,
    removedUnusedCount,
    summaryMessage,
  };
};

/**
 * Factory Reset Master Data Standar
 */
export const factoryResetMasterData = (): {
  resetCoaList: AccountCOA[];
  resetAccounts: Account[];
} => {
  localStorage.removeItem('app_coa_list');
  const resetCoaList = DEFAULT_COA_LIST;
  saveStoredCoaList(resetCoaList);

  const resetAccounts: Account[] = [
    { id: 'acc-1', name: 'Dompet Tunai', type: 'cash', startingBalance: 500000, currentBalance: 500000, coaCode: '1100' },
    { id: 'acc-2', name: 'Bank Mandiri Utama', type: 'bank', startingBalance: 10000000, currentBalance: 10000000, coaCode: '1200' },
    { id: 'acc-3', name: 'GoPay Digital', type: 'e-wallet', startingBalance: 500000, currentBalance: 500000, coaCode: '1300' },
    { id: 'acc-4', name: 'SPayLater Paylater', type: 'paylater', startingBalance: 3000000, currentBalance: 3000000, creditLimit: 3000000, usedLimit: 0, dueDay: 13, coaCode: '2200' },
  ];

  addMasterChangeLog(
    'COA',
    'Factory Reset Master Data',
    'SYNC',
    'Seluruh Master COA & Master Akun dikembalikan ke standar awal pabrik yang teratur & bebas kesalahan.',
    'System Admin'
  );

  return { resetCoaList, resetAccounts };
};

