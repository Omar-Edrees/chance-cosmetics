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
  const store = o => ({ getProperty: k => (k in o ? o[k] : null), setProperty: (k, v) => { o[k] = v; }, deleteProperty: k => { delete o[k]; } });
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
    if (/\/insights\?/.test(url)) {
      const byDay = {};
      (ads[id] || []).forEach(r => { byDay[r.date_start] = (byDay[r.date_start] || 0) + Number(r.spend); });
      return { data: Object.keys(byDay).map(d => ({ date_start: d, spend: String(byDay[d]) })) };
    }
    if (/\/ads\?/.test(url)) return { data: (activeAds[id] || []).map(x => ({ id: x })) };
    const adId = (url.match(/\/v[\d.]+\/(\d+)\?/) || [])[1];
    if (adId && creatives[adId]) return { creative: { object_story_spec: { link_data: { link: creatives[adId] } } } };
    const obj = (url.match(/\/v[\d.]+\/(\d+)\?/) || [])[1];
    if (obj && (opt.objects || {})[obj]) return opt.objects[obj];
    if (obj && !id) throw new Error('Meta code 100: Unsupported get request');
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
      newDataValidation: builder, newConditionalFormatRule: builder,
      getUi: () => ({ alert: m => { alerts.push(m); } }),
    },
    PropertiesService: { getDocumentProperties: () => store(doc), getUserProperties: () => store(user) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    UrlFetchApp: { fetch: url => response(url), fetchAll: reqs => reqs.map(r => response(r.url)) },
    ScriptApp: { getProjectTriggers: () => triggers.slice(), deleteTrigger: t => triggers.splice(triggers.indexOf(t), 1), newTrigger: trigger },
  });
  return { c, ss: active, source, doc, alerts, requests, triggers };
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

test('Today: لقطات الـ 3 ساعات من تاب Intraday، مع CPP و ROAS', () => {
  const e = scenario();
  // اللقطات بتتاخد من الساعة الحقيقية: التاب يبقى بلقطة 3 بس، عشان الاختبار مايتأثرش بساعة تشغيله
  const intra = e.ss.getSheetByName('Intraday');
  e.c.writeRows_(intra, [], 7, []);
  e.doc.INTRA_LAST = 'x'; e.c.takeIntraday_ = () => false;
  e.ss.getSheetByName('Intraday').appendRow([e.today, '15:00', 'META', 500, 2, 250, 1000]);
  e.ss.getSheetByName('Intraday').appendRow([e.today, '15:00', 'الإجمالي', 500, 3, 166.67, 1250]);
  e.c.writeToday_();
  const values = e.ss.getSheetByName('Today').getDataRange().getValues();
  const head = values.find(r => r[7] === 'TIME');
  assert.deepEqual(head.slice(7, 16), ['TIME', 'META SPEND', 'META ORDERS', 'META CPP', 'META ROAS', 'TIKTOK SPEND', 'TIKTOK ORDERS', 'TIKTOK CPP', 'TIKTOK ROAS']);
  assert.deepEqual(values.filter(r => /^\d+:00 [AP]M$/.test(r[7])).map(r => r[7]), ['12:00 PM', '3:00 PM', '6:00 PM', '9:00 PM', '12:00 AM']);
  assert.deepEqual(todayRow(e, '3:00 PM', 8).slice(7, 16), ['3:00 PM', 500, 2, 250, 2, 0, 0, '', '']);
  assert.deepEqual(todayRow(e, '6:00 PM', 8).slice(8, 16), ['', '', '', '', '', '', '', '']);
});

test('Today: بنشمارك Meta، متوسط آخر 60 يوم مقابل كل حساب النهارده', () => {
  const e = scenario(), values = e.ss.getSheetByName('Today').getDataRange().getValues();
  const head = values.find(r => r[7] === 'METRIC');
  assert.deepEqual(head.slice(7, 12), ['METRIC', 'AVERAGE (LAST 60 DAYS)', 'Chance 26', 'Chance Golden Era', 'chance store . egy3']);
  const cpm = values.find(r => r[7] === 'CPM'), cpp = values.find(r => r[7] === 'Cost per purchase');
  // المتوسط من آخر 60 يوم قبل النهارده: إعلان واحد امبارح صرف 300 على 1000 ظهور
  assert.deepEqual(cpm.slice(7, 12), ['CPM', 300, 500, 100, '—']);
  assert.equal(cpp[8], 150);
  const metrics = values.map(r => r[7]), first = metrics.indexOf('METRIC') + 1;
  assert.deepEqual(metrics.slice(first, first + 2), ['ROAS', 'AOV']);
  const row = l => values.find(r => r[7] === l).slice(7, 12);
  assert.deepEqual(row('ROAS'), ['ROAS', 3, 1.8, 9, '—']);
  assert.deepEqual(row('AOV'), ['AOV', 450, 450, 450, '—']);
  assert.deepEqual(row('Content view → ATC'), ['Content view → ATC', 0.4, 0.4, 0.4, '—']);
  assert.deepEqual(row('ATC → Checkout'), ['ATC → Checkout', 0.75, 0.75, 0.75, '—']);
  const ranges = e.requests.filter(u => /level=account/.test(u) && !/time_increment/.test(u))
    .map(u => JSON.parse(decodeURIComponent(u.match(/time_range=([^&]+)/)[1])));
  assert.ok(ranges.some(t => t.since === e.c.shiftKey_(e.today, -60) && t.until === e.yest), 'المتوسط من آخر 60 يوم لحد امبارح');
  const cell = c => e.ss.getSheetByName('Today').attr(values.indexOf(cpm) + 1, c).bg;
  assert.equal(cell(10), '#f4cccc');
  assert.equal(cell(11), '#d9ead3');
});

test('Today: أداء المنتجات بالـ ROAS، والأوردر على منتج الإعلان اللي جابه مش على أول منتج فيه', () => {
  const e = scenario(), values = e.ss.getSheetByName('Today').getDataRange().getValues();
  const titles = values.map(r => String(r[7])).filter(t => /^PRODUCT PERFORMANCE/.test(t));
  assert.equal(titles.length, 2);
  const heads = values.filter(r => r[7] === 'PRODUCT');
  heads.forEach(h => assert.deepEqual(h.slice(7, 14), ['PRODUCT', 'META ORDERS', 'META SPEND', 'META CPP', 'META ROAS', 'PIXEL PURCHASES', 'RUNNING NOW']));
  // الـ UTM هنا (fb / Camp) مش بيشاور على إعلان في الشيت: الأوردرات في صف لوحدها مش على Lip Oil
  const lip = values.find(r => r[7] === 'Lip Oil'), blush = values.find(r => r[7] === 'Blush');
  assert.deepEqual(lip.slice(7, 13), ['Lip Oil', 0, 600, '', 0, 2]);
  assert.deepEqual(blush.slice(7, 12), ['Blush', 0, 100, '', 0]);
  assert.deepEqual(values.find(r => r[7] === 'أوردرات Meta من إعلان مش في الشيت').slice(7, 10), ['أوردرات Meta من إعلان مش في الشيت', 2, 0]);
  const unmapped = values.find(r => r[7] === '❌ صرف مش مربوط بمنتج');
  assert.deepEqual(unmapped.slice(7, 10), ['❌ صرف مش مربوط بمنتج', 0, 400]);
  const total = values.find(r => r[7] === 'TOTAL META PRODUCT PERFORMANCE');
  assert.deepEqual(total.slice(7, 12), ['TOTAL META PRODUCT PERFORMANCE', 2, 1100, 550, 0.95]);
});

test('ربط الإعلانات بالمنتجات من لينك صفحة المنتج، والكوليكشن مش مربوط طول ما دومين المتجر فاضي', () => {
  const e = scenario();
  const prods = e.ss.getSheetByName('Today').getDataRange().getValues();
  const spend = n => (prods.find(r => r[7] === n) || [])[9];
  assert.equal(spend('Lip Oil'), 600);
  assert.equal(spend('Blush'), 100);
  // business.store_domains فاضي في البروفايل، فلينك الكوليكشن مابيتعرفش MULTI
  assert.equal(spend('❌ صرف مش مربوط بمنتج'), 400);
  const map = e.ss.getSheetByName('Ad Map').getDataRange().getValues().slice(1);
  assert.equal(map.find(r => r[0] === '111')[9], 'LINK');
  assert.equal(map.find(r => r[0] === '222')[9], 'NONE');
});

test('Closing: يوم بيوم والأسبوع والشهر من نفس الأرقام', () => {
  const e = scenario();
  const rows = block(e.ss.getSheetByName('Closing'), 'شهر ');
  const day = rows.find(r => r[0] === e.today), month = rows.find(r => r[0] === 'إجمالي الشهر');
  assert.equal(day[1], 1100);
  assert.equal(day[3], 3);
  const sameMonth = e.yest.slice(0, 7) === e.today.slice(0, 7);
  assert.equal(month[1], sameMonth ? 1400 : 1100);
  assert.equal(month[3], sameMonth ? 4 : 3);
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
  'UTM Campaign', 'UTM Content', 'UTM Term', 'Attr UTM Source', 'Attr UTM Campaign', 'Attr UTM Content', 'Order Referrer', 'Products', 'Source Name'];

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
  assert.deepEqual(e.source.getSheetByName('orders').getRange(1, 1, 1, 17).getValues()[0], FLOW_HEAD);
  const raw = e.ss.getSheetByName('Orders Raw').getDataRange().getValues().slice(1);
  const by = id => raw.find(r => r[0] === 'gid://shopify/Order/' + id);
  assert.deepEqual([1, 2, 3, 4, 5].map(id => by(id)[3]), ['META', 'META', 'DIRECT', 'MANUAL', 'UNKNOWN']);
  assert.equal(by(1)[14], AD);
  assert.equal(by(2)[5], 'Lip Oil');
  const meta = todayRow(e, 'META TOTAL'), grand = todayRow(e, 'GRAND TOTAL');
  assert.deepEqual(meta.slice(2, 6), [600, 2, 300, 2.24]);
  assert.deepEqual(['DIRECT', 'MANUAL (DRAFT)', 'NO SOURCE'].map(l => todayRow(e, l)[3]), [1, 1, 1]);
  const labels = e.ss.getSheetByName('Today').getDataRange().getValues().map(r => r[0]);
  assert.deepEqual(labels.slice(labels.indexOf('TIKTOK TOTAL'), labels.indexOf('GRAND TOTAL') + 1),
    ['TIKTOK TOTAL', 'DIRECT', 'MANUAL (DRAFT)', 'NO SOURCE', 'GRAND TOTAL']);
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
  assert.deepEqual(v.find(r => r[7] === 'PRODUCT').slice(14, 16), ['ORDERED PRODUCT (اللي اتطلب)', 'ORDERS']);
  // إعلان Lip Oil جاب أوردر فيه Lip Oil و Blush: الأوردر بيتعد مرة واحدة على منتج الإعلان، والمنتج التاني جنبه
  assert.deepEqual(between(v, 7, 'PRODUCT', 'TOTAL META PRODUCT PERFORMANCE').map(r => r.slice(7, 16)), [
    ['CATALOG (كل إعلانات الكتالوج)', 1, 400, 400, 0.63, 2, '✅ 1 إعلان', 'Blush', 1],
    ['Lip Oil', 1, 600, 600, 0.5, 2, '✅ 1 إعلان', 'Lip Oil + Blush', 1],
    ['TOTAL META PRODUCT PERFORMANCE', 2, 1000, 500, 0.55, 4, '', '', 2],
  ]);
  const t = e.ss.getSheetByName('الكتالوج').getDataRange().getValues();
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
  assert.deepEqual(row('META (حساب مش معانا)').slice(1, 4), ['من غير صرف: Marshmallow', '', 1]);
  assert.equal(row('GRAND TOTAL')[3], 3);
  const i = v.findIndex(r => r[7] === 'PRODUCT');
  assert.deepEqual(v.slice(i + 1, i + 4).map(r => [r[7], r[8], r[14], r[15]]), [
    ['Lip Oil', 2, 'Lip Oil', 1],
    ['', '', 'Blush + منتجين تانيين', 1], // مفيش Lip Oil في الأوردر: على المنتج اللي فيه قطع أكتر
    ['TOTAL META PRODUCT PERFORMANCE', 2, '', 2],
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

test('⚡ التحديث السريع: الصرف والأوردرات في Today من غير الكتالوج والحاجات التقيلة', () => {
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
  assert.match(e.alerts.pop(), /اتحدث الصرف والأوردرات ✅/);
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
