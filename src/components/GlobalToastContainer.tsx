import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';
import { ToastItem, subscribeToasts, removeToast } from '../utils/toast';

export const GlobalToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const unsubscribe = subscribeToasts((updatedToasts) => {
      setToasts(updatedToasts);
    });
    return unsubscribe;
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm sm:max-w-md w-full px-3 pointer-events-none">
      {toasts.map((toast) => {
        let bgColor = 'bg-slate-900/95 border-slate-700 text-slate-100';
        let IconComponent = Info;
        let iconColor = 'text-blue-400';

        if (toast.type === 'success') {
          bgColor = 'bg-slate-900/95 border-emerald-500/50 text-slate-100 shadow-emerald-950/20';
          IconComponent = CheckCircle2;
          iconColor = 'text-emerald-400';
        } else if (toast.type === 'error') {
          bgColor = 'bg-slate-900/95 border-rose-500/60 text-slate-100 shadow-rose-950/20';
          IconComponent = AlertCircle;
          iconColor = 'text-rose-400';
        } else if (toast.type === 'warning') {
          bgColor = 'bg-slate-900/95 border-amber-500/50 text-slate-100 shadow-amber-950/20';
          IconComponent = AlertTriangle;
          iconColor = 'text-amber-400';
        }

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl border backdrop-blur-md shadow-lg transition-all transform animate-slide-in ${bgColor}`}
          >
            <IconComponent className={`h-5 w-5 shrink-0 mt-0.5 ${iconColor}`} />
            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-bold leading-snug tracking-tight text-white">{toast.title}</h4>
              {toast.message && (
                <p className="text-[11px] font-medium text-slate-300 mt-0.5 leading-relaxed break-words">
                  {toast.message}
                </p>
              )}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition shrink-0 cursor-pointer"
              title="Tutup Notifikasi"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
