/*
 * Tab "Shopify": Shopify's own Analytics numbers (ShopifyQL through the app in 29_shopify_api.gs, read-only) and what they mean.
 * From the top:
 *  1) Today until now against yesterday and the same weekday last week until the same time (their hour of now counts by the
 *     minutes gone), and two lines that say what the change means: visits against orders (conversion), then the AOV.
 *     A change under SHOPTAB.STEP counts as no change.
 *  2) Visits to product pages whose stock is 0 or less (stock as in المنتجات), with the Meta ads running on the product now
 *     and the spend on it (Daily Log): money paid for visits that can't buy.
 *  3) Clicks that don't reach the site: Shopify sessions from each Meta account's ads ÷ Meta's outbound clicks, day by day.
 *     A session's account comes from utm_term (the ad set ID) the way the funnel does it: the ID in Ads Raw, else its last
 *     4 digits. Sessions with no utm_term (the in-app browser drops it sometimes) aren't counted, so the level matters
 *     less than a day that falls (red under 80% of the account's median day, yellow under 90%).
 *  4) Day by day (this month, each of the 3 months before it, those 3 together, then the last 30 days): sessions, the steps
 *     to an order, conversion rate, bounce rate, orders, total sales, AOV and the returning customers' share of the sales.
 *  5) Orders by hour and weekday (the last 4 full weeks), new vs returning customers, sessions by device and governorate,
 *     sales by referrer.
 * These are Shopify's numbers, not the sheet's: orders are every store order (the outside account's too), and total sales is
 * as Shopify shows it (returns and cancellations recorded that day come off). AOV = (gross sales − discounts) ÷ orders, the
 * value of the orders placed, so returns of older orders don't move it. The COD form places its orders in a session of its
 * own (device "other", no governorate, landing on the home page), so conversion is right for the store as a whole only.
 * Reads: 1) and 2) on every update; the rest every SHOPTAB.EVERY_MS and on the first update of a day, kept in document
 * properties. Drawn with the views (after Daily Log), only in a run that read Shopify.
 */
const SHOPTAB = {
  TAB: 'Shopify', SLOW_KEY: 'SHOPTAB_SLOW', EVERY_MS: 3 * 3600000, PART: 8000, V: 1,
  MONTHS: 3, DAYS: 30, CLICK_DAYS: 14, HEAT_DAYS: 28, STEP: 0.05, MIN_SESSIONS: 300, MIN_ORDERS: 10, TOP: 10, MAX_STOCKLESS: 25,
  CLICK_RED: 0.8, CLICK_AMBER: 0.9, WIDTH: 13,
  DARK: '#1f2937', YELLOW: '#fff200', LABEL: '#f3f4f6', AVG3_BG: '#e8eefc', TODAY_BG: '#fff7d6',
  GREEN: '#d9ead3', RED: '#f4cccc', AMBER: '#fff2cc', SOFT: '#4b5563',
  HEAT: ['#ffffff', '#e8eefc', '#c7d6fa', '#9db7f5', '#6f93ee', '#3f6be3'],
  COUNT: '#,##0', MONEY: '#,##0', PCT: '0.00%', CHG: '+0%;-0%;0%',
  /* Sunday first, as Date.getUTCDay(). Shopify's day_of_week is 0 = Monday. */
  DAY_NAMES: ['الأحد', 'الاتنين', 'التلات', 'الأربع', 'الخميس', 'الجمعة', 'السبت'],
  KEYS: ['sessions', 'atc', 'checkout', 'done', 'bounced', 'orders', 'value', 'reversals', 'total', 'newOrders', 'retOrders', 'newSales', 'retSales'],
  QL: 'query($q:String!){shopifyqlQuery(query:$q){tableData{columns{name dataType} rows} parseErrors}}'
};
/* What this run read from Shopify for the tab (null: nothing, so the views leave the tab as it is). */
let SHOPTAB_FAST_ = null;

/* One ShopifyQL query → rows as {column: value}. */
function shopTabQl_(q) {
  const res = (shopifyGql_(SHOPTAB.QL, { q: q }) || {}).shopifyqlQuery || {};
  const errs = res.parseErrors || [];
  if (errs.length) throw new Error('ShopifyQL: ' + JSON.stringify(errs).slice(0, 300) + ' — ' + q.slice(0, 80));
  const t = res.tableData || {}, cols = (t.columns || []).map(c => c.name);
  let rows = t.rows || [];
  if (typeof rows === 'string') { try { rows = JSON.parse(rows); } catch (e) { rows = []; } }
  return rows.map(r => (Array.isArray(r) ? cols.reduce((o, c, i) => { o[c] = r[i]; return o; }, {}) : r));
}
function shopTabZero_() { const t = {}; SHOPTAB.KEYS.forEach(k => { t[k] = 0; }); return t; }
function shopTabAdd_(t, x, w) { SHOPTAB.KEYS.forEach(k => { t[k] += (x[k] || 0) * (w === undefined ? 1 : w); }); return t; }
function shopTabSessions_(r) {
  return { sessions: num_(r.sessions), atc: num_(r.sessions_with_cart_additions), checkout: num_(r.sessions_that_reached_checkout),
    done: num_(r.sessions_that_completed_checkout), bounced: num_(r.bounce_rate) * num_(r.sessions) };
}
function shopTabSales_(r) {
  return { orders: num_(r.orders), value: num_(r.gross_sales) + num_(r.discounts), reversals: -num_(r.sales_reversals), total: num_(r.total_sales) };
}
/* New / Returning rows → the four fields (Shopify's "" row, a few refunds with no customer, is left out). */
function shopTabKind_(r) {
  const k = String(r.new_or_returning_customer || '').toLowerCase();
  if (k === 'new') return { newOrders: num_(r.orders), newSales: num_(r.total_sales) };
  if (k === 'returning') return { retOrders: num_(r.orders), retSales: num_(r.total_sales) };
  return {};
}

/* Every update: today and the 7 days before it hour by hour, product landing pages (today, last 7 days), today's customers. */
function shopTabFetchFast_() {
  const today = todayKey_(), week = shiftKey_(today, -7), hours = {}, tz = tz_();
  const put = (ts, vals) => {
    const d = new Date(ts);
    if (isNaN(d)) return;
    const day = dayKey_(d), h = Number(Utilities.formatDate(d, tz, 'H')), x = hours[day] = hours[day] || {};
    shopTabAdd_(x[h] = x[h] || shopTabZero_(), vals);
  };
  const range = ' SINCE ' + week + ' UNTIL ' + today;
  shopTabQl_('FROM sessions SHOW sessions, sessions_with_cart_additions, sessions_that_reached_checkout, sessions_that_completed_checkout, ' +
    'bounce_rate TIMESERIES hour' + range + ' LIMIT 1000').forEach(r => put(r.hour, shopTabSessions_(r)));
  shopTabQl_('FROM sales SHOW orders, gross_sales, discounts, sales_reversals, total_sales TIMESERIES hour' + range + ' LIMIT 1000')
    .forEach(r => put(r.hour, shopTabSales_(r)));
  const pages = from => {
    const out = {};
    shopTabQl_("FROM sessions SHOW sessions WHERE landing_page_path CONTAINS '/products/' GROUP BY landing_page_path SINCE " + from +
      ' UNTIL ' + today + ' ORDER BY sessions DESC LIMIT 1000').forEach(r => { out[String(r.landing_page_path)] = num_(r.sessions); });
    return out;
  };
  const kinds = shopTabZero_();
  shopTabQl_('FROM sales SHOW orders, total_sales GROUP BY new_or_returning_customer SINCE ' + today + ' UNTIL ' + today)
    .forEach(r => shopTabAdd_(kinds, shopTabKind_(r)));
  return { atMs: Date.now(), today: today, hours: hours, pagesToday: pages(today), pagesWeek: pages(shiftKey_(today, -6)), kinds: kinds };
}

/* Ad set / campaign / ad ID (utm_term) → our Meta account: the ID in Ads Raw, else its last 4 digits. '' for anything else. */
function shopTabAccountOf_(accs) {
  const ids = new Set(accs.map(a => a.id)), exact = {}, tail = {};
  recentRows_(APP.T.ADS, ADS_HEADERS.length, 1, asKey_, shiftKey_(todayKey_(), -60)).forEach(a => {
    const acc = String(a[2]);
    if (a[1] !== 'META' || !ids.has(acc)) return;
    [a[4], a[6], a[8]].forEach(x => { if (x) { exact[String(x)] = acc; tail[String(x).slice(-4)] = acc; } });
  });
  return term => { const t = String(term || '').trim(); return /^\d{8,}$/.test(t) ? exact[t] || tail[t.slice(-4)] || '' : ''; };
}

/* Every SHOPTAB.EVERY_MS: the days since the first day of the month 3 months ago, and the rest of the tab. */
function shopTabFetchSlow_() {
  const S = SHOPTAB, today = todayKey_(), p = today.split('-').map(Number), days = {};
  const from = new Date(Date.UTC(p[0], p[1] - 1 - S.MONTHS, 1)).toISOString().slice(0, 10), d30 = shiftKey_(today, 1 - S.DAYS);
  const day = r => { const k = String(r.day || '').slice(0, 10); return days[k] = days[k] || shopTabZero_(); };
  const range = ' SINCE ' + from + ' UNTIL ' + today;
  shopTabQl_('FROM sessions SHOW sessions, sessions_with_cart_additions, sessions_that_reached_checkout, sessions_that_completed_checkout, ' +
    'bounce_rate TIMESERIES day' + range + ' LIMIT 1000').forEach(r => shopTabAdd_(day(r), shopTabSessions_(r)));
  shopTabQl_('FROM sales SHOW orders, gross_sales, discounts, sales_reversals, total_sales TIMESERIES day' + range + ' LIMIT 1000')
    .forEach(r => shopTabAdd_(day(r), shopTabSales_(r)));
  shopTabQl_('FROM sales SHOW orders, total_sales GROUP BY new_or_returning_customer TIMESERIES day' + range + ' LIMIT 2000')
    .forEach(r => shopTabAdd_(day(r), shopTabKind_(r)));
  const heat = [0, 1, 2, 3, 4, 5, 6].map(() => new Array(24).fill(0));
  shopTabQl_('FROM sales SHOW orders GROUP BY day_of_week, hour_of_day SINCE ' + shiftKey_(today, -S.HEAT_DAYS) + ' UNTIL ' +
    shiftKey_(today, -1) + ' LIMIT 1000').forEach(r => {
    const d = Number(r.day_of_week), h = Number(r.hour_of_day);
    if (d >= 0 && d < 7 && h >= 0 && h < 24) heat[d][h] += num_(r.orders);
  });
  const last30 = ' SINCE ' + d30 + ' UNTIL ' + today;
  const device = shopTabQl_('FROM sessions SHOW sessions GROUP BY session_device_type' + last30).map(r => [String(r.session_device_type || ''), num_(r.sessions)]);
  const region = shopTabQl_('FROM sessions SHOW sessions GROUP BY session_region' + last30 + ' ORDER BY sessions DESC LIMIT 100')
    .map(r => [String(r.session_region || ''), num_(r.sessions)]);
  const ref = shopTabQl_('FROM sales SHOW orders, total_sales GROUP BY order_referrer_source, order_referrer_name' + last30 +
    ' ORDER BY total_sales DESC LIMIT 100').map(r => [String(r.order_referrer_source || ''), String(r.order_referrer_name || ''), num_(r.orders), num_(r.total_sales)]);
  const out = { v: S.V, day: today, atMs: Date.now(), at: nowText_(), heat: heat, device: device, region: region, ref: ref, accounts: [], clicks: {}, clickErr: '' };
  out.days = {};
  Object.keys(days).filter(Boolean).forEach(k => { out.days[k] = S.KEYS.map(x => round2_(days[k][x])); });
  try { shopTabFetchClicks_(out, today); } catch (e) { out.clickErr = errText_(e); }
  return out;
}
/* Sessions from each Meta account's ads (utm_term) and Meta's outbound clicks, day by day: out.clicks[id][day] = [sessions, clicks]. */
function shopTabFetchClicks_(out, today) {
  const accs = accounts_('META'), from = shiftKey_(today, 1 - SHOPTAB.CLICK_DAYS);
  if (!accs.length) return;
  out.accounts = accs.map(a => ({ id: a.id, name: a.name || a.id }));
  accs.forEach(a => { out.clicks[a.id] = {}; });
  const cell = (id, d) => (out.clicks[id][d] = out.clicks[id][d] || [0, 0]);
  const accOf = shopTabAccountOf_(accs);
  shopTabQl_('FROM sessions SHOW sessions GROUP BY utm_term TIMESERIES day SINCE ' + from + ' UNTIL ' + today + ' LIMIT 10000').forEach(r => {
    const id = accOf(r.utm_term), d = String(r.day || '').slice(0, 10);
    if (id && d) cell(id, d)[0] += num_(r.sessions);
  });
  const res = metaMany_(accs.map(a => ({ path: 'act_' + a.id + '/insights', params: { level: 'account', fields: 'outbound_clicks,date_start',
    time_range: JSON.stringify({ since: from, until: today }), time_increment: 1, limit: 500 } })));
  const failed = [];
  res.forEach((x, i) => {
    if (x.error) { failed.push(out.accounts[i].name); return; }
    (x.payload.data || []).forEach(r => {
      const o = (r.outbound_clicks || []).find(y => y.action_type === 'outbound_click');
      if (o) cell(accs[i].id, String(r.date_start))[1] += num_(o.value);
    });
  });
  if (failed.length) out.clickErr = 'ماقدرتش أقرا الكليكات من Meta: ' + failed.join('، ');
}

/* The slow part, saved in parts (a document property holds 9KB at most). */
function shopTabSave_(slow) {
  const props = PropertiesService.getDocumentProperties(), json = JSON.stringify(slow), n = Number(props.getProperty(SHOPTAB.SLOW_KEY + '_N') || 0);
  const parts = [];
  for (let i = 0; i < json.length; i += SHOPTAB.PART) parts.push(json.slice(i, i + SHOPTAB.PART));
  parts.forEach((x, i) => props.setProperty(SHOPTAB.SLOW_KEY + '_' + i, x));
  for (let i = parts.length; i < n; i++) props.deleteProperty(SHOPTAB.SLOW_KEY + '_' + i);
  props.setProperty(SHOPTAB.SLOW_KEY + '_N', String(parts.length));
}
function shopTabSlow_() {
  const props = PropertiesService.getDocumentProperties(), n = Number(props.getProperty(SHOPTAB.SLOW_KEY + '_N') || 0);
  let json = '';
  for (let i = 0; i < n; i++) json += props.getProperty(SHOPTAB.SLOW_KEY + '_' + i) || '';
  try { const s = json ? JSON.parse(json) : null; return s && s.v === SHOPTAB.V ? s : null; } catch (e) { return null; }
}

/* EXT.live (outside the lock): reads Shopify for the tab; the views draw it. force: the slow part too. */
function refreshShopTab_(force) {
  SHOPTAB_FAST_ = null;
  if (!shopifyProps_().getProperty('SHOPIFY_TOKEN') || !timeLeft_()) return false;
  try {
    const fast = time_('Shopify tab', () => shopTabFetchFast_());
    const slow = shopTabSlow_();
    let note = '';
    if (force || !slow || slow.day !== fast.today || Date.now() - slow.atMs >= SHOPTAB.EVERY_MS) {
      try { shopTabSave_(time_('Shopify tab — slow', () => shopTabFetchSlow_())); }
      catch (e) { note = ' — الجزء اللي بيتقري كل 3 ساعات ماتقراش: ' + errText_(e); }
    }
    SHOPTAB_FAST_ = fast;
    setStatus_('SHOPTAB', (note ? '⚠️ اتقرا' + note : '✓ اتقرا'));
    return true;
  } catch (e) { setStatus_('SHOPTAB', '✗ ' + errText_(e)); return false; }
}
function refreshShopTabNow() {
  try {
    if (!shopifyProps_().getProperty('SHOPIFY_TOKEN')) { alert_('الشيت مش مربوط بشوبيفاي. اعمل 🔑 ربط أبليكيشن شوبيفاي الأول.'); return; }
    resetCaches_();
    if (!refreshShopTab_(true)) { alert_('تاب ' + SHOPTAB.TAB + ' ماتحدثش:\n' + getStatus_('SHOPTAB')); return; }
    withLock_(() => writeShopTab_(), 120000);
    alert_('اتحدث تاب ' + SHOPTAB.TAB + ' ✅\n' + getStatus_('SHOPTAB'));
    ss_().setActiveSheet(tab_(SHOPTAB.TAB));
  } catch (e) { alert_('تاب ' + SHOPTAB.TAB + ' ماتحدثش:\n' + errText_(e)); }
}

/* ---------- Drawing ---------- */

function shopTabWeekday_(key) { return new Date(key + 'T12:00:00Z').getUTCDay(); }
function shopTabDayLabel_(key) { return SHOPTAB.DAY_NAMES[shopTabWeekday_(key)] + ' ' + Number(key.slice(8, 10)) + '/' + Number(key.slice(5, 7)); }
function shopTabRatio_(a, b) { return b > 0 ? a / b : ''; }
function shopTabChange_(a, b) { return typeof a === 'number' && typeof b === 'number' && b > 0 ? a / b - 1 : ''; }
/* A day's numbers until hour H: the hours before it whole, hour H by the share f of it gone (whole for today: its data stops now). */
function shopTabCut_(hours, day, H, f) {
  const t = shopTabZero_(), x = hours[day] || {};
  for (let h = 0; h <= H; h++) if (x[h]) shopTabAdd_(t, x[h], h < H ? 1 : f);
  return t;
}
function shopTabBand_(g, r, title, width) {
  g.set(r, 1, title, { bg: SHOPTAB.DARK, fc: '#ffffff', b: 'bold', al: 'center' });
  g.fill(r, 2, width - 1, { bg: SHOPTAB.DARK });
  g.merge(r, 1, 1, width);
  return r + 1;
}
function shopTabHead_(g, r, headers) {
  headers.forEach((h, i) => g.set(r, 1 + i, h, { bg: SHOPTAB.YELLOW, b: 'bold', al: 'center' }));
  return r + 1;
}
function shopTabText_(g, r, text, style) {
  g.set(r, 1, text, Object.assign({ fc: SHOPTAB.SOFT }, style || {}));
  g.merge(r, 1, 1, SHOPTAB.WIDTH);
  return r + 1;
}

/* What a change means (the rules in the tab's note). a = today, b = the day it's compared with, both until the same time. */
function shopTabDiagnose_(a, b) {
  const S = SHOPTAB;
  if (a.sessions < S.MIN_SESSIONS || b.sessions < S.MIN_SESSIONS || b.orders < S.MIN_ORDERS) {
    return ['لسه بدري: الزيارات والأوردرات لحد دلوقتي قليلة عشان نحكم.', ''];
  }
  const ch = (x, y) => (y > 0 ? x / y - 1 : 0), dir = v => (v > S.STEP ? 1 : v < -S.STEP ? -1 : 0);
  const pct = v => Math.round(Math.abs(v) * 100) + '%';
  const s = ch(a.sessions, b.sessions), o = ch(a.orders, b.orders), cr = ch(a.done / a.sessions, b.done / b.sessions);
  const aov = ch(a.value / Math.max(a.orders, 1), b.value / Math.max(b.orders, 1));
  const ds = dir(s), dc = dir(cr);
  let one;
  if (ds > 0 && dc > 0) one = 'الزيارات زادت ' + pct(s) + ' والتحويل كمان زاد ' + pct(cr) + ': زيارات أكتر وأحسن. أحسن حالة.';
  else if (ds > 0 && dc === 0) one = 'الزيارات زادت ' + pct(s) + ' والأوردرات زادت معاها ' + pct(o) + ': نمو طبيعي.';
  else if (ds > 0 && o > S.STEP) one = 'الزيارات زادت ' + pct(s) + ' والأوردرات ' + pct(o) + ' بس، فالتحويل قل ' + pct(cr) +
    ': الزيارات الزيادة أضعف. طبيعي وإنت بتكبّر، بس راقب الاستهداف والكرييتيف.';
  else if (ds > 0) one = 'الزيارات زادت ' + pct(s) + ' والأوردرات مازادتش، فالتحويل قل ' + pct(cr) +
    ': الزيارات الجديدة ضعيفة (استهداف أو كرييتيف بيجيب كليكات مش مشترين)، أو حاجة في الموقع باظت.';
  else if (ds === 0 && dc > 0) one = 'الزيارات زي ما هي والأوردرات زادت ' + pct(o) + ': الموقع أو العرض بقى بيقنع أكتر.';
  else if (ds === 0 && dc === 0) one = 'الزيارات والأوردرات زي ما هم: مفيش تغيير.';
  else if (ds === 0) one = 'الزيارات زي ما هي والأوردرات قلت ' + pct(o) + ': المشكلة في الموقع نفسه: منتج خلص، أو سعر اتغير، أو الفورم واقف، أو الموقع تقيل.';
  else if (dc > 0 && o >= -S.STEP) one = 'الزيارات قلت ' + pct(s) + ' بس الأوردرات ماقلتش، فالتحويل زاد ' + pct(cr) + ': زيارات أقل بس أحسن. وقت مناسب تكبّر.';
  else if (dc > 0) one = 'الزيارات قلت ' + pct(s) + ' والأوردرات قلت أقل منها (' + pct(o) + '): الزيارات اللي فضلت أحسن، بس شوف الصرف قل ليه.';
  else if (dc === 0) one = 'الزيارات قلت ' + pct(s) + ' والأوردرات قلت معاها ' + pct(o) + ': المشكلة في الترافيك مش الموقع: الصرف قل، أو إعلان وقف أو اترفض، أو الـ CPM غلي.';
  else one = 'الزيارات قلت ' + pct(s) + ' والتحويل كمان قل ' + pct(cr) + ': الترافيك قل والموقع بيحوّل أقل. ابدأ بالموقع (منتج خلص، الفورم واقف)، وبعدين الإعلانات.';
  if (dc < 0) {
    const steps = [[ch(a.atc / a.sessions, b.atc / b.sessions), 'الإضافة للسلة (صفحة المنتج أو السعر أو الزيارات نفسها)'],
      [ch(a.checkout / Math.max(a.atc, 1), b.checkout / Math.max(b.atc, 1)), 'من السلة للـ checkout (السلة أو الشحن أو العرض)'],
      [ch(a.done / Math.max(a.checkout, 1), b.done / Math.max(b.checkout, 1)), 'إتمام الطلب (الفورم)']].sort((x, y) => x[0] - y[0]);
    if (steps[0][0] < -S.STEP) one += ' أكتر خطوة وقعت: ' + steps[0][1] + '، قلت ' + pct(steps[0][0]) + '.';
  }
  const da = dir(aov);
  let two = da > 0 ? 'متوسط الأوردر زاد ' + pct(aov) + ': الباندل أو الأبسيل شغال، أو جالك كام أوردر كبير.'
    : da < 0 ? 'متوسط الأوردر قل ' + pct(aov) + ': منتج أرخص بيتباع أكتر، أو خصم كبير، أو الأبسيل والباندل مش شغالين.'
    : 'متوسط الأوردر زي ما هو.';
  if (dir(ch(a.total, b.total)) < dir(ch(a.value, b.value)) && a.reversals > b.reversals * 1.2 && a.reversals > 0) {
    two += ' والمبيعات (Total sales) قلت عن قيمة الأوردرات بسبب مرتجعات وإلغاء اتسجلوا النهارده، مش بسبب البيع.';
  }
  return [one, two];
}

/* 1) Today until now vs yesterday and the same weekday last week, and what it means. */
function shopTabCompare_(g, r, fast) {
  const S = SHOPTAB, now = new Date(fast.atMs), tz = tz_(), H = Number(Utilities.formatDate(now, tz, 'H'));
  const f = Number(Utilities.formatDate(now, tz, 'm')) / 60, today = fast.today, y = shiftKey_(today, -1), w = shiftKey_(today, -7);
  const a = shopTabCut_(fast.hours, today, H, 1), b = shopTabCut_(fast.hours, y, H, f), c = shopTabCut_(fast.hours, w, H, f);
  const wName = S.DAY_NAMES[shopTabWeekday_(w)] + ' اللي فات (' + Number(w.slice(8, 10)) + '/' + Number(w.slice(5, 7)) + ')';
  r = shopTabBand_(g, r, 'النهارده لحد ' + Utilities.formatDate(now, tz, 'HH:mm') + ' قدام إمبارح و' + wName + ' لحد نفس الساعة', 6);
  r = shopTabHead_(g, r, ['المؤشر', 'النهارده', 'إمبارح', 'التغيير', wName, 'التغيير']);
  const R = shopTabRatio_;
  /* [label, value(t), format, up is good?] */
  [['Sessions (الزيارات)', t => t.sessions, S.COUNT, true],
    ['Orders (الأوردرات)', t => t.orders, S.COUNT, true],
    ['Conversion rate (التحويل)', t => R(t.done, t.sessions), S.PCT, true],
    ['Total sales (المبيعات)', t => t.total, S.MONEY, true],
    ['AOV (متوسط الأوردر)', t => R(t.value, t.orders), S.MONEY, true],
    ['Added to cart ÷ Sessions', t => R(t.atc, t.sessions), S.PCT, true],
    ['Reached checkout ÷ Added to cart', t => R(t.checkout, t.atc), S.PCT, true],
    ['Completed ÷ Reached checkout', t => R(t.done, t.checkout), S.PCT, true],
    ['Bounce rate (خرجوا من أول صفحة)', t => R(t.bounced, t.sessions), S.PCT, false],
    ['مرتجعات وإلغاء اتسجلوا (Sales reversals)', t => t.reversals, S.MONEY, false]].forEach(m => {
    const va = m[1](a);
    g.set(r, 1, m[0], { bg: S.LABEL, b: 'bold' });
    g.set(r, 2, va, { nf: m[2], al: 'right', b: 'bold' });
    [[b, 3], [c, 5]].forEach(x => {
      const vb = m[1](x[0]), chg = shopTabChange_(va, vb);
      const good = chg === '' || Math.abs(chg) <= S.STEP ? null : (chg > 0) === m[3] ? S.GREEN : S.RED;
      g.set(r, x[1], vb, { nf: m[2], al: 'right' });
      g.set(r, x[1] + 1, chg, { nf: S.CHG, al: 'center', bg: good });
    });
    r++;
  });
  [['التشخيص قدام إمبارح', b], ['التشخيص قدام ' + wName, c]].forEach(x => {
    shopTabDiagnose_(a, x[1]).forEach((line, i) => {
      if (!line) return;
      g.set(r, 1, i ? '' : x[0], { bg: S.LABEL, b: 'bold' });
      g.set(r, 2, line, { b: i ? 'normal' : 'bold' });
      g.merge(r, 2, 1, S.WIDTH - 1);
      r++;
    });
  });
  return r;
}

/* 2) Visits to product pages that are out of stock. */
function shopTabStockless_(g, r, fast) {
  const S = SHOPTAB, rx = new RegExp(cfgStr_('business.product_url_regex') || '/products?/([^/]+)', 'i');
  const prods = products_(), stock = stockByName_().by, raw = readStock_().byHandle, active = activeMap_(), by = {};
  const nameOf = h => { const p = prods.find(x => x.slugs.indexOf(h) >= 0); return p ? p.name : raw[h] && raw[h].title ? productNameOf_(raw[h].title) : ''; };
  const add = (pages, k) => Object.keys(pages || {}).forEach(path => {
    const m = path.toLowerCase().match(rx), n = m ? nameOf(m[1]) : '';
    if (!n || stock[n] === undefined || stock[n] > 0) return;
    (by[n] = by[n] || { name: n, today: 0, week: 0, spendToday: 0, spendWeek: 0 })[k] += pages[path];
  });
  add(fast.pagesToday, 'today');
  add(fast.pagesWeek, 'week');
  const from = shiftKey_(fast.today, -6);
  if (Object.keys(by).length && ss_().getSheetByName(APP.T.DAILY)) dailyRows_().forEach(d => {
    const x = by[d[2]];
    if (!x || d[0] < from || d[0] > fast.today) return;
    x.spendWeek += num_(d[3]);
    if (d[0] === fast.today) x.spendToday += num_(d[3]);
  });
  const list = Object.keys(by).map(n => by[n]).sort((p, q) => ((active[q.name] || 0) - (active[p.name] || 0)) || (q.spendToday - p.spendToday) ||
    (q.today - p.today) || (q.week - p.week)).slice(0, S.MAX_STOCKLESS);
  r = shopTabBand_(g, r, 'زيارات على منتجات خلصانة (الستوك صفر) — فلوس إعلانات رايحة على الفاضي', 7);
  r = shopTabHead_(g, r, ['المنتج', 'الستوك', 'زيارات النهارده', 'زيارات آخر 7 أيام', 'إعلانات Meta شغالة دلوقتي', 'صرف النهارده', 'صرف آخر 7 أيام']);
  if (!list.length) return shopTabText_(g, r, 'مفيش زيارات على منتجات خلصانة ✅');
  list.forEach(x => {
    const hot = (active[x.name] || 0) > 0 || x.spendToday > 0, bg = hot ? S.RED : null;
    g.set(r, 1, x.name, { b: 'bold', bg: bg });
    g.set(r, 2, 'نفد', { al: 'center', bg: bg });
    [x.today, x.week, active[x.name] || 0, round2_(x.spendToday), round2_(x.spendWeek)]
      .forEach((v, i) => g.set(r, 3 + i, v, { nf: S.COUNT, al: 'right', bg: bg, b: i === 2 && v > 0 ? 'bold' : 'normal' }));
    r++;
  });
  return shopTabText_(g, r, 'الأحمر: عليه إعلان شغال أو اتصرف عليه النهارده، يعني بتدفع دلوقتي في زيارات مش هتشتري. الستوك من تاب المنتجات، والصرف من Daily Log.');
}

/* 3) Sessions from each Meta account's ads ÷ Meta's outbound clicks, day by day. */
function shopTabClicks_(g, r, slow) {
  const S = SHOPTAB, accs = slow.accounts || [], W = 1 + 3 * (accs.length + 1);
  r = shopTabBand_(g, r, 'الكليكات اللي بتضيع: زيارات شوبيفاي من إعلانات كل أكاونت ÷ Outbound clicks في Meta (اتقرا ' + slow.at + ')', Math.max(W, 4));
  if (!accs.length) return shopTabText_(g, r, slow.clickErr || 'مفيش أكاونتات Meta في تاب Accounts.');
  const cols = accs.concat([{ id: '', name: 'الأكاونتات كلها' }]), today = slow.day;
  g.set(r, 1, 'اليوم', { bg: S.YELLOW, b: 'bold', al: 'center' });
  cols.forEach((a, i) => { g.set(r, 2 + 3 * i, a.name, { bg: S.YELLOW, b: 'bold', al: 'center' }); g.fill(r, 3 + 3 * i, 2, { bg: S.YELLOW }); g.merge(r, 2 + 3 * i, 1, 3); });
  r++;
  g.set(r, 1, '', { bg: S.YELLOW });
  cols.forEach((a, i) => ['زيارات', 'Outbound clicks', 'وصل الموقع'].forEach((h, j) => g.set(r, 2 + 3 * i + j, h, { bg: S.YELLOW, b: 'bold', al: 'center' })));
  r++;
  const days = [];
  for (let i = 0; i < S.CLICK_DAYS; i++) days.push(shiftKey_(today, -i));
  const val = (a, d) => {
    if (a.id) return (slow.clicks[a.id] || {})[d] || [0, 0];
    return accs.reduce((t, x) => { const v = (slow.clicks[x.id] || {})[d] || [0, 0]; return [t[0] + v[0], t[1] + v[1]]; }, [0, 0]);
  };
  const median = a => {
    const v = days.filter(d => d !== today).map(d => val(a, d)).filter(x => x[1] > 0).map(x => x[0] / x[1]).sort((p, q) => p - q);
    return v.length ? v[Math.floor(v.length / 2)] : 0;
  };
  const meds = cols.map(median);
  days.forEach(d => {
    g.set(r, 1, d === today ? 'النهارده (لحد ' + slow.at.slice(11) + ')' : shopTabDayLabel_(d), { b: 'bold', bg: d === today ? S.TODAY_BG : S.LABEL });
    cols.forEach((a, i) => {
      const v = val(a, d), ratio = v[1] > 0 ? v[0] / v[1] : '', m = meds[i];
      const bg = ratio === '' || !(m > 0) ? null : ratio < m * S.CLICK_RED ? S.RED : ratio < m * S.CLICK_AMBER ? S.AMBER : null;
      g.set(r, 2 + 3 * i, v[0], { nf: S.COUNT, al: 'right' });
      g.set(r, 3 + 3 * i, v[1], { nf: S.COUNT, al: 'right' });
      g.set(r, 4 + 3 * i, ratio, { nf: '0%', al: 'center', b: 'bold', bg: bg });
    });
    r++;
  });
  if (slow.clickErr) r = shopTabText_(g, r, '⚠️ ' + slow.clickErr);
  return shopTabText_(g, r, 'لو النسبة وقعت يوم عن باقي أيام الأكاونت (أحمر: أقل من ' + Math.round(S.CLICK_RED * 100) + '% من يومه العادي، أصفر: أقل من ' +
    Math.round(S.CLICK_AMBER * 100) + '%)، يبقى الموقع تقيل أو لينك باظ، أو الكليكات نفسها بالغلط. الزيارات اللي من غير utm_term مش محسوبة، فالمهم التغيير مش الرقم.');
}

/* 4) Month by month and day by day. */
function shopTabDays_(g, r, fast, slow) {
  const S = SHOPTAB, today = fast.today, days = {};
  Object.keys(slow.days || {}).forEach(k => { const t = shopTabZero_(); S.KEYS.forEach((x, i) => { t[x] = slow.days[k][i] || 0; }); days[k] = t; });
  const t0 = shopTabCut_(fast.hours, today, 23, 1);
  S.KEYS.slice(9).forEach(k => { t0[k] = fast.kinds[k]; });
  days[today] = t0;
  const sum = (from, to) => Object.keys(days).filter(k => k >= from && k <= to).reduce((t, k) => shopTabAdd_(t, days[k]), shopTabZero_());
  const R = shopTabRatio_;
  /* [header, value(t), format] */
  const COLS = [['SESSIONS', t => t.sessions, S.COUNT], ['ADDED TO CART', t => t.atc, S.COUNT], ['REACHED CHECKOUT', t => t.checkout, S.COUNT],
    ['COMPLETED CHECKOUT', t => t.done, S.COUNT], ['ATC %', t => R(t.atc, t.sessions), S.PCT], ['CHECKOUT %', t => R(t.checkout, t.sessions), S.PCT],
    ['CONVERSION RATE', t => R(t.done, t.sessions), S.PCT], ['BOUNCE RATE', t => R(t.bounced, t.sessions), S.PCT], ['ORDERS', t => t.orders, S.COUNT],
    ['TOTAL SALES', t => t.total, S.MONEY], ['AOV', t => R(t.value, t.orders), S.MONEY], ['RETURNING SALES %', t => R(t.retSales, t.newSales + t.retSales), S.PCT]];
  r = shopTabBand_(g, r, 'أرقام شوبيفاي يوم بيوم' + (slow.at ? ' (الأيام اللي فاتت اتقرت ' + slow.at + '، والنهارده دلوقتي)' : ''), COLS.length + 1);
  r = shopTabHead_(g, r, ['DATE'].concat(COLS.map(c => c[0])));
  const line = (label, t, bg) => {
    g.set(r, 1, label, { b: 'bold', bg: bg || S.LABEL });
    COLS.forEach((c, i) => g.set(r, 2 + i, c[1](t), { nf: c[2], al: 'right', bg: bg || null }));
    r++;
  };
  const p = today.split('-').map(Number), months = [];
  for (let i = 0; i <= S.MONTHS; i++) months.push(new Date(Date.UTC(p[0], p[1] - 1 - i, 1)).toISOString().slice(0, 7));
  const end = ym => { const q = ym.split('-').map(Number); return new Date(Date.UTC(q[0], q[1], 0)).toISOString().slice(0, 10); };
  months.forEach((ym, i) => line(funnelMonthName_(ym) + (i ? '' : ' (لحد النهارده)'), sum(ym + '-01', i ? end(ym) : today), S.LABEL));
  const last = months[S.MONTHS], first = months[1];
  line('آخر ' + S.MONTHS + ' شهور (' + funnelMonthName_(last).slice(0, 3) + '–' + funnelMonthName_(first) + ')', sum(last + '-01', end(first)), S.AVG3_BG);
  for (let i = 0; i < S.DAYS; i++) {
    const d = shiftKey_(today, -i);
    line(i ? shopTabDayLabel_(d) : 'النهارده ' + shopTabDayLabel_(d), days[d] || shopTabZero_(), i ? null : S.TODAY_BG);
  }
  return shopTabText_(g, r, 'ATC % و CHECKOUT % من الزيارات، زي كارت Conversion rate breakdown في شوبيفاي. AOV = (المبيعات قبل المرتجعات − الخصم) ÷ الأوردرات. ' +
    'RETURNING SALES % = مبيعات العملاء الراجعين ÷ مبيعات الكل: كل ما يقل، البيزنس بيعتمد أكتر على الإعلانات الجديدة.');
}

/* 5) Orders by hour (rows) and weekday (columns, Saturday first), the last 4 full weeks. */
function shopTabHeat_(g, r, slow) {
  const S = SHOPTAB, heat = slow.heat || [], order = [6, 0, 1, 2, 3, 4, 5]; // JS weekdays, Saturday first
  const of = (js, h) => num_(((heat[(js + 6) % 7]) || [])[h]); // Shopify: 0 = Monday
  r = shopTabBand_(g, r, 'الأوردرات بالساعة ويوم الأسبوع (آخر ' + S.HEAT_DAYS / 7 + ' أسابيع كاملة)', 9);
  r = shopTabHead_(g, r, ['الساعة'].concat(order.map(d => S.DAY_NAMES[d]), ['الإجمالي']));
  let max = 0;
  order.forEach(d => { for (let h = 0; h < 24; h++) max = Math.max(max, of(d, h)); });
  const shade = v => { const i = max > 0 ? Math.min(S.HEAT.length - 1, Math.ceil(v / max * (S.HEAT.length - 1))) : 0; return { bg: S.HEAT[i], fc: i >= S.HEAT.length - 1 ? '#ffffff' : '#000000' }; };
  for (let h = 0; h < 24; h++) {
    g.set(r, 1, (h < 10 ? '0' : '') + h + ':00', { b: 'bold', bg: S.LABEL, al: 'center' });
    let tot = 0;
    order.forEach((d, i) => { const v = of(d, h); tot += v; g.set(r, 2 + i, v, Object.assign({ nf: S.COUNT, al: 'center' }, shade(v))); });
    g.set(r, 9, tot, { nf: S.COUNT, al: 'center', b: 'bold', bg: S.LABEL });
    r++;
  }
  g.set(r, 1, 'الإجمالي', { b: 'bold', bg: S.LABEL, al: 'center' });
  let all = 0;
  order.forEach((d, i) => { let t = 0; for (let h = 0; h < 24; h++) t += of(d, h); all += t; g.set(r, 2 + i, t, { nf: S.COUNT, al: 'center', b: 'bold', bg: S.LABEL }); });
  g.set(r, 9, all, { nf: S.COUNT, al: 'center', b: 'bold', bg: S.LABEL });
  return shopTabText_(g, r + 1, 'الأغمق = أوردرات أكتر. ينفع تستخدمه في وقت رفع الميزانية أو تشغيل إعلان جديد.');
}

/* 6) New vs returning customers: today, this month, last 30 days. */
function shopTabKinds_(g, r, fast, slow) {
  const S = SHOPTAB, today = fast.today, R = shopTabRatio_;
  const sum = (from, to) => {
    const t = shopTabZero_();
    Object.keys(slow.days || {}).forEach(k => { if (k >= from && k <= to && k !== today) S.KEYS.forEach((x, i) => { t[x] += slow.days[k][i] || 0; }); });
    return shopTabAdd_(t, fast.kinds);
  };
  r = shopTabBand_(g, r, 'العملاء الجداد والراجعين', 7);
  r = shopTabHead_(g, r, ['الفترة', 'أوردرات جداد', 'أوردرات راجعين', 'مبيعات الجداد', 'مبيعات الراجعين', 'نسبة مبيعات الراجعين', 'نسبة أوردرات الراجعين']);
  [['النهارده', fast.kinds], ['الشهر ده', sum(today.slice(0, 8) + '01', today)], ['آخر ' + S.DAYS + ' يوم', sum(shiftKey_(today, 1 - S.DAYS), today)]].forEach(x => {
    const t = x[1];
    g.set(r, 1, x[0], { b: 'bold', bg: S.LABEL });
    [[t.newOrders, S.COUNT], [t.retOrders, S.COUNT], [t.newSales, S.MONEY], [t.retSales, S.MONEY],
      [R(t.retSales, t.newSales + t.retSales), S.PCT], [R(t.retOrders, t.newOrders + t.retOrders), S.PCT]]
      .forEach((v, i) => g.set(r, 2 + i, v[0], { nf: v[1], al: 'right', b: i >= 4 ? 'bold' : 'normal' }));
    r++;
  });
  return r;
}

/* 7) A list with each row's share: [[label, value]]. */
function shopTabShares_(g, r, title, head, rows, total, fmt) {
  const S = SHOPTAB;
  r = shopTabBand_(g, r, title, 3);
  r = shopTabHead_(g, r, head.concat(['النسبة']));
  if (!rows.length) return shopTabText_(g, r, 'مفيش داتا لسه.');
  rows.forEach(x => {
    g.set(r, 1, x[0], { b: 'bold', bg: S.LABEL });
    g.set(r, 2, x[1], { nf: fmt || S.COUNT, al: 'right' });
    g.set(r, 3, shopTabRatio_(x[1], total), { nf: '0.0%', al: 'right' });
    r++;
  });
  return r;
}
function shopTabOthers_(g, r, slow) {
  const S = SHOPTAB, dev = slow.device || [], all = dev.reduce((n, x) => n + x[1], 0);
  const devName = n => (n === 'other' ? 'other (أغلبه أوردرات فورم الطلب، مش زيارات)' : n || 'مش معروف');
  r = shopTabShares_(g, r, 'الزيارات حسب الجهاز (آخر ' + S.DAYS + ' يوم)', ['الجهاز', 'الزيارات'],
    dev.slice().sort((a, b) => b[1] - a[1]).map(x => [devName(x[0]), x[1]]), all) + 1;
  const reg = (slow.region || []).filter(x => x[0]).slice(0, S.TOP);
  r = shopTabShares_(g, r, 'الزيارات حسب المحافظة (أكتر ' + S.TOP + '، آخر ' + S.DAYS + ' يوم)', ['المحافظة', 'الزيارات'], reg.map(x => [x[0], x[1]]), all) + 1;
  const ref = slow.ref || [], sales = ref.reduce((n, x) => n + x[3], 0);
  const refName = x => (x[0] || x[1] ? [x[0], x[1]].filter(Boolean).join(' · ') : 'مش معروف (أغلبه أوردرات فورم الطلب)');
  r = shopTabBand_(g, r, 'المبيعات حسب المصدر (Order referrer، آخر ' + S.DAYS + ' يوم)', 4);
  r = shopTabHead_(g, r, ['المصدر', 'الأوردرات', 'المبيعات', 'النسبة من المبيعات']);
  if (!ref.length) return shopTabText_(g, r, 'مفيش داتا لسه.');
  ref.slice(0, S.TOP).forEach(x => {
    g.set(r, 1, refName(x), { b: 'bold', bg: S.LABEL });
    g.set(r, 2, x[2], { nf: S.COUNT, al: 'right' });
    g.set(r, 3, x[3], { nf: S.MONEY, al: 'right' });
    g.set(r, 4, shopTabRatio_(x[3], sales), { nf: '0.0%', al: 'right' });
    r++;
  });
  return shopTabText_(g, r, 'أغلب أوردرات فورم الطلب شوبيفاي مابيعرفش مصدرها. المصدر الأدق من الـ UTM في تاب Today.');
}

/* EXT.views (inside the lock): draws the tab from what this run read. */
function writeShopTab_() {
  const fast = SHOPTAB_FAST_;
  if (!fast) return false;
  const S = SHOPTAB, slow = shopTabSlow_() || { days: {}, at: '', day: fast.today, accounts: [], clicks: {}, clickErr: 'لسه ماتقراش' };
  const sh = ensureTab_(S.TAB), g = todayGrid_();
  g.width = Math.max(S.WIDTH, 1 + 3 * ((slow.accounts || []).length + 1));
  g.set(1, 1, 'SHOPIFY — أرقام شوبيفاي نفسها (Analytics) | آخر تحديث ' + Utilities.formatDate(new Date(fast.atMs), tz_(), 'yyyy-MM-dd HH:mm'),
    { bg: S.DARK, fc: '#ffffff', b: 'bold', al: 'center' });
  g.fill(1, 2, g.width - 1, { bg: S.DARK });
  g.merge(1, 1, 1, g.width);
  g.set(2, 1, 'الأوردرات هنا كل أوردرات المتجر زي شوبيفاي (حتى الأكاونت اللي مش معانا)، و Total sales زي شوبيفاي (المرتجعات والإلغاء اللي اتسجلوا في اليوم بيتطرحوا منه). ' +
    'التحويل (Conversion rate) = اللي خلّصوا الطلب ÷ الزيارات. الأوردرات = الزيارات × التحويل، والمبيعات = الأوردرات × متوسط الأوردر: ' +
    'فالزيارات قدام الأوردرات بتقولك المشكلة في الإعلانات ولا الموقع، والأوردرات قدام المبيعات بتقولك حجم الأوردر اتغير ولا لأ. التغيير أقل من ' +
    Math.round(S.STEP * 100) + '% = زي ما هو.', { fc: S.SOFT });
  g.merge(2, 1, 1, g.width);
  let r = 4;
  r = shopTabCompare_(g, r, fast) + 1;
  r = shopTabStockless_(g, r, fast) + 1;
  r = shopTabClicks_(g, r, slow) + 1;
  r = shopTabDays_(g, r, fast, slow) + 1;
  r = shopTabHeat_(g, r, slow) + 1;
  r = shopTabKinds_(g, r, fast, slow) + 1;
  shopTabOthers_(g, r, slow);
  if (writeGrid_(sh, g)) {
    sh.setColumnWidth(1, 230);
    for (let c = 2; c <= g.width; c++) sh.setColumnWidth(c, 100);
    sh.getRange(2, 1).setWrap(true);
    sh.setRowHeight(2, 60);
  }
  return true;
}
