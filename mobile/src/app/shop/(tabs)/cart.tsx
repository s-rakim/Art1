import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { api, unwrap } from '@/api/client';
import { shop } from '@/api/market';
import { money } from '@/lib/format';
import { useCheckout } from '@/features/customer/checkout-store';
import { color, radius, space } from '@/theme';
import { Button, Card, Empty, ErrorText, Header, Icon, IconButton, Row, Screen, Skeleton, T } from '@/ui';

/**
 * The cart with a tick box per line: only ticked lines go to checkout, the
 * rest stay in the cart. "Save for later" moves a line to the wishlist.
 */
export default function Cart() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['cart'], queryFn: () => unwrap(api.GET('/api/v1/cart')) });
  const items = q.data?.items ?? [];
  // Every line is ticked unless the shopper unticks it, so new lines start ticked.
  const [unticked, setUnticked] = useState<Set<string>>(new Set());
  const picked = new Set(items.filter((i) => !unticked.has(i.id)).map((i) => i.id));
  const setLines = useCheckout((st) => st.setLines);

  const refresh = () => qc.invalidateQueries({ queryKey: ['cart'] });
  const qty = useMutation({
    mutationFn: ({ id, quantity }: { id: string; quantity: number }) => unwrap(api.PATCH('/api/v1/cart/items/{item_id}', { params: { path: { item_id: id } }, body: { quantity } })),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => unwrap(api.DELETE('/api/v1/cart/items/{item_id}', { params: { path: { item_id: id } } })),
    onSuccess: refresh,
  });
  const later = useMutation({
    mutationFn: (id: string) => shop.saveForLater(id),
    onSuccess: () => {
      refresh();
      qc.invalidateQueries({ queryKey: ['wishlist'] });
    },
  });

  const chosen = items.filter((i) => picked.has(i.id) && i.available);
  const subtotal = chosen.reduce((sum, i) => sum + i.line_total_cents, 0);
  const err = qty.error ?? remove.error ?? later.error;

  return (
    <View style={{ flex: 1, backgroundColor: color.mainBackground }}>
      <Header title="Cart" subtitle={items.length ? `${chosen.length} of ${items.length} lines ticked for checkout` : undefined} />
      <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
        {q.isLoading ? <Skeleton rows={3} /> : null}
        {q.error ? <ErrorText>{q.error.message}</ErrorText> : null}
        {q.data && !items.length ? <Empty icon="cart-outline" title="Your cart is empty" action={{ title: 'Browse the shop', onPress: () => router.push('/shop') }} /> : null}
        {err ? <ErrorText>{err.message}</ErrorText> : null}
        {items.map((i) => {
          const on = picked.has(i.id);
          return (
            <Card key={i.id} style={!i.available && { opacity: 0.5 }}>
              <Row gap={space.m} style={{ alignItems: 'flex-start' }}>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on, disabled: !i.available }}
                  accessibilityLabel={`Buy ${i.title} now`}
                  disabled={!i.available}
                  hitSlop={10}
                  onPress={() =>
                    setUnticked((prev) => {
                      const next = new Set(prev);
                      if (next.has(i.id)) next.delete(i.id);
                      else next.add(i.id);
                      return next;
                    })
                  }
                  style={{ paddingTop: 2 }}
                >
                  <Icon name={on ? 'checkbox-marked' : 'checkbox-blank-outline'} tint={on ? color.primary : color.maxContrast} size={26} />
                </Pressable>
                <Image source={i.image_url ? { uri: i.image_url } : undefined} style={{ width: 64, height: 64, borderRadius: radius.element, backgroundColor: color.backgroundHover }} />
                <View style={{ flex: 1, gap: 2 }}>
                  <T lines={2}>{i.title}</T>
                  <T small muted>
                    {i.variant_title} · {i.store.name}
                  </T>
                  <T bold>{money(i.line_total_cents)}</T>
                  {!i.available ? <T small style={{ color: color.errorText }}>No longer available</T> : null}
                </View>
              </Row>
              <Row style={{ justifyContent: 'space-between' }}>
                <Row gap={0}>
                  <IconButton icon="minus" label="One fewer" onPress={() => (i.quantity > Math.max(1, i.min_order_qty) ? qty.mutate({ id: i.id, quantity: i.quantity - 1 }) : remove.mutate(i.id))} />
                  <T bold style={{ minWidth: 28, textAlign: 'center' }}>
                    {i.quantity}
                  </T>
                  <IconButton icon="plus" label="One more" onPress={() => i.quantity < i.stock && qty.mutate({ id: i.id, quantity: i.quantity + 1 })} />
                </Row>
                <Row gap={0}>
                  <Button title="Save for later" variant="ghost" compact onPress={() => later.mutate(i.id)} />
                  <IconButton icon="delete-outline" label={`Remove ${i.title}`} onPress={() => remove.mutate(i.id)} />
                </Row>
              </Row>
            </Card>
          );
        })}
        {items.length ? (
          <Card>
            <Row style={{ justifyContent: 'space-between' }}>
              <T>Items ticked</T>
              <T bold>{money(subtotal, q.data?.currency)}</T>
            </Row>
            <T small muted>
              Delivery is worked out at checkout. Unticked lines stay in your cart.
            </T>
            <Button
              title={`Check out ${chosen.length} line${chosen.length === 1 ? '' : 's'}`}
              icon="arrow-right"
              disabled={!chosen.length}
              onPress={() => {
                setLines(chosen.map((i) => ({ cart_item_id: i.id, variant_id: i.variant_id, product_id: i.product_id, quantity: i.quantity, title: i.title, line_total_cents: i.line_total_cents })));
                router.push('/shop/checkout');
              }}
            />
          </Card>
        ) : null}
      </Screen>
    </View>
  );
}
