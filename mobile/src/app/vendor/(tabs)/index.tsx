import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { api, unwrap, type Schemas } from '@/api/client';
import { useAuth } from '@/lib/auth';
import { greeting, label, money, timeAgo } from '@/lib/format';
import { useLiveRefresh } from '@/lib/live';
import { color, space } from '@/theme';
import { Badge, Button, Card, Empty, ErrorText, Header, Row, Screen, Segmented, Skeleton, T } from '@/ui';

type Filter = 'open' | 'shipped' | 'delivered' | 'all';

/**
 * A store's orders. Payments are checked centrally by the admin and the
 * rider, so there is no "mark as paid" here: the store sees the status only.
 */
export default function VendorOrders() {
  const { me } = useAuth();
  const [filter, setFilter] = useState<Filter>('open');
  const status = filter === 'open' ? 'processing' : filter === 'all' ? undefined : filter;
  const q = useQuery({
    queryKey: ['seller', 'orders', filter],
    queryFn: () => unwrap(api.GET('/api/v1/seller/orders', { params: { query: { status: status as 'processing' | 'shipped' | 'delivered' | undefined, page_size: 50 } } })),
  });
  useLiveRefresh([{ scope: 'me' }], [['seller']]);

  return (
    <View style={{ flex: 1, backgroundColor: color.mainBackground }}>
      <Header title={greeting(me?.first_name)} subtitle={me?.store?.name} />
      <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'open', label: 'To pack' },
            { value: 'shipped', label: 'With rider' },
            { value: 'delivered', label: 'Delivered' },
            { value: 'all', label: 'All' },
          ]}
        />
        {q.isLoading ? <Skeleton rows={4} /> : null}
        {q.error ? <ErrorText>{q.error.message}</ErrorText> : null}
        {q.data?.items.length === 0 ? <Empty icon="clipboard-check-outline" title="Nothing here" body="New orders show up here the moment they're placed." /> : null}
        {q.data?.items.map((o) => <OrderCard key={o.id} o={o} onChange={() => q.refetch()} />)}
      </Screen>
    </View>
  );
}

function OrderCard({ o, onChange }: { o: Schemas['StoreOrder']; onChange: () => void }) {
  const dispatch = useMutation({
    mutationFn: () => unwrap(api.POST('/api/v1/seller/orders/{store_order_id}/dispatch', { params: { path: { store_order_id: o.id } }, body: { rider_id: null } })),
    onSuccess: onChange,
  });
  const ship = o.ship_to as Record<string, string | null>;
  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <T bold>{o.order_number}</T>
        <Row gap={space.xs}>
          <Badge tone={o.paid ? 'success' : 'warning'} text={o.paid ? 'Paid' : 'Awaiting payment'} />
          <Badge tone="info" text={label(o.status)} />
        </Row>
      </Row>
      <T small muted>
        {timeAgo(o.created_at)} · {ship?.city ?? ''} · {money(o.subtotal_cents, o.currency)} · you receive {money(o.payout_cents, o.currency)}
      </T>
      {o.items.map((it) => (
        <T key={it.id} small>
          {it.quantity} × {it.title}
          {it.variant_title ? ` (${it.variant_title})` : ''}
        </T>
      ))}
      {o.delivery ? (
        <T small muted>
          Rider: {o.delivery.rider_name} ({o.delivery.rider_vehicle}) · {label(o.delivery.status)}
        </T>
      ) : o.status === 'processing' ? (
        <Button title="Find a rider now" icon="moped" variant="secondary" onPress={() => dispatch.mutate()} loading={dispatch.isPending} />
      ) : null}
      {dispatch.error ? <ErrorText>{dispatch.error.message}</ErrorText> : null}
    </Card>
  );
}
