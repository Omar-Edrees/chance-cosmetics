/*
 * بيقارن الكود الحالي بالنسخة المرجعية في baseline/ ويطلع
 * قائمة الدوال اللي اتغيرت أو اتضافت أو اتشالت.
 * مفيد في المراجعة: تعرف بالظبط إيه اللي هيتغير في الشيت الحقيقي.
 * --strict: يفشل لو في أي اختلاف.
 */
const fs = require('fs');
const path = require('path');
const { PROJECTS, root, definitions, sourceFiles } = require('./lib');

const strict = process.argv.includes('--strict');
let anyDiff = false;
for (const project of PROJECTS.filter(p => p.baseline)) {
  const base = {};
  definitions(fs.readFileSync(path.join(root, project.baseline), 'utf8'), 'baseline', true)
    .forEach(d => { base[d.name] = d.code; }); /* آخر تعريف هو اللي بيشتغل */
  const now = {};
  sourceFiles(project).forEach(f => definitions(f.src, f.name).forEach(d => { now[d.name] = d; }));
  const changed = Object.keys(now).filter(n => n in base && base[n] !== now[n].code);
  const added = Object.keys(now).filter(n => !(n in base));
  const removed = Object.keys(base).filter(n => !(n in now));
  const total = changed.length + added.length + removed.length;
  anyDiff = anyDiff || total > 0;
  console.log(project.name + ': ' + (total ? total + ' اختلاف عن النسخة المرجعية' : 'مطابق للنسخة المرجعية تمامًا'));
  changed.forEach(n => console.log('  اتغيرت: ' + n + '  (' + now[n].file + ')'));
  added.forEach(n => console.log('  جديدة:  ' + n + '  (' + now[n].file + ')'));
  removed.forEach(n => console.log('  اتشالت: ' + n));
}
process.exit(strict && anyDiff ? 1 : 0);
