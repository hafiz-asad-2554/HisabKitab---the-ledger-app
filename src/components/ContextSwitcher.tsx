import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter, usePathname } from 'expo-router';
import { COLORS } from '../theme';

export type FinancialPillar = 'home' | 'crops' | 'business' | 'capital';

interface ContextOption {
  id: FinancialPillar;
  name: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  route: string;
}

const CONTEXT_OPTIONS: ContextOption[] = [
  { id: 'home', name: 'Home & Personal', icon: 'home', route: '/(tabs)' },
  { id: 'crops', name: 'Agriculture', icon: 'agriculture', route: '/(tabs)/crops' },
  { id: 'business', name: 'Business Ledger', icon: 'store', route: '/(tabs)/business' },
  { id: 'capital', name: 'Capital Projects', icon: 'account-balance-wallet', route: '/(tabs)/capital' },
];

interface ContextSwitcherProps {
  activePillar?: FinancialPillar;
}

export function ContextSwitcher({ activePillar }: ContextSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname();

  // Determine active context if not explicitly provided
  const currentPillar = activePillar || (() => {
    if (pathname.includes('crops') || pathname.includes('crop')) return 'crops';
    if (pathname.includes('business')) return 'business';
    if (pathname.includes('capital')) return 'capital';
    return 'home';
  })();

  return (
    <View style={styles.container}>
      <Text style={styles.label}>FINANCIAL PILLARS</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {CONTEXT_OPTIONS.map((opt) => {
          const isActive = currentPillar === opt.id;
          return (
            <TouchableOpacity
              key={opt.id}
              style={[styles.pill, isActive && styles.pillActive]}
              onPress={() => {
                if (!isActive) {
                  router.push(opt.route as any);
                }
              }}
              activeOpacity={0.75}
            >
              <MaterialIcons
                name={opt.icon}
                size={18}
                color={isActive ? '#FFFFFF' : COLORS.textSecondary}
              />
              <Text style={[styles.pillText, isActive && styles.pillTextActive]}>
                {opt.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 10,
    backgroundColor: COLORS.background,
  },
  label: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.textMuted,
    letterSpacing: 1,
    paddingHorizontal: 16,
    marginBottom: 6,
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  pillActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  pillTextActive: {
    color: '#FFFFFF',
  },
});
