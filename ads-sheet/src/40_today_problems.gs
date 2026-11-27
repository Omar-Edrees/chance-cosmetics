/*
 * Today: 6 cards at the top (rows 2–4, columns C–F, right of Closing Date ... Orders Source), 2 a row, each a wide colored
 * cell: the kind of problem big and bold, and under it how many problems of that kind the Actions tab has now (🔴 عاجل and
 * 🟠 مهم; a merged action "4 منتجات ..." counts 4) and how many are urgent. Pale red with problems, grey without, and the
 * Scaling card green with the opportunities (🟢). The whole card is a link to its section in the Actions tab, so one click
 * on the card (then on the link) shows those problems with what to do.
 * The counts and the section rows are saved when the Actions tab is drawn (writeAnalysisTab_) in TPROB.KEY, and written in
 * the cards both then and every time Today is drawn. Plain cells (no Sheets API): until 1.81 the cards were 10 scorecard
 * charts, which can't be clicked; those are removed once (TPROB.OLD_CHARTS).
 */
const TPROB = {
  KEY: 'TODAY_PROBLEMS', OLD_CHARTS: 'TODAY_PROBLEM_CHARTS', SIG: 'TODAY_PROBLEM_SIG',
  /* Card i: row ROW + ⌊i / PER_ROW⌋, columns COL + (i % PER_ROW) × SPAN, SPAN columns wide (C:D and E:F). */
  ROW: 2, COL: 3, PER_ROW: 2, SPAN: 2, ROW_H: 54, PLAIN_H: 21, LAST_ROW: 6, TITLE_PT: 14, SUB_PT: 11,
  RED: '#fde2e2', NONE: '#f3f4f6', GREEN: '#c9ecd2', RED_FC: '#991b1b', GREEN_FC: '#166534', GREY_FC: '#6b7280', TITLE_FC: '#111827',
  /* [key, title, the Analysis areas it counts] — the order of the cards and of the sections in Actions. 'scale' = every opportunity (🟢). */
  CARDS: [
    ['stock', 'الستوك والمنتجات', ['الستوك', 'المنتجات', 'الكتالوج']],
    ['camps', 'الكامبينات والدوبليكيشن', ['الكامبينات', 'الدوبليكيشن']],
    ['acc', 'الحسابات والـ 3 ساعات', ['الحسابات', 'الـ 3 ساعات']],
    ['funnel', 'الفانل والموقع', ['الفانل', 'البنشمارك', 'شوبيفاي']],
    ['cancel', 'الإلغاء والمحافظات', ['الإلغاء', 'المحافظات']],
    ['scale', '🟢 Scaling', null]
  ]
};

/* The findings of card c (M of writeAnalysisTab_). */
function todayProblemList_(c, M) { return c[2] ? M.bad.filter(f => c[2].indexOf(f.area) >= 0) : M.good; }
/*
 * From the Actions tab's findings: {day, at, cards: {key: {n, urgent}}, rows: {key: its section's row in Actions}, gid},
 * saved for Today.
 */
function todayProblemsSave_(M, rows) {
  const cards = {}, n = f => f.n || 1;
  TPROB.CARDS.forEach(c => {
    const list = todayProblemList_(c, M);
    cards[c[0]] = { n: list.reduce((s, f) => s + n(f), 0), urgent: list.filter(f => f.pri === 1).reduce((s, f) => s + n(f), 0) };
  });
  const tab = ss_().getSheetByName(ANA.TAB);
  const out = { day: todayKey_(), at: nowText_(), cards: cards, rows: rows || {}, gid: tab ? tab.getSheetId() : null };
  PropertiesService.getDocumentProperties().setProperty(TPROB.KEY, JSON.stringify(out));
  return out;
}
/* The saved counts, or null (none yet, or from another day: the Actions tab of today isn't drawn yet). */
function todayProblems_() {
  try { const x = JSON.parse(PropertiesService.getDocumentProperties().getProperty(TPROB.KEY) || 'null'); return x && x.day === todayKey_() ? x : null; }
  catch (e) { return null; }
}
/* Card i's top-left cell (row, column). */
function todayProblemCell_(i) { return [TPROB.ROW + Math.floor(i / TPROB.PER_ROW), TPROB.COL + (i % TPROB.PER_ROW) * TPROB.SPAN]; }
/* Card c as {title, sub, text (both lines), bg, fc, link}. x = the saved counts (or null). */
function todayProblemCard_(c, x) {
  const T = TPROB, v = x ? x.cards[c[0]] : null, scale = !c[2];
  const bg = !v ? T.NONE : scale ? (v.n ? T.GREEN : T.NONE) : v.n > 0 ? T.RED : T.NONE, fc = !v || !v.n ? T.GREY_FC : scale ? T.GREEN_FC : T.RED_FC;
  const sub = !v ? 'لسه بيتحسب' : scale ? (v.n ? v.n + ' فرصة تزوّد عليها' : 'مفيش دلوقتي')
    : !v.n ? 'مفيش ✅' : v.n + ' مشكلة' + (v.urgent ? '، منهم ' + v.urgent + ' عاجل' : '');
  const row = x && x.rows ? x.rows[c[0]] : null, link = x && x.gid !== null && x.gid !== undefined && row ? '#gid=' + x.gid + '&range=A' + row : '';
  return { title: c[1], sub: sub, text: c[1] + '\n' + sub, bg: bg, fc: fc, link: link };
}
/*
 * The cards' place in Today's page g: merged cells only. What's on them (text, colors, link) is written by
 * todayProblemLinks_, so a new count changes those cells only and never redraws the whole of Today.
 */
function todayProblemCells_(g) {
  TPROB.CARDS.forEach((c, i) => {
    const at = todayProblemCell_(i);
    g.set(at[0], at[1], '', { al: 'center', va: 'middle', wr: true });
    g.fill(at[0], at[1] + 1, TPROB.SPAN - 1, { va: 'middle' });
    g.merge(at[0], at[1], 1, TPROB.SPAN);
  });
}
/*
 * The cards' look that a page can't hold: the title bigger than the count under it, the whole card a link to its section
 * in Actions, and white borders between the cards. Written when Today was redrawn (it writes the plain text) or when
 * anything on the cards changed.
 */
function todayProblemLinks_(sh, redrawn) {
  const T = TPROB, x = todayProblems_(), props = PropertiesService.getDocumentProperties();
  const cards = T.CARDS.map(c => todayProblemCard_(c, x)), sig = sha_(JSON.stringify(cards));
  todayProblemOldCharts_(sh);
  if (!redrawn && props.getProperty(T.SIG) === sig) return;
  const thick = (SpreadsheetApp.BorderStyle || {}).SOLID_THICK;
  cards.forEach((k, i) => {
    const at = todayProblemCell_(i), cell = sh.getRange(at[0], at[1], 1, T.SPAN);
    const style = (size, color) => SpreadsheetApp.newTextStyle().setBold(true).setFontSize(size).setForegroundColor(color).setUnderline(false).build();
    let b = SpreadsheetApp.newRichTextValue().setText(k.text)
      .setTextStyle(0, k.title.length, style(T.TITLE_PT, T.TITLE_FC)).setTextStyle(k.title.length + 1, k.text.length, style(T.SUB_PT, k.fc));
    if (k.link) b = b.setLinkUrl(0, k.text.length, k.link);
    sh.getRange(at[0], at[1]).setRichTextValue(b.build());
    cell.setBackground(k.bg).setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true)
      .setBorder(true, true, true, true, null, null, '#ffffff', thick);
  });
  props.setProperty(T.SIG, sig);
}
/* The 10 scorecard charts of version 1.80 and before: removed once. */
function todayProblemOldCharts_(sh) {
  const props = PropertiesService.getDocumentProperties(), raw = props.getProperty(TPROB.OLD_CHARTS);
  if (!raw) return;
  let ids = {};
  try { ids = JSON.parse(raw) || {}; } catch (e) { ids = {}; }
  const gone = new Set(Object.keys(ids).map(k => String(ids[k])));
  sh.getCharts().forEach(ch => { if (gone.has(String(ch.getChartId()))) sh.removeChart(ch); });
  props.deleteProperty(TPROB.OLD_CHARTS);
  props.deleteProperty(TPROB.OLD_CHARTS + '_SIG');
}
/* The cards' rows tall enough for a big title and a line under it; the rest down to Orders Source normal. */
function todayProblemRows_(sh) {
  const T = TPROB, last = T.ROW + Math.ceil(T.CARDS.length / T.PER_ROW) - 1;
  for (let r = T.ROW; r <= T.LAST_ROW; r++) sh.setRowHeight(r, r <= last ? T.ROW_H : T.PLAIN_H);
}
/*
 * After the Actions tab is drawn: the counts and section rows saved, and the cards in Today updated at once (not on the next
 * update). Today's own drawing writes the same from what's saved.
 */
function todayProblemsRefresh_(M, rows) {
  todayProblemsSave_(M, rows);
  const sh = ss_().getSheetByName(APP.T.TODAY);
  if (!sh || sh.getLastRow() < TPROB.ROW) return;
  todayProblemLinks_(sh, false); // only when something on the cards changed
}
