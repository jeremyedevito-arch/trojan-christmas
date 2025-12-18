(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  // -------------------- Global state --------------------
  const state = {
    w: 0,
    h: 0,
    t: 0,
    muted: false,
    screen: "title", // title -> select -> level1 -> level2
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

  
  function getCharName() {
    return (state.chars[state.selected] && state.chars[state.selected].name) ? state.chars[state.selected].name : "Holli";
  }
  function isChar(name) { return getCharName() === name; }
// -------------------- Letterbox view (16:9) + phone zoom --------------------
  let VIEW = { gw: 960, gh: 540, scale: 1, ox: 0, oy: 0 };

  function computeView() {
    VIEW.scale = Math.min(state.w / VIEW.gw, state.h / VIEW.gh);
    VIEW.ox = (state.w - VIEW.gw * VIEW.scale) / 2;
    VIEW.oy = (state.h - VIEW.gh * VIEW.scale) / 2;
  }

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;

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
    shutter: () => noisePop({ dur: 0.05, gain: 0.05 }),
    dingding: () => {
      beep({ type: "triangle", f0: 1040, f1: 1480, dur: 0.10, gain: 0.07 });
      setTimeout(() => beep({ type: "triangle", f0: 1240, f1: 1760, dur: 0.10, gain: 0.07 }), 120);
    },
    jingle: () => {
      // light seasonal jingle (bells-ish)
      beep({ type: "triangle", f0: 880, f1: 1320, dur: 0.09, gain: 0.05 });
      setTimeout(() => beep({ type: "triangle", f0: 990, f1: 1480, dur: 0.09, gain: 0.05 }), 110);
    },
  };

  function ensureAmbience() {
    if (state.muted) {
      stopAmbience();
      return;
    }
    if (!audioCtx || audioCtx.state !== "running") return;
    if (ambience) return;

    const master = audioCtx.createGain();
    master.gain.value = 0.018;

    const dur = 2.0;
    const size = Math.floor(audioCtx.sampleRate * dur);
    const buf = audioCtx.createBuffer(1, size, audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < size; i++) d[i] = (Math.random() * 2 - 1) * 0.30;

    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    src.loop = true;

    const bp1 = audioCtx.createBiquadFilter();
    bp1.type = "bandpass";
    bp1.frequency.value = 420;
    bp1.Q.value = 0.7;

    const bp2 = audioCtx.createBiquadFilter();
    bp2.type = "bandpass";
    bp2.frequency.value = 820;
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
    amp.gain.value = 0.033;
    lfoGain.connect(amp.gain);

    const comp = audioCtx.createDynamicsCompressor();
    comp.threshold.value = -30;
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

  // -------------------- Shared physics + player --------------------
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

  // FX
  const FX = {
    confetti: [],
    flashT: 0,
    sparkles: [],
  };

  function spawnSparkles(x, y, n = 10) {
    for (let i = 0; i < n; i++) {
      FX.sparkles.push({
        x: x + (Math.random() * 16 - 8),
        y: y + (Math.random() * 12 - 6),
        vx: (Math.random() * 2 - 1) * 130,
        vy: -60 - Math.random() * 160,
        g: 680 + Math.random() * 260,
        life: 0.45 + Math.random() * 0.25,
        s: 2 + Math.floor(Math.random() * 2),
        c: Math.random() < 0.5 ? "rgba(255,255,255,0.95)" : (Math.random() < 0.5 ? "#FFD24D" : "#FF5EA8"),
      });
    }
  }

  function spawnConfettiBurst() {
    const cx = VIEW.gw * 0.50;
    const cy = VIEW.gh * 0.35;
    for (let i = 0; i < 90; i++) {
      FX.confetti.push({
        x: cx + (Math.random() * 80 - 40),
        y: cy + (Math.random() * 40 - 20),
        vx: (Math.random() * 2 - 1) * 260,
        vy: -120 - Math.random() * 340,
        g: 820 + Math.random() * 400,
        life: 1.6 + Math.random() * 0.8,
        t: 0,
        s: 3 + Math.floor(Math.random() * 3),
        c: Math.random() < 0.33 ? "rgba(255,255,255,0.92)" : (Math.random() < 0.5 ? "#FF5EA8" : "#6BFF7A"),
      });
    }
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  // -------------------- Level 1 state (UNCHANGED gameplay) --------------------
  const L1 = {
    camX: 0,
    speed: 220,
    score: 0,
    phase: "carrot",
    timeInLevel: 0,
    phaseStartT: 0,
    levelDone: false,

    bannerT: 0,
    bannerText: "",

    boxes: [],
    carrots: [],
    nextBoxX: 360,

    shots: [],
    shotHits: 0,
    shotAttempts: 0,
    shotCooldown: 0,
    cup: { x: 0, y: 0, w: 30, h: 18 },

    colouring: {
      progress: 0,
      target: 0,
      zones: [],
      done: false,
      lateSpawned: 0,
      lateCap: 10,
    },

    jamie: { x: 210, dir: 1, speed: 24, clipT: 0 },
    lateIcons: [],
    nextLateT: 1.2,


    // NEW: Shelley Gingras speed boost (Phase A/B only)
    shelley: { x: 260, dir: 1, speed: 36, cd: 0 },
    boostT: 0,
    accBoostT: 0,
    perfectAccT: 0,
    boostLevel: 1,

    // NEW: March Hare (Phase A only)
    hare: { active: false, t: 3.5, x: 0, y: 0, vx: 0, seed: 0 },

    michelle: { active: false, x: 0, t: 0 },
    nextMichelleT: 6.0,
    posers: [],

    walkers: [],
    nextWalkerT: 1.0,

    posterSeed: 0,
  };

  function showPhaseBanner(text) {
    L1.bannerText = text;
    L1.bannerT = 1.35;
  }

  function resetLevel1() {
    L1.camX = 0;
    L1.score = 0;
    L1.phase = "carrot";
    L1.timeInLevel = 0;
    L1.phaseStartT = 0;
    L1.levelDone = false;

    L1.bannerT = 0;
    L1.bannerText = "";
    L1.posterSeed = Math.random() * 9999;

    L1.boxes = [];
    L1.carrots = [];
    L1.nextBoxX = 360;

    L1.shots = [];
    L1.shotHits = 0;
    L1.shotAttempts = 0;
    L1.shotCooldown = 0;
    L1.cup = { x: VIEW.gw - 92, y: 96, w: 30, h: 18 };

    L1.colouring.zones = [];
    L1.colouring.progress = 0;
    L1.colouring.target = 0;
    L1.colouring.done = false;
    L1.colouring.lateSpawned = 0;
    L1.colouring.lateCap = 10;

    L1.jamie = { x: 210, dir: 1, speed: 24, clipT: 0 };
    L1.lateIcons = [];
    L1.nextLateT = 1.2;


    // Shelley boost
    L1.shelley = { x: 260, dir: 1, speed: 36, cd: 0 };
    L1.boostT = 0;
    L1.accBoostT = 0;
    L1.perfectAccT = 0;
    L1.boostLevel = 1;

    // March Hare
    L1.hare = { active: false, t: 3.5, x: 0, y: 0, vx: 0, seed: Math.random() * 10 };

    L1.michelle = { active: false, x: 0, t: 0 };
    L1.nextMichelleT = 6.0;
    L1.posers = [];

    L1.walkers = [];
    L1.nextWalkerT = 1.0;

    FX.confetti = [];
    FX.flashT = 0;
    FX.sparkles = [];

    player.x = 140;
    player.y = 0;
    player.vx = 0;
    player.vy = 0;
    player.onGround = false;
    player.facing = 1;

    showPhaseBanner("CARROT IN A BOX!");
  }

  // -------------------- Phase 1: Carrot in a Box --------------------
  function spawnBoxesAhead(floorY) {
    const spawnToX = L1.camX + VIEW.gw + 240;
    while (L1.nextBoxX < spawnToX) {
      const w = 52 + Math.floor(Math.random() * 18);
      const h = 32 + Math.floor(Math.random() * 12);
      const x = L1.nextBoxX;
      const y = floorY - h;

      const decoy = Math.random() < 0.20;
      const hasCarrot = !decoy && Math.random() < 0.30;

      L1.boxes.push({ x, y, w, h, opened: false, decoy, hasCarrot });
      L1.nextBoxX += 140 + Math.floor(Math.random() * 140);
    }
  }

  function tryOpenBox(box) {
    if (box.opened) return;
    box.opened = true;

    if (box.decoy) { SFX.decoy(); return; }
    SFX.open();

    if (box.hasCarrot) {
      L1.carrots.push({
        x: box.x + box.w / 2 - 16,
        y: box.y - 16,
        w: 32,
        h: 24,
        scale: 2,
        collectedT: 0,
        vy: -420,
        alive: true,
      });
      box.hasCarrot = false;
    }
  }

  function updateCarrots(dt, floorY) {
    for (const c of L1.carrots) {
      if (!c.alive) continue;

      // linger after collection
      if (c.collectedT > 0) {
        c.collectedT -= dt;
        if (c.collectedT <= 0) c.alive = false;
        continue;
      }

      c.vy += 1400 * dt;
      c.y += c.vy * dt;
      if (c.y > floorY + 200) c.alive = false;

      const cx = c.x - L1.camX;
      if (rectsOverlap(player.x, player.y, player.w, player.h, cx, c.y, c.w, c.h)) {
        c.collectedT = 2.0; // stay on screen briefly
        L1.score += 100;
        SFX.collect();
        spawnSparkles(player.x + player.w * 0.5, player.y + 10, 12);
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
    L1.cup = { x: VIEW.gw - 92, y: 96, w: 30, h: 18 };
    showPhaseBanner("IMPOSSIBLE SHOT!");
  }

  function fireShot() {
    if (L1.phase !== "shot") return;
    if (L1.shotCooldown > 0) return;

    L1.shotAttempts += 1;
    L1.shotCooldown = 0.28;

    const startX = player.x + player.w - 6;
    const startY = player.y + 10;

    const targetX = L1.cup.x + L1.cup.w * 0.5;
    const dx = targetX - startX;

    const sweet = 380;
    const err = dx - sweet;

    let vx = clamp(520 + (dx - sweet) * 0.55, 360, 780);
    let vy = -680 - (err * 0.45);

    if (L1.perfectAccT && L1.perfectAccT > 0) {
      // Perfect mode: direct-to-cup ballistic arc from anywhere
      const g = 1100;
      const targetX = L1.cup.x + L1.cup.w * 0.5;
      const targetY = L1.cup.y + 6;
      const dx2 = targetX - startX;
      const dy2 = targetY - startY;
      const tFly = 0.78; // comfy flight time
      vx = dx2 / tFly;
      vy = (dy2 - 0.5 * g * tFly * tFly) / tFly;
    } else {
      const acc = (L1.accBoostT && L1.accBoostT > 0) ? 0.5 : 1.0;

      vx += (Math.random() * 2 - 1) * 70 * acc;
      vy += (Math.random() * 2 - 1) * 110 * acc;
    }

    vx = clamp(vx, 340, 820);
    vy = clamp(vy, -980, -420);

    L1.shots.push({ x: startX, y: startY, vx, vy, r: 4, alive: true });
    SFX.throw();
  }

  function updateShots(dt) {
    const g = 1100;

    L1.cup.y = 96 + Math.round(Math.sin(state.t * 2.2) * 4);

    for (const b of L1.shots) {
      if (!b.alive) continue;
      b.vy += g * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      const pad = 4;
      if (
        rectsOverlap(
          b.x - b.r, b.y - b.r, b.r * 2, b.r * 2,
          L1.cup.x - pad, L1.cup.y - pad, L1.cup.w + pad * 2, L1.cup.h + pad * 2
        )
      ) {
        b.alive = false;
        L1.shotHits += 1;
        L1.score += 100;
        SFX.swish();
        spawnSparkles(L1.cup.x + L1.cup.w * 0.5, L1.cup.y + 6, 14);
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

    const cols = 12;
    const rows = 6;
    const cell = 18;

    const pageW = cols * cell;
    const pageH = rows * cell;

    const startX = Math.round(VIEW.gw * 0.40 - pageW / 2);
    const startY = Math.round(floorY - pageH - 10);

    const zones = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const isBorder = r === 0 || r === rows - 1 || c === 0 || c === cols - 1;
        if (isBorder && Math.random() < 0.35) continue;

        const designRoll = Math.random();
        const design =
          designRoll < 0.18 ? "bow" :
          designRoll < 0.36 ? "tree" :
          designRoll < 0.52 ? "snowman" :
          designRoll < 0.64 ? "star" : "solid";

        zones.push({
          x: startX + c * cell,
          y: startY + r * cell,
          w: cell - 2,
          h: cell - 2,
          filled: false,
          fill: null,
          design,
        });
      }
    }

    L1.colouring.zones = zones;
    L1.colouring.progress = 0;
    L1.colouring.target = zones.length;
    L1.colouring.done = false;
    L1.colouring.lateSpawned = 0;

    showPhaseBanner("CHRISTMAS COLOURING!");
  }

  // -------------------- NPCs (Level 1) --------------------
  function spawnLateIcon() {
    L1.lateIcons.push({
      x: 120 + Math.random() * (VIEW.gw * 0.45 - 120),
      y: 70 + Math.random() * 80,
      vy: 18 + Math.random() * 24,
      t: 0,
      alive: true,
    });
  }

  
function updateNPCs(dt) {
  const floorY = VIEW.gh * 0.78;

  // ---------------- Shelley Gingras ----------------
  // Phase A (carrot): speed boost (double for 5s, then triple if hit again while boosted)
  if (L1.phase === "carrot") {
    const sh = L1.shelley;
    sh.x += sh.dir * sh.speed * dt;
    if (sh.x < 140) { sh.x = 140; sh.dir = 1; }
    if (sh.x > VIEW.gw * 0.52) { sh.x = VIEW.gw * 0.52; sh.dir = -1; }
    if (sh.cd > 0) sh.cd -= dt;

    const shY = floorY - 44;
    if (sh.cd <= 0 && rectsOverlap(player.x, player.y, player.w, player.h, sh.x, shY, 16, 44)) {
      if (L1.boostLevel < 2) L1.boostLevel = 2;
      else if (L1.boostLevel < 3) L1.boostLevel = 3;

      L1.boostT = 5.0;
      sh.cd = 0.65;

      SFX.start();
      spawnSparkles(sh.x + 8, shY + 14, 14);
    }
  }

  // Phase B (shot): accuracy boost (+50% accuracy for 5s)
  if (L1.phase === "shot") {
    const sh = L1.shelley;
    sh.x += sh.dir * sh.speed * dt;
    if (sh.x < 140) { sh.x = 140; sh.dir = 1; }
    if (sh.x > VIEW.gw * 0.52) { sh.x = VIEW.gw * 0.52; sh.dir = -1; }
    if (sh.cd > 0) sh.cd -= dt;

    const shY = floorY - 44;
    if (sh.cd <= 0 && rectsOverlap(player.x, player.y, player.w, player.h, sh.x, shY, 16, 44)) {
      if (isChar("Brandon")) {
        L1.perfectAccT = 5.0;
        showPhaseBanner("SHELLEY: PERFECT FORM!");
      } else {
        L1.accBoostT = 5.0;
      }
      sh.cd = 0.65;

      SFX.start();
      spawnSparkles(sh.x + 8, shY + 14, 14);
    }
  }

  // ---------------- March Hare (Phase A only) ----------------
  if (L1.phase === "carrot") {
    const h = L1.hare;

    if (!h.active) {
      h.t -= dt;
      if (h.t <= 0) {
        h.active = true;
        h.seed = Math.random() * 10;
        h.x = L1.camX + VIEW.gw + 80 + Math.random() * 220;
        h.y = floorY - 36;
        if (isChar("Holli")) {
          // Holli is so calm the March Hare parks itself mid-screen and waits to be collected.
          h._screenLock = true;
          h.vx = 0;
          h.x = L1.camX + VIEW.gw * 0.5;
        } else {
          h.vx = -(360 + Math.random() * 180); // fast + elusive
        }
      }
    } else {
      if (isChar("Holli")) {
        // Stay locked in the middle of the screen so Holli can simply walk up and collect.
        h.x = L1.camX + VIEW.gw * 0.5;
      } else {
        h.x += h.vx * dt;
      }

      const sx = h.x - L1.camX;
      const visible = isChar("Holli") ? true : (Math.sin(state.t * 18 + h.seed) > -0.15); // flicker

      // Only "catch" when visible to keep the appear/disappear feel fair
      if (visible && rectsOverlap(player.x, player.y, player.w, player.h, sx, h.y, 22, 16)) {
        h.active = false;
        h._screenLock = false;
        h.t = 7 + Math.random() * 6; // gone for a bit
        L1.score += 300;
        SFX.dingding();
        spawnSparkles(player.x + player.w * 0.5, player.y + 10, 18);
        spawnConfettiBurst();
      }

      if (sx < -140) {
        h.active = false;
        h._screenLock = false;
        h.t = 4 + Math.random() * 4;
      }
    }
  } else {
    // keep it from lingering into other phases
    if (L1.hare) L1.hare.active = false;
  }

  // ---------------- Jamie + late slips (Phase 3 only) ----------------
  if (L1.phase === "colouring") {
    const j = L1.jamie;
    j.x += j.dir * j.speed * dt;
    if (j.x < 120) { j.x = 120; j.dir = 1; }
    if (j.x > VIEW.gw * 0.50) { j.x = VIEW.gw * 0.50; j.dir = -1; }
    if (j.clipT > 0) j.clipT -= dt;

    // Late slips: ONLY spawn/collect during colouring, capped at 10
    L1.nextLateT -= dt;
    if (L1.nextLateT <= 0) {
      const capReached = (L1.colouring.lateSpawned >= L1.colouring.lateCap);
      if (!capReached) {
        L1.nextLateT = 0.9 + Math.random() * 0.9;
        spawnLateIcon();
        L1.colouring.lateSpawned += 1;
      } else {
        L1.nextLateT = 9999;
      }
    }

    for (const ic of L1.lateIcons) {
      ic.t += dt;
      ic.y += ic.vy * dt;
      if (ic.y > floorY - 40) ic.vy = -Math.abs(ic.vy) * 0.25;

      if (rectsOverlap(player.x, player.y, player.w, player.h, ic.x, ic.y, 12, 14)) {
        ic.alive = false;
        L1.score += 60;
        j.clipT = 0.45;
        SFX.tick();
        spawnSparkles(player.x + player.w * 0.5, player.y + 10, 10);
      }
      if (ic.t > 7) ic.alive = false;
    }
    L1.lateIcons = L1.lateIcons.filter(a => a.alive);
  }

  // ---------------- Michelle + posers (unchanged) ----------------
  L1.nextMichelleT -= dt;
  if (L1.nextMichelleT <= 0 && !L1.michelle.active) {
    L1.nextMichelleT = 8 + Math.random() * 10;
    L1.michelle.active = true;
    L1.michelle.t = 0;
    L1.michelle.x = VIEW.gw * (0.55 + Math.random() * 0.35);

    L1.posers = [];
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      L1.posers.push({
        x: L1.michelle.x - 70 - i * 26,
        y: floorY - 30,
        t: 0,
        alive: true,
      });
    }

    FX.flashT = 0.12;
    SFX.shutter();
  }

  if (L1.michelle.active) {
    L1.michelle.t += dt;
    if (L1.michelle.t > 1.2) L1.michelle.active = false;
  }

  for (const p of L1.posers) {
    p.t += dt;
    if (p.t > 1.0) p.alive = false;
  }
  L1.posers = L1.posers.filter(p => p.alive);

  // ---------------- Walkers (unchanged, skip during shot) ----------------
  L1.nextWalkerT -= dt;
  if (L1.nextWalkerT <= 0 && L1.phase !== "shot") {
    L1.nextWalkerT = 0.8 + Math.random() * 1.6;
    L1.walkers.push({
      x: VIEW.gw + 20,
      y: floorY - (34 + Math.random() * 10),
      vx: -(80 + Math.random() * 90),
      t: 0,
      alive: true,
    });
  }

  for (const w of L1.walkers) {
    w.t += dt;
    w.x += w.vx * dt;
    if (w.x < -40 || w.t > 5) w.alive = false;
  }
  L1.walkers = L1.walkers.filter(w => w.alive);
}

function updateFX(dt) {
  // global flash fade (used by Michelle in multiple levels)
  if (FX.flashT > 0) FX.flashT = Math.max(0, FX.flashT - dt);

    for (const p of FX.confetti) {
      p.t += dt;
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    FX.confetti = FX.confetti.filter(p => p.life > 0 && p.y < VIEW.gh + 80);

    for (const s of FX.sparkles) {
      s.vy += s.g * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
    }
    FX.sparkles = FX.sparkles.filter(s => s.life > 0);
  }

  // -------------------- Level 1 update --------------------
  function updateLevel1(dt) {
    const floorY = VIEW.gh * 0.78;
    L1.timeInLevel += dt;

    if (L1.phase === "carrot" && L1.timeInLevel > 40) initShotPhase();
    if (L1.phase === "shot" && (L1.timeInLevel - L1.phaseStartT) > 30) initColouringPhase();

    if (L1.bannerT > 0) L1.bannerT -= dt;

    if (L1.phase === "carrot") L1.camX += L1.speed * dt;

    const left = touch.left || keys.has("ArrowLeft") || keys.has("a") || keys.has("A");
    const right = touch.right || keys.has("ArrowRight") || keys.has("d") || keys.has("D");

    if (L1.boostT > 0) {
      L1.boostT -= dt;
      if (L1.boostT <= 0) { L1.boostT = 0; L1.boostLevel = 1; }
    }

    if (L1.accBoostT > 0) {
      L1.accBoostT -= dt;
      if (L1.accBoostT < 0) L1.accBoostT = 0;
    }

    if (L1.perfectAccT > 0) {
      L1.perfectAccT -= dt;
      if (L1.perfectAccT < 0) L1.perfectAccT = 0;
    }

    const move = PHYS.moveSpeed * (L1.boostLevel || 1);

    player.vx = 0;
    if (left) player.vx -= move;
    if (right) player.vx += move;

    if (player.vx < -5) player.facing = -1;
    else if (player.vx > 5) player.facing = 1;

    player.x = clamp(player.x + player.vx * dt, 60, VIEW.gw * 0.55);

    const prevY = player.y;
    player.vy += PHYS.gravity * dt;
    player.y += player.vy * dt;

    if (player.y + player.h >= floorY) {
      player.y = floorY - player.h;
      player.vy = 0;
      player.onGround = true;
    } else {
      player.onGround = false;
    }

    updateNPCs(dt);
    updateFX(dt);

    if (L1.phase === "carrot") {
      spawnBoxesAhead(floorY);
      updateCarrots(dt, floorY);

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
      L1.boxes = L1.boxes.filter(b => b.x > L1.camX - 320);
    }

    if (L1.phase === "shot") {
      player.y = floorY - player.h;
      player.vy = 0;
      player.onGround = true;
      updateShots(dt);
    }

    if (L1.phase === "colouring") {
      for (const z of L1.colouring.zones) {
        if (z.filled) continue;
        if (rectsOverlap(player.x, player.y, player.w, player.h, z.x, z.y, z.w, z.h)) {
          z.filled = true;

          const r = Math.random();
          z.fill =
            r < 0.40 ? "#C83A3A" :
            r < 0.78 ? "#2FAE5A" :
            r < 0.94 ? "#FFFFFF" :
            "#FFD24D";

          L1.colouring.progress += 1;
          if ((L1.colouring.progress % 3) === 0) SFX.tick();
          spawnSparkles(z.x + z.w * 0.5, z.y + z.h * 0.5, 6);
        }
      }

      if (!L1.colouring.done && L1.colouring.progress >= L1.colouring.target) {
        L1.colouring.done = true;
        L1.levelDone = true;
        L1.score += 500;

        SFX.dingding();
        spawnConfettiBurst();
      }
    }

    L1.score += Math.floor(dt * 2);
  }

  // ======================================================================
// ✅ LEVEL 2 — Trojan Trek & Fill the Bus
// Phase A (for now): Trojan Trek (October) — 45s auto-scroll run
// ======================================================================
const L2 = {
  camX: 0,
  score: 0,

  // Phase control
  phase: "trek",          // trek (Phase A) -> bus (Phase B)
  phaseT: 0,              // seconds remaining in current phase
  done: false,

  // Auto-scroll + modifiers
  scrollSpeed: 240,       // world units per second (Phase A)
  slowT: 0,               // Marcy slow timer (Phase A)
  slowMul: 0.35,          // movement multiplier during Marcy slow

  noJumpT: 0,             // cannot-jump timer (Marcy recruitment)

  // Phase B carry that affects jump as well
  carryTech: 0,            // tech items currently cluttering hands

  // Phase B movement debuffs
  slipT: 0,               // snow slip slow
  techT: 0,               // Chris “tech clutter” slow
  carryFood: 0,           // how many food items currently being carried (adds weight)
  deliveredFood: 0,       // total delivered via Gary

  // Marcy scheduling (she appears with some Trail Relay posters)
  nextMarcyN: 2,          // poster index n (every 240 units) where Marcy will appear (n % 3 === 2)

  // UI banner
  bannerT: 0,
  bannerText: "",

  // World
  worldLen: 999999,       // endless-ish
  platforms: [],

  // Phase A collectibles
  coins: [],
  coinSpawnT: 0,
  collected: 0,
  stolen: 0,

  // Phase B collectibles / hazards
  foods: [],
  foodSpawnT: 0,
  snow: [],
  snowSpawnT: 0,

  // NPCs (Phase A)
  priam: {
    active: true,
    x: 0, y: 0, w: 34, h: 54,
    dir: 1,
    walkT: 0,
    hitCd: 0,
  },
  marcy: {
    active: true,
    x: 0, y: 0, w: 34, h: 54,
    dir: -1,
    walkT: 0,
    triggerCd: 0,
    following: false,
    followT: 0,
    posterN: 2,
    anchorX: 0,
  },

  // NPCs (Phase B)
  gary: {
    active: false,
    x: 0, y: 0, w: 34, h: 54,
    dir: 1,
    walkT: 0,
    hiCd: 0,
  },
  chris: {
    active: false,
    x: 0, y: 0, w: 34, h: 54,
    dir: -1,
    walkT: 0,
    hitCd: 0,
  },
  michelle: {
    active: false,
    x: 0, y: 0, w: 34, h: 54,
    seen: false,
    snapCd: 0,
  },
};

function showL2Banner(text) {
  L2.bannerText = text;
  L2.bannerT = 1.35;
}

function resetLevel2() {
  // Start fresh at Phase A
  resetL2PhaseA();
  showL2Banner("LEVEL 2 — TROJAN TREK!");
}

function resetL2PhaseA() {
  L2.camX = 0;
  // Carry score forward from Level 1 so points accumulate across the full game.
  L2.score = L1.score || 0;
  L2.done = false;

  L2.phase = "trek";
  L2.phaseT = 45.0;

  L2.scrollSpeed = 240;
  L2.slowT = 0;
  L2.slipT = 0;
  L2.techT = 0;

  L2.noJumpT = 0;
  L2.carryTech = 0;

  L2.bannerT = 0;
  L2.bannerText = "";

  L2.coins = [];
  L2.coinSpawnT = 0;

  L2.foods = [];
  L2.foodSpawnT = 0;
  L2.snow = [];
  L2.snowSpawnT = 0;

  L2.collected = 0;
  L2.stolen = 0;
  L2.carryFood = 0;
  L2.deliveredFood = 0;
  L2.carryTech = 0;
  L2.noJumpT = 0;

  const floorY = VIEW.gh * 0.78;

  // Simple “floor + a few platforms”
  L2.platforms = [
    { x: 0, y: floorY, w: 5000, h: VIEW.gh - floorY }, // floor span
    { x: 320, y: floorY - 78, w: 160, h: 16 },
    { x: 660, y: floorY - 130, w: 180, h: 16 },
    { x: 980, y: floorY - 98, w: 160, h: 16 },
    { x: 1300, y: floorY - 155, w: 200, h: 16 },
    { x: 1680, y: floorY - 110, w: 180, h: 16 },
    { x: 2040, y: floorY - 145, w: 200, h: 16 },
    { x: 2380, y: floorY - 95, w: 180, h: 16 },
    { x: 2700, y: floorY - 150, w: 200, h: 16 },
  ];

  // Phase A NPC anchor positions
  L2.priam.active = true;
  L2.priam.x = 560;
  L2.priam.y = floorY - L2.priam.h;
  L2.priam.dir = 1;
  L2.priam.walkT = 0;
  L2.priam.hitCd = 0;

  // Marcy scheduling (with TRAIL RELAY posters)
  L2.nextMarcyN = 2;
  L2.marcy.active = false;
  L2.marcy.following = false;
  L2.marcy.followT = 0;
  L2.marcy.walkT = 0;
  L2.marcy.triggerCd = 0;
  L2.marcy.posterN = L2.nextMarcyN;
  L2.marcy.anchorX = 0;

  // Phase B NPCs off for now
  L2.gary.active = false;
  L2.chris.active = false;
  L2.michelle.active = false;
  L2.michelle.seen = false;

  // Player start
  player.x = 140;
  player.y = floorY - player.h;
  player.vx = 0;
  player.vy = 0;
  player.onGround = true;
  player.facing = 1;

  FX.confetti = [];
  FX.flashT = 0;
  FX.sparkles = [];
}

function startL2PhaseB() {
  // Transition into Phase B (Fill the Bus)
  L2.phase = "bus";
  L2.phaseT = 45.0;

  // slightly slower overall (heavier items)
  L2.scrollSpeed = 220;
  L2.slowT = 0;

  L2.slipT = 0;
  L2.techT = 0;
  L2.carryFood = 0;
  L2.carryTech = 0;
  L2.noJumpT = 0;
  // keep L2.score, keep L2.collected from Phase A

  // clear Phase A bits
  L2.coins = [];
  L2.coinSpawnT = 0;

  // init Phase B bits
  L2.foods = [];
  L2.foodSpawnT = 0;
  L2.snow = [];
  L2.snowSpawnT = 0;

  const floorY = VIEW.gh * 0.78;

  // Reset world/camera for a clean seasonal scene
  L2.camX = 0;

  // A flatter “runway” for Phase B
  L2.platforms = [
    { x: 0, y: floorY, w: 5000, h: VIEW.gh - floorY }, // floor span
    { x: 520, y: floorY - 90, w: 180, h: 16 },
    { x: 980, y: floorY - 120, w: 200, h: 16 },
    { x: 1520, y: floorY - 100, w: 180, h: 16 },
    { x: 2080, y: floorY - 135, w: 220, h: 16 },
    { x: 2680, y: floorY - 110, w: 200, h: 16 },
  ];

  // Turn off Phase A NPCs
  L2.priam.active = false;
  L2.marcy.active = false;
  L2.marcy.following = false;

  // Phase B NPCs
  L2.gary.active = true;
  L2.gary.x = 720;
  L2.gary.y = floorY - L2.gary.h;
  L2.gary.dir = 1;
  L2.gary.walkT = 0;
  L2.gary.hiCd = 0;

  L2.chris.active = true;
  L2.chris.x = 1200;
  L2.chris.y = floorY - L2.chris.h;
  L2.chris.dir = -1;
  L2.chris.walkT = 0;
  L2.chris.hitCd = 0;

  L2.michelle.active = false;
  L2.michelle.seen = false;
  L2.michelle.snapCd = 0;

  // Player start again
  player.x = 140;
  player.y = floorY - player.h;
  player.vx = 0;
  player.vy = 0;
  player.onGround = true;
  player.facing = 1;

  showL2Banner("PHASE B — FILL THE BUS!");
}

function resolvePlatforms(prevX, prevY, floorY) {
  // Very simple AABB platform collision: land on top only.
  player.onGround = false;

  // Floor clamp (failsafe)
  if (player.y + player.h >= floorY) {
    player.y = floorY - player.h;
    player.vy = 0;
    player.onGround = true;
  }

  for (const p of L2.platforms) {
    if (p.y >= floorY) continue;

    const px = p.x - L2.camX;
    if (px + p.w < -80 || px > VIEW.gw + 80) continue;

    const falling = player.vy >= 0;
    const overlap = rectsOverlap(player.x, player.y, player.w, player.h, px, p.y, p.w, p.h);
    const cameFromAbove = (prevY + player.h) <= (p.y + 8);

    if (falling && overlap && cameFromAbove) {
      player.y = p.y - player.h;
      player.vy = 0;
      player.onGround = true;
    }
  }
}

function spawnL2Coins(floorY, dt) {
  // Spawn coins a little ahead of the camera while Phase A runs.
  if (L2.done) return;

  L2.coinSpawnT -= dt;
  while (L2.coinSpawnT <= 0) {
    L2.coinSpawnT += 0.33 + Math.random() * 0.22;

    // Spawn 1–3 coins in a tiny cluster
    const baseX = L2.camX + VIEW.gw + 120 + Math.random() * 260;
    const lane = Math.random();
    const baseY =
      lane < 0.55 ? (floorY - 92) :
      lane < 0.82 ? (floorY - 140) :
      (floorY - 190);

    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      L2.coins.push({
        x: baseX + i * 28,
        y: baseY + Math.sin((i + Math.random()) * 2) * 4,
        r: 7,
        alive: true,
        bob: Math.random() * 6.28,
      });
    }
  }

  // Cull old coins
  const cutoff = L2.camX - 200;
  if (L2.coins.length > 120) L2.coins = L2.coins.slice(-120);
  for (const c of L2.coins) {
    if (c.x < cutoff) c.alive = false;
  }
}

function updatePriam(dt, floorY) {
  const p = L2.priam;
  if (!p.active) return;

  // Keep Priam roughly within the “action window” ahead of the player.
  const desired = L2.camX + VIEW.gw * 0.62;
  p.x += (desired - p.x) * Math.min(1, dt * 0.65);

  p.walkT += dt;
  const wig = Math.sin(p.walkT * 1.7) * 82;
  p.x += wig * dt;
  p.y = floorY - p.h;

  if (p.hitCd > 0) p.hitCd -= dt;

  // Collision (steals 1–3 coins/100pts each)
  const sx = p.x - L2.camX;
  if (p.hitCd <= 0 && rectsOverlap(player.x, player.y, player.w, player.h, sx, p.y, p.w, p.h)) {
    const steal = 1 + Math.floor(Math.random() * 3);
    const actual = Math.min(L2.collected, steal);

    if (actual > 0) {
      L2.collected -= actual;
      L2.stolen += actual;
      L2.score = Math.max(0, L2.score - actual * 100);
    }

    p.hitCd = 0.9;
    showL2Banner(`PRIAM LIFTS ${actual} DONATION${actual === 1 ? "" : "S"}!`);
    SFX.decoy();
    spawnSparkles(player.x + player.w * 0.5, player.y + 8, 10);
  }
}


function updateMarcy(dt, floorY) {
  const m = L2.marcy;

  // cooldown after releasing player
  if (m.triggerCd > 0) m.triggerCd -= dt;

  // If she's currently “got you,” she follows you on-screen for 5 seconds
  if (m.following) {
    m.followT -= dt;
    m.y = floorY - m.h;

    // Walk alongside player (screen space), regardless of world scroll
    const targetScreenX = player.x + 54;
    m.x = (targetScreenX + L2.camX);

    if (m.followT <= 0) {
      m.following = false;
      m.triggerCd = 3.0;
      showL2Banner("…OK, GO GO GO!");
    }
    return;
  }

  // Determine which TRAIL RELAY poster index (n) should spawn Marcy next.
  // Posters are at world x = 40 + n*240 in poster space; our posters use posterCam = camX*0.70,
  // but Marcy is in world space, so we anchor her to real camX (keeps gameplay consistent).
  const posterWorldX = (80 + L2.nextMarcyN * 240); // aligned with visual poster rhythm

  // Spawn Marcy when her TRAIL RELAY poster is about to enter the screen
  const posterScreenX = posterWorldX - L2.camX;
  if (!m.active) {
    // If we somehow passed it, advance to the next scheduled one
    if (posterScreenX < -260) {
      const skip = (Math.random() < 0.5) ? 2 : 3;
      L2.nextMarcyN += 3 * skip;
      return;
    }

    if (posterScreenX < VIEW.gw + 40) {
      m.active = true;
      m.posterN = L2.nextMarcyN;
      m.anchorX = posterWorldX + 185; // stand beside the poster
      m.walkT = 0;
      m.x = m.anchorX;
      m.y = floorY - m.h;
    } else {
      return;
    }
  }

  // While active, she paces back and forth beside “her” TRAIL RELAY poster
  const thisPosterX = (80 + m.posterN * 240);
  const thisPosterScreenX = thisPosterX - L2.camX;

  // Drift off with the poster if avoided
  if (thisPosterScreenX < -260) {
    m.active = false;

    // Schedule the next appearance on the 2nd or 3rd TRAIL RELAY poster ahead
    const skip = (Math.random() < 0.5) ? 2 : 3;
    L2.nextMarcyN = m.posterN + 3 * skip;
    m.posterN = L2.nextMarcyN;
    return;
  }

  m.walkT += dt;
  const pace = Math.sin(m.walkT * 2.2) * 70;
  m.anchorX = thisPosterX + 185;
  m.x = m.anchorX + pace * 0.35;
  m.y = floorY - m.h;

  // Proximity trigger (not collision): if player gets too close, slow for 5s
  const sx = m.x - L2.camX;
  const dx = (player.x + player.w * 0.5) - (sx + m.w * 0.5);
  const dy = (player.y + player.h * 0.5) - (m.y + m.h * 0.5);
  const dist2 = dx * dx + dy * dy;

  if (m.triggerCd <= 0 && L2.slowT <= 0 && dist2 < (120 * 120)) {
    if (isChar("Emily")) {
      m.triggerCd = 1.1;
      showL2Banner("EMILY: NO THANK YOU.");
      SFX.tick();
      return;
    }
    L2.slowT = 5.0;
    m.following = true;
    m.followT = 5.0;
    L2.noJumpT = 5.0;
    showL2Banner("MARCY: TRAIL RELAY SIGNUP??");
    SFX.tick();
  }
}


function drawFoodItem(x, y, kind = "can") {
  const xx = Math.round(x);
  const yy = Math.round(y);

  // Small shadow
  drawPixelRect(xx - 9, yy + 9, 18, 3, "rgba(0,0,0,0.22)");

  if (kind === "can") {
    // canned goods
    drawPixelRect(xx - 7, yy - 9, 14, 18, "rgba(0,0,0,0.25)");
    drawPixelRect(xx - 6, yy - 8, 12, 16, "#C83A3A");
    drawPixelRect(xx - 6, yy - 8, 12, 3, "rgba(255,255,255,0.25)");
    drawPixelRect(xx - 6, yy + 4, 12, 3, "rgba(0,0,0,0.22)");
    drawPixelRect(xx - 3, yy - 1, 6, 3, "#FFD24D");
  } else if (kind === "milk") {
    // milk carton
    drawPixelRect(xx - 7, yy - 10, 14, 20, "rgba(0,0,0,0.25)");
    drawPixelRect(xx - 6, yy - 9, 12, 18, "rgba(255,255,255,0.86)");
    drawPixelRect(xx - 6, yy - 9, 12, 5, "rgba(123,214,255,0.35)");
    drawPixelRect(xx - 2, yy - 12, 4, 3, "rgba(255,255,255,0.80)");
    drawPixelRect(xx - 1, yy - 11, 2, 2, "rgba(0,0,0,0.12)");
    drawPixelRect(xx - 3, yy - 2, 6, 3, "rgba(128,0,32,0.55)");
  } else if (kind === "bread") {
    // loaf of bread
    drawPixelRect(xx - 9, yy - 6, 18, 14, "rgba(0,0,0,0.25)");
    drawPixelRect(xx - 8, yy - 5, 16, 12, "rgba(255,183,74,0.95)");
    drawPixelRect(xx - 6, yy - 7, 12, 4, "rgba(255,210,120,0.95)");
    drawPixelRect(xx - 5, yy + 1, 10, 2, "rgba(0,0,0,0.15)");
    drawPixelRect(xx - 2, yy - 1, 4, 2, "rgba(128,0,32,0.55)");
  } else {
    // veggies bundle
    drawPixelRect(xx - 8, yy - 7, 16, 16, "rgba(0,0,0,0.22)");
    drawPixelRect(xx - 7, yy - 6, 14, 14, "rgba(46,227,95,0.80)");
    drawPixelRect(xx - 2, yy - 6, 4, 14, "rgba(0,0,0,0.10)");
    drawPixelRect(xx - 6, yy - 2, 5, 6, "rgba(255,90,0,0.85)");
    drawPixelRect(xx + 1, yy - 2, 5, 6, "rgba(255,210,77,0.85)");
    drawPixelRect(xx - 1, yy - 9, 2, 3, "rgba(60,255,116,0.90)");
  }
}

function drawSnowPile(x, y, w, h) {
  const xx = Math.round(x);
  const yy = Math.round(y);
  drawPixelRect(xx - 1, yy - 1, w + 2, h + 2, "rgba(0,0,0,0.22)");
  drawPixelRect(xx, yy, w, h, "rgba(255,255,255,0.75)");
  drawPixelRect(xx + 2, yy + 2, w - 4, h - 4, "rgba(180,220,255,0.22)");
}

function spawnL2Food(floorY, dt) {
  if (L2.done) return;
  L2.foodSpawnT -= dt;
  while (L2.foodSpawnT <= 0) {
    L2.foodSpawnT += 0.40 + Math.random() * 0.25;

    const x = L2.camX + VIEW.gw + 160 + Math.random() * 320;
    const lane = Math.random();
    const y =
      lane < 0.55 ? (floorY - 88) :
      lane < 0.85 ? (floorY - 138) :
      (floorY - 188);

    const kinds = ["can","bread","milk","veg"];
    const kind = kinds[Math.floor(Math.random()*kinds.length)];
    L2.foods.push({ x, y, r: 10, alive: true, kind });
  }

  const cutoff = L2.camX - 220;
  if (L2.foods.length > 120) L2.foods = L2.foods.slice(-120);
  for (const f of L2.foods) if (f.x < cutoff) f.alive = false;
}

function spawnL2Snow(floorY, dt) {
  if (L2.done) return;
  L2.snowSpawnT -= dt;
  while (L2.snowSpawnT <= 0) {
    L2.snowSpawnT += 0.75 + Math.random() * 0.55;

    const x = L2.camX + VIEW.gw + 200 + Math.random() * 380;
    const w = 22 + Math.floor(Math.random() * 18);
    const h = 16 + Math.floor(Math.random() * 10);
    const y = floorY - h;

    L2.snow.push({ x, y, w, h, hitCd: 0 });
  }

  const cutoff = L2.camX - 260;
  if (L2.snow.length > 80) L2.snow = L2.snow.slice(-80);
  for (const s of L2.snow) {
    if (s.x < cutoff) s.hitCd = 99;
    if (s.hitCd > 0 && s.hitCd < 99) s.hitCd -= dt;
  }
}

function updateGary(dt, floorY) {
  const g = L2.gary;
  if (!g.active) return;

  g.walkT += dt;
  const desired = L2.camX + VIEW.gw * 0.58 + Math.sin(g.walkT * 1.3) * 80;
  g.x += (desired - g.x) * Math.min(1, dt * 0.75);
  // occasional gentle “pace” wiggle
  g.x += Math.sin(g.walkT * 2.4) * 22 * dt;
  g.y = floorY - g.h;

  if (g.hiCd > 0) g.hiCd -= dt;

  const sx = g.x - L2.camX;
  if (g.hiCd <= 0 && rectsOverlap(player.x, player.y, player.w, player.h, sx, g.y, g.w, g.h)) {
    const delivered = L2.carryFood;
    if (delivered > 0) {
      L2.deliveredFood += delivered;
      L2.score += delivered * 40; // little delivery bonus
      L2.carryFood = 0;
    }
    if (L2.techT > 0) L2.techT = 0;
    if (L2.carryTech > 0) L2.carryTech = 0;

    g.hiCd = 1.2;
    showL2Banner(delivered > 0 ? "GARY: NICE WORK! I’LL TAKE THAT." : "GARY: KEEP IT UP!");
    SFX.dingding();
    FX.flashT = 0.18;
    spawnSparkles(player.x + player.w * 0.5, player.y + 8, 10);
  }
}

function updateChris(dt, floorY) {
  const c = L2.chris;
  if (!c.active) return;

  c.walkT += dt;
  const desired = L2.camX + VIEW.gw * 0.74 + Math.sin(c.walkT * 1.1) * 120;
  c.x += (desired - c.x) * Math.min(1, dt * 0.65);
  const wig = Math.sin(c.walkT * 2.6) * 120;
  c.x += wig * dt * 0.45;
  c.y = floorY - c.h;

  if (c.hitCd > 0) c.hitCd -= dt;

  const sx = c.x - L2.camX;
  if (c.hitCd <= 0 && rectsOverlap(player.x, player.y, player.w, player.h, sx, c.y, c.w, c.h)) {
    c.hitCd = 1.0;
    if (isChar("Emily")) {
      showL2Banner("EMILY: NO THANK YOU.");
      SFX.tick();
      return;
    }
    L2.techT = 10.0;
    // Tech items count as “hands full” for jump penalty
    const add = 1 + Math.floor(Math.random() * 2); // 1–2 items
    L2.carryTech = clamp(L2.carryTech + add, 0, 6);
    showL2Banner(`CHRIS: TAKE THIS CORD… AND THIS LAPTOP… (+${add})`);
    SFX.decoy();
    spawnSparkles(player.x + player.w * 0.5, player.y + 8, 10);
  }
}

function updateMichelleB(dt, floorY) {
  const m = L2.michelle;
  if (!m.active) return;

  m.y = floorY - m.h;
  if (m.snapCd > 0) m.snapCd -= dt;

  const sx = m.x - L2.camX;

  // one-time photo bonus on proximity
  const dx = (player.x + player.w * 0.5) - (sx + m.w * 0.5);
  const dy = (player.y + player.h * 0.5) - (m.y + m.h * 0.5);
  const dist2 = dx * dx + dy * dy;

  if (!m.seen && dist2 < (120 * 120)) {
    m.seen = true;
    L2.score += 80;
    FX.flashT = 0.18;
    SFX.shutter();
    showL2Banner("MICHELLE: SMILE! 📸");
  }
}

function updateLevel2(dt) {
  const floorY = VIEW.gh * 0.78;

  if (L2.bannerT > 0) L2.bannerT -= dt;
  if (L2.done) {
    updateFX(dt);
    return;
  }

  // Phase countdown (time pressure)
  L2.phaseT = Math.max(0, L2.phaseT - dt);

  if (L2.noJumpT > 0) L2.noJumpT = Math.max(0, L2.noJumpT - dt);

  // Auto-scroll camera (always)
  L2.camX += L2.scrollSpeed * dt;

  // Input
  const left = touch.left || keys.has("ArrowLeft") || keys.has("a") || keys.has("A");
  const right = touch.right || keys.has("ArrowRight") || keys.has("d") || keys.has("D");

  // Base move speed per phase
  let move = PHYS.moveSpeed;

  if (L2.phase === "trek") {
    // Marcy slow (Phase A)
    if (L2.slowT > 0) {
      L2.slowT -= dt;
      move *= L2.slowMul;
      if (L2.slowT <= 0) {
        L2.slowT = 0;
        showL2Banner("FREE TO RUN!");
      }
    }
  } else if (L2.phase === "bus") {
    // Slightly heavier overall (Phase B)
    move *= 0.88;

    // Carry weight slows you a little until Gary takes it
    const weightItems = (L2.carryFood + L2.carryTech);
    const weightMul = clamp(1 - weightItems * 0.03, 0.65, 1);
    move *= weightMul;

    // Tech clutter slow (Chris) for 10s, or until Gary clears it
    if (L2.techT > 0) {
      L2.techT = Math.max(0, L2.techT - dt);
      move *= 0.55;
      if (L2.techT <= 0) {
        L2.carryTech = 0;
        showL2Banner("BACK ON TRACK!");
      }
    }

    // Snow slip slow
    if (L2.slipT > 0) {
      L2.slipT = Math.max(0, L2.slipT - dt);
      move *= 0.55;
    }
  }

  // Horizontal movement
  player.vx = 0;
  if (left) player.vx -= move;
  if (right) player.vx += move;

  if (player.vx < -5) player.facing = -1;
  else if (player.vx > 5) player.facing = 1;

  const prevX = player.x;
  const prevY = player.y;

  player.x += player.vx * dt;

  // Keep player within screen band
  player.x = clamp(player.x, 70, VIEW.gw * 0.84);

  // Gravity + vertical movement
  player.vy += PHYS.gravity * dt;
  player.y += player.vy * dt;

  resolvePlatforms(prevX, prevY, floorY);

  // ------------------ Phase-specific gameplay ------------------
  if (L2.phase === "trek") {
    // Spawn & collect donations
    spawnL2Coins(floorY, dt);

    for (const c of L2.coins) {
      if (!c.alive) continue;
      c.bob += dt * 4.2;
      const cx = c.x - L2.camX;
      const cy = c.y + Math.sin(c.bob) * 3;

      if (cx < -60 || cx > VIEW.gw + 60) continue;

      if (rectsOverlap(player.x, player.y, player.w, player.h, cx - c.r, cy - c.r, c.r * 2, c.r * 2)) {
        c.alive = false;
        L2.collected += 1;
        L2.score += 100;
        SFX.collect();
        spawnSparkles(player.x + player.w * 0.5, player.y + 10, 10);
      }
    }

    // NPCs
    updatePriam(dt, floorY);
    updateMarcy(dt, floorY);

    // Finish Phase A → transition to Phase B
    if (L2.phaseT <= 0) {
      startL2PhaseB();
      updateFX(dt);
      return;
    }
  } else if (L2.phase === "bus") {
    // Spawn food + snow hazards
    spawnL2Food(floorY, dt);
    spawnL2Snow(floorY, dt);

    // Collect food (adds to carry)
    for (const f of L2.foods) {
      if (!f.alive) continue;
      const fx = f.x - L2.camX;
      const fy = f.y;
      if (fx < -60 || fx > VIEW.gw + 60) continue;

      if (rectsOverlap(player.x, player.y, player.w, player.h, fx - 10, fy - 10, 20, 20)) {
        f.alive = false;
        L2.carryFood = clamp(L2.carryFood + 1, 0, 6);
        L2.score += 120;
        SFX.collect();
        spawnSparkles(player.x + player.w * 0.5, player.y + 10, 10);
      }
    }

    // Snow collisions (slip)
    for (const s of L2.snow) {
      const sx = s.x - L2.camX;
      if (sx < -80 || sx > VIEW.gw + 80) continue;
      if (s.hitCd > 0) continue;

      if (rectsOverlap(player.x, player.y, player.w, player.h, sx, s.y, s.w, s.h)) {
        s.hitCd = 1.2;
        L2.slipT = 1.8;
        player.x = clamp(player.x - 18, 70, VIEW.gw * 0.84);
        showL2Banner("WHOA — ICE!");
        SFX.tick();
      }
    }

    // NPCs
    updateGary(dt, floorY);
    updateChris(dt, floorY);

    // Michelle appears near the end (last ~10s)
    if (!L2.michelle.seen && L2.phaseT <= 10.0) {
      if (!L2.michelle.active) {
        L2.michelle.active = true;
        L2.michelle.x = L2.camX + VIEW.gw * 0.70;
        L2.michelle.y = floorY - L2.michelle.h;
        L2.michelle.seen = false;
      }
      // keep her roughly in view
      L2.michelle.x = (L2.camX + VIEW.gw * 0.70);
      updateMichelleB(dt, floorY);
    }

    // Finish Phase B
    if (L2.phaseT <= 0) {
      // auto-deliver anything still carried
      if (L2.carryFood > 0) {
        L2.deliveredFood += L2.carryFood;
        L2.score += L2.carryFood * 40;
        L2.carryFood = 0;
      }

      L2.done = true;
      L2.score += 350; // finish bonus
      SFX.dingding();
      spawnConfettiBurst();
      updateFX(dt);
      return;
    }
  }

  // Tiny passive score drip
  L2.score += Math.floor(dt * 2);

  updateFX(dt);
}
  
// ✅ LEVEL 3 — Late Slip Blizzard
const L3 = {
  camX: 0,
  speed: 240,
  score: 0,

  // one phase, 60 seconds
  timeT: 60,

  // gameplay flags
  done: false,
  endT: 0,           // small timing for end flash/message
  showEndMsg: false, // message after final flash

  jamie: { x: 220, dir: 1, speed: 26, clipT: 0 },

  // late slips
  lateIcons: [],
  nextLateT: 0.22, // fast and furious

  // extra holiday pickups (low value compared to late slips)
  treats: [],
  nextTreatT: 1.2,

  // Michelle photos
  michelle: { active: false, x: 0, t: 0 },
  nextMichelleT: 4.5,
  enableMichelle: true,

  // Carolers (obstacle swarm)
  carolers: [],
  carolNotePuffs: [],
  caughtT: 0,         // remaining slow/no-jump time
  caughtBy: -1,
  caughtFxT: 0,
  melissaSingT: 0,
  carolSongCd: 0,
};

function resetLevel3() {
  L3.camX = 0;
  L3.score = L2.score || 0; // carry over score from Level 2
  L3.timeT = 60;
  L3.done = false;

  L3.jamie = { x: 220, dir: 1, speed: 26, clipT: 0 };
  L3.lateIcons = [];
  L3.nextLateT = 0.22;

  L3.treats = [];
  L3.nextTreatT = 1.1;

  L3.michelle = { active: false, x: 0, t: 0 };
  L3.nextMichelleT = 6.0;
  L3.enableMichelle = true;

  L3.endT = 0;
  L3.showEndMsg = false;

  // Carolers (single traveling group, smaller)
  // Group anchor moves with the hallway and periodically respawns ahead.
  L3.carolGroup = {
    wx: L3.camX + VIEW.gw + 260,   // world x anchor
    paceDir: Math.random() < 0.5 ? -1 : 1,
    paceT: Math.random() * 1.5,
    speed: 18 + Math.random() * 10,
    follow: false,
    cooldownT: 0,                 // time off-screen after releasing player
  };

  // 5 carolers side-by-side (50% scale) — easier to read/avoid/jump over
  L3.carolers = [];
  const row = [
    { dx: -48 }, { dx: -24 }, { dx: 0 }, { dx: 24 }, { dx: 48 },
  ];
  for (let i = 0; i < 5; i++) {
    L3.carolers.push({
      id: i,
      dx: row[i].dx,
      lane: 1,                 // single row
      wx: L3.carolGroup.wx + row[i].dx,
      active: true,
    });
  }
L3.carolNotePuffs = [];

  L3.caughtT = 0;
  L3.caughtBy = -1;
  L3.caughtFxT = 0;

  // reset player
  player.x = 140;
  player.y = 0;
  player.vx = 0;
  player.vy = 0;
  player.onGround = false;

  FX.confetti = [];
  FX.flashT = 0;
  FX.sparkles = [];
}

function spawnTreatL3(floorY) {
  const kind = Math.random() < 0.55 ? "gift" : "candy";
  const x = 90 + Math.random() * (VIEW.gw - 180);
  // hover in the air like coins/food (not on the floor)
  const top = 120;
  const bottom = floorY - 90;
  const y = top + Math.random() * Math.max(30, (bottom - top));
  L3.treats.push({ kind, x, y, t: 0, alive: true });
}

function spawnLateIconL3(floorY) {
  L3.lateIcons.push({
    x: 80 + Math.random() * (VIEW.gw - 160),
    y: -20 - Math.random() * 60,
    vy: 130 + Math.random() * 70,
    t: 0,
    alive: true,
  });
}

function updateLevel3(dt) {
  const floorY = VIEW.gh * 0.78;
  if (L3.done) {
    L3.endT += dt;
    if (L3.endT > 0.35) L3.showEndMsg = true;
    // Michelle is disabled for now while we stabilize Level 3
    if (L3.enableMichelle && L3.michelle.active) {
      L3.michelle.t += dt;
      if (L3.michelle.t > 1.2) L3.michelle.active = false;
    }
    updateFX(dt);
    return;
  }

  // timer
  L3.timeT -= dt;
  if (L3.melissaSingT > 0) L3.melissaSingT = Math.max(0, L3.melissaSingT - dt);

  if (L3.timeT <= 0) {
    L3.timeT = 0;
    L3.done = true;
    L3.endT = 0;
    L3.showEndMsg = false;

    // Final Michelle flash + celebration
    L3.michelle.active = true;
    L3.michelle.t = 0;
    L3.michelle.x = VIEW.gw * 0.60;
    FX.flashT = 0.25;
    SFX.shutter();
    SFX.dingding();
    spawnConfettiBurst();

    updateFX(dt);
    return;
  }

  // movement (same feel as level 2)
  const left = keys.has("ArrowLeft") || keys.has("a") || keys.has("A") || touch.left;
  const right = keys.has("ArrowRight") || keys.has("d") || keys.has("D") || touch.right;

  let move = 0;
  if (left) move -= 1;
  if (right) move += 1;

  const slowMul = (L3.caughtT > 0 && !isChar("Melissa")) ? 0.45 : 1;
  player.vx = move * PHYS.moveSpeed * slowMul;
  if (Math.abs(player.vx) > 1) player.facing = Math.sign(player.vx);

  // auto-scroll camera
  L3.camX += L3.speed * dt;

  // basic physics
  player.vy += PHYS.gravity * dt;
  player.x += player.vx * dt;
  player.y += player.vy * dt;

  // clamp to lane
  player.x = clamp(player.x, 70, VIEW.gw * 0.84);

  // ground
  if (player.y + player.h >= floorY) {
    player.y = floorY - player.h;
    player.vy = 0;
    player.onGround = true;
  } else {
    player.onGround = false;
  }

  // Jamie pacing (visual cue)
  const j = L3.jamie;
  j.x += j.dir * j.speed * dt;
  if (j.x < 140) { j.x = 140; j.dir = 1; }
  if (j.x > VIEW.gw * 0.55) { j.x = VIEW.gw * 0.55; j.dir = -1; }
  if (j.clipT > 0) j.clipT -= dt;

  // late slips spawn + fall + collect (no cap)
  L3.nextLateT -= dt;
  if (L3.nextLateT <= 0) {
    L3.nextLateT = 0.16 + Math.random() * 0.18;
    spawnLateIconL3(floorY);
  }

  for (const ic of L3.lateIcons) {
    ic.t += dt;
    ic.y += ic.vy * dt;

    // Colleen power: late slips settle on the floor and stay until she collects them.
    if (isChar("Colleen")) {
      const settleY = floorY - 14;
      if (ic.y >= settleY) {
        ic.y = settleY;
        ic.vy = 0;
        ic.onFloor = true;
      }
    }

    if (rectsOverlap(player.x, player.y, player.w, player.h, ic.x, ic.y, 12, 14)) {
      ic.alive = false;
      L3.score += 25;
      j.clipT = 0.45;
      SFX.tick();
      spawnSparkles(player.x + player.w * 0.5, player.y + 10, 10);
    }
    if (!isChar("Colleen") && ic.y > floorY + 40) ic.alive = false;
    if (!isChar("Colleen") && ic.t > 6) ic.alive = false;
  }
  L3.lateIcons = L3.lateIcons.filter(a => a.alive);

  // extra holiday pickups: gifts + candy (25 pts)
  L3.nextTreatT -= dt;
  if (L3.nextTreatT <= 0) {
    L3.nextTreatT = 0.75 + Math.random() * 1.15;
    spawnTreatL3(floorY);
  }
  for (const tr of L3.treats) {
    tr.t += dt;
    // subtle bob so they're noticeable
    const bob = Math.sin((state.t * 3.2) + tr.x * 0.02) * 1.5;
    tr._y = tr.y + bob;

    if (rectsOverlap(player.x, player.y, player.w, player.h, tr.x - 10, tr._y - 14, 20, 18)) {
      tr.alive = false;
      L3.score += 25;
      SFX.collect();
      spawnSparkles(player.x + player.w * 0.5, player.y + 10, 8);
    }
    if (tr.t > 10) tr.alive = false;
  }
  L3.treats = L3.treats.filter(a => a.alive);

  // Carolers swarm: walk the halls; if you get too close they slow + no-jump for 5s and follow you
  if (L3.caughtT > 0) {
    const prevCaught = L3.caughtT;
    L3.caughtT -= dt;
    L3.caughtFxT = Math.max(0, L3.caughtFxT - dt);

    // When the recruit-swarm releases the player, send the group off-screen for a bit.
    if (prevCaught > 0 && L3.caughtT <= 0) {
      const g = L3.carolGroup;
      g.cooldownT = 3.8 + Math.random() * 1.6; // ~4–5.5s break before returning
      g.follow = false;
      g.wx = L3.camX - 520; // immediately off the left edge
      g.paceDir = -1;
    }

    // keep the "caught" caroler walking alongside you
    const idx = L3.caughtBy;
    if (idx >= 0 && L3.carolers[idx]) {
      L3.carolers[idx].wx = L3.camX + player.x + 46 + Math.sin(state.t * 8) * 6;
    }

    // music note puffs
    if ((L3._noteSpawnT = (L3._noteSpawnT || 0) - dt) <= 0) {
      L3._noteSpawnT = 0.14;
      const nx = player.x + player.w + 10;
      const ny = player.y + 10 + Math.random() * 14;
      L3.carolNotePuffs.push({
        x: nx,
        y: ny,
        vx: 24 + Math.random() * 18,
        vy: -22 - Math.random() * 16,
        t: 0,
        alive: true,
      });
    }
  } else {
    L3.caughtBy = -1;
    L3._noteSpawnT = 0;
  }

  // Melissa superpower: carolers will follow and sing, but do not slow or ground her.
  if (isChar("Melissa") && L3.melissaSingT > 0) {
    const prev = L3.melissaSingT;
    L3.melissaSingT = Math.max(0, L3.melissaSingT - dt);

    // Follow alongside while singing.
    const gg = L3.carolGroup;
    gg.follow = true;
    gg.wx = L3.camX + player.x + 90;

    // Notes + jingles, same visual feel as being 'caught'.
    if ((L3._noteSpawnT = (L3._noteSpawnT || 0) - dt) <= 0) {
      L3._noteSpawnT = 0.14;
      const nx = player.x + player.w + 10;
      const ny = player.y + 10 + Math.random() * 14;
      L3.carolNotePuffs.push({
        x: nx,
        y: ny,
        vx: 24 + Math.random() * 18,
        vy: -22 - Math.random() * 16,
        t: 0,
        alive: true,
      });
    }

    // When singing ends, send them off-screen for a bit before returning.
    if (prev > 0 && L3.melissaSingT <= 0) {
      const gg2 = L3.carolGroup;
      gg2.cooldownT = 3.8 + Math.random() * 1.6;
      gg2.follow = false;
      gg2.wx = L3.camX - 520;
      gg2.paceDir = -1;
    }
  }

  // update note puffs
  for (const n of L3.carolNotePuffs) {
    n.t += dt;
    n.x += n.vx * dt;
    n.y += n.vy * dt;
    if (n.t > 1.0) n.alive = false;
  }
  L3.carolNotePuffs = L3.carolNotePuffs.filter(n => n.alive);

  // update caroler GROUP + member positions
  const g = L3.carolGroup;

  // After releasing the player, the group stays off-screen for a bit before returning.
  if (g.cooldownT > 0) {
    g.cooldownT -= dt;
    g.follow = false;
    // keep them safely off-screen; they'll be respawned ahead when cooldown ends
    g.wx = Math.min(g.wx, L3.camX - 420);

    if (g.cooldownT <= 0) {
      g.wx = L3.camX + VIEW.gw + 260 + Math.random() * 420;
      g.paceDir = Math.random() < 0.5 ? -1 : 1;
      g.paceT = Math.random() * 1.2;
      g.speed = 18 + Math.random() * 10;
    }
  }

  // If the group is not currently "caught-following", it paces slightly and drifts off with the hallway.
  if (g.cooldownT <= 0 && L3.caughtT <= 0) {
    g.follow = false;

    // subtle pacing (in world space)
    g.paceT += dt;
    if (g.paceT > 1.7 + Math.random() * 0.7) {
      g.paceT = 0;
      g.paceDir *= -1;
    }
    g.wx += g.paceDir * g.speed * dt;

    // recycle once it drifts off the left side
    if ((g.wx - L3.camX) < -220) {
      g.wx = L3.camX + VIEW.gw + 220 + Math.random() * 420;
      g.paceDir = Math.random() < 0.5 ? -1 : 1;
      g.paceT = Math.random() * 1.2;
      g.speed = 18 + Math.random() * 10;
    }
  } else if (L3.caughtT > 0) {
    // While the player is "caught", the whole group follows alongside.
    g.follow = true;
    g.wx = L3.camX + player.x + 90;
  }

  // update member world x from the group anchor
  for (const c of L3.carolers) {
    c.wx = g.wx + c.dx;
  }

  // Group proximity trigger (single check; obstacle applies as a group)
  if (L3.caughtT <= 0 && g.cooldownT <= 0 && L3.melissaSingT <= 0) {
    // compute an approximate group center (using the middle caroler)
    const centerWX = g.wx;
    const sxCenter = centerWX - L3.camX;
    const centerY = floorY - 40; // single row

    const dx = Math.abs((sxCenter) - (player.x + player.w * 0.5));
    const dy = Math.abs((centerY + 12) - (player.y + player.h * 0.5));

    // Slightly tighter X-range + keep Y-check so jumping over is possible
    if (dx < 66 && dy < 34) {
      if (isChar("Melissa")) {
        // Melissa: they sing and follow, but do not restrict movement.
        L3.melissaSingT = 5.0;
        L3.caughtFxT = 5.0;
        FX.flashT = 0.06;
        SFX.jingle();
      } else {
        L3.caughtT = 5.0;
        L3.caughtBy = 0;     // cosmetic only now
        L3.caughtFxT = 5.0;
        FX.flashT = 0.06; // tiny "sparkle" feel
        SFX.jingle();
      }
    }
  }

  // Michelle pop-in photos (disabled for now while we stabilize Level 3)
  if (L3.enableMichelle) {
    L3.nextMichelleT -= dt;
    if (L3.nextMichelleT <= 0 && !L3.michelle.active) {
      L3.nextMichelleT = 8 + Math.random() * 10;
      L3.michelle.active = true;
      L3.michelle.t = 0;
      L3.michelle.x = VIEW.gw * (0.55 + Math.random() * 0.35);
FX.flashT = 0.12;
      SFX.shutter();
    }
    if (L3.michelle.active) {
      L3.michelle.t += dt;
      if (L3.michelle.t > 1.2) L3.michelle.active = false;
    }
  }


  // Caroler singing sound: only while the group has you (or while they serenade Melissa).
  const singingT = Math.max(L3.caughtFxT || 0, L3.melissaSingT || 0);
  if (singingT > 0) {
    L3.carolSongCd -= dt;
    if (L3.carolSongCd <= 0) {
      // light seasonal jingle; keep it sparse so it doesn't overwhelm other SFX
      SFX.jingle();
      L3.carolSongCd = 0.75;
    }
  } else {
    L3.carolSongCd = 0;
  }

  updateFX(dt);
}

function drawJamieL3() {
  const floorY = VIEW.gh * 0.78;
  const x = Math.round(L3.jamie.x);
  const y = Math.round(floorY - 42);

  drawPixelRect(x, y + 16, 16, 20, "#FFD24D");
  drawPixelRect(x, y + 30, 16, 6, "#555555");
  drawPixelRect(x, y, 16, 16, "#FFD2B5");
  drawPixelRect(x, y, 16, 6, "#F2D16B");

  const clipFill = L3.jamie.clipT > 0 ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.35)";
  drawPixelRect(x + 18, y + 18, 10, 14, clipFill);
  drawPixelRect(x + 19, y + 20, 8, 2, "rgba(0,0,0,0.25)");
  if (L3.jamie.clipT > 0) drawPixelRect(x + 20, y + 26, 6, 2, "rgba(0,0,0,0.25)");
}

function drawLateIconsL3() {
  for (const ic of L3.lateIcons) {
    const x = Math.round(ic.x);
    const y = Math.round(ic.y);
    drawPixelRect(x - 1, y - 1, 14, 16, "rgba(0,0,0,0.20)");
    drawPixelRect(x, y, 12, 14, "rgba(255,255,255,0.85)");
    drawPixelRect(x + 2, y + 3, 8, 2, "rgba(0,0,0,0.25)");
    drawPixelRect(x + 2, y + 7, 6, 2, "rgba(0,0,0,0.18)");
  }
}

function drawTreatsL3() {
  for (const tr of L3.treats) {
    const x = Math.round(tr.x);
    const y = Math.round(tr._y ?? tr.y);
    if (tr.kind === "gift") {
      // gift box
      drawPixelRect(x - 10, y - 14, 20, 16, "rgba(0,0,0,0.18)");
      drawPixelRect(x - 9, y - 13, 18, 14, "#E64545");
      drawPixelRect(x - 1, y - 13, 2, 14, "#FFD24D");
      drawPixelRect(x - 9, y - 7, 18, 2, "#FFD24D");
      drawPixelRect(x - 3, y - 17, 6, 4, "#FFD24D");
    } else {
      // candy
      drawPixelRect(x - 9, y - 10, 18, 12, "rgba(0,0,0,0.18)");
      drawPixelRect(x - 8, y - 9, 16, 10, "#7BD6FF");
      drawPixelRect(x - 12, y - 8, 4, 8, "#FFB86B");
      drawPixelRect(x + 8, y - 8, 4, 8, "#FFB86B");
      drawPixelRect(x - 2, y - 7, 4, 4, "rgba(255,255,255,0.55)");
    }
  }
}


function drawMusicNotesL3() {
  if (L3.caughtFxT <= 0) return;
  for (const n of L3.carolNotePuffs) {
    const x = Math.round(n.x);
    const y = Math.round(n.y);
    const a = Math.max(0, 1 - n.t / 1.0);
    drawPixelRect(x, y, 4, 4, `rgba(255,255,255,${0.55 * a})`);
    drawPixelRect(x + 3, y - 3, 2, 6, `rgba(255,255,255,${0.55 * a})`);
    drawPixelRect(x + 2, y - 6, 4, 2, `rgba(255,255,255,${0.55 * a})`);
  }
}

function drawCarolerL3(x, y) {
  // 50% size caroler with winter gear
  const s = 0.5;
  const ox = Math.round(x);
  const oy = Math.round(y);

  // shadow
  drawPixelRect(ox + 3, oy + 26, 10, 2, "rgba(0,0,0,0.22)");

  // hat
  drawPixelRect(ox + 4, oy + 0, 8, 3, "#E64545");
  drawPixelRect(ox + 3, oy + 3, 10, 2, "#C92E2E");

  // head
  drawPixelRect(ox + 4, oy + 5, 8, 7, "#FFD2B5");

  // scarf
  drawPixelRect(ox + 3, oy + 12, 10, 3, "#2FE35F");
  drawPixelRect(ox + 8, oy + 15, 3, 4, "#2FE35F");

  // coat
  drawPixelRect(ox + 3, oy + 15, 10, 9, "rgba(123,214,255,0.60)");
  drawPixelRect(ox + 7, oy + 15, 1, 9, "rgba(0,0,0,0.22)");

  // mitts
  drawPixelRect(ox + 1, oy + 18, 2, 3, "#FFD24D");
  drawPixelRect(ox + 13, oy + 18, 2, 3, "#FFD24D");

  // boots
  drawPixelRect(ox + 4, oy + 24, 3, 2, "rgba(0,0,0,0.55)");
  drawPixelRect(ox + 9, oy + 24, 3, 2, "rgba(0,0,0,0.55)");
}

function drawCarolersL3() {
  const floorY = VIEW.gh * 0.78;
  for (const c of L3.carolers) {
    const sx = c.wx - L3.camX;
    if (sx < -80 || sx > VIEW.gw + 80) continue;
    const y = floorY - 34 - c.lane * 6;
    drawCarolerL3(sx, y);
  }
}

function drawMichelleL3() {
  if (!L3.michelle.active) return;
  const floorY = VIEW.gh * 0.78;
  const x = Math.round(L3.michelle.x);
  const y = Math.round(floorY - 44);

  drawPixelRect(x, y + 18, 14, 18, "#B565D9");
  drawPixelRect(x, y + 34, 14, 8, "#555555");
  drawPixelRect(x, y, 14, 16, "#FFD2B5");
  drawPixelRect(x, y, 14, 6, "#FF6B6B");

  // camera
  drawPixelRect(x - 18, y + 20, 16, 10, "rgba(255,255,255,0.72)");
  drawPixelRect(x - 14, y + 22, 6, 4, "rgba(0,0,0,0.35)");
}

function drawLevel3() {
  const floorY = VIEW.gh * 0.78;
  drawHallwayBackdrop(floorY);

  // A slightly different header tint so it feels like a new round
  drawPixelRect(0, 0, VIEW.gw, 34, "rgba(255,90,0,0.12)");

  // Jamie + late slips + Michelle
  drawJamieL3();
  drawTreatsL3();
  drawLateIconsL3();
  drawCarolersL3();
  drawMusicNotesL3();
  if (L3.enableMichelle) drawMichelleL3();

  drawChibiPlayer();
  drawSparkles();
  drawConfetti();

  // HUD
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.font = "700 16px system-ui, Arial";
  ctx.textAlign = "left";
  ctx.fillText(`Level 3 — Late Slip Blizzard`, 16, 38);
  ctx.fillText(`Score: ${L3.score}`, 16, 60);

  ctx.textAlign = "right";
  ctx.fillText(`Time: ${Math.ceil(L3.timeT)}s`, VIEW.gw - 16, 38);
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.font = "700 13px system-ui, Arial";
  ctx.fillText(`Back: Esc`, VIEW.gw - 16, 60);

  if (L3.done) {
    ctx.fillStyle = "rgba(0,0,0,0.60)";
    ctx.fillRect(0, 0, VIEW.gw, VIEW.gh);

    // After the final flash, show the message + prompt
    if (L3.showEndMsg) {
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.textAlign = "center";
      ctx.font = "900 26px system-ui, Arial";
      ctx.fillText("ASSIGNMENTS COLLECTED; HOLIDAY EARNED", VIEW.gw / 2, VIEW.gh * 0.44);

      ctx.font = "800 16px system-ui, Arial";
      ctx.fillText(`Final Score: ${L3.score}`, VIEW.gw / 2, VIEW.gh * 0.52);

      ctx.font = "800 14px system-ui, Arial";
      ctx.fillStyle = "rgba(255,255,255,0.90)";
      ctx.fillText("Press Enter to view Credits", VIEW.gw / 2, VIEW.gh * 0.62);

      ctx.font = "700 12px system-ui, Arial";
      ctx.fillStyle = "rgba(255,255,255,0.70)";
      ctx.fillText("(Tap/Click center on mobile)", VIEW.gw / 2, VIEW.gh * 0.66);
    } else {
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.textAlign = "center";
      ctx.font = "900 18px system-ui, Arial";
      ctx.fillText("📸", VIEW.gw / 2, VIEW.gh * 0.44);
    }
  }
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

  function drawHallwayBackdrop(floorY) {
    drawPixelRect(0, 0, VIEW.gw, VIEW.gh, "#07162A");
    drawPixelRect(0, 0, VIEW.gw, floorY, "#0A1E36");
    drawPixelRect(0, 40, VIEW.gw, 2, "rgba(255,255,255,0.06)");

    drawPixelRect(0, 10, VIEW.gw, 16, "rgba(128,0,32,0.20)");
    drawPixelRect(0, 26, VIEW.gw, 2, "rgba(255,210,77,0.18)");

    const t = state.t * 1.2;
    const garY = 34;
    for (let i = 0; i < 28; i++) {
      const x = i * (VIEW.gw / 27);
      const wob = Math.round(Math.sin(t + i * 0.7) * 2);
      drawPixelRect(x - 1, garY + wob, 3, 3, "rgba(255,255,255,0.10)");
      const lit = (Math.sin(t * 2.2 + i) > 0.2);
      drawPixelRect(x - 1, garY + 6 + wob, 3, 3, lit ? "#FFD24D" : "rgba(255,255,255,0.20)");
    }

    drawPixelRect(0, floorY, VIEW.gw, VIEW.gh - floorY, "rgba(255,255,255,0.10)");
    for (let i = 0; i < 28; i++) {
      const x = i * 36 - (L1.phase === "carrot" ? (L1.camX * 0.35 % 36) : 0);
      drawPixelRect(x, floorY + 18, 2, VIEW.gh - floorY, "rgba(0,0,0,0.16)");
    }

    const baseX = (state.screen === "level1" && L1.phase === "carrot")
      ? (-(L1.camX * 0.55) % 110)
      : (-(state.t * 30) % 110);

    const lockerY = floorY - 140;
    for (let i = 0; i < 14; i++) {
      const x = baseX + i * 110 - 20;
      drawPixelRect(x, lockerY, 86, 132, "rgba(255,255,255,0.08)");
      drawPixelRect(x + 2, lockerY + 2, 82, 128, "rgba(0,0,0,0.28)");
      drawPixelRect(x + 8, lockerY + 10, 70, 4, "rgba(255,255,255,0.08)");
      drawPixelRect(x + 70, lockerY + 36, 6, 10, "rgba(255,255,255,0.08)");
    }
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

    drawPixelRect(px + 6, py + player.h - 3, player.w - 12, 3, "rgba(0,0,0,0.25)");

    drawPixelRect(cx - 1, headY - 1, headW + 2, headH + 2, "rgba(0,0,0,0.28)");
    drawPixelRect(cx, headY, headW, headH, st.skin);
    drawPixelRect(cx, headY, headW, 6, st.hair);

    const eyeY = headY + 8;
    if (player.facing === 1) {
      drawPixelRect(cx + 10, eyeY, 2, 2, "#1A1A1A");
      drawPixelRect(cx + 13, eyeY, 2, 2, "#1A1A1A");
    } else {
      drawPixelRect(cx + 3, eyeY, 2, 2, "#1A1A1A");
      drawPixelRect(cx + 6, eyeY, 2, 2, "#1A1A1A");
    }

    const bx = px + Math.round((player.w - bodyW) / 2);
    drawPixelRect(bx - 1, bodyY - 1, bodyW + 2, bodyH + 2, "rgba(0,0,0,0.28)");
    drawPixelRect(bx, bodyY, bodyW, bodyH, st.shirt);
    drawPixelRect(bx, bodyY + bodyH - 4, bodyW, 4, st.pants);

    const step = Math.round(Math.sin(state.t * 14) * 2 * speedMag);
    drawPixelRect(bx + 2, legY + Math.max(0, -step), 6, 9, st.pants);
    drawPixelRect(bx + bodyW - 8, legY + Math.max(0, step), 6, 9, st.pants);
  }
  function drawCarrot(cx, y, scale = 1) {
    const s = Math.max(1, Math.round(scale));
    const x = Math.round(cx);
    const yy = Math.round(y);

    drawPixelRect(x + 3 * s, yy + 3 * s, 10 * s, 10 * s, "rgba(0,0,0,0.25)");

    drawPixelRect(x + 6 * s, yy + 0 * s, 4 * s, 2 * s, "#2FE35F");
    drawPixelRect(x + 5 * s, yy + 2 * s, 6 * s, 2 * s, "#3CFF74");

    drawPixelRect(x + 4 * s, yy + 4 * s, 8 * s, 2 * s, "#FF9A3A");
    drawPixelRect(x + 5 * s, yy + 6 * s, 6 * s, 2 * s, "#FF8A2A");
    drawPixelRect(x + 6 * s, yy + 8 * s, 4 * s, 2 * s, "#FF7A1A");
    drawPixelRect(x + 7 * s, yy + 10 * s, 2 * s, 2 * s, "#FF5A00");
  }

  function drawCrate(x, y, w, h, opened, decoy) {
    const ox = Math.round(x);
    const oy = Math.round(y);
    const ww = Math.round(w);
    const hh = Math.round(h);

    const fill = opened ? "rgba(255,214,120,0.20)" : "#FFB74A";
    const slat = opened ? "rgba(120,70,10,0.18)" : "#B86A12";
    const outline = "rgba(0,0,0,0.30)";

    drawPixelRect(ox - 1, oy - 1, ww + 2, hh + 2, outline);
    drawPixelRect(ox, oy, ww, hh, fill);

    for (let i = 1; i <= 3; i++) {
      const yy = oy + Math.round((hh * i) / 4);
      drawPixelRect(ox + 5, yy - 2, ww - 10, 3, slat);
    }

    drawPixelRect(ox + 3, oy + 3, 2, 2, "rgba(255,255,255,0.22)");
    drawPixelRect(ox + ww - 5, oy + 3, 2, 2, "rgba(255,255,255,0.22)");

    if (opened) drawPixelRect(ox + 2, oy + 2, ww - 4, 4, "rgba(0,0,0,0.12)");

    if (opened && decoy) {
      drawPixelRect(ox + ww / 2 - 10, oy + hh / 2 - 2, 20, 4, "rgba(0,0,0,0.22)");
      drawPixelRect(ox + ww / 2 - 2, oy + hh / 2 - 10, 4, 20, "rgba(0,0,0,0.16)");
    }
  }

  function drawCup() {
    const c = L1.cup;
    drawPixelRect(c.x - 1, c.y - 1, c.w + 2, c.h + 2, "rgba(0,0,0,0.28)");
    drawPixelRect(c.x, c.y, c.w, c.h, "rgba(255,255,255,0.88)");
    drawPixelRect(c.x + 3, c.y + 3, c.w - 6, c.h - 6, "rgba(0,0,0,0.35)");
    drawPixelRect(c.x - 2, c.y - 2, c.w + 4, 3, "rgba(255,255,255,0.92)");
  }

  function drawBall(b) {
    drawPixelRect(b.x - b.r - 1, b.y - b.r - 1, b.r * 2 + 2, b.r * 2 + 2, "rgba(0,0,0,0.28)");
    drawPixelRect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2, "rgba(255,255,255,0.92)");
  }

  function drawJamie() {
    const floorY = VIEW.gh * 0.78;
    const x = Math.round(L1.jamie.x);
    const y = Math.round(floorY - 42);

    drawPixelRect(x, y + 16, 16, 20, "#FFD24D");
    drawPixelRect(x, y + 30, 16, 6, "#555555");
    drawPixelRect(x, y, 16, 16, "#FFD2B5");
    drawPixelRect(x, y, 16, 6, "#F2D16B");

    const clipFill = L1.jamie.clipT > 0 ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.35)";
    drawPixelRect(x + 18, y + 18, 10, 14, clipFill);
    drawPixelRect(x + 19, y + 20, 8, 2, "rgba(0,0,0,0.25)");
    if (L1.jamie.clipT > 0) drawPixelRect(x + 20, y + 26, 6, 2, "rgba(0,0,0,0.25)");
  }

  function drawLateIcons() {
    for (const ic of L1.lateIcons) {
      const x = Math.round(ic.x);
      const y = Math.round(ic.y);
      drawPixelRect(x - 1, y - 1, 14, 16, "rgba(0,0,0,0.20)");
      drawPixelRect(x, y, 12, 14, "rgba(255,255,255,0.85)");
      drawPixelRect(x + 2, y + 3, 8, 2, "rgba(0,0,0,0.25)");
      drawPixelRect(x + 2, y + 7, 6, 2, "rgba(0,0,0,0.18)");
    }
  }


function drawShelley() {
  const floorY = VIEW.gh * 0.78;
  const x = Math.round(L1.shelley.x);
  const y = Math.round(floorY - 44);

  // shadow
  drawPixelRect(x + 3, y + 42, 10, 3, "rgba(0,0,0,0.25)");

  // body (navy-ish blazer), skirt/pants, head
  drawPixelRect(x, y + 18, 16, 18, "#5B8CCB");
  drawPixelRect(x, y + 34, 16, 8, "#555555");
  drawPixelRect(x, y, 16, 16, "#FFD2B5");
  drawPixelRect(x, y, 16, 6, "#6B3B2A"); // hair

  // little IB pin
  drawPixelRect(x + 12, y + 24, 2, 2, "#FFD24D");

  // boost aura when active
  if (L1.boostLevel > 1) {
    const a = 0.12 + 0.06 * Math.sin(state.t * 10);
    drawPixelRect(x - 2, y - 2, 20, 48, `rgba(255,210,77,${a})`);
  }
}

function drawHallPosters() {
  const floorY = VIEW.gh * 0.78;

  const period = 300;
  const off = ((L1.camX || 0) * 0.45) % period;

  function poster(x, y, header, line1, line2, accent = "rgba(128,0,32,0.55)") {
    drawPixelRect(x, y, 92, 56, "rgba(255,255,255,0.14)");
    drawPixelRect(x + 2, y + 2, 88, 52, "rgba(0,0,0,0.35)");

    drawPixelRect(x + 2, y + 2, 88, 12, accent);
    ctx.fillStyle = "rgba(255,255,255,0.90)";
    ctx.font = "900 9px system-ui, Arial";
    ctx.textAlign = "left";
    ctx.fillText(header, x + 6, y + 11);

    ctx.fillStyle = "rgba(255,255,255,0.80)";
    ctx.font = "800 9px system-ui, Arial";
    ctx.fillText(line1, x + 8, y + 30);

    if (line2) {
      ctx.fillStyle = "rgba(255,255,255,0.60)";
      ctx.font = "700 8px system-ui, Arial";
      ctx.fillText(line2, x + 8, y + 42);
    }
  }

  if (L1.phase === "carrot") {
    for (let i = 0; i < 5; i++) {
      const x = Math.round(70 + i * period - off);
      const y = Math.round(floorY - 122);

      if (i % 2 === 0) {
        poster(x, y, "MISSING:", "March Hare", "Reward: 300");

        drawPixelRect(x + 64, y + 22, 10, 14, "rgba(255,255,255,0.18)");
        drawPixelRect(x + 62, y + 20, 4, 6, "rgba(255,255,255,0.18)");
        drawPixelRect(x + 70, y + 20, 4, 6, "rgba(255,255,255,0.18)");
      } else {
        poster(x, y, "IB", "Accelerated Learning", "", "rgba(20,60,120,0.55)");
      }
    }
  }

  if (L1.phase === "shot") {
    for (let i = 0; i < 6; i++) {
      const x = Math.round(60 + i * period - off);
      const y = Math.round(floorY - 122);
      poster(x, y, "IB", "Elevated Learning", "", "rgba(20,60,120,0.55)");
    }
  }

  if (L1.phase === "colouring") {
    for (let i = 0; i < 6; i++) {
      const x = Math.round(60 + i * period - off);
      const y = Math.round(floorY - 122);
      poster(x, y, "HTHS", "Christmas Colouring", "Color every square!", "rgba(0,110,70,0.55)");
    }
  }
}

function drawMarchHare() {
  if (L1.phase !== "carrot") return;
  const h = L1.hare;
  if (!h || !h.active) return;

  const sx = Math.round(h.x - L1.camX);
  const y = Math.round(h.y);

  const visible = (Math.sin(state.t * 18 + h.seed) > -0.15);
  if (!visible) return;

  // small fast hare sprite
  drawPixelRect(sx + 2, y + 12, 14, 2, "rgba(0,0,0,0.20)");
  drawPixelRect(sx + 4, y + 2, 4, 8, "rgba(255,255,255,0.80)"); // ear
  drawPixelRect(sx + 9, y + 1, 4, 9, "rgba(255,255,255,0.80)"); // ear
  drawPixelRect(sx + 4, y + 8, 14, 8, "rgba(255,255,255,0.78)"); // body
  drawPixelRect(sx + 15, y + 10, 4, 4, "rgba(255,255,255,0.78)"); // tail
  drawPixelRect(sx + 6, y + 11, 2, 2, "rgba(0,0,0,0.35)"); // eye
}

  function drawMichelle() {
    if (!L1.michelle.active) return;
    const floorY = VIEW.gh * 0.78;
    const x = Math.round(L1.michelle.x);
    const y = Math.round(floorY - 44);

    drawPixelRect(x, y + 18, 14, 18, "#B565D9");
    drawPixelRect(x, y, 14, 16, "#FFD2B5");
    drawPixelRect(x, y, 14, 5, "#FFD24D");
    drawPixelRect(x + 16, y + 18, 12, 8, "rgba(255,255,255,0.80)");
    drawPixelRect(x + 19, y + 20, 4, 4, "rgba(0,0,0,0.45)");
  }

  function drawPosers() {
    for (const p of L1.posers) {
      const x = Math.round(p.x);
      const y = Math.round(p.y);
      drawPixelRect(x, y, 10, 18, "rgba(255,255,255,0.20)");
      drawPixelRect(x - 3, y + 4, 3, 3, "rgba(255,255,255,0.18)");
      drawPixelRect(x + 10, y + 4, 3, 3, "rgba(255,255,255,0.18)");
    }
  }

  function drawWalkers() {
    for (const w of L1.walkers) {
      const x = Math.round(w.x);
      const y = Math.round(w.y);
      drawPixelRect(x, y, 10, 18, "rgba(255,255,255,0.10)");
      drawPixelRect(x + 2, y - 6, 6, 6, "rgba(255,255,255,0.10)");
    }
  }

  function drawShotLineExtras() {
    if (L1.phase !== "shot") return;
    const floorY = VIEW.gh * 0.78;
    for (let i = 0; i < 5; i++) {
      const x = Math.round(L1.cup.x - 50 - i * 18);
      const y = Math.round(floorY - 30);
      drawPixelRect(x, y, 10, 18, "rgba(255,255,255,0.14)");
      drawPixelRect(x + 2, y - 6, 6, 6, "rgba(255,255,255,0.14)");
    }
  }

  function drawColouringDesign(z) {
    const x = Math.round(z.x);
    const y = Math.round(z.y);
    const w = Math.round(z.w);
    const h = Math.round(z.h);

    // base fill
    ctx.fillStyle = z.fill || "rgba(255,255,255,0.85)";
    ctx.fillRect(x, y, w, h);

    // subtle outline
    ctx.fillStyle = "rgba(0,0,0,0.15)";
    ctx.fillRect(x, y, w, 1);
    ctx.fillRect(x, y + h - 1, w, 1);
    ctx.fillRect(x, y, 1, h);
    ctx.fillRect(x + w - 1, y, 1, h);

    // icon colour (contrast)
    const ink = (z.fill === "#FFFFFF") ? "rgba(0,0,0,0.25)" : "rgba(255,255,255,0.35)";
    if (z.design === "solid") return;

    ctx.fillStyle = ink;

    if (z.design === "star") {
      ctx.fillRect(x + w / 2 - 1, y + 2, 2, h - 4);
      ctx.fillRect(x + 2, y + h / 2 - 1, w - 4, 2);
      ctx.fillRect(x + 3, y + 3, 2, 2);
      ctx.fillRect(x + w - 5, y + 3, 2, 2);
      ctx.fillRect(x + 3, y + h - 5, 2, 2);
      ctx.fillRect(x + w - 5, y + h - 5, 2, 2);
    } else if (z.design === "tree") {
      ctx.fillRect(x + w / 2 - 1, y + h - 4, 2, 3); // trunk
      ctx.fillRect(x + 3, y + 6, w - 6, 2);
      ctx.fillRect(x + 4, y + 8, w - 8, 2);
      ctx.fillRect(x + 5, y + 10, w - 10, 2);
      ctx.fillRect(x + 6, y + 12, w - 12, 2);
    } else if (z.design === "snowman") {
      ctx.fillRect(x + w / 2 - 2, y + 5, 4, 4);
      ctx.fillRect(x + w / 2 - 3, y + 9, 6, 6);
      ctx.fillRect(x + w / 2 - 1, y + 6, 1, 1);
      ctx.fillRect(x + w / 2 + 1, y + 6, 1, 1);
    } else if (z.design === "bow") {
      ctx.fillRect(x + 3, y + h / 2 - 2, 4, 4);
      ctx.fillRect(x + w - 7, y + h / 2 - 2, 4, 4);
      ctx.fillRect(x + w / 2 - 1, y + h / 2 - 1, 2, 2);
    }
  }


  function drawConfetti() {
    for (const p of FX.confetti) drawPixelRect(p.x, p.y, p.s, p.s, p.c);
  }

  function drawSparkles() {
    for (const s of FX.sparkles) drawPixelRect(s.x, s.y, s.s, s.s, s.c);
  }

  function drawPhaseBanner(text, tLeft) {
    if (tLeft <= 0 || !text) return;

    const a = Math.min(1, tLeft * 1.2);
    ctx.fillStyle = `rgba(0,0,0,${0.40 * a})`;
    ctx.fillRect(0, 0, VIEW.gw, 64);

    ctx.fillStyle = `rgba(128,0,32,${0.60 * a})`;
    ctx.fillRect(VIEW.gw * 0.22, 16, VIEW.gw * 0.56, 32);
    ctx.fillStyle = `rgba(255,210,77,${0.50 * a})`;
    ctx.fillRect(VIEW.gw * 0.22, 46, VIEW.gw * 0.56, 2);

    ctx.fillStyle = `rgba(255,255,255,${0.95 * a})`;
    ctx.font = "900 18px system-ui, Arial";
    ctx.textAlign = "center";
    ctx.fillText(text, VIEW.gw / 2, 38);
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

  // -------------------- Level 1 draw (kept visually the same-ish) --------------------
  // NOTE: To keep this drop-in manageable, I’m not repeating your entire Level 1 draw helpers
  // that you pasted (crate, carrot, NPC drawings, colouring designs, etc.)
  // Instead: we keep Level 1 as “already working” by leaving your existing drawLevel1 block in place.
  //
  // ✅ QUICK FIX:
  // Copy/paste your original drawLevel1() and ALL the Level 1 draw helpers exactly as you had them
  // BETWEEN the markers below.
  //
  // -------------------- BEGIN: Your original Level 1 draw helpers + drawLevel1 --------------------
  // (PASTE YOUR ORIGINAL drawCarrot/drawCrate/drawCup/etc AND drawLevel1 HERE)
  // -------------------- END: Your original Level 1 draw helpers + drawLevel1 --------------------

  // ---- IMPORTANT: Because this is a single paste-and-run file, we include a minimal fail-safe:
  // If you forget to paste your original drawLevel1(), we’ll show a warning screen.
  
  function drawLevel1() {
    const floorY = VIEW.gh * 0.78;

    drawHallwayBackdrop(floorY);

    // NPC extras behind player
    drawWalkers();
    drawShotLineExtras();
    drawPosers();

    // phase visuals
    if (L1.phase === "carrot") {
      for (const box of L1.boxes) {
        const x = box.x - L1.camX;
        if (x < -160 || x > VIEW.gw + 160) continue;
        drawCrate(x, box.y, box.w, box.h, box.opened, box.decoy);
      }
      for (const c of L1.carrots) {
        const cx = c.x - L1.camX;
        ctx.save();
        if (c.collectedT > 0) ctx.globalAlpha = 0.55;
        drawCarrot(cx, c.y, c.scale || 1);
        ctx.restore();
      }
    }

    if (L1.phase === "shot") {
      drawCup();
      for (const b of L1.shots) drawBall(b);
    }

    if (L1.phase === "colouring") {
      // page frame
      ctx.fillStyle = "rgba(255,255,255,0.10)";
      ctx.fillRect(VIEW.gw * 0.40 - 122, floorY - 132, 244, 114);
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.fillRect(VIEW.gw * 0.40 - 118, floorY - 128, 236, 106);

      for (const z of L1.colouring.zones) {
        if (!z.filled) {
          ctx.fillStyle = "rgba(255,255,255,0.18)";
          ctx.fillRect(z.x, z.y, z.w, z.h);
        } else {
          drawColouringDesign(z);
        }
      }

      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.font = "800 14px system-ui, Arial";
      ctx.textAlign = "center";
      ctx.fillText("Christmas Colouring — fill every square!", VIEW.gw / 2, VIEW.gh * 0.18);
    }

    // NPCs foreground (phase-specific)
    if (L1.phase === "carrot") {
      drawHallPosters();
      drawMarchHare();
      drawShelley();
    } else if (L1.phase === "shot") {
      drawHallPosters();
      drawShelley();
    } else if (L1.phase === "colouring") {
      drawHallPosters();
      drawLateIcons();
      drawJamie();
    }
    drawMichelle();

    // player + FX
    drawChibiPlayer();
    drawSparkles();

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
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.textAlign = "right";
    if (L1.phase === "carrot") {
      ctx.fillText(`Phone: hold left/right • tap middle to jump`, VIEW.gw - 16, 60);
    } else if (L1.phase === "shot") {
      ctx.fillText(`Laptop: Enter to throw • Phone: tap top-right to throw`, VIEW.gw - 16, 60);
      ctx.fillText(`Hits: ${L1.shotHits} / Attempts: ${L1.shotAttempts}`, VIEW.gw - 16, 82);
    } else if (L1.phase === "colouring") {
      ctx.fillText(`Fill: ${L1.colouring.progress}/${L1.colouring.target}`, VIEW.gw - 16, 82);
      const rem = Math.max(0, L1.colouring.lateCap - L1.colouring.lateSpawned);
      ctx.fillText(`Late slips left: ${rem}`, VIEW.gw - 16, 104);
    }

    drawPhaseBanner();
    drawConfetti();

    if (L1.levelDone) {
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, 0, VIEW.gw, VIEW.gh);

      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.textAlign = "center";
      ctx.font = "900 28px system-ui, Arial";
      ctx.fillText("LEVEL 1 COMPLETE!", VIEW.gw / 2, VIEW.gh * 0.42);

      ctx.font = "800 16px system-ui, Arial";
      ctx.fillText("Nice work — ready for the next level?", VIEW.gw / 2, VIEW.gh * 0.50);

      ctx.font = "800 14px system-ui, Arial";
      ctx.fillStyle = "rgba(255,255,255,0.90)";
      ctx.fillText("Press Enter to start Level 2", VIEW.gw / 2, VIEW.gh * 0.57);

      ctx.font = "700 12px system-ui, Arial";
      ctx.fillStyle = "rgba(255,255,255,0.70)";
      ctx.fillText("(Tap/Click center on mobile)", VIEW.gw / 2, VIEW.gh * 0.61);

      ctx.font = "700 12px system-ui, Arial";
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.fillText("Press Esc to return to Character Select", VIEW.gw / 2, VIEW.gh * 0.66);
      }
  }


// -------------------- Level 2 draw --------------------

function drawFlashOverlay() {
  if (FX.flashT <= 0) return;
  ctx.save();
  ctx.fillStyle = `rgba(255,255,255,${Math.min(1, FX.flashT * 8)})`;
  ctx.fillRect(0, 0, VIEW.gw, VIEW.gh);
  ctx.restore();
}

function drawCoin(x, y, r) {
  // Slightly nicer “coin” (pixel-y circle with rim + shine)
  const xx = Math.round(x);
  const yy = Math.round(y);
  const R = Math.max(5, Math.round(r));

  // drop shadow
  drawPixelRect(xx - R - 2, yy - R - 1, R * 2 + 4, R * 2 + 3, "rgba(0,0,0,0.28)");

  // outer rim (approx circle)
  const rim = "#E0B93E";
  const fill = "#FFD24D";
  for (let dy = -R; dy <= R; dy++) {
    const w = Math.floor(Math.sqrt(Math.max(0, R * R - dy * dy)));
    drawPixelRect(xx - w, yy + dy, w * 2 + 1, 1, rim);
  }

  // inner fill
  const Ri = Math.max(2, R - 2);
  for (let dy = -Ri; dy <= Ri; dy++) {
    const w = Math.floor(Math.sqrt(Math.max(0, Ri * Ri - dy * dy)));
    drawPixelRect(xx - w, yy + dy, w * 2 + 1, 1, fill);
  }

  // small stamp + shine
  drawPixelRect(xx - 2, yy - 1, 4, 2, "rgba(0,0,0,0.18)");
  drawPixelRect(xx - Ri + 1, yy - Ri + 2, 3, 2, "rgba(255,255,255,0.28)");
}

function drawCredits() {
  drawPixelRect(0, 0, VIEW.gw, VIEW.gh, "#061425");
  drawPixelRect(0, 0, VIEW.gw, 34, "rgba(255,214,120,0.10)");

  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.textAlign = "center";
  ctx.font = "900 30px system-ui, Arial";
  ctx.fillText("CREDITS", VIEW.gw / 2, VIEW.gh * 0.20);

  ctx.font = "800 16px system-ui, Arial";
  ctx.fillStyle = "rgba(255,255,255,0.90)";
  ctx.fillText("HTHS Holiday Hallway Game", VIEW.gw / 2, VIEW.gh * 0.28);

  ctx.font = "700 14px system-ui, Arial";
  ctx.fillStyle = "rgba(255,255,255,0.80)";
  ctx.fillText("Created with Trojan spirit ✨", VIEW.gw / 2, VIEW.gh * 0.34);

  ctx.font = "800 16px system-ui, Arial";
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fillText(`Final Score: ${L3.score}`, VIEW.gw / 2, VIEW.gh * 0.46);

  ctx.font = "700 13px system-ui, Arial";
  ctx.fillStyle = "rgba(255,255,255,0.70)";
  ctx.fillText("Press Enter to return to the Title Screen", VIEW.gw / 2, VIEW.gh * 0.62);
  ctx.fillText("(Tap/Click center on mobile)", VIEW.gw / 2, VIEW.gh * 0.66);
}

function drawPoster(x, y, w, h, title, sub, accent = "#FFD24D") {
  drawPixelRect(x, y, w, h, "rgba(255,255,255,0.10)");
  drawPixelRect(x + 2, y + 2, w - 4, h - 4, "rgba(0,0,0,0.34)");
  drawPixelRect(x + 4, y + 4, w - 8, 4, "rgba(128,0,32,0.55)");
  drawPixelRect(x + 4, y + 10, w - 8, 2, "rgba(255,255,255,0.10)");
  drawPixelRect(x + 4, y + h - 10, w - 8, 2, "rgba(0,0,0,0.22)");
  drawPixelRect(x + 6, y + 16, w - 12, 3, accent);

  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = "900 10px system-ui, Arial";
  ctx.textAlign = "left";
  ctx.fillText(title, x + 8, y + 28);

  if (sub) {
    ctx.fillStyle = "rgba(255,255,255,0.70)";
    ctx.font = "800 9px system-ui, Arial";
    ctx.fillText(sub, x + 8, y + 42);
  }
}

function drawPriamNPC() {
  const p = L2.priam;
  if (!p.active) return;

  const x = Math.round(p.x - L2.camX);
  const y = Math.round(p.y);

  // shadow
  drawPixelRect(x + 7, y + p.h - 3, p.w - 14, 3, "rgba(0,0,0,0.25)");

  // toga (maroon)
  drawPixelRect(x + 6, y + 18, 22, 26, "rgba(190,0,60,0.95)");
  drawPixelRect(x + 8, y + 20, 18, 22, "rgba(255,255,255,0.18)");

  // head
  drawPixelRect(x + 9, y + 4, 16, 14, "#D6B08A");
  drawPixelRect(x + 9, y + 4, 16, 5, "#4A2A16");

  // crown
  drawPixelRect(x + 10, y + 2, 14, 2, "#FFE27A");
  drawPixelRect(x + 10, y + 0, 2, 2, "#FFE27A");
  drawPixelRect(x + 16, y + 0, 2, 2, "#FFE27A");
  drawPixelRect(x + 22, y + 0, 2, 2, "#FFE27A");

  // beggar bucket
  drawPixelRect(x + 24, y + 30, 8, 10, "rgba(0,0,0,0.35)");
  drawPixelRect(x + 25, y + 31, 6, 8, "rgba(255,255,255,0.14)");
  drawPixelRect(x + 26, y + 33, 4, 2, "#FFE27A");
}

function drawMarcyNPC() {
  const m = L2.marcy;
  if (!m.active) return;

  const x = Math.round(m.x - L2.camX);
  const y = Math.round(m.y);

  // shadow
  drawPixelRect(x + 7, y + m.h - 3, m.w - 14, 3, "rgba(0,0,0,0.25)");

  // jacket
  drawPixelRect(x + 6, y + 18, 22, 26, "rgba(123,214,255,0.78)");
  drawPixelRect(x + 8, y + 20, 18, 22, "rgba(255,255,255,0.22)");

  // head
  drawPixelRect(x + 9, y + 4, 16, 14, "#D1A98B");
  drawPixelRect(x + 9, y + 4, 16, 5, "#3A2A2A");

  // clipboard / signup sheet
  drawPixelRect(x + 2, y + 28, 8, 12, "rgba(255,255,255,0.14)");
  drawPixelRect(x + 3, y + 29, 6, 10, "rgba(0,0,0,0.25)");
  drawPixelRect(x + 4, y + 31, 4, 1, "#FFD24D");
  drawPixelRect(x + 4, y + 33, 4, 1, "rgba(255,255,255,0.35)");
  drawPixelRect(x + 4, y + 35, 4, 1, "rgba(255,255,255,0.35)");
}


function drawGaryNPC() {
  const g = L2.gary;
  if (!g.active) return;

  const x = Math.round(g.x - L2.camX);
  const y = Math.round(g.y);

  drawPixelRect(x + 7, y + g.h - 3, g.w - 14, 3, "rgba(0,0,0,0.25)");

  // suit jacket (dark) + tie (maroon)
  drawPixelRect(x + 6, y + 18, 22, 26, "rgba(90,120,180,0.86)");
  drawPixelRect(x + 16, y + 20, 2, 22, "rgba(128,0,32,0.90)");

  // head + hair
  drawPixelRect(x + 9, y + 4, 16, 14, "#D6B08A");
  drawPixelRect(x + 9, y + 4, 16, 5, "#3A2A2A");

  // thumbs up (pixel)
  drawPixelRect(x + 26, y + 28, 6, 6, "rgba(255,255,255,0.18)");
  drawPixelRect(x + 28, y + 30, 2, 2, "#FFD24D");
}

function drawChrisNPC() {
  const c = L2.chris;
  if (!c.active) return;

  const x = Math.round(c.x - L2.camX);
  const y = Math.round(c.y);

  drawPixelRect(x + 7, y + c.h - 3, c.w - 14, 3, "rgba(0,0,0,0.25)");

  // hoodie
  drawPixelRect(x + 6, y + 18, 22, 26, "rgba(255,167,38,0.72)");
  drawPixelRect(x + 8, y + 20, 18, 22, "rgba(255,255,255,0.20)");

  // head + hair
  drawPixelRect(x + 9, y + 4, 16, 14, "#D1A98B");
  drawPixelRect(x + 9, y + 4, 16, 5, "#2A2A2A");

  // tech stack (cord/laptop)
  drawPixelRect(x + 24, y + 26, 10, 6, "rgba(0,0,0,0.30)");
  drawPixelRect(x + 25, y + 27, 8, 4, "rgba(255,255,255,0.12)");
  drawPixelRect(x + 22, y + 34, 14, 3, "#7BD6FF");
}

function drawMichelleNPC_B() {
  const m = L2.michelle;
  if (!m.active) return;

  const x = Math.round(m.x - L2.camX);
  const y = Math.round(m.y);

  drawPixelRect(x + 7, y + 54 - 3, 20, 3, "rgba(0,0,0,0.25)");

  // dress/jacket
  drawPixelRect(x + 6, y + 18, 22, 26, "rgba(255,255,255,0.14)");
  drawPixelRect(x + 8, y + 20, 18, 22, "rgba(128,0,32,0.35)");

  // head + hair
  drawPixelRect(x + 9, y + 4, 16, 14, "#FFD2B5");
  drawPixelRect(x + 9, y + 4, 16, 5, "#4A2A16");

  // camera
  drawPixelRect(x + 2, y + 28, 10, 8, "rgba(0,0,0,0.35)");
  drawPixelRect(x + 4, y + 30, 6, 4, "rgba(255,255,255,0.12)");
  drawPixelRect(x + 6, y + 31, 2, 2, "#FFD24D");
}

function drawLevel2() {
  const floorY = VIEW.gh * 0.78;

  if (L2.phase === "trek") {
    // ---------------- Phase A: Trojan Trek ----------------
    drawHallwayBackdrop(floorY);

    // Stable alternating posters
    const posterCam = L2.camX * 0.70;
    const startN = Math.floor((posterCam - 240) / 240);
    const endN = Math.floor((posterCam + VIEW.gw + 480) / 240);

    for (let n = startN; n <= endN; n++) {
      const px = (n * 240 + 40) - posterCam;
      const py = floorY - 170;

      const k = ((n % 3) + 3) % 3; // 0: Helen & Paris, 1: Trojan Trek, 2: Trail Relay
      if (k === 0) drawPoster(px, py, 150, 88, "HELEN & PARIS", "Toga Contest • Vote!", "#FFD24D");
      if (k === 1) drawPoster(px, py, 150, 88, "TROJAN TREK", "Donate • Cheer • Run", "#2FAE5A");
      if (k === 2) drawPoster(px, py, 150, 88, "TRAIL RELAY", "Join the team!", "#7BD6FF");
    }

    // Platforms
    for (const p of L2.platforms) {
      const x = p.x - L2.camX;
      if (x + p.w < -80 || x > VIEW.gw + 80) continue;
      const col = (p.y >= floorY) ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.16)";
      drawPixelRect(x, p.y, p.w, p.h, col);
      drawPixelRect(x, p.y, p.w, 2, "rgba(0,0,0,0.22)");
    }

    // Coins
    for (const c of L2.coins) {
      if (!c.alive) continue;
      const cx = c.x - L2.camX;
      const cy = c.y + Math.sin(c.bob) * 3;
      if (cx < -40 || cx > VIEW.gw + 40) continue;
      drawCoin(cx, cy, c.r);
    }

    // NPCs
    drawPriamNPC();
    drawMarcyNPC();

    // Player + FX
    drawChibiPlayer();
    drawSparkles();
    drawConfetti();

    // HUD
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.font = "700 16px system-ui, Arial";
    ctx.textAlign = "left";
    ctx.fillText(`Level 2 — Trojan Trek`, 16, 38);
    ctx.fillText(`Phase A: Donations Dash`, 16, 60);
    ctx.fillText(`Score: ${L2.score}`, 16, 82);

    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = "800 13px system-ui, Arial";
    ctx.fillText(`💰 Donations: ${L2.collected}`, 16, 106);
    if (L2.stolen > 0) ctx.fillText(`(Priam stole: ${L2.stolen})`, 16, 126);

    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.font = "800 16px system-ui, Arial";
    ctx.fillText(`Time: ${Math.ceil(L2.phaseT)}s`, VIEW.gw - 16, 38);

    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = "700 13px system-ui, Arial";
    ctx.fillText(`Back: Esc`, VIEW.gw - 16, 60);
    if (L2.slowT > 0) ctx.fillText(`Slowed: ${Math.ceil(L2.slowT)}s`, VIEW.gw - 16, 82);

    drawPhaseBanner(L2.bannerText, L2.bannerT);
    return;
  }

  // ---------------- Phase B: Fill the Bus ----------------
  // Winter-y backdrop (cooler tint over hallway)
  drawHallwayBackdrop(floorY);
  drawPixelRect(0, 0, VIEW.gw, floorY, "rgba(120,180,255,0.10)");

  // Snowflakes
  for (let i = 0; i < 60; i++) {
    const fx = (i * 43 + (state.t * 38) * (0.6 + (i % 5) * 0.12)) % (VIEW.gw + 40) - 20;
    const fy = (i * 29 + state.t * (26 + (i % 7) * 3)) % (floorY - 30) + 20;
    drawPixelRect(fx, fy, 2, 2, "rgba(255,255,255,0.55)");
  }

  // Christmas decorations (garland + lights)
  const garY2 = 42;
  drawPixelRect(0, garY2, VIEW.gw, 2, "rgba(46,227,95,0.45)");
  for (let i = 0; i < 30; i++) {
    const x = i * (VIEW.gw / 29);
    const wob = Math.round(Math.sin(state.t * 1.6 + i * 0.7) * 2);
    // hanging bulbs
    const on = (Math.sin(state.t * 3.2 + i * 1.1) > 0.25);
    drawPixelRect(x - 1, garY2 + 6 + wob, 3, 3, on ? "#FFD24D" : "rgba(255,255,255,0.20)");
    drawPixelRect(x - 1, garY2 + 10 + wob, 3, 3, "rgba(255,90,0,0.55)");
    // little strand
    drawPixelRect(x, garY2 + wob, 1, 6, "rgba(46,227,95,0.35)");
  }
  // simple wreaths on a few lockers
  for (let i = 0; i < 3; i++) {
    const wx = 140 + i * 280 - ((L2.camX * 0.45) % 560);
    const wy = floorY - 120;
    drawPixelRect(wx - 10, wy - 10, 20, 20, "rgba(0,0,0,0.18)");
    drawPixelRect(wx - 9, wy - 9, 18, 18, "rgba(46,227,95,0.55)");
    drawPixelRect(wx - 5, wy - 5, 10, 10, "rgba(0,0,0,0.22)");
    drawPixelRect(wx - 2, wy - 9, 4, 4, "rgba(255,90,0,0.80)");
  }


  // Posters
  const posterCam = L2.camX * 0.70;
  const startN = Math.floor((posterCam - 260) / 260);
  const endN = Math.floor((posterCam + VIEW.gw + 520) / 260);
  for (let n = startN; n <= endN; n++) {
    const px = (n * 260 + 40) - posterCam;
    const py = floorY - 170;

    const k = ((n % 3) + 3) % 3;
    if (k === 0) drawPoster(px, py, 160, 88, "FILL THE BUS", "Bring food donations!", "#7BD6FF");
    if (k === 1) drawPoster(px, py, 160, 88, "COMMUNITY", "Together we can.", "#FFD24D");
    if (k === 2) drawPoster(px, py, 160, 88, "THANK YOU!", "Moncton supports.", "#2FAE5A");
  }

  // Bus filling in background (more bus-like)
  const busX = VIEW.gw - 240;
  const busY = floorY - 128;

  // soft shadow
  drawPixelRect(busX - 3, busY - 2, 226, 96, "rgba(0,0,0,0.28)");

  // bus body
  drawPixelRect(busX, busY + 8, 220, 78, "rgba(255, 213, 74, 0.85)");      // yellow body
  drawPixelRect(busX, busY + 72, 220, 14, "rgba(0,0,0,0.18)");             // lower trim
  drawPixelRect(busX + 2, busY + 10, 216, 74, "rgba(255,255,255,0.06)");   // subtle highlight

  // windows row
  const winY = busY + 18;
  const winH = 22;
  for (let i = 0; i < 6; i++) {
    const wx = busX + 14 + i * 28;
    drawPixelRect(wx, winY, 22, winH, "rgba(110, 190, 255, 0.55)");
    drawPixelRect(wx, winY + 1, 22, 2, "rgba(255,255,255,0.20)");
  }

  // driver window + windshield
  drawPixelRect(busX + 182, winY - 2, 30, winH + 6, "rgba(110, 190, 255, 0.58)");
  drawPixelRect(busX + 184, winY - 1, 26, 2, "rgba(255,255,255,0.22)");

  // door
  drawPixelRect(busX + 156, busY + 18, 18, 58, "rgba(0,0,0,0.20)");
  drawPixelRect(busX + 158, busY + 22, 14, 50, "rgba(110, 190, 255, 0.40)");
  drawPixelRect(busX + 165, busY + 22, 1, 50, "rgba(255,255,255,0.18)");

  // headlights + bumper
  drawPixelRect(busX + 212, busY + 64, 6, 8, "rgba(255,245,190,0.85)");
  drawPixelRect(busX + 210, busY + 74, 10, 6, "rgba(0,0,0,0.25)");

  // wheels
  const wheelY = busY + 80;
  const wheel = (x) => {
    drawPixelRect(x, wheelY, 26, 10, "rgba(0,0,0,0.85)");
    drawPixelRect(x + 7, wheelY + 2, 12, 6, "rgba(180,180,180,0.55)");
  };
  wheel(busX + 36);
  wheel(busX + 154);

  // fill meter inside bus (cargo area)
  const fill = clamp((L2.deliveredFood + L2.carryFood) / 20, 0, 1);
  const cargoX = busX + 10;
  const cargoY = busY + 52;
  const cargoW = 140;
  const cargoH = 30;
  drawPixelRect(cargoX, cargoY, cargoW, cargoH, "rgba(0,0,0,0.18)");
  drawPixelRect(cargoX + 2, cargoY + cargoH - 2 - Math.round((cargoH - 4) * fill), cargoW - 4, Math.round((cargoH - 4) * fill), "rgba(123,214,255,0.35)");

  // label
  ctx.fillStyle = "rgba(0,0,0,0.60)";
  ctx.font = "900 10px system-ui, Arial";
  ctx.textAlign = "center";
  ctx.fillText("SCHOOL BUS", busX + 110, busY + 16);

  // Crates labelled “Community”
  const crateCam = L2.camX * 0.85;
  for (let i = -1; i < 5; i++) {
    const cx = (i * 340 + 120) - (crateCam % 340);
    const cy = floorY - 44;
    drawPixelRect(cx - 1, cy - 1, 66, 46, "rgba(0,0,0,0.25)");
    drawPixelRect(cx, cy, 64, 44, "rgba(255,183,74,0.55)");
    drawPixelRect(cx + 6, cy + 10, 52, 4, "rgba(0,0,0,0.20)");
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.font = "900 9px system-ui, Arial";
    ctx.textAlign = "center";
    ctx.fillText("COMMUNITY", cx + 32, cy + 28);
  }

  // Platforms
  for (const p of L2.platforms) {
    const x = p.x - L2.camX;
    if (x + p.w < -80 || x > VIEW.gw + 80) continue;
    const col = (p.y >= floorY) ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.16)";
    drawPixelRect(x, p.y, p.w, p.h, col);
    drawPixelRect(x, p.y, p.w, 2, "rgba(0,0,0,0.22)");
  }

  // Snow piles
  for (const s of L2.snow) {
    const sx = s.x - L2.camX;
    if (sx < -80 || sx > VIEW.gw + 80) continue;
    drawSnowPile(sx, s.y, s.w, s.h);
  }

  // Food items
  for (const f of L2.foods) {
    if (!f.alive) continue;
    const fx = f.x - L2.camX;
    if (fx < -60 || fx > VIEW.gw + 60) continue;
    drawFoodItem(fx, f.y, f.kind);
  }

  // NPCs
  drawGaryNPC();
  drawChrisNPC();
  drawMichelleNPC_B();

  // Player + FX
  drawChibiPlayer();
  drawSparkles();
  drawConfetti();

  // HUD
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.font = "700 16px system-ui, Arial";
  ctx.textAlign = "left";
  ctx.fillText(`Level 2 — Fundraising Season`, 16, 38);
  ctx.fillText(`Phase B: Fill the Bus`, 16, 60);
  ctx.fillText(`Score: ${L2.score}`, 16, 82);

  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.font = "800 13px system-ui, Arial";
  ctx.fillText(`🥫 Carrying: ${L2.carryFood}`, 16, 106);
  ctx.fillText(`Delivered: ${L2.deliveredFood}`, 16, 126);

  const items = L2.carryFood + L2.carryTech;
  const jm = clamp(1 - items * 0.25, 0, 1);
  ctx.fillText(`Hands full: ${items} • Jump: ${Math.round(jm * 100)}%`, 16, 146);

  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.font = "800 16px system-ui, Arial";
  ctx.fillText(`Time: ${Math.ceil(L2.phaseT)}s`, VIEW.gw - 16, 38);

  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.font = "700 13px system-ui, Arial";
  ctx.fillText(`Back: Esc`, VIEW.gw - 16, 60);
  if (L2.techT > 0) ctx.fillText(`Tech clutter: ${Math.ceil(L2.techT)}s`, VIEW.gw - 16, 82);
  else if (L2.slipT > 0) ctx.fillText(`Slipping…`, VIEW.gw - 16, 82);

  drawPhaseBanner(L2.bannerText, L2.bannerT);

  if (L2.done) {
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, VIEW.gw, VIEW.gh);

    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.textAlign = "center";
    ctx.font = "900 28px system-ui, Arial";
    ctx.fillText("FOOD DELIVERED.", VIEW.gw / 2, VIEW.gh * 0.42);

    ctx.font = "800 16px system-ui, Arial";
    ctx.fillText("Community support loaded up — thank you!", VIEW.gw / 2, VIEW.gh * 0.50);

    // Donation meter
    const meterW = 320, meterH = 16;
    const mx = VIEW.gw / 2 - meterW / 2;
    const my = VIEW.gh * 0.58;
    drawPixelRect(mx - 2, my - 2, meterW + 4, meterH + 4, "rgba(0,0,0,0.35)");
    drawPixelRect(mx, my, meterW, meterH, "rgba(255,255,255,0.12)");
    const f = clamp(L2.deliveredFood / 20, 0, 1);
    drawPixelRect(mx + 2, my + 2, Math.round((meterW - 4) * f), meterH - 4, "rgba(123,214,255,0.55)");

    ctx.font = "800 14px system-ui, Arial";
    ctx.fillStyle = "rgba(255,255,255,0.90)";
    ctx.fillText("Press Enter to start Level 3", VIEW.gw / 2, VIEW.gh * 0.66);

    ctx.font = "700 12px system-ui, Arial";
    ctx.fillStyle = "rgba(255,255,255,0.70)";
    ctx.fillText("(Tap/Click center on mobile)", VIEW.gw / 2, VIEW.gh * 0.70);

    ctx.font = "700 12px system-ui, Arial";
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillText("Press Esc to return to Character Select", VIEW.gw / 2, VIEW.gh * 0.75);
  }
}

  // -------------------- Keyboard controls --------------------
  window.addEventListener("keydown", (e) => {
    ensureAudio();
    keys.add(e.key);

    // Credits: return to title
    if (state.screen === "credits" && (e.key === "Enter" || e.key === " ")) {
      state.screen = "title";
      SFX.start();
      return;
    }

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
      if (
        (L1.phase === "carrot" || L1.phase === "colouring") &&
        (e.key === " " || e.key === "ArrowUp" || e.key === "w" || e.key === "W") &&
        player.onGround
      ) {
        player.vy = -PHYS.jumpV;
        player.onGround = false;
        SFX.jump();
      }

      if (L1.phase === "shot" && e.key === "Enter") fireShot();

      // NEW: Proceed to Level 2 from Level 1 Complete
      if (L1.levelDone && (e.key === "Enter" || e.key === " ")) {
        resetLevel2();
        state.screen = "level2";
        SFX.start();
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

    if (state.screen === "level2") {
      if ((e.key === " " || e.key === "ArrowUp" || e.key === "w" || e.key === "W") && player.onGround && !L2.done) {
        const items = (L2.carryFood + L2.carryTech);
        const jm = clamp(1 - items * 0.25, 0, 1);
        if (L2.noJumpT <= 0 && jm > 0.01) {
          let jumpMult = 1.0;
          if (isChar("Devin")) {
            jumpMult = (L2.phase === "bus") ? 2.0 : 1.35;
          }
          player.vy = -PHYS.jumpV * jm * jumpMult;
          player.onGround = false;
          SFX.jump();
        } else {
          SFX.tick();
        }
      }

      
// Proceed to Level 3 from Level 2 Complete
if (L2.done && (e.key === "Enter" || e.key === " ")) {
  resetLevel3();
  state.screen = "level3";
  SFX.start();
}

if (e.key === "Escape") {
        state.screen = "select";
        resetLevel1();
        SFX.tick();
      }
      if (e.key === "r" || e.key === "R") {
        resetLevel2();
        SFX.tick();
      }
    }

    // Level 3 (keyboard): jump like other levels, unless currently "caught" by the carolers.
    if (state.screen === "level3") {
      if ((e.key === " " || e.key === "ArrowUp" || e.key === "w" || e.key === "W") && player.onGround && !L3.done) {
        if (L3.caughtT <= 0) {
          player.vy = -PHYS.jumpV;
          player.onGround = false;
          SFX.jump();
        } else {
          SFX.tick();
        }
      }

      // When Level 3 is done, proceed to credits (same as tap center)
      if (L3.done && (e.key === "Enter" || e.key === " ")) {
        state.screen = "credits";
        SFX.start();
      }

      if (e.key === "Escape") {
        state.screen = "select";
        resetLevel1();
        SFX.tick();
      }
      if (e.key === "r" || e.key === "R") {
        resetLevel3();
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

    // Level 3: allow jumping (disabled only while caught by carolers)
    if (state.screen === "level3") {
      if ((e.key === " " || e.key === "ArrowUp" || e.key === "w" || e.key === "W") && player.onGround && !L3.done) {
        if (L3.caughtT <= 0) {
          player.vy = -PHYS.jumpV;
          player.onGround = false;
          SFX.jump();
        } else {
          SFX.tick();
        }
      }
      // (Other Level 3 key handling remains unchanged elsewhere)
    }


    if (state.screen === "level1") {
      // If Level 1 complete: tap center to go to Level 2
      if (L1.levelDone && gx >= VIEW.gw * 0.33 && gx <= VIEW.gw * 0.66) {
        resetLevel2();
        state.screen = "level2";
        SFX.start();
        return;
      }

      if (L1.phase === "carrot" || L1.phase === "colouring") {
        if (gx >= VIEW.gw * 0.33 && gx <= VIEW.gw * 0.66) {
          if (player.onGround) { player.vy = -PHYS.jumpV; player.onGround = false; SFX.jump(); }
          clearTouch();
        } else {
          setTouchFromGX(gx);
        }
      } else if (L1.phase === "shot") {
        if (gx > VIEW.gw * 0.66 && gy < VIEW.gh * 0.35) {
          fireShot();
        } else {
          setTouchFromGX(gx);
        }
      }
      return;
    }

    if (state.screen === "level1") {
  // On mobile: tap/click center on Level 1 Complete screen to continue
  if (L1.levelDone) {
    if (gx >= VIEW.gw * 0.33 && gx <= VIEW.gw * 0.66) {
      resetLevel2();
      state.screen = "level2";
      SFX.start();
    }
    return;
  }

  // Phase A/C jump (center tap) handled via touch controls below; left/right for movement
  if (gx >= VIEW.gw * 0.33 && gx <= VIEW.gw * 0.66) {
    if ((L1.phase === "carrot" || L1.phase === "colouring") && player.onGround) {
      player.vy = -PHYS.jumpV;
      player.onGround = false;
      SFX.jump();
    }
    clearTouch();
  } else {
    setTouchFromGX(gx);
  }
  return;
}

    if (state.screen === "level2") {
// If Level 2 complete: tap center to go to Level 3
if (L2.done && gx >= VIEW.gw * 0.33 && gx <= VIEW.gw * 0.66) {
  resetLevel3();
  state.screen = "level3";
  SFX.start();
  return;
}

      if (gx >= VIEW.gw * 0.33 && gx <= VIEW.gw * 0.66) {
        if (player.onGround && !L2.done) {
          const items = (L2.carryFood + L2.carryTech);
          const jm = clamp(1 - items * 0.25, 0, 1);
          if (L2.noJumpT <= 0 && jm > 0.01) {
            player.vy = -PHYS.jumpV * jm;
            player.onGround = false;
            SFX.jump();
          } else {
            SFX.tick();
          }
        }
        clearTouch();
      } else {
        setTouchFromGX(gx);
      }

if (state.screen === "level3") {
  if (gx >= VIEW.gw * 0.33 && gx <= VIEW.gw * 0.66) {
    if (L3.done) {
      state.screen = "credits";
      SFX.start();
      clearTouch();
      return;
    }
    if (player.onGround && !L3.done && L3.caughtT <= 0) { player.vy = -PHYS.jumpV; player.onGround = false; SFX.jump(); }
    clearTouch();
  } else {
    setTouchFromGX(gx);
  }
  return;
}

      return;
    }
  });

  canvas.addEventListener("pointermove", (e) => {
    if (e.buttons !== 1) return;
    const { gx } = screenToGame(e.clientX, e.clientY);
    if (!inGameBounds(gx, 1)) return;

    if (state.screen === "level1" || state.screen === "level2" || state.screen === "level3") {
      setTouchFromGX(gx);
    }
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

    ctx.save();
    ctx.translate(VIEW.ox, VIEW.oy);
    ctx.scale(VIEW.scale, VIEW.scale);

    if (state.screen === "title") drawTitle();
    else if (state.screen === "select") drawSelect();
    else if (state.screen === "level1") {
      updateLevel1(dt);
      // If you pasted your original drawLevel1(), it will run.
      // Otherwise: fail-safe message.
      if (typeof drawLevel1 === "function") drawLevel1();
      else drawLevel1();
    }
    else if (state.screen === "level2") {
      updateLevel2(dt);
      drawLevel2();
    }
    else if (state.screen === "level3") {
      updateLevel3(dt);
      drawLevel3();
    }
    else if (state.screen === "credits") {
      drawCredits();
    }

    drawFlashOverlay();

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
