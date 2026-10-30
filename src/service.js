import { checkTiming } from './time.js';
import { DEFAULT_MIN_GAP, findConflicts } from './conflicts.js';
import { proposeTeam } from './scheduling.js';
import { groupEntries, matchPerson, normalizeText, parseImportRows } from './csv-import.js';

export const KINDS = ['escala', 'indisponibilidade', 'evento'];
export const STATUSES = ['confirmada', 'provisoria'];
const PALETTE = ['#2563eb', '#16a34a', '#dc2626', '#9333ea', '#ea580c', '#0891b2', '#db2777', '#65a30d', '#7c3aed', '#0f766e'];

export class ServiceError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const randomUUID = () => globalThis.crypto.randomUUID();

const fail = (message) => {
  throw new ServiceError(400, message);
};

const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

function findById(list, id, label) {
  const item = list.find((x) => x.id === id);
  if (!item) throw new ServiceError(404, `${label} não encontrado`);
  return item;
}

function mediaMinistry(db) {
  return db.ministries.find((m) => m.isMedia) ?? null;
}

// ---------- Ministérios ----------

export function listMinistries(db) {
  return db.ministries;
}

function applyMinistry(db, current, input) {
  const name = text(input.name ?? current?.name, 80);
  if (!name) fail('nome do ministério é obrigatório');
  if (db.ministries.some((m) => m.id !== current?.id && normalizeText(m.name) === normalizeText(name))) {
    throw new ServiceError(409, 'já existe um ministério com esse nome');
  }
  const isMedia = Boolean(input.isMedia ?? current?.isMedia);
  if (isMedia && db.ministries.some((m) => m.isMedia && m.id !== current?.id)) {
    throw new ServiceError(409, 'já existe um ministério marcado como mídia');
  }
  const color = /^#[0-9a-fA-F]{6}$/.test(input.color ?? '') ? input.color : (current?.color ?? PALETTE[db.ministries.length % PALETTE.length]);
  return { id: current?.id ?? randomUUID(), name, color, isMedia };
}

export function createMinistry(db, input) {
  const ministry = applyMinistry(db, null, input);
  db.ministries.push(ministry);
  return ministry;
}

export function updateMinistry(db, id, input) {
  const current = findById(db.ministries, id, 'ministério');
  const updated = applyMinistry(db, current, input);
  Object.assign(current, updated);
  return current;
}

export function deleteMinistry(db, id) {
  findById(db.ministries, id, 'ministério');
  if (db.commitments.some((c) => c.ministryId === id)) {
    throw new ServiceError(409, 'o ministério possui escalas cadastradas e não pode ser removido');
  }
  db.ministries = db.ministries.filter((m) => m.id !== id);
}

// ---------- Pessoas (cadastro único, compartilhado por todos os ministérios) ----------

export function listPeople(db, query = '') {
  const q = normalizeText(query);
  if (!q) return db.people;
  return db.people.filter((p) => normalizeText([p.name, ...(p.aliases ?? [])].join(' ')).includes(q));
}

function applyPerson(db, current, input) {
  const name = text(input.name ?? current?.name, 120);
  if (!name) fail('nome da pessoa é obrigatório');
  if (db.people.some((p) => p.id !== current?.id && normalizeText(p.name) === normalizeText(name))) {
    throw new ServiceError(409, 'já existe uma pessoa cadastrada com esse nome');
  }
  const aliases = Array.isArray(input.aliases ?? current?.aliases)
    ? (input.aliases ?? current.aliases).map((a) => text(a, 120)).filter(Boolean)
    : [];
  return { id: current?.id ?? randomUUID(), name, aliases };
}

export function createPerson(db, input) {
  const person = applyPerson(db, null, input);
  db.people.push(person);
  return person;
}

export function updatePerson(db, id, input) {
  const current = findById(db.people, id, 'pessoa');
  Object.assign(current, applyPerson(db, current, input));
  return current;
}

export function deletePerson(db, id) {
  findById(db.people, id, 'pessoa');
  if (db.commitments.some((c) => (c.people ?? []).some((p) => p.personId === id))) {
    throw new ServiceError(409, 'a pessoa está em escalas ou indisponibilidades cadastradas');
  }
  db.people = db.people.filter((p) => p.id !== id);
}

// ---------- Compromissos (escalas, indisponibilidades e eventos) ----------

function validateCommitment(db, input, current) {
  const pick = (field, max) => (input[field] !== undefined ? text(input[field], max) : (current?.[field] ?? ''));

  const kind = input.kind ?? current?.kind ?? 'escala';
  if (!KINDS.includes(kind)) fail('tipo de compromisso inválido');

  const status = input.status ?? current?.status ?? 'confirmada';
  if (!STATUSES.includes(status)) fail('status deve ser confirmada ou provisoria');

  let ministryId = null;
  if (kind !== 'indisponibilidade') {
    ministryId = input.ministryId ?? current?.ministryId ?? null;
    if (ministryId && !db.ministries.some((m) => m.id === ministryId)) fail('ministério não encontrado');
    if (kind === 'escala' && !ministryId) fail('escala precisa de um ministério');
  }

  const title = kind === 'indisponibilidade' ? pick('title', 120) || 'Indisponível' : pick('title', 120);
  if (!title) fail('nome do evento ou culto é obrigatório');

  const item = {
    id: current?.id ?? randomUUID(),
    kind,
    ministryId,
    title,
    date: input.date ?? current?.date,
    start: input.start ?? current?.start,
    end: input.end ?? current?.end,
    endDate: input.endDate !== undefined ? (input.endDate || null) : (current?.endDate ?? null),
    status,
    notes: pick('notes', 1000),
    people: [],
  };
  const timingError = checkTiming(item);
  if (timingError) fail(timingError);

  const people = input.people ?? current?.people ?? [];
  if (!Array.isArray(people)) fail('lista de pessoas inválida');
  const seen = new Set();
  for (const entry of people) {
    if (!db.people.some((p) => p.id === entry.personId)) fail('pessoa não encontrada');
    if (seen.has(entry.personId)) fail('a mesma pessoa não pode aparecer duas vezes na escala');
    seen.add(entry.personId);
    item.people.push({ personId: entry.personId, role: text(entry.role, 60) });
  }
  if (kind === 'escala' && item.people.length === 0) fail('escala precisa de pelo menos uma pessoa');
  if (kind === 'indisponibilidade' && item.people.length !== 1) fail('indisponibilidade precisa de exatamente uma pessoa');

  return item;
}

export function listCommitments(db, filters = {}) {
  const { from, to, ministryId, personId, kind, source } = filters;
  const media = mediaMinistry(db);
  return db.commitments
    .filter((c) => (!from || c.date >= from) && (!to || c.date <= to))
    .filter((c) => !ministryId || c.ministryId === ministryId)
    .filter((c) => !personId || (c.people ?? []).some((p) => p.personId === personId))
    .filter((c) => !kind || c.kind === kind)
    .filter((c) => {
      if (!source || c.kind !== 'escala') return true;
      const isMedia = Boolean(media && c.ministryId === media.id);
      return source === 'media' ? isMedia : !isMedia;
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
}

export function createCommitment(db, input) {
  const item = validateCommitment(db, input, null);
  db.commitments.push(item);
  return item;
}

export function updateCommitment(db, id, input) {
  const current = findById(db.commitments, id, 'compromisso');
  const updated = validateCommitment(db, input, current);
  Object.assign(current, updated, { id });
  return current;
}

// Apagar ou alterar uma escala só mexe no registro dela. Escalas de outros ministérios
// nunca são removidas nem alteradas em cascata.
export function deleteCommitment(db, id) {
  findById(db.commitments, id, 'compromisso');
  db.commitments = db.commitments.filter((c) => c.id !== id);
}

// ---------- Conflitos ----------

export function listConflicts(db, { from, to, minGap } = {}) {
  const gap = minGap === undefined ? DEFAULT_MIN_GAP : Number(minGap);
  const nameOf = (id) => db.people.find((p) => p.id === id)?.name ?? '(removido)';
  const ministryOf = (id) => db.ministries.find((m) => m.id === id)?.name ?? null;
  return findConflicts(db.commitments, { minGap: gap })
    .filter((c) => (!from || c.date >= from) && (!to || c.date <= to))
    .map((c) => ({
      ...c,
      personName: nameOf(c.personId),
      ministryNames: c.ministries.map(ministryOf),
      first: { ...c.first, ministryName: ministryOf(c.first.ministryId) },
      second: { ...c.second, ministryName: ministryOf(c.second.ministryId) },
    }));
}

// ---------- Gerador de escala da mídia ----------

export function generateMediaTeam(db, input) {
  const media = mediaMinistry(db);
  if (!media) fail('cadastre um ministério marcado como mídia antes de gerar escalas');

  const slot = {
    date: input.date,
    start: input.start,
    end: input.end,
    endDate: input.endDate || null,
    ministryId: media.id,
  };
  const timingError = checkTiming(slot);
  if (timingError) fail(timingError);

  const roles = Array.isArray(input.roles) ? input.roles : [];
  if (!roles.length) fail('informe pelo menos uma função');
  for (const r of roles) {
    if (!text(r.role, 60) || !Number.isInteger(r.count) || r.count < 1) fail('cada função precisa de nome e quantidade inteira maior que zero');
  }

  const candidateIds = (input.candidateIds ?? db.people.map((p) => p.id)).filter((id) =>
    db.people.some((p) => p.id === id),
  );

  // O gerador lê o calendário de todos os ministérios, não só o da mídia.
  const result = proposeTeam({ slot, roles, candidateIds, items: db.commitments });
  const nameOf = (id) => db.people.find((p) => p.id === id)?.name ?? '(removido)';
  return {
    ministryId: media.id,
    ...result,
    people: result.people.map((p) => ({ ...p, personName: nameOf(p.personId) })),
    excluded: result.excluded.map((e) => ({ ...e, personName: nameOf(e.personId) })),
    warnings: result.warnings.map((w) => ({ ...w, personName: nameOf(w.personId) })),
  };
}

// ---------- Importação ----------

export function previewImport(db, source) {
  if (typeof source !== 'string' || !source.trim()) fail('envie o conteúdo do arquivo CSV');
  let parsed;
  try {
    parsed = parseImportRows(source);
  } catch (error) {
    fail(error.message);
  }
  const drafts = groupEntries(parsed.entries).map((draft) => {
    const ministry = db.ministries.find((m) => normalizeText(m.name) === normalizeText(draft.ministryName));
    return {
      ...draft,
      ministryId: ministry?.id ?? null,
      people: draft.people.map((p) => ({ ...p, ...matchPerson(p.name, db.people) })),
    };
  });
  return { drafts, errors: parsed.errors };
}

// Confirma a importação de forma atômica: ou tudo é salvo, ou nada muda.
export function commitImport(db, { commitments }) {
  if (!Array.isArray(commitments) || !commitments.length) fail('nenhum compromisso para importar');
  const draft = structuredClone(db);
  const created = { ministries: 0, people: 0, commitments: 0 };

  for (const item of commitments) {
    let ministry = draft.ministries.find((m) => normalizeText(m.name) === normalizeText(item.ministryName));
    if (!ministry) {
      ministry = applyMinistry(draft, null, { name: item.ministryName });
      draft.ministries.push(ministry);
      created.ministries++;
    }

    const people = (item.people ?? []).map((p) => {
      if (p.personId) return { personId: p.personId, role: p.role };
      // Sem vínculo escolhido: reaproveita o cadastro com o mesmo nome antes de criar outro.
      let person = draft.people.find((x) => normalizeText(x.name) === normalizeText(p.name));
      if (!person) {
        person = applyPerson(draft, null, { name: p.name });
        draft.people.push(person);
        created.people++;
      }
      return { personId: person.id, role: p.role };
    });

    draft.commitments.push(validateCommitment(draft, { ...item, ministryId: ministry.id, people, kind: 'escala' }, null));
    created.commitments++;
  }

  db.ministries = draft.ministries;
  db.people = draft.people;
  db.commitments = draft.commitments;
  return created;
}
