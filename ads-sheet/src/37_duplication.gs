/*
 * Duplication: the orders each platform says it brought (Meta pixel purchases, TikTok complete payments: Ads Raw)
 * against the store orders Shopify has for it, in a period (drawn in Meta Campaigns since 1.85; the tab of its own is gone).
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
const DUP = { TAB: 'Duplication', HIGH: 0.2 };

/* rev: the UTM orders' sales (Today's offers table, ROAS in Meta Campaigns); imp and clicks for CPM / CTR / conversion. */
function dupZero_() { return { spend: 0, pixel: 0, utm: 0, direct: 0, rev: 0, imp: 0, clicks: 0 }; }

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
    n.t.spend += spend; n.t.pixel += pix; n.t.imp += num_(a[11]); n.t.clicks += num_(a[12]);
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
      if (n) { n.t.utm++; n.t.rev += num_(o[7]); } else P[p].utmLost++;
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

/*
 * The tab "Duplication" of version 1.84 and before: its numbers are in Meta Campaigns now (the platform's orders, Shopify's
 * by UTM and the estimate from DIRECT, and the duplication, for the period chosen there). Deleted once: it was all drawn.
 */
function dupDropTab_() {
  const props = PropertiesService.getDocumentProperties();
  if (props.getProperty('DUP_TAB_GONE')) return;
  const sh = ss_().getSheetByName(DUP.TAB);
  if (sh && ss_().getSheets().length > 1) ss_().deleteSheet(sh);
  ['DUP_GROUPS', 'GH_' + DUP.TAB, 'GM_' + DUP.TAB].forEach(k => props.deleteProperty(k));
  props.setProperty('DUP_TAB_GONE', '1');
}
