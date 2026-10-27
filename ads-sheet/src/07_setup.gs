/* Setup (never clears existing data), sync entry points, triggers, menu. */

function setupAll() {
  try {
    withLock_(() => {
      const st = ensureTab_(APP.T.SETTINGS, ['Key', 'Value', 'الوصف']);
      const have = new Set(readRows_(st, 1).map(r => String(r[0]).trim()));
      const seed = (typeof PROFILE !== 'undefined' && PROFILE.settings) || {};
      const add = SETTINGS_SPEC.filter(s => !have.has(s[0])).map(s => [s[0], seed[s[0]] !== undefined ? seed[s[0]] : s[1], s[2]]);
      if (add.length) st.getRange(st.getLastRow() + 1, 1, add.length, 3).setValues(add);
      st.getRange(2, 2, Math.max(st.getLastRow() - 1, 1), 1).setBackground('#fff2cc').setNumberFormat('@');
      st.setColumnWidth(1, 230); st.setColumnWidth(2, 320); st.setColumnWidth(3, 360);

      const acc = ensureTab_(APP.T.ACCOUNTS, ['Platform', 'Account ID', 'Name', 'Purpose', 'Include', 'Brand / Page']);
      acc.getRange(2, 2, acc.getMaxRows() - 1, 1).setNumberFormat('@');
      seedTab_(acc, (typeof PROFILE !== 'undefined' && PROFILE.accounts) || [], 6);
      const pr = ensureTab_(APP.T.PRODUCTS, PRODUCT_HEADERS);
      seedTab_(pr, (typeof PROFILE !== 'undefined' && PROFILE.products) || [], PRODUCT_HEADERS.length);
      const bn = ensureTab_(APP.T.BENCH, BENCH_HEADERS);
      seedTab_(bn, (typeof PROFILE !== 'undefined' && PROFILE.benchmarks) || [], BENCH_HEADERS.length);

      ensureTab_(APP.T.ADMAP, ADMAP_HEADERS); ensureTab_(APP.T.ADS, ADS_HEADERS); ensureTab_(APP.T.ACC_RAW, ACC_HEADERS);
      ensureTab_(APP.T.ORDERS, ORDERS_HEADERS); ensureTab_(APP.T.DAILY, DAILY_HEADERS); ensureTab_(APP.T.INTRA, INTRA_HEADERS);
      ensureTab_(APP.T.TESTS, TESTS_HEADERS); ensureTab_(APP.T.TODAY); ensureTab_(APP.T.PERF); ensureTab_(APP.T.CLOSING); ensureTab_(APP.T.HEALTH);
      [APP.T.ADS, APP.T.ACC_RAW, APP.T.ORDERS, APP.T.DAILY].forEach(n => tab_(n).hideSheet());
      EXT.setup.forEach(f => f());
      resetCaches_();
    });
    alert_('الإعداد خلص ✅\n\nالخطوات الجاية:\n1) راجع Settings و Accounts و Products.\n2) المنيو: الإعدادات ← ربط توكن Meta.\n3) المنيو: أول سحب (من أول الشهر).\n4) المنيو: تشغيل التحديث التلقائي.');
  } catch (e) { alert_('الإعداد ماكملش:\n' + errText_(e)); }
}
/* Seed a table tab only if it has no data yet. */
function seedTab_(sh, rows, width) {
  if (!rows.length || sh.getLastRow() >= 2) return;
  const data = rows.map(r => { const a = r.slice(0, width); while (a.length < width) a.push(''); return a; });
  sh.getRange(2, 1, data.length, width).setValues(data);
}

function fullSync_(days) {
  resetCaches_();
  const today = todayKey_(), since = shiftKey_(today, -days);
  syncOrders_();
  const r = syncAds_(since, today);
  runLiveExt_();
  withLock_(() => time_('Views', () => rebuildViews_()));
  setStatus_('FULL', '✓ ' + since + ' → ' + today + ' (' + r.ads + ' صف إعلانات)');
  return r;
}
function dailySync() {
  DEADLINE_ = Date.now() + 5 * 60000;
  try {
    fullSync_(cfgNum_('sync.refresh_days') || 3);
    withLock_(() => refreshAdMap_([], {}, true));
  } catch (e) { setStatus_('FULL', '✗ ' + errText_(e)); console.error(errText_(e)); }
}
/*
 * First pull in small pieces (one Meta account × 5 days per piece) so no run hits the 6-minute limit.
 * A 1-minute trigger keeps calling backfillStep until every piece is done, then deletes itself.
 */
function backfill() {
  try {
    const today = todayKey_(), from = cfgStr_('sync.backfill_from'), units = [];
    const since = from === 'month_start' ? today.slice(0, 8) + '01' : asKey_(from) && asKey_(from) <= today ? asKey_(from)
      : shiftKey_(today, -(cfgNum_('sync.backfill_days') || 30));
    accounts_('META').forEach(a => {
      for (let s = since; s <= today; s = shiftKey_(s, 5)) units.push([a.id, s, shiftKey_(s, 4) > today ? today : shiftKey_(s, 4)]);
    });
    PropertiesService.getDocumentProperties().setProperty('BACKFILL', JSON.stringify({ units: units, done: 0, since: since, until: today }));
    ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'backfillStep').forEach(t => ScriptApp.deleteTrigger(t));
    ScriptApp.newTrigger('backfillStep').timeBased().everyMinutes(1).create();
    setStatus_('BACKFILL', '0 / ' + units.length + ' جزء');
    alert_('السحب بدأ ✅ من ' + since + ' لـ ' + today + '\nهيشتغل على ' + units.length + ' جزء لوحده كل دقيقة (حوالي ' + Math.ceil(units.length / 4) + ' دقايق).\n' +
      'سيب الشيت وتابع التقدم في تاب ' + APP.T.HEALTH + '. لما يخلص هتلاقي "أول سحب: خلص".');
  } catch (e) { alert_('السحب ماكملش:\n' + errText_(e)); }
}
function backfillStep() {
  const props = PropertiesService.getDocumentProperties();
  const st = JSON.parse(props.getProperty('BACKFILL') || 'null');
  const stopTrigger = () => ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'backfillStep').forEach(t => ScriptApp.deleteTrigger(t));
  if (!st) { stopTrigger(); return; }
  const start = Date.now();
  DEADLINE_ = start + 4.5 * 60000;
  const r = tryLock_(() => {
    resetCaches_();
    while (st.done < st.units.length && Date.now() - start < 3 * 60000) {
      const u = st.units[st.done], meta = fetchMetaAds_(u[1], u[2], u[0]);
      mergeRaw_(APP.T.ADS, ADS_HEADERS, meta.ads, u[1], u[2], meta.accounts, [0, 1, 2, 8], [2, 4, 6, 8]);
      mergeRaw_(APP.T.ACC_RAW, ACC_HEADERS, meta.acc, u[1], u[2], meta.accounts, [0, 1, 2], [2]);
      refreshAdMap_(meta.ads, {}, false);
      st.done++;
      props.setProperty('BACKFILL', JSON.stringify(st));
      setStatus_('BACKFILL', st.done + ' / ' + st.units.length + ' جزء');
    }
    try { writeHealth_(); } catch (e) {}
    if (st.done < st.units.length || Date.now() - start > 3.5 * 60000) return;
    // Finish: TikTok tab, orders, links still missing, extensions, views.
    const tt = fetchTikTokTab_(st.since, st.until);
    mergeRaw_(APP.T.ADS, ADS_HEADERS, tt.ads, st.since, st.until, tt.accounts, [0, 1, 2, 8], [2, 4, 6, 8]);
    mergeRaw_(APP.T.ACC_RAW, ACC_HEADERS, tt.acc, st.since, st.until, tt.accounts, [0, 1, 2], [2]);
    refreshAdMap_(tt.ads, tt.links, false);
    st.finishing = true;
  });
  if (r.skipped || !st.finishing) return;
  try {
    syncOrders_();
    runLiveExt_();
    withLock_(() => rebuildViews_());
    props.deleteProperty('BACKFILL');
    stopTrigger();
    setStatus_('BACKFILL', 'خلص ✅');
    setStatus_('FULL', '✓ ' + st.since + ' → ' + st.until);
  } catch (e) { setStatus_('BACKFILL', '✗ ' + errText_(e) + ' — هيحاول تاني بعد دقيقة'); }
}
/* Every N minutes: orders, today's ads, views, intraday snapshot. Skips quietly if another run is busy. */
function liveTick() {
  DEADLINE_ = Date.now() + 5 * 60000;
  try {
    resetCaches_();
    syncOrders_();
    const today = todayKey_();
    syncAds_(today, today);
    runLiveExt_();
    const r = tryLock_(() => { rebuildViews_(); takeIntraday_(); });
    setStatus_('LIVE', r.skipped ? 'اتأجل (تحديث تاني شغال)' : '✓ OK');
  } catch (e) { setStatus_('LIVE', '✗ ' + errText_(e)); console.error(errText_(e)); }
}
function runLiveExt_() { EXT.live.forEach(f => { try { f(); } catch (e) { console.error('ext live: ' + errText_(e)); } }); }
function refreshNow() {
  try { liveTick(); alert_('اتحدثت أرقام النهارده ✅\n' + getStatus_('LIVE')); ss_().setActiveSheet(tab_(APP.T.TODAY)); }
  catch (e) { alert_('التحديث ماكملش:\n' + errText_(e)); }
}

function installTriggers() {
  const names = ['liveTick', 'dailySync'];
  ScriptApp.getProjectTriggers().filter(t => names.indexOf(t.getHandlerFunction()) >= 0).forEach(t => ScriptApp.deleteTrigger(t));
  let every = cfgNum_('sync.live_minutes') || 15;
  every = [1, 5, 10, 15, 30].filter(v => v <= every).pop() || 15;
  ScriptApp.newTrigger('liveTick').timeBased().everyMinutes(every).create();
  ScriptApp.newTrigger('dailySync').timeBased().atHour(0).nearMinute(30).everyDays(1).inTimezone(tz_()).create();
  alert_('التحديث التلقائي شغال ✅\nكل ' + every + ' دقيقة خلال اليوم، ومزامنة كاملة الساعة 12:30 بالليل.');
}
function pauseTriggers() {
  ScriptApp.getProjectTriggers().filter(t => ['liveTick', 'dailySync'].indexOf(t.getHandlerFunction()) >= 0).forEach(t => ScriptApp.deleteTrigger(t));
  alert_('التحديث التلقائي اتوقف ⏸');
}

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  const menu = ui.createMenu('Ads Sheet');
  menu
    .addItem('🔄 تحديث أرقام النهارده', 'refreshNow')
    .addItem('🔗 تحديث ربط الإعلانات بالمنتجات', 'refreshAdMapNow');
  EXT.menu.forEach(m => menu.addItem(m[0], m[1]));
  menu.addSeparator()
    .addSubMenu(ui.createMenu('الإعدادات')
      .addItem('إعداد الشيت (مرة واحدة)', 'setupAll')
      .addItem('ربط توكن Meta', 'metaConnect')
      .addItem('أول سحب (من أول الشهر)', 'backfill')
      .addItem('إيقاف أول سحب', 'stopBackfill')
      .addSeparator()
      .addItem('تشغيل التحديث التلقائي', 'installTriggers')
      .addItem('إيقاف التحديث التلقائي', 'pauseTriggers'))
    .addToUi();
}

function stopBackfill() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'backfillStep').forEach(t => ScriptApp.deleteTrigger(t));
  PropertiesService.getDocumentProperties().deleteProperty('BACKFILL');
  setStatus_('BACKFILL', 'اتوقف');
  alert_('أول سحب اتوقف ⏸');
}
