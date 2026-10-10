// Share a question: as a branded image (Instagram / Snapchat / Facebook / WhatsApp stories) or as a link with a rich preview.
// Uses the phone's own share sheet — the user chooses where to post; nothing is posted on their behalf.
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Share, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { Button } from './ui';
import { useApp } from '../context/AppProvider';
import { questionLink } from '../lib/share';
import { Linking } from 'react-native';
import { linkedInShareUrl } from '../lib/linkedin';

// 9:16 story card
function StoryCard({ post, catName, t }) {
  const color = post.category.color;
  return (
    <View style={{ width: 270, height: 480, borderRadius: 24, overflow: 'hidden', backgroundColor: '#0E7490', padding: 22, justifyContent: 'space-between' }}>
      <View style={{ position: 'absolute', width: 300, height: 300, borderRadius: 150, backgroundColor: '#1590A8', top: -120, right: -120 }} />
      <Text style={{ color: '#fff', fontSize: 26, fontWeight: '700', textAlign: 'left' }}>Query<Text style={{ color: '#F5A623' }}>{'\u200E?'}</Text></Text>
      <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 18, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
          <Text style={{ color: '#475569', fontSize: 12, fontWeight: '600' }}>{catName(post.category)}</Text>
        </View>
        {post.review ? <Text style={{ color: '#F5A623', fontSize: 18 }}>{'★'.repeat(post.review.rating)}{'☆'.repeat(5 - post.review.rating)}  <Text style={{ color: '#15202B', fontSize: 14, fontWeight: '700' }}>{post.review.productName}</Text></Text> : null}
        <Text style={{ color: '#15202B', fontSize: 19, fontWeight: '700', lineHeight: 30, textAlign: 'left' }} numberOfLines={7}>{post.content || post.review?.productName || ''}</Text>
        <Text style={{ color: '#65758A', fontSize: 12 }}>💬 {post.commentCount} · ❤ {post.likeCount}</Text>
      </View>
      <View style={{ backgroundColor: '#F5A623', borderRadius: 14, paddingVertical: 11, alignItems: 'center' }}>
        <Text style={{ color: '#15202B', fontWeight: '700', fontSize: 15 }}>{t('answerOnQuery')} →</Text>
      </View>
    </View>
  );
}

export default function ShareModal({ post, visible, onClose }) {
  const { t, catName, colors: c } = useApp();
  const card = useRef(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  if (!post) return null;
  const link = questionLink(post.id);
  const message = `${(post.content || post.review?.productName || '').slice(0, 200)}\n\n${t('answerOnQuery')}: ${link}`;

  const shareImage = async () => {
    setBusy(true);
    try {
      const uri = await captureRef(card, { format: 'png', quality: 1, width: 1080, height: 1920 });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: t('shareQuestion'), UTI: 'public.png' });
      Clipboard.setStringAsync(link).catch(() => {}); // so people can paste the link as a sticker/caption
    } finally { setBusy(false); }
  };
  const shareLink = () => Share.share({ message, url: link }).catch(() => {});
  const copy = async () => { await Clipboard.setStringAsync(link); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} onPress={onClose} accessibilityLabel={t('cancel')} />
      <SafeAreaView edges={['bottom']} style={{ backgroundColor: c.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ flex: 1, color: c.ink, fontSize: 17, fontWeight: '700', textAlign: 'left' }}>{t('shareQuestion')}</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel={t('cancel')}><Ionicons name="close" size={24} color={c.muted} /></Pressable>
        </View>
        <View style={{ alignItems: 'center' }}>
          <View ref={card} collapsable={false}><StoryCard post={post} catName={catName} t={t} /></View>
        </View>
        <Text style={{ color: c.muted, fontSize: 12, textAlign: 'center' }}>{t('shareHint')}</Text>
        <Button icon="image-outline" title={t('shareAsImage')} onPress={shareImage} loading={busy} />
        <Button variant="soft" icon="logo-linkedin" title={t('shareLinkedIn')} onPress={() => Linking.openURL(linkedInShareUrl(link)).catch(() => {})} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button style={{ flex: 1 }} variant="soft" icon="link-outline" title={t('shareLink')} onPress={shareLink} />
          <Button style={{ flex: 1 }} variant="soft" icon={copied ? 'checkmark' : 'copy-outline'} title={copied ? t('linkCopied') : t('copyLink')} onPress={copy} />
        </View>
        {busy ? <ActivityIndicator color={c.primary} /> : null}
      </SafeAreaView>
    </Modal>
  );
}
