import { useQuery } from '@tanstack/react-query';
import { View } from 'react-native';

import { api, unwrap } from '@/api/client';
import { useAuth } from '@/lib/auth';
import { greeting, label, money, timeAgo } from '@/lib/format';
import { useLiveRefresh } from '@/lib/live';
import { RouteMap } from '@/map/RouteMap';
import type { MapPin } from '@/map/types';
import { color, space } from '@/theme';
import { Badge, Card, Empty, ErrorText, H2, Header, Row, Screen, Skeleton, Stat, T } from '@/ui';

/** Admin home: the last 30 days in numbers and every delivery and rider on the map, live. */
export default function AdminLive() {
  const { me } = useAuth();
  const stats = useQuery({ queryKey: ['admin', 'stats'], queryFn: () => unwrap(api.GET('/api/v1/admin/stats')) });
  const live = useQuery({ queryKey: ['admin', 'live'], queryFn: () => unwrap(api.GET('/api/v1/admin/deliveries')), refetchInterval: 20_000 });
  useLiveRefresh([{ scope: 'admin' }], [['admin', 'live']]);

  const pins: MapPin[] = [];
  for (const d of live.data?.deliveries ?? []) {
    if (d.dropoff) pins.push({ id: `d-${d.id}`, ...d.dropoff, tone: d.status === 'delivered' ? 'done' : 'active', label: `${d.order_number} for ${d.store_name}` });
  }
  for (const r of live.data?.riders ?? []) {
    if (r.lat != null && r.lng != null) pins.push({ id: `r-${r.id}`, lat: r.lat, lng: r.lng, tone: r.busy ? 'shop' : 'pending', label: `${r.name}, ${r.busy ? 'on a run' : 'free'}` });
  }
  const s = stats.data;

  return (
    <View style={{ flex: 1, backgroundColor: color.mainBackground }}>
      <Header title={greeting(me?.first_name)} subtitle="The Bazaar, live" />
      <Screen padded={false} refreshing={live.isRefetching} onRefresh={() => { live.refetch(); stats.refetch(); }}>
        <RouteMap pins={pins} height={300} fitKey={String(pins.length)} />
        <View style={{ padding: space.l, gap: space.m }}>
          <Row gap={space.m} style={{ flexWrap: 'wrap' }}>
            <T small muted>Blue: rider on a run</T>
            <T small muted>Yellow: rider free</T>
            <T small muted>Red: drop-off in progress</T>
          </Row>
          {s ? (
            <Row gap={space.s} style={{ flexWrap: 'wrap' }}>
              <Stat icon="cart" label="Orders, 30 days" value={String(s.orders_30d)} />
              <Stat icon="cash-multiple" label="Sales, 30 days" value={money(s.gmv_cents_30d, s.currency)} />
              <Stat icon="percent" label="Commission" value={money(s.commission_cents_30d, s.currency)} />
              <Stat icon="storefront" label="Active stores" value={String(s.active_stores)} />
              <Stat icon="account-clock" label="Riders to review" value={String(s.pending_riders)} />
              <Stat icon="bank-transfer-out" label="Payouts asked" value={money(s.payouts_requested_cents, s.currency)} />
            </Row>
          ) : stats.error ? (
            <ErrorText>{stats.error.message}</ErrorText>
          ) : (
            <Skeleton rows={2} height={70} />
          )}
          <H2>Deliveries in progress</H2>
          {live.data?.deliveries.length === 0 ? <Empty icon="moped-outline" title="No deliveries on the road" /> : null}
          {live.data?.deliveries.map((d) => (
            <Card key={d.id}>
              <Row style={{ justifyContent: 'space-between' }}>
                <T bold>{d.order_number}</T>
                <Badge tone="info" text={label(d.status)} />
              </Row>
              <T small muted>
                {d.store_name} · {d.rider_name} · {timeAgo(d.assigned_at)}
              </T>
            </Card>
          ))}
        </View>
      </Screen>
    </View>
  );
}
