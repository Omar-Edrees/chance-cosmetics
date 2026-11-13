/* Stock per product (the Shopify app first: 31_shopify_stock.gs), the old Flow stock tab as a fallback, and new products → Products tab. */

let STOCK_ = null;
function readStock_() {
  if (STOCK_) return STOCK_;
  const out = { byHandle: {}, rows: 0, error: '' };
  try {
    const url = cfgStr_('stock.sheet_url') || cfgStr_('orders.sheet_url');
    const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if (!m) throw new Error('لينك شيت الستوك ناقص');
    const book = SpreadsheetApp.openById(m[1]);
    const variants = new Map();
    const put = (handle, title, variant, stock, price) => {
      handle = String(handle || '').trim().toLowerCase();
      if (!handle) return;
      variants.set(handle + '|' + norm_(variant || 'Default Title'), { handle: handle, title: String(title || '').trim(),
        stock: num_(stock), price: price === '' || price === null ? null : num_(price) });
    };
    // 1) Optional one-time Shopify products export (Products → Export → CSV, pasted as is).
    const init = book.getSheetByName(cfgStr_('stock.init_tab'));
    if (init && init.getLastRow() >= 2) {
      const v = init.getDataRange().getValues(), h = v[0].map(x => String(x).trim()), c = k => h.indexOf(k);
      const iH = c('Handle'), iT = c('Title'), iQ = c('Variant Inventory Qty'), iP = c('Variant Price');
      const opts = ['Option1 Value', 'Option2 Value', 'Option3 Value'].map(c);
      let lastTitle = {};
      v.slice(1).forEach(r => {
        const handle = iH >= 0 ? r[iH] : '';
        if (iT >= 0 && r[iT]) lastTitle[handle] = r[iT];
        if (iQ < 0 || r[iQ] === '') return;
        const variant = opts.filter(i => i >= 0 && r[i] !== '').map(i => String(r[i]).trim()).join(' / ');
        put(handle, lastTitle[handle] || '', variant, r[iQ], iP >= 0 ? r[iP] : '');
        out.rows++;
      });
    }
    // 2) Flow rows (newer rows win): Product ID | Variant ID | Product | Variant | SKU | Handle | Stock | Price
    const sh = book.getSheetByName(cfgStr_('stock.sheet_tab'));
    if (sh && sh.getLastRow() >= 2) {
      const v = sh.getDataRange().getValues(), h = v[0].map(x => String(x).trim()), c = k => h.indexOf(k);
      const iH = c('Handle'), iT = c('Product'), iV = c('Variant'), iQ = c('Stock'), iP = c('Price');
      if (iH < 0 || iQ < 0) throw new Error('تاب الستوك ناقص فيه عمود Handle أو Stock');
      v.slice(1).forEach(r => { put(r[iH], iT >= 0 ? r[iT] : '', iV >= 0 ? r[iV] : '', r[iQ], iP >= 0 ? r[iP] : ''); out.rows++; });
    }
    variants.forEach(x => {
      const p = out.byHandle[x.handle] = out.byHandle[x.handle] || { handle: x.handle, title: x.title, stock: 0, price: null };
      p.stock += Math.max(x.stock, 0);
      if (x.title) p.title = x.title;
      if (p.price === null && x.price) p.price = x.price;
    });
  } catch (e) { out.error = errText_(e); }
  STOCK_ = out;
  return out;
}

/*
 * Stock per product name: {by, status, at}. The Shopify app (31_shopify_stock.gs) wins: live stock of every product, read every
 * half hour, and then nothing else is used. Without it (not connected yet), the Flow stock tab, then the stock read once
 * from Shopify (23_stock_snapshot.gs). The Flow part is saved after each good read, because changing a period cell runs in
 * onEdit, which can't open the stock sheet: then the last read is used.
 */
function stockByName_() {
  const app = appStock_(), useApp = Object.keys(app.byHandle).length > 0;
  // The app has the stock: the Flow sheet isn't opened at all.
  const st = useApp ? { byHandle: {}, rows: 0, error: '' } : readStock_(), props = PropertiesService.getDocumentProperties(), n = Number(props.getProperty('STOCK_SNAP_N') || 0);
  let saved = '', flow = {};
  for (let i = 0; i < n; i++) saved += props.getProperty('STOCK_SNAP_' + i) || '';
  const prods = products_(), nameOf = (h, title) => { const pr = prods.find(p => p.slugs.indexOf(h) >= 0); return pr ? pr.name : productNameOf_(title); };
  if (useApp) {
    // nothing from the Flow sheet
  } else if (st.error) {
    try { flow = saved ? JSON.parse(saved) : {}; } catch (e) { flow = {}; }
  } else {
    Object.keys(st.byHandle).forEach(h => {
      const x = st.byHandle[h], name = nameOf(h, x.title);
      flow[name] = (flow[name] || 0) + x.stock;
    });
    // Values are capped at 9KB each: save in parts.
    const json = JSON.stringify(flow), parts = [];
    if (json !== saved) {
      for (let i = 0; i < json.length; i += 2000) parts.push(json.slice(i, i + 2000));
      parts.forEach((x, i) => props.setProperty('STOCK_SNAP_' + i, x));
      for (let i = parts.length; i < n; i++) props.deleteProperty('STOCK_SNAP_' + i);
      props.setProperty('STOCK_SNAP_N', String(parts.length));
    }
    props.setProperty('STOCK_SNAP_AT', nowText_());
  }
  const live = {};
  Object.keys(app.byHandle).forEach(h => { const x = app.byHandle[h], name = nameOf(h, x.title); live[name] = (live[name] || 0) + x.stock; });
  // The app reads every product Shopify has: the Oct-29 snapshot isn't used at all then (a product it doesn't have = no stock).
  const by = {}, snap = useApp ? {} : stockSnapshot_();
  Object.keys(snap).forEach(t => { const name = productNameOf_(t); by[name] = (by[name] || 0) + snap[t]; });
  Object.keys(flow).forEach(name => { by[name] = flow[name]; });
  Object.keys(live).forEach(name => { by[name] = live[name]; });
  const a = Object.keys(live).length, k = Object.keys(flow).length, fixed = 'ستوك ثابت من شوبيفاي لحد ' + STOCK_SNAPSHOT_AT;
  if (a) return { by: by, at: app.at, status: '✓ ستوك حي من أبليكيشن شوبيفاي: ' + a + ' منتج، آخر قراية ' + app.at };
  const status = k ? '✓ ' + k + ' منتج من فلو الستوك' + (st.error ? ' (آخر قراية ' + props.getProperty('STOCK_SNAP_AT') + ')' : '') + '، والباقي ' + fixed
    : '⚠️ ' + fixed + ' — مابيتحدثش لوحده' + (st.error ? ' (' + st.error + ')' : ' (مفيش صفوف في تاب ' + cfgStr_('stock.sheet_tab') + ')');
  return { by: by, at: k && !st.error ? nowText_() : k ? props.getProperty('STOCK_SNAP_AT') : STOCK_SNAPSHOT_AT.slice(0, 16) + ' (ثابت)', status: status };
}

/* New handles in the Flow stock tab → new rows in Products (never edits existing rows). Not used once the app has the stock. */
function autoAddProducts_() {
  if (!cfgBool_('products.auto_add')) return 0;
  // With the Shopify app the Flow sheet isn't read, and the app's 2000+ products don't go to Products: a product gets there
  // from its ad's landing page (04_admap.gs), so Products stays the products that matter.
  if (Object.keys(appStock_().byHandle).length) { setStatus_('STOCK', '✓ الستوك من أبليكيشن شوبيفاي، والمنتجات بتتضاف من لينكات الإعلانات'); return 0; }
  const st = readStock_();
  if (st.error) { setStatus_('STOCK', '✗ ' + st.error); return 0; }
  setStatus_('STOCK', st.rows ? '✓ ' + Object.keys(st.byHandle).length + ' منتج' : '⚠️ مفيش صفوف في تاب ' + cfgStr_('stock.sheet_tab') + ' — الستوك ثابت من شوبيفاي لحد ' + STOCK_SNAPSHOT_AT);
  return withLock_(() => {
    const sh = ensureTab_(APP.T.PRODUCTS, PRODUCT_HEADERS), have = readRows_(sh, PRODUCT_HEADERS.length);
    const slugs = new Set(), names = new Set();
    have.forEach(r => { String(r[2]).split(',').forEach(s => slugs.add(s.trim().toLowerCase())); names.add(norm_(r[0])); });
    const add = Object.keys(st.byHandle).map(k => st.byHandle[k])
      .filter(p => p.title && !slugs.has(p.handle) && !names.has(norm_(p.title)))
      .map(p => [p.title, '', p.handle, '', p.title, p.price === null ? '' : p.price, '', '', '', '', '', true]);
    if (add.length) sh.getRange(sh.getLastRow() + 1, 1, add.length, PRODUCT_HEADERS.length).setValues(add);
    resetCaches_();
    return add.length;
  });
}
