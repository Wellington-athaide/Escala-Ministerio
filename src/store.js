import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { emptyDb } from './seed.js';

// Arquivo JSON simples. Escrita via arquivo temporário + rename para não corromper os dados.
export function openStore(file) {
  const db = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : emptyDb();
  const save = () => {
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(db, null, 2));
    renameSync(tmp, file);
  };
  if (!existsSync(file)) save();
  return { db, save };
}
