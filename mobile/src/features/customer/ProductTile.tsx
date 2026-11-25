import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import type { Schemas } from '@/api/client';
import { money } from '@/lib/format';
import { color, radius, space } from '@/theme';
import { Icon, T } from '@/ui';

export function ProductTile({ p, width }: { p: Schemas['ProductCard']; width: number }) {
  return (
    <Pressable
      onPress={() => router.push(`/shop/product/${p.slug}`)}
      accessibilityRole="button"
      accessibilityLabel={`${p.title}, ${p.price_cents != null ? money(p.price_cents, p.currency) : 'price on request'}, from ${p.store.name}`}
      style={({ pressed }) => [{ width, gap: space.xs, opacity: pressed ? 0.85 : 1 }]}
    >
      <View style={{ width, height: width, borderRadius: radius.container, backgroundColor: color.backgroundHover, overflow: 'hidden' }}>
        {p.image_url ? (
          <Image source={{ uri: p.image_url }} style={{ flex: 1 }} contentFit="cover" transition={150} />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="image-off-outline" tint={color.maxContrast} />
          </View>
        )}
      </View>
      <T lines={2}>{p.title}</T>
      {p.price_cents != null ? <T bold>{money(p.price_cents, p.currency)}</T> : null}
      <T small muted lines={1}>
        {p.store.name}
      </T>
    </Pressable>
  );
}
