import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Field } from '../src/components/ui';
import { Text } from '../src/components/Text';
import { useApp } from '../src/context/AppProvider';
import { setPicked } from '../src/lib/pickStore';

const DEFAULT = { latitude: 24.7136, longitude: 46.6753 }; // Riyadh

export default function PickLocation() {
  const { t, colors: c } = useApp();
  const map = useRef(null);
  const [pin, setPin] = useState(null);
  const [name, setName] = useState('');

  const place = async (lat, lng) => {
    setPin({ latitude: lat, longitude: lng });
    try {
      const [g] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      if (g) setName((cur) => cur || [g.name, g.district, g.city].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).slice(0, 2).join('، '));
    } catch { /* optional */ }
  };
  const locate = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync().catch(() => ({ status: 'denied' }));
    if (status !== 'granted') return;
    const pos = await Location.getCurrentPositionAsync({}).catch(() => null);
    if (!pos) return;
    const { latitude, longitude } = pos.coords;
    map.current && map.current.animateToRegion({ latitude, longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 400);
    place(latitude, longitude);
  };
  useEffect(() => { locate(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const confirm = () => { setPicked({ lat: pin.latitude, lng: pin.longitude, name: name.trim() }); router.back(); };

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: c.bg }}>
      <MapView ref={map} style={{ flex: 1 }} showsUserLocation initialRegion={{ ...DEFAULT, latitudeDelta: 0.3, longitudeDelta: 0.3 }}
        onPress={(e) => place(e.nativeEvent.coordinate.latitude, e.nativeEvent.coordinate.longitude)}>
        {pin ? <Marker draggable coordinate={pin} pinColor={c.primary} onDragEnd={(e) => place(e.nativeEvent.coordinate.latitude, e.nativeEvent.coordinate.longitude)} /> : null}
      </MapView>
      <View style={{ padding: 16, gap: 10, backgroundColor: c.card }}>
        {!pin ? <Text style={{ color: c.muted, textAlign: 'left' }}>{t('pickLocation')}</Text> : null}
        <Field placeholder={t('placeName')} value={name} onChangeText={setName} maxLength={120} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button style={{ flex: 1 }} variant="soft" icon="locate" title={t('useMyLocation')} onPress={locate} />
          <Button style={{ flex: 1 }} icon="checkmark" title={t('confirm')} onPress={confirm} disabled={!pin} />
        </View>
      </View>
    </SafeAreaView>
  );
}
