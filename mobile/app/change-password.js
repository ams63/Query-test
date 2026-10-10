import React, { useState } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { Text } from '../src/components/Text';
import { Button, Field, Screen, useStyles } from '../src/components/ui';
import { useApp } from '../src/context/AppProvider';
import { api } from '../src/api/client';

export default function ChangePassword() {
  const { t, errText, user, refreshUser } = useApp();
  const noPassword = user && user.hasPassword === false;
  const s = useStyles();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setErr(''); setBusy(true);
    try { await api.post('/auth/change-password', noPassword ? { newPassword: next } : { currentPassword: cur, newPassword: next }); refreshUser().catch(() => {}); Alert.alert(t('passwordChanged'), '', [{ text: t('ok'), onPress: () => router.back() }]); } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };
  return (
    <Screen>
      {noPassword ? <Text style={s.muted}>{t('setPasswordHint')}</Text> : <Field label={t('currentPassword')} value={cur} onChangeText={setCur} secureTextEntry />}
      <Field label={t('newPassword')} hint={t('passwordHint')} value={next} onChangeText={setNext} secureTextEntry />
      {err ? <Text style={s.error}>{err}</Text> : null}
      <Button title={t('save')} onPress={save} loading={busy} disabled={(!noPassword && !cur) || next.length < 8} />
    </Screen>
  );
}
