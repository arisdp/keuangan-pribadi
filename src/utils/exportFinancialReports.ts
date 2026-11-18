import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Transaction, Account, Debt, InvestmentAsset } from '../types';
import { isOperatingIncome, isOperatingExpense } from './accountingEngine';
import { showToast } from './toast';

interface BalanceSheetExportData {
  liquidAssets: number;
  emergencyAssets: number;
  investmentAssets: number;
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
  netInvesting: number;
  savingInflows?: number;
  savingOutflows: number;
  debtPaymentOutflows?: number;
  debtProceedsInflows?: number;
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
  periodTitle: string = 'Periode Berjalan'
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

  downloadBlob(csv, `Laporan_Laba_Rugi_${new Date().toISOString().split('T')[0]}.csv`, 'text/csv;charset=utf-8;');
};

// 2. Export Neraca (Balance Sheet) to CSV
export const exportBalanceSheetToCSV = (
  data: BalanceSheetExportData,
  accounts: Account[],
  debts: Debt[],
  investments: InvestmentAsset[]
) => {
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

  downloadBlob(csv, `Laporan_Neraca_${new Date().toISOString().split('T')[0]}.csv`, 'text/csv;charset=utf-8;');
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

  downloadBlob(csv, `Laporan_Arus_Kas_${new Date().toISOString().split('T')[0]}.csv`, 'text/csv;charset=utf-8;');
};

// 4. Export Budget vs Realization to CSV
export const exportBudgetRealizationToCSV = (items: BudgetRealizationExportData[]) => {
  let csv = `ANALISIS BUDGET VS REALISASI - NUSANTARA WEALTH\n`;
  csv += `Tanggal Diterbitkan,${new Date().toLocaleDateString('id-ID')}\n\n`;
  csv += `KATEGORI,BATAS BUDGET (IDR),REALISASI (IDR),SELISIH (IDR),PERSENTASE (%),STATUS\n`;

  items.forEach((item) => {
    csv += `"${item.category}",${item.limit},${item.actual},${item.variance},${item.usagePercent.toFixed(1)}%,"${item.status}"\n`;
  });

  downloadBlob(csv, `Analisis_Budget_vs_Realisasi_${new Date().toISOString().split('T')[0]}.csv`, 'text/csv;charset=utf-8;');
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

    pdf.save(`${reportTitle.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
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
