// 떨어지는 여행지 특산품을 받는 캔버스 미니게임.
// 마우스/터치로 끌거나 ←/→ 키로 우왕이를 움직인다.
const MiniGame = (() => {
  const DURATION = 30;
  const ITEM_RADIUS = 18;

  let canvas, ctx, width, height;
  let dest, onEnd;
  let running = false;
  let rafId = 0;
  let lastTime = 0;
  let player, items, popups, score, lives, timeLeft, spawnTimer;
  const keys = {};

  function init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');

    const follow = (e) => {
      if (!running) return;
      player.targetX = e.clientX - canvas.getBoundingClientRect().left;
    };
    canvas.addEventListener('pointerdown', follow);
    canvas.addEventListener('pointermove', follow);
    document.addEventListener('keydown', (e) => { keys[e.key] = true; });
    document.addEventListener('keyup', (e) => { keys[e.key] = false; });
    window.addEventListener('resize', () => { if (running) resize(); });
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    width = rect.width;
    height = rect.height;
    if (player) player.y = height - 52;
  }

  function start(destination, callback) {
    dest = destination;
    onEnd = callback;
    resize();
    player = { x: width / 2, y: height - 52, r: 28, targetX: width / 2 };
    items = [];
    popups = [];
    score = 0;
    lives = 3;
    timeLeft = DURATION;
    spawnTimer = 0;
    running = true;
    lastTime = performance.now();
    updateHud();
    rafId = requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(rafId);
  }

  function spawn() {
    const roll = Math.random();
    const type = roll < 0.12 ? 'star' : roll < 0.32 ? 'bad' : 'good';
    const emoji = type === 'good' ? dest.item.emoji : type === 'star' ? '⭐' : '⚡';
    const elapsed = DURATION - timeLeft;
    items.push({
      x: ITEM_RADIUS + Math.random() * (width - ITEM_RADIUS * 2),
      y: -ITEM_RADIUS,
      vy: 130 + Math.random() * 80 + elapsed * 4,
      type,
      emoji,
    });
  }

  function loop(now) {
    if (!running) return;
    // 첫 프레임의 시각이 시작 시각보다 이를 수 있어서 음수를 막는다.
    const dt = Math.max(0, Math.min(0.05, (now - lastTime) / 1000));
    lastTime = now;
    update(dt);
    draw();
    if (running) rafId = requestAnimationFrame(loop);
  }

  function update(dt) {
    timeLeft -= dt;

    if (keys.ArrowLeft) player.targetX -= 380 * dt;
    if (keys.ArrowRight) player.targetX += 380 * dt;
    player.targetX = Math.max(player.r, Math.min(width - player.r, player.targetX));
    player.x += (player.targetX - player.x) * Math.min(1, dt * 12);

    // 시간이 지날수록 더 자주 떨어진다.
    const interval = Math.max(0.35, 0.8 - (DURATION - timeLeft) * 0.012);
    spawnTimer += dt;
    while (spawnTimer > interval) {
      spawnTimer -= interval;
      spawn();
    }

    for (const item of items) {
      item.y += item.vy * dt;
      const dx = item.x - player.x;
      const dy = item.y - player.y;
      if (Math.hypot(dx, dy) < player.r + ITEM_RADIUS) {
        item.dead = true;
        if (item.type === 'bad') {
          lives--;
          Sound.sfx('bad');
          popups.push({ x: item.x, y: item.y, text: '💥', life: 0.8 });
        } else {
          const points = item.type === 'star' ? 30 : 10;
          score += points;
          Sound.sfx('coin');
          popups.push({ x: item.x, y: item.y, text: `+${points}`, life: 0.8 });
        }
      } else if (item.y > height + ITEM_RADIUS) {
        item.dead = true;
      }
    }
    items = items.filter((item) => !item.dead);

    for (const p of popups) {
      p.y -= 40 * dt;
      p.life -= dt;
    }
    popups = popups.filter((p) => p.life > 0);

    updateHud();
    if (timeLeft <= 0 || lives <= 0) {
      stop();
      onEnd(score);
    }
  }

  function draw() {
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, '#bfe9ff');
    sky.addColorStop(1, '#fff3d6');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(255,255,255,.6)';
    ctx.fillRect(0, height - 18, width, 18);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '30px sans-serif';
    for (const item of items) ctx.fillText(item.emoji, item.x, item.y);

    drawPlayer(player.x, player.y, player.r);

    ctx.font = '16px Galmuri11, sans-serif';
    for (const p of popups) {
      ctx.globalAlpha = Math.max(0, p.life / 0.8);
      ctx.fillStyle = '#3b2a1a';
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.globalAlpha = 1;
  }

  // 미니게임용으로 단순화한 우왕이
  function drawPlayer(x, y, r) {
    ctx.fillStyle = '#e8a54b';
    ctx.beginPath(); ctx.arc(x - r * 0.72, y - r * 0.72, r * 0.36, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + r * 0.72, y - r * 0.72, r * 0.36, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f5c16c';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fbe3b8';
    ctx.beginPath(); ctx.ellipse(x, y + r * 0.35, r * 0.55, r * 0.42, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3b2a1a';
    ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.12, r * 0.11, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + r * 0.35, y - r * 0.12, r * 0.11, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#7a4b2a';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(x, y + r * 0.3, r * 0.22, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
  }

  function updateHud() {
    document.getElementById('g-score').textContent = score;
    document.getElementById('g-lives').textContent = '❤️'.repeat(Math.max(0, lives)) || '💔';
    document.getElementById('g-time').textContent = Math.max(0, Math.ceil(timeLeft));
  }

  return { init, start, stop };
})();
