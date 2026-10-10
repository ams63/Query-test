// Sign in with LinkedIn (OpenID Connect). LinkedIn only allows https redirect addresses, so it returns to our server's
// /auth/linkedin/callback, which forwards the code to the app (query://auth/linkedin). The server keeps the client secret.
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import Constants from 'expo-constants';
import { API_URL } from '../api/client';

export const LINKEDIN_CLIENT_ID = process.env.EXPO_PUBLIC_LINKEDIN_CLIENT_ID || Constants.expoConfig?.extra?.linkedinClientId || '';
export const linkedInEnabled = () => !!LINKEDIN_CLIENT_ID;
export const linkedInRedirectUri = () => `${API_URL}/auth/linkedin/callback`;

// Resolves { code, redirectUri }, or null if the person cancelled
export async function linkedInAuthorize() {
  const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const redirectUri = linkedInRedirectUri();
  const url = `https://www.linkedin.com/oauth/v2/authorization?${new URLSearchParams({
    response_type: 'code', client_id: LINKEDIN_CLIENT_ID, redirect_uri: redirectUri, scope: 'openid profile email', state,
  })}`;
  const res = await WebBrowser.openAuthSessionAsync(url, 'query://auth/linkedin');
  if (res.type !== 'success') return null;
  const { queryParams } = Linking.parse(res.url);
  if (!queryParams || queryParams.state !== state || !queryParams.code) return null; // protects against forged redirects
  return { code: String(queryParams.code), redirectUri };
}

export const linkedInShareUrl = (link) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(link)}`;
