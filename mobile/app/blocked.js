import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Text } from '../src/components/Text';
import { Avatar, Button, Card, Empty, Screen, useStyles } from '../src/components/ui';
import { useApp } from '../src/context/AppProvider';
import { api } from '../src/api/client';

export default function Blocked() {
  const { t } = useApp();
  const s = useStyles();
  const [items, setItems] = useState(null);
  const load = useCallback(() => api.get('/me/blocked').then(setItems).catch(() => setItems([])), []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  return (
    <Screen>
      {items && items.length === 0 ? <Empty icon="happy-outline" title={t('noBlocked')} /> : null}
      {(items || []).map((u) => (
        <Card key={u.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Avatar uri={u.avatarUrl} name={u.name} />
          <View style={{ flex: 1 }}><Text style={s.title}>{u.name}</Text></View>
          <Button small variant="soft" title={t('unblock')} onPress={async () => { await api.del(`/users/${u.id}/block`).catch(() => {}); load(); }} />
        </Card>
      ))}
    </Screen>
  );
}
