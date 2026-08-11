import { Tabs } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';

const options = {
  headerStyle: { backgroundColor: '#0F172A' },
  headerTintColor: '#F8FAFC',
  tabBarStyle: { backgroundColor: '#111827', borderTopColor: '#243044' },
  tabBarActiveTintColor: '#10B981',
  tabBarInactiveTintColor: '#94A3B8',
};

export default function TabsLayout() {
  return (
    <Tabs screenOptions={options}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'HisabKitab',
          tabBarLabel: 'Home',
          tabBarIcon: ({ color, size }) => <MaterialIcons name="home" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="crops"
        options={{
          title: 'Business & Crop',
          tabBarLabel: 'Business',
          tabBarIcon: ({ color, size }) => <MaterialIcons name="agriculture" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="share"
        options={{
          title: 'Share Ledger',
          tabBarLabel: 'Share Ledger',
          tabBarIcon: ({ color, size }) => <MaterialIcons name="share" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: 'Smart Reports',
          tabBarLabel: 'Reports',
          tabBarIcon: ({ color, size }) => <MaterialIcons name="assessment" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarLabel: 'More',
          tabBarIcon: ({ color, size }) => <MaterialIcons name="more-horiz" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
