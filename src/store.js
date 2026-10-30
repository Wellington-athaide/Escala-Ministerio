import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';

const DEFAULT_MINISTRIES = [
  { name: 'Louvor', color: '#2563eb', isMedia: false },
  { name: 'Intercessão', color: '#9333ea', isMedia: false },
  { name: 'Recepção', color: '#16a34a', isMedia: false },
  { name: 'Infantil', color: '#ea580c', isMedia: false },
  { name: 'Juniores', color: '#0891b2', isMedia: false },
  { name: 'Jovens', color: '#db2777', isMedia: false },
  { name: 'Mídia', color: '#dc2626', isMedia: true },
];

export function emptyDb() {
  return {
    ministries: DEFAULT_MINISTRIES.map((m) => ({ id: randomUUID(), ...m })),
    people: [],
    commitments: [],
  };
}

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
