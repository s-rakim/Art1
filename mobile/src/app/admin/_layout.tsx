import { Tabs } from 'expo-router/tabs';

import { Guard } from '@/lib/guard';
import { tabIcon, tabOptions } from '@/ui/tabs';

export default function AdminLayout() {
  return (
    <Guard area="admin">
      <Tabs screenOptions={tabOptions}>
        <Tabs.Screen name="index" options={{ title: 'Live', tabBarIcon: tabIcon('radar') }} />
        <Tabs.Screen name="riders" options={{ title: 'Riders', tabBarIcon: tabIcon('moped') }} />
        <Tabs.Screen name="payments" options={{ title: 'Payments', tabBarIcon: tabIcon('cash-check') }} />
        <Tabs.Screen name="ledger" options={{ title: 'Ledger', tabBarIcon: tabIcon('book-open-variant') }} />
        <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: tabIcon('cog') }} />
      </Tabs>
    </Guard>
  );
}
