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
const INTRA_HEADERS = ['Date', 'Slot', 'Platform', 'Spend', 'Orders', 'CPP + tax'];

function taxRate_() { return cfgNum_('costs.ad_tax_pct') || 0; }

function rebuildDaily_() {
  const idx = adMapIndex_(), agg = new Map(), pixelOrders = cfgStr_('orders.method') === 'pixel';
  const row = (d, pl, pr) => {
    const k = d + '|' + pl + '|' + pr;
    if (!agg.has(k)) agg.set(k, [d, pl, pr, 0, 0, 0, 0, 0, 0, 0, 0]);
    return agg.get(k);
  };
  readRows_(tab_(APP.T.ADS), ADS_HEADERS.length).forEach(a => {
    const d = asKey_(a[0]);
    if (!d) return;
    const m = idx.get(adKey_(a[1], String(a[8] || ''), a[5], a[7], a[9])) || { product: APP.UNMAPPED, exact: false };
    const r = row(d, a[1], m.product), s = num_(a[10]);
    r[3] += s; if (!m.exact) r[4] += s; r[5] += num_(a[11]); r[6] += num_(a[12]); r[7] += num_(a[13]);
    // No real orders source yet: pixel purchases stand in as orders (labelled in Today and Health).
    if (pixelOrders) { r[8] += num_(a[13]); r[10] += num_(a[14]); }
  });
  const osh = ss_().getSheetByName(APP.T.ORDERS);
  if (osh && !pixelOrders) readRows_(osh, ORDERS_HEADERS.length).forEach(o => {
    const d = asKey_(o[2]);
    if (!d) return;
    const r = row(d, o[3], o[5]);
    r[8]++; if (o[15] === true || String(o[15]).toUpperCase() === 'TRUE') r[9]++; r[10] += num_(o[7]);
  });
  const rows = Array.from(agg.values()).map(r => r.map((v, i) => (i >= 3 && i !== 5 && i !== 6 ? round2_(v) : v)))
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : b[3] - a[3]));
  writeRows_(ensureTab_(APP.T.DAILY, DAILY_HEADERS), rows, DAILY_HEADERS.length, [1]);
  return rows;
}

function dailyRows_() { return readRows_(tab_(APP.T.DAILY), DAILY_HEADERS.length).map(r => { r[0] = asKey_(r[0]); return r; }); }

/* Totals for a date range: by platform, by product, overall. */
function summarize_(rows, from, to) {
  const z = () => ({ spend: 0, notExact: 0, imp: 0, clicks: 0, pixel: 0, orders: 0, cancelled: 0, revenue: 0 });
  const out = { total: z(), byPlatform: {}, byProduct: {} };
  rows.forEach(r => {
    if (r[0] < from || r[0] > to) return;
    [out.total, out.byPlatform[r[1]] = out.byPlatform[r[1]] || z(), out.byProduct[r[2]] = out.byProduct[r[2]] || z()].forEach(t => {
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

/* Writes blocks [{title, headers, rows}] starting at row `start`, clearing old content below. */
function writeBlocks_(sh, start, blocks, width) {
  const last = sh.getLastRow();
  if (last >= start) sh.getRange(start, 1, last - start + 1, Math.max(width, sh.getLastColumn())).clearContent().setBackground(null).setFontWeight('normal').setFontColor('#000000');
  let r = start;
  blocks.forEach(b => {
    const pad = x => { const a = x.slice(0, width); while (a.length < width) a.push(''); return a; };
    if (r + b.rows.length + 3 > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), b.rows.length + 5);
    sh.getRange(r, 1, 1, width).setValues([pad([b.title])]).setBackground('#1f2937').setFontColor('#ffffff').setFontWeight('bold');
    r++;
    if (b.headers) { sh.getRange(r, 1, 1, width).setValues([pad(b.headers)]).setBackground('#fff200').setFontWeight('bold').setWrap(true); r++; }
    if (b.rows.length) { sh.getRange(r, 1, b.rows.length, width).setValues(b.rows.map(pad)); r += b.rows.length; }
    r++;
  });
  return r;
}

function kpiRows_(sum, sum30, platform) {
  const t = platform ? sum.byPlatform[platform] : sum.total, b = platform ? sum30.byPlatform[platform] : sum30.total;
  if (!t) return [];
  const calc = x => x ? {
    cpm: x.imp ? x.spend / x.imp * 1000 : '', ctr_link: x.imp ? x.clicks / x.imp : '', cpc_link: x.clicks ? x.spend / x.clicks : '',
    lp_cvr: x.clicks ? x.pixel / x.clicks : '', cpa_orders: x.orders ? x.spend * (1 + taxRate_()) / x.orders : '',
    aov: x.orders ? x.revenue / x.orders : '' } : {};
  const now = calc(t), base = calc(b), bench = {};
  const bsh = ss_().getSheetByName(APP.T.BENCH);
  if (bsh) readRows_(bsh, BENCH_HEADERS.length).forEach(r => {
    if (!r[1] || String(r[1]).toUpperCase() === (platform || 'ALL') || String(r[1]).toUpperCase() === 'ALL') bench[String(r[0]).trim()] = r;
  });
  const names = { cpm: 'CPM', ctr_link: 'Link CTR', cpc_link: 'CPC', lp_cvr: 'Conversion rate', cpa_orders: 'CPA + tax (orders)', aov: 'AOV' };
  return Object.keys(names).map(k => {
    const v = now[k], r = bench[k];
    let status = '';
    if (v !== '' && r && r[2] !== '' && r[4] !== '') {
      const lower = String(r[5]).toLowerCase() === 'lower';
      status = lower ? (v <= r[4] ? 'أقوى من السوق' : v <= r[2] ? 'في المعدل' : 'أضعف من السوق')
        : (v >= r[4] ? 'أقوى من السوق' : v >= r[2] ? 'في المعدل' : 'أضعف من السوق');
    }
    const fmt = x => (x === '' ? '' : round2_(k === 'ctr_link' || k === 'lp_cvr' ? x * 100 : x));
    return [names[k] + (k === 'ctr_link' || k === 'lp_cvr' ? ' %' : ''), fmt(v), fmt(base[k] === undefined ? '' : base[k]),
      r ? [r[2], r[3], r[4]].map(x => (x === '' ? '' : (k === 'ctr_link' || k === 'lp_cvr') ? round2_(x * 100) : x)).join(' / ') : 'ناقص',
      r ? r[8] : '', status];
  });
}

function checksRows_(from, to) {
  const acc = ss_().getSheetByName(APP.T.ACC_RAW), ads = readRows_(tab_(APP.T.ADS), ADS_HEADERS.length);
  const adSum = {}, accSum = {};
  ads.forEach(a => { const d = asKey_(a[0]); if (d >= from && d <= to) adSum[a[1]] = (adSum[a[1]] || 0) + num_(a[10]); });
  if (acc) readRows_(acc, ACC_HEADERS.length).forEach(a => { const d = asKey_(a[0]); if (d >= from && d <= to) accSum[a[1]] = (accSum[a[1]] || 0) + num_(a[4]); });
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

function writeToday_() {
  const sh = ensureTab_(APP.T.TODAY), today = todayKey_(), rows = dailyRows_();
  const sum = summarize_(rows, today, today), sum30 = summarize_(rows, shiftKey_(today, -30), shiftKey_(today, -1));
  const plat = Object.keys(sum.byPlatform).sort().map(p => {
    const t = sum.byPlatform[p];
    return [p, round2_(t.spend), round2_(t.spend * (1 + taxRate_())), t.orders, cpp_(t), round2_(t.revenue), aov_(t), roas_(t), t.pixel, t.cancelled];
  });
  plat.push(['الإجمالي', round2_(sum.total.spend), round2_(sum.total.spend * (1 + taxRate_())), sum.total.orders, cpp_(sum.total),
    round2_(sum.total.revenue), aov_(sum.total), roas_(sum.total), sum.total.pixel, sum.total.cancelled]);
  const intra = ss_().getSheetByName(APP.T.INTRA);
  const intraRows = intra ? readRows_(intra, INTRA_HEADERS.length).filter(r => asKey_(r[0]) === today).map(r => r.slice(1)) : [];
  sh.getRange(1, 1, 4, 2).setValues([['اليوم — ' + (cfgStr_('business.name') || ''), ''], ['التاريخ', today], ['آخر تحديث', nowText_()],
    ['مصدر الأوردرات', cfgStr_('orders.method') === 'pixel' ? '⚠️ مشتريات البيكسل (مش أوردرات حقيقية)' : 'أوردرات المتجر']]);
  sh.getRange(1, 1).setFontWeight('bold').setFontSize(13);
  writeBlocks_(sh, 5, [
    { title: 'الصرف والأوردرات النهارده', headers: ['المنصة', 'الصرف', 'الصرف + الضريبة', 'أوردرات الموقع', 'تكلفة الأوردر + الضريبة', 'المبيعات', 'متوسط الأوردر AOV', 'ROAS الفعلي', 'مشتريات البيكسل', 'ملغي'], rows: plat },
    { title: 'المنتجات النهارده', headers: PRODUCT_TABLE_HEADERS, rows: productTable_(sum) },
    { title: 'لقطات خلال اليوم', headers: INTRA_HEADERS.slice(1), rows: intraRows },
    { title: 'المؤشرات مقابل السوق (المنصة كلها)', headers: ['المؤشر', 'النهارده', 'متوسطك آخر 30 يوم', 'السوق: ضعيف / متوسط / قوي', 'ثقة المصدر', 'الحالة'], rows: kpiRows_(sum, sum30, '') },
    { title: 'فحص الأرقام', headers: ['البند', 'القيمة', 'من', 'الحالة'], rows: checksRows_(today, today) }
  ], 10);
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
  if (am) readRows_(am, ADMAP_HEADERS.length).forEach(r => { st[r[AM.STATUS]] = (st[r[AM.STATUS]] || 0) + 1; });
  const o = ss_().getSheetByName(APP.T.ORDERS), unk = { p: 0, pr: 0 };
  if (o) readRows_(o, ORDERS_HEADERS.length).filter(r => asKey_(r[2]) >= todayKey_().slice(0, 8) + '01')
    .forEach(r => { if (r[3] === APP.UNKNOWN_PLATFORM) unk.p++; if (r[5] === APP.UNKNOWN_PRODUCT) unk.pr++; });
  const rows = [['نسخة الكود', APP.VERSION], ['مصدر الأوردرات', cfgStr_('orders.method') === 'pixel' ? '⚠️ مشتريات البيكسل' : cfgStr_('orders.method')], ['أول سحب', getStatus_('BACKFILL')], ['آخر مزامنة كاملة', getStatus_('FULL')], ['آخر تحديث خلال اليوم', getStatus_('LIVE')],
    ['الأوردرات', getStatus_('ORDERS')], ['أوردرات من غير تاريخ مفهوم', getStatus_('ORDERS_NODATE')], ['ربط الإعلانات', getStatus_('ADMAP')],
    ['إعلانات ❌ / ⚠️ / ✅', st['❌'] + ' / ' + st['⚠️'] + ' / ' + st['✅']],
    ['أوردرات الشهر مش معروف منصتها', unk.p], ['أوردرات الشهر مش معروف منتجها', unk.pr],
    ['صفحات منتجات مش متسجلة', PropertiesService.getDocumentProperties().getProperty('UNASSIGNED_SLUGS') || 'مفيش ✅']];
  writeRows_(ensureTab_(APP.T.HEALTH, ['البند', 'الحالة']), rows, 2, []);
}

/* Intraday snapshots at intraday.hours (first 20 minutes after each hour). */
function takeIntraday_() {
  const now = new Date(), h = Number(Utilities.formatDate(now, tz_(), 'H')), m = Number(Utilities.formatDate(now, tz_(), 'm'));
  const hours = cfgList_('intraday.hours').map(Number);
  if (m > 20 || hours.indexOf(h) < 0) return false;
  const day = h === 0 ? shiftKey_(todayKey_(), -1) : todayKey_(), slot = (h === 0 ? 24 : h) + ':00', key = day + '|' + slot;
  const props = PropertiesService.getDocumentProperties();
  if (props.getProperty('INTRA_LAST') === key) return false;
  const sum = summarize_(dailyRows_(), day, day), sh = ensureTab_(APP.T.INTRA, INTRA_HEADERS);
  const rows = Object.keys(sum.byPlatform).sort().map(p => [day, slot, p, round2_(sum.byPlatform[p].spend), sum.byPlatform[p].orders, cpp_(sum.byPlatform[p])]);
  rows.push([day, slot, 'الإجمالي', round2_(sum.total.spend), sum.total.orders, cpp_(sum.total)]);
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
  const ads = readRows_(tab_(APP.T.ADS), ADS_HEADERS.length).map(a => ({ text: norm_([a[5], a[7], a[9]].join(' ')), id: String(a[8]), spend: num_(a[10]), pixel: num_(a[13]) }));
  const orders = ss_().getSheetByName(APP.T.ORDERS) ? readRows_(tab_(APP.T.ORDERS), ORDERS_HEADERS.length) : [];
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

function rebuildViews_() {
  resetCaches_();
  rebuildDaily_();
  writeToday_(); writePerf_(); writeClosing_(); writeTests_(); writeHealth_();
  EXT.views.forEach(f => { try { f(); } catch (e) { console.error('ext view: ' + errText_(e)); } });
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
