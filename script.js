'use strict';
/* MediSchedule – demo project. All data is fictional and stored in LocalStorage. */
const KEY = 'medischedule_demo_v1';
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const STATUSES = ['Available', 'On Leave', 'Unavailable'];
const PAGES = [['dashboard', '📊', 'Dashboard'], ['doctors', '🩺', 'Doctors'], ['appointments', '📅', 'Patient Appointments'],
  ['availability', '🕒', 'Doctor Availability'], ['analytics', '📈', 'Appointment Analytics'],
  ['recommendations', '🤖', 'AI Recommendations'], ['settings', '⚙️', 'Settings']];

/* ---------- small helpers ---------- */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (n, from = new Date()) => new Date(from.getFullYear(), from.getMonth(), from.getDate() + n);
const todayISO = () => iso(new Date());
const mins = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const hm = m => pad(Math.floor(m / 60)) + ':' + pad(m % 60);
const t12 = t => { const [h, m] = t.split(':').map(Number); return ((h + 11) % 12 + 1) + ':' + pad(m) + (h < 12 ? ' AM' : ' PM'); };
const empty = m => `<p class="empty">${m}</p>`;
const nextId = (p, arr, w) => p + String(Math.max(0, ...arr.map(x => parseInt(x.id.replace(/\D/g, ''), 10))) + 1).padStart(w, '0');

/* ---------- state ---------- */
let S, page = 'dashboard', editApptId = null;
const docById = id => S.doctors.find(d => d.id === id);
const active = a => a.status !== 'Cancelled';

function persist() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('Could not save to LocalStorage.', 'err'); } }
function load() {
  try { S = JSON.parse(localStorage.getItem(KEY)); } catch (e) { S = null; }
  if (!S || !S.doctors || !S.appts) { S = seed(); persist(); }
}
function commit() { persist(); render(); }

/* ---------- scheduling rules ---------- */
const slotsOf = d => { const out = []; for (let t = mins(d.start); t + d.dur <= mins(d.end); t += d.dur) out.push(hm(t)); return out; };
const cap = d => Math.min(d.cap, slotsOf(d).length);
const works = (d, date) => d.status === 'Available' && d.days.includes(parse(date).getDay());
const taken = (docId, date, time, ex) => S.appts.some(a => a.docId === docId && a.date === date && a.time === time && active(a) && a.id !== ex);
const count = (d, date, ex) => S.appts.filter(a => a.docId === d.id && a.date === date && active(a) && a.id !== ex).length;
const freeSlots = (d, date, ex) => works(d, date) && count(d, date, ex) < cap(d) ? slotsOf(d).filter(t => !taken(d.id, date, t, ex)) : [];
function stat(d, date) {
  const w = works(d, date), c = w ? cap(d) : 0, b = count(d, date);
  const free = w ? Math.max(0, Math.min(freeSlots(d, date).length, c - b)) : 0;
  return { w, c, b, free, pct: c ? Math.round(b / c * 100) : 0 };
}
const capacityOn = date => S.doctors.filter(d => works(d, date)).reduce((s, d) => s + cap(d), 0);

/* Alternatives: same doctor (same day, then next 7 days), then other doctors with the same specialization. */
function alternatives(d, date, time, ex) {
  const base = date < todayISO() ? todayISO() : date, out = [];
  const add = (dd, dt, t) => out.push({ doc: dd.id, date: dt, time: t, lab: `${dd.name} · ${dt} · ${t12(t)}` });
  freeSlots(d, base, ex).filter(t => t !== time).slice(0, 4).forEach(t => add(d, base, t));
  for (let i = 1; i <= 7 && out.length < 7; i++) { const dt = iso(addDays(i, parse(base))); const f = freeSlots(d, dt, ex); if (f.length) add(d, dt, f[0]); }
  S.doctors.filter(x => x.id !== d.id && x.spec === d.spec).forEach(x => freeSlots(x, base, ex).slice(0, 2).forEach(t => add(x, base, t)));
  return out.slice(0, 10);
}
function altHTML(d, date, time, ex) {
  const a = alternatives(d, date, time, ex);
  return a.length ? `<div class="alts"><b>Alternative slots (click one to use it)</b><div class="chips">${a.map(x => `<button type="button" class="chip open" data-act="pick" data-doc="${x.doc}" data-date="${x.date}" data-time="${x.time}">${esc(x.lab)}</button>`).join('')}</div></div>`
    : `<div class="alts">No alternative slots found in the next 7 days.</div>`;
}

/* ---------- demonstration forecast (weighted average, NOT a trained AI model) ---------- */
function forecast() {
  const h = S.history, avg = (a, b) => { let s = 0, c = 0; for (let w = a; w < b; w++) for (let d = 0; d < 7; d++) { s += h[w][d]; c++; } return s / c; };
  const trend = Math.min(1.15, Math.max(0.85, avg(4, 8) / avg(0, 4)));
  const out = [];
  for (let i = 1; i <= 7; i++) {
    const dt = addDays(i), wd = dt.getDay(); let s = 0, ws = 0;
    h.forEach((row, w) => { s += row[wd] * (w + 1); ws += w + 1; });   // newer weeks count more
    out.push({ date: iso(dt), wd, est: Math.round(s / ws * trend), cap: capacityOn(iso(dt)) });
  }
  const mean = out.reduce((a, b) => a + b.est, 0) / out.length;
  out.forEach(o => { o.label = o.est > mean * 1.1 ? 'Busier' : o.est < mean * 0.8 ? 'Quieter' : 'Normal'; });
  return out;
}

/* ---------- sample data (all fictional) ---------- */
function seed() {
  const doctors = [
    { id: 'D01', name: 'Dr. Ayesha Khan', spec: 'Cardiology', days: [1, 2, 3, 4, 5], start: '09:00', end: '14:00', dur: 30, cap: 10, status: 'Available' },
    { id: 'D02', name: 'Dr. Bilal Ahmed', spec: 'General Medicine', days: [1, 2, 3, 4, 5, 6], start: '10:00', end: '16:00', dur: 20, cap: 15, status: 'Available' },
    { id: 'D03', name: 'Dr. Sana Malik', spec: 'Pediatrics', days: [1, 3, 5, 6], start: '08:00', end: '12:00', dur: 20, cap: 12, status: 'Available' },
    { id: 'D04', name: 'Dr. Hamza Raza', spec: 'Orthopedics', days: [2, 4, 6], start: '13:00', end: '18:00', dur: 30, cap: 8, status: 'Available' },
    { id: 'D05', name: 'Dr. Mariam Iqbal', spec: 'Dermatology', days: [1, 2, 3, 4], start: '11:00', end: '15:00', dur: 20, cap: 10, status: 'Available' },
    { id: 'D06', name: 'Dr. Usman Tariq', spec: 'Neurology', days: [1, 2, 4, 5], start: '15:00', end: '19:00', dur: 40, cap: 6, status: 'Available' },
    { id: 'D07', name: 'Dr. Hina Farooq', spec: 'General Medicine', days: [0, 1, 2, 3, 4], start: '16:00', end: '20:00', dur: 30, cap: 8, status: 'Available' }
  ];
  const names = ['Ali Raza', 'Fatima Noor', 'Omar Siddiqui', 'Zainab Ali', 'Hassan Javed', 'Maryam Shah', 'Imran Qureshi', 'Laiba Aslam', 'Saad Mehmood', 'Noor Fatima', 'Daniyal Butt', 'Iqra Bashir', 'Faizan Ahmad', 'Hira Yousaf', 'Kamran Latif', 'Rabia Anwar'];
  const appts = []; let n = 1;
  doctors.forEach((d, i) => {
    for (let o = -2; o <= 5; o++) {
      const dt = addDays(o);
      if (!d.days.includes(dt.getDay())) continue;
      const sl = slotsOf(d), c = Math.min(d.cap, sl.length);
      let k = Math.min(c, 1 + ((i * 2 + o + 4) % 4));
      if (i === 0 && o === 0) k = c;                 // one fully booked doctor today
      for (let j = 0; j < k; j++, n++) {
        appts.push({ id: 'APT-' + String(n).padStart(3, '0'), patient: names[(n * 5) % names.length], phone: '0300-555-' + String(1000 + (n * 37) % 9000),
          docId: d.id, date: iso(dt), time: sl[j], status: o < 0 ? 'Completed' : (n % 3 ? 'Confirmed' : 'Pending') });
      }
    }
  });
  const base = [6, 52, 50, 46, 48, 38, 28], history = [];
  for (let w = 0; w < 8; w++) history.push(base.map((b, d) => Math.max(0, Math.round(b * (1 + w * 0.015) + ((w * 5 + d * 3) % 7) - 3))));
  return { doctors, appts, history, settings: { hi: 80, lo: 30 } };
}

/* ---------- UI helpers ---------- */
function toast(m, t = 'ok') { const e = document.createElement('div'); e.className = 'toast ' + t; e.textContent = m; $('#toasts').append(e); setTimeout(() => e.remove(), 3500); }
function openModal(h) { $('#modalBox').innerHTML = h; $('#modal').hidden = false; }
function closeModal() { $('#modal').hidden = true; }
function hbars(rows) {
  if (!rows.length) return empty('Nothing to show yet.');
  const m = Math.max(...rows.map(r => r.max || r.v), 1);
  return rows.map(r => `<div class="hb"><span>${esc(r.l)}</span><div class="track"><i class="${r.cls || ''}" style="width:${Math.min(100, r.v / (r.max || m) * 100)}%"></i></div><b>${r.t ?? r.v}</b></div>`).join('');
}
function cols(rows) {
  const m = Math.max(...rows.map(r => r.v), 1);
  return `<div class="cols">${rows.map(r => `<div class="col"><div class="stack"><i class="${r.cls || ''}" style="height:${r.v / m * 100}%"><u>${r.v}</u></i></div><small>${esc(r.l)}</small></div>`).join('')}</div>`;
}
const dayLabel = ds => { const d = parse(ds); return DAYS[d.getDay()] + ' ' + d.getDate(); };
const specOptions = (sel, all) => { const specs = [...new Set(S.doctors.map(d => d.spec))].sort(); return `<option value="">${all}</option>` + specs.map(s => `<option ${s === sel ? 'selected' : ''}>${esc(s)}</option>`).join(''); };
const docOptions = (sel, all) => (all ? `<option value="">${all}</option>` : '') + S.doctors.map(d => `<option value="${d.id}" ${d.id === sel ? 'selected' : ''}>${esc(d.name)} – ${esc(d.spec)}</option>`).join('');

/* ---------- navigation ---------- */
function go(p) { page = p; try { history.replaceState(null, '', '#' + p); } catch (e) { /* file:// may block this */ } $('#sidebar').classList.remove('open'); render(); window.scrollTo(0, 0); }
function render() {
  const cur = PAGES.find(p => p[0] === page);
  $('#title').textContent = cur[2];
  $$('.page').forEach(p => p.classList.toggle('on', p.id === 'p-' + page));
  $$('#nav button').forEach(b => b.classList.toggle('on', b.dataset.page === page));
  ({ dashboard: rDash, doctors: rDocs, appointments: rAppts, availability: rAvail, analytics: rAn, recommendations: rAI, settings: rSet })[page]();
}

/* ---------- Dashboard ---------- */
function rDash() {
  const t = todayISO(), { hi, lo } = S.settings;
  let avail = 0, booked = 0, over = 0, unused = 0;
  S.doctors.forEach(d => { const s = stat(d, t); if (!s.w) return; avail += s.free; booked += s.b; if (s.pct >= hi) over += s.b; if (s.pct <= lo) unused += s.free; });
  const today = S.appts.filter(a => a.date === t && active(a)).length;
  const card = (ic, v, l, sub) => `<div class="card"><span class="ic">${ic}</span><div><b>${v}</b><small>${l}</small><em>${sub}</em></div></div>`;
  $('#cards').innerHTML = card('🩺', S.doctors.length, 'Registered doctors', `${S.doctors.filter(d => works(d, t)).length} working today`) +
    card('📅', today, 'Appointments today', 'not cancelled') + card('🟢', avail, 'Available slots', 'open today') +
    card('📌', booked, 'Booked slots', 'today') + card('🔥', over, 'Overused slots', `booked with doctors ≥ ${hi}% full`) +
    card('💤', unused, 'Unused slots', `open with doctors ≤ ${lo}% full`);
  const rows = S.doctors.map(d => ({ d, s: stat(d, t) })).filter(x => x.s.w);
  $('#docBars').innerHTML = rows.length ? hbars(rows.map(({ d, s }) => ({ l: d.name.replace('Dr. ', ''), v: s.b, max: s.c, t: `${s.b}/${s.c}`, cls: s.pct >= hi ? 'hot' : s.pct <= lo ? 'low' : '' }))) : empty('No doctors are working today.');
  $('#dailyChart').innerHTML = cols([0, 1, 2, 3, 4, 5, 6].map(i => { const ds = iso(addDays(i)); return { l: dayLabel(ds), v: S.appts.filter(a => a.date === ds && active(a)).length }; }));
  const f = forecast(); $('#demandChart').innerHTML = cols(f.map(o => ({ l: dayLabel(o.date), v: o.est, cls: o.label === 'Busier' ? 'hot' : '' }))) + '<p class="muted">Demonstration estimate of total appointments per day.</p>';
  const notes = [];
  S.appts.filter(a => a.date >= t && active(a) && a.status !== 'Completed').forEach(a => {
    const d = docById(a.docId);
    if (!d || !works(d, a.date) || !slotsOf(d).includes(a.time)) notes.push(`<div class="note bad">Scheduling conflict: ${a.id} (${esc(a.patient)}, ${a.date}) no longer fits ${d ? esc(d.name) + "'s schedule" : 'any doctor'}. Reschedule or cancel it.</div>`);
  });
  rows.forEach(({ d, s }) => { if (s.pct >= 100) notes.push(`<div class="note warn">${esc(d.name)} is fully booked today.</div>`); else if (s.pct >= hi) notes.push(`<div class="note warn">${esc(d.name)} is heavily booked today (${s.pct}%).</div>`); });
  $('#notes').innerHTML = notes.join('') || '<div class="note">No scheduling conflicts or heavily booked doctors right now.</div>';
}

/* ---------- Doctors ---------- */
function rDocs() {
  $('#docTable').innerHTML = S.doctors.length ? `<table><thead><tr><th>ID</th><th>Name</th><th>Specialization</th><th>Days</th><th>Hours</th><th>Slot</th><th>Capacity</th><th>Status</th><th>Actions</th></tr></thead><tbody>` +
    S.doctors.map(d => `<tr><td>${d.id}</td><td>${esc(d.name)}</td><td>${esc(d.spec)}</td><td>${d.days.map(x => DAYS[x]).join(', ')}</td><td>${t12(d.start)} – ${t12(d.end)}</td><td>${d.dur} min</td><td>${cap(d)}/day</td>
      <td><select data-st="${d.id}" aria-label="Availability">${STATUSES.map(s => `<option ${s === d.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
      <td><button class="btn sm ghost" data-act="viewDoc" data-id="${d.id}">View</button><button class="btn sm ghost" data-act="editDoc" data-id="${d.id}">Edit</button><button class="btn sm danger" data-act="delDoc" data-id="${d.id}">Delete</button></td></tr>`).join('') + '</tbody></table>'
    : empty('No doctors yet. Click “Add doctor” to register one.');
}
function docForm(id) {
  const d = docById(id) || { name: '', spec: '', days: [1, 2, 3, 4, 5], start: '09:00', end: '13:00', dur: 30, cap: 8, status: 'Available' };
  openModal(`<h3>${id ? 'Edit' : 'Add'} doctor</h3><form id="docForm" novalidate data-id="${id || ''}">
    <label>Name<input name="name" value="${esc(d.name)}"></label>
    <label>Specialization<input name="spec" list="specs" value="${esc(d.spec)}"><datalist id="specs">${[...new Set(S.doctors.map(x => x.spec))].map(s => `<option value="${esc(s)}">`).join('')}</datalist></label>
    <fieldset><legend>Working days</legend>${DAYS.map((n, i) => `<label class="chk"><input type="checkbox" name="days" value="${i}" ${d.days.includes(i) ? 'checked' : ''}>${n}</label>`).join('')}</fieldset>
    <div class="row3"><label>Start<input type="time" name="start" value="${d.start}"></label><label>End<input type="time" name="end" value="${d.end}"></label><label>Slot (minutes)<input type="number" name="dur" min="10" max="120" value="${d.dur}"></label></div>
    <div class="row3"><label>Daily capacity<input type="number" name="cap" min="1" max="60" value="${d.cap}"></label><label>Availability<select name="status">${STATUSES.map(s => `<option ${s === d.status ? 'selected' : ''}>${s}</option>`).join('')}</select></label></div>
    <p class="err" id="docErr"></p><div class="actions"><button class="btn">Save doctor</button><button type="button" class="btn ghost" data-act="closeModal">Cancel</button></div></form>`);
}
function saveDoc(form) {
  const f = new FormData(form), id = form.dataset.id;
  const d = { name: f.get('name').trim(), spec: f.get('spec').trim(), days: f.getAll('days').map(Number), start: f.get('start'), end: f.get('end'), dur: +f.get('dur'), cap: +f.get('cap'), status: f.get('status') };
  const err = d.name.length < 3 ? 'Enter the doctor’s name.' : !d.spec ? 'Enter a specialization.' : !d.days.length ? 'Choose at least one working day.'
    : !d.start || !d.end || mins(d.end) <= mins(d.start) ? 'End time must be after start time.' : !(d.dur >= 10 && d.dur <= 120) ? 'Slot length must be 10–120 minutes.'
    : !(d.cap >= 1) ? 'Capacity must be at least 1.' : !slotsOf(d).length ? 'Working hours are too short for one slot.' : '';
  if (err) { $('#docErr').textContent = err; return; }
  if (id) { Object.assign(docById(id), d); toast('Doctor updated.'); } else { d.id = nextId('D', S.doctors, 2); S.doctors.push(d); toast('Doctor added.'); }
  closeModal(); commit();
}
function viewDoc(id) {
  const d = docById(id), t = todayISO(), up = S.appts.filter(a => a.docId === id && a.date >= t && active(a)).length;
  openModal(`<h3>${esc(d.name)}</h3><div class="kv"><span>ID</span><div>${d.id}</div><span>Specialization</span><div>${esc(d.spec)}</div><span>Working days</span><div>${d.days.map(x => DAYS[x]).join(', ')}</div>
    <span>Hours</span><div>${t12(d.start)} – ${t12(d.end)}</div><span>Appointment length</span><div>${d.dur} minutes (${slotsOf(d).length} slots/day)</div><span>Daily capacity</span><div>${cap(d)}</div>
    <span>Availability</span><div>${d.status}</div><span>Upcoming appointments</span><div>${up}</div></div><button class="btn" data-act="closeModal">Close</button>`);
}

/* ---------- Appointments ---------- */
function rAppts() {
  const keep = $('#fDoc').value, sk = $('#sDoc').value;
  $('#fDoc').innerHTML = docOptions(keep || (S.doctors[0] || {}).id);
  $('#sDoc').innerHTML = docOptions(sk, 'All doctors');
  if (!$('#fDate').value) $('#fDate').value = todayISO();
  $('#fDate').min = todayISO();
  refreshSlots($('#fTime').value); rApptTable();
}
function refreshSlots(keep) {
  const d = docById($('#fDoc').value), date = $('#fDate').value;
  const free = d && date ? freeSlots(d, date, editApptId) : [];
  $('#fTime').innerHTML = free.length ? '<option value="">Select a slot</option>' + free.map(t => `<option value="${t}">${t12(t)}</option>`).join('') : '<option value="">No available slots</option>';
  if (keep && free.includes(keep)) $('#fTime').value = keep;
  if (!d || !date) { $('#slotGrid').innerHTML = empty('Choose a doctor and date.'); return; }
  if (!works(d, date)) { $('#slotGrid').innerHTML = empty(d.status !== 'Available' ? `${esc(d.name)} is ${d.status.toLowerCase()}.` : `${esc(d.name)} does not work on ${DAYS[parse(date).getDay()]}.`); return; }
  const full = count(d, date, editApptId) >= cap(d);
  $('#slotGrid').innerHTML = (full ? '<p class="err">Daily capacity reached: no more bookings for this date.</p>' : '') + `<div class="chips">` +
    slotsOf(d).map(t => taken(d.id, date, t, editApptId) || full ? `<span class="chip booked">${t12(t)}</span>` : `<button type="button" class="chip open" data-act="pick" data-time="${t}">${t12(t)}</button>`).join('') + '</div><p class="muted">Green = open, crossed out = booked. Capacity: ' + `${count(d, date, editApptId)}/${cap(d)} used.</p>`;
}
function resetForm() {
  editApptId = null; ['#fName', '#fPhone'].forEach(s => $(s).value = ''); $('#fDate').value = todayISO(); $('#fStatus').value = 'Confirmed';
  $('#formTitle').textContent = 'Book appointment'; $('#fSubmit').textContent = 'Book appointment'; $('#fErr').textContent = ''; $('#alts').innerHTML = '';
  refreshSlots();
}
function submitAppt() {
  const patient = $('#fName').value.trim(), phone = $('#fPhone').value.trim(), d = docById($('#fDoc').value), date = $('#fDate').value, time = $('#fTime').value, status = $('#fStatus').value, ex = editApptId;
  const checks = [
    [() => patient.length < 2, 'Enter the patient’s name.'],
    [() => !/^[0-9+\-\s]{7,16}$/.test(phone), 'Enter a valid fictional contact number (7–16 digits).'],
    [() => !d, 'Select a doctor.'], [() => !date, 'Select a date.'],
    [() => date < todayISO(), 'Appointments cannot be booked in the past.'],
    [() => d.status !== 'Available', `${d.name} is currently ${d.status.toLowerCase()}.`, 1],
    [() => !d.days.includes(parse(date).getDay()), `${d.name} does not work on ${DAYS[parse(date).getDay()]}.`, 1],
    [() => !time, 'Select an available time slot.', 1],
    [() => !slotsOf(d).includes(time), 'That time is outside the doctor’s working hours.', 1],
    [() => taken(d.id, date, time, ex), 'That slot is already booked for this doctor.', 1],
    [() => count(d, date, ex) >= cap(d), 'The doctor’s daily capacity is full for that date.', 1]
  ];
  const bad = checks.find(c => c[0]());
  $('#fErr').textContent = bad ? bad[1] : '';
  if (bad) { $('#alts').innerHTML = bad[2] ? altHTML(d, date, time, ex) : ''; toast(bad[1], 'err'); return; }
  if (ex) { Object.assign(S.appts.find(a => a.id === ex), { patient, phone, docId: d.id, date, time, status }); toast('Appointment rescheduled.'); }
  else { S.appts.push({ id: nextId('APT-', S.appts, 3), patient, phone, docId: d.id, date, time, status }); toast(`Appointment booked with ${d.name} on ${date} at ${t12(time)}.`); }
  resetForm(); commit();
}
function rApptTable() {
  const q = $('#sQ').value.trim().toLowerCase(), st = $('#sSt').value, dc = $('#sDoc').value, dt = $('#sDate').value, t = todayISO();
  const rows = S.appts.filter(a => { const d = docById(a.docId); return (!st || a.status === st) && (!dc || a.docId === dc) && (!dt || a.date === dt) && (!q || [a.id, a.patient, a.phone, d ? d.name : '', d ? d.spec : ''].join(' ').toLowerCase().includes(q)); })
    .sort((a, b) => ((a.date < t) - (b.date < t)) || (a.date + a.time).localeCompare(b.date + b.time));
  $('#apptTable').innerHTML = !S.appts.length ? empty('No appointments yet. Book the first one using the form above.') : !rows.length ? empty('No appointments match your search or filters.') :
    `<table><thead><tr><th>ID</th><th>Patient</th><th>Doctor</th><th>Date</th><th>Time</th><th>Status</th><th>Actions</th></tr></thead><tbody>` + rows.map(a => {
      const d = docById(a.docId), open = a.status === 'Confirmed' || a.status === 'Pending';
      return `<tr><td>${a.id}</td><td>${esc(a.patient)}<br><small>${esc(a.phone)}</small></td><td>${d ? esc(d.name) + '<br><small>' + esc(d.spec) + '</small>' : '<i>Doctor removed</i>'}</td><td>${a.date}</td><td>${t12(a.time)}</td><td><span class="tag ${a.status}">${a.status}</span></td>
        <td>${open ? `<button class="btn sm ghost" data-act="resched" data-id="${a.id}">Reschedule</button><button class="btn sm danger" data-act="cancelAppt" data-id="${a.id}">Cancel</button>` : ''}</td></tr>`;
    }).join('') + '</tbody></table>';
}

/* ---------- Availability ---------- */
function rAvail() {
  const sp0 = $('#avSpec').value; $('#avSpec').innerHTML = specOptions(sp0, 'All specializations');
  if (!$('#avDate').value) $('#avDate').value = todayISO();
  const date = $('#avDate').value, time = $('#avTime').value, sp = $('#avSpec').value;
  let list = S.doctors.filter(d => !sp || d.spec === sp);
  if (time) list = list.filter(d => freeSlots(d, date).some(t => mins(t) <= mins(time) && mins(time) < mins(t) + d.dur));
  $('#availList').innerHTML = (time ? `<p class="muted">${list.length} doctor(s) with an open slot covering ${t12(time)} on ${date}.</p>` : '') + (list.length ? list.map(d => {
    const s = stat(d, date), tag = !works(d, date) ? ['Not working', 'bad'] : s.free ? [`${s.free} open`, 'ok'] : ['Fully booked', 'warn'];
    return `<div class="dcard"><header><div><b>${esc(d.name)}</b> <small>${esc(d.spec)}</small><br><small>${d.days.map(x => DAYS[x]).join(', ')} · ${t12(d.start)} – ${t12(d.end)}</small></div><span class="tag ${tag[1]}">${tag[0]}</span></header>` +
      (works(d, date) ? `<div class="chips">${slotsOf(d).map(t => taken(d.id, date, t) || s.free === 0 ? `<span class="chip booked">${t12(t)}</span>` : `<button class="chip open" data-act="pick" data-doc="${d.id}" data-date="${date}" data-time="${t}">${t12(t)}</button>`).join('')}</div>` : `<small>${d.status !== 'Available' ? d.status : 'Not on duty this day'}.</small>`) + '</div>';
  }).join('') : empty('No doctors match. Try another date, time or specialization.'));
}

/* ---------- Analytics ---------- */
function rAn() {
  if (!$('#anDate').value) $('#anDate').value = todayISO();
  const date = $('#anDate').value, { hi, lo } = S.settings, rows = S.doctors.map(d => ({ d, s: stat(d, date) }));
  const flag = s => !s.w ? ['Not working', ''] : s.pct >= 100 ? ['Fully booked', 'bad'] : s.pct >= hi ? ['High demand', 'warn'] : s.pct <= lo ? ['Underused', 'warn'] : ['Balanced', 'ok'];
  const w = rows.filter(r => r.s.w), card = (ic, v, l) => `<div class="card"><span class="ic">${ic}</span><div><b>${v}</b><small>${l}</small></div></div>`;
  $('#anCards').innerHTML = card('⛔', w.filter(r => r.s.pct >= 100).length, 'Fully booked doctors') + card('🔥', w.filter(r => r.s.pct >= hi && r.s.pct < 100).length, 'High-demand doctors') +
    card('💤', w.filter(r => r.s.pct <= lo).reduce((a, r) => a + r.s.free, 0), 'Underused open slots') + card('📊', `${w.reduce((a, r) => a + r.s.b, 0)}/${w.reduce((a, r) => a + r.s.c, 0)}`, 'Booked / capacity');
  $('#anTable').innerHTML = S.doctors.length ? `<table><thead><tr><th>Doctor</th><th>Hours</th><th>Capacity</th><th>Booked</th><th>Remaining</th><th>Load</th><th>Flag</th></tr></thead><tbody>` + rows.map(({ d, s }) => { const f = flag(s);
    return `<tr><td>${esc(d.name)}<br><small>${esc(d.spec)}</small></td><td>${t12(d.start)} – ${t12(d.end)}</td><td>${s.c}</td><td>${s.b}</td><td>${s.free}</td><td>${s.w ? s.pct + '%' : '–'}</td><td><span class="tag ${f[1]}">${f[0]}</span></td></tr>`; }).join('') + '</tbody></table>' : empty('No doctors registered.');
  $('#anLoad').innerHTML = w.length ? hbars(w.map(r => ({ l: r.d.name.replace('Dr. ', ''), v: r.s.pct, max: 100, t: r.s.pct + '%', cls: r.s.pct >= hi ? 'hot' : r.s.pct <= lo ? 'low' : '' }))) : empty('No doctors working on this date.');
  $('#anTotal').innerHTML = hbars(S.doctors.map(d => ({ l: d.name.replace('Dr. ', ''), v: S.appts.filter(a => a.docId === d.id && active(a)).length })));
}

/* ---------- AI Recommendations (demonstration only) ---------- */
function rAI() {
  const f = forecast(), t = todayISO(), { hi } = S.settings, busiest = f.reduce((a, b) => b.est > a.est ? b : a);
  const per = { 'Morning (before 12:00)': 0, 'Afternoon (12:00–16:00)': 0, 'Evening (16:00 onwards)': 0 };
  S.appts.filter(a => a.date >= t && active(a)).forEach(a => { const h = mins(a.time); per[h < 720 ? 'Morning (before 12:00)' : h < 960 ? 'Afternoon (12:00–16:00)' : 'Evening (16:00 onwards)']++; });
  const week = S.doctors.map(d => { let b = 0, c = 0; for (let i = 0; i < 7; i++) { const ds = iso(addDays(i)); if (works(d, ds)) { c += cap(d); b += count(d, ds); } } return { d, b, c, pct: c ? Math.round(b / c * 100) : 0 }; }).filter(x => x.c);
  const hot = week.filter(x => x.pct >= hi);
  $('#aiDyn').innerHTML = `<div class="grid2"><div class="panel"><h3>Demand estimate for the next 7 days</h3>${cols(f.map(o => ({ l: dayLabel(o.date), v: o.est, cls: o.label === 'Busier' ? 'hot' : '' })))}
    <p class="muted">Busiest expected day: <b>${dayLabel(busiest.date)}</b> (about ${busiest.est} appointments).</p></div>
    <div class="panel"><h3>Busier time periods (from current bookings)</h3>${hbars(Object.entries(per).map(([l, v]) => ({ l, v })))}</div></div>
    <div class="panel tablewrap"><table><thead><tr><th>Date</th><th>Expected appointments</th><th>Doctor capacity</th><th>Expected load</th><th>Outlook</th></tr></thead><tbody>${f.map(o => `<tr><td>${o.date} (${DAYS[o.wd]})</td><td>${o.est}</td><td>${o.cap}</td><td>${o.cap ? Math.round(o.est / o.cap * 100) + '%' : 'No doctors on duty'}</td><td><span class="tag ${o.label === 'Busier' ? 'warn' : ''}">${o.label}</span></td></tr>`).join('')}</tbody></table></div>
    <div class="panel"><h3>Doctors with high demand this week (≥ ${hi}% of 7-day capacity booked)</h3>${hot.length ? hot.map(x => `<div class="note warn"><b>${esc(x.d.name)}</b> (${esc(x.d.spec)}): ${x.b}/${x.c} slots booked (${x.pct}%). Consider directing new patients to other ${esc(x.d.spec)} doctors or later days.</div>`).join('') : '<div class="note">No doctor is above the high-demand threshold this week.</div>'}</div>`;
  $('#rDoc').innerHTML = docOptions($('#rDoc').value || (S.doctors[0] || {}).id);
  if (!$('#rDate').value) $('#rDate').value = t;
}
function recommend() {
  const d = docById($('#rDoc').value), date = $('#rDate').value, time = $('#rTime').value, out = $('#rOut');
  if (!d || !date || !time) { out.innerHTML = '<p class="err">Choose a doctor, date and time first.</p>'; return; }
  const ok = works(d, date) && slotsOf(d).includes(time) && !taken(d.id, date, time) && count(d, date) < cap(d);
  out.innerHTML = ok ? `<div class="note">✔ ${t12(time)} on ${date} is open with ${esc(d.name)}. Book it from Patient Appointments.</div>` :
    `<div class="note warn">${esc(d.name)} cannot take ${t12(time)} on ${date} (unavailable, outside working hours, or full). Demonstration suggestions, same specialization (${esc(d.spec)}) only:</div>` + altHTML(d, date, time);
}

/* ---------- Settings ---------- */
function rSet() { $('#thHi').value = S.settings.hi; $('#thLo').value = S.settings.lo; }

/* ---------- events ---------- */
const actions = {
  addDoc: () => docForm(), editDoc: id => docForm(id), viewDoc, closeModal,
  delDoc: id => { const d = docById(id); if (confirm(`Delete ${d.name} and all of their appointments?`)) { S.doctors = S.doctors.filter(x => x.id !== id); S.appts = S.appts.filter(a => a.docId !== id); toast('Doctor deleted.'); commit(); } },
  cancelAppt: id => { if (!confirm('Cancel this appointment? The slot becomes available again.')) return; S.appts.find(a => a.id === id).status = 'Cancelled'; if (editApptId === id) resetForm(); toast('Appointment cancelled.'); commit(); },
  resched: id => {
    const a = S.appts.find(x => x.id === id); editApptId = id; if (page !== 'appointments') go('appointments');
    $('#fName').value = a.patient; $('#fPhone').value = a.phone; $('#fDoc').value = a.docId; $('#fDate').value = a.date; $('#fStatus').value = a.status;
    $('#formTitle').textContent = 'Reschedule ' + id; $('#fSubmit').textContent = 'Save new time'; $('#fErr').textContent = ''; $('#alts').innerHTML = '';
    refreshSlots(a.time); $('#fTime').value = a.time; $('#apptForm').scrollIntoView({ behavior: 'smooth' });
  },
  pick: (id, b) => {
    const { doc, date, time } = b.dataset;
    if (page !== 'appointments') go('appointments');
    if (doc) $('#fDoc').value = doc; if (date) $('#fDate').value = date;
    refreshSlots(time); $('#fTime').value = time; $('#fErr').textContent = ''; $('#apptForm').scrollIntoView({ behavior: 'smooth' });
  }
};
document.addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (b) actions[b.dataset.act](b.dataset.id, b); });
document.addEventListener('submit', e => { e.preventDefault(); if (e.target.id === 'docForm') saveDoc(e.target); if (e.target.id === 'apptForm') submitAppt(); });
document.addEventListener('change', e => { const id = e.target.dataset.st; if (id) { docById(id).status = e.target.value; toast(`${docById(id).name} is now ${e.target.value.toLowerCase()}.`); commit(); } });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

function init() {
  load();
  $('#nav').innerHTML = PAGES.map(p => `<button data-page="${p[0]}">${p[1]} ${p[2]}</button>`).join('');
  $('#nav').addEventListener('click', e => { const b = e.target.closest('button'); if (b) go(b.dataset.page); });
  $('#menuBtn').onclick = () => $('#sidebar').classList.toggle('open');
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
  $('#fDoc').onchange = $('#fDate').onchange = () => { $('#alts').innerHTML = ''; refreshSlots(); };
  $('#fReset').onclick = resetForm;
  ['sQ', 'sSt', 'sDoc', 'sDate'].forEach(id => $('#' + id).addEventListener('input', rApptTable));
  ['avDate', 'avTime', 'avSpec'].forEach(id => $('#' + id).addEventListener('input', rAvail));
  $('#anDate').addEventListener('input', rAn); $('#rBtn').onclick = recommend;
  $('#thSave').onclick = () => { const hi = +$('#thHi').value, lo = +$('#thLo').value; if (!(hi >= 10 && hi <= 100 && lo >= 0 && lo < hi)) return toast('Use a high-demand value of 10–100 that is above the underused value.', 'err'); S.settings = { hi, lo }; toast('Thresholds saved.'); commit(); };
  $('#exportBtn').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' })); a.download = 'medischedule-demo-data.json'; a.click(); toast('Data downloaded.'); };
  $('#clearBtn').onclick = () => { if (confirm('Delete ALL appointments?')) { S.appts = []; toast('All appointments deleted.'); commit(); } };
  $('#resetBtn').onclick = () => { if (confirm('Reset all data to the original demonstration data?')) { S = seed(); resetForm(); toast('Demonstration data restored.'); commit(); } };
  const h = location.hash.slice(1); go(PAGES.some(p => p[0] === h) ? h : 'dashboard');
}
init();
