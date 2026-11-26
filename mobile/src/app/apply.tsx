import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { api, ApiError, unwrap } from '@/api/client';
import { useAuth } from '@/lib/auth';
import { Guard } from '@/lib/guard';
import { label } from '@/lib/format';
import { color, space } from '@/theme';
import { Badge, Button, Card, ErrorText, Field, H2, Header, Notice, Screen, Segmented, Skeleton, T, confirm } from '@/ui';

type Vehicle = 'motorbike' | 'bicycle' | 'car' | 'van' | 'on_foot';

/** Rider hiring form, then a waiting room until an admin decides. */
export default function Apply() {
  return (
    <Guard area="applicant">
      <ApplyInner />
    </Guard>
  );
}

function ApplyInner() {
  const { me, refetchMe, signOut } = useAuth();
  const app = useQuery({
    queryKey: ['rider', 'application'],
    queryFn: async () => {
      try {
        return await unwrap(api.GET('/api/v1/rider/me'));
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
  });
  const [form, setForm] = useState({ full_name: me?.full_name ?? '', phone: '', city: '', licence_number: '' });
  const [vehicle, setVehicle] = useState<Vehicle>('motorbike');
  const submit = useMutation({
    mutationFn: () =>
      unwrap(api.POST('/api/v1/rider/applications', { body: { ...form, vehicle, licence_number: form.licence_number || null } })),
    onSuccess: () => {
      app.refetch();
      refetchMe();
    },
  });
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const status = app.data?.status;

  return (
    <View style={{ flex: 1, backgroundColor: color.mainBackground }}>
      <Header title="Ride with The Bazaar" subtitle={me?.email ?? undefined} />
      <Screen refreshing={app.isRefetching} onRefresh={() => { app.refetch(); refetchMe(); }}>
        {app.isLoading ? <Skeleton rows={3} /> : null}
        {status && status !== 'rejected' ? (
          <Card>
            <Badge tone={status === 'active' ? 'success' : 'warning'} text={label(status)} />
            <H2>{status === 'applicant' ? 'Thanks, we have your application' : 'Your account'}</H2>
            <T muted>
              {status === 'applicant'
                ? 'The team reviews new riders and will get in touch. Pull down to check again.'
                : status === 'suspended'
                  ? `Your rider account is paused.${app.data?.review_note ? ` Note: ${app.data.review_note}` : ''}`
                  : 'You are hired. Pull down to open the rider app.'}
            </T>
          </Card>
        ) : null}
        {!app.isLoading && (!status || status === 'rejected') ? (
          <View style={{ gap: space.m }}>
            {status === 'rejected' ? <Notice tone="warning" text={`Your last application wasn't accepted.${app.data?.review_note ? ` ${app.data.review_note}` : ''} You can apply again.`} /> : null}
            <Field label="Full name" value={form.full_name} onChangeText={set('full_name')} autoComplete="name" />
            <Field label="Phone" value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" autoComplete="tel" placeholder="07…" />
            <Field label="Town or city" value={form.city} onChangeText={set('city')} />
            <T bold small>
              How do you ride?
            </T>
            <Segmented<Vehicle>
              value={vehicle}
              onChange={setVehicle}
              options={[
                { value: 'motorbike', label: 'Motorbike' },
                { value: 'bicycle', label: 'Bicycle' },
                { value: 'car', label: 'Car' },
                { value: 'van', label: 'Van' },
                { value: 'on_foot', label: 'On foot' },
              ]}
            />
            <Field label="Licence number (if you drive)" value={form.licence_number} onChangeText={set('licence_number')} autoCapitalize="characters" />
            {submit.error ? <ErrorText>{submit.error.message}</ErrorText> : null}
            <Button title="Send application" onPress={() => submit.mutate()} loading={submit.isPending} disabled={!form.full_name || !form.phone || !form.city} />
          </View>
        ) : null}
        <Button title="Sign out" variant="ghost" onPress={async () => (await confirm('Sign out?', 'You can sign back in any time.', 'Sign out')) && signOut()} />
      </Screen>
    </View>
  );
}
