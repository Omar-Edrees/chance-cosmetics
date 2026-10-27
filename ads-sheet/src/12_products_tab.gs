/* ---------- Units sold from Shopify line items "Title x2 | Title2 x1" ---------- */
function lineItems_(raw) {
  return String(raw || '').split(/\s\|\s|\r?\n/).map(s => s.trim()).filter(Boolean).map(s => {
    const m = s.match(/^(.*?)\s+x\s*(\d+)\s*$/i);
    return m ? { title: m[1].trim(), qty: Number(m[2]) } : { title: s, qty: 1 };
  });
}
function productNameOf_(title) {
  const n = norm_(title), p = products_().find(x => norm_(x.name) === n || x.aliases.indexOf(n) >= 0);
  return p ? p.name : String(title).trim();
}

/* ---------- Tab: المنتجات ---------- */
const XP_HEADERS = ['شغال', 'المنتج', 'الستوك', 'الستوك يكفي كام يوم', 'قطع اتباعت', 'أوردرات فيها المنتج', 'الصرف',
  'منه مش متأكد', 'أوردرات (المنتج أول قطعة)', 'تكلفة الأوردر + الضريبة', 'المبيعات', 'ROAS الفعلي', 'AOV',
  'نقطة التعادل', 'الإشارة', 'إعلانات Meta شغالة', 'ملاحظة'];

function writeProductsTab_() {
  const sh = ensureTab_(X.PRODUCTS);
  sh.getRange('A1:A3').setValues([['المنتجات — من الأكتر مبيعًا للأقل'], ['من'], ['إلى']]);
  sh.getRange('A1').setFontWeight('bold').setFontSize(13);
  sh.getRange('B2:B3').setNumberFormat('@').setBackground('#fff2cc');
  const p = periodFromCells_(sh), today = todayKey_(), week = shiftKey_(today, -6);
  const daily = dailyRows_(), sum = summarize_(daily, p.from, p.to), tkRecent = {};
  daily.forEach(r => { if (r[1] === 'TIKTOK' && r[0] >= shiftKey_(today, -1) && num_(r[3]) > 0) tkRecent[r[2]] = true; });
  const st = readStock_(), active = activeMap_(), prods = products_(), lowDays = cfgNum_('stock.low_days') || 7;

  // Units and orders per product from Orders Raw.
  const units = {}, ordersWith = {}, units7 = {};
  const osh = ss_().getSheetByName(APP.T.ORDERS);
  if (osh) readRows_(osh, ORDERS_HEADERS.length).forEach(o => {
    const d = asKey_(o[2]);
    if (!d) return;
    const seen = new Set();
    lineItems_(o[6]).forEach(li => {
      const n = productNameOf_(li.title);
      if (d >= p.from && d <= p.to) { units[n] = (units[n] || 0) + li.qty; if (!seen.has(n)) { ordersWith[n] = (ordersWith[n] || 0) + 1; seen.add(n); } }
      if (d >= week && d <= today) units7[n] = (units7[n] || 0) + li.qty;
    });
  });

  // Stock per product name (by handle → Products slug, else title).
  const stockOf = {};
  Object.keys(st.byHandle).forEach(h => {
    const s = st.byHandle[h], pr = prods.find(x => x.slugs.indexOf(h) >= 0), n = pr ? pr.name : productNameOf_(s.title);
    stockOf[n] = (stockOf[n] || 0) + s.stock;
  });

  const special = [APP.MULTI, APP.UNMAPPED, APP.UNKNOWN_PRODUCT];
  const names = new Set(prods.map(x => x.name).concat(Object.keys(units), Object.keys(stockOf),
    Object.keys(sum.byProduct).filter(n => special.indexOf(n) < 0)));
  const z = { spend: 0, notExact: 0, orders: 0, revenue: 0 };
  const rows = Array.from(names).filter(n => special.indexOf(n) < 0).map(n => {
    const t = sum.byProduct[n] || z, pr = prods.find(x => x.name === n), be = breakEven_(pr), miss = missingFor_(pr);
    const running = (active[n] || 0) > 0 || !!tkRecent[n];
    const stock = stockOf[n] === undefined ? '' : stockOf[n], perDay = (units7[n] || 0) / 7;
    let days = '';
    if (stock !== '') days = stock <= 0 ? 'نفد' : perDay > 0 ? Math.floor(stock / perDay) : '—';
    const notes = [];
    if (stock === '') notes.push('مش لاقي ستوك');
    else if (days === 'نفد') notes.push('⛔ الستوك خلص');
    else if (typeof days === 'number' && days < lowDays) notes.push('⚠️ الستوك قليل');
    if (running && stock !== '' && stock <= 0) notes.push('إعلان شغال على منتج خلص');
    if (miss.length) notes.push('ناقص: ' + miss.join('، '));
    return [running ? '✅' : '', n, stock, days, units[n] || 0, ordersWith[n] || 0, round2_(t.spend), round2_(t.notExact), t.orders,
      cpp_(t), round2_(t.revenue), roas_(t), aov_(t), be === null ? '' : round2_(be), signal_(be, t), active[n] || '', notes.join(' — ')];
  }).sort((a, b) => (b[4] - a[4]) || (b[6] - a[6]));
  special.forEach(n => {
    const t = sum.byProduct[n];
    if (t && (t.spend > 0 || t.orders > 0)) rows.push([(active[n] || 0) > 0 ? '✅' : '', n, '', '', '', '', round2_(t.spend), round2_(t.notExact),
      t.orders, '', round2_(t.revenue), '', '', '', '', active[n] || '', '']);
  });
  sh.getRange('C2:D3').setValues([['الستوك', st.error ? '✗ ' + st.error : '✓ ' + Object.keys(st.byHandle).length + ' منتج'],
    ['الإعلانات الشغالة', getStatus_('ACTIVE')]]);
  writeBlocks_(sh, 5, [{ title: 'المنتجات من ' + p.from + ' لـ ' + p.to + ' (✅ = عليه إعلان شغال دلوقتي)', headers: XP_HEADERS, rows: rows }], XP_HEADERS.length);
  const n = Math.max(rows.length, 1), colA = sh.getRange(7, 1, n, 1), colD = sh.getRange(7, 4, n, 1);
  sh.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('✅').setBackground('#b7e1cd').setRanges([colA]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('نفد').setBackground('#f4c7c3').setRanges([colD]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenNumberLessThan(lowDays).setBackground('#fff4ce').setRanges([colD]).build()
  ]);
  sh.setFrozenRows(6);
}
