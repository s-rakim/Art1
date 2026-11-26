import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { api, unwrap } from '@/api/client';
import { label, money } from '@/lib/format';
import { useLive } from '@/lib/live';
import { RouteMap } from '@/map/RouteMap';
import type { MapPin } from '@/map/types';
import { color, space } from '@/theme';
import { Badge, Card, ErrorText, H2, Header, IconButton, Notice, Row, Screen, Skeleton, T } from '@/ui';

/** Order detail with live tracking of every rider carrying part of it. */
export default function Order() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const order = useQuery({ queryKey: ['order', id], queryFn: () => unwrap(api.GET('/api/v1/orders/{order_id}', { params: { path: { order_id: id } } })) });
  const track = useQuery({
    queryKey: ['tracking', id],
    queryFn: () => unwrap(api.GET('/api/v1/orders/{order_id}/tracking', { params: { path: { order_id: id } } })),
    refetchInterval: 20_000,
  });
  const deliveryIds = (track.data?.deliveries ?? []).map((d) => d.delivery_id).filter((x): x is string => !!x);
  useLive([{ scope: 'me' }, ...deliveryIds.map((delivery_id) => ({ delivery_id }))], () => {
    track.refetch();
    order.refetch();
  });

  const o = order.data;
  const t = track.data;
  const pins: MapPin[] = [];
  const riders = (t?.deliveries ?? []).filter((d) => d.rider_position);
  for (const d of t?.deliveries ?? []) {
    if (d.dropoff && !pins.some((p) => p.id === 'drop')) pins.push({ id: 'drop', ...d.dropoff, tone: 'active', label: 'Your drop-off' });
    if (d.pickup) pins.push({ id: `shop-${d.store_name}`, ...d.pickup, tone: 'shop', label: d.store_name });
    if (d.rider_position) pins.push({ id: `rider-${d.delivery_id}`, lat: d.rider_position.lat, lng: d.rider_position.lng, tone: 'rider', label: `${d.rider?.name ?? 'Rider'} on the way` });
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.mainBackground }}>
      <Header title={o ? `Order ${o.number}` : 'Order'} subtitle={o ? label(o.status) : undefined} right={<IconButton icon="arrow-left" label="Back" tint="#fff" onPress={() => router.back()} />} />
      <Screen padded={false} refreshing={order.isRefetching} onRefresh={() => { order.refetch(); track.refetch(); }}>
        {pins.length ? <RouteMap pins={pins} height={260} fitKey={String(riders.length)} /> : null}
        <View style={{ padding: space.l, gap: space.m }}>
          {!o ? order.error ? <ErrorText>{order.error.message}</ErrorText> : <Skeleton rows={3} /> : null}
          {t?.deliveries.map((d, i) => (
            <Card key={d.delivery_id ?? i}>
              <Row style={{ justifyContent: 'space-between' }}>
                <T bold>{d.store_name}</T>
                <Badge tone={d.status === 'delivered' ? 'success' : 'info'} text={label(d.status)} />
              </Row>
              {d.rider ? (
                <T small muted>
                  {d.rider.name} · {d.rider.vehicle.replace('_', ' ')}
                  {d.eta_minutes != null ? ` · about ${d.eta_minutes} min away` : ''}
                </T>
              ) : (
                <T small muted>
                  Waiting for a rider
                </T>
              )}
              {d.handover_code ? (
                <Notice tone="primary" icon="key" text={`Delivery code: ${d.handover_code}. Give it to the rider once you have your items.`} />
              ) : null}
            </Card>
          ))}
          {o ? (
            <Card>
              <H2>Summary</H2>
              {o.shipments.flatMap((sh) => sh.items).map((it) => (
                <Row key={it.id} style={{ justifyContent: 'space-between' }}>
                  <T lines={1} style={{ flex: 1 }}>
                    {it.quantity} × {it.title}
                  </T>
                  <T>{money(it.line_total_cents, o.currency)}</T>
                </Row>
              ))}
              <Row style={{ justifyContent: 'space-between' }}>
                <T muted>Delivery</T>
                <T>{money(o.shipping_cents, o.currency)}</T>
              </Row>
              <Row style={{ justifyContent: 'space-between' }}>
                <T bold>Total</T>
                <T bold>{money(o.total_cents, o.currency)}</T>
              </Row>
              {!o.paid_at ? <T small muted>Pay when the rider arrives, with {o.number} as the reference.</T> : <Badge tone="success" text="Paid" />}
            </Card>
          ) : null}
        </View>
      </Screen>
    </View>
  );
}
