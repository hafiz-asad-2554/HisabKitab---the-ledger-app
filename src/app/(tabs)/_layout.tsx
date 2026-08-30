import { Tabs } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';

const options = {
  headerStyle:            { backgroundColor: '#0F172A' },
  headerTintColor:        '#F8FAFC',
  tabBarStyle:            { backgroundColor: '#111827', borderTopColor: '#243044' },
  tabBarActiveTintColor:  '#10B981',
  tabBarInactiveTintColor:'#94A3B8',
};

export default function TabsLayout() {
  return (
    <Tabs screenOptions={options}>
      {/* ── Tab 1: Home (Home & Personal pillar + global view) ── */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'HisabKitab',
          tabBarLabel: 'Home',
          tabBarIcon: ({ color, size }) => <MaterialIcons name="home" size={size} color={color} />,
        }}
      />

      {/* ── Tab 2: Share / Sync ── */}
      <Tabs.Screen
        name="share"
        options={{
          title: 'Share Ledger',
          tabBarLabel: 'Share',
          tabBarIcon: ({ color, size }) => <MaterialIcons name="share" size={size} color={color} />,
        }}
      />

      {/* ── Tab 3: Smart Reports ── */}
      <Tabs.Screen
        name="reports"
        options={{
          title: 'Smart Reports',
          tabBarLabel: 'Reports',
          tabBarIcon: ({ color, size }) => <MaterialIcons name="assessment" size={size} color={color} />,
        }}
      />

      {/* ── Tab 4: More (Settings + relocated pillars: Crops, Business, Capital) ── */}
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarLabel: 'More',
          tabBarIcon: ({ color, size }) => <MaterialIcons name="more-horiz" size={size} color={color} />,
        }}
      />

      {/* ── Relocated screens: still registered as routes but hidden from the tab bar ── */}
      <Tabs.Screen
        name="crops"
        options={{
          title: 'Agriculture',
          href: null,  // hides from tab bar; route still navigable via router.push('/(tabs)/crops')
        }}
      />
      <Tabs.Screen
        name="business"
        options={{
          title: 'Business Ledger',
          href: null,
        }}
      />
      <Tabs.Screen
        name="capital"
        options={{
          title: 'Capital Pools',
          href: null,
        }}
      />
    </Tabs>
  );
}
