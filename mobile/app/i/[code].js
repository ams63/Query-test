// Invite links open the app here: keep the code for sign-up, then continue
import React, { useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Loading } from '../../src/components/ui';
import { useApp } from '../../src/context/AppProvider';
import { savePendingInvite } from '../../src/lib/growth';

export default function InviteLink() {
  const { code } = useLocalSearchParams();
  const { token } = useApp();
  useEffect(() => { savePendingInvite(code).then(() => router.replace(token ? '/(tabs)/home' : '/register')); }, [code, token]);
  return <Loading />;
}
