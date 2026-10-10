import React, { useEffect, useRef } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  useFonts, IBMPlexSansArabic_400Regular, IBMPlexSansArabic_500Medium, IBMPlexSansArabic_600SemiBold, IBMPlexSansArabic_700Bold,
} from '@expo-google-fonts/ibm-plex-sans-arabic';
import { AppProvider, useApp } from '../src/context/AppProvider';
import { Loading } from '../src/components/ui';

// Tapping a push notification opens the related question
function useNotificationRouting(enabled) {
  const last = Notifications.useLastNotificationResponse();
  const handled = useRef(null);
  useEffect(() => {
    if (!enabled || !last) return;
    const req = last.notification.request;
    const url = req.content.data && req.content.data.url;
    if (url && handled.current !== req.identifier) { handled.current = req.identifier; router.push(url); }
  }, [last, enabled]);
}

function Root() {
  const { ready, t, token, colors: c } = useApp();
  const [fontsLoaded, fontError] = useFonts({ IBMPlexSansArabic_400Regular, IBMPlexSansArabic_500Medium, IBMPlexSansArabic_600SemiBold, IBMPlexSansArabic_700Bold });
  useEffect(() => { SplashScreen.preventAutoHideAsync().catch(() => {}); }, []);
  const done = ready && (fontsLoaded || !!fontError);
  useEffect(() => { if (done) SplashScreen.hideAsync().catch(() => {}); }, [done]);
  useNotificationRouting(done && !!token);
  if (!done) return <Loading />;
  const title = (k) => ({ title: t(k) });
  return (
    <>
      <StatusBar style={c.dark ? 'light' : 'dark'} />
      <Stack screenOptions={{
        headerStyle: { backgroundColor: c.card }, headerTintColor: c.ink, headerShadowVisible: false,
        headerTitleStyle: { fontFamily: fontsLoaded ? 'IBMPlexSansArabic_700Bold' : undefined, fontWeight: '700', fontSize: 17 }, contentStyle: { backgroundColor: c.bg },
      }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="intro" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="register" options={title('signUp')} />
        <Stack.Screen name="forgot-password" options={title('forgotPassword')} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="create" options={{ ...title('ask'), presentation: 'modal' }} />
        <Stack.Screen name="pick-location" options={title('pickLocation')} />
        <Stack.Screen name="post/[id]" options={{ title: '' }} />
        <Stack.Screen name="user/[id]" options={{ title: '' }} />
        <Stack.Screen name="category/[id]" options={{ title: '' }} />
        <Stack.Screen name="product/[key]" options={{ title: '' }} />
        <Stack.Screen name="invite" options={title('inviteFriends')} />
        <Stack.Screen name="leaderboard" options={title('leaderboard')} />
        <Stack.Screen name="i/[code]" options={{ headerShown: false }} />
        <Stack.Screen name="invite/[code]" options={{ headerShown: false }} />
        <Stack.Screen name="q/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="nearby" options={title('nearby')} />
        <Stack.Screen name="list" options={{ title: '' }} />
        <Stack.Screen name="following" options={title('followedCategories')} />
        <Stack.Screen name="blocked" options={title('blockedUsers')} />
        <Stack.Screen name="edit-profile" options={title('editProfile')} />
        <Stack.Screen name="change-password" options={title('changePassword')} />
        <Stack.Screen name="appearance" options={title('themes')} />
        <Stack.Screen name="info" options={{ title: '' }} />
        <Stack.Screen name="moderation" options={title('moderation')} />
      </Stack>
    </>
  );
}

export default function Layout() {
  return <SafeAreaProvider><AppProvider><Root /></AppProvider></SafeAreaProvider>;
}
