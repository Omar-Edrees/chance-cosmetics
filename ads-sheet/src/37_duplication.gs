/*
 * Tab "Duplication": the orders each platform says it brought (Meta pixel purchases, TikTok complete payments: Ads Raw)
 * against the store orders Shopify has for it, in a period chosen in B2 (today by default).
 *  - Shopify for Meta = META TOTAL in Today: our Meta ads' orders by UTM + DIRECT (orders with no source, most likely ads).
 *    MANUAL (draft), BIO (link in bio) and GOOGLE (Google search), both sure organic, and the outside account's orders aren't in it. TikTok = TIKTOK TOTAL.
 *  - One table per platform: a summary line, then the campaigns running now (Meta: an ACTIVE ad now; TikTok: spent today
 *    or yesterday) with a + to open their ad sets and a + on each ad set to open its ads (like Meta Campaigns), then the
 *    stopped campaigns that had spend or orders in the period under one + of their own.
 *  - A row: spend, the platform's orders, Shopify orders by UTM (exact: the order's ad, else its ad set (utm_term), else
 *    its campaign (utm_id, else the campaign's name in the UTM)), DIRECT orders shared out (an estimate), the Shopify total,
 *    the gap (platform − Shopify) and the duplication = gap ÷ Shopify. The order's ad is Orders Raw's Ad ID, else an ad ID
 *    in utm_content.
 *  - DIRECT, estimate: each order goes to the Meta ads that spent on its product that day, by their spend; when none did,
 *    to every Meta ad that spent that day; when no Meta ad spent that day, it stays in a row of its own.
 * What's open stays open when the tab is drawn again. Everything is read from the sheet's own tabs: nothing from Meta here.
 */
const DUP = {
  TAB: 'Duplication', GROUPS: 'DUP_GROUPS', HIGH: 0.2,
  PERIODS: ['النهارده', 'إمبارح', 'آخر 3 أيام', 'آخر 7 أيام', 'الشهر ده', 'الشهر اللي فات'],
  HEADERS: ['الكامبين / الأد سيت / الإعلان', 'الحساب', 'الحالة', 'الصرف', 'أوردرات المنصة', 'أوردرات شوبيفاي (UTM)',
    '+ من غير مصدر (تقديري)', 'أوردرات شوبيفاي (الإجمالي)', 'الفرق (المنصة − شوبيفاي)', 'نسبة الدوبليكيشن']
};

/* The period chosen in B2 → {from, to}. */
function dupPeriod_(choice) {
  const t = todayKey_(), m = t.slice(0, 8) + '01', y = shiftKey_(t, -1), e = shiftKey_(m, -1);
  return choice === DUP.PERIODS[1] ? { from: y, to: y } : choice === DUP.PERIODS[2] ? { from: shiftKey_(t, -2), to: t }
    : choice === DUP.PERIODS[3] ? { from: shiftKey_(t, -6), to: t } : choice === DUP.PERIODS[4] ? { from: m, to: t }
      : choice === DUP.PERIODS[5] ? { from: e.slice(0, 8) + '01', to: e } : { from: t, to: t };
}

function dupZero_() { return { spend: 0, pixel: 0, utm: 0, direct: 0 }; }

/*
 * Both platforms for the period: {META, TIKTOK}, each {camps: [campaign nodes], all: sums, utmLost, directLost}.
 * A node: {key, level, id, name, acc, kids, t: its own sums, sum: with its kids, on: running now}.
 */
function dupData_(from, to) {
  const today = todayKey_(), yest = shiftKey_(today, -1), back = shiftKey_(today, -60), P = {};
  ['META', 'TIKTOK'].forEach(p => { P[p] = { camps: new Map(), sets: new Map(), ads: new Map(), byName: new Map(), utmLost: 0, directLost: 0, tt: new Set() }; });
  const rows = ss_().getSheetByName(APP.T.ADS) ? recentRows_(APP.T.ADS, ADS_HEADERS.length, 1, asKey_, from < back ? from : back) : [];
  // Names and parents of every ad, ad set and campaign seen lately (the newest row first, so its names win).
  const adRow = new Map(), setRow = new Map(), campRow = new Map();
  rows.forEach(a => {
    const p = a[1], k = p + '|';
    if (!P[p]) return;
    if (a[8] && !adRow.has(k + a[8])) adRow.set(k + a[8], a);
    if (a[6] && !setRow.has(k + a[6])) setRow.set(k + a[6], a);
    if (a[4] && !campRow.has(k + a[4])) { campRow.set(k + a[4], a); if (a[5] && !P[p].byName.has(norm_(a[5]))) P[p].byName.set(norm_(a[5]), String(a[4])); }
    if (p === 'TIKTOK' && num_(a[10]) > 0 && asKey_(a[0]) >= yest) P[p].tt.add(String(a[8]));
  });
  const make = (pl, map, level, id, name, acc, parent) => {
    let n = map.get(id);
    if (!n) {
      n = { key: level + '|' + id, level: level, id: id, name: name || id, acc: acc, kids: [], t: dupZero_() };
      map.set(id, n);
      if (parent) parent.kids.push(n);
    }
    return n;
  };
  const camp = (p, id) => { const a = campRow.get(p + '|' + id) || []; return make(P[p], P[p].camps, 'campaign', id, String(a[5] || ''), String(a[2] || ''), null); };
  const set = (p, id) => { const a = setRow.get(p + '|' + id) || []; return make(P[p], P[p].sets, 'adset', id, String(a[7] || ''), '', camp(p, String(a[4] || ''))); };
  const ad = (p, id) => {
    const a = adRow.get(p + '|' + id) || [];
    return make(P[p], P[p].ads, 'ad', id, String(a[9] || ''), '', a[6] ? set(p, String(a[6])) : camp(p, String(a[4] || '')));
  };

  // Spend and the platform's orders, per ad; and which Meta ads spent on which product each day (for DIRECT).
  const idx = adMapIndex_(), catAds = catalogAdIds_(), dayAds = {};
  rows.forEach(a => {
    const d = asKey_(a[0]), p = a[1], spend = num_(a[10]), pix = num_(a[13]);
    if (!P[p] || !a[8] || !a[4] || d < from || d > to || (!spend && !pix)) return;
    const n = ad(p, String(a[8]));
    n.t.spend += spend; n.t.pixel += pix;
    if (p !== 'META' || !(spend > 0)) return;
    const m = catAds.has('META|' + a[8]) ? { product: APP.CATALOG } : idx.get(adKey_('META', String(a[8]), a[5], a[7], a[9]));
    (dayAds[d] = dayAds[d] || []).push({ n: n, spend: spend, product: m ? m.product : '' });
  });

  // Shopify orders.
  const directs = [];
  if (ss_().getSheetByName(APP.T.ORDERS)) {
    const known = metaIdsOf_();
    recentRows_(APP.T.ORDERS, ORDERS_HEADERS.length, 2, sortKey_, from).forEach(o => {
      const d = asKey_(o[2]), p = o[3];
      if (!d || d < from || d > to) return;
      if (p === APP.DIRECT) { directs.push({ d: d, product: String(o[5] || '') }); return; }
      if (!P[p] || (p === 'META' && outsideMeta_(o, known))) return;
      const k = p + '|', u = String(o[13] || '').trim(), a = String(o[14] || '') || (adRow.has(k + u) ? u : ''), s = String(o[17] || ''), c = String(o[16] || '');
      const byName = P[p].byName.get(norm_(o[12])) || P[p].byName.get(norm_(o[11]));
      const n = a && adRow.has(k + a) ? ad(p, a) : s && setRow.has(k + s) ? set(p, s) : c && campRow.has(k + c) ? camp(p, c) : byName ? camp(p, byName) : null;
      if (n) n.t.utm++; else P[p].utmLost++;
    });
  }
  directs.forEach(x => {
    const list = dayAds[x.d] || [], same = list.filter(y => y.product && y.product === x.product), use = same.length ? same : list;
    const tot = use.reduce((s, y) => s + y.spend, 0);
    if (!(tot > 0)) { P.META.directLost++; return; }
    use.forEach(y => { y.n.t.direct += y.spend / tot; });
  });

  // Sums up the tree, running now, and the order: most spend first.
  const on = new Set(propGetBig_(MC.ACTIVE_ADS).split(',').filter(Boolean));
  const out = {};
  Object.keys(P).forEach(p => {
    const pl = P[p];
    const roll = n => {
      const s = Object.assign({}, n.t);
      n.kids.forEach(k => { const x = roll(k); Object.keys(s).forEach(f => { s[f] += x[f]; }); });
      n.sum = s;
      n.on = n.level === 'ad' ? (p === 'META' ? on.has(n.id) : pl.tt.has(n.id)) : n.kids.some(k => k.on);
      n.kids.sort((a, b) => (b.sum.spend - a.sum.spend) || (b.sum.pixel - a.sum.pixel) || (b.sum.utm - a.sum.utm));
      return s;
    };
    const camps = Array.from(pl.camps.values());
    camps.forEach(roll);
    camps.sort((a, b) => (b.sum.spend - a.sum.spend) || (b.sum.pixel - a.sum.pixel) || (b.sum.utm - a.sum.utm));
    const all = dupZero_();
    camps.forEach(c => Object.keys(all).forEach(f => { all[f] += c.sum[f]; }));
    all.utm += pl.utmLost; all.direct += pl.directLost;
    out[p] = { camps: camps, all: all, utmLost: pl.utmLost, directLost: pl.directLost };
  });
  return out;
}

/* EXT.views and B2: draws the tab. */
function writeDupTab_() {
  const sh = ensureTab_(DUP.TAB), W = DUP.HEADERS.length, props = PropertiesService.getDocumentProperties();
  let choice = String(sh.getRange('B2').getValue() || '').trim();
  if (DUP.PERIODS.indexOf(choice) < 0) choice = DUP.PERIODS[0];
  const per = dupPeriod_(choice), data = dupData_(per.from, per.to), accs = accounts_('META').concat(accounts_('TIKTOK'));
  const accName = id => { const a = accs.find(x => String(x.id) === String(id)); return a ? a.name || a.id : id; };
  const g = todayGrid_(), dark = { bg: '#1f2937', fc: '#ffffff', b: 'bold' };
  g.width = W;
  g.set(1, 1, 'DUPLICATION — أوردرات المنصة قدام أوردرات شوبيفاي', dark);
  g.fill(1, 2, W - 1, { bg: '#1f2937' });
  g.merge(1, 1, 1, W);
  g.set(2, 1, 'الفترة', { bg: '#f3f4f6', b: 'bold' });
  g.set(2, 2, choice, { bg: '#fff2cc', b: 'bold', al: 'center' });
  g.set(2, 3, per.from === per.to ? per.from : 'من ' + per.from + ' لـ ' + per.to, { fc: '#374151' });
  g.merge(2, 3, 1, 2);
  g.set(3, 1, 'نسبة الدوبليكيشن = (أوردرات المنصة − أوردرات شوبيفاي) ÷ أوردرات شوبيفاي. 🔴 المنصة بتعد أكتر بـ 20% أو أكتر، 🟡 بتعد أقل بـ 20% أو أكتر. ' +
    'أوردرات شوبيفاي لـ Meta = META TOTAL في Today (بالـ UTM + DIRECT اللي من غير مصدر)، و DIRECT متوزعة تقديري على الإعلانات اللي صرفت على نفس المنتج في نفس اليوم بنسبة صرفها. ' +
    'اضغط + جنب الكامبين تشوف الأد سيتس، و + جنب الأد سيت تشوف الإعلانات.', { fc: '#374151' });
  g.merge(3, 1, 1, W);

  const fmt1 = v => Math.round(v * 10) / 10;
  const cells = (r, s, st, tiktok) => {
    const shop = s.utm + s.direct, gap = s.pixel - shop, dup = shop > 0 ? gap / shop : null;
    const n = (c, v, nf, extra) => g.set(r, c, v, Object.assign({ nf: nf, al: 'center' }, st, extra || {}));
    n(4, Math.round(s.spend), '#,##0');
    n(5, s.pixel, '0');
    n(6, s.utm, '0');
    n(7, tiktok ? '' : fmt1(s.direct), '0.0');
    n(8, fmt1(shop), '0.0', { b: 'bold' });
    n(9, fmt1(gap), '+0.0;-0.0;0');
    if (dup !== null) n(10, Math.round(dup * 1000) / 1000, '+0%;-0%;0%', { b: 'bold', bg: dup >= DUP.HIGH ? '#f4cccc' : dup <= -DUP.HIGH ? '#fff2cc' : '#d9ead3' });
    else n(10, s.pixel > 0 ? 'مفيش في شوبيفاي' : '', '@', s.pixel > 0 ? { bg: '#f4cccc', b: 'bold' } : {});
  };

  let r = 5, head = 0, first = 0;
  const info = {}; // row → [key, depth, rows under it] for the rows with a + (and the ones inside them)
  const table = (p, label) => {
    const x = data[p], tiktok = p === 'TIKTOK', shop = x.all.utm + x.all.direct;
    g.set(r, 1, label + ' | ' + (per.from === per.to ? per.from : per.from + ' → ' + per.to), dark);
    g.fill(r, 2, W - 1, { bg: '#1f2937' });
    g.merge(r, 1, 1, W);
    r++;
    // The summary: the platform's orders next to Shopify's.
    const sumHead = ['أوردرات ' + label + ' من المنصة', 'أوردرات ' + label + ' من شوبيفاي' + (tiktok ? '' : ' (شامل DIRECT)'), 'منها بالـ UTM',
      tiktok ? '' : 'منها DIRECT (من غير مصدر)', 'الفرق (المنصة − شوبيفاي)', 'نسبة الدوبليكيشن'];
    sumHead.forEach((h, i) => g.set(r, 1 + i, h, { bg: '#e8eefc', b: 'bold', al: 'center' }));
    r++;
    const gap = x.all.pixel - shop, dup = shop > 0 ? gap / shop : null;
    [x.all.pixel, fmt1(shop), x.all.utm, tiktok ? '' : fmt1(x.all.direct), fmt1(gap)].forEach((v, i) =>
      g.set(r, 1 + i, v, { nf: i === 4 ? '+0.0;-0.0;0' : i === 0 || i === 2 ? '0' : '0.0', al: 'center', b: 'bold' }));
    g.set(r, 6, dup === null ? (x.all.pixel > 0 ? 'مفيش في شوبيفاي' : '') : Math.round(dup * 1000) / 1000, { nf: '+0%;-0%;0%', al: 'center', b: 'bold',
      bg: dup === null ? null : dup >= DUP.HIGH ? '#f4cccc' : dup <= -DUP.HIGH ? '#fff2cc' : '#d9ead3' });
    r += 2;
    DUP.HEADERS.forEach((h, i) => g.set(r, 1 + i, h, { bg: '#fff200', b: 'bold', al: 'center' }));
    if (!first) { head = r; first = r + 1; }
    r++;
    const line = (n, depth) => {
      const st = n.level === 'campaign' ? { b: 'bold', bg: '#f9fafb' } : n.level === 'adset' ? {} : { fc: '#4b5563' };
      const pre = n.level === 'adset' ? '↳ ' : n.level === 'ad' ? '        • ' : '';
      g.set(r, 1, pre + (n.name || n.id), st);
      g.set(r, 2, n.level === 'campaign' ? accName(n.acc) : '', st);
      g.set(r, 3, n.on ? '🟢 شغال' : '⏸ واقف', Object.assign({}, st, { al: 'center', fc: n.on ? '#38761d' : '#6b7280' }));
      cells(r, n.sum, st, tiktok);
      info[r] = [p + '|' + n.key, depth, n.kids.length];
      r++;
      n.kids.forEach(k => line(k, depth + 1));
    };
    const running = x.camps.filter(c => c.on), stopped = x.camps.filter(c => !c.on);
    running.forEach(c => line(c, 0));
    if (!running.length) { g.set(r, 1, 'مفيش كامبينات شغالة دلوقتي صرفت أو جابت أوردرات في الفترة دي', { fc: '#6b7280' }); r++; }
    if (stopped.length) {
      const s = dupZero_(), st = { b: 'bold', bg: '#e5e7eb' };
      stopped.forEach(c => Object.keys(s).forEach(f => { s[f] += c.sum[f]; }));
      g.set(r, 1, '⏸ كامبينات واقفة دلوقتي (' + stopped.length + ')', st);
      g.fill(r, 2, 2, st);
      cells(r, s, st, tiktok);
      info[r] = [p + '|stopped', 0, stopped.length];
      r++;
      stopped.forEach(c => line(c, 1));
    }
    const other = (text, s) => {
      const st = { bg: '#f3f4f6' };
      g.set(r, 1, text, st); g.fill(r, 2, 2, st);
      cells(r, Object.assign(dupZero_(), s), st, tiktok);
      r++;
    };
    if (x.utmLost) other('أوردرات ' + label + ' بالـ UTM من غير كامبين معروفة', { utm: x.utmLost });
    if (x.directLost) other('DIRECT مااتوزعتش (مفيش إعلان Meta صرف في يومها)', { direct: x.directLost });
    const tot = { bg: '#e8eefc', b: 'bold' };
    g.set(r, 1, 'TOTAL', tot); g.fill(r, 2, 2, tot);
    cells(r, x.all, tot, tiktok);
    r++;
  };
  table('META', 'Meta');
  r += 2;
  table('TIKTOK', 'TikTok');
  const ids = [];
  for (let i = first; i < r; i++) ids.push(info[i] || ['', 0, 0]);

  // Draw: when the rows changed, or the + / − on the sheet aren't what was drawn last time, every row from the first table
  // row down is deleted (and every group with it) and the groups are made again from zero (like Meta Campaigns).
  const sig = sha_(JSON.stringify([first, ids.map(x => x[0] + '/' + x[1])]));
  let old = null;
  try { old = JSON.parse(props.getProperty(DUP.GROUPS) || 'null'); } catch (e) { old = null; }
  const ok = mcGroupsOk_(sh, head, first, ids);
  const same = old && old.sig === sig && sh.getLastRow() > 0 && ok;
  const open = new Set();
  if (!same) {
    if (old && sh.getLastRow() >= old.first && (ok || mcGroupsOk_(sh, old.first - 1, old.first, old.ids))) {
      old.ids.forEach((x, i) => {
        if (!x[2] || !x[0]) return;
        try { const grp = sh.getRowGroup(old.first + i + 1, x[1] + 1); if (grp && !grp.isCollapsed()) open.add(x[0]); } catch (e) { /* مفيش جروب */ }
      });
    }
    mcUngroupAbove_(sh, first);
    if (sh.getMaxRows() >= first) sh.deleteRows(first, sh.getMaxRows() - first + 1);
    sh.insertRowsAfter(first - 1, ids.length + 50);
    props.deleteProperty(DUP.GROUPS);
    props.deleteProperty('GH_' + DUP.TAB);
  }
  const drew = writeGrid_(sh, g);
  sh.getRange('B2').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(DUP.PERIODS, true).setAllowInvalid(false).build());
  if (!drew && same) return;
  if (!same) {
    try { sh.setRowGroupControlPosition(SpreadsheetApp.GroupControlTogglePosition.BEFORE); } catch (e) { /* قديم */ }
    ids.forEach((x, i) => {
      if (!x[2]) return;
      let k = i + 1;
      while (k < ids.length && ids[k][1] > x[1]) k++;
      if (k > i + 1) sh.getRange(first + i + 1, 1, k - i - 1, 1).shiftRowGroupDepth(1);
    });
    if (ids.some(x => x[1] > 0)) {
      sh.collapseAllRowGroups();
      ids.forEach((x, i) => { if (open.has(x[0]) && x[2]) { try { sh.getRowGroup(first + i + 1, x[1] + 1).expand(); } catch (e) { /* اتغير */ } } });
    }
    props.setProperty(DUP.GROUPS, JSON.stringify({ sig: sig, first: first, ids: ids }));
  }
  sh.getRange(3, 1, 1, W).setWrap(true);
  sh.getRange(head, 1, 1, W).setWrap(true);
  [[1, 380], [2, 140], [3, 90], [4, 90], [5, 110], [6, 120], [7, 130], [8, 130], [9, 130], [10, 120]].forEach(x => sh.setColumnWidth(x[0], x[1]));
}

/* EXT.edit: the period in B2. */
function dupEdit_(name, a1) { if (name === DUP.TAB && a1 === 'B2') writeDupTab_(); }
