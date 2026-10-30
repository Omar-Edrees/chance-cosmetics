/*
 * Today, left side under the account balances: how many days each product's stock lasts, in two parts.
 * 1) Every product with its own Meta ads running now (not catalog ads), even out of stock.
 * 2) Products without ads that sell COVER.MIN_PER_DAY pieces a day or more, still have stock, and have COVER.RED days or less.
 * Per day = pieces sold in the last COVER.DAYS full days (every store order but cancelled or returned ones) ÷ COVER.DAYS.
 * Red = COVER.RED days or less (order more stock), yellow = up to COVER.YELLOW, green above.
 * To order = pieces for COVER.ORDER_DAYS days at that speed, minus the stock.
 */
const COVER = { DAYS: 5, RED: 10, YELLOW: 15, MIN_PER_DAY: 1, ORDER_DAYS: 30 };

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
  const rank = n => (days(n) === null ? 2e9 : days(n) === Infinity ? 1e9 : days(n));
  const byDays = (a, b) => (rank(a) - rank(b)) || (perDay(b) - perDay(a)) || (a < b ? -1 : 1);
  const names = Object.keys(Object.assign({}, active, sold)).filter(n => special.indexOf(n) < 0);
  const withAds = names.filter(n => (active[n] || 0) > 0).sort(byDays);
  const noAds = names.filter(n => !(active[n] > 0) && perDay(n) >= COVER.MIN_PER_DAY && days(n) !== null && days(n) > 0 &&
    days(n) <= COVER.RED).sort(byDays);

  g.set(r, 1, 'الستوك يكفي كام يوم (بمتوسط آخر ' + COVER.DAYS + ' أيام) — 🔴 ' + COVER.RED + ' أيام أو أقل: اطلب ستوك   🟡 لحد ' +
    COVER.YELLOW + '   🟢 أكتر', { bg: S.DARK, fc: '#ffffff', b: 'bold', al: 'center' });
  g.fill(r, 2, 5, { bg: S.DARK });
  g.merge(r, 1, 1, 6);
  r++;
  ['المنتج', '', 'الستوك', 'بيتباع في اليوم', 'يكفي كام يوم', 'اطلب كام (لـ ' + COVER.ORDER_DAYS + ' يوم)']
    .forEach((h, i) => g.set(r, 1 + i, h, { bg: S.YELLOW, b: 'bold', al: 'center' }));
  g.merge(r, 1, 1, 2);
  r++;
  const part = (title, list, empty) => {
    g.set(r, 1, title, { bg: S.LABEL, b: 'bold' });
    g.fill(r, 2, 5, { bg: S.LABEL });
    g.merge(r, 1, 1, 6);
    r++;
    if (!list.length) { g.set(r, 1, empty, { fc: '#6b7280' }); r++; }
    list.forEach(n => {
      const d = days(n), need = stock[n] === undefined || !(perDay(n) > 0) ? '' : Math.max(0, Math.ceil(perDay(n) * COVER.ORDER_DAYS - Math.max(stock[n], 0)));
      g.set(r, 1, n, { b: 'bold' });
      g.merge(r, 1, 1, 2);
      g.set(r, 3, stock[n] === undefined ? 'مش لاقي ستوك' : stock[n], stock[n] === undefined ? { fc: '#6b7280', al: 'right' } : { nf: S.COUNT, al: 'right' });
      g.set(r, 4, Math.round(perDay(n) * 10) / 10, { nf: '0.0', al: 'right' });
      g.set(r, 5, d === null ? '' : d === 0 ? 'نفد' : d === Infinity ? '— مااتباعش' : Math.floor(d), {
        nf: S.COUNT, al: 'center', b: 'bold',
        bg: d === null || d === Infinity ? null : d <= COVER.RED ? S.RED : d <= COVER.YELLOW ? '#fff2cc' : S.GREEN });
      g.set(r, 6, need, { nf: S.COUNT, al: 'center', b: need > 0 ? 'bold' : 'normal' });
      r++;
    });
  };
  part('منتجات عليها إعلانات شغالة', withAds, 'مفيش منتجات عليها إعلانات شغالة');
  part('منتجات من غير إعلانات — بتتباع ' + COVER.MIN_PER_DAY + ' قطعة في اليوم أو أكتر وفاضلها ' + COVER.RED + ' أيام أو أقل', noAds,
    'مفيش منتجات من غير إعلانات قرّبت تخلص');
  return r;
}
