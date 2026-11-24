import React, { useState, useEffect } from 'react';
import { 
  Lock, User as UserIcon, UserPlus, Key, Shield, ShieldAlert, 
  Sparkles, CheckCircle2, Eye, EyeOff, Cloud, Database, Mail, 
  Activity, RefreshCw, ArrowLeft, Send, AlertTriangle, Wifi, Server,
  Terminal, Trash2, Info
} from 'lucide-react';
import { User } from '../types';
import { loginWithGoogleSheets } from '../googleSheets';
import { 
  loginUserPostgres, 
  registerUserPostgres, 
  requestForgotPasswordPostgres, 
  checkPostgresHealth, 
  HealthCheckResult,
  getClientInteractionLogs,
  clearClientInteractionLogs,
  fetchServerDbLogs,
  ClientLogEntry
} from '../apiClient';

interface LoginScreenProps {
  onLoginSuccess: (user: User, dataChoice: 'empty' | 'sample', isNewRegistration?: boolean) => void;
}

export function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'forgot'>('login');
  
  // Form states
  const [username, setUsername] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [fullName, setFullName] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [dataChoice, setDataChoice] = useState<'empty' | 'sample'>('empty');
  
  // Forgot password state
  const [forgotIdentifier, setForgotIdentifier] = useState<string>('');
  const [resetResult, setResetResult] = useState<{ message: string; resetLink?: string } | null>(null);

  // Status & Feedback states
  const [error, setError] = useState<string>('');
  const [errorDetails, setErrorDetails] = useState<string>('');
  const [errorCode, setErrorCode] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  
  // Cloud Auth state
  const [isCloudAuth, setIsCloudAuth] = useState<boolean>(false);
  const [showDomainTroubleshoot, setShowDomainTroubleshoot] = useState<boolean>(false); 

  // Diagnostic states
  const [showDiagnostic, setShowDiagnostic] = useState<boolean>(false);
  const [testingDiagnostic, setTestingDiagnostic] = useState<boolean>(false);
  const [diagnosticResult, setDiagnosticResult] = useState<HealthCheckResult | null>(null);
  const [serverLogs, setServerLogs] = useState<any[]>([]);
  const [clientLogs, setClientLogs] = useState<ClientLogEntry[]>([]);
  const [activeDiagTab, setActiveDiagTab] = useState<'status' | 'client' | 'server'>('status');

  const refreshLogsAndDiagnostics = async () => {
    setTestingDiagnostic(true);
    try {
      const [pingRes, sLogs] = await Promise.all([
        checkPostgresHealth(),
        fetchServerDbLogs(5)
      ]);
      setDiagnosticResult(pingRes);
      setServerLogs(sLogs);
      setClientLogs(getClientInteractionLogs());
    } catch (err: any) {
      setDiagnosticResult({
        online: navigator.onLine,
        status: 'error',
        database: 'disconnected',
        latencyMs: 0,
        details: err?.message || 'Gagal menjalankan uji koneksi',
        timestamp: new Date().toISOString()
      });
    } finally {
      setTestingDiagnostic(false);
    }
  };

  const runDiagnosticCheck = async () => {
    await refreshLogsAndDiagnostics();
  };

  const handleClearLogs = () => {
    clearClientInteractionLogs();
    setClientLogs([]);
  };

  const handleLoginLocal = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setErrorDetails('');
    setErrorCode('');
    setLoading(false);

    const cleanUser = username.trim();
    if (!cleanUser || !password.trim()) {
      setError('Username / Email dan Password wajib diisi.');
      return;
    }

    setLoading(true);

    try {
      const data = await loginUserPostgres({
        username: cleanUser,
        email: cleanUser,
        password: password
      });

      onLoginSuccess({
        username: data.user.username,
        fullName: data.user.fullName,
        uid: data.user.id,
        isPremium: true
      }, 'empty', false);
    } catch (err: any) {
      const rawMsg = err?.message || 'Login database PostgreSQL gagal.';
      const cleanMsg = rawMsg.replace(/^\[Database Error\]\s*/i, '');

      // Check specific user failure scenarios
      if (cleanMsg.toLowerCase().includes('tidak cocok') || cleanMsg.toLowerCase().includes('salah')) {
        setError(`Otentikasi Gagal: Password atau Username/Email untuk '${cleanUser}' tidak cocok.`);
        setErrorDetails(`Sistem menemukan bahwa data login untuk '${cleanUser}' tidak sesuai dengan password yang diketikkan. Pastikan caps lock tidak aktif.`);
        setErrorCode('AUTH_CREDENTIALS_MISMATCH');
      } else if (cleanMsg.toLowerCase().includes('terhubung') || cleanMsg.toLowerCase().includes('koneksi') || cleanMsg.toLowerCase().includes('failed to fetch')) {
        setError('Gagal terhubung ke server database PostgreSQL.');
        setErrorDetails(err?.details || 'Layanan database mungkin sedang tidak dapat dijangkau atau terjadi rintangan jaringan.');
        setErrorCode('DB_CONNECTION_TIMEOUT');
        setShowDiagnostic(true);
        runDiagnosticCheck();
      } else {
        setError(cleanMsg);
        setErrorDetails(err?.details || 'Periksa kembali data masukan Anda dan pastikan server PostgreSQL terhubung.');
        setErrorCode('DB_QUERY_ERR');
        setShowDiagnostic(true);
        runDiagnosticCheck();
      }
      refreshLogsAndDiagnostics();
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterLocal = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setErrorDetails('');
    setErrorCode('');
    setSuccess('');
    setLoading(true);

    if (!username.trim() || !fullName.trim() || !password.trim()) {
      setError('Username, Nama Lengkap, dan Password wajib diisi.');
      setLoading(false);
      return;
    }
    if (username.length < 3) {
      setError('Username minimal terdiri dari 3 karakter.');
      setLoading(false);
      return;
    }
    if (password.length < 4) {
      setError('Password minimal terdiri dari 4 karakter.');
      setLoading(false);
      return;
    }

    try {
      const data = await registerUserPostgres({
        username: username.trim(),
        email: email.trim() || `${username.trim()}@nusantara.app`,
        password: password,
        fullName: fullName.trim()
      });

      setSuccess('Pendaftaran berhasil! Mempersiapkan ruang kerja keuangan...');
      setTimeout(() => {
        onLoginSuccess({
          username: data.user.username,
          fullName: data.user.fullName,
          uid: data.user.id,
          isPremium: true
        }, dataChoice, true);
      }, 1200);
    } catch (err: any) {
      const rawMsg = err?.message || 'Pendaftaran ke database PostgreSQL gagal.';
      const cleanMsg = rawMsg.replace(/^\[Database Error\]\s*/i, '');
      if (cleanMsg.includes('terdaftar') || cleanMsg.toLowerCase().includes('already exist') || cleanMsg.toLowerCase().includes('unique') || cleanMsg.includes('23505') || cleanMsg.toLowerCase().includes('failed query')) {
        setError('Username atau Email sudah terdaftar dalam sistem.');
        setErrorDetails(`Username '${username.trim()}' atau Email sudah terpakai di database. Silakan langsung login.`);
        setErrorCode('SQL_UNIQUE_VIOLATION_23505');
      } else if (cleanMsg.toLowerCase().includes('koneksi') || cleanMsg.toLowerCase().includes('unreachable') || cleanMsg.toLowerCase().includes('failed to fetch')) {
        setError('Terjadi kendala koneksi ke database server.');
        setErrorDetails('Tidak dapat melakukan query pendaftaran ke PostgreSQL.');
        setErrorCode('DB_NETWORK_FAIL');
        setShowDiagnostic(true);
        runDiagnosticCheck();
      } else {
        setError(cleanMsg);
        setErrorDetails(err?.details || '');
        setErrorCode('DB_REG_ERROR');
      }
      refreshLogsAndDiagnostics();
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setErrorDetails('');
    setErrorCode('');
    setSuccess('');
    setResetResult(null);

    const cleanInput = forgotIdentifier.trim();
    if (!cleanInput) {
      setError('Masukkan Username atau Alamat Email Anda.');
      return;
    }

    setLoading(true);

    try {
      const res = await requestForgotPasswordPostgres(cleanInput);
      setSuccess('Instruksi pemulihan berhasil diproses.');
      setResetResult({
        message: res.message,
        resetLink: res.resetLink
      });
    } catch (err: any) {
      const rawMsg = err?.message || 'Gagal mengirim permintaan reset password.';
      setError(rawMsg);
      if (rawMsg.toLowerCase().includes('tidak terdaftar')) {
        setErrorDetails('Periksa kembali ejaan Username/Email yang Anda ketikkan.');
        setErrorCode('USER_NOT_FOUND');
      } else {
        setErrorCode('RESET_REQUEST_FAILED');
      }
      refreshLogsAndDiagnostics();
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setErrorDetails('');
    setShowDomainTroubleshoot(false);
    setSuccess('Menghubungkan ke Google Workspace...');
    try {
      const googleUser = await loginWithGoogleSheets();
      setSuccess('Masuk berhasil! Mengunduh data dari Cloud...');
      setTimeout(() => {
        onLoginSuccess(googleUser, 'empty', false);
      }, 1000);
    } catch (err: any) {
      setSuccess('');
      const errMsg = err?.message || '';
      if (
        errMsg.includes('auth/unauthorized-domain') || 
        errMsg.includes('unauthorized-domain') || 
        errMsg.includes('unauthorized') ||
        (err?.code && err.code.includes('unauthorized'))
      ) {
        setShowDomainTroubleshoot(true);
        setError('Firebase Error: auth/unauthorized-domain. Domain aplikasi ini belum di-whitelist di Firebase Console Anda.');
      } else {
        setError(errMsg || 'Gagal login via Google Sheets API.');
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 sm:p-6 md:p-8 relative overflow-hidden font-sans select-none">
      {/* Decorative Blur Background Circles */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-slate-800/80 backdrop-blur-xl border border-slate-700/60 rounded-2xl p-6 sm:p-8 shadow-2xl relative z-10 transition-all duration-300">
        
        {/* Brand logo header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-gradient-to-tr from-blue-600 to-blue-500 rounded-xl font-black text-white text-2xl shadow-lg shadow-blue-500/20 mb-3">
            N
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">Nusantara Wealth</h1>
          <p className="text-xs text-slate-400 mt-1 font-medium">Asisten & Jurnal Keuangan Mandiri Cerdas</p>
        </div>

        {/* Info alerts */}
        {error && (
          <div className="mb-5 bg-rose-500/10 border border-rose-500/30 rounded-xl p-3.5 flex items-start gap-2.5 text-xs text-rose-300 font-semibold animate-shake">
            <ShieldAlert className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-1.5 text-left w-full">
              <div className="flex items-center justify-between gap-2">
                <div className="font-bold text-rose-200">{error}</div>
                {errorCode && (
                  <span className="px-1.5 py-0.5 bg-rose-900/60 text-[9px] font-mono text-rose-300 rounded border border-rose-700/40 shrink-0">
                    {errorCode}
                  </span>
                )}
              </div>
              {errorDetails && (
                <div className="text-[10px] text-rose-300/80 font-normal leading-relaxed break-words">{errorDetails}</div>
              )}

              {/* Actionable PostgreSQL connection retry option */}
              <div className="pt-2 border-t border-rose-500/20 mt-2 space-y-1.5">
                <p className="text-[9.5px] text-slate-300 font-normal">
                  Pastikan database PostgreSQL aktif agar data selalu sinkron lintas komputer:
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setShowDiagnostic(true);
                    runDiagnosticCheck();
                  }}
                  className="w-full py-2 px-3 bg-blue-600/30 hover:bg-blue-600/50 active:scale-[0.98] text-blue-200 font-bold text-[10.5px] rounded-lg border border-blue-500/40 transition cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Uji Koneksi PostgreSQL Sekarang</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {success && (
          <div className="mb-5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3.5 flex items-start gap-2.5 text-xs text-emerald-300 font-semibold">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>{success}</span>
          </div>
        )}

        {isCloudAuth ? (
          <div className="space-y-4">
            <p className="text-xs text-slate-400 text-center mb-4">
              Silakan login dengan Google untuk sinkronisasi data keuangan Anda ke Google Sheets.
            </p>
            <button
              onClick={handleGoogleLogin}
              className="w-full bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs py-3 rounded-xl shadow-lg shadow-black/10 active:scale-[0.98] transition cursor-pointer flex items-center justify-center gap-3 border border-slate-200"
            >
              <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="h-5 w-5">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                <path fill="none" d="M0 0h48v48H0z"></path>
              </svg>
              Masuk dengan Google
            </button>

            {showDomainTroubleshoot && (
              <div className="p-4 bg-slate-900 border border-amber-500/30 rounded-xl space-y-3 text-left">
                <h4 className="text-[11px] font-black text-amber-400 uppercase tracking-wider">Cara Mengatasi Error Domain:</h4>
                <p className="text-[10px] text-slate-300 font-medium leading-relaxed">
                  Harap daftarkan domain preview Anda di Firebase Console agar Google Authentication diizinkan:
                </p>
                <div className="bg-slate-950 p-2.5 rounded border border-slate-800 font-mono text-[9.5px] text-slate-300 break-all space-y-1">
                  <div>1. <code className="text-blue-400 select-all">ais-dev-gh5cgroixcfjmwwirxvptn-136312410039.asia-southeast1.run.app</code></div>
                  <div>2. <code className="text-blue-400 select-all">ais-pre-gh5cgroixcfjmwwirxvptn-136312410039.asia-southeast1.run.app</code></div>
                </div>
                <p className="text-[10px] text-slate-400 leading-normal">
                  Masukkan domain tersebut ke bagian: <br />
                  <strong className="text-slate-300 font-bold">Firebase Console &gt; Authentication &gt; Settings &gt; Authorized Domains</strong>.
                </p>
                
                <button
                  onClick={() => {
                    setIsCloudAuth(false);
                    setError('');
                  }}
                  className="w-full text-center py-2.5 px-3 bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 font-black text-[10px] uppercase tracking-wider rounded-lg border border-blue-500/35 transition cursor-pointer"
                >
                  Masuk dengan Username &amp; Password
                </button>
              </div>
            )}

            <div className="pt-4 text-center">
              <button
                type="button"
                onClick={() => {
                  setIsCloudAuth(false);
                  setError('');
                }}
                className="text-[10px] text-blue-400 hover:text-blue-300 font-black uppercase tracking-wider cursor-pointer"
              >
                Gunakan Login PostgreSQL
              </button>
            </div>
          </div>
        ) : authMode === 'forgot' ? (
          /* FORGOT PASSWORD FORM */
          <div className="space-y-4">
            <div className="text-left mb-2">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('login');
                  setError('');
                  setErrorDetails('');
                  setSuccess('');
                }}
                className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 font-bold cursor-pointer mb-2"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Kembali ke Login
              </button>
              <h3 className="text-sm font-black text-white">Lupa Password Akun</h3>
              <p className="text-xs text-slate-400 mt-1">
                Masukkan Username atau Email terdaftar untuk mendapatkan tautan pemulihan password.
              </p>
            </div>

            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">
                  Username / Email Terdaftar
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input
                    type="text"
                    placeholder="e.g. ariesD atau aries@gmail.com"
                    value={forgotIdentifier}
                    onChange={(e) => setForgotIdentifier(e.target.value)}
                    className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 font-semibold"
                    required
                  />
                </div>
              </div>

              {resetResult && (
                <div className="p-3.5 bg-slate-900/80 border border-blue-500/30 rounded-xl space-y-2 text-left">
                  <div className="text-xs text-emerald-300 font-semibold flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    Permintaan Diterima Server!
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    {resetResult.message}
                  </p>
                  {resetResult.resetLink && (
                    <div className="bg-slate-950 p-2.5 rounded border border-slate-800 font-mono text-[10px] text-blue-300 break-all">
                      <span className="text-slate-400 font-sans text-[9px] block mb-1">Simulasi Tautan Reset Secure Token:</span>
                      <a href={resetResult.resetLink} target="_blank" rel="noreferrer" className="underline hover:text-blue-200">
                        {resetResult.resetLink}
                      </a>
                    </div>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white font-bold text-xs py-3 rounded-xl shadow-lg shadow-blue-600/10 hover:shadow-blue-500/20 active:scale-[0.98] transition cursor-pointer flex items-center justify-center gap-2"
              >
                {loading ? (
                  <Sparkles className="h-4 w-4 animate-spin text-white" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {loading ? 'Mengirim Instruksi...' : 'Kirim Tautan Reset Password'}
              </button>
            </form>
          </div>
        ) : (
          <>
            {/* Tab switcher for local auth */}
            <div className="grid grid-cols-2 bg-slate-900/60 p-1 rounded-xl border border-slate-700/40 mb-5">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('login');
                  setError('');
                  setErrorDetails('');
                  setSuccess('');
                }}
                className={`py-2 rounded-lg text-xs font-bold transition-all duration-200 cursor-pointer ${
                  authMode === 'login'
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Masuk (Login)
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode('register');
                  setError('');
                  setErrorDetails('');
                  setSuccess('');
                }}
                className={`py-2 rounded-lg text-xs font-bold transition-all duration-200 cursor-pointer ${
                  authMode === 'register'
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Daftar Baru
              </button>
            </div>

            {/* Forms */}
            <form onSubmit={authMode === 'register' ? handleRegisterLocal : handleLoginLocal} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">
                  {authMode === 'register' ? 'Username' : 'Username atau Email'}
                </label>
                <div className="relative">
                  <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input
                    type="text"
                    placeholder={authMode === 'register' ? "pilih username unik" : "masukkan username atau email"}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 font-semibold"
                    autoComplete="username"
                    required
                  />
                </div>
              </div>

              {authMode === 'register' && (
                <>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">Alamat Email</label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                      <input
                        type="email"
                        autoComplete="email"
                        placeholder="contoh@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 font-semibold"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">Nama Lengkap</label>
                    <div className="relative">
                      <Sparkles className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 animate-pulse" />
                      <input
                        type="text"
                        autoComplete="name"
                        placeholder="e.g. Ardian Santoso"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 font-semibold"
                        required
                      />
                    </div>
                  </div>
                </>
              )}

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider">Password</label>
                  {authMode === 'login' && (
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('forgot');
                        setForgotIdentifier(username);
                        setError('');
                        setErrorDetails('');
                      }}
                      className="text-[10px] text-blue-400 hover:text-blue-300 font-semibold cursor-pointer"
                    >
                      Lupa Password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl pl-10 pr-10 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 font-mono font-semibold"
                    autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 p-1 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Option choice for starting data if Registering */}
              {authMode === 'register' && (
                <div className="p-3.5 bg-slate-900/40 rounded-xl border border-slate-700/50 space-y-2 mt-2">
                  <span className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Opsi Mulai Data</span>
                  <div className="grid grid-cols-1 gap-2">
                    <label className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-slate-800/40 cursor-pointer">
                      <input
                        type="radio"
                        name="dataChoice"
                        checked={dataChoice === 'empty'}
                        onChange={() => setDataChoice('empty')}
                        className="mt-0.5 text-blue-500 focus:ring-0 focus:ring-offset-0"
                      />
                      <div className="text-left">
                        <span className="block text-[11px] font-bold text-white">Mulai dari Rp 0 (Fresh / Riil)</span>
                        <span className="block text-[9px] text-slate-400 leading-tight">Semua rekening disetel ke saldo 0 rupiah, siap diisi data keuangan riil Anda.</span>
                      </div>
                    </label>
                    <label className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-slate-800/40 cursor-pointer">
                      <input
                        type="radio"
                        name="dataChoice"
                        checked={dataChoice === 'sample'}
                        onChange={() => setDataChoice('sample')}
                        className="mt-0.5 text-blue-500 focus:ring-0 focus:ring-offset-0"
                      />
                      <div className="text-left">
                        <span className="block text-[11px] font-bold text-white">Gunakan Data Contoh (Ujicoba)</span>
                        <span className="block text-[9px] text-slate-400 leading-tight">Gunakan data transaksi simulasi awal untuk mempelajari fitur aplikasi.</span>
                      </div>
                    </label>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white font-bold text-xs py-3 rounded-xl shadow-lg shadow-blue-600/10 hover:shadow-blue-500/20 active:scale-[0.98] transition cursor-pointer flex items-center justify-center gap-2 mt-2"
              >
                {loading ? (
                  <Sparkles className="h-4 w-4 animate-spin text-white" />
                ) : authMode === 'register' ? (
                  <UserPlus className="h-4 w-4" />
                ) : (
                  <Key className="h-4 w-4" />
                )}
                {loading ? 'Memproses Authentikasi...' : authMode === 'register' ? 'Buat Akun' : 'Masuk'}
              </button>
            </form>
          </>
        )}

        {/* Security assurance */}
        <div className="mt-4 pt-3 flex items-center justify-center gap-2 text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
          <Shield className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
          <span>Keamanan Enkripsi Sandbox Lokal</span>
        </div>
      </div>
    </div>
  );
}

