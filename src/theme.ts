export const COLORS = {
  // ── Balance / P&L ──
  profit: '#10B981',    // Emerald Green — income, receivables, positive balance
  loss:   '#EF4444',    // Crimson Red   — expenses, debts, negative balance

  // ── Backgrounds ──
  background: '#0F172A',
  surface:    '#1E293B',
  surfaceAlt: '#263348',

  // ── Text ──
  textPrimary:   '#F8FAFC',
  textSecondary: '#94A3B8',
  textMuted:     '#64748B',

  // ── Border / Divider ──
  border: '#334155',

  // ── Primary Actions (Slate Blue) ──
  accent: '#3B82F6',
  accentDark: '#1D4ED8',

  // ── Header / Navigation ──
  headerBlue: '#2563EB',

  // ── Warning (budget threshold) ──
  warning:   '#F59E0B',
  warningBg: '#78350F',

  // ── Capital Pool module ──
  poolBudget:  '#8B5CF6',  // Purple — total budget
  poolSpent:   '#EF4444',  // Crimson — spent
  poolRemain:  '#10B981',  // Emerald — remaining

  // ── Business module ──
  customer: '#3B82F6',   // Blue — customer/receivable
  supplier: '#A78BFA',   // Violet — supplier/payable

  // ── Status badges ──
  badgeActive:    '#2563EB',
  badgeCompleted: '#475569',
  badgeSuccess:   '#047857',
};

export const SHADOWS = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
};

export const FONT_FAMILY = 'Inter'; // loaded via expo-font
