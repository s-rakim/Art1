import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Session storage for the Supabase client.
 *
 * On phones the tokens live in the Keychain (iOS) or the Android Keystore via
 * expo-secure-store, never in AsyncStorage. SecureStore values are capped at
 * about 2 KB, and a Supabase session is larger, so values are split into
 * numbered chunks. Items are readable only while the device is unlocked and
 * are not migrated to a new phone through backups.
 *
 * The web preview has no keychain, so it falls back to sessionStorage, which
 * is cleared when the tab closes.
 */
const CHUNK = 1800;
const opts: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

const safeKey = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, '_');

async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') return globalThis.sessionStorage?.getItem(key) ?? null;
  const k = safeKey(key);
  const count = await SecureStore.getItemAsync(`${k}.n`, opts);
  if (!count) return null;
  const parts: string[] = [];
  for (let i = 0; i < Number(count); i++) {
    const part = await SecureStore.getItemAsync(`${k}.${i}`, opts);
    if (part == null) return null;
    parts.push(part);
  }
  return parts.join('');
}

async function removeItem(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    globalThis.sessionStorage?.removeItem(key);
    return;
  }
  const k = safeKey(key);
  const count = Number((await SecureStore.getItemAsync(`${k}.n`, opts)) ?? 0);
  for (let i = 0; i < count; i++) await SecureStore.deleteItemAsync(`${k}.${i}`, opts);
  await SecureStore.deleteItemAsync(`${k}.n`, opts);
}

async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    globalThis.sessionStorage?.setItem(key, value);
    return;
  }
  await removeItem(key);
  const k = safeKey(key);
  const chunks = Math.ceil(value.length / CHUNK) || 1;
  for (let i = 0; i < chunks; i++) {
    await SecureStore.setItemAsync(`${k}.${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK), opts);
  }
  await SecureStore.setItemAsync(`${k}.n`, String(chunks), opts);
}

export const secureStorage = { getItem, setItem, removeItem };
