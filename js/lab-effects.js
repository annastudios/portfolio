const labReduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* wormy cursor — a chain of segments, each easing toward the one ahead of it */
if (!labReduceMotion && window.matchMedia('(pointer: fine)').matches) {
  const segCount = 14;
  const segments = Array.from({ length: segCount }, () => ({ x: innerWidth / 2, y: innerHeight / 2 }));
  const mouse = { x: innerWidth / 2, y: innerHeight / 2 };
  let hasMoved = false;

  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, {
    position: 'fixed', inset: '0', width: '100vw', height: '100vh',
    pointerEvents: 'none', zIndex: '99999',
  });
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  function resizeWorm() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  // the loop only runs while the worm is catching up to the pointer — once every
  // segment has settled it stops, and the last frame stays on the canvas
  let rafId = null;
  const wake = () => { if (hasMoved && rafId === null) rafId = requestAnimationFrame(animateWorm); };

  resizeWorm();
  window.addEventListener('resize', () => { resizeWorm(); wake(); }); // resizing wipes the canvas

  window.addEventListener('pointermove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    if (!hasMoved) {
      hasMoved = true;
      segments.forEach((s) => { s.x = mouse.x; s.y = mouse.y; });
      document.body.classList.add('cursor-worm-active');
    }
    wake();
  });

  const headColor = [181, 26, 43]; // --accent
  const tailColor = [255, 165, 134]; // peach

  function animateWorm() {
    segments[0].x += (mouse.x - segments[0].x) * 0.4;
    segments[0].y += (mouse.y - segments[0].y) * 0.4;
    for (let i = 1; i < segments.length; i++) {
      segments[i].x += (segments[i - 1].x - segments[i].x) * 0.4;
      segments[i].y += (segments[i - 1].y - segments[i].y) * 0.4;
    }

    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (let i = segments.length - 1; i >= 0; i--) {
      const t = i / (segments.length - 1);
      const radius = 7 * (1 - t) + 1.5 * t;
      const r = Math.round(headColor[0] + (tailColor[0] - headColor[0]) * t);
      const g = Math.round(headColor[1] + (tailColor[1] - headColor[1]) * t);
      const b = Math.round(headColor[2] + (tailColor[2] - headColor[2]) * t);
      ctx.beginPath();
      ctx.arc(segments[i].x, segments[i].y, radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${1 - t * 0.4})`;
      ctx.fill();
    }

    const settled = segments.every((s) => Math.abs(s.x - mouse.x) < 0.1 && Math.abs(s.y - mouse.y) < 0.1);
    rafId = settled ? null : requestAnimationFrame(animateWorm);
  }
}

/* experiment picker — show one lab window at a time */
const labDropdown = document.getElementById('labDropdown');
if (labDropdown) {
  const btn = document.getElementById('labDropdownBtn');
  const valueEl = labDropdown.querySelector('.lab-dropdown-value');
  const options = Array.from(labDropdown.querySelectorAll('[role="option"]'));

  const showExperiment = (id) => {
    const next = document.getElementById(id);
    const current = document.querySelector('.lab-experiment.is-active');
    if (!next || next === current) return;

    // stop whatever was running so it doesn't keep animating out of sight
    const runBtn = current.querySelector('[id$="-btn-run"]');
    if (runBtn && runBtn.textContent === 'Stop') runBtn.click();

    current.classList.remove('is-active');
    next.classList.add('is-active');
  };

  const isOpen = () => labDropdown.classList.contains('is-open');

  const setOpen = (open) => {
    labDropdown.classList.toggle('is-open', open);
    btn.setAttribute('aria-expanded', String(open));
    if (open) {
      (options.find((o) => o.getAttribute('aria-selected') === 'true') || options[0]).focus();
    }
  };

  const select = (opt) => {
    options.forEach((o) => o.setAttribute('aria-selected', String(o === opt)));
    valueEl.textContent = opt.querySelector('.lab-opt-name').textContent;
    showExperiment(opt.dataset.value);
  };

  const choose = (opt) => {
    select(opt);
    setOpen(false);
    btn.focus();
  };

  btn.addEventListener('click', () => setOpen(!isOpen()));

  btn.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      // don't let this same keypress bubble to the menu handler and move focus again
      e.stopPropagation();
      setOpen(true);
    }
  });

  options.forEach((opt) => opt.addEventListener('click', () => choose(opt)));

  labDropdown.addEventListener('keydown', (e) => {
    if (!isOpen()) return;
    const i = options.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); options[Math.min(i + 1, options.length - 1)].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); options[Math.max(i - 1, 0)].focus(); }
    else if (e.key === 'Home') { e.preventDefault(); options[0].focus(); }
    else if (e.key === 'End') { e.preventDefault(); options[options.length - 1].focus(); }
    else if ((e.key === 'Enter' || e.key === ' ') && i !== -1) { e.preventDefault(); choose(options[i]); }
    else if (e.key === 'Escape') { setOpen(false); btn.focus(); }
    else if (e.key === 'Tab') { setOpen(false); }
  });

  document.addEventListener('click', (e) => {
    if (isOpen() && !labDropdown.contains(e.target)) setOpen(false);
  });

  // deep link: lab.html#sort-sonic opens that experiment (hash = file name minus .js)
  const linked = options.find((o) => '#' + o.querySelector('.lab-opt-name').textContent.replace('.js', '') === location.hash);
  if (linked) select(linked);
}

/* animated headline word */
const labWords = ['tinker', 'fiddle', 'poke', 'break'];
const labAccentWord = document.getElementById('accentWord');

if (labAccentWord && !labReduceMotion) {
  let i = 0;
  setInterval(() => {
    labAccentWord.classList.add('swap');
    setTimeout(() => {
      i = (i + 1) % labWords.length;
      labAccentWord.textContent = labWords[i];
      labAccentWord.classList.remove('swap');
    }, 400);
  }, 2400);
}
