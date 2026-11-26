import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { areaFor, useAuth } from '@/lib/auth';
import { color } from '@/theme';
import { Button, Empty } from '@/ui';

export const homeFor = { customer: '/shop', vendor: '/vendor', rider: '/rider', admin: '/admin', applicant: '/apply' } as const;

/** Sends each account to its own area after sign in. */
export default function Index() {
  const { ready, session, me, meError, refetchMe, signOut } = useAuth();
  if (!ready || (session && !me && !meError)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: color.backgroundPlain }}>
        <ActivityIndicator color="#fff" size="large" accessibilityLabel="Loading" />
      </View>
    );
  }
  if (!session) return <Redirect href="/login" />;
  if (meError || !me) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
        <Empty icon="cloud-off-outline" title="Can't reach The Bazaar" body={meError?.message} action={{ title: 'Try again', onPress: refetchMe }} />
        <Button title="Sign out" variant="ghost" onPress={signOut} />
      </View>
    );
  }
  return <Redirect href={homeFor[areaFor(me)!]} />;
}
