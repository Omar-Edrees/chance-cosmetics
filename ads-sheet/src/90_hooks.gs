/*
 * Extension for Shopify stores:
 *  - Stock: read live stock from the Shopify Flow stock tab (+ optional one-time product export).
 *  - Products tab auto-filled from the stock sheet (title + handle + price) so ad landing pages map exactly.
 *  - "المنتجات": products from best seller to least, live stock, running ✅, key numbers.
 *  - "تعادل الحسابات": each ad account day by day vs break-even, to see where the month drops.
 *  - Running ✅ = the product has at least one ACTIVE Meta ad now (or TikTok spend today/yesterday).
 * Read-only on Meta and Shopify.
 */

function chanceSetup_() {
  ensureTab_(X.PRODUCTS); ensureTab_(X.ACC_BE); ensureTab_(X.CATALOG);
  const tk = ['date', 'account_id', 'campaign', 'adgroup', 'ad_id', 'ad', 'spend', 'impressions', 'clicks', 'purchases', 'landing']
    .map(k => cfgStr_('tiktok.col.' + k)).filter(Boolean);
  ensureTab_(cfgStr_('tiktok.tab') || 'TikTok Data', tk);
}
function chanceLive_() {
  STOCK_ = null;
  try { if (autoAddProducts_()) withLock_(() => refreshAdMap_([], {}, false)); } catch (e) { setStatus_('STOCK', '✗ ' + errText_(e)); }
  try { refreshActive_(); } catch (e) { setStatus_('ACTIVE', '✗ ' + errText_(e)); }
}
function chanceViews_() { writeCatalogTab_(); writeProductsTab_(); writeAccountsBE_(); }
function chanceEdit_(name, a1) {
  if (name === X.PRODUCTS && (a1 === 'B2' || a1 === 'B3')) writeProductsTab_();
  if (name === X.ACC_BE && a1 === 'B2') writeAccountsBE_();
}
function refreshProductsNow() {
  try {
    resetCaches_(); chanceLive_();
    withLock_(() => { rebuildViews_(); });
    alert_('اتحدثت المنتجات والستوك ✅\nالستوك: ' + getStatus_('STOCK') + '\nالإعلانات الشغالة: ' + getStatus_('ACTIVE'));
    ss_().setActiveSheet(tab_(X.PRODUCTS));
  } catch (e) { alert_('التحديث ماكملش:\n' + errText_(e)); }
}

/* Extension hooks the engine calls. Arrow wrappers so files load in any order.
 * views: after the core views are rebuilt (inside the lock). edit: onEdit(e). setup: inside setupAll's lock.
 * live: after ads sync, before views (outside the lock, for reads). menu: [label, functionName]. */
const EXT = {
  views: [() => chanceViews_()],
  edit: [(name, a1) => chanceEdit_(name, a1)],
  setup: [() => chanceSetup_()],
  live: [() => refreshAccountNames_(), () => chanceLive_(), () => refreshTodayFunnel_()],
  menu: [['📦 تحديث المنتجات والستوك', 'refreshProductsNow']]
};
