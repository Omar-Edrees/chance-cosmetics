/*
 * Tab "Actual ROAS": the same sections as the Daily Account Funnel (the whole business first, then each account; this month,
 * each of the 3 months before it, those 3 together, then the last 30 days), with what really happened to the store orders
 * instead of Meta's funnel: SPEND, TOTAL ORDERS, CANCELLED (before shipping), CONFIRMED (shipped), RETURNED (shipped and came
 * back), IN SHIPPING (shipped, not delivered or back yet), DELIVERED (delivered and paid), then AOV, REVENUE (delivered
 * orders only), ROAS and CPO (spend per delivered order).
 * Orders: the same as the funnel's SHOPIFY ORDERS (the business: every store order but those from an ad account not in the
 * sheet; an account: the orders from its ads, DIRECT and MANUAL ones as in funnelShop_). Where each order stands comes from 19_order_status.gs (read once from Shopify);
 * a newer order counts in TOTAL ORDERS only. Spend: Meta's, from the funnel's reads. Written with the funnel, every 3 hours.
 */
const ACTUAL = {
  TITLE: 'ACTUAL ROAS', BAND: '#1f2937', MONTH_BG: '#f3f4f6', AVG3_BG: '#e8eefc',
  /* [column, field or [numerator, denominator], number format] */
  COLS: [
    ['TOTAL ORDERS', 'orders', '0'], ['CANCELLED', 'cancelled', '0'], ['CONFIRMED', 'confirmed', '0'], ['RETURNED', 'returned', '0'],
    ['IN SHIPPING', 'shipping', '0'], ['DELIVERED', 'delivered', '0'], ['AOV', ['revenue', 'delivered'], '#,##0.00'], ['REVENUE', 'revenue', '#,##0.00'],
    ['ROAS', ['revenue', 'spend'], '0.00"x"'], ['CPO', ['spend', 'delivered'], '#,##0.00']
  ]
};

/* Store orders by day since `from`, for the whole business and each account: {all: {day: counts}, acc: {id: {day: counts}}}. */
function actualShop_(from) {
  const out = { all: {}, acc: {} }, z = () => ({ orders: 0, cancelled: 0, confirmed: 0, returned: 0, shipping: 0, delivered: 0, revenue: 0 });
  const add = (map, d, o, st) => {
    const x = map[d] = map[d] || z();
    x.orders++;
    if (!st) return;
    if (st.code === 'C') x.cancelled++;
    if ('RDS'.indexOf(st.code) >= 0) x.confirmed++;
    if (st.code === 'R') x.returned++;
    if (st.code === 'S') x.shipping++;
    if (st.code === 'D') { x.delivered++; x.revenue += st.revenue === null ? num_(o[7]) : st.revenue; }
  };
  funnelShop_(from, (o, d, acc) => {
    const st = orderStatus_(o[0]);
    add(out.all, d, o, st);
    if (acc) add(out.acc[acc] = out.acc[acc] || {}, d, o, st);
  });
  return out;
}
function actualSum_(days, from, to, spend) {
  const t = { spend: spend || 0, orders: 0, cancelled: 0, confirmed: 0, returned: 0, shipping: 0, delivered: 0, revenue: 0 };
  Object.keys(days || {}).forEach(d => { if (d >= from && d <= to) Object.keys(days[d]).forEach(k => { t[k] += days[d][k]; }); });
  return t;
}

/* Draws the tab (inside the lock) from the funnel's Meta reads (fetchFunnel_). Nothing is written when nothing changed. */
function writeActual_(data) {
  const A = ACTUAL, sh = ensureTab_(X.ACTUAL), g = todayGrid_(), W = 2 + A.COLS.length, today = todayKey_();
  g.width = W;
  const past = data.months.slice(1), shop = actualShop_(data.months[data.months.length - 1] + '-01');
  const range3 = funnelMonthName_(past[past.length - 1]).slice(0, 3) + '–' + funnelMonthName_(past[0]);
  const monthEnd = ym => { const p = ym.split('-').map(Number); return new Date(Date.UTC(p[0], p[1], 0)).toISOString().slice(0, 10); };
  g.set(1, 1, A.TITLE + ' — الأرقام الفعلية من شوبيفاي | آخر تحديث ' + nowText_(), { bg: A.BAND, fc: '#ffffff', b: 'bold', al: 'center' });
  g.fill(1, 2, W - 1, { bg: A.BAND });
  g.merge(1, 1, 1, W);
  g.set(2, 1, 'TOTAL ORDERS = أوردرات شوبيفاي (البيزنس كله: كلها ماعدا الأكاونت اللي مش معانا؛ الأكاونت: اللي جت من إعلاناته، و DIRECT على الأكاونت اللي بيصرف على المنتج، والمانيول على أكاونت المسيجات). ' +
    'CANCELLED = اتلغى قبل الشحن. CONFIRMED = اتشحن (RETURNED + IN SHIPPING + DELIVERED). RETURNED = اتشحن ورجع أو اتلغى بعد الشحن. ' +
    'IN SHIPPING = في الشحن ولسه ماتسلمش ولا رجع. DELIVERED = اتسلم واتحصّل. REVENUE = مبيعات المتسلم بس، و AOV عليه. ROAS = REVENUE ÷ SPEND. CPO = SPEND ÷ DELIVERED. ' +
    'حالة الأوردرات من شوبيفاي لحد ' + ORDER_STATUS_AT + '، والأوردر الأحدث محسوب في TOTAL ORDERS بس.', { al: 'left' });
  g.merge(2, 1, 1, W);
  ['DATE', 'SPEND'].concat(A.COLS.map(c => c[0])).forEach((h, i) => g.set(3, 1 + i, h, { bg: '#fff200', b: 'bold', al: 'center' }));
  let r = 4;
  const line = (label, t, style) => {
    g.set(r, 1, label, Object.assign({ al: 'center' }, style));
    g.set(r, 2, Math.round(t.spend * 100) / 100, Object.assign({ nf: '#,##0.00', al: 'center' }, style));
    A.COLS.forEach((c, i) => {
      const v = Array.isArray(c[1]) ? ratioOrBlank_(t[c[1][0]], t[c[1][1]], 4) : (c[1] === 'revenue' ? Math.round(t.revenue * 100) / 100 : t[c[1]]);
      g.set(r, 3 + i, v, Object.assign({ nf: c[2], al: 'center' }, style));
    });
    r++;
  };
  const section = (name, months, days, error, shopDays) => {
    g.set(r, 1, name + (error ? '   ⚠️ ماقدرتش أقرا الحساب: ' + error : ''), { bg: A.BAND, fc: '#ffffff', b: 'bold' });
    g.fill(r, 2, W - 1, { bg: A.BAND });
    g.merge(r, 1, 1, W);
    r++;
    if (error) return;
    data.months.forEach((ym, i) => line(funnelMonthName_(ym) + (i ? '' : ' (لحد النهارده)'),
      actualSum_(shopDays, ym + '-01', i ? monthEnd(ym) : today, (months[ym] || {}).spend), { bg: A.MONTH_BG, b: 'bold' }));
    line('آخر 3 شهور (' + range3 + ')', actualSum_(shopDays, past[past.length - 1] + '-01', monthEnd(past[0]),
      past.reduce((s, ym) => s + num_((months[ym] || {}).spend), 0)), { bg: A.AVG3_BG, b: 'bold' });
    days.forEach(d => {
      const p = d.date.split('-').map(Number);
      line(Utilities.formatDate(new Date(Date.UTC(p[0], p[1] - 1, p[2], 12)), 'UTC', 'EEE dd-MMM'), actualSum_(shopDays, d.date, d.date, d.raw.spend), {});
    });
  };
  const ok = data.accounts.filter(a => !a.error), allMonths = {}, allDays = {};
  data.months.forEach(ym => { allMonths[ym] = { spend: ok.reduce((s, a) => s + num_((a.months[ym] || {}).spend), 0) }; });
  ok.forEach(a => a.days.forEach(d => { allDays[d.date] = { spend: num_((allDays[d.date] || {}).spend) + num_(d.raw.spend) }; }));
  if (ok.length > 1) section('كل الحسابات (البيزنس كله)', allMonths,
    Object.keys(allDays).sort().reverse().map(d => ({ date: d, raw: allDays[d] })), '', shop.all);
  data.accounts.forEach(a => section(a.name, a.months, a.days, a.error, shop.acc[a.id] || {}));
  if (!data.accounts.length) g.set(r, 1, 'مفيش حساب Meta صرف في الفترة دي', { fc: '#6b7280' });
  if (!writeGrid_(sh, g)) return;
  sh.setFrozenRows(3);
  sh.setColumnWidth(1, 190);
  for (let c = 2; c <= W; c++) sh.setColumnWidth(c, 95);
  sh.getRange(2, 1, 1, W).setWrap(true);
  sh.setRowHeight(2, 60);
  sh.getRange(3, 1, 1, W).setWrap(true);
}
