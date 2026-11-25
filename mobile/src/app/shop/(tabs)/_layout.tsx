import { useQuery } from '@tanstack/react-query';
import { Tabs } from 'expo-router/tabs';

import { api, unwrap } from '@/api/client';
import { tabIcon, tabOptions } from '@/ui/tabs';

export default function ShopTabs() {
  const cart = useQuery({ queryKey: ['cart'], queryFn: () => unwrap(api.GET('/api/v1/cart')) });
  const count = cart.data?.item_count ?? 0;
  return (
    <Tabs screenOptions={tabOptions}>
      <Tabs.Screen name="index" options={{ title: 'Shop', tabBarIcon: tabIcon('storefront') }} />
      <Tabs.Screen name="wishlist" options={{ title: 'Wishlist', tabBarIcon: tabIcon('heart') }} />
      <Tabs.Screen name="cart" options={{ title: 'Cart', tabBarIcon: tabIcon('cart'), tabBarBadge: count ? count : undefined }} />
      <Tabs.Screen name="orders" options={{ title: 'Orders', tabBarIcon: tabIcon('package-variant') }} />
      <Tabs.Screen name="account" options={{ title: 'Account', tabBarIcon: tabIcon('account-circle') }} />
    </Tabs>
  );
}
