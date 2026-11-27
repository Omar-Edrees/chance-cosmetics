/*
 * Tab "Meta Campaigns": every Meta campaign that spent in the last 17 days, judged on Shopify ROAS (store orders from the
 * ad's UTM ÷ spend): the last 3 full days (yesterday and the 2 days before) against the 7 days before them and the 14 days
 * before them (both end the day before the 3 days start, so they never overlap the 3 days).
 *
 * Simple from the outside: one row per campaign. The + next to a campaign opens its ad sets, and the + next to an ad set
 * opens its ads, with the same columns. What's open stays open when the tab is drawn again. The numbers on a row are for
 * the period chosen in B2 (writeMetaCamps_); the decision (its color) is always the 3 days against the 7 and the 14.
 * TikTok's campaigns under Meta's, the same way (from the sheet's own tabs).
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
  DROP: 0.2, SCALE: 1.2, MIN_ORDERS: 3,
  ORDER: { '🔴': 0, '🟠': 1, '🔁': 2, '🟢': 3, '🟡': 4, '⏳': 5, '💬': 6, '⏸': 7 },
  BG: { '🔴': '#f4cccc', '🟠': '#fce5cd', '🔁': '#cfe2f3', '🟢': '#d9ead3', '🟡': '#fff2cc', '⏳': '#f3f4f6', '💬': '#e8eefc', '⏸': '#e5e7eb' },
  WORDS: {
    campaign: { '🔴': 'وقّفها', '🟠': 'وقعت', '🔁': 'رجّعها', '🟢': 'زوّد الميزانية', '🟡': 'سيبها', '⏳': 'لسه بدري', '💬': 'مسجات', '⏸': 'واقفة' },
    adset: { '🔴': 'وقّفه', '🟠': 'وقع', '🔁': 'رجّعه', '🟢': 'كسبان', '🟡': 'سيبه', '⏳': 'لسه بدري', '💬': 'مسجات', '⏸': 'واقف' },
    ad: { '🔴': 'وقّفه', '🟠': 'وقع', '🔁': 'رجّعه', '🟢': 'كسبان، ابني عليه', '🟡': 'سيبه', '⏳': 'لسه بدري', '💬': 'مسجات', '⏸': 'واقف' }
  },
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
  // The period chosen in the tab, every update (its numbers move all day): Hook rate, frequency and content views.
  if (force || !DEADLINE_ || DEADLINE_ - Date.now() > 60000) {
    const per = mcPeriod_(mcChoice_());
    try {
      const x = fetchMcPeriod_(per);
      if (x.ok) propSetBig_(MCP.DATA, JSON.stringify({ from: per.from, to: per.to, at: nowText_(), by: x.by }));
    } catch (e) { console.error('meta camps period: ' + errText_(e)); }
  }
  // Every campaign's spend since it started, once a day (the stopped ones that were good their whole life).
  if (props.getProperty(MCP.LIFE_DAY) !== todayKey_() && (force || !DEADLINE_ || DEADLINE_ - Date.now() > 60000)) {
    try {
      const x = fetchMcLife_();
      if (x.ok) { propSetBig_(MCP.LIFE, JSON.stringify(x.by)); props.setProperty(MCP.LIFE_DAY, todayKey_()); }
    } catch (e) { console.error('meta camps life: ' + errText_(e)); }
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
      'تحت التعادل في الـ 3 أيام وقبلها (رؤاس ' + fx(s3.roas) + ' والتعادل ' + fx(T) + ')' +
      (why ? '. أكتر حاجة مقارنة بالحساب: ' + why.text.split(' ←')[0] : '') + ' ← ' + stop);
  }
  const why = mcWhy_(s3, enough(s7) ? s7 : s14);
  return out('🟡', why ? why.label : '', 'حوالين التعادل (رؤاس ' + fx(s3.roas) + ' والتعادل ' + fx(T) + ')' + (why ? '. ' + why.text : ''));
}

/* Children sorted by spend: the 3 days, then the 14 days. */
function mcBySpend_(a, b) { return (b.w[3].spend - a.w[3].spend) || (b.w[14].spend - a.w[14].spend); }

/* ---------- The tab: a period chosen in B2 (today by default), Meta then TikTok ---------- */

const MCP = {
  PERIODS: ['النهارده', 'إمبارح', 'آخر 3 أيام', 'آخر 7 أيام', 'آخر 14 يوم', 'الشهر ده'],
  DATA: 'MCAMP_PERIOD_DATA', LIFE: 'MCAMP_LIFE', LIFE_DAY: 'MCAMP_LIFE_DAY', ROWS: 'MCAMP_ROWS',
  HEADERS: ['الحساب', 'المؤشر', 'الحالة', 'الكامبين / الأد سيت / الإعلان', 'المنتج', 'الصرف', 'أوردرات المنصة', 'أوردرات شوبيفاي (UTM)',
    '+ تقديري (من غير مصدر)', 'الدوبليكيشن', 'Shopify ROAS', 'AOV', 'التحويل', 'Cost / content view', 'CPM', 'CTR', 'Hook rate', 'الفريكونسي',
    'المترك الواقع', 'السبب', 'القرار (تعمل إيه)', '➕ تاسك', 'ID'],
  NAME_COL: 4, TASK_COL: 22, ID_COL: 23,
  WIDTHS: [120, 34, 60, 300, 140, 80, 70, 80, 80, 85, 75, 70, 65, 80, 65, 60, 65, 65, 110, 320, 260, 60],
  LEGEND: '🟥 وقّفها (تحت التعادل)  🟧 وقعت (كانت كويسة ونزلت)  🟨 سيبها (حوالين التعادل)  🟩 زوّد (فوق التعادل بـ 20%)  🟦 رجّعها (واقفة وكانت كويسة)  ⬜ لسه بدري / واقفة / مسجات',
  PRI: { '🔴': 1, '🟠': 2, '🔁': 4, '🟢': 4, '🟡': 3 }
};

/* The period chosen in B2 → {label, from, to}: every period but إمبارح ends today (so far). */
function mcPeriod_(choice) {
  const t = todayKey_(), P = MCP.PERIODS, i = Math.max(P.indexOf(choice), 0);
  const from = [t, shiftKey_(t, -1), shiftKey_(t, -2), shiftKey_(t, -6), shiftKey_(t, -13), t.slice(0, 8) + '01'][i];
  return { label: P[i], from: from, to: i === 1 ? from : t };
}
function mcChoice_() {
  const sh = ss_().getSheetByName(MC.TAB), v = sh ? String(sh.getRange('B2').getValue() || '').trim() : '';
  return MCP.PERIODS.indexOf(v) >= 0 ? v : MCP.PERIODS[0];
}

/* Insights requests [{path, params}] → one list of rows per request, the pages read; null for a request that failed. */
function mcInsights_(reqs) {
  return metaMany_(reqs).map(r => {
    if (r.error) return null;
    const list = (r.payload.data || []).slice();
    let next = r.payload.paging && r.payload.paging.next, guard = 0;
    try {
      while (next && guard++ < 20) { const p = metaFetch_(next); (p.data || []).forEach(x => list.push(x)); next = p.paging && p.paging.next; }
    } catch (e) { return null; }
    return list;
  });
}
/*
 * What the sheet's own tabs don't have, for the chosen period, from Meta: impressions, reach (frequency), 3-second plays
 * (Hook rate) and content views (cost per content view), for every campaign, ad set and ad: {ok, by: {'c|id' / 's|id' / 'a|id': {imp, reach, v3, cv}}}.
 */
function fetchMcPeriod_(per) {
  const reqs = [], what = [];
  accounts_('META').forEach(a => MC.LEVELS.forEach(lv => {
    const ids = ['campaign_id'].concat(lv === 'campaign' ? [] : ['adset_id'], lv === 'ad' ? ['ad_id'] : []);
    reqs.push({ path: 'act_' + a.id + '/insights', params: { level: lv, time_range: JSON.stringify({ since: per.from, until: per.to }),
      fields: ids.join(',') + ',impressions,reach,actions', limit: 500 } });
    what.push(lv);
  }));
  const by = {}, act = (list, types) => { const x = (list || []).find(a => types.indexOf(a.action_type) >= 0); return x ? num_(x.value) : 0; };
  let ok = 0;
  mcInsights_(reqs).forEach((list, i) => {
    if (!list) return;
    ok++;
    const lv = what[i];
    list.forEach(x => {
      const id = lv === 'campaign' ? x.campaign_id : lv === 'adset' ? x.adset_id : x.ad_id;
      if (id) by[lv.charAt(0) + '|' + id] = { imp: num_(x.impressions), reach: num_(x.reach), v3: act(x.actions, ['video_view']),
        cv: act(x.actions, ['offsite_conversion.fb_pixel_view_content', 'view_content', 'omni_view_content']) };
    });
  });
  return { ok: ok > 0, by: by };
}
/* Every Meta campaign's spend since it started (once a day): {id: {name, acc, spend}}, for the stopped ones that were good. */
function fetchMcLife_() {
  const accs = accounts_('META'), out = {};
  const lists = mcInsights_(accs.map(a => ({ path: 'act_' + a.id + '/insights',
    params: { level: 'campaign', date_preset: 'maximum', fields: 'campaign_id,campaign_name,spend', limit: 500 } })));
  lists.forEach((list, i) => (list || []).forEach(x => {
    if (x.campaign_id) out[x.campaign_id] = { name: String(x.campaign_name || ''), acc: String(accs[i].id), spend: num_(x.spend) };
  }));
  return { ok: lists.some(Boolean), by: out };
}
/* Shopify orders and sales of every Meta campaign since the first order in the sheet: {campaign id: {orders, revenue}}. */
function mcLifeShop_() {
  const out = {}, adCamp = new Map();
  if (ss_().getSheetByName(APP.T.ADMAP)) rawRows_(APP.T.ADMAP, ADMAP_HEADERS.length).forEach(r => { if (r[AM.ID] && r[21]) adCamp.set(String(r[AM.ID]), String(r[21])); });
  if (ss_().getSheetByName(APP.T.ADS)) rawRows_(APP.T.ADS, ADS_HEADERS.length).forEach(a => { if (a[8] && a[4] && !adCamp.has(String(a[8]))) adCamp.set(String(a[8]), String(a[4])); });
  if (!ss_().getSheetByName(APP.T.ORDERS)) return out;
  rawRows_(APP.T.ORDERS, ORDERS_HEADERS.length).forEach(o => {
    if (o[3] !== 'META') return;
    const c = adCamp.get(String(o[14] || '')) || String(o[16] || '');
    if (!c) return;
    const x = out[c] = out[c] || { orders: 0, revenue: 0 };
    x.orders++; x.revenue += num_(o[7]);
  });
  return out;
}

/*
 * TikTok's campaigns, ad sets and ads like Meta's tree (mcTree_), from the sheet's own tabs (Ads Raw and the orders by UTM):
 * the 3 days against the 7 and the 14 before them, running = spent today or yesterday, and the product from the Ad Map.
 * No reach or video plays from TikTok here, so no Hook rate or frequency.
 */
function mcTikTok_() {
  const t = todayKey_(), span = dupData_(shiftKey_(t, -17), t).TIKTOK, sums = {};
  MC.WINDOWS.forEach(w => {
    const walk = n => { sums[w[0] + '|' + n.key] = n.sum; n.kids.forEach(walk); };
    dupData_(shiftKey_(t, -w[1]), shiftKey_(t, -w[2])).TIKTOK.camps.forEach(walk);
  });
  const idx = adMapIndex_(), toW = s => ({ spend: s ? s.spend : 0, imp: s ? s.imp : 0, reach: 0, clicks: s ? s.clicks : 0, v3: 0, orders: s ? s.utm : 0,
    revenue: s ? s.rev : 0 });
  const top = list => {
    const by = {};
    list.forEach(n => { if (n.product) by[n.product] = (by[n.product] || 0) + n.w[3].spend + n.w[14].spend + 1e-9; });
    return Object.keys(by).sort((x, y) => by[y] - by[x])[0] || '';
  };
  const node = (n, acc) => {
    const x = { id: n.id, level: n.level, name: n.name, acc: acc, active: n.on, kids: [], tiktok: true,
      w: { 3: toW(sums['3|' + n.key]), 7: toW(sums['7|' + n.key]), 14: toW(sums['14|' + n.key]) } };
    x.kids = n.kids.map(k => node(k, acc));
    if (n.level === 'ad') { const m = idx.get(adKey_('TIKTOK', n.id, '', '', '')); x.product = m ? m.product : ''; } else x.product = top(x.kids);
    return x;
  };
  return span.camps.map(c => node(c, c.acc));
}

/*
 * What the period has that the tree doesn't (a campaign, ad set or ad newer than the 3 full days the decision reads): a
 * running one is added with ⏳ (too early to judge), and under a campaign already there, any that spent or brought an
 * order in the period too. d = the period's nodes (dupData_).
 */
function mcMergeNew_(list, dupList, acc, top) {
  const have = new Map(list.map(n => [String(n.id), n])), idx = adMapIndex_();
  const make = (d, plat) => {
    const n = { id: d.id, level: d.level, name: d.name, acc: acc, active: d.on, kids: [], fresh: true,
      w: { 3: mcZero_(), 7: mcZero_(), 14: mcZero_() }, target: { v: null } };
    n.kids = d.kids.filter(k => k.on || k.sum.spend > 0 || k.sum.utm > 0).map(k => make(k, plat));
    const m = d.level === 'ad' ? idx.get(adKey_(plat, d.id, '', '', '')) : null;
    n.product = m ? m.product : n.kids.map(k => k.product).find(Boolean) || '';
    n.verdict = { code: '⏳', word: MC.WORDS[d.level]['⏳'], metric: '', reason: 'جديدة: مالهاش 3 أيام كاملة لسه ← استنى' };
    return n;
  };
  dupList.forEach(d => {
    const n = have.get(String(d.id));
    if (n) { mcMergeNew_(n.kids, d.kids, acc, false); return; }
    if (top && !d.on) return; // a new campaign only while it runs
    if (!top && !(d.on || d.sum.spend > 0 || d.sum.utm > 0)) return;
    list.push(make(d, 'META'));
  });
}

/* The verdict of every row of a tree (campaigns → ad sets → ads), against its account's 14 days. */
function mcJudgeAll_(camps, prods, stock, budgets, msg) {
  const accSum = list => {
    const w = { 3: mcZero_(), 7: mcZero_(), 14: mcZero_() };
    list.forEach(c => [3, 7, 14].forEach(k => mcAdd_(w[k], Object.assign({}, c.w[k], { reach: 0 }))));
    return w;
  };
  const byAcc = {}, refOf = {};
  camps.forEach(c => { (byAcc[c.acc] = byAcc[c.acc] || []).push(c); });
  Object.keys(byAcc).forEach(id => { refOf[id] = mcStats_(accSum(byAcc[id])[14]); });
  const judge = (n, acc) => {
    n.budget = budgets[n.id] || 0;
    const ref = refOf[acc];
    n.target = mcTarget_(n, prods, ref);
    // A messages-only account (accounts.messages_only): its ads bring chats, not store orders, so Shopify ROAS doesn't judge them.
    n.verdict = msg.has(String(acc)) ? { code: '💬', word: MC.WORDS[n.level]['💬'], metric: '',
      reason: 'حساب مسجات: الأوردرات بتيجي من الشات ومش متتبعة، فمش بيتحكم عليها بـ Shopify ROAS' } : mcJudge_(n, n.target, ref, stock);
  };
  camps.forEach(c => {
    judge(c, c.acc);
    c.kids.sort(mcBySpend_).forEach(s => { judge(s, c.acc); s.kids.sort(mcBySpend_).forEach(a => judge(a, c.acc)); });
    if (!c.budget) { const sum = c.kids.filter(s => s.active && s.budget > 0).reduce((x, s) => x + s.budget, 0); c.budget = sum; c.budgetSum = sum > 0; }
  });
  camps.sort((a, b) => (MC.ORDER[a.verdict.code] - MC.ORDER[b.verdict.code]) || mcBySpend_(a, b));
  return { byAcc: byAcc, accSum: accSum };
}

/*
 * Stopped Meta campaigns whose whole life was above break-even (spend since they started from Meta, orders from the
 * sheet), that aren't 🔁 already: they get 🔁 too, so a campaign stopped by mistake isn't forgotten.
 */
function mcLifeGood_(camps, prods) {
  let life = {};
  try { life = JSON.parse(propGetBig_(MCP.LIFE) || '{}'); } catch (e) { life = {}; }
  if (!Object.keys(life).length) return [];
  const shop = mcLifeShop_(), seen = new Map(camps.map(c => [String(c.id), c])), out = [], msg = msgAccounts_();
  Object.keys(life).forEach(id => {
    const L = life[id], S = shop[id];
    if (!S || !(L.spend > 0) || S.orders < MC.MIN_ORDERS || msg.has(String(L.acc))) return;
    const have = seen.get(String(id));
    if (have && (have.active || have.verdict.code === '🔁')) return;
    const n = have || { id: id, level: 'campaign', name: L.name, acc: L.acc, active: false, kids: [], product: '', w: { 3: mcZero_(), 7: mcZero_(), 14: mcZero_() } };
    const roas = S.revenue / L.spend, tgt = n.target && n.target.v ? n.target : mcTarget_(Object.assign({}, n, { w: { 3: { spend: 0, orders: S.orders, revenue: S.revenue },
      7: mcZero_(), 14: mcZero_() } }), prods, { roas: null, aov: S.revenue / S.orders });
    if (!tgt.v || roas < tgt.v) return;
    n.target = tgt;
    n.verdict = { code: '🔁', word: MC.WORDS.campaign['🔁'], metric: '', life: true,
      reason: 'كانت كويسة على طول عمرها (رؤاس ' + round2_(roas) + ' والتعادل ' + round2_(tgt.v) + '، صرف ' + Math.round(L.spend) + ' و ' + S.orders + ' أوردر) ← رجّعها بميزانية صغيرة وراقب يومين' };
    out.push(n);
  });
  return out.sort((a, b) => (life[b.id] ? life[b.id].spend : 0) - (life[a.id] ? life[a.id].spend : 0));
}

/*
 * EXT.views and B2: the tab. On top the period (B2) and what the colors mean, then a line per Meta account (its 3 days
 * against the 7 and the 14). Then Meta: the campaigns running now, the worst first, each with its ad sets and ads under
 * a +; under them the stopped ones that were good (the last 7 or 14 days, or their whole life), to bring back. Then TikTok
 * the same way. Every number of a row is for the period: spend, the platform's orders, Shopify's by UTM and the estimate
 * from DIRECT, the duplication, Shopify ROAS, AOV, conversion (Shopify orders ÷ link clicks), cost per content view, CPM,
 * CTR, Hook rate and frequency (cost per content view, Hook rate and frequency read from Meta for the period every update). The color (المؤشر), the
 * metric that dropped, the reason and what to do are the decision of the 3 days against the 7 and 14 before them (mcJudge_).
 * ➕ makes the row a task in Actions.
 * When the rows change, the old rows from the table down are deleted (every group with them) and the groups are made again,
 * with the ones that were open opened again.
 */
function writeMetaCamps_() {
  const hasMeta = !!ss_().getSheetByName(MC.RAW), hasTT = accounts_('TIKTOK').length > 0;
  if (!hasMeta && !hasTT) return;
  try { dupDropTab_(); } catch (e) { console.error('duplication tab: ' + errText_(e)); }
  const tree = hasMeta ? mcTree_() : { camps: [], wins: {} }, W = MCP.HEADERS.length, prods = products_(), stock = stockByName_().by;
  const accs = accounts_('META').concat(accounts_('TIKTOK')), msg = msgAccounts_();
  let budgets = {};
  try { budgets = JSON.parse(propGetBig_(MC.BUDGETS) || '{}'); } catch (e) { budgets = {}; }
  const accName = id => { const a = accs.find(x => String(x.id) === String(id)); return a ? a.name || a.id : id; };
  const meta = mcJudgeAll_(tree.camps, prods, stock, budgets, msg);
  MC_LAST_ = { camps: tree.camps }; // for the Actions and Analysis tabs
  const tt = hasTT ? mcTikTok_() : [];
  mcJudgeAll_(tt, prods, stock, {}, new Set());
  const choice = mcChoice_(), per = mcPeriod_(choice), dup = dupData_(per.from, per.to), look = new Map();
  dup.META.camps.forEach(d => { const c = tree.camps.find(x => String(x.id) === String(d.id)); if (!c) mcMergeNew_(tree.camps, [d], d.acc, true); else mcMergeNew_(c.kids, d.kids, c.acc, false); });
  ['META', 'TIKTOK'].forEach(p => { const walk = n => { look.set(p + '|' + n.level + '|' + n.id, n.sum); n.kids.forEach(walk); }; dup[p].camps.forEach(walk); });
  let pdata = null;
  try { pdata = JSON.parse(propGetBig_(MCP.DATA) || 'null'); } catch (e) { pdata = null; }
  if (pdata && (pdata.from !== per.from || pdata.to !== per.to)) pdata = null;

  const g = todayGrid_(), wins = tree.wins, props = PropertiesService.getDocumentProperties(), readAt = Number(props.getProperty(MC.AT_KEY) || 0);
  const day = k => { const p = String(k || '').split('-').map(Number); return p.length === 3 ? Utilities.formatDate(new Date(Date.UTC(p[0], p[1] - 1, p[2], 12)), 'UTC', 'd MMM') : ''; };
  const span = k => (wins[k] ? day(wins[k].from) + ' لـ ' + day(wins[k].to) : '');
  const dark = { bg: '#1f2937', fc: '#ffffff', b: 'bold' };
  g.width = W;
  g.set(1, 1, 'META & TIKTOK CAMPAIGNS — أرقام الفترة اللي في B2، والمؤشر (اللون) حكم آخر 3 أيام (' + span(3) + ') قدام الـ 7 (' + span(7) + ') والـ 14 يوم (' + span(14) + ') اللي قبلهم بـ Shopify ROAS' +
    (readAt ? ' | قراية Meta: ' + Utilities.formatDate(new Date(readAt), tz_(), 'yyyy-MM-dd HH:mm') : ''), dark);
  g.fill(1, 2, W - 1, { bg: '#1f2937' });
  g.merge(1, 1, 1, W);
  g.set(2, 1, 'الفترة', { bg: '#f3f4f6', b: 'bold' });
  g.set(2, 2, choice, { bg: '#fff2cc', b: 'bold', al: 'center' });
  g.merge(2, 2, 1, 3);
  g.set(2, 5, (per.from === per.to ? per.from : 'من ' + per.from + ' لـ ' + per.to) + (per.to === todayKey_() ? ' (لحد دلوقتي)' : ''), { fc: '#374151' });
  g.merge(2, 5, 1, 2);
  g.set(2, 7, MCP.LEGEND, { fc: '#374151', b: 'bold' });
  g.merge(2, 7, 1, W - 6);
  g.set(3, 1, 'الصرف وأوردرات المنصة والكليكات من الشيت، وأوردرات شوبيفاي بالـ UTM (أوردر الإعلان، وإلا الأد سيت، وإلا الكامبين)، و "تقديري" = أوردرات DIRECT (من غير مصدر) متوزعة على الإعلانات اللي صرفت على نفس المنتج في نفس اليوم بنسبة صرفها. ' +
    'الدوبليكيشن = (أوردرات المنصة − شوبيفاي بالتقديري) ÷ شوبيفاي. Shopify ROAS و AOV والتحويل بأوردرات الـ UTM. Hook rate والفريكونسي و Cost / content view بيتقروا من Meta للفترة دي مع كل تحديث' +
    (pdata ? ' (آخر قراية ' + pdata.at + ')' : ' (لسه ماتقروش للفترة دي: في التحديث الجاي أو 📊 تحديث Meta Campaigns من المنيو)') + '. ' +
    'اضغط + جنب الكامبين تشوف الأد سيتس، و + جنب الأد سيت تشوف الإعلانات. علّم ➕ جنب أي صف يبقى تاسك في تاب Actions.', { fc: '#374151' });
  g.merge(3, 1, 1, W);

  // The accounts card (Meta).
  let r = 5;
  const cardHead = { bg: '#e8eefc', b: 'bold', al: 'center' };
  g.set(r, 1, 'الحساب', cardHead); g.set(r, 4, 'الرؤاس', cardHead); g.fill(r, 2, 2, cardHead); g.fill(r, 5, 2, cardHead);
  ['صرف 3 أيام', 'أوردرات 3 أيام', 'رؤاس 3 أيام', 'رؤاس الـ 7 أيام قبلها', 'رؤاس الـ 14 يوم قبلها'].forEach((h, i) => g.set(r, 7 + i, h, cardHead));
  g.set(r, 12, 'التغيير عن الـ 7', cardHead); g.set(r, 13, 'اللي موقّع الرؤس', cardHead); g.fill(r, 14, 6, cardHead);
  g.merge(r, 13, 1, 7);
  g.set(r, 20, 'تقدر تزوّد على', cardHead); g.fill(r, 21, 1, cardHead);
  g.merge(r, 20, 1, 2);
  r++;
  const card = (label, camps) => {
    const w = meta.accSum(camps), s3 = mcStats_(w[3]), s7 = mcStats_(w[7]), s14 = mcStats_(w[14]);
    const R = typeof s7.roas === 'number' ? s7.roas : s14.roas, S = s3.spend;
    const ch = typeof s3.roas === 'number' && R > 0 ? s3.roas / R - 1 : null;
    const isMsg = camps.length > 0 && camps.every(c => msg.has(String(c.acc)));
    const state = isMsg ? MSG_TAG : ch === null ? '' : ch <= -0.1 ? '📉 نازل' : ch >= 0.1 ? '📈 طالع' : '➖ ثابت';
    const drag = !isMsg && typeof R === 'number' && S > 0 ? camps.filter(c => c.w[3].spend > 0)
      .map(c => ({ c: c, v: c.w[3].spend * ((mcStats_(c.w[3]).roas || 0) - R) / S })).filter(x => x.v <= -0.01).sort((a, b) => a.v - b.v).slice(0, 3) : [];
    const up = camps.filter(c => c.verdict.code === '🟢').sort((a, b) => mcStats_(b.w[3]).roas - mcStats_(a.w[3]).roas).slice(0, 3);
    const back = camps.filter(c => c.verdict.code === '🔁').slice(0, 2);
    g.set(r, 1, label, { b: 'bold' });
    g.merge(r, 1, 1, 3);
    g.set(r, 4, state, { al: 'center', bg: isMsg ? MC.BG['💬'] : ch === null ? null : ch <= -0.1 ? '#f4cccc' : ch >= 0.1 ? '#d9ead3' : null });
    [S, s3.orders, s3.roas, s7.roas, s14.roas].forEach((v, i) => g.set(r, 7 + i, typeof v === 'number' ? (i < 2 ? Math.round(v) : round2_(v)) : '',
      { nf: i < 2 ? '#,##0' : '0.00', al: 'center' }));
    g.set(r, 12, ch === null ? '' : Math.round(ch * 1000) / 1000, { nf: '+0%;-0%;0%', al: 'center', fc: ch === null || isMsg ? '#000000' : ch < 0 ? '#cc0000' : '#38761d', b: 'bold' });
    // One campaign a line (a cell with a lot in it is never one long line), at most 3.
    g.set(r, 13, isMsg ? 'كامبينات مسجات: مش بيتحكم عليها بـ Shopify ROAS' : drag.length ? drag.map(x => x.c.name + ' (' + (Math.round(x.v * 100) / 100) + ')').join('\n') : ch !== null && ch < 0 ? 'نزول خفيف في كذا كامبين' : '—', { wr: true, va: 'middle' });
    g.merge(r, 13, 1, 7);
    g.set(r, 20, up.map(c => c.name + ' (' + round2_(mcStats_(c.w[3]).roas) + ')').concat(back.map(c => '🔁 ' + c.name)).join('\n') || '—', { wr: true, va: 'middle' });
    g.merge(r, 20, 1, 2);
    r++;
  };
  if (Object.keys(meta.byAcc).length > 1) card('كل حسابات Meta', tree.camps);
  Object.keys(meta.byAcc).sort((a, b) => String(accName(a)).localeCompare(String(accName(b)))).forEach(id => card(accName(id), meta.byAcc[id]));
  if (!tree.camps.length) { g.set(r, 1, 'مفيش كامبينات Meta صرفت في آخر 17 يوم، أو لسه ماتقريتش من Meta', { fc: '#6b7280' }); r++; }
  r++;

  // The tables: a band, the header, the running campaigns with their ad sets and ads under them, then the stopped good ones.
  const head = r - 1, first = r, ids = [], tasks = [];
  const fx = (v, d) => (typeof v === 'number' && isFinite(v) ? Math.round(v * Math.pow(10, d)) / Math.pow(10, d) : '');
  const ratio = (a, b, x) => (b > 0 ? a / b * (x || 1) : null);
  const optOf = m => (/^CPM/.test(m) ? 'CPM' : /^CTR/.test(m) ? 'CTR' : /^التحويل/.test(m) ? 'التحويل' : /^متوسط الأوردر/.test(m) ? 'AOV' : /^صفر/.test(m) ? 'الأوردرات في اليوم' : 'Shopify ROAS');
  const band = (text, bg) => { g.set(r, 1, text, { bg: bg, fc: '#ffffff', b: 'bold' }); g.fill(r, 2, W - 1, { bg: bg }); g.merge(r, 1, 1, W); ids.push(['#' + r, 0, 0]); r++; };
  const header = () => { MCP.HEADERS.forEach((h, i) => g.set(r, 1 + i, h, { bg: '#fff200', b: 'bold', al: 'center', wr: true, va: 'middle' })); ids.push(['#' + r, 0, 0]); r++; };
  const line = (n, depth, plat, camp) => {
    const v = n.verdict, s = look.get(plat + '|' + n.level + '|' + n.id) || dupZero_(), x = plat === 'META' && pdata ? pdata.by[n.level.charAt(0) + '|' + n.id] : null;
    const st = depth === 0 ? { b: 'bold', bg: '#f9fafb', va: 'middle' } : depth === 1 ? { va: 'middle' } : { fc: '#4b5563', va: 'middle' };
    const num = (c, val, nf, extra) => g.set(r, c, val, Object.assign({}, st, { nf: nf, al: 'center' }, extra || {}));
    const shop = s.utm + (plat === 'META' ? s.direct : 0), dupR = shop > 0 ? (s.pixel - shop) / shop : null;
    const parts = String(v.reason || '').split(' ← '), why = parts[0], todo = parts.length > 1 ? parts.slice(1).join(' ← ') : v.word;
    g.set(r, 1, depth === 0 ? accName(n.acc) : '', st);
    g.set(r, 2, '', { bg: MC.BG[v.code] });
    g.set(r, 3, n.active ? 'شغالة' : 'واقفة', Object.assign({}, st, { al: 'center', fc: n.active ? '#38761d' : '#6b7280' }));
    g.set(r, 4, (depth === 1 ? '↳ ' : depth === 2 ? '        • ' : '') + (n.name || n.id), st);
    g.set(r, 5, n.product === APP.UNMAPPED ? '❌ مش معروف' : n.product === APP.MULTI ? 'صفحة فيها كذا منتج' : n.product || '', st);
    num(6, Math.round(s.spend), '#,##0');
    num(7, s.pixel, '0');
    num(8, s.utm, '0');
    num(9, plat === 'META' ? fx(s.direct, 1) : '', '0.0');
    if (dupR !== null) num(10, fx(dupR, 3), '+0%;-0%;0%', { b: 'bold', bg: dupR >= DUP.HIGH ? '#f4cccc' : dupR <= -DUP.HIGH ? '#fff2cc' : '#d9ead3' });
    else num(10, s.pixel > 0 ? 'مفيش في شوبيفاي' : '', '@', s.pixel > 0 ? { bg: '#f4cccc' } : {});
    const roas = ratio(s.rev, s.spend), T = n.target && n.target.v;
    num(11, fx(roas, 2), '0.00', typeof roas === 'number' && T ? { bg: roas >= T ? '#d9ead3' : '#f4cccc' } : {});
    num(12, fx(ratio(s.rev, s.utm), 0), '#,##0');
    num(13, fx(ratio(s.utm, s.clicks), 4), '0.00%');
    num(14, x ? fx(ratio(s.spend, x.cv), 2) : '', '#,##0.00');
    num(15, fx(ratio(s.spend, s.imp, 1000), 1), '#,##0.0');
    num(16, fx(ratio(s.clicks, s.imp), 4), '0.00%');
    num(17, x ? fx(ratio(x.v3, x.imp), 4) : '', '0.0%');
    num(18, x ? fx(ratio(x.imp, x.reach), 2) : '', '0.00');
    g.set(r, 19, v.metric, Object.assign({}, st, { al: 'center', wr: true }, v.metric ? { bg: '#f4cccc', b: 'bold' } : {}));
    g.set(r, 20, why, Object.assign({}, st, { wr: true }));
    g.set(r, 21, todo, Object.assign({}, st, { wr: true, b: 'bold' }));
    g.set(r, 22, false, { al: 'center', va: 'middle' });
    g.set(r, MCP.ID_COL, n.id, { fc: '#9ca3af', nf: '@' });
    tasks.push({ row: r, text: todo + '\n' + (n.name || n.id), pri: MCP.PRI[v.code] || 3, camp: camp, opt: optOf(v.metric), note: why });
    ids.push([plat + '|' + n.level + '|' + n.id, depth, n.kids ? n.kids.length : 0]);
    r++;
  };
  const table = (plat, label, camps, extra) => {
    const run = camps.filter(c => c.active), good = camps.filter(c => !c.active && c.verdict.code === '🔁').concat(extra || []);
    band(label + ' — الكامبينات الشغالة دلوقتي (' + run.length + ')', plat === 'META' ? '#1d4ed8' : '#111827');
    header();
    const draw = c => { line(c, 0, plat, c.name); c.kids.forEach(s => { line(s, 1, plat, c.name); s.kids.forEach(a => line(a, 2, plat, c.name)); }); };
    run.sort((a, b) => (MC.ORDER[a.verdict.code] - MC.ORDER[b.verdict.code]) ||
      ((look.get(plat + '|campaign|' + b.id) || dupZero_()).spend - (look.get(plat + '|campaign|' + a.id) || dupZero_()).spend)).forEach(draw);
    if (!run.length) { g.set(r, 1, 'مفيش كامبينات ' + label + ' شغالة دلوقتي', { fc: '#6b7280' }); g.merge(r, 1, 1, W); ids.push(['#' + r, 0, 0]); r++; }
    band('🔁 ' + label + ' — واقفة ورؤاسها كان كويس (آخر 7 أو 14 يوم' + (plat === 'META' ? ' أو طول عمرها' : '') + '): لو وقفتها بالغلط رجّعها (' + good.length + ')', '#0e7490');
    good.forEach(draw);
    if (!good.length) { g.set(r, 1, 'مفيش', { fc: '#6b7280' }); g.merge(r, 1, 1, W); ids.push(['#' + r, 0, 0]); r++; }
    g.set(r, 1, ''); ids.push(['#' + r, 0, 0]); r++;
  };
  if (hasMeta) table('META', 'META', tree.camps, mcLifeGood_(tree.camps, prods));
  if (hasTT) table('TIKTOK', 'TIKTOK', tt);

  // Draw: when the rows changed, or the + / − on the sheet aren't what was drawn last time, every row from the table down is
  // deleted (and every group with it) and the groups are made again from zero, so they can never pile up on old ones.
  const sh = ensureTab_(MC.TAB), sig = sha_(JSON.stringify([first, ids.map(x => x[0] + '/' + x[1])]));
  let old = null;
  try { old = JSON.parse(props.getProperty(MC.GROUPS) || 'null'); } catch (e) { old = null; }
  const ok = mcGroupsOk_(sh, head, first, ids);
  const same = old && old.sig === sig && sh.getLastRow() > 0 && ok;
  const open = new Set();
  if (!same) {
    if (old && sh.getLastRow() >= old.first && (ok || mcGroupsOk_(sh, old.first - 1, old.first, old.ids))) { // what was open, unless the groups were broken
      old.ids.forEach((x, i) => {
        if (!x[2] || x[1] > 1) return;
        try { const grp = sh.getRowGroup(old.first + i + 1, x[1] + 1); if (grp && !grp.isCollapsed()) open.add(x[0]); } catch (e) { /* مفيش جروب */ }
      });
    }
    mcUngroupAbove_(sh, first);
    if (sh.getMaxRows() >= first) sh.deleteRows(first, sh.getMaxRows() - first + 1);
    sh.insertRowsAfter(first - 1, ids.length + 50);
    props.deleteProperty(MC.GROUPS);
    props.deleteProperty('GH_' + MC.TAB);
  }
  propSetBig_(MCP.ROWS, JSON.stringify(tasks));
  const drew = writeGrid_(sh, g);
  sh.getRange('B2').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(MCP.PERIODS, true).setAllowInvalid(false).build());
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
  // The ➕ boxes, on every campaign / ad set / ad row.
  if (sh.getMaxRows() >= first) sh.getRange(first, MCP.TASK_COL, sh.getMaxRows() - first + 1, 1).setDataValidation(null);
  for (let i = 0; i < tasks.length;) {
    let k = i + 1;
    while (k < tasks.length && tasks[k].row === tasks[k - 1].row + 1) k++;
    sh.getRange(tasks[i].row, MCP.TASK_COL, k - i, 1).insertCheckboxes();
    i = k;
  }
  sh.getRange(3, 1, 1, W).setWrap(true);
  sh.setFrozenColumns(MCP.NAME_COL);
  MCP.WIDTHS.forEach((w, i) => sh.setColumnWidth(i + 1, w));
  sh.hideColumns(MCP.ID_COL);
}

/*
 * EXT.edit: the period in B2 draws the tab again at once (Hook rate, frequency and cost per content view of a new period
 * come with the next update); ➕ next to a row makes it a task in Actions (what to do and the campaign, the campaign and
 * the metric to optimize filled in).
 */
function mcEdit_(name, a1) {
  if (name !== MC.TAB) return;
  if (a1 === 'B2') { writeMetaCamps_(); return; }
  const m = String(a1).match(/^([A-Z]+)(\d+)$/), col = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.charAt(MCP.TASK_COL - 1);
  if (!m || m[1] !== col) return;
  const sh = tab_(MC.TAB), row = Number(m[2]);
  if (sh.getRange(row, MCP.TASK_COL).getValue() !== true) return;
  let rows = [];
  try { rows = JSON.parse(propGetBig_(MCP.ROWS) || '[]'); } catch (e) { rows = []; }
  const t = rows.find(x => x.row === row);
  if (!t) return;
  anaAddTask_([t.text, ANA.PRI[t.pri] || ANA.PRI[3], ANA.STATUS[0], todayKey_(), t.note || '', t.camp || '', '', t.opt || '']);
  sh.getRange(row, 4, 1, MCP.TASK_COL - 3).setBackground('#e5e7eb');
}

/* A row's group depth (how many + / − it's inside), 0 when it can't be read. */
function mcDepth_(sh, row) { try { return sh.getRowGroupDepth(row) || 0; } catch (e) { return 0; } }

/*
 * The + / − on the sheet are what the table needs: the header and every campaign at depth 0, an ad set at 1, an ad at 2,
 * nothing under the table. Checked on a few rows (the header, the first row of each depth, the last row and the one after).
 */
function mcGroupsOk_(sh, head, first, ids) {
  const want = [[head, 0]], seen = {};
  ids.forEach((x, i) => { if (!seen[x[1]]) { seen[x[1]] = 1; want.push([first + i, x[1]]); } });
  if (ids.length) want.push([first + ids.length - 1, ids[ids.length - 1][1]]);
  if (first + ids.length <= sh.getMaxRows()) want.push([first + ids.length, 0]);
  return want.every(x => mcDepth_(sh, x[0]) === x[1]);
}

/* Takes off every group that touches the rows above the table (the rows from the table down are deleted, groups and all). */
function mcUngroupAbove_(sh, first) {
  for (let r = 1; r < first && r <= sh.getMaxRows(); r++) {
    for (let d = mcDepth_(sh, r), n = 0; d > 0 && n < 8; d = mcDepth_(sh, r), n++) {
      try { sh.getRowGroup(r, d).remove(); } catch (e) { break; }
    }
  }
}
