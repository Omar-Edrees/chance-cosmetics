/* Running now: products with at least one ACTIVE Meta ad. Read-only on Meta. */

function refreshActive_() {
  const accs = accounts_('META');
  if (!accs.length) return;
  const idx = adMapIndex_(), out = {};
  accs.forEach(acc => {
    metaAll_('act_' + acc.id + '/ads', { fields: 'id', effective_status: JSON.stringify(['ACTIVE']) }).forEach(a => {
      const m = idx.get(adKey_('META', String(a.id), '', '', '')), p = m ? m.product : APP.UNMAPPED;
      out[p] = (out[p] || 0) + 1;
    });
  });
  PropertiesService.getDocumentProperties().setProperty('ACTIVE_PRODUCTS', JSON.stringify(out));
  setStatus_('ACTIVE', '✓ ' + Object.keys(out).reduce((s, k) => s + out[k], 0) + ' إعلان شغال');
}
function activeMap_() {
  try { return JSON.parse(PropertiesService.getDocumentProperties().getProperty('ACTIVE_PRODUCTS') || '{}'); } catch (e) { return {}; }
}
