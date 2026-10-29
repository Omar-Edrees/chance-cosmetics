/*
 * Generic Ads Sheet — engine v1.
 * Everything business-specific lives in the Settings / Accounts / Products / Benchmarks tabs.
 * The code never hard-codes a business. PROFILE (00_profile.gs) only seeds empty tabs once.
 * Ad accounts and stores are read-only from here: no writes to Meta, TikTok or order sources.
 */
const APP = {
  VERSION: '1.18.1',
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
