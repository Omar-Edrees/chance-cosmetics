/*
 * Ads Raw = one row per ad per day, all platforms. The single source of truth for spend.
 * Each sync REPLACES the days it pulls for the accounts it pulled (no appending, no duplicates).
 * Account Raw = account-level spend per day, used only to check that ad-level spend adds up.
 */
const ADS_HEADERS = ['Date', 'Platform', 'Account ID', 'Account', 'Campaign ID', 'Campaign', 'Ad set ID', 'Ad set',
  'Ad ID', 'Ad', 'Spend', 'Impressions', 'Link clicks', 'Purchases', 'Purchase value'];
const ACC_HEADERS = ['Date', 'Platform', 'Account ID', 'Account', 'Spend', 'Purchases'];

function fetchMetaAds_(since, until, onlyId) {
  const ads = [], accRows = [], range = JSON.stringify({ since: since, until: until });
  const list = accounts_('META').filter(a => !onlyId || a.id === onlyId);
  list.forEach(acc => {
    try {
      metaAll_('act_' + acc.id + '/insights', { level: 'ad', time_range: range, time_increment: 1,
        fields: 'date_start,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,inline_link_clicks,actions,action_values' })
        .forEach(r => ads.push([r.date_start, 'META', acc.id, acc.name, String(r.campaign_id || ''), r.campaign_name || '',
          String(r.adset_id || ''), r.adset_name || '', String(r.ad_id || ''), r.ad_name || '', round2_(num_(r.spend)),
          num_(r.impressions), num_(r.inline_link_clicks), metaPick_(r.actions), round2_(metaPick_(r.action_values))]));
      metaAll_('act_' + acc.id + '/insights', { level: 'account', time_range: range, time_increment: 1,
        fields: 'date_start,spend,actions' })
        .forEach(r => accRows.push([r.date_start, 'META', acc.id, acc.name, round2_(num_(r.spend)), metaPick_(r.actions)]));
    } catch (e) {
      throw new Error('الحساب ' + acc.name + ' (' + acc.id + '): ' + errText_(e) +
        (/#200|permission|ads_read/i.test(String(e)) ? '\nالتوكن مالوش صلاحية على الحساب ده.' : ''));
    }
  });
  return { ads: ads, acc: accRows, accounts: list.map(a => 'META|' + a.id) };
}

/* TikTok from a tab filled by a connector tool (Coupler, Windsor, Supermetrics) or a pasted CSV. */
function fetchTikTokTab_(since, until) {
  const method = cfgStr_('tiktok.method');
  if (method !== 'connector_tab' && method !== 'csv_tab') return { ads: [], acc: [], accounts: [], links: {} };
  const sh = ss_().getSheetByName(cfgStr_('tiktok.tab'));
  if (!sh || sh.getLastRow() < 2) return { ads: [], acc: [], accounts: [], links: {} };
  const v = sh.getDataRange().getValues(), head = v[0].map(x => String(x).trim());
  const col = k => head.indexOf(cfgStr_('tiktok.col.' + k));
  const c = {}; ['date', 'account_id', 'campaign', 'adgroup', 'ad_id', 'ad', 'spend', 'impressions', 'clicks', 'purchases', 'landing']
    .forEach(k => { c[k] = col(k); });
  if (c.date < 0 || c.spend < 0) throw new Error('تاب TikTok ناقص فيه عمود التاريخ أو الصرف. راجع tiktok.col.* في Settings.');
  const ads = [], accSum = {}, links = {}, names = {}, tkAccs = accounts_('TIKTOK');
  tkAccs.forEach(a => { names[a.id] = a.name; });
  v.slice(1).forEach(r => {
    const key = r[c.date] instanceof Date ? dayKey_(r[c.date]) : asKey_(String(r[c.date]).slice(0, 10));
    if (!key || key < since || key > until) return;
    const acc = c.account_id >= 0 && String(r[c.account_id]).trim() ? String(r[c.account_id]).trim()
      : (tkAccs.length === 1 ? tkAccs[0].id : 'tiktok');
    const adId = c.ad_id >= 0 ? String(r[c.ad_id]).trim() : '';
    const get = k => (c[k] >= 0 ? r[c[k]] : '');
    ads.push([key, 'TIKTOK', acc, names[acc] || acc, '', String(get('campaign')), '', String(get('adgroup')), adId,
      String(get('ad')), round2_(num_(get('spend'))), num_(get('impressions')), num_(get('clicks')), num_(get('purchases')), 0]);
    const k = key + '|' + acc;
    accSum[k] = accSum[k] || [key, 'TIKTOK', acc, names[acc] || acc, 0, 0];
    accSum[k][4] = round2_(accSum[k][4] + num_(get('spend')));
    accSum[k][5] += num_(get('purchases'));
    if (adId && c.landing >= 0 && get('landing')) links[adId] = String(get('landing'));
  });
  const accs = Array.from(new Set(ads.map(r => 'TIKTOK|' + r[2])));
  return { ads: ads, acc: Object.keys(accSum).map(k => accSum[k]), accounts: accs, links: links };
}

/* Replace [since..until] for the synced accounts; keep everything else. */
function mergeRaw_(sheetName, headers, fresh, since, until, accountKeys, keyCols, idIdx) {
  const sh = ensureTab_(sheetName, headers), cols = headers.length, synced = new Set(accountKeys);
  const out = [], seen = new Set();
  const add = r => {
    const k = keyCols.map(i => String(r[i])).join('|');
    if (seen.has(k)) return;
    seen.add(k); out.push(r);
  };
  fresh.forEach(add);
  readRows_(sh, cols).forEach(r => {
    r[0] = asKey_(r[0]);
    if (!r[0]) return;
    idIdx.forEach(i => { r[i] = String(r[i]); });
    if (r[0] >= since && r[0] <= until && synced.has(r[1] + '|' + r[2])) return;
    add(r);
  });
  out.sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : num_(b[headers.indexOf('Spend')]) - num_(a[headers.indexOf('Spend')])));
  writeRows_(sh, out, cols, [1].concat(idIdx.map(i => i + 1)));
  return out.length;
}

/* Read everything first (no lock), then write inside the lock. */
function syncAds_(since, until) {
  const meta = time_('Meta — قراءة', () => fetchMetaAds_(since, until));
  const tt = time_('TikTok — قراءة', () => fetchTikTokTab_(since, until));
  const cat = time_('Meta كتالوج — قراءة', () => syncCatalog_(since, until));
  const ads = meta.ads.concat(tt.ads), acc = meta.acc.concat(tt.acc), keys = meta.accounts.concat(tt.accounts);
  return withLock_(() => {
    mergeRaw_(APP.T.ADS, ADS_HEADERS, ads, since, until, keys, [0, 1, 2, 8], [2, 4, 6, 8]);
    mergeRaw_(APP.T.ACC_RAW, ACC_HEADERS, acc, since, until, keys, [0, 1, 2], [2]);
    if (cat) mergeCatalog_(cat.rows, since, until, cat.keys);
    time_('Ad Map', () => refreshAdMap_(ads, tt.links, false));
    return { ads: ads.length, since: since, until: until };
  });
}
