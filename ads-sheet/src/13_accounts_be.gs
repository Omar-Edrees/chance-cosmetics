/* ---------- Tab: تعادل الحسابات ---------- */
function beRoas_(aov) {
  const manual = cfgNum_('be.roas');
  if (manual) return { v: manual, src: 'مكتوبة يدوي في Settings' };
  const cogs = cfgNum_('costs.cogs_pct'), ship = cfgNum_('costs.shipping'), other = cfgNum_('costs.other') || 0;
  const c = cfgNum_('rates.confirm'), d = cfgNum_('rates.delivery');
  if (cogs === null || ship === null || c === null || d === null || !aov) return { v: null, src: 'ناقص: be.roas أو (costs.cogs_pct + costs.shipping + rates.confirm + rates.delivery)' };
  const profit = c * (d * aov * (1 - cogs) - ship - other);
  if (profit <= 0) return { v: null, src: 'خسران حتى من غير إعلانات بالتكاليف دي' };
  return { v: round2_(aov * (1 + taxRate_()) / profit), src: 'محسوبة من التكاليف ومتوسط الأوردر' };
}

function writeAccountsBE_() {
  const sh = ensureTab_(X.ACC_BE);
  sh.getRange('A1:A2').setValues([['تعادل كل حساب يوم بيوم'], ['الشهر (yyyy-MM)']]);
  sh.getRange('A1').setFontWeight('bold').setFontSize(13);
  sh.getRange('B2').setNumberFormat('@').setBackground('#fff2cc');
  let month = String(sh.getRange('B2').getDisplayValue() || '').trim();
  if (!/^\d{4}-\d{2}$/.test(month)) { month = todayKey_().slice(0, 7); sh.getRange('B2').setValue(month); }
  const pm = month.split('-').map(Number), days = new Date(Date.UTC(pm[0], pm[1], 0)).getUTCDate();
  const from = month + '-01', to = month + '-' + String(days).padStart(2, '0'), tax = taxRate_();

  // Accounts: Accounts tab + anything that spent.
  const accs = new Map();
  accounts_().forEach(a => accs.set(a.platform + '|' + a.id, { key: a.platform + '|' + a.id, platform: a.platform, name: a.name || a.id, purpose: a.purpose }));
  const cell = {}, add = (k, d, f, v) => { const c = cell[k + '|' + d] = cell[k + '|' + d] || { spend: 0, pixel: 0, pval: 0, orders: 0, revenue: 0 }; c[f] += v; };
  rawRows_(APP.T.ADS, ADS_HEADERS.length).forEach(a => {
    const d = asKey_(a[0]);
    if (d < from || d > to) return;
    const k = a[1] + '|' + String(a[2]);
    if (!accs.has(k)) accs.set(k, { key: k, platform: a[1], name: a[3] || a[2], purpose: '' });
    add(k, d, 'spend', num_(a[10])); add(k, d, 'pixel', num_(a[13])); add(k, d, 'pval', num_(a[14]));
  });
  // Orders → account: Ad ID in UTM (exact) → Ad Map account; else the only account of that platform; else "مش معروف الحساب".
  const adAcc = {}, am = ss_().getSheetByName(APP.T.ADMAP);
  if (am) rawRows_(APP.T.ADMAP, ADMAP_HEADERS.length).forEach(r => { if (r[AM.ID]) adAcc[String(r[AM.ID])] = r[AM.PLAT] + '|' + String(r[AM.ACC]); });
  const byPlat = {};
  accs.forEach(a => { (byPlat[a.platform] = byPlat[a.platform] || []).push(a.key); });
  let storeOrders = 0, storeRev = 0, attributed = 0;
  const osh = ss_().getSheetByName(APP.T.ORDERS);
  if (osh) rawRows_(APP.T.ORDERS, ORDERS_HEADERS.length).forEach(o => {
    const d = asKey_(o[2]);
    if (d < from || d > to) return;
    storeOrders++; storeRev += num_(o[7]);
    let k = o[14] ? adAcc[String(o[14])] : '';
    if (!k && byPlat[o[3]] && byPlat[o[3]].length === 1) k = byPlat[o[3]][0];
    if (!k && (o[3] === 'META' || o[3] === 'TIKTOK')) k = o[3] + '|?';
    if (!k) return;
    if (!accs.has(k)) accs.set(k, { key: k, platform: o[3], name: o[3] + ' — مش معروف الحساب', purpose: '' });
    attributed++;
    add(k, d, 'orders', 1); add(k, d, 'revenue', num_(o[7]));
  });

  const tot = (k, a, b) => {
    const t = { spend: 0, pixel: 0, pval: 0, orders: 0, revenue: 0 };
    for (let d = a; d <= b; d++) {
      const c = cell[k + '|' + month + '-' + String(d).padStart(2, '0')];
      if (c) Object.keys(t).forEach(f => { t[f] += c[f]; });
    }
    return t;
  };
  const be = beRoas_(storeOrders ? storeRev / storeOrders : 0);
  const line = (label, t, useReal) => {
    const pr = t.spend ? round2_(t.pval / t.spend) : '', rr = t.spend ? round2_(t.revenue / t.spend) : '';
    const roas = useReal ? rr : pr;
    let status = '';
    if (t.spend > 0) status = be.v === null ? 'ناقص نقطة التعادل' : roas === '' ? '' :
      roas >= be.v ? '✅ فوق التعادل' : roas >= be.v * 0.8 ? '⚠️ قريب من التعادل' : '🔻 تحت التعادل';
    if (status && !useReal) status += ' (بيكسل)';
    return [label, round2_(t.spend), round2_(t.spend * (1 + tax)), t.pixel, pr, t.orders, round2_(t.revenue), rr,
      t.orders ? round2_(t.revenue / t.orders) : '', t.orders ? round2_(t.spend * (1 + tax) / t.orders) : '', be.v === null ? '' : be.v, status];
  };
  const H = ['اليوم', 'الصرف', 'الصرف + الضريبة', 'مشتريات البيكسل', 'Meta ROAS', 'أوردرات الموقع (UTM)', 'مبيعات (UTM)',
    'Shopify ROAS', 'AOV', 'تكلفة الأوردر + الضريبة', 'نقطة التعادل ROAS', 'الحالة'];
  const list = Array.from(accs.values()).sort((a, b) => tot(b.key, 1, days).spend - tot(a.key, 1, days).spend);
  const summary = list.map(a => {
    const t = tot(a.key, 1, days);
    return line(a.name + (a.purpose ? ' — ' + a.purpose : ''), t, t.orders > 0);
  });
  const all = { spend: 0, pixel: 0, pval: 0, orders: storeOrders, revenue: storeRev };
  list.forEach(a => { const t = tot(a.key, 1, days); all.spend += t.spend; all.pixel += t.pixel; all.pval += t.pval; });
  summary.push(line('المتجر كله (كل الأوردرات)', all, true));
  const blocks = [
    { title: 'نقطة التعادل: ' + (be.v === null ? '—' : be.v) + '  (' + be.src + ')  |  أوردرات الشهر المربوطة بحساب: ' + attributed + ' من ' + storeOrders +
      (storeOrders ? ' (' + Math.round(attributed / storeOrders * 100) + '%)' : ''), headers: null, rows: [] },
    { title: 'ملخص الشهر لكل حساب', headers: ['الحساب'].concat(H.slice(1)), rows: summary }
  ];
  const weeks = [[1, 7], [8, 14], [15, 21], [22, 28], [29, days]];
  list.forEach(a => {
    if (tot(a.key, 1, days).spend <= 0 && tot(a.key, 1, days).orders <= 0) return;
    const useReal = tot(a.key, 1, days).orders > 0, rows = [];
    weeks.forEach((w, i) => {
      if (w[0] > days) return;
      for (let d = w[0]; d <= w[1]; d++) rows.push(line(month + '-' + String(d).padStart(2, '0'), tot(a.key, d, d), useReal));
      rows.push(line('إجمالي الأسبوع ' + (i + 1), tot(a.key, w[0], w[1]), useReal));
    });
    rows.push(line('إجمالي الشهر', tot(a.key, 1, days), useReal));
    blocks.push({ title: a.name + (useReal ? '' : ' — مفيش أوردرات مربوطة بالحساب ده لسه، الحالة من البيكسل'), headers: H, rows: rows });
  });
  writeBlocks_(sh, 4, blocks, H.length);
  const lr = Math.max(sh.getLastRow() - 3, 1), stCol = sh.getRange(4, 12, lr, 1);
  sh.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenTextStartsWith('✅').setBackground('#e6f4ea').setRanges([stCol]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextStartsWith('⚠️').setBackground('#fff4ce').setRanges([stCol]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextStartsWith('🔻').setBackground('#fce8e6').setRanges([stCol]).build()
  ]);
}
