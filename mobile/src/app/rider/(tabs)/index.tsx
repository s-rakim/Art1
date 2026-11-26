import { useMutation } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Linking, Platform, Pressable, Switch, View } from 'react-native';

import { api, ApiError, unwrap } from '@/api/client';
import { rider, type OpenJob, type RiderDelivery } from '@/api/market';
import { blockedText, useDoneToday, useOpenJobs, useRiderMe, useRiderRefresh, useRun } from '@/features/rider/data';
import { useMyPosition } from '@/features/rider/useMyPosition';
import { useAuth } from '@/lib/auth';
import { greeting, km, label, money, timeAgo } from '@/lib/format';
import { directionsUrl, routeLine } from '@/lib/geo';
import { useLive } from '@/lib/live';
import { askLocation, postLocation, startSharing, stopSharing } from '@/lib/location-task';
import { RouteMap } from '@/map/RouteMap';
import type { MapPin } from '@/map/types';
import { color, space } from '@/theme';
import { Badge, Button, Card, Empty, ErrorText, H2, Header, Icon, Notice, Row, Screen, Skeleton, Stat, T, notify } from '@/ui';

const RUN_STATES = ['accepted', 'picked_up', 'arrived'];

export default function RiderRun() {
  const { me: account } = useAuth();
  const meQ = useRiderMe();
  const online = !!meQ.data?.is_online;
  const jobsQ = useOpenJobs(online);
  const runQ = useRun(online);
  const doneQ = useDoneToday(true);
  const refresh = useRiderRefresh();
  const position = useMyPosition(online);
  const [selected, setSelected] = useState<string | null>(null);
  const [line, setLine] = useState<[number, number][]>([]);
  const [shiftError, setShiftError] = useState<string | null>(null);

  // New jobs, offers and status changes arrive over the socket; refetch when they do.
  useLive([{ scope: 'me' }], (e) => {
    if (['job', 'jobs', 'order', 'payment'].includes(e.type)) refresh();
  });

  const run = runQ.data;
  const stops = useMemo(() => (run?.stops ?? []).filter((d) => RUN_STATES.includes(d.status)), [run]);
  const jobs = useMemo(() => jobsQ.data?.items ?? [], [jobsQ.data]);
  const delivering = stops.length > 0;
  const rideStatus = jobsQ.data?.ride_status ?? meQ.data?.ride_status ?? (online ? (delivering ? 'delivering' : 'idle') : 'offline');

  // The navigation line: from the rider, through uncollected shops, then drop-offs oldest order first.
  const routeKey = JSON.stringify(run?.route?.map((w) => [w.lat, w.lng]) ?? []);
  useEffect(() => {
    const pts = (run?.route ?? []).filter((w) => w.kind !== 'rider');
    const from = position ?? run?.route?.find((w) => w.kind === 'rider') ?? null;
    const all = from ? [from, ...pts] : pts;
    let live = true;
    // With fewer than two points this resolves to no line at all.


    routeLine(all).then((l) => live && setLine(l.length > 1 ? l : []));
    return () => {
      live = false;
    };
    // Re-route when the stops change, or every ~200 m of movement, not on every GPS tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey, position && Math.round(position.lat * 500), position && Math.round(position.lng * 500)]);

  const pins: MapPin[] = useMemo(() => {
    const out: MapPin[] = [];
    stops.forEach((d, i) => {
      if (d.status === 'accepted' && d.pickup) out.push({ id: `shop-${d.id}`, ...d.pickup, tone: 'shop', label: d.store.name });
      if (d.dropoff) out.push({ id: d.id, ...d.dropoff, tone: 'active', order: i + 1, label: d.customer_name ?? d.order_number });
    });
    for (const j of jobs) {
      if (!j.dropoff) continue;
      // Taken by this rider a moment ago but the run hasn't refetched yet: red already.
      const tone = !j.batchable ? 'blocked' : selected === j.id ? 'active' : 'pending';
      out.push({ id: `job-${j.id}`, ...j.dropoff, tone, label: `${j.store.name} to ${j.area ?? 'drop-off'}` });
    }
    for (const d of doneQ.data ?? []) if (d.dropoff) out.push({ id: `done-${d.id}`, ...d.dropoff, tone: 'done', label: d.customer_name ?? d.order_number });
    return out;
  }, [stops, jobs, doneQ.data, selected]);

  const shift = useMutation({
    mutationFn: async (next: boolean) => {
      setShiftError(null);
      if (next) {
        const perm = await askLocation(true);
        if (perm === 'denied') throw new Error('Location is off. Allow it in Settings so shops and customers can see you coming.');
        const res = await unwrap(api.POST('/api/v1/rider/shift', { body: { online: true } }));
        if (perm === 'granted') await startSharing();
        else if (Platform.OS !== 'web') setShiftError('Location is shared only while the app is open. Choose "Allow all the time" in Settings to keep it going in your pocket.');
        return res;
      }
      const res = await unwrap(api.POST('/api/v1/rider/shift', { body: { online: false } }));
      await stopSharing();
      return res;
    },
    onSuccess: () => refresh(),
    onError: (e) => setShiftError(e.message),
  });

  // While the screen is open, also post the foreground position (covers the web preview and "while using" permission).
  useEffect(() => {
    if (online && position) postLocation({ latitude: position.lat, longitude: position.lng, heading: position.heading, accuracy: null, altitude: null, altitudeAccuracy: null, speed: null });
  }, [online, position]);

  const take = useMutation({
    mutationFn: (j: OpenJob) => rider.claim(j.id),
    onMutate: (j) => setSelected(j.id),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      refresh();
    },
    onError: (e) => {
      setSelected(null);
      if (e instanceof ApiError && e.code === 'taken') notify('Another rider got there first', 'The board has been refreshed.');
      else notify("Couldn't take that job", e.message);
      refresh();
    },
  });

  const skip = useMutation({
    mutationFn: (j: OpenJob) => rider.skip(j.id),
    onSuccess: () => refresh(),
    onError: (e) => notify("Couldn't skip", e.message),
  });

  const me = meQ.data;
  const loading = meQ.isLoading;
  const navigate = () => {
    const pts = (run?.route ?? []).filter((w) => w.kind !== 'rider');
    const url = directionsUrl(pts, position);
    if (url) Linking.openURL(url);
  };

  return (
    <View style={{ flex: 1, backgroundColor: color.mainBackground }}>
      <Header
        title={greeting(account?.first_name)}
        subtitle={rideStatus === 'delivering' ? `On a run: ${stops.length} stop${stops.length === 1 ? '' : 's'}` : rideStatus === 'idle' ? 'On shift, waiting for jobs' : 'Off shift'}
        right={
          <Row gap={space.xs}>
            <T style={{ color: '#fff' }} small bold>
              {online ? 'On' : 'Off'}
            </T>
            <Switch
              value={online}
              onValueChange={(v) => shift.mutate(v)}
              disabled={shift.isPending || loading}
              trackColor={{ true: '#7fc4e6', false: 'rgba(255,255,255,0.4)' }}
              thumbColor="#fff"
              accessibilityLabel={online ? 'Go off shift' : 'Go on shift'}
            />
          </Row>
        }
      />
      <Screen padded={false} refreshing={meQ.isRefetching || jobsQ.isRefetching} onRefresh={refresh}>
        <View>
          <RouteMap pins={pins} line={line} me={position} height={320} fitKey={`${stops.length}-${jobs.length}`} onPinPress={(id) => setSelected(id.replace(/^job-/, ''))} />
          {delivering ? (
            <View style={{ position: 'absolute', left: space.m, bottom: space.l }}>
              <Button title="Directions" icon="navigation-variant" onPress={navigate} compact />
            </View>
          ) : null}
        </View>
        <View style={{ paddingHorizontal: space.l, gap: space.m }}>
          {shiftError ? <ErrorText>{shiftError}</ErrorText> : null}
          {loading ? (
            <Skeleton rows={1} height={80} />
          ) : me ? (
            <Row gap={space.s} style={{ flexWrap: 'wrap' }}>
              <Stat icon="check-decagram" label="Deliveries done" value={String(me.completed_deliveries)} />
              <Stat icon="cash" label="Earned" value={money(me.earnings_cents, me.currency)} />
              <Stat icon="wallet-outline" label="Not paid out yet" value={money(me.unpaid_earnings_cents, me.currency)} />
            </Row>
          ) : null}
          <Legend />

          {delivering ? (
            <>
              <H2>Your run</H2>
              {stops.map((d, i) => (
                <StopCard key={d.id} d={d} n={i + 1} />
              ))}
            </>
          ) : null}

          <Row style={{ justifyContent: 'space-between' }}>
            <H2>{delivering ? 'Add to this run' : 'Jobs near you'}</H2>
            {jobsQ.data?.rules ? (
              <T small muted>
                Batch within {jobsQ.data.rules.batch_radius_km} km
              </T>
            ) : null}
          </Row>
          {!online ? (
            <Empty icon="power-sleep" title="You're off shift" body="Go on shift to see jobs near you and share your location with the dispatch desk." action={{ title: 'Go on shift', onPress: () => shift.mutate(true) }} />
          ) : jobsQ.isLoading ? (
            <Skeleton rows={2} />
          ) : jobsQ.error ? (
            <ErrorText>{jobsQ.error.message}</ErrorText>
          ) : jobs.length === 0 ? (
            <Empty icon="map-search-outline" title="No jobs right now" body="New orders near you show up here and on the map as yellow pins." />
          ) : (
            jobs.map((j) => (
              <JobCard
                key={j.id}
                j={j}
                selected={selected === j.id}
                onSelect={() => setSelected(j.id)}
                onTake={() => take.mutate(j)}
                onSkip={() => skip.mutate(j)}
                busy={(take.isPending && take.variables?.id === j.id) || (skip.isPending && skip.variables?.id === j.id)}
              />
            ))
          )}
        </View>
      </Screen>
    </View>
  );
}

function Legend() {
  const item = (c: string, t: string, faded?: boolean) => (
    <Row gap={6}>
      <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: c, opacity: faded ? 0.35 : 1 }} />
      <T small muted>
        {t}
      </T>
    </Row>
  );
  return (
    <View accessible accessibilityLabel="Map key: yellow waiting, red on your run, green delivered, grey out of range" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.m }}>
      {item('#f2c200', 'Waiting')}
      {item('#d62d20', 'Your run')}
      {item('#0f9d58', 'Delivered')}
      {item('#9e9e9e', 'Out of range', true)}
    </View>
  );
}

function JobCard({ j, selected, onSelect, onTake, onSkip, busy }: { j: OpenJob; selected: boolean; onSelect: () => void; onTake: () => void; onSkip: () => void; busy: boolean }) {
  const blocked = !j.batchable;
  return (
    <Pressable onPress={onSelect} accessibilityRole="button" accessibilityLabel={`Job from ${j.store.name}${blocked ? ', not available on this run' : ''}`}>
      <Card style={[blocked && { opacity: 0.4 }, selected && !blocked && { borderColor: color.primary, borderWidth: 2 }]}>
        <Row style={{ justifyContent: 'space-between' }}>
          <T bold lines={1} style={{ flex: 1 }}>
            {j.store.name}
          </T>
          <T bold>{money(j.earning_cents)}</T>
        </Row>
        <Row gap={space.m} style={{ flexWrap: 'wrap' }}>
          <Row gap={4}>
            <Icon name="map-marker" size={16} tint={color.maxContrast} />
            <T small muted>
              {j.area ?? 'Drop-off'}
            </T>
          </Row>
          {j.distance_km != null ? (
            <T small muted>
              {km(j.distance_km)} to shop
            </T>
          ) : null}
          {j.trip_km != null ? (
            <T small muted>
              {km(j.trip_km)} trip
            </T>
          ) : null}
          <T small muted>
            {j.items} item{j.items === 1 ? '' : 's'}
          </T>
          <T small muted>
            {timeAgo(j.placed_at)}
          </T>
        </Row>
        {j.offered ? <Badge tone="info" text="Offered to you" /> : null}
        {blocked ? (
          <T small muted>
            {blockedText[j.blocked_reason ?? ''] ?? 'Not available on this run.'}
          </T>
        ) : (
          <Row gap={space.s}>
            <Button title="Take job" icon="check" onPress={onTake} loading={busy} style={{ flex: 1 }} />
            <Button title="Skip" variant="ghost" onPress={onSkip} disabled={busy} />
          </Row>
        )}
      </Card>
    </Pressable>
  );
}

function StopCard({ d, n }: { d: RiderDelivery; n: number }) {
  const address = d.dropoff_address as Record<string, string | null> | null;
  const street = [address?.line1, address?.line2, address?.city].filter(Boolean).join(', ');
  return (
    <Card onPress={() => router.push(`/rider/job/${d.id}`)} label={`Stop ${n}: ${d.customer_name ?? d.order_number}`}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row>
          <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: '#d62d20', alignItems: 'center', justifyContent: 'center' }}>
            <T bold style={{ color: '#fff', fontSize: 13 }}>
              {n}
            </T>
          </View>
          <T bold>{d.customer_name ?? d.order_number}</T>
        </Row>
        <Badge tone={d.status === 'arrived' ? 'warning' : 'info'} text={label(d.status)} />
      </Row>
      <T small muted>
        {d.status === 'accepted' ? `Collect at ${d.store.name}` : street || 'Drop-off'}
      </T>
      {d.customer_note ? <Notice icon="note-text-outline" text={d.customer_note} /> : null}
      <Row style={{ justifyContent: 'space-between' }}>
        <T small>{d.payment_confirmed || d.amount_due_cents <= 0 ? 'Paid' : `To pay: ${money(d.amount_due_cents, d.currency)}`}</T>
        <Row gap={4}>
          <T small style={{ color: color.primary }} bold>
            Open
          </T>
          <Icon name="chevron-right" size={18} tint={color.primary} />
        </Row>
      </Row>
    </Card>
  );
}
