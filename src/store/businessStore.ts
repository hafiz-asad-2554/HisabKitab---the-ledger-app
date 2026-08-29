import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import uuid from 'react-native-uuid';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type PartyType = 'customer' | 'supplier';
export type BizTxType = 'income' | 'expense' | 'credit' | 'debit';

export interface BusinessParty {
  id: string;
  name: string;
  phone: string;
  party_type: PartyType;
  /** Running balance: positive = we owe them (payable), negative = they owe us (receivable) */
  balance: number;
  notes?: string;
  created_at: string;
}

export interface BusinessTransaction {
  id: string;
  party_id: string | null;        // null = cash tx (no party)
  type: BizTxType;
  amount: number;
  category: string;               // e.g. "Sales", "Purchase", "Cash In", "Cash Out", "COGS"
  description: string;
  transaction_date: string;       // ISO date string
  created_at: string;
}

// ─────────────────────────────────────────────
// State Interface
// ─────────────────────────────────────────────

interface BusinessState {
  parties: BusinessParty[];
  bizTransactions: BusinessTransaction[];

  // Party CRUD
  addParty: (name: string, phone: string, party_type: PartyType, notes?: string) => void;
  updateParty: (id: string, data: Partial<Pick<BusinessParty, 'name' | 'phone' | 'notes'>>) => void;
  deleteParty: (id: string) => void;

  // Transaction CRUD
  addBizTransaction: (
    party_id: string | null,
    type: BizTxType,
    amount: number,
    category: string,
    description: string,
    date?: string
  ) => void;
  updateBizTransaction: (
    id: string,
    data: Partial<Pick<BusinessTransaction, 'amount' | 'category' | 'description' | 'transaction_date'>>
  ) => void;
  deleteBizTransaction: (id: string) => void;
}

// ─────────────────────────────────────────────
// Helper — recompute a party's running balance
// from the transaction list.
// balance > 0  → we owe them (Jama/payable)
// balance < 0  → they owe us (Udhar/receivable)
// ─────────────────────────────────────────────
function recomputeBalance(partyId: string, txns: BusinessTransaction[]): number {
  return txns
    .filter(t => t.party_id === partyId)
    .reduce((acc, t) => {
      if (t.type === 'credit') return acc + t.amount;  // credit given to us → they owe us less
      if (t.type === 'debit')  return acc - t.amount;  // debit taken → they owe us more
      if (t.type === 'income') return acc - t.amount;  // income = customer paid us
      if (t.type === 'expense') return acc + t.amount; // expense = we paid supplier
      return acc;
    }, 0);
}

const now = () => new Date().toISOString();
const isFinitePositive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;
const isValidDate = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value) && !Number.isNaN(Date.parse(value));

function hydrateBusinessState(persisted: unknown, current: BusinessState): BusinessState {
  const saved = persisted && typeof persisted === 'object' ? persisted as Partial<BusinessState> : {};
  const parties = Array.isArray(saved.parties)
    ? saved.parties.filter((party): party is BusinessParty =>
        Boolean(party) && typeof party.id === 'string' && party.id.length > 0 &&
        typeof party.name === 'string' && party.name.trim().length > 0 &&
        (party.party_type === 'customer' || party.party_type === 'supplier'))
    : [];
  const partyIds = new Set(parties.map(party => party.id));
  const bizTransactions = Array.isArray(saved.bizTransactions)
    ? saved.bizTransactions.filter((transaction): transaction is BusinessTransaction =>
        Boolean(transaction) && typeof transaction.id === 'string' &&
        (transaction.party_id === null || (typeof transaction.party_id === 'string' && partyIds.has(transaction.party_id))) &&
        (transaction.type === 'income' || transaction.type === 'expense' || transaction.type === 'credit' || transaction.type === 'debit') &&
        isFinitePositive(transaction.amount) && typeof transaction.category === 'string' &&
        typeof transaction.description === 'string' && isValidDate(transaction.transaction_date) && isValidDate(transaction.created_at))
    : [];

  return {
    ...current,
    parties: parties.map(party => ({
      ...party,
      phone: typeof party.phone === 'string' ? party.phone : '',
      notes: typeof party.notes === 'string' ? party.notes : undefined,
      created_at: isValidDate(party.created_at) ? party.created_at : now(),
      balance: recomputeBalance(party.id, bizTransactions),
    })),
    bizTransactions,
  };
}

// ─────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────
export const useBusinessStore = create<BusinessState>()(
  persist(
    (set, get) => ({
      parties: [],
      bizTransactions: [],

      // ── Party CRUD ──
      addParty: (name, phone, party_type, notes) => {
        const trimmedName = name.trim();
        if (!trimmedName || (party_type !== 'customer' && party_type !== 'supplier')) return;
        set(s => ({
          parties: [
            ...s.parties,
            { id: uuid.v4() as string, name: trimmedName, phone: phone.trim(), party_type, balance: 0, notes: notes?.trim() || undefined, created_at: now() },
          ],
        }));
      },

      updateParty: (id, data) => {
        if (!id) return;
        set(s => ({
          parties: s.parties.map(p => {
            if (p.id !== id) return p;
            const name = data.name === undefined ? p.name : data.name.trim();
            return name ? { ...p, ...data, name, phone: data.phone?.trim() ?? p.phone, notes: data.notes?.trim() || undefined } : p;
          }),
        }));
      },

      deleteParty: id =>
        set(s => ({
          parties: s.parties.filter(p => p.id !== id),
          bizTransactions: s.bizTransactions.filter(t => t.party_id !== id),
        })),

      // ── Transaction CRUD ──
      addBizTransaction: (party_id, type, amount, category, description, date) => {
        if (!isFinitePositive(amount) || !category.trim() || !isValidDate(date ?? now())) return;
        if (party_id !== null && !get().parties.some(p => p.id === party_id)) return;
        const newTx: BusinessTransaction = {
          id: uuid.v4() as string,
          party_id,
          type,
          amount,
          category: category.trim(),
          description: description.trim(),
          transaction_date: date ?? now(),
          created_at: now(),
        };
        set(s => {
          const updatedTxns = [...s.bizTransactions, newTx];
          const updatedParties = party_id
            ? s.parties.map(p =>
                p.id === party_id
                  ? { ...p, balance: recomputeBalance(party_id, updatedTxns) }
                  : p
              )
            : s.parties;
          return { bizTransactions: updatedTxns, parties: updatedParties };
        });
      },

      updateBizTransaction: (id, data) => {
        set(s => {
          const existing = s.bizTransactions.find(t => t.id === id);
          if (!existing) return s;
          const amount = data.amount ?? existing.amount;
          const category = data.category === undefined ? existing.category : data.category.trim();
          const description = data.description === undefined ? existing.description : data.description.trim();
          const transaction_date = data.transaction_date ?? existing.transaction_date;
          if (!isFinitePositive(amount) || !category || !isValidDate(transaction_date)) return s;
          const updatedTxns = s.bizTransactions.map(t =>
            t.id === id ? { ...t, amount, category, description, transaction_date } : t
          );
          // Recompute all affected party balances
          const affectedPartyId = s.bizTransactions.find(t => t.id === id)?.party_id;
          const updatedParties = affectedPartyId
            ? s.parties.map(p =>
                p.id === affectedPartyId
                  ? { ...p, balance: recomputeBalance(affectedPartyId, updatedTxns) }
                  : p
              )
            : s.parties;
          return { bizTransactions: updatedTxns, parties: updatedParties };
        });
      },

      deleteBizTransaction: id => {
        set(s => {
          const tx = s.bizTransactions.find(t => t.id === id);
          const updatedTxns = s.bizTransactions.filter(t => t.id !== id);
          const updatedParties = tx?.party_id
            ? s.parties.map(p =>
                p.id === tx.party_id
                  ? { ...p, balance: recomputeBalance(tx.party_id!, updatedTxns) }
                  : p
              )
            : s.parties;
          return { bizTransactions: updatedTxns, parties: updatedParties };
        });
      },
    }),
    {
      name: 'hisabkitab-business-ledger',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      merge: hydrateBusinessState,
    }
  )
);
