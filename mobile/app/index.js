import React, { useEffect } from 'react';
import { router } from 'expo-router';
import { useApp } from '../src/context/AppProvider';
import { Loading } from '../src/components/ui';

export default function Index() {
  const { token, introSeen, ready } = useApp();

  useEffect(() => {
    if (!ready) return;
    const target = token ? '/(tabs)/home' : (introSeen ? '/login' : '/intro');
    router.replace(target);
  }, [ready, token, introSeen]);

  return <Loading />;
}
