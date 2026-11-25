import { color } from '@/theme';
import { Icon, type IconName } from '.';

export const tabOptions = {
  headerShown: false,
  tabBarActiveTintColor: color.primary,
  tabBarInactiveTintColor: color.maxContrast,
  tabBarLabelStyle: { fontWeight: '600' as const },
  tabBarStyle: { borderTopColor: color.border },
};

export function tabIcon(name: IconName) {
  return function TabIcon({ color: tint }: { color: unknown }) {
    return <Icon name={name} tint={String(tint)} size={24} />;
  };
}
