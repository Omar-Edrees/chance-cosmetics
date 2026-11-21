/*
 * Drawing the "Analysis & Actions" tab (the parts are in 38_analysis.gs).
 * Left (A–E): the actions, most urgent first (with ✅ to mark one done), then the problems, then the good things.
 * Right, at the top (fixed rows): your tasks (G–K) and the before / after table (L–R), both typed by hand in the yellow rows:
 * they are read before every drawing and drawn again in place, so what you type stays. A task that isn't done joins the
 * actions list with its priority. ✅ on an action moves it to the before / after table (today's date, the metric and what
 * it's on), and hides it for ANA.DONE_DAYS days; before = the 7 days before the day it was done, after = from that day.
 * Right, under them: every part's numbers, one table each.
 * Drawn with the views (every 15 minutes) when there's time left in the run, and from the menu.
 */

/* ---------- Snapshots: every campaign's spend at each 3-hour slot (for the windows' culprits) ---------- */

const ANA_SNAP_HEADERS = ['Date', 'Slot', 'Platform', 'Account ID', 'Campaign ID', 'Campaign', 'Spend'];
/* Called by writeToday_ right after Today's own snapshot (takeIntraday_) was taken: the same day and slot. */
function takeIntraAds_() {
  const h = Number(Utilities.formatDate(new Date(), tz_(), 'H')), today = todayKey_();
  const day = h === 0 ? shiftKey_(today, -1) : today, slot = (h === 0 ? 24 : h) + ':00', by = {};
  recentRows_(APP.T.ADS, ADS_HEADERS.length, 1, asKey_, day).forEach(a => {
    if (asKey_(a[0]) !== day || !a[4] || (a[1] !== 'META' && a[1] !== 'TIKTOK')) return;
    const k = a[1] + '|' + a[4], x = by[k] = by[k] || [day, slot, a[1], String(a[2]), String(a[4]), String(a[5] || ''), 0];
    x[6] += num_(a[10]);
  });
  const rows = Object.keys(by).map(k => by[k]).filter(r => r[6] > 0).map(r => { r[6] = round2_(r[6]); return r; });
  const sh = ensureTab_(ANA.SNAP, ANA_SNAP_HEADERS), props = PropertiesService.getDocumentProperties();
  if (!sh.isSheetHidden()) sh.hideSheet();
  if (props.getProperty('ANA_SNAP_DAY') !== day && sh.getLastRow() > 1) { // once a day: keep the last 14 days only
    const keep = readRows_(sh, ANA_SNAP_HEADERS.length).filter(r => asKey_(r[0]) >= shiftKey_(day, -14));
    sh.getRange(2, 1, sh.getLastRow() - 1, ANA_SNAP_HEADERS.length).clearContent();
    if (keep.length) {
      sh.getRange(2, 1, keep.length, 5).setNumberFormat('@');
      sh.getRange(2, 1, keep.length, ANA_SNAP_HEADERS.length).setValues(keep.map(r => [asKey_(r[0]), intraSlot_(r[1])].concat(r.slice(2))));
    }
  }
  props.setProperty('ANA_SNAP_DAY', day);
  if (!rows.length) return;
  const at = sh.getLastRow() + 1;
  sh.getRange(at, 1, rows.length, 5).setNumberFormat('@');
  sh.getRange(at, 1, rows.length, ANA_SNAP_HEADERS.length).setValues(rows);
}

/* ---------- What's typed in the tab ---------- */

/* The tasks and the before / after rows typed in the tab, and the ✅ ones not written yet. */
function anaReadManual_(sh, today) {
  const props = PropertiesService.getDocumentProperties(), n = Number(props.getProperty(ANA.ROWS_KEY) || 0), out = { tasks: [], ba: [], n: n };
  if (n > 0 && sh.getLastRow() >= ANA.TOP + 2) {
    sh.getRange(ANA.TOP + 2, ANA.R, n, 12).getValues().forEach(v => {
      if (String(v[0]).trim()) out.tasks.push({ text: String(v[0]).trim(), pri: anaPri_(v[1]),
        status: ANA.STATUS.indexOf(String(v[2]).trim()) >= 0 ? String(v[2]).trim() : ANA.STATUS[0], added: anaDate_(v[3], today) || today, note: String(v[4] || '').trim() });
      if (String(v[5]).trim()) out.ba.push({ text: String(v[5]).trim(), done: v[6] instanceof Date ? dayKey_(v[6]) : String(v[6] || '').trim() || today,
        metric: String(v[7] || '').trim() || ANA.METRICS[0], scope: String(v[8] || '').trim() || ANA.BIZ });
    });
  }
  let pend = [];
  try { pend = JSON.parse(props.getProperty(ANA.PENDING_KEY) || '[]'); } catch (e) { pend = []; }
  pend.forEach(p => { if (!out.ba.some(x => x.text === p.text && x.done === p.done)) out.ba.push(p); });
  props.deleteProperty(ANA.PENDING_KEY);
  return out;
}
function anaDone_() {
  try { return JSON.parse(PropertiesService.getDocumentProperties().getProperty(ANA.DONE_KEY) || '{}'); } catch (e) { return {}; }
}

/* EXT.edit: ✅ next to an action. It goes to the before / after table and is hidden for ANA.DONE_DAYS days. */
function anaEdit_(name, a1) {
  if (name !== ANA.TAB) return;
  const m = String(a1).match(/^E(\d+)$/);
  if (!m) return;
  const sh = tab_(ANA.TAB), row = Number(m[1]);
  if (sh.getRange(row, 5).getValue() !== true) return;
  let finds = [];
  try { finds = JSON.parse(propGetBig_(ANA.FIND_KEY) || '[]'); } catch (e) { finds = []; }
  const f = finds.find(x => x.row === row);
  if (!f) return;
  const props = PropertiesService.getDocumentProperties(), today = todayKey_(), done = anaDone_();
  done[f.id] = today;
  Object.keys(done).forEach(k => { if (done[k] < shiftKey_(today, -30)) delete done[k]; });
  props.setProperty(ANA.DONE_KEY, JSON.stringify(done));
  const item = { text: f.action, done: today, metric: f.metric || ANA.METRICS[0], scope: f.scope || ANA.BIZ };
  const n = Number(props.getProperty(ANA.ROWS_KEY) || 0), first = ANA.TOP + 2;
  const free = n ? sh.getRange(first, ANA.BA, n, 1).getValues().findIndex(v => !String(v[0]).trim()) : -1;
  if (free >= 0) sh.getRange(first + free, ANA.BA, 1, 4).setValues([[item.text, item.done, item.metric, item.scope]]);
  else {
    let pend = [];
    try { pend = JSON.parse(props.getProperty(ANA.PENDING_KEY) || '[]'); } catch (e) { pend = []; }
    pend.push(item);
    props.setProperty(ANA.PENDING_KEY, JSON.stringify(pend));
  }
  if (f.trow) sh.getRange(f.trow, ANA.R + 2).setValue(ANA.STATUS[2]);
  sh.getRange(row, 1, 1, 5).setBackground('#e5e7eb');
}

/* ---------- Drawing ---------- */

function writeAnalysisTab_() {
  if (DEADLINE_ && DEADLINE_ - Date.now() < 60000) return false; // not enough time left in this run: the next one draws it
  const sh = ensureTab_(ANA.TAB), today = todayKey_(), props = PropertiesService.getDocumentProperties();
  const manual = anaReadManual_(sh, today), F = anaFacts_(today), ctx = { mc: MC_LAST_ ? MC_LAST_.camps : null };
  ctx.be = anaBe_(F);
  const P = {}, errors = [];
  [['acc', () => anaAccounts_(F, ctx)], ['win', () => anaThreeHours_(F, ctx)], ['bench', () => anaBench_(F, ctx)], ['funnel', () => anaFunnel_(F)],
    ['camps', () => anaCampaigns_(F, ctx)], ['stock', () => anaStock_(F)], ['cancel', () => anaCancelPart_(F, ctx)], ['dup', () => anaDup_(F, ctx)],
    ['shop', () => anaShopify_(F)], ['prod', () => anaProducts_(F, ctx)], ['gov', () => anaGov_(F)], ['cat', () => anaCatalog_(F, ctx)]]
    .forEach(x => { try { P[x[0]] = x[1](); } catch (e) { P[x[0]] = { find: [] }; errors.push(x[0] + ': ' + errText_(e)); } });
  const done = anaDone_(), since = shiftKey_(today, -ANA.DONE_DAYS);
  let finds = [];
  Object.keys(P).forEach(k => { finds = finds.concat(P[k].find || []); });
  const seen = {};
  finds = finds.filter(f => !(done[f.id] && done[f.id] > since) && !seen[f.id] && (seen[f.id] = true));
  const order = (a, b) => (a.pri - b.pri) || (b.impact - a.impact);
  // Your tasks: open ones first by priority; they join the actions.
  const tasks = manual.tasks.slice().sort((a, b) => ((a.status === ANA.STATUS[2]) - (b.status === ANA.STATUS[2])) || (a.pri - b.pri));
  const N = Math.max(ANA.MIN_ROWS, tasks.length + ANA.SPARE, manual.ba.length + ANA.SPARE), first = ANA.TOP + 2;
  const actions = finds.slice().concat(tasks.map((t, i) => ({ id: 'task|' + sha_(t.text).slice(0, 12), kind: 'task', pri: t.pri, area: 'مهمة يدوية', title: t.note || 'مكتوبة بإيدك يوم ' + t.added,
    action: t.text, impact: 0, metric: ANA.METRICS[0], scope: ANA.BIZ, trow: first + i, status: t.status })).filter(t => t.status !== ANA.STATUS[2]))
    .sort(order);

  const g = todayGrid_();
  g.width = ANA.WIDTH;
  const W = ANA.WIDTH, R = ANA.R, BA = ANA.BA, dark = { bg: ANA.DARK, fc: '#ffffff', b: 'bold' };
  g.set(1, 1, 'ANALYSIS & ACTIONS — تعمل إيه دلوقتي' + (ctx.be ? ' | رؤاس التعادل ' + anaNum_(ctx.be, 2) : ' | مفيش رؤاس تعادل: اكتب be.roas في Settings'), dark);
  g.fill(1, 2, W - 1, { bg: ANA.DARK });
  g.merge(1, 1, 1, W);
  g.set(2, 1, 'الأكشنز مترتبة من الأهم: 🔴 عاجل (بيخسرك دلوقتي)، 🟠 مهم، 🟡 راقب، 🟢 فرصة تكبّر فيها، وجوه كل أولوية الأكبر فلوس الأول. ' +
    'علّم ✅ لما تعمل الأكشن: بيتنقل لجدول "قبل وبعد" ويستخبى ' + ANA.DONE_DAYS + ' أيام. اكتب مهامك في الصفوف الصفرا (بتدخل في الأكشنز بأولويتها)، ' +
    'وفي "قبل وبعد" اكتب الأكشن ويوم ما عملته والمقياس وعلى إيه (البيزنس كله، أو اسم حساب أو منتج أو كامبين): قبل = الـ 7 أيام اللي قبلها، بعد = من يومها.' +
    (errors.length ? '   ⚠️ أجزاء ماتحسبتش: ' + errors.join(' | ') : ''), { fc: '#374151' });
  g.merge(2, 1, 1, W);
  g.set(3, 1, 'آخر تحديث ' + nowText_(), { fc: ANA.GREY });
  g.merge(3, 1, 1, 3);

  // Left: actions, problems, good things.
  let r = todayHead_(g, ANA.TOP, 1, 5, 'الأكشنز — تعمل إيه بالترتيب (' + actions.length + ')', ['الأولوية', 'الأكشن', 'ليه (المشكلة بالأرقام)', 'القسم', '✅ اتعملت']);
  const findRows = [];
  if (!actions.length) { g.set(r, 1, 'مفيش أكشنز دلوقتي', { fc: ANA.GREY }); g.merge(r, 1, 1, 5); r++; }
  actions.forEach(f => {
    const bg = ANA.PRI_BG[f.pri];
    g.set(r, 1, ANA.PRI[f.pri], { bg: bg, b: 'bold', al: 'center' });
    g.set(r, 2, f.action, { b: 'bold' });
    g.set(r, 3, f.kind === 'task' ? f.title : f.title + (f.detail ? ' — ' + f.detail : ''), {});
    g.set(r, 4, f.area, { al: 'center', fc: ANA.GREY });
    g.set(r, 5, false, { al: 'center' });
    findRows.push({ row: r, id: f.id, action: f.action, metric: f.metric, scope: f.scope, trow: f.trow || 0 });
    r++;
  });
  const listOf = (title, kind, headers) => {
    r = todayHead_(g, r + 1, 1, 4, title, headers);
    const list = finds.filter(f => f.kind === kind).sort(order);
    if (!list.length) { g.set(r, 1, kind === 'bad' ? 'مفيش مشاكل ظاهرة دلوقتي ✅' : 'مفيش حاجة طالعة بوضوح دلوقتي', { fc: ANA.GREY }); g.merge(r, 1, 1, 4); r++; }
    list.forEach(f => {
      g.set(r, 1, ANA.PRI[f.pri], { bg: ANA.PRI_BG[f.pri], b: 'bold', al: 'center' });
      g.set(r, 2, f.title, { b: 'bold' });
      g.set(r, 3, f.detail || '', {});
      g.set(r, 4, f.area, { al: 'center', fc: ANA.GREY });
      r++;
    });
  };
  listOf('المشاكل (' + finds.filter(f => f.kind === 'bad').length + ')', 'bad', ['الأولوية', 'المشكلة', 'التفاصيل', 'القسم']);
  listOf('الحاجات الكويسة (' + finds.filter(f => f.kind === 'good').length + ')', 'good', ['', 'الحاجة الكويسة', 'التفاصيل', 'القسم']);

  // Right, top: your tasks and before / after, in fixed rows.
  todayHead_(g, ANA.TOP, R, 5, 'مهامي — اكتب هنا', ['المهمة', 'الأولوية', 'الحالة', 'اتضافت يوم', 'ملاحظات']);
  todayHead_(g, ANA.TOP, BA, 7, 'قبل وبعد — الأكشنز اللي اتعملت', ['الأكشن', 'اتعمل يوم', 'المقياس', 'على', 'قبل (7 أيام)', 'بعد', 'التغيير']);
  for (let i = 0; i < N; i++) {
    const t = tasks[i], row = first + i, inp = { bg: ANA.INPUT };
    if (t) {
      const closed = t.status === ANA.STATUS[2], st = closed ? { bg: '#e5e7eb', fc: ANA.GREY } : inp;
      g.set(row, R, t.text, Object.assign({ b: closed ? 'normal' : 'bold' }, st));
      g.set(row, R + 1, ANA.PRI[t.pri], Object.assign({ al: 'center' }, closed ? st : { bg: ANA.PRI_BG[t.pri] }));
      g.set(row, R + 2, t.status, Object.assign({ al: 'center' }, st));
      g.set(row, R + 3, t.added, Object.assign({ al: 'center' }, st));
      g.set(row, R + 4, t.note, st);
    } else g.fill(row, R, 5, inp);
    const x = manual.ba[i];
    if (x) {
      const v = anaBeforeAfter_(F, x), bg = v.good === true ? ANA.GREEN : v.good === false ? ANA.RED : null;
      g.set(row, BA, x.text, Object.assign({ b: 'bold' }, inp));
      g.set(row, BA + 1, anaDate_(x.done, today) || x.done, Object.assign({ al: 'center' }, inp));
      g.set(row, BA + 2, v.metric || x.metric, Object.assign({ al: 'center' }, inp));
      g.set(row, BA + 3, x.scope, inp);
      g.set(row, BA + 4, typeof v.before === 'number' ? anaNum_(v.before, 4) : v.before, { nf: v.nf, al: 'center' });
      g.set(row, BA + 5, typeof v.after === 'number' ? anaNum_(v.after, 4) : v.after, { nf: v.nf, al: 'center' });
      g.set(row, BA + 6, v.change, { al: 'center', b: 'bold', bg: bg });
    } else { g.fill(row, BA, 4, inp); }
    g.cell(row, R + 3).nf = '@'; // dates stay as typed text (2026-11-21)
    g.cell(row, BA + 1).nf = '@';
  }

  // Right, under them: the parts' numbers.
  let q = first + N + 1;
  q = anaDrawRoas_(g, q, F, P.acc, ctx) + 1;
  q = anaDrawWindows_(g, q, F, P.win) + 1;
  q = anaDrawBench_(g, q, P.bench) + 1;
  q = anaDrawFunnel_(g, q, P.funnel) + 1;
  q = anaDrawStock_(g, q, P.stock) + 1;
  q = anaDrawCancel_(g, q, P.cancel) + 1;
  q = anaDrawDup_(g, q, P.dup) + 1;
  q = anaDrawShop_(g, q, P.shop) + 1;
  q = anaDrawProducts_(g, q, P.prod) + 1;
  q = anaDrawGov_(g, q, P.gov) + 1;
  anaDrawCatalog_(g, q, P.cat);
  g.live = [[3, 1]];

  const oldN = Number(props.getProperty(ANA.ROWS_KEY) || 0);
  let oldFinds = [];
  try { oldFinds = JSON.parse(propGetBig_(ANA.FIND_KEY) || '[]'); } catch (e) { oldFinds = []; }
  const drew = writeGrid_(sh, g);
  props.setProperty(ANA.ROWS_KEY, String(N));
  propSetBig_(ANA.FIND_KEY, JSON.stringify(findRows));
  if (errors.length) console.error('Analysis: ' + errors.join(' | '));
  if (!drew) return true;
  // The ✅ boxes and the lists to choose from, where the rows are now.
  const lastOld = oldFinds.length ? oldFinds[oldFinds.length - 1].row : 0;
  if (lastOld >= ANA.TOP) sh.getRange(ANA.TOP, 5, lastOld - ANA.TOP + 1, 1).setDataValidation(null);
  if (findRows.length) sh.getRange(findRows[0].row, 5, findRows.length, 1).insertCheckboxes();
  if (oldN > N) sh.getRange(first + N, R, oldN - N, 12).setDataValidation(null);
  const list = (vals, bad) => SpreadsheetApp.newDataValidation().requireValueInList(vals.slice(0, 500), true).setAllowInvalid(!!bad).build();
  const scopes = [ANA.BIZ].concat(Object.keys(F.accName).map(id => F.accName[id]),
    Object.keys(F.items).filter(n => anaSum_(F.items[n], shiftKey_(today, -30), today).orders >= 3).sort(),
    Object.keys(F.campName).filter(k => anaSum_(F.camp[k], shiftKey_(today, -14), today).spend > 0).map(k => F.campName[k]));
  sh.getRange(first, R + 1, N, 1).setDataValidation(list([1, 2, 3, 4].map(k => ANA.PRI[k])));
  sh.getRange(first, R + 2, N, 1).setDataValidation(list(ANA.STATUS));
  sh.getRange(first, BA + 2, N, 1).setDataValidation(list(ANA.METRICS));
  sh.getRange(first, BA + 3, N, 1).setDataValidation(list(Array.from(new Set(scopes)), true));
  ANA.WIDTHS.forEach((w, i) => sh.setColumnWidth(i + 1, w));
  sh.getRange(1, 2, sh.getMaxRows(), 2).setWrap(true);
  sh.getRange(first, R, N, 1).setWrap(true);
  sh.getRange(first, BA, N, 1).setWrap(true);
  sh.getRange(first + N, R, Math.max(q - first - N, 1), 1).setWrap(true);
  sh.getRange(first + N, BA, Math.max(q - first - N, 1), 1).setWrap(true);
  sh.getRange(1, 1, Math.max(g.rows.length, 1), W).setVerticalAlignment('top');
  return true;
}

/* A part's title bar and header row on the right side, from column G; returns the first data row. */
function anaHead_(g, r, title, headers) { return todayHead_(g, r, ANA.R, headers.length, title, headers); }
function anaEmpty_(g, r, text) { g.set(r, ANA.R, text, { fc: ANA.GREY }); g.merge(r, ANA.R, 1, 6); return r + 1; }
function anaRoasCell_(g, r, c, v, be, ref) {
  if (v === null || v === undefined || v === '') { g.set(r, c, '—', { al: 'center', fc: ANA.GREY }); return; }
  const t = be || ref, bg = !t ? null : v >= t * (be ? 1.2 : 1) ? ANA.GREEN : v >= t * (be ? 1 : 0.8) ? ANA.AMBER : ANA.RED;
  g.set(r, c, anaNum_(v, 2), { nf: ANA.RATIO, al: 'center', bg: bg });
}

function anaDrawRoas_(g, r, F, part, ctx) {
  const meta = (part && part.meta || []).slice(0, 4), tt = (part && part.tt || []).slice(0, 5), be = ctx.be, R = ANA.R;
  g.set(r, R, 'META — Shopify ROAS لكل حساب يوم بيوم (الأخضر فوق التعادل بـ 20%، الأصفر حواليه، الأحمر تحته)', { bg: ANA.DARK, fc: '#ffffff', b: 'bold' });
  g.fill(r, R + 1, 5, { bg: ANA.DARK });
  g.merge(r, R, 1, 6);
  g.set(r, R + 6, 'TIKTOK — Shopify ROAS لكل حساب', { bg: '#111111', fc: '#ffffff', b: 'bold' });
  g.fill(r, R + 7, 5, { bg: '#111111' });
  g.merge(r, R + 6, 1, 6);
  r++;
  const head = ['اليوم', 'كل Meta'].concat(meta.map(id => F.accName[id]));
  while (head.length < 6) head.push('');
  head.push('كل TikTok');
  tt.forEach(id => head.push(F.accName[id]));
  head.forEach((h, i) => g.set(r, R + i, h, { bg: TODAY.YELLOW, b: 'bold', al: 'center' }));
  g.fill(r, R + head.length, Math.max(0, 12 - head.length), { bg: TODAY.YELLOW });
  r++;
  const sumIds = (ids, from, to) => ids.reduce((t, id) => anaAdd_(t, anaSum_(F.acc[id], from, to)), anaZero_());
  const allMeta = Object.keys(F.accPlat).filter(id => F.accPlat[id] === 'META'), allTt = Object.keys(F.accPlat).filter(id => F.accPlat[id] === 'TIKTOK');
  const line = (label, from, to, style) => {
    g.set(r, R, label, Object.assign({ b: 'bold' }, style || {}));
    const ref = anaRoas_(sumIds(allMeta, F.month0, F.today)), refT = anaRoas_(sumIds(allTt, F.month0, F.today));
    anaRoasCell_(g, r, R + 1, anaRoas_(sumIds(allMeta, from, to)), be, ref);
    meta.forEach((id, i) => anaRoasCell_(g, r, R + 2 + i, anaRoas_(anaSum_(F.acc[id], from, to)), be, ref));
    if (allTt.length) {
      anaRoasCell_(g, r, R + 6, anaRoas_(sumIds(allTt, from, to)), be, refT);
      tt.forEach((id, i) => anaRoasCell_(g, r, R + 7 + i, anaRoas_(anaSum_(F.acc[id], from, to)), be, refT));
    }
    r++;
  };
  line('الشهر لحد النهارده', F.month0, F.today, { bg: ANA.BLUE });
  for (let d = F.today; d >= F.month0; d = shiftKey_(d, -1)) line(anaDay_(d) + (d === F.today ? ' (لحد دلوقتي)' : ''), d, d);
  return r;
}

function anaDrawWindows_(g, r, F, part) {
  const R = ANA.R;
  r = anaHead_(g, r, '3-HOUR CHECK — كل 3 ساعات لوحدها (مش من أول اليوم): الرؤاس قدام نفس الوقت في الـ 7 أيام اللي قبل إمبارح، والكامبينات اللي صرفت أكتر فيها',
    ['الوقت', 'صرف Meta', 'أوردرات (Meta + DIRECT)', 'Shopify ROAS', 'المعتاد (7 أيام)', 'أكتر كامبينات صرفت في الوقت ده', 'صرف TikTok', 'أوردرات TikTok', 'ROAS TikTok']);
  const rows = part && part.rows || [];
  if (!rows.length) return anaEmpty_(g, r, 'مفيش لقطات لسه (بتتاخد كل 3 ساعات في Today)');
  let last = -1;
  rows.forEach(x => {
    if (x.n !== last) { last = x.n; g.set(r, R, x.n ? 'إمبارح ' + anaDay_(x.d) : 'النهارده', { bg: ANA.LABEL, b: 'bold' }); g.fill(r, R + 1, 8, { bg: ANA.LABEL }); r++; }
    const m = x.w.META, t = x.w.TIKTOK;
    g.set(r, R, anaHour_(x.w.from) + ' → ' + anaHour_(x.w.to), { b: 'bold' });
    g.set(r, R + 1, anaNum_(m.spend, 0), { nf: ANA.MONEY, al: 'right' });
    g.set(r, R + 2, m.orders, { nf: ANA.COUNT, al: 'center' });
    g.set(r, R + 3, x.r === null ? '—' : anaNum_(x.r, 2), { nf: ANA.RATIO, al: 'center', b: 'bold', bg: x.weak ? ANA.RED : x.r !== null && x.ur && x.r >= x.ur ? ANA.GREEN : null });
    g.set(r, R + 4, x.ur === null ? '—' : anaNum_(x.ur, 2), { nf: ANA.RATIO, al: 'center', fc: ANA.GREY });
    g.set(r, R + 5, x.weak || x.why ? x.why : '', { fc: x.weak ? '#991b1b' : '#374151' });
    g.set(r, R + 6, anaNum_(t.spend, 0), { nf: ANA.MONEY, al: 'right' });
    g.set(r, R + 7, t.orders, { nf: ANA.COUNT, al: 'center' });
    g.set(r, R + 8, t.spend > 0 ? anaNum_(t.revenue / t.spend, 2) : '—', { nf: ANA.RATIO, al: 'center' });
    r++;
  });
  return r;
}

function anaDrawBench_(g, r, part) {
  const R = ANA.R;
  r = anaHead_(g, r, 'META BENCHMARK vs TODAY — لكل حساب: المتريكس اللي أوحش من التلات شهور اللي فاتوا بأكتر من ' + Math.round(ANA.WORSE * 100) + '% (TikTok: قدام آخر 7 أيام)',
    ['الحساب', 'الصرف النهارده', 'ROAS النهارده', 'ROAS البنشمارك', 'متريكس أوحش', 'اللي أوحش (النهارده بدل البنشمارك)']);
  const rows = part && part.rows || [];
  if (!rows.length) return anaEmpty_(g, r, 'لسه مفيش أرقام النهارده من Meta');
  rows.forEach(x => {
    g.set(r, R, (x.plat === 'TIKTOK' ? 'TikTok ' : '') + x.name, { b: 'bold' });
    g.set(r, R + 1, anaNum_(x.spend, 0), { nf: ANA.MONEY, al: 'right' });
    g.set(r, R + 2, x.roas === '' || x.roas === null ? '—' : anaNum_(x.roas, 2), { nf: ANA.RATIO, al: 'center' });
    g.set(r, R + 3, x.base === '' || x.base === null ? '—' : anaNum_(x.base, 2), { nf: ANA.RATIO, al: 'center', fc: ANA.GREY });
    g.set(r, R + 4, x.worse.length, { al: 'center', b: 'bold', bg: x.worse.length >= 3 ? ANA.RED : x.worse.length ? ANA.AMBER : ANA.GREEN });
    g.set(r, R + 5, x.text, {});
    r++;
  });
  return r;
}

function anaDrawFunnel_(g, r, part) {
  const R = ANA.R;
  r = anaHead_(g, r, 'DAILY ACCOUNT FUNNEL — آخر 3 أيام كاملة قدام الـ 14 يوم اللي قبلها: الخطوات اللي وقعت أو اتحسنت ' + Math.round(ANA.DROP * 100) + '% أو أكتر' +
    (part && part.day ? ' (قراية Meta: ' + part.day + ')' : ''), ['الحساب', 'صرف 3 أيام', 'CVR 3 أيام', 'CVR قبلها', 'خطوات وقعت', 'اللي وقع / اللي اتحسن']);
  if (!part || part.none) return anaEmpty_(g, r, 'أرقام الفانل بتيجي مع تحديث Daily Account Funnel (كل 3 ساعات أو من المنيو 📈)');
  if (!part.rows.length) return anaEmpty_(g, r, 'مفيش حساب صرف ' + ANA.MIN_SPEND + ' أو أكتر في آخر 3 أيام');
  const show = x => x.name + ' ' + (/%/.test(x.nf) ? (Math.round(x.v * 1000) / 10) + '%' : anaNum_(x.v, 2)) + ' (' + anaPct_(x.v / x.b - 1) + ')';
  part.rows.forEach(x => {
    g.set(r, R, x.name, { b: 'bold' });
    g.set(r, R + 1, anaNum_(x.spend, 0), { nf: ANA.MONEY, al: 'right' });
    g.set(r, R + 2, x.cvr === '' ? '—' : x.cvr, { nf: '0.00%', al: 'center' });
    g.set(r, R + 3, x.cvrB === '' ? '—' : x.cvrB, { nf: '0.00%', al: 'center', fc: ANA.GREY });
    g.set(r, R + 4, x.worse.length, { al: 'center', b: 'bold', bg: x.worse.length ? ANA.RED : ANA.GREEN });
    g.set(r, R + 5, (x.worse.length ? '🔻 ' + x.worse.map(show).join('، ') : '') + (x.worse.length && x.better.length ? '\n' : '') +
      (x.better.length ? '🔺 ' + x.better.map(show).join('، ') : '') || '✅ مفيش تغيير كبير', {});
    r++;
  });
  return r;
}

function anaDrawStock_(g, r, part) {
  const R = ANA.R;
  r = anaHead_(g, r, 'الستوك — الألوان اللي خلصت أو هتخلص في ' + COVER.RED + ' أيام أو أقل وعليها طلب، الأكتر طلب الأول (القطع من أوردرات مااتلغتش ولا رجعت)',
    ['المنتج ← اللون', 'الستوك', 'اتباع آخر 7 أيام', 'اتباع آخر 30 يوم', 'يكفي كام يوم', 'ملاحظة', 'اطلب كام (30 يوم)']);
  if (!part || part.none) return anaEmpty_(g, r, 'محتاج الشيت مربوط بأبليكيشن شوبيفاي (ستوك الألوان وأوردراتها)');
  if (!part.rows.length) return anaEmpty_(g, r, 'مفيش ألوان بتتباع وقرّبت تخلص ✅');
  part.rows.forEach(p => {
    g.set(r, R, p.name, { b: 'bold', bg: ANA.LABEL });
    g.fill(r, R + 1, 6, { bg: ANA.LABEL });
    g.set(r, R + 3, p.m, { nf: ANA.COUNT, al: 'center', b: 'bold', bg: ANA.LABEL });
    g.set(r, R + 5, p.ads > 0 ? 'عليه ' + p.ads + ' إعلان شغال' : 'مفيش إعلانات شغالة', { bg: ANA.LABEL, fc: p.ads > 0 ? '#991b1b' : ANA.GREY });
    r++;
    p.list.forEach(v => {
      g.set(r, R, '   ↳ ' + v.title, {});
      g.set(r, R + 1, v.stock, { nf: ANA.COUNT, al: 'center' });
      g.set(r, R + 2, v.w, { nf: ANA.COUNT, al: 'center' });
      g.set(r, R + 3, v.m, { nf: ANA.COUNT, al: 'center' });
      g.set(r, R + 4, v.days === 0 ? 'نفد' : Math.floor(v.days), { nf: ANA.COUNT, al: 'center', b: 'bold', bg: ANA.RED });
      g.set(r, R + 5, v.days === 0 ? 'خلص وكان بيتباع ' + (Math.round(v.per * 10) / 10) + ' في اليوم' : 'بيتباع ' + (Math.round(v.per * 10) / 10) + ' في اليوم', { fc: ANA.GREY });
      g.set(r, R + 6, v.need, { nf: ANA.COUNT, al: 'center', b: 'bold' });
      r++;
    });
  });
  return r;
}

function anaDrawCancel_(g, r, part) {
  const R = ANA.R, pc = v => (v === null || v === undefined ? '—' : v);
  r = anaHead_(g, r, 'الإلغاء — آخر 7 أيام كاملة قدام الـ 7 اللي قبلها (الإلغاء = اتلغى ÷ الأوردرات اللي اتحسمت: اتلغت أو اتشحنت؛ المرتجع = رجع ÷ الشحنات اللي خلصت)',
    ['البند', 'أوردرات', 'اتحسموا', 'اتلغى', 'نسبة الإلغاء', 'الإلغاء قبلها', 'التغيير', 'المرتجع', 'المرتجع قبلها']);
  if (!part || !part.rows) return anaEmpty_(g, r, 'مفيش أوردرات');
  part.rows.forEach((x, i) => {
    const up = x.ca !== null && x.cb !== null ? x.ca - x.cb : null;
    g.set(r, R, x.label, { b: 'bold', bg: i < 2 ? ANA.BLUE : null });
    g.set(r, R + 1, x.a.orders, { nf: ANA.COUNT, al: 'center' });
    g.set(r, R + 2, x.a.decided, { nf: ANA.COUNT, al: 'center' });
    g.set(r, R + 3, x.a.cancelled, { nf: ANA.COUNT, al: 'center' });
    g.set(r, R + 4, pc(x.ca), { nf: ANA.PCT, al: 'center', b: 'bold' });
    g.set(r, R + 5, pc(x.cb), { nf: ANA.PCT, al: 'center', fc: ANA.GREY });
    g.set(r, R + 6, up === null ? '—' : (up > 0 ? '+' : '') + Math.round(up * 1000) / 10 + ' نقطة', { al: 'center', bg: up === null ? null : up >= 0.03 ? ANA.RED : up <= -0.03 ? ANA.GREEN : null });
    g.set(r, R + 7, pc(x.ra), { nf: ANA.PCT, al: 'center' });
    g.set(r, R + 8, pc(x.rb), { nf: ANA.PCT, al: 'center', fc: ANA.GREY });
    r++;
  });
  r = anaHead_(g, r + 1, 'ACTUAL ROAS — آخر 14 يوم: الإلغاء والمرتجع والرؤاس الفعلي (المتسلم بس ÷ الصرف) يوم بيوم',
    ['اليوم', 'أوردرات', 'اتحسموا', 'اتلغى', 'نسبة الإلغاء', 'ملاحظة', 'المرتجع', 'الصرف', 'Actual ROAS']);
  (part.days || []).forEach(x => {
    g.set(r, R, anaDay_(x.d), { b: 'bold' });
    g.set(r, R + 1, x.x.orders, { nf: ANA.COUNT, al: 'center' });
    g.set(r, R + 2, x.x.decided, { nf: ANA.COUNT, al: 'center' });
    g.set(r, R + 3, x.x.cancelled, { nf: ANA.COUNT, al: 'center' });
    g.set(r, R + 4, pc(x.c), { nf: ANA.PCT, al: 'center', b: 'bold', bg: x.spike ? ANA.RED : null });
    g.set(r, R + 5, x.spike ? 'الإلغاء عالي (المتوسط ' + Math.round(part.avg * 100) + '%)' : x.x.orders && x.x.decided < x.x.orders / 2 ? 'أغلب الأوردرات لسه ماتحسمتش' : '', { fc: x.spike ? '#991b1b' : ANA.GREY });
    g.set(r, R + 6, x.x.finished > 0 ? x.x.returned / x.x.finished : '—', { nf: ANA.PCT, al: 'center' });
    g.set(r, R + 7, anaNum_(x.x.spend, 0), { nf: ANA.MONEY, al: 'right' });
    g.set(r, R + 8, x.roas === null ? '—' : anaNum_(x.roas, 2), { nf: ANA.RATIO, al: 'center' });
    r++;
  });
  return r;
}

function anaDrawDup_(g, r, part) {
  const R = ANA.R;
  r = anaHead_(g, r, 'DUPLICATION — آخر 7 أيام: الكامبينات اللي المنصة بتعد فيها أوردرات أكتر من شوبيفاي بـ ' + Math.round(ANA.DUP * 100) + '% أو أكتر (صرف ' + ANA.DUP_SPEND + ' أو أكتر)',
    ['الكامبين', 'الصرف', 'أوردرات المنصة', 'أوردرات شوبيفاي', 'الدوبليكيشن', 'الحساب', 'CPP المنصة', 'CPP الحقيقي', 'الحالة']);
  if (part && part.all) ['META', 'TIKTOK'].forEach(p => {
    const a = part.all[p] && part.all[p].all;
    if (!a || !(a.spend > 0)) return;
    const shop = a.utm + a.direct;
    g.set(r, R, (p === 'META' ? 'كل Meta' : 'كل TikTok'), { b: 'bold', bg: ANA.BLUE });
    g.set(r, R + 1, anaNum_(a.spend, 0), { nf: ANA.MONEY, al: 'right', bg: ANA.BLUE });
    g.set(r, R + 2, a.pixel, { nf: ANA.COUNT, al: 'center', bg: ANA.BLUE });
    g.set(r, R + 3, anaNum_(shop, 1), { al: 'center', bg: ANA.BLUE });
    g.set(r, R + 4, shop > 0 ? (a.pixel - shop) / shop : '—', { nf: '0%', al: 'center', b: 'bold', bg: ANA.BLUE });
    g.fill(r, R + 5, 4, { bg: ANA.BLUE });
    r++;
  });
  const rows = part && part.rows || [];
  if (!rows.length) return anaEmpty_(g, r, 'مفيش كامبين فيها دوبليكيشن كبير ✅');
  rows.forEach(x => {
    g.set(r, R, x.name, { b: 'bold' });
    g.set(r, R + 1, anaNum_(x.s.spend, 0), { nf: ANA.MONEY, al: 'right' });
    g.set(r, R + 2, x.s.pixel, { nf: ANA.COUNT, al: 'center' });
    g.set(r, R + 3, anaNum_(x.shop, 1), { al: 'center' });
    g.set(r, R + 4, x.dup === null ? 'مفيش أوردرات' : x.dup, { nf: '0%', al: 'center', b: 'bold', bg: ANA.RED });
    g.set(r, R + 5, x.acc, { fc: ANA.GREY });
    g.set(r, R + 6, anaNum_(x.cppP, 0), { nf: ANA.MONEY, al: 'right' });
    g.set(r, R + 7, x.cppS ? anaNum_(x.cppS, 0) : '—', { nf: ANA.MONEY, al: 'right', b: 'bold' });
    g.set(r, R + 8, x.on ? '🟢 شغالة' : '⏸ واقفة', { al: 'center' });
    r++;
  });
  return r;
}

function anaDrawShop_(g, r, part) {
  const R = ANA.R, m = part && part.m;
  r = anaHead_(g, r, 'SHOPIFY — النهارده قدام إمبارح والأسبوع اللي فات لحد نفس الساعة' + (m ? ' (' + m.at + ')' : ''),
    ['المتريك', 'النهارده', 'إمبارح', 'التغيير', m ? m.wName : 'الأسبوع اللي فات', 'المعنى', 'التغيير عن الأسبوع']);
  if (!m) return anaEmpty_(g, r, 'كروت شوبيفاي لسه ماتقرتش النهارده (محتاج الشيت مربوط بالأبليكيشن)');
  const means = { spend: 'الصرف', sessions: 'الزيارات من غير البوتات', total: 'بعد المرتجعات والإلغاء', gross: 'المنتجات قبل الخصم', orders: 'كل أوردرات المتجر',
    cr: 'الزيارات اللي اشترت', aov: 'متوسط الأوردر', bounce: 'اللي خرج من أول صفحة (الأقل أحسن)' };
  m.cards.forEach(c => {
    const a = c.values[0], b = c.values[1], w = c.values[2], nf = c.pct ? '0.00%' : ANA.MONEY;
    const ch = (x, y) => (typeof x === 'number' && typeof y === 'number' && y > 0 ? x / y - 1 : '');
    const bg = v => (v === '' || c.up === null || Math.abs(v) < SHOPTAB.STEP ? null : (v > 0) === c.up ? ANA.GREEN : ANA.RED);
    const c1 = ch(a, b), c2 = ch(a, w);
    g.set(r, R, c.title, { b: 'bold' });
    g.set(r, R + 1, a === '' ? '—' : a, { nf: nf, al: 'right', b: 'bold' });
    g.set(r, R + 2, b === '' ? '—' : b, { nf: nf, al: 'right', fc: ANA.GREY });
    g.set(r, R + 3, c1 === '' ? '—' : c1, { nf: '0%', al: 'center', bg: bg(c1) });
    g.set(r, R + 4, w === '' ? '—' : w, { nf: nf, al: 'right', fc: ANA.GREY });
    g.set(r, R + 5, means[c.key] || '', { fc: ANA.GREY });
    g.set(r, R + 6, c2 === '' ? '—' : c2, { nf: '0%', al: 'center', bg: bg(c2) });
    r++;
  });
  (m.diag || []).forEach(d => {
    g.set(r, R, d[0] + d[1].filter(Boolean).join(' '), { fc: '#374151' });
    g.merge(r, R, 1, 12);
    r++;
  });
  if (part.early) r = anaEmpty_(g, r, 'لسه بدري نحكم: الزيارات أقل من ' + SHOPTAB.MIN_SESSIONS + ' أو أوردرات إمبارح لنفس الساعة أقل من ' + SHOPTAB.MIN_ORDERS);
  return r;
}

function anaDrawProducts_(g, r, part) {
  const R = ANA.R;
  r = anaHead_(g, r, 'المنتجات — الأكتر بيعًا آخر 7 أيام كاملة قدام الـ 7 اللي قبلها (قطع من أوردرات مااتلغتش ولا رجعت)',
    ['المنتج', 'قطع آخر 7 أيام', 'قطع الـ 7 قبلها', 'التغيير', 'Shopify ROAS', 'ملاحظة', 'الصرف 7 أيام', 'الستوك', 'يكفي كام يوم', 'إعلانات شغالة']);
  const rows = part && part.rows || [];
  if (!rows.length) return anaEmpty_(g, r, 'مفيش مبيعات');
  rows.forEach(x => {
    const note = x.days === 0 ? 'الستوك خلص' : x.days !== null && x.days < 10 ? 'الستوك قرّب يخلص' : x.ch !== null && x.ch >= 0.3 && x.a >= 15 ? 'بيبيع أكتر: ركّز عليه' :
      x.ch !== null && x.ch <= -0.3 && x.b >= 20 ? 'بيبيع أقل' : !x.ads && x.a >= 10 ? 'بيتباع من غير إعلانات' : '';
    g.set(r, R, x.name, { b: 'bold' });
    g.set(r, R + 1, x.a, { nf: ANA.COUNT, al: 'center', b: 'bold' });
    g.set(r, R + 2, x.b, { nf: ANA.COUNT, al: 'center', fc: ANA.GREY });
    g.set(r, R + 3, x.ch === null ? '—' : x.ch, { nf: '0%', al: 'center', bg: x.ch === null ? null : x.ch >= 0.2 ? ANA.GREEN : x.ch <= -0.2 ? ANA.RED : null });
    g.set(r, R + 4, x.roas === null ? '—' : anaNum_(x.roas, 2), { nf: ANA.RATIO, al: 'center' });
    g.set(r, R + 5, note, { fc: ANA.GREY });
    g.set(r, R + 6, anaNum_(x.spend, 0), { nf: ANA.MONEY, al: 'right' });
    g.set(r, R + 7, x.stock === undefined ? '—' : x.stock, { nf: ANA.COUNT, al: 'center' });
    g.set(r, R + 8, x.days === null ? '—' : x.days === 0 ? 'نفد' : Math.floor(x.days), { nf: ANA.COUNT, al: 'center', bg: x.days !== null && x.days <= COVER.RED ? ANA.RED : null });
    g.set(r, R + 9, x.ads, { nf: ANA.COUNT, al: 'center' });
    r++;
  });
  return r;
}

function anaDrawGov_(g, r, part) {
  const R = ANA.R;
  r = anaHead_(g, r, 'المحافظات — آخر 30 يوم: فين التوصيل أحسن والإلغاء أقل (فرصة لكامبينات مستهدفة)' +
    (part && part.cAvg !== null && part.dAvg !== null ? ' | المتوسط: إلغاء ' + Math.round(part.cAvg * 100) + '% وتوصيل ' + Math.round(part.dAvg * 100) + '%' : ''),
    ['المحافظة', 'أوردرات 30 يوم', '% من الأوردرات', 'الإلغاء', 'التوصيل', 'الحكم', 'المرتجع']);
  const rows = (part && part.rows || []).slice(0, 15);
  if (!rows.length) return anaEmpty_(g, r, 'مفيش محافظات معروفة للأوردرات');
  rows.forEach(x => {
    g.set(r, R, x.name, { b: 'bold' });
    g.set(r, R + 1, x.x.orders, { nf: ANA.COUNT, al: 'center' });
    g.set(r, R + 2, x.share === null ? '—' : x.share, { nf: ANA.PCT, al: 'center' });
    g.set(r, R + 3, x.c === null ? '—' : x.c, { nf: ANA.PCT, al: 'center' });
    g.set(r, R + 4, x.del === null ? '—' : x.del, { nf: ANA.PCT, al: 'center' });
    g.set(r, R + 5, x.verdict || (x.x.orders < 30 ? 'أوردرات قليلة' : 'زي المتوسط'), { al: 'center', bg: /🟢/.test(x.verdict) ? ANA.GREEN : /🔴/.test(x.verdict) ? ANA.RED : null });
    g.set(r, R + 6, x.x.finished > 0 ? x.x.returned / x.x.finished : '—', { nf: ANA.PCT, al: 'center' });
    r++;
  });
  return r;
}

function anaDrawCatalog_(g, r, part) {
  const R = ANA.R;
  r = anaHead_(g, r, 'الكتالوج — آخر 14 يوم: المنتجات اللي إعلانات الكتالوج بتبيعها (الأوردرات على المنتج الأساسي في الأوردر، والصرف من تقسيمة Meta)',
    ['المنتج', 'أوردرات من الكتالوج', '% من أوردرات الكتالوج', 'صرف الكتالوج عليه', 'Shopify ROAS', 'ملاحظة']);
  const rows = part && part.rows || [];
  if (!rows.length) return anaEmpty_(g, r, 'مفيش إعلانات كتالوج في آخر 14 يوم');
  rows.forEach(x => {
    g.set(r, R, x.name, { b: 'bold' });
    g.set(r, R + 1, x.orders, { nf: ANA.COUNT, al: 'center', b: 'bold' });
    g.set(r, R + 2, x.share === null ? '—' : x.share, { nf: ANA.PCT, al: 'center' });
    g.set(r, R + 3, anaNum_(x.spend, 0), { nf: ANA.MONEY, al: 'right' });
    g.set(r, R + 4, x.roas === null ? '—' : anaNum_(x.roas, 2), { nf: ANA.RATIO, al: 'center' });
    g.set(r, R + 5, x.orders >= 3 && x.spend > 0 && x.revenue / x.spend >= 2 ? 'بيبيع كويس من الكتالوج' : x.spend >= 500 && !x.orders ? 'صرف من غير أوردرات' : '', { fc: ANA.GREY });
    r++;
  });
  const a = part.all;
  g.set(r, R, 'TOTAL الكتالوج', { b: 'bold', bg: ANA.BLUE });
  g.set(r, R + 1, a.orders, { nf: ANA.COUNT, al: 'center', b: 'bold', bg: ANA.BLUE });
  g.fill(r, R + 2, 1, { bg: ANA.BLUE });
  g.set(r, R + 3, anaNum_(a.spend, 0), { nf: ANA.MONEY, al: 'right', bg: ANA.BLUE });
  g.set(r, R + 4, a.spend > 0 ? anaNum_(a.revenue / a.spend, 2) : '—', { nf: ANA.RATIO, al: 'center', bg: ANA.BLUE });
  g.fill(r, R + 5, 1, { bg: ANA.BLUE });
  return r + 1;
}

/* Menu: draws the tab now (the Meta Campaigns decisions first, from its last read). */
function refreshAnalysisNow() {
  try {
    resetCaches_();
    withLock_(() => {
      try { writeMetaCamps_(); } catch (e) { console.error('meta camps: ' + errText_(e)); }
      writeAnalysisTab_();
    });
    alert_('اتحدث تاب ' + ANA.TAB + ' ✅');
    ss_().setActiveSheet(tab_(ANA.TAB));
  } catch (e) { alert_('تاب ' + ANA.TAB + ' ماتحدثش:\n' + errText_(e)); }
}
