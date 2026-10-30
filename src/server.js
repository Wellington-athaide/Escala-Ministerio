import { createServer as createHttpServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ServiceError } from './service.js';
import { createRoutes, dispatch } from './routes.js';

const INDEX_HTML = fileURLToPath(new URL('../public/index.html', import.meta.url));
const MAX_BODY_BYTES = 2 * 1024 * 1024;

export function createServer({ db, save }) {
  const routes = createRoutes(db);

  return createHttpServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
        return send(res, 200, readFileSync(INDEX_HTML), 'text/html; charset=utf-8');
      }
      if (!url.pathname.startsWith('/api/')) return send(res, 404, { error: 'rota não encontrada' });

      const body = req.method === 'GET' || req.method === 'DELETE' ? {} : await readJson(req);
      const { status, data } = dispatch(routes, { method: req.method, url: req.url, body, save });
      return send(res, status, data);
    } catch (error) {
      if (error instanceof ServiceError) return send(res, error.status, { error: error.message });
      console.error(error);
      return send(res, 500, { error: 'erro interno' });
    }
  });
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
