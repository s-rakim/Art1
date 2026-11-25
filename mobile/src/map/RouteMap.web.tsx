import 'maplibre-gl/dist/maplibre-gl.css';

import * as maplibregl from 'maplibre-gl';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { View } from 'react-native';

import { pin } from '@/theme';
import { boundsOf, mapStyle, NAIROBI, toneColor, toneLabel, type RouteMapProps } from './types';

// The worker can't be bundled; scripts/copy-map-worker.js puts it in public/.
maplibregl.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');

/** Web preview map: the same style and pins on maplibre-gl. */
export function RouteMap({ pins, line, me, onPinPress, height = 300, fitKey }: RouteMapProps) {
  const host = useRef<HTMLDivElement | null>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const press = useRef(onPinPress);
  useLayoutEffect(() => {
    press.current = onPinPress;
  });

  useEffect(() => {
    if (!host.current) return;
    const m = new maplibregl.Map({ container: host.current, style: mapStyle as maplibregl.StyleSpecification, center: [NAIROBI.lng, NAIROBI.lat], zoom: 12, attributionControl: { compact: true } });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.current = m;
    return () => m.remove();
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const draw = () => {
      const data: GeoJSON.Feature = { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: line && line.length > 1 ? line : [] } };
      const src = m.getSource('route') as maplibregl.GeoJSONSource | undefined;
      if (src) src.setData(data);
      else {
        m.addSource('route', { type: 'geojson', data });
        m.addLayer({ id: 'route-casing', type: 'line', source: 'route', paint: { 'line-color': '#fff', 'line-width': 8 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
        m.addLayer({ id: 'route-line', type: 'line', source: 'route', paint: { 'line-color': pin.route, 'line-width': 5 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
      }
    };
    if (m.isStyleLoaded()) draw();
    else m.once('load', draw);
  }, [line]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    markers.current.forEach((x) => x.remove());
    markers.current = [];
    for (const p of pins) {
      const el = document.createElement('button');
      el.type = 'button';
      el.setAttribute('aria-label', `${p.label ?? 'Stop'}, ${toneLabel[p.tone]}`);
      Object.assign(el.style, {
        width: '30px', height: '30px', borderRadius: '50%', border: '3px solid #fff', cursor: onPinPress ? 'pointer' : 'default',
        background: toneColor[p.tone], opacity: p.tone === 'blocked' ? '0.35' : '1', color: p.tone === 'pending' ? '#3d3000' : '#fff',
        font: '700 12px system-ui', boxShadow: '0 1px 4px rgba(0,0,0,.35)', padding: '0',
      });
      el.textContent = p.tone === 'shop' ? '⌂' : p.order != null ? String(p.order) : '';
      el.onclick = () => press.current?.(p.id);
      markers.current.push(new maplibregl.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(m));
    }
    if (me) {
      const dot = document.createElement('div');
      dot.setAttribute('aria-label', 'Your location');
      Object.assign(dot.style, { width: '16px', height: '16px', borderRadius: '50%', background: pin.rider, border: '4px solid #fff', boxShadow: '0 0 0 2px rgba(0,103,158,.25)' });
      markers.current.push(new maplibregl.Marker({ element: dot }).setLngLat([me.lng, me.lat]).addTo(m));
    }
  }, [pins, me, onPinPress]);

  useEffect(() => {
    const m = map.current;
    const b = boundsOf([...pins.filter((p) => p.tone !== 'blocked'), ...(me ? [me] : [])]);
    if (m && b) m.fitBounds(b, { padding: 48, duration: 0, maxZoom: 15 });
    // Only re-fit when the caller says the set of stops changed, not on every location tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, pins.length]);

  return (
    <View style={{ height, overflow: 'hidden' }}>
      <div ref={host} style={{ width: '100%', height: '100%' }} />
    </View>
  );
}
