/*
 * Tabs "Actions" and "Analysis": what to do next, from everything the sheet already knows. Rules only (no AI): each part looks at
 * its numbers, writes what's wrong (a problem) or what's going well (a good thing) with the numbers that say so, and the
 * action to take. Every action goes to one list, most urgent first (🔴 عاجل → 🟠 مهم → 🟡 راقب → 🟢 فرصة), then by the
 * money involved. Tasks you type in the tab join the same list.
 * The parts (all from the sheet's own tabs, nothing new is read from Meta here):
 *  - Accounts: Shopify ROAS of every Meta and TikTok account day by day this month; the last 3 days against the 7 before.
 *  - 3 hours: spend, orders and ROAS of each 3-hour window today and yesterday against the same window in the 7 days before,
 *    and the campaigns that spent the most in a weak window (their spend from the "Intraday Ads" snapshots).
 *  - Meta benchmark vs today: every metric worse than the last 3 months, per account; TikTok against its last 7 days.
 *  - Funnel: each Meta account's funnel steps in the last 3 full days against the 14 days before (the funnel's Meta reads).
 *  - Campaigns: the Meta Campaigns tab's decisions (stop, dropped, scale, bring back).
 *  - Stock: colors that ran out or run out in 10 days or less and sell, most wanted first (pieces in 30 days).
 *  - Cancellation: last 7 days against the 7 before and this month against last month, per account and product, and days
 *    that stood out. Cancelled ÷ orders already decided (cancelled or shipped), so orders still waiting don't hide it.
 *  - Duplication: campaigns whose platform counts many more orders than Shopify (last 7 days).
 *  - Shopify: today against yesterday until the same hour (sessions, conversion, bounce, sales, orders against the spend).
 *  - Products, governorates and the catalog: what sells better, where it's delivered best, what the catalog sells.
 * A messages-only account (accounts.messages_only, isMsgAccount_) isn't judged in any part: no account, funnel, benchmark,
 * campaign, cancellation or duplication finding, and it's left out of the business's funnel finding (its chats would pull
 * it down). Every other number stays as it was (its spend is in the business's, as Closing).
 */
const ANA = {
  TAB: 'Actions', TAB2: 'Analysis', OLD_TAB: 'Analysis & Actions', SNAP: 'Intraday Ads', GROUPS: 'ANA_GROUPS',
  /* Analysis: 15 columns, F and L narrow gaps between the small tables at the top; the tables under them skip the gaps. */
  W2: [190, 85, 85, 85, 85, 14, 240, 85, 85, 85, 85, 14, 90, 420, 95], LC: [1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 13, 14], BACK: 60, WIDTH: 18, TOP: 4, MIN_ROWS: 12, SPARE: 4,
  R: 7, BA: 12, // tasks start at column G (5 columns), before / after at column L (7 columns); the left side is A–E
  FUNNEL_KEY: 'ANA_FUNNEL', DONE_KEY: 'ANA_DONE', ROWS_KEY: 'ANA_ROWS', FIND_KEY: 'ANA_FINDS', PENDING_KEY: 'ANA_PENDING', DONE_DAYS: 7,
  STOCK_COLOR: 5, STOCK_NO_ADS: 30, STOCK_ACT: 15, STOCK_ROWS: 15, ACT_GOOD: 5, TOP_LIST: 8,
  MIN_SPEND: 1000, DROP: 0.2, WORSE: 0.15, WINDOW_LOW: 0.7, WINDOW_MIN: 500, DUP: 0.5, DUP_MIN: 3, DUP_SPEND: 1000,
  PRI: { 1: '🔴 عاجل', 2: '🟠 مهم', 3: '🟡 راقب', 4: '🟢 فرصة' },
  PRI_BG: { 1: '#f4cccc', 2: '#fce5cd', 3: '#fff2cc', 4: '#d9ead3' },
  STATUS: ['لسه', 'شغال فيها', 'خلصت'],
  METRICS: ['Shopify ROAS', 'CPP', 'الأوردرات في اليوم', 'الصرف في اليوم', 'نسبة الإلغاء'],
  BIZ: 'البيزنس كله',
  WIDTHS: [95, 400, 440, 95, 70, 16, 240, 90, 90, 95, 150, 240, 95, 120, 130, 95, 95, 95],
  DARK: '#1f2937', LABEL: '#f3f4f6', INPUT: '#fffbe6', GREEN: '#d9ead3', RED: '#f4cccc', AMBER: '#fff2cc', GREY: '#6b7280', BLUE: '#e8eefc',
  MONEY: '#,##0', RATIO: '0.00', PCT: '0.0%', COUNT: '0',
  /* What to do when a metric is worse, by its name in Today's benchmark or the Daily Account Funnel. */
  FIX: [
    [/^CPM/, 'الـ CPM غلي: وسّع الجمهور أو جرّب كرييتيف جديد (الكرييتيف الضعيف بيغلّي الـ CPM)، واتأكد إن مفيش كامبينات بتنافس بعض على نفس الناس'],
    [/^Hook/, 'أول 3 ثواني في الفيديو ضعيفة: غيّر الهوك (أول جملة أو أول مشهد)'],
    [/^Hold/, 'الناس بتقفل الفيديو بدري: قصّره وحط المنتج والعرض في الأول'],
    [/^(CTR|Out CTR|CPC|Out CPC|Cost per LPV)/, 'الناس مش بتدوس على الإعلان: الكرييتيف تعب أو العرض مش واضح، نزّل كرييتيفات جديدة بهوك وعرض مختلف'],
    [/^(Link click → LPV|CV\/Out|Cost\/CV|Cost per content view)/, 'الكليك مش بيوصل للصفحة: الموقع تقيل أو اللينك فيه مشكلة، افتح الإعلان من الموبايل وجرّب الصفحة'],
    [/^(Content view → ATC|ATC\/CV)/, 'صفحة المنتج مش مقنعة: راجع السعر والصور والريفيوهات، واتأكد إن اللون اللي في الإعلان موجود في الستوك'],
    [/^(ATC → Checkout|Chk\/ATC|Checkout → Purchase|Pur\/Chk)/, 'الناس بتقف عند الفورم: اطلب أوردر بنفسك، وراجع الشحن والعرض في الفورم'],
    [/^(CVR|LPV → Purchase)/, 'التحويل وقع: راجع صفحة المنتج والعرض والستوك'],
    [/^AOV/, 'متوسط الأوردر قل: فعّل الباندل والأبسيل، أو شوف لو العرض اتغير'],
    [/ROAS/, 'الرؤاس وقع: شوف الكامبينات اللي تحت التعادل في Meta Campaigns ووقّفها']
  ]
};
/* The Meta Campaigns tab's campaigns with their decisions, from its last drawing in this run (34_meta_camps.gs). */
let MC_LAST_ = null;

/* ---------- Small helpers ---------- */

function anaFix_(name) { const f = ANA.FIX.find(x => x[0].test(name)); return f ? f[1] : ''; }
function anaPct_(v) { return (v > 0 ? '+' : '') + Math.round(v * 100) + '%'; }
function anaMoney_(v) { return String(Math.round(v || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function anaNum_(v, digits) { return typeof v === 'number' && isFinite(v) ? Math.round(v * Math.pow(10, digits)) / Math.pow(10, digits) : ''; }
function anaZero_() { return { spend: 0, orders: 0, revenue: 0, cancelled: 0, decided: 0, returned: 0, finished: 0, delivered: 0, pieces: 0, pixel: 0 }; }
function anaAdd_(a, b) { Object.keys(b).forEach(k => { if (typeof b[k] === 'number') a[k] = (a[k] || 0) + b[k]; }); return a; }
/* The sum of a {day: numbers} map between two days (both included). */
function anaSum_(days, from, to) {
  const t = anaZero_();
  Object.keys(days || {}).forEach(d => { if (d >= from && d <= to) anaAdd_(t, days[d]); });
  return t;
}
function anaRoas_(t) { return t.spend > 0 ? t.revenue / t.spend : null; }
function anaCancel_(t) { return t.decided > 0 ? t.cancelled / t.decided : null; }
/* A day as "السبت 21/11". */
function anaDay_(key) { return shopTabDayLabel_(key); }
/* An hour (0–24) in words: "3 العصر", "12 بالليل". */
function anaHour_(h) {
  const x = h % 24, n = x % 12 === 0 ? 12 : x % 12;
  return n + ' ' + (x === 0 ? 'بالليل' : x < 5 ? 'الفجر' : x < 12 ? 'الصبح' : x === 12 ? 'الضهر' : x < 17 ? 'العصر' : x < 20 ? 'المغرب' : 'بالليل');
}
/*
 * How a finding reads in the tabs. English names (campaigns, products) never sit inside an Arabic sentence, where the two
 * directions mix them up: the sentence, then the name on a line of its own, then the numbers as bullets.
 * anaDo_: the action (+ its name + its list). anaWhy_: the problem (+ its name + its numbers).
 */
function anaDo_(f) { return f.action + (f.item ? '\n' + f.item : '') + (f.more ? '\n' + f.more : ''); }
function anaWhy_(f) { return f.title + (f.item ? '\n' + f.item : '') + (f.detail ? '\n' + f.detail : ''); }
function anaHeadline_(f) { return f.title + (f.item ? '\n' + f.item : ''); }
/* The priority (1–4) from a label typed or chosen in the tab ("🔴 عاجل", "عاجل", "1"). 3 when it says nothing. */
function anaPri_(v) {
  const s = String(v || '').trim();
  const hit = Object.keys(ANA.PRI).find(k => s === ANA.PRI[k] || s.indexOf(ANA.PRI[k].split(' ')[0]) === 0 || s === ANA.PRI[k].split(' ')[1] || s === k);
  return hit ? Number(hit) : 3;
}
/* A day typed in the tab: a date, "2026-11-21", "21/11/2026" or "21/11" (this year). '' when it isn't one. */
function anaDate_(v, today) {
  if (v instanceof Date) return dayKey_(v);
  const s = String(v || '').trim(), k = asKey_(s);
  if (k) return k;
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?$/);
  if (!m) return '';
  const y = m[3] ? (m[3].length === 2 ? '20' + m[3] : m[3]) : today.slice(0, 4);
  const out = y + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0');
  return asKey_(out) && Number(m[2]) <= 12 && Number(m[1]) <= 31 ? out : '';
}
/* Break-even ROAS of the business (be.roas, else from the costs and this month's AOV), or null. */
function anaBe_(F) {
  const t = anaSum_(F.biz, F.month0, F.today);
  try { return beRoas_(t.orders > 0 ? t.revenue / t.orders : 0).v || null; } catch (e) { return null; }
}

/* ---------- The numbers, read once ---------- */

/*
 * Everything the parts need, day by day (the business and products for the last ANA.BACK days, the rest for the last 31):
 * biz (the business, as Closing), acc (each ad account: spend from Ads Raw, store orders like the Daily Account Funnel;
 * TikTok orders by their campaign), pix (each account's platform numbers), camp (each campaign: spend, pixel, store orders),
 * prod (each product: Daily Log), items (each product: orders, pieces not cancelled or returned, status), gov (each
 * governorate, last 30 days), times (each order of the last 8 days with its hour, platform and campaign), okIds (orders not
 * cancelled or returned, for the colors), cat (catalog ads' orders and spend per product, last 14 days).
 */
function anaFacts_(today) {
  const from = shiftKey_(today, -ANA.BACK), F = { today: today, from: from, month0: today.slice(0, 8) + '01', biz: {}, acc: {}, accName: {}, accPlat: {},
    pix: {}, camp: {}, campName: {}, campAcc: {}, prod: {}, items: {}, gov: {}, times: [], okIds: {}, cat: {}, catSpend: {}, msg: msgAccounts_() };
  const day = (map, k, d) => { const x = map[k] = map[k] || {}; return x[d] = x[d] || anaZero_(); };
  const status = (t, st) => {
    if (!st) return;
    if ('CRDS'.indexOf(st.code) >= 0) t.decided++;
    if (st.code === 'C') t.cancelled++;
    if (st.code === 'R') { t.returned++; t.finished++; }
    if (st.code === 'D') { t.delivered++; t.finished++; }
  };
  ['META', 'TIKTOK'].forEach(p => accounts_(p).forEach(a => { F.accName[a.id] = a.name || a.id; F.accPlat[a.id] = p; }));
  // Ads and store orders: this month or the last 31 days, whichever is longer (every 15 minutes, so not more); the business
  // and the products (Daily Log, already read) go back ANA.BACK days, for last month and the before / after table.
  const near = [F.month0, shiftKey_(today, -30)].sort()[0];
  const biz = bizDays_(from, today);
  Object.keys(biz).forEach(d => {
    const t = biz[d];
    F.biz[d] = Object.assign(anaZero_(), { spend: t.spend, orders: t.orders, revenue: t.sales, cancelled: t.cancelled, decided: t.cancelled + t.confirmed,
      returned: t.returned, finished: t.returned + t.delivered, delivered: t.delivered, delRevenue: t.revenue, known: t.known });
  });
  // Spend and the platform's numbers per account and campaign; which campaign each ad, ad set and campaign name belongs to.
  const adCamp = {}, setCamp = {}, byName = {};
  recentRows_(APP.T.ADS, ADS_HEADERS.length, 1, asKey_, near).forEach(a => {
    const p = a[1], d = asKey_(a[0]);
    if ((p !== 'META' && p !== 'TIKTOK') || !d) return;
    const acc = String(a[2]), cid = String(a[4] || ''), k = p + '|' + cid, s = num_(a[10]);
    if (!F.accName[acc]) { F.accName[acc] = String(a[3] || acc); F.accPlat[acc] = p; }
    const x = day(F.pix, acc, d);
    x.spend += s; x.orders += num_(a[13]); x.revenue += num_(a[14]);
    day(F.acc, acc, d).spend += s;
    if (!cid) return;
    if (!F.campName[k]) { F.campName[k] = String(a[5] || cid); F.campAcc[k] = acc; }
    if (a[5] && !byName[p + '|' + norm_(a[5])]) byName[p + '|' + norm_(a[5])] = k;
    if (a[8]) adCamp[p + '|' + a[8]] = k;
    if (a[6]) setCamp[p + '|' + a[6]] = k;
    const c = day(F.camp, k, d);
    c.spend += s; c.pixel += num_(a[13]);
  });
  const campOf = o => {
    const p = o[3];
    if (p !== 'META' && p !== 'TIKTOK') return '';
    const u = String(o[13] || '').trim(), ad = String(o[14] || '') || (adCamp[p + '|' + u] ? u : ''), c = p + '|' + String(o[16] || '');
    return adCamp[p + '|' + ad] || setCamp[p + '|' + String(o[17] || '')] || (o[16] && F.campName[c] ? c : '') ||
      byName[p + '|' + norm_(o[12])] || byName[p + '|' + norm_(o[11])] || '';
  };
  const tts = Object.keys(F.accPlat).filter(id => F.accPlat[id] === 'TIKTOK'), catAds = catalogAdIds_();
  const d30 = shiftKey_(today, -29), d14 = shiftKey_(today, -13), d8 = shiftKey_(today, -8);
  // Every store order but the outside account's (GRAND TOTAL), with the account the Daily Account Funnel gives it.
  if (ss_().getSheetByName(APP.T.ORDERS)) funnelShop_(near, (o, d, acc) => {
    const st = orderStatus_(o[0]), total = num_(o[7]), camp = campOf(o), bad = !!st && (st.code === 'C' || st.code === 'R');
    if (!acc && o[3] === 'TIKTOK') acc = camp ? F.campAcc[camp] : tts.length === 1 ? tts[0] : '';
    if (acc) { const t = day(F.acc, acc, d); t.orders++; t.revenue += total; status(t, st); }
    if (camp) { const t = day(F.camp, camp, d); t.orders++; t.revenue += total; status(t, st); }
    if (!bad) F.okIds[String(o[0])] = d;
    const items = {};
    lineItems_(o[6]).forEach(li => { const n = productNameOf_(li.title); items[n] = (items[n] || 0) + li.qty; });
    if (!Object.keys(items).length) items[String(o[5] || APP.UNKNOWN_PRODUCT)] = 1;
    Object.keys(items).forEach(n => { const t = day(F.items, n, d); t.orders++; if (!bad) t.pieces += items[n]; status(t, st); });
    if (d >= d30) { const g = govOf_(o) || GOV.UNKNOWN, t = F.gov[g] = F.gov[g] || anaZero_(); t.orders++; status(t, st); }
    if (d >= d8) {
      const hm = String(sortKey_(o[1])).match(/(\d{1,2}):(\d{2})/);
      if (hm) F.times.push({ d: d, h: Number(hm[1]) + Number(hm[2]) / 60, plat: o[3] === 'TIKTOK' ? 'TIKTOK' : o[3] === 'META' || o[3] === APP.DIRECT ? 'META' : '',
        camp: camp, total: total });
    }
    if (d >= d14 && o[14] && catAds.has(o[3] + '|' + String(o[14]))) {
      const main = Object.keys(items).sort((a, b) => items[b] - items[a])[0], t = F.cat[main] = F.cat[main] || anaZero_();
      t.orders++; t.revenue += total;
    }
  });
  dailyRows_().forEach(r => {
    if (r[0] < from || r[1] === APP.META_OUT) return;
    const t = day(F.prod, String(r[2]), r[0]);
    t.spend += num_(r[3]); t.orders += num_(r[8]); t.revenue += num_(r[10]);
  });
  if (ss_().getSheetByName(APP.T.CATALOG)) recentRows_(APP.T.CATALOG, CATALOG_HEADERS.length, 1, asKey_, d14).forEach(r => {
    if (!catAds.has(r[1] + '|' + String(r[3]))) return;
    const n = catalogProduct_(r[4]);
    F.catSpend[n] = (F.catSpend[n] || 0) + num_(r[5]);
  });
  return F;
}

/*
 * A finding: {id (stays the same while the problem lasts), kind: 'bad' | 'good', pri (1–4), area, title, detail, action,
 * impact (money, to order findings of one priority), metric and scope (for the before / after table)}.
 */
function anaFind_(out, f) { out.push(Object.assign({ kind: 'bad', pri: 3, detail: '', action: '', impact: 0, metric: 'Shopify ROAS', scope: ANA.BIZ }, f)); }

/*
 * Findings of one kind and priority (campaigns to stop, products whose colors run out ...) become one: the money of all, the subjects listed in the action. [title for n of them, the action's verb before the list]
 */
const ANA_MERGE = {
  'acc-drop': ['حسابات الرؤاس فيها نزل', 'شوف اللي موقّع الرؤاس في Meta Campaigns ووقّف اللي تحت التعادل في'],
  'acc-up': ['حسابات الرؤاس فيها طالع', 'زوّد 20% على الكامبينات الكسبانة في'],
  'acc-today': ['حسابات النهارده تحت التعادل بكتير', 'قلل ميزانية الكامبينات اللي بتصرف من غير أوردرات في'],
  'win': ['أوقات الرؤاس فيها وقع', 'راجع الكامبينات اللي صرفت في'],
  'win-weak': ['أوقات ضعيفة طول الأسبوع', 'قلل الصرف في'],
  'bench': ['حسابات أوحش من البنشمارك النهارده', 'راجع المتريكس اللي وقعت (التفاصيل جنبها) في'],
  'bench-tt': ['حسابات TikTok أوحش من آخر 7 أيام', 'نزّل كرييتيفات جديدة في'],
  'funnel': ['حسابات الفانل فيها وقع', 'راجع الخطوات اللي وقعت (التفاصيل جنبها) في'],
  'funnel-up': ['حسابات الفانل فيها اتحسن', 'زوّد على نفس الكرييتيفات والمنتجات في'],
  'camp-stop': ['كامبينات شغالة تحت التعادل', 'وقّف'],
  'camp-drop': ['كامبينات كانت كويسة ونزلت تحت التعادل', 'قلل الميزانية وراقب يومين، ولو مارجعتش وقّف'],
  'camp-scale': ['كامبينات كسبانة فوق التعادل', 'زوّد الميزانية 20% على'],
  'camp-back': ['كامبينات واقفة وكانت كويسة', 'رجّع بميزانية صغيرة'],
  'stock': ['منتجات عليها إعلانات وألوانها بتخلص', 'اطلب ستوك'],
  'dup': ['كامبينات فيها دوبليكيشن كبير', 'احكم بأوردرات شوبيفاي (مش المنصة) على'],
  'prod-up': ['منتجات بتبيع أكتر', 'ركّز وزوّد الصرف على'],
  'prod-roas': ['منتجات رؤاسها فوق التعادل بكتير', 'زوّد الصرف 20% على'],
  'prod-low': ['منتجات صرفها عالي ورؤاسها تحت التعادل', 'قلل الصرف أو غيّر العرض على'],
  'prod-down': ['منتجات بتبيع أقل', 'راجع الكرييتيف والستوك بتوع'],
  'gov-good': ['محافظات فيها فرصة', 'جرّب كامبين مستهدفة على'],
  'gov-bad': ['محافظات الإلغاء أو المرتجع فيها عالي', 'استبعد أو قوّي التأكيد في'],
  'cancel-prod': ['منتجات إلغاؤها عالي', 'راجع الصفحة والعرض بتوع'],
  'cancel-day': ['أيام الإلغاء فيها عالي', 'شوف إيه اللي حصل في']
};
function anaMerge_(finds) {
  const groups = {}, out = [];
  finds.forEach(f => { const k = f.id.split('|')[0] + '|' + f.kind + '|' + f.pri; (groups[k] = groups[k] || []).push(f); }); // a 🟡 one never joins an 🟠 one
  Object.keys(groups).forEach(k => {
    const list = groups[k].sort((a, b) => (a.pri - b.pri) || (b.impact - a.impact)), m = ANA_MERGE[k.split('|')[0]];
    if (list.length < 2 || !m) { list.forEach(f => out.push(f)); return; }
    const item = f => f.label || f.item || (f.scope !== ANA.BIZ ? f.scope : f.title), more = list.length > 6 ? '\nو ' + (list.length - 6) + ' كمان' : '';
    const scopes = Array.from(new Set(list.map(f => f.scope)));
    out.push({ id: k.split('|')[0] + '|' + sha_(list.map(item).sort().join('|')).slice(0, 12), kind: list[0].kind, pri: list[0].pri, area: list[0].area,
      title: list.length + ' ' + m[0], detail: list.slice(0, 6).map(f => '• ' + item(f) + (f.short ? '\n     ' + f.short : '')).join('\n') + more,
      action: m[1] + ':\n' + anaList_(list.slice(0, 6).map(item)) + more, impact: list.reduce((s, f) => s + f.impact, 0),
      metric: list[0].metric, scope: scopes.length === 1 ? scopes[0] : ANA.BIZ, n: list.length });
  });
  return out.sort((a, b) => (a.pri - b.pri) || (b.impact - a.impact));
}

/* ---------- 1) Accounts: Shopify ROAS day by day ---------- */

function anaAccounts_(F, ctx) {
  const be = ctx.be, out = [], y = shiftKey_(F.today, -1), d3 = shiftKey_(F.today, -3), d4 = shiftKey_(F.today, -4), d10 = shiftKey_(F.today, -10);
  const ids = p => Object.keys(F.accPlat).filter(id => F.accPlat[id] === p && !F.msg.has(id) && anaSum_(F.acc[id], F.month0, F.today).spend > 0)
    .sort((a, b) => anaSum_(F.acc[b], F.month0, F.today).spend - anaSum_(F.acc[a], F.month0, F.today).spend);
  const meta = ids('META'), tt = ids('TIKTOK'), mc = ctx.mc;
  meta.concat(tt).forEach(id => {
    const name = F.accName[id], t3 = anaSum_(F.acc[id], d3, y), t7 = anaSum_(F.acc[id], d10, d4), r3 = anaRoas_(t3), r7 = anaRoas_(t7);
    if (!(t3.spend >= ANA.MIN_SPEND) || r3 === null || r7 === null || !(r7 > 0)) return;
    const ch = r3 / r7 - 1, nums = anaList_(['آخر 3 أيام: رؤاس ' + anaNum_(r3, 2) + '، صرف ' + anaMoney_(t3.spend) + '، ' + t3.orders + ' أوردر',
      'الـ 7 أيام اللي قبلها: رؤاس ' + anaNum_(r7, 2), be ? 'التعادل: ' + anaNum_(be, 2) : '']);
    const camps = code => (mc || []).filter(c => c.acc === id && c.verdict && c.verdict.code === code).slice(0, 3).map(c => c.name);
    const short = 'آخر 3 أيام ' + anaNum_(r3, 2) + '، وكان ' + anaNum_(r7, 2);
    if (ch <= -ANA.DROP) {
      const bad = camps('🔴').concat(camps('🟠'));
      anaFind_(out, { id: 'acc-drop|' + id, pri: be && r3 < be ? 1 : 2, area: 'الحسابات', title: 'الرؤاس نزل ' + anaPct_(ch) + ' في الحساب:', item: name, short: short, detail: nums,
        action: 'شوف اللي موقّع الرؤاس في Meta Campaigns ووقّف اللي تحت التعادل في الحساب:', more: bad.length ? 'أوحش كامبينات:\n' + anaList_(bad) : '',
        impact: t3.spend * Math.min(-ch, 1), scope: name });
    } else if (ch >= ANA.DROP && (!be || r3 >= be)) {
      const good = camps('🟢');
      anaFind_(out, { id: 'acc-up|' + id, kind: 'good', pri: 4, area: 'الحسابات', title: 'الرؤاس طالع ' + anaPct_(ch) + ' في الحساب:', item: name, short: short, detail: nums,
        action: 'زوّد الميزانية 20% على الكامبينات الكسبانة وراقب يومين في الحساب:', more: good.length ? 'الكامبينات الكسبانة:\n' + anaList_(good) : '',
        impact: t3.spend * ch, scope: name });
    }
  });
  // Today so far: an account far under break-even after real spend.
  if (be) meta.concat(tt).forEach(id => {
    const t = anaSum_(F.acc[id], F.today, F.today), r = anaRoas_(t);
    if (t.spend >= 1.5 * ANA.MIN_SPEND && r !== null && r < be * ANA.WINDOW_LOW) anaFind_(out, { id: 'acc-today|' + id, pri: 1, area: 'الحسابات',
      title: 'الرؤاس النهارده ' + anaNum_(r, 2) + ' لحد دلوقتي في الحساب:', item: F.accName[id], short: 'رؤاس ' + anaNum_(r, 2) + ' بصرف ' + anaMoney_(t.spend), detail: anaList_(['صرف ' + anaMoney_(t.spend), t.orders + ' أوردر', 'التعادل: ' + anaNum_(be, 2)]), action: 'شوف الـ 3 ساعات في تاب Analysis، والكامبين اللي بتصرف من غير أوردرات قلل ميزانيتها أو وقّفها لحد بكره، في الحساب:',
      impact: t.spend * (1 - r / be), scope: F.accName[id] });
  });
  return { find: out, meta: meta, tt: tt };
}

/* ---------- 2) The 3-hour windows ---------- */

/* The windows' ends (3, 6, … 24) and each day's snapshots from Intraday: {day: {hour: {META, TIKTOK: spend until then}}}. */
function anaSlots_(from) {
  const hours = cfgList_('intraday.hours').map(Number).map(h => (h === 0 ? 24 : h)).filter(h => h > 0 && h <= 24).sort((a, b) => a - b);
  const snaps = {}, sh = ss_().getSheetByName(APP.T.INTRA);
  if (sh) readRows_(sh, INTRA_HEADERS.length).forEach(x => {
    const d = asKey_(x[0]), h = Number(String(intraSlot_(x[1])).split(':')[0]);
    if (!d || d < from || !(h > 0)) return;
    const p = String(x[2]), at = (snaps[d] = snaps[d] || {})[h] = snaps[d][h] || { META: 0, TIKTOK: 0, any: true };
    if (p === 'META' || p === 'TIKTOK') at[p] += num_(x[3]);
  });
  return { hours: hours, snaps: snaps };
}
/* Spend of every campaign until each snapshot, from the "Intraday Ads" tab: {day: {hour: {campaign key: spend}}}. */
function anaCampSnaps_(from) {
  const out = {}, sh = ss_().getSheetByName(ANA.SNAP);
  if (sh) readRows_(sh, 7).forEach(x => {
    const d = asKey_(x[0]), h = Number(String(intraSlot_(x[1])).split(':')[0]);
    if (!d || d < from || !(h > 0)) return;
    const m = ((out[d] = out[d] || {})[h] = out[d][h] || {}), k = String(x[2]) + '|' + String(x[4]);
    m[k] = (m[k] || 0) + num_(x[6]);
  });
  return out;
}
/*
 * Each window of a day: {from, to, META: {spend, orders, revenue}, TIKTOK: …} or null when a snapshot is missing. Spend =
 * the platform's spend at the window's end − at its start (midnight = 0); orders and sales = the store orders made in it
 * (Meta = Meta ads + DIRECT, like Today's 3-hour check).
 */
function anaWindows_(F, S, d) {
  const list = [], byDay = S.snaps[d] || {};
  S.hours.forEach((h, i) => {
    const prev = i ? S.hours[i - 1] : 0, a = prev ? byDay[prev] : { META: 0, TIKTOK: 0 }, b = byDay[h];
    if (!a || !b) { list.push(null); return; }
    const w = { from: prev, to: h };
    ['META', 'TIKTOK'].forEach(p => { w[p] = { spend: Math.max(0, b[p] - a[p]), orders: 0, revenue: 0 }; });
    F.times.forEach(o => { if (o.d === d && o.plat && o.h >= prev && o.h < h) { w[o.plat].orders++; w[o.plat].revenue += o.total; } });
    list.push(w);
  });
  return list;
}
function anaThreeHours_(F, ctx) {
  const S = anaSlots_(shiftKey_(F.today, -8)), out = [], rows = [], be = ctx.be, camps = anaCampSnaps_(shiftKey_(F.today, -1));
  const usual = {}; // window index → Meta {spend, revenue} over the 7 days before yesterday and today
  for (let i = 2; i <= 8; i++) anaWindows_(F, S, shiftKey_(F.today, -i)).forEach((w, j) => {
    if (!w) return;
    const u = usual[j] = usual[j] || { spend: 0, revenue: 0, days: 0 };
    u.spend += w.META.spend; u.revenue += w.META.revenue; u.days++;
  });
  [F.today, shiftKey_(F.today, -1)].forEach((d, n) => {
    anaWindows_(F, S, d).forEach((w, j) => {
      if (!w) return;
      const m = w.META, r = m.spend > 0 ? m.revenue / m.spend : null, u = usual[j], ur = u && u.spend > 0 ? u.revenue / u.spend : null;
      // The campaigns that spent the most in the window, with their orders in it.
      const a = (camps[d] || {})[w.from] || (w.from ? null : {}), b = (camps[d] || {})[w.to], who = [];
      if (a && b) Object.keys(b).forEach(k => {
        if (k.split('|')[0] !== 'META' || F.msg.has(String(F.campAcc[k]))) return;
        const s = b[k] - (a[k] || 0);
        if (s <= 0) return;
        const os = F.times.filter(o => o.d === d && o.camp === k && o.h >= w.from && o.h < w.to);
        who.push({ k: k, spend: s, orders: os.length, revenue: os.reduce((x, o) => x + o.total, 0) });
      });
      who.sort((x, y) => (y.spend - y.revenue / Math.max(ur || be || 1, 0.1)) - (x.spend - x.revenue / Math.max(ur || be || 1, 0.1)));
      const why = !a || !b ? 'لقطات الكامبينات بتبدأ من أول لقطة بعد التحديث ده' : !who.length ? '' : who.slice(0, 3)
        .map(x => '• ' + (F.campName[x.k] || x.k) + '\n     صرف ' + anaMoney_(x.spend) + ' وجاب ' + x.orders + ' أوردر').join('\n');
      const weak = r !== null && ur !== null && m.spend >= ANA.WINDOW_MIN && r < ur * ANA.WINDOW_LOW;
      rows.push({ d: d, n: n, w: w, r: r, ur: ur, why: why, weak: weak });
      if (weak) anaFind_(out, { id: 'win|' + d + '|' + w.to, pri: n ? 3 : 2, area: 'الـ 3 ساعات', label: (n ? 'إمبارح ' : '') + anaHour_(w.from) + ' → ' + anaHour_(w.to),
        title: (n ? 'إمبارح' : 'النهارده') + ' من ' + anaHour_(w.from) + ' لـ ' + anaHour_(w.to) + ': الرؤاس ' + anaNum_(r, 2) + ' والمعتاد ' + anaNum_(ur, 2),
        short: 'الرؤاس ' + anaNum_(r, 2) + ' والمعتاد ' + anaNum_(ur, 2),
        detail: '• صرف ' + anaMoney_(m.spend) + ' وجاب ' + m.orders + ' أوردر' + (who.length ? '\nأكتر كامبينات صرفت:\n' + why : ''),
        action: who.length ? 'راجع الكامبين دي في الوقت ده، ولو بيتكرر كل يوم في نفس الساعات قلل ميزانيتها أو غيّر الكرييتيف:'
          : 'لو نفس الوقت بيقع كل يوم، الصرف فيه مش جايب: راقب الساعات دي في Meta Campaigns', more: who.length ? F.campName[who[0].k] || '' : '',
        impact: m.spend * (1 - r / ur), scope: who.length ? F.campName[who[0].k] : ANA.BIZ });
    });
  });
  // The weakest window of the last 7 days (on the usual numbers): a pattern, not one bad day.
  const ws = Object.keys(usual).map(Number).filter(j => usual[j].spend >= ANA.WINDOW_MIN * 3);
  const all = ws.reduce((t, j) => ({ spend: t.spend + usual[j].spend, revenue: t.revenue + usual[j].revenue }), { spend: 0, revenue: 0 });
  const avg = all.spend > 0 ? all.revenue / all.spend : null;
  ws.forEach(j => {
    const u = usual[j], r = u.revenue / u.spend, h = S.hours[j], prev = j ? S.hours[j - 1] : 0;
    if (avg && u.days >= 4 && r < avg * ANA.WINDOW_LOW) anaFind_(out, { id: 'win-weak|' + h, pri: 3, area: 'الـ 3 ساعات', label: anaHour_(prev) + ' → ' + anaHour_(h),
      title: 'من ' + anaHour_(prev) + ' لـ ' + anaHour_(h) + ' أضعف وقت في الأسبوع: رؤاس ' + anaNum_(r, 2) + ' والمتوسط ' + anaNum_(avg, 2), short: 'رؤاس ' + anaNum_(r, 2),
      detail: 'صرف ' + anaMoney_(u.spend) + ' في الوقت ده في ' + u.days + ' أيام', action: 'لو الكامبينات بميزانية كل المدة (lifetime)، اعمل جدولة تقلل الصرف في الساعات دي',
      impact: u.spend * (1 - r / avg) / Math.max(u.days, 1) });
  });
  return { find: out, rows: rows, hours: S.hours };
}

/* ---------- 3) Meta benchmark vs today, TikTok vs its last 7 days ---------- */

function anaBench_(F, ctx) {
  const out = [], rows = [], f = todayFunnel_(), today = F.today;
  const months = f.best && f.best.months ? Object.keys(f.best.months).map(k => f.best.months[k]) : [];
  const base = months.length ? funnelMonthsTotal_(months) : null;
  (f.today && f.today.day === today ? f.today.accounts : []).forEach(a => {
    if (a.error || !a.raw) return;
    if (F.msg.has(String(a.id))) {
      rows.push({ name: a.name, plat: 'META', spend: num_(a.raw.spend), roas: '', base: '', worse: [], msg: true, text: MSG_TAG + ': مش بيتقارن بالبنشمارك' });
      return;
    }
    const spend = num_(a.raw.spend), worse = [];
    if (spend >= 300 && base) TODAY.METRICS.forEach(m => {
      const v = funnelRatio_(a.raw, m), b = funnelRatio_(base, m);
      if (typeof v !== 'number' || typeof b !== 'number' || !(b > 0)) return;
      const w = m[5] ? v / b - 1 : 1 - v / b;
      if (w > ANA.WORSE) worse.push({ name: m[0], w: w, v: v, b: b, nf: m[4] });
    });
    const show = x => x.name + ' ' + (x.nf === 'pct' ? (Math.round(x.v * 1000) / 10) + '% بدل ' + (Math.round(x.b * 1000) / 10) + '%' : anaNum_(x.v, 2) + ' بدل ' + anaNum_(x.b, 2));
    rows.push({ name: a.name, plat: 'META', spend: spend, roas: funnelRatio_(a.raw, TODAY.METRICS[0]), base: base ? funnelRatio_(base, TODAY.METRICS[0]) : '',
      worse: worse, text: spend < 300 ? 'لسه بدري (صرف أقل من 300)' : worse.length ? anaList_(worse.map(show)) : '✅ كله زي البنشمارك أو أحسن' });
    if (!worse.length) return;
    const fixes = [];
    worse.forEach(x => { const t = anaFix_(x.name); if (t && fixes.indexOf(t) < 0) fixes.push(t); });
    anaFind_(out, { id: 'bench|' + a.id, pri: worse.some(x => /ROAS/.test(x.name)) ? 2 : 3, area: 'البنشمارك',
      title: 'النهارده أوحش من البنشمارك في ' + worse.length + ' متريك في الحساب:', item: a.name, short: worse.map(x => x.name).join('، '), detail: anaList_(worse.map(show)),
      action: anaList_(fixes.slice(0, 2)), impact: spend * Math.min(worse[0].w, 1), scope: a.name });
  });
  // TikTok: today against the 7 days before, from Ads Raw.
  const tt = Object.keys(F.accPlat).filter(id => F.accPlat[id] === 'TIKTOK'), raw = {};
  recentRows_(APP.T.ADS, ADS_HEADERS.length, 1, asKey_, shiftKey_(today, -7)).forEach(a => {
    if (a[1] !== 'TIKTOK') return;
    const key = String(a[2]) + '|' + (asKey_(a[0]) === today ? 'now' : 'week'), t = raw[key] = raw[key] || { spend: 0, imp: 0, clicks: 0, buys: 0 };
    t.spend += num_(a[10]); t.imp += num_(a[11]); t.clicks += num_(a[12]); t.buys += num_(a[13]);
  });
  const M = [['CPM', t => (t.imp > 0 ? t.spend / t.imp * 1000 : null), true, 'money'], ['CTR', t => (t.imp > 0 ? t.clicks / t.imp : null), false, 'pct'],
    ['CPC', t => (t.clicks > 0 ? t.spend / t.clicks : null), true, 'money'], ['CPP (المنصة)', t => (t.buys > 0 ? t.spend / t.buys : null), true, 'money']];
  tt.forEach(id => {
    const now = raw[id + '|now'], wk = raw[id + '|week'];
    if (!now || !wk) return;
    const worse = [];
    if (now.spend >= 300) M.forEach(m => {
      const v = m[1](now), b = m[1](wk);
      if (v === null || b === null || !(b > 0)) return;
      const w = m[2] ? v / b - 1 : 1 - v / b;
      if (w > ANA.DROP) worse.push({ name: m[0], w: w, v: v, b: b, nf: m[3] });
    });
    const show = x => x.name + ' ' + (x.nf === 'pct' ? (Math.round(x.v * 1000) / 10) + '% بدل ' + (Math.round(x.b * 1000) / 10) + '%' : anaNum_(x.v, 2) + ' بدل ' + anaNum_(x.b, 2));
    const t = anaSum_(F.acc[id], today, today);
    rows.push({ name: F.accName[id], plat: 'TIKTOK', spend: now.spend, roas: anaRoas_(t), base: '', worse: worse,
      text: now.spend < 300 ? 'لسه بدري (صرف أقل من 300)' : worse.length ? anaList_(worse.map(show)) : '✅ زي آخر 7 أيام أو أحسن' });
    if (worse.length) anaFind_(out, { id: 'bench-tt|' + id, pri: 3, area: 'البنشمارك', title: 'النهارده أوحش من آخر 7 أيام في ' + worse.length + ' متريك في حساب TikTok:', item: F.accName[id], short: worse.map(x => x.name).join('، '),
      detail: anaList_(worse.map(show)), action: /CPP/.test(worse[0].name) ? 'الكرييتيفات بتجيب كليكات من غير شرا: جرّب كرييتيف أو عرض جديد' : 'الكرييتيف تعب أو الجمهور غلي: نزّل فيديوهات جديدة',
      impact: now.spend * Math.min(worse[0].w, 1), scope: F.accName[id] });
  });
  return { find: out, rows: rows };
}

/* ---------- 4) Funnel: last 3 full days against the 14 before (the funnel's Meta reads, kept by anaKeepFunnel_) ---------- */

/* Called by refreshFunnel_ with the funnel's reads: each Meta account's last 21 days, kept for this tab. */
function anaKeepFunnel_(data) {
  const keys = ['spend', 'impressions', 'clicks', 'linkClicks', 'outboundClicks', 'videoPlays3s', 'thruPlays', 'contentViews', 'addsToCart', 'checkouts', 'purchases', 'purchaseValue'];
  propSetBig_(ANA.FUNNEL_KEY, JSON.stringify({ day: todayKey_(), keys: keys, accounts: data.accounts.filter(a => !a.error).map(a => ({ id: a.id, name: a.name,
    days: a.days.slice(0, 21).map(d => [d.date].concat(keys.map(k => Math.round(num_(d.raw[k]) * 100) / 100))) })) }));
}
function anaFunnel_(F) {
  const out = [], rows = [];
  let kept = null;
  try { kept = JSON.parse(propGetBig_(ANA.FUNNEL_KEY) || 'null'); } catch (e) { kept = null; }
  if (!kept) return { find: out, rows: rows, none: true };
  kept.accounts = kept.accounts.filter(a => !F.msg.has(String(a.id))); // messages campaigns: no website funnel
  const y = shiftKey_(F.today, -1), d3 = shiftKey_(F.today, -3), d4 = shiftKey_(F.today, -4), d17 = shiftKey_(F.today, -17);
  const steps = FUNNEL.METRICS.filter(m => m[2] !== 'one' && !/^shop/.test(m[1]) && !/^shop/.test(m[2]));
  const sum = (days, from, to) => {
    const t = {};
    days.forEach(x => { if (x[0] >= from && x[0] <= to) kept.keys.forEach((k, i) => { t[k] = (t[k] || 0) + num_(x[i + 1]); }); });
    return t;
  };
  const all = { id: 'all', name: ANA.BIZ, days: [] }, byDay = {};
  kept.accounts.forEach(a => a.days.forEach(x => { const t = byDay[x[0]] = byDay[x[0]] || [x[0]].concat(kept.keys.map(() => 0)); x.slice(1).forEach((v, i) => { t[i + 1] += num_(v); }); }));
  all.days = Object.keys(byDay).map(k => byDay[k]);
  (kept.accounts.length > 1 ? [all] : []).concat(kept.accounts).forEach(a => {
    const now = sum(a.days, d3, y), before = sum(a.days, d17, d4), worse = [], better = [];
    if (!(num_(now.spend) >= ANA.MIN_SPEND) || !(num_(before.spend) > 0)) return;
    steps.forEach(m => {
      const v = funnelValue_(now, m), b = funnelValue_(before, m);
      if (typeof v !== 'number' || typeof b !== 'number' || !(b > 0) || (m[7] && (v > 1 || b > 1))) return;
      const w = m[5] ? v / b - 1 : 1 - v / b;
      if (w >= ANA.DROP) worse.push({ name: m[0], w: w, v: v, b: b, nf: m[4] });
      if (w <= -ANA.DROP) better.push({ name: m[0], w: -w, v: v, b: b, nf: m[4] });
    });
    const show = x => x.name + ' ' + (/%/.test(x.nf) ? (Math.round(x.v * 1000) / 10) + '% بدل ' + (Math.round(x.b * 1000) / 10) + '%' : anaNum_(x.v, 2) + ' بدل ' + anaNum_(x.b, 2));
    const cvr = FUNNEL.METRICS.find(m => m[0] === 'CVR');
    rows.push({ name: a.name, spend: now.spend, cvr: funnelValue_(now, cvr), cvrB: funnelValue_(before, cvr), worse: worse, better: better });
    if (worse.length) {
      const fixes = [];
      worse.forEach(x => { const t = anaFix_(x.name); if (t && fixes.indexOf(t) < 0) fixes.push(t); });
      anaFind_(out, { id: 'funnel|' + a.id, pri: worse.some(x => /CVR|Pur\/Chk|Chk\/ATC|ATC\/CV/.test(x.name)) ? 2 : 3, area: 'الفانل',
        title: worse.length + ' خطوة في الفانل وقعت في آخر 3 أيام' + (a.id === 'all' ? ' (البيزنس كله)' : ' في الحساب:'), item: a.id === 'all' ? '' : a.name,
        short: worse.map(x => x.name).join('، '), detail: anaList_(worse.map(show)) + '\n(قدام الـ 14 يوم اللي قبلها)',
        action: anaList_(fixes.slice(0, 2)), impact: num_(now.spend) * Math.min(worse[0].w, 1), scope: a.id === 'all' ? ANA.BIZ : a.name });
    }
    if (better.length && !worse.length) anaFind_(out, { id: 'funnel-up|' + a.id, kind: 'good', pri: 4, area: 'الفانل',
      title: better.length + ' خطوة في الفانل اتحسنت في آخر 3 أيام' + (a.id === 'all' ? ' (البيزنس كله)' : ' في الحساب:'), item: a.id === 'all' ? '' : a.name,
      short: better.map(x => x.name).join('، '), detail: anaList_(better.map(show)),
      action: better.some(x => /CTR|Hook|CPC|CPM/.test(x.name)) ? 'الكرييتيفات الجديدة شغالة: اعمل منها أكتر وزوّد عليها' : 'الصفحة أو العرض بيحوّل أحسن: زوّد الصرف على نفس المنتجات',
      impact: num_(now.spend) * Math.min(better[0].w, 1), scope: a.id === 'all' ? ANA.BIZ : a.name });
  });
  return { find: out, rows: rows, day: kept.day };
}

/* ---------- 5) Campaigns: the Meta Campaigns tab's decisions ---------- */

function anaCampaigns_(F, ctx) {
  const out = [];
  (ctx.mc || []).forEach(c => {
    if (F.msg.has(String(c.acc))) return;
    const v = c.verdict || {}, s3 = c.w && c.w[3] ? c.w[3] : mcZero_(), r = s3.spend > 0 ? s3.revenue / s3.spend : null, acc = F.accName[c.acc] || c.acc;
    const nums = anaList_(['صرف 3 أيام ' + anaMoney_(s3.spend) + ' و ' + s3.orders + ' أوردر', r !== null ? 'رؤاس ' + anaNum_(r, 2) : '',
      c.target && c.target.v ? 'التعادل ' + anaNum_(c.target.v, 2) : '', v.reason]);
    const base = { scope: c.name, item: c.name + ' (' + acc + ')', impact: s3.spend, detail: nums,
      short: 'صرف 3 أيام ' + anaMoney_(s3.spend) + (r !== null ? '، رؤاس ' + anaNum_(r, 2) : '') + (c.target && c.target.v ? '، التعادل ' + anaNum_(c.target.v, 2) : '') };
    if (v.code === '🔴' && c.active) anaFind_(out, Object.assign(base, { id: 'camp-stop|' + c.id, pri: 1, area: 'الكامبينات', title: 'كامبين شغالة تحت التعادل:', action: 'وقّف الكامبين دي:' }));
    if (v.code === '🟠') anaFind_(out, Object.assign(base, { id: 'camp-drop|' + c.id, pri: 2, area: 'الكامبينات', title: 'كامبين كانت كويسة ونزلت تحت التعادل' + (v.metric ? ' (' + v.metric + ')' : '') + ':',
      action: ((v.reason.split('←')[1] || '').trim() || 'قلل ميزانيتها وراقب يومين، ولو مارجعتش وقّفها') + ':' }));
    if (v.code === '🟢') anaFind_(out, Object.assign(base, { id: 'camp-scale|' + c.id, kind: 'good', pri: 4, area: 'الكامبينات', title: 'كامبين كسبانة فوق التعادل:', action: 'زوّد ميزانيتها 20% وراقب يومين:' }));
    if (v.code === '🔁') anaFind_(out, Object.assign(base, { id: 'camp-back|' + c.id, kind: 'good', pri: 4, area: 'الكامبينات', title: 'كامبين واقفة وكانت كويسة:',
      impact: Math.max(c.w[7].spend, c.w[14].spend) / 3, action: 'رجّعها بميزانية صغيرة وراقب يومين:' }));
  });
  return { find: out };
}

/* ---------- 6) Stock: colors that ran out or run out soon and sell ---------- */

function anaStock_(F) {
  const out = [], rows = [], vs = variantStock_(), V = SHOP_ORDERS.HEADERS.indexOf('Variants'), sh = ss_().getSheetByName(SHOP_ORDERS.TAB);
  if (!Object.keys(vs).length || !sh || sh.getMaxColumns() <= V) return { find: out, rows: rows, none: true };
  const d7 = shiftKey_(F.today, -7), d30 = shiftKey_(F.today, -30), y = shiftKey_(F.today, -1), sold = {};
  rawRows_(SHOP_ORDERS.TAB, SHOP_ORDERS.HEADERS.length).forEach(r => {
    const d = F.okIds[String(r[0])];
    if (!d || d < d30 || d > y) return;
    String(r[V] || '').split(' | ').forEach(x => {
      const m = x.trim().match(/^(\d+) x(\d+)$/);
      if (!m) return;
      const t = sold[m[1]] = sold[m[1]] || { w: 0, m: 0 };
      t.m += Number(m[2]);
      if (d >= d7) t.w += Number(m[2]);
    });
  });
  const active = activeMap_(), price = {};
  products_().forEach(p => { price[p.name] = p.price; });
  Object.keys(vs).forEach(name => {
    if (vs[name].length < 2) return;
    const list = vs[name].map(v => {
      const s = sold[v.id] || { w: 0, m: 0 }, per = s.w > 0 ? s.w / 7 : s.m / 30;
      const days = v.stock <= 0 ? 0 : per > 0 ? v.stock / per : Infinity;
      return { title: v.title || 'من غير اسم', stock: v.stock, w: s.w, m: s.m, per: per, days: days, need: Math.max(0, Math.ceil(per * 30 - v.stock)) };
    }).filter(v => v.m >= ANA.STOCK_COLOR && v.days <= COVER.RED).sort((a, b) => (b.m - a.m) || (a.days - b.days));
    if (!list.length) return;
    const ads = active[name] || 0, m = list.reduce((s, v) => s + v.m, 0);
    if (!(ads > 0) && m < ANA.STOCK_NO_ADS) return; // no ads and little demand: not a priority
    rows.push({ name: name, ads: ads, list: list, m: m });
  });
  rows.sort((a, b) => (b.ads > 0) - (a.ads > 0) || b.m - a.m);
  rows.splice(ANA.STOCK_ROWS);
  // An action only for products with ads running and real demand on the colors running out: the 5 most wanted.
  rows.filter(p => p.ads > 0 && p.m >= ANA.STOCK_ACT).slice(0, 5).forEach(p => {
    const name = p.name, list = p.list, ads = p.ads, m = p.m, gone = list.filter(v => v.days === 0);
    anaFind_(out, { id: 'stock|' + name, pri: gone.some(v => v.m >= 10) ? 1 : 2, area: 'الستوك',
      item: name, short: list.slice(0, 3).map(v => v.title + ': ' + v.need).join('، '),
      title: (gone.length ? gone.length + ' لون خلص' : '') + (gone.length && list.length > gone.length ? ' و ' : '') +
        (list.length > gone.length ? (list.length - gone.length) + ' لون قرّب يخلص' : '') + (ads > 0 ? '، وعليه ' + ads + ' إعلان شغال' : '') + ':',
      detail: anaList_(list.slice(0, 5).map(v => v.title + ': ' + (v.days === 0 ? 'نفد' : 'يكفي ' + Math.floor(v.days) + ' يوم') + '، اتباع ' + v.m + ' في 30 يوم')),
      action: 'اطلب ستوك بالترتيب ده:', more: anaList_(list.slice(0, 5).map(v => v.title + ': ' + v.need + ' قطعة')) +
        (ads > 0 && gone.length ? '\nولحد ما يوصل، شيل الألوان الخلصانة من الإعلانات' : ''),
      impact: m * (price[name] || 100) / 30 * 7, metric: 'الأوردرات في اليوم', scope: name });
  });
  return { find: out, rows: rows };
}

/* ---------- 7) Cancellation ---------- */

function anaCancelPart_(F, ctx) {
  const out = [], t = F.today, y = shiftKey_(t, -1), d7 = shiftKey_(t, -7), d8 = shiftKey_(t, -8), d14 = shiftKey_(t, -14);
  const lastMonth = shiftKey_(F.month0, -1).slice(0, 8) + '01', sameDay = shiftKey_(lastMonth, Number(t.slice(8, 10)) - 1);
  const lastTo = sameDay.slice(0, 7) === lastMonth.slice(0, 7) ? sameDay : shiftKey_(F.month0, -1);
  const line = (label, days, scope) => {
    const a = anaSum_(days, d7, y), b = anaSum_(days, d14, d8), ca = anaCancel_(a), cb = anaCancel_(b);
    const ra = a.finished > 0 ? a.returned / a.finished : null, rb = b.finished > 0 ? b.returned / b.finished : null;
    return { label: label, scope: scope, a: a, b: b, ca: ca, cb: cb, ra: ra, rb: rb };
  };
  const rows = [line(ANA.BIZ, F.biz, ANA.BIZ)];
  const m = anaSum_(F.biz, F.month0, t), lm = anaSum_(F.biz, lastMonth, lastTo);
  rows.push({ label: 'الشهر ده قدام الشهر اللي فات (لحد نفس اليوم)', scope: ANA.BIZ, a: m, b: lm, ca: anaCancel_(m), cb: anaCancel_(lm),
    ra: m.finished > 0 ? m.returned / m.finished : null, rb: lm.finished > 0 ? lm.returned / lm.finished : null, month: true });
  Object.keys(F.accName).filter(id => !F.msg.has(id) && anaSum_(F.acc[id], d14, y).orders > 0).forEach(id => rows.push(line(F.accName[id], F.acc[id], F.accName[id])));
  const prods = Object.keys(F.items).filter(n => anaSum_(F.items[n], d7, y).decided >= 10).sort((a, b) => anaSum_(F.items[b], d7, y).orders - anaSum_(F.items[a], d7, y).orders).slice(0, 10);
  prods.forEach(n => rows.push(line(n, F.items[n], n)));
  const biz = rows[0];
  if (biz.ca !== null && biz.cb !== null && biz.a.decided >= 20) {
    const up = biz.ca - biz.cb, worst = prods.map(n => rows.find(r => r.label === n)).filter(r => r.ca !== null && r.ca > biz.ca).sort((a, b) => b.ca - a.ca).slice(0, 3);
    if (up >= 0.05 || (biz.cb > 0 && biz.ca / biz.cb - 1 >= 0.25 && up >= 0.03)) anaFind_(out, { id: 'cancel-up', pri: 2, area: 'الإلغاء',
      title: 'الإلغاء زاد: ' + Math.round(biz.ca * 100) + '% آخر 7 أيام (كان ' + Math.round(biz.cb * 100) + '%)', detail: '• ' + biz.a.cancelled + ' أوردر اتلغى من ' + biz.a.decided +
        ' اتحسموا' + (worst.length ? '\nأكتر منتجات بتتلغي:\n' + anaList_(worst.map(r => r.label + ': ' + Math.round(r.ca * 100) + '%')) : ''),
      action: 'راجع التأكيد: سرعة الاتصال بالعميل بعد الأوردر، والسعر والشحن في الفورم' + (worst.length ? '، وصفحة المنتجات اللي إلغاؤها أعلى:' : ''),
      more: worst.length ? anaList_(worst.map(r => r.label)) : '',
      impact: (biz.a.cancelled - biz.cb * biz.a.decided) * (biz.a.revenue / Math.max(biz.a.orders, 1)), metric: 'نسبة الإلغاء' });
    else if (up <= -0.05) anaFind_(out, { id: 'cancel-down', kind: 'good', pri: 4, area: 'الإلغاء', title: 'الإلغاء قل: ' + Math.round(biz.ca * 100) + '% آخر 7 أيام (كان ' + Math.round(biz.cb * 100) + '%)',
      detail: biz.a.cancelled + ' من ' + biz.a.decided, action: 'اللي اتغير في التأكيد أو العرض شغال: كمّل عليه', impact: -up * biz.a.revenue, metric: 'نسبة الإلغاء' });
    prods.forEach(n => {
      const r = rows.find(x => x.label === n);
      if (r.ca !== null && r.a.decided >= 15 && r.ca >= biz.ca * 1.5 && r.ca - biz.ca >= 0.08) anaFind_(out, { id: 'cancel-prod|' + n, pri: 3, area: 'الإلغاء',
        title: 'الإلغاء ' + Math.round(r.ca * 100) + '% (البيزنس ' + Math.round(biz.ca * 100) + '%) في المنتج:', item: n, short: 'الإلغاء ' + Math.round(r.ca * 100) + '%',
        detail: '• ' + r.a.cancelled + ' اتلغى من ' + r.a.decided + ' في آخر 7 أيام',
        action: 'راجع صفحته (الصور زي المنتج؟ السعر؟ العرض؟) واسأل فريق التأكيد العملا بيلغوا ليه:', impact: r.a.cancelled * (r.a.revenue / Math.max(r.a.orders, 1)) / 2, metric: 'نسبة الإلغاء', scope: n });
    });
  }
  // The days that stood out (last 14 full days, statuses known).
  const days = [];
  for (let i = 1; i <= 14; i++) { const d = shiftKey_(t, -i), x = F.biz[d] || anaZero_(); days.push({ d: d, x: x, c: anaCancel_(x), roas: x.spend > 0 && x.finished > 0 ? (x.delRevenue || 0) / x.spend : null }); }
  const avg = anaCancel_(days.reduce((s, x) => anaAdd_(s, x.x), anaZero_()));
  days.forEach(x => {
    x.spike = avg !== null && x.c !== null && x.x.decided >= 10 && x.c >= avg * 1.5 && x.c - avg >= 0.08;
    if (x.spike) anaFind_(out, { id: 'cancel-day|' + x.d, pri: 3, area: 'الإلغاء', item: anaDay_(x.d), short: 'الإلغاء ' + Math.round(x.c * 100) + '%', title: 'الإلغاء ' + Math.round(x.c * 100) + '% (متوسط 14 يوم ' + Math.round(avg * 100) + '%) يوم:',
      detail: '• ' + x.x.cancelled + ' اتلغى من ' + x.x.decided, action: 'شوف اليوم ده: عرض أو كامبين جديدة جابت أوردرات مش جد؟ أو مشكلة في التأكيد؟', impact: x.x.cancelled * 100, metric: 'نسبة الإلغاء' });
  });
  return { find: out, rows: rows, days: days, avg: avg };
}

/* ---------- 8) Duplication (last 7 days) ---------- */

function anaDup_(F, ctx) {
  const out = [], rows = [], data = dupData_(shiftKey_(F.today, -6), F.today);
  ['META', 'TIKTOK'].forEach(p => (data[p] ? data[p].camps : []).forEach(c => {
    if (F.msg.has(String(c.acc))) return;
    const s = c.sum, shop = s.utm + s.direct, gap = s.pixel - shop, dup = shop > 0 ? gap / shop : null;
    if (!(s.spend >= ANA.DUP_SPEND) || !(s.pixel >= 5) || gap < ANA.DUP_MIN || (dup !== null && dup < ANA.DUP)) return;
    const acc = F.accName[c.acc] || (p === 'TIKTOK' ? 'TikTok' : c.acc), cppP = s.spend / s.pixel, cppS = shop > 0 ? s.spend / shop : null;
    rows.push({ name: c.name, acc: acc, plat: p, s: s, shop: shop, dup: dup, cppP: cppP, cppS: cppS, on: c.on });
    anaFind_(out, { id: 'dup|' + c.id, pri: c.on ? 2 : 3, area: 'الدوبليكيشن',
      title: 'المنصة بتعد أوردرات أكتر من شوبيفاي' + (dup !== null ? ' بـ ' + Math.round(dup * 100) + '%' : '') + ' في الكامبين:', item: c.name + ' (' + acc + ')',
      short: 'المنصة ' + Math.round(s.pixel) + ' وشوبيفاي ' + Math.round(shop * 10) / 10,
      detail: anaList_(['أوردرات المنصة ' + Math.round(s.pixel) + ' وشوبيفاي ' + Math.round(shop * 10) / 10 + ' في آخر 7 أيام', 'الصرف ' + anaMoney_(s.spend),
        'CPP المنصة ' + anaMoney_(cppP), 'CPP الحقيقي ' + (cppS ? anaMoney_(cppS) : '—')]),
      action: 'احكم عليها بأوردرات شوبيفاي مش المنصة (CPP الحقيقي ' + (cppS ? anaMoney_(cppS) : 'مالوش أوردرات') + ')، ولو تحت التعادل وقّفها أو قلل ميزانيتها:',
      impact: s.spend * Math.min(gap / Math.max(s.pixel, 1), 1), scope: c.name });
  }));
  rows.sort((a, b) => b.s.spend - a.s.spend);
  return { find: out, rows: rows, all: data };
}

/* ---------- 9) Shopify: today against yesterday until the same hour ---------- */

function anaShopify_(F) {
  const out = [], m = shopTabCards_();
  if (!m || !m.cards) return { find: out, none: true };
  const c = {};
  m.cards.forEach(x => { c[x.key] = x; });
  const ch = (k, i) => { const x = c[k]; if (!x) return null; const a = x.values[0], b = x.values[i || 1]; return typeof a === 'number' && typeof b === 'number' && b > 0 ? a / b - 1 : null; };
  const val = (k, i) => (c[k] ? c[k].values[i || 0] : null), ses = val('sessions'), ord = val('orders', 1);
  const enough = typeof ses === 'number' && ses >= SHOPTAB.MIN_SESSIONS && typeof ord === 'number' && ord >= SHOPTAB.MIN_ORDERS;
  if (!enough) return { find: out, m: m, early: true };
  const sp = ch('spend'), s = ch('sessions'), o = ch('orders'), cr = ch('cr'), b = ch('bounce'), g = ch('gross'), aov = ch('aov'), p = v => anaPct_(v);
  const at = ' (لحد ' + m.at + ' قدام إمبارح لحد نفس الساعة)', spend = num_(val('spend'));
  if (sp !== null && s !== null && sp >= 0.1 && s <= -0.1) anaFind_(out, { id: 'shop-spend-ses', pri: 2, area: 'شوبيفاي', title: 'الصرف زاد ' + p(sp) + ' بس الزيارات قلت ' + p(s) + at,
    detail: 'الكليكات مش بتوصل الموقع زي الأول', action: 'شوف الـ CPM والـ CTR في البنشمارك تحت، وجرّب الموقع من الموبايل (ممكن يكون تقيل أو واقع)', impact: spend * Math.min(sp - s, 1) });
  if (sp !== null && o !== null && sp >= 0.1 && o <= -0.1) anaFind_(out, { id: 'shop-spend-ord', pri: 1, area: 'شوبيفاي', title: 'الصرف زاد ' + p(sp) + ' والأوردرات قلت ' + p(o) + at,
    detail: 'كل جنيه زيادة مش جايب أوردرات', action: 'شوف الـ 3 ساعات تحت: أنهي كامبين بتصرف من غير أوردرات؟ ولو الزيارات زي ما هي يبقى المشكلة في الموقع أو الستوك أو الفورم', impact: spend * Math.min(sp - o, 1) });
  if (cr !== null && cr <= -0.15) anaFind_(out, { id: 'shop-cr', pri: 2, area: 'شوبيفاي', title: 'التحويل وقع ' + p(cr) + at,
    detail: (m.diag && m.diag[0] && m.diag[0][1] ? m.diag[0][1][0] : ''), action: 'جرّب تطلب أوردر بنفسك، وشوف المنتجات الخلصانة اللي عليها زيارات في تاب Shopify', impact: spend * Math.min(-cr, 1) });
  if (b !== null && b >= 0.15) anaFind_(out, { id: 'shop-bounce', pri: 3, area: 'شوبيفاي', title: 'الـ Bounce rate زاد ' + p(b) + at,
    detail: 'ناس أكتر بتخرج من أول صفحة', action: 'الإعلان بيوعد بحاجة مش في الصفحة، أو الصفحة بطيئة: راجع الكرييتيف الجديد وسرعة الصفحة', impact: spend * Math.min(b, 1) / 2 });
  if (g !== null && sp !== null && g <= -0.1 && sp >= 0.05) anaFind_(out, { id: 'shop-gross', pri: 2, area: 'شوبيفاي', title: 'Gross sales قلت ' + p(g) + ' مع إن الصرف زاد ' + p(sp) + at,
    detail: '', action: 'المبيعات مش ماشية مع الصرف: قلل الميزانيات الزيادة لحد ما تعرف السبب', impact: spend * Math.min(sp - g, 1) });
  if (aov !== null && aov <= -0.1) anaFind_(out, { id: 'shop-aov', pri: 3, area: 'شوبيفاي', title: 'متوسط الأوردر قل ' + p(aov) + at, detail: m.diag && m.diag[0] && m.diag[0][1] ? m.diag[0][1][1] : '',
    action: 'فعّل الباندل والأبسيل، وشوف لو منتج رخيص بقى بيتباع أكتر', impact: spend * Math.min(-aov, 1) / 2 });
  if (o !== null && sp !== null && o - Math.max(sp, 0) >= 0.1 && o > 0) anaFind_(out, { id: 'shop-good', kind: 'good', pri: 4, area: 'شوبيفاي',
    title: 'الأوردرات زادت ' + p(o) + ' والصرف ' + p(sp) + ' بس' + at, detail: '', action: 'اليوم ماشي كويس: لو الستوك كفاية زوّد على الكامبينات الكسبانة', impact: spend * (o - sp) });
  if (cr !== null && cr >= 0.15) anaFind_(out, { id: 'shop-cr-up', kind: 'good', pri: 4, area: 'شوبيفاي', title: 'التحويل زاد ' + p(cr) + at, detail: '',
    action: 'الموقع والعرض بيحوّلوا أحسن: وقت مناسب تزوّد الصرف', impact: spend * cr });
  return { find: out, m: m };
}

/* ---------- 10) Products, governorates and the catalog ---------- */

function anaProducts_(F, ctx) {
  const out = [], t = F.today, y = shiftKey_(t, -1), d7 = shiftKey_(t, -7), d8 = shiftKey_(t, -8), d14 = shiftKey_(t, -14), be = ctx.be;
  const active = activeMap_(), stock = stockByName_().by;
  const special = [APP.CATALOG, APP.MULTI, APP.UNMAPPED, APP.UNKNOWN_PRODUCT, APP.META_NO_AD, ''];
  const rows = Object.keys(F.items).filter(n => special.indexOf(n) < 0).map(n => {
    const a = anaSum_(F.items[n], d7, y), b = anaSum_(F.items[n], d14, d8), p = anaSum_(F.prod[n], d7, y);
    const per = a.pieces / 7, st = stock[n];
    return { name: n, a: a.pieces, b: b.pieces, ch: b.pieces > 0 ? a.pieces / b.pieces - 1 : null, spend: p.spend, roas: anaRoas_(p), ads: active[n] || 0,
      stock: st, days: st === undefined ? null : st <= 0 ? 0 : per > 0 ? st / per : null };
  }).filter(r => r.a > 0 || r.spend > 0).sort((a, b) => b.a - a.a);
  rows.forEach(r => {
    const low = r.days !== null && r.days < 15 ? 'بس الستوك ' + (r.days === 0 ? 'خلص' : 'يكفي ' + Math.floor(r.days) + ' يوم') + '، اطلب الأول' : '';
    if (r.a >= 15 && r.ch !== null && r.ch >= 0.3) anaFind_(out, { id: 'prod-up|' + r.name, kind: 'good', pri: 4, area: 'المنتجات',
      title: 'منتج بيبيع أكتر: ' + r.a + ' قطعة آخر 7 أيام (' + anaPct_(r.ch) + '):', item: r.name, short: r.a + ' قطعة (' + anaPct_(r.ch) + ')', detail: anaList_(['كان ' + r.b + ' قطعة في الـ 7 أيام اللي قبلها', r.roas !== null ? 'Shopify ROAS ' + anaNum_(r.roas, 2) : '']),
      action: (r.ads > 0 ? 'ركّز عليه: زوّد الصرف على إعلاناته واعمله كرييتيفات جديدة:' : 'مفيش عليه إعلانات شغالة، جرّب كامبين عليه:'), more: low, impact: r.a * 50, metric: 'الأوردرات في اليوم', scope: r.name });
    else if (r.spend >= 1000 && be && r.roas !== null && r.roas >= be * 1.3) anaFind_(out, { id: 'prod-roas|' + r.name, kind: 'good', pri: 4, area: 'المنتجات',
      title: 'منتج رؤاسه ' + anaNum_(r.roas, 2) + ' آخر 7 أيام (التعادل ' + anaNum_(be, 2) + '):', item: r.name, short: 'رؤاس ' + anaNum_(r.roas, 2),
      detail: anaList_(['صرف ' + anaMoney_(r.spend), r.a + ' قطعة']), action: 'زوّد الصرف عليه 20%:', more: low, impact: r.spend * (r.roas / be - 1), scope: r.name });
    if (r.spend >= 2000 && be && r.roas !== null && r.roas < be * 0.8) anaFind_(out, { id: 'prod-low|' + r.name, pri: 2, area: 'المنتجات',
      title: 'منتج صرف كتير ورؤاسه تحت التعادل آخر 7 أيام:', item: r.name, short: 'صرف ' + anaMoney_(r.spend) + '، رؤاس ' + anaNum_(r.roas, 2),
      detail: anaList_(['صرف ' + anaMoney_(r.spend), 'رؤاس ' + anaNum_(r.roas, 2) + ' والتعادل ' + anaNum_(be, 2), r.a + ' قطعة اتباعت']),
      action: 'قلل الصرف عليه أو غيّر العرض (سعر، باندل)، ووقّف الإعلانات اللي تحت التعادل عليه:', impact: r.spend * (1 - r.roas / be), scope: r.name });
    if (r.b >= 20 && r.ch !== null && r.ch <= -0.3) anaFind_(out, { id: 'prod-down|' + r.name, pri: 3, area: 'المنتجات',
      title: 'منتج بيبيع أقل: ' + r.a + ' قطعة آخر 7 أيام (' + anaPct_(r.ch) + '):', item: r.name, short: r.a + ' قطعة (' + anaPct_(r.ch) + ')',
      detail: anaList_(['كان ' + r.b + ' قطعة', r.days === 0 ? 'الستوك خلص' : '']),
      action: r.days === 0 ? 'اطلب ستوك:' : r.ads > 0 ? 'الكرييتيفات بتاعته تعبت، نزّل كرييتيفات جديدة:' : 'مفيش إعلانات شغالة عليه (كان بيبيع بالإعلانات؟)، رجّعها:', impact: (r.b - r.a) * 50, metric: 'الأوردرات في اليوم', scope: r.name });
  });
  return { find: out, rows: rows.slice(0, 12) };
}
function anaGov_(F) {
  const out = [], names = Object.keys(F.gov), tot = names.reduce((s, g) => anaAdd_(s, F.gov[g]), anaZero_());
  const cAvg = anaCancel_(tot), dAvg = tot.finished > 0 ? tot.delivered / tot.finished : null;
  const rows = names.filter(g => g !== GOV.UNKNOWN).map(g => {
    const x = F.gov[g];
    return { name: g, x: x, share: tot.orders > 0 ? x.orders / tot.orders : null, c: anaCancel_(x), del: x.finished > 0 ? x.delivered / x.finished : null };
  }).sort((a, b) => b.x.orders - a.x.orders);
  rows.forEach(r => {
    r.verdict = '';
    if (r.x.orders < 30 || cAvg === null || dAvg === null || r.c === null || r.del === null) return;
    if (r.del >= dAvg + 0.05 && r.c <= cAvg) {
      r.verdict = '🟢 فرصة';
      anaFind_(out, { id: 'gov-good|' + r.name, kind: 'good', pri: 4, area: 'المحافظات', item: r.name, short: 'توصيل ' + Math.round(r.del * 100) + '% وإلغاء ' + Math.round(r.c * 100) + '%', title: 'محافظة التوصيل فيها ' + Math.round(r.del * 100) + '% والإلغاء ' + Math.round(r.c * 100) + '%:',
        detail: anaList_(['المتوسط: توصيل ' + Math.round(dAvg * 100) + '% وإلغاء ' + Math.round(cAvg * 100) + '%', r.x.orders + ' أوردر في 30 يوم']),
        action: 'جرّب كامبين مستهدفة عليها أو زوّد الميزانية فيها:', impact: r.x.orders * 20 });
    } else if (r.c >= cAvg + 0.1 || r.del <= dAvg - 0.1) {
      r.verdict = '🔴 ضعيفة';
      anaFind_(out, { id: 'gov-bad|' + r.name, pri: 3, area: 'المحافظات', item: r.name, short: r.c >= cAvg + 0.1 ? 'الإلغاء ' + Math.round(r.c * 100) + '%' : 'التوصيل ' + Math.round(r.del * 100) + '%',
        title: 'محافظة ' + (r.c >= cAvg + 0.1 ? 'الإلغاء فيها ' + Math.round(r.c * 100) + '%' : 'التوصيل فيها ' + Math.round(r.del * 100) + '% بس') + ':',
        detail: anaList_(['المتوسط: إلغاء ' + Math.round(cAvg * 100) + '% وتوصيل ' + Math.round(dAvg * 100) + '%', r.x.orders + ' أوردر في 30 يوم']),
        action: 'استبعدها من الاستهداف أو خلي التأكيد فيها أقوى:', impact: r.x.orders * 20 });
    }
  });
  return { find: out, rows: rows, cAvg: cAvg, dAvg: dAvg, tot: tot };
}
function anaCatalog_(F, ctx) {
  const out = [], names = Object.keys(Object.assign({}, F.cat, F.catSpend)), be = ctx.be;
  const all = names.reduce((s, n) => ({ orders: s.orders + (F.cat[n] ? F.cat[n].orders : 0), revenue: s.revenue + (F.cat[n] ? F.cat[n].revenue : 0), spend: s.spend + (F.catSpend[n] || 0) }), { orders: 0, revenue: 0, spend: 0 });
  const rows = names.map(n => ({ name: n, orders: F.cat[n] ? F.cat[n].orders : 0, revenue: F.cat[n] ? F.cat[n].revenue : 0, spend: F.catSpend[n] || 0 }))
    .map(r => Object.assign(r, { roas: r.spend > 0 ? r.revenue / r.spend : null, share: all.orders > 0 ? r.orders / all.orders : null }))
    .filter(r => r.orders > 0 || r.spend >= 100).sort((a, b) => (b.orders - a.orders) || (b.spend - a.spend));
  const top = rows.filter(r => r.orders >= 3 && (!be || r.roas === null || r.roas >= be)).slice(0, 3);
  if (top.length) anaFind_(out, { id: 'cat-top', kind: 'good', pri: 4, area: 'الكتالوج', title: 'الكتالوج بيبيع المنتجات دي أكتر (آخر 14 يوم):',
    detail: top.map(r => '• ' + r.name + '\n     ' + r.orders + ' أوردر' + (r.roas !== null ? '، رؤاس ' + anaNum_(r.roas, 2) : '')).join('\n'),
    action: 'اعمل Product set بالمنتجات دي وكامبين كتالوج عليها، أو اعملهم إعلانات خاصة بيهم:', more: anaList_(top.map(r => r.name)), impact: top.reduce((s, r) => s + r.revenue, 0) / 14, scope: top[0].name });
  if (be && all.spend >= 2000 && all.revenue / all.spend < be * 0.8) anaFind_(out, { id: 'cat-low', pri: 2, area: 'الكتالوج',
    title: 'إعلانات الكتالوج رؤاسها ' + anaNum_(all.revenue / all.spend, 2) + ' آخر 14 يوم (التعادل ' + anaNum_(be, 2) + ')', detail: 'صرف ' + anaMoney_(all.spend) + ' و ' + all.orders + ' أوردر',
    action: 'قلل ميزانية الكتالوج، أو حطه على المنتجات اللي بتبيع منه بس', impact: all.spend * (1 - all.revenue / all.spend / be) });
  return { find: out, rows: rows.slice(0, 12), all: all };
}

/* ---------- Before / after ---------- */

/* The days of a scope: the business, an account, a product or a campaign (by its name). null when it isn't one. */
function anaScopeDays_(F, scope) {
  const s = String(scope || '').trim();
  if (!s || s === ANA.BIZ) return F.biz;
  const n = norm_(s), acc = Object.keys(F.accName).find(id => norm_(F.accName[id]) === n);
  if (acc) return F.acc[acc] || {};
  const prod = Object.keys(F.prod).concat(Object.keys(F.items)).find(p => norm_(p) === n);
  if (prod) {
    const out = {}, a = F.prod[prod] || {}, b = F.items[prod] || {};
    Object.keys(Object.assign({}, a, b)).forEach(d => { out[d] = Object.assign(anaZero_(), a[d] || {}, { cancelled: (b[d] || {}).cancelled || 0, decided: (b[d] || {}).decided || 0 }); });
    return out;
  }
  const camp = Object.keys(F.campName).find(k => norm_(F.campName[k]) === n);
  return camp ? F.camp[camp] || {} : null;
}
/* A metric over [from..to] of a scope's days, or null. */
function anaMetric_(days, metric, from, to) {
  if (!days || to < from) return null;
  const t = anaSum_(days, from, to), n = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
  if (metric === 'CPP') return t.orders > 0 ? t.spend / t.orders : null;
  if (metric === 'الأوردرات في اليوم') return t.orders / n;
  if (metric === 'الصرف في اليوم') return t.spend / n;
  if (metric === 'نسبة الإلغاء') return anaCancel_(t);
  return anaRoas_(t);
}
/* Before = the 7 days before the day it was done, after = from that day until yesterday (7 days at most). */
function anaBeforeAfter_(F, x) {
  const d = anaDate_(x.done, F.today), metric = ANA.METRICS.indexOf(x.metric) >= 0 ? x.metric : ANA.METRICS[0];
  if (!d) return { before: '', after: x.done ? 'اكتب التاريخ كده: ' + F.today : '', change: '' };
  const days = anaScopeDays_(F, x.scope);
  if (!days) return { before: '', after: 'مش لاقي "' + x.scope + '"', change: '' };
  const y = shiftKey_(F.today, -1), to = shiftKey_(d, 6) < y ? shiftKey_(d, 6) : y;
  const b = anaMetric_(days, metric, shiftKey_(d, -7), shiftKey_(d, -1)), a = d > y ? null : anaMetric_(days, metric, d, to);
  const better = metric === 'CPP' || metric === 'نسبة الإلغاء' ? -1 : metric === 'الصرف في اليوم' ? 0 : 1;
  let change = '', good = null;
  if (typeof a === 'number' && typeof b === 'number') {
    if (metric === 'نسبة الإلغاء') { change = Math.round((a - b) * 1000) / 10 + ' نقطة'; good = better * (a - b) > 0.005 ? true : better * (a - b) < -0.005 ? false : null; }
    else if (b > 0) { const c = a / b - 1; change = anaPct_(c); good = better === 0 ? null : better * c > 0.03 ? true : better * c < -0.03 ? false : null; }
  }
  return { before: b === null ? '—' : b, after: d > y ? 'من بكره' : a === null ? '—' : a, change: change, good: good, metric: metric,
    nf: metric === 'نسبة الإلغاء' ? ANA.PCT : metric === 'Shopify ROAS' ? ANA.RATIO : ANA.MONEY };
}
