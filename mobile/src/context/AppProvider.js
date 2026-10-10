import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { I18nManager, DevSettings } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { reloadAppAsync } from 'expo';
import { api, setToken, setUnauthorizedHandler } from '../api/client';
import { strings } from '../i18n/strings';
import { THEMES } from '../theme';
import { registerForPush } from '../lib/notifications';

const Ctx = createContext(null);
const K = { token: 'query_token', lang: 'query_lang', theme: 'query_theme', intro: 'query_intro' };

// Arabic is right-to-left; switching direction needs a reload (guarded so it can never loop)
async function applyDirection(lang, reload) {
  try {
    const rtl = lang === 'ar';
    I18nManager.allowRTL(true);
    if (I18nManager.isRTL === rtl) return;
    I18nManager.forceRTL(rtl);
    const guard = `query_dir_${lang}`;
    if (reload && !(await SecureStore.getItemAsync(guard))) {
      await SecureStore.setItemAsync(guard, '1');
      setTimeout(() => {
        try {
          if (typeof reloadAppAsync === 'function') {
            reloadAppAsync('RTL Layout Change').catch(() => {});
          } else if (DevSettings && typeof DevSettings.reload === 'function') {
            DevSettings.reload();
          }
        } catch {}
      }, 150);
    }
  } catch (e) {
    console.error('applyDirection error:', e);
  }
}

export function AppProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [token, setTok] = useState(null);
  const [user, setUser] = useState(null);
  const [lang, setLangState] = useState('ar');
  const [themeKey, setThemeKey] = useState('teal');
  const [introSeen, setIntroSeen] = useState(false);
  const [categories, setCategories] = useState([]);
  const [unread, setUnread] = useState(0);

  const t = useCallback((k) => (strings[lang] && strings[lang][k]) || strings.en[k] || k, [lang]);
  const errText = useCallback((e) => {
    if (e && e.code === 'NETWORK_ERROR') return t('networkError');
    // The server's automatic filter says why content was rejected (sexual / religion)
    if (e && e.code === 'CONTENT_REJECTED' && e.details && e.details.reason) return t(`rejected_${e.details.reason}`);
    return strings[lang][`err_${e && e.code}`] || t('error');
  }, [lang, t]);
  const catName = useCallback((c) => (c ? ({ ar: c.nameAr, en: c.nameEn, tr: c.nameTr, es: c.nameEs }[lang] || c.nameEn) : ''), [lang]);
  const locale = { ar: 'ar-SA-u-ca-gregory', en: 'en-GB', tr: 'tr-TR', es: 'es-ES' }[lang] || 'en-GB';
  const colors = THEMES[themeKey] || THEMES.teal;

  const loadCategories = useCallback(() => api.get('/categories').then(setCategories).catch(() => {}), []);

  const logout = useCallback(async () => {
    api.post('/me/push-token', { token: null }).catch(() => {});
    await SecureStore.deleteItemAsync(K.token);
    setToken(null); setTok(null); setUser(null); setUnread(0);
  }, []);

  const refreshUser = useCallback(async () => {
    const me = await api.get('/me');
    setUser(me);
    setUnread(me.unreadNotifications || 0);
    return me;
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [tk, l, th, intro] = await Promise.all([K.token, K.lang, K.theme, K.intro].map((k) => SecureStore.getItemAsync(k)));
        const language = l || 'ar';
        setLangState(language);
        if (th && THEMES[th]) setThemeKey(th);
        setIntroSeen(!!intro);
        await applyDirection(language, true);
        setUnauthorizedHandler(() => logout());
        if (tk) {
          setToken(tk);
          setTok(tk);
          try {
            const me = await api.get('/me');
            setUser(me); setUnread(me.unreadNotifications || 0);
            if (THEMES[me.theme]) setThemeKey(me.theme);
          } catch (e) {
            if (e.status === 401) { await SecureStore.deleteItemAsync(K.token); setToken(null); setTok(null); }
          }
        }
        await loadCategories();
      } catch (e) {
        console.error('Initialization error:', e);
      } finally {
        setReady(true);
      }
    })();
  }, [logout, loadCategories]);

  // Register this device for push notifications after sign-in
  useEffect(() => {
    if (!token) return;
    registerForPush().then((pt) => { if (pt) api.post('/me/push-token', { token: pt }).catch(() => {}); });
    loadCategories();
  }, [token, loadCategories]);

  const setLang = useCallback(async (l) => {
    await SecureStore.setItemAsync(K.lang, l);
    setLangState(l);
    if (token) api.patch('/me', { language: l }).catch(() => {});
    await SecureStore.deleteItemAsync(`query_dir_${l}`);
    await applyDirection(l, true);
  }, [token]);

  const setTheme = useCallback(async (key) => {
    setThemeKey(key);
    await SecureStore.setItemAsync(K.theme, key);
    if (token) api.patch('/me', { theme: key }).then(setUser).catch(() => {});
  }, [token]);

  const signIn = useCallback(async ({ token: tk, user: u }) => {
    await SecureStore.setItemAsync(K.token, tk);
    setToken(tk); setTok(tk); setUser(u); setUnread(u.unreadNotifications || 0);
    if (THEMES[u.theme]) { setThemeKey(u.theme); SecureStore.setItemAsync(K.theme, u.theme); }
  }, []);

  const markIntroSeen = useCallback(async () => { await SecureStore.setItemAsync(K.intro, '1'); setIntroSeen(true); }, []);

  const value = useMemo(() => ({
    ready, token, user, setUser, lang, locale, t, errText, catName, colors, themeKey, categories, loadCategories, introSeen, unread, setUnread,
    signIn, logout, refreshUser, setLang, setTheme, markIntroSeen, isRTL: lang === 'ar',
  }), [ready, token, user, lang, locale, t, errText, catName, colors, themeKey, categories, loadCategories, introSeen, unread, signIn, logout, refreshUser, setLang, setTheme, markIntroSeen]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useApp = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside AppProvider');
  return v;
};
