import React, { useState } from 'react';
import { Linking, Platform, Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import MapView, { Marker } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { useApp } from '../context/AppProvider';
import { radius } from '../theme';

export function ImageBox({ uri, height = 220 }) {
  const { colors: c } = useApp();
  return <Image source={{ uri }} style={{ width: '100%', height, borderRadius: radius.md, backgroundColor: c.line }} contentFit="cover" transition={200} />;
}

// In lists we show a lightweight poster; the real player loads on the question page
export function VideoPoster({ onPress }) {
  const { colors: c, t } = useApp();
  return (
    <Pressable onPress={onPress} style={{ height: 190, borderRadius: radius.md, backgroundColor: c.dark ? '#000' : '#1E293B', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      <View style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="play" size={28} color="#fff" />
      </View>
      <Text style={{ color: '#E2E8F0', fontSize: 13 }}>{t('video')}</Text>
    </Pressable>
  );
}

export function VideoBox({ uri }) {
  const player = useVideoPlayer(uri, (p) => { p.loop = false; });
  return (
    <VideoView player={player} nativeControls allowsFullscreen allowsPictureInPicture={false}
      style={{ width: '100%', height: 240, borderRadius: radius.md, backgroundColor: '#000' }} contentFit="contain" />
  );
}

const fmt = (sec) => {
  const s = Math.max(0, Math.round(sec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function AudioBox({ uri }) {
  const { colors: c } = useApp();
  const player = useAudioPlayer(uri);
  const st = useAudioPlayerStatus(player);
  const progress = st.duration ? Math.min(1, st.currentTime / st.duration) : 0;
  const toggle = () => {
    if (st.playing) player.pause();
    else {
      if (st.duration && st.currentTime >= st.duration - 0.2) player.seekTo(0);
      player.play();
    }
  };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.md, backgroundColor: c.soft }}>
      <Pressable onPress={toggle} accessibilityRole="button" accessibilityLabel={st.playing ? 'pause' : 'play'}
        style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={st.playing ? 'pause' : 'play'} size={22} color={c.dark ? c.bg : '#fff'} />
      </Pressable>
      <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: c.line, overflow: 'hidden' }}>
        <View style={{ width: `${progress * 100}%`, height: '100%', backgroundColor: c.primary }} />
      </View>
      <Text style={{ color: c.muted, fontSize: 12, minWidth: 36 }}>{fmt(st.playing || st.currentTime ? st.currentTime : st.duration)}</Text>
    </View>
  );
}

export const openInMaps = (lat, lng, label) => {
  const q = encodeURIComponent(label || `${lat},${lng}`);
  const url = Platform.OS === 'ios' ? `maps://?q=${q}&ll=${lat},${lng}` : `geo:${lat},${lng}?q=${lat},${lng}(${q})`;
  Linking.openURL(url).catch(() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`));
};

export function LocationBox({ location, compact }) {
  const { colors: c, t } = useApp();
  return (
    <View style={{ borderRadius: radius.md, overflow: 'hidden', borderWidth: 1, borderColor: c.line }}>
      <MapView style={{ height: compact ? 130 : 180 }} pointerEvents="none" liteMode
        initialRegion={{ latitude: location.lat, longitude: location.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 }}>
        <Marker coordinate={{ latitude: location.lat, longitude: location.lng }} pinColor={c.primary} />
      </MapView>
      <Pressable onPress={() => openInMaps(location.lat, location.lng, location.name)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, backgroundColor: c.card }}>
        <Ionicons name="location" size={18} color={c.primary} />
        <Text style={{ flex: 1, color: c.ink, fontSize: 14, textAlign: 'left' }} numberOfLines={1}>{location.name || `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`}</Text>
        <Text style={{ color: c.primary, fontSize: 13, fontWeight: '600' }}>{t('openInMaps')}</Text>
      </Pressable>
    </View>
  );
}

// Tap an option to vote; results appear after voting (or for the author)
export function PollBox({ poll, onVote, showResults }) {
  const { colors: c, t } = useApp();
  const [busy, setBusy] = useState(null);
  const reveal = showResults || !!poll.myVote;
  const vote = async (id) => { if (busy) return; setBusy(id); try { await onVote(id); } finally { setBusy(null); } };
  return (
    <View style={{ gap: 8 }}>
      {poll.options.map((o) => {
        const pct = poll.total ? Math.round((o.votes / poll.total) * 100) : 0;
        const mine = poll.myVote === o.id;
        return (
          <Pressable key={o.id} onPress={() => vote(o.id)} disabled={!!busy} accessibilityRole="radio" accessibilityState={{ checked: mine }}
            style={{ borderRadius: 12, borderWidth: 1.5, borderColor: mine ? c.primary : c.line, overflow: 'hidden', backgroundColor: c.card }}>
            {reveal ? <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${pct}%`, backgroundColor: c.soft }} /> : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 11 }}>
              {mine ? <Ionicons name="checkmark-circle" size={18} color={c.primary} /> : null}
              <Text style={{ flex: 1, color: c.ink, fontSize: 15, fontWeight: mine ? '700' : '400', textAlign: 'left' }}>{o.text}</Text>
              {reveal ? <Text style={{ color: c.muted, fontSize: 13, fontWeight: '600' }}>{pct}%</Text> : null}
            </View>
          </Pressable>
        );
      })}
      <Text style={{ color: c.muted, fontSize: 12, textAlign: 'left' }}>{poll.total} {t('votes')}</Text>
    </View>
  );
}
