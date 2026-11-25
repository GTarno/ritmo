// Roteador por fragmento: #rota ou #rota/parametro (ex.: #sessao/2026-11-24).
// Rotas desconhecidas caem na padrão. Ao trocar de tela, o foco vai para o
// título da nova tela (leitores de tela anunciam a mudança); no primeiro
// carregamento o foco fica onde está.

/**
 * @param {{
 *   routes: Record<string, { title: string | ((...params) => string), render: (...params) => Node, navParent?: string }>,
 *   defaultRoute: string,
 *   outlet: HTMLElement,
 *   nav: HTMLElement,
 * }} options
 */
export function createRouter({ routes, defaultRoute, outlet, nav }) {
  function current() {
    const [name, ...params] = decodeURIComponent(location.hash.slice(1)).split('/');
    return Object.hasOwn(routes, name) ? { name, params } : { name: defaultRoute, params: [] };
  }

  function render({ moveFocus = true } = {}) {
    const { name, params } = current();
    const route = routes[name];
    outlet.replaceChildren(route.render(...params));

    const active = route.navParent ?? name;
    for (const link of nav.querySelectorAll('a[data-route]')) {
      if (link.dataset.route === active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    const title = typeof route.title === 'function' ? route.title(...params) : route.title;
    document.title = `${title} — Ritmo`;

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
