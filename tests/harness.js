/*
 * بيحمّل كود المشروع في بيئة وهمية بدل Google Sheets،
 * عشان نختبر الحسابات على الكمبيوتر من غير ما نلمس الشيت الحقيقي.
 * أي خدمة جوجل مش متعرفة هنا هتدي خطأ واضح لو الكود حاول يستخدمها.
 */
const vm = require('vm');
const { PROJECTS, sourceFiles } = require('../tools/lib');

function pad(n, w = 2) { return String(n).padStart(w, '0'); }

/* تنسيق التاريخ بمنطقة زمنية حقيقية (زي Utilities.formatDate). */
function formatDate(date, tz, pattern) {
  const parts = {};
  new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).forEach(p => { parts[p.type] = p.value; });
  const map = {
    yyyy: parts.year, MM: parts.month, dd: parts.day, HH: parts.hour, mm: parts.minute, ss: parts.second,
    H: String(Number(parts.hour)), m: String(Number(parts.minute)), d: String(Number(parts.day)),
  };
  map.MMMM = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October',
    'November', 'December'][Number(parts.month) - 1];
  map.MMM = map.MMMM.slice(0, 3);
  return pattern.replace(/MMMM|MMM|yyyy|MM|dd|HH|mm|ss|H|m|d/g, t => map[t]);
}

/* عكس formatDate: نص + منطقة زمنية ← تاريخ. */
function parseDate(text, tz, pattern, DateCtor = Date) {
  const m = String(text).match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) throw new Error('parseDate mock: unsupported ' + text + ' / ' + pattern);
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  const shown = formatDate(new Date(guess), tz, 'yyyy-MM-dd HH:mm:ss').match(/\d+/g).map(Number);
  const offset = Date.UTC(shown[0], shown[1] - 1, shown[2], shown[3], shown[4], shown[5]) - guess;
  return new DateCtor(guess - offset);
}

function missingService(name) {
  return new Proxy({}, { get: (_, key) => { throw new Error('الاختبار حاول يستخدم ' + name + '.' + String(key) + ' — اعمله mock'); } });
}

/* بيحمّل ملف واحد (زي النسخة المرجعية في baseline/) بدل ملفات المشروع. */
function loadFile(filePath, extra = {}) {
  return load(null, extra, [{ name: filePath, src: require('fs').readFileSync(filePath, 'utf8') }]);
}

function load(projectName, extra = {}, files) {
  let ctxDate = Date;
  const project = projectName && PROJECTS.find(p => p.name === projectName);
  const ctx = vm.createContext(Object.assign({
    console,
    Utilities: {
      formatDate,
      parseDate: (t, tz, p) => parseDate(t, tz, p, ctxDate),
      sleep: () => {},
      getUuid: () => require('crypto').randomUUID(),
      DigestAlgorithm: { SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
      /* زي جوجل: مصفوفة bytes بإشارة (-128..127) */
      computeDigest: (alg, text) => Array.from(require('crypto').createHash(alg).update(String(text), 'utf8').digest())
        .map(b => (b > 127 ? b - 256 : b)),
      base64EncodeWebSafe: bytes => Buffer.from(bytes.map(b => (b + 256) % 256)).toString('base64')
        .replace(/\+/g, '-').replace(/\//g, '_'),
    },
    SpreadsheetApp: missingService('SpreadsheetApp'),
    PropertiesService: missingService('PropertiesService'),
    UrlFetchApp: missingService('UrlFetchApp'),
    CacheService: missingService('CacheService'),
    LockService: missingService('LockService'),
    ScriptApp: missingService('ScriptApp'),
  }, extra));
  ctxDate = vm.runInContext('Date', ctx);
  ctx.makeDate = v => new ctxDate(v); /* تاريخ من جوه البيئة عشان instanceof Date يشتغل */
  (files || sourceFiles(project)).forEach(f => vm.runInContext(f.src, ctx, { filename: f.name }));
  return ctx;
}

module.exports = { load, loadFile, formatDate, parseDate };
