/*
 * Google Sheets و Drive وهميين في الذاكرة، عشان نجرب النسخ والاسترجاع
 * كاملين على الكمبيوتر. بيدعموا بس اللي كود النسخ الاحتياطي بيستخدمه.
 */
let nextId = 1;
const newId = p => p + String(nextId++).padStart(25, '0');
const clone = v => (v instanceof Date ? new v.constructor(v.getTime()) : Array.isArray(v) ? v.map(clone) : v);

class FakeRange {
  constructor(sheet, row, col, rows, cols) { Object.assign(this, { sheet, row, col, rows, cols }); }
  cells(key) {
    const out = [];
    for (let r = 0; r < this.rows; r++) {
      const line = [];
      for (let c = 0; c < this.cols; c++) {
        const v = (this.sheet[key][this.row - 1 + r] || [])[this.col - 1 + c];
        line.push(v === undefined ? '' : clone(v));
      }
      out.push(line);
    }
    return out;
  }
  getValues() { return this.cells('values'); }
  getDisplayValues() { return this.cells('values').map(r => r.map(v => (v === null || v === undefined ? '' : String(v)))); }
  getDisplayValue() { return this.getDisplayValues()[0][0]; }
  getSheet() { return this.sheet; }
  getRow() { return this.row; } getColumn() { return this.col; }
  getLastRow() { return this.row + this.rows - 1; } getLastColumn() { return this.col + this.cols - 1; }
  getFormulas() { return this.cells('formulas'); }
  getFormula() { return this.getFormulas()[0][0]; }
  getValue() { return this.getValues()[0][0]; }
  /* زي جوجل: النص اللي بيبدأ بـ = بيتكتب معادلة، والنص اللي شكله تاريخ ("9/19" = شهر/يوم) بيتحول تاريخ
     إلا لو الخانة نص (@) */
  setValues(rows) {
    rows.forEach((line, r) => line.forEach((v, c) => {
      const formula = typeof v === 'string' && v.charAt(0) === '=';
      this.sheet.put(this.row + r, this.col + c, formula ? '' : this.typed(this.row + r, this.col + c, v), formula ? v : '');
    }));
    return this;
  }
  typed(r, c, v) {
    const m = typeof v === 'string' && this.sheet.attr(r, c).nf !== '@' ? v.match(/^(\d{1,2})\/(\d{1,2})$/) : null;
    return m && +m[1] >= 1 && +m[1] <= 12 && +m[2] >= 1 && +m[2] <= 31 ? new Date(Date.UTC(2026, +m[1] - 1, +m[2])) : v;
  }
  setValue(v) { for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) this.sheet.put(this.row + r, this.col + c, v, ''); return this; }
  insertCheckboxes() { return this.setValue(false); }
  each(fn) { this.sheet.calls = (this.sheet.calls || 0) + 1; for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) fn(this.row + r, this.col + c, r, c); return this; }
  setFormula(f) { return this.each((r, c) => this.sheet.put(r, c, '', f)); }
  setFormulas(rows) { return this.each((r, c, i, j) => this.sheet.put(r, c, '', rows[i][j])); }
  clearContent() { return this.each((r, c) => this.sheet.put(r, c, '', '')); }
  attr(key, v) { return this.each((r, c) => { this.sheet.attr(r, c)[key] = v; }); }
  setBackground(v) { return this.attr('bg', v); }
  setFontWeight(v) { return this.attr('fw', v); }
  setFontColor(v) { return this.attr('fc', v); }
  setNumberFormat(v) { return this.attr('nf', v); }
  setNote(v) { return this.attr('note', v); }
  setNotes(rows) { return this.each((r, c, i, j) => { this.sheet.attr(r, c).note = rows[i][j]; }); }
  setFontColors(rows) { return this.each((r, c, i, j) => { this.sheet.attr(r, c).fc = rows[i][j]; }); }
  setNumberFormats(rows) { return this.each((r, c, i, j) => { this.sheet.attr(r, c).nf = rows[i][j]; }); }
  setFontWeights(rows) { return this.each((r, c, i, j) => { this.sheet.attr(r, c).fw = rows[i][j]; }); }
  clearNote() { return this.attr('note', ''); }
  /* التنسيق بس (الملاحظة بتفضل، زي جوجل) */
  clearFormat() { return this.each((r, c) => { const a = this.sheet.attr(r, c); Object.keys(a).forEach(k => { if (k !== 'note') delete a[k]; }); }); }
  clear() { this.clearContent(); return this.clearFormat(); }
  setBackgrounds(rows) { return this.each((r, c, i, j) => { this.sheet.attr(r, c).bg = rows[i][j]; }); }
  /* Range.insertCells(ROWS): خانات فاضية مكان المساحة دي، واللي تحتها في نفس الأعمدة بس بينزل (القيم والمعادلات والتنسيق) */
  insertCells() { this.sheet.insertCellsDown(this.row, this.col, this.rows, this.cols); return this; }
  /* فلتر بسيط: بيفتكر المساحة والشروط بس */
  createFilter() {
    const sheet = this.sheet, f = { range: this, criteria: {} };
    f.getColumnFilterCriteria = c => f.criteria[c] || null;
    f.setColumnFilterCriteria = (c, x) => { f.criteria[c] = x; return f; };
    f.remove = () => { sheet.filter = null; };
    sheet.filter = f;
    return f;
  }
}
/* تنسيقات مش بنتابعها */
['merge', 'setHorizontalAlignment', 'removeCheckboxes', 'setWrap', 'setFontSize', 'breakApart', 'setDataValidation', 'setBorder',
  'setVerticalAlignment', 'activate', 'setTextDirection', 'setHorizontalAlignments'].forEach(m => {
  FakeRange.prototype[m] = function () { return this; };
});

class FakeSheet {
  constructor(name) { this.name = name; this.values = []; this.formulas = []; this.attrs = {}; this.maxRows = 1000; this.writes = 0; }
  attr(r, c) { return (this.attrs[r + ',' + c] = this.attrs[r + ',' + c] || {}); }
  getMaxRows() { return this.maxRows; }
  getMaxColumns() { return this.maxCols || 26; }
  insertColumnsAfter(after, n) { this.maxCols = this.getMaxColumns() + n; }
  /* زي جوجل: الصفوف اللي بعد `after` بتنزل n صف (القيم والمعادلات والتنسيق). */
  insertRowsAfter(after, n) {
    [this.values, this.formulas].forEach(grid => { if (grid.length > after) grid.splice(after, 0, ...Array.from({ length: n }, () => [])); });
    this.shiftAttrs(after + 1, n);
    this.maxRows += n;
  }
  deleteRows(start, n) {
    if (this.maxRows - n < 1) throw new Error('مينفعش تمسح كل الصفوف');
    [this.values, this.formulas].forEach(grid => { if (grid.length >= start) grid.splice(start - 1, n); });
    Object.keys(this.attrs).forEach(k => { const r = Number(k.split(',')[0]); if (r >= start && r < start + n) delete this.attrs[k]; });
    this.shiftAttrs(start + n, -n);
    this.maxRows -= n;
  }
  shiftAttrs(from, by) {
    const attrs = {};
    Object.keys(this.attrs).forEach(k => { const [r, c] = k.split(',').map(Number); attrs[(r >= from ? r + by : r) + ',' + c] = this.attrs[k]; });
    this.attrs = attrs;
  }
  /* زي جوجل: عمود فاضي، وكل اللي بعده بيزح (القيم والمعادلات والتنسيق). المعادلات نفسها مابتتعدلش هنا. */
  insertColumnBefore(col) {
    [this.values, this.formulas].forEach(rows => rows.forEach(row => { if (row && row.length > col - 1) row.splice(col - 1, 0, ''); }));
    const attrs = {};
    Object.keys(this.attrs).forEach(k => { const [r, c] = k.split(',').map(Number); attrs[r + ',' + (c >= col ? c + 1 : c)] = this.attrs[k]; });
    this.attrs = attrs;
    this.maxCols = this.getMaxColumns() + 1;
    return this;
  }
  insertCellsDown(row, col, rows, cols) {
    [this.values, this.formulas].forEach(grid => {
      for (let r = grid.length; r >= row; r--) {
        const from = grid[r - 1] || [], to = (grid[r - 1 + rows] = grid[r - 1 + rows] || []);
        for (let c = col; c < col + cols; c++) to[c - 1] = from[c - 1] === undefined ? '' : from[c - 1];
      }
      for (let r = row; r < row + rows; r++) {
        const line = (grid[r - 1] = grid[r - 1] || []);
        for (let c = col; c < col + cols; c++) line[c - 1] = '';
      }
    });
    const attrs = {};
    Object.keys(this.attrs).forEach(k => {
      const [r, c] = k.split(',').map(Number);
      attrs[(c >= col && c < col + cols && r >= row ? r + rows : r) + ',' + c] = this.attrs[k];
    });
    this.attrs = attrs;
  }
  /* صورة كاملة للتاب (قيم + معادلات + تنسيق) عشان نقارن نسختين من الكود */
  snapshot() {
    return JSON.stringify({ values: this.values.map(r => (r || []).map(v => (v && v.getTime ? 'D' + v.getTime() : v === undefined ? '' : v))),
      formulas: this.formulas, attrs: Object.keys(this.attrs).sort().map(k => [k, this.attrs[k]]) });
  }
  put(r, c, v, f) {
    this.writes++;
    (this.values[r - 1] = this.values[r - 1] || [])[c - 1] = v;
    (this.formulas[r - 1] = this.formulas[r - 1] || [])[c - 1] = f || '';
  }
  getName() { return this.name; }
  setName(n) { this.name = n; return this; }
  getLastRow() {
    for (let r = this.values.length; r > 0; r--) if ((this.values[r - 1] || []).some(v => v !== '' && v !== undefined)) return r;
    return 0;
  }
  getLastColumn() {
    let max = 0;
    this.values.forEach(row => (row || []).forEach((v, c) => { if (v !== '' && v !== undefined) max = Math.max(max, c + 1); }));
    return max;
  }
  getRange(a, b, c, d) {
    if (typeof a === 'string') {
      const m = a.match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/);
      const col = s => s.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
      const r1 = +m[2], c1 = col(m[1]), r2 = m[4] ? +m[4] : r1, c2 = m[3] ? col(m[3]) : c1;
      return new FakeRange(this, r1, c1, r2 - r1 + 1, c2 - c1 + 1);
    }
    return new FakeRange(this, a, b, c || 1, d || 1);
  }
  getDataRange() { return this.getRange(1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); }
  appendRow(row) { this.getRange(this.getLastRow() + 1, 1, 1, row.length).setValues([row]); }
  copyTo(ss) { const s = ss.insertSheet(this.name + ' copy'); s.values = clone(this.values); s.formulas = clone(this.formulas); return s; }
  setFrozenRows() {} setRightToLeft() {} setColumnWidth() {} setColumnWidths() {}
  setFrozenColumns() {} setRowHeight() {} showSheet() { this.hidden = false; return this; }
  hideColumns(col, n) { this.hiddenColumns = [col, n || 1]; }
  getFilter() { return this.filter || null; }
  /* صور فوق الخانات (Sheet.insertImage / getImages) */
  getImages() { return (this.images || []).slice(); }
  insertImage(blob, col, row) {
    const sheet = this, img = { blob, col, row, alt: '' };
    img.getAltTextTitle = () => img.alt;
    img.setAltTextTitle = t => { img.alt = t; return img; };
    img.setAltTextDescription = d => { img.description = d; return img; };
    img.setWidth = w => { img.width = w; return img; };
    img.setHeight = h => { img.height = h; return img; };
    img.remove = () => { sheet.images = sheet.images.filter(x => x !== img); };
    (this.images = this.images || []).push(img);
    return img;
  }
  hideSheet() { this.hidden = true; return this; }
  setTabColor(c) { this.tabColor = c; return this; }
  getConditionalFormatRules() { return (this.cfRules || []).slice(); }
  setConditionalFormatRules(r) { this.cfRules = r.slice(); }
  getProtections() { return this.protections || []; }
  protect() { const p = { setDescription: () => p, setWarningOnly: () => p }; this.protections = [p]; return p; }
}

class FakeSpreadsheet {
  constructor(name, id) { this.name = name; this.id = id || newId('S'); this.sheets = []; }
  getId() { return this.id; }
  getName() { return this.name; }
  getSheets() { return this.sheets.slice(); }
  getSheetByName(n) { return this.sheets.find(s => s.name === n) || null; }
  insertSheet(n, index) {
    if (this.getSheetByName(n)) throw new Error('sheet exists: ' + n);
    const s = new FakeSheet(n);
    if (index === 0) this.sheets.unshift(s); else this.sheets.push(s);
    return s;
  }
  addSheet(name, rows, formulas) {
    const s = this.insertSheet(name);
    rows.forEach((row, r) => row.forEach((v, c) => s.put(r + 1, c + 1, v, formulas && formulas[r] && formulas[r][c])));
    return s;
  }
}

class FakeFolder {
  constructor(drive, name, parent) { Object.assign(this, { drive, name, parent, id: newId('F'), trashed: false }); }
  getId() { return this.id; } getName() { return this.name; } getUrl() { return 'https://drive/' + this.id; }
  isTrashed() { return this.trashed; } setTrashed(t) { this.trashed = t; return this; }
  children() { return this.drive.folders.filter(f => f.parent === this && !f.trashed); }
  iter(list) { let i = 0; return { hasNext: () => i < list.length, next: () => list[i++] }; }
  getFolders() { return this.iter(this.children()); }
  getFoldersByName(n) { return this.iter(this.children().filter(f => f.name === n)); }
  createFolder(n) { const f = new FakeFolder(this.drive, n, this); this.drive.folders.push(f); return f; }
}

/* قاعدة تنسيق شرطي بمعادلة (SpreadsheetApp.newConditionalFormatRule) */
function newConditionalFormatRule() {
  const rule = { formula: '', bg: '', ranges: [] };
  rule.getBooleanCondition = () => ({ getCriteriaValues: () => [rule.formula] });
  rule.getRanges = () => rule.ranges;
  const b = {
    whenFormulaSatisfied: f => { rule.formula = f; return b; },
    setBackground: c => { rule.bg = c; return b; },
    setRanges: r => { rule.ranges = r; return b; },
    build: () => rule,
  };
  return b;
}

function createGoogle() {
  const drive = { folders: [], files: {} };
  const root = new FakeFolder(drive, 'My Drive', null);
  const add = ss => { drive.files[ss.id] = { ss, folder: root, description: '' }; return ss; };
  let active = null, uiAnswers = [];
  const DriveApp = {
    createFolder: n => root.createFolder(n),
    getFolderById: id => { const f = drive.folders.find(x => x.id === id); if (!f) throw new Error('no folder'); return f; },
    getFileById: id => {
      const rec = drive.files[id];
      if (!rec) throw new Error('No item with the given ID could be found.');
      return {
        getId: () => id, getUrl: () => 'https://docs/' + id,
        setDescription: d => { rec.description = d; },
        makeCopy: (name, folder) => {
          const copy = new FakeSpreadsheet(name);
          copy.sheets = rec.ss.sheets.map(s => { const n = new FakeSheet(s.name); n.values = clone(s.values); n.formulas = clone(s.formulas); return n; });
          drive.files[copy.id] = { ss: copy, folder, description: '' };
          if (google.onCopy) google.onCopy(rec.ss);
          return DriveApp.getFileById(copy.id);
        },
      };
    },
  };
  const props = {};
  const ui = {
    ButtonSet: { OK_CANCEL: 1, YES_NO: 2 }, Button: { OK: 'OK', YES: 'YES', NO: 'NO' },
    alert: (...a) => { google.alerts.push(a.join(' | ')); return a.length > 1 ? (uiAnswers.shift() || 'YES') : undefined; },
    prompt: () => { const t = uiAnswers.shift(); return { getSelectedButton: () => (t === null ? 'CANCEL' : 'OK'), getResponseText: () => t }; },
  };
  const triggers = [];
  const google = {
    drive, root, alerts: [], add, onCopy: null, triggers,
    setActive: ss => { active = ss; },
    answer: (...a) => { uiAnswers = a; },
    globals: {
      DriveApp,
      SpreadsheetApp: {
        getActiveSpreadsheet: () => active,
        openById: id => { const r = drive.files[id]; if (!r) throw new Error('not found ' + id); return r.ss; },
        getUi: () => ui,
        flush: () => {},
      },
      PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
      LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
      ScriptApp: {
        getProjectTriggers: () => triggers.slice(),
        deleteTrigger: t => triggers.splice(triggers.indexOf(t), 1),
        newTrigger: fn => {
          const b = { timeBased: () => b, everyDays: () => b, atHour: () => b, inTimezone: () => b,
            create: () => { const t = { getHandlerFunction: () => fn }; triggers.push(t); return t; } };
          return b;
        },
      },
    },
  };
  return google;
}

module.exports = { createGoogle, FakeSpreadsheet, newConditionalFormatRule };
