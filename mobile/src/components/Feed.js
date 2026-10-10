import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useApp } from '../context/AppProvider';
import { api } from '../api/client';
import PostCard from './PostCard';
import { Empty, ErrorBanner, Skeleton } from './ui';

// Infinite list of questions for a query string like "category=3&sort=latest"
export default function Feed({ query = '', header, emptyTitle, emptySubtitle, emptyAction, emptyIcon }) {
  const { colors: c, errText } = useApp();
  const [items, setItems] = useState(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const reqId = useRef(0);

  const load = useCallback(async (p = 1) => {
    const my = ++reqId.current;
    if (p > 1) setLoadingMore(true);
    try {
      const res = await api.get(`/posts?${query}${query ? '&' : ''}page=${p}`);
      if (my !== reqId.current) return; // a newer request (e.g. new filter) already started
      setItems((prev) => (p === 1 ? res.items : [...(prev || []), ...res.items.filter((x) => !(prev || []).some((y) => y.id === x.id))]));
      setPage(p); setHasMore(res.hasMore); setError('');
    } catch (e) {
      if (my === reqId.current) { setError(errText(e)); setItems((x) => x || []); }
    } finally {
      if (my === reqId.current) { setLoadingMore(false); setRefreshing(false); }
    }
  }, [query, errText]);

  useEffect(() => { setItems(null); load(1); }, [load]);
  // Refresh silently when coming back to the screen (e.g. after posting)
  const first = useRef(true);
  useFocusEffect(useCallback(() => { if (first.current) { first.current = false; return; } load(1); }, [load]));

  const update = (p) => setItems((list) => list.map((x) => (x.id === p.id ? p : x)));
  const remove = (id, reload) => { if (reload) load(1); else setItems((list) => list.filter((x) => x.id !== id)); };

  return (
    <FlatList
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 100 }}
      data={items || []}
      keyExtractor={(p) => p.id}
      ListHeaderComponent={<View style={{ gap: 12 }}>{header}{error ? <ErrorBanner text={error} onRetry={() => load(1)} /> : null}</View>}
      renderItem={({ item }) => <PostCard post={item} onChange={update} onRemoved={remove} />}
      ListEmptyComponent={items === null ? <Skeleton /> : error ? null : <Empty icon={emptyIcon} title={emptyTitle} subtitle={emptySubtitle} action={emptyAction} />}
      ListFooterComponent={loadingMore ? <ActivityIndicator color={c.primary} style={{ marginVertical: 16 }} /> : null}
      onEndReachedThreshold={0.4}
      onEndReached={() => { if (hasMore && !loadingMore && items) load(page + 1); }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(1); }} tintColor={c.primary} colors={[c.primary]} />}
      keyboardShouldPersistTaps="handled"
      removeClippedSubviews
    />
  );
}
