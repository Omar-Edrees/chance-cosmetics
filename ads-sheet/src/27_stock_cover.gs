/*
 * Today, left side under the account balances: how many days each product's stock lasts. Every product with its own
 * Meta ads running now (not catalog ads), plus any product without ads that sells and has COVER.RED days or less
 * but isn't out of stock yet (one already sold out with no ads is left out).
 * Per day = pieces sold in the last COVER.DAYS full days (every store order but cancelled or returned ones) ÷ COVER.DAYS.
 * Red = COVER.RED days or less (order more stock), yellow = up to COVER.YELLOW, green above.
 */
const COVER = { DAYS: 5, RED: 10, YELLOW: 15 };

function todayStockCover_(g, r, today) {
  const S = TODAY, active = activeMap_(), stock = stockByName_().by, sold = {};
  const special = [APP.CATALOG, APP.MULTI, APP.UNMAPPED, APP.UNKNOWN_PRODUCT, APP.META_NO_AD, ''];
  const from = shiftKey_(today, -COVER.DAYS), to = shiftKey_(today, -1);
  if (ss_().getSheetByName(APP.T.ORDERS)) recentRows_(APP.T.ORDERS, ORDERS_HEADERS.length, 2, sortKey_, from).forEach(o => {
    const d = asKey_(o[2]), s = orderStatus_(o[0]);
    if (!d || d < from || d > to || (s && (s.code === 'C' || s.code === 'R')) || o[15] === true || String(o[15]).toUpperCase() === 'TRUE') return;
    lineItems_(o[6]).forEach(li => { const n = productNameOf_(li.title); sold[n] = (sold[n] || 0) + li.qty; });
  });
  // Days left: 0 = out of stock, Infinity = nothing sold, null = no stock found.
  const perDay = n => (sold[n] || 0) / COVER.DAYS;
  const days = n => (stock[n] === undefined ? null : stock[n] <= 0 ? 0 : perDay(n) > 0 ? stock[n] / perDay(n) : Infinity);
  const names = Object.keys(Object.assign({}, active, sold)).filter(n => special.indexOf(n) < 0 &&
    ((active[n] || 0) > 0 || ((sold[n] || 0) > 0 && days(n) !== null && days(n) > 0 && days(n) <= COVER.RED)));
  const rank = n => (days(n) === null ? 2e9 : days(n) === Infinity ? 1e9 : days(n));
  names.sort((a, b) => (rank(a) - rank(b)) || ((active[b] || 0) - (active[a] || 0)) || (a < b ? -1 : 1));

  g.set(r, 1, 'الستوك يكفي كام يوم (بمتوسط آخر ' + COVER.DAYS + ' أيام) — 🔴 ' + COVER.RED + ' أيام أو أقل: اطلب ستوك   🟡 لحد ' +
    COVER.YELLOW + '   🟢 أكتر', { bg: S.DARK, fc: '#ffffff', b: 'bold', al: 'center' });
  g.fill(r, 2, 5, { bg: S.DARK });
  g.merge(r, 1, 1, 6);
  r++;
  ['المنتج', '', 'إعلانات شغالة', 'الستوك', 'بيتباع في اليوم', 'يكفي كام يوم'].forEach((h, i) => g.set(r, 1 + i, h, { bg: S.YELLOW, b: 'bold', al: 'center' }));
  g.merge(r, 1, 1, 2);
  r++;
  if (!names.length) { g.set(r, 1, 'مفيش منتجات عليها إعلانات شغالة', { fc: '#6b7280' }); return r + 1; }
  names.forEach(n => {
    const d = days(n), ads = active[n] || 0;
    g.set(r, 1, n, { b: 'bold' });
    g.merge(r, 1, 1, 2);
    g.set(r, 3, ads || 'مفيش', ads ? { nf: S.COUNT, al: 'center' } : { fc: '#6b7280', al: 'center' });
    g.set(r, 4, stock[n] === undefined ? 'مش لاقي ستوك' : stock[n], stock[n] === undefined ? { fc: '#6b7280', al: 'right' } : { nf: S.COUNT, al: 'right' });
    g.set(r, 5, Math.round(perDay(n) * 10) / 10, { nf: '0.0', al: 'right' });
    g.set(r, 6, d === null ? '' : d === 0 ? 'نفد' : d === Infinity ? '— مااتباعش' : Math.floor(d), {
      nf: S.COUNT, al: 'center', b: 'bold',
      bg: d === null || d === Infinity ? null : d <= COVER.RED ? S.RED : d <= COVER.YELLOW ? '#fff2cc' : S.GREEN });
    r++;
  });
  return r;
}
