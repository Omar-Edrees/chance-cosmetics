/*
 * بيجمع ملفات كل مشروع في ملف واحد جوه dist/
 * للي عايز يلصق الكود بإيده في محرر Apps Script بدل clasp.
 */
const fs = require('fs');
const path = require('path');
const { PROJECTS, root, sourceFiles } = require('./lib');

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
for (const project of PROJECTS) {
  const files = sourceFiles(project);
  const header = '/*\n * ملف متجمّع تلقائيًا من ' + project.dir + ' — ماتعدلش فيه.\n' +
    ' * عدّل في الملفات الأصلية وشغّل: npm run build\n */\n\n';
  const body = files.map(f => '/* ======== ' + f.name + ' ======== */\n' + f.src.trimEnd()).join('\n\n');
  const out = path.join(root, 'dist', project.name + '.gs');
  fs.writeFileSync(out, header + body + '\n');
  console.log('اتعمل ' + path.relative(root, out) + ' من ' + files.length + ' ملف');
}
