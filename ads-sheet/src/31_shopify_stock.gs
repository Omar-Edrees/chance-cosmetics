/*
 * Live stock from the Shopify app (read_products + read_inventory), every STOCK_APP.EVERY_MIN minutes in the update and from 📦.
 * Every variant → the hidden tab "Shopify Stock" (one row per variant). A read goes page by page (250 variants a page); if the
 * update runs out of time, the next one goes on from the saved page. When a read ends, variants it didn't see (deleted) go.
 * stockByName_ (10_stock.gs) reads the tab, so onEdit (no permission to call Shopify) shows the last read too.
 * Products that don't track stock in Shopify are left out: their stock means nothing.
 */
const STOCK_APP = {
  TAB: 'Shopify Stock', HEADERS: ['Variant ID', 'Handle', 'Product', 'Stock', 'Read'], EVERY_MIN: 30, PAGES: 40,
  CURSOR: 'STOCK_APP_CURSOR', READ: 'STOCK_APP_READ', DONE: 'STOCK_APP_DONE', AT: 'STOCK_APP_AT',
  QUERY: 'query($after:String){productVariants(first:250,after:$after){pageInfo{hasNextPage endCursor} ' +
    'nodes{id inventoryQuantity product{handle title tracksInventory}}}}'
};

/* force = read now even if the last read is fresh (📦). Returns the variants read in this run. Errors go to Health. */
function syncShopifyStock_(force) {
  if (!shopifyProps_().getProperty('SHOPIFY_TOKEN')) return 0;
  const props = PropertiesService.getDocumentProperties(), now = Date.now();
  let after = props.getProperty(STOCK_APP.CURSOR) || null, read = props.getProperty(STOCK_APP.READ) || '';
  if (!after && !force && now - Number(props.getProperty(STOCK_APP.DONE) || 0) < STOCK_APP.EVERY_MIN * 60000) return 0;
  if (!after || force) { after = null; read = String(now); }
  const rows = [];
  let more = true, pages = 0;
  try {
    while (more && pages < STOCK_APP.PAGES && timeLeft_()) {
      const res = shopifyGql_(STOCK_APP.QUERY, { after: after }).productVariants;
      res.nodes.forEach(v => {
        const p = v.product || {};
        if (p.tracksInventory === false || !p.handle) return;
        rows.push([v.id, String(p.handle).toLowerCase(), p.title || '', num_(v.inventoryQuantity), read]);
      });
      more = res.pageInfo.hasNextPage; after = res.pageInfo.endCursor; pages++;
    }
  } catch (e) {
    setStatus_('STOCK_APP', '✗ ' + errText_(e) + (props.getProperty(STOCK_APP.AT) ? ' — الشيت شغال بآخر ستوك اتقرا ' + props.getProperty(STOCK_APP.AT) : ''));
    if (!rows.length) return 0;
    more = true;
  }
  withLock_(() => shopifyMergeStock_(rows, more ? '' : read));
  if (more) {
    props.setProperties({ [STOCK_APP.CURSOR]: after || '', [STOCK_APP.READ]: read });
    setStatus_('STOCK_APP', '… ' + rows.length + ' نوع اتقرا، والباقي في التحديث الجاي');
  } else {
    props.deleteProperty(STOCK_APP.CURSOR);
    props.setProperties({ [STOCK_APP.READ]: read, [STOCK_APP.DONE]: String(Date.now()), [STOCK_APP.AT]: nowText_() });
    setStatus_('STOCK_APP', '✓ ' + Object.keys(appStock_().byHandle).length + ' منتج');
  }
  return rows.length;
}
/* New rows win by variant. done = the read that just ended: rows from older reads (variants Shopify doesn't have any more) go. */
function shopifyMergeStock_(rows, done) {
  const sh = ensureTab_(STOCK_APP.TAB, STOCK_APP.HEADERS), all = new Map();
  readRows_(sh, STOCK_APP.HEADERS.length).forEach(r => all.set(String(r[0]), r));
  rows.forEach(r => all.set(String(r[0]), r));
  const out = Array.from(all.values()).filter(r => !done || String(r[4]) === done)
    .sort((a, b) => (String(a[1]) < String(b[1]) ? -1 : String(a[1]) > String(b[1]) ? 1 : 0));
  writeRows_(sh, out, STOCK_APP.HEADERS.length, [1, 2, 5]);
  try { sh.hideSheet(); } catch (e) { /* مش مهم */ }
  STOCK_APP_ = null;
}

let STOCK_APP_ = null;
/* {byHandle: {handle: {title, stock}}, at}: the stock per product from the tab (every color together, below zero = 0). */
function appStock_() {
  if (STOCK_APP_) return STOCK_APP_;
  const out = { byHandle: {}, at: PropertiesService.getDocumentProperties().getProperty(STOCK_APP.AT) || '' };
  const sh = ss_().getSheetByName(STOCK_APP.TAB);
  if (sh && out.at) readRows_(sh, STOCK_APP.HEADERS.length).forEach(r => {
    const h = String(r[1]).trim().toLowerCase();
    if (!h) return;
    const p = out.byHandle[h] = out.byHandle[h] || { title: '', stock: 0 };
    p.stock += Math.max(num_(r[3]), 0);
    if (r[2]) p.title = String(r[2]).trim();
  });
  STOCK_APP_ = out;
  return out;
}
