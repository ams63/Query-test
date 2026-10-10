// Fails if any UI string is missing in one of the languages
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'i18n', 'strings.js'), 'utf8');
const json = src.slice(src.indexOf('const base = ') + 13, src.indexOf('};\n\nObject.keys(base)') + 1);
const base = JSON.parse(json);
const legal = require('../src/i18n/legal.json');
const langs = Object.keys(base);
const all = new Set(langs.flatMap((l) => Object.keys(base[l])));
let ok = true;
for (const l of langs) {
  const missing = [...all].filter((k) => !(k in base[l]) || !String(base[l][k]).trim());
  if (missing.length) { ok = false; console.error(`${l}: missing ${missing.join(', ')}`); }
  if (!legal[l] || !legal[l].terms || !legal[l].privacy) { ok = false; console.error(`${l}: missing legal texts`); }
}
console.log(ok ? `i18n OK — ${all.size} keys × ${langs.length} languages` : 'i18n check failed');
process.exit(ok ? 0 : 1);
