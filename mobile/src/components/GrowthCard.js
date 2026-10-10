// Points, level progress and badges shown on the profile
import React from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { Card } from './ui';
import { useApp } from '../context/AppProvider';

const BADGE_ICON = { firstQuestion: 'help-circle', firstAnswer: 'chatbubble', bestAnswer: 'trophy', bestAnswer10: 'medal', helper50: 'heart-circle', ambassador: 'megaphone', ambassador10: 'star', loved100: 'heart' };

export default function GrowthCard({ g }) {
  const { t, colors: c } = useApp();
  if (!g) return null;
  const left = g.level.nextAt != null ? g.level.nextAt - g.points : 0;
  return (
    <Card style={{ gap: 12 }}>
      <Pressable onPress={() => router.push('/leaderboard')} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: c.gold, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#15202B', fontWeight: '700', fontSize: 16 }}>{g.level.index}</Text>
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ color: c.ink, fontWeight: '700', textAlign: 'left' }}>{t(`level_${g.level.key}`)} · {g.points} {t('points')}</Text>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: c.line, overflow: 'hidden' }}>
            <View style={{ width: `${Math.round(g.level.progress * 100)}%`, height: '100%', backgroundColor: c.gold }} />
          </View>
          {left > 0 ? <Text style={{ color: c.muted, fontSize: 12, textAlign: 'left' }}>{t('toNextLevel').replace('{n}', left)}</Text> : null}
        </View>
        <Ionicons name="trophy-outline" size={22} color={c.primary} />
      </Pressable>
      <Text style={{ color: c.ink, fontWeight: '700', textAlign: 'left' }}>{t('badges')}</Text>
      {g.badges.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {g.badges.map((b) => (
            <View key={b} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: c.soft }}>
              <Ionicons name={BADGE_ICON[b] || 'ribbon'} size={15} color={c.primary} />
              <Text style={{ color: c.ink, fontSize: 12, fontWeight: '600' }}>{t(`badge_${b}`)}</Text>
            </View>
          ))}
        </View>
      ) : <Text style={{ color: c.muted, fontSize: 13, textAlign: 'left' }}>{t('noBadges')}</Text>}
    </Card>
  );
}
