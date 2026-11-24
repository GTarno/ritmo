// Ponto de entrada: carrega o estado salvo, escolhe a tela pela rota (#hash)
// e renderiza em <main id="app">. Roteador completo, diálogos e status entram na issue #6.
import { createStore } from './store.js';
import { routes, DEFAULT_ROUTE } from './views/routes.js';

const store = createStore();
const loaded = store.load();
// Estado em memória compartilhado pelas telas (as telas do M1 passam a usá-lo).
export const app = { state: loaded.state, store };

function showStatus(message) {
  if (message) document.getElementById('status').textContent = message;
}

function currentRoute() {
  const name = location.hash.slice(1);
  return routes[name] ? name : DEFAULT_ROUTE;
}

function render() {
  const name = currentRoute();
  const root = document.getElementById('app');
  root.replaceChildren(routes[name].render());

  for (const link of document.querySelectorAll('.app-nav a')) {
    if (link.getAttribute('href') === `#${name}`) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  document.title = `${routes[name].title} — Ritmo`;
}

window.addEventListener('hashchange', render);
render();
showStatus(loaded.message);
