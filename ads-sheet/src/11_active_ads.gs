/*
 * Running now: products with at least one ACTIVE Meta ad. Read-only on Meta.
 * An ad that goes to a product's page counts on that product even when Meta also splits its spend by catalog product
 * (product extensions: a catalog carousel under the video); only ads with no product of their own count as CATALOG.
 */

function refreshActive_() {
  const accs = accounts_('META');
  if (!accs.length) return;
  const idx = adMapIndex_(), catAds = catalogAdIds_(), out = {}, camps = {};
  const notOwn = [APP.CATALOG, APP.MULTI, APP.UNMAPPED, APP.UNKNOWN_PRODUCT, APP.META_NO_AD, ''];
  accs.forEach(acc => {
    metaAll_('act_' + acc.id + '/ads', { fields: 'id,campaign_id', effective_status: JSON.stringify(['ACTIVE']) }).forEach(a => {
      const m = idx.get(adKey_('META', String(a.id), '', '', ''));
      const own = m && notOwn.indexOf(m.product) < 0;
      const p = own ? m.product : catAds.has('META|' + String(a.id)) ? APP.CATALOG : m ? m.product : APP.UNMAPPED;
      out[p] = (out[p] || 0) + 1;
      if (a.campaign_id) camps[a.campaign_id] = (camps[a.campaign_id] || 0) + 1;
    });
  });
  PropertiesService.getDocumentProperties().setProperty('ACTIVE_PRODUCTS', JSON.stringify(out));
  PropertiesService.getDocumentProperties().setProperty('ACTIVE_CAMPAIGNS', JSON.stringify(camps));
  setStatus_('ACTIVE', '✓ ' + Object.keys(out).reduce((s, k) => s + out[k], 0) + ' إعلان شغال');
}
/* Campaign ID → ACTIVE ads in it now. */
function activeCampaigns_() {
  try { return JSON.parse(PropertiesService.getDocumentProperties().getProperty('ACTIVE_CAMPAIGNS') || '{}'); } catch (e) { return {}; }
}
function activeMap_() {
  try { return JSON.parse(PropertiesService.getDocumentProperties().getProperty('ACTIVE_PRODUCTS') || '{}'); } catch (e) { return {}; }
}
