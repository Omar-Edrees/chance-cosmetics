/*
 * ملف متجمّع تلقائيًا من ads-sheet/src — ماتعدلش فيه.
 * عدّل في الملفات الأصلية وشغّل: npm run build
 */

/* ======== 00_config.gs ======== */
/*
 * Generic Ads Sheet — engine v1.
 * Everything business-specific lives in the Settings / Accounts / Products / Benchmarks tabs.
 * The code never hard-codes a business. PROFILE (00_profile.gs) only seeds empty tabs once.
 * Ad accounts and stores are read-only from here: no writes to Meta, TikTok or order sources.
 */
const APP = {
  VERSION: '1.14.0',
  T: {
    SETTINGS: 'Settings', ACCOUNTS: 'Accounts', PRODUCTS: 'Products', ADMAP: 'Ad Map',
    ADS: 'Ads Raw', ACC_RAW: 'Account Raw', ORDERS: 'Orders Raw', DAILY: 'Daily Log',
    TODAY: 'Today', PERF: 'Product Performance', CLOSING: 'Closing', INTRA: 'Intraday',
    TESTS: 'Tests', BENCH: 'Benchmarks', HEALTH: 'Health', CATALOG: 'Catalog Raw'
  },
  UNMAPPED: '❌ صرف مش مربوط بمنتج',
  MULTI: 'صفحة كل المنتجات (MULTI)',
  UNKNOWN_PRODUCT: 'منتج مش معروف',
  UNKNOWN_PLATFORM: 'UNKNOWN',
  DIRECT: 'DIRECT', MANUAL: 'MANUAL',
  CATALOG: 'CATALOG (كل إعلانات الكتالوج)',
  META_NO_AD: 'أوردرات Meta من إعلان مش في الشيت',
  META_OUT: 'META OUT' // Meta orders from an ad account that isn't in the sheet: orders only, outside META TOTAL
};

/* Chance tabs (90_hooks.gs plugs them into the engine through EXT). */
const X = { PRODUCTS: 'المنتجات', ACC_BE: 'تعادل الحسابات', CATALOG: 'الكتالوج' };

/* [key, default, Arabic description]. Empty default = must be filled or stays "ناقص". */
const SETTINGS_SPEC = [
  ['business.name', '', 'اسم البزنس'],
  ['business.currency', 'EGP', 'العملة'],
  ['business.timezone', 'Africa/Cairo', 'التوقيت'],
  ['business.store_domains', '', 'دومينات المتجر، مفصولة بفاصلة'],
  ['business.product_url_regex', '/products?/([^/]+)', 'شكل لينك صفحة المنتج (الجزء بين القوسين = اسم الصفحة)'],
  ['business.multi_url_regex', '^/?$|^/(ar|en)/?$|/collections?(/|$)|/categor|/shop/?$|/all-products', 'لينكات صفحات فيها كل المنتجات أو الرئيسية'],
  ['orders.method', 'linked_sheet', 'linked_sheet | shopify_flow_sheet | csv_tab | pixel | none (pixel = مشتريات البيكسل لحد ما الأوردرات الحقيقية تتربط)'],
  ['orders.sheet_url', '', 'لينك شيت الأوردرات'],
  ['orders.sheet_tab', 'Sheet1', 'اسم التاب'],
  ['orders.date_format', 'auto', 'auto | mdy | dmy | iso'],
  ['orders.product_first_line', 'TRUE', 'المنتج الأساسي = أول سطر في اسم المنتج'],
  ['orders.col.order_id', 'Order ID', 'عمود رقم الأوردر'],
  ['orders.col.date', 'Date', 'عمود التاريخ'],
  ['orders.col.phone', 'Phone', 'عمود التليفون'],
  ['orders.col.alt_phone', 'Alt Phone', 'عمود التليفون التاني'],
  ['orders.col.product', 'Product Name', 'عمود اسم المنتج'],
  ['orders.col.total', 'Order Total Cost', 'عمود قيمة الأوردر'],
  ['orders.col.city', 'City', 'عمود المحافظة'],
  ['orders.col.utm_source', 'UTM Source', 'عمود UTM Source'],
  ['orders.col.utm_campaign', 'UTM Campaign', 'عمود UTM Campaign'],
  ['orders.col.utm_content', 'UTM Content', 'عمود UTM Content (اختياري)'],
  ['orders.col.referrer', '', 'عمود الريفرر (اختياري)'],
  ['orders.col.metadata', 'Order Metadata', 'عمود فيه referrer:... (اختياري)'],
  ['orders.col.status', '', 'عمود حالة الأوردر (اختياري)'],
  ['orders.cancelled_words', 'cancelled,ملغي', 'كلمات حالة الإلغاء في المصدر'],
  ['attribution.tiktok_markers', 'tiktok,tik tok,tk,tt', 'كلمات في الـUTM تعني TikTok'],
  ['attribution.meta_markers', 'fb,facebook,ig,instagram,meta', 'كلمات في الـUTM تعني Meta'],
  ['attribution.other_utm_platform', 'META', 'UTM موجود بس مش معروف: META | UNKNOWN'],
  ['meta.api_version', 'v26.0', 'نسخة Graph API'],
  ['meta.purchase_actions', 'offsite_conversion.fb_pixel_purchase,purchase,omni_purchase', 'أول نوع موجود بس بيتحسب'],
  ['tiktok.method', 'none', 'none | connector_tab | csv_tab'],
  ['tiktok.tab', 'TikTok Data', 'التاب اللي أداة الربط بتكتب فيه'],
  ['tiktok.col.date', 'Date', ''], ['tiktok.col.account_id', 'Advertiser ID', ''],
  ['tiktok.col.campaign', 'Campaign name', ''], ['tiktok.col.adgroup', 'Ad group name', ''],
  ['tiktok.col.ad_id', 'Ad ID', ''], ['tiktok.col.ad', 'Ad name', ''],
  ['tiktok.col.spend', 'Cost', ''], ['tiktok.col.impressions', 'Impressions', ''],
  ['tiktok.col.clicks', 'Clicks (destination)', ''], ['tiktok.col.purchases', 'Complete payment', ''],
  ['tiktok.col.landing', 'Landing page URL', ''],
  ['costs.ad_tax_pct', '0.14', 'نسبة بتتزود على صرف الإعلانات (0.14 = 14%)'],
  ['costs.shipping', '', 'تكلفة الشحن على الأوردر'],
  ['costs.other', '', 'تكاليف تانية على الأوردر (تغليف، تحصيل)'],
  ['rates.confirm', '', 'نسبة التأكيد الافتراضية (0.7 = 70%)'],
  ['rates.delivery', '', 'نسبة التسليم الافتراضية'],
  ['sync.refresh_days', '3', 'المزامنة اليومية بتعيد سحب آخر كام يوم'],
  ['sync.backfill_from', 'month_start', 'أول سحب يبدأ من: month_start (أول الشهر) أو تاريخ yyyy-MM-dd. فاضي = آخر sync.backfill_days يوم'],
  ['sync.backfill_days', '30', 'أول سحب كام يوم (لو sync.backfill_from فاضي)'],
  ['sync.live_minutes', '15', 'التحديث خلال اليوم كل كام دقيقة (1,5,10,15,30)'],
  ['intraday.hours', '12,15,18,21,0', 'مواعيد لقطات اليوم'],
  ['admap.multi_mode', 'separate', 'separate | split_by_orders'],
  ['rules.kill_spend_x_be', '2', 'إيقاف لو صرف كذا ضعف نقطة التعادل من غير أوردر'],
  ['rules.over_x_be', '1.2', 'فوق نقطة التعادل بالنسبة دي = Over'],
  ['rules.winner_min_orders', '5', 'أقل عدد أوردرات عشان Winner'],
  ['rules.frequency_warn', '2.5', 'تحذير تشبع'],
  ['bench.min_volume', '100', 'بعد كام أوردر المقارنة تبقى بأرقامك بدل السوق'],
  // Chance: stock, products auto-add, break-even ROAS.
  ['stock.sheet_url', '', 'لينك شيت الستوك (فاضي = نفس شيت الأوردرات)'],
  ['stock.sheet_tab', 'stock', 'التاب اللي فلو الستوك بيكتب فيه'],
  ['stock.init_tab', 'stock_init', 'تاب فيه تصدير المنتجات من شوبيفاي لأول مرة (اختياري)'],
  ['stock.low_days', '7', 'الستوك يبقى "قليل" لو هيخلص في أقل من كام يوم'],
  ['products.auto_add', 'TRUE', 'أي منتج جديد في شيت الستوك يتضاف لتاب Products لوحده'],
  ['be.roas', '', 'نقطة التعادل ROAS (على الصرف من غير الضريبة). لو فاضية بتتحسب من التكاليف'],
  ['costs.cogs_pct', '', 'تكلفة البضاعة كنسبة من سعر البيع (0.35 = 35%)']
];

let CFG_ = null;
function cfg_() {
  if (CFG_) return CFG_;
  const m = {};
  SETTINGS_SPEC.forEach(s => { m[s[0]] = s[1]; });
  const sh = SpreadsheetApp.getActive().getSheetByName(APP.T.SETTINGS);
  if (sh && sh.getLastRow() >= 2) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(r => {
      const k = String(r[0] || '').trim();
      if (k && k.charAt(0) !== '#' && r[1] !== '' && r[1] !== null) m[k] = r[1];
    });
  }
  CFG_ = m;
  return m;
}
function cfgStr_(k) { return String(cfg_()[k] === undefined ? '' : cfg_()[k]).trim(); }
function cfgNum_(k) { const s = cfgStr_(k); if (s === '') return null; const n = Number(s); return isFinite(n) ? n : null; }
function cfgList_(k) { return cfgStr_(k).split(',').map(x => x.trim()).filter(Boolean); }
function cfgBool_(k) { return /^(true|yes|1|نعم|اه)$/i.test(cfgStr_(k)); }
function tz_() { return cfgStr_('business.timezone') || 'Africa/Cairo'; }

/* Accounts tab: Platform | Account ID | Name | Purpose | Include | Brand/Page */
function accounts_(platform) {
  const sh = SpreadsheetApp.getActive().getSheetByName(APP.T.ACCOUNTS);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 6).getValues()
    .filter(r => String(r[1]).trim() && r[4] !== false && String(r[4]).toUpperCase() !== 'FALSE')
    .map(r => ({ platform: String(r[0]).trim().toUpperCase(), id: String(r[1]).replace(/^act_/i, '').trim(),
      name: String(r[2] || '').trim(), purpose: String(r[3] || ''), brand: String(r[5] || '') }))
    .filter(a => !platform || a.platform === platform);
}

/* Products tab: Product | SKU | Landing slugs | Name codes | Order aliases | Price | Cost | Shipping | Other cost | Confirm rate | Delivery rate | Active */
const PRODUCT_HEADERS = ['Product', 'SKU', 'Landing slugs', 'Name codes', 'Order aliases', 'Price', 'Cost',
  'Shipping', 'Other cost', 'Confirm rate', 'Delivery rate', 'Active'];
let PRODUCTS_ = null;
function products_() {
  if (PRODUCTS_) return PRODUCTS_;
  const sh = SpreadsheetApp.getActive().getSheetByName(APP.T.PRODUCTS), out = [];
  if (sh && sh.getLastRow() >= 2) {
    sh.getRange(2, 1, sh.getLastRow() - 1, PRODUCT_HEADERS.length).getValues().forEach(r => {
      const name = String(r[0] || '').trim();
      if (!name || String(r[11]).toUpperCase() === 'FALSE') return;
      const list = v => String(v || '').split(',').map(x => x.trim()).filter(Boolean);
      const n = v => (v === '' || v === null || !isFinite(Number(v)) ? null : Number(v));
      out.push({ name: name, sku: String(r[1] || ''), slugs: list(r[2]).map(s => s.toLowerCase()),
        codes: list(r[3]).map(norm_), aliases: list(r[4]).map(norm_), price: n(r[5]), cost: n(r[6]),
        shipping: n(r[7]), other: n(r[8]), confirm: n(r[9]), delivery: n(r[10]) });
    });
  }
  PRODUCTS_ = out;
  return out;
}

/*
 * Break-even cost per PLACED order (COD):
 * confirm × (delivery × (price − cost) − shipping − other).
 * Shipping/other are paid on every shipped (confirmed) order, product cost only on delivered ones.
 * Missing input → null, shown as "ناقص".
 */
function breakEven_(p) {
  if (!p) return null;
  const pick = (v, k) => (v !== null && v !== undefined ? v : cfgNum_(k));
  const ship = pick(p.shipping, 'costs.shipping'), other = pick(p.other, 'costs.other') || 0;
  const confirm = pick(p.confirm, 'rates.confirm'), delivery = pick(p.delivery, 'rates.delivery');
  if (p.price === null || p.cost === null || ship === null || confirm === null || delivery === null) return null;
  return confirm * (delivery * (p.price - p.cost) - ship - other);
}
function missingFor_(p) {
  const miss = [];
  if (!p) return ['المنتج'];
  if (p.price === null) miss.push('السعر');
  if (p.cost === null) miss.push('التكلفة');
  if (p.shipping === null && cfgNum_('costs.shipping') === null) miss.push('الشحن');
  if (p.confirm === null && cfgNum_('rates.confirm') === null) miss.push('نسبة التأكيد');
  if (p.delivery === null && cfgNum_('rates.delivery') === null) miss.push('نسبة التسليم');
  return miss;
}

/* ======== 00_profile.gs ======== */
/* Chance Cosmetics profile (preliminary). */
/*
 * Seeds empty tabs once at setup. After that the Settings / Accounts / Products / Benchmarks tabs
 * are the source of truth. Never put tokens here.
 * OPEN (to fill later): store domain, account purposes, costs, confirm/delivery rates, benchmarks.
 */
const PROFILE = {
  settings: {
    'business.name': 'Chance Cosmetics',
    'business.currency': 'EGP',
    'business.timezone': 'Africa/Cairo',
    'business.store_domains': '',
    'orders.method': 'shopify_flow_sheet',
    'orders.sheet_url': 'https://docs.google.com/spreadsheets/d/15rkiOnnON-nobcGxq1ct5tHnocrvS79f454xkQQg6Ys/edit',
    'orders.sheet_tab': 'orders',
    'orders.col.order_id': 'Order ID',
    'orders.col.date': 'Created At',
    'orders.col.product': 'Products',
    'orders.col.total': 'Total Price',
    'orders.col.phone': 'Phone',
    'orders.col.city': 'City',
    'orders.col.utm_source': 'UTM Source',
    'orders.col.utm_campaign': 'UTM Campaign',
    'orders.col.utm_content': 'UTM Content',
    'orders.col.metadata': '',
    'meta.api_version': 'v26.0',
    'tiktok.method': 'csv_tab',
    'tiktok.tab': 'TikTok Data'
  },
  // [Platform, Account ID, Name, Purpose, Include, Brand / Page]
  accounts: [
    ['META', '1354948596094660', 'Meta 4660', '', true, ''],
    ['META', '1443770363884823', 'Meta 4823', '', true, ''],
    ['META', '1980884485605243', 'Meta 5243', '', true, ''],
    ['TIKTOK', '7433928103325794321', 'TikTok', '', true, '']
  ],
  // Products are added automatically from the stock sheet (Shopify title + handle + price).
  products: [],
  benchmarks: []
};

/* ======== 01_core.gs ======== */
/* Locks, timing, dates, normalization, sheet writing. */

let LOCK_DEPTH_ = 0;
/* Apps Script stops a run at 6 minutes. Long loops check this and leave the rest for the next run. */
let DEADLINE_ = 0;
function timeLeft_() { return !DEADLINE_ || Date.now() < DEADLINE_; }
function withLock_(fn, waitMs) {
  if (LOCK_DEPTH_) return fn();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(waitMs || 60000)) throw new Error('في تحديث تاني شغال دلوقتي. استنى دقيقة وجرّب تاني.');
  LOCK_DEPTH_++;
  try { return fn(); } finally { LOCK_DEPTH_--; lock.releaseLock(); }
}
/* For triggers: skip quietly if busy; the next run catches up. */
function tryLock_(fn) {
  if (LOCK_DEPTH_) return { skipped: false, value: fn() };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return { skipped: true };
  LOCK_DEPTH_++;
  try { return { skipped: false, value: fn() }; } finally { LOCK_DEPTH_--; lock.releaseLock(); }
}
function time_(label, fn) {
  const t = Date.now();
  try { return fn(); } finally { console.log('⏱ ' + label + ': ' + ((Date.now() - t) / 1000).toFixed(1) + 's'); }
}

/* Dates are stored as text yyyy-MM-dd so time zones never shift them. */
const DAYKEY_CACHE_ = new Map();
function dayKey_(d) {
  if (!(d instanceof Date) || isNaN(d)) return '';
  const tz = tz_(), bucket = tz + '|' + Math.floor(d.getTime() / 900000);
  let v = DAYKEY_CACHE_.get(bucket);
  if (v === undefined) { v = Utilities.formatDate(d, tz, 'yyyy-MM-dd'); DAYKEY_CACHE_.set(bucket, v); }
  return v;
}
function todayKey_() { return dayKey_(new Date()); }
function shiftKey_(key, days) {
  const p = key.split('-').map(Number);
  return new Date(Date.UTC(p[0], p[1] - 1, p[2] + days)).toISOString().slice(0, 10);
}
function asKey_(v) {
  if (v instanceof Date) return dayKey_(v);
  const s = String(v || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}
function nowText_() { return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm'); }

/* Arabic-aware normalization for matching names, products and UTMs. */
function digits_(v) {
  return String(v === null || v === undefined ? '' : v)
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x6F0));
}
function norm_(v) {
  return digits_(v).toLowerCase()
    .replace(/[​-‏‪-‮⁦-⁩﻿]/g, '')
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .replace(/[|\\\/_\-–—:;,+()[\]{}"'.!?]+/g, ' ').replace(/\s+/g, ' ').trim();
}
/* Whole-token containment: "ab" matches "x ab y", not "xaby". */
function hasToken_(text, token) {
  if (!token) return false;
  return (' ' + text + ' ').indexOf(' ' + token + ' ') >= 0;
}
function phone10_(v) {
  const d = typeof v === 'number' ? String(Math.round(v)) : digits_(v).replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : '';
}
function num_(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }
function round2_(v) { return Math.round(v * 100) / 100; }
function sha_(text) {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(text), Utilities.Charset.UTF_8));
}

function ss_() { return SpreadsheetApp.getActive(); }
function tab_(name) {
  const sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('التاب مش موجود: ' + name + ' — شغّل الإعداد من المنيو.');
  return sh;
}
function ensureTab_(name, headers) {
  let sh = ss_().getSheetByName(name);
  if (!sh) sh = ss_().insertSheet(name);
  if (headers && headers.length) {
    if (sh.getMaxColumns() < headers.length) sh.insertColumnsAfter(sh.getMaxColumns(), headers.length - sh.getMaxColumns());
    const cur = sh.getRange(1, 1, 1, headers.length).getValues()[0];
    if (cur.every(v => v === '' || v === null)) {
      sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold')
        .setBackground('#1f2937').setFontColor('#ffffff').setWrap(true);
      sh.setFrozenRows(1);
    }
  }
  return sh;
}
/* Read all data rows (row 2+) of the first `cols` columns. */
function readRows_(sh, cols) {
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, cols).getValues().filter(r => r.some(v => v !== '' && v !== null));
}
/* Replace all data rows. textCols: 1-based columns forced to text before writing (IDs, dates). */
function writeRows_(sh, rows, cols, textCols) {
  const last = sh.getLastRow();
  if (rows.length + 1 > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), rows.length + 1 - sh.getMaxRows());
  (textCols || []).forEach(c => sh.getRange(2, c, Math.max(rows.length, 1), 1).setNumberFormat('@'));
  if (rows.length) sh.getRange(2, 1, rows.length, cols).setValues(rows);
  if (last > rows.length + 1) sh.getRange(rows.length + 2, 1, last - rows.length - 1, cols).clearContent();
}
function setStatus_(key, msg) { PropertiesService.getDocumentProperties().setProperty('STATUS_' + key, nowText_() + '  ' + msg); }
function getStatus_(key) { return PropertiesService.getDocumentProperties().getProperty('STATUS_' + key) || 'لسه ما اشتغلش'; }
function alert_(msg) { try { SpreadsheetApp.getUi().alert(String(msg)); } catch (e) { console.log(String(msg)); } }
function errText_(e) {
  const t = String(e && e.message ? e.message : e), tok = PropertiesService.getUserProperties().getProperty('META_TOKEN');
  return tok ? t.split(tok).join('[مخفي]') : t;
}
function resetCaches_() { CFG_ = null; PRODUCTS_ = null; KNOWN_PRODUCTS_ = null; }

/* ======== 02_meta.gs ======== */
/* Meta Graph API, read-only. Token is pasted once from the menu and kept in User Properties. */

function metaToken_() {
  const t = PropertiesService.getUserProperties().getProperty('META_TOKEN');
  if (!t) throw new Error('توكن ميتا مش موجود. من المنيو: الإعدادات ← ربط توكن Meta.');
  return t;
}
function metaUrl_(path, params) {
  const q = Object.keys(params).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(String(params[k]))).join('&');
  return 'https://graph.facebook.com/' + (cfgStr_('meta.api_version') || 'v26.0') + '/' + path + (q ? '?' + q : '');
}
function metaFetch_(url) {
  const token = metaToken_();
  for (let a = 0; a < 3; a++) {
    const r = UrlFetchApp.fetch(url, { muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + token } });
    const status = r.getResponseCode();
    let p;
    try { p = JSON.parse(r.getContentText()); } catch (e) { throw new Error('Meta رجعت رد مش مفهوم (HTTP ' + status + ').'); }
    if (status >= 200 && status < 300 && !p.error) return p;
    const e = p.error || {}, retry = status === 429 || status >= 500 || [1, 2, 4, 17, 32, 613].includes(Number(e.code));
    if (retry && a < 2) { Utilities.sleep((a + 1) * 1500); continue; }
    throw new Error('Meta' + (e.code ? ' code ' + e.code : '') + ': ' + (e.error_user_msg || e.message || 'طلب فشل'));
  }
}
function metaGet_(path, params) { return metaFetch_(metaUrl_(path, params || {})); }
/* All pages. Guard against endless paging. */
function metaAll_(path, params) {
  const out = [];
  let url = metaUrl_(path, Object.assign({ limit: 500 }, params || {})), guard = 0;
  while (url && guard++ < 200) {
    const p = metaFetch_(url);
    (p.data || []).forEach(x => out.push(x));
    url = p.paging && p.paging.next ? p.paging.next : null;
  }
  if (guard >= 200) throw new Error('Meta: صفحات كتير جدًا، التحديث وقف عشان مايبقاش ناقص.');
  return out;
}
/* Several GETs in parallel; failed ones are retried one by one. Returns [{payload}|{error}]. */
function metaMany_(paths) {
  const token = metaToken_();
  let res = [];
  try {
    res = UrlFetchApp.fetchAll(paths.map(p => ({ url: metaUrl_(p.path, p.params), muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + token } })));
  } catch (e) { res = []; }
  return paths.map((p, i) => {
    try {
      const r = res[i];
      if (r && r.getResponseCode() < 300) { const j = JSON.parse(r.getContentText()); if (!j.error) return { payload: j }; }
    } catch (ignored) {}
    try { return { payload: metaGet_(p.path, p.params) }; } catch (e) { return { error: errText_(e) }; }
  });
}
/* Exactly one purchase type per row: the first listed type that exists. Never adds types together. */
function metaPick_(list) {
  if (!list) return 0;
  for (const t of cfgList_('meta.purchase_actions')) {
    const a = list.find(x => x.action_type === t);
    if (a) return num_(a.value);
  }
  return 0;
}

function metaConnect() {
  const ui = SpreadsheetApp.getUi();
  const a = ui.prompt('ربط Meta', 'الصق System User token (صلاحية ads_read بس). ماتبعتوش في أي شات.', ui.ButtonSet.OK_CANCEL);
  if (a.getSelectedButton() !== ui.Button.OK) return;
  const t = a.getResponseText().trim().replace(/^Bearer\s+/i, '');
  if (!t || /\s/.test(t)) { ui.alert('التوكن مش صحيح.'); return; }
  PropertiesService.getUserProperties().setProperty('META_TOKEN', t);
  try {
    const accs = accounts_('META');
    accs.forEach(acc => metaGet_('act_' + acc.id, { fields: 'id,name,currency,timezone_name' }));
    ui.alert('اتربط ✅ واتأكدت من ' + accs.length + ' حساب.');
  } catch (e) { ui.alert('التوكن اتحفظ، بس فيه حساب مش متاح:\n' + errText_(e)); }
}

/*
 * Accounts tab Name ← the account's name in Meta, once a day. A name typed by hand stays: only an empty cell,
 * the setup placeholder ("Meta 4660") or the name written here last time is replaced.
 */
function refreshAccountNames_() {
  const props = PropertiesService.getDocumentProperties(), today = todayKey_();
  if (props.getProperty('ACC_NAMES_DAY') === today) return;
  const sh = ss_().getSheetByName(APP.T.ACCOUNTS);
  if (!sh || sh.getLastRow() < 2) return;
  let auto = {}, failed = false;
  try { auto = JSON.parse(props.getProperty('ACC_NAMES_AUTO') || '{}'); } catch (e) { auto = {}; }
  sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues().forEach((r, i) => {
    const id = String(r[1]).replace(/^act_/i, '').trim(), cur = String(r[2] || '').trim();
    if (String(r[0]).trim().toUpperCase() !== 'META' || !id) return;
    if (cur && !/^Meta \d{4}$/.test(cur) && cur !== auto[id]) return;
    try {
      const name = String(metaGet_('act_' + id, { fields: 'name' }).name || '').trim();
      if (!name) return;
      if (name !== cur) sh.getRange(i + 2, 3).setValue(name);
      auto[id] = name;
    } catch (e) { failed = true; console.error('اسم الحساب ' + id + ': ' + errText_(e)); }
  });
  props.setProperty('ACC_NAMES_AUTO', JSON.stringify(auto));
  if (!failed) props.setProperty('ACC_NAMES_DAY', today);
}

/*
 * Meta orders whose UTM carries a campaign / ad ID that no tracked account has: ask Meta which account it belongs to
 * and add that account to the Accounts tab (then pull its month). Needs the token to see that account.
 * Each ID is asked once a day at most.
 */
function discoverAccounts_() {
  const osh = ss_().getSheetByName(APP.T.ORDERS), ash = ss_().getSheetByName(APP.T.ADS);
  if (!osh || !ash || !accounts_('META').length) return;
  const props = PropertiesService.getDocumentProperties(), today = todayKey_(), weekAgo = shiftKey_(today, -7);
  if (props.getProperty('ACC_DISCOVER_DAY') === today) return; // once a day
  props.setProperty('ACC_DISCOVER_DAY', today);
  const known = new Set();
  readRows_(ash, ADS_HEADERS.length).forEach(a => { [a[4], a[6], a[8]].forEach(x => { if (x) known.add(String(x)); }); });
  const ids = new Set();
  readRows_(osh, ORDERS_HEADERS.length).forEach(o => {
    if (o[3] !== 'META' || o[14] || asKey_(o[2]) < weekAgo) return;
    ([o[11], o[12], o[13]].join(' ').match(/\d{15,}/g) || []).forEach(x => { if (!known.has(x)) ids.add(x); });
  });
  let tried = {};
  try { tried = JSON.parse(props.getProperty('ACC_DISCOVER_TRIED') || '{}'); } catch (e) { tried = {}; }
  const have = new Set(accounts_().map(a => a.platform + '|' + a.id)), added = [], denied = [];
  Array.from(ids).filter(id => tried[id] !== today).slice(0, 5).forEach(id => {
    tried[id] = today;
    try {
      const acc = String(metaGet_(id, { fields: 'account_id' }).account_id || '');
      if (!acc || have.has('META|' + acc)) return;
      const info = metaGet_('act_' + acc, { fields: 'name' });
      ensureTab_(APP.T.ACCOUNTS).appendRow(['META', acc, String(info.name || acc), 'اتضاف لوحده: أوردرات جاية منه', true, '']);
      have.add('META|' + acc); added.push(acc);
    } catch (e) { denied.push(id); }
  });
  props.setProperty('ACC_DISCOVER_TRIED', JSON.stringify(tried));
  if (added.length) {
    startBackfill_(today.slice(0, 8) + '01', today, added);
    setStatus_('ACC_DISCOVER', '✓ اتضاف ' + added.join(', ') + ' — صرفه بيتسحب من أول الشهر');
  } else if (denied.length) {
    setStatus_('ACC_DISCOVER', '⚠️ أوردرات من كامبين/إعلان مش متاح بالتوكن: ' + denied.join(', ') + ' — ضيف حسابه للـ System User');
  }
}

/* ======== 03_ads_sync.gs ======== */
/*
 * Ads Raw = one row per ad per day, all platforms. The single source of truth for spend.
 * Each sync REPLACES the days it pulls for the accounts it pulled (no appending, no duplicates).
 * Account Raw = account-level spend per day, used only to check that ad-level spend adds up.
 */
const ADS_HEADERS = ['Date', 'Platform', 'Account ID', 'Account', 'Campaign ID', 'Campaign', 'Ad set ID', 'Ad set',
  'Ad ID', 'Ad', 'Spend', 'Impressions', 'Link clicks', 'Purchases', 'Purchase value'];
const ACC_HEADERS = ['Date', 'Platform', 'Account ID', 'Account', 'Spend', 'Purchases'];

function fetchMetaAds_(since, until, onlyId) {
  const ads = [], accRows = [], range = JSON.stringify({ since: since, until: until });
  const list = accounts_('META').filter(a => !onlyId || a.id === onlyId);
  list.forEach(acc => {
    try {
      metaAll_('act_' + acc.id + '/insights', { level: 'ad', time_range: range, time_increment: 1,
        fields: 'date_start,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,inline_link_clicks,actions,action_values' })
        .forEach(r => ads.push([r.date_start, 'META', acc.id, acc.name, String(r.campaign_id || ''), r.campaign_name || '',
          String(r.adset_id || ''), r.adset_name || '', String(r.ad_id || ''), r.ad_name || '', round2_(num_(r.spend)),
          num_(r.impressions), num_(r.inline_link_clicks), metaPick_(r.actions), round2_(metaPick_(r.action_values))]));
      metaAll_('act_' + acc.id + '/insights', { level: 'account', time_range: range, time_increment: 1,
        fields: 'date_start,spend,actions' })
        .forEach(r => accRows.push([r.date_start, 'META', acc.id, acc.name, round2_(num_(r.spend)), metaPick_(r.actions)]));
    } catch (e) {
      throw new Error('الحساب ' + acc.name + ' (' + acc.id + '): ' + errText_(e) +
        (/#200|permission|ads_read/i.test(String(e)) ? '\nالتوكن مالوش صلاحية على الحساب ده.' : ''));
    }
  });
  return { ads: ads, acc: accRows, accounts: list.map(a => 'META|' + a.id) };
}

/* TikTok from a tab filled by a connector tool (Coupler, Windsor, Supermetrics) or a pasted CSV. */
function fetchTikTokTab_(since, until) {
  const method = cfgStr_('tiktok.method');
  if (method !== 'connector_tab' && method !== 'csv_tab') return { ads: [], acc: [], accounts: [], links: {} };
  const sh = ss_().getSheetByName(cfgStr_('tiktok.tab'));
  if (!sh || sh.getLastRow() < 2) return { ads: [], acc: [], accounts: [], links: {} };
  const v = sh.getDataRange().getValues(), head = v[0].map(x => String(x).trim());
  const col = k => head.indexOf(cfgStr_('tiktok.col.' + k));
  const c = {}; ['date', 'account_id', 'campaign', 'adgroup', 'ad_id', 'ad', 'spend', 'impressions', 'clicks', 'purchases', 'landing']
    .forEach(k => { c[k] = col(k); });
  if (c.date < 0 || c.spend < 0) throw new Error('تاب TikTok ناقص فيه عمود التاريخ أو الصرف. راجع tiktok.col.* في Settings.');
  const ads = [], accSum = {}, links = {}, names = {}, tkAccs = accounts_('TIKTOK');
  tkAccs.forEach(a => { names[a.id] = a.name; });
  v.slice(1).forEach(r => {
    const key = r[c.date] instanceof Date ? dayKey_(r[c.date]) : asKey_(String(r[c.date]).slice(0, 10));
    if (!key || key < since || key > until) return;
    const acc = c.account_id >= 0 && String(r[c.account_id]).trim() ? String(r[c.account_id]).trim()
      : (tkAccs.length === 1 ? tkAccs[0].id : 'tiktok');
    const adId = c.ad_id >= 0 ? String(r[c.ad_id]).trim() : '';
    const get = k => (c[k] >= 0 ? r[c[k]] : '');
    ads.push([key, 'TIKTOK', acc, names[acc] || acc, '', String(get('campaign')), '', String(get('adgroup')), adId,
      String(get('ad')), round2_(num_(get('spend'))), num_(get('impressions')), num_(get('clicks')), num_(get('purchases')), 0]);
    const k = key + '|' + acc;
    accSum[k] = accSum[k] || [key, 'TIKTOK', acc, names[acc] || acc, 0, 0];
    accSum[k][4] = round2_(accSum[k][4] + num_(get('spend')));
    accSum[k][5] += num_(get('purchases'));
    if (adId && c.landing >= 0 && get('landing')) links[adId] = String(get('landing'));
  });
  const accs = Array.from(new Set(ads.map(r => 'TIKTOK|' + r[2])));
  return { ads: ads, acc: Object.keys(accSum).map(k => accSum[k]), accounts: accs, links: links };
}

/* Replace [since..until] for the synced accounts; keep everything else. */
function mergeRaw_(sheetName, headers, fresh, since, until, accountKeys, keyCols, idIdx) {
  const sh = ensureTab_(sheetName, headers), cols = headers.length, synced = new Set(accountKeys);
  const out = [], seen = new Set();
  const add = r => {
    const k = keyCols.map(i => String(r[i])).join('|');
    if (seen.has(k)) return;
    seen.add(k); out.push(r);
  };
  fresh.forEach(add);
  readRows_(sh, cols).forEach(r => {
    r[0] = asKey_(r[0]);
    if (!r[0]) return;
    idIdx.forEach(i => { r[i] = String(r[i]); });
    if (r[0] >= since && r[0] <= until && synced.has(r[1] + '|' + r[2])) return;
    add(r);
  });
  out.sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : num_(b[headers.indexOf('Spend')]) - num_(a[headers.indexOf('Spend')])));
  writeRows_(sh, out, cols, [1].concat(idIdx.map(i => i + 1)));
  return out.length;
}

/* Read everything first (no lock), then write inside the lock. */
function syncAds_(since, until) {
  const meta = time_('Meta — قراءة', () => fetchMetaAds_(since, until));
  const tt = time_('TikTok — قراءة', () => fetchTikTokTab_(since, until));
  const cat = time_('Meta كتالوج — قراءة', () => syncCatalog_(since, until));
  const ads = meta.ads.concat(tt.ads), acc = meta.acc.concat(tt.acc), keys = meta.accounts.concat(tt.accounts);
  return withLock_(() => {
    mergeRaw_(APP.T.ADS, ADS_HEADERS, ads, since, until, keys, [0, 1, 2, 8], [2, 4, 6, 8]);
    mergeRaw_(APP.T.ACC_RAW, ACC_HEADERS, acc, since, until, keys, [0, 1, 2], [2]);
    if (cat) mergeCatalog_(cat.rows, since, until, cat.keys);
    time_('Ad Map', () => refreshAdMap_(ads, tt.links, false));
    return { ads: ads.length, since: since, until: until };
  });
}

/* ======== 04_admap.gs ======== */
/*
 * Ad Map: the product of every ad, decided once per ad ID from hard evidence.
 * Order of evidence: Override (you) > LINK (landing page) > CODE (exact code in names)
 * > KEYWORD (suggestion, ⚠️) > NONE (❌, spend stays unmapped). Never a default product.
 * Orders never move spend.
 */
const ADMAP_HEADERS = ['Ad ID', 'Platform', 'Account ID', 'Account', 'Campaign', 'Ad set', 'Ad', 'Landing URLs',
  'Auto product', 'Source', 'Override', 'Final product', 'Status', 'Confirmed at', 'Confirmed value',
  'Link changed', 'Mapped link', 'Spend MTD', 'Last spend', 'Note'];
const AM = { ID: 0, PLAT: 1, ACC: 2, ACCN: 3, CAMP: 4, SET: 5, AD: 6, LINKS: 7, AUTO: 8, SRC: 9, OVR: 10, FINAL: 11,
  STATUS: 12, CONF_AT: 13, CONF_VAL: 14, CHANGED: 15, MAPPED: 16, SPEND: 17, LAST: 18, NOTE: 19 };

/* Ads without an ID (some TikTok exports) get a stable key from their names. */
function adKey_(platform, adId, camp, set, ad) {
  return platform + '|' + (adId ? String(adId) : 'name:' + norm_(camp) + '/' + norm_(set) + '/' + norm_(ad));
}

function linksFromCreative_(c) {
  const out = [], push = v => { if (v && typeof v === 'string') out.push(v); };
  if (!c) return out;
  const spec = c.object_story_spec || {}, ld = spec.link_data || {}, vd = spec.video_data || {}, td = spec.template_data || {};
  push(ld.link);
  (ld.child_attachments || []).forEach(x => push(x && x.link));
  if (ld.call_to_action && ld.call_to_action.value) push(ld.call_to_action.value.link);
  if (vd.call_to_action && vd.call_to_action.value) push(vd.call_to_action.value.link);
  push(td.link);
  ((c.asset_feed_spec || {}).link_urls || []).forEach(x => push(x && x.website_url));
  push(c.object_url); push(c.link_url);
  return Array.from(new Set(out));
}

/* Store URLs only. Returns {slugs:[...], paths:[...], multi:bool, store:bool}.
 * slugs = product pages matched by business.product_url_regex; paths = other store pages (unknown shape). */
function parseStoreLinks_(links) {
  const domains = cfgList_('business.store_domains').map(storeHost_).filter(Boolean);
  const prodRx = new RegExp(cfgStr_('business.product_url_regex') || '/products?/([^/]+)', 'i');
  const multiRx = new RegExp(cfgStr_('business.multi_url_regex') || '^/?$|/collections?(/|$)', 'i');
  const res = { slugs: [], paths: [], multi: false, store: false };
  links.forEach(raw => {
    let u = String(raw).trim();
    try { u = decodeURIComponent(u); } catch (e) {}
    const m = u.match(/^(?:https?:\/\/)?([^\/?#\s]+)([^?#\s]*)/i);
    if (!m) return;
    const host = m[1].toLowerCase().replace(/^www\./, ''), path = (m[2] || '/').toLowerCase().replace(/\/+$/, '') || '/';
    const p = path.match(prodRx);
    // No store domain in Settings yet: only product-page paths count (slug must still exist in Products).
    if (!domains.length) { if (p && p[1]) { res.store = true; res.slugs.push(p[1]); } return; }
    if (!domains.some(d => host === d || host.endsWith('.' + d))) return;
    res.store = true;
    if (p && p[1]) res.slugs.push(p[1]);
    else if (multiRx.test(path)) res.multi = true;
    else res.paths.push(path);
  });
  res.slugs = Array.from(new Set(res.slugs));
  res.paths = Array.from(new Set(res.paths));
  return res;
}

function decideProduct_(links, camp, set, ad) {
  const prods = products_(), parsed = parseStoreLinks_(links);
  const pages = parsed.slugs.concat(parsed.paths);
  if (pages.length) {
    const hits = new Set(), unknown = [];
    // A Landing slugs entry can be the page name ("moda-package") or a full path ("/p/123").
    pages.forEach(s => { const p = prods.find(x => x.slugs.indexOf(s) >= 0); if (p) hits.add(p.name); else unknown.push(s); });
    if (unknown.length) return { product: '', source: 'NONE', note: 'صفحة مش متسجلة في Products: ' + unknown.join(', '), unknown: unknown };
    if (hits.size === 1 && !parsed.multi) return { product: Array.from(hits)[0], source: 'LINK', note: '' };
    return { product: '', source: 'MULTI', note: 'اللينك فيه أكتر من منتج' };
  }
  if (parsed.multi) return { product: '', source: 'MULTI', note: 'اللينك رايح لصفحة فيها كل المنتجات أو الرئيسية' };
  const text = norm_([camp, set, ad].join(' '));
  const codeHits = prods.filter(p => p.codes.some(c => hasToken_(text, c)));
  if (codeHits.length === 1) return { product: codeHits[0].name, source: 'CODE', note: '' };
  const kw = prods.filter(p => [norm_(p.name)].concat(p.aliases).some(a => a && a.length >= 3 && text.indexOf(a) >= 0));
  if (kw.length === 1) return { product: kw[0].name, source: 'KEYWORD', note: 'مقترح من الاسم، محتاج تأكيد' };
  return { product: '', source: 'NONE', note: codeHits.length > 1 || kw.length > 1 ? 'الاسم بيشاور على أكتر من منتج' : 'مفيش دليل' };
}

function fetchMetaLinks_(adIds) {
  const out = {}, stop = Date.now() + 60000; // at most a minute per run: many new ads (after a backfill) finish over the next runs
  for (let i = 0; i < adIds.length; i += 25) {
    if (!timeLeft_() || Date.now() > stop) break; // the rest stay blank and are read next run
    const chunk = adIds.slice(i, i + 25);
    const res = metaMany_(chunk.map(id => ({ path: id, params: {
      fields: 'creative{object_story_spec,asset_feed_spec,object_url,link_url,effective_object_story_id}' } })));
    res.forEach((r, j) => {
      const id = chunk[j];
      if (r.error) { out[id] = { links: [], error: r.error }; return; }
      const c = r.payload.creative || {};
      let links = linksFromCreative_(c), error = '';
      if (!links.length && c.effective_object_story_id && timeLeft_()) {
        try {
          const post = metaGet_(c.effective_object_story_id, { fields: 'call_to_action' });
          const v = post.call_to_action && post.call_to_action.value;
          if (v && v.link) links = [v.link];
        } catch (e) { error = 'لينك البوست مش متاح بالتوكن ده'; }
      }
      out[id] = { links: links, error: error };
    });
  }
  return out;
}

/*
 * freshAds: Ads Raw rows just pulled. tiktokLinks: {adId: url}. recheckAll: re-read links of every
 * ad that spent in the last 7 days (daily run), otherwise only ads not in the map yet.
 */
function refreshAdMap_(freshAds, tiktokLinks, recheckAll) {
  const sh = ensureTab_(APP.T.ADMAP, ADMAP_HEADERS), W = ADMAP_HEADERS.length;
  const rows = readRows_(sh, W), byKey = new Map();
  rows.forEach(r => { r[AM.ID] = String(r[AM.ID]); r[AM.ACC] = String(r[AM.ACC]); byKey.set(adKey_(r[AM.PLAT], r[AM.ID], r[AM.CAMP], r[AM.SET], r[AM.AD]), r); });

  freshAds.forEach(a => {
    if (num_(a[10]) <= 0 && num_(a[11]) <= 0) return;
    const key = adKey_(a[1], a[8], a[5], a[7], a[9]);
    let r = byKey.get(key);
    if (!r) { r = new Array(W).fill(''); r[AM.ID] = String(a[8] || ''); r[AM.PLAT] = a[1]; byKey.set(key, r); r._new = true; }
    r[AM.ACC] = String(a[2]); r[AM.ACCN] = a[3]; r[AM.CAMP] = a[5]; r[AM.SET] = a[7]; r[AM.AD] = a[9];
    if (!r[AM.LAST] || asKey_(r[AM.LAST]) < a[0]) r[AM.LAST] = a[0];
  });

  const weekAgo = shiftKey_(todayKey_(), -7);
  const needMeta = [];
  byKey.forEach(r => {
    if (r[AM.PLAT] === 'META' && r[AM.ID] && (r._new || !r[AM.LINKS] || (recheckAll && asKey_(r[AM.LAST]) >= weekAgo))) needMeta.push(r[AM.ID]);
    if (r[AM.PLAT] === 'TIKTOK' && tiktokLinks && tiktokLinks[r[AM.ID]]) r[AM.LINKS] = tiktokLinks[r[AM.ID]];
  });
  if (needMeta.length && accounts_('META').length) {
    const got = fetchMetaLinks_(needMeta);
    byKey.forEach(r => {
      const g = got[r[AM.ID]];
      if (!g) return;
      r[AM.LINKS] = g.links.length ? g.links.join(', ') : '-';
      r._err = g.error;
    });
  }

  // Spend this month per ad, from Ads Raw (after merge).
  const monthStart = todayKey_().slice(0, 8) + '01', spend = {};
  readRows_(tab_(APP.T.ADS), ADS_HEADERS.length).forEach(a => {
    const d = asKey_(a[0]);
    if (d < monthStart) return;
    const k = adKey_(a[1], String(a[8] || ''), a[5], a[7], a[9]);
    spend[k] = (spend[k] || 0) + num_(a[10]);
  });

  // Product pages not in Products yet: add them from the store (Shopify title), then decide.
  const known = new Set();
  products_().forEach(p => p.slugs.forEach(s => known.add(s)));
  const newSlugs = new Set();
  byKey.forEach(r => parseStoreLinks_(String(r[AM.LINKS] || '').split(',').map(x => x.trim()).filter(x => x && x !== '-'))
    .slugs.forEach(s => { if (!known.has(s)) newSlugs.add(s); }));
  if (newSlugs.size) addProductsFromLinks_(Array.from(newSlugs));

  const unassigned = new Set(), valid = new Set(products_().map(p => p.name).concat(['MULTI']));
  byKey.forEach((r, key) => {
    const links = String(r[AM.LINKS] || '').split(',').map(x => x.trim()).filter(x => x && x !== '-');
    const d = decideProduct_(links, r[AM.CAMP], r[AM.SET], r[AM.AD]);
    (d.unknown || []).forEach(s => unassigned.add(s));
    r[AM.AUTO] = d.product; r[AM.SRC] = d.source;
    r[AM.NOTE] = [d.note, r._err || ''].filter(Boolean).join(' — ');
    const ovr = String(r[AM.OVR] || '').trim();
    if (ovr && !valid.has(ovr)) r[AM.NOTE] = 'الاختيار مش في تاب المنتجات: ' + ovr;
    const linkSig = links.slice().sort().join(', ');
    // A new or changed Override is a confirmation: remember the link it was confirmed against.
    if (ovr && ovr !== String(r[AM.CONF_VAL] || '')) { r[AM.CONF_VAL] = ovr; r[AM.CONF_AT] = nowText_(); r[AM.MAPPED] = linkSig; }
    if (!ovr && r[AM.CONF_VAL]) { r[AM.CONF_VAL] = ''; r[AM.CONF_AT] = ''; }
    if (!r[AM.MAPPED] && (ovr || d.source === 'LINK' || d.source === 'CODE')) r[AM.MAPPED] = linkSig;
    const changed = !!r[AM.MAPPED] && !!linkSig && r[AM.MAPPED] !== linkSig;
    r[AM.CHANGED] = changed;
    const useOvr = ovr && valid.has(ovr);
    r[AM.FINAL] = useOvr ? (ovr === 'MULTI' ? APP.MULTI : ovr)
      : d.source === 'MULTI' ? APP.MULTI : d.product || APP.UNMAPPED;
    r[AM.STATUS] = changed ? '⚠️' : useOvr ? '✅' : (d.source === 'LINK' || d.source === 'CODE') ? '✅'
      : (d.source === 'KEYWORD' || d.source === 'MULTI') ? '⚠️' : '❌';
    r[AM.SPEND] = round2_(spend[key] || 0);
  });
  PropertiesService.getDocumentProperties().setProperty('UNASSIGNED_SLUGS', Array.from(unassigned).join(', '));

  const order = { '❌': 0, '⚠️': 1, '✅': 2 }, out = Array.from(byKey.values())
    .sort((a, b) => (order[a[AM.STATUS]] - order[b[AM.STATUS]]) || (num_(b[AM.SPEND]) - num_(a[AM.SPEND])))
    .map(r => r.slice(0, W));
  writeRows_(sh, out, W, [1, 3, 15, 17]);
  const n = Math.max(out.length, 1);
  sh.getRange(2, AM.OVR + 1, n, 1).setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(products_().map(p => p.name).concat(['MULTI']), true).setAllowInvalid(true).build()).setBackground('#fff2cc');
  const st = sh.getRange(2, AM.STATUS + 1, n, 1);
  sh.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('❌').setBackground('#fce8e6').setRanges([st]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('⚠️').setBackground('#fff4ce').setRanges([st]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('✅').setBackground('#e6f4ea').setRanges([st]).build()
  ]);
  setStatus_('ADMAP', '✓ ' + out.length + ' إعلان');
  return out.length;
}

/* key → {product, exact}. Used by every view, so an Override fixes all past days at once. */
function adMapIndex_() {
  const sh = ss_().getSheetByName(APP.T.ADMAP), idx = new Map();
  if (!sh) return idx;
  readRows_(sh, ADMAP_HEADERS.length).forEach(r => {
    const final = String(r[AM.FINAL] || APP.UNMAPPED);
    idx.set(adKey_(r[AM.PLAT], String(r[AM.ID]), r[AM.CAMP], r[AM.SET], r[AM.AD]),
      { product: final, exact: r[AM.STATUS] === '✅' && final !== APP.MULTI && final !== APP.UNMAPPED });
  });
  return idx;
}

function refreshAdMapNow() {
  try {
    resetCaches_();
    const n = withLock_(() => refreshAdMap_([], {}, true));
    alert_('اتحدث ربط الإعلانات ✅ (' + n + ' إعلان)\nراجع الأحمر والأصفر في تاب ' + APP.T.ADMAP + '.');
    ss_().setActiveSheet(tab_(APP.T.ADMAP));
  } catch (e) { alert_('ربط الإعلانات ماكملش:\n' + errText_(e)); }
}

/* ======== 05_orders.gs ======== */
/*
 * Orders Raw = one row per unique order ID from the store's orders sheet.
 * Sources (orders.method): linked_sheet (EasyOrders / any platform-linked sheet),
 * shopify_flow_sheet (Shopify Flow → Google Sheets), csv_tab (a tab in this file), none.
 * An API source (e.g. TakeTheme) is a separate adapter written per business: it must
 * return the same row shape as readOrderSource_().
 * Platform: UTM evidence > referrer > DIRECT (referrer "Direct", or a store order with neither)
 * > MANUAL (draft order typed in the admin) > UNKNOWN (no source data at all). Never guessed.
 */
const ORDERS_HEADERS = ['Order ID', 'Created at', 'Date', 'Platform', 'Signal', 'Product', 'Products raw', 'Total',
  'City', 'Phone', 'Alt phone', 'UTM source', 'UTM campaign', 'UTM content', 'Ad ID', 'Cancelled'];

const COL_ALTS = {
  order_id: ['Order ID', 'Order Number', 'Name', 'Order', 'id'],
  date: ['Date', 'Created At', 'created_at', 'Order Date'],
  phone: ['Phone', 'Customer Phone', 'Shipping Phone', 'رقم التليفون'],
  alt_phone: ['Alt Phone', 'Billing Phone', 'رقم إضافي'],
  product: ['Product Name', 'Products', 'Line Items', 'Product', 'الطلب'],
  total: ['Order Total Cost', 'Total Price', 'Total', 'السعر'],
  city: ['City', 'Shipping City', 'Province', 'المحافظة'],
  utm_source: ['UTM Source', 'utm_source'], utm_campaign: ['UTM Campaign', 'utm_campaign'],
  utm_content: ['UTM Content', 'utm_content'], referrer: ['Referrer', 'Order Referrer', 'Landing Site Ref'],
  // Shopify Flow columns from the COD form's order attributes (the visit UTMs are empty for form orders).
  attr_utm_source: ['Attr UTM Source'], attr_utm_campaign: ['Attr UTM Campaign'], attr_utm_content: ['Attr UTM Content'],
  source_name: ['Source Name'],
  metadata: ['Order Metadata'], status: ['Status', 'Financial Status', 'Cancelled At']
};

/* Shopify Flow writes "(blank)" for an empty value. */
function orderCell_(v) {
  if (typeof v !== 'string') return v;
  const s = v.trim();
  return /^(\(blank\)|blank|null|undefined|-)$/i.test(s) ? '' : s;
}

/*
 * Shopify Flow adds values, not headers. The Flow row ends with the COD form columns right after "UTM Term",
 * so their headers are written once here (the only write to the orders sheet).
 */
const FLOW_EXTRA_HEADERS = ['Attr UTM Source', 'Attr UTM Campaign', 'Attr UTM Content', 'Order Referrer', 'Products', 'Source Name'];
function ensureFlowHeaders_(sheet, head) {
  const at = head.indexOf('UTM Term') + 1;
  if (cfgStr_('orders.method') !== 'shopify_flow_sheet' || !at) return head;
  const want = head.slice(0, at).concat(FLOW_EXTRA_HEADERS);
  if (FLOW_EXTRA_HEADERS.every((h, i) => head[at + i] === h)) return head;
  if (FLOW_EXTRA_HEADERS.some((h, i) => head[at + i] && head[at + i] !== h)) return head; // something else is there: leave it
  try {
    sheet.getRange(1, at + 1, 1, FLOW_EXTRA_HEADERS.length).setValues([FLOW_EXTRA_HEADERS]);
    return want.concat(head.slice(want.length));
  } catch (e) { setStatus_('ORDERS_HEADERS', '✗ مش قادر أكتب عناوين أعمدة الفورم في شيت الأوردرات: ' + errText_(e)); return head; }
}

function orderColumns_(head) {
  const idx = {};
  Object.keys(COL_ALTS).forEach(k => {
    const wanted = [cfgStr_('orders.col.' + k)].concat(COL_ALTS[k]).filter(Boolean);
    idx[k] = -1;
    for (const w of wanted) { const i = head.indexOf(w); if (i >= 0) { idx[k] = i; break; } }
  });
  return idx;
}

function openOrderSheet_() {
  const method = cfgStr_('orders.method');
  if (method === 'none' || method === 'pixel') return null;
  const url = cfgStr_('orders.sheet_url'), tabName = cfgStr_('orders.sheet_tab');
  let book = ss_();
  if (method !== 'csv_tab') {
    const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/), id = m ? m[1] : (/^[a-zA-Z0-9_-]{20,}$/.test(url) ? url : '');
    if (!id) throw new Error('لينك شيت الأوردرات ناقص أو غلط في Settings (orders.sheet_url).');
    book = SpreadsheetApp.openById(id);
  }
  const sh = book.getSheetByName(tabName);
  if (!sh) throw new Error('تاب الأوردرات مش موجود: ' + tabName);
  return { sheet: sh, tz: book.getSpreadsheetTimeZone() };
}

/* Decide d/m order once for the whole column; never guess per row. */
function detectDateFormat_(values, col) {
  const f = cfgStr_('orders.date_format');
  if (f && f !== 'auto') return f;
  let dmy = false, mdy = false;
  values.forEach(r => {
    const m = String(r[col] instanceof Date ? '' : r[col] || '').match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
    if (!m) return;
    if (Number(m[1]) > 12) dmy = true;
    if (Number(m[2]) > 12) mdy = true;
  });
  if (dmy && mdy) throw new Error('تواريخ الأوردرات مكتوبة بطريقتين مختلفتين. حدد orders.date_format في Settings.');
  return dmy ? 'dmy' : 'mdy';
}
function parseOrderDate_(v, fmt, tz) {
  if (v instanceof Date) return isNaN(v) ? null : v;
  const s = digits_(v).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) { const d = new Date(s); return isNaN(d) ? null : d; }
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (m) return Utilities.parseDate(m[1] + '-' + m[2] + '-' + m[3] + ' ' + (m[4] || '00') + ':' + (m[5] || '00'), tz, 'yyyy-MM-dd HH:mm');
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  const d = fmt === 'dmy' ? m[1] : m[2], mo = fmt === 'dmy' ? m[2] : m[1];
  return Utilities.parseDate(m[3] + '-' + mo.padStart(2, '0') + '-' + d.padStart(2, '0') + ' ' +
    String(m[4] || '0').padStart(2, '0') + ':' + (m[5] || '00'), tz, 'yyyy-MM-dd HH:mm');
}

function platformOf_(utms, referrer, sourceName) {
  const text = norm_(utms.join(' ')), tk = cfgList_('attribution.tiktok_markers').map(norm_),
    me = cfgList_('attribution.meta_markers').map(norm_);
  const isTk = tk.some(t => hasToken_(text, t)), isMe = me.some(t => hasToken_(text, t));
  // A referrer URL (facebook.com/…) or the COD form's word (Facebook, Instagram, Direct(…)).
  const ref = String(referrer || '').toLowerCase(), refP = /tiktok/.test(ref) ? 'TIKTOK'
    : /(facebook|instagram|fb\.com|threads\.|messenger)/.test(ref) ? 'META' : '';
  if (isTk && isMe) return refP ? { p: refP, s: 'referrer' } : { p: APP.UNKNOWN_PLATFORM, s: 'utm_conflict' };
  if (isTk) return { p: 'TIKTOK', s: 'utm' };
  if (isMe) return { p: 'META', s: 'utm' };
  if (text) return { p: cfgStr_('attribution.other_utm_platform') === 'UNKNOWN' ? APP.UNKNOWN_PLATFORM : 'META', s: 'utm_convention' };
  if (refP) return { p: refP, s: 'referrer' };
  const source = String(sourceName || '').toLowerCase();
  if (/^direct/.test(ref)) return { p: APP.DIRECT, s: 'referrer' };
  if (/draft/.test(source)) return { p: APP.MANUAL, s: 'draft_order' };
  if (source) return { p: APP.DIRECT, s: 'no_utm' };
  return { p: APP.UNKNOWN_PLATFORM, s: 'none' };
}

function productOfOrder_(raw) {
  let t = String(raw || '');
  if (cfgBool_('orders.product_first_line')) t = t.split(/\r?\n|\s\|\s/)[0];
  t = t.replace(/\s+x\s*\d+\s*$/i, '');
  const n = norm_(t), prods = products_();
  if (!n) return APP.UNKNOWN_PRODUCT;
  const exact = prods.filter(p => norm_(p.name) === n || p.aliases.indexOf(n) >= 0);
  if (exact.length === 1) return exact[0].name;
  const part = prods.filter(p => p.aliases.some(a => a && a.length >= 3 && n.indexOf(a) >= 0));
  // Not in Products: the Shopify title itself is the product (the same name catalog ads report).
  return part.length === 1 ? part[0].name : t.trim();
}

function readOrderSource_() {
  const src = openOrderSheet_();
  if (!src) return [];
  const values = src.sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const head = ensureFlowHeaders_(src.sheet, values[0].map(v => String(v).trim())), c = orderColumns_(head);
  if (c.order_id < 0 || c.date < 0) throw new Error('شيت الأوردرات ناقص فيه عمود رقم الأوردر أو التاريخ. راجع orders.col.* في Settings.');
  const rows = values.slice(1), fmt = detectDateFormat_(rows, c.date), get = (r, k) => (c[k] >= 0 ? orderCell_(r[c[k]]) : '');
  const adIds = new Set(); const am = ss_().getSheetByName(APP.T.ADMAP);
  if (am) readRows_(am, 1).forEach(r => adIds.add(String(r[0])));
  // UTMs with names instead of IDs (utm_source = campaign name, utm_campaign = ad name): the ad from Ads Raw.
  const byName = new Map(), ash = ss_().getSheetByName(APP.T.ADS);
  if (ash) readRows_(ash, ADS_HEADERS.length).forEach(a => {
    const k = norm_(a[5]) + '|' + norm_(a[9]);
    if (a[8] && !byName.has(k)) byName.set(k, String(a[8]));
  });
  const cancelWords = cfgList_('orders.cancelled_words').map(norm_);
  const byId = new Map();
  let noDate = 0;
  rows.forEach(r => {
    const id = String(get(r, 'order_id') === null ? '' : get(r, 'order_id')).trim();
    if (!id) return;
    const dt = parseOrderDate_(get(r, 'date'), fmt, src.tz);
    if (!dt) { noDate++; return; }
    const utms = ['utm_source', 'utm_campaign', 'utm_content'].map(k => String(get(r, 'attr_' + k) || get(r, k) || '').trim());
    const meta = String(get(r, 'metadata') || ''), refM = meta.match(/referrer\s*:\s*([^\s\]]+)/i);
    const referrer = String(get(r, 'referrer') || '') || (refM ? refM[1] : '');
    const total = num_(get(r, 'total'));
    const o = byId.get(id);
    if (o) { // duplicate rows of one order (cross-sell lines): earliest date, highest total
      if (dt < o.dt) o.dt = dt;
      o.total = Math.max(o.total, total);
      utms.forEach((u, i) => { if (!o.utms[i] && u) o.utms[i] = u; });
      return;
    }
    byId.set(id, { id: id, dt: dt, utms: utms, referrer: referrer, source: String(get(r, 'source_name') || ''), total: total, raw: String(get(r, 'product') || ''),
      city: String(get(r, 'city') || '').trim(), phone: phone10_(get(r, 'phone')), alt: phone10_(get(r, 'alt_phone')),
      cancelled: cancelWords.some(w => w && hasToken_(norm_(get(r, 'status')), w)) });
  });
  if (noDate) setStatus_('ORDERS_NODATE', noDate + ' صف من غير تاريخ مفهوم');
  return Array.from(byId.values()).map(o => {
    const pl = platformOf_(o.utms.filter(Boolean), o.referrer, o.source);
    const adId = (o.utms.join(' ').match(/\d{10,}/g) || []).find(x => adIds.has(x)) || byName.get(norm_(o.utms[0]) + '|' + norm_(o.utms[1])) || '';
    return [o.id, Utilities.formatDate(o.dt, tz_(), 'yyyy-MM-dd HH:mm'), dayKey_(o.dt), pl.p, pl.s, productOfOrder_(o.raw),
      o.raw.replace(/\s+/g, ' ').slice(0, 1000), o.total, o.city, o.phone ? '0' + o.phone : '', o.alt ? '0' + o.alt : '',
      o.utms[0], o.utms[1], o.utms[2], adId, o.cancelled];
  }).sort((a, b) => (a[1] < b[1] ? 1 : -1));
}

function syncOrders_() {
  const rows = time_('الأوردرات — قراءة', () => readOrderSource_());
  const hash = sha_(JSON.stringify(rows));
  const props = PropertiesService.getDocumentProperties();
  if (props.getProperty('ORDERS_HASH') === hash) return { orders: rows.length, changed: false };
  withLock_(() => {
    writeRows_(ensureTab_(APP.T.ORDERS, ORDERS_HEADERS), rows, ORDERS_HEADERS.length, [1, 2, 3, 10, 11, 15]);
    props.setProperty('ORDERS_HASH', hash);
  });
  setStatus_('ORDERS', '✓ ' + rows.length + ' أوردر');
  return { orders: rows.length, changed: true };
}

/* ======== 06_views.gs ======== */
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

function rebuildDaily_() {
  const idx = adMapIndex_(), catAds = catalogAdIds_(), agg = new Map(), pixelOrders = cfgStr_('orders.method') === 'pixel';
  const row = (d, pl, pr) => {
    const k = d + '|' + pl + '|' + pr;
    if (!agg.has(k)) agg.set(k, [d, pl, pr, 0, 0, 0, 0, 0, 0, 0, 0]);
    return agg.get(k);
  };
  const ads = readRows_(tab_(APP.T.ADS), ADS_HEADERS.length), known = metaIdsOf_(ads);
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
  const osh = ss_().getSheetByName(APP.T.ORDERS);
  if (osh && !pixelOrders) readRows_(osh, ORDERS_HEADERS.length).forEach(o => {
    const d = asKey_(o[2]);
    if (!d) return;
    const r = outsideMeta_(o, known) ? row(d, APP.META_OUT, o[5]) : row(d, o[3], orderAdProduct_(o, idx, catAds));
    r[8]++; if (o[15] === true || String(o[15]).toUpperCase() === 'TRUE') r[9]++; r[10] += num_(o[7]);
  });
  const rows = Array.from(agg.values()).map(r => r.map((v, i) => (i >= 3 && i !== 5 && i !== 6 ? round2_(v) : v)))
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : b[3] - a[3]));
  writeRows_(ensureTab_(APP.T.DAILY, DAILY_HEADERS), rows, DAILY_HEADERS.length, [1]);
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

/* Every campaign / ad set / ad ID in Ads Raw (rows given, or read). */
function metaIdsOf_(ads) {
  const ids = new Set();
  (ads || readRows_(tab_(APP.T.ADS), ADS_HEADERS.length)).forEach(a => { [a[4], a[6], a[8]].forEach(x => { if (x) ids.add(String(x)); }); });
  return ids;
}
/* A Meta order whose UTMs carry only IDs that no account in the sheet has: another ad account (no spend here). */
function outsideMeta_(o, known) {
  if (o[3] !== 'META' || o[14]) return false;
  const ids = [o[11], o[12], o[13]].join(' ').match(/\d{15,}/g) || [];
  return ids.length > 0 && !ids.some(x => known.has(x));
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

/*
 * slow = also the heavy period tabs (Product Performance, Tests, المنتجات, تعادل الحسابات): every 2 days, and from
 * the 📦 menu button. The 15-minute run keeps only what is read during the day light and fresh.
 */
function rebuildViews_(slow) {
  resetCaches_();
  time_('Daily Log', () => rebuildDaily_());
  time_('Today', () => writeToday_());
  writeClosing_(); writeHealth_();
  if (slow) { writePerf_(); writeTests_(); PropertiesService.getDocumentProperties().setProperty('SLOW_VIEWS_AT', String(Date.now())); }
  EXT.views.forEach(f => { try { f(!!slow); } catch (e) { console.error('ext view: ' + errText_(e)); } });
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

/* ======== 07_setup.gs ======== */
/* Setup (never clears existing data), sync entry points, triggers, menu. */

function setupAll() {
  try {
    withLock_(() => {
      const st = ensureTab_(APP.T.SETTINGS, ['Key', 'Value', 'الوصف']);
      const have = new Set(readRows_(st, 1).map(r => String(r[0]).trim()));
      const seed = (typeof PROFILE !== 'undefined' && PROFILE.settings) || {};
      const add = SETTINGS_SPEC.filter(s => !have.has(s[0])).map(s => [s[0], seed[s[0]] !== undefined ? seed[s[0]] : s[1], s[2]]);
      if (add.length) st.getRange(st.getLastRow() + 1, 1, add.length, 3).setValues(add);
      st.getRange(2, 2, Math.max(st.getLastRow() - 1, 1), 1).setBackground('#fff2cc').setNumberFormat('@');
      st.setColumnWidth(1, 230); st.setColumnWidth(2, 320); st.setColumnWidth(3, 360);

      const acc = ensureTab_(APP.T.ACCOUNTS, ['Platform', 'Account ID', 'Name', 'Purpose', 'Include', 'Brand / Page']);
      acc.getRange(2, 2, acc.getMaxRows() - 1, 1).setNumberFormat('@');
      seedTab_(acc, (typeof PROFILE !== 'undefined' && PROFILE.accounts) || [], 6);
      const pr = ensureTab_(APP.T.PRODUCTS, PRODUCT_HEADERS);
      seedTab_(pr, (typeof PROFILE !== 'undefined' && PROFILE.products) || [], PRODUCT_HEADERS.length);
      const bn = ensureTab_(APP.T.BENCH, BENCH_HEADERS);
      seedTab_(bn, (typeof PROFILE !== 'undefined' && PROFILE.benchmarks) || [], BENCH_HEADERS.length);

      ensureTab_(APP.T.ADMAP, ADMAP_HEADERS); ensureTab_(APP.T.ADS, ADS_HEADERS); ensureTab_(APP.T.ACC_RAW, ACC_HEADERS);
      ensureTab_(APP.T.ORDERS, ORDERS_HEADERS); ensureTab_(APP.T.DAILY, DAILY_HEADERS); ensureTab_(APP.T.INTRA, INTRA_HEADERS);
      ensureTab_(APP.T.TESTS, TESTS_HEADERS); ensureTab_(APP.T.TODAY); ensureTab_(APP.T.PERF); ensureTab_(APP.T.CLOSING); ensureTab_(APP.T.HEALTH);
      [APP.T.ADS, APP.T.ACC_RAW, APP.T.ORDERS, APP.T.DAILY].forEach(n => tab_(n).hideSheet());
      EXT.setup.forEach(f => f());
      resetCaches_();
    });
    alert_('الإعداد خلص ✅\n\nالخطوات الجاية:\n1) راجع Settings و Accounts و Products.\n2) المنيو: الإعدادات ← ربط توكن Meta.\n3) المنيو: أول سحب (من أول الشهر).\n4) المنيو: تشغيل التحديث التلقائي.');
  } catch (e) { alert_('الإعداد ماكملش:\n' + errText_(e)); }
}
/* Seed a table tab only if it has no data yet. */
function seedTab_(sh, rows, width) {
  if (!rows.length || sh.getLastRow() >= 2) return;
  const data = rows.map(r => { const a = r.slice(0, width); while (a.length < width) a.push(''); return a; });
  sh.getRange(2, 1, data.length, width).setValues(data);
}

function fullSync_(days) {
  resetCaches_();
  const today = todayKey_(), since = shiftKey_(today, -days);
  syncOrders_();
  const r = syncAds_(since, today);
  runLiveExt_();
  withLock_(() => time_('Views', () => rebuildViews_(slowViewsDue_())));
  setStatus_('FULL', '✓ ' + since + ' → ' + today + ' (' + r.ads + ' صف إعلانات)');
  return r;
}
function dailySync() {
  DEADLINE_ = Date.now() + 5 * 60000;
  try {
    fullSync_(cfgNum_('sync.refresh_days') || 3);
    PropertiesService.getDocumentProperties().setProperty('SYNCED_THROUGH', shiftKey_(todayKey_(), -1));
    withLock_(() => refreshAdMap_([], {}, true));
  } catch (e) { setStatus_('FULL', '✗ ' + errText_(e)); console.error(errText_(e)); }
}
/*
 * First pull in small pieces (one Meta account × 3 days per piece) so no run hits the 6-minute limit.
 * A 1-minute trigger keeps calling backfillStep until every piece is done, then deletes itself.
 */
function backfill() {
  try {
    const today = todayKey_(), from = cfgStr_('sync.backfill_from');
    const since = from === 'month_start' ? today.slice(0, 8) + '01' : asKey_(from) && asKey_(from) <= today ? asKey_(from)
      : shiftKey_(today, -(cfgNum_('sync.backfill_days') || 30));
    const units = startBackfill_(since, today);
    alert_('السحب بدأ ✅ من ' + since + ' لـ ' + today + '\nهيشتغل على ' + units.length + ' جزء لوحده كل دقيقة (حوالي ' + Math.ceil(units.length / 4) + ' دقايق).\n' +
      'سيب الشيت وتابع التقدم في تاب ' + APP.T.HEALTH + '. لما يخلص هتلاقي "أول سحب: خلص".');
  } catch (e) { alert_('السحب ماكملش:\n' + errText_(e)); }
}
function startBackfill_(since, until, onlyIds) {
  const units = [];
  accounts_('META').filter(a => !onlyIds || onlyIds.indexOf(a.id) >= 0).forEach(a => {
    for (let s = since; s <= until; s = shiftKey_(s, 3)) units.push([a.id, s, shiftKey_(s, 2) > until ? until : shiftKey_(s, 2)]);
  });
  const props = PropertiesService.getDocumentProperties(), running = JSON.parse(props.getProperty('BACKFILL') || 'null');
  if (running) { running.units = running.units.concat(units); props.setProperty('BACKFILL', JSON.stringify(running)); return units; }
  props.setProperty('BACKFILL', JSON.stringify({ units: units, done: 0, since: since, until: until }));
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'backfillStep').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('backfillStep').timeBased().everyMinutes(1).create();
  setStatus_('BACKFILL', '0 / ' + units.length + ' جزء (' + since + ' → ' + until + ')');
  return units;
}
/*
 * Days Meta was never pulled (no daily run for a while) are pulled again in the background, in pieces.
 * The first time (no CATALOG_FROM yet), the whole month is pulled again so catalog ads get their product split.
 */
function catchUpGap_() {
  const props = PropertiesService.getDocumentProperties();
  if (props.getProperty('BACKFILL') || !accounts_('META').length) return false;
  const today = todayKey_(), yest = shiftKey_(today, -1), monthStart = today.slice(0, 8) + '01';
  let through = asKey_(props.getProperty('SYNCED_THROUGH') || '');
  if (!through) {
    const acc = ss_().getSheetByName(APP.T.ACC_RAW);
    const days = acc ? readRows_(acc, ACC_HEADERS.length).map(r => asKey_(r[0])).filter(d => d && d < today).sort() : [];
    through = days.length ? shiftKey_(days.pop(), -1) : yest;
  }
  let since = through < yest ? shiftKey_(through, 1) : '';
  const catalogFirst = !props.getProperty('CATALOG_FROM') && monthStart <= yest;
  if (catalogFirst) since = since && since < monthStart ? since : monthStart;
  if (!since) return false;
  if (catalogFirst) props.setProperty('CATALOG_FROM', since);
  if (since < shiftKey_(today, -60)) since = shiftKey_(today, -60);
  startBackfill_(since, yest);
  return true;
}
/* The live and daily triggers exist (unless paused from the menu). */
function ensureTriggers_() {
  if (PropertiesService.getDocumentProperties().getProperty('TRIGGERS_PAUSED')) return;
  const have = ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction());
  if (have.indexOf('liveTick') >= 0 && have.indexOf('dailySync') >= 0) return;
  let every = cfgNum_('sync.live_minutes') || 15;
  every = [1, 5, 10, 15, 30].filter(v => v <= every).pop() || 15;
  if (have.indexOf('liveTick') < 0) ScriptApp.newTrigger('liveTick').timeBased().everyMinutes(every).create();
  if (have.indexOf('dailySync') < 0) ScriptApp.newTrigger('dailySync').timeBased().atHour(0).nearMinute(30).everyDays(1).inTimezone(tz_()).create();
}
function backfillStep() {
  const props = PropertiesService.getDocumentProperties();
  const st = JSON.parse(props.getProperty('BACKFILL') || 'null');
  const stopTrigger = () => ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'backfillStep').forEach(t => ScriptApp.deleteTrigger(t));
  if (!st) { stopTrigger(); return; }
  const start = Date.now();
  DEADLINE_ = start + 4.5 * 60000;
  // Meta is read outside the lock; the lock is held only while one piece is written, so a refresh never waits long.
  resetCaches_();
  const save = () => props.setProperty('BACKFILL', JSON.stringify(st));
  let busy = false;
  {
    while (st.done < st.units.length && Date.now() - start < 90000) {
      const u = st.units[st.done];
      // A piece that keeps dying (6-minute limit, Meta error) is split into single days, then skipped, never repeated forever.
      st.tries = (st.tries || 0) + 1; save();
      if (st.tries > 3) {
        st.tries = 0;
        if (u[1] < u[2]) {
          const days = [];
          for (let s = u[1]; s <= u[2]; s = shiftKey_(s, 1)) days.push([u[0], s, s]);
          st.units.splice(st.done, 1, ...days);
        } else { (st.skipped = st.skipped || []).push(u); st.done++; }
        save();
        continue;
      }
      try {
        const meta = fetchMetaAds_(u[1], u[2], u[0]), cat = syncCatalog_(u[1], u[2], u[0]);
        const w = tryLock_(() => {
          mergeRaw_(APP.T.ADS, ADS_HEADERS, meta.ads, u[1], u[2], meta.accounts, [0, 1, 2, 8], [2, 4, 6, 8]);
          mergeRaw_(APP.T.ACC_RAW, ACC_HEADERS, meta.acc, u[1], u[2], meta.accounts, [0, 1, 2], [2]);
          if (cat) mergeCatalog_(cat.rows, u[1], u[2], cat.keys);
          st.done++; st.tries = 0; save();
          setStatus_('BACKFILL', st.done + ' / ' + st.units.length + ' جزء' + (st.skipped ? ' (اتساب ' + st.skipped.length + ')' : ''));
          refreshAdMap_(meta.ads, {}, false);
        });
        if (w.skipped) { st.tries = Math.max((st.tries || 1) - 1, 0); save(); busy = true; break; } // busy: same piece next minute
      } catch (e) {
        setStatus_('BACKFILL', st.done + ' / ' + st.units.length + ' جزء — ✗ ' + u[1] + ' → ' + u[2] + ': ' + errText_(e));
        break;
      }
    }
  }
  if (busy || st.done < st.units.length || Date.now() - start > 3 * 60000) { tryLock_(() => writeHealth_()); return; }
  // Finish: TikTok tab, orders, links still missing, extensions, views.
  const r = tryLock_(() => {
    const tt = fetchTikTokTab_(st.since, st.until);
    mergeRaw_(APP.T.ADS, ADS_HEADERS, tt.ads, st.since, st.until, tt.accounts, [0, 1, 2, 8], [2, 4, 6, 8]);
    mergeRaw_(APP.T.ACC_RAW, ACC_HEADERS, tt.acc, st.since, st.until, tt.accounts, [0, 1, 2], [2]);
    refreshAdMap_(tt.ads, tt.links, false);
    st.finishing = true;
  });
  if (r.skipped || !st.finishing) return;
  try {
    syncOrders_();
    runLiveExt_();
    withLock_(() => rebuildViews_(slowViewsDue_()));
    props.deleteProperty('BACKFILL');
    const through = asKey_(props.getProperty('SYNCED_THROUGH') || ''), done = st.until < todayKey_() ? st.until : shiftKey_(todayKey_(), -1);
    if (!through || through < done) props.setProperty('SYNCED_THROUGH', done);
    stopTrigger();
    setStatus_('BACKFILL', 'خلص ✅');
    setStatus_('FULL', '✓ ' + st.since + ' → ' + st.until);
  } catch (e) { setStatus_('BACKFILL', '✗ ' + errText_(e) + ' — هيحاول تاني بعد دقيقة'); }
}
/* Every N minutes: orders, today's ads, views (Today takes the intraday snapshot). Skips quietly if another run is busy. */
function liveTick() {
  const start = Date.now(), took = [], step = (label, fn) => { const t = Date.now(); const v = fn(); took.push(label + ' ' + Math.round((Date.now() - t) / 1000) + 'ث'); return v; };
  DEADLINE_ = start + 4.5 * 60000;
  try {
    resetCaches_();
    step('أوردرات', () => syncOrders_());
    const today = todayKey_();
    step('Meta', () => syncAds_(today, today));
    if (timeLeft_()) step('إضافات', () => runLiveExt_());
    const r = step('تابات', () => tryLock_(() => rebuildViews_(slowViewsDue_())));
    setStatus_('LIVE', (r.skipped ? 'اتأجل (تحديث تاني شغال)' : '✓ OK') + ' — ' + took.join('، '));
    try { ensureTriggers_(); catchUpGap_(); } catch (e) { console.error('catch-up: ' + errText_(e)); }
  } catch (e) { setStatus_('LIVE', '✗ ' + errText_(e) + ' — ' + took.join('، ')); console.error(errText_(e)); }
}
function runLiveExt_() { EXT.live.forEach(f => { try { f(); } catch (e) { console.error('ext live: ' + errText_(e)); } }); }
function refreshNow() {
  try {
    liveTick();
    const live = getStatus_('LIVE'), bf = PropertiesService.getDocumentProperties().getProperty('BACKFILL');
    alert_((/اتأجل|✗/.test(live) ? 'التحديث ماكملش دلوقتي:\n' : 'اتحدثت أرقام النهارده ✅\n') + live +
      (bf ? '\n\nسحب الشهر شغال في الخلفية (' + getStatus_('BACKFILL') + '). Today بيتحدث لوحده كل 15 دقيقة، مش لازم تدوس تاني.' : ''));
    ss_().setActiveSheet(tab_(APP.T.TODAY));
  } catch (e) { alert_('التحديث ماكملش:\n' + errText_(e)); }
}

function installTriggers() {
  const names = ['liveTick', 'dailySync'];
  ScriptApp.getProjectTriggers().filter(t => names.indexOf(t.getHandlerFunction()) >= 0).forEach(t => ScriptApp.deleteTrigger(t));
  let every = cfgNum_('sync.live_minutes') || 15;
  every = [1, 5, 10, 15, 30].filter(v => v <= every).pop() || 15;
  ScriptApp.newTrigger('liveTick').timeBased().everyMinutes(every).create();
  ScriptApp.newTrigger('dailySync').timeBased().atHour(0).nearMinute(30).everyDays(1).inTimezone(tz_()).create();
  PropertiesService.getDocumentProperties().deleteProperty('TRIGGERS_PAUSED');
  alert_('التحديث التلقائي شغال ✅\nكل ' + every + ' دقيقة خلال اليوم، ومزامنة كاملة الساعة 12:30 بالليل.');
}
function pauseTriggers() {
  ScriptApp.getProjectTriggers().filter(t => ['liveTick', 'dailySync'].indexOf(t.getHandlerFunction()) >= 0).forEach(t => ScriptApp.deleteTrigger(t));
  PropertiesService.getDocumentProperties().setProperty('TRIGGERS_PAUSED', nowText_());
  alert_('التحديث التلقائي اتوقف ⏸');
}

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  const menu = ui.createMenu('Ads Sheet');
  menu
    .addItem('🔄 تحديث أرقام النهارده', 'refreshNow')
    .addItem('🔗 تحديث ربط الإعلانات بالمنتجات', 'refreshAdMapNow');
  EXT.menu.forEach(m => menu.addItem(m[0], m[1]));
  menu.addSeparator()
    .addSubMenu(ui.createMenu('الإعدادات')
      .addItem('إعداد الشيت (مرة واحدة)', 'setupAll')
      .addItem('ربط توكن Meta', 'metaConnect')
      .addItem('أول سحب (من أول الشهر)', 'backfill')
      .addItem('إيقاف أول سحب', 'stopBackfill')
      .addSeparator()
      .addItem('تشغيل التحديث التلقائي', 'installTriggers')
      .addItem('إيقاف التحديث التلقائي', 'pauseTriggers'))
    .addToUi();
}

function stopBackfill() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'backfillStep').forEach(t => ScriptApp.deleteTrigger(t));
  PropertiesService.getDocumentProperties().deleteProperty('BACKFILL');
  setStatus_('BACKFILL', 'اتوقف');
  alert_('أول سحب اتوقف ⏸');
}

/* ======== 10_stock.gs ======== */
/* Stock from the Shopify Flow stock tab (+ optional one-time product export), and new products → Products tab. Read-only on Shopify. */

let STOCK_ = null;
function readStock_() {
  if (STOCK_) return STOCK_;
  const out = { byHandle: {}, rows: 0, error: '' };
  try {
    const url = cfgStr_('stock.sheet_url') || cfgStr_('orders.sheet_url');
    const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if (!m) throw new Error('لينك شيت الستوك ناقص');
    const book = SpreadsheetApp.openById(m[1]);
    const variants = new Map();
    const put = (handle, title, variant, stock, price) => {
      handle = String(handle || '').trim().toLowerCase();
      if (!handle) return;
      variants.set(handle + '|' + norm_(variant || 'Default Title'), { handle: handle, title: String(title || '').trim(),
        stock: num_(stock), price: price === '' || price === null ? null : num_(price) });
    };
    // 1) Optional one-time Shopify products export (Products → Export → CSV, pasted as is).
    const init = book.getSheetByName(cfgStr_('stock.init_tab'));
    if (init && init.getLastRow() >= 2) {
      const v = init.getDataRange().getValues(), h = v[0].map(x => String(x).trim()), c = k => h.indexOf(k);
      const iH = c('Handle'), iT = c('Title'), iQ = c('Variant Inventory Qty'), iP = c('Variant Price');
      const opts = ['Option1 Value', 'Option2 Value', 'Option3 Value'].map(c);
      let lastTitle = {};
      v.slice(1).forEach(r => {
        const handle = iH >= 0 ? r[iH] : '';
        if (iT >= 0 && r[iT]) lastTitle[handle] = r[iT];
        if (iQ < 0 || r[iQ] === '') return;
        const variant = opts.filter(i => i >= 0 && r[i] !== '').map(i => String(r[i]).trim()).join(' / ');
        put(handle, lastTitle[handle] || '', variant, r[iQ], iP >= 0 ? r[iP] : '');
        out.rows++;
      });
    }
    // 2) Flow rows (newer rows win): Product ID | Variant ID | Product | Variant | SKU | Handle | Stock | Price
    const sh = book.getSheetByName(cfgStr_('stock.sheet_tab'));
    if (sh && sh.getLastRow() >= 2) {
      const v = sh.getDataRange().getValues(), h = v[0].map(x => String(x).trim()), c = k => h.indexOf(k);
      const iH = c('Handle'), iT = c('Product'), iV = c('Variant'), iQ = c('Stock'), iP = c('Price');
      if (iH < 0 || iQ < 0) throw new Error('تاب الستوك ناقص فيه عمود Handle أو Stock');
      v.slice(1).forEach(r => { put(r[iH], iT >= 0 ? r[iT] : '', iV >= 0 ? r[iV] : '', r[iQ], iP >= 0 ? r[iP] : ''); out.rows++; });
    }
    variants.forEach(x => {
      const p = out.byHandle[x.handle] = out.byHandle[x.handle] || { handle: x.handle, title: x.title, stock: 0, price: null };
      p.stock += Math.max(x.stock, 0);
      if (x.title) p.title = x.title;
      if (p.price === null && x.price) p.price = x.price;
    });
  } catch (e) { out.error = errText_(e); }
  STOCK_ = out;
  return out;
}

/* New stock handles → new rows in Products (never edits existing rows). */
function autoAddProducts_() {
  if (!cfgBool_('products.auto_add')) return 0;
  const st = readStock_();
  if (st.error) { setStatus_('STOCK', '✗ ' + st.error); return 0; }
  setStatus_('STOCK', '✓ ' + Object.keys(st.byHandle).length + ' منتج');
  return withLock_(() => {
    const sh = ensureTab_(APP.T.PRODUCTS, PRODUCT_HEADERS), have = readRows_(sh, PRODUCT_HEADERS.length);
    const slugs = new Set(), names = new Set();
    have.forEach(r => { String(r[2]).split(',').forEach(s => slugs.add(s.trim().toLowerCase())); names.add(norm_(r[0])); });
    const add = Object.keys(st.byHandle).map(k => st.byHandle[k])
      .filter(p => p.title && !slugs.has(p.handle) && !names.has(norm_(p.title)))
      .map(p => [p.title, '', p.handle, '', p.title, p.price === null ? '' : p.price, '', '', '', '', '', true]);
    if (add.length) sh.getRange(sh.getLastRow() + 1, 1, add.length, PRODUCT_HEADERS.length).setValues(add);
    resetCaches_();
    return add.length;
  });
}

/* ======== 11_active_ads.gs ======== */
/* Running now: products with at least one ACTIVE Meta ad. Read-only on Meta. */

function refreshActive_() {
  const accs = accounts_('META');
  if (!accs.length) return;
  const idx = adMapIndex_(), catAds = catalogAdIds_(), out = {};
  accs.forEach(acc => {
    metaAll_('act_' + acc.id + '/ads', { fields: 'id', effective_status: JSON.stringify(['ACTIVE']) }).forEach(a => {
      const m = idx.get(adKey_('META', String(a.id), '', '', ''));
      const p = catAds.has('META|' + String(a.id)) ? APP.CATALOG : m ? m.product : APP.UNMAPPED;
      out[p] = (out[p] || 0) + 1;
    });
  });
  PropertiesService.getDocumentProperties().setProperty('ACTIVE_PRODUCTS', JSON.stringify(out));
  setStatus_('ACTIVE', '✓ ' + Object.keys(out).reduce((s, k) => s + out[k], 0) + ' إعلان شغال');
}
function activeMap_() {
  try { return JSON.parse(PropertiesService.getDocumentProperties().getProperty('ACTIVE_PRODUCTS') || '{}'); } catch (e) { return {}; }
}

/* ======== 12_products_tab.gs ======== */
/* ---------- Units sold from Shopify line items "Title x2 | Title2 x1" ---------- */
function lineItems_(raw) {
  return String(raw || '').split(/\s\|\s|\r?\n/).map(s => s.trim()).filter(Boolean).map(s => {
    const m = s.match(/^(.*?)\s+x\s*(\d+)\s*$/i);
    return m ? { title: m[1].trim(), qty: Number(m[2]) } : { title: s, qty: 1 };
  });
}
function productNameOf_(title) {
  const n = norm_(title), p = products_().find(x => norm_(x.name) === n || x.aliases.indexOf(n) >= 0);
  return p ? p.name : String(title).trim();
}

/* ---------- Tab: المنتجات ---------- */
const XP_HEADERS = ['شغال', 'المنتج', 'الستوك', 'الستوك يكفي كام يوم', 'قطع اتباعت', 'أوردرات فيها المنتج', 'الصرف',
  'منه مش متأكد', 'أوردرات (المنتج أول قطعة)', 'تكلفة الأوردر + الضريبة', 'المبيعات', 'ROAS الفعلي', 'AOV',
  'نقطة التعادل', 'الإشارة', 'إعلانات Meta شغالة', 'ملاحظة'];

function writeProductsTab_() {
  const sh = ensureTab_(X.PRODUCTS);
  sh.getRange('A1:A3').setValues([['المنتجات — من الأكتر مبيعًا للأقل'], ['من'], ['إلى']]);
  sh.getRange('A1').setFontWeight('bold').setFontSize(13);
  sh.getRange('B2:B3').setNumberFormat('@').setBackground('#fff2cc');
  const p = periodFromCells_(sh), today = todayKey_(), week = shiftKey_(today, -6);
  const daily = dailyRows_(), sum = summarize_(daily, p.from, p.to), tkRecent = {};
  daily.forEach(r => { if (r[1] === 'TIKTOK' && r[0] >= shiftKey_(today, -1) && num_(r[3]) > 0) tkRecent[r[2]] = true; });
  const st = readStock_(), active = activeMap_(), prods = products_(), lowDays = cfgNum_('stock.low_days') || 7;

  // Units and orders per product from Orders Raw.
  const units = {}, ordersWith = {}, units7 = {};
  const osh = ss_().getSheetByName(APP.T.ORDERS);
  if (osh) readRows_(osh, ORDERS_HEADERS.length).forEach(o => {
    const d = asKey_(o[2]);
    if (!d) return;
    const seen = new Set();
    lineItems_(o[6]).forEach(li => {
      const n = productNameOf_(li.title);
      if (d >= p.from && d <= p.to) { units[n] = (units[n] || 0) + li.qty; if (!seen.has(n)) { ordersWith[n] = (ordersWith[n] || 0) + 1; seen.add(n); } }
      if (d >= week && d <= today) units7[n] = (units7[n] || 0) + li.qty;
    });
  });

  // Stock per product name (by handle → Products slug, else title).
  const stockOf = {};
  Object.keys(st.byHandle).forEach(h => {
    const s = st.byHandle[h], pr = prods.find(x => x.slugs.indexOf(h) >= 0), n = pr ? pr.name : productNameOf_(s.title);
    stockOf[n] = (stockOf[n] || 0) + s.stock;
  });

  const special = [APP.MULTI, APP.UNMAPPED, APP.UNKNOWN_PRODUCT];
  const names = new Set(prods.map(x => x.name).concat(Object.keys(units), Object.keys(stockOf),
    Object.keys(sum.byProduct).filter(n => special.indexOf(n) < 0)));
  const z = { spend: 0, notExact: 0, orders: 0, revenue: 0 };
  const rows = Array.from(names).filter(n => special.indexOf(n) < 0).map(n => {
    const t = sum.byProduct[n] || z, pr = prods.find(x => x.name === n), be = breakEven_(pr), miss = missingFor_(pr);
    const running = (active[n] || 0) > 0 || !!tkRecent[n];
    const stock = stockOf[n] === undefined ? '' : stockOf[n], perDay = (units7[n] || 0) / 7;
    let days = '';
    if (stock !== '') days = stock <= 0 ? 'نفد' : perDay > 0 ? Math.floor(stock / perDay) : '—';
    const notes = [];
    if (stock === '') notes.push('مش لاقي ستوك');
    else if (days === 'نفد') notes.push('⛔ الستوك خلص');
    else if (typeof days === 'number' && days < lowDays) notes.push('⚠️ الستوك قليل');
    if (running && stock !== '' && stock <= 0) notes.push('إعلان شغال على منتج خلص');
    if (miss.length) notes.push('ناقص: ' + miss.join('، '));
    return [running ? '✅' : '', n, stock, days, units[n] || 0, ordersWith[n] || 0, round2_(t.spend), round2_(t.notExact), t.orders,
      cpp_(t), round2_(t.revenue), roas_(t), aov_(t), be === null ? '' : round2_(be), signal_(be, t), active[n] || '', notes.join(' — ')];
  }).sort((a, b) => (b[4] - a[4]) || (b[6] - a[6]));
  special.forEach(n => {
    const t = sum.byProduct[n];
    if (t && (t.spend > 0 || t.orders > 0)) rows.push([(active[n] || 0) > 0 ? '✅' : '', n, '', '', '', '', round2_(t.spend), round2_(t.notExact),
      t.orders, '', round2_(t.revenue), '', '', '', '', active[n] || '', '']);
  });
  sh.getRange('C2:D3').setValues([['الستوك', st.error ? '✗ ' + st.error : '✓ ' + Object.keys(st.byHandle).length + ' منتج'],
    ['الإعلانات الشغالة', getStatus_('ACTIVE')]]);
  writeBlocks_(sh, 5, [{ title: 'المنتجات من ' + p.from + ' لـ ' + p.to + ' (✅ = عليه إعلان شغال دلوقتي)', headers: XP_HEADERS, rows: rows }], XP_HEADERS.length);
  const n = Math.max(rows.length, 1), colA = sh.getRange(7, 1, n, 1), colD = sh.getRange(7, 4, n, 1);
  sh.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('✅').setBackground('#b7e1cd').setRanges([colA]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('نفد').setBackground('#f4c7c3').setRanges([colD]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenNumberLessThan(lowDays).setBackground('#fff4ce').setRanges([colD]).build()
  ]);
  sh.setFrozenRows(6);
}

/* ======== 13_accounts_be.gs ======== */
/* ---------- Tab: تعادل الحسابات ---------- */
function beRoas_(aov) {
  const manual = cfgNum_('be.roas');
  if (manual) return { v: manual, src: 'مكتوبة يدوي في Settings' };
  const cogs = cfgNum_('costs.cogs_pct'), ship = cfgNum_('costs.shipping'), other = cfgNum_('costs.other') || 0;
  const c = cfgNum_('rates.confirm'), d = cfgNum_('rates.delivery');
  if (cogs === null || ship === null || c === null || d === null || !aov) return { v: null, src: 'ناقص: be.roas أو (costs.cogs_pct + costs.shipping + rates.confirm + rates.delivery)' };
  const profit = c * (d * aov * (1 - cogs) - ship - other);
  if (profit <= 0) return { v: null, src: 'خسران حتى من غير إعلانات بالتكاليف دي' };
  return { v: round2_(aov * (1 + taxRate_()) / profit), src: 'محسوبة من التكاليف ومتوسط الأوردر' };
}

function writeAccountsBE_() {
  const sh = ensureTab_(X.ACC_BE);
  sh.getRange('A1:A2').setValues([['تعادل كل حساب يوم بيوم'], ['الشهر (yyyy-MM)']]);
  sh.getRange('A1').setFontWeight('bold').setFontSize(13);
  sh.getRange('B2').setNumberFormat('@').setBackground('#fff2cc');
  let month = String(sh.getRange('B2').getDisplayValue() || '').trim();
  if (!/^\d{4}-\d{2}$/.test(month)) { month = todayKey_().slice(0, 7); sh.getRange('B2').setValue(month); }
  const pm = month.split('-').map(Number), days = new Date(Date.UTC(pm[0], pm[1], 0)).getUTCDate();
  const from = month + '-01', to = month + '-' + String(days).padStart(2, '0'), tax = taxRate_();

  // Accounts: Accounts tab + anything that spent.
  const accs = new Map();
  accounts_().forEach(a => accs.set(a.platform + '|' + a.id, { key: a.platform + '|' + a.id, platform: a.platform, name: a.name || a.id, purpose: a.purpose }));
  const cell = {}, add = (k, d, f, v) => { const c = cell[k + '|' + d] = cell[k + '|' + d] || { spend: 0, pixel: 0, pval: 0, orders: 0, revenue: 0 }; c[f] += v; };
  readRows_(tab_(APP.T.ADS), ADS_HEADERS.length).forEach(a => {
    const d = asKey_(a[0]);
    if (d < from || d > to) return;
    const k = a[1] + '|' + String(a[2]);
    if (!accs.has(k)) accs.set(k, { key: k, platform: a[1], name: a[3] || a[2], purpose: '' });
    add(k, d, 'spend', num_(a[10])); add(k, d, 'pixel', num_(a[13])); add(k, d, 'pval', num_(a[14]));
  });
  // Orders → account: Ad ID in UTM (exact) → Ad Map account; else the only account of that platform; else "مش معروف الحساب".
  const adAcc = {}, am = ss_().getSheetByName(APP.T.ADMAP);
  if (am) readRows_(am, ADMAP_HEADERS.length).forEach(r => { if (r[AM.ID]) adAcc[String(r[AM.ID])] = r[AM.PLAT] + '|' + String(r[AM.ACC]); });
  const byPlat = {};
  accs.forEach(a => { (byPlat[a.platform] = byPlat[a.platform] || []).push(a.key); });
  let storeOrders = 0, storeRev = 0, attributed = 0;
  const osh = ss_().getSheetByName(APP.T.ORDERS);
  if (osh) readRows_(osh, ORDERS_HEADERS.length).forEach(o => {
    const d = asKey_(o[2]);
    if (d < from || d > to) return;
    storeOrders++; storeRev += num_(o[7]);
    let k = o[14] ? adAcc[String(o[14])] : '';
    if (!k && byPlat[o[3]] && byPlat[o[3]].length === 1) k = byPlat[o[3]][0];
    if (!k && (o[3] === 'META' || o[3] === 'TIKTOK')) k = o[3] + '|?';
    if (!k) return;
    if (!accs.has(k)) accs.set(k, { key: k, platform: o[3], name: o[3] + ' — مش معروف الحساب', purpose: '' });
    attributed++;
    add(k, d, 'orders', 1); add(k, d, 'revenue', num_(o[7]));
  });

  const tot = (k, a, b) => {
    const t = { spend: 0, pixel: 0, pval: 0, orders: 0, revenue: 0 };
    for (let d = a; d <= b; d++) {
      const c = cell[k + '|' + month + '-' + String(d).padStart(2, '0')];
      if (c) Object.keys(t).forEach(f => { t[f] += c[f]; });
    }
    return t;
  };
  const be = beRoas_(storeOrders ? storeRev / storeOrders : 0);
  const line = (label, t, useReal) => {
    const pr = t.spend ? round2_(t.pval / t.spend) : '', rr = t.spend ? round2_(t.revenue / t.spend) : '';
    const roas = useReal ? rr : pr;
    let status = '';
    if (t.spend > 0) status = be.v === null ? 'ناقص نقطة التعادل' : roas === '' ? '' :
      roas >= be.v ? '✅ فوق التعادل' : roas >= be.v * 0.8 ? '⚠️ قريب من التعادل' : '🔻 تحت التعادل';
    if (status && !useReal) status += ' (بيكسل)';
    return [label, round2_(t.spend), round2_(t.spend * (1 + tax)), t.pixel, pr, t.orders, round2_(t.revenue), rr,
      t.orders ? round2_(t.revenue / t.orders) : '', t.orders ? round2_(t.spend * (1 + tax) / t.orders) : '', be.v === null ? '' : be.v, status];
  };
  const H = ['اليوم', 'الصرف', 'الصرف + الضريبة', 'مشتريات البيكسل', 'ROAS البيكسل', 'أوردرات الموقع (UTM)', 'مبيعات (UTM)',
    'ROAS الفعلي', 'AOV', 'تكلفة الأوردر + الضريبة', 'نقطة التعادل ROAS', 'الحالة'];
  const list = Array.from(accs.values()).sort((a, b) => tot(b.key, 1, days).spend - tot(a.key, 1, days).spend);
  const summary = list.map(a => {
    const t = tot(a.key, 1, days);
    return line(a.name + (a.purpose ? ' — ' + a.purpose : ''), t, t.orders > 0);
  });
  const all = { spend: 0, pixel: 0, pval: 0, orders: storeOrders, revenue: storeRev };
  list.forEach(a => { const t = tot(a.key, 1, days); all.spend += t.spend; all.pixel += t.pixel; all.pval += t.pval; });
  summary.push(line('المتجر كله (كل الأوردرات)', all, true));
  const blocks = [
    { title: 'نقطة التعادل: ' + (be.v === null ? '—' : be.v) + '  (' + be.src + ')  |  أوردرات الشهر المربوطة بحساب: ' + attributed + ' من ' + storeOrders +
      (storeOrders ? ' (' + Math.round(attributed / storeOrders * 100) + '%)' : ''), headers: null, rows: [] },
    { title: 'ملخص الشهر لكل حساب', headers: ['الحساب'].concat(H.slice(1)), rows: summary }
  ];
  const weeks = [[1, 7], [8, 14], [15, 21], [22, 28], [29, days]];
  list.forEach(a => {
    if (tot(a.key, 1, days).spend <= 0 && tot(a.key, 1, days).orders <= 0) return;
    const useReal = tot(a.key, 1, days).orders > 0, rows = [];
    weeks.forEach((w, i) => {
      if (w[0] > days) return;
      for (let d = w[0]; d <= w[1]; d++) rows.push(line(month + '-' + String(d).padStart(2, '0'), tot(a.key, d, d), useReal));
      rows.push(line('إجمالي الأسبوع ' + (i + 1), tot(a.key, w[0], w[1]), useReal));
    });
    rows.push(line('إجمالي الشهر', tot(a.key, 1, days), useReal));
    blocks.push({ title: a.name + (useReal ? '' : ' — مفيش أوردرات مربوطة بالحساب ده لسه، الحالة من البيكسل'), headers: H, rows: rows });
  });
  writeBlocks_(sh, 4, blocks, H.length);
  const lr = Math.max(sh.getLastRow() - 3, 1), stCol = sh.getRange(4, 12, lr, 1);
  sh.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenTextStartsWith('✅').setBackground('#e6f4ea').setRanges([stCol]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextStartsWith('⚠️').setBackground('#fff4ce').setRanges([stCol]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextStartsWith('🔻').setBackground('#fce8e6').setRanges([stCol]).build()
  ]);
}

/* ======== 15_catalog.gs ======== */
/*
 * Products of catalog and Advantage+ ads. Meta reports their spend per product shown (insights breakdown product_id:
 * "<id>, <product title>" or "<id>, <title> - <variant>"). Catalog Raw keeps that split per ad per day, and the
 * Daily Log puts each part on its product; whatever Meta doesn't split stays on the ad's own product (Ad Map).
 * Products are named by their Shopify title, the same name orders carry, so spend and orders meet on one row.
 */
const CATALOG_HEADERS = ['Date', 'Platform', 'Account ID', 'Ad ID', 'Product', 'Spend', 'Purchases', 'Purchase value'];
const CATALOG = { MIN_SPEND: 5, OTHER: 'منتجات تانية من الكتالوج (صرف صغير)' };

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

/* ======== 20_today.gs ======== */
/*
 * Today tab = Daily Ad Closing, same shape as House of Beauty's Daily Closing, without the 14% add-on.
 * Left (A:F): one row per ad account, platform totals, grand total. Account rows = platform numbers
 * (Meta / TikTok purchases), total rows = store orders by UTM. ROAS = sales ÷ spend.
 * Right (H:P): 3-hour snapshots, Meta benchmark vs today, product performance today and this month.
 * The tab is redrawn from scratch on every update; nothing is typed in it by hand.
 */
const TODAY = {
  GAP_COL: 7, RIGHT_COL: 8, WIDTH: 16,
  DARK: '#1f2937', YELLOW: '#fff200', META: '#1d4ed8', TIKTOK: '#111111', META_TOTAL: '#dbe8fb', TT_TOTAL: '#e0e0e0',
  GRAND: '#00ff00', LABEL: '#f3f4f6', METRIC: '#e8f0fe', AVG: '#e8eefc', SPECIAL: '#fde8e8', TOTAL: '#e8eefc',
  GREEN: '#d9ead3', RED: '#f4cccc', OTHER: '#f3f4f6', CATALOG: '#fff2cc',
  MONEY: '#,##0.00', COUNT: '0', RATIO: '0.00', PCT: '0.00%',
  FUNNEL_KEY: 'TODAY_FUNNEL', AVG_KEY: 'TODAY_FUNNEL_AVG', AVG_DAYS: 60, AVG_VERSION: 2,
  FIELDS: 'spend,impressions,clicks,inline_link_clicks,actions,action_values',
  /* [Metric, numerator, denominator, times, format (money | pct | ratio), lower is better?].
   * House of Beauty's benchmark + ROAS and AOV on top + add to cart and checkout rates. */
  METRICS: [
    ['ROAS', 'purchaseValue', 'spend', 1, 'ratio', false],
    ['AOV', 'purchaseValue', 'purchases', 1, 'money', false],
    ['CPM', 'spend', 'impressions', 1000, 'money', true],
    ['CPC (all)', 'spend', 'clicks', 1, 'money', true],
    ['CTR (all)', 'clicks', 'impressions', 1, 'pct', false],
    ['CTR (link)', 'linkClicks', 'impressions', 1, 'pct', false],
    ['CPC (link)', 'spend', 'linkClicks', 1, 'money', true],
    ['CVR', 'purchases', 'linkClicks', 1, 'pct', false],
    ['Cost per content view', 'spend', 'contentViews', 1, 'money', true],
    ['Cost per LPV', 'spend', 'landingViews', 1, 'money', true],
    ['Cost per purchase', 'spend', 'purchases', 1, 'money', true],
    ['Link click → LPV', 'landingViews', 'linkClicks', 1, 'pct', false],
    ['LPV → Purchase', 'purchases', 'landingViews', 1, 'pct', false],
    ['Content view → ATC', 'addsToCart', 'contentViews', 1, 'pct', false],
    ['ATC → Checkout', 'checkouts', 'addsToCart', 1, 'pct', false]
  ]
};

/* ---------- Meta funnel for the benchmark (live hook, outside the lock) ---------- */

/* Insights rows → raw counts. Purchases = the same type as the ORDERS column (meta.purchase_actions). */
function funnelRaw_(rows) {
  const sum = k => rows.reduce((n, r) => n + num_(r[k]), 0);
  const action = types => rows.reduce((n, r) => {
    for (const t of types) { const a = (r.actions || []).find(x => x.action_type === t); if (a) return n + num_(a.value); }
    return n;
  }, 0);
  return { spend: sum('spend'), impressions: sum('impressions'), clicks: sum('clicks'), linkClicks: sum('inline_link_clicks'),
    landingViews: action(['landing_page_view', 'omni_landing_page_view']),
    contentViews: action(['offsite_conversion.fb_pixel_view_content', 'view_content', 'omni_view_content']),
    addsToCart: action(['offsite_conversion.fb_pixel_add_to_cart', 'add_to_cart', 'omni_add_to_cart']),
    checkouts: action(['offsite_conversion.fb_pixel_initiate_checkout', 'initiate_checkout', 'omni_initiated_checkout']),
    purchases: rows.reduce((n, r) => n + metaPick_(r.actions), 0),
    purchaseValue: rows.reduce((n, r) => n + metaPick_(r.action_values), 0) };
}
function funnelAdd_(a, b) { const out = Object.assign({}, a); Object.keys(b).forEach(k => { out[k] = (out[k] || 0) + b[k]; }); return out; }

/*
 * Today's funnel per Meta account (every update), and the average of the last 60 days before today
 * for all Meta accounts together (once a day). Stored in document properties for writeToday_.
 */
function refreshTodayFunnel_() {
  const accs = accounts_('META');
  if (!accs.length) return;
  const props = PropertiesService.getDocumentProperties(), today = todayKey_();
  const range = (a, b) => JSON.stringify({ since: a, until: b });
  let avg = null;
  try { avg = JSON.parse(props.getProperty(TODAY.AVG_KEY) || 'null'); } catch (e) { avg = null; }
  const from = shiftKey_(today, -TODAY.AVG_DAYS), to = shiftKey_(today, -1);
  const needAvg = !avg || avg.day !== today || avg.from !== from || avg.v !== TODAY.AVG_VERSION; // new day, days or metrics changed
  const out = { day: today, accounts: [] };
  let total = {}, avgOk = true;
  accs.forEach(acc => {
    const row = { id: acc.id, name: acc.name || acc.id };
    try {
      row.raw = funnelRaw_(metaAll_('act_' + acc.id + '/insights', { level: 'account', time_range: range(today, today), fields: TODAY.FIELDS }));
      if (needAvg) total = funnelAdd_(total, funnelRaw_(metaAll_('act_' + acc.id + '/insights',
        { level: 'account', time_range: range(from, to), fields: TODAY.FIELDS })));
    } catch (e) { row.error = errText_(e); avgOk = false; }
    out.accounts.push(row);
  });
  if (needAvg && avgOk) props.setProperty(TODAY.AVG_KEY, JSON.stringify({ day: today, from: from, to: to, v: TODAY.AVG_VERSION, raw: total }));
  props.setProperty(TODAY.FUNNEL_KEY, JSON.stringify(out));
}
function todayFunnel_() {
  const props = PropertiesService.getDocumentProperties(), read = k => { try { return JSON.parse(props.getProperty(k) || 'null'); } catch (e) { return null; } };
  return { today: read(TODAY.FUNNEL_KEY), avg: read(TODAY.AVG_KEY) };
}
function funnelRatio_(raw, m) {
  return raw && raw[m[2]] > 0 ? raw[m[1]] / raw[m[2]] * m[3] : '';
}

/* ---------- Drawing ---------- */

/* An in-memory page: cells with value / background / font color / bold / number format, plus merges. */
function todayGrid_() {
  const g = { rows: [], merges: [] };
  g.cell = (r, c) => {
    while (g.rows.length < r) g.rows.push([]);
    const line = g.rows[r - 1];
    if (!line[c - 1]) line[c - 1] = { v: '', bg: null, fc: '#000000', b: 'normal', nf: 'General', al: 'left' };
    return line[c - 1];
  };
  g.set = (r, c, v, style) => Object.assign(g.cell(r, c), { v: v === null || v === undefined ? '' : v }, style || {});
  g.fill = (r, c, n, style) => { for (let i = 0; i < n; i++) Object.assign(g.cell(r, c + i), style); };
  g.merge = (r, c, rows, cols) => { g.merges.push([r, c, rows, cols]); };
  return g;
}

function writeGrid_(sh, g) {
  const R = Math.max(g.rows.length, 1), W = TODAY.WIDTH;
  const old = Math.max(sh.getLastRow(), R);
  if (R > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), R - sh.getMaxRows());
  if (sh.getMaxColumns() < W) sh.insertColumnsAfter(sh.getMaxColumns(), W - sh.getMaxColumns());
  const all = sh.getRange(1, 1, old, Math.max(W, sh.getLastColumn()));
  all.breakApart(); all.clear();
  sh.setConditionalFormatRules([]);
  const pick = k => { const out = []; for (let r = 0; r < R; r++) { const line = []; for (let c = 0; c < W; c++) { const x = (g.rows[r] || [])[c]; line.push(x ? x[k] : (k === 'v' ? '' : k === 'fc' ? '#000000' : k === 'b' ? 'normal' : k === 'nf' ? 'General' : k === 'al' ? 'left' : null)); } out.push(line); } return out; };
  const rng = sh.getRange(1, 1, R, W);
  rng.setNumberFormats(pick('nf')).setValues(pick('v')).setBackgrounds(pick('bg')).setFontColors(pick('fc'))
    .setFontWeights(pick('b')).setHorizontalAlignments(pick('al'));
  g.merges.forEach(m => sh.getRange(m[0], m[1], m[2], m[3]).merge());
}

/* Title bar + yellow header row. Returns the first data row. */
function todayHead_(g, r, c, width, title, headers) {
  g.set(r, c, title, { bg: TODAY.DARK, fc: '#ffffff', b: 'bold', al: 'center' });
  g.fill(r, c + 1, width - 1, { bg: TODAY.DARK });
  g.merge(r, c, 1, width);
  headers.forEach((h, i) => g.set(r + 1, c + i, h, { bg: TODAY.YELLOW, b: 'bold', al: 'center' }));
  return r + 2;
}

function ratioOrBlank_(a, b, digits) { return b > 0 ? Math.round(a / b * Math.pow(10, digits)) / Math.pow(10, digits) : ''; }

/* Spend, platform purchases and purchase value per account today, from Ads Raw. */
function todayAccounts_(today) {
  const rows = { META: new Map(), TIKTOK: new Map() };
  ['META', 'TIKTOK'].forEach(p => accounts_(p).forEach(a => rows[p].set(a.id, { id: a.id, name: a.name || a.id, spend: 0, orders: 0, value: 0 })));
  readRows_(tab_(APP.T.ADS), ADS_HEADERS.length).forEach(a => {
    if (asKey_(a[0]) !== today || !rows[a[1]]) return;
    const id = String(a[2]), m = rows[a[1]];
    if (!m.has(id)) m.set(id, { id: id, name: a[3] || id, spend: 0, orders: 0, value: 0 });
    const x = m.get(id);
    x.spend += num_(a[10]); x.orders += num_(a[13]); x.value += num_(a[14]);
  });
  return { META: Array.from(rows.META.values()), TIKTOK: Array.from(rows.TIKTOK.values()) };
}

/* Left side: the Daily Ad Closing table. */
function todayClosing_(g, today, sum, rows) {
  const S = TODAY, pixel = cfgStr_('orders.method') === 'pixel';
  g.set(1, 1, (cfgStr_('business.name') || 'ADS').toUpperCase() + ' — DAILY AD CLOSING', { bg: S.DARK, fc: '#ffffff', b: 'bold', al: 'center' });
  g.fill(1, 2, 5, { bg: S.DARK });
  g.merge(1, 1, 1, 6);
  const p = today.split('-').map(Number), shown = Utilities.formatDate(new Date(Date.UTC(p[0], p[1] - 1, p[2], 12)), 'UTC', 'dd-MMM-yyyy');
  [['Closing Date', shown], ['Status', 'LIVE — بيتحدث لوحده'], ['Last Update', nowText_()],
    ['Orders Source', pixel ? '⚠️ مشتريات البيكسل (مش أوردرات حقيقية)' : 'Shopify (UTM)']].forEach((x, i) => {
    g.set(3 + i, 1, x[0], { bg: S.LABEL, b: 'bold' });
    g.set(3 + i, 2, x[1], { al: 'right' });
  });
  const totalNote = '(ACCOUNT: PLATFORM / TOTAL: UTMs)';
  let r = 8;
  ['PLATFORM', 'AD ACCOUNT NAME', 'AMOUNT SPENT', 'ORDERS ' + totalNote, 'CPP ' + totalNote, 'ROAS ' + totalNote]
    .forEach((h, i) => g.set(r, 1 + i, h, { bg: S.YELLOW, b: 'bold', al: 'center' }));
  r++;
  const accs = todayAccounts_(today);
  const line = (row, name, spend, orders, value, style, hasValue) => {
    g.set(row, 2, name, style);
    g.set(row, 3, Math.round(spend * 100) / 100, Object.assign({ nf: S.MONEY, al: 'right' }, style));
    g.set(row, 4, orders, Object.assign({ nf: S.COUNT, al: 'right' }, style));
    g.set(row, 5, ratioOrBlank_(spend, orders, 2), Object.assign({ nf: S.MONEY, al: 'right' }, style, style.bg ? {} : { bg: S.METRIC }));
    g.set(row, 6, hasValue ? ratioOrBlank_(value, spend, 2) : '', Object.assign({ nf: S.RATIO, al: 'right' }, style, style.bg ? {} : { bg: S.METRIC }));
  };
  const platform = (label, color, list, totalLabel, totalStyle, key) => {
    const first = r, items = list.length ? list : [{ name: '', spend: 0, orders: 0, value: 0 }];
    items.forEach(a => { line(r, a.name, a.spend, a.orders, a.value, {}, key === 'META'); r++; });
    g.set(first, 1, label, { bg: color, fc: '#ffffff', b: 'bold', al: 'center' });
    for (let i = first + 1; i < r; i++) g.cell(i, 1).bg = color;
    if (items.length > 1) g.merge(first, 1, items.length, 1);
    const t = sum.byPlatform[key] || { spend: 0, orders: 0, revenue: 0 };
    g.set(r, 1, totalLabel, totalStyle);
    line(r, '', t.spend, t.orders, t.revenue, totalStyle, true);
    r++;
  };
  platform('META', S.META, accs.META, 'META TOTAL', { bg: S.META_TOTAL, b: 'bold', fc: '#1d4ed8' }, 'META');
  platform('TIKTOK', S.TIKTOK, accs.TIKTOK, 'TIKTOK TOTAL', { bg: S.TT_TOTAL, b: 'bold' }, 'TIKTOK');
  // Store orders with no ad source: no spend, so orders only. NO SOURCE shows only when some orders carry no data at all.
  // META OUT: orders from a Meta ad account that isn't in the sheet (no spend here), named by what they bought.
  const out = {};
  rows.forEach(x => { if (x[0] === today && x[1] === APP.META_OUT) out[x[2]] = (out[x[2]] || 0) + num_(x[8]); });
  const outNames = Object.keys(out).sort((a, b) => out[b] - out[a]).slice(0, 2).join(' / ');
  [[APP.META_OUT, 'META (حساب مش معانا)', 'من غير صرف: ' + outNames], [APP.DIRECT, 'DIRECT', 'دخول مباشر للموقع'],
    [APP.MANUAL, 'MANUAL (DRAFT)', 'أوردرات يدوي'], [APP.UNKNOWN_PLATFORM, 'NO SOURCE', 'من غير بيانات مصدر']].forEach(x => {
    const t = sum.byPlatform[x[0]] || { orders: 0 };
    if ((x[0] === APP.UNKNOWN_PLATFORM || x[0] === APP.META_OUT) && !t.orders) return;
    const style = { bg: S.OTHER };
    g.set(r, 1, x[1], { bg: S.OTHER, b: 'bold' });
    g.set(r, 2, x[2], style);
    g.set(r, 3, '', style);
    g.set(r, 4, t.orders, Object.assign({ nf: S.COUNT, al: 'right' }, style));
    g.set(r, 5, '', style); g.set(r, 6, '', style);
    r++;
  });
  const grand = { bg: S.GRAND, b: 'bold' };
  g.set(r, 1, 'GRAND TOTAL', grand);
  line(r, '', sum.total.spend, sum.total.orders, sum.total.revenue, grand, true);
  return r;
}

/* 3-hour snapshots: spend and orders of the day so far at each hour in intraday.hours. */
function todaySlots_(g, r, today) {
  const S = TODAY, c = S.RIGHT_COL;
  r = todayHead_(g, r, c, 9, '3-HOUR PERFORMANCE CHECK — DAY TO DATE', ['TIME', 'META SPEND', 'META ORDERS', 'META CPP', 'META ROAS',
    'TIKTOK SPEND', 'TIKTOK ORDERS', 'TIKTOK CPP', 'TIKTOK ROAS']);
  const snaps = {}, intra = ss_().getSheetByName(APP.T.INTRA);
  if (intra) readRows_(intra, INTRA_HEADERS.length).forEach(x => {
    if (asKey_(x[0]) === today) snaps[String(x[1]) + '|' + x[2]] = { spend: num_(x[3]), orders: num_(x[4]), revenue: x[6] === '' ? null : num_(x[6]) };
  });
  cfgList_('intraday.hours').map(Number).forEach(h => {
    const slot = (h === 0 ? 24 : h) + ':00', label = (h % 12 === 0 ? 12 : h % 12) + ':00 ' + (h > 0 && h < 12 ? 'AM' : h === 12 ? 'PM' : h === 0 ? 'AM' : 'PM');
    g.set(r, c, label, { b: 'bold', al: 'center' });
    ['META', 'TIKTOK'].forEach((p, i) => {
      const s = snaps[slot + '|' + p] || (snaps[slot + '|الإجمالي'] ? { spend: 0, orders: 0, revenue: 0 } : null), at = c + 1 + i * 4;
      if (!s) return;
      g.set(r, at, Math.round(s.spend * 100) / 100, { nf: S.MONEY, al: 'right' });
      g.set(r, at + 1, s.orders, { nf: S.COUNT, al: 'right' });
      g.set(r, at + 2, ratioOrBlank_(s.spend, s.orders, 2), { nf: S.MONEY, al: 'right' });
      g.set(r, at + 3, s.revenue === null ? '' : ratioOrBlank_(s.revenue, s.spend, 2), { nf: S.RATIO, al: 'right' });
    });
    r++;
  });
  return r;
}

/* Meta benchmark: your last-60-days average vs each Meta account today. Worse = red, better = green. */
function todayBenchmark_(g, r, today, shown) {
  const S = TODAY, c = S.RIGHT_COL, f = todayFunnel_(), accs = (f.today && f.today.day === today ? f.today.accounts : [])
    .concat(accounts_('META').filter(a => !(f.today && f.today.day === today && f.today.accounts.some(x => x.id === a.id)))
      .map(a => ({ id: a.id, name: a.name || a.id })));
  const avg = f.avg && f.avg.raw ? f.avg.raw : null, width = Math.max(2 + accs.length, 2);
  r = todayHead_(g, r, c, width, 'META BENCHMARK vs TODAY | ' + shown,
    ['METRIC', 'AVERAGE (LAST ' + S.AVG_DAYS + ' DAYS)'].concat(accs.map(a => (a.error ? '⚠️ ' : '') + a.name)));
  S.METRICS.forEach(m => {
    const base = funnelRatio_(avg, m), nf = { money: S.MONEY, pct: S.PCT, ratio: S.RATIO }[m[4]];
    g.set(r, c, m[0], { b: 'bold' });
    g.set(r, c + 1, base === '' ? '—' : base, { nf: nf, bg: S.AVG, al: 'center' });
    accs.forEach((a, i) => {
      const v = funnelRatio_(a.raw, m);
      let bg = null;
      if (v !== '' && base !== '' && v !== base) bg = (m[5] ? v < base : v > base) ? S.GREEN : S.RED;
      g.set(r, c + 2 + i, v === '' ? '—' : v, { nf: nf, bg: bg, al: 'center' });
    });
    r++;
  });
  return r;
}

/*
 * Product performance (Meta): spend from Ad Map and the catalog split, orders and sales = store orders from Meta for
 * that product. RUNNING: Meta ads running now that point at the product, and "catalog" when a catalog / Advantage+
 * ad spent on it today.
 */
function todayRunning_() {
  const active = activeMap_();
  return name => { const n = active[name] || 0; return n ? '✅ ' + n + (n === 1 ? ' إعلان' : ' إعلانات') : ''; };
}
/* Meta orders of the month: the row each counts on (orderAdProduct_) and the products actually ordered. */
function todayOrders_(from) {
  const osh = ss_().getSheetByName(APP.T.ORDERS), out = [];
  if (!osh) return out;
  const idx = adMapIndex_(), catAds = catalogAdIds_(), known = metaIdsOf_();
  readRows_(osh, ORDERS_HEADERS.length).forEach(o => {
    const d = asKey_(o[2]);
    if (!d || d < from || o[3] !== 'META' || outsideMeta_(o, known)) return;
    const items = [];
    lineItems_(o[6]).forEach(li => {
      const name = productNameOf_(li.title), it = items.find(x => x.name === name);
      if (it) it.qty += li.qty; else items.push({ name: name, qty: li.qty });
    });
    out.push({ d: d, key: orderAdProduct_(o, idx, catAds), items: items.length ? items : [{ name: String(o[5] || APP.UNKNOWN_PRODUCT), qty: 1 }] });
  });
  return out;
}
/*
 * [[ordered product, orders]] for one row. Each order counts once, so the ORDERS column adds up to the row's META ORDERS:
 * on the ad's own product when the order has it, else on the product with the most pieces. Other products in
 * those orders show next to the name ("+ 3 منتجات تانية").
 */
function orderedList_(orders, key, from, to) {
  const n = {}, more = {};
  orders.forEach(o => {
    if (o.key !== key || o.d < from || o.d > to) return;
    const main = o.items.some(i => i.name === key) ? key : o.items.reduce((a, b) => (b.qty > a.qty ? b : a)).name;
    n[main] = (n[main] || 0) + 1;
    more[main] = more[main] || [];
    o.items.forEach(i => { if (i.name !== main && more[main].indexOf(i.name) < 0) more[main].push(i.name); });
  });
  const label = (name, m) => name + (m.length === 1 ? ' + ' + m[0] : m.length === 2 ? ' + منتجين تانيين' : m.length ? ' + ' + m.length + ' منتجات تانية' : '');
  return Object.keys(n).sort((a, b) => ((b === key) - (a === key)) || (n[b] - n[a]) || (a < b ? -1 : 1)).map(i => [label(i, more[i]), n[i]]);
}
function todayProducts_(g, r, title, from, to, rows, running, orders) {
  const S = TODAY, c = S.RIGHT_COL, meta = {}, special = [APP.CATALOG, APP.MULTI, APP.UNMAPPED, APP.META_NO_AD, APP.UNKNOWN_PRODUCT];
  rows.forEach(x => {
    if (x[0] < from || x[0] > to || x[1] !== 'META') return;
    const t = meta[x[2]] = meta[x[2]] || { spend: 0, orders: 0, revenue: 0, pixel: 0 };
    t.spend += num_(x[3]); t.orders += num_(x[8]); t.revenue += num_(x[10]); t.pixel += num_(x[7]);
  });
  r = todayHead_(g, r, c, 9, title, ['PRODUCT', 'META ORDERS', 'META SPEND', 'META CPP', 'META ROAS', 'PIXEL PURCHASES', 'RUNNING NOW',
    'ORDERED PRODUCT (اللي اتطلب)', 'ORDERS']);
  const names = Object.keys(meta).filter(n => special.indexOf(n) < 0 && (meta[n].spend > 0 || meta[n].orders > 0))
    .sort((a, b) => (meta[b].spend - meta[a].spend) || (meta[b].orders - meta[a].orders));
  const tot = { spend: 0, orders: 0, revenue: 0, pixel: 0 };
  let orderedSum = 0;
  const put = (name, t, style) => {
    g.set(r, c, name, style);
    g.set(r, c + 1, t.orders, Object.assign({ nf: S.COUNT, al: 'right' }, style));
    g.set(r, c + 2, Math.round(t.spend * 100) / 100, Object.assign({ nf: S.MONEY, al: 'right' }, style));
    g.set(r, c + 3, ratioOrBlank_(t.spend, t.orders, 2), Object.assign({ nf: S.MONEY, al: 'right' }, style));
    g.set(r, c + 4, ratioOrBlank_(t.revenue, t.spend, 2), Object.assign({ nf: S.RATIO, al: 'right' }, style));
    g.set(r, c + 5, t.pixel, Object.assign({ nf: S.COUNT, al: 'right' }, style));
    const total = name === 'TOTAL META PRODUCT PERFORMANCE';
    g.set(r, c + 6, total ? '' : running(name), Object.assign({}, style, { fc: '#137333' }));
    // One line per ordered product under the ad's product; the ad's numbers span those lines.
    const list = total ? [] : orderedList_(orders, name, from, to), k = Math.max(list.length, 1);
    if (total) { g.set(r, c + 7, '', style); g.set(r, c + 8, orderedSum, Object.assign({ nf: S.COUNT, al: 'right' }, style)); }
    for (let i = 0; i < k; i++) {
      const item = list[i] || ['', ''];
      if (i) g.fill(r + i, c, 7, Object.assign({}, style));
      if (!total) {
        g.set(r + i, c + 7, item[0], Object.assign({}, style, { b: 'normal' }));
        g.set(r + i, c + 8, item[1], Object.assign({ nf: S.COUNT, al: 'right' }, style, { b: 'normal' }));
        orderedSum += item[1] || 0;
      }
    }
    if (k > 1) for (let col = c; col < c + 7; col++) g.merge(r, col, k, 1);
    r += k;
  };
  // CATALOG first (all catalog / Advantage+ ads together; per product in the الكتالوج tab), then products, then the rest.
  const add = (n, style) => {
    const t = meta[n];
    if (!t || (t.spend <= 0 && t.orders <= 0)) return;
    put(n, t, style);
    ['spend', 'orders', 'revenue', 'pixel'].forEach(k => { tot[k] += t[k]; });
  };
  add(APP.CATALOG, { bg: S.CATALOG, b: 'bold' });
  names.forEach(n => add(n, {}));
  special.filter(n => n !== APP.CATALOG).forEach(n => add(n, { bg: S.SPECIAL }));
  if (!names.length && !special.some(n => meta[n])) { g.set(r, c, 'مفيش صرف Meta في الفترة دي', { fc: '#6b7280' }); r++; }
  put('TOTAL META PRODUCT PERFORMANCE', tot, { bg: S.TOTAL, b: 'bold' });
  return r;
}

function writeToday_() {
  takeIntraday_();
  const sh = ensureTab_(APP.T.TODAY), today = todayKey_(), rows = dailyRows_(), sum = summarize_(rows, today, today), g = todayGrid_();
  const p = today.split('-').map(Number), noon = new Date(Date.UTC(p[0], p[1] - 1, p[2], 12));
  const shown = Utilities.formatDate(noon, 'UTC', 'dd-MMM-yyyy'), month = Utilities.formatDate(noon, 'UTC', 'MMM-yyyy');
  todayClosing_(g, today, sum, rows);
  let r = todaySlots_(g, 1, today) + 1;
  r = todayBenchmark_(g, r, today, shown) + 1;
  const running = todayRunning_(), orders = todayOrders_(today.slice(0, 8) + '01');
  r = todayProducts_(g, r, 'PRODUCT PERFORMANCE — TODAY | ' + shown, today, today, rows, running, orders) + 1;
  todayProducts_(g, r, 'PRODUCT PERFORMANCE — THIS MONTH | ' + month, today.slice(0, 8) + '01', today, rows, running, orders);
  writeGrid_(sh, g);
  sh.setFrozenRows(0);
  [[1, 150], [2, 210], [3, 120], [4, 130], [5, 130], [6, 130], [7, 24], [8, 240]].forEach(w => sh.setColumnWidth(w[0], w[1]));
  for (let col = 9; col <= TODAY.WIDTH; col++) sh.setColumnWidth(col, col === TODAY.RIGHT_COL + 7 ? 320 : 115);
  sh.getRange(8, 1, 1, 6).setWrap(true);
}

/* ======== 90_hooks.gs ======== */
/*
 * Extension for Shopify stores:
 *  - Stock: read live stock from the Shopify Flow stock tab (+ optional one-time product export).
 *  - Products tab auto-filled from the stock sheet (title + handle + price) so ad landing pages map exactly.
 *  - "المنتجات": products from best seller to least, live stock, running ✅, key numbers.
 *  - "تعادل الحسابات": each ad account day by day vs break-even, to see where the month drops.
 *  - Running ✅ = the product has at least one ACTIVE Meta ad now (or TikTok spend today/yesterday).
 * Read-only on Meta and Shopify.
 */

function chanceSetup_() {
  ensureTab_(X.PRODUCTS); ensureTab_(X.ACC_BE); ensureTab_(X.CATALOG);
  const tk = ['date', 'account_id', 'campaign', 'adgroup', 'ad_id', 'ad', 'spend', 'impressions', 'clicks', 'purchases', 'landing']
    .map(k => cfgStr_('tiktok.col.' + k)).filter(Boolean);
  ensureTab_(cfgStr_('tiktok.tab') || 'TikTok Data', tk);
}
function chanceLive_() {
  STOCK_ = null;
  const props = PropertiesService.getDocumentProperties(), today = todayKey_();
  if (props.getProperty('STOCK_DAY') !== today) { // stock → Products: once a day
    props.setProperty('STOCK_DAY', today);
    try { if (autoAddProducts_()) withLock_(() => refreshAdMap_([], {}, false)); } catch (e) { setStatus_('STOCK', '✗ ' + errText_(e)); }
  }
  try { refreshActive_(); } catch (e) { setStatus_('ACTIVE', '✗ ' + errText_(e)); }
}
function chanceViews_(slow) { writeCatalogTab_(); if (slow) { writeProductsTab_(); writeAccountsBE_(); } }
function chanceEdit_(name, a1) {
  if (name === X.PRODUCTS && (a1 === 'B2' || a1 === 'B3')) writeProductsTab_();
  if (name === X.ACC_BE && a1 === 'B2') writeAccountsBE_();
}
function refreshProductsNow() {
  try {
    resetCaches_(); chanceLive_();
    withLock_(() => { rebuildViews_(true); });
    alert_('اتحدثت المنتجات والستوك ✅\nالستوك: ' + getStatus_('STOCK') + '\nالإعلانات الشغالة: ' + getStatus_('ACTIVE'));
    ss_().setActiveSheet(tab_(X.PRODUCTS));
  } catch (e) { alert_('التحديث ماكملش:\n' + errText_(e)); }
}

/* Extension hooks the engine calls. Arrow wrappers so files load in any order.
 * views: after the core views are rebuilt (inside the lock). edit: onEdit(e). setup: inside setupAll's lock.
 * live: after ads sync, before views (outside the lock, for reads). menu: [label, functionName]. */
const EXT = {
  views: [slow => chanceViews_(slow)],
  edit: [(name, a1) => chanceEdit_(name, a1)],
  setup: [() => chanceSetup_()],
  live: [() => refreshAccountNames_(), () => discoverAccounts_(), () => chanceLive_(), () => refreshTodayFunnel_()],
  menu: [['📦 تحديث المنتجات والستوك', 'refreshProductsNow']]
};
