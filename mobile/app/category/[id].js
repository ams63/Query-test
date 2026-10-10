// A category: big "Ask in …" button on top, then its questions
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { TextInput } from '../../src/components/Text';
import { Stars } from '../../src/components/Review';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../../src/components/Text';
import Feed from '../../src/components/Feed';
import SortTabs from '../../src/components/SortTabs';
import { useApp } from '../../src/context/AppProvider';
import { api } from '../../src/api/client';

export default function CategoryScreen() {
  const { id } = useLocalSearchParams();
  const navigation = useNavigation();
  const { t, categories, catName, loadCategories, colors: c } = useApp();
  const cat = categories.find((x) => String(x.id) === String(id));
  const [sort, setSort] = useState('latest');
  const [lf, setLf] = useState(''); // Lost & Found tab: '' | LOST | FOUND
  // Reviews category: top products + product search
  const [products, setProducts] = useState([]);
  const [pq, setPq] = useState('');
  const isReviews = cat && cat.key === 'reviews';
  useEffect(() => {
    if (!isReviews) return undefined;
    const h = setTimeout(() => api.get(`/products${pq.trim() ? `?q=${encodeURIComponent(pq.trim())}` : ''}`).then(setProducts).catch(() => {}), 300);
    return () => clearTimeout(h);
  }, [isReviews, pq]);
  const [following, setFollowing] = useState(false);
  useEffect(() => { if (cat) { setFollowing(!!cat.subscribed); navigation.setOptions({ title: catName(cat) }); } }, [cat, catName, navigation]);
  if (!cat) return null;

  const toggleFollow = async () => {
    const next = !following;
    setFollowing(next);
    const ids = categories.filter((x) => (x.id === cat.id ? next : x.subscribed)).map((x) => x.id);
    try { await api.put('/me/subscriptions', { categoryIds: ids }); loadCategories(); } catch { setFollowing(!next); }
  };
  const ask = () => router.push(`/create?category=${cat.id}`);

  const header = (
    <View style={{ gap: 12 }}>
      <View style={{ backgroundColor: cat.color, borderRadius: 22, padding: 18, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={cat.icon} size={26} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700', textAlign: 'left' }}>{catName(cat)}</Text>
            <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, textAlign: 'left' }}>{cat.postCount} {t('questions')}</Text>
          </View>
          <Pressable onPress={toggleFollow} accessibilityRole="switch" accessibilityState={{ checked: following }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: following ? '#fff' : 'rgba(255,255,255,0.2)' }}>
            <Ionicons name={following ? 'notifications' : 'notifications-outline'} size={14} color={following ? cat.color : '#fff'} />
            <Text style={{ color: following ? cat.color : '#fff', fontSize: 12, fontWeight: '700' }}>{following ? t('followingCat') : t('follow')}</Text>
          </Pressable>
        </View>
        <Pressable onPress={ask} accessibilityRole="button"
          style={({ pressed }) => ({ backgroundColor: '#fff', borderRadius: 16, minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: pressed ? 0.9 : 1 })}>
          <Ionicons name="add-circle" size={22} color={cat.color} />
          <Text style={{ color: cat.color, fontSize: 17, fontWeight: '700' }}>{t('askIn').replace('{cat}', catName(cat))}</Text>
        </Pressable>
      </View>
      {isReviews ? (
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.card, borderRadius: 14, borderWidth: 1, borderColor: c.line, paddingHorizontal: 12 }}>
            <Ionicons name="search" size={18} color={c.muted} />
            <TextInput value={pq} onChangeText={setPq} placeholder={t('searchProducts')} placeholderTextColor={c.muted}
              style={{ flex: 1, paddingVertical: 10, fontSize: 15, color: c.ink, textAlign: 'left' }} />
          </View>
          {products.length ? <Text style={{ color: c.ink, fontWeight: '700', textAlign: 'left' }}>{t('topProducts')}</Text> : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {products.map((p) => (
              <Pressable key={p.key} onPress={() => router.push(`/product/${encodeURIComponent(p.key)}`)}
                style={{ width: 160, padding: 12, borderRadius: 16, backgroundColor: c.card, borderWidth: 1, borderColor: c.line, gap: 6 }}>
                <Text style={{ color: c.ink, fontWeight: '700', textAlign: 'left' }} numberOfLines={2}>{p.name}</Text>
                <Stars value={p.avg} size={14} />
                <Text style={{ color: c.muted, fontSize: 12, textAlign: 'left' }}>{p.avg} · {p.reviews} {t('reviewsCount')}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
      {cat.key === 'lostfound' ? (
        <SortTabs value={lf || 'ALL'} onChange={(v) => setLf(v === 'ALL' ? '' : v)}
          options={[['ALL', t('all')], ['LOST', t('lfLostTab')], ['FOUND', t('lfFoundTab')]]} />
      ) : cat.postCount ? <SortTabs value={sort} onChange={setSort} /> : null}
    </View>
  );

  return (
    <Feed query={`category=${cat.id}&sort=${cat.key === 'lostfound' ? 'latest' : sort}${lf ? `&lf=${lf}` : ''}`} header={header} emptyIcon={cat.icon}
      emptyTitle={sort === 'unanswered' ? t('allAnswered') : t('noQuestionsInCat')}
      emptySubtitle={sort === 'unanswered' ? null : t('beFirstHere')} />
  );
}
