import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Image } from 'expo-image';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, font, radius, space, touch } from '@/theme';
import { Logo } from './Logo';

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/** Filled Material Design Icons, the same family Nextcloud uses. */
export function Icon({ name, size = 22, tint = color.mainText }: { name: IconName; size?: number; tint?: string }) {
  return <MaterialCommunityIcons name={name} size={size} color={tint} accessibilityElementsHidden importantForAccessibility="no" />;
}

const wallpaper = require('../../assets/images/wallpaper.webp');

/**
 * The top band: Nextcloud's blue wallpaper with the logo and a greeting.
 * Screens sit on white below it, like Nextcloud's body container.
 */
export function Header({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.header, { paddingTop: insets.top + space.s }]}>
      <Image source={wallpaper} style={StyleSheet.absoluteFill} contentFit="cover" accessible={false} />
      {/* The wallpaper has bright patches; a light shade keeps white text readable everywhere on it. */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,41,63,0.28)' }]} />
      <View style={s.headerRow}>
        <Logo size={30} />
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle} numberOfLines={1} accessibilityRole="header">
            {title}
          </Text>
          {subtitle ? (
            <Text style={s.headerSub} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right}
      </View>
    </View>
  );
}

export function Screen({
  children,
  refreshing,
  onRefresh,
  scroll = true,
  padded = true,
}: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  scroll?: boolean;
  padded?: boolean;
}) {
  if (!scroll) return <View style={[s.screen, padded && s.padded]}>{children}</View>;
  return (
    <ScrollView
      style={s.screen}
      contentContainerStyle={[padded && s.padded, { paddingBottom: space.xxl, gap: space.m }]}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={color.primary} /> : undefined}
    >
      {children}
    </ScrollView>
  );
}

export function Plain({ children }: { children: ReactNode }) {
  return <SafeAreaView style={[s.screen, { backgroundColor: color.backgroundPlain }]}>{children}</SafeAreaView>;
}

export function Card({ children, style, onPress, label }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; label?: string }) {
  if (onPress)
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => [s.card, pressed && { backgroundColor: color.backgroundHover }, style]}
      >
        {children}
      </Pressable>
    );
  return <View style={[s.card, style]}>{children}</View>;
}

export function H2({ children }: { children: ReactNode }) {
  return (
    <Text style={s.h2} accessibilityRole="header">
      {children}
    </Text>
  );
}

export function T({ children, muted, small, bold, style, lines }: { children: ReactNode; muted?: boolean; small?: boolean; bold?: boolean; style?: StyleProp<TextStyle>; lines?: number }) {
  return (
    <Text
      numberOfLines={lines}
      style={[s.text, muted && { color: color.maxContrast }, small && { fontSize: font.small }, bold && { fontWeight: '600' }, style]}
    >
      {children}
    </Text>
  );
}

/** Figures line up in columns. */
export function Num({ children, style, lines }: { children: ReactNode; style?: StyleProp<TextStyle>; lines?: number }) {
  return (
    <Text numberOfLines={lines} adjustsFontSizeToFit={!!lines} minimumFontScale={0.7} style={[s.text, { fontVariant: ['tabular-nums'] }, style]}>
      {children}
    </Text>
  );
}

type Variant = 'primary' | 'secondary' | 'danger' | 'success' | 'ghost';

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  style,
  compact,
}: {
  title: string;
  onPress: () => void;
  variant?: Variant;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}) {
  const v = variants[variant];
  const off = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      style={({ pressed }) => [
        s.button,
        compact && { paddingHorizontal: space.m },
        { backgroundColor: pressed ? v.pressed : v.bg, borderColor: v.border },
        off && { opacity: 0.5 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={v.fg} /> : icon ? <Icon name={icon} size={20} tint={v.fg} /> : null}
      <Text style={[s.buttonText, { color: v.fg }]} numberOfLines={1}>
        {title}
      </Text>
    </Pressable>
  );
}

const variants: Record<Variant, { bg: string; fg: string; pressed: string; border: string }> = {
  primary: { bg: color.primaryElement, fg: color.primaryElementText, pressed: color.primaryElementHover, border: color.primaryElement },
  secondary: { bg: color.primaryElementLight, fg: color.primaryElementLightText, pressed: '#dbe4e9', border: color.primaryElementLight },
  danger: { bg: color.mainBackground, fg: color.elementError, pressed: color.error, border: color.elementError },
  success: { bg: color.elementSuccess, fg: '#ffffff', pressed: '#078304', border: color.elementSuccess },
  ghost: { bg: 'transparent', fg: color.primary, pressed: color.backgroundHover, border: 'transparent' },
};

export function IconButton({ icon, label, onPress, tint = color.mainText }: { icon: IconName; label: string; onPress: () => void; tint?: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => [s.iconButton, pressed && { backgroundColor: 'rgba(0,0,0,0.08)' }]}
    >
      <Icon name={icon} tint={tint} />
    </Pressable>
  );
}

export function Field({ label, error, hint, ...input }: TextInputProps & { label: string; error?: string | null; hint?: string }) {
  return (
    <View style={{ gap: space.xs }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        placeholderTextColor={color.maxContrast}
        accessibilityLabel={label}
        style={[s.input, !!error && { borderColor: color.elementError }, input.multiline && { minHeight: 88, textAlignVertical: 'top', paddingTop: space.s }]}
        {...input}
      />
      {error ? <ErrorText>{error}</ErrorText> : hint ? <T small muted>{hint}</T> : null}
    </View>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <Text style={{ color: color.errorText, fontSize: font.small }} accessibilityLiveRegion="polite" accessibilityRole="alert">
      {children}
    </Text>
  );
}

type Tone = 'info' | 'success' | 'warning' | 'error' | 'neutral' | 'primary';
const tones: Record<Tone, { bg: string; fg: string }> = {
  info: { bg: color.info, fg: color.infoText },
  success: { bg: color.success, fg: color.successText },
  warning: { bg: color.warning, fg: color.warningText },
  error: { bg: color.error, fg: color.errorText },
  neutral: { bg: color.backgroundDark, fg: color.mainText },
  primary: { bg: color.primaryElement, fg: color.primaryElementText },
};

export function Badge({ text, tone = 'neutral' }: { text: string; tone?: Tone }) {
  const t = tones[tone];
  return (
    <View style={[s.badge, { backgroundColor: t.bg }]}>
      <Text style={{ color: t.fg, fontSize: font.small, fontWeight: '600' }}>{text}</Text>
    </View>
  );
}

export function Notice({ text, tone = 'info', icon }: { text: string; tone?: Tone; icon?: IconName }) {
  const t = tones[tone];
  return (
    <View style={[s.notice, { backgroundColor: t.bg }]} accessibilityRole="text">
      {icon ? <Icon name={icon} size={20} tint={t.fg} /> : null}
      <Text style={{ color: t.fg, flex: 1, fontSize: font.body }}>{text}</Text>
    </View>
  );
}

export function Stat({ label, value, icon }: { label: string; value: string; icon?: IconName }) {
  return (
    <View style={s.stat} accessible accessibilityLabel={`${label}: ${value}`}>
      {icon ? <Icon name={icon} size={20} tint={color.primary} /> : null}
      <Num style={s.statValue} lines={1}>
        {value}
      </Num>
      <Text style={s.statLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function Row({ children, style, gap = space.s }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function Empty({ icon, title, body, action }: { icon: IconName; title: string; body?: string; action?: { title: string; onPress: () => void } }) {
  return (
    <View style={s.empty}>
      <Icon name={icon} size={40} tint={color.maxContrast} />
      <T bold>{title}</T>
      {body ? (
        <T muted style={{ textAlign: 'center' }}>
          {body}
        </T>
      ) : null}
      {action ? <Button title={action.title} onPress={action.onPress} variant="secondary" /> : null}
    </View>
  );
}

/** Grey blocks shaped like the content that is loading. */
export function Skeleton({ rows = 3, height = 72 }: { rows?: number; height?: number }) {
  return (
    <View style={{ gap: space.m }} accessibilityLabel="Loading" accessibilityRole="progressbar">
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={{ height, borderRadius: radius.container, backgroundColor: color.backgroundDark }} />
      ))}
    </View>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.s }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={[s.chip, on && { backgroundColor: color.primaryElement, borderColor: color.primaryElement }]}
          >
            <Text style={{ color: on ? color.primaryElementText : color.mainText, fontWeight: on ? '600' : '400' }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Confirmation for anything that can't be undone. Works in the web preview too. */
export function confirm(title: string, message: string, ok = 'Confirm'): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(globalThis.confirm?.(`${title}\n\n${message}`) ?? false);
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: ok, style: 'destructive', onPress: () => resolve(true) },
    ]),
  );
}

export function notify(title: string, message?: string) {
  if (Platform.OS === 'web') globalThis.alert?.(message ? `${title}\n\n${message}` : title);
  else Alert.alert(title, message);
}

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.mainBackground },
  padded: { padding: space.l },
  header: { paddingHorizontal: space.l, paddingBottom: space.m, overflow: 'hidden', backgroundColor: color.backgroundPlain },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: space.m, minHeight: touch },
  headerTitle: { color: '#fff', fontSize: font.large, fontWeight: '700' },
  headerSub: { color: 'rgba(255,255,255,0.9)', fontSize: font.small },
  card: {
    backgroundColor: color.mainBackground,
    borderRadius: radius.container,
    borderWidth: 1,
    borderColor: color.border,
    padding: space.l,
    gap: space.s,
  },
  h2: { fontSize: font.large, fontWeight: '700', color: color.mainText, marginTop: space.s },
  text: { fontSize: font.body, color: color.mainText, lineHeight: 21 },
  button: {
    minHeight: touch,
    borderRadius: radius.pill,
    paddingHorizontal: space.l,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.s,
    borderWidth: 1,
  },
  buttonText: { fontSize: font.body, fontWeight: '600' },
  iconButton: { width: touch, height: touch, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: font.small, fontWeight: '600', color: color.mainText },
  input: {
    minHeight: touch,
    borderWidth: 2,
    borderColor: color.borderMaxContrast,
    borderRadius: radius.element,
    paddingHorizontal: space.m,
    fontSize: font.body,
    color: color.mainText,
    backgroundColor: color.mainBackground,
  },
  badge: { paddingHorizontal: space.s, paddingVertical: 2, borderRadius: radius.pill, alignSelf: 'flex-start' },
  notice: { flexDirection: 'row', gap: space.s, alignItems: 'center', padding: space.m, borderRadius: radius.element },
  stat: {
    flex: 1,
    minWidth: 96,
    padding: space.m,
    borderRadius: radius.container,
    backgroundColor: color.primaryElementLight,
    gap: 2,
  },
  statValue: { fontSize: font.large, fontWeight: '700', color: color.primaryElementLightText },
  statLabel: { fontSize: font.small, color: color.primaryElementLightText },
  empty: { alignItems: 'center', gap: space.s, padding: space.xl },
  chip: {
    minHeight: 36,
    paddingHorizontal: space.m,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.borderDark,
    justifyContent: 'center',
  },
});
