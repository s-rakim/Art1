import { Redirect } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { color } from '@/theme';
import { areaFor, useAuth, type Area } from './auth';

/**
 * Keeps each area to its own role. This is for navigation only; the API
 * refuses the calls anyway when the role doesn't match.
 */
export function Guard({ area, children }: { area: Area; children: ReactNode }) {
  const { ready, session, me } = useAuth();
  if (!ready || (session && !me)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: color.mainBackground }}>
        <ActivityIndicator color={color.primary} accessibilityLabel="Loading" />
      </View>
    );
  }
  if (!session) return <Redirect href="/login" />;
  if (areaFor(me) !== area) return <Redirect href="/" />;
  return <>{children}</>;
}
