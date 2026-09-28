(function () {
  const glowCanvas = document.getElementById('bgWave');
  const netCanvas = document.getElementById('bgNetwork');
  if (!glowCanvas || !netCanvas) return;

  // particles live in `region` coordinates (the whole hero→projects area), but the
  // canvases sit in `view`, a sticky viewport-sized box — each frame only the slice
  // of the network currently on screen is linked and drawn
  const view = netCanvas.parentElement;
  const region = view.parentElement;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const gctx = glowCanvas.getContext('2d');
  const nctx = netCanvas.getContext('2d');

  // multi-stop palette the nodes/edges are colored from, left to right
  const STOPS = [
    [0.0, [36, 47, 73]],     // navy
    [0.3, [58, 99, 201]],    // blue
    [0.6, [139, 79, 225]],   // purple
    [0.85, [181, 26, 43]],   // accent red
    [1.0, [255, 165, 134]],  // peach
  ];

  function lerpColor(t) {
    t = Math.max(0, Math.min(1, t));
    let a = STOPS[0], b = STOPS[STOPS.length - 1];
    for (let i = 0; i < STOPS.length - 1; i++) {
      if (t >= STOPS[i][0] && t <= STOPS[i + 1][0]) { a = STOPS[i]; b = STOPS[i + 1]; break; }
    }
    const span = b[0] - a[0] || 1;
    const localT = (t - a[0]) / span;
    const r = Math.round(a[1][0] + (b[1][0] - a[1][0]) * localT);
    const g = Math.round(a[1][1] + (b[1][1] - a[1][1]) * localT);
    const bl = Math.round(a[1][2] + (b[1][2] - a[1][2]) * localT);
    return `${r}, ${g}, ${bl}`;
  }

  const linkDist = 150;
  let width, worldHeight, viewHeight, offsetY = 0, dpr, particles, isMobile, alphaScale;

  function initParticles() {
    isMobile = width < 640;
    alphaScale = isMobile ? 0.75 : 1;
    // same density-per-area on every page; the cap is high enough that the
    // tall home-page region gets the same node density as the short lab one
    const divisor = isMobile ? 15000 : 11000;
    const maxCount = isMobile ? 160 : 700;
    const count = Math.max(24, Math.min(maxCount, Math.round((width * worldHeight) / divisor)));
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * worldHeight,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      r: Math.random() * 1.7 + 1.3,
    }));
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    viewHeight = view.clientHeight;
    const newWidth = region.clientWidth;
    const newWorldHeight = region.clientHeight;

    for (const canvas of [netCanvas, glowCanvas]) {
      canvas.width = newWidth * dpr;
      canvas.height = viewHeight * dpr;
    }
    // re-scatter only when the area the particles live in changes, not on
    // viewport-height changes (the canvas just shows a different-sized slice)
    if (!particles || newWidth !== width || newWorldHeight !== worldHeight) {
      width = newWidth;
      worldHeight = newWorldHeight;
      initParticles();
    }
    render(); // resizing a canvas wipes it
  }

  // particles within linkDist of the viewport, so edges crossing the screen edge still draw
  function visibleParticles() {
    offsetY = view.getBoundingClientRect().top - region.getBoundingClientRect().top;
    const top = offsetY - linkDist, bottom = offsetY + viewHeight + linkDist;
    return particles.filter((p) => p.y > top && p.y < bottom);
  }

  function buildEdges(pts) {
    const adj = pts.map(() => []);
    const edges = [];
    const top = offsetY - linkDist;

    // bucket particles into linkDist-sized cells so each one only checks its
    // 3x3 neighborhood instead of every other particle
    const cols = Math.ceil(width / linkDist) + 1;
    const rows = Math.ceil((viewHeight + 2 * linkDist) / linkDist) + 1;
    const cellOf = (p) => [Math.floor(p.x / linkDist), Math.floor((p.y - top) / linkDist)];
    const grid = new Array(cols * rows);
    for (let i = 0; i < pts.length; i++) {
      const [cx, cy] = cellOf(pts[i]);
      const cell = cy * cols + cx;
      (grid[cell] || (grid[cell] = [])).push(i);
    }

    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const [cx, cy] = cellOf(a);
      for (let gy = Math.max(0, cy - 1); gy <= Math.min(rows - 1, cy + 1); gy++) {
        for (let gx = Math.max(0, cx - 1); gx <= Math.min(cols - 1, cx + 1); gx++) {
          const bucket = grid[gy * cols + gx];
          if (!bucket) continue;
          for (const j of bucket) {
            if (j <= i) continue;
            const b = pts[j];
            const dx = a.x - b.x, dy = a.y - b.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < linkDist) {
              adj[i].push(j);
              edges.push({ a, b, t: (1 - dist / linkDist) });
            }
          }
        }
      }
      // buildTriangles assumes each neighbor list is in ascending order
      adj[i].sort((p, q) => p - q);
    }
    return { edges, adj };
  }

  function buildTriangles(pts, adj) {
    const tris = [];
    for (let i = 0; i < pts.length; i++) {
      const ni = adj[i];
      for (let a = 0; a < ni.length; a++) {
        const j = ni[a];
        for (let b = a + 1; b < ni.length; b++) {
          const k = ni[b];
          if (adj[j].indexOf(k) === -1) continue;
          tris.push([pts[i], pts[j], pts[k]]);
        }
      }
    }
    return tris;
  }

  // shift the drawing up by the scroll offset so region coordinates land on screen
  function beginFrame(ctx) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, -offsetY * dpr);
    ctx.clearRect(0, offsetY, width, viewHeight);
  }

  // colors are worked out once per vertical band, instead of lerping and
  // building an rgba() string for every shape on every frame
  const BANDS = 48;
  const EDGE_LEVELS = 10;
  const BAND_RGB = Array.from({ length: BANDS }, (_, i) => lerpColor((i + 0.5) / BANDS));
  const bandOf = (x) => Math.max(0, Math.min(BANDS - 1, Math.floor((x / width) * BANDS)));

  // sort this frame's shapes into color groups once — both layers draw from the same groups
  function groupShapes(pts, edges, tris) {
    const triGroups = Array.from({ length: BANDS }, () => []);
    const nodeGroups = Array.from({ length: BANDS }, () => []);
    const edgePaths = new Map(); // band * EDGE_LEVELS + alpha level -> one Path2D
    for (const tri of tris) triGroups[bandOf((tri[0].x + tri[1].x + tri[2].x) / 3)].push(tri);
    for (const p of pts) nodeGroups[bandOf(p.x)].push(p);
    for (const e of edges) {
      const level = Math.min(EDGE_LEVELS - 1, Math.floor(e.t * EDGE_LEVELS));
      const key = bandOf((e.a.x + e.b.x) / 2) * EDGE_LEVELS + level;
      let path = edgePaths.get(key);
      if (!path) edgePaths.set(key, (path = new Path2D()));
      path.moveTo(e.a.x, e.a.y);
      path.lineTo(e.b.x, e.b.y);
    }
    return { triGroups, nodeGroups, edgePaths };
  }

  // triangles and nodes are still filled one at a time so overlaps keep stacking
  // alpha (that's what makes dense clusters glow) — they just share one style per
  // group. Edges are thin enough that overlap doesn't matter: one stroke per group
  function drawLayer(ctx, { triGroups, nodeGroups, edgePaths }, style) {
    beginFrame(ctx);

    triGroups.forEach((group, b) => {
      if (!group.length) return;
      ctx.fillStyle = `rgba(${BAND_RGB[b]}, ${style.triAlpha * alphaScale})`;
      for (const tri of group) {
        ctx.beginPath();
        ctx.moveTo(tri[0].x, tri[0].y);
        ctx.lineTo(tri[1].x, tri[1].y);
        ctx.lineTo(tri[2].x, tri[2].y);
        ctx.closePath();
        ctx.fill();
      }
    });

    ctx.lineWidth = style.lineWidth;
    for (const [key, path] of edgePaths) {
      const t = (key % EDGE_LEVELS + 0.5) / EDGE_LEVELS;
      ctx.strokeStyle = `rgba(${BAND_RGB[Math.floor(key / EDGE_LEVELS)]}, ${t * style.edgeAlpha * alphaScale})`;
      ctx.stroke(path);
    }

    nodeGroups.forEach((group, b) => {
      if (!group.length) return;
      ctx.fillStyle = `rgba(${BAND_RGB[b]}, ${style.nodeAlpha * alphaScale})`;
      for (const p of group) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * style.nodeScale, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  // colorful, oversized glow layer that traces the exact same nodes/edges as the
  // crisp network — CSS-blurred so the color reads as spilling out of them
  const GLOW = { triAlpha: 0.16, edgeAlpha: 0.6, lineWidth: 3.5, nodeAlpha: 0.55, nodeScale: 4.5 };
  const NET = { triAlpha: 0.06, edgeAlpha: 0.55, lineWidth: 1.1, nodeAlpha: 0.9, nodeScale: 1 };

  function render() {
    // nothing to draw on while the region has no size yet (bandOf would divide by a 0 width);
    // the ResizeObserver calls resize() again once it's laid out
    if (!width || !viewHeight) return;
    const pts = visibleParticles();
    const { edges, adj } = buildEdges(pts);
    const groups = groupShapes(pts, edges, buildTriangles(pts, adj));
    drawLayer(gctx, groups, GLOW);
    drawLayer(nctx, groups, NET);
  }

  function stepParticles() {
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0 || p.x > width) p.vx *= -1;
      if (p.y < 0 || p.y > worldHeight) p.vy *= -1;
      p.x = Math.max(0, Math.min(width, p.x));
      p.y = Math.max(0, Math.min(worldHeight, p.y));
    }
  }

  let rafId = null;
  let inView = true;
  let tabVisible = document.visibilityState === 'visible';

  function loop() {
    stepParticles();
    render();
    rafId = requestAnimationFrame(loop);
  }

  function startLoop() {
    if (rafId === null && inView && tabVisible) rafId = requestAnimationFrame(loop);
  }

  function stopLoop() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  // pause the per-frame particle/edge/triangle recompute when the region is
  // scrolled off-screen or the tab is backgrounded — it's the priciest part
  // of this animation and neither case needs it running
  if (window.IntersectionObserver) {
    new IntersectionObserver((entries) => {
      inView = entries[0].isIntersecting;
      if (reduceMotion) return;
      inView ? startLoop() : stopLoop();
    }).observe(region);
  }

  document.addEventListener('visibilitychange', () => {
    tabVisible = document.visibilityState === 'visible';
    if (reduceMotion) return;
    tabVisible ? startLoop() : stopLoop();
  });

  // with reduced motion there's no loop, but the network still has to
  // scroll with the page, so redraw the static slice on scroll
  if (reduceMotion) {
    let queued = false;
    window.addEventListener('scroll', () => {
      if (queued || !inView) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; render(); });
    }, { passive: true });
  }

  // ResizeObserver (not just window resize) so it re-measures if the region's
  // height changes from content reflow (fonts loading, copy edits, etc.)
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(resize);
    ro.observe(region);
    ro.observe(view);
  } else {
    window.addEventListener('resize', resize);
  }
  resize();
  if (!reduceMotion) startLoop();
})();
