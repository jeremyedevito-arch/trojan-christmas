(() => {
  const canvas = document.getElementById("game"); function setTouchFromX(x) {
  touch.left = x < state.w * 0.33;
  touch.right = x > state.w * 0.66;
}

canvas.addEventListener("pointerdown", (e) => {
  if (state.screen !== "level1") return;

  const x = e.clientX;

  // Middle third = jump
  if (x >= state.w * 0.33 && x <= state.w * 0.66) {
    if (player.onGround) {
      player.vy = -PHYS.jumpV;
      player.onGround = false;
    }
    touch.left = false;
    touch.right = false;
    return;
  }

  // Left / right third = movement (hold)
  setTouchFromX(x);
});

canvas.addEventListener("pointermove", (e) => {
  if (state.screen !== "level1") return;
  // If user is holding down, allow sliding thumb to switch sides
  if (e.buttons !== 1) return;
  setTouchFromX(e.clientX);
});

function clearTouch() {
  touch.left = false;
  touch.right = false;
}
canvas.addEventListener("pointerup", clearTouch);
canvas.addEventListener("pointercancel", clearTouch);
canvas.addEventListener("pointerleave", clearTouch);

  const ctx = canvas.getContext("2d");

  const state = {
    w: 0, h: 0,
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
  };// ---------- Level 1: movement + scrolling hallway (Pass 1) ----------
const L1 = {
  camX: 0,
  speed: 220,          // hallway auto-scroll speed (px/s)
  score: 0,
  phase: "carrot",     // later: carrot -> shot -> colouring
  timeInLevel: 0,
};

const player = {
  x: 120,
  y: 0,
  w: 28,
  h: 34,
  vx: 0,
  vy: 0,
  onGround: false,
};

const PHYS = {
  gravity: 1800,       // px/s^2
  jumpV: 640,          // px/s
  moveSpeed: 260,      // px/s
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
}
// -------------------------------------------------------------------

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

  // Input
  const keys = new Set(); const touch = { left: false, right: false };
  window.addEventListener("keydown", (e) => {
    keys.add(e.key);
    // Level 1 controls
// Level 1 controls
if (state.screen === "level1") {
  if ((e.key === " " || e.key === "ArrowUp" || e.key === "w" || e.key === "W") && player.onGround) {
    player.vy = -PHYS.jumpV;
    player.onGround = false;
  }

  // Back to character select
  if (e.key === "Escape") {
    state.screen = "select";
    resetLevel1();
    // If you have input locking helpers, uncomment these:
    // lockInput();
  }

  // Restart level
  if (e.key === "r" || e.key === "R") {
    resetLevel1();
  }
}
    
    if (state.screen === "title" && (e.key === "Enter" || e.key === " ")) state.screen = "select";
    if (state.screen === "select") {
      if (e.key === "ArrowLeft") state.selected = (state.selected + state.chars.length - 1) % state.chars.length;
      if (e.key === "ArrowRight") state.selected = (state.selected + 1) % state.chars.length;
      if (e.key === "Enter" || e.key === " ") {
  resetLevel1();
  state.screen = "level1";
}
    }
  });
  window.addEventListener("keyup", (e) => keys.delete(e.key));

  // Touch: tap left/right side to move selection, tap center to start
  canvas.addEventListener("pointerdown", (e) => {
    if (state.screen === "level1") {
  if (player.onGround) {
    player.vy = -PHYS.jumpV;
    player.onGround = false;
  }
  return;
}

    const x = e.clientX;
    if (state.screen === "title") { state.screen = "select"; return; }
    if (state.screen === "select") {
      if (x < state.w * 0.33) state.selected = (state.selected + state.chars.length - 1) % state.chars.length;
      else if (x > state.w * 0.66) state.selected = (state.selected + 1) % state.chars.length;
      else {
  resetLevel1();
  state.screen = "level1";
}
    }
  });

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

    // little logo preview (optional; if missing, it won't crash)
    // We’ll render the actual HTHS logo on the end screen later.
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
      ctx.fillRect(x - 22, midY - 22, 44, 44); // placeholder portrait block

      ctx.fillStyle = "#000";
      ctx.font = "700 14px system-ui, Arial";
      ctx.textAlign = "center";
      ctx.fillText(state.chars[i].name[0], x, midY + 5);
    }

    drawCenteredText("← / → to choose • Enter to play", state.h * 0.85, 16, 0.85);
    drawCenteredText("Tap left/right to choose • Tap center to play", state.h * 0.90, 14, 0.6);
  }

  function updateLevel1(dt) {
  // Advance camera automatically
  L1.camX += L1.speed * dt;
  L1.timeInLevel += dt;

  // Movement input (keyboard)
  const left = touch.left || keys.has("ArrowLeft") || keys.has("a") || keys.has("A");
  const right = touch.right || keys.has("ArrowRight") || keys.has("d") || keys.has("D");
  player.vx = 0;
  if (left) player.vx -= PHYS.moveSpeed;
  if (right) player.vx += PHYS.moveSpeed;

  // Gravity
  player.vy += PHYS.gravity * dt;

  // Integrate
  player.x += player.vx * dt;
  player.y += player.vy * dt;

  // Floor (simple)
  const floorY = state.h * 0.78;
  if (player.y + player.h >= floorY) {
    player.y = floorY - player.h;
    player.vy = 0;
    player.onGround = true;
  } else {
    player.onGround = false;
  }

  // Keep player within a comfortable screen band (relative to camera)
  // We'll treat player's "world x" as (camX + player.x)
  player.x = clamp(player.x, 60, state.w * 0.55);

  // Basic score just for moving (we'll replace later with collectibles)
  L1.score += Math.floor(L1.speed * dt * 0.1);
}

function drawLevel1() {
  // Update
  // (dt handled in loop — we just draw here)

  // Background
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  for (let i = 0; i < 60; i++) {
    const x = ((i * 180) - (L1.camX % 180)) - 40;
    const y = 60 + (i % 6) * 60;
    ctx.fillRect(x, y, 6, 28); // simple “poster” bars sliding by
  }

  // Floor
  const floorY = state.h * 0.78;
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.fillRect(0, floorY, state.w, state.h - floorY);

  // “Lockers” parallax strip
  ctx.fillStyle = "rgba(255,255,255,0.10)";
  const lockerY = floorY - 130;
  for (let i = 0; i < 20; i++) {
    const x = (i * 140) - (L1.camX * 0.6 % 140) - 20;
    ctx.fillRect(x, lockerY, 90, 120);
  }

  // Player (placeholder block for now)
  ctx.fillStyle = "#fff";
  ctx.fillRect(player.x, player.y, player.w, player.h);

  // HUD text
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = "600 16px system-ui, Arial";
  ctx.textAlign = "left";
  ctx.fillText(`Level 1 — Hallway Hustle`, 16, 56);
  ctx.fillText(`Phase: ${L1.phase}`, 16, 78);
  ctx.fillText(`Score: ${L1.score}`, 16, 100);

  ctx.textAlign = "right";
  ctx.fillText(`Jump: Space • Back: Esc`, state.w - 16, 56);
}

  let lastTs = 0;

function loop(ts) {
  const now = ts / 1000;
  const dt = lastTs ? Math.min(0.033, now - lastTs) : 0; // cap dt for stability
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

  // HUD buttons
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
