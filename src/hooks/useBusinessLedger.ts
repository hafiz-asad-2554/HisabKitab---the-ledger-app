import { useMemo } from 'react';
import { useBusinessStore, BusinessTransaction } from '../store/businessStore';

const finitePositive = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;

export interface PnLSummary {
  revenue: number;      // sum of all income-type transactions
  expenses: number;     // sum of all expense-type transactions (incl. COGS)
  netProfit: number;    // revenue - expenses
  cashIn: number;       // cash_in transactions (no party)
  cashOut: number;      // cash_out transactions (no party)
  txCount: number;
}

/**
 * Compute global business P&L for an optional date range.
 * dateFrom / dateTo are ISO date strings "YYYY-MM-DD".
 */
export function useBusinessPnL(dateFrom?: string, dateTo?: string): PnLSummary {
  const txns = useBusinessStore(s => s.bizTransactions);

  return useMemo(() => {
    const filtered = txns.filter(t => {
      if (typeof t.transaction_date !== 'string') return false;
      if (dateFrom && t.transaction_date < dateFrom) return false;
      if (dateTo   && t.transaction_date > dateTo)   return false;
      return true;
    });

    const revenue  = filtered.filter(t => t.type === 'income').reduce((a, t) => a + finitePositive(t.amount), 0);
    const expenses = filtered.filter(t => t.type === 'expense').reduce((a, t) => a + finitePositive(t.amount), 0);
    const cashIn   = filtered.filter(t => t.type === 'credit' && !t.party_id).reduce((a, t) => a + finitePositive(t.amount), 0);
    const cashOut  = filtered.filter(t => t.type === 'debit'  && !t.party_id).reduce((a, t) => a + finitePositive(t.amount), 0);

    return {
      revenue,
      expenses,
      netProfit: revenue - expenses,
      cashIn,
      cashOut,
      txCount: filtered.length,
    };
  }, [txns, dateFrom, dateTo]);
}

/**
 * Compute P&L for a specific party.
 */
export function usePartyPnL(partyId: string): {
  totalCredit: number;
  totalDebit: number;
  balance: number;
  txns: BusinessTransaction[];
} {
  const allTxns  = useBusinessStore(s => s.bizTransactions);
  const party    = useBusinessStore(s => s.parties.find(p => p.id === partyId));

  return useMemo(() => {
    const partyTxns = allTxns.filter(t => t.party_id === partyId)
      .sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));

    const totalCredit = partyTxns
      .filter(t => t.type === 'income' || t.type === 'credit')
      .reduce((a, t) => a + finitePositive(t.amount), 0);

    const totalDebit  = partyTxns
      .filter(t => t.type === 'expense' || t.type === 'debit')
      .reduce((a, t) => a + finitePositive(t.amount), 0);

    return {
      totalCredit,
      totalDebit,
      balance: party?.balance ?? 0,
      txns: partyTxns,
    };
  }, [allTxns, partyId, party]);
}
