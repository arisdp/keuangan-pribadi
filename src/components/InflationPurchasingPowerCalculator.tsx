import React, { useState, useMemo } from 'react';
import { InvestmentAsset } from '../types';
import { FormattedNumberInput } from './FormattedNumberInput';
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import {
  Calculator,
  TrendingUp,
  Percent,
  Calendar,
  DollarSign,
  ShieldAlert,
  Info,
  Sparkles,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle2,
  Table,
  Coins
} from 'lucide-react';

interface InflationPurchasingPowerCalculatorProps {
  investments?: InvestmentAsset[];
}

export const InflationPurchasingPowerCalculator: React.FC<InflationPurchasingPowerCalculatorProps> = ({
  investments = [],
}) => {
  const formatterIDR = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  });

  // Calculate default initial portfolio from active investments
  const totalCurrentPortfolio = useMemo(() => {
    return investments.reduce((sum, inv) => sum + inv.balance, 0);
  }, [investments]);

  // States
  const [initialCapital, setInitialCapital] = useState<number>(
    totalCurrentPortfolio > 0 ? totalCurrentPortfolio : 50000000
  );
  const [monthlyTopUp, setMonthlyTopUp] = useState<number>(1000000);
  const [annualInflationRate, setAnnualInflationRate] = useState<number>(4.5); // 4.5% default IDR inflation
  const [annualReturnRate, setAnnualReturnRate] = useState<number>(10.0); // 10.0% expected investment return
  const [timeHorizonYears, setTimeHorizonYears] = useState<number>(10); // 10 years horizon

  const [showTableBreakdown, setShowTableBreakdown] = useState<boolean>(false);

  // Sync initial capital with investments if user clicks reset
  const handleSyncFromPortfolio = () => {
    if (totalCurrentPortfolio > 0) {
      setInitialCapital(totalCurrentPortfolio);
    }
  };

  // Calculations
  const calculationResults = useMemo(() => {
    const infDecimal = annualInflationRate / 100;
    const retDecimal = annualReturnRate / 100;

    const yearlyData = [];
    let currentNominal = initialCapital;
    let totalDeposited = initialCapital;

    for (let yr = 1; yr <= timeHorizonYears; yr++) {
      const annualTopUp = monthlyTopUp * 12;
      totalDeposited += annualTopUp;

      // Compound growth for capital & topup
      currentNominal = (currentNominal + annualTopUp) * (1 + retDecimal);

      // Real Purchasing Power = Nominal / (1 + inflation)^yr
      const realPurchasingPower = currentNominal / Math.pow(1 + infDecimal, yr);

      // Cash if saved without return
      const cashNominal = totalDeposited;
      const cashRealPurchasingPower = cashNominal / Math.pow(1 + infDecimal, yr);

      yearlyData.push({
        year: `Thn ${yr}`,
        yearNum: yr,
        totalDeposited,
        nominalValue: Math.round(currentNominal),
        realPurchasingPower: Math.round(realPurchasingPower),
        cashNominal,
        cashRealPurchasingPower: Math.round(cashRealPurchasingPower),
        inflationImpactLoss: Math.round(currentNominal - realPurchasingPower),
      });
    }

    const finalData = yearlyData[yearlyData.length - 1] || {
      nominalValue: initialCapital,
      realPurchasingPower: initialCapital,
      totalDeposited: initialCapital,
      cashRealPurchasingPower: initialCapital,
      inflationImpactLoss: 0,
    };

    // Net Real Return Rate = ((1 + return) / (1 + inflation)) - 1
    const netRealReturnRate = ((1 + retDecimal) / (1 + infDecimal) - 1) * 100;

    return {
      yearlyData,
      finalNominal: finalData.nominalValue,
      finalRealPower: finalData.realPurchasingPower,
      finalDeposited: finalData.totalDeposited,
      finalCashRealPower: finalData.cashRealPurchasingPower,
      inflationImpactLoss: finalData.inflationImpactLoss,
      netRealReturnRate,
    };
  }, [initialCapital, monthlyTopUp, annualInflationRate, annualReturnRate, timeHorizonYears]);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-6">
      
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-tr from-emerald-600 to-teal-600 text-white rounded-xl shadow-md">
            <Calculator className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base sm:text-lg font-black text-slate-800 dark:text-slate-100 uppercase tracking-tight">
                Kalkulator Inflasi & Daya Beli Masa Depan
              </h3>
              <span className="px-2.5 py-0.5 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-extrabold text-[10px] rounded-full uppercase">
                Proyeksi Nilai Riil
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Simulasikan daya beli aset portofolio Anda di masa depan setelah diperhitungkan dampak laju inflasi.
            </p>
          </div>
        </div>

        {totalCurrentPortfolio > 0 && (
          <button
            onClick={handleSyncFromPortfolio}
            className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/50 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-extrabold text-xs rounded-xl border border-blue-200 dark:border-blue-800 transition flex items-center gap-1.5 cursor-pointer"
          >
            <Coins className="h-3.5 w-3.5" />
            Gunakan Valuasi Portofolio Saat Ini ({formatterIDR.format(totalCurrentPortfolio)})
          </button>
        )}
      </div>

      {/* Input Parameters Form Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 p-5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200/80 dark:border-slate-700/80">
        
        {/* Input 1: Initial Capital */}
        <div className="space-y-1">
          <label className="block text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Modal Awal / Valuasi (Rp)
          </label>
          <FormattedNumberInput
            value={initialCapital}
            onChange={(val) => setInitialCapital(typeof val === 'number' ? val : parseFloat(val) || 0)}
            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        {/* Input 2: Monthly Contribution */}
        <div className="space-y-1">
          <label className="block text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Top Up Bulanan (Rp)
          </label>
          <FormattedNumberInput
            value={monthlyTopUp}
            onChange={(val) => setMonthlyTopUp(typeof val === 'number' ? val : parseFloat(val) || 0)}
            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        {/* Input 3: Inflation Rate */}
        <div className="space-y-1">
          <div className="flex justify-between items-center text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            <span>Estimasi Inflasi Tahunan</span>
            <span className="text-amber-600 font-mono font-black">{annualInflationRate.toFixed(1)}%</span>
          </div>
          <input
            type="range"
            min={1}
            max={15}
            step={0.5}
            value={annualInflationRate}
            onChange={(e) => setAnnualInflationRate(Number(e.target.value))}
            className="w-full accent-amber-500 cursor-pointer"
          />
          <p className="text-[9px] text-slate-400">Rata-rata inflasi Indonesia ~3.5% - 5.0%</p>
        </div>

        {/* Input 4: Investment Return Rate */}
        <div className="space-y-1">
          <div className="flex justify-between items-center text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            <span>Return Investasi Tahunan</span>
            <span className="text-blue-600 font-mono font-black">{annualReturnRate.toFixed(1)}%</span>
          </div>
          <input
            type="range"
            min={1}
            max={25}
            step={0.5}
            value={annualReturnRate}
            onChange={(e) => setAnnualReturnRate(Number(e.target.value))}
            className="w-full accent-blue-600 cursor-pointer"
          />
          <p className="text-[9px] text-slate-400">Emas ~8-12%, Saham/Reksadana ~10-15%</p>
        </div>

        {/* Input 5: Time Horizon */}
        <div className="space-y-1">
          <div className="flex justify-between items-center text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            <span>Jangka Waktu</span>
            <span className="text-indigo-600 font-mono font-black">{timeHorizonYears} Tahun</span>
          </div>
          <input
            type="range"
            min={1}
            max={30}
            step={1}
            value={timeHorizonYears}
            onChange={(e) => setTimeHorizonYears(Number(e.target.value))}
            className="w-full accent-indigo-600 cursor-pointer"
          />
          <p className="text-[9px] text-slate-400">Target jangka waktu proyeksi</p>
        </div>

      </div>

      {/* Output KPI Scorecards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* KPI 1: Nominal Future Value */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700 space-y-1">
          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
            Nilai Nominal ({timeHorizonYears} Thn Mendatang)
          </span>
          <span className="text-lg sm:text-xl font-black text-slate-800 dark:text-slate-100 font-mono block">
            {formatterIDR.format(calculationResults.finalNominal)}
          </span>
          <p className="text-[10px] text-slate-500 font-medium">
            Total disetor: <strong className="font-mono text-slate-700 dark:text-slate-300">{formatterIDR.format(calculationResults.finalDeposited)}</strong>
          </p>
        </div>

        {/* KPI 2: Real Purchasing Power Value */}
        <div className="p-4 bg-emerald-50/60 dark:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-800 space-y-1">
          <span className="text-[10px] font-extrabold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider block">
            Daya Beli Riil (Dalam Rp Hari Ini)
          </span>
          <span className="text-lg sm:text-xl font-black text-emerald-600 dark:text-emerald-400 font-mono block">
            {formatterIDR.format(calculationResults.finalRealPower)}
          </span>
          <p className="text-[10px] text-emerald-700 dark:text-emerald-400 font-medium">
            Setara dengan nilai belanja barang/jasa hari ini
          </p>
        </div>

        {/* KPI 3: Cash without investment degradation */}
        <div className="p-4 bg-rose-50/60 dark:bg-rose-950/30 rounded-xl border border-rose-200 dark:border-rose-800 space-y-1">
          <span className="text-[10px] font-extrabold text-rose-800 dark:text-rose-300 uppercase tracking-wider block">
            Daya Beli Jika Tanpa Investasi (Kas)
          </span>
          <span className="text-lg sm:text-xl font-black text-rose-600 dark:text-rose-400 font-mono block">
            {formatterIDR.format(calculationResults.finalCashRealPower)}
          </span>
          <p className="text-[10px] text-rose-700 dark:text-rose-400 font-medium">
            Penyusutan daya beli akibat inflasi tanpa imbal hasil
          </p>
        </div>

        {/* KPI 4: Net Real Return */}
        <div className="p-4 bg-blue-50/60 dark:bg-blue-950/30 rounded-xl border border-blue-200 dark:border-blue-800 space-y-1">
          <span className="text-[10px] font-extrabold text-blue-800 dark:text-blue-300 uppercase tracking-wider block">
            Net Real Return (Atas Inflasi)
          </span>
          <span className="text-lg sm:text-xl font-black text-blue-600 dark:text-blue-400 font-mono block">
            +{calculationResults.netRealReturnRate.toFixed(2)}% / Thn
          </span>
          <p className="text-[10px] text-blue-700 dark:text-blue-400 font-medium">
            Keuntungan bersih setelah dikurangi inflasi ({annualReturnRate}% - {annualInflationRate}%)
          </p>
        </div>

      </div>

      {/* Projection Chart */}
      <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-extrabold text-xs sm:text-sm text-slate-800 dark:text-slate-100 uppercase tracking-wider flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-600" />
            Grafik Proyeksi Pertumbuhan Nominal vs Daya Beli Riil ({timeHorizonYears} Tahun)
          </h4>

          <button
            onClick={() => setShowTableBreakdown(!showTableBreakdown)}
            className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
          >
            <Table className="h-3.5 w-3.5" />
            {showTableBreakdown ? 'Sembunyikan Tabel' : 'Tampilkan Tabel Rincian'}
          </button>
        </div>

        <div className="h-72 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={calculationResults.yearlyData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="nominalGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="realGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="year" tick={{ fontSize: 10 }} />
              <YAxis
                tick={{ fontSize: 10 }}
                tickFormatter={(val) => `Rp${(val / 1000000).toFixed(0)}Jt`}
              />
              <Tooltip
                formatter={(val: any) => [formatterIDR.format(Number(val)), '']}
                contentStyle={{ borderRadius: '12px', fontSize: '11px', fontWeight: 'bold' }}
              />
              <Legend wrapperStyle={{ fontSize: '11px', fontWeight: 'bold' }} />
              <Area
                type="monotone"
                dataKey="nominalValue"
                name="Nilai Nominal Masa Depan"
                stroke="#3b82f6"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#nominalGrad)"
              />
              <Area
                type="monotone"
                dataKey="realPurchasingPower"
                name="Daya Beli Riil (Dalam Rp Hari Ini)"
                stroke="#10b981"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#realGrad)"
              />
              <Area
                type="monotone"
                dataKey="cashRealPurchasingPower"
                name="Kas Tanpa Investasi (Tergerus Inflasi)"
                stroke="#f43f5e"
                strokeWidth={2}
                strokeDasharray="4 4"
                fillOpacity={0}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Year by Year Breakdown Table */}
      {showTableBreakdown && (
        <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl animate-fadeIn">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-extrabold uppercase text-[10px]">
              <tr>
                <th className="p-3">Tahun</th>
                <th className="p-3">Total Disetor</th>
                <th className="p-3">Nilai Nominal Masa Depan</th>
                <th className="p-3 text-emerald-600">Daya Beli Riil (Rp Hari Ini)</th>
                <th className="p-3 text-rose-600">Kas Tanpa Investasi (Daya Beli)</th>
                <th className="p-3">Selisih Inflasi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-slate-800 dark:text-slate-200 font-medium">
              {calculationResults.yearlyData.map((row) => (
                <tr key={row.year} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                  <td className="p-3 font-bold font-sans">{row.year}</td>
                  <td className="p-3">{formatterIDR.format(row.totalDeposited)}</td>
                  <td className="p-3 text-blue-600 font-bold">{formatterIDR.format(row.nominalValue)}</td>
                  <td className="p-3 text-emerald-600 font-bold">{formatterIDR.format(row.realPurchasingPower)}</td>
                  <td className="p-3 text-rose-600">{formatterIDR.format(row.cashRealPurchasingPower)}</td>
                  <td className="p-3 text-slate-500">-{formatterIDR.format(row.inflationImpactLoss)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Educational Insight Card */}
      <div className="p-4 bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/80 rounded-xl flex items-start gap-3">
        <Sparkles className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="space-y-1 text-xs text-amber-900 dark:text-amber-200">
          <p className="font-extrabold">💡 Mengapa Investasi Penting Menghadapi Inflasi?</p>
          <p className="text-[11px] leading-relaxed font-medium">
            Tanpa investasi dengan imbal hasil di atas tingkat inflasi (<strong>{annualInflationRate}%</strong> per tahun), daya beli uang tunai kas Anda akan menyusut secara otomatis seiring waktu. Dengan mengalokasikan aset ke instrumen produktif seperti <strong>Emas, Saham, Reksadana, dan Properti</strong>, Anda mempertahankan dan meningkatkan nilai riil kekayaan Anda di masa depan.
          </p>
        </div>
      </div>

    </div>
  );
};
