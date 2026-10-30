import { normalizeText } from './text.js';
import { isValidDate } from './time.js';

// Lê escalas de outros ministérios coladas como texto (ex.: copiadas do WhatsApp).
// Cada data começa um bloco; o bloco vai até a próxima data. Dentro do bloco, o horário
// e as pessoas são procurados pelo nome. Quem aparece no bloco fica indisponível no horário.

const DATE_RE = /(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/;
const DATE_RE_G = new RegExp(DATE_RE.source, 'g');
// Hora com "h" ou ":", com ou sem minutos: 18h, 18:00, 18h30. Separador: às, a, até, -.
const RANGE_RE = /(\d{1,2})(?:(?::|h)(\d{2})|h)?\s*(?:às|as|até|a|-|–)\s*(\d{1,2})(?:(?::|h)(\d{2})|h)?/i;
const RANGE_RE_G = new RegExp(RANGE_RE.source, 'gi');
const SINGLE_RE = /(\d{1,2})(?::|h)(\d{2})?/i;
const SINGLE_RE_G = new RegExp(SINGLE_RE.source, 'gi');
const WEEKDAY_RE_G = /\b(domingo|segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado)(?:[- ]feira)?\b/gi;
const DEFAULT_DURATION_MINUTES = 120;

const clean = (line) => line.replace(/[*_~`•·▪■]/g, ' ').replace(/\s+/g, ' ').trim();

function toIsoDate(match, year) {
  const day = match[1].padStart(2, '0');
  const month = match[2].padStart(2, '0');
  const parsedYear = match[3] ? (match[3].length === 2 ? `20${match[3]}` : match[3]) : String(year);
  const iso = `${parsedYear}-${month}-${day}`;
  return isValidDate(iso) ? iso : null;
}

function hhmm(hours, minutes) {
  const h = Number(hours);
  const m = Number(minutes ?? 0);
  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function addMinutes(time, minutes) {
  const [h, m] = time.split(':').map(Number);
  const total = (h * 60 + m + minutes) % (24 * 60);
  return hhmm(Math.floor(total / 60), total % 60);
}

// Horário de início e término. Sem término, considera 2 horas e avisa no relatório.
function findTiming(lines) {
  const withoutDates = lines.map((line) => line.replace(DATE_RE_G, ' '));
  for (const line of withoutDates) {
    const match = line.match(RANGE_RE);
    if (!match) continue;
    const start = hhmm(match[1], match[2]);
    const end = hhmm(match[3], match[4]);
    if (start && end) return { start, end, estimated: false };
  }
  for (const line of withoutDates) {
    const match = line.match(SINGLE_RE);
    const start = match && hhmm(match[1], match[2]);
    if (start) return { start, end: addMinutes(start, DEFAULT_DURATION_MINUTES), estimated: true };
  }
  return null;
}

// Nome do evento: o que sobra da linha de data depois de tirar data, horário e dia da semana.
function titleOf(header) {
  const title = header
    .replace(DATE_RE_G, ' ')
    .replace(RANGE_RE_G, ' ')
    .replace(SINGLE_RE_G, ' ')
    .replace(WEEKDAY_RE_G, ' ')
    .replace(/[·|,:()\-–]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return title || 'Escala externa';
}

// Pessoas cadastradas citadas no bloco: nome completo, apelido, ou só o primeiro nome
// quando ele é único no cadastro (com duas Renatas, o primeiro nome não basta).
function peopleIn(textBlock, people) {
  const haystack = ` ${normalizeText(textBlock)} `;
  const firstNameOf = (person) => normalizeText(person.name).split(' ')[0];
  const firstNameCount = (first) => people.filter((p) => firstNameOf(p) === first).length;
  const has = (name) => name.length >= 3 && haystack.includes(` ${name} `);

  return people.filter((person) => {
    const names = [person.name, ...(person.aliases ?? [])].map(normalizeText);
    if (names.some(has)) return true;
    const first = firstNameOf(person);
    return firstNameCount(first) === 1 && has(first);
  });
}

export function parseExternalSchedules(source, people, { year }) {
  const blocks = [];
  for (const line of String(source ?? '').split(/\r?\n/).map(clean).filter(Boolean)) {
    const match = line.match(DATE_RE);
    if (match) blocks.push({ header: line, match, lines: [line] });
    else if (blocks.length) blocks[blocks.length - 1].lines.push(line);
  }

  const items = [];
  const report = [];
  for (const block of blocks) {
    const date = toIsoDate(block.match, year);
    const label = `${block.match[0]} · ${block.header}`;
    if (!date) {
      report.push({ label, ignored: 'data inválida' });
      continue;
    }
    const timing = findTiming(block.lines);
    if (!timing) {
      report.push({ label, ignored: 'sem horário reconhecível' });
      continue;
    }

    const found = peopleIn(block.lines.join(' '), people);
    const title = titleOf(block.header);
    report.push({
      date,
      start: timing.start,
      end: timing.end,
      estimatedEnd: timing.estimated,
      title,
      names: found.map((p) => p.name),
    });
    if (!found.length) continue;
    items.push({
      id: `externo-${items.length}`,
      kind: 'escala',
      ministryId: null,
      title,
      date,
      start: timing.start,
      end: timing.end,
      endDate: null,
      status: 'confirmada',
      people: found.map((p) => ({ personId: p.id })),
    });
  }
  return { items, report };
}
