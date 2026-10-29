/*
 * Tab "Daily Account Funnel" (same as House of Beauty's): the whole business (all Meta accounts together) first, then
 * every account, each with its totals for this month so far, each of the 3 months before it and those 3 months together,
 * then its days for the last 30 days (newest first). SPEND and ORDERS are totals; the rates come from the summed numbers
 * (not an average of daily rates). A step rate over 100% (more purchases than checkouts: the COD form sends no checkout)
 * says the earlier event isn't tracked, so it gets no color.
 * SHOPIFY ORDERS = store orders from the account's ads (UTM → ad → account; the business row: every Meta order, like
 * META TOTAL in Today). CPP, AOV and ROAS come from them and their sales, against the spend of the days the orders sheet
 * covers (it starts 13 Oct 2026; before that they're blank). META ORDERS = Meta's pixel purchases, for the funnel rates.
 * Colors: each cell against the BENCHMARK row (row 4): green = as good or better, yellow = worse by up to B2 (20%),
 * red = worse by more. The benchmark is all accounts together over the last 3 months; a number typed in row 4 by hand stays,
 * and clearing it brings the average back. Read-only on Meta. Refreshed every 3 hours (not 3–9 AM Cairo) and from the menu.
 */
const FUNNEL = {
  TITLE: 'DAILY ACCOUNT FUNNEL', DAYS: 30, MONTHS: 3, EVERY_MS: 3 * 3600000, QUIET_FROM: 3, QUIET_TO: 9, YELLOW: 0.2,
  BENCH_ROW: 4, BENCH_KEY: 'FUNNEL_BENCH', AT_KEY: 'FUNNEL_AT',
  GREEN: '#d9ead3', AMBER: '#fff2cc', RED: '#f4cccc', BAND: '#1f2937', BENCH_BG: '#eaf0ff', AVG_BG: '#f3f4f6', AVG3_BG: '#e8eefc',
  /* [column, numerator, denominator, times, number format, lower is better?, no color?, a funnel step (at most 100%)?] */
  METRICS: [
    ['SHOPIFY ORDERS', 'shopOrders', 'one', 1, '0', false, true],
    ['CPP', 'shopSpend', 'shopOrders', 1, '#,##0.00', true],
    ['AOV', 'shopRevenue', 'shopOrders', 1, '#,##0.00', false, true],
    ['ROAS', 'shopRevenue', 'shopSpend', 1, '0.00"x"', false],
    ['META ORDERS', 'purchases', 'one', 1, '0', false, true],
    ['CPM', 'spend', 'impressions', 1000, '#,##0.00', true],
    ['CPC', 'spend', 'clicks', 1, '#,##0.00', true],
    ['CTR', 'clicks', 'impressions', 1, '0.00%', false],
    ['Out CTR', 'outboundClicks', 'impressions', 1, '0.00%', false],
    ['Hook', 'videoPlays3s', 'impressions', 1, '0.00%', false],
    ['Hold', 'thruPlays', 'videoPlays3s', 1, '0.00%', false, false, true],
    ['Out CPC', 'spend', 'outboundClicks', 1, '#,##0.00', true],
    ['Cost/CV', 'spend', 'contentViews', 1, '#,##0.00', true],
    ['CV/Out', 'contentViews', 'outboundClicks', 1, '0.00%', false, false, true],
    ['ATC/CV', 'addsToCart', 'contentViews', 1, '0.00%', false, false, true],
    ['Chk/ATC', 'checkouts', 'addsToCart', 1, '0.00%', false, false, true],
    ['Pur/Chk', 'purchases', 'checkouts', 1, '0.00%', false, false, true],
    ['CVR', 'purchases', 'linkClicks', 1, '0.00%', false]
  ],
  /* First type found counts, the same order as the rest of the sheet (pixel first). Purchases = meta.purchase_actions. */
  EVENTS: {
    contentViews: ['offsite_conversion.fb_pixel_view_content', 'view_content', 'omni_view_content'],
    addsToCart: ['offsite_conversion.fb_pixel_add_to_cart', 'add_to_cart', 'omni_add_to_cart'],
    checkouts: ['offsite_conversion.fb_pixel_initiate_checkout', 'initiate_checkout', 'omni_initiated_checkout']
  },
  FIELDS: 'spend,impressions,clicks,inline_link_clicks,outbound_clicks,actions,action_values,video_thruplay_watched_actions,date_start'
};

/* One insights row → raw counts. */
function funnelDayRaw_(r) {
  const first = (list, types) => { for (const t of types) { const a = (list || []).find(x => x.action_type === t); if (a) return num_(a.value); } return 0; };
  const out = { spend: num_(r.spend), impressions: num_(r.impressions), clicks: num_(r.clicks), linkClicks: num_(r.inline_link_clicks),
    outboundClicks: first(r.outbound_clicks, ['outbound_click']), videoPlays3s: first(r.actions, ['video_view']),
    thruPlays: first(r.video_thruplay_watched_actions, ['video_view']), purchases: metaPick_(r.actions),
    purchaseValue: metaPick_(r.action_values), one: 1 };
  Object.keys(FUNNEL.EVENTS).forEach(k => { out[k] = first(r.actions, FUNNEL.EVENTS[k]); });
  return out;
}
function funnelSum_(list) { return list.reduce((a, b) => { Object.keys(b).forEach(k => { a[k] = (a[k] || 0) + b[k]; }); return a; }, {}); }
function funnelValue_(raw, m) { return raw && raw[m[2]] > 0 ? raw[m[1]] / raw[m[2]] * m[3] : ''; }
function funnelColor_(v, bench, lower, yellow) {
  if (typeof v !== 'number' || typeof bench !== 'number' || !(bench > 0)) return null;
  const worse = lower ? v / bench - 1 : 1 - v / bench;
  return worse <= 0 ? FUNNEL.GREEN : worse <= yellow ? FUNNEL.AMBER : FUNNEL.RED;
}

/*
 * Meta reads (outside the lock), all accounts at once: day by day for the last 30 days, and month by month from the
 * first day of the month 3 months ago. Returns {accounts:[{id, name, days:[{date, raw}], months:{yyyy-MM: raw}, error}], months:[...]}.
 */
function fetchFunnel_() {
  const F = FUNNEL, today = todayKey_(), daysFrom = shiftKey_(today, 1 - F.DAYS);
  const p = today.split('-').map(Number), months = [];
  for (let i = 0; i <= F.MONTHS; i++) months.push(new Date(Date.UTC(p[0], p[1] - 1 - i, 1)).toISOString().slice(0, 7));
  const monthsFrom = months[F.MONTHS] + '-01', accs = accounts_('META');
  const reqs = [];
  accs.forEach(a => {
    const base = { level: 'account', fields: F.FIELDS, limit: 500 };
    reqs.push({ path: 'act_' + a.id + '/insights', params: Object.assign({ time_range: JSON.stringify({ since: daysFrom, until: today }), time_increment: 1 }, base) });
    reqs.push({ path: 'act_' + a.id + '/insights', params: Object.assign({ time_range: JSON.stringify({ since: monthsFrom, until: today }), time_increment: 'monthly' }, base) });
  });
  const res = metaMany_(reqs);
  return { months: months, accounts: accs.map((a, i) => {
    const d = res[2 * i], m = res[2 * i + 1], out = { id: a.id, name: a.name || a.id, days: [], months: {} };
    if (d.error || m.error) { out.error = d.error || m.error; return out; }
    out.days = (d.payload.data || []).map(r => ({ date: String(r.date_start), raw: funnelDayRaw_(r) })).filter(x => x.raw.spend > 0)
      .sort((x, y) => (x.date < y.date ? 1 : -1));
    (m.payload.data || []).forEach(r => { out.months[String(r.date_start).slice(0, 7)] = funnelDayRaw_(r); });
    return out;
  }).filter(a => a.error || a.days.length || Object.keys(a.months).length) };
}

function funnelMonthName_(ym) {
  const p = ym.split('-').map(Number);
  return Utilities.formatDate(new Date(Date.UTC(p[0], p[1] - 1, 15)), 'UTC', 'MMM-yyyy');
}

/*
 * Store orders per account and per day since `from`: {first (first day the orders sheet covers), acc: {id: {day: {orders,
 * revenue}}}, all: {day: ...}, spend: {id: {day: spend}}} (spend from Ads Raw, to match the covered days).
 */
function funnelShop_(from) {
  const out = { first: '', acc: {}, all: {}, spend: {} }, osh = ss_().getSheetByName(APP.T.ORDERS);
  if (!osh || osh.getLastRow() < 2) return out;
  out.first = asKey_(osh.getRange(osh.getLastRow(), 3).getValue()) || sortKey_(osh.getRange(osh.getLastRow(), 2).getValue()).slice(0, 10);
  const adAcc = {}, add = (map, d, rev) => { const x = map[d] = map[d] || { orders: 0, revenue: 0 }; x.orders++; x.revenue += rev; };
  recentRows_(APP.T.ADS, ADS_HEADERS.length, 1, asKey_, from).forEach(a => {
    if (a[1] !== 'META') return;
    const acc = String(a[2]), d = asKey_(a[0]), s = out.spend[acc] = out.spend[acc] || {};
    if (a[8]) adAcc[String(a[8])] = acc;
    s[d] = (s[d] || 0) + num_(a[10]);
  });
  const known = metaIdsOf_();
  recentRows_(APP.T.ORDERS, ORDERS_HEADERS.length, 2, sortKey_, from).forEach(o => {
    const d = asKey_(o[2]);
    if (!d || d < from || o[3] !== 'META' || outsideMeta_(o, known)) return;
    add(out.all, d, num_(o[7]));
    const acc = adAcc[String(o[14] || '')];
    if (acc) add(out.acc[acc] = out.acc[acc] || {}, d, num_(o[7]));
  });
  return out;
}
/* Adds shopOrders / shopRevenue / shopSpend to a raw for the days in [from..to] the orders sheet covers (none: left out). */
function funnelShopAdd_(raw, days, spendByDay, shop, from, to) {
  if (!shop.first || to < shop.first) return raw;
  raw.shopOrders = 0; raw.shopRevenue = 0; raw.shopSpend = 0;
  Object.keys(days || {}).forEach(d => { if (d >= from && d <= to && d >= shop.first) { raw.shopOrders += days[d].orders; raw.shopRevenue += days[d].revenue; } });
  Object.keys(spendByDay || {}).forEach(d => { if (d >= from && d <= to && d >= shop.first) raw.shopSpend += spendByDay[d]; });
  return raw;
}

/* Draws the tab (inside the lock) with the page painter: nothing is written when nothing changed. */
function writeFunnel_(data) {
  const F = FUNNEL, sh = ensureTab_(X.FUNNEL), g = todayGrid_(), W = 2 + F.METRICS.length, today = todayKey_();
  g.width = W;
  const props = PropertiesService.getDocumentProperties();
  // Yellow % (B2) and hand-typed benchmarks (row 4) stay as typed.
  let yellow = sh.getLastRow() >= 2 ? sh.getRange(2, 2).getValue() : '';
  if (typeof yellow !== 'number' || !(yellow >= 0 && yellow < 10)) yellow = F.YELLOW;
  // Row 4 by column name (columns may move); a number that isn't the last automatic one was typed by hand and stays.
  const prev = {}, W0 = Math.max(sh.getLastColumn(), 1);
  if (sh.getLastRow() >= F.BENCH_ROW) {
    const head = sh.getRange(3, 1, 1, W0).getValues()[0], vals = sh.getRange(F.BENCH_ROW, 1, 1, W0).getValues()[0];
    head.forEach((h, i) => { if (i >= 2 && h) prev[h] = vals[i]; });
  }
  let lastAuto = {};
  try { lastAuto = JSON.parse(props.getProperty(F.BENCH_KEY) || '{}'); } catch (e) { lastAuto = {}; }
  const old = Array.isArray(lastAuto); // before columns had names here: take the automatic numbers once
  const shop = funnelShop_(data.months[F.MONTHS] + '-01'), yest = shiftKey_(today, -1), past = data.months.slice(1);
  const pastFrom = past[past.length - 1] + '-01', pastTo = shiftKey_(data.months[0] + '-01', -1);
  const all = funnelSum_(data.accounts.map(a => funnelSum_(past.map(m => a.months[m] || {}))));
  // The store side of the benchmark: the last 3 months if the orders sheet covers them, else the days it covers up to yesterday.
  const shopFrom = shop.first && shop.first > pastFrom ? shop.first : pastFrom, shopTo = shop.first && shop.first > pastTo ? (shop.first > yest ? today : yest) : pastTo;
  const allSpend = {};
  Object.keys(shop.spend).forEach(acc => Object.keys(shop.spend[acc]).forEach(d => { allSpend[d] = (allSpend[d] || 0) + shop.spend[acc][d]; }));
  funnelShopAdd_(all, shop.all, allSpend, shop, shopFrom, shopTo);
  const auto = {}, bench = F.METRICS.map(m => {
    const v = funnelValue_(all, m), a = v === '' ? '' : Math.round(v * 10000) / 10000, p = prev[m[0]];
    auto[m[0]] = a;
    return !old && typeof p === 'number' && p > 0 && p !== lastAuto[m[0]] ? p : a;
  });
  props.setProperty(F.BENCH_KEY, JSON.stringify(auto));

  const range3 = funnelMonthName_(past[past.length - 1]).slice(0, 3) + '–' + funnelMonthName_(past[0]);
  g.set(1, 1, F.TITLE + ' — آخر ' + F.DAYS + ' يوم | آخر تحديث ' + nowText_(), { bg: F.BAND, fc: '#ffffff', b: 'bold', al: 'center' });
  g.fill(1, 2, W - 1, { bg: F.BAND });
  g.merge(1, 1, 1, W);
  g.set(2, 1, 'الأصفر لحد', { b: 'bold', al: 'center' });
  g.set(2, 2, yellow, { nf: '0%', bg: F.AMBER, b: 'bold', al: 'center' });
  const pct = Math.round(yellow * 100) + '%';
  g.set(2, 3, '🟢 أحسن من البنشمارك أو زيه   🟡 أسوأ لحد ' + pct + '   🔴 أسوأ بأكتر من ' + pct +
    ' — البنشمارك = كل الحسابات مع بعض في ' + range3 + (shopFrom !== pastFrom ? ' (CPP و ROAS من ' + shopFrom + ' لـ ' + shopTo + ': شيت الأوردرات بادئ ' + shop.first + ')' : '') +
    '. SHOPIFY ORDERS = أوردرات المتجر من إعلانات الحساب (UTM)، وعليها CPP و AOV و ROAS. META ORDERS = مشتريات البيكسل.' +
    ' صفوف الشهور: الصرف والأوردرات مجموع الشهر، والنسب من مجموع الأرقام.' +
    ' نسبة خطوة فوق 100% (زي Pur/Chk) رمادي من غير لون: الخطوة اللي قبلها مش بتتسجل كلها (فورم الكاش مابيبعتش Checkout).');
  g.merge(2, 3, 1, W - 2);
  ['DATE', 'SPEND'].concat(F.METRICS.map(m => m[0])).forEach((h, i) => g.set(3, 1 + i, h, { bg: '#fff200', b: 'bold', al: 'center' }));
  g.set(F.BENCH_ROW, 1, 'BENCHMARK', { bg: F.BENCH_BG, b: 'bold', al: 'center' });
  g.set(F.BENCH_ROW, 2, range3, { bg: F.BENCH_BG, b: 'bold', al: 'center' });
  F.METRICS.forEach((m, i) => g.set(F.BENCH_ROW, 3 + i, bench[i], { nf: m[4], bg: F.BENCH_BG, b: 'bold', al: 'center' }));

  let r = F.BENCH_ROW + 1;
  const line = (label, raw, style) => {
    g.set(r, 1, label, Object.assign({ al: 'center' }, style));
    g.set(r, 2, Math.round((raw.spend || 0) * 100) / 100, Object.assign({ nf: '#,##0.00', al: 'center' }, style));
    F.METRICS.forEach((m, i) => {
      const v = m[2] === 'one' ? (m[1] in raw ? raw[m[1]] : '') : funnelValue_(raw, m), odd = m[7] && typeof v === 'number' && v > 1;
      const color = m[6] || odd ? null : funnelColor_(v, bench[i], m[5], yellow);
      g.set(r, 3 + i, v, Object.assign({ nf: m[4], al: 'center' }, style, color ? { bg: color } : {}, odd ? { fc: '#9ca3af' } : {}));
    });
    r++;
  };
  // A section: name bar, totals of this month and the 3 before it, those 3 together, then the days.
  const section = (name, months, days, error, shopDays, spendDays) => {
    g.set(r, 1, name + (error ? '   ⚠️ ماقدرتش أقرا الحساب: ' + error : ''), { bg: F.BAND, fc: '#ffffff', b: 'bold' });
    g.fill(r, 2, W - 1, { bg: F.BAND });
    g.merge(r, 1, 1, W);
    r++;
    if (error) return;
    const monthEnd = ym => { const p = ym.split('-').map(Number); return new Date(Date.UTC(p[0], p[1], 0)).toISOString().slice(0, 10); };
    data.months.forEach((ym, i) => line(funnelMonthName_(ym) + (i ? '' : ' (لحد النهارده)'),
      funnelShopAdd_(Object.assign({}, months[ym] || {}), shopDays, spendDays, shop, ym + '-01', i ? monthEnd(ym) : today), { bg: F.AVG_BG, b: 'bold' }));
    line('آخر 3 شهور (' + range3 + ')', funnelShopAdd_(funnelSum_(past.map(ym => months[ym] || {})), shopDays, spendDays, shop, pastFrom, pastTo),
      { bg: F.AVG3_BG, b: 'bold' });
    days.forEach(d => {
      const p = d.date.split('-').map(Number), raw = Object.assign({}, d.raw);
      if (shop.first && d.date >= shop.first) { const s = (shopDays || {})[d.date] || { orders: 0, revenue: 0 }; raw.shopOrders = s.orders; raw.shopRevenue = s.revenue; raw.shopSpend = d.raw.spend; }
      line(Utilities.formatDate(new Date(Date.UTC(p[0], p[1] - 1, p[2], 12)), 'UTC', 'EEE dd-MMM'), raw, {});
    });
  };
  const ok = data.accounts.filter(a => !a.error), allMonths = {}, allDays = {};
  data.months.forEach(ym => { allMonths[ym] = funnelSum_(ok.map(a => a.months[ym] || {})); });
  ok.forEach(a => a.days.forEach(d => { allDays[d.date] = funnelSum_([allDays[d.date] || {}, d.raw]); }));
  if (ok.length > 1) section('كل الحسابات (البيزنس كله)', allMonths,
    Object.keys(allDays).sort().reverse().map(d => ({ date: d, raw: allDays[d] })), '', shop.all, allSpend);
  data.accounts.forEach(a => section(a.name, a.months, a.days, a.error, shop.acc[a.id] || {}, shop.spend[a.id] || {}));
  if (!data.accounts.length) g.set(r, 1, 'مفيش حساب Meta صرف في الفترة دي', { fc: '#6b7280' });
  if (!writeGrid_(sh, g)) return;
  sh.setFrozenRows(F.BENCH_ROW);
  sh.setColumnWidth(1, 190); sh.setColumnWidth(2, 95);
  for (let c = 3; c <= W; c++) sh.setColumnWidth(c, c === 3 || c === 7 ? 90 : 78);
  sh.getRange(2, 3, 1, W - 2).setWrap(true);
  sh.getRange(3, 1, 1, W).setWrap(true);
}

/* Every 3 hours from the 15-minute update (not 3–9 AM Cairo). Reads outside the lock, writes inside it. */
function refreshFunnel_(force) {
  const props = PropertiesService.getDocumentProperties(), at = Number(props.getProperty(FUNNEL.AT_KEY) || 0);
  const hour = Number(Utilities.formatDate(new Date(), tz_(), 'H'));
  if (!force && (Date.now() - at < FUNNEL.EVERY_MS || (hour >= FUNNEL.QUIET_FROM && hour < FUNNEL.QUIET_TO))) return false;
  if (!accounts_('META').length) return false;
  const data = time_('Account Funnel — Meta', () => fetchFunnel_());
  withLock_(() => writeFunnel_(data));
  props.setProperty(FUNNEL.AT_KEY, String(Date.now()));
  const failed = data.accounts.filter(a => a.error).map(a => a.name);
  setStatus_('FUNNEL', (failed.length ? '⚠️ ماقدرتش أقرا: ' + failed.join('، ') : '✓') + ' — ' + data.accounts.length + ' حساب');
  return true;
}
function refreshFunnelNow() {
  try {
    resetCaches_();
    refreshFunnel_(true);
    alert_('اتحدث تاب ' + X.FUNNEL + ' ✅\n' + getStatus_('FUNNEL'));
    ss_().setActiveSheet(tab_(X.FUNNEL));
  } catch (e) { alert_('تاب ' + X.FUNNEL + ' ماتحدثش:\n' + errText_(e)); }
}
