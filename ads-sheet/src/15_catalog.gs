/*
 * Products of catalog and Advantage+ ads. Meta reports their spend per product shown (insights breakdown product_id:
 * "<id>, <product title>" or "<id>, <title> - <variant>"). Catalog Raw keeps that split per ad per day, and the
 * Daily Log puts each part on its product; whatever Meta doesn't split stays on the ad's own product (Ad Map).
 * Products are named by their Shopify title, the same name orders carry, so spend and orders meet on one row.
 */
const CATALOG_HEADERS = ['Date', 'Platform', 'Account ID', 'Ad ID', 'Product', 'Spend', 'Purchases', 'Purchase value'];
const CATALOG = { MIN_SPEND: 1, OTHER: 'منتجات تانية من الكتالوج (صرف صغير)' };

/* Per ad per day per product, from Meta. Rows under CATALOG.MIN_SPEND are summed into one "other" row per ad and day. */
function fetchMetaCatalog_(since, until, onlyId) {
  const out = [], range = JSON.stringify({ since: since, until: until });
  accounts_('META').filter(a => !onlyId || a.id === onlyId).forEach(acc => {
    const small = {};
    metaAll_('act_' + acc.id + '/insights', { level: 'ad', breakdowns: 'product_id', time_range: range, time_increment: 1,
      fields: 'date_start,ad_id,spend,actions,action_values' }).forEach(r => {
      const spend = num_(r.spend), raw = String(r.product_id || ''), name = raw.indexOf(', ') > 0 ? raw.slice(raw.indexOf(', ') + 2).trim() : '';
      if (spend <= 0 || !name || raw === 'null') return;
      const row = [r.date_start, 'META', acc.id, String(r.ad_id || ''), name, spend, metaPick_(r.actions), metaPick_(r.action_values)];
      if (spend >= CATALOG.MIN_SPEND) { out.push(row.map((v, i) => (i === 5 || i === 7 ? round2_(v) : v))); return; }
      const k = row[0] + '|' + row[3];
      const s = small[k] = small[k] || [row[0], 'META', acc.id, row[3], CATALOG.OTHER, 0, 0, 0];
      s[5] += spend; s[6] += row[6]; s[7] += row[7];
    });
    Object.keys(small).forEach(k => out.push(small[k].map((v, i) => (i === 5 || i === 7 ? round2_(v) : v))));
  });
  return out;
}
function mergeCatalog_(rows, since, until, accountKeys) {
  const isNew = !ss_().getSheetByName(APP.T.CATALOG);
  const n = mergeRaw_(APP.T.CATALOG, CATALOG_HEADERS, rows, since, until, accountKeys, [0, 1, 2, 3, 4], [2, 3]);
  if (isNew) tab_(APP.T.CATALOG).hideSheet();
  return n;
}
/* Catalog rows for the synced days; a failure leaves Catalog Raw as it was (status in Health). */
function syncCatalog_(since, until, onlyId) {
  try {
    const rows = fetchMetaCatalog_(since, until, onlyId);
    return { rows: rows, keys: accounts_('META').filter(a => !onlyId || a.id === onlyId).map(a => 'META|' + a.id) };
  } catch (e) { setStatus_('CATALOG', '✗ ' + errText_(e)); return null; }
}

/* Product names the sheet knows: Products tab names and aliases, and the product of every order (Shopify titles). */
let KNOWN_PRODUCTS_ = null;
function knownProducts_() {
  if (KNOWN_PRODUCTS_) return KNOWN_PRODUCTS_;
  const known = new Map();
  products_().forEach(p => { known.set(norm_(p.name), p.name); p.aliases.forEach(a => { if (!known.has(a)) known.set(a, p.name); }); });
  const osh = ss_().getSheetByName(APP.T.ORDERS);
  if (osh) readRows_(osh, ORDERS_HEADERS.length).forEach(o => {
    lineItems_(o[6]).forEach(li => { const n = norm_(li.title); if (n && !known.has(n)) known.set(n, li.title.trim()); });
  });
  KNOWN_PRODUCTS_ = known;
  return known;
}

/*
 * A catalog name → a product name. "Title - Variant" → "Title" when the title is a known product.
 * Collection pages and names the sheet has never seen (no order, no Products row) stay as they are.
 */
function catalogProduct_(name) {
  if (name === CATALOG.OTHER) return name;
  const known = knownProducts_();
  let t = String(name || '').trim();
  for (let i = 0; i < 3 && t; i++) {
    const hit = known.get(norm_(t));
    if (hit) return hit;
    const cut = t.lastIndexOf(' - ');
    if (cut <= 0) break;
    t = t.slice(0, cut).trim();
  }
  return String(name || '').trim();
}

/* key "date|platform|adId" → [{product, spend, pixel, value}] */
function catalogIndex_() {
  const sh = ss_().getSheetByName(APP.T.CATALOG), idx = new Map();
  if (!sh) return idx;
  readRows_(sh, CATALOG_HEADERS.length).forEach(r => {
    const k = asKey_(r[0]) + '|' + r[1] + '|' + String(r[3]);
    if (!idx.has(k)) idx.set(k, []);
    idx.get(k).push({ product: catalogProduct_(r[4]), spend: num_(r[5]), pixel: num_(r[6]), value: num_(r[7]) });
  });
  return idx;
}

/*
 * Ad links to product pages that are not in Products yet: ask the store for the page's product (public JSON,
 * /products/<handle>.js) and add it with its Shopify title, so the ad maps by link. Misses are not retried for a day.
 */
function addProductsFromLinks_(slugs) {
  const domain = cfgList_('business.store_domains').map(storeHost_).filter(Boolean)[0];
  if (!domain || !slugs.length) return 0;
  const props = PropertiesService.getDocumentProperties(), today = todayKey_();
  let miss = {};
  try { miss = JSON.parse(props.getProperty('SLUG_MISS') || '{}'); } catch (e) { miss = {}; }
  const have = new Set(products_().map(p => norm_(p.name))), add = [];
  const ask = slugs.filter(s => miss[s] !== today && !/\//.test(s)).slice(0, 40);
  let res = [];
  try {
    res = UrlFetchApp.fetchAll(ask.map(slug => ({ url: 'https://' + domain + '/products/' + encodeURIComponent(slug) + '.js', muteHttpExceptions: true })));
  } catch (e) { res = []; }
  ask.forEach((slug, i) => {
    try {
      const r = res[i];
      if (!r || r.getResponseCode() !== 200) { miss[slug] = today; return; }
      const p = JSON.parse(r.getContentText()), title = String(p.title || '').trim();
      if (!title) { miss[slug] = today; return; }
      const price = p.price ? round2_(num_(p.price) / 100) : '';
      if (have.has(norm_(title))) { appendSlug_(title, slug); return; }
      have.add(norm_(title));
      add.push([title, '', String(p.handle || slug).toLowerCase() + (p.handle && p.handle !== slug ? ', ' + slug : ''), '', title, price, '', '', '', '', '', true]);
    } catch (e) { miss[slug] = today; }
  });
  props.setProperty('SLUG_MISS', JSON.stringify(miss));
  if (add.length) {
    const sh = ensureTab_(APP.T.PRODUCTS, PRODUCT_HEADERS);
    sh.getRange(sh.getLastRow() + 1, 1, add.length, PRODUCT_HEADERS.length).setValues(add);
  }
  resetCaches_();
  return add.length;
}
/* A product already in Products under the same title: add the new page name to its Landing slugs. */
function appendSlug_(title, slug) {
  const sh = ss_().getSheetByName(APP.T.PRODUCTS);
  if (!sh || sh.getLastRow() < 2) return;
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues();
  const i = rows.findIndex(r => norm_(r[0]) === norm_(title));
  if (i < 0) return;
  const cur = String(rows[i][2] || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (cur.indexOf(slug) < 0) sh.getRange(i + 2, 3).setValue(cur.concat([slug]).join(', '));
}

/* "https://www.shop.com/" → "shop.com" */
function storeHost_(v) {
  return String(v || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[\/?#].*$/, '');
}
