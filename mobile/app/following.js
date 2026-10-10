// Pick categories to follow (also shown right after sign-up)
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../src/components/Text';
import { Button, Screen, useStyles } from '../src/components/ui';
import { useApp } from '../src/context/AppProvider';
import { api } from '../src/api/client';
import { radius } from '../src/theme';

export default function Following() {
  const { welcome } = useLocalSearchParams();
  const { t, categories, catName, loadCategories, colors: c } = useApp();
  const s = useStyles();
  const [sel, setSel] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get('/me/subscriptions').then(setSel).catch(() => setSel([])); }, []);
  const toggle = useCallback((id) => setSel((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id])), []);
  const save = async () => {
    setBusy(true);
    try { await api.put('/me/subscriptions', { categoryIds: sel }); await loadCategories(); welcome ? router.replace('/(tabs)/home') : router.back(); } finally { setBusy(false); }
  };
  return (
    <Screen>
      <Text style={s.muted}>{t('followHint')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {categories.map((x) => {
          const on = sel && sel.includes(x.id);
          return (
            <Pressable key={x.id} onPress={() => sel && toggle(x.id)} accessibilityRole="checkbox" accessibilityState={{ checked: !!on }}
              style={{ width: '48%', flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.md, borderWidth: 1.5, borderColor: on ? x.color : c.line, backgroundColor: c.card }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: x.color, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={x.icon} size={18} color="#fff" />
              </View>
              <Text style={{ flex: 1, color: c.ink, fontWeight: '600', textAlign: 'left' }} numberOfLines={1}>{catName(x)}</Text>
              <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={on ? x.color : c.muted} />
            </Pressable>
          );
        })}
      </View>
      <Button title={t('save')} icon="checkmark" onPress={save} loading={busy} disabled={!sel} />
    </Screen>
  );
}
