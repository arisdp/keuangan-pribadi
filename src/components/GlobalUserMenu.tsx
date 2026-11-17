import React from 'react';
import { LogOut } from 'lucide-react';
import { User } from '../types';

interface GlobalUserMenuProps {
  currentUser: User;
  onLogout: () => void;
}

export const GlobalUserMenu: React.FC<GlobalUserMenuProps> = ({ currentUser, onLogout }) => {
  const initial = currentUser?.fullName ? currentUser.fullName.charAt(0).toUpperCase() : 'U';

  return (
    <div className="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-700 shrink-0">
      <div
        className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-100/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700"
        title={`Masuk sebagai ${currentUser?.fullName || 'Pengguna'} (@${currentUser?.username || 'user'})`}
      >
        <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-white font-extrabold text-[11px] shrink-0">
          {initial}
        </div>
        <div className="leading-tight max-w-[130px]">
          <p className="text-[11px] font-bold text-slate-800 dark:text-slate-100 truncate">
            {currentUser?.fullName || 'Pengguna'}
          </p>
          <p className="text-[9px] font-semibold text-slate-500 dark:text-slate-400 truncate">
            @{currentUser?.username || 'user'}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={onLogout}
        className="px-2.5 py-1.5 text-rose-600 dark:text-rose-400 hover:text-white hover:bg-rose-600 border border-rose-200 dark:border-rose-800/60 rounded-lg transition cursor-pointer bg-rose-50/70 dark:bg-rose-950/30 flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider"
        title="Keluar (Logout)"
      >
        <LogOut className="h-3.5 w-3.5 shrink-0" />
        <span className="hidden md:inline">Keluar</span>
      </button>
    </div>
  );
};
