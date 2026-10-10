import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Text } from '../src/components/Text';
import { Button, Field, useStyles } from '../src/components/ui';
import { useApp } from '../src/context/AppProvider';
import { api } from '../src/api/client';
import SocialSignIn from '../src/components/SocialSignIn';

export default function Login() {
  const { t, signIn, errText, colors: c } = useApp();
  const s = useStyles();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async () => {
    setErr(''); setBusy(true);
    try { await signIn(await api.post('/auth/login', { email: email.trim(), password })); router.replace('/(tabs)/home'); } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, gap: 16 }} keyboardShouldPersistTaps="handled">
          <View style={{ gap: 6, marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Image source={require('../assets/logo-mark.png')} style={{ width: 52, height: 58 }} contentFit="contain" accessibilityLabel="Query" />
              <Text style={{ color: c.primary, fontSize: 40, fontWeight: '700' }}>Query</Text>
            </View>
            <Text style={s.muted}>{t('tagline')}</Text>
          </View>
          <Field label={t('email')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" />
          <Field label={t('password')} value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" textContentType="password" onSubmitEditing={submit} />
          <Pressable onPress={() => router.push('/forgot-password')} style={{ alignSelf: 'flex-start' }}><Text style={{ color: c.primary, fontWeight: '600' }}>{t('forgotPassword')}</Text></Pressable>
          {err ? <Text style={s.error}>{err}</Text> : null}
          <Button title={t('signIn')} onPress={submit} loading={busy} disabled={!email || !password} />
          <SocialSignIn onSignedIn={(isNew) => router.replace(isNew ? '/following?welcome=1' : '/(tabs)/home')} />
          <View style={[s.row, { justifyContent: 'center' }]}>
            <Text style={s.muted}>{t('noAccount')}</Text>
            <Pressable onPress={() => router.push('/register')}><Text style={{ color: c.primary, fontWeight: '700' }}>{t('signUp')}</Text></Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
