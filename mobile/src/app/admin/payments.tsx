import { useMutation, useQuery } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { View } from 'react-native';

import { payments, type ImportResult, type PaymentReceipt, type ReceiptStatus } from '@/api/market';
import { label, money, timeAgo } from '@/lib/format';
import { color, space } from '@/theme';
import { Badge, Button, Card, Empty, ErrorText, Field, H2, Header, Notice, Row, Screen, Segmented, Skeleton, T, confirm } from '@/ui';

type Tab = 'import' | 'bank';

/**
 * Central payments. Everything is paid to The Bazaar's one till, so the
 * admin feeds the payment messages in here (the server also takes them
 * automatically from the phone forwarder or Daraja). Each code lands in the
 * databank, where a rider or the admin can use it once against an order.
 */
export default function AdminPayments() {
  const [tab, setTab] = useState<Tab>('import');
  return (
    <View style={{ flex: 1, backgroundColor: color.mainBackground }}>
      <Header title="Payments" subtitle="One till for the whole market" />
      <Screen>
        <Segmented<Tab> value={tab} onChange={setTab} options={[{ value: 'import', label: 'Read messages' }, { value: 'bank', label: 'Databank' }]} />
        {tab === 'import' ? <Importer /> : <Databank />}
      </Screen>
    </View>
  );
}

function Importer() {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [saved, setSaved] = useState<number | null>(null);
  const run = useMutation({
    mutationFn: (commit: boolean) => payments.importText(text, commit),
    onSuccess: (r, commit) => {
      if (commit) {
        setSaved(r.stored);
        setPreview(null);
        setText('');
      } else setPreview(r);
    },
  });
  const fresh = preview?.rows.filter((r) => !r.duplicate) ?? [];
  return (
    <>
      <Notice text="Paste M-Pesa or bank messages, as many as you like. The server pulls out the payer's name, amount and transaction code, and matches the order number when it was used as the reference." />
      <Field label="Messages" value={text} onChangeText={(t) => { setText(t); setPreview(null); setSaved(null); }} multiline placeholder="SGR7XK2L1P Confirmed. Ksh1,250.00 received from JANE WANJIKU 0712xxx678 on 25/11/26 at 2:14 PM…" />
      <Row gap={space.s}>
        <Button title="Paste" icon="content-paste" variant="secondary" onPress={async () => setText(await Clipboard.getStringAsync())} />
        <Button title="Read messages" icon="text-search" onPress={() => run.mutate(false)} loading={run.isPending && !run.variables} disabled={text.trim().length < 20} style={{ flex: 1 }} />
      </Row>
      {run.error ? <ErrorText>{run.error.message}</ErrorText> : null}
      {saved != null ? <Notice tone="success" icon="check" text={`${saved} payment${saved === 1 ? '' : 's'} saved to the databank.`} /> : null}
      {preview ? (
        <>
          <H2>Found {preview.rows.length}</H2>
          {preview.rows.map((r, i) => (
            <Card key={`${r.code}-${i}`} style={r.duplicate && { opacity: 0.5 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <T bold>{money(r.amount_cents, r.currency)}</T>
                {r.duplicate ? <Badge text="Already saved" /> : r.matched_order_number ? <Badge tone="success" text={`Order ${r.matched_order_number}`} /> : <Badge tone="warning" text="No order matched" />}
              </Row>
              <T small muted>
                {r.code} · {r.payer_name ?? 'Unknown payer'} · {r.provider}
                {r.received_at ? ` · ${timeAgo(r.received_at)}` : ''}
              </T>
            </Card>
          ))}
          {preview.failed.length ? <Notice tone="warning" text={`${preview.failed.length} message${preview.failed.length === 1 ? '' : 's'} couldn't be read. Check they're complete payment messages.`} /> : null}
          <Button title={`Save ${fresh.length} payment${fresh.length === 1 ? '' : 's'}`} icon="content-save" variant="success" disabled={!fresh.length} loading={run.isPending && run.variables === true} onPress={() => run.mutate(true)} />
        </>
      ) : null}
    </>
  );
}

function Databank() {
  const [status, setStatus] = useState<ReceiptStatus>('unconfirmed');
  const [search, setSearch] = useState('');
  const q = useQuery({ queryKey: ['admin', 'payments', status, search], queryFn: () => payments.list(status, search || undefined) });
  return (
    <>
      <Segmented<ReceiptStatus>
        value={status}
        onChange={setStatus}
        options={[
          { value: 'unconfirmed', label: 'Not used yet' },
          { value: 'confirmed', label: 'Used' },
          { value: 'expired', label: 'Expired' },
          { value: 'void', label: 'Void' },
        ]}
      />
      <Field label="Search" value={search} onChangeText={setSearch} placeholder="Code, name or order number" autoCapitalize="characters" autoCorrect={false} />
      {q.isLoading ? <Skeleton rows={4} height={64} /> : null}
      {q.error ? <ErrorText>{q.error.message}</ErrorText> : null}
      {q.data?.items.length === 0 ? <Empty icon="cash-remove" title="No payments here" /> : null}
      {q.data?.items.map((r) => <ReceiptCard key={r.id} r={r} onChange={() => q.refetch()} />)}
    </>
  );
}

function ReceiptCard({ r, onChange }: { r: PaymentReceipt; onChange: () => void }) {
  const [orderNumber, setOrderNumber] = useState('');
  const [note, setNote] = useState('');
  const apply = useMutation({ mutationFn: () => payments.applyToOrder(r.id, orderNumber.trim().toUpperCase()), onSuccess: onChange });
  const voidIt = useMutation({ mutationFn: () => payments.voidReceipt(r.id, note.trim()), onSuccess: onChange });
  const open = r.status === 'unconfirmed';
  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <T bold>{money(r.amount_cents, r.currency)}</T>
        <Badge tone={r.status === 'confirmed' ? 'success' : r.status === 'unconfirmed' ? 'info' : 'neutral'} text={label(r.status)} />
      </Row>
      <T small muted>
        {r.code} · {r.payer_name ?? 'Unknown payer'} · {timeAgo(r.received_at)}
        {r.order_number ? ` · order ${r.order_number}` : ''}
      </T>
      {open ? (
        <>
          <Field label="Apply to order number" value={orderNumber} onChangeText={setOrderNumber} autoCapitalize="characters" autoCorrect={false} placeholder="BZ-10421" />
          <Row gap={space.s}>
            <Button title="Apply" compact disabled={orderNumber.trim().length < 3} loading={apply.isPending} onPress={() => apply.mutate()} />
            <View style={{ flex: 1 }}>
              <Field label="Reason to void" value={note} onChangeText={setNote} />
            </View>
            <Button title="Void" variant="danger" compact disabled={note.trim().length < 3} onPress={async () => (await confirm('Void this payment?', 'Nobody will be able to use this code. This is logged.', 'Void')) && voidIt.mutate()} />
          </Row>
        </>
      ) : null}
      {apply.error || voidIt.error ? <ErrorText>{(apply.error ?? voidIt.error)!.message}</ErrorText> : null}
    </Card>
  );
}
