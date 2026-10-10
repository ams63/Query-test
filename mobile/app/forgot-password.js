import React, { useState } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { Text } from '../src/components/Text';
import { Button, Field, Screen, useStyles } from '../src/components/ui';
import { useApp } from '../src/context/AppProvider';
import { api } from '../src/api/client';

export default function Forgot() {
  const { t, errText } = useApp();
  const s = useStyles();
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const run = async (fn) => { setErr(''); setBusy(true); try { await fn(); } catch (e) { setErr(errText(e)); } finally { setBusy(false); } };
  return (
    <Screen>
      <Field label={t('email')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" editable={step === 1} />
      {step === 2 ? (
        <>
          <Text style={s.muted}>{t('codeSent')}</Text>
          <Field label={t('code')} value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} textContentType="oneTimeCode" />
          <Field label={t('newPassword')} hint={t('passwordHint')} value={pw} onChangeText={setPw} secureTextEntry />
        </>
      ) : null}
      {err ? <Text style={s.error}>{err}</Text> : null}
      {step === 1
        ? <Button title={t('sendCode')} loading={busy} disabled={!email} onPress={() => run(async () => { await api.post('/auth/forgot-password', { email: email.trim() }); setStep(2); })} />
        : <Button title={t('resetPassword')} loading={busy} disabled={code.length !== 6 || pw.length < 8}
          onPress={() => run(async () => { await api.post('/auth/reset-password', { email: email.trim(), code, newPassword: pw }); Alert.alert(t('passwordChanged'), '', [{ text: t('ok'), onPress: () => router.back() }]); })} />}
    </Screen>
  );
}
