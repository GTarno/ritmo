// Roteador por fragmento (#rota). Rotas desconhecidas caem na padrão.
// Ao trocar de tela, o foco vai para o título da nova tela (leitores de tela
// anunciam a mudança); no primeiro carregamento o foco fica onde está.

/**
 * @param {{
 *   routes: Record<string, { title: string, render: () => Node }>,
 *   defaultRoute: string,
 *   outlet: HTMLElement,
 *   nav: HTMLElement,
 * }} options
 */
export function createRouter({ routes, defaultRoute, outlet, nav }) {
  function current() {
    const name = decodeURIComponent(location.hash.slice(1));
    return Object.hasOwn(routes, name) ? name : defaultRoute;
  }

  function render({ moveFocus = true } = {}) {
    const name = current();
    const route = routes[name];
    outlet.replaceChildren(route.render());

    for (const link of nav.querySelectorAll('a[data-route]')) {
      if (link.dataset.route === name) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    document.title = `${route.title} — Ritmo`;

    if (moveFocus) {
      const heading = outlet.querySelector('h1, h2');
      if (heading) {
        heading.setAttribute('tabindex', '-1');
        heading.focus({ preventScroll: true });
      }
      window.scrollTo(0, 0);
    }
  }

  window.addEventListener('hashchange', () => render());
  return { render, current };
}
