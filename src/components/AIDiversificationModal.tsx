import React, { useState } from 'react';
import { InvestmentAsset, RiskProfile, AIDiversificationResult } from '../types';
import { X, Sparkles, ShieldCheck, TrendingUp, AlertTriangle, CheckCircle, BarChart3, RefreshCw, ArrowRight, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';

interface AIDiversificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  investments: InvestmentAsset[];
}

export const AIDiversificationModal: React.FC<AIDiversificationModalProps> = ({
  isOpen,
  onClose,
  investments,
}) => {
  const [riskProfile, setRiskProfile] = useState<RiskProfile>('moderat');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AIDiversificationResult | null>(null);

  const formatterIDR = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  });

  if (!isOpen) return null;

  const totalPortfolioValue = investments.reduce((sum, inv) => sum + inv.balance, 0);

  // Fallback client-side calculation if server call fails or offline
  const generateClientFallback = (profile: RiskProfile): AIDiversificationResult => {
    const categoriesMap: { [key: string]: number } = {};
    investments.forEach((inv) => {
      const cat = inv.category || 'Lainnya';
      categoriesMap[cat] = (categoriesMap[cat] || 0) + inv.balance;
    });

    const currentBreakdown = Object.keys(categoriesMap).map((cat) => ({
      category: cat,
      value: categoriesMap[cat],
      percentage: totalPortfolioValue > 0 ? (categoriesMap[cat] / totalPortfolioValue) * 100 : 0,
    }));

    // Target allocation per risk profile
    let recommendedPercentages: { [key: string]: number } = {};
    if (profile === 'konservatif') {
      recommendedPercentages = {
        'Reksadana': 40,
        'Logam Mulia (Emas)': 35,
        'Saham': 15,
        'Cryptocurrency': 0,
        'Lainnya': 10,
      };
    } else if (profile === 'moderat') {
      recommendedPercentages = {
        'Saham': 40,
        'Reksadana': 35,
        'Logam Mulia (Emas)': 15,
        'Cryptocurrency': 5,
        'Lainnya': 5,
      };
    } else {
      // Agresif
      recommendedPercentages = {
        'Saham': 60,
        'Cryptocurrency': 15,
        'Reksadana': 15,
        'Logam Mulia (Emas)': 5,
        'Lainnya': 5,
      };
    }

    const allCategories = Array.from(
      new Set([...Object.keys(categoriesMap), ...Object.keys(recommendedPercentages)])
    );

    const recommendedBreakdown = allCategories.map((cat) => {
      const currentVal = categoriesMap[cat] || 0;
      const recPct = recommendedPercentages[cat] || 5;
      const targetVal = (totalPortfolioValue * recPct) / 100;
      const adjustment = targetVal - currentVal;
      let action: 'Beli' | 'Jual' | 'Pertahankan' = 'Pertahankan';
      if (adjustment > 50000) action = 'Beli';
      else if (adjustment < -50000) action = 'Jual';

      return {
        category: cat,
        recommendedPercentage: recPct,
        targetValue: targetVal,
        action,
        adjustmentAmount: adjustment,
      };
    });

    // Score calculation
    let scorePenalty = 0;
    recommendedBreakdown.forEach((item) => {
      const currentPct = currentBreakdown.find((c) => c.category === item.category)?.percentage || 0;
      scorePenalty += Math.abs(currentPct - item.recommendedPercentage);
    });

    const alignmentScore = Math.max(20, Math.min(98, Math.round(100 - scorePenalty / 1.5)));

    return {
      riskProfile: profile,
      alignmentScore,
      overallSummary: `Portofolio Anda saat ini memiliki skor keselarasan ${alignmentScore}/100 untuk profil risiko ${profile.toUpperCase()}. Terdapat beberapa kategori aset yang memerlukan rebalancing agar portofolio lebih tahan terhadap volatilitas pasar.`,
      currentBreakdown,
      recommendedBreakdown,
      riskAssessment: `Portofolio memiliki konsentrasi aset sebesar ${(currentBreakdown[0]?.percentage || 0).toFixed(1)}% pada kategori ${currentBreakdown[0]?.category || 'utama'}. Untuk profil ${profile.toUpperCase()}, disarankan untuk memperluas diversifikasi agar penurunan harga pada satu instrumen tidak menggerus modal secara signifikan.`,
      tacticalSteps: [
        `Alokasikan dana top-up bulanan sebesar 60% ke instrumen dengan porsi di bawah target.`,
        `Pertimbangkan untuk melakukan pertukaran (switching) dari porsi aset yang berlebih ke aset yang kekurangan.`,
        `Lakukan evaluasi ulang (rebalancing check) secara berkala setiap 3 atau 6 bulan.`,
      ],
    };
  };

  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/analyze-diversification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          investments,
          riskProfile,
        }),
      });

      if (!response.ok) {
        throw new Error('Respons server gagal');
      }

      const data = await response.json();
      if (data.error) {
        throw new Error(data.error);
      }

      setResult(data);
    } catch {
      // Fallback
      setResult(generateClientFallback(riskProfile));
    } finally {
      setLoading(false);
    }
  };

  // Prepare chart comparison data
  const chartData = result
    ? result.recommendedBreakdown.map((item) => {
        const curr = result.currentBreakdown.find((c) => c.category === item.category);
        return {
          category: item.category,
          'Saat Ini (%)': Number((curr?.percentage || 0).toFixed(1)),
          'Rekomendasi AI (%)': Number(item.recommendedPercentage.toFixed(1)),
        };
      })
    : [];

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-4xl w-full shadow-2xl overflow-hidden my-8">
        {/* Modal Header */}
        <div className="p-5 sm:p-6 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600/30 border border-blue-500/40 rounded-xl text-blue-400">
              <Sparkles className="h-6 w-6 animate-pulse" />
            </div>
            <div>
              <h3 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
                Analisis Diversifikasi & Rebalancing Portofolio
                <span className="text-[10px] bg-blue-500/30 text-blue-300 font-extrabold uppercase px-2 py-0.5 rounded-full border border-blue-400/30">
                  Gemini AI
                </span>
              </h3>
              <p className="text-xs text-slate-300">
                Optimalkan keseimbangan risiko & potensi imbal hasil investasi Anda secara rasional
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* Risk Profile Selection */}
          <div className="space-y-3">
            <label className="text-xs font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
              Pilih Profil Risiko Keuangan Anda
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                {
                  id: 'konservatif',
                  title: 'Konservatif',
                  subtitle: 'Keamanan Modal Utama',
                  desc: 'Fokus stabilitas (Pasar Uang, Deposito, Sukuk Negara, Emas)',
                  icon: ShieldCheck,
                  badgeColor: 'border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400',
                },
                {
                  id: 'moderat',
                  title: 'Moderat',
                  subtitle: 'Seimbang & Terukur',
                  desc: 'Pertumbuhan terukur & stabilitas (Saham Bluechip, SBN, Reksadana)',
                  icon: BarChart3,
                  badgeColor: 'border-blue-500/40 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400',
                },
                {
                  id: 'agresif',
                  title: 'Agresif',
                  subtitle: 'Pertumbuhan Maksimal',
                  desc: 'Mengejar imbal hasil tinggi, siap volatilitas (Saham, Crypto, Growth)',
                  icon: TrendingUp,
                  badgeColor: 'border-purple-500/40 bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-400',
                },
              ].map((p) => {
                const Icon = p.icon;
                const isSelected = riskProfile === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setRiskProfile(p.id as RiskProfile);
                      setResult(null);
                    }}
                    className={`p-4 rounded-xl border text-left transition-all cursor-pointer relative ${
                      isSelected
                        ? 'border-blue-600 dark:border-blue-500 bg-blue-50/70 dark:bg-blue-950/40 ring-2 ring-blue-500/20 shadow-sm'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-850'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className={`p-2 rounded-lg border ${p.badgeColor}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      {isSelected && (
                        <span className="w-2.5 h-2.5 rounded-full bg-blue-600 dark:bg-blue-400 animate-pulse" />
                      )}
                    </div>
                    <h4 className="font-black text-sm text-slate-900 dark:text-slate-100">{p.title}</h4>
                    <p className="text-[11px] font-bold text-blue-600 dark:text-blue-400 mb-1">{p.subtitle}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">{p.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Action Button */}
          {!result && !loading && (
            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={handleAnalyze}
                disabled={investments.length === 0}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-sm rounded-xl shadow-lg shadow-blue-600/20 hover:shadow-blue-600/30 transition flex items-center gap-2 mx-auto disabled:opacity-50 cursor-pointer"
              >
                <Sparkles className="h-4 w-4" />
                Mulai Analisis Diversifikasi Portofolio
              </button>
              {investments.length === 0 && (
                <p className="text-xs text-rose-500 mt-2 font-medium">
                  Tambahkan minimal 1 aset investasi untuk mulai melakukan analisis.
                </p>
              )}
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="py-12 text-center space-y-4">
              <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
              <div>
                <p className="font-extrabold text-sm text-slate-800 dark:text-slate-200">
                  Gemini AI sedang mengevaluasi portofolio Anda...
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Menghitung rasio konsentrasi aset, tingkat volatilitas, dan target rebalancing.
                </p>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-4 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/50 rounded-xl flex items-center gap-3 text-rose-700 dark:text-rose-300 text-xs font-semibold">
              <AlertTriangle className="h-5 w-5 shrink-0 text-rose-500" />
              <span>{error}</span>
            </div>
          )}

          {/* Analysis Results Display */}
          {result && !loading && (
            <div className="space-y-6 pt-2 animate-in fade-in duration-300">
              {/* Score & Summary Card */}
              <div className="p-5 bg-slate-50 dark:bg-slate-850 rounded-2xl border border-slate-200 dark:border-slate-800 grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
                <div className="md:col-span-1 text-center border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-700 pb-4 md:pb-0 md:pr-4">
                  <span className="text-[10px] uppercase font-black text-slate-400 tracking-wider block mb-1">
                    Skor Keselarasan
                  </span>
                  <div className="inline-flex items-baseline justify-center gap-1">
                    <span
                      className={`text-4xl font-black ${
                        result.alignmentScore >= 80
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : result.alignmentScore >= 60
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {result.alignmentScore}
                    </span>
                    <span className="text-slate-400 text-sm font-bold">/ 100</span>
                  </div>
                  <p className="text-[11px] font-bold mt-1 text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                    Profil {result.riskProfile}
                  </p>
                </div>

                <div className="md:col-span-3 space-y-1">
                  <h4 className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-blue-500" />
                    Ringkasan Evaluasi Gemini AI
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {result.overallSummary}
                  </p>
                </div>
              </div>

              {/* Allocation Comparison Chart */}
              <div className="p-5 bg-white dark:bg-slate-850 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-blue-600" />
                    Perbandingan Alokasi Aset (%) (Saat Ini vs Rekomendasi AI)
                  </h4>
                </div>

                <div className="h-64 w-full pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="category" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} unit="%" />
                      <Tooltip formatter={(val: any) => [`${val}%`, '']} />
                      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                      <Bar dataKey="Saat Ini (%)" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Rekomendasi AI (%)" fill="#10b981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Actionable Rebalancing Table */}
              <div className="space-y-3">
                <h4 className="text-xs font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 text-blue-600" />
                  Rencana Aksi Rebalancing Per Kategori Aset
                </h4>

                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-100 dark:bg-slate-800 text-[10px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">
                        <th className="p-3">Kategori Aset</th>
                        <th className="p-3 text-right">Valuasi Riil</th>
                        <th className="p-3 text-center">Alokasi Riil</th>
                        <th className="p-3 text-center">Target Ideal</th>
                        <th className="p-3 text-center">Aksi Rebalancing</th>
                        <th className="p-3 text-right">Penyesuaian (Rp)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs font-mono">
                      {result.recommendedBreakdown.map((item, idx) => {
                        const curr = result.currentBreakdown.find((c) => c.category === item.category);
                        const currPct = curr ? curr.percentage : 0;
                        const currVal = curr ? curr.value : 0;

                        return (
                          <tr
                            key={idx}
                            className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                          >
                            <td className="p-3 font-sans font-bold text-slate-900 dark:text-slate-100">
                              {item.category}
                            </td>
                            <td className="p-3 text-right text-slate-700 dark:text-slate-300 font-semibold">
                              {formatterIDR.format(currVal)}
                            </td>
                            <td className="p-3 text-center text-slate-600 dark:text-slate-400 font-bold">
                              {currPct.toFixed(1)}%
                            </td>
                            <td className="p-3 text-center text-blue-600 dark:text-blue-400 font-extrabold">
                              {item.recommendedPercentage.toFixed(1)}%
                            </td>
                            <td className="p-3 text-center">
                              <span
                                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                                  item.action === 'Beli'
                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                    : item.action === 'Jual'
                                    ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                                    : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                }`}
                              >
                                {item.action === 'Beli' && <ArrowUpRight className="h-3 w-3" />}
                                {item.action === 'Jual' && <ArrowDownRight className="h-3 w-3" />}
                                {item.action}
                              </span>
                            </td>
                            <td
                              className={`p-3 text-right font-bold ${
                                item.adjustmentAmount > 0
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : item.adjustmentAmount < 0
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : 'text-slate-500'
                              }`}
                            >
                              {item.adjustmentAmount > 0 ? '+' : ''}
                              {formatterIDR.format(item.adjustmentAmount)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Risk Assessment & Tactical Steps Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-xl space-y-2">
                  <h5 className="text-xs font-black text-amber-800 dark:text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    Evaluasi Risiko Konsentrasi
                  </h5>
                  <p className="text-xs text-amber-900/80 dark:text-amber-200/80 leading-relaxed">
                    {result.riskAssessment}
                  </p>
                </div>

                <div className="p-4 bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40 rounded-xl space-y-2">
                  <h5 className="text-xs font-black text-blue-800 dark:text-blue-300 uppercase tracking-wider flex items-center gap-1.5">
                    <CheckCircle className="h-4 w-4 text-blue-600" />
                    Langkah Aksi Taktis
                  </h5>
                  <ul className="space-y-1.5 text-xs text-blue-900/80 dark:text-blue-200/80">
                    {result.tacticalSteps.map((step, idx) => (
                      <li key={idx} className="flex items-start gap-1.5">
                        <ArrowRight className="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5" />
                        <span>{step}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="pt-2 flex justify-between items-center border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={handleAnalyze}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-extrabold text-xs rounded-xl transition flex items-center gap-2 cursor-pointer"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Analisis Ulang
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl transition cursor-pointer shadow-sm"
                >
                  Selesai
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
