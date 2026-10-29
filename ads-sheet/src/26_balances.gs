/*
 * What's left in each Meta ad account, read from Meta every 15 minutes (with the light extras) and shown in Today under
 * the closing table: the available balance of a prepaid account (as Billing shows it), how many days it lasts at the last
 * 3 days' spend, what a card account spent and wasn't charged yet, what's left under the account spending limit, and
 * the account status. Read-only: the same token, no writes to Meta.
 */
const BAL = {
  KEY: 'ACC_BALANCE', FUNDING: 'funding_source_details',
  FIELDS: 'account_status,currency,balance,amount_spent,spend_cap,is_prepay_account',
  STATUS: { 1: 'شغال', 2: 'متوقف', 3: '⚠️ عليه فلوس ماتدفعتش', 7: 'تحت المراجعة', 8: 'مستني تسوية', 9: 'فترة سماح',
    100: 'هيتقفل', 101: 'مقفول', 201: 'شغال', 202: 'مقفول' }
};

/* Reads every Meta account in Accounts and keeps the result in the document properties for Today. */
function refreshBalances_() {
  const acc = {};
  accounts_('META').forEach(a => {
    let p, note = '';
    try { p = metaGet_('act_' + a.id, { fields: BAL.FIELDS + ',' + BAL.FUNDING }); } catch (e) {
      // Some tokens may read the account but not how it's paid: then the balance of a prepaid account is unknown.
      try { p = metaGet_('act_' + a.id, { fields: BAL.FIELDS }); note = 'Meta مابتدّيش رصيد الشحن للتوكن ده'; } catch (e2) { acc[a.id] = { error: errText_(e2) }; return; }
    }
    acc[a.id] = balanceOf_(p, note);
  });
  PropertiesService.getDocumentProperties().setProperty(BAL.KEY, JSON.stringify({ at: nowText_(), acc: acc }));
  return acc;
}

/* One account's reply → {status, prepay, avail, owed, capLeft, note}. Money in Meta's minor unit (1/100). */
function balanceOf_(p, note) {
  const fs = p.funding_source_details || {}, shown = String(fs.display_string || ''), prepay = p.is_prepay_account === true || String(p.is_prepay_account) === 'true';
  // A prepaid account's funding source reads like "Available balance (EGP 1,234.56)" (or in Arabic); a card's has no balance in it.
  const stored = Number(fs.type) === 20 || /balance|رصيد/i.test(shown), m = stored ? digits_(shown).replace(/[,٬]/g, '').replace(/٫/g, '.').match(/-?\d+(?:\.\d+)?/) : null;
  const cap = Number(p.spend_cap || 0);
  return { status: Number(p.account_status) || 0, prepay: prepay, avail: m ? Number(m[0]) : null,
    owed: prepay ? null : Number(p.balance || 0) / 100, capLeft: cap > 0 ? Math.max(cap - Number(p.amount_spent || 0), 0) / 100 : null,
    note: note || (prepay && !m ? 'Meta مابيّنتش الرصيد' : '') };
}

/* Today, left side under the closing table, from row r. Returns the row after it. */
function todayBalances_(g, r, today) {
  const S = TODAY, accs = accounts_('META');
  if (!accs.length) return r;
  let saved = {};
  try { saved = JSON.parse(PropertiesService.getDocumentProperties().getProperty(BAL.KEY) || '{}'); } catch (e) { saved = {}; }
  g.set(r, 1, 'رصيد الأكاونتات من Meta' + (saved.at ? ' — آخر قراية ' + saved.at : ''), { bg: S.DARK, fc: '#ffffff', b: 'bold', al: 'center' });
  g.fill(r, 2, 5, { bg: S.DARK });
  g.merge(r, 1, 1, 6);
  r++;
  ['AD ACCOUNT NAME', 'الرصيد المتاح', 'يكفي كام يوم', 'اتصرف ولسه ماتخصمش من الكارت', 'فاضل على حد الصرف', 'الحالة']
    .forEach((h, i) => g.set(r, 1 + i, h, { bg: S.YELLOW, b: 'bold', al: 'center' }));
  r++;
  // Average spend of the last 3 full days per account (Account Raw).
  const from = shiftKey_(today, -3), to = shiftKey_(today, -1), spend = {};
  rawRows_(APP.T.ACC_RAW, ACC_HEADERS.length).forEach(a => {
    const d = asKey_(a[0]);
    if (a[1] === 'META' && d >= from && d <= to) spend[String(a[2])] = (spend[String(a[2])] || 0) + num_(a[4]);
  });
  accs.forEach(a => {
    const x = (saved.acc || {})[a.id], perDay = (spend[a.id] || 0) / 3, money = { nf: S.MONEY, al: 'right' };
    g.set(r, 1, a.name || a.id, { b: 'bold' });
    if (!x) g.set(r, 2, 'لسه ماتقراش — هيظهر مع التحديث الجاي', { fc: '#6b7280' });
    else if (x.error) g.set(r, 2, '✗ ' + x.error, { fc: '#b91c1c' });
    else {
      const left = x.avail !== null ? x.avail : x.capLeft, days = left === null || !(perDay > 0) ? '' : left / perDay;
      g.set(r, 2, x.avail !== null ? x.avail : x.prepay ? (x.note || '') : 'كارت (بيتخصم لوحده)', x.avail !== null ? money : { fc: '#6b7280' });
      g.set(r, 3, days === '' ? '' : Math.floor(days * 10) / 10, { nf: '0.0', al: 'right', bg: days === '' ? null : days < 1 ? S.RED : days < 3 ? '#fff2cc' : S.GREEN });
      g.set(r, 4, x.owed === null ? '' : x.owed, money);
      g.set(r, 5, x.capLeft === null ? 'مفيش حد' : x.capLeft, x.capLeft === null ? { fc: '#6b7280' } : money);
      g.set(r, 6, BAL.STATUS[x.status] || String(x.status || ''), x.status === 1 || x.status === 201 ? {} : { bg: S.RED, b: 'bold' });
    }
    r++;
  });
  return r;
}
