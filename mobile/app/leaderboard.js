// Leaderboard: this week / month / all time, optionally per category
import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Text } from '../src/components/Text';
import SortTabs from '../src/components/SortTabs';
import { Avatar, Empty, Skeleton } from '../src/components/ui';
import { useApp } from '../src/context/AppProvider';
import { api } from '../src/api/client';

const MEDAL = ['🥇', '🥈', '🥉'];

export default function Leaderboard() {
  const { t, colors: c } = useApp();
  const [period, setPeriod] = useState('week');
  const [rows, setRows] = useState(null);
  useFocusEffect(useCallback(() => { setRows(null); api.get(`/leaderboard?period=${period}`).then(setRows).catch(() => setRows([])); }, [period]));
  return (
    <FlatList
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={{ padding: 16, gap: 8 }}
      data={rows || []}
      keyExtractor={(r) => r.id}
      ListHeaderComponent={(
        <View style={{ gap: 10, marginBottom: 6 }}>
          <SortTabs value={period} onChange={setPeriod} options={[['week', t('thisWeek')], ['month', t('thisMonth')], ['all', t('allTime')]]} />
          <Text style={{ color: c.muted, fontSize: 12, textAlign: 'center' }}>{t('howPoints')}</Text>
        </View>
      )}
      ListEmptyComponent={rows === null ? <Skeleton /> : <Empty icon="trophy-outline" title={t('noLeaders')} />}
      renderItem={({ item }) => (
        <Pressable onPress={() => !item.isMe && router.push(`/user/${item.id}`)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, backgroundColor: item.isMe ? c.soft : c.card, borderWidth: 1, borderColor: item.isMe ? c.primary : c.line }}>
          <Text style={{ width: 34, textAlign: 'center', fontSize: item.rank <= 3 ? 24 : 16, fontWeight: '700', color: c.muted }}>{MEDAL[item.rank - 1] || item.rank}</Text>
          <Avatar uri={item.avatarUrl} name={item.name} size={40} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.ink, fontWeight: '700', textAlign: 'left' }}>{item.name}{item.isMe ? ` (${t('you')})` : ''}</Text>
            <Text style={{ color: c.muted, fontSize: 12, textAlign: 'left' }}>{t(`level_${item.level}`)} · {item.answers} {t('answers')} · {item.best} {t('bestAnswer')}</Text>
          </View>
          <Text style={{ color: c.primary, fontSize: 17, fontWeight: '700' }}>{item.points}</Text>
        </Pressable>
      )}
    />
  );
}
