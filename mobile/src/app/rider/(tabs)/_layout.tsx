import { Tabs } from 'expo-router/tabs';

import { tabIcon, tabOptions } from '@/ui/tabs';

export default function RiderTabs() {
  return (
    <Tabs screenOptions={tabOptions}>
      <Tabs.Screen name="index" options={{ title: 'Run', tabBarIcon: tabIcon('map-marker-path') }} />
      <Tabs.Screen name="earnings" options={{ title: 'Earnings', tabBarIcon: tabIcon('cash-multiple') }} />
      <Tabs.Screen name="account" options={{ title: 'Account', tabBarIcon: tabIcon('account-circle') }} />
    </Tabs>
  );
}
