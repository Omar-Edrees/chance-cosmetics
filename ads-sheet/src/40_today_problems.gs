/*
 * Today: small cards in the empty space at the top (rows 2–6, columns C–G, right of Closing Date ... Orders Source), like the
 * Shopify cards but smaller. One card per kind of problem with how many problems of that kind the Actions tab has now (🔴 عاجل
 * and 🟠 مهم; a merged action "4 منتجات ..." counts 4), pale red, or grey when there are none; and a green Scaling card with
 * the opportunities (🟢). So a glance at Today says where the problems are, and the Actions tab says what they are and
 * what to do.
 * The numbers are counted when the Actions tab is drawn (writeAnalysisTab_), saved in TPROB.KEY, and written in the cells
 * under the cards (white on white: a scorecard reads cells), both then and every time Today is drawn. The cards are
 * scorecard charts (the Sheets API, like the Shopify cards): made once, after that only their colors and subtitle change,
 * so a card moved or sized by hand stays so. Without the Sheets API service there are no cards (Today says so already).
 */
const TPROB = {
  KEY: 'TODAY_PROBLEMS', CHART_KEY: 'TODAY_PROBLEM_CHARTS',
  /* The cards' cells: rows ROW and ROW + 1, columns COL.. COL + PER_ROW − 1 (C–G), under the cards. */
  ROW: 2, COL: 3, PER_ROW: 5, ROWS: [2, 3, 4, 5, 6], ROW_H: 28, W: 124, H: 66, GAP: 5,
  RED: '#fde2e2', NONE: '#f3f4f6', GREEN: '#c9ecd2', RED_FC: '#991b1b', GREEN_FC: '#166534', GREY_FC: '#6b7280',
  /* [key, title, the Analysis areas it counts] — the order of the cards. 'scale' = every opportunity (🟢). */
  CARDS: [
    ['camps', 'الكامبينات', ['الكامبينات']],
    ['acc', 'الحسابات', ['الحسابات']],
    ['hours', 'الـ 3 ساعات', ['الـ 3 ساعات']],
    ['funnel', 'الفانل والبنشمارك', ['الفانل', 'البنشمارك']],
    ['stock', 'الستوك', ['الستوك']],
    ['cancel', 'الإلغاء والمحافظات', ['الإلغاء', 'المحافظات']],
    ['dup', 'الدوبليكيشن', ['الدوبليكيشن']],
    ['prod', 'المنتجات والكتالوج', ['المنتجات', 'الكتالوج']],
    ['site', 'الموقع (شوبيفاي)', ['شوبيفاي']],
    ['scale', 'Scaling', null]
  ]
};

/* From the Actions tab's findings (M of writeAnalysisTab_): {day, at, cards: {key: {n, urgent}}}, saved for Today. */
function todayProblemsSave_(M) {
  const cards = {}, n = f => f.n || 1;
  TPROB.CARDS.forEach(c => {
    const list = c[2] ? M.bad.filter(f => c[2].indexOf(f.area) >= 0) : M.good;
    cards[c[0]] = { n: list.reduce((s, f) => s + n(f), 0), urgent: list.filter(f => f.pri === 1).reduce((s, f) => s + n(f), 0) };
  });
  const out = { day: todayKey_(), at: nowText_(), cards: cards };
  PropertiesService.getDocumentProperties().setProperty(TPROB.KEY, JSON.stringify(out));
  return out;
}
/* The saved counts, or null (none yet, or from another day: the Actions tab of today isn't drawn yet). */
function todayProblems_() {
  try { const x = JSON.parse(PropertiesService.getDocumentProperties().getProperty(TPROB.KEY) || 'null'); return x && x.day === todayKey_() ? x : null; }
  catch (e) { return null; }
}
/* Card i's cell (row, column) under the cards. */
function todayProblemCell_(i) { return [TPROB.ROW + Math.floor(i / TPROB.PER_ROW), TPROB.COL + (i % TPROB.PER_ROW)]; }
/* The numbers in the cells, white on white (in Today's page g). */
function todayProblemCells_(g) {
  const x = todayProblems_(), hide = { fc: '#ffffff', bg: '#ffffff', nf: '0', al: 'center' };
  TPROB.CARDS.forEach((c, i) => { const at = todayProblemCell_(i); g.set(at[0], at[1], x ? x.cards[c[0]].n : '', hide); });
}
/* A card's chart spec: the title, the count from its cell, red / grey / green, and what the count means under it. */
function todayProblemSpec_(c, i, sheetId, x) {
  const T = TPROB, at = todayProblemCell_(i), v = x ? x.cards[c[0]] : null, scale = !c[2];
  const bg = !v ? T.NONE : scale ? T.GREEN : v.n > 0 ? T.RED : T.NONE, fc = !v || !v.n ? T.GREY_FC : scale ? T.GREEN_FC : T.RED_FC;
  // RLM + RLE … PDF: the chart writes left to right, and without them the Arabic and the numbers come out jumbled.
  const sub = !v ? 'لسه بيتحسب' : scale ? (v.n ? 'فرص تزوّد عليها' : 'مفيش دلوقتي') : !v.n ? 'مفيش ✅' : v.urgent ? v.urgent + ' عاجل' : 'مهم';
  return { title: '‏‫' + (scale ? '🟢 ' : '') + c[1] + '‬', subtitle: '‏‫' + sub + '‬', fontName: 'Arial',
    backgroundColorStyle: { rgbColor: shopTabRgb_(bg) },
    // The title big and clear (where the problem is), the count smaller under it.
    titleTextFormat: { bold: true, fontSize: 12, foregroundColor: shopTabRgb_('#111827') }, titleTextPosition: { horizontalAlignment: 'CENTER' },
    subtitleTextFormat: { bold: true, fontSize: 9, foregroundColor: shopTabRgb_(fc) }, subtitleTextPosition: { horizontalAlignment: 'CENTER' },
    scorecardChart: { keyValueData: { sourceRange: { sources: [{ sheetId: sheetId, startRowIndex: at[0] - 1, endRowIndex: at[0], startColumnIndex: at[1] - 1,
      endColumnIndex: at[1] }] } }, numberFormatSource: 'FROM_DATA',
      keyValueFormat: { textFormat: { bold: true, fontSize: 13, foregroundColor: shopTabRgb_(fc) }, position: { horizontalAlignment: 'CENTER' } } } };
}
/* Makes the missing cards and updates the others (after Today is written). Errors go to Health with the other cards. */
function todayProblemCharts_(sh) {
  if (!todayCardsReady_()) return;
  const T = TPROB, props = PropertiesService.getDocumentProperties(), sheetId = sh.getSheetId(), x = todayProblems_();
  let ids = {};
  try { ids = JSON.parse(props.getProperty(T.CHART_KEY) || '{}'); } catch (e) { ids = {}; }
  const have = new Set(sh.getCharts().map(c => String(c.getChartId()))), reqs = [], made = [];
  T.CARDS.forEach((c, i) => {
    const spec = todayProblemSpec_(c, i, sheetId, x), id = ids[c[0]];
    if (id !== undefined && have.has(String(id))) { reqs.push({ updateChartSpec: { chartId: id, spec: spec } }); return; }
    made.push([reqs.length, c[0]]);
    reqs.push({ addChart: { chart: { spec: spec, position: { overlayPosition: {
      anchorCell: { sheetId: sheetId, rowIndex: T.ROW - 1, columnIndex: T.COL - 1 },
      offsetXPixels: (i % T.PER_ROW) * (T.W + T.GAP), offsetYPixels: 2 + Math.floor(i / T.PER_ROW) * (T.H + T.GAP),
      widthPixels: T.W, heightPixels: T.H } } } } });
  });
  const sig = sha_(JSON.stringify(reqs));
  if (!made.length && props.getProperty(T.CHART_KEY + '_SIG') === sig) return;
  try {
    const res = Sheets.Spreadsheets.batchUpdate({ requests: reqs }, ss_().getId());
    made.forEach(m => { const r = (res.replies || [])[m[0]] || {}; if (r.addChart) ids[m[1]] = r.addChart.chart.chartId; });
    props.setProperty(T.CHART_KEY, JSON.stringify(ids));
    props.setProperty(T.CHART_KEY + '_SIG', sig);
  } catch (e) { setStatus_('TODAY_CARDS', '✗ كروت المشاكل: ' + errText_(e)); }
}
/* Today's rows under the cards, tall enough for two rows of them (after Today is redrawn). */
function todayProblemRows_(sh) { TPROB.ROWS.forEach(r => sh.setRowHeight(r, TPROB.ROW_H)); }
/*
 * After the Actions tab is drawn: the counts saved, written in Today's cells and the cards updated at once (not on the next
 * update). Today's own drawing writes the same numbers from what's saved.
 */
function todayProblemsRefresh_(M) {
  todayProblemsSave_(M);
  const sh = ss_().getSheetByName(APP.T.TODAY);
  if (!sh || !todayCardsReady_() || !todayCardRows_()) return;
  const x = todayProblems_(), first = todayProblemCell_(0);
  const vals = [0, 1].map(r => TPROB.CARDS.slice(r * TPROB.PER_ROW, (r + 1) * TPROB.PER_ROW).map(c => x.cards[c[0]].n));
  sh.getRange(first[0], first[1], 2, TPROB.PER_ROW).setValues(vals);
  todayProblemCharts_(sh);
}
