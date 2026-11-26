import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useState } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';

import { api, unwrap, type Schemas } from '@/api/client';
import { money } from '@/lib/format';
import { color, radius, space } from '@/theme';
import { Badge, Button, ErrorText, H2, Header, IconButton, Notice, Row, Screen, Segmented, Skeleton, T } from '@/ui';

export default function Product() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const qc = useQueryClient();
  const { width } = useWindowDimensions();
  const q = useQuery({ queryKey: ['product', slug], queryFn: () => unwrap(api.GET('/api/v1/products/{slug}', { params: { path: { slug } } })) });
  const p = q.data;
  const [variantId, setVariantId] = useState<string | null>(null);
  const variant = p?.variants.find((v) => v.id === variantId) ?? p?.variants.find((v) => v.in_stock) ?? p?.variants[0];

  const addToCart = useMutation({
    mutationFn: () => unwrap(api.POST('/api/v1/cart/items', { body: { variant_id: variant!.id, quantity: Math.max(1, variant!.min_order_qty) } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cart'] }),
  });
  const wish = useMutation({
    mutationFn: () => unwrap(api.POST('/api/v1/wishlist', { body: { product_id: p!.id } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wishlist'] }),
  });

  const imgW = Math.min(width, 700);
  return (
    <View style={{ flex: 1, backgroundColor: color.mainBackground }}>
      <Header title={p?.title ?? 'Product'} subtitle={p?.store.name} right={<IconButton icon="arrow-left" label="Back" tint="#fff" onPress={() => router.back()} />} />
      <Screen padded={false}>
        {!p ? (
          <View style={{ padding: space.l }}>{q.error ? <ErrorText>{q.error.message}</ErrorText> : <Skeleton rows={3} height={160} />}</View>
        ) : (
          <>
            <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
              {p.images.map((im) => (
                <Image key={im.id} source={{ uri: im.url }} style={{ width: imgW, height: imgW * 0.85, backgroundColor: color.backgroundHover }} contentFit="cover" accessibilityLabel={im.alt ?? p.title} />
              ))}
              {p.video ? <ProductVideo v={p.video} w={imgW} /> : null}
            </ScrollView>
            <View style={{ padding: space.l, gap: space.m }}>
              <T style={{ fontSize: 20, fontWeight: '700' }}>{p.title}</T>
              <Row>
                <T bold style={{ fontSize: 18 }}>
                  {variant ? money(variant.price_cents, p.currency) : ''}
                </T>
                {variant && !variant.in_stock ? <Badge tone="warning" text="Out of stock" /> : null}
              </Row>
              {p.variants.length > 1 ? (
                <Segmented value={variant?.id ?? ''} onChange={setVariantId} options={p.variants.map((v) => ({ value: v.id, label: v.title }))} />
              ) : null}
              {variant && variant.min_order_qty > 1 ? <Notice text={`Sold in lots of at least ${variant.min_order_qty}.`} /> : null}
              <Row gap={space.s}>
                <Button title="Add to cart" icon="cart-plus" onPress={() => addToCart.mutate()} loading={addToCart.isPending} disabled={!variant?.in_stock} style={{ flex: 1 }} />
                <Button title={wish.isSuccess ? 'Saved' : 'Wishlist'} icon={wish.isSuccess ? 'heart' : 'heart-outline'} variant="secondary" onPress={() => wish.mutate()} loading={wish.isPending} />
              </Row>
              {addToCart.isSuccess ? <Notice tone="success" icon="check" text="Added to your cart." /> : null}
              {addToCart.error ? <ErrorText>{addToCart.error.message}</ErrorText> : null}
              {wish.error ? <ErrorText>{wish.error.message}</ErrorText> : null}
              <H2>About this item</H2>
              <T>{p.description}</T>
              <T small muted>
                Sold by {p.store.name}
              </T>
            </View>
          </>
        )}
      </Screen>
    </View>
  );
}

function ProductVideo({ v, w }: { v: Schemas['Video']; w: number }) {
  const player = useVideoPlayer(v.url, (pl) => {
    pl.loop = false;
  });
  return (
    <View style={{ width: w, height: w * 0.85, backgroundColor: '#000', borderRadius: radius.small }}>
      <VideoView player={player} style={{ flex: 1 }} nativeControls contentFit="contain" accessibilityLabel={v.caption ?? 'Product video'} />
    </View>
  );
}
