import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Text, TextInput } from './Text';
import { useApp } from '../context/AppProvider';
import { radius } from '../theme';

export function useStyles() {
  const { colors: c } = useApp();
  return React.useMemo(() => StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    h1: { color: c.ink, fontSize: 24, fontWeight: '700', textAlign: 'left' },
    h2: { color: c.ink, fontSize: 18, fontWeight: '700', textAlign: 'left' },
    title: { color: c.ink, fontSize: 15, fontWeight: '600', textAlign: 'left' },
    body: { color: c.ink, fontSize: 15, lineHeight: 24, textAlign: 'left' },
    muted: { color: c.muted, fontSize: 14, textAlign: 'left' },
    small: { color: c.muted, fontSize: 12, textAlign: 'left' },
    error: { color: c.danger, fontSize: 13, textAlign: 'left' },
    card: { backgroundColor: c.card, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: c.line, padding: 14 },
    input: {
      backgroundColor: c.card, borderWidth: 1, borderColor: c.line, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12,
      fontSize: 16, color: c.ink, textAlign: 'left',
    },
  }), [c]);
}

export function Screen({ children, scroll = true, padded = true, edges = ['bottom'], refreshControl }) {
  const { colors: c } = useApp();
  const pad = padded ? { padding: 16, gap: 14 } : null;
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: c.bg }}>
      {scroll
        ? <ScrollView contentContainerStyle={[pad, { paddingBottom: 40 }]} keyboardShouldPersistTaps="handled" refreshControl={refreshControl}>{children}</ScrollView>
        : <View style={[{ flex: 1 }, pad]}>{children}</View>}
    </SafeAreaView>
  );
}

export function Button({ title, onPress, variant = 'primary', icon, loading, disabled, style, small }) {
  const { colors: c } = useApp();
  const v = {
    primary: { bg: c.primary, fg: c.dark ? c.bg : '#fff', bd: c.primary },
    soft: { bg: c.soft, fg: c.primary, bd: c.soft },
    ghost: { bg: 'transparent', fg: c.primary, bd: c.primary },
    danger: { bg: 'transparent', fg: c.danger, bd: c.danger },
  }[variant];
  const off = disabled || loading;
  return (
    <Pressable onPress={onPress} disabled={off} accessibilityRole="button"
      style={({ pressed }) => [{
        minHeight: small ? 38 : 50, paddingHorizontal: small ? 14 : 18, borderRadius: small ? 12 : radius.md, borderWidth: 1.5,
        backgroundColor: v.bg, borderColor: v.bd, alignItems: 'center', justifyContent: 'center', opacity: off ? 0.5 : pressed ? 0.85 : 1,
      }, style]}>
      {loading ? <ActivityIndicator color={v.fg} /> : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {icon ? <Ionicons name={icon} size={small ? 16 : 19} color={v.fg} /> : null}
          <Text style={{ color: v.fg, fontSize: small ? 14 : 16, fontWeight: '700' }}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function Field({ label, hint, error, style, ...p }) {
  const s = useStyles();
  const { colors: c } = useApp();
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={s.title}>{label}</Text> : null}
      <TextInput placeholderTextColor={c.muted} style={[s.input, p.multiline && { minHeight: 110, textAlignVertical: 'top' }, error && { borderColor: c.danger }, style]} {...p} />
      {error ? <Text style={s.error}>{error}</Text> : hint ? <Text style={s.small}>{hint}</Text> : null}
    </View>
  );
}

export function Chip({ label, active, onPress, icon, color }) {
  const { colors: c } = useApp();
  const tint = color || c.primary;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!active }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
        backgroundColor: active ? tint : c.card, borderWidth: 1, borderColor: active ? tint : c.line }}>
      {icon ? <Ionicons name={icon} size={15} color={active ? '#fff' : tint} /> : null}
      <Text style={{ color: active ? '#fff' : c.ink, fontWeight: '600', fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

export function Card({ children, style, onPress }) {
  const s = useStyles();
  if (onPress) return <Pressable onPress={onPress} style={({ pressed }) => [s.card, style, pressed && { opacity: 0.85 }]}>{children}</Pressable>;
  return <View style={[s.card, style]}>{children}</View>;
}

export function Avatar({ uri, name, size = 40, anonymous }) {
  const { colors: c } = useApp();
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (anonymous) return <View style={[box, { backgroundColor: c.line, alignItems: 'center', justifyContent: 'center' }]}><Ionicons name="eye-off" size={size / 2.2} color={c.muted} /></View>;
  if (uri) return <Image source={{ uri }} style={[box, { backgroundColor: c.line }]} contentFit="cover" transition={150} />;
  const initials = (name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return <View style={[box, { backgroundColor: c.soft, alignItems: 'center', justifyContent: 'center' }]}><Text style={{ color: c.primary, fontWeight: '700', fontSize: size / 2.6 }}>{initials}</Text></View>;
}

export function Empty({ icon = 'chatbubbles-outline', title, subtitle, action }) {
  const { colors: c } = useApp();
  const s = useStyles();
  return (
    <View style={{ alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24, gap: 10 }}>
      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: c.soft, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={34} color={c.primary} />
      </View>
      <Text style={[s.title, { textAlign: 'center' }]}>{title}</Text>
      {subtitle ? <Text style={[s.muted, { textAlign: 'center' }]}>{subtitle}</Text> : null}
      {action || null}
    </View>
  );
}

export function Loading() {
  const { colors: c } = useApp();
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}><ActivityIndicator size="large" color={c.primary} /></View>;
}

export function ErrorBanner({ text, onRetry }) {
  const { colors: c, t } = useApp();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.md, backgroundColor: c.dark ? '#3B1D1D' : '#FEF2F2', borderWidth: 1, borderColor: c.dark ? '#5B2626' : '#FECACA' }}>
      <Ionicons name="cloud-offline-outline" size={20} color={c.danger} />
      <Text style={{ flex: 1, color: c.ink, fontSize: 14, textAlign: 'left' }}>{text}</Text>
      {onRetry ? <Pressable onPress={onRetry} hitSlop={8}><Text style={{ color: c.primary, fontWeight: '700' }}>{t('retry')}</Text></Pressable> : null}
    </View>
  );
}

export function Skeleton({ rows = 3 }) {
  const { colors: c } = useApp();
  const s = useStyles();
  const pulse = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.45, duration: 700, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  const bar = (w, h = 12) => <View style={{ width: w, height: h, borderRadius: h / 2, backgroundColor: c.line }} />;
  return (
    <View style={{ gap: 12 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <Animated.View key={i} style={[s.card, { opacity: pulse, gap: 10 }]}>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.line }} />{bar('35%')}
          </View>
          {bar('90%', 14)}{bar('65%', 14)}
        </Animated.View>
      ))}
    </View>
  );
}

// Bottom sheet menu: options = [{ label, icon, onPress, danger }]
export function ActionSheet({ visible, onClose, options, title }) {
  const { colors: c, t } = useApp();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' }} onPress={onClose} accessibilityLabel={t('cancel')} />
      <SafeAreaView edges={['bottom']} style={{ backgroundColor: c.card, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: 8 }}>
        <View style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: c.line, marginBottom: 6 }} />
        {title ? <Text style={{ color: c.muted, fontSize: 13, paddingHorizontal: 20, paddingVertical: 6, textAlign: 'left' }}>{title}</Text> : null}
        {options.filter(Boolean).map((o) => (
          <Pressable key={o.label} onPress={() => { onClose(); setTimeout(o.onPress, 250); }}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 15, backgroundColor: pressed ? c.bg : 'transparent' })}>
            <Ionicons name={o.icon} size={21} color={o.danger ? c.danger : c.ink} />
            <Text style={{ color: o.danger ? c.danger : c.ink, fontSize: 16, textAlign: 'left' }}>{o.label}</Text>
          </Pressable>
        ))}
        <Pressable onPress={onClose} style={{ paddingVertical: 16, alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderColor: c.line }}>
          <Text style={{ color: c.muted, fontSize: 16, fontWeight: '600' }}>{t('cancel')}</Text>
        </Pressable>
      </SafeAreaView>
    </Modal>
  );
}

export function SettingsRow({ icon, label, onPress, value, danger }) {
  const { colors: c, isRTL } = useApp();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, opacity: pressed ? 0.6 : 1 })}>
      <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: danger ? (c.dark ? '#3B1D1D' : '#FEF2F2') : c.soft, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={18} color={danger ? c.danger : c.primary} />
      </View>
      <Text style={{ flex: 1, color: danger ? c.danger : c.ink, fontSize: 15, textAlign: 'left' }}>{label}</Text>
      {value ? <Text style={{ color: c.muted, fontSize: 13 }}>{value}</Text> : null}
      {!danger ? <Ionicons name={isRTL ? 'chevron-back' : 'chevron-forward'} size={18} color={c.muted} /> : null}
    </Pressable>
  );
}
