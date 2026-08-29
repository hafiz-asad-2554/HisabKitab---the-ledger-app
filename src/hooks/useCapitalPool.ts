import { useMemo } from 'react';
import { useCapitalStore, CapitalExpense } from '../store/capitalStore';

export const BUDGET_WARNING_THRESHOLD = 0.80; // 80% exhaustion → warning
const finite = (value: unknown): number => typeof value === 'number' && Number.isFinite(value) ? value : 0;

export interface PoolSummary {
  totalBudget: number;
  totalSpent: number;
  remaining: number;
  percentUsed: number;       // 0–1
  isWarning: boolean;        // percentUsed >= 0.80
  isOverBudget: boolean;
  expensesByCategory: Record<string, number>;
  expenses: CapitalExpense[];
}

/**
 * Derive live summary metrics for a single capital pool.
 */
export function useCapitalPoolSummary(poolId: string): PoolSummary {
  const pool     = useCapitalStore(s => s.capitalPools.find(p => p.id === poolId));
  const allExps  = useCapitalStore(s => s.capitalExpenses);

  return useMemo(() => {
    const expenses = allExps.filter(e => e.pool_id === poolId);
    const totalBudget = Math.max(0, finite(pool?.total_budget));
    const totalSpent  = expenses.reduce((a, e) => a + Math.max(0, finite(e.total_cost)), 0);
    const remaining   = totalBudget - totalSpent;
    const percentUsed = totalBudget > 0 ? totalSpent / totalBudget : 0;

    const expensesByCategory = expenses.reduce<Record<string, number>>((acc, e) => {
      const category = typeof e.category === 'string' && e.category.trim() ? e.category : 'Other';
      acc[category] = (acc[category] ?? 0) + Math.max(0, finite(e.total_cost));
      return acc;
    }, {});

    return {
      totalBudget,
      totalSpent,
      remaining,
      percentUsed,
      isWarning:    percentUsed >= BUDGET_WARNING_THRESHOLD && !( percentUsed >= 1),
      isOverBudget: percentUsed >= 1,
      expensesByCategory,
      expenses,
    };
  }, [pool, allExps, poolId]);
}

/**
 * Aggregate stats across all pools (dashboard view).
 */
export function useAllPoolsSummary() {
  const pools    = useCapitalStore(s => s.capitalPools);
  const allExps  = useCapitalStore(s => s.capitalExpenses);

  return useMemo(() => {
    const totalBudget = pools.reduce((a, p) => a + Math.max(0, finite(p.total_budget)), 0);
    const totalSpent  = allExps.reduce((a, e) => a + Math.max(0, finite(e.total_cost)), 0);
    const warningCount = pools.filter(p => {
      const budget = Math.max(0, finite(p.total_budget));
      const spent = allExps.filter(e => e.pool_id === p.id).reduce((a, e) => a + Math.max(0, finite(e.total_cost)), 0);
      const pct = budget > 0 ? spent / budget : 0;
      return pct >= BUDGET_WARNING_THRESHOLD;
    }).length;

    return { totalBudget, totalSpent, remaining: totalBudget - totalSpent, warningCount, poolCount: pools.length };
  }, [pools, allExps]);
}
