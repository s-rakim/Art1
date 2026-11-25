import { useMutation, useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, View } from 'react-native';

import { api, ApiError, unwrap } from '@/api/client';
import { rider, type PaymentCheck, type RiderDelivery } from '@/api/market';
import { useRiderRefresh } from '@/features/rider/data';
import { label, money, timeAgo } from '@/lib/format';
import { directionsUrl } from '@/lib/geo';
import { useLive } from '@/lib/live';
import { RouteMap } from '@/map/RouteMap';
import { color, space } from '@/theme';
import { Badge, Button, Card, ErrorText, Field, H2, Header, IconButton, Notice, Row, Screen, Skeleton, T, confirm } from '@/ui';

/** M-Pesa codes are 10 letters and digits (e.g. SGR7XK2L1P). Bank references vary, so allow 6 to 20. */
const looksLikeCode = (q: string) => /^[A-Za-z0-9]{6,20}$/.test(q.trim()) && /\d/.test(q);

export default function Job() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const refreshAll = useRiderRefresh();
  const q = useQuery({
    queryKey: ['rider', 'delivery', id],
    queryFn: () => unwrap(api.GET('/api/v1/rider/deliveries/{delivery_id}', { params: { path: { delivery_id: id } } })),
  });
  useLive([{ delivery_id: id }, { scope: 'me' }], (e) => {
    if (e.type !== 'jobs') q.refetch();
  });

  const act = useMutation({
    mutationFn: (body: { action: 'picked_up' | 'delivered' | 'failed'; code?: string; note?: string }) =>
      unwrap(api.PATCH('/api/v1/rider/deliveries/{delivery_id}', { params: { path: { delivery_id: id } }, body })),
    onSuccess: (_d, body) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      q.refetch();
      refreshAll();
      if (body.action !== 'picked_up') router.back();
    },
  });

  const arrived = useMutation({
    mutationFn: () => rider.arrived(id),
    onSuccess: () => q.refetch(),
  });

  // The server's answer to "use this payment" says it's confirmed before the delivery refetch lands.
  const [paidNow, setPaidNow] = useState(false);
  const d = q.data;
  if (!d) {
    return (
      <View style={{ flex: 1 }}>
        <Header title="Delivery" />
        <Screen>{q.error ? <ErrorText>{q.error.message}</ErrorText> : <Skeleton rows={3} />}</Screen>
      </View>
    );
  }

  const address = (d.dropoff_address ?? {}) as Record<string, string | null>;
  const street = [address.line1, address.line2, address.city, address.region].filter(Boolean).join(', ');
  const phone = d.customer_phone;
  const atDoor = d.status === 'picked_up' || d.status === 'arrived';
  const due = d.amount_due_cents;
  const target = d.status === 'accepted' ? d.pickup : d.dropoff;

  const pins = [
    ...(d.pickup && d.status === 'accepted' ? [{ id: 'shop', ...d.pickup, tone: 'shop' as const, label: d.store.name }] : []),
    ...(d.dropoff ? [{ id: 'drop', ...d.dropoff, tone: 'active' as const, label: d.customer_name ?? 'Drop-off' }] : []),
  ];

  return (
    <View style={{ flex: 1, backgroundColor: color.mainBackground }}>
      <Header title={d.customer_name ?? `Order ${d.order_number}`} subtitle={`${d.store.name} · ${label(d.status)}`} right={<IconButton icon="close" label="Back to run" tint="#fff" onPress={() => router.back()} />} />
      <Screen padded={false} refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
        <RouteMap pins={pins} height={220} fitKey={d.status} />
        <View style={{ paddingHorizontal: space.l, gap: space.m }}>
          <Card>
            <Row style={{ justifyContent: 'space-between' }}>
              <T bold>Order {d.order_number}</T>
              <Badge tone={d.status === 'arrived' ? 'warning' : 'info'} text={label(d.status)} />
            </Row>
            <T muted small>
              {d.items} item{d.items === 1 ? '' : 's'} · placed {timeAgo(d.placed_at)} · you earn {money(d.earning_cents, d.currency)}
            </T>
            {street ? <T>{street}</T> : null}
            {d.customer_note ? <Notice icon="note-text-outline" text={`Note from the customer: ${d.customer_note}`} /> : null}
            <Row gap={space.s} style={{ flexWrap: 'wrap' }}>
              {phone ? <Button title="Call" icon="phone" variant="secondary" compact onPress={() => Linking.openURL(`tel:${phone}`)} /> : null}
              {phone ? <Button title="Text" icon="message-text" variant="secondary" compact onPress={() => Linking.openURL(`sms:${phone}`)} /> : null}
              {target ? (
                <Button title="Directions" icon="navigation-variant" variant="secondary" compact onPress={() => Linking.openURL(directionsUrl([target]))} />
              ) : null}
            </Row>
          </Card>

          {d.status === 'accepted' ? (
            <Button title={`Collected from ${d.store.name}`} icon="package-variant-closed-check" onPress={() => act.mutate({ action: 'picked_up' })} loading={act.isPending} />
          ) : null}

          {d.status === 'picked_up' ? (
            <Button title="I've arrived" icon="map-marker-check" onPress={() => arrived.mutate()} loading={arrived.isPending} />
          ) : null}
          {arrived.error ? <ErrorText>{arrived.error.message}</ErrorText> : null}

          {atDoor ? (
            <PaymentBox
              d={d}
              due={due}
              confirmed={paidNow}
              onConfirmed={() => {
                setPaidNow(true);
                q.refetch();
              }}
            />
          ) : null}

          {atDoor ? <Finish paid={d.payment_confirmed || paidNow || due <= 0} busy={act.isPending} error={act.error?.message} onDone={(code) => act.mutate({ action: 'delivered', code })} /> : null}

          {act.error && !atDoor ? <ErrorText>{act.error.message}</ErrorText> : null}

          {d.status === 'accepted' || atDoor ? <Problem onReport={(note) => act.mutate({ action: 'failed', note })} /> : null}
        </View>
      </Screen>
    </View>
  );
}

/**
 * Payment check at the door. The rider types the M-Pesa transaction code or
 * the payer's name from the customer's phone; the server looks it up in the
 * payments the admin's till received. A code can be used once, ever.
 */
function PaymentBox({ d, due, confirmed, onConfirmed }: { d: RiderDelivery; due: number; confirmed: boolean; onConfirmed: () => void }) {
  const [query, setQuery] = useState('');
  const [check, setCheck] = useState<PaymentCheck | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lookup = useMutation({
    mutationFn: () => rider.checkPayment(d.id, query.trim()),
    onMutate: () => setError(null),
    onSuccess: setCheck,
    onError: (e) => setError(e instanceof ApiError && e.status === 404 ? 'No payment found yet. Ask the customer to check the message from M-Pesa, or wait a minute and try again.' : e.message),
  });
  const use = useMutation({
    mutationFn: (by: { code: string } | { receipt_id: string }) => rider.usePayment(d.id, by),
    onSuccess: (c) => {
      setCheck(c);
      if (c.payment_confirmed) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        onConfirmed();
      }
    },
    onError: (e) => setError(e instanceof ApiError && e.code === 'code_used' ? 'That code has already been used for another order.' : e.message),
  });

  if (d.payment_confirmed || confirmed || due <= 0) {
    return <Notice tone="success" icon="check-circle" text={`Payment confirmed${due > 0 ? `: ${money(due, d.currency)}` : ''}.`} />;
  }

  return (
    <Card>
      <H2>Confirm payment</H2>
      <T muted>
        The customer pays {money(due, d.currency)} to The Bazaar’s till with order {d.order_number} as the reference. Type the M-Pesa code from their message, or the name it was paid from.
      </T>
      <Field
        label="Transaction code or payer name"
        value={query}
        onChangeText={(t) => {
          setQuery(t);
          setCheck(null);
        }}
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder="e.g. SGR7XK2L1P"
        onSubmitEditing={() => query.trim().length >= 3 && lookup.mutate()}
        returnKeyType="search"
      />
      <Button title="Check payment" icon="magnify" onPress={() => lookup.mutate()} loading={lookup.isPending} disabled={query.trim().length < 3} />
      {error ? <ErrorText>{error}</ErrorText> : null}
      {check ? (
        <View style={{ gap: space.s }}>
          <T small muted>
            Paid so far {money(check.paid_cents, check.currency)} of {money(check.due_cents, check.currency)}
          </T>
          {check.matches.length === 0 ? <T>No matching payment yet.</T> : null}
          {check.matches.map((m) => (
            <Card key={m.receipt_id} style={{ backgroundColor: m.used ? color.backgroundHover : color.mainBackground }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <T bold>{money(m.amount_cents, m.currency ?? undefined)}</T>
                {m.used ? <Badge tone="error" text="Already used" /> : m.enough ? <Badge tone="success" text="Covers the order" /> : <Badge tone="warning" text="Part payment" />}
              </Row>
              <T small muted>
                {m.payer_name ?? 'Unknown payer'} · {m.code} · {timeAgo(m.received_at)}
              </T>
              {!m.used ? (
                <Button
                  title="Use this payment"
                  variant="success"
                  icon="check"
                  loading={use.isPending}
                  onPress={() => use.mutate(looksLikeCode(query) && !m.code.includes('*') ? { code: query.trim().toUpperCase() } : { receipt_id: m.receipt_id })}
                />
              ) : null}
            </Card>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

function Finish({ paid, busy, error, onDone }: { paid: boolean; busy: boolean; error?: string; onDone: (code: string) => void }) {
  const [code, setCode] = useState('');
  return (
    <Card>
      <H2>Hand over and finish</H2>
      <T muted>Ask the customer for the 6-digit delivery code from their order screen.</T>
      <Field label="Delivery code" value={code} onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" maxLength={6} textContentType="oneTimeCode" autoComplete="one-time-code" />
      {!paid ? <T small muted>Confirm the payment above first.</T> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button title="Delivery done" variant="success" icon="flag-checkered" disabled={code.length !== 6 || !paid} loading={busy} onPress={() => onDone(code)} />
    </Card>
  );
}

function Problem({ onReport }: { onReport: (note: string) => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  if (!open) return <Button title="Report a problem" variant="ghost" icon="alert-circle-outline" onPress={() => setOpen(true)} />;
  return (
    <Card>
      <Field label="What went wrong?" value={note} onChangeText={setNote} multiline maxLength={500} placeholder="Customer not answering, wrong address…" />
      <Row gap={space.s}>
        <Button
          title="Hand back the job"
          variant="danger"
          disabled={note.trim().length < 3}
          onPress={async () => {
            if (await confirm('Hand back this job?', 'The store gets the order back to send again. This can\'t be undone.', 'Hand back')) onReport(note.trim());
          }}
          style={{ flex: 1 }}
        />
        <Button title="Cancel" variant="ghost" onPress={() => setOpen(false)} />
      </Row>
    </Card>
  );
}

