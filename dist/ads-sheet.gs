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
  VERSION: '1.18.0',
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
  META_NO_AD: 'أوردرات Meta من غير إعلان معروف (مفيش UTM)',
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
/* For triggers: skip quietly if busy (after waitMs, default 5s); the next run catches up. */
function tryLock_(fn, waitMs) {
  if (LOCK_DEPTH_) return { skipped: false, value: fn() };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(waitMs || 5000)) return { skipped: true };
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
/*
 * Rows of a tab, read once per run: Ads Raw, Orders Raw, Ad Map... are read by many views, and each read of a big tab
 * costs seconds. Every write through writeRows_ / writeSortedBlock_ drops the copy. Don't change the rows you get.
 */
let RAW_ = {};
function rawRows_(name, cols) {
  const k = name + '|' + cols;
  if (!RAW_[k]) { const sh = ss_().getSheetByName(name); RAW_[k] = sh ? readRows_(sh, cols) : []; }
  return RAW_[k];
}
function dropRaw_(name) { Object.keys(RAW_).forEach(k => { if (k.split('|')[0] === name) delete RAW_[k]; }); }
/*
 * Rows of a newest-first tab (Ads Raw, Orders Raw, Catalog Raw, Daily Log) down to key `since`: read from the top in
 * chunks and stop at the first older row, so "this month" never reads the whole history.
 */
function recentRows_(name, cols, keyCol, keyFn, since) {
  const all = RAW_[name + '|' + cols];
  if (all) return all.filter(r => keyFn(r[keyCol - 1]) >= since);
  const k = name + '|' + cols + '|' + keyCol + '|' + since;
  if (RAW_[k]) return RAW_[k];
  const sh = ss_().getSheetByName(name), out = [];
  RAW_[k] = out;
  if (!sh) return out;
  const last = sh.getLastRow();
  for (let r = 2; r <= last; r += 1000) {
    const part = sh.getRange(r, 1, Math.min(1000, last - r + 1), cols).getValues();
    for (const x of part) {
      const key = keyFn(x[keyCol - 1]);
      if (!key) continue;
      if (key < since) return out;
      out.push(x);
    }
  }
  return out;
}

/*
 * Replace all data rows. textCols: 1-based columns forced to text before writing (IDs, dates).
 * Nothing is written when the rows are the same as last time, and old rows are overwritten in place (never cleared
 * first), so a tab never shows empty while it updates. Returns true if it wrote.
 */
function writeRows_(sh, rows, cols, textCols) {
  dropRaw_(sh.getName());
  const last = sh.getLastRow(), props = PropertiesService.getDocumentProperties(), key = 'WH_' + sh.getName();
  const hash = sha_(cols + '|' + JSON.stringify(rows));
  if (props.getProperty(key) === hash && last === (rows.length ? rows.length + 1 : Math.min(last, 1))) return false;
  if (rows.length + 1 > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), rows.length + 1 - sh.getMaxRows());
  (textCols || []).forEach(c => sh.getRange(2, c, Math.max(rows.length, 1), 1).setNumberFormat('@'));
  if (rows.length) sh.getRange(2, 1, rows.length, cols).setValues(rows);
  if (last > rows.length + 1) sh.getRange(rows.length + 2, 1, last - rows.length - 1, cols).clearContent();
  props.setProperty(key, hash);
  return true;
}

/* Sortable text of a key cell: yyyy-MM-dd, or yyyy-MM-dd HH:mm for a date-time. */
function sortKey_(v) {
  if (v instanceof Date) return isNaN(v) ? '' : Utilities.formatDate(v, tz_(), 'yyyy-MM-dd HH:mm');
  return String(v === null || v === undefined ? '' : v).trim();
}
/*
 * A tab sorted newest first by column keyCol (1-based, its text from keyFn): replace only the rows whose key is in [lo..hi].
 * block(oldRows) gets the rows now in that range and returns the new ones (sorted the same way). Rows are inserted
 * or deleted around the block, so an update of today reads and writes today only, not months of history.
 * A tab that isn't sorted yet (old versions) is rewritten whole once, through block(all rows in range) + the rest.
 */
function writeSortedBlock_(sh, cols, keyCol, keyFn, lo, hi, block, textCols, sortFn) {
  dropRaw_(sh.getName());
  PropertiesService.getDocumentProperties().deleteProperty('WH_' + sh.getName());
  const last = sh.getLastRow();
  const keys = last >= 2 ? sh.getRange(2, keyCol, last - 1, 1).getValues().map(r => keyFn(r[0])) : [];
  const inRange = k => k >= lo && k <= hi;
  if (!keys.every((k, i) => k && (i === 0 || keys[i - 1] >= k))) {
    const all = readRows_(sh, cols).filter(r => keyFn(r[keyCol - 1])), k = r => keyFn(r[keyCol - 1]);
    const out = block(all.filter(r => inRange(k(r)))).concat(all.filter(r => !inRange(k(r))));
    if (sortFn) out.sort(sortFn);
    writeRows_(sh, out, cols, textCols);
    return out.length;
  }
  let a = 0;
  while (a < keys.length && keys[a] > hi) a++;
  let e = a;
  while (e < keys.length && keys[e] >= lo) e++;
  const start = 2 + a, L = e - a, old = L ? sh.getRange(start, 1, L, cols).getValues() : [];
  const out = block(old), N = out.length;
  if (N > L) {
    sh.insertRowsAfter(start + L - 1, N - L);
    sh.getRange(start, 1, N, cols).setFontWeight('normal').setBackground(null).setFontColor('#000000'); // not the header's look
  }
  if (N < L) {
    if (sh.getMaxRows() - (L - N) >= 2) sh.deleteRows(start + N, L - N);
    else sh.getRange(start + N, 1, L - N, cols).clearContent();
  }
  if (N) {
    (textCols || []).forEach(c => sh.getRange(start, c, N, 1).setNumberFormat('@'));
    sh.getRange(start, 1, N, cols).setValues(out);
  }
  return keys.length - L + N;
}
function setStatus_(key, msg) { PropertiesService.getDocumentProperties().setProperty('STATUS_' + key, nowText_() + '  ' + msg); }
function getStatus_(key) { return PropertiesService.getDocumentProperties().getProperty('STATUS_' + key) || 'لسه ما اشتغلش'; }
function alert_(msg) { try { SpreadsheetApp.getUi().alert(String(msg)); } catch (e) { console.log(String(msg)); } }
function errText_(e) {
  const t = String(e && e.message ? e.message : e), tok = PropertiesService.getUserProperties().getProperty('META_TOKEN');
  return tok ? t.split(tok).join('[مخفي]') : t;
}
function resetCaches_() { CFG_ = null; PRODUCTS_ = null; KNOWN_PRODUCTS_ = null; RAW_ = {}; }

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
  metaIdsOf_().forEach(x => known.add(x));
  const ids = new Set();
  recentRows_(APP.T.ORDERS, ORDERS_HEADERS.length, 2, sortKey_, weekAgo).forEach(o => {
    if (o[3] !== 'META' || o[14] || asKey_(o[2]) < weekAgo) return;
    ([o[11], o[12], o[13], o[16], o[17]].join(' ').match(/\d{15,}/g) || []).forEach(x => { if (!known.has(x)) ids.add(x); });
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

/*
 * Replace [since..until] for the synced accounts; keep everything else. The tab stays sorted newest day first, so
 * only the rows of those days are read and written (writeSortedBlock_), never the whole history.
 */
function mergeRaw_(sheetName, headers, fresh, since, until, accountKeys, keyCols, idIdx) {
  const sh = ensureTab_(sheetName, headers), cols = headers.length, synced = new Set(accountKeys), spend = headers.indexOf('Spend');
  const sortFn = (a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : num_(b[spend]) - num_(a[spend]));
  fresh.forEach(r => { if (r[0] < since) since = r[0]; if (r[0] > until) until = r[0]; }); // never outside, but stay safe
  return writeSortedBlock_(sh, cols, 1, asKey_, since, until, old => {
    const out = [], seen = new Set();
    const add = r => {
      const k = keyCols.map(i => String(r[i])).join('|');
      if (seen.has(k)) return;
      seen.add(k); out.push(r);
    };
    fresh.forEach(add);
    old.forEach(r => {
      r[0] = asKey_(r[0]);
      if (!r[0]) return;
      idIdx.forEach(i => { r[i] = String(r[i]); });
      if (synced.has(r[1] + '|' + r[2])) return;
      add(r);
    });
    return out.sort(sortFn);
  }, [1].concat(idIdx.map(i => i + 1)), sortFn);
}

/*
 * Read everything first (no lock), then write inside the lock: only the pulled days change (mergeRaw_).
 * quick = spend only (the ⚡ button): no catalog split, which the 15-minute update brings.
 */
function syncAds_(since, until, quick) {
  const meta = time_('Meta — قراءة', () => fetchMetaAds_(since, until));
  const tt = time_('TikTok — قراءة', () => fetchTikTokTab_(since, until));
  const cat = quick ? null : time_('Meta كتالوج — قراءة', () => syncCatalog_(since, until));
  const ads = meta.ads.concat(tt.ads), acc = meta.acc.concat(tt.acc), keys = meta.accounts.concat(tt.accounts);
  withLock_(() => {
    mergeRaw_(APP.T.ADS, ADS_HEADERS, ads, since, until, keys, [0, 1, 2, 8], [2, 4, 6, 8]);
    mergeRaw_(APP.T.ACC_RAW, ACC_HEADERS, acc, since, until, keys, [0, 1, 2], [2]);
    if (cat) mergeCatalog_(cat.rows, since, until, cat.keys);
  });
  time_('Ad Map', () => updateAdMap_(ads, tt.links, false));
  return { ads: ads.length, since: since, until: until };
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
 * What an update needs from the Ad Map: {needed, ids}. needed = an ad that spent isn't in the map (or was renamed),
 * an Override was typed or removed, a TikTok link changed, or links are still unread; recheckAll (daily) always.
 * ids = Meta ads whose links to read.
 */
function adMapPlan_(freshAds, tiktokLinks, recheckAll) {
  const rows = rawRows_(APP.T.ADMAP, ADMAP_HEADERS.length), byKey = new Map(), ids = new Set(), weekAgo = shiftKey_(todayKey_(), -7);
  let needed = !!recheckAll;
  rows.forEach(r => byKey.set(adKey_(r[AM.PLAT], String(r[AM.ID]), r[AM.CAMP], r[AM.SET], r[AM.AD]), r));
  freshAds.forEach(a => {
    if (num_(a[10]) <= 0 && num_(a[11]) <= 0) return;
    const r = byKey.get(adKey_(a[1], String(a[8] || ''), a[5], a[7], a[9]));
    if (!r) { needed = true; if (a[1] === 'META' && a[8]) ids.add(String(a[8])); return; }
    if (String(r[AM.CAMP]) !== String(a[5]) || String(r[AM.SET]) !== String(a[7]) || String(r[AM.AD]) !== String(a[9]) ||
      !r[AM.LAST] || asKey_(r[AM.LAST]) < a[0]) needed = true;
  });
  rows.forEach(r => {
    if (String(r[AM.OVR] || '').trim() !== String(r[AM.CONF_VAL] || '')) needed = true;
    if (r[AM.PLAT] === 'META' && r[AM.ID] && (!r[AM.LINKS] || (recheckAll && asKey_(r[AM.LAST]) >= weekAgo))) { needed = true; ids.add(String(r[AM.ID])); }
    if (r[AM.PLAT] === 'TIKTOK' && tiktokLinks && tiktokLinks[r[AM.ID]] && tiktokLinks[r[AM.ID]] !== r[AM.LINKS]) needed = true;
  });
  return { needed: needed, ids: Array.from(ids) };
}
/*
 * Updates the Ad Map only when something changed for it, and reads the Meta links before taking the lock,
 * so a slow link read never makes the other updates wait. Returns the number of ads, or false if nothing to do.
 */
function updateAdMap_(freshAds, tiktokLinks, recheckAll) {
  const plan = adMapPlan_(freshAds, tiktokLinks, recheckAll);
  if (!plan.needed) return false;
  const links = plan.ids.length && accounts_('META').length ? time_('لينكات الإعلانات', () => fetchMetaLinks_(plan.ids)) : {};
  return withLock_(() => refreshAdMap_(freshAds, tiktokLinks, recheckAll, links));
}

/*
 * freshAds: Ads Raw rows just pulled. tiktokLinks: {adId: url}. recheckAll: re-read links of every
 * ad that spent in the last 7 days (daily run), otherwise only ads not in the map yet.
 * links: Meta links already read ({adId: {links, error}}); without it they are read here.
 */
let ADMAP_CHANGED_ = false;
function refreshAdMap_(freshAds, tiktokLinks, recheckAll, links) {
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
    const got = links || fetchMetaLinks_(needMeta);
    byKey.forEach(r => {
      const g = got[r[AM.ID]];
      if (!g) return;
      r[AM.LINKS] = g.links.length ? g.links.join(', ') : '-';
      r._err = g.error;
    });
  }

  // Spend this month per ad, from Ads Raw (after merge).
  const monthStart = todayKey_().slice(0, 8) + '01', spend = {};
  recentRows_(APP.T.ADS, ADS_HEADERS.length, 1, asKey_, monthStart).forEach(a => {
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
  if (!writeRows_(sh, out, W, [1, 3, 4, 5, 6, 7, 15, 17, 19])) return out.length; // same as before: nothing to redraw
  ADMAP_CHANGED_ = true;
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
  rawRows_(APP.T.ADMAP, ADMAP_HEADERS.length).forEach(r => {
    const final = String(r[AM.FINAL] || APP.UNMAPPED);
    idx.set(adKey_(r[AM.PLAT], String(r[AM.ID]), r[AM.CAMP], r[AM.SET], r[AM.AD]),
      { product: final, exact: r[AM.STATUS] === '✅' && final !== APP.MULTI && final !== APP.UNMAPPED });
  });
  return idx;
}

function refreshAdMapNow() {
  try {
    resetCaches_();
    const n = updateAdMap_(recentRows_(APP.T.ADS, ADS_HEADERS.length, 1, asKey_, shiftKey_(todayKey_(), -7)), {}, true);
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
  'City', 'Phone', 'Alt phone', 'UTM source', 'UTM campaign', 'UTM content', 'Ad ID', 'Cancelled', 'Campaign ID (UTM)', 'Ad set ID (UTM)'];

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
  // utm_id = campaign ID, utm_term = ad set ID: they stay the same when a campaign or ad is renamed (names in UTMs don't).
  utm_id: ['UTM ID', 'utm_id'], utm_term: ['UTM Term', 'utm_term'], attr_utm_id: ['Attr UTM ID'], attr_utm_term: ['Attr UTM Term'],
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
const FLOW_EXTRA_HEADERS = ['Attr UTM Source', 'Attr UTM Campaign', 'Attr UTM Content', 'Order Referrer', 'Products', 'Source Name',
  'Attr UTM ID', 'Attr UTM Term'];
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
  return { sheet: sh, tz: book.getSpreadsheetTimeZone(), id: book.getId() + '|' + tabName };
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

/*
 * utms = [source, campaign, content]. A link-in-bio visit ("link_in_bio") is not an ad: DIRECT. A UTM with no campaign
 * and no Meta / TikTok word (utm_source=chatgpt.com) says nothing about an ad, so the referrer and source decide.
 */
function platformOf_(utms, referrer, sourceName) {
  if (utms.some(u => /link.?in.?bio/i.test(String(u || '')))) return { p: APP.DIRECT, s: 'organic' };
  const text = norm_(utms.filter(Boolean).join(' ')), tk = cfgList_('attribution.tiktok_markers').map(norm_),
    me = cfgList_('attribution.meta_markers').map(norm_);
  const isTk = tk.some(t => hasToken_(text, t)), isMe = me.some(t => hasToken_(text, t));
  // A referrer URL (facebook.com/…) or the COD form's word (Facebook, Instagram, Direct(…)).
  const ref = String(referrer || '').toLowerCase(), refP = /tiktok/.test(ref) ? 'TIKTOK'
    : /(facebook|instagram|fb\.com|threads\.|messenger)/.test(ref) ? 'META' : '';
  if (isTk && isMe) return refP ? { p: refP, s: 'referrer' } : { p: APP.UNKNOWN_PLATFORM, s: 'utm_conflict' };
  if (isTk) return { p: 'TIKTOK', s: 'utm' };
  if (isMe) return { p: 'META', s: 'utm' };
  if (text && String(utms[1] || '').trim()) return { p: cfgStr_('attribution.other_utm_platform') === 'UNKNOWN' ? APP.UNKNOWN_PLATFORM : 'META', s: 'utm_convention' };
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

/*
 * The store sheet only grows at the bottom (Flow appends a row per order). So a normal update reads the new rows plus
 * the last ORDERS.OVERLAP rows (their ads may have been linked since), not the whole sheet. full = read everything
 * (once a day, or when the sheet / its columns changed). Returns {rows (newest first), full, state} or null.
 */
const ORDERS = { OVERLAP: 600 };
function readOrderSource_(full) {
  const src = openOrderSheet_();
  if (!src) return null;
  const L = src.sheet.getLastRow(), W = Math.max(src.sheet.getLastColumn(), 1);
  if (L < 2) return { rows: [], full: true, state: null };
  const head = ensureFlowHeaders_(src.sheet, src.sheet.getRange(1, 1, 1, W).getValues()[0].map(v => String(v).trim())), c = orderColumns_(head);
  if (c.order_id < 0 || c.date < 0) throw new Error('شيت الأوردرات ناقص فيه عمود رقم الأوردر أو التاريخ. راجع orders.col.* في Settings.');
  let st = null;
  try { st = JSON.parse(PropertiesService.getDocumentProperties().getProperty('ORDERS_SRC') || 'null'); } catch (e) { st = null; }
  const patch = String(ORDER_PATCH_DATA.length); // a new ORDER_PATCH = read everything once, so old rows get it
  if (!st || st.id !== src.id || st.head !== head.join('|') || !st.fmt || L < st.rows || st.patch !== patch) full = true;
  const from = full ? 2 : Math.max(2, Math.min(st.rows + 1, L - ORDERS.OVERLAP + 1));
  const rows = src.sheet.getRange(from, 1, L - from + 1, W).getValues(), fmt = full ? detectDateFormat_(rows, c.date) : st.fmt;
  const get = (r, k) => (c[k] >= 0 ? orderCell_(r[c[k]]) : '');
  const adIds = new Set();
  rawRows_(APP.T.ADMAP, ADMAP_HEADERS.length).forEach(r => adIds.add(String(r[0])));
  // UTMs with names instead of IDs (utm_source = campaign name, utm_campaign = ad name): the ad from Ads Raw.
  // Renamed campaigns / ads: the ad set ID (utm_term) is exact; in it, the ad with the UTM's ad name, else the one that spent most.
  const byName = new Map(), bySet = new Map();
  (full ? rawRows_(APP.T.ADS, ADS_HEADERS.length) : recentRows_(APP.T.ADS, ADS_HEADERS.length, 1, asKey_, shiftKey_(todayKey_(), -60))).forEach(a => {
    const k = norm_(a[5]) + '|' + norm_(a[9]);
    if (a[8] && !byName.has(k)) byName.set(k, String(a[8]));
    if (!a[6] || !a[8]) return;
    const set = bySet.get(String(a[6])) || new Map(), ad = set.get(String(a[8])) || { name: norm_(a[9]), spend: 0 };
    ad.spend += num_(a[10]); set.set(String(a[8]), ad); bySet.set(String(a[6]), set);
  });
  const adOfSet = (setId, adName) => {
    const set = bySet.get(String(setId || ''));
    if (!set) return '';
    let best = '', top = -1;
    set.forEach((ad, id) => { if (ad.name === norm_(adName)) top = Infinity, best = id; else if (ad.spend > top) { top = ad.spend; best = id; } });
    return best;
  };
  const cancelWords = cfgList_('orders.cancelled_words').map(norm_);
  const byId = new Map();
  let noDate = 0;
  rows.forEach(r0 => {
    const id = String(get(r0, 'order_id') === null ? '' : get(r0, 'order_id')).trim();
    if (!id) return;
    // Columns Flow didn't write yet for this order (older rows): from ORDER_PATCH (16_orders_patch.gs), read from Shopify.
    const fix = orderPatch_(id), r = fix ? r0.slice() : r0;
    if (fix) ORDER_PATCH_COLS.forEach((k, i) => { if (c[k] >= 0 && fix[i] && !get(r0, k)) r[c[k]] = fix[i]; });
    const dt = parseOrderDate_(get(r, 'date'), fmt, src.tz);
    if (!dt) { noDate++; return; }
    const utms = ['utm_source', 'utm_campaign', 'utm_content'].map(k => String(get(r, 'attr_' + k) || get(r, k) || '').trim());
    const meta = String(get(r, 'metadata') || ''), refM = meta.match(/referrer\s*:\s*([^\s\]]+)/i);
    const referrer = String(get(r, 'referrer') || '') || (refM ? refM[1] : '');
    const total = num_(get(r, 'total')), ids = ['utm_id', 'utm_term'].map(k => String(get(r, 'attr_' + k) || get(r, k) || '').trim());
    const o = byId.get(id);
    if (o) { // duplicate rows of one order (cross-sell lines): earliest date, highest total
      if (dt < o.dt) o.dt = dt;
      o.total = Math.max(o.total, total);
      utms.forEach((u, i) => { if (!o.utms[i] && u) o.utms[i] = u; });
      ids.forEach((u, i) => { if (!o.ids[i] && u) o.ids[i] = u; });
      return;
    }
    byId.set(id, { id: id, dt: dt, utms: utms, ids: ids, referrer: referrer, source: String(get(r, 'source_name') || ''), total: total, raw: String(get(r, 'product') || ''),
      city: String(get(r, 'city') || '').trim(), phone: phone10_(get(r, 'phone')), alt: phone10_(get(r, 'alt_phone')),
      cancelled: cancelWords.some(w => w && hasToken_(norm_(get(r, 'status')), w)) });
  });
  if (noDate && full) setStatus_('ORDERS_NODATE', noDate + ' صف من غير تاريخ مفهوم');
  const out = Array.from(byId.values()).map(o => {
    const pl = platformOf_(o.utms, o.referrer, o.source);
    const adId = (o.utms.join(' ').match(/\d{10,}/g) || []).find(x => adIds.has(x)) || byName.get(norm_(o.utms[0]) + '|' + norm_(o.utms[1])) ||
      (pl.p === 'META' ? adOfSet(o.ids[1], o.utms[1]) : '') || '';
    return [o.id, Utilities.formatDate(o.dt, tz_(), 'yyyy-MM-dd HH:mm'), dayKey_(o.dt), pl.p, pl.s, productOfOrder_(o.raw),
      o.raw.replace(/\s+/g, ' ').slice(0, 1000), o.total, o.city, o.phone ? '0' + o.phone : '', o.alt ? '0' + o.alt : '',
      o.utms[0], o.utms[1], o.utms[2], adId, o.cancelled, o.ids[0], o.ids[1]];
  }).sort((a, b) => (a[1] < b[1] ? 1 : -1));
  return { rows: out, full: full, state: { id: src.id, head: head.join('|'), fmt: fmt, rows: L, patch: patch } };
}

/*
 * Orders Raw stays sorted newest first. A normal update replaces only the orders it just read (the newest block);
 * a full read (full = true, daily) rewrites the tab, and nothing is written when nothing changed.
 */
let ORDERS_REREAD_ = false; // old orders changed in this run: the whole Daily Log is rebuilt
function syncOrders_(full) {
  const res = time_('الأوردرات — قراءة', () => readOrderSource_(full));
  if (!res) return { orders: 0, changed: false };
  const props = PropertiesService.getDocumentProperties(), key = res.full ? 'ORDERS_HASH' : 'ORDERS_TAIL_HASH';
  const hash = sha_(JSON.stringify(res.rows)), save = () => { if (res.state) props.setProperty('ORDERS_SRC', JSON.stringify(res.state)); };
  if (props.getProperty(key) === hash && ss_().getSheetByName(APP.T.ORDERS)) { save(); return { orders: res.rows.length, changed: false }; }
  let total = res.rows.length;
  withLock_(() => {
    const sh = ensureTab_(APP.T.ORDERS, ORDERS_HEADERS), text = [1, 2, 3, 10, 11, 15, 17, 18];
    const hr = sh.getRange(1, 1, 1, ORDERS_HEADERS.length);
    if (hr.getValues()[0].join('|') !== ORDERS_HEADERS.join('|')) hr.setValues([ORDERS_HEADERS]); // new columns (older tabs)
    const byCreated = (a, b) => (sortKey_(a[1]) < sortKey_(b[1]) ? 1 : -1);
    if (res.full) ORDERS_REREAD_ = writeRows_(sh, res.rows, ORDERS_HEADERS.length, text) || ORDERS_REREAD_;
    else if (res.rows.length) {
      const fresh = new Map(res.rows.map(r => [String(r[0]), r]));
      total = writeSortedBlock_(sh, ORDERS_HEADERS.length, 2, sortKey_, sortKey_(res.rows[res.rows.length - 1][1]), '9999', old => {
        const out = res.rows.slice();
        old.forEach(r => {
          const f = fresh.get(String(r[0]));
          if (!f) out.push(r); else f[7] = Math.max(num_(f[7]), num_(r[7])); // an order split over rows: highest total
        });
        return out.sort(byCreated);
      }, text, byCreated);
    }
    props.setProperty(key, hash);
    if (res.full) props.deleteProperty('ORDERS_TAIL_HASH');
    save();
  });
  setStatus_('ORDERS', '✓ ' + total + ' أوردر' + (res.full ? '' : ' (اتقرا الجديد بس)'));
  return { orders: total, changed: true };
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
  const ids = [o[11], o[12], o[13], o[16], o[17]].join(' ').match(/\d{15,}/g) || [];
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
  syncOrders_(true); // once a day: the whole orders sheet again
  const r = syncAds_(since, today);
  runLiveExt_();
  withLock_(() => time_('Views', () => rebuildViews_({ full: true, slow: slowViewsDue_() })));
  setStatus_('FULL', '✓ ' + since + ' → ' + today + ' (' + r.ads + ' صف إعلانات)');
  return r;
}
function dailySync() {
  DEADLINE_ = Date.now() + 5 * 60000;
  try {
    fullSync_(cfgNum_('sync.refresh_days') || 3);
    PropertiesService.getDocumentProperties().setProperty('SYNCED_THROUGH', shiftKey_(todayKey_(), -1));
    updateAdMap_(recentRows_(APP.T.ADS, ADS_HEADERS.length, 1, asKey_, shiftKey_(todayKey_(), -7)), {}, true);
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
    const days = acc ? rawRows_(APP.T.ACC_RAW, ACC_HEADERS.length).map(r => asKey_(r[0])).filter(d => d && d < today).sort() : [];
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
        const plan = adMapPlan_(meta.ads, {}, false), links = plan.ids.length ? fetchMetaLinks_(plan.ids) : {}; // links before the lock
        const w = tryLock_(() => {
          mergeRaw_(APP.T.ADS, ADS_HEADERS, meta.ads, u[1], u[2], meta.accounts, [0, 1, 2, 8], [2, 4, 6, 8]);
          mergeRaw_(APP.T.ACC_RAW, ACC_HEADERS, meta.acc, u[1], u[2], meta.accounts, [0, 1, 2], [2]);
          if (cat) mergeCatalog_(cat.rows, u[1], u[2], cat.keys);
          st.done++; st.tries = 0; save();
          setStatus_('BACKFILL', st.done + ' / ' + st.units.length + ' جزء' + (st.skipped ? ' (اتساب ' + st.skipped.length + ')' : ''));
          if (plan.needed) refreshAdMap_(meta.ads, {}, false, links);
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
  const tt = fetchTikTokTab_(st.since, st.until), ttPlan = adMapPlan_(tt.ads, tt.links, false);
  const r = tryLock_(() => {
    mergeRaw_(APP.T.ADS, ADS_HEADERS, tt.ads, st.since, st.until, tt.accounts, [0, 1, 2, 8], [2, 4, 6, 8]);
    mergeRaw_(APP.T.ACC_RAW, ACC_HEADERS, tt.acc, st.since, st.until, tt.accounts, [0, 1, 2], [2]);
    if (ttPlan.needed) refreshAdMap_(tt.ads, tt.links, false, {});
    st.finishing = true;
  });
  if (r.skipped || !st.finishing) return;
  try {
    syncOrders_();
    runLiveExt_();
    withLock_(() => rebuildViews_({ full: true, slow: slowViewsDue_() }));
    props.deleteProperty('BACKFILL');
    const through = asKey_(props.getProperty('SYNCED_THROUGH') || ''), done = st.until < todayKey_() ? st.until : shiftKey_(todayKey_(), -1);
    if (!through || through < done) props.setProperty('SYNCED_THROUGH', done);
    stopTrigger();
    setStatus_('BACKFILL', 'خلص ✅');
    setStatus_('FULL', '✓ ' + st.since + ' → ' + st.until);
  } catch (e) { setStatus_('BACKFILL', '✗ ' + errText_(e) + ' — هيحاول تاني بعد دقيقة'); }
}
/*
 * Every 15 minutes, and from the 🔄 button (manual = true; a trigger passes an event object instead):
 * new orders, today's Meta spend and catalog split, the light extras, then the tabs read during the day.
 * A trigger run skips itself while another run is still going (LIVE_AT). The button waits for the tabs instead of giving up.
 */
function liveTick(manual) {
  manual = manual === true;
  const run = startRun_(manual);
  if (!run) return;
  try {
    step_(run, 'أوردرات', () => syncOrders_());
    const today = todayKey_();
    step_(run, 'Meta', () => syncAds_(today, today));
    if (timeLeft_()) step_(run, 'إضافات', () => runLiveExt_());
    const r = step_(run, 'تابات', () => tryLock_(() => rebuildViews_({ slow: slowViewsDue_() }), manual ? 120000 : 5000));
    setStatus_('LIVE', (r.skipped ? 'اتأجل (تحديث تاني شغال)' : '✓ OK') + ' — ' + run.took.join('، '));
    try { ensureTriggers_(); catchUpGap_(); } catch (e) { console.error('catch-up: ' + errText_(e)); }
  } catch (e) { setStatus_('LIVE', '✗ ' + errText_(e) + ' — ' + run.took.join('، ')); console.error(errText_(e)); }
  finally { endRun_(run); }
}
/* One update run: marks LIVE_AT so the 15-minute trigger doesn't start on top of it; timings per step. */
function startRun_(manual) {
  const props = PropertiesService.getDocumentProperties(), start = Date.now(), busySince = Number(props.getProperty('LIVE_AT') || 0);
  if (!manual && busySince && start - busySince < 6 * 60000) return null;
  props.setProperty('LIVE_AT', String(start));
  DEADLINE_ = start + 4.5 * 60000;
  resetCaches_();
  return { start: start, took: [], props: props };
}
function step_(run, label, fn) {
  const t = Date.now(), v = fn();
  run.took.push(label + ' ' + Math.round((Date.now() - t) / 1000) + 'ث');
  return v;
}
function endRun_(run) { if (run.props.getProperty('LIVE_AT') === String(run.start)) run.props.deleteProperty('LIVE_AT'); }
function runLiveExt_() { EXT.live.forEach(f => { try { f(); } catch (e) { console.error('ext live: ' + errText_(e)); } }); }

/* 🔄 Full update now: everything the 15-minute update does. */
function refreshNow() {
  try {
    liveTick(true);
    const live = getStatus_('LIVE'), bf = PropertiesService.getDocumentProperties().getProperty('BACKFILL');
    const head = /✗/.test(live) ? 'التحديث ماكملش:\n'
      : /اتأجل/.test(live) ? 'الأرقام اتسحبت، بس في تحديث تلقائي شغال في نفس اللحظة وهو اللي بيكتب التابات. Today هيتحدث خلال دقيقة أو اتنين.\n'
      : 'اتحدث كل حاجة ✅\n';
    alert_(head + live +
      (bf ? '\n\nسحب الشهر شغال في الخلفية (' + getStatus_('BACKFILL') + '). Today بيتحدث لوحده كل 15 دقيقة، مش لازم تدوس تاني.' : ''));
    ss_().setActiveSheet(tab_(APP.T.TODAY));
  } catch (e) { alert_('التحديث ماكملش:\n' + errText_(e)); }
}

/*
 * ⚡ Fast update: only today's new orders and today's spend, into Daily Log and Today. No catalog split, benchmark,
 * running ads or other tabs (the 15-minute update brings those), so it finishes in seconds.
 */
function quickRefresh() {
  const run = startRun_(true);
  try {
    step_(run, 'أوردرات', () => syncOrders_());
    step_(run, 'صرف', () => syncAds_(todayKey_(), todayKey_(), true));
    step_(run, 'Today', () => withLock_(() => rebuildViews_({ quick: true }), 120000));
    const secs = Math.round((Date.now() - run.start) / 1000);
    setStatus_('QUICK', '✓ ' + secs + 'ث — ' + run.took.join('، '));
    alert_('اتحدث الصرف والأوردرات ✅ في ' + secs + ' ثانية\n' + run.took.join('، ') +
      '\n\nتقسيم الكتالوج والبنشمارك والإعلانات الشغالة بيتحدثوا لوحدهم كل 15 دقيقة.');
    ss_().setActiveSheet(tab_(APP.T.TODAY));
  } catch (e) {
    setStatus_('QUICK', '✗ ' + errText_(e));
    alert_('التحديث السريع ماكملش:\n' + errText_(e));
  } finally { endRun_(run); }
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
    .addItem('⚡ تحديث سريع (الصرف والأوردرات)', 'quickRefresh')
    .addItem('🔄 تحديث كامل', 'refreshNow')
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
  const idx = adMapIndex_(), catAds = catalogAdIds_(), out = {}, camps = {};
  accs.forEach(acc => {
    metaAll_('act_' + acc.id + '/ads', { fields: 'id,campaign_id', effective_status: JSON.stringify(['ACTIVE']) }).forEach(a => {
      const m = idx.get(adKey_('META', String(a.id), '', '', ''));
      const p = catAds.has('META|' + String(a.id)) ? APP.CATALOG : m ? m.product : APP.UNMAPPED;
      out[p] = (out[p] || 0) + 1;
      if (a.campaign_id) camps[a.campaign_id] = (camps[a.campaign_id] || 0) + 1;
    });
  });
  PropertiesService.getDocumentProperties().setProperty('ACTIVE_PRODUCTS', JSON.stringify(out));
  PropertiesService.getDocumentProperties().setProperty('ACTIVE_CAMPAIGNS', JSON.stringify(camps));
  setStatus_('ACTIVE', '✓ ' + Object.keys(out).reduce((s, k) => s + out[k], 0) + ' إعلان شغال');
}
/* Campaign ID → ACTIVE ads in it now. */
function activeCampaigns_() {
  try { return JSON.parse(PropertiesService.getDocumentProperties().getProperty('ACTIVE_CAMPAIGNS') || '{}'); } catch (e) { return {}; }
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
  if (osh) rawRows_(APP.T.ORDERS, ORDERS_HEADERS.length).forEach(o => {
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
  rawRows_(APP.T.ADS, ADS_HEADERS.length).forEach(a => {
    const d = asKey_(a[0]);
    if (d < from || d > to) return;
    const k = a[1] + '|' + String(a[2]);
    if (!accs.has(k)) accs.set(k, { key: k, platform: a[1], name: a[3] || a[2], purpose: '' });
    add(k, d, 'spend', num_(a[10])); add(k, d, 'pixel', num_(a[13])); add(k, d, 'pval', num_(a[14]));
  });
  // Orders → account: Ad ID in UTM (exact) → Ad Map account; else the only account of that platform; else "مش معروف الحساب".
  const adAcc = {}, am = ss_().getSheetByName(APP.T.ADMAP);
  if (am) rawRows_(APP.T.ADMAP, ADMAP_HEADERS.length).forEach(r => { if (r[AM.ID]) adAcc[String(r[AM.ID])] = r[AM.PLAT] + '|' + String(r[AM.ACC]); });
  const byPlat = {};
  accs.forEach(a => { (byPlat[a.platform] = byPlat[a.platform] || []).push(a.key); });
  let storeOrders = 0, storeRev = 0, attributed = 0;
  const osh = ss_().getSheetByName(APP.T.ORDERS);
  if (osh) rawRows_(APP.T.ORDERS, ORDERS_HEADERS.length).forEach(o => {
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
  if (osh) recentRows_(APP.T.ORDERS, ORDERS_HEADERS.length, 2, sortKey_, shiftKey_(todayKey_(), -90)).forEach(o => {
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
  if (sh) rawRows_(APP.T.CATALOG, CATALOG_HEADERS.length).forEach(r => { if (r[3]) ids.add(r[1] + '|' + String(r[3])); });
  return ids;
}

/*
 * Tab الكتالوج: where catalog / Advantage+ spend went, product by product (Meta's split), today and this month.
 * Orders = store orders that came from a catalog ad (UTM → ad), counted on the order's product.
 * TOTAL = all spend of catalog ads, the same number as the CATALOG row in Today.
 */
function writeCatalogTab_() {
  const sh = ensureTab_(X.CATALOG), g = todayGrid_(), today = todayKey_(), catAds = catalogAdIds_(), month0 = today.slice(0, 8) + '01';
  const split = [], csh = ss_().getSheetByName(APP.T.CATALOG);
  if (csh) recentRows_(APP.T.CATALOG, CATALOG_HEADERS.length, 1, asKey_, month0).forEach(r => split.push([asKey_(r[0]), catalogProduct_(r[4]), num_(r[5]), num_(r[6])]));
  const adSpend = [];
  recentRows_(APP.T.ADS, ADS_HEADERS.length, 1, asKey_, month0).forEach(a => { if (catAds.has(a[1] + '|' + String(a[8]))) adSpend.push([asKey_(a[0]), num_(a[10])]); });
  const orders = [], osh = ss_().getSheetByName(APP.T.ORDERS);
  if (osh) recentRows_(APP.T.ORDERS, ORDERS_HEADERS.length, 2, sortKey_, month0).forEach(o => {
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
  const ordersAll = todayOrders_(month0);
  r = campaignOrders_(g, 1, 'CAMPAIGNS — TODAY | ' + Utilities.formatDate(noon, 'UTC', 'dd-MMM-yyyy'), today, today, ordersAll) + 1;
  campaignOrders_(g, r, 'CAMPAIGNS — THIS MONTH | ' + Utilities.formatDate(noon, 'UTC', 'MMM-yyyy'), month0, today, ordersAll);
  if (!writeGrid_(sh, g)) return;
  [[1, 360], [2, 90], [3, 120], [4, 100], [5, 90], [6, 160], [7, 24], [8, 360], [9, 260], [10, 110], [11, 90], [12, 380], [13, 90]]
    .forEach(w => sh.setColumnWidth(w[0], w[1]));
}

/*
 * Right side of الكتالوج: every Meta campaign that spent or brought orders in the period, running ones first.
 * CAMPAIGN | PRODUCT (its ads' products, by spend) | ADS RUNNING NOW | ORDERS | ORDERED PRODUCT | ORDERS: one line per
 * product the orders bought (each order once, on the ad's product when it has it), so the last column adds up to ORDERS.
 */
function campaignOrders_(g, r, title, from, to, orders) {
  const S = TODAY, c = 8, idx = adMapIndex_(), catAds = catalogAdIds_(), running = activeCampaigns_(), camps = new Map(), adCamp = {};
  const camp = (id, name) => { if (!camps.has(id)) camps.set(id, { id: id, name: name, spend: {}, total: 0, orders: [] }); return camps.get(id); };
  recentRows_(APP.T.ADS, ADS_HEADERS.length, 1, asKey_, shiftKey_(from, -60)).forEach(a => {
    if (a[1] !== 'META' || !a[8]) return;
    const id = String(a[4] || a[5]);
    if (!adCamp[String(a[8])]) adCamp[String(a[8])] = { id: id, name: a[5] };
    const d = asKey_(a[0]);
    if (d < from || d > to || num_(a[10]) <= 0) return;
    const m = idx.get(adKey_('META', String(a[8]), '', '', '')), p = catAds.has('META|' + String(a[8])) ? APP.CATALOG : m ? m.product : APP.UNMAPPED;
    const x = camp(id, a[5]);
    x.spend[p] = (x.spend[p] || 0) + num_(a[10]); x.total += num_(a[10]);
  });
  const none = { id: '', name: APP.META_NO_AD, spend: {}, total: 0, orders: [] };
  orders.forEach(o => {
    if (o.d < from || o.d > to) return;
    const k = adCamp[o.ad];
    (k ? camp(k.id, k.name) : none).orders.push(o);
  });
  const list = Array.from(camps.values()).filter(x => x.total > 0 || x.orders.length)
    .sort((a, b) => ((running[b.id] ? 1 : 0) - (running[a.id] ? 1 : 0)) || (b.orders.length - a.orders.length) || (b.total - a.total));
  if (none.orders.length) list.push(none);
  r = todayHead_(g, r, c, 6, title, ['CAMPAIGN', 'PRODUCT', 'ADS RUNNING NOW', 'ORDERS', 'ORDERED PRODUCT (اللي اتطلب)', 'ORDERS']);
  let total = 0;
  list.forEach(x => {
    const prods = Object.keys(x.spend).sort((a, b) => x.spend[b] - x.spend[a]);
    const main = prods[0] || (x.orders[0] ? x.orders[0].key : '');
    const lines = orderedList_(x.orders, main), k = Math.max(lines.length, 1);
    const style = x === none ? { bg: S.SPECIAL } : running[x.id] ? {} : { fc: '#6b7280' };
    g.set(r, c, x.name, style);
    g.set(r, c + 1, prods.length > 2 ? prods.slice(0, 2).join(' / ') + ' + ' + (prods.length - 2) : prods.join(' / '), style);
    g.set(r, c + 2, running[x.id] || '', Object.assign({ nf: S.COUNT, al: 'center' }, style, running[x.id] ? { fc: '#137333' } : {}));
    g.set(r, c + 3, x.orders.length, Object.assign({ nf: S.COUNT, al: 'right', b: 'bold' }, style));
    for (let i = 0; i < k; i++) {
      if (i) g.fill(r + i, c, 4, Object.assign({}, style));
      g.set(r + i, c + 4, (lines[i] || [''])[0], style);
      g.set(r + i, c + 5, (lines[i] || ['', ''])[1], Object.assign({ nf: S.COUNT, al: 'right' }, style));
    }
    if (k > 1) for (let col = c; col < c + 4; col++) g.merge(r, col, k, 1);
    total += x.orders.length;
    r += k;
  });
  if (!list.length) { g.set(r, c, 'مفيش كامبينات صرفت في الفترة دي', { fc: '#6b7280' }); r++; }
  const tot = { bg: S.TOTAL, b: 'bold' };
  g.set(r, c, 'TOTAL', tot); g.fill(r, c + 1, 2, tot);
  g.set(r, c + 3, total, Object.assign({ nf: S.COUNT, al: 'right' }, tot)); g.fill(r, c + 4, 1, tot);
  g.set(r, c + 5, total, Object.assign({ nf: S.COUNT, al: 'right' }, tot));
  return r + 1;
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

/* ======== 16_orders_patch.gs ======== */
/*
 * What Shopify Flow didn't write for older orders, read once from Shopify (Admin API: order customAttributes,
 * sourceName, first 6 line items): the COD form columns (before 2026-10-28 03:56 Cairo) and the campaign / ad set IDs
 * (utm_id, utm_term; Flow writes them from 2026-10-29). Fills only the cells a row has empty. Generated, not edited by hand.
 * ORDER_PATCH_DATA = "orderId:sourceIndex:productIndex*qty.productIndex*qty;..."
 * ORDER_PATCH_SRC  = [utm_source, utm_campaign, utm_content, Order Referrer, Source Name, utm_id, utm_term]
 */
const ORDER_PATCH_SRC = [["", "", "", "", "web", "", ""], ["facebook", "120256391691300102", "120256391695610102", "Facebook", "136528265217", "120256391691300102", "120256391691520102"], ["facebook", "120256366878570102", "120256366885940102", "Facebook", "shopify_draft_order", "120256366878570102", "120256366881430102"], ["", "", "", "", "shopify_draft_order", "", ""], ["", "", "", "", "136528265217", "", ""], ["facebook", "120256366878570102", "120256366885940102", "Instagram", "136528265217", "120256366878570102", "120256366881430102"], ["facebook", "120256366878570102", "120256366889840102", "Facebook", "136528265217", "120256366878570102", "120256366881430102"], ["facebook", "120256366878570102", "120256366885940102", "Facebook", "136528265217", "120256366878570102", "120256366881430102"], ["facebook", "120250399209600297", "Facebook_UA", "Facebook", "shopify_draft_order", "120250399209600297", "120250399209580297"], ["facebook", "120256391691300102", "120256391695610102", "", "web", "120256391691300102", "120256391691520102"], ["fb", "SHEGLAM Big Energy Mascara-Black | CBO | 19/7", "1", "Facebook", "136528265217", "120249303749750297", "Broad"], ["ig", "", "link_in_bio", "", "web", "", ""], ["facebook", "120256366878570102", "120256366885940102", "Direct(Chancestoreegy)", "136528265217", "120256366878570102", "120256366881430102"], ["", "", "", "Direct(Chancestoreegy)", "136528265217", "", ""], ["All Aug | Sheglam page | CBO | 10/9", "New Sales Ad - Copy 44", "fb", "Facebook", "136528265217", "120250399209600297", "120250399209580297"], ["SHEGLAM Bold Moves Kohl Cream Eyeliner Pencil | Testing | Sales | ABO | 12/10/2026", "Reels | UGC | How Use", "fb", "Facebook", "136528265217", "23860645838320793", "23860645838330793"], ["ig", "", "link_in_bio", "Instagram", "136528265217", "", ""], ["Sheglam Camera On Primer & Setting Spray bundle | CBO | 19/7", "copy_E6B64A72-AADB-41AC-A807-FE18A0294D18", "ig", "Instagram", "136528265217", "120249303880400297", "120249303880410297"], ["Arencia Holy Hyssop Serum 30 All Skin | CBO | 6/10", "New Sales Ad - Copy 4", "fb", "Facebook", "136528265217", "", ""], ["ig", "", "link_in_bio", "Direct(Chancestoreegy)", "136528265217", "", ""], ["All Aug | Sheglam page | CBO | 10/9", "New Sales Ad - Copy 31", "ig", "Instagram", "136528265217", "120250399209600297", "120250399209580297"], ["SHEGLAM Glass Lock Air Gloss | CBO | 5/5", "‏‎Advantage+‎ Lock air gloss 011‏", "fb", "Facebook", "136528265217", "120244481106590297", "120244481106670297"], ["ig", "", "link_in_bio", "Instagram", "shopify_draft_order", "", ""], ["", "", "", "Google", "136528265217", "", ""], ["SHEGLAM Line To Shine Peel-Off Lip Stain & Gloss Duo | Testing | Sales | ABO | 14/10/2026", "Vid | reaction esraa", "ig", "Instagram", "136528265217", "23860668558160793", "23860668558200793"], ["facebook", "", "Facebook_UA", "Facebook", "136528265217", "", ""], ["Sheglam Camera On Primer & Setting Spray bundle | CBO | 19/7", "copy_E6B64A72-AADB-41AC-A807-FE18A0294D18", "fb", "Facebook", "136528265217", "", ""], ["", "", "", "Facebook", "136528265217", "", ""], ["Black F Wedding Offers | CBO | 10/10", "New Sales Ad", "fb", "Facebook", "136528265217", "120250848485870297", "120250848486120297"], ["facebook", "120256366878570102", "120256366889840102", "Facebook", "shopify_draft_order", "120256366878570102", "120256366881430102"], ["All Aug | Sheglam page | CBO | 10/9", "New Sales Ad", "fb", "Facebook", "136528265217", "120250399209600297", "120250399209580297"], ["Camera on powder | CBO | 30\\9 - ANC", "New Sales Ad - Copy 9", "ig", "Instagram", "136528265217", "120248026336250125", "120248026336310125"], ["SHEGLAM Glass Lock Air Gloss | CBO | 5/5", "Advantage+‎ Lock air gloss 01", "fb", "Facebook", "136528265217", "120244481106590297", "120244481106610297"], ["Arencia Holy Hyssop Serum 30 All Skin | CBO | 6/10", "New Sales Ad - Copy 8", "ig", "Instagram", "136528265217", "120250787348160297", "120250787348180297"], ["SHEGLAM Glass Lock Air Gloss | CBO | 5/5", "Advantage+‎ Lock air gloss 01", "ig", "Instagram", "136528265217", "120244481106590297", "120244481106610297"], ["SHEGLAM Insta-Ready Sunset Blur Setting Powder | Testing | Sales | ABO | 13/10/2026 - Copy", "Vid | UGC | New Creatives 3", "ig", "Direct(Chancestoreegy)", "136528265217", "23860655774410793", "23860655774440793"], ["All Aug | Sheglam page | CBO | 10/9", "New Sales Ad - Copy 40", "fb", "Facebook", "136528265217", "120250399209600297", "120250399209580297"], ["facebook", "120256366878570102", "120256366894810102", "Instagram", "136528265217", "120256366878570102", "120256366881430102"], ["facebook", "120256391691300102", "120256391695610102", "Instagram", "136528265217", "120256391691300102", "120256391691520102"], ["All Aug | Sheglam page | CBO | 10/9", "New Sales Ad - Copy 40", "ig", "Instagram", "136528265217", "120250399209600297", "120250399209580297"], ["SHEGLAM Big Energy Mascara-Black | CBO | 19/7 | catalog on", "2.", "fb", "Direct(Chancestoreegy)", "136528265217", "120249303749750297", "120249303749760297"], ["facebook", "23860667946520793", "23860668323450793", "Instagram", "136528265217", "23860667946520793", "23860667946490793"], ["", "", "", "Chancestoreegy", "136528265217", "", ""], ["SHEGLAM Insta-Ready Sunset Blur Setting Powder | Testing | Sales | ABO | 13/10/2026 - Copy", "Vid | UGC | New Creatives 3", "fb", "Facebook", "136528265217", "23860655774410793", "23860655774440793"], ["facebook", "23860667946520793", "23860668323450793", "Facebook", "136528265217", "23860667946520793", "23860667946490793"], ["All Aug | Sheglam page | CBO | 10/9", "New Sales Ad - Copy 44", "fb", "Facebook", "shopify_draft_order", "120250399209600297", "120250399209580297"], ["tiktok", "All Vids | CBO | Max results", "", "Direct(Chancestoreegy)", "136528265217", "1876205392898337", ""], ["All Aug | Sheglam page | CBO | 10/9", "New Sales Ad", "ig", "Instagram", "136528265217", "120250399209600297", "120250399209580297"], ["", "", "", "Direct(Chancestoreegy)", "shopify_draft_order", "", ""], ["2 Sheglam Boldline Gel Eyeliner + Free Sharpener | CBO | 26/8", "New Sales Ad - Copy 9", "ig", "Instagram", "136528265217", "120250180734660297", "120250180734680297"], ["Camera on powder | CBO | 30\\9 - ANC", "New Sales Ad - Copy 9", "fb", "Facebook", "136528265217", "120248026336250125", "120248026336310125"], ["Sheglam Concealer Like Magic 12 hour full coverage | Testing | Sales | ABO | 14/10/2026", "Vid | Influncer | review | nada.alhaj", "ig", "Instagram", "136528265217", "23860668453010793", "23860668453040793"], ["Black F Wedding Offers | CBO | 10/10", "New Sales Ad - Copy 4", "fb", "Facebook", "136528265217", "120250848485870297", "120250848486120297"], ["2 Sheglam Boldline Gel Eyeliner + Free Sharpener | CBO | 26/8", "New Sales Ad - Copy 7", "ig", "Instagram", "136528265217", "120250180734660297", "120250180734680297"], ["SHEGLAM Line To Shine Peel-Off Lip Stain & Gloss Duo | Testing | Sales | ABO | 14/10/2026", "Vid |Product Showing 4.", "ig", "Direct(Chancestoreegy)", "136528265217", "23860668558160793", "23860668558200793"], ["SHEGLAM Bold Moves Kohl Cream Eyeliner Pencil | Testing | Sales | ABO | 12/10/2026", "Reels | UGC | How Use", "fb", "Facebook", "shopify_draft_order", "23860645838320793", "23860645838330793"], ["2 Sheglam Boldline Gel Eyeliner + Free Sharpener | CBO | 26/8", "New Sales Ad - Copy 7", "fb", "Facebook", "136528265217", "120250180734660297", "120250180734680297"], ["facebook", "Catalog 2 | Vid - Carosoul | Makeup | Summer Offer_Group_1", "fb", "Facebook", "136528265217", "120250399209600297", "120250399209580297"], ["", "", "", "Facebook", "shopify_draft_order", "", ""], ["SHEGLAM Line To Shine Peel-Off Lip Stain & Gloss Duo | Testing | Sales | ABO | 14/10/2026", "Vid |Product Review 3", "fb", "Facebook", "136528265217", "23860668558160793", "23860668558200793"], ["All Aug | Sheglam page | CBO | 10/9", "New Sales Ad - Copy 44", "ig", "Instagram", "136528265217", "120250399209600297", "120250399209580297"], ["Sheglam Camera On Primer & Setting Spray bundle | CBO | 19/7", "copy_E6B64A72-AADB-41AC-A807-FE18A0294D18", "fb", "Facebook", "136528265217", "120249303880400297", "120249303880410297"], ["SHEGLAM Insta-Ready Sunset Blur Setting Powder | Testing | Sales | ABO | 13/10/2026 - Copy", "Vid | UGC | New Creatives 3", "ig", "Instagram", "136528265217", "23860655774410793", "23860655774440793"], ["SHEGLAM Big Energy Mascara-Black | CBO | 19/7 | catalog on", "1-", "fb", "Direct(Chancestoreegy)", "136528265217", "120249303749750297", "120249303749760297"], ["2 Sheglam Boldline Gel Eyeliner + Free Sharpener | CBO | 26/8", "New Sales Ad - Copy 2", "fb", "Facebook", "136528265217", "120250180734660297", "120250180734680297"], ["SHEGLAM Big Energy Mascara-Black | CBO | 19/7 | catalog on", "1-", "ig", "Instagram", "136528265217", "120249303749750297", "120249303749760297"], ["", "", "", "Wl", "136528265217", "", ""], ["SHEGLAM Line To Shine Peel-Off Lip Stain & Gloss Duo | Testing | Sales | ABO | 14/10/2026", "Vid |Product Review 3", "ig", "Instagram", "136528265217", "23860668558160793", "23860668558200793"], ["Camera on powder | CBO | 30\\9 - ANC", "New Sales Ad - Copy 9", "fb", "Facebook", "shopify_draft_order", "", ""], ["facebook", "120256366878570102", "120256366885940102", "Instagram", "shopify_draft_order", "120256366878570102", "120256366881430102"], ["SHEGLAM Glass Lock Air Gloss | CBO | 5/5", "‏‎Advantage+‎ Lock air gloss 011‏", "fb", "Facebook", "shopify_draft_order", "120244481106590297", "120244481106670297"], ["All Aug | Sheglam page | CBO | 10/9", "New Sales Ad", "ig", "Instagram", "shopify_draft_order", "120250399209600297", "120250399209580297"], ["facebook", "Catalog 2 | Vid - Carosoul | Makeup | Summer Offer_Group_1", "fb", "Facebook", "shopify_draft_order", "120250399209600297", "120250399209580297"], ["SHEGLAM Insta-Ready Sunset Blur Setting Powder | Testing | Sales | ABO | 13/10/2026 - Copy", "Vid | UGC | New Creatives 3", "fb", "Facebook", "shopify_draft_order", "23860655774410793", "23860655774440793"], ["All Aug | Sheglam page | CBO | 10/9", "New Sales Ad - Copy 44", "fb", "Facebook", "shopify_draft_order", "", ""], ["facebook", "23860667946520793", "23860668323450793", "Instagram", "shopify_draft_order", "23860667946520793", "23860667946490793"], ["Black F Wedding Offers | CBO | 10/10", "New Sales Ad - Copy 4", "ig", "Instagram", "shopify_draft_order", "120250848485870297", "120250848486120297"], ["SHEGLAM Glass Lock Air Gloss | CBO | 5/5", "Advantage+‎ Lock air gloss 01", "fb", "Direct(Chancestoreegy)", "4655075", "", ""], ["facebook", "120256366878570102", "120256366885940102", "Instagram", "4655075", "120256366878570102", "120256366881430102"], ["", "", "", "Facebook", "4655075", "", ""], ["facebook", "120256366878570102", "120256366885940102", "Facebook", "4655075", "120256366878570102", "120256366881430102"], ["SHEGLAM Insta-Ready Sunset Blur Setting Powder | Testing | Sales | ABO | 13/10/2026 - Copy", "Vid | UGC | New Creatives 3", "fb", "Facebook", "4655075", "23860655774410793", "23860655774440793"], ["tiktok", "All Vids | CBO | Max results", "", "Tiktok", "4655075", "1876205392898337", ""], ["All Aug | Sheglam page | CBO | 10/9", "New Sales Ad", "fb", "Facebook", "4655075", "120250399209600297", "120250399209580297"], ["SHEGLAM Bold Moves Kohl Cream Eyeliner Pencil | Testing | Sales | ABO | 12/10/2026", "Reels | UGC | How Use", "fb", "Facebook", "4655075", "23860645838320793", "23860645838330793"], ["SHEGLAM Line To Shine Peel-Off Lip Stain & Gloss Duo | Testing | Sales | ABO | 14/10/2026", "Vid |Product Showing 4.", "ig", "Instagram", "shopify_draft_order", "23860668558160793", "23860668558200793"], ["", "", "", "", "4655075", "", ""], ["Black F Wedding Offers | CBO | 10/10", "New Sales Ad - Copy 4", "ig", "Instagram", "4655075", "120250848485870297", "120250848486120297"], ["All Aug | Sheglam page | CBO | 10/9", "New Sales Ad - Copy 44", "fb", "Direct(Chancestoreegy)", "4655075", "120250399209600297", "120250399209580297"], ["SHEGLAM Glass Lock Air Gloss | CBO | 5/5", "Advantage+‎ Lock air gloss 01", "ig", "Instagram", "4655075", "120244481106590297", "120244481106610297"], ["All Aug | Sheglam page | CBO | 10/9", "New Sales Ad - Copy 16", "ig", "Direct(Chancestoreegy)", "4655075", "120250399209600297", "120250399209580297"], ["", "", "", "Direct(Chancestoreegy)", "4655075", "", ""], ["ig", "", "link_in_bio", "Instagram", "4655075", "", ""], ["Scaling | Catalog | Sheglam page | CBO | 10/9", "Catalog 2 | Vid - Carosoul | Makeup | Summer Offer_Group_1", "fb", "Facebook", "4655075", "", ""], ["SHEGLAM Insta-Ready Sunset Blur Setting Powder | Testing | Sales | ABO | 13/10/2026 - Copy", "Vid | UGC | New Creatives 4", "fb", "Facebook", "4655075", "23860655774410793", "23860655774440793"], ["All Aug | Sheglam page | CBO | 10/9", "New Sales Ad - Copy 44", "fb", "Facebook", "4655075", "120250399209600297", "120250399209580297"], ["Black F Wedding Offers | CBO | 10/10", "New Sales Ad - Copy 4", "fb", "Facebook", "4655075", "120250848485870297", "120250848486120297"], ["facebook", "120256366878570102", "120256366894810102", "Facebook", "4655075", "120256366878570102", "120256366881430102"], ["facebook", "120256366878570102", "120256366889840102", "Facebook", "4655075", "120256366878570102", "120256366881430102"], ["All Aug | Sheglam page | CBO | 10/9", "New Sales Ad - Copy 13", "ig", "Instagram", "4655075", "120250399209600297", "120250399209580297"], ["facebook", "120256391691300102", "120256391695610102", "Facebook", "4655075", "120256391691300102", "120256391691520102"], ["facebook", "23860667946520793", "23860668323450793", "Instagram", "4655075", "23860667946520793", "23860667946490793"], ["All Aug | Sheglam page | CBO | 10/9", "New Sales Ad - Copy", "fb", "Facebook", "4655075", "120250399209600297", "120250399209580297"], ["chatgpt.com", "", "", "Direct(Chancestoreegy)", "shopify_draft_order", "", ""], ["facebook", "120256366878570102", "120256366885940102", "Direct(Chancestoreegy)", "4655075", "120256366878570102", "120256366881430102"], ["All Aug | Sheglam page | CBO | 10/9", "New Sales Ad", "ig", "Instagram", "4655075", "120250399209600297", "120250399209580297"], ["Sheglam Camera On Primer & Setting Spray bundle | CBO | 19/7", "copy_E6B64A72-AADB-41AC-A807-FE18A0294D18", "fb", "Facebook", "4655075", "120249303880400297", "120249303880410297"], ["Sheglam Concealer Like Magic 12 hour full coverage | Testing | Sales | ABO | 14/10/2026", "Vid | Influncer | review | makeupbymayar", "fb", "Facebook", "4655075", "23860668453010793", "23860668453040793"], ["Black F Wedding Offers | CBO | 10/10", "New Sales Ad - Copy 4", "fb", "Facebook", "4655075", "", ""], ["SHEGLAM Glass Lock Air Gloss | CBO | 5/5", "‏‎Advantage+‎ Lock air gloss 011‏", "fb", "Facebook", "4655075", "120244481106590297", "120244481106670297"], ["SHEGLAM Line To Shine Peel-Off Lip Stain & Gloss Duo | Testing | Sales | ABO | 14/10/2026", "Vid |Product Review 3", "ig", "Instagram", "shopify_draft_order", "23860668558160793", "23860668558200793"], ["facebook", "Catalog 2 | Vid - Carosoul | Makeup | Summer Offer", "fb", "Facebook", "4655075", "120250399209600297", "120250399209580297"], ["All Aug | Sheglam page | CBO | 10/9", "New Sales Ad - Copy 31", "fb", "Facebook", "4655075", "120250399209600297", "120250399209580297"], ["facebook", "120256366878570102", "120256366889840102", "Instagram", "4655075", "120256366878570102", "120256366881430102"], ["All Aug | Sheglam page | CBO | 10/9", "New Sales Ad - Copy 44", "fb", "Facebook", "4655075", "", ""], ["Shein Muge Leen Thanks For The Love Lip Set 12 Pcs | Testing | Sales | ABO | 18/10/2026 - Copy", "Vid | UGC | Product review 2", "fb", "Facebook", "shopify_draft_order", "23860703661620793", "23860703661670793"], ["2 Sheglam Boldline Gel Eyeliner + Free Sharpener | CBO | 26/8", "New Sales Ad - Copy 3", "ig", "Instagram", "4655075", "120250180734660297", "120250180734680297"], ["whats_app", "VIP15", "", "Direct(Chancestoreegy)", "shopify_draft_order", "", ""], ["Sheglam Concealer Like Magic 12 hour full coverage | Testing | Sales | ABO | 14/10/2026", "Vid | Influncer | review | makeupbymayar", "ig", "Instagram", "4655075", "23860668453010793", "23860668453040793"], ["SHEGLAM Big Energy Mascara-Black | CBO | 19/7 | catalog on", "2---", "fb", "Facebook", "4655075", "120249303749750297", "120249303749760297"], ["tiktok", "All Vids | CBO | Max results", "", "Direct(Chancestoreegy)", "4655075", "1876205392898337", ""], ["SHEGLAM Pore No More Primer | Testing | Sales | ABO | 18/10/2026", "Vid | Influncer | Review | retal aziz", "fb", "Facebook", "4655075", "23860703580050793", "23860703580040793"], ["All Aug | Sheglam page | CBO | 10/9", "New Sales Ad - Copy 3", "ig", "Instagram", "4655075", "120250399209600297", "120250399209580297"], ["All Aug | Sheglam page | CBO | 10/9", "New Sales Ad - Copy 31", "ig", "Direct(Chancestoreegy)", "4655075", "120250399209600297", "120250399209580297"], ["All Aug | Sheglam page | CBO | 10/9", "New Sales Ad - Copy 44", "ig", "Instagram", "4655075", "120250399209600297", "120250399209580297"], ["All Aug | Sheglam page | CBO | 10/9", "New Sales Ad - Copy 16", "ig", "Instagram", "4655075", "120250399209600297", "120250399209580297"], ["SHEGLAM Glass Lock Air Gloss | CBO | 5/5", "Advantage+‎ Lock air gloss 01", "fb", "Facebook", "4655075", "120244481106590297", "120244481106610297"], ["SHEGLAM Bold Moves Kohl Cream Eyeliner Pencil | Testing | Sales | ABO | 12/10/2026", "Reels | UGC | How Use", "fb", "Direct(Chancestoreegy)", "4655075", "23860645838320793", "23860645838330793"], ["facebook", "", "Facebook_UA", "Facebook", "shopify_draft_order", "", ""], ["All Aug | Sheglam page | CBO | 10/9", "New Sales Ad - Copy 24", "ig", "Instagram", "shopify_draft_order", "120250399209600297", "120250399209580297"], ["facebook", "Catalog 2 | Vid - Carosoul | Makeup | Summer Offer_Group_1", "fb", "Facebook", "4655075", "120250399209600297", "120250399209580297"], ["", "", "", "Google", "4655075", "", ""], ["Camera on powder | CBO | 30\\9 - ANC", "New Sales Ad - Copy 6", "ig", "Instagram", "4655075", "120248026336250125", "120248026336310125"], ["All Aug | Sheglam page | CBO | 10/9", "New Sales Ad - Copy", "ig", "Direct(Chancestoreegy)", "4655075", "120250399209600297", "120250399209580297"], ["Sheglam Camera On Primer & Setting Spray bundle | CBO | 19/7", "copy_E6B64A72-AADB-41AC-A807-FE18A0294D18", "fb", "Facebook", "4655075", "", ""], ["Sheglam Camera On Primer & Setting Spray bundle | CBO | 19/7", "copy_E6B64A72-AADB-41AC-A807-FE18A0294D18", "ig", "Instagram", "4655075", "120249303880400297", "120249303880410297"], ["2 Sheglam Boldline Gel Eyeliner + Free Sharpener | CBO | 26/8-SiteLink", "New Sales Ad - Copy 3", "fb", "Facebook", "4655075", "120250180734660297", "120250180734680297"], ["Arencia Holy Hyssop Serum 30 All Skin | CBO | 6/10", "New Sales Ad - Copy 8", "fb", "Facebook", "4655075", "", ""], ["chatgpt.com", "", "", "Direct(Chancestoreegy)", "4655075", "", ""], ["Camera on powder | CBO | 30\\9 - ANC", "New Sales Ad - Copy 9", "fb", "Facebook", "4655075", "120248026336250125", "120248026336310125"], ["Shein Muge Leen Thanks For The Love Lip Set 12 Pcs | Testing | Sales | ABO | 18/10/2026 - Copy", "Vid |Influencer Review | Hala", "fb", "Facebook", "4655075", "23860703661620793", "23860703661670793"], ["Bosta", "Bosta", "", "Direct(Chancestoreegy)", "4655075", "", ""], ["Black F Wedding Offers | CBO | 10/10", "New Sales Ad - Copy", "fb", "Facebook", "4655075", "", ""], ["SHEGLAM Big Energy Mascara-Black | CBO | 19/7 | catalog on", "2---", "fb", "Direct(Chancestoreegy)", "4655075", "120249303749750297", "120249303749760297"], ["facebook", "", "Facebook_UA", "Facebook", "4655075", "", ""], ["Camera on powder | CBO | 30\\9 - ANC", "New Sales Ad - Copy 6", "fb", "Facebook", "4655075", "120248026336250125", "120248026336310125"], ["SHEGLAM Glass Lock Air Gloss | CBO | 5/5", "Advantage ‎ Lock air gloss 01", "ig", "Direct(Chancestoreegy)", "4655075", "120244481106590297", "120244481106610297"], ["tiktok", "All Vids | CBO | Max results", "", "Direct(Chancestoreegy)", "shopify_draft_order", "1876205392898337", ""], ["All Aug | Sheglam page | CBO | 10/9", "New Sales Ad - Copy", "fb", "Facebook", "shopify_draft_order", "120250399209600297", "120250399209580297"], ["All Aug | Sheglam page | CBO | 10/9", "New Sales Ad - Copy 31", "ig", "Instagram", "4655075", "120250399209600297", "120250399209580297"], ["All Aug | Sheglam page | CBO | 10/9", "New Sales Ad - Copy 6", "fb", "Facebook", "4655075", "120250399209600297", "120250399209580297"], ["All Aug | Sheglam page | CBO | 10/9", "New Sales Ad - Copy 6", "ig", "Instagram", "4655075", "120250399209600297", "120250399209580297"], ["All Aug | Sheglam page | CBO | 10/9", "New Sales Ad - Copy 43", "ig", "Direct(Chancestoreegy)", "4655075", "120250399209600297", "120250399209580297"], ["All Aug | Sheglam page | CBO | 10/9", "New Sales Ad - Copy 29", "ig", "Instagram", "4655075", "120250399209600297", "120250399209580297"], ["Home Wear |Testing ABO | 20/10/2026", "Vid | EGC | Offer | Esraa", "fb", "Facebook", "4655075", "120250980908950297", "120250980909280297"], ["All Aug | Sheglam page | CBO | 10/9", "New Sales Ad - Copy 9", "fb", "Facebook", "4655075", "", ""], ["Dr.Melaxin Peel Shot Exfoliant Black Rice Ampoule - 80ml | Testing | Sales | ABO | 19/10/2026", "Vid | With Music | Product Show 2", "fb", "Facebook", "4655075", "23860718148860793", "23860718148850793"], ["Shein Muge Leen Thanks For The Love Lip Set 12 Pcs | Testing | Sales | ABO | 18/10/2026 - Copy", "Vid | UGC | Product showing", "fb", "Facebook", "4655075", "23860703661620793", "23860703661670793"], ["SHEGLAM Bold Moves Kohl Cream Eyeliner Pencil | Testing | Sales | ABO | 12/10/2026", "Reels | How Use", "fb", "Facebook", "4655075", "23860645838320793", "23860645838330793"], ["", "", "", "Google", "shopify_draft_order", "", ""], ["SHEGLAM Pore No More Primer | Testing | Sales | ABO | 18/10/2026", "Vid | Influncer | Review | IOmnya Elmasry", "fb", "Facebook", "4655075", "23860703580050793", "23860703580040793"], ["ig", "", "link_in_bio", "Direct(Chancestoreegy)", "4655075", "", ""], ["Black F Wedding Offers | CBO | 10/10", "New Sales Ad - Copy 4", "ig", "Direct(Chancestoreegy)", "4655075", "120250848485870297", "120250848486120297"], ["facebook", "2---", "fb", "Facebook", "4655075", "120249303749750297", "120249303749760297"], ["facebook", "120256366878570102", "120256366894810102", "Instagram", "4655075", "120256366878570102", "120256366881430102"], ["Camera on powder | CBO | 30\\9 - ANC", "New Sales Ad - Copy 6", "ig", "Direct(Chancestoreegy)", "4655075", "120248026336250125", "120248026336310125"], ["Camera on powder | CBO | 30\\9 - ANC", "New Sales Ad - Copy 6", "ig", "Instagram", "shopify_draft_order", "120248026336250125", "120248026336310125"], ["Black F Wedding Offers | CBO | 10/10", "New Sales Ad - Copy 2", "fb", "Facebook", "4655075", "120250848485870297", "120250848486120297"], ["All Aug | Sheglam page | CBO | 10/9", "New Sales Ad - Copy 3", "fb", "Facebook", "4655075", "120250399209600297", "120250399209580297"], ["Camera on powder | CBO | 30\\9 - ANC", "New Sales Ad - Copy 6", "fb", "Facebook", "4655075", "", ""], ["Dr. Melaxin Peel Shot Exfoliating White Rice Ampoule 80ml | Testing | Sales | ABO | 20/10/2026", "Vid | With Music | Product Show 1", "ig", "Instagram", "4655075", "23860719623640793", "23860719623650793"], ["SHEGLAM Bold Moves Kohl Cream Eyeliner Pencil | Testing | Sales | ABO | 12/10/2026", "Reels | UGC | How Use", "ig", "Instagram", "4655075", "23860645838320793", "23860645838330793"], ["Shein Muge Leen Thanks For The Love Lip Set 12 Pcs | Testing | Sales | ABO | 18/10/2026 - Copy", "Vid | UGC | Product review 2", "fb", "Facebook", "4655075", "23860703661620793", "23860703661670793"], ["All Aug | Sheglam page | CBO | 10/9", "New Sales Ad - Copy 17", "fb", "Facebook", "4655075", "120250399209600297", "120250399209580297"], ["Black F Wedding Offers | CBO | 10/10", "New Sales Ad - Copy 2", "ig", "Instagram", "4655075", "120250848485870297", "120250848486120297"], ["2 Sheglam Boldline Gel Eyeliner + Free Sharpener | CBO | 26/8", "New Sales Ad - Copy 6", "fb", "Facebook", "4655075", "120250180734660297", "120250180734680297"], ["SHEGLAM Big Energy Mascara-Black | CBO | 19/7", "2--", "fb", "Facebook", "4655075", "", ""], ["All Aug | Sheglam page | CBO | 10/9", "New Sales Ad - Copy 33", "ig", "Instagram", "4655075", "120250399209600297", "120250399209580297"], ["SHEGLAM Big Energy Mascara-Black | CBO | 19/7", "2--", "ig", "Instagram", "shopify_draft_order", "120249303749750297", "120249303749760297"], ["{{campaign.name}}", "{{ad.name}}", "{{site_source_name}}", "Instagram", "4655075", "", ""], ["SHEGLAM Glass Lock Air Gloss | CBO | 5/5", "Advantage+‎ Lock air gloss 01", "ig", "Direct(Chancestoreegy)", "4655075", "120244481106590297", "120244481106610297"], ["SHEGLAM Big Energy Mascara-Black | CBO | 19/7 | catalog on", "2---", "ig", "Instagram", "4655075", "120249303749750297", "120249303749760297"], ["SHEGLAM Big Energy Mascara-Black | CBO | 19/7", "2---", "fb", "Facebook", "4655075", "", ""], ["All Aug | Sheglam page | CBO | 10/9", "New Sales Ad - Copy 24", "ig", "Instagram", "4655075", "120250399209600297", "120250399209580297"], ["All Aug | Sheglam page | CBO | 10/9", "New Sales Ad - Copy 13", "fb", "Facebook", "4655075", "120250399209600297", "120250399209580297"], ["All Aug | Sheglam page | CBO | 10/9", "New Sales Ad - Copy 4", "fb", "Facebook", "4655075", "120250399209600297", "120250399209580297"], ["All Aug | Sheglam page | CBO | 10/9", "New Sales Ad - Copy 44", "ig", "Direct(Chancestoreegy)", "4655075", "120250399209600297", "120250399209580297"], ["facebook", "120256391691300102", "120256391695330102", "Facebook", "4655075", "120256391691300102", "120256391691520102"], ["All Aug | Sheglam page | CBO | 10/9", "New Sales Ad - Copy 35", "ig", "Instagram", "4655075", "120250399209600297", "120250399209580297"], ["Black F Wedding Offers | CBO | 10/10", "New Sales Ad - Copy", "fb", "Direct(Chancestoreegy)", "4655075", "", ""], ["SHEGLAM Big Energy Mascara-Black | CBO | 19/7", "2--", "fb", "Facebook", "4655075", "120249303749750297", "120249303749760297"], ["Scaling | Catalog | Sheglam page | CBO | 10/9", "Catalog 2 | Vid - Carosoul | Makeup | Summer Offer_Group_1", "fb", "Facebook", "4655075", "120250399209600297", "120250399209580297"], ["Black F Wedding Offers | CBO | 10/10", "New Sales Ad - Copy", "fb", "Facebook", "4655075", "120250848485870297", "120250848486120297"], ["All Aug | Sheglam page | CBO | 10/9", "New Sales Ad - Copy 44", "ig", "Instagram", "shopify_draft_order", "120250399209600297", "120250399209580297"], ["Camera on powder | CBO | 30\\9 - ANC", "New Sales Ad - Copy 6", "th", "Threads", "4655075", "120248026336250125", "120248026336310125"], ["SHEGLAM Pore No More Primer | Testing | Sales | ABO | 18/10/2026", "Vid | Influncer | Review | retal aziz", "fb", "Facebook", "4655075", "23860703580050793", "23860743482630793"], ["SHEGLAM Bold Moves Kohl Cream Eyeliner Pencil | Testing | Sales | ABO | 12/10/2026", "Reels | UGC | How Use", "ig", "Instagram", "4655075", "23860645838320793", "23860743468880793"], ["Camera on powder | CBO | 30\\9 - ANC", "New Sales Ad - Copy 6", "fb", "Facebook", "shopify_draft_order", "120248026336250125", "120248026336310125"], ["SHEGLAM Bold Moves Kohl Cream Eyeliner Pencil | Testing | Sales | ABO | 12/10/2026", "Reels | UGC | How Use", "fb", "Facebook", "4655075", "23860645838320793", "23860743468880793"], ["Testing | Catalog | Makeup | Black F Wedding Offers | ABO | 22/10/2026", "Vid | Voiceover | Black Friday Offer", "ig", "Instagram", "4655075", "120251016024250297", "120251016024260297"], ["Dr. Melaxin Peel Shot Exfoliating White Rice Ampoule 80ml | Testing | Sales | ABO | 20/10/2026", "Vid | With Music | Product Show 1", "fb", "Facebook", "4655075", "23860719623640793", "23860719623650793"], ["All Aug | Sheglam page | CBO | 10/9", "New Sales Ad - Copy 44", "fb", "Direct(Chancestoreegy)", "4655075", "", ""], ["Dr.Melaxin Peel Shot Exfoliant Black Rice Ampoule - 80ml | Testing | Sales | ABO | 19/10/2026", "Vid | With Music | Product Show 2", "ig", "Direct(Chancestoreegy)", "4655075", "23860718148860793", "23860718148850793"], ["SHEGLAM Glass Lock Air Gloss | CBO | 5/5", "‏‎Advantage+‎ Lock air gloss 011‏", "ig", "Instagram", "shopify_draft_order", "120244481106590297", "120244481106670297"], ["All Aug | Sheglam page | CBO | 10/9", "New Sales Ad", "fb", "Facebook", "shopify_draft_order", "120250399209600297", "120250399209580297"], ["2 Sheglam Boldline Gel Eyeliner + Free Sharpener | CBO | 26/8", "New Sales Ad - Copy 6", "ig", "Instagram", "4655075", "120250180734660297", "120250180734680297"], ["facebook", "", "Facebook_UA", "Direct(Chancestoreegy)", "4655075", "", ""], ["Dr. Melaxin Peel Shot Exfoliating White Rice Ampoule 80ml | Testing | Sales | ABO | 20/10/2026", "Vid | With Music | Product Show 6", "ig", "Instagram", "4655075", "23860719623640793", "23860719623650793"], ["Camera on powder | CBO | 30\\9 - ANC", "New Sales Ad - Copy 9", "ig", "Instagram", "4655075", "120248026336250125", "120248026336310125"], ["facebook", "Advantage ‎ Lock air gloss 01", "ig", "Direct(Chancestoreegy)", "4655075", "120244481106590297", "120244481106610297"], ["Home Wear |Testing ABO | 20/10/2026", "Vid | voiceover | Product Show 4", "ig", "Instagram", "4655075", "120250980908950297", "120250980909290297"], ["Camera on powder | CBO | 30\\9 - ANC", "New Sales Ad - Copy 6", "fb", "Direct(Chancestoreegy)", "4655075", "120248026336250125", "120248026336310125"], ["Testing | Catalog | Makeup - AOV 500:1000 | Black F Wedding Offers | ABO | 24/10/2026 - Copy", "Vid | EGC | Summer Offer", "ig", "Instagram", "4655075", "120251052695650297", "120251052695690297"], ["facebook", "120256366878570102", "120256366885940102", "Direct(Chancestoreegy)", "shopify_draft_order", "120256366878570102", "120256366881430102"], ["SHEGLAM Big Energy Mascara-Black | CBO | 19/7", "2---", "fb", "Facebook", "4655075", "120249303749750297", "120249303749760297"], ["All Aug | Sheglam page | CBO | 10/9", "New Sales Ad - Copy 3", "fb", "Facebook", "shopify_draft_order", "120250399209600297", "120250399209580297"], ["Testing | Catalog | Makeup | Black F Wedding Offers | ABO | 22/10/2026", "Vid | Voiceover | Black Friday Offer", "fb", "Facebook", "4655075", "120251016024250297", "120251016024260297"], ["All Aug | Sheglam page | CBO | 10/9", "New Sales Ad - Copy 3", "ig", "Instagram", "shopify_draft_order", "120250399209600297", "120250399209580297"], ["SHEGLAM Glass Lock Air Gloss | CBO | 5/5", "‏‎Advantage+‎ Lock air gloss 011‏", "ig", "Instagram", "4655075", "120244481106590297", "120244481106670297"], ["Testing | Catalog | Makeup - AOV 500:1000 | Black F Wedding Offers | ABO | 24/10/2026 - Copy", "Vid | EGC 2 | Summer Offer", "ig", "Direct(Chancestoreegy)", "4655075", "120251052695650297", "120251052695690297"], ["SHEGLAM Big Energy Mascara-Black | CBO | 19/7", "2---", "ig", "Direct(Chancestoreegy)", "4655075", "120249303749750297", "120249303749760297"], ["Shein Muge Leen Thanks For The Love Lip Set 12 Pcs | Testing | Sales | ABO | 18/10/2026 - Copy", "Vid | UGC | Product showing", "ig", "Instagram", "4655075", "23860703661620793", "23860703661670793"], ["All", "", "fb", "Direct(Chancestoreegy)", "4655075", "", ""], ["SHEGLAM Big Energy Mascara-Black | CBO | 19/7 | catalog on", "2---", "fb", "Facebook", "shopify_draft_order", "120249303749750297", "120249303749760297"], ["All Aug | Sheglam page | CBO | 10/9", "New Sales Ad - Copy 3", "ig", "Direct(Chancestoreegy)", "4655075", "120250399209600297", "120250399209580297"], ["SHEGLAM Big Energy Mascara-Black | CBO | 19/7", "2---", "ig", "Instagram", "4655075", "120249303749750297", "120249303749760297"], ["Testing | Catalog | Makeup | Black F Wedding Offers | ABO | 22/10/2026", "Vid | EGC 2 | Summer Offer", "ig", "Instagram", "4655075", "120251016024250297", "120251016024260297"], ["Black F Wedding Offers | CBO | 10/10", "New Sales Ad - Copy 2", "fb", "Facebook", "4655075", "", ""], ["Sheglam Cutie Paw Blush Stamp | Testing | Sales | ABO | 26 /10/2026", "Vid | With Music | Product Show 4", "fb", "Facebook", "4655075", "23860779628110793", "23860779628100793"], ["All Aug | Sheglam page | CBO | 10/9", "New Sales Ad - Copy 3", "ig", "Facebook", "shopify_draft_order", "120250399209600297", "120250399209580297"], ["All Aug | Sheglam page | CBO | 10/9", "New Sales Ad - Copy 3", "fb", "Facebook", "4655075", "", ""], ["Testing | Catalog | Makeup | Black F Wedding Offers | ABO | 22/10/2026", "Vid | EGC 2 | Summer Offer", "fb", "Facebook", "4655075", "120251016024250297", "120251016024260297"], ["Shein Muge Leen Thanks For The Love Lip Set 12 Pcs | Testing | Sales | ABO | 18/10/2026 - Copy", "Vid | UGC | Product showing", "ig", "Direct(Chancestoreegy)", "4655075", "23860703661620793", "23860703661670793"], ["Sheglam Cutie Paw Blush Stamp | Testing | Sales | ABO | 26 /10/2026", "Vid | With Music | Product Show 4", "ig", "Instagram", "4655075", "23860779628110793", "23860779628100793"], ["SHEGLAM Bold Moves Kohl Cream Eyeliner Pencil | Testing | Sales | ABO | 12/10/2026", "Reels | UGC | Voiceover | features", "ig", "Instagram", "4655075", "23860645838320793", "23860779876050793"], ["SHEGLAM Bold Moves Kohl Cream Eyeliner Pencil | Testing | Sales | ABO | 12/10/2026", "Reels | UGC | Voiceover | features", "fb", "Facebook", "shopify_draft_order", "23860645838320793", "23860779876050793"], ["Testing | Catalog | Makeup - AOV 500:1000 | Black F Wedding Offers | ABO | 24/10/2026", "Vid | EGC 2 | Summer Offer", "fb", "Facebook", "4655075", "120251052695650297", "120251052695690297"], ["Testing | Catalog | Makeup | Black F Wedding Offers | ABO | 22/10/2026", "Vid | EGC 2 | Summer Offer", "ig", "Instagram", "shopify_draft_order", "120251016024250297", "120251016024260297"], ["SHEGLAM Bold Moves Kohl Cream Eyeliner Pencil | Testing | Sales | ABO | 12/10/2026", "Reels | UGC | Voiceover | features", "fb", "Facebook", "4655075", "23860645838320793", "23860779876050793"], ["Scaling | Sheglam Air Plush Lip and Cheek Cream | CBO | 2/6", "Vid | influencer | Product Show", "fb", "Facebook", "4655075", "120244589051220125", "120248849376370125"], ["Dr. Melaxin Peel Shot Exfoliating White Rice Ampoule 80ml | Testing | Sales | ABO | 20/10/2026", "Vid | With Music | Product Show 4", "fb", "Facebook", "4655075", "23860719623640793", "23860719623650793"], ["Testing | Catalog | Makeup - AOV 500:1000 | Black F Wedding Offers | ABO | 24/10/2026", "Vid | EGC 2 | Summer Offer", "ig", "Instagram", "shopify_draft_order", "120251052695650297", "120251052695690297"], ["Scaling | Sheglam Air Plush Lip and Cheek Cream | CBO | 2/6", "Vid | influencer | Product Show", "fb", "Facebook", "shopify_draft_order", "", ""], ["Dr.Melaxin Peel Shot Exfoliant Black Rice Ampoule - 80ml | Testing | Sales | ABO | 19/10/2026", "Vid | With Music | Product Show 3", "fb", "Facebook", "4655075", "23860718148860793", "23860718148850793"], ["Scaling | Sheglam Air Plush Lip and Cheek Cream | CBO | 2/6", "Vid | Product Show 3", "fb", "Facebook", "4655075", "", ""], ["Testing | Catalog | Makeup - AOV 500:1000 | Black F Wedding Offers | ABO | 24/10/2026", "Vid | EGC 2 | Summer Offer", "ig", "Instagram", "4655075", "120251052695650297", "120251052695690297"], ["Testing | Catalog | Makeup - AOV 1000:1500 | Black F Wedding Offers | ABO | 26/10/2026", "Vid | EGC 2 | Summer Offer", "fb", "Facebook", "4655075", "120251075103080297", "120251075103120297"], ["All Aug | Sheglam page | CBO | 10/9", "New Sales Ad - Copy 3", "th", "Direct(Chancestoreegy)", "4655075", "120250399209600297", "120250399209580297"], ["Scaling | Catalog | Sheglam page | CBO | 10/9", "Catalog 2 | Vid - Carosoul | Makeup | Summer Offer_Group_1", "fb", "Facebook", "shopify_draft_order", "", ""], ["facebook", "{{campaign.id}}", "{{ad.id}}", "Instagram", "4655075", "", "{{adset.id}}"], ["Korean Products Page | Testing | Sales | ABO | 26 /10/2026", "Vid | Voiceover | Black F Offer", "fb", "Facebook", "4655075", "23860779677230793", "23860779677240793"], ["facebook", "120247502496020297", "120247502496080297", "Instagram", "4655075", "120247502496020297", "120247502496010297"], ["facebook", "120256391691300102", "120256391695610102", "Instagram", "4655075", "120256391691300102", "120256391691520102"], ["SHEGLAM Big Energy Mascara-Black | CBO | 19/7", "2--", "ig", "Instagram", "4655075", "120249303749750297", "120249303749760297"], ["SHEGLAM Bold Moves Kohl Cream Eyeliner Pencil | Testing | Sales | ABO | 12/10/2026", "Reels | UGC With Music | How Use", "fb", "Facebook", "4655075", "23860645838320793", "23860779876050793"], ["SHEGLAM Bold Moves Kohl Cream Eyeliner Pencil | Testing | Sales | ABO | 12/10/2026", "Reels | With Music | Product Show", "fb", "Facebook", "4655075", "23860645838320793", "23860779876050793"], ["SHEGLAM Bold Moves Kohl Cream Eyeliner Pencil | Testing | Sales | ABO | 12/10/2026", "Reels | With Music | Product Show", "ig", "Instagram", "4655075", "23860645838320793", "23860779876050793"], ["Home Wear |Testing ABO | 20/10/2026", "Vid | voiceover | Cinderella", "ig", "Instagram", "4655075", "120250980908950297", "120251074546010297"], ["ig", "120237163538170297", "120237163552210297", "Instagram", "4655075", "120237163538170297", "120237163552200297"], ["Testing | Catalog | Makeup | Black F Wedding Offers | ABO | 22/10/2026", "Vid | Voiceover | Black Friday Offer", "ig", "Direct(Chancestoreegy)", "4655075", "120251016024250297", "120251016024260297"], ["", "", "", "Wl", "4655075", "", ""], ["Shein Muge Leen Thanks For The Love Lip Set 12 Pcs | Testing | Sales | ABO | 18/10/2026 - Copy", "Vid | UGC | Product showing", "th", "Threads", "4655075", "23860703661620793", "23860703661670793"], ["Testing | Catalog | Makeup - AOV 1000:1500 | Black F Wedding Offers | ABO | 26/10/2026", "Vid | EGC | Summer Offer", "ig", "Instagram", "4655075", "120251075103080297", "120251075103120297"], ["Testing+|+Catalog+|+Makeup+-+AOV+500:1000+|+Black+F+Wedding+Offers+|+ABO+|+24/10/2026", "Vid+|+EGC+2+|+Summer+Offer", "fb", "Facebook", "4655075", "120251052695650297", "120251052695690297"], ["Testing | Catalog | Makeup | Black F Wedding Offers | ABO | 22/10/2026", "Vid | EGC | Summer Offer", "ig", "Direct(Chancestoreegy)", "4655075", "120251016024250297", "120251016024260297"], ["Dr. Melaxin Peel Shot Exfoliating White Rice Ampoule 80ml | Testing | Sales | ABO | 20/10/2026", "Vid | With Music | Product Show 4", "ig", "Instagram", "4655075", "23860719623640793", "23860719623650793"], ["Camera+on+powder+|+CBO+|+30\\9+-+ANC", "New+Sales+Ad+-+Copy+6", "fb", "Direct(Chancestoreegy)", "4655075", "120248026336250125", "120248026336310125"], ["facebook", "120256366878570102", "120256366889840102", "Instagram", "shopify_draft_order", "120256366878570102", "120256366881430102"], ["Home Wear |Testing ABO | 20/10/2026", "Vid | voiceover | Cinderella", "fb", "Facebook", "4655075", "120250980908950297", "120251074546010297"], ["Testing | Catalog | Makeup | Black F Wedding Offers | ABO | 22/10/2026", "Vid | EGC | Summer Offer", "ig", "Instagram", "4655075", "120251016024250297", "120251016024260297"], ["Testing | Catalog | Makeup | Black F Wedding Offers | ABO | 22/10/2026", "Vid | EGC | Summer Offer", "fb", "Facebook", "4655075", "120251016024250297", "120251016024260297"], ["Testing+|+Catalog+|+Makeup+|+Black+F+Wedding+Offers+|+ABO+|+22/10/2026", "Vid+|+EGC++|+Summer+Offer", "ig", "Direct(Chancestoreegy)", "4655075", "120251016024250297", "120251016024260297"], ["Black+F+Wedding+Offers+|+CBO+|+10/10", "New+Sales+Ad+-+Copy+2", "ig", "Instagram", "4655075", "120250848485870297", "120250848486120297"]];
const ORDER_PATCH_PROD = ["Eva Hair Clinic - Ekeratin Dual Action Hair Serum 100 ml", "Cosrx Advanced Snail 96 Mucin Power Essence - 100ml", "Purito Seoul Mighty Bamboo Panthenol moisture Barrier Cream 100ml", "SHEGLAM Camera On Blurring Setting Powder Balm", "Sheglam Marshmallow Puff Lip Blur Pen", "sheglam Boldline Eyeliner Gel", "SHEGLAM Matte Allure Lipstick", "SHEGLAM Pore No More Primer", "SHEGLAM Complexion Pro Long Lasting Breathable Matte Foundation", "SHEGLAM Dream Touch Bronzer", "SHEGLAM Lock & Go Cushion Foundation Long Lasting Refill Pack", "SHEGLAM Camera On Smooth And Blur Primer", "SHEGLAM Buttery Buff Contour and Bronzer Stick", "SHEGLAM Peel Talk Lip Tint", "SHEGLAM Like Magic hydrating Concealer", "SHEGLAM Brow-Fection Angled Brush & Dip", "SHEGLAM Insta-Ready Sunset Blur Setting Powder", "Sheglam Insta Wing Heart Stamp Eyeliner", "SHEGLAM Baked Glow Setting Powder", "Metal Eyelash Comb & Lash Separator", "SHEGLAM Lip Dazzler Glitter Lip Kit", "Sheglam Concealer Like Magic 12 hour full coverage", "SHEGLAM Skinfinite Hydrating Foundation", "SHEGLAM Bold Moves Kohl Cream Eyeliner Pencil", "Women’s  2Pcs Lingerie Set", "SHEGLAM Camera On Blurring Waterproof Setting Spray 60ml", "Sheglam Trio Hero Face Palette", "Rose Berry Makeup Brush", "sheglam pro core brush kit 6pcs", "Kiki Beauty Puff Box", "Women's Red Mesh Bodycon Mini Dress with Long Sheer Robe", "Pink Floral Maxi Dress & Robe Set", "SHEGLAM Soft Haze Lip Blur Liquid", "SHEGLAM Glass Lock Air Gloss", "SHEGLAM Line and Define Waterproof Liquid Eyeliner", "SHEGLAM Buttery Bling Highlight Stick", "Sheglam Tint Lock Tattoo Peel Off Brow Gel", "SHEGLAM Skin Sync Satin Foundation", "Labello Lip Balm Moisturising Lip Care Watermelon Shine 4.8g", "Sheglam All-In-One Volume and Length Mascara-waterproof brugundy", "Shein Matte Shimmer Eyeshadow Palette 9-Color Glitter Matte 901-2", "SHEGLAM Creamsicle Eyeshadow Stick", "SHEGLAM Palette Eyeshadow 9-Clolor Shimmer Metallic Matte", "Shein 10 pairs of natural-looking crisscross cat", "Sheglam Flex Bond Lash Bond And Seal", "sheglam brow on demand 2 in 1 brow pencil", "SHEGLAM Streamline Brow and Eyeliner Gel", "SHEGLAM True Stain Liquid Lip Liner", "SHEGLAM Color Bloom Liquid Blush", "SHEGLAM All-In-One Volume and Length Mascara-Waterproof Macchiato", "Maange 8Pcs Makeup Brush Black", "SHEGLAM Good Grip Hydrating Prime and Set Spray", "SHEGLAM Good Grip Hydrating Primer", "YIGUO Makeup Organizer", "SHEGLAM Brow Fection Micro Stroke Liquid Pen", "Sheglam Lashlighter Infinite Tubing Mascara", "SHEGLAM Line To Shine Peel-Off Lip Stain & Gloss Duo", "Sheglam Crystal Intentions Vibe Shield Long-Lasting Setting Spray", "Maaange 5Pcs Makeup Brush White", "Sheglam Glazed & Locked Glossy Lip Tint", "Sheglam Sunspell Freckle & Flush Pen", "Shein 13pcs brown Makeup Brushes + 3pcs Sponge", "Beauty Blender Sponge Makeup", "essence Lash Princess False Lash Effect Mascara", "SHEGLAM Mirror Move Gloss Transparent Multi-Fonctionnel", "SHEGLAM Starlight Velvet Lipstick", "Sheglam All-In-One Volume and Length Mascara-Waterproof Blue", "SHEGLAM Lashlighter Up And Out Mascara", "SHEGLAM Crystal Jelly Glaze Stick", "CYBELE 3D Mascara 01 Extra Volume Dark Black", "SHEGLAM Set Me Up Brow", "Celimax The Vita A Retinal Shot Tightening Booster 15 ml", "Navy Velvet 3 Piece Pajama Set with Lace Cami Pants & Robe", "Winter Pajama Set 3 Pcs Plush Robe & Floral Pants", "Black Lip Print Mini Dress & Robe Set", "Kiki Spa Head Band & Wristband Set", "SHEGLAM Pout-Perfect Shine Lip Plumper", "SHEGLAM All-In-One 24k Multi-Effect Mascara", "SHEGLAM So-Lipe Lip Liner", "Sheglam Go Go Glow Body Highlighter Powder", "Sponge Makeup Multicolor", "Maybelline Colossal Kajal 12H Extra Black", "Shein Muge Leen Thanks For The Love Lip Set 12 Pcs", "Sheglam Bright Eyes Cooling Concealer", "Sheglam Hideaway Full-Coverage Concealer", "Black Sheer Mesh Maxi Lingerie Dress with Gold Chain Detail", "Sheglam Boldline Gel Liner Sharpener", "SHEGLAM Airy Tinted Volumizing Brow Mousse", "SHEGLAM For The Flush Lip and Cheek Tint", "SHEGLAM Sunburst Glow Mixer", "Sheglam Air Plush Lip and Cheek Cream", "SHEGLAM Lash Lighter Ez Remover Lash Treatment", "Sheglam Twist Top Volume & Length Mascara – Black", "sheglam on-line creamy eyeliner black", "SHEGLAM Stick Em Up Lifting Brow Soap", "Rose Berry Liquid Highlighter", "Sheglam Real Flow Laminating Brow Pen", "Casanova Natural Hair Food 150g", "SHEGLAM So Lippy Lip Liner", "Sheglam Glass Glow Blush Stick", "SHEGLAM Boldline Gel Liner Sharpener", "Sheglam Gel Glide Eyeliner Pencil", "SHEGLAM Wake Up Call Undereye Color Corrector", "SHEGLAM Magic Veil Setting Powder", "SHEGLAM Snatch n' Define Stick", "SHEGLAM Buttery Bliss Blush Stick", "Sheglam The Twilight Immortality Lip Tint", "SHEGLAM Glitter Whip Liquid Lipstick", "Gold Tone Stainless Steel Oval Crystal Halo Multi Band Ring", "Kiki Dual Ended Foundation & Contour Makeup Brush", "Black Feather Trim Robe & Mini Dress Set", "Women's Butterfly Detail Ruched Mini Dress", "Burgundy Glitter Mermaid Maxi Dress", "ROSE BERRY Translucent Loose Setting Powder 29g", "SHEGLAM Hydrating Silk Slip Lip Oil Balm", "Sheglam Glam 101 Hybrid Highlighter and Blush Duo", "SHEGLAM Sunbeam Shimmer Liquid Bronzer", "SHEGLAM Insta-Ready Face Powder DUO", "SHEGLAM Stardust Swipe Glitter Liquid Lipstick", "Sheglam Silky Glow Lip & Eye Pen", "Some By Mi Retinol Intense Trial Kit Eye cream + Serum 10 ml", "Sheglam Mauve Mood Palette 9 Colors", "SHEGLAM Lip Rules Liner and Gloss Pen", "SHEGLAM Set Me Up Brow Hold-Crystal Clear", "Sheglam Cheek 2 Cheek Blush", "SHEGLAM Veil Cushion Lightweight Lipstick", "SHEGLAM Insta-Party Glitter Liner", "SHEGLAM Phantom's Kiss Lip Gloss Palette", "SHEGLAM The Everywhere 4-In-1 Pen", "Sheglam Flutter Wink Volumizing Mascara black", "SHEGLAM Eyeshadow Palette Lotus to Lava", "SHEGLAM The Essential Pocket Eyeshadow Palette", "SHEGLAM Cheeky Color Jam Cream Blush", "SHEGLAM Wing It Waterproof Liner Duo", "Black & Gold Foundation Concealer Brush", "Sheglam Complexion Boost Concealer Sponge Head Applicator", "SHEGLAM Hair Smooth Moves Dual-Head Electric Bikini Trimmer", "Sheglam Cutie Paw Blush Stamp", "Rose Berry Volumizing Mascara Blue 10ml", "SHEGLAM Matte Allure Liquid Lipstick", "SHEGLAM Butter Glow Melt Touch Ultra Hydrating Primer", "SHEGLAM Lock And Go Long Lasting Cushion Foundation", "Maybelline New York Fit Me Liquid Concealer Makeup", "Sheglam Perfect Skin High Coverage Concealer", "SHEGLAM All-In One Volume Length Mascara Waterproof Black", "SHEGLAM Pout Pillow Cushion Matte Liquid Lipstick", "SHEGLAM Very Cherry Cheek and Lip Cream Stack", "SHEGLAM Burgundy Palette 12-Color Matte Eyeshadow", "SHEGLAM Skinfinite Foundation Brush", "SHEGLAM Marilyn Monroe Matte Liquid Eyeliner", "sheglam good grip hydrating primer blueberry+aha", "SHEGLAM Jelly Wow Moisturizing Lip Oil", "SHEGLAM Playing Cupid Cream Blush", "SHEGLAM Divine Flush Matte Blush", "Sheglam Think Sharp Eyeliner", "SHEGLAM Pore Eraser Blurring Stick", "Ruched Bodycon Midi Dress with Bow Tie Straps", "Pajama Set with Lace Trim & Robe", "SHEGLAM Bold Booster Lip Plumper", "Arencia Holy Hyssop Serum 30 All Skin Types 50 g", "SHEGLAM Allure Mini 3 Piece Liquid Lipstick Set Feel Real", "SHEGLAM Micro Precision Ultra-Long Tip Eyeliner", "Women's Rhinestone Crop Top & Flared Pants", "SHEGLAM Skin Focus High Coverage Powder Foundation", "Medicube PDRN Pink Peptide Serum 30ml", "Sheglam Untrapted Waterproof Eyeliner Pencil", "Sheglam Lunar Orbit Blush Ball", "Sheglam retro coast 15 pan palette", "Eqqualberry Vitamin Illuminating Serum 30ml", "AMANDA Smart Matte Lipstick", "Rose Berry Eyebrow Kit – Eyebrow Pencil Eyeliner + Eyebrow Gel Mascara + Eyebrow Soap", "SHEGLAM Cloudline Blur Lip Liner", "Sheglam Boldline Longwear Multi-Function Gel Liner Set", "Sheglam Eyeshadow Palette “Journey Without Borders” Leave to Room 8 shades", "Sheglam Chroma Zone Multichrome Gel Liner", "SHEGLAM EZ Glide Matte Eyeliner Pencil Black", "SHEGLAM Jelly-Licious Hydrating Lip and Blush Tint", "SHEGLAM Dew And Done Skin Tint With Spf20", "SHEGLAM Glow Bloom Liquid Highlighter", "Abou Yossef foundation brush", "SHEGLAM Marrakesh Obsessed Palette Eyeshadow - 12 Shimmer Color", "SHEGLAM Fall In Line Peel Off Lip Liner Stain", "Rose Berry Easy Bare Setting Spray", "Daishiao Lipstick 4pcs Long Lasting Waterproof Lipstick Set", "SHEGLAM The Lord of the Rings Forces Of Fate Eyeshadow Duo", "SHEGLAM Vinyl Pop Color Palette-Color Me Crazy 9-Color", "SHEGLAM Starstruck Cream Eyeshadow Pot", "SHEGLAM Airglow Eye Tint", "SHEGLAM Insta-Ready Powder Puff", "46Pcs Professional Makeup Brush Kit with Wash Bag", "SHEGLAM Harry Potter Houses Of Hogwarts Glitter Liner", "SHEGLAM Clear Away Eye and Lip Makeup Remover", "SHEGLAM Swift Stroke Roller Eyeliner Pen", "Gold Stainless Steel Starfish Hand Chain Bracelet", "3 Pcs Plush Fleece Pajama Set with Hooded Jacket Beige & Plaid", "BH Cosmetics- Lavish Elegance 15 Piece Brush Set with Bag", "Sheglam Squeeze & Dot Matte Blush Paint", "Lashlighter Extend Enriching Lash Primer-White", "SHEGLAM Oh So Rich Matte Eyeliner", "SHEGLAM Pout Phresh Changing Lipstick", "SHEGLAM Matte Fresh Setting Spray", "Herbal Sensation Hair Mask Keratin 600ml", "Sheglam Glow Hero Bronzing Drops Bronzer", "SHEGLAM Big N Bright Eye Highlighter Pencil", "DON PINK MIDHA FRAGRANCE 6ML", "Stainless Steel North Star Pendant Necklace with Crystal Details", "Sheglam Berry Cute Cake Blush", "SHEGLAM Willy Wonka Bar Eyeshadow Palette - 8 Colors", "Real Techniques Ultra Plush Blush Makeup Brush", "Real Techniques 4 Miracle Complexion Sponges", "Stainless Steel Gold Tone Mesh Bracelet with Adjustable Chain", "Stainless Steel Gold Mesh Bracelet with Black Oval Charm", "Numbuzin NAD+ Retinol Volumetox Eye Cream with 50 Peptides 10ml", "Beauty of Joseon Revive Eye Serum Ginseng + Retinal 30ml", "Sheglam feather better liquid eyebrow pencil", "SHEGLAM Take A Hint Lip Tint", "SHEGLAM Ember Rose Eternal Flame Cream Blush", "Essence Lash Princess Mascara for false-lash-like lashes waterproof", "Amanda Milano Mega Lash Mascara water proof", "Arencia Vitamin C Booster Shot 30ml", "Sheglam Concealer Brush F201", "Sheglam dream touch blush", "Rose Berry Black Rosen Body Powder Dusting Powder 200G", "SHEGLAM Bold Booster Plumping Lip Liner", "Mary and May Spicule Collagen PDRN Cream 1000 Shot 15g", "SHEGLAM Lunar Glow Highlighter", "Beauty of Joseon Relief Sun Rice + Probiotics SPF50", "Dr. Althea Pure Grinding Cleansing Balm 50ml", "Artistic Touch Lip Serum 20 Ml", "Aloe Vera Soothing Gel 99%Tanako Lip Balm", "Pink Striped Satin Cami Pajama Set with Lace Trim", "SHEGLAM Triple Threat Correcting Primer 3 In 1 Color", "Shein Dikalu Eyeshadow Palette 9-Color 901-12", "SheIn Dikalu eyeshadow palette 9 color code 901-15", "Women's Lace Cami & Sheer Mesh Flared Pants Pajama Set", "SHEGLAM Big Energy Mascara Black", "Red Glitter Mermaid Maxi Dress", "Women's 2Pcs Lounge Set", "Red Leaf Jacquard Padded Cup Nightdress with Side Ruffle", "Satin Lace Chemise Nightdress Light Blue", "SHEGLAM Intensify Smudge-Proof Eyeliner Gel", "EVA Collagen Makeup Remover Cleanser 150 ml", "Re.MooN Colorful Satin Scrunchies kity", "Luxury Manicure & Pedicure Set - 22 pcs", "Star Ville whitening roll on fresh breeze 60 ml", "Rose Berry Travel Must Haves Makeup Brush - 4Pcs", "Starville Whitening Roll On Orient Pearl Scent 60 ml", "Women's Cut Out Maxi Dress", "Rose Berry Gel Eyeliner waterproof", "Sheglam Press Refresh Setting Spray", "LANGMANNI Liquid Lipcolor 2pcs Lip Gloss And Lipliner", "Eqqualberry Purple Rice Pore Purifying Pack Cleanser 130g", "Eqqualberry Purple PDRN Pore Minimizing Serum 30 ml", "SHEGLAM Fine Line 2-In-1 Nose Contour and Highlight Pen", "ایسنس قلم كحل اسود", "Sheglam Double Dot Freckle Pen", "Sheglam The Twilight Forbidden Love Liquid Blush", "SHEGLAM Glowchi Bouncy Highlighter", "Triangle Velvet Makeup Powder Puff Set - 2 Pcs", "SHEGLAM All-In-One Primer and Tubing Volume Mascara", "SHEGLAM 2-In-1 Contour & Highlight Stick", "SHEGLAM Pink Whip Bifida Ferment 30% Milky Toner", "Maange Makeup Brush Set 16 Pcs With Bag", "Maange 3Pcs Makeup Brush Black and White", "Maange 7Pcs Makeup Brush Brown", "Dr.Melaxin Peel Shot Exfoliant Black Rice Ampoule - 80ml", "Essence lash princess curl and volume mascara", "Maange 5Pcs Pro Double End Makeup Brush Brown", "sheglam pro core brush kit 8pcs", "Might Cinema Extreme Highlight-4 Color", "Champagne Ruched Long Sleeve Maxi Dress with Flared Hem", "SHEGLAM Berry Palette Matte Eyeshadow - 12 Colors", "SHEGLAM Ember Rose Immortal Love Lip Gloss", "Might Cinema Lip gloss matte 4094", "SHEGLAM Glide Control Liquid Eyeliner Matte Black", "SHEGLAM Rapid Retouch Cream Concealer", "Maange Brush Set With Bag10Pcs", "Maange 19Pcs Double Ended Makeup Brush Silver With Bag", "Clary Hair Serum 100 ml", "SHEGLAM Dynamat Boom Long Lasting Matte Lipstick", "Sheglam Aqua Flushed Gel Blush", "SHEGLAM Crystal Intentions Protection Mantra Roller Lip Oil", "Rozy Bikini Balm 40 ml", "Rozy Bikini mist 100 ml", "ROZY INTIMATE WASH", "SHEGLAM Jelly Wow Hydrating Lip Oil", "Maange 3Pcs Premium Makeup Brush Brown", "SHEGLAM Eyeshadow Palette 15Pan", "SHEGLAM Sunbeam Matte Liquid Bronzer", "Clean Secret Makeup Remover Pad", "Maange 5Pcs Makeup Brush Black and White", "Maybelline lifter lip gloss", "Maange 6 Pcs Double Ended Makeup Brush Dark Brown", "Inglot duraline prolong makeup", "Maange 7Pcs Makeup Brush Metalic Brown With Bag", "SHEGLAM Insta-Fill Brow Pencil", "Dr. Melaxin Peel Shot Exfoliating White Rice Ampoule 80ml", "shein lucky me 25-Color Eyeshadow Palette With Cosmetic Brush", "Sheglam Hair Hot Streak Leave-In Protection Serum 10ml", "SHEGLAM Super Man Glow Grip With Niacinamide Primer", "Azenlo DIY Lash Clusters Kit with Bond & Seal and Tweezers", "SHEGLAM Bounce Putty Pocket Lip Pot", "Tirtir Ceramic Milk Ampoule Jumbo 40ml", "Real Techniques Eye Shade + Blend Brush Set", "Sheglam The Twilight Forever Setting Spray", "Sheglam Multi-Tasker Line and Detail Eyeliner Pen-Black", "SHEGLAM Stay Inked Liquid Eyeliner", "Sheglam Lash Besties 2-In-1 Mascara black", "Essence I Love Extreme Crazy Volume Mascara", "SHEGLAM Good Grip Ultra Blur Primer", "KIKI Finger Puff – 4 Pcs Mini Triangle Makeup Puff", "Sheglam Lumi Lock & Go Cushion Foundation", "Sheglam Lock d In Setting Spray", "SHEGLAM Daydreamer Mini Palette", "Real Techniques Brush & Sponge Kit for Perfect Makeup", "SHEGLAM Insta-Ready Ultra Setting powder", "SHEGLAM Violet Vision Eyeshadow Palette", "Professional Manicure & Pedicure Tool Set - 16 Pcs", "Real Techniques Best Selling Blends Kit", "SHEGLAM Full-filled Eyebrow Palette", "Maange 10Pcs Makeup Brush Set With Bag", "Maange 10pcs Makeup Brush Set Black", "desio colored contact lenses", "SHEGLAM Color Correcting Even Better Primer", "6Pcs Professional Makeup Brush Kit with Bag", "21Pcs Pink Makeup Sponge & Puff Set with Wash Bag and Skincare Headband", "Inglot Amc Eyeliner Gel", "SHEGLAM Mirror Kiss High-Shine Lipstick", "Sheglam EZ Glide Matte Eyeliner Pencil Black", "SHEGLAM Snatch n Glow Stick", "Abou Yousef Style Nails Cat Eyes", "SHEGLAM BOSS BROW WATERPROOF POMADE", "SHEIN MAGIC CASA Matte Lip Gloss Set  5pcs Waterproof Liquid", "Sheglam Marilyn Monroe The Icon Lipstick", "Sheglam 3 in 1 Lip Kit - Soft 90 s Glam and Moody Taupe Lip Liner", "Karseell Maca Essence Oil for Body and Damaged Hair 50ml", "Sheglam Soft 90 s Glam 3 in 1 Lip Liner And Lip Duo Haute Cocoa", "SHEGLAM Stay Inked Waterproof Eyeliner Pen", "Maange 14Pcs Makeup Brush Dark Brown", "Revlon Uniq One All In One Hair Treatment 150ml", "SHEGLAM Hello Kitty Be My Baby Hydrating Lipstick", "Rose Berry Dusting Body Powder - 200 gm", "Sheglam Hold Em Up Tinted Brow Gel", "SHEGLAM All-In-One Volume and Length Mascara-Washable Black 2 In 1", "SHEGLAM Save It Laminating Brow Gel", "Shein Dikalu mini 9-color eyeshadow palette 09#", "SHEGLAM Jelly Wow Tinted Lip Oil", "Rose Berry Moisturizing Body Oil 200ml", "SHEGLAM So Rich Waterproof Eyeliner", "Maange 13Pcs Makeup Brush Rose Gold", "Medicube PDRN Pink Collagen Capsule Cream 55g – Skin Firming & Brightening", "Kiki Pencil Sharpener", "SHEGLAM Crystal Glaze Moisturizer and Lip Gloss", "SHEGLAM Sun Sculpt Liquid Contour", "Shein 15Pcs Makeup Brush Set", "Shaan Nourishing lip balm Rose spf30", "SHEGLAM Lip Facts Lip Liner", "Anua Azelaic Acid 10+ Hyaluron Serum 30ml", "SHEGLAM Good Grip Hydrating Primer - Travel Size", "كتاب الإدراك الصوتي التفاعلي الذكي للأطفال (عربي / إنجليزي)", "Women's Blue Floral Mesh 2 Pcs Lingerie Set", "Schwarzkopf got2b Glued Styling Spiking Glue", "SHEGLAM Mello Jello Nourishing Lip Balm", "SHEGLAM Sample Foundation Complexion Pro", "SHEGLAM Power Bouquet Lip Gloss", "Sanisa Korean foundation", "Maange Makeup Brush 7Pcs Black", "Sheglam Dark Romantasy Lip Liner + Lip Gloss Kit-Rich Velvet", "Maange 15Pcs Makeup Brush Black and White", "Daisy Floral Winter Pajama Set with Green Printed Pants", "Women's Beige Plaid Bow Pajama Set", "SHEGLAM Glam 101 Lipstick and Liner Duo", "SHEGLAM Pout Perfect Shimmer Lip Plumper", "20pcs Makeup Brush + 2Pcs Sponge Set", "Abou Yousef 36 Makeup Sponge", "Sheglam liquid blush brush", "KIKO Milano Bridgerton Bouquet Blush and Highlighter DUO", "Sheglam Glam 101 Eye Essentials Makeup Brush Set 4Pcs", "Cosmetic Makeup Brush Cleaner Electric Spinning", "SHEGLAM Rosé Line and Define Waterproof Liquid Eyeliner-Black", "Essence I Love Extreme Crazy Volume Mascara - Blue", "Anua Peach 77% Niacin Essence Toner 250 ml", "medicube TXA Niacinamide 15 Serum", "Anua PDRN Hyaluronic Acid Capsule 100 Serum 30ml", "OMANIAC 12 Piece Professional Makeup Brush Set", "Pink Heart Print 3Pcs Pajama Set", "Gingham Off Shoulder Ruffle Mini Dress", "Women’s White & Fuchsia Lace Corset Lingerie Set with Garter Straps", "Anua Niacinamide 10 TXA 4 Serum 30ml", "Sheglam Lashes Just Door Jessa", "SHEGLAM Sweet Cheeks Blush Trio", "SHEGLAM Good Grip Hydrating Travel Size Primer - Blueberry + Aha", "Sheglam Lunar Jelly Frosty Eyeshadow Stick", "Shiglam Dynamatte Boom Long-Lasting Matte Lipstick", "Sheglam Lift And Elevate Lengthening Mascara", "Sheglam Nude Beginnnings Eyeshadow Palette", "Zoeva Makeup Brush Set of 15 Pieces Brown", "Sheglam Insta-Ready Powder Puff Pink", "Black Autumn Floral Ruched Mini Dress", "Maange 16Pcs Professional Makeup Brush Dark Brown With Bag", "Maange Makeup Brush brown With Bag 13Pcs", "Gold Stainless Steel Snake Flat Chain Anklet", "SHEGLAM Hydra Jelly Pocket Lip Jam", "Gold Stainless Steel Ayat Al-Kursi Open Cuff Bracelet", "4-in-1 Magnetic Makeup Brush Set", "Dusty Pink Love Bird Pajama Set", "Pink Striped Satin Pajama Set for Women 2 Pcs Sleepwear", "Infinity Gel Sunscreen 50+ 60ml (1+1 Offer)", "Might Cinema Concealer", "SHEGLAM Floral Flush Blush Palette", "SHEGLAM Eyeshadow Palette - 9 Colors", "ORS Olive Oil Relaxer kit EXTRA", "Re.MooN Large Sillk Satin Bonnet", "SHEGLAM Sunburst Glow Mixer Sample", "Joe Makeup Tools 26Pcs Essentials Collection", "SHEGLAM Fluff Line Eyebrow Pencil", "Professional Angled Makeup Brush – Silver", "SHEGLAM Glam 101 Glossy Lip Liner and Lipstick", "Pink Panther Print T-Shirt Dress with Lace Sleeves", "KIKO MILANO Lumiverse infinite retouches flashes mascara", "Anua PDRN Hyaluronic Acid Capsule Mist - 100ml", "Sainte Valere Veloria EDP 100 ML", "Eva Senses Hair Mist Frosted Skies 100 ml", "اماندا جاردن بودي اسبلاش ٢٥٠مل رومانتك سیدكشن", "EQQUAL BERRY Lush Blush NAD + Peptide Boosting Serum 30ml", "Maange 20Pcs Professional Makeup Brushes Pink", "Maange 14Pcs Makeup Brush With Bag Black and White", "SHEGLAM Pro Precision Waterproof Liquid Eyeliner", "Women's Cut Out Halter Maxi Dress with High Slit", "M.N Eyeliner Gold Dynamic", "M.N Eyebrow pencil with eyebrow comb brush", "Maange 16Pcs Makeup Brush Dark Brown With Bag", "SHEGLAM Birthday Skin Primer", "SKIN1004 Madagascar Centella Poremizing Quick Clay Stick Mask 27g", "Skin1004 Madagascar Centella Hyalu cica Travel Kit", "SHEGLAM Skin Magnet High Coverage Foundation Stick", "Satin Lace Lingerie with Side Tie Detail", "Satin Lace Babydoll Lingerie", "Purple Satin Lace Lingerie Set", "Lace Babydoll Lingerie & Robe Set Peach Pink", "Velvet Look Halter Neck Nightdress", "SHEGLAM Booster Shine Plumping Lip Gloss", "Maange 13Pcs Makeup Brush With Bag Black"];
const ORDER_PATCH_DATA = "7286713844002:0:0*1.1*1.2*1;7286775480610:1:3*1;7286778200354:2:4*1.4*1;7286830334242:0:5*1;7286831481122:3:6*1.7*1.8*1;7286857269538:0:9*1.10*1.11*1.12*1;7286864707874:0:13*1;7286864970018:3:3*1;7286870016290:3:14*1;7286870311202:4:3*1;7286876799266:5:4*1.4*1.4*1.4*1;7286902161698:0:15*1.15*1;7286914548002:0:16*1;7286920872226:5:4*1.5*1;7286926934306:6:4*1;7286945251618:4:3*1;7286948659490:7:4*1;7286964453666:0:17*1;7286977954082:0:18*1.19*1.20*1.21*1.22*1.23*1;7286987063586:0:24*1;7287052042530:0:25*1.26*1.27*1.28*1.29*1.11*1;7287057908002:0:30*1.31*1.24*1;7287077110050:0:32*1.32*1.33*1.4*1.4*1;7287084155170:3:5*1;7287088316706:3:34*1.23*1;7287106109730:5:4*1.4*1;7287106666786:0:5*1;7287122067746:0:16*2;7287132356898:7:4*1.35*1;7287165518114:7:4*1;7287168860450:0:16*1;7287173087522:0:36*1;7287175708962:6:4*1;7287181476130:8:3*1;7287186161954:0:37*1.38*1.39*1.40*1.41*1.42*1;7287205429538:3:5*1;7287217226018:2:4*1;7287231316258:5:4*1;7287241474338:0:43*1.44*1.4*1.32*1.45*1.46*1;7287243309346:4:4*1;7287247995170:0:35*1.23*1;7287266902306:0:33*1;7287278960930:0:33*1.47*1.48*1.39*1.49*1.5*1;7287280435490:0:50*1.51*1.52*1;7287312056610:0:53*1;7287324999970:7:4*1.4*1;7287331750178:9:5*1.5*1.3*1;7287344365858:4:4*1;7287354360098:0:33*1.4*1;7287379689762:0:54*6;7287433429282:0:25*1.55*1.56*1.57*1.58*1.59*1;7287437820194:0:45*1;7287442899234:7:4*1.4*1;7287473340706:5:4*1.4*1;7287479337250:0:5*1.5*1;7287487660322:7:4*2;7287496900898:0:20*1.60*1.16*1.16*1;7287498899746:0:61*1.62*1.20*1.63*1.64*1.65*1;7287510204706:7:4*1;7287513940258:0:49*1.66*1.35*1.5*1.25*1;7287557259554:0:67*1;7287557882146:0:25*1.3*1.4*1.11*1.17*1.68*1;7287570039074:0:69*1.70*1.34*1.45*1;7287571513634:7:4*1;7287583703330:3:45*1;7287587012898:4:4*1;7287590945058:5:4*1.4*1;7287607591202:5:4*1;7287607918882:0:71*2;7287620108578:0:72*1.73*1.74*1;7287628464418:0:47*1.56*1.70*1;7287646880034:5:4*1;7287651795234:0:61*1.75*1;7287654285602:1:3*1;7287663821090:0:58*1.76*1.77*1.78*1.23*1.4*1;7287672865058:0:31*1;7287682924834:0:5*1.39*1.31*1.35*1;7287701012770:0:5*1.32*1.4*1.4*1.4*1.59*1;7287711760674:0:5*1.5*1;7287718510882:7:4*1;7287719985442:0:4*1.4*1;7287733748002:0:36*1.36*1;7287735288098:0:79*1;7287760388386:0:16*1;7287771136290:4:4*1;7287772414242:0:80*1.69*1.81*1.82*1.11*1;7287802986786:0:83*1.84*1;7287822680354:0:85*1;7287827988770:5:4*1;7287831265570:3:5*1.5*1.86*1.5*2.86*1;7287861117218:0:45*2;7287903519010:0:87*1;7287918919970:0:33*1.4*1.21*1;7287938941218:10:4*1.4*1;7287944544546:10:4*1.4*1;7287955390754:0:11*1.4*1;7287956275490:0:88*1.88*1.17*1;7288025514274:0:21*1;7288103043362:0:33*1.33*1.33*1;7288104616226:0:33*1.4*1;7288116445474:0:5*1.39*1;7288156487970:7:4*1.4*1;7288158126370:0:47*1;7288222875938:0:45*1.45*1;7288228741410:7:4*1;7288234541346:5:4*1;7288262230306:11:47*1.47*1.4*1;7288277106978:0:81*1.23*1.89*1.4*1;7288288280866:0:90*1.91*1;7288323440930:0:11*1.4*1.4*1.3*1.92*1;7288348901666:0:56*1;7288350540066:0:47*1.33*1.33*1.78*1;7288351129890:4:4*1;7288358568226:0:21*1.45*1.23*1;7288360403234:4:4*1;7288366596386:5:4*1.4*1;7288382914850:3:23*1;7288390385954:3:5*2;7288395104546:3:93*1;7288399102242:0:94*1.48*1.95*1;7288479449378:0:16*2;7288489738530:7:4*2.4*1.4*1;7288515166498:4:4*1;7288524210466:0:96*1.96*1.36*1;7288529715490:7:4*1;7288530698530:7:4*1.4*1;7288548524322:0:44*1;7288568316194:4:4*1.4*1;7288568709410:5:4*1;7288581947682:4:4*1.4*1;7288598790434:0:97*1.45*1.98*1.45*1;7288615207202:3:16*1;7288615862562:0:33*1;7288630935842:0:6*1.99*1;7288633917730:0:56*1;7288645091618:3:23*1.49*1;7288646926626:0:46*1;7288666816802:0:4*1.5*1.5*1.100*1.101*1.4*1;7288673927458:0:75*1;7288679498018:7:4*1;7288679694626:3:23*1.56*1;7288694243618:0:33*1;7288701747490:3:33*1.33*1;7288704434466:7:4*1.4*1;7288711938338:7:4*1;7288723276066:5:4*1;7288734122274:7:4*1;7288735596834:0:21*1;7288738742562:0:24*1.24*1;7288740643106:8:4*1.4*1;7288762859810:0:23*1;7288780161314:7:4*1;7288790974754:0:56*1;7288794480930:0:21*1.3*1;7288794579234:0:102*1.10*1.3*2.16*1;7288802705698:3:4*1.4*1;7288809816354:3:77*1.23*1;7288821317922:0:21*1;7288823447842:4:4*1;7288852021538:7:4*1.4*1;7288859984162:0:103*1;7288872403234:0:16*1.104*1.8*1;7288900616482:7:4*1;7288901042466:7:4*1.4*1;7288907301154:7:4*1;7288941576482:0:105*1.106*1.11*1.77*1.4*2;7288945017122:12:4*1;7288946262306:0:4*1.33*1.33*1;7288950653218:0:107*1.33*1;7288951079202:0:5*1.5*1;7288953930018:0:70*1.67*2.5*1.5*1.100*1.45*1;7288972443938:0:16*1;7288982765858:13:4*1.4*1;7289012519202:0:108*1;7289028378914:5:4*1;7289058951458:0:61*1.109*1.35*1.68*1.68*1;7289064227106:4:4*1;7289067798818:0:110*1.111*1.112*1;7289099747618:0:113*1.21*1;7289111478562:0:17*1.56*1.114*1.47*1.47*1.59*1;7289123209506:0:115*1.116*1;7289146212642:7:4*1.4*1;7289149554978:5:4*1.4*1;7289159057698:3:23*1;7289169936674:3:23*1;7289173377314:5:4*1.4*1;7289185042722:7:4*1.4*1.4*1;7289188221218:2:4*1.4*1;7289196871970:0:68*1.89*1;7289205391650:5:4*1;7289222005026:0:33*1;7289224298786:7:4*1.4*1;7289225150754:0:24*1.33*1;7289225249058:0:98*2.117*1;7289228853538:3:7*1.118*1.119*1;7289242059042:3:23*1;7289270599970:3:4*1.4*1.4*1.67*1;7289283576098:0:120*1.23*1;7289286918434:0:14*1;7289289015586:3:121*1.33*1.122*1.123*1.94*1.124*1;7289292947746:5:4*1;7289295798562:7:4*1;7289319358754:3:23*1;7289323749666:7:4*1;7289328369954:7:4*1;7289330467106:7:4*1;7289330925858:5:4*2;7289336824098:3:23*1;7289338822946:7:4*1.4*1;7289344721186:7:4*1;7289346720034:0:3*1.46*1.5*1.68*1;7289354518818:0:33*1.33*1.33*1;7289365659938:0:76*2;7289393512738:7:4*1;7289401803042:0:104*1.98*1.125*1.59*1;7289406751010:7:4*1;7289410945314:0:21*1.126*1;7289416188194:0:127*1.128*1.23*1.129*2.130*1.131*1;7289424249122:2:4*1;7289443287330:7:4*1;7289451217186:7:4*1;7289451479330:7:4*1.4*1;7289461080354:0:5*1.5*1.100*1;7289468289314:0:33*1.33*1;7289477726498:7:4*1;7289479004450:0:132*1.124*1.107*1.133*1.41*1;7289494077730:0:35*1;7289495879970:3:23*1;7289501384994:0:23*1.23*1;7289501810978:3:60*1;7289518817570:0:17*1.96*1.33*1;7289537265954:7:4*2.4*1;7289546244386:3:16*1;7289547030818:7:4*1;7289563971874:5:4*1;7289567052066:4:4*1.4*1;7289576554786:0:62*1.134*1.133*1;7289582944546:0:4*1.4*1;7289600508194:4:4*1;7289668960546:0:23*1;7289687212322:4:4*1;7289694519586:0:23*1;7289709855010:0:16*1;7289718079778:0:44*1.23*1.4*2.4*1.49*1.68*1;7289723846946:0:5*1;7289725419810:0:21*1;7289769918754:0:16*1;7289772802338:4:4*1;7289823920418:7:4*1;7289840075042:0:21*1;7289846989090:0:56*1;7289869369634:0:33*1;7289886441762:0:23*1;7289891684642:14:4*1;7289893880098:0:128*1;7289953026338:0:135*1.46*1.51*1.11*1.87*1;7289990316322:4:4*1.4*1;7290012107042:0:136*1;7290017939746:9:54*1.7*1.11*1.3*1;7290018726178:0:21*1;7290034749730:3:23*1;7290045792546:5:4*1.94*1.137*1.83*1.4*1;7290086916386:0:82*1;7290091602210:0:15*1.5*1.4*1;7290095075618:0:23*1;7290103660834:14:4*1.4*1;7290113917218:0:33*1;7290131480866:0:131*1.138*1.98*1.4*1.8*1;7290139083042:0:139*1.140*1.141*1.7*1.141*1.142*1;7290142490914:3:23*1.60*2.47*1;7290153042210:0:62*1.14*1.11*1.25*1.102*1;7290165559586:1:3*1;7290222772514:0:23*1;7290257703202:0:16*1;7290267336994:0:143*1.5*1.56*1;7290281984290:5:4*1;7290304299298:7:4*1.4*1;7290370785570:0:23*1.23*1;7290407452962:3:21*1.105*1;7290416857378:0:9*1;7290420920610:3:23*1.4*1.49*1.7*1.22*1;7290428424482:7:4*1.4*1;7290485965090:0:23*1;7290492223778:5:4*1;7290498351394:0:141*1;7290538983714:7:4*1;7290554974498:3:90*1.11*1.8*1.77*1;7290566705442:5:4*1.4*1;7290586857762:15:23*1;7290654851362:7:4*1;7290659275042:5:4*1.4*1;7290691485986:3:23*2;7290704298274:16:32*1.115*2.48*1.144*1;7290721960226:17:16*1;7290724647202:7:4*1;7290761609506:18:25*1.3*1;7290793460002:15:23*1.23*2;7290799063330:7:4*1.4*1;7290857914658:0:21*2;7290907230498:7:4*1;7290942390562:19:23*2;7290958217506:20:145*1.146*1.76*2.65*1;7290985906466:7:4*1;7291003601186:7:4*1;7291004354850:7:4*1.4*1;7291023917346:21:33*1.33*1.33*1.90*1.56*1.4*1;7291029618978:7:4*1;7291069235490:3:55*1.67*1.147*1.121*1.117*1.9*1;7291085455650:7:4*1;7291087388962:15:23*1;7291100758306:7:4*1.4*1;7291126251810:22:41*1.41*1.5*1;7291154923810:3:90*1.121*1.46*1;7291155808546:23:96*1.5*1;7291161772322:24:56*1;7291171995938:4:4*1;7291188609314:3:23*1;7291191099682:7:4*1;7291191820578:25:23*2;7291194147106:26:148*1.56*1.12*1.48*1.141*1;7291197227298:27:149*1.150*1.151*1.152*1.5*1;7291201061154:13:153*1.135*1.70*1;7291207483682:7:4*1;7291209974050:3:99*1.33*1.33*1.45*1;7291210498338:16:4*1.4*1;7291219018018:15:23*1;7291224490274:15:23*2.15*1.146*1.23*1;7291254178082:28:154*1.105*1.4*2;7291273249058:4:4*1;7291278426402:7:4*1.4*1;7291281801506:7:4*1;7291288027426:4:4*1;7291297857826:29:4*1.4*1;7291306606882:27:4*1;7291322335522:30:4*1;7291322794274:30:4*1;7291329937698:1:155*1.11*1.7*1.25*1.3*1;7291331543330:7:4*1;7291332460834:4:4*1;7291339211042:27:4*1.4*1;7291371684130:1:3*1;7291381645602:3:23*1.33*1;7291382890786:31:156*1.157*1.24*1;7291387740450:16:33*1.33*1.158*1;7291399602466:32:33*1.33*1.33*1.33*1.33*1;7291401437474:13:4*1.4*1;7291409727778:7:4*1.4*1;7291410350370:33:159*1;7291418870050:16:160*1;7291453047074:7:4*1;7291460649250:30:118*1;7291475853602:27:4*1;7291484930338:34:33*1.161*1.3*1.5*1;7291494957346:24:56*1;7291540144418:7:4*1;7291546665250:7:4*1;7291641430306:35:16*1;7291741929762:7:4*1.4*1;7291748745506:36:13*1;7291793965346:7:4*1.4*1;7291813560610:7:4*1;7291823554850:37:4*2.4*1;7291837186338:4:4*1;7291837448482:27:4*1.3*1;7291848392994:38:11*1.3*1;7291861696802:39:100*1.5*1.5*1;7291884765474:40:162*1;7291922055458:30:155*1;7291922972962:41:47*1;7291930214690:4:163*1;7291939094818:27:164*1.4*1.165*1.129*1.41*1;7291945353506:7:4*1;7291964358946:4:4*1.4*1;7291971567906:42:41*1.129*1.165*1.4*1.164*1;7291972288802:42:166*1.21*1.4*1.4*1;7291975860514:4:47*1.47*1;7291977433378:4:3*1.25*1;7291983724834:13:25*1.16*1;7291986018594:4:4*1.4*1;7291987394850:13:23*1.21*1.5*1;7291997159714:7:4*1;7291997618466:5:4*1.47*1.48*1;7291997913378:43:16*1.7*1;7292007776546:7:100*1.71*1.5*1.4*1.4*2.4*1;7292009382178:31:28*1.167*1;7292014559522:5:4*1.168*1;7292015214882:15:23*1;7292015509794:27:23*1;7292021604642:4:16*1;7292029960482:1:3*1;7292030189858:7:4*1;7292035334434:34:16*1.33*1;7292035465506:4:47*1.47*1.47*1;7292049457442:16:4*2;7292113256738:3:4*1;7292123054370:44:47*1;7292133277986:3:4*1.4*1;7292144320802:27:4*1.104*1.67*1.70*1.115*1.11*1;7292146385186:0:21*1.11*1.115*1.70*1.67*1.4*1;7292149334306:45:141*2.131*1.169*1.35*1.6*1.21*1;7292149956898:6:4*1;7292163293474:24:56*1;7292203663650:46:170*1.6*1.171*1;7292215656738:6:4*1;7292231811362:46:172*1.39*1;7292250358050:3:23*2;7292265562402:43:16*1.23*1;7292266086690:47:153*2.153*2.153*2.173*1;7292267725090:43:16*1;7292319367458:48:49*1.137*1.12*1.99*1.12*1;7292382249250:3:141*1.4*1.11*1.144*1.25*1;7292407611682:7:4*1;7292408922402:34:33*1;7292410626338:27:4*1.4*1;7292417343778:26:23*1.23*1.68*1.5*1.5*1.5*1;7292417999138:43:16*1.108*1.78*1;7292421832994:3:23*1;7292440150306:7:4*1;7292443754786:3:174*1.23*1;7292457615650:13:4*1.4*1;7292463055138:7:4*1;7292463317282:49:11*1.175*1;7292481765666:43:16*1;7292521611554:50:98*1.3*2.33*1;7292540977442:51:21*1;7292543402274:52:5*1.5*1.100*1;7292549693730:27:125*1.176*1.144*1.21*1;7292550775074:15:23*1;7292560507170:16:177*1.47*1;7292565192994:7:4*1.4*1;7292575351074:3:23*1;7292575875362:15:23*1;7292588949794:16:104*1;7292624109858:5:4*2;7292631384354:6:4*1.4*1;7292644393250:3:4*1.4*1.4*2.4*1.4*2.4*1;7292658286882:45:174*1.178*1.118*1.118*1.118*1;7292659990818:4:4*1;7292674244898:7:4*1.4*1;7292679749922:3:60*1;7292740272418:53:179*1.133*1;7292741320994:7:4*1.4*1;7292757213474:7:4*1;7292802990370:4:4*1;7292811673890:27:176*2;7292813148450:3:23*1;7292814131490:7:4*1;7292814524706:7:4*1;7292823830818:16:4*1.4*1.5*1.14*1.133*1.180*1;7292839526690:54:131*1.48*1;7292840214818:55:23*1;7292858892578:56:23*1;7292881895714:15:23*1;7292901687586:27:77*1;7292902408482:13:21*1;7292907028770:7:4*1;7292909388066:3:33*1.33*1.33*1;7292928852258:4:4*1;7292955525410:47:45*2;7292962832674:23:39*1;7292972237090:27:4*1.4*1;7292972663074:3:23*1;7292988555554:7:4*1;7292999303458:7:4*1;7293000220962:4:4*1.4*1;7293013819682:4:11*1;7293020373282:7:4*1.4*1;7293023486242:31:58*1;7293033775394:4:16*1;7293045211426:43:16*1;7293075882274:57:82*1;7293081813282:14:118*1;7293092167970:58:16*1;7293096722722:5:4*1;7293115695394:13:46*1.172*1;7293120053538:26:78*1;7293125984546:59:181*1;7293129294114:3:45*1.5*1.23*1.7*1.105*1.18*1;7293131292962:31:143*1.94*1.98*1;7293134995746:60:23*1;7293139878178:3:23*2.56*1;7293142860066:16:48*1;7293146333474:61:8*1.23*1;7293151969570:48:5*1.5*1.100*1.100*1;7293163864354:7:4*1.4*1;7293172482338:43:16*1.3*1;7293199384866:6:4*1;7293201482018:3:21*1.8*1.33*1.98*1.47*1.5*1;7293216358690:62:16*1;7293243326754:34:33*1;7293250928930:43:16*1;7293253353762:6:4*1;7293266657570:4:16*1;7293267837218:63:36*1;7293276815650:43:16*1.23*1;7293296509218:3:23*1.23*1.23*2;7293300506914:7:4*1;7293303062818:64:5*1.5*1.100*1;7293317218594:13:25*1.3*1.11*1;7293318725922:42:142*1.33*1.105*1.34*1.23*1;7293323837730:1:3*1.25*1.11*1;7293333537058:4:16*1;7293333864738:23:182*1.141*1;7293348675874:27:128*1.48*1;7293353132322:43:16*1;7293359161634:7:4*1;7293373022498:14:183*1;7293376561442:7:4*1.4*1;7293381706018:65:173*1;7293492003106:66:141*1;7293532143906:7:4*1;7293553443106:4:3*1;7293562618146:27:4*1.124*1;7293587063074:4:4*1.49*1.5*1.5*1;7293620388130:32:33*1;7293626056994:48:184*1.185*1.174*1.186*1.186*1.187*1;7293626482978:7:4*1;7293627957538:27:90*1.90*1.118*1.118*1;7293634871586:4:16*1;7293701980450:60:54*1.11*1.25*1.161*1;7293717971234:7:4*1.4*1;7293720625442:15:23*1;7293749821730:23:23*1.5*1.188*1;7293774790946:4:4*1.4*1;7293815980322:51:21*1;7293817553186:51:21*1;7293840589090:4:4*1;7293842850082:43:94*1.76*1.5*1.5*1.100*1.16*1;7293849731362:67:56*1;7293850419490:5:4*1.4*1;7293861789986:7:4*1;7293863067938:67:56*1.56*1;7293894754594:7:4*1;7293897539874:68:3*1;7293905043746:30:23*3;7293906682146:30:23*6;7293907501346:3:23*2;7293922312482:3:23*2;7293938237730:26:46*1;7293942104354:0:23*1.35*1.181*1.11*1.25*1.19*1;7293942137122:32:33*1;7293960519970:4:21*1;7293963927842:3:23*1.23*1;7293977952546:3:23*1.23*1;7293986799906:30:189*1;7293995385122:15:23*1;7294015668514:57:4*1;7294023368994:43:16*1;7294026416418:16:122*1.54*1.96*1;7294026875170:7:4*1;7294030577954:27:96*1.190*1.191*1.192*1.59*1.125*1;7294045454626:25:34*1.23*1.5*1;7294075863330:3:4*1.4*1.33*1.33*1;7294087069986:69:4*1.4*1.4*1;7294087659810:4:4*1.4*1;7294105846050:2:4*1.4*1.4*1;7294114988322:3:4*1.4*1.4*1;7294122656034:70:33*1.90*1.4*1.59*1;7294152245538:3:4*1.4*1.4*1.131*1;7294171316514:3:4*1;7294182162722:3:49*1.84*1.163*1;7294196187426:3:4*1.4*1.55*1;7294290067746:71:5*2;7294315036962:3:5*1.124*1.33*1;7294317461794:72:163*1;7294320083234:3:21*1.5*1.193*1;7294329291042:73:16*1;7294329815330:3:4*1;7294330241314:74:4*1;7294330503458:75:47*1;7294331289890:2:4*1;7294333190434:76:158*1.158*1;7294335942946:2:67*1.36*1.99*1.4*2.4*1.4*1;7294346527010:77:33*1;7294346592546:78:4*2;7294346690850:79:11*1;7294346756386:80:4*1.4*1;7294346821922:80:4*1;7294346920226:81:16*1;7294347018530:80:4*1;7294347116834:82:72*1.194*1;7294347247906:83:23*1.23*1.68*1;7294347378978:84:23*1;7294347477282:80:4*1;7294374871330:3:5*1;7294383063330:85:4*1.47*1;7294394401058:3:5*1.33*1;7294407672098:81:16*1.4*1.4*1;7294407770402:86:4*1.4*1;7294407835938:87:49*1.11*1.41*1;7294422614306:69:4*1.4*1.4*1;7294435229986:86:4*1;7294435295522:88:195*1.68*1;7294435426594:79:33*1.196*1;7294465474850:80:4*1.4*1.4*1.4*1;7294465671458:80:4*1;7294465736994:89:33*1;7294495719714:80:4*1;7294525833506:86:197*1;7294525899042:90:123*1.45*1;7294526062882:90:45*1;7294555980066:80:4*1;7294556078370:80:4*1.4*1;7294586257698:80:4*1;7294613455138:91:198*1;7294624891170:3:4*1;7294638522658:3:199*1.45*1;7294642815266:84:23*1;7294642913570:79:118*1.200*1.18*1.100*1;7294668013858:92:181*1.181*1;7294722867490:79:201*1.59*1.59*1;7294723031330:80:4*1;7294723162402:93:4*1.4*1;7294723326242:94:16*1;7294749212962:80:4*1.4*1;7294799610146:91:202*1.5*1.5*1;7294824808738:95:203*1;7294824939810:81:16*1;7294850236706:91:204*1.205*1;7294876647714:96:206*1.207*1.4*1.11*1.3*1;7294894473506:3:54*2;7294902894882:3:33*1.59*1;7294909186338:3:56*1.176*1;7294919049506:3:84*1.196*1.208*1.209*1;7294923342114:97:4*1;7294941987106:3:21*1.33*1.105*1.93*1.21*1.134*1;7294966530338:80:4*1;7294975410466:3:210*1.211*1;7294985896226:86:4*1.4*1;7295001395490:2:4*1;7295005262114:98:4*1;7295005327650:80:4*2;7295005393186:89:33*1.33*1;7295022989602:99:17*1.152*1.171*1;7295023087906:100:3*1.25*1.11*1;7295023153442:95:171*1.78*1;7295023317282:84:23*2;7295026594082:3:212*1.71*1.213*1.7*1;7295041012002:81:16*1;7295041372450:101:47*1;7295045599522:3:56*1.105*1;7295056347426:84:23*1.89*1.33*1.33*1.33*1.33*1;7295056412962:100:3*1;7295056478498:86:23*1.5*1;7295056675106:91:195*1.181*1.29*1.69*1.46*1.25*1;7295073780002:78:4*1;7295073812770:80:4*1.47*1.33*1;7295073911074:102:214*1.54*1;7295073976610:95:3*1;7295103140130:103:211*1;7295104581922:3:33*1.33*1.4*1;7295132238114:91:16*1;7295145935138:80:4*1;7295162515746:3:45*1;7295187222818:91:105*1.12*1.55*1.215*1.33*1.33*1;7295187321122:104:4*1.4*1.4*1.4*1.4*1;7295188238626:3:118*1.4*1.216*1.216*1;7295214190882:3:48*1.90*1;7295215403298:86:4*1;7295215567138:105:163*1.63*1.22*1;7295259509026:86:4*1;7295259541794:91:33*1.4*1;7295287853346:106:11*1.25*1.3*1;7295318327586:86:4*1;7295359123746:82:141*1.37*1.8*2.4*1.4*1.25*1;7295371510050:80:4*1.4*1.4*1;7295371575586:86:3*1;7295431311650:80:4*1;7295431409954:107:14*1.14*1;7295431475490:108:78*2.78*1.82*2.98*1;7295431508258:109:33*1;7295431541026:108:98*1;7295460180258:98:4*1;7295474270498:78:4*1.4*1;7295502811426:96:76*1.76*1;7295515066658:110:56*1;7295547900194:111:163*1;7295561793826:112:131*1;7295561859362:113:4*1;7295584502050:80:4*1.4*1.4*1;7295599116578:91:166*1.152*1.144*1.133*1.4*1.11*1;7295612944674:80:4*1.33*1;7295613075746:80:4*1.4*1.39*1.91*1.5*1;7295627100450:114:3*1.71*1;7295627231522:95:169*1;7295644500258:97:217*1.4*1.4*1;7295669141794:115:147*1.218*1;7295676711202:3:141*1.219*1;7295711871266:3:45*1;7295712133410:116:5*1.5*1.100*1;7295712231714:105:4*2.4*1.4*1;7295712330018:91:4*1;7295731958050:3:3*1;7295733367074:91:220*1;7295734022434:117:115*1.163*1.163*1.3*1.25*1.11*1;7295761645858:106:3*1.25*1.11*1;7295761744162:91:33*1.33*1;7295792316706:118:21*1;7295792382242:80:4*1;7295807881506:119:34*1.45*1.221*1.222*1.161*1.131*1;7295807914274:120:41*1;7295808045346:80:4*1;7295820628258:121:7*1.77*1.177*1;7295820759330:122:223*1.4*1.4*1;7295869649186:123:71*1.224*1.23*1;7295869681954:80:4*1;7295884984610:80:4*1.4*1.34*1;7295901892898:124:33*2.33*1;7295919128866:92:225*1;7295936692514:125:99*1.33*1;7295936790818:80:4*1;7295952191778:126:33*1.33*1.47*1;7295952355618:86:3*1;7295952421154:112:118*1.118*1;7295969165602:127:23*2.5*1;7295978012962:128:5*1.23*1;7295991709986:129:4*1.4*1;7296008126754:89:33*1.33*1;7296008225058:126:33*2;7296031588642:3:21*1.124*1.25*1.117*1;7296065765666:81:16*1.16*1;7296111640866:130:11*1.118*1;7296132776226:131:12*1.50*1;7296132841762:80:4*2.16*1;7296132940066:80:4*1;7296138903842:48:16*1.90*1.16*1;7296148439330:3:23*1;7296154665250:3:4*1;7296156270882:86:4*1;7296156336418:132:5*1.100*1.5*1.226*1.227*1;7296178749730:79:3*1.115*1;7296178782498:80:4*1.4*1.5*1;7296178979106:114:11*1;7296200868130:81:16*1;7296200999202:80:4*1.4*1;7296201064738:92:15*1;7296222953762:80:4*1;7296223019298:113:4*1;7296223084834:133:41*1.25*1.11*1.35*1.3*1;7296223215906:86:21*1;7296230883618:3:71*1.15*1.23*1.88*1.5*1.5*1;7296245989666:78:4*1;7296246087970:93:4*1.4*1;7296272597282:79:48*1.5*1.4*1;7296272695586:97:4*1;7296272859426:134:140*1.109*1;7296272990498:124:15*1.87*1.101*1.23*1;7296273187106:135:58*1;7296273383714:80:4*1;7296273416482:80:4*1;7296296485154:86:4*1;7296316801314:3:8*1.5*1;7296320143650:80:4*1;7296345014562:79:156*1.110*1;7296345112866:95:98*1.118*1;7296345145634:80:4*1;7296345211170:80:4*1;7296345342242:114:16*1;7296345440546:86:4*1;7296370409762:80:4*1;7296394854690:96:21*1.90*1.33*1.10*1.15*1;7296395018530:80:4*1;7296395149602:136:35*1.228*1.35*1;7296422412578:3:141*1;7296449282338:79:100*1.4*1.33*1;7296475529506:80:4*1;7296475758882:80:4*1;7296475824418:80:4*1.4*1;7296500138274:97:4*1.4*1;7296523534626:92:48*1;7296523567394:137:11*1;7296570360098:112:48*1.5*1.5*1.5*1.39*1;7296584778018:3:105*1.35*1.70*1.80*1;7296591003938:78:4*1;7296612991266:134:135*1;7296613024034:86:4*1;7296613286178:0:229*1.157*1.230*1.60*1;7296633930018:131:23*1.54*1.46*1;7296634061090:91:4*1.4*1.5*1.5*1.100*1;7296634126626:80:4*1.4*1;7296634224930:111:54*1;7296642842914:3:4*1;7296653394210:79:5*1.5*1.4*1;7296653525282:80:4*1;7296653656354:84:23*1;7296673382690:86:33*1;7296713359650:138:118*1.231*1;7296713490722:97:4*1.4*1;7296713654562:93:176*1.232*1.233*1.68*1.68*1.46*1;7296713785634:134:234*1;7296713883938:134:50*1;7296731152674:80:4*1;7296731283746:80:4*1.4*1;7296731382050:119:40*1;7296749994274:3:4*1.4*1;7296765591842:97:4*1;7296765657378:80:4*1;7296781287714:80:4*1;7296781386018:91:33*1.48*1;7296781418786:80:4*1;7296803209506:48:87*1.214*1.235*1.105*1.84*1.3*1;7296808354082:3:7*1.4*1.4*1;7296811696418:134:50*1;7296811827490:139:236*1;7296825622818:126:33*1.33*1.33*1;7296839516450:109:33*1.33*1.33*1.33*1.33*1.33*1;7296839581986:86:4*1;7296852984098:107:21*2;7296882180386:80:4*2;7296882278690:79:4*2.4*1.4*1;7296896303394:80:4*1;7296896336162:116:60*1;7296896368930:91:133*1.33*1.47*1;7296910655778:83:46*1;7296924680482:95:181*1;7296938311970:140:82*2;7296957415714:91:8*1.8*1.8*1.8*1.33*1.33*1;7296957546786:141:111*1;7296999948578:91:5*1;7297000014114:142:35*1.5*3.39*1;7297041203490:143:237*1.111*1.238*1.24*1.239*1.238*1;7297069580578:144:240*1.82*1;7297094484258:79:33*1.229*1.4*1.4*1;7297106313506:83:5*1;7297173389602:45:55*2.51*2;7297194787106:119:46*1;7297194885410:145:214*1;7297194983714:100:3*1;7297215529250:95:32*1;7297235353890:89:33*1.33*1;7297255506210:119:241*1.242*1.243*1.244*1.245*1.246*1;7297276477730:120:117*1;7297316913442:143:247*1;7297317044514:135:248*1.21*1.118*1.249*1.47*1;7297317110050:91:141*1;7297317175586:91:54*1.4*1;7297358168354:83:45*4;7297407484194:134:45*2;7297407549730:91:23*1.17*1.235*1;7297427276066:86:16*1;7297427341602:146:33*1;7297438286114:147:172*1;7297448313122:81:16*1;7297457684770:148:250*1.8*1.56*1;7297492648226:92:124*1;7297506148642:121:11*1.25*1.163*1.163*1;7297506246946:80:4*1;7297531871522:83:45*3;7297553858850:121:7*1;7297553924386:121:7*1.50*1.106*1.251*1.252*1;7297564573986:3:33*1.137*1.5*1.77*1;7297572471074:80:4*1;7297572634914:131:253*1.60*1;7297592164642:79:7*1.5*1;7297593966882:3:105*1.105*1;7297630765346:119:118*1;7297680408866:2:4*1;7297698201890:86:4*1.4*1;7297698300194:149:4*1;7297729102114:80:4*2;7297745649954:100:3*1.25*1.11*1.25*1;7297745682722:95:21*1;7297761607970:3:4*1.4*1.105*1;7297762853154:112:17*1;7297776976162:3:4*1;7297778843938:79:141*1;7297778975010:141:141*1;7297796931874:96:34*1.101*1.144*1.133*1.4*1;7297796997410:92:142*1.9*1.4*1.13*1.254*1;7297797128482:121:7*1.76*1;7297813807394:150:255*1;7297836253474:78:4*1.47*1.94*1.96*1;7297836351778:84:23*1.23*1;7297836450082:151:45*1.105*1.253*1.223*1.215*1;7297854177570:93:54*1.4*1;7297869709602:3:4*1.4*1.4*1;7297873543458:83:10*1;7297892319522:105:17*1;7297892450594:81:3*1.16*1.16*1;7297921909026:95:256*1.118*1;7297922105634:86:4*1;7297941569826:3:68*1;7297953300770:3:23*1;7297985839394:80:4*1.4*1;7297985937698:98:4*1.4*1;7298051801378:121:7*1;7298072477986:145:82*1;7298072609058:82:21*1.158*1.33*1;7298072740130:86:4*2.4*2;7298117566754:121:7*1;7298136146210:3:67*1.4*1;7298138374434:78:4*1;7298153513250:3:4*1.59*1;7298159280418:86:16*1;7298159345954:86:4*1.4*1;7298224881954:78:4*1;7298245984546:80:4*1;7298246082850:80:4*1;7298288124194:91:23*1.5*1;7298307522850:100:3*1;7298326855970:131:3*1;7298326954274:80:4*1;7298330034466:3:5*1.23*2;7298334327074:3:4*1.4*1;7298347827490:126:33*1;7298347860258:91:4*1;7298355691810:48:214*1.21*1;7298408382754:124:70*1;7298408513826:95:257*1.77*1.172*1;7298408644898:152:49*1.118*1.113*1;7298427388194:107:80*1.258*1.16*1.21*1;7298427453730:135:28*1;7298427486498:98:4*1.4*1;7298427552034:83:32*1.5*1.25*1.3*1;7298427617570:79:259*1.55*1.25*1;7298446360866:86:33*1.135*1;7298446491938:91:135*1.33*1;7298446557474:92:160*1.23*1;7298464350498:3:28*1;7298465628450:126:33*1.33*1;7298465693986:83:141*1.11*2;7298483781922:91:68*1.41*1.41*1.260*1.5*1.5*1;7298509734178:86:4*1.4*1;7298525954338:80:4*1;7298526019874:91:141*1;7298541027618:91:141*1;7298541093154:126:33*1.33*1;7298541125922:153:45*1.45*1;7298541256994:80:4*1;7298541355298:79:8*1;7298541453602:92:4*1;7298555478306:91:141*1;7298555576610:119:62*1.261*1.5*1.77*1.76*1.4*1;7298570813730:131:5*2.5*1.5*1;7298570846498:92:48*1.76*1.76*1.33*1;7298570912034:86:4*1;7298586247458:80:4*1.4*1;7298601582882:135:4*1.262*1;7298601615650:92:34*1.47*1.135*1.89*1.47*1.33*1;7298616557858:86:4*2;7298655453474:126:33*1;7298655617314:80:4*1.4*1.4*1.5*1;7298669281570:86:16*1;7298682814754:86:128*1;7298698445090:84:23*1;7298698477858:124:5*2.39*1;7298712895778:87:98*3;7298729378082:95:3*1;7298729443618:93:163*1.8*1.21*1.23*1.23*1;7298729509154:114:3*1.16*1;7298743632162:145:110*2;7298758934818:80:4*1.4*1.4*1;7298789474594:91:5*1.5*1.5*1;7298789540130:78:4*1.4*1;7298817392930:82:15*1.23*1.48*1.181*2.23*1.5*1;7298817425698:126:33*1;7298830958882:105:152*1;7298830991650:80:4*1.4*1;7298858909986:109:33*1;7298859008290:80:4*1.4*1;7298942796066:104:4*1;7298962587938:84:34*1.133*1;7298962653474:86:23*1;7298962719010:154:33*1;7298962817314:126:105*1.5*1.33*1;7299003089186:91:263*1;7299003187490:80:4*1;7299024781602:91:90*1;7299024912674:80:4*1;7299024978210:91:4*1.4*1.4*1;7299025109282:80:4*2.4*1.4*1;7299064627490:109:33*1.33*1.33*1.33*1;7299064791330:155:4*1.4*1;7299086287138:91:262*1.262*1.262*1.264*1;7299127017762:95:7*1;7299149824290:121:7*1;7299149988130:156:265*1;7299150086434:92:5*1;7299150283042:120:4*1.4*1;7299209691426:131:4*1.4*1;7299227877666:92:266*1.82*1.258*1.48*1.48*1;7299243049250:79:33*1;7299258253602:79:5*1.4*1.5*1.49*1.4*1;7299290530082:157:82*1;7299302195490:3:4*1;7299368517922:79:267*1;7299368616226:91:268*1.48*1;7299385327906:86:33*1.33*1.33*1.33*1.33*1;7299385360674:91:269*1;7299385426210:130:82*1;7299430383906:95:54*1;7299430416674:121:33*1.7*1.133*1;7299449651490:86:4*1.4*1;7299449749794:131:270*1;7299449782562:80:4*2;7299466920226:121:163*1.7*1;7299484778786:121:7*1;7299537862946:84:23*1;7299537895714:78:4*2;7299537928482:78:4*2;7299538059554:98:4*1;7299553886498:78:4*1;7299554181410:91:117*1.141*1;7299554345250:80:260*1.4*1;7299554410786:80:4*1;7299562733858:3:23*1;7299570434338:3:118*3;7299592257826:95:118*1;7299592356130:78:4*1.4*1.4*1;7299596484898:3:23*1.163*1.4*1.4*1;7299598254370:3:7*1;7299610575138:87:258*1.163*1;7299630825762:79:90*1.4*1.90*1;7299646947618:3:71*2.137*2.7*2.23*1.141*1.141*1;7299652485410:97:4*1.4*1.76*1.122*1;7299652550946:83:5*1;7299662807330:3:33*1.33*1.33*1.33*1.33*1.33*1;7299668705570:3:23*1;7299669557538:3:23*1.23*1;7299673194786:78:4*1.4*1;7299675652386:3:11*1;7299692626210:79:41*1.59*1;7299692724514:158:23*1;7299697901858:3:271*1.4*1.64*1.272*1.76*1.76*1;7299713564962:145:273*1.15*1.122*1.15*1;7299713696034:92:47*1.111*1.47*1;7299713794338:86:3*1;7299735945506:80:4*1;7299756065058:3:4*1.3*1.274*1;7299786080546:159:33*1;7299804692770:80:4*1.4*1;7299804856610:135:8*1;7299826286882:130:46*1;7299833856290:3:36*1.33*1.163*2;7299843490082:3:33*1.33*1.33*1.33*1.33*1.33*1;7299848536354:121:7*1;7299859513634:3:275*1;7299889430818:3:23*1;7299891364130:3:33*1;7299893526818:80:4*1.214*1.8*1;7299893657890:84:23*1;7299919020322:124:11*2;7299919151394:131:33*1;7299919282466:131:169*1;7299919446306:84:23*3;7299919511842:80:4*1;7299919577378:121:7*1;7299935732002:3:221*1.221*1.70*1.5*1.5*1.5*1;7299940647202:84:23*1.23*1;7299940811042:160:7*1;7299941007650:130:23*1.15*1;7299960242466:3:23*2;7299964698914:95:23*1;7299986653474:131:212*1.71*1;7299986850082:80:4*1;7299990618402:3:4*1.4*1.59*1.59*1.92*1.84*1;7300012867874:80:4*1;7300013031714:95:48*1.172*1;7300023025954:3:276*1.277*1;7300035379490:91:278*1;7300050813218:3:163*1;7300061331746:3:33*1;7300069294370:3:33*1.33*1.33*1;7300075192610:3:7*1.3*2;7300079386914:3:5*2.5*2.100*2.279*1.32*1.33*1;7300079681826:119:4*1.105*1;7300079747362:126:33*1;7300079780130:145:203*1;7300079845666:100:3*1;7300079943970:132:263*1;7300083319074:0:5*1.5*1.100*1;7300104880418:92:221*1.220*1;7300105011490:79:69*1.4*1;7300105109794:79:4*1.4*1;7300105208098:78:4*2;7300129128738:119:4*1.4*1.4*1.280*1.196*1.92*1;7300129194274:161:48*1.33*1.33*1;7300150526242:3:93*1;7300151345442:145:65*1;7300151378210:121:7*1;7300151574818:162:133*1.105*1.281*1.11*1.10*1.102*1;7300151804194:91:23*1;7300159963426:3:282*1.283*1.284*1;7300173332770:78:4*1.4*1;7300173398306:84:23*1;7300194763042:163:4*1.32*1;7300215046434:114:4*2;7300218618146:3:56*1.105*1;7300234608930:159:172*1;7300235329826:80:4*2;7300235395362:80:4*2;7300235559202:79:23*1;7300235591970:149:45*1;7300256104738:89:33*1;7300256203042:84:23*1;7300256268578:91:4*1;7300257055010:3:7*2;7300276945186:91:285*1.5*1.5*1.94*1;7300277109026:97:4*1.4*1;7300277174562:89:33*1;7300296180002:86:4*1;7300296278306:86:23*1;7300296311074:131:4*1.4*1;7300296474914:84:23*1;7300296507682:86:4*1.4*1;7300317937954:86:23*1;7300318003490:80:4*1;7300336582946:80:4*1;7300336681250:80:4*1;7300336812322:164:4*1;7300354212130:119:23*1;7300354310434:80:4*1.4*1;7300371841314:95:23*1.23*1;7300372168994:3:148*1.208*1.11*1.25*1;7300388618530:80:4*1;7300388651298:80:4*1.4*1;7300388684066:80:4*1;7300388716834:132:171*1.171*1.11*1;7300404871458:165:286*1.100*1;7300404969762:86:23*1;7300405068066:80:4*1;7300418339106:3:23*1;7300420337954:80:4*1;7300420436258:122:117*1;7300420501794:95:45*1.287*1;7300420567330:84:23*1;7300424073506:3:23*1;7300427907362:3:23*1;7300437147938:80:4*1;7300437180706:80:4*1.4*1;7300437246242:84:23*1;7300437311778:91:33*1.33*1.141*1.77*1.16*1;7300453335330:86:33*1;7300453466402:91:33*1.33*1;7300453597474:3:23*1;7300453663010:79:271*1.143*1.249*1.105*1.45*2.95*1;7300468048162:80:4*1.47*1;7300468080930:84:23*1;7300483481890:80:4*1;7300483514658:89:288*1.267*1.33*1;7300496523554:3:140*1.14*1.46*1;7300515201314:3:4*1.4*1.4*1;7300529979682:3:33*1;7300533649698:3:4*1;7300538958114:79:289*1.102*1.3*1;7300538990882:131:290*1.144*1.5*1.133*1;7300539056418:84:23*1;7300544037154:2:4*1;7300555276578:127:23*1.291*1.89*1.55*1.280*1.66*1;7300566221090:166:11*1;7300569563426:86:4*2;7300569628962:126:33*1.4*1;7300569694498:80:4*1;7300582932770:80:4*1;7300601577762:121:7*1;7300601610530:167:263*1.292*1.293*1;7300609376546:70:33*1.33*1;7300616028450:79:16*1;7300616093986:80:4*1;7300630380834:168:254*1.23*1.23*1.77*1;7300652597538:45:25*1.11*2.3*1;7300716527906:119:73*1.236*1;7300716593442:91:33*1;7300729831714:119:294*1;7300729864482:121:7*1;7300745330978:169:295*1.45*1.3*2.250*1.196*1;7300782457122:170:296*2;7300782522658:95:107*1.232*1;7300799824162:79:102*1;7300811784482:95:11*1;7300824301858:84:23*1;7300838621474:98:4*1.4*1;7300881056034:171:23*1.23*1;7300896915746:145:133*1.297*1.105*1.49*1.118*1.118*1;7300910350626:172:82*1;7300959469858:92:298*1.299*1.128*1.300*1.5*1;7301001806114:80:4*1.4*1.4*1.4*1;7301016092962:130:5*1.5*1.5*1.5*1;7301016158498:173:6*1.6*1.6*1;7301059739938:84:23*1;7301086347554:105:45*1;7301086413090:78:4*1;7301086511394:98:4*1;7301086609698:80:4*1;7301101060386:158:23*1;7301101093154:80:4*1;7301106270498:3:301*1.301*1.4*1.4*1.119*1;7301120786722:3:102*1;7301131141410:145:220*1;7301131174178:124:4*1;7301131305250:174:286*1;7301132091682:3:23*3.5*4.302*1.11*1.81*10;7301173477666:3:11*1.25*1;7301176361250:86:33*1;7301176394018:95:48*1.3*1.25*1.45*1;7301176492322:175:5*1.5*1.100*1.3*1.59*1;7301193826594:79:4*1.4*1;7301193859362:124:16*1.16*1;7301209391394:145:209*1.303*1;7301217386786:3:117*1.141*1;7301225480482:121:7*1;7301243011362:93:304*1;7301243044130:130:39*1.5*1.5*1.100*1;7301243207970:145:30*1;7301243306274:176:104*1.4*2.4*1.4*2.4*1.4*1;7301243339042:80:4*1;7301315297570:122:161*2.15*1.171*6.171*3.215*2.215*2;7301385486626:159:51*1.45*1.105*1.181*1;7301429887266:132:5*1.5*1;7301429985570:100:16*1;7301544935714:92:124*1.267*1;7301623284002:70:33*1.33*1;7301627478306:164:4*1.4*1;7301627576610:177:34*1;7301639536930:3:36*1;7301645205794:95:102*1;7301647270178:72:23*1.82*1;7301654806818:3:23*1.41*1;7301658607906:178:4*1.4*1.131*1.4*1;7301682594082:179:265*1;7301682626850:89:33*1;7301682757922:91:263*1;7301705957666:95:47*1.7*1.5*1;7301706023202:92:253*1.176*1.4*1.279*1;7301726372130:180:98*1.279*1.46*1.13*1.33*1;7301747015970:121:7*1.25*1;7301747147042:79:21*1.70*1.144*1.88*1.305*1.306*1;7301747179810:124:4*1;7301747278114:172:82*1;7301767495970:119:82*1.11*1.25*1;7301790499106:181:263*1;7301808259362:3:5*1.118*1.118*1.60*1;7301836243234:91:39*1;7301836374306:144:4*1;7301856264482:74:208*1.6*1.4*1.8*1.133*1.5*1;7301857280290:80:4*1;7301860163874:3:4*1.4*1.4*1.119*1.214*1.43*1;7301864882466:159:34*1.154*1;7301879628066:79:4*1.4*1.5*1.5*2.59*1.59*1;7301879660834:80:4*1;7301879759138:142:99*1.105*1;7301879857442:109:33*1;7301900828962:182:46*1;7301900861730:3:33*1.4*1.4*1;7301924028706:114:307*1;7301924061474:89:33*1;7301946605858:126:33*1;7301946671394:183:16*1;7301970264354:80:4*1.4*1;7301970329890:79:22*1.148*1;7301970395426:184:4*1;7301993955618:84:23*1;7301994119458:91:33*1;7301994316066:95:4*1;7302017024290:95:175*1;7302039601442:3:308*1;7302040355106:185:216*1.46*1.23*1;7302040420642:80:4*1;7302046417186:3:4*1.4*1;7302051332386:3:4*1.4*1;7302065946914:80:4*1.259*1.105*1.309*1;7302065979682:80:4*1;7302066012450:95:11*1;7302093144354:80:4*1;7302093373730:121:7*1;7302093504802:83:4*1.145*1.4*1;7302152388898:149:4*1.4*1;7302177063202:186:23*1;7302177128738:124:5*1.5*1;7302186303778:3:158*1.4*2.4*1.4*4.4*2;7302226313506:121:7*1;7302240993570:22:101*1.310*1.195*1;7302246727970:3:60*1;7302249873698:80:181*1;7302249939234:95:20*1;7302250004770:187:3*1;7302251118882:22:46*1.84*1;7302258327842:3:67*1.33*1;7302271107362:91:16*1.4*1;7302271172898:86:33*1;7302359417122:131:102*1;7302359449890:100:3*1;7302384648482:3:46*1.45*1.311*1;7302565462306:86:4*2;7302621364514:188:4*1.4*1;7302659146018:86:33*1;7302673989922:3:33*1.33*1;7302692569378:109:33*1;7302692733218:80:4*2;7302694011170:48:3*1.5*1.5*1.5*1.102*1;7302707773730:131:105*1.141*1;7302707806498:91:5*1;7302707839266:91:8*1.21*1.269*1.312*1.11*1.117*1;7302707937570:189:267*1.289*1;7302710296866:3:117*1.11*1.25*1.7*1.141*1.312*2;7302722683170:80:34*1.45*1.144*1.21*1.4*1.4*1;7302722748706:114:90*1.90*1.45*1.54*1.176*1;7302722781474:80:4*1.4*1;7302722847010:190:153*1;7302739034402:185:17*1;7302739099938:126:33*1;7302739165474:119:23*1.235*1;7302739329314:92:148*1.11*1.25*1.8*1;7302754926882:83:301*1;7302759645474:3:4*1.90*1;7302770164002:91:313*1;7302770262306:126:33*1;7302770360610:126:21*1.33*1;7302785204514:83:54*1.11*1;7302802145570:91:314*1;7302802178338:191:54*1;7302818758946:126:33*1;7302833045794:97:33*1.4*1;7302847103266:95:315*1.54*1.118*1.316*1.232*1.262*1;7302847136034:181:125*1;7302862078242:89:33*1.33*1;7302876725538:86:4*1;7302920700194:188:21*1.96*1.5*1;7302967263522:86:4*1.4*1.4*1.4*1;7302980862242:79:317*1;7303011041570:175:5*1.4*2.4*1;7303040794914:192:33*1.33*1;7303119307042:105:13*1.3*1.25*1.11*1;7303146471714:80:4*1;7303162200354:95:82*1.46*1;7303173603618:193:290*1;7303189987618:80:4*1;7303205683490:145:70*1.318*1;7303220887842:86:4*1;7303233732898:145:4*1;7303233798434:84:23*1;7303248740642:95:5*1;7303262568738:91:70*1.307*2.48*1;7303262601506:114:128*1;7303297204514:131:12*1.105*1.21*1.319*1;7303311982882:165:4*1.128*1;7303325483298:100:3*1.25*1.11*1;7303339311394:194:264*1.23*1;7303339376930:194:23*1;7303352189218:121:7*1;7303352287522:80:4*1;7303352320290:126:33*1;7303359627554:2:4*1.4*1;7303365460258:80:4*1;7303379616034:145:3*1;7303418577186:95:175*1;7303435878690:3:23*1.22*1.309*1.141*1;7303436927266:195:21*1.7*1.165*1;7303457341730:96:269*1.4*1.34*1.255*1.11*1;7303494959394:3:23*1;7303505674530:105:23*1;7303505772834:80:4*1;7303516193058:3:77*1;7303524024610:3:23*1;7303541555490:84:23*1.4*1;7303545094434:72:320*1.321*1;7303560528162:196:23*1.23*1;7303560593698:195:7*1;7303560724770:91:196*1.152*1.255*1;7303582679330:171:23*1.23*2;7303598407970:86:3*1.290*1.302*1;7303598571810:79:4*1;7303606305058:22:32*1.32*1;7303617577250:187:3*1;7303617610018:126:33*1.4*1;7303627374882:3:33*1;7303636123938:121:7*1;7303648379170:197:36*1;7303657062690:91:163*1;7303693828386:89:4*1.33*1.33*1;7303713095970:95:4*1.4*1;7303713128738:92:4*1.4*1;7303731609890:159:4*1.4*1;7303734526242:0:32*1.33*1.33*1;7303738556706:126:33*1.33*1.33*1;7303738589474:93:4*1;7303738687778:84:23*1;7303743406370:3:4*1.4*1;7303759790370:114:4*1.105*1;7303759888674:175:5*1.5*1.100*1.23*1;7303765524770:3:146*1.256*1.88*1.322*1;7303779057954:198:23*1;7303779156258:79:33*1;7303811236130:3:323*1.11*1.7*1.3*1;7303820869922:86:71*1;7303847969058:159:4*1.70*1.324*1.4*1.141*1.325*1;7303867597090:198:23*1;7303875035426:45:23*1;7303888765218:79:253*1.128*1.133*1.45*1.232*1;7303911997730:130:326*1;7303947649314:3:14*1.143*1;7303947780386:3:33*1.33*1.33*1;7303958036770:79:225*1.280*1;7303958102306:80:4*1;7303958135074:80:4*1;7303966785826:3:23*1.23*1;7303973044514:3:177*1.327*1.328*1.99*1.48*1.105*1;7303979172130:3:33*1.33*1.280*1;7303982055714:98:4*1;7304002928930:3:33*2;7304046706978:104:4*1;7304127709474:79:4*2.83*1.196*1.209*1.47*1.47*1;7304136130850:3:4*1.4*1.4*1.4*1;7304174567714:193:11*1.3*1.25*1;7304177058082:91:4*1.4*1;7304177090850:91:4*1.4*1;7304177189154:124:290*1;7304177254690:108:11*1.25*1.329*1.328*1.82*1.33*1;7304177320226:132:68*1;7304178139426:3:4*1.4*1;7304228372770:78:4*1;7304254849314:168:276*1;7304254914850:84:23*1;7304276640034:145:330*1;7304276672802:79:135*1;7304289976610:3:137*1.33*1.331*1.14*1;7304295186722:3:3*1.7*1;7304299118882:93:76*1.169*1;7304321302818:80:4*1;7304387592482:80:4*1;7304387658018:92:3*1.25*1.11*1;7304408039714:198:23*1;7304426914082:3:5*1;7304428650786:95:4*1.4*1.103*1.103*1;7304449720610:92:60*1;7304468398370:83:332*1.13*1.133*1.25*1.82*1.69*1;7304487436578:199:141*1.33*1.33*1.33*1;7304487600418:124:333*1.45*1.250*1;7304487665954:95:103*1;7304487731490:93:250*1.334*1;7304522367266:91:335*1;7304522432802:96:336*1.319*1;7304537276706:48:98*1.4*1;7304539832610:95:5*1.255*1.11*1;7304539898146:92:144*1.4*1.4*1;7304540029218:86:33*1;7304540094754:92:172*1.328*2;7304540160290:95:337*1.232*1;7304540193058:83:4*1;7304556839202:83:90*1.4*1.90*1.11*1.3*1;7304572993826:145:162*1;7304573059362:172:82*1;7304573092130:78:4*1;7304587411746:79:140*1;7304602452258:80:4*1.5*1;7304602517794:200:296*1;7304602583330:80:4*1.77*1;7304611168546:3:122*2.122*2;7304616509730:86:82*1;7304630927650:124:4*1.4*1;7304645116194:80:4*1.4*1;7304645181730:124:23*1;7304645312802:84:23*1.5*1;7304660189474:22:338*1;7304675066146:80:4*1.4*1;7304675164450:78:4*1;7304689582370:172:82*1;7304689615138:91:339*1.105*1;7304694399266:3:328*1;7304727560482:3:33*1.33*1.33*1.33*1.23*1.137*1;7304766914850:80:4*1.5*1;7304767045922:89:33*1;7304767111458:80:4*1;7304782545186:108:143*2;7304815116578:79:340*1.101*1.49*1;7304831664418:119:220*1.102*1;7305357099298:80:4*1;7305357558050:201:9*1;7305669411106:93:341*1.342*1.129*1;7305669935394:80:4*1;7305670492450:80:4*1.4*1;7305708765474:80:4*1;7305723248930:121:7*1.248*1;7305723281698:89:33*1;7305754149154:80:5*1.4*1;7305754214690:131:315*1.102*1;7305769025826:105:163*1;7305782526242:0:118*1.118*1.118*1.118*1;7305801990434:95:11*3.25*1.3*1.7*2;7305802023202:89:33*1;7305832399138:119:294*1;7305832464674:172:82*1;7305832497442:93:172*1;7305832595746:79:33*1;7305848324386:195:7*1;7305888989474:121:7*1;7305889153314:86:4*1;7305902817570:93:48*1.343*1.128*1.90*1.4*1.32*1;7305932374306:100:3*1;7305932407074:95:16*1;7305946366242:86:7*1;7305959702818:92:8*1;7306006823202:80:4*1;7306006855970:89:33*1;7306006888738:114:344*1;7306051715362:124:262*1.45*1;7306051846434:124:11*1;7306282467618:79:4*1;7306282696994:119:33*1;7306347217186:98:4*1.4*1;7306347413794:95:345*1.48*1.346*1;7306403021090:131:347*2.109*1.15*1.117*1;7306480648482:22:233*1.12*1.89*1.312*1;7306495557922:3:7*1;7306499096866:176:238*1;7306499162402:119:236*1;7306499752226:3:7*1;7306515939618:3:33*1.45*1;7306560307490:95:348*1.96*1.144*1.13*1.76*1.4*1;7306560438562:92:209*1.349*1;7306560667938:92:294*1.5*1.124*1.100*1.70*1;7306626072866:95:4*1.350*1.351*1.4*1.33*1.352*1;7306626269474:93:76*1.99*1.122*1.122*1.124*1.117*1;7306683810082:3:4*1.56*1.59*1;7306683973922:79:4*1;7306684170530:80:4*1;7306684498210:145:7*1;7306740859170:95:169*1;7306741023010:80:4*1.4*1;7306741186850:86:33*1;7306741481762:104:4*1;7306836214050:79:4*1.4*1;7306878681378:93:353*1.354*1.141*1.7*1.48*1.5*1;7306913480994:3:137*1;7306916331810:95:54*1;7306916397346:92:355*1.11*1.60*1.255*1.356*1.101*1;7306916495650:145:4*1.56*1;7306958143778:83:7*1.141*1;7306999824674:80:4*1.4*1;7306999922978:156:265*1;7307048845602:124:137*1.59*1.84*1.84*1.323*1;7307049074978:199:47*1.4*1;7307100389666:83:139*1.102*1.139*1;7307100619042:202:265*1;7307158421794:91:102*1;7307158487330:92:32*1.357*1;7307207704866:131:5*1.28*1;7307207868706:80:4*1;7307250663714:97:4*1;7307262787874:203:33*1;7307282776354:198:23*1;7307287626018:204:3*1;7307312693538:91:255*1;7307312759074:181:292*1;7307312824610:86:262*1;7307339825442:89:33*1.128*1;7307339890978:130:102*1.46*1;7307340087586:121:7*1;7307354145058:3:290*1;7307368956194:91:48*1;7307431903522:124:45*1;7307431969058:93:163*1.163*1;7307458576674:95:3*1;7307458707746:89:33*1.33*1;7307468701986:48:16*1;7307492294946:91:181*1;7307540300066:98:47*1.4*1.4*1;7307596955938:119:117*1.3*1.85*1;7307596988706:87:163*1.45*1.358*1;7307597087010:80:4*1;7307598528802:0:359*2;7307624251682:86:4*1;7307649089826:205:88*1.88*1;7307684643106:80:4*1;7307684708642:161:231*1.115*1.102*1.309*1;7307684774178:86:4*1;7307713216802:199:324*1;7307713413410:92:21*1.117*1;7307713708322:124:23*1;7307713806626:89:33*1;7307731501346:3:4*1.4*1;7307738087714:3:33*1;7307738153250:80:4*1;7307743789346:3:4*1;7307765514530:80:4*1.4*1;7307788615970:80:4*1;7307810832674:199:277*1;7307811029282:206:360*1.24*1;7307817943330:193:262*1;7307832983842:114:5*1.39*1.76*1.76*1.361*1;7307833114914:80:4*1;7307855921442:98:4*1;7307856019746:97:4*1;7307856085282:83:4*1;7307876237602:79:100*1.55*1;7307893113122:92:318*1;7307928011042:83:4*1;7307928043810:93:362*1.6*1.169*1;7307928109346:86:45*1;7307944100130:126:33*1;7307944198434:79:96*1.76*1.48*1.33*1.54*1.48*1;7307944231202:174:4*1;7307991187746:100:3*1;7307991286050:89:33*1;7307991318818:80:4*2;7308005900578:80:4*1;7308030247202:80:4*1;7308030476578:167:141*1;7308087361826:95:250*1.77*1.118*1;7308146213154:80:4*1;7308146376994:91:5*1.11*2.4*1.4*1.166*1.33*1;7308146540834:100:3*1;7308337611042:80:4*1;7308398133538:207:296*1;7308509774114:86:4*2.4*1.4*1.4*1;7308571902242:164:4*1.4*1.4*1.4*1;7308599492898:97:4*1;7308599558434:95:25*1.3*1.11*1;7308599591202:91:33*1;7308641403170:80:4*1;7308669813026:124:70*1.23*1;7308750422306:142:117*1.319*1.297*1.144*1.363*1.14*1;7308765331746:139:328*1.23*1;7308765364514:80:4*1.364*1.83*1.365*1;7308868780322:3:36*1;7308874776866:3:181*1;7308887949602:3:33*1.33*1.33*1.33*1.23*1.137*1;7308891095330:83:65*1;7308903874850:91:366*1;7308903940386:92:367*1;7308934545698:208:292*1;7308978323746:3:4*1;7308981731618:91:368*1.325*1;7308996641058:89:13*1.33*1;7309021643042:91:4*2.4*1;7309034160418:3:141*1.77*1;7309092290850:92:70*1.172*1;7309092421922:80:4*1;7309092487458:109:33*1.59*1.262*1;7309109035298:92:33*1.33*1;7309120340258:3:37*1.4*1.56*1.124*1.36*1;7309130334498:204:3*1.25*1.45*2;7309148193058:3:47*1.47*1.47*1.70*1;7309154681122:80:4*1;7309171327266:126:33*1.33*1;7309171392802:83:45*1.54*1.5*1;7309171425570:80:4*1.171*1;7309182304546:3:84*1.69*1;7309186302242:3:33*1;7309186466082:3:33*1.33*1;7309188432162:80:4*2;7309222936866:80:4*1;7309223002402:80:4*1;7309223067938:86:4*1.4*1;7309223100706:86:4*1;7309241844002:78:4*1.4*1;7309277200674:209:33*1;7309277233442:210:369*1.370*1;7309299646754:86:4*1.4*1;7309318258978:0:33*1;7309320651042:100:3*1.11*1;7309320782114:91:90*1.89*1;7309340344610:89:33*1.33*1;7309340410146:91:33*1.371*1.371*1.114*1.114*1.107*1;7309362233634:80:4*1;7309387858210:83:16*1;7309411189026:80:4*1.4*1.5*1;7309411320098:211:255*1.133*1.82*1;7309411418402:78:4*1;7309432881442:3:23*1;7309433569570:79:16*1.4*1.372*1.14*1;7309433602338:80:4*1.4*1;7309435240738:3:137*1.122*1;7309457293602:80:4*1.4*1;7309481902370:80:4*1;7309482000674:78:4*1.123*1.312*1.135*1;7309482033442:182:262*1;7309482164514:92:373*1;7309482262818:131:109*1;7309507756322:91:33*1.33*1;7309507854626:212:264*1;7309532397858:80:4*1;7309555466530:80:4*1;7309555499298:142:82*1;7309557334306:3:23*2;7309577912610:3:23*1;7309607534882:92:214*1;7309635879202:92:68*1;7309662257442:145:292*1;7309689946402:80:4*1.4*1;7309715538210:91:110*1;7309746340130:78:4*1;7309773930786:97:4*1;7309774061858:80:4*1;7309808894242:80:4*1.4*1;7309808927010:86:4*1.4*1;7309837861154:89:33*1.33*1.152*1.33*1;7309837926690:80:4*1;7309864894754:89:33*1.47*1.33*1.5*1;7309882032418:213:4*1.5*1.45*1.178*1.77*1.100*1;7309890617634:80:4*1.4*1;7309890748706:79:374*1.372*1.105*1.99*1.99*1;7309918011682:122:220*1;7309918077218:80:4*1;7309945209122:80:4*1.4*1;7309970407714:92:5*1;7309970473250:122:43*1;7309994164514:91:45*1;7310003208482:0:141*3;7310062092578:91:163*1.115*1;7310062190882:168:5*1.94*1.137*1.11*1.33*1.65*1;7310082900258:86:262*1;7310121304354:80:4*1;7310140080418:79:181*1.35*1.49*1.105*1;7310205223202:98:4*1;7310220132642:100:3*1;7310220165410:91:375*1.88*1.376*1.148*2.106*1.22*1;7310250508578:80:4*1.4*1;7310250606882:78:4*1.4*1;7310250737954:91:220*1.377*1.25*1.89*1.23*1;7310250770722:86:4*1;7310256275746:0:8*1;7310265549090:86:4*1;7310265581858:145:5*1;7310265745698:79:255*1.36*1.47*1.45*1.60*1.4*1;7310278983970:80:4*1;7310309622050:180:33*2.59*1.59*1.306*1.102*1.84*1;7310309654818:214:344*2.4*1;7310335869218:89:33*1.33*1;7310349795618:3:33*1.33*1;7310352974114:174:276*1.378*1;7310367260962:122:300*1;7310382530850:168:127*1.145*1.203*1.47*1.47*1;7310395965730:168:33*1.379*1;7310443512098:126:33*1.33*1.33*1;7310549451042:79:33*1;7310549516578:86:181*1;7310601224482:0:59*1.59*2.59*1.59*3.59*1.59*1;7310606958882:80:4*1;7310621540642:168:35*1.23*1;7310637826338:145:276*1;7310683701538:86:4*1;7310687076642:215:3*1.4*1;7310722433314:126:33*1.33*1.33*1.47*1.47*1;7310722531618:164:4*1;7310722662690:216:233*1;7310736654626:146:306*1.218*1.380*1.33*1.33*1;7310750679330:98:4*1.4*1;7310760182050:217:15*1.328*1.128*1;7310801142050:131:9*1.102*1;7310804975906:3:49*1.96*1.4*1;7310817001762:92:36*1;7310817100066:131:381*1.382*1.383*1.168*1;7310831092002:92:195*1;7310831124770:91:344*2.4*1;7310832075042:3:384*1;7310855504162:80:4*1;7310877262114:92:33*1;7310892695842:80:4*1;7310892728610:218:33*1;7310892761378:119:385*1.386*1.387*1;7310907343138:122:163*2.3*1;7310907441442:219:292*1;7310907506978:91:388*1.135*1.46*1.33*1.33*1;7310907670818:220:43*1.389*1;7310936998178:98:4*1.4*1;7310937030946:80:4*1;7310952956194:109:33*1;7310953021730:221:82*1;7310953087266:91:8*1.80*1.390*1.100*1.4*1;7310969143586:222:5*1;7311033467170:131:308*1.144*1;7311033499938:79:48*1.166*1.371*1.391*1;7311035990306:3:141*1.33*1.59*1;7311048638754:91:76*1.171*1;7311048671522:86:389*1;7311054340386:223:236*1;7311064924450:224:392*1.107*1.107*1;7311082750242:91:4*1.4*1;7311082848546:79:4*1.4*1;7311115551010:3:23*1.23*1.393*1;7311138652450:86:292*1;7311138685218:92:122*1.144*1;7311159230754:122:41*1;7311159263522:91:172*1;7311159329058:214:23*1;7311177908514:86:4*1.4*1;7311195144482:3:33*1.4*1.4*1;7311197405474:80:4*1;7311219720482:79:4*1;7311229255970:3:208*1.105*1.5*1.5*1.47*1;7311242592546:3:23*1;7311255798050:3:312*1.59*1.394*1.395*1.396*1;7311261630754:48:36*1.397*1.22*1.328*1.35*1.25*1;7311261729058:79:33*1;7311282372898:208:3*1.312*1.5*1;7311306686754:80:4*1;7311306752290:79:89*1;7311328444706:100:3*1;7311370551586:168:372*1.4*1;7311370682658:91:363*1.150*1.18*1.249*1.8*1;7311440970018:80:4*1;7311441068322:132:292*1;7311441101090:80:4*1;7311441199394:80:4*1;7311463579938:145:398*1;7311509029154:119:399*1;7311509127458:79:16*1;7311509258530:80:4*1;7311533998370:92:400*1;7311534129442:131:401*1.195*1.269*1.67*1.45*1.312*1;7311580397858:91:4*1.4*1;7311623520546:0:4*1.33*1.47*1;7311627518242:168:4*1.4*1;7311670772002:119:196*1.137*1.118*1.397*1.402*1.41*1;7311670935842:80:4*1;7311695413538:91:4*1.137*1.94*1.4*1;7311718351138:145:234*1;7311718383906:86:4*1;7311739158818:79:4*1;7311739191586:80:46*1.135*1.18*1.134*1.403*1.4*1;7311759212834:132:404*1.62*1;7311759245602:132:368*1;7311759311138:225:4*2.4*1;7311775957282:3:4*1;7311777399074:80:4*1.4*1;7311777431842:92:21*1.18*1.3*1.11*1;7311777562914:91:4*1.8*1;7311796699426:210:405*1.398*1.33*1.406*1.111*1;7311796764962:79:407*1.69*1.6*1.408*1.48*1;7311796896034:224:196*1.203*1.68*1.105*1.181*1.33*1;7311815541026:79:4*2.214*1.4*1.4*1;7311815573794:80:4*1.33*1;7311833366818:80:4*1;7311849750818:86:4*1;7311867183394:168:11*2;7311883043106:109:33*1;7311883108642:89:33*1;7311883174178:87:4*1.4*1;7311883239714:80:4*2;7311900541218:132:354*1;7311900606754:100:3*1;7311915548962:168:36*1;7311915614498:80:4*1;7311929671970:80:4*1.4*1;7311929737506:86:409*1;7311929868578:78:4*1;7311943794978:91:5*1;7311958311202:86:264*1;7311971352866:226:105*1.21*1.8*1.117*1.3*1.25*1;7311971451170:227:20*1;7311984001314:92:356*1.98*1.98*1.5*1.5*1.5*1;7311997665570:86:4*2;7311997698338:228:137*1.137*1.137*1;7312011985186:79:137*1;7312025846050:168:44*1;7312039313698:80:4*1;7312053371170:100:3*1;7312053436706:92:4*1.4*1;7312080535842:80:4*1;7312080568610:80:4*1;7312080601378:100:3*1.11*1;7312080699682:80:4*1.4*1;7312109306146:168:16*1.181*2.78*1.55*1.94*1.23*1;7312135323938:229:45*1;7312168157474:80:4*1;7312180969762:91:196*1.309*1.356*1.356*1;7312185655586:3:92*1.410*1.141*1.65*1.274*1.5*1;7312195256610:80:4*1;7312198271266:3:33*1;7312207479074:80:4*1;7312221241634:168:4*2.4*1.4*1;7312389079330:80:4*1.4*1;7312389144866:102:4*1;7312389210402:230:163*1;7312423977250:126:33*1.35*1.216*1.33*1;7312436560162:79:4*1.4*1;7312450060578:231:54*1.23*1;7312479289634:91:82*1;7312492396834:86:264*1;7312492429602:80:4*1;7312504684834:131:68*1.56*1.163*1.21*1;7312504717602:92:5*1;7312508191010:3:4*1;7312517169442:22:338*1;7312542925090:122:43*1.43*1.43*1.43*1.44*1;7312580575522:167:47*1.33*1.121*1.118*1.118*1;7312635035938:232:82*1;7312635101474:80:4*1.4*1;7312635167010:80:4*1.4*1.4*1;7312652534050:126:33*1.45*1;7312665444642:3:14*2;7312666165538:0:181*1.181*1;7312683696418:138:411*5;7312683794722:91:188*1.209*1.52*1.70*1.318*1;7312701128994:233:137*1.137*1.137*1;7312701260066:168:195*1.412*1.82*1.413*2.124*1.8*1;7312709976354:3:414*1.3*1;7312717414690:96:308*1.188*1.54*1.368*1.45*1.84*1;7312732029218:80:4*1;7312811622690:228:133*1.337*1;7312811753762:234:23*1.23*1;7312811819298:122:254*1.415*1.415*1;7312832332066:80:4*1;7312832397602:80:4*1.4*1;7312832430370:89:33*1.105*1;7312841834786:3:59*1.137*1.4*1;7312852386082:98:4*1.4*1;7312865263906:235:23*1;7312871522594:78:4*1;7312892592418:80:4*1;7312892690722:98:4*1.4*1;7312892789026:91:163*1.55*1.372*1.163*1;7312892854562:236:324*1;7312918675746:86:4*1;7312929915170:3:5*1.5*1.5*1.33*1;7312947740962:122:4*1;7312947773730:168:16*1;7312971366690:126:33*1.33*1.33*1;7312992534818:122:5*1;7313016357154:236:373*1;7313016488226:80:4*1;7313039491362:79:122*1.378*2;7313039524130:138:21*1.18*1;7313059348770:237:21*1.117*1;7313063018786:3:77*1.45*1.5*1.5*2.56*1.105*1;7313063772450:80:4*1;7313063837986:86:4*2;7313087529250:168:11*1;7313087594786:98:4*1.34*1;7313137008930:228:137*1;7313137074466:80:4*1;7313160241442:80:4*1;7313217093922:3:33*1;7313232199970:145:22*1;7313232265506:231:80*1.220*1.416*1.324*1;7313235771682:2:4*1;7313254351138:238:23*1;7313254449442:86:4*1;7313276502306:109:33*1;7313298686242:238:23*1;7313320247586:122:4*1.4*1;7313320444194:119:417*1;7313362420002:79:314*1.117*1.21*1.11*1;7313362551074:168:45*1;7313362747682:109:33*1.33*1.33*1;7313362845986:80:4*1.4*1;7313423761698:239:77*1.137*1.4*1;7313423860002:86:4*1;7313443553570:80:4*1.4*1;7313443651874:98:4*2.4*1.5*1.4*1.4*1;7313448960290:3:67*1.135*1.122*1.274*1.68*1;7313452499234:3:33*1.33*1;7313457905954:3:137*1.137*1;7313460494626:3:105*1.56*1;7313462034722:145:418*1;7313473110306:3:150*1.326*1.293*1.37*1.419*1.408*1;7313481531682:92:320*1.9*1.221*1.33*1;7313491951906:3:46*1;7313511383330:3:33*1.33*1;7313519739170:80:4*1.4*1;7313519771938:91:4*1.4*1.420*1;7313554309410:80:5*1.32*1.3*1.4*1;7313568956706:3:3*1.23*1.4*1.4*1;7313670275362:3:89*1.3*1.25*1.11*1;7313767137570:80:4*1;7313941430562:3:89*1.77*1;7313991500066:86:4*1;7313991958818:97:4*1.4*1.4*1.4*1;7313992483106:97:4*1.4*1;7314170380578:3:140*1.105*1.5*1;7314204983586:98:4*1.4*1;7314205507874:240:421*1.422*1.229*2.423*1.28*1.109*1;7314423152930:157:118*1.82*1;7314647974178:132:136*1;7314648334626:86:349*1.122*1;7314696503586:241:318*1;7314813223202:242:90*1;7314848252194:243:424*1.296*2;7314848547106:244:271*1.260*1.353*1;7315019432226:78:4*1.4*1;7315019792674:233:137*1;7315020153122:80:4*1.4*1;7315026608418:217:43*1.300*1;7315154272546:96:120*1.8*1;7315154665762:245:318*1;7315322667298:80:4*1.4*1.4*1;7315481788706:157:82*1;7315482312994:80:4*1;7315482771746:119:196*1;7315642155298:168:4*1.4*1.4*1.4*1.4*1;7315795214626:246:188*1.258*1.349*1.11*1;7315795312930:80:4*1;7315833028898:124:46*1;7315959611682:247:23*1;7315988676898:80:4*1;7316003127586:92:425*1.324*1.426*1;7316025049378:248:166*1.3*1.4*1;7316098875682:249:4*1.4*1.4*1;7316098908450:96:13*1;7316161069346:78:4*1;7316165919010:159:48*1.20*1.115*1.178*2.56*2.128*2;7316175552802:80:4*1;7316191150370:228:137*1;7316222312738:98:214*1.4*1.4*1.33*1.427*1.33*1;7316222443810:80:4*1;7316242891042:48:208*1.171*1.122*1;7316252262690:3:90*1;7316256391458:250:156*1.428*1.112*1;7316269465890:124:429*1.430*1.6*1;7316269564194:236:349*1;7316269596962:145:431*1;7316285358370:91:110*1;7316285456674:251:4*1.4*1;7316301742370:3:33*1;7316312949026:3:48*1.48*1.21*1;7316318191906:95:4*1.100*1;7316331233570:79:100*1.4*1;7316333101346:3:21*1.23*1.4*1.137*1.323*1.195*1;7316344635682:3:4*1.48*1.32*1;7316392837410:252:3*1;7316424687906:79:399*1;7316483178786:124:220*1.145*2;7316497498402:228:23*1.181*1.181*2.137*1.137*1.137*1;7316531380514:3:23*1;7316544454946:86:354*1.320*1;7316544520482:79:432*1;7316560707874:221:82*1;7316576665890:91:82*1.433*1.434*1;7316576796962:245:303*1.318*1;7316576862498:86:368*1;7316595081506:253:286*1;7316614021410:79:117*1;7316614054178:91:60*1;7316614119714:79:128*1;7316625916194:3:11*1;7316631978274:233:137*1.137*1;7316674773282:104:4*1;7316718715170:79:82*1;7316718780706:254:23*1;7316763345186:168:45*1;7316763410722:255:23*1.163*1.435*1;7316786348322:3:4*1;7316787560738:157:82*1;7316810727714:3:4*1.98*1.356*1.137*1;7316830028066:232:82*1;7316852637986:255:23*2.3*1;7316852736290:168:340*1.78*1.280*1;7316872462626:3:436*1.437*1;7316884128034:22:266*1.5*1;7316892844322:3:21*1.102*1.54*1.137*1.137*1.89*1;7316899201314:80:4*1;7316899332386:108:48*1;7316920369442:3:5*1.427*1.312*1;7316923023650:91:214*1;7316927512866:22:368*1;7316969783586:255:23*1;7316969816354:79:12*1.402*1.4*1.4*1;7317017854242:255:23*1;7317017985314:98:4*1.23*1;7317018050850:256:23*2;7317018116386:91:424*1;7317018181922:255:23*1;7317018280226:79:294*1.314*1;7317371584802:92:161*1;7317432434978:3:5*1.5*1;7317549646114:86:4*1.4*1;7317736816930:86:4*1;7317737111842:92:4*1.4*1;7317737537826:92:58*1;7317793538338:0:368*1;7317925069090:255:23*1.23*1;7317925560610:80:4*2;7317926052130:257:438*1.439*1.440*1;7318103687458:168:36*1.23*1.11*1;7318104211746:80:4*1.4*1;7318104899874:92:4*1;7318161391906:3:131*1.45*1;7318168273186:258:48*1.47*1.33*1;7318168371490:92:245*1.46*1.313*1.313*1.105*1.12*1;7318168437026:80:4*1;7318191604002:168:306*1.441*1.371*1.32*1.32*1.4*1;7318214967586:80:4*1;7318215000354:164:4*1;7318215033122:80:4*1;7318234628386:86:4*1;7318234726690:91:105*1.84*1.23*1.88*1.48*1.48*1;7318244557090:3:23*1;7318256091426:157:82*1;7318256156962:255:23*1;7318275391778:259:442*1.4*1;7318295413026:80:4*1;7318295511330:80:4*1.77*1;7318295609634:255:23*3;7318307209506:48:255*1.55*1.79*1.328*1.352*1;7318334636322:78:4*1;7318334701858:98:4*1;7318350823714:3:54*1;7318352855330:78:4*1;7318352920866:78:4*1;7318361276706:3:3*1;7318369796386:3:137*1.4*1;7318407315746:168:23*1;7318439952674:97:4*1.4*1;7318439985442:78:4*1;7318469673250:91:80*1.21*1.22*1.208*1.140*1;7318484123938:78:4*1;7318484189474:80:4*1.4*1.172*1;7318484287778:255:69*1.14*1;7318512304418:168:4*1;7318539960610:132:320*1;7318539993378:260:90*1.13*1.23*1.4*1;7318554214690:261:82*1;7318554280226:164:4*1;7318568534306:262:262*1;7318568599842:86:4*1;7318593405218:215:;7318596518178:263:;7318596583714:264:;7318605398306:3:;7318613131554:168:;7318645113122:122:;7318689939746:245:;7318718021922:131:;7318732341538:86:;7318746530082:86:;7318759440674:245:;7318773236002:80:;7318773301538:240:;7318809674018:79:;7318811738402:159:;7318822813986:265:;7318837559586:92:;7318837657890:91:;7318841295138:2:;7318866067746:80:;7318866100514:228:;7318866133282:174:;7318909583650:168:;7318926197026:80:;7318926229794:122:;7318940516642:132:;7318940549410:266:;7318981640482:92:;7318986228002:69:;7318997434658:80:;7318997467426:92:;7319019946274:3:;7319028793634:267:;7319037083938:97:;7319064379682:3:;7319068573986:3:;7319082402082:168:;7319106322722:268:;7319106388258:269:;7319121133858:227:;7319133716770:270:;7319133749538:271:;7319138140450:3:;7319193125154:80:;7319193223458:255:;7319193256226:168:;7319193288994:236:;7319196565794:3:;7319209279778:243:;7319209410850:91:;7319226384674:168:;7319226581282:227:;7319226614050:168:;7319226646818:269:;7319242637602:3:;7319257481506:103:;7319289823522:3:;7319295394082:78:;7319295426850:97:;7319311286562:122:;7319311319330:98:;7319311483170:79:;7319311679778:255:;7319351394594:268:;7319351427362:268:;7319351525666:91:;7319367287074:3:;7319368368418:168:;7319368466722:92:;7319413195042:86:;7319413227810:168:;7319421157666:3:;7319435542818:257:;7319435608354:79:;7319451074850:3:;7319456842018:272:;7319456940322:92:;7319457071394:168:;7319485251874:3:;7319505174818:92:;7319549870370:91:;7319597187362:157:;7319632642338:215:;7319659381026:3:;7319694246178:255:;7319744708898:79:;7319768531234:122:;7319863263522:91:;7319863296290:131:;7319863427362:145:;7319901700386:3:;7319920312610:3:;7319934009634:79:;7319934042402:157:;7319976673570:91:;7319978344738:3:;7319996367138:86:;7319996432674:221:;7320018747682:92:;7320038670626:92:";
/* The patch columns, by the names readOrderSource_ reads them under (the same order as orderPatch_ returns them). */
const ORDER_PATCH_COLS = ['attr_utm_source', 'attr_utm_campaign', 'attr_utm_content', 'referrer', 'product', 'source_name', 'attr_utm_id', 'attr_utm_term'];
let ORDER_PATCH_ = null;
/* Order ID (gid://shopify/Order/…) → values in ORDER_PATCH_COLS order, or null. */
function orderPatch_(id) {
  if (!ORDER_PATCH_) {
    ORDER_PATCH_ = new Map();
    ORDER_PATCH_DATA.split(';').forEach(e => {
      const p = e.split(':'), s = ORDER_PATCH_SRC[Number(p[1])];
      const products = p[2] ? p[2].split('.').map(x => { const q = x.split('*'); return ORDER_PATCH_PROD[Number(q[0])] + ' x' + q[1]; }).join(' | ') : '';
      ORDER_PATCH_.set('gid://shopify/Order/' + p[0], [s[0], s[1], s[2], s[3], products, s[4], s[5], s[6]]);
    });
  }
  return ORDER_PATCH_.get(String(id)) || null;
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

/*
 * Draws the page in place: values and formats overwrite the old ones (the tab is never cleared first, so it never
 * shows empty), merges are redone only when they moved, and rows left from a longer old page are cleared.
 * Nothing is written when the page is the same as last time, except the cells in g.live ("Last Update").
 * Returns true when the page was redrawn.
 */
function writeGrid_(sh, g) {
  const R = Math.max(g.rows.length, 1), W = TODAY.WIDTH, props = PropertiesService.getDocumentProperties(), name = sh.getName();
  const pick = k => { const out = []; for (let r = 0; r < R; r++) { const line = []; for (let c = 0; c < W; c++) { const x = (g.rows[r] || [])[c]; line.push(x ? x[k] : (k === 'v' ? '' : k === 'fc' ? '#000000' : k === 'b' ? 'normal' : k === 'nf' ? 'General' : k === 'al' ? 'left' : null)); } out.push(line); } return out; };
  const v = pick('v'), live = (g.live || []).filter(x => x[0] <= R), still = v.map(r => r.slice());
  live.forEach(x => { still[x[0] - 1][x[1] - 1] = ''; });
  const look = [pick('nf'), pick('bg'), pick('fc'), pick('b'), pick('al')], hash = sha_(JSON.stringify([still, look]));
  const mergeSig = sha_(JSON.stringify(g.merges)), old = sh.getLastRow();
  if (props.getProperty('GH_' + name) === hash && old <= R && String(sh.getRange(1, 1).getValue()) === String(v[0][0])) { // still there
    live.forEach(x => sh.getRange(x[0], x[1]).setValue(v[x[0] - 1][x[1] - 1]));
    return false;
  }
  if (R > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), R - sh.getMaxRows());
  if (sh.getMaxColumns() < W) sh.insertColumnsAfter(sh.getMaxColumns(), W - sh.getMaxColumns());
  const newMerges = props.getProperty('GM_' + name) !== mergeSig;
  if (newMerges) { sh.getRange(1, 1, Math.max(old, R), Math.max(W, sh.getLastColumn())).breakApart(); sh.setConditionalFormatRules([]); }
  sh.getRange(1, 1, R, W).setNumberFormats(look[0]).setValues(v).setBackgrounds(look[1]).setFontColors(look[2])
    .setFontWeights(look[3]).setHorizontalAlignments(look[4]);
  if (old > R) sh.getRange(R + 1, 1, old - R, Math.max(W, sh.getLastColumn())).clear();
  if (newMerges) g.merges.forEach(m => sh.getRange(m[0], m[1], m[2], m[3]).merge());
  props.setProperty('GH_' + name, hash);
  props.setProperty('GM_' + name, mergeSig);
  return true;
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
  recentRows_(APP.T.ADS, ADS_HEADERS.length, 1, asKey_, today).forEach(a => {
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
  g.live = [[5, 2]]; // Last Update: written every time, even when nothing else changed
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
  [[APP.META_OUT, 'META (حساب مش معانا)', 'مش داخل في التوتال: ' + outNames], [APP.DIRECT, 'DIRECT', 'مباشر أو لينك البايو (من غير إعلان)'],
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

/* Meta orders since `from` (not from an account outside the sheet): its ad, the ad's product, and the products ordered. */
function todayOrders_(from) {
  const osh = ss_().getSheetByName(APP.T.ORDERS), out = [];
  if (!osh) return out;
  const idx = adMapIndex_(), catAds = catalogAdIds_(), known = metaIdsOf_();
  recentRows_(APP.T.ORDERS, ORDERS_HEADERS.length, 2, sortKey_, from).forEach(o => {
    const d = asKey_(o[2]);
    if (!d || d < from || o[3] !== 'META' || outsideMeta_(o, known)) return;
    const items = [];
    lineItems_(o[6]).forEach(li => {
      const name = productNameOf_(li.title), it = items.find(x => x.name === name);
      if (it) it.qty += li.qty; else items.push({ name: name, qty: li.qty });
    });
    out.push({ d: d, ad: String(o[14] || ''), key: orderAdProduct_(o, idx, catAds),
      items: items.length ? items : [{ name: String(o[5] || APP.UNKNOWN_PRODUCT), qty: 1 }] });
  });
  return out;
}
/*
 * [[ordered product, orders]] for a list of orders. Each order counts once: on `prefer` (the ad's product) when the order
 * has it, else on the product with the most pieces. Other products in those orders show next to the name ("+ 3 منتجات تانية").
 */
function orderedList_(orders, prefer) {
  const n = {}, more = {};
  orders.forEach(o => {
    const main = o.items.some(i => i.name === prefer) ? prefer : o.items.reduce((a, b) => (b.qty > a.qty ? b : a)).name;
    n[main] = (n[main] || 0) + 1;
    more[main] = more[main] || [];
    o.items.forEach(i => { if (i.name !== main && more[main].indexOf(i.name) < 0) more[main].push(i.name); });
  });
  const label = (name, m) => name + (m.length === 1 ? ' + ' + m[0] : m.length === 2 ? ' + منتجين تانيين' : m.length ? ' + ' + m.length + ' منتجات تانية' : '');
  return Object.keys(n).sort((a, b) => ((b === prefer) - (a === prefer)) || (n[b] - n[a]) || (a < b ? -1 : 1)).map(i => [label(i, more[i]), n[i]]);
}
/*
 * One line per product of the ads: store orders (UTM), Meta's pixel purchases, spend, CPP, ROAS, and how many of its ads
 * are running now. Which products those orders bought, campaign by campaign, is in the الكتالوج tab.
 */
function todayProducts_(g, r, title, from, to, rows) {
  const S = TODAY, c = S.RIGHT_COL, meta = {}, active = activeMap_(), special = [APP.CATALOG, APP.MULTI, APP.UNMAPPED, APP.META_NO_AD, APP.UNKNOWN_PRODUCT];
  rows.forEach(x => {
    if (x[0] < from || x[0] > to || x[1] !== 'META') return;
    const t = meta[x[2]] = meta[x[2]] || { spend: 0, orders: 0, revenue: 0, pixel: 0 };
    t.spend += num_(x[3]); t.orders += num_(x[8]); t.revenue += num_(x[10]); t.pixel += num_(x[7]);
  });
  r = todayHead_(g, r, c, 7, title, ['PRODUCT', 'META ORDERS', 'PIXEL PURCHASES', 'META SPEND', 'META CPP', 'META ROAS', 'ADS RUNNING NOW']);
  const names = Object.keys(meta).filter(n => special.indexOf(n) < 0 && (meta[n].spend > 0 || meta[n].orders > 0))
    .sort((a, b) => (meta[b].spend - meta[a].spend) || (meta[b].orders - meta[a].orders));
  const tot = { spend: 0, orders: 0, revenue: 0, pixel: 0, ads: 0 };
  const put = (name, t, ads, style) => {
    const num = (col, v, nf) => g.set(r, col, v, Object.assign({ nf: nf, al: 'right' }, style));
    g.set(r, c, name, style);
    num(c + 1, t.orders, S.COUNT); num(c + 2, t.pixel, S.COUNT); num(c + 3, Math.round(t.spend * 100) / 100, S.MONEY);
    num(c + 4, ratioOrBlank_(t.spend, t.orders, 2), S.MONEY); num(c + 5, ratioOrBlank_(t.revenue, t.spend, 2), S.RATIO);
    g.set(r, c + 6, ads || '', Object.assign({ nf: S.COUNT, al: 'center' }, style, { fc: '#137333' }));
    r++;
  };
  // CATALOG first (all catalog / Advantage+ ads together), then products, then the rest.
  const add = (n, style) => {
    const t = meta[n];
    if (!t || (t.spend <= 0 && t.orders <= 0)) return;
    put(n, t, active[n] || 0, style);
    ['spend', 'orders', 'revenue', 'pixel'].forEach(k => { tot[k] += t[k]; });
    tot.ads += active[n] || 0;
  };
  add(APP.CATALOG, { bg: S.CATALOG, b: 'bold' });
  names.forEach(n => add(n, {}));
  special.filter(n => n !== APP.CATALOG).forEach(n => add(n, { bg: S.SPECIAL }));
  if (!names.length && !special.some(n => meta[n])) { g.set(r, c, 'مفيش صرف Meta في الفترة دي', { fc: '#6b7280' }); r++; }
  put('TOTAL META', tot, tot.ads, { bg: S.TOTAL, b: 'bold' });
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
  r = todayProducts_(g, r, 'PRODUCT PERFORMANCE — TODAY | ' + shown, today, today, rows) + 1;
  todayProducts_(g, r, 'PRODUCT PERFORMANCE — THIS MONTH | ' + month, today.slice(0, 8) + '01', today, rows);
  if (!writeGrid_(sh, g)) return;
  sh.setFrozenRows(0);
  [[1, 150], [2, 210], [3, 120], [4, 130], [5, 130], [6, 130], [7, 24], [8, 240]].forEach(w => sh.setColumnWidth(w[0], w[1]));
  for (let col = 9; col <= TODAY.WIDTH; col++) sh.setColumnWidth(col, 125);
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
    withLock_(() => { rebuildViews_({ full: true, slow: true }); });
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
