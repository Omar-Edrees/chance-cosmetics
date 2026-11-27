/*
 * Store orders from the Shopify app (read_orders), instead of the Shopify Flow sheet.
 * Every update (inside syncOrders_, before Orders Raw is read): the orders created since the last read, oldest first, 20 a page,
 * into the hidden tab "Shopify Orders": one row per order with the columns readOrderSource_ reads (the same names the Flow sheet
 * had), so the rest of the sheet works as before. No customer data: no names, phones, emails or addresses; the governorate only.
 *  - Variants: "variant number x pieces | …" of the pieces in the order now ("-" = none), for the colors running out in Today.
 *  - Bundles: the Shopify bundles in the order (shopOrderBundlesText_), for "bought with" in Today's product tables.
 *  - The COD form's UTMs, campaign / ad set IDs and "Order Referrer" are the order's own attributes (Attr UTM …).
 *  - A website order's last visit (UTMs, referrer) isn't ready the moment the order is made: every read goes back
 *    SHOP_ORDERS.OVERLAP_H hours, and those orders are written again with what Shopify has now.
 *  - The first read starts where the fixed archive (18_orders_archive.gs) stops, and goes over a few updates (SHOP_ORDERS.PAGES
 *    pages each). Until it ends, Orders Raw still reads the Flow sheet; after that, the app tab (appOrdersReady_).
 * Shopify shows the last 60 days only (no read_all_orders): older orders stay in the tab as they were read.
 */
const SHOP_ORDERS = {
  TAB: 'Shopify Orders', FIRST_FROM: '2026-10-13T09:00:00Z', PAGES: 25, OVERLAP_H: 6, TAIL: 1500, VARIANT_DAYS: 7, BUNDLE_DAYS: 40,
  BUNDLE_URLS: 'SHOP_BUNDLE_URLS',
  // The page of each bundle product (Shopify Bundles: the order has the bundle's products as lines, each with the bundle as its group).
  PRODUCT_URL_QUERY: 'query($ids:[ID!]!){nodes(ids:$ids){... on Product{id handle onlineStoreUrl}}}',
  SINCE: 'SHOP_ORDERS_SINCE', READY: 'SHOP_ORDERS_READY', AT: 'SHOP_ORDERS_AT', NO_ADDR: 'SHOP_ORDERS_NO_ADDR',
  HEADERS: ['Order ID', 'Created At', 'Total Price', 'Products', 'UTM Source', 'UTM Campaign', 'UTM Content', 'UTM ID', 'UTM Term',
    'Attr UTM Source', 'Attr UTM Campaign', 'Attr UTM Content', 'Attr UTM ID', 'Attr UTM Term', 'Order Referrer', 'Source Name', 'City', 'Gross Sales', 'Net Sales',
    'Variants', 'Bundles'],
  // Gross sales of an order when it was made: its products at their price before any discount, no shipping, from the
  // order's first sales agreement (reason ORDER), so later edits and cancellations don't change it. Net sales: the same
  // products after their discounts (gross − discounts), still without shipping. 10 orders a call.
  GROSS_QUERY: 'query($ids:[ID!]!){nodes(ids:$ids){... on Order{id agreements(first:1){nodes{reason sales(first:50){nodes{lineType ' +
    'totalAmount{shopMoney{amount}} totalDiscountAmountBeforeTaxes{shopMoney{amount}}}}}}}}}',
  QUERY: 'query($q:String!,$after:String){orders(first:20,after:$after,sortKey:CREATED_AT,query:$q){pageInfo{hasNextPage endCursor} ' +
    'nodes{id createdAt cancelledAt sourceName originalTotalPriceSet{shopMoney{amount}} customAttributes{key value} ' +
    'lineItems(first:30){pageInfo{hasNextPage endCursor} nodes{title quantity currentQuantity variant{id} lineItemGroup{title productId}}} customerJourneySummary{lastVisit{referrerUrl utmParameters{source campaign content term}}}}}}',
  // The shipping address's governorate only (the same field the fixed file 24_order_gov.gs was read from).
  // An order with more than 30 lines: the rest, 100 at a time.
  ITEMS_QUERY: 'query($id:ID!,$after:String){order(id:$id){lineItems(first:100,after:$after){pageInfo{hasNextPage endCursor} nodes{title quantity currentQuantity variant{id} lineItemGroup{title productId}}}}}',
  // Orders edited after they were read (a piece removed, a color swapped): their lines now, 10 orders a call.
  EDITED_QUERY: 'query($ids:[ID!]!){nodes(ids:$ids){... on Order{id cancelledAt lineItems(first:50){pageInfo{hasNextPage endCursor} nodes{title quantity currentQuantity variant{id} lineItemGroup{title productId}}}}}}',
  EDITED: 'SHOP_ORDERS_EDITED',
  ADDR_QUERY: 'query($ids:[ID!]!){nodes(ids:$ids){... on Order{id shippingAddress{province}}}}',
  // The check (checkShopifyOrders_): the orders Shopify counts for each of the last CHECK_DAYS full days, and the IDs of a day that differs.
  CHECK_DAYS: 7, DELETED: 'SHOP_ORDERS_DELETED',
  IDS_QUERY: 'query($q:String!,$after:String){orders(first:100,after:$after,query:$q){pageInfo{hasNextPage endCursor} nodes{id}}}'
};

/* Orders Raw reads the app tab once the first read is over (and the sheet is connected to the app). */
function appOrdersReady_() {
  const m = cfgStr_('orders.method');
  if (m !== 'shopify_flow_sheet' && m !== 'shopify_app') return false;
  return !!PropertiesService.getDocumentProperties().getProperty(SHOP_ORDERS.READY) && !!ss_().getSheetByName(SHOP_ORDERS.TAB);
}

/* A row of the tab from one Shopify order. province = the shipping address's governorate (else the COD form's). */
function shopOrderRow_(o, province) {
  const attr = {};
  (o.customAttributes || []).forEach(a => { attr[String(a.key || '').trim().toLowerCase()] = String(a.value === null || a.value === undefined ? '' : a.value).trim(); });
  const visit = (o.customerJourneySummary || {}).lastVisit || {}, u = visit.utmParameters || {};
  const gov = Object.keys(attr).find(k => /محافظ|province|governorate/.test(k));
  const lines = shopOrderItems_(o), items = shopOrderItemsText_(o, lines);
  return [o.id, o.createdAt, num_(((o.originalTotalPriceSet || {}).shopMoney || {}).amount), items,
    u.source || '', u.campaign || '', u.content || '', '', u.term || '',
    attr.utm_source || '', attr.utm_campaign || '', attr.utm_content || '', attr.utm_id || '', attr.utm_term || '',
    attr['order referrer'] || visit.referrerUrl || '', o.sourceName || '', province || (gov ? attr[gov] : ''), '', '', shopOrderVariantsText_(o, lines),
    shopOrderBundlesText_(o, lines)];
}

/*
 * "Title x2 | Title2 x1": the pieces in the order now. An order edited after it was made (a piece removed, a color swapped)
 * keeps the removed lines with currentQuantity 0: they aren't sold. A cancelled order keeps what was ordered (its product
 * still shows in the cancelled numbers), and so does an order whose lines would all be gone.
 */
function shopOrderItemsText_(o, lines) {
  return shopOrderLinesNow_(o, lines).map(li => String(li.title || '').trim() + ' x' + (li.quantity || 1)).join(' | ');
}
function shopOrderLinesNow_(o, lines) {
  const now = o.cancelledAt ? [] : lines.filter(li => li.currentQuantity === undefined || li.currentQuantity === null || Number(li.currentQuantity) > 0)
    .map(li => ({ title: li.title, variant: li.variant, lineItemGroup: li.lineItemGroup,
      quantity: li.currentQuantity === undefined || li.currentQuantity === null ? li.quantity : li.currentQuantity }));
  return now.length ? now : lines;
}
/* "123 x2 | 456 x1": the same pieces by variant number. A line without a variant (deleted, custom item) is left out; none = "-". */
function shopOrderVariantsText_(o, lines) {
  const out = shopOrderLinesNow_(o, lines).filter(li => li.variant && li.variant.id)
    .map(li => String(li.variant.id).split('/').pop() + ' x' + (li.quantity || 1)).join(' | ');
  return out || '-';
}

/*
 * "product number~bundle title~product~product | …": each Shopify bundle in the order (its lines share the bundle as their
 * lineItemGroup) and the products in it. None = "-".
 */
function shopOrderBundlesText_(o, lines) {
  const by = new Map(), clean = v => String(v || '').replace(/~|\s\|\s/g, ' ').trim();
  shopOrderLinesNow_(o, lines).forEach(li => {
    const g = li.lineItemGroup;
    if (!g || !g.productId) return;
    const id = String(g.productId).split('/').pop(), b = by.get(id) || { title: clean(g.title), items: [] };
    const t = clean(li.title);
    if (b.items.indexOf(t) < 0) b.items.push(t);
    by.set(id, b);
  });
  return Array.from(by.entries()).map(e => [e[0], e[1].title].concat(e[1].items).join('~')).join(' | ') || '-';
}
/* Order ID → [{ id, title, items: [product names] }] from the tab's Bundles column (orders read before it: none). */
function orderBundlesMap_() {
  const out = new Map(), B = SHOP_ORDERS.HEADERS.indexOf('Bundles');
  if (!ss_().getSheetByName(SHOP_ORDERS.TAB)) return out;
  rawRows_(SHOP_ORDERS.TAB, SHOP_ORDERS.HEADERS.length).forEach(r => {
    const v = String(r[B] || '');
    if (!v || v === '-') return;
    out.set(String(r[0]), v.split(' | ').map(g => { const x = g.split('~'); return { id: x[0], title: x[1] || '', items: x.slice(2).map(productNameOf_) }; }));
  });
  return out;
}
/* Bundle product number → its page on the store ('' = not known yet or not on the store). */
function bundleUrls_() {
  try { return JSON.parse(PropertiesService.getDocumentProperties().getProperty(SHOP_ORDERS.BUNDLE_URLS) || '{}'); } catch (e) { return {}; }
}

/* Every line of an order: the first 30 come with the order; the rest are read on their own (rare). */
function shopOrderItems_(o) {
  const li = o.lineItems || {}, out = (li.nodes || []).slice();
  let page = li.pageInfo || {};
  while (page.hasNextPage) {
    const more = shopifyGql_(SHOP_ORDERS.ITEMS_QUERY, { id: o.id, after: page.endCursor }).order.lineItems;
    (more.nodes || []).forEach(x => out.push(x));
    page = more.pageInfo || {};
  }
  return out;
}

/* Returns the orders read in this run. Errors go to Health and never stop the update. */
function syncShopifyOrders_() {
  if (!shopifyProps_().getProperty('SHOPIFY_TOKEN')) return 0;
  const m = cfgStr_('orders.method');
  if (m !== 'shopify_flow_sheet' && m !== 'shopify_app') return 0;
  const props = PropertiesService.getDocumentProperties(), tab = ss_().getSheetByName(SHOP_ORDERS.TAB);
  // The tab is the only copy of orders older than 60 days: if it was deleted or emptied, read everything again from the start.
  if (props.getProperty(SHOP_ORDERS.READY) && (!tab || tab.getLastRow() < 2)) {
    [SHOP_ORDERS.READY, SHOP_ORDERS.SINCE].forEach(k => props.deleteProperty(k));
    setStatus_('SHOP_ORDERS', '⚠️ تاب ' + SHOP_ORDERS.TAB + ' اتمسح: بيتقري من الأول');
  }
  const since = props.getProperty(SHOP_ORDERS.SINCE) || SHOP_ORDERS.FIRST_FROM;
  const rows = [];
  let after = null, more = true, pages = 0;
  try {
    while (more && pages < SHOP_ORDERS.PAGES && timeLeft_()) {
      const res = shopifyGql_(SHOP_ORDERS.QUERY, { q: "created_at:>='" + since + "'", after: after }).orders, prov = shopOrderProvinces_(res.nodes);
      res.nodes.forEach(o => rows.push(shopOrderRow_(o, prov[o.id])));
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
 * Order ID → the shipping address's governorate. If Shopify doesn't let the app read addresses, the COD form's governorate
 * is used (web and draft orders then stay "unknown"), and addresses aren't asked again until tomorrow.
 */
function shopOrderProvinces_(orders) {
  const props = PropertiesService.getDocumentProperties(), out = {};
  if (!orders.length || props.getProperty(SHOP_ORDERS.NO_ADDR) === todayKey_()) return out;
  try {
    (shopifyGql_(SHOP_ORDERS.ADDR_QUERY, { ids: orders.map(o => o.id) }).nodes || [])
      .forEach(n => { if (n && n.id && n.shippingAddress) out[n.id] = String(n.shippingAddress.province || '').trim(); });
  } catch (e) {
    // Only a refusal stops asking until tomorrow; a passing error (timeout, 5xx) asks again next time. Either way the
    // governorate already in the tab stays (shopifyMergeOrders_ keeps it when a new read has none).
    const refused = /\((401|403)\)|ACCESS_DENIED|not approved|access denied|protected customer data/i.test(errText_(e));
    if (refused) props.setProperty(SHOP_ORDERS.NO_ADDR, todayKey_());
    setStatus_('SHOP_ORDERS_ADDR', refused ? '⚠️ شوبيفاي مابيدّيش الأبليكيشن عنوان الشحن، فالمحافظة من الفورم بس (أوردرات الموقع والمانيول "مش معروفة"): ' + errText_(e)
      : '⚠️ عنوان الشحن ماتقراش المرة دي (' + errText_(e) + ') — هيتقري تاني، والمحافظات اللي اتقرت قبل كده زي ما هي');
    return out;
  }
  setStatus_('SHOP_ORDERS_ADDR', '✓ المحافظة من عنوان الشحن');
  return out;
}

/*
 * Check, every update: the orders of each of the last SHOP_ORDERS.CHECK_DAYS full days in Orders Raw = the orders Shopify
 * itself counts for that day. A day with more orders in the sheet than in Shopify = an order deleted in Shopify (the sheet
 * kept it: a deleted order never comes back in a read): that day's IDs are read from Shopify, and the ones it doesn't have
 * any more leave the sheet (dropDeletedOrders_). Only once Orders Raw reads the app (before that it's the Flow sheet).
 * The result is in Health.
 */
function checkShopifyOrders_() {
  if (!shopifyProps_().getProperty('SHOPIFY_TOKEN') || !appOrdersReady_() || !ss_().getSheetByName(APP.T.ORDERS)) return;
  const today = todayKey_(), days = [];
  for (let i = 1; i <= SHOP_ORDERS.CHECK_DAYS; i++) days.push(shiftKey_(today, -i));
  const utc = d => Utilities.parseDate(d + ' 00:00', tz_(), 'yyyy-MM-dd HH:mm').toISOString().replace(/\.\d+Z$/, 'Z');
  const q = d => "created_at:>='" + utc(d) + "' created_at:<'" + utc(shiftKey_(d, 1)) + "'";
  try {
    const r = shopifyGql_('query{' + days.map((d, i) => 'd' + i + ':ordersCount(query:' + JSON.stringify(q(d)) + ',limit:null){count}').join(' ') + '}');
    const shop = days.map((d, i) => r['d' + i].count), have = days.map(() => 0), ids = days.map(() => []);
    recentRows_(APP.T.ORDERS, ORDERS_HEADERS.length, 2, sortKey_, days[days.length - 1]).forEach(o => {
      const i = days.indexOf(asKey_(o[2]));
      if (i >= 0) { have[i]++; ids[i].push(String(o[0])); }
    });
    const gone = [];
    days.forEach((d, i) => {
      if (have[i] <= shop[i]) return;
      const there = new Set();
      let after = null;
      do {
        const page = shopifyGql_(SHOP_ORDERS.IDS_QUERY, { q: q(d), after: after }).orders;
        (page.nodes || []).forEach(n => there.add(String(n.id)));
        after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
      } while (after);
      // Only the app's own orders (gid://shopify/Order/…): a row from somewhere else isn't Shopify's to judge.
      ids[i].forEach(id => { if (/^gid:\/\/shopify\/Order\//.test(id) && !there.has(id)) gone.push(id); });
    });
    const dropped = dropDeletedOrders_(gone);
    const bad = days.map((d, i) => (shop[i] === have[i] ? '' : d + ' شوبيفاي ' + shop[i] + ' والشيت ' + have[i])).filter(String);
    setStatus_('SHOP_ORDERS_CHECK', (bad.length ? '⚠️ مش متطابق: ' + bad.join('، ') : '✓ آخر ' + days.length + ' أيام') +
      (dropped ? ' — ' + dropped + ' أوردر اتمسح من شوبيفاي واتشال من الشيت (بيتظبط في التحديث الجاي)' : ''));
  } catch (e) { setStatus_('SHOP_ORDERS_CHECK', '✗ ' + errText_(e)); }
}

/*
 * Orders deleted in Shopify (it doesn't have them any more): their rows leave the "Shopify Orders" tab, and Orders Raw is
 * read again in full on the next update (ORDERS_SRC goes), so every tab drops them: counts, sales, ROAS, Daily Log.
 * Returns how many rows went.
 */
function dropDeletedOrders_(ids) {
  const sh = ss_().getSheetByName(SHOP_ORDERS.TAB);
  if (!ids.length || !sh || sh.getLastRow() < 2) return 0;
  const gone = new Set(ids.map(String));
  let n = 0;
  withLock_(() => {
    const col = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
    for (let i = col.length - 1; i >= 0; i--) if (gone.has(String(col[i][0]))) { sh.deleteRows(i + 2, 1); n++; }
    if (!n) return;
    dropRaw_(SHOP_ORDERS.TAB);
    const props = PropertiesService.getDocumentProperties();
    props.deleteProperty('ORDERS_SRC');
    let log = [];
    try { log = JSON.parse(props.getProperty(SHOP_ORDERS.DELETED) || '[]'); } catch (e) { log = []; }
    props.setProperty(SHOP_ORDERS.DELETED, JSON.stringify(log.concat(Array.from(gone)).slice(-200)));
  });
  return n;
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
  // City: a new read without a governorate keeps the one read before. Gross / Net Sales: read once, kept.
  const keep = ['City', 'Gross Sales', 'Net Sales', 'Variants'].map(h => SHOP_ORDERS.HEADERS.indexOf(h));
  const out = tail.map(r => { const f = fresh.get(String(r[0])); if (f) keep.forEach(C => { if (f[C] === '' && r[C] !== '') f[C] = r[C]; }); return f || r; }),
    had = new Set(tail.map(r => String(r[0])));
  fresh.forEach((r, id) => { if (!had.has(id)) out.push(r); });
  out.sort((a, b) => (String(a[1]) < String(b[1]) ? -1 : String(a[1]) > String(b[1]) ? 1 : 0));
  if (!out.length) return;
  const at = n ? start : 2;
  if (at + out.length - 1 > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), at + out.length - 1 - sh.getMaxRows());
  sh.getRange(at, 1, out.length, W).setNumberFormat('@');
  sh.getRange(at, 3, out.length, 1).setNumberFormat('0.00');
  sh.getRange(at, 1, out.length, W).setValues(out);
  dropRaw_(SHOP_ORDERS.TAB);
  try { sh.hideSheet(); } catch (e) { /* مش مهم */ }
}

/*
 * EXT.live: Gross Sales and Net Sales of the orders in the tab that don't have them yet (new ones, and once the ones read
 * before a column existed), newest first, up to 300 a run. Shopify shows the last 60 days only: an older order gets "-"
 * (a Gross Sales read before stays).
 */
function fillGrossSales_() {
  const sh = ss_().getSheetByName(SHOP_ORDERS.TAB);
  if (!shopifyProps_().getProperty('SHOPIFY_TOKEN') || !sh || sh.getLastRow() < 2) return 0;
  const G = SHOP_ORDERS.HEADERS.indexOf('Gross Sales') + 1, N = SHOP_ORDERS.HEADERS.indexOf('Net Sales') + 1, L = sh.getLastRow();
  if (sh.getMaxColumns() < N) sh.insertColumnsAfter(sh.getMaxColumns(), N - sh.getMaxColumns());
  if (String(sh.getRange(1, G).getValue()) !== 'Gross Sales') sh.getRange(1, G).setValue('Gross Sales');
  if (String(sh.getRange(1, N).getValue()) !== 'Net Sales') sh.getRange(1, N).setValue('Net Sales');
  const ids = sh.getRange(2, 1, L - 1, 2).getValues(), col = sh.getRange(2, G, L - 1, 2).getValues();
  const cut = new Date(Date.now() - 59 * 86400000).toISOString();
  // Empty = not read yet. "-" inside the last 59 days = read before this check existed (maybe a deleted order): asked again.
  const need = [];
  for (let i = ids.length - 1; i >= 0 && need.length < 300; i--) {
    const unread = col[i][0] === '' || col[i][1] === '' || ((col[i][0] === '-' || col[i][1] === '-') && String(ids[i][1]) >= cut);
    if (unread && ids[i][0]) need.push(i);
  }
  const got = {}, deleted = [];
  try {
    for (let i = 0; i < need.length && timeLeft_(); i += 10) {
      const chunk = need.slice(i, i + 10);
      const old = chunk.filter(j => String(ids[j][1]) < cut), ask = chunk.filter(j => String(ids[j][1]) >= cut);
      old.forEach(j => { got[j] = ['-', '-']; });
      if (!ask.length) continue;
      const nodes = shopifyGql_(SHOP_ORDERS.GROSS_QUERY, { ids: ask.map(j => String(ids[j][0])) }).nodes || [];
      ask.forEach((j, n) => {
        // No order inside the last 59 days = deleted in Shopify: it leaves the sheet (dropDeletedOrders_), else the
        // day's GROSS SALES in Closing would stay empty for good. The first agreement is the order as it was made.
        const o = nodes[n], a = o && o.agreements && (o.agreements.nodes || [])[0];
        if (!o) { deleted.push(String(ids[j][0])); return; }
        if (!a) { got[j] = ['-', '-']; return; }
        const amt = x => num_(((x || {}).shopMoney || {}).amount), lines = (a.sales.nodes || []).filter(s => s.lineType === 'PRODUCT');
        const net = lines.reduce((t, s) => t + amt(s.totalAmount), 0);
        got[j] = [round2_(net + lines.reduce((t, s) => t + amt(s.totalDiscountAmountBeforeTaxes), 0)), round2_(net)];
      });
    }
  } catch (e) { setStatus_('SHOP_GROSS', '✗ ' + errText_(e)); }
  const dropped = dropDeletedOrders_(deleted);
  if (dropped) setStatus_('SHOP_ORDERS_CHECK', '✓ ' + dropped + ' أوردر اتمسح من شوبيفاي واتشال من الشيت (بيتظبط في التحديث الجاي)');
  const n = Object.keys(got).length;
  if (!n) return dropped;
  withLock_(() => {
    // Rows may have moved if new orders came in meanwhile: write by order ID. A cell read before keeps what it has.
    const now = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues(), at = new Map(now.map((r, i) => [String(r[0]), i]));
    const out = sh.getRange(2, G, now.length, 2).getValues();
    Object.keys(got).forEach(j => {
      const i = at.get(String(ids[j][0]));
      if (i === undefined) return;
      [0, 1].forEach(c => { if (out[i][c] === '' || out[i][c] === '-') out[i][c] = got[j][c]; });
    });
    sh.getRange(2, G, out.length, 2).setNumberFormat('0.00').setValues(out);
    dropRaw_(SHOP_ORDERS.TAB);
  });
  const left = col.filter(r => r[0] === '' || r[1] === '').length - n;
  setStatus_('SHOP_GROSS', '✓ ' + n + ' أوردر' + (left > 0 ? '، والباقي (' + left + ') في التحديث الجاي' : ''));
  return n;
}

/* Order ID → Gross Sales, or Net Sales with net (orders the app read; "-" or empty = not known). */
function grossSalesMap_(net) {
  const out = new Map(), G = SHOP_ORDERS.HEADERS.indexOf(net ? 'Net Sales' : 'Gross Sales');
  if (!ss_().getSheetByName(SHOP_ORDERS.TAB)) return out;
  rawRows_(SHOP_ORDERS.TAB, SHOP_ORDERS.HEADERS.length).forEach(r => {
    if (r[G] !== '' && r[G] !== '-' && r[G] !== null && isFinite(Number(r[G]))) out.set(String(r[0]), Number(r[G]));
  });
  return out;
}

/*
 * Orders Shopify says were edited (29_shopify_api.gs reads them with every update, SHOP_ORDERS.EDITED is the queue): their
 * Products cell in the tab ← the pieces in them now. Orders Raw reads the tab's last rows every update and all of it once a day.
 */
function queueEditedOrders_(ids) {
  if (!ids.length) return;
  const props = PropertiesService.getDocumentProperties();
  let q = [];
  try { q = JSON.parse(props.getProperty(SHOP_ORDERS.EDITED) || '[]'); } catch (e) { q = []; }
  ids.forEach(id => { if (q.indexOf(id) < 0) q.push(id); });
  props.setProperty(SHOP_ORDERS.EDITED, JSON.stringify(q.slice(-3000)));
}
function fixEditedOrders_() {
  const props = PropertiesService.getDocumentProperties(), sh = ss_().getSheetByName(SHOP_ORDERS.TAB);
  let q = [];
  try { q = JSON.parse(props.getProperty(SHOP_ORDERS.EDITED) || '[]'); } catch (e) { q = []; }
  if (!q.length || !sh || sh.getLastRow() < 2) return 0;
  const items = {}, done = [];
  try {
    for (let i = 0; i < q.length && i < 300 && timeLeft_(); i += 10) {
      const chunk = q.slice(i, i + 10);
      (shopifyGql_(SHOP_ORDERS.EDITED_QUERY, { ids: chunk }).nodes || []).forEach(o => {
        if (!o || !o.id || !o.lineItems) return;
        const lines = shopOrderItems_(o);
        items[o.id] = [shopOrderItemsText_(o, lines), shopOrderVariantsText_(o, lines), shopOrderBundlesText_(o, lines)];
      });
      chunk.forEach(id => done.push(id)); // an order Shopify doesn't show any more (older than 60 days) stays as it is
    }
  } catch (e) { setStatus_('SHOP_ORDERS_EDITED', '✗ ' + errText_(e)); }
  let changed = 0;
  if (Object.keys(items).length) withLock_(() => {
    const ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues(), P = SHOP_ORDERS.HEADERS.indexOf('Products') + 1;
    const V = SHOP_ORDERS.HEADERS.indexOf('Variants') + 1, BU = SHOP_ORDERS.HEADERS.indexOf('Bundles') + 1;
    ids.forEach((r, i) => {
      const t = items[String(r[0])];
      if (t === undefined) return;
      const cell = sh.getRange(i + 2, P);
      if (String(cell.getValue()) !== t[0]) { cell.setValue(t[0]); changed++; }
      if (sh.getMaxColumns() >= V) sh.getRange(i + 2, V).setValue(t[1]);
      if (sh.getMaxColumns() >= BU) sh.getRange(i + 2, BU).setValue(t[2]);
    });
  });
  const left = q.filter(id => done.indexOf(id) < 0);
  if (left.length) props.setProperty(SHOP_ORDERS.EDITED, JSON.stringify(left)); else props.deleteProperty(SHOP_ORDERS.EDITED);
  if (done.length) setStatus_('SHOP_ORDERS_EDITED', '✓ ' + done.length + ' أوردر اتعدل في شوبيفاي، ' + changed + ' منهم اتغيرت منتجاته' +
    (left.length ? '، والباقي (' + left.length + ') في التحديث الجاي' : ''));
  return changed;
}

/*
 * EXT.live: the Variants column of the orders made in the last SHOP_ORDERS.VARIANT_DAYS days that don't have it yet (orders
 * read before the column existed), newest first, up to 300 a run, 10 a call. An order Shopify doesn't show gets "-".
 */
function fillOrderVariants_() {
  const sh = ss_().getSheetByName(SHOP_ORDERS.TAB);
  if (!shopifyProps_().getProperty('SHOPIFY_TOKEN') || !sh || sh.getLastRow() < 2) return 0;
  const V = SHOP_ORDERS.HEADERS.indexOf('Variants') + 1, L = sh.getLastRow();
  if (sh.getMaxColumns() < V) sh.insertColumnsAfter(sh.getMaxColumns(), V - sh.getMaxColumns());
  if (String(sh.getRange(1, V).getValue()) !== 'Variants') sh.getRange(1, V).setValue('Variants');
  const cut = new Date(Date.now() - SHOP_ORDERS.VARIANT_DAYS * 86400000).toISOString();
  const ids = sh.getRange(2, 1, L - 1, 2).getValues(), col = sh.getRange(2, V, L - 1, 1).getValues(), need = [];
  for (let i = ids.length - 1; i >= 0 && need.length < 300 && String(ids[i][1]) >= cut; i--) {
    if (col[i][0] === '' && ids[i][0]) need.push(String(ids[i][0]));
  }
  if (!need.length) return 0;
  const got = {};
  try {
    for (let i = 0; i < need.length && timeLeft_(); i += 10) {
      const chunk = need.slice(i, i + 10), nodes = shopifyGql_(SHOP_ORDERS.EDITED_QUERY, { ids: chunk }).nodes || [];
      chunk.forEach((id, n) => { const o = nodes[n]; got[id] = o && o.lineItems ? shopOrderVariantsText_(o, shopOrderItems_(o)) : '-'; });
    }
  } catch (e) { setStatus_('SHOP_VARIANTS', '✗ ' + errText_(e)); }
  const n = Object.keys(got).length;
  if (!n) return 0;
  withLock_(() => {
    // Rows may have moved if new orders came in meanwhile: write by order ID. A cell filled meanwhile keeps what it has.
    const now = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues(), out = sh.getRange(2, V, now.length, 1).getValues();
    now.forEach((r, i) => { const t = got[String(r[0])]; if (t !== undefined && out[i][0] === '') out[i][0] = t; });
    sh.getRange(2, V, out.length, 1).setNumberFormat('@').setValues(out);
    dropRaw_(SHOP_ORDERS.TAB);
  });
  setStatus_('SHOP_VARIANTS', '✓ ' + n + ' أوردر' + (need.length > n ? '، والباقي في التحديث الجاي' : ''));
  return n;
}

/*
 * EXT.live: the Bundles column of the orders made in the last SHOP_ORDERS.BUNDLE_DAYS days that don't have it yet (orders read
 * before the column existed), newest first, up to 300 a run, 10 a call; an order Shopify doesn't show gets "-". Then the
 * page of every bundle in the column that isn't known yet (once per bundle, kept in SHOP_ORDERS.BUNDLE_URLS).
 */
function fillOrderBundles_() {
  const sh = ss_().getSheetByName(SHOP_ORDERS.TAB);
  if (!shopifyProps_().getProperty('SHOPIFY_TOKEN') || !sh || sh.getLastRow() < 2) return 0;
  const B = SHOP_ORDERS.HEADERS.indexOf('Bundles') + 1, L = sh.getLastRow();
  if (sh.getMaxColumns() < B) sh.insertColumnsAfter(sh.getMaxColumns(), B - sh.getMaxColumns());
  if (String(sh.getRange(1, B).getValue()) !== 'Bundles') sh.getRange(1, B).setValue('Bundles');
  const cut = new Date(Date.now() - SHOP_ORDERS.BUNDLE_DAYS * 86400000).toISOString();
  const ids = sh.getRange(2, 1, L - 1, 2).getValues(), col = sh.getRange(2, B, L - 1, 1).getValues(), need = [];
  for (let i = ids.length - 1; i >= 0 && need.length < 300 && String(ids[i][1]) >= cut; i--) {
    if (col[i][0] === '' && ids[i][0]) need.push(String(ids[i][0]));
  }
  const got = {};
  try {
    for (let i = 0; i < need.length && timeLeft_(); i += 10) {
      const chunk = need.slice(i, i + 10), nodes = shopifyGql_(SHOP_ORDERS.EDITED_QUERY, { ids: chunk }).nodes || [];
      chunk.forEach((id, n) => { const o = nodes[n]; got[id] = o && o.lineItems ? shopOrderBundlesText_(o, shopOrderItems_(o)) : '-'; });
    }
  } catch (e) { setStatus_('SHOP_BUNDLES', '✗ ' + errText_(e)); }
  const n = Object.keys(got).length;
  if (n) withLock_(() => {
    // Rows may have moved if new orders came in meanwhile: write by order ID. A cell filled meanwhile keeps what it has.
    const now = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues(), out = sh.getRange(2, B, now.length, 1).getValues();
    now.forEach((r, i) => { const t = got[String(r[0])]; if (t !== undefined && out[i][0] === '') out[i][0] = t; });
    sh.getRange(2, B, out.length, 1).setNumberFormat('@').setValues(out);
    dropRaw_(SHOP_ORDERS.TAB);
  });
  const known = bundleUrls_(), ask = [];
  orderBundlesMap_().forEach(list => list.forEach(b => { if (b.id && !(b.id in known) && ask.indexOf(b.id) < 0) ask.push(b.id); }));
  if (ask.length) {
    const domain = cfgList_('business.store_domains').map(storeHost_).filter(Boolean)[0];
    try {
      for (let i = 0; i < ask.length && timeLeft_(); i += 50) {
        const chunk = ask.slice(i, i + 50), nodes = shopifyGql_(SHOP_ORDERS.PRODUCT_URL_QUERY, { ids: chunk.map(id => 'gid://shopify/Product/' + id) }).nodes || [];
        chunk.forEach((id, k) => {
          const p = nodes[k] || {};
          known[id] = p.onlineStoreUrl || (p.handle && domain ? 'https://' + domain + '/products/' + p.handle : '');
        });
      }
      PropertiesService.getDocumentProperties().setProperty(SHOP_ORDERS.BUNDLE_URLS, JSON.stringify(known));
    } catch (e) { setStatus_('SHOP_BUNDLES', '✗ لينك الباندل: ' + errText_(e)); }
  }
  if (n) setStatus_('SHOP_BUNDLES', '✓ ' + n + ' أوردر' + (need.length > n ? '، والباقي في التحديث الجاي' : ''));
  return n;
}
