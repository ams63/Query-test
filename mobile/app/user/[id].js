import React, { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { Text } from '../../src/components/Text';
import Feed from '../../src/components/Feed';
import { Avatar, Button, Card, Loading, useStyles } from '../../src/components/ui';
import { useApp } from '../../src/context/AppProvider';
import { api } from '../../src/api/client';

export default function UserProfile() {
  const { id } = useLocalSearchParams();
  const navigation = useNavigation();
  const { t, locale, colors: c, errText } = useApp();
  const s = useStyles();
  const [u, setU] = useState(null);
  useEffect(() => { api.get(`/users/${id}`).then((x) => { setU(x); navigation.setOptions({ title: x.name }); }).catch(() => {}); }, [id, navigation]);
  if (!u) return <Loading />;

  const toggleBlock = () => {
    if (u.blocked) return api.del(`/users/${u.id}/block`).then(() => setU({ ...u, blocked: false })).catch((e) => Alert.alert(t('error'), errText(e)));
    return Alert.alert(t('blockUser'), t('blockConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('block'), style: 'destructive', onPress: () => api.post(`/users/${u.id}/block`).then(() => setU({ ...u, blocked: true })).catch((e) => Alert.alert(t('error'), errText(e))) },
    ]);
  };
  const Stat = ({ n, label }) => (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ color: c.ink, fontSize: 20, fontWeight: '700' }}>{n}</Text>
      <Text style={s.small}>{label}</Text>
    </View>
  );
  const joined = (() => { try { return new Date(u.joinedAt).toLocaleDateString(locale, { month: 'long', year: 'numeric' }); } catch { return ''; } })();

  const header = (
    <Card style={{ alignItems: 'center', gap: 8, paddingVertical: 20 }}>
      <Avatar uri={u.avatarUrl} name={u.name} size={80} />
      <Text style={s.h2}>{u.name}</Text>
      {u.bio ? <Text style={[s.muted, { textAlign: 'center' }]}>{u.bio}</Text> : null}
      <Text style={s.small}>{t('joined')} {joined}</Text>
      <View style={{ flexDirection: 'row', alignSelf: 'stretch', marginVertical: 6 }}>
        <Stat n={u.stats.questions} label={t('stats_questions')} />
        <Stat n={u.stats.answers} label={t('stats_answers')} />
        <Stat n={u.stats.bestAnswers} label={t('stats_best')} />
      </View>
      <Button small variant={u.blocked ? 'soft' : 'danger'} icon={u.blocked ? 'lock-open-outline' : 'ban-outline'} title={u.blocked ? t('unblock') : t('block')} onPress={toggleBlock} />
    </Card>
  );
  return u.blocked ? <View style={{ flex: 1, padding: 16, backgroundColor: c.bg }}>{header}</View>
    : <Feed query={`user=${u.id}`} header={header} emptyTitle={t('noPosts')} />;
}
