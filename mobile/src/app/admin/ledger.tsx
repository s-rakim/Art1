import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { api, ApiError, unwrap } from '@/api/client';
import { payments, sheets, type SheetEntry, type SheetName, type Settlement } from '@/api/market';
import { SheetTable, sheetOptions } from '@/features/SheetTable';
import { label, money, shortDate } from '@/lib/format';
import { color, space } from '@/theme';
import { Badge, Button, Card, Empty, ErrorText, Field, Header, Notice, Row, Screen, Segmented, Skeleton, T, confirm } from '@/ui';

type Tab = 'books' | 'confirm' | 'payouts';
const notReady = (e: unknown) => e instanceof ApiError && e.status === 404;

/**
 * The admin's side of the ledger: every store's books (read only), the rows
 * stores typed in waiting to be confirmed by their key, and payouts to stores
 * once their books balance.
 */
export default function AdminLedger() {
  const [tab, setTab] = useState<Tab>('books');
  return (
    <View style={{ flex: 1, backgroundColor: color.mainBackground }}>
      <Header title="Ledger" subtitle="All stores" />
      <Screen>
        <Segmented<Tab> value={tab} onChange={setTab} options={[{ value: 'books', label: 'Books' }, { value: 'confirm', label: 'To confirm' }, { value: 'payouts', label: 'Pay stores' }]} />
        {tab === 'books' ? <Books /> : tab === 'confirm' ? <ToConfirm /> : <Payouts />}
      </Screen>
    </View>
  );
}

function Books() {
  const [sheet, setSheet] = useState<SheetName>('ledger');
  const [store, setStore] = useState('');
  const stores = useQuery({ queryKey: ['admin', 'stores'], queryFn: () => unwrap(api.GET('/api/v1/admin/stores', { params: { query: { page_size: 100 } } })) });
  const q = useQuery({ queryKey: ['admin', 'sheet', sheet, store], queryFn: () => sheets.admin(sheet, store || undefined) });
  const list = (stores.data as { items?: { id: string; name: string }[] } | undefined)?.items ?? [];
  return (
    <>
      <Segmented value={store} onChange={setStore} options={[{ value: '', label: 'All stores' }, ...list.map((s) => ({ value: s.id, label: s.name }))]} />
      <Segmented value={sheet} onChange={setSheet} options={sheetOptions} />
      {q.isLoading ? <Skeleton rows={3} height={40} /> : null}
      {q.error ? notReady(q.error) ? <Notice tone="warning" text="The ledger sheets aren't deployed on the server yet." /> : <ErrorText>{q.error.message}</ErrorText> : null}
      {q.data ? <SheetTable sheet={q.data} /> : null}
    </>
  );
}

function ToConfirm() {
  const q = useQuery({ queryKey: ['admin', 'entries'], queryFn: () => sheets.adminEntries('pending') });
  return (
    <>
      <Notice text="A store's own rows go into the books once you confirm them with the same transaction code or reference the store typed." />
      {q.isLoading ? <Skeleton rows={3} height={64} /> : null}
      {q.error ? notReady(q.error) ? <Notice tone="warning" text="Store entries aren't deployed on the server yet." /> : <ErrorText>{q.error.message}</ErrorText> : null}
      {q.data?.items.length === 0 ? <Empty icon="check-all" title="Nothing waiting" /> : null}
      {q.data?.items.map((e) => <EntryCard key={e.id} e={e} onChange={() => q.refetch()} />)}
    </>
  );
}

function EntryCard({ e, onChange }: { e: SheetEntry; onChange: () => void }) {
  const [key, setKey] = useState('');
  const [note, setNote] = useState('');
  const ok = useMutation({ mutationFn: () => sheets.confirmEntry(e.id, key.trim().toUpperCase()), onSuccess: onChange });
  const no = useMutation({ mutationFn: () => sheets.rejectEntry(e.id, note.trim()), onSuccess: onChange });
  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <T bold>{e.store_name ?? 'Store'}</T>
        <T bold>{e.amount_cents != null ? money(e.amount_cents) : ''}</T>
      </Row>
      <T small muted>
        {shortDate(e.entry_date)} · {label(e.kind)} · {e.description}
        {e.quantity != null ? ` · qty ${e.quantity}` : ''}
      </T>
      <Field label="Transaction code or key" value={key} onChangeText={setKey} autoCapitalize="characters" autoCorrect={false} hint="Must match what the store entered." />
      <Row gap={space.s}>
        <Button title="Confirm" variant="success" compact disabled={key.trim().length < 3} loading={ok.isPending} onPress={() => ok.mutate()} />
        <View style={{ flex: 1 }}>
          <Field label="Reason to reject" value={note} onChangeText={setNote} />
        </View>
        <Button title="Reject" variant="danger" compact disabled={note.trim().length < 3} loading={no.isPending} onPress={() => no.mutate()} />
      </Row>
      {ok.error || no.error ? <ErrorText>{(ok.error ?? no.error)!.message}</ErrorText> : null}
    </Card>
  );
}

function Payouts() {
  const q = useQuery({ queryKey: ['admin', 'settlements'], queryFn: () => payments.settlements() });
  const rows: Settlement[] = q.data ?? [];
  return (
    <>
      {q.isLoading ? <Skeleton rows={3} /> : null}
      {q.error ? notReady(q.error) ? <Notice tone="warning" text="Store payouts aren't deployed on the server yet." /> : <ErrorText>{q.error.message}</ErrorText> : null}
      {q.data && !rows.length ? <Empty icon="bank-check" title="No stores to pay" /> : null}
      {rows.map((s) => <SettlementCard key={s.store_id} s={s} onChange={() => q.refetch()} />)}
    </>
  );
}

function SettlementCard({ s, onChange }: { s: Settlement; onChange: () => void }) {
  const [reference, setReference] = useState('');
  const pay = useMutation({ mutationFn: () => payments.settle(s.store_id, { reference: reference.trim() }), onSuccess: onChange });
  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <T bold>{s.store_name}</T>
        <Badge tone={s.books_balanced ? 'success' : 'warning'} text={s.books_balanced ? 'Books balance' : 'Not balanced'} />
      </Row>
      <T small muted>
        Owed {money(s.owed_cents, s.currency)} · held {money(s.held_cents, s.currency)} · sales {money(s.sales_cents, s.currency)}, less stall rent {money(s.rent_cents, s.currency)}, commission {money(s.commission_cents, s.currency)}, fees {money(s.fees_cents, s.currency)}, delivery {money(s.delivery_cents, s.currency)}
      </T>
      <T bold>To send: {money(s.net_cents, s.currency)}</T>
      {s.blockers.length ? <Notice tone="warning" text={s.blockers.join(' ')} /> : null}
      <T small muted>
        {`Next payout ${shortDate(s.next_payout_at)}`}
        {s.last_payout_at ? ` · last ${shortDate(s.last_payout_at)}` : ''}
      </T>
      {s.books_balanced && s.net_cents > 0 ? (
        <>
          <Field label="M-Pesa or bank reference of the payout" value={reference} onChangeText={setReference} autoCapitalize="characters" />
          <Button
            title={`Record payout of ${money(s.net_cents, s.currency)}`}
            icon="bank-transfer-out"
            disabled={reference.trim().length < 4}
            loading={pay.isPending}
            onPress={async () => (await confirm('Record this payout?', `Send ${money(s.net_cents, s.currency)} to ${s.store_name} first, then record it here. This can't be undone.`, 'Record')) && pay.mutate()}
          />
        </>
      ) : null}
      {pay.error ? <ErrorText>{pay.error.message}</ErrorText> : null}
    </Card>
  );
}
