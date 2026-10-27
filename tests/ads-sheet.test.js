const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const { FakeSpreadsheet } = require('./fake-google');

/* نفس ID شيت الأوردرات اللي في 00_profile.gs */
const ORDERS_ID = '15rkiOnnON-nobcGxq1ct5tHnocrvS79f454xkQQg6Ys';
const A1 = '1354948596094660', A2 = '1443770363884823';
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
  source.addSheet('orders', [ORDER_HEAD].concat(opt.orders || []));
  source.addSheet('stock', [STOCK_HEAD].concat(opt.stock || []));
  const ads = opt.ads || {}, creatives = opt.creatives || {}, activeAds = opt.activeAds || {};
  const reply = url => {
    requests.push(url);
    const id = (url.match(/act_(\d+)/) || [])[1];
    if (/\/insights\?/.test(url) && /level=ad&/.test(url)) return { data: ads[id] || [] };
    if (/\/insights\?/.test(url)) {
      const byDay = {};
      (ads[id] || []).forEach(r => { byDay[r.date_start] = (byDay[r.date_start] || 0) + Number(r.spend); });
      return { data: Object.keys(byDay).map(d => ({ date_start: d, spend: String(byDay[d]) })) };
    }
    if (/\/ads\?/.test(url)) return { data: (activeAds[id] || []).map(x => ({ id: x })) };
    const adId = (url.match(/\/v[\d.]+\/(\d+)\?/) || [])[1];
    if (adId && creatives[adId]) return { creative: { object_story_spec: { link_data: { link: creatives[adId] } } } };
    return { id: 'act_' + id };
  };
  const response = url => { const body = reply(url); return { getResponseCode: () => 200, getContentText: () => JSON.stringify(body) }; };
  const c = load('ads-sheet', {
    SpreadsheetApp: {
      getActive: () => active, openById: id => { if (id !== ORDERS_ID) throw new Error('not found ' + id); return source; },
      newDataValidation: builder, newConditionalFormatRule: builder,
      getUi: () => ({ alert: m => { alerts.push(m); } }),
    },
    PropertiesService: { getDocumentProperties: () => store(doc), getUserProperties: () => store(user) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    UrlFetchApp: { fetch: url => response(url), fetchAll: reqs => reqs.map(r => response(r.url)) },
  });
  return { c, ss: active, source, doc, alerts, requests };
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

test('Today: صرف Meta بالظبط، والأوردرات من شيت شوبيفاي، والضريبة 14%', () => {
  const e = scenario();
  const plat = block(e.ss.getSheetByName('Today'), 'الصرف والأوردرات النهارده');
  const meta = plat.find(r => r[0] === 'META'), tiktok = plat.find(r => r[0] === 'TIKTOK'), total = plat.find(r => r[0] === 'الإجمالي');
  assert.equal(meta[1], 1100);
  assert.equal(meta[2], 1254);
  assert.equal(meta[3], 2);
  assert.equal(meta[4], 627);
  assert.equal(meta[5], 1050);
  assert.equal(tiktok[3], 1);
  assert.equal(total[1], 1100);
  assert.equal(total[3], 3);
  assert.match(String(e.c.getStatus_('LIVE')), /✓ OK/);
});

test('ربط الإعلانات بالمنتجات من لينك صفحة المنتج، والكوليكشن مش مربوط طول ما دومين المتجر فاضي', () => {
  const e = scenario();
  const prods = block(e.ss.getSheetByName('Today'), 'المنتجات النهارده');
  const spend = n => (prods.find(r => r[0] === n) || [])[1];
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
  e.requests.forEach(u => assert.match(u, /^https:\/\/graph\.facebook\.com\//));
});

test('نقطة التعادل للأوردر (COD)', () => {
  const e = env();
  e.c.setupAll();
  const p = { price: 300, cost: 100, shipping: 50, other: 10, confirm: 0.8, delivery: 0.75 };
  assert.equal(Math.round(e.c.breakEven_(p) * 100) / 100, 0.8 * (0.75 * 200 - 50 - 10));
  assert.equal(e.c.breakEven_(Object.assign({}, p, { cost: null })), null);
});
