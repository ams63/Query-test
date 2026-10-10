import React from 'react';
import { Pressable, View } from 'react-native';
import { Text } from './Text';
import { useApp } from '../context/AppProvider';

// Segmented control; default options are the three sort orders
export default function SortTabs({ value, onChange, options }) {
  const { t, colors: c } = useApp();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: c.card, borderRadius: 14, padding: 4, borderWidth: 1, borderColor: c.line }}>
      {(options || ['latest', 'unanswered', 'popular'].map((k) => [k, t(k)])).map(([k, label]) => (
        <Pressable key={k} onPress={() => onChange(k)} accessibilityRole="tab" accessibilityState={{ selected: value === k }}
          style={{ flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center', backgroundColor: value === k ? c.primary : 'transparent' }}>
          <Text style={{ color: value === k ? (c.dark ? c.bg : '#fff') : c.muted, fontWeight: '600', fontSize: 13 }}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

