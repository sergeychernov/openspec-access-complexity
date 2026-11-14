// Profile skeleton: every quantity and factor starts as "unknown" (never 0) so that nothing is
// silently assumed. The agent replaces each entry with a level, rationale and evidence per the rubric.
import { JUDGMENT_FACTORS, QUANTITY_IDS } from '../core/factors.mjs';
import { KINDS, SCHEMA_VERSIONS } from '../core/schemas.mjs';

export function profileTemplate({ change, stage = 'planning' }) {
  const evidence = [
    { id: 'proposal', kind: 'artifact', base: 'change', path: 'proposal.md', note: 'proposal: why and what changes' },
    { id: 'tasks', kind: 'artifact', base: 'change', path: 'tasks.md', note: 'task list (scope)' },
  ];
  if (stage === 'verification') {
    evidence.push({ id: 'diff', kind: 'diff', revision: 'REPLACE-WITH-BASE-REVISION', note: 'actual implementation diff against the base revision' });
  }
  return {
    kind: KINDS.profile,
    schemaVersion: SCHEMA_VERSIONS.profile,
    change: { name: change },
    stage,
    scope: { mode: 'all-tasks' },
    evidence,
    quantities: Object.fromEntries(QUANTITY_IDS.map((q) => [q, { state: 'unknown' }])),
    factors: Object.fromEntries(JUDGMENT_FACTORS.map((f) => [f, { state: 'unknown' }])),
  };
}
