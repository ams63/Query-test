// "Continue with Apple / Google" — official SDKs; the server verifies the token before signing in.
import React, { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, View } from 'react-native';
import Constants from 'expo-constants';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { useApp } from '../context/AppProvider';
import { api } from '../api/client';
import { linkedInAuthorize, linkedInEnabled } from '../lib/linkedin';
import { takePendingInvite } from '../lib/growth';

const extra = Constants.expoConfig?.extra || {};
const GOOGLE_WEB = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || extra.googleWebClientId;
const GOOGLE_IOS = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || extra.googleIosClientId;

let GoogleSignin = null;
try { ({ GoogleSignin } = require('@react-native-google-signin/google-signin')); } catch { GoogleSignin = null; } // not available in Expo Go

export default function SocialSignIn({ onSignedIn }) {
  const { t, lang, colors: c, errText, signIn } = useApp();
  const [appleOk, setAppleOk] = useState(false);
  const [busy, setBusy] = useState(null);
  const googleOk = !!(GoogleSignin && GOOGLE_WEB);

  useEffect(() => {
    if (Platform.OS === 'ios') AppleAuthentication.isAvailableAsync().then(setAppleOk).catch(() => {});
    if (googleOk) GoogleSignin.configure({ webClientId: GOOGLE_WEB, iosClientId: GOOGLE_IOS || undefined });
  }, [googleOk]);

  const finish = async (provider, token, name, redirectUri) => {
    const inviteCode = (await takePendingInvite()) || undefined;
    const res = await api.post('/auth/social', { provider, token, name, language: lang, inviteCode, redirectUri });
    await signIn(res);
    onSignedIn(res.isNew);
  };

  const apple = async () => {
    setBusy('apple');
    try {
      const cred = await AppleAuthentication.signInAsync({
        requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      });
      const name = [cred.fullName?.givenName, cred.fullName?.familyName].filter(Boolean).join(' ') || undefined;
      await finish('apple', cred.identityToken, name);
    } catch (e) {
      if (e.code !== 'ERR_REQUEST_CANCELED') Alert.alert(t('error'), errText(e));
    } finally { setBusy(null); }
  };

  const google = async () => {
    setBusy('google');
    try {
      await GoogleSignin.hasPlayServices();
      const res = await GoogleSignin.signIn();
      if (res.type === 'cancelled') return;
      const idToken = res.data?.idToken || res.idToken; // v13+ and older response shapes
      await finish('google', idToken);
    } catch (e) {
      if (e.code !== 'SIGN_IN_CANCELLED' && e.code !== '-5') Alert.alert(t('error'), errText(e));
    } finally { setBusy(null); }
  };

  const linkedinOk = linkedInEnabled();
  const linkedin = async () => {
    setBusy('linkedin');
    try {
      const r = await linkedInAuthorize();
      if (r) await finish('linkedin', r.code, undefined, r.redirectUri);
    } catch (e) { Alert.alert(t('error'), errText(e)); } finally { setBusy(null); }
  };

  if (!appleOk && !googleOk && !linkedinOk) return null;
  const Btn = ({ onPress, icon, label, dark, id }) => (
    <Pressable onPress={onPress} disabled={!!busy} accessibilityRole="button"
      style={({ pressed }) => ({ minHeight: 50, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
        backgroundColor: dark ? '#000' : c.card, borderWidth: 1, borderColor: dark ? '#000' : c.line, opacity: pressed || (busy && busy !== id) ? 0.7 : 1 })}>
      <Ionicons name={icon} size={20} color={dark ? '#fff' : c.ink} />
      <Text style={{ color: dark ? '#fff' : c.ink, fontSize: 16, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1, height: 1, backgroundColor: c.line }} />
        <Text style={{ color: c.muted }}>{t('or')}</Text>
        <View style={{ flex: 1, height: 1, backgroundColor: c.line }} />
      </View>
      {appleOk ? <Btn id="apple" onPress={apple} icon="logo-apple" label={t('continueApple')} dark /> : null}
      {googleOk ? <Btn id="google" onPress={google} icon="logo-google" label={t('continueGoogle')} /> : null}
      {linkedinOk ? <Btn id="linkedin" onPress={linkedin} icon="logo-linkedin" label={t('continueLinkedIn')} /> : null}
    </View>
  );
}
