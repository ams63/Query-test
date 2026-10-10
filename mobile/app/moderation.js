// Admin: review reported questions/answers
import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Text } from '../src/components/Text';
import { Button, Card, Empty, Screen, useStyles } from '../src/components/ui';
import { useApp } from '../src/context/AppProvider';
import { api } from '../src/api/client';

export default function Moderation() {
  const { t } = useApp();
  const s = useStyles();
  const [items, setItems] = useState(null);
  const load = useCallback(() => api.get('/admin/reports').then(setItems).catch(() => setItems([])), []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const act = async (r, action, body) => { await api.post(`/admin/${r.type}/${r.id}/${action}`, body).catch(() => {}); load(); };
  return (
    <Screen>
      {items && !items.length ? <Empty icon="shield-checkmark-outline" title={t('noReports')} /> : null}
      {(items || []).map((r) => (
        <Card key={`${r.type}-${r.id}`} style={{ gap: 8 }} onPress={r.type === 'post' ? () => router.push(`/post/${r.id}`) : undefined}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={[s.small, { flex: 1 }]}>{r.type === 'post' ? t('yourQuestion') : t('answer')} · {r.reports} {t('reports')}</Text>
            {r.severe ? <Text style={{ color: '#fff', backgroundColor: '#DC2626', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, fontSize: 11, fontWeight: '700', overflow: 'hidden' }}>{t('severe')}</Text> : null}
          </View>
          <Text style={s.body} numberOfLines={4}>{r.content || '—'}</Text>
          {r.reasons ? <Text style={s.small}>{r.reasons}</Text> : null}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button small style={{ flex: 1 }} variant="soft" title={t('restore')} onPress={() => act(r, 'restore')} />
            <Button small style={{ flex: 1 }} variant="danger" title={t('remove')} onPress={() => act(r, 'remove', {})} />
          </View>
          <Button small variant="danger" icon="ban-outline" title={t('removeAndBan')} onPress={() => act(r, 'remove', { ban: '30d' })} />
        </Card>
      ))}
    </Screen>
  );
}
