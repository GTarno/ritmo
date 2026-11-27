// Service worker: deixa o app funcionando sem internet.
//
// Cada versão do app tem o seu cache, com TODOS os arquivos baixados de uma vez
// na instalação. As respostas saem desse cache (sem buscar arquivos novos aos
// poucos), então nunca se misturam arquivos de versões diferentes.
//
// VERSION é trocada no deploy pelo commit (workflow do Pages) e, no servidor
// local, por um hash do conteúdo de app/. Mudou a versão → o navegador instala
// o novo service worker, que espera a usuária tocar em "Atualizar".
const VERSION = '__VERSION__';
const CACHE = `ritmo-${VERSION}`;

// Todos os arquivos de app/, menos este. Um teste garante que a lista está completa.
const ASSETS = [
  './',
  'index.html',
  'style.css',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
  'icons/apple-touch-icon.png',
  'js/main.js',
  'js/app-state.js',
  'js/router.js',
  'js/store.js',
  'js/dates.js',
  'js/pwa.js',
  'js/persistence.js',
  'js/domain/backup.js',
  'js/domain/calendar.js',
  'js/domain/dashboard.js',
  'js/domain/initial-state.js',
  'js/domain/journal.js',
  'js/domain/migrations.js',
  'js/domain/plans.js',
  'js/domain/progress.js',
  'js/domain/sessions.js',
  'js/domain/timer.js',
  'js/ui/chart.js',
  'js/ui/dialog.js',
  'js/ui/dom.js',
  'js/ui/empty-state.js',
  'js/ui/form.js',
  'js/ui/status.js',
  'js/ui/rest-timer.js',
  'js/views/calendario.js',
  'js/views/dados.js',
  'js/views/diario.js',
  'js/views/evolucao.js',
  'js/views/painel.js',
  'js/views/routes.js',
  'js/views/sessao.js',
  'js/views/treino.js',
];

self.addEventListener('install', (event) => {
  // `cache: 'reload'` garante que a nova versão não venha do cache HTTP antigo.
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' })))),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('ritmo-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  // Abrir o app (qualquer rota #...) sempre carrega o index.html da versão em cache.
  const lookup = request.mode === 'navigate' ? 'index.html' : request;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => (await cache.match(lookup, { ignoreSearch: true })) ?? fetch(request)),
  );
});
