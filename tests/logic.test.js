import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays, allEmails, collectionSummary, contactsCsv, eventsIcs, normalizeState,
  parseEuro, pollTally, unpaidReminderText, upcomingEvents, whatsappNumber,
} from '../js/logic.js';

const students = [
  { id: 'b', name: 'Bianchi Giulia', notes: '', parents: [{ name: 'Anna', phone: '333 1234567', email: 'anna@x.it' }] },
  { id: 'a', name: 'Rossi Mario', notes: '', parents: [{ name: 'Luca', phone: '', email: 'anna@x.it' }, { name: 'Sara', email: 'sara@x.it' }] },
  { id: 'c', name: 'Verdi Luca', notes: 'allergia; "arachidi"', parents: [] },
];

test('parseEuro accetta formati italiani', () => {
  assert.equal(parseEuro('12,50'), 1250);
  assert.equal(parseEuro('12.5'), 1250);
  assert.equal(parseEuro('€ 1.234,56'), 123456);
  assert.equal(parseEuro(''), 0);
  assert.throws(() => parseEuro('abc'));
  assert.throws(() => parseEuro('-3'));
});

test('addDays attraversa mesi e cambi di ora legale', () => {
  assert.equal(addDays('2026-10-24', 2), '2026-10-26');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('whatsappNumber normalizza i numeri', () => {
  assert.equal(whatsappNumber('333 123 4567'), '393331234567');
  assert.equal(whatsappNumber('+39 333 1234567'), '393331234567');
  assert.equal(whatsappNumber('0039 333 1234567'), '393331234567');
  assert.equal(whatsappNumber('+44 7700 900123'), '447700900123');
  assert.equal(whatsappNumber('123'), '');
});

test('allEmails elimina i duplicati', () => {
  assert.deepEqual(allEmails(students), ['anna@x.it', 'sara@x.it']);
});

test('contactsCsv: una riga per genitore, campi con ; tra virgolette', () => {
  const lines = contactsCsv(students).replace(/^﻿/, '').split('\r\n');
  assert.equal(lines.length, 5);
  assert.equal(lines[1], 'Bianchi Giulia;Anna;333 1234567;anna@x.it;');
  assert.equal(lines[4], 'Verdi Luca;;;;"allergia; ""arachidi"""');
});

test('collectionSummary esclude i non partecipanti', () => {
  const c = { title: 'Gita', amountCents: 1000, dueDate: '', payments: { a: '2026-10-01' }, excluded: ['c'] };
  const s = collectionSummary(c, students);
  assert.equal(s.participants.length, 2);
  assert.equal(s.collectedCents, 1000);
  assert.equal(s.expectedCents, 2000);
  assert.deepEqual(s.unpaid.map((x) => x.id), ['b']);
  assert.match(unpaidReminderText(c, students), /- Bianchi Giulia/);
  assert.doesNotMatch(unpaidReminderText(c, students), /Verdi/);
});

test('pollTally conta e ignora voti non validi', () => {
  const poll = { options: ['Sì', 'No'], votes: { a: 0, b: 1, c: 7 } };
  const t = pollTally(poll, students);
  assert.deepEqual(t.counts, [1, 1]);
  assert.equal(t.answered, 2);
  assert.deepEqual(t.missing.map((s) => s.id), ['c']);
});

test('upcomingEvents filtra e ordina', () => {
  const ev = [
    { id: '1', date: '2026-10-20', time: '18:00' },
    { id: '2', date: '2026-10-20', time: '09:00' },
    { id: '3', date: '2026-12-01' },
    { id: '4', date: '2026-10-01' },
  ];
  assert.deepEqual(upcomingEvents(ev, '2026-10-16', 14).map((e) => e.id), ['2', '1']);
});

test('eventsIcs genera eventi validi con promemoria', () => {
  const ics = eventsIcs([
    { id: 'x', title: 'Riunione, genitori', date: '2026-10-20', time: '23:30', notes: 'Riga1\nRiga2' },
    { id: 'y', title: 'Gita', date: '2026-11-03', time: '' },
  ], new Date('2026-10-16T10:00:00Z'));
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /DTSTART:20261020T233000\r\nDTEND:20261021T003000/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261103\r\nDTEND;VALUE=DATE:20261104/);
  assert.match(ics, /SUMMARY:Riunione\\, genitori/);
  assert.match(ics, /DESCRIPTION:Riga1\\nRiga2/);
  assert.equal(ics.match(/TRIGGER:-P1D/g).length, 2);
  for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, line);
});

test('normalizeState completa stati parziali e rifiuta input non validi', () => {
  const s = normalizeState({ students: [{ id: 'a', name: 'X' }], polls: [{ id: 'p' }], foo: 1 });
  assert.deepEqual(s.students[0].parents, []);
  assert.deepEqual(s.polls[0].votes, {});
  assert.deepEqual(s.events, []);
  assert.equal(s.foo, undefined);
  assert.throws(() => normalizeState(null));
  assert.throws(() => normalizeState([]));
});
