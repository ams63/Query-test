// Invite friends: personal code + link, share via the phone's share sheet (WhatsApp, Snapchat, Instagram…)
import React, { useCallback, useState } from 'react';
import { Share, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../src/components/Text';
import { Button, Card, Loading, Screen, useStyles } from '../src/components/ui';
import { useApp } from '../src/context/AppProvider';
import { api } from '../src/api/client';

export default function Invite() {
  const { t, colors: c } = useApp();
  const s = useStyles();
  const [g, setG] = useState(null);
  const [copied, setCopied] = useState(false);
  useFocusEffect(useCallback(() => { api.get('/me/growth').then(setG).catch(() => {}); }, []));
  if (!g) return <Loading />;
  const message = t('inviteMessage').replace('{code}', g.inviteCode).replace('{link}', g.inviteLink);
  return (
    <Screen>
      <View style={{ backgroundColor: c.primaryDark, borderRadius: 22, padding: 20, gap: 10 }}>
        <Ionicons name="gift" size={36} color={c.gold} />
        <Text style={{ color: '#fff', fontSize: 21, fontWeight: '700', textAlign: 'left' }}>{t('inviteTitle')}</Text>
        <Text style={{ color: 'rgba(255,255,255,0.85)', lineHeight: 23, textAlign: 'left' }}>{t('inviteBody')}</Text>
      </View>
      <Card style={{ alignItems: 'center', gap: 8 }}>
        <Text style={s.muted}>{t('yourCode')}</Text>
        <Text style={{ color: c.primary, fontSize: 34, fontWeight: '700', letterSpacing: 4 }} selectable>{g.inviteCode}</Text>
        <Text style={s.small} selectable>{g.inviteLink}</Text>
      </Card>
      <Button icon="share-social" title={t('shareInvite')} onPress={() => Share.share({ message, url: g.inviteLink }).catch(() => {})} />
      <Button variant="soft" icon={copied ? 'checkmark' : 'copy-outline'} title={copied ? t('linkCopied') : t('copyLink')}
        onPress={async () => { await Clipboard.setStringAsync(message); setCopied(true); setTimeout(() => setCopied(false), 1500); }} />
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Ionicons name="people" size={26} color={c.primary} />
        <Text style={[s.title, { flex: 1 }]}>{g.invites} {t('invitesCount')}</Text>
        <Text style={{ color: c.gold, fontWeight: '700' }}>+{g.invites * 20}</Text>
      </Card>
    </Screen>
  );
}
