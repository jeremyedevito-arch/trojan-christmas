(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  // -------------------- Global state --------------------
  const state = {
    w: 0,
    h: 0,
    t: 0,
    muted: false,
    screen: "title", // title -> select -> level1
    selected: 0,
    chars: [
      { name: "Holli", tag: "Calm in the chaos." },
      { name: "Emily", tag: "Drama. Energy. Motion." },
      { name: "Devin", tag: "Built for the long jump." },
      { name: "Brandon", tag: "IB approved." },
      { name: "Colleen", tag: "School mom magic." },
      { name: "Melissa", tag: "All the pieces in motion." },
    ],
  };

  // -------------------- Letterbox view (16:9) + phone zoom --------------------
  // Smaller internal resolution => bigger-looking game on phones.
  let VIEW = {
    gw: 960,
    gh: 540,
    scale: 1,
    ox: 0,
    oy: 0,
  };

  function computeView() {
    VIEW.scale = Math.min(state.w / VIEW.gw, state.h / VIEW.gh);
    VIEW.ox = (state.w - VIEW.gw * VIEW.scale) / 2;
    VIEW.oy = (state.h - VIEW.gh * VIEW.scale) / 2;
  }

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;

    // Choose internal resolution on resize (keeps “perfect” size after rotation)
    const phone = Math.min(w, h) <= 520;
    VIEW.gw = phone ? 560 : 960;
    VIEW.gh = phone ? 315 : 540;

    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;

    state.w = w;
    state.h = h;
    computeView();
  }

  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", () => setTimeout(resize, 120));
  resize();

  function screenToGame(clientX, clientY) {
    const gx = (clientX - VIEW.ox) / VIEW.scale;
    const gy = (clientY - VIEW.oy) / VIEW.scale;
    return { gx, gy };
  }
  function inGameBounds(gx, gy) {
    return gx >= 0 && gx <= VIEW.gw && gy >= 0 && gy <= VIEW.gh;
  }

  // -------------------- Input --------------------
  const keys = new Set();
  const touch = { left: false, right: false };

  function clearTouch() {
    touch.left = false;
    touch.right = false;
  }
  function setTouchFromGX(gx) {
    touch.left = gx < VIEW.gw * 0.33;
    touch.right = gx > VIEW.gw * 0.66;
  }

  // -------------------- Web Audio (SFX + hallway murmur) --------------------
  let audioCtx = null;
  let ambience = null;

  function ensureAudio() {
    if (state.muted) return;
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audioCtx = new Ctx();
    }
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    if (audioCtx && audioCtx.state === "running") ensureAmbience();
  }

  function beep({ type = "square", f0 = 440, f1 = null, dur = 0.08, gain = 0.06 }) {
    if (state.muted) return;
    ensureAudio();
    if (!audioCtx || audioCtx.state !== "running") return;

    const t0 = audioCtx.currentTime;
    const t1 = t0 + dur;

    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();

    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 !== null) o.frequency.linearRampToValueAtTime(f1, t1);

    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + Math.min(0.02, dur * 0.4));
    g.gain.exponentialRampToValueAtTime(0.0001, t1);

    o.connect(g);
    g.connect(audioCtx.destination);
    o.start(t0);
    o.stop(t1 + 0.01);
  }

  function noisePop({ dur = 0.07, gain = 0.045 }) {
    if (state.muted) return;
    ensureAudio();
    if (!audioCtx || audioCtx.state !== "running") return;

    const t0 = audioCtx.currentTime;
    const t1 = t0 + dur;

    const bufferSize = Math.floor(audioCtx.sampleRate * dur);
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);

    const src = audioCtx.createBufferSource();
    src.buffer = buffer;

    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t1);

    src.connect(g);
    g.connect(audioCtx.destination);
    src.start(t0);
    src.stop(t1 + 0.01);
  }

  const SFX = {
    tick: () => beep({ type: "square", f0: 740, f1: 640, dur: 0.04, gain: 0.04 }),
    start: () => beep({ type: "triangle", f0: 520, f1: 780, dur: 0.09, gain: 0.06 }),
    jump: () => beep({ type: "square", f0: 520, f1: 880, dur: 0.07, gain: 0.06 }),
    open: () => beep({ type: "sawtooth", f0: 180, f1: 120, dur: 0.09, gain: 0.05 }),
    decoy: () => noisePop({ dur: 0.06, gain: 0.04 }),
    collect: () => {
      beep({ type: "triangle", f0: 880, f1: 1320, dur: 0.07, gain: 0.06 });
      setTimeout(() => beep({ type: "triangle", f0: 1320, f1: 1760, dur: 0.05, gain: 0.05 }), 30);
    },
    throw: () => beep({ type: "triangle", f0: 420, f1: 620, dur: 0.06, gain: 0.05 }),
    swish: () => beep({ type: "triangle", f0: 980, f1: 1680, dur: 0.10, gain: 0.06 }),
  };

  function ensureAmbience() {
    if (state.muted) {
      stopAmbience();
      return;
    }
    if (!audioCtx || audioCtx.state !== "running") return;
    if (ambience) return;

    const master = audioCtx.createGain();
    master.gain.value = 0.020;

    const dur = 2.0;
    const size = Math.floor(audioCtx.sampleRate * dur);
    const buf = audioCtx.createBuffer(1, size, audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < size; i++) d[i] = (Math.random() * 2 - 1) * 0.35;

    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    src.loop = true;

    const bp1 = audioCtx.createBiquadFilter();
    bp1.type = "bandpass";
    bp1.frequency.value = 520;
    bp1.Q.value = 0.7;

    const bp2 = audioCtx.createBiquadFilter();
    bp2.type = "bandpass";
    bp2.frequency.value = 950;
    bp2.Q.value = 0.9;

    const mix1 = audioCtx.createGain();
    mix1.gain.value = 0.55;
    const mix2 = audioCtx.createGain();
    mix2.gain.value = 0.45;

    const lfo = audioCtx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.22;

    const lfoGain = audioCtx.createGain();
    lfoGain.gain.value = 0.012;
    lfo.connect(lfoGain);

    const amp = audioCtx.createGain();
    amp.gain.value = 0.035;
    lfoGain.connect(amp.gain);

    const comp = audioCtx.createDynamicsCompressor();
    comp.threshold.value = -28;
    comp.ratio.value = 6;

    src.connect(bp1);
    src.connect(bp2);
    bp1.connect(mix1);
    bp2.connect(mix2);
    mix1.connect(amp);
    mix2.connect(amp);
    amp.connect(comp);
    comp.connect(master);
    master.connect(audioCtx.destination);

    lfo.start();
    src.start();

    ambience = { master, src, lfo };
  }

  function stopAmbience() {
    if (!ambience) return;
    try {
      ambience.master.gain.setTargetAtTime(0.0001, audioCtx.currentTime, 0.05);
      ambience.src.stop(audioCtx.currentTime + 0.12);
      ambience.lfo.stop(audioCtx.currentTime + 0.12);
    } catch {}
    ambience = null;
  }

  // -------------------- Bright arcade chibi palette --------------------
  const CHAR_STYLE = {
    Holli: { skin: "#FFD2B5", hair: "#F2D16B", shirt: "#3EE6C1", pants: "#2B2B2B" },
    Emily: { skin: "#FFD2B5", hair: "#6B3B2A", shirt: "#FF5EA8", pants: "#2B2B2B" },
    Devin: { skin: "#FFD2B5", hair: "#5B3A2A", shirt: "#4DA3FF", pants: "#2B2B2B" },
    Brandon: { skin: "#FFD2B5", hair: "#A87A4D", shirt: "#8E6BFF", pants: "#2B2B2B" },
    Colleen: { skin: "#FFD2B5", hair: "#FF6B6B", shirt: "#FFD24D", pants: "#2B2B2B" },
    Melissa: { skin: "#FFD2B5", hair: "#6B3B2A", shirt: "#6BFF7A", pants: "#2B2B2B" },
  };

  // -------------------- Level 1 data --------------------
  const PHYS = { gravity: 1800, jumpV: 640, moveSpeed: 260 };

  const player = {
    x: 140,
    y: 0,
    w: 30,
    h: 40,
    vx: 0,
    vy: 0,
    onGround: false,
    facing: 1,
    style: CHAR_STYLE.Holli,
  };

  const L1 = {
    camX: 0,
    speed: 220,
    score: 0,
    phase: "carrot",      // carrot -> shot -> colouring
    timeInLevel: 0,
    phaseStartT: 0,
    levelDone: false,

    // Phase 1
    boxes: [],
    carrots: [],
    nextBoxX: 360,

    // Phase 2
    shots: [],
    shotHits: 0,
    shotAttempts: 0,
    shotCooldown: 0,
    cup: { x: 0, y: 0, w: 30, h: 18 },

    // Phase 3
    colouring: {
      progress: 0,
      target: 100,
      zones: [],
      done: false,
    },
  };

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function resetLevel1() {
    L1.camX = 0;
    L1.score = 0;
    L1.phase = "carrot";
    L1.timeInLevel = 0;
    L1.phaseStartT = 0;
    L1.levelDone = false;

    L1.boxes = [];
    L1.carrots = [];
    L1.nextBoxX = 360;

    L1.shots = [];
    L1.shotHits = 0;
    L1.shotAttempts = 0;
    L1.shotCooldown = 0;
    L1.cup = { x: VIEW.gw - 92, y: 96, w: 30, h: 18 };

    L1.colouring.progress = 0;
    L1.colouring.target = 100;
    L1.colouring.zones = [];
    L1.colouring.done = false;

    player.x = 140;
    player.y = 0;
    player.vx = 0;
    player.vy = 0;
    player.onGround = false;
    player.facing = 1;
  }

  function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  // -------------------- Phase 1: Carrot in a Box --------------------
  function spawnBoxesAhead(floorY) {
    const spawnToX = L1.camX + VIEW.gw + 240;
    while (L1.nextBoxX < spawnToX) {
      const w = 52 + Math.floor(Math.random() * 18);
      const h = 32 + Math.floor(Math.random() * 12);
      const x = L1.nextBoxX;     // world x
      const y = floorY - h;      // screen y

      const decoy = Math.random() < 0.20;
      const hasCarrot = !decoy && Math.random() < 0.30;

      L1.boxes.push({ x, y, w, h, opened: false, decoy, hasCarrot });
      L1.nextBoxX += 140 + Math.floor(Math.random() * 140);
    }
  }

  function tryOpenBox(box) {
    if (box.opened) return;
    box.opened = true;

    if (box.decoy) {
      SFX.decoy();
      return;
    }

    SFX.open();

    if (box.hasCarrot) {
      L1.carrots.push({
        x: box.x + box.w / 2 - 8, // world x
        y: box.y - 10,            // screen y
        w: 16,
        h: 12,
        vy: -420,
        alive: true,
      });
      box.hasCarrot = false;
    }
  }

  function updateCarrots(dt, floorY) {
    for (const c of L1.carrots) {
      if (!c.alive) continue;

      c.vy += 1400 * dt;
      c.y += c.vy * dt;

      if (c.y > floorY + 200) c.alive = false;

      const cx = c.x - L1.camX;
      if (rectsOverlap(player.x, player.y, player.w, player.h, cx, c.y, c.w, c.h)) {
        c.alive = false;
        L1.score += 100;
        SFX.collect();
      }
    }
    L1.carrots = L1.carrots.filter(c => c.alive);
  }

  // -------------------- Phase 2: Impossible Shot --------------------
  function initShotPhase() {
    L1.phase = "shot";
    L1.phaseStartT = L1.timeInLevel;

    L1.shots = [];
    L1.shotHits = 0;
    L1.shotAttempts = 0;
    L1.shotCooldown = 0;

    // Cup lower than before so it doesn’t overlap HUD
    L1.cup = { x: VIEW.gw - 92, y: 96, w: 30, h: 18 };
  }

  function fireShot() {
    if (L1.phase !== "shot") return;
    if (L1.shotCooldown > 0) return;

    L1.shotAttempts += 1;
    L1.shotCooldown = 0.28;

    const startX = player.x + player.w - 6;
    const startY = player.y + 10;

    // Target (used only to compute distance)
    const targetX = L1.cup.x + L1.cup.w * 0.5;
    const dx = targetX - startX;

    // Skill shot “sweet spot”
    const sweet = 380;
    const err = dx - sweet;

    // Base speeds
    let vx = clamp(520 + (dx - sweet) * 0.55, 360, 780);
    let vy = -680 - (err * 0.45);

    // Randomness (creates “about half the time” from sweet spot)
    vx += (Math.random() * 2 - 1) * 70;
    vy += (Math.random() * 2 - 1) * 110;

    // Keep within sane bounds so it never becomes impossible
    vx = clamp(vx, 340, 820);
    vy = clamp(vy, -980, -420);

    L1.shots.push({ x: startX, y: startY, vx, vy, r: 4, alive: true });
    SFX.throw();
  }

  function updateShots(dt) {
    const g = 1100;

    // gentle wiggle around y=96
    L1.cup.y = 96 + Math.round(Math.sin(state.t * 2.2) * 4);

    for (const b of L1.shots) {
      if (!b.alive) continue;

      b.vy += g * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      // forgiving but not huge
      const pad = 4;
      if (
        rectsOverlap(
          b.x - b.r, b.y - b.r, b.r * 2, b.r * 2,
          L1.cup.x - pad, L1.cup.y - pad, L1.cup.w + pad * 2, L1.cup.h + pad * 2
        )
      ) {
        b.alive = false;
        L1.shotHits += 1;
        L1.score += 250;
        SFX.swish();
      }

      if (b.x < -40 || b.x > VIEW.gw + 60 || b.y > VIEW.gh + 60) b.alive = false;
    }

    L1.shots = L1.shots.filter(s => s.alive);
    if (L1.shotCooldown > 0) L1.shotCooldown -= dt;
  }

  // -------------------- Phase 3: Christmas Colouring --------------------
  function initColouringPhase() {
  L1.phase = "colouring";
  L1.phaseStartT = L1.timeInLevel;
  L1.levelDone = false;

  const floorY = VIEW.gh * 0.78;

  // A “colouring page” made of fillable squares ON THE FLOOR
  const cols = 12;
  const rows = 6;
  const cell = 18;

  const pageW = cols * cell;
  const pageH = rows * cell;

  // Put it low enough to step on, and within the player's movement band
  const startX = Math.round(VIEW.gw * 0.40 - pageW / 2);
  const startY = Math.round(floorY - pageH - 10);

  const zones = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const isBorder = r === 0 || r === rows - 1 || c === 0 || c === cols - 1;
      if (isBorder && Math.random() < 0.35) continue;

      zones.push({
        x: startX + c * cell,
        y: startY + r * cell,
        w: cell - 2,
        h: cell - 2,
        filled: false,
      });
    }
  }

  L1.colouring.zones = zones;
  L1.colouring.progress = 0;
  L1.colouring.target = Math.max(16, Math.floor(zones.length * 0.70)); // slightly easier since it's on the floor
  L1.colouring.done = false;
}
  
  // -------------------- Update --------------------
  function updateLevel1(dt) {
    const floorY = VIEW.gh * 0.78;

    L1.timeInLevel += dt;

    // Phase transitions
    if (L1.phase === "carrot" && L1.timeInLevel > 40) {
      initShotPhase();
    }
    if (L1.phase === "shot" && (L1.timeInLevel - L1.phaseStartT) > 30) {
      initColouringPhase();
    }

    // Camera scroll only in carrot phase
    if (L1.phase === "carrot") L1.camX += L1.speed * dt;

    // Movement input
    const left = touch.left || keys.has("ArrowLeft") || keys.has("a") || keys.has("A");
    const right = touch.right || keys.has("ArrowRight") || keys.has("d") || keys.has("D");

    player.vx = 0;
    if (left) player.vx -= PHYS.moveSpeed;
    if (right) player.vx += PHYS.moveSpeed;

    if (player.vx < -5) player.facing = -1;
    else if (player.vx > 5) player.facing = 1;

    // horizontal
    player.x = clamp(player.x + player.vx * dt, 60, VIEW.gw * 0.55);

    // vertical physics
    const prevY = player.y;
    player.vy += PHYS.gravity * dt;
    player.y += player.vy * dt;

    // floor
    if (player.y + player.h >= floorY) {
      player.y = floorY - player.h;
      player.vy = 0;
      player.onGround = true;
    } else {
      player.onGround = false;
    }

    // Phase-specific mechanics
    if (L1.phase === "carrot") {
      spawnBoxesAhead(floorY);
      updateCarrots(dt, floorY);

      // land on boxes to open
      for (const box of L1.boxes) {
        const sx = box.x - L1.camX;
        if (sx < -160 || sx > VIEW.gw + 160) continue;

        const falling = player.vy >= 0;
        const overlap = rectsOverlap(player.x, player.y, player.w, player.h, sx, box.y, box.w, box.h);
        const cameFromAbove = (prevY + player.h) <= (box.y + 8);

        if (falling && overlap && cameFromAbove) {
          player.y = box.y - player.h;
          player.vy = 0;
          player.onGround = true;
          tryOpenBox(box);
        }
      }

      // prune old
      L1.boxes = L1.boxes.filter(b => b.x > L1.camX - 320);
    }

    if (L1.phase === "shot") {
      // keep grounded for throwing
      player.y = floorY - player.h;
      player.vy = 0;
      player.onGround = true;

      updateShots(dt);
    }

    if (L1.phase === "colouring") {
      // Allow normal jump physics in colouring (do NOT force y to the floor)

      for (const z of L1.colouring.zones) {
        if (z.filled) continue;
        if (rectsOverlap(player.x, player.y, player.w, player.h, z.x, z.y, z.w, z.h)) {
          z.filled = true;
          L1.colouring.progress += 1;
          if ((L1.colouring.progress % 3) === 0) SFX.tick();
        }
      }

      if (!L1.colouring.done && L1.colouring.progress >= L1.colouring.target) {
        L1.colouring.done = true;
        L1.levelDone = true;
        L1.score += 500;
        SFX.swish();
      }
    }

    // small baseline score
    L1.score += Math.floor(dt * 2);
  }

  // -------------------- Draw helpers --------------------
  function clearScreen() {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, state.w, state.h);
  }

  function drawPixelRect(x, y, w, h, c) {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  function drawCenteredText(text, y, size = 28, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#fff";
    ctx.font = `700 ${size}px system-ui, Arial`;
    ctx.textAlign = "center";
    ctx.fillText(text, VIEW.gw / 2, y);
    ctx.restore();
  }

  function drawChibiPlayer() {
    const st = player.style || CHAR_STYLE.Holli;
    const speedMag = Math.min(1, Math.abs(player.vx) / PHYS.moveSpeed);
    const bob = Math.round(Math.sin(state.t * 14) * 2 * speedMag);

    const px = Math.round(player.x);
    const py = Math.round(player.y + bob);

    const headW = 18, headH = 16;
    const bodyW = 18, bodyH = 14;

    const cx = px + Math.round((player.w - headW) / 2);
    const headY = py + 2;
    const bodyY = headY + headH;
    const legY = bodyY + bodyH;

    // shadow
    drawPixelRect(px + 6, py + player.h - 3, player.w - 12, 3, "rgba(0,0,0,0.25)");

    // head + hair
    drawPixelRect(cx, headY, headW, headH, st.skin);
    drawPixelRect(cx, headY, headW, 6, st.hair);

    // eyes
    const eyeY = headY + 8;
    if (player.facing === 1) {
      drawPixelRect(cx + 10, eyeY, 2, 2, "#1A1A1A");
      drawPixelRect(cx + 13, eyeY, 2, 2, "#1A1A1A");
    } else {
      drawPixelRect(cx + 3, eyeY, 2, 2, "#1A1A1A");
      drawPixelRect(cx + 6, eyeY, 2, 2, "#1A1A1A");
    }

    // body
    const bx = px + Math.round((player.w - bodyW) / 2);
    drawPixelRect(bx, bodyY, bodyW, bodyH, st.shirt);
    drawPixelRect(bx, bodyY + bodyH - 4, bodyW, 4, st.pants);

    // legs
    const step = Math.round(Math.sin(state.t * 14) * 2 * speedMag);
    drawPixelRect(bx + 2, legY + Math.max(0, -step), 6, 9, st.pants);
    drawPixelRect(bx + bodyW - 8, legY + Math.max(0, step), 6, 9, st.pants);
  }

  function drawCarrot(cx, y) {
    const x = Math.round(cx);
    const yy = Math.round(y);
    drawPixelRect(x + 6, yy + 0, 4, 2, "#3CFF74");
    drawPixelRect(x + 5, yy + 2, 6, 2, "#2FE35F");
    drawPixelRect(x + 4, yy + 4, 8, 2, "#FF8A2A");
    drawPixelRect(x + 5, yy + 6, 6, 2, "#FF7A1A");
    drawPixelRect(x + 6, yy + 8, 4, 2, "#FF6A0A");
    drawPixelRect(x + 7, yy + 10, 2, 2, "#FF5A00");
  }

  function drawCrate(x, y, w, h, opened, decoy) {
    const base = opened ? "rgba(255,214,120,0.25)" : "#FFB74A";
    const dark = opened ? "rgba(120,70,10,0.20)" : "#B86A12";
    drawPixelRect(x, y, w, h, base);
    for (let i = 1; i <= 3; i++) {
      const yy = y + (h * i) / 4;
      drawPixelRect(x + 6, yy - 2, w - 12, 3, dark);
    }
    if (opened && decoy) drawPixelRect(x + w / 2 - 10, y + h / 2 - 2, 20, 4, "rgba(0,0,0,0.25)");
  }

  function drawCup() {
    const c = L1.cup;
    drawPixelRect(c.x, c.y, c.w, c.h, "rgba(255,255,255,0.88)");
    drawPixelRect(c.x + 3, c.y + 3, c.w - 6, c.h - 6, "rgba(0,0,0,0.35)");
    drawPixelRect(c.x - 2, c.y - 2, c.w + 4, 3, "rgba(255,255,255,0.92)");
  }

  function drawBall(b) {
    drawPixelRect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2, "rgba(255,255,255,0.92)");
  }

  // -------------------- Screens --------------------
  function drawTitle() {
    drawCenteredText("A Very Trojan Christmas", VIEW.gh * 0.35, 34);
    drawCenteredText("Tap / Press Enter to start", VIEW.gh * 0.45, 18, 0.85);
  }

  function drawSelect() {
    drawCenteredText("Choose Your Character", VIEW.gh * 0.18, 28);
    const c = state.chars[state.selected];
    drawCenteredText(`${c.name} — ${c.tag}`, VIEW.gh * 0.26, 16, 0.9);

    const midY = VIEW.gh * 0.55;
    const spacing = 140;
    const totalW = spacing * (state.chars.length - 1);
    const startX = Math.round(VIEW.gw / 2 - totalW / 2);

    for (let i = 0; i < state.chars.length; i++) {
      const x = startX + i * spacing;
      const y = Math.round(midY - 26);
      const isSel = i === state.selected;

      if (isSel) drawPixelRect(x - 6, y - 6, 60, 64, "rgba(255,255,255,0.22)");

      const st = CHAR_STYLE[state.chars[i].name] || CHAR_STYLE.Holli;
      drawPixelRect(x, y, 48, 52, "rgba(255,255,255,0.18)");
      drawPixelRect(x + 2, y + 2, 44, 48, "rgba(0,0,0,0.45)");
      drawPixelRect(x + 14, y + 10, 20, 16, st.skin);
      drawPixelRect(x + 14, y + 10, 20, 6, st.hair);
      drawPixelRect(x + 20, y + 18, 2, 2, "#1A1A1A");
      drawPixelRect(x + 26, y + 18, 2, 2, "#1A1A1A");
      drawPixelRect(x + 14, y + 28, 20, 14, st.shirt);
      drawPixelRect(x + 14, y + 38, 20, 4, st.pants);

      ctx.fillStyle = isSel ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.65)";
      ctx.font = `700 ${isSel ? 13 : 12}px system-ui, Arial`;
      ctx.textAlign = "center";
      ctx.fillText(state.chars[i].name, x + 24, y + 70);
    }

    drawCenteredText("← / → to choose • Enter to play", VIEW.gh * 0.85, 16, 0.85);
    drawCenteredText("Tap left/right to choose • Tap center to play", VIEW.gh * 0.90, 14, 0.6);
  }

  function drawLevel1() {
    const floorY = VIEW.gh * 0.78;

    // background
    ctx.fillStyle = "#06101A";
    ctx.fillRect(0, 0, VIEW.gw, VIEW.gh);

    // floor
    drawPixelRect(0, floorY, VIEW.gw, VIEW.gh - floorY, "rgba(255,255,255,0.10)");

    if (L1.phase === "carrot") {
      for (const box of L1.boxes) {
        const x = box.x - L1.camX;
        if (x < -160 || x > VIEW.gw + 160) continue;
        drawCrate(x, box.y, box.w, box.h, box.opened, box.decoy);
      }
      for (const c of L1.carrots) {
        const cx = c.x - L1.camX;
        drawCarrot(cx, c.y);
      }
    }

    if (L1.phase === "shot") {
      drawCup();
      for (const b of L1.shots) drawBall(b);
    }

    if (L1.phase === "colouring") {
      // page frame
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.fillRect(VIEW.gw * 0.58 - 140, VIEW.gh * 0.46 - 90, 280, 180);

      for (const z of L1.colouring.zones) {
        ctx.fillStyle = z.filled ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.18)";
        ctx.fillRect(z.x, z.y, z.w, z.h);
      }

      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.font = "800 14px system-ui, Arial";
      ctx.textAlign = "center";
      ctx.fillText("Christmas Colouring — fill squares by walking over them!", VIEW.gw / 2, VIEW.gh * 0.18);
    }

    // player
    drawChibiPlayer();

    // HUD
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.font = "700 16px system-ui, Arial";
    ctx.textAlign = "left";
    ctx.fillText(`Level 1 — Hallway Hustle`, 16, 38);
    ctx.fillText(`Phase: ${L1.phase}`, 16, 60);
    ctx.fillText(`Score: ${L1.score}`, 16, 82);

    ctx.textAlign = "right";
    ctx.fillText(`Back: Esc`, VIEW.gw - 16, 38);

    ctx.font = "700 13px system-ui, Arial";
    ctx.fillStyle = "rgba(255,255,255,0.70)";
    ctx.textAlign = "right";
    if (L1.phase === "carrot") {
      ctx.fillText(`Phone: hold left/right • tap middle to jump`, VIEW.gw - 16, 60);
    } else if (L1.phase === "shot") {
      ctx.fillText(`Laptop: Enter to throw • Phone: tap top-right to throw`, VIEW.gw - 16, 60);
      ctx.fillText(`Hits: ${L1.shotHits} / Attempts: ${L1.shotAttempts}`, VIEW.gw - 16, 82);
    } else if (L1.phase === "colouring") {
      ctx.fillText(`Move to colour • Fill: ${L1.colouring.progress}/${L1.colouring.target}`, VIEW.gw - 16, 82);
    }

    // Level complete overlay
    if (L1.levelDone) {
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, 0, VIEW.gw, VIEW.gh);

      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.textAlign = "center";
      ctx.font = "900 28px system-ui, Arial";
      ctx.fillText("LEVEL 1 COMPLETE!", VIEW.gw / 2, VIEW.gh * 0.42);

      ctx.font = "800 16px system-ui, Arial";
      ctx.fillText("Nice work — more levels coming soon.", VIEW.gw / 2, VIEW.gh * 0.50);

      ctx.font = "700 13px system-ui, Arial";
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.fillText("Press Esc to return to Character Select", VIEW.gw / 2, VIEW.gh * 0.58);
    }
  }

  // -------------------- Keyboard controls --------------------
  window.addEventListener("keydown", (e) => {
    ensureAudio();
    keys.add(e.key);

    if (state.screen === "title" && (e.key === "Enter" || e.key === " ")) {
      state.screen = "select";
      SFX.start();
    }

    if (state.screen === "select") {
      if (e.key === "ArrowLeft") { state.selected = (state.selected + state.chars.length - 1) % state.chars.length; SFX.tick(); }
      if (e.key === "ArrowRight") { state.selected = (state.selected + 1) % state.chars.length; SFX.tick(); }
      if (e.key === "Enter" || e.key === " ") {
        const name = state.chars[state.selected].name;
        player.style = CHAR_STYLE[name] || CHAR_STYLE.Holli;
        resetLevel1();
        state.screen = "level1";
        SFX.start();
      }
    }

    if (state.screen === "level1") {
      // Jump only in carrot and colouring phases
      if (
        (L1.phase === "carrot" || L1.phase === "colouring") &&
        (e.key === " " || e.key === "ArrowUp" || e.key === "w" || e.key === "W") &&
        player.onGround
      ) {
        player.vy = -PHYS.jumpV;
        player.onGround = false;
        SFX.jump();
      }

      // Throw in shot phase
      if (L1.phase === "shot" && e.key === "Enter") {
        fireShot();
      }

      if (e.key === "Escape") {
        state.screen = "select";
        resetLevel1();
        SFX.tick();
      }
      if (e.key === "r" || e.key === "R") {
        resetLevel1();
        SFX.tick();
      }
    }
  });

  window.addEventListener("keyup", (e) => keys.delete(e.key));

  // -------------------- Touch controls --------------------
  canvas.addEventListener("pointerdown", (e) => {
    ensureAudio();
    const { gx, gy } = screenToGame(e.clientX, e.clientY);
    if (!inGameBounds(gx, gy)) return;

    if (state.screen === "title") {
      state.screen = "select";
      SFX.start();
      return;
    }

    if (state.screen === "select") {
      if (gx < VIEW.gw * 0.33) { state.selected = (state.selected + state.chars.length - 1) % state.chars.length; SFX.tick(); }
      else if (gx > VIEW.gw * 0.66) { state.selected = (state.selected + 1) % state.chars.length; SFX.tick(); }
      else {
        const name = state.chars[state.selected].name;
        player.style = CHAR_STYLE[name] || CHAR_STYLE.Holli;
        resetLevel1();
        state.screen = "level1";
        SFX.start();
      }
      return;
    }

    if (state.screen === "level1") {
      if (L1.phase === "carrot" || L1.phase === "colouring") {
        // middle tap to jump
        if (gx >= VIEW.gw * 0.33 && gx <= VIEW.gw * 0.66) {
          if (player.onGround) { player.vy = -PHYS.jumpV; player.onGround = false; SFX.jump(); }
          clearTouch();
        } else {
          setTouchFromGX(gx);
        }
      } else if (L1.phase === "shot") {
        // top-right tap to throw
        if (gx > VIEW.gw * 0.66 && gy < VIEW.gh * 0.35) {
          fireShot();
        } else {
          setTouchFromGX(gx);
        }
      } else {
        // colouring: movement only
        setTouchFromGX(gx);
      }
    }
  });

  canvas.addEventListener("pointermove", (e) => {
    if (state.screen !== "level1") return;
    if (e.buttons !== 1) return;
    const { gx, gy } = screenToGame(e.clientX, e.clientY);
    if (!inGameBounds(gx, gy)) return;
    setTouchFromGX(gx);
  });

  canvas.addEventListener("pointerup", clearTouch);
  canvas.addEventListener("pointercancel", clearTouch);
  canvas.addEventListener("pointerleave", clearTouch);

  // -------------------- Main loop --------------------
  let lastTs = 0;
  function loop(ts) {
    const now = ts / 1000;
    const dt = lastTs ? Math.min(0.033, now - lastTs) : 0;
    lastTs = now;
    state.t = now;

    clearScreen();

    // draw in letterboxed game space
    ctx.save();
    ctx.translate(VIEW.ox, VIEW.oy);
    ctx.scale(VIEW.scale, VIEW.scale);

    if (state.screen === "title") drawTitle();
    else if (state.screen === "select") drawSelect();
    else if (state.screen === "level1") {
      updateLevel1(dt);
      drawLevel1();
    }

    ctx.restore();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // -------------------- HUD: mute button + toast --------------------
  const muteBtn = document.getElementById("muteBtn");
  muteBtn.addEventListener("click", () => {
    state.muted = !state.muted;
    muteBtn.textContent = state.muted ? "Sound: Off" : "Sound: On";
    toast(state.muted ? "Muted" : "Sound on");
    if (!state.muted) {
      ensureAudio();
      ensureAmbience();
    } else {
      stopAmbience();
    }
  });

  function toast(msg) {
    const el = document.getElementById("toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 900);
  }
})();
