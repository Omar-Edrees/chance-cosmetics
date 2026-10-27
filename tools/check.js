/*
 * الفحص الإجباري قبل أي رفع:
 * 1) كل ملف مكتوب صح لوحده.
 * 2) مفيش اسم دالة أو ثابت متكرر في المشروع (جوجل بتشغّل آخر نسخة بس،
 *    ودي كانت سبب إن تعديلات بتبوظ حاجات تانية).
 * 3) الملفات تشتغل بأي ترتيب تحميل.
 */
const vm = require('vm');
const { PROJECTS, definitions, sourceFiles } = require('./lib');

let failed = false;
for (const project of PROJECTS) {
  const errors = [], seen = {};
  const files = sourceFiles(project);
  for (const file of files) {
    let defs;
    try { defs = definitions(file.src, file.name); } catch (e) { errors.push(e.message); continue; }
    defs.forEach(d => d.name.split(',').forEach(n => {
      if (seen[n]) errors.push('الاسم "' + n + '" متعرّف مرتين: ' + seen[n] + ' و ' + file.name);
      seen[n] = file.name;
    }));
  }
  for (const order of [files, files.slice().reverse()]) {
    const ctx = vm.createContext({});
    try { order.forEach(f => vm.runInContext(f.src, ctx, { filename: f.name })); }
    catch (e) { errors.push('الملفات بتعتمد على ترتيب التحميل: ' + e.message); break; }
  }
  if (errors.length) {
    failed = true;
    console.error('✗ ' + project.name + '\n  ' + errors.join('\n  '));
  } else {
    console.log('✓ ' + project.name + ': ' + files.length + ' ملف، ' + Object.keys(seen).length + ' تعريف، مفيش تكرار.');
  }
}
process.exit(failed ? 1 : 0);
