import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text, TextInput } from '../../src/components/Text';
import { ActionSheet, Avatar, Button, Empty, ErrorBanner, Loading, useStyles } from '../../src/components/ui';
import { LinkedInBadge, PostActions, PostBody, PostHeader, toggleLike, usePostMenu } from '../../src/components/PostCard';
import { useApp } from '../../src/context/AppProvider';
import { api } from '../../src/api/client';
import { timeAgo } from '../../src/lib/time';
import { maybeAskForReview } from '../../src/lib/growth';
import { Modal } from 'react-native';

function Answer({ a, best, onMenu }) {
  const { t, lang, colors: c } = useApp();
  const s = useStyles();
  return (
    <View style={[s.card, { gap: 8 }, best && { borderColor: c.success, borderWidth: 1.5 }]}>
      {best ? (
        <View style={[s.row, { gap: 6 }]}>
          <Ionicons name="checkmark-done-circle" size={18} color={c.success} />
          <Text style={{ color: c.success, fontWeight: '700', fontSize: 13 }}>{t('bestAnswer')}</Text>
        </View>
      ) : null}
      <View style={[s.row, { gap: 10 }]}>
        <Pressable onPress={() => !a.isMine && router.push(`/user/${a.author.id}`)}><Avatar uri={a.author.avatarUrl} name={a.author.name} size={32} /></Pressable>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><Text style={s.title}>{a.author.name}</Text><LinkedInBadge author={a.author} /></View>
          <Text style={s.small}>{timeAgo(a.createdAt, t, lang)}{a.updatedAt ? ` · ${t('edited')}` : ''}</Text>
        </View>
        <Pressable onPress={() => onMenu(a)} hitSlop={12} accessibilityLabel={t('more')}><Ionicons name="ellipsis-horizontal" size={18} color={c.muted} /></Pressable>
      </View>
      <Text style={s.body}>{a.content}</Text>
    </View>
  );
}

export default function PostScreen() {
  const { id, justPosted } = useLocalSearchParams();
  const [prompt, setPrompt] = useState(!!justPosted);
  const navigation = useNavigation();
  const { t, errText, colors: c, catName, isRTL } = useApp();
  const s = useStyles();
  const [post, setPost] = useState(null);
  const [answers, setAnswers] = useState(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(null);
  const [sending, setSending] = useState(false);
  const [menuFor, setMenuFor] = useState(null);
  const [reportFor, setReportFor] = useState(null);

  const loadAnswers = useCallback(async (p = 1) => {
    const r = await api.get(`/posts/${id}/comments?page=${p}`);
    setAnswers((prev) => (p === 1 ? r.items : [...(prev || []), ...r.items]));
    setPage(p); setHasMore(r.hasMore);
  }, [id]);
  const load = useCallback(async () => {
    try { setPost(await api.get(`/posts/${id}`)); await loadAnswers(1); setError(''); } catch (e) { setError(errText(e)); if (e.status === 404) setPost(false); }
  }, [id, loadAnswers, errText]);
  useEffect(() => { load(); }, [load]);

  const { openMenu, openShare, sheets, toggleBookmark } = usePostMenu(post || { id }, {
    onChange: setPost, onRemoved: () => router.back(),
  });
  useEffect(() => {
    navigation.setOptions({
      title: post ? catName(post.category) : '',
      headerRight: post ? () => <Pressable onPress={openMenu} hitSlop={10} style={{ marginHorizontal: 12 }}><Ionicons name="ellipsis-horizontal-circle-outline" size={24} color={c.ink} /></Pressable> : undefined,
    });
  }, [navigation, post, openMenu, c, catName]);

  if (post === false) return <Empty icon="alert-circle-outline" title={t('noResults')} />;
  if (!post) return error ? <View style={{ padding: 16, backgroundColor: c.bg, flex: 1 }}><ErrorBanner text={error} onRetry={load} /></View> : <Loading />;

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setSending(true);
    try {
      if (editing) {
        const upd = await api.patch(`/comments/${editing}`, { content: body });
        setAnswers((l) => l.map((x) => (x.id === upd.id ? upd : x)));
        setEditing(null);
      } else {
        const a = await api.post(`/posts/${post.id}/comments`, { content: body });
        setAnswers((l) => [...(l || []), a]);
        setPost((p) => ({ ...p, commentCount: p.commentCount + 1 }));
      }
      setText('');
    } catch (e) { Alert.alert(t('error'), errText(e)); } finally { setSending(false); }
  };

  const setBest = async (a) => {
    try {
      const upd = await api.post(`/posts/${post.id}/best`, { commentId: post.bestCommentId === a.id ? null : a.id });
      setPost(upd); await loadAnswers(1);
      if (upd.bestCommentId) maybeAskForReview(); // a happy moment
    } catch (e) { Alert.alert(t('error'), errText(e)); }
  };
  const delAnswer = (a) => Alert.alert(t('delete'), t('deleteAnswerConfirm'), [
    { text: t('cancel'), style: 'cancel' },
    { text: t('delete'), style: 'destructive', onPress: async () => {
      try {
        await api.del(`/comments/${a.id}`);
        setAnswers((l) => l.filter((x) => x.id !== a.id));
        setPost((p) => ({ ...p, commentCount: p.commentCount - 1, bestCommentId: p.bestCommentId === a.id ? null : p.bestCommentId }));
      } catch (e) { Alert.alert(t('error'), errText(e)); }
    } },
  ]);
  const report = async (a, reason) => { try { await api.post(`/comments/${a.id}/report`, { reason }); Alert.alert(t('reported')); } catch (e) { Alert.alert(t('error'), errText(e)); } };
  const block = (a) => Alert.alert(t('blockUser'), t('blockConfirm'), [
    { text: t('cancel'), style: 'cancel' },
    { text: t('block'), style: 'destructive', onPress: async () => { await api.post(`/users/${a.author.id}/block`).catch(() => {}); loadAnswers(1); } },
  ]);
  const vote = async (optionId) => { try { setPost(await api.post(`/posts/${post.id}/vote`, { optionId })); } catch (e) { Alert.alert(t('error'), errText(e)); } };

  const a = menuFor;
  const menuOptions = a ? [
    post.isMine && { label: post.bestCommentId === a.id ? t('unmarkBest') : t('markBest'), icon: 'trophy-outline', onPress: () => setBest(a) },
    a.isMine && { label: t('edit'), icon: 'create-outline', onPress: () => { setEditing(a.id); setText(a.content); } },
    !a.isMine && { label: t('report'), icon: 'flag-outline', onPress: () => setReportFor(a) },
    !a.isMine && { label: t('blockUser'), icon: 'ban-outline', onPress: () => block(a), danger: true },
    a.canDelete && { label: t('delete'), icon: 'trash-outline', onPress: () => delAnswer(a), danger: true },
  ] : [];

  const header = (
    <View style={{ gap: 14, marginBottom: 6 }}>
      <View style={[s.card, { gap: 12 }]}>
        <PostHeader post={post} />
        <PostBody post={post} full onVote={vote} />
        <PostActions post={post} onLike={() => toggleLike(post, setPost)} onBookmark={toggleBookmark} onShare={openShare} />
        {post.isMine && post.lostFound ? (
          <Button small variant={post.lostFound.resolved ? 'ghost' : 'primary'} icon={post.lostFound.resolved ? 'refresh' : 'checkmark-done'}
            title={post.lostFound.resolved ? t('lfReopen') : post.lostFound.kind === 'LOST' ? t('lfMarkLost') : t('lfMarkFound')}
            onPress={async () => { try { setPost(await api.post(`/posts/${post.id}/resolve`, { resolved: !post.lostFound.resolved })); } catch (e) { Alert.alert(t('error'), errText(e)); } }} />
        ) : null}
      </View>
      <Text style={s.h2}>{post.commentCount} {t('answers')}</Text>
    </View>
  );

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
        <FlatList
          contentContainerStyle={{ padding: 16, gap: 10 }}
          data={answers || []}
          keyExtractor={(x) => x.id}
          ListHeaderComponent={header}
          renderItem={({ item }) => <Answer a={item} best={post.bestCommentId === item.id} onMenu={setMenuFor} />}
          ListEmptyComponent={answers === null ? <ActivityIndicator color={c.primary} /> : <Empty icon="chatbubble-ellipses-outline" title={t('noAnswers')} />}
          onEndReached={() => hasMore && loadAnswers(page + 1)}
          onEndReachedThreshold={0.5}
          keyboardShouldPersistTaps="handled"
        />
        {editing ? (
          <View style={[s.row, { paddingHorizontal: 14, paddingTop: 8, backgroundColor: c.card }]}>
            <Ionicons name="create-outline" size={16} color={c.primary} />
            <Text style={[s.small, { flex: 1 }]}>{t('edit')}</Text>
            <Pressable onPress={() => { setEditing(null); setText(''); }} hitSlop={8}><Ionicons name="close" size={18} color={c.muted} /></Pressable>
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, backgroundColor: c.card, borderTopWidth: editing ? 0 : 1, borderColor: c.line }}>
          <TextInput value={text} onChangeText={setText} placeholder={t('writeAnswer')} placeholderTextColor={c.muted} multiline maxLength={2000}
            style={{ flex: 1, maxHeight: 130, backgroundColor: c.bg, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: c.ink, textAlign: 'left' }} />
          <Pressable onPress={send} disabled={!text.trim() || sending} accessibilityLabel={t('send')}
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: text.trim() ? c.primary : c.line, alignItems: 'center', justifyContent: 'center' }}>
            {sending ? <ActivityIndicator color="#fff" /> : <Ionicons name={editing ? 'checkmark' : 'send'} size={19} color="#fff" style={{ transform: [{ scaleX: isRTL && !editing ? -1 : 1 }] }} />}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
      {sheets}
      <ActionSheet visible={!!menuFor} onClose={() => setMenuFor(null)} options={menuOptions} />
      <Modal visible={prompt} transparent animationType="fade" onRequestClose={() => setPrompt(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: c.card, borderRadius: 22, padding: 20, gap: 12, alignItems: 'center' }}>
            <Text style={{ fontSize: 40 }}>🚀</Text>
            <Text style={[s.h2, { textAlign: 'center' }]}>{t('sharePromptTitle')}</Text>
            <Text style={[s.muted, { textAlign: 'center', lineHeight: 22 }]}>{t('sharePromptBody')}</Text>
            <Button style={{ alignSelf: 'stretch' }} icon="share-social" title={t('shareNow')} onPress={() => { setPrompt(false); setTimeout(openShare, 300); }} />
            <Button style={{ alignSelf: 'stretch' }} variant="ghost" title={t('later')} onPress={() => setPrompt(false)} />
          </View>
        </View>
      </Modal>
      <ActionSheet visible={!!reportFor} onClose={() => setReportFor(null)} title={t('reportReason')} options={reportFor ? [
        { label: t('reportSexual'), icon: 'eye-off-outline', onPress: () => report(reportFor, 'sexual') },
        { label: t('reportReligion'), icon: 'book-outline', onPress: () => report(reportFor, 'religion') },
        { label: t('reportAbuse'), icon: 'hand-left-outline', onPress: () => report(reportFor, 'abuse') },
        { label: t('reportSpam'), icon: 'megaphone-outline', onPress: () => report(reportFor, 'spam') },
        { label: t('reportOther'), icon: 'ellipsis-horizontal', onPress: () => report(reportFor, 'other') },
      ] : []} />
    </SafeAreaView>
  );
}
