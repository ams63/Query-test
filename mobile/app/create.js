import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, Switch, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { Ionicons } from '@expo/vector-icons';
import { Text, TextInput } from '../src/components/Text';
import { Button, Field, Screen, useStyles } from '../src/components/ui';
import { AudioBox, ImageBox, LocationBox, VideoBox } from '../src/components/Media';
import { useApp } from '../src/context/AppProvider';
import { api, filePart } from '../src/api/client';
import { takePicked } from '../src/lib/pickStore';
import { radius } from '../src/theme';
import { StarPicker } from '../src/components/Review';
import { maybeAskForReview } from '../src/lib/growth';

// Optional things to add to a question (the question text always comes first)
const ATTACHMENTS = [['IMAGE', 'image', 'image'], ['VIDEO', 'video', 'videocam'], ['AUDIO', 'voiceNote', 'mic'], ['LOCATION', 'location', 'location'], ['POLL', 'poll', 'stats-chart']];
const MAX_AUDIO_MS = 3 * 60 * 1000;

function Recorder({ uri, onDone }) {
  const { t, colors: c } = useApp();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const st = useAudioRecorderState(recorder, 250);
  const stop = useCallback(async () => {
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    if (recorder.uri) onDone(recorder.uri);
  }, [recorder, onDone]);
  useEffect(() => { if (st.isRecording && st.durationMillis >= MAX_AUDIO_MS) stop(); }, [st.isRecording, st.durationMillis, stop]);

  const start = async () => {
    const perm = await AudioModule.requestRecordingPermissionsAsync();
    if (!perm.granted) { Alert.alert(t('micDenied')); return; }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    onDone(null);
    await recorder.prepareToRecordAsync();
    recorder.record();
  };
  const secs = Math.floor((st.durationMillis || 0) / 1000);
  return (
    <View style={{ gap: 12 }}>
      {uri && !st.isRecording ? <AudioBox uri={uri} /> : null}
      <View style={{ alignItems: 'center', gap: 10, paddingVertical: 10 }}>
        <Pressable onPress={st.isRecording ? stop : start} accessibilityRole="button" accessibilityLabel={st.isRecording ? t('stop') : t('record')}
          style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: st.isRecording ? c.danger : c.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={st.isRecording ? 'stop' : 'mic'} size={36} color="#fff" />
        </Pressable>
        <Text style={{ color: st.isRecording ? c.danger : c.muted, fontWeight: '600' }}>
          {st.isRecording ? `${t('recording')} ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` : uri ? t('reRecord') : t('record')}
        </Text>
      </View>
    </View>
  );
}

export default function Create() {
  const params = useLocalSearchParams();
  const { t, categories, catName, errText, colors: c } = useApp();
  const s = useStyles();
  const [att, setAtt] = useState(null); // null = text only
  const [cat, setCat] = useState(params.category ? Number(params.category) : null);
  const [content, setContent] = useState('');
  const [media, setMedia] = useState(null);
  const [loc, setLoc] = useState(null);
  const [options, setOptions] = useState(['', '']);
  const [anonymous, setAnonymous] = useState(false);
  const [lfKind, setLfKind] = useState(null); // Lost & Found: LOST | FOUND
  // Product review fields
  const [productName, setProductName] = useState(params.product ? String(params.product) : '');
  const [rating, setRating] = useState(0);
  const [store, setStore] = useState('');
  const [price, setPrice] = useState('');
  const [pros, setPros] = useState('');
  const [cons, setCons] = useState('');
  // Jobs category: a question, or a job opportunity
  const [postKind, setPostKind] = useState('QUESTION');
  const [job, setJob] = useState({ title: '', company: '', city: '', type: null, applyUrl: '' });
  const setJ = (k) => (v) => setJob((x) => ({ ...x, [k]: v }));
  const [busy, setBusy] = useState(false);

  useFocusEffect(useCallback(() => { const p = takePicked(); if (p) setLoc(p); }, []));
  const toggleAtt = (k) => { setAtt((cur) => (cur === k ? null : k)); setMedia(null); };

  const pick = async (kind, camera) => {
    const opts = { mediaTypes: [kind === 'VIDEO' ? 'videos' : 'images'], quality: 0.75, videoMaxDuration: 60, allowsEditing: kind === 'IMAGE' };
    if (camera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return;
    }
    const r = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (!r.canceled) setMedia(r.assets[0].uri);
  };

  const hasText = content.trim().length >= 3;
  const cleanOptions = options.map((o) => o.trim()).filter(Boolean);
  const category = categories.find((x) => x.id === cat);
  const isLF = !!category && category.key === 'lostfound';
  const isReview = !!category && category.key === 'reviews';
  const isJob = !!category && category.key === 'money' && postKind === 'JOB';
  const reviewOk = productName.trim().length >= 2 && rating > 0 && (hasText || !!pros.trim() || !!cons.trim() || !!media);
  const attachmentOk = !att
    || (['IMAGE', 'VIDEO', 'AUDIO'].includes(att) && !!media)
    || (att === 'LOCATION' && !!loc && (hasText || isReview))
    || (att === 'POLL' && hasText && cleanOptions.length >= 2);
  const valid = !!cat && (!isLF || !!lfKind) && attachmentOk && (isReview ? reviewOk : isJob ? job.title.trim().length >= 2 : (!att ? hasText : true));

  const publish = async () => {
    setBusy(true);
    try {
      const type = att || 'TEXT';
      const fd = new FormData();
      fd.append('categoryId', String(cat));
      fd.append('type', type);
      fd.append('content', content.trim());
      fd.append('anonymous', anonymous ? '1' : '0');
      if (media) fd.append('media', filePart(media, type === 'IMAGE' ? 'image/jpeg' : type === 'VIDEO' ? 'video/mp4' : 'audio/mp4'));
      if (type === 'LOCATION' && loc) { fd.append('lat', String(loc.lat)); fd.append('lng', String(loc.lng)); fd.append('placeName', loc.name || ''); }
      if (type === 'POLL') fd.append('pollOptions', JSON.stringify(cleanOptions));
      if (isLF && lfKind) fd.append('lfKind', lfKind);
      if (isJob) {
        fd.append('postKind', 'JOB'); fd.append('jobTitle', job.title.trim());
        if (job.company.trim()) fd.append('jobCompany', job.company.trim());
        if (job.city.trim()) fd.append('jobCity', job.city.trim());
        if (job.type) fd.append('jobType', job.type);
        if (job.applyUrl.trim()) fd.append('applyUrl', job.applyUrl.trim());
      }
      if (isReview) {
        fd.append('productName', productName.trim()); fd.append('rating', String(rating));
        if (store.trim()) fd.append('store', store.trim());
        if (price.trim() && Number.isFinite(Number(price.replace(',', '.')))) fd.append('price', String(Number(price.replace(',', '.'))));
        if (pros.trim()) fd.append('pros', pros.trim());
        if (cons.trim()) fd.append('cons', cons.trim());
      }
      const post = await api.form('/posts', fd);
      router.replace(`/post/${post.id}?justPosted=1`);
      setTimeout(maybeAskForReview, 4000);
    } catch (e) { Alert.alert(t('error'), errText(e)); } finally { setBusy(false); }
  };

  // Step 1 (only when opened without a category): pick one
  if (!category) {
    return (
      <Screen>
        <Text style={s.h2}>{t('whichCategory')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {categories.map((x) => (
            <Pressable key={x.id} onPress={() => setCat(x.id)} accessibilityRole="button"
              style={{ width: '48%', flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.md, backgroundColor: c.card, borderWidth: 1, borderColor: c.line }}>
              <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: x.color, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={x.icon} size={19} color="#fff" />
              </View>
              <Text style={{ flex: 1, color: c.ink, fontWeight: '600', textAlign: 'left' }} numberOfLines={1}>{catName(x)}</Text>
            </Pressable>
          ))}
        </View>
      </Screen>
    );
  }

  const hint = att === 'AUDIO' ? t('audioOnlyHint') : att === 'IMAGE' || att === 'VIDEO' ? t('mediaOnlyHint') : null;

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.md, backgroundColor: category.color }}>
        <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={category.icon} size={19} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, textAlign: 'left' }}>{t('yourQuestionIn')}</Text>
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700', textAlign: 'left' }}>{catName(category)}</Text>
        </View>
        <Pressable onPress={() => setCat(null)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.2)' }}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>{t('change')}</Text>
        </Pressable>
      </View>

      {isLF ? (
        <View style={{ gap: 8 }}>
          <Text style={s.title}>{t('lfWhich')}</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {[['LOST', 'lfLost', 'help-buoy', c.danger], ['FOUND', 'lfFound', 'hand-left', c.primary]].map(([k, label, ic, col]) => {
              const on = lfKind === k;
              return (
                <Pressable key={k} onPress={() => setLfKind(k)} accessibilityRole="radio" accessibilityState={{ checked: on }}
                  style={{ flex: 1, alignItems: 'center', gap: 6, paddingVertical: 14, borderRadius: radius.md, borderWidth: 2, borderColor: on ? col : c.line, backgroundColor: on ? `${col}14` : c.card }}>
                  <Ionicons name={ic} size={26} color={col} />
                  <Text style={{ color: c.ink, fontWeight: '700' }}>{t(label)}</Text>
                </Pressable>
              );
            })}
          </View>
          {lfKind ? <Text style={[s.small, { lineHeight: 19 }]}>{lfKind === 'LOST' ? t('lfTipLost') : t('lfTipFound')}</Text> : null}
        </View>
      ) : null}

      {category.key === 'money' ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {[['QUESTION', 'postKindQuestion', 'help-circle'], ['JOB', 'postKindJob', 'briefcase']].map(([k, label, ic]) => {
            const on = postKind === k;
            return (
              <Pressable key={k} onPress={() => setPostKind(k)} accessibilityRole="radio" accessibilityState={{ checked: on }}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: radius.md, borderWidth: 2, borderColor: on ? c.primary : c.line, backgroundColor: on ? c.soft : c.card }}>
                <Ionicons name={ic} size={20} color={on ? c.primary : c.muted} />
                <Text style={{ color: c.ink, fontWeight: '700' }}>{t(label)}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {isJob ? (
        <View style={{ gap: 12 }}>
          <Field label={t('jobTitle')} value={job.title} onChangeText={setJ('title')} maxLength={100} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><Field label={t('jobCompany')} value={job.company} onChangeText={setJ('company')} maxLength={100} /></View>
            <View style={{ flex: 1 }}><Field label={t('jobCity')} value={job.city} onChangeText={setJ('city')} maxLength={60} /></View>
          </View>
          <Text style={s.title}>{t('jobType')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {['FULL_TIME', 'PART_TIME', 'REMOTE', 'FREELANCE', 'INTERNSHIP'].map((k) => (
              <Pressable key={k} onPress={() => setJ('type')(job.type === k ? null : k)} accessibilityRole="radio" accessibilityState={{ checked: job.type === k }}
                style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: job.type === k ? c.primary : c.line, backgroundColor: job.type === k ? c.primary : c.card }}>
                <Text style={{ color: job.type === k ? '#fff' : c.ink, fontWeight: '600', fontSize: 13 }}>{t(`jt_${k}`)}</Text>
              </Pressable>
            ))}
          </View>
          <Field label={t('applyUrl')} value={job.applyUrl} onChangeText={setJ('applyUrl')} placeholder={t('applyUrlPh')} autoCapitalize="none" keyboardType="url" />
        </View>
      ) : null}

      {isReview ? (
        <View style={{ gap: 12 }}>
          <Field label={t('productName')} value={productName} onChangeText={setProductName} maxLength={100} placeholder={t('productNamePh')} />
          <View style={{ gap: 6 }}>
            <Text style={s.title}>{t('yourRating')}</Text>
            <StarPicker value={rating} onChange={setRating} />
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 3 }}><Field label={t('store')} value={store} onChangeText={setStore} maxLength={80} /></View>
            <View style={{ flex: 2 }}><Field label={t('price')} value={price} onChangeText={setPrice} keyboardType="decimal-pad" maxLength={10} /></View>
          </View>
          <Field label={t('pros')} value={pros} onChangeText={setPros} placeholder={t('prosPh')} maxLength={500} />
          <Field label={t('cons')} value={cons} onChangeText={setCons} placeholder={t('consPh')} maxLength={500} />
          <Text style={[s.small, { lineHeight: 19 }]}>{t('reviewRules')}</Text>
        </View>
      ) : null}

      <Field label={isReview || isJob ? undefined : t('whatsYourQuestion')} value={content} onChangeText={setContent} multiline maxLength={2000}
        placeholder={isJob ? t('jobDetailsPh') : isReview ? t('reviewPh') : isLF && lfKind ? t(lfKind === 'LOST' ? 'lfPlaceholderLost' : 'lfPlaceholderFound') : t('questionPlaceholder')}
        hint={hint} style={{ minHeight: 120, fontSize: 16 }} />

      <Text style={s.title}>{t('addToQuestion')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {ATTACHMENTS.map(([k, label, ic]) => {
          const on = att === k;
          return (
            <Pressable key={k} onPress={() => toggleAtt(k)} accessibilityRole="button" accessibilityState={{ selected: on }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, borderWidth: 1, borderColor: on ? c.primary : c.line, backgroundColor: on ? c.primary : c.card }}>
              <Ionicons name={on ? ic : `${ic}-outline`} size={17} color={on ? '#fff' : c.primary} />
              <Text style={{ color: on ? '#fff' : c.ink, fontWeight: '600', fontSize: 14 }}>{t(label)}</Text>
              {on ? <Ionicons name="close" size={15} color="#fff" /> : null}
            </Pressable>
          );
        })}
      </View>

      {att === 'IMAGE' ? (
        <View style={{ gap: 10 }}>
          {media ? <ImageBox uri={media} height={220} /> : null}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button style={{ flex: 1 }} variant="soft" icon="images-outline" title={t('fromGallery')} onPress={() => pick('IMAGE', false)} />
            <Button style={{ flex: 1 }} variant="soft" icon="camera-outline" title={t('fromCamera')} onPress={() => pick('IMAGE', true)} />
          </View>
        </View>
      ) : null}

      {att === 'VIDEO' ? (
        <View style={{ gap: 10 }}>
          {media ? <VideoBox key={media} uri={media} /> : null}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button style={{ flex: 1 }} variant="soft" icon="film-outline" title={t('fromGallery')} onPress={() => pick('VIDEO', false)} />
            <Button style={{ flex: 1 }} variant="soft" icon="videocam-outline" title={t('recordNow')} onPress={() => pick('VIDEO', true)} />
          </View>
          <Text style={s.small}>{t('videoHint')}</Text>
        </View>
      ) : null}

      {att === 'AUDIO' ? <Recorder uri={media} onDone={setMedia} /> : null}

      {att === 'LOCATION' ? (
        <View style={{ gap: 10 }}>
          {loc ? <LocationBox key={`${loc.lat},${loc.lng}`} location={loc} compact /> : null}
          <Button variant="soft" icon="map-outline" title={loc ? t('changeLocation') : t('pickLocation')} onPress={() => router.push('/pick-location')} />
        </View>
      ) : null}

      {att === 'POLL' ? (
        <View style={{ gap: 8 }}>
          {options.map((o, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TextInput value={o} onChangeText={(v) => setOptions((x) => x.map((y, j) => (j === i ? v : y)))} maxLength={80}
                placeholder={`${t('option')} ${i + 1}`} placeholderTextColor={c.muted} style={[s.input, { flex: 1 }]} />
              {options.length > 2 ? (
                <Pressable onPress={() => setOptions((x) => x.filter((_, j) => j !== i))} hitSlop={8} accessibilityLabel={t('delete')}>
                  <Ionicons name="close-circle" size={24} color={c.muted} />
                </Pressable>
              ) : null}
            </View>
          ))}
          {options.length < 4 ? <Button small variant="ghost" icon="add" title={t('addOption')} onPress={() => setOptions((x) => [...x, ''])} /> : null}
        </View>
      ) : null}

      <Pressable onPress={() => setAnonymous((v) => !v)} accessibilityRole="switch" accessibilityState={{ checked: anonymous }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.md, backgroundColor: c.card, borderWidth: 1, borderColor: c.line }}>
        <Ionicons name="eye-off-outline" size={22} color={c.primary} />
        <View style={{ flex: 1 }}>
          <Text style={s.title}>{t('askAnonymously')}</Text>
          <Text style={s.small}>{t('anonymousHint')}</Text>
        </View>
        <Switch value={anonymous} onValueChange={setAnonymous} trackColor={{ true: c.primary }} />
      </Pressable>

      <Pressable onPress={() => router.push('/info?page=terms')} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }} accessibilityRole="link">
        <Ionicons name="shield-checkmark-outline" size={18} color={c.muted} />
        <Text style={[s.small, { flex: 1, lineHeight: 19 }]}>{t('rulesNotice')} <Text style={{ color: c.primary, fontWeight: '600' }}>{t('readRules')}</Text></Text>
      </Pressable>
      <Button title={busy && media ? t('uploading') : t('postQuestion')} icon="paper-plane" onPress={publish} loading={busy} disabled={!valid} />
    </Screen>
  );
}
