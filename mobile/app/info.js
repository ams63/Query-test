// About / Terms / Privacy / Contact
import React, { useEffect } from 'react';
import { Linking } from 'react-native';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { Text } from '../src/components/Text';
import { Button, Screen, useStyles } from '../src/components/ui';
import { useApp } from '../src/context/AppProvider';

const CONTACT_EMAIL = 'support@query-app.com';

export default function Info() {
  const { page = 'about' } = useLocalSearchParams();
  const navigation = useNavigation();
  const { t } = useApp();
  const s = useStyles();
  const titles = { about: 'about', terms: 'terms', privacy: 'privacy', contact: 'contact' };
  const bodies = { about: 'aboutText', terms: 'termsText', privacy: 'privacyText', contact: 'contactText' };
  useEffect(() => { navigation.setOptions({ title: t(titles[page] || 'about') }); }, [navigation, page, t]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Screen>
      {t(bodies[page] || 'aboutText').split('\n\n').map((para, i) => {
        const heading = para.split('\n')[0];
        const isHeading = /^([0-9١-٩]+\.\s.+|.+:)$/.test(heading.trim()) && para.includes('\n');
        return (
          <Text key={i} style={[s.body, { lineHeight: 28 }]}>
            {isHeading ? <Text style={{ fontWeight: '700' }}>{heading}{'\n'}</Text> : null}
            {isHeading ? para.split('\n').slice(1).join('\n') : para}
          </Text>
        );
      })}
      {page === 'contact' ? <Button icon="mail-outline" title={CONTACT_EMAIL} onPress={() => Linking.openURL(`mailto:${CONTACT_EMAIL}`)} /> : null}
      {page === 'about' ? <Text style={s.small}>Query v2.0</Text> : null}
    </Screen>
  );
}
