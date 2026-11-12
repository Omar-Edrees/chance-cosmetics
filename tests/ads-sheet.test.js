const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const { FakeSpreadsheet } = require('./fake-google');

/* نفس ID شيت الأوردرات اللي في 00_profile.gs */
const ORDERS_ID = '15rkiOnnON-nobcGxq1ct5tHnocrvS79f454xkQQg6Ys';
const A1 = '1354948596094660', A2 = '1443770363884823', A3 = '1980884485605243';
/* أسامي الحسابات في Meta */
const NAMES = { [A1]: 'Chance 26', [A2]: 'Chance Golden Era', [A3]: 'chance store . egy3' };
const ORDER_HEAD = ['Order ID', 'Created At', 'Products', 'Total Price', 'Phone', 'City', 'UTM Source', 'UTM Campaign', 'UTM Content'];
const STOCK_HEAD = ['Product ID', 'Variant ID', 'Product', 'Variant', 'SKU', 'Handle', 'Stock', 'Price'];

/* أي builder من جوجل (تنسيق شرطي، Data validation): كل دالة بترجع نفسه، و build بيرجع اللي اتكتب */
function builder() {
  const calls = [];
  const b = new Proxy({}, { get: (_, k) => (k === 'build' ? () => calls.slice() : (...a) => { calls.push([k, a]); return b; }) });
  return b;
}

/* شيت وهمي + Meta وهمية. ads: صفوف insights على مستوى الإعلان لكل حساب. */
function env(options) {
  const opt = options || {};
  const doc = {}, user = { META_TOKEN: 'TOKEN' }, alerts = [], requests = [];
  const store = o => ({ getProperty: k => (k in o ? o[k] : null), setProperty: (k, v) => { o[k] = v; }, deleteProperty: k => { delete o[k]; },
    setProperties: m => { Object.keys(m).forEach(k => { o[k] = String(m[k]); }); } });
  const active = new FakeSpreadsheet('Chance Ads');
  active.setActiveSheet = () => {};
  const source = new FakeSpreadsheet('Chance orders', ORDERS_ID);
  source.getSpreadsheetTimeZone = () => 'Africa/Cairo';
  source.addSheet('orders', [opt.orderHead || ORDER_HEAD].concat(opt.orders || []));
  source.addSheet('stock', [STOCK_HEAD].concat(opt.stock || []));
  const ads = opt.ads || {}, creatives = opt.creatives || {}, activeAds = opt.activeAds || {};
  const reply = url => {
    requests.push(url);
    const id = (url.match(/act_(\d+)/) || [])[1];
    if (/\/insights\?/.test(url) && /breakdowns=product_id/.test(url)) { // كتالوج: الصرف لكل منتج
      const t = JSON.parse(decodeURIComponent(url.match(/time_range=([^&]+)/)[1]));
      return { data: ((opt.catalog || {})[id] || []).filter(r => r.date_start >= t.since && r.date_start <= t.until) };
    }
    if (/\/insights\?/.test(url) && /level=ad&/.test(url)) { // strictRange: زي Meta بالظبط، الفترة اللي اتطلبت بس
      const t = JSON.parse(decodeURIComponent(url.match(/time_range=([^&]+)/)[1]));
      return { data: (ads[id] || []).filter(r => !opt.strictRange || (r.date_start >= t.since && r.date_start <= t.until)) };
    }
    if (/\/insights\?/.test(url) && !/time_increment/.test(url)) { // تاب Today: الفانل لكل حساب في فترة
      const t = JSON.parse(decodeURIComponent(url.match(/time_range=([^&]+)/)[1])), mine = (ads[id] || []).filter(r => r.date_start >= t.since && r.date_start <= t.until);
      if (!mine.length) return { data: [] };
      const n = mine.length, act = (k, v) => ({ action_type: k, value: String(v * n) });
      return { data: [{ spend: String(mine.reduce((x, r) => x + Number(r.spend), 0)), impressions: String(1000 * n), clicks: String(50 * n),
        inline_link_clicks: String(20 * n), actions: [act('landing_page_view', 15), act('offsite_conversion.fb_pixel_view_content', 10),
          act('offsite_conversion.fb_pixel_purchase', 2), act('offsite_conversion.fb_pixel_add_to_cart', 4),
          act('offsite_conversion.fb_pixel_initiate_checkout', 3)], action_values: [act('offsite_conversion.fb_pixel_purchase', 900)] }] };
    }
    if (/\/insights\?/.test(url)) { // مستوى الحساب يوم بيوم، أو شهر بشهر (time_increment=monthly)
      const byDay = {}, monthly = /time_increment=monthly/.test(url), tr = url.match(/time_range=([^&]+)/);
      const t = tr ? JSON.parse(decodeURIComponent(tr[1])) : { since: '', until: '9999' };
      (ads[id] || []).filter(r => !monthly || (r.date_start >= t.since && r.date_start <= t.until)).forEach(r => {
        const k = monthly ? r.date_start.slice(0, 8) + '01' : r.date_start, x = byDay[k] = byDay[k] || { spend: 0, buys: 0, imp: 0 };
        x.spend += Number(r.spend); x.buys += 2; x.imp += 1000;
      });
      return { data: Object.keys(byDay).map(d => ({ date_start: d, spend: String(byDay[d].spend), impressions: String(byDay[d].imp),
        actions: [{ action_type: 'offsite_conversion.fb_pixel_purchase', value: String(byDay[d].buys) }] })) };
    }
    if (/\/ads\?/.test(url)) return { data: (activeAds[id] || []).map(x => ({ id: x, campaign_id: 'C1' })) };
    const adId = (url.match(/\/v[\d.]+\/(\d+)\?/) || [])[1];
    if (adId && creatives[adId]) return { creative: { object_story_spec: { link_data: { link: creatives[adId] } } } };
    const obj = (url.match(/\/v[\d.]+\/(\d+)\?/) || [])[1];
    if (obj && (opt.objects || {})[obj]) return opt.objects[obj];
    if (obj && !id) throw new Error('Meta code 100: Unsupported get request');
    if (id && /fields=account_status/.test(url)) { // رصيد الحساب
      const x = (opt.accInfo || {})[id] || {};
      if (x.noFunding && /funding_source_details/.test(url)) return { error: { code: 200, message: 'Permissions error' } };
      return Object.assign({ id: 'act_' + id, account_status: 1 }, x);
    }
    return { id: 'act_' + id, name: (opt.names || NAMES)[id] };
  };
  const shop = url => { // صفحة منتج في المتجر: /products/<handle>.js
    const m = url.match(/\/products\/([^/?]+)\.js$/), p = m && (opt.shop || {})[decodeURIComponent(m[1])];
    return p ? { code: 200, body: p } : { code: 404, body: {} };
  };
  const response = url => {
    if (!/graph\.facebook\.com/.test(url)) { requests.push(url); const r = shop(url); return { getResponseCode: () => r.code, getContentText: () => JSON.stringify(r.body) }; }
    const body = reply(url); return { getResponseCode: () => 200, getContentText: () => JSON.stringify(body) };
  };
  const triggers = [];
  const trigger = fn => { const b = { timeBased: () => b, everyMinutes: () => b, atHour: () => b, nearMinute: () => b, everyDays: () => b,
    inTimezone: () => b, create: () => { const t = { getHandlerFunction: () => fn }; triggers.push(t); return t; } }; return b; };
  const c = load('ads-sheet', {
    SpreadsheetApp: {
      getActive: () => active, openById: id => { if (id !== ORDERS_ID) throw new Error('not found ' + id); return source; },
      newDataValidation: builder, newConditionalFormatRule: builder, ProtectionType: { SHEET: 'SHEET', RANGE: 'RANGE' },
      getUi: () => ({ alert: m => { alerts.push(m); } }),
    },
    PropertiesService: { getDocumentProperties: () => store(doc), getUserProperties: () => store(user) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    UrlFetchApp: { fetch: url => response(url), fetchAll: reqs => reqs.map(r => response(r.url)) },
    Charts: { ChartType: { LINE: 'LINE', COLUMN: 'COLUMN', BAR: 'BAR', PIE: 'PIE', COMBO: 'COMBO' }, ChartHiddenDimensionStrategy: { SHOW_BOTH: 'SHOW_BOTH' } },
    ScriptApp: { getProjectTriggers: () => triggers.slice(), deleteTrigger: t => triggers.splice(triggers.indexOf(t), 1), newTrigger: trigger },
  });
  // The real archive (12k old orders) only where a test asks for it; opt.archive = [orders] gives a small one.
  if (opt.archive !== true) { const arch = typeof opt.archive === 'function' ? opt.archive(c) : opt.archive || []; c.archiveOrders_ = () => arch; }
  // The real stock read from Shopify (23_stock_snapshot.gs) only where a test asks for it; opt.snapshot = {title: units} gives a small one.
  if (opt.snapshot !== true) { const snap = opt.snapshot || {}; c.stockSnapshot_ = () => Object.assign({}, snap); }
  return { c, ss: active, source, doc, user, alerts, requests, triggers };
}

const adRow = (date, adId, spend, ad) => ({ date_start: date, campaign_id: 'C1', campaign_name: 'Camp', adset_id: 'S1', adset_name: 'Set',
  ad_id: adId, ad_name: ad || 'Ad ' + adId, spend: String(spend), impressions: '1000', inline_link_clicks: '20',
  actions: [{ action_type: 'offsite_conversion.fb_pixel_purchase', value: '2' }],
  action_values: [{ action_type: 'offsite_conversion.fb_pixel_purchase', value: '900' }] });

/* البلوك اللي عنوانه title في تاب: صفوفه بعد صف العناوين لحد أول صف فاضي */
function block(sheet, title) {
  const v = sheet.getDataRange().getValues(), i = v.findIndex(r => r[0] === title || String(r[0]).indexOf(title) === 0);
  assert.ok(i >= 0, 'مش لاقي البلوك: ' + title);
  const out = [];
  for (let r = i + 2; r < v.length && v[r].some(x => x !== ''); r++) out.push(v[r]);
  return out;
}

/* بلوك من writeSideBlocks_: العنوان في أي عمود، والبلوك عرضه قد عناوين الأعمدة اللي تحته. */
function sideBlock(sheet, title) {
  const v = sheet.getDataRange().getValues();
  for (let i = 0; i < v.length - 1; i++) {
    const c = v[i].findIndex(x => String(x).indexOf(title) === 0);
    if (c < 0) continue;
    let w = 0;
    while (c + w < v[i + 1].length && v[i + 1][c + w] !== '') w++;
    const out = [];
    for (let r = i + 2; r < v.length && v[r].slice(c, c + w).some(x => x !== ''); r++) out.push(v[r].slice(c, c + w));
    return out;
  }
  assert.fail('مش لاقي البلوك: ' + title);
}

function scenario() {
  const probe = env();
  const today = probe.c.todayKey_(), yest = probe.c.shiftKey_(today, -1);
  const iso = (day, hm) => day + 'T' + hm + ':00+03:00'; // اليوم كله بتوقيت القاهرة (مفيش توقيت صيفي في الاختبار ده)
  const e = env({
    ads: { [A1]: [adRow(today, '111', 600), adRow(today, '222', 400), adRow(yest, '111', 300)], [A2]: [adRow(today, '333', 100)] },
    creatives: { 111: 'https://chance-cosmetics.com/products/lip-oil?utm_source=fb', 222: 'https://chance-cosmetics.com/collections/all',
      333: 'https://chance-cosmetics.com/products/blush' },
    activeAds: { [A1]: ['111'] },
    orders: [
      ['#1001', iso(today, '10:00'), 'Lip Oil x2 | Blush x1', 750, '01001234567', 'Cairo', 'fb', 'Camp', ''],
      ['#1002', iso(today, '11:30'), 'Lip Oil x1', 300, '01001234568', 'Giza', 'facebook', 'Camp', ''],
      ['#1003', iso(today, '12:00'), 'Blush x1', 250, '01001234569', 'Alex', 'tiktok', 'TT', ''],
      ['#1004', iso(yest, '20:00'), 'Lip Oil x1', 300, '01001234560', 'Cairo', '', '', ''],
    ],
    stock: [
      ['P1', 'V1', 'Lip Oil', 'Default Title', 'LO', 'lip-oil', 40, 300],
      ['P2', 'V2', 'Blush', 'Pink', 'BL1', 'blush', 5, 250],
      ['P2', 'V3', 'Blush', 'Peach', 'BL2', 'blush', 0, 250],
    ],
  });
  e.c.setupAll();
  e.c.liveTick(); // أول مرة: المنتجات بتتضاف من شيت الستوك
  e.c.liveTick(); // التانية: الأوردرات بتتربط بالمنتجات اللي اتضافت
  return Object.assign(e, { today, yest });
}

test('الإعداد بيعمل التابات من البروفايل ومابيمسحش حاجة', () => {
  const e = env();
  e.c.setupAll();
  const names = e.ss.getSheets().map(s => s.getName());
  ['Settings', 'Accounts', 'Products', 'Ad Map', 'Today', 'Closing', 'المنتجات', 'تعادل الحسابات', 'TikTok Data']
    .forEach(n => assert.ok(names.includes(n), 'ناقص تاب ' + n));
  const settings = e.ss.getSheetByName('Settings').getDataRange().getValues();
  assert.equal(settings.find(r => r[0] === 'business.name')[1], 'Chance Cosmetics');
  assert.ok(settings.some(r => r[0] === 'stock.sheet_tab'), 'إعدادات الستوك موجودة');
  assert.equal(e.ss.getSheetByName('Accounts').getLastRow(), 5);
  e.ss.getSheetByName('Accounts').getRange(2, 3).setValue('اسم اتغير');
  e.c.setupAll();
  assert.equal(e.ss.getSheetByName('Accounts').getRange(2, 3).getValue(), 'اسم اتغير');
});

/* صف في تاب Today بالعنوان اللي في عمود col */
function todayRow(e, label, col) {
  return e.ss.getSheetByName('Today').getDataRange().getValues().find(r => r[(col || 1) - 1] === label);
}

test('Today: صف لكل حساب بأرقام المنصة، والإجماليات من أوردرات الموقع، ومن غير 14%', () => {
  const e = scenario(), tab = e.ss.getSheetByName('Today');
  assert.match(String(tab.getRange(1, 1).getValue()), /CHANCE COSMETICS — DAILY AD CLOSING/);
  assert.deepEqual(tab.getRange(8, 1, 1, 6).getValues()[0].map(h => String(h).split(' ')[0]),
    ['PLATFORM', 'AD', 'AMOUNT', 'ORDERS', 'CPP', 'ROAS']);
  const all = tab.getDataRange().getValues().map(r => r.slice(0, 6));
  assert.ok(!all.flat().some(v => /14%|ضريبة/.test(String(v))), 'مفيش 14% في الجدول');
  const acc1 = all.find(r => r[1] === 'Chance 26'), acc2 = all.find(r => r[1] === 'Chance Golden Era'), acc3 = all.find(r => r[1] === 'chance store . egy3');
  assert.deepEqual(acc1.slice(2), [1000, 4, 250, 1.8]);
  assert.deepEqual(acc2.slice(2), [100, 2, 50, 9]);
  assert.deepEqual(acc3.slice(2), [0, 0, '', '']);
  assert.equal(all[8][0], 'META');
  const meta = all.find(r => r[0] === 'META TOTAL'), tt = all.find(r => r[0] === 'TIKTOK TOTAL'), grand = all.find(r => r[0] === 'GRAND TOTAL');
  assert.deepEqual(meta.slice(2), [1100, 2, 550, 0.95]);
  assert.deepEqual(tt.slice(2), [0, 1, 0, '']);
  assert.deepEqual(grand.slice(2), [1100, 3, 366.67, 1.18]);
  assert.ok(all.some(r => r[0] === 'TIKTOK' && r[1] === 'TikTok'));
  assert.match(String(e.c.getStatus_('LIVE')), /✓ OK/);
});

test('Today: لقطات الـ 3 ساعات من تاب Intraday، مع CPP و Shopify ROAS، وأوردرات DIRECT مع Meta', () => {
  const e = scenario();
  // اللقطات بتتاخد من الساعة الحقيقية: التاب يبقى بلقطة 3 بس، عشان الاختبار مايتأثرش بساعة تشغيله
  const intra = e.ss.getSheetByName('Intraday');
  e.c.writeRows_(intra, [], 7, []);
  e.doc.INTRA_LAST = 'x'; e.c.takeIntraday_ = () => false;
  e.ss.getSheetByName('Intraday').appendRow([e.today, '15:00', 'META', 500, 2, 250, 1000]);
  e.ss.getSheetByName('Intraday').appendRow([e.today, '15:00', 'DIRECT', 0, 1, '', 250]);
  e.ss.getSheetByName('Intraday').appendRow([e.today, '15:00', 'الإجمالي', 500, 3, 166.67, 1250]);
  e.c.writeToday_();
  const values = e.ss.getSheetByName('Today').getDataRange().getValues();
  const head = values.find(r => r[7] === 'TIME');
  assert.deepEqual(head.slice(7, 16), ['TIME', 'META SPEND', 'ORDERS (META + DIRECT)', 'CPP (META + DIRECT)', 'SHOPIFY ROAS (META + DIRECT)', 'TIKTOK SPEND', 'TIKTOK ORDERS', 'TIKTOK CPP', 'SHOPIFY ROAS (TIKTOK)']);
  assert.deepEqual(values.filter(r => /^\d+:00 [AP]M$/.test(r[7])).map(r => r[7]), ['12:00 PM', '3:00 PM', '6:00 PM', '9:00 PM', '12:00 AM']);
  assert.deepEqual(todayRow(e, '3:00 PM', 8).slice(7, 16), ['3:00 PM', 500, 3, 166.67, 2.5, 0, 0, '', '']);
  assert.deepEqual(todayRow(e, '6:00 PM', 8).slice(8, 16), ['', '', '', '', '', '', '', '']);
  // صفوف قديمة: الشيت كان بيحوّل "18:00" لوقت (تاريخ 1899)، وبتتقري برضه
  e.ss.getSheetByName('Intraday').appendRow([e.today, e.c.makeDate('1899-12-30T18:00:00+02:00'), 'META', 800, 4, 200, 2400]);
  e.c.writeToday_();
  assert.deepEqual(todayRow(e, '6:00 PM', 8).slice(7, 12), ['6:00 PM', 800, 4, 200, 3]);
});

test('Today: بنشمارك Meta، أحسن شهر من التلات شهور اللي فاتوا مقابل كل حساب النهارده، بترتيب الفانل', () => {
  const probe = env(), today = probe.c.todayKey_(), p = today.split('-').map(Number);
  const day = i => new Date(Date.UTC(p[0], p[1] - 1 - i, 10)).toISOString().slice(0, 10);
  // كل صف = 1000 ظهور و 2 شراية: CPM الشهر = الصرف، وتكلفة الشراية = الصرف ÷ 2
  const e = env({ ads: { [A1]: [adRow(today, '111', 600), adRow(day(1), '111', 300), adRow(day(2), '111', 200), adRow(day(3), '111', 500),
    adRow(day(4), '111', 50)] } });
  e.c.setupAll();
  e.c.liveTick();
  const values = e.ss.getSheetByName('Today').getDataRange().getValues();
  const head = values.find(r => r[7] === 'METRIC');
  assert.deepEqual(head.slice(7, 12), ['METRIC', 'BEST MONTH (LAST 3 MONTHS)', 'Chance 26', 'Chance Golden Era', 'chance store . egy3']);
  const metrics = values.map(r => r[7]), first = metrics.indexOf('METRIC') + 1;
  assert.deepEqual(metrics.slice(first, first + 18), ['Meta ROAS', 'AOV', 'CVR', 'CPM', 'CPC (all)', 'CPC (link)', 'CTR (all)', 'CTR (link)',
    'Hook rate', 'Hold rate', 'Cost per content view', 'Link click → LPV', 'Cost per LPV', 'Content view → ATC', 'ATC → Checkout',
    'Checkout → Purchase', 'LPV → Purchase', '']);
  const row = l => values.find(r => r[7] === l).slice(7, 12);
  // أحسن شهر: أقل CPM (200) من التلات شهور، مش الشهر الرابع (50)؛ والنهارده 600 أسوأ
  assert.deepEqual(row('CPM'), ['CPM', 200, 600, '—', '—']);
  assert.deepEqual(row('AOV'), ['AOV', '—', 450, '—', '—']);
  assert.deepEqual(row('Meta ROAS'), ['Meta ROAS', '—', 1.5, '—', '—']);
  assert.deepEqual(row('Checkout → Purchase'), ['Checkout → Purchase', '—', 2 / 3, '—', '—']);
  assert.deepEqual(row('Hook rate'), ['Hook rate', '—', '—', '—', '—'], 'مفيش فيديو: فاضي مش 0%');
  const t = e.requests.filter(u => /time_increment=monthly/.test(u) && /level=account/.test(u) && /video_thruplay/.test(u))
    .map(u => JSON.parse(decodeURIComponent(u.match(/time_range=([^&]+)/)[1])));
  assert.ok(t.some(x => x.since === day(3).slice(0, 8) + '01' && x.until === e.c.shiftKey_(today.slice(0, 8) + '01', -1)), 'التلات شهور اللي قبل الشهر ده');
  const cpm = values.find(r => r[7] === 'CPM');
  assert.equal(e.ss.getSheetByName('Today').attr(values.indexOf(cpm) + 1, 10).bg, '#f4cccc');
  // Hook و Hold من الفيديو: 3 ثواني ÷ الظهور، و ThruPlay ÷ 3 ثواني
  const raw = e.c.funnelRaw_([{ impressions: '1000', actions: [{ action_type: 'video_view', value: '300' }], video_thruplay_watched_actions: [{ action_type: 'video_view', value: '60' }] }]);
  assert.deepEqual([raw.videoViews, raw.thruplays], [300, 60]);
  assert.deepEqual([e.c.funnelRatio_(raw, ['Hook rate', 'videoViews', 'impressions', 1, 'pct', false, true]),
    e.c.funnelRatio_(raw, ['Hold rate', 'thruplays', 'videoViews', 1, 'pct', false])], [0.3, 0.2]);
  // معدل خطوة فوق 100% مايتاخدش لو فيه شهر تحته
  assert.equal(e.c.funnelBest_([{ checkouts: 10, purchases: 12 }, { checkouts: 10, purchases: 5 }], ['Checkout → Purchase', 'purchases', 'checkouts', 1, 'pct', false]), 0.5);
});

test('Today: أداء المنتجات بالقطع والمبيعات لكل منتج، والإجمالي فيه القطع والأوردرات والصرف و AOV و ROAS', () => {
  const e = scenario(), values = e.ss.getSheetByName('Today').getDataRange().getValues();
  const titles = values.map(r => String(r[7])).filter(t => /^PRODUCT PERFORMANCE/.test(t));
  assert.equal(titles.length, 2);
  const heads = values.filter(r => r[7] === 'PRODUCT');
  assert.equal(heads.length, 2);
  heads.forEach(h => assert.deepEqual(h.slice(7, 15), ['PRODUCT', 'PIECES', 'ORDERS', 'REVENUE', 'SPEND', 'AOV', 'SHOPIFY ROAS', '']));
  // كل قطعة على منتجها، ومبيعات الأوردر 1001 (750) متقسمة بسعر Lip Oil (300) و Blush (250). أوردر TikTok داخل.
  const i = values.findIndex(r => r[7] === 'PRODUCT');
  assert.deepEqual(values.slice(i + 1, i + 4).map(r => r.slice(7, 14)), [
    ['Lip Oil', 3, '', 829.41, '', '', ''],
    ['Blush', 2, '', 470.59, '', '', ''],
    ['TOTAL', 5, 3, 1300, 1100, 433.33, 1.18],
  ]);
});

test('ربط الإعلانات بالمنتجات من لينك صفحة المنتج، والكوليكشن مش مربوط طول ما دومين المتجر فاضي', () => {
  const e = scenario();
  const spend = n => e.c.dailyRows_().filter(r => r[0] === e.today && r[1] === 'META' && r[2] === n).reduce((a, r) => a + r[3], 0);
  assert.equal(spend('Lip Oil'), 600);
  assert.equal(spend('Blush'), 100);
  // business.store_domains فاضي في البروفايل، فلينك الكوليكشن مابيتعرفش MULTI
  assert.equal(spend('❌ صرف مش مربوط بمنتج'), 400);
  const map = e.ss.getSheetByName('Ad Map').getDataRange().getValues().slice(1);
  assert.equal(map.find(r => r[0] === '111')[9], 'LINK');
  assert.equal(map.find(r => r[0] === '222')[9], 'NONE');
});

/* Closing: صف بالاسم اللي في عمود A (اليوم "Sat 07-Nov"، أو WEEK 1 TOTAL، أو MONTH TOTAL) كأوبجكت بعناوين الأعمدة. */
function closingRow(sheet, label) {
  const v = sheet.getDataRange().getValues(), head = v.find(r => r[0] === 'DATE'), r = v.find(x => x[0] === label);
  assert.ok(head && r, 'مش لاقي في Closing: ' + label);
  const o = {};
  head.forEach((h, i) => { o[h] = r[i]; });
  return o;
}
function dayLabel(c, key) {
  const p = key.split('-').map(Number);
  return c.Utilities.formatDate(new Date(Date.UTC(p[0], p[1] - 1, p[2], 12)), 'UTC', 'EEE dd-MMM');
}

test('Closing: يوم بيوم والأسبوع والشهر من نفس الأرقام، والشهر ده بس', () => {
  const e = scenario(), sh = e.ss.getSheetByName('Closing'), v = sh.getDataRange().getValues();
  assert.equal(sh.getLastColumn(), 14, 'مفيش أعمدة زيادة جنب الجدول');
  const day = closingRow(sh, dayLabel(e.c, e.today)), month = closingRow(sh, 'MONTH TOTAL');
  assert.equal(day['TOTAL SPEND'], 1100);
  assert.equal(day['TOTAL ORDERS'], 3);
  assert.equal(day['TOTAL UNITS'], 5, 'Lip Oil x2 | Blush x1 + Lip Oil x1 + Blush x1');
  assert.equal(day.UPO, 1.67);
  assert.equal(day.CPL, 367);
  const sameMonth = e.yest.slice(0, 7) === e.today.slice(0, 7);
  assert.equal(month['TOTAL SPEND'], sameMonth ? 1400 : 1100);
  assert.equal(month['TOTAL ORDERS'], sameMonth ? 4 : 3);
  assert.equal(v.filter(r => /^WEEK \d TOTAL$/.test(r[0])).length, 4, '4 أسابيع زي House of Beauty');
  const days = e.c.closingDays_(e.today.slice(0, 7));
  assert.ok(v.some(r => r[0] === dayLabel(e.c, e.today.slice(0, 8) + days)), 'آخر يوم في الشهر موجود');
  const next = e.c.shiftKey_(e.today, 1);
  if (next.slice(0, 7) === e.today.slice(0, 7)) assert.equal(closingRow(sh, dayLabel(e.c, next))['TOTAL SPEND'], '', 'الأيام اللي لسه ماجتش فاضية');
  assert.deepEqual(v.find(r => r[0] === 'DATE'), ['DATE', 'TOTAL SPEND', 'TOTAL ORDERS', 'ROAS', 'ACTUAL ROAS', 'AOV', 'REVENUE', 'TOTAL UNITS', 'UPO',
    'CONFIRMED ORDERS', 'DELIVERED ORDERS', 'CPL', 'CPO', 'CROSS-SELL REVENUE']);
});

test('Closing: الأعمدة اللي على يمين الجدول من الشكل القديم بتتمسح', () => {
  const e = scenario(), sh = e.ss.getSheetByName('Closing');
  sh.getRange(10, 15, 1, 2).setValues([['AOV قديم', 1313.4]]);
  e.c.liveTick();
  assert.equal(sh.getLastColumn(), 14);
});

test('Closing: المتأكد والمتسلم و REVENUE الفعلي والكروس سيل من حالة شوبيفاي، والأيام بعد آخر قراية فاضية', () => {
  const probe = env(), today = probe.c.todayKey_(), month = today.slice(0, 7), d1 = month + '-01', d2 = month + '-02', B = '(blank)';
  const flow = (id, day, total, products) => ['gid://shopify/Order/' + id, ' #' + id, ' N', B, total, ' ' + day + 'T10:00:00+03:00', B, B, B, B, B, '', '', '', '', products, 'web'];
  const e = env({ orderHead: FLOW_HEAD.slice(0, 17), ads: { [A1]: [adRow(d1, '111', 1000), adRow(d2, '111', 500)] },
    orders: [flow(1, d1, 500, 'Lip Oil x1'), flow(2, d1, 300, 'Lip Oil x1'), flow(3, d1, 200, 'Blush x1'), flow(4, d1, 400, 'Blush x1'), flow(5, d2, 600, 'Blush x1')] });
  const st = { 1: { code: 'D', revenue: 800, cross: 300, units: 3 }, 2: { code: 'D', revenue: null, cross: 0, units: null }, 3: { code: 'R', revenue: null },
    4: { code: 'C', revenue: null } };
  e.c.orderStatus_ = id => st[String(id).split('/').pop()] || null;
  e.c.orderStatusDay_ = () => d1;
  e.c.setupAll();
  e.c.liveTick(); e.c.liveTick();
  const sh = e.ss.getSheetByName('Closing'), a = closingRow(sh, dayLabel(e.c, d1));
  assert.deepEqual([a['TOTAL SPEND'], a['TOTAL ORDERS'], a.ROAS, a.AOV, a['TOTAL UNITS'], a['CONFIRMED ORDERS'], a['DELIVERED ORDERS'], a.REVENUE,
    a['ACTUAL ROAS'], a.CPO, a['CROSS-SELL REVENUE'], a.CPL], [1000, 4, 1.4, 350, 6, 3, 2, 1100, 1.1, 500, 300, 250],
  'المتسلم: أوردر 1 (اتزود عليه 300 بعد ما اتعمل) وأوردر 2؛ والقطع من شوبيفاي لأوردر 1');
  if (today >= d2) {
    const b = closingRow(sh, dayLabel(e.c, d2));
    assert.deepEqual([b['TOTAL ORDERS'], b['CONFIRMED ORDERS'], b.REVENUE, b['ACTUAL ROAS']], [1, '', '', ''], 'بعد آخر قراية للحالة: فاضي');
    const w = closingRow(sh, 'WEEK 1 TOTAL');
    assert.deepEqual([w['TOTAL SPEND'], w['ACTUAL ROAS'], w.CPO], [1500, 1.1, 500], 'ACTUAL ROAS و CPO للأسبوع على صرف الأيام اللي ليها حالة بس');
  }
});

test('Closing: الشهر اللي خلص بيتنقل مرة واحدة لتاب أرشيف ثابت، بعد ما التحديث اليومي يسحب آخر يوم فيه', () => {
  const probe = env(), today = probe.c.todayKey_(), prev = probe.c.closingPrevMonth_(today.slice(0, 7)), last = prev + '-' + probe.c.closingDays_(prev);
  const B = '(blank)', name = probe.c.closingArchiveName_(prev);
  const e = env({ orderHead: FLOW_HEAD.slice(0, 17), ads: { [A1]: [adRow(prev + '-03', '111', 900), adRow(today, '111', 100)] },
    orders: [['gid://shopify/Order/1', ' #1', ' N', B, 450, ' ' + prev + '-03T10:00:00+03:00', B, B, B, B, B, '', '', '', '', 'Lip Oil x2', 'web']] });
  e.doc.SYNCED_THROUGH = e.c.shiftKey_(last, -1);
  e.c.setupAll();
  e.c.liveTick(); e.c.liveTick();
  assert.equal(e.ss.getSheetByName(name), null, 'لسه التحديث اليومي ماسحبش آخر يوم في الشهر');
  e.doc.SYNCED_THROUGH = last;
  e.c.liveTick();
  const arch = e.ss.getSheetByName(name);
  assert.ok(arch, 'اتعمل تاب ' + name);
  const m = closingRow(arch, 'MONTH TOTAL');
  assert.deepEqual([m['TOTAL SPEND'], m['TOTAL ORDERS'], m['TOTAL UNITS']], [900, 1, 2]);
  assert.match(String(arch.getRange(1, 1).getValue()), /CLOSING ARCHIVE/);
  assert.equal(e.doc.CLOSING_ARCHIVED, prev);
  assert.equal(closingRow(e.ss.getSheetByName('Closing'), 'MONTH TOTAL')['TOTAL SPEND'], 100, 'Closing فيه الشهر ده بس');
  arch.getRange(1, 1).setValue('اتلمس');
  e.c.liveTick();
  assert.equal(arch.getRange(1, 1).getValue(), 'اتلمس', 'الأرشيف مابيتكتبش تاني لوحده');
});

test('تاب المنتجات: الستوك من شوبيفاي، والقطع المباعة، والإعلان الشغال', () => {
  const e = scenario();
  const rows = block(e.ss.getSheetByName('المنتجات'), 'المنتجات من ');
  const lip = rows.find(r => r[1] === 'Lip Oil'), blush = rows.find(r => r[1] === 'Blush');
  const sameMonth = e.yest.slice(0, 7) === e.today.slice(0, 7);
  assert.equal(lip[0], '✅');
  assert.equal(lip[2], 40);
  assert.equal(lip[4], sameMonth ? 4 : 3);
  assert.equal(blush[0], '');
  assert.equal(blush[2], 5);
  assert.equal(blush[4], 2);
  const products = e.ss.getSheetByName('Products').getDataRange().getValues();
  assert.deepEqual(products.slice(1).map(r => [r[0], r[2], r[5]]).sort(), [['Blush', 'blush', 250], ['Lip Oil', 'lip-oil', 300]]);
});

test('Meta بتتقري بس: مفيش أي طلب كتابة', () => {
  const e = scenario();
  assert.ok(e.requests.length > 0);
  e.requests.filter(u => !/\/products\/[^/]+\.js$/.test(u)).forEach(u => assert.match(u, /^https:\/\/graph\.facebook\.com\//));
});

test('نقطة التعادل للأوردر (COD)', () => {
  const e = env();
  e.c.setupAll();
  const p = { price: 300, cost: 100, shipping: 50, other: 10, confirm: 0.8, delivery: 0.75 };
  assert.equal(Math.round(e.c.breakEven_(p) * 100) / 100, 0.8 * (0.75 * 200 - 50 - 10));
  assert.equal(e.c.breakEven_(Object.assign({}, p, { cost: null })), null);
});

test('أسامي الحسابات من Meta، والاسم اللي اتكتب بالإيد بيفضل', () => {
  const e = env();
  e.c.setupAll();
  const acc = e.ss.getSheetByName('Accounts');
  acc.getRange(3, 3).setValue('حسابي');
  e.c.refreshAccountNames_();
  assert.deepEqual(acc.getRange(2, 3, 4, 1).getValues().map(r => r[0]), ['Chance 26', 'حسابي', 'chance store . egy3', 'TikTok']);
  // الاسم اتغير في Meta: الاسم اللي الشيت كتبه بيتغير معاه، والمكتوب بالإيد لأ (مرة في اليوم)
  e.doc.ACC_NAMES_DAY = '';
  NAMES[A1] = 'Chance 26 New';
  try { e.c.refreshAccountNames_(); } finally { NAMES[A1] = 'Chance 26'; }
  assert.equal(acc.getRange(2, 3).getValue(), 'Chance 26 New');
  assert.equal(acc.getRange(3, 3).getValue(), 'حسابي');
});

/* شيت الأوردرات زي ما Shopify Flow بيكتبه، ومعاه أعمدة فورم الكاش أون ديليفري */
const FLOW_HEAD = ['Order ID', 'Order Number', 'Customer Name', 'Customer Email', 'Total Price', 'Created At', 'UTM Source', 'UTM Medium',
  'UTM Campaign', 'UTM Content', 'UTM Term', 'Attr UTM Source', 'Attr UTM Campaign', 'Attr UTM Content', 'Order Referrer', 'Products', 'Source Name',
  'Attr UTM ID', 'Attr UTM Term'];

test('أوردرات Flow: "(blank)" فاضي، والمصدر من بيانات الفورم، والمنتجات من عمود Products، وعناوين الأعمدة بتتكتب لوحدها', () => {
  const AD = '120256366885940102', probe = env(), today = probe.c.todayKey_(), at = hm => ' ' + today + 'T' + hm + ':00+03:00';
  const B = '(blank)', flow = (id, hm, total, a, products, src) => ['gid://shopify/Order/' + id, ' #' + id, ' Name', B, total, at(hm), B, B, B, B, B]
    .concat(a, products === undefined ? [] : [products, src || '4655075']);
  const e = env({ orderHead: FLOW_HEAD.slice(0, 11), ads: { [A1]: [adRow(today, AD, 600)] },
    creatives: { [AD]: 'https://chance-cosmetics.com/products/lip-oil' },
    stock: [['P1', 'V1', 'Lip Oil', 'Default Title', 'LO', 'lip-oil', 40, 300]],
    orders: [
      flow(1, '10:00', 434, ['facebook', '120256366878570102', AD, 'Instagram'], 'Lip Oil x1'),
      flow(2, '10:30', 907, ['Black F | CBO', 'Reels | Product Show', 'fb', 'Facebook'], 'Lip Oil x1 | Blush x1'),
      flow(3, '11:00', 1513, [B, B, B, 'Direct(Chancestoreegy)'], 'Blush x1'),
      flow(4, '11:30', 534, ['', '', '', ''], 'Lip Oil x2', 'shopify_draft_order'),
      flow(5, '12:00', 300, []), // صف قديم من قبل تعديل Flow: مفيش ولا عمود من الجديد
    ] });
  e.c.setupAll();
  e.c.liveTick();
  e.c.liveTick();
  assert.deepEqual(e.source.getSheetByName('orders').getRange(1, 1, 1, 19).getValues()[0], FLOW_HEAD);
  const raw = e.ss.getSheetByName('Orders Raw').getDataRange().getValues().slice(1);
  const by = id => raw.find(r => r[0] === 'gid://shopify/Order/' + id);
  assert.deepEqual([1, 2, 3, 4, 5].map(id => by(id)[3]), ['META', 'META', 'DIRECT', 'MANUAL', 'UNKNOWN']);
  assert.equal(by(1)[14], AD);
  assert.equal(by(2)[5], 'Lip Oil');
  const meta = todayRow(e, 'META TOTAL'), grand = todayRow(e, 'GRAND TOTAL');
  assert.deepEqual(meta.slice(2, 6), [600, 3, 200, 4.76], 'META TOTAL فيه أوردر DIRECT كمان');
  assert.match(meta[1], /DIRECT.*: 1$/);
  assert.deepEqual(['MANUAL (DRAFT)', 'NO SOURCE'].map(l => todayRow(e, l)[3]), [1, 1]);
  const labels = e.ss.getSheetByName('Today').getDataRange().getValues().map(r => r[0]);
  assert.deepEqual(labels.slice(labels.indexOf('TIKTOK TOTAL'), labels.indexOf('GRAND TOTAL') + 1),
    ['TIKTOK TOTAL', 'MANUAL (DRAFT)', 'ORGANIC (BIO)', 'NO SOURCE', 'GRAND TOTAL'], 'مفيش صف DIRECT لوحده، والبايو تحت المانيول');
  assert.equal(todayRow(e, 'ORGANIC (BIO)')[3], 0);
  assert.equal(grand[3], 5);
});

test('الكتالوج: Today فيه صف CATALOG واحد بصرفه وأوردراته، وتاب الكتالوج فيه تقسيمه على المنتجات', () => {
  const probe = env(), today = probe.c.todayKey_(), at = hm => ' ' + today + 'T' + hm + ':00+03:00', B = '(blank)';
  const flow = (id, hm, total, a, products) => ['gid://shopify/Order/' + id, ' #' + id, ' Name', B, total, at(hm), B, B, B, B, B].concat(a, [products, '4655075']);
  const cat = (adId, name, spend, buys) => ({ date_start: today, ad_id: adId, product_id: '5056' + spend + ', ' + name, spend: String(spend),
    actions: buys ? [{ action_type: 'offsite_conversion.fb_pixel_purchase', value: String(buys) }] : [] });
  const e = env({ orderHead: FLOW_HEAD,
    ads: { [A1]: [adRow(today, '111', 600), adRow(today, '222', 400)] },
    creatives: { 111: 'https://chance-cosmetics.com/products/lip-oil?utm_source=fb', 222: 'https://chance-cosmetics.com/collections/all' },
    shop: { 'lip-oil': { title: 'Lip Oil', handle: 'lip-oil', price: 30000 } },
    catalog: { [A1]: [cat('222', 'Lip Oil', 150, 1), cat('222', 'Blush - Pink', 200), cat('222', 'Satin Collection', 30), cat('222', 'Mascara', 0.5)] },
    activeAds: { [A1]: ['111', '222'] },
    orders: [ // UTM بالأسامي: Source = اسم الكامبين، Campaign = اسم الإعلان
      flow(1, '10:00', 300, ['Camp', 'Ad 111', 'fb', 'Facebook'], 'Lip Oil x1 | Blush x2'),
      flow(2, '10:30', 250, ['Camp', 'Ad 222', 'ig', 'Instagram'], 'Blush x1'),
    ] });
  e.c.setupAll();
  // الدومين مكتوب بـ https و / زي الشيت الحقيقي
  const st = e.ss.getSheetByName('Settings'), keys = st.getDataRange().getValues().map(r => r[0]);
  st.getRange(keys.indexOf('business.store_domains') + 1, 2).setValue('https://www.chance-cosmetics.com/');
  e.c.liveTick();
  e.c.liveTick();
  const products = e.ss.getSheetByName('Products').getDataRange().getValues().slice(1);
  assert.deepEqual(products.map(r => [r[0], r[2], r[5]]), [['Lip Oil', 'lip-oil', 300]]);
  const map = e.ss.getSheetByName('Ad Map').getDataRange().getValues().slice(1);
  assert.equal(map.find(r => r[0] === '111')[9], 'LINK');
  const raw = e.ss.getSheetByName('Orders Raw').getDataRange().getValues().slice(1);
  assert.deepEqual(raw.map(r => r[14]).sort(), ['111', '222'], 'الأوردر اتربط بالإعلان من اسم الكامبين والإعلان');

  const between = (v, col, from, to) => { const i = v.findIndex(r => r[col] === from); return v.slice(i + 1, v.findIndex((r, j) => j > i && r[col] === to) + 1); };
  const v = e.ss.getSheetByName('Today').getDataRange().getValues();
  // Today: قطع أوردرات الكتالوج كلها في صف واحد، والباقي كل قطعة على منتجها (Blush مالوش سعر: المبيعات بالقطع)
  assert.deepEqual(between(v, 7, 'PRODUCT', 'TOTAL').map(r => r.slice(7, 14)), [
    ['CATALOG (كل إعلانات الكتالوج)', 1, '', 250, '', '', ''],
    ['Blush', 2, '', 200, '', '', ''],
    ['Lip Oil', 1, '', 100, '', '', ''],
    ['TOTAL', 4, 2, 550, 1000, 275, 0.55],
  ]);
  const t = e.ss.getSheetByName('الكتالوج').getDataRange().getValues();
  // تاب الكتالوج: كل كامبين، وأوردراتها رايحة على أنهي منتجات. الأوردر بيتعد مرة واحدة، على منتج الإعلان لو فيه.
  assert.deepEqual(between(t, 7, 'CAMPAIGN', 'TOTAL').map(r => r.slice(7, 13)), [
    ['Camp', 'Lip Oil / CATALOG (كل إعلانات الكتالوج)', 2, 2, 'Lip Oil + Blush', 1],
    ['', '', '', '', 'Blush', 1],
    ['TOTAL', '', '', 2, '', 2],
  ]);
  assert.ok(t.some(r => /^CAMPAIGNS — THIS MONTH/.test(String(r[7]))));
  assert.deepEqual(between(t, 0, 'PRODUCT', 'TOTAL CATALOG').map(r => r.slice(0, 6)), [
    ['Blush', 1, 200, 200, 1.25, 0],
    ['Lip Oil', 0, 150, '', 0, 1],
    ['Satin Collection', 0, 30, '', 0, 0],
    ['منتجات تانية من الكتالوج (صرف صغير)', 0, 0.5, '', 0, 0],
    ['صرف Meta ماقسمتهوش على منتجات', 0, 19.5, '', 0, ''],
    ['TOTAL CATALOG', 1, 400, 400, 0.63, 1],
  ]);
  assert.match(String(t[0][0]), /^CATALOG — TODAY/);
  assert.ok(t.some(r => /^CATALOG — THIS MONTH/.test(String(r[0]))));
});

test('أيام ناقصة في الصرف بتتسحب لوحدها، والتحديث التلقائي بيتشغل لو مش شغال', () => {
  const probe = env(), today = probe.c.todayKey_(), d = n => probe.c.shiftKey_(today, -n);
  const e = env({ ads: { [A1]: [adRow(d(12), '111', 100), adRow(today, '111', 50)] } });
  e.c.setupAll();
  e.c.fullSync_(14); // زي أول سحب قديم: أيام لحد قبل 12 يوم بس
  const acc = e.ss.getSheetByName('Account Raw');
  e.c.writeRows_(acc, acc.getDataRange().getValues().slice(1).filter(r => r[0] === d(12)), 6, [1, 3]);
  delete e.doc.SYNCED_THROUGH;
  e.c.liveTick();
  const names = e.triggers.map(t => t.getHandlerFunction()).sort();
  assert.deepEqual(names, ['backfillStep', 'dailySync', 'liveTick']);
  const job = JSON.parse(e.doc.BACKFILL);
  // أول مرة: الشهر كله تاني عشان صرف الكتالوج يتقسم، أو من أول يوم ناقص لو قبل كده
  const monthStart = today.slice(0, 8) + '01';
  assert.equal(job.since, monthStart < d(12) ? monthStart : d(12));
  assert.equal(job.until, d(1));
  // بعد كده: من أول يوم ناقص بس
  delete e.doc.BACKFILL; delete e.doc.SYNCED_THROUGH;
  e.c.liveTick();
  assert.equal(JSON.parse(e.doc.BACKFILL).since, d(12));
  e.c.pauseTriggers();
  e.triggers.splice(0, e.triggers.length);
  e.c.liveTick();
  assert.deepEqual(e.triggers.map(t => t.getHandlerFunction()), [], 'اتوقف من المنيو: مايتشغلش لوحده');
});

test('أول سحب: الجزء اللي بيقع كل مرة بيتقسم أيام، وبعدين بيتساب، ومابيقفش السحب', () => {
  const probe = env(), today = probe.c.todayKey_(), d = n => probe.c.shiftKey_(today, -n);
  const e = env({ ads: { [A1]: [adRow(d(3), '111', 100)] } });
  e.c.setupAll();
  e.doc.BACKFILL = JSON.stringify({ units: [[A1, d(4), d(2)]], done: 0, tries: 3, since: d(4), until: d(2) });
  e.c.backfillStep(); // المحاولة الرابعة: الجزء بيتقسم 3 أيام، وبعدين بيكمل عادي
  assert.equal(e.doc.BACKFILL, undefined, 'خلص');
  assert.ok(e.ss.getSheetByName('Ads Raw').getDataRange().getValues().some(r => r[0] === d(3) && r[10] === 100));
  e.doc.BACKFILL = JSON.stringify({ units: [[A1, d(4), d(4)], [A1, d(3), d(3)]], done: 0, tries: 3, since: d(4), until: d(3) });
  e.c.backfillStep(); // يوم واحد بيقع للمرة الرابعة: بيتساب والباقي بيكمل
  assert.equal(e.doc.BACKFILL, undefined);
});

test('أوردرات من كامبين مش في أي حساب متسجل: الشيت بيسأل Meta عن الحساب ويضيفه ويسحب صرفه', () => {
  const probe = env(), today = probe.c.todayKey_(), at = hm => ' ' + today + 'T' + hm + ':00+03:00', B = '(blank)';
  const A4 = '555000111222333', CAMP = '120256366878570102';
  const e = env({ orderHead: FLOW_HEAD, names: Object.assign({}, NAMES, { [A4]: 'Chance New' }),
    objects: { [CAMP]: { id: CAMP, account_id: A4 } },
    orders: [['gid://shopify/Order/9', ' #9', ' N', B, 434, at('10:00'), B, B, B, B, B, 'facebook', CAMP, '120256366885940102', 'Instagram', 'Lip Oil x1', '4655075']] });
  e.c.setupAll();
  e.c.liveTick();
  const acc = e.ss.getSheetByName('Accounts').getDataRange().getValues().slice(1);
  assert.ok(acc.some(r => r[0] === 'META' && r[1] === A4 && r[2] === 'Chance New' && r[4] === true));
  assert.ok(JSON.parse(e.doc.BACKFILL).units.every(u => u[0] === A4), 'صرف الحساب الجديد بيتسحب من أول الشهر');
  assert.match(e.c.getStatus_('ACC_DISCOVER'), /اتضاف 555000111222333/);
});

test('أوردرات من حساب Meta مش معانا: صف لوحدها برا META TOTAL، وعمود ORDERS بيعد كل أوردر مرة واحدة', () => {
  const probe = env(), today = probe.c.todayKey_(), at = hm => ' ' + today + 'T' + hm + ':00+03:00', B = '(blank)';
  const flow = (id, hm, total, a, products) => ['gid://shopify/Order/' + id, ' #' + id, ' N', B, total, at(hm), B, B, B, B, B].concat(a, [products, '4655075']);
  const e = env({ orderHead: FLOW_HEAD,
    ads: { [A1]: [adRow(today, '111', 600)] },
    creatives: { 111: 'https://chance-cosmetics.com/products/lip-oil' },
    shop: { 'lip-oil': { title: 'Lip Oil', handle: 'lip-oil', price: 30000 } },
    orders: [
      flow(1, '10:00', 300, ['Camp', 'Ad 111', 'fb', 'Facebook'], 'Lip Oil x1'),
      flow(2, '10:30', 900, ['Camp', 'Ad 111', 'fb', 'Facebook'], 'Blush x1 | Mascara x2 | Primer x1 | Blush x1'),
      flow(3, '11:00', 400, ['facebook', '120256366878570102', '120256366885940102', 'Instagram'], 'Marshmallow x2'),
    ] });
  e.c.setupAll();
  const st = e.ss.getSheetByName('Settings'), keys = st.getDataRange().getValues().map(r => r[0]);
  st.getRange(keys.indexOf('business.store_domains') + 1, 2).setValue('chance-cosmetics.com');
  e.c.liveTick();
  e.c.liveTick();
  const v = e.ss.getSheetByName('Today').getDataRange().getValues(), row = l => v.find(r => r[0] === l);
  assert.deepEqual(row('META TOTAL').slice(2, 4), [600, 2], 'META TOTAL من غير أوردر الحساب التاني');
  assert.deepEqual(row('META (حساب مش معانا)').slice(1, 4), ['مش داخل في التوتال: Marshmallow', '', 1]);
  assert.equal(row('GRAND TOTAL')[3], 2, 'أوردرات الحساب التاني برا GRAND TOTAL');
  const i = v.findIndex(r => r[7] === 'PRODUCT');
  // أوردر 2 جه من إعلان Lip Oil ومافيهوش Lip Oil: كل قطعة على منتجها
  assert.deepEqual(v.slice(i + 1, i + 6).map(r => r.slice(7, 14)), [
    ['Blush', 2, '', 360, '', '', ''], ['Mascara', 2, '', 360, '', '', ''], ['Lip Oil', 1, '', 300, '', '', ''],
    ['Primer', 1, '', 180, '', '', ''], ['TOTAL', 6, 2, 1200, 600, 600, 2]]);
  const t = e.ss.getSheetByName('الكتالوج').getDataRange().getValues(), j = t.findIndex(r => r[7] === 'CAMPAIGN');
  assert.deepEqual(t.slice(j + 1, j + 4).map(r => [r[7], r[10], r[11], r[12]]), [
    ['Camp', 2, 'Lip Oil', 1],
    ['', '', 'Blush + منتجين تانيين', 1], // مفيش Lip Oil في الأوردر: على المنتج اللي فيه قطع أكتر
    ['TOTAL', 2, '', 2],
  ]);
});

test('التحديث التلقائي مابيشتغلش فوق تحديث تاني لسه شغال، وزرار 🔄 بيكمّل', () => {
  const e = env();
  e.c.setupAll();
  e.doc.LIVE_AT = String(Date.now() - 60000);
  e.c.liveTick({ triggerUid: '1' }); // من التريجر
  assert.doesNotMatch(e.c.getStatus_('LIVE'), /OK|اتأجل/, 'اتساب للتحديث اللي شغال');
  e.c.liveTick(true); // من الزرار
  assert.match(e.c.getStatus_('LIVE'), /✓ OK/);
  assert.equal(e.doc.LIVE_AT, undefined, 'العلامة بتتشال بعد ما يخلص');
});

test('الأوردرات: التحديث بيقرا الجديد بس من شيت الأوردرات، والقراية الكاملة مرة في اليوم', () => {
  const probe = env(), today = probe.c.todayKey_(), yest = probe.c.shiftKey_(today, -1);
  const iso = (day, m) => day + 'T' + String(10 + Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0') + ':00+03:00';
  const old = Array.from({ length: 650 }, (_, i) => ['#' + (1000 + i), iso(yest, i % 600), 'Lip Oil x1', 300, '', 'Cairo', 'fb', 'Camp', '']);
  const e = env({ ads: { [A1]: [adRow(today, '111', 600)] }, orders: old });
  e.c.setupAll();
  e.c.liveTick(); // أول مرة: الشيت كله
  const raw = () => e.ss.getSheetByName('Orders Raw').getDataRange().getValues().slice(1);
  assert.equal(raw().length, 650);
  const flow = e.source.getSheetByName('orders');
  flow.getRange(2, 4).setValue(999); // أوردر قديم اتعدل (برا آخر 600 صف)
  flow.appendRow(['#2000', today + 'T09:00:00+03:00', 'Lip Oil x1', 300, '', 'Cairo', 'fb', 'Camp', '']);
  e.c.liveTick();
  assert.equal(raw().length, 651, 'الأوردر الجديد اتضاف');
  assert.equal(raw().find(r => r[0] === '#1000')[7], 300, 'الصفوف القديمة ماتقريتش تاني');
  assert.equal(raw()[0][0], '#2000', 'الأحدث فوق');
  e.c.dailySync(); // مرة في اليوم: الشيت كله
  assert.equal(raw().find(r => r[0] === '#1000')[7], 999);
  assert.equal(raw().length, 651);
});

test('التحديث مابيكتبش تاني حاجة ماتغيرتش، و Today مابيتمسحش', () => {
  const probe = env(), today = probe.c.todayKey_(), d = n => probe.c.shiftKey_(today, -n);
  const e = env({ strictRange: true, ads: { [A1]: [adRow(d(10), '111', 100), adRow(d(5), '111', 200), adRow(today, '111', 600), adRow(today, '222', 50)] },
    creatives: { 111: 'https://chance-cosmetics.com/products/lip-oil', 222: 'https://chance-cosmetics.com/products/lip-oil' } });
  e.c.setupAll();
  e.c.fullSync_(14);
  e.c.liveTick();
  const w = n => e.ss.getSheetByName(n).writes;
  const before = { today: w('Today'), ads: w('Ads Raw'), map: w('Ad Map') };
  const ads = e.ss.getSheetByName('Ads Raw').getDataRange().getValues();
  assert.equal(ads.length, 5);
  e.c.liveTick();
  assert.ok(w('Today') - before.today <= 1, 'Today: خانة Last Update بس');
  assert.equal(w('Ad Map'), before.map, 'Ad Map ماتغيرش');
  assert.ok(w('Ads Raw') - before.ads <= 2 * 15, 'Ads Raw: صفوف النهارده بس');
  assert.deepEqual(e.ss.getSheetByName('Ads Raw').getDataRange().getValues(), ads, 'الأيام القديمة زي ما هي');
  const v = e.ss.getSheetByName('Today').getDataRange().getValues();
  assert.equal(v.find(r => r[0] === 'META TOTAL')[2], 650);
  const daily = e.ss.getSheetByName('Daily Log').getDataRange().getValues().slice(1);
  assert.deepEqual(daily.map(r => [r[0], r[3]]), [[today, 650], [d(5), 200], [d(10), 100]]);
});

test('⚡ التحديث السريع: Today بس (الصرف والأوردرات والبنشمارك والرصيد) من غير الكتالوج والحاجات التقيلة', () => {
  const probe = env(), today = probe.c.todayKey_();
  const rows = [adRow(today, '111', 600)];
  const e = env({ ads: { [A1]: rows }, creatives: { 111: 'https://chance-cosmetics.com/products/lip-oil' } });
  e.c.setupAll();
  e.c.liveTick();
  rows[0].spend = '850';
  e.requests.length = 0;
  e.c.quickRefresh();
  const v = e.ss.getSheetByName('Today').getDataRange().getValues();
  assert.equal(v.find(r => r[0] === 'META TOTAL')[2], 850);
  assert.ok(!e.requests.some(u => /breakdowns=product_id|\/ads\?/.test(u)), 'مفيش كتالوج ولا إعلانات شغالة');
  assert.ok(e.requests.some(u => /level=account/.test(u) && !/time_increment/.test(u)), 'عمود النهارده في البنشمارك');
  assert.ok(e.requests.some(u => /funding_source_details|balance/.test(u)), 'رصيد الأكاونتات');
  assert.match(e.alerts.pop(), /اتحدث تاب Today ✅/);
  assert.match(e.c.getStatus_('QUICK'), /✓/);
});

test('أوردرات قبل تعديل Flow: المصدر والمنتجات من ORDER_PATCH', () => {
  const probe = env(), today = probe.c.todayKey_(), B = '(blank)';
  const at = ' ' + today + 'T10:00:00+03:00';
  const e = env({ orderHead: FLOW_HEAD, orders: [
    ['gid://shopify/Order/7318352855330', ' #41878', ' N', B, 434, at, B, B, B, B, B, '', '', '', '', '', ''], // صف قديم: الأعمدة الجديدة فاضية
    ['gid://shopify/Order/7318361276706', ' #41880', ' N', B, 500, at, B, B, B, B, B, '', '', '', '', '', ''],
    ['gid://shopify/Order/7318469673250', ' #41885', ' N', B, 900, at, B, B, B, B, B, 'x', '', '', '', 'Lip Oil x1', '4655075'], // عنده بيانات: مايتغيرش
  ] });
  e.c.setupAll();
  e.c.liveTick();
  const raw = e.ss.getSheetByName('Orders Raw').getDataRange().getValues().slice(1), o = id => raw.find(r => r[0] === id);
  assert.deepEqual(o('gid://shopify/Order/7318352855330').slice(3, 6), ['META', 'utm', 'Sheglam Marshmallow Puff Lip Blur Pen']);
  assert.deepEqual(o('gid://shopify/Order/7318361276706').slice(3, 6), ['MANUAL', 'draft_order', 'SHEGLAM Camera On Blurring Setting Powder Balm']);
  assert.equal(o('gid://shopify/Order/7318469673250')[5], 'Lip Oil');
  const v = e.ss.getSheetByName('Today').getDataRange().getValues();
  assert.equal(v.find(r => r[0] === 'META (حساب مش معانا)')[3], 1);
  assert.ok(!v.some(r => r[0] === 'NO SOURCE'));
});

test('لينك البايو أورجانيك أكيد (BIO) تحت المانيول ومش في META TOTAL، و ChatGPT مش إعلان: DIRECT', () => {
  const probe = env(), today = probe.c.todayKey_(), at = ' ' + today + 'T10:00:00+03:00', B = '(blank)';
  const row = (id, a, src) => ['gid://shopify/Order/' + id, ' #' + id, ' N', B, 500, at, B, B, B, B, B].concat(a, ['Lip Oil x1', src || '4655075']);
  const e = env({ orderHead: FLOW_HEAD, orders: [
    row(1, ['ig', B, 'link_in_bio', 'Instagram']),
    row(2, ['chatgpt.com', B, B, 'Direct(Chancestoreegy)'], 'shopify_draft_order'),
    row(3, ['Camp', 'Ad 1', 'fb', 'Facebook']),
    row(4, ['ig', B, 'link_in_bio', 'Instagram'], 'shopify_draft_order'),
  ] });
  e.c.setupAll();
  e.c.liveTick();
  const raw = e.ss.getSheetByName('Orders Raw').getDataRange().getValues().slice(1), p = id => raw.find(r => r[0] === 'gid://shopify/Order/' + id).slice(3, 5);
  assert.deepEqual(p(1), ['BIO', 'link_in_bio']);
  assert.deepEqual(p(2), ['DIRECT', 'referrer']);
  assert.deepEqual(p(3), ['META', 'utm']);
  assert.deepEqual(p(4), ['BIO', 'link_in_bio'], 'البايو قبل الـ Draft');
  const meta = todayRow(e, 'META TOTAL'), bio = todayRow(e, 'ORGANIC (BIO)'), manual = todayRow(e, 'MANUAL (DRAFT)');
  assert.equal(meta[3], 2, 'META TOTAL = أوردر Meta + DIRECT، من غير البايو');
  assert.match(meta[1], /DIRECT \(مباشر\): 1$/);
  assert.equal(bio[3], 2);
  assert.equal(manual[3], 0);
  assert.equal(todayRow(e, 'GRAND TOTAL')[3], 4, 'البايو داخل في GRAND TOTAL');
  const labels = e.ss.getSheetByName('Today').getDataRange().getValues().map(r => r[0]);
  assert.equal(labels.indexOf('ORGANIC (BIO)'), labels.indexOf('MANUAL (DRAFT)') + 1, 'صف البايو تحت المانيول على طول');
});

test('كامبين اسمها اتغير: الأوردر بيتربط بالإعلان من رقم الـ Ad set (utm_term)', () => {
  const probe = env(), today = probe.c.todayKey_(), at = ' ' + today + 'T10:00:00+03:00', B = '(blank)';
  const ad = (id, set, name, spend) => Object.assign(adRow(today, id, spend, name), { campaign_id: 'C9', campaign_name: 'Scaling | Sheglam page', adset_id: set });
  const e = env({ orderHead: FLOW_HEAD,
    ads: { [A1]: [ad('901', '777000111222333', 'Renamed ad', 300), ad('902', '777000111222333', 'Other', 100), ad('903', '888000111222333', 'New Sales Ad - Copy 3', 50)] },
    creatives: { 901: 'https://chance-cosmetics.com/products/lip-oil', 902: 'https://chance-cosmetics.com/products/lip-oil', 903: 'https://chance-cosmetics.com/products/lip-oil' },
    orders: [
      ['gid://shopify/Order/1', ' #1', ' N', B, 300, at, B, B, B, B, B, 'All Aug | Sheglam page', 'New Sales Ad - Copy 3', 'fb', 'Facebook', 'Lip Oil x1', '4655075', 'C9', '777000111222333'],
      ['gid://shopify/Order/2', ' #2', ' N', B, 300, at, B, B, B, B, B, 'All Aug | Sheglam page', 'New Sales Ad - Copy 3', 'fb', 'Facebook', 'Lip Oil x1', '4655075', 'C9', '888000111222333'],
      ['gid://shopify/Order/3', ' #3', ' N', B, 300, at, B, B, B, B, B, '', '', '', 'Facebook', 'Lip Oil x1', '4655075', '', ''],
    ] });
  e.c.setupAll();
  e.c.liveTick(); e.c.liveTick();
  const raw = e.ss.getSheetByName('Orders Raw').getDataRange().getValues(), ad14 = id => raw.find(r => r[0] === 'gid://shopify/Order/' + id)[14];
  assert.equal(raw[0][17], 'Ad set ID (UTM)');
  assert.equal(ad14(1), '901', 'الاسم مش موجود: الإعلان اللي صرف أكتر في الـ Ad set');
  assert.equal(ad14(2), '903', 'اسم الإعلان موجود في الـ Ad set');
  assert.equal(ad14(3), '', 'مفيش UTM خالص');
});

test('Daily Account Funnel: الشهور مجموع، والبيزنس كله الأول، وأوردرات Shopify وعليها CPP و AOV و ROAS', () => {
  const probe = env(), today = probe.c.todayKey_(), p = today.split('-').map(Number);
  const ym = i => new Date(Date.UTC(p[0], p[1] - 1 - i, 1)).toISOString().slice(0, 7);
  const e = env({ ads: { [A1]: [adRow(today, '111', 300), adRow(ym(1) + '-10', '111', 3000), adRow(ym(2) + '-10', '111', 600)],
    [A2]: [adRow(today, '222', 100)] },
    orders: [['#1', today + 'T10:00:00+03:00', 'Lip Oil x1', 500, '', 'Cairo', 'Camp', 'Ad 111', 'fb'],
      ['#2', today + 'T11:00:00+03:00', 'Lip Oil x1', 250, '', 'Cairo', 'Camp', 'Ad 111', 'fb']] });
  e.c.setupAll();
  e.c.liveTick(); e.c.liveTick(); // التانية: الأوردرات بتتربط بالإعلانات اللي اتسحبت
  e.c.refreshFunnelNow();
  const v = e.ss.getSheetByName('Daily Account Funnel').getDataRange().getValues();
  assert.match(String(v[0][0]), /^DAILY ACCOUNT FUNNEL/);
  assert.deepEqual(v[2].slice(0, 7), ['DATE', 'SPEND', 'SHOPIFY ORDERS', 'CPP', 'AOV', 'SHOPIFY ROAS', 'META ORDERS']);
  const k = v.findIndex(r => r[0] === 'كل الحسابات (البيزنس كله)');
  assert.equal(k, 4, 'البيزنس كله أول قسم تحت البنشمارك');
  assert.deepEqual(v[k + 1].slice(1, 7), [400, 2, 200, 375, 1.875, 4], 'الشهر ده: صرف 400، أوردرين Shopify بـ 750، و 4 مشتريات Meta');
  const i = v.findIndex(r => /4660|Chance 26/.test(String(r[0]))), rows = v.slice(i + 1, i + 7);
  assert.match(rows[0][0], /لحد النهارده/);
  assert.deepEqual(rows[0].slice(1, 7), [300, 2, 150, 375, 2.5, 2]);
  assert.deepEqual([rows[1][1], rows[1][2], rows[1][3], rows[1][6]], [3000, '', '', 2], 'شهر قبل شيت الأوردرات: Shopify فاضي');
  assert.match(rows[4][0], /^آخر 3 شهور/);
  assert.deepEqual([rows[4][1], rows[4][6]], [3600, 4]);
  assert.deepEqual(rows[5].slice(1, 4), [300, 2, 150], 'النهارده');
  assert.match(String(v[3][1]), /^أحسن شهر/);
  assert.equal(v[3][3], '', 'CPP: مفيش أوردرات في الشهور اللي فاتت');
  assert.equal(v[3][6], 2, 'META ORDERS: أحسن شهر مجموع، مش متوسط');
  assert.equal(v[3][7], 600, 'CPM: أقل شهر (3000 و 600 على 1000 ظهور)');
  assert.match(e.c.getStatus_('FUNNEL'), /✓/);
});

test('Daily Account Funnel: المانيول على Chance 26، و DIRECT على الأكاونت اللي بيصرف على المنتج، و Meta من غير إعلان بآخر 4 أرقام', () => {
  const probe = env(), today = probe.c.todayKey_(), at = ' ' + today + 'T10:00:00+03:00', B = '(blank)', OLD = '120250000000000297';
  const flow = (id, total, a, products, src) => ['gid://shopify/Order/' + id, ' #' + id, ' N', B, total, at, B, B, B, B, B].concat(a, [products, src || '4655075']);
  const e = env({ orderHead: FLOW_HEAD.slice(0, 17),
    ads: { [A1]: [adRow(today, '111', 300)], [A2]: [adRow(today, '222', 100)], [A3]: [adRow(today, OLD, 50)] },
    creatives: { 111: 'https://chance-cosmetics.com/products/lip-oil', 222: 'https://chance-cosmetics.com/products/blush' },
    stock: [['P1', 'V1', 'Lip Oil', 'Default Title', 'LO', 'lip-oil', 40, 300], ['P2', 'V2', 'Blush', 'Default Title', 'BL', 'blush', 40, 250],
      ['P3', 'V3', 'Mask', 'Default Title', 'MA', 'mask', 40, 200]],
    orders: [flow(1, 200, [B, B, B, 'Direct(Chancestoreegy)'], 'Blush x1'), // إعلانات Blush على Golden Era
      flow(2, 300, [B, B, B, 'Direct(Chancestoreegy)'], 'Mask x2 | Lip Oil x1'), // Mask مالوش صرف: Lip Oil على Chance 26
      flow(3, 400, [B, B, B, 'Direct(Chancestoreegy)'], 'Serum x1'), // محدش بيصرف على Serum: البيزنس كله بس
      flow(4, 500, [B, B, B, B], 'Mask x1', 'shopify_draft_order'), // مانيول (مسيجات): Chance 26
      flow(5, 600, ['facebook', '120250999999990297', '120250999999990297', 'Facebook'], 'Mask x1')] }); // كامبين قديمة آخرها 0297: egy3
  e.c.setupAll();
  e.c.liveTick(); e.c.liveTick();
  e.c.refreshFunnelNow();
  const v = e.ss.getSheetByName('Daily Account Funnel').getDataRange().getValues();
  const month = re => v[v.findIndex(r => re.test(String(r[0]))) + 1].slice(1, 6).map(x => Math.round(x * 100) / 100);
  assert.deepEqual(month(/^كل الحسابات/), [450, 5, 90, 400, 4.44]);
  assert.deepEqual(month(/Chance 26/), [300, 2, 150, 400, 2.67], 'Lip Oil من DIRECT + المانيول');
  assert.deepEqual(month(/Golden Era/), [100, 1, 100, 200, 2]);
  assert.deepEqual(month(/egy3/), [50, 1, 50, 600, 12]);
});

test('أرشيف الأوردرات القديمة: بيدخل Orders Raw ثابت، و Flow بيكسب، والحساب بييجي معاه', () => {
  const probe = env(), today = probe.c.todayKey_(), p = today.split('-').map(Number);
  const ym = i => new Date(Date.UTC(p[0], p[1] - 1 - i, 1)).toISOString().slice(0, 7);
  const old = (n, day, acc, extra) => c => Object.assign({ id: 'gid://shopify/Order/' + n, dt: c.makeDate(day + 'T12:00:00Z'), utms: ['fb', '120247502496020297', '120247502496080297'],
    ids: ['120247502496020297', '120247502496010297'], referrer: 'https://facebook.com/', source: 'web', total: 1000, raw: 'Lip Oil x1', cancelled: false, acc: acc }, extra || {});
  const arch = [old(1, ym(1) + '-01', A1), old(2, ym(1) + '-13', 'OUT'), old(3, ym(1) + '-14', '', { utms: ['ig', 'Lip Oil | CBO | 4/8', 'Ad'], ids: ['', ''] }),
    old(4, ym(1) + '-15', A1, { total: 1 })];
  const e = env({ archive: c => arch.map(f => f(c)), ads: { [A1]: [adRow(today, '111', 300), adRow(ym(1) + '-10', '111', 3000)], [A2]: [adRow(today, '222', 100)] },
    orderHead: FLOW_HEAD, orders: [['gid://shopify/Order/4', ' #4', ' N', '(blank)', 700, ' ' + today + 'T10:00:00+03:00', '(blank)', '(blank)', '(blank)', '(blank)', '(blank)', '', '', '', '', 'Lip Oil x1', '4655075']] });
  e.c.setupAll();
  e.c.liveTick(); e.c.liveTick();
  const raw = e.ss.getSheetByName('Orders Raw').getDataRange().getValues().slice(1), o = n => raw.find(r => r[0] === 'gid://shopify/Order/' + n);
  assert.equal(raw.length, 4, 'التلاتة القدام + أوردر Flow');
  assert.equal(o(1)[2], ym(1) + '-01');
  assert.deepEqual(o(1).slice(3, 6), ['META', 'utm', 'Lip Oil']);
  assert.equal(o(4)[7], 700, 'أوردر في Flow وفي الأرشيف: صف Flow هو اللي بيتحسب');
  assert.equal(o(4)[2], today);
  assert.equal(e.c.outsideMeta_(o(1), new Set()), false, 'كامبين قديمة مش في Ads Raw بس حسابها معانا');
  assert.equal(e.c.outsideMeta_(o(2), new Set()), true, 'حساب مش معانا');
  assert.equal(e.c.outsideMeta_(o(3), new Set()), false, 'من غير IDs');
  e.c.refreshFunnelNow();
  const v = e.ss.getSheetByName('Daily Account Funnel').getDataRange().getValues();
  const i = v.findIndex(r => /Chance 26/.test(String(r[0]))), month1 = v[i + 2];
  assert.deepEqual(month1.slice(1, 5), [3000, 1, 3000, 1000], 'الشهر اللي فات: أوردر الأرشيف بتاع الحساب، و CPP على صرف Meta بتاع الشهر كله');
  assert.ok(Math.abs(month1[5] - 1 / 3) < 0.001, 'ROAS');
  const k = v.findIndex(r => r[0] === 'كل الحسابات (البيزنس كله)');
  assert.ok(k > 0);
  assert.equal(v[k + 1][2], 1, 'الشهر ده: أوردر Flow مش من Meta (DIRECT) داخل في البيزنس كله');
  assert.equal(v[k + 2][2], 2, 'البيزنس كله: أوردرات Meta القديمة (من غير اللي حسابها مش معانا)');
  assert.deepEqual(v[3].slice(2, 4), [2, 1500], 'البنشمارك: أحسن شهر للبيزنس كله، والأوردرات كل أوردرات شوبيفاي ماعدا الحساب اللي مش معانا');
});

test('ملف الأرشيف الحقيقي بيتقري صح ومافيهوش بيانات عملاء', () => {
  const c = load('ads-sheet'), a = c.archiveOrders_();
  assert.equal(a.length, 12349);
  assert.ok(a.every((o, i) => /^gid:\/\/shopify\/Order\/\d{13}$/.test(o.id) && (!i || o.id > a[i - 1].id)), 'IDs مترتبة ومن غير تكرار');
  assert.ok(a.every(o => o.dt.toISOString() >= '2026-06-30T21:00' && o.dt.toISOString() <= '2026-10-13T09:48'));
  assert.ok(a.every(o => o.total >= 0 && isFinite(o.total)));
  assert.ok(a.filter(o => o.raw).length > 12300, 'المنتجات');
  assert.ok(a.filter(o => o.acc && o.acc !== 'OUT').length > 4000, 'حساب الإعلان من رقم الكامبين');
  assert.equal(c.archiveAccOf_(a[0].id), a[0].acc);
  const text = require('vm').runInContext('ORDER_ARCHIVE_DATA + JSON.stringify(ORDER_ARCHIVE_SRC) + JSON.stringify(ORDER_ARCHIVE_PROD)', c);
  assert.ok(text.length > 400000);
  assert.ok(!/(^|\D)01[0125]\d{8}(\D|$)/.test(text), 'مفيش أرقام تليفونات');
});

test('أوردر Meta من كامبين قديمة لحساب معانا مش META OUT (آخر 4 أرقام في الـ ID)', () => {
  const c = env().c, known = new Set(['120250000000010297', '23860000000000793']);
  const o = (camp, set) => ['x', '', '', 'META', '', '', '', '', '', '', '', 'facebook', camp, '', '', false, camp, set];
  assert.equal(c.outsideMeta_(o('120240000000020297', '120240000000030297'), known), false, 'حساب egy3 بكامبين مش في Ads Raw');
  assert.equal(c.outsideMeta_(o('120256366878570102', '120256366881430102'), known), true, 'الحساب اللي مش معانا');
});

test('PRODUCT PERFORMANCE: أوردرات DIRECT والمانيول (Draft) داخلة في القطع والإجمالي', () => {
  const AD = '120256366885940102', probe = env(), today = probe.c.todayKey_(), at = ' ' + today + 'T10:00:00+03:00', B = '(blank)';
  const flow = (id, a, products) => ['gid://shopify/Order/' + id, ' #' + id, ' N', B, 500, at, B, B, B, B, B].concat(a, [products, '4655075']);
  const e = env({ orderHead: FLOW_HEAD.slice(0, 17), ads: { [A1]: [adRow(today, AD, 600)] },
    creatives: { [AD]: 'https://chance-cosmetics.com/products/lip-oil' },
    stock: [['P1', 'V1', 'Lip Oil', 'Default Title', 'LO', 'lip-oil', 40, 300], ['P2', 'V2', 'Blush', 'Default Title', 'BL', 'blush', 40, 300]],
    orders: [flow(1, ['facebook', '120256366878570102', AD, 'Facebook'], 'Lip Oil x1'),
      flow(2, [B, B, B, 'Direct(Chancestoreegy)'], 'Lip Oil x1'), flow(3, [B, B, B, 'Direct(Chancestoreegy)'], 'Blush x1'),
      flow(4, [B, B, B, B], 'Blush x2').slice(0, 16).concat(['shopify_draft_order'])] });
  e.c.setupAll();
  e.c.liveTick(); e.c.liveTick();
  const v = e.ss.getSheetByName('Today').getDataRange().getValues(), i = v.findIndex(r => /^PRODUCT PERFORMANCE — TODAY/.test(String(r[7])));
  assert.deepEqual(v.slice(i + 2, i + 5).map(r => r.slice(7, 14)), [
    ['Blush', 3, '', 1000, '', '', ''], ['Lip Oil', 2, '', 1000, '', '', ''], ['TOTAL', 5, 4, 2000, 600, 500, 3.33]],
    'أوردر Meta + أوردر DIRECT لنفس المنتج، وأوردر Draft داخل');
  const cl = closingRow(e.ss.getSheetByName('Closing'), dayLabel(e.c, today));
  assert.deepEqual([cl['TOTAL SPEND'], cl['TOTAL ORDERS'], cl.ROAS, cl['TOTAL UNITS']], [600, 4, 3.33, 5], 'Closing: كل الأوردرات (Meta و DIRECT والمانيول)، و ROAS عليها');
});

test('Actual ROAS: الإلغاء والتأكيد والمرتجع والمتسلم والمبيعات الفعلية، بنفس تقسيمة الفانل', () => {
  const probe = env(), today = probe.c.todayKey_(), p = today.split('-').map(Number);
  const ym = i => new Date(Date.UTC(p[0], p[1] - 1 - i, 1)).toISOString().slice(0, 7);
  const old = (n, day, acc, extra) => c => Object.assign({ id: 'gid://shopify/Order/' + n, dt: c.makeDate(day + 'T12:00:00Z'), utms: ['fb', '120247502496020297', '1'],
    ids: ['120247502496020297', '120247502496010297'], referrer: 'https://facebook.com/', source: 'web', total: 1000, raw: 'Lip Oil x1', cancelled: false, acc: acc }, extra || {});
  const arch = [old(1, ym(1) + '-01', A1), old(2, ym(1) + '-02', 'OUT'), old(3, ym(1) + '-03', '', { utms: ['ig', 'Lip Oil | CBO', 'Ad'], ids: ['', ''] }),
    old(7, ym(1) + '-06', '', { utms: ['ig', 'Lip Oil | CBO', 'Ad'], ids: ['', ''] }),
    old(5, ym(1) + '-04', A1), old(6, ym(1) + '-05', A1, { total: 400 })];
  const e = env({ archive: c => arch.map(f => f(c)), ads: { [A1]: [adRow(today, '111', 300), adRow(ym(1) + '-10', '111', 3000)], [A2]: [adRow(today, '222', 100)] },
    orderHead: FLOW_HEAD, orders: [['gid://shopify/Order/9', ' #9', ' N', '(blank)', 700, ' ' + today + 'T10:00:00+03:00', '(blank)', '(blank)', '(blank)', '(blank)', '(blank)', '', '', '', '', 'Lip Oil x1', '4655075']] });
  const st = { 1: { code: 'D', revenue: null }, 3: { code: 'R', revenue: null }, 5: { code: 'C', revenue: null }, 6: { code: 'D', revenue: 350 }, 7: { code: 'S', revenue: null } };
  e.c.orderStatus_ = id => st[String(id).split('/').pop()] || null;
  e.c.setupAll();
  e.c.liveTick(); e.c.liveTick();
  e.c.refreshFunnelNow();
  const v = e.ss.getSheetByName('Actual ROAS').getDataRange().getValues();
  assert.deepEqual(v[2], ['DATE', 'SPEND', 'TOTAL ORDERS', 'CANCELLED', 'CONFIRMED', 'RETURNED', 'IN SHIPPING', 'DELIVERED', 'AOV', 'REVENUE', 'ROAS', 'CPO']);
  const k = v.findIndex(r => r[0] === 'كل الحسابات (البيزنس كله)');
  assert.ok(k > 0);
  assert.deepEqual(v[k + 2].slice(1), [3000, 5, 1, 4, 1, 1, 2, 675, 1350, 0.45, 1500], 'الشهر اللي فات للبيزنس: 5 أوردرات (من غير الأكاونت اللي مش معانا)، منهم 1 في الشحن');
  const i = v.findIndex(r => /Chance 26/.test(String(r[0])));
  assert.deepEqual(v[i + 2].slice(1, 8), [3000, 3, 1, 2, 0, 0, 2], 'Chance 26: أوردراته بس');
});

test('توب 100: الأكثر مبيعًا والأعلى ROAS والستوك واللي بيتباع من غير إعلانات والرواكد، والمتلغي والمرتجع مش محسوبين', () => {
  const AD = '120256366885940102', probe = env(), today = probe.c.todayKey_(), at = ' ' + today + 'T10:00:00+03:00', B = '(blank)';
  const flow = (id, a, products) => ['gid://shopify/Order/' + id, ' #' + id, ' N', B, 500, at, B, B, B, B, B].concat(a, [products, '4655075']);
  const fb = ['facebook', '120256366878570102', AD, 'Facebook'], direct = [B, B, B, 'Direct(Chancestoreegy)'];
  const e = env({ orderHead: FLOW_HEAD.slice(0, 17), ads: { [A1]: [adRow(today, AD, 600)] },
    creatives: { [AD]: 'https://chance-cosmetics.com/products/lip-oil' },
    stock: [['P1', 'V1', 'Lip Oil', 'Default Title', 'LO', 'lip-oil', 40, 300], ['P2', 'V2', 'Blush', 'Default Title', 'BL', 'blush', 5, 250],
      ['P3', 'V3', 'Serum', 'Default Title', 'SE', 'serum', 70, 400], ['P4', 'V4', 'Mask', 'Default Title', 'MA', 'mask', 9, 200]],
    orders: [flow(1, fb, 'Lip Oil x2'), flow(2, fb, 'Lip Oil x1 | Blush x1'), flow(3, direct, 'Blush x2'), flow(4, direct, 'Blush x5'),
      flow(5, direct, 'Mask x1'), flow(6, direct, 'Serum x9')] });
  e.c.orderStatus_ = id => ({ 4: { code: 'C', revenue: null }, 6: { code: 'R', revenue: null } })[String(id).split('/').pop()] || null;
  e.c.setupAll();
  e.c.liveTick(); e.c.liveTick();
  e.c.writeTopTab_();
  const sh = e.ss.getSheetByName('توب 100'), cols = (t, n) => sideBlock(sh, t).map(r => r.slice(0, n));
  assert.equal(sh.getDataRange().getValues()[4].filter(x => /^\d\) /.test(String(x))).length, 5, 'الجداول الخمسة جنب بعض في صف 5');
  assert.deepEqual(cols('1) الأكثر مبيعًا', 5), [[1, 'Lip Oil', 3, 2, 40], [2, 'Blush', 3, 2, 5], [3, 'Mask', 1, 1, 9]], 'أوردر 4 اتلغى و 6 رجع');
  assert.deepEqual(cols('2) الأعلى Shopify ROAS', 8), [[1, 'Lip Oil', 600, 2, 1000, 1.67, 300, 40]], 'أوردرين Meta (أوردرات DIRECT كانت لمنتجات تانية)');
  assert.deepEqual(cols('3) أعلى ستوك', 4), [[1, 'Serum', 70, 0], [2, 'Lip Oil', 40, 3], [3, 'Mask', 9, 1], [4, 'Blush', 5, 3]]);
  assert.deepEqual(cols('4) بيتباع من غير إعلانات', 5), [[1, 'Blush', 3, 2, 5], [2, 'Mask', 1, 1, 9]]);
  assert.deepEqual(cols('5) الرواكد', 4), [[1, 'Serum', 70, 0], [2, 'Mask', 9, 1], [3, 'Lip Oil', 40, 3], [4, 'Blush', 5, 3]]);
  assert.deepEqual(sideBlock(sh, '5) الرواكد').map(r => r[4]), ['مااتباعش', today, today, today], 'أوردر Serum الوحيد رجع: مااتباعش');
  // تغيير الفترة بيشتغل في onEdit، ومن غير إذن مايقدرش يفتح شيت الستوك: بياخد آخر ستوك اتقرا
  e.c.readStock_ = () => ({ byHandle: {}, rows: 0, error: 'مفيش إذن' });
  sh.getRange('B2').setValue(today);
  e.c.onEdit({ range: { getSheet: () => sh, getA1Notation: () => 'B2' } });
  assert.match(String(sh.getRange('D2').getValue()), /^✓ 4 منتج من فلو الستوك \(آخر قراية /);
  assert.deepEqual(cols('3) أعلى ستوك', 3), [[1, 'Serum', 70], [2, 'Lip Oil', 40], [3, 'Mask', 9], [4, 'Blush', 5]]);
  assert.match(String(sideBlock(sh, '1) الأكثر مبيعًا')[0]), /Lip Oil/);
  e.c.writeProductsTab_();
  assert.equal(block(e.ss.getSheetByName('المنتجات'), 'المنتجات من ').find(r => r[1] === 'Lip Oil')[2], 40, 'وتاب المنتجات كمان');
});

test('الستوك الثابت من شوبيفاي: بيملا اللي فلو الستوك ماكتبهوش، والفلو بيكسب، والتحذير ظاهر', () => {
  const e = env({ snapshot: { 'Lip Oil': 999, 'Serum': 70, 'Old Mask': 0 },
    stock: [['P1', 'V1', 'Lip Oil', 'Default Title', 'LO', 'lip-oil', 40, 300], ['P2', 'V2', 'Blush', 'Default Title', 'BL', 'blush', 5, 250]] });
  e.c.setupAll();
  const s = e.c.stockByName_();
  assert.deepEqual([s.by['Lip Oil'], s.by.Blush, s.by.Serum, s.by['Old Mask']], [40, 5, 70, 0], 'Lip Oil و Blush من الفلو، والباقي من الصورة');
  assert.match(s.status, /^✓ 2 منتج من فلو الستوك، والباقي ستوك ثابت من شوبيفاي لحد /);
  const none = env({ stock: [], snapshot: { 'Lip Oil': 12 } });
  none.c.setupAll();
  const t = none.c.stockByName_();
  assert.equal(t.by['Lip Oil'], 12);
  assert.match(t.status, /^⚠️ ستوك ثابت من شوبيفاي لحد .* مابيتحدثش لوحده \(مفيش صفوف في تاب stock\)$/);
});

test('ملف الستوك الثابت الحقيقي بيتقري صح', () => {
  const c = load('ads-sheet'), snap = c.stockSnapshot_();
  assert.ok(Object.keys(snap).length > 2000);
  assert.equal(snap['Sheglam Marshmallow Puff Lip Blur Pen'], 759);
  assert.ok(Object.values(snap).every(v => Number.isInteger(v) && v >= 0));
});

test('المحافظات: الأوردرات والإلغاء والتوصيل والمرتجع لكل محافظة، من غير الأكاونت اللي مش معانا', () => {
  const probe = env(), today = probe.c.todayKey_(), B = '(blank)', at = ' ' + today + 'T10:00:00+03:00';
  const flow = id => ['gid://shopify/Order/' + id, ' #' + id, ' N', B, 500, at, B, B, B, B, B, B, B, B, 'Direct(Chancestoreegy)', 'Lip Oil x1', '4655075'];
  const old = (n, acc) => c => ({ id: 'gid://shopify/Order/' + n, dt: c.makeDate(probe.c.shiftKey_(today, -10) + 'T12:00:00Z'), utms: ['fb', '120247502496020297', '1'],
    ids: ['120247502496020297', '120247502496010297'], referrer: 'https://facebook.com/', source: 'web', total: 400, raw: 'Lip Oil x1', cancelled: false, acc: acc });
  const arch = [1, 2, 3, 4, 5, 6].map(n => old(n, A1)).concat([old(7, 'OUT')]);
  const e = env({ archive: c => arch.map(f => f(c)), orderHead: FLOW_HEAD, orders: [flow(9)] });
  const st = { 1: 'C', 2: 'D', 3: 'D', 4: 'R', 5: 'S', 6: 'D', 7: 'D' }, gov = { 1: 'الجيزة', 2: 'الجيزة', 3: 'الجيزة', 4: 'الجيزة', 5: 'القاهرة', 6: 'القاهرة', 7: 'القاهرة' };
  e.c.orderStatus_ = id => (st[String(id).split('/').pop()] ? { code: st[String(id).split('/').pop()], revenue: null } : null);
  e.c.orderGov_ = id => gov[String(id).split('/').pop()] || '';
  e.c.setupAll();
  e.c.liveTick();
  const sh = e.ss.getSheetByName('المحافظات'), rows = t => sideBlock(sh, t);
  assert.equal(sh.getDataRange().getValues()[4].filter(x => /^\d\) /.test(String(x))).length, 4, 'الجداول الأربعة جنب بعض في صف 5');
  assert.equal(sh.getRange('B2').getValue(), e.c.shiftKey_(today, -89), 'الفترة: آخر 90 يوم');
  assert.deepEqual(rows('1) الأوردرات').map(r => [r[0], r[1], r[5]]), [['الجيزة', 0, 4], ['القاهرة', 0, 2], ['مش معروفة', 1, 1], ['الإجمالي', 1, 7]],
    'أوردر 7 من الأكاونت اللي مش معانا مش محسوب، وأوردر 9 الجديد مالوش محافظة');
  assert.deepEqual(rows('2) نسبة الإلغاء').map(r => r.slice(0, 6)), [['الجيزة', 4, 1, 0.25, 0, 0], ['القاهرة', 2, 0, 0, 0, 0], ['مش معروفة', 1, 0, '', 0, 1], ['الإجمالي', 7, 1, 1 / 6, 0, 1]]);
  assert.deepEqual(rows('3) نسبة التوصيل').map(r => r.slice(0, 6)), [['الجيزة', 3, 2, 2 / 3, 0, 0.5], ['القاهرة', 2, 1, 1, 1, 0.5], ['مش معروفة', 0, 0, '', 0, ''], ['الإجمالي', 5, 3, 0.75, 1, 0.5]]);
  assert.deepEqual(rows('4) نسبة المرتجع').map(r => r.slice(0, 4)), [['الجيزة', 3, 1, 1 / 3], ['القاهرة', 2, 0, 0], ['مش معروفة', 0, 0, ''], ['الإجمالي', 5, 1, 0.25]]);
  // عمود المحافظة في شيت الأوردرات بيتقري لو الأوردر مش في الملف
  assert.equal(e.c.govOf_(['x', '', '', '', '', '', '', '', 'Giza']), 'الجيزة');
  assert.equal(e.c.govOf_(['x', '', '', '', '', '', '', '', 'محافظة الاسكندرية']), 'الإسكندرية');
});

test('رصيد الأكاونتات في Today: المشحون ويكفي كام يوم، والكارت وحد الصرف، والتوكن اللي مايشوفش طريقة الدفع', () => {
  const probe = env(), today = probe.c.todayKey_(), d = n => probe.c.shiftKey_(today, -n);
  const e = env({
    ads: { [A1]: [adRow(d(1), '111', 300), adRow(d(2), '111', 300), adRow(d(3), '111', 300)], [A2]: [adRow(d(1), '222', 600)] },
    accInfo: {
      [A1]: { is_prepay_account: true, balance: '0', amount_spent: '5000000', spend_cap: '0', currency: 'EGP',
        funding_source_details: { id: '1', type: 20, display_string: 'Available balance (EGP1,250.50)' } },
      [A2]: { is_prepay_account: false, balance: '35000', amount_spent: '60000', spend_cap: '100000', account_status: 3,
        funding_source_details: { id: '2', type: 1, display_string: 'Visa *4242' } },
      [A3]: { is_prepay_account: true, noFunding: true }
    } });
  e.c.setupAll();
  e.c.liveTick();
  const v = e.ss.getSheetByName('Today').getDataRange().getValues(), i = v.findIndex(r => /^رصيد الأكاونتات من Meta — آخر قراية /.test(String(r[0])));
  assert.ok(i > 0, 'الجدول تحت GRAND TOTAL');
  const rows = v.slice(i + 2, i + 5).map(r => r.slice(0, 6));
  assert.deepEqual(rows[0], ['Chance 26', 1250.5, 4.1, '', 'مفيش حد', 'شغال'], 'مشحون: 1250.5 ÷ 300 في اليوم');
  assert.deepEqual(rows[1], ['Chance Golden Era', 'كارت (بيتخصم لوحده)', 2, 350, 400, '⚠️ عليه فلوس ماتدفعتش'], 'كارت: فاضل 400 على حد الصرف ÷ 200 في اليوم');
  assert.deepEqual(rows[2].slice(1, 6), ['Meta مابتدّيش رصيد الشحن للتوكن ده', '', '', 'مفيش حد', 'شغال']);
  e.requests.filter(u => /fields=account_status/.test(u)).forEach(u => assert.match(u, /^https:\/\/graph\.facebook\.com\/v[\d.]+\/act_\d+\?fields=/));
});

test('Today: الستوك يكفي كام يوم، جزء للمنتجات اللي عليها إعلانات وجزء للي من غير إعلانات بتتباع وقرّبت تخلص، و اطلب كام (إعلان المنتج اللي عليه كاروسيل كتالوج بيتحسب على المنتج)', () => {
  const probe = env(), today = probe.c.todayKey_(), d = n => probe.c.shiftKey_(today, -n), B = '(blank)';
  const flow = (id, day, products) => ['gid://shopify/Order/' + id, ' #' + id, ' N', B, 500, ' ' + day + 'T10:00:00+03:00',
    B, B, B, B, B, B, B, B, 'Direct(Chancestoreegy)', products, '4655075'];
  // 111 رايح لصفحة Lip Oil، و Meta بتقسم صرفه على منتجات الكتالوج كمان (كاروسيل تحت الفيديو): يفضل على Lip Oil.
  const cat = (adId, name, spend) => ({ date_start: today, ad_id: adId, product_id: '5056' + spend + ', ' + name, spend: String(spend), actions: [] });
  const e = env({ orderHead: FLOW_HEAD, ads: { [A1]: [adRow(today, '111', 100), adRow(today, '222', 100)] }, activeAds: { [A1]: ['111', '222'] },
    catalog: { [A1]: [cat('111', 'Lip Oil', 60), cat('111', 'Mask', 40)] },
    creatives: { 111: 'https://chance-cosmetics.com/products/lip-oil', 222: 'https://chance-cosmetics.com/products/eye-pen' },
    stock: [['P1', 'V1', 'Lip Oil', 'Default Title', 'LO', 'lip-oil', 12, 300], ['P2', 'V2', 'Blush', 'Default Title', 'BL', 'blush', 5, 250],
      ['P3', 'V3', 'Mask', 'Default Title', 'MA', 'mask', 70, 200], ['P4', 'V4', 'Serum', 'Default Title', 'SE', 'serum', 3, 400],
      ['P5', 'V5', 'Eye Pen', 'Default Title', 'EP', 'eye-pen', 30, 150], ['P6', 'V6', 'Dress', 'Default Title', 'DR', 'dress', 0, 900],
      ['P7', 'V7', 'Brush', 'Default Title', 'BR', 'brush', 1, 90]],
    orders: [flow(1, d(1), 'Lip Oil x2'), flow(2, d(3), 'Lip Oil x3'), flow(3, d(2), 'Blush x5'), flow(4, d(1), 'Mask x1'),
      flow(5, d(6), 'Mask x20'), flow(6, d(1), 'Serum x5'), flow(7, today, 'Blush x10'), flow(8, d(2), 'Dress x1'), flow(9, d(2), 'Brush x2')] });
  e.c.orderStatus_ = id => (String(id).split('/').pop() === '6' ? { code: 'C', revenue: null } : null);
  e.c.setupAll();
  e.c.liveTick(); e.c.liveTick();
  const sh = e.ss.getSheetByName('Today'), v = sh.getDataRange().getValues(), i = v.findIndex(r => /^الستوك يكفي كام يوم/.test(String(r[0])));
  assert.ok(i > v.findIndex(r => /^رصيد الأكاونتات من Meta/.test(String(r[0]))), 'تحت رصيد الأكاونتات');
  assert.deepEqual(v[i + 1].slice(0, 6), ['المنتج', '', 'الستوك', 'بيتباع في اليوم', 'يكفي كام يوم', 'اطلب كام (لـ 30 يوم)']);
  // اطلب كام = اللي يكفي 30 يوم ناقص الستوك. Blush من غير إعلانات بس بيتباع قطعة في اليوم وفاضله 5 أيام. Mask كتير، و Serum أوردره اتلغى،
  // و Dress خلص ومالوش إعلانات، و Brush بيتباع أقل من قطعة في اليوم، فمش ظاهرين. أوردرات النهارده والأقدم من 5 أيام مش محسوبة.
  assert.deepEqual(v.slice(i + 2, i + 8).map(r => r.slice(0, 6)), [
    ['منتجات عليها إعلانات شغالة', '', '', '', '', ''],
    ['Lip Oil', '', 12, 1, 12, 18], ['Eye Pen', '', 30, 0, '— مااتباعش', ''],
    ['منتجات من غير إعلانات — بتتباع 1 قطعة في اليوم أو أكتر وفاضلها 10 أيام أو أقل', '', '', '', '', ''],
    ['Blush', '', 5, 1, 5, 25], ['', '', '', '', '', '']]);
  assert.deepEqual([sh.attr(i + 4, 5).bg, sh.attr(i + 5, 5).bg, sh.attr(i + 7, 5).bg], ['#fff2cc', null, '#f4cccc']);
});

/* ---------- الربط بأبليكيشن شوبيفاي (29_shopify_api.gs) ---------- */

/* شوبيفاي وهمي: صفحة الموافقة بترجع code، و access_token بيدّي مفتاح أو بيجدده، و graphql بيرجع الأوردرات اللي اتغيرت. */
function fakeShopify(e, orders, opt) {
  const o = opt || {}, calls = [], old = e.c.UrlFetchApp;
  e.c.HtmlService = { createHtmlOutput: h => ({ html: h, setTitle() { return this; }, setWidth() { return this; }, setHeight() { return this; } }) };
  e.c.UrlFetchApp = {
    fetchAll: old.fetchAll,
    fetch: (url, p) => {
      if (!/chance-eg\.myshopify\.com/.test(url)) return old.fetch(url, p);
      calls.push({ url, p });
      const json = (code, body) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(body) });
      if (/oauth\/access_token$/.test(url)) {
        if (p.payload.grant_type === 'refresh_token') return json(200, { access_token: 'TOKEN2', expires_in: 3600, refresh_token: 'R2', refresh_token_expires_in: 7776000 });
        return p.payload.code === 'GOOD' ? json(200, { access_token: 'TOKEN1', scope: 'read_orders', expires_in: 3600, refresh_token: 'R1', refresh_token_expires_in: 7776000 })
          : json(400, { error: 'invalid_request' });
      }
      if (/graphql\.json$/.test(url) && /shopifyqlQuery/.test(JSON.parse(p.payload).query)) { // تقارير شوبيفاي (ShopifyQL)
        const q = JSON.parse(p.payload).variables.q, t = (o.ql && o.ql(q)) || { columns: [], rows: [] };
        return json(200, { data: { shopifyqlQuery: { tableData: { columns: t.columns.map(n => ({ name: n, dataType: 'STRING' })), rows: t.rows }, parseErrors: [] } } });
      }
      if (/graphql\.json$/.test(url)) {
        const body = JSON.parse(p.payload), page = Number(body.variables.after || 0), size = o.pageSize || 100;
        const nodes = orders.slice(page * size, page * size + size);
        return json(200, { data: { orders: { nodes, pageInfo: { hasNextPage: (page + 1) * size < orders.length, endCursor: String(page + 1) } } } });
      }
      return json(404, {});
    }
  };
  return calls;
}
function signed(c, params, secret) {
  const msg = Object.keys(params).sort().map(k => k + '=' + params[k]).join('&');
  return Object.assign({}, params, { hmac: require('crypto').createHmac('sha256', secret).update(msg).digest('hex') });
}
const shopOrder = (n, day, extra) => Object.assign({ id: 'gid://shopify/Order/' + n, createdAt: day + 'T10:00:00Z', updatedAt: day + 'T12:00:00Z',
  cancelledAt: null, displayFinancialStatus: 'PENDING', returnStatus: 'NO_RETURN', subtotalLineItemsQuantity: 1,
  originalTotalPriceSet: { shopMoney: { amount: '500.0' } }, currentTotalPriceSet: { shopMoney: { amount: '500.0' } }, fulfillments: [] }, extra || {});

test('شوبيفاي: حالة الأوردر من بياناته (زي الملف الثابت)', () => {
  const c = env().c, s = x => c.shopifyStatusCode_(shopOrder(1, '2026-11-01', x));
  const done = [{ status: 'SUCCESS', displayStatus: 'DELIVERED' }], shipped = [{ status: 'SUCCESS', displayStatus: 'FULFILLED' }];
  assert.equal(s({ cancelledAt: '2026-11-01T13:00:00Z', displayFinancialStatus: 'VOIDED' }), 'C', 'اتلغى قبل الشحن');
  assert.equal(s({ cancelledAt: '2026-11-02T13:00:00Z', fulfillments: shipped }), 'R', 'اتلغى بعد الشحن');
  assert.equal(s({ returnStatus: 'RETURNED', fulfillments: [{ status: 'SUCCESS', displayStatus: 'NOT_DELIVERED' }] }), 'R', 'رجع');
  assert.equal(s({ displayFinancialStatus: 'PAID', fulfillments: done }), 'D', 'اتسلم واتحصّل');
  assert.equal(s({ displayFinancialStatus: 'PAID', fulfillments: [{ status: 'CANCELLED', displayStatus: 'CANCELED' }] }), 'D', 'متحصّل وشحنته القديمة اتلغت');
  assert.equal(s({ fulfillments: shipped }), 'S', 'في الشحن');
  assert.equal(s({ returnStatus: 'IN_PROGRESS', fulfillments: shipped }), 'S', 'مرتجع لسه ماخلصش');
  assert.equal(s({}), 'P', 'لسه مااتشحنش');
  const row = c.shopifyStatusRow_(shopOrder(2, '2026-11-01', { displayFinancialStatus: 'PAID', fulfillments: done, subtotalLineItemsQuantity: 3,
    currentTotalPriceSet: { shopMoney: { amount: '820.0' } } }));
  assert.deepEqual(Array.from(row.slice(3)), ['D', 820, 320, 3], 'المتسلم: المبيعات الحالية، والكروس سيل 320، و3 قطع');
});

test('شوبيفاي: صفحة الرجوع بتتأكد من state و HMAC وبتاخد مفتاح بيتجدد لوحده', () => {
  const e = env(), calls = fakeShopify(e, []);
  Object.assign(e.user, { SHOPIFY_CLIENT_ID: 'CID', SHOPIFY_CLIENT_SECRET: 'SECRET', SHOPIFY_STATE: 'ST1' });
  const base = { code: 'GOOD', shop: 'chance-eg.myshopify.com', state: 'ST1', timestamp: '1794066000', host: 'abc' };
  assert.match(e.c.doGet({ parameter: signed(e.c, base, 'WRONG') }).html, /توقيع شوبيفاي مش مطابق/);
  assert.match(e.c.doGet({ parameter: signed(e.c, Object.assign({}, base, { state: 'X' }), 'SECRET') }).html, /قديم أو مش من الشيت/);
  assert.match(e.c.doGet({ parameter: signed(e.c, Object.assign({}, base, { shop: 'other.myshopify.com' }), 'SECRET') }).html, /مش متجر الشيت/);
  assert.equal(e.user.SHOPIFY_TOKEN, undefined, 'مفيش مفتاح من غير state و HMAC صح');
  assert.match(e.c.doGet({ parameter: signed(e.c, base, 'SECRET') }).html, /اتربط ✅/);
  assert.equal(e.user.SHOPIFY_TOKEN, 'TOKEN1');
  assert.equal(e.user.SHOPIFY_REFRESH, 'R1');
  assert.equal(e.user.SHOPIFY_STATE, undefined, 'الـ state مابيتستخدمش مرتين');
  const ex = calls.find(x => /access_token$/.test(x.url));
  assert.equal(ex.p.payload.expiring, '1', 'مفتاح بيخلص (Shopify بيرفض المفتاح اللي مابيخلصش)');
  e.user.SHOPIFY_TOKEN_EXP = String(Date.now() + 60000); // فاضل دقيقة
  assert.equal(e.c.shopifyToken_(), 'TOKEN2', 'اتجدد قبل ما يخلص');
  assert.equal(e.user.SHOPIFY_REFRESH, 'R2');
  assert.match(e.c.doGet({ parameter: {} }).html, /ابدأ الربط من منيو الشيت/);
});

test('شوبيفاي: كل تحديث بيقرا الأوردرات اللي اتغيرت، و Closing و Actual ROAS بياخدوا منها', () => {
  const probe = env(), today = probe.c.todayKey_(), d1 = today.slice(0, 8) + '01', B = '(blank)';
  const flow = (id, total) => ['gid://shopify/Order/' + id, ' #' + id, ' N', B, total, ' ' + d1 + 'T10:00:00+03:00', B, B, B, B, B, '', '', '', '', 'Lip Oil x1', 'web'];
  const e = env({ orderHead: FLOW_HEAD.slice(0, 17), ads: { [A1]: [adRow(d1, '111', 1000)] }, orders: [flow(1, 500), flow(2, 300), flow(3, 200)] });
  const done = [{ status: 'SUCCESS', displayStatus: 'DELIVERED' }];
  const calls = fakeShopify(e, [
    shopOrder(1, d1, { displayFinancialStatus: 'PAID', fulfillments: done, subtotalLineItemsQuantity: 2, currentTotalPriceSet: { shopMoney: { amount: '800.0' } },
      updatedAt: today + 'T08:00:00Z' }),
    shopOrder(2, d1, { fulfillments: [{ status: 'SUCCESS', displayStatus: 'FULFILLED' }], updatedAt: today + 'T08:30:00Z' }),
    shopOrder(3, d1, { cancelledAt: d1 + 'T11:00:00Z', updatedAt: today + 'T09:00:00Z' })], { pageSize: 2 });
  Object.assign(e.user, { SHOPIFY_TOKEN: 'TOKEN1', SHOPIFY_TOKEN_EXP: String(Date.now() + 3600000) });
  e.c.setupAll();
  e.c.liveTick(); e.c.liveTick();
  const q = calls.filter(x => /graphql/.test(x.url)).map(x => JSON.parse(x.p.payload));
  assert.match(q[0].variables.q, /^updated_at:>='2026-11-07T15:00:00Z'$/, 'أول قراية من قبل الملف الثابت بشوية');
  assert.equal(calls.find(x => /graphql/.test(x.url)).p.headers['X-Shopify-Access-Token'], 'TOKEN1');
  assert.ok(q.every(x => /^query/.test(x.query)), 'قراية بس');
  assert.equal(e.doc.SHOPIFY_SINCE, today + 'T09:00:00Z', 'المرة الجاية من آخر تغيير اتقرا');
  assert.equal(e.doc.SHOPIFY_STATUS_DAY, today);
  const st = e.ss.getSheetByName('Order Status');
  assert.ok(st && st.hidden, 'تاب مخفي');
  const a = closingRow(e.ss.getSheetByName('Closing'), dayLabel(e.c, d1));
  assert.deepEqual([a['TOTAL ORDERS'], a['CONFIRMED ORDERS'], a['DELIVERED ORDERS'], a.REVENUE, a['CROSS-SELL REVENUE'], a['TOTAL UNITS']],
    [3, 2, 1, 800, 300, 4], 'أوردر 1 اتسلم واتزود عليه 300 (قطعتين)، وأوردر 2 في الشحن، وأوردر 3 اتلغى');
  assert.match(e.ss.getSheetByName('Health').getDataRange().getValues().map(r => r.join(' ')).join('\n'), /حالة الأوردرات من شوبيفاي \(الأبليكيشن\) .*✓/);
});

test('شوبيفاي: من غير ربط، التحديث مابيكلمش شوبيفاي خالص', () => {
  const e = env(), calls = fakeShopify(e, []);
  e.c.setupAll(); e.c.liveTick();
  assert.equal(calls.length, 0);
  assert.equal(e.ss.getSheetByName('Order Status'), null);
});

/* ---------- تاب Shopify (30_shopify_tab.gs) ---------- */

test('تاب Shopify: التشخيص بيقول معنى التغيير في الزيارات والأوردرات ومتوسط الأوردر', () => {
  const c = env().c, t = x => Object.assign(c.shopTabZero_(), x);
  const base = { sessions: 1000, atc: 80, checkout: 40, done: 20, orders: 20, value: 20000, total: 20000 };
  const d = (a, b) => Array.from(c.shopTabDiagnose_(t(Object.assign({}, base, a)), t(Object.assign({}, base, b))));
  assert.match(d({}, {})[0], /^الزيارات والأوردرات زي ما هم/);
  assert.match(d({}, {})[1], /^متوسط الأوردر زي ما هو/);
  assert.match(d({ sessions: 1200, done: 24, orders: 24, value: 24000 }, {})[0], /^الزيارات زادت 20% والأوردرات زادت معاها 20%: نمو طبيعي/);
  const weak = d({ sessions: 1300, done: 20, orders: 20, atc: 80 }, {});
  assert.match(weak[0], /^الزيارات زادت 30% والأوردرات مازادتش، فالتحويل قل 23%: الزيارات الجديدة ضعيفة/);
  assert.match(weak[0], /أكتر خطوة وقعت: الإضافة للسلة/, 'نفس عدد الإضافات على زيارات أكتر');
  assert.match(d({ done: 14, orders: 14, value: 14000, checkout: 40 }, {})[0], /^الزيارات زي ما هي والأوردرات قلت 30%: المشكلة في الموقع نفسه.*أكتر خطوة وقعت: إتمام الطلب/);
  assert.match(d({ sessions: 700, done: 14, orders: 14, value: 14000 }, {})[0], /^الزيارات قلت 30% والأوردرات قلت معاها 30%: المشكلة في الترافيك/);
  assert.match(d({ sessions: 700 }, {})[0], /^الزيارات قلت 30% بس الأوردرات ماقلتش، فالتحويل زاد 43%: زيارات أقل بس أحسن/);
  assert.match(d({ value: 16000 }, {})[1], /^متوسط الأوردر قل 20%: منتج أرخص/);
  assert.match(d({ value: 24000 }, {})[1], /^متوسط الأوردر زاد 20%: الباندل أو الأبسيل/);
  assert.match(d({ total: 12000, reversals: 8000 }, { reversals: 1000 })[1], /بسبب مرتجعات وإلغاء اتسجلوا النهارده/);
  assert.match(d({ sessions: 100 }, {})[0], /^لسه بدري/, 'أرقام قليلة');
  const cut = c.shopTabCut_({ D: { 3: t({ sessions: 10 }), 4: t({ sessions: 60 }), 5: t({ sessions: 99 }) } }, 'D', 4, 0.5);
  assert.equal(cut.sessions, 40, 'الساعات اللي قبل الساعة دي كاملة، والساعة دي بنسبة اللي فات منها');
});

test('تاب Shopify: بيتقري من شوبيفاي مع التحديث ويترسم: النهارده، والمنتجات الخلصانة، والكليكات، ويوم بيوم، والساعات، والعملاء', () => {
  const probe = env(), today = probe.c.todayKey_(), y = probe.c.shiftKey_(today, -1), w = probe.c.shiftKey_(today, -7);
  const at0 = k => new Date(k + 'T00:00:00+02:00').toISOString(); // أول ساعة في اليوم بتوقيت القاهرة
  const SET = '120251308872640297';
  const e = env({ ads: { [A1]: [Object.assign(adRow(today, '111', 1000), { adset_id: SET })] },
    stock: [['P1', 'V1', 'Lip Oil', 'Default Title', 'LO', 'lip-oil', 0, 300], ['P2', 'V2', 'Blush', 'Default Title', 'BL', 'blush', 9, 250]] });
  const queries = [];
  const ql = q => {
    queries.push(q);
    const S = ['hour', 'sessions', 'sessions_with_cart_additions', 'sessions_that_reached_checkout', 'sessions_that_completed_checkout', 'bounce_rate'];
    if (/^FROM sessions .*TIMESERIES hour/.test(q)) return { columns: S, rows: [[at0(today), '1000', '80', '40', '20', '0.5'], [at0(y), '800', '64', '32', '20', '0.5'], [at0(w), '1000', '80', '40', '20', '0.5']] };
    if (/^FROM sales .*TIMESERIES hour/.test(q)) return { columns: ['hour', 'orders', 'gross_sales', 'discounts', 'sales_reversals', 'total_sales'],
      rows: [[at0(today), '20', '21000', '-1000', '-500', '19500'], [at0(y), '20', '20000', '0', '0', '20000'], [at0(w), '20', '20000', '0', '0', '20000']] };
    if (/landing_page_path/.test(q)) return { columns: ['landing_page_path', 'sessions'], rows: /SINCE (\S+) UNTIL \1/.test(q)
      ? [['/ar/products/lip-oil', '50'], ['/products/blush', '30']] : [['/ar/products/lip-oil', '300'], ['/products/blush', '200']] };
    if (/new_or_returning_customer TIMESERIES day/.test(q)) return { columns: ['day', 'new_or_returning_customer', 'orders', 'total_sales'],
      rows: [[y, 'New', '15', '15000'], [y, 'Returning', '5', '5000'], [y, '', '1', '-100']] };
    if (/new_or_returning_customer/.test(q)) return { columns: ['new_or_returning_customer', 'orders', 'total_sales'], rows: [['New', '12', '15000'], ['Returning', '8', '4500']] };
    if (/^FROM sessions .*TIMESERIES day/.test(q) && !/utm_term/.test(q)) return { columns: ['day'].concat(S.slice(1)), rows: [[y, '800', '64', '32', '20', '0.5']] };
    if (/^FROM sales .*TIMESERIES day/.test(q)) return { columns: ['day', 'orders', 'gross_sales', 'discounts', 'sales_reversals', 'total_sales'], rows: [[y, '20', '20000', '0', '0', '20000']] };
    if (/day_of_week/.test(q)) return { columns: ['day_of_week', 'hour_of_day', 'orders'], rows: [['5', '20', '12'], ['0', '9', '3']] }; // السبت 8 بالليل، الاتنين 9 الصبح
    if (/utm_term/.test(q)) return { columns: ['day', 'utm_term', 'sessions'], rows: [[today, SET, '300'], [today, '120256366881430102', '999'], [today, '', '500']] };
    if (/session_device_type/.test(q)) return { columns: ['session_device_type', 'sessions'], rows: [['mobile', '900'], ['other', '100']] };
    if (/session_region/.test(q)) return { columns: ['session_region', 'sessions'], rows: [['Cairo Governorate', '600'], ['', '100']] };
    if (/order_referrer/.test(q)) return { columns: ['order_referrer_source', 'order_referrer_name', 'orders', 'total_sales'], rows: [['', '', '90', '9000'], ['social', 'facebook', '10', '1000']] };
    return { columns: [], rows: [] };
  };
  fakeShopify(e, [], { ql: ql });
  const all = e.c.UrlFetchApp.fetchAll;
  const hourly = () => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify({ data: [{ hourly_stats_aggregated_by_advertiser_time_zone: '00:00:00 - 00:59:59', spend: '100' }] }) });
  e.c.UrlFetchApp.fetchAll = reqs => all(reqs).map((r, i) => (/hourly_stats/.test(reqs[i].url) ? hourly() : /fields=outbound_clicks/.test(reqs[i].url) // الكليكات من Meta
    ? { getResponseCode: () => 200, getContentText: () => JSON.stringify({ data: reqs[i].url.indexOf('act_' + A1) >= 0
      ? [{ date_start: today, outbound_clicks: [{ action_type: 'outbound_click', value: '400' }] }] : [] }) } : r));
  Object.assign(e.user, { SHOPIFY_TOKEN: 'TOKEN1', SHOPIFY_TOKEN_EXP: String(Date.now() + 3600000) });
  const api = [];
  let chartId = 500;
  e.c.Sheets = { Spreadsheets: { batchUpdate: (body, id) => { // Sheets API (الخدمة المتقدمة): كروت Scorecard في Today
    api.push(body.requests);
    const today = e.ss.getSheetByName('Today');
    return { replies: body.requests.map(r => {
      if (!r.addChart) return {};
      const ch = { getChartId: () => ch.id, id: ++chartId, spec: r.addChart.chart.spec };
      (today.charts = today.charts || []).push(ch);
      return { addChart: { chart: { chartId: ch.id } } };
    }) };
  } } };
  e.c.setupAll();
  e.c.liveTick();
  const sh = e.ss.getSheetByName('Shopify'), data = e.ss.getSheetByName('Shopify Data');
  assert.ok(sh && data && !data.hidden, 'التاب اتعمل، وداتا الرسوم في تاب ظاهر (الرسوم بتطلع فاضية من تاب مخفي)');
  assert.ok(queries.length >= 12 && queries.every(q => /^FROM /.test(q)), 'تقارير بس');
  const v = sh.getDataRange().getValues(), at = t => { for (let r = 0; r < v.length; r++) { const c = v[r].indexOf(t); if (c >= 0) return [r, c]; } return null; };
  const card = t => { const p = at(t); return [v[p[0] + 1][p[1]], v[p[0] + 2][p[1]], v[p[0] + 3][p[1]]]; };
  assert.equal(card('Sessions')[0], 1000);
  assert.match(card('Sessions')[1], /^إمبارح: /);
  assert.equal(card('Orders')[0], 20);
  assert.equal(card('AOV')[0], 1000, '(21000 − 1000) ÷ 20');
  assert.equal(card('Conversion rate')[0], 0.02);
  assert.ok(v.some(r => /^قدام إمبارح: الزيارات/.test(String(r[0]))), 'سطر التشخيص');
  const dv = data.getDataRange().getValues(), blockOf = h => { const c = dv[0].indexOf(h); const out = []; for (let r = 1; r < dv.length && dv[r][c] !== ''; r++) out.push(dv[r].slice(c, c + 3)); return out; };
  assert.deepEqual(blockOf('المنتج'), [['Lip Oil', 50, 300]], 'Lip Oil خلص، و Blush لسه فيه ستوك');
  const days = blockOf('اليوم'), t0 = days[days.length - 1], y0 = days[days.length - 2];
  assert.deepEqual(t0, ['النهارده', 1000, 19500]);
  assert.deepEqual(y0, [Number(y.slice(8, 10)) + '/' + Number(y.slice(5, 7)), 800, 20000]);
  const ci = dv[0].indexOf('الأكاونتات كلها');
  assert.equal(dv[14][ci], 0.75, 'النهارده: 300 زيارة من الـ Ad set اللي في Ads Raw ÷ 400 كليك، والحساب اللي مش معانا مش محسوب');
  assert.deepEqual(blockOf('الشهر').length, 4);
  const charts = sh.getCharts(), title = ch => (ch.calls.find(x => x[0] === 'setOption' && x[1][0] === 'title') || [0, []])[1][1];
  assert.equal(charts.length, 13);
  assert.ok(charts.every(ch => !ch.calls.some(x => x[0] === 'setOption' && x[1][0] === 'chartArea')), 'من غير chartArea: جوجل بيرسم برا البوكس');
  assert.ok(charts.every(ch => ch.calls.some(x => x[0] === 'setHiddenDimensionStrategy' && x[1][0] === 'SHOW_BOTH')), 'الرسوم بتعرض الداتا حتى لو صفوفها مخفية');
  assert.match(title(charts[0]), /^زيارات على منتجات خلصانة/);
  assert.match(title(charts[2]), /^Sessions over time/);
  const pos = charts.map(ch => ch.calls.find(x => x[0] === 'setPosition')[1].slice(0, 2));
  assert.deepEqual([pos[0][1], pos[1][1], pos[0][0] === pos[1][0]], [1, 25, true], 'رسمتين في الصف');
  const heatAt = at('السبت');
  assert.equal(v[heatAt[0]][4 + 20], 3, 'السبت 8 بالليل: 12 أوردر ÷ 4 أسابيع');
  assert.match(e.ss.getSheetByName('Health').getDataRange().getValues().map(r => r.join(' ')).join('\n'), /تاب Shopify .*✓ اتقرا/);
  const tv = e.ss.getSheetByName('Today').getDataRange().getValues();
  assert.match(String(tv[0][0]), /DAILY AD CLOSING/, 'Today زي ما هو من فوق');
  assert.deepEqual(tv.slice(7, 14).map(r => r.slice(0, 2)), [['Ad spend (Meta)', 300], ['Sessions', 1000], ['Total sales', 19500], ['Orders', 20],
    ['Conversion rate', 0.02], ['AOV', 1000], ['Bounce rate', 0.5]], 'أرقام الكروت في الخلايا اللي تحتها، من صف 8 (صرف Meta بالساعة: 100 لكل أكاونت)');
  assert.equal(tv[17][0], 'PLATFORM', 'جدول الأكاونتات تحت الكروت بـ 10 صفوف');
  assert.equal(api.length, 1);
  const adds = api[0].filter(r => r.addChart).map(r => r.addChart.chart);
  assert.equal(adds.length, 7, '7 كروت');
  assert.deepEqual(Array.from(adds.map(a => a.spec.title)), ['Ad spend (Meta)', 'Sessions', 'Total sales', 'Orders', 'Conversion rate', 'AOV', 'Bounce rate']);
  const sc = adds[1].spec.scorecardChart, src = x => x.sourceRange.sources[0];
  assert.deepEqual([src(sc.keyValueData).startRowIndex, src(sc.keyValueData).startColumnIndex, src(sc.baselineValueData).startColumnIndex], [8, 1, 2],
    'Sessions: النهارده من B9 وإمبارح من C9');
  assert.equal(sc.baselineValueFormat.comparisonType, 'PERCENTAGE_DIFFERENCE');
  const wd = ['الأحد', 'الاتنين', 'التلات', 'الأربع', 'الخميس', 'الجمعة', 'السبت'][new Date(e.c.todayKey_() + 'T12:00:00Z').getUTCDay()];
  assert.equal(adds[1].spec.subtitle.indexOf('\u200F\u202B' + wd + ' اللي فات: 1,000'), 0, 'نفس يوم النهارده الأسبوع اللي فات');
  const cpos = adds.map(a => a.position.overlayPosition);
  assert.deepEqual([cpos[0].anchorCell.rowIndex, cpos[0].anchorCell.columnIndex, cpos[3].offsetXPixels, cpos[4].offsetYPixels], [7, 0, 654, 102], '4 في الصف تحت عنوان الجدول');
  assert.equal(String(v[3][0]), 'Sessions', 'تاب Shopify من غير كارت الصرف ومن غير عنوان');
  assert.ok(!v.some(r => /^النهارده لحد/.test(String(r[0]))), 'مفيش عنوان فوق الكروت');
  const n = queries.length;
  e.c.liveTick();
  assert.equal(queries.length - n, 5, 'التحديث الجاي بيقرا النهارده بس، والباقي كل 3 ساعات');
  assert.equal(sh.getCharts()[0], charts[0], 'الرسوم مااتعملتش تاني: الداتا تحتها بتتحدث لوحدها');
  const later = api.slice(1).reduce((a, x) => a.concat(x), []);
  assert.ok(later.every(r => r.updateChartSpec), 'التحديث بيغير أرقام الكروت بس، مكانها وحجمها زي ما هم');
  const td = e.ss.getSheetByName('Today');
  td.charts = td.charts.slice(1); // حد مسح كارت الصرف
  e.doc.TODAY_CARD_CHARTS_SIG = 'x'; e.doc['GH_Today'] = 'x';
  e.c.liveTick();
  assert.deepEqual(Array.from(api[api.length - 1].filter(r => r.addChart).map(r => r.addChart.chart.spec.title)), ['Ad spend (Meta)'], 'الكارت اللي اتمسح بيرجع لوحده');
});

test('Today: من غير خدمة Google Sheets API، مكان الكروت فيه سطر بيقول تعمل إيه', () => {
  const e = env();
  fakeShopify(e, []);
  Object.assign(e.user, { SHOPIFY_TOKEN: 'TOKEN1', SHOPIFY_TOKEN_EXP: String(Date.now() + 3600000) });
  e.c.setupAll(); e.c.liveTick();
  const tv = e.ss.getSheetByName('Today').getDataRange().getValues();
  assert.match(String(tv[7][0]), /فعّل Google Sheets API/);
  assert.equal(tv[9][0], 'PLATFORM');
});
