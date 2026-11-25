import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { ApiError } from '@/api/client';
import { sheets, type EntryIn, type EntryKind, type SheetEntry, type SheetName } from '@/api/market';
import { SheetTable, sheetOptions } from '@/features/SheetTable';
import { label, money, shortDate } from '@/lib/format';
import { color, space } from '@/theme';
import { Badge, Button, Card, Empty, ErrorText, Field, H2, Header, Notice, Row, Screen, Segmented, Skeleton, T, confirm } from '@/ui';

type Tab = 'books' | 'entries';

/**
 * Two sheets. "Books" is read only and comes from the admin's ledger, showing
 * this store's rows and nothing else (the server filters by the signed in
 * store). "My entries" is the store's own editable sheet: rows stay pending
 * until the admin matches them to a transaction code or other key, then they
 * lock and appear in the books.
 */
export default function VendorLedger() {
  const [tab, setTab] = useState<Tab>('books');
  return (
    <View style={{ flex: 1, backgroundColor: color.mainBackground }}>
      <Header title="Ledger" subtitle="Your store's figures only" />
      <Screen>
        <Segmented<Tab> value={tab} onChange={setTab} options={[{ value: 'books', label: 'Books (read only)' }, { value: 'entries', label: 'My entries' }]} />
        {tab === 'books' ? <Books /> : <Entries />}
      </Screen>
    </View>
  );
}

const notReady = (e: unknown) => e instanceof ApiError && e.status === 404;

function Books() {
  const [sheet, setSheet] = useState<SheetName>('ledger');
  const q = useQuery({ queryKey: ['seller', 'sheet', sheet], queryFn: () => sheets.vendor(sheet) });
  return (
    <>
      <Segmented value={sheet} onChange={setSheet} options={sheetOptions} />
      {q.isLoading ? <Skeleton rows={3} height={40} /> : null}
      {q.error ? notReady(q.error) ? <Notice tone="warning" text="The ledger isn't switched on for your store yet." /> : <ErrorText>{q.error.message}</ErrorText> : null}
      {q.data ? <SheetTable sheet={q.data} /> : null}
    </>
  );
}

const KINDS: { value: EntryKind; label: string }[] = [
  { value: 'sale', label: 'Sale' },
  { value: 'payment', label: 'Payment' },
  { value: 'expense', label: 'Expense' },
  { value: 'stock_in', label: 'Stock in' },
  { value: 'stock_out', label: 'Stock out' },
  { value: 'other', label: 'Other' },
];

function Entries() {
  const q = useQuery({ queryKey: ['seller', 'entries'], queryFn: () => sheets.entries() });
  const [editing, setEditing] = useState<SheetEntry | 'new' | null>(null);
  const del = useMutation({ mutationFn: (id: string) => sheets.deleteEntry(id), onSuccess: () => q.refetch() });
  return (
    <>
      <Notice text="Add sales, payments and stock you recorded yourself. The admin confirms each row against its transaction code or reference; confirmed rows lock." />
      {editing ? (
        <EntryForm
          entry={editing === 'new' ? null : editing}
          onDone={() => {
            setEditing(null);
            q.refetch();
          }}
        />
      ) : (
        <Button title="Add an entry" icon="plus" onPress={() => setEditing('new')} />
      )}
      {q.isLoading ? <Skeleton rows={3} height={64} /> : null}
      {q.error ? notReady(q.error) ? <Notice tone="warning" text="Entries aren't switched on yet." /> : <ErrorText>{q.error.message}</ErrorText> : null}
      {q.data?.items.length === 0 ? <Empty icon="table-edit" title="No entries yet" /> : null}
      {q.data?.items.map((e) => (
        <Card key={e.id}>
          <Row style={{ justifyContent: 'space-between' }}>
            <T bold>{e.description}</T>
            <Badge tone={e.status === 'confirmed' ? 'success' : e.status === 'rejected' ? 'error' : 'warning'} text={label(e.status)} />
          </Row>
          <T small muted>
            {shortDate(e.entry_date)} · {label(e.kind)} · {e.amount_cents != null ? money(e.amount_cents) : ''}
            {e.quantity != null ? ` · qty ${e.quantity}` : ''}
            {e.reference ? ` · ref ${e.reference}` : ''}
          </T>
          {e.admin_note ? <T small>Admin: {e.admin_note}</T> : null}
          {e.status !== 'confirmed' ? (
            <Row gap={space.s}>
              <Button title="Edit" variant="secondary" compact onPress={() => setEditing(e)} />
              <Button title="Delete" variant="ghost" compact onPress={async () => (await confirm('Delete this entry?', "It's removed from your sheet. The change is logged.", 'Delete')) && del.mutate(e.id)} />
            </Row>
          ) : null}
        </Card>
      ))}
    </>
  );
}

function EntryForm({ entry, onDone }: { entry: SheetEntry | null; onDone: () => void }) {
  const [f, setF] = useState({
    entry_date: entry?.entry_date ?? new Date().toISOString().slice(0, 10),
    kind: (entry?.kind as EntryKind | undefined) ?? 'sale',
    description: entry?.description ?? '',
    quantity: entry?.quantity != null ? String(entry.quantity) : '',
    amount: entry?.amount_cents != null ? String(entry.amount_cents / 100) : '',
    reference: entry?.reference ?? '',
  });
  const save = useMutation({
    mutationFn: () => {
      const body: EntryIn = {
        entry_date: f.entry_date,
        kind: f.kind,
        description: f.description.trim(),
        quantity: f.quantity ? Number(f.quantity) : null,
        amount_cents: Math.round(Number(f.amount || 0) * 100),
        reference: f.reference.trim().toUpperCase(),
      };
      return entry ? sheets.editEntry(entry.id, body) : sheets.addEntry(body);
    },
    onSuccess: onDone,
  });
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(f.entry_date) && f.description.trim().length > 1 && /^\d+(\.\d{1,2})?$/.test(f.amount) && f.reference.trim().length >= 3;
  return (
    <Card>
      <H2>{entry ? 'Edit entry' : 'New entry'}</H2>
      <Segmented value={f.kind} onChange={(kind) => setF({ ...f, kind })} options={KINDS} />
      <Field label="Date (YYYY-MM-DD)" value={f.entry_date} onChangeText={(v) => setF({ ...f, entry_date: v })} />
      <Field label="What was it?" value={f.description} onChangeText={(v) => setF({ ...f, description: v })} />
      <Row gap={space.s}>
        <View style={{ flex: 1 }}>
          <Field label="Amount" value={f.amount} onChangeText={(v) => setF({ ...f, amount: v.replace(/[^\d.]/g, '') })} keyboardType="decimal-pad" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Quantity" value={f.quantity} onChangeText={(v) => setF({ ...f, quantity: v.replace(/\D/g, '') })} keyboardType="number-pad" />
        </View>
      </Row>
      <Field label="Transaction code or reference" value={f.reference} onChangeText={(v) => setF({ ...f, reference: v })} autoCapitalize="characters" hint="Required. The admin confirms the row with this key." />
      {save.error ? <ErrorText>{save.error.message}</ErrorText> : null}
      <Row gap={space.s}>
        <Button title="Save" onPress={() => save.mutate()} loading={save.isPending} disabled={!valid} style={{ flex: 1 }} />
        <Button title="Cancel" variant="ghost" onPress={onDone} />
      </Row>
    </Card>
  );
}
