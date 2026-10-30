import { isValidDate } from './time.js';

export function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Separador ';' ou ',' é detectado pela linha de cabeçalho (planilhas em pt-BR usam ';').
export function parseCsv(text) {
  const header = text.split(/\r?\n/, 1)[0] ?? '';
  const separator = (header.match(/;/g) ?? []).length > (header.match(/,/g) ?? []).length ? ';' : ',';

  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === separator) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const COLUMNS = {
  ministerio: ['ministerio', 'setor'],
  evento: ['evento', 'culto', 'nome do evento', 'nome do culto'],
  data: ['data'],
  inicio: ['inicio', 'horario inicio', 'hora inicio'],
  fim: ['fim', 'termino', 'horario termino', 'horario fim', 'hora fim'],
  pessoa: ['pessoa', 'nome', 'membro'],
  funcao: ['funcao', 'funcoes', 'papel'],
  status: ['status', 'situacao'],
  observacoes: ['observacoes', 'observacao', 'obs'],
};
const REQUIRED = ['ministerio', 'evento', 'data', 'inicio', 'fim', 'pessoa'];

export function parseDate(value) {
  const text = String(value ?? '').trim();
  let iso = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    iso = text;
  } else {
    const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (match) iso = `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  }
  return iso && isValidDate(iso) ? iso : null;
}

// Aceita "18:30", "18h30", "18h", "18" e "1830".
export function parseTime(value) {
  const text = String(value ?? '').trim().toLowerCase().replace('h', ':').replace(/:$/, '');
  let hours;
  let minutes;
  if (/^\d{4}$/.test(text)) {
    hours = Number(text.slice(0, 2));
    minutes = Number(text.slice(2));
  } else {
    const match = text.match(/^(\d{1,2})(?::(\d{2}))?$/);
    if (!match) return null;
    hours = Number(match[1]);
    minutes = Number(match[2] ?? 0);
  }
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

// Lê as linhas (uma por pessoa) e devolve as entradas validadas e os erros por linha.
export function parseImportRows(text) {
  const [headerRow, ...dataRows] = parseCsv(text);
  if (!headerRow) throw new Error('arquivo vazio');

  const index = {};
  headerRow.forEach((title, position) => {
    const key = normalizeText(title);
    for (const [column, aliases] of Object.entries(COLUMNS)) {
      if (aliases.includes(key)) index[column] = position;
    }
  });
  const missing = REQUIRED.filter((column) => index[column] === undefined);
  if (missing.length) throw new Error(`colunas obrigatórias ausentes: ${missing.join(', ')}`);

  const get = (cells, column) => (index[column] === undefined ? '' : String(cells[index[column]] ?? '').trim());
  const entries = [];
  const errors = [];
  dataRows.forEach((cells, offset) => {
    const line = offset + 2;
    const fail = (message) => errors.push({ line, message });

    const ministryName = get(cells, 'ministerio');
    const title = get(cells, 'evento');
    const date = parseDate(get(cells, 'data'));
    const start = parseTime(get(cells, 'inicio'));
    const end = parseTime(get(cells, 'fim'));
    const personName = get(cells, 'pessoa');

    if (!ministryName) return fail('ministério vazio');
    if (!title) return fail('nome do evento vazio');
    if (!date) return fail('data inválida (use AAAA-MM-DD ou DD/MM/AAAA)');
    if (!start || !end) return fail('horário inválido (ex.: 18:30 ou 18h)');
    if (!personName) return fail('pessoa vazia');

    const statusText = normalizeText(get(cells, 'status'));
    let status = 'confirmada';
    if (statusText.startsWith('prov')) status = 'provisoria';
    else if (statusText && !statusText.startsWith('conf')) return fail('status deve ser confirmada ou provisoria');

    entries.push({
      line,
      ministryName,
      title,
      date,
      start,
      end,
      status,
      notes: get(cells, 'observacoes'),
      personName,
      role: get(cells, 'funcao'),
    });
  });
  return { entries, errors };
}

// Agrupa as linhas por evento: linhas com o mesmo ministério, evento, data, horários e status
// viram uma única escala com várias pessoas.
export function groupEntries(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const key = [entry.ministryName, entry.title, entry.date, entry.start, entry.end, entry.status]
      .map(normalizeText)
      .join('|');
    if (!groups.has(key)) {
      groups.set(key, {
        ministryName: entry.ministryName,
        title: entry.title,
        date: entry.date,
        start: entry.start,
        end: entry.end,
        status: entry.status,
        notes: entry.notes,
        people: [],
      });
    }
    const group = groups.get(key);
    if (!group.notes) group.notes = entry.notes;
    if (!group.people.some((p) => normalizeText(p.name) === normalizeText(entry.personName))) {
      group.people.push({ name: entry.personName, role: entry.role });
    }
  }
  return [...groups.values()];
}

export function levenshtein(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
}

// Similaridade entre 0 e 1 entre nomes já normalizados.
export function similarity(a, b) {
  if (a === b) return 1;
  const tokensA = a.split(' ');
  const tokensB = b.split(' ');
  const [short, long] = tokensA.length <= tokensB.length ? [tokensA, tokensB] : [tokensB, tokensA];
  // "Renata" contra "Renata Silva": nome curto contido no nome completo.
  if (short.every((token) => long.includes(token))) return 0.8;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

// Procura o membro já cadastrado para um nome do arquivo. Exato (ou por apelido) é
// associado automaticamente; parecidos viram sugestões para o coordenador confirmar.
export function matchPerson(name, people, { threshold = 0.75 } = {}) {
  const target = normalizeText(name);
  const suggestions = [];
  for (const person of people) {
    const candidates = [person.name, ...(person.aliases ?? [])].map(normalizeText);
    const best = Math.max(...candidates.map((candidate) => similarity(target, candidate)));
    if (candidates.includes(target)) return { personId: person.id, suggestions: [] };
    if (best >= threshold) {
      suggestions.push({ personId: person.id, name: person.name, score: Math.round(best * 100) / 100 });
    }
  }
  suggestions.sort((a, b) => b.score - a.score);
  return { personId: null, suggestions: suggestions.slice(0, 3) };
}
