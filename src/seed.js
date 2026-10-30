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
    ministries: DEFAULT_MINISTRIES.map((m) => ({ id: globalThis.crypto.randomUUID(), ...m })),
    people: [],
    commitments: [],
  };
}
