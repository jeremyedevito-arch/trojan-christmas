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

  // Bright arcade palette (simple, readable)
  const CHAR_STYLE = {
    Holli:  { skin:"#FFD2B5", hair:"#F2D16B", shirt:"#3EE6C1", pants:"#2B2B2B" },
    Emily:  { skin:"#FFD2B5", hair:"#6B3B2A", shirt:"#FF5EA8", pants:"#2B2B2B" },
    Devin:  { skin:"#FFD2B5", hair:"#5B3A2A", shirt:"#4DA3FF", pants:"#2B2B2B" },
    Brandon:{ skin:"#FFD2B5", hair:"#A87A4D", shirt:"#8E6BFF", pants:"#2B2B2B" },
    Colleen:{ skin:"#FFD2B5", hair:"#FF6B6B", shirt:"#FFD24D", pants:"#2B2B2B" },
    Melissa:{ skin:"#FFD2B5", hair:"#6B3B2A", shirt:"#6BFF7A", pants:"#2B2B2B" },
  };

  // Input
  const keys = new Set();
  const touch = { left: false, right: false };

  function resize() {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    state.w = window.innerWidth;
    state.h = window.innerHeight;
  }
  window.addEventListener("resize", resize);
  resize();

  // -------------------- Web Audio SFX (no files) --------------------
  let audioCtx = null;

  function ensureAudio() {
    if (state.muted) return;
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audioCtx = new Ctx();
    }
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
  }

  function beep({ type="square", f0=440, f1=null, dur=0.08, gain=0.06 }) {
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

  function noisePop({ dur=0.07, gain=0.045 }) {
    if (state.muted) return;
    ensureAudio();
    if (!audioCtx || audioCtx.state !== "running") return;

    const t0 = audioCtx.currentTime;
    const t1 = t0 + dur;

    const bufferSize = Math.floor(audioCtx.sampleRate * dur);
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      // quick “pfft”
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }

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

  // SFX “presets”
  const SFX = {
    tick:   () => beep({ type:"square", f0:740, f1:640, dur:0.04, gain:0.04 }),
    start:  () => beep({ type:"triangle", f0:520, f1:780, dur:0.09, gain:0.06 }),
    jump:   () => beep({ type:"square", f0:520, f1:880, dur:0.07, gain:0.06 }),
    open:   () => beep({ type:"sawtooth", f0:180, f1:120, dur:0.09, gain:0.05 }),
    decoy:  () => noisePop({ dur:0.06, gain:0.04 }),
    collect:() => {
      beep({ type:"triangle", f0:880, f1:1320, dur:0.07, gain:0.06 });
      setTimeout(() => beep({ type:"triangle", f0:1320, f1:1760, dur:0.05, gain:0.05 }), 30);
    },
  };

  // -------------------- Level 1: movement + Carrot in a Box --------------------
  const PHYS = {
    gravity: 1800,
    jumpV: 640,
    moveSpeed: 260,
  };

  const player = {
    x: 120, y: 0,
    w: 28, h: 34,
    vx: 0, vy: 0,
    onGround: false,
    facing: 1,
    style: CHAR_STYLE.Holli,
  };

  const L1 = {
    camX: 0,
    speed: 220,
    score: 0,
    phase: "carrot",
    timeInLevel: 0,
    boxes: [],
    carrots: [],
    nextBoxX: 360,
    hare: { active: false, x: 0, t: 0 },
  };

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function resetLevel1() {
    L1.camX = 0;
    L1.score = 0;
    L1.phase = "carrot";
    L1.timeInLevel = 0;

    player.x = 120;
    player.y = 0;
    player.vx = 0;
    player.vy = 0;
    player.onGround = false;
    player.facing = 1;

    L1.boxes = [];
    L1.carrots = [];
    L1.nextBoxX = 360;
    L1.hare = { active: false, x: 0, t: 0 };
  }

  function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  function spawnBoxesAhead(floorY) {
    const spawnToX = L1.camX + state.w + 240;
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

    // sound on open
    if (box.decoy) {
      SFX.decoy();
      return;
    } else {
      SFX.open();
    }

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

  function updateMarchHare(dt) {
    if (!L1.hare.active && Math.random() < 0.006) {
      L1.hare.active = true;
      L1.hare.t = 0;
      L1.hare.x = L1.camX + state.w + 40;
    }
    if (L1.hare.active) {
      L1.hare.t += dt;
      L1.hare.x -= 520 * dt;
      if (L1.hare.t > 1.2) L1.hare.active = false;
    }
  }

  function updateLevel1(dt) {
    const floorY = state.h * 0.78;

    L1.camX += L1.speed * dt;
    L1.timeInLevel += dt;

    const left = touch.left || keys.has("ArrowLeft") || keys.has("a") || keys.has("A");
    const right = touch.right || keys.has("ArrowRight") || keys.has("d") || keys.has("D");

    player.vx = 0;
    if (left) player.vx -= PHYS.moveSpeed;
    if (right) player.vx += PHYS.moveSpeed;

    if (player.vx < -5) player.facing = -1;
    else if (player.vx > 5) player.facing = 1;

    player.x = clamp(player.x + player.vx * dt, 60, state.w * 0.55);

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

    if (L1.phase === "carrot") {
      spawnBoxesAhead(floorY);
      updateCarrots(dt, floorY);
      updateMarchHare(dt);

      for (const box of L1.boxes) {
        const sx = box.x - L1.camX;
        if (sx < -160 || sx > state.w + 160) continue;

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

    L1.score += Math.floor(L1.speed * dt * 0.05);
  }

  // -------------------- Drawing helpers (pixel arcade) --------------------
  function clear() {
    ctx.fillStyle = "#06101A";
    ctx.fillRect(0, 0, state.w, state.h);
  }

  function drawCenteredText(text, y, size = 28, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#FFFFFF";
    ctx.font = `700 ${size}px system-ui, Arial`;
    ctx.textAlign = "center";
    ctx.fillText(text, state.w / 2, y);
    ctx.restore();
  }

  function drawPixelRect(x, y, w, h, c) {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  function drawCarrot(cx, y, s = 1) {
    const x = Math.round(cx);
    const yy = Math.round(y);
    drawPixelRect(x + 6*s, yy + 0*s, 4*s, 2*s, "#3CFF74");
    drawPixelRect(x + 5*s, yy + 2*s, 6*s, 2*s, "#2FE35F");
    drawPixelRect(x + 4*s, yy + 4*s, 8*s, 2*s, "#FF8A2A");
    drawPixelRect(x + 5*s, yy + 6*s, 6*s, 2*s, "#FF7A1A");
    drawPixelRect(x + 6*s, yy + 8*s, 4*s, 2*s, "#FF6A0A");
    drawPixelRect(x + 7*s, yy +10*s, 2*s, 2*s, "#FF5A00");
    drawPixelRect(x + 6*s, yy + 5*s, 1*s, 4*s, "#FFD6A8");
  }

  function drawCrate(x, y, w, h, opened, decoy) {
    const base = opened ? "rgba(255,214,120,0.25)" : "#FFB74A";
    const dark = opened ? "rgba(120,70,10,0.20)" : "#B86A12";
    const edge = opened ? "rgba(0,0,0,0.18)" : "rgba(0,0,0,0.28)";

    drawPixelRect(x, y, w, h, base);
    ctx.strokeStyle = edge;
    ctx.lineWidth = 2;
    ctx.strokeRect(Math.round(x)+1, Math.round(y)+1, Math.round(w)-2, Math.round(h)-2);

    const slatCount = 3;
    for (let i = 1; i <= slatCount; i++) {
      const yy = y + (h * i) / (slatCount + 1);
      drawPixelRect(x + 6, yy - 2, w - 12, 3, dark);
    }

    if (opened) drawPixelRect(x + 6, y + 6, w - 12, 5, "rgba(0,0,0,0.18)");

    if (opened && decoy) {
      drawPixelRect(x + w/2 - 10, y + h/2 - 2, 20, 4, "rgba(0,0,0,0.25)");
      drawPixelRect(x + w/2 - 2, y + h/2 - 10, 4, 20, "rgba(0,0,0,0.10)");
    }
  }

  function drawChibiPlayer() {
    const speedMag = Math.min(1, Math.abs(player.vx) / PHYS.moveSpeed);
    const bob = Math.round(Math.sin(state.t * 14) * 2 * speedMag);
    const px = Math.round(player.x);
    const py = Math.round(player.y + bob);

    const st = player.style || CHAR_STYLE.Holli;

    const headW = 16, headH = 14;
    const bodyW = 16, bodyH = 12;
    const legW = 6, legH = 8;

    const cx = px + Math.round((player.w - headW) / 2);
    const headY = py + 2;
    const bodyY = headY + headH;
    const legY  = bodyY + bodyH;

    drawPixelRect(px + 6, py + player.h - 3, player.w - 12, 3, "rgba(0,0,0,0.25)");

    drawPixelRect(cx, headY, headW, headH, st.skin);
    drawPixelRect(cx, headY, headW, 5, st.hair);
    if (player.facing === 1) drawPixelRect(cx + 11, headY + 5, 4, 4, st.hair);
    else drawPixelRect(cx + 1, headY + 5, 4, 4, st.hair);

    const eyeY = headY + 7;
    if (player.facing === 1) {
      drawPixelRect(cx + 9, eyeY, 2, 2, "#1A1A1A");
      drawPixelRect(cx + 12, eyeY, 2, 2, "#1A1A1A");
    } else {
      drawPixelRect(cx + 2, eyeY, 2, 2, "#1A1A1A");
      drawPixelRect(cx + 5, eyeY, 2, 2, "#1A1A1A");
    }

    const bx = px + Math.round((player.w - bodyW) / 2);
    drawPixelRect(bx, bodyY, bodyW, bodyH, st.shirt);
    drawPixelRect(bx, bodyY + bodyH - 3, bodyW, 3, st.pants);

    const step = Math.round(Math.sin(state.t * 14) * 2 * speedMag);
    drawPixelRect(bx + 2, legY + Math.max(0, -step), legW, legH + Math.min(0, step), st.pants);
    drawPixelRect(bx + bodyW - 2 - legW, legY + Math.max(0, step), legW, legH + Math.min(0, -step), st.pants);

    drawPixelRect(bx - 2, bodyY + 3, 3, 6, st.skin);
    drawPixelRect(bx + bodyW - 1, bodyY + 3, 3, 6, st.skin);
  }

  function drawTitle() {
    drawCenteredText("A Very Trojan Christmas", state.h * 0.35, 34);
    drawCenteredText("Tap / Press Enter to start", state.h * 0.45, 18, 0.85);
  }

  function drawSelect() {
    drawCenteredText("Choose Your Character", state.h * 0.18, 28);
    const c = state.chars[state.selected];
    drawCenteredText(`${c.name} — ${c.tag}`, state.h * 0.26, 16, 0.9);

    const midY = state.h * 0.55;
    const spacing = Math.min(120, state.w / 4);
    const startX = state.w / 2 - spacing * 1.25;

    for (let i = 0; i < state.chars.length; i++) {
      const x = startX + i * spacing;
      const isSel = i === state.selected;

      drawPixelRect(x - 24, midY - 26, 48, 52, isSel ? "#FFFFFF" : "rgba(255,255,255,0.30)");
      drawPixelRect(x - 22, midY - 24, 44, 48, "rgba(0,0,0,0.45)");

      const name = state.chars[i].name;
      const st = CHAR_STYLE[name] || CHAR_STYLE.Holli;
      drawPixelRect(x - 10, midY - 16, 20, 16, st.skin);
      drawPixelRect(x - 10, midY - 16, 20, 6, st.hair);
      drawPixelRect(x - 10, midY, 20, 14, st.shirt);
      drawPixelRect(x - 10, midY + 10, 20, 4, st.pants);

      ctx.fillStyle = "#FFFFFF";
      ctx.font = "700 12px system-ui, Arial";
      ctx.textAlign = "center";
      ctx.globalAlpha = isSel ? 1 : 0.75;
      ctx.fillText(state.chars[i].name, x, midY + 44);
      ctx.globalAlpha = 1;
    }

    drawCenteredText("← / → to choose • Enter to play", state.h * 0.85, 16, 0.85);
    drawCenteredText("Tap left/right to choose • Tap center to play", state.h * 0.90, 14, 0.6);
  }

  function drawLevel1() {
    const floorY = state.h * 0.78;

    for (let i = 0; i < 40; i++) {
      const x = ((i * 220) - (L1.camX % 220)) - 60;
      const y = 60 + (i % 6) * 70;
      drawPixelRect(x, y, 10, 40, "rgba(120,220,255,0.10)");
      drawPixelRect(x + 14, y + 8, 6, 22, "rgba(255,120,220,0.10)");
    }

    drawPixelRect(0, floorY, state.w, state.h - floorY, "rgba(255,255,255,0.10)");
    drawPixelRect(0, floorY + 18, state.w, 4, "rgba(255,255,255,0.14)");

    const lockerY = floorY - 130;
    for (let i = 0; i < 20; i++) {
      const x = (i * 140) - (L1.camX * 0.6 % 140) - 20;
      drawPixelRect(x, lockerY, 92, 124, "rgba(255,255,255,0.08)");
      drawPixelRect(x + 6, lockerY + 10, 80, 4, "rgba(255,255,255,0.06)");
      drawPixelRect(x + 6, lockerY + 60, 80, 4, "rgba(255,255,255,0.06)");
    }

    if (L1.phase === "carrot") {
      for (const box of L1.boxes) {
        const x = box.x - L1.camX;
        if (x < -160 || x > state.w + 160) continue;
        drawCrate(x, box.y, box.w, box.h, box.opened, box.decoy);
      }

      if (L1.hare.active) {
        const hx = L1.hare.x - L1.camX;
        const hy = floorY - 118;
        drawPixelRect(hx, hy, 24, 18, "rgba(0,0,0,0.35)");
        drawPixelRect(hx + 16, hy - 8, 6, 10, "rgba(0,0,0,0.25)");
      }

      for (const c of L1.carrots) {
        const cx = c.x - L1.camX;
        drawCarrot(cx, c.y, 1);
      }
    }

    drawChibiPlayer();

    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.font = "700 16px system-ui, Arial";
    ctx.textAlign = "left";
    ctx.fillText(`Level 1 — Hallway Hustle`, 16, 56);
    ctx.fillText(`Phase: ${L1.phase}`, 16, 78);
    ctx.fillText(`Score: ${L1.score}`, 16, 100);

    ctx.textAlign = "right";
    ctx.fillText(`Jump: Space • Back: Esc`, state.w - 16, 56);

    ctx.font = "700 13px system-ui, Arial";
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    ctx.textAlign = "right";
    ctx.fillText(`Phone: hold left/right • tap middle to jump`, state.w - 16, 78);
  }

  // -------------------- Keyboard controls --------------------
  window.addEventListener("keydown", (e) => {
    // unlock audio on first real interaction
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
      if (e.key === "r" || e.key === "R") {
        resetLevel1();
        SFX.tick();
      }
    }
  });

  window.addEventListener("keyup", (e) => keys.delete(e.key));

  // -------------------- Touch controls --------------------
  function clearTouch() { touch.left = false; touch.right = false; }
  function setTouchFromX(x) {
    touch.left = x < state.w * 0.33;
    touch.right = x > state.w * 0.66;
  }

  canvas.addEventListener("pointerdown", (e) => {
    ensureAudio();
    const x = e.clientX;

    if (state.screen === "title") {
      state.screen = "select";
      SFX.start();
      return;
    }

    if (state.screen === "select") {
      if (x < state.w * 0.33) { state.selected = (state.selected + state.chars.length - 1) % state.chars.length; SFX.tick(); }
      else if (x > state.w * 0.66) { state.selected = (state.selected + 1) % state.chars.length; SFX.tick(); }
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
      if (x >= state.w * 0.33 && x <= state.w * 0.66) {
        if (player.onGround) {
          player.vy = -PHYS.jumpV;
          player.onGround = false;
          SFX.jump();
        }
        clearTouch();
      } else {
        setTouchFromX(x);
      }
    }
  });

  canvas.addEventListener("pointermove", (e) => {
    if (state.screen !== "level1") return;
    if (e.buttons !== 1) return;
    setTouchFromX(e.clientX);
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

    clear();

    if (state.screen === "title") drawTitle();
    else if (state.screen === "select") drawSelect();
    else if (state.screen === "level1") {
      updateLevel1(dt);
      drawLevel1();
    }

    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // -------------------- HUD: mute button + toast --------------------
  const muteBtn = document.getElementById("muteBtn");
  muteBtn.addEventListener("click", () => {
    state.muted = !state.muted;
    muteBtn.textContent = state.muted ? "Sound: Off" : "Sound: On";
    toast(state.muted ? "Muted" : "Sound on");
    if (!state.muted) ensureAudio();
  });

  function toast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 900);
  }
})();
