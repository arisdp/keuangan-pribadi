import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import {
  Transaction,
  Account,
  Debt,
  FixedAsset,
  InvestmentAsset,
  EmergencyFundTransaction,
  KprCoaMappingConfig,
} from '../types';
import {
  isOperatingIncome,
  isOperatingExpense,
  classifyTransaction,
  calculateBalanceSheet,
  calculateFixedAssetValuation,
  syncKprDebtsToFixedAssets,
  getAccountCreditBill,
  getCreditAccounts,
  getLiquidAccounts,
  toLocalYYYYMMDD,
} from './accountingEngine';
import { formatterIDR } from './formatters';
import { showToast } from './toast';

interface BalanceSheetExportData {
  liquidAssets: number;
  emergencyAssets: number;
  investmentAssets: number;
  fixedAssetsBasis?: number;
  fixedAssetsNetAdjustment?: number;
  fixedAssetsValue?: number;
  combinedInvestmentAndFixedAssets?: number;
  totalAssets: number;
  creditCardPaylaterBills: number;
  activeDebtsBalance: number;
  totalLiabilities: number;
  equity: number;
  isBalanced: boolean;
}

interface CashFlowExportData {
  operatingInflows: number;
  operatingOutflows: number;
  netOperating: number;
  investmentInflows?: number;
  investmentOutflows: number;
  fixedAssetOutflows?: number;
  netInvesting: number;
  savingInflows?: number;
  savingOutflows: number;
  debtPaymentOutflows?: number;
  debtProceedsInflows?: number;
  nonCashCreditOutflows?: number;
  netFinancing: number;
  netCashChange: number;
}

interface BudgetRealizationExportData {
  category: string;
  limit: number;
  actual: number;
  variance: number;
  usagePercent: number;
  status: string;
}

// 1. Export Laba Rugi (Income Statement) to CSV
export const exportIncomeStatementToCSV = (
  transactions: Transaction[],
  periodTitle: string = 'Periode Berjalan',
  kprCoaMapping?: KprCoaMappingConfig
) => {
  const incomeTxs = transactions.filter((t) => isOperatingIncome(t));
  const expenseTxs = transactions.filter((t) => isOperatingExpense(t));

  // Category aggregates
  const incomeCategorySums: Record<string, number> = {};
  incomeTxs.forEach((t) => {
    incomeCategorySums[t.category] = (incomeCategorySums[t.category] || 0) + t.amount;
  });

  const expenseCategorySums: Record<string, number> = {};
  expenseTxs.forEach((t) => {
    expenseCategorySums[t.category] = (expenseCategorySums[t.category] || 0) + t.amount;
  });
  transactions.forEach((t) => {
    if (classifyTransaction(t) === 'debt_principal_pay' && t.linkedKprBreakdown) {
      const interestPart = Math.max(0, Number(t.linkedKprBreakdown.interestPart) || 0);
      if (interestPart > 0) {
        const coaCode =
          t.linkedKprBreakdown.interestCoaCode || kprCoaMapping?.interestExpenseCode || '5810';
        const baseCat =
          t.linkedKprBreakdown.interestCategory ||
          kprCoaMapping?.interestExpenseCategory ||
          'Beban Bunga KPR';
        const interestCat = `${baseCat} [${coaCode}]`;
        expenseCategorySums[interestCat] = (expenseCategorySums[interestCat] || 0) + interestPart;
      }
    }
  });

  const totalIncome = Object.values(incomeCategorySums).reduce((a, b) => a + b, 0);
  const totalExpense = Object.values(expenseCategorySums).reduce((a, b) => a + b, 0);
  const netSurplus = totalIncome - totalExpense;

  let csv = `LAPORAN LABA RUGI (INCOME STATEMENT) - NUSANTARA WEALTH\n`;
  csv += `Periode Laporan,${periodTitle}\n`;
  csv += `Tanggal Diterbitkan,${new Date().toLocaleDateString('id-ID')}\n\n`;

  csv += `KATEGORI PENDAPATAN OPERASIONAL,JUMLAH (IDR)\n`;
  Object.entries(incomeCategorySums).forEach(([cat, val]) => {
    csv += `"${cat}",${val}\n`;
  });
  csv += `TOTAL PENDAPATAN OPERASIONAL,${totalIncome}\n\n`;

  csv += `KATEGORI BEBAN & PENGELUARAN OPERASIONAL,JUMLAH (IDR)\n`;
  Object.entries(expenseCategorySums).forEach(([cat, val]) => {
    csv += `"${cat}",${val}\n`;
  });
  csv += `TOTAL BEBAN OPERASIONAL,${totalExpense}\n\n`;

  csv += `SURPLUS / DEFISIT OPERASIONAL BERSIH (NET OPERATING INCOME),${netSurplus}\n`;

  downloadBlob(csv, `Laporan_Laba_Rugi_${toLocalYYYYMMDD()}.csv`, 'text/csv;charset=utf-8;');
};

// 2. Export Neraca (Balance Sheet) to CSV
export const exportBalanceSheetToCSV = (
  data: BalanceSheetExportData,
  accounts: Account[],
  debts: Debt[],
  investments: InvestmentAsset[],
  fixedAssets: FixedAsset[] = []
) => {
  const syncedFixedAssets = syncKprDebtsToFixedAssets(fixedAssets, debts);
  const fixedAssetsTotal = data.fixedAssetsValue ?? syncedFixedAssets.reduce(
    (sum, fa) => sum + calculateFixedAssetValuation(fa, debts).currentBookValue,
    0
  );
  const combinedInvestFixed =
    data.combinedInvestmentAndFixedAssets ?? ((data.investmentAssets || 0) + fixedAssetsTotal);

  let csv = `LAPORAN NERACA KEUANGAN (BALANCE SHEET) - NUSANTARA WEALTH\n`;
  csv += `Tanggal Posisi,${new Date().toLocaleDateString('id-ID')}\n\n`;

  csv += `ASET (ASSETS),NILAI (IDR)\n`;
  csv += `Kas & Rekening Bank Likuid,${data.liquidAssets}\n`;
  accounts.filter(a => a.type !== 'credit-card' && a.type !== 'paylater').forEach(a => {
    csv += `  - ${a.name} (${a.type}),${a.currentBalance}\n`;
  });
  csv += `Dana Darurat Likuid,${data.emergencyAssets}\n`;
  csv += `Portofolio Investasi,${data.investmentAssets}\n`;
  investments.forEach(inv => {
    csv += `  - ${inv.name} (${inv.category}),${inv.balance}\n`;
  });
  csv += `Aset Tetap & Ekuitas Properti KPR,${fixedAssetsTotal}\n`;
  syncedFixedAssets.forEach((fa) => {
    const val = calculateFixedAssetValuation(fa, debts);
    const statusLabel = fa.isKprLinked
      ? val.isPaidOff
        ? 'Lunas - Aset Tetap Penuh'
        : `KPR Aktif (${val.ownershipPct.toFixed(1)}% lunas)`
      : fa.category;
    csv += `  - "${fa.name.replace(/"/g, '""')} (${statusLabel}) [Basis ${val.basisValue}; Penyesuaian ${val.totalNetValueChange >= 0 ? '+' : ''}${val.totalNetValueChange}]",${val.currentBookValue}\n`;
  });
  csv += `Kombinasi Portofolio Investasi & Aset Tetap,${combinedInvestFixed}\n`;
  csv += `TOTAL ASET,${data.totalAssets}\n\n`;

  csv += `KEWAJIBAN & UTANG (LIABILITIES),NILAI (IDR)\n`;
  csv += `Tagihan Kartu Kredit & Paylater,${data.creditCardPaylaterBills}\n`;
  csv += `Sisa Pinjaman & Utang Aktif,${data.activeDebtsBalance}\n`;
  debts.forEach(d => {
    csv += `  - ${d.name},${d.balance}\n`;
  });
  csv += `TOTAL KEWAJIBAN,${data.totalLiabilities}\n\n`;

  csv += `EKUITAS BERSIH (NET WORTH = ASET - KEWAJIBAN),${data.equity}\n`;
  csv += `STATUS BALANCE,${data.isBalanced ? 'BALANCED (SEIMBANG)' : 'UNBALANCED'}\n`;

  downloadBlob(csv, `Laporan_Neraca_${toLocalYYYYMMDD()}.csv`, 'text/csv;charset=utf-8;');
};

// 3. Export Laporan Arus Kas (Cash Flow) to CSV
export const exportCashFlowToCSV = (data: CashFlowExportData) => {
  let csv = `LAPORAN ARUS KAS (CASH FLOW STATEMENT) - NUSANTARA WEALTH\n`;
  csv += `Tanggal Diterbitkan,${new Date().toLocaleDateString('id-ID')}\n\n`;

  csv += `AKTIVITAS OPERASIONAL,JUMLAH (IDR)\n`;
  csv += `Penerimaan Kas Operasional (Pemasukan),${data.operatingInflows}\n`;
  csv += `Pengeluaran Kas Operasional (Beban Harian),-${data.operatingOutflows}\n`;
  csv += `ARUS KAS BERSIH OPERASIONAL,${data.netOperating}\n\n`;

  csv += `AKTIVITAS INVESTASI & CADANGAN ASET,JUMLAH (IDR)\n`;
  if (data.investmentInflows) {
    csv += `Pencairan / Penjualan Investasi,${data.investmentInflows}\n`;
  }
  csv += `Pembelian / Setoran Investasi,-${data.investmentOutflows}\n`;
  if (data.fixedAssetOutflows && data.fixedAssetOutflows > 0) {
    csv += `Pembelian / Akuisisi Aset Tetap,-${data.fixedAssetOutflows}\n`;
  }
  if (data.savingInflows) {
    csv += `Pencairan Dana Darurat,${data.savingInflows}\n`;
  }
  csv += `Alokasi Tabungan & Dana Darurat,-${data.savingOutflows}\n`;
  csv += `ARUS KAS BERSIH INVESTASI & CADANGAN,${data.netInvesting}\n\n`;

  csv += `AKTIVITAS PENDANAAN (PEMBIAYAAN & UTANG),JUMLAH (IDR)\n`;
  csv += `Penerimaan Pencairan Pinjaman / Utang Baru,${data.debtProceedsInflows || 0}\n`;
  csv += `Pembayaran Cicilan Pokok Utang & KPR,-${data.debtPaymentOutflows || 0}\n`;
  csv += `ARUS KAS BERSIH PENDANAAN,${data.netFinancing}\n\n`;

  csv += `PERUBAHAN BERSIH KAS (NET CASH CHANGE),${data.netCashChange}\n`;
  if (data.nonCashCreditOutflows && data.nonCashCreditOutflows > 0) {
    csv += `CATATAN NON-KAS: Belanja via Kartu Kredit / PayLater,${data.nonCashCreditOutflows}\n`;
  }

  downloadBlob(csv, `Laporan_Arus_Kas_${toLocalYYYYMMDD()}.csv`, 'text/csv;charset=utf-8;');
};

// 4. Export Budget vs Realization to CSV
export const exportBudgetRealizationToCSV = (items: BudgetRealizationExportData[]) => {
  let csv = `ANALISIS BUDGET VS REALISASI - NUSANTARA WEALTH\n`;
  csv += `Tanggal Diterbitkan,${new Date().toLocaleDateString('id-ID')}\n\n`;
  csv += `KATEGORI,BATAS BUDGET (IDR),REALISASI (IDR),SELISIH (IDR),PERSENTASE (%),STATUS\n`;

  items.forEach((item) => {
    csv += `"${item.category}",${item.limit},${item.actual},${item.variance},${item.usagePercent.toFixed(1)}%,"${item.status}"\n`;
  });

  downloadBlob(csv, `Analisis_Budget_vs_Realisasi_${toLocalYYYYMMDD()}.csv`, 'text/csv;charset=utf-8;');
};

// 5. Generic PDF Exporter with Official Header Branding
export const exportReportSectionToPDF = async (
  elementId: string,
  reportTitle: string
) => {
  const element = document.getElementById(elementId);
  if (!element) {
    showToast({
      type: 'error',
      title: 'Gagal Ekspor PDF',
      message: 'Elemen laporan tidak ditemukan di halaman.',
    });
    return;
  }

  try {
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
    });

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

    let heightLeft = pdfHeight;
    let position = 0;

    pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
    heightLeft -= pageHeight;

    while (heightLeft >= 0) {
      position = heightLeft - pdfHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
      heightLeft -= pageHeight;
    }

    pdf.save(`${reportTitle.replace(/\s+/g, '_')}_${toLocalYYYYMMDD()}.pdf`);
  } catch (err) {
    console.error('Failed to export PDF:', err);
    showToast({
      type: 'error',
      title: 'Gagal Ekspor PDF',
      message: 'Terjadi kendala saat membuat berkas PDF laporan.',
    });
  }
};

// Helper to trigger file download
const downloadBlob = (content: string, filename: string, contentType: string) => {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const INDONESIAN_MONTH_NAMES = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

export interface MonthlyBalanceAndIncomeSummary {
  month: number;
  year: number;
  ymPrefix: string;
  periodLabel: string;
  monthTxCount: number;
  balanceSheet: ReturnType<typeof calculateBalanceSheet>;
  liquidAccounts: Array<{ name: string; type: string; balance: number }>;
  investmentItems: Array<{ name: string; category: string; balance: number }>;
  fixedAssetItems: Array<{ name: string; statusLabel: string; bookValue: number }>;
  debtItems: Array<{ name: string; category: string; balance: number }>;
  creditBillItems: Array<{ name: string; typeLabel: string; bill: number }>;
  incomeCategories: Array<{ category: string; amount: number }>;
  expenseCategories: Array<{ category: string; amount: number }>;
  totalIncome: number;
  totalExpense: number;
  netSurplus: number;
  operatingMarginPct: number;
}

export function buildMonthlyBalanceAndIncomeSummary(params: {
  month: number;
  year: number;
  transactions: Transaction[];
  accounts: Account[];
  debts: Debt[];
  investments: InvestmentAsset[];
  emergencyTransactions: EmergencyFundTransaction[];
  fixedAssets?: FixedAsset[];
  kprCoaMapping?: KprCoaMappingConfig;
}): MonthlyBalanceAndIncomeSummary {
  const {
    month,
    year,
    transactions = [],
    accounts = [],
    debts = [],
    investments = [],
    emergencyTransactions = [],
    fixedAssets = [],
    kprCoaMapping,
  } = params;

  const ymPrefix = `${year}-${String(month).padStart(2, '0')}`;
  const periodLabel = `${INDONESIAN_MONTH_NAMES[month - 1] || 'Bulan'} ${year}`;

  const syncedFixedAssets = syncKprDebtsToFixedAssets(fixedAssets, debts);
  const balanceSheet = calculateBalanceSheet(
    accounts,
    emergencyTransactions,
    investments,
    debts,
    syncedFixedAssets
  );

  const liquidAccounts = getLiquidAccounts(accounts).map((acc) => ({
    name: acc.name,
    type: acc.type.toUpperCase(),
    balance: acc.currentBalance || 0,
  }));

  const investmentItems = investments.map((inv) => ({
    name: inv.name,
    category: (inv as any).assetType || inv.category || 'Investasi',
    balance: inv.balance || 0,
  }));

  const fixedAssetItems = syncedFixedAssets.map((fa) => {
    const val = calculateFixedAssetValuation(fa, debts);
    const statusLabel = fa.isKprLinked
      ? val.isPaidOff
        ? 'Lunas (100%)'
        : `KPR ${val.ownershipPct.toFixed(1)}% lunas`
      : fa.category;
    return {
      name: fa.name,
      statusLabel,
      bookValue: val.currentBookValue,
    };
  });

  const debtItems = debts
    .filter((d) => (d.balance || 0) > 0)
    .map((d) => ({
      name: d.name,
      category: d.category,
      balance: d.balance,
    }));

  const creditBillItems = getCreditAccounts(accounts)
    .map((acc) => ({
      name: acc.name,
      typeLabel: acc.type === 'credit-card' ? 'Kartu Kredit' : 'PayLater',
      bill: getAccountCreditBill(acc),
    }))
    .filter((item) => item.bill > 0);

  const monthTxs = transactions.filter((t) => t?.date && t.date.startsWith(ymPrefix));
  const incomeMap: Record<string, number> = {};
  const expenseMap: Record<string, number> = {};

  for (const tx of monthTxs) {
    const amt = Math.abs(Number(tx.amount) || 0);
    if (isOperatingIncome(tx)) {
      const cat = tx.category || 'Pendapatan Lainnya';
      incomeMap[cat] = (incomeMap[cat] || 0) + amt;
    } else if (isOperatingExpense(tx)) {
      const cat = tx.category || 'Pengeluaran Lainnya';
      expenseMap[cat] = (expenseMap[cat] || 0) + amt;
    } else if (classifyTransaction(tx) === 'debt_principal_pay' && tx.linkedKprBreakdown) {
      const interestPart = Math.max(0, Number(tx.linkedKprBreakdown.interestPart) || 0);
      if (interestPart > 0) {
        const coaCode =
          tx.linkedKprBreakdown.interestCoaCode || kprCoaMapping?.interestExpenseCode || '5810';
        const baseCat =
          tx.linkedKprBreakdown.interestCategory ||
          kprCoaMapping?.interestExpenseCategory ||
          'Beban Bunga KPR';
        const interestCat = `${baseCat} [${coaCode}]`;
        expenseMap[interestCat] = (expenseMap[interestCat] || 0) + interestPart;
      }
    }
  }

  const incomeCategories = Object.entries(incomeMap)
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  const expenseCategories = Object.entries(expenseMap)
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  const totalIncome = incomeCategories.reduce((s, x) => s + x.amount, 0);
  const totalExpense = expenseCategories.reduce((s, x) => s + x.amount, 0);
  const netSurplus = totalIncome - totalExpense;
  const operatingMarginPct = totalIncome > 0 ? (netSurplus / totalIncome) * 100 : 0;

  return {
    month,
    year,
    ymPrefix,
    periodLabel,
    monthTxCount: monthTxs.length,
    balanceSheet,
    liquidAccounts,
    investmentItems,
    fixedAssetItems,
    debtItems,
    creditBillItems,
    incomeCategories,
    expenseCategories,
    totalIncome,
    totalExpense,
    netSurplus,
    operatingMarginPct,
  };
}

/**
 * Menghasilkan dokumen PDF vektor (teks & tabel presisi A4) berisi
 * Ringkasan Neraca dan Laporan Laba-Rugi Bulanan untuk periode terpilih.
 */
export function exportMonthlyBalanceAndIncomePDF(params: {
  month: number;
  year: number;
  transactions: Transaction[];
  accounts: Account[];
  debts: Debt[];
  investments: InvestmentAsset[];
  emergencyTransactions: EmergencyFundTransaction[];
  fixedAssets?: FixedAsset[];
  kprCoaMapping?: KprCoaMappingConfig;
}): string {
  const summary = buildMonthlyBalanceAndIncomeSummary(params);
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 14;
  const contentWidth = pageWidth - marginX * 2;
  const bottomLimit = pageHeight - 18;
  let y = 14;

  const formatRp = (val: number) => formatterIDR.format(Math.round(val));

  const truncateLabel = (text: string, maxChars: number) => {
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    return clean.length > maxChars ? `${clean.slice(0, maxChars - 1)}…` : clean;
  };

  const drawContinuationHeader = () => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text('NUSANTARA WEALTH · LAPORAN KEUANGAN BULANAN', marginX, 12);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`Periode ${summary.periodLabel}`, pageWidth - marginX, 12, { align: 'right' });
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(marginX, 15, pageWidth - marginX, 15);
    y = 22;
  };

  const ensureSpace = (neededMm: number) => {
    if (y + neededMm > bottomLimit) {
      doc.addPage();
      drawContinuationHeader();
    }
  };

  const drawSectionHeading = (title: string, subtitle: string) => {
    ensureSpace(16);
    doc.setFillColor(15, 23, 42);
    doc.roundedRect(marginX, y, contentWidth, 10.5, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(255, 255, 255);
    doc.text(title, marginX + 4, y + 6.6);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(203, 213, 225);
    doc.text(subtitle, pageWidth - marginX - 4, y + 6.6, { align: 'right' });
    y += 13.5;
  };

  const drawSubGroupHeader = (label: string) => {
    ensureSpace(8);
    doc.setFillColor(248, 250, 252);
    doc.rect(marginX, y, contentWidth, 6.5, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(marginX, y + 6.5, pageWidth - marginX, y + 6.5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(51, 65, 85);
    doc.text(label, marginX + 3, y + 4.5);
    y += 6.5;
  };

  const drawRow = (
    label: string,
    amountText: string,
    opts?: {
      indent?: boolean;
      bold?: boolean;
      fill?: [number, number, number];
      amountColor?: [number, number, number];
      labelColor?: [number, number, number];
    }
  ) => {
    ensureSpace(6.5);
    const rowH = 6.2;
    if (opts?.fill) {
      doc.setFillColor(opts.fill[0], opts.fill[1], opts.fill[2]);
      doc.rect(marginX, y, contentWidth, rowH, 'F');
    }
    doc.setDrawColor(241, 245, 249);
    doc.setLineWidth(0.2);
    doc.line(marginX, y + rowH, pageWidth - marginX, y + rowH);

    doc.setFont('helvetica', opts?.bold ? 'bold' : 'normal');
    doc.setFontSize(8.5);
    const lc = opts?.labelColor || (opts?.bold ? [15, 23, 42] : [71, 85, 105]);
    doc.setTextColor(lc[0], lc[1], lc[2]);
    const textX = marginX + (opts?.indent ? 7 : 3);
    doc.text(truncateLabel(label, opts?.indent ? 68 : 74), textX, y + 4.3);

    const ac = opts?.amountColor || (opts?.bold ? [15, 23, 42] : [30, 41, 59]);
    doc.setTextColor(ac[0], ac[1], ac[2]);
    doc.text(amountText, pageWidth - marginX - 3, y + 4.3, { align: 'right' });
    y += rowH;
  };

  // --- TOP REPORT BANNER ---
  doc.setFillColor(15, 23, 42);
  doc.roundedRect(marginX, y, contentWidth, 25, 2, 2, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13.5);
  doc.setTextColor(255, 255, 255);
  doc.text('NUSANTARA WEALTH', marginX + 5, y + 8.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(148, 163, 184);
  doc.text('Ringkasan Neraca (Balance Sheet) & Laporan Laba-Rugi Bulanan', marginX + 5, y + 14.5);

  doc.setFontSize(8);
  doc.setTextColor(226, 232, 240);
  const printDateStr = new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  doc.text(`Periode Laba-Rugi: ${summary.periodLabel}`, pageWidth - marginX - 5, y + 8.5, {
    align: 'right',
  });
  doc.text(`Posisi Neraca per: ${printDateStr}`, pageWidth - marginX - 5, y + 14.5, {
    align: 'right',
  });
  doc.text(
    `Status Akuntansi: ${summary.balanceSheet.isBalanced ? 'SEIMBANG (BALANCED)' : 'PERLU CEK'}`,
    marginX + 5,
    y + 20.5
  );
  doc.text(`${summary.monthTxCount} Transaksi Tercatat`, pageWidth - marginX - 5, y + 20.5, {
    align: 'right',
  });
  y += 29;

  // --- EXECUTIVE SUMMARY 4-BOX STRIP ---
  const boxGap = 3;
  const boxW = (contentWidth - boxGap * 3) / 4;
  const summaryCards = [
    {
      label: 'TOTAL ASET',
      value: formatRp(summary.balanceSheet.totalAssets),
      color: [15, 23, 42] as [number, number, number],
    },
    {
      label: 'TOTAL KEWAJIBAN',
      value: formatRp(summary.balanceSheet.totalLiabilities),
      color: [190, 18, 60] as [number, number, number],
    },
    {
      label: 'KEKAYAAN BERSIH',
      value: formatRp(summary.balanceSheet.equity),
      color:
        summary.balanceSheet.equity >= 0
          ? ([5, 150, 105] as [number, number, number])
          : ([190, 18, 60] as [number, number, number]),
    },
    {
      label: `SURPLUS (${summary.periodLabel.toUpperCase()})`,
      value: `${summary.netSurplus >= 0 ? '+' : ''}${formatRp(summary.netSurplus)}`,
      color:
        summary.netSurplus >= 0
          ? ([5, 150, 105] as [number, number, number])
          : ([190, 18, 60] as [number, number, number]),
    },
  ];

  summaryCards.forEach((card, idx) => {
    const cx = marginX + idx * (boxW + boxGap);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.roundedRect(cx, y, boxW, 15.5, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(truncateLabel(card.label, 26), cx + 3, y + 5.2);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(card.color[0], card.color[1], card.color[2]);
    doc.text(card.value, cx + 3, y + 11.8);
  });
  y += 20;

  // --- BAGIAN I: RINGKASAN NERACA ---
  drawSectionHeading('BAGIAN I · RINGKASAN NERACA (BALANCE SHEET)', `Posisi ${printDateStr}`);

  // A. Aset
  drawSubGroupHeader('1. ASET / HARTA (ASSETS)');
  drawRow('Kas & Rekening Bank Likuid', formatRp(summary.balanceSheet.liquidAssets), { bold: true });
  summary.liquidAccounts.slice(0, 8).forEach((acc) => {
    drawRow(`${acc.name} (${acc.type})`, formatRp(acc.balance), { indent: true });
  });
  drawRow('Cadangan Dana Darurat Likuid', formatRp(summary.balanceSheet.emergencyAssets), {
    bold: true,
  });
  drawRow('Portofolio Investasi', formatRp(summary.balanceSheet.investmentAssets), { bold: true });
  summary.investmentItems.slice(0, 8).forEach((inv) => {
    drawRow(`${inv.name} (${inv.category})`, formatRp(inv.balance), { indent: true });
  });
  drawRow(
    'Aset Tetap & Ekuitas Properti KPR',
    formatRp(summary.balanceSheet.fixedAssetsValue),
    { bold: true }
  );
  summary.fixedAssetItems.slice(0, 8).forEach((fa) => {
    drawRow(`${fa.name} (${fa.statusLabel})`, formatRp(fa.bookValue), { indent: true });
  });
  drawRow('TOTAL ASET (HARTA)', formatRp(summary.balanceSheet.totalAssets), {
    bold: true,
    fill: [236, 253, 245],
    labelColor: [6, 95, 70],
    amountColor: [6, 95, 70],
  });

  y += 3;

  // B. Kewajiban & Ekuitas
  drawSubGroupHeader('2. KEWAJIBAN & EKUITAS BERSIH (LIABILITIES & EQUITY)');
  drawRow(
    'Tagihan Kartu Kredit & PayLater',
    formatRp(summary.balanceSheet.creditCardPaylaterBills),
    { bold: true }
  );
  summary.creditBillItems.slice(0, 6).forEach((cc) => {
    drawRow(`${cc.name} (${cc.typeLabel})`, formatRp(cc.bill), { indent: true });
  });
  drawRow(
    'Sisa Pinjaman & Utang Aktif (Bank / KPR / Personal)',
    formatRp(summary.balanceSheet.activeDebtsBalance),
    { bold: true }
  );
  summary.debtItems.slice(0, 8).forEach((debt) => {
    drawRow(`${debt.name} (${debt.category})`, formatRp(debt.balance), { indent: true });
  });
  drawRow('TOTAL KEWAJIBAN', formatRp(summary.balanceSheet.totalLiabilities), {
    bold: true,
    fill: [255, 241, 242],
    labelColor: [159, 18, 57],
    amountColor: [159, 18, 57],
  });
  drawRow('EKUITAS BERSIH (NET WORTH = ASET - KEWAJIBAN)', formatRp(summary.balanceSheet.equity), {
    bold: true,
    fill: [239, 246, 255],
    labelColor: [30, 58, 138],
    amountColor: [30, 58, 138],
  });
  drawRow(
    'TOTAL KEWAJIBAN + EKUITAS',
    formatRp(summary.balanceSheet.totalLiabilities + summary.balanceSheet.equity),
    {
      bold: true,
      fill: [241, 245, 249],
    }
  );

  y += 7;

  // --- BAGIAN II: LAPORAN LABA-RUGI BULANAN ---
  drawSectionHeading(
    'BAGIAN II · LAPORAN LABA-RUGI BULANAN (INCOME STATEMENT)',
    `Periode ${summary.periodLabel}`
  );

  // Pendapatan Operasional
  drawSubGroupHeader(`1. PENDAPATAN OPERASIONAL (${summary.periodLabel.toUpperCase()})`);
  if (summary.incomeCategories.length === 0) {
    drawRow('Belum ada transaksi pendapatan operasional pada bulan ini.', formatRp(0), {
      indent: true,
      labelColor: [148, 163, 184],
    });
  } else {
    summary.incomeCategories.forEach((item) => {
      drawRow(item.category, formatRp(item.amount), {
        indent: true,
        amountColor: [5, 150, 105],
      });
    });
  }
  drawRow('TOTAL PENDAPATAN OPERASIONAL', formatRp(summary.totalIncome), {
    bold: true,
    fill: [236, 253, 245],
    labelColor: [6, 95, 70],
    amountColor: [6, 95, 70],
  });

  y += 3;

  // Beban Operasional
  drawSubGroupHeader(`2. BEBAN & PENGELUARAN OPERASIONAL (${summary.periodLabel.toUpperCase()})`);
  if (summary.expenseCategories.length === 0) {
    drawRow('Belum ada transaksi beban operasional pada bulan ini.', formatRp(0), {
      indent: true,
      labelColor: [148, 163, 184],
    });
  } else {
    summary.expenseCategories.forEach((item) => {
      drawRow(item.category, `-${formatRp(item.amount)}`, {
        indent: true,
        amountColor: [190, 18, 60],
      });
    });
  }
  drawRow('TOTAL BEBAN OPERASIONAL', `-${formatRp(summary.totalExpense)}`, {
    bold: true,
    fill: [255, 241, 242],
    labelColor: [159, 18, 57],
    amountColor: [159, 18, 57],
  });

  y += 3;

  // Net Surplus / Deficit & Saving Margin
  const isSurplus = summary.netSurplus >= 0;
  drawRow(
    isSurplus
      ? 'SURPLUS OPERASIONAL BERSIH (LABA BERSIH BULANAN)'
      : 'DEFISIT OPERASIONAL BERSIH (RUGI BULANAN)',
    `${isSurplus ? '+' : ''}${formatRp(summary.netSurplus)}`,
    {
      bold: true,
      fill: isSurplus ? [236, 253, 245] : [255, 241, 242],
      labelColor: isSurplus ? [6, 95, 70] : [159, 18, 57],
      amountColor: isSurplus ? [6, 95, 70] : [159, 18, 57],
    }
  );
  drawRow(
    'Rasio Tabungan Operasional (Net Margin terhadap Pendapatan)',
    `${summary.operatingMarginPct.toFixed(1)}%`,
    {
      bold: true,
      fill: [248, 250, 252],
    }
  );

  // --- FOOTER ACROSS ALL PAGES ---
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.25);
    doc.line(marginX, pageHeight - 13, pageWidth - marginX, pageHeight - 13);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Nusantara Wealth · Ringkasan Neraca & Laba-Rugi ${summary.periodLabel}`,
      marginX,
      pageHeight - 8.5
    );
    doc.text(`Halaman ${p} dari ${totalPages}`, pageWidth - marginX, pageHeight - 8.5, {
      align: 'right',
    });
  }

  const filename = `Laporan_Neraca_LabaRugi_${summary.ymPrefix}.pdf`;
  doc.save(filename);
  return filename;
}

