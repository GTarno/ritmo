// Ponto de entrada: monta o menu e renderiza a tela da rota atual.
import { app } from './app-state.js';
import { createRouter } from './router.js';
import { routes, DEFAULT_ROUTE } from './views/routes.js';
import { h, icon, ICONS } from './ui/dom.js';
import { showStatus } from './ui/status.js';
import { setupPwa } from './pwa.js';
import { setupRestTimer } from './ui/rest-timer.js';

export { app };

const nav = document.getElementById('nav');
nav.replaceChildren(
  h(
    'ul',
    {},
    Object.entries(routes)
      .filter(([, route]) => !route.hidden)
      .map(([name, route]) =>
      h(
        'li',
        {},
        h(
          'a',
          { href: `#${name}`, dataset: { route: name } },
          icon(ICONS[name]),
          h('span', {}, route.label ?? route.title),
        ),
      ),
    ),
  ),
);

document.getElementById('data-link').replaceChildren(icon(ICONS.dados, { size: 22 }));

const router = createRouter({
  routes,
  defaultRoute: DEFAULT_ROUTE,
  outlet: document.getElementById('app'),
  nav,
});
router.render({ moveFocus: false });

const { message, status } = app.loaded;
if (message) showStatus(message, { type: status === 'migrated' ? 'info' : 'error' });

setupPwa();
setupRestTimer();
