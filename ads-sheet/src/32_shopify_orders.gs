/*
 * Store orders from the Shopify app (read_orders), instead of the Shopify Flow sheet.
 * Every update (inside syncOrders_, before Orders Raw is read): the orders created since the last read, oldest first, 40 a page,
 * into the hidden tab "Shopify Orders": one row per order with the columns readOrderSource_ reads (the same names the Flow sheet
 * had), so the rest of the sheet works as before. No customer data: no names, phones, emails or addresses; the governorate only.
 *  - The COD form's UTMs, campaign / ad set IDs and "Order Referrer" are the order's own attributes (Attr UTM …).
 *  - A website order's last visit (UTMs, referrer) isn't ready the moment the order is made: every read goes back
 *    SHOP_ORDERS.OVERLAP_H hours, and those orders are written again with what Shopify has now.
 *  - The first read starts where the fixed archive (18_orders_archive.gs) stops, and goes over a few updates (SHOP_ORDERS.PAGES
 *    pages each). Until it ends, Orders Raw still reads the Flow sheet; after that, the app tab (appOrdersReady_).
 * Shopify shows the last 60 days only (no read_all_orders): older orders stay in the tab as they were read.
 */
const SHOP_ORDERS = {
  TAB: 'Shopify Orders', FIRST_FROM: '2026-10-13T09:00:00Z', PAGES: 25, OVERLAP_H: 6, TAIL: 1500,
  SINCE: 'SHOP_ORDERS_SINCE', READY: 'SHOP_ORDERS_READY', AT: 'SHOP_ORDERS_AT',
  HEADERS: ['Order ID', 'Created At', 'Total Price', 'Products', 'UTM Source', 'UTM Campaign', 'UTM Content', 'UTM ID', 'UTM Term',
    'Attr UTM Source', 'Attr UTM Campaign', 'Attr UTM Content', 'Attr UTM ID', 'Attr UTM Term', 'Order Referrer', 'Source Name', 'City'],
  QUERY: 'query($q:String!,$after:String){orders(first:40,after:$after,sortKey:CREATED_AT,query:$q){pageInfo{hasNextPage endCursor} ' +
    'nodes{id createdAt sourceName originalTotalPriceSet{shopMoney{amount}} customAttributes{key value} ' +
    'lineItems(first:15){nodes{title quantity}} customerJourneySummary{lastVisit{referrerUrl utmParameters{source campaign content term}}}}}}'
};

/* Orders Raw reads the app tab once the first read is over (and the sheet is connected to the app). */
function appOrdersReady_() {
  const m = cfgStr_('orders.method');
  if (m !== 'shopify_flow_sheet' && m !== 'shopify_app') return false;
  return !!PropertiesService.getDocumentProperties().getProperty(SHOP_ORDERS.READY) && !!ss_().getSheetByName(SHOP_ORDERS.TAB);
}

/* A row of the tab from one Shopify order. */
function shopOrderRow_(o) {
  const attr = {};
  (o.customAttributes || []).forEach(a => { attr[String(a.key || '').trim().toLowerCase()] = String(a.value === null || a.value === undefined ? '' : a.value).trim(); });
  const visit = (o.customerJourneySummary || {}).lastVisit || {}, u = visit.utmParameters || {};
  const gov = Object.keys(attr).find(k => /محافظ|province|governorate/.test(k));
  const items = (((o.lineItems || {}).nodes) || []).map(li => String(li.title || '').trim() + ' x' + (li.quantity || 1)).join(' | ');
  return [o.id, o.createdAt, num_(((o.originalTotalPriceSet || {}).shopMoney || {}).amount), items,
    u.source || '', u.campaign || '', u.content || '', '', u.term || '',
    attr.utm_source || '', attr.utm_campaign || '', attr.utm_content || '', attr.utm_id || '', attr.utm_term || '',
    attr['order referrer'] || visit.referrerUrl || '', o.sourceName || '', gov ? attr[gov] : ''];
}

/* Returns the orders read in this run. Errors go to Health and never stop the update. */
function syncShopifyOrders_() {
  if (!shopifyProps_().getProperty('SHOPIFY_TOKEN')) return 0;
  const m = cfgStr_('orders.method');
  if (m !== 'shopify_flow_sheet' && m !== 'shopify_app') return 0;
  const props = PropertiesService.getDocumentProperties(), since = props.getProperty(SHOP_ORDERS.SINCE) || SHOP_ORDERS.FIRST_FROM;
  const rows = [];
  let after = null, more = true, pages = 0;
  try {
    while (more && pages < SHOP_ORDERS.PAGES && timeLeft_()) {
      const res = shopifyGql_(SHOP_ORDERS.QUERY, { q: "created_at:>='" + since + "'", after: after }).orders;
      res.nodes.forEach(o => rows.push(shopOrderRow_(o)));
      more = res.pageInfo.hasNextPage; after = res.pageInfo.endCursor; pages++;
    }
  } catch (e) {
    setStatus_('SHOP_ORDERS', '✗ ' + errText_(e) + (appOrdersReady_() ? ' — الأوردرات اللي اتقرت قبل كده شغالة' : ' — الأوردرات لسه من شيت الفلو'));
    if (!rows.length) return 0;
    more = true;
  }
  if (rows.length) withLock_(() => shopifyMergeOrders_(rows));
  const last = rows.reduce((x, r) => (r[1] > x ? r[1] : x), since);
  if (more) {
    props.setProperty(SHOP_ORDERS.SINCE, last);
    setStatus_('SHOP_ORDERS', '… ' + rows.length + ' أوردر لحد ' + last.slice(0, 10) + '، والباقي في التحديث الجاي' +
      (appOrdersReady_() ? '' : ' (الأوردرات لسه من شيت الفلو لحد ما القراية الأولى تخلص)'));
  } else {
    const back = new Date(new Date(last).getTime() - SHOP_ORDERS.OVERLAP_H * 3600000).toISOString().replace(/\.\d+Z$/, 'Z');
    props.setProperties({ [SHOP_ORDERS.SINCE]: back > since ? back : since, [SHOP_ORDERS.READY]: '1', [SHOP_ORDERS.AT]: nowText_() });
    setStatus_('SHOP_ORDERS', '✓ ' + rows.length + ' أوردر اتقرا (من ' + since.slice(0, 16).replace('T', ' ') + ' UTC)');
  }
  return rows.length;
}

/*
 * The tab stays sorted oldest first, so Orders Raw can read its bottom only. Orders already in the tab are written again
 * in place (the last SHOP_ORDERS.TAIL rows); new ones go at the bottom.
 */
function shopifyMergeOrders_(rows) {
  const W = SHOP_ORDERS.HEADERS.length, sh = ensureTab_(SHOP_ORDERS.TAB, SHOP_ORDERS.HEADERS);
  const hr = sh.getRange(1, 1, 1, W);
  if (hr.getValues()[0].join('|') !== SHOP_ORDERS.HEADERS.join('|')) hr.setValues([SHOP_ORDERS.HEADERS]);
  const L = sh.getLastRow(), n = Math.min(Math.max(L - 1, 0), SHOP_ORDERS.TAIL), start = L - n + 1;
  const older = new Set(L - 1 > n ? sh.getRange(2, 1, L - 1 - n, 1).getValues().map(r => String(r[0])) : []);
  const tail = n ? sh.getRange(start, 1, n, W).getValues() : [], fresh = new Map();
  rows.forEach(r => { if (!older.has(String(r[0]))) fresh.set(String(r[0]), r); });
  const out = tail.map(r => fresh.get(String(r[0])) || r), had = new Set(tail.map(r => String(r[0])));
  fresh.forEach((r, id) => { if (!had.has(id)) out.push(r); });
  out.sort((a, b) => (String(a[1]) < String(b[1]) ? -1 : String(a[1]) > String(b[1]) ? 1 : 0));
  if (!out.length) return;
  const at = n ? start : 2;
  if (at + out.length - 1 > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), at + out.length - 1 - sh.getMaxRows());
  sh.getRange(at, 1, out.length, W).setNumberFormat('@');
  sh.getRange(at, 3, out.length, 1).setNumberFormat('0.00');
  sh.getRange(at, 1, out.length, W).setValues(out);
  try { sh.hideSheet(); } catch (e) { /* مش مهم */ }
}
