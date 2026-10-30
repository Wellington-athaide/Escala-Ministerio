import { createServer as createHttpServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as service from './service.js';
import { ServiceError } from './service.js';

const INDEX_HTML = fileURLToPath(new URL('../public/index.html', import.meta.url));
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const READ_ONLY_POSTS = new Set(['/api/generate', '/api/import/preview']);

export function createServer({ db, save }) {
  const routes = [
    { method: 'GET', path: '/api/ministries', run: () => service.listMinistries(db) },
    { method: 'POST', path: '/api/ministries', status: 201, run: (_p, body) => service.createMinistry(db, body) },
    { method: 'PUT', path: '/api/ministries/:id', run: (p, body) => service.updateMinistry(db, p.id, body) },
    { method: 'DELETE', path: '/api/ministries/:id', run: (p) => service.deleteMinistry(db, p.id) },

    { method: 'GET', path: '/api/people', run: (_p, _b, q) => service.listPeople(db, q.get('q') ?? '') },
    { method: 'POST', path: '/api/people', status: 201, run: (_p, body) => service.createPerson(db, body) },
    { method: 'PUT', path: '/api/people/:id', run: (p, body) => service.updatePerson(db, p.id, body) },
    { method: 'DELETE', path: '/api/people/:id', run: (p) => service.deletePerson(db, p.id) },

    { method: 'GET', path: '/api/commitments', run: (_p, _b, q) => service.listCommitments(db, Object.fromEntries(q)) },
    { method: 'POST', path: '/api/commitments', status: 201, run: (_p, body) => service.createCommitment(db, body) },
    { method: 'PUT', path: '/api/commitments/:id', run: (p, body) => service.updateCommitment(db, p.id, body) },
    { method: 'DELETE', path: '/api/commitments/:id', run: (p) => service.deleteCommitment(db, p.id) },

    { method: 'GET', path: '/api/conflicts', run: (_p, _b, q) => service.listConflicts(db, Object.fromEntries(q)) },
    { method: 'POST', path: '/api/generate', run: (_p, body) => service.generateMediaTeam(db, body) },
    { method: 'POST', path: '/api/import/preview', run: (_p, body) => service.previewImport(db, body.text) },
    { method: 'POST', path: '/api/import/commit', status: 201, run: (_p, body) => service.commitImport(db, body) },
  ].map((route) => ({ ...route, pattern: compile(route.path) }));

  return createHttpServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
        return send(res, 200, readFileSync(INDEX_HTML), 'text/html; charset=utf-8');
      }
      if (!url.pathname.startsWith('/api/')) return send(res, 404, { error: 'rota não encontrada' });

      const matches = routes.filter((route) => route.pattern.regex.test(url.pathname));
      if (!matches.length) return send(res, 404, { error: 'rota não encontrada' });
      const route = matches.find((r) => r.method === req.method);
      if (!route) return send(res, 405, { error: 'método não permitido' });

      const params = route.pattern.extract(url.pathname);
      const body = req.method === 'GET' || req.method === 'DELETE' ? {} : await readJson(req);
      const result = route.run(params, body, url.searchParams);

      if (req.method !== 'GET' && !READ_ONLY_POSTS.has(url.pathname)) save();
      if (result === undefined) return send(res, 204);
      return send(res, route.status ?? 200, result);
    } catch (error) {
      if (error instanceof ServiceError) return send(res, error.status, { error: error.message, details: error.details });
      console.error(error);
      return send(res, 500, { error: 'erro interno' });
    }
  });
}

function compile(path) {
  const names = [];
  const source = path.replace(/:([a-zA-Z]+)/g, (_, name) => {
    names.push(name);
    return '([^/]+)';
  });
  const regex = new RegExp(`^${source}$`);
  return {
    regex,
    extract(pathname) {
      const values = pathname.match(regex).slice(1);
      return Object.fromEntries(names.map((name, i) => [name, decodeURIComponent(values[i])]));
    },
  };
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new ServiceError(413, 'corpo da requisição muito grande'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new ServiceError(400, 'JSON inválido'));
      }
    });
    req.on('error', reject);
  });
}

function send(res, status, payload, type = 'application/json; charset=utf-8') {
  const body = payload === undefined ? '' : Buffer.isBuffer(payload) || typeof payload === 'string' ? payload : JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': type, 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}
