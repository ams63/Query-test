// Product review pieces: star display, star picker, and the review block shown on a post
import React from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { useApp } from '../context/AppProvider';
import { radius } from '../theme';

export function Stars({ value = 0, size = 16 }) {
  const { colors: c } = useApp();
  return (
    <View style={{ flexDirection: 'row', gap: 1 }} accessibilityLabel={`${value}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Ionicons key={i} name={value >= i ? 'star' : value >= i - 0.5 ? 'star-half' : 'star-outline'} size={size} color={c.gold} />
      ))}
    </View>
  );
}

export function StarPicker({ value, onChange }) {
  const { colors: c } = useApp();
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Pressable key={i} onPress={() => onChange(i)} hitSlop={6} accessibilityRole="radio" accessibilityState={{ checked: value === i }} accessibilityLabel={`${i}/5`}>
          <Ionicons name={value >= i ? 'star' : 'star-outline'} size={36} color={value >= i ? c.gold : c.muted} />
        </Pressable>
      ))}
    </View>
  );
}

export function ReviewBox({ review, compact }) {
  const { t, colors: c } = useApp();
  return (
    <View style={{ gap: 8, padding: 12, borderRadius: radius.md, backgroundColor: c.soft }}>
      <Pressable onPress={() => router.push(`/product/${encodeURIComponent(review.productKey)}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="pricetag" size={16} color={c.primary} />
        <Text style={{ flex: 1, color: c.ink, fontSize: 16, fontWeight: '700', textAlign: 'left' }} numberOfLines={1}>{review.productName}</Text>
        <Stars value={review.rating} />
      </Pressable>
      {review.store || review.price != null ? (
        <Text style={{ color: c.muted, fontSize: 13, textAlign: 'left' }}>
          {review.store ? `${t('boughtFrom')} ${review.store}` : ''}{review.store && review.price != null ? ' · ' : ''}{review.price != null ? `${review.price} ${t('currency')}` : ''}
        </Text>
      ) : null}
      {!compact && review.pros ? <Text style={{ color: c.ink, fontSize: 14, textAlign: 'left' }}><Text style={{ color: c.success, fontWeight: '700' }}>＋ {t('pros')}: </Text>{review.pros}</Text> : null}
      {!compact && review.cons ? <Text style={{ color: c.ink, fontSize: 14, textAlign: 'left' }}><Text style={{ color: c.danger, fontWeight: '700' }}>－ {t('cons')}: </Text>{review.cons}</Text> : null}
    </View>
  );
}
