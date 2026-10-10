import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Text } from '../src/components/Text';
import { useApp } from '../src/context/AppProvider';
import { LANGS } from '../src/i18n/strings';

const SLIDES = [['help-circle', 'intro1T', 'intro1B'], ['chatbubbles', 'intro2T', 'intro2B'], ['notifications', 'intro3T', 'intro3B']];

export default function Intro() {
  const { t, lang, setLang, markIntroSeen, colors: c } = useApp();
  const [i, setI] = useState(0);
  const last = i === SLIDES.length - 1;
  const done = async () => { await markIntroSeen(); router.replace('/login'); };
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.primaryDark }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, flex: 1 }}>
          {LANGS.map((l) => (
            <Pressable key={l.code} onPress={() => setLang(l.code)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: lang === l.code ? '#fff' : 'rgba(255,255,255,0.12)' }}>
              <Text style={{ color: lang === l.code ? c.primaryDark : '#fff', fontWeight: '600' }}>{l.label}</Text>
            </Pressable>
          ))}
        </View>
        {!last ? <Pressable onPress={done} hitSlop={10}><Text style={{ color: 'rgba(255,255,255,0.8)' }}>{t('skip')}</Text></Pressable> : null}
      </View>
      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 28, gap: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
            <Image source={require('../assets/logo-mark.png')} style={{ width: 44, height: 50 }} contentFit="contain" />
          </View>
          <Text style={{ color: '#fff', fontSize: 40, fontWeight: '700' }}>Query</Text>
        </View>
        <View style={{ width: 92, height: 92, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={SLIDES[i][0]} size={48} color={c.gold} />
        </View>
        <Text style={{ color: '#fff', fontSize: 28, fontWeight: '700', lineHeight: 40, textAlign: 'left' }}>{t(SLIDES[i][1])}</Text>
        <Text style={{ color: 'rgba(255,255,255,0.82)', fontSize: 17, lineHeight: 28, textAlign: 'left' }}>{t(SLIDES[i][2])}</Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {SLIDES.map((_, k) => <View key={k} style={{ height: 6, width: k === i ? 28 : 10, borderRadius: 3, backgroundColor: k === i ? c.gold : 'rgba(255,255,255,0.35)' }} />)}
        </View>
      </View>
      <View style={{ padding: 24 }}>
        <Pressable onPress={() => (last ? done() : setI(i + 1))} style={{ backgroundColor: '#fff', borderRadius: 16, minHeight: 54, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: c.primaryDark, fontSize: 17, fontWeight: '700' }}>{last ? t('start') : t('next')}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
