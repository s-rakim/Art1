import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Linking, View } from 'react-native';

import { api, unwrap, type Schemas } from '@/api/client';
import { label, timeAgo } from '@/lib/format';
import { color, space } from '@/theme';
import { Badge, Button, Card, Empty, ErrorText, Field, Header, Row, Screen, Segmented, Skeleton, T, confirm } from '@/ui';

type Tab = 'applications' | 'active' | 'suspended';

/** Hiring: review rider applications, hire or turn down, pause riders, settle their earnings. */
export default function AdminRiders() {
  const [tab, setTab] = useState<Tab>('applications');
  const apps = useQuery({ queryKey: ['admin', 'rider-apps'], queryFn: () => unwrap(api.GET('/api/v1/admin/rider-applications', { params: { query: { page_size: 100 } } })), enabled: tab === 'applications' });
  const riders = useQuery({
    queryKey: ['admin', 'riders', tab],
    queryFn: () => unwrap(api.GET('/api/v1/admin/riders', { params: { query: { status: tab as 'active' | 'suspended', page_size: 100 } } })),
    enabled: tab !== 'applications',
  });
  const q = tab === 'applications' ? apps : riders;
  return (
    <View style={{ flex: 1, backgroundColor: color.mainBackground }}>
      <Header title="Riders" />
      <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
        <Segmented<Tab> value={tab} onChange={setTab} options={[{ value: 'applications', label: 'To review' }, { value: 'active', label: 'Hired' }, { value: 'suspended', label: 'Paused' }]} />
        {q.isLoading ? <Skeleton rows={3} /> : null}
        {q.error ? <ErrorText>{q.error.message}</ErrorText> : null}
        {q.data?.items.length === 0 ? <Empty icon="account-check-outline" title={tab === 'applications' ? 'No applications waiting' : 'Nobody here'} /> : null}
        {q.data?.items.map((r) => <RiderCard key={r.id} r={r} onChange={() => q.refetch()} />)}
      </Screen>
    </View>
  );
}

function RiderCard({ r, onChange }: { r: Schemas['AdminRider']; onChange: () => void }) {
  const [note, setNote] = useState('');
  const hire = useMutation({ mutationFn: () => unwrap(api.POST('/api/v1/admin/rider-applications/{rider_id}/approve', { params: { path: { rider_id: r.id } }, body: { note: note || null } })), onSuccess: onChange });
  const reject = useMutation({ mutationFn: () => unwrap(api.POST('/api/v1/admin/rider-applications/{rider_id}/reject', { params: { path: { rider_id: r.id } }, body: { note: note || null } })), onSuccess: onChange });
  const update = useMutation({
    mutationFn: (status: 'active' | 'suspended') => unwrap(api.PATCH('/api/v1/admin/riders/{rider_id}', { params: { path: { rider_id: r.id } }, body: { status, review_note: note || null } })),
    onSuccess: onChange,
  });
  const settle = useMutation({ mutationFn: () => unwrap(api.POST('/api/v1/admin/riders/{rider_id}/settle', { params: { path: { rider_id: r.id } } })), onSuccess: onChange });
  const err = hire.error ?? reject.error ?? update.error ?? settle.error;

  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <T bold>{r.full_name}</T>
        <Row gap={space.xs}>
          {r.status === 'active' ? <Badge tone={r.is_online ? 'success' : 'neutral'} text={r.is_online ? 'On shift' : 'Off shift'} /> : null}
          <Badge tone="info" text={label(r.status)} />
        </Row>
      </Row>
      <T small muted>
        {label(r.vehicle)} · {r.city} · {r.licence_number ? `licence ${r.licence_number} · ` : ''}applied {timeAgo(r.created_at)}
      </T>
      {r.status === 'active' ? (
        <T small muted>
          {r.completed_deliveries} delivered · {r.active_deliveries} on the road · seen {timeAgo(r.last_seen_at) || 'never'}
        </T>
      ) : null}
      <Row gap={space.s} style={{ flexWrap: 'wrap' }}>
        <Button title="Call" icon="phone" variant="secondary" compact onPress={() => Linking.openURL(`tel:${r.phone}`)} />
        {r.status === 'applicant' ? (
          <>
            <Button title="Hire" icon="check" variant="success" compact loading={hire.isPending} onPress={async () => (await confirm(`Hire ${r.full_name}?`, 'They get rider access straight away.', 'Hire')) && hire.mutate()} />
            <Button title="Turn down" variant="danger" compact loading={reject.isPending} onPress={async () => (await confirm(`Turn down ${r.full_name}?`, 'They can apply again later.', 'Turn down')) && reject.mutate()} />
          </>
        ) : r.status === 'active' ? (
          <>
            <Button title="Pay out earnings" icon="cash-fast" variant="secondary" compact loading={settle.isPending} onPress={async () => (await confirm('Mark earnings as paid?', `Record that ${r.full_name}'s unpaid earnings have been sent to them.`, 'Mark paid')) && settle.mutate()} />
            <Button title="Pause" variant="danger" compact onPress={async () => (await confirm(`Pause ${r.full_name}?`, 'They stop getting jobs until you reactivate them.', 'Pause')) && update.mutate('suspended')} />
          </>
        ) : (
          <Button title="Reactivate" variant="success" compact onPress={() => update.mutate('active')} />
        )}
      </Row>
      {r.status === 'applicant' || r.status === 'active' ? <Field label="Note for the rider (optional)" value={note} onChangeText={setNote} maxLength={300} /> : null}
      {err ? <ErrorText>{err.message}</ErrorText> : null}
    </Card>
  );
}
