// Tela "Evolução": registrar peso e medidas; gráficos de peso, medida, carga
// por exercício e frequência; lista de registros corporais e histórico de cargas.
import { app } from '../app-state.js';
import { h, icon, ICONS } from '../ui/dom.js';
import { field } from '../ui/form.js';
import { formDialog, confirmDialog } from '../ui/dialog.js';
import { showStatus } from '../ui/status.js';
import { emptyState } from '../ui/empty-state.js';
import { lineChart, barChart } from '../ui/chart.js';
import { formatShort, formatNumeric, isValidDate } from '../dates.js';
import { formatNumber } from '../domain/plans.js';
import {
  MEASUREMENT_FIELDS,
  CHART_POINTS,
  FREQUENCY_WEEKS,
  parseMeasurementForm,
  upsertMeasurement,
  removeMeasurement,
  measurementOn,
  measurementList,
  measurementSeries,
  loadHistory,
  loadSeries,
  exerciseOptions,
  frequencySeries,
} from '../domain/progress.js';

// Seleções lembradas enquanto o app está aberto.
const view = { measure: 'waist', exercise: null };

const fieldInfo = (key) => MEASUREMENT_FIELDS.find((f) => f.key === key);
const valueText = (v, unit) => (v === null || v === undefined ? '—' : `${formatNumber(v)} ${unit}`);

// ---------- Registrar / editar medidas ----------

async function onMeasure(rerender, date = app.today()) {
  const existing = measurementOn(app.state, date);
  const inputs = MEASUREMENT_FIELDS.map(({ key, label, unit }) =>
    field({
      label,
      name: key,
      value: existing?.[key] === null || existing?.[key] === undefined ? '' : formatNumber(existing[key]),
      inputmode: 'decimal',
      suffix: unit,
    }),
  );
  const dateField = field({ label: 'Data', name: 'date', type: 'date', value: date, required: true });
  const dateInput = dateField.querySelector('input');
  dateInput.max = app.today();
  const notice = h('p', { class: 'muted', 'aria-live': 'polite' }, existing ? 'Editando o registro desta data.' : '');

  // Trocar a data carrega o registro existente daquela data, se houver.
  dateInput.addEventListener('change', () => {
    if (!isValidDate(dateInput.value)) return;
    const entry = measurementOn(app.state, dateInput.value);
    for (const { key } of MEASUREMENT_FIELDS) {
      const input = inputs.find((el) => el.querySelector(`[name="${key}"]`)).querySelector('input');
      input.value = entry?.[key] === null || entry?.[key] === undefined ? '' : formatNumber(entry[key]);
    }
    notice.textContent = entry ? 'Já existe um registro nesta data: os valores foram carregados para edição.' : '';
  });

  const result = await formDialog({
    title: existing ? 'Editar medidas' : 'Registrar medidas',
    content: [
      dateField,
      notice,
      h('p', { class: 'muted' }, 'Preencha só o que mediu. Um registro por data.'),
      h('div', { class: 'measure-grid' }, inputs),
    ],
    onSubmit: (values) => parseMeasurementForm(values, app.today()),
  });
  if (!result) return rerender('[data-action="measure"]');
  const { state, replaced } = upsertMeasurement(app.state, result);
  if (app.commit(state)) showStatus(replaced ? `Registro de ${formatShort(result.date)} atualizado.` : 'Medidas registradas.');
  rerender('[data-action="measure"]');
}

async function onRemoveMeasurement(date, rerender) {
  const ok = await confirmDialog(`O registro de ${formatShort(date)} sai da lista e dos gráficos.`, {
    title: 'Remover registro?',
    confirmLabel: 'Remover',
    danger: true,
  });
  if (!ok) return rerender(`[data-measurement="${date}"] [data-action="remove"]`);
  if (app.commit(removeMeasurement(app.state, date))) showStatus('Registro removido.');
  rerender('[data-action="measure"]');
}

// ---------- Cartões ----------

function card(id, title, ...content) {
  return h('section', { class: 'card chart-card', 'aria-labelledby': id }, h('h3', { id }, title), content);
}

function select({ label, id, options, value, onChange }) {
  return h(
    'div',
    { class: 'field chart-select' },
    h('label', { for: id }, label),
    h(
      'select',
      { id, onchange: (e) => onChange(e.target.value) },
      options.map((o) => h('option', { value: o.value, selected: o.value === value }, o.label)),
    ),
  );
}

function measurementChart(key, emptyText) {
  const info = fieldInfo(key);
  const data = measurementSeries(app.state, key);
  if (!data.length) return emptyState({ title: `Sem registros de ${info.label.toLowerCase()}`, text: emptyText });
  return lineChart({
    data,
    unit: info.unit,
    valueLabel: `${info.label} (${info.unit})`,
    summary: `${info.label}: ${data.length === 1 ? '1 registro' : `${data.length} registros`}, último ${formatNumber(data.at(-1).value)} ${info.unit} em ${formatShort(data.at(-1).date)}`,
  });
}

function weightCard() {
  return card(
    'chart-weight',
    'Peso',
    h('p', { class: 'muted chart-sub' }, `Últimos ${CHART_POINTS} registros`),
    measurementChart('weight', 'Registre seu peso para acompanhar a evolução.'),
  );
}

function measureCard(rerender) {
  const options = MEASUREMENT_FIELDS.filter((f) => f.key !== 'weight').map((f) => ({ value: f.key, label: f.label }));
  return card(
    'chart-measure',
    'Medidas',
    select({
      label: 'Medida',
      id: 'measure-select',
      options,
      value: view.measure,
      onChange: (v) => {
        view.measure = v;
        rerender('#measure-select');
      },
    }),
    measurementChart(view.measure, 'Registre essa medida para ver o gráfico.'),
  );
}

function loadCard(rerender) {
  const options = exerciseOptions(app.state);
  if (!options.some((o) => o.id === view.exercise)) {
    // Padrão: o primeiro exercício com cargas registradas, senão o primeiro da lista.
    view.exercise = (options.find((o) => loadHistory(app.state, o.id).length) ?? options[0])?.id ?? null;
  }
  if (!view.exercise) {
    return card('chart-load', 'Carga por exercício', emptyState({ title: 'Nenhum exercício', text: 'Cadastre exercícios no Treino AB.' }));
  }
  const current = options.find((o) => o.id === view.exercise);
  const data = loadSeries(app.state, view.exercise);
  const history = loadHistory(app.state, view.exercise);

  return card(
    'chart-load',
    'Carga por exercício',
    select({
      label: 'Exercício',
      id: 'exercise-select',
      options: options.map((o) => ({
        value: o.id,
        label: `${o.name} (${o.plan})${o.inPlan ? '' : ' — fora do modelo'}`,
      })),
      value: view.exercise,
      onChange: (v) => {
        view.exercise = v;
        rerender('#exercise-select');
      },
    }),
    data.length
      ? [
          h('p', { class: 'muted chart-sub' }, `Últimas ${CHART_POINTS} cargas de sessões concluídas`),
          lineChart({
            data,
            unit: 'kg',
            valueLabel: 'Carga (kg)',
            summary: `Carga de ${current.name}: ${data.length === 1 ? '1 registro' : `${data.length} registros`}, última ${formatNumber(data.at(-1).value)} kg em ${formatShort(data.at(-1).date)}`,
          }),
        ]
      : emptyState({
          title: `Sem cargas de ${current.name}`,
          text: 'A carga entra aqui quando o exercício é marcado numa sessão concluída com a carga preenchida.',
        }),
    history.length > CHART_POINTS &&
      h(
        'details',
        { class: 'chart-table' },
        h('summary', {}, `Histórico completo (${history.length} registros)`),
        h(
          'ol',
          { class: 'load-history', reversed: true },
          [...history].reverse().map((d) =>
            h('li', {}, h('a', { href: `#sessao/${d.date}` }, formatNumeric(d.date)), ` · ${formatNumber(d.value)} kg`),
          ),
        ),
      ),
  );
}

function frequencyCard() {
  const data = frequencySeries(app.state, app.today());
  const total = data.reduce((sum, w) => sum + w.value, 0);
  return card(
    'chart-frequency',
    'Frequência',
    h('p', { class: 'muted chart-sub' }, `Treinos concluídos por semana · últimas ${FREQUENCY_WEEKS} semanas`),
    barChart({
      data,
      target: app.state.target,
      summary: `Frequência: ${total} treinos nas últimas ${FREQUENCY_WEEKS} semanas, ${data.at(-1).value} nesta semana, meta de ${app.state.target} por semana`,
    }),
  );
}

function measurementsList(rerender) {
  const list = measurementList(app.state);
  return h(
    'section',
    { class: 'measurements', 'aria-labelledby': 'measurements-title' },
    h('h3', { id: 'measurements-title' }, 'Registros corporais'),
    list.length
      ? h(
          'div',
          { class: 'table-scroll' },
          h(
            'table',
            { class: 'data-table' },
            h(
              'thead',
              {},
              h(
                'tr',
                {},
                h('th', { scope: 'col' }, 'Data'),
                MEASUREMENT_FIELDS.map((f) => h('th', { scope: 'col' }, `${f.label}`)),
                h('th', { scope: 'col' }, h('span', { class: 'visually-hidden' }, 'Ações')),
              ),
            ),
            h(
              'tbody',
              {},
              list.map((m) =>
                h(
                  'tr',
                  { dataset: { measurement: m.date } },
                  h('th', { scope: 'row' }, formatNumeric(m.date)),
                  MEASUREMENT_FIELDS.map((f) => h('td', {}, valueText(m[f.key], f.unit))),
                  h(
                    'td',
                    { class: 'row-actions' },
                    h(
                      'button',
                      {
                        type: 'button',
                        class: 'icon-btn',
                        'aria-label': `Editar registro de ${formatShort(m.date)}`,
                        dataset: { action: 'edit' },
                        onclick: () => onMeasure(rerender, m.date),
                      },
                      icon(ICONS.editar, { size: 18 }),
                    ),
                    h(
                      'button',
                      {
                        type: 'button',
                        class: 'icon-btn danger',
                        'aria-label': `Remover registro de ${formatShort(m.date)}`,
                        dataset: { action: 'remove' },
                        onclick: () => onRemoveMeasurement(m.date, rerender),
                      },
                      icon(ICONS.lixo, { size: 18 }),
                    ),
                  ),
                ),
              ),
            ),
          ),
        )
      : emptyState({ title: 'Nenhum registro corporal', text: 'Registre peso e medidas para acompanhar sua evolução.' }),
  );
}

export function renderEvolucao() {
  const body = h('div', { class: 'progress-screen' });
  const root = h(
    'section',
    { class: 'screen' },
    h('h2', { class: 'screen-title' }, 'Evolução'),
    body,
  );

  function rerender(focusSelector) {
    body.replaceChildren(
      h(
        'button',
        { type: 'button', class: 'btn btn-primary measure-btn', dataset: { action: 'measure' }, onclick: () => onMeasure(rerender) },
        icon(ICONS.mais, { size: 20 }),
        'Registrar medidas',
      ),
      h('div', { class: 'charts' }, weightCard(), measureCard(rerender), loadCard(rerender), frequencyCard()),
      measurementsList(rerender),
    );
    if (focusSelector) body.querySelector(focusSelector)?.focus();
  }

  rerender();
  return root;
}
