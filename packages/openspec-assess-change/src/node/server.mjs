// Loopback-only static server for the configurator. It serves a fixed allowlist of package
// directories read-only (GET/HEAD), sends a strict same-origin CSP and has no write endpoint.
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, realpathSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { PACKAGE_ROOT } from './config.mjs';
import { isInside } from './fsio.mjs';

export const SERVED_DIRS = ['configurator', 'src/core', 'config', 'schemas', 'examples/golden'];
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};
const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost']);
const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; form-action 'none'; base-uri 'none'; frame-ancestors 'none'";

export function resolveRequestPath(urlPath, root = PACKAGE_ROOT) {
  let p;
  try {
    p = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  } catch {
    return null;
  }
  if (p.includes('\0')) return null;
  const rel = normalize(p).replace(/^[/\\]+/, '');
  if (!SERVED_DIRS.some((d) => rel === d || rel.startsWith(`${d}/`) || rel.startsWith(`${d}\\`))) return null;
  const abs = join(root, rel);
  if (!existsSync(abs) || !statSync(abs).isFile()) return null;
  const real = realpathSync(abs);
  const allowed = SERVED_DIRS.some((d) => existsSync(join(root, d)) && isInside(realpathSync(join(root, d)), real));
  if (!allowed || !TYPES[extname(real)]) return null;
  return real;
}

export function startServer({ host = '127.0.0.1', port = 0, root = PACKAGE_ROOT } = {}) {
  if (!LOOPBACK.has(host)) throw new Error(`configurator binds to loopback only (got ${host})`);
  const server = createServer((req, res) => {
    const headers = {
      'Content-Security-Policy': CSP,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'no-store',
      'Cross-Origin-Resource-Policy': 'same-origin',
    };
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { ...headers, Allow: 'GET, HEAD', 'Content-Type': 'text/plain' });
      res.end('read-only server: only GET and HEAD are allowed\n');
      return;
    }
    const hostHeader = String(req.headers.host || '').replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
    if (!LOOPBACK.has(hostHeader)) {
      res.writeHead(421, { ...headers, 'Content-Type': 'text/plain' });
      res.end('loopback host required\n');
      return;
    }
    if ((req.url || '/').split('?')[0] === '/') {
      res.writeHead(302, { ...headers, Location: '/configurator/index.html' });
      res.end();
      return;
    }
    const file = resolveRequestPath(req.url || '/', root);
    if (!file) {
      res.writeHead(404, { ...headers, 'Content-Type': 'text/plain' });
      res.end('not found\n');
      return;
    }
    const body = readFileSync(file);
    res.writeHead(200, { ...headers, 'Content-Type': TYPES[extname(file)], 'Content-Length': body.length });
    res.end(req.method === 'HEAD' ? undefined : body);
  });
  return new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const addr = server.address();
      const h = addr.family === 'IPv6' ? `[${addr.address}]` : addr.address;
      resolvePromise({
        url: `http://${h}:${addr.port}/configurator/index.html`,
        port: addr.port,
        server,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}
