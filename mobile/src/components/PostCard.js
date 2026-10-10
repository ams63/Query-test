import React, { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { useApp } from '../context/AppProvider';
import { api } from '../api/client';
import { ActionSheet, Avatar, Card, useStyles } from './ui';
import { AudioBox, ImageBox, LocationBox, PollBox, VideoBox, VideoPoster } from './Media';
import ShareModal from './ShareModal';
import { ReviewBox } from './Review';
import { Linking as RNLinking } from 'react-native';
import { timeAgo } from '../lib/time';

const TYPE_ICON = { TEXT: 'document-text-outline', IMAGE: 'image-outline', VIDEO: 'videocam-outline', AUDIO: 'mic-outline', LOCATION: 'location-outline', POLL: 'stats-chart-outline' };

// Menu + report + block + delete, shared by the card and the question page
export function usePostMenu(post, { onChange, onRemoved }) {
  const { t, errText } = useApp();
  const [open, setOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const run = async (fn) => { try { await fn(); } catch (e) { Alert.alert(t('error'), errText(e)); } };
  const toggleBookmark = () => run(async () => onChange(post.bookmarked ? await api.del(`/posts/${post.id}/bookmark`) : await api.post(`/posts/${post.id}/bookmark`)));
  const share = () => setShareOpen(true);
  const del = () => Alert.alert(t('deletePost'), t('deletePostConfirm'), [
    { text: t('cancel'), style: 'cancel' },
    { text: t('delete'), style: 'destructive', onPress: () => run(async () => { await api.del(`/posts/${post.id}`); onRemoved && onRemoved(post.id); }) },
  ]);
  const block = () => Alert.alert(t('blockUser'), t('blockConfirm'), [
    { text: t('cancel'), style: 'cancel' },
    { text: t('block'), style: 'destructive', onPress: () => run(async () => { await api.post(`/posts/${post.id}/block-author`); Alert.alert(t('blocked')); onRemoved && onRemoved(post.id, true); }) },
  ]);
  const report = (reason) => run(async () => { await api.post(`/posts/${post.id}/report`, { reason }); Alert.alert(t('reported')); });

  const sheets = (
    <>
      <ShareModal post={post} visible={shareOpen} onClose={() => setShareOpen(false)} />
      <ActionSheet visible={open} onClose={() => setOpen(false)} options={[
        { label: post.bookmarked ? t('removeBookmark') : t('bookmark'), icon: post.bookmarked ? 'bookmark' : 'bookmark-outline', onPress: toggleBookmark },
        { label: t('share'), icon: 'share-social-outline', onPress: share },
        !post.isMine && { label: t('report'), icon: 'flag-outline', onPress: () => setReportOpen(true) },
        !post.isMine && { label: t('blockUser'), icon: 'ban-outline', onPress: block, danger: true },
        post.isMine && { label: t('deletePost'), icon: 'trash-outline', onPress: del, danger: true },
      ]} />
      <ActionSheet visible={reportOpen} onClose={() => setReportOpen(false)} title={t('reportReason')} options={[
        { label: t('reportSexual'), icon: 'eye-off-outline', onPress: () => report('sexual') },
        { label: t('reportReligion'), icon: 'book-outline', onPress: () => report('religion') },
        { label: t('reportSpam'), icon: 'megaphone-outline', onPress: () => report('spam') },
        { label: t('reportAbuse'), icon: 'hand-left-outline', onPress: () => report('abuse') },
        { label: t('reportWrong'), icon: 'alert-circle-outline', onPress: () => report('misleading') },
        { label: t('reportOther'), icon: 'ellipsis-horizontal', onPress: () => report('other') },
      ]} />
    </>
  );
  return { openMenu: () => setOpen(true), openShare: share, sheets, toggleBookmark };
}

// LinkedIn icon next to a name: blue check when the account is connected; tap opens their LinkedIn profile
export function LinkedInBadge({ author }) {
  const { t } = useApp();
  if (!author || (!author.linkedinUrl && !author.linkedinVerified)) return null;
  return (
    <Pressable onPress={() => author.linkedinUrl && RNLinking.openURL(author.linkedinUrl).catch(() => {})} hitSlop={8}
      accessibilityLabel={author.linkedinVerified ? t('linkedinVerified') : 'LinkedIn'} style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Ionicons name="logo-linkedin" size={15} color="#0A66C2" />
      {author.linkedinVerified ? <Ionicons name="checkmark-circle" size={11} color="#0A66C2" style={{ marginStart: -3, marginTop: 8 }} /> : null}
    </Pressable>
  );
}

const JOB_ICON = { FULL_TIME: 'briefcase', PART_TIME: 'time', REMOTE: 'home', FREELANCE: 'laptop', INTERNSHIP: 'school' };
export function JobBox({ job }) {
  const { t, colors: c } = useApp();
  return (
    <View style={{ gap: 8, padding: 12, borderRadius: 16, backgroundColor: c.soft }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="briefcase" size={18} color={c.primary} />
        <Text style={{ flex: 1, color: c.ink, fontSize: 16, fontWeight: '700', textAlign: 'left' }}>{job.title}</Text>
        <Text style={{ color: '#fff', backgroundColor: c.primary, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, fontSize: 11, fontWeight: '700', overflow: 'hidden' }}>{t('postKindJob')}</Text>
      </View>
      {job.company || job.city ? <Text style={{ color: c.muted, textAlign: 'left' }}>{[job.company, job.city].filter(Boolean).join(' · ')}</Text> : null}
      {job.type ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name={JOB_ICON[job.type] || 'briefcase'} size={14} color={c.muted} />
          <Text style={{ color: c.ink, fontSize: 13 }}>{t(`jt_${job.type}`)}</Text>
        </View>
      ) : null}
      {job.applyUrl ? (
        <Pressable onPress={() => RNLinking.openURL(job.applyUrl).catch(() => {})} accessibilityRole="link"
          style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, backgroundColor: c.primary }}>
          <Ionicons name={/linkedin\.com/i.test(job.applyUrl) ? 'logo-linkedin' : 'open-outline'} size={16} color="#fff" />
          <Text style={{ color: '#fff', fontWeight: '700' }}>{t('applyNow')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function AdvisoryNote({ kind }) {
  const { t, colors: c } = useApp();
  if (!kind) return null;
  return (
    <View style={{ flexDirection: 'row', gap: 8, padding: 10, borderRadius: 12, backgroundColor: c.dark ? '#2A2410' : '#FFFBEB', borderWidth: 1, borderColor: c.dark ? '#4A3F14' : '#FDE68A' }}>
      <Ionicons name={kind === 'health' ? 'medkit-outline' : 'scale-outline'} size={16} color="#B45309" />
      <Text style={{ flex: 1, color: c.ink, fontSize: 12, lineHeight: 18, textAlign: 'left' }}>{t(`advisory_${kind}`)}</Text>
    </View>
  );
}

export function PostHeader({ post, onMenu }) {
  const { t, lang, catName, colors: c } = useApp();
  const s = useStyles();
  const anon = !post.author;
  const openAuthor = () => { if (post.author && !post.isMine) router.push(`/user/${post.author.id}`); };
  return (
    <View style={[s.row, { gap: 10 }]}>
      <Pressable onPress={openAuthor} disabled={anon}><Avatar uri={post.author && post.author.avatarUrl} name={post.author && post.author.name} anonymous={anon} size={38} /></Pressable>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Text style={[s.title, { flexShrink: 1 }]} numberOfLines={1}>{anon ? t('anonymous') : post.author.name}{post.isAnonymous && post.isMine ? ` · ${t('anonymous')}` : ''}</Text>
          {!anon ? <LinkedInBadge author={post.author} /> : null}
        </View>
        <View style={[s.row, { gap: 6 }]}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: post.category.color }} />
          <Text style={s.small}>{catName(post.category)} · {timeAgo(post.createdAt, t, lang)}</Text>
          <Ionicons name={TYPE_ICON[post.type]} size={13} color={c.muted} />
        </View>
      </View>
      {onMenu ? <Pressable onPress={onMenu} hitSlop={12} accessibilityLabel={t('more')}><Ionicons name="ellipsis-horizontal" size={20} color={c.muted} /></Pressable> : null}
    </View>
  );
}

export function LostFoundBadge({ lf }) {
  const { t, colors: c } = useApp();
  if (!lf) return null;
  const color = lf.resolved ? c.success : lf.kind === 'LOST' ? c.danger : c.primary;
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: `${color}1F` }}>
        <Ionicons name={lf.resolved ? 'checkmark-circle' : lf.kind === 'LOST' ? 'help-buoy' : 'hand-left'} size={14} color={color} />
        <Text style={{ color, fontSize: 12, fontWeight: '700' }}>{lf.resolved ? t('lfResolvedBadge') : lf.kind === 'LOST' ? t('lfLostBadge') : t('lfFoundBadge')}</Text>
      </View>
    </View>
  );
}

export function PostBody({ post, full, onVote }) {
  const s = useStyles();
  return (
    <View style={{ gap: 10 }}>
      <LostFoundBadge lf={post.lostFound} />
      {post.review ? <ReviewBox review={post.review} compact={!full} /> : null}
      {post.job ? <JobBox job={post.job} /> : null}
      {post.content ? <Text style={[s.body, !full && { fontSize: 16 }]} numberOfLines={full ? undefined : 5}>{post.content}</Text> : null}
      {post.type === 'IMAGE' && post.mediaUrl ? <ImageBox uri={post.mediaUrl} height={full ? 300 : 210} /> : null}
      {post.type === 'VIDEO' && post.mediaUrl ? (full ? <VideoBox uri={post.mediaUrl} /> : <VideoPoster onPress={() => router.push(`/post/${post.id}`)} />) : null}
      {post.type === 'AUDIO' && post.mediaUrl ? <AudioBox uri={post.mediaUrl} /> : null}
      {post.type === 'LOCATION' && post.location ? <LocationBox location={post.location} compact={!full} /> : null}
      {post.type === 'POLL' && post.poll ? <PollBox poll={post.poll} onVote={onVote} showResults={post.isMine} /> : null}
      {full ? <AdvisoryNote kind={post.advisory} /> : null}
    </View>
  );
}

export function PostActions({ post, onLike, onBookmark, onShare }) {
  const { t, colors: c } = useApp();
  const Btn = ({ icon, label, color, onPress, a11y }) => (
    <Pressable onPress={onPress} hitSlop={8} accessibilityLabel={a11y} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4 }}>
      <Ionicons name={icon} size={20} color={color || c.muted} />
      {label !== undefined ? <Text style={{ color: color || c.muted, fontSize: 13, fontWeight: '600' }}>{label}</Text> : null}
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20, paddingTop: 4 }}>
      <Btn icon={post.liked ? 'heart' : 'heart-outline'} color={post.liked ? c.danger : undefined} label={post.likeCount} onPress={onLike} a11y={t('likes')} />
      <Btn icon="chatbubble-outline" label={post.commentCount} onPress={() => router.push(`/post/${post.id}`)} a11y={t('answers')} />
      {post.bestCommentId ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Ionicons name="checkmark-done-circle" size={18} color={c.success} /><Text style={{ color: c.success, fontSize: 12, fontWeight: '600' }}>{t('bestAnswer')}</Text></View> : null}
      <View style={{ flex: 1 }} />
      {onShare ? <Btn icon="share-social-outline" onPress={onShare} a11y={t('share')} /> : null}
      <Btn icon={post.bookmarked ? 'bookmark' : 'bookmark-outline'} color={post.bookmarked ? c.primary : undefined} onPress={onBookmark} a11y={t('bookmark')} />
    </View>
  );
}

// Optimistic like helper
export async function toggleLike(post, update) {
  const optimistic = { ...post, liked: !post.liked, likeCount: post.likeCount + (post.liked ? -1 : 1) };
  update(optimistic);
  try { update(post.liked ? await api.del(`/posts/${post.id}/like`) : await api.post(`/posts/${post.id}/like`)); } catch { update(post); }
}

export default function PostCard({ post, onChange, onRemoved }) {
  const { errText, t } = useApp();
  const { openMenu, openShare, sheets, toggleBookmark } = usePostMenu(post, { onChange, onRemoved });
  const vote = async (optionId) => { try { onChange(await api.post(`/posts/${post.id}/vote`, { optionId })); } catch (e) { Alert.alert(t('error'), errText(e)); } };
  return (
    <Card onPress={() => router.push(`/post/${post.id}`)} style={{ gap: 12 }}>
      <PostHeader post={post} onMenu={openMenu} />
      <PostBody post={post} onVote={vote} />
      <PostActions post={post} onLike={() => toggleLike(post, onChange)} onBookmark={toggleBookmark} onShare={openShare} />
      {sheets}
    </Card>
  );
}
