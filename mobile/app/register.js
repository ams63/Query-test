import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../src/components/Text';
import { Avatar, Button, Field, Screen, useStyles } from '../src/components/ui';
import { useApp } from '../src/context/AppProvider';
import { api, filePart } from '../src/api/client';
import SocialSignIn from '../src/components/SocialSignIn';
import { peekPendingInvite, takePendingInvite } from '../src/lib/growth';

export default function Register() {
  const { t, signIn, errText, lang, colors: c } = useApp();
  const s = useStyles();
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [avatar, setAvatar] = useState(null);
  const [invite, setInvite] = useState('');
  React.useEffect(() => { peekPendingInvite().then((c) => c && setInvite(c)); }, []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const pick = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7 });
    if (!r.canceled) setAvatar(r.assets[0].uri);
  };
  const submit = async () => {
    setErr(''); setBusy(true);
    try {
      const fd = new FormData();
      fd.append('name', f.name.trim()); fd.append('email', f.email.trim()); fd.append('password', f.password); fd.append('language', lang);
      if (avatar) fd.append('image', filePart(avatar, 'image/jpeg'));
      if (invite.trim()) fd.append('inviteCode', invite.trim());
      await signIn(await api.form('/auth/register', fd));
      takePendingInvite();
      router.replace('/following?welcome=1');
    } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };
  return (
    <Screen>
      <Pressable onPress={pick} style={{ alignSelf: 'center', alignItems: 'center', gap: 6 }}>
        <View>
          <Avatar uri={avatar} name={f.name || '?'} size={92} />
          <View style={{ position: 'absolute', bottom: 0, right: 0, width: 30, height: 30, borderRadius: 15, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: c.bg }}>
            <Ionicons name="camera" size={15} color="#fff" />
          </View>
        </View>
      </Pressable>
      <Field label={t('name')} value={f.name} onChangeText={set('name')} autoComplete="name" />
      <Field label={t('email')} value={f.email} onChangeText={set('email')} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      <Field label={t('password')} hint={t('passwordHint')} value={f.password} onChangeText={set('password')} secureTextEntry autoComplete="new-password" />
      <Field label={t('inviteCode')} value={invite} onChangeText={(v) => setInvite(v.toUpperCase())} autoCapitalize="characters" maxLength={20} />
      {err ? <Text style={s.error}>{err}</Text> : null}
      <SocialSignIn onSignedIn={(isNew) => router.replace(isNew ? '/following?welcome=1' : '/(tabs)/home')} />
      <Button title={t('signUp')} onPress={submit} loading={busy} disabled={f.name.trim().length < 2 || !f.email || f.password.length < 8} />
      <Text style={[s.small, { textAlign: 'center', lineHeight: 20 }]}>
        {t('agreeTo')} <Text style={{ color: c.primary, fontWeight: '600' }} onPress={() => router.push('/info?page=terms')}>{t('terms')}</Text> {t('and')} <Text style={{ color: c.primary, fontWeight: '600' }} onPress={() => router.push('/info?page=privacy')}>{t('privacy')}</Text>
      </Text>
    </Screen>
  );
}
