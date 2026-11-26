import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

/** The rider's own position for the map, while the screen is open and permission is given. */
export function useMyPosition(active: boolean) {
  const [pos, setPos] = useState<{ lat: number; lng: number; heading: number | null } | null>(null);
  useEffect(() => {
    if (!active) return;
    let sub: Location.LocationSubscription | undefined;
    let cancelled = false;
    (async () => {
      const perm = await Location.getForegroundPermissionsAsync();
      if (perm.status !== 'granted' || cancelled) return;
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 15, timeInterval: 5000 },
        (l) => setPos({ lat: l.coords.latitude, lng: l.coords.longitude, heading: l.coords.heading ?? null }),
      );
    })();
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [active]);
  return pos;
}
