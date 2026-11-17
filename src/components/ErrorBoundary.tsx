import * as React from 'react';
import { AlertTriangle, RotateCcw, ShieldAlert } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public override render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 bg-rose-50/80 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 rounded-2xl shadow-sm space-y-4 my-4 animate-fadeIn">
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 bg-rose-600 text-white rounded-xl shadow-xs shrink-0 mt-0.5">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div className="space-y-1 min-w-0 flex-1">
              <h3 className="font-extrabold text-slate-800 dark:text-slate-100 text-sm sm:text-base">
                {this.props.fallbackTitle || 'Penanganan Anomali Tampilan UI'}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 font-medium leading-relaxed">
                Terjadi kesalahan teknis saat memproses struktur hirarki data atau pemetaan node pada komponen ini. Sistem telah mengisolasi area terdampak sehingga antarmuka utama aplikasi tetap berjalan stabil.
              </p>
            </div>
          </div>

          {this.state.error && (
            <div className="p-3 bg-slate-900 text-slate-200 rounded-xl font-mono text-[11px] overflow-x-auto border border-slate-800 space-y-1">
              <div className="text-rose-400 font-bold flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>Error Detail: {this.state.error.message}</span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-rose-100 dark:border-rose-900/40">
            <button
              type="button"
              onClick={this.handleReset}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs rounded-xl shadow-xs transition cursor-pointer flex items-center gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Muat Ulang Komponen</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
