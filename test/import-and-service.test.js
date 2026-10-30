import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, parseDate, parseTime, parseImportRows, groupEntries, matchPerson, normalizeText } from '../src/csv-import.js';
import { checkTiming } from '../src/time.js';
import { emptyDb } from '../src/seed.js';
import * as service from '../src/service.js';

test('CSV com separador ; e campos entre aspas', () => {
  const rows = parseCsv('a;b;c\n"x; y";2;"diz ""oi"""\n');
  assert.deepEqual(rows, [['a', 'b', 'c'], ['x; y', '2', 'diz "oi"']]);
});

test('datas e horários em formatos comuns', () => {
  assert.equal(parseDate('01/11/2026'), '2026-11-01');
  assert.equal(parseDate('2026-11-01'), '2026-11-01');
  assert.equal(parseDate('31/02/2026'), null);
  assert.equal(parseTime('18h'), '18:00');
  assert.equal(parseTime('18h30'), '18:30');
  assert.equal(parseTime('1830'), '18:30');
  assert.equal(parseTime('25:00'), null);
});

test('linhas são agrupadas em uma escala com várias pessoas', () => {
  const csv = [
    'Ministério;Evento;Data;Início;Fim;Pessoa;Função;Status',
    'Recepção;Culto de Domingo;01/11/2026;18h;20h;Renata;Porta;',
    'Recepção;Culto de Domingo;01/11/2026;18h;20h;João;Porta;',
    'Louvor;Culto de Domingo;01/11/2026;18h;20h;Arthur;Violão;provisória',
  ].join('\n');
  const { entries, errors } = parseImportRows(csv);
  assert.deepEqual(errors, []);
  const groups = groupEntries(entries);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].people.length, 2);
  assert.equal(groups[1].status, 'provisoria');
});

test('linhas inválidas viram erros com número da linha', () => {
  const csv = 'ministerio,evento,data,inicio,fim,pessoa\nRecepcao,Culto,2026-13-01,18:00,20:00,Ana\n';
  const { entries, errors } = parseImportRows(csv);
  assert.equal(entries.length, 0);
  assert.equal(errors[0].line, 2);
});

test('nomes parecidos viram sugestões, nomes iguais são associados', () => {
  const people = [
    { id: 'p1', name: 'Renata Silva', aliases: [] },
    { id: 'p2', name: 'Maely Souza', aliases: ['Mayelly'] },
    { id: 'p3', name: 'Arthur Lima', aliases: [] },
  ];
  assert.equal(matchPerson('renata silva', people).personId, 'p1');
  assert.equal(matchPerson('Mayelly', people).personId, 'p2');
  const fuzzy = matchPerson('Renata Silvia', people);
  assert.equal(fuzzy.personId, null);
  assert.equal(fuzzy.suggestions[0].personId, 'p1');
  assert.equal(normalizeText('Intercessão  Ação'), 'intercessao acao');
});

test('checkTiming rejeita término antes do início sem data de término', () => {
  assert.equal(checkTiming({ date: '2026-11-01', start: '18:00', end: '18:00' }), 'início e término não podem ser iguais');
  assert.equal(checkTiming({ date: '2026-11-01', start: '22:00', end: '01:00' }), null);
  assert.equal(checkTiming({ date: '2026-11-01', start: '22:00', end: '01:00', endDate: '2026-11-01' }), 'término não pode ser anterior ao início');
});

function seeded() {
  const db = emptyDb();
  const media = db.ministries.find((m) => m.isMedia);
  const reception = db.ministries.find((m) => m.name === 'Recepção');
  db.people.push({ id: 'renata', name: 'Renata Silva', aliases: [] }, { id: 'joao', name: 'João Lima', aliases: [] });
  service.createCommitment(db, {
    ministryId: reception.id,
    title: 'Culto de Domingo',
    date: '2026-11-01',
    start: '18:00',
    end: '20:00',
    people: [{ personId: 'renata', role: 'Porta' }],
  });
  return { db, media, reception };
}

test('cadastro manual de escala conflitante é aceito e aparece no relatório de conflitos', () => {
  const { db, media } = seeded();
  service.createCommitment(db, {
    ministryId: media.id,
    title: 'Culto de Domingo',
    date: '2026-11-01',
    start: '18:00',
    end: '20:00',
    people: [{ personId: 'renata' }],
  });
  const [conflict] = service.listConflicts(db);
  assert.equal(conflict.personName, 'Renata Silva');
  assert.equal(conflict.type, 'mesmo_horario');
  assert.equal(conflict.severity, 'bloqueante');
  assert.deepEqual(conflict.ministryNames.sort(), ['Mídia', 'Recepção']);
});

test('gerador da mídia consulta escalas de todos os ministérios', () => {
  const { db, media } = seeded();
  const result = service.generateMediaTeam(db, {
    date: '2026-11-01',
    start: '18:00',
    end: '20:00',
    roles: [{ role: 'Câmera', count: 1 }],
    candidateIds: ['renata', 'joao'],
  });
  assert.equal(result.ministryId, media.id);
  assert.equal(result.people[0].personId, 'joao');
  assert.equal(result.excluded[0].personId, 'renata');
});

test('importação é atômica: erro em uma escala não salva nenhuma', () => {
  const { db } = seeded();
  const before = structuredClone(db);
  assert.throws(() => service.commitImport(db, {
    commitments: [
      { ministryName: 'Louvor', title: 'Culto', date: '2026-11-08', start: '18:00', end: '20:00', status: 'confirmada', people: [{ name: 'Nova Pessoa', role: 'Voz' }] },
      { ministryName: 'Louvor', title: 'Culto', date: '2026-11-08', start: '18:00', end: '18:00', status: 'confirmada', people: [{ name: 'Outra', role: '' }] },
    ],
  }));
  assert.deepEqual(db, before);
});

test('importação reaproveita pessoa pelo nome e cria ministério faltante', () => {
  const { db } = seeded();
  const created = service.commitImport(db, {
    commitments: [
      { ministryName: 'Juniores', title: 'Culto', date: '2026-11-08', start: '18:00', end: '20:00', status: 'confirmada', people: [{ name: 'renata silva', role: 'Apoio' }, { name: 'Pedro Novo', role: '' }] },
    ],
  });
  assert.equal(created.people, 1);
  assert.equal(db.people.filter((p) => normalizeText(p.name) === 'renata silva').length, 1);
  assert.ok(db.ministries.some((m) => m.name === 'Juniores'));
});

test('pessoa e ministério em uso não podem ser removidos', () => {
  const { db, reception } = seeded();
  assert.throws(() => service.deletePerson(db, 'renata'), (e) => e.status === 409);
  assert.throws(() => service.deleteMinistry(db, reception.id), (e) => e.status === 409);
});

test('apagar escala da mídia não remove escalas de outros ministérios', () => {
  const { db, media } = seeded();
  const mediaScale = service.createCommitment(db, {
    ministryId: media.id,
    title: 'Culto',
    date: '2026-11-01',
    start: '18:00',
    end: '20:00',
    people: [{ personId: 'joao' }],
  });
  service.deleteCommitment(db, mediaScale.id);
  assert.equal(db.commitments.length, 1);
  assert.equal(db.commitments[0].ministryId !== media.id, true);
});
