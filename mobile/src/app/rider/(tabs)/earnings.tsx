import { useQuery } from '@tanstack/react-query';
import { View } from 'react-native';

import { api, unwrap } from '@/api/client';
import { riderKeys, useRiderMe } from '@/features/rider/data';
import { money, shortDate } from '@/lib/format';
import { color, space } from '@/theme';
import { Badge, Card, Empty, ErrorText, H2, Header, Num, Row, Screen, Skeleton, Stat, T } from '@/ui';

export default function Earnings() {
  const me = useRiderMe();
  const q = useQuery({
    queryKey: riderKeys.earnings,
    queryFn: () => unwrap(api.GET('/api/v1/rider/earnings', { params: { query: { page_size: 100 } } })),
  });
  const rate = me.data?.rules?.commission_rate;
  return (
    <View style={{ flex: 1, backgroundColor: color.mainBackground }}>
      <Header title="Earnings" subtitle={rate ? `Your share per delivery is set by the admin: ${Math.round(rate * 100)}%` : 'Your share per delivery is set by the admin'} />
      <Screen refreshing={q.isRefetching} onRefresh={() => { q.refetch(); me.refetch(); }}>
        {me.data ? (
          <Row gap={space.s} style={{ flexWrap: 'wrap' }}>
            <Stat icon="check-decagram" label="Deliveries" value={String(me.data.completed_deliveries)} />
            <Stat icon="cash" label="Earned in total" value={money(me.data.earnings_cents, me.data.currency)} />
            <Stat icon="wallet-outline" label="Waiting to be paid" value={money(me.data.unpaid_earnings_cents, me.data.currency)} />
          </Row>
        ) : (
          <Skeleton rows={1} height={80} />
        )}
        <H2>Per delivery</H2>
        {q.isLoading ? <Skeleton rows={4} height={56} /> : null}
        {q.error ? <ErrorText>{q.error.message}</ErrorText> : null}
        {q.data && q.data.items.length === 0 ? <Empty icon="cash-clock" title="No earnings yet" body="Finish a delivery and it shows up here." /> : null}
        {q.data?.items.map((e) => (
          <Card key={e.id} style={{ paddingVertical: space.m }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <View>
                <T>{shortDate(e.created_at)}</T>
                <T small muted>
                  Delivery {e.delivery_id.slice(0, 8).toUpperCase()}
                </T>
              </View>
              <Row>
                <Badge tone={e.paid_out ? 'success' : 'neutral'} text={e.paid_out ? 'Paid out' : 'Pending'} />
                <Num style={{ fontWeight: '700' }}>{money(e.amount_cents, e.currency)}</Num>
              </Row>
            </Row>
          </Card>
        ))}
      </Screen>
    </View>
  );
}
