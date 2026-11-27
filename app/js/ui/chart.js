// Gráficos em SVG, feitos à mão (sem biblioteca). Cada gráfico tem uma série só:
// uma cor (--chart-series), sem caixa de legenda (o título do cartão diz o que é).
//
// Especificações seguidas: linha de 2px; pontos de 8px com anel de 2px na cor do
// fundo; barras de no máximo 24px com ponta arredondada de 4px e base reta; grade
// em linha fina sólida; textos sempre nas cores de texto, nunca na cor da série;
// rótulo só no fim da linha (ou na barra da semana atual).
//
// Interação: crosshair que encaixa na data mais próxima (linha) ou a barra inteira
// como alvo (barras), tooltip com o valor em destaque, mesmo comportamento no
// teclado (setas, Home, End). Nada fica só no tooltip: há sempre uma tabela.
import { h } from './dom.js';
import { diffDays, formatShort, formatLong } from '../dates.js';

const HEIGHT = 200;
const fmt = (n) => String(Number(n.toFixed(2))).replace('.', ',');

/** Marcas "redondas" para o eixo: 3 a 5 valores com passo 1, 2, 2,5 ou 5 × 10^k. */
export function niceTicks(min, max, count = 4) {
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const raw = (max - min) / count;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= raw);
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Number(v.toFixed(6)));
  return ticks;
}

/** Tabela com os mesmos dados (acessível sem hover, sem cor). */
function dataTable(data, { valueLabel, unit, dateLabel = 'Data', formatDate = formatShort }) {
  return h(
    'details',
    { class: 'chart-table' },
    h('summary', {}, 'Ver dados em tabela'),
    h(
      'table',
      {},
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, dateLabel), h('th', { scope: 'col' }, valueLabel))),
      h(
        'tbody',
        {},
        [...data].reverse().map((d) => h('tr', {}, h('td', {}, formatDate(d.date)), h('td', {}, `${fmt(d.value)}${unit ? ` ${unit}` : ''}`))),
      ),
    ),
  );
}

/**
 * Monta o esqueleto comum: área do gráfico, tooltip e redesenho quando a largura muda.
 * `draw(width)` devolve { svg, points: [{ x, y, datum }], show(i) }.
 */
function chartShell({ data, summary, draw, tooltipText }) {
  const tooltip = h('div', { class: 'chart-tooltip', 'aria-hidden': 'true', hidden: true });
  const live = h('p', { class: 'visually-hidden', 'aria-live': 'polite' });
  const plot = h('div', { class: 'chart-plot' });
  let current = null;
  let active = -1;

  function hide() {
    active = -1;
    tooltip.hidden = true;
    current?.highlight(-1);
  }

  function show(i) {
    if (!current || i < 0 || i >= data.length) return;
    active = i;
    current.highlight(i);
    const { strong, sub } = tooltipText(data[i]);
    tooltip.replaceChildren(h('strong', {}, strong), h('span', {}, sub));
    tooltip.hidden = false;
    const p = current.points[i];
    const width = plot.clientWidth;
    const tipWidth = tooltip.offsetWidth;
    const left = Math.min(Math.max(p.x - tipWidth / 2, 0), Math.max(0, width - tipWidth));
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${Math.max(0, p.y - tooltip.offsetHeight - 12)}px`;
    live.textContent = `${strong}, ${sub}`;
  }

  function nearest(clientX) {
    const rect = plot.getBoundingClientRect();
    const x = clientX - rect.left;
    let best = 0;
    current.points.forEach((p, i) => {
      if (Math.abs(p.x - x) < Math.abs(current.points[best].x - x)) best = i;
    });
    return best;
  }

  function render() {
    const width = Math.max(240, Math.floor(plot.clientWidth || 320));
    current = draw(width);
    current.svg.setAttribute('role', 'img');
    current.svg.setAttribute('aria-label', summary);
    plot.replaceChildren(current.svg, tooltip);
    if (active >= 0) show(active);
  }

  plot.tabIndex = 0;
  plot.setAttribute('aria-label', `${summary}. Use as setas para percorrer os valores.`);
  plot.addEventListener('pointermove', (e) => show(nearest(e.clientX)));
  plot.addEventListener('pointerdown', (e) => show(nearest(e.clientX)));
  plot.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse') hide();
  });
  plot.addEventListener('focus', () => show(active >= 0 ? active : data.length - 1));
  plot.addEventListener('blur', hide);
  plot.addEventListener('keydown', (e) => {
    const moves = { ArrowLeft: active - 1, ArrowRight: active + 1, Home: 0, End: data.length - 1 };
    if (!(e.key in moves)) return;
    e.preventDefault();
    show(Math.min(data.length - 1, Math.max(0, moves[e.key])));
  });

  // Desenha com a largura real assim que o elemento entra na página, e de novo se ela mudar.
  let lastWidth = 0;
  // O redesenho fica para o próximo quadro: redesenhar dentro do callback muda o
  // layout de novo no mesmo quadro, e o Safari acusa "ResizeObserver loop".
  let frame = 0;
  const observer = new ResizeObserver(([entry]) => {
    const w = Math.floor(entry.contentRect.width);
    if (!w || w === lastWidth) return;
    lastWidth = w;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(render);
  });
  observer.observe(plot);
  render();

  return h('div', {}, plot, live);
}

/**
 * Linha ao longo do tempo (peso, medidas, cargas).
 * @param {{ data: Array<{ date, value }>, unit: string, valueLabel: string, summary: string }} options
 */
export function lineChart({ data, unit, valueLabel, summary }) {
  const margin = { top: 24, right: 64, bottom: 28, left: 44 };
  const first = data[0].date;
  const span = Math.max(1, diffDays(first, data.at(-1).date));
  const values = data.map((d) => d.value);
  const ticks = niceTicks(Math.min(...values), Math.max(...values), 3);
  const yMin = ticks[0];
  const yMax = ticks.at(-1);

  function draw(width) {
    const innerW = width - margin.left - margin.right;
    const innerH = HEIGHT - margin.top - margin.bottom;
    const x = (d) => margin.left + (data.length === 1 ? innerW / 2 : (diffDays(first, d.date) / span) * innerW);
    const y = (v) => margin.top + innerH - ((v - yMin) / (yMax - yMin)) * innerH;
    const points = data.map((d) => ({ x: x(d), y: y(d.value), datum: d }));
    const path = points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const baseY = margin.top + innerH;
    const area = points.length > 1 ? `${path} L${points.at(-1).x.toFixed(1)},${baseY} L${points[0].x.toFixed(1)},${baseY} Z` : '';
    const last = points.at(-1);

    const crosshair = h('line', { class: 'chart-crosshair', y1: margin.top, y2: baseY, x1: 0, x2: 0, visibility: 'hidden' });
    const dots = points.map((p) => h('circle', { class: 'chart-dot', cx: p.x, cy: p.y, r: 4 }));

    const svg = h(
      'svg',
      { class: 'chart', width, height: HEIGHT, viewBox: `0 0 ${width} ${HEIGHT}` },
      ticks.map((t) =>
        h(
          'g',
          {},
          h('line', { class: 'chart-grid', x1: margin.left, x2: width - margin.right, y1: y(t), y2: y(t) }),
          h('text', { class: 'chart-tick', x: margin.left - 8, y: y(t), 'text-anchor': 'end', 'dominant-baseline': 'middle' }, fmt(t)),
        ),
      ),
      h('text', { class: 'chart-tick', x: margin.left, y: HEIGHT - 6, 'text-anchor': data.length === 1 ? 'middle' : 'start', ...(data.length === 1 ? { x: last.x } : {}) }, formatShort(data[0].date)),
      data.length > 1 && h('text', { class: 'chart-tick', x: last.x, y: HEIGHT - 6, 'text-anchor': 'end' }, formatShort(data.at(-1).date)),
      area && h('path', { class: 'chart-area', d: area }),
      crosshair,
      points.length > 1 && h('path', { class: 'chart-line', d: path }),
      dots,
      h('text', { class: 'chart-end-label', x: last.x + 10, y: last.y, 'dominant-baseline': 'middle' }, `${fmt(last.datum.value)} ${unit}`),
    );

    function highlight(i) {
      dots.forEach((dot, j) => dot.setAttribute('r', j === i ? 6 : 4));
      if (i < 0) return crosshair.setAttribute('visibility', 'hidden');
      crosshair.setAttribute('x1', points[i].x);
      crosshair.setAttribute('x2', points[i].x);
      crosshair.setAttribute('visibility', 'visible');
    }
    return { svg, points, highlight };
  }

  const figure = h(
    'figure',
    { class: 'chart-figure' },
    chartShell({
      data,
      summary,
      draw,
      tooltipText: (d) => ({ strong: `${fmt(d.value)} ${unit}`, sub: formatLong(d.date) }),
    }),
    dataTable(data, { valueLabel, unit }),
  );
  return figure;
}

/** Caminho de uma barra com o topo arredondado (raio 4) e a base reta. */
function barPath(x, yTop, width, base) {
  const r = Math.min(4, width / 2, base - yTop);
  return [
    `M${x},${base}`,
    `L${x},${yTop + r}`,
    `Q${x},${yTop} ${x + r},${yTop}`,
    `L${x + width - r},${yTop}`,
    `Q${x + width},${yTop} ${x + width},${yTop + r}`,
    `L${x + width},${base}`,
    'Z',
  ].join(' ');
}

/**
 * Colunas por semana (frequência), com linha de referência da meta.
 * @param {{ data: Array<{ date, value }>, target: number, summary: string, highlightLast?: boolean }} options
 */
export function barChart({ data, target, summary }) {
  const margin = { top: 24, right: 16, bottom: 28, left: 32 };
  const yMax = Math.max(target, ...data.map((d) => d.value), 1);
  const ticks = Array.from({ length: yMax + 1 }, (_, i) => i).filter((v) => yMax <= 5 || v % 2 === 0 || v === yMax);
  const plural = (n) => (n === 1 ? '1 treino' : `${n} treinos`);

  function draw(width) {
    const innerW = width - margin.left - margin.right;
    const innerH = HEIGHT - margin.top - margin.bottom;
    const band = innerW / data.length;
    const barW = Math.min(24, band * 0.6);
    const base = margin.top + innerH;
    const y = (v) => base - (v / yMax) * innerH;
    const points = data.map((d, i) => ({ x: margin.left + band * i + band / 2, y: y(d.value), datum: d }));
    const bars = points.map((p) =>
      p.datum.value > 0 ? h('path', { class: 'chart-bar', d: barPath(p.x - barW / 2, p.y, barW, base) }) : h('g', {}),
    );
    const hovers = points.map((p, i) => h('rect', { class: 'chart-band', x: margin.left + band * i, y: margin.top, width: band, height: innerH, visibility: 'hidden' }));
    const last = points.at(-1);
    const labelEvery = band < 40 ? 2 : 1;

    const svg = h(
      'svg',
      { class: 'chart', width, height: HEIGHT, viewBox: `0 0 ${width} ${HEIGHT}` },
      ticks.map((t) =>
        h(
          'g',
          {},
          h('line', { class: 'chart-grid', x1: margin.left, x2: width - margin.right, y1: y(t), y2: y(t) }),
          h('text', { class: 'chart-tick', x: margin.left - 8, y: y(t), 'text-anchor': 'end', 'dominant-baseline': 'middle' }, String(t)),
        ),
      ),
      hovers,
      h('line', { class: 'chart-target', x1: margin.left, x2: width - margin.right, y1: y(target), y2: y(target) }),
      h('text', { class: 'chart-target-label', x: width - margin.right, y: y(target) - 6, 'text-anchor': 'end' }, `meta ${target}`),
      bars,
      h('text', { class: 'chart-end-label', x: last.x, y: last.y - 8, 'text-anchor': 'middle' }, String(last.datum.value)),
      points.map((p, i) =>
        (data.length - 1 - i) % labelEvery === 0
          ? h('text', { class: 'chart-tick', x: p.x, y: HEIGHT - 6, 'text-anchor': 'middle' }, formatShort(p.datum.date))
          : null,
      ),
    );

    function highlight(i) {
      hovers.forEach((r, j) => r.setAttribute('visibility', j === i ? 'visible' : 'hidden'));
    }
    return { svg, points, highlight };
  }

  return h(
    'figure',
    { class: 'chart-figure' },
    chartShell({
      data,
      summary,
      draw,
      tooltipText: (d) => ({ strong: plural(d.value), sub: `semana de ${formatShort(d.date)}` }),
    }),
    dataTable(data, {
      valueLabel: 'Treinos concluídos',
      unit: '',
      dateLabel: 'Semana de',
    }),
  );
}
