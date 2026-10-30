/*
 * Tab "توب 100": five lists of up to 100 products for the period in B2:B3 (this month by default), each with its live stock:
 * best sellers (units sold), highest ROAS (spend on the product's ads vs its orders' sales, like the product table in Today,
 * for products with at least TOP.MIN_SPEND spend), most stock, selling without ads (no spend on its own ads and no share of
 * catalog ads), and dead stock (stock with the fewest sales). Units: the line items of store orders that weren't cancelled
 * or returned (19_order_status.gs). The lists sit side by side. Refreshed with the slow views and when B2 / B3 change.
 */
const TOP = { N: 100, MIN_SPEND: 500 };

function writeTopTab_() {
  const sh = ensureTab_(X.TOP), today = todayKey_(), week = shiftKey_(today, -6);
  sh.getRange('A1:A3').setValues([['توب 100 — اختار الفترة'], ['من'], ['إلى']]);
  sh.getRange('A1').setFontWeight('bold').setFontSize(13);
  sh.getRange('B2:B3').setNumberFormat('@').setBackground('#fff2cc');
  const p = periodFromCells_(sh), special = [APP.CATALOG, APP.MULTI, APP.UNMAPPED, APP.META_NO_AD, APP.UNKNOWN_PRODUCT, ''];
  const stock0 = stockByName_(), stockOf = stock0.by, active = activeMap_();

  // Units sold, orders and last sale per product (every line item, not only the first one).
  const units = {}, ordersWith = {}, units7 = {}, last = {}, nameOf = {};
  rawRows_(APP.T.ORDERS, ORDERS_HEADERS.length).forEach(o => {
    const d = asKey_(o[2]), s = orderStatus_(o[0]);
    if (!d || (s && (s.code === 'C' || s.code === 'R')) || o[15] === true || String(o[15]).toUpperCase() === 'TRUE') return;
    const seen = new Set();
    lineItems_(o[6]).forEach(li => {
      const n = nameOf[li.title] = nameOf[li.title] || productNameOf_(li.title);
      if (!last[n] || d > last[n]) last[n] = d;
      if (d >= week && d <= today) units7[n] = (units7[n] || 0) + li.qty;
      if (d < p.from || d > p.to) return;
      units[n] = (units[n] || 0) + li.qty;
      if (!seen.has(n)) { ordersWith[n] = (ordersWith[n] || 0) + 1; seen.add(n); }
    });
  });
  // Spend (every platform) and ad orders (Meta, TikTok and DIRECT, like the product table in Today) per product.
  const ad = {};
  dailyRows_().forEach(r => {
    if (r[0] < p.from || r[0] > p.to) return;
    const t = ad[r[2]] = ad[r[2]] || { spend: 0, orders: 0, revenue: 0 };
    if (r[1] === 'META' || r[1] === 'TIKTOK') t.spend += num_(r[3]);
    if (r[1] === 'META' || r[1] === 'TIKTOK' || r[1] === APP.DIRECT) { t.orders += num_(r[8]); t.revenue += num_(r[10]); }
  });
  // The product's share of catalog ads (الكتالوج tab): not in its ROAS, but a product shown there isn't "without ads".
  const cat = {};
  if (ss_().getSheetByName(APP.T.CATALOG)) recentRows_(APP.T.CATALOG, CATALOG_HEADERS.length, 1, asKey_, p.from).forEach(r => {
    const d = asKey_(r[0]), n = catalogProduct_(r[4]);
    if (d <= p.to) cat[n] = (cat[n] || 0) + num_(r[5]);
  });

  const names = Array.from(new Set(Object.keys(units).concat(Object.keys(stockOf), Object.keys(ad)))).filter(n => special.indexOf(n) < 0);
  const stock = n => (stockOf[n] === undefined ? '' : stockOf[n]);
  const cover = n => {
    const s = stockOf[n], perDay = (units7[n] || 0) / 7;
    return s === undefined ? '' : s <= 0 ? 'نفد' : perDay > 0 ? Math.floor(s / perDay) : '—';
  };
  const spend = n => (ad[n] ? ad[n].spend : 0);
  const top = list => (list.length ? list.slice(0, TOP.N).map((r, i) => [i + 1].concat(r)) : [['', 'مفيش منتجات هنا في الفترة دي']]);

  const best = top(names.filter(n => units[n] > 0).sort((a, b) => (units[b] - units[a]) || (ordersWith[b] - ordersWith[a]))
    .map(n => [n, units[n], ordersWith[n], stock(n), cover(n), active[n] || '']));
  const roas = top(names.filter(n => spend(n) >= TOP.MIN_SPEND).map(n => ({ n: n, t: ad[n], r: ad[n].revenue / ad[n].spend }))
    .sort((a, b) => (b.r - a.r) || (b.t.spend - a.t.spend))
    .map(x => [x.n, round2_(x.t.spend), x.t.orders, round2_(x.t.revenue), round2_(x.r), x.t.orders ? round2_(x.t.spend / x.t.orders) : '', stock(x.n)]));
  const most = top(names.filter(n => stockOf[n] > 0).sort((a, b) => stockOf[b] - stockOf[a])
    .map(n => [n, stockOf[n], units[n] || 0, cover(n), last[n] || 'مااتباعش']));
  const noAds = top(names.filter(n => units[n] > 0 && spend(n) <= 0 && !(cat[n] > 0)).sort((a, b) => (units[b] - units[a]) || (ordersWith[b] - ordersWith[a]))
    .map(n => [n, units[n], ordersWith[n], stock(n), last[n]]));
  const dead = top(names.filter(n => stockOf[n] > 0).sort((a, b) => ((units[a] || 0) - (units[b] || 0)) || (stockOf[b] - stockOf[a]))
    .map(n => [n, stockOf[n], units[n] || 0, last[n] || 'مااتباعش', cover(n)]));

  const period = ' (' + p.from + ' لـ ' + p.to + ')';
  sh.getRange('C2:D2').setValues([['الستوك', stock0.status]]);
  const at = writeSideBlocks_(sh, 5, [
    { title: '1) الأكثر مبيعًا' + period + ' — قطع اتباعت في أوردرات مااتلغتش ولا رجعت', rows: best,
      headers: ['#', 'المنتج', 'قطع اتباعت', 'أوردرات فيها المنتج', 'الستوك', 'الستوك يكفي كام يوم', 'إعلانات Meta شغالة'] },
    { title: '2) الأعلى Shopify ROAS' + period + ' — مبيعات أوردرات إعلانات المنتج (و DIRECT) ÷ الصرف عليه، للي اتصرف عليه ' + TOP.MIN_SPEND + ' أو أكتر', rows: roas,
      headers: ['#', 'المنتج', 'الصرف', 'الأوردرات', 'المبيعات', 'Shopify ROAS', 'CPP', 'الستوك'] },
    { title: '3) أعلى ستوك — الستوك دلوقتي، والمبيعات في الفترة', rows: most,
      headers: ['#', 'المنتج', 'الستوك', 'قطع اتباعت', 'الستوك يكفي كام يوم', 'آخر مرة اتباع'] },
    { title: '4) بيتباع من غير إعلانات' + period + ' — مفيش صرف على إعلانات المنتج ولا ظهر في إعلانات الكتالوج في الفترة', rows: noAds,
      headers: ['#', 'المنتج', 'قطع اتباعت', 'أوردرات فيها المنتج', 'الستوك', 'آخر مرة اتباع'] },
    { title: '5) الرواكد' + period + ' — عنده ستوك، والأقل مبيعًا الأول (وبعدين الأكتر ستوك)', rows: dead,
      headers: ['#', 'المنتج', 'الستوك', 'قطع اتباعت', 'آخر مرة اتباع', 'الستوك يكفي كام يوم'] }
  ]);
  // Per block: # narrow, product wide, the rest even; the empty column between blocks thin.
  for (let c = 1; c <= at.width; c++) sh.setColumnWidth(c, 95);
  at.cols.forEach((c, k) => { sh.setColumnWidth(c, 35); sh.setColumnWidth(c + 1, 260); if (k) sh.setColumnWidth(c - 1, 16); });
  sh.setFrozenRows(6);
}
