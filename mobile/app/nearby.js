// Map of location questions around the user
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import MapView, { Callout, Marker } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '../src/components/Text';
import { Chip, ErrorBanner } from '../src/components/ui';
import { useApp } from '../src/context/AppProvider';
import { api } from '../src/api/client';

const RADII = [5, 25, 100];
const DEFAULT = { latitude: 24.7136, longitude: 46.6753 };

export default function Nearby() {
  const { t, colors: c, errText } = useApp();
  const map = useRef(null);
  const [center, setCenter] = useState(null);
  const [radiusKm, setRadiusKm] = useState(25);
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync().catch(() => ({ status: 'denied' }));
      const pos = status === 'granted' ? await Location.getCurrentPositionAsync({}).catch(() => null) : null;
      setCenter(pos ? { latitude: pos.coords.latitude, longitude: pos.coords.longitude } : DEFAULT);
    })();
  }, []);

  useEffect(() => {
    if (!center) return;
    api.get(`/posts?type=LOCATION&near=${center.latitude},${center.longitude}&radiusKm=${radiusKm}`)
      .then((r) => { setItems(r.items); setError(''); }).catch((e) => setError(errText(e)));
    const d = radiusKm / 55;
    map.current && map.current.animateToRegion({ ...center, latitudeDelta: d, longitudeDelta: d }, 400);
  }, [center, radiusKm, errText]);

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ padding: 12, gap: 8 }}>
        <Text style={{ color: c.muted, textAlign: 'left' }}>{t('nearbyHint')}</Text>
        <ScrollView horizontal contentContainerStyle={{ gap: 8 }} showsHorizontalScrollIndicator={false}>
          {RADII.map((r) => <Chip key={r} label={`${r} ${t('km')}`} active={radiusKm === r} onPress={() => setRadiusKm(r)} />)}
        </ScrollView>
        {error ? <ErrorBanner text={error} /> : null}
      </View>
      {center ? (
        <MapView ref={map} style={{ flex: 1 }} showsUserLocation initialRegion={{ ...center, latitudeDelta: 0.45, longitudeDelta: 0.45 }}>
          {items.map((p) => (
            <Marker key={p.id} coordinate={{ latitude: p.location.lat, longitude: p.location.lng }} pinColor={p.category.color}>
              <Callout onPress={() => router.push(`/post/${p.id}`)}>
                <Pressable style={{ maxWidth: 220, padding: 4 }}>
                  <Text style={{ fontWeight: '700', textAlign: 'left' }} numberOfLines={2}>{p.content || p.location.name}</Text>
                  <Text style={{ color: '#667', fontSize: 12, textAlign: 'left' }}>{p.commentCount} {t('answers')} · {p.distanceKm} {t('km')}</Text>
                </Pressable>
              </Callout>
            </Marker>
          ))}
        </MapView>
      ) : null}
    </SafeAreaView>
  );
}
