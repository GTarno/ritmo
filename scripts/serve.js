// Servidor estático de desenvolvimento: serve app/ em /ritmo/, como no GitHub Pages.
// Uso: node scripts/serve.js   (porta: PORT, padrão 4173)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';

const ROOT = resolve('app');
const BASE = '/ritmo/';
const PORT = Number(process.env.PORT) || 4173;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

async function resolveFile(urlPath) {
  const rel = normalize(decodeURIComponent(urlPath.slice(BASE.length)));
  const file = join(ROOT, rel);
  if (file !== ROOT && !file.startsWith(ROOT + sep)) return null; // bloqueia ../
  try {
    const info = await stat(file);
    return info.isDirectory() ? join(file, 'index.html') : file;
  } catch {
    return null;
  }
}

createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (path === '/' || path === '/ritmo') {
    res.writeHead(302, { Location: BASE }).end();
    return;
  }
  const file = path.startsWith(BASE) ? await resolveFile(path) : null;
  try {
    if (!file) throw new Error('404');
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Não encontrado');
  }
}).listen(PORT, () => console.log(`Ritmo em http://localhost:${PORT}${BASE}`));
