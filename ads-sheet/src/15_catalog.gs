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

/* "META|adId" of every catalog / Advantage+ ad (any ad Meta ever split by product). */
function catalogAdIds_() {
  const sh = ss_().getSheetByName(APP.T.CATALOG), ids = new Set();
  if (sh) readRows_(sh, 4).forEach(r => { if (r[3]) ids.add(r[1] + '|' + String(r[3])); });
  return ids;
}

/*
 * Tab الكتالوج: where catalog / Advantage+ spend went, product by product (Meta's split), today and this month.
 * Orders = store orders that came from a catalog ad (UTM → ad), counted on the order's product.
 * TOTAL = all spend of catalog ads, the same number as the CATALOG row in Today.
 */
function writeCatalogTab_() {
  const sh = ensureTab_(X.CATALOG), g = todayGrid_(), today = todayKey_(), catAds = catalogAdIds_();
  const split = [], csh = ss_().getSheetByName(APP.T.CATALOG);
  if (csh) readRows_(csh, CATALOG_HEADERS.length).forEach(r => split.push([asKey_(r[0]), catalogProduct_(r[4]), num_(r[5]), num_(r[6])]));
  const adSpend = [];
  readRows_(tab_(APP.T.ADS), ADS_HEADERS.length).forEach(a => { if (catAds.has(a[1] + '|' + String(a[8]))) adSpend.push([asKey_(a[0]), num_(a[10])]); });
  const orders = [], osh = ss_().getSheetByName(APP.T.ORDERS);
  if (osh) readRows_(osh, ORDERS_HEADERS.length).forEach(o => {
    if (o[14] && catAds.has(o[3] + '|' + String(o[14]))) orders.push([asKey_(o[2]), o[5], num_(o[7])]);
  });
  const p = today.split('-').map(Number), noon = new Date(Date.UTC(p[0], p[1] - 1, p[2], 12));
  const table = (r, title, from, to) => {
    const by = {}, z = n => (by[n] = by[n] || { spend: 0, pixel: 0, orders: 0, revenue: 0 });
    split.forEach(x => { if (x[0] >= from && x[0] <= to) { z(x[1]).spend += x[2]; z(x[1]).pixel += x[3]; } });
    orders.forEach(x => { if (x[0] >= from && x[0] <= to) { z(x[1]).orders++; z(x[1]).revenue += x[2]; } });
    const total = { spend: adSpend.filter(x => x[0] >= from && x[0] <= to).reduce((s, x) => s + x[1], 0), pixel: 0, orders: 0, revenue: 0 };
    r = todayHead_(g, r, 1, 6, title, ['PRODUCT', 'ORDERS', 'META SPEND', 'CPP', 'ROAS', 'META PURCHASES (PIXEL)']);
    const put = (name, t, style) => {
      g.set(r, 1, name, style);
      g.set(r, 2, t.orders, Object.assign({ nf: TODAY.COUNT, al: 'right' }, style));
      g.set(r, 3, round2_(t.spend), Object.assign({ nf: TODAY.MONEY, al: 'right' }, style));
      g.set(r, 4, ratioOrBlank_(t.spend, t.orders, 2), Object.assign({ nf: TODAY.MONEY, al: 'right' }, style));
      g.set(r, 5, ratioOrBlank_(t.revenue, t.spend, 2), Object.assign({ nf: TODAY.RATIO, al: 'right' }, style));
      g.set(r, 6, t.pixel === '' ? '' : t.pixel, Object.assign({ nf: TODAY.COUNT, al: 'right' }, style));
      r++;
    };
    const names = Object.keys(by).filter(n => n !== CATALOG.OTHER).sort((a, b) => (by[b].spend - by[a].spend) || (by[b].orders - by[a].orders));
    names.forEach(n => { put(n, by[n], {}); });
    if (by[CATALOG.OTHER]) put(CATALOG.OTHER, by[CATALOG.OTHER], { bg: TODAY.SPECIAL });
    let splitSum = 0;
    Object.keys(by).forEach(n => { splitSum += by[n].spend; total.pixel += by[n].pixel; total.orders += by[n].orders; total.revenue += by[n].revenue; });
    if (total.spend - splitSum >= 0.01) put('صرف Meta ماقسمتهوش على منتجات', { spend: total.spend - splitSum, pixel: '', orders: 0, revenue: 0 }, { bg: TODAY.SPECIAL });
    if (!names.length && !by[CATALOG.OTHER] && !total.spend) { g.set(r, 1, 'مفيش صرف كتالوج في الفترة دي', { fc: '#6b7280' }); r++; }
    put('TOTAL CATALOG', total, { bg: TODAY.TOTAL, b: 'bold' });
    return r;
  };
  let r = table(1, 'CATALOG — TODAY | ' + Utilities.formatDate(noon, 'UTC', 'dd-MMM-yyyy'), today, today) + 1;
  table(r, 'CATALOG — THIS MONTH | ' + Utilities.formatDate(noon, 'UTC', 'MMM-yyyy'), today.slice(0, 8) + '01', today);
  writeGrid_(sh, g);
  [[1, 360], [2, 90], [3, 120], [4, 100], [5, 90], [6, 160]].forEach(w => sh.setColumnWidth(w[0], w[1]));
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
