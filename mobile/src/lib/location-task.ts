import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { config } from './config';
import { accessToken } from './supabase';

/**
 * Background location for riders on shift. Android shows a permanent
 * notification while it runs (required by the OS, and honest with the rider).
 * It stops when the rider goes off shift. Nothing is tracked off shift.
 */
export const LOCATION_TASK = 'bazaar-rider-location';

export async function postLocation(c: Location.LocationObjectCoords) {
  const token = await accessToken();
  if (!token || !config.apiUrl) return;
  await fetch(`${config.apiUrl}/api/v1/rider/location`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      lat: c.latitude,
      lng: c.longitude,
      accuracy_m: c.accuracy != null ? Math.min(Math.max(c.accuracy, 0), 10_000) : null,
      heading: c.heading != null && c.heading >= 0 && c.heading < 360 ? c.heading : null,
      speed_mps: c.speed != null && c.speed >= 0 ? Math.min(c.speed, 100) : null,
    }),
  }).catch(() => undefined);
}

if (Platform.OS !== 'web') {
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
    if (error || !data?.locations?.length) return;
    const latest = data.locations[data.locations.length - 1];
    await postLocation(latest.coords);
  });
}

export type PermissionResult = 'granted' | 'foreground_only' | 'denied';

/** Ask in two steps, as both stores require: while using the app, then all the time. */
export async function askLocation(background: boolean): Promise<PermissionResult> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return 'denied';
  if (!background || Platform.OS === 'web') return 'foreground_only';
  const bg = await Location.requestBackgroundPermissionsAsync();
  return bg.status === 'granted' ? 'granted' : 'foreground_only';
}

export async function startSharing() {
  if (Platform.OS === 'web') return;
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false)) return;
  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: 12_000,
    distanceInterval: 25,
    pausesUpdatesAutomatically: false,
    activityType: Location.ActivityType.AutomotiveNavigation,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'The Bazaar: on shift',
      notificationBody: 'Sharing your location with your customers and the dispatch desk.',
      notificationColor: '#00679e',
    },
  });
}

export async function stopSharing() {
  if (Platform.OS === 'web') return;
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false)) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  }
}
