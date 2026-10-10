// Home = categories. Pick a category → see its questions → ask there.
import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import { router, useFocusEffect, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Text, TextInput } from '../../src/components/Text';
import Feed from '../../src/components/Feed';
import { useStyles } from '../../src/components/ui';
import { useApp } from '../../src/context/AppProvider';
import { radius } from '../../src/theme';

export default function Home() {
  const { t, categories, catName, loadCategories, colors: c } = useApp();
  const s = useStyles();
  const navigation = useNavigation();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => { const h = setTimeout(() => setDebounced(q.trim()), 350); return () => clearTimeout(h); }, [q]);
  useFocusEffect(useCallback(() => { loadCategories(); }, [loadCategories]));
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={() => router.push('/nearby')} hitSlop={10} style={{ marginHorizontal: 16 }} accessibilityLabel={t('nearby')}>
          <Ionicons name="map-outline" size={23} color={c.primary} />
        </Pressable>
      ),
    });
  }, [navigation, c, t]);

  const header = (
    <View style={{ gap: 12, marginBottom: 4 }}>
      <View>
        <Text style={s.h1}>{t('hello')}</Text>
        <Text style={[s.muted, { fontSize: 16 }]}>{t('whatToAsk')}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.card, borderRadius: radius.md, borderWidth: 1, borderColor: c.line, paddingHorizontal: 12 }}>
        <Ionicons name="search" size={18} color={c.muted} />
        <TextInput value={q} onChangeText={setQ} placeholder={t('searchAsked')} placeholderTextColor={c.muted} returnKeyType="search"
          style={{ flex: 1, paddingVertical: 11, fontSize: 15, color: c.ink, textAlign: 'left' }} />
        {q ? <Pressable onPress={() => setQ('')} hitSlop={8} accessibilityLabel={t('cancel')}><Ionicons name="close-circle" size={18} color={c.muted} /></Pressable> : null}
      </View>
      {debounced ? <Text style={s.h2}>{t('searchResults')}</Text> : null}
    </View>
  );

  // "General" sits under the grid, full width, so the two-column layout stays even
  const general = categories.find((x) => x.key === 'general');
  const gridCats = categories.filter((x) => x.key !== 'general');
  const Tile = ({ item, wide }) => (
    <Pressable onPress={() => router.push(`/category/${item.id}`)} accessibilityRole="button" accessibilityLabel={catName(item)}
      style={({ pressed }) => ({ flex: 1, margin: 6, minHeight: wide ? 96 : 118, borderRadius: 22, padding: 14, backgroundColor: item.color, opacity: pressed ? 0.88 : 1,
        flexDirection: wide ? 'row' : 'column', alignItems: wide ? 'center' : 'stretch', justifyContent: 'space-between', gap: wide ? 14 : 0 })}>
      <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={item.icon} size={24} color="#fff" />
      </View>
      <View style={wide ? { flex: 1 } : null}>
        <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', textAlign: 'left' }} numberOfLines={1}>{catName(item)}</Text>
        <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, textAlign: 'left' }}>{item.postCount ? `${item.postCount} ${t('questions')}` : t('noQuestionsYet')}</Text>
      </View>
    </Pressable>
  );

  if (debounced) {
    return <Feed query={`q=${encodeURIComponent(debounced)}`} header={header} emptyIcon="search-outline" emptyTitle={t('noResults')} emptySubtitle={t('tryOtherWords')} />;
  }

  return (
    <FlatList
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
      ListHeaderComponent={<View style={{ paddingHorizontal: 4, paddingTop: 4 }}>{header}</View>}
      data={gridCats}
      numColumns={2}
      keyExtractor={(x) => String(x.id)}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await loadCategories(); setRefreshing(false); }} tintColor={c.primary} />}
      renderItem={({ item }) => <Tile item={item} />}
      ListFooterComponent={general ? <Tile item={general} wide /> : null}
    />
  );
}
