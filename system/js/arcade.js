// 게임 탭에 더한 게임들: 기념품 타일 매치, 장애물 피하기, 짐 싸기 블록 퍼즐, 특산품 3매치.
// 모두 #game-arcade 칸 하나에 그리고, 끝나면 start()에 넘긴 콜백(score, detail)을 부른다.
const Arcade = (() => {
  let timers = [];
  let cleanups = []; // 게임을 멈출 때 떼어 낼 이벤트와 애니메이션
  let run = 0; // 게임을 멈추거나 바꾸면 늘어나서, 남아 있던 콜백이 실행되지 않게 한다
  let onEnd = null;

  const board = () => $('#a-board');
  const rand = (n) => Math.floor(Math.random() * n);

  function later(fn, ms) {
    const r = run;
    timers.push(setTimeout(() => { if (r === run) fn(); }, ms));
  }

  function every(fn, ms) {
    const r = run;
    timers.push(setInterval(() => { if (r === run) fn(); }, ms));
  }

  // 매 화면마다 fn(dt초)를 부른다
  function frame(fn) {
    const r = run;
    let last = performance.now();
    let id = 0;
    const tick = (now) => {
      if (r !== run) return;
      // 첫 프레임의 시각이 시작 시각보다 이를 수 있어서 음수를 막는다
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
      last = now;
      fn(dt);
      if (r === run) id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    cleanups.push(() => cancelAnimationFrame(id));
  }

  function listen(target, type, fn) {
    target.addEventListener(type, fn);
    cleanups.push(() => target.removeEventListener(type, fn));
  }

  function stop() {
    run++;
    timers.forEach((t) => { clearTimeout(t); clearInterval(t); });
    timers = [];
    cleanups.forEach((fn) => fn());
    cleanups = [];
  }

  function end(score, detail) {
    stop();
    onEnd(score, detail);
  }

  function hud(parts) {
    $('#a-hud').innerHTML = parts.map((p) => `<span>${p}</span>`).join('');
  }

  function start(id, callback) {
    stop();
    onEnd = callback;
    board().innerHTML = '';
    if (id === 'tiles') startTiles();
    if (id === 'runner') startRunner();
    if (id === 'blocks') startBlocks();
    if (id === 'match3') startMatch3();
  }

  // ---------- 장애물 피하기: 계속 달리는 우왕이가 장애물을 피한다 ----------
  // 탭·클릭·스페이스·↑로 점프, 공중에서 한 번 더 누르면 2단 점프.
  // 🌵 바닥 선인장은 뛰어넘고, 🐦 머리 위 새는 점프하지 말고 그대로 지나간다.
  // 갈수록 빨라지고, 낮 → 노을 → 밤으로 하늘이 바뀐다.
  function startRunner() {
    const H = 360;            // 캔버스 높이 (CSS 픽셀)
    const GROUND = H - 48;    // 땅의 y
    const GRAVITY = 2300;
    const JUMP = 800;
    const DOUBLE_JUMP = 680;
    const START_SPEED = 280;
    const MAX_SPEED = 900;
    const SPEED_UP = 11;      // 1초마다 빨라지는 정도
    const BIRD_FROM = 10;     // 이 시간(초)부터 새가 나온다
    const BIRD_BOTTOM = GROUND - 68; // 서 있는 우왕이 머리보다 위, 점프하면 부딪히는 높이
    const CACTI = [
      { w: 20, h: 38 },               // 작은 선인장
      { w: 24, h: 58 },               // 큰 선인장
      { w: 48, h: 38, double: true }, // 작은 선인장 두 개
    ];
    // 하늘 색: 시간(초)에 따라 낮 → 노을 → 밤
    const SKY = [
      { at: 0, top: '#bfe9ff', bottom: '#fff3d6', hill: '#f2d9a8', ground: '#e0b878', line: '#c99c5a' },
      { at: 20, top: '#9fd4f5', bottom: '#ffe7c2', hill: '#f0d2a0', ground: '#ddb273', line: '#c49556' },
      { at: 32, top: '#ff9a76', bottom: '#ffd59e', hill: '#d9a77a', ground: '#c9985c', line: '#a87a45' },
      { at: 45, top: '#0f1a3d', bottom: '#3a3a6e', hill: '#2f3360', ground: '#8a6a45', line: '#6e5235' },
    ];

    board().innerHTML = '<div class="runner-box"><canvas id="a-runner" aria-label="장애물 피하기 화면"></canvas></div>';
    const canvas = $('#a-runner');
    const ctx = canvas.getContext('2d');
    let W = 0;
    function resize() {
      const dpr = window.devicePixelRatio || 1;
      W = canvas.getBoundingClientRect().width;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();

    // 밤하늘 별 자리 (한 번만 정한다)
    const skyStars = Array.from({ length: 40 }, () => ({ x: Math.random(), y: Math.random() * 0.6, phase: Math.random() * 6 }));

    const player = { x: 72, y: GROUND, vy: 0, r: 22, jumps: 0 }; // y는 발끝
    let obstacles = [];
    let stars = [];
    let popups = [];
    let banner = null;  // 화면 위쪽 안내 ("속도 UP!" 등)
    let started = false;
    let time = 0;
    let speed = START_SPEED;
    let speedLevel = 0;
    let traveled = 0;
    let nextGap = 420;
    let nextKind = 'cactus';
    let lives = 3;
    let hurt = 0;       // 부딪힌 뒤 잠깐 무적
    let starCount = 0;
    let lastHud = '';

    const score = () => Math.floor(traveled / 150) + starCount * 5;

    function jump() {
      if (!started) {
        started = true;
        return;
      }
      if (player.jumps >= 2) return;
      player.vy = player.jumps === 0 ? -JUMP : -DOUBLE_JUMP;
      player.jumps++;
      Sound.sfx('beep');
    }

    listen(canvas, 'pointerdown', (e) => { e.preventDefault(); jump(); });
    listen(document, 'keydown', (e) => {
      if (![' ', 'ArrowUp', 'w', 'W'].includes(e.key)) return;
      e.preventDefault();
      if (!e.repeat) jump();
    });
    listen(window, 'resize', resize);

    function pickKind() {
      if (time < BIRD_FROM) return 'cactus';
      return Math.random() < Math.min(0.4, 0.15 + (time - BIRD_FROM) * 0.006) ? 'bird' : 'cactus';
    }

    function spawn(kind) {
      const x = W + 20;
      if (kind === 'bird') {
        obstacles.push({ kind, x, w: 44, h: 26, base: BIRD_BOTTOM - 26, top: BIRD_BOTTOM - 26, bottom: BIRD_BOTTOM, phase: Math.random() * 6 });
        if (Math.random() < 0.6) {
          // 새 아래에 별: 점프하지 않고 지나가면 먹는다
          [-10, 22, 54].forEach((off) => stars.push({ x: x + off, y: GROUND - 24 }));
        }
        return;
      }
      const pool = time < 8 ? CACTI.slice(0, 2) : CACTI;
      const c = pool[rand(pool.length)];
      obstacles.push({ kind, ...c, x, top: GROUND - c.h, bottom: GROUND });
      // 가끔 선인장 위에 별 3개를 띄운다 (점프하면서 먹는 자리)
      if (Math.random() < 0.5) {
        [-36, c.w / 2, c.w + 36].forEach((off, i) => {
          stars.push({ x: x + off, y: GROUND - c.h - (i === 1 ? 70 : 45) });
        });
      }
    }

    function hit(o) {
      const r = player.r;
      const left = player.x - r * 0.7;
      const right = player.x + r * 0.7;
      const top = player.y - r * 1.7;
      const pad = 4; // 살짝 스친 건 봐준다
      return right - pad > o.x && left + pad < o.x + o.w && player.y - pad > o.top && top + pad < o.bottom;
    }

    function update(dt) {
      if (!started) return;
      time += dt;
      speed = Math.min(MAX_SPEED, START_SPEED + time * SPEED_UP);
      // 10초마다 알려 준다
      const level = Math.floor(time / 10);
      if (level > speedLevel && speed < MAX_SPEED) {
        speedLevel = level;
        banner = { text: level === 1 ? '속도 UP! 🐦 새가 날아와요' : '속도 UP! 🔥', life: 1.6 };
        Sound.sfx('ding');
      }
      const dx = speed * dt;
      traveled += dx;

      player.vy += GRAVITY * dt;
      player.y += player.vy * dt;
      if (player.y >= GROUND) {
        player.y = GROUND;
        player.vy = 0;
        player.jumps = 0;
      }

      nextGap -= dx;
      if (nextGap <= 0) {
        spawn(nextKind);
        nextKind = pickKind();
        // 새 앞에는 착지할 여유를 조금 더 둔다
        nextGap = speed * (0.75 + Math.random() * 0.9) + 140 + (nextKind === 'bird' ? speed * 0.25 : 0);
      }

      obstacles.forEach((o) => {
        o.x -= dx;
        if (o.kind === 'bird') {
          o.phase += dt * 10;
          o.top = o.base + Math.sin(o.phase / 3) * 3;
          o.bottom = o.top + o.h;
        }
      });
      stars.forEach((s) => { s.x -= dx; });
      obstacles = obstacles.filter((o) => o.x + o.w > -20);
      stars = stars.filter((s) => s.x > -20 && !s.got);

      hurt = Math.max(0, hurt - dt);
      if (!hurt) {
        const o = obstacles.find(hit);
        if (o) {
          lives--;
          hurt = 1.2;
          Sound.sfx('bad');
          popups.push({ x: player.x, y: player.y - 60, text: '💥', life: 0.8 });
          if (lives <= 0) return end(score(), `${Math.floor(traveled / 50)}m 달리고 ⭐ ${starCount}개`);
        }
      }

      for (const s of stars) {
        if (Math.hypot(s.x - player.x, s.y - (player.y - player.r)) < player.r + 12) {
          s.got = true;
          starCount++;
          Sound.sfx('coin');
          popups.push({ x: s.x, y: s.y, text: '+5', life: 0.7 });
        }
      }

      popups.forEach((p) => { p.y -= 40 * dt; p.life -= dt; });
      popups = popups.filter((p) => p.life > 0);
      if (banner && (banner.life -= dt) <= 0) banner = null;
    }

    // ---------- 그리기 ----------
    function mix(a, b, t) {
      const pa = parseInt(a.slice(1), 16);
      const pb = parseInt(b.slice(1), 16);
      const ch = (shift) => Math.round(((pa >> shift) & 255) + ((((pb >> shift) & 255) - ((pa >> shift) & 255)) * t));
      return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
    }

    // 지금 시간의 하늘 색과 밤인 정도(0~1)
    function skyNow() {
      let i = 0;
      while (i < SKY.length - 1 && time >= SKY[i + 1].at) i++;
      const a = SKY[i];
      const b = SKY[Math.min(i + 1, SKY.length - 1)];
      const t = a === b ? 0 : (time - a.at) / (b.at - a.at);
      const colors = {};
      ['top', 'bottom', 'hill', 'ground', 'line'].forEach((k) => { colors[k] = mix(a[k], b[k], t); });
      colors.night = Math.max(0, Math.min(1, (time - SKY[2].at) / (SKY[3].at - SKY[2].at)));
      colors.dusk = Math.max(0, Math.min(1, (time - SKY[1].at) / (SKY[3].at - SKY[1].at)));
      return colors;
    }

    function roundRect(x, y, w, h, r) {
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
      else ctx.rect(x, y, w, h);
      ctx.fill();
    }

    function drawCactus(x, w, h) {
      ctx.fillStyle = '#3fa34d';
      const trunk = Math.max(10, w * 0.5);
      const tx = x + (w - trunk) / 2;
      roundRect(tx, GROUND - h, trunk, h + 2, trunk / 2);
      // 양팔
      const arm = trunk * 0.6;
      roundRect(x - 2, GROUND - h * 0.62, arm, h * 0.3, arm / 2);
      roundRect(x - 2, GROUND - h * 0.4, tx - x + 4, arm * 0.8, arm / 2);
      roundRect(x + w - arm + 2, GROUND - h * 0.75, arm, h * 0.3, arm / 2);
      roundRect(tx + trunk - 2, GROUND - h * 0.52, x + w - tx - trunk + 4, arm * 0.8, arm / 2);
      ctx.fillStyle = 'rgba(255,255,255,.35)';
      for (let k = 0.2; k < 0.9; k += 0.25) ctx.fillRect(tx + trunk * 0.3, GROUND - h * k, 2, 4);
    }

    // 왼쪽(우왕이 쪽)을 보고 날아오는 새
    function drawBird(o) {
      const cx = o.x + 24;
      const cy = o.top + 15;
      const flap = Math.sin(o.phase) * 10;
      ctx.fillStyle = '#5d4e8c';
      // 날개 (위아래로 퍼덕)
      ctx.beginPath();
      ctx.moveTo(cx - 6, cy - 2);
      ctx.lineTo(cx + 14, cy - 2);
      ctx.lineTo(cx + 6, cy - 2 - flap);
      ctx.closePath();
      ctx.fill();
      // 몸통과 머리
      ctx.beginPath(); ctx.ellipse(cx, cy, 16, 9, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx - 14, cy - 4, 7, 0, Math.PI * 2); ctx.fill();
      // 꼬리
      ctx.beginPath(); ctx.moveTo(cx + 14, cy - 2); ctx.lineTo(cx + 22, cy - 7); ctx.lineTo(cx + 22, cy + 3); ctx.closePath(); ctx.fill();
      // 부리와 눈
      ctx.fillStyle = '#ffb347';
      ctx.beginPath(); ctx.moveTo(cx - 20, cy - 6); ctx.lineTo(cx - 28, cy - 3); ctx.lineTo(cx - 20, cy - 1); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(cx - 15, cy - 6, 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#222';
      ctx.beginPath(); ctx.arc(cx - 15.6, cy - 6, 1.3, 0, Math.PI * 2); ctx.fill();
    }

    function drawPlayer() {
      if (hurt && Math.floor(hurt * 10) % 2) return; // 깜빡깜빡
      const { x, r } = player;
      const cy = player.y - r - 6;
      // 다리: 땅에서는 번갈아 움직이고, 공중에서는 모은다
      const step = player.y < GROUND ? 0 : Math.sin(traveled / 14) * 6;
      ctx.fillStyle = '#c98a3a';
      ctx.beginPath(); ctx.ellipse(x - 8 + step, player.y - 4, 7, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x + 8 - step, player.y - 4, 7, 5, 0, 0, Math.PI * 2); ctx.fill();
      // 귀, 몸, 배, 얼굴
      ctx.fillStyle = '#e8a54b';
      ctx.beginPath(); ctx.arc(x - r * 0.72, cy - r * 0.72, r * 0.36, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + r * 0.72, cy - r * 0.72, r * 0.36, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f5c16c';
      ctx.beginPath(); ctx.arc(x, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fbe3b8';
      ctx.beginPath(); ctx.ellipse(x + 3, cy + r * 0.35, r * 0.55, r * 0.42, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3b2a1a';
      ctx.beginPath(); ctx.arc(x - r * 0.2, cy - r * 0.12, r * 0.11, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + r * 0.5, cy - r * 0.12, r * 0.11, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#7a4b2a';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(x + 4, cy + r * 0.3, r * 0.22, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    }

    function draw() {
      const sky = skyNow();
      const grad = ctx.createLinearGradient(0, 0, 0, GROUND);
      grad.addColorStop(0, sky.top);
      grad.addColorStop(1, sky.bottom);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      // 밤하늘 별 (반짝반짝)
      if (sky.night > 0) {
        ctx.fillStyle = '#fff';
        skyStars.forEach((s) => {
          ctx.globalAlpha = sky.night * (0.5 + 0.5 * Math.sin(time * 3 + s.phase));
          ctx.fillRect(s.x * W, s.y * GROUND, 2, 2);
        });
        ctx.globalAlpha = 1;
      }

      // 해는 지고 달은 뜬다
      const sunY = 60 + sky.dusk * (GROUND - 40);
      ctx.fillStyle = sky.dusk < 0.5 ? '#ffd23f' : '#ff7b39';
      ctx.beginPath(); ctx.arc(W - 70, sunY, 22, 0, Math.PI * 2); ctx.fill();
      if (sky.night > 0) {
        const moonY = GROUND - sky.night * (GROUND - 70);
        ctx.fillStyle = '#fff6d5';
        ctx.beginPath(); ctx.arc(80, moonY, 18, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = sky.top;
        ctx.beginPath(); ctx.arc(88, moonY - 5, 15, 0, Math.PI * 2); ctx.fill(); // 초승달
      }

      // 멀리 있는 구름과 언덕은 천천히 지나간다 (밤에는 구름이 옅어진다)
      ctx.fillStyle = `rgba(255,255,255,${0.85 - sky.night * 0.65})`;
      for (let i = 0; i < 4; i++) {
        const cx = ((i * 170 - traveled * 0.15) % (W + 160) + W + 160) % (W + 160) - 80;
        const cy = 50 + (i % 2) * 40;
        ctx.beginPath(); ctx.ellipse(cx, cy, 34, 13, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(cx + 20, cy - 8, 20, 12, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = sky.hill;
      for (let i = 0; i < 4; i++) {
        const hx = ((i * 220 - traveled * 0.35) % (W + 260) + W + 260) % (W + 260) - 130;
        ctx.beginPath(); ctx.ellipse(hx, GROUND, 120, 60 + (i % 2) * 25, 0, Math.PI, 0); ctx.fill();
      }

      // 땅
      ctx.fillStyle = sky.ground;
      ctx.fillRect(0, GROUND, W, H - GROUND);
      ctx.fillStyle = sky.line;
      ctx.fillRect(0, GROUND, W, 4);
      for (let gx = -(traveled % 40); gx < W; gx += 40) ctx.fillRect(gx, GROUND + 16, 14, 3);

      obstacles.forEach((o) => {
        if (o.kind === 'bird') drawBird(o);
        else if (o.double) {
          drawCactus(o.x, 20, o.h);
          drawCactus(o.x + o.w - 20, 20, o.h - 6);
        } else {
          drawCactus(o.x, o.w, o.h);
        }
      });

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '22px sans-serif';
      // 별은 항상 불투명하게 (앞에서 그린 선인장 무늬의 반투명 색이 남아 있으면 별도 흐려진다)
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#000';
      stars.forEach((s) => ctx.fillText('⭐', s.x, s.y));

      drawPlayer();

      const ink = sky.night > 0.5 ? '#fff' : '#3b2a1a';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillStyle = ink;
      popups.forEach((p) => {
        ctx.globalAlpha = Math.max(0, p.life / 0.8);
        ctx.fillText(p.text, p.x, p.y);
      });
      ctx.globalAlpha = 1;

      if (banner) {
        ctx.globalAlpha = Math.min(1, banner.life * 2);
        ctx.fillStyle = 'rgba(59,42,26,.75)';
        roundRect(W / 2 - 120, 18, 240, 36, 18);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText(banner.text, W / 2, 37);
        ctx.globalAlpha = 1;
      }

      if (!started) {
        ctx.fillStyle = 'rgba(59,42,26,.55)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 22px sans-serif';
        ctx.fillText('화면을 누르면 출발! 🏃', W / 2, H / 2 - 42);
        ctx.font = '15px sans-serif';
        ctx.fillText('탭·스페이스로 점프, 한 번 더 누르면 2단 점프', W / 2, H / 2 - 6);
        ctx.fillText('🌵 선인장은 뛰어넘고', W / 2, H / 2 + 18);
        ctx.fillText('🐦 머리 위 새는 점프하지 말고 지나가요', W / 2, H / 2 + 40);
        ctx.fillText('⭐ 별을 모으면 +5점', W / 2, H / 2 + 62);
      }
    }

    frame((dt) => {
      update(dt);
      if (lives <= 0) return;
      draw();
      const text = `점수 <b>${score()}</b>|${'❤️'.repeat(lives)}|⭐ <b>${starCount}</b>`;
      if (text !== lastHud) {
        lastHud = text;
        hud(text.split('|'));
      }
    });
  }

  // 퍼즐 게임에서 쓰는 잠깐 기다리기 (게임을 멈추면 그대로 버려진다)
  const sleep = (ms) => new Promise((resolve) => later(resolve, ms));

  // 같은 그림이 모자라면 채울 그림
  const SPARE_EMOJIS = ['🧸', '🎈', '🪁', '🎀', '🧩', '🪀', '🍩', '🍪', '🍓', '🍇'];
  function pickEmojis(list, count) {
    const unique = [...new Set(list)];
    for (const e of SPARE_EMOJIS) if (unique.length < count && !unique.includes(e)) unique.push(e);
    return unique.slice(0, count);
  }

  // ---------- 기념품 타일 매치: 위에 덮이지 않은 타일을 골라 같은 그림 3개를 모은다 ----------
  function startTiles() {
    const T = 48;      // 타일 한 칸 (px)
    const TRAY = 7;    // 아래 칸 수. 가득 차면 끝
    const KINDS = 8;   // 그림 종류 (많을수록 어렵다)
    const LAYERS = [
      { cols: 6, rows: 5, off: 0 },
      { cols: 5, rows: 4, off: T / 2 },
      { cols: 4, rows: 3, off: T },
    ];

    const spots = [];
    LAYERS.forEach((l, z) => {
      for (let r = 0; r < l.rows; r++) for (let c = 0; c < l.cols; c++) spots.push({ x: l.off + c * T, y: l.off + r * T, z });
    });
    while (spots.length % 3) spots.pop(); // 3장씩 없어지므로 3의 배수로 맞춘다 (맨 위층에서 뺀다)

    const tiles = spots.map((s, i) => ({ ...s, id: i, kind: null, gone: false }));
    const isCovered = (t, list) => list.some((o) => o.z > t.z && Math.abs(o.x - t.x) < T && Math.abs(o.y - t.y) < T);

    // 꼭 풀 수 있게 그림을 나눠 준다: 다 쌓은 판에서 드러난 타일을 하나씩 걷어 내면서
    // 걷어 낸 순서대로 3장마다 같은 그림을 붙인다. 이 순서대로 고르면 반드시 다 치울 수 있다.
    const emojis = pickEmojis(DESTINATIONS.map((d) => d.souvenir.emoji), KINDS);
    let rest = tiles.slice();
    let current = emojis[rand(emojis.length)];
    for (let n = 1; rest.length; n++) {
      const free = rest.filter((t) => !isCovered(t, rest));
      const t = free[rand(free.length)];
      t.kind = current;
      rest = rest.filter((o) => o !== t);
      if (n % 3 === 0) current = emojis[rand(emojis.length)];
    }

    let tray = [];        // { kind, id }
    let score = 0;
    let sets = 0;
    let locked = false;
    let undoLeft = 1;
    let shuffleLeft = 1;
    let lastId = null;    // 되돌리기용: 마지막으로 아래 칸에 넣은 타일

    board().innerHTML = `
      <p class="puzzle-msg" id="t-msg">위에 덮이지 않은 타일을 눌러 같은 그림 3개를 모아요</p>
      <div class="tile-board" id="t-board" style="width:${6 * T}px;height:${5 * T}px"></div>
      <div class="tile-tray" id="t-tray"></div>
      <div class="puzzle-tools">
        <button id="t-undo">↩️ 되돌리기</button>
        <button id="t-shuffle">🔀 섞기</button>
      </div>`;
    const msg = (text) => { $('#t-msg').textContent = text; };
    const left = () => tiles.filter((t) => !t.gone).length;

    const covered = (t) => isCovered(t, tiles.filter((o) => !o.gone));

    function render() {
      $('#t-board').innerHTML = tiles.filter((t) => !t.gone).map((t) => `
        <button class="tile${covered(t) ? ' covered' : ''}" data-tile="${t.id}"
          style="left:${t.x}px;top:${t.y}px;z-index:${t.z + 1}">${t.kind}</button>`).join('');
      const slots = [];
      for (let i = 0; i < TRAY; i++) {
        const s = tray[i];
        slots.push(`<span class="slot${s && s.clearing ? ' clearing' : ''}">${s ? s.kind : ''}</span>`);
      }
      $('#t-tray').innerHTML = slots.join('');
      $('#t-undo').textContent = `↩️ 되돌리기 ${undoLeft}`;
      $('#t-shuffle').textContent = `🔀 섞기 ${shuffleLeft}`;
      $('#t-undo').disabled = !undoLeft || lastId === null || locked;
      $('#t-shuffle').disabled = !shuffleLeft || locked;
      hud([`점수 <b>${score}</b>`, `남은 타일 <b>${left()}</b>`]);
    }

    async function pick(tile) {
      if (locked || tile.gone || covered(tile)) return;
      tile.gone = true;
      Sound.sfx('beep');
      // 같은 그림 옆에 끼워 넣는다
      const at = tray.map((s) => s.kind).lastIndexOf(tile.kind);
      tray.splice(at < 0 ? tray.length : at + 1, 0, { kind: tile.kind, id: tile.id });
      lastId = tile.id;

      const same = tray.filter((s) => s.kind === tile.kind);
      if (same.length >= 3) {
        locked = true;
        same.slice(0, 3).forEach((s) => { s.clearing = true; });
        render();
        await sleep(260);
        tray = tray.filter((s) => !s.clearing);
        score += 10;
        sets++;
        lastId = null; // 맞춘 뒤에는 되돌릴 수 없다
        locked = false;
        Sound.sfx('coin');
        if (!left() && !tray.length) {
          render();
          msg('모든 타일을 치웠어요! 🎉 보너스 +50');
          await sleep(900);
          return end(score + 50, `${sets}세트 모두 맞췄어요 · 보너스 +50`);
        }
      } else if (tray.length >= TRAY) {
        locked = true;
        render();
        Sound.sfx('bad');
        msg('아래 칸이 가득 찼어요! 😵');
        await sleep(1100);
        return end(score, `${sets}세트 맞췄어요`);
      }
      render();
    }

    $('#t-board').addEventListener('click', (e) => {
      const b = e.target.closest('[data-tile]');
      if (b) pick(tiles[Number(b.dataset.tile)]);
    });
    $('#t-undo').addEventListener('click', () => {
      if (!undoLeft || lastId === null || locked) return;
      tray = tray.filter((s) => s.id !== lastId);
      tiles[lastId].gone = false;
      lastId = null;
      undoLeft--;
      msg('한 장 되돌렸어요');
      render();
    });
    $('#t-shuffle').addEventListener('click', () => {
      if (!shuffleLeft || locked) return;
      const rest = tiles.filter((t) => !t.gone);
      const mixed = shuffle(rest.map((t) => t.kind));
      rest.forEach((t, i) => { t.kind = mixed[i]; });
      shuffleLeft--;
      lastId = null;
      msg('남은 타일을 섞었어요');
      render();
    });

    render();
  }

  // ---------- 짐 싸기 블록 퍼즐: 블록을 끌어다 놓고, 가로·세로 한 줄을 채우면 사라진다 ----------
  function startBlocks() {
    const N = 8;
    const COLORS = ['#ff8a3d', '#4fa3ff', '#5cb85c', '#b06cff', '#ff6b8a', '#f5b700'];
    // [x, y] 칸 목록
    const SHAPES = [
      [[0, 0]],
      [[0, 0], [1, 0]], [[0, 0], [0, 1]],
      [[0, 0], [1, 0], [2, 0]], [[0, 0], [0, 1], [0, 2]],
      [[0, 0], [1, 0], [2, 0], [3, 0]], [[0, 0], [0, 1], [0, 2], [0, 3]],
      [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]], [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]],
      [[0, 0], [1, 0], [0, 1], [1, 1]],
      [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2], [2, 2]],
      [[0, 0], [0, 1], [1, 1]], [[1, 0], [0, 1], [1, 1]], [[0, 0], [1, 0], [0, 1]], [[0, 0], [1, 0], [1, 1]],
      [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]], [[2, 0], [2, 1], [2, 2], [1, 2], [0, 2]],
      [[0, 0], [1, 0], [2, 0], [0, 1], [0, 2]], [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]],
      [[0, 0], [1, 0], [2, 0], [1, 1]], [[1, 0], [0, 1], [1, 1], [2, 1]],
      [[0, 0], [0, 1], [0, 2], [1, 2]], [[1, 0], [1, 1], [1, 2], [0, 2]],
      [[1, 0], [2, 0], [0, 1], [1, 1]], [[0, 0], [1, 0], [1, 1], [2, 1]],
    ];

    const grid = Array(N * N).fill(null);
    let pieces = [];
    let score = 0;
    let lines = 0;
    let flash = null;    // 막 지워진 칸 (잠깐 반짝)
    let preview = [];    // 끌고 있는 블록이 들어갈 칸
    let drag = null;
    let over = false;

    board().innerHTML = `
      <p class="puzzle-msg" id="b-msg">블록을 끌어다 놓아요. 가로·세로 한 줄을 채우면 사라져요</p>
      <div class="blk-board" id="b-board">${grid.map((_, i) => `<span data-cell="${i}"></span>`).join('')}</div>
      <div class="blk-tray" id="b-tray"></div>`;
    const boardEl = $('#b-board');
    const trayEl = $('#b-tray');
    const cells = [...boardEl.children];
    const msg = (text) => { $('#b-msg').textContent = text; };

    const size = (shape) => ({ w: Math.max(...shape.map((p) => p[0])) + 1, h: Math.max(...shape.map((p) => p[1])) + 1 });

    function deal() {
      pieces = [0, 1, 2].map(() => ({ shape: SHAPES[rand(SHAPES.length)], color: COLORS[rand(COLORS.length)] }));
    }

    function fits(shape, col, row) {
      return shape.every(([x, y]) => {
        const c = col + x;
        const r = row + y;
        return c >= 0 && c < N && r >= 0 && r < N && !grid[r * N + c];
      });
    }

    function canPlaceAnywhere(shape) {
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (fits(shape, c, r)) return true;
      return false;
    }

    function miniHtml(piece, cell) {
      const { w, h } = size(piece.shape);
      const on = new Set(piece.shape.map(([x, y]) => `${x},${y}`));
      let html = '';
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        html += `<i style="${on.has(`${x},${y}`) ? `background:${piece.color}` : 'visibility:hidden'}"></i>`;
      }
      return `<div class="blk-mini" style="grid-template-columns:repeat(${w}, ${cell}px);grid-auto-rows:${cell}px">${html}</div>`;
    }

    function renderBoard() {
      const pv = new Set(preview);
      cells.forEach((el, i) => {
        const color = grid[i] || (flash && flash[i]);
        el.style.background = color || '';
        el.className = `${grid[i] ? 'on' : ''}${flash && flash[i] ? ' clear' : ''}${pv.has(i) ? ' preview' : ''}`;
        if (pv.has(i) && drag) el.style.background = `${drag.piece.color}88`;
      });
      hud([`점수 <b>${score}</b>`, `지운 줄 <b>${lines}</b>`]);
    }

    function renderTray() {
      trayEl.innerHTML = pieces.map((p, i) => `
        <div class="blk-slot${p && !canPlaceAnywhere(p.shape) ? ' stuck' : ''}" data-piece="${i}">${p ? miniHtml(p, 16) : ''}</div>`).join('');
    }

    function anchorAt(e) {
      const rect = boardEl.getBoundingClientRect();
      const cell = rect.width / N;
      const { w, h } = size(drag.piece.shape);
      // 손가락에 가리지 않게 블록을 손가락 위쪽에 띄운다
      const left = e.clientX - (w * cell) / 2;
      const top = e.clientY - h * cell - 30;
      drag.ghost.style.left = `${left}px`;
      drag.ghost.style.top = `${top}px`;
      return { col: Math.round((left - rect.left) / cell), row: Math.round((top - rect.top) / cell) };
    }

    function place(index, col, row) {
      const piece = pieces[index];
      piece.shape.forEach(([x, y]) => { grid[(row + y) * N + col + x] = piece.color; });
      pieces[index] = null;
      score += piece.shape.length;
      Sound.sfx('beep');

      // 꽉 찬 줄 찾기
      const full = [];
      for (let r = 0; r < N; r++) if ([...Array(N).keys()].every((c) => grid[r * N + c])) full.push([...Array(N).keys()].map((c) => r * N + c));
      for (let c = 0; c < N; c++) if ([...Array(N).keys()].every((r) => grid[r * N + c])) full.push([...Array(N).keys()].map((r) => r * N + c));
      if (full.length) {
        flash = {};
        full.flat().forEach((i) => { flash[i] = grid[i]; grid[i] = null; });
        lines += full.length;
        const bonus = 10 * full.length * full.length;
        score += bonus;
        Sound.sfx('coin');
        msg(full.length > 1 ? `${full.length}줄 한꺼번에! +${bonus} 🎉` : `한 줄 정리! +${bonus}`);
        later(() => { flash = null; renderBoard(); }, 300);
      }

      if (pieces.every((p) => !p)) deal();
      renderBoard();
      renderTray();

      if (pieces.every((p) => !p || !canPlaceAnywhere(p.shape))) {
        over = true;
        Sound.sfx('bad');
        msg('더 놓을 자리가 없어요! 📦');
        later(() => end(score, `${lines}줄 지웠어요`), 1200);
      }
    }

    trayEl.addEventListener('pointerdown', (e) => {
      const slot = e.target.closest('[data-piece]');
      if (over || !slot || !pieces[slot.dataset.piece]) return;
      e.preventDefault();
      const index = Number(slot.dataset.piece);
      const piece = pieces[index];
      const cell = boardEl.getBoundingClientRect().width / N;
      const ghost = document.createElement('div');
      ghost.className = 'blk-ghost';
      ghost.innerHTML = miniHtml(piece, cell - 2);
      document.body.appendChild(ghost);
      drag = { index, piece, ghost, slot };
      slot.classList.add('lifted');
      try { trayEl.setPointerCapture(e.pointerId); } catch (err) { /* 이미 끝난 터치면 무시 */ }
      const { col, row } = anchorAt(e);
      drag.col = col;
      drag.row = row;
    });

    trayEl.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const { col, row } = anchorAt(e);
      drag.col = col;
      drag.row = row;
      preview = fits(drag.piece.shape, col, row) ? drag.piece.shape.map(([x, y]) => (row + y) * N + col + x) : [];
      renderBoard();
    });

    function drop(cancel) {
      if (!drag) return;
      const { index, piece, ghost, slot, col, row } = drag;
      ghost.remove();
      slot.classList.remove('lifted');
      drag = null;
      preview = [];
      if (!cancel && fits(piece.shape, col, row)) place(index, col, row);
      else renderBoard();
    }
    trayEl.addEventListener('pointerup', () => drop(false));
    trayEl.addEventListener('pointercancel', () => drop(true));
    // 게임을 멈추면 끌던 블록을 치운다
    cleanups.push(() => { if (drag) drag.ghost.remove(); });

    deal();
    renderBoard();
    renderTray();
  }

  // ---------- 특산품 3매치: 이웃한 두 칸을 바꿔 같은 먹거리 3개 이상을 한 줄로 ----------
  function startMatch3() {
    const N = 7;
    const MOVES = 20;
    const KINDS = pickEmojis(DESTINATIONS.map((d) => d.item.emoji), 6);

    const grid = [];
    let score = 0;
    let movesLeft = MOVES;
    let busy = false;
    let selected = null;  // [r, c]
    let touch = null;     // 누르기 시작한 칸과 위치

    board().innerHTML = `
      <p class="puzzle-msg" id="m-msg">이웃한 두 칸을 바꿔서 같은 먹거리 3개를 맞춰요. 4개 이상이면 한 줄이 통째로 사라져요!</p>
      <div class="m3-board" id="m3-board"></div>`;
    const boardEl = $('#m3-board');
    const msg = (text) => { $('#m-msg').textContent = text; };

    // 처음부터 맞춰진 줄이 없게 채운다
    for (let r = 0; r < N; r++) {
      grid.push([]);
      for (let c = 0; c < N; c++) {
        let k;
        do k = rand(KINDS.length);
        while ((c >= 2 && grid[r][c - 1] === k && grid[r][c - 2] === k) || (r >= 2 && grid[r - 1][c] === k && grid[r - 2][c] === k));
        grid[r].push(k);
      }
    }

    function findMatches() {
      const hit = new Set();
      const lineClear = (cellsOf) => cellsOf.forEach((key) => hit.add(key));
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N;) {
          let e = c;
          while (e + 1 < N && grid[r][e + 1] === grid[r][c]) e++;
          const len = e - c + 1;
          if (grid[r][c] !== null && len >= 3) {
            for (let k = c; k <= e; k++) hit.add(`${r},${k}`);
            if (len >= 4) lineClear([...Array(N).keys()].map((k) => `${r},${k}`)); // 가로 한 줄 통째로
          }
          c = e + 1;
        }
      }
      for (let c = 0; c < N; c++) {
        for (let r = 0; r < N;) {
          let e = r;
          while (e + 1 < N && grid[e + 1][c] === grid[r][c]) e++;
          const len = e - r + 1;
          if (grid[r][c] !== null && len >= 3) {
            for (let k = r; k <= e; k++) hit.add(`${k},${c}`);
            if (len >= 4) lineClear([...Array(N).keys()].map((k) => `${k},${c}`)); // 세로 한 줄 통째로
          }
          r = e + 1;
        }
      }
      return hit;
    }

    function swap(a, b) {
      const t = grid[a[0]][a[1]];
      grid[a[0]][a[1]] = grid[b[0]][b[1]];
      grid[b[0]][b[1]] = t;
    }

    function hasMove() {
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        for (const [dr, dc] of [[0, 1], [1, 0]]) {
          const b = [r + dr, c + dc];
          if (b[0] >= N || b[1] >= N) continue;
          swap([r, c], b);
          const ok = findMatches().size > 0;
          swap([r, c], b);
          if (ok) return true;
        }
      }
      return false;
    }

    function render(popping = new Set(), fresh = new Set()) {
      let html = '';
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const key = `${r},${c}`;
        const sel = selected && selected[0] === r && selected[1] === c;
        const cls = `${sel ? ' sel' : ''}${popping.has(key) ? ' pop' : ''}${fresh.has(key) ? ' drop' : ''}`;
        html += `<button class="m3${cls}" data-rc="${key}">${grid[r][c] === null ? '' : KINDS[grid[r][c]]}</button>`;
      }
      boardEl.innerHTML = html;
      hud([`점수 <b>${score}</b>`, `남은 이동 <b>${movesLeft}</b>`]);
    }

    async function resolve() {
      let combo = 1;
      for (;;) {
        const hit = findMatches();
        if (!hit.size) break;
        render(hit);
        Sound.sfx('coin');
        const gained = hit.size * Math.min(combo, 3); // 연쇄 배율은 3배까지
        score += gained;
        msg(combo > 1 ? `연쇄 ${combo}번! +${gained} 🔥` : `+${gained}`);
        await sleep(260);
        hit.forEach((key) => { const [r, c] = key.split(',').map(Number); grid[r][c] = null; });
        // 아래로 떨어뜨리고 위에서 새로 채운다
        const fresh = new Set();
        for (let c = 0; c < N; c++) {
          const col = [];
          for (let r = N - 1; r >= 0; r--) if (grid[r][c] !== null) col.push(grid[r][c]);
          for (let r = N - 1, i = 0; r >= 0; r--, i++) {
            const k = i < col.length ? col[i] : rand(KINDS.length);
            if (grid[r][c] !== k || i >= col.length) fresh.add(`${r},${c}`);
            grid[r][c] = k;
          }
        }
        render(new Set(), fresh);
        await sleep(240);
        combo++;
      }
    }

    async function trySwap(a, b) {
      if (busy || movesLeft <= 0) return;
      if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) !== 1) return;
      if (b[0] < 0 || b[0] >= N || b[1] < 0 || b[1] >= N) return;
      busy = true;
      selected = null;
      swap(a, b);
      render();
      if (!findMatches().size) {
        Sound.sfx('bad');
        await sleep(200);
        swap(a, b); // 맞는 게 없으면 되돌린다
        render();
        busy = false;
        return;
      }
      movesLeft--;
      await resolve();
      if (movesLeft <= 0) {
        msg('이동을 모두 썼어요! 🏁');
        await sleep(900);
        return end(score, `${MOVES}번 움직여서 ${score}점`);
      }
      if (!hasMove()) {
        // 바꿀 곳이 없으면 맞춰진 줄 없이 다시 섞는다
        do {
          const all = shuffle(grid.flat());
          for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) grid[r][c] = all[r * N + c];
        } while (findMatches().size || !hasMove());
        msg('바꿀 곳이 없어서 섞었어요 🔀');
      }
      render();
      busy = false;
    }

    const cellOf = (e) => {
      const b = e.target.closest('[data-rc]');
      return b ? b.dataset.rc.split(',').map(Number) : null;
    };

    // 밀어서 바꾸기 + 두 칸을 차례로 눌러서 바꾸기
    boardEl.addEventListener('pointerdown', (e) => {
      const rc = cellOf(e);
      if (!rc || busy) return;
      e.preventDefault();
      touch = { rc, x: e.clientX, y: e.clientY };
      try { boardEl.setPointerCapture(e.pointerId); } catch (err) { /* 이미 끝난 터치면 무시 */ }
    });
    boardEl.addEventListener('pointermove', (e) => {
      if (!touch) return;
      const dx = e.clientX - touch.x;
      const dy = e.clientY - touch.y;
      if (Math.hypot(dx, dy) < 18) return;
      const [r, c] = touch.rc;
      const to = Math.abs(dx) > Math.abs(dy) ? [r, c + Math.sign(dx)] : [r + Math.sign(dy), c];
      touch = null;
      trySwap([r, c], to);
    });
    boardEl.addEventListener('pointerup', () => {
      if (!touch) return;
      const rc = touch.rc;
      touch = null;
      if (selected && Math.abs(selected[0] - rc[0]) + Math.abs(selected[1] - rc[1]) === 1) return trySwap(selected, rc);
      selected = selected && selected[0] === rc[0] && selected[1] === rc[1] ? null : rc;
      render();
    });

    if (!hasMove()) startMatch3(); // 아주 드물게 처음부터 막히면 다시 만든다
    else render();
  }

  return { start, stop };
})();
