// Confere as notas de um relatório JSON do Lighthouse.
// Uso: node scripts/check-lighthouse.js relatorio.json [nota-minima=0.9]
// Exige a nota mínima em acessibilidade e boas práticas; desempenho só é
// mostrado (varia com a máquina do CI).
import { readFile } from 'node:fs/promises';

const [file, min = '0.9'] = process.argv.slice(2);
const report = JSON.parse(await readFile(file, 'utf8'));
const required = ['accessibility', 'best-practices'];
let failed = false;

for (const [id, category] of Object.entries(report.categories)) {
  const score = category.score;
  const ok = !required.includes(id) || score >= Number(min);
  console.log(`${ok ? '✓' : '✘'} ${category.title}: ${Math.round(score * 100)}${required.includes(id) ? ` (mínimo ${Math.round(min * 100)})` : ''}`);
  if (!ok) {
    failed = true;
    for (const ref of category.auditRefs) {
      const audit = report.audits[ref.id];
      if (ref.weight > 0 && audit.score !== null && audit.score < 1) console.log(`    - ${audit.id}: ${audit.title}`);
    }
  }
}
process.exit(failed ? 1 : 0);
