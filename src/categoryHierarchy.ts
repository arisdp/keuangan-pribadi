export interface CategoryNode {
  id: string;
  name: string;
  type: 'type' | 'group' | 'subgroup' | 'item';
  transactionType?: 'income' | 'expense' | 'equity' | 'saving' | 'investment';
  parentId?: string | null;
  children?: CategoryNode[];
}

export const DEFAULT_CATEGORY_HIERARCHY: CategoryNode[] = [
  {
    id: 'type-equity',
    name: 'Ekuitas',
    type: 'type',
    transactionType: 'equity',
    children: [
      {
        id: 'grp-modal-awal',
        name: 'Modal Awal',
        type: 'group',
        parentId: 'type-equity',
        children: [
          { id: 'item-modal-awal', name: 'Modal Awal Keuangan', type: 'item', parentId: 'grp-modal-awal' },
        ],
      },
    ],
  },
  {
    id: 'type-income',
    name: 'Pendapatan',
    type: 'type',
    transactionType: 'income',
    children: [
      {
        id: 'grp-pendapatan-tetap',
        name: 'Pendapatan Tetap',
        type: 'group',
        parentId: 'type-income',
        children: [
          { id: 'item-gaji', name: 'Gaji', type: 'item', parentId: 'grp-pendapatan-tetap' },
          { id: 'item-gaji-utama', name: 'Gaji Utama', type: 'item', parentId: 'grp-pendapatan-tetap' },
        ],
      },
      {
        id: 'grp-pendapatan-tidak-tetap',
        name: 'Pendapatan Tidak Tetap',
        type: 'group',
        parentId: 'type-income',
        children: [
          {
            id: 'subgrp-pendapatan-bank',
            name: 'Pendapatan Bank',
            type: 'subgroup',
            parentId: 'grp-pendapatan-tidak-tetap',
            children: [
              { id: 'item-bunga-bank', name: 'Bunga Bank', type: 'item', parentId: 'subgrp-pendapatan-bank' },
            ],
          },
          {
            id: 'subgrp-pendapatan-lainnya',
            name: 'Pendapatan Lainnya',
            type: 'subgroup',
            parentId: 'grp-pendapatan-tidak-tetap',
            children: [
              { id: 'item-pendapatan-lain', name: 'Pendapatan Lain-Lain', type: 'item', parentId: 'subgrp-pendapatan-lainnya' },
              { id: 'item-refund', name: 'Refund', type: 'item', parentId: 'subgrp-pendapatan-lainnya' },
              { id: 'item-sampingan', name: 'Sampingan', type: 'item', parentId: 'subgrp-pendapatan-lainnya' },
              { id: 'item-penerimaan-utang', name: 'Penerimaan Utang Baru', type: 'item', parentId: 'subgrp-pendapatan-lainnya' },
              { id: 'item-penjualan-investasi', name: 'Penjualan Investasi', type: 'item', parentId: 'subgrp-pendapatan-lainnya' },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'type-expense',
    name: 'Pengeluaran',
    type: 'type',
    transactionType: 'expense',
    children: [
      {
        id: 'grp-bank-finansial',
        name: 'Bank dan Finansial',
        type: 'group',
        parentId: 'type-expense',
        children: [
          { id: 'item-biaya-bank', name: 'Biaya Bank', type: 'item', parentId: 'grp-bank-finansial' },
          { id: 'item-biaya-pajak-bank', name: 'Biaya Pajak Bank', type: 'item', parentId: 'grp-bank-finansial' },
          { id: 'item-biaya-transaksi', name: 'Biaya Transaksi', type: 'item', parentId: 'grp-bank-finansial' },
        ],
      },
      {
        id: 'grp-belanja-online',
        name: 'Belanja Online',
        type: 'group',
        parentId: 'type-expense',
        children: [
          { id: 'item-belanja-online', name: 'Belanja Online', type: 'item', parentId: 'grp-belanja-online' },
          { id: 'item-belanja-bulanan', name: 'Belanja Bulanan', type: 'item', parentId: 'grp-belanja-online' },
        ],
      },
      {
        id: 'grp-kebutuhan-pribadi',
        name: 'Kebutuhan Pribadi',
        type: 'group',
        parentId: 'type-expense',
        children: [
          { id: 'item-hiburan', name: 'Hiburan', type: 'item', parentId: 'grp-kebutuhan-pribadi' },
          { id: 'item-makanan', name: 'Makanan', type: 'item', parentId: 'grp-kebutuhan-pribadi' },
        ],
      },
      {
        id: 'grp-kebutuhan-rumah-tangga',
        name: 'Kebutuhan Rumah Tangga',
        type: 'group',
        parentId: 'type-expense',
        children: [
          { id: 'item-kebutuhan-pokok', name: 'Kebutuhan Pokok', type: 'item', parentId: 'grp-kebutuhan-rumah-tangga' },
          { id: 'item-properti', name: 'Properti', type: 'item', parentId: 'grp-kebutuhan-rumah-tangga' },
          { id: 'item-utilitas', name: 'Utilitas & Tagihan', type: 'item', parentId: 'grp-kebutuhan-rumah-tangga' },
        ],
      },
      {
        id: 'grp-kesehatan',
        name: 'Kesehatan',
        type: 'group',
        parentId: 'type-expense',
        children: [
          { id: 'item-perawatan-tubuh', name: 'Biaya Perawatan Tubuh', type: 'item', parentId: 'grp-kesehatan' },
          { id: 'item-tes-kesehatan', name: 'Biaya Tes Kesehatan', type: 'item', parentId: 'grp-kesehatan' },
          { id: 'item-kesehatan-umum', name: 'Kesehatan', type: 'item', parentId: 'grp-kesehatan' },
        ],
      },
      {
        id: 'grp-pengeluaran-lainnya',
        name: 'Pengeluaran Lainnya',
        type: 'group',
        parentId: 'type-expense',
        children: [
          { id: 'item-biaya-lain', name: 'Biaya Lain-Lain', type: 'item', parentId: 'grp-pengeluaran-lainnya' },
          { id: 'item-tarik-atm', name: 'Tarik ATM', type: 'item', parentId: 'grp-pengeluaran-lainnya' },
          { id: 'item-topup-ewallet', name: 'Topup e-Wallet', type: 'item', parentId: 'grp-pengeluaran-lainnya' },
          { id: 'item-cicilan-utang', name: 'Cicilan / Pelunasan Utang', type: 'item', parentId: 'grp-pengeluaran-lainnya' },
        ],
      },
      {
        id: 'grp-sosial',
        name: 'Sosial',
        type: 'group',
        parentId: 'type-expense',
        children: [
          { id: 'item-sosial', name: 'Sosial', type: 'item', parentId: 'grp-sosial' },
          { id: 'item-pendidikan', name: 'Pendidikan', type: 'item', parentId: 'grp-sosial' },
        ],
      },
      {
        id: 'grp-transportasi',
        name: 'Transportasi',
        type: 'group',
        parentId: 'type-expense',
        children: [
          { id: 'item-transportasi', name: 'Transportasi', type: 'item', parentId: 'grp-transportasi' },
        ],
      },
    ],
  },
];

// Local Storage Storage Helper
export function getStoredCategories(username?: string): CategoryNode[] {
  try {
    const key = username ? `fin_${username}_master_categories` : 'fin_default_master_categories';
    const saved = localStorage.getItem(key);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (err) {
    console.error('Failed to load categories from storage', err);
  }
  return DEFAULT_CATEGORY_HIERARCHY;
}

export function saveStoredCategories(categories: CategoryNode[], username?: string) {
  try {
    const key = username ? `fin_${username}_master_categories` : 'fin_default_master_categories';
    localStorage.setItem(key, JSON.stringify(categories));
  } catch (err) {
    console.error('Failed to save categories to storage', err);
  }
}

// Helper to flatten categories into an array of options with path strings
export interface CategoryFlatOption {
  id: string;
  name: string;
  path: string;
  level: number;
  type: 'type' | 'group' | 'subgroup' | 'item';
  transactionType?: string;
  parentId?: string | null;
}

export function flattenCategoryHierarchy(nodes: CategoryNode[], parentPath = '', level = 0): CategoryFlatOption[] {
  let result: CategoryFlatOption[] = [];

  for (const node of nodes) {
    const currentPath = parentPath ? `${parentPath} > ${node.name}` : node.name;
    result.push({
      id: node.id,
      name: node.name,
      path: currentPath,
      level,
      type: node.type,
      transactionType: node.transactionType,
      parentId: node.parentId,
    });

    if (node.children && node.children.length > 0) {
      result = result.concat(flattenCategoryHierarchy(node.children, currentPath, level + 1));
    }
  }

  return result;
}

// Helper to find a category node by ID or Name
export function findCategoryNode(nodes: CategoryNode[], term: string): CategoryNode | null {
  const lower = term.toLowerCase().trim();
  for (const node of nodes) {
    if (node.id === term || node.name.toLowerCase().trim() === lower) {
      return node;
    }
    if (node.children) {
      const found = findCategoryNode(node.children, term);
      if (found) return found;
    }
  }
  return null;
}

// Add a category node under a parent ID
export function addCategoryNode(nodes: CategoryNode[], parentId: string, newNodeName: string, nodeType: 'group' | 'subgroup' | 'item'): CategoryNode[] {
  const newNode: CategoryNode = {
    id: `cat-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    name: newNodeName.trim(),
    type: nodeType,
    parentId,
    children: nodeType === 'item' ? undefined : [],
  };

  const recursiveAdd = (tree: CategoryNode[]): CategoryNode[] => {
    return tree.map((node) => {
      if (node.id === parentId) {
        return {
          ...node,
          children: [...(node.children || []), newNode],
        };
      }
      if (node.children) {
        return {
          ...node,
          children: recursiveAdd(node.children),
        };
      }
      return node;
    });
  };

  return recursiveAdd(nodes);
}

// Delete a category node by ID
export function deleteCategoryNode(nodes: CategoryNode[], targetId: string): CategoryNode[] {
  return nodes
    .filter((node) => node.id !== targetId)
    .map((node) => {
      if (node.children) {
        return {
          ...node,
          children: deleteCategoryNode(node.children, targetId),
        };
      }
      return node;
    });
}

// Rename a category node by ID
export function renameCategoryNode(nodes: CategoryNode[], targetId: string, newName: string): CategoryNode[] {
  return nodes.map((node) => {
    if (node.id === targetId) {
      return { ...node, name: newName.trim() };
    }
    if (node.children) {
      return {
        ...node,
        children: renameCategoryNode(node.children, targetId, newName),
      };
    }
    return node;
  });
}
