// Roda `node --check` em todos os .js de app/ (usado no CI e em `npm run check`).
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : path.endsWith('.js') ? [path] : [];
  });
}

const files = walk('app');
for (const file of files) execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
console.log(`Sintaxe ok em ${files.length} arquivo(s).`);
