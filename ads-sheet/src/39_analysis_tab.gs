/*
 * Drawing the "Actions" and "Analysis" tabs (the parts are in 38_analysis.gs).
 * Actions: only what needs doing: 🔴 urgent and 🟠 important (findings of one kind merged into one action), the best
 * ANA.ACT_GOOD opportunities and your open tasks, with ✅ to mark one done; your tasks (G–K) and before / after (L–R), typed
 * by hand in the yellow rows: read before every drawing and drawn again in place, so what you type stays. ✅ moves an action
 * to before / after (today's date, the metric and what it's on) and hides it for ANA.DONE_DAYS days.
 * Analysis: small tables at the top to read at a glance (today, the accounts, the important problems, cancellation,
 * today's 3-hour windows, what goes well), then every part's table under a + on its title, closed unless you opened it
 * (the stock: a + on each product for its colors). 🟡 findings (watch only, no action) are there, not in Actions.
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
  // The tab of version 1.68 becomes Actions (what's typed in it stays); its numbers move to Analysis.
  if (!ss_().getSheetByName(ANA.TAB) && ss_().getSheetByName(ANA.OLD_TAB)) ss_().getSheetByName(ANA.OLD_TAB).setName(ANA.TAB);
  const sh = ensureTab_(ANA.TAB), today = todayKey_();
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
  finds = anaMerge_(finds.filter(f => !seen[f.id] && (seen[f.id] = true))).filter(f => !(done[f.id] && done[f.id] > since));
  const M = { bad: finds.filter(f => f.kind === 'bad' && f.pri <= 2), good: finds.filter(f => f.kind === 'good'), watch: finds.filter(f => f.pri === 3) };
  if (errors.length) console.error('Analysis: ' + errors.join(' | '));
  anaDrawActions_(sh, today, manual, F, M, errors);
  anaDrawAnalysis_(ensureTab_(ANA.TAB2), F, P, M, ctx, errors);
  return true;
}

/* Tab Actions: the urgent and important actions, the best opportunities and your open tasks; your tasks; before / after. */
function anaDrawActions_(sh, today, manual, F, M, errors) {
  const props = PropertiesService.getDocumentProperties(), order = (a, b) => (a.pri - b.pri) || (b.impact - a.impact);
  const tasks = manual.tasks.slice().sort((a, b) => ((a.status === ANA.STATUS[2]) - (b.status === ANA.STATUS[2])) || (a.pri - b.pri));
  const N = Math.max(ANA.MIN_ROWS, tasks.length + ANA.SPARE, manual.ba.length + ANA.SPARE), first = ANA.TOP + 2;
  const actions = M.bad.concat(M.good.slice(0, ANA.ACT_GOOD), tasks.map((t, i) => ({ id: 'task|' + sha_(t.text).slice(0, 12), kind: 'task', pri: t.pri,
    area: 'مهمة يدوية', title: t.note || 'مكتوبة بإيدك يوم ' + t.added, action: t.text, impact: 0, metric: ANA.METRICS[0], scope: ANA.BIZ, trow: first + i,
    status: t.status })).filter(t => t.status !== ANA.STATUS[2])).sort(order);
  const g = todayGrid_(), W = ANA.WIDTH, R = ANA.R, BA = ANA.BA, dark = { bg: ANA.DARK, fc: '#ffffff', b: 'bold' };
  g.width = W;
  g.set(1, 1, 'ACTIONS — تعمل إيه النهارده بالترتيب' + (anaBe_(F) ? '' : ' | مفيش رؤاس تعادل: اكتب be.roas في Settings'), dark);
  g.fill(1, 2, W - 1, { bg: ANA.DARK });
  g.merge(1, 1, 1, W);
  g.set(2, 1, 'هنا المهم بس: 🔴 عاجل (بيخسرك دلوقتي) و 🟠 مهم، وأحسن ' + ANA.ACT_GOOD + ' فرص 🟢، ومهامك. الحاجات اللي من نوع واحد (كامبينات توقفها، منتجات تطلب لها ستوك ...) في أكشن واحد. ' +
    'علّم ✅ لما تعمله: بيتنقل لـ "قبل وبعد" ويستخبى ' + ANA.DONE_DAYS + ' أيام. اللي محتاج تراقبه بس (🟡) والأرقام كلها في تاب ' + ANA.TAB2 + '.' +
    (errors.length ? '   ⚠️ أجزاء ماتحسبتش: ' + errors.join(' | ') : ''), { fc: '#374151' });
  g.merge(2, 1, 1, W);
  g.set(3, 1, 'آخر تحديث ' + nowText_(), { fc: ANA.GREY });
  g.merge(3, 1, 1, 3);
  let r = todayHead_(g, ANA.TOP, 1, 5, 'الأكشنز (' + actions.length + ')', ['الأولوية', 'الأكشن', 'ليه (بالأرقام)', 'القسم', '✅ اتعملت']);
  const findRows = [];
  if (!actions.length) { g.set(r, 1, 'مفيش حاجة عاجلة دلوقتي ✅', { fc: ANA.GREY }); g.merge(r, 1, 1, 5); r++; }
  actions.forEach(f => {
    g.set(r, 1, ANA.PRI[f.pri], { bg: ANA.PRI_BG[f.pri], b: 'bold', al: 'center' });
    g.set(r, 2, f.kind === 'task' ? f.action : anaDo_(f), { b: 'bold' });
    g.set(r, 3, f.kind === 'task' ? f.title : anaWhy_(f), {});
    g.set(r, 4, f.area, { al: 'center', fc: ANA.GREY });
    g.set(r, 5, false, { al: 'center' });
    findRows.push({ row: r, id: f.id, action: f.action + (f.item ? '\n' + f.item : ''), metric: f.metric, scope: f.scope, trow: f.trow || 0 });
    r++;
  });
  if (M.watch.length) { g.set(r, 1, '🟡 ' + M.watch.length + ' حاجة تتراقب بس (من غير أكشن دلوقتي): في تاب ' + ANA.TAB2, { fc: ANA.GREY }); g.merge(r, 1, 1, 5); }

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
  g.live = [[3, 1]];
  anaRtl_(g);
  const oldN = Number(props.getProperty(ANA.ROWS_KEY) || 0);
  let oldFinds = [];
  try { oldFinds = JSON.parse(propGetBig_(ANA.FIND_KEY) || '[]'); } catch (e) { oldFinds = []; }
  const drew = writeGrid_(sh, g);
  props.setProperty(ANA.ROWS_KEY, String(N));
  propSetBig_(ANA.FIND_KEY, JSON.stringify(findRows));
  if (!drew) return;
  // The ✅ boxes and the lists to choose from, where the rows are now.
  const lastOld = Math.max(oldFinds.length ? oldFinds[oldFinds.length - 1].row : 0, sh.getLastRow());
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
  anaLook_(sh, g, W);
}

/*
 * A view of the grid for the Analysis tab's detail tables: they're written in columns ANA.R + 0 … 11 (as on one wide
 * table), shown in the 12 columns that aren't gaps (ANA.LC). Row kinds for the + / − go in g.kinds.
 */
function anaMapGrid_(g) {
  const map = c => ANA.LC[c - ANA.R] || c;
  return { raw: g, kinds: g.kinds, cell: (r, c) => g.cell(r, map(c)), set: (r, c, v, s) => g.set(r, map(c), v, s),
    fill: (r, c, n, s) => { for (let i = 0; i < n; i++) g.set(r, map(c + i), g.cell(r, map(c + i)).v, s); },
    merge: (r, c, rows, cols) => g.merge(r, map(c), rows, map(c + cols - 1) - map(c) + 1) };
}

/* Tab Analysis: small tables to read at a glance, then every part's table under a + (closed unless you opened it). */
function anaDrawAnalysis_(sh, F, P, M, ctx, errors) {
  const g = todayGrid_(), W = ANA.W2.length, dark = { bg: ANA.DARK, fc: '#ffffff', b: 'bold' }, be = ctx.be, props = PropertiesService.getDocumentProperties();
  g.width = W; g.kinds = {};
  g.set(1, 1, 'ANALYSIS — الدنيا ماشية إزاي' + (be ? ' | رؤاس التعادل ' + anaNum_(be, 2) : ' | مفيش رؤاس تعادل: اكتب be.roas في Settings'), dark);
  g.fill(1, 2, W - 1, { bg: ANA.DARK });
  g.merge(1, 1, 1, W);
  g.set(2, 1, 'فوق: الجداول الصغيرة اللي تفهم منها الدنيا في بصة. تحت: كل جزء بالتفاصيل، اضغط + جنب عنوانه تفتحه. الأكشنز في تاب ' + ANA.TAB + '.' +
    (errors.length ? '   ⚠️ أجزاء ماتحسبتش: ' + errors.join(' | ') : ''), { fc: '#374151' });
  g.merge(2, 1, 1, W);
  g.set(3, 1, 'آخر تحديث ' + nowText_(), { fc: ANA.GREY });
  const box = (r, c, title, headers) => todayHead_(g, r, c, headers.length, title, headers);
  const pc = v => (v === null || v === undefined || v === '' ? '—' : v);
  const chBg = (v, up) => (typeof v !== 'number' || Math.abs(v) < 0.05 ? null : (v > 0) === up ? ANA.GREEN : ANA.RED);
  // 1) Today at a glance (Shopify's cards until now, against yesterday until the same hour).
  let a = box(4, 1, 'النهارده بسرعة', ['', 'النهارده', 'إمبارح', 'التغيير', 'الأسبوع اللي فات']);
  const m = P.shop && P.shop.m;
  if (m) {
    g.set(4, 1, 'النهارده بسرعة (لحد ' + m.at + '، قدام نفس الساعة)', dark);
    m.cards.forEach(c => {
      const nf = c.pct ? '0.00%' : ANA.MONEY, x = c.values, ch = typeof x[0] === 'number' && typeof x[1] === 'number' && x[1] > 0 ? x[0] / x[1] - 1 : '';
      g.set(a, 1, c.title, { b: 'bold' });
      g.set(a, 2, pc(x[0]), { nf: nf, al: 'right', b: 'bold' });
      g.set(a, 3, pc(x[1]), { nf: nf, al: 'right', fc: ANA.GREY });
      g.set(a, 4, pc(ch), { nf: '0%', al: 'center', bg: c.up === null ? null : chBg(ch, c.up) });
      g.set(a, 5, pc(x[2]), { nf: nf, al: 'right', fc: ANA.GREY });
      a++;
    });
  } else {
    const t = anaSum_(F.biz, F.today, F.today), y = anaSum_(F.biz, shiftKey_(F.today, -1), shiftKey_(F.today, -1));
    g.set(4, 1, 'النهارده بسرعة (قدام إمبارح كله)', dark);
    [['الصرف', 'spend', ANA.MONEY], ['الأوردرات', 'orders', ANA.COUNT], ['المبيعات', 'revenue', ANA.MONEY]].forEach(k => {
      g.set(a, 1, k[0], { b: 'bold' }); g.set(a, 2, t[k[1]], { nf: k[2], al: 'right', b: 'bold' }); g.set(a, 3, y[k[1]], { nf: k[2], al: 'right', fc: ANA.GREY }); a++;
    });
  }
  // 2) The accounts: Shopify ROAS today, the last 3 days and the 7 before.
  let b = box(4, 7, 'الحسابات — Shopify ROAS', ['الحساب', 'النهارده', 'آخر 3 أيام', 'آخر 7 أيام', 'الشهر كله']);
  const y = shiftKey_(F.today, -1), d3 = shiftKey_(F.today, -3), d7 = shiftKey_(F.today, -7);
  const ids = (P.acc && P.acc.meta || []).concat(P.acc && P.acc.tt || []);
  const accLine = (label, fn, style) => {
    g.set(b, 7, label, Object.assign({ b: 'bold' }, style || {}));
    [[F.today, F.today], [d3, y], [d7, y], [F.month0, F.today]].forEach((p, i) => anaRoasCell_(g, b, 8 + i, anaRoas_(fn(p[0], p[1])), be, anaRoas_(fn(F.month0, F.today))));
    b++;
  };
  // The whole business: every store order ÷ Meta + TikTok spend, the same ROAS as Closing, Actual ROAS and the funnel.
  accLine('البيزنس كله (زي Closing)', (from, to) => anaSum_(F.biz, from, to), { bg: ANA.BLUE });
  ids.slice(0, 8).forEach(id => accLine((F.accPlat[id] === 'TIKTOK' ? 'TikTok ' : '') + F.accName[id], (from, to) => anaSum_(F.acc[id], from, to)));
  // 3) The important problems.
  let c = box(4, 13, 'المشاكل المهمة (' + M.bad.length + ')', ['الأولوية', 'المشكلة', 'القسم']);
  if (!M.bad.length) { g.set(c, 13, 'مفيش مشاكل مهمة دلوقتي ✅', { fc: ANA.GREY }); g.merge(c, 13, 1, 3); c++; }
  M.bad.slice(0, ANA.TOP_LIST).forEach(f => {
    g.set(c, 13, ANA.PRI[f.pri], { bg: ANA.PRI_BG[f.pri], b: 'bold', al: 'center' });
    g.set(c, 14, anaHeadline_(f), { b: 'bold' });
    g.set(c, 15, f.area, { al: 'center', fc: ANA.GREY });
    c++;
  });
  if (M.bad.length > ANA.TOP_LIST) { g.set(c, 14, 'و ' + (M.bad.length - ANA.TOP_LIST) + ' كمان في تاب ' + ANA.TAB, { fc: ANA.GREY }); c++; }
  let r = Math.max(a, b, c) + 1;
  // 4) Cancellation, returns and ROAS: the last 7 full days against the 7 before, this month against last month.
  a = box(r, 1, 'الإلغاء والمرتجع والرؤاس', ['', 'الفترة دي', 'قبلها', 'التغيير', '']);
  const cp = P.cancel && P.cancel.rows ? P.cancel.rows : [], biz = cp[0], mon = cp[1];
  const t7 = anaSum_(F.biz, shiftKey_(F.today, -7), y), p7 = anaSum_(F.biz, shiftKey_(F.today, -14), shiftKey_(F.today, -8));
  const lineR = (label, v, w, up, nf) => {
    const ch = typeof v === 'number' && typeof w === 'number' ? (nf === ANA.PCT ? v - w : w > 0 ? v / w - 1 : '') : '';
    g.set(a, 1, label, { b: 'bold' });
    g.set(a, 2, pc(v), { nf: nf, al: 'center', b: 'bold' });
    g.set(a, 3, pc(w), { nf: nf, al: 'center', fc: ANA.GREY });
    g.set(a, 4, ch === '' ? '—' : nf === ANA.PCT ? (ch > 0 ? '+' : '') + Math.round(ch * 1000) / 10 + ' نقطة' : ch, { nf: '0%', al: 'center',
      bg: typeof ch === 'number' && Math.abs(ch) >= (nf === ANA.PCT ? 0.03 : 0.05) ? ((ch > 0) === up ? ANA.GREEN : ANA.RED) : null });
    a++;
  };
  lineR('Shopify ROAS (7 أيام)', anaRoas_(t7), anaRoas_(p7), true, ANA.RATIO);
  if (biz) { lineR('الإلغاء (7 أيام)', biz.ca, biz.cb, false, ANA.PCT); lineR('المرتجع (7 أيام)', biz.ra, biz.rb, false, ANA.PCT); }
  if (mon) { lineR('الإلغاء (الشهر قدام اللي فات)', mon.ca, mon.cb, false, ANA.PCT); lineR('المرتجع (الشهر قدام اللي فات)', mon.ra, mon.rb, false, ANA.PCT); }
  // 5) Today's 3-hour windows.
  b = box(r, 7, 'الـ 3 ساعات النهارده (Meta + DIRECT)', ['الوقت', 'الصرف', 'ROAS', 'المعتاد']);
  const wins = (P.win && P.win.rows || []).filter(x => !x.n);
  if (!wins.length) { g.set(b, 7, 'لسه مفيش لقطات النهارده', { fc: ANA.GREY }); g.merge(b, 7, 1, 4); b++; }
  wins.forEach(x => {
    g.set(b, 7, anaHour_(x.w.from) + ' → ' + anaHour_(x.w.to), { b: 'bold' });
    g.set(b, 8, anaNum_(x.w.META.spend, 0), { nf: ANA.MONEY, al: 'right' });
    g.set(b, 9, x.r === null ? '—' : anaNum_(x.r, 2), { nf: ANA.RATIO, al: 'center', b: 'bold', bg: x.weak ? ANA.RED : x.r !== null && x.ur && x.r >= x.ur ? ANA.GREEN : null });
    g.set(b, 10, x.ur === null ? '—' : anaNum_(x.ur, 2), { nf: ANA.RATIO, al: 'center', fc: ANA.GREY });
    b++;
  });
  // 6) What goes well.
  c = box(r, 13, 'فرص التكبير (' + M.good.length + ')', ['', 'الفرصة', 'القسم']);
  if (!M.good.length) { g.set(c, 13, 'مفيش حاجة طالعة بوضوح دلوقتي', { fc: ANA.GREY }); g.merge(c, 13, 1, 3); c++; }
  M.good.slice(0, ANA.TOP_LIST).forEach(f => {
    g.set(c, 13, '🟢', { bg: ANA.PRI_BG[4], al: 'center' });
    g.set(c, 14, anaHeadline_(f), { b: 'bold' });
    g.set(c, 15, f.area, { al: 'center', fc: ANA.GREY });
    c++;
  });
  r = Math.max(a, b, c) + 1;

  // The detail tables, each under a + on its title.
  const first = r, dg = anaMapGrid_(g);
  const sec = (key, fn) => {
    const t = r;
    r = fn(r);
    g.kinds[t] = ['', 0, false]; // the title is two rows: its + is on the second one
    g.kinds[t + 1] = ['sec|' + key, 0, true];
    for (let i = t + 2; i < r; i++) if (!g.kinds[i]) g.kinds[i] = ['', 1, false];
    r++;
  };
  sec('watch', q => anaDrawWatch_(dg, q, M.watch));
  sec('roas', q => anaDrawRoas_(dg, q, F, P.acc, ctx));
  sec('win', q => anaDrawWindows_(dg, q, F, P.win));
  sec('bench', q => anaDrawBench_(dg, q, P.bench));
  sec('funnel', q => anaDrawFunnel_(dg, q, P.funnel));
  sec('stock', q => anaDrawStock_(dg, q, P.stock));
  sec('cancel', q => anaDrawCancel_(dg, q, P.cancel));
  sec('dup', q => anaDrawDup_(dg, q, P.dup));
  sec('shop', q => anaDrawShop_(dg, q, P.shop));
  sec('prod', q => anaDrawProducts_(dg, q, P.prod));
  sec('gov', q => anaDrawGov_(dg, q, P.gov));
  sec('cat', q => anaDrawCatalog_(dg, q, P.cat));
  g.live = [[3, 1]];
  anaRtl_(g);
  const rowsIds = [];
  for (let i = first; i < r; i++) rowsIds.push(g.kinds[i] || ['', 0, false]);
  anaGroupsDraw_(sh, g, first, rowsIds);
}

/*
 * Draws the tab with its + / − from row `first` (ids: [key, depth, has kids] per row), like the Duplication tab: when the
 * rows changed or the groups on the sheet aren't what was drawn, every row from `first` down is deleted and the groups are
 * made again, closed, and the ones that were open opened again.
 */
function anaGroupsDraw_(sh, g, first, ids) {
  const props = PropertiesService.getDocumentProperties(), key = ANA.GROUPS, W = g.width;
  const sig = sha_(JSON.stringify([first, ids.map(x => x[0] + '/' + x[1])]));
  let old = null;
  try { old = JSON.parse(props.getProperty(key) || 'null'); } catch (e) { old = null; }
  const ok = mcGroupsOk_(sh, first - 1, first, ids), same = old && old.sig === sig && sh.getLastRow() > 0 && ok, open = new Set();
  if (!same) {
    if (old && sh.getLastRow() >= old.first && (ok || mcGroupsOk_(sh, old.first - 1, old.first, old.ids))) {
      old.ids.forEach((x, i) => {
        if (!x[2] || !x[0]) return;
        try { const grp = sh.getRowGroup(old.first + i + 1, x[1] + 1); if (grp && !grp.isCollapsed()) open.add(x[0]); } catch (e) { /* مفيش جروب */ }
      });
    }
    mcUngroupAbove_(sh, first);
    if (sh.getMaxRows() >= first) sh.deleteRows(first, sh.getMaxRows() - first + 1);
    sh.insertRowsAfter(first - 1, ids.length + 20);
    props.deleteProperty(key);
    props.deleteProperty('GH_' + sh.getName());
  }
  const drew = writeGrid_(sh, g);
  if (!drew && same) return;
  if (!same) {
    try { sh.setRowGroupControlPosition(SpreadsheetApp.GroupControlTogglePosition.BEFORE); } catch (e) { /* قديم */ }
    ids.forEach((x, i) => {
      if (!x[2]) return;
      let k = i + 1;
      while (k < ids.length && ids[k][1] > x[1]) k++;
      if (k > i + 1) sh.getRange(first + i + 1, 1, k - i - 1, 1).shiftRowGroupDepth(1);
    });
    if (ids.some(x => x[1] > 0)) {
      sh.collapseAllRowGroups();
      ids.forEach((x, i) => { if (open.has(x[0]) && x[2]) { try { sh.getRowGroup(first + i + 1, x[1] + 1).expand(); } catch (e) { /* اتغير */ } } });
    }
    props.setProperty(key, JSON.stringify({ sig: sig, first: first, ids: ids }));
  }
  ANA.W2.forEach((w, i) => sh.setColumnWidth(i + 1, w));
  anaLook_(sh, g, W);
}
/* Text that was left-aligned starts from the right in these right-to-left tabs. */
function anaRtl_(g) { g.rows.forEach(line => line.forEach(x => { if (x && x.al === 'left') x.al = 'right'; })); }
/* Bigger text, wrapped, and the parts' titles big (two rows each) with their line under them. */
function anaLook_(sh, g, W) {
  const n = Math.max(g.rows.length, 1);
  // Right to left: column A on the right, and every line read from the right, so Arabic isn't mixed up with the English names.
  try { sh.setRightToLeft(true); } catch (e) { /* قديم */ }
  try { sh.getRange(1, 1, n, W).setTextDirection(SpreadsheetApp.TextDirection.RIGHT_TO_LEFT); } catch (e) { /* مش متاحة */ }
  sh.getRange(1, 1, n, W).setFontSize(11).setWrap(true).setVerticalAlignment('top');
  sh.getRange(1, 1, 1, W).setFontSize(15).setVerticalAlignment('middle');
  sh.setRowHeight(1, 34);
  (g.big || []).forEach(r => { sh.getRange(r, 1, 2, W).setFontSize(15).setVerticalAlignment('middle'); sh.setRowHeight(r, 24); sh.setRowHeight(r + 1, 24); });
  (g.notes || []).forEach(r => sh.setRowHeight(r, 24));
}

/* The things to keep an eye on (🟡): no action for now. */
function anaDrawWatch_(g, r, list) {
  const R = ANA.R;
  r = anaHead_(g, r, '🟡 تتراقب بس (' + list.length + ')', ['القسم', '', '', '', '', 'لو كبرت تعمل إيه', '', '', '', '', '', 'المتابعة'],
    'حاجات مش محتاجة أكشن دلوقتي، ولو كبرت هتطلع في تاب ' + ANA.TAB + '.');
  if (!list.length) return anaEmpty_(g, r, 'مفيش');
  list.forEach(f => {
    g.set(r, R, f.area, { b: 'bold', fc: ANA.GREY });
    g.set(r, R + 5, anaDo_(f), {});
    g.set(r, R + 11, anaWhy_(f), {});
    r++;
  });
  return r;
}

/*
 * A part's title: big, two rows tall, across the whole tab (its + is next to it); then a line saying what's in it, and the
 * header row. headers null: none (the part draws its own). Returns the first data row.
 */
function anaHead_(g, r, title, headers, note) {
  const raw = g.raw || g, W = ANA.W2.length;
  raw.set(r, 1, title, { bg: ANA.DARK, fc: '#ffffff', b: 'bold', al: 'center' });
  for (let c = 1; c <= W; c++) [r, r + 1].forEach(x => { if (x !== r || c > 1) raw.set(x, c, '', { bg: ANA.DARK }); });
  raw.merge(r, 1, 2, W);
  (raw.big = raw.big || []).push(r);
  r += 2;
  if (note) {
    raw.set(r, 1, note, { fc: '#4b5563', bg: '#f9fafb' });
    for (let c = 2; c <= W; c++) raw.set(r, c, '', { bg: '#f9fafb' });
    raw.merge(r, 1, 1, W);
    (raw.notes = raw.notes || []).push(r);
    r++;
  }
  (headers || []).forEach((h, i) => g.set(r, ANA.R + i, h, { bg: TODAY.YELLOW, b: 'bold', al: 'center' }));
  return headers && headers.length ? r + 1 : r;
}
/* A table inside a part (a dark bar and its header row). */
function anaSub_(g, r, title, headers) {
  g.set(r, ANA.R, title, { bg: ANA.DARK, fc: '#ffffff', b: 'bold' });
  g.fill(r, ANA.R + 1, 11, { bg: ANA.DARK });
  g.merge(r, ANA.R, 1, 12);
  headers.forEach((h, i) => g.set(r + 1, ANA.R + i, h, { bg: TODAY.YELLOW, b: 'bold', al: 'center' }));
  return r + 2;
}
/* Lines as bullet points, one under the other. */
function anaList_(items) { return items.filter(Boolean).map(x => '• ' + x).join('\n'); }
function anaEmpty_(g, r, text) { g.set(r, ANA.R, text, { fc: ANA.GREY }); g.merge(r, ANA.R, 1, 6); return r + 1; }
function anaRoasCell_(g, r, c, v, be, ref) {
  if (v === null || v === undefined || v === '') { g.set(r, c, '—', { al: 'center', fc: ANA.GREY }); return; }
  const t = be || ref, bg = !t ? null : v >= t * (be ? 1.2 : 1) ? ANA.GREEN : v >= t * (be ? 1 : 0.8) ? ANA.AMBER : ANA.RED;
  g.set(r, c, anaNum_(v, 2), { nf: ANA.RATIO, al: 'center', bg: bg });
}

function anaDrawRoas_(g, r, F, part, ctx) {
  const meta = (part && part.meta || []).slice(0, 4), tt = (part && part.tt || []).slice(0, 5), be = ctx.be, R = ANA.R;
  r = anaHead_(g, r, '📈 الرؤاس لكل حساب يوم بيوم', null, 'Shopify ROAS من أول الشهر. أخضر = فوق التعادل بـ 20% أو أكتر، أصفر = حواليه، أحمر = تحته.');
  g.set(r, R, 'META', { bg: ANA.DARK, fc: '#ffffff', b: 'bold' });
  g.fill(r, R + 1, 5, { bg: ANA.DARK });
  g.merge(r, R, 1, 6);
  g.set(r, R + 6, 'TIKTOK', { bg: '#111111', fc: '#ffffff', b: 'bold' });
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
  r = anaHead_(g, r, '⏱ كل 3 ساعات (النهارده وإمبارح)', ['الوقت', 'صرف Meta', 'أوردرات (Meta + DIRECT)', 'Shopify ROAS', 'المعتاد (7 أيام)', 'أكتر كامبينات صرفت في الوقت ده', 'صرف TikTok', 'أوردرات TikTok', 'ROAS TikTok'],
    'كل 3 ساعات لوحدها (مش من أول اليوم)، قدام نفس الوقت في الـ 7 أيام اللي قبل إمبارح، والكامبينات اللي صرفت أكتر فيها.');
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
  r = anaHead_(g, r, '📊 البنشمارك النهارده', ['الحساب', 'الصرف النهارده', 'ROAS النهارده', 'ROAS البنشمارك', 'متريكس أوحش', 'اللي أوحش (النهارده بدل البنشمارك)'],
    'المتريكس اللي أوحش من التلات شهور اللي فاتوا بـ ' + Math.round(ANA.WORSE * 100) + '% أو أكتر، لكل حساب. TikTok قدام آخر 7 أيام.');
  const rows = part && part.rows || [];
  if (!rows.length) return anaEmpty_(g, r, 'لسه مفيش أرقام النهارده من Meta');
  rows.forEach(x => {
    g.set(r, R, (x.plat === 'TIKTOK' ? 'TikTok ' : '') + x.name, { b: 'bold' });
    g.set(r, R + 1, anaNum_(x.spend, 0), { nf: ANA.MONEY, al: 'right' });
    g.set(r, R + 2, x.roas === '' || x.roas === null ? '—' : anaNum_(x.roas, 2), { nf: ANA.RATIO, al: 'center' });
    g.set(r, R + 3, x.base === '' || x.base === null ? '—' : anaNum_(x.base, 2), { nf: ANA.RATIO, al: 'center', fc: ANA.GREY });
    g.set(r, R + 4, x.msg ? '—' : x.worse.length, { al: 'center', b: 'bold', bg: x.msg ? null : x.worse.length >= 3 ? ANA.RED : x.worse.length ? ANA.AMBER : ANA.GREEN });
    g.set(r, R + 5, x.text, {});
    r++;
  });
  return r;
}

function anaDrawFunnel_(g, r, part) {
  const R = ANA.R;
  r = anaHead_(g, r, '🔻 الفانل: آخر 3 أيام', ['الحساب', 'صرف 3 أيام', 'CVR 3 أيام', 'CVR قبلها', 'خطوات وقعت', 'اللي وقع / اللي اتحسن'],
    'الخطوات اللي وقعت أو اتحسنت ' + Math.round(ANA.DROP * 100) + '% أو أكتر في آخر 3 أيام كاملة قدام الـ 14 يوم اللي قبلها' + (part && part.day ? ' (قراية Meta: ' + part.day + ').' : '.'));
  if (!part || part.none) return anaEmpty_(g, r, 'أرقام الفانل بتيجي مع تحديث Daily Account Funnel (كل 3 ساعات أو من المنيو 📈)');
  if (!part.rows.length) return anaEmpty_(g, r, 'مفيش حساب صرف ' + ANA.MIN_SPEND + ' أو أكتر في آخر 3 أيام');
  const show = x => x.name + ' ' + (/%/.test(x.nf) ? (Math.round(x.v * 1000) / 10) + '%' : anaNum_(x.v, 2)) + ' (' + anaPct_(x.v / x.b - 1) + ')';
  part.rows.forEach(x => {
    g.set(r, R, x.name, { b: 'bold' });
    g.set(r, R + 1, anaNum_(x.spend, 0), { nf: ANA.MONEY, al: 'right' });
    g.set(r, R + 2, x.cvr === '' ? '—' : x.cvr, { nf: '0.00%', al: 'center' });
    g.set(r, R + 3, x.cvrB === '' ? '—' : x.cvrB, { nf: '0.00%', al: 'center', fc: ANA.GREY });
    g.set(r, R + 4, x.worse.length, { al: 'center', b: 'bold', bg: x.worse.length ? ANA.RED : ANA.GREEN });
    g.set(r, R + 5, [x.worse.length ? '🔻 وقع:\n' + anaList_(x.worse.map(show)) : '', x.better.length ? '🔺 اتحسن:\n' + anaList_(x.better.map(show)) : '']
      .filter(Boolean).join('\n') || '✅ مفيش تغيير كبير', {});
    r++;
  });
  return r;
}

function anaDrawStock_(g, r, part) {
  const R = ANA.R;
  r = anaHead_(g, r, '📦 الستوك (' + (part && part.rows ? part.rows.length : 0) + ' منتج)', ['المنتج ← اللون', 'الستوك', 'اتباع آخر 7 أيام', 'اتباع آخر 30 يوم', 'يكفي كام يوم', 'ملاحظة', 'اطلب كام (30 يوم)'],
    'المنتجات اللي عليها إعلانات أو بتتباع كتير وألوانها خلصت أو هتخلص في ' + COVER.RED + ' أيام. + جنب المنتج تفتح ألوانه.');
  if (!part || part.none) return anaEmpty_(g, r, 'محتاج الشيت مربوط بأبليكيشن شوبيفاي (ستوك الألوان وأوردراتها)');
  if (!part.rows.length) return anaEmpty_(g, r, 'مفيش ألوان بتتباع وقرّبت تخلص ✅');
  part.rows.forEach(p => {
    if (g.kinds) g.kinds[r] = ['stock|' + p.name, 1, true];
    g.set(r, R, p.name + ' (' + p.list.length + ' لون)', { b: 'bold', bg: ANA.LABEL });
    g.fill(r, R + 1, 6, { bg: ANA.LABEL });
    g.set(r, R + 3, p.m, { nf: ANA.COUNT, al: 'center', b: 'bold', bg: ANA.LABEL });
    g.set(r, R + 5, p.ads > 0 ? 'عليه ' + p.ads + ' إعلان شغال' : 'مفيش إعلانات شغالة', { bg: ANA.LABEL, fc: p.ads > 0 ? '#991b1b' : ANA.GREY });
    r++;
    p.list.forEach(v => {
      if (g.kinds) g.kinds[r] = ['', 2, false];
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
  r = anaHead_(g, r, '❌ الإلغاء والمرتجع', ['البند', 'أوردرات', 'اتحسموا', 'اتلغى', 'نسبة الإلغاء', 'الإلغاء قبلها', 'التغيير', 'المرتجع', 'المرتجع قبلها'],
    'آخر 7 أيام كاملة قدام الـ 7 اللي قبلها. الإلغاء = اتلغى ÷ اللي اتحسم (اتلغى أو اتشحن)، والمرتجع = رجع ÷ الشحنات اللي خلصت.');
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
  r = anaSub_(g, r + 1, 'ACTUAL ROAS — آخر 14 يوم يوم بيوم (الرؤاس الفعلي = المتسلم بس ÷ الصرف)',
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
  r = anaHead_(g, r, '🔁 الدوبليكيشن (' + (part && part.rows ? part.rows.length : 0) + ' كامبين)', ['الكامبين', 'الصرف', 'أوردرات المنصة', 'أوردرات شوبيفاي', 'الدوبليكيشن', 'الحساب', 'CPP المنصة', 'CPP الحقيقي', 'الحالة'],
    'آخر 7 أيام: الكامبينات اللي صرفت ' + ANA.DUP_SPEND + ' أو أكتر والمنصة بتعد فيها أوردرات أكتر من شوبيفاي بـ ' + Math.round(ANA.DUP * 100) + '% أو أكتر.');
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
  r = anaHead_(g, r, '🛍 شوبيفاي النهارده', ['المتريك', 'النهارده', 'إمبارح', 'التغيير', m ? m.wName : 'الأسبوع اللي فات', 'المعنى', 'التغيير عن الأسبوع'],
    'النهارده قدام إمبارح والأسبوع اللي فات لحد نفس الساعة' + (m ? ' (' + m.at + ')' : '') + '، ومعنى التغيير.');
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
  r = anaHead_(g, r, '🛒 المنتجات الأكتر بيعًا', ['المنتج', 'قطع آخر 7 أيام', 'قطع الـ 7 قبلها', 'التغيير', 'Shopify ROAS', 'ملاحظة', 'الصرف 7 أيام', 'الستوك', 'يكفي كام يوم', 'إعلانات شغالة'],
    'آخر 7 أيام كاملة قدام الـ 7 اللي قبلها، قطع من أوردرات مااتلغتش ولا رجعت.');
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
  r = anaHead_(g, r, '📍 المحافظات', ['المحافظة', 'أوردرات 30 يوم', '% من الأوردرات', 'الإلغاء', 'التوصيل', 'الحكم', 'المرتجع'],
    'آخر 30 يوم: فين التوصيل أحسن والإلغاء أقل (فرصة لكامبينات مستهدفة)' +
    (part && part.cAvg !== null && part.dAvg !== null ? '. المتوسط: إلغاء ' + Math.round(part.cAvg * 100) + '% وتوصيل ' + Math.round(part.dAvg * 100) + '%.' : '.'));
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
  r = anaHead_(g, r, '🗂 الكتالوج', ['المنتج', 'أوردرات من الكتالوج', '% من أوردرات الكتالوج', 'صرف الكتالوج عليه', 'Shopify ROAS', 'ملاحظة'],
    'آخر 14 يوم: المنتجات اللي إعلانات الكتالوج بتبيعها (الأوردر على المنتج اللي فيه قطع أكتر، والصرف من تقسيمة Meta).');
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
    alert_('اتحدث تاب ' + ANA.TAB + ' وتاب ' + ANA.TAB2 + ' ✅');
    ss_().setActiveSheet(tab_(ANA.TAB));
  } catch (e) { alert_('تاب ' + ANA.TAB + ' و ' + ANA.TAB2 + ' ماتحدثوش:\n' + errText_(e)); }
}
