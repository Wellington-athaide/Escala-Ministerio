import * as service from './service.js';
import { ServiceError } from './service.js';

const READ_ONLY_POSTS = new Set(['/api/generate', '/api/generate-month']);

// Tabela de rotas da API. Compartilhada pelo servidor Node e pela versão do navegador.
export function createRoutes(db) {
  return [
    { method: 'GET', path: '/api/people', run: (_p, _b, q) => service.listPeople(db, q.get('q') ?? '') },
    { method: 'POST', path: '/api/people', status: 201, run: (_p, body) => service.createPerson(db, body) },
    { method: 'PUT', path: '/api/people/:id', run: (p, body) => service.updatePerson(db, p.id, body) },
    { method: 'DELETE', path: '/api/people/:id', run: (p) => service.deletePerson(db, p.id) },

    { method: 'POST', path: '/api/generate', run: (_p, body) => service.generateMediaTeam(db, body) },
    { method: 'POST', path: '/api/generate-month', run: (_p, body) => service.generateMonth(db, body) },
  ].map((route) => ({ ...route, pattern: compile(route.path) }));
}

// Executa uma requisição contra a API e devolve { status, data }.
// `save` é chamado após operações que alteram os dados.
export function dispatch(routes, { method, url, body = {}, save }) {
  const { pathname, searchParams } = new URL(url, 'http://localhost');
  const matches = routes.filter((route) => route.pattern.regex.test(pathname));
  if (!matches.length) return { status: 404, data: { error: 'rota não encontrada' } };
  const route = matches.find((r) => r.method === method);
  if (!route) return { status: 405, data: { error: 'método não permitido' } };

  try {
    const params = route.pattern.extract(pathname);
    const result = route.run(params, body, searchParams);
    if (method !== 'GET' && !READ_ONLY_POSTS.has(pathname)) save?.();
    if (result === undefined) return { status: 204, data: undefined };
    return { status: route.status ?? 200, data: result };
  } catch (error) {
    if (error instanceof ServiceError) return { status: error.status, data: { error: error.message } };
    console.error(error);
    return { status: 500, data: { error: 'erro interno' } };
  }
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
