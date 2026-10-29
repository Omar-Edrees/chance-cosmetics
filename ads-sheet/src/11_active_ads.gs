/* Running now: products with at least one ACTIVE Meta ad. Read-only on Meta. */

function refreshActive_() {
  const accs = accounts_('META');
  if (!accs.length) return;
  const idx = adMapIndex_(), catAds = catalogAdIds_(), out = {}, camps = {};
  accs.forEach(acc => {
    metaAll_('act_' + acc.id + '/ads', { fields: 'id,campaign_id', effective_status: JSON.stringify(['ACTIVE']) }).forEach(a => {
      const m = idx.get(adKey_('META', String(a.id), '', '', ''));
      const p = catAds.has('META|' + String(a.id)) ? APP.CATALOG : m ? m.product : APP.UNMAPPED;
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
