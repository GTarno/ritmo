// Ponto de entrada: escolhe a tela pela rota (#hash) e renderiza em <main id="app">.
// O roteador completo, diálogos e status entram na issue #6.
import { routes, DEFAULT_ROUTE } from './views/routes.js';

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
