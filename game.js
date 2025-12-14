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
    state.w = window.innerWidth;
    state.h = window.innerHeight;
  }
  window.addEventListener("resize", resize);
  resize();

  // -------------------- Level 1: movement + Carrot in a Box --------------------
  const PHYS = {
    gravity: 1800, // px/s^2
    jumpV: 640, // px/s
    moveSpeed: 260, // px/s
  };

  const player = {
    x: 120, // screen coords
    y: 0,
    w: 28,
    h: 34,
    vx: 0,
    vy: 0,
    onGround: false,
  };

  const L1 = {
    camX: 0, // world x of camera
    speed: 220,
    score: 0,
    phase: "carrot",
    timeInLevel: 0,

    boxes: [],      // world-x boxes
    carrots: [],    // world-x carrots
    nextBoxX: 360,  // next box spawn world x
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
      const w = 46 + Math.floor(Math.random() * 18);
      const h = 30 + Math.floor(Math.random() * 10);
      const x = L1.nextBoxX;     // world x
      const y = floorY - h;      // screen y

      const decoy = Math.random() < 0.20; // 20% decoy
      const hasCarrot = !decoy && Math.random() < 0.30; // 30% carrot chance (if not decoy)

      L1.boxes.push({
        x, y, w, h,
        opened: false,
        decoy,
        hasCarrot,
      });

      L1.nextBoxX += 140 + Math.floor(Math.random() * 140);
    }
  }

  function tryOpenBox(box) {
    if (box.opened) return;
    box.opened = true;

    if (box.decoy) return;

    if (box.hasCarrot) {
      L1.carrots.push({
        x: box.x + box.w / 2 - 8, // world x
        y: box.y - 10,            // screen y
        w: 16,
        h: 10,
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

      // fall off-screen
      if (c.y > floorY + 200) c.alive = false;

      // collect: compare player (screen) with carrot (screen x derived from world x)
      const cx = c.x - L1.camX;
      if (rectsOverlap(player.x, player.y, player.w, player.h, cx, c.y, c.w, c.h)) {
        c.alive = false;
        L1.score += 100;
      }
    }
    L1.carrots = L1.carrots.filter(c => c.alive);
  }

  function updateMarchHare(dt) {
    // Rare visual-only gag
    if (!L1.hare.active && Math.random() < 0.006) {
      L1.hare.active = true;
      L1.hare.t = 0;
      L1.hare.x = L1.camX + state.w + 40; // world x
    }
    if (L1.hare.active) {
      L1.hare.t += dt;
      L1.hare.x -= 520 * dt;
      if (L1.hare.t > 1.2) L1.hare.active = false;
    }
  }

  function updateLevel1(dt) {
    const floorY = state.h * 0.78;

    // Auto-scroll camera
    L1.camX += L1.speed * dt;
    L1.timeInLevel += dt;

    // Input: keyboard OR touch
    const left = touch.left || keys.has("ArrowLeft") || keys.has("a") || keys.has("A");
    const right = touch.right || keys.has("ArrowRight") || keys.has("d") || keys.has("D");

    player.vx = 0;
    if (left) player.vx -= PHYS.moveSpeed;
    if (right) player.vx += PHYS.moveSpeed;

    // Keep player in a comfortable screen band
    player.x = clamp(player.x + player.vx * dt, 60, state.w * 0.55);

    // Physics integrate
    const prevY = player.y;
    player.vy += PHYS.gravity * dt;
    player.y += player.vy * dt;

    // Floor
    if (player.y + player.h >= floorY) {
      player.y = floorY - player.h;
      player.vy = 0;
      player.onGround = true;
    } else {
      player.onGround = false;
    }

    // Phase A: Carrot in a Box
    if (L1.phase === "carrot") {
      spawnBoxesAhead(floorY);
      updateCarrots(dt, floorY);
      updateMarchHare(dt);

      // Land on boxes to open them
      for (const box of L1.boxes) {
        const sx = box.x - L1.camX; // box screen x

        // skip far boxes
        if (sx < -140 || sx > state.w + 140) continue;

        const falling = player.vy >= 0;
        const overlap = rectsOverlap(player.x, player.y, player.w, player.h, sx, box.y, box.w, box.h);

        // "came from above" check using prevY
        const cameFromAbove = (prevY + player.h) <= (box.y + 8);

        if (falling && overlap && cameFromAbove) {
          player.y = box.y - player.h;
          player.vy = 0;
          player.onGround = true;
          tryOpenBox(box);
        }
      }

      // prune old boxes behind camera
      L1.boxes = L1.boxes.filter(b => b.x > L1.camX - 320);
    }

    // Tiny “movement score” baseline (will be replaced later)
    L1.score += Math.floor(L1.speed * dt * 0.05);
  }

  function clear() {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, state.w, state.h);
  }

  function drawCenteredText(text, y, size = 28, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#fff";
    ctx.font = `600 ${size}px system-ui, Arial`;
    ctx.textAlign = "center";
    ctx.fillText(text, state.w / 2, y);
    ctx.restore();
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

      ctx.fillStyle = isSel ? "#fff" : "rgba(255,255,255,0.35)";
      ctx.fillRect(x - 22, midY - 22, 44, 44);

      ctx.fillStyle = "#000";
      ctx.font = "700 14px system-ui, Arial";
      ctx.textAlign = "center";
      ctx.fillText(state.chars[i].name[0], x, midY + 5);
    }

    drawCenteredText("← / → to choose • Enter to play", state.h * 0.85, 16, 0.85);
    drawCenteredText("Tap left/right to choose • Tap center to play", state.h * 0.90, 14, 0.6);
  }

  function drawLevel1() {
    const floorY = state.h * 0.78;

    // Background "posters" sliding by
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    for (let i = 0; i < 60; i++) {
      const x = ((i * 180) - (L1.camX % 180)) - 40;
      const y = 60 + (i % 6) * 60;
      ctx.fillRect(x, y, 6, 28);
    }

    // Floor
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.fillRect(0, floorY, state.w, state.h - floorY);

    // Lockers parallax strip
    ctx.fillStyle = "rgba(255,255,255,0.10)";
    const lockerY = floorY - 130;
    for (let i = 0; i < 20; i++) {
      const x = (i * 140) - (L1.camX * 0.6 % 140) - 20;
      ctx.fillRect(x, lockerY, 90, 120);
    }

    // Boxes + carrots (Phase A)
    if (L1.phase === "carrot") {
      for (const box of L1.boxes) {
        const x = box.x - L1.camX;
        if (x < -140 || x > state.w + 140) continue;

        ctx.fillStyle = box.opened ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.70)";
        ctx.fillRect(x, box.y, box.w, box.h);

        // subtle "X" mark on opened decoys
        if (box.opened && box.decoy) {
          ctx.fillStyle = "rgba(0,0,0,0.35)";
          ctx.fillRect(x + 10, box.y + 12, box.w - 20, 4);
        }
      }

      // March Hare silhouette (visual only)
      if (L1.hare.active) {
        const hx = L1.hare.x - L1.camX;
        const hy = floorY - 118;
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.fillRect(hx, hy, 22, 18);
      }

      // Carrots
      for (const c of L1.carrots) {
        const cx = c.x - L1.camX;
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.fillRect(cx, c.y, c.w, c.h);
      }
    }

    // Player
    ctx.fillStyle = "#fff";
    ctx.fillRect(player.x, player.y, player.w, player.h);

    // HUD
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = "600 16px system-ui, Arial";
    ctx.textAlign = "left";
    ctx.fillText(`Level 1 — Hallway Hustle`, 16, 56);
    ctx.fillText(`Phase: ${L1.phase}`, 16, 78);
    ctx.fillText(`Score: ${L1.score}`, 16, 100);

    ctx.textAlign = "right";
    ctx.fillText(`Jump: Space • Back: Esc`, state.w - 16, 56);

    // Tiny mobile hint
    ctx.font = "600 13px system-ui, Arial";
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.textAlign = "right";
    ctx.fillText(`Phone: hold left/right • tap middle to jump`, state.w - 16, 78);
  }

  // -------------------- Keyboard controls --------------------
  window.addEventListener("keydown", (e) => {
    keys.add(e.key);

    if (state.screen === "title" && (e.key === "Enter" || e.key === " ")) {
      state.screen = "select";
    }

    if (state.screen === "select") {
      if (e.key === "ArrowLeft") state.selected = (state.selected + state.chars.length - 1) % state.chars.length;
      if (e.key === "ArrowRight") state.selected = (state.selected + 1) % state.chars.length;
      if (e.key === "Enter" || e.key === " ") {
        resetLevel1();
        state.screen = "level1";
      }
    }

    if (state.screen === "level1") {
      if ((e.key === " " || e.key === "ArrowUp" || e.key === "w" || e.key === "W") && player.onGround) {
        player.vy = -PHYS.jumpV;
        player.onGround = false;
      }
      if (e.key === "Escape") {
        state.screen = "select";
        resetLevel1();
      }
      if (e.key === "r" || e.key === "R") {
        resetLevel1();
      }
    }
  });

  window.addEventListener("keyup", (e) => {
    keys.delete(e.key);
  });

  // -------------------- Touch controls --------------------
  function clearTouch() {
    touch.left = false;
    touch.right = false;
  }

  function setTouchFromX(x) {
    touch.left = x < state.w * 0.33;
    touch.right = x > state.w * 0.66;
  }

  canvas.addEventListener("pointerdown", (e) => {
    const x = e.clientX;

    // Title -> Select
    if (state.screen === "title") {
      state.screen = "select";
      return;
    }

    // Select screen: tap left/right to change, tap center to start
    if (state.screen === "select") {
      if (x < state.w * 0.33) state.selected = (state.selected + state.chars.length - 1) % state.chars.length;
      else if (x > state.w * 0.66) state.selected = (state.selected + 1) % state.chars.length;
      else {
        resetLevel1();
        state.screen = "level1";
      }
      return;
    }

    // Level 1: left/right hold to move, middle tap to jump
    if (state.screen === "level1") {
      if (x >= state.w * 0.33 && x <= state.w * 0.66) {
        // middle = jump
        if (player.onGround) {
          player.vy = -PHYS.jumpV;
          player.onGround = false;
        }
        clearTouch();
      } else {
        setTouchFromX(x);
      }
    }
  });

  canvas.addEventListener("pointermove", (e) => {
    if (state.screen !== "level1") return;
    if (e.buttons !== 1) return; // only when finger/mouse is held down
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
  });

  function toast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 900);
  }
})();
