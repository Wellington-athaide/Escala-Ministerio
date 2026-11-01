import { checkTiming, isValidDate } from './time.js';
import { datesOfMonth, planServices } from './planning.js';
import { toWhatsappText } from './format.js';
import { parseExternalSchedules } from './external.js';
import { normalizeText } from './text.js';

export class ServiceError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const fail = (message) => {
  throw new ServiceError(400, message);
};

const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const randomUUID = () => globalThis.crypto.randomUUID();

function findById(list, id, label) {
  const item = list.find((x) => x.id === id);
  if (!item) throw new ServiceError(404, `${label} não encontrado`);
  return item;
}

// ---------- Membros ----------

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
  const aliases = (input.aliases ?? current?.aliases ?? []).map((a) => text(a, 120)).filter(Boolean);
  const skills = (input.skills ?? current?.skills ?? []).map((s) => text(s, 40)).filter(Boolean);
  // Dias da semana (0 = domingo) em que a pessoa pode servir. Vazio = qualquer dia.
  const weekdays = (input.weekdays ?? current?.weekdays ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  const observations = text(input.observations ?? current?.observations, 500);
  // Mínimo de escalas no mês (0 = sem mínimo). O gerador garante esse número quando possível.
  const minPerMonth = Math.min(10, Math.max(0, Number(input.minPerMonth ?? current?.minPerMonth ?? 0) || 0));
  return { id: current?.id ?? randomUUID(), name, aliases, skills, weekdays, observations, minPerMonth: Math.floor(minPerMonth) };
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
  db.people = db.people.filter((p) => p.id !== id);
}

// ---------- Gerador ----------

// Cada função recebe exatamente uma pessoa.
function parseRoles(roles) {
  if (!Array.isArray(roles) || !roles.length) fail('informe pelo menos uma função');
  for (const r of roles) {
    if (!text(r.role, 60)) fail('cada função precisa de um nome');
  }
  return roles.map((r) => ({ role: text(r.role, 60), count: 1 }));
}

function skillsOfFor(db) {
  return (personId) => db.people.find((p) => p.id === personId)?.skills ?? [];
}

// Pode servir nesta data? Respeita os dias da semana cadastrados para a pessoa.
function allowedOnFor(db) {
  return (personId, date) => {
    const weekdays = db.people.find((p) => p.id === personId)?.weekdays ?? [];
    return weekdays.length === 0 || weekdays.includes(new Date(`${date}T00:00:00Z`).getUTCDay());
  };
}

// Mínimos de escalas por pessoa, para o planejador reservar os cultos antes.
function minimumsFor(db) {
  return new Map(db.people.filter((p) => p.minPerMonth > 0).map((p) => [p.id, p.minPerMonth]));
}

// Avisa quando alguém não chegou ao mínimo (falta de função, dia ou conflito).
function minimumWarnings(db, services) {
  return db.people
    .filter((p) => p.minPerMonth > 0)
    .map((p) => ({ personName: p.name, wanted: p.minPerMonth, got: services.filter((s) => s.people.some((x) => x.personId === p.id)).length }))
    .filter((w) => w.got < w.wanted);
}

function candidatesFrom(db, input) {
  return (input.candidateIds ?? db.people.map((p) => p.id)).filter((id) => db.people.some((p) => p.id === id));
}

// Culto sem horário vale o dia inteiro: das 00:00 até 00:00 do dia seguinte.
function checkedSlot({ date, start, end }) {
  if (!start && !end) {
    const next = new Date(`${date}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    return { date, start: '00:00', end: '00:00', endDate: next.toISOString().slice(0, 10), ministryId: null };
  }
  const slot = { date, start, end, endDate: null, ministryId: null };
  const timingError = checkTiming(slot);
  if (timingError) fail(timingError);
  return slot;
}

// Acrescenta os nomes às pessoas e às exclusões de um culto planejado.
function withNames(db, service) {
  const nameOf = (id) => db.people.find((p) => p.id === id)?.name ?? '(removido)';
  return {
    ...service,
    people: service.people.map((p) => ({ ...p, personName: nameOf(p.personId) })),
    excluded: service.excluded.map((e) => ({ ...e, personName: nameOf(e.personId) })),
  };
}

// Lê as escalas coladas: quem aparece num bloco fica indisponível naquele horário.
function restrictionsFrom(db, source, year) {
  return parseExternalSchedules(source, db.people, { year });
}

export function generateMediaTeam(db, input) {
  const slot = checkedSlot(input);
  const roles = parseRoles(input.roles);
  const { items, report } = restrictionsFrom(db, input.externalText, Number(input.date.slice(0, 4)));
  const [planned] = planServices(
    [{ title: text(input.title, 120) || 'Culto', slot, roles }],
    { candidateIds: candidatesFrom(db, input), items, skillsOf: skillsOfFor(db), allowedOn: allowedOnFor(db) },
  );
  const service = withNames(db, planned);
  return { ...service, markdown: toWhatsappText({ services: [service] }), report };
}

export function generateMonth(db, input) {
  const month = input.month;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month ?? '')) fail('mês inválido (use AAAA-MM)');
  const templates = Array.isArray(input.templates) ? input.templates : [];
  if (!templates.length) fail('informe pelo menos um culto recorrente');

  const requests = [];
  for (const template of templates) {
    if (!Number.isInteger(template.weekday) || template.weekday < 0 || template.weekday > 6) fail('dia da semana inválido');
    const roles = parseRoles(template.roles);
    const title = text(template.title, 120) || 'Culto';
    for (const date of datesOfMonth(month, template.weekday)) {
      requests.push({ title, roles, slot: checkedSlot({ date, start: template.start, end: template.end }) });
    }
  }
  requests.sort((a, b) => a.slot.date.localeCompare(b.slot.date) || a.slot.start.localeCompare(b.slot.start));

  const { items, report } = restrictionsFrom(db, input.externalText, Number(month.slice(0, 4)));
  const planned = planServices(requests, { candidateIds: candidatesFrom(db, input), items, skillsOf: skillsOfFor(db), allowedOn: allowedOnFor(db), minimums: minimumsFor(db) });
  const services = planned.map((service) => withNames(db, service));
  return { month, services, markdown: toWhatsappText({ month, services }), report, minimumWarnings: minimumWarnings(db, services) };
}

// Eventos: o usuário escolhe as datas (ex.: sexta, sábado e domingo) e o nome do evento.
// Cada data vira um evento de dia inteiro, planejado em ordem com as mesmas regras do gerador.
export function generateEvents(db, input) {
  const dates = Array.isArray(input.dates) ? [...new Set(input.dates)].sort() : [];
  if (!dates.length) fail('escolha pelo menos uma data');
  for (const date of dates) {
    if (!isValidDate(date)) fail(`data inválida: ${date}`);
  }
  const title = text(input.title, 120) || 'Evento';
  const roles = parseRoles(input.roles);

  const requests = dates.map((date) => ({ title, roles, slot: checkedSlot({ date }) }));
  const { items, report } = restrictionsFrom(db, input.externalText, Number(dates[0].slice(0, 4)));
  const planned = planServices(requests, { candidateIds: candidatesFrom(db, input), items, skillsOf: skillsOfFor(db), allowedOn: allowedOnFor(db), minimums: minimumsFor(db) });
  const services = planned.map((service) => withNames(db, service));
  return { title, services, markdown: toWhatsappText({ heading: title, services }), report, minimumWarnings: minimumWarnings(db, services) };
}
