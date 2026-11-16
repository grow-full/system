// 떨어지는 여행지 특산품을 받는 캔버스 미니게임.
// 마우스/터치로 끌거나 ←/→ 키로 우왕이를 움직인다.
// 우왕이는 실제 그림(buddy.js의 uwangCanvasArt)으로 그리고, 바구니를 몸 앞에 들고 있다.
const MiniGame = (() => {
  const DURATION = 30;
  const ITEM_RADIUS = 18;
  // 우왕이 반응 (게임 반응표). 길이는 px, 시간은 초.
  const ART_HEIGHT = 78;  // 캔버스 속 우왕이 키
  const FEET_GAP = 14;    // 바닥에서 발바닥까지
  const BASKET_UP = 20;   // 발바닥에서 바구니(받는 위치)까지. 우왕이 손 높이
  const POSES = {
    ready: 0.7,  // 시작: 두 발을 벌리고 바구니를 앞으로 내밀기 + 기대하는 미소
    catch: 0.4,  // 먹거리: 바구니가 살짝 내려갔다가 반동으로 올라오기 + 눈 접은 웃음
    star: 0.6,   // 별: 바구니를 번쩍 들고 작은 점프 + 활짝 웃음
    hit: 0.65,   // 번개: 어깨를 움츠리고 뒤로 젖혔다가 회복 + 놀란 얼굴
    out: 1.5,    // 하트 소진: 주저앉았다가 고개 들기 + 아쉬운 표정 (끝나면 결과 창)
  };

  let canvas, ctx, width, height;
  let dest, onEnd;
  let running = false;
  let ending = false; // 하트를 다 잃고 주저앉는 중 (입력·아이템 멈춤)
  let rafId = 0;
  let lastTime = 0;
  let player, items, popups, score, lives, timeLeft, spawnTimer;
  const keys = {};

  function init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    ['', 'delight', 'surprise', 'pout'].forEach((f) => uwangCanvasArt(f)); // 그림 미리 불러오기

    const follow = (e) => {
      if (!running || ending) return;
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
    if (player) player.y = height - FEET_GAP - BASKET_UP;
  }

  function start(destination, callback) {
    dest = destination;
    onEnd = callback;
    resize();
    player = { x: width / 2, y: height - FEET_GAP - BASKET_UP, r: 28, targetX: width / 2, vx: 0, lean: 0, step: 0, pose: 'ready', poseT: 0 };
    items = [];
    popups = [];
    score = 0;
    lives = 3;
    timeLeft = DURATION;
    spawnTimer = 0;
    running = true;
    ending = false;
    lastTime = performance.now();
    updateHud();
    rafId = requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    ending = false;
    cancelAnimationFrame(rafId);
  }

  function setPose(name) {
    if (player.pose === 'out') return;
    player.pose = name;
    player.poseT = 0;
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
    if (!running) return;
    draw();
    rafId = requestAnimationFrame(loop);
  }

  function update(dt) {
    player.poseT += dt;
    if (player.pose && player.poseT >= POSES[player.pose]) {
      if (player.pose === 'out') { stop(); onEnd(score); return; }
      player.pose = null;
    }
    if (ending) { updatePopups(dt); return; }
    timeLeft -= dt;

    if (keys.ArrowLeft) player.targetX -= 380 * dt;
    if (keys.ArrowRight) player.targetX += 380 * dt;
    player.targetX = Math.max(player.r, Math.min(width - player.r, player.targetX));
    const prevX = player.x;
    player.x += (player.targetX - player.x) * Math.min(1, dt * 12);
    // 좌우 이동: 이동 방향으로 몸을 기울이고 짧게 발 구르기.
    // 멈춰 있으면 가장 먼저 떨어질 먹거리 쪽으로 몸을 살짝 기울여 바라본다.
    player.vx = dt > 0 ? (player.x - prevX) / dt : 0;
    const moving = Math.abs(player.vx) > 40;
    let want = Math.max(-11, Math.min(11, player.vx / 30));
    if (!moving) {
      const near = items.filter((i) => i.type !== 'bad').sort((a, b) => b.y - a.y)[0];
      want = near ? Math.max(-4, Math.min(4, (near.x - player.x) / 25)) : 0;
    }
    player.lean += (want - player.lean) * Math.min(1, dt * 10);
    player.step = moving ? player.step + dt * 16 : player.step * Math.max(0, 1 - dt * 8);

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
          setPose('hit');
        } else {
          const points = item.type === 'star' ? 30 : 10;
          score += points;
          Sound.sfx('coin');
          popups.push({ x: item.x, y: item.y, text: `+${points}`, life: 0.8 });
          if (item.type === 'star') {
            setPose('star');
            popups.push({ x: player.x - 28, y: player.y - 48, text: '✨', life: 0.6 }, { x: player.x + 28, y: player.y - 42, text: '✨', life: 0.6 });
          } else if (player.pose !== 'star' && player.pose !== 'hit') {
            setPose('catch');
          }
        }
      } else if (item.y > height + ITEM_RADIUS) {
        item.dead = true;
      }
    }
    items = items.filter((item) => !item.dead);
    updatePopups(dt);

    updateHud();
    if (lives <= 0) {
      ending = true;
      items = [];
      player.pose = null;
      setPose('out');
    } else if (timeLeft <= 0) {
      stop();
      onEnd(score);
    }
  }

  function updatePopups(dt) {
    for (const p of popups) {
      p.y -= 40 * dt;
      p.life -= dt;
    }
    popups = popups.filter((p) => p.life > 0);
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

    drawUwang();

    ctx.font = 'bold 18px sans-serif';
    for (const p of popups) {
      ctx.globalAlpha = Math.max(0, p.life / 0.8);
      ctx.fillStyle = '#3b2a1a';
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.globalAlpha = 1;
  }

  const ease = (t) => 1 - (1 - t) * (1 - t);
  const bump = (t) => Math.sin(Math.PI * Math.min(1, Math.max(0, t))); // 0 → 1 → 0

  // 지금 동작의 몸 변형: dy(위로 −), sx/sy(가로·세로 배율), rot(도), basket(바구니 높이, 위로 −), basketFwd(내밀기 0~1), face
  function poseNow() {
    const p = { dy: 0, sx: 1, sy: 1, rot: player.lean, basket: 0, basketFwd: 0, face: '' };
    const stomp = Math.abs(Math.sin(player.step));
    p.dy -= stomp * 3;
    p.sy -= (1 - stomp) * Math.min(1, Math.abs(player.vx) / 200) * 0.03;
    const t = player.pose ? player.poseT / POSES[player.pose] : 0;
    switch (player.pose) {
      case 'ready': {
        const k = t < 0.6 ? ease(t / 0.6) : 1 - 0.4 * ease((t - 0.6) / 0.4);
        p.sx += 0.06 * k;
        p.sy -= 0.04 * k;
        p.basketFwd = k;
        p.basket = -6 * k;
        break;
      }
      case 'catch': {
        const k = Math.sin(Math.PI * 2 * t) * (1 - t); // 내려갔다가 반동으로 살짝 위로
        p.basket += 7 * k;
        p.sy -= 0.03 * Math.max(0, k);
        p.face = 'delight';
        break;
      }
      case 'star': {
        const k = bump(t);
        p.dy -= 16 * k;
        p.basket -= 22 * k;
        p.sy += 0.04 * k;
        break;
      }
      case 'hit': {
        const k = t < 0.35 ? ease(t / 0.35) : 1 - ease((t - 0.35) / 0.65);
        p.sx -= 0.06 * k;
        p.sy -= 0.1 * k; // 움츠리기
        p.rot += (player.lean >= 0 ? -1 : 1) * 9 * k; // 뒤로 젖히기
        p.dy += 2 * k;
        p.face = t < 0.75 ? 'surprise' : '';
        break;
      }
      case 'out': {
        const sit = t < 0.4 ? ease(t / 0.4) : 1 - 0.55 * ease((t - 0.4) / 0.6); // 주저앉았다가 고개 들기
        p.sy -= 0.2 * sit;
        p.sx += 0.08 * sit;
        p.rot = t < 0.4 ? 6 * sit : 6 * sit * (1 - ease((t - 0.4) / 0.6));
        p.basket += 14 * sit;
        p.face = 'pout';
        break;
      }
      default:
    }
    return p;
  }

  function drawUwang() {
    const p = poseNow();
    const art = uwangCanvasArt(p.face);
    if (!art.img.complete || !art.img.naturalWidth) { drawPlayer(player.x, player.y, player.r); return; }
    const feetY = height - FEET_GAP;
    const k = ART_HEIGHT / art.ref;
    const w = art.sw * k;
    const h = art.sh * k;
    ctx.save();
    ctx.translate(player.x, feetY + p.dy);
    ctx.fillStyle = 'rgba(0,0,0,.12)';
    ctx.beginPath(); ctx.ellipse(0, -p.dy, w * 0.3, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.rotate((p.rot * Math.PI) / 180);
    ctx.scale(p.sx, p.sy);
    ctx.drawImage(art.img, art.sx, art.sy, art.sw, art.sh, -w / 2, -h, w, h);
    // 바구니는 몸 앞(배 높이)에 든다. 받는 판정 위치(player.y)와 맞춘다.
    ctx.fillStyle = '#000';
    ctx.font = `${Math.round(28 * (1 + 0.18 * p.basketFwd))}px sans-serif`;
    ctx.fillText('🧺', 0, player.y - feetY + p.basket);
    ctx.restore();
  }

  // 그림을 불러오지 못했을 때 쓰는 단순한 우왕이
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
