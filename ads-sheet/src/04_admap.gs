/*
 * Ad Map: the product of every ad, decided once per ad ID from hard evidence.
 * Order of evidence: Override (you) > LINK (landing page) > CODE (exact code in names)
 * > KEYWORD (suggestion, ⚠️) > NONE (❌, spend stays unmapped). Never a default product.
 * Orders never move spend.
 */
const ADMAP_HEADERS = ['Ad ID', 'Platform', 'Account ID', 'Account', 'Campaign', 'Ad set', 'Ad', 'Landing URLs',
  'Auto product', 'Source', 'Override', 'Final product', 'Status', 'Confirmed at', 'Confirmed value',
  'Link changed', 'Mapped link', 'Spend MTD', 'Last spend', 'Note'];
const AM = { ID: 0, PLAT: 1, ACC: 2, ACCN: 3, CAMP: 4, SET: 5, AD: 6, LINKS: 7, AUTO: 8, SRC: 9, OVR: 10, FINAL: 11,
  STATUS: 12, CONF_AT: 13, CONF_VAL: 14, CHANGED: 15, MAPPED: 16, SPEND: 17, LAST: 18, NOTE: 19 };

/* Ads without an ID (some TikTok exports) get a stable key from their names. */
function adKey_(platform, adId, camp, set, ad) {
  return platform + '|' + (adId ? String(adId) : 'name:' + norm_(camp) + '/' + norm_(set) + '/' + norm_(ad));
}

function linksFromCreative_(c) {
  const out = [], push = v => { if (v && typeof v === 'string') out.push(v); };
  if (!c) return out;
  const spec = c.object_story_spec || {}, ld = spec.link_data || {}, vd = spec.video_data || {}, td = spec.template_data || {};
  push(ld.link);
  (ld.child_attachments || []).forEach(x => push(x && x.link));
  if (ld.call_to_action && ld.call_to_action.value) push(ld.call_to_action.value.link);
  if (vd.call_to_action && vd.call_to_action.value) push(vd.call_to_action.value.link);
  push(td.link);
  ((c.asset_feed_spec || {}).link_urls || []).forEach(x => push(x && x.website_url));
  push(c.object_url); push(c.link_url);
  return Array.from(new Set(out));
}

/* Store URLs only. Returns {slugs:[...], paths:[...], multi:bool, store:bool}.
 * slugs = product pages matched by business.product_url_regex; paths = other store pages (unknown shape). */
function parseStoreLinks_(links) {
  const domains = cfgList_('business.store_domains').map(storeHost_).filter(Boolean);
  const prodRx = new RegExp(cfgStr_('business.product_url_regex') || '/products?/([^/]+)', 'i');
  const multiRx = new RegExp(cfgStr_('business.multi_url_regex') || '^/?$|/collections?(/|$)', 'i');
  const res = { slugs: [], paths: [], multi: false, store: false };
  links.forEach(raw => {
    let u = String(raw).trim();
    try { u = decodeURIComponent(u); } catch (e) {}
    const m = u.match(/^(?:https?:\/\/)?([^\/?#\s]+)([^?#\s]*)/i);
    if (!m) return;
    const host = m[1].toLowerCase().replace(/^www\./, ''), path = (m[2] || '/').toLowerCase().replace(/\/+$/, '') || '/';
    const p = path.match(prodRx);
    // No store domain in Settings yet: only product-page paths count (slug must still exist in Products).
    if (!domains.length) { if (p && p[1]) { res.store = true; res.slugs.push(p[1]); } return; }
    if (!domains.some(d => host === d || host.endsWith('.' + d))) return;
    res.store = true;
    if (p && p[1]) res.slugs.push(p[1]);
    else if (multiRx.test(path)) res.multi = true;
    else res.paths.push(path);
  });
  res.slugs = Array.from(new Set(res.slugs));
  res.paths = Array.from(new Set(res.paths));
  return res;
}

function decideProduct_(links, camp, set, ad) {
  const prods = products_(), parsed = parseStoreLinks_(links);
  const pages = parsed.slugs.concat(parsed.paths);
  if (pages.length) {
    const hits = new Set(), unknown = [];
    // A Landing slugs entry can be the page name ("moda-package") or a full path ("/p/123").
    pages.forEach(s => { const p = prods.find(x => x.slugs.indexOf(s) >= 0); if (p) hits.add(p.name); else unknown.push(s); });
    if (unknown.length) return { product: '', source: 'NONE', note: 'صفحة مش متسجلة في Products: ' + unknown.join(', '), unknown: unknown };
    if (hits.size === 1 && !parsed.multi) return { product: Array.from(hits)[0], source: 'LINK', note: '' };
    return { product: '', source: 'MULTI', note: 'اللينك فيه أكتر من منتج' };
  }
  if (parsed.multi) return { product: '', source: 'MULTI', note: 'اللينك رايح لصفحة فيها كل المنتجات أو الرئيسية' };
  const text = norm_([camp, set, ad].join(' '));
  const codeHits = prods.filter(p => p.codes.some(c => hasToken_(text, c)));
  if (codeHits.length === 1) return { product: codeHits[0].name, source: 'CODE', note: '' };
  const kw = prods.filter(p => [norm_(p.name)].concat(p.aliases).some(a => a && a.length >= 3 && text.indexOf(a) >= 0));
  if (kw.length === 1) return { product: kw[0].name, source: 'KEYWORD', note: 'مقترح من الاسم، محتاج تأكيد' };
  return { product: '', source: 'NONE', note: codeHits.length > 1 || kw.length > 1 ? 'الاسم بيشاور على أكتر من منتج' : 'مفيش دليل' };
}

function fetchMetaLinks_(adIds) {
  const out = {}, stop = Date.now() + 60000; // at most a minute per run: many new ads (after a backfill) finish over the next runs
  for (let i = 0; i < adIds.length; i += 25) {
    if (!timeLeft_() || Date.now() > stop) break; // the rest stay blank and are read next run
    const chunk = adIds.slice(i, i + 25);
    const res = metaMany_(chunk.map(id => ({ path: id, params: {
      fields: 'creative{object_story_spec,asset_feed_spec,object_url,link_url,effective_object_story_id}' } })));
    res.forEach((r, j) => {
      const id = chunk[j];
      if (r.error) { out[id] = { links: [], error: r.error }; return; }
      const c = r.payload.creative || {};
      let links = linksFromCreative_(c), error = '';
      if (!links.length && c.effective_object_story_id && timeLeft_()) {
        try {
          const post = metaGet_(c.effective_object_story_id, { fields: 'call_to_action' });
          const v = post.call_to_action && post.call_to_action.value;
          if (v && v.link) links = [v.link];
        } catch (e) { error = 'لينك البوست مش متاح بالتوكن ده'; }
      }
      out[id] = { links: links, error: error };
    });
  }
  return out;
}

/*
 * What an update needs from the Ad Map: {needed, ids}. needed = an ad that spent isn't in the map (or was renamed),
 * an Override was typed or removed, a TikTok link changed, or links are still unread; recheckAll (daily) always.
 * ids = Meta ads whose links to read.
 */
function adMapPlan_(freshAds, tiktokLinks, recheckAll) {
  const rows = rawRows_(APP.T.ADMAP, ADMAP_HEADERS.length), byKey = new Map(), ids = new Set(), weekAgo = shiftKey_(todayKey_(), -7);
  let needed = !!recheckAll;
  rows.forEach(r => byKey.set(adKey_(r[AM.PLAT], String(r[AM.ID]), r[AM.CAMP], r[AM.SET], r[AM.AD]), r));
  freshAds.forEach(a => {
    if (num_(a[10]) <= 0 && num_(a[11]) <= 0) return;
    const r = byKey.get(adKey_(a[1], String(a[8] || ''), a[5], a[7], a[9]));
    if (!r) { needed = true; if (a[1] === 'META' && a[8]) ids.add(String(a[8])); return; }
    if (String(r[AM.CAMP]) !== String(a[5]) || String(r[AM.SET]) !== String(a[7]) || String(r[AM.AD]) !== String(a[9]) ||
      !r[AM.LAST] || asKey_(r[AM.LAST]) < a[0]) needed = true;
  });
  rows.forEach(r => {
    if (String(r[AM.OVR] || '').trim() !== String(r[AM.CONF_VAL] || '')) needed = true;
    if (r[AM.PLAT] === 'META' && r[AM.ID] && (!r[AM.LINKS] || (recheckAll && asKey_(r[AM.LAST]) >= weekAgo))) { needed = true; ids.add(String(r[AM.ID])); }
    if (r[AM.PLAT] === 'TIKTOK' && tiktokLinks && tiktokLinks[r[AM.ID]] && tiktokLinks[r[AM.ID]] !== r[AM.LINKS]) needed = true;
  });
  return { needed: needed, ids: Array.from(ids) };
}
/*
 * Updates the Ad Map only when something changed for it, and reads the Meta links before taking the lock,
 * so a slow link read never makes the other updates wait. Returns the number of ads, or false if nothing to do.
 */
function updateAdMap_(freshAds, tiktokLinks, recheckAll) {
  const plan = adMapPlan_(freshAds, tiktokLinks, recheckAll);
  if (!plan.needed) return false;
  const links = plan.ids.length && accounts_('META').length ? time_('لينكات الإعلانات', () => fetchMetaLinks_(plan.ids)) : {};
  return withLock_(() => refreshAdMap_(freshAds, tiktokLinks, recheckAll, links));
}

/*
 * freshAds: Ads Raw rows just pulled. tiktokLinks: {adId: url}. recheckAll: re-read links of every
 * ad that spent in the last 7 days (daily run), otherwise only ads not in the map yet.
 * links: Meta links already read ({adId: {links, error}}); without it they are read here.
 */
let ADMAP_CHANGED_ = false;
function refreshAdMap_(freshAds, tiktokLinks, recheckAll, links) {
  const sh = ensureTab_(APP.T.ADMAP, ADMAP_HEADERS), W = ADMAP_HEADERS.length;
  const rows = readRows_(sh, W), byKey = new Map();
  rows.forEach(r => { r[AM.ID] = String(r[AM.ID]); r[AM.ACC] = String(r[AM.ACC]); byKey.set(adKey_(r[AM.PLAT], r[AM.ID], r[AM.CAMP], r[AM.SET], r[AM.AD]), r); });

  freshAds.forEach(a => {
    if (num_(a[10]) <= 0 && num_(a[11]) <= 0) return;
    const key = adKey_(a[1], a[8], a[5], a[7], a[9]);
    let r = byKey.get(key);
    if (!r) { r = new Array(W).fill(''); r[AM.ID] = String(a[8] || ''); r[AM.PLAT] = a[1]; byKey.set(key, r); r._new = true; }
    r[AM.ACC] = String(a[2]); r[AM.ACCN] = a[3]; r[AM.CAMP] = a[5]; r[AM.SET] = a[7]; r[AM.AD] = a[9];
    if (!r[AM.LAST] || asKey_(r[AM.LAST]) < a[0]) r[AM.LAST] = a[0];
  });

  const weekAgo = shiftKey_(todayKey_(), -7);
  const needMeta = [];
  byKey.forEach(r => {
    if (r[AM.PLAT] === 'META' && r[AM.ID] && (r._new || !r[AM.LINKS] || (recheckAll && asKey_(r[AM.LAST]) >= weekAgo))) needMeta.push(r[AM.ID]);
    if (r[AM.PLAT] === 'TIKTOK' && tiktokLinks && tiktokLinks[r[AM.ID]]) r[AM.LINKS] = tiktokLinks[r[AM.ID]];
  });
  if (needMeta.length && accounts_('META').length) {
    const got = links || fetchMetaLinks_(needMeta);
    byKey.forEach(r => {
      const g = got[r[AM.ID]];
      if (!g) return;
      r[AM.LINKS] = g.links.length ? g.links.join(', ') : '-';
      r._err = g.error;
    });
  }

  // Spend this month per ad, from Ads Raw (after merge).
  const monthStart = todayKey_().slice(0, 8) + '01', spend = {};
  recentRows_(APP.T.ADS, ADS_HEADERS.length, 1, asKey_, monthStart).forEach(a => {
    const d = asKey_(a[0]);
    if (d < monthStart) return;
    const k = adKey_(a[1], String(a[8] || ''), a[5], a[7], a[9]);
    spend[k] = (spend[k] || 0) + num_(a[10]);
  });

  // Product pages not in Products yet: add them from the store (Shopify title), then decide.
  const known = new Set();
  products_().forEach(p => p.slugs.forEach(s => known.add(s)));
  const newSlugs = new Set();
  byKey.forEach(r => parseStoreLinks_(String(r[AM.LINKS] || '').split(',').map(x => x.trim()).filter(x => x && x !== '-'))
    .slugs.forEach(s => { if (!known.has(s)) newSlugs.add(s); }));
  if (newSlugs.size) addProductsFromLinks_(Array.from(newSlugs));

  const unassigned = new Set(), valid = new Set(products_().map(p => p.name).concat(['MULTI']));
  byKey.forEach((r, key) => {
    const links = String(r[AM.LINKS] || '').split(',').map(x => x.trim()).filter(x => x && x !== '-');
    const d = decideProduct_(links, r[AM.CAMP], r[AM.SET], r[AM.AD]);
    (d.unknown || []).forEach(s => unassigned.add(s));
    r[AM.AUTO] = d.product; r[AM.SRC] = d.source;
    r[AM.NOTE] = [d.note, r._err || ''].filter(Boolean).join(' — ');
    const ovr = String(r[AM.OVR] || '').trim();
    if (ovr && !valid.has(ovr)) r[AM.NOTE] = 'الاختيار مش في تاب المنتجات: ' + ovr;
    const linkSig = links.slice().sort().join(', ');
    // A new or changed Override is a confirmation: remember the link it was confirmed against.
    if (ovr && ovr !== String(r[AM.CONF_VAL] || '')) { r[AM.CONF_VAL] = ovr; r[AM.CONF_AT] = nowText_(); r[AM.MAPPED] = linkSig; }
    if (!ovr && r[AM.CONF_VAL]) { r[AM.CONF_VAL] = ''; r[AM.CONF_AT] = ''; }
    if (!r[AM.MAPPED] && (ovr || d.source === 'LINK' || d.source === 'CODE')) r[AM.MAPPED] = linkSig;
    const changed = !!r[AM.MAPPED] && !!linkSig && r[AM.MAPPED] !== linkSig;
    r[AM.CHANGED] = changed;
    const useOvr = ovr && valid.has(ovr);
    r[AM.FINAL] = useOvr ? (ovr === 'MULTI' ? APP.MULTI : ovr)
      : d.source === 'MULTI' ? APP.MULTI : d.product || APP.UNMAPPED;
    r[AM.STATUS] = changed ? '⚠️' : useOvr ? '✅' : (d.source === 'LINK' || d.source === 'CODE') ? '✅'
      : (d.source === 'KEYWORD' || d.source === 'MULTI') ? '⚠️' : '❌';
    r[AM.SPEND] = round2_(spend[key] || 0);
  });
  PropertiesService.getDocumentProperties().setProperty('UNASSIGNED_SLUGS', Array.from(unassigned).join(', '));

  const order = { '❌': 0, '⚠️': 1, '✅': 2 }, out = Array.from(byKey.values())
    .sort((a, b) => (order[a[AM.STATUS]] - order[b[AM.STATUS]]) || (num_(b[AM.SPEND]) - num_(a[AM.SPEND])))
    .map(r => r.slice(0, W));
  if (!writeRows_(sh, out, W, [1, 3, 4, 5, 6, 7, 15, 17, 19])) return out.length; // same as before: nothing to redraw
  ADMAP_CHANGED_ = true;
  const n = Math.max(out.length, 1);
  sh.getRange(2, AM.OVR + 1, n, 1).setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(products_().map(p => p.name).concat(['MULTI']), true).setAllowInvalid(true).build()).setBackground('#fff2cc');
  const st = sh.getRange(2, AM.STATUS + 1, n, 1);
  sh.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('❌').setBackground('#fce8e6').setRanges([st]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('⚠️').setBackground('#fff4ce').setRanges([st]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('✅').setBackground('#e6f4ea').setRanges([st]).build()
  ]);
  setStatus_('ADMAP', '✓ ' + out.length + ' إعلان');
  return out.length;
}

/* key → {product, exact}. Used by every view, so an Override fixes all past days at once. */
function adMapIndex_() {
  const sh = ss_().getSheetByName(APP.T.ADMAP), idx = new Map();
  if (!sh) return idx;
  rawRows_(APP.T.ADMAP, ADMAP_HEADERS.length).forEach(r => {
    const final = String(r[AM.FINAL] || APP.UNMAPPED);
    idx.set(adKey_(r[AM.PLAT], String(r[AM.ID]), r[AM.CAMP], r[AM.SET], r[AM.AD]),
      { product: final, exact: r[AM.STATUS] === '✅' && final !== APP.MULTI && final !== APP.UNMAPPED });
  });
  return idx;
}

function refreshAdMapNow() {
  try {
    resetCaches_();
    const n = updateAdMap_(recentRows_(APP.T.ADS, ADS_HEADERS.length, 1, asKey_, shiftKey_(todayKey_(), -7)), {}, true);
    alert_('اتحدث ربط الإعلانات ✅ (' + n + ' إعلان)\nراجع الأحمر والأصفر في تاب ' + APP.T.ADMAP + '.');
    ss_().setActiveSheet(tab_(APP.T.ADMAP));
  } catch (e) { alert_('ربط الإعلانات ماكملش:\n' + errText_(e)); }
}
