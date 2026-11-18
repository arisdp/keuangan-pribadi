import React, { useState } from 'react';
import { 
  X, 
  ChevronRight, 
  ChevronLeft, 
  Sparkles, 
  ShieldCheck, 
  Database, 
  LayoutDashboard, 
  PiggyBank, 
  TrendingUp, 
  HelpCircle,
  Smartphone,
  Laptop,
  CheckCircle,
  Coins,
  Settings
} from 'lucide-react';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  username: string;
  isCloudSyncActive: boolean;
}

export function OnboardingModal({ isOpen, onClose, username, isCloudSyncActive }: OnboardingModalProps) {
  const [currentStep, setCurrentStep] = useState(0);

  if (!isOpen) return null;

  const steps = [
    {
      title: "Selamat Datang di Nusantara Wealth!",
      subtitle: "Asisten Manajemen Kekayaan Pribadi Kelas Eksekutif",
      icon: Sparkles,
      color: "from-blue-600 to-indigo-600 animate-pulse",
      content: (
        <div className="space-y-4">
          <p className="text-sm text-slate-600 leading-relaxed">
            Halo <strong className="text-slate-800 font-bold">{username}</strong>, selamat datang di Nusantara Wealth. 
            Aplikasi ini dirancang khusus untuk membantu Anda melacak, menganalisis, dan melipatgandakan kekayaan dengan standar profesional tinggi.
          </p>
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-4.5 space-y-3.5">
            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">5 Pilar Fitur Utama Kami:</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="flex items-center gap-2.5 text-slate-700 font-medium">
                <div className="w-6 h-6 rounded bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">1</div>
                <span>Setup & Konfigurasi Fleksibel</span>
              </div>
              <div className="flex items-center gap-2.5 text-slate-700 font-medium">
                <div className="w-6 h-6 rounded bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">2</div>
                <span>Budget & Jurnal Transaksi</span>
              </div>
              <div className="flex items-center gap-2.5 text-slate-700 font-medium">
                <div className="w-6 h-6 rounded bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">3</div>
                <span>Manajemen Aset & Investasi</span>
              </div>
              <div className="flex items-center gap-2.5 text-slate-700 font-medium">
                <div className="w-6 h-6 rounded bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">4</div>
                <span>Strategi Pelunasan Utang</span>
              </div>
              <div className="flex items-center gap-2.5 text-slate-700 font-medium sm:col-span-2">
                <div className="w-6 h-6 rounded bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">5</div>
                <span>Kalkulator Dana Darurat & Net Worth</span>
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      title: "Input Nominal Otomatis dengan Pemisah Ribuan",
      subtitle: "Bebas dari Kesalahan Menghitung Jumlah Angka 0",
      icon: Settings,
      color: "from-blue-600 to-cyan-600",
      content: (
        <div className="space-y-4">
          <p className="text-sm text-slate-600 leading-relaxed">
            Nusantara Wealth kini telah dilengkapi dengan sistem <strong className="text-slate-800 font-bold">Input Nominal Otomatis Pemisah Ribuan (Thousand Separator)</strong> di seluruh modul aplikasi.
          </p>
          <div className="bg-blue-50 border border-blue-200/60 rounded-xl p-4 space-y-3">
            <h4 className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
              <CheckCircle className="h-4 w-4 text-blue-600" />
              Keunggulan Fitur Input Ribuan:
            </h4>
            <ul className="space-y-2 text-xs text-blue-800">
              <li className="flex items-start gap-2">
                <span className="font-bold">•</span>
                <span><strong>Format Otomatis Real-Time:</strong> Saat Anda mengetik <code className="bg-white px-1.5 py-0.5 rounded border border-blue-200 font-mono text-blue-950">1000000</code>, tampilan otomatis berformat menjadi <code className="bg-white px-1.5 py-0.5 rounded border border-blue-200 font-mono text-blue-950">1.000.000</code> secara langsung.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold">•</span>
                <span><strong>Mencegah Human Error:</strong> Tidak perlu lagi menghitung manual berapa jumlah angka <code className="bg-white px-1 rounded font-mono">0</code> yang Anda ketik untuk menghindari keliru dalam memasukkan nilai juta atau ratusan ribu.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold">•</span>
                <span><strong>Tersedia di Seluruh Form:</strong> Berlaku di Form Transaksi, Pindah Buku, Buat Rekening Baru, Edit Saldo, Anggaran, Simulasi Investasi, Target Tabungan, dan Utang.</span>
              </li>
            </ul>
          </div>
        </div>
      )
    },
    {
      title: "Cara Kerja Dashboard Finansial",
      subtitle: "Pusat Kendali Informasi Finansial Real-time",
      icon: LayoutDashboard,
      color: "from-emerald-500 to-teal-600",
      content: (
        <div className="space-y-4">
          <p className="text-sm text-slate-600 leading-relaxed">
            Dashboard Utama memberikan ringkasan eksekutif secara instan mengenai kondisi finansial Anda saat ini:
          </p>
          <div className="space-y-3">
            <div className="flex gap-3 items-start p-2.5 hover:bg-slate-50 rounded-lg transition-colors">
              <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <TrendingUp className="h-4 w-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-800">Kekayaan Bersih (Net Worth)</h4>
                <p className="text-[11px] text-slate-500 mt-0.5">Dihitung otomatis secara langsung berdasarkan total akumulasi semua aset dikurangi total kewajiban/utang.</p>
              </div>
            </div>
            <div className="flex gap-3 items-start p-2.5 hover:bg-slate-50 rounded-lg transition-colors">
              <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <PiggyBank className="h-4 w-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-800">Tingkat Tabungan (Savings Rate)</h4>
                <p className="text-[11px] text-slate-500 mt-0.5">Persentase dari sisa pemasukan yang berhasil Anda simpan. Idealnya berada di atas 20% demi akselerasi kekayaan.</p>
              </div>
            </div>
            <div className="flex gap-3 items-start p-2.5 hover:bg-slate-50 rounded-lg transition-colors">
              <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                <Database className="h-4 w-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-800">Visualisasi Arus Kas & Anggaran</h4>
                <p className="text-[11px] text-slate-500 mt-0.5">Grafik batang mendeteksi perbandingan bulanan pemasukan vs pengeluaran, dilengkapi bar indikator anggaran yang memperingatkan jika belanja mendekati limit.</p>
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      title: "Solusi Sinkronisasi Multi-Device (PostgreSQL Cloud)",
      subtitle: "Penyimpanan Tersimpan Aman di Cloud & Mode Offline",
      icon: ShieldCheck,
      color: "from-amber-500 to-orange-600",
      content: (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200/50 text-amber-800 rounded-xl p-3.5 flex items-start gap-2.5 text-xs font-medium">
            <HelpCircle className="h-4.5 w-4.5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <strong className="block text-amber-900 font-bold mb-0.5">Penyimpanan Terintegrasi:</strong>
              Data finansial Anda tersimpan di <strong className="font-extrabold text-amber-950">Database PostgreSQL Cloud</strong> secara otomatis setiap kali Anda online, serta tersimpan cadangan di perangkat lokal saat offline.
            </div>
          </div>
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-3.5">
            <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <CheckCircle className="h-4.5 w-4.5 text-emerald-600" />
              Keunggulan Database PostgreSQL & Offline Mode:
            </h4>
            <p className="text-xs text-slate-600 leading-relaxed">
              Anda dapat mencatat transaksi kapan saja. Saat terhubung ke internet, seluruh jurnal finansial Anda akan tersinkronisasi langsung ke Database Cloud PostgreSQL.
            </p>
            <div className="flex justify-around items-center py-2 text-slate-500">
              <div className="flex flex-col items-center gap-1">
                <Laptop className="h-8 w-8 text-blue-600" />
                <span className="text-[10px] font-bold">Akses Laptop</span>
              </div>
              <div className="w-10 border-t-2 border-dashed border-slate-300" />
              <div className="flex flex-col items-center gap-1">
                <Database className="h-8 w-8 text-emerald-600" />
                <span className="text-[10px] font-bold text-slate-700">PostgreSQL Cloud</span>
              </div>
              <div className="w-10 border-t-2 border-dashed border-slate-300" />
              <div className="flex flex-col items-center gap-1">
                <Smartphone className="h-8 w-8 text-indigo-600" />
                <span className="text-[10px] font-bold">Smartphone</span>
              </div>
            </div>
            <p className="text-[11px] text-emerald-700 font-bold text-center">
              ✓ Database PostgreSQL terhubung dan aktif! Seluruh transaksi Anda aman tersimpan.
            </p>
          </div>
        </div>
      )
    },
    {
      title: "Langkah Awal Mengatur Jurnal Finansial",
      subtitle: "4 Langkah Menuju Kedisiplinan Keuangan Mutlak",
      icon: Coins,
      color: "from-blue-600 to-blue-500",
      content: (
        <div className="space-y-4">
          <p className="text-sm text-slate-600 leading-relaxed">
            Ikuti instruksi langkah demi langkah di bawah ini untuk memulai pencatatan dari nol:
          </p>
          <div className="space-y-3.5">
            <div className="flex gap-3 text-xs">
              <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 font-extrabold flex items-center justify-center shrink-0">1</div>
              <div>
                <strong className="text-slate-800 font-bold">Atur Akun & Saldo Awal:</strong>
                <p className="text-slate-500 mt-0.5">Buka tab <strong className="font-semibold text-slate-700">"Master Akun & Rekening"</strong>. Isi Starting Balance untuk dompet tunai, rekening bank, maupun e-wallet Anda.</p>
              </div>
            </div>
            <div className="flex gap-3 text-xs">
              <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 font-extrabold flex items-center justify-center shrink-0">2</div>
              <div>
                <strong className="text-slate-800 font-bold">Atur Rencana Anggaran (Budgeting):</strong>
                <p className="text-slate-500 mt-0.5">Buka tab <strong className="font-semibold text-slate-700">"Rencana Anggaran"</strong>. Tentukan ekspektasi pemasukan bulanan dan tetapkan limit belanja untuk setiap kategori.</p>
              </div>
            </div>
            <div className="flex gap-3 text-xs">
              <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 font-extrabold flex items-center justify-center shrink-0">3</div>
              <div>
                <strong className="text-slate-800 font-bold">Mulai Jurnal Transaksi Harian:</strong>
                <p className="text-slate-500 mt-0.5">Setiap kali Anda menerima uang atau melakukan pengeluaran, catat dengan cepat di tab <strong className="font-semibold text-slate-700">"Jurnal Transaksi"</strong>.</p>
              </div>
            </div>
            <div className="flex gap-3 text-xs">
              <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 font-extrabold flex items-center justify-center shrink-0">4</div>
              <div>
                <strong className="text-slate-800 font-bold">Konfigurasikan Fitur Lanjutan:</strong>
                <p className="text-slate-500 mt-0.5">Isi target Dana Darurat sesuai tanggungan di tab <strong className="font-semibold text-slate-700">"Dana Darurat"</strong>, dan hitung atau daftarkan utang maupun KPR baru di tab <strong className="font-semibold text-slate-700">"Perhitungan Utang & KPR"</strong>. Seluruh pembayaran cicilan & pelunasan cukup dicatat satu kali di tab <strong className="font-semibold text-slate-700">"Jurnal Transaksi"</strong>.</p>
              </div>
            </div>
          </div>
        </div>
      )
    }
  ];

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onClose();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const StepIcon = steps[currentStep].icon;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm select-none font-sans">
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col transition-all duration-300">
        
        {/* Banner with gradient color based on current step */}
        <div className={`p-6 bg-gradient-to-r ${steps[currentStep].color} text-white relative`}>
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-full bg-white/10 hover:bg-white/20 transition-all text-white/80 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
          
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center text-white shrink-0 shadow-inner">
              <StepIcon className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight">{steps[currentStep].title}</h2>
              <p className="text-xs text-white/80 font-medium mt-0.5">{steps[currentStep].subtitle}</p>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 sm:p-8 flex-1 overflow-y-auto max-h-[380px]">
          {steps[currentStep].content}
        </div>

        {/* Footer controls */}
        <div className="px-6 py-4.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          {/* Stepper dots */}
          <div className="flex gap-1.5">
            {steps.map((_, idx) => (
              <span 
                key={idx} 
                className={`h-1.5 rounded-full transition-all duration-300 ${idx === currentStep ? 'w-5 bg-blue-600' : 'w-1.5 bg-slate-300'}`}
              />
            ))}
          </div>

          <div className="flex gap-2">
            {currentStep > 0 && (
              <button 
                onClick={handlePrev}
                className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-200/50 rounded-lg transition-colors flex items-center gap-1"
              >
                <ChevronLeft className="h-4.5 w-4.5" />
                Kembali
              </button>
            )}

            <button 
              onClick={handleNext}
              className="px-4.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1 shadow-sm active:scale-95"
            >
              {currentStep === steps.length - 1 ? 'Mulai Sekarang' : 'Lanjut'}
              {currentStep < steps.length - 1 && <ChevronRight className="h-4.5 w-4.5" />}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
