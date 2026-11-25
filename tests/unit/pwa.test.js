import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const APP = 'app';

function appFiles(dir = APP) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? appFiles(path) : [relative(APP, path).split('\\').join('/')];
  });
}

/** Lista ASSETS lida do texto do sw.js (ele é um script clássico, não um módulo). */
function precacheList() {
  const source = readFileSync(join(APP, 'sw.js'), 'utf8');
  const match = /const ASSETS = \[([\s\S]*?)\];/.exec(source);
  assert.ok(match, 'ASSETS não encontrado no sw.js');
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

test('o cache offline inclui todos os arquivos de app/ (menos o sw.js) e nada que não exista', () => {
  const listed = precacheList().filter((p) => p !== './');
  const files = appFiles().filter((p) => p !== 'sw.js');
  const missing = files.filter((f) => !listed.includes(f));
  const extra = listed.filter((f) => !files.includes(f));
  assert.deepEqual(missing, [], 'arquivos de app/ fora do ASSETS do sw.js');
  assert.deepEqual(extra, [], 'itens do ASSETS que não existem em app/');
  assert.equal(new Set(listed).size, listed.length, 'itens repetidos no ASSETS');
  assert.ok(precacheList().includes('./'), 'a raiz do app precisa estar no cache');
});

test('o sw.js mantém o marcador de versão substituído no deploy', () => {
  assert.match(readFileSync(join(APP, 'sw.js'), 'utf8'), /const VERSION = '__VERSION__';/);
  assert.match(readFileSync('.github/workflows/pages.yml', 'utf8'), /__VERSION__/);
});

test('manifest: nome, escopo relativo e ícones que existem', () => {
  const manifest = JSON.parse(readFileSync(join(APP, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.short_name, 'Ritmo');
  assert.equal(manifest.lang, 'pt-BR');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, './', 'caminho relativo: o site roda em /ritmo/');
  assert.equal(manifest.scope, './');
  const sizes = manifest.icons.map((i) => `${i.sizes}:${i.purpose}`);
  assert.ok(sizes.includes('192x192:any'));
  assert.ok(sizes.includes('512x512:any'));
  assert.ok(sizes.includes('512x512:maskable'));
  for (const icon of manifest.icons) {
    assert.ok(!icon.src.startsWith('/'), `${icon.src} deve ser relativo`);
    assert.ok(existsSync(join(APP, icon.src)), `${icon.src} não existe`);
  }
});

test('index.html liga manifest, ícone do iOS e cor do tema com caminhos relativos', () => {
  const html = readFileSync(join(APP, 'index.html'), 'utf8');
  assert.match(html, /<link rel="manifest" href="manifest\.webmanifest">/);
  assert.match(html, /<link rel="apple-touch-icon" href="icons\/apple-touch-icon\.png">/);
  assert.match(html, /<meta name="theme-color"/);
  assert.doesNotMatch(html, /(href|src)="\//, 'nenhum caminho absoluto');
});
