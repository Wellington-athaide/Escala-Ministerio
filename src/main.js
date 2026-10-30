import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { openStore } from './store.js';
import { createServer } from './server.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const dataFile = process.env.DATA_FILE ?? join(root, 'data', 'store.json');
const port = Number(process.env.PORT ?? 3000);

const { db, save } = openStore(dataFile);
createServer({ db, save }).listen(port, () => {
  console.log(`Escalas da Igreja em http://localhost:${port} (dados: ${dataFile})`);
});
