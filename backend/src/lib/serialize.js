// Turns DB rows into API objects. Media paths are stored as file names and expanded to full URLs here.
const { all, one } = require('../db');

const mediaUrl = (base, name) => (name ? (/^https?:\/\//.test(name) ? name : `${base}/uploads/${name}`) : null);

const linkedinVerified = (uid) => !!one("SELECT 1 FROM user_identities WHERE user_id = ? AND provider = 'linkedin'", uid);
const user = (u, base) => u && ({
  id: u.id, name: u.name, avatarUrl: mediaUrl(base, u.avatar_url), bio: u.bio || '',
  linkedinUrl: u.linkedin_url || null, linkedinVerified: linkedinVerified(u.id),
});

const me = (u, base) => ({
  ...user(u, base), email: u.email, language: u.language, theme: u.theme, isAdmin: !!u.is_admin, createdAt: u.created_at,
  hasPassword: !String(u.password_hash || '').startsWith('social$'),
  unreadNotifications: one('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0', u.id).n,
});

const category = (c) => c && ({
  id: c.id, key: c.key, nameAr: c.name_ar, nameEn: c.name_en, nameTr: c.name_tr, nameEs: c.name_es, icon: c.icon, color: c.color,
  postCount: c.post_count, subscribed: c.subscribed === undefined ? undefined : !!c.subscribed,
});

// Base SELECT for posts with author, category and counters for a given viewer
const POST_SELECT = `
SELECT p.*, u.name AS u_name, u.avatar_url AS u_avatar, u.bio AS u_bio, u.linkedin_url AS u_linkedin,
  EXISTS(SELECT 1 FROM user_identities i WHERE i.user_id = p.user_id AND i.provider = 'linkedin') AS u_li_verified,
  c.key AS c_key, c.name_ar AS c_name_ar, c.name_en AS c_name_en, c.name_tr AS c_name_tr, c.name_es AS c_name_es, c.icon AS c_icon, c.color AS c_color,
  (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) AS like_count,
  (SELECT COUNT(*) FROM comments cm WHERE cm.post_id = p.id AND cm.hidden = 0) AS comment_count,
  EXISTS(SELECT 1 FROM likes l WHERE l.post_id = p.id AND l.user_id = $viewer) AS liked,
  EXISTS(SELECT 1 FROM bookmarks b WHERE b.post_id = p.id AND b.user_id = $viewer) AS bookmarked
FROM posts p JOIN users u ON u.id = p.user_id JOIN categories c ON c.id = p.category_id`;

function attachPolls(rows, viewerId) {
  const polls = rows.filter((r) => r.type === 'POLL').map((r) => r.id);
  if (!polls.length) return {};
  const ph = polls.map(() => '?').join(',');
  const opts = all(`SELECT o.id, o.post_id, o.text, o.sort, (SELECT COUNT(*) FROM poll_votes v WHERE v.option_id = o.id) AS votes
    FROM poll_options o WHERE o.post_id IN (${ph}) ORDER BY o.sort`, ...polls);
  const mine = viewerId ? all(`SELECT post_id, option_id FROM poll_votes WHERE user_id = ? AND post_id IN (${ph})`, viewerId, ...polls) : [];
  const out = {};
  for (const pid of polls) {
    const options = opts.filter((o) => o.post_id === pid).map((o) => ({ id: o.id, text: o.text, votes: o.votes }));
    const v = mine.find((m) => m.post_id === pid);
    out[pid] = { options, total: options.reduce((a, o) => a + o.votes, 0), myVote: v ? v.option_id : null };
  }
  return out;
}

function posts(rows, viewerId, base) {
  const polls = attachPolls(rows, viewerId);
  return rows.map((p) => {
    const mine = p.user_id === viewerId;
    return {
      id: p.id, type: p.type, content: p.content, mediaUrl: mediaUrl(base, p.media_url),
      location: p.lat != null ? { lat: p.lat, lng: p.lng, name: p.place_name || '' } : null,
      category: { id: p.category_id, key: p.c_key, nameAr: p.c_name_ar, nameEn: p.c_name_en, nameTr: p.c_name_tr, nameEs: p.c_name_es, icon: p.c_icon, color: p.c_color },
      // Health & law answers are not professional advice — the app shows a note
      advisory: p.c_key === 'health' || p.c_key === 'law' ? p.c_key : null,
      lostFound: p.lf_kind ? { kind: p.lf_kind, resolved: !!p.resolved } : null,
      review: p.product_key ? { productName: p.product_name, productKey: p.product_key, store: p.store, price: p.price, rating: p.rating, pros: p.pros || '', cons: p.cons || '' } : null,
      // Anonymous questions never expose the author to others
      author: p.is_anonymous && !mine ? null : { id: p.user_id, name: p.u_name, avatarUrl: mediaUrl(base, p.u_avatar), linkedinUrl: p.u_linkedin || null, linkedinVerified: !!p.u_li_verified },
      job: p.job_title ? { title: p.job_title, company: p.job_company || '', city: p.job_city || '', type: p.job_type || null, applyUrl: p.apply_url || null } : null,
      isAnonymous: !!p.is_anonymous, isMine: mine,
      likeCount: p.like_count, commentCount: p.comment_count, liked: !!p.liked, bookmarked: !!p.bookmarked,
      bestCommentId: p.best_comment_id || null, poll: polls[p.id] || null,
      distanceKm: p.distance_km, createdAt: p.created_at,
    };
  });
}

function comment(c, viewerId, postOwnerId, base) {
  return {
    id: c.id, postId: c.post_id, content: c.content, createdAt: c.created_at, updatedAt: c.updated_at,
    author: { id: c.user_id, name: c.u_name, avatarUrl: mediaUrl(base, c.u_avatar), linkedinUrl: c.u_linkedin || null, linkedinVerified: !!c.u_li_verified },
    isMine: c.user_id === viewerId, canDelete: c.user_id === viewerId || postOwnerId === viewerId,
  };
}

module.exports = { user, me, category, posts, comment, POST_SELECT, mediaUrl };
