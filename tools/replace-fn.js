/*
 * أداة تطوير: تستبدل دالة كاملة (أو تضيف دالة جديدة بعد دالة) باستخدام
 * الـ parser الحقيقي بتاع JavaScript، مش بحث نصي.
 *   node tools/replace-fn.js <file.gs> <functionName> <newCode.js>
 *   node tools/replace-fn.js <file.gs> --after <functionName> <newCode.js>
 */
const fs = require('fs');
const acorn = require('acorn');

const args = process.argv.slice(2);
const after = args[1] === '--after';
const [file, name, codeFile] = after ? [args[0], args[2], args[3]] : args;
const src = fs.readFileSync(file, 'utf8');
const code = fs.readFileSync(codeFile, 'utf8').trim();
const node = acorn.parse(src, { ecmaVersion: 2022 }).body
  .find(n => n.type === 'FunctionDeclaration' && n.id.name === name);
if (!node) { console.error('مش لاقي الدالة ' + name + ' في ' + file); process.exit(1); }
const out = after
  ? src.slice(0, node.end) + '\n\n' + code + src.slice(node.end)
  : src.slice(0, node.start) + code + src.slice(node.end);
fs.writeFileSync(file, out);
console.log((after ? 'اتضافت بعد ' : 'اتغيرت ') + name);
