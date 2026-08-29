import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import uuid from 'react-native-uuid';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type PaymentMethod = 'cash' | 'bank' | 'credit';

export interface CapitalPool {
  id: string;
  title: string;
  total_budget: number;
  description: string;
  start_date: string;
  created_at: string;
}

export interface CapitalExpense {
  id: string;
  pool_id: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  total_cost: number;    // validated: quantity × unit_price
  vendor_name: string;
  payment_method: PaymentMethod;
  category: string;      // e.g. "Materials", "Labour", "Equipment"
  expense_date: string;  // ISO date
  created_at: string;
}

// ─────────────────────────────────────────────
// State Interface
// ─────────────────────────────────────────────

interface CapitalState {
  capitalPools: CapitalPool[];
  capitalExpenses: CapitalExpense[];

  // Pool CRUD
  addCapitalPool: (title: string, total_budget: number, description: string, start_date?: string) => string;
  updateCapitalPool: (id: string, data: Partial<Pick<CapitalPool, 'title' | 'total_budget' | 'description'>>) => void;
  deleteCapitalPool: (id: string) => void;

  // Expense CRUD
  addCapitalExpense: (
    pool_id: string,
    item_name: string,
    quantity: number,
    unit_price: number,
    vendor_name: string,
    payment_method: PaymentMethod,
    category: string,
    expense_date?: string
  ) => void;
  updateCapitalExpense: (id: string, data: Partial<Omit<CapitalExpense, 'id' | 'pool_id' | 'created_at'>>) => void;
  deleteCapitalExpense: (id: string) => void;
}

const now = () => new Date().toISOString();
const isFiniteNonNegative = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;
const isFinitePositive = (value: unknown): value is number => isFiniteNonNegative(value) && value > 0;
const isValidDate = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value) && !Number.isNaN(Date.parse(value));

function hydrateCapitalState(persisted: unknown, current: CapitalState): CapitalState {
  const saved = persisted && typeof persisted === 'object' ? persisted as Partial<CapitalState> : {};
  const capitalPools = Array.isArray(saved.capitalPools)
    ? saved.capitalPools.filter((pool): pool is CapitalPool =>
        Boolean(pool) && typeof pool.id === 'string' && typeof pool.title === 'string' && pool.title.trim().length > 0 &&
        isFinitePositive(pool.total_budget) && typeof pool.description === 'string' &&
        isValidDate(pool.start_date) && isValidDate(pool.created_at))
    : [];
  const poolIds = new Set(capitalPools.map(pool => pool.id));
  const capitalExpenses = Array.isArray(saved.capitalExpenses)
    ? saved.capitalExpenses.filter((expense): expense is CapitalExpense =>
        Boolean(expense) && typeof expense.id === 'string' && typeof expense.pool_id === 'string' && poolIds.has(expense.pool_id) &&
        typeof expense.item_name === 'string' && expense.item_name.trim().length > 0 &&
        isFinitePositive(expense.quantity) && isFiniteNonNegative(expense.unit_price) &&
        typeof expense.vendor_name === 'string' && (expense.payment_method === 'cash' || expense.payment_method === 'bank' || expense.payment_method === 'credit') &&
        typeof expense.category === 'string' && isValidDate(expense.expense_date) && isValidDate(expense.created_at))
    : [];
  return {
    ...current,
    capitalPools,
    capitalExpenses: capitalExpenses.map(expense => ({
      ...expense,
      total_cost: Number((expense.quantity * expense.unit_price).toFixed(2)),
    })),
  };
}

// ─────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────
export const useCapitalStore = create<CapitalState>()(
  persist(
    (set, get) => ({
      capitalPools: [],
      capitalExpenses: [],

      // ── Pool CRUD ──
      addCapitalPool: (title, total_budget, description, start_date) => {
        if (!title.trim() || !isFinitePositive(total_budget) || !isValidDate(start_date ?? now())) return '';
        const id = uuid.v4() as string;
        set(s => ({
          capitalPools: [
            ...s.capitalPools,
            { id, title: title.trim(), total_budget, description: description.trim(), start_date: start_date ?? now(), created_at: now() },
          ],
        }));
        return id;
      },

      updateCapitalPool: (id, data) => {
        if (!id) return;
        set(s => ({
          capitalPools: s.capitalPools.map(p => {
            if (p.id !== id) return p;
            const title = data.title === undefined ? p.title : data.title.trim();
            const total_budget = data.total_budget ?? p.total_budget;
            return title && isFinitePositive(total_budget)
              ? { ...p, ...data, title, total_budget, description: data.description?.trim() ?? p.description }
              : p;
          }),
        }));
      },

      deleteCapitalPool: id =>
        set(s => ({
          capitalPools: s.capitalPools.filter(p => p.id !== id),
          capitalExpenses: s.capitalExpenses.filter(e => e.pool_id !== id),
        })),

      // ── Expense CRUD ──
      // total_cost is enforced here as quantity × unit_price (PRD form-validation rule)
      addCapitalExpense: (pool_id, item_name, quantity, unit_price, vendor_name, payment_method, category, expense_date) => {
        if (!pool_id || !item_name.trim() || !isFinitePositive(quantity) || !isFiniteNonNegative(unit_price) ||
            !category.trim() || !isValidDate(expense_date ?? now()) ||
            !['cash', 'bank', 'credit'].includes(payment_method) || !get().capitalPools.some(pool => pool.id === pool_id)) return;
        set(s => ({
          capitalExpenses: [
            ...s.capitalExpenses,
            {
              id: uuid.v4() as string,
              pool_id,
              item_name: item_name.trim(),
              quantity,
              unit_price,
              total_cost: parseFloat((quantity * unit_price).toFixed(2)),
              vendor_name: vendor_name.trim(),
              payment_method,
              category: category.trim(),
              expense_date: expense_date ?? now(),
              created_at: now(),
            },
          ],
        }));
      },

      updateCapitalExpense: (id, data) =>
        set(s => ({
          capitalExpenses: s.capitalExpenses.map(e => {
            if (e.id !== id) return e;
            const updated = { ...e, ...data, item_name: data.item_name?.trim() ?? e.item_name, vendor_name: data.vendor_name?.trim() ?? e.vendor_name, category: data.category?.trim() ?? e.category };
            if (!updated.item_name || !updated.category || !isFinitePositive(updated.quantity) || !isFiniteNonNegative(updated.unit_price) ||
                !['cash', 'bank', 'credit'].includes(updated.payment_method) || !isValidDate(updated.expense_date)) return e;
            // Re-enforce total_cost on any qty/price change
            updated.total_cost = parseFloat((updated.quantity * updated.unit_price).toFixed(2));
            return updated;
          }),
        })),

      deleteCapitalExpense: id =>
        set(s => ({
          capitalExpenses: s.capitalExpenses.filter(e => e.id !== id),
        })),
    }),
    {
      name: 'hisabkitab-capital-pools',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      merge: hydrateCapitalState,
    }
  )
);
