/*
 * What a campaign is for, from its name (the campaigns are named after what they sell: "Sheglam Boldline Eyeliner Gel | ABO | 19-11").
 * Only for ads that spent this month (Ad Map, decideProduct_): earlier months stay as they were.
 *  - Messages: "Messages", "Message", "Msg", "Msgs", "مسجات", "رسايل" … in the name → CNAME.MSG (its chats aren't store orders).
 *  - Awareness: "Awareness", "أويرنس" → CNAME.AWARE (not for the website).
 *  - A product: matched against every product in the store (the "Shopify Stock" tab, read from the app; else the Products tab):
 *    1) a product's whole title written in the name (as whole words); when several are, the longest (the one that holds the others);
 *    2) else a part of the name (between the |) of 2 words or more that's inside a product's title: one product only, or one
 *       that every other one holds (the others are its bundles: "2 x … + free …").
 *    Several products and none of them the base one: no decision (the campaign stays for you, with the names it could be).
 * A product found by name that isn't in the Products tab yet is added to it (title, page, price), so it's in the choices and
 * its spend has a home. The ad's link still counts: a product page link wins, and when it says another product than the name,
 * the ad is ⚠️ (Ad Map source CONFLICT) until you choose in the Campaign Map.
 */
const CNAME = {
  MSG: 'مسجات', AWARE: 'Awareness', CATALOG_RX: /catalog|كتالوج/i,
  MSG_RX: /(^|[^a-z0-9])(messages?|msgs?|mssgs?|mesg|messenger|whats ?app)([^a-z0-9]|$)|مسجات|(^|[\s|_\-])مسج($|[\s|_\-])|رسايل|رسائل|رساله|رسالة|ماسنجر|واتساب|واتس/i,
  AWARE_RX: /(^|[^a-z0-9])(awareness)([^a-z0-9]|$)|اويرنس|أويرنس/i,
  MIN_LEN: 8
};

/* Every store product once: [{title, n (normalized), handle, price}]. From the Shopify Stock tab, else from Products. */
let SHOP_CATALOG_ = null;
function shopCatalog_() {
  if (SHOP_CATALOG_) return SHOP_CATALOG_;
  const out = new Map();
  if (ss_().getSheetByName(STOCK_APP.TAB)) rawRows_(STOCK_APP.TAB, STOCK_APP.HEADERS.length).forEach(r => {
    const title = String(r[2] || '').trim(), n = norm_(title);
    if (!n || out.has(n)) return;
    out.set(n, { title: title, n: n, handle: String(r[1] || '').toLowerCase(), price: r[5] === '' ? '' : num_(r[5]) });
  });
  products_().forEach(p => { const n = norm_(p.name); if (n && !out.has(n)) out.set(n, { title: p.name, n: n, handle: p.slugs[0] || '', price: p.price || '' }); });
  const list = Array.from(out.values()), index = {};
  list.forEach((x, i) => Array.from(new Set(x.n.split(' '))).forEach(w => { (index[w] = index[w] || []).push(i); }));
  SHOP_CATALOG_ = { list: list, index: index };
  return SHOP_CATALOG_;
}
/* Titles holding all these words (the inverted index): the candidates to test. */
function catalogWith_(words) {
  const C = shopCatalog_(), lists = words.map(w => C.index[w] || []);
  if (lists.some(l => !l.length)) return [];
  lists.sort((a, b) => a.length - b.length);
  const rest = lists.slice(1).map(l => new Set(l));
  return lists[0].filter(i => rest.every(s => s.has(i))).map(i => C.list[i]);
}

/*
 * A campaign's name → {kind: 'MSG' | 'AWARE' | 'PRODUCT' | 'MANY' | '', title, handle, many: [titles]}.
 * Memoized for the run (a campaign has many ads).
 */
let CAMP_TARGET_ = {};
function campaignTarget_(name) {
  const raw = String(name || '').trim();
  if (!raw) return { kind: '' };
  if (CAMP_TARGET_[raw]) return CAMP_TARGET_[raw];
  const out = CAMP_TARGET_[raw] = campaignTargetOf_(raw);
  return out;
}
function campaignTargetOf_(raw) {
  const text = norm_(raw);
  if (CNAME.MSG_RX.test(raw) || CNAME.MSG_RX.test(text)) return { kind: 'MSG', title: CNAME.MSG };
  if (CNAME.AWARE_RX.test(raw) || CNAME.AWARE_RX.test(text)) return { kind: 'AWARE', title: CNAME.AWARE };
  if (CNAME.CATALOG_RX.test(raw)) return { kind: '' }; // the catalog's own rules (Meta splits its spend)
  const long = x => x.n.length >= CNAME.MIN_LEN && x.n.indexOf(' ') > 0;
  // 1) whole titles in the name.
  const words = Array.from(new Set(text.split(' ')));
  const seen = new Map();
  words.forEach(w => (shopCatalog_().index[w] || []).forEach(i => { const x = shopCatalog_().list[i]; if (!seen.has(x.n)) seen.set(x.n, x); }));
  const inName = Array.from(seen.values()).filter(x => long(x) && hasToken_(text, x.n));
  const top = inName.filter(x => !inName.some(y => y !== x && y.n.length > x.n.length && hasToken_(y.n, x.n)));
  if (top.length === 1) return { kind: 'PRODUCT', title: top[0].title, handle: top[0].handle, price: top[0].price };
  if (top.length > 1) return { kind: 'MANY', many: top.map(x => x.title) };
  // 2) a part of the name inside one title (the base one when the others are its bundles).
  const parts = raw.split(/\s[|\/–—-]\s|\|/).map(norm_).filter(p => p.length >= CNAME.MIN_LEN && p.indexOf(' ') > 0 && !/^[\d\s]+$/.test(p));
  let many = [];
  for (const p of parts) {
    const hits = catalogWith_(p.split(' ')).filter(x => hasToken_(x.n, p));
    if (!hits.length) continue;
    const base = hits.filter(x => hits.every(y => y === x || hasToken_(y.n, x.n)));
    if (base.length === 1) return { kind: 'PRODUCT', title: base[0].title, handle: base[0].handle, price: base[0].price };
    many = many.concat(hits.map(x => x.title));
  }
  return many.length ? { kind: 'MANY', many: Array.from(new Set(many)).slice(0, 5) } : { kind: '' };
}

/* The Products tab's name for a store product (by its page, else its title), or '' when it isn't there. */
function productOfCatalog_(t) {
  const prods = products_(), n = norm_(t.title || '');
  const p = (t.handle && prods.find(x => x.slugs.indexOf(t.handle) >= 0)) || prods.find(x => norm_(x.name) === n);
  return p ? p.name : '';
}
/* Store products found by name (or chosen in the Campaign Map) that aren't in the Products tab yet → added to it. */
function addCatalogProducts_(targets) {
  const add = [], have = new Set();
  targets.forEach(t => {
    if (!t || !t.title || productOfCatalog_(t) || have.has(norm_(t.title))) return;
    have.add(norm_(t.title));
    add.push([t.title, '', t.handle || '', '', t.title, t.price === undefined ? '' : t.price, '', '', '', '', '', true]);
  });
  if (!add.length) return 0;
  const sh = ensureTab_(APP.T.PRODUCTS, PRODUCT_HEADERS);
  sh.getRange(sh.getLastRow() + 1, 1, add.length, PRODUCT_HEADERS.length).setValues(add);
  PRODUCTS_ = null; KNOWN_PRODUCTS_ = null;
  return add.length;
}
/* A store product whose title is exactly this text (a choice typed or picked in the Campaign Map), or null. */
function catalogByTitle_(text) {
  const n = norm_(text);
  return n ? shopCatalog_().list.find(x => x.n === n) || null : null;
}
/* The names for the Campaign Map's choices: every store product (the hidden tab CNAME's list reads them, no 500 limit). */
function catalogTitles_() { return shopCatalog_().list.map(x => x.title); }
