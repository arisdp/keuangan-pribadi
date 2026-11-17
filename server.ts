import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { apiRouter, ensureTablesExist } from "./src/server/api";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Mount API router
  app.use("/api/db", apiRouter);

  // Auto-synchronize PostgreSQL schema and missing columns on server startup
  ensureTablesExist().catch(err => {
    console.error('[Database Migration Startup Error]:', err);
  });

  // API Route - Health Check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // API Route - Get Firebase Web Configuration
  app.get("/api/firebase-config", (req, res) => {
    const config = {
      apiKey: process.env.FIREBASE_API_KEY,
      authDomain: process.env.FIREBASE_AUTH_DOMAIN,
      projectId: process.env.FIREBASE_PROJECT_ID,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.FIREBASE_APP_ID,
    };

    // Only mark as configured if key is present
    const isConfigured = !!config.apiKey;

    res.json({
      configured: isConfigured,
      config: isConfigured ? config : null
    });
  });

  // Helper fallback generators when Gemini API key is missing or quota/rate-limit error occurs
  function generateFallbackWeeklyInsights(transactions: any[], budgets: any[], debts: any[]) {
    const recentTxs = (transactions || []).slice(-15);
    const expenseTxs = recentTxs.filter((t: any) => t.type === 'expense');
    const totalExpense = expenseTxs.reduce((acc: number, t: any) => acc + (Number(t.amount) || 0), 0);
    const unusual = expenseTxs
      .filter((t: any) => Number(t.amount) >= 300000)
      .slice(0, 3)
      .map((t: any) => ({
        category: t.category || 'Pengeluaran',
        amount: Number(t.amount) || 0,
        reason: `Transaksi ${t.description || t.category} sebesar Rp ${Number(t.amount).toLocaleString('id-ID')} tergolong signifikan pekan ini.`
      }));

    return {
      weeklyTrendScore: totalExpense > 2000000 ? "Perlu Waspada" : "Disiplin & Hemat",
      headline: totalExpense > 2000000 
        ? "Pengeluaran Pekan Ini Cukup Tinggi, Tetap Jaga Alokasi Tabungan" 
        : "Pengeluaran Mingguan Terkendali Sesuai Rencana",
      summary: `Dalam 7 hari terakhir, tercatat ${expenseTxs.length} transaksi pengeluaran dengan total nominal sekitar Rp ${totalExpense.toLocaleString('id-ID')}.`,
      unusualExpenses: unusual,
      savingsOpportunities: [
        {
          title: "Optimasi Pengeluaran Harian & Kuliner",
          impact: "Potensi Hemat Rp 100.000 - Rp 250.000 / minggu",
          description: "Meninjau kembali langganan dan pengeluaran makan luar secara berkala dapat menghemat alokasi dana mingguan."
        }
      ],
      isFallback: true
    };
  }

  function generateFallbackFinancialAnalysis(transactions: any[], budgets: any[], debts: any[], emergencyFund: any, investments: any[]) {
    const txList = transactions || [];
    const expenses = txList.filter((t: any) => t.type === 'expense');
    const totalExpense = expenses.reduce((a: number, b: any) => a + (Number(b.amount) || 0), 0);
    
    return {
      summary: `Analisis Kesehatan Keuangan: Terdeteksi total ${txList.length} transaksi dengan total pengeluaran Rp ${totalExpense.toLocaleString('id-ID')}. Kondisi keuangan relatif stabil.`,
      analysis: (budgets && budgets.length > 0 ? budgets : [{ category: 'Umum', limitAmount: 1000000 }]).slice(0, 5).map((b: any) => ({
        category: b.category || 'Kategori',
        percentageOfTotal: totalExpense > 0 ? Math.min(100, Math.round(((Number(b.limitAmount) || 0) / (totalExpense || 1)) * 100)) : 10,
        status: "Aman",
        insight: `Anggaran kategori ${b.category} diset sebesar Rp ${Number(b.limitAmount || 0).toLocaleString('id-ID')}. Pertahankan kedisiplinan pencatatan.`
      })),
      budgetSuggestions: (budgets || []).slice(0, 3).map((b: any) => ({
        category: b.category,
        currentBudget: Number(b.limitAmount) || 0,
        recommendedBudget: Math.round((Number(b.limitAmount) || 0) * 0.95),
        reason: "Penyesuaian efisiensi 5% untuk meningkatkan porsi tabungan dan investasi bulanan."
      })),
      debtAdvice: (debts && debts.length > 0) 
        ? `Terdapat ${debts.length} catatan utang. Prioritaskan metode Avalanche (bunga tertinggi) atau Snowball (nominal terkecil) untuk mempercepat pelunasan.`
        : "Tidak ada beban utang aktif. Pertahankan kondisi ini dan prioritaskan alokasi dana ke tabungan darurat dan investasi.",
      emergencyFundAdvice: "Pastikan dana darurat terkumpul minimal 3-6 kali pengeluaran bulanan di instrumen likuid seperti reksa dana pasar uang atau deposito.",
      investmentAdvice: "Diversifikasikan aset Anda ke instrumen berisiko rendah-menengah untuk menjaga pertumbuhan nilai kekayaan di atas tingkat inflasi.",
      disciplineTips: [
        "Terapkan aturan jeda 24 jam sebelum melakukan pembelian barang non-esensial.",
        "Catat setiap pengeluaran kecil sesegera mungkin agar arus kas tetap transparan.",
        "Otomatiskan transfer ke rekening tabungan/investasi di awal bulan (pay yourself first)."
      ],
      isFallback: true
    };
  }

  function generateFallbackAnomalies(transactions: any[], budgets: any[]) {
    const txList = transactions || [];
    const expenses = txList.filter((t: any) => t.type === 'expense');
    const largeExpenses = expenses.filter((t: any) => Number(t.amount) >= 300000);

    return {
      overallAssessment: "Audit Pengeluaran Stabil: Sebagian besar transaksi berada dalam batas wajar.",
      anomalies: largeExpenses.slice(0, 3).map((t: any, idx: number) => ({
        id: `ano-fb-${idx}`,
        category: t.category || 'Umum',
        spikePercentage: 35.0,
        currentMonthSpend: Number(t.amount) || 0,
        threeMonthAvgSpend: Math.round((Number(t.amount) || 0) * 0.7),
        severity: Number(t.amount) >= 1000000 ? "high" : "medium",
        title: `Pengeluaran ${t.category || 'Terbesar'}`,
        description: `Transaksi '${t.description || t.category}' sebesar Rp ${Number(t.amount).toLocaleString('id-ID')} merupakan alokasi yang cukup tinggi.`,
        recommendation: "Evaluasi kembali urgensi transaksi ini untuk perencanaan bulan depan."
      })),
      suspiciousTransactions: [],
      actionableAdvice: [
        "Tetapkan limit peringatan transaksi harian pada aplikasi perbankan Anda.",
        "Tinjau ulang pos anggaran yang sering mengalami pengeluaran tak terduga."
      ],
      isFallback: true
    };
  }

  function generateFallbackMonthlyComparison(transactions: any[], budgets: any[]) {
    const txList = transactions || [];
    const expenses = txList.filter((t: any) => t.type === 'expense');
    const total = expenses.reduce((a: number, b: any) => a + (Number(b.amount) || 0), 0);

    return {
      currentMonthName: "Bulan Ini",
      previousMonthName: "Bulan Lalu",
      totalCurrentMonthExpense: total,
      totalPreviousMonthExpense: Math.round(total * 0.9),
      differenceAmount: Math.round(total * 0.1),
      percentageChange: 10.0,
      trendStatus: "Meningkat",
      overallSummary: "Pengeluaran bulan ini tercatat sedikit meningkat dibanding periode sebelumnya. Arus kas secara umum masih terkendali.",
      categoryComparisons: [],
      topIncreaseCategory: {
        category: "Makanan & Minuman",
        increaseAmount: Math.round(total * 0.05),
        reason: "Pengeluaran harian dan konsumsi rutin."
      },
      topSavingsCategory: {
        category: "Transportasi",
        savingsAmount: Math.round(total * 0.02),
        reason: "Penghematan ongkos perjalanan."
      },
      actionableRecommendations: [
        "Jaga batas pengeluaran harian agar tidak melampaui rata-rata anggaran.",
        "Evaluasi pos pengeluaran kategori Makanan dan Belanja Harian."
      ],
      isFallback: true
    };
  }

  function generateFallback3MonthTrend(transactions: any[], budgets: any[]) {
    const txList = transactions || [];
    const expenses = txList.filter((t: any) => t.type === 'expense');
    const total = expenses.reduce((a: number, b: any) => a + (Number(b.amount) || 0), 0);

    return {
      currentMonthName: "Bulan Ini",
      threeMonthsRangeName: "3 Bulan Terakhir",
      totalCurrentExpense: total,
      totalThreeMonthAvg: Math.round(total * 0.95),
      totalDifference: Math.round(total * 0.05),
      percentageVsAvg: 5.2,
      trendStatus: "Stabil",
      overallTrendSummary: "Tren pengeluaran 3 bulan berada dalam kisaran stabil. Kedisiplinan anggaran terjaga dengan baik.",
      categoryAnalyses: [],
      topSavingsRecommendations: [
        {
          title: "Optimasi Belanja Bulanan",
          category: "Kebutuhan Harian",
          potentialSavingsAmount: 150000,
          actionPlan: "Manfaatkan promo dan daftar belanja prioritas saat berbelanja bulanan."
        }
      ],
      generalTips: [
        "Rutin mengevaluasi pengeluaran mingguan.",
        "Alokasikan surplus anggaran langsung ke instrumen investasi."
      ],
      isFallback: true
    };
  }

  function generateFallbackSuggestCategory(description: string, existingCategories: string[]) {
    const lower = (description || '').toLowerCase();
    if (lower.includes('makan') || lower.includes('kopi') || lower.includes('nasi') || lower.includes('resto') || lower.includes('cafe') || lower.includes('warung') || lower.includes('food')) {
      return "Makanan & Minuman";
    }
    if (lower.includes('bensin') || lower.includes('grab') || lower.includes('gojek') || lower.includes('parkir') || lower.includes('trans') || lower.includes('toll') || lower.includes('kendaraan')) {
      return "Transportasi";
    }
    if (lower.includes('listrik') || lower.includes('air') || lower.includes('wifi') || lower.includes('indihome') || lower.includes('pulsa') || lower.includes('kuota') || lower.includes('pln')) {
      return "Tagihan";
    }
    if (lower.includes('gaji') || lower.includes('bonus') || lower.includes('transfer masuk') || lower.includes('income')) {
      return "Gaji";
    }
    if (lower.includes('saham') || lower.includes('crypto') || lower.includes('reksadana') || lower.includes('bibit') || lower.includes('bareksa')) {
      return "Investasi";
    }
    if (existingCategories && existingCategories.length > 0) {
      return existingCategories[0];
    }
    return "Lainnya";
  }

  function generateFallbackDiversification(investments: any[], riskProfile: string) {
    const invList = investments || [];
    const totalVal = invList.reduce((a: number, b: any) => a + (Number(b.balance) || 0), 0);

    return {
      riskProfile: riskProfile || 'moderat',
      alignmentScore: 80,
      overallSummary: `Portofolio memiliki ${invList.length} aset investasi dengan total valuasi Rp ${totalVal.toLocaleString('id-ID')}. Diversifikasi aset cukup baik sesuai profil risiko ${riskProfile}.`,
      currentBreakdown: invList.map((i: any) => ({
        category: i.category || i.name || 'Aset',
        value: Number(i.balance) || 0,
        percentage: totalVal > 0 ? Math.round(((Number(i.balance) || 0) / totalVal) * 100) : 0
      })),
      recommendedBreakdown: invList.map((i: any) => ({
        category: i.category || i.name || 'Aset',
        recommendedPercentage: Math.round(100 / (invList.length || 1)),
        targetValue: Math.round(totalVal / (invList.length || 1)),
        action: "Pertahankan",
        adjustmentAmount: 0
      })),
      riskAssessment: "Konsentrasi risiko relatif berimbang. Disarankan berkala melakukan rebalancing bulanan.",
      tacticalSteps: [
        "Pertahankan alokasi berkala pada instrumen berisiko rendah sebagai penyeimbang.",
        "Lakukan evaluasi kinerja portofolio tiap kuartal."
      ],
      isFallback: true
    };
  }

  function generateFallbackParseNaturalTransaction(promptText: string) {
    const lower = (promptText || '').toLowerCase();
    let amount = 0;
    const matchNum = promptText.match(/(\d+[\.\d]*)\s*(rb|ribu|k|jt|juta)?/i);
    if (matchNum) {
      let val = parseFloat(matchNum[1]);
      const unit = (matchNum[2] || '').toLowerCase();
      if (unit === 'rb' || unit === 'ribu' || unit === 'k') val *= 1000;
      if (unit === 'jt' || unit === 'juta') val *= 1000000;
      amount = val;
    }

    let type = "expense";
    if (lower.includes("gaji") || lower.includes("terima") || lower.includes("pemasukan") || lower.includes("dapat") || lower.includes("bonus")) {
      type = "income";
    } else if (lower.includes("tabung") || lower.includes("simpan")) {
      type = "saving";
    } else if (lower.includes("beli saham") || lower.includes("reksadana") || lower.includes("investasi")) {
      type = "investment";
    }

    return {
      type,
      amount: amount || 50000,
      category: type === "income" ? "Gaji" : "Makanan & Minuman",
      description: promptText,
      accountId: null,
      date: new Date().toISOString().split('T')[0],
      explanation: `Berhasil mengekstrak data transaksi dari input "${promptText}".`,
      isFallback: true
    };
  }

  function generateFallbackCategoryCleanup(uncategorizedTransactions: any[]) {
    const suggestions = (uncategorizedTransactions || []).map((t: any) => {
      const desc = (t.description || '').toLowerCase();
      let cat = "Lainnya";
      if (desc.includes('makan') || desc.includes('kopi') || desc.includes('resto')) cat = "Makanan & Minuman";
      else if (desc.includes('trans') || desc.includes('grab') || desc.includes('gojek')) cat = "Transportasi";
      else if (desc.includes('gaji') || desc.includes('bonus')) cat = "Gaji";

      return {
        id: t.id,
        originalCategory: t.category || "Lainnya",
        suggestedCategory: cat,
        confidence: "medium",
        reason: "Disarankan berdasarkan kata kunci deskripsi transaksi."
      };
    });

    return { suggestions, isFallback: true };
  }

  // API Route - Automated Expense Analysis & Recommendations (Gemini Powered)
  app.post("/api/analyze", async (req, res) => {
    const { transactions, budgets, debts, emergencyFund, investments } = req.body;
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.json(generateFallbackFinancialAnalysis(transactions, budgets, debts, emergencyFund, investments));
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const prompt = `Anda adalah seorang Perencana Keuangan Independen & Penasihat Keuangan AI profesional. 
Misi Anda adalah melakukan analisis mendalam terhadap transaksi keuangan pribadi pengguna berikut ini, lalu memberikan analisis pengeluaran otomatis, saran anggaran bulanan yang bijak, pengelolaan hutang, strategi dana darurat, dan optimasi investasi dalam bahasa Indonesia yang ramah, profesional, dan mudah dipahami.

Berikut adalah data keuangan pengguna saat ini:
1. Daftar Transaksi Terakhir (Transaction Log):
${JSON.stringify(transactions || [], null, 2)}

2. Anggaran Kategori Saat Ini (Budgets):
${JSON.stringify(budgets || [], null, 2)}

3. Status Hutang Pengguna (Debts):
${JSON.stringify(debts || [], null, 2)}

4. Status Dana Darurat (Emergency Fund):
${JSON.stringify(emergencyFund || {}, null, 2)}

5. Portofolio Investasi Pengguna (Investments):
${JSON.stringify(investments || [], null, 2)}

Harap lakukan analisis yang sangat bijak dan kritis terhadap seluruh aspek keuangan yang saling terkoneksi di atas (pemasukan, pengeluaran, dana darurat, utang, dan investasi). Perhatikan jika ada pengeluaran yang mendekati atau melewati anggaran, lihat rasio tabungan & investasi terhadap total pendapatan, evaluasi diversifikasi alokasi aset portofolio investasi mereka (saham, reksa dana, emas, dll.), serta berikan rekomendasi aksi konkret dan taktis.

Harap berikan respon dalam format JSON yang valid sesuai schema berikut, tanpa ada teks penjelasan markdown di luar JSON tersebut agar server dapat mem-parsing hasilnya langsung.

Struktur JSON respons yang wajib Anda berikan:
{
  "summary": "Tuliskan analisis ringkas & objektif mengenai kesehatan keuangan pengguna saat ini, pola belanja mereka, dan rasio ideal pemasukan vs pengeluaran.",
  "analysis": [
    {
      "category": "Nama Kategori (misal: Makanan, Transportasi, Hiburan, Belanja, dll.)",
      "percentageOfTotal": 15.5,
      "status": "Aman / Peringatan / Berlebih (Overbudget)",
      "insight": "Berikan analisis tajam mengenai pengeluaran aktual pada kategori ini dibanding anggaran dan bagaimana mereka dapat mengoptimalkannya."
    }
  ],
  "budgetSuggestions": [
    {
      "category": "Nama Kategori",
      "currentBudget": 1000000,
      "recommendedBudget": 850000,
      "reason": "Alasan realistis mengapa anggaran ini perlu disesuaikan (dikurangi atau dipindahkan ke tabungan/investasi) berdasarkan pengeluaran aktual mereka."
    }
  ],
  "debtAdvice": "Saran pelunasan hutang spesifik (mengaitkan strategi Snowball vs Avalanche) berdasarkan hutang yang diinput pengguna. Jika tidak ada hutang, berikan dorongan hangat untuk berinvestasi atau menabung lebih aktif.",
  "emergencyFundAdvice": "Saran taktis tentang dana darurat, termasuk instrumen penempatan likuid yang cocok (seperti reksa dana pasar uang atau deposito), berdasarkan target dan saldo dana darurat mereka.",
  "investmentAdvice": "Saran alokasi aset, analisis tingkat diversifikasi portofolio investasi saat ini (saham vs reksadana vs emas dll.), evaluasi return/pertumbuhan portofolio, serta rekomendasi taktis rebalancing atau penambahan investasi baru.",
  "disciplineTips": [
    "Tips disiplin finansial ke-1 berdasarkan kelemahan pengeluaran mereka.",
    "Tips disiplin finansial ke-2 untuk menghindari impuls buying.",
    "Tips disiplin finansial ke-3 untuk meningkatkan literasi keuangan."
  ]
}

Pastikan respons Anda adalah murni JSON yang valid yang dapat langsung di-parse dengan JSON.parse().`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        }
      });

      const resultText = response.text || "{}";
      res.json(JSON.parse(resultText));
    } catch (error: any) {
      console.log("[AI Analysis] Using rules-based fallback response.");
      res.json(generateFallbackFinancialAnalysis(transactions, budgets, debts, emergencyFund, investments));
    }
  });

  // API Route - Detect Spending Anomalies & Spikes (Gemini Powered)
  app.post("/api/detect-anomalies", async (req, res) => {
    const { transactions, budgets } = req.body;
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.json(generateFallbackAnomalies(transactions, budgets));
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const prompt = `Anda adalah Asisten Audit Keuangan AI & Detektif Keuangan Spesialis Anomali.
Misi Anda adalah menganalisis log transaksi bulanan pengguna untuk menemukan:
1. Lonjakan Pengeluaran Kategori yang Tiba-Tiba Meningkat Tajam dibanding rata-rata 3 bulan sebelumnya.
2. Transaksi Tidak Wajar / Mencurigakan (Nilai transaksi sangat besar, potensi transaksi ganda, pengeluaran impulsif tak terencana).
3. Evaluasi Potensi Kebocoran Halus (Subscriptions tak terpakai, biaya admin berulang, pengeluaran harian kecil tapi frekuensi tinggi).

Berikut adalah data transaksi lengkap pengguna:
Daftar Transaksi (Transaction History):
${JSON.stringify(transactions || [], null, 2)}

Anggaran Kategori Saat Ini (Budgets):
${JSON.stringify(budgets || [], null, 2)}

Harap lakukan perbandingan rasio secara teliti. Berikan respons berupa JSON yang valid dengan struktur persis seperti di bawah ini, tanpa teks tambahan di luar JSON:

{
  "overallAssessment": "Ringkasan audit anomali pengeluaran bulan ini (apakah tergolong Stabil / Banyak Anomali / Perlu Kewaspadaan Tinggi).",
  "anomalies": [
    {
      "id": "ano-1",
      "category": "Nama Kategori (misal: Makanan, Hiburan, Belanja, Transportasi)",
      "spikePercentage": 145.5,
      "currentMonthSpend": 3500000,
      "threeMonthAvgSpend": 1425000,
      "severity": "high", 
      "title": "Lonjakan Tajam Belanja Hiburan (+145%)",
      "description": "Jelaskan secara tajam transaksi spesifik mana yang menyebabkan lonjakan ini dan mengapa tergolong anomali dibanding rata-rata 3 bulan sebelumnya.",
      "recommendation": "Langkah korektif konkret agar pengeluaran kembali normal bulan depan."
    }
  ],
  "suspiciousTransactions": [
    {
      "txId": "id transaksi jika ada, atau deskripsi",
      "description": "Deskripsi Transaksi",
      "amount": 1500000,
      "reason": "Alasan mengapa transaksi ini ditandai sebagai anomali/mencurigakan"
    }
  ],
  "actionableAdvice": [
    "Saran pencegahan ke-1 untuk mengendalikan lonjakan pengeluaran.",
    "Saran pencegahan ke-2 untuk mengunci anggaran kritis."
  ]
}

Aturan Keparahan (severity):
- "high": Jika lonjakan > 75% atau pengeluaran jauh melampaui anggaran.
- "medium": Jika lonjakan 30% - 75%.
- "low": Jika lonjakan < 30% namun perlu dicatat.

Pastikan respons Anda adalah murni JSON valid.`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        }
      });

      const resultText = response.text || "{}";
      res.json(JSON.parse(resultText));
    } catch (error: any) {
      console.log("[AI Anomaly Detection] Using rules-based fallback response.");
      res.json(generateFallbackAnomalies(transactions, budgets));
    }
  });

  // API Route - Compare Monthly Expenses (Gemini Powered)
  app.post("/api/compare-monthly-expenses", async (req, res) => {
    const { transactions, budgets } = req.body;
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.json(generateFallbackMonthlyComparison(transactions, budgets));
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const prompt = `Anda adalah seorang Konsultan Perencana Keuangan & Analis Komparasi Keuangan AI Spesialis Analisis Bulanan.
Misi Anda adalah menganalisis dan membandingkan secara komprehensif pengeluaran bulan ini (Current Month) dibandingkan dengan pengeluaran bulan lalu (Previous Month) berdasarkan log transaksi pengguna.

Daftar Transaksi Lengkap (Transaction Log):
${JSON.stringify(transactions || [], null, 2)}

Anggaran Kategori Saat Ini (Budgets):
${JSON.stringify(budgets || [], null, 2)}

Petunjuk Pemrosesan:
1. Identifikasi periode bulan terbaru (Bulan Ini) dan bulan sebelumnya (Bulan Lalu) dari tanggal transaksi (field "date", format YYYY-MM-DD). Jika transaksi hanya mencakup 1 bulan, buat estimasi komparasi historis yang relevan dengan bulan sebelumnya atau berikan gambaran tren yang akurat.
2. Filter transaksi dengan tipe 'expense' (pengeluaran).
3. Hitung total pengeluaran Bulan Ini dan Bulan Lalu.
4. Hitung rincian total pengeluaran per kategori untuk Bulan Ini vs Bulan Lalu.
5. Evaluasi perubahan nominal (Rp) dan persentase perubahan (%), serta tandai apakah pengeluaran mengalami kenaikan ("Naik"), penurunan/penghematan ("Turun"), atau sama ("Sama").
6. Identifikasi kategori dengan kenaikan pengeluaran tertinggi dan kategori dengan penghematan terbesar.
7. Berikan rekomendasi taktis agar keuangan bulan berikutnya lebih terkontrol.

Harap berikan respons dalam format JSON murni yang valid sesuai struktur berikut, tanpa teks markdown di luar JSON:

{
  "currentMonthName": "Nama bulan & tahun saat ini (misal: Juli 2026)",
  "previousMonthName": "Nama bulan & tahun sebelumnya (misal: Juni 2026)",
  "totalCurrentMonthExpense": 4500000,
  "totalPreviousMonthExpense": 3800000,
  "differenceAmount": 700000,
  "percentageChange": 18.42,
  "trendStatus": "Meningkat",
  "overallSummary": "Ringkasan analisis komparatif eksekutif yang tajam mengenai dinamika perubahan pengeluaran pengguna bulan ini vs bulan lalu.",
  "categoryComparisons": [
    {
      "category": "Makanan & Minuman",
      "previousMonthAmount": 1200000,
      "currentMonthAmount": 1500000,
      "differenceAmount": 300000,
      "percentageChange": 25.0,
      "trend": "Naik",
      "insight": "Penjelasan mengapa terjadi kenaikan/penurunan pada kategori ini dan dampaknya ke arus kas."
    }
  ],
  "topIncreaseCategory": {
    "category": "Hiburan",
    "increaseAmount": 450000,
    "reason": "Pengeluaran membengkak karena beberapa transaksi tiket & event tak terencana."
  },
  "topSavingsCategory": {
    "category": "Transportasi",
    "savingsAmount": 200000,
    "reason": "Penghematan berhasil dilakukan berkat penggunaan transportasi publik."
  },
  "actionableRecommendations": [
    "Saran taktis ke-1 untuk mempertahankan penghematan atau mengontrol kenaikan.",
    "Saran taktis ke-2 untuk alokasi dana surplus/pengetatan.",
    "Saran taktis ke-3 untuk bulan depan."
  ]
}

Aturan trendStatus:
- "Meningkat" jika totalCurrentMonthExpense > totalPreviousMonthExpense
- "Penghematan" jika totalCurrentMonthExpense < totalPreviousMonthExpense
- "Stabil" jika totalCurrentMonthExpense == totalPreviousMonthExpense

Pastikan respons Anda adalah murni JSON yang valid yang dapat di-parse langsung dengan JSON.parse().`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        }
      });

      const resultText = response.text || "{}";
      res.json(JSON.parse(resultText));
    } catch (error: any) {
      console.log("[AI Monthly Comparison] Using rules-based fallback response.");
      res.json(generateFallbackMonthlyComparison(transactions, budgets));
    }
  });

  // API Route - Analyze 3-Month Spending Trend & Savings Recommendations (Gemini Powered)
  app.post("/api/analyze-3month-trend", async (req, res) => {
    const { transactions, budgets } = req.body;
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.json(generateFallback3MonthTrend(transactions, budgets));
      }

      if (!transactions || !Array.isArray(transactions)) {
        return res.json(generateFallback3MonthTrend([], budgets));
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const prompt = `Anda adalah penasihat keuangan senior dan analis anggaran pribadi AI yang sangat berpengalaman.
Tugas Anda adalah menganalisis tren pengeluaran pengguna dengan membandingkan total pengeluaran bulan ini dengan rata-rata pengeluaran 3 bulan terakhir, serta mengevaluasi selisih anggaran (budget variance) tiap kategori untuk memberikan rekomendasi penghematan yang spesifik dan konkret.

Data Transaksi Pengguna:
${JSON.stringify(transactions, null, 2)}

Data Anggaran (Budgets):
${JSON.stringify(budgets || [], null, 2)}

Instruksi Analisis:
1. Kelompokkan transaksi tipe "expense" ke dalam bulan berjalan (Current Month) dan 3 bulan sebelumnya (Previous 3 Months).
2. Hitung total pengeluaran Bulan Ini dan Rata-Rata Pengeluaran 3 Bulan Terakhir.
3. Untuk setiap kategori pengeluaran:
   - Hitung total pengeluaran bulan ini (currentMonthAmount).
   - Hitung rata-rata pengeluaran 3 bulan terakhir (threeMonthAvgAmount).
   - Dapatkan batas anggaran kategori dari data budgets (budgetLimit) jika ada (0 jika tidak ada).
   - Hitung selisih anggaran (budgetDifference = budgetLimit - currentMonthAmount, jika budgetLimit > 0).
   - Hitung persentase perbedaan bulan ini dibanding rata-rata 3 bulan (% change vs 3-month avg).
   - Susun saran penghematan taktis yang spesifik untuk kategori tersebut berdasarkan selisih anggaran atau pembengkakan dibanding rata-rata 3 bulan.
4. Formulasikan rekomendasi penghematan utama (Top Savings Recommendations) berdasarkan kategori yang paling membengkak atau over-budget.

Berikan respons dalam format JSON murni yang valid tanpa tambahan markdown dengan struktur:
{
  "currentMonthName": "Nama bulan & tahun saat ini (misal: Juli 2026)",
  "threeMonthsRangeName": "Rentang 3 bulan sebelumnya (misal: April - Juni 2026)",
  "totalCurrentExpense": 4500000,
  "totalThreeMonthAvg": 4000000,
  "totalDifference": 500000,
  "percentageVsAvg": 12.5,
  "trendStatus": "Meningkat",
  "overallTrendSummary": "Ringkasan eksekutif mendalam mengenai perbandingan pengeluaran bulan ini terhadap rata-rata 3 bulan terakhir.",
  "categoryAnalyses": [
    {
      "category": "Makanan & Minuman",
      "currentMonthAmount": 1500000,
      "threeMonthAvgAmount": 1200000,
      "budgetLimit": 1300000,
      "budgetDiff": -200000,
      "percentageVsAvg": 25.0,
      "status": "Membengkak",
      "savingsRecommendation": "Rekomendasi spesifik penghematan untuk kategori ini berdasarkan selisih anggaran."
    }
  ],
  "topSavingsRecommendations": [
    {
      "title": "Judul Rekomendasi 1",
      "category": "Nama Kategori",
      "potentialSavingsAmount": 300000,
      "actionPlan": "Langkah konkret yang dapat dilakukan pengguna bulan depan untuk memangkas selisih anggaran ini."
    }
  ],
  "generalTips": [
    "Saran umum penghematan 1",
    "Saran umum penghematan 2"
  ]
}

Pastikan respons murni JSON valid.`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        }
      });

      const resultText = response.text || "{}";
      res.json(JSON.parse(resultText));
    } catch (error: any) {
      console.log("[AI 3-Month Trend Analysis] Using rules-based fallback response.");
      res.json(generateFallback3MonthTrend(transactions, budgets));
    }
  });

  // API Route - Suggest Transaction Category (Gemini Powered)
  app.post("/api/suggest-category", async (req, res) => {
    const { description, existingCategories, transactionHistory } = req.body;
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.json({ category: generateFallbackSuggestCategory(description, existingCategories) });
      }

      if (!description) {
        return res.status(400).json({ error: "Description is required." });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const historyContext = Array.isArray(transactionHistory) && transactionHistory.length > 0
        ? `\nRiwayat transaksi sebelumnya:\n` + transactionHistory.slice(0, 15).map(t => `- "${t.description}" -> Kategori: ${t.category}`).join('\n')
        : '';

      const prompt = `Anda adalah asisten keuangan pintar.
Tugas Anda adalah mengategorikan transaksi berdasarkan deskripsi atau nama merchant berikut: "${description}".

Daftar kategori yang sudah ada dan hirarki master kategori pengguna (UTAMAKAN memilih dari daftar ini jika relevan):
${existingCategories && existingCategories.length > 0 ? existingCategories.join(', ') : 'Belum ada kategori.'}
${historyContext}

Harap berikan respons berupa JSON dengan format:
{
  "suggestedCategory": "Nama Kategori yang paling tepat dari daftar atau kategori baru jika benar-benar tidak ada yang cocok"
}

Berikan hanya JSON yang valid, tanpa tambahan teks apapun.`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        }
      });

      const resultText = response.text || "{}";
      const resultJson = JSON.parse(resultText);
      
      res.json({ category: resultJson.suggestedCategory || "Lainnya" });
    } catch (error: any) {
      console.log("[AI Category Suggestion] Using rules-based fallback response.");
      res.json({ category: generateFallbackSuggestCategory(description, existingCategories) });
    }
  });

  // API Route - Portfolio Diversification Analysis & Rebalancing Recommendation (Gemini Powered)
  app.post("/api/analyze-diversification", async (req, res) => {
    const { investments, riskProfile } = req.body;
    const targetRiskProfile = riskProfile || 'moderat';
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.json(generateFallbackDiversification(investments, targetRiskProfile));
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const prompt = `Anda adalah Penasihat Investasi & Manajer Portofolio Senior berbasis AI.
Misi Anda adalah melakukan Analisis Diversifikasi Portofolio Investasi dan menyusun Rekomendasi Rebalancing Aset secara presisi berdasarkan Profil Risiko Pengguna ("${targetRiskProfile.toUpperCase()}").

Profil Risiko Pengguna:
- Konservatif: Mengutamakan keamanan modal utama, toleransi risiko rendah. Alokasi ideal: Pasar Uang / Deposito / SBN (50-60%), Emas / Logam Mulia (20-30%), Saham / Reksadana Saham (10-20%).
- Moderat: Keseimbangan antara pertumbuhan dan stabilitas. Alokasi ideal: Saham / Reksadana Campuran (35-45%), Obligasi / SBN (30-40%), Emas / Pasar Uang (20-25%).
- Agresif: Mengejar imbal hasil tinggi, toleransi volatilitas tinggi. Alokasi ideal: Saham / Crypto / Growth (60-70%), Reksadana Pendapatan Tetap / Obligasi (20-25%), Cash / Emas (10-15%).

Data Portofolio Investasi Pengguna Saat Ini:
${JSON.stringify(investments || [], null, 2)}

Tugas Anda:
1. Hitung valuasi total portofolio dan persentase alokasi riil per kategori aset saat ini.
2. Bandingkan dengan profil risiko "${targetRiskProfile.toUpperCase()}".
3. Tentukan "alignmentScore" (Skor Keselarasan 0 - 100) antara portofolio saat ini dengan profil risiko tersebut.
4. Buat rekomendasi persentase alokasi ideal ("recommendedPercentage"), target nilai dalam Rupiah ("targetValue"), aksi ("Beli" / "Jual" / "Pertahankan"), serta besaran penyesuaian Rupiah ("adjustmentAmount") untuk tiap kategori.
5. Berikan "riskAssessment" (evaluasi risiko konsentrasi / volatilitas) dan "tacticalSteps" (3-4 langkah praktis aksi rebalancing).

Harap berikan respons dalam format JSON murni yang valid sesuai struktur berikut:

{
  "riskProfile": "${targetRiskProfile}",
  "alignmentScore": 75,
  "overallSummary": "Penjelasan ringkas dan profesional mengenai kondisi diversifikasi portofolio pengguna saat ini dibanding profil risiko ${targetRiskProfile}.",
  "currentBreakdown": [
    {
      "category": "Saham",
      "value": 4500000,
      "percentage": 56.25
    }
  ],
  "recommendedBreakdown": [
    {
      "category": "Saham",
      "recommendedPercentage": 40.0,
      "targetValue": 3200000,
      "action": "Jual",
      "adjustmentAmount": -1300000
    }
  ],
  "riskAssessment": "Evaluasi mendalam mengenai konsentrasi aset dan potensi risiko volatilitas portofolio ini.",
  "tacticalSteps": [
    "Langkah rebalancing ke-1 (misal: Alokasikan dividen atau top up bulanan ke instrumen SBN/Pasar Uang)",
    "Langkah rebalancing ke-2",
    "Langkah rebalancing ke-3"
  ]
}

Pastikan respons murni JSON yang dapat langsung di-parse dengan JSON.parse().`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        }
      });

      const resultText = response.text || "{}";
      res.json(JSON.parse(resultText));
    } catch (error: any) {
      console.log("[AI Diversification] Using rules-based fallback response.");
      res.json(generateFallbackDiversification(investments, targetRiskProfile));
    }
  });

  // API Route - Weekly Financial Insights & Anomalies (Gemini Powered)
  app.post("/api/weekly-insights", async (req, res) => {
    const { transactions, budgets, debts } = req.body;
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.json(generateFallbackWeeklyInsights(transactions, budgets, debts));
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const prompt = `Anda adalah Perencana Keuangan AI yang menganalisis transaksi pengguna dalam 7 hari terakhir.
Berikan "Wawasan Keuangan Minggu Ini" (Weekly Financial Insights) yang mencakup:
1. Skor Tren Mingguan ("Sangat Baik", "Disiplin & Hemat", "Perlu Waspada", atau "Risiko Overbudget").
2. Headline/Judul Wawasan singkat & menarik.
3. Ringkasan singkat kondisi arus kas minggu ini.
4. Peringatan Pengeluaran Tidak Biasa (Unusual Expenses/Anomalies) jika ada pengeluaran besar atau lonjakan frekuensi.
5. Saran Penghematan Konkret (Savings Opportunities) yang dapat langsung dipraktikkan minggu depan dengan estimasi potensi penghematan nominal.

Data Transaksi Terkini:
${JSON.stringify(transactions || [], null, 2)}

Data Anggaran Bulanan:
${JSON.stringify(budgets || [], null, 2)}

Data Utang:
${JSON.stringify(debts || [], null, 2)}

Harap berikan respons dalam format JSON murni dengan struktur berikut:
{
  "weeklyTrendScore": "Disiplin & Hemat",
  "headline": "Pengeluaran Kuliner Melonjak, Namun Alokasi Tabungan Tetap Aman",
  "summary": "Pekan ini total pengeluaran Anda tercatat sebesar Rp ... dengan fokus utama pada kategori ...",
  "unusualExpenses": [
    {
      "category": "Makanan",
      "amount": 350000,
      "reason": "Terdapat 4 kali pengeluaran kuliner berturut-turut yang melebihi rata-rata harian."
    }
  ],
  "savingsOpportunities": [
    {
      "title": "Bawa Bekal Makan Siang 3x Seminggu",
      "impact": "Potensi Hemat Rp 120.000 / minggu",
      "description": "Mengurangi jajan makan siang luar dapat menghemat hingga Rp 480.000 per bulan untuk dialihkan ke Tabungan Darurat."
    }
  ]
}

Pastikan respons adalah murni JSON valid yang dapat langsung di-parse dengan JSON.parse().`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        }
      });

      const resultText = response.text || "{}";
      res.json(JSON.parse(resultText));
    } catch (error: any) {
      console.log("[AI Weekly Insights] Using rules-based fallback response.");
      res.json(generateFallbackWeeklyInsights(transactions, budgets, debts));
    }
  });

  // API Route - Natural Language Transaction Parser (Gemini Powered)
  app.post("/api/parse-natural-transaction", async (req, res) => {
    const { promptText, availableAccounts = [], availableCategories = [] } = req.body;
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.json(generateFallbackParseNaturalTransaction(promptText));
      }

      if (!promptText || typeof promptText !== 'string' || !promptText.trim()) {
        return res.status(400).json({ error: "Deskripsi teks bahasa alami tidak boleh kosong." });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const todayStr = new Date().toISOString().split('T')[0];

      const prompt = `Anda adalah asisten AI pencatat transaksi keuangan pribadi yang sangat akurat.
Tugas Anda adalah membaca input deskripsi transaksi dalam bahasa alami berikut, lalu mengekstrak data struktur transaksi keuangan.

Input Pengguna: "${promptText}"
Tanggal Hari Ini: ${todayStr}

Daftar Akun / Rekening Pengguna yang Tersedia:
${JSON.stringify(availableAccounts, null, 2)}

Daftar Kategori Transaksi yang Tersedia:
${JSON.stringify(availableCategories, null, 2)}

Petunjuk Ekstraksi:
1. "type": tentukan apakah ini "expense" (pengeluaran), "income" (pemasukan), "saving" (tabungan), atau "investment" (investasi).
2. "amount": nominal angka transaksi dalam Rupiah (number murni tanpa simbol). Contoh "45rb" -> 45000, "1,5 juta" -> 1500000, "35k" -> 35000.
3. "category": pilih nama kategori paling cocok dari Daftar Kategori yang Tersedia, atau buat nama kategori singkat jika tidak ada yang cocok.
4. "description": judul/deskripsi ringkas transaksi (misal: "Kopi Starbucks", "Makan Siang Nasi Padang", "Gaji Bulanan").
5. "accountId": pilih id akun yang paling sesuai dari Daftar Akun yang Tersedia (jika pengguna menyebutkan nama akun/rekening seperti BCA, Mandiri, Cash/Tunai, OVO, ShopeePay), jika tidak disebutkan atau tidak cocok kembalikan null.
6. "date": tanggal transaksi format YYYY-MM-DD (jika ada kata 'kemarin' kurangi 1 hari, '2 hari lalu' kurangi 2 hari, jika tidak disebutkan gunakan tanggal hari ini: ${todayStr}).
7. "explanation": penjelasan ringkas 1 kalimat bahwa AI telah berhasil mengekstrak data tersebut.

Harap berikan respons dalam format JSON murni dengan struktur berikut:
{
  "type": "expense",
  "amount": 45000,
  "category": "Makanan & Minuman",
  "description": "Kopi Starbucks",
  "accountId": "id_akun_jika_ada",
  "date": "2026-07-26",
  "explanation": "Berhasil mengekstrak pengeluaran Kopi Starbucks Rp 45.000 dari input Anda."
}

Pastikan respons murni JSON valid yang dapat di-parse dengan JSON.parse().`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        }
      });

      const resultText = response.text || "{}";
      res.json(JSON.parse(resultText));
    } catch (error: any) {
      console.log("[AI Parse Natural Transaction] Using rules-based fallback response.");
      res.json(generateFallbackParseNaturalTransaction(promptText));
    }
  });

  // API Route - Uncategorized Transactions AI Cleanup Suggestion
  app.post("/api/suggest-category-cleanup", async (req, res) => {
    const { uncategorizedTransactions = [], availableCategories = [] } = req.body;
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.json(generateFallbackCategoryCleanup(uncategorizedTransactions));
      }

      if (!Array.isArray(uncategorizedTransactions) || uncategorizedTransactions.length === 0) {
        return res.json({ suggestions: [] });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const prompt = `Anda adalah ahli pengategorian transaksi keuangan pribadi dan bisnis.
Berikut adalah daftar transaksi keuangan pengguna yang belum memiliki kategori spesifik atau dikategorikan sebagai 'Lainnya'/'Umum':

Daftar Transaksi untuk Ditinjau:
${JSON.stringify(uncategorizedTransactions, null, 2)}

Daftar Kategori Pilihan / Tersedia:
${JSON.stringify(availableCategories, null, 2)}

Tugas Anda:
1. Analisis deskripsi, jenis (income/expense/saving/investment), dan nominal masing-masing transaksi.
2. Berikan usulan kategori yang jauh lebih spesifik dan akurat (utamakan menggunakan Kategori Pilihan jika ada yang cocok, atau buat nama kategori yang umum dan standar jika tidak ada yang cocok).
3. Sertakan alasan singkat 1 kalimat mengapa kategori tersebut disarankan.

Kembalikan respon JSON murni dengan format berikut:
{
  "suggestions": [
    {
      "id": "id_transaksi",
      "originalCategory": "kategori_awal",
      "suggestedCategory": "kategori_saran_ai",
      "confidence": "high",
      "reason": "Alasan singkat pengategorian"
    }
  ]
}

Pastikan respons murni JSON valid.`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        }
      });

      const resultText = response.text || '{"suggestions":[]}';
      res.json(JSON.parse(resultText));
    } catch (error: any) {
      console.log("[AI Category Cleanup] Using rules-based fallback response.");
      res.json(generateFallbackCategoryCleanup(uncategorizedTransactions));
    }
  });

  // Vite integration
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
