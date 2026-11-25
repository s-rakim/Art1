import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { View } from 'react-native';

import { api, unwrap } from '@/api/client';
import { label, money, shortDate } from '@/lib/format';
import { color } from '@/theme';
import { Badge, Card, Empty, ErrorText, Header, Row, Screen, Skeleton, T } from '@/ui';

export default function Orders() {
  const q = useQuery({ queryKey: ['orders'], queryFn: () => unwrap(api.GET('/api/v1/orders', { params: { query: { page_size: 50 } } })) });
  return (
    <View style={{ flex: 1, backgroundColor: color.mainBackground }}>
      <Header title="Orders" />
      <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
        {q.isLoading ? <Skeleton rows={4} height={64} /> : null}
        {q.error ? <ErrorText>{q.error.message}</ErrorText> : null}
        {q.data?.items.length === 0 ? <Empty icon="package-variant" title="No orders yet" action={{ title: 'Start shopping', onPress: () => router.push('/shop') }} /> : null}
        {q.data?.items.map((o) => (
          <Card key={o.id} onPress={() => router.push(`/shop/order/${o.id}`)} label={`Order ${o.number}`}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T bold>{o.number}</T>
              <Badge tone={o.status === 'delivered' ? 'success' : o.status === 'canceled' ? 'error' : 'info'} text={label(o.status)} />
            </Row>
            <T small muted>
              {shortDate(o.created_at)} · {o.item_count} item{o.item_count === 1 ? '' : 's'} · {money(o.total_cents, o.currency)}
            </T>
          </Card>
        ))}
      </Screen>
    </View>
  );
}
