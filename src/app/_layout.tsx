import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppLockGate } from '../components/app-lock-gate';
import { initAutoSyncListeners } from '../sync';

export default function RootLayout() {
  // Initialize auto-sync lifecycle listeners on app start
  useEffect(() => {
    const cleanup = initAutoSyncListeners();
    return cleanup;
  }, []);

  return (
    <AppLockGate>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: '#1E293B',
          },
          headerTintColor: '#F8FAFC',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="person/[id]" options={{ title: 'Ledger' }} />
        <Stack.Screen name="crop/[id]" options={{ title: 'Crop Ledger' }} />
        <Stack.Screen name="profile" options={{ title: 'My Profile' }} />
        <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
      </Stack>
    </AppLockGate>
  );
}
