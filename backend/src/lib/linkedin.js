// Post to the Query company page on LinkedIn (Community Management API — needs LinkedIn's approval).
// Off until LINKEDIN_ORG_ID and LINKEDIN_ORG_TOKEN are set.
const { one, run } = require('../db');

const configured = () => !!(process.env.LINKEDIN_ORG_ID && process.env.LINKEDIN_ORG_TOKEN);

// Best recent career-related question (jobs, tech, education, law, marketing) not shared on LinkedIn yet
function pickProfessionalQuestion() {
  return one(`SELECT p.* FROM posts p JOIN categories c ON c.id = p.category_id
    WHERE p.hidden = 0 AND p.is_anonymous = 0 AND c.key IN ('money','tech','education','law','marketing','gov') AND length(p.content) >= 10
      AND p.created_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-7 days')
      AND p.id NOT IN (SELECT post_id FROM meta_shares WHERE channel = 'linkedin')
    ORDER BY (SELECT COUNT(*) FROM comments m WHERE m.post_id = p.id AND m.hidden = 0) * 2 + (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) DESC, p.created_at DESC LIMIT 1`);
}

async function shareToLinkedIn(base) {
  if (!configured()) return { skipped: 'NOT_CONFIGURED' };
  const p = pickProfessionalQuestion();
  if (!p) return { skipped: 'NO_QUESTION' };
  const link = `${base}/q/${p.id}`;
  const text = `💼 ${p.job_title ? `${p.job_title}${p.job_company ? ` — ${p.job_company}` : ''}\n` : ''}${p.content.slice(0, 1200)}\n\nShare your experience on Query 👇\n${link}\n\n#Query #Careers #Jobs`;
  const res = await fetch(`${process.env.LINKEDIN_API_URL || 'https://api.linkedin.com'}/rest/posts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.LINKEDIN_ORG_TOKEN}`, 'Content-Type': 'application/json',
      'LinkedIn-Version': process.env.LINKEDIN_VERSION || '202409', 'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      author: `urn:li:organization:${process.env.LINKEDIN_ORG_ID}`, commentary: text, visibility: 'PUBLIC',
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
      content: { article: { source: link, title: (p.job_title || p.content).slice(0, 200) } },
      lifecycleState: 'PUBLISHED', isReshareDisabledByAuthor: false,
    }),
  });
  if (!res.ok) throw new Error(`LinkedIn ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const postUrn = res.headers.get('x-restli-id') || 'posted';
  run('INSERT OR REPLACE INTO meta_shares (post_id, channel, external_id) VALUES (?,?,?)', p.id, 'linkedin', postUrn);
  return { postId: p.id, linkedin: postUrn };
}

module.exports = { configured, shareToLinkedIn, pickProfessionalQuestion };
