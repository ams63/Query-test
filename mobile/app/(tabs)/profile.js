import React, { useCallback, useState } from 'react';
import { Alert, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Text } from '../../src/components/Text';
import { Avatar, Card, Screen, SettingsRow, useStyles } from '../../src/components/ui';
import { useApp } from '../../src/context/AppProvider';
import { api } from '../../src/api/client';
import { LANGS } from '../../src/i18n/strings';
import GrowthCard from '../../src/components/GrowthCard';

export default function Profile() {
  const { t, user, logout, lang, themeKey, refreshUser, errText, colors: c } = useApp();
  const s = useStyles();
  const [stats, setStats] = useState(null);
  const [growth, setGrowth] = useState(null);
  useFocusEffect(useCallback(() => {
    refreshUser().catch(() => {});
    if (user) api.get(`/users/${user.id}`).then((u) => setStats(u.stats)).catch(() => {});
    api.get('/me/growth').then(setGrowth).catch(() => {});
  }, [user && user.id])); // eslint-disable-line react-hooks/exhaustive-deps
  if (!user) return null;

  const out = async () => { await logout(); router.replace('/login'); };
  const del = () => Alert.alert(t('deleteAccount'), t('deleteAccountConfirm'), [
    { text: t('cancel'), style: 'cancel' },
    { text: t('delete'), style: 'destructive', onPress: async () => { try { await api.del('/me'); await out(); } catch (e) { Alert.alert(t('error'), errText(e)); } } },
  ]);

  const Stat = ({ n, label }) => (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ color: c.ink, fontSize: 20, fontWeight: '700' }}>{n ?? '–'}</Text>
      <Text style={s.small}>{label}</Text>
    </View>
  );

  return (
    <Screen edges={[]}>
      <Card style={{ alignItems: 'center', gap: 10, paddingVertical: 22 }}>
        <Avatar uri={user.avatarUrl} name={user.name} size={84} />
        <Text style={s.h2}>{user.name}</Text>
        {user.bio ? <Text style={[s.muted, { textAlign: 'center' }]}>{user.bio}</Text> : null}
        <View style={{ flexDirection: 'row', alignSelf: 'stretch', marginTop: 6 }}>
          <Stat n={stats && stats.questions} label={t('stats_questions')} />
          <Stat n={stats && stats.answers} label={t('stats_answers')} />
          <Stat n={stats && stats.bestAnswers} label={t('stats_best')} />
        </View>
      </Card>
      <GrowthCard g={growth} />
      <Card style={{ paddingVertical: 4 }}>
        <SettingsRow icon="gift-outline" label={t('inviteFriends')} value={growth ? `+${growth.pointsTable.invite}` : undefined} onPress={() => router.push('/invite')} />
        <SettingsRow icon="trophy-outline" label={t('leaderboard')} onPress={() => router.push('/leaderboard')} />
      </Card>
      <Card style={{ paddingVertical: 4 }}>
        <SettingsRow icon="create-outline" label={t('editProfile')} onPress={() => router.push('/edit-profile')} />
        <SettingsRow icon="help-circle-outline" label={t('myPosts')} onPress={() => router.push(`/list?mine=1&title=${encodeURIComponent(t('myPosts'))}`)} />
        <SettingsRow icon="bookmark-outline" label={t('bookmarks')} onPress={() => router.push(`/list?bookmarked=1&title=${encodeURIComponent(t('bookmarks'))}`)} />
        <SettingsRow icon="notifications-outline" label={t('followedCategories')} onPress={() => router.push('/following')} />
        <SettingsRow icon="ban-outline" label={t('blockedUsers')} onPress={() => router.push('/blocked')} />
        {user.isAdmin ? <SettingsRow icon="shield-checkmark-outline" label={t('moderation')} onPress={() => router.push('/moderation')} /> : null}
      </Card>
      <Card style={{ paddingVertical: 4 }}>
        <SettingsRow icon="color-palette-outline" label={t('themes')} value={t(`theme_${themeKey}`)} onPress={() => router.push('/appearance')} />
        <SettingsRow icon="language-outline" label={t('language')} value={LANGS.find((l) => l.code === lang).label} onPress={() => router.push('/appearance')} />
        <SettingsRow icon="key-outline" label={t('changePassword')} onPress={() => router.push('/change-password')} />
      </Card>
      <Card style={{ paddingVertical: 4 }}>
        <SettingsRow icon="information-circle-outline" label={t('about')} onPress={() => router.push('/info?page=about')} />
        <SettingsRow icon="document-text-outline" label={t('terms')} onPress={() => router.push('/info?page=terms')} />
        <SettingsRow icon="lock-closed-outline" label={t('privacy')} onPress={() => router.push('/info?page=privacy')} />
        <SettingsRow icon="mail-outline" label={t('contact')} onPress={() => router.push('/info?page=contact')} />
      </Card>
      <Card style={{ paddingVertical: 4 }}>
        <SettingsRow icon="log-out-outline" label={t('logout')} onPress={out} />
        <SettingsRow icon="trash-outline" label={t('deleteAccount')} onPress={del} danger />
      </Card>
    </Screen>
  );
}
