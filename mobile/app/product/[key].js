// A product: average rating, star breakdown, price range, and all reviews
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { Text } from '../../src/components/Text';
import Feed from '../../src/components/Feed';
import { Button, Card, useStyles } from '../../src/components/ui';
import { Stars } from '../../src/components/Review';
import { useApp } from '../../src/context/AppProvider';
import { api } from '../../src/api/client';

export default function ProductScreen() {
  const { key } = useLocalSearchParams();
  const navigation = useNavigation();
  const { t, categories, colors: c } = useApp();
  const s = useStyles();
  const [p, setP] = useState(null);
  useEffect(() => { api.get(`/products/${encodeURIComponent(key)}`).then((x) => { setP(x); navigation.setOptions({ title: x.name }); }).catch(() => {}); }, [key, navigation]);
  const reviewsCat = categories.find((x) => x.key === 'reviews');

  const header = p ? (
    <Card style={{ gap: 12 }}>
      <Text style={s.h2}>{p.name}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Text style={{ color: c.ink, fontSize: 40, fontWeight: '700' }}>{p.avg}</Text>
        <View style={{ gap: 4 }}>
          <Stars value={p.avg} size={20} />
          <Text style={s.small}>{p.reviews} {t('reviewsCount')}</Text>
        </View>
      </View>
      {[5, 4, 3, 2, 1].map((n) => (
        <View key={n} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={[s.small, { width: 14 }]}>{n}</Text>
          <View style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: c.line, overflow: 'hidden' }}>
            <View style={{ width: `${p.reviews ? ((p.stars[n] || 0) / p.reviews) * 100 : 0}%`, height: '100%', backgroundColor: c.gold }} />
          </View>
          <Text style={[s.small, { width: 22 }]}>{p.stars[n] || 0}</Text>
        </View>
      ))}
      {p.minPrice != null ? <Text style={s.muted}>{t('priceRange')}: {p.minPrice === p.maxPrice ? p.minPrice : `${p.minPrice} – ${p.maxPrice}`} {t('currency')}</Text> : null}
      {reviewsCat ? <Button icon="star-outline" title={t('rateThisProduct')} onPress={() => router.push({ pathname: '/create', params: { category: reviewsCat.id, product: p.name } })} /> : null}
    </Card>
  ) : null;

  return <Feed query={`product=${encodeURIComponent(key)}`} header={header} emptyTitle={t('noResults')} />;
}
