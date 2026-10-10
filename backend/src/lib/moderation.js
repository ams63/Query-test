// Automatic content filter. Blocks, before anything is saved:
//   • sexual / pornographic / indecent language   → reason "sexual"
//   • insults against religions, prophets, scripture → reason "religion"
// in Arabic, English, Turkish and Spanish, including common tricks (diacritics, stretched letters,
// spaced-out letters, digit look-alikes). Images/videos can also be checked by an external service
// when SIGHTENGINE_USER / SIGHTENGINE_SECRET are set.
// Word lists live in this file so the team can extend them without touching the routes.
const { HttpError } = require('./http');

// ---------- normalisation ----------
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's' };
function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '') // Latin accents (é → e, ş → s)
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, '') // Arabic tashkeel + tatweel
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .replace(/ı/g, 'i')
    .replace(/[013457@$]/g, (ch) => LEET[ch])
    .replace(/(.)\1{2,}/g, '$1$1'); // "seeeex" → "seex", "سكككس" → "سككس"
}
const tokens = (norm) => norm.split(/[^\p{L}]+/u).filter(Boolean);
// Also catch letters spaced out with dots/spaces ("s.e.x", "س ك س")
const compact = (norm) => norm.replace(/[^\p{L}]+/gu, '');
const dedupe = (w) => w.replace(/(.)\1+/g, '$1');

// ---------- word lists (normalised form) ----------
// Whole-word matches (short or ambiguous words — never matched inside other words)
const SEXUAL_WORDS = [
  // Arabic
  'سكس', 'سكسي', 'اباحي', 'اباحيه', 'اباحيات', 'بورن', 'بورنو', 'نيك', 'نياكه', 'انيك', 'ينيك', 'منيوك', 'منيوكه', 'زب', 'زبي', 'زبر', 'كس', 'كسها', 'كسك',
  'طيز', 'طيزها', 'شرموط', 'شرموطه', 'شراميط', 'قحبه', 'قحاب', 'عاهره', 'عاهرات', 'دعاره', 'مومس', 'بزاز', 'بزازها', 'نهود', 'عاريه', 'عاريات', 'عري', 'متناكه', 'تتناك',
  'مص', 
  // English
  'porn', 'porno', 'pornographic', 'xxx', 'sex', 'sexy', 'sexting', 'nude', 'nudes', 'naked', 'nsfw', 'dick', 'dicks', 'cock', 'cocks', 'pussy', 'pussies', 'cunt',
  'boobs', 'boob', 'tits', 'titties', 'fuck', 'fucking', 'fucked', 'blowjob', 'handjob', 'cum', 'cumshot', 'orgasm', 'masturbate', 'masturbation', 'horny', 'slut', 'whore',
  'hooker', 'onlyfans', 'hentai', 'milf', 'anal', 'dildo', 'erotic', 'fetish', 'bdsm', 'stripper', 'camgirl',
  // Turkish
  'seks', 'seksi', 'pornografik', 'sikis', 'sikiş', 'sik', 'sikmek', 'yarak', 'yarrak', 'amcik', 'orospu', 'kaltak', 'fahise', 'ciplak', 
  'mastürbasyon', 'masturbasyon', 'azgin', 'erotik', 'fetis',
  // Spanish
  'sexo', 'desnuda', 'desnudas', 'desnudo', 'polla', 'pollas', 'verga', 'chocho', 'tetas', 'culo', 'follar', 'follando', 'puta', 'putas', 'zorra',
  'prostituta', 'masturbacion', 'masturbarse', 'mamada', 'cachonda', 'cachondo', 'erotico', 'erotica', 'porn',
].map((w) => normalize(w));

// Phrases / long words that are also searched inside the text with spaces removed
const SEXUAL_PHRASES = [
  'افلام سكس', 'مقاطع اباحيه', 'صور عاريه', 'فيديو سكس', 'مواقع اباحيه', 'sex video', 'sex tape', 'porn hub', 'pornhub', 'xvideos', 'xnxx', 'xhamster', 'redtube',
  'onlyfans', 'send nudes', 'porno izle', 'seks videosu', 'video porno', 'fotos desnuda',
].map((w) => compact(normalize(w)));

// Religion: blocked when an insult appears together with a religious reference, or a known blasphemous phrase
const RELIGIOUS_TERMS = [
  'الله', 'الرب', 'الاله', 'الرسول', 'رسول', 'النبي', 'نبي', 'الانبياء', 'محمد', 'عيسي', 'المسيح', 'موسي', 'ابراهيم', 'مريم', 'الاسلام', 'اسلام', 'المسلمين', 'مسلم',
  'المسيحيه', 'مسيحي', 'المسيحيين', 'اليهوديه', 'يهودي', 'اليهود', 'الدين', 'دين', 'الاديان', 'اديان', 'القران', 'قران', 'الانجيل', 'انجيل', 'التوراه', 'توراه', 'الكعبه',
  'الصلاه', 'الصحابه', 'الشيعه', 'السنه', 'الاقصي', 'الكنيسه', 'المسجد', 'الحج',
  'god', 'allah', 'lord', 'jesus', 'christ', 'prophet', 'prophets', 'muhammad', 'mohammed', 'moses', 'mary', 'islam', 'muslim', 'muslims', 'christianity', 'christian',
  'christians', 'judaism', 'jew', 'jews', 'jewish', 'religion', 'religions', 'quran', 'koran', 'bible', 'torah', 'church', 'mosque', 'kaaba', 'hindu', 'buddha',
  'tanri', 'tanrı', 'peygamber', 'isa', 'musa', 'islam', 'musluman', 'hristiyan', 'yahudi', 'din', 'dinler', 'kuran', 'incil', 'tevrat', 'cami', 'kilise',
  'dios', 'senor', 'jesucristo', 'profeta', 'mahoma', 'islam', 'musulman', 'musulmanes', 'cristiano', 'cristianos', 'judio', 'judios', 'religion', 'religiones', 'coran',
  'biblia', 'iglesia', 'mezquita', 'virgen',
].map((w) => normalize(w));

const INSULTS = [
  'لعن', 'يلعن', 'العن', 'لعنه', 'ملعون', 'تبا', 'حقير', 'حقيره', 'كلب', 'كلاب', 'خنزير', 'خنازير', 'وسخ', 'قذر', 'زباله', 'تافه', 'خرافه', 'خرافات', 'كذاب', 'كذبه',
  'غبي', 'اغبياء', 'متخلف', 'متخلفين', 'ارهابي', 'ارهابيين', 'نجس', 'انجاس', 'سخيف', 'احمق', 'حمقي', 'اهبل', 'حيوان', 'حيوانات', 'قرف', 'اكره', 'نكره', 'يسقط', 'تفو',
  'damn', 'damned', 'curse', 'fuck', 'fucking', 'shit', 'stupid', 'idiot', 'idiots', 'retarded', 'garbage', 'trash', 'pig', 'pigs', 'dog', 'dogs', 'filthy', 'disgusting',
  'terrorist', 'terrorists', 'fake', 'myth', 'hate', 'liar', 'liars', 'scum', 'moron',
  'lanet', 'kahrolsun', 'aptal', 'salak', 'gerizekali', 'pislik', 'domuz', 'kopek', 'terorist', 'yalanci', 'nefret', 'sacma', 'boktan', 'bok',
  'maldito', 'maldita', 'mierda', 'estupido', 'estupida', 'idiota', 'basura', 'cerdo', 'cerdos', 'perro', 'perros', 'asqueroso', 'terrorista', 'terroristas', 'mentira',
  'mentiroso', 'odio', 'farsa',
].map((w) => normalize(w));

const BLASPHEMY_PHRASES = [
  'سب الله', 'سب الدين', 'سب الرب', 'سب الرسول', 'سب النبي', 'يسب الله', 'يسب الدين', 'اسب الله', 'اسب الدين', 'حرق القران', 'احرق القران', 'تمزيق القران', 'الله غير موجود',
  'الدين افيون', 'الاسلام دين ارهاب', 'دين الارهاب',
  'god is dead', 'fuck god', 'fuck islam', 'fuck religion', 'burn the quran', 'burn quran', 'burn the bible', 'religion of terror',
  'allaha sov', 'dinine sov', 'kurani yak', 'dios no existe', 'quemar el coran', 'quemar la biblia',
].map((w) => compact(normalize(w)));

// ---------- matching ----------
const SEX_SET = new Set(SEXUAL_WORDS);
const SEX_DEDUPED = new Set(SEXUAL_WORDS.map(dedupe));
const REL_SET = new Set(RELIGIOUS_TERMS);
const INSULT_SET = new Set(INSULTS);
// Arabic words usually come with a prefix: ال، و، ف، ب، ل، ك (e.g. "والقرآن", "بالدين")
const AR_PREFIX = /^(وال|فال|بال|كال|لل|ال|و|ف|ب|ل|ك)/;
const variants = (tok) => { const v = [tok, dedupe(tok)]; const s = tok.replace(AR_PREFIX, ''); if (s !== tok && s.length >= 2) v.push(s, `ال${s}`); return v; };
const inSet = (set, tok) => variants(tok).some((v) => set.has(v));

function checkText(text) {
  if (!text) return null;
  const norm = normalize(text);
  const toks = tokens(norm);
  const flat = compact(norm);

  // sexual: whole words, multi-word phrases, and spaced-out spellings of longer words
  if (toks.some((t) => inSet(SEX_SET, t) || SEX_DEDUPED.has(dedupe(t)))) return 'sexual';
  const joined = ` ${toks.join(' ')} `;
  if (SEXUAL_WORDS.some((w) => w.includes(' ') && joined.includes(` ${w} `))) return 'sexual';
  if (SEXUAL_PHRASES.some((p) => flat.includes(p))) return 'sexual';
  // letters separated by spaces/dots: "s e x", "س ك س"
  const singles = norm.split(/[^\p{L}]+/u).filter(Boolean);
  for (let i = 0; i < singles.length; i += 1) {
    if (singles[i].length !== 1) continue;
    let run = '';
    let j = i;
    while (j < singles.length && singles[j].length === 1) { run += singles[j]; j += 1; }
    if (run.length >= 3 && (SEX_SET.has(run) || SEX_DEDUPED.has(dedupe(run)))) return 'sexual';
    i = j;
  }

  // religion: explicit blasphemy, or an insult and a religious reference in the same sentence
  if (BLASPHEMY_PHRASES.some((p) => flat.includes(p))) return 'religion';
  for (const sentence of norm.split(/[.!?؟\n،,;]+/)) {
    const st = tokens(sentence);
    if (st.some((t) => inSet(REL_SET, t)) && st.some((t) => inSet(INSULT_SET, t))) return 'religion';
  }
  return null;
}

// Throws 422 CONTENT_REJECTED if any of the given texts break the rules
function assertClean(...texts) {
  for (const t of texts.flat()) {
    const reason = checkText(t);
    if (reason) throw new HttpError(422, 'CONTENT_REJECTED', { reason });
  }
}

// Optional image/video check with Sightengine (https://sightengine.com). Fails open if the service is down,
// because every post can still be reported and reviewed.
async function checkMedia(file, kind) {
  const user = process.env.SIGHTENGINE_USER;
  const secret = process.env.SIGHTENGINE_SECRET;
  if (!user || !secret || kind === 'audio') return null;
  try {
    const fd = new FormData();
    fd.append('media', new Blob([file.data], { type: file.mimetype }), file.filename || 'upload');
    fd.append('models', 'nudity-2.1,offensive-2.0,gore-2.0');
    fd.append('api_user', user);
    fd.append('api_secret', secret);
    const endpoint = kind === 'video' ? 'https://api.sightengine.com/1.0/video/check-sync.json' : 'https://api.sightengine.com/1.0/check.json';
    const res = await fetch(endpoint, { method: 'POST', body: fd });
    const j = await res.json();
    const frames = j.data && j.data.frames ? j.data.frames : [j];
    const worst = (f, k) => Math.max(0, ...frames.map((x) => (x.nudity && x.nudity[k]) || 0));
    if (worst(null, 'sexual_activity') > 0.5 || worst(null, 'sexual_display') > 0.5 || worst(null, 'erotica') > 0.6 || worst(null, 'very_suggestive') > 0.8) return 'sexual';
    if (frames.some((x) => x.offensive && x.offensive.prob > 0.8)) return 'religion';
    return null;
  } catch (e) {
    console.warn('[moderation] media check failed', e.message);
    return null;
  }
}

async function assertCleanMedia(file, kind) {
  const reason = await checkMedia(file, kind);
  if (reason) throw new HttpError(422, 'CONTENT_REJECTED', { reason });
}

module.exports = { checkText, assertClean, assertCleanMedia, normalize };
