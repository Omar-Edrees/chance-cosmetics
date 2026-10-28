/* Meta Graph API, read-only. Token is pasted once from the menu and kept in User Properties. */

function metaToken_() {
  const t = PropertiesService.getUserProperties().getProperty('META_TOKEN');
  if (!t) throw new Error('توكن ميتا مش موجود. من المنيو: الإعدادات ← ربط توكن Meta.');
  return t;
}
function metaUrl_(path, params) {
  const q = Object.keys(params).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(String(params[k]))).join('&');
  return 'https://graph.facebook.com/' + (cfgStr_('meta.api_version') || 'v26.0') + '/' + path + (q ? '?' + q : '');
}
function metaFetch_(url) {
  const token = metaToken_();
  for (let a = 0; a < 3; a++) {
    const r = UrlFetchApp.fetch(url, { muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + token } });
    const status = r.getResponseCode();
    let p;
    try { p = JSON.parse(r.getContentText()); } catch (e) { throw new Error('Meta رجعت رد مش مفهوم (HTTP ' + status + ').'); }
    if (status >= 200 && status < 300 && !p.error) return p;
    const e = p.error || {}, retry = status === 429 || status >= 500 || [1, 2, 4, 17, 32, 613].includes(Number(e.code));
    if (retry && a < 2) { Utilities.sleep((a + 1) * 1500); continue; }
    throw new Error('Meta' + (e.code ? ' code ' + e.code : '') + ': ' + (e.error_user_msg || e.message || 'طلب فشل'));
  }
}
function metaGet_(path, params) { return metaFetch_(metaUrl_(path, params || {})); }
/* All pages. Guard against endless paging. */
function metaAll_(path, params) {
  const out = [];
  let url = metaUrl_(path, Object.assign({ limit: 500 }, params || {})), guard = 0;
  while (url && guard++ < 200) {
    const p = metaFetch_(url);
    (p.data || []).forEach(x => out.push(x));
    url = p.paging && p.paging.next ? p.paging.next : null;
  }
  if (guard >= 200) throw new Error('Meta: صفحات كتير جدًا، التحديث وقف عشان مايبقاش ناقص.');
  return out;
}
/* Several GETs in parallel; failed ones are retried one by one. Returns [{payload}|{error}]. */
function metaMany_(paths) {
  const token = metaToken_();
  let res = [];
  try {
    res = UrlFetchApp.fetchAll(paths.map(p => ({ url: metaUrl_(p.path, p.params), muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + token } })));
  } catch (e) { res = []; }
  return paths.map((p, i) => {
    try {
      const r = res[i];
      if (r && r.getResponseCode() < 300) { const j = JSON.parse(r.getContentText()); if (!j.error) return { payload: j }; }
    } catch (ignored) {}
    try { return { payload: metaGet_(p.path, p.params) }; } catch (e) { return { error: errText_(e) }; }
  });
}
/* Exactly one purchase type per row: the first listed type that exists. Never adds types together. */
function metaPick_(list) {
  if (!list) return 0;
  for (const t of cfgList_('meta.purchase_actions')) {
    const a = list.find(x => x.action_type === t);
    if (a) return num_(a.value);
  }
  return 0;
}

function metaConnect() {
  const ui = SpreadsheetApp.getUi();
  const a = ui.prompt('ربط Meta', 'الصق System User token (صلاحية ads_read بس). ماتبعتوش في أي شات.', ui.ButtonSet.OK_CANCEL);
  if (a.getSelectedButton() !== ui.Button.OK) return;
  const t = a.getResponseText().trim().replace(/^Bearer\s+/i, '');
  if (!t || /\s/.test(t)) { ui.alert('التوكن مش صحيح.'); return; }
  PropertiesService.getUserProperties().setProperty('META_TOKEN', t);
  try {
    const accs = accounts_('META');
    accs.forEach(acc => metaGet_('act_' + acc.id, { fields: 'id,name,currency,timezone_name' }));
    ui.alert('اتربط ✅ واتأكدت من ' + accs.length + ' حساب.');
  } catch (e) { ui.alert('التوكن اتحفظ، بس فيه حساب مش متاح:\n' + errText_(e)); }
}

/*
 * Accounts tab Name ← the account's name in Meta, once a day. A name typed by hand stays: only an empty cell,
 * the setup placeholder ("Meta 4660") or the name written here last time is replaced.
 */
function refreshAccountNames_() {
  const props = PropertiesService.getDocumentProperties(), today = todayKey_();
  if (props.getProperty('ACC_NAMES_DAY') === today) return;
  const sh = ss_().getSheetByName(APP.T.ACCOUNTS);
  if (!sh || sh.getLastRow() < 2) return;
  let auto = {}, failed = false;
  try { auto = JSON.parse(props.getProperty('ACC_NAMES_AUTO') || '{}'); } catch (e) { auto = {}; }
  sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues().forEach((r, i) => {
    const id = String(r[1]).replace(/^act_/i, '').trim(), cur = String(r[2] || '').trim();
    if (String(r[0]).trim().toUpperCase() !== 'META' || !id) return;
    if (cur && !/^Meta \d{4}$/.test(cur) && cur !== auto[id]) return;
    try {
      const name = String(metaGet_('act_' + id, { fields: 'name' }).name || '').trim();
      if (!name) return;
      if (name !== cur) sh.getRange(i + 2, 3).setValue(name);
      auto[id] = name;
    } catch (e) { failed = true; console.error('اسم الحساب ' + id + ': ' + errText_(e)); }
  });
  props.setProperty('ACC_NAMES_AUTO', JSON.stringify(auto));
  if (!failed) props.setProperty('ACC_NAMES_DAY', today);
}

/*
 * Meta orders whose UTM carries a campaign / ad ID that no tracked account has: ask Meta which account it belongs to
 * and add that account to the Accounts tab (then pull its month). Needs the token to see that account.
 * Each ID is asked once a day at most.
 */
function discoverAccounts_() {
  const osh = ss_().getSheetByName(APP.T.ORDERS), ash = ss_().getSheetByName(APP.T.ADS);
  if (!osh || !ash || !accounts_('META').length) return;
  const props = PropertiesService.getDocumentProperties(), today = todayKey_(), weekAgo = shiftKey_(today, -7);
  if (props.getProperty('ACC_DISCOVER_DAY') === today) return; // once a day
  props.setProperty('ACC_DISCOVER_DAY', today);
  const known = new Set();
  readRows_(ash, ADS_HEADERS.length).forEach(a => { [a[4], a[6], a[8]].forEach(x => { if (x) known.add(String(x)); }); });
  const ids = new Set();
  readRows_(osh, ORDERS_HEADERS.length).forEach(o => {
    if (o[3] !== 'META' || o[14] || asKey_(o[2]) < weekAgo) return;
    ([o[11], o[12], o[13]].join(' ').match(/\d{15,}/g) || []).forEach(x => { if (!known.has(x)) ids.add(x); });
  });
  let tried = {};
  try { tried = JSON.parse(props.getProperty('ACC_DISCOVER_TRIED') || '{}'); } catch (e) { tried = {}; }
  const have = new Set(accounts_().map(a => a.platform + '|' + a.id)), added = [], denied = [];
  Array.from(ids).filter(id => tried[id] !== today).slice(0, 5).forEach(id => {
    tried[id] = today;
    try {
      const acc = String(metaGet_(id, { fields: 'account_id' }).account_id || '');
      if (!acc || have.has('META|' + acc)) return;
      const info = metaGet_('act_' + acc, { fields: 'name' });
      ensureTab_(APP.T.ACCOUNTS).appendRow(['META', acc, String(info.name || acc), 'اتضاف لوحده: أوردرات جاية منه', true, '']);
      have.add('META|' + acc); added.push(acc);
    } catch (e) { denied.push(id); }
  });
  props.setProperty('ACC_DISCOVER_TRIED', JSON.stringify(tried));
  if (added.length) {
    startBackfill_(today.slice(0, 8) + '01', today, added);
    setStatus_('ACC_DISCOVER', '✓ اتضاف ' + added.join(', ') + ' — صرفه بيتسحب من أول الشهر');
  } else if (denied.length) {
    setStatus_('ACC_DISCOVER', '⚠️ أوردرات من كامبين/إعلان مش متاح بالتوكن: ' + denied.join(', ') + ' — ضيف حسابه للـ System User');
  }
}
