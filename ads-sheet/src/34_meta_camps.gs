/*
 * Tab "Meta Campaigns": every Meta campaign that spent in the last 17 days, judged on Shopify ROAS (store orders from the
 * ad's UTM ÷ spend): the last 3 full days (yesterday and the 2 days before) against the 7 days before them and the 14 days
 * before them (both end the day before the 3 days start, so they never overlap the 3 days).
 *
 * Simple from the outside: one row per campaign. The + next to a campaign opens its ad sets (with their budgets), and the
 * + next to an ad set opens its ads, with the same columns. What's open stays open when the tab is drawn again.
 *
 * Each row: a decision (🔴 stop, 🟠 dropped, 🔁 bring it back, 🟢 scale, 🟡 keep, ⏳ too early, ⏸ off), the metric that
 * dropped (the one of CPM, CTR, conversion (orders ÷ link clicks) and order value that moved ROAS down the most:
 * ROAS = 1000 ÷ CPM × CTR × conversion × order value), and what to do about it.
 * Break-even ROAS: the product's break-even (Products tab) and the row's order value; else the store's (be.roas / costs in
 * Settings); else the account's 14-day ROAS.
 * On top, one line per ad account (and all of them): ROAS of the 3 days against the 7 and the 14, the campaigns that pulled
 * it down (each campaign's share of the change: its spend × (its ROAS − the account's ROAS of the 7 days) ÷ the account's
 * spend, so the shares add up to the change), and the campaigns to scale.
 *
 * Meta (read-only): spend, impressions, reach, link clicks and 3-second video plays per campaign, ad set and ad for each
 * window (reach doesn't add up, so each level is read on its own), every 3 hours and when the day changes, kept in the
 * hidden tab "Meta Campaigns Raw". Budgets every update. Running = has an ACTIVE ad now (11_active_ads.gs).
 */
const MC = {
  TAB: 'Meta Campaigns', RAW: 'Meta Campaigns Raw', EVERY_MS: 3 * 3600000, AT_KEY: 'MCAMP_AT', DAY_KEY: 'MCAMP_DAY',
  BUDGETS: 'MCAMP_BUDGETS', GROUPS: 'MCAMP_GROUPS', ACTIVE_ADS: 'ACTIVE_AD_IDS',
  /* [window, first day (days ago), last day (days ago)] */
  WINDOWS: [['3', 3, 1], ['7', 10, 4], ['14', 17, 4]],
  LEVELS: ['campaign', 'adset', 'ad'],
  FIELDS: 'spend,impressions,reach,inline_link_clicks,actions',
  DROP: 0.2, SCALE: 1.2, MIN_ORDERS: 3, ID_COL: 21,
  ORDER: { '🔴': 0, '🟠': 1, '🔁': 2, '🟢': 3, '🟡': 4, '⏳': 5, '⏸': 6 },
  BG: { '🔴': '#f4cccc', '🟠': '#fce5cd', '🔁': '#cfe2f3', '🟢': '#d9ead3', '🟡': '#fff2cc', '⏳': '#f3f4f6', '⏸': '#e5e7eb' },
  WORDS: {
    campaign: { '🔴': 'وقّفها', '🟠': 'وقعت', '🔁': 'رجّعها', '🟢': 'زوّد الميزانية', '🟡': 'سيبها', '⏳': 'لسه بدري', '⏸': 'واقفة' },
    adset: { '🔴': 'وقّفه', '🟠': 'وقع', '🔁': 'رجّعه', '🟢': 'كسبان', '🟡': 'سيبه', '⏳': 'لسه بدري', '⏸': 'واقف' },
    ad: { '🔴': 'وقّفه', '🟠': 'وقع', '🔁': 'رجّعه', '🟢': 'كسبان، ابني عليه', '🟡': 'سيبه', '⏳': 'لسه بدري', '⏸': 'واقف' }
  },
  HEADERS: ['القرار', 'الكامبين / الأد سيت / الإعلان', 'الحساب', 'الحالة', 'الميزانية في اليوم', 'المنتج', 'صرف 3 أيام',
    'أوردرات 3 أيام', 'رؤاس 3 أيام', 'رؤاس الـ 7 أيام قبلها', 'رؤاس الـ 14 يوم قبلها', 'رؤاس التعادل', 'المترك الواقع',
    'السبب وتعمل إيه', 'CPM', 'CTR', 'Hook', 'الفريكونسي', 'التحويل', 'متوسط الأوردر', 'ID'],
  /* The metric columns (3 days, colored against the 7 days): [key, number format, lower is better] */
  METRICS: [['cpm', '#,##0.0', true], ['ctr', '0.00%'], ['hook', '0.0%'], ['freq', '0.00', true], ['cvr', '0.00%'], ['aov', '#,##0']]
};
const MC_RAW_HEADERS = ['Window', 'Level', 'Account ID', 'Campaign ID', 'Campaign', 'Ad set ID', 'Ad set', 'Ad ID', 'Ad',
  'Spend', 'Impressions', 'Reach', 'Link clicks', 'Video 3s', 'From', 'To'];

/* The 3 windows for today: [{key, from, to}]. */
function mcWindows_() {
  const t = todayKey_();
  return MC.WINDOWS.map(w => ({ key: w[0], from: shiftKey_(t, -w[1]), to: shiftKey_(t, -w[2]) }));
}

/* Meta, all accounts × windows × levels at once. Returns {rows (Meta Campaigns Raw), failed: [account names]}. */
function fetchMetaCamps_() {
  const wins = mcWindows_(), reqs = [], what = [];
  accounts_('META').forEach(a => wins.forEach(w => MC.LEVELS.forEach(lv => {
    const ids = ['campaign_id', 'campaign_name'].concat(lv === 'campaign' ? [] : ['adset_id', 'adset_name'], lv === 'ad' ? ['ad_id', 'ad_name'] : []);
    reqs.push({ path: 'act_' + a.id + '/insights', params: { level: lv, time_range: JSON.stringify({ since: w.from, until: w.to }),
      fields: ids.join(',') + ',' + MC.FIELDS, limit: 500 } });
    what.push({ acc: a, win: w, level: lv });
  })));
  const rows = [], failed = new Set(), video = list => { const x = (list || []).find(a => a.action_type === 'video_view'); return x ? num_(x.value) : 0; };
  metaMany_(reqs).forEach((r, i) => {
    const m = what[i];
    if (r.error) { failed.add(m.acc.name || m.acc.id); return; }
    const list = (r.payload.data || []).slice();
    let next = r.payload.paging && r.payload.paging.next, guard = 0;
    try {
      while (next && guard++ < 20) { const p = metaFetch_(next); (p.data || []).forEach(x => list.push(x)); next = p.paging && p.paging.next; }
    } catch (e) { failed.add(m.acc.name || m.acc.id); return; }
    list.forEach(x => {
      if (!x.campaign_id || (num_(x.spend) <= 0 && num_(x.impressions) <= 0)) return;
      rows.push([m.win.key, m.level, String(m.acc.id), String(x.campaign_id), String(x.campaign_name || ''), String(x.adset_id || ''),
        String(x.adset_name || ''), String(x.ad_id || ''), String(x.ad_name || ''), num_(x.spend), num_(x.impressions), num_(x.reach),
        num_(x.inline_link_clicks), video(x.actions), m.win.from, m.win.to]);
    });
  });
  return { rows: rows, failed: Array.from(failed) };
}

/* Daily budgets of these campaigns / ad sets (account currency; a lifetime budget is kept negative). */
function fetchMetaBudgets_(ids) {
  const reqs = [], out = {};
  for (let i = 0; i < ids.length; i += 50) reqs.push({ path: '', params: { ids: ids.slice(i, i + 50).join(','), fields: 'daily_budget,lifetime_budget' } });
  metaMany_(reqs).forEach(r => {
    if (!r.payload) return;
    Object.keys(r.payload).forEach(id => {
      const x = r.payload[id];
      if (!x || typeof x !== 'object') return;
      const d = num_(x.daily_budget) / 100, l = num_(x.lifetime_budget) / 100;
      if (d > 0) out[id] = d; else if (l > 0) out[id] = -l;
    });
  });
  return out;
}

/*
 * EXT.live: the windows every 3 hours and when the day changes (reads outside the lock, the raw tab inside it); budgets
 * every update. force = the menu button.
 */
function refreshMetaCamps_(force) {
  if (!accounts_('META').length) return false;
  const props = PropertiesService.getDocumentProperties(), at = Number(props.getProperty(MC.AT_KEY) || 0);
  const due = force || props.getProperty(MC.DAY_KEY) !== todayKey_() || Date.now() - at >= MC.EVERY_MS;
  if (due && (force || !DEADLINE_ || DEADLINE_ - Date.now() > 90000)) {
    const got = time_('Meta Campaigns — Meta', () => fetchMetaCamps_()), n = accounts_('META').length;
    if (got.failed.length < n) {
      withLock_(() => {
        const sh = ensureTab_(MC.RAW, MC_RAW_HEADERS), lost = new Set(accounts_('META').filter(a => got.failed.indexOf(a.name || a.id) >= 0).map(a => String(a.id)));
        const keep = lost.size ? rawRows_(MC.RAW, MC_RAW_HEADERS.length).filter(r => lost.has(String(r[2]))) : [];
        writeRows_(sh, got.rows.concat(keep), MC_RAW_HEADERS.length, [1, 2, 3, 4, 6, 8, 15, 16]);
        if (!props.getProperty('MCAMP_RAW_HIDDEN')) { try { sh.hideSheet(); } catch (e) { /* مش مهم */ } props.setProperty('MCAMP_RAW_HIDDEN', '1'); }
      });
      props.setProperty(MC.AT_KEY, String(Date.now()));
      props.setProperty(MC.DAY_KEY, todayKey_());
    }
    setStatus_('MCAMP', (got.failed.length ? '⚠️ ماقدرتش أقرا: ' + got.failed.join('، ') : '✓') + ' — ' + got.rows.length + ' صف من Meta');
  }
  const raw = rawRows_(MC.RAW, MC_RAW_HEADERS.length), ids = new Set();
  raw.forEach(r => { if (r[3]) ids.add(String(r[3])); if (r[5]) ids.add(String(r[5])); });
  if (ids.size) {
    try { propSetBig_(MC.BUDGETS, JSON.stringify(fetchMetaBudgets_(Array.from(ids)))); } catch (e) { console.error('budgets: ' + errText_(e)); }
  }
  return true;
}
function refreshMetaCampsNow() {
  try {
    resetCaches_();
    try { refreshActive_(); } catch (e) { setStatus_('ACTIVE', '✗ ' + errText_(e)); }
    refreshMetaCamps_(true);
    withLock_(() => writeMetaCamps_());
    alert_('اتحدث تاب ' + MC.TAB + ' ✅\n' + getStatus_('MCAMP'));
    ss_().setActiveSheet(tab_(MC.TAB));
  } catch (e) { alert_('تاب ' + MC.TAB + ' ماتحدثش:\n' + errText_(e)); }
}

function mcZero_() { return { spend: 0, imp: 0, reach: 0, clicks: 0, v3: 0, orders: 0, revenue: 0 }; }
function mcAdd_(a, b) { Object.keys(b).forEach(k => { a[k] = (a[k] || 0) + b[k]; }); return a; }
/* Raw sums → the rates (null when there's nothing to divide by). */
function mcStats_(t) {
  const r = (a, b, x) => (b > 0 ? a / b * (x || 1) : null);
  return { spend: t.spend, orders: t.orders, revenue: t.revenue, roas: r(t.revenue, t.spend), cpm: r(t.spend, t.imp, 1000),
    ctr: r(t.clicks, t.imp), hook: r(t.v3, t.imp), freq: t.reach > 0 ? t.imp / t.reach : null, cvr: r(t.orders, t.clicks), aov: r(t.revenue, t.orders) };
}

/*
 * The campaigns with their ad sets and ads: [{id, level, name, acc, w: {3, 7, 14: sums}, kids, active, product}], and the
 * windows the raw rows were read for.
 */
function mcTree_() {
  const raw = rawRows_(MC.RAW, MC_RAW_HEADERS.length), camps = new Map(), sets = new Map(), ads = new Map(), wins = {};
  const node = (map, id, level, extra) => {
    if (!map.has(id)) map.set(id, Object.assign({ id: id, level: level, name: '', w: { 3: mcZero_(), 7: mcZero_(), 14: mcZero_() }, kids: [] }, extra));
    return map.get(id);
  };
  raw.forEach(r => {
    const win = String(r[0]), lv = String(r[1]), cid = String(r[3]), sid = String(r[5]), aid = String(r[7]);
    if (!cid || !(win in { 3: 1, 7: 1, 14: 1 })) return;
    if (!wins[win]) wins[win] = { from: asKey_(r[14]) || String(r[14]), to: asKey_(r[15]) || String(r[15]) };
    const c = node(camps, cid, 'campaign', { acc: String(r[2]) });
    if (r[4]) c.name = String(r[4]);
    let n = c;
    if (lv !== 'campaign') {
      if (!sid) return;
      const s = node(sets, sid, 'adset', { camp: cid });
      if (!s.linked) { c.kids.push(s); s.linked = true; }
      if (r[6]) s.name = String(r[6]);
      n = s;
      if (lv === 'ad') {
        if (!aid) return;
        const a = node(ads, aid, 'ad', { camp: cid, set: sid });
        if (!a.linked) { s.kids.push(a); a.linked = true; }
        if (r[8]) a.name = String(r[8]);
        n = a;
      }
    }
    if (lv !== n.level) return;
    const t = n.w[win];
    t.spend += num_(r[9]); t.imp += num_(r[10]); t.reach += num_(r[11]); t.clicks += num_(r[12]); t.v3 += num_(r[13]);
  });
  // Shopify orders of each window: the order's ad, else its ad set (utm_term), else its campaign.
  const keys = Object.keys(wins), since = keys.reduce((m, k) => (wins[k].from < m ? wins[k].from : m), '9999');
  if (keys.length && ss_().getSheetByName(APP.T.ORDERS)) recentRows_(APP.T.ORDERS, ORDERS_HEADERS.length, 2, sortKey_, since).forEach(o => {
    if (o[3] !== 'META') return;
    const d = asKey_(o[2]), in_ = keys.filter(k => d >= wins[k].from && d <= wins[k].to);
    if (!in_.length) return;
    const a = ads.get(String(o[14] || '')), s = a ? sets.get(a.set) : sets.get(String(o[17] || ''));
    const c = a ? camps.get(a.camp) : s ? camps.get(s.camp) : camps.get(String(o[16] || ''));
    [a, s, c].forEach(n => { if (n) in_.forEach(k => { n.w[k].orders++; n.w[k].revenue += num_(o[7]); }); });
  });
  // Running now, and the product: each ad's from the Ad Map, an ad set's / campaign's = most spend.
  const on = new Set(propGetBig_(MC.ACTIVE_ADS).split(',').filter(Boolean)), idx = adMapIndex_(), catAds = catalogAdIds_();
  const weight = n => n.w[3].spend + n.w[14].spend;
  const top = list => {
    const by = {};
    list.forEach(n => { if (n.product) by[n.product] = (by[n.product] || 0) + weight(n) + 1e-9; });
    return Object.keys(by).sort((x, y) => by[y] - by[x])[0] || '';
  };
  camps.forEach(c => {
    c.kids.forEach(s => {
      s.kids.forEach(a => {
        a.active = on.has(a.id);
        const m = idx.get(adKey_('META', a.id, '', '', ''));
        a.product = catAds.has('META|' + a.id) ? APP.CATALOG : m ? m.product : '';
      });
      s.active = s.kids.some(a => a.active);
      s.product = top(s.kids);
    });
    c.active = c.kids.some(s => s.active);
    c.product = top(c.kids);
  });
  return { camps: Array.from(camps.values()), wins: wins };
}

/* Break-even ROAS of a row: {v, src}. ref = the account's 14-day stats (the last fallback). */
function mcTarget_(n, prods, ref) {
  const all = mcAdd_(mcAdd_(mcZero_(), n.w[3]), n.w[14]), p = prods.find(x => x.name === n.product), be = breakEven_(p);
  const aov = all.orders > 0 ? all.revenue / all.orders : p && p.price ? p.price : ref.aov;
  if (be > 0 && aov) return { v: aov * (1 + taxRate_()) / be, aov: aov, src: 'تعادل ' + n.product };
  const b = beRoas_(aov || 0);
  if (b.v) return { v: b.v, aov: aov, src: 'تعادل المتجر (Settings)' };
  return ref.roas ? { v: ref.roas, aov: aov || ref.aov, src: 'متوسط الحساب 14 يوم (المنتج مالوش تكاليف)' } : { v: null, aov: aov, src: '' };
}

/*
 * What pulled ROAS down from base to cur: the factor that fell the most (ROAS = 1000 ÷ CPM × CTR × conversion × order
 * value). {key, label, pct, text} or null when nothing fell by 10% or more.
 */
function mcWhy_(cur, base) {
  if (!cur || !base) return null;
  const ok = (a, b) => typeof a === 'number' && typeof b === 'number' && b > 0;
  const f = [];
  if (ok(cur.cpm, base.cpm) && cur.cpm > 0) f.push(['cpm', base.cpm / cur.cpm]);
  if (ok(cur.ctr, base.ctr)) f.push(['ctr', cur.ctr / base.ctr]);
  if (ok(cur.cvr, base.cvr)) f.push(['cvr', cur.cvr / base.cvr]);
  if (ok(cur.aov, base.aov)) f.push(['aov', cur.aov / base.aov]);
  if (!f.length) return null;
  f.sort((a, b) => a[1] - b[1]);
  const k = f[0][0], ratio = f[0][1];
  if (ratio > 0.9) return null;
  const down = Math.round((1 - ratio) * 100), up = Math.round((cur.cpm / base.cpm - 1) * 100);
  const warn = cfgNum_('rules.frequency_warn') || 2.5;
  if (k === 'cpm') return { key: k, label: 'CPM ↑' + up + '%', text: 'الـ CPM غلي ' + up + '%: منافسة أو الجمهور ضيق ← وسّع الجمهور أو استنى يومين، الكرياتيف مش هو المشكلة' };
  if (k === 'ctr') {
    const hook = ok(cur.hook, base.hook) && cur.hook / base.hook <= 1 - MC.DROP ? '، والـ Hook نزل ' + Math.round((1 - cur.hook / base.hook) * 100) + '%' : '';
    const freq = cur.freq && cur.freq >= warn ? '، والفريكونسي ' + round2_(cur.freq) : '';
    return { key: k, label: 'CTR ↓' + down + '%', text: 'الكرياتيف تعب: الـ CTR نزل ' + down + '%' + hook + freq + ' ← جرّب كرياتيف جديد وابني على أحسن إعلان فيها' };
  }
  if (k === 'cvr' && !(cur.cvr > 0)) return { key: k, label: 'صفر أوردرات', text: 'بتجيب كليكات بس ولا أوردر ← شوف الصفحة والسعر والعرض، تغيير الكرياتيف مش هيفرق' };
  if (k === 'cvr') return { key: k, label: 'التحويل ↓' + down + '%', text: 'الكليكات تمام بس اللي بيشتري منهم نزل ' + down + '% ← شوف الصفحة والسعر والعرض، تغيير الكرياتيف مش هيفرق' };
  return { key: k, label: 'متوسط الأوردر ↓' + down + '%', text: 'متوسط الأوردر نزل ' + down + '% ← بص على العرض أو البندل' };
}

/* The decision of one row: {code, word, metric, reason}. */
function mcJudge_(n, tgt, accBase, stock) {
  const tax = 1 + taxRate_(), s3 = mcStats_(n.w[3]), s7 = mcStats_(n.w[7]), s14 = mcStats_(n.w[14]), T = tgt.v;
  const out = (code, metric, reason) => ({ code: code, word: MC.WORDS[n.level][code], metric: metric || '', reason: reason || '' });
  const fx = v => (typeof v === 'number' ? round2_(v) : '—');
  const stop = MC.WORDS[n.level]['🔴'], back = MC.WORDS[n.level]['🔁'];
  const real = n.product && [APP.CATALOG, APP.MULTI, APP.UNMAPPED, APP.UNKNOWN_PRODUCT].indexOf(n.product) < 0;
  const empty = real && stock && n.product in stock && stock[n.product] <= 0;
  if (!T) return out(n.active ? '⏳' : '⏸', '', 'مفيش رؤاس تعادل: اكتب تكاليف المنتج في Products أو be.roas في Settings');
  const cpa = (tgt.aov || 0) * tax / T, killX = cfgNum_('rules.kill_spend_x_be') || 2;
  const enough = s => s.orders >= MC.MIN_ORDERS || (cpa > 0 && s.spend * tax >= killX * cpa);
  const good = s => enough(s) && s.roas >= T;
  if (!n.active) {
    if (empty) return out('⏸', 'الستوك 0', 'المنتج خلصان من الستوك');
    if (good(s14) || good(s7) || good(s3)) {
      const cur = s3.spend > 0 ? s3 : s7, why = mcWhy_(cur, cur === s7 ? s14 : good(s7) ? s7 : s14);
      const best = Math.max(good(s3) ? s3.roas : 0, good(s7) ? s7.roas : 0, good(s14) ? s14.roas : 0);
      return out('🔁', why ? why.label : '', 'كانت كويسة (رؤاس ' + fx(best) + ' والتعادل ' + fx(T) + ')' +
        (why && why.key === 'ctr' ? (n.level === 'ad' ? ' ← اعمل كرياتيف شبهه بهوك جديد، هو نفسه كان تعب' : ' ← ' + back + ' بكرياتيف جديد، الكرياتيف القديم كان تعب')
          : ' ← ' + back + (n.level === 'ad' ? '' : ' بميزانية صغيرة') + ' وراقب يومين'));
    }
    return out('⏸', '', s14.spend > 0 || s7.spend > 0 ? 'كانت تحت التعادل كمان قبل كده' : '');
  }
  if (empty) return out('🔴', 'الستوك 0', 'المنتج خلصان من الستوك ← ' + stop + ' أو حوّل الصرف لمنتج تاني');
  // Was good and is under break-even now: said early (after one break-even cost), it's a warning, not a stop.
  const dropped = s3.roas < T && (good(s7) || good(s14)) && (enough(s3) || (cpa > 0 && s3.spend * tax >= cpa));
  if (!enough(s3) && !dropped) return out('⏳', '', 'لسه صرفها قليل (' + Math.round(s3.spend) + ' جنيه و ' + s3.orders + ' أوردر في 3 أيام) ← استنى');
  if (s3.roas >= T * MC.SCALE && !(enough(s7) && s3.roas < s7.roas * (1 - MC.DROP)))
    return out('🟢', '', 'رؤاس ' + fx(s3.roas) + ' فوق التعادل ' + fx(T) + ' بـ ' + Math.round((s3.roas / T - 1) * 100) + '%' +
      (n.level === 'ad' ? ' ← اعمل كرياتيفات شبهه' : n.level === 'campaign' || n.budget ? ' ← زوّد 20% وراقب يومين' : ''));
  if (s3.roas < T) {
    if (dropped) {
      const base = good(s7) ? s7 : s14, why = mcWhy_(s3, base);
      return out('🟠', why ? why.label : '', 'كانت ' + fx(base.roas) + ' ونزلت ' + fx(s3.roas) + ' (التعادل ' + fx(T) + '). ' +
        (why ? why.text : 'مفيش مترك واحد نزل لوحده، نزول خفيف في كذا حاجة'));
    }
    const why = mcWhy_(s3, accBase);
    return out('🔴', !why ? '' : /[↑↓]/.test(why.label) ? why.label.replace(/[↑↓]/, m => (m === '↑' ? 'أعلى ' : 'أقل ')) + ' من الحساب' : why.label,
      'تحت التعادل في الـ 3 أيام وقبلها (رؤاس ' + fx(s3.roas) + ' والتعادل ' + fx(T) + ') ← ' + stop +
      (why ? '. أكتر حاجة مقارنة بالحساب: ' + why.text.split(' ←')[0] : ''));
  }
  const why = mcWhy_(s3, enough(s7) ? s7 : s14);
  return out('🟡', why ? why.label : '', 'حوالين التعادل (رؤاس ' + fx(s3.roas) + ' والتعادل ' + fx(T) + ')' + (why ? '. ' + why.text : ''));
}

/* Children sorted by spend: the 3 days, then the 14 days. */
function mcBySpend_(a, b) { return (b.w[3].spend - a.w[3].spend) || (b.w[14].spend - a.w[14].spend); }

/*
 * EXT.views: the tab. Drawn in place; when the rows change (a campaign / ad set / ad comes or goes, or moves), the old rows
 * are deleted (their groups with them) and the groups are made again, collapsed, with the ones that were open opened again.
 */
function writeMetaCamps_() {
  if (!ss_().getSheetByName(MC.RAW)) return;
  const tree = mcTree_(), W = MC.HEADERS.length, prods = products_(), stock = stockByName_().by, accs = accounts_('META');
  let budgets = {};
  try { budgets = JSON.parse(propGetBig_(MC.BUDGETS) || '{}'); } catch (e) { budgets = {}; }
  const accName = id => { const a = accs.find(x => String(x.id) === String(id)); return a ? a.name || a.id : id; };
  // The accounts: sums of their campaigns (and all of them).
  const accSum = list => {
    const w = { 3: mcZero_(), 7: mcZero_(), 14: mcZero_() };
    list.forEach(c => [3, 7, 14].forEach(k => mcAdd_(w[k], Object.assign({}, c.w[k], { reach: 0 }))));
    return w;
  };
  const byAcc = {};
  tree.camps.forEach(c => { (byAcc[c.acc] = byAcc[c.acc] || []).push(c); });
  const refOf = {};
  Object.keys(byAcc).forEach(id => { const w = accSum(byAcc[id]); refOf[id] = { w: w, ref: mcStats_(w[14]) }; });
  // Every row's decision.
  const judge = (n, acc) => {
    n.budget = budgets[n.id] || 0;
    const ref = refOf[acc].ref;
    n.target = mcTarget_(n, prods, ref);
    n.verdict = mcJudge_(n, n.target, ref, stock);
  };
  tree.camps.forEach(c => {
    judge(c, c.acc);
    c.kids.sort(mcBySpend_).forEach(s => { judge(s, c.acc); s.kids.sort(mcBySpend_).forEach(a => judge(a, c.acc)); });
    if (!c.budget) { const sum = c.kids.filter(s => s.active && s.budget > 0).reduce((x, s) => x + s.budget, 0); c.budget = sum; c.budgetSum = sum > 0; }
  });
  tree.camps.sort((a, b) => (MC.ORDER[a.verdict.code] - MC.ORDER[b.verdict.code]) || mcBySpend_(a, b));

  const g = todayGrid_(), wins = tree.wins, day = k => {
    const p = String(k || '').split('-').map(Number);
    return p.length === 3 ? Utilities.formatDate(new Date(Date.UTC(p[0], p[1] - 1, p[2], 12)), 'UTC', 'd MMM') : '';
  };
  const span = k => (wins[k] ? day(wins[k].from) + ' لـ ' + day(wins[k].to) : '');
  g.width = W;
  const props = PropertiesService.getDocumentProperties(), readAt = Number(props.getProperty(MC.AT_KEY) || 0);
  g.set(1, 1, 'META CAMPAIGNS — الحكم بـ Shopify ROAS: آخر 3 أيام (' + span(3) + ') قدام الـ 7 أيام (' + span(7) + ') والـ 14 يوم (' + span(14) + ') اللي قبلهم' +
    (readAt ? ' | قراية Meta: ' + Utilities.formatDate(new Date(readAt), tz_(), 'yyyy-MM-dd HH:mm') : ''), { bg: '#1f2937', fc: '#ffffff', b: 'bold' });
  g.fill(1, 2, W - 1, { bg: '#1f2937' });
  g.merge(1, 1, 1, W);
  g.set(2, 1, '🔴 تحت التعادل من الأول  🟠 كانت كويسة ونزلت (المترك الواقع جنبها)  🔁 واقفة وكانت كويسة: تستاهل فرصة  🟢 فوق التعادل بـ 20% وأكتر  ' +
    '🟡 حوالين التعادل  ⏳ صرفها لسه قليل  ⏸ واقفة. اضغط + جنب الكامبين تشوف الأد سيتس، و + جنب الأد سيت تشوف الإعلانات. ' +
    'الكامبين اللي بدأت النهارده بتظهر من بكره. حط الماوس على أرقام CPM لحد متوسط الأوردر تشوف الـ 7 والـ 14 يوم.', { fc: '#374151' });
  g.merge(2, 1, 1, W);

  // The accounts card.
  let r = 4;
  const cardHead = { bg: '#e8eefc', b: 'bold', al: 'center' };
  g.set(r, 1, 'الحساب', cardHead); g.set(r, 2, 'الرؤاس', cardHead);
  ['صرف 3 أيام', 'أوردرات 3 أيام', 'رؤاس 3 أيام', 'رؤاس الـ 7 أيام قبلها', 'رؤاس الـ 14 يوم قبلها'].forEach((h, i) => g.set(r, 7 + i, h, cardHead));
  g.set(r, 12, 'التغيير عن الـ 7', cardHead); g.set(r, 13, 'اللي موقّع الرؤس', cardHead); g.fill(r, 14, 1, cardHead);
  g.merge(r, 13, 1, 2);
  g.set(r, 15, 'تقدر تزوّد على', cardHead); g.fill(r, 16, 5, cardHead);
  g.merge(r, 15, 1, 6);
  r++;
  const card = (label, camps) => {
    const w = accSum(camps), s3 = mcStats_(w[3]), s7 = mcStats_(w[7]), s14 = mcStats_(w[14]);
    const R = typeof s7.roas === 'number' ? s7.roas : s14.roas, S = s3.spend;
    const ch = typeof s3.roas === 'number' && R > 0 ? s3.roas / R - 1 : null;
    const state = ch === null ? '' : ch <= -0.1 ? '📉 نازل' : ch >= 0.1 ? '📈 طالع' : '➖ ثابت';
    const drag = typeof R === 'number' && S > 0 ? camps.filter(c => c.w[3].spend > 0)
      .map(c => ({ c: c, v: c.w[3].spend * ((mcStats_(c.w[3]).roas || 0) - R) / S })).filter(x => x.v <= -0.01).sort((a, b) => a.v - b.v).slice(0, 3) : [];
    const up = camps.filter(c => c.verdict.code === '🟢').sort((a, b) => mcStats_(b.w[3]).roas - mcStats_(a.w[3]).roas).slice(0, 3);
    const back = camps.filter(c => c.verdict.code === '🔁').slice(0, 2);
    g.set(r, 1, label, { b: 'bold' });
    g.set(r, 2, state, { al: 'center', bg: ch === null ? null : ch <= -0.1 ? '#f4cccc' : ch >= 0.1 ? '#d9ead3' : null });
    [S, s3.orders, s3.roas, s7.roas, s14.roas].forEach((v, i) => g.set(r, 7 + i, typeof v === 'number' ? (i < 2 ? Math.round(v) : round2_(v)) : '',
      { nf: i < 2 ? '#,##0' : '0.00', al: 'center' }));
    g.set(r, 12, ch === null ? '' : Math.round(ch * 1000) / 1000, { nf: '+0%;-0%;0%', al: 'center', fc: ch === null ? '#000000' : ch < 0 ? '#cc0000' : '#38761d', b: 'bold' });
    g.set(r, 13, drag.length ? drag.map(x => x.c.name + ' (' + (Math.round(x.v * 100) / 100) + ')').join('، ') : ch !== null && ch < 0 ? 'نزول خفيف في كذا كامبين' : '—');
    g.merge(r, 13, 1, 2);
    g.set(r, 15, up.map(c => c.name + ' (' + round2_(mcStats_(c.w[3]).roas) + ')').concat(back.map(c => '🔁 ' + c.name)).join('، ') || '—');
    g.merge(r, 15, 1, 6);
    r++;
  };
  if (Object.keys(byAcc).length > 1) card('كل الحسابات', tree.camps);
  Object.keys(byAcc).sort((a, b) => accName(a).localeCompare(accName(b))).forEach(id => card(accName(id), byAcc[id]));
  if (!tree.camps.length) { g.set(r, 1, 'مفيش كامبينات Meta صرفت في آخر 17 يوم، أو لسه ماتقريتش من Meta', { fc: '#6b7280' }); r++; }
  r++;

  // The table: campaigns, their ad sets under them, their ads under those.
  MC.HEADERS.forEach((h, i) => g.set(r, 1 + i, h, { bg: '#fff200', b: 'bold', al: 'center' }));
  const head = r, first = r + 1, ids = [], notes = [];
  r++;
  const fmt = (k, v) => (typeof v !== 'number' ? '—' : k === 'ctr' || k === 'cvr' ? (v * 100).toFixed(2) + '%' : k === 'hook' ? (v * 100).toFixed(1) + '%'
    : k === 'freq' ? v.toFixed(2) : Math.round(v * 10) / 10);
  const line = (n, depth) => {
    const v = n.verdict, s3 = mcStats_(n.w[3]), s7 = mcStats_(n.w[7]), s14 = mcStats_(n.w[14]), base = s7.spend > 0 ? s7 : s14;
    const st = depth === 0 ? { b: 'bold', bg: '#f9fafb' } : depth === 1 ? {} : { fc: '#4b5563' };
    const name = (depth === 1 ? '↳ ' : depth === 2 ? '        • ' : '') + (n.name || n.id);
    g.set(r, 1, v.code + ' ' + v.word, Object.assign({}, st, { bg: MC.BG[v.code], b: 'bold' }));
    g.set(r, 2, name, st);
    g.set(r, 3, depth === 0 ? accName(n.acc) : '', st);
    g.set(r, 4, n.active ? 'شغالة' : 'واقفة', Object.assign({}, st, { al: 'center', fc: n.active ? '#38761d' : '#6b7280' }));
    const b = n.budget > 0 ? Math.round(n.budget) : n.budget < 0 ? 'كل المدة ' + Math.round(-n.budget) : '';
    g.set(r, 5, b, Object.assign({}, st, { nf: '#,##0', al: 'center' }, n.budgetSum ? { fc: '#6b7280' } : {}));
    g.set(r, 6, n.product === APP.UNMAPPED ? '❌ مش معروف' : n.product === APP.MULTI ? 'صفحة فيها كذا منتج' : n.product || '', st);
    g.set(r, 7, Math.round(s3.spend), Object.assign({}, st, { nf: '#,##0', al: 'center' }));
    g.set(r, 8, s3.orders, Object.assign({}, st, { nf: '0', al: 'center' }));
    [s3.roas, s7.roas, s14.roas].forEach((x, i) => g.set(r, 9 + i, typeof x === 'number' ? round2_(x) : '',
      Object.assign({}, st, { nf: '0.00', al: 'center' }, i === 0 && typeof x === 'number' && n.target.v ? { bg: x >= n.target.v ? '#d9ead3' : '#f4cccc' } : {})));
    g.set(r, 12, n.target.v ? round2_(n.target.v) : '', Object.assign({}, st, { nf: '0.00', al: 'center', fc: '#6b7280' }));
    g.set(r, 13, v.metric, Object.assign({}, st, v.metric ? { bg: '#f4cccc', b: 'bold' } : {}, { al: 'center' }));
    g.set(r, 14, v.reason, st);
    const nr = [];
    MC.METRICS.forEach((m, i) => {
      const x = s3[m[0]], y = base[m[0]], worse = typeof x === 'number' && typeof y === 'number' && y > 0 ? (m[2] ? x / y - 1 : 1 - x / y) : 0;
      const bg = worse >= MC.DROP ? '#f4cccc' : worse <= -MC.DROP ? '#d9ead3' : st.bg || null;
      g.set(r, 15 + i, typeof x === 'number' ? Math.round(x * 10000) / 10000 : '', Object.assign({}, st, { nf: m[1], al: 'center', bg: bg }));
      nr.push('الـ 7 أيام قبلها: ' + fmt(m[0], s7[m[0]]) + '\nالـ 14 يوم قبلها: ' + fmt(m[0], s14[m[0]]));
    });
    g.set(r, MC.ID_COL, n.id, { fc: '#9ca3af', nf: '@' });
    notes.push(nr);
    ids.push([n.id, depth, n.kids ? n.kids.length : 0]);
    r++;
  };
  tree.camps.forEach(c => { line(c, 0); c.kids.forEach(s => { line(s, 1); s.kids.forEach(a => line(a, 2)); }); });

  // Draw: when the rows changed, the old ones go first (with their groups).
  const sh = ensureTab_(MC.TAB), sig = sha_(JSON.stringify([first, ids.map(x => x[0] + '/' + x[1])]));
  let old = null;
  try { old = JSON.parse(props.getProperty(MC.GROUPS) || 'null'); } catch (e) { old = null; }
  const same = old && old.sig === sig && sh.getLastRow() > 0;
  const open = new Set();
  if (old && !same && sh.getLastRow() >= old.first) {
    let campOpen = false;
    old.ids.forEach((x, i) => {
      if (x[1] === 0) campOpen = false;
      if (x[2] > 0 && (x[1] === 0 || campOpen)) {
        try { const grp = sh.getRowGroup(old.first + i + 1, x[1] + 1); if (grp && !grp.isCollapsed()) { open.add(x[0]); if (x[1] === 0) campOpen = true; } } catch (e) { /* مفيش جروب */ }
      }
    });
    const n = Math.min(old.ids.length, sh.getMaxRows() - old.first);
    if (n > 0) sh.deleteRows(old.first, n);
  }
  const drew = writeGrid_(sh, g);
  if (!drew && same) return;
  if (!same) {
    try { sh.setRowGroupControlPosition(SpreadsheetApp.GroupControlTogglePosition.BEFORE); } catch (e) { /* قديم */ }
    ids.forEach((x, i) => {
      if (x[1] > 1 || !x[2]) return;
      let k = i + 1;
      while (k < ids.length && ids[k][1] > x[1]) k++;
      if (k > i + 1) sh.getRange(first + i + 1, 1, k - i - 1, 1).shiftRowGroupDepth(1);
    });
    if (ids.some(x => x[1] > 0)) {
      sh.collapseAllRowGroups();
      ids.forEach((x, i) => { if (open.has(x[0]) && x[2]) { try { sh.getRowGroup(first + i + 1, x[1] + 1).expand(); } catch (e) { /* اتغير */ } } });
    }
    props.setProperty(MC.GROUPS, JSON.stringify({ sig: sig, first: first, ids: ids }));
  }
  if (notes.length) sh.getRange(first, 15, notes.length, MC.METRICS.length).setNotes(notes);
  sh.getRange(head, 1, 1, W).setWrap(true);
  sh.setFrozenColumns(2);
  [[1, 140], [2, 300], [3, 120], [4, 60], [5, 80], [6, 140], [7, 80], [8, 70], [9, 70], [10, 80], [11, 80], [12, 70], [13, 120], [14, 420],
    [15, 65], [16, 65], [17, 60], [18, 70], [19, 65], [20, 75]].forEach(x => sh.setColumnWidth(x[0], x[1]));
  sh.hideColumns(MC.ID_COL);
}
