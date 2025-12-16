(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  // -------------------- Global state --------------------
  const state = {
    w: 0,
    h: 0,
    t: 0,
    muted: false,
    screen: "title", // title -> select -> level1 -> level2 -> end2
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
    thud: () => beep({ type: "sawtooth", f0: 140, f1: 90, dur: 0.10, gain: 0.06 }),
    cheer: () => beep({ type: "triangle", f0: 740, f1: 1220, dur: 0.14, gain: 0.06 }),
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
    bp1.frequency.value = 420;
    bp1.Q.value = 0.8;

    const bp2 = audioCtx.createBiquadFilter();
    bp2.type = "bandpass";
    bp2.frequency.value = 820;
    bp2.Q.value = 1.0;

    const mix1 = audioCtx.createGain();
    mix1.gain.value = 0.6;
    const mix2 = audioCtx.createGain();
    mix2.gain.value = 0.4;

    const lfo = audioCtx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.19;

    const lfoGain = audioCtx.createGain();
    lfoGain.gain.value = 0.014;
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

  // -------------------- Shared physics/player --------------------
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

  // Confetti particles + camera flash
  const FX = { confetti: [], flashT: 0 };

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

  function updateFX(dt) {
    for (const p of FX.confetti) {
      p.t += dt;
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    FX.confetti = FX.confetti.filter(p => p.life > 0 && p.y < VIEW.gh + 80);
    if (FX.flashT > 0) FX.flashT -= dt;
  }

  function drawConfetti() {
    for (const p of FX.confetti) {
      ctx.fillStyle = p.c;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s);
    }
  }

  // -------------------- Utils --------------------
  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
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

  // -------------------- Level 1 (your current, intact) --------------------
  const L1 = {
    camX: 0,
    speed: 220,
    score: 0,
    phase: "carrot", // carrot -> shot -> colouring
    timeInLevel: 0,
    phaseStartT: 0,
    levelDone: false,

    boxes: [],
    carrots: [],
    nextBoxX: 360,

    shots: [],
    shotHits: 0,
    shotAttempts: 0,
    shotCooldown: 0,
    cup: { x: 0, y: 0, w: 30, h: 18 },

    colouring: { progress: 0, target: 0, zones: [], done: false },

    // NPCs / hallway life
    jamie: { x: 210, dir: 1, speed: 24, clipT: 0 },
    lateIcons: [],
    nextLateT: 1.2,

    michelle: { active: false, x: 0, t: 0 },
    nextMichelleT: 6.0,
    posers: [],

    walkers: [],
    nextWalkerT: 1.0,
  };

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

    L1.colouring.zones = [];
    L1.colouring.progress = 0;
    L1.colouring.target = 0;
    L1.colouring.done = false;

    L1.jamie = { x: 210, dir: 1, speed: 24, clipT: 0 };
    L1.lateIcons = [];
    L1.nextLateT = 1.2;

    L1.michelle = { active: false, x: 0, t: 0 };
    L1.nextMichelleT = 6.0;
    L1.posers = [];

    L1.walkers = [];
    L1.nextWalkerT = 1.0;

    FX.confetti = [];
    FX.flashT = 0;

    player.x = 140;
    player.y = 0;
    player.vx = 0;
    player.vy = 0;
    player.onGround = false;
    player.facing = 1;
  }

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
        x: box.x + box.w / 2 - 8,
        y: box.y - 10,
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

  function initShotPhase() {
    L1.phase = "shot";
    L1.phaseStartT = L1.timeInLevel;
    L1.shots = [];
    L1.shotHits = 0;
    L1.shotAttempts = 0;
    L1.shotCooldown = 0;
    L1.cup = { x: VIEW.gw - 92, y: 96, w: 30, h: 18 };
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

    vx += (Math.random() * 2 - 1) * 70;
    vy += (Math.random() * 2 - 1) * 110;

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
        L1.score += 250;
        SFX.swish();
      }
      if (b.x < -40 || b.x > VIEW.gw + 60 || b.y > VIEW.gh + 60) b.alive = false;
    }

    L1.shots = L1.shots.filter(s => s.alive);
    if (L1.shotCooldown > 0) L1.shotCooldown -= dt;
  }

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
    L1.colouring.target = zones.length;
    L1.colouring.done = false;
  }

  // NPCs: Jamie, Michelle, walkers
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

    const j = L1.jamie;
    j.x += j.dir * j.speed * dt;
    if (j.x < 120) { j.x = 120; j.dir = 1; }
    if (j.x > VIEW.gw * 0.50) { j.x = VIEW.gw * 0.50; j.dir = -1; }
    if (j.clipT > 0) j.clipT -= dt;

    L1.nextLateT -= dt;
    if (L1.nextLateT <= 0) {
      L1.nextLateT = (L1.phase === "colouring") ? 0.9 + Math.random() * 0.9 : 1.3 + Math.random() * 1.5;
      spawnLateIcon();
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
      }
      if (ic.t > 7) ic.alive = false;
    }
    L1.lateIcons = L1.lateIcons.filter(a => a.alive);

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

  // Sprites: carrot + crate + cup/ball + NPCs
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

  function drawJamie() {
    const floorY = VIEW.gh * 0.78;
    const x = Math.round(L1.jamie.x);
    const y = Math.round(floorY - 42);

    drawPixelRect(x, y + 16, 16, 20, "#FFD24D");
    drawPixelRect(x, y + 30, 16, 6, "#2B2B2B");
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
      drawPixelRect(x, y, 12, 14, "rgba(255,255,255,0.85)");
      drawPixelRect(x + 2, y + 3, 8, 2, "rgba(0,0,0,0.25)");
      drawPixelRect(x + 2, y + 7, 6, 2, "rgba(0,0,0,0.18)");
    }
  }

  function drawMichelle() {
    if (!L1.michelle.active) return;
    const floorY = VIEW.gh * 0.78;
    const x = Math.round(L1.michelle.x);
    const y = Math.round(floorY - 44);

    drawPixelRect(x, y + 18, 14, 18, "#6B3B2A");
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

  function updateLevel1(dt) {
    const floorY = VIEW.gh * 0.78;
    L1.timeInLevel += dt;

    if (L1.phase === "carrot" && L1.timeInLevel > 40) initShotPhase();
    if (L1.phase === "shot" && (L1.timeInLevel - L1.phaseStartT) > 30) initColouringPhase();

    if (L1.phase === "carrot") L1.camX += L1.speed * dt;

    const left = touch.left || keys.has("ArrowLeft") || keys.has("a") || keys.has("A");
    const right = touch.right || keys.has("ArrowRight") || keys.has("d") || keys.has("D");

    player.vx = 0;
    if (left) player.vx -= PHYS.moveSpeed;
    if (right) player.vx += PHYS.moveSpeed;

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
          L1.colouring.progress += 1;
          if ((L1.colouring.progress % 3) === 0) SFX.tick();
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

    ctx.fillStyle = "#06101A";
    ctx.fillRect(0, 0, VIEW.gw, VIEW.gh);

    drawPixelRect(0, floorY, VIEW.gw, VIEW.gh - floorY, "rgba(255,255,255,0.10)");

    drawWalkers();
    drawShotLineExtras();
    drawPosers();

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
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.fillRect(VIEW.gw * 0.40 - 120, floorY - 130, 240, 110);

      for (const z of L1.colouring.zones) {
        ctx.fillStyle = z.filled ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.18)";
        ctx.fillRect(z.x, z.y, z.w, z.h);
      }

      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.font = "800 14px system-ui, Arial";
      ctx.textAlign = "center";
      ctx.fillText("Christmas Colouring — fill every square!", VIEW.gw / 2, VIEW.gh * 0.18);
    }

    drawLateIcons();
    drawJamie();
    drawMichelle();

    drawChibiPlayer();

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
      ctx.fillText(`Fill: ${L1.colouring.progress}/${L1.colouring.target}`, VIEW.gw - 16, 82);
    }

    drawConfetti();

    if (FX.flashT > 0) {
      ctx.fillStyle = `rgba(255,255,255,${Math.min(1, FX.flashT * 8)})`;
      ctx.fillRect(0, 0, VIEW.gw, VIEW.gh);
    }

    if (L1.levelDone) {
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, 0, VIEW.gw, VIEW.gh);

      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.textAlign = "center";
      ctx.font = "900 28px system-ui, Arial";
      ctx.fillText("LEVEL 1 COMPLETE!", VIEW.gw / 2, VIEW.gh * 0.40);

      ctx.font = "800 16px system-ui, Arial";
      ctx.fillText("Press Enter / Tap to start Level 2", VIEW.gw / 2, VIEW.gh * 0.49);

      ctx.font = "700 13px system-ui, Arial";
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.fillText("Press Esc to return to Character Select", VIEW.gw / 2, VIEW.gh * 0.58);
    }
  }

  // -------------------- Level 2: Trojan Trek & Fill the Bus --------------------
  const L2 = {
    phase: "trek", // trek -> bus
    t: 0,
    phaseT: 0,
    done: false,

    camX: 0,
    baseSpeed: 320,
    slowMult: 1,
    slowT: 0,

    score: 0,
    donations: 0,
    food: 0,

    pickups: [],      // {x,y,kind,alive}
    nextPickX: 220,

    // Obstacles / NPCs
    priam: { x: 0, y: 0, w: 34, h: 46, active: true, stealCooldown: 0 },
    marcy: { x: 0, y: 0, w: 34, h: 46, active: true, slowCooldown: 0 },

    gary: { x: 0, y: 0, w: 34, h: 46, active: true, hiT: 0 },
    chris: { x: 0, y: 0, w: 34, h: 46, active: true, giveCooldown: 0 },

    snow: [],         // {x,y,w,h,alive}
    nextSnowX: 380,

    busFill: 0,       // 0..1 visual meter
    encumbered: false,
    encT: 0,

    michelle: { active: false, x: 0, t: 0 },
    nextMichelle: 12,

    bannerT: 0,       // phase transition banner
  };

  function resetLevel2() {
    L2.phase = "trek";
    L2.t = 0;
    L2.phaseT = 0;
    L2.done = false;

    L2.camX = 0;
    L2.baseSpeed = 320;
    L2.slowMult = 1;
    L2.slowT = 0;

    L2.score = 0;
    L2.donations = 0;
    L2.food = 0;

    L2.pickups = [];
    L2.nextPickX = 220;

    L2.snow = [];
    L2.nextSnowX = 380;

    L2.busFill = 0;
    L2.encumbered = false;
    L2.encT = 0;

    L2.priam = { x: VIEW.gw * 0.45, y: 0, w: 34, h: 46, active: true, stealCooldown: 0 };
    L2.marcy = { x: VIEW.gw * 0.72, y: 0, w: 34, h: 46, active: true, slowCooldown: 0 };
    L2.gary = { x: VIEW.gw * 0.50, y: 0, w: 34, h: 46, active: true, hiT: 0 };
    L2.chris = { x: VIEW.gw * 0.72, y: 0, w: 34, h: 46, active: true, giveCooldown: 0 };

    L2.michelle = { active: false, x: 0, t: 0 };
    L2.nextMichelle = 12;

    L2.bannerT = 0;

    FX.confetti = [];
    FX.flashT = 0;

    player.x = 140;
    player.y = 0;
    player.vx = 0;
    player.vy = 0;
    player.onGround = false;
    player.facing = 1;
  }

  function spawnPickupsAhead(floorY) {
    const spawnToX = L2.camX + VIEW.gw + 240;
    while (L2.nextPickX < spawnToX) {
      const kind = (L2.phase === "trek") ? "don" : "food";
      const x = L2.nextPickX;
      const y = floorY - (70 + Math.random() * 90);

      L2.pickups.push({ x, y, kind, alive: true });

      const step = (L2.phase === "trek") ? (70 + Math.random() * 70) : (80 + Math.random() * 85);
      L2.nextPickX += step;
    }
  }

  function spawnSnowAhead(floorY) {
    if (L2.phase !== "bus") return;
    const spawnToX = L2.camX + VIEW.gw + 240;
    while (L2.nextSnowX < spawnToX) {
      const w = 26 + Math.floor(Math.random() * 22);
      const h = 14 + Math.floor(Math.random() * 10);
      const x = L2.nextSnowX;
      const y = floorY - h;

      L2.snow.push({ x, y, w, h, alive: true });
      L2.nextSnowX += 180 + Math.floor(Math.random() * 170);
    }
  }

  function updateLevel2(dt) {
    const floorY = VIEW.gh * 0.78;
    L2.t += dt;
    L2.phaseT += dt;

    // phase timings
    if (L2.phase === "trek" && L2.phaseT >= 60) {
      L2.phase = "bus";
      L2.phaseT = 0;
      L2.bannerT = 2.2;
      SFX.cheer();
      // reset spawn lanes a bit
      L2.pickups = [];
      L2.nextPickX = L2.camX + 240;
      L2.snow = [];
      L2.nextSnowX = L2.camX + 380;
      // slight "heavier" feel
      L2.baseSpeed = 300;
    }
    if (L2.phase === "bus" && L2.phaseT >= 60) {
      L2.done = true;
      SFX.dingding();
      spawnConfettiBurst();
      state.screen = "end2";
      return;
    }

    // speed modifiers
    if (L2.slowT > 0) {
      L2.slowT -= dt;
      if (L2.slowT <= 0) L2.slowMult = 1;
    }
    if (L2.encumbered) {
      L2.encT -= dt;
      if (L2.encT <= 0) {
        L2.encumbered = false;
        L2.encT = 0;
      }
    }

    const burdenMult = L2.encumbered ? 0.68 : 1.0;
    const speed = L2.baseSpeed * L2.slowMult * burdenMult;

    // auto-run camera
    L2.camX += speed * dt;

    // player control lane
    const left = touch.left || keys.has("ArrowLeft") || keys.has("a") || keys.has("A");
    const right = touch.right || keys.has("ArrowRight") || keys.has("d") || keys.has("D");
    player.vx = 0;
    if (left) player.vx -= PHYS.moveSpeed;
    if (right) player.vx += PHYS.moveSpeed;

    if (player.vx < -5) player.facing = -1;
    else if (player.vx > 5) player.facing = 1;

    player.x = clamp(player.x + player.vx * dt, 60, VIEW.gw * 0.70);

    // simple floor + optional jump (keep it fun)
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

    // spawn stuff
    spawnPickupsAhead(floorY);
    spawnSnowAhead(floorY);

    // NPC placement (screen positions stay fixed-ish; world X derived from cam)
    // We treat NPC x as screen x; collide in screen space.
    // Priam + Marcy visible in Trek. Gary + Chris visible in Bus.
    const priamY = floorY - 46;
    const marcyY = floorY - 46;
    const garyY = floorY - 46;
    const chrisY = floorY - 46;

    if (L2.phase === "trek") {
      L2.priam.y = priamY;
      L2.marcy.y = marcyY;

      if (L2.priam.stealCooldown > 0) L2.priam.stealCooldown -= dt;
      if (L2.marcy.slowCooldown > 0) L2.marcy.slowCooldown -= dt;

      // Priam steals some donations
      if (
        rectsOverlap(player.x, player.y, player.w, player.h, L2.priam.x, L2.priam.y, L2.priam.w, L2.priam.h) &&
        L2.priam.stealCooldown <= 0
      ) {
        L2.priam.stealCooldown = 1.2;
        const steal = Math.min(L2.donations, 3);
        L2.donations -= steal;
        L2.score = Math.max(0, L2.score - 60 * steal);
        SFX.thud();
      }

      // Marcy slows you (miss donations)
      if (
        rectsOverlap(player.x, player.y, player.w, player.h, L2.marcy.x, L2.marcy.y, L2.marcy.w, L2.marcy.h) &&
        L2.marcy.slowCooldown <= 0
      ) {
        L2.marcy.slowCooldown = 1.6;
        L2.slowMult = 0.72;
        L2.slowT = 1.6;
        SFX.thud();
      }
    } else {
      L2.gary.y = garyY;
      L2.chris.y = chrisY;

      if (L2.chris.giveCooldown > 0) L2.chris.giveCooldown -= dt;
      if (L2.gary.hiT > 0) L2.gary.hiT -= dt;

      // Chris gives tech burden
      if (
        rectsOverlap(player.x, player.y, player.w, player.h, L2.chris.x, L2.chris.y, L2.chris.w, L2.chris.h) &&
        L2.chris.giveCooldown <= 0
      ) {
        L2.chris.giveCooldown = 2.4;
        L2.encumbered = true;
        L2.encT = 10.0;
        SFX.thud();
      }

      // Gary unloads you + little bonus
      if (
        rectsOverlap(player.x, player.y, player.w, player.h, L2.gary.x, L2.gary.y, L2.gary.w, L2.gary.h)
      ) {
        if (L2.encumbered) {
          L2.encumbered = false;
          L2.encT = 0;
        }
        L2.gary.hiT = 0.35;
      }

      // snow piles = slip (small knockback / slow)
      for (const s of L2.snow) {
        if (!s.alive) continue;
        const sx = s.x - L2.camX;
        if (sx < -120 || sx > VIEW.gw + 120) continue;

        if (rectsOverlap(player.x, player.y, player.w, player.h, sx, s.y, s.w, s.h)) {
          s.alive = false;
          L2.slowMult = 0.66;
          L2.slowT = 0.9;
          player.vy = -220;
          SFX.thud();
        }
      }
      L2.snow = L2.snow.filter(a => a.alive && a.x > L2.camX - 340);
    }

    // collect pickups (screen x = world x - camX)
    for (const p of L2.pickups) {
      if (!p.alive) continue;
      const px = p.x - L2.camX;
      if (px < -80 || px > VIEW.gw + 80) continue;

      if (rectsOverlap(player.x, player.y, player.w, player.h, px, p.y, 14, 14)) {
        p.alive = false;
        if (p.kind === "don") {
          L2.donations += 1;
          L2.score += 20;
        } else {
          L2.food += 1;
          L2.score += 20;
          // bus fill meter
          L2.busFill = clamp(L2.food / 40, 0, 1);
        }
        SFX.collect();
      }
    }
    L2.pickups = L2.pickups.filter(p => p.alive && p.x > L2.camX - 340);

    // Michelle cameo near end of bus phase
    if (L2.phase === "bus") {
      L2.nextMichelle -= dt;
      if (L2.nextMichelle <= 0 && !L2.michelle.active && L2.phaseT > 45) {
        L2.michelle.active = true;
        L2.michelle.t = 0;
        L2.michelle.x = VIEW.gw * 0.78;
        FX.flashT = 0.14;
        SFX.shutter();
      }
      if (L2.michelle.active) {
        L2.michelle.t += dt;
        if (L2.michelle.t > 1.2) L2.michelle.active = false;
      }
    }

    updateFX(dt);
    if (L2.bannerT > 0) L2.bannerT -= dt;
  }

  // ---- Level 2 drawing (simple but “heroic”) ----
  function drawDonation(px, py) {
    // coin + $ hint
    drawPixelRect(px + 4, py + 3, 10, 10, "#FFD24D");
    drawPixelRect(px + 6, py + 5, 6, 6, "rgba(0,0,0,0.18)");
    drawPixelRect(px + 8, py + 6, 2, 4, "rgba(255,255,255,0.55)");
  }

  function drawCan(px, py) {
    drawPixelRect(px + 4, py + 3, 10, 10, "#6BFF7A");
    drawPixelRect(px + 4, py + 3, 10, 2, "rgba(255,255,255,0.30)");
    drawPixelRect(px + 6, py + 7, 6, 4, "rgba(0,0,0,0.18)");
  }

  function drawPriam() {
    const x = Math.round(L2.priam.x);
    const y = Math.round(L2.priam.y);
    // maroon toga
    drawPixelRect(x, y + 18, 18, 22, "#7A1234");
    // head
    drawPixelRect(x + 2, y + 4, 14, 14, "#FFD2B5");
    // crown
    drawPixelRect(x + 2, y + 2, 14, 3, "#FFD24D");
    drawPixelRect(x + 4, y + 0, 2, 2, "#FFD24D");
    drawPixelRect(x + 10, y + 0, 2, 2, "#FFD24D");
    // bucket
    drawPixelRect(x + 18, y + 26, 10, 10, "rgba(255,255,255,0.55)");
    drawPixelRect(x + 20, y + 30, 6, 2, "rgba(0,0,0,0.25)");
  }

  function drawMarcy() {
    const x = Math.round(L2.marcy.x);
    const y = Math.round(L2.marcy.y);
    // athletic VP (track vibe) + poster
    drawPixelRect(x, y + 18, 18, 22, "#4DA3FF");
    drawPixelRect(x + 2, y + 4, 14, 14, "#FFD2B5");
    drawPixelRect(x + 2, y + 2, 14, 3, "#F2D16B");
    // poster board
    drawPixelRect(x - 14, y + 14, 12, 22, "rgba(255,255,255,0.18)");
    drawPixelRect(x - 12, y + 18, 8, 2, "rgba(255,255,255,0.40)");
    drawPixelRect(x - 12, y + 22, 6, 2, "rgba(255,255,255,0.28)");
  }

  function drawGary() {
    const x = Math.round(L2.gary.x);
    const y = Math.round(L2.gary.y);
    // suit-ish + thumbs up
    drawPixelRect(x, y + 18, 18, 22, "rgba(255,255,255,0.20)");
    drawPixelRect(x + 2, y + 4, 14, 14, "#FFD2B5");
    // gruff hair
    drawPixelRect(x + 2, y + 2, 14, 3, "#2B2B2B");
    // thumb/high five highlight
    if (L2.gary.hiT > 0) {
      drawPixelRect(x + 18, y + 18, 8, 6, "#FFD24D");
      drawPixelRect(x + 18, y + 25, 3, 3, "#FFD24D");
    }
  }

  function drawChris() {
    const x = Math.round(L2.chris.x);
    const y = Math.round(L2.chris.y);
    // VP Chris with beard + tech box
    drawPixelRect(x, y + 18, 18, 22, "#2B2B2B");
    drawPixelRect(x + 2, y + 4, 14, 14, "#FFD2B5");
    // beard
    drawPixelRect(x + 4, y + 12, 10, 6, "#5B3A2A");
    // tech
    drawPixelRect(x + 18, y + 22, 12, 10, "rgba(255,255,255,0.35)");
    drawPixelRect(x + 20, y + 26, 8, 2, "rgba(0,0,0,0.25)");
  }

  function drawSnowPile(px, py, w, h) {
    drawPixelRect(px, py, w, h, "rgba(255,255,255,0.55)");
    drawPixelRect(px + 2, py + 2, w - 4, h - 4, "rgba(255,255,255,0.18)");
  }

  function drawBusMeter() {
    const x = VIEW.gw * 0.70;
    const y = 18;
    const w = VIEW.gw * 0.26;
    const h = 12;
    drawPixelRect(x, y, w, h, "rgba(255,255,255,0.15)");
    drawPixelRect(x, y, w * L2.busFill, h, "rgba(255,255,255,0.55)");
    ctx.fillStyle = "rgba(255,255,255,0.80)";
    ctx.font = "800 12px system-ui, Arial";
    ctx.textAlign = "left";
    ctx.fillText("Bus", x - 26, y + 11);
  }

  function drawLevel2() {
    const floorY = VIEW.gh * 0.78;

    // sky/backdrop by phase
    ctx.fillStyle = (L2.phase === "trek") ? "#14061A" : "#06101A";
    ctx.fillRect(0, 0, VIEW.gw, VIEW.gh);

    // floor
    drawPixelRect(0, floorY, VIEW.gw, VIEW.gh - floorY, "rgba(255,255,255,0.10)");

    // signage / easter eggs
    ctx.fillStyle = "rgba(255,255,255,0.10)";
    // posters scroll parallax
    for (let i = 0; i < 10; i++) {
      const px = (i * 150) - ((L2.camX * 0.6) % 150) - 20;
      const py = 80 + (i % 2) * 36;
      ctx.fillRect(px, py, 46, 22);
      ctx.fillStyle = "rgba(255,255,255,0.22)";
      ctx.fillRect(px + 4, py + 6, 26, 3);
      ctx.fillStyle = "rgba(255,255,255,0.10)";
    }

    // Pickups
    for (const p of L2.pickups) {
      const x = p.x - L2.camX;
      if (x < -60 || x > VIEW.gw + 60) continue;
      if (p.kind === "don") drawDonation(x, p.y);
      else drawCan(x, p.y);
    }

    // Snow piles in bus phase
    if (L2.phase === "bus") {
      for (const s of L2.snow) {
        const sx = s.x - L2.camX;
        if (sx < -120 || sx > VIEW.gw + 120) continue;
        drawSnowPile(sx, s.y, s.w, s.h);
      }
    }

    // NPC obstacles
    if (L2.phase === "trek") {
      drawPriam();
      drawMarcy();
      // toga crowd vibe (tiny blocks)
      for (let i = 0; i < 7; i++) {
        const x = 40 + i * 34;
        const y = floorY - 24;
        drawPixelRect(x, y, 10, 18, "rgba(255,255,255,0.12)");
        drawPixelRect(x + 2, y - 6, 6, 6, "rgba(255,255,255,0.12)");
      }
      ctx.fillStyle = "rgba(255,255,255,0.70)";
      ctx.font = "900 14px system-ui, Arial";
      ctx.textAlign = "left";
      ctx.fillText("TROJAN TREK", 16, 78);
      ctx.font = "700 12px system-ui, Arial";
      ctx.fillText("Collect 💰 — avoid Priam & Marcy", 16, 96);
    } else {
      drawGary();
      drawChris();

      // bus silhouette fill
      const bx = VIEW.gw * 0.08;
      const by = floorY - 96;
      drawPixelRect(bx, by, 220, 70, "rgba(255,255,255,0.10)");
      drawPixelRect(bx + 12, by + 14, 52, 20, "rgba(255,255,255,0.12)");
      drawPixelRect(bx + 74, by + 14, 52, 20, "rgba(255,255,255,0.12)");
      drawPixelRect(bx + 136, by + 14, 52, 20, "rgba(255,255,255,0.12)");
      // fill “cargo”
      const fillH = Math.round(44 * L2.busFill);
      drawPixelRect(bx + 12, by + 60 - fillH, 196, fillH, "rgba(255,255,255,0.18)");

      drawBusMeter();

      ctx.fillStyle = "rgba(255,255,255,0.70)";
      ctx.font = "900 14px system-ui, Arial";
      ctx.textAlign = "left";
      ctx.fillText("FILL THE BUS", 16, 78);
      ctx.font = "700 12px system-ui, Arial";
      ctx.fillText("Collect 🥫 — avoid snow — find Gary if Chris burdens you", 16, 96);
    }

    // Michelle cameo
    if (L2.michelle.active) {
      const x = Math.round(L2.michelle.x);
      const y = Math.round(floorY - 44);
      drawPixelRect(x, y + 18, 14, 18, "#6B3B2A");
      drawPixelRect(x, y, 14, 16, "#FFD2B5");
      drawPixelRect(x, y, 14, 5, "#FFD24D");
      drawPixelRect(x + 16, y + 18, 12, 8, "rgba(255,255,255,0.80)");
      drawPixelRect(x + 19, y + 20, 4, 4, "rgba(0,0,0,0.45)");
    }

    // Player
    drawChibiPlayer();

    // HUD
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = "800 16px system-ui, Arial";
    ctx.textAlign = "left";
    ctx.fillText("Level 2 — Fundraising Season", 16, 38);

    ctx.font = "700 13px system-ui, Arial";
    ctx.fillText(`Score: ${L2.score}`, 16, 58);

    ctx.textAlign = "right";
    if (L2.phase === "trek") ctx.fillText(`💰 ${L2.donations}`, VIEW.gw - 16, 38);
    else ctx.fillText(`🥫 ${L2.food}`, VIEW.gw - 16, 38);

    // encumbered notice
    if (L2.encumbered) {
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.font = "900 12px system-ui, Arial";
      ctx.textAlign = "right";
      ctx.fillText("TECH BURDEN! Find Gary!", VIEW.gw - 16, 58);
    }

    // phase timer
    const remain = Math.max(0, 60 - Math.floor(L2.phaseT));
    ctx.fillStyle = "rgba(255,255,255,0.70)";
    ctx.font = "800 12px system-ui, Arial";
    ctx.textAlign = "right";
    ctx.fillText(`Time: ${remain}s`, VIEW.gw - 16, 78);

    // phase transition banner
    if (L2.bannerT > 0) {
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, VIEW.gh * 0.30, VIEW.gw, 64);
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.textAlign = "center";
      ctx.font = "900 20px system-ui, Arial";
      ctx.fillText("PHASE B — FILL THE BUS!", VIEW.gw / 2, VIEW.gh * 0.30 + 42);
    }

    drawConfetti();

    if (FX.flashT > 0) {
      ctx.fillStyle = `rgba(255,255,255,${Math.min(1, FX.flashT * 8)})`;
      ctx.fillRect(0, 0, VIEW.gw, VIEW.gh);
    }
  }

  function drawEnd2() {
    ctx.fillStyle = "#06101A";
    ctx.fillRect(0, 0, VIEW.gw, VIEW.gh);

    drawConfetti();

    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.textAlign = "center";
    ctx.font = "900 28px system-ui, Arial";
    ctx.fillText("COMMUNITY DELIVERED.", VIEW.gw / 2, VIEW.gh * 0.38);

    ctx.font = "800 16px system-ui, Arial";
    ctx.fillText(`Total Score: ${L1.score + L2.score}`, VIEW.gw / 2, VIEW.gh * 0.48);

    ctx.font = "700 13px system-ui, Arial";
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fillText("Press Esc to return to Character Select", VIEW.gw / 2, VIEW.gh * 0.58);
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

      // start Level 2 from Level 1 complete
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
      // optional jump (keeps it lively)
      if ((e.key === " " || e.key === "ArrowUp" || e.key === "w" || e.key === "W") && player.onGround) {
        player.vy = -PHYS.jumpV;
        player.onGround = false;
        SFX.jump();
      }
      if (e.key === "Escape") {
        state.screen = "select";
        resetLevel1();
        SFX.tick();
      }
    }

    if (state.screen === "end2") {
      if (e.key === "Escape") {
        state.screen = "select";
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
      if (L1.levelDone) {
        // tap anywhere to start Level 2
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

    if (state.screen === "level2") {
      // touch: left/right to steer, middle tap to jump
      if (gx >= VIEW.gw * 0.33 && gx <= VIEW.gw * 0.66) {
        if (player.onGround) { player.vy = -PHYS.jumpV; player.onGround = false; SFX.jump(); }
        clearTouch();
      } else {
        setTouchFromGX(gx);
      }
      return;
    }

    if (state.screen === "end2") {
      // tap to go back to select
      state.screen = "select";
      resetLevel1();
      SFX.tick();
    }
  });

  canvas.addEventListener("pointermove", (e) => {
    if (state.screen !== "level1" && state.screen !== "level2") return;
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

    ctx.save();
    ctx.translate(VIEW.ox, VIEW.oy);
    ctx.scale(VIEW.scale, VIEW.scale);

    if (state.screen === "title") drawTitle();
    else if (state.screen === "select") drawSelect();
    else if (state.screen === "level1") {
      updateLevel1(dt);
      drawLevel1();
    }
    else if (state.screen === "level2") {
      updateLevel2(dt);
      drawLevel2();
    }
    else if (state.screen === "end2") {
      updateFX(dt);
      drawEnd2();
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
