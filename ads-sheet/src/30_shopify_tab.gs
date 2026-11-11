/*
 * Tab "Shopify": a dashboard like Shopify's Analytics page, from Shopify's own numbers (ShopifyQL through the app in
 * 29_shopify_api.gs, read-only), with what the changes mean. From the top:
 *  1) Cards: today until now against yesterday and the same weekday last week until the same time (their hour of now
 *     counts by the minutes gone), and two lines per comparison that say what the change means: visits against
 *     conversion (and the step that fell), then the AOV. A change under SHOPTAB.STEP counts as no change.
 *  2) Charts, two a row: visits to product pages whose stock is 0 or less (stock as in المنتجات; the label says the Meta ads
 *     running on it now and today's spend from Daily Log), and clicks that don't reach the site (Shopify sessions from each
 *     Meta account's ads ÷ Meta's outbound clicks, day by day; the account from utm_term = the ad set ID: the ID in Ads Raw,
 *     else its last 4 digits). Then the last 30 days: sessions, total sales with orders, conversion rate, the steps to an
 *     order, bounce rate, the returning customers' share of sales; new vs returning, device, governorate, referrer, months.
 *  3) Orders by weekday and hour (the last 4 full weeks, an average day), colored like Shopify's "Weekly sales patterns".
 * The charts read the tab SHOPTAB.DATA (grey, not hidden: charts on a hidden tab came out empty), and are made again only
 * when what they read moves (SHOPTAB_CHARTS).
 * These are Shopify's numbers, not the sheet's: orders are every store order (the outside account's too), and total sales is
 * as Shopify shows it (returns and cancellations recorded that day come off). AOV = (gross sales − discounts) ÷ orders, the
 * value of the orders placed, so returns of older orders don't move it. The COD form places its orders in a session of its
 * own (device "other", no governorate, landing on the home page), so conversion is right for the store as a whole only.
 * Reads: the cards and the out-of-stock pages on every update; the rest every SHOPTAB.EVERY_MS and on the first update of a
 * day, kept in document properties. Drawn with the views (after Daily Log), only in a run that read Shopify.
 */
const SHOPTAB = {
  TAB: 'Shopify', DATA: 'Shopify Data', SLOW_KEY: 'SHOPTAB_SLOW', CHARTS_KEY: 'SHOPTAB_CHARTS', LAYOUT_KEY: 'SHOPTAB_LAYOUT', LAYOUT: 2,
  EVERY_MS: 3 * 3600000, PART: 8000, V: 1,
  MONTHS: 3, DAYS: 30, CLICK_DAYS: 14, HEAT_DAYS: 28, STEP: 0.05, MIN_SESSIONS: 300, MIN_ORDERS: 10, TOP: 10, MAX_STOCKLESS: 15,
  /* The page: COLS narrow columns (CW px each); a card is 8 columns, a chart half the page (W × H px, SLOT_ROWS rows). */
  COLS: 48, CW: 25, CARD: 8, SLOT_ROWS: 17, CHART_W: 590, CHART_H: 320,
  DARK: '#1f2937', LABEL: '#f3f4f6', SOFT: '#4b5563', UP: '#15803d', DOWN: '#b91c1c',
  HEAT: ['#ffffff', '#e8eefc', '#c7d6fa', '#9db7f5', '#6f93ee', '#3f6be3'],
  COLORS: ['#2563eb', '#16a34a', '#f59e0b', '#7c3aed', '#dc2626', '#0891b2'],
  COUNT: '#,##0', MONEY: '#,##0', PCT: '0.00%',
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

/* ---------- Drawing: a dashboard like Shopify's ---------- */

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

/* A number for a card's text: 1,234 or 2.35%. */
function shopTabShow_(v, pct) {
  if (typeof v !== 'number' || !isFinite(v)) return '—';
  return pct ? (Math.round(v * 10000) / 100).toFixed(2) + '%' : String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
/* Day → numbers: the slow part's days, today from this run's hours. */
function shopTabDaysMap_(fast, slow) {
  const S = SHOPTAB, days = {};
  Object.keys(slow.days || {}).forEach(k => { const t = shopTabZero_(); S.KEYS.forEach((x, i) => { t[x] = slow.days[k][i] || 0; }); days[k] = t; });
  const t0 = shopTabCut_(fast.hours, fast.today, 23, 1);
  S.KEYS.slice(9).forEach(k => { t0[k] = fast.kinds[k] || 0; });
  days[fast.today] = t0;
  return days;
}
/* Product pages with visits (today, last 7 days) whose stock is 0 or less: [{name, today, week, active, spendToday}]. */
function shopTabStockless_(fast) {
  const rx = new RegExp(cfgStr_('business.product_url_regex') || '/products?/([^/]+)', 'i');
  const prods = products_(), stock = stockByName_().by, raw = readStock_().byHandle, active = activeMap_(), by = {};
  const nameOf = h => { const p = prods.find(x => x.slugs.indexOf(h) >= 0); return p ? p.name : raw[h] && raw[h].title ? productNameOf_(raw[h].title) : ''; };
  const add = (pages, k) => Object.keys(pages || {}).forEach(path => {
    const m = path.toLowerCase().match(rx), n = m ? nameOf(m[1]) : '';
    if (!n || stock[n] === undefined || stock[n] > 0) return;
    (by[n] = by[n] || { name: n, today: 0, week: 0, active: active[n] || 0, spendToday: 0 })[k] += pages[path];
  });
  add(fast.pagesToday, 'today');
  add(fast.pagesWeek, 'week');
  if (Object.keys(by).length && ss_().getSheetByName(APP.T.DAILY)) dailyRows_().forEach(d => { if (by[d[2]] && d[0] === fast.today) by[d[2]].spendToday += num_(d[3]); });
  return Object.keys(by).map(n => by[n]).sort((p, q) => (q.active - p.active) || (q.spendToday - p.spendToday) || (q.today - p.today) || (q.week - p.week))
    .slice(0, SHOPTAB.MAX_STOCKLESS);
}

/* What the charts read: {name: {head, rows, fmt}}, in the order they sit in the data tab. */
function shopTabData_(fast, slow) {
  const S = SHOPTAB, R = shopTabRatio_, today = fast.today, days = shopTabDaysMap_(fast, slow), out = {};
  const sum = (from, to) => Object.keys(days).filter(k => k >= from && k <= to).reduce((t, k) => shopTabAdd_(t, days[k]), shopTabZero_());
  const label = d => (d === today ? 'النهارده' : Number(d.slice(8, 10)) + '/' + Number(d.slice(5, 7)));
  const rows = [];
  for (let i = S.DAYS - 1; i >= 0; i--) {
    const d = shiftKey_(today, -i), t = days[d] || shopTabZero_();
    rows.push([label(d), t.sessions, round2_(t.total), t.orders, R(t.done, t.sessions), R(t.bounced, t.sessions), R(t.retSales, t.newSales + t.retSales)]);
  }
  out.days = { head: ['اليوم', 'Sessions', 'Total sales', 'Orders', 'Conversion rate', 'Bounce rate', 'مبيعات العملاء الراجعين'], rows: rows,
    fmt: ['@', S.COUNT, S.MONEY, S.COUNT, S.PCT, '0.0%', '0.0%'] };
  const t0 = days[today] || shopTabZero_(), m = sum(shiftKey_(today, 1 - S.DAYS), today);
  out.steps = { head: ['', 'النهارده', 'آخر ' + S.DAYS + ' يوم'], fmt: ['@', S.PCT, S.PCT],
    rows: [['Added to cart', 'atc'], ['Reached checkout', 'checkout'], ['Completed checkout', 'done']].map(x => [x[0], R(t0[x[1]], t0.sessions), R(m[x[1]], m.sessions)]) };
  const money = v => shopTabShow_(v, false);
  out.stockless = { head: ['المنتج', 'زيارات النهارده', 'زيارات آخر 7 أيام'], fmt: ['@', S.COUNT, S.COUNT],
    rows: shopTabStockless_(fast).map(x => [x.name + (x.active ? ' — ' + x.active + ' إعلان شغال' : '') + (x.spendToday ? '، صرف النهارده ' + money(x.spendToday) : ''), x.today, x.week]) };
  const accs = slow.accounts || [], clicks = [];
  for (let i = S.CLICK_DAYS - 1; i >= 0; i--) {
    const d = shiftKey_(slow.day || today, -i), v = accs.map(a => (slow.clicks[a.id] || {})[d] || [0, 0]);
    const all = v.reduce((t, x) => [t[0] + x[0], t[1] + x[1]], [0, 0]);
    clicks.push([d === (slow.day || today) ? 'النهارده' : Number(d.slice(8, 10)) + '/' + Number(d.slice(5, 7))]
      .concat(v.map(x => R(x[0], x[1])), [R(all[0], all[1])]));
  }
  out.clicks = { head: ['اليوم'].concat(accs.map(a => a.name), ['الأكاونتات كلها']), rows: accs.length ? clicks : [],
    fmt: ['@'].concat(accs.map(() => '0%'), ['0%']) };
  out.kinds = { head: ['', 'المبيعات'], fmt: ['@', S.MONEY], rows: [['عملاء جداد', round2_(m.newSales)], ['عملاء راجعين', round2_(m.retSales)]] };
  const devName = n => (n === 'other' ? 'other (أوردرات الفورم)' : n || 'مش معروف');
  out.device = { head: ['الجهاز', 'Sessions'], fmt: ['@', S.COUNT], rows: (slow.device || []).slice().sort((a, b) => b[1] - a[1]).map(x => [devName(x[0]), x[1]]) };
  out.region = { head: ['المحافظة', 'Sessions'], fmt: ['@', S.COUNT], rows: (slow.region || []).filter(x => x[0]).slice(0, S.TOP).map(x => [x[0], x[1]]) };
  const refName = x => (x[0] || x[1] ? [x[0], x[1]].filter(Boolean).join(' · ') : 'مش معروف (أغلبه الفورم)');
  out.ref = { head: ['المصدر', 'Total sales'], fmt: ['@', S.MONEY], rows: (slow.ref || []).slice(0, S.TOP).map(x => [refName(x), round2_(x[3])]) };
  const p = today.split('-').map(Number), months = [];
  for (let i = S.MONTHS; i >= 0; i--) {
    const ym = new Date(Date.UTC(p[0], p[1] - 1 - i, 1)).toISOString().slice(0, 7), q = ym.split('-').map(Number);
    const t = sum(ym + '-01', i ? new Date(Date.UTC(q[0], q[1], 0)).toISOString().slice(0, 10) : today);
    months.push([funnelMonthName_(ym) + (i ? '' : ' (لحد النهارده)'), round2_(t.total), R(t.done, t.sessions)]);
  }
  out.months = { head: ['الشهر', 'Total sales', 'Conversion rate'], fmt: ['@', S.MONEY, S.PCT], rows: months };
  return out;
}

/* Writes the blocks side by side (a blank column between) in the hidden data tab; each block gets its column (b.col). */
function shopTabWriteData_(blocks) {
  const sh = ensureTab_(SHOPTAB.DATA), keys = Object.keys(blocks);
  let col = 1, H = 1;
  keys.forEach(k => { const b = blocks[k]; b.col = col; col += b.head.length + 1; H = Math.max(H, b.rows.length + 1); });
  const W = col - 1, v = [], f = [];
  for (let i = 0; i < H; i++) { v.push(new Array(W).fill('')); f.push(new Array(W).fill('@')); }
  keys.forEach(k => {
    const b = blocks[k];
    b.head.forEach((h, j) => { v[0][b.col - 1 + j] = h; });
    b.rows.forEach((row, i) => row.forEach((x, j) => { v[i + 1][b.col - 1 + j] = x === null || x === undefined ? '' : x; f[i + 1][b.col - 1 + j] = b.fmt[j] || 'General'; }));
  });
  if (sh.getMaxColumns() < W) sh.insertColumnsAfter(sh.getMaxColumns(), W - sh.getMaxColumns());
  if (sh.getMaxRows() < H) sh.insertRowsAfter(sh.getMaxRows(), H - sh.getMaxRows());
  const oldR = sh.getLastRow(), oldC = sh.getLastColumn();
  sh.getRange(1, 1, H, W).setNumberFormats(f).setValues(v);
  if (oldR > H) sh.getRange(H + 1, 1, oldR - H, Math.max(oldC, W)).clearContent();
  if (oldC > W) sh.getRange(1, W + 1, Math.max(oldR, H), oldC - W).clearContent();
  // Shown, not hidden: charts on a hidden data tab came out empty. Grey, at the end, with a note not to edit it.
  try { if (sh.isSheetHidden()) sh.showSheet(); sh.setTabColor('#9ca3af'); } catch (e) { /* مش مهم */ }
  return sh;
}

/* The charts, in their order on the page: {type, title, block, cols: [[first, count]], opts} or {text} for an empty one. */
function shopTabChartList_(blocks) {
  const S = SHOPTAB, b = blocks;
  const base = (type, title, block, cols, opts) => ({ type: type, block: block, cols: cols,
    opts: Object.assign({ title: title, width: S.CHART_W, height: S.CHART_H, fontName: 'Arial', colors: S.COLORS, legend: { position: 'bottom' },
      titleTextStyle: { fontSize: 13, bold: true, color: S.DARK } }, opts || {}) });
  // No chartArea: Sheets reads its pixel left/top as fractions of the chart and draws the plot outside the box (empty charts).
  const line = (title, block, cols, fmt, opts) => base('LINE', title, block, cols, Object.assign({ curveType: 'function', lineWidth: 2, pointSize: 0,
    vAxis: { format: fmt, minValue: 0 }, hAxis: { showTextEvery: block === 'days' ? 5 : 2 } }, opts || {}));
  const donut = (title, block) => base('PIE', title, block, [[0, 2]], { pieHole: 0.55, legend: { position: 'right' }, pieSliceText: 'percentage' });
  const bars = (title, block, opts) => base('BAR', title, block, [[0, b[block].head.length]], Object.assign({ legend: { position: 'none' },
    hAxis: { minValue: 0, format: '#,##0' } }, opts || {}));
  return [
    b.stockless.rows.length ? bars('زيارات على منتجات خلصانة (الستوك صفر)', 'stockless',
      { colors: ['#dc2626', '#fca5a5'], legend: { position: 'bottom' } }) : { text: '✅ مفيش زيارات النهارده ولا آخر 7 أيام على منتجات خلصانة' },
    b.clicks.rows.length ? line('الكليكات اللي بتوصل الموقع (Sessions ÷ Outbound clicks)', 'clicks',
      [[0, b.clicks.head.length]], '0%') : { text: 'مفيش أكاونتات Meta في تاب Accounts، أو الكليكات لسه ماتقرتش.' },
    line('Sessions over time — الزيارات', 'days', [[0, 2]], '#,##0', { legend: { position: 'none' } }),
    base('COMBO', 'Total sales و Orders — المبيعات والأوردرات', 'days', [[0, 1], [2, 2]], { seriesType: 'bars',
      series: { 1: { type: 'line', targetAxisIndex: 1, curveType: 'function', lineWidth: 2 } }, vAxes: { 0: { format: '#,##0' }, 1: { format: '#,##0' } },
      hAxis: { showTextEvery: 5 } }),
    line('Conversion rate over time — التحويل', 'days', [[0, 1], [4, 1]], '0.0%', { legend: { position: 'none' } }),
    base('COLUMN', 'Conversion rate breakdown — خطوات الشراء (% من الزيارات)', 'steps', [[0, 3]], { vAxis: { format: '0.0%', minValue: 0 } }),
    line('Bounce rate over time — خرجوا من أول صفحة', 'days', [[0, 1], [5, 1]], '0%', { legend: { position: 'none' }, colors: ['#f59e0b'] }),
    line('نسبة مبيعات العملاء الراجعين', 'days', [[0, 1], [6, 1]], '0%',
      { legend: { position: 'none' }, colors: ['#7c3aed'] }),
    donut('New vs returning customers — المبيعات آخر 30 يوم', 'kinds'),
    donut('Sessions by device type — آخر 30 يوم', 'device'),
    bars('Sessions by location — أكتر 10 محافظات، آخر 30 يوم', 'region'),
    bars('Total sales by referrer — آخر 30 يوم', 'ref', { colors: ['#16a34a'] }),
    base('COMBO', 'شهر بشهر: Total sales و Conversion rate', 'months', [[0, 3]], { seriesType: 'bars',
      series: { 1: { type: 'line', targetAxisIndex: 1, lineWidth: 2, pointSize: 6 } }, vAxes: { 0: { format: '#,##0' }, 1: { format: '0.0%' } } })
  ];
}

/* Charts are made again only when what they read or look like changed (the data under them updates by itself). */
function shopTabDrawCharts_(sh, data, specs) {
  const props = PropertiesService.getDocumentProperties(), sig = sha_(JSON.stringify(specs));
  if (props.getProperty(SHOPTAB.CHARTS_KEY) === sig && sh.getCharts().length === specs.length) return false;
  sh.getCharts().forEach(c => sh.removeChart(c));
  specs.forEach(s => {
    // SHOW_BOTH: a chart made from code skips hidden rows and columns by default, and then shows nothing.
    let b = sh.newChart().setChartType(Charts.ChartType[s.type]).setNumHeaders(1).setPosition(s.row, s.col, 4, 4)
      .setHiddenDimensionStrategy(Charts.ChartHiddenDimensionStrategy[s.hidden]);
    s.ranges.forEach(rg => { b = b.addRange(data.getRange(rg[0], rg[1], rg[2], rg[3])); });
    Object.keys(s.opts).forEach(k => { b = b.setOption(k, s.opts[k]); });
    sh.insertChart(b.build());
  });
  props.setProperty(SHOPTAB.CHARTS_KEY, sig);
  return true;
}

/* Once per page layout (SHOPTAB.LAYOUT): the old page and charts go, narrow columns, no grid lines. */
function shopTabLayout_(sh) {
  const S = SHOPTAB, props = PropertiesService.getDocumentProperties();
  if (props.getProperty(S.LAYOUT_KEY) === String(S.LAYOUT)) return;
  if (sh.getMaxColumns() < S.COLS) sh.insertColumnsAfter(sh.getMaxColumns(), S.COLS - sh.getMaxColumns());
  sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).breakApart().clear();
  sh.getCharts().forEach(c => sh.removeChart(c));
  ['GH_', 'GM_'].forEach(p => props.deleteProperty(p + sh.getName()));
  props.deleteProperty(S.CHARTS_KEY);
  sh.setColumnWidths(1, S.COLS, S.CW);
  try { sh.setHiddenGridlines(true); } catch (e) { /* مش مهم */ }
  props.setProperty(S.LAYOUT_KEY, String(S.LAYOUT));
}

/* 1) The cards and what the changes mean. Returns {r: the next free row, value: the cards' number row}. */
function shopTabCards_(g, r, fast) {
  const S = SHOPTAB, R = shopTabRatio_, now = new Date(fast.atMs), tz = tz_(), H = Number(Utilities.formatDate(now, tz, 'H'));
  const f = Number(Utilities.formatDate(now, tz, 'm')) / 60, today = fast.today, y = shiftKey_(today, -1), w = shiftKey_(today, -7);
  const a = shopTabCut_(fast.hours, today, H, 1), b = shopTabCut_(fast.hours, y, H, f), c = shopTabCut_(fast.hours, w, H, f);
  const wName = S.DAY_NAMES[shopTabWeekday_(w)] + ' اللي فات';
  g.set(r, 1, 'النهارده لحد ' + Utilities.formatDate(now, tz, 'HH:mm') + ' — قدام إمبارح و' + wName + ' (' + Number(w.slice(8, 10)) + '/' +
    Number(w.slice(5, 7)) + ') لحد نفس الساعة', { bg: S.DARK, fc: '#ffffff', b: 'bold', al: 'center' });
  g.fill(r, 2, S.COLS - 1, { bg: S.DARK });
  g.merge(r, 1, 1, S.COLS);
  r++;
  /* [title, value(t), percent?, up is good?] */
  [['Sessions', t => t.sessions, false, true], ['Total sales', t => t.total, false, true], ['Orders', t => t.orders, false, true],
    ['Conversion rate', t => R(t.done, t.sessions), true, true], ['AOV', t => R(t.value, t.orders), false, true],
    ['Bounce rate', t => R(t.bounced, t.sessions), true, false]].forEach((m, i) => {
    const col = 1 + i * S.CARD, va = m[1](a);
    g.set(r, col, m[0], { bg: S.LABEL, b: 'bold', al: 'center' });
    g.set(r + 1, col, va, { nf: m[2] ? S.PCT : S.COUNT, b: 'bold', al: 'center' });
    [[b, 'إمبارح'], [c, wName]].forEach((x, j) => {
      const vb = m[1](x[0]), chg = shopTabChange_(va, vb), big = chg !== '' && Math.abs(chg) > S.STEP;
      const pctText = chg === '' ? '' : '   ' + (chg > 0 ? '+' : chg < 0 ? '-' : '') + Math.round(Math.abs(chg) * 100) + '%';
      g.set(r + 2 + j, col, x[1] + ': ' + shopTabShow_(vb, m[2]) + pctText,
        { al: 'center', fc: !big ? S.SOFT : (chg > 0) === m[3] ? S.UP : S.DOWN, b: big ? 'bold' : 'normal' });
    });
    for (let k = 0; k < 4; k++) { if (k) g.fill(r + k, col + 1, S.CARD - 1, {}); g.merge(r + k, col, 1, S.CARD); }
    g.fill(r, col + 1, S.CARD - 1, { bg: S.LABEL });
  });
  const value = r + 1;
  r += 5;
  [['قدام إمبارح: ', b], ['قدام ' + wName + ': ', c]].forEach(x => {
    shopTabDiagnose_(a, x[1]).forEach((line, i) => {
      if (!line) return;
      g.set(r, 1, (i ? '' : x[0]) + line, { b: i ? 'normal' : 'bold', bg: S.LABEL });
      g.fill(r, 2, S.COLS - 1, { bg: S.LABEL });
      g.merge(r, 1, 1, S.COLS);
      r++;
    });
  });
  return { r: r + 1, value: value };
}

/* 3) Orders by weekday (rows, Saturday first) and hour (columns), an average day of the last 4 full weeks. */
function shopTabHeat_(g, r, slow) {
  const S = SHOPTAB, heat = slow.heat || [], weeks = S.HEAT_DAYS / 7, order = [6, 0, 1, 2, 3, 4, 5]; // JS weekdays, Saturday first
  const of = (js, h) => num_((heat[(js + 6) % 7] || [])[h]) / weeks; // Shopify: 0 = Monday
  g.set(r, 1, 'Weekly sales patterns — الأوردرات بالساعة ويوم الأسبوع (متوسط يوم في آخر ' + weeks + ' أسابيع، الأغمق = أوردرات أكتر)',
    { bg: S.DARK, fc: '#ffffff', b: 'bold', al: 'center' });
  g.fill(r, 2, S.COLS - 1, { bg: S.DARK });
  g.merge(r, 1, 1, S.COLS);
  r++;
  const first = r;
  g.set(r, 1, 'اليوم / الساعة', { b: 'bold', al: 'center', fc: S.SOFT });
  g.merge(r, 1, 1, 4);
  for (let h = 0; h < 24; h++) g.set(r, 5 + h, h, { al: 'center', fc: S.SOFT });
  g.set(r, 30, 'أوردرات اليوم', { b: 'bold', al: 'center', fc: S.SOFT });
  g.merge(r, 30, 1, 4);
  r++;
  let max = 0;
  order.forEach(d => { for (let h = 0; h < 24; h++) max = Math.max(max, of(d, h)); });
  order.forEach(d => {
    g.set(r, 1, S.DAY_NAMES[d], { b: 'bold', al: 'center' });
    g.merge(r, 1, 1, 4);
    let tot = 0;
    for (let h = 0; h < 24; h++) {
      const v = of(d, h), i = max > 0 ? Math.min(S.HEAT.length - 1, Math.ceil(v / max * (S.HEAT.length - 1))) : 0;
      tot += v;
      g.set(r, 5 + h, v ? Math.round(v * 10) / 10 : '', { nf: '0', al: 'center', bg: S.HEAT[i], fc: i >= S.HEAT.length - 2 ? '#ffffff' : S.SOFT });
    }
    g.set(r, 30, Math.round(tot), { nf: S.COUNT, al: 'center', b: 'bold' });
    g.merge(r, 30, 1, 4);
    r++;
  });
  return { r: r, first: first };
}

/* EXT.views (inside the lock): draws the page from what this run read. */
function writeShopTab_() {
  const fast = SHOPTAB_FAST_;
  if (!fast) return false;
  const S = SHOPTAB, slow = shopTabSlow_() || { days: {}, at: '', day: fast.today, accounts: [], clicks: {}, clickErr: 'لسه ماتقراش' };
  const sh = ensureTab_(S.TAB);
  shopTabLayout_(sh);
  const blocks = shopTabData_(fast, slow), data = shopTabWriteData_(blocks), g = todayGrid_();
  g.width = S.COLS;
  g.set(1, 1, 'SHOPIFY — أرقام شوبيفاي نفسها (Analytics) | آخر تحديث ' + Utilities.formatDate(new Date(fast.atMs), tz_(), 'yyyy-MM-dd HH:mm') +
    (slow.at ? ' | الرسوم اتقرت ' + slow.at.slice(11) : ''), { bg: S.DARK, fc: '#ffffff', b: 'bold', al: 'center' });
  g.fill(1, 2, S.COLS - 1, { bg: S.DARK });
  g.merge(1, 1, 1, S.COLS);
  g.set(2, 1, 'الأوردرات = الزيارات × التحويل، والمبيعات = الأوردرات × متوسط الأوردر. فالزيارات قدام الأوردرات بتقولك المشكلة في الإعلانات ولا الموقع، ' +
    'والأوردرات قدام المبيعات بتقولك حجم الأوردر اتغير ولا لأ. التغيير أقل من ' + Math.round(S.STEP * 100) + '% = زي ما هو. ' +
    'الأرقام زي شوبيفاي: كل أوردرات المتجر، و Total sales بعد المرتجعات اللي اتسجلت في اليوم. AOV = قيمة الأوردرات ÷ عددها، قبل المرتجعات. ' +
    'فورم الطلب بيعمل الأوردر في زيارة لوحدها، فالتحويل صح للمتجر كله بس.' + (slow.clickErr ? ' ⚠️ ' + slow.clickErr : ''), { fc: S.SOFT });
  g.merge(2, 1, 1, S.COLS);
  const cards = shopTabCards_(g, 4, fast), list = shopTabChartList_(blocks), specs = [];
  const top = cards.r;
  list.forEach((x, k) => {
    const row = top + Math.floor(k / 2) * S.SLOT_ROWS, col = k % 2 ? S.COLS / 2 + 1 : 1;
    if (x.text) {
      g.set(row + 1, col, x.text, { b: 'bold', al: 'center', bg: S.LABEL });
      g.fill(row + 1, col + 1, S.COLS / 2 - 2, { bg: S.LABEL });
      g.merge(row + 1, col, 1, S.COLS / 2 - 1);
      return;
    }
    const bl = blocks[x.block], n = bl.rows.length + 1;
    specs.push({ type: x.type, hidden: 'SHOW_BOTH', row: row, col: col, opts: x.opts, ranges: x.cols.map(cc => [1, bl.col + cc[0], n, cc[1]]) });
  });
  const heat = shopTabHeat_(g, top + Math.ceil(list.length / 2) * S.SLOT_ROWS, slow);
  g.set(heat.r + 1, 1, '');
  writeGrid_(sh, g);
  sh.getRange(cards.value, 1, 1, S.COLS).setFontSize(20);
  sh.setRowHeight(cards.value, 40);
  sh.getRange(heat.first, 5, 8, 24).setFontSize(8);
  sh.getRange(2, 1).setWrap(true);
  sh.setRowHeight(2, 48);
  shopTabDrawCharts_(sh, data, specs);
  return true;
}
