import React, { useState, useEffect, useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  CartesianGrid,
} from 'recharts';
import {
  CategoryNode,
  flattenCategoryHierarchy,
  addCategoryNode,
  deleteCategoryNode,
  renameCategoryNode,
  findCategoryNode,
} from '../categoryHierarchy';
import { Account, Transaction } from '../types';
import { D3CoaInteractiveTree } from './D3CoaInteractiveTree';
import { ErrorBoundary } from './ErrorBoundary';
import { SchemaDebugModal } from './SchemaDebugModal';
import { DatabaseDiagnostics } from './DatabaseDiagnostics';
import { DatabaseSchemaFixer } from './DatabaseSchemaFixer';
import {
  AccountCOA,
  DEFAULT_COA_LIST,
  getStoredCoaList,
  saveStoredCoaList,
  getAccountCoaMapping,
  synchronizeAccountsAndCOA,
  CoaSyncReport,
  addMasterChangeLog,
  getMasterChangeLogs,
  factoryResetMasterData,
  MasterChangeLog,
} from '../coaUtils';
export { DEFAULT_COA_LIST };
export type { AccountCOA };
import {
  Database,
  FolderTree,
  Plus,
  Trash2,
  ChevronRight,
  ChevronDown,
  Search,
  Tag,
  Layers,
  Check,
  RotateCcw,
  Pencil,
  X,
  CreditCard,
  Building2,
  Wallet,
  Banknote,
  ShieldCheck,
  ArrowRightLeft,
  CheckCircle2,
  Info,
  BookOpen,
  Filter,
  AlertTriangle,
  BarChart3,
  Activity,
  Archive,
  Zap,
  Sparkles,
  RefreshCw,
  PieChart,
  ArrowRight,
  MinusCircle,
  XCircle,
  Shield,
  Download,
  Upload,
  History,
  CheckSquare,
  Square,
  ListFilter,
} from 'lucide-react';

interface MasterCategoryManagerProps {
  categories: CategoryNode[];
  accounts?: Account[];
  transactions?: Transaction[];
  onUpdateCategories: (newCategories: CategoryNode[]) => void;
  onResetToDefault: () => void;
  onBulkMoveTransactions?: (sourceCategories: string[], targetCategory: string) => void;
  onReassignTransactionCategory?: (txId: string, newCategory: string) => void;
  onOpenBackupModal?: () => void;
  onUpdateAccounts?: (updatedAccounts: Account[]) => void;
  onFactoryReset?: () => void;
}

// Helper to collect all category names in a node subtree
const getAllCategoryNamesInNode = (node: CategoryNode): string[] => {
  let names = [node.name];
  if (node.children) {
    node.children.forEach((c) => {
      names = names.concat(getAllCategoryNamesInNode(c));
    });
  }
  return names;
};

// Helper to flatten all selectable category names for bulk transfer target dropdown
const getFlatCategoryList = (nodes: CategoryNode[]): string[] => {
  let list: string[] = [];
  nodes.forEach((n) => {
    if (n.type !== 'type') {
      list.push(n.name);
    }
    if (n.children && n.children.length > 0) {
      list = list.concat(getFlatCategoryList(n.children));
    }
  });
  return Array.from(new Set(list));
};

// Visual Tree Component showing COA -> Accounts hierarchy
const CoaAccountTreeVisual: React.FC<{
  coaList?: AccountCOA[];
  accounts?: Account[];
  onUpdateAccounts?: (updatedAccounts: Account[]) => void;
}> = ({ coaList = [], accounts = [], onUpdateAccounts }) => {
  const safeCoaList = Array.isArray(coaList) ? coaList : [];
  const safeAccounts = Array.isArray(accounts) ? accounts : [];

  const categories = [
    { key: 'Asset', name: '1000 - ASET (Aktiva Lancar, Kas & Bank)', badgeBg: 'bg-emerald-600 text-white', border: 'border-emerald-200 bg-emerald-50/30 dark:bg-emerald-950/20 dark:border-emerald-900' },
    { key: 'Liability', name: '2000 - KEWAJIBAN (Utang Kartu Kredit & Pinjaman)', badgeBg: 'bg-rose-600 text-white', border: 'border-rose-200 bg-rose-50/30 dark:bg-rose-950/20 dark:border-rose-900' },
    { key: 'Equity', name: '3000 - EKUITAS (Modal & Saldo Awal)', badgeBg: 'bg-purple-600 text-white', border: 'border-purple-200 bg-purple-50/30 dark:bg-purple-950/20 dark:border-purple-900' },
    { key: 'Income', name: '4000 - PENDAPATAN (Hasil Penjualan & Gaji)', badgeBg: 'bg-blue-600 text-white', border: 'border-blue-200 bg-blue-50/30 dark:bg-blue-950/20 dark:border-blue-900' },
    { key: 'Expense', name: '5000 - BEBAN & PENGELUARAN OPERASIONAL', badgeBg: 'bg-amber-600 text-white', border: 'border-amber-200 bg-amber-50/30 dark:bg-amber-950/20 dark:border-amber-900' },
  ];

  return (
    <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-6 animate-fadeIn">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div>
          <h3 className="font-extrabold text-slate-800 dark:text-slate-100 text-base flex items-center gap-2">
            <FolderTree className="h-5 w-5 text-blue-600" />
            <span>Pohon Visualisasi Hierarki Relasi COA & Akun Rekening</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
            Menampilkan hubungan bertingkat dari Kategori COA Utama ➔ Kode Perkiraan COA ➔ Akun Rekening Keuangan secara visual.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {categories.map((cat) => {
          const coasInCategory = safeCoaList.filter((c) => c && c.category === cat.key);
          return (
            <div key={cat.key} className={`border rounded-2xl p-4 space-y-3.5 ${cat.border}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-1 text-xs font-black rounded-lg shadow-xs ${cat.badgeBg}`}>
                    {cat.key}
                  </span>
                  <h4 className="font-black text-slate-800 dark:text-slate-200 text-sm">{cat.name}</h4>
                </div>
                <span className="text-xs font-extrabold text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
                  {coasInCategory.length} Kode COA
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                {coasInCategory.map((coa) => {
                  if (!coa || !coa.code) return null;
                  const linkedAccounts = safeAccounts.filter((a) => {
                    if (!a) return false;
                    try {
                      const mapping = getAccountCoaMapping(a, safeCoaList);
                      return mapping && mapping.code === coa.code;
                    } catch (err) {
                      return false;
                    }
                  });

                  return (
                    <div
                      key={coa.code}
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 space-y-2.5 shadow-xs"
                    >
                      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono font-black text-xs bg-slate-900 dark:bg-blue-600 text-white px-2 py-0.5 rounded shrink-0">
                            {coa.code}
                          </span>
                          <span className="font-extrabold text-slate-800 dark:text-slate-100 text-xs truncate">
                            {coa.name || 'Tanpa Nama COA'}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono font-bold text-slate-400 uppercase shrink-0">
                          {coa.normalBalance || 'Debet'}
                        </span>
                      </div>

                      {/* Linked Accounts under this COA */}
                      <div className="space-y-1.5 pt-1">
                        <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          <span>Akun Rekening Terhubung ({linkedAccounts.length})</span>
                          {linkedAccounts.length === 0 && (
                            <span className="text-amber-600 dark:text-amber-400 font-bold text-[9px]">Belum Ada Rekening</span>
                          )}
                        </div>

                        {linkedAccounts.length > 0 ? (
                          <div className="space-y-1.5">
                            {linkedAccounts.map((acc) => (
                              <div
                                key={acc.id || Math.random()}
                                className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-lg p-2 text-xs"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className="p-1 bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 rounded shrink-0">
                                    <Wallet className="h-3.5 w-3.5" />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="font-extrabold text-slate-800 dark:text-slate-200 text-xs truncate">
                                      {acc.name || 'Rekening Unnamed'}
                                    </p>
                                    <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                                      {acc.accountNumber ? `No: ${acc.accountNumber}` : acc.type || 'Akun'}
                                    </p>
                                  </div>
                                </div>
                                <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 rounded">
                                  Rp {((acc as any).balance || 0).toLocaleString('id-ID')}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="p-2.5 bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-200 dark:border-slate-700 rounded-lg text-center text-[11px] text-slate-400 font-medium italic">
                            Tidak ada akun rekening yang merujuk ke COA {coa.code}.
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Log Riwayat Change Tracker Component
const MasterChangeLogTable: React.FC<{
  logs: MasterChangeLog[];
}> = ({ logs }) => {
  const [filterAction, setFilterAction] = useState<string>('ALL');
  const [search, setSearch] = useState<string>('');

  const filteredLogs = logs.filter((log) => {
    if (filterAction !== 'ALL' && log.action !== filterAction) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        log.targetName.toLowerCase().includes(q) ||
        log.details.toLowerCase().includes(q) ||
        log.targetType.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4 animate-fadeIn">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div>
          <h3 className="font-extrabold text-slate-800 dark:text-slate-100 text-base flex items-center gap-2">
            <History className="h-5 w-5 text-blue-600" />
            <span>Log Riwayat Perubahan Master Data (Audit Trail)</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
            Melacak setiap modifikasi pada Master COA, Master Kategori, dan Akun Rekening secara transparan.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 focus:outline-none"
          >
            <option value="ALL">Semua Jenis Aksi</option>
            <option value="CREATE">CREATE (Tambah)</option>
            <option value="UPDATE">UPDATE (Ubah/Edit)</option>
            <option value="DELETE">DELETE (Hapus)</option>
            <option value="RECONCILE">RECONCILE (Rekonsiliasi)</option>
            <option value="SYNC">SYNC (Sinkronisasi)</option>
          </select>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-slate-400" />
        <input
          type="text"
          placeholder="Cari dalam log riwayat..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-4 py-2 text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
            <tr>
              <th className="py-3 px-4">Waktu Modifikasi</th>
              <th className="py-3 px-4">Tipe Master</th>
              <th className="py-3 px-4">Nama Target</th>
              <th className="py-3 px-4">Jenis Aksi</th>
              <th className="py-3 px-4">Rincian Perubahan</th>
              <th className="py-3 px-4">Diubah Oleh</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium text-slate-700 dark:text-slate-300">
            {filteredLogs.length > 0 ? (
              filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                  <td className="py-3 px-4 font-mono text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleString('id-ID')}
                  </td>
                  <td className="py-3 px-4 font-bold text-slate-800 dark:text-slate-200">
                    <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-[10px] border border-slate-200 dark:border-slate-700">
                      {log.targetType}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-black text-slate-900 dark:text-white">{log.targetName}</td>
                  <td className="py-3 px-4">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-black ${
                        log.action === 'CREATE'
                          ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300'
                          : log.action === 'UPDATE'
                          ? 'bg-blue-100 dark:bg-blue-950/80 text-blue-800 dark:text-blue-300'
                          : log.action === 'DELETE'
                          ? 'bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300'
                          : log.action === 'RECONCILE'
                          ? 'bg-purple-100 dark:bg-purple-950/80 text-purple-800 dark:text-purple-300'
                          : 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300'
                      }`}
                    >
                      {log.action}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-300 text-[11px]">{log.details}</td>
                  <td className="py-3 px-4 text-slate-400 font-mono text-[10px]">{(log as any).performedBy || 'System'}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-400 font-medium text-xs">
                  Belum ada catatan log perubahan master data.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const MasterCategoryManager: React.FC<MasterCategoryManagerProps> = ({
  categories,
  accounts = [],
  transactions = [],
  onUpdateCategories,
  onResetToDefault,
  onBulkMoveTransactions,
  onReassignTransactionCategory,
  onOpenBackupModal,
  onUpdateAccounts,
  onFactoryReset,
}) => {
  // Main Tab State: 'hierarchy' | 'coa' | 'tree-view' | 'd3-tree' | 'logs' | 'db-diagnostics'
  const [activeSubTab, setActiveSubTab] = useState<'hierarchy' | 'coa' | 'tree-view' | 'd3-tree' | 'logs' | 'db-diagnostics'>('hierarchy');
  const [showSchemaDebugModal, setShowSchemaDebugModal] = useState<boolean>(false);

  // Bulk Accounts Selection state
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [bulkTargetCoaCode, setBulkTargetCoaCode] = useState<string>('1200');
  const [bulkSuccessMsg, setBulkSuccessMsg] = useState<string | null>(null);

  // Change Logs state
  const [changeLogs, setChangeLogs] = useState<MasterChangeLog[]>([]);
  const [logSearchQuery, setLogSearchQuery] = useState<string>('');
  const [logActionFilter, setLogActionFilter] = useState<string>('ALL');

  useEffect(() => {
    setChangeLogs(getMasterChangeLogs());
  }, [activeSubTab]);

  const [searchQuery, setSearchQuery] = useState('');
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({
    'type-equity': true,
    'type-income': true,
    'type-expense': true,
    'grp-pendapatan-tetap': true,
    'grp-pendapatan-tidak-tetap': true,
    'grp-kebutuhan-rumah-tangga': true,
    'grp-bank-finansial': true,
    'grp-pengeluaran-lainnya': true,
  });

  // COA List state with LocalStorage persistence
  const [coaList, setCoaList] = useState<AccountCOA[]>(() => {
    try {
      const saved = localStorage.getItem('app_coa_list');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (err) {
      console.error('Failed to load COA list from localStorage:', err);
    }
    return DEFAULT_COA_LIST;
  });

  useEffect(() => {
    try {
      localStorage.setItem('app_coa_list', JSON.stringify(coaList));
    } catch (err) {
      console.error('Failed to save COA list to localStorage:', err);
    }
  }, [coaList]);

  const [coaSearchQuery, setCoaSearchQuery] = useState('');

  // Add COA State
  const [showAddCoaModal, setShowAddCoaModal] = useState(false);
  const [newCoaCode, setNewCoaCode] = useState('');
  const [newCoaName, setNewCoaName] = useState('');
  const [newCoaCategory, setNewCoaCategory] = useState<'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense'>('Expense');
  const [newCoaBalance, setNewCoaBalance] = useState<'Debet' | 'Kredit'>('Debet');
  const [newCoaDesc, setNewCoaDesc] = useState('');

  // Edit COA State
  const [editingCoa, setEditingCoa] = useState<AccountCOA | null>(null);
  const [editCoaCode, setEditCoaCode] = useState('');
  const [editCoaName, setEditCoaName] = useState('');
  const [editCoaCategory, setEditCoaCategory] = useState<'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense'>('Expense');
  const [editCoaBalance, setEditCoaBalance] = useState<'Debet' | 'Kredit'>('Debet');
  const [editCoaDesc, setEditCoaDesc] = useState('');

  const startEditCoa = (item: AccountCOA) => {
    setEditingCoa(item);
    setEditCoaCode(item.code);
    setEditCoaName(item.name);
    setEditCoaCategory(item.category);
    setEditCoaBalance(item.normalBalance);
    setEditCoaDesc(item.description);
  };

  const handleEditCoaSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCoa || !editCoaCode.trim() || !editCoaName.trim()) return;

    if (
      editCoaCode.trim() !== editingCoa.code &&
      coaList.some((c) => c.code === editCoaCode.trim())
    ) {
      alert(`Kode perkiraan akun "${editCoaCode}" sudah digunakan oleh akun lain.`);
      return;
    }

    const updatedItem: AccountCOA = {
      code: editCoaCode.trim(),
      name: editCoaName.trim(),
      category: editCoaCategory,
      normalBalance: editCoaBalance,
      description: editCoaDesc.trim(),
    };

    setCoaList((prev) =>
      prev
        .map((c) => (c.code === editingCoa.code ? updatedItem : c))
        .sort((a, b) => a.code.localeCompare(b.code))
    );

    addMasterChangeLog(
      'COA',
      updatedItem.name,
      'UPDATE',
      `Master COA [${editingCoa.code} - ${editingCoa.name}] diperbarui menjadi [${updatedItem.code} - ${updatedItem.name}]`,
      'User Admin'
    );

    setEditingCoa(null);
  };

  const handleDeleteCoa = (code: string, name: string) => {
    if (confirm(`Apakah Anda yakin ingin menghapus Kode COA "${code} - ${name}"?`)) {
      setCoaList((prev) => prev.filter((c) => c.code !== code));
      addMasterChangeLog(
        'COA',
        name,
        'DELETE',
        `Master COA [${code} - ${name}] dihapus dari hirarki COA.`,
        'User Admin'
      );
    }
  };

  const handleResetCoaToDefault = () => {
    if (confirm('Apakah Anda yakin ingin mengembalikan seluruh daftar COA ke susunan standar awal bawaan?')) {
      setCoaList(DEFAULT_COA_LIST);
      localStorage.removeItem('app_coa_list');
      addMasterChangeLog(
        'COA',
        'System Default COA',
        'SYNC',
        'Seluruh susunan COA dikembalikan ke standar awal sistem.',
        'User Admin'
      );
    }
  };

  // Status filter state: 'all' | 'active' | 'inactive'
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Collapsible Advanced Reset Danger Zone state
  const [showAdvancedDangerZone, setShowAdvancedDangerZone] = useState<boolean>(false);

  // Bar chart metric toggle: 'count' (Jumlah Transaksi) vs 'amount' (Nominal Rp)
  const [chartMetric, setChartMetric] = useState<'count' | 'amount'>('count');

  // Bulk Move Modal State
  const [bulkMoveModalState, setBulkMoveModalState] = useState<{
    isOpen: boolean;
    actionType: 'delete' | 'rename';
    nodeId: string;
    nodeName: string;
    sourceCategoryNames: string[];
    linkedCount: number;
    sampleTxDesc: string;
    targetCategory: string;
  }>({
    isOpen: false,
    actionType: 'delete',
    nodeId: '',
    nodeName: '',
    sourceCategoryNames: [],
    linkedCount: 0,
    sampleTxDesc: '',
    targetCategory: '',
  });

  // Modal / Form state for adding new category
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedParentId, setSelectedParentId] = useState<string>('type-expense');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryType, setNewCategoryType] = useState<'group' | 'subgroup' | 'item'>('item');

  // Rename state
  const [renamingNodeId, setRenamingNodeId] = useState<string | null>(null);
  const [renamingNodeValue, setRenamingNodeValue] = useState('');

  // Flat list of all selectable category names
  const allCategoryNames = useMemo(() => getFlatCategoryList(categories), [categories]);

  // Transaction distribution summary for Bar Chart
  const categoryStats = useMemo(() => {
    const map: Record<string, { name: string; count: number; totalAmount: number }> = {};

    transactions.forEach((tx) => {
      const cat = tx.category || 'Lain-lain';
      if (!map[cat]) {
        map[cat] = { name: cat, count: 0, totalAmount: 0 };
      }
      map[cat].count += 1;
      map[cat].totalAmount += Math.abs(tx.amount || 0);
    });

    const list = Object.values(map);
    if (chartMetric === 'count') {
      list.sort((a, b) => b.count - a.count);
    } else {
      list.sort((a, b) => b.totalAmount - a.totalAmount);
    }
    return list;
  }, [transactions, chartMetric]);

  const totalTransactionsCount = useMemo(() => transactions.length, [transactions]);

  // Active vs Inactive category counts
  const { activeCategoriesCount, inactiveCategoriesCount } = useMemo(() => {
    let active = 0;
    let inactive = 0;

    allCategoryNames.forEach((catName) => {
      const hasTx = transactions.some((t) => t.category === catName);
      if (hasTx) active++;
      else inactive++;
    });

    return { activeCategoriesCount: active, inactiveCategoriesCount: inactive };
  }, [allCategoryNames, transactions]);

  const toggleExpand = (id: string) => {
    setExpandedNodes((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const expandAll = () => {
    const allIds: Record<string, boolean> = {};
    const traverse = (nodes: CategoryNode[]) => {
      nodes.forEach((n) => {
        allIds[n.id] = true;
        if (n.children) traverse(n.children);
      });
    };
    traverse(categories);
    setExpandedNodes(allIds);
  };

  const collapseAll = () => {
    setExpandedNodes({
      'type-equity': true,
      'type-income': true,
      'type-expense': true,
    });
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim() || !selectedParentId) return;

    const updated = addCategoryNode(categories, selectedParentId, newCategoryName, newCategoryType);
    onUpdateCategories(updated);

    // Expand parent node
    setExpandedNodes((prev) => ({ ...prev, [selectedParentId]: true }));

    setNewCategoryName('');
    setShowAddModal(false);
  };

  // Delete category validation check with Bulk Move capability
  const handleDelete = (id: string, name: string) => {
    if (id.startsWith('type-')) {
      alert('Kelompok Utama (Ekuitas, Pendapatan, Pengeluaran) tidak dapat dihapus.');
      return;
    }

    const node = findCategoryNode(categories, id);
    if (node) {
      const categoryNames = getAllCategoryNamesInNode(node);
      const linkedTxs = transactions.filter((t) => categoryNames.includes(t.category));
      if (linkedTxs.length > 0) {
        const availableTargets = allCategoryNames.filter((c) => !categoryNames.includes(c));
        setBulkMoveModalState({
          isOpen: true,
          actionType: 'delete',
          nodeId: id,
          nodeName: name,
          sourceCategoryNames: categoryNames,
          linkedCount: linkedTxs.length,
          sampleTxDesc: `${linkedTxs[0].description || linkedTxs[0].category} (Rp ${Math.abs(linkedTxs[0].amount).toLocaleString('id-ID')})`,
          targetCategory: availableTargets[0] || 'Beban Operasional Lainnya',
        });
        return;
      }
    }

    if (confirm(`Apakah Anda yakin ingin menghapus kategori "${name}"?`)) {
      const updated = deleteCategoryNode(categories, id);
      onUpdateCategories(updated);
    }
  };

  // Rename category validation check with Bulk Move capability
  const startRename = (node: CategoryNode) => {
    if (node.type === 'type') {
      alert('Kelompok Utama (Ekuitas, Pendapatan, Pengeluaran) tidak dapat diubah namanya.');
      return;
    }

    const categoryNames = getAllCategoryNamesInNode(node);
    const linkedTxs = transactions.filter((t) => categoryNames.includes(t.category));
    if (linkedTxs.length > 0) {
      const availableTargets = allCategoryNames.filter((c) => !categoryNames.includes(c));
      setBulkMoveModalState({
        isOpen: true,
        actionType: 'rename',
        nodeId: node.id,
        nodeName: node.name,
        sourceCategoryNames: categoryNames,
        linkedCount: linkedTxs.length,
        sampleTxDesc: `${linkedTxs[0].description || linkedTxs[0].category} (Rp ${Math.abs(linkedTxs[0].amount).toLocaleString('id-ID')})`,
        targetCategory: availableTargets[0] || 'Beban Operasional Lainnya',
      });
      return;
    }

    setRenamingNodeId(node.id);
    setRenamingNodeValue(node.name);
  };

  // Execute Bulk Move & Category Action
  const executeBulkMoveAndAction = () => {
    if (!bulkMoveModalState.targetCategory) {
      alert('Silakan pilih kategori tujuan pemindahan.');
      return;
    }

    // 1. Move all transactions to target category
    if (onBulkMoveTransactions && bulkMoveModalState.sourceCategoryNames.length > 0) {
      onBulkMoveTransactions(bulkMoveModalState.sourceCategoryNames, bulkMoveModalState.targetCategory);
    }

    // 2. Perform delete or rename
    if (bulkMoveModalState.actionType === 'delete') {
      const updated = deleteCategoryNode(categories, bulkMoveModalState.nodeId);
      onUpdateCategories(updated);
    } else if (bulkMoveModalState.actionType === 'rename') {
      setRenamingNodeId(bulkMoveModalState.nodeId);
      setRenamingNodeValue(bulkMoveModalState.nodeName);
    }

    setBulkMoveModalState((prev) => ({ ...prev, isOpen: false }));
  };

  const submitRename = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!renamingNodeId || !renamingNodeValue.trim()) {
      setRenamingNodeId(null);
      return;
    }
    const updated = renameCategoryNode(categories, renamingNodeId, renamingNodeValue);
    onUpdateCategories(updated);
    setRenamingNodeId(null);
    setRenamingNodeValue('');
  };

  const cancelRename = () => {
    setRenamingNodeId(null);
    setRenamingNodeValue('');
  };

  const handleAddCoaSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCoaCode.trim() || !newCoaName.trim()) return;

    if (coaList.some((c) => c.code === newCoaCode.trim())) {
      alert(`Kode perkiraan akun "${newCoaCode}" sudah digunakan.`);
      return;
    }

    const newItem: AccountCOA = {
      code: newCoaCode.trim(),
      name: newCoaName.trim(),
      category: newCoaCategory,
      normalBalance: newCoaBalance,
      description: newCoaDesc.trim() || 'Custom COA Account',
    };

    setCoaList((prev) => [...prev, newItem].sort((a, b) => a.code.localeCompare(b.code)));

    addMasterChangeLog(
      'COA',
      newItem.name,
      'CREATE',
      `Menambahkan kode COA baru [${newItem.code} - ${newItem.name}] (${newItem.category})`,
      'User Admin'
    );

    setShowAddCoaModal(false);
    setNewCoaCode('');
    setNewCoaName('');
    setNewCoaDesc('');
  };

  const flatCategories = flattenCategoryHierarchy(categories);

  // Manual COA Sync Report Modal State
  const [syncReportModal, setSyncReportModal] = useState<{
    isOpen: boolean;
    report: CoaSyncReport | null;
  }>({
    isOpen: false,
    report: null,
  });

  const handleTriggerManualSync = () => {
    const { updatedCoaList, report } = synchronizeAccountsAndCOA(accounts, coaList);
    setCoaList(updatedCoaList);

    addMasterChangeLog(
      'COA',
      'Master Account & COA Sync',
      'SYNC',
      `Sinkronisasi manual berhasil dieksekusi: ${report.missingCoaAdded.length} COA dasar dipulihkan, ${report.totalAccountsProcessed} akun terhubung sempurna.`,
      'User Admin'
    );

    setSyncReportModal({
      isOpen: true,
      report,
    });
  };

  // Helper to get auto-mapped COA for an account dynamically from current coaList
  const getAccountCoaMappingLocal = (acc: Account) => getAccountCoaMapping(acc, coaList);

  // Bulk Account Selection Handlers
  const handleToggleSelectAccount = (id: string) => {
    setSelectedAccountIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllAccounts = () => {
    if (selectedAccountIds.length === accounts.length) {
      setSelectedAccountIds([]);
    } else {
      setSelectedAccountIds(accounts.map((acc) => acc.id));
    }
  };

  const handleExecuteBulkAccountReassign = () => {
    if (selectedAccountIds.length === 0) return;
    const targetCoa = coaList.find((c) => c.code === bulkTargetCoaCode);
    const updated = accounts.map((acc) => {
      if (selectedAccountIds.includes(acc.id)) {
        return { ...acc, coaCode: bulkTargetCoaCode };
      }
      return acc;
    });

    if (onUpdateAccounts) {
      onUpdateAccounts(updated);
    }

    addMasterChangeLog(
      'Account',
      `Pembersihan Massal (${selectedAccountIds.length} Akun)`,
      'UPDATE',
      `Pembersihan massal: ${selectedAccountIds.length} akun dipindahkan ke COA [${bulkTargetCoaCode} - ${targetCoa ? targetCoa.name : ''}]`,
      'User Admin'
    );

    setBulkSuccessMsg(
      `Pembersihan massal berhasil! ${selectedAccountIds.length} akun rekening berhasil dipindahkan ke COA [${bulkTargetCoaCode}].`
    );
    setSelectedAccountIds([]);
    setChangeLogs(getMasterChangeLogs());
    setTimeout(() => setBulkSuccessMsg(null), 5000);
  };

  const handleFactoryResetAll = () => {
    if (
      confirm(
        'APAKAH ANDA YAKIN INGIN MERESET SELURUH MASTER DATA KE STANDAR DEFAULT PABRIK?\n\nTindakan ini akan mengembalikan Master COA dan Master Akun Rekening ke struktur awal teratur yang 100% bebas dari kesalahan atau duplikasi.'
      )
    ) {
      if (onFactoryReset) {
        onFactoryReset();
      } else {
        const { resetCoaList } = factoryResetMasterData();
        setCoaList(resetCoaList);
        onResetToDefault();
      }
      setCoaList(DEFAULT_COA_LIST);
      setChangeLogs(getMasterChangeLogs());
      alert('Master Data berhasil di-reset ke standar default awal pabrik!');
    }
  };

  // Render Category Tree recursively
  const renderTreeNodes = (nodes: CategoryNode[], depth = 0): (React.ReactNode | null)[] => {
    return nodes.map((node) => {
      const hasChildren = Boolean(node.children && node.children.length > 0);
      const isExpanded = Boolean(expandedNodes[node.id]);
      const isRenaming = renamingNodeId === node.id;

      const categoryNames = getAllCategoryNamesInNode(node);
      const linkedCount = transactions.filter((t) => categoryNames.includes(t.category)).length;

      // Status Filter check:
      // 'active': keep node if linkedCount > 0 or node.type === 'type' (structural root)
      // 'inactive': keep node if linkedCount === 0 and node.type !== 'type'
      if (statusFilter === 'active' && linkedCount === 0 && node.type !== 'type') {
        return null;
      }
      if (statusFilter === 'inactive' && linkedCount > 0 && node.type !== 'type') {
        return null;
      }

      // Recursive search check across entire subtree
      const queryLower = searchQuery.trim().toLowerCase();
      const subtreeMatches = !queryLower || categoryNames.some((n) => n.toLowerCase().includes(queryLower));

      if (!subtreeMatches) return null;

      let badgeBg = 'bg-slate-100 text-slate-700';
      let typeLabel = 'Sub-Kategori';
      if (node.type === 'type') {
        badgeBg = 'bg-blue-100 text-blue-800 font-extrabold';
        typeLabel = 'Tipe Utama';
      } else if (node.type === 'group') {
        badgeBg = 'bg-emerald-100 text-emerald-800 font-bold';
        typeLabel = 'Kelompok Kategori';
      } else if (node.type === 'subgroup') {
        badgeBg = 'bg-amber-100 text-amber-800 font-semibold';
        typeLabel = 'Sub Kelompok';
      }

      const isActiveStatus = linkedCount > 0;

      return (
        <div key={node.id} className="select-none">
          <div
            className={`flex items-center justify-between py-2.5 px-3 rounded-xl hover:bg-slate-50 transition border border-transparent hover:border-slate-200 group ${
              node.type === 'type'
                ? 'bg-slate-100/80 font-black text-slate-900 my-1'
                : node.type === 'group'
                ? 'font-bold text-slate-800 my-0.5'
                : 'text-slate-700'
            }`}
            style={{ paddingLeft: `${depth * 20 + 12}px` }}
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {hasChildren ? (
                <button
                  type="button"
                  onClick={() => toggleExpand(node.id)}
                  className="p-1 hover:bg-slate-200 rounded-md transition text-slate-500 cursor-pointer shrink-0"
                >
                  {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
              ) : (
                <span className="w-6 inline-block text-slate-300 text-center shrink-0">•</span>
              )}

              <Tag className={`h-4 w-4 shrink-0 ${node.type === 'type' ? 'text-blue-600' : 'text-slate-400'}`} />

              {/* Inline Rename Input or Name */}
              {isRenaming ? (
                <form onSubmit={submitRename} className="flex items-center gap-1.5 flex-1 min-w-0">
                  <input
                    autoFocus
                    type="text"
                    value={renamingNodeValue}
                    onChange={(e) => setRenamingNodeValue(e.target.value)}
                    className="flex-1 bg-white border-2 border-blue-400 rounded-lg px-2 py-0.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-0"
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') cancelRename();
                    }}
                  />
                  <button
                    type="submit"
                    className="p-1 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition cursor-pointer shrink-0"
                    title="Simpan Nama Baru"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={cancelRename}
                    className="p-1 bg-slate-200 hover:bg-slate-300 text-slate-600 rounded-lg transition cursor-pointer shrink-0"
                    title="Batal"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </form>
              ) : (
                <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                  <span className={`truncate text-xs sm:text-sm ${queryLower && node.name.toLowerCase().includes(queryLower) ? 'bg-amber-200/80 font-black px-1 rounded' : 'font-semibold'}`}>
                    {node.name}
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0 ${badgeBg}`}>
                    {typeLabel}
                  </span>

                  {/* STATUS INDICATOR BADGES (Aktif vs Pasif/Arsip) */}
                  {node.type !== 'type' && (
                    isActiveStatus ? (
                      <span
                        className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 font-extrabold px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0 shadow-2xs"
                        title={`Aktif & Sering Digunakan: Digunakan oleh ${linkedCount} transaksi di jurnal`}
                      >
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                        </span>
                        Aktif ({linkedCount} Tx)
                      </span>
                    ) : (
                      <span
                        className="text-[10px] bg-slate-100 text-slate-500 border border-slate-200 font-medium px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0"
                        title="Pasif / Arsip: Belum/tidak memiliki data transaksi terikat"
                      >
                        <Archive className="h-3 w-3 text-slate-400" />
                        Pasif (0 Tx)
                      </span>
                    )
                  )}
                </div>
              )}
            </div>

            {!isRenaming && (
              <div className="flex items-center gap-1 opacity-90 group-hover:opacity-100 shrink-0">
                {node.type !== 'item' && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedParentId(node.id);
                      setNewCategoryType(node.type === 'type' ? 'group' : node.type === 'group' ? 'subgroup' : 'item');
                      setShowAddModal(true);
                    }}
                    className="flex items-center gap-1 text-[11px] font-bold px-2 py-1 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition cursor-pointer"
                    title="Tambah Sub-Kategori Di Bawah Ini"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Tambah Sub
                  </button>
                )}

                {/* Rename Button */}
                {node.type !== 'type' && (
                  <button
                    type="button"
                    onClick={() => startRename(node)}
                    className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition cursor-pointer"
                    title={linkedCount > 0 ? `Aktif (${linkedCount} Tx): Ubah nama atau alihkan transaksi` : 'Ubah Nama Kategori'}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}

                {/* Delete Button */}
                {node.type !== 'type' && (
                  <button
                    type="button"
                    onClick={() => handleDelete(node.id, node.name)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                    title={linkedCount > 0 ? `Aktif (${linkedCount} Tx): Hapus atau alihkan transaksi massal` : 'Hapus Kategori'}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>

          {hasChildren && (isExpanded || Boolean(queryLower) || statusFilter !== 'all') && (
            <div className="border-l-2 border-slate-100 ml-4 my-0.5">
              {renderTreeNodes(node.children!, depth + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <div className="w-full space-y-6 animate-fadeIn pb-12">
      {/* HEADER CARD */}
      <div className="bg-white dark:bg-slate-900 p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 w-full">
        <div className="flex items-start sm:items-center gap-3.5 flex-1 min-w-0">
          <div className="p-3 bg-blue-600 text-white rounded-2xl shadow-md shrink-0">
            <FolderTree className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
                Master Data & Konfigurasi Keuangan
              </h2>
              <span className="px-2.5 py-0.5 text-[10px] font-black bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded-full border border-blue-200 dark:border-blue-800 shrink-0">
                Teratur & Konsisten
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-1 leading-relaxed">
              Atur hirarki kategori transaksi, Chart of Accounts (COA Standar), pembersihan massal, dan pohon relasi visual secara rapi & profesional.
            </p>
          </div>
        </div>

        {/* Action Buttons: Backup & Restore & Schema Inspector */}
        <div className="flex items-center gap-2.5 flex-wrap shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100 dark:border-slate-800">
          <button
            onClick={() => setShowSchemaDebugModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black bg-indigo-50 dark:bg-indigo-950/80 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 transition cursor-pointer shadow-2xs"
            title="Inspeksi Kolom & Tipe Data Tabel Database Real-time"
          >
            <Database className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            <span>Inspeksi Skema DB</span>
          </button>

          {onOpenBackupModal && (
            <button
              onClick={onOpenBackupModal}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition cursor-pointer"
              title="Cadangkan Seluruh Data Aplikasi ke File JSON Terenkripsi"
            >
              <Shield className="h-4 w-4 text-amber-300" />
              <span>Backup & Restore Data</span>
            </button>
          )}
        </div>
      </div>

      {/* FULL-WIDTH SEGMENTED SUB-TAB BAR */}
      <div className="bg-slate-100 dark:bg-slate-800/80 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-700/80 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1.5 w-full">
        <button
          onClick={() => setActiveSubTab('hierarchy')}
          className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-extrabold transition cursor-pointer ${
            activeSubTab === 'hierarchy'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700/60'
          }`}
        >
          <FolderTree className="h-4 w-4 shrink-0" />
          <span className="truncate">1. Kategori Bertingkat</span>
        </button>

        <button
          onClick={() => setActiveSubTab('coa')}
          className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-extrabold transition cursor-pointer ${
            activeSubTab === 'coa'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700/60'
          }`}
        >
          <Layers className="h-4 w-4 shrink-0" />
          <span className="truncate">2. COA & Pembersihan Massal</span>
        </button>

        <button
          onClick={() => setActiveSubTab('tree-view')}
          className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-extrabold transition cursor-pointer ${
            activeSubTab === 'tree-view'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700/60'
          }`}
        >
          <FolderTree className="h-4 w-4 shrink-0" />
          <span className="truncate">3. Pohon Relasi COA & Akun</span>
        </button>

        <button
          onClick={() => setActiveSubTab('d3-tree')}
          className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-extrabold transition cursor-pointer ${
            activeSubTab === 'd3-tree'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700/60'
          }`}
        >
          <Sparkles className="h-4 w-4 shrink-0" />
          <span className="truncate">4. Interactive D3 Tree</span>
        </button>

        <button
          onClick={() => setActiveSubTab('logs')}
          className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-extrabold transition cursor-pointer ${
            activeSubTab === 'logs'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700/60'
          }`}
        >
          <History className="h-4 w-4 shrink-0" />
          <span className="truncate">5. Log Master ({changeLogs.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('db-diagnostics')}
          className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-extrabold transition cursor-pointer ${
            activeSubTab === 'db-diagnostics'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700/60'
          }`}
        >
          <Database className="h-4 w-4 shrink-0" />
          <span className="truncate">6. Diagnostik & Skema DB</span>
        </button>
      </div>

      {/* SUB TAB 1: MASTER KATEGORI BERTINGKAT */}
      {activeSubTab === 'hierarchy' && (
        <div className="space-y-5 animate-fadeIn">
          {/* BAR CHART VISUALIZATION CARD */}
          <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 rounded-2xl p-6 text-white shadow-xl border border-slate-700/60 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-700/60 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-500/20 border border-blue-400/30 rounded-xl text-blue-400">
                  <BarChart3 className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-base font-black tracking-tight text-white flex items-center gap-2">
                    Distribusi Transaksi per Kategori
                    <span className="text-[10px] font-bold bg-blue-500/30 text-blue-300 border border-blue-400/30 px-2 py-0.5 rounded-full">
                      Live Analytics
                    </span>
                  </h3>
                  <p className="text-xs text-slate-300 font-medium mt-0.5">
                    Lihat frekuensi & aktivitas transaksi per kategori secara langsung untuk memvalidasi kategori paling aktif sebelum melakukan pengeditan atau penghapusan.
                  </p>
                </div>
              </div>

              {/* Chart Metric Toggle */}
              <div className="flex items-center gap-1 bg-slate-800/80 p-1 rounded-xl border border-slate-700 shrink-0">
                <button
                  type="button"
                  onClick={() => setChartMetric('count')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    chartMetric === 'count'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Jumlah Transaksi (Tx)
                </button>
                <button
                  type="button"
                  onClick={() => setChartMetric('amount')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    chartMetric === 'amount'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Total Nominal (Rp)
                </button>
              </div>
            </div>

            {categoryStats.length === 0 ? (
              <div className="p-8 text-center bg-slate-800/40 rounded-xl border border-slate-700/50 space-y-2">
                <Info className="h-8 w-8 text-slate-500 mx-auto" />
                <p className="text-sm font-semibold text-slate-300">Belum ada transaksi tercatat.</p>
                <p className="text-xs text-slate-400">Tambahkan transaksi di Jurnal untuk melihat grafik distribusi aktivitas kategori di sini.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
                {/* Recharts Bar Chart */}
                <div className="lg:col-span-7 h-64 w-full bg-slate-900/60 p-3 rounded-xl border border-slate-700/50">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={categoryStats.slice(0, 8)}
                      layout="vertical"
                      margin={{ top: 10, right: 20, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} horizontal={false} />
                      <XAxis type="number" stroke="#94a3b8" tick={{ fontSize: 10 }} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        stroke="#e2e8f0"
                        tick={{ fontSize: 11, fontWeight: 700 }}
                        width={110}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          borderColor: '#334155',
                          borderRadius: '12px',
                          color: '#fff',
                          fontSize: '12px',
                          fontWeight: 'bold',
                        }}
                        formatter={(value: any) => [
                          chartMetric === 'count'
                            ? `${value} Transaksi`
                            : `Rp ${Number(value).toLocaleString('id-ID')}`,
                          chartMetric === 'count' ? 'Frekuensi' : 'Total Nominal',
                        ]}
                      />
                      <Bar dataKey={chartMetric === 'count' ? 'count' : 'totalAmount'} radius={[0, 8, 8, 0]}>
                        {categoryStats.slice(0, 8).map((_, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={
                              index === 0
                                ? '#3b82f6'
                                : index === 1
                                ? '#10b981'
                                : index === 2
                                ? '#f59e0b'
                                : index === 3
                                ? '#8b5cf6'
                                : '#06b6d4'
                            }
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Ranking Summary List */}
                <div className="lg:col-span-5 space-y-2.5 max-h-64 overflow-y-auto pr-1 custom-scrollbar">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                    <span>Top Active Categories</span>
                    <span>{categoryStats.length} Kategori Digunakan</span>
                  </h4>

                  {categoryStats.slice(0, 6).map((stat, idx) => {
                    const pct = totalTransactionsCount > 0 ? Math.round((stat.count / totalTransactionsCount) * 100) : 0;
                    return (
                      <div
                        key={stat.name}
                        onClick={() => setSearchQuery(stat.name)}
                        className="p-2.5 bg-slate-800/70 hover:bg-slate-800 border border-slate-700/60 rounded-xl transition cursor-pointer group flex items-center justify-between gap-3"
                        title="Klik untuk mencari kategori ini di pohon hirarki"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between text-xs font-bold text-slate-200 mb-1">
                            <span className="truncate flex items-center gap-1.5">
                              <span className="text-[10px] bg-slate-700 text-slate-300 px-1.5 py-0.2 rounded font-mono">
                                #{idx + 1}
                              </span>
                              {stat.name}
                            </span>
                            <span className="text-blue-400 font-extrabold shrink-0 ml-2">
                              {stat.count} Tx ({pct}%)
                            </span>
                          </div>

                          {/* Progress Bar */}
                          <div className="w-full bg-slate-700 h-1.5 rounded-full overflow-hidden">
                            <div
                              className="bg-gradient-to-r from-blue-500 to-teal-400 h-full rounded-full transition-all duration-500"
                              style={{ width: `${Math.min(100, Math.max(5, pct))}%` }}
                            ></div>
                          </div>

                          <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1">
                            <span>Total Rp {stat.totalAmount.toLocaleString('id-ID')}</span>
                            <span className="text-slate-400 group-hover:text-blue-300 transition flex items-center gap-0.5">
                              Cari di pohon <ArrowRight className="h-2.5 w-2.5" />
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* MAIN CATEGORY TREE CARD */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-4 p-5 animate-fadeIn">
            {/* Header Bar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-base font-black text-slate-800 tracking-tight flex items-center gap-2">
                  <span>Pengelola Hirarki Kategori Keuangan (Categorization Tree)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Kelola struktur hirarki kategori pemasukan, pengeluaran, dan ekuitas. Indikator hijau menandakan kategori aktif ber-transaksi.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={expandAll}
                  className="px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
                >
                  Buka Semua
                </button>
                <button
                  type="button"
                  onClick={collapseAll}
                  className="px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
                >
                  Tutup Semua
                </button>
                <button
                  type="button"
                  onClick={onResetToDefault}
                  className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer flex items-center gap-1"
                  title="Kembalikan ke susunan awal bawaan"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset Default
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedParentId('type-expense');
                    setNewCategoryType('group');
                    setShowAddModal(true);
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl transition cursor-pointer shadow-md"
                >
                  <Plus className="h-4 w-4" />
                  + Tambah Kategori Baru
                </button>
              </div>
            </div>

            {/* STATUS FILTER BUTTONS & SEARCH BAR */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
              {/* Status Filter Chips */}
              <div className="md:col-span-7 flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className={`flex-1 text-center py-1.5 px-3 rounded-lg text-xs font-extrabold transition cursor-pointer ${
                    statusFilter === 'all'
                      ? 'bg-white text-slate-800 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Semua ({allCategoryNames.length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('active')}
                  className={`flex-1 text-center py-1.5 px-3 rounded-lg text-xs font-extrabold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                    statusFilter === 'active'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-emerald-700 hover:bg-emerald-50'
                  }`}
                >
                  <span className="h-2 w-2 rounded-full bg-emerald-400 inline-block animate-pulse"></span>
                  ● Aktif ({activeCategoriesCount})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('inactive')}
                  className={`flex-1 text-center py-1.5 px-3 rounded-lg text-xs font-extrabold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                    statusFilter === 'inactive'
                      ? 'bg-slate-700 text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <Archive className="h-3.5 w-3.5 text-slate-400" />
                  ○ Pasif / Arsip ({inactiveCategoriesCount})
                </button>
              </div>

              {/* Search input */}
              <div className="md:col-span-5 relative">
                <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari kategori atau sub-kategori..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Tree View Container */}
            <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/50 max-h-[32rem] overflow-y-auto space-y-1">
              {renderTreeNodes(categories)}
            </div>
          </div>
        </div>
      )}

      {/* SUB TAB 2: MASTER COA & SINKRONISASI AKUN REKENING */}
      {activeSubTab === 'coa' && (
        <div className="space-y-6 animate-fadeIn">
          {/* Synchronized Master Accounts Banner with Bulk Re-mapping */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
              <div>
                <h3 className="font-extrabold text-slate-800 dark:text-slate-100 text-base flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-blue-600" />
                  <span>Pemetaan Massal & Sinkronisasi Master Akun Ke COA</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-1">
                  Pilih beberapa akun sekaligus untuk dipindahkan ke COA target yang baru dalam satu tindakan sinkronisasi massal.
                </p>
              </div>

              <div className="flex items-center gap-2 self-start flex-wrap">
                <button
                  type="button"
                  onClick={handleTriggerManualSync}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl transition cursor-pointer shadow-xs flex items-center gap-1.5"
                  title="Jalankan sinkronisasi manual untuk memulihkan dan memetakan ulang seluruh akun ke COA aktif"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Sinkron Manual Akun & COA</span>
                </button>
                <span className="px-3 py-1.5 bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 text-xs font-black rounded-xl shrink-0 flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  Tersinkron Real-Time
                </span>
              </div>
            </div>

            {/* Bulk Action Controls Bar */}
            <div className="bg-slate-50 dark:bg-slate-800/80 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col md:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-3 w-full md:w-auto">
                <button
                  type="button"
                  onClick={handleSelectAllAccounts}
                  className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-xs font-extrabold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer shrink-0"
                >
                  {selectedAccountIds.length === accounts.length && accounts.length > 0 ? (
                    <CheckSquare className="h-4 w-4 text-blue-600" />
                  ) : (
                    <Square className="h-4 w-4 text-slate-400" />
                  )}
                  <span>Pilih Semua ({selectedAccountIds.length}/{accounts.length})</span>
                </button>
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                  {selectedAccountIds.length} Akun Terpilih
                </span>
              </div>

              <div className="flex items-center gap-2 w-full md:w-auto justify-end">
                <span className="text-xs font-bold text-slate-500 shrink-0">Target COA:</span>
                <select
                  value={bulkTargetCoaCode}
                  onChange={(e) => setBulkTargetCoaCode(e.target.value)}
                  className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {coaList.map((c) => (
                    <option key={c.code} value={c.code}>
                      [{c.code}] {c.name} ({c.category})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={selectedAccountIds.length === 0}
                  onClick={handleExecuteBulkAccountReassign}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 dark:disabled:bg-slate-800 text-white font-black text-xs rounded-lg transition cursor-pointer shadow-sm disabled:cursor-not-allowed shrink-0"
                >
                  Pindahkan Massal ({selectedAccountIds.length})
                </button>
              </div>
            </div>

            {bulkSuccessMsg && (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-2 animate-fadeIn">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>{bulkSuccessMsg}</span>
              </div>
            )}

            {/* Selectable Accounts Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {accounts.map((acc) => {
                const mapInfo = getAccountCoaMappingLocal(acc);
                const isSelected = selectedAccountIds.includes(acc.id);

                return (
                  <div
                    key={acc.id}
                    onClick={() => handleToggleSelectAccount(acc.id)}
                    className={`p-3.5 rounded-xl space-y-2 border transition cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50/80 dark:bg-blue-950/40 border-blue-500 shadow-xs'
                        : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        {isSelected ? (
                          <CheckSquare className="h-4 w-4 text-blue-600 shrink-0" />
                        ) : (
                          <Square className="h-4 w-4 text-slate-400 shrink-0" />
                        )}
                        <span className="font-extrabold text-xs text-slate-800 dark:text-slate-100 truncate">
                          {acc.name}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono font-black bg-blue-600 text-white px-2 py-0.5 rounded shrink-0">
                        COA {mapInfo.code}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-medium pl-6">
                      <span>{mapInfo.name}</span>
                      <span className="text-[10px] bg-slate-200 dark:bg-slate-700 font-bold px-1.5 py-0.5 rounded text-slate-700 dark:text-slate-300">
                        {mapInfo.category}
                      </span>
                    </div>

                    {acc.accountNumber && (
                      <p className="text-[10px] font-mono text-slate-400 pl-6">No. Rek: {acc.accountNumber}</p>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl flex items-start gap-3 text-xs text-blue-900 font-medium">
              <Info className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                <strong>Prinsip Pembukuan Otomatis:</strong> Saat Anda mencatat transaksi di menu Jurnal Transaksi, sistem menggunakan kombinasi <strong>Akun Rekening</strong> (Kas/Bank/Utang) dan <strong>Kategori Transaksi</strong> untuk membentuk jurnal debet & kredit otomatis. Hal ini memastikan Laporan Arus Kas, Neraca, dan Profit & Loss terhitung akurat secara objektif.
              </p>
            </div>
          </div>

          {/* Master COA Table Section */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h3 className="font-extrabold text-slate-800 text-base flex items-center gap-2">
                  <Layers className="h-5 w-5 text-blue-600" />
                  <span>Daftar Kode Perkiraan Akun Standar (Standard Chart of Accounts / COA)</span>
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Struktur kode perkiraan akuntansi standar 4-digit (1000 Aset, 2000 Kewajiban, 3000 Ekuitas, 4000 Pendapatan, 5000 Beban). Klik ✏️ untuk mengedit atau 🗑️ untuk menghapus akun COA.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap shrink-0">
                <button
                  type="button"
                  onClick={handleResetCoaToDefault}
                  className="px-3 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer flex items-center gap-1.5"
                  title="Kembalikan COA ke susunan standar awal"
                >
                  <RotateCcw className="h-3.5 w-3.5 text-slate-500" />
                  Reset COA Default
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddCoaModal(true)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl transition cursor-pointer shadow-md"
                >
                  <Plus className="h-4 w-4" />
                  Tambah Kode COA Baru
                </button>
              </div>
            </div>

            {/* Search COA Filter */}
            <div className="relative">
              <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Cari kode COA (misal: 1100, 5100) atau nama akun perkiraan..."
                value={coaSearchQuery}
                onChange={(e) => setCoaSearchQuery(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* COA Table */}
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4 font-mono">Kode COA</th>
                    <th className="py-3 px-4">Nama Perkiraan Akun</th>
                    <th className="py-3 px-4">Kategori Akun</th>
                    <th className="py-3 px-4">Saldo Normal</th>
                    <th className="py-3 px-4">Deskripsi / Fungsi</th>
                    <th className="py-3 px-4 text-center">Aksi (Ubah / Hapus)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {coaList
                    .filter((item) => {
                      if (!coaSearchQuery.trim()) return true;
                      const q = coaSearchQuery.toLowerCase();
                      return (
                        item.code.toLowerCase().includes(q) ||
                        item.name.toLowerCase().includes(q) ||
                        item.category.toLowerCase().includes(q) ||
                        item.description.toLowerCase().includes(q)
                      );
                    })
                    .map((item) => (
                      <tr key={item.code} className="hover:bg-slate-50/80 transition group">
                        <td className="py-3 px-4 font-mono font-black text-blue-700">{item.code}</td>
                        <td className="py-3 px-4 font-extrabold text-slate-800">{item.name}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2.5 py-0.5 rounded text-[10px] font-extrabold ${
                              item.category === 'Asset'
                                ? 'bg-emerald-100 text-emerald-800'
                                : item.category === 'Liability'
                                ? 'bg-rose-100 text-rose-800'
                                : item.category === 'Equity'
                                ? 'bg-purple-100 text-purple-800'
                                : item.category === 'Income'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {item.category}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-600 font-bold">{item.normalBalance}</td>
                        <td className="py-3 px-4 text-slate-500 text-[11px]">{item.description}</td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => startEditCoa(item)}
                              className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition cursor-pointer flex items-center gap-1 text-[11px] font-bold"
                              title="Edit Kode Akun COA Ini"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">Ubah</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteCoa(item.code, item.name)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer flex items-center gap-1 text-[11px] font-bold"
                              title="Hapus Akun COA Ini"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">Hapus</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB TAB 1: KATEGORI BERTINGKAT */}
      {activeSubTab === 'hierarchy' && (
        <ErrorBoundary fallbackTitle="Anomali pada Hirarki Kategori">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* LEFT COLUMN: HIERARCHY TREE VIEW */}
            <div className="lg:col-span-7 bg-white dark:bg-slate-900 p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              {/* TREE CONTROLS & SEARCH BAR */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Cari nama kategori transaksi..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0 justify-end">
                  {/* Status Filter Dropdown */}
                  <div className="relative">
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
                      className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-extrabold rounded-xl px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                    >
                      <option value="all">Semua Status ({allCategoryNames.length})</option>
                      <option value="active">🟢 Hanya Aktif ({activeCategoriesCount})</option>
                      <option value="inactive">📦 Hanya Pasif / Arsip ({inactiveCategoriesCount})</option>
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={expandAll}
                    className="p-2 text-xs font-extrabold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition cursor-pointer"
                    title="Buka Seluruh Node Kategori"
                  >
                    Buka Semua
                  </button>
                  <button
                    type="button"
                    onClick={collapseAll}
                    className="p-2 text-xs font-extrabold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition cursor-pointer"
                    title="Tutup Node Kategori"
                  >
                    Tutup Semua
                  </button>
                </div>
              </div>

              {/* RENDER TREE CONTAINER */}
              <div className="space-y-1 pt-1 max-h-[600px] overflow-y-auto pr-1">
                {renderTreeNodes(categories)}
              </div>
            </div>

            {/* RIGHT COLUMN: DISTRIBUTION STATS BAR CHART */}
            <div className="lg:col-span-5 bg-white dark:bg-slate-900 p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 rounded-xl">
                    <BarChart3 className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-slate-800 dark:text-slate-100 text-xs uppercase tracking-wider">
                      Distribusi Transaksi per Kategori
                    </h3>
                    <p className="text-[10px] text-slate-500 font-medium">
                      Statistik penggunaan kategori pada jurnal keuangan Anda
                    </p>
                  </div>
                </div>

                {/* Metric Selector Toggle */}
                <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700 shrink-0">
                  <button
                    type="button"
                    onClick={() => setChartMetric('count')}
                    className={`px-2 py-1 text-[10px] font-extrabold rounded-md transition cursor-pointer ${
                      chartMetric === 'count'
                        ? 'bg-blue-600 text-white shadow-2xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    Jumlah Tx
                  </button>
                  <button
                    type="button"
                    onClick={() => setChartMetric('amount')}
                    className={`px-2 py-1 text-[10px] font-extrabold rounded-md transition cursor-pointer ${
                      chartMetric === 'amount'
                        ? 'bg-blue-600 text-white shadow-2xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    Nominal Rp
                  </button>
                </div>
              </div>

              {/* STATS LIST */}
              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                {categoryStats.map((item) => {
                  const maxVal = categoryStats[0]
                    ? chartMetric === 'count'
                      ? categoryStats[0].count
                      : categoryStats[0].totalAmount
                    : 1;
                  const currentVal = chartMetric === 'count' ? item.count : item.totalAmount;
                  const pct = Math.min(100, Math.round((currentVal / (maxVal || 1)) * 100));

                  return (
                    <div key={item.name} className="space-y-1">
                      <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                        <span className="truncate pr-2">{item.name}</span>
                        <span className="shrink-0 font-mono text-[11px]">
                          {chartMetric === 'count'
                            ? `${item.count} Tx`
                            : `Rp ${item.totalAmount.toLocaleString('id-ID')}`}
                        </span>
                      </div>
                      <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}

                {categoryStats.length === 0 && (
                  <p className="text-xs text-center text-slate-400 py-8">
                    Belum ada data transaksi jurnal yang tercatat.
                  </p>
                )}
              </div>
            </div>
          </div>
        </ErrorBoundary>
      )}

      {/* SUB TAB 3: VISUAL TREE RELASI COA & AKUN */}
      {activeSubTab === 'tree-view' && (
        <ErrorBoundary fallbackTitle="Anomali pada Pohon Relasi COA & Akun">
          <div className="space-y-6 animate-fadeIn">
            <CoaAccountTreeVisual
              coaList={coaList}
              accounts={accounts}
              onUpdateAccounts={onUpdateAccounts}
            />
          </div>
        </ErrorBoundary>
      )}

      {/* SUB TAB 4: D3 VISUAL COA TREE & DRAG-DROP RE-CATEGORIZER */}
      {activeSubTab === 'd3-tree' && (
        <ErrorBoundary fallbackTitle="Anomali pada Interactive D3 Tree">
          <div className="space-y-6 animate-fadeIn">
            <D3CoaInteractiveTree
              categories={categories}
              coaList={coaList}
              transactions={transactions}
              onReassignCategory={(txId, newCategory) => {
                if (onReassignTransactionCategory) {
                  onReassignTransactionCategory(txId, newCategory);
                } else if (onBulkMoveTransactions) {
                  const targetTx = transactions.find((t) => t.id === txId);
                  if (targetTx) {
                    onBulkMoveTransactions([targetTx.category], newCategory);
                  }
                }
              }}
            />
          </div>
        </ErrorBoundary>
      )}

      {/* SUB TAB 5: LOG RIWAYAT PERUBAHAN MASTER DATA */}
      {activeSubTab === 'logs' && (
        <ErrorBoundary fallbackTitle="Anomali pada Log Master Data">
          <div className="space-y-6 animate-fadeIn">
            <MasterChangeLogTable logs={changeLogs} />
          </div>
        </ErrorBoundary>
      )}

      {/* COLLAPSIBLE ADVANCED RESET (ZONA PEMULIHAN DANGER ZONE) */}
      <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setShowAdvancedDangerZone(!showAdvancedDangerZone)}
          className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition cursor-pointer select-none"
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${showAdvancedDangerZone ? 'rotate-180' : ''}`} />
          <span>Pengaturan Lanjutan & Reset Master Data (Zona Pemulihan)</span>
        </button>

        {showAdvancedDangerZone && (
          <div className="mt-3 p-4 bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-fadeIn">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-rose-700 dark:text-rose-400 font-extrabold text-xs">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>Reset Master Data Kategori & COA Ke Standar Pabrik</span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 font-medium">
                Mengembalikan seluruh hirarki kategori dan COA ke pengaturan standar awal sistem. Dilakukan hanya jika terjadi duplikasi parah.
              </p>
            </div>

            <button
              type="button"
              onClick={handleFactoryResetAll}
              className="px-4 py-2 text-xs font-extrabold text-rose-700 dark:text-rose-300 bg-rose-100 hover:bg-rose-200 dark:bg-rose-900/50 dark:hover:bg-rose-900/80 rounded-xl transition cursor-pointer flex items-center gap-1.5 border border-rose-200 dark:border-rose-800 shrink-0"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Reset Master Default</span>
            </button>
          </div>
        )}
      </div>

      {/* MODAL TAMBAH SUB KATEGORI */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-extrabold text-slate-800 text-sm uppercase tracking-wider">
                Tambah Sub-Kategori Baru
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-xs p-1 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-600 font-bold mb-1">
                  Pilih Kategori Induk (Parent)
                </label>
                <select
                  value={selectedParentId}
                  onChange={(e) => setSelectedParentId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {flatCategories
                    .filter((c) => c.type !== 'item')
                    .map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.path} ({opt.type.toUpperCase()})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-600 font-bold mb-1">
                  Tipe Level Kategori Baru
                </label>
                <select
                  value={newCategoryType}
                  onChange={(e) => setNewCategoryType(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="group">Kelompok Kategori (Level 1)</option>
                  <option value="subgroup">Sub Kelompok (Level 2)</option>
                  <option value="item">Sub Kategori Spesifik / Item (Level 3)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-600 font-bold mb-1">
                  Nama Kategori Baru <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Biaya Langganan Software, Honor Mengajar, dll"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-5 py-2 text-xs font-black text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition cursor-pointer shadow-xs"
                >
                  <Check className="h-4 w-4" />
                  Simpan Kategori
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL TAMBAH COA BARU */}
      {showAddCoaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-extrabold text-slate-800 text-sm uppercase tracking-wider">
                Tambah Kode Perkiraan Akun Baru (COA)
              </h3>
              <button
                type="button"
                onClick={() => setShowAddCoaModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-xs p-1 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddCoaSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Kode Akun (misal: 1250, 5150)
                </label>
                <input
                  type="text"
                  placeholder="Kode 4 digit..."
                  value={newCoaCode}
                  onChange={(e) => setNewCoaCode(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono font-bold text-slate-800"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Nama Akun Perkiraan
                </label>
                <input
                  type="text"
                  placeholder="Nama akun..."
                  value={newCoaName}
                  onChange={(e) => setNewCoaName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-800"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Kategori Akun
                </label>
                <select
                  value={newCoaCategory}
                  onChange={(e) => setNewCoaCategory(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-800"
                >
                  <option value="Asset">Asset (Aset / Harta)</option>
                  <option value="Liability">Liability (Kewajiban / Utang)</option>
                  <option value="Equity">Equity (Ekuitas / Modal)</option>
                  <option value="Income">Income (Pendapatan)</option>
                  <option value="Expense">Expense (Beban / Pengeluaran)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Saldo Normal
                </label>
                <select
                  value={newCoaBalance}
                  onChange={(e) => setNewCoaBalance(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-800"
                >
                  <option value="Debet">Debet</option>
                  <option value="Kredit">Kredit</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Deskripsi / Catatan
                </label>
                <input
                  type="text"
                  placeholder="Keterangan singkat..."
                  value={newCoaDesc}
                  onChange={(e) => setNewCoaDesc(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-800"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddCoaModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-lg transition cursor-pointer text-xs"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition cursor-pointer text-xs uppercase tracking-wider shadow-sm"
                >
                  Simpan Akun COA
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL UBAH / EDIT COA */}
      {editingCoa && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-extrabold text-slate-800 text-sm uppercase tracking-wider flex items-center gap-2">
                <Pencil className="h-4 w-4 text-blue-600" />
                Ubah Kode Perkiraan Akun (COA)
              </h3>
              <button
                type="button"
                onClick={() => setEditingCoa(null)}
                className="text-slate-400 hover:text-slate-600 font-bold text-xs p-1 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleEditCoaSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Kode Akun COA
                </label>
                <input
                  type="text"
                  placeholder="Kode 4 digit..."
                  value={editCoaCode}
                  onChange={(e) => setEditCoaCode(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono font-bold text-slate-800"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Nama Akun Perkiraan
                </label>
                <input
                  type="text"
                  placeholder="Nama akun..."
                  value={editCoaName}
                  onChange={(e) => setEditCoaName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-800"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Kategori Akun
                </label>
                <select
                  value={editCoaCategory}
                  onChange={(e) => setEditCoaCategory(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-800"
                >
                  <option value="Asset">Asset (Aset / Harta)</option>
                  <option value="Liability">Liability (Kewajiban / Utang)</option>
                  <option value="Equity">Equity (Ekuitas / Modal)</option>
                  <option value="Income">Income (Pendapatan)</option>
                  <option value="Expense">Expense (Beban / Pengeluaran)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Saldo Normal
                </label>
                <select
                  value={editCoaBalance}
                  onChange={(e) => setEditCoaBalance(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-800"
                >
                  <option value="Debet">Debet</option>
                  <option value="Kredit">Kredit</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Deskripsi / Catatan
                </label>
                <input
                  type="text"
                  placeholder="Keterangan singkat..."
                  value={editCoaDesc}
                  onChange={(e) => setEditCoaDesc(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-800"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingCoa(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-lg transition cursor-pointer text-xs"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition cursor-pointer text-xs uppercase tracking-wider shadow-sm flex items-center gap-1.5"
                >
                  <Check className="h-4 w-4" />
                  Simpan Perubahan COA
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* BULK MOVE TRANSACTIONS MODAL */}
      {bulkMoveModalState.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden">
            <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 px-6 py-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <ArrowRightLeft className="h-5 w-5 text-amber-100" />
                <h3 className="font-extrabold text-base">Pemindahan Massal Transaksi (Bulk Move)</h3>
              </div>
              <button
                onClick={() => setBulkMoveModalState((prev) => ({ ...prev, isOpen: false }))}
                className="p-1 hover:bg-white/20 rounded-lg transition text-white cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-amber-900 font-bold">
                      Kategori "{bulkMoveModalState.nodeName}" Masih Digunakan!
                    </p>
                    <p className="text-xs text-amber-800 mt-1">
                      Ditemukan <span className="font-extrabold">{bulkMoveModalState.linkedCount} transaksi</span> di Jurnal yang terikat dengan kategori ini.
                    </p>
                    {bulkMoveModalState.sampleTxDesc && (
                      <p className="text-[11px] text-amber-700 italic mt-1 bg-amber-100/60 px-2 py-1 rounded">
                        Contoh: "{bulkMoveModalState.sampleTxDesc}"
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Pilih Kategori Tujuan Baru
                </label>
                <select
                  value={bulkMoveModalState.targetCategory}
                  onChange={(e) =>
                    setBulkMoveModalState((prev) => ({ ...prev, targetCategory: e.target.value }))
                  }
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-amber-500 focus:bg-white focus:outline-none"
                >
                  {allCategoryNames
                    .filter((cat) => !bulkMoveModalState.sourceCategoryNames.includes(cat))
                    .map((catName) => (
                      <option key={catName} value={catName}>
                        {catName}
                      </option>
                    ))}
                </select>
                <p className="text-[11px] text-slate-500 mt-1.5 flex items-center gap-1">
                  <Info className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                  Seluruh {bulkMoveModalState.linkedCount} transaksi akan dipindahkan ke kategori ini secara otomatis tanpa perlu diubah satu per satu.
                </p>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setBulkMoveModalState((prev) => ({ ...prev, isOpen: false }))}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={executeBulkMoveAndAction}
                  className="px-5 py-2.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white font-extrabold text-xs rounded-xl shadow-md transition flex items-center gap-1.5 cursor-pointer"
                >
                  <ArrowRightLeft className="h-4 w-4" />
                  Pindahkan {bulkMoveModalState.linkedCount} Transaksi & {bulkMoveModalState.actionType === 'delete' ? 'Hapus' : 'Lanjutkan Edit'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manual COA Sync Report Modal */}
      {syncReportModal && syncReportModal.isOpen && syncReportModal.report && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 animate-fadeIn">
          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs transition-opacity" onClick={() => setSyncReportModal({ isOpen: false, report: null })} />
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden relative z-10 p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2 text-emerald-600">
                <CheckCircle2 className="h-6 w-6" />
                <h3 className="font-extrabold text-slate-800 text-sm uppercase tracking-wider">
                  Hasil Sinkronisasi Manual Akun & COA
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSyncReportModal({ isOpen: false, report: null })}
                className="text-slate-400 hover:text-slate-600 font-bold text-xs p-1 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed font-medium">
              {syncReportModal.report.summaryMessage}
            </p>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2 max-h-60 overflow-y-auto">
              <div className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider flex justify-between border-b border-slate-200 pb-1.5">
                <span>Akun Rekening</span>
                <span>Terkoneksi Master COA</span>
              </div>
              {syncReportModal.report.items.map((item) => (
                <div key={item.accountId} className="flex items-center justify-between text-xs py-1 border-b border-slate-100 last:border-none">
                  <div>
                    <p className="font-bold text-slate-800">{item.accountName}</p>
                    <p className="text-[10px] text-slate-400 font-mono uppercase">{item.type}</p>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-black text-blue-700 bg-blue-50 px-2 py-0.5 rounded text-[11px]">
                      COA {item.coaCode}
                    </span>
                    <p className="text-[10px] font-semibold text-slate-500 mt-0.5">{item.coaName}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSyncReportModal({ isOpen: false, report: null })}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-extrabold transition shadow-xs cursor-pointer"
              >
                Tutup & Simpan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUB TAB 6: DIAGNOSTIK & SKEMA DATABASE */}
      {activeSubTab === 'db-diagnostics' && (
        <div className="space-y-6 animate-fadeIn">
          <div className="bg-gradient-to-r from-indigo-900 via-slate-900 to-slate-900 p-6 rounded-2xl text-white border border-indigo-800/60 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="font-extrabold text-lg flex items-center gap-2">
                <Database className="h-5 w-5 text-indigo-400" />
                <span>Pusat Diagnostik & Verifikasi Database PostgreSQL</span>
              </h3>
              <p className="text-xs text-slate-300 font-medium">
                Pemeriksaan skema real-time, perbaikan mismatch kolom otomatis, dan inspeksi langsung isi tabel pengguna.
              </p>
            </div>

            <button
              onClick={() => setShowSchemaDebugModal(true)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-xl shadow-md transition cursor-pointer flex items-center gap-2 shrink-0"
            >
              <Database className="h-4 w-4" />
              <span>Buka Schema Debug Modal</span>
            </button>
          </div>

          <DatabaseSchemaFixer />
          <DatabaseDiagnostics />
        </div>
      )}

      {/* SCHEMA DEBUG MODAL */}
      <SchemaDebugModal
        isOpen={showSchemaDebugModal}
        onClose={() => setShowSchemaDebugModal(false)}
        initialTableName="users"
      />
    </div>
  );
};
