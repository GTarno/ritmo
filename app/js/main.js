// Ponto de entrada: carrega o estado salvo, monta o menu e renderiza a tela da rota atual.
import { createStore } from './store.js';
import { createRouter } from './router.js';
import { routes, DEFAULT_ROUTE } from './views/routes.js';
import { h, icon, ICONS } from './ui/dom.js';
import { showStatus } from './ui/status.js';

const store = createStore();
const loaded = store.load();

// Estado em memória compartilhado pelas telas.
export const app = {
  state: loaded.state,
  store,
  /** Grava o estado atual e avisa se não conseguir. Devolve true se salvou. */
  save() {
    const result = store.save(app.state);
    if (!result.ok) showStatus(result.message, { type: 'error' });
    return result.ok;
  },
};

const nav = document.getElementById('nav');
nav.replaceChildren(
  h(
    'ul',
    {},
    Object.entries(routes).map(([name, route]) =>
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

const router = createRouter({
  routes,
  defaultRoute: DEFAULT_ROUTE,
  outlet: document.getElementById('app'),
  nav,
});
router.render({ moveFocus: false });

if (loaded.message) {
  showStatus(loaded.message, { type: loaded.status === 'migrated' ? 'info' : 'error' });
}
