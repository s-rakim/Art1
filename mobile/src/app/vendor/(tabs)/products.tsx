import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { View } from 'react-native';

import { api, unwrap } from '@/api/client';
import { label, money } from '@/lib/format';
import { color, radius } from '@/theme';
import { Badge, Card, Empty, ErrorText, Header, Row, Screen, Skeleton, T } from '@/ui';

export default function Products() {
  const q = useQuery({ queryKey: ['seller', 'products'], queryFn: () => unwrap(api.GET('/api/v1/seller/products', { params: { query: { page_size: 100 } } })) });
  return (
    <View style={{ flex: 1, backgroundColor: color.mainBackground }}>
      <Header title="Products" subtitle="Tap one to add photos or a video" />
      <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
        {q.isLoading ? <Skeleton rows={4} /> : null}
        {q.error ? <ErrorText>{q.error.message}</ErrorText> : null}
        {q.data?.items.length === 0 ? <Empty icon="tag-plus-outline" title="No products yet" body="Add products from the web dashboard; you can manage photos and video here." /> : null}
        {q.data?.items.map((p) => (
          <Card key={p.id} onPress={() => router.push(`/vendor/product/${p.id}`)} label={p.title}>
            <Row>
              <Image source={p.image_url ? { uri: p.image_url } : undefined} style={{ width: 56, height: 56, borderRadius: radius.element, backgroundColor: color.backgroundHover }} />
              <View style={{ flex: 1 }}>
                <T bold lines={1}>
                  {p.title}
                </T>
                <T small muted>
                  {p.price_cents != null ? money(p.price_cents) : 'No price'} · {p.stock} in stock · {p.sold_count} sold
                </T>
              </View>
              <Badge tone={p.status === 'active' ? 'success' : 'neutral'} text={label(p.status)} />
            </Row>
          </Card>
        ))}
      </Screen>
    </View>
  );
}
