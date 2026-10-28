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
    PropertiesService.getDocumentProperties().setProperty('SYNCED_THROUGH', shiftKey_(todayKey_(), -1));
    withLock_(() => refreshAdMap_([], {}, true));
  } catch (e) { setStatus_('FULL', '✗ ' + errText_(e)); console.error(errText_(e)); }
}
/*
 * First pull in small pieces (one Meta account × 3 days per piece) so no run hits the 6-minute limit.
 * A 1-minute trigger keeps calling backfillStep until every piece is done, then deletes itself.
 */
function backfill() {
  try {
    const today = todayKey_(), from = cfgStr_('sync.backfill_from');
    const since = from === 'month_start' ? today.slice(0, 8) + '01' : asKey_(from) && asKey_(from) <= today ? asKey_(from)
      : shiftKey_(today, -(cfgNum_('sync.backfill_days') || 30));
    const units = startBackfill_(since, today);
    alert_('السحب بدأ ✅ من ' + since + ' لـ ' + today + '\nهيشتغل على ' + units.length + ' جزء لوحده كل دقيقة (حوالي ' + Math.ceil(units.length / 4) + ' دقايق).\n' +
      'سيب الشيت وتابع التقدم في تاب ' + APP.T.HEALTH + '. لما يخلص هتلاقي "أول سحب: خلص".');
  } catch (e) { alert_('السحب ماكملش:\n' + errText_(e)); }
}
function startBackfill_(since, until, onlyIds) {
  const units = [];
  accounts_('META').filter(a => !onlyIds || onlyIds.indexOf(a.id) >= 0).forEach(a => {
    for (let s = since; s <= until; s = shiftKey_(s, 3)) units.push([a.id, s, shiftKey_(s, 2) > until ? until : shiftKey_(s, 2)]);
  });
  const props = PropertiesService.getDocumentProperties(), running = JSON.parse(props.getProperty('BACKFILL') || 'null');
  if (running) { running.units = running.units.concat(units); props.setProperty('BACKFILL', JSON.stringify(running)); return units; }
  props.setProperty('BACKFILL', JSON.stringify({ units: units, done: 0, since: since, until: until }));
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'backfillStep').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('backfillStep').timeBased().everyMinutes(1).create();
  setStatus_('BACKFILL', '0 / ' + units.length + ' جزء (' + since + ' → ' + until + ')');
  return units;
}
/*
 * Days Meta was never pulled (no daily run for a while) are pulled again in the background, in pieces.
 * The first time (no CATALOG_FROM yet), the whole month is pulled again so catalog ads get their product split.
 */
function catchUpGap_() {
  const props = PropertiesService.getDocumentProperties();
  if (props.getProperty('BACKFILL') || !accounts_('META').length) return false;
  const today = todayKey_(), yest = shiftKey_(today, -1), monthStart = today.slice(0, 8) + '01';
  let through = asKey_(props.getProperty('SYNCED_THROUGH') || '');
  if (!through) {
    const acc = ss_().getSheetByName(APP.T.ACC_RAW);
    const days = acc ? readRows_(acc, ACC_HEADERS.length).map(r => asKey_(r[0])).filter(d => d && d < today).sort() : [];
    through = days.length ? shiftKey_(days.pop(), -1) : yest;
  }
  let since = through < yest ? shiftKey_(through, 1) : '';
  const catalogFirst = !props.getProperty('CATALOG_FROM') && monthStart <= yest;
  if (catalogFirst) since = since && since < monthStart ? since : monthStart;
  if (!since) return false;
  if (catalogFirst) props.setProperty('CATALOG_FROM', since);
  if (since < shiftKey_(today, -60)) since = shiftKey_(today, -60);
  startBackfill_(since, yest);
  return true;
}
/* The live and daily triggers exist (unless paused from the menu). */
function ensureTriggers_() {
  if (PropertiesService.getDocumentProperties().getProperty('TRIGGERS_PAUSED')) return;
  const have = ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction());
  if (have.indexOf('liveTick') >= 0 && have.indexOf('dailySync') >= 0) return;
  let every = cfgNum_('sync.live_minutes') || 15;
  every = [1, 5, 10, 15, 30].filter(v => v <= every).pop() || 15;
  if (have.indexOf('liveTick') < 0) ScriptApp.newTrigger('liveTick').timeBased().everyMinutes(every).create();
  if (have.indexOf('dailySync') < 0) ScriptApp.newTrigger('dailySync').timeBased().atHour(0).nearMinute(30).everyDays(1).inTimezone(tz_()).create();
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
    const save = () => props.setProperty('BACKFILL', JSON.stringify(st));
    while (st.done < st.units.length && Date.now() - start < 2 * 60000) {
      const u = st.units[st.done];
      // A piece that keeps dying (6-minute limit, Meta error) is split into single days, then skipped, never repeated forever.
      st.tries = (st.tries || 0) + 1; save();
      if (st.tries > 3) {
        st.tries = 0;
        if (u[1] < u[2]) {
          const days = [];
          for (let s = u[1]; s <= u[2]; s = shiftKey_(s, 1)) days.push([u[0], s, s]);
          st.units.splice(st.done, 1, ...days);
        } else { (st.skipped = st.skipped || []).push(u); st.done++; }
        save();
        continue;
      }
      try {
        const meta = fetchMetaAds_(u[1], u[2], u[0]);
        mergeRaw_(APP.T.ADS, ADS_HEADERS, meta.ads, u[1], u[2], meta.accounts, [0, 1, 2, 8], [2, 4, 6, 8]);
        mergeRaw_(APP.T.ACC_RAW, ACC_HEADERS, meta.acc, u[1], u[2], meta.accounts, [0, 1, 2], [2]);
        const cat = syncCatalog_(u[1], u[2], u[0]);
        if (cat) mergeCatalog_(cat.rows, u[1], u[2], cat.keys);
        st.done++; st.tries = 0; save();
        setStatus_('BACKFILL', st.done + ' / ' + st.units.length + ' جزء' + (st.skipped ? ' (اتساب ' + st.skipped.length + ')' : ''));
        refreshAdMap_(meta.ads, {}, false);
      } catch (e) {
        setStatus_('BACKFILL', st.done + ' / ' + st.units.length + ' جزء — ✗ ' + u[1] + ' → ' + u[2] + ': ' + errText_(e));
        break;
      }
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
    const through = asKey_(props.getProperty('SYNCED_THROUGH') || ''), done = st.until < todayKey_() ? st.until : shiftKey_(todayKey_(), -1);
    if (!through || through < done) props.setProperty('SYNCED_THROUGH', done);
    stopTrigger();
    setStatus_('BACKFILL', 'خلص ✅');
    setStatus_('FULL', '✓ ' + st.since + ' → ' + st.until);
  } catch (e) { setStatus_('BACKFILL', '✗ ' + errText_(e) + ' — هيحاول تاني بعد دقيقة'); }
}
/* Every N minutes: orders, today's ads, views (Today takes the intraday snapshot). Skips quietly if another run is busy. */
function liveTick() {
  DEADLINE_ = Date.now() + 5 * 60000;
  try {
    resetCaches_();
    syncOrders_();
    const today = todayKey_();
    syncAds_(today, today);
    runLiveExt_();
    const r = tryLock_(() => rebuildViews_());
    setStatus_('LIVE', r.skipped ? 'اتأجل (تحديث تاني شغال)' : '✓ OK');
    try { ensureTriggers_(); catchUpGap_(); } catch (e) { console.error('catch-up: ' + errText_(e)); }
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
  PropertiesService.getDocumentProperties().deleteProperty('TRIGGERS_PAUSED');
  alert_('التحديث التلقائي شغال ✅\nكل ' + every + ' دقيقة خلال اليوم، ومزامنة كاملة الساعة 12:30 بالليل.');
}
function pauseTriggers() {
  ScriptApp.getProjectTriggers().filter(t => ['liveTick', 'dailySync'].indexOf(t.getHandlerFunction()) >= 0).forEach(t => ScriptApp.deleteTrigger(t));
  PropertiesService.getDocumentProperties().setProperty('TRIGGERS_PAUSED', nowText_());
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
