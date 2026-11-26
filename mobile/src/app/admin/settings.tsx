import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Switch, View } from 'react-native';

import { call } from '@/api/client';
import { AccountScreen } from '@/features/AccountScreen';
import { color, space } from '@/theme';
import { Button, Card, ErrorText, Field, H2, Header, Notice, Row, Screen, Skeleton, T } from '@/ui';

type Kind = 'money' | 'rate' | 'km' | 'int' | 'text' | 'bool';
type Def = { key: string; label: string; kind: Kind; hint?: string };

/**
 * Every price, fee and rule the admin controls. Nothing is hard-coded in the
 * app: a field shows only when the server returns it, so settings the
 * backend adds later appear here as soon as they are deployed.
 */
const GROUPS: { title: string; fields: Def[] }[] = [
  {
    title: 'Riders',
    fields: [
      { key: 'rider_commission_rate', label: 'Rider share of the delivery fee (%)', kind: 'rate' },
      { key: 'rider_fee_cents', label: 'Delivery fee per drop', kind: 'money' },
      { key: 'rider_pool_radius_km', label: 'Show jobs within (km)', kind: 'km' },
      { key: 'rider_batch_radius_km', label: 'Batch drops within (km)', kind: 'km', hint: 'Usually 5 to 10 km.' },
      { key: 'rider_pickup_radius_km', label: 'Shops in one run within (km)', kind: 'km' },
      { key: 'rider_max_batch', label: 'Most drops per run', kind: 'int' },
      { key: 'rider_signups_open', label: 'Hiring riders', kind: 'bool' },
    ],
  },
  {
    title: 'Payments',
    fields: [
      { key: 'mpesa_till', label: 'M-Pesa till number', kind: 'text' },
      { key: 'mpesa_paybill', label: 'M-Pesa paybill', kind: 'text' },
      { key: 'payment_account_name', label: 'Account name shoppers see', kind: 'text' },
      { key: 'bank_name', label: 'Bank', kind: 'text' },
      { key: 'bank_account_name', label: 'Bank account name', kind: 'text' },
      { key: 'bank_account_number', label: 'Bank account number', kind: 'text' },
      { key: 'payment_instructions', label: 'Payment instructions', kind: 'text' },
      { key: 'payment_code_ttl_hours', label: 'Unused codes expire after (hours)', kind: 'int' },
      { key: 'payout_interval_days', label: 'Pay stores every (days)', kind: 'int' },
    ],
  },
  {
    title: 'Shop',
    fields: [
      { key: 'standard_shipping_cents', label: 'Standard delivery charge', kind: 'money' },
      { key: 'express_shipping_cents', label: 'Express delivery charge', kind: 'money' },
      { key: 'free_shipping_over_cents', label: 'Free delivery over', kind: 'money' },
      { key: 'tax_rate', label: 'Tax (%)', kind: 'rate' },
      { key: 'vendor_signups_open', label: 'Taking new stores', kind: 'bool' },
      { key: 'maintenance_mode', label: 'Maintenance mode', kind: 'bool' },
      { key: 'contact_phone', label: 'Admin phone shown to the public', kind: 'text' },
      { key: 'contact_whatsapp', label: 'WhatsApp', kind: 'text' },
    ],
  },
];

type Settings = Record<string, string | number | boolean | null>;

const toText = (v: Settings[string], k: Kind) =>
  v == null ? '' : k === 'money' ? String(Number(v) / 100) : k === 'rate' ? String(Math.round(Number(v) * 10000) / 100) : String(v);
const fromText = (t: string, k: Kind): string | number | null => {
  if (t.trim() === '') return null;
  if (k === 'money') return Math.round(Number(t) * 100);
  if (k === 'rate') return Number(t) / 100;
  if (k === 'km') return Number(t);
  if (k === 'int') return Math.round(Number(t));
  return t.trim();
};

export default function AdminSettings() {
  const q = useQuery({ queryKey: ['admin', 'settings'], queryFn: () => call<Settings>('GET', '/admin/settings') });
  const [draft, setDraft] = useState<Record<string, string | boolean>>({});
  const [showAccount, setShowAccount] = useState(false);

  const changes: Settings = {};
  for (const g of GROUPS)
    for (const f of g.fields) {
      if (!(f.key in draft)) continue;
      const v = draft[f.key];
      changes[f.key] = typeof v === 'boolean' ? v : fromText(v, f.kind);
    }
  const bad = Object.entries(changes).some(([, v]) => typeof v === 'number' && !Number.isFinite(v));

  const save = useMutation({
    mutationFn: () => call<Settings>('PATCH', '/admin/settings', changes),
    onSuccess: () => {
      setDraft({});
      q.refetch();
    },
  });

  if (showAccount) return <AccountScreen role="Admin"><Button title="Back to settings" variant="secondary" onPress={() => setShowAccount(false)} /></AccountScreen>;
  const s = q.data;
  return (
    <View style={{ flex: 1, backgroundColor: color.mainBackground }}>
      <Header title="Settings" subtitle="Prices, fees and rules" />
      <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
        {q.isLoading ? <Skeleton rows={5} height={56} /> : null}
        {q.error ? <ErrorText>{q.error.message}</ErrorText> : null}
        {s
          ? GROUPS.map((g) => {
              const fields = g.fields.filter((f) => f.key in s);
              if (!fields.length) return null;
              return (
                <Card key={g.title}>
                  <H2>{g.title}</H2>
                  {fields.map((f) =>
                    f.kind === 'bool' ? (
                      <Row key={f.key} style={{ justifyContent: 'space-between', minHeight: 44 }}>
                        <T style={{ flex: 1 }}>{f.label}</T>
                        <Switch
                          value={(draft[f.key] as boolean | undefined) ?? !!s[f.key]}
                          onValueChange={(v) => setDraft({ ...draft, [f.key]: v })}
                          accessibilityLabel={f.label}
                          trackColor={{ true: color.primary, false: color.backgroundDarker }}
                        />
                      </Row>
                    ) : (
                      <Field
                        key={f.key}
                        label={f.label}
                        hint={f.hint}
                        value={(draft[f.key] as string | undefined) ?? toText(s[f.key], f.kind)}
                        onChangeText={(t) => setDraft({ ...draft, [f.key]: t })}
                        keyboardType={f.kind === 'text' ? 'default' : 'decimal-pad'}
                        multiline={f.key === 'payment_instructions'}
                      />
                    ),
                  )}
                </Card>
              );
            })
          : null}
        {s && !('rider_commission_rate' in s) ? <Notice tone="warning" text="Rider commission, batching and till settings appear here once the server update with central payments is deployed." /> : null}
        {save.error ? <ErrorText>{save.error.message}</ErrorText> : null}
        {save.isSuccess && !Object.keys(changes).length ? <Notice tone="success" icon="check" text="Saved." /> : null}
        <Button title={`Save ${Object.keys(changes).length || ''} change${Object.keys(changes).length === 1 ? '' : 's'}`} disabled={!Object.keys(changes).length || bad} loading={save.isPending} onPress={() => save.mutate()} />
        <Button title="My account" variant="ghost" icon="account-circle" onPress={() => setShowAccount(true)} />
        <View style={{ height: space.l }} />
      </Screen>
    </View>
  );
}
