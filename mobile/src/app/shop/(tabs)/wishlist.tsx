import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useWindowDimensions, View } from 'react-native';

import { api, unwrap } from '@/api/client';
import { ProductTile } from '@/features/customer/ProductTile';
import { color, space } from '@/theme';
import { Button, Empty, ErrorText, Header, Screen, Skeleton } from '@/ui';

/** Saved for later. Separate from the cart: nothing here is bought at checkout. */
export default function Wishlist() {
  const qc = useQueryClient();
  const { width } = useWindowDimensions();
  const tile = Math.floor((Math.min(width, 1100) - space.l * 2 - space.m) / 2);
  const q = useQuery({ queryKey: ['wishlist'], queryFn: () => unwrap(api.GET('/api/v1/wishlist', { params: { query: { page_size: 100 } } })) });
  const remove = useMutation({
    mutationFn: (id: string) => unwrap(api.DELETE('/api/v1/wishlist/{product_id}', { params: { path: { product_id: id } } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wishlist'] }),
  });
  return (
    <View style={{ flex: 1, backgroundColor: color.mainBackground }}>
      <Header title="Wishlist" subtitle="Saved for later, kept apart from your cart" />
      <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
        {q.isLoading ? <Skeleton rows={2} height={180} /> : null}
        {q.error ? <ErrorText>{q.error.message}</ErrorText> : null}
        {q.data?.items.length === 0 ? <Empty icon="heart-outline" title="Nothing saved yet" body="Tap Wishlist on any product to keep it here." action={{ title: 'Browse the shop', onPress: () => router.push('/shop') }} /> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.m }}>
          {q.data?.items.map((p) => (
            <View key={p.id} style={{ gap: space.xs }}>
              <ProductTile p={p} width={tile} />
              <Button title="Remove" variant="ghost" compact onPress={() => remove.mutate(p.id)} />
            </View>
          ))}
        </View>
      </Screen>
    </View>
  );
}
