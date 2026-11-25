import { ScrollView, Text, View } from 'react-native';

import type { Sheet } from '@/api/market';
import { money, shortDate } from '@/lib/format';
import { color, font, space } from '@/theme';
import { Empty } from '@/ui';

/**
 * Renders any ledger sheet the API sends: the server picks the columns and
 * their types, so new sheets show up without an app update. Read only.
 */
export function SheetTable({ sheet, currency = 'KES' }: { sheet: Sheet; currency?: string }) {
  if (!sheet.rows.length) return <Empty icon="table-off" title="No rows for these dates" />;
  const width = (t: string) => (t === 'text' ? 180 : t === 'date' ? 96 : 110);
  const cell = (v: unknown, t: string) => {
    if (v == null || v === '') return '';
    if (t === 'money') return money(Number(v), currency);
    if (t === 'date') return shortDate(String(v));
    return String(v);
  };
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator accessibilityLabel={`${sheet.sheet} sheet, ${sheet.total} rows`}>
      <View style={{ borderWidth: 1, borderColor: color.border, borderRadius: 8, overflow: 'hidden' }}>
        <View style={{ flexDirection: 'row', backgroundColor: color.primaryElementLight }}>
          {sheet.columns.map((c) => (
            <Text key={c.key} style={{ width: width(c.type), padding: space.s, fontWeight: '700', fontSize: font.small, color: color.primaryElementLightText, textAlign: c.type === 'money' || c.type === 'number' ? 'right' : 'left' }}>
              {c.label}
            </Text>
          ))}
        </View>
        {sheet.rows.map((r, i) => (
          <View key={i} style={{ flexDirection: 'row', backgroundColor: i % 2 ? color.backgroundHover : color.mainBackground }}>
            {sheet.columns.map((c) => (
              <Text
                key={c.key}
                numberOfLines={2}
                style={{ width: width(c.type), padding: space.s, fontSize: font.small, color: color.mainText, fontVariant: ['tabular-nums'], textAlign: c.type === 'money' || c.type === 'number' ? 'right' : 'left' }}
              >
                {cell(r[c.key], c.type)}
              </Text>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

export const sheetOptions = [
  { value: 'ledger' as const, label: 'Ledger' },
  { value: 'sales' as const, label: 'Sales' },
  { value: 'payments' as const, label: 'Payments' },
  { value: 'inventory' as const, label: 'Stock sold' },
  { value: 'entries' as const, label: 'Confirmed entries' },
  { value: 'payouts' as const, label: 'Payouts' },
];
