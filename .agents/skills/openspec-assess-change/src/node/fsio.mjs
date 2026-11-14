// Node-only file helpers: digests, strict JSON I/O, path containment and atomic writes.
import { createHash, randomBytes } from 'node:crypto';
import {
  readFileSync, writeFileSync, renameSync, existsSync, realpathSync, lstatSync, statSync, openSync, fsyncSync, closeSync, rmSync, mkdirSync,
} from 'node:fs';
import { dirname, join, resolve, relative, sep, isAbsolute, basename } from 'node:path';
import { parseJsonStrict, canonicalStringify } from '../core/canonical.mjs';

export class AssessError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'AssessError';
    this.code = code;
    this.details = details;
  }
}

export function sha256Hex(data) {
  return createHash('sha256').update(data).digest('hex');
}

export function sha256(data) {
  return `sha256:${sha256Hex(data)}`;
}

export const canonicalDigest = (value) => sha256(canonicalStringify(value));

// tasks.md progress ticks ("- [x]") do not change the meaning of a plan; they are normalised away so
// that ticking tasks during apply does not make the planning evidence stale. Text changes still do.
export function normalizeTasksText(text) {
  return text.replace(/\r\n/g, '\n').replace(/^(\s*[-*]\s+)\[[xX]\]/gm, '$1[ ]');
}

// Digest of a source file as used for evidence and freshness. tasks.md is normalised (see above);
// every other file is hashed byte for byte.
export function sourceDigest(absPath) {
  const buf = readFileSync(absPath);
  if (basename(absPath) === 'tasks.md') return sha256(normalizeTasksText(buf.toString('utf8')));
  return sha256(buf);
}

export function readJsonFile(path, label = path) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (e) {
    throw new AssessError('io', `${label}: cannot read (${e.code || e.message})`);
  }
  return parseJsonStrict(text, label);
}

export function canonicalBytes(value) {
  return canonicalStringify(value, { pretty: true });
}

// Real path of `p`, or of its nearest existing ancestor joined with the missing tail.
export function realpathLoose(p) {
  const abs = resolve(p);
  const tail = [];
  let cur = abs;
  while (!existsSync(cur)) {
    const parent = dirname(cur);
    if (parent === cur) break;
    tail.unshift(basename(cur));
    cur = parent;
  }
  return join(realpathSync(cur), ...tail);
}

// True when two paths name the same file system entry. When both exist the file identity (device +
// inode / Windows file index) decides, so 8.3 short names (C:\\Users\\RUNNER~1), case, separators,
// symlinks, junctions and hard links cannot hide that an output would overwrite an input. Otherwise the
// resolved paths are compared (case- and separator-insensitive on Windows).
export function samePath(a, b) {
  if (!a || !b) return false;
  const id = (p) => {
    try {
      const st = statSync(p, { bigint: true });
      return st.ino === 0n ? null : `${st.dev}:${st.ino}`;
    } catch {
      return null;
    }
  };
  const ia = id(a);
  const ib = id(b);
  if (ia !== null && ib !== null) return ia === ib;
  const norm = (p) => {
    let r = realpathLoose(p);
    if (process.platform === 'win32') {
      try { r = realpathSync.native(r); } catch { /* not existing: keep the loose form */ }
      r = r.replace(/\//g, '\\').toLowerCase();
    }
    return r;
  };
  return norm(a) === norm(b);
}

export function isInside(root, target) {
  const rel = relative(root, target);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

// Throws unless `target` (after resolving symlinks of every existing component) stays inside `root`.
export function assertContained(root, target, label = target) {
  const realRoot = realpathSync(root);
  const realTarget = realpathLoose(target);
  if (!isInside(realRoot, realTarget)) {
    throw new AssessError('containment', `${label} resolves outside ${realRoot} (to ${realTarget}); refusing to write`);
  }
  return realTarget;
}

export function isSymlink(p) {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

function fsyncPath(p) {
  let fd;
  try {
    fd = openSync(p, 'r');
    fsyncSync(fd);
  } catch {
    // Directories cannot be fsynced on every platform (Windows); best effort.
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

// Write bytes to a temporary sibling, fsync, then rename over the target (atomic on one filesystem).
export function atomicWriteFile(path, data) {
  const tmp = join(dirname(path), `.${basename(path)}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`);
  writeFileSync(tmp, data);
  fsyncPath(tmp);
  try {
    renameSync(tmp, path);
  } catch (e) {
    rmSync(tmp, { force: true });
    throw e;
  }
  fsyncPath(dirname(path));
}

export function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

export function toPosix(p) {
  return p.split(sep).join('/');
}
