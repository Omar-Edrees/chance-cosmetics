/*
 * Ad Map: the product of every ad, decided once per ad ID from hard evidence.
 * Order of evidence: Override (you) > LINK (landing page) > CODE (exact code in names)
 * PAGE (a page you named in the Campaign Map's pages table: every store link of the ad goes to it) comes first.
 * > TEXT (the product's full name in the ad's own text, when the link can't be read: ads made from a page post)
 * > KEYWORD (suggestion, ⚠️) > NONE (❌, spend stays unmapped). Never a default product.
 * The campaign's choice in the Campaign Map tab (33_campaign_map.gs) goes to all its ads and wins over all of these;
 * only an ad's own Override wins over it.
 * Orders never move spend.
 */
const ADMAP_HEADERS = ['Ad ID', 'Platform', 'Account ID', 'Account', 'Campaign', 'Ad set', 'Ad', 'Landing URLs',
  'Auto product', 'Source', 'Override', 'Final product', 'Status', 'Confirmed at', 'Confirmed value',
  'Link changed', 'Mapped link', 'Spend MTD', 'Last spend', 'Note', 'Ad text', 'Campaign ID', 'Campaign choice'];
const AM = { ID: 0, PLAT: 1, ACC: 2, ACCN: 3, CAMP: 4, SET: 5, AD: 6, LINKS: 7, AUTO: 8, SRC: 9, OVR: 10, FINAL: 11,
  STATUS: 12, CONF_AT: 13, CONF_VAL: 14, CHANGED: 15, MAPPED: 16, SPEND: 17, LAST: 18, NOTE: 19, TEXT: 20, CAMP_ID: 21, CHOICE: 22 };

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

/* The ad's own words (primary text, headline, description), from every place Meta keeps them. Kept short. */
function textFromCreative_(c) {
  const out = [], push = v => { if (v && typeof v === 'string' && out.indexOf(v) < 0) out.push(v); };
  if (!c) return '';
  const spec = c.object_story_spec || {}, ld = spec.link_data || {}, vd = spec.video_data || {}, af = c.asset_feed_spec || {};
  [c.body, c.title, ld.message, ld.name, ld.description, vd.message, vd.title].forEach(push);
  (ld.child_attachments || []).forEach(x => { if (x) { push(x.name); push(x.description); } });
  ['bodies', 'titles', 'descriptions'].forEach(k => (af[k] || []).forEach(x => push(x && x.text)));
  return out.join(' | ').replace(/\s+/g, ' ').trim().slice(0, 1000);
}
/* phrase is in text as whole words: no letter or digit right before or after it (an emoji or Arabic next to it is fine). */
function wordsIn_(text, phrase) {
  const w = c => /[a-z0-9]/.test(c || '');
  for (let i = text.indexOf(phrase); i >= 0; i = text.indexOf(phrase, i + 1)) {
    if (!w(text.charAt(i - 1)) && !w(text.charAt(i + phrase.length))) return true;
  }
  return false;
}
/* The page has no store link we can read (none, or only Messenger / WhatsApp / a post the token can't open). */
function noStorePage_(links) {
  const p = parseStoreLinks_(links);
  return !p.slugs.length && !p.paths.length && !p.multi;
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

function decideProduct_(links, camp, set, ad, adText) {
  const named = pageNames_(), keys = Array.from(new Set(links.map(pageKeyOf_).filter(Boolean)));
  if (keys.length && keys.every(k => named[k]) && new Set(keys.map(k => named[k])).size === 1)
    return { product: named[keys[0]], source: 'PAGE', note: 'من اسم الصفحة في ' + CMAP.TAB };
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
  // TEXT: the product's whole name (or an order alias) written in the ad itself. A name inside a longer one that's also
  // there ("Lip Oil" in "Lip Oil Set") is the longer one's.
  const copy = norm_(adText || '');
  if (copy && copy !== '-') {
    const said = prods.map(p => ({ p: p, names: [norm_(p.name)].concat(p.aliases).filter(a => a && a.length >= 8 && wordsIn_(copy, a)) }))
      .filter(x => x.names.length);
    const top = said.filter(x => !said.some(y => y !== x && y.names.some(b => x.names.every(a => b !== a && b.indexOf(a) >= 0))));
    if (top.length === 1) return { product: top[0].p.name, source: 'TEXT', note: 'من نص الإعلان (لينك الإعلان مش متاح)' };
  }
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
      fields: 'creative{object_story_spec,asset_feed_spec,object_url,link_url,effective_object_story_id,body,title}' } })));
    res.forEach((r, j) => {
      const id = chunk[j];
      if (r.error) { out[id] = { links: [], error: r.error, text: '' }; return; }
      const c = r.payload.creative || {};
      let links = linksFromCreative_(c), error = '';
      if (!links.length && c.effective_object_story_id && timeLeft_()) {
        try {
          const post = metaGet_(c.effective_object_story_id, { fields: 'call_to_action' });
          const v = post.call_to_action && post.call_to_action.value;
          if (v && v.link) links = [v.link];
        } catch (e) { error = 'لينك البوست مش متاح بالتوكن ده'; }
      }
      out[id] = { links: links, error: error, text: textFromCreative_(c) };
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
  let needed = !!recheckAll || sha_(JSON.stringify(pageNames_())) !== PropertiesService.getDocumentProperties().getProperty('PAGE_NAMES_APPLIED');
  rows.forEach(r => byKey.set(adKey_(r[AM.PLAT], String(r[AM.ID]), r[AM.CAMP], r[AM.SET], r[AM.AD]), r));
  freshAds.forEach(a => {
    if (num_(a[10]) <= 0 && num_(a[11]) <= 0) return;
    const r = byKey.get(adKey_(a[1], String(a[8] || ''), a[5], a[7], a[9]));
    if (!r) { needed = true; if (a[1] === 'META' && a[8]) ids.add(String(a[8])); return; }
    if (String(r[AM.CAMP]) !== String(a[5]) || String(r[AM.SET]) !== String(a[7]) || String(r[AM.AD]) !== String(a[9]) ||
      !r[AM.LAST] || asKey_(r[AM.LAST]) < a[0]) needed = true;
  });
  const picked = campChoicesFromTab_();
  rows.forEach(r => {
    if (String(r[AM.OVR] || '').trim() !== String(r[AM.CONF_VAL] || '')) needed = true;
    const k = campKey_(r[AM.PLAT], r[AM.CAMP_ID], r[AM.CAMP]);
    if (picked.has(k) && picked.get(k) !== String(r[AM.CHOICE] || '')) needed = true;
    if (r[AM.PLAT] === 'META' && r[AM.ID] && (!r[AM.LINKS] || needsText_(r) || (recheckAll && asKey_(r[AM.LAST]) >= weekAgo))) { needed = true; ids.add(String(r[AM.ID])); }
    if (r[AM.PLAT] === 'TIKTOK' && tiktokLinks && tiktokLinks[r[AM.ID]] && tiktokLinks[r[AM.ID]] !== r[AM.LINKS]) needed = true;
  });
  return { needed: needed, ids: Array.from(ids) };
}
/* A Meta ad without a store link whose text wasn't read yet (rows from before the Ad text column, or new). */
function needsText_(r) {
  return r[AM.PLAT] === 'META' && !!r[AM.ID] && !r[AM.TEXT] && !!r[AM.LINKS] &&
    noStorePage_(String(r[AM.LINKS]).split(',').map(x => x.trim()).filter(x => x && x !== '-'));
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
  PAGE_NAMES_ = null;
  PropertiesService.getDocumentProperties().setProperty('PAGE_NAMES_APPLIED', sha_(JSON.stringify(pageNames_())));
  const sh = ensureTab_(APP.T.ADMAP, ADMAP_HEADERS), W = ADMAP_HEADERS.length, hr = sh.getRange(1, 1, 1, W);
  if (hr.getValues()[0].join('|') !== ADMAP_HEADERS.join('|')) hr.setValues([ADMAP_HEADERS]); // new columns (older tabs)
  const rows = readRows_(sh, W), byKey = new Map();
  rows.forEach(r => { r[AM.ID] = String(r[AM.ID]); r[AM.ACC] = String(r[AM.ACC]); byKey.set(adKey_(r[AM.PLAT], r[AM.ID], r[AM.CAMP], r[AM.SET], r[AM.AD]), r); });

  freshAds.forEach(a => {
    if (num_(a[10]) <= 0 && num_(a[11]) <= 0) return;
    const key = adKey_(a[1], a[8], a[5], a[7], a[9]);
    let r = byKey.get(key);
    if (!r) { r = new Array(W).fill(''); r[AM.ID] = String(a[8] || ''); r[AM.PLAT] = a[1]; byKey.set(key, r); r._new = true; }
    r[AM.ACC] = String(a[2]); r[AM.ACCN] = a[3]; r[AM.CAMP] = a[5]; r[AM.SET] = a[7]; r[AM.AD] = a[9];
    if (a[4]) r[AM.CAMP_ID] = String(a[4]);
    if (!r[AM.LAST] || asKey_(r[AM.LAST]) < a[0]) r[AM.LAST] = a[0];
  });

  const weekAgo = shiftKey_(todayKey_(), -7);
  const needMeta = [];
  byKey.forEach(r => {
    if (r[AM.PLAT] === 'META' && r[AM.ID] && (r._new || !r[AM.LINKS] || needsText_(r) || (recheckAll && asKey_(r[AM.LAST]) >= weekAgo))) needMeta.push(r[AM.ID]);
    if (r[AM.PLAT] === 'TIKTOK' && tiktokLinks && tiktokLinks[r[AM.ID]]) r[AM.LINKS] = tiktokLinks[r[AM.ID]];
  });
  if (needMeta.length && accounts_('META').length) {
    const got = links || fetchMetaLinks_(needMeta);
    byKey.forEach(r => {
      const g = got[r[AM.ID]];
      if (!g) return;
      r[AM.LINKS] = g.links.length ? g.links.join(', ') : '-';
      r[AM.TEXT] = g.text || '-';
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

  // Campaign of each ad (rows from before the Campaign ID column): from Ads Raw.
  if (Array.from(byKey.values()).some(r => !r[AM.CAMP_ID])) {
    const campOf = new Map();
    rawRows_(APP.T.ADS, ADS_HEADERS.length).forEach(a => { if (a[4]) campOf.set(adKey_(a[1], String(a[8] || ''), a[5], a[7], a[9]), String(a[4])); });
    byKey.forEach((r, key) => { if (!r[AM.CAMP_ID] && campOf.has(key)) r[AM.CAMP_ID] = campOf.get(key); });
  }
  // The Campaign Map tab: a campaign's choice (or an emptied one) → every ad of that campaign.
  const picked = campChoicesFromTab_();
  byKey.forEach(r => { const k = campKey_(r[AM.PLAT], r[AM.CAMP_ID], r[AM.CAMP]); if (picked.has(k)) r[AM.CHOICE] = picked.get(k); });

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
    const d = decideProduct_(links, r[AM.CAMP], r[AM.SET], r[AM.AD], r[AM.TEXT]);
    (d.unknown || []).forEach(s => unassigned.add(s));
    r[AM.AUTO] = d.product; r[AM.SRC] = d.source;
    r[AM.NOTE] = [d.note, r._err || ''].filter(Boolean).join(' — ');
    const ovr = String(r[AM.OVR] || '').trim();
    if (ovr && !valid.has(ovr)) r[AM.NOTE] = 'الاختيار مش في تاب المنتجات: ' + ovr;
    const linkSig = links.slice().sort().join(', ');
    // A new or changed Override is a confirmation: remember the link it was confirmed against.
    if (ovr && ovr !== String(r[AM.CONF_VAL] || '')) { r[AM.CONF_VAL] = ovr; r[AM.CONF_AT] = nowText_(); r[AM.MAPPED] = linkSig; }
    if (!ovr && r[AM.CONF_VAL]) { r[AM.CONF_VAL] = ''; r[AM.CONF_AT] = ''; }
    if (!r[AM.MAPPED] && (ovr || ['LINK', 'CODE', 'TEXT', 'PAGE'].indexOf(d.source) >= 0)) r[AM.MAPPED] = linkSig;
    const changed = !!r[AM.MAPPED] && !!linkSig && r[AM.MAPPED] !== linkSig;
    r[AM.CHANGED] = changed;
    const useOvr = ovr && valid.has(ovr), camp = useOvr ? null : campChoice_(r[AM.CHOICE]);
    if (camp && !r[AM.MAPPED]) r[AM.MAPPED] = linkSig;
    r[AM.FINAL] = useOvr ? (ovr === 'MULTI' ? APP.MULTI : ovr) : camp ? camp
      : d.source === 'MULTI' ? APP.MULTI : d.product || APP.UNMAPPED;
    if (camp) r[AM.NOTE] = 'من Campaign Map' + (r[AM.NOTE] ? ' — ' + r[AM.NOTE] : '');
    r[AM.STATUS] = changed ? '⚠️' : useOvr || camp ? '✅' : ['LINK', 'CODE', 'TEXT', 'PAGE'].indexOf(d.source) >= 0 ? '✅'
      : (d.source === 'KEYWORD' || d.source === 'MULTI') ? '⚠️' : '❌';
    r[AM.SPEND] = round2_(spend[key] || 0);
  });
  PropertiesService.getDocumentProperties().setProperty('UNASSIGNED_SLUGS', Array.from(unassigned).join(', '));

  const order = { '❌': 0, '⚠️': 1, '✅': 2 }, out = Array.from(byKey.values())
    .sort((a, b) => (order[a[AM.STATUS]] - order[b[AM.STATUS]]) || (num_(b[AM.SPEND]) - num_(a[AM.SPEND])))
    .map(r => r.slice(0, W));
  if (!writeRows_(sh, out, W, [1, 3, 4, 5, 6, 7, 15, 17, 19, 21, 22, 23])) return out.length; // same as before: nothing to redraw
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
      { product: final, exact: r[AM.STATUS] === '✅' && final !== APP.MULTI && final !== APP.UNMAPPED,
        chosen: !!String(r[AM.OVR] || '').trim() || !!campChoice_(r[AM.CHOICE]) });
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
