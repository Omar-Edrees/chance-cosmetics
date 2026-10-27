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
