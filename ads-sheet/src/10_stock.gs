/* Stock from the Shopify Flow stock tab (+ optional one-time product export), and new products → Products tab. Read-only on Shopify. */

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
 * Stock per product name: {by, status}. The Flow stock tab wins product by product; any other product takes the stock read
 * once from Shopify (23_stock_snapshot.gs) until the Flow / the Shopify app covers it. The Flow part is saved after each good
 * read, because changing a period cell runs in onEdit, which can't open the stock sheet: then the last read is used.
 */
function stockByName_() {
  const st = readStock_(), props = PropertiesService.getDocumentProperties(), n = Number(props.getProperty('STOCK_SNAP_N') || 0);
  let saved = '', flow = {};
  for (let i = 0; i < n; i++) saved += props.getProperty('STOCK_SNAP_' + i) || '';
  if (st.error) {
    try { flow = saved ? JSON.parse(saved) : {}; } catch (e) { flow = {}; }
  } else {
    const prods = products_();
    Object.keys(st.byHandle).forEach(h => {
      const x = st.byHandle[h], pr = prods.find(p => p.slugs.indexOf(h) >= 0), name = pr ? pr.name : productNameOf_(x.title);
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
  const by = {}, snap = stockSnapshot_();
  Object.keys(snap).forEach(t => { const name = productNameOf_(t); by[name] = (by[name] || 0) + snap[t]; });
  Object.keys(flow).forEach(name => { by[name] = flow[name]; });
  const k = Object.keys(flow).length, fixed = 'ستوك ثابت من شوبيفاي لحد ' + STOCK_SNAPSHOT_AT;
  const status = k ? '✓ ' + k + ' منتج من فلو الستوك' + (st.error ? ' (آخر قراية ' + props.getProperty('STOCK_SNAP_AT') + ')' : '') + '، والباقي ' + fixed
    : '⚠️ ' + fixed + ' — مابيتحدثش لوحده' + (st.error ? ' (' + st.error + ')' : ' (مفيش صفوف في تاب ' + cfgStr_('stock.sheet_tab') + ')');
  return { by: by, status: status };
}

/* New stock handles → new rows in Products (never edits existing rows). */
function autoAddProducts_() {
  if (!cfgBool_('products.auto_add')) return 0;
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
