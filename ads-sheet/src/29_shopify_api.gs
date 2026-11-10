/*
 * Shopify app "Chance Ads Sheet." (Dev Dashboard, custom distribution) → where each order stands, read by the sheet itself.
 * Read-only: the app's scopes are read_*, and the sheet only sends GraphQL queries.
 *
 * Connecting (once, from the menu 🔑): the code is deployed as a Web app; its /exec URL is the app's Redirect URL.
 * The menu asks for the app's Client ID and Client secret (kept in the user's properties, never in the sheet), then opens
 * Shopify's approval page. Shopify sends the browser back to doGet with a code; doGet checks state + HMAC and trades the code
 * for an expiring offline token (1 hour) + refresh token (90 days, renewed with every refresh). The token is refreshed by itself.
 *
 * Every update (EXT.live, before the views): the orders updated since the last read (sorted by updated_at, 100 a page, up to
 * SHOPIFY.PAGES pages a run) → the hidden tab "Order Status": code (C/R/D/S/P as in 19_order_status.gs), revenue, cross-sell,
 * units. orderStatus_() reads that tab over the fixed file. Shopify only shows orders of the last 60 days without read_all_orders,
 * which is fine: older orders don't change any more, and they stay as the fixed file has them.
 */
const SHOPIFY = {
  API: '2026-10', DOMAIN: 'chance-eg.myshopify.com', TAB: 'Order Status',
  SCOPES: 'read_orders,read_products,read_inventory,read_returns,read_order_edits,read_reports,read_analytics',
  HEADERS: ['Order ID', 'Created at', 'Updated at', 'Code', 'Revenue', 'Cross-sell', 'Units'],
  FIRST_FROM: '2026-11-07T15:00:00Z', // the fixed file was read at 2026-11-07 17:45 Cairo: read again from a bit before
  SINCE_KEY: 'SHOPIFY_SINCE', DAY_KEY: 'SHOPIFY_STATUS_DAY', AT_KEY: 'SHOPIFY_STATUS_AT', PAGES: 20,
  ORDERS_QUERY: 'query($q:String!,$after:String){orders(first:100,after:$after,sortKey:UPDATED_AT,query:$q){' +
    'pageInfo{hasNextPage endCursor} nodes{id createdAt updatedAt cancelledAt displayFinancialStatus returnStatus ' +
    'subtotalLineItemsQuantity originalTotalPriceSet{shopMoney{amount}} currentTotalPriceSet{shopMoney{amount}} ' +
    'fulfillments{status displayStatus}}}}'
};

function shopifyDomain_() { return (cfgStr_('shopify.domain') || SHOPIFY.DOMAIN).replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase(); }
function shopifyProps_() { return PropertiesService.getUserProperties(); }
function shopifyHtml_(text) {
  const esc = String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
  return HtmlService.createHtmlOutput('<div dir="rtl" style="font-family:Arial,sans-serif;font-size:17px;line-height:1.8;padding:24px">' + esc + '</div>')
    .setTitle('ربط شوبيفاي');
}

/* Menu 🔑: Client ID + secret, then Shopify's approval page. */
function shopifyConnect() {
  const ui = SpreadsheetApp.getUi(), up = shopifyProps_();
  let url = '';
  try { url = ScriptApp.getService().getUrl() || ''; } catch (e) { url = ''; }
  if (!/\/exec$/.test(url)) {
    const a = ui.prompt('ربط شوبيفاي (1 من 3)', 'الصق لينك الـ Web app اللي آخره /exec (من Deploy ← Manage deployments).', ui.ButtonSet.OK_CANCEL);
    if (a.getSelectedButton() !== ui.Button.OK) return;
    url = a.getResponseText().trim();
    if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(url)) { ui.alert('ده مش لينك Web app. لازم يبدأ بـ https://script.google.com ويخلص بـ /exec'); return; }
  }
  const id = ui.prompt('ربط شوبيفاي (2 من 3)', 'الصق الـ Client ID من صفحة التطبيق في Dev Dashboard.', ui.ButtonSet.OK_CANCEL);
  if (id.getSelectedButton() !== ui.Button.OK) return;
  const sec = ui.prompt('ربط شوبيفاي (3 من 3)', 'الصق الـ Client secret. ماتبعتوش في أي شات.', ui.ButtonSet.OK_CANCEL);
  if (sec.getSelectedButton() !== ui.Button.OK) return;
  const clientId = id.getResponseText().trim(), secret = sec.getResponseText().trim();
  if (!clientId || /\s/.test(clientId) || !secret || /\s/.test(secret)) { ui.alert('الـ Client ID أو الـ secret مش صحيح.'); return; }
  const state = Utilities.getUuid();
  up.setProperties({ SHOPIFY_CLIENT_ID: clientId, SHOPIFY_CLIENT_SECRET: secret, SHOPIFY_STATE: state, SHOPIFY_REDIRECT: url });
  const link = 'https://' + shopifyDomain_() + '/admin/oauth/authorize?client_id=' + encodeURIComponent(clientId) +
    '&scope=' + encodeURIComponent(SHOPIFY.SCOPES) + '&redirect_uri=' + encodeURIComponent(url) + '&state=' + encodeURIComponent(state);
  const html = '<div dir="rtl" style="font-family:Arial,sans-serif;font-size:15px;line-height:1.8">' +
    '<p>1) اتأكد إن اللينك ده مكتوب في <b>Redirect URLs</b> في نسخة التطبيق، وإن النسخة دي اتعملها Release:</p>' +
    '<p dir="ltr" style="background:#f3f4f6;padding:8px;word-break:break-all;font-family:monospace">' + url + '</p>' +
    '<p>2) دوس الزرار، ووافق في شوبيفاي. هيرجعك لصفحة مكتوب فيها "اتربط ✅".</p>' +
    '<p><a href="' + link + '" target="_blank" style="display:inline-block;background:#008060;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">افتح صفحة الموافقة في شوبيفاي</a></p></div>';
  ui.showModalDialog(HtmlService.createHtmlOutput(html).setWidth(560).setHeight(360), 'ربط أبليكيشن شوبيفاي');
}

/* The Web app: Shopify sends the browser back here after the approval. */
function doGet(e) {
  let msg;
  try { msg = shopifyCallback_((e && e.parameter) || {}); } catch (err) { msg = '❌ الربط ماكملش:\n' + errText_(err); }
  return shopifyHtml_(msg);
}

/* HMAC of Shopify's redirect: every parameter but hmac, sorted, "k=v" joined with "&", SHA-256 with the client secret, hex. */
function shopifyHmacOk_(p, secret) {
  const msg = Object.keys(p).filter(k => k !== 'hmac' && k !== 'signature').sort().map(k => k + '=' + p[k]).join('&');
  const hex = Utilities.computeHmacSha256Signature(msg, secret).map(b => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join('');
  return hex === String(p.hmac || '').toLowerCase();
}

function shopifyCallback_(p) {
  const up = shopifyProps_(), secret = up.getProperty('SHOPIFY_CLIENT_SECRET'), clientId = up.getProperty('SHOPIFY_CLIENT_ID');
  if (!p.code) return 'الصفحة دي بتاعة ربط الشيت بشوبيفاي. ابدأ الربط من منيو الشيت: 🔑 ربط أبليكيشن شوبيفاي.';
  if (!secret || !clientId) throw new Error('ابدأ الربط من منيو الشيت الأول (🔑 ربط أبليكيشن شوبيفاي).');
  if (!p.state || p.state !== up.getProperty('SHOPIFY_STATE')) throw new Error('الطلب ده قديم أو مش من الشيت. ابدأ الربط من المنيو تاني.');
  if (String(p.shop || '').toLowerCase() !== shopifyDomain_()) throw new Error('المتجر ' + p.shop + ' مش متجر الشيت (' + shopifyDomain_() + ').');
  if (!shopifyHmacOk_(p, secret)) throw new Error('توقيع شوبيفاي مش مطابق. اتأكد إن الـ Client secret صح، وابدأ الربط تاني.');
  const r = UrlFetchApp.fetch('https://' + shopifyDomain_() + '/admin/oauth/access_token', { method: 'post', muteHttpExceptions: true,
    payload: { client_id: clientId, client_secret: secret, code: p.code, expiring: '1' } });
  const body = shopifyJson_(r);
  if (r.getResponseCode() !== 200 || !body.access_token) throw new Error('شوبيفاي رفض الكود (' + r.getResponseCode() + '): ' + String(r.getContentText()).slice(0, 200));
  shopifySaveToken_(body);
  up.deleteProperty('SHOPIFY_STATE');
  setStatus_('SHOPIFY', '✓ اتربط. الصلاحيات: ' + (body.scope || ''));
  return 'اتربط ✅\nالشيت هيقرا حالة الأوردرات من شوبيفاي لوحده مع كل تحديث.\nالصلاحيات: ' + (body.scope || '') + '\nتقدر تقفل الصفحة دي.';
}

function shopifyJson_(r) { try { return JSON.parse(r.getContentText() || '{}'); } catch (e) { return {}; } }
function shopifySaveToken_(b) {
  const now = Date.now(), v = { SHOPIFY_TOKEN: b.access_token };
  v.SHOPIFY_TOKEN_EXP = b.expires_in ? String(now + Number(b.expires_in) * 1000) : '';
  if (b.refresh_token) v.SHOPIFY_REFRESH = b.refresh_token;
  if (b.refresh_token_expires_in) v.SHOPIFY_REFRESH_EXP = String(now + Number(b.refresh_token_expires_in) * 1000);
  shopifyProps_().setProperties(v);
}

/* The access token, refreshed 10 minutes before it ends. '' when the sheet isn't connected. */
function shopifyToken_() {
  const up = shopifyProps_(), token = up.getProperty('SHOPIFY_TOKEN');
  if (!token) return '';
  const exp = Number(up.getProperty('SHOPIFY_TOKEN_EXP') || 0);
  if (!exp || Date.now() < exp - 600000) return token;
  const r = UrlFetchApp.fetch('https://' + shopifyDomain_() + '/admin/oauth/access_token', { method: 'post', muteHttpExceptions: true,
    payload: { client_id: up.getProperty('SHOPIFY_CLIENT_ID'), client_secret: up.getProperty('SHOPIFY_CLIENT_SECRET'),
      grant_type: 'refresh_token', refresh_token: up.getProperty('SHOPIFY_REFRESH') || '' } });
  const body = shopifyJson_(r);
  if (r.getResponseCode() !== 200 || !body.access_token) {
    throw new Error('مفتاح شوبيفاي خلص ومااتجددش (' + r.getResponseCode() + '). اعمل 🔑 ربط أبليكيشن شوبيفاي تاني.');
  }
  shopifySaveToken_(body);
  return body.access_token;
}

/* One GraphQL Admin API query (read-only), with retries when Shopify says slow down. */
function shopifyGql_(query, variables) {
  for (let i = 0; ; i++) {
    const r = UrlFetchApp.fetch('https://' + shopifyDomain_() + '/admin/api/' + SHOPIFY.API + '/graphql.json', { method: 'post',
      contentType: 'application/json', muteHttpExceptions: true, headers: { 'X-Shopify-Access-Token': shopifyToken_() },
      payload: JSON.stringify({ query: query, variables: variables || {} }) });
    const code = r.getResponseCode(), body = shopifyJson_(r);
    const throttled = code === 429 || (body.errors || []).some(x => ((x.extensions || {}).code || '') === 'THROTTLED');
    if (throttled && i < 4) { Utilities.sleep(2000 * (i + 1)); continue; }
    if (code === 401 || code === 403) throw new Error('شوبيفاي رفض الطلب (' + code + '): ' + String(r.getContentText()).slice(0, 200) + ' — اعمل 🔑 ربط أبليكيشن شوبيفاي تاني.');
    if (code !== 200) throw new Error('شوبيفاي (' + code + '): ' + String(r.getContentText()).slice(0, 200));
    if (body.errors && body.errors.length) throw new Error('شوبيفاي: ' + JSON.stringify(body.errors).slice(0, 300));
    return body.data;
  }
}

/* Where an order stands, from Shopify's fields (the same rules as the fixed file). */
function shopifyStatusCode_(o) {
  const ok = (o.fulfillments || []).filter(f => f.displayStatus !== 'CANCELED' && ['CANCELLED', 'ERROR', 'FAILURE'].indexOf(f.status) < 0);
  const shipped = ok.length > 0, cancelled = !!o.cancelledAt, fin = o.displayFinancialStatus;
  if (cancelled && !shipped) return 'C';
  if (o.returnStatus === 'RETURNED' || cancelled || (shipped && (fin === 'REFUNDED' || fin === 'VOIDED'))) return 'R';
  if (['PAID', 'PARTIALLY_REFUNDED', 'PARTIALLY_PAID'].indexOf(fin) >= 0) return 'D';
  return shipped ? 'S' : 'P';
}
/* A row of the "Order Status" tab. Revenue / cross-sell only for a delivered order (as the fixed file). */
function shopifyStatusRow_(o) {
  const code = shopifyStatusCode_(o), amt = x => Number(((x || {}).shopMoney || {}).amount || 0);
  const orig = amt(o.originalTotalPriceSet), cur = amt(o.currentTotalPriceSet), d = code === 'D';
  return [o.id, o.createdAt, o.updatedAt, code, d && Math.abs(cur - orig) > 0.005 ? round2_(cur) : '',
    d && cur - orig > 0.005 ? round2_(cur - orig) : '', o.subtotalLineItemsQuantity || ''];
}

/*
 * EXT.live: the orders Shopify changed since the last read → "Order Status". Pages go oldest change first, and the next read
 * starts from the last change read, so a long backlog is read over a few updates. Errors go to Health, never stop the update.
 */
function syncShopifyStatus_() {
  if (!shopifyProps_().getProperty('SHOPIFY_TOKEN')) return 0;
  const props = PropertiesService.getDocumentProperties();
  let since = props.getProperty(SHOPIFY.SINCE_KEY) || SHOPIFY.FIRST_FROM, after = null, more = true, pages = 0;
  const rows = [];
  try {
    while (more && pages < SHOPIFY.PAGES && timeLeft_()) {
      const res = shopifyGql_(SHOPIFY.ORDERS_QUERY, { q: "updated_at:>='" + since + "'", after: after }).orders;
      res.nodes.forEach(o => rows.push(shopifyStatusRow_(o)));
      more = res.pageInfo.hasNextPage; after = res.pageInfo.endCursor; pages++;
    }
  } catch (e) { setStatus_('SHOPIFY', '✗ ' + errText_(e)); if (!rows.length) return 0; more = true; }
  if (rows.length) {
    withLock_(() => shopifyMergeStatus_(rows));
    since = rows.reduce((m, r) => (r[2] > m ? r[2] : m), since);
    props.setProperty(SHOPIFY.SINCE_KEY, since);
  }
  if (!more) {
    props.setProperty(SHOPIFY.DAY_KEY, todayKey_());
    props.setProperty(SHOPIFY.AT_KEY, nowText_());
    setStatus_('SHOPIFY', '✓ ' + rows.length + ' أوردر اتغيرت حالته');
  } else if (rows.length) setStatus_('SHOPIFY', '… ' + rows.length + ' أوردر، والباقي في التحديث الجاي');
  ORDER_STATUS_ = null; // orderStatus_ reads the tab again
  return rows.length;
}
function shopifyMergeStatus_(rows) {
  const sh = ensureTab_(SHOPIFY.TAB, SHOPIFY.HEADERS), all = new Map();
  readRows_(sh, SHOPIFY.HEADERS.length).forEach(r => all.set(String(r[0]), r));
  rows.forEach(r => all.set(String(r[0]), r));
  const out = Array.from(all.values()).sort((a, b) => (String(a[1]) < String(b[1]) ? 1 : -1));
  writeRows_(sh, out, SHOPIFY.HEADERS.length, [1, 2, 3, 4]);
  try { sh.hideSheet(); } catch (e) { /* مش مهم */ }
}

/* Order ID → {code, revenue, cross, units} from the "Order Status" tab (empty when the sheet isn't connected). */
function liveOrderStatus_() {
  const sh = ss_().getSheetByName(SHOPIFY.TAB), out = new Map();
  if (!sh) return out;
  readRows_(sh, SHOPIFY.HEADERS.length).forEach(r => {
    if (!r[0] || 'CRDSP'.indexOf(String(r[3])) < 0) return;
    out.set(String(r[0]), { code: String(r[3]), revenue: r[4] === '' ? null : num_(r[4]), cross: num_(r[5]), units: r[6] === '' ? null : num_(r[6]) });
  });
  return out;
}
