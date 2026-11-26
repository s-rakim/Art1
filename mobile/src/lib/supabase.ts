import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { config } from './config';
import { secureStorage } from './secure-storage';

export const supabase = createClient(config.supabaseUrl || 'https://invalid.local', config.supabaseAnonKey || 'missing', {
  auth: {
    storage: secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});

// Refresh tokens only while the app is in the foreground, as Supabase recommends for React Native.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

export async function accessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
