import { Text, View } from 'react-native';

import { Icon } from '@/ui';
import { toneColor, type PinTone } from './types';

/** A teardrop-free pin: a coloured disc with a white ring, a number for the stop order, a store icon for shops. */
export function PinBadge({ tone, order }: { tone: PinTone; order?: number }) {
  const blocked = tone === 'blocked';
  if (tone === 'rider') {
    return (
      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', elevation: 3 }}>
        <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: toneColor.rider }} />
      </View>
    );
  }
  return (
    <View
      style={{
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: toneColor[tone],
        borderWidth: 3,
        borderColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: blocked ? 0.35 : 1,
        elevation: 3,
      }}
    >
      {tone === 'shop' ? (
        <Icon name="storefront" size={14} tint="#fff" />
      ) : order != null ? (
        <Text style={{ color: tone === 'pending' ? '#3d3000' : '#fff', fontWeight: '700', fontSize: 12 }}>{order}</Text>
      ) : null}
    </View>
  );
}
