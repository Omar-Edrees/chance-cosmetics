const acorn = require('acorn');
const fs = require('fs');
const path = require('path');

const PROJECTS = [
  { name: 'ads-sheet', dir: 'ads-sheet/src', baseline: 'baseline/ads-sheet_v1.3.0.gs' },
];

const root = path.join(__dirname, '..');

function parse(src, filename) {
  try {
    return acorn.parse(src, { ecmaVersion: 2022 });
  } catch (e) {
    throw new Error(filename + ': خطأ في كتابة الكود — ' + e.message);
  }
}

/* كل تعريف في أعلى الملف: دالة أو const/let. loose: يتخطى الأوامر (للنسخة المرجعية بس). */
function definitions(src, filename, loose) {
  return parse(src, filename).body.filter(node => !loose || node.type !== 'ExpressionStatement').map(node => {
    if (node.type === 'FunctionDeclaration') return { name: node.id.name, code: src.slice(node.start, node.end), file: filename };
    if (node.type === 'VariableDeclaration') return { name: node.declarations.map(d => d.id.name).join(','), code: src.slice(node.start, node.end), file: filename };
    throw new Error(filename + ': مسموح بس بالدوال والثوابت في أعلى الملف، لقيت ' + node.type);
  });
}

function sourceFiles(project) {
  const dir = path.join(root, project.dir);
  return fs.readdirSync(dir).filter(f => f.endsWith('.gs')).sort()
    .map(f => ({ name: f, path: path.join(dir, f), src: fs.readFileSync(path.join(dir, f), 'utf8') }));
}

module.exports = { PROJECTS, root, parse, definitions, sourceFiles };
