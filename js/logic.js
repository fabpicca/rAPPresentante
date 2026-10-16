// Logica pura (senza DOM): testabile con `node --test`.

export const SCHEMA_VERSION = 1;
const COLLECTIONS = ['students', 'collections', 'events', 'minutes', 'polls'];

export function emptyState() {
  return {
    version: SCHEMA_VERSION,
    settings: { className: '', schoolYear: '' },
    students: [],
    collections: [],
    events: [],
    minutes: [],
    polls: [],
  };
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Rende coerente uno stato caricato da localStorage o da un file di backup.
export function normalizeState(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('File di backup non valido');
  }
  const base = emptyState();
  const out = { ...base, settings: { ...base.settings, ...(input.settings || {}) } };
  for (const key of COLLECTIONS) {
    out[key] = Array.isArray(input[key]) ? input[key].filter((x) => x && x.id) : [];
  }
  out.students = out.students.map((s) => ({
    name: '',
    notes: '',
    ...s,
    parents: Array.isArray(s.parents) ? s.parents : [],
  }));
  out.collections = out.collections.map((c) => ({
    title: '',
    amountCents: 0,
    dueDate: '',
    notes: '',
    closed: false,
    ...c,
    payments: c.payments && typeof c.payments === 'object' ? c.payments : {},
    excluded: Array.isArray(c.excluded) ? c.excluded : [],
  }));
  out.polls = out.polls.map((p) => ({
    question: '',
    closed: false,
    ...p,
    options: Array.isArray(p.options) ? p.options : [],
    votes: p.votes && typeof p.votes === 'object' ? p.votes : {},
  }));
  return out;
}

// ---------- Date ----------

export function todayIso(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function formatDate(iso, opts = { weekday: 'short', day: 'numeric', month: 'short' }) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('it-IT', opts);
}

export function upcomingEvents(events, fromIso, days) {
  const to = addDays(fromIso, days);
  return sortEvents(events.filter((e) => e.date >= fromIso && e.date <= to));
}

export function sortEvents(events) {
  return [...events].sort((a, b) =>
    (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')),
  );
}

// ---------- Soldi (sempre in centesimi) ----------

export function parseEuro(text) {
  const clean = String(text ?? '').trim().replace(/[€\s]/g, '');
  if (!clean) return 0;
  // Accetta "12,50", "12.50", "1.234,50".
  const normalized = clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) throw new Error(`Importo non valido: ${text}`);
  return Math.round(value * 100);
}

export function formatEuro(cents) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(
    (cents || 0) / 100,
  );
}

export function centsToInput(cents) {
  return cents ? (cents / 100).toFixed(2).replace('.', ',') : '';
}

// ---------- Rubrica ----------

export function sortStudents(students) {
  return [...students].sort((a, b) => a.name.localeCompare(b.name, 'it', { sensitivity: 'base' }));
}

export function matchesStudent(student, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [student.name, student.notes, ...student.parents.flatMap((p) => [p.name, p.phone, p.email])]
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}

// Numero per i link wa.me: solo cifre, con prefisso internazionale.
export function whatsappNumber(phone) {
  let digits = String(phone || '').replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  else if (digits.startsWith('00')) digits = digits.slice(2);
  else if (/^3\d{8,9}$/.test(digits)) digits = '39' + digits; // cellulare italiano
  digits = digits.replace(/\D/g, '');
  return digits.length >= 8 ? digits : '';
}

export function allEmails(students) {
  const set = new Set();
  for (const s of students) for (const p of s.parents) if (p.email) set.add(p.email.trim());
  return [...set];
}

function csvCell(value) {
  const v = String(value ?? '');
  return /[";\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

// CSV con ";" e BOM: si apre correttamente in Excel con impostazioni italiane.
export function contactsCsv(students) {
  const rows = [['Alunno', 'Genitore', 'Telefono', 'Email', 'Note']];
  for (const s of sortStudents(students)) {
    const parents = s.parents.length ? s.parents : [{}];
    for (const p of parents) rows.push([s.name, p.name, p.phone, p.email, s.notes]);
  }
  return '﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n');
}

// ---------- Quote ----------

export function collectionSummary(collection, students) {
  const excluded = new Set(collection.excluded);
  const participants = sortStudents(students.filter((s) => !excluded.has(s.id)));
  const paid = participants.filter((s) => collection.payments[s.id]);
  const unpaid = participants.filter((s) => !collection.payments[s.id]);
  return {
    participants,
    paid,
    unpaid,
    collectedCents: paid.length * collection.amountCents,
    expectedCents: participants.length * collection.amountCents,
  };
}

export function unpaidReminderText(collection, students) {
  const { unpaid } = collectionSummary(collection, students);
  if (!unpaid.length) return `Quota «${collection.title}»: hanno pagato tutti. Grazie!`;
  const due = collection.dueDate ? ` entro ${formatDate(collection.dueDate, { day: 'numeric', month: 'long' })}` : '';
  return [
    `Promemoria quota «${collection.title}» (${formatEuro(collection.amountCents)}${due}).`,
    `Mancano ancora:`,
    ...unpaid.map((s) => `- ${s.name}`),
  ].join('\n');
}

// ---------- Sondaggi ----------

export function pollTally(poll, students) {
  const counts = poll.options.map(() => 0);
  const voters = poll.options.map(() => []);
  const missing = [];
  for (const s of sortStudents(students)) {
    const vote = poll.votes[s.id];
    if (Number.isInteger(vote) && vote >= 0 && vote < counts.length) {
      counts[vote]++;
      voters[vote].push(s.name);
    } else {
      missing.push(s);
    }
  }
  return { counts, voters, missing, answered: students.length - missing.length };
}

export function pollResultsText(poll, students) {
  const { counts, answered } = pollTally(poll, students);
  return [
    `Sondaggio: ${poll.question}`,
    ...poll.options.map((o, i) => `- ${o}: ${counts[i]}`),
    `Risposte: ${answered}/${students.length}`,
  ].join('\n');
}

// ---------- Calendario (.ics) ----------

function icsEscape(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

// Spezza le righe a 75 ottetti come richiesto da RFC 5545.
function icsFold(line) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts = [];
  let current = '';
  let size = 0;
  for (const ch of line) {
    const len = new TextEncoder().encode(ch).length;
    if (size + len > (parts.length ? 74 : 75)) {
      parts.push(current);
      current = '';
      size = 0;
    }
    current += ch;
    size += len;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

export function eventsIcs(events, stamp = new Date()) {
  const dtstamp = stamp.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//rAPPresentante//IT', 'CALSCALE:GREGORIAN'];
  for (const e of sortEvents(events)) {
    const day = e.date.replace(/-/g, '');
    lines.push('BEGIN:VEVENT', `UID:${e.id}@rappresentante`, `DTSTAMP:${dtstamp}`);
    if (e.time) {
      const [h, m] = e.time.split(':').map(Number);
      const endH = String((h + 1) % 24).padStart(2, '0');
      const endDay = h === 23 ? addDays(e.date, 1).replace(/-/g, '') : day;
      lines.push(`DTSTART:${day}T${e.time.replace(':', '')}00`, `DTEND:${endDay}T${endH}${String(m).padStart(2, '0')}00`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${day}`, `DTEND;VALUE=DATE:${addDays(e.date, 1).replace(/-/g, '')}`);
    }
    lines.push(`SUMMARY:${icsEscape(e.title)}`);
    if (e.location) lines.push(`LOCATION:${icsEscape(e.location)}`);
    if (e.notes) lines.push(`DESCRIPTION:${icsEscape(e.notes)}`);
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(e.title)}`, 'TRIGGER:-P1D', 'END:VALARM');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(icsFold).join('\r\n') + '\r\n';
}

export const EVENT_TYPES = {
  riunione: 'Riunione',
  consiglio: 'Consiglio di classe',
  uscita: 'Uscita / gita',
  scadenza: 'Scadenza',
  altro: 'Altro',
};
