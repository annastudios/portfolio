(function () {
  const stage = document.getElementById('mazeStage');
  if (!stage) return;

  const canvas = document.getElementById('mazeCanvas');
  const ctx = canvas.getContext('2d');

  const state = {
    cols: 20,
    speed: 4,
    algorithm: 'bfs',
    instant: false,
    running: false,
  };

  const opposite = { N: 'S', S: 'N', E: 'W', W: 'E' };

  let cellSize = 24;
  let rows = 12;
  let liveCells = null;
  let carveSteps = [];
  let carveIndex = 0;
  let solveSteps = [];
  let solveIndex = 0;
  let solveExplored = []; // cells explored so far in the current solve animation
  let mode = 'idle'; // carving | carved | solving | walking | solved
  let animId = null;
  let start = { r: 0, c: 0 };
  let end = { r: 0, c: 0 };
  let walkPath = [];
  let walkIndex = 0;
  let walkerPos = null;
  let walkFrameCount = 0;

  function resize() {
    canvas.width = stage.clientWidth;
    canvas.height = stage.clientHeight;
    cellSize = Math.max(10, Math.floor(canvas.width / state.cols));
    rows = Math.max(4, Math.floor(canvas.height / cellSize));
    start = { r: 0, c: 0 };
    end = { r: rows - 1, c: state.cols - 1 };
  }

  function emptyGrid(cols, gridRows) {
    return Array.from({ length: gridRows }, () =>
      Array.from({ length: cols }, () => ({ walls: { N: true, S: true, E: true, W: true } }))
    );
  }

  function neighborsInBounds(r, c, cols, gridRows) {
    return [
      { dir: 'N', r: r - 1, c: c },
      { dir: 'S', r: r + 1, c: c },
      { dir: 'E', r: r, c: c + 1 },
      { dir: 'W', r: r, c: c - 1 },
    ].filter(n => n.r >= 0 && n.r < gridRows && n.c >= 0 && n.c < cols);
  }

  // recursive backtracker — carves a perfect maze (exactly one path between any two cells)
  function generateCarveSteps(cols, gridRows) {
    const visited = Array.from({ length: gridRows }, () => Array(cols).fill(false));
    const steps = [];
    const stack = [{ r: 0, c: 0 }];
    visited[0][0] = true;
    while (stack.length) {
      const cur = stack[stack.length - 1];
      const options = neighborsInBounds(cur.r, cur.c, cols, gridRows).filter(n => !visited[n.r][n.c]);
      if (options.length) {
        const next = options[Math.floor(Math.random() * options.length)];
        steps.push({ from: { r: cur.r, c: cur.c }, dir: next.dir });
        visited[next.r][next.c] = true;
        stack.push({ r: next.r, c: next.c });
      } else {
        stack.pop();
      }
    }
    return steps;
  }

  function applyCarveStep(step) {
    const { from, dir } = step;
    const to = neighborsInBounds(from.r, from.c, state.cols, rows).find(n => n.dir === dir);
    liveCells[from.r][from.c].walls[dir] = false;
    liveCells[to.r][to.c].walls[opposite[dir]] = false;
  }

  // BFS gives the shortest path; DFS just gives *a* path, exploring depth-first
  function generateSolveSteps(cols, gridRows, cells, startCell, endCell, algo) {
    const key = (cell) => cell.r + ',' + cell.c;
    const steps = [];
    const visited = new Set([key(startCell)]);
    const cameFrom = {};
    const frontier = [startCell];
    let found = false;

    while (frontier.length && !found) {
      const cur = algo === 'dfs' ? frontier.pop() : frontier.shift();
      steps.push({ type: 'explore', r: cur.r, c: cur.c });
      if (cur.r === endCell.r && cur.c === endCell.c) { found = true; break; }
      for (const dir of ['N', 'S', 'E', 'W']) {
        if (!cells[cur.r][cur.c].walls[dir]) {
          const nb = neighborsInBounds(cur.r, cur.c, cols, gridRows).find(n => n.dir === dir);
          if (nb && !visited.has(key(nb))) {
            visited.add(key(nb));
            cameFrom[key(nb)] = cur;
            frontier.push({ r: nb.r, c: nb.c });
          }
        }
      }
    }

    const path = [];
    let cur = endCell;
    while (cur && key(cur) !== key(startCell)) {
      path.push(cur);
      cur = cameFrom[key(cur)];
    }
    path.push(startCell);
    path.reverse();
    steps.push({ type: 'path', path });
    return steps;
  }

  const wallCanvas = document.createElement('canvas');
  const wallCtx = wallCanvas.getContext('2d');
  let wallsCached = false; // reset whenever liveCells is replaced

  function drawWalls(target, cells) {
    target.strokeStyle = 'rgba(247, 237, 232, 0.85)';
    target.lineWidth = 2;
    target.beginPath();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < state.cols; c++) {
        const cell = cells[r][c];
        const x = c * cellSize, y = r * cellSize;
        if (cell.walls.N) { target.moveTo(x, y); target.lineTo(x + cellSize, y); }
        if (cell.walls.W) { target.moveTo(x, y); target.lineTo(x, y + cellSize); }
        if (cell.walls.S) { target.moveTo(x, y + cellSize); target.lineTo(x + cellSize, y + cellSize); }
        if (cell.walls.E) { target.moveTo(x + cellSize, y); target.lineTo(x + cellSize, y + cellSize); }
      }
    }
    target.stroke();
  }

  function drawGrid(cells, explored, path) {
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (explored && explored.length) {
      ctx.fillStyle = 'rgba(255, 165, 134, 0.28)';
      for (const cell of explored) ctx.fillRect(cell.c * cellSize, cell.r * cellSize, cellSize, cellSize);
    }

    if (path && path.length) {
      ctx.fillStyle = 'rgba(181, 26, 43, 0.7)';
      for (const cell of path) {
        ctx.fillRect(cell.c * cellSize + cellSize * 0.22, cell.r * cellSize + cellSize * 0.22, cellSize * 0.56, cellSize * 0.56);
      }
    }

    // walls only change while carving; after that, reuse a cached image of them
    // instead of re-stroking thousands of segments every solve/walk frame
    if (mode === 'carving') {
      drawWalls(ctx, cells);
    } else {
      if (!wallsCached) {
        wallCanvas.width = canvas.width;
        wallCanvas.height = canvas.height;
        drawWalls(wallCtx, cells);
        wallsCached = true;
      }
      ctx.drawImage(wallCanvas, 0, 0);
    }

    const walker = walkerPos || start;
    ctx.fillStyle = '#28c840';
    ctx.beginPath();
    ctx.arc(walker.c * cellSize + cellSize / 2, walker.r * cellSize + cellSize / 2, cellSize * 0.22, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#b51a2b';
    ctx.beginPath();
    ctx.arc(end.c * cellSize + cellSize / 2, end.r * cellSize + cellSize / 2, cellSize * 0.22, 0, Math.PI * 2);
    ctx.fill();
  }

  function cancelAnim() { if (animId) cancelAnimationFrame(animId); animId = null; }

  // draws one complete, unsolved maze instantly — the resting state before Start is pressed
  function initIdle() {
    resize();
    carveSteps = generateCarveSteps(state.cols, rows);
    liveCells = emptyGrid(state.cols, rows);
    wallsCached = false;
    carveSteps.forEach(applyCarveStep);
    carveIndex = carveSteps.length;
    solveSteps = [];
    solveIndex = 0;
    walkPath = [];
    walkIndex = 0;
    walkerPos = null;
    mode = 'carved';
    drawGrid(liveCells);
  }

  function newMaze() {
    cancelAnim();
    clearTimeout(autoplayTimer);
    resize();
    carveSteps = generateCarveSteps(state.cols, rows);
    carveIndex = 0;
    liveCells = emptyGrid(state.cols, rows);
    wallsCached = false;
    solveSteps = [];
    solveIndex = 0;
    walkPath = [];
    walkIndex = 0;
    walkerPos = null;
    mode = 'carving';

    if (state.instant) {
      carveSteps.forEach(applyCarveStep);
      carveIndex = carveSteps.length;
      mode = 'carved';
      drawGrid(liveCells);
    } else {
      drawGrid(liveCells);
      animId = requestAnimationFrame(tick);
    }
  }

  function solve() {
    if (mode !== 'carved' && mode !== 'solved') return;
    cancelAnim();
    clearTimeout(autoplayTimer);
    solveSteps = generateSolveSteps(state.cols, rows, liveCells, start, end, state.algorithm);
    solveIndex = 0;
    solveExplored = [];
    mode = 'solving';

    if (state.instant) {
      const explored = solveSteps.filter(s => s.type === 'explore').map(s => ({ r: s.r, c: s.c }));
      const pathStep = solveSteps.find(s => s.type === 'path');
      walkPath = pathStep ? pathStep.path : [];
      walkerPos = walkPath.length ? walkPath[walkPath.length - 1] : start;
      drawGrid(liveCells, explored, walkPath);
      mode = 'solved';
      queueAutoplay(newMaze, 1800);
    } else {
      animId = requestAnimationFrame(tick);
    }
  }

  let autoplayTimer = null;
  function queueAutoplay(fn, delay) {
    clearTimeout(autoplayTimer);
    if (!state.running) return;
    autoplayTimer = setTimeout(() => { if (state.running) fn(); }, delay);
  }

  // pick up wherever the run left off
  function resume() {
    if (mode === 'carving' || mode === 'solving' || mode === 'walking') {
      animId = requestAnimationFrame(tick);
    } else if (mode === 'carved') {
      solve();
    } else {
      newMaze();
    }
  }

  function pause() {
    cancelAnim();
    clearTimeout(autoplayTimer);
  }

  function setRunning(value) {
    state.running = value;
    value ? resume() : pause();
    const runBtn = document.getElementById('maze-btn-run');
    if (runBtn) runBtn.textContent = value ? 'Stop' : 'Start';
  }

  function tick() {
    if (mode === 'carving') {
      for (let i = 0; i < state.speed && carveIndex < carveSteps.length; i++, carveIndex++) {
        applyCarveStep(carveSteps[carveIndex]);
      }
      drawGrid(liveCells);
      if (carveIndex >= carveSteps.length) {
        mode = 'carved';
        queueAutoplay(solve, 600);
        return;
      }
      animId = requestAnimationFrame(tick);
    } else if (mode === 'solving') {
      // only add this frame's new steps — rebuilding from step 0 every frame made the solve O(n²)
      const endIdx = Math.min(solveIndex + state.speed, solveSteps.length);
      let path = null;
      for (let i = solveIndex; i < endIdx; i++) {
        const s = solveSteps[i];
        if (s.type === 'explore') solveExplored.push({ r: s.r, c: s.c });
        if (s.type === 'path') path = s.path;
      }
      solveIndex = endIdx;
      drawGrid(liveCells, solveExplored, null);
      if (solveIndex >= solveSteps.length) {
        walkPath = path || [];
        walkIndex = 0;
        walkFrameCount = 0;
        walkerPos = walkPath[0] || start;
        mode = walkPath.length ? 'walking' : 'solved';
        if (mode === 'solved') queueAutoplay(newMaze, 1800);
        animId = requestAnimationFrame(tick);
        return;
      }
      animId = requestAnimationFrame(tick);
    } else if (mode === 'walking') {
      // advance the walker one path-cell every few frames, so it visibly steps through the maze;
      // read from state.speed each frame so the slider takes effect mid-walk
      walkFrameCount++;
      if (walkFrameCount >= Math.max(1, Math.round(10 / state.speed))) {
        walkFrameCount = 0;
        walkIndex = Math.min(walkIndex + 1, walkPath.length - 1);
      }
      walkerPos = walkPath[walkIndex];
      drawGrid(liveCells, null, walkPath);
      if (walkIndex >= walkPath.length - 1) {
        mode = 'solved';
        queueAutoplay(newMaze, 1200);
        return;
      }
      animId = requestAnimationFrame(tick);
    }
  }

  initIdle();

  // ResizeObserver fires once immediately on observe() with the current (unchanged) size —
  // ignore that spurious call so it can't reset a run already in progress.
  let lastStageWidth = stage.clientWidth;
  let lastStageHeight = stage.clientHeight;
  const ro = new ResizeObserver(() => {
    if (stage.clientWidth === lastStageWidth && stage.clientHeight === lastStageHeight) return;
    lastStageWidth = stage.clientWidth;
    lastStageHeight = stage.clientHeight;
    if (state.running) newMaze(); else initIdle();
  });
  ro.observe(stage);

  // pause the loop while the widget is scrolled out of view; state.running stays
  // true so it picks back up when it scrolls back in
  const io = new IntersectionObserver(([entry]) => {
    if (!state.running) return;
    entry.isIntersecting ? resume() : pause();
  }, { threshold: 0.05 });
  io.observe(stage);

  // --- controls wiring ---
  const colsInput = document.getElementById('maze-cols');
  const colsVal = document.getElementById('maze-v-cols');
  colsInput.value = state.cols;
  colsVal.textContent = state.cols;
  colsInput.addEventListener('input', () => {
    state.cols = parseInt(colsInput.value, 10);
    colsVal.textContent = state.cols;
    if (state.running) newMaze(); else initIdle();
  });

  const speedInput = document.getElementById('maze-speed');
  const speedVal = document.getElementById('maze-v-speed');
  speedInput.value = state.speed;
  speedVal.textContent = state.speed;
  speedInput.addEventListener('input', () => {
    state.speed = parseInt(speedInput.value, 10);
    speedVal.textContent = state.speed;
  });

  const algoSelect = document.getElementById('maze-algorithm');
  algoSelect.value = state.algorithm;
  algoSelect.addEventListener('change', () => { state.algorithm = algoSelect.value; });

  document.getElementById('maze-instant').addEventListener('change', (e) => {
    state.instant = e.target.checked;
  });

  document.getElementById('maze-btn-new').addEventListener('click', newMaze);
  document.getElementById('maze-btn-solve').addEventListener('click', solve);
  document.getElementById('maze-btn-run').addEventListener('click', () => setRunning(!state.running));

  const panel = document.getElementById('mazePanel');
  const panelToggle = document.getElementById('mazePanelToggle');
  panelToggle.addEventListener('click', () => {
    const collapsed = panel.classList.toggle('collapsed');
    panelToggle.setAttribute('aria-expanded', String(!collapsed));
    document.getElementById('mazeToggleIcon').textContent = collapsed ? '+' : '−';
  });
})();
