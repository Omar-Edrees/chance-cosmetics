/*
 * Tab "المحافظات" (like House of Beauty's Governorates, plus what happened to the orders): store orders by governorate
 * today / this month / the period in B2:B3 (the last 90 days by default), then for the period: cancellation (cancelled
 * before shipping ÷ the orders whose status is known), delivery and return (delivered or returned ÷ the shipments that
 * finished; orders still in shipping aren't counted yet). Orders: every store order but those from an ad account not in
 * the sheet, like Actual ROAS. Governorate: 24_order_gov.gs, else the orders sheet's City / Province column. Status:
 * 19_order_status.gs. The tables sit side by side. Written with the views every 15 minutes, and when B2 / B3 change.
 */
const GOV = {
  UNKNOWN: 'مش معروفة',
  /* Names the orders sheet may carry (Shopify's English names, codes, Arabic) → ORDER_GOVS. */
  ALIASES: {
    'cairo': 'القاهرة', 'c': 'القاهرة', 'helwan': 'القاهرة', 'giza': 'الجيزة', 'gz': 'الجيزة', '6th of october': 'الجيزة',
    'alexandria': 'الإسكندرية', 'alx': 'الإسكندرية', 'dakahlia': 'الدقهلية', 'qalyubia': 'القليوبية', 'al sharqia': 'الشرقية',
    'sharqia': 'الشرقية', 'gharbia': 'الغربية', 'beheira': 'البحيرة', 'monufia': 'المنوفية', 'red sea': 'البحر الأحمر',
    'damietta': 'دمياط', 'minya': 'المنيا', 'port said': 'بورسعيد', 'asyut': 'أسيوط', 'sohag': 'سوهاج', 'ismailia': 'الإسماعيلية',
    'kafr el-sheikh': 'كفر الشيخ', 'suez': 'السويس', 'beni suef': 'بني سويف', 'matrouh': 'مطروح', 'faiyum': 'الفيوم',
    'aswan': 'أسوان', 'south sinai': 'جنوب سيناء', 'qena': 'قنا', 'luxor': 'الأقصر', 'new valley': 'الوادي الجديد',
    'north sinai': 'شمال سيناء'
  }
};

/* The governorate an order went to, or ''. */
function govOf_(o) {
  const g = orderGov_(o[0]);
  if (g) return g;
  const raw = String(o[8] || '').trim(), k = raw.toLowerCase().replace(/\s+/g, ' ');
  if (!raw) return '';
  if (GOV.ALIASES[k]) return GOV.ALIASES[k];
  const plain = s => s.replace(/[أإآ]/g, 'ا').replace(/^محافظة\s*/, '');
  return ORDER_GOVS.find(x => plain(x) === plain(raw)) || '';
}

function writeGovTab_() {
  const sh = ensureTab_(X.GOV), today = todayKey_(), month0 = today.slice(0, 8) + '01';
  sh.getRange('A1:A3').setValues([['المحافظات — اختار الفترة'], ['من'], ['إلى']]);
  sh.getRange('A1').setFontWeight('bold').setFontSize(13);
  sh.getRange('B2:B3').setNumberFormat('@').setBackground('#fff2cc');
  if (!asKey_(sh.getRange('B2').getValue())) sh.getRange('B2').setValue(shiftKey_(today, -89));
  const p = periodFromCells_(sh), by = {}, z = () => ({ day: 0, month: 0, orders: 0, C: 0, R: 0, D: 0, S: 0, P: 0, none: 0 });
  const tot = z();
  funnelShop_(p.from < month0 ? p.from : month0, (o, d) => {
    const g = govOf_(o) || GOV.UNKNOWN, x = by[g] = by[g] || z();
    [x, tot].forEach(t => {
      if (d === today) t.day++;
      if (d >= month0 && d <= today) t.month++;
      if (d < p.from || d > p.to) return;
      t.orders++;
      const s = orderStatus_(o[0]);
      if (s) t[s.code]++; else t.none++;
    });
  });
  const names = Object.keys(by).sort((a, b) => (a === GOV.UNKNOWN) - (b === GOV.UNKNOWN) || (by[b].orders - by[a].orders) || (by[b].month - by[a].month));
  const share = (n, t) => (t > 0 ? n / t : '');
  const rate = (n, t) => (t > 0 ? n / t : '');
  const known = t => t.C + t.R + t.D + t.S, done = t => t.D + t.R;
  const table = f => names.map(n => f(n, by[n])).concat([f('الإجمالي', tot)]);
  const range = ' (' + p.from + ' لـ ' + p.to + ')';
  const blocks = [
    { title: '1) الأوردرات حسب المحافظة — الفترة' + range, headers: ['المحافظة', 'النهارده', '% من النهارده', 'الشهر ده', '% من الشهر', 'الفترة', '% من الفترة'],
      rows: table((n, t) => [n, t.day, share(t.day, tot.day), t.month, share(t.month, tot.month), t.orders, share(t.orders, tot.orders)]), pct: [3, 5, 7] },
    { title: '2) نسبة الإلغاء' + range + ' — اتلغى قبل الشحن ÷ الأوردرات اللي حالتها معروفة (من غير اللي لسه ماتشحنش)',
      headers: ['المحافظة', 'الأوردرات', 'اتلغى قبل الشحن', 'نسبة الإلغاء', 'لسه ماتشحنش', 'حالتها لسه مش عندي'],
      rows: table((n, t) => [n, t.orders, t.C, rate(t.C, known(t)), t.P, t.none]), pct: [4] },
    { title: '3) نسبة التوصيل' + range + ' — اتسلم ÷ (اتسلم + رجع)، واللي لسه في الشحن مش محسوب',
      headers: ['المحافظة', 'اتشحن', 'اتسلم', 'نسبة التسليم', 'لسه في الشحن', 'اتسلم من كل الأوردرات'],
      rows: table((n, t) => [n, t.D + t.R + t.S, t.D, rate(t.D, done(t)), t.S, rate(t.D, known(t))]), pct: [4, 6] },
    { title: '4) نسبة المرتجع' + range + ' — رجع ÷ (اتسلم + رجع)، واللي لسه في الشحن مش محسوب',
      headers: ['المحافظة', 'اتشحن', 'رجع', 'نسبة المرتجع', 'لسه في الشحن', 'رجع من كل الأوردرات'],
      rows: table((n, t) => [n, t.D + t.R + t.S, t.R, rate(t.R, done(t)), t.S, rate(t.R, known(t))]), pct: [4, 6] }
  ];
  sh.getRange('C2:D3').setValues([['حالة الأوردرات وعنوانها من شوبيفاي لحد', ORDER_STATUS_AT],
    ['', 'الأوردر الأحدث بيظهر في جدول 1 بس، ومحافظته "' + GOV.UNKNOWN + '" لحد ما تتقري']]);
  const at = writeSideBlocks_(sh, 5, blocks), first = 7, n = names.length + 1;
  sh.getRange(first, 1, n, at.width).setNumberFormat('#,##0'); // a cell that held a % before never keeps it
  blocks.forEach((b, k) => {
    b.pct.forEach(c => sh.getRange(first, at.cols[k] + c - 1, n, 1).setNumberFormat('0.0%'));
    sh.getRange(first + n - 1, at.cols[k], 1, b.headers.length).setFontWeight('bold').setBackground('#e5e7eb');
  });
  for (let c = 1; c <= at.width; c++) sh.setColumnWidth(c, 110);
  at.cols.forEach((c, k) => { sh.setColumnWidth(c, 150); if (k) sh.setColumnWidth(c - 1, 16); });
  sh.setFrozenRows(6);
}
