import { useRiderMe } from '@/features/rider/data';
import { AccountScreen } from '@/features/AccountScreen';
import { Card, T } from '@/ui';

export default function RiderAccount() {
  const me = useRiderMe().data;
  return (
    <AccountScreen role="Rider">
      {me ? (
        <Card>
          <T bold>{me.full_name}</T>
          <T muted>
            {me.vehicle.replace('_', ' ')} · {me.city} · {me.phone}
          </T>
        </Card>
      ) : null}
    </AccountScreen>
  );
}
