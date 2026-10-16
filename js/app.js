import {
  EVENT_TYPES,
  addDays,
  allEmails,
  centsToInput,
  collectionSummary,
  contactsCsv,
  eventsIcs,
  formatDate,
  formatEuro,
  matchesStudent,
  normalizeState,
  parseEuro,
  pollResultsText,
  pollTally,
  sortEvents,
  sortStudents,
  todayIso,
  uid,
  unpaidReminderText,
  upcomingEvents,
  whatsappNumber,
  emptyState,
} from './logic.js';
import { loadState, requestPersistence, saveState } from './store.js';

let state = loadState();
let contactQuery = '';
const BACKUP_REMINDER_DAYS = 30;

const $ = (sel, root = document) => root.querySelector(sel);
const view = $('#view');
const modal = $('#modal');

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

function commit(mutate) {
  mutate(state);
  try {
    saveState(state);
  } catch (err) {
    alert('Salvataggio non riuscito: spazio esaurito o archiviazione bloccata.\n' + err.message);
  }
  render();
}

function byId(list, id) {
  return list.find((x) => x.id === id);
}

// ---------- Utilità UI ----------

let toastTimer;
function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 2500);
}

async function shareText(text, title) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    toast('Copiato negli appunti');
  } catch {
    prompt('Copia il testo:', text);
  }
}

function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Apre un form in un <dialog>. onSubmit riceve un oggetto con i campi del form.
function openForm({ title, body, submitLabel = 'Salva', onSubmit, onDelete }) {
  modal.innerHTML = `
    <form method="dialog" class="sheet">
      <header class="sheet-head">
        <h2>${esc(title)}</h2>
        <button type="button" class="icon-btn" data-close aria-label="Chiudi">✕</button>
      </header>
      <div class="sheet-body">${body}</div>
      <footer class="sheet-foot">
        ${onDelete ? '<button type="button" class="btn danger" data-delete>Elimina</button>' : ''}
        <span class="spacer"></span>
        <button type="button" class="btn" data-close>Annulla</button>
        <button type="submit" class="btn primary">${esc(submitLabel)}</button>
      </footer>
    </form>`;
  const form = $('form', modal);
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const data = {};
    for (const [k, v] of new FormData(form)) {
      data[k] = k in data ? [].concat(data[k], v) : typeof v === 'string' ? v.trim() : v;
    }
    try {
      if (onSubmit(data, form) !== false) modal.close();
    } catch (err) {
      alert(err.message);
    }
  });
  modal.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => modal.close()));
  $('[data-delete]', modal)?.addEventListener('click', () => {
    if (confirm('Eliminare definitivamente?')) {
      onDelete();
      modal.close();
    }
  });
  modal.showModal();
  $('input, textarea, select', form)?.focus();
}

function field(label, name, value = '', attrs = '') {
  return `<label class="field"><span>${esc(label)}</span>
    <input name="${name}" value="${esc(value)}" ${attrs}></label>`;
}

function textarea(label, name, value = '', attrs = '') {
  return `<label class="field"><span>${esc(label)}</span>
    <textarea name="${name}" ${attrs}>${esc(value)}</textarea></label>`;
}

function progress(done, total) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return `<div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
    <div style="width:${pct}%"></div></div>`;
}

function empty(text) {
  return `<p class="empty">${text}</p>`;
}

// ---------- Home ----------

function viewHome() {
  const s = state.settings;
  const today = todayIso();
  const events = upcomingEvents(state.events, today, 14);
  const openCollections = state.collections.filter((c) => !c.closed);
  const openPolls = state.polls.filter((p) => !p.closed);
  const hasData = state.students.length || state.events.length || state.collections.length;
  const lastBackup = s.lastBackupAt ? s.lastBackupAt.slice(0, 10) : null;
  const backupStale = hasData && (!lastBackup || lastBackup < addDays(today, -BACKUP_REMINDER_DAYS));

  return `
    <section class="hero">
      <h1>${esc(s.className || 'La mia classe')}</h1>
      <p>${s.schoolYear ? `A.S. ${esc(s.schoolYear)} · ` : ''}${state.students.length} alunni</p>
      ${!s.className ? '<a class="btn small" href="#/impostazioni">Configura la classe</a>' : ''}
    </section>

    ${backupStale ? `
      <div class="notice">
        <strong>Fai un backup.</strong> I dati sono salvati solo su questo dispositivo
        ${lastBackup ? `(ultimo backup: ${formatDate(lastBackup)})` : '(mai fatto un backup)'}.
        <button class="btn small" data-action="export-backup">Scarica backup</button>
      </div>` : ''}

    ${!state.students.length ? `
      <div class="card">
        <h3>Per iniziare</h3>
        <p>Aggiungi gli alunni della classe: servono per rubrica, quote e sondaggi.</p>
        <button class="btn primary" data-action="import-students">Incolla elenco alunni</button>
      </div>` : ''}

    <section>
      <div class="section-head"><h2>Prossimi 14 giorni</h2><a href="#/agenda">Agenda</a></div>
      ${events.length ? `<ul class="list">${events.map(eventItem).join('')}</ul>` : empty('Nessun impegno in arrivo.')}
    </section>

    <section>
      <div class="section-head"><h2>Quote aperte</h2><a href="#/quote">Tutte</a></div>
      ${openCollections.length ? `<ul class="list">${openCollections.map(collectionItem).join('')}</ul>` : empty('Nessuna raccolta in corso.')}
    </section>

    ${openPolls.length ? `
      <section>
        <div class="section-head"><h2>Sondaggi aperti</h2><a href="#/sondaggi">Tutti</a></div>
        <ul class="list">${openPolls.map(pollItem).join('')}</ul>
      </section>` : ''}`;
}

// ---------- Rubrica ----------

function viewContacts() {
  return `
    <div class="page-head">
      <h1>Rubrica</h1>
      <button class="btn primary" data-action="new-student">+ Alunno</button>
    </div>
    <input type="search" class="search" id="contact-search" placeholder="Cerca alunno, genitore, telefono…" value="${esc(contactQuery)}">
    <div class="toolbar">
      <button class="btn small" data-action="copy-emails">Copia tutte le email</button>
      <button class="btn small" data-action="export-csv">Esporta CSV</button>
      <button class="btn small" data-action="import-students">Incolla elenco</button>
    </div>
    <div id="contact-list">${contactList()}</div>`;
}

function contactList() {
  const list = sortStudents(state.students).filter((s) => matchesStudent(s, contactQuery));
  if (!state.students.length) return empty('Nessun alunno. Aggiungili uno per uno o incolla un elenco.');
  if (!list.length) return empty('Nessun risultato.');
  return `<ul class="list">${list.map(contactItem).join('')}</ul>`;
}

function contactItem(s) {
  const parents = s.parents
    .map((p) => {
      const wa = whatsappNumber(p.phone);
      return `<div class="parent">
        <span>${esc(p.name || 'Genitore')}</span>
        <span class="links">
          ${p.phone ? `<a href="tel:${esc(p.phone.replace(/\s/g, ''))}" aria-label="Chiama">📞</a>` : ''}
          ${wa ? `<a href="https://wa.me/${wa}" target="_blank" rel="noopener" aria-label="WhatsApp">💬</a>` : ''}
          ${p.email ? `<a href="mailto:${esc(p.email)}" aria-label="Email">✉️</a>` : ''}
        </span>
      </div>`;
    })
    .join('');
  return `<li class="item">
    <button class="item-main" data-action="edit-student" data-id="${s.id}">
      <strong>${esc(s.name)}</strong>
      ${s.notes ? `<small>${esc(s.notes)}</small>` : ''}
    </button>
    ${parents || '<small class="muted">Nessun contatto</small>'}
  </li>`;
}

function studentForm(student) {
  const s = student || { name: '', notes: '', parents: [] };
  const parent = (i) => {
    const p = s.parents[i] || {};
    return `<fieldset><legend>Genitore ${i + 1}</legend>
      ${field('Nome', `p${i}name`, p.name, 'autocomplete="off"')}
      ${field('Telefono', `p${i}phone`, p.phone, 'type="tel" autocomplete="off"')}
      ${field('Email', `p${i}email`, p.email, 'type="email" autocomplete="off"')}
    </fieldset>`;
  };
  openForm({
    title: student ? 'Modifica alunno' : 'Nuovo alunno',
    body: `${field('Nome e cognome alunno', 'name', s.name, 'required')}
      ${parent(0)}${parent(1)}
      ${textarea('Note (allergie, uscite autonome…)', 'notes', s.notes, 'rows="2"')}`,
    onSubmit(d) {
      const parents = [0, 1]
        .map((i) => ({ name: d[`p${i}name`], phone: d[`p${i}phone`], email: d[`p${i}email`] }))
        .filter((p) => p.name || p.phone || p.email);
      commit((st) => {
        if (student) Object.assign(byId(st.students, student.id), { name: d.name, notes: d.notes, parents });
        else st.students.push({ id: uid(), name: d.name, notes: d.notes, parents });
      });
    },
    onDelete: student && (() => commit((st) => deleteStudent(st, student.id))),
  });
}

function deleteStudent(st, id) {
  st.students = st.students.filter((s) => s.id !== id);
  for (const c of st.collections) {
    delete c.payments[id];
    c.excluded = c.excluded.filter((x) => x !== id);
  }
  for (const p of st.polls) delete p.votes[id];
}

function importStudentsForm() {
  openForm({
    title: 'Incolla elenco alunni',
    submitLabel: 'Aggiungi',
    body: `<p class="hint">Un alunno per riga. I nomi già presenti vengono ignorati.</p>
      ${textarea('Elenco', 'names', '', 'rows="10" required placeholder="Rossi Mario\nBianchi Giulia"')}`,
    onSubmit(d) {
      const seen = new Set(state.students.map((s) => s.name.toLowerCase()));
      const names = d.names
        .split(/\r?\n/)
        .map((n) => n.trim().replace(/\s+/g, ' '))
        .filter((n) => n && !seen.has(n.toLowerCase()) && seen.add(n.toLowerCase()));
      commit((st) => names.forEach((name) => st.students.push({ id: uid(), name, notes: '', parents: [] })));
      toast(`${names.length} alunni aggiunti`);
    },
  });
}

// ---------- Quote ----------

function collectionItem(c) {
  const sum = collectionSummary(c, state.students);
  return `<li><a class="item link" href="#/quote/${c.id}">
    <div class="row"><strong>${esc(c.title)}</strong><span>${formatEuro(c.amountCents)}</span></div>
    ${progress(sum.paid.length, sum.participants.length)}
    <small>${sum.paid.length}/${sum.participants.length} pagato · ${formatEuro(sum.collectedCents)} di ${formatEuro(sum.expectedCents)}
      ${c.dueDate ? ` · entro ${formatDate(c.dueDate)}` : ''}</small>
  </a></li>`;
}

function viewCollections() {
  const open = state.collections.filter((c) => !c.closed);
  const closed = state.collections.filter((c) => c.closed);
  return `
    <div class="page-head">
      <h1>Quote</h1>
      <button class="btn primary" data-action="new-collection">+ Raccolta</button>
    </div>
    ${open.length ? `<ul class="list">${open.map(collectionItem).join('')}</ul>` : empty('Nessuna raccolta in corso.')}
    ${closed.length ? `<details><summary>Chiuse (${closed.length})</summary>
      <ul class="list">${closed.map(collectionItem).join('')}</ul></details>` : ''}`;
}

function viewCollection(id) {
  const c = byId(state.collections, id);
  if (!c) return notFound();
  const sum = collectionSummary(c, state.students);
  const rows = sum.participants
    .map((s) => {
      const paidOn = c.payments[s.id];
      return `<li class="check-row">
        <label>
          <input type="checkbox" data-action="toggle-payment" data-id="${c.id}" data-student="${s.id}" ${paidOn ? 'checked' : ''}>
          <span>${esc(s.name)}</span>
        </label>
        <small>${paidOn ? formatDate(paidOn, { day: 'numeric', month: 'short' }) : ''}</small>
      </li>`;
    })
    .join('');
  return `
    <a class="back" href="#/quote">‹ Quote</a>
    <div class="page-head">
      <h1>${esc(c.title)}${c.closed ? ' <span class="tag">chiusa</span>' : ''}</h1>
      <button class="btn" data-action="edit-collection" data-id="${c.id}">Modifica</button>
    </div>
    <div class="card">
      <div class="stats">
        <div><span>Quota</span><strong>${formatEuro(c.amountCents)}</strong></div>
        <div><span>Incassato</span><strong>${formatEuro(sum.collectedCents)}</strong></div>
        <div><span>Mancano</span><strong>${formatEuro(sum.expectedCents - sum.collectedCents)}</strong></div>
      </div>
      ${progress(sum.paid.length, sum.participants.length)}
      <small>${sum.paid.length} su ${sum.participants.length} hanno pagato${c.dueDate ? ` · scadenza ${formatDate(c.dueDate)}` : ''}</small>
      ${c.notes ? `<p class="pre">${esc(c.notes)}</p>` : ''}
    </div>
    <div class="toolbar">
      <button class="btn small" data-action="share-unpaid" data-id="${c.id}">Invia promemoria a chi manca</button>
      <button class="btn small" data-action="toggle-collection" data-id="${c.id}">${c.closed ? 'Riapri' : 'Chiudi raccolta'}</button>
    </div>
    ${state.students.length ? `<ul class="list checks">${rows}</ul>` : empty('Aggiungi prima gli alunni in Rubrica.')}`;
}

function collectionForm(collection) {
  const c = collection || { title: '', amountCents: 0, dueDate: '', notes: '', excluded: [] };
  const excluded = new Set(c.excluded);
  const participants = sortStudents(state.students)
    .map((s) => `<label class="inline"><input type="checkbox" name="participants" value="${s.id}" ${excluded.has(s.id) ? '' : 'checked'}> ${esc(s.name)}</label>`)
    .join('');
  openForm({
    title: collection ? 'Modifica raccolta' : 'Nuova raccolta',
    body: `${field('Descrizione', 'title', c.title, 'required placeholder="Regalo maestra, gita…"')}
      ${field('Quota a testa (€)', 'amount', centsToInput(c.amountCents), 'inputmode="decimal" required placeholder="10,00"')}
      ${field('Scadenza', 'dueDate', c.dueDate, 'type="date"')}
      ${textarea('Note', 'notes', c.notes, 'rows="2"')}
      ${participants ? `<fieldset><legend>Partecipanti</legend><div class="checks-grid">${participants}</div></fieldset>` : ''}`,
    onSubmit(d) {
      const amountCents = parseEuro(d.amount);
      const chosen = new Set([].concat(d.participants || []));
      const fields = {
        title: d.title,
        amountCents,
        dueDate: d.dueDate,
        notes: d.notes,
        excluded: state.students.filter((s) => !chosen.has(s.id)).map((s) => s.id),
      };
      let newId;
      commit((st) => {
        if (collection) Object.assign(byId(st.collections, collection.id), fields);
        else st.collections.push({ id: (newId = uid()), payments: {}, closed: false, ...fields });
      });
      if (newId) location.hash = `#/quote/${newId}`;
    },
    onDelete:
      collection &&
      (() => {
        commit((st) => (st.collections = st.collections.filter((x) => x.id !== collection.id)));
        location.hash = '#/quote';
      }),
  });
}

// ---------- Agenda ----------

function eventItem(e) {
  return `<li><button class="item item-main event" data-action="edit-event" data-id="${e.id}">
    <div class="date-badge"><span>${formatDate(e.date, { month: 'short' })}</span><strong>${Number(e.date.slice(8))}</strong></div>
    <div>
      <strong>${esc(e.title)}</strong>
      <small>${formatDate(e.date, { weekday: 'long' })}${e.time ? ` · ${esc(e.time)}` : ''}${e.location ? ` · ${esc(e.location)}` : ''}</small>
      <small class="tag">${esc(EVENT_TYPES[e.type] || EVENT_TYPES.altro)}</small>
    </div>
  </button></li>`;
}

function viewAgenda() {
  const today = todayIso();
  const future = sortEvents(state.events.filter((e) => e.date >= today));
  const past = sortEvents(state.events.filter((e) => e.date < today)).reverse();
  return `
    <div class="page-head">
      <h1>Agenda</h1>
      <button class="btn primary" data-action="new-event">+ Evento</button>
    </div>
    <div class="toolbar">
      <button class="btn small" data-action="export-ics" ${future.length ? '' : 'disabled'}>Aggiungi al calendario del telefono (.ics)</button>
    </div>
    <p class="hint">Il file .ics include un promemoria il giorno prima di ogni evento.</p>
    ${future.length ? `<ul class="list">${future.map(eventItem).join('')}</ul>` : empty('Nessun evento in programma.')}
    ${past.length ? `<details><summary>Passati (${past.length})</summary><ul class="list">${past.map(eventItem).join('')}</ul></details>` : ''}`;
}

function eventForm(event) {
  const e = event || { title: '', date: todayIso(), time: '', type: 'riunione', location: '', notes: '' };
  const options = Object.entries(EVENT_TYPES)
    .map(([k, v]) => `<option value="${k}" ${k === e.type ? 'selected' : ''}>${v}</option>`)
    .join('');
  openForm({
    title: event ? 'Modifica evento' : 'Nuovo evento',
    body: `${field('Titolo', 'title', e.title, 'required')}
      <label class="field"><span>Tipo</span><select name="type">${options}</select></label>
      <div class="two">${field('Data', 'date', e.date, 'type="date" required')}${field('Ora', 'time', e.time, 'type="time"')}</div>
      ${field('Luogo', 'location', e.location)}
      ${textarea('Note', 'notes', e.notes, 'rows="3"')}
      ${event ? '<button type="button" class="btn small" data-ics>Scarica solo questo evento (.ics)</button>' : ''}`,
    onSubmit(d) {
      const fields = { title: d.title, type: d.type, date: d.date, time: d.time, location: d.location, notes: d.notes };
      commit((st) => {
        if (event) Object.assign(byId(st.events, event.id), fields);
        else st.events.push({ id: uid(), ...fields });
      });
    },
    onDelete: event && (() => commit((st) => (st.events = st.events.filter((x) => x.id !== event.id)))),
  });
  $('[data-ics]', modal)?.addEventListener('click', () =>
    download(`${slug(e.title)}.ics`, eventsIcs([e]), 'text/calendar'),
  );
}

function slug(text) {
  return text.toLowerCase().normalize('NFD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '') || 'evento';
}

// ---------- Verbali e sondaggi ----------

function tabs(active) {
  return `<nav class="tabs">
    <a href="#/verbali" class="${active === 'verbali' ? 'active' : ''}">Verbali</a>
    <a href="#/sondaggi" class="${active === 'sondaggi' ? 'active' : ''}">Sondaggi</a>
  </nav>`;
}

function viewMinutes() {
  const list = [...state.minutes].sort((a, b) => b.date.localeCompare(a.date));
  return `
    ${tabs('verbali')}
    <div class="page-head">
      <h1>Verbali</h1>
      <button class="btn primary" data-action="new-minutes">+ Verbale</button>
    </div>
    ${list.length ? `<ul class="list">${list.map((m) => `<li><a class="item link" href="#/verbale/${m.id}">
        <strong>${esc(m.title)}</strong>
        <small>${formatDate(m.date, { day: 'numeric', month: 'long', year: 'numeric' })}</small>
        <small class="muted clamp">${esc(m.body)}</small>
      </a></li>`).join('')}</ul>` : empty('Nessun verbale.')}`;
}

function minutesText(m) {
  return [
    `${m.title} — ${formatDate(m.date, { day: 'numeric', month: 'long', year: 'numeric' })}`,
    m.attendees ? `Presenti: ${m.attendees}` : '',
    '',
    m.body,
  ].filter((x, i) => x || i === 2).join('\n');
}

function viewMinutesDetail(id) {
  const m = byId(state.minutes, id);
  if (!m) return notFound();
  return `
    <a class="back" href="#/verbali">‹ Verbali</a>
    <div class="page-head">
      <h1>${esc(m.title)}</h1>
      <button class="btn" data-action="edit-minutes" data-id="${m.id}">Modifica</button>
    </div>
    <p class="muted">${formatDate(m.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
    ${m.attendees ? `<p><strong>Presenti:</strong> ${esc(m.attendees)}</p>` : ''}
    <div class="card pre">${esc(m.body) || '<span class="muted">Vuoto</span>'}</div>
    <div class="toolbar"><button class="btn small" data-action="share-minutes" data-id="${m.id}">Condividi / copia</button></div>`;
}

function minutesForm(minutes) {
  const m = minutes || { title: 'Riunione genitori', date: todayIso(), attendees: '', body: '' };
  openForm({
    title: minutes ? 'Modifica verbale' : 'Nuovo verbale',
    body: `${field('Titolo', 'title', m.title, 'required')}
      ${field('Data', 'date', m.date, 'type="date" required')}
      ${field('Presenti', 'attendees', m.attendees)}
      ${textarea('Contenuto', 'body', m.body, 'rows="12" placeholder="Ordine del giorno, decisioni, cose da fare…"')}`,
    onSubmit(d) {
      const fields = { title: d.title, date: d.date, attendees: d.attendees, body: d.body };
      let newId;
      commit((st) => {
        if (minutes) Object.assign(byId(st.minutes, minutes.id), fields);
        else st.minutes.push({ id: (newId = uid()), ...fields });
      });
      if (newId) location.hash = `#/verbale/${newId}`;
    },
    onDelete:
      minutes &&
      (() => {
        commit((st) => (st.minutes = st.minutes.filter((x) => x.id !== minutes.id)));
        location.hash = '#/verbali';
      }),
  });
}

function pollItem(p) {
  const { answered } = pollTally(p, state.students);
  return `<li><a class="item link" href="#/sondaggio/${p.id}">
    <strong>${esc(p.question)}</strong>
    ${progress(answered, state.students.length)}
    <small>${answered}/${state.students.length} risposte${p.closed ? ' · chiuso' : ''}</small>
  </a></li>`;
}

function viewPolls() {
  const open = state.polls.filter((p) => !p.closed);
  const closed = state.polls.filter((p) => p.closed);
  return `
    ${tabs('sondaggi')}
    <div class="page-head">
      <h1>Sondaggi</h1>
      <button class="btn primary" data-action="new-poll">+ Sondaggio</button>
    </div>
    <p class="hint">Registra qui le risposte raccolte (es. dalla chat di classe) per avere il conteggio e sapere chi manca.</p>
    ${open.length ? `<ul class="list">${open.map(pollItem).join('')}</ul>` : empty('Nessun sondaggio aperto.')}
    ${closed.length ? `<details><summary>Chiusi (${closed.length})</summary><ul class="list">${closed.map(pollItem).join('')}</ul></details>` : ''}`;
}

function viewPoll(id) {
  const p = byId(state.polls, id);
  if (!p) return notFound();
  const tally = pollTally(p, state.students);
  const max = Math.max(1, ...tally.counts);
  const bars = p.options
    .map((o, i) => `<div class="bar">
      <div class="row"><span>${esc(o)}</span><strong>${tally.counts[i]}</strong></div>
      <div class="progress"><div style="width:${(tally.counts[i] / max) * 100}%"></div></div>
    </div>`)
    .join('');
  const opts = (sid) =>
    `<option value="">—</option>` +
    p.options.map((o, i) => `<option value="${i}" ${p.votes[sid] === i ? 'selected' : ''}>${esc(o)}</option>`).join('');
  const rows = sortStudents(state.students)
    .map((s) => `<li class="check-row"><span>${esc(s.name)}</span>
      <select data-action="vote" data-id="${p.id}" data-student="${s.id}" ${p.closed ? 'disabled' : ''}>${opts(s.id)}</select></li>`)
    .join('');
  return `
    <a class="back" href="#/sondaggi">‹ Sondaggi</a>
    <div class="page-head">
      <h1>${esc(p.question)}${p.closed ? ' <span class="tag">chiuso</span>' : ''}</h1>
      <button class="btn" data-action="edit-poll" data-id="${p.id}">Modifica</button>
    </div>
    <div class="card">${bars}<small>${tally.answered}/${state.students.length} risposte</small></div>
    <div class="toolbar">
      <button class="btn small" data-action="share-poll" data-id="${p.id}">Condividi risultati</button>
      <button class="btn small" data-action="toggle-poll" data-id="${p.id}">${p.closed ? 'Riapri' : 'Chiudi sondaggio'}</button>
    </div>
    ${state.students.length ? `<ul class="list checks">${rows}</ul>` : empty('Aggiungi prima gli alunni in Rubrica.')}`;
}

function pollForm(poll) {
  const p = poll || { question: '', options: ['Sì', 'No'] };
  const locked = poll && Object.keys(poll.votes).length > 0;
  openForm({
    title: poll ? 'Modifica sondaggio' : 'Nuovo sondaggio',
    body: `${field('Domanda', 'question', p.question, 'required')}
      ${textarea('Opzioni (una per riga)', 'options', p.options.join('\n'), `rows="5" required ${locked ? 'readonly' : ''}`)}
      ${locked ? '<p class="hint">Le opzioni non si possono cambiare dopo aver registrato risposte.</p>' : ''}`,
    onSubmit(d) {
      const options = locked ? poll.options : d.options.split(/\r?\n/).map((o) => o.trim()).filter(Boolean);
      if (options.length < 2) throw new Error('Servono almeno due opzioni.');
      let newId;
      commit((st) => {
        if (poll) Object.assign(byId(st.polls, poll.id), { question: d.question, options });
        else st.polls.push({ id: (newId = uid()), question: d.question, options, votes: {}, closed: false });
      });
      if (newId) location.hash = `#/sondaggio/${newId}`;
    },
    onDelete:
      poll &&
      (() => {
        commit((st) => (st.polls = st.polls.filter((x) => x.id !== poll.id)));
        location.hash = '#/sondaggi';
      }),
  });
}

// ---------- Impostazioni ----------

function viewSettings() {
  const s = state.settings;
  return `
    <a class="back" href="#/">‹ Home</a>
    <h1>Impostazioni</h1>
    <form class="card" id="settings-form">
      ${field('Classe', 'className', s.className, 'placeholder="3ª B – Scuola primaria Rodari"')}
      ${field('Anno scolastico', 'schoolYear', s.schoolYear, 'placeholder="2026/2027"')}
      <button class="btn primary" type="submit">Salva</button>
    </form>

    <div class="card">
      <h3>Backup</h3>
      <p>I dati restano <strong>solo su questo dispositivo</strong>, nel browser. Se cancelli i dati di navigazione
        o cambi telefono, li perdi. Scarica un backup regolarmente (es. su Drive o via email a te stesso).</p>
      <p class="muted">Ultimo backup: ${s.lastBackupAt ? formatDate(s.lastBackupAt.slice(0, 10), { day: 'numeric', month: 'long', year: 'numeric' }) : 'mai'}</p>
      <div class="toolbar">
        <button class="btn" data-action="export-backup">Scarica backup</button>
        <label class="btn">Ripristina da file<input type="file" accept="application/json,.json" id="restore" hidden></label>
      </div>
      <p class="muted" id="persist-status"></p>
    </div>

    <div class="card">
      <h3>Privacy</h3>
      <p>L'app non invia dati a nessun server. Ricorda però che stai trattando dati personali di altre famiglie:
        conserva i backup in un posto protetto e non condividere la rubrica completa.</p>
    </div>

    <div class="card danger-zone">
      <h3>Cancella tutto</h3>
      <button class="btn danger" data-action="reset">Cancella tutti i dati</button>
    </div>`;
}

function exportBackup() {
  state.settings.lastBackupAt = new Date().toISOString();
  saveState(state);
  const name = slug(state.settings.className || 'classe');
  download(`rappresentante-${name}-${todayIso()}.json`, JSON.stringify(state, null, 2), 'application/json');
  render();
}

async function restoreBackup(file) {
  try {
    const restored = normalizeState(JSON.parse(await file.text()));
    const summary = `${restored.students.length} alunni, ${restored.collections.length} raccolte, ${restored.events.length} eventi`;
    if (!confirm(`Ripristinare il backup (${summary})?\nI dati attuali verranno sostituiti.`)) return;
    commit((st) => Object.assign(st, restored));
    toast('Backup ripristinato');
  } catch (err) {
    alert('Ripristino non riuscito: ' + err.message);
  }
}

function notFound() {
  return `<a class="back" href="#/">‹ Home</a>${empty('Elemento non trovato.')}`;
}

// ---------- Router ----------

const routes = [
  [/^#\/?$/, viewHome, 'home'],
  [/^#\/rubrica$/, viewContacts, 'rubrica'],
  [/^#\/quote$/, viewCollections, 'quote'],
  [/^#\/quote\/(\w+)$/, viewCollection, 'quote'],
  [/^#\/agenda$/, viewAgenda, 'agenda'],
  [/^#\/verbali$/, viewMinutes, 'verbali'],
  [/^#\/verbale\/(\w+)$/, viewMinutesDetail, 'verbali'],
  [/^#\/sondaggi$/, viewPolls, 'verbali'],
  [/^#\/sondaggio\/(\w+)$/, viewPoll, 'verbali'],
  [/^#\/impostazioni$/, viewSettings, ''],
];

let lastHash = null;
function render() {
  const hash = location.hash || '#/';
  const [re, fn, tab] = routes.find(([r]) => r.test(hash)) || routes[0];
  view.innerHTML = fn(...(hash.match(re) || []).slice(1));
  document.querySelectorAll('.bottom-nav a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
  if (hash !== lastHash) window.scrollTo(0, 0);
  lastHash = hash;
  if (fn === viewSettings) updatePersistStatus();
}

async function updatePersistStatus() {
  const el = $('#persist-status');
  if (!el || !navigator.storage?.persisted) return;
  el.textContent = (await navigator.storage.persisted())
    ? 'Archiviazione persistente attiva: il browser non cancellerà i dati automaticamente.'
    : 'Archiviazione non persistente: installa l\'app sulla schermata Home per renderla più sicura.';
}

// ---------- Azioni ----------

const actions = {
  'new-student': () => studentForm(),
  'edit-student': (d) => studentForm(byId(state.students, d.id)),
  'import-students': () => importStudentsForm(),
  'copy-emails': () => {
    const emails = allEmails(state.students);
    if (!emails.length) return toast('Nessuna email in rubrica');
    shareText(emails.join(', '), 'Email genitori');
  },
  'export-csv': () => download(`rubrica-${todayIso()}.csv`, contactsCsv(state.students), 'text/csv;charset=utf-8'),
  'new-collection': () => collectionForm(),
  'edit-collection': (d) => collectionForm(byId(state.collections, d.id)),
  'toggle-collection': (d) => commit((st) => {
    const c = byId(st.collections, d.id);
    c.closed = !c.closed;
  }),
  'share-unpaid': (d) => shareText(unpaidReminderText(byId(state.collections, d.id), state.students), 'Promemoria quota'),
  'new-event': () => eventForm(),
  'edit-event': (d) => eventForm(byId(state.events, d.id)),
  'export-ics': () =>
    download('agenda-classe.ics', eventsIcs(state.events.filter((e) => e.date >= todayIso())), 'text/calendar'),
  'new-minutes': () => minutesForm(),
  'edit-minutes': (d) => minutesForm(byId(state.minutes, d.id)),
  'share-minutes': (d) => shareText(minutesText(byId(state.minutes, d.id)), 'Verbale'),
  'new-poll': () => pollForm(),
  'edit-poll': (d) => pollForm(byId(state.polls, d.id)),
  'toggle-poll': (d) => commit((st) => {
    const p = byId(st.polls, d.id);
    p.closed = !p.closed;
  }),
  'share-poll': (d) => shareText(pollResultsText(byId(state.polls, d.id), state.students), 'Risultati sondaggio'),
  'export-backup': () => exportBackup(),
  reset: () => {
    if (!confirm('Cancellare TUTTI i dati? Operazione irreversibile.')) return;
    if (prompt('Scrivi CANCELLA per confermare') !== 'CANCELLA') return;
    commit((st) => Object.assign(st, emptyState()));
    location.hash = '#/';
  },
};

document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-action]');
  if (!el || el.tagName === 'INPUT' || el.tagName === 'SELECT') return;
  actions[el.dataset.action]?.(el.dataset);
});

document.addEventListener('change', (ev) => {
  const el = ev.target;
  if (el.dataset.action === 'toggle-payment') {
    commit((st) => {
      const c = byId(st.collections, el.dataset.id);
      if (el.checked) c.payments[el.dataset.student] = todayIso();
      else delete c.payments[el.dataset.student];
    });
  } else if (el.dataset.action === 'vote') {
    commit((st) => {
      const p = byId(st.polls, el.dataset.id);
      if (el.value === '') delete p.votes[el.dataset.student];
      else p.votes[el.dataset.student] = Number(el.value);
    });
  } else if (el.id === 'restore' && el.files[0]) {
    restoreBackup(el.files[0]);
    el.value = '';
  }
});

document.addEventListener('input', (ev) => {
  if (ev.target.id === 'contact-search') {
    contactQuery = ev.target.value;
    $('#contact-list').innerHTML = contactList();
  }
});

document.addEventListener('submit', (ev) => {
  if (ev.target.id !== 'settings-form') return;
  ev.preventDefault();
  const d = Object.fromEntries(new FormData(ev.target));
  commit((st) => Object.assign(st.settings, { className: d.className.trim(), schoolYear: d.schoolYear.trim() }));
  toast('Salvato');
});

// Se i dati vengono modificati in un'altra scheda, ricarica.
window.addEventListener('storage', () => {
  state = loadState();
  render();
});

window.addEventListener('hashchange', render);
render();
requestPersistence();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('Service worker non registrato', err));
}
