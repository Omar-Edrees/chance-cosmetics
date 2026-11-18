/*
 * TikTok Marketing API (TikTok API for Business), read-only. The developer app is approved by TikTok; the advertiser
 * authorizes it once from the menu (الإعدادات ← ربط TikTok): the auth code becomes a long-term access token kept in
 * User Properties, never in the sheet. While a token exists, fetchTikTokTab_ reads TikTok from here instead of the
 * TikTok Data tab: one row per ad per day (spend, impressions, destination clicks, complete payments) and each ad's
 * landing page, which maps the ad to its product.
 */
const TT = {
  BASE: 'https://business-api.tiktok.com/open_api/v1.3/',
  MAX_DAYS: 30, // report/integrated/get by day: 30 days at most per request
  PAGE: 1000,
  METRICS: ['spend', 'impressions', 'clicks', 'complete_payment', 'campaign_id', 'campaign_name', 'adgroup_id', 'adgroup_name', 'ad_name']
};

function tiktokToken_() { return PropertiesService.getUserProperties().getProperty('TIKTOK_TOKEN') || ''; }

/* One API call. GET with the token, or POST body (the token exchange, which has no token yet). Returns data. */
function tiktokCall_(path, params, body) {
  const token = body ? '' : tiktokToken_();
  if (!body && !token) throw new Error('TikTok مش متربط. من المنيو: الإعدادات ← ربط TikTok.');
  const q = params ? '?' + Object.keys(params).map(k => encodeURIComponent(k) + '=' +
    encodeURIComponent(typeof params[k] === 'string' ? params[k] : JSON.stringify(params[k]))).join('&') : '';
  const opt = { muteHttpExceptions: true, headers: token ? { 'Access-Token': token } : {} };
  if (body) { opt.method = 'post'; opt.contentType = 'application/json'; opt.payload = JSON.stringify(body); }
  for (let a = 0; a < 3; a++) {
    const r = UrlFetchApp.fetch(TT.BASE + path + q, opt), status = r.getResponseCode();
    let p;
    try { p = JSON.parse(r.getContentText()); } catch (e) { throw new Error('TikTok رجع رد مش مفهوم (HTTP ' + status + ').'); }
    if (status >= 200 && status < 300 && Number(p.code) === 0) return p.data || {};
    const retry = status === 429 || status >= 500 || [40100, 50000, 50002].indexOf(Number(p.code)) >= 0;
    if (retry && a < 2) { Utilities.sleep((a + 1) * 2000); continue; }
    const msg = String(p.message || 'طلب فشل');
    throw new Error('TikTok' + (p.code ? ' code ' + p.code : ' HTTP ' + status) + ': ' + msg +
      (/token/i.test(msg) ? '\nالربط اتلغى أو التوكن مش شغال: اربط تاني من المنيو (الإعدادات ← ربط TikTok).'
        : /permission|scope|authori[sz]/i.test(msg) ? '\nالأبليكيشن مالوش إذن على الحساب ده: ادّي الإذن من Advertiser authorization URL.' : ''));
  }
}

/* Every page of a list endpoint (data.list + data.page_info). */
function tiktokAll_(path, params) {
  const out = [];
  for (let page = 1; page <= 200; page++) {
    const d = tiktokCall_(path, Object.assign({}, params, { page: page, page_size: params.page_size || TT.PAGE }));
    (d.list || []).forEach(x => out.push(x));
    const info = d.page_info || {};
    if (!info.total_page || page >= Number(info.total_page)) return out;
  }
  throw new Error('TikTok: صفحات كتير جدًا، القراية وقفت عشان ماتبقاش ناقصة.');
}

/*
 * Same result as the tab version: { ads, acc, accounts, links }. An account that fails is left out of accounts, so its
 * old rows stay as they are, and the others (and Meta) still update; the error goes to Health ("TikTok").
 */
function fetchTikTokApi_(since, until) {
  const ads = [], accSum = {}, links = {}, accounts = [], errors = [], linkErrors = [];
  const list = accounts_('TIKTOK');
  list.forEach(acc => {
    const rows = [];
    try {
      for (let from = since; from <= until;) {
        let to = shiftKey_(from, TT.MAX_DAYS - 1);
        if (to > until) to = until;
        tiktokAll_('report/integrated/get/', { advertiser_id: acc.id, report_type: 'BASIC', data_level: 'AUCTION_AD',
          dimensions: ['ad_id', 'stat_time_day'], metrics: TT.METRICS, start_date: from, end_date: to })
          .forEach(x => rows.push(x));
        from = shiftKey_(to, 1);
      }
    } catch (e) { errors.push((acc.name || acc.id) + ': ' + errText_(e)); return; }
    accounts.push('TIKTOK|' + acc.id);
    const name = acc.name || acc.id, adIds = new Set();
    rows.forEach(x => {
      const d = x.dimensions || {}, m = x.metrics || {}, key = asKey_(String(d.stat_time_day || '').slice(0, 10));
      const spend = round2_(num_(m.spend)), imp = num_(m.impressions), clicks = num_(m.clicks), buys = num_(m.complete_payment);
      if (!key || key < since || key > until || (!spend && !imp && !clicks && !buys)) return;
      const adId = String(d.ad_id || '');
      ads.push([key, 'TIKTOK', acc.id, name, String(m.campaign_id || ''), String(m.campaign_name || ''),
        String(m.adgroup_id || ''), String(m.adgroup_name || ''), adId, String(m.ad_name || ''), spend, imp, clicks, buys, 0]);
      const k = key + '|' + acc.id;
      accSum[k] = accSum[k] || [key, 'TIKTOK', acc.id, name, 0, 0];
      accSum[k][4] = round2_(accSum[k][4] + spend);
      accSum[k][5] += buys;
      if (adId) adIds.add(adId);
    });
    // Landing pages: a spend without its link still counts; the ad is then mapped by its name.
    try { Object.assign(links, tiktokLinks_(acc.id, Array.from(adIds))); } catch (e) { linkErrors.push((acc.name || acc.id) + ': ' + errText_(e)); }
  });
  if (list.length) {
    setStatus_('TIKTOK', (errors.length ? '✗ ' + errors.join(' | ') : '✓ ' + ads.length + ' صف (إعلان × يوم) من ' + accounts.length + ' حساب، ' +
      since + ' → ' + until) + (linkErrors.length ? ' | ⚠️ لينكات الإعلانات: ' + linkErrors.join(' | ') : ''));
  }
  return { ads: ads, acc: Object.keys(accSum).map(k => accSum[k]), accounts: accounts, links: links };
}

/* {adId: landing page URL} for the given ads, 100 per request. */
function tiktokLinks_(advertiserId, adIds) {
  const out = {};
  for (let i = 0; i < adIds.length; i += 100) {
    tiktokAll_('ad/get/', { advertiser_id: advertiserId, fields: ['ad_id', 'landing_page_url'],
      filtering: { ad_ids: adIds.slice(i, i + 100) }, page_size: 100 })
      .forEach(a => { if (a.ad_id && a.landing_page_url) out[String(a.ad_id)] = String(a.landing_page_url); });
  }
  return out;
}

/*
 * Menu: الإعدادات ← ربط TikTok. App ID + Secret (from My Apps; an empty answer keeps the saved one) and the link TikTok
 * opens after the advertiser approves (or just its auth_code). The code works once, within an hour.
 */
function tiktokConnect() {
  const ui = SpreadsheetApp.getUi(), props = PropertiesService.getUserProperties();
  const ask = (title, msg) => {
    const a = ui.prompt(title, msg, ui.ButtonSet.OK_CANCEL);
    return a.getSelectedButton() === ui.Button.OK ? a.getResponseText().trim() : null;
  };
  const savedId = props.getProperty('TIKTOK_APP_ID') || '', savedSecret = props.getProperty('TIKTOK_APP_SECRET') || '';
  const idIn = ask('ربط TikTok (1 من 3)', 'الصق App ID من صفحة My Apps في بورتال TikTok API for Business.' +
    (savedId ? '\nسيبها فاضية عشان تستخدم المحفوظ: ' + savedId : ''));
  if (idIn === null) return;
  const appId = idIn || savedId;
  if (!/^\d{6,}$/.test(appId)) { ui.alert('الـ App ID لازم يكون أرقام بس.'); return; }
  const secretIn = ask('ربط TikTok (2 من 3)', 'الصق الـ Secret من نفس الصفحة (زرار العين). بيتحفظ جوه Apps Script بس، ماتبعتوش في أي شات.' +
    (savedSecret ? '\nسيبها فاضية عشان تستخدم المحفوظ.' : ''));
  if (secretIn === null) return;
  const secret = secretIn || savedSecret;
  if (!secret || /\s/.test(secret)) { ui.alert('الـ Secret مش صحيح.'); return; }
  const link = ask('ربط TikTok (3 من 3)', 'افتح Advertiser authorization URL من صفحة الأبليكيشن، واختار الحساب الإعلاني، ووافق.\n' +
    'هيفتحلك صفحة على profitlens.site: انسخ اللينك كله من فوق والصقه هنا (أو الـ auth_code لوحده).\nالكود بيشتغل مرة واحدة وبيخلص بعد ساعة.');
  if (link === null) return;
  const m = link.match(/auth_code=([^&#\s]+)/), code = m ? decodeURIComponent(m[1]) : link;
  if (!code || /\s/.test(code)) { ui.alert('مش لاقي auth_code في اللي اتلصق.'); return; }
  props.setProperty('TIKTOK_APP_ID', appId);
  props.setProperty('TIKTOK_APP_SECRET', secret);
  let data;
  try { data = tiktokCall_('oauth2/access_token/', null, { app_id: appId, secret: secret, auth_code: code }); } catch (e) {
    ui.alert('الربط ماتمش:\n' + errText_(e) + '\n\nلو الكود اتستخدم قبل كده أو عدّى عليه ساعة، خد واحد جديد من Advertiser authorization URL وجرّب تاني.');
    return;
  }
  if (!data.access_token) { ui.alert('TikTok مارجّعش توكن. جرّب تاني بكود جديد.'); return; }
  props.setProperty('TIKTOK_TOKEN', data.access_token);
  const allowed = (data.advertiser_ids || []).map(String), accs = accounts_('TIKTOK');
  const missing = accs.filter(a => allowed.indexOf(a.id) < 0);
  setStatus_('TIKTOK', 'اتربط، ولسه ماتقراش');
  ui.alert('اتربط TikTok ✅\nالحسابات اللي ليك إذن عليها: ' + (allowed.join('، ') || '—') +
    (!accs.length ? '\n⚠️ مفيش حساب TIKTOK في تاب Accounts: ضيف رقمه هناك.'
      : missing.length ? '\n⚠️ مش متاح: ' + missing.map(a => (a.name || a.id) + ' (' + a.id + ')').join('، ') + '. ادّيله الإذن من نفس اللينك واربط تاني.'
        : '\nكل حسابات TikTok اللي في تاب Accounts متاحة.') +
    '\n\nمن دلوقتي الشيت بيقرا TikTok لوحده مع كل تحديث، مكان تاب TikTok Data. عشان الشهر كله يتقري: الإعدادات ← أول سحب.');
}
