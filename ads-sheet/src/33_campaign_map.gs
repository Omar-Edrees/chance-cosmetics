/*
 * Tab "Campaign Map": the simple way to say what each campaign is for. One row per campaign that spent this month (only
 * this month, so it stays short), the ones that need you first:
 *   ❌ the sheet doesn't know what it's for, ⚠️ it goes to a page with many products (give it a name), ✅ known.
 * The yellow column: pick a product, or "كتالوج", or type a name for a page / category (Home Wear, Lingerie, Makeup …).
 * The choice goes to every ad of the campaign in the Ad Map (hidden; it keeps the choice after the month ends), past days
 * too, from the next update. Spend and orders of that campaign then count on that product or name everywhere.
 * An ad's own Override in the Ad Map still wins over its campaign's choice.
 */
const CMAP = {
  TAB: 'Campaign Map', HEAD_ROW: 4, CATALOG_WORD: 'كتالوج', CHOICE_COL: 9, ID_COL: 10,
  HEADERS: ['الحالة', 'الكامبين', 'الحساب', 'إعلانات شغالة دلوقتي', 'صرف النهارده', 'صرف الشهر', 'رايحة فين',
    'الشيت شايفها تبع', 'تبع إيه؟ (اختار أو اكتب)', 'Campaign ID']
};

/* One key per campaign: platform + campaign ID (a campaign without an ID, from a TikTok export: its name). */
function campKey_(platform, campId, campName) {
  return String(platform || '') + '|' + (campId ? String(campId) : 'name:' + norm_(campName));
}

/* What a typed choice means: a product's exact name, CATALOG, or the name itself (a page / category). '' = no choice. */
function campChoice_(text) {
  const t = String(text || '').trim();
  if (!t) return '';
  const n = norm_(t);
  if (n === norm_(CMAP.CATALOG_WORD) || n === 'catalog' || n === norm_(APP.CATALOG)) return APP.CATALOG;
  const p = products_().find(x => norm_(x.name) === n);
  return p ? p.name : t;
}

/* key → the text in the yellow cell, for every campaign row in the tab (an empty cell too: it clears the choice). */
function campChoicesFromTab_() {
  const out = new Map(), sh = ss_().getSheetByName(CMAP.TAB);
  if (!sh || sh.getLastRow() <= CMAP.HEAD_ROW) return out;
  sh.getRange(CMAP.HEAD_ROW + 1, 1, sh.getLastRow() - CMAP.HEAD_ROW, CMAP.ID_COL).getValues().forEach(r => {
    const k = String(r[CMAP.ID_COL - 1] || '').trim();
    if (k.indexOf('|') > 0) out.set(k, String(r[CMAP.CHOICE_COL - 1] === null ? '' : r[CMAP.CHOICE_COL - 1]).trim());
  });
  return out;
}

/* Short "where it goes" for an ad: the store page's path, a post, or messages. */
function campLanding_(links, text) {
  const store = links.map(l => {
    let u = String(l);
    try { u = decodeURIComponent(u); } catch (e) { /* as is */ }
    const m = u.match(/^(?:https?:\/\/)?([^\/?#\s]+)([^?#\s]*)/i);
    if (!m || /facebook|fb\.com|fb\.me|whatsapp|wa\.me|instagram|messenger|fbcdn/i.test(m[1])) return '';
    const path = m[2].replace(/\/+$/, '').replace(/^\/(ar|en)(?=\/|$)/, '') || '/';
    return path === '/' ? 'الصفحة الرئيسية' : path.replace(/^\//, '');
  }).filter(Boolean);
  if (store.length) return store[0];
  if (links.some(l => /whatsapp|wa\.me|messenger/i.test(l))) return 'رسايل (ماسنجر / واتساب)';
  return text && text !== '-' ? 'بوست (اللينك مش باين للشيت)' : '';
}

/*
 * The rows of the tab (and of the warning in Today): every campaign that spent this month.
 * {key, platform, id, name, account, active, today, month, landing, seen, choice, status}
 */
function campaignMapRows_() {
  const today = todayKey_(), month0 = today.slice(0, 8) + '01', camps = new Map(), byAd = new Map(), catRaw = new Set();
  rawRows_(APP.T.ADMAP, ADMAP_HEADERS.length).forEach(r => byAd.set(adKey_(r[AM.PLAT], String(r[AM.ID]), r[AM.CAMP], r[AM.SET], r[AM.AD]), r));
  if (ss_().getSheetByName(APP.T.CATALOG)) recentRows_(APP.T.CATALOG, CATALOG_HEADERS.length, 1, asKey_, month0).forEach(r => { if (r[3]) catRaw.add(r[1] + '|' + String(r[3])); });
  const prodNames = new Set(products_().map(p => p.name)), running = activeCampaigns_(), picked = campChoicesFromTab_();
  recentRows_(APP.T.ADS, ADS_HEADERS.length, 1, asKey_, month0).forEach(a => {
    const d = asKey_(a[0]), s = num_(a[10]);
    if (!d || d < month0 || s <= 0) return;
    const key = campKey_(a[1], a[4], a[5]);
    if (!camps.has(key)) camps.set(key, { key: key, platform: a[1], id: String(a[4] || ''), name: a[5], account: a[3], last: '', today: 0, month: 0,
      seen: {}, where: {}, stored: '' });
    const c = camps.get(key), r = byAd.get(adKey_(a[1], String(a[8] || ''), a[5], a[7], a[9]));
    if (d >= c.last) { c.last = d; c.name = a[5]; c.account = a[3]; }
    c.month += s; if (d === today) c.today += s;
    // What the sheet itself sees for this ad (without the campaign's choice): its Override, else its evidence.
    let own = APP.UNMAPPED, links = [], text = '';
    if (r) {
      const ovr = String(r[AM.OVR] || '').trim();
      own = ovr && (prodNames.has(ovr) || ovr === 'MULTI') ? (ovr === 'MULTI' ? APP.MULTI : ovr)
        : r[AM.SRC] === 'MULTI' ? APP.MULTI : r[AM.AUTO] || APP.UNMAPPED;
      if (r[AM.CHOICE] && !c.stored) c.stored = String(r[AM.CHOICE]);
      links = String(r[AM.LINKS] || '').split(',').map(x => x.trim()).filter(x => x && x !== '-');
      text = String(r[AM.TEXT] || '');
    }
    if (!prodNames.has(own) && catRaw.has(a[1] + '|' + String(a[8] || ''))) own = APP.CATALOG;
    c.seen[own] = (c.seen[own] || 0) + s;
    const w = campLanding_(links, text);
    if (w) c.where[w] = (c.where[w] || 0) + s;
  });
  const top = o => Object.keys(o).sort((x, y) => o[y] - o[x]);
  const label = n => (n === APP.UNMAPPED ? '❌ مش معروف' : n === APP.MULTI ? 'صفحة فيها كذا منتج' : n === APP.CATALOG ? CMAP.CATALOG_WORD : n);
  const out = Array.from(camps.values()).map(c => {
    const choice = picked.has(c.key) ? picked.get(c.key) : c.stored, chosen = campChoice_(choice);
    const seen = top(c.seen), where = top(c.where);
    const status = chosen ? '✅' : c.seen[APP.UNMAPPED] ? '❌' : c.seen[APP.MULTI] ? '⚠️' : '✅';
    const pct = n => (seen.length > 1 ? ' (' + Math.round(100 * c.seen[n] / c.month) + '%)' : '');
    return { key: c.key, platform: c.platform, id: c.id, name: c.name, account: c.account, active: running[c.id] || 0,
      today: round2_(c.today), month: round2_(c.month), status: status, choice: choice,
      landing: where.length ? where[0] + (where.length > 1 ? ' +' + (where.length - 1) : '') : '',
      seen: seen.slice(0, 3).map(n => label(n) + pct(n)).join(' + ') + (seen.length > 3 ? ' + …' : '') };
  });
  const order = { '❌': 0, '⚠️': 1, '✅': 2 };
  return out.sort((a, b) => (order[a.status] - order[b.status]) || ((b.active > 0) - (a.active > 0)) || (b.today - a.today) || (b.month - a.month));
}

/* EXT.views: the tab, drawn again with every update. The yellow cells keep what was typed in them. */
function writeCampaignMap_() {
  const rows = campaignMapRows_(), sh = ensureTab_(CMAP.TAB), W = CMAP.HEADERS.length, today = todayKey_();
  const p = today.split('-').map(Number), month = Utilities.formatDate(new Date(Date.UTC(p[0], p[1] - 1, p[2], 12)), 'UTC', 'MMMM yyyy');
  const n = s => rows.filter(x => x.status === s).length;
  const top = [
    ['ربط الكامبينات — ' + month + ' (الكامبينات اللي صرفت الشهر ده بس)'].concat(new Array(W - 1).fill('')),
    ['❌ أو ⚠️ = محتاجة منك: اختار في العمود الأصفر المنتج، أو "' + CMAP.CATALOG_WORD + '"، أو اكتب اسم الصفحة أو الكاتيجوري اللي الكامبين رايحة لها (زي Home Wear). ' +
      'الاختيار بيتطبق على كل إعلانات الكامبين، والأيام اللي فاتت كمان، في التحديث الجاي.'].concat(new Array(W - 1).fill('')),
    ['❌ ' + n('❌') + ' مش معروفة   ⚠️ ' + n('⚠️') + ' محتاجة اسم   ✅ ' + n('✅') + ' مربوطة'].concat(new Array(W - 1).fill('')),
    CMAP.HEADERS.slice()];
  const body = rows.map(x => [x.status, x.name, x.account, x.active || '', x.today || '', x.month, x.landing, x.seen,
    x.choice, x.key]);
  const all = top.concat(body.length ? body : [['مفيش كامبينات صرفت الشهر ده لسه'].concat(new Array(W - 1).fill(''))]);
  const old = sh.getLastRow();
  if (all.length > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), all.length - sh.getMaxRows());
  if (sh.getMaxColumns() < W) sh.insertColumnsAfter(sh.getMaxColumns(), W - sh.getMaxColumns());
  sh.getRange(1, 1, all.length, W).setNumberFormat('@');
  sh.getRange(CMAP.HEAD_ROW + 1, 4, Math.max(body.length, 1), 3).setNumberFormat('#,##0');
  sh.getRange(1, 1, all.length, W).setValues(all).setFontWeight('normal').setBackground(null).setFontColor('#000000');
  if (old > all.length) sh.getRange(all.length + 1, 1, old - all.length, W).clearContent().clearDataValidations().setBackground(null);
  sh.getRange(1, 1).setFontWeight('bold').setFontSize(13);
  sh.getRange(2, 1).setFontColor('#374151');
  sh.getRange(3, 1).setFontWeight('bold');
  sh.getRange(CMAP.HEAD_ROW, 1, 1, W).setFontWeight('bold').setBackground('#1f2937').setFontColor('#ffffff');
  if (body.length) {
    const choice = sh.getRange(CMAP.HEAD_ROW + 1, CMAP.CHOICE_COL, body.length, 1);
    const groups = Array.from(new Set(rows.map(x => campChoice_(x.choice)).filter(c => c && c !== APP.CATALOG && !products_().some(p => p.name === c))));
    choice.setBackground('#fff2cc').setDataValidation(SpreadsheetApp.newDataValidation()
      .requireValueInList([CMAP.CATALOG_WORD].concat(groups, products_().map(p => p.name)).slice(0, 500), true).setAllowInvalid(true).build());
    sh.getRange(CMAP.HEAD_ROW + 1, CMAP.ID_COL, body.length, 1).setFontColor('#9ca3af');
    const st = sh.getRange(CMAP.HEAD_ROW + 1, 1, body.length, 1);
    sh.setConditionalFormatRules([
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('❌').setBackground('#f4cccc').setRanges([st]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('⚠️').setBackground('#fff4ce').setRanges([st]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('✅').setBackground('#d9ead3').setRanges([st]).build()]);
  }
  sh.setFrozenRows(CMAP.HEAD_ROW);
  [[1, 60], [2, 360], [3, 150], [4, 90], [5, 100], [6, 100], [7, 200], [8, 260], [9, 280], [10, 150]].forEach(w => sh.setColumnWidth(w[0], w[1]));
  // The engine's ad-by-ad tab: hidden once (you can show it again; it stays as you leave it).
  const props = PropertiesService.getDocumentProperties(), am = ss_().getSheetByName(APP.T.ADMAP);
  if (am && !props.getProperty('ADMAP_HIDDEN_V1')) { try { am.hideSheet(); } catch (e) { /* مش مهم */ } props.setProperty('ADMAP_HIDDEN_V1', '1'); }
}

/* onEdit: a choice typed in the yellow column → its row says it's waiting for the next update. */
function campaignMapEdit_(name, a1) {
  if (name !== CMAP.TAB) return;
  const m = String(a1).match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/);
  if (!m || m[1] !== 'I' || (m[3] && m[3] !== 'I')) return;
  const from = Number(m[2]), to = Number(m[4] || m[2]), sh = ss_().getSheetByName(CMAP.TAB);
  for (let r = Math.max(from, CMAP.HEAD_ROW + 1); r <= to; r++) sh.getRange(r, 1).setValue('⏳');
}

/*
 * Today, under the stock table: the running campaigns (ads active now, or spent today) the sheet can't put on a product.
 * One line each (up to 5), red. Returns the next free row.
 */
function todayCampaignWarning_(g, r) {
  const bad = campaignMapRows_().filter(x => x.status !== '✅' && (x.active > 0 || x.today > 0));
  if (!bad.length) {
    g.set(r, 1, '✅ كل الكامبينات الشغالة مربوطة بمنتجاتها (تاب ' + CMAP.TAB + ')', { fc: '#38761d', b: 'bold' });
    g.merge(r, 1, 1, 6);
    return r + 1;
  }
  const spent = bad.reduce((s, x) => s + x.today, 0);
  g.set(r, 1, '⚠️ ' + bad.length + ' كامبين شغالة مش مربوطة بمنتج' + (spent > 0 ? '، صرفت النهارده ' + Math.round(spent).toLocaleString('en-US') + ' جنيه' : '') +
    ' — اربطها من تاب ' + CMAP.TAB, { bg: TODAY.RED, b: 'bold' });
  g.fill(r, 2, 5, { bg: TODAY.RED });
  g.merge(r, 1, 1, 6);
  r++;
  bad.slice(0, 5).forEach(x => {
    g.set(r, 1, (x.status === '❌' ? '❌ مش معروفة: ' : '⚠️ محتاجة اسم: ') + x.name + (x.landing ? '  ←  ' + x.landing : ''), { bg: '#fde8e8' });
    g.fill(r, 2, 5, { bg: '#fde8e8' });
    g.merge(r, 1, 1, 6);
    r++;
  });
  if (bad.length > 5) { g.set(r, 1, '… و ' + (bad.length - 5) + ' كمان في تاب ' + CMAP.TAB, { fc: '#6b7280' }); g.merge(r, 1, 1, 6); r++; }
  return r;
}
