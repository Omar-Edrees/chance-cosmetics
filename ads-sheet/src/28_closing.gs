/*
 * Tab "Closing" = the month's closing, laid out like House of Beauty's "Weekly & Monthly": a band per week (1–7, 8–14,
 * 15–21, 22 to the month's end), a yellow header row, a row per day, a WEEK TOTAL row, and MONTH TOTAL at the bottom.
 * Always the current month: on the first update after the month ended (and after the daily run re-pulled its last days),
 * the month that ended is copied once, as fixed numbers, into its own tab "<Month yyyy> Archive" (CLOSING.ARCHIVE_SUFFIX),
 * and the Closing tab starts the new month. Any ended month can be (re)archived from the menu.
 *
 * Columns: TOTAL SPEND (Meta + TikTok, Daily Log), TOTAL ORDERS (every store order but the outside account's, as GRAND TOTAL
 * in Today), ROAS (sales of all orders ÷ spend = Shopify ROAS), ACTUAL ROAS (delivered sales ÷ spend), AOV (sales ÷ orders),
 * REVENUE (delivered orders only, what was collected), TOTAL UNITS, UPO (units ÷ orders), CONFIRMED (shipped), DELIVERED,
 * CPL (spend ÷ orders), CPO (spend ÷ delivered), CROSS-SELL REVENUE (what was added to delivered orders after they were placed).
 * Where each order stands comes from 19_order_status.gs (read from Shopify up to ORDER_STATUS_AT): later days show those
 * columns empty, and ACTUAL ROAS / CPO of a week or month use only the spend of the days that have them.
 */
const CLOSING = {
  ARCHIVE_SUFFIX: ' Archive', ARCHIVE_KEY: 'CLOSING_ARCHIVED', ARCHIVE_TAB: '#6b7280',
  DARK: '#1f2937', WEEK: '#dbe8fb', HEAD: '#fff200', TOTAL: '#e0e0e0', ACTUAL: '#e2f0d9', TODAY: '#fff7d6', SOFT: '#4b5563',
  /* [header, value(t), number format, tinted (delivered / actual numbers)] */
  COLS: [
    ['TOTAL SPEND', t => round2_(t.spend), '#,##0', false],
    ['TOTAL ORDERS', t => t.orders, '#,##0', false],
    ['ROAS', t => ratioOrBlank_(t.sales, t.spend, 2), '0.00"x"', false],
    ['ACTUAL ROAS', t => (t.known ? ratioOrBlank_(t.revenue, t.knownSpend, 2) : ''), '0.00"x"', true],
    ['AOV', t => ratioOrBlank_(t.sales, t.orders, 0), '#,##0', false],
    ['REVENUE', t => (t.known ? round2_(t.revenue) : ''), '#,##0', true],
    ['TOTAL UNITS', t => t.units, '#,##0', false],
    ['UPO', t => ratioOrBlank_(t.units, t.orders, 2), '0.00', false],
    ['CONFIRMED ORDERS', t => (t.known ? t.confirmed : ''), '#,##0', true],
    ['DELIVERED ORDERS', t => (t.known ? t.delivered : ''), '#,##0', true],
    ['CPL', t => ratioOrBlank_(t.spend, t.orders, 0), '#,##0', false],
    ['CPO', t => (t.known ? ratioOrBlank_(t.knownSpend, t.delivered, 0) : ''), '#,##0', true],
    ['CROSS-SELL REVENUE', t => (t.known ? round2_(t.cross) : ''), '#,##0', true]
  ]
};

function closingDays_(month) { const p = month.split('-').map(Number); return new Date(Date.UTC(p[0], p[1], 0)).getUTCDate(); }
function closingKey_(month, d) { return month + '-' + String(d).padStart(2, '0'); }
function closingPrevMonth_(month) { return shiftKey_(month + '-01', -1).slice(0, 7); }
function closingMonthName_(month) {
  const p = month.split('-').map(Number);
  return Utilities.formatDate(new Date(Date.UTC(p[0], p[1] - 1, 15, 12)), 'UTC', 'MMMM yyyy');
}
function closingArchiveName_(month) { return closingMonthName_(month) + CLOSING.ARCHIVE_SUFFIX; }
function closingZero_() { return { spend: 0, knownSpend: 0, orders: 0, sales: 0, units: 0, confirmed: 0, delivered: 0, revenue: 0, cross: 0, known: false }; }
function closingAdd_(into, x) { Object.keys(into).forEach(k => { if (k === 'known') into.known = into.known || x.known; else into[k] += x[k]; }); return into; }

/*
 * Every day of the month: {day: totals}. Spend from Daily Log (every platform). Orders from Orders Raw: every store
 * order but the outside account's (META OUT), as GRAND TOTAL. Units: from Shopify (19_order_status.gs) when it has the
 * order, else the order's product lines. Status numbers only for days up to ORDER_STATUS_DAY.
 */
function closingData_(month) {
  const from = month + '-01', to = closingKey_(month, closingDays_(month)), days = {};
  const day = k => days[k] || (days[k] = closingZero_());
  dailyRows_().forEach(r => { if (r[0] >= from && r[0] <= to && r[1] !== APP.META_OUT) day(r[0]).spend += num_(r[3]); });
  const known = metaIdsOf_(rawRows_(APP.T.ADS, ADS_HEADERS.length));
  recentRows_(APP.T.ORDERS, ORDERS_HEADERS.length, 2, sortKey_, from).forEach(o => {
    const d = asKey_(o[2]);
    if (!d || d < from || d > to || outsideMeta_(o, known)) return;
    const t = day(d), st = orderStatus_(o[0]);
    t.orders++; t.sales += num_(o[7]);
    t.units += st && st.units ? st.units : (lineItems_(o[6]).reduce((a, i) => a + i.qty, 0) || 1);
    if (!st) return;
    if ('RDS'.indexOf(st.code) >= 0) t.confirmed++;
    if (st.code === 'D') { t.delivered++; t.revenue += st.revenue === null || st.revenue === undefined ? num_(o[7]) : st.revenue; t.cross += st.cross || 0; }
  });
  Object.keys(days).forEach(k => { if (k <= orderStatusDay_()) { days[k].known = true; days[k].knownSpend = days[k].spend; } });
  return days;
}

/* The weeks like House of Beauty: 1–7, 8–14, 15–21, then 22 to the month's end. */
function closingWeeks_(month) { return [[1, 7], [8, 14], [15, 21], [22, closingDays_(month)]]; }

/* Draws a month (Closing or an archive) on grid g. today: days after it stay empty (the current month). */
function closingGrid_(month, title, note, today, updated) {
  const C = CLOSING, g = todayGrid_(), W = 1 + C.COLS.length, data = closingData_(month), all = closingZero_();
  g.width = W;
  const band = (r, text, bg, fc) => { g.set(r, 1, text, { bg: bg, fc: fc, b: 'bold', al: 'center' }); g.fill(r, 2, W - 1, { bg: bg }); g.merge(r, 1, 1, W); };
  band(1, title, C.DARK, '#ffffff');
  g.set(2, 1, 'الشهر', { b: 'bold' });
  g.set(2, 2, closingMonthName_(month), { b: 'bold', al: 'center' });
  g.merge(2, 2, 1, 2);
  g.set(2, 4, updated ? 'آخر تحديث' : '', { b: 'bold', al: 'right' });
  g.set(2, 5, updated, { al: 'center' });
  g.merge(2, 5, 1, 2);
  g.set(2, 7, note, { fc: C.SOFT });
  g.merge(2, 7, 1, W - 6);
  g.set(3, 1, 'TOTAL ORDERS = كل أوردرات شوبيفاي (ماعدا الأكاونت اللي مش معانا). ROAS = مبيعات كل الأوردرات ÷ الصرف، و AOV عليها. ' +
    'CONFIRMED = اتشحن. DELIVERED = اتسلم واتحصّل. REVENUE = مبيعات المتسلم بس، و ACTUAL ROAS = REVENUE ÷ الصرف. ' +
    'UPO = القطع ÷ الأوردرات. CPL = الصرف ÷ كل الأوردرات. CPO = الصرف ÷ المتسلم. CROSS-SELL REVENUE = اللي اتزود على الأوردرات المتسلمة بعد ما اتعملت (جوه REVENUE). ' +
    'حالة الأوردرات من شوبيفاي لحد ' + ORDER_STATUS_AT + '، والأيام اللي بعدها أعمدة الحالة فيها فاضية لحد التحديث الجاي.', { fc: C.SOFT });
  g.merge(3, 1, 1, W);
  let r = 5;
  const line = (label, t, style, tint) => {
    g.set(r, 1, label, Object.assign({ al: 'center' }, style));
    C.COLS.forEach((c, i) => g.set(r, 2 + i, t ? c[1](t) : '', Object.assign({ nf: c[2], al: 'center' }, style, tint && c[3] && !style.bg ? { bg: C.ACTUAL } : {})));
    r++;
  };
  closingWeeks_(month).forEach((w, i) => {
    const sum = closingZero_(), p = month.split('-').map(Number);
    band(r, 'WEEK ' + (i + 1) + '   (' + w[0] + ' – ' + w[1] + ' ' + closingMonthName_(month).split(' ')[0] + ')', C.WEEK, '#000000');
    r++;
    ['DATE'].concat(C.COLS.map(c => c[0])).forEach((h, j) => g.set(r, 1 + j, h, { bg: C.HEAD, b: 'bold', al: 'center' }));
    r++;
    for (let d = w[0]; d <= w[1]; d++) {
      const k = closingKey_(month, d), label = Utilities.formatDate(new Date(Date.UTC(p[0], p[1] - 1, d, 12)), 'UTC', 'EEE dd-MMM');
      if (today && k > today) { line(label, null, { fc: '#9ca3af' }, false); continue; }
      const t = data[k] || closingZero_();
      if (k <= orderStatusDay_()) t.known = true;
      closingAdd_(sum, t);
      line(label, t, today && k === today ? { bg: C.TODAY, b: 'bold' } : {}, true);
    }
    closingAdd_(all, sum);
    line('WEEK ' + (i + 1) + ' TOTAL', today && closingKey_(month, w[0]) > today ? null : sum, { bg: C.TOTAL, b: 'bold' }, false);
    r++;
  });
  line('MONTH TOTAL', all, { bg: C.DARK, fc: '#ffffff', b: 'bold' }, false);
  return { g: g, total: all };
}

/* Column widths, wrap and frozen rows, after a redraw. */
function closingLook_(sh) {
  const W = 1 + CLOSING.COLS.length;
  sh.setFrozenRows(2);
  sh.setColumnWidth(1, 120);
  for (let c = 2; c <= W; c++) sh.setColumnWidth(c, 100);
  sh.getRange(3, 1, 1, W).setWrap(true).setVerticalAlignment('middle');
  sh.setRowHeight(3, 64);
  const last = sh.getLastRow();
  for (let r = 5; r <= last; r++) if (sh.getRange(r, 2).getValue() === 'TOTAL SPEND') sh.getRange(r, 1, 1, W).setWrap(true).setVerticalAlignment('middle');
}

function writeClosing_() {
  const today = todayKey_(), month = today.slice(0, 7), sh = ensureTab_(APP.T.CLOSING);
  const archived = PropertiesService.getDocumentProperties().getProperty(CLOSING.ARCHIVE_KEY) || '';
  const note = 'بيتحدث لوحده. الشهر ده بس؛ أول ما الشهر يخلص بيتنقل بأرقامه لتاب لوحده' +
    (archived ? ' (آخر واحد: ' + closingArchiveName_(archived) + ')' : ' (مثلًا ' + closingArchiveName_(closingPrevMonth_(month)) + ')') +
    '، والتاب دي بتبدأ الشهر الجديد من الأول.';
  const res = closingGrid_(month, (cfgStr_('business.name') || 'ADS').toUpperCase() + ' — WEEKLY & MONTHLY CLOSING', note, today, nowText_());
  res.g.live = [[2, 5]];
  if (writeGrid_(sh, res.g)) closingLook_(sh);
  try { autoArchiveClosing_(today); } catch (e) { setStatus_('CLOSING_ARCHIVE', '✗ ' + errText_(e)); }
}

/*
 * The month that ended → its archive tab, once: after the daily run re-pulled that month's last day (SYNCED_THROUGH).
 * Returns the tab name, or '' when there's nothing to do.
 */
function autoArchiveClosing_(today) {
  const props = PropertiesService.getDocumentProperties(), prev = closingPrevMonth_(today.slice(0, 7));
  if ((props.getProperty(CLOSING.ARCHIVE_KEY) || '') >= prev) return '';
  const through = asKey_(props.getProperty('SYNCED_THROUGH') || '');
  if (!through || through < closingKey_(prev, closingDays_(prev))) return '';
  const name = archiveClosing_(prev).name;
  props.setProperty(CLOSING.ARCHIVE_KEY, prev);
  setStatus_('CLOSING_ARCHIVE', '✓ ' + name);
  return name;
}

/* Writes (or rewrites) the archive tab of an ended month, right after the Closing tab, with today's numbers. */
function archiveClosing_(month) {
  const ss = ss_(), name = closingArchiveName_(month);
  let sh = ss.getSheetByName(name);
  if (!sh) {
    const at = ss.getSheets().findIndex(s => s.getName() === APP.T.CLOSING);
    sh = at >= 0 ? ss.insertSheet(name, at + 1) : ss.insertSheet(name);
  }
  const res = closingGrid_(month, (cfgStr_('business.name') || 'ADS').toUpperCase() + ' — CLOSING ARCHIVE | ' + closingMonthName_(month) +
    ' | اتقفل ' + nowText_(), 'أرشيف ثابت: التحديث مابيغيرهوش. عشان يتكتب تاني بالأرقام الحالية (مثلًا بعد ما أوردرات أكتر تتسلم): ' +
    'المنيو ← 🗄 أرشيف Closing لشهر خلص.', '', '');
  writeGrid_(sh, res.g);
  closingLook_(sh);
  sh.setTabColor(CLOSING.ARCHIVE_TAB);
  // A warning only if someone types in it (the code writes as usual). An existing protection is kept.
  if (!sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).length) sh.protect().setDescription('أرشيف ' + closingMonthName_(month)).setWarningOnly(true);
  return { name: name, sheet: sh, total: res.total };
}

/* Menu: archive an ended month (empty = last month). */
function archiveClosingMonth() {
  const ui = SpreadsheetApp.getUi(), current = todayKey_().slice(0, 7), last = closingPrevMonth_(current);
  const answer = ui.prompt('🗄 أرشيف Closing لشهر خلص', 'سيبها فاضية ودوس OK للشهر اللي فات (' + last + ').\n' +
    'أو اكتب شهر تاني خلص بالشكل ده: ' + closingPrevMonth_(last), ui.ButtonSet.OK_CANCEL);
  if (answer.getSelectedButton() !== ui.Button.OK) return;
  const typed = String(answer.getResponseText() || '').trim(), m = typed.match(/^(\d{4})[-/](\d{1,2})$/);
  const month = !typed ? last : (m && +m[2] >= 1 && +m[2] <= 12 ? m[1] + '-' + String(+m[2]).padStart(2, '0') : '');
  if (!month || month >= current) { alert_('اكتب شهر خلص بالشكل ده: ' + last); return; }
  try {
    const r = withLock_(() => archiveClosing_(month));
    const props = PropertiesService.getDocumentProperties();
    if (month > (props.getProperty(CLOSING.ARCHIVE_KEY) || '')) props.setProperty(CLOSING.ARCHIVE_KEY, month);
    try { ss_().setActiveSheet(r.sheet); } catch (ignored) { /* مش مهم */ }
    alert_('الأرشيف جاهز ✅ تاب "' + r.name + '"\nالصرف ' + Math.round(r.total.spend).toLocaleString('en-US') + ' | الأوردرات ' + r.total.orders +
      ' | المتسلم ' + r.total.delivered + ' | REVENUE ' + Math.round(r.total.revenue).toLocaleString('en-US'));
  } catch (e) { alert_('الأرشيف مااتعملش:\n' + errText_(e)); }
}
