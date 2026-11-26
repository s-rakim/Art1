import { Stack } from 'expo-router';

import { Guard } from '@/lib/guard';

/** Tabs for the main screens, with detail screens stacked on top so Back works. */
export default function ShopLayout() {
  return (
    <Guard area="customer">
      <Stack screenOptions={{ headerShown: false }} />
    </Guard>
  );
}
