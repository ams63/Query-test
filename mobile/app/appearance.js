// Theme colors (the original "Themes" feature) + language
import React from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../src/components/Text';
import { Card, Screen, useStyles } from '../src/components/ui';
import { useApp } from '../src/context/AppProvider';
import { THEMES, THEME_KEYS, radius } from '../src/theme';
import { LANGS } from '../src/i18n/strings';

export default function Appearance() {
  const { t, themeKey, setTheme, lang, setLang, colors: c } = useApp();
  const s = useStyles();
  return (
    <Screen>
      <Text style={s.h2}>{t('themes')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {THEME_KEYS.map((k) => {
          const th = THEMES[k];
          const on = themeKey === k;
          return (
            <Pressable key={k} onPress={() => setTheme(k)} accessibilityRole="radio" accessibilityState={{ checked: on }}
              style={{ width: '31%', borderRadius: radius.md, borderWidth: 2, borderColor: on ? c.primary : c.line, overflow: 'hidden', backgroundColor: th.bg }}>
              <View style={{ height: 56, backgroundColor: th.primary, alignItems: 'center', justifyContent: 'center' }}>
                {on ? <Ionicons name="checkmark-circle" size={24} color="#fff" /> : null}
              </View>
              <View style={{ padding: 8, gap: 4 }}>
                <View style={{ height: 6, width: '80%', borderRadius: 3, backgroundColor: th.line }} />
                <Text style={{ color: th.ink, fontSize: 13, fontWeight: '600', textAlign: 'left' }}>{t(`theme_${k}`)}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      <Text style={[s.h2, { marginTop: 8 }]}>{t('language')}</Text>
      {LANGS.map((l) => (
        <Card key={l.code} onPress={() => setLang(l.code)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={s.title}>{l.label}</Text>
          {lang === l.code ? <Ionicons name="checkmark-circle" size={22} color={c.primary} /> : null}
        </Card>
      ))}
    </Screen>
  );
}
