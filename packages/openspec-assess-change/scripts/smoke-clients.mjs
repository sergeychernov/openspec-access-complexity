#!/usr/bin/env node
// Smoke discovery of the installed skill in Codex, Claude Code and Antigravity — without inference.
//
//   node scripts/smoke-clients.mjs --project <dir> [--clients codex,claude-code,antigravity]
//
// 1. scripts/install-skill.mjs --check: every client location resolves to the same SKILL.md digest and
//    version identity (the CLI is run from that location).
// 2. Each client lists the skill by its own discovery, without a model call:
//    - Codex:       `codex debug prompt-input` renders the model-visible input (incl. the skills list)
//                   locally; no request is sent.
//    - Antigravity: `agy acp` (Agent Client Protocol) receives only initialize + session/new and reports
//                   available commands; no session/prompt is ever sent.
//    - Claude Code: `claude -p --output-format stream-json` is started with ANTHROPIC_BASE_URL pointing
//                   at a closed local port and a dummy API key, and killed right after the system/init
//                   event that lists skills — no model can be reached.
// The description each client reports must equal the description in the installed SKILL.md.
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check } from './install-skill.mjs';

const NAME = 'openspec-assess-change';
const shell = process.platform === 'win32';

function descriptionOf(skillMd) {
  const m = /^---\n([\s\S]*?)\n---/.exec(readFileSync(skillMd, 'utf8').replace(/\r\n/g, '\n'));
  const d = m && /^description:\s*(.*)$/m.exec(m[1]);
  return d ? d[1].trim() : null;
}

function version(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', shell });
  return r.status === 0 ? (r.stdout || r.stderr).trim().split('\n')[0] : null;
}

export function probeCodex(project) {
  const r = spawnSync('codex', ['debug', 'prompt-input'], { cwd: project, encoding: 'utf8', shell, maxBuffer: 64 * 1024 * 1024 });
  if (r.error || r.status !== 0) return { ok: false, reason: r.error ? `codex not runnable (${r.error.code})` : `codex exited ${r.status}: ${(r.stderr || '').slice(0, 300)}` };
  const text = r.stdout;
  const line = new RegExp(`- ${NAME}: (.*?) \\(file: (r\\d+)/${NAME}/SKILL\\.md\\)`).exec(text.replace(/\\n/g, '\n').replace(/\\"/g, '"'));
  if (!line) return { ok: false, reason: 'skill not in the rendered skills list' };
  const root = new RegExp(`${line[2]}\` = \`([^\`]+)\``).exec(text);
  return { ok: true, version: version('codex', ['--version']), description: line[1], root: root ? root[1] : null, inference: 'none (local render)' };
}

export function probeAntigravity(project, ms = 15000) {
  return new Promise((done) => {
    const child = spawn('agy', ['acp'], { cwd: project, shell, stdio: ['pipe', 'pipe', 'pipe'] });
    let buf = '';
    const cmds = [];
    child.on('error', (e) => done({ ok: false, reason: `agy not runnable (${e.code})` }));
    child.stdout.on('data', (d) => {
      buf += d.toString('utf8');
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        if (msg.id === 1 && msg.result) child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'session/new', params: { cwd: project, mcpServers: [] } })}\n`);
        const u = msg.params && msg.params.update;
        if (u && u.sessionUpdate === 'available_commands_update') cmds.push(...(u.availableCommands || []));
      }
    });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: 1, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false } } })}\n`);
    setTimeout(() => {
      child.kill();
      const skill = cmds.find((c) => c.name === NAME);
      done(skill
        ? { ok: true, version: version('agy', ['--version']), description: skill.description, inference: 'none (no session/prompt sent)' }
        : { ok: false, reason: `skill not in ACP available commands (${cmds.map((c) => c.name).join(', ') || 'none'}); Antigravity does not follow a symlinked skill folder — install with --mode copy` });
    }, ms);
  });
}

export function probeClaude(project) {
  return new Promise((done) => {
    const env = {
      ...process.env, ANTHROPIC_BASE_URL: 'http://127.0.0.1:9', ANTHROPIC_API_KEY: 'dummy-key-no-inference', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', DISABLE_TELEMETRY: '1', DISABLE_AUTOUPDATER: '1',
    };
    delete env.ANTHROPIC_AUTH_TOKEN;
    delete env.CLAUDE_CODE_OAUTH_TOKEN;
    const child = spawn('claude', ['-p', 'noop', '--output-format', 'stream-json', '--verbose', '--max-turns', '1'], { cwd: project, env, shell, stdio: ['ignore', 'pipe', 'pipe'] });
    let buf = '';
    let finished = false;
    const finish = (r) => { if (!finished) { finished = true; child.kill('SIGKILL'); done(r); } };
    child.on('error', (e) => finish({ ok: false, reason: `claude not runnable (${e.code})` }));
    child.stdout.on('data', (d) => {
      buf += d.toString('utf8');
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        if (msg.type === 'system' && msg.subtype === 'init') {
          const listed = (msg.skills || []).includes(NAME) || (msg.slash_commands || []).includes(NAME);
          finish(listed
            ? { ok: true, version: msg.claude_code_version || version('claude', ['--version']), apiKeySource: msg.apiKeySource, inference: 'none (API at closed 127.0.0.1:9, killed after init)' }
            : { ok: false, reason: 'skill not in the init skills list' });
        }
      }
    });
    setTimeout(() => finish({ ok: false, reason: 'no init event within 30 s' }), 30000);
  });
}

async function main() {
  const argv = process.argv.slice(2);
  const get = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  if (!get('--project')) { process.stderr.write('usage: smoke-clients.mjs --project <dir> [--clients codex,claude-code,antigravity]\n'); process.exit(2); }
  const project = realpathSync(resolve(get('--project')));
  const clients = (get('--clients') || 'codex,claude-code,antigravity').split(',');
  const files = check({ project, clients });
  const expected = descriptionOf(join(project, '.agents', 'skills', NAME, 'SKILL.md')) || descriptionOf(join(project, '.claude', 'skills', NAME, 'SKILL.md'));
  const out = { project, files, clients: {} };
  if (clients.includes('codex')) out.clients.codex = probeCodex(project);
  if (clients.includes('antigravity')) out.clients.antigravity = await probeAntigravity(project);
  if (clients.includes('claude-code')) out.clients['claude-code'] = await probeClaude(project);
  for (const r of Object.values(out.clients)) if (r.ok && r.description !== undefined && r.description !== expected) { r.ok = false; r.reason = 'reported description differs from SKILL.md'; }
  out.ok = files.consistent && Object.values(out.clients).every((r) => r.ok);
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  process.exitCode = out.ok ? 0 : 1;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main();
