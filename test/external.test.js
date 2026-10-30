import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseExternalSchedules } from '../src/external.js';
import { emptyDb } from '../src/seed.js';
import * as service from '../src/service.js';

const people = [
  { id: 'renata', name: 'Renata Silva', aliases: [], skills: ['Câmera', 'Reels'] },
  { id: 'arthur', name: 'Arthur Lima', aliases: ['Artur'], skills: ['Câmera', 'Reels'] },
  { id: 'paulo', name: 'Paulo', aliases: [], skills: ['Projeção'] },
];

test('lê vários blocos colados e identifica quem está em cada um', () => {
  const source = [
    '*Louvor · Domingo, 01/11 · 18h às 20h*',
    'Renata',
    'Artur',
    '',
    'Recepção · Quinta, 05/11 · 19h30 às 21h',
    '- Paulo',
  ].join('\n');
  const { items, report } = parseExternalSchedules(source, people, { year: 2026 });
  assert.equal(report.length, 2);
  assert.equal(items.length, 2);
  assert.equal(items[0].date, '2026-11-01');
  assert.equal(items[0].start, '18:00');
  assert.equal(items[0].end, '20:00');
  assert.deepEqual(items[0].people.map((p) => p.personId), ['renata', 'arthur']);
  assert.equal(items[1].start, '19:30');
});

test('bloco sem horário é ignorado e avisado, não some em silêncio', () => {
  const { items, report } = parseExternalSchedules('Domingo, 01/11\nRenata', people, { year: 2026 });
  assert.equal(items.length, 0);
  assert.match(report[0].ignored, /sem horário/);
});

test('nome de uma pessoa não aparece em outra (palavra inteira)', () => {
  const { items } = parseExternalSchedules('01/11 18h às 20h\nPaulinho toca bateria', people, { year: 2026 });
  assert.equal(items.length, 0);
});

test('gerador não escala quem está em outra escala no mesmo horário', () => {
  const db = emptyDb();
  for (const p of people) db.people.push(p);
  const result = service.generateMediaTeam(db, {
    title: 'Culto de Domingo',
    date: '2026-11-01',
    start: '18:00',
    end: '20:00',
    roles: [{ role: 'Câmera' }, { role: 'Reels' }],
    externalText: 'Louvor · 01/11 · 18h às 20h\nRenata\nArthur',
  });
  assert.deepEqual(result.people, []);
  assert.equal(result.excluded.length, 2);
  assert.deepEqual(result.unfilled.map((u) => u.role), ['Câmera', 'Reels']);
});

test('gerador do mês usa as escalas coladas como restrição e segue sem conflito', () => {
  const db = emptyDb();
  for (const p of people) db.people.push(p);
  const result = service.generateMonth(db, {
    month: '2026-11',
    templates: [{ weekday: 0, start: '18:00', end: '20:00', title: 'Culto de Domingo', roles: [{ role: 'Câmera' }] }],
    externalText: '01/11 18h às 20h\nRenata Silva\n08/11 18h às 20h\nArthur',
  });
  assert.equal(result.services.length, 5);
  assert.equal(result.services[0].people.length, 1);
  assert.notEqual(result.services[0].people[0].personId, 'renata');
  assert.equal(result.services[1].people[0].personId, 'renata');
  assert.notEqual(result.services[1].people[0].personId, 'arthur');
});

test('título sai limpo quando o horário vem como 18h às 20h', () => {
  const { items, report } = parseExternalSchedules('Louvor · Domingo, 01/11 · 18h às 20h\nRenata', people, { year: 2026 });
  assert.equal(items[0].title, 'Louvor');
  assert.equal(report[0].estimatedEnd, false);
  assert.equal(items[0].end, '20:00');
});
