/*
 * Extension for Shopify stores:
 *  - Stock: read live stock from the Shopify Flow stock tab (+ optional one-time product export).
 *  - Products tab auto-filled from the stock sheet (title + handle + price) so ad landing pages map exactly.
 *  - "المنتجات": products from best seller to least, live stock, running ✅, key numbers.
 *  - "تعادل الحسابات": each ad account day by day vs break-even, to see where the month drops.
 *  - "توب 100": best sellers, highest ROAS, most stock, selling without ads and dead stock (22_top.gs).
 *  - "المحافظات": orders, cancellation, delivery and return by governorate (25_governorates.gs).
 *  - Today: what's left in each Meta ad account, read every 15 minutes (26_balances.gs).
 *  - Running ✅ = the product has at least one ACTIVE Meta ad now (or TikTok spend today/yesterday).
 * Read-only on Meta and Shopify.
 */

function chanceSetup_() {
  ensureTab_(X.PRODUCTS); ensureTab_(X.ACC_BE); ensureTab_(X.CATALOG); ensureTab_(X.FUNNEL); ensureTab_(X.ACTUAL); ensureTab_(X.TOP); ensureTab_(X.GOV);
  const tk = ['date', 'account_id', 'campaign', 'adgroup', 'ad_id', 'ad', 'spend', 'impressions', 'clicks', 'purchases', 'landing']
    .map(k => cfgStr_('tiktok.col.' + k)).filter(Boolean);
  ensureTab_(cfgStr_('tiktok.tab') || 'TikTok Data', tk);
}
function chanceLive_() {
  STOCK_ = null;
  const props = PropertiesService.getDocumentProperties(), today = todayKey_();
  if (props.getProperty('STOCK_DAY') !== today) { // stock → Products: once a day
    props.setProperty('STOCK_DAY', today);
    try { if (autoAddProducts_()) withLock_(() => refreshAdMap_([], {}, false)); } catch (e) { setStatus_('STOCK', '✗ ' + errText_(e)); }
  }
  try { refreshActive_(); } catch (e) { setStatus_('ACTIVE', '✗ ' + errText_(e)); }
  try { refreshBalances_(); } catch (e) { setStatus_('BALANCE', '✗ ' + errText_(e)); }
}
function chanceViews_(slow) { writeCatalogTab_(); writeGovTab_(); if (slow) { writeProductsTab_(); writeAccountsBE_(); writeTopTab_(); } }
function chanceEdit_(name, a1) {
  if (name === X.PRODUCTS && (a1 === 'B2' || a1 === 'B3')) writeProductsTab_();
  if (name === X.ACC_BE && a1 === 'B2') writeAccountsBE_();
  if (name === X.TOP && (a1 === 'B2' || a1 === 'B3')) writeTopTab_();
  if (name === X.GOV && (a1 === 'B2' || a1 === 'B3')) writeGovTab_();
}
function refreshProductsNow() {
  try {
    resetCaches_(); chanceLive_();
    withLock_(() => { rebuildViews_({ full: true, slow: true }); });
    alert_('اتحدثت المنتجات والستوك ✅\nالستوك: ' + getStatus_('STOCK') + '\nالإعلانات الشغالة: ' + getStatus_('ACTIVE'));
    ss_().setActiveSheet(tab_(X.PRODUCTS));
  } catch (e) { alert_('التحديث ماكملش:\n' + errText_(e)); }
}

/* Extension hooks the engine calls. Arrow wrappers so files load in any order.
 * views: after the core views are rebuilt (inside the lock). edit: onEdit(e). setup: inside setupAll's lock.
 * live: after ads sync, before views (outside the lock, for reads). menu: [label, functionName]. */
const EXT = {
  views: [slow => chanceViews_(slow)],
  edit: [(name, a1) => chanceEdit_(name, a1)],
  setup: [() => chanceSetup_()],
  live: [() => refreshAccountNames_(), () => discoverAccounts_(), () => chanceLive_(), () => refreshTodayFunnel_(), () => refreshFunnel_(false)],
  menu: [['📦 تحديث المنتجات والستوك وتوب 100', 'refreshProductsNow'], ['📈 تحديث Daily Account Funnel و Actual ROAS', 'refreshFunnelNow']]
};
