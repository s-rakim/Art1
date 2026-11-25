import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { api, unwrap } from '@/api/client';
import { ProductTile } from '@/features/customer/ProductTile';
import { useAuth } from '@/lib/auth';
import { greeting } from '@/lib/format';
import { color, space } from '@/theme';
import { Empty, ErrorText, Field, Header, Screen, Segmented, Skeleton } from '@/ui';

export default function Shop() {
  const { me } = useAuth();
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const { width } = useWindowDimensions();
  const cols = width > 700 ? 4 : 2;
  const tile = Math.floor((Math.min(width, 1100) - space.l * 2 - space.m * (cols - 1)) / cols);

  const cats = useQuery({ queryKey: ['categories'], queryFn: () => unwrap(api.GET('/api/v1/categories')), staleTime: 600_000 });
  const products = useQuery({
    queryKey: ['products', search, category],
    queryFn: () => unwrap(api.GET('/api/v1/products', { params: { query: { q: search || undefined, category: category || undefined, page_size: 40 } } })),
  });

  return (
    <View style={{ flex: 1, backgroundColor: color.mainBackground }}>
      <Header title={greeting(me?.first_name)} subtitle="What are you shopping for today?" />
      <Screen refreshing={products.isRefetching} onRefresh={() => products.refetch()}>
        <Field label="Search" value={q} onChangeText={setQ} placeholder="Shoes, phones, sukuma…" returnKeyType="search" onSubmitEditing={() => setSearch(q.trim())} autoCorrect={false} />
        {cats.data?.length ? (
          <Segmented value={category} onChange={setCategory} options={[{ value: '', label: 'All' }, ...cats.data.map((c) => ({ value: c.slug, label: c.name }))]} />
        ) : null}
        {products.isLoading ? <Skeleton rows={3} height={180} /> : null}
        {products.error ? <ErrorText>{products.error.message}</ErrorText> : null}
        {products.data?.items.length === 0 ? (
          <Empty icon="magnify-close" title="Nothing found" body="Try another word or category." action={{ title: 'Show everything', onPress: () => { setQ(''); setSearch(''); setCategory(''); } }} />
        ) : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.m }}>
          {products.data?.items.map((p) => <ProductTile key={p.id} p={p} width={tile} />)}
        </View>
      </Screen>
    </View>
  );
}
