(() => {
  const canvas = document.getElementById("game");
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
  };

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
  const keys = new Set();
  window.addEventListener("keydown", (e) => {
    keys.add(e.key);
    if (state.screen === "title" && (e.key === "Enter" || e.key === " ")) state.screen = "select";
    if (state.screen === "select") {
      if (e.key === "ArrowLeft") state.selected = (state.selected + state.chars.length - 1) % state.chars.length;
      if (e.key === "ArrowRight") state.selected = (state.selected + 1) % state.chars.length;
      if (e.key === "Enter" || e.key === " ") state.screen = "level1";
    }
  });
  window.addEventListener("keyup", (e) => keys.delete(e.key));

  // Touch: tap left/right side to move selection, tap center to start
  canvas.addEventListener("pointerdown", (e) => {
    const x = e.clientX;
    if (state.screen === "title") { state.screen = "select"; return; }
    if (state.screen === "select") {
      if (x < state.w * 0.33) state.selected = (state.selected + state.chars.length - 1) % state.chars.length;
      else if (x > state.w * 0.66) state.selected = (state.selected + 1) % state.chars.length;
      else state.screen = "level1";
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

  function drawLevel1Placeholder() {
    drawCenteredText("Level 1 loading…", state.h * 0.35, 26);
    drawCenteredText("Next step: we’ll implement Hallway Hustle phases.", state.h * 0.45, 16, 0.85);

    // simple animated runner block so you can see it’s “gamey”
    const x = (state.t * 120) % (state.w + 40) - 20;
    const y = state.h * 0.65;
    ctx.fillStyle = "#fff";
    ctx.fillRect(x, y, 24, 24);
  }

  function loop(ts) {
    state.t = ts / 1000;
    clear();

    if (state.screen === "title") drawTitle();
    else if (state.screen === "select") drawSelect();
    else if (state.screen === "level1") drawLevel1Placeholder();

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
