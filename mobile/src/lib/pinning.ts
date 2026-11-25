import { Platform } from 'react-native';

import { apiHost, config } from './config';

/**
 * Public key pinning for the API host on Android and iOS. The phone refuses
 * to talk to the API unless the server's key matches one of the pins, which
 * stops a proxy with a user-installed CA from reading traffic. Needs a dev
 * client or release build (not Expo Go). Off until at least two pins are set
 * (current key plus a backup), so a certificate renewal can't lock riders out.
 */
export async function startPinning() {
  if (Platform.OS === 'web' || config.apiPins.length < 2 || !apiHost) return;
  try {
    const mod = await import('react-native-ssl-public-key-pinning');
    if (!mod.isSslPinningAvailable()) return;
    await mod.initializeSslPinning({
      [apiHost]: { includeSubdomains: false, publicKeyHashes: config.apiPins },
    });
  } catch (e) {
    console.warn('[pinning] not started', e);
  }
}
