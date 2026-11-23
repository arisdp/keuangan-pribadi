import React, { useState, useMemo } from 'react';
import { Transaction } from '../types';
import { isOperatingIncome, parseLocalDate } from '../utils/accountingEngine';
import { formatterIDR } from '../utils/formatters';
import { CalculatorIcon, FileText, Info } from 'lucide-react';

interface TaxCalculatorCardProps {
  transactions: Transaction[];
  className?: string;
}

export type TaxProfileType = 'karyawan' | 'umkm' | 'freelance';

export interface PTKPOption {
  code: string;
  label: string;
  value: number;
}

export const PTKP_LIST: PTKPOption[] = [
  { code: 'TK/0', label: 'TK/0 - Tidak Kawin, 0 Tanggungan (Rp 54 Juta)', value: 54000000 },
  { code: 'TK/1', label: 'TK/1 - Tidak Kawin, 1 Tanggungan (Rp 58,5 Juta)', value: 58500000 },
  { code: 'TK/2', label: 'TK/2 - Tidak Kawin, 2 Tanggungan (Rp 63 Juta)', value: 63000000 },
  { code: 'TK/3', label: 'TK/3 - Tidak Kawin, 3 Tanggungan (Rp 67,5 Juta)', value: 67500000 },
  { code: 'K/0', label: 'K/0 - Kawin, 0 Tanggungan (Rp 58,5 Juta)', value: 58500000 },
  { code: 'K/1', label: 'K/1 - Kawin, 1 Tanggungan (Rp 63 Juta)', value: 63000000 },
  { code: 'K/2', label: 'K/2 - Kawin, 2 Tanggungan (Rp 67,5 Juta)', value: 67500000 },
  { code: 'K/3', label: 'K/3 - Kawin, 3 Tanggungan (Rp 72 Juta)', value: 72000000 },
];

export const TaxCalculatorCard: React.FC<TaxCalculatorCardProps> = ({
  transactions,
  className = '',
}) => {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [taxProfile, setTaxProfile] = useState<TaxProfileType>('karyawan');
  const [ptkpCode, setPtkpCode] = useState<string>('TK/0');
  const [manualGrossIncomeOverride, setManualGrossIncomeOverride] = useState<string>('');
  const [additionalDeductions, setAdditionalDeductions] = useState<string>('0');

  // Available income years from transactions
  const availableYears = useMemo(() => {
    const years = new Set<number>([currentYear]);
    transactions.forEach((tx) => {
      if (tx.date) {
        const y = parseLocalDate(tx.date)?.getFullYear();
        if (y !== undefined && !isNaN(y)) years.add(y);
      }
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [transactions, currentYear]);

  // Total recorded operating income for the selected year (excluding loans, transfers, asset swaps)
  const recordedAnnualIncome = useMemo(() => {
    return transactions
      .filter((t) => {
        if (!isOperatingIncome(t)) return false;
        if (!t.date) return true;
        const y = parseLocalDate(t.date)?.getFullYear();
        return y === selectedYear;
      })
      .reduce((sum, t) => sum + t.amount, 0);
  }, [transactions, selectedYear]);

  // Actual Gross Annual Income used in calculation
  const grossAnnualIncome = useMemo(() => {
    if (manualGrossIncomeOverride !== '' && !isNaN(parseFloat(manualGrossIncomeOverride))) {
      return Math.max(0, parseFloat(manualGrossIncomeOverride));
    }
    return recordedAnnualIncome;
  }, [recordedAnnualIncome, manualGrossIncomeOverride]);

  const ptkpValue = useMemo(() => {
    const found = PTKP_LIST.find((p) => p.code === ptkpCode);
    return found ? found.value : 54000000;
  }, [ptkpCode]);

  const extraDeductionValue = useMemo(() => {
    const val = parseFloat(additionalDeductions);
    return isNaN(val) ? 0 : Math.max(0, val);
  }, [additionalDeductions]);

  // Tax Calculations according to Indonesian UU HPP & PP 55/2022
  const taxCalculation = useMemo(() => {
    let jabatanDeduction = 0;
    let netAnnualIncome = 0;
    let pkp = 0;
    let totalTaxAnnual = 0;
    const layerBreakdown: { label: string; rate: string; taxableAmount: number; taxAmount: number }[] = [];

    if (taxProfile === 'karyawan') {
      // Biaya Jabatan 5% max Rp 6.000.000/tahun
      jabatanDeduction = Math.min(grossAnnualIncome * 0.05, 6000000);
      netAnnualIncome = Math.max(0, grossAnnualIncome - jabatanDeduction - extraDeductionValue);
      pkp = Math.max(0, netAnnualIncome - ptkpValue);

      // UU HPP Progressive Rates
      let remainingPKP = pkp;

      // Layer 1: 0 - 60jt (5%)
      if (remainingPKP > 0) {
        const amountInLayer = Math.min(remainingPKP, 60000000);
        const tax = amountInLayer * 0.05;
        layerBreakdown.push({ label: 'Lapisan 1 (s.d. Rp 60 Juta)', rate: '5%', taxableAmount: amountInLayer, taxAmount: tax });
        totalTaxAnnual += tax;
        remainingPKP -= amountInLayer;
      }

      // Layer 2: 60jt - 250jt (15%)
      if (remainingPKP > 0) {
        const amountInLayer = Math.min(remainingPKP, 190000000); // 250m - 60m
        const tax = amountInLayer * 0.15;
        layerBreakdown.push({ label: 'Lapisan 2 (> Rp 60 - 250 Juta)', rate: '15%', taxableAmount: amountInLayer, taxAmount: tax });
        totalTaxAnnual += tax;
        remainingPKP -= amountInLayer;
      }

      // Layer 3: 250jt - 500jt (25%)
      if (remainingPKP > 0) {
        const amountInLayer = Math.min(remainingPKP, 250000000); // 500m - 250m
        const tax = amountInLayer * 0.25;
        layerBreakdown.push({ label: 'Lapisan 3 (> Rp 250 - 500 Juta)', rate: '25%', taxableAmount: amountInLayer, taxAmount: tax });
        totalTaxAnnual += tax;
        remainingPKP -= amountInLayer;
      }

      // Layer 4: 500jt - 5M (30%)
      if (remainingPKP > 0) {
        const amountInLayer = Math.min(remainingPKP, 4500000000); // 5B - 500m
        const tax = amountInLayer * 0.30;
        layerBreakdown.push({ label: 'Lapisan 4 (> Rp 500 Juta - 5 Miliar)', rate: '30%', taxableAmount: amountInLayer, taxAmount: tax });
        totalTaxAnnual += tax;
        remainingPKP -= amountInLayer;
      }

      // Layer 5: > 5M (35%)
      if (remainingPKP > 0) {
        const tax = remainingPKP * 0.35;
        layerBreakdown.push({ label: 'Lapisan 5 (> Rp 5 Miliar)', rate: '35%', taxableAmount: remainingPKP, taxAmount: tax });
        totalTaxAnnual += tax;
      }

    } else if (taxProfile === 'umkm') {
      // PP 55/2022: PPh Final 0.5% dengan ambang batas omzet Rp 500 Juta BEBAS PAJAK untuk Orang Pribadi
      const taxExemptThreshold = 500000000;
      const taxableTurnover = Math.max(0, grossAnnualIncome - taxExemptThreshold);
      totalTaxAnnual = taxableTurnover * 0.005;

      jabatanDeduction = 0;
      netAnnualIncome = grossAnnualIncome;
      pkp = taxableTurnover;

      layerBreakdown.push({
        label: 'Omzet s.d. Rp 500 Juta',
        rate: '0% (Bebas Pajak)',
        taxableAmount: Math.min(grossAnnualIncome, taxExemptThreshold),
        taxAmount: 0,
      });

      if (taxableTurnover > 0) {
        layerBreakdown.push({
          label: 'Omzet > Rp 500 Juta',
          rate: '0.5% PPh Final',
          taxableAmount: taxableTurnover,
          taxAmount: totalTaxAnnual,
        });
      }

    } else if (taxProfile === 'freelance') {
      // Pekerja Bebas (NPPN Norma 50%)
      const normaRate = 0.50; // 50%
      netAnnualIncome = Math.max(0, grossAnnualIncome * normaRate - extraDeductionValue);
      pkp = Math.max(0, netAnnualIncome - ptkpValue);
      jabatanDeduction = grossAnnualIncome * (1 - normaRate);

      let remainingPKP = pkp;

      if (remainingPKP > 0) {
        const amountInLayer = Math.min(remainingPKP, 60000000);
        const tax = amountInLayer * 0.05;
        layerBreakdown.push({ label: 'Lapisan 1 (s.d. Rp 60 Juta)', rate: '5%', taxableAmount: amountInLayer, taxAmount: tax });
        totalTaxAnnual += tax;
        remainingPKP -= amountInLayer;
      }

      if (remainingPKP > 0) {
        const amountInLayer = Math.min(remainingPKP, 190000000);
        const tax = amountInLayer * 0.15;
        layerBreakdown.push({ label: 'Lapisan 2 (> Rp 60 - 250 Juta)', rate: '15%', taxableAmount: amountInLayer, taxAmount: tax });
        totalTaxAnnual += tax;
        remainingPKP -= amountInLayer;
      }

      if (remainingPKP > 0) {
        const amountInLayer = Math.min(remainingPKP, 250000000);
        const tax = amountInLayer * 0.25;
        layerBreakdown.push({ label: 'Lapisan 3 (> Rp 250 - 500 Juta)', rate: '25%', taxableAmount: amountInLayer, taxAmount: tax });
        totalTaxAnnual += tax;
        remainingPKP -= amountInLayer;
      }

      if (remainingPKP > 0) {
        const amountInLayer = Math.min(remainingPKP, 4500000000); // 5B - 500m
        const tax = amountInLayer * 0.30;
        layerBreakdown.push({ label: 'Lapisan 4 (> Rp 500 Juta - 5 Miliar)', rate: '30%', taxableAmount: amountInLayer, taxAmount: tax });
        totalTaxAnnual += tax;
        remainingPKP -= amountInLayer;
      }

      if (remainingPKP > 0) {
        const tax = remainingPKP * 0.35;
        layerBreakdown.push({ label: 'Lapisan 5 (> Rp 5 Miliar)', rate: '35%', taxableAmount: remainingPKP, taxAmount: tax });
        totalTaxAnnual += tax;
      }
    }

    const effectiveTaxRate = grossAnnualIncome > 0 ? (totalTaxAnnual / grossAnnualIncome) * 100 : 0;
    const monthlyTaxEstimate = totalTaxAnnual / 12;

    return {
      jabatanDeduction,
      netAnnualIncome,
      pkp,
      totalTaxAnnual,
      monthlyTaxEstimate,
      effectiveTaxRate,
      layerBreakdown,
    };
  }, [grossAnnualIncome, taxProfile, ptkpValue, extraDeductionValue]);

  return (
    <div className={`bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl border border-blue-100">
            <CalculatorIcon className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-extrabold text-slate-800 text-sm sm:text-base uppercase tracking-wide">
                Kalkulator Estimasi Pajak Tahunan (PPh 21 / PPh OP)
              </h3>
              <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded font-black text-[10px] uppercase">
                UU HPP 2026
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium">
              Simulasi otomatis besaran PPh Pasal 21 & PPh Final berdasarkan histori pemasukan pencatatan Anda.
            </p>
          </div>
        </div>

        {/* Year Selector */}
        <div className="flex items-center gap-2 shrink-0">
          <label className="text-xs font-bold text-slate-500 uppercase">Tahun Pajak:</label>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {availableYears.map((yr) => (
              <option key={yr} value={yr}>
                Tahun {yr}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Input Configuration Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* 1. Profile Wajib Pajak */}
        <div className="space-y-1.5">
          <label className="block text-xs font-extrabold text-slate-600 uppercase tracking-wider">
            1. Profil Wajib Pajak
          </label>
          <select
            value={taxProfile}
            onChange={(e) => setTaxProfile(e.target.value as TaxProfileType)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="karyawan">Karyawan / Pegawai Swasta (PPh 21 Tarif Progresif)</option>
            <option value="umkm">UMKM / Usaha Sendiri (PPh Final PP 55 0.5%)</option>
            <option value="freelance">Pekerja Bebas / Freelance (NPPN Norma 50%)</option>
          </select>
          <p className="text-[10px] text-slate-400">
            {taxProfile === 'karyawan' && 'Biaya jabatan 5% (maks Rp 6 Juta/th) & PTKP resmi.'}
            {taxProfile === 'umkm' && 'Omzet s.d. Rp 500 Juta BEBAS pajak, sisanya 0.5% PPh Final.'}
            {taxProfile === 'freelance' && 'Norma penghitungan 50% bruto sebelum dikurangi PTKP.'}
          </p>
        </div>

        {/* 2. Total Pendapatan Bruto Tahunan */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <label className="block text-xs font-extrabold text-slate-600 uppercase tracking-wider">
              2. Total Pendapatan Bruto ({selectedYear})
            </label>
            {manualGrossIncomeOverride !== '' && (
              <button
                type="button"
                onClick={() => setManualGrossIncomeOverride('')}
                className="text-[10px] font-bold text-blue-600 hover:underline"
              >
                Reset ke Otomatis
              </button>
            )}
          </div>
          <div className="relative">
            <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">Rp</span>
            <input
              type="number"
              value={manualGrossIncomeOverride !== '' ? manualGrossIncomeOverride : recordedAnnualIncome}
              onChange={(e) => setManualGrossIncomeOverride(e.target.value)}
              placeholder="0"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            />
          </div>
          <p className="text-[10px] text-emerald-600 font-medium">
            💡 Terdeteksi otomatis dari histori pemasukan: <span className="font-bold">{formatterIDR.format(recordedAnnualIncome)}</span>
          </p>
        </div>

        {/* 3. Status PTKP */}
        <div className="space-y-1.5">
          <label className="block text-xs font-extrabold text-slate-600 uppercase tracking-wider">
            3. Status PTKP (Batas Bebas Pajak)
          </label>
          <select
            value={ptkpCode}
            disabled={taxProfile === 'umkm'}
            onChange={(e) => setPtkpCode(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {PTKP_LIST.map((opt) => (
              <option key={opt.code} value={opt.code}>
                {opt.label}
              </option>
            ))}
          </select>
          <p className="text-[10px] text-slate-400">
            {taxProfile === 'umkm' ? 'Status PTKP digantikan ambang omzet Rp 500 Juta PP 55/2022.' : `Nilai PTKP: ${formatterIDR.format(ptkpValue)} / tahun`}
          </p>
        </div>
      </div>

      {/* Primary Result Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Card 1: Estimasi Pajak Tahunan */}
        <div className="p-4 bg-gradient-to-br from-slate-900 to-blue-950 text-white rounded-xl space-y-1 shadow-md">
          <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-300">
            Estimasi Pajak Tahunan (Terutang)
          </span>
          <p className="text-xl font-black font-mono text-emerald-400">
            {formatterIDR.format(taxCalculation.totalTaxAnnual)}
          </p>
          <p className="text-[10px] text-slate-300 font-medium">
            Tarif Efektif: <span className="font-bold text-white">{taxCalculation.effectiveTaxRate.toFixed(2)}%</span>
          </p>
        </div>

        {/* Card 2: Potongan Bulanan */}
        <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl space-y-1">
          <span className="text-[10px] uppercase tracking-wider font-extrabold text-blue-700">
            Estimasi Setoran / Potongan Bulanan
          </span>
          <p className="text-xl font-black font-mono text-blue-900">
            {formatterIDR.format(taxCalculation.monthlyTaxEstimate)}
          </p>
          <p className="text-[10px] text-blue-600 font-medium">
            Rata-rata kewajiban per bulan
          </p>
        </div>

        {/* Card 3: Penghasilan Kena Pajak (PKP) */}
        <div className="p-4 bg-amber-50/70 border border-amber-100 rounded-xl space-y-1">
          <span className="text-[10px] uppercase tracking-wider font-extrabold text-amber-800">
            Penghasilan Kena Pajak (PKP)
          </span>
          <p className="text-xl font-black font-mono text-amber-900">
            {formatterIDR.format(taxCalculation.pkp)}
          </p>
          <p className="text-[10px] text-amber-700 font-medium">
            Dasar pengenaan tarif progresif
          </p>
        </div>

        {/* Card 4: Pengurangan / PTKP */}
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
          <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-600">
            {taxProfile === 'umkm' ? 'Ambang Bebas Pajak' : 'Total Pengurangan (PTKP + Jabatan)'}
          </span>
          <p className="text-xl font-black font-mono text-slate-800">
            {taxProfile === 'umkm'
              ? formatterIDR.format(500000000)
              : formatterIDR.format(ptkpValue + taxCalculation.jabatanDeduction)}
          </p>
          <p className="text-[10px] text-slate-500 font-medium">
            Penghasilan bebas potongan pajak
          </p>
        </div>
      </div>

      {/* Detailed Layer Breakdown Table */}
      <div className="space-y-3 bg-slate-50/70 p-4 rounded-xl border border-slate-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-slate-600" />
            <h4 className="text-xs font-extrabold uppercase text-slate-800 tracking-wider">
              Rincian Perhitungan Lapisan Tarif (UU HPP / PP 55)
            </h4>
          </div>
          <span className="text-[11px] font-bold text-slate-500">
            Metode: {taxProfile === 'karyawan' ? 'PPh 21 Progresif' : taxProfile === 'umkm' ? 'PPh Final 0.5%' : 'NPPN Norma 50%'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 uppercase text-[10px] font-bold">
                <th className="py-2 px-3">Lapisan Penghasilan</th>
                <th className="py-2 px-3 text-center">Tarif Pajak</th>
                <th className="py-2 px-3 text-right">Nominal Kena Pajak</th>
                <th className="py-2 px-3 text-right">Estimasi Pajak Terutang</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/80 font-medium">
              {taxCalculation.layerBreakdown.map((layer, idx) => (
                <tr key={idx} className="hover:bg-slate-100/60 transition">
                  <td className="py-2.5 px-3 font-bold text-slate-800">{layer.label}</td>
                  <td className="py-2.5 px-3 text-center font-bold text-blue-700">{layer.rate}</td>
                  <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                    {formatterIDR.format(layer.taxableAmount)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700">
                    {formatterIDR.format(layer.taxAmount)}
                  </td>
                </tr>
              ))}
              <tr className="bg-white font-bold text-slate-900 border-t-2 border-slate-300">
                <td className="py-2.5 px-3 uppercase text-[11px]" colSpan={2}>
                  Total Kewajiban Pajak Tahunan
                </td>
                <td className="py-2.5 px-3 text-right font-mono text-slate-500">
                  {formatterIDR.format(grossAnnualIncome)}
                </td>
                <td className="py-2.5 px-3 text-right font-mono font-black text-emerald-600 text-sm">
                  {formatterIDR.format(taxCalculation.totalTaxAnnual)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Tax Planning Tips */}
        <div className="mt-3 p-3 bg-blue-50/80 border border-blue-200 rounded-xl text-[11px] text-blue-900 space-y-1">
          <div className="flex items-center gap-1.5 font-extrabold uppercase tracking-wider text-blue-800 text-[10px]">
            <Info className="h-3.5 w-3.5 text-blue-600 shrink-0" />
            Catatan Penting Pelaporan SPT Tahunan:
          </div>
          <p className="leading-relaxed text-blue-900/90 font-medium">
            Batas akhir pelaporan SPT Tahunan PPh Orang Pribadi adalah <span className="font-extrabold">31 Maret</span> setiap tahunnya. Pastikan menyimpan bukti potong (Form 1721-A1 untuk karyawan atau rekapitulasi omzet untuk UMKM) untuk melengkapi pelaporan secara online melalui situs DJP Online.
          </p>
        </div>
      </div>
    </div>
  );
};
