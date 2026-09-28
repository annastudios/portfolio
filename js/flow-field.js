(function () {
  const stage = document.getElementById('flowStage');
  if (!stage) return;

  const canvas = document.getElementById('flowCanvas');
  const ctx = canvas.getContext('2d');

  // --- 3D Simplex noise (public-domain reference algorithm, hand-rolled) ---
  // Gives us noise(x, y, t): smooth, continuous, and the 3rd argument lets us
  // animate the whole field over time without recomputing a grid.
  function makeSimplex3(seed) {
    let rand = mulberry32(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    const perm = new Uint8Array(512);
    const permMod12 = new Uint8Array(512);
    for (let i = 0; i < 512; i++) {
      perm[i] = p[i & 255];
      permMod12[i] = perm[i] % 12;
    }

    const grad3 = [
      [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
      [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
      [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]
    ];
    const F3 = 1 / 3, G3 = 1 / 6;

    function dot(g, x, y, z) { return g[0] * x + g[1] * y + g[2] * z; }

    return function noise3(x, y, z) {
      const s = (x + y + z) * F3;
      const i = Math.floor(x + s), j = Math.floor(y + s), k = Math.floor(z + s);
      const t = (i + j + k) * G3;
      const X0 = i - t, Y0 = j - t, Z0 = k - t;
      const x0 = x - X0, y0 = y - Y0, z0 = z - Z0;

      let i1, j1, k1, i2, j2, k2;
      if (x0 >= y0) {
        if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
        else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
        else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
      } else {
        if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
        else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
        else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      }

      const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
      const x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3;
      const x3 = x0 - 1 + 3 * G3, y3 = y0 - 1 + 3 * G3, z3 = z0 - 1 + 3 * G3;

      const ii = i & 255, jj = j & 255, kk = k & 255;
      let n0 = 0, n1 = 0, n2 = 0, n3 = 0;

      let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
      if (t0 >= 0) { t0 *= t0; n0 = t0 * t0 * dot(grad3[permMod12[ii + perm[jj + perm[kk]]]], x0, y0, z0); }
      let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
      if (t1 >= 0) { t1 *= t1; n1 = t1 * t1 * dot(grad3[permMod12[ii + i1 + perm[jj + j1 + perm[kk + k1]]]], x1, y1, z1); }
      let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
      if (t2 >= 0) { t2 *= t2; n2 = t2 * t2 * dot(grad3[permMod12[ii + i2 + perm[jj + j2 + perm[kk + k2]]]], x2, y2, z2); }
      let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
      if (t3 >= 0) { t3 *= t3; n3 = t3 * t3 * dot(grad3[permMod12[ii + 1 + perm[jj + 1 + perm[kk + 1]]]], x3, y3, z3); }

      return 32 * (n0 + n1 + n2 + n3); // roughly in [-1, 1]
    };
  }

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function paintBackground() {
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // arrows only get drawn by the animation loop, so anything that wipes the canvas
  // calls this instead — otherwise the wind field shows blank while stopped
  function repaint() {
    if (config.showField) drawFieldArrows();
    else paintBackground();
  }

  function resize() {
    canvas.width = stage.clientWidth;
    canvas.height = stage.clientHeight;
    repaint();
  }

  const config = {
    noiseScale: 0.003,
    particleCount: 500,
    speed: 2,
    lineWidth: 1,
    lineAlpha: 0.06,
    colorMode: 'position',
    baseHue: 200,
    maxSteps: 200,
    showField: false,
  };

  let noise3 = makeSimplex3(Date.now() & 0xffffffff);
  let time = 0;
  let running = false;
  let userStarted = false;
  let isVisible = true;

  class Particle {
    constructor() { this.reset(); }
    reset() {
      this.x = Math.random() * canvas.width;
      this.y = Math.random() * canvas.height;
      this.steps = 0;
      this.hue = Math.random() * 360;
    }
    step() {
      const angle = noise3(this.x * config.noiseScale, this.y * config.noiseScale, time) * Math.PI * 4;
      const nx = this.x + Math.cos(angle) * config.speed;
      const ny = this.y + Math.sin(angle) * config.speed;

      let hue;
      switch (config.colorMode) {
        case 'single':
          hue = config.baseHue;
          break;
        case 'angle':
          hue = (config.baseHue + angle * 180 / Math.PI) % 360;
          if (hue < 0) hue += 360;
          break;
        case 'random':
          hue = this.hue;
          break;
        case 'position':
        default:
          hue = (config.baseHue + (this.x / canvas.width * 0.5 + this.y / canvas.height * 0.5) * 260) % 360;
          break;
      }

      // queue the segment in its hue bucket; drawSegments() strokes each bucket once
      hueBuckets[Math.round(hue / HUE_STEP) % hueBuckets.length].push(this.x, this.y, nx, ny);

      this.x = nx; this.y = ny;
      this.steps++;

      const offCanvas = this.x < 0 || this.x > canvas.width || this.y < 0 || this.y > canvas.height;
      if (offCanvas || this.steps > config.maxSteps) this.reset();
    }
  }

  let particles = [];
  function initParticles() {
    particles = Array.from({ length: config.particleCount }, () => new Particle());
  }

  // one stroke() per 5° hue band instead of one per particle — thousands of draw
  // calls a frame down to at most 72 (just 1 in single-color mode)
  const HUE_STEP = 5;
  const hueBuckets = Array.from({ length: 360 / HUE_STEP }, () => []);

  function drawSegments() {
    ctx.lineWidth = config.lineWidth;
    hueBuckets.forEach((segs, i) => {
      if (!segs.length) return;
      ctx.strokeStyle = `hsla(${i * HUE_STEP}, 70%, 62%, ${config.lineAlpha})`;
      ctx.beginPath();
      for (let j = 0; j < segs.length; j += 4) {
        ctx.moveTo(segs[j], segs[j + 1]);
        ctx.lineTo(segs[j + 2], segs[j + 3]);
      }
      ctx.stroke();
      segs.length = 0;
    });
  }

  function drawFieldArrows() {
    paintBackground();
    const spacing = 28;
    const len = spacing * 0.55;
    const ah = 4;
    // every shaft goes in one path and every head in another: 2 draw calls, not ~1200
    const shafts = new Path2D();
    const heads = new Path2D();
    for (let y = spacing / 2; y < canvas.height; y += spacing) {
      for (let x = spacing / 2; x < canvas.width; x += spacing) {
        const angle = noise3(x * config.noiseScale, y * config.noiseScale, time) * Math.PI * 4;
        const dx = Math.cos(angle) * len, dy = Math.sin(angle) * len;
        const hx = x + dx / 2, hy = y + dy / 2;

        shafts.moveTo(x - dx / 2, y - dy / 2);
        shafts.lineTo(hx, hy);

        heads.moveTo(hx, hy);
        heads.lineTo(hx - ah * Math.cos(angle - 0.4), hy - ah * Math.sin(angle - 0.4));
        heads.lineTo(hx - ah * Math.cos(angle + 0.4), hy - ah * Math.sin(angle + 0.4));
        heads.closePath();
      }
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1;
    ctx.stroke(shafts);
    ctx.fill(heads);
  }

  function animate() {
    if (!running) return;
    if (config.showField) {
      drawFieldArrows();
    } else {
      for (const p of particles) p.step();
      drawSegments();
    }
    time += 0.0015;
    requestAnimationFrame(animate);
  }

  resize();
  initParticles();
  // idle until the user presses Start — nothing runs on load

  function updateRunning() {
    const shouldRun = userStarted && isVisible;
    const wasRunning = running;
    running = shouldRun;
    if (running && !wasRunning) requestAnimationFrame(animate);
  }

  // ResizeObserver fires once immediately on observe() with the current (unchanged) size —
  // ignore that spurious call so it doesn't wipe accumulated trails right after Start.
  let lastStageWidth = stage.clientWidth;
  let lastStageHeight = stage.clientHeight;
  const ro = new ResizeObserver(() => {
    if (stage.clientWidth === lastStageWidth && stage.clientHeight === lastStageHeight) return;
    lastStageWidth = stage.clientWidth;
    lastStageHeight = stage.clientHeight;
    resize();
  });
  ro.observe(stage);

  // pause the loop while the widget is scrolled out of view
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      isVisible = entry.isIntersecting;
      updateRunning();
    });
  }, { threshold: 0.05 });
  io.observe(stage);

  const runBtn = document.getElementById('flow-btn-run');
  runBtn.addEventListener('click', () => {
    userStarted = !userStarted;
    runBtn.textContent = userStarted ? 'Stop' : 'Start';
    updateRunning();
  });

  // --- controls wiring ---
  function bindSlider(id, key, format) {
    const input = document.getElementById(id);
    const out = document.getElementById('flow-v-' + key);
    input.value = config[key];
    out.textContent = format ? format(config[key]) : config[key];
    input.addEventListener('input', () => {
      const value = parseFloat(input.value);
      config[key] = value;
      out.textContent = format ? format(value) : value;
      if (key === 'particleCount') initParticles();
      if (key === 'noiseScale' && config.showField) drawFieldArrows();
    });
  }

  bindSlider('flow-noiseScale', 'noiseScale', v => v.toFixed(4));
  bindSlider('flow-particleCount', 'particleCount', v => Math.round(v));
  bindSlider('flow-speed', 'speed', v => v.toFixed(1));
  bindSlider('flow-lineAlpha', 'lineAlpha', v => v.toFixed(3));
  bindSlider('flow-lineWidth', 'lineWidth', v => v.toFixed(1));
  bindSlider('flow-baseHue', 'baseHue', v => Math.round(v) + '°');

  document.getElementById('flow-showField').addEventListener('change', (e) => {
    config.showField = e.target.checked;
    repaint();
    if (!config.showField) initParticles();
  });

  const colorModeSelect = document.getElementById('flow-colorMode');
  colorModeSelect.value = config.colorMode;
  colorModeSelect.addEventListener('change', () => { config.colorMode = colorModeSelect.value; });

  // clearing also reseeds the noise field, so it reads as a genuine fresh start, not just a wipe
  document.getElementById('flow-btn-clear').addEventListener('click', () => {
    noise3 = makeSimplex3(Math.floor(Math.random() * 0xffffffff));
    time = 0;
    repaint();
    initParticles();
  });

  const panel = document.getElementById('flowPanel');
  const panelToggle = document.getElementById('flowPanelToggle');
  panelToggle.addEventListener('click', () => {
    const collapsed = panel.classList.toggle('collapsed');
    panelToggle.setAttribute('aria-expanded', String(!collapsed));
    document.getElementById('flowToggleIcon').textContent = collapsed ? '+' : '−';
  });
})();
