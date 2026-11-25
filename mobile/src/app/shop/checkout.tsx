import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { api, unwrap } from '@/api/client';
import type { PaymentInfo } from '@/api/market';
import { useCheckout } from '@/features/customer/checkout-store';
import { useAuth } from '@/lib/auth';
import { money } from '@/lib/format';
import { RouteMap } from '@/map/RouteMap';
import { color } from '@/theme';
import { Button, Card, ErrorText, Field, H2, Header, Icon, IconButton, Notice, Row, Screen, Segmented, T } from '@/ui';

type Method = 'cod' | 'bank_transfer';

export default function Checkout() {
  const qc = useQueryClient();
  const { me } = useAuth();
  const lines = useCheckout((s) => s.lines);
  const addresses = useQuery({ queryKey: ['addresses'], queryFn: () => unwrap(api.GET('/api/v1/me/addresses')) });
  const status = useQuery({ queryKey: ['status'], queryFn: () => unwrap(api.GET('/api/v1/status')), staleTime: 300_000 });
  const pay = (status.data as { payment?: PaymentInfo } | undefined)?.payment;

  const [addressId, setAddressId] = useState<string | null>(null);
  const [addr, setAddr] = useState({ full_name: me?.full_name ?? '', phone: '', line1: '', line2: '', city: '' });
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);
  const [method, setMethod] = useState<Method>('cod');
  const [shipping, setShipping] = useState<'standard' | 'express'>('standard');

  const saved = addresses.data ?? [];
  const chosen = saved.find((a) => a.id === addressId) ?? (addressId === null ? saved.find((a) => a.is_default) : undefined);
  const subtotal = lines.reduce((s, l) => s + l.line_total_cents, 0);

  const locate = async () => {
    setPinError(null);
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') return setPinError('Allow location to drop the pin where you are, or type the address.');
    const l = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    setPin({ lat: l.coords.latitude, lng: l.coords.longitude });
  };

  const place = useMutation({
    mutationFn: async () => {
      const items = lines.map((l) => ({ product_id: l.product_id, variant_id: l.variant_id, quantity: l.quantity }));
      const useNew = !chosen || addressId === 'new';
      return unwrap(
        api.POST('/api/v1/checkout', {
          body: {
            items,
            address_id: useNew ? null : chosen!.id,
            shipping_address: useNew
              ? { ...addr, line2: addr.line2 || null, label: 'Drop-off', lat: pin?.lat ?? null, lng: pin?.lng ?? null, region: null, postal_code: null, country: 'KE', is_default: !saved.length }
              : null,
            shipping_method: shipping,
            payment_method: method,
            coupon_code: null,
          },
        }),
      );
    },
    onSuccess: (o) => {
      qc.invalidateQueries({ queryKey: ['cart'] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      router.replace(`/shop/order/${o.order_id}`);
    },
  });

  const newAddress = !chosen || addressId === 'new';
  const ready = lines.length > 0 && (!newAddress || (addr.full_name && addr.phone && addr.line1 && addr.city));

  return (
    <View style={{ flex: 1, backgroundColor: color.mainBackground }}>
      <Header title="Checkout" subtitle={`${lines.length} line${lines.length === 1 ? '' : 's'} · ${money(subtotal)}`} right={<IconButton icon="arrow-left" label="Back to cart" tint="#fff" onPress={() => router.back()} />} />
      <Screen>
        <H2>Deliver to</H2>
        {saved.map((a) => {
          const on = chosen?.id === a.id && addressId !== 'new';
          return (
            <Pressable key={a.id} onPress={() => setAddressId(a.id)} accessibilityRole="radio" accessibilityState={{ selected: on }}>
              <Card style={on && { borderColor: color.primary, borderWidth: 2 }}>
                <Row>
                  <Icon name={on ? 'radiobox-marked' : 'radiobox-blank'} tint={on ? color.primary : color.maxContrast} />
                  <View style={{ flex: 1 }}>
                    <T bold>{a.label ?? a.full_name}</T>
                    <T small muted>
                      {[a.line1, a.line2, a.city].filter(Boolean).join(', ')}
                    </T>
                    {a.lat == null ? <T small style={{ color: color.warningText }}>No map pin on this address</T> : null}
                  </View>
                </Row>
              </Card>
            </Pressable>
          );
        })}
        {saved.length ? <Button title="Use a new address" variant={newAddress ? 'secondary' : 'ghost'} icon="plus" onPress={() => setAddressId('new')} /> : null}
        {newAddress ? (
          <Card>
            <Field label="Name" value={addr.full_name} onChangeText={(v) => setAddr({ ...addr, full_name: v })} autoComplete="name" />
            <Field label="Phone for the rider" value={addr.phone} onChangeText={(v) => setAddr({ ...addr, phone: v })} keyboardType="phone-pad" autoComplete="tel" />
            <Field label="Street, building, house" value={addr.line1} onChangeText={(v) => setAddr({ ...addr, line1: v })} autoComplete="street-address" />
            <Field label="Landmark or note for the rider" value={addr.line2} onChangeText={(v) => setAddr({ ...addr, line2: v })} placeholder="Blue gate opposite the chemist" />
            <Field label="Town" value={addr.city} onChangeText={(v) => setAddr({ ...addr, city: v })} />
            <Button title={pin ? 'Move pin to where I am' : 'Drop a pin where I am'} icon="crosshairs-gps" variant="secondary" onPress={locate} />
            {pinError ? <ErrorText>{pinError}</ErrorText> : null}
            {pin ? <RouteMap pins={[{ id: 'drop', ...pin, tone: 'active', label: 'Your drop-off' }]} height={180} fitKey={`${pin.lat},${pin.lng}`} /> : null}
            <T small muted>
              The pin takes riders to your door. You can move it later from the order page while it’s on the way.
            </T>
          </Card>
        ) : null}

        <H2>Delivery</H2>
        <Segmented value={shipping} onChange={setShipping} options={[{ value: 'standard', label: 'Standard' }, { value: 'express', label: 'Express' }]} />

        <H2>Payment</H2>
        <Segmented value={method} onChange={setMethod} options={[{ value: 'cod', label: 'Pay on arrival' }, { value: 'bank_transfer', label: 'Bank transfer' }]} />
        <Notice
          icon="cellphone-message"
          text={
            method === 'cod'
              ? `When the rider arrives, pay The Bazaar by M-Pesa${pay?.mpesa_till ? ` to till ${pay.mpesa_till}` : pay?.mpesa_paybill ? ` to paybill ${pay.mpesa_paybill}` : ''} with your order number as the reference. The rider checks the payment and hands over your order.`
              : `Pay into ${pay?.bank_name ?? "The Bazaar's bank account"}${pay?.bank_account_number ? ` (${pay.bank_account_name ?? ''} ${pay.bank_account_number})` : ''} with your order number as the reference.`
          }
        />
        <T small muted>
          Prices, delivery and any discounts are worked out by The Bazaar when you place the order.
        </T>
        {place.error ? <ErrorText>{place.error.message}</ErrorText> : null}
        <Button title="Place order" icon="check" onPress={() => place.mutate()} loading={place.isPending} disabled={!ready} />
      </Screen>
    </View>
  );
}
