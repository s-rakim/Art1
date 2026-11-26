import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { Linking, Platform, View } from 'react-native';

import { useAuth } from '@/lib/auth';
import { config } from '@/lib/config';
import { color } from '@/theme';
import { Button, Card, H2, Header, Notice, Screen, T, confirm } from '@/ui';

/** Account page shared by every role. */
export function AccountScreen({ role, children }: { role: string; children?: React.ReactNode }) {
  const { me, signOut } = useAuth();
  const [bg, setBg] = useState<string | null>(null);
  useEffect(() => {
    if (role === 'Rider' && Platform.OS !== 'web') Location.getBackgroundPermissionsAsync().then((p) => setBg(p.status));
  }, [role]);
  return (
    <View style={{ flex: 1, backgroundColor: color.mainBackground }}>
      <Header title={me?.full_name ?? 'Account'} subtitle={`${role} · ${me?.email ?? ''}`} />
      <Screen>
        {children}
        {role === 'Rider' && bg && bg !== 'granted' ? (
          <Notice tone="warning" icon="map-marker-alert" text='Location is shared only while the app is open. Set location to "Allow all the time" so dispatch can see you between stops.' />
        ) : null}
        {role === 'Rider' && bg && bg !== 'granted' ? <Button title="Open settings" variant="secondary" onPress={() => Linking.openSettings()} /> : null}
        <Card>
          <H2>Privacy</H2>
          <T muted>
            {role === 'Rider'
              ? 'Your location is shared only while you are on shift, with the dispatch desk and with the customers whose orders you carry.'
              : 'Your sign-in is kept in your phone\'s secure keychain and is removed when you sign out.'}
          </T>
        </Card>
        <Card>
          <T small muted>
            {config.appName} · connected to {config.apiUrl.replace(/^https?:\/\//, '') || 'no server set'}
          </T>
        </Card>
        <Button
          title="Sign out"
          variant="danger"
          icon="logout"
          onPress={async () => {
            if (await confirm('Sign out?', role === 'Rider' ? 'Go off shift first if you are still riding.' : 'You can sign back in with your email.', 'Sign out')) signOut();
          }}
        />
      </Screen>
    </View>
  );
}
