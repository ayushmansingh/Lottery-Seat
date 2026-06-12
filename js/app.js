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
    photos: {},                        // name -> uploaded photo (data URL)
    soundOn: true,
  };
  let phase = 'idle';                  // idle | drawing | picking | walking
  let currentWinner = null;
  let pendingSeat = null;              // assigned but character still walking
  let photoTargetName = null;          // who gets the next uploaded photo
  let zoom = null;                     // null = fit to viewport
  let cinematicReturn = null;          // saved zoom/scroll for restore after walk
  let cinematicBars = null;            // { top, bot } letterbox elements

  const lotterySeats = SEATS.filter(s => s.cat === LOTTERY_CAT).map(s => s.id);

  /* ── Corridor pathfinding ───────────────────────────────────
     Desks and rooms are obstacles; the gaps between them are
     walkable aisles. Must match the grid metrics in style.css. */
  const CELL_W = 62, CELL_H = 34, CELL_GAP = 7, GRID_PAD = 18;
  const SPAWN = { c: 22, r: 4 };       // aisle outside the meeting room

  const OBSTACLES = (() => {
    const blocked = new Set();
    for (const s of SEATS) blocked.add(s.c + ',' + s.r);
    for (const b of BLOCKS) {
      for (let c = b.c1; c <= b.c2; c++) {
        for (let r = b.r1; r <= b.r2; r++) blocked.add(c + ',' + r);
      }
    }
    return blocked;
  })();

  function cellCenter(c, r) {
    return {
      x: GRID_PAD + (c - 1) * (CELL_W + CELL_GAP) + CELL_W / 2,
      y: GRID_PAD + (r - 1) * (CELL_H + CELL_GAP) + CELL_H / 2,
    };
  }

  // BFS through free cells from SPAWN to a cell adjacent to the seat,
  // then one final step onto the seat itself.
  function findPath(goalC, goalR) {
    const key = (c, r) => c + ',' + r;
    const free = (c, r) =>
      c >= 1 && c <= GRID_COLS && r >= 1 && r <= GRID_ROWS && !OBSTACLES.has(key(c, r));
    const prev = new Map([[key(SPAWN.c, SPAWN.r), null]]);
    const queue = [[SPAWN.c, SPAWN.r]];
    let endKey = null;
    while (queue.length) {
      const [c, r] = queue.shift();
      if (Math.abs(c - goalC) + Math.abs(r - goalR) === 1) { endKey = key(c, r); break; }
      for (const [dc, dr] of [[-1, 0], [0, 1], [1, 0], [0, -1]]) {
        const nc = c + dc, nr = r + dr;
        if (free(nc, nr) && !prev.has(key(nc, nr))) {
          prev.set(key(nc, nr), key(c, r));
          queue.push([nc, nr]);
        }
      }
    }
    if (!endKey) return [[SPAWN.c, SPAWN.r], [goalC, goalR]];
    const cells = [];
    for (let k = endKey; k; k = prev.get(k)) cells.unshift(k.split(',').map(Number));
    cells.push([goalC, goalR]);
    // Drop intermediate points on straight runs so the walk is smooth.
    const out = [cells[0]];
    for (let i = 1; i < cells.length - 1; i++) {
      const a = out[out.length - 1], b = cells[i], c = cells[i + 1];
      if ((a[0] === b[0] && b[0] === c[0]) || (a[1] === b[1] && b[1] === c[1])) continue;
      out.push(b);
    }
    out.push(cells[cells.length - 1]);
    return out;
  }

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
    loadDefaultsBtn: $('load-defaults-btn'),
    stageAvatar: $('stage-avatar'), photoInput: $('photo-input'),
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

  /* ── Bubble faces ───────────────────────────────────────────
     Photo priority: uploaded in-app > avatars/<slug>.jpg|png in
     the repo > colored initials bubble.                        */
  const repoAvatars = new Map();       // name -> found src | null

  function slug(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function probeRepoAvatar(name) {
    if (repoAvatars.has(name) || state.photos[name]) return;
    repoAvatars.set(name, null);
    const exts = ['jpg', 'png', 'jpeg', 'webp'];
    const tryNext = i => {
      if (i >= exts.length) return;
      const img = new Image();
      const src = `avatars/${slug(name)}.${exts[i]}`;
      img.onload = () => { repoAvatars.set(name, src); renderAll(); };
      img.onerror = () => tryNext(i + 1);
      img.src = src;
    };
    tryNext(0);
  }

  function photoSrc(name) {
    return state.photos[name] || repoAvatars.get(name) || null;
  }

  function avatarEl(name, extraClass = '') {
    probeRepoAvatar(name);
    const span = document.createElement('span');
    span.className = ('avatar ' + extraClass).trim();
    const src = photoSrc(name);
    if (src) {
      span.classList.add('has-photo');
      span.style.backgroundImage = `url("${src}")`;
    } else {
      span.style.background = avatarColor(name);
      span.textContent = initials(name);
    }
    return span;
  }

  function setPhoto(name, file) {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = 96;
      const ctx = c.getContext('2d');
      const s = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 96, 96);
      state.photos[name] = c.toDataURL('image/jpeg', 0.82);
      URL.revokeObjectURL(img.src);
      save();
      renderAll();
      toast(`Photo set for ${name} 📸`);
    };
    img.onerror = () => toast("Couldn't read that image.");
    img.src = URL.createObjectURL(file);
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
    el.legend.innerHTML = '';
    const items = [
      [`seat cat-${LOTTERY_CAT}`, `${CATEGORIES[LOTTERY_CAT].label} — up for grabs 🎰`],
      ['seat assigned', 'Assigned'],
      ['seat dim', 'Other teams (hover a seat for details)'],
    ];
    for (const [cls, label] of items) {
      const span = document.createElement('span');
      span.className = 'key';
      const sw = document.createElement('span');
      sw.className = `swatch ${cls}`;
      span.appendChild(sw);
      span.appendChild(document.createTextNode(label));
      el.legend.appendChild(span);
    }
  }

  function renderSeats() {
    const bySeat = new Map(state.assignments.map(a => [a.seat, a.name]));
    for (const node of el.grid.querySelectorAll('.seat')) {
      const id = node.dataset.id;
      if (!lotterySeats.includes(id)) continue;
      // While the character walks, its seat still looks free.
      const owner = id === pendingSeat ? null : bySeat.get(id);
      node.classList.toggle('assigned', !!owner);
      node.classList.toggle('pickable', phase === 'picking' && !owner);
      if (owner) {
        const src = photoSrc(owner);
        const face = src ? `<span class="seat-face" style="background-image:url('${src}')"></span>` : '';
        node.innerHTML = `${face}${id}<span class="occupant">${escapeHtml(owner)}</span>`;
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
        const order = document.createElement('span');
        order.className = 'order';
        order.textContent = `#${i + 1}`;
        const who = document.createElement('span');
        who.className = 'who';
        who.innerHTML = `<b>${escapeHtml(a.name)}</b><span>${escapeHtml(sub)}</span>`;
        const tag = document.createElement('span');
        tag.className = 'seat-tag';
        tag.textContent = a.seat;
        row.append(order, avatarEl(a.name), who, tag);
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
      const face = avatarEl(name, 'chip-face');
      face.title = `Click to set ${name}'s photo`;
      face.addEventListener('click', () => {
        photoTargetName = name;
        el.photoInput.click();
      });
      chip.appendChild(face);
      chip.appendChild(document.createTextNode(name));
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
        el.stageAvatar.replaceChildren(avatarEl(name, 'stage-face'));
        tickSound();
        const t = step / steps;
        setTimeout(spin, 50 + 330 * t * t);
      } else {
        el.nameDisplay.textContent = currentWinner;
        el.nameRole.textContent = roleOf(currentWinner) || ' ';
        el.stageLabel.textContent = '🎉 Winner';
        el.stageAvatar.replaceChildren(avatarEl(currentWinner, 'stage-face'));
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

  function seatNode(seatId) {
    return el.grid.querySelector(`.seat[data-id="${CSS.escape(seatId)}"]`);
  }

  function assignSeat(seatId) {
    const name = currentWinner;
    // Commit immediately (a mid-walk refresh must not lose the result),
    // but keep the seat looking free until the character sits down.
    state.assignments.push({ name, seat: seatId, ts: Date.now() });
    save();
    currentWinner = null;
    pendingSeat = seatId;
    phase = 'walking';
    el.pickBanner.classList.remove('visible');
    renderAll();

    walkToSeat(name, seatId, () => {
      pendingSeat = null;
      phase = 'idle';
      renderAll();
      const node = seatNode(seatId);
      if (node) {
        node.classList.add('just-assigned');
        setTimeout(() => node.classList.remove('just-assigned'), 700);
        const r = node.getBoundingClientRect();
        Confetti.burstAt(r.left + r.width / 2, r.top + r.height / 2);
      }
      fanfare();
      toast(`${name} → ${seatId} 🎉`);
    });
  }

  /* Little bubble-faced character that enters by the meeting room,
     walks the aisles (never over desks), and sits down on the seat. */
  function walkToSeat(name, seatId, done) {
    const seat = SEATS.find(s => s.id === seatId);
    if (!seat) { done(); return; }

    const walker = document.createElement('div');
    walker.className = 'walker';
    const flip = document.createElement('div');
    flip.className = 'walker-flip';
    const inner = document.createElement('div');
    inner.className = 'walker-inner';
    inner.appendChild(avatarEl(name, 'walker-head'));
    const body = document.createElement('div');
    body.className = 'walker-body';
    const legs = document.createElement('div');
    legs.className = 'walker-legs';
    legs.innerHTML = '<span class="leg l"></span><span class="leg r"></span>';
    inner.append(body, legs);
    flip.appendChild(inner);
    walker.appendChild(flip);
    el.grid.appendChild(walker);     // inside the map, so it scales with zoom

    beginCinematic();

    // Step out of the meeting room, then follow the aisles.
    const points = [cellCenter(22.6, 3.4)];
    for (const [c, r] of findPath(seat.c, seat.r)) points.push(cellCenter(c, r));

    let total = 0;
    for (let i = 1; i < points.length; i++) {
      total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    }
    const duration = Math.min(4.5, Math.max(1.6, total / 300));   // seconds
    const speed = total / duration;
    const footsteps = setInterval(() => beep(110 + Math.random() * 50, 0.06, 'sine', 0.05), 170);

    const setPos = p => { walker.style.transform = `translate(${p.x - 28}px, ${p.y - 68}px)`; };
    setPos(points[0]);
    updateCamera(points[0], true);

    let seg = 0, t = 0, last = performance.now();
    function frame(now) {
      let move = speed * ((now - last) / 1000);
      last = now;
      while (move > 0 && seg < points.length - 1) {
        const a = points[seg], b = points[seg + 1];
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 0.001;
        const remain = (1 - t) * len;
        if (move < remain) { t += move / len; move = 0; } else { move -= remain; seg++; t = 0; }
      }
      if (seg >= points.length - 1) {
        const end = points[points.length - 1];
        setPos(end);
        updateCamera(end);
        clearInterval(footsteps);
        walker.classList.add('sitting');
        beep(290, 0.3, 'sine', 0.06);
        cameraBonk();
        setTimeout(() => {
          walker.remove();
          endCinematic();
          done();
        }, 540);
        return;
      }
      const a = points[seg], b = points[seg + 1];
      if (b.x < a.x) flip.classList.add('face-left');
      else if (b.x > a.x) flip.classList.remove('face-left');
      const cur = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      setPos(cur);
      updateCamera(cur);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
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

  /* ── Cinematic camera (used during walk-to-seat) ────────── */
  function beginCinematic() {
    cinematicReturn = {
      zoom,
      scrollLeft: el.viewport.scrollLeft,
      scrollTop: el.viewport.scrollTop,
    };
    const fit = (el.viewport.clientWidth - 44) / el.grid.offsetWidth;
    const cur = zoom === null ? Math.min(1, fit) : zoom;
    zoom = Math.max(cur, 1.4);
    applyScale();

    if (!cinematicBars) {
      const top = document.createElement('div');
      top.className = 'cinema-bar top';
      const bot = document.createElement('div');
      bot.className = 'cinema-bar bottom';
      document.body.append(top, bot);
      cinematicBars = { top, bot };
    }
    // Force reflow so the transition runs from the off-screen start state.
    void cinematicBars.top.offsetWidth;
    cinematicBars.top.classList.add('visible');
    cinematicBars.bot.classList.add('visible');
  }

  function updateCamera(p, snap) {
    if (!cinematicReturn) return;
    const s = currentScale();
    const tx = Math.max(0, p.x * s - el.viewport.clientWidth / 2 + 22);
    const ty = Math.max(0, p.y * s - el.viewport.clientHeight / 2 + 18);
    if (snap) {
      el.viewport.scrollLeft = tx;
      el.viewport.scrollTop = ty;
    } else {
      el.viewport.scrollLeft += (tx - el.viewport.scrollLeft) * 0.18;
      el.viewport.scrollTop  += (ty - el.viewport.scrollTop)  * 0.18;
    }
  }

  function cameraBonk() {
    if (!cinematicReturn) return;
    el.scale.classList.remove('cam-shake');
    void el.scale.offsetWidth;     // restart the keyframe animation
    el.scale.classList.add('cam-shake');
  }

  function endCinematic() {
    if (!cinematicReturn) return;
    const saved = cinematicReturn;
    cinematicReturn = null;
    zoom = saved.zoom;
    applyScale();
    el.viewport.scrollTo({ left: saved.scrollLeft, top: saved.scrollTop, behavior: 'smooth' });
    if (cinematicBars) {
      cinematicBars.top.classList.remove('visible');
      cinematicBars.bot.classList.remove('visible');
    }
    setTimeout(() => el.scale.classList.remove('cam-shake'), 700);
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
  el.photoInput.addEventListener('change', () => {
    const file = el.photoInput.files[0];
    if (file && photoTargetName) setPhoto(photoTargetName, file);
    el.photoInput.value = '';
    photoTargetName = null;
  });
  el.loadDefaultsBtn.addEventListener('click', () => {
    el.participantsInput.value = DEFAULT_PARTICIPANTS.join('\n');
    updateCountNote();
  });
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
