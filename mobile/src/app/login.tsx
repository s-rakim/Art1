import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';
import { color, font, radius, space } from '@/theme';
import { Button, ErrorText, Field, Notice, Segmented } from '@/ui';
import { Logo } from '@/ui/Logo';

type Mode = 'signin' | 'shopper' | 'rider';

/**
 * One login for everyone. The server decides what the account is (shopper,
 * vendor, rider or admin) and the app opens that area. Vendors and admins
 * are created by invitation, so the sign up choices are shopper and rider.
 */
export default function Login() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setInfo(null);
    if (!email.includes('@')) return setError('Enter the email you signed up with.');
    if (password.length < (mode === 'signin' ? 1 : 10)) {
      return setError(mode === 'signin' ? 'Enter your password.' : 'Use at least 10 characters for your password.');
    }
    setBusy(true);
    try {
      if (mode === 'signin') {
        const { error: e } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (e) throw e;
        router.replace('/');
      } else {
        if (name.trim().length < 2) throw new Error('Tell us your name.');
        const { data, error: e } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: name.trim(), requested_role: mode === 'rider' ? 'rider' : 'customer' } },
        });
        if (e) throw e;
        if (data.session) router.replace('/');
        else setInfo('Check your email for a link to confirm your account, then sign in here.');
      }
    } catch (e) {
      // Supabase's messages are generic on purpose ("Invalid login credentials"), so they're safe to show.
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setError(null);
    if (!email.includes('@')) return setError('Enter your email first, then tap "Forgot password".');
    await supabase.auth.resetPasswordForEmail(email.trim());
    setInfo('If that email has an account, a reset link is on its way.');
  };

  return (
    <View style={{ flex: 1, backgroundColor: color.backgroundPlain }}>
      <Image source={require('../../assets/images/wallpaper.webp')} style={StyleSheet.absoluteFill} contentFit="cover" accessible={false} />
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
            <View style={st.brand}>
              <Logo size={56} />
              <Text style={st.brandName} accessibilityRole="header">
                The Bazaar
              </Text>
            </View>
            <View style={st.panel}>
              <Segmented<Mode>
                value={mode}
                onChange={(m) => {
                  setMode(m);
                  setError(null);
                  setInfo(null);
                }}
                options={[
                  { value: 'signin', label: 'Sign in' },
                  { value: 'shopper', label: 'New shopper' },
                  { value: 'rider', label: 'Ride with us' },
                ]}
              />
              {mode === 'rider' ? (
                <Notice icon="moped" text="Create an account, then fill in the rider form. You can start riding once the team has hired you." />
              ) : null}
              {mode !== 'signin' ? <Field label="Your name" value={name} onChangeText={setName} autoComplete="name" textContentType="name" /> : null}
              <Field
                label="Email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                textContentType="username"
              />
              <Field
                label="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                textContentType={mode === 'signin' ? 'password' : 'newPassword'}
                onSubmitEditing={submit}
                returnKeyType="go"
              />
              {error ? <ErrorText>{error}</ErrorText> : null}
              {info ? <Notice tone="success" text={info} /> : null}
              <Button title={mode === 'signin' ? 'Sign in' : 'Create account'} onPress={submit} loading={busy} />
              {mode === 'signin' ? <Button title="Forgot password" variant="ghost" onPress={reset} /> : null}
            </View>
            <Text style={st.credit}>Background: Nextcloud “Fluid” wallpaper, CC BY-SA 4.0 Nextcloud GmbH</Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { flexGrow: 1, justifyContent: 'center', padding: space.l, gap: space.l, maxWidth: 480, width: '100%', alignSelf: 'center' },
  brand: { alignItems: 'center', gap: space.s },
  brandName: { color: '#fff', fontSize: font.display, fontWeight: '700' },
  panel: { backgroundColor: color.mainBackgroundBlur, borderRadius: radius.large, padding: space.l, gap: space.m },
  credit: { color: 'rgba(255,255,255,0.85)', fontSize: 11, textAlign: 'center' },
});
