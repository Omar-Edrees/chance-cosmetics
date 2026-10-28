/*
 * Daily Log is REBUILT from Ads Raw + Orders Raw on every sync (one row per date + platform + product).
 * Product comes from Ad Map at build time, so fixing one ad fixes every past day.
 * All views read Daily Log; nothing is archived by copying tabs — pick a month or a date range instead.
 */
const DAILY_HEADERS = ['Date', 'Platform', 'Product', 'Spend', 'Spend not exact', 'Impressions', 'Link clicks',
  'Pixel purchases', 'Orders', 'Cancelled', 'Revenue'];
const BENCH_HEADERS = ['Metric', 'Platform', 'Low (weak)', 'Typical', 'Good (strong)', 'Better', 'Source', 'Source date', 'Confidence', 'Note'];
const TESTS_HEADERS = ['Test ID', 'Product', 'Angle', 'Hook', 'Format', 'Creator', 'Landing page', 'Budget', 'Structure',
  'Kill rule', 'Scale rule', 'Status', 'Spend', 'Pixel purchases', 'Orders', 'CPA + tax', 'Signal', 'Notes'];
const INTRA_HEADERS = ['Date', 'Slot', 'Platform', 'Spend', 'Orders', 'CPP', 'Revenue'];

function taxRate_() { return cfgNum_('costs.ad_tax_pct') || 0; }

/*
 * since = rebuild only the days from `since` to today (a normal update: today's spend and the orders it just read).
 * No since = the whole log again (daily run, or after Ad Map changed, so a fixed ad fixes every past day).
 */
function rebuildDaily_(since) {
  const idx = adMapIndex_(), catAds = catalogAdIds_(), agg = new Map(), pixelOrders = cfgStr_('orders.method') === 'pixel';
  const row = (d, pl, pr) => {
    const k = d + '|' + pl + '|' + pr;
    if (!agg.has(k)) agg.set(k, [d, pl, pr, 0, 0, 0, 0, 0, 0, 0, 0]);
    return agg.get(k);
  };
  const ads = since ? recentRows_(APP.T.ADS, ADS_HEADERS.length, 1, asKey_, since) : rawRows_(APP.T.ADS, ADS_HEADERS.length);
  const known = since ? metaIdsOf_() : metaIdsOf_(ads);
  ads.forEach(a => {
    const d = asKey_(a[0]);
    if (!d) return;
    // A catalog / Advantage+ ad (Meta splits it by product) counts whole under CATALOG; its split is in the الكتالوج tab.
    const catalog = catAds.has(a[1] + '|' + String(a[8] || ''));
    const m = catalog ? { product: APP.CATALOG, exact: true }
      : idx.get(adKey_(a[1], String(a[8] || ''), a[5], a[7], a[9])) || { product: APP.UNMAPPED, exact: false };
    const r = row(d, a[1], m.product), s = num_(a[10]);
    r[3] += s; if (!m.exact) r[4] += s; r[5] += num_(a[11]); r[6] += num_(a[12]); r[7] += num_(a[13]);
    // No real orders source yet: pixel purchases stand in as orders (labelled in Today and Health).
    if (pixelOrders) { r[8] += num_(a[13]); r[10] += num_(a[14]); }
  });
  if (!pixelOrders) (since ? recentRows_(APP.T.ORDERS, ORDERS_HEADERS.length, 2, sortKey_, since) : rawRows_(APP.T.ORDERS, ORDERS_HEADERS.length)).forEach(o => {
    const d = asKey_(o[2]);
    if (!d || (since && d < since)) return;
    const r = outsideMeta_(o, known) ? row(d, APP.META_OUT, o[5]) : row(d, o[3], orderAdProduct_(o, idx, catAds));
    r[8]++; if (o[15] === true || String(o[15]).toUpperCase() === 'TRUE') r[9]++; r[10] += num_(o[7]);
  });
  const byDay = (a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : b[3] - a[3]);
  const rows = Array.from(agg.values()).map(r => r.map((v, i) => (i >= 3 && i !== 5 && i !== 6 ? round2_(v) : v))).sort(byDay);
  const sh = ensureTab_(APP.T.DAILY, DAILY_HEADERS);
  if (since) writeSortedBlock_(sh, DAILY_HEADERS.length, 1, asKey_, since, '9999-12-31', () => rows, [1], byDay);
  else writeRows_(sh, rows, DAILY_HEADERS.length, [1]);
  return rows;
}

/*
 * The row an order counts on: the product of the ad that brought it (the same place as that ad's spend), like Meta.
 * Catalog ad → CATALOG. A Meta order whose ad isn't in the sheet (another account, a renamed ad) → its own row.
 * Other platforms: the order's own product.
 */
function orderAdProduct_(o, idx, catAds) {
  if (o[3] !== 'META') return o[5];
  const id = String(o[14] || ''), m = id ? idx.get(adKey_('META', id, '', '', '')) : null;
  return id && catAds.has('META|' + id) ? APP.CATALOG : m ? m.product : APP.META_NO_AD;
}

/* Every campaign / ad set / ad ID in Ads Raw (rows given, or the last 60 days). */
function metaIdsOf_(ads) {
  const ids = new Set();
  (ads || recentRows_(APP.T.ADS, ADS_HEADERS.length, 1, asKey_, shiftKey_(todayKey_(), -60))).forEach(a => { [a[4], a[6], a[8]].forEach(x => { if (x) ids.add(String(x)); }); });
  return ids;
}
/* A Meta order whose UTMs carry only IDs that no account in the sheet has: another ad account (no spend here). */
function outsideMeta_(o, known) {
  if (o[3] !== 'META' || o[14]) return false;
  const ids = [o[11], o[12], o[13]].join(' ').match(/\d{15,}/g) || [];
  return ids.length > 0 && !ids.some(x => known.has(x));
}

function dailyRows_() { return rawRows_(APP.T.DAILY, DAILY_HEADERS.length).map(r => { r[0] = asKey_(r[0]); return r; }); }

/*
 * Totals for a date range: by platform, by product, overall. META OUT (orders from an ad account not in the sheet)
 * has its own platform total but stays out of the overall total until that account is added.
 */
function summarize_(rows, from, to) {
  const z = () => ({ spend: 0, notExact: 0, imp: 0, clicks: 0, pixel: 0, orders: 0, cancelled: 0, revenue: 0 });
  const out = { total: z(), byPlatform: {}, byProduct: {} };
  rows.forEach(r => {
    if (r[0] < from || r[0] > to) return;
    const plat = out.byPlatform[r[1]] = out.byPlatform[r[1]] || z(), prod = out.byProduct[r[2]] = out.byProduct[r[2]] || z();
    (r[1] === APP.META_OUT ? [plat, prod] : [out.total, plat, prod]).forEach(t => {
      t.spend += num_(r[3]); t.notExact += num_(r[4]); t.imp += num_(r[5]); t.clicks += num_(r[6]);
      t.pixel += num_(r[7]); t.orders += num_(r[8]); t.cancelled += num_(r[9]); t.revenue += num_(r[10]);
    });
  });
  return out;
}
function aov_(t) { return t.orders > 0 ? round2_(t.revenue / t.orders) : ''; }
function roas_(t) { return t.spend > 0 ? round2_(t.revenue / t.spend) : ''; }
function cpp_(t) { return t.orders > 0 ? round2_(t.spend * (1 + taxRate_()) / t.orders) : ''; }

function signal_(be, t) {
  if (be === null) return 'ناقص';
  if (be <= 0) return 'خسران حتى من غير إعلانات';
  const spendTax = t.spend * (1 + taxRate_());
  if (t.orders === 0) return spendTax >= (cfgNum_('rules.kill_spend_x_be') || 2) * be ? 'Kill?' : (t.spend > 0 ? 'Wait' : '');
  const cpa = spendTax / t.orders;
  if (cpa <= be) return t.orders >= (cfgNum_('rules.winner_min_orders') || 5) ? 'Winner' : 'OK';
  return cpa > be * (cfgNum_('rules.over_x_be') || 1.2) ? 'Over' : 'Watch';
}

/* Product rows for a period: real products first (by spend), then MULTI, unmapped, unknown product. */
function productTable_(sum) {
  const special = [APP.MULTI, APP.UNMAPPED, APP.UNKNOWN_PRODUCT], prods = products_();
  const names = Object.keys(sum.byProduct).filter(n => special.indexOf(n) < 0)
    .sort((a, b) => sum.byProduct[b].spend - sum.byProduct[a].spend);
  prods.forEach(p => { if (names.indexOf(p.name) < 0 && sum.byProduct[p.name]) names.push(p.name); });
  const rows = names.map(n => {
    const t = sum.byProduct[n], p = prods.find(x => x.name === n), be = breakEven_(p), miss = missingFor_(p);
    return [n, round2_(t.spend), round2_(t.notExact), t.orders, t.cancelled, cpp_(t), be === null ? '' : round2_(be),
      signal_(be, t), miss.length ? 'ناقص: ' + miss.join('، ') : ''];
  });
  special.forEach(n => {
    const t = sum.byProduct[n];
    if (t && (t.spend > 0 || t.orders > 0)) rows.push([n, round2_(t.spend), round2_(t.notExact), t.orders, t.cancelled, '', '', '', '']);
  });
  return rows;
}
const PRODUCT_TABLE_HEADERS = ['المنتج', 'الصرف', 'منه مش متأكد', 'الأوردرات', 'ملغي', 'تكلفة الأوردر + الضريبة',
  'نقطة التعادل', 'الإشارة', 'ملاحظة'];

/*
 * Writes blocks [{title, headers, rows}] starting at row `start`, in place (never cleared first, so the tab never
 * shows empty), then clears what's left below. Nothing is written when the blocks are the same as last time.
 */
function writeBlocks_(sh, start, blocks, width) {
  const vals = [], bg = [], fw = [], fc = [], heads = [];
  const pad = x => { const a = x.slice(0, width); while (a.length < width) a.push(''); return a; };
  const line = (v, b, w, c) => { vals.push(pad(v)); bg.push(new Array(width).fill(b)); fw.push(new Array(width).fill(w)); fc.push(new Array(width).fill(c)); };
  blocks.forEach(b => {
    line([b.title], '#1f2937', 'bold', '#ffffff');
    if (b.headers) { heads.push(vals.length); line(b.headers, '#fff200', 'bold', '#000000'); }
    b.rows.forEach(r => line(r, null, 'normal', '#000000'));
    line([], null, 'normal', '#000000');
  });
  const end = start + vals.length, last = sh.getLastRow(), props = PropertiesService.getDocumentProperties();
  const key = 'BH_' + sh.getName() + '|' + start, hash = sha_(width + '|' + JSON.stringify(vals));
  if (props.getProperty(key) === hash && last < end && vals.length && String(sh.getRange(start, 1).getValue()) === String(vals[0][0])) return end;
  if (end > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), end - sh.getMaxRows());
  if (vals.length) sh.getRange(start, 1, vals.length, width).setValues(vals).setBackgrounds(bg).setFontWeights(fw).setFontColors(fc);
  heads.forEach(h => sh.getRange(start + h, 1, 1, width).setWrap(true));
  if (last >= end) sh.getRange(end, 1, last - end + 1, Math.max(width, sh.getLastColumn())).clearContent().setBackground(null).setFontWeight('normal').setFontColor('#000000');
  props.setProperty(key, hash);
  return end;
}

function checksRows_(from, to) {
  const acc = ss_().getSheetByName(APP.T.ACC_RAW), ads = rawRows_(APP.T.ADS, ADS_HEADERS.length);
  const adSum = {}, accSum = {};
  ads.forEach(a => { const d = asKey_(a[0]); if (d >= from && d <= to) adSum[a[1]] = (adSum[a[1]] || 0) + num_(a[10]); });
  if (acc) rawRows_(APP.T.ACC_RAW, ACC_HEADERS.length).forEach(a => { const d = asKey_(a[0]); if (d >= from && d <= to) accSum[a[1]] = (accSum[a[1]] || 0) + num_(a[4]); });
  const rows = Object.keys(Object.assign({}, adSum, accSum)).map(p => {
    const diff = round2_((accSum[p] || 0) - (adSum[p] || 0));
    return [p + ': صرف الإعلانات / صرف الحساب', round2_(adSum[p] || 0), round2_(accSum[p] || 0),
      Math.abs(diff) <= 1 ? '✅ مطابق' : '⚠️ فرق ' + diff + ' (ميتا ممكن تتأخر دقايق بين المستويين)'];
  });
  const sum = summarize_(dailyRows_(), from, to), cov = sum.total.spend ? (sum.total.spend - sum.total.notExact) / sum.total.spend : 1;
  rows.unshift(['الصرف المربوط بدليل أكيد', round2_(sum.total.spend - sum.total.notExact), round2_(sum.total.spend),
    cov >= 0.999 ? '✅ ١٠٠٪' : (cov >= 0.9 ? '⚠️ ' : '❌ ') + Math.round(cov * 1000) / 10 + '% — راجع تاب ' + APP.T.ADMAP]);
  const slugs = PropertiesService.getDocumentProperties().getProperty('UNASSIGNED_SLUGS');
  if (slugs) rows.push(['صفحات منتجات مش متسجلة في تاب Products', slugs, '', '❌ سجّلها عشان صرفها يتربط']);
  return rows;
}

function periodFromCells_(sh) {
  const today = todayKey_();
  let from = asKey_(sh.getRange('B2').getValue()), to = asKey_(sh.getRange('B3').getValue());
  if (!from) { from = today.slice(0, 8) + '01'; sh.getRange('B2').setValue(from); }
  if (!to) { to = today; sh.getRange('B3').setValue(to); }
  return { from: from, to: to };
}
function writePerf_() {
  const sh = ensureTab_(APP.T.PERF);
  sh.getRange('A1:A3').setValues([['أداء المنتجات — اختار الفترة'], ['من'], ['إلى']]);
  sh.getRange('B2:B3').setNumberFormat('@').setBackground('#fff2cc');
  const p = periodFromCells_(sh), rows = dailyRows_(), sum = summarize_(rows, p.from, p.to);
  const byPlat = Object.keys(sum.byPlatform).sort().map(k => { const t = sum.byPlatform[k]; return [k, round2_(t.spend), t.orders, cpp_(t), t.pixel]; });
  writeBlocks_(sh, 5, [
    { title: 'المنتجات من ' + p.from + ' لـ ' + p.to, headers: PRODUCT_TABLE_HEADERS, rows: productTable_(sum) },
    { title: 'المنصات', headers: ['المنصة', 'الصرف', 'الأوردرات', 'تكلفة الأوردر + الضريبة', 'مشتريات البيكسل'], rows: byPlat },
    { title: 'فحص الأرقام', headers: ['البند', 'القيمة', 'من', 'الحالة'], rows: checksRows_(p.from, p.to) }
  ], 9);
}

/* Closing: pick a month in B2 (yyyy-MM). Days, weekly subtotals, month total. */
function writeClosing_() {
  const sh = ensureTab_(APP.T.CLOSING);
  sh.getRange('A1:A2').setValues([['التقفيل اليومي والأسبوعي والشهري'], ['الشهر (yyyy-MM)']]);
  sh.getRange('B2').setNumberFormat('@').setBackground('#fff2cc');
  let month = String(sh.getRange('B2').getDisplayValue() || '').trim();
  if (!/^\d{4}-\d{2}$/.test(month)) { month = todayKey_().slice(0, 7); sh.getRange('B2').setValue(month); }
  const rows = dailyRows_(), p = month.split('-').map(Number), days = new Date(Date.UTC(p[0], p[1], 0)).getUTCDate();
  const line = (label, s) => {
    const m = s.byPlatform.META || { spend: 0, orders: 0 }, t = s.byPlatform.TIKTOK || { spend: 0, orders: 0 }, u = s.byPlatform[APP.UNKNOWN_PLATFORM] || { orders: 0 };
    return [label, round2_(s.total.spend), round2_(s.total.spend * (1 + taxRate_())), s.total.orders, cpp_(s.total),
      round2_(m.spend), m.orders, cpp_(m), round2_(t.spend), t.orders, cpp_(t), u.orders, s.total.cancelled,
      round2_(s.total.revenue), aov_(s.total), roas_(s.total)];
  };
  const out = [], weeks = [[1, 7], [8, 14], [15, 21], [22, 28], [29, days]];
  weeks.forEach((w, i) => {
    if (w[0] > days) return;
    for (let d = w[0]; d <= w[1]; d++) {
      const k = month + '-' + String(d).padStart(2, '0');
      out.push(line(k, summarize_(rows, k, k)));
    }
    out.push(line('إجمالي الأسبوع ' + (i + 1), summarize_(rows, month + '-' + String(w[0]).padStart(2, '0'), month + '-' + String(w[1]).padStart(2, '0'))));
  });
  out.push(line('إجمالي الشهر', summarize_(rows, month + '-01', month + '-' + String(days).padStart(2, '0'))));
  writeBlocks_(sh, 4, [{ title: 'شهر ' + month, headers: ['اليوم', 'الصرف', 'الصرف + الضريبة', 'الأوردرات', 'تكلفة الأوردر + الضريبة',
    'صرف Meta', 'أوردرات Meta', 'تكلفة Meta + الضريبة', 'صرف TikTok', 'أوردرات TikTok', 'تكلفة TikTok + الضريبة',
    'أوردرات مش معروف مصدرها', 'ملغي', 'المبيعات', 'متوسط الأوردر AOV', 'ROAS الفعلي'], rows: out }], 16);
}

function writeHealth_() {
  const sh = ensureTab_(APP.T.HEALTH);
  const am = ss_().getSheetByName(APP.T.ADMAP), st = { '❌': 0, '⚠️': 0, '✅': 0 };
  if (am) rawRows_(APP.T.ADMAP, ADMAP_HEADERS.length).forEach(r => { st[r[AM.STATUS]] = (st[r[AM.STATUS]] || 0) + 1; });
  const o = ss_().getSheetByName(APP.T.ORDERS), unk = { p: 0, pr: 0 };
  if (o) recentRows_(APP.T.ORDERS, ORDERS_HEADERS.length, 2, sortKey_, todayKey_().slice(0, 8) + '01').filter(r => asKey_(r[2]) >= todayKey_().slice(0, 8) + '01')
    .forEach(r => { if (r[3] === APP.UNKNOWN_PLATFORM) unk.p++; if (r[5] === APP.UNKNOWN_PRODUCT) unk.pr++; });
  const rows = [['نسخة الكود', APP.VERSION], ['مصدر الأوردرات', cfgStr_('orders.method') === 'pixel' ? '⚠️ مشتريات البيكسل' : cfgStr_('orders.method')], ['أول سحب', getStatus_('BACKFILL')], ['آخر مزامنة كاملة', getStatus_('FULL')], ['آخر تحديث خلال اليوم', getStatus_('LIVE')], ['آخر تحديث سريع ⚡', getStatus_('QUICK')],
    ['الأوردرات', getStatus_('ORDERS')], ['أوردرات من غير تاريخ مفهوم', getStatus_('ORDERS_NODATE')], ['ربط الإعلانات', getStatus_('ADMAP')],
    ['إعلانات ❌ / ⚠️ / ✅', st['❌'] + ' / ' + st['⚠️'] + ' / ' + st['✅']],
    ['أوردرات الشهر مش معروف منصتها', unk.p], ['أوردرات الشهر مش معروف منتجها', unk.pr],
    ['صفحات منتجات مش متسجلة', PropertiesService.getDocumentProperties().getProperty('UNASSIGNED_SLUGS') || 'مفيش ✅'],
    ['حسابات إعلانية لقيتها من الأوردرات', getStatus_('ACC_DISCOVER')], ['صرف الكتالوج', getStatus_('CATALOG')]];
  writeRows_(ensureTab_(APP.T.HEALTH, ['البند', 'الحالة']), rows, 2, []);
}

/* Intraday snapshots at intraday.hours (first 20 minutes after each hour). Taken by writeToday_ so the slot shows at once. */
function takeIntraday_() {
  const now = new Date(), h = Number(Utilities.formatDate(now, tz_(), 'H')), m = Number(Utilities.formatDate(now, tz_(), 'm'));
  const hours = cfgList_('intraday.hours').map(Number);
  if (m > 20 || hours.indexOf(h) < 0) return false;
  const day = h === 0 ? shiftKey_(todayKey_(), -1) : todayKey_(), slot = (h === 0 ? 24 : h) + ':00', key = day + '|' + slot;
  const props = PropertiesService.getDocumentProperties();
  if (props.getProperty('INTRA_LAST') === key) return false;
  const sum = summarize_(dailyRows_(), day, day), sh = ensureTab_(APP.T.INTRA, INTRA_HEADERS);
  sh.getRange(1, 1, 1, INTRA_HEADERS.length).setValues([INTRA_HEADERS]); // old tabs had "CPP + tax" and no Revenue
  const cpp = t => (t.orders > 0 ? round2_(t.spend / t.orders) : '');
  const rows = Object.keys(sum.byPlatform).sort().map(p => [day, slot, p, round2_(sum.byPlatform[p].spend), sum.byPlatform[p].orders,
    cpp(sum.byPlatform[p]), round2_(sum.byPlatform[p].revenue)]);
  rows.push([day, slot, 'الإجمالي', round2_(sum.total.spend), sum.total.orders, cpp(sum.total), round2_(sum.total.revenue)]);
  const at = sh.getLastRow() + 1;
  sh.getRange(at, 1, rows.length, 1).setNumberFormat('@');
  sh.getRange(at, 1, rows.length, INTRA_HEADERS.length).setValues(rows);
  props.setProperty('INTRA_LAST', key);
  return true;
}

/* Tests: spend and pixel purchases of every ad whose campaign/ad set/ad name contains the Test ID as a whole token. */
function writeTests_() {
  const sh = ensureTab_(APP.T.TESTS, TESTS_HEADERS);
  if (sh.getLastRow() < 2) return;
  const tests = sh.getRange(2, 1, sh.getLastRow() - 1, TESTS_HEADERS.length).getValues();
  const ads = rawRows_(APP.T.ADS, ADS_HEADERS.length).map(a => ({ text: norm_([a[5], a[7], a[9]].join(' ')), id: String(a[8]), spend: num_(a[10]), pixel: num_(a[13]) }));
  const orders = ss_().getSheetByName(APP.T.ORDERS) ? rawRows_(APP.T.ORDERS, ORDERS_HEADERS.length) : [];
  const prods = products_();
  tests.forEach(t => {
    const id = norm_(t[0]);
    if (!id) return;
    const mine = ads.filter(a => hasToken_(a.text, id)), ids = new Set(mine.map(a => a.id));
    const spend = mine.reduce((s, a) => s + a.spend, 0), pixel = mine.reduce((s, a) => s + a.pixel, 0);
    const ord = orders.filter(o => o[14] && ids.has(String(o[14]))).length;
    const be = breakEven_(prods.find(p => p.name === String(t[1]).trim()));
    t[12] = round2_(spend); t[13] = pixel; t[14] = ord;
    t[15] = ord ? round2_(spend * (1 + taxRate_()) / ord) : '';
    t[16] = signal_(be, { spend: spend, orders: ord });
  });
  sh.getRange(2, 1, tests.length, TESTS_HEADERS.length).setValues(tests);
}

/*
 * opt.quick (the ⚡ button): Daily Log of the last 3 days + Today, nothing else.
 * Default (every 15 minutes): + Closing, Health and the catalog tab.
 * opt.full: the whole Daily Log again (daily run, after a backfill, or when the Ad Map changed in this run),
 * otherwise only its last 3 days. opt.slow: + the heavy period tabs (Product Performance, Tests, المنتجات,
 * تعادل الحسابات), every 2 days and from the 📦 menu button.
 */
function rebuildViews_(opt) {
  if (!opt || typeof opt !== 'object') opt = { slow: !!opt };
  CFG_ = null; PRODUCTS_ = null; KNOWN_PRODUCTS_ = null; // settings / products may have changed; the raw tabs' copies stay valid
  const full = opt.full || opt.slow || ADMAP_CHANGED_ || ORDERS_REREAD_;
  time_('Daily Log', () => rebuildDaily_(full ? '' : shiftKey_(todayKey_(), -2)));
  ADMAP_CHANGED_ = false; ORDERS_REREAD_ = false;
  time_('Today', () => writeToday_());
  if (opt.quick) return;
  writeClosing_(); writeHealth_();
  if (opt.slow) { writePerf_(); writeTests_(); PropertiesService.getDocumentProperties().setProperty('SLOW_VIEWS_AT', String(Date.now())); }
  EXT.views.forEach(f => { try { f(!!opt.slow); } catch (e) { console.error('ext view: ' + errText_(e)); } });
}
function slowViewsDue_() {
  const at = Number(PropertiesService.getDocumentProperties().getProperty('SLOW_VIEWS_AT') || 0);
  return Date.now() - at > 48 * 3600000 && (!DEADLINE_ || DEADLINE_ - Date.now() > 150000);
}

/* Simple trigger: changing the period cells refreshes that view only. */
function onEdit(e) {
  try {
    const sh = e.range.getSheet(), n = sh.getName(), a1 = e.range.getA1Notation();
    if (n === APP.T.PERF && (a1 === 'B2' || a1 === 'B3')) writePerf_();
    if (n === APP.T.CLOSING && a1 === 'B2') writeClosing_();
    EXT.edit.forEach(f => f(n, a1));
  } catch (err) { console.log('onEdit: ' + err); }
}
