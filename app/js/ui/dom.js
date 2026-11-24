// Criação de elementos sem innerHTML: textos digitados pela usuária nunca viram HTML.
//
//   h('button', { class: 'btn', onclick: fn, 'aria-label': 'Fechar' }, 'Texto', outroEl)
//
// - atributos `on*` com função viram event listeners
// - `class` aceita string ou array (valores falsos são ignorados)
// - valores false/null/undefined omitem o atributo; true vira atributo vazio
// - filhos: strings, números, elementos, arrays (achatados); null/false ignorados

const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_TAGS = new Set(['svg', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'g', 'text', 'title']);

export function h(tag, attrs = {}, ...children) {
  const el = SVG_TAGS.has(tag) ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === false || value === null || value === undefined) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'class') {
      const cls = Array.isArray(value) ? value.filter(Boolean).join(' ') : value;
      if (cls) el.setAttribute('class', cls);
    } else if (key === 'dataset') {
      Object.assign(el.dataset, value);
    } else {
      el.setAttribute(key, value === true ? '' : String(value));
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
}

/** Ícone SVG decorativo (escondido de leitores de tela). */
export function icon(paths, { size = 24 } = {}) {
  return h(
    'svg',
    {
      viewBox: '0 0 24 24',
      width: size,
      height: size,
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': 2,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': 'true',
      focusable: 'false',
      class: 'icon',
    },
    [].concat(paths).map((d) => h('path', { d })),
  );
}

export const ICONS = {
  painel: ['M3 11l9-8 9 8', 'M5 10v10h5v-6h4v6h5V10'],
  treino: ['M6 7v10', 'M18 7v10', 'M3 10v4', 'M21 10v4', 'M6 12h12'],
  calendario: ['M4 6h16v15H4z', 'M4 10h16', 'M8 3v5', 'M16 3v5'],
  evolucao: ['M4 20V4', 'M4 20h16', 'M7 15l4-4 3 3 5-6'],
  diario: ['M6 3h11a2 2 0 0 1 2 2v16H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z', 'M8 8h7', 'M8 12h7'],
  fechar: ['M6 6l12 12', 'M18 6L6 18'],
};
