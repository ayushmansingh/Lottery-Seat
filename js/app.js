/* ============================================================
   Seat Lottery — application logic
   Phases: idle → drawing → picking → idle … until done.
   ============================================================ */
(() => {
  'use strict';

  const STORAGE_KEY = 'seatLottery.v1';

  /* ── State ──────────────────────────────────────────────── */
  let state = {
    participants: [],                  // all names in the lottery
    assignments: [],                   // [{ name, seat, ts }] in draw order
    soundOn: true,
  };
  let phase = 'idle';                  // idle | drawing | picking
  let currentWinner = null;
  let zoom = null;                     // null = fit to viewport

  const lotterySeats = SEATS.filter(s => s.cat === LOTTERY_CAT).map(s => s.id);

  /* ── Element refs ───────────────────────────────────────── */
  const $ = id => document.getElementById(id);
  const el = {
    grid: $('map-grid'), scale: $('map-scale'), viewport: $('map-viewport'),
    legend: $('legend'),
    statPeople: $('stat-people'), statSeats: $('stat-seats'), statDone: $('stat-done'),
    drawBtn: $('draw-btn'), allDone: $('all-done'), resultsList: $('results-list'),
    hatList: $('hat-list'), hatCount: $('hat-count'),
    addNameInput: $('add-name-input'), addNameBtn: $('add-name-btn'),
    undoBtn: $('undo-btn'), exportBtn: $('export-btn'), editBtn: $('edit-btn'),
    soundBtn: $('sound-btn'), resetBtn: $('reset-btn'),
    pickBanner: $('pick-banner'), pickName: $('pick-name'),
    randomSeatBtn: $('random-seat-btn'), cancelPickBtn: $('cancel-pick-btn'),
    overlay: $('overlay'), stage: $('draw-stage'), stageLabel: $('stage-label'),
    nameDisplay: $('name-display'), nameRole: $('name-role'), continueBtn: $('continue-btn'),
    modalBackdrop: $('modal-backdrop'), participantsInput: $('participants-input'),
    countNote: $('count-note'), saveParticipantsBtn: $('save-participants-btn'),
    toast: $('toast'),
    zoomIn: $('zoom-in'), zoomOut: $('zoom-out'), zoomFit: $('zoom-fit'),
  };

  /* ── Persistence ────────────────────────────────────────── */
  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) state = Object.assign(state, JSON.parse(raw));
    } catch (e) { /* corrupted storage — start fresh */ }
  }

  /* ── Helpers ────────────────────────────────────────────── */
  const assignedNames = () => new Set(state.assignments.map(a => a.name));
  const assignedSeats = () => new Set(state.assignments.map(a => a.seat));
  const remainingPeople = () => state.participants.filter(n => !assignedNames().has(n));
  const freeSeats = () => lotterySeats.filter(s => !assignedSeats().has(s));

  function randInt(n) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] % n;
  }

  const AVATAR_COLORS = ['#7c5cff', '#e8590c', '#0ca678', '#d6336c', '#1971c2', '#9c36b5', '#5c940d', '#e8a10c'];
  function avatarColor(name) {
    let h = 0;
    for (const ch of name) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    return AVATAR_COLORS[h % AVATAR_COLORS.length];
  }
  function initials(name) {
    return name.trim().split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join('');
  }
  function roleOf(name) {
    return (typeof DESIGNATIONS !== 'undefined' && DESIGNATIONS[name]) || '';
  }

  let toastTimer = null;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('visible'), 2600);
  }

  /* ── Sound (WebAudio, no assets) ────────────────────────── */
  let audioCtx = null;
  function beep(freq, dur, type = 'square', gainVal = 0.04) {
    if (!state.soundOn) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(gainVal, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + dur);
    } catch (e) { /* audio unavailable */ }
  }
  const tickSound = () => beep(900 + Math.random() * 200, 0.05);
  function fanfare() {
    [523, 659, 784, 1047].forEach((f, i) =>
      setTimeout(() => beep(f, 0.35, 'triangle', 0.07), i * 110));
  }

  /* ── Map rendering ──────────────────────────────────────── */
  function buildMap() {
    el.grid.innerHTML = '';
    for (const b of BLOCKS) {
      const d = document.createElement('div');
      d.className = 'block ' + b.cls;
      d.textContent = b.label;
      d.style.gridColumn = `${b.c1} / ${b.c2 + 1}`;
      d.style.gridRow = `${b.r1} / ${b.r2 + 1}`;
      el.grid.appendChild(d);
    }
    for (const s of SEATS) {
      const d = document.createElement('div');
      d.className = `seat cat-${s.cat}` + (s.cat === LOTTERY_CAT ? '' : ' dim');
      d.dataset.id = s.id;
      d.textContent = s.id;
      d.style.gridColumn = s.c;
      d.style.gridRow = s.r;
      d.title = `${s.id} · ${CATEGORIES[s.cat].label}`;
      if (s.cat === LOTTERY_CAT) {
        d.addEventListener('click', () => onSeatClick(s.id));
      }
      el.grid.appendChild(d);
    }
  }

  function buildLegend() {
    const swatchClass = { /* reuse seat colors via a hidden seat element class */ };
    el.legend.innerHTML = '';
    for (const [key, cat] of Object.entries(CATEGORIES)) {
      const span = document.createElement('span');
      span.className = 'key';
      const sw = document.createElement('span');
      sw.className = `swatch seat cat-${key}`;
      span.appendChild(sw);
      span.appendChild(document.createTextNode(cat.label + (key === LOTTERY_CAT ? ' 🎰' : '')));
      el.legend.appendChild(span);
    }
  }

  function renderSeats() {
    const bySeat = new Map(state.assignments.map(a => [a.seat, a.name]));
    for (const node of el.grid.querySelectorAll('.seat')) {
      const id = node.dataset.id;
      if (!lotterySeats.includes(id)) continue;
      const owner = bySeat.get(id);
      node.classList.toggle('assigned', !!owner);
      node.classList.toggle('pickable', phase === 'picking' && !owner);
      if (owner) {
        node.innerHTML = `${id}<span class="occupant">${escapeHtml(owner)}</span>`;
        node.title = `${id} · ${owner}` + (roleOf(owner) ? ` · ${roleOf(owner)}` : '');
      } else {
        node.textContent = id;
        node.title = `${id} · ${CATEGORIES[LOTTERY_CAT].label}`;
      }
    }
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  /* ── Sidebar rendering ──────────────────────────────────── */
  function renderSidebar() {
    const people = remainingPeople().length;
    const seats = freeSeats().length;
    el.statPeople.textContent = people;
    el.statSeats.textContent = seats;
    el.statDone.textContent = state.assignments.length;

    const canDraw = phase === 'idle' && people > 0 && seats > 0;
    el.drawBtn.disabled = !canDraw;
    const done = state.participants.length > 0 && (people === 0 || seats === 0);
    el.allDone.classList.toggle('visible', done && phase === 'idle');
    el.allDone.textContent = people === 0
      ? '🏁 Lottery complete — everyone has a seat!'
      : '🪑 All Online Product seats are taken!';

    el.undoBtn.disabled = state.assignments.length === 0 || phase !== 'idle';
    el.exportBtn.disabled = state.assignments.length === 0;

    if (state.assignments.length === 0) {
      el.resultsList.innerHTML =
        '<div class="results-empty">No draws yet.<br />Hit the big yellow button to start!</div>';
    } else {
      el.resultsList.innerHTML = '';
      state.assignments.forEach((a, i) => {
        const row = document.createElement('div');
        row.className = 'result-row';
        const sub = roleOf(a.name) || new Date(a.ts).toLocaleTimeString();
        row.title = `${a.name} → ${a.seat} · ${new Date(a.ts).toLocaleTimeString()}`;
        row.innerHTML =
          `<span class="order">#${i + 1}</span>` +
          `<span class="avatar" style="background:${avatarColor(a.name)}">${escapeHtml(initials(a.name))}</span>` +
          `<span class="who"><b>${escapeHtml(a.name)}</b><span>${escapeHtml(sub)}</span></span>` +
          `<span class="seat-tag">${a.seat}</span>`;
        el.resultsList.appendChild(row);
      });
      el.resultsList.scrollTop = el.resultsList.scrollHeight;
    }

    el.soundBtn.textContent = state.soundOn ? '🔊 Sound on' : '🔇 Sound off';
    renderHat();
  }

  /* ── "In the hat" chips ─────────────────────────────────── */
  function renderHat() {
    const remaining = remainingPeople();
    const locked = phase !== 'idle';
    el.hatCount.textContent = `(${remaining.length})`;
    el.hatList.innerHTML = '';
    if (remaining.length === 0) {
      el.hatList.innerHTML = '<span class="hat-empty">Nobody left in the hat.</span>';
    }
    for (const name of remaining) {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.title = roleOf(name) || name;
      chip.innerHTML =
        `<span class="dot" style="background:${avatarColor(name)}"></span>${escapeHtml(name)}`;
      const x = document.createElement('button');
      x.textContent = '×';
      x.title = `Remove ${name} from the lottery`;
      x.disabled = locked;
      x.addEventListener('click', () => removeName(name));
      chip.appendChild(x);
      el.hatList.appendChild(chip);
    }
    el.addNameInput.disabled = locked;
    el.addNameBtn.disabled = locked;
  }

  function removeName(name) {
    if (phase !== 'idle') return;
    state.participants = state.participants.filter(n => n !== name);
    save();
    renderAll();
    toast(`${name} removed from the lottery.`);
  }

  function addName() {
    const name = el.addNameInput.value.trim();
    if (!name) return;
    if (state.participants.some(n => n.toLowerCase() === name.toLowerCase())) {
      toast(`${name} is already in the lottery.`);
      return;
    }
    state.participants.push(name);
    save();
    el.addNameInput.value = '';
    renderAll();
    toast(`${name} joins the lottery! 🍀`);
  }

  function renderAll() {
    renderSeats();
    renderSidebar();
  }

  /* ── Draw flow ──────────────────────────────────────────── */
  function startDraw() {
    const pool = remainingPeople();
    if (phase !== 'idle' || pool.length === 0 || freeSeats().length === 0) return;
    phase = 'drawing';
    renderAll();

    currentWinner = pool[randInt(pool.length)];
    el.stage.classList.remove('winner');
    el.stageLabel.textContent = 'Drawing…';
    el.overlay.classList.add('visible');

    // Slot-machine shuffle: fast at first, decelerating to the winner.
    const steps = Math.min(26, 10 + pool.length * 2);
    let step = 0;
    const spin = () => {
      step++;
      if (step < steps) {
        let name = pool[randInt(pool.length)];
        if (pool.length > 1 && step === steps - 1 && name === currentWinner) {
          name = pool[(pool.indexOf(name) + 1) % pool.length];
        }
        el.nameDisplay.textContent = name;
        el.nameRole.textContent = roleOf(name) || ' ';
        tickSound();
        const t = step / steps;
        setTimeout(spin, 50 + 330 * t * t);
      } else {
        el.nameDisplay.textContent = currentWinner;
        el.nameRole.textContent = roleOf(currentWinner) || ' ';
        el.stageLabel.textContent = '🎉 Winner';
        el.stage.classList.add('winner');
        fanfare();
        Confetti.burst();
      }
    };
    spin();
  }

  function startPicking() {
    el.overlay.classList.remove('visible');
    phase = 'picking';
    el.pickName.textContent = currentWinner;
    el.pickBanner.classList.add('visible');
    renderAll();
  }

  function onSeatClick(seatId) {
    if (phase !== 'picking' || assignedSeats().has(seatId)) return;
    assignSeat(seatId);
  }

  function assignSeat(seatId) {
    state.assignments.push({ name: currentWinner, seat: seatId, ts: Date.now() });
    save();
    endPicking();
    renderAll();

    const node = el.grid.querySelector(`.seat[data-id="${CSS.escape(seatId)}"]`);
    if (node) {
      node.classList.add('just-assigned');
      setTimeout(() => node.classList.remove('just-assigned'), 700);
      const r = node.getBoundingClientRect();
      Confetti.burstAt(r.left + r.width / 2, r.top + r.height / 2);
    }
    fanfare();
    toast(`${state.assignments[state.assignments.length - 1].name} → ${seatId} 🎉`);
  }

  function endPicking() {
    phase = 'idle';
    currentWinner = null;
    el.pickBanner.classList.remove('visible');
  }

  function cancelPick() {
    const name = currentWinner;
    endPicking();
    renderAll();
    toast(`${name} goes back into the hat.`);
  }

  /* ── Actions ────────────────────────────────────────────── */
  function undoLast() {
    if (phase !== 'idle' || state.assignments.length === 0) return;
    const last = state.assignments.pop();
    save();
    renderAll();
    toast(`Undid ${last.name} → ${last.seat}.`);
  }

  function resetAll() {
    if (!confirm('Reset the whole lottery? All seat assignments will be cleared.')) return;
    if (phase === 'picking') endPicking();
    state.assignments = [];
    save();
    renderAll();
    toast('Lottery reset. Good luck, everyone!');
  }

  function exportCsv() {
    const lines = ['Order,Name,Seat,Time'];
    state.assignments.forEach((a, i) => {
      const safe = '"' + a.name.replace(/"/g, '""') + '"';
      lines.push(`${i + 1},${safe},${a.seat},${new Date(a.ts).toLocaleString()}`);
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'seat-lottery-results.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ── Participants modal ─────────────────────────────────── */
  function openModal() {
    el.participantsInput.value = state.participants.join('\n');
    updateCountNote();
    el.modalBackdrop.classList.add('visible');
    el.participantsInput.focus();
  }

  function updateCountNote() {
    const names = parseNames(el.participantsInput.value);
    el.countNote.textContent =
      `${names.length} name${names.length === 1 ? '' : 's'} · ${lotterySeats.length} lottery seats`;
  }

  function parseNames(text) {
    const seen = new Set();
    return text.split('\n')
      .map(n => n.trim())
      .filter(n => n && !seen.has(n.toLowerCase()) && seen.add(n.toLowerCase()));
  }

  function saveParticipants() {
    const names = parseNames(el.participantsInput.value);
    if (names.length === 0) {
      toast('Add at least one name to run the lottery.');
      return;
    }
    // Names that already won a seat stay in the list so their seat survives edits.
    for (const a of state.assignments) {
      if (!names.some(n => n.toLowerCase() === a.name.toLowerCase())) names.push(a.name);
    }
    state.participants = names;
    save();
    el.modalBackdrop.classList.remove('visible');
    renderAll();
    toast(`Participant list saved (${names.length} names).`);
  }

  /* ── Zoom / fit ─────────────────────────────────────────── */
  function applyScale() {
    const natural = el.grid.offsetWidth;
    const fit = Math.min(1, (el.viewport.clientWidth - 44) / natural);
    const s = zoom === null ? fit : zoom;
    el.scale.style.transform = `scale(${s})`;
    el.scale.style.width = natural * s + 'px';
    el.scale.style.height = el.grid.offsetHeight * s + 'px';
  }

  /* ── Wire-up ────────────────────────────────────────────── */
  el.drawBtn.addEventListener('click', startDraw);
  el.continueBtn.addEventListener('click', startPicking);
  el.randomSeatBtn.addEventListener('click', () => {
    const free = freeSeats();
    if (phase === 'picking' && free.length) assignSeat(free[randInt(free.length)]);
  });
  el.cancelPickBtn.addEventListener('click', cancelPick);
  el.undoBtn.addEventListener('click', undoLast);
  el.resetBtn.addEventListener('click', resetAll);
  el.exportBtn.addEventListener('click', exportCsv);
  el.editBtn.addEventListener('click', openModal);
  el.addNameBtn.addEventListener('click', addName);
  el.addNameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') addName();
  });
  el.saveParticipantsBtn.addEventListener('click', saveParticipants);
  el.participantsInput.addEventListener('input', updateCountNote);
  el.modalBackdrop.addEventListener('click', e => {
    if (e.target === el.modalBackdrop && state.participants.length) {
      el.modalBackdrop.classList.remove('visible');
    }
  });
  el.soundBtn.addEventListener('click', () => {
    state.soundOn = !state.soundOn;
    save();
    renderSidebar();
  });
  el.zoomIn.addEventListener('click', () => { zoom = Math.min(1.6, (zoom ?? currentScale()) + 0.1); applyScale(); });
  el.zoomOut.addEventListener('click', () => { zoom = Math.max(0.3, (zoom ?? currentScale()) - 0.1); applyScale(); });
  el.zoomFit.addEventListener('click', () => { zoom = null; applyScale(); });
  window.addEventListener('resize', applyScale);

  function currentScale() {
    const m = /scale\(([\d.]+)\)/.exec(el.scale.style.transform);
    return m ? parseFloat(m[1]) : 1;
  }

  document.addEventListener('keydown', e => {
    if (e.key === ' ' && phase === 'idle' && document.activeElement === document.body) {
      e.preventDefault();
      startDraw();
    }
    if (e.key === 'Enter' && phase === 'drawing' && el.stage.classList.contains('winner')) {
      startPicking();
    }
    if (e.key === 'Escape' && phase === 'picking') cancelPick();
  });

  /* ── Init ───────────────────────────────────────────────── */
  load();
  buildMap();
  buildLegend();
  renderAll();
  applyScale();
  if (state.participants.length === 0) {
    openModal();
    el.participantsInput.value = DEFAULT_PARTICIPANTS.join('\n');
    updateCountNote();
  }
})();
