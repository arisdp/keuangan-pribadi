import { InvestmentAsset } from '../types';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const formatterIDR = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  minimumFractionDigits: 0,
});

/**
 * Export Investments to CSV File
 */
export const exportInvestmentsToCSV = (investments: InvestmentAsset[]) => {
  const headers = [
    'Nama Aset',
    'Kategori',
    'Kuantitas',
    'Satuan',
    'Harga Beli Rata-Rata (Rp)',
    'Harga Unit Saat Ini (Rp)',
    'Total Modal (Rp)',
    'Valuasi Portofolio (Rp)',
    'Unrealized Gain/Loss (Rp)',
    'Return (%)',
    'Tanggal Ditambahkan',
  ];

  const rows = investments.map((inv) => {
    const qty = inv.quantity ?? inv.units ?? 1;
    const initialCap = inv.initialCapital !== undefined ? inv.initialCapital : inv.balance;
    const avgBuyPrice = inv.purchaseUnitPrice || (initialCap / qty);
    const currPrice = inv.unitPrice ?? inv.currentUnitPrice ?? (inv.balance / qty);
    const gain = inv.balance - initialCap;
    const growthPct = initialCap > 0 ? (gain / initialCap) * 100 : 0;

    return [
      `"${inv.name.replace(/"/g, '""')}"`,
      `"${inv.category.replace(/"/g, '""')}"`,
      qty,
      `"${inv.unitName || 'Unit'}"`,
      Math.round(avgBuyPrice),
      Math.round(currPrice),
      Math.round(initialCap),
      Math.round(inv.balance),
      Math.round(gain),
      growthPct.toFixed(2),
      inv.dateAdded || '-',
    ].join(',');
  });

  const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const today = new Date().toISOString().split('T')[0];

  link.setAttribute('href', url);
  link.setAttribute('download', `Portofolio_Investasi_Nusantara_${today}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/**
 * Export Investment Portfolio to PDF
 */
export const exportInvestmentsToPDF = async (
  investments: InvestmentAsset[],
  elementIdToCapture?: string
) => {
  const today = new Date().toLocaleDateString('id-ID', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  if (elementIdToCapture) {
    const targetEl = document.getElementById(elementIdToCapture);
    if (targetEl) {
      try {
        const canvas = await html2canvas(targetEl, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
        });

        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4');
        const imgWidth = 210; // A4 width in mm
        const pageHeight = 297; // A4 height in mm
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        let heightLeft = imgHeight;
        let position = 0;

        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;

        while (heightLeft >= 0) {
          position = heightLeft - imgHeight;
          pdf.addPage();
          pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
          heightLeft -= pageHeight;
        }

        pdf.save(`Laporan_Portofolio_Investasi_${new Date().toISOString().split('T')[0]}.pdf`);
        return;
      } catch (err) {
        console.error('Failed to capture PDF canvas, fallback to generated PDF:', err);
      }
    }
  }

  // Fallback programmatic jsPDF document creation
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  let y = 15;

  // Title & Header
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, 210, 25, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Nusantara Wealth - Laporan Portofolio Investasi', 14, 12);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Dicetak pada: ${today}`, 14, 18);

  y = 35;

  // Totals Summary
  const totalValuation = investments.reduce((sum, inv) => sum + inv.balance, 0);
  const totalCapital = investments.reduce(
    (sum, inv) => sum + (inv.initialCapital !== undefined ? inv.initialCapital : inv.balance),
    0
  );
  const totalGain = totalValuation - totalCapital;
  const growthPct = totalCapital > 0 ? (totalGain / totalCapital) * 100 : 0;

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, y, 182, 26, 3, 3, 'FD');

  doc.setTextColor(51, 65, 85);
  doc.setFontSize(9);
  doc.text('TOTAL VALUASI PORTOFOLIO', 20, y + 8);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(2, 132, 199);
  doc.text(formatterIDR.format(totalValuation), 20, y + 16);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  doc.text('TOTAL MODAL BERDASARKAN HASIL DCA', 80, y + 8);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text(formatterIDR.format(totalCapital), 80, y + 16);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  doc.text('ESTIMASI UNREALIZED GAIN/LOSS', 145, y + 8);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  if (totalGain >= 0) {
    doc.setTextColor(16, 185, 129);
  } else {
    doc.setTextColor(225, 29, 72);
  }
  doc.text(`${totalGain >= 0 ? '+' : ''}${formatterIDR.format(totalGain)} (${growthPct.toFixed(2)}%)`, 145, y + 16);

  y += 35;

  // Table Title
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Daftar Rincian Aset Investasi', 14, y);
  y += 6;

  // Table Headers
  doc.setFillColor(226, 232, 240);
  doc.rect(14, y, 182, 8, 'F');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text('NAMA ASET', 16, y + 5.5);
  doc.text('KATEGORI', 60, y + 5.5);
  doc.text('KUANTITAS', 95, y + 5.5);
  doc.text('HARGA BELI AVG', 120, y + 5.5);
  doc.text('HARGA SAAT INI', 150, y + 5.5);
  doc.text('VALUASI (RP)', 175, y + 5.5);

  y += 10;
  doc.setFont('helvetica', 'normal');

  investments.forEach((inv, index) => {
    if (y > 270) {
      doc.addPage();
      y = 20;
    }

    const qty = inv.quantity ?? inv.units ?? 1;
    const initialCap = inv.initialCapital !== undefined ? inv.initialCapital : inv.balance;
    const avgBuyPrice = inv.purchaseUnitPrice || (initialCap / qty);
    const currPrice = inv.unitPrice ?? inv.currentUnitPrice ?? (inv.balance / qty);

    if (index % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(14, y - 4, 182, 8, 'F');
    }

    doc.setTextColor(15, 23, 42);
    doc.text(inv.name.substring(0, 22), 16, y);
    doc.setTextColor(71, 85, 105);
    doc.text(inv.category.substring(0, 18), 60, y);
    doc.text(`${qty} ${inv.unitName || 'Unit'}`, 95, y);
    doc.text(formatterIDR.format(avgBuyPrice), 120, y);
    doc.text(formatterIDR.format(currPrice), 150, y);
    doc.setFont('helvetica', 'bold');
    doc.text(formatterIDR.format(inv.balance), 175, y);
    doc.setFont('helvetica', 'normal');

    y += 8;
  });

  doc.save(`Laporan_Portofolio_Investasi_${new Date().toISOString().split('T')[0]}.pdf`);
};
