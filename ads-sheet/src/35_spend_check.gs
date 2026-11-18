/*
 * Spend check: every Meta account's spend in the sheet (Ads Raw: what Daily Log, Closing, its archives and Actual ROAS
 * are built from) against Meta's own account totals (the funnel's read, every 3 hours): each ended month the sheet has
 * spend for from its first day, and each of the last 30 days before yesterday. Where they differ (an account added after
 * it had spent, a day an update missed), those days are pulled again for that account in the background
 * (startBackfill_), at most SPEND_CHECK.TRIES times; what still differs after that is written in Health.
 */
const SPEND_CHECK = { KEY: 'SPEND_CHECK_TRIED', TRIES: 2, DAY_MIN: 200, DAY_PCT: 0.03, MONTH_MIN: 1000, MONTH_PCT: 0.01 };

/* The first day the sheet has spend for (the oldest day in Ads Raw), or '' when it has none. */
function spendFrom_() {
  let first = '';
  rawRows_(APP.T.ADS, ADS_HEADERS.length).forEach(a => { const d = asKey_(a[0]); if (d && (!first || d < first)) first = d; });
  return first;
}

/* After the funnel's Meta read (fetchFunnel_). Returns the [account, from, to] pieces it asked to pull again. */
function checkSpend_(data) {
  const C = SPEND_CHECK, props = PropertiesService.getDocumentProperties();
  if (props.getProperty('BACKFILL')) return []; // pulling now: checked on the next read
  const from = spendFrom_(), today = todayKey_(), yest = shiftKey_(today, -1);
  if (!from) return [];
  const sheet = {};
  rawRows_(APP.T.ADS, ADS_HEADERS.length).forEach(a => {
    if (a[1] !== 'META') return;
    const acc = String(a[2]), d = asKey_(a[0]), m = sheet[acc] = sheet[acc] || {};
    m[d] = (m[d] || 0) + num_(a[10]);
  });
  let tried = {};
  try { tried = JSON.parse(props.getProperty(C.KEY) || '{}'); } catch (e) { tried = {}; }
  const off = (meta, have, min, pct) => Math.abs(meta - have) > Math.max(min, pct * Math.abs(meta));
  const fmt = n => Math.round(n).toLocaleString('en-US'), pull = [], left = [], now = {};
  data.accounts.filter(a => !a.error).forEach(a => {
    const mine = sheet[a.id] || {}, sum = (x, y) => Object.keys(mine).reduce((s, d) => s + (d >= x && d <= y ? mine[d] : 0), 0), gaps = [];
    data.months.forEach(ym => {
      const s = ym + '-01', e = closingKey_(ym, closingDays_(ym));
      if (s < from || e >= today) return;
      const meta = num_((a.months[ym] || {}).spend), have = sum(s, e);
      if (off(meta, have, C.MONTH_MIN, C.MONTH_PCT)) gaps.push([s, e, meta, have, closingMonthName_(ym)]);
    });
    a.days.forEach(d => {
      if (d.date < from || d.date >= yest || gaps.some(g => d.date >= g[0] && d.date <= g[1])) return;
      const meta = num_(d.raw.spend), have = mine[d.date] || 0;
      if (off(meta, have, C.DAY_MIN, C.DAY_PCT)) gaps.push([d.date, d.date, meta, have, d.date]);
    });
    gaps.forEach(g => {
      const k = a.id + '|' + g[0] + '|' + g[1], n = num_(tried[k]), text = a.name + ' ' + g[4] + ': Meta ' + fmt(g[2]) + ' والشيت ' + fmt(g[3]);
      now[k] = true;
      if (n < C.TRIES) { tried[k] = n + 1; pull.push([a.id, g[0], g[1]]); left.push('⏳ ' + text); } else left.push('⚠️ ' + text);
    });
  });
  // A piece that matches now can be tried again if it ever differs later; old ones are forgotten.
  Object.keys(tried).forEach(k => { if (!now[k] || k.split('|')[2] < shiftKey_(today, -120)) delete tried[k]; });
  props.setProperty(C.KEY, JSON.stringify(tried));
  pull.forEach(p => startBackfill_(p[1], p[2], [p[0]]));
  setStatus_('SPEND_CHECK', left.length
    ? (pull.length ? 'بيتسحب تاني في الخلفية: ' : '') + left.join(' | ')
    : '✓ صرف كل حساب في الشيت = صرف Meta (من ' + from + ')');
  return pull;
}
