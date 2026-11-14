// Stable factor IDs (profile schemaVersion 1) and the 0-4 rubric anchors.
// Changing IDs or anchor semantics requires a new profile schema version.

export const LEVEL_MIN = 0;
export const LEVEL_MAX = 4;

export const FACT_KINDS = ['measured', 'declared', 'estimated'];
export const VALUE_STATES = ['known', 'unknown', 'not-applicable'];
export const STAGES = ['planning', 'verification'];

// Judgment factors are filled by the agent with a level 0..4 plus evidence.
// "volume" is derived from quantities through explicit thresholds (complexityRules.volumeThresholds).
export const JUDGMENT_FACTORS = [
  'domains',
  'layers',
  'architecture',
  'logic',
  'compatibility',
  'testability',
  'consequences',
  'uncertainty',
];
export const DERIVED_FACTORS = ['volume'];
export const FACTOR_IDS = ['volume', ...JUDGMENT_FACTORS];

export const QUANTITY_IDS = ['tasks', 'files', 'diffLines', 'generatedFiles'];
// Quantities that contribute to the derived volume level (generated files are reported separately).
export const VOLUME_QUANTITIES = ['tasks', 'files', 'diffLines'];

export const LAYER_CATEGORIES = [
  'ui', 'api', 'domain', 'data', 'infrastructure', 'build', 'config', 'docs', 'tests', 'security', 'tooling',
];

export const EVIDENCE_KINDS = ['artifact', 'requirement', 'task', 'file', 'diff', 'check-result'];

// Rubric anchors: what each level means for each factor. "not-applicable" is used when the
// factor is absent (with a rationale); level 0 means minimal difficulty of an applicable factor.
export const RUBRIC = {
  volume: {
    title: 'Объём',
    derived: true,
    anchors: [
      'Минимальный объём: 1 задача, ~1 файл, до ~50 строк diff.',
      'Небольшой: несколько задач, 2–4 файла, до ~300 строк.',
      'Средний: 5–12 файлов или до ~1200 строк.',
      'Крупный: 13–40 файлов или до ~5000 строк.',
      'Очень крупный: более 40 файлов или 5000+ строк.',
    ],
  },
  domains: {
    title: 'Домены и связи',
    anchors: [
      'Один домен, связи с другими не меняются.',
      'Один домен с незначительной связью с соседним.',
      'Два домена или изменение существенной связи между ними.',
      'Три и более доменов либо изменение границ ответственности.',
      'Сквозное изменение многих доменов с перестройкой их взаимодействия.',
    ],
  },
  layers: {
    title: 'Слои и пересечения границ',
    anchors: [
      'Одна категория слоёв, без пересечения границ.',
      'Одна категория с локальным касанием соседней (например, тест к изменённому коду).',
      'Две категории с одним пересечением границы (например, api ↔ data).',
      'Три и более категорий или несколько пересечений границ.',
      'Сквозное изменение через большинство слоёв с согласованием контрактов на каждом.',
    ],
  },
  architecture: {
    title: 'Архитектурные изменения',
    anchors: [
      'Нет новых компонентов, контрактов и зависимостей.',
      'Локальное изменение внутри существующего компонента.',
      'Новый компонент или изменение внутреннего контракта.',
      'Изменение ответственности компонентов или внешних зависимостей.',
      'Новая архитектура подсистемы или перестройка ключевых контрактов.',
    ],
  },
  logic: {
    title: 'Сложность логики',
    anchors: [
      'Механические правки без нового поведения.',
      'Простое ветвление или преобразование данных.',
      'Нетривиальный алгоритм или state machine среднего размера.',
      'Сложные алгоритмы, конкурентность или инварианты с многими состояниями.',
      'Распределённое состояние, конкурентность с гонками или формально тонкие инварианты.',
    ],
  },
  compatibility: {
    title: 'Совместимость и миграции',
    anchors: [
      'Внутреннее изменение без влияния на публичные контракты и данные.',
      'Аддитивное изменение публичного API/формата.',
      'Изменение формата с обратной совместимостью или простая миграция данных.',
      'Ломающее изменение с планом миграции или преобразованием сохранённых данных.',
      'Необратимая миграция данных или ломающее изменение многих потребителей.',
    ],
  },
  testability: {
    title: 'Проверяемость (сложность проверки)',
    anchors: [
      'Есть точный тестовый oracle, проверка локальна и быстра.',
      'Oracle есть, нужны небольшие fixtures.',
      'Нужны integration-проверки или неполный oracle.',
      'Runtime-зависимости, сложное воспроизведение, частично ручная проверка.',
      'Нет надёжного oracle; проверка требует внешних систем или наблюдения в эксплуатации.',
    ],
  },
  consequences: {
    title: 'Последствия ошибки',
    anchors: [
      'Ошибка заметна сразу и безвредна (например, опечатка в документации).',
      'Локальный дефект, легко откатывается.',
      'Дефект затрагивает пользователей функции; откат возможен.',
      'Безопасность, целостность данных или широкий blast radius; откат сложен.',
      'Утечка/потеря данных, обход авторизации или необратимые последствия.',
    ],
  },
  uncertainty: {
    title: 'Неопределённость',
    anchors: [
      'Все решения закрыты, acceptance criteria полные.',
      'Мелкие открытые детали без влияния на дизайн.',
      'Есть открытые решения или неизвестные зависимости с ограниченным влиянием.',
      'Существенные открытые решения; acceptance criteria неполны.',
      'Ключевые решения и зависимости неизвестны; объём работ не определён.',
    ],
  },
};

export function levelOf(quantity, thresholds) {
  // thresholds: ascending array of 4 upper bounds for levels 0..3; above the last -> 4
  let level = 0;
  for (const t of thresholds) {
    if (quantity > t) level += 1;
  }
  return Math.min(level, LEVEL_MAX);
}
