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
    if (/\/insights\?/.test(url) && /reach/.test(url)) { // Meta Campaigns: كل مستوى لوحده في الفترة، صف لكل كامبين / أد سيت / إعلان
      const t = JSON.parse(decodeURIComponent(url.match(/time_range=([^&]+)/)[1])), level = url.match(/level=(\w+)/)[1], by = {};
      (ads[id] || []).filter(r => r.date_start >= t.since && r.date_start <= t.until).forEach(r => {
        const k = level === 'campaign' ? r.campaign_id : level === 'adset' ? r.adset_id : r.ad_id;
        const x = by[k] = by[k] || { campaign_id: r.campaign_id, campaign_name: r.campaign_name, spend: 0, impressions: 0, reach: 0, inline_link_clicks: 0, v3: 0 };
        if (level !== 'campaign') Object.assign(x, { adset_id: r.adset_id, adset_name: r.adset_name });
        if (level === 'ad') Object.assign(x, { ad_id: r.ad_id, ad_name: r.ad_name });
        x.spend += Number(r.spend); x.impressions += Number(r.impressions); x.reach += Number(r.reach || Number(r.impressions) / 2);
        x.inline_link_clicks += Number(r.inline_link_clicks); x.v3 += Number(r.v3 || 0);
      });
      return { data: Object.keys(by).map(k => { const x = by[k]; return Object.assign({}, x, { spend: String(x.spend), impressions: String(x.impressions),
        reach: String(x.reach), inline_link_clicks: String(x.inline_link_clicks), actions: [{ action_type: 'video_view', value: String(x.v3) }], v3: undefined }); }) };
    }
    if (/\/v[\d.]+\/\?ids=/.test(url)) { // ميزانيات الكامبينات والأد سيتس
      const out = {};
      decodeURIComponent(url.match(/ids=([^&]+)/)[1]).split(',').forEach(x => { if ((opt.budgets || {})[x]) out[x] = Object.assign({ id: x }, opt.budgets[x]); });
      return out;
    }
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
  const trigger = fn => { const b = { timeBased: () => b, everyMinutes: () => b, atHour: () => b, nearMinute: () => b, everyDays: () => b, forSpreadsheet: () => b, onEdit: () => b,
    inTimezone: () => b, create: () => { const t = { getHandlerFunction: () => fn }; triggers.push(t); return t; } }; return b; };
  const c = load('ads-sheet', {
    SpreadsheetApp: {
      getActive: () => active, openById: id => { if (id !== ORDERS_ID) throw new Error('not found ' + id); return source; },
      newDataValidation: builder, newConditionalFormatRule: builder, ProtectionType: { SHEET: 'SHEET', RANGE: 'RANGE' },
      GroupControlTogglePosition: { BEFORE: 'BEFORE', AFTER: 'AFTER' },
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
  assert.deepEqual(tab.getRange(8, 1, 1, 7).getValues()[0].map(h => String(h).split(' ')[0]),
    ['PLATFORM', 'AD', 'AMOUNT', 'ORDERS', 'CPP', 'ROAS', 'AOV']);
  const all = tab.getDataRange().getValues().map(r => r.slice(0, 7));
  assert.ok(!all.flat().some(v => /14%|ضريبة/.test(String(v))), 'مفيش 14% في الجدول');
  const acc1 = all.find(r => r[1] === 'Chance 26'), acc2 = all.find(r => r[1] === 'Chance Golden Era'), acc3 = all.find(r => r[1] === 'chance store . egy3');
  // AOV للحساب من Meta (قيمة المشتريات ÷ المشتريات)، وللتوتال من شوبيفاي (المبيعات ÷ الأوردرات)
  assert.deepEqual(acc1.slice(2), [1000, 4, 250, 1.8, 450]);
  assert.deepEqual(acc2.slice(2), [100, 2, 50, 9, 450]);
  assert.deepEqual(acc3.slice(2), [0, 0, '', '', '']);
  assert.equal(all[8][0], 'META');
  const meta = all.find(r => r[0] === 'META TOTAL'), tt = all.find(r => r[0] === 'TIKTOK TOTAL'), grand = all.find(r => r[0] === 'GRAND TOTAL');
  // AOV التوتال زي شوبيفاي: Net Sales (المنتجات بعد الخصم من غير الشحن)، ولسه مااتقراش من شوبيفاي: فاضي
  assert.deepEqual(meta.slice(2), [1100, 2, 550, 0.95, '']);
  assert.deepEqual(tt.slice(2), [0, 1, 0, '', '']);
  assert.deepEqual(grand.slice(2), [1100, 3, 366.67, 1.18, '']);
  assert.ok(all.some(r => r[0] === 'TIKTOK' && r[1] === 'TikTok' && r[6] === ''), 'TikTok مفيهوش قيمة مشتريات: AOV فاضي');
  assert.equal(tab.getDataRange().getValues().find(r => r[8] === 'TIME') !== undefined, true, 'الجداول اللي على اليمين بتبدأ من عمود I');
  assert.match(String(e.c.getStatus_('LIVE')), /✓ OK/);
  // Net Sales من شوبيفاي: أوردر 1001 و 1002 (Meta) و 1003 (TikTok)، و 1004 بتاع إمبارح مش داخل
  const H = ['Order ID', 'Created At', 'Total Price', 'Products', 'UTM Source', 'UTM Campaign', 'UTM Content', 'UTM ID', 'UTM Term', 'Attr UTM Source',
    'Attr UTM Campaign', 'Attr UTM Content', 'Attr UTM ID', 'Attr UTM Term', 'Order Referrer', 'Source Name', 'City', 'Gross Sales', 'Net Sales', 'Variants'];
  const so = (id, net) => { const r = H.map(() => ''); r[0] = id; r[18] = net; return r; };
  e.ss.addSheet('Shopify Orders', [H, so('#1001', 700), so('#1002', 250), so('#1003', 200), so('#1004', 9999)]);
  e.c.resetCaches_();
  e.c.withLock_(() => e.c.rebuildViews_({ full: true }));
  const v2 = tab.getDataRange().getValues().map(r => r.slice(0, 7)), aov = l => v2.find(r => r[0] === l)[6];
  assert.deepEqual([aov('META TOTAL'), aov('TIKTOK TOTAL'), aov('GRAND TOTAL'), v2.find(r => r[1] === 'Chance 26')[6]], [475, 200, 383.33, 450],
    'التوتال من Net Sales ÷ الأوردرات، والحساب لسه من Meta');
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
  const head = values.find(r => r[8] === 'TIME');
  assert.deepEqual(head.slice(8, 17), ['TIME', 'META SPEND', 'ORDERS (META + DIRECT)', 'CPP (META + DIRECT)', 'SHOPIFY ROAS (META + DIRECT)', 'TIKTOK SPEND', 'TIKTOK ORDERS', 'TIKTOK CPP', 'SHOPIFY ROAS (TIKTOK)']);
  assert.deepEqual(values.filter(r => /^\d+:00 [AP]M$/.test(r[8])).map(r => r[8]), ['3:00 AM', '6:00 AM', '9:00 AM', '12:00 PM', '3:00 PM', '6:00 PM', '9:00 PM', '12:00 AM'], 'كل 3 ساعات على مدار اليوم');
  assert.deepEqual(todayRow(e, '3:00 PM', 9).slice(8, 17), ['3:00 PM', 500, 3, 166.67, 2.5, 0, 0, '', '']);
  assert.deepEqual(todayRow(e, '6:00 PM', 9).slice(9, 17), ['', '', '', '', '', '', '', '']);
  // صفوف قديمة: الشيت كان بيحوّل "18:00" لوقت (تاريخ 1899)، وبتتقري برضه
  e.ss.getSheetByName('Intraday').appendRow([e.today, e.c.makeDate('1899-12-30T18:00:00+02:00'), 'META', 800, 4, 200, 2400]);
  e.c.writeToday_();
  assert.deepEqual(todayRow(e, '6:00 PM', 9).slice(8, 13), ['6:00 PM', 800, 4, 200, 3]);
});

test('Today: بنشمارك Meta، أرقام التلات شهور اللي فاتوا مع بعض مقابل كل حساب النهارده، بترتيب الفانل', () => {
  const probe = env(), today = probe.c.todayKey_(), p = today.split('-').map(Number);
  const day = i => new Date(Date.UTC(p[0], p[1] - 1 - i, 10)).toISOString().slice(0, 10);
  // كل صف = 1000 ظهور و 2 شراية: CPM الشهر = الصرف، وتكلفة الشراية = الصرف ÷ 2
  const e = env({ ads: { [A1]: [adRow(today, '111', 600), adRow(day(1), '111', 300), adRow(day(2), '111', 200), adRow(day(3), '111', 500),
    adRow(day(4), '111', 50)] } });
  e.c.setupAll();
  e.c.liveTick();
  const values = e.ss.getSheetByName('Today').getDataRange().getValues();
  const head = values.find(r => r[8] === 'METRIC');
  const mon = i => e.c.Utilities.formatDate(new Date(Date.UTC(p[0], p[1] - 1 - i, 15)), 'UTC', 'MMM-yyyy');
  assert.deepEqual(head.slice(8, 13), ['METRIC', 'LAST 3 MONTHS (' + mon(3) + ' → ' + mon(1) + ')', 'Chance 26', 'Chance Golden Era', 'chance store . egy3']);
  const metrics = values.map(r => r[8]), first = metrics.indexOf('METRIC') + 1;
  assert.deepEqual(metrics.slice(first, first + 18), ['Meta ROAS', 'AOV', 'CVR', 'CPM', 'CPC (all)', 'CPC (link)', 'CTR (all)', 'CTR (link)',
    'Hook rate', 'Hold rate', 'Cost per content view', 'Link click → LPV', 'Cost per LPV', 'Content view → ATC', 'ATC → Checkout',
    'Checkout → Purchase', 'LPV → Purchase', '']);
  const row = l => values.find(r => r[8] === l).slice(8, 13);
  // التلات شهور مع بعض: صرف 1000 ÷ 3000 ظهور = CPM 333.33 (من غير الشهر الرابع، 50)؛ والنهارده 600 أسوأ
  assert.deepEqual(row('CPM'), ['CPM', 1000 / 3, 600, '—', '—']);
  assert.deepEqual(row('AOV'), ['AOV', '—', 450, '—', '—']);
  assert.deepEqual(row('Meta ROAS'), ['Meta ROAS', '—', 1.5, '—', '—']);
  assert.deepEqual(row('Checkout → Purchase'), ['Checkout → Purchase', '—', 2 / 3, '—', '—']);
  assert.deepEqual(row('Hook rate'), ['Hook rate', '—', '—', '—', '—'], 'مفيش فيديو: فاضي مش 0%');
  const t = e.requests.filter(u => /time_increment=monthly/.test(u) && /level=account/.test(u) && /video_thruplay/.test(u))
    .map(u => JSON.parse(decodeURIComponent(u.match(/time_range=([^&]+)/)[1])));
  assert.ok(t.some(x => x.since === day(3).slice(0, 8) + '01' && x.until === e.c.shiftKey_(today.slice(0, 8) + '01', -1)), 'التلات شهور اللي قبل الشهر ده');
  const cpm = values.find(r => r[8] === 'CPM');
  assert.equal(e.ss.getSheetByName('Today').attr(values.indexOf(cpm) + 1, 11).bg, '#f4cccc');
  // Hook و Hold من الفيديو: 3 ثواني ÷ الظهور، و ThruPlay ÷ 3 ثواني
  const raw = e.c.funnelRaw_([{ impressions: '1000', actions: [{ action_type: 'video_view', value: '300' }], video_thruplay_watched_actions: [{ action_type: 'video_view', value: '60' }] }]);
  assert.deepEqual([raw.videoViews, raw.thruplays], [300, 60]);
  assert.deepEqual([e.c.funnelRatio_(raw, ['Hook rate', 'videoViews', 'impressions', 1, 'pct', false, true]),
    e.c.funnelRatio_(raw, ['Hold rate', 'thruplays', 'videoViews', 1, 'pct', false])], [0.3, 0.2]);
  // مش أحسن شهر ولا متوسط الشهور: مجموع التلات شهور (17 شراية ÷ 20 تشيك أوت)
  const tot = e.c.funnelMonthsTotal_([{ checkouts: 10, purchases: 12 }, { checkouts: 10, purchases: 5 }]);
  assert.equal(e.c.funnelRatio_(tot, ['Checkout → Purchase', 'purchases', 'checkouts', 1, 'pct', false]), 17 / 20);
});

test('Today: أداء المنتجات بالقطع والمبيعات لكل منتج، والإجمالي فيه القطع والأوردرات والصرف و AOV و ROAS', () => {
  const e = scenario(), values = e.ss.getSheetByName('Today').getDataRange().getValues();
  const titles = values.map(r => String(r[8])).filter(t => /^PRODUCT PERFORMANCE/.test(t));
  assert.equal(titles.length, 2);
  const heads = values.filter(r => r[8] === 'PRODUCT');
  assert.equal(heads.length, 2);
  heads.forEach(h => assert.deepEqual(h.slice(8, 16), ['PRODUCT', 'PIECES', 'ORDERS', 'REVENUE', 'SPEND', 'AOV', 'SHOPIFY ROAS', '']));
  // كل قطعة على منتجها، ومبيعات الأوردر 1001 (750) متقسمة بسعر Lip Oil (300) و Blush (250). أوردر TikTok داخل.
  const i = values.findIndex(r => r[8] === 'PRODUCT');
  assert.deepEqual(values.slice(i + 1, i + 4).map(r => r.slice(8, 15)), [
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
  assert.equal(sh.getLastColumn(), 18, 'مفيش أعمدة زيادة جنب الجدول');
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
  assert.deepEqual(v.find(r => r[0] === 'DATE'), ['DATE', 'TOTAL SPEND', 'TOTAL ORDERS', 'ROAS', 'ACTUAL ROAS', 'AOV', 'GROSS SALES', 'NET SALES', 'REVENUE', 'TOTAL UNITS', 'UPO',
    'TOTAL ORDERS', 'CONFIRMED ORDERS', 'IN SHIPPING', 'DELIVERED ORDERS', 'CPL', 'CPO', 'CROSS-SELL REVENUE']);
});

test('Closing: الأعمدة اللي على يمين الجدول من الشكل القديم بتتمسح', () => {
  const e = scenario(), sh = e.ss.getSheetByName('Closing');
  sh.getRange(10, 19, 1, 2).setValues([['AOV قديم', 1313.4]]);
  e.c.liveTick();
  assert.equal(sh.getLastColumn(), 18);
});

test('Closing: المتأكد والمتسلم و REVENUE الفعلي والكروس سيل من حالة شوبيفاي، والأيام بعد آخر قراية فاضية', () => {
  const probe = env(), today = probe.c.todayKey_(), month = today.slice(0, 7), d1 = month + '-01', d2 = month + '-02', B = '(blank)';
  const flow = (id, day, total, products) => ['gid://shopify/Order/' + id, ' #' + id, ' N', B, total, ' ' + day + 'T10:00:00+03:00', B, B, B, B, B, '', '', '', '', products, 'web'];
  const e = env({ orderHead: FLOW_HEAD.slice(0, 17), ads: { [A1]: [adRow(d1, '111', 1000), adRow(d2, '111', 500)] },
    orders: [flow(1, d1, 500, 'Lip Oil x1'), flow(2, d1, 300, 'Lip Oil x1'), flow(3, d1, 200, 'Blush x1'), flow(4, d1, 400, 'Blush x1'), flow(6, d1, 100, 'Blush x1'), flow(5, d2, 600, 'Blush x1')] });
  const st = { 1: { code: 'D', revenue: 800, cross: 300, units: 3 }, 2: { code: 'D', revenue: null, cross: 0, units: null }, 3: { code: 'R', revenue: null },
    4: { code: 'C', revenue: null }, 6: { code: 'S', revenue: null } };
  e.c.orderStatus_ = id => st[String(id).split('/').pop()] || null;
  e.c.orderStatusDay_ = () => d1;
  e.c.setupAll();
  e.c.liveTick(); e.c.liveTick();
  const sh = e.ss.getSheetByName('Closing'), a = closingRow(sh, dayLabel(e.c, d1));
  assert.deepEqual([a['TOTAL SPEND'], a['TOTAL ORDERS'], a.ROAS, a.AOV, a['TOTAL UNITS'], a['CONFIRMED ORDERS'], a['IN SHIPPING'], a['DELIVERED ORDERS'], a.REVENUE,
    a['ACTUAL ROAS'], a.CPO, a['CROSS-SELL REVENUE'], a.CPL], [1000, 5, 1.5, 300, 7, 4, 1, 2, 1100, 1.1, 500, 300, 200],
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
  assert.equal(arch.getRange(1, 1).getValue(), 'اتلمس', 'شهر الشيت مش عنده صرفه من أوله: الأرشيف مابيتكتبش تاني لوحده');
});

test('صرف حساب ناقص من الشيت (اتضاف بعد ما صرف): بيتلاقي بمقارنة Meta ويتسحب لوحده، والأرشيف و Actual ROAS بنفس الأرقام', () => {
  const probe = env(), today = probe.c.todayKey_(), prev = probe.c.closingPrevMonth_(today.slice(0, 7)), last = prev + '-' + probe.c.closingDays_(prev);
  const B = '(blank)', name = probe.c.closingArchiveName_(prev);
  const flow = (id, day, total) => ['gid://shopify/Order/' + id, ' #' + id, ' N', B, total, ' ' + day + 'T10:00:00+03:00', B, B, B, B, B, '', '', '', '', 'Lip Oil x1', 'web'];
  const e = env({ orderHead: FLOW_HEAD.slice(0, 17), strictRange: true,
    ads: { [A1]: [adRow(prev + '-01', '111', 1000), adRow(prev + '-10', '111', 2000), adRow(today, '111', 100)], [A2]: [adRow(prev + '-05', '333', 5000)] },
    orders: [flow(1, prev + '-05', 9000), flow(2, prev + '-06', 6000), flow(3, prev + '-07', 1000)] });
  const st = { 1: { code: 'D', revenue: null }, 2: { code: 'D', revenue: 5000 }, 3: { code: 'S', revenue: null } };
  e.c.orderStatus_ = id => st[String(id).split('/').pop()] || null;
  e.c.setupAll();
  const pullAll = () => { for (let i = 0; i < 20 && e.doc.BACKFILL; i++) e.c.backfillStep(); assert.equal(e.doc.BACKFILL, undefined, 'السحب خلص'); };
  delete e.doc.BACKFILL;
  e.c.startBackfill_(prev + '-01', e.c.shiftKey_(today, -1));
  pullAll();
  // زي chancestore.egy 2: الحساب اتضاف بعد ما الشهر خلص، فصرفه في الشهر اللي فات مش في الشيت، وأوردراته جوه
  const ads = e.ss.getSheetByName('Ads Raw');
  e.c.writeRows_(ads, ads.getDataRange().getValues().slice(1).filter(r => String(r[2]) !== A2), 15, [1]);
  e.c.resetCaches_();
  e.doc.SYNCED_THROUGH = last;
  // المقارنة اليومية والفانل اتعملوا قبل كده (زي الشيت لما الكود الجديد اتلصق): الزرار بس هو اللي يشغلها تاني دلوقتي
  e.doc.SPEND_CHECK_DAY = today; e.doc.FUNNEL_AT = String(Date.now()); delete e.doc.FUNNEL_DUE;
  e.c.liveTick(); e.c.liveTick();
  assert.equal(closingRow(e.ss.getSheetByName(name), 'MONTH TOTAL')['TOTAL SPEND'], 3000, 'الأرشيف من غير صرف الحساب الناقص');
  pullAll(); // الأيام اللي بعد آخر يوم اتسحب (catchUpGap_)
  e.c.refreshNow(); // 🔄 تحديث كامل: بيشغل المقارنة على طول، من غير ما يستنى الفانل
  assert.match(e.alerts.join('\n'), /مطابقة الصرف مع Meta: .*بيتسحب تاني في الخلفية/);
  assert.match(e.c.getStatus_('SPEND_CHECK'), /بيتسحب تاني في الخلفية: ⏳ Chance Golden Era .*: Meta 5,000 والشيت 0/);
  assert.ok(JSON.parse(e.doc.BACKFILL).units.every(u => u[0] === A2 && u[1] >= prev + '-01' && u[2] <= last), 'الحساب ده بس، الشهر ده بس');
  pullAll();
  e.c.liveTick(); // بعد السحب: الأرشيف و Actual ROAS بيتحدثوا لوحدهم في التحديث اللي بعده، حتى بالليل
  const m = closingRow(e.ss.getSheetByName(name), 'MONTH TOTAL');
  assert.deepEqual([m['TOTAL SPEND'], m['TOTAL ORDERS'], m['CONFIRMED ORDERS'], m['IN SHIPPING'], m['DELIVERED ORDERS'], m.REVENUE, m['ACTUAL ROAS'], m.CPO],
    [8000, 3, 3, 1, 2, 14000, 1.75, 4000], 'الأرشيف اتكتب تاني لوحده بالصرف كله');
  const v = e.ss.getSheetByName('Actual ROAS').getDataRange().getValues(), k = v.findIndex(r => r[0] === 'كل الحسابات (البيزنس كله)');
  const row = v.find((r, i) => i > k && r[0] === probe.c.funnelMonthName_(prev));
  assert.deepEqual([row[1], row[2], row[4], row[6], row[7], row[9], row[10], row[11]],
    [m['TOTAL SPEND'], m['TOTAL ORDERS'], m['CONFIRMED ORDERS'], m['IN SHIPPING'], m['DELIVERED ORDERS'], m.REVENUE, m['ACTUAL ROAS'], m.CPO],
    'Actual ROAS للشهر ده = الأرشيف بالظبط');
  e.c.refreshNow();
  assert.match(e.c.getStatus_('SPEND_CHECK'), /✓ صرف كل حساب في الشيت = صرف Meta/);
  e.c.liveTick();
  assert.match(e.ss.getSheetByName('Health').getDataRange().getValues().map(r => r.join(' ')).join('\n'), /مطابقة الصرف مع Meta .*✓ صرف كل حساب/);
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
    ['TIKTOK TOTAL', 'MANUAL (DRAFT)', 'ORGANIC (BIO)', 'ORGANIC (GOOGLE)', 'NO SOURCE', 'GRAND TOTAL'], 'مفيش صف DIRECT لوحده، والبايو تحت المانيول، وجوجل تحت البايو');
  assert.equal(todayRow(e, 'ORGANIC (BIO)')[3], 0);
  assert.equal(grand[3], 5);
});

test('الكتالوج: Today فيه صف CATALOG واحد بصرفه وأوردراته، وتاب الكتالوج فيه تقسيمه على المنتجات (وإعلان صفحة المنتج اللي عليه كاروسيل كتالوج بيفضل على منتجه)', () => {
  const probe = env(), today = probe.c.todayKey_(), at = hm => ' ' + today + 'T' + hm + ':00+03:00', B = '(blank)';
  const flow = (id, hm, total, a, products) => ['gid://shopify/Order/' + id, ' #' + id, ' Name', B, total, at(hm), B, B, B, B, B].concat(a, [products, '4655075']);
  const cat = (adId, name, spend, buys) => ({ date_start: today, ad_id: adId, product_id: '5056' + spend + ', ' + name, spend: String(spend),
    actions: buys ? [{ action_type: 'offsite_conversion.fb_pixel_purchase', value: String(buys) }] : [] });
  const e = env({ orderHead: FLOW_HEAD,
    ads: { [A1]: [adRow(today, '111', 600), adRow(today, '222', 400)] },
    creatives: { 111: 'https://chance-cosmetics.com/products/lip-oil?utm_source=fb', 222: 'https://chance-cosmetics.com/collections/all' },
    shop: { 'lip-oil': { title: 'Lip Oil', handle: 'lip-oil', price: 30000 } },
    // 111 رايح لصفحة Lip Oil و Meta بتقسم جزء من صرفه على منتجات (Product extensions): إعلان Lip Oil، مش كتالوج.
    catalog: { [A1]: [cat('222', 'Lip Oil', 150, 1), cat('222', 'Blush - Pink', 200), cat('222', 'Satin Collection', 30), cat('222', 'Mascara', 0.5),
      cat('111', 'Lip Oil', 90), cat('111', 'Mascara', 20)] },
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
  assert.deepEqual(between(v, 8, 'PRODUCT', 'TOTAL').map(r => r.slice(8, 15)), [
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
  const log = e.ss.getSheetByName('Daily Log').getDataRange().getValues().slice(1).filter(r => r[1] === 'META');
  assert.deepEqual(log.filter(r => r[3] > 0).map(r => [r[2], r[3]]).sort(), [['CATALOG (كل إعلانات الكتالوج)', 400], ['Lip Oil', 600]],
    'صرف إعلان صفحة Lip Oil كله على Lip Oil');
  assert.ok(/✓/.test(e.ss.getSheetByName('Health').getDataRange().getValues().find(r => r[0] === 'صرف الكتالوج')[1]), 'Health: صرف الكتالوج ✓');
});

test('صرف الكتالوج بيتسحب على 7 أيام في المرة، ولو Meta قالت فترة أصغر بيتقسم لحد يوم واحد', () => {
  const probe = env(), today = probe.c.todayKey_(), d = n => probe.c.shiftKey_(today, -n);
  const e = env({ ads: { [A1]: [adRow(today, '222', 100)] } });
  e.c.setupAll();
  const ranges = [], old = e.c.metaAll_;
  e.c.metaAll_ = (path, params) => {
    if (!/breakdowns/.test(JSON.stringify(params || {}))) return old(path, params);
    const r = JSON.parse(params.time_range);
    ranges.push(r.since + '>' + r.until);
    if (r.since !== r.until && r.since < d(13)) throw new Error('Meta code 100: Please try a smaller date range');
    return [{ date_start: r.until, ad_id: '222', product_id: '1, Lip Oil', spend: '10', actions: [] }];
  };
  const rows = e.c.fetchMetaCatalog_(d(15), d(0));
  assert.deepEqual(ranges.slice(0, 1), [d(15) + '>' + d(9)], 'أول 7 أيام');
  assert.ok(ranges.indexOf(d(15) + '>' + d(15)) >= 0, 'اتقسم لحد يوم واحد');
  assert.ok(ranges.indexOf(d(8) + '>' + d(2)) >= 0 && ranges.indexOf(d(1) + '>' + d(0)) >= 0);
  assert.ok(rows.length >= 3);
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
  assert.ok(JSON.parse(e.doc.BACKFILL).units.every(u => u[0] === A4), 'صرف الحساب الجديد بيتسحب من أول يوم الشيت عنده صرف');
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
  const i = v.findIndex(r => r[8] === 'PRODUCT');
  // أوردر 2 جه من إعلان Lip Oil ومافيهوش Lip Oil: كل قطعة على منتجها
  assert.deepEqual(v.slice(i + 1, i + 6).map(r => r.slice(8, 15)), [
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

test('جوجل أورجانيك أكيد (GOOGLE) تحت البايو ومش في META TOTAL، والإعلان اللي في الـ UTM يكسب', () => {
  const probe = env(), today = probe.c.todayKey_(), at = ' ' + today + 'T10:00:00+03:00', B = '(blank)';
  const row = (id, a, src) => ['gid://shopify/Order/' + id, ' #' + id, ' N', B, 500, at, B, B, B, B, B].concat(a, ['Lip Oil x1', src || '4655075']);
  const e = env({ orderHead: FLOW_HEAD, orders: [
    row(1, [B, B, B, 'Google']),
    row(2, [B, B, B, 'https://www.google.com/'], 'web'),
    row(3, ['Camp', 'Ad 1', 'fb', 'Google']),
    row(4, [B, B, B, 'Google'], 'shopify_draft_order'),
    row(5, ['ig', B, 'link_in_bio', 'Instagram']),
    row(6, [B, B, B, 'Direct(Chancestoreegy)']),
    row(7, [B, B, B, 'https://googleads.g.doubleclick.net/']),
  ] });
  e.c.setupAll();
  e.c.liveTick();
  const raw = e.ss.getSheetByName('Orders Raw').getDataRange().getValues().slice(1), p = id => raw.find(r => r[0] === 'gid://shopify/Order/' + id).slice(3, 5);
  assert.deepEqual(p(1), ['GOOGLE', 'google']);
  assert.deepEqual(p(2), ['GOOGLE', 'google'], 'لينك جوجل كامل');
  assert.deepEqual(p(3), ['META', 'utm'], 'الـ UTM بتاع الإعلان قبل ريفرر جوجل');
  assert.deepEqual(p(4), ['GOOGLE', 'google'], 'جوجل قبل الـ Draft');
  assert.deepEqual(p(5), ['BIO', 'link_in_bio']);
  assert.deepEqual(p(6), ['DIRECT', 'referrer']);
  assert.deepEqual(p(7), ['DIRECT', 'no_utm'], 'doubleclick مش جوجل سيرش');
  const meta = todayRow(e, 'META TOTAL'), google = todayRow(e, 'ORGANIC (GOOGLE)');
  assert.equal(meta[3], 3, 'META TOTAL = أوردر Meta + 2 DIRECT، من غير جوجل والبايو');
  assert.equal(google[3], 3);
  assert.equal(google[1], 'جوجل: أورجانيك أكيد');
  assert.equal(todayRow(e, 'GRAND TOTAL')[3], 7, 'جوجل داخل في GRAND TOTAL');
  const labels = e.ss.getSheetByName('Today').getDataRange().getValues().map(r => r[0]);
  assert.equal(labels.indexOf('ORGANIC (GOOGLE)'), labels.indexOf('ORGANIC (BIO)') + 1, 'صف جوجل تحت البايو على طول');
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
  const v = e.ss.getSheetByName('Today').getDataRange().getValues(), i = v.findIndex(r => /^PRODUCT PERFORMANCE — TODAY/.test(String(r[8])));
  assert.deepEqual(v.slice(i + 2, i + 5).map(r => r.slice(8, 15)), [
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
  const v = e.ss.getSheetByName('Today').getDataRange().getValues(), i = v.findIndex(r => /^رصيد الأكاونتات من Meta و TikTok — آخر قراية /.test(String(r[0])));
  assert.ok(i > 0, 'الجدول تحت GRAND TOTAL');
  const rows = v.slice(i + 2, i + 5).map(r => r.slice(0, 6));
  assert.deepEqual(rows[0], ['Chance 26', 1250.5, 4.1, '', 'مفيش حد', 'شغال'], 'مشحون: 1250.5 ÷ 300 في اليوم');
  assert.deepEqual(rows[1], ['Chance Golden Era', 'كارت (بيتخصم لوحده)', 2, 350, 400, '⚠️ عليه فلوس ماتدفعتش'], 'كارت: فاضل 400 على حد الصرف ÷ 200 في اليوم');
  assert.deepEqual(rows[2].slice(1, 6), ['Meta مابتدّيش رصيد الشحن للتوكن ده', '', '', 'مفيش حد', 'شغال']);
  assert.deepEqual(v[i + 5].slice(0, 2), ['TikTok', 'TikTok مش متربط — من المنيو: الإعدادات ← ربط TikTok'], 'TikTok تحت Meta، ولسه مش متربط');
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
  assert.deepEqual(v[i + 1].slice(0, 6), ['المنتج', 'ألوان بتخلص 🔴', 'الستوك', 'بيتباع في اليوم', 'يكفي كام يوم', 'اطلب كام (لـ 30 يوم)']);
  // اطلب كام = اللي يكفي 30 يوم ناقص الستوك. Blush من غير إعلانات بس بيتباع قطعة في اليوم وفاضله 5 أيام. Mask كتير، و Serum أوردره اتلغى،
  // و Dress خلص ومالوش إعلانات، و Brush بيتباع أقل من قطعة في اليوم، فمش ظاهرين. أوردرات النهارده والأقدم من 5 أيام مش محسوبة.
  assert.deepEqual(v.slice(i + 2, i + 8).map(r => r.slice(0, 6)), [
    ['منتجات عليها إعلانات شغالة', '', '', '', '', ''],
    ['Lip Oil', '', 12, 1, 12, 18], ['Eye Pen', '', 30, 0, '— مااتباعش', ''],
    ['منتجات من غير إعلانات — بتتباع 1 قطعة في اليوم أو أكتر وفاضلها 10 أيام أو أقل', '', '', '', '', ''],
    ['Blush', '', 5, 1, 5, 25], ['', '', '', '', '', '']]);
  assert.deepEqual([sh.attr(i + 4, 5).bg, sh.attr(i + 5, 5).bg, sh.attr(i + 7, 5).bg], ['#fff2cc', null, '#f4cccc']);
});

test('Today: نقطة حمرا جنب المنتج لكل لون بيتباع وقرّب يخلص (أو خلص)، وتحت + جنب المنتج صف لكل لون، والأوردرات القديمة بتاخد ألوانها من شوبيفاي', () => {
  const probe = env(), today = probe.c.todayKey_(), d = n => probe.c.shiftKey_(today, -n);
  const variant = (id, handle, product, title, qty) => ({ id: 'gid://shopify/ProductVariant/' + id, title, inventoryQuantity: qty, product: { handle, title: product } });
  const variants = [variant(11, 'lip-oil', 'Lip Oil', 'Red', 2), variant(12, 'lip-oil', 'Lip Oil', 'Pink', 15), variant(13, 'lip-oil', 'Lip Oil', 'Nude', 0),
    variant(14, 'lip-oil', 'Lip Oil', 'Coral', 3), variant(21, 'blush', 'Blush', 'Default Title', 1)];
  const line = (title, qty, v) => ({ title, quantity: qty, currentQuantity: qty, variant: { id: 'gid://shopify/ProductVariant/' + v } });
  const order = (id, day, lines, x) => Object.assign({ id: 'gid://shopify/Order/' + id, createdAt: day + 'T10:00:00Z', sourceName: 'web',
    originalTotalPriceSet: { shopMoney: { amount: '500.0' } }, customAttributes: [], lineItems: { nodes: lines }, customerJourneySummary: { lastVisit: null } }, x || {});
  // Red: 5 قطع في 5 أيام وفاضل 2 = يومين. Nude خلص. Pink يكفي 15 يوم. Coral أوردره اتلغى. Blush نوع واحد: مالوش نقط.
  const created = [order(1, d(1), [line('Lip Oil', 3, 11), line('Lip Oil', 5, 12)]), order(2, d(2), [line('Lip Oil', 2, 11), line('Lip Oil', 1, 13)]),
    order(3, d(3), [line('Lip Oil', 4, 14)], { cancelledAt: d(3) + 'T11:00:00Z' }), order(4, d(2), [line('Blush', 5, 21)]), order(5, today, [line('Lip Oil', 9, 12)])];
  const e = env({ orderHead: FLOW_HEAD.slice(0, 17), orders: [] });
  const opt = { created, variants };
  fakeShopify(e, [], opt);
  e.c.orderStatus_ = id => (String(id).split('/').pop() === '3' ? { code: 'C', revenue: null } : null);
  Object.assign(e.user, { SHOPIFY_TOKEN: 'TOKEN1', SHOPIFY_TOKEN_EXP: String(Date.now() + 3600000) });
  e.c.setupAll(); e.c.liveTick(); e.c.liveTick();
  const tab = e.ss.getSheetByName('Shopify Orders'), V = tab.getDataRange().getValues()[0].indexOf('Variants');
  assert.ok(V > 0);
  assert.equal(tab.getDataRange().getValues().find(r => r[0] === 'gid://shopify/Order/1')[V], '11 x3 | 12 x5');
  assert.deepEqual(e.ss.getSheetByName('Shopify Stock').getDataRange().getValues().slice(1).map(r => r[6]).sort(), ['Coral', 'Default Title', 'Nude', 'Pink', 'Red']);
  const look = () => {
    const v = e.ss.getSheetByName('Today').getDataRange().getValues(), i = v.findIndex(r => /^الستوك يكفي كام يوم/.test(String(r[0])));
    const at = v.findIndex((r, k) => k > i && r[0] === 'Lip Oil');
    return { lip: v[at], row: at + 1, kids: n => v.slice(at + 1, at + 1 + n), blush: v.find((r, k) => k > i && r[0] === 'Blush') };
  };
  const todaySh = () => e.ss.getSheetByName('Today');
  let t = look();
  assert.deepEqual(t.lip.slice(0, 5), ['Lip Oil', '🔴🔴', 20, 2.2, 9]);
  // صف لكل لون تحت المنتج: الستوك، وبيتباع في اليوم، ويكفي كام يوم أو نفد، واطلب كام
  assert.deepEqual(t.kids(2).map(r => r.slice(0, 6)), [['   ↳ Nude', '🔴', 0, 0.2, 'نفد', 6], ['   ↳ Red', '🔴', 2, 1, 2, 28]]);
  assert.ok(t.kids(2).every(r => r.slice(6).every(x => x === '')), 'الجداول اللي على اليمين مش في صفوف الألوان');
  // جروب مقفول، والـ + على صف المنتج
  const sh = todaySh(), grp = sh.getRowGroup(t.row + 1, 1);
  assert.deepEqual([sh.getRowGroupDepth(t.row), grp.start, grp.end, grp.isCollapsed(), sh.groupControl], [0, t.row + 1, t.row + 2, true, 'BEFORE']);
  assert.equal(t.blush[1], '', 'منتج بنوع واحد مالوش نقط');
  assert.equal(sh.getRowGroupDepth(t.row + 4), 0, 'Blush مالوش جروب');
  grp.expand(); // فتحته
  e.c.liveTick();
  assert.equal(todaySh().getRowGroup(t.row + 1, 1).isCollapsed(), false, 'التحديث مابيقفلش اللي مفتوح');
  // أوردر اتقرا قبل عمود الألوان: بيتقري تاني من شوبيفاي بألوانه
  const rowAt = tab.getDataRange().getValues().findIndex(r => r[0] === 'gid://shopify/Order/1') + 1;
  tab.getRange(rowAt, V + 1).setValue('');
  opt.editedNow = { 'gid://shopify/Order/1': [line('Lip Oil', 3, 11), line('Lip Oil', 4, 14)] };
  e.c.liveTick();
  assert.equal(tab.getRange(rowAt, V + 1).getValue(), '11 x3 | 14 x4');
  assert.match(e.doc.STATUS_SHOP_VARIANTS, /✓ 1 أوردر$/);
  t = look();
  assert.equal(t.lip[1], '🔴🔴🔴', 'Coral بقى بيتباع (4 قطع) وفاضل 3');
  assert.deepEqual(t.kids(3).map(r => r[0]), ['   ↳ Nude', '   ↳ Red', '   ↳ Coral']);
  const g2 = todaySh().getRowGroup(t.row + 1, 1);
  assert.deepEqual([g2.start, g2.end, g2.isCollapsed(), todaySh().getRowGroupDepth(t.row + 4)], [t.row + 1, t.row + 3, false, 0],
    'الجروب اتعمل تاني على 3 صفوف وفضل مفتوح، من غير جروبات فوق بعض');
});

test('Today: الجداول اللي على اليمين بتنزل تحت صفوف الألوان (الجروب بيخبي الصف كله)', () => {
  const c = env().c, g = c.todayGrid_();
  g.set(1, 1, 'L1'); g.set(2, 1, 'L2'); g.set(1, 8, 'R1'); g.set(2, 8, 'R2'); g.set(3, 8, 'R3'); g.merge(3, 8, 1, 7);
  g.live = [[2, 9]];
  g.groups = [{ name: 'Lip Oil', row: 2, n: 2 }];
  c.todayMakeRoom_(g);
  const at = (r, col) => (g.rows[r - 1] && g.rows[r - 1][col - 1] ? g.rows[r - 1][col - 1].v : '');
  assert.deepEqual([at(1, 8), at(2, 8), at(3, 8), at(4, 8), at(5, 8), at(2, 1)], ['R1', '', '', 'R2', 'R3', 'L2']);
  assert.equal(JSON.stringify([g.merges[0], g.live[0]]), '[[5,8,1,7],[4,9]]');
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
      if (/graphql\.json$/.test(url) && /productVariants/.test(JSON.parse(p.payload).query)) { // الستوك
        if (o.stockError) return json(403, { errors: 'no read_inventory' });
        const v = o.variants || [], page = Number(JSON.parse(p.payload).variables.after || 0), size = o.variantPage || 250;
        return json(200, { data: { productVariants: { nodes: v.slice(page * size, page * size + size),
          pageInfo: { hasNextPage: (page + 1) * size < v.length, endCursor: String(page + 1) } } } });
      }
      if (/graphql\.json$/.test(url) && /agreements/.test(JSON.parse(p.payload).query)) { // الجروس سيلز وقت الأوردر
        return json(200, { data: { nodes: JSON.parse(p.payload).variables.ids.map(id => ((o.gross || {})[id]
          ? { id, agreements: { nodes: [{ reason: 'ORDER', sales: { nodes: o.gross[id].map(x => ({ lineType: x[0],
            totalAmount: { shopMoney: { amount: String(x[1]) } }, totalDiscountAmountBeforeTaxes: { shopMoney: { amount: String(x[2]) } } })) } }] } } : null)) } });
      }
      if (/graphql\.json$/.test(url) && /nodes\(ids/.test(JSON.parse(p.payload).query) && /currentQuantity/.test(JSON.parse(p.payload).query)) { // أوردرات اتعدلت
        return json(200, { data: { nodes: JSON.parse(p.payload).variables.ids.map(id => ((o.editedNow || {})[id]
          ? { id, cancelledAt: null, lineItems: { nodes: o.editedNow[id], pageInfo: { hasNextPage: false } } } : null)) } });
      }
      if (/graphql\.json$/.test(url) && /nodes\(ids/.test(JSON.parse(p.payload).query)) { // عنوان الشحن (المحافظة بس)
        if (o.addrError) return json(403, { errors: 'not approved to access the ShippingAddress' });
        return json(200, { data: { nodes: JSON.parse(p.payload).variables.ids.map(id => (o.provinces || {})[id] ? { id, shippingAddress: { province: o.provinces[id] } } : { id, shippingAddress: null }) } });
      }
      if (/graphql\.json$/.test(url) && /ordersCount/.test(JSON.parse(p.payload).query)) { // مطابقة العدد
        const v = JSON.parse(p.payload).variables, n = q => { const m = q.match(/'([^']+)'.*'([^']+)'/); return (o.created || []).filter(x => x.createdAt >= m[1] && x.createdAt < m[2]).length + ((o.extraCount || {})[m[1]] || 0); };
        return json(200, { data: { a: { count: n(v.a) }, b: { count: n(v.b) } } });
      }
      if (/graphql\.json$/.test(url) && /collections\(first/.test(JSON.parse(p.payload).query)) { // الكوليكشنز
        return json(200, { data: { collections: { nodes: o.collections || [], pageInfo: { hasNextPage: false, endCursor: null } } } });
      }
      if (/graphql\.json$/.test(url) && /productVariantsCount/.test(JSON.parse(p.payload).query)) {
        return json(200, { data: { productVariantsCount: { count: (o.variants || []).length + (o.extraVariants || 0) } } });
      }
      if (/graphql\.json$/.test(url) && /^created_at/.test(JSON.parse(p.payload).variables.q || '')) { // الأوردرات نفسها
        if (o.ordersError) return json(403, { errors: 'no access' });
        const body = JSON.parse(p.payload), since = body.variables.q.match(/'(.*)'/)[1], size = o.createdPage || 40;
        const list = (o.created || []).filter(x => x.createdAt >= since).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
        const page = Number(body.variables.after || 0);
        return json(200, { data: { orders: { nodes: list.slice(page * size, page * size + size),
          pageInfo: { hasNextPage: (page + 1) * size < list.length, endCursor: String(page + 1) } } } });
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
  const q = calls.filter(x => /graphql/.test(x.url)).map(x => JSON.parse(x.p.payload)).filter(x => /updated_at/.test(x.variables.q || ''));
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

test('الستوك من أبليكيشن شوبيفاي: حي، بيكسب الفلو والصورة الثابتة، وبيتقري كل نص ساعة، والمتمسح بيروح', () => {
  const variant = (id, handle, title, qty, tracks) => ({ id: 'gid://shopify/ProductVariant/' + id, inventoryQuantity: qty,
    product: { handle, title, tracksInventory: tracks !== false } });
  const variants = [variant(1, 'lip-oil', 'Lip Oil', 7), variant(2, 'lip-oil', 'Lip Oil', -2), variant(3, 'blush', 'Blush', 3),
    variant(4, 'gift-card', 'Gift Card', 0, false), variant(5, 'serum', 'Serum', 0)];
  const archived = variant(6, 'old-blush', 'Blush', 50);
  archived.product.status = 'ARCHIVED';
  variants.push(archived);
  const e = env({ snapshot: { 'Lip Oil': 999, 'Serum': 70, 'Old Mask': 4 },
    stock: [['P2', 'V2', 'Blush', 'Default Title', 'BL', 'blush', 40, 250]] });
  const calls = fakeShopify(e, [], { variants, variantPage: 2 });
  Object.assign(e.user, { SHOPIFY_TOKEN: 'TOKEN1', SHOPIFY_TOKEN_EXP: String(Date.now() + 3600000) });
  e.c.setupAll();
  e.c.liveTick();
  const reads = () => calls.filter(x => /productVariants\(/.test(String((x.p || {}).payload))).length;
  assert.equal(reads(), 3, '6 أنواع، 2 في الصفحة');
  const sh = e.ss.getSheetByName('Shopify Stock');
  assert.ok(sh && sh.hidden, 'تاب مخفي');
  assert.equal(sh.getDataRange().getValues().length - 1, 4, 'Gift Card مابيتتبعش ستوكه، والمنتج المؤرشف مش محسوب');
  const s = e.c.stockByName_();
  assert.deepEqual([s.by['Lip Oil'], s.by.Blush, s.by.Serum, s.by['Old Mask'], s.by['Gift Card']], [7, 3, 0, undefined, undefined],
    'الأبليكيشن بيكسب الفلو والصورة، والنوع اللي تحت الصفر = 0، واللي مش في شوبيفاي مالوش ستوك (الصورة الثابتة مابتتاخدش)');
  assert.match(s.status, /^✓ ستوك حي من أبليكيشن شوبيفاي: 3 منتج، آخر قراية \d{4}-\d\d-\d\d \d\d:\d\d$/);
  assert.equal(s.at, e.doc.STOCK_APP_AT);
  const today = e.ss.getSheetByName('Today').getDataRange().getValues().find(r => /^الستوك يكفي كام يوم/.test(String(r[0])));
  assert.match(String(today[0]), /الستوك: \d{4}-\d\d-\d\d \d\d:\d\d$/, 'وقت آخر قراية في عنوان الجدول');
  assert.match(e.ss.getSheetByName('Health').getDataRange().getValues().map(r => r.join(' ')).join('\n'), /الستوك من شوبيفاي \(الأبليكيشن\) .*✓ 3 منتج/);
  // التحديث الجاي قبل نص ساعة مابيقراش تاني
  e.c.liveTick();
  assert.equal(reads(), 3);
  // 📦 بيقرا على طول، والنوع اللي اتمسح من شوبيفاي بيروح
  variants.splice(2, 1);
  variants[0].inventoryQuantity = 5;
  variants.pop(); // المؤرشف
  let flowReads = 0;
  const readFlow = e.c.readStock_;
  e.c.readStock_ = () => { flowReads++; return readFlow(); };
  e.c.refreshProductsNow();
  assert.equal(flowReads, 0, 'تاب الستوك في شيت الفلو مابيتقريش خالص لما الأبليكيشن فيه الستوك');
  assert.equal(reads(), 5);
  const t = e.c.stockByName_();
  assert.deepEqual([t.by['Lip Oil'], t.by.Blush], [5, undefined], 'Blush اتمسح من شوبيفاي، وشيت الفلو مابيتفتحش خالص');
  // من غير إذن (onEdit) بيقرا التاب بس
  e.c.UrlFetchApp = { fetch: () => { throw new Error('مفيش إذن'); } };
  e.c.resetCaches_(); e.c.STOCK_ = null;
  assert.equal(e.c.stockByName_().by['Lip Oil'], 5);
});

test('الستوك من أبليكيشن شوبيفاي: لو شوبيفاي رفض، الغلط في Health والشيت شغال بالفلو والصورة', () => {
  const e = env({ snapshot: { 'Lip Oil': 12 }, stock: [] });
  fakeShopify(e, [], { stockError: true });
  Object.assign(e.user, { SHOPIFY_TOKEN: 'TOKEN1', SHOPIFY_TOKEN_EXP: String(Date.now() + 3600000) });
  e.c.setupAll(); e.c.liveTick();
  assert.equal(e.c.stockByName_().by['Lip Oil'], 12);
  assert.match(e.ss.getSheetByName('Health').getDataRange().getValues().map(r => r.join(' ')).join('\n'), /الستوك من شوبيفاي \(الأبليكيشن\) .*✗ شوبيفاي رفض الطلب \(403\)/);
});

test('الأوردرات من أبليكيشن شوبيفاي: بتحل محل شيت الفلو، بالـ UTM من الفورم والزيارة، والمحافظة، من غير بيانات عملاء', () => {
  const probe = env(), today = probe.c.todayKey_(), B = '(blank)';
  const attrs = m => Object.keys(m).map(k => ({ key: k, value: m[k] }));
  const order = (id, hm, x) => Object.assign({ id: 'gid://shopify/Order/' + id, createdAt: today + 'T' + hm + ':00Z', sourceName: '4655075',
    originalTotalPriceSet: { shopMoney: { amount: '500.0' } }, customAttributes: [], lineItems: { nodes: [{ title: 'Lip Oil', quantity: 1 }] },
    customerJourneySummary: { lastVisit: null } }, x);
  const created = [
    order(1, '06:00', { customAttributes: attrs({ 'الاسم': 'X', 'رقم التليفون': '+2010', utm_source: 'facebook', utm_campaign: '120256366878574660',
      utm_content: '120256366885944660', utm_id: '120256366878574660', utm_term: '120256366881434660', 'Order Referrer': 'Facebook', 'المحافظة': 'الدقهلية' }),
      lineItems: { nodes: [{ title: 'Lip Oil', quantity: 2 }, { title: 'Blush', quantity: 1 }] } }),
    order(2, '06:30', { sourceName: 'shopify_draft_order', originalTotalPriceSet: { shopMoney: { amount: '300.0' } } }),
    order(3, '07:00', { sourceName: 'web', customerJourneySummary: { lastVisit: { referrerUrl: 'https://l.instagram.com/', utmParameters: null } } }),
    order(4, '07:30', { customAttributes: attrs({ 'Order Referrer': 'Direct(Chancestoreegy)', 'المحافظة': 'القاهرة' }) })];
  // شيت الفلو فيه أوردر تاني خالص: لو اتقرا هيبان
  const flowRow = ['gid://shopify/Order/99', ' #99', ' N', B, 900, ' ' + today + 'T10:00:00+03:00', B, B, B, B, B, B, B, B, B, 'Mask x1', 'web'];
  const e = env({ orderHead: FLOW_HEAD.slice(0, 17), orders: [flowRow] });
  const opt = { created, createdPage: 3, provinces: { 'gid://shopify/Order/1': 'Dakahlia', 'gid://shopify/Order/2': 'Giza' } };
  const calls = fakeShopify(e, [], opt);
  Object.assign(e.user, { SHOPIFY_TOKEN: 'TOKEN1', SHOPIFY_TOKEN_EXP: String(Date.now() + 3600000) });
  e.c.setupAll();
  e.c.liveTick();
  const sh = e.ss.getSheetByName('Shopify Orders');
  assert.ok(sh && sh.hidden, 'تاب مخفي');
  const tab = sh.getDataRange().getValues();
  assert.ok(!tab.flat().some(v => /\+2010|^X$/.test(String(v))), 'مفيش اسم ولا تليفون');
  assert.equal(e.doc.SHOP_ORDERS_READY, '1');
  assert.match(calls.filter(x => /"q":"created_at/.test(String((x.p || {}).payload)))[0].p.payload, /2026-10-13T09:00:00Z/, 'أول قراية من آخر الأرشيف');
  const raw = e.ss.getSheetByName('Orders Raw').getDataRange().getValues().slice(1), by = id => raw.find(r => r[0] === 'gid://shopify/Order/' + id);
  assert.equal(by(99), undefined, 'شيت الفلو مابقاش بيتقري');
  assert.deepEqual([by(1)[3], by(1)[6], by(1)[7], by(1)[8], by(1)[16], by(1)[17]],
    ['META', 'Lip Oil x2 | Blush x1', 500, 'Dakahlia', '120256366878574660', '120256366881434660']);
  assert.deepEqual([by(2)[3], by(3)[3], by(4)[3]], ['MANUAL', 'META', 'DIRECT']);
  assert.deepEqual([by(2)[8], by(3)[8], by(4)[8]], ['Giza', '', 'القاهرة'], 'المحافظة من عنوان الشحن، وإلا من الفورم');
  assert.equal(raw.filter(r => /Order\/[1-4]$/.test(r[0])).length, 4);
  const health = e.ss.getSheetByName('Health').getDataRange().getValues().map(r => r.join(' ')).join('\n');
  assert.match(health, /مصدر الأوردرات أبليكيشن شوبيفاي ✓/);
  assert.match(health, /الأوردرات من شوبيفاي \(الأبليكيشن\) .*✓ 4 أوردر اتقرا/);
  assert.match(health, /مطابقة الأوردرات مع شوبيفاي .*✓ .*شوبيفاي 0 والشيت 0/);
  assert.match(health, /محافظة الأوردرات .*✓ المحافظة من عنوان الشحن/);
  // لو شوبيفاي عنده أوردر الشيت مافيهوش، Health بيقول
  const y = e.c.shiftKey_(today, -1), yUtc = e.c.Utilities.parseDate(y + ' 00:00', 'Africa/Cairo', 'yyyy-MM-dd HH:mm').toISOString().replace(/\.\d+Z$/, 'Z');
  opt.extraCount = { [yUtc]: 1 };
  e.c.checkShopifyOrders_();
  assert.match(e.doc.STATUS_SHOP_ORDERS_CHECK, /⚠️ مش متطابق: .* شوبيفاي 1 والشيت 0/);
  delete opt.extraCount;
  // التحديث الجاي بيرجع 6 ساعات بس، والأوردر الجديد بيتضاف تحت، واللي اتغير بيتكتب تاني مكانه
  created.push(order(5, '08:00', { customAttributes: attrs({ utm_source: 'tiktok', utm_campaign: 'Camp' }) }));
  created[2].customerJourneySummary.lastVisit.utmParameters = { source: 'facebook', campaign: 'Spring', content: '', term: '' };
  e.c.liveTick();
  const last = calls.filter(x => /"q":"created_at/.test(String((x.p || {}).payload))).pop();
  assert.match(last.p.payload, new RegExp(today + 'T01:30:00Z'), 'آخر أوردر 7:30 ناقص 6 ساعات');
  const tab2 = e.ss.getSheetByName('Shopify Orders').getDataRange().getValues().slice(1);
  assert.deepEqual(tab2.map(r => r[0].split('/').pop()), ['1', '2', '3', '4', '5'], 'من الأقدم للأحدث، من غير تكرار');
  assert.equal(tab2[2][4], 'facebook', 'زيارة أوردر 3 بقت جاهزة');
  const raw2 = e.ss.getSheetByName('Orders Raw').getDataRange().getValues().slice(1);
  assert.equal(raw2.find(r => r[0] === 'gid://shopify/Order/5')[3], 'TIKTOK');
  // المحافظات من الأبليكيشن (أوردر 1 من حساب مش في الشيت، فمش في تاب المحافظات)
  e.c.writeGovTab_();
  const gov = e.ss.getSheetByName('المحافظات').getDataRange().getValues().map(r => r.join(' ')).join('\n');
  assert.match(gov, /\nالقاهرة 1 /);
  assert.match(gov, /المحافظة من أبليكيشن شوبيفاي مع كل تحديث/);
});

test('الأوردرات من أبليكيشن شوبيفاي: لو شوبيفاي مابيدّيش عنوان الشحن، المحافظة من الفورم والأوردرات ماتقفش', () => {
  const probe = env(), today = probe.c.todayKey_();
  const created = [{ id: 'gid://shopify/Order/1', createdAt: today + 'T06:00:00Z', sourceName: '4655075', originalTotalPriceSet: { shopMoney: { amount: '500.0' } },
    customAttributes: [{ key: 'المحافظة', value: 'الجيزة' }, { key: 'Order Referrer', value: 'Direct(Chancestoreegy)' }],
    lineItems: { nodes: [{ title: 'Lip Oil', quantity: 1 }] }, customerJourneySummary: { lastVisit: null } }];
  const e = env({ orderHead: FLOW_HEAD.slice(0, 17), orders: [] });
  fakeShopify(e, [], { created, addrError: true });
  Object.assign(e.user, { SHOPIFY_TOKEN: 'TOKEN1', SHOPIFY_TOKEN_EXP: String(Date.now() + 3600000) });
  e.c.setupAll(); e.c.liveTick();
  const raw = e.ss.getSheetByName('Orders Raw').getDataRange().getValues().slice(1);
  assert.deepEqual(raw.map(r => [r[0], r[3], r[8]]), [['gid://shopify/Order/1', 'DIRECT', 'الجيزة']]);
  assert.equal(e.doc.SHOP_ORDERS_NO_ADDR, today, 'مابيسألش تاني لحد بكره');
  assert.match(e.doc.STATUS_SHOP_ORDERS_ADDR, /⚠️ شوبيفاي مابيدّيش الأبليكيشن عنوان الشحن/);
});

test('الأوردرات من أبليكيشن شوبيفاي: أوردر فيه أكتر من 30 منتج، وغلط عابر في العنوان مابيمسحش المحافظة، والتاب لو اتمسح بيتقري من الأول', () => {
  const probe = env(), today = probe.c.todayKey_();
  const big = { id: 'gid://shopify/Order/1', createdAt: today + 'T06:00:00Z', sourceName: 'web', originalTotalPriceSet: { shopMoney: { amount: '9000.0' } },
    customAttributes: [], lineItems: { nodes: Array.from({ length: 30 }, (_, i) => ({ title: 'P' + i, quantity: 1 })), pageInfo: { hasNextPage: true, endCursor: 'c30' } },
    customerJourneySummary: { lastVisit: null } };
  const e = env({ orderHead: FLOW_HEAD.slice(0, 17), orders: [] });
  const opt = { created: [big], provinces: { 'gid://shopify/Order/1': 'Cairo' } };
  const calls = fakeShopify(e, [], opt), fetch0 = e.c.UrlFetchApp.fetch;
  e.c.UrlFetchApp.fetch = (url, p) => {
    if (/graphql/.test(url) && /order\(id/.test(JSON.parse(p.payload).query)) {
      calls.push({ url, p });
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ data: { order: { lineItems: {
        nodes: [{ title: 'P30', quantity: 2 }, { title: 'P31', quantity: 1 }], pageInfo: { hasNextPage: false } } } } }) };
    }
    if (opt.addrDown && /graphql/.test(url) && /nodes\(ids/.test(JSON.parse(p.payload).query)) return { getResponseCode: () => 502, getContentText: () => 'Bad gateway' };
    return fetch0(url, p);
  };
  Object.assign(e.user, { SHOPIFY_TOKEN: 'TOKEN1', SHOPIFY_TOKEN_EXP: String(Date.now() + 3600000) });
  e.c.setupAll(); e.c.liveTick();
  const row = () => e.ss.getSheetByName('Shopify Orders').getDataRange().getValues()[1];
  assert.equal(row()[3].split(' | ').length, 32, 'كل المنتجات الـ 32');
  assert.match(row()[3], /P30 x2 \| P31 x1$/);
  assert.equal(row()[16], 'Cairo');
  // الطلب الجاي العنوان وقع (502): المحافظة اللي اتقرت بتفضل، وبيسأل تاني المرة الجاية
  opt.addrDown = true;
  e.c.liveTick();
  assert.equal(row()[16], 'Cairo');
  assert.equal(e.doc.SHOP_ORDERS_NO_ADDR, undefined);
  assert.match(e.doc.STATUS_SHOP_ORDERS_ADDR, /هيتقري تاني/);
  // التاب اتمسح: بيتقري من أول الأرشيف تاني
  const t0 = e.ss.getSheetByName('Shopify Orders');
  t0.getRange(2, 1, t0.getLastRow() - 1, t0.getLastColumn()).clearContent(); // التاب اتفضى
  e.c.liveTick();
  const q = calls.filter(x => /"q":"created_at/.test(String((x.p || {}).payload))).pop();
  assert.match(q.p.payload, /2026-10-13T09:00:00Z/);
  assert.equal(e.ss.getSheetByName('Shopify Orders').getDataRange().getValues().length, 2);
});

test('الأوردرات من أبليكيشن شوبيفاي: لو القراية الأولى ماخلصتش أو شوبيفاي رفض، الأوردرات بتفضل من شيت الفلو', () => {
  const probe = env(), today = probe.c.todayKey_(), B = '(blank)';
  const flowRow = ['gid://shopify/Order/99', ' #99', ' N', B, 900, ' ' + today + 'T10:00:00+03:00', B, B, B, B, B, B, B, B, B, 'Mask x1', 'web'];
  const e = env({ orderHead: FLOW_HEAD.slice(0, 17), orders: [flowRow] });
  fakeShopify(e, [], { ordersError: true });
  Object.assign(e.user, { SHOPIFY_TOKEN: 'TOKEN1', SHOPIFY_TOKEN_EXP: String(Date.now() + 3600000) });
  e.c.setupAll(); e.c.liveTick();
  const raw = e.ss.getSheetByName('Orders Raw').getDataRange().getValues().slice(1);
  assert.ok(raw.some(r => r[0] === 'gid://shopify/Order/99'));
  assert.match(e.ss.getSheetByName('Health').getDataRange().getValues().map(r => r.join(' ')).join('\n'),
    /الأوردرات من شوبيفاي \(الأبليكيشن\) .*✗ شوبيفاي رفض الطلب \(403\).*الأوردرات لسه من شيت الفلو/);
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
  const sessionQs = queries.filter(q => /^FROM sessions /.test(q));
  assert.ok(sessionQs.length >= 6, 'كل قرايات الزيارات اتعملت');
  sessionQs.forEach(q => assert.match(q, /WHERE (.* AND )?human_or_bot_session = 'human' /, 'الزيارات من غير البوتات، زي شوبيفاي: ' + q));
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
  assert.deepEqual(tv.slice(7, 15).map(r => r.slice(0, 2)), [['Ad spend (Meta)', 300], ['Sessions', 1000], ['Total sales', 19500], ['Orders', 20],
    ['Conversion rate', 0.02], ['AOV', 1000], ['Bounce rate', 0.5], ['Gross sales', 21000]],
    'أرقام الكروت في الخلايا اللي تحتها، من صف 8 (صرف Meta بالساعة: 100 لكل أكاونت). Gross sales قبل الخصم والمرتجعات');
  assert.deepEqual(tv.slice(14, 15).map(r => r.slice(2, 3)), [[20000]], 'Gross sales إمبارح لحد نفس الساعة');
  assert.equal(tv[17][0], 'PLATFORM', 'جدول الأكاونتات تحت الكروت بـ 10 صفوف');
  assert.equal(api.length, 1);
  const adds = api[0].filter(r => r.addChart).map(r => r.addChart.chart);
  assert.equal(adds.length, 8, '8 كروت');
  assert.deepEqual(Array.from(adds.map(a => a.spec.title)), ['Ad spend (Meta)', 'Sessions', 'Total sales', 'Orders', 'Conversion rate', 'AOV', 'Bounce rate',
    'Gross sales']);
  const sc = adds[1].spec.scorecardChart, src = x => x.sourceRange.sources[0];
  assert.equal(src(adds[7].spec.scorecardChart.keyValueData).startRowIndex, 14, 'Gross sales: النهارده من B15');
  assert.deepEqual([src(sc.keyValueData).startRowIndex, src(sc.keyValueData).startColumnIndex, src(sc.baselineValueData).startColumnIndex], [8, 1, 2],
    'Sessions: النهارده من B9 وإمبارح من C9');
  assert.equal(sc.baselineValueFormat.comparisonType, 'PERCENTAGE_DIFFERENCE');
  const wd = ['الأحد', 'الاتنين', 'التلات', 'الأربع', 'الخميس', 'الجمعة', 'السبت'][new Date(e.c.todayKey_() + 'T12:00:00Z').getUTCDay()];
  assert.equal(adds[1].spec.subtitle.indexOf('\u200F\u202B' + wd + ' اللي فات: 1,000'), 0, 'نفس يوم النهارده الأسبوع اللي فات');
  const cpos = adds.map(a => a.position.overlayPosition);
  assert.deepEqual([cpos[0].anchorCell.rowIndex, cpos[0].anchorCell.columnIndex, cpos[3].offsetXPixels, cpos[4].offsetYPixels], [7, 0, 654, 102], '4 في الصف تحت عنوان الجدول');
  assert.equal(String(v[3][0]), 'Sessions', 'تاب Shopify من غير كارت الصرف ومن غير عنوان');
  assert.ok(!at('Gross sales'), 'كارت Gross sales في Today بس');
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
  // الكروت بالشهر: الاختيار في B7، وتريجر التعديل بيقلب الكروت على طول من الأرقام المتخزنة
  assert.equal(tv[6][1], 'النهارده', 'الاختيار في B7، والأول النهارده');
  assert.ok(e.triggers.some(t => t.getHandlerFunction() === 'todayCardsEdit'), 'تريجر التعديل اتعمل لوحده');
  const sameMonth = y.slice(0, 7) === today.slice(0, 7), months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  const p = today.split('-').map(Number), last = months[new Date(Date.UTC(p[0], p[1] - 2, 1)).getUTCMonth()];
  const n0 = queries.length;
  td.getRange(7, 2).setValue('الشهر ده');
  e.c.todayCardsEdit({ range: td.getRange(7, 2) });
  assert.equal(queries.length, n0, 'التبديل مابيقراش حاجة من شوبيفاي');
  const mv = td.getDataRange().getValues(), row = t => mv.find(r => r[0] === t);
  assert.equal(row('Sessions')[1], 1000 + (sameMonth ? 800 : 0), 'من أول الشهر: الأيام اللي فاتت من الجزء اللي بيتقري كل 3 ساعات + النهارده لحد دلوقتي');
  assert.equal(row('Orders')[1], 20 + (sameMonth ? 20 : 0));
  assert.equal(row('Gross sales')[1], 21000 + (sameMonth ? 20000 : 0));
  assert.equal(row('Ad spend (Meta)')[1], 300, 'صرف الشهر: أيام Meta اللي فاتت (مفيش صرف قبل النهارده هنا) + النهارده بالساعة');
  assert.match(String(mv[6][2]), new RegExp('^من أول ' + months[p[1] - 1] + ' لحد دلوقتي. التغيير عن ' + last + ' (كله|لحد ' + Math.min(p[2], 31) + ')'));
  const ups = api[api.length - 1].filter(r => r.updateChartSpec).map(r => r.updateChartSpec.spec);
  assert.equal(ups.length, 8, 'الكروت كلها اتحدثت مكانها');
  assert.match(ups[1].scorecardChart.baselineValueFormat.description, new RegExp('عن ' + last));
  td.getRange(7, 2).setValue('النهارده');
  e.c.todayCardsEdit({ range: td.getRange(7, 2) });
  assert.equal(td.getDataRange().getValues().find(r => r[0] === 'Sessions')[1], 1000, 'ورجعت للنهارده');
  assert.equal(api[api.length - 1].filter(r => r.updateChartSpec)[1].updateChartSpec.spec.scorecardChart.baselineValueFormat.description, 'عن إمبارح');
  td.getRange(7, 2).setValue('الشهر ده');
  e.doc['GH_Today'] = 'x';
  e.c.liveTick();
  assert.equal(e.ss.getSheetByName('Today').getDataRange().getValues().find(r => r[0] === 'Sessions')[1], 1000 + (sameMonth ? 800 : 0), 'التحديث الجاي بيفضل على الشهر');
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

test('ربط الإعلانات: إعلان معمول من بوست (اللينك مش متاح) بيتربط بالمنتج من اسمه الكامل في نص الإعلان، والإعلان الجديد اللي لسه ماصرفش بيتحسب على منتجه في الستوك', () => {
  const probe = env(), today = probe.c.todayKey_(), d = n => probe.c.shiftKey_(today, -n), B = '(blank)';
  const flow = (id, day, products) => ['gid://shopify/Order/' + id, ' #' + id, ' N', B, 500, ' ' + day + 'T10:00:00+03:00',
    B, B, B, B, B, B, B, B, 'Direct(Chancestoreegy)', products, '4655075'];
  const post = body => ({ creative: { body, effective_object_story_id: '107_109' } });
  const e = env({ orderHead: FLOW_HEAD, ads: { [A1]: [adRow(today, '444', 200, 'MB video 05'), adRow(today, '666', 50, 'Offer'), adRow(today, '777', 30, 'Lips')] },
    activeAds: { [A1]: ['444', '555', '666'] },
    creatives: { 555: 'https://chance-cosmetics.com/products/eye-pen' },
    objects: {
      444: post('شفايف ناعمة زي المارشميلو 😍\nمع Sheglam Marshmallow Puff Lip Pen متوفر بدرجاته دلوقتي'),
      666: post('عروض Black Friday على منتجات SHEGLAM كلها'), // مفيش اسم منتج: يفضل مش مربوط
      777: post('Sheglam Marshmallow Puff Lip Pen Set و Sheglam Marshmallow Puff Lip Pen'), // الاسم الأطول بيكسب لو الاتنين جوه بعض
    },
    stock: [['P1', 'V1', 'Sheglam Marshmallow Puff Lip Pen', 'Default Title', 'MP', 'marshmallow-pen', 20, 350],
      ['P2', 'V2', 'Eye Pen', 'Default Title', 'EP', 'eye-pen', 30, 150],
      ['P3', 'V3', 'Sheglam Marshmallow Puff Lip Pen Set', 'Default Title', 'MS', 'marshmallow-set', 9, 900]],
    orders: [flow(1, d(1), 'Sheglam Marshmallow Puff Lip Pen x5'), flow(2, d(2), 'Sheglam Marshmallow Puff Lip Pen x5')] });
  e.c.setupAll();
  e.c.liveTick(); e.c.liveTick();
  const map = e.ss.getSheetByName('Ad Map').getDataRange().getValues(), head = map[0], row = id => map.find(r => r[0] === id);
  assert.equal(head[20], 'Ad text');
  const r444 = row('444');
  assert.deepEqual([r444[9], r444[11], r444[12]], ['TEXT', 'Sheglam Marshmallow Puff Lip Pen', '✅']);
  assert.match(r444[20], /Sheglam Marshmallow Puff Lip Pen/);
  assert.deepEqual([row('666')[9], row('666')[12]], ['NONE', '❌']);
  assert.equal(row('777')[11], 'Sheglam Marshmallow Puff Lip Pen Set');
  const spend = n => e.c.dailyRows_().filter(r => r[0] === today && r[1] === 'META' && r[2] === n).reduce((a, r) => a + r[3], 0);
  assert.equal(spend('Sheglam Marshmallow Puff Lip Pen'), 200);
  // 555 شغال ولسه ماصرفش (مش في Ad Map): منتجه من اللينك، فبيظهر في "عليها إعلانات"
  assert.equal(row('555'), undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(e.c.activeMap_())), { 'Sheglam Marshmallow Puff Lip Pen': 1, 'Eye Pen': 1, '❌ صرف مش مربوط بمنتج': 1 });
  const v = e.ss.getSheetByName('Today').getDataRange().getValues(), i = v.findIndex(r => r[0] === 'منتجات عليها إعلانات شغالة');
  assert.deepEqual(v.slice(i + 1, i + 3).map(r => r[0]), ['Sheglam Marshmallow Puff Lip Pen', 'Eye Pen']);
  // المرة الجاية مابيقراش لينك 555 تاني
  const before = e.requests.filter(u => /\/555\?/.test(u)).length;
  e.c.refreshActive_();
  assert.equal(e.requests.filter(u => /\/555\?/.test(u)).length, before);
});

test('الأوردرات من أبليكيشن شوبيفاي: القطع اللي اتشالت من الأوردر بعد ما اتعمل مش متباعة، والأوردر اللي اتعدل بعد ما اتقرا بيتصلح', () => {
  const probe = env(), today = probe.c.todayKey_();
  const order = (id, hm, lines, x) => Object.assign({ id: 'gid://shopify/Order/' + id, createdAt: today + 'T' + hm + ':00Z', sourceName: 'web',
    cancelledAt: null, originalTotalPriceSet: { shopMoney: { amount: '500.0' } }, customAttributes: [], lineItems: { nodes: lines },
    customerJourneySummary: { lastVisit: null } }, x || {});
  const created = [
    order(1, '06:00', [{ title: 'Lip Oil', quantity: 2, currentQuantity: 1 }, { title: 'Blush', quantity: 1, currentQuantity: 0 }]),
    order(2, '06:30', [{ title: 'Lip Oil', quantity: 1, currentQuantity: 0 }], { cancelledAt: today + 'T07:00:00Z' }),
    // أوردر 3 من امبارح: برا الـ 6 ساعات اللي القراية بترجعهم، فالتعديل مابيوصلش غير من حالة الأوردر
    order(3, '07:00', [{ title: 'Lip Oil', quantity: 1, currentQuantity: 1 }], { createdAt: probe.c.shiftKey_(today, -1) + 'T07:00:00Z' })];
  const e = env({ orderHead: FLOW_HEAD.slice(0, 17), orders: [] });
  const opt = { created, editedNow: { 'gid://shopify/Order/3': [{ title: 'Lip Oil', quantity: 1, currentQuantity: 0 }, { title: 'Mask', quantity: 2, currentQuantity: 2 }] } };
  fakeShopify(e, [shopOrder(3, today, { edited: true, updatedAt: today + 'T09:00:00Z' })], opt);
  Object.assign(e.user, { SHOPIFY_TOKEN: 'TOKEN1', SHOPIFY_TOKEN_EXP: String(Date.now() + 3600000) });
  e.c.setupAll();
  e.c.liveTick(); e.c.liveTick();
  const tab = e.ss.getSheetByName('Shopify Orders').getDataRange().getValues().slice(1), items = id => tab.find(r => r[0] === 'gid://shopify/Order/' + id)[3];
  assert.equal(items(1), 'Lip Oil x1', 'قطعة Lip Oil و Blush اتشالوا');
  assert.equal(items(2), 'Lip Oil x1', 'الملغي بيفضل باللي اتطلب');
  assert.equal(items(3), 'Mask x2', 'اتعدل بعد ما اتقرا');
  const raw = e.ss.getSheetByName('Orders Raw').getDataRange().getValues().slice(1);
  assert.equal(raw.find(r => r[0] === 'gid://shopify/Order/3')[6], 'Mask x2');
  assert.match(e.ss.getSheetByName('Health').getDataRange().getValues().map(r => r.join(' ')).join('\n'), /الأوردرات اللي اتعدلت في شوبيفاي .*✓ 1 أوردر اتعدل في شوبيفاي/);
  assert.equal(e.doc.SHOP_ORDERS_EDITED, undefined, 'الطابور فضي');
});

test('Campaign Map: كامبينات الشهر ده بس، اللي مش معروفة الأول، والاختيار بيتطبق على كل إعلانات الكامبين والأيام اللي فاتت، والتحذير في Today', () => {
  const probe = env(), today = probe.c.todayKey_(), m0 = today.slice(0, 8) + '01', lastMonth = probe.c.shiftKey_(m0, -3), B = '(blank)';
  const ad = (date, adId, spend, campId, camp) => Object.assign(adRow(date, adId, spend), { campaign_id: campId, campaign_name: camp });
  const flow = (id, products, adId) => ['gid://shopify/Order/' + id, ' #' + id, ' N', B, 400, ' ' + today + 'T10:00:00+03:00',
    B, B, B, B, B, 'facebook', 'x', adId, 'Facebook', products, '4655075'];
  const ads = { [A1]: [ad(today, '111', 300, 'C1', 'Lip Oil | Testing'), ad(today, '1200000000222', 200, 'C2', 'Home Wear | Testing'),
    ad(today, '1200000000333', 150, 'C3', 'Flash Sale'), ad(m0, '334', 50, 'C3', 'Flash Sale'), ad(lastMonth, '999', 70, 'C9', 'Old Campaign')] };
  const creatives = { 111: 'https://chance-cosmetics.com/products/lip-oil', 1200000000222: 'https://chance-cosmetics.com/collections/cloths?sort_by=manual',
    1200000000333: 'https://chance-cosmetics.com/ar/pages/flash-sale', 334: 'https://chance-cosmetics.com/ar/pages/flash-sale', 999: 'https://chance-cosmetics.com/pages/old' };
  const e = env({ orderHead: FLOW_HEAD, ads, creatives, activeAds: { [A1]: ['111', '1200000000222', '1200000000333'] },
    stock: [['P1', 'V1', 'Lip Oil', 'Default Title', 'LO', 'lip-oil', 40, 300]],
    orders: [flow(1, 'Lip Oil x1', '1200000000222'), flow(2, 'Lip Oil x1', '1200000000333')] });
  e.c.setupAll();
  const st = e.ss.getSheetByName('Settings'), keys = st.getDataRange().getValues().map(r => r[0]);
  st.getRange(keys.indexOf('business.store_domains') + 1, 2).setValue('chance-cosmetics.com');
  e.c.liveTick(); e.c.liveTick();
  const sh = e.ss.getSheetByName('Campaign Map'), tab = () => sh.getDataRange().getValues();
  const camps = () => tab().slice(4).filter(r => r[9]).map(r => r.slice(0, 10));
  const pages = () => tab().slice(4).filter(r => r[11]).map(r => r.slice(11, 16));
  let v = tab();
  assert.deepEqual(v[3].slice(0, 10), ['الحالة', 'الكامبين', 'الحساب', 'إعلانات شغالة دلوقتي', 'صرف النهارده', 'صرف الشهر', 'رايحة فين', 'الشيت شايفها تبع', 'تبع إيه؟ (اختار أو اكتب)', 'Campaign ID']);
  // الشهر ده بس (Old Campaign مش موجودة)، والمش معروفة الأول
  assert.deepEqual(camps().map(r => [r[0], r[1], r[5], r[6], r[7]]), [
    ['❌', 'Flash Sale', 200, 'pages/flash-sale', '❌ مش معروف'],
    ['⚠️', 'Home Wear | Testing', 200, 'collections/cloths', 'صفحة فيها كذا منتج'],
    ['✅', 'Lip Oil | Testing', 300, 'products/lip-oil', 'Lip Oil']]);
  assert.match(v[2][0], /❌ 1 .*⚠️ 1 .*✅ 1/);
  // جدول الصفحات: الصفحات اللي مش صفحة منتج بس
  assert.deepEqual(pages(), [['collections/cloths', '', '', 1, 200], ['pages/flash-sale', '', '', 1, 200]]);
  assert.equal(e.ss.getSheetByName('Ad Map').hidden, true, 'تاب الإعلانات اتخبت');
  // التحذير في Today تحت جدول الستوك
  let col = () => e.ss.getSheetByName('Today').getDataRange().getValues().map(r => String(r[0]));
  const w = col().findIndex(x => /^⚠️ 2 كامبين شغالة مش مربوطة بمنتج، صرفت النهارده 350 جنيه/.test(x));
  assert.ok(w > col().findIndex(x => /^الستوك يكفي كام يوم/.test(x)), 'تحت جدول الستوك');
  assert.deepEqual(col().slice(w + 1, w + 3), ['❌ مش معروفة: Flash Sale  ←  pages/flash-sale', '⚠️ محتاجة اسم: Home Wear | Testing  ←  collections/cloths']);
  // كامبين: Home Wear اسم من عندك. صفحة: لينك الفلاش سيل كامل (بالدومين والـ /ar و ?) في أول سطر فاضي، واسمها Flash Sale.
  const at = name => 5 + camps().findIndex(r => r[1] === name);
  sh.getRange(at('Home Wear | Testing'), 9).setValue('Home Wear');
  e.c.onEdit({ range: { getSheet: () => sh, getA1Notation: () => 'I' + at('Home Wear | Testing') } });
  assert.equal(sh.getRange(at('Home Wear | Testing'), 1).getValue(), '⏳');
  const empty = 5 + pages().length;
  sh.getRange(empty, 12).setValue('https://www.chance-cosmetics.com/ar/pages/flash-sale?utm_source=x');
  sh.getRange(empty, 13).setValue('Flash Sale');
  e.c.liveTick();
  assert.ok(camps().every(r => r[0] === '✅'), JSON.stringify(camps()));
  assert.equal(camps().find(r => r[1] === 'Home Wear | Testing')[8], 'Home Wear', 'اللي اتكتب فضل زي ما هو');
  assert.equal(camps().find(r => r[1] === 'Flash Sale')[7], 'Flash Sale');
  assert.deepEqual(pages().map(r => [r[0], r[1]]), [['collections/cloths', ''], ['pages/flash-sale', 'Flash Sale']]);
  const map = () => e.ss.getSheetByName('Ad Map').getDataRange().getValues(), row = id => map().find(r => r[0] === id);
  assert.deepEqual([row('1200000000333')[9], row('334')[11], row('1200000000222')[11]], ['PAGE', 'Flash Sale', 'Home Wear']);
  // الصرف والأوردرات على الاسم، والأيام اللي فاتت كمان
  const daily = (n, d, i) => e.c.dailyRows_().filter(r => r[0] === d && r[1] === 'META' && r[2] === n).reduce((a, r) => a + r[i], 0);
  assert.deepEqual([daily('Flash Sale', today, 3), daily('Home Wear', today, 3), daily('Lip Oil', today, 3)], [150, 200, 300]);
  if (m0 !== today) assert.equal(daily('Flash Sale', m0, 3), 50);
  assert.deepEqual([daily('Home Wear', today, 8), daily('Flash Sale', today, 8)], [1, 1]);
  assert.ok(col().some(x => /^✅ كل الكامبينات الشغالة مربوطة بمنتجاتها/.test(x)));
  // الأسامي دي مش منتجات: مش في جدول الستوك
  const i = col().indexOf('منتجات عليها إعلانات شغالة');
  assert.deepEqual(col().slice(i + 1, i + 3), ['Lip Oil', 'منتجات من غير إعلانات — بتتباع 1 قطعة في اليوم أو أكتر وفاضلها 10 أيام أو أقل']);
  // كامبين جديدة رايحة لنفس الصفحة: بتتربط لوحدها
  ads[A1].push(ad(today, '1200000000444', 80, 'C4', 'Flash Sale 2'));
  creatives['1200000000444'] = 'https://chance-cosmetics.com/pages/flash-sale';
  e.c.liveTick();
  assert.deepEqual(camps().find(r => r[1] === 'Flash Sale 2').slice(0, 2), ['✅', 'Flash Sale 2']);
  assert.equal(row('1200000000444')[11], 'Flash Sale');
  // تفريغ الخانة بيشيل الاختيار
  sh.getRange(at('Home Wear | Testing'), 9).setValue('');
  e.c.liveTick();
  assert.equal(row('1200000000222')[11], 'صفحة كل المنتجات (MULTI)');
});

test('Campaign Map: لينك الصفحة بأي شكل هو نفس الصفحة، والكوليكشنز من شوبيفاي في الاختيارات', () => {
  const e = env();
  e.c.setupAll();
  const st = e.ss.getSheetByName('Settings'), keys = st.getDataRange().getValues().map(r => r[0]);
  st.getRange(keys.indexOf('business.store_domains') + 1, 2).setValue('chancestoreegy.com');
  e.c.resetCaches_();
  const k = e.c.pageKeyOf_;
  assert.deepEqual([k('https://chancestoreegy.com/ar/pages/flash-sale?x=1'), k('chancestoreegy.com/pages/flash-sale/'), k('/pages/flash-sale'),
    k('pages/flash-sale'), k('http://chancestoreegy.com/'), k('https://www.chancestoreegy.com/ar'), k('https://fb.com/messenger_doc/'),
    k('https://chancestoreegy.com/collections/Makeup?filter=1')],
    ['pages/flash-sale', 'pages/flash-sale', 'pages/flash-sale', 'pages/flash-sale', 'الصفحة الرئيسية', 'الصفحة الرئيسية', '', 'collections/makeup']);
  fakeShopify(e, [], { collections: [{ handle: 'cloths', title: 'Home Wear' }, { handle: 'makeup', title: 'Makeup' }] });
  Object.assign(e.user, { SHOPIFY_TOKEN: 'TOKEN1', SHOPIFY_TOKEN_EXP: String(Date.now() + 3600000) });
  assert.equal(e.c.syncShopifyCollections_(), 2);
  assert.deepEqual(JSON.parse(JSON.stringify(e.c.shopCollections_())), { cloths: 'Home Wear', makeup: 'Makeup' });
  assert.equal(e.c.syncShopifyCollections_(), 0, 'مرة في اليوم');
});

test('Closing: GROSS SALES (المنتجات قبل الخصم ومن غير الشحن، وقت الأوردر) و NET SALES (بعد الخصم ومن غير الشحن) قبل REVENUE', () => {
  const probe = env(), today = probe.c.todayKey_();
  const order = (id, hm, total) => ({ id: 'gid://shopify/Order/' + id, createdAt: today + 'T' + hm + ':00Z', sourceName: 'web', cancelledAt: null,
    originalTotalPriceSet: { shopMoney: { amount: String(total) } }, customAttributes: [], lineItems: { nodes: [{ title: 'Lip Oil', quantity: 2, currentQuantity: 2 }] },
    customerJourneySummary: { lastVisit: null } });
  const e = env({ orderHead: FLOW_HEAD.slice(0, 17), orders: [] });
  // أوردر 1: قطعتين 349 بخصم 49 وشحن 85 = 734. أوردر 2: قطعة 449 من غير خصم وشحن 85 = 534.
  const opt = { created: [order(1, '06:00', 734), order(2, '07:00', 534)],
    gross: { 'gid://shopify/Order/1': [['PRODUCT', 324.5, 24.5], ['PRODUCT', 324.5, 24.5], ['SHIPPING', 85, 0]],
      'gid://shopify/Order/2': [['PRODUCT', 449, 0], ['SHIPPING', 85, 0]] } };
  fakeShopify(e, [], opt);
  Object.assign(e.user, { SHOPIFY_TOKEN: 'TOKEN1', SHOPIFY_TOKEN_EXP: String(Date.now() + 3600000) });
  e.c.setupAll();
  e.c.liveTick(); e.c.liveTick();
  const tab = e.ss.getSheetByName('Shopify Orders').getDataRange().getValues();
  assert.equal(tab[0][17], 'Gross Sales');
  assert.deepEqual(tab.slice(1).map(r => r[17]), [698, 449]);
  assert.equal(tab[0][18], 'Net Sales');
  assert.deepEqual(tab.slice(1).map(r => r[18]), [649, 449]);
  const day = closingRow(e.ss.getSheetByName('Closing'), dayLabel(e.c, today));
  assert.deepEqual([day['GROSS SALES'], day['NET SALES'], day.ROAS, day.AOV], [1147, 1098, '', 634]);
  assert.match(e.ss.getSheetByName('Health').getDataRange().getValues().map(r => r.join(' ')).join('\n'), /الجروس سيلز من شوبيفاي .*✓ 2 أوردر/);
  // أوردر جديد لسه ماتقراش الجروس بتاعه: اليوم يبان فاضي مش ناقص
  opt.created.push(order(3, '08:00', 300));
  e.c.syncOrders_();
  e.c.resetCaches_();
  e.c.writeClosing_();
  const late = closingRow(e.ss.getSheetByName('Closing'), dayLabel(e.c, today));
  assert.deepEqual([late['GROSS SALES'], late['NET SALES']], ['', '']);
});

test('Meta Campaigns: الكامبين وتحتها الأد سيتس وتحتها الإعلانات، والقرار بـ Shopify ROAS لآخر 3 أيام قدام الـ 7 والـ 14، والمترك الواقع، واللي مفتوح بيفضل مفتوح', () => {
  const probe = env(), today = probe.c.todayKey_(), d = n => probe.c.shiftKey_(today, -n), B = '(blank)';
  const ad = (n, camp, set, adId, spend, o) => Object.assign(adRow(d(n), adId, spend), { campaign_id: camp, campaign_name: 'Camp ' + camp,
    adset_id: set, adset_name: 'Set ' + set, ad_name: 'Ad ' + adId, impressions: '1000', inline_link_clicks: String((o || {}).clicks || 20), v3: (o || {}).v3 || 300 });
  const flow = (id, n, adId) => ['gid://shopify/Order/' + id, ' #' + id, ' N', B, 400, ' ' + d(n) + 'T10:00:00+03:00',
    B, B, B, B, B, 'facebook', 'x', adId, 'Facebook', 'Lip Oil x1', '4655075'];
  const rows = [], orders = [];
  let oid = 1;
  for (let n = 1; n <= 17; n++) {
    rows.push(ad(n, 'C1', 'S1', '1200000000111', 100)); orders.push(flow(oid++, n, '1200000000111')); // كسبانة طول الوقت: رؤاس 4
    rows.push(ad(n, 'C4', 'S4', '1200000000411', 200)); // بتصرف من غير أوردرات
    if (n <= 3) rows.push(ad(n, 'C2', 'S2', '1200000000211', 100, { clicks: 8, v3: 100 })); // الـ CTR وقع في آخر 3 أيام
    if (n >= 4 && n <= 10) { rows.push(ad(n, 'C2', 'S2', '1200000000211', 100)); orders.push(flow(oid++, n, '1200000000211')); }
    if (n >= 11) { rows.push(ad(n, 'C3', 'S3', '1200000000311', 100)); orders.push(flow(oid++, n, '1200000000311')); } // كانت كويسة ووقفت
  }
  rows.push(ad(3, 'C3', 'S3', '1200000000311', 100));
  rows.push(ad(2, 'C2', 'S2', '1200000000212', 30, { clicks: 8, v3: 100 })); orders.push(flow(oid++, 2, '1200000000211'));
  const ads = { [A1]: rows, [A2]: [ad(1, 'C5', 'S5', '1200000000511', 50)] };
  const e = env({ orderHead: FLOW_HEAD.slice(0, 17), ads, orders,
    activeAds: { [A1]: ['1200000000111', '1200000000211', '1200000000212', '1200000000411'], [A2]: ['1200000000511'] }, budgets: { C1: { daily_budget: '50000' }, S4: { daily_budget: '20000' } },
    stock: [['P1', 'V1', 'Lip Oil', 'Default Title', 'LO', 'lip-oil', 40, 300]] });
  e.c.setupAll();
  const st = e.ss.getSheetByName('Settings'), keys = st.getDataRange().getValues().map(r => r[0]);
  st.getRange(keys.indexOf('be.roas') + 1, 2).setValue(2);
  e.c.liveTick(); e.c.liveTick();
  const sh = e.ss.getSheetByName('Meta Campaigns');
  assert.ok(sh, 'التاب اتعمل');
  assert.equal(e.ss.getSheetByName('Meta Campaigns Raw').hidden, true, 'تاب الأرقام الخام مخفي');
  const v = () => sh.getDataRange().getValues(), head = () => v().findIndex(r => r[0] === 'القرار');
  const body = () => v().slice(head() + 1).filter(r => r[20] !== '');
  assert.deepEqual(v()[head()].slice(0, 14), ['القرار', 'الكامبين / الأد سيت / الإعلان', 'الحساب', 'الحالة', 'الميزانية في اليوم', 'المنتج',
    'صرف 3 أيام', 'أوردرات 3 أيام', 'رؤاس 3 أيام', 'رؤاس الـ 7 أيام قبلها', 'رؤاس الـ 14 يوم قبلها', 'رؤاس التعادل', 'المترك الواقع', 'السبب وتعمل إيه']);
  // من بره الكامبينات بس، اللي محتاجة قرار الأول
  const camps = body().filter(r => /^Camp /.test(r[1]));
  assert.deepEqual(camps.map(r => [r[0], r[1], r[3], r[4], r[6], r[7], r[8], r[9], r[10], r[11], r[12]]), [
    ['🔴 وقّفها', 'Camp C4', 'شغالة', 200, 600, 0, 0, 0, 0, 2, 'صفر أوردرات'],
    ['🟠 وقعت', 'Camp C2', 'شغالة', '', 330, 1, 1.21, 4, 4, 2, 'CTR ↓60%'],
    ['🔁 رجّعها', 'Camp C3', 'واقفة', '', 100, 0, 0, '', 4, 2, 'صفر أوردرات'],
    ['🟢 زوّد الميزانية', 'Camp C1', 'شغالة', 500, 300, 3, 4, 4, 4, 2, ''],
    ['⏳ لسه بدري', 'Camp C5', 'شغالة', '', 50, 0, 0, '', '', 2, '']]);
  assert.match(camps[1][13], /كانت 4 ونزلت 1\.21 .*الكرياتيف تعب: الـ CTR نزل 60%، والـ Hook نزل 67% ← جرّب كرياتيف جديد/);
  assert.match(camps[2][13], /كانت كويسة \(رؤاس 4 والتعادل 2\) ← رجّعها/);
  assert.match(camps[0][13], /تحت التعادل .* ← وقّفها/);
  // تحت كل كامبين أد سيتسها وتحت كل أد سيت إعلاناته، مقفولين
  const rowOf = name => head() + 2 + body().findIndex(r => r[1].trim().replace(/^[↳•]\s*/, '') === name);
  const c2 = rowOf('Camp C2');
  assert.deepEqual(body().slice(body().findIndex(r => r[1] === 'Camp C2'), body().findIndex(r => r[1] === 'Camp C3')).map(r => r[1].trim()),
    ['Camp C2', '↳ Set S2', '• Ad 1200000000211', '• Ad 1200000000212']);
  assert.equal(body().find(r => r[1].trim() === '• Ad 1200000000211')[0], '🟠 وقع');
  assert.equal(sh.depth[c2] || 0, 0); assert.equal(sh.depth[c2 + 1], 1); assert.equal(sh.depth[c2 + 2], 2);
  assert.equal(sh.getRowGroup(c2 + 1, 1).isCollapsed(), true, 'مقفولة');
  assert.ok(String(sh.attr(c2, 16).note).indexOf('الـ 7 أيام قبلها: 2.00%') === 0, 'الـ CTR بتاع الـ 7 أيام في الملاحظة');
  // الكارت: مين موقّع الرؤس ومين تزوّد عليه
  const card = name => v().find(r => r[0] === name);
  assert.ok(card('كل الحسابات') && card('Chance 26'));
  assert.match(String(card('Chance 26')[12]), /^Camp C4 \(/);
  assert.match(String(card('Chance 26')[14]), /Camp C1 \(4\).*🔁 Camp C3/);
  // تاب Analysis & Actions بياخد قرارات الكامبينات: وقّف (عاجل)، ووقعت (مهم)، وزوّد ورجّع (فرصة)
  const an = e.ss.getSheetByName('Actions').getDataRange().getValues(), act = re => an.find(r => re.test(String(r[1])));
  assert.doesNotMatch(String(an[1][0]), /⚠️/, 'كل الأجزاء اتحسبت');
  // الجملة العربي في سطر، واسم الكامبين في سطر لوحده تحتها (مايتلخبطش مع العربي)
  assert.equal(act(/^وقّف الكامبين دي:\nCamp C4 \(Chance 26\)$/)[0], '🔴 عاجل');
  const drop = an.find(r => /^كامبين كانت كويسة ونزلت تحت التعادل \(CTR ↓60%\):\nCamp C2 \(Chance 26\)\n• /.test(String(r[2])));
  assert.equal(drop[0], '🟠 مهم', 'Camp C2 وقعت');
  assert.equal(act(/^زوّد ميزانيتها 20% وراقب يومين:\nCamp C1 /)[0], '🟢 فرصة');
  assert.equal(act(/^رجّعها بميزانية صغيرة وراقب يومين:\nCamp C3 /)[0], '🟢 فرصة');
  // تفتح الكامبين، وكامبين جديدة تيجي: اللي فتحته يفضل مفتوح
  sh.getRowGroup(c2 + 1, 1).expand();
  ads[A1].push(ad(1, 'C6', 'S6', '1200000000611', 40));
  e.doc.MCAMP_AT = '0';
  e.c.liveTick();
  const c2b = rowOf('Camp C2'), c1 = rowOf('Camp C1');
  assert.ok(body().some(r => r[1] === 'Camp C6'));
  assert.equal(sh.getRowGroup(c2b + 1, 1).isCollapsed(), false, 'C2 لسه مفتوحة');
  assert.equal(sh.getRowGroup(c1 + 1, 1).isCollapsed(), true, 'C1 مقفولة');
  assert.equal(sh.getRowGroup(c2b + 2, 2).isCollapsed(), true, 'إعلانات الأد سيت مقفولة');
  // الجروبات اتكومت فوق بعض (8 مستويات من أول الجدول لآخره، وجروب فوق الجدول كمان) والكامبينات زي ما هي: بتتعمل من الأول
  const h = head() + 1, n = body().length;
  for (let r = h - 1; r <= h + n + 30; r++) sh.depth[r] = 8;
  e.c.liveTick();
  const c2c = rowOf('Camp C2');
  assert.equal(sh.getRowGroupDepth(h - 1), 0, 'مفيش جروب فوق الجدول');
  assert.equal(sh.getRowGroupDepth(h), 0, 'الهيدر برا الجروبات');
  assert.equal(sh.getRowGroupDepth(c2c), 0); assert.equal(sh.getRowGroupDepth(c2c + 1), 1); assert.equal(sh.getRowGroupDepth(c2c + 2), 2);
  assert.equal(sh.getRowGroupDepth(h + body().length + 1), 0, 'مفيش جروب تحت الجدول');
  assert.equal(Math.max(...Array.from(sh.depth, x => x || 0)), 2, 'أقصى عمق 2');
  assert.equal(body().length, n, 'نفس الصفوف');
  assert.ok(body().filter(r => /^Camp /.test(r[1])).every(r => sh.getRowGroupDepth(rowOf(r[1])) === 0), 'كل الكامبينات باينة من بره');
  assert.equal(sh.getRowGroup(c2c + 1, 1).isCollapsed(), true, 'بعد التصليح كله مقفول');
  // وتحديث تاني من غير تغيير مابيلمسش الجروبات
  const before = sh.depth.slice();
  e.c.liveTick();
  assert.deepEqual(sh.depth, before);
});

/* TikTok API وهمي: report/integrated/get (صفحتين) و ad/get، وتبادل الكود بالتوكن. */
function fakeTikTok(e, opt) {
  const o = opt || {}, calls = [], old = e.c.UrlFetchApp.fetch;
  const ok = data => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify({ code: 0, message: 'OK', data }) });
  e.c.UrlFetchApp.fetch = (url, p) => {
    if (!/business-api\.tiktok\.com/.test(url)) return old(url, p);
    const q = {};
    (url.split('?')[1] || '').split('&').filter(Boolean).forEach(kv => { const [k, v] = kv.split('='); q[k] = decodeURIComponent(v); });
    calls.push({ url, q, p });
    if (/oauth2\/access_token/.test(url)) {
      const b = JSON.parse(p.payload);
      if (b.auth_code !== 'CODE1') return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ code: 40104, message: 'auth_code is invalid' }) };
      return ok({ access_token: 'TTTOKEN', advertiser_ids: ['7433928103325794321'], scope: [4, 6] });
    }
    assert.equal(p.headers['Access-Token'], 'TTTOKEN');
    if (o.fail) return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ code: 40001, message: 'No permission to operate advertiser' }) };
    if (/report\/integrated\/get/.test(url)) {
      const rows = (o.rows || []).filter(r => r.day >= q.start_date && r.day <= q.end_date).map(r => ({
        dimensions: { ad_id: r.ad, stat_time_day: r.day + ' 00:00:00' },
        metrics: { spend: String(r.spend), impressions: r.spend ? '500' : '0', clicks: r.spend ? '12' : '0', complete_payment: String(r.buys || 0),
          campaign_id: 'TC1', campaign_name: 'TT Camp', adgroup_id: 'TG1', adgroup_name: 'TT Group', ad_name: 'TT ' + r.ad } }));
      const page = Number(q.page), half = Math.ceil(rows.length / 2) || 1;
      return ok({ list: rows.slice((page - 1) * half, page * half), page_info: { page, total_page: rows.length > 1 ? 2 : 1 } });
    }
    if (/advertiser\/info\//.test(url)) {
      assert.deepEqual(JSON.parse(q.fields), ['advertiser_id', 'name', 'balance', 'currency', 'status']);
      return ok({ list: JSON.parse(q.advertiser_ids).map(id => ({ advertiser_id: id, name: 'TT', balance: o.balance === undefined ? 450.75 : o.balance,
        currency: 'EGP', status: o.status || 'STATUS_ENABLE' })) });
    }
    if (/\/ad\/get\//.test(url)) {
      const ids = JSON.parse(q.filtering).ad_ids;
      return ok({ list: ids.map(id => ({ ad_id: id, landing_page_url: (o.links || {})[id] || '' })), page_info: { page: 1, total_page: 1 } });
    }
    throw new Error('TikTok mock: ' + url);
  };
  return calls;
}

test('TikTok API: بعد الربط من المنيو، الصرف بيتقري من TikTok لكل إعلان يوم بيوم، والإعلان بيتربط بمنتجه من لينكه', () => {
  const e = scenario(), today = e.today, yest = e.yest;
  const calls = fakeTikTok(e, { rows: [{ day: today, ad: '9001', spend: 150.5, buys: 2 }, { day: yest, ad: '9001', spend: 80 }, { day: today, ad: '9002', spend: 0 }],
    links: { 9001: 'https://chance-cosmetics.com/products/blush?utm_source=tiktok' } });
  // الربط: App ID، Secret، واللينك اللي تيك توك بيفتحه بعد الموافقة
  const answers = ['7709597261936017429', 'SECRET1', 'https://www.profitlens.site/integrations/tiktok?auth_code=CODE1&code=CODE1&state=x'];
  const ui = { prompt: () => ({ getSelectedButton: () => 'OK', getResponseText: () => answers.shift() }), alert: m => e.alerts.push(m),
    ButtonSet: { OK_CANCEL: 'OK_CANCEL' }, Button: { OK: 'OK' } };
  e.c.SpreadsheetApp.getUi = () => ui;
  e.c.tiktokConnect();
  assert.equal(e.user.TIKTOK_TOKEN, 'TTTOKEN');
  assert.equal(e.user.TIKTOK_APP_SECRET, 'SECRET1');
  assert.match(e.alerts[e.alerts.length - 1], /اتربط TikTok ✅[\s\S]*كل حسابات TikTok/);
  const ex = calls.find(c => /oauth2/.test(c.url));
  assert.deepEqual(JSON.parse(ex.p.payload), { app_id: '7709597261936017429', secret: 'SECRET1', auth_code: 'CODE1' });

  e.c.syncAds_(yest, today);
  const tk = e.ss.getSheetByName('Ads Raw').getDataRange().getValues().filter(r => r[1] === 'TIKTOK');
  assert.deepEqual(tk.map(r => [r[0], r[2], r[4], r[5], r[6], r[7], r[8], r[9], r[10], r[13]]).sort(), [
    [today, '7433928103325794321', 'TC1', 'TT Camp', 'TG1', 'TT Group', '9001', 'TT 9001', 150.5, 2],
    [yest, '7433928103325794321', 'TC1', 'TT Camp', 'TG1', 'TT Group', '9001', 'TT 9001', 80, 0]].sort(), 'من غير صف الإعلان اللي مالوش أرقام');
  const rep = calls.find(c => /report\/integrated/.test(c.url));
  assert.equal(rep.q.data_level, 'AUCTION_AD');
  assert.deepEqual(JSON.parse(rep.q.dimensions), ['ad_id', 'stat_time_day']);
  const acc = e.ss.getSheetByName('Account Raw').getDataRange().getValues().filter(r => r[1] === 'TIKTOK');
  assert.deepEqual(acc.map(r => [r[0], r[4], r[5]]).sort(), [[today, 150.5, 2], [yest, 80, 0]].sort());
  const map = e.ss.getSheetByName('Ad Map').getDataRange().getValues().slice(1).find(r => r[0] === '9001');
  assert.match(String(map[7]), /products\/blush/);
  assert.equal(map[11], 'Blush');
  assert.match(e.c.getStatus_('TIKTOK'), /✓ 2 صف/);
});

test('TikTok API: لو الحساب مالوش إذن، صفوفه القديمة بتفضل، و Meta بتتحدث عادي، والسبب في Health', () => {
  const e = scenario(), today = e.today;
  e.user.TIKTOK_TOKEN = 'TTTOKEN';
  fakeTikTok(e, { rows: [{ day: today, ad: '9001', spend: 100 }] });
  e.c.syncAds_(today, today);
  fakeTikTok(e, { fail: true });
  e.c.syncAds_(today, today);
  const raw = e.ss.getSheetByName('Ads Raw').getDataRange().getValues();
  assert.ok(raw.some(r => r[1] === 'TIKTOK' && r[8] === '9001' && r[10] === 100), 'الصف القديم فضل');
  assert.ok(raw.some(r => r[1] === 'META' && r[0] === today), 'Meta اتحدثت');
  assert.match(e.c.getStatus_('TIKTOK'), /✗ .*No permission[\s\S]*Advertiser authorization URL/);
});

test('رصيد TikTok في Today تحت Meta: الرصيد المتاح ويكفي كام يوم بصرف آخر 3 أيام، والحالة، والغلط لو الإذن اتشال', () => {
  const e = scenario(), d = n => e.c.shiftKey_(e.today, -n);
  e.user.TIKTOK_TOKEN = 'TTTOKEN';
  const opt = { rows: [{ day: d(1), ad: '9001', spend: 100 }, { day: d(2), ad: '9001', spend: 200 }, { day: d(3), ad: '9001', spend: 150 }, { day: d(4), ad: '9001', spend: 900 }] };
  const calls = fakeTikTok(e, opt);
  e.c.syncAds_(d(4), e.today);
  // Meta الوهمية بترجع كل الأيام مهما كانت الفترة، فـ liveTick كان هيمسح أيام TikTok اللي فاتت: الرصيد والعرض بس.
  const tick = () => { e.c.refreshBalances_(); e.c.withLock_(() => e.c.rebuildViews_({ full: true })); };
  tick();
  const row = () => {
    const v = e.ss.getSheetByName('Today').getDataRange().getValues(), i = v.findIndex(r => /^رصيد الأكاونتات من Meta و TikTok/.test(String(r[0])));
    return v.find((r, k) => k > i && r[0] === 'TikTok').slice(0, 6);
  };
  assert.deepEqual(row(), ['TikTok', 450.75, 3, '', '', 'شغال'], '450.75 ÷ 150 في اليوم (آخر 3 أيام كاملة)');
  assert.ok(calls.some(c => /advertiser\/info\//.test(c.url) && JSON.parse(c.q.advertiser_ids)[0] === '7433928103325794321'));
  opt.balance = 90; opt.status = 'STATUS_LIMIT';
  tick();
  assert.deepEqual(row(), ['TikTok', 90, 0.6, '', '', '⚠️ مقيّد']);
  opt.fail = true;
  tick();
  assert.match(String(row()[1]), /^✗ TikTok code 40001: No permission/);
});

test('Duplication: أوردرات المنصة قدام أوردرات شوبيفاي لكل كامبين وأد سيت وإعلان، و DIRECT متوزعة تقديري، والكامبينات الواقفة تحت + لوحدها', () => {
  const probe = env(), today = probe.c.todayKey_(), yest = probe.c.shiftKey_(today, -1), B = '(blank)';
  const flow = (id, day, products, x) => {
    const r = ['gid://shopify/Order/' + id, ' #' + id, ' N', B, 500, ' ' + day + 'T10:00:00+03:00', B, B, B, B, B, B, B, B, B, products, '4655075', B, B];
    Object.keys(x || {}).forEach(k => { r[k] = x[k]; });
    return r;
  };
  const fb = (camp, content) => ({ 6: 'facebook', 8: camp, 9: content || B });
  const c2 = row => Object.assign(row, { campaign_id: 'C2', campaign_name: 'Camp 2', adset_id: 'S2', adset_name: 'Set 2' });
  const e = env({ orderHead: FLOW_HEAD, activeAds: { [A1]: ['111'] },
    ads: { [A1]: [adRow(today, '111', 600), adRow(today, '222', 400), c2(adRow(today, '333', 100)), adRow(yest, '111', 300)] },
    creatives: { 111: 'https://chance-cosmetics.com/products/lip-oil', 222: 'https://chance-cosmetics.com/products/lip-oil', 333: 'https://chance-cosmetics.com/products/blush' },
    stock: [['P1', 'V1', 'Lip Oil', 'Default Title', 'LO', 'lip-oil', 40, 300], ['P2', 'V2', 'Blush', 'Default Title', 'BL', 'blush', 40, 250]],
    orders: [flow(1, today, 'Lip Oil x1', fb('Camp', '111')), flow(2, today, 'Lip Oil x1', fb('Camp', '222')), flow(3, today, 'Blush x1', fb('Camp 2')),
      flow(4, today, 'Lip Oil x1', { 14: 'Direct(Chancestoreegy)' }), flow(5, today, 'Mask x1', { 14: 'Direct(Chancestoreegy)' }),
      flow(6, today, 'Blush x1', { 16: 'shopify_draft_order' }), flow(7, today, 'Blush x1', { 6: 'instagram', 9: 'link_in_bio' }),
      flow(8, yest, 'Lip Oil x1', fb('Camp', '111')), flow(9, today, 'Blush x1', { 6: 'tiktok', 8: 'TT Camp' })] });
  e.user.TIKTOK_TOKEN = 'TTTOKEN';
  fakeTikTok(e, { rows: [{ day: today, ad: '9001', spend: 150, buys: 3 }] });
  e.c.setupAll();
  e.c.liveTick(); e.c.liveTick();
  const sh = e.ss.getSheetByName('Duplication'), v = () => sh.getDataRange().getValues();
  assert.ok(sh, 'التاب اتعمل');
  assert.deepEqual(v()[1].slice(0, 3), ['الفترة', 'النهارده', today]);
  const at = (from, label) => v().findIndex((r, i) => i >= from && r[0] === label);
  const mi = v().findIndex(r => /^Meta \| /.test(String(r[0]))), ti = v().findIndex(r => /^TikTok \| /.test(String(r[0])));
  // الملخص: البيكسل 6 (3 إعلانات × 2)، وشوبيفاي 5 = 3 بالـ UTM + 2 DIRECT (من غير المانيول والبايو وأوردر إمبارح) زي META TOTAL في Today
  assert.deepEqual(v()[mi + 2].slice(0, 6), [6, 5, 3, 2, 1, 0.2]);
  assert.equal(e.ss.getSheetByName('Today').getDataRange().getValues().find(r => r[0] === 'META TOTAL')[3], 5, 'نفس رقم Today');
  assert.equal(sh.attr(mi + 3, 6).bg, '#f4cccc', 'المنصة بتعد أكتر بـ 20%');
  const an = e.ss.getSheetByName('Actions').getDataRange().getValues();
  assert.doesNotMatch(String(an[1][0]), /⚠️/, 'كل الأجزاء في Actions اتحسبت');
  // الكامبين الشغالة: DIRECT بتاع Lip Oil على 111 و 222 بالصرف (0.6 و 0.4)، و Mask مفيش إعلان عليه فعلى كل اللي صرفوا النهارده (1000 من 1100)
  const c1 = at(mi, 'Camp');
  assert.deepEqual(v()[c1].slice(0, 10), ['Camp', 'Chance 26', '🟢 شغال', 1000, 4, 2, 1.9, 3.9, 0.1, 0.023]);
  assert.deepEqual(v()[c1 + 1].slice(0, 3), ['↳ Set', '', '🟢 شغال']);
  assert.deepEqual([v()[c1 + 2].slice(0, 8), v()[c1 + 3].slice(0, 8)], [
    ['        • Ad 111', '', '🟢 شغال', 600, 2, 1, 1.1, 2.1], ['        • Ad 222', '', '⏸ واقف', 400, 2, 1, 0.8, 1.8]]);
  // الواقفة تحت + لوحدها، والأوردر اللي الـ UTM فيه اسم الكامبين بس اتحسب عليها
  const stop = at(mi, '⏸ كامبينات واقفة دلوقتي (1)');
  assert.deepEqual(v()[stop + 1].slice(0, 9), ['Camp 2', 'Chance 26', '⏸ واقف', 100, 2, 1, 0.1, 1.1, 0.9]);
  assert.deepEqual(v()[at(mi, 'TOTAL')].slice(3, 10), [1100, 6, 3, 2, 5, 1, 0.2]);
  // + جنب الكامبين بيفتح الأد سيتس، و + جنب الأد سيت بيفتح الإعلانات؛ كله مقفول في الأول
  const R = i => i + 1;
  assert.deepEqual([sh.getRowGroupDepth(R(c1)), sh.getRowGroupDepth(R(c1 + 1)), sh.getRowGroupDepth(R(c1 + 2)), sh.getRowGroupDepth(R(stop)),
    sh.getRowGroupDepth(R(stop + 1)), sh.getRowGroupDepth(R(stop + 3))], [0, 1, 2, 0, 1, 3]);
  assert.equal(sh.getRowGroup(R(c1 + 1), 1).isCollapsed(), true);
  // TikTok: 3 من المنصة، وأوردر واحد من شوبيفاي اتربط بالكامبين من اسمها في الـ UTM
  assert.deepEqual(v()[ti + 2].slice(0, 6), [3, 1, 1, '', 2, 2]);
  assert.deepEqual(v()[at(ti, 'TT Camp')].slice(0, 10), ['TT Camp', 'TikTok', '🟢 شغال', 150, 3, 1, '', 1, 2, 2]);
  // اللي اتفتح بيفضل مفتوح لما الصفوف تتغير
  sh.getRowGroup(R(c1 + 1), 1).expand();
  e.c.withLock_(() => e.c.writeDupTab_());
  assert.equal(sh.getRowGroup(R(c1 + 1), 1).isCollapsed(), false);
  // الفترة من القايمة في B2
  sh.getRange('B2').setValue('آخر 7 أيام');
  e.c.writeDupTab_();
  assert.deepEqual(v()[mi + 2].slice(0, 3), [8, 6, 4], 'إمبارح داخل: إعلان 111 (2) وأوردر 8');
});

test('Actions و Analysis: المهم بس في Actions بالأولوية، والمهام وقبل وبعد، والجداول الصغيرة فوق في Analysis والتفاصيل تحت + (والستوك + على كل منتج)', () => {
  const probe = env(), today = probe.c.todayKey_(), d = n => probe.c.shiftKey_(today, -n);
  const variant = (id, handle, product, title, qty) => ({ id: 'gid://shopify/ProductVariant/' + id, title, inventoryQuantity: qty, product: { handle, title: product } });
  const variants = [variant(11, 'lip-oil', 'Lip Oil', 'Red', 2), variant(12, 'lip-oil', 'Lip Oil', 'Pink', 40), variant(13, 'lip-oil', 'Lip Oil', 'Nude', 0),
    variant(21, 'blush', 'Blush', 'Default Title', 50)];
  const line = (title, qty, v) => ({ title, quantity: qty, currentQuantity: qty, variant: { id: 'gid://shopify/ProductVariant/' + v } });
  const order = (id, day, lines, x) => Object.assign({ id: 'gid://shopify/Order/' + id, createdAt: day + 'T10:00:00Z', sourceName: 'web',
    originalTotalPriceSet: { shopMoney: { amount: '500.0' } }, customAttributes: [], lineItems: { nodes: lines }, customerJourneySummary: { lastVisit: null } }, x || {});
  const created = [];
  let id = 1;
  for (let n = 1; n <= 12; n++) created.push(order(id++, d(n), [line('Lip Oil', 1, 11), line('Lip Oil', 1, 13)]), order(id++, d(n), [line('Blush', 1, 21)]));
  const e = env({ orderHead: FLOW_HEAD.slice(0, 17), orders: [], activeAds: { [A1]: ['111'] },
    ads: { [A1]: [adRow(today, '111', 600), adRow(d(1), '111', 900), adRow(d(2), '111', 900), adRow(d(3), '111', 900), adRow(d(5), '111', 300)] },
    creatives: { 111: 'https://chance-cosmetics.com/products/lip-oil' } });
  fakeShopify(e, [], { created, variants });
  e.c.orderStatus_ = x => (Number(String(x).split('/').pop()) % 4 === 0 ? { code: 'C', revenue: null } : { code: 'D', revenue: null });
  Object.assign(e.user, { SHOPIFY_TOKEN: 'TOKEN1', SHOPIFY_TOKEN_EXP: String(Date.now() + 3600000) });
  e.c.setupAll(); e.c.liveTick(); e.c.liveTick();
  e.doc.ACTIVE_PRODUCTS = JSON.stringify({ 'Lip Oil': 1 }); // عليه إعلان شغال
  e.c.refreshFunnel_(true); // الفانل مابيتقريش من 3 لـ 9 الصبح لوحده
  e.c.withLock_(() => e.c.writeAnalysisTab_());
  const sh = e.ss.getSheetByName('Actions'), an = e.ss.getSheetByName('Analysis');
  assert.ok(sh && an, 'تابين: Actions و Analysis');
  assert.doesNotMatch(String(sh.getRange('A2').getValue()), /⚠️/, 'كل الأجزاء اتحسبت');
  const v = () => sh.getDataRange().getValues(), find = (col, re) => v().findIndex(r => re.test(String(r[col])));
  // Actions: الأكشنز (A)، ومهامي (G)، وقبل وبعد (L) جنب بعض، والمهم بس
  assert.deepEqual([v()[3][0], v()[3][6], v()[3][11]].map(x => x.split(' — ')[0].split(' (')[0]), ['الأكشنز', 'مهامي', 'قبل وبعد']);
  // الستوك: Lip Oil عليه إعلان، Nude خلص و Red يكفي يومين، وكانوا بيتباعوا 12 قطعة في الشهر: عاجل
  // الكلام الكتير نقط تحت بعض
  // الجملة العربي، وتحتها اسم المنتج في سطر لوحده، وتحته النقط
  assert.deepEqual(v()[5].slice(0, 2), ['🔴 عاجل', 'اطلب ستوك بالترتيب ده:\nLip Oil\n• Nude: 30 قطعة\n• Red: 28 قطعة\nولحد ما يوصل، شيل الألوان الخلصانة من الإعلانات']);
  assert.equal(v()[5][2], '1 لون خلص و 1 لون قرّب يخلص، وعليه 1 إعلان شغال:\nLip Oil\n• Nude: نفد، اتباع 12 في 30 يوم\n• Red: يكفي 2 يوم، اتباع 12 في 30 يوم');
  assert.equal(v()[5][4], false, 'خانة ✅');
  // الفانل (CPM غلي) راقب بس: مش في الأكشنز، في تاب Analysis
  assert.equal(v()[6][0], '🟡 1 حاجة تتراقب بس (من غير أكشن دلوقتي): في تاب Analysis');
  assert.equal(find(1, /CPM/), -1);
  // Analysis: الجداول الصغيرة فوق جنب بعض
  const a = () => an.getDataRange().getValues(), at = (col, re) => a().findIndex(r => re.test(String(r[col])));
  assert.deepEqual([a()[3][0], a()[3][6], a()[3][12]].map(x => x.split(' (')[0]), ['النهارده بسرعة', 'الحسابات — Shopify ROAS', 'المشاكل المهمة']);
  assert.deepEqual(a()[4].slice(6, 11), ['الحساب', 'النهارده', 'آخر 3 أيام', 'آخر 7 أيام', 'الشهر كله']);
  assert.deepEqual(a()[5].slice(12, 15), ['🔴 عاجل', '1 لون خلص و 1 لون قرّب يخلص، وعليه 1 إعلان شغال:\nLip Oil', 'الستوك']);
  assert.equal(a()[5][6], 'البيزنس كله (زي Closing)');
  const cn = at(0, /^الإلغاء \(7 أيام\)$/);
  assert.deepEqual(a()[cn].slice(0, 4).map(x => (typeof x === 'number' ? Math.round(x * 1000) / 1000 : x)), ['الإلغاء (7 أيام)', 0.214, 0.3, '-8.6 نقطة']);
  // التفاصيل تحت، كل جزء تحت + مقفول، والستوك + جنب كل منتج على ألوانه
  // العنوان قصير وكبير على صفين، والـ + على التاني، وتحته سطر بيقول فيه إيه
  const st = at(0, /^📦 الستوك \(1 منتج\)$/) + 1, lip = at(0, /^Lip Oil \(2 لون\)$/), R = i => i + 1;
  assert.match(a()[st + 1][0], /^المنتجات اللي عليها إعلانات أو بتتباع كتير/);
  assert.deepEqual(a()[lip + 1].slice(0, 5), ['   ↳ Nude', 0, 7, 12, 'نفد']);
  assert.equal(a()[lip + 1][7], 30, 'اطلب كام');
  assert.deepEqual([an.getRowGroupDepth(R(st - 1)), an.getRowGroupDepth(R(st)), an.getRowGroupDepth(R(st + 1)), an.getRowGroupDepth(R(lip)), an.getRowGroupDepth(R(lip + 1))], [0, 0, 1, 1, 2]);
  assert.equal(an.getRowGroup(R(st + 1), 1).isCollapsed(), true, 'مقفول');
  assert.equal(an.getRowGroupDepth(R(at(0, /^النهارده بسرعة/) + 2)), 0, 'الجداول الصغيرة بره الجروبات');
  // اللي اتفتح بيفضل مفتوح مع التحديث
  an.getRowGroup(R(st + 1), 1).expand();
  e.c.withLock_(() => e.c.writeAnalysisTab_());
  assert.equal(an.getRowGroup(R(at(0, /^📦 الستوك/) + 2), 1).isCollapsed(), false);
  const roas = at(0, /^الشهر لحد النهارده$/);
  assert.equal(a()[roas - 1][2], 'Chance 26');
  assert.equal(a()[roas + 1][0], e.c.anaDay_(today) + ' (لحد دلوقتي)');

  // مهمة مكتوبة بإيدي بأولوية عاجل: بتدخل في الأكشنز، وتاريخ إضافتها بيتكتب لوحده
  sh.getRange('G6').setValue('اعمل كرييتيف جديد لـ Lip Oil');
  sh.getRange('H6').setValue('🔴 عاجل');
  sh.getRange('L6:O6').setValues([['وقفت الكامبين الخسرانة', d(3), 'الصرف في اليوم', '']]);
  e.c.withLock_(() => e.c.writeAnalysisTab_());
  const task = find(1, /^اعمل كرييتيف جديد لـ Lip Oil$/);
  assert.deepEqual(v()[task].slice(0, 4), ['🔴 عاجل', 'اعمل كرييتيف جديد لـ Lip Oil', 'مكتوبة بإيدك يوم ' + today, 'مهمة يدوية']);
  assert.deepEqual(v()[5].slice(6, 10), ['اعمل كرييتيف جديد لـ Lip Oil', '🔴 عاجل', 'لسه', today]);
  // الصرف في اليوم: قبل = الـ 7 أيام اللي قبلها (300 ÷ 7)، بعد = من يومها لحد إمبارح (2700 ÷ 3)
  assert.deepEqual(v()[5].slice(11, 18).map(x => (typeof x === 'number' ? Math.round(x * 100) / 100 : x)),
    ['وقفت الكامبين الخسرانة', d(3), 'الصرف في اليوم', 'البيزنس كله', 42.86, 900, '+2000%']);
  // ✅ على أكشن الستوك: بيتنقل لقبل وبعد بتاريخ النهارده، ويستخبى من الأكشنز
  const stock = find(1, /^اطلب ستوك/);
  sh.getRange(stock + 1, 5).setValue(true);
  e.c.onEdit({ range: { getSheet: () => sh, getA1Notation: () => 'E' + (stock + 1) } });
  assert.deepEqual(v()[6].slice(11, 15), ['اطلب ستوك بالترتيب ده:\nLip Oil', today, 'الأوردرات في اليوم', 'Lip Oil']);
  e.c.withLock_(() => e.c.writeAnalysisTab_());
  assert.equal(find(1, /^اطلب ستوك/), -1, 'استخبى من الأكشنز');
  assert.match(String(v()[6][11]), /^اطلب ستوك/, 'وفضل في قبل وبعد');
  assert.equal(v()[6][16], 'من بكره');
  // ✅ على المهمة: حالتها بتبقى خلصت وبتخرج من الأكشنز
  const t2 = find(1, /^اعمل كرييتيف جديد/);
  sh.getRange(t2 + 1, 5).setValue(true);
  e.c.onEdit({ range: { getSheet: () => sh, getA1Notation: () => 'E' + (t2 + 1) } });
  e.c.withLock_(() => e.c.writeAnalysisTab_());
  assert.equal(v()[5][8], 'خلصت');
  assert.equal(find(1, /^اعمل كرييتيف جديد/), -1);
  assert.equal(v().filter(r => r[11] === 'اعمل كرييتيف جديد لـ Lip Oil').length, 1, 'المهمة اتنقلت لقبل وبعد');
  // التاب القديم (Analysis & Actions) بيتغير اسمه لـ Actions واللي مكتوب فيه بيفضل
  sh.setName('Analysis & Actions');
  e.c.withLock_(() => e.c.writeAnalysisTab_());
  assert.equal(e.ss.getSheetByName('Analysis & Actions'), null);
  assert.equal(e.ss.getSheetByName('Actions').getRange('G6').getValue(), 'اعمل كرييتيف جديد لـ Lip Oil');
});

test('Analysis: كل 3 ساعات لوحدها قدام نفس الوقت في الأسبوع اللي فات، والكامبين اللي صرفت فيها من غير أوردرات، ولقطات الكامبينات بتتاخد مع لقطة Today', () => {
  const probe = env(), today = probe.c.todayKey_(), d = n => probe.c.shiftKey_(today, -n);
  const attrs = m => Object.keys(m).map(k => ({ key: k, value: m[k] }));
  const fb = { customAttributes: attrs({ utm_source: 'facebook', utm_campaign: 'Camp', utm_content: '111', 'Order Referrer': 'Facebook' }) };
  const order = (id, day, hm) => Object.assign({ id: 'gid://shopify/Order/' + id, createdAt: day + 'T' + hm + ':00Z', sourceName: 'web',
    originalTotalPriceSet: { shopMoney: { amount: '500.0' } }, lineItems: { nodes: [{ title: 'Lip Oil', quantity: 1 }] }, customerJourneySummary: { lastVisit: null } }, fb);
  // كل يوم من الأسبوع اللي فات: 4 أوردرات بين 9 و 12 الضهر (8 الصبح UTC = 10 بتوقيت القاهرة) على صرف 1000 = رؤاس 2. النهارده: أوردر واحد.
  const created = [order(1, today, '08:00')];
  let id = 2;
  for (let n = 2; n <= 8; n++) for (let k = 0; k < 4; k++) created.push(order(id++, d(n), '08:0' + k));
  const e = env({ orderHead: FLOW_HEAD.slice(0, 17), orders: [], ads: { [A1]: [adRow(today, '111', 1000)] } });
  fakeShopify(e, [], { created });
  Object.assign(e.user, { SHOPIFY_TOKEN: 'TOKEN1', SHOPIFY_TOKEN_EXP: String(Date.now() + 3600000) });
  e.c.setupAll(); e.c.liveTick(); e.c.liveTick();
  const intra = e.ss.getSheetByName('Intraday') || e.ss.insertSheet('Intraday');
  const rows = [['Date', 'Slot', 'Platform', 'Spend', 'Orders', 'CPP', 'Revenue']];
  for (let n = 0; n <= 8; n++) rows.push([d(n), '9:00', 'META', 0, 0, '', 0], [d(n), '12:00', 'META', 1000, 0, '', 0]);
  intra.getRange(1, 1, rows.length, 7).setValues(rows);
  const snaps = e.ss.getSheetByName('Intraday Ads') || e.ss.insertSheet('Intraday Ads');
  snaps.getRange(1, 1, Math.max(snaps.getLastRow(), 3), 7).clearContent();
  snaps.getRange(1, 1, 3, 7).setValues([['Date', 'Slot', 'Platform', 'Account ID', 'Campaign ID', 'Campaign', 'Spend'],
    [today, '9:00', 'META', A1, 'C1', 'Camp', 100], [today, '12:00', 'META', A1, 'C1', 'Camp', 900]]);
  e.c.resetCaches_();
  e.c.withLock_(() => e.c.writeAnalysisTab_());
  const v = e.ss.getSheetByName('Analysis').getDataRange().getValues();
  // الجدول الصغير فوق: الوقت، والصرف، والرؤاس قدام المعتاد
  assert.deepEqual(v.find(r => r[6] === '9 الصبح → 12 الضهر').slice(6, 10), ['9 الصبح → 12 الضهر', 1000, 0.5, 2]);
  // التفاصيل تحت: الأوردرات والكامبينات اللي صرفت في الوقت ده
  const at = v.findIndex(r => r[0] === '9 الصبح → 12 الضهر');
  assert.deepEqual([v[at].slice(0, 5), v[at][6]], [['9 الصبح → 12 الضهر', 1000, 1, 0.5, 2], '• Camp\n     صرف 800 وجاب 1 أوردر']);
  assert.deepEqual(v.find(r => r[13] === 'النهارده من 9 الصبح لـ 12 الضهر: الرؤاس 0.5 والمعتاد 2').slice(12, 14), ['🟠 مهم', 'النهارده من 9 الصبح لـ 12 الضهر: الرؤاس 0.5 والمعتاد 2'],
    'في المشاكل المهمة');
  const act = e.ss.getSheetByName('Actions').getDataRange().getValues().find(r => /^راجع الكامبين دي في الوقت ده/.test(String(r[1])));
  assert.equal(act[0], '🟠 مهم');
  assert.match(act[1], /:\nCamp$/, 'اسم الكامبين في سطر لوحده');
  assert.match(act[2], /\n• صرف 1,000 وجاب 1 أوردر\nأكتر كامبينات صرفت:\n• Camp\n     صرف 800 وجاب 1 أوردر/);
  // لقطة الكامبينات بتتاخد مع لقطة Today: صرف كل كامبين لحد الساعة دي
  e.c.takeIntraAds_();
  const got = snaps.getDataRange().getValues().slice(1).filter(r => r[0] === today && r[1] !== '9:00' && r[1] !== '12:00');
  assert.equal(got.length, 1);
  assert.deepEqual(got[0].slice(2, 7), ['META', A1, 'C1', 'Camp', 1000]);
});

test('Actions: الحاجات اللي من نوع واحد وأولوية واحدة بتبقى أكشن واحد، والراقب ماينضمش للمهم', () => {
  const e = env(), f = (id, pri, impact, name) => ({ id: id, kind: 'bad', pri: pri, area: 'الكامبينات', title: 'كامبين ' + name + ': تحت التعادل', detail: 'صرف ' + impact,
    action: 'وقّف كامبين ' + name, impact: impact, metric: 'Shopify ROAS', scope: name });
  const out = e.c.anaMerge_([f('camp-stop|1', 1, 500, 'A'), f('camp-stop|2', 1, 900, 'B'), f('camp-stop|3', 1, 100, 'C'), f('win|x', 3, 50, 'W'), f('win|y', 2, 70, 'V')]);
  assert.equal(out.length, 3);
  assert.deepEqual([out[0].pri, out[0].title, out[0].action, out[0].impact], [1, '3 كامبينات شغالة تحت التعادل', 'وقّف:\n• B\n• A\n• C', 1500]);
  assert.equal(out[0].detail, '• B\n• A\n• C', 'كل اسم في سطر لوحده');
  assert.equal(JSON.stringify(out.slice(1).map(x => [x.id, x.pri])), JSON.stringify([['win|y', 2], ['win|x', 3]]), 'كل أولوية لوحدها');
});

test('الأرقام موحدة: رؤاس البيزنس في Daily Account Funnel = Closing (صرف Meta + TikTok)، و AOV في GRAND TOTAL = كارت AOV', () => {
  const probe = env(), today = probe.c.todayKey_();
  const e = env({ ads: { [A1]: [adRow(today, '111', 300)], [A2]: [adRow(today, '222', 100)] },
    orders: [['#1', today + 'T10:00:00+03:00', 'Lip Oil x1', 500, '', 'Cairo', 'Camp', 'Ad 111', 'fb'],
      ['#2', today + 'T11:00:00+03:00', 'Lip Oil x1', 250, '', 'Cairo', 'Camp', 'Ad 111', 'fb']] });
  e.user.TIKTOK_TOKEN = 'TTTOKEN';
  fakeTikTok(e, { rows: [{ day: today, ad: '9001', spend: 150, buys: 3 }] });
  e.c.setupAll();
  e.c.liveTick(); e.c.liveTick();
  e.c.refreshFunnelNow();
  const f = e.ss.getSheetByName('Daily Account Funnel').getDataRange().getValues(), k = f.findIndex(r => r[0] === 'كل الحسابات (البيزنس كله)');
  const month = f[k + 1], head = f[2], col = n => month[head.indexOf(n)];
  // 750 مبيعات ÷ (300 + 100 Meta + 150 TikTok)
  assert.equal(Math.round(col('SHOPIFY ROAS') * 1000) / 1000, Math.round(750 / 550 * 1000) / 1000);
  assert.equal(col('CPP'), 275);
  const closing = closingRow(e.ss.getSheetByName('Closing'), 'MONTH TOTAL');
  assert.equal(Math.round(closing.ROAS * 100) / 100, Math.round(col('SHOPIFY ROAS') * 100) / 100, 'نفس رقم Closing');
  // AOV في GRAND TOTAL هو نفس كارت AOV (رقم شوبيفاي نفسه)
  e.doc.SHOPTAB_CARDS = JSON.stringify({ day: today, at: '12:00', cards: [{ key: 'aov', title: 'AOV', values: [333.333, 300, 280], pct: false, up: true }] });
  e.c.withLock_(() => e.c.writeToday_());
  assert.equal(todayRow(e, 'GRAND TOTAL')[6], 333.33);
});
