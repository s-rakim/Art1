import { Camera, GeoJSONSource, Layer, Map, Marker, type MapProps } from '@maplibre/maplibre-react-native';
import { Pressable, View } from 'react-native';

import { pin } from '@/theme';
import { PinBadge } from './PinBadge';
import { boundsOf, mapStyle, NAIROBI, toneLabel, type RouteMapProps } from './types';

/** Android and iOS map (MapLibre native, OpenStreetMap tiles, no Google key needed). */
export function RouteMap({ pins, line, me, onPinPress, height = 300, fitKey }: RouteMapProps) {
  // Fit to what the rider can act on; far-off greyed jobs stay off screen.
  const bounds = boundsOf([...pins.filter((p) => p.tone !== 'blocked'), ...(me ? [me] : [])]);
  return (
    <View style={{ height, overflow: 'hidden' }}>
      <Map style={{ flex: 1 }} mapStyle={mapStyle as MapProps['mapStyle']} logo={false} attribution attributionPosition={{ bottom: 6, right: 6 }}>
        <Camera
          key={fitKey}
          initialViewState={
            bounds
              ? { bounds, padding: { top: 48, bottom: 48, left: 48, right: 48 } }
              : { center: [NAIROBI.lng, NAIROBI.lat], zoom: 12 }
          }
        />
        {line && line.length > 1 ? (
          <GeoJSONSource id="route" data={{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: line } }}>
            <Layer id="route-casing" type="line" paint={{ 'line-color': '#ffffff', 'line-width': 8 }} layout={{ 'line-cap': 'round', 'line-join': 'round' }} />
            <Layer id="route-line" type="line" paint={{ 'line-color': pin.route, 'line-width': 5 }} layout={{ 'line-cap': 'round', 'line-join': 'round' }} />
          </GeoJSONSource>
        ) : null}
        {pins.map((p) => (
          <Marker key={p.id} id={p.id} lngLat={[p.lng, p.lat]} anchor="center">
            <Pressable
              onPress={onPinPress ? () => onPinPress(p.id) : undefined}
              accessibilityRole={onPinPress ? 'button' : 'image'}
              accessibilityLabel={`${p.label ?? 'Stop'}, ${toneLabel[p.tone]}`}
              hitSlop={8}
            >
              <PinBadge tone={p.tone} order={p.order} />
            </Pressable>
          </Marker>
        ))}
        {me ? (
          <Marker id="me" lngLat={[me.lng, me.lat]} anchor="center">
            <View accessibilityLabel="Your location">
              <PinBadge tone="rider" />
            </View>
          </Marker>
        ) : null}
      </Map>
    </View>
  );
}
