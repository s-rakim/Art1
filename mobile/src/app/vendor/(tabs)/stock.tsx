import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { api, unwrap, type Schemas } from '@/api/client';
import { money } from '@/lib/format';
import { color } from '@/theme';
import { Badge, Button, Card, Empty, ErrorText, Field, Header, IconButton, Num, Row, Screen, Segmented, Skeleton, T } from '@/ui';

export default function Stock() {
  const [low, setLow] = useState<'all' | 'low'>('all');
  const [search, setSearch] = useState('');
  const q = useQuery({
    queryKey: ['seller', 'inventory', low, search],
    queryFn: () => unwrap(api.GET('/api/v1/seller/inventory', { params: { query: { low_stock: low === 'low' || undefined, q: search || undefined, page_size: 100 } } })),
  });
  return (
    <View style={{ flex: 1, backgroundColor: color.mainBackground }}>
      <Header title="Stock" subtitle={q.data ? `${q.data.total} variants` : undefined} />
      <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
        <Field label="Find" value={search} onChangeText={setSearch} placeholder="Name or SKU" autoCorrect={false} />
        <Segmented value={low} onChange={setLow} options={[{ value: 'all', label: 'Everything' }, { value: 'low', label: 'Running low' }]} />
        {q.isLoading ? <Skeleton rows={5} height={60} /> : null}
        {q.error ? <ErrorText>{q.error.message}</ErrorText> : null}
        {q.data?.items.length === 0 ? <Empty icon="warehouse" title="No stock to show" /> : null}
        {q.data?.items.map((r) => <StockRow key={r.variant_id} r={r} onSaved={() => q.refetch()} />)}
      </Screen>
    </View>
  );
}

function StockRow({ r, onSaved }: { r: Schemas['InventoryRow']; onSaved: () => void }) {
  const [count, setCount] = useState(String(r.stock));
  const changed = Number(count) !== r.stock && /^\d+$/.test(count);
  const save = useMutation({
    mutationFn: () => unwrap(api.PATCH('/api/v1/seller/inventory', { body: { items: [{ variant_id: r.variant_id, stock: Number(count), adjust_by: null, reason: 'Counted on phone' }] } })),
    onSuccess: onSaved,
  });
  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <T bold lines={1}>
            {r.product_title}
          </T>
          <T small muted>
            {r.title} · {r.sku} · {money(r.price_cents)} · sold {r.sold_30d} in 30 days
          </T>
        </View>
        {r.low_stock ? <Badge tone="warning" text="Low" /> : null}
      </Row>
      <Row>
        <IconButton icon="minus" label="One less" onPress={() => setCount(String(Math.max(0, Number(count) - 1)))} />
        <View style={{ width: 90 }}>
          <Field label="In stock" value={count} onChangeText={(t) => setCount(t.replace(/\D/g, ''))} keyboardType="number-pad" />
        </View>
        <IconButton icon="plus" label="One more" onPress={() => setCount(String(Number(count) + 1))} />
        <Num style={{ color: color.maxContrast, fontSize: 13 }}>{r.reserved ? `${r.reserved} held` : ''}</Num>
        <View style={{ flex: 1 }} />
        {changed ? <Button title="Save" compact onPress={() => save.mutate()} loading={save.isPending} /> : null}
      </Row>
      {save.error ? <ErrorText>{save.error.message}</ErrorText> : null}
    </Card>
  );
}
