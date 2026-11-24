// Estado inicial do app. Funções puras: nada de DOM ou localStorage em domain/.

const DEFAULTS = { sets: 2, reps: '8–12', load: null, rest: 75 };
const DEFAULT_CARDIO = '10 min de caminhada leve';

const PLAN_EXERCISES = {
  A: [
    ['a-supino-maquina', 'Supino na máquina'],
    ['a-remada-sentada', 'Remada sentada'],
    ['a-puxada-frontal', 'Puxada frontal'],
    ['a-desenvolvimento-maquina', 'Desenvolvimento na máquina'],
    ['a-prancha', 'Prancha', { reps: '15–20 s' }],
  ],
  B: [
    ['b-leg-press', 'Leg press'],
    ['b-cadeira-flexora', 'Cadeira flexora'],
    ['b-cadeira-extensora', 'Cadeira extensora'],
    ['b-elevacao-quadril', 'Elevação de quadril'],
    ['b-panturrilha-sentada', 'Panturrilha sentada'],
  ],
};

export const DEFAULT_WEEK_TEMPLATE = ['A', 'B', null, 'A', 'B', null, null];

function buildPlan(type) {
  return {
    cardio: DEFAULT_CARDIO,
    exercises: PLAN_EXERCISES[type].map(([id, name, overrides]) => ({
      id,
      name,
      ...DEFAULTS,
      ...overrides,
    })),
  };
}

/** Novo estado vazio: sem sessões, medidas ou diário. Sempre devolve uma cópia nova. */
export function createInitialState() {
  return {
    goal: 'Emagrecer e definir',
    target: 4,
    timezone: 'America/Sao_Paulo',
    weekTemplate: [...DEFAULT_WEEK_TEMPLATE],
    plans: { A: buildPlan('A'), B: buildPlan('B') },
    sessions: {},
    measurements: [],
    notes: [],
  };
}
