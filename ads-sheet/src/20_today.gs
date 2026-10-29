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
 * One line per product of the ads: the campaigns that spent on it, store orders (UTM), Meta's pixel purchases, spend,
 * CPP, ROAS, and how many of its ads are running now. Which products those orders bought, campaign by campaign,
 * is in the الكتالوج tab.
 */
function todayProducts_(g, r, title, from, to, rows) {
  const S = TODAY, c = S.RIGHT_COL, meta = {}, active = activeMap_(), special = [APP.CATALOG, APP.MULTI, APP.UNMAPPED, APP.META_NO_AD, APP.UNKNOWN_PRODUCT];
  rows.forEach(x => {
    if (x[0] < from || x[0] > to || x[1] !== 'META') return;
    const t = meta[x[2]] = meta[x[2]] || { spend: 0, orders: 0, revenue: 0, pixel: 0 };
    t.spend += num_(x[3]); t.orders += num_(x[8]); t.revenue += num_(x[10]); t.pixel += num_(x[7]);
  });
  // Campaigns per product (same product as the Daily Log: catalog ads → CATALOG, else Ad Map), most spend first.
  const idx = adMapIndex_(), catAds = catalogAdIds_(), camps = {};
  recentRows_(APP.T.ADS, ADS_HEADERS.length, 1, asKey_, from).forEach(a => {
    const d = asKey_(a[0]);
    if (a[1] !== 'META' || d < from || d > to || num_(a[10]) <= 0) return;
    const m = idx.get(adKey_('META', String(a[8] || ''), a[5], a[7], a[9])), p = catAds.has('META|' + String(a[8])) ? APP.CATALOG : m ? m.product : APP.UNMAPPED;
    const x = camps[p] = camps[p] || {};
    x[a[5]] = (x[a[5]] || 0) + num_(a[10]);
  });
  const campOf = p => {
    const x = camps[p] || {}, n = Object.keys(x).sort((a, b) => x[b] - x[a]);
    return n.length > 2 ? n[0] + ' + ' + (n.length - 1) + ' كامبين' : n.join(' / ');
  };
  r = todayHead_(g, r, c, 8, title, ['CAMPAIGN', 'PRODUCT', 'META ORDERS', 'PIXEL PURCHASES', 'META SPEND', 'META CPP', 'META ROAS', 'ADS RUNNING NOW']);
  const names = Object.keys(meta).filter(n => special.indexOf(n) < 0 && (meta[n].spend > 0 || meta[n].orders > 0))
    .sort((a, b) => (meta[b].spend - meta[a].spend) || (meta[b].orders - meta[a].orders));
  const tot = { spend: 0, orders: 0, revenue: 0, pixel: 0, ads: 0 };
  const put = (name, t, ads, style, camp) => {
    const num = (col, v, nf) => g.set(r, col, v, Object.assign({ nf: nf, al: 'right' }, style));
    g.set(r, c, camp, style);
    g.set(r, c + 1, name, style);
    num(c + 2, t.orders, S.COUNT); num(c + 3, t.pixel, S.COUNT); num(c + 4, Math.round(t.spend * 100) / 100, S.MONEY);
    num(c + 5, ratioOrBlank_(t.spend, t.orders, 2), S.MONEY); num(c + 6, ratioOrBlank_(t.revenue, t.spend, 2), S.RATIO);
    g.set(r, c + 7, ads || '', Object.assign({ nf: S.COUNT, al: 'center' }, style, { fc: '#137333' }));
    r++;
  };
  // CATALOG first (all catalog / Advantage+ ads together), then products, then the rest.
  const add = (n, style) => {
    const t = meta[n];
    if (!t || (t.spend <= 0 && t.orders <= 0)) return;
    put(n, t, active[n] || 0, style, campOf(n));
    ['spend', 'orders', 'revenue', 'pixel'].forEach(k => { tot[k] += t[k]; });
    tot.ads += active[n] || 0;
  };
  add(APP.CATALOG, { bg: S.CATALOG, b: 'bold' });
  names.forEach(n => add(n, {}));
  special.filter(n => n !== APP.CATALOG).forEach(n => add(n, { bg: S.SPECIAL }));
  if (!names.length && !special.some(n => meta[n])) { g.set(r, c, 'مفيش صرف Meta في الفترة دي', { fc: '#6b7280' }); r++; }
  put('', tot, tot.ads, { bg: S.TOTAL, b: 'bold' }, 'TOTAL META');
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
  [[1, 150], [2, 210], [3, 120], [4, 130], [5, 130], [6, 130], [7, 24], [8, 300], [9, 260]].forEach(w => sh.setColumnWidth(w[0], w[1]));
  for (let col = 10; col <= TODAY.WIDTH; col++) sh.setColumnWidth(col, 125);
  sh.getRange(8, 1, 1, 6).setWrap(true);
}
