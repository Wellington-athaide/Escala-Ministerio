// Versão para o navegador (artefato): mesma API e mesmas regras, com os dados em localStorage.
// O bundle é gerado por scripts/build-artifact.mjs.
import { createRoutes, dispatch } from './routes.js';
import { emptyDb } from './seed.js';

const KEY = 'escalas-da-igreja:v1';

// Só as pessoas são guardadas. Dados antigos de outras telas são ignorados.
function load() {
  try {
    const stored = localStorage.getItem(KEY);
    return stored ? { people: JSON.parse(stored).people ?? [] } : emptyDb();
  } catch {
    return emptyDb();
  }
}

const db = load();
const routes = createRoutes(db);
const save = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    // Sem armazenamento disponível: os dados continuam válidos só nesta aba.
  }
};

window.localApi = async (method, url, body) => {
  const { status, data } = dispatch(routes, { method, url, body: body ?? {}, save });
  if (status >= 400) throw new Error(data.error);
  // Cópia, como a resposta JSON do servidor: quem chama não altera o banco por engano.
  return structuredClone(data);
};
