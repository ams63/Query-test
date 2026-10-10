// Filter accuracy: must block the bad examples and must NOT block normal questions.
const test = require('node:test');
const assert = require('node:assert/strict');
const { checkText } = require('../src/lib/moderation');
const bad = [
  ['ابي افلام سكس', 'sexual'], ['وين القى مقاطع إباحية؟', 'sexual'], ['سـكـــس', 'sexual'], ['س ك س', 'sexual'], ['شرموطة', 'sexual'],
  ['where can I watch porn', 'sexual'], ['send nudes pls', 'sexual'], ['p0rn sites?', 'sexual'], ['s.e.x video', 'sexual'], ['best onlyfans accounts', 'sexual'],
  ['porno izle', 'sexual'], ['sikiş videosu', 'sexual'], ['fotos de chicas desnudas', 'sexual'], ['quiero follar', 'sexual'], ['PORNHUB', 'sexual'],
  ['الله غير موجود وكل هذا كذب', 'religion'], ['الدين خرافة', 'religion'], ['والقرآن كتاب تافه', 'religion'], ['يلعن الدين', 'religion'], ['سب الدين عادي؟', 'religion'],
  ['islam is a religion of terror', 'religion'], ['Jesus was a liar', 'religion'], ['the quran is garbage', 'religion'], ['fuck religion', 'sexual'],
  ['Kuran saçma', 'religion'], ['la biblia es basura', 'religion'], ['los musulmanes son cerdos', 'religion'], ['المسيحيين كلاب', 'religion'], ['اليهود خنازير', 'religion'],
];
const good = [
  'ما أفضل طريقة لتعلم البرمجة؟', 'كم ساعة نوم يحتاجها البالغ؟', 'ما حكم صلاة الجمعة للمسافر؟', 'ما تفسير سورة الكهف؟', 'عكس كلمة سريع؟', 'انكسر كأس في المطبخ كيف أنظفه',
  'ما جنس الجنين في الشهر الرابع؟', 'كيف أجدد الجنسية؟', 'رب العمل غبي ماذا أفعل', 'أحب زيارة المسجد الحرام', 'فرج الله همك', 'قضيب حديد للبناء',
  'I am going to Istanbul, any tips?', 'I got a new job', 'Which church is oldest in Rome?', 'Is the Quran available in Turkish?', 'Best dog food?', 'My cat hates baths',
  'Sussex university admissions', 'analysis of data in excel', 'escort services for elderly hospital visits', 'Bu meme çok komik', 'İstanbulda en iyi cami hangisi?',
  'Dónde está la mezquita más grande de España?', 'la corrida de toros', 'un cono de helado', 'Where is Mary Street in Dublin?', 'Cómo cocinar pollo?', 'Dios te bendiga', 'Din dersi sınavı ne zaman?', 'Tanrı hakkında güzel bir kitap önerir misiniz?', 'ما أفضل كتاب عن سيرة النبي؟', 'I hate traffic in Riyadh',
];
test('blocks forbidden content in 4 languages', () => {
  for (const [t, r] of bad) assert.equal(checkText(t), r, t);
});
test('does not block normal questions (no false positives)', () => {
  for (const t of good) assert.equal(checkText(t), null, t);
});
