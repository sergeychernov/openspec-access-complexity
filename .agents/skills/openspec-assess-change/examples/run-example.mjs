#!/usr/bin/env node
// Reproducible end-to-end example: change → profile → four rankings → OpenSpec archive → replay.
// Runs in a temporary copy of examples/demo-project; needs only Node.js, Git and the OpenSpec CLI.
// No network, no credentials, no model calls.
//
//   node examples/run-example.mjs                 # run and compare with examples/golden/
//   node examples/run-example.mjs --update-golden # rewrite examples/golden/ after an intended change
//   node examples/run-example.mjs --keep          # keep the temporary project and print its path
import { spawnSync } from 'node:child_process';
import {
  cpSync, mkdtempSync, readFileSync, writeFileSync, readdirSync, statSync, realpathSync, rmSync, mkdirSync, existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const BIN = join(HERE, '..', 'bin', 'openspec-assess.mjs');
const GOLDEN = join(HERE, 'golden');
const CHANGE = 'add-shout-flag';
const AS_OF = '2026-11-14T12:00:00Z';
const OPENSPEC = process.env.OPENSPEC_BIN || 'openspec';

const args = new Set(process.argv.slice(2));
const log = (s) => process.stdout.write(`${s}\n`);

function sh(cmd, argv, cwd, { json = false } = {}) {
  const r = spawnSync(cmd, argv, { cwd, encoding: 'utf8', shell: process.platform === 'win32' && cmd === OPENSPEC, env: { ...process.env, NO_COLOR: '1' } });
  if (r.error) throw new Error(`${cmd}: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`${cmd} ${argv.join(' ')} exited ${r.status}\n${r.stdout}${r.stderr}`);
  return json ? JSON.parse(r.stdout) : r.stdout;
}
const assess = (cwd, ...a) => sh(process.execPath, [BIN, ...a], cwd, { json: a.includes('--json') });
const git = (cwd, ...a) => sh('git', ['-c', 'user.email=example@example.invalid', '-c', 'user.name=example', '-c', 'commit.gpgsign=false', ...a], cwd);

function digests(dir) {
  const out = {};
  const walk = (d, rel) => {
    for (const n of readdirSync(d).sort()) {
      const p = join(d, n);
      const r = rel ? `${rel}/${n}` : n;
      if (statSync(p).isDirectory()) walk(p, r);
      else out[r] = createHash('sha256').update(readFileSync(p)).digest('hex');
    }
  };
  walk(dir, '');
  return out;
}

export function runExample({ keep = false } = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'openspec-assess-example-')));
  try {
    cpSync(join(HERE, 'demo-project'), dir, { recursive: true });
    git(dir, 'init', '-q');
    git(dir, 'add', '-A');
    git(dir, 'commit', '-qm', 'demo project with planned change');
    log(`1. Demo project in ${keep ? dir : 'a temporary directory'}; OpenSpec ${sh(OPENSPEC, ['--version'], dir).trim()}`);

    const pin = assess(dir, 'pin-evidence', '--change', CHANGE, '--json');
    log(`2. Pinned ${pin.pinned.length} evidence digests into assessment/profile.json`);
    assess(dir, 'validate-profile', '--change', CHANGE);
    log('3. Profile is valid (structure, ranges, references, local digests)');

    const run = assess(dir, 'assess', '--change', CHANGE, '--as-of', AS_OF, '--json');
    log(`4. Assessment ${run.assessmentId}`);
    for (const [key, r] of Object.entries(run.report.rankings)) {
      log(`   ${key.padEnd(20)} ${r.status.padEnd(16)} top: ${r.recommended ? `${r.recommended.candidateId} @${r.recommended.effort}` : '—'}`);
    }
    const fresh = assess(dir, 'check-freshness', '--change', CHANGE, '--json');
    log(`5. Freshness: ${fresh.status}`);

    const changeRoot = join(dir, 'openspec', 'changes', CHANGE);
    const before = digests(join(changeRoot, 'assessment'));
    const tasks = join(changeRoot, 'tasks.md');
    writeFileSync(tasks, readFileSync(tasks, 'utf8').replace(/- \[ \]/g, '- [x]'));
    const archived = sh(OPENSPEC, ['archive', CHANGE, '--yes', '--json'], dir, { json: true });
    const archiveRoot = archived.archive.path;
    const after = digests(join(archiveRoot, 'assessment'));
    const same = JSON.stringify(before) === JSON.stringify(after);
    if (!same) throw new Error('assessment files changed during archive');
    log(`6. openspec archive → changes/archive/${archived.archive.archivedAs}: ${Object.keys(after).length} assessment files, digests unchanged`);

    writeFileSync(join(dir, 'src', 'greet.mjs'), '// the repository moved on after the archive\n');
    const replay = assess(dir, 'replay', join(archiveRoot, 'assessment'), '--json');
    if (!replay.reproduced) throw new Error(`replay mismatch: ${replay.mismatches.join(', ')}`);
    log(`7. Replay from the archive reproduced ${replay.assessmentId} byte for byte (working tree has changed since)`);

    const runDir = join(archiveRoot, 'assessment', 'runs', run.assessmentId);
    return {
      dir,
      assessmentId: run.assessmentId,
      files: {
        'assessment-id.txt': `${run.assessmentId}\n`,
        'report.json': readFileSync(join(runDir, 'report.json'), 'utf8'),
        'report.md': readFileSync(join(runDir, 'report.md'), 'utf8'),
        'profile.json': readFileSync(join(runDir, 'profile.json'), 'utf8'),
        'overrides.json': readFileSync(join(archiveRoot, 'assessment', 'overrides.json'), 'utf8'),
      },
    };
  } finally {
    if (!keep) rmSync(dir, { recursive: true, force: true });
  }
}

export function compareGolden(files) {
  const diffs = [];
  for (const [name, text] of Object.entries(files)) {
    const p = join(GOLDEN, name);
    if (!existsSync(p)) diffs.push(`${name}: golden file missing`);
    else if (readFileSync(p, 'utf8') !== text) diffs.push(`${name}: differs from examples/golden/${name}`);
  }
  return diffs;
}

// Run as a script (not imported)? Compares resolved paths; case-insensitive on Windows.
function isMain() {
  if (!process.argv[1]) return false;
  const a = realpathSync(process.argv[1]);
  const b = realpathSync(fileURLToPath(import.meta.url));
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

if (isMain()) {
  const result = runExample({ keep: args.has('--keep') });
  if (args.has('--update-golden')) {
    mkdirSync(GOLDEN, { recursive: true });
    for (const [n, t] of Object.entries(result.files)) writeFileSync(join(GOLDEN, n), t);
    log('8. Golden files updated in examples/golden/');
  } else {
    const diffs = compareGolden(result.files);
    if (diffs.length) {
      log(`8. Golden mismatch:\n   ${diffs.join('\n   ')}`);
      process.exit(1);
    }
    log('8. Result matches examples/golden/ (assessment id, report.json, report.md)');
  }
  if (args.has('--keep')) log(`Kept: ${result.dir}`);
}
