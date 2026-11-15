/*
 * Running now: products with at least one ACTIVE Meta ad. Read-only on Meta.
 * An ad that goes to a product's page counts on that product even with a catalog carousel under it (catalogAdIds_).
 * An ACTIVE ad that hasn't spent yet isn't in the Ad Map: its product is decided the same way (link, code, ad text) and
 * remembered (ACTIVE_NEW), so a new ad shows on its product from the first minute and its link is read once.
 */

function refreshActive_() {
  const accs = accounts_('META');
  if (!accs.length) return;
  const idx = adMapIndex_(), catAds = catalogAdIds_(), out = {}, camps = {}, props = PropertiesService.getDocumentProperties();
  let known = {};
  try { known = JSON.parse(props.getProperty('ACTIVE_NEW') || '{}'); } catch (e) { known = {}; }
  const ads = [];
  accs.forEach(acc => {
    metaAll_('act_' + acc.id + '/ads', { fields: 'id,name,campaign_id,campaign{name},adset{name}', effective_status: JSON.stringify(['ACTIVE']) })
      .forEach(a => ads.push(a));
  });
  const fresh = ads.filter(a => !idx.get(adKey_('META', String(a.id), '', '', '')) && !(String(a.id) in known)).map(a => String(a.id));
  if (fresh.length) {
    const got = fetchMetaLinks_(fresh);
    ads.forEach(a => {
      const g = got[String(a.id)];
      if (!g) return; // not read this time (time ran out): next time
      const d = decideProduct_(g.links, (a.campaign || {}).name, (a.adset || {}).name, a.name, g.text);
      known[String(a.id)] = d.source === 'MULTI' ? APP.MULTI : d.product || APP.UNMAPPED;
    });
  }
  const now = {};
  ads.forEach(a => {
    const id = String(a.id), m = idx.get(adKey_('META', id, '', '', ''));
    const p = catAds.has('META|' + id) ? APP.CATALOG : m ? m.product : known[id] || APP.UNMAPPED;
    if (!m && known[id]) now[id] = known[id];
    out[p] = (out[p] || 0) + 1;
    if (a.campaign_id) camps[a.campaign_id] = (camps[a.campaign_id] || 0) + 1;
  });
  props.setProperty('ACTIVE_NEW', JSON.stringify(now)); // only ads still active and still not in the Ad Map
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
