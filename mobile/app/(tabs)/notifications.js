import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../../src/components/Text';
import { Avatar, Empty, Skeleton } from '../../src/components/ui';
import { useApp } from '../../src/context/AppProvider';
import { api } from '../../src/api/client';
import { timeAgo } from '../../src/lib/time';

const ICON = { comment: 'chatbubble', best: 'trophy', newPost: 'help-circle', like: 'heart' };

export default function Notifications() {
  const { t, lang, colors: c, setUnread } = useApp();
  const [items, setItems] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.get('/notifications');
      setItems(r.items);
      if (r.items.some((n) => !n.read)) { await api.post('/notifications/read-all'); setUnread(0); }
    } catch { setItems((x) => x || []); } finally { setRefreshing(false); }
  }, [setUnread]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <FlatList
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 100 }}
      data={items || []}
      keyExtractor={(n) => n.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={c.primary} />}
      ListEmptyComponent={items === null ? <Skeleton rows={4} /> : <Empty icon="notifications-outline" title={t('noNotifications')} />}
      renderItem={({ item }) => (
        <Pressable onPress={() => item.postId && router.push(`/post/${item.postId}`)}
          style={({ pressed }) => ({ flexDirection: 'row', gap: 12, alignItems: 'center', padding: 12, borderRadius: 16, backgroundColor: item.read ? c.card : c.soft, opacity: pressed ? 0.8 : 1 })}>
          <View>
            {item.actor ? <Avatar uri={item.actor.avatarUrl} name={item.actor.name} size={44} />
              : <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="help" size={22} color="#fff" /></View>}
            <View style={{ position: 'absolute', bottom: -2, right: -2, width: 20, height: 20, borderRadius: 10, backgroundColor: item.type === 'best' ? c.gold : item.type === 'like' ? c.danger : c.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: c.card }}>
              <Ionicons name={ICON[item.type] || 'notifications'} size={10} color="#fff" />
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.ink, fontSize: 14, fontWeight: item.read ? '400' : '600', textAlign: 'left' }}>{item.text}</Text>
            <Text style={{ color: c.muted, fontSize: 12, textAlign: 'left' }}>{timeAgo(item.createdAt, t, lang)}</Text>
          </View>
        </Pressable>
      )}
    />
  );
}
