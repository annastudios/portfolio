(function () {
  const stage = document.getElementById('bounceStage');
  if (!stage) return;

  const canvas = document.getElementById('bounceCanvas');
  const ctx = canvas.getContext('2d');
  const panel = document.getElementById('bouncePanel');
  const section = stage.closest('.lab-experiment');

  const COLORS = ['#ffa586', '#b51a2b', '#3a63c9', '#8b4fe1', '#f7ede8'];
  const MAX_BALLS = 150;
  const state = { gravity: 0.35, bounciness: 0.75 };
  let balls = [];
  let visible = true, rafId = null;
  let rainLeft = 0;

  const countEl = document.getElementById('bounce-v-count');

  function addBall(x, y) {
    const r = 8 + Math.random() * 12;
    balls.push({
      x: Math.min(Math.max(x, r), canvas.width - r),
      y: Math.max(y, r),
      vx: (Math.random() - 0.5) * 4,
      vy: 0,
      r,
      mass: r * r, // bigger balls push smaller ones around
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    });
    if (balls.length > MAX_BALLS) balls.shift(); // oldest one goes
    wake();
  }

  function resize() {
    canvas.width = stage.clientWidth;
    canvas.height = stage.clientHeight;
    draw();
  }

  function physics() {
    const e = state.bounciness;
    const W = canvas.width, H = canvas.height;

    for (const b of balls) {
      b.vy += state.gravity;
      b.x += b.vx;
      b.y += b.vy;
      // walls: push back inside and reflect, losing some energy
      if (b.y + b.r > H) { b.y = H - b.r; b.vy *= -e; b.vx *= 0.98; if (Math.abs(b.vy) < 0.6) b.vy = 0; }
      if (b.y - b.r < 0) { b.y = b.r; b.vy *= -e; }
      if (b.x + b.r > W) { b.x = W - b.r; b.vx *= -e; }
      if (b.x - b.r < 0) { b.x = b.r; b.vx *= -e; }
    }

    // ball vs ball — every pair (fine for ≤150 balls)
    for (let i = 0; i < balls.length; i++) {
      const a = balls[i];
      for (let j = i + 1; j < balls.length; j++) {
        const b = balls[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const minDist = a.r + b.r;
        const distSq = dx * dx + dy * dy;
        if (distSq >= minDist * minDist || distSq === 0) continue;
        const dist = Math.sqrt(distSq);
        const nx = dx / dist, ny = dy / dist;
        // 1) separate them, the lighter ball moving more
        const overlap = minDist - dist;
        const total = a.mass + b.mass;
        a.x -= nx * overlap * (b.mass / total);
        a.y -= ny * overlap * (b.mass / total);
        b.x += nx * overlap * (a.mass / total);
        b.y += ny * overlap * (a.mass / total);
        // 2) if they're moving toward each other, bounce them apart along the line between centers
        const closing = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (closing >= 0) continue;
        const impulse = (-(1 + e) * closing) / (1 / a.mass + 1 / b.mass);
        a.vx -= (impulse / a.mass) * nx;
        a.vy -= (impulse / a.mass) * ny;
        b.vx += (impulse / b.mass) * nx;
        b.vy += (impulse / b.mass) * ny;
      }
    }
  }

  function draw() {
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!balls.length) {
      const covered = panel.classList.contains('collapsed') ? 0 : panel.offsetWidth + 24;
      ctx.fillStyle = 'rgba(247, 237, 232, 0.45)';
      ctx.font = "13px 'Space Mono', monospace";
      ctx.textAlign = 'center';
      ctx.fillText('click anywhere to drop a ball', (canvas.width - covered) / 2, canvas.height / 2);
    }
    for (const b of balls) {
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
    }
    countEl.textContent = balls.length;
  }

  function loop() {
    if (rainLeft > 0 && Math.random() < 0.35) {
      addBall(Math.random() * canvas.width, -10);
      rainLeft--;
    }
    // two smaller physics steps per frame keep fast balls from tunnelling through each other
    physics();
    physics();
    draw();
    rafId = requestAnimationFrame(loop);
  }

  // only animate while there's something to animate and you can see it
  function wake() {
    const go = visible && section.classList.contains('is-active') && (balls.length > 0 || rainLeft > 0);
    if (go && rafId === null) rafId = requestAnimationFrame(loop);
    else if (!go && rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
  }

  resize();

  // ResizeObserver fires once immediately on observe() with the current (unchanged) size — ignore that
  let lastStageWidth = stage.clientWidth;
  let lastStageHeight = stage.clientHeight;
  new ResizeObserver(() => {
    if (stage.clientWidth === lastStageWidth && stage.clientHeight === lastStageHeight) return;
    lastStageWidth = stage.clientWidth;
    lastStageHeight = stage.clientHeight;
    resize();
  }).observe(stage);

  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    wake();
  }, { threshold: 0.05 }).observe(stage);

  // the Lab picker hides inactive experiments with visibility (which IntersectionObserver
  // can't see), so also watch for this panel being switched away from
  new MutationObserver(wake).observe(section, { attributes: true, attributeFilter: ['class'] });

  canvas.addEventListener('pointerdown', (e) => {
    const rect = canvas.getBoundingClientRect();
    addBall(e.clientX - rect.left, e.clientY - rect.top);
  });

  // --- controls wiring ---
  function bindSlider(id, key) {
    const input = document.getElementById(id);
    const out = document.getElementById(id.replace('bounce-', 'bounce-v-'));
    input.value = state[key];
    out.textContent = state[key].toFixed(2);
    input.addEventListener('input', () => {
      state[key] = parseFloat(input.value);
      out.textContent = state[key].toFixed(2);
    });
  }
  bindSlider('bounce-gravity', 'gravity');
  bindSlider('bounce-bounciness', 'bounciness');

  document.getElementById('bounce-btn-rain').addEventListener('click', () => {
    rainLeft += 25;
    wake();
  });

  document.getElementById('bounce-btn-shake').addEventListener('click', () => {
    for (const b of balls) {
      b.vx += (Math.random() - 0.5) * 16;
      b.vy -= 6 + Math.random() * 10;
    }
    wake();
  });

  document.getElementById('bounce-btn-clear').addEventListener('click', () => {
    balls = [];
    rainLeft = 0;
    draw();
    wake();
  });

  const panelToggle = document.getElementById('bouncePanelToggle');
  panelToggle.addEventListener('click', () => {
    const collapsed = panel.classList.toggle('collapsed');
    panelToggle.setAttribute('aria-expanded', String(!collapsed));
    document.getElementById('bounceToggleIcon').textContent = collapsed ? '+' : '−';
    draw();
  });
})();
