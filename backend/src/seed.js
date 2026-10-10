// Categories are always ensured on start; `npm run seed` also adds demo users and questions.
const { one, run, id, tx } = require('./db');
const { hashPassword } = require('./lib/auth');

// [key, Arabic, English, Turkish, Spanish, icon, color]
const CATEGORIES = [
  ['tech', 'التقنية والبرمجة', 'Tech & Programming', 'Teknoloji & Yazılım', 'Tecnología y programación', 'code-slash', '#4F46E5'],
  ['health', 'الطب والصحة', 'Medicine & Health', 'Tıp & Sağlık', 'Medicina y salud', 'medkit', '#E11D48'],
  ['education', 'التعليم والدراسة', 'Education & Study', 'Eğitim & Okul', 'Educación y estudios', 'school', '#0EA5E9'],
  ['law', 'القانون والاستشارات', 'Law & Consulting', 'Hukuk & Danışmanlık', 'Derecho y asesoría', 'scale', '#7C3AED'],
  ['gov', 'الخدمات الحكومية', 'Government Services', 'Kamu Hizmetleri', 'Trámites y servicios públicos', 'document-text', '#0F766E'],
  ['money', 'وظائف وأعمال ومال', 'Jobs, Business & Money', 'İş, Kariyer & Para', 'Empleo, negocios y dinero', 'briefcase', '#CA8A04'],
  ['marketing', 'الدعاية والإعلان', 'Marketing & Advertising', 'Reklam & Pazarlama', 'Publicidad y marketing', 'megaphone', '#DB2777'],
  ['realestate', 'العقار والإيجار', 'Real Estate & Rent', 'Emlak & Kira', 'Inmuebles y alquiler', 'home', '#B45309'],
  ['cars', 'السيارات والصيانة', 'Cars & Maintenance', 'Arabalar & Bakım', 'Coches y mantenimiento', 'car-sport', '#475569'],
  ['places', 'أماكن وسفر', 'Places & Travel', 'Yerler & Seyahat', 'Lugares y viajes', 'map', '#16A34A'],
  ['food', 'طبخ وأكل', 'Food', 'Yemek', 'Comida', 'restaurant', '#EA580C'],
  ['sports', 'الرياضة والتغذية', 'Sports & Nutrition', 'Spor & Beslenme', 'Deporte y nutrición', 'football', '#65A30D'],
  ['hobbies', 'الهوايات والترفيه', 'Hobbies & Fun', 'Hobiler & Eğlence', 'Aficiones y ocio', 'color-palette', '#0891B2'],
  ['family', 'أسرة ومجتمع', 'Family & Society', 'Aile & Toplum', 'Familia y sociedad', 'people', '#9333EA'],
  ['reviews', 'قيّم منتجاً اشتريته', 'Rate a product', 'Ürün değerlendir', 'Valora un producto', 'star', '#D97706'],
  ['lostfound', 'مفقودات وموجودات', 'Lost & Found', 'Kayıp & Bulunan', 'Objetos perdidos', 'search', '#0F766E'],
  // 'General' is last and shown full-width under the grid
  ['general', 'عام', 'General', 'Genel', 'General', 'chatbubbles', '#428E9F'],
];

function ensureCategories() {
  CATEGORIES.forEach(([key, ar, en, trName, es, icon, color], i) => {
    run(`INSERT INTO categories (key, name_ar, name_en, name_tr, name_es, icon, color, sort) VALUES (?,?,?,?,?,?,?,?)
         ON CONFLICT(key) DO UPDATE SET name_ar = excluded.name_ar, name_en = excluded.name_en, name_tr = excluded.name_tr, name_es = excluded.name_es,
         icon = excluded.icon, color = excluded.color, sort = excluded.sort`,
    key, ar, en, trName, es, icon, color, i);
  });
}

function seedDemo() {
  ensureCategories();
  if (one("SELECT 1 FROM users WHERE email = 'demo@query.app'")) { console.log('Demo data already present.'); return; }
  const cat = (k) => one('SELECT id FROM categories WHERE key = ?', k).id;
  const pw = hashPassword('demo1234');
  const users = [['demo@query.app', 'مستخدم تجريبي'], ['sara@query.app', 'سارة'], ['omar@query.app', 'عمر'], ['lina@query.app', 'لينا']]
    .map(([email, name]) => { const uid = id(); run('INSERT INTO users (id, name, email, password_hash) VALUES (?,?,?,?)', uid, name, email, pw); return uid; });
  const [demo, sara, omar, lina] = users;
  tx(() => {
    users.forEach((u) => run('INSERT OR IGNORE INTO subscriptions (user_id, category_id) SELECT ?, id FROM categories', u));
    const post = (uid, k, type, content, extra = {}) => {
      const pid = id();
      run('INSERT INTO posts (id, user_id, category_id, type, content, lat, lng, place_name, is_anonymous) VALUES (?,?,?,?,?,?,?,?,?)',
        pid, uid, cat(k), type, content, extra.lat ?? null, extra.lng ?? null, extra.place ?? null, extra.anon ? 1 : 0);
      (extra.options || []).forEach((t, i) => run('INSERT INTO poll_options (id, post_id, text, sort) VALUES (?,?,?,?)', id(), pid, t, i));
      return pid;
    };
    const c = (pid, uid, text) => { const cid = id(); run('INSERT INTO comments (id, post_id, user_id, content) VALUES (?,?,?,?)', cid, pid, uid, text); return cid; };
    const p1 = post(sara, 'tech', 'TEXT', 'ما أفضل طريقة لتعلم البرمجة من الصفر؟ أبحث عن مصادر مجانية باللغة العربية.');
    c(p1, omar, 'ابدأ بلغة بايثون، وهناك دورات مجانية ممتازة على يوتيوب وموقع إدراك.');
    const best = c(p1, lina, 'جرّب منصة freeCodeCamp، وطبّق مشروعاً صغيراً كل أسبوع؛ التطبيق أهم من المشاهدة.');
    run('UPDATE posts SET best_comment_id = ? WHERE id = ?', best, p1);
    run('INSERT INTO likes (post_id, user_id) VALUES (?,?), (?,?)', p1, omar, p1, demo);
    const p2 = post(omar, 'food', 'POLL', 'أيهما تفضّل على الفطور؟', { options: ['فول وتميس', 'شكشوكة', 'بيض وجبنة', 'فطائر'] });
    const opts = require('./db').all('SELECT id FROM poll_options WHERE post_id = ? ORDER BY sort', p2);
    run('INSERT INTO poll_votes (post_id, user_id, option_id) VALUES (?,?,?), (?,?,?)', p2, sara, opts[0].id, p2, lina, opts[1].id);
    const p3 = post(lina, 'places', 'LOCATION', 'هل يوجد مواقف سيارات قريبة من هذا المكان؟', { lat: 21.4858, lng: 39.1925, place: 'البلد، جدة' });
    c(p3, sara, 'نعم، يوجد موقف عام خلف بوابة جدة التاريخية.');
    post(demo, 'health', 'TEXT', 'كم ساعة نوم يحتاجها الشخص البالغ فعلاً؟', { anon: true });
    post(sara, 'education', 'TEXT', 'هل تنصحون بدراسة الماجستير عن بُعد أم الانتظام؟');
    const lf = post(omar, 'lostfound', 'LOCATION', 'فقدت محفظة بنية اللون فيها بطاقات باسم عمر، قرب بوابة جدة التاريخية مساء الخميس.', { lat: 21.4858, lng: 39.1925, place: 'البلد، جدة' });
    run("UPDATE posts SET lf_kind = 'LOST' WHERE id = ?", lf);
    const lf2 = post(lina, 'lostfound', 'TEXT', 'وجدت مفاتيح سيارة مع ميدالية زرقاء في موقف مول العرب. صاحبها يصف الميدالية ليستلمها.');
    run("UPDATE posts SET lf_kind = 'FOUND' WHERE id = ?", lf2);
    const rv = post(sara, 'reviews', 'TEXT', 'استخدمتها شهرين يومياً للمشي والمكالمات، وأنصح بها لمن يريد عزل ضوضاء بسعر معقول.');
    run("UPDATE posts SET product_name = ?, product_key = ?, store = ?, price = ?, rating = 4, pros = ?, cons = ? WHERE id = ?",
      'سماعات Soundcore Q20i', require('./lib/products').productKey('سماعات Soundcore Q20i'), 'أمازون', 199, 'عزل ضوضاء ممتاز، بطارية طويلة', 'ثقيلة قليلاً', rv);
  });
  console.log('Demo data added. Login: demo@query.app / demo1234');
}

module.exports = { ensureCategories, seedDemo };
if (require.main === module) seedDemo();
