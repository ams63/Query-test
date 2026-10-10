// Generic question list: ?mine=1 | ?bookmarked=1 | ?category=ID (with &title=)
import React, { useEffect } from 'react';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import Feed from '../src/components/Feed';
import { Button } from '../src/components/ui';
import { useApp } from '../src/context/AppProvider';

export default function List() {
  const { mine, bookmarked, category, title } = useLocalSearchParams();
  const navigation = useNavigation();
  const { t } = useApp();
  useEffect(() => { navigation.setOptions({ title: title || '' }); }, [navigation, title]);
  const q = new URLSearchParams();
  if (mine) q.set('mine', '1');
  if (bookmarked) q.set('bookmarked', '1');
  if (category) q.set('category', String(category));
  return (
    <Feed query={q.toString()}
      emptyIcon={bookmarked ? 'bookmark-outline' : 'help-circle-outline'}
      emptyTitle={t('noPosts')}
      emptyAction={bookmarked ? null : <Button small icon="add" title={t('ask')} onPress={() => router.push(category ? `/create?category=${category}` : '/create')} />} />
  );
}
