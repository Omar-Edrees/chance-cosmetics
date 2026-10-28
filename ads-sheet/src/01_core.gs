/* Locks, timing, dates, normalization, sheet writing. */

let LOCK_DEPTH_ = 0;
/* Apps Script stops a run at 6 minutes. Long loops check this and leave the rest for the next run. */
let DEADLINE_ = 0;
function timeLeft_() { return !DEADLINE_ || Date.now() < DEADLINE_; }
function withLock_(fn, waitMs) {
  if (LOCK_DEPTH_) return fn();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(waitMs || 60000)) throw new Error('في تحديث تاني شغال دلوقتي. استنى دقيقة وجرّب تاني.');
  LOCK_DEPTH_++;
  try { return fn(); } finally { LOCK_DEPTH_--; lock.releaseLock(); }
}
/* For triggers: skip quietly if busy (after waitMs, default 5s); the next run catches up. */
function tryLock_(fn, waitMs) {
  if (LOCK_DEPTH_) return { skipped: false, value: fn() };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(waitMs || 5000)) return { skipped: true };
  LOCK_DEPTH_++;
  try { return { skipped: false, value: fn() }; } finally { LOCK_DEPTH_--; lock.releaseLock(); }
}
function time_(label, fn) {
  const t = Date.now();
  try { return fn(); } finally { console.log('⏱ ' + label + ': ' + ((Date.now() - t) / 1000).toFixed(1) + 's'); }
}

/* Dates are stored as text yyyy-MM-dd so time zones never shift them. */
const DAYKEY_CACHE_ = new Map();
function dayKey_(d) {
  if (!(d instanceof Date) || isNaN(d)) return '';
  const tz = tz_(), bucket = tz + '|' + Math.floor(d.getTime() / 900000);
  let v = DAYKEY_CACHE_.get(bucket);
  if (v === undefined) { v = Utilities.formatDate(d, tz, 'yyyy-MM-dd'); DAYKEY_CACHE_.set(bucket, v); }
  return v;
}
function todayKey_() { return dayKey_(new Date()); }
function shiftKey_(key, days) {
  const p = key.split('-').map(Number);
  return new Date(Date.UTC(p[0], p[1] - 1, p[2] + days)).toISOString().slice(0, 10);
}
function asKey_(v) {
  if (v instanceof Date) return dayKey_(v);
  const s = String(v || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}
function nowText_() { return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm'); }

/* Arabic-aware normalization for matching names, products and UTMs. */
function digits_(v) {
  return String(v === null || v === undefined ? '' : v)
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x6F0));
}
function norm_(v) {
  return digits_(v).toLowerCase()
    .replace(/[​-‏‪-‮⁦-⁩﻿]/g, '')
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .replace(/[|\\\/_\-–—:;,+()[\]{}"'.!?]+/g, ' ').replace(/\s+/g, ' ').trim();
}
/* Whole-token containment: "ab" matches "x ab y", not "xaby". */
function hasToken_(text, token) {
  if (!token) return false;
  return (' ' + text + ' ').indexOf(' ' + token + ' ') >= 0;
}
function phone10_(v) {
  const d = typeof v === 'number' ? String(Math.round(v)) : digits_(v).replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : '';
}
function num_(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }
function round2_(v) { return Math.round(v * 100) / 100; }
function sha_(text) {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(text), Utilities.Charset.UTF_8));
}

function ss_() { return SpreadsheetApp.getActive(); }
function tab_(name) {
  const sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('التاب مش موجود: ' + name + ' — شغّل الإعداد من المنيو.');
  return sh;
}
function ensureTab_(name, headers) {
  let sh = ss_().getSheetByName(name);
  if (!sh) sh = ss_().insertSheet(name);
  if (headers && headers.length) {
    if (sh.getMaxColumns() < headers.length) sh.insertColumnsAfter(sh.getMaxColumns(), headers.length - sh.getMaxColumns());
    const cur = sh.getRange(1, 1, 1, headers.length).getValues()[0];
    if (cur.every(v => v === '' || v === null)) {
      sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold')
        .setBackground('#1f2937').setFontColor('#ffffff').setWrap(true);
      sh.setFrozenRows(1);
    }
  }
  return sh;
}
/* Read all data rows (row 2+) of the first `cols` columns. */
function readRows_(sh, cols) {
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, cols).getValues().filter(r => r.some(v => v !== '' && v !== null));
}
/* Replace all data rows. textCols: 1-based columns forced to text before writing (IDs, dates). */
function writeRows_(sh, rows, cols, textCols) {
  const last = sh.getLastRow();
  if (rows.length + 1 > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), rows.length + 1 - sh.getMaxRows());
  (textCols || []).forEach(c => sh.getRange(2, c, Math.max(rows.length, 1), 1).setNumberFormat('@'));
  if (rows.length) sh.getRange(2, 1, rows.length, cols).setValues(rows);
  if (last > rows.length + 1) sh.getRange(rows.length + 2, 1, last - rows.length - 1, cols).clearContent();
}
function setStatus_(key, msg) { PropertiesService.getDocumentProperties().setProperty('STATUS_' + key, nowText_() + '  ' + msg); }
function getStatus_(key) { return PropertiesService.getDocumentProperties().getProperty('STATUS_' + key) || 'لسه ما اشتغلش'; }
function alert_(msg) { try { SpreadsheetApp.getUi().alert(String(msg)); } catch (e) { console.log(String(msg)); } }
function errText_(e) {
  const t = String(e && e.message ? e.message : e), tok = PropertiesService.getUserProperties().getProperty('META_TOKEN');
  return tok ? t.split(tok).join('[مخفي]') : t;
}
function resetCaches_() { CFG_ = null; PRODUCTS_ = null; KNOWN_PRODUCTS_ = null; }
