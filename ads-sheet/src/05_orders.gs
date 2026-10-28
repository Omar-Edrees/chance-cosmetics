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
  const byName = new Map();
  (full ? rawRows_(APP.T.ADS, ADS_HEADERS.length) : recentRows_(APP.T.ADS, ADS_HEADERS.length, 1, asKey_, shiftKey_(todayKey_(), -60))).forEach(a => {
    const k = norm_(a[5]) + '|' + norm_(a[9]);
    if (a[8] && !byName.has(k)) byName.set(k, String(a[8]));
  });
  const cancelWords = cfgList_('orders.cancelled_words').map(norm_);
  const byId = new Map();
  let noDate = 0;
  rows.forEach(r0 => {
    const id = String(get(r0, 'order_id') === null ? '' : get(r0, 'order_id')).trim();
    if (!id) return;
    // A row from before Flow wrote the form columns: those columns from ORDER_PATCH (16_orders_patch.gs).
    const fix = !ORDER_PATCH_COLS.some(k => k !== 'product' && get(r0, k)) ? orderPatch_(id) : null;
    const r = !fix ? r0 : r0.slice();
    if (fix) ORDER_PATCH_COLS.forEach((k, i) => { if (c[k] >= 0) r[c[k]] = fix[i]; });
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
  if (noDate && full) setStatus_('ORDERS_NODATE', noDate + ' صف من غير تاريخ مفهوم');
  const out = Array.from(byId.values()).map(o => {
    const pl = platformOf_(o.utms, o.referrer, o.source);
    const adId = (o.utms.join(' ').match(/\d{10,}/g) || []).find(x => adIds.has(x)) || byName.get(norm_(o.utms[0]) + '|' + norm_(o.utms[1])) || '';
    return [o.id, Utilities.formatDate(o.dt, tz_(), 'yyyy-MM-dd HH:mm'), dayKey_(o.dt), pl.p, pl.s, productOfOrder_(o.raw),
      o.raw.replace(/\s+/g, ' ').slice(0, 1000), o.total, o.city, o.phone ? '0' + o.phone : '', o.alt ? '0' + o.alt : '',
      o.utms[0], o.utms[1], o.utms[2], adId, o.cancelled];
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
    const sh = ensureTab_(APP.T.ORDERS, ORDERS_HEADERS), text = [1, 2, 3, 10, 11, 15], byCreated = (a, b) => (sortKey_(a[1]) < sortKey_(b[1]) ? 1 : -1);
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
