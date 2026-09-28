(function () {
  const stage = document.getElementById('sortStage');
  if (!stage) return;

  const canvas = document.getElementById('sortCanvas');
  const ctx = canvas.getContext('2d');
  const panel = document.getElementById('sortPanel');

  // --- the algorithms, as generators (same design as Algo-Sonic) ---
  // each one sorts `a` in place and yields what it's doing, one step at a time:
  //   ['compare', i, j]  looking at two bars
  //   ['swap', i, j]     swapped two bars
  //   ['set', i]         overwrote one bar (merge sort copies back from a buffer)
  // the loop below decides how fast to pull steps and what to draw/play for each
  function swap(a, i, j) { [a[i], a[j]] = [a[j], a[i]]; }

  function* bubble(a) {
    for (let i = 0; i < a.length; i++) {
      for (let j = 0; j < a.length - i - 1; j++) {
        yield ['compare', j, j + 1];
        if (a[j] > a[j + 1]) { swap(a, j, j + 1); yield ['swap', j, j + 1]; }
      }
    }
  }

  function* insertion(a) {
    for (let i = 1; i < a.length; i++) {
      for (let j = i; j > 0; j--) {
        yield ['compare', j - 1, j];
        if (a[j - 1] <= a[j]) break;
        swap(a, j - 1, j);
        yield ['swap', j - 1, j];
      }
    }
  }

  function* quick(a, lo = 0, hi = a.length - 1) {
    if (lo >= hi) return;
    let i = lo;
    for (let j = lo; j < hi; j++) {
      yield ['compare', j, hi];
      if (a[j] < a[hi]) { swap(a, i, j); yield ['swap', i, j]; i++; }
    }
    swap(a, i, hi);
    yield ['swap', i, hi];
    yield* quick(a, lo, i - 1); // yield* passes events up from deep in the recursion
    yield* quick(a, i + 1, hi);
  }

  function* merge(a, lo = 0, hi = a.length) {
    if (hi - lo < 2) return;
    const mid = (lo + hi) >> 1;
    yield* merge(a, lo, mid);
    yield* merge(a, mid, hi);
    const merged = [];
    let i = lo, j = mid;
    while (i < mid && j < hi) {
      yield ['compare', i, j];
      merged.push(a[i] <= a[j] ? a[i++] : a[j++]);
    }
    while (i < mid) merged.push(a[i++]);
    while (j < hi) merged.push(a[j++]);
    for (let k = 0; k < merged.length; k++) { a[lo + k] = merged[k]; yield ['set', lo + k]; }
  }

  function* heap(a) {
    function* siftDown(root, end) {
      while (2 * root + 1 < end) {
        let child = 2 * root + 1;
        if (child + 1 < end) {
          yield ['compare', child, child + 1];
          if (a[child] < a[child + 1]) child++;
        }
        yield ['compare', root, child];
        if (a[root] >= a[child]) return;
        swap(a, root, child);
        yield ['swap', root, child];
        root = child;
      }
    }
    for (let start = (a.length >> 1) - 1; start >= 0; start--) yield* siftDown(start, a.length);
    for (let end = a.length - 1; end > 0; end--) {
      swap(a, 0, end);
      yield ['swap', 0, end];
      yield* siftDown(0, end);
    }
  }

  const ALGORITHMS = { bubble, insertion, quick, merge, heap };

  // --- sound: values map onto a C major pentatonic scale, so notes never clash ---
  const SCALE = [];
  for (let octave = 0; octave < 3; octave++) {
    for (const semitone of [0, 2, 4, 7, 9]) SCALE.push(261.63 * 2 ** (octave + semitone / 12));
  }
  let audio = null;

  function playNote(value) {
    if (!state.sound || !audio) return;
    const freq = SCALE[Math.min(SCALE.length - 1, Math.floor(((value - 1) / values.length) * SCALE.length))];
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const t = audio.currentTime;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.12, t + 0.005); // quick fade in/out avoids clicks
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + 0.13);
  }

  // --- state ---
  const COLORS = { bar: '#3a63c9', compare: '#ffa586', swap: '#b51a2b', done: '#28c840' };
  const state = { algorithm: 'quick', size: 40, speed: 60, sound: true, running: false };
  let values = [];
  let gen = null;
  let active = { kind: null, idx: [] };
  let finished = false;
  let sweep = -1; // after sorting, a green sweep runs left to right
  let compares = 0, swaps = 0;
  let visible = true, rafId = null, lastTime = 0, accum = 0;

  const comparesEl = document.getElementById('sort-v-compares');
  const swapsEl = document.getElementById('sort-v-swaps');
  const runBtn = document.getElementById('sort-btn-run');

  function shuffle() {
    values = Array.from({ length: state.size }, (_, i) => i + 1);
    for (let i = values.length - 1; i > 0; i--) swap(values, i, Math.floor(Math.random() * (i + 1)));
    gen = null;
    finished = false;
    sweep = -1;
    active = { kind: null, idx: [] };
    compares = swaps = 0;
    draw();
  }

  function resize() {
    canvas.width = stage.clientWidth;
    canvas.height = stage.clientHeight;
    draw();
  }

  function draw() {
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // leave the strip under the controls panel empty
    const covered = panel.classList.contains('collapsed') ? 0 : panel.offsetWidth + 24;
    const pad = 16;
    const areaW = Math.max(60, canvas.width - covered - pad * 2);
    const areaH = canvas.height - pad * 2;
    const slot = areaW / values.length;
    const gap = slot > 6 ? 2 : slot > 3 ? 1 : 0;
    for (let i = 0; i < values.length; i++) {
      let color = COLORS.bar;
      if (finished && i <= sweep) color = COLORS.done;
      else if (active.idx.includes(i)) color = active.kind === 'compare' ? COLORS.compare : COLORS.swap;
      const h = (values[i] / values.length) * areaH;
      ctx.fillStyle = color;
      ctx.fillRect(pad + i * slot, pad + areaH - h, Math.max(1, slot - gap), h);
    }
    comparesEl.textContent = compares;
    swapsEl.textContent = swaps;
  }

  // pull one event from the generator and react to it; returns the value to play, if any
  function step() {
    if (!gen) gen = ALGORITHMS[state.algorithm](values);
    const { value: event, done } = gen.next();
    if (done) { // the generator ran out: sorting is finished, no extra "done" flag needed
      finished = true;
      active = { kind: null, idx: [] };
      return null;
    }
    const [kind, ...idx] = event;
    active = { kind, idx };
    if (kind === 'compare') compares++;
    else swaps++;
    return values[idx[idx.length - 1]];
  }

  // fixed timestep: speed is steps per second, independent of the screen's refresh rate
  function loop(t) {
    if (!lastTime) lastTime = t;
    const interval = 1000 / state.speed;
    accum = Math.min(accum + (t - lastTime), 250);
    lastTime = t;
    let note = null;
    if (!finished) {
      while (accum >= interval && !finished) {
        accum -= interval;
        const v = step();
        if (v !== null) note = v;
      }
    } else {
      // victory sweep: turn bars green left to right, one note per frame
      sweep = Math.min(values.length - 1, sweep + Math.max(1, Math.ceil(values.length / 45)));
      note = values[sweep];
      if (sweep >= values.length - 1) setRunning(false);
    }
    if (note !== null) playNote(note); // at most one note per frame, however many steps ran
    draw();
    if (state.running) rafId = requestAnimationFrame(loop);
  }

  function updateLoop() {
    const go = state.running && visible;
    if (go && rafId === null) {
      lastTime = 0;
      accum = 0;
      rafId = requestAnimationFrame(loop);
    } else if (!go && rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function setRunning(value) {
    state.running = value;
    runBtn.textContent = value ? 'Stop' : 'Start';
    if (!value && rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    updateLoop();
  }

  resize();
  shuffle();

  // ResizeObserver fires once immediately on observe() with the current (unchanged) size — ignore that
  let lastStageWidth = stage.clientWidth;
  let lastStageHeight = stage.clientHeight;
  new ResizeObserver(() => {
    if (stage.clientWidth === lastStageWidth && stage.clientHeight === lastStageHeight) return;
    lastStageWidth = stage.clientWidth;
    lastStageHeight = stage.clientHeight;
    resize();
  }).observe(stage);

  // pause while scrolled out of view
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    updateLoop();
  }, { threshold: 0.05 }).observe(stage);

  // --- controls wiring ---
  runBtn.addEventListener('click', () => {
    // browsers only allow audio to start from a click, so the audio context is created here
    if (state.sound && !audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    if (audio) audio.resume();
    if (!state.running && finished) shuffle(); // pressing Start on a sorted array starts over
    setRunning(!state.running);
  });

  document.getElementById('sort-btn-shuffle').addEventListener('click', () => {
    setRunning(false);
    shuffle();
  });

  const algoSelect = document.getElementById('sort-algorithm');
  algoSelect.value = state.algorithm;
  algoSelect.addEventListener('change', () => {
    state.algorithm = algoSelect.value;
    setRunning(false);
    shuffle();
  });

  function bindSlider(id, key, format, onChange) {
    const input = document.getElementById(id);
    const out = document.getElementById(id.replace('sort-', 'sort-v-'));
    input.value = state[key];
    out.textContent = format(state[key]);
    input.addEventListener('input', () => {
      state[key] = parseInt(input.value, 10);
      out.textContent = format(state[key]);
      if (onChange) onChange();
    });
  }
  bindSlider('sort-size', 'size', (v) => v, () => { setRunning(false); shuffle(); });
  bindSlider('sort-speed', 'speed', (v) => v + '/s');

  document.getElementById('sort-sound').addEventListener('change', (e) => {
    state.sound = e.target.checked;
    if (state.sound && !audio) audio = new (window.AudioContext || window.webkitAudioContext)(); // a click, so allowed
  });

  const panelToggle = document.getElementById('sortPanelToggle');
  panelToggle.addEventListener('click', () => {
    const collapsed = panel.classList.toggle('collapsed');
    panelToggle.setAttribute('aria-expanded', String(!collapsed));
    document.getElementById('sortToggleIcon').textContent = collapsed ? '+' : '−';
    draw(); // bars can use the space the panel was covering
  });
})();
