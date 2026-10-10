import React, { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { Avatar, Button, Field, Screen } from '../src/components/ui';
import { useApp } from '../src/context/AppProvider';
import { api, filePart } from '../src/api/client';
import { linkedInAuthorize, linkedInEnabled } from '../src/lib/linkedin';
import { Text } from '../src/components/Text';

export default function EditProfile() {
  const { t, user, setUser, errText, colors: c } = useApp();
  const [name, setName] = useState(user.name);
  const [bio, setBio] = useState(user.bio || '');
  const [linkedinUrl, setLinkedinUrl] = useState(user.linkedinUrl || '');
  const [busy, setBusy] = useState(false);
  const pick = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7 });
    if (r.canceled) return;
    const fd = new FormData(); fd.append('file', filePart(r.assets[0].uri, 'image/jpeg'));
    try { setUser(await api.form('/me/avatar', fd)); } catch (e) { Alert.alert(t('error'), errText(e)); }
  };
  const save = async () => {
    setBusy(true);
    try { setUser(await api.patch('/me', { name: name.trim(), bio: bio.trim(), linkedinUrl: linkedinUrl.trim() })); router.back(); } catch (e) { Alert.alert(t('error'), errText(e)); } finally { setBusy(false); }
  };
  return (
    <Screen>
      <Pressable onPress={pick} style={{ alignSelf: 'center' }} accessibilityRole="button">
        <Avatar uri={user.avatarUrl} name={user.name} size={96} />
        <View style={{ position: 'absolute', bottom: 0, right: 0, width: 32, height: 32, borderRadius: 16, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: c.bg }}>
          <Ionicons name="camera" size={16} color="#fff" />
        </View>
      </Pressable>
      <Field label={t('name')} value={name} onChangeText={setName} maxLength={60} />
      <Field label={t('bio')} value={bio} onChangeText={setBio} multiline maxLength={300} />
      <Field label={t('linkedinUrl')} value={linkedinUrl} onChangeText={setLinkedinUrl} placeholder={t('linkedinUrlPh')} autoCapitalize="none" keyboardType="url" />
      {linkedInEnabled() ? (user.linkedinVerified
        ? <Text style={{ color: c.success, fontWeight: '600', textAlign: 'left' }}>{t('linkedinConnected')}</Text>
        : <Button variant="soft" icon="logo-linkedin" title={t('connectLinkedIn')} onPress={async () => {
          try { const r = await linkedInAuthorize(); if (r) setUser(await api.post('/me/link', { provider: 'linkedin', token: r.code, redirectUri: r.redirectUri })); } catch (e) { Alert.alert(t('error'), errText(e)); }
        }} />) : null}
      <Field label={t('email')} value={user.email} editable={false} style={{ opacity: 0.6 }} />
      <Button title={t('save')} onPress={save} loading={busy} disabled={name.trim().length < 2} />
    </Screen>
  );
}
