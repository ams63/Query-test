// Groups reviews of the same product even if people type the name slightly differently:
// case, spaces, punctuation, accents and Arabic letter variants don't matter ("iPhone 15 Pro" = "iphone-15  pro").
function productKey(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .slice(0, 80);
}
module.exports = { productKey };
