import { Tabs } from 'expo-router/tabs';

import { tabIcon, tabOptions } from '@/ui/tabs';

export default function VendorTabs() {
  return (
    <Tabs screenOptions={tabOptions}>
      <Tabs.Screen name="index" options={{ title: 'Orders', tabBarIcon: tabIcon('clipboard-list') }} />
      <Tabs.Screen name="stock" options={{ title: 'Stock', tabBarIcon: tabIcon('warehouse') }} />
      <Tabs.Screen name="products" options={{ title: 'Products', tabBarIcon: tabIcon('tag-multiple') }} />
      <Tabs.Screen name="ledger" options={{ title: 'Ledger', tabBarIcon: tabIcon('book-open-variant') }} />
      <Tabs.Screen name="account" options={{ title: 'Account', tabBarIcon: tabIcon('account-circle') }} />
    </Tabs>
  );
}
