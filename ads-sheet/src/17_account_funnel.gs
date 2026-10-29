/*
 * Tab "Daily Account Funnel" (same as House of Beauty's): every Meta account's funnel, day by day for the last 30 days
 * (newest first). Under each account's name, before its days: the average of this month so far, of each of the 3 months
 * before it, and of those 3 months together. Averages come from the summed numbers (not an average of daily ratios);
 * SPEND and ORDERS on an average row are per day.
 * Colors: each cell against the BENCHMARK row (row 4): green = as good or better, yellow = worse by up to B2 (20%),
 * red = worse by more. The benchmark is all accounts together over the last 3 months; a number typed in row 4 by hand stays,
 * and clearing it brings the average back. Read-only on Meta. Refreshed every 3 hours (not 3–9 AM Cairo) and from the menu.
 */
const FUNNEL = {
  TITLE: 'DAILY ACCOUNT FUNNEL', DAYS: 30, MONTHS: 3, EVERY_MS: 3 * 3600000, QUIET_FROM: 3, QUIET_TO: 9, YELLOW: 0.2,
  BENCH_ROW: 4, BENCH_KEY: 'FUNNEL_BENCH', AT_KEY: 'FUNNEL_AT',
  GREEN: '#d9ead3', AMBER: '#fff2cc', RED: '#f4cccc', BAND: '#1f2937', BENCH_BG: '#eaf0ff', AVG_BG: '#f3f4f6', AVG3_BG: '#e8eefc',
  /* [column, numerator, denominator, times, number format, lower is better?, no color?] — 'one' = 1 per day. */
  METRICS: [
    ['ORDERS', 'purchases', 'one', 1, '0', false, true],
    ['CPP', 'spend', 'purchases', 1, '#,##0.00', true],
    ['AOV', 'purchaseValue', 'purchases', 1, '#,##0.00', false, true],
    ['ROAS', 'purchaseValue', 'spend', 1, '0.00"x"', false],
    ['CPM', 'spend', 'impressions', 1000, '#,##0.00', true],
    ['CPC', 'spend', 'clicks', 1, '#,##0.00', true],
    ['CTR', 'clicks', 'impressions', 1, '0.00%', false],
    ['Out CTR', 'outboundClicks', 'impressions', 1, '0.00%', false],
    ['Hook', 'videoPlays3s', 'impressions', 1, '0.00%', false],
    ['Hold', 'thruPlays', 'videoPlays3s', 1, '0.00%', false],
    ['Out CPC', 'spend', 'outboundClicks', 1, '#,##0.00', true],
    ['Cost/CV', 'spend', 'contentViews', 1, '#,##0.00', true],
    ['CV/Out', 'contentViews', 'outboundClicks', 1, '0.00%', false],
    ['ATC/CV', 'addsToCart', 'contentViews', 1, '0.00%', false],
    ['Chk/ATC', 'checkouts', 'addsToCart', 1, '0.00%', false],
    ['Pur/Chk', 'purchases', 'checkouts', 1, '0.00%', false],
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

/* Days in a month that count for its average: the whole month, or up to today for this month. */
function funnelMonthDays_(ym, today) {
  const p = ym.split('-').map(Number), all = new Date(Date.UTC(p[0], p[1], 0)).getUTCDate();
  return today.slice(0, 7) === ym ? Number(today.slice(8, 10)) : all;
}
function funnelMonthName_(ym) {
  const p = ym.split('-').map(Number);
  return Utilities.formatDate(new Date(Date.UTC(p[0], p[1] - 1, 15)), 'UTC', 'MMM-yyyy');
}

/* Draws the tab (inside the lock) with the page painter: nothing is written when nothing changed. */
function writeFunnel_(data) {
  const F = FUNNEL, sh = ensureTab_(X.FUNNEL), g = todayGrid_(), W = 2 + F.METRICS.length, today = todayKey_();
  g.width = W;
  const props = PropertiesService.getDocumentProperties();
  // Yellow % (B2) and hand-typed benchmarks (row 4) stay as typed.
  let yellow = sh.getLastRow() >= 2 ? sh.getRange(2, 2).getValue() : '';
  if (typeof yellow !== 'number' || !(yellow >= 0 && yellow < 10)) yellow = F.YELLOW;
  const prev = sh.getLastRow() >= F.BENCH_ROW ? sh.getRange(F.BENCH_ROW, 3, 1, F.METRICS.length).getValues()[0] : [];
  let lastAuto = [];
  try { lastAuto = JSON.parse(props.getProperty(F.BENCH_KEY) || '[]'); } catch (e) { lastAuto = []; }
  const past = data.months.slice(1), all = funnelSum_(data.accounts.map(a => funnelSum_(past.map(m => a.months[m] || {}))));
  const auto = F.METRICS.map(m => { const v = funnelValue_(all, m); return v === '' ? '' : Math.round(v * 10000) / 10000; });
  const bench = F.METRICS.map((m, i) => (typeof prev[i] === 'number' && prev[i] > 0 && prev[i] !== lastAuto[i] ? prev[i] : auto[i]));
  props.setProperty(F.BENCH_KEY, JSON.stringify(auto));

  const range3 = funnelMonthName_(past[past.length - 1]).slice(0, 3) + '–' + funnelMonthName_(past[0]);
  g.set(1, 1, F.TITLE + ' — آخر ' + F.DAYS + ' يوم | آخر تحديث ' + nowText_(), { bg: F.BAND, fc: '#ffffff', b: 'bold', al: 'center' });
  g.fill(1, 2, W - 1, { bg: F.BAND });
  g.merge(1, 1, 1, W);
  g.set(2, 1, 'الأصفر لحد', { b: 'bold', al: 'center' });
  g.set(2, 2, yellow, { nf: '0%', bg: F.AMBER, b: 'bold', al: 'center' });
  const pct = Math.round(yellow * 100) + '%';
  g.set(2, 3, '🟢 أحسن من البنشمارك أو زيه   🟡 أسوأ لحد ' + pct + '   🔴 أسوأ بأكتر من ' + pct +
    ' — البنشمارك = كل الحسابات مع بعض في ' + range3 + '. صفوف المتوسط: الصرف والأوردرات في اليوم، والباقي من مجموع الأرقام.');
  g.merge(2, 3, 1, W - 2);
  ['DATE', 'SPEND'].concat(F.METRICS.map(m => m[0])).forEach((h, i) => g.set(3, 1 + i, h, { bg: '#fff200', b: 'bold', al: 'center' }));
  g.set(F.BENCH_ROW, 1, 'BENCHMARK', { bg: F.BENCH_BG, b: 'bold', al: 'center' });
  g.set(F.BENCH_ROW, 2, range3, { bg: F.BENCH_BG, b: 'bold', al: 'center' });
  F.METRICS.forEach((m, i) => g.set(F.BENCH_ROW, 3 + i, bench[i], { nf: m[4], bg: F.BENCH_BG, b: 'bold', al: 'center' }));

  let r = F.BENCH_ROW + 1;
  const line = (label, spend, raw, style, perDay) => {
    g.set(r, 1, label, Object.assign({ al: 'center' }, style));
    g.set(r, 2, Math.round(spend * 100) / 100, Object.assign({ nf: '#,##0.00', al: 'center' }, style));
    F.METRICS.forEach((m, i) => {
      let v = funnelValue_(raw, m);
      if (m[2] === 'one' && perDay) v = raw.one > 0 ? Math.round(raw[m[1]] / raw.one * 10) / 10 : '';
      const color = m[6] ? null : funnelColor_(v, bench[i], m[5], yellow);
      g.set(r, 3 + i, v, Object.assign({ nf: m[2] === 'one' && perDay ? '0.0' : m[4], al: 'center' }, style, color ? { bg: color } : {}));
    });
    r++;
  };
  data.accounts.forEach(a => {
    g.set(r, 1, a.name + (a.error ? '   ⚠️ ماقدرتش أقرا الحساب: ' + a.error : ''), { bg: F.BAND, fc: '#ffffff', b: 'bold' });
    g.fill(r, 2, W - 1, { bg: F.BAND });
    g.merge(r, 1, 1, W);
    r++;
    if (a.error) return;
    // Averages: this month so far, each of the 3 months before, and those 3 together. Per day = month total ÷ its days.
    data.months.forEach((ym, i) => {
      const raw = Object.assign({}, a.months[ym] || {}), n = funnelMonthDays_(ym, today);
      raw.one = n;
      line((i ? 'متوسط ' : 'متوسط الشهر ده ') + funnelMonthName_(ym), (raw.spend || 0) / n, raw, { bg: F.AVG_BG, b: 'bold' }, true);
    });
    const three = funnelSum_(past.map(ym => a.months[ym] || {}));
    three.one = past.reduce((s, ym) => s + funnelMonthDays_(ym, today), 0);
    line('متوسط آخر 3 شهور', (three.spend || 0) / three.one, three, { bg: F.AVG3_BG, b: 'bold' }, true);
    a.days.forEach(d => {
      const p = d.date.split('-').map(Number);
      line(Utilities.formatDate(new Date(Date.UTC(p[0], p[1] - 1, p[2], 12)), 'UTC', 'EEE dd-MMM'), d.raw.spend, d.raw, {}, false);
    });
  });
  if (!data.accounts.length) g.set(r, 1, 'مفيش حساب Meta صرف في الفترة دي', { fc: '#6b7280' });
  if (!writeGrid_(sh, g)) return;
  sh.setFrozenRows(F.BENCH_ROW);
  sh.setColumnWidth(1, 190); sh.setColumnWidth(2, 95);
  for (let c = 3; c <= W; c++) sh.setColumnWidth(c, 78);
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
