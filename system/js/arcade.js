// 게임 탭에 더한 게임들: 우왕이 잡기, 장애물 피하기, 기내 방송 따라하기, 환전소 계산.
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
    if (id === 'mole') startMole();
    if (id === 'runner') startRunner();
    if (id === 'simon') startSimon();
    if (id === 'exchange') startExchange();
  }

  // ---------- 우왕이 잡기: 구멍에서 나오는 우왕이를 톡! ----------
  function startMole() {
    const DURATION = 30;
    const holes = Array(9).fill(null);
    let score = 0;
    let hits = 0;
    let left = DURATION;

    board().innerHTML = `<div class="mole-grid">${holes.map((_, i) => `<button class="hole" data-hole="${i}" aria-label="구멍 ${i + 1}"></button>`).join('')}</div>`;
    const cells = [...board().querySelectorAll('[data-hole]')];
    const draw = () => hud([`점수 <b>${score}</b>`, `잡은 수 <b>${hits}</b>`, `⏱ <b>${Math.ceil(left)}</b>`]);

    function clear(i) {
      holes[i] = null;
      cells[i].textContent = '';
      cells[i].classList.remove('up');
    }

    function pop() {
      const free = holes.map((h, i) => (h ? -1 : i)).filter((i) => i >= 0);
      if (free.length) {
        const i = free[rand(free.length)];
        const roll = Math.random();
        const mole = { type: roll < 0.12 ? 'star' : roll < 0.32 ? 'bad' : 'good' };
        holes[i] = mole;
        cells[i].textContent = { good: '🐻', star: '🌟', bad: '⚡' }[mole.type];
        cells[i].classList.add('up');
        const stay = Math.max(550, 1100 - (DURATION - left) * 18);
        later(() => { if (holes[i] === mole) clear(i); }, stay);
      }
      later(pop, Math.max(380, 800 - (DURATION - left) * 14));
    }

    cells.forEach((cell, i) => cell.addEventListener('pointerdown', () => {
      const mole = holes[i];
      if (!mole) return;
      if (mole.type === 'bad') {
        score = Math.max(0, score - 20);
        Sound.sfx('bad');
        cell.classList.add('miss');
      } else {
        score += mole.type === 'star' ? 30 : 10;
        hits++;
        Sound.sfx('coin');
        cell.classList.add('hit');
      }
      later(() => cell.classList.remove('hit', 'miss'), 250);
      clear(i);
      draw();
    }));

    every(() => {
      left -= 0.1;
      draw();
      if (left <= 0) end(score, `우왕이를 ${hits}번 잡았어요`);
    }, 100);
    draw();
    later(pop, 400);
  }

  // ---------- 장애물 피하기: 계속 달리는 우왕이가 선인장을 뛰어넘는다 ----------
  // 탭·클릭·스페이스·↑로 점프, 공중에서 한 번 더 누르면 2단 점프.
  function startRunner() {
    const H = 360;            // 캔버스 높이 (CSS 픽셀)
    const GROUND = H - 48;    // 땅의 y
    const GRAVITY = 2300;
    const JUMP = 800;
    const DOUBLE_JUMP = 680;
    const CACTI = [
      { w: 20, h: 38 },               // 작은 선인장
      { w: 24, h: 58 },               // 큰 선인장
      { w: 48, h: 38, double: true }, // 작은 선인장 두 개
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

    const player = { x: 72, y: GROUND, vy: 0, r: 22, jumps: 0 }; // y는 발끝
    let obstacles = [];
    let stars = [];
    let popups = [];
    let started = false;
    let time = 0;
    let speed = 280;
    let traveled = 0;
    let nextGap = 420;
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

    function spawn() {
      const pool = time < 8 ? CACTI.slice(0, 2) : CACTI;
      const c = pool[rand(pool.length)];
      const x = W + 20;
      obstacles.push({ ...c, x });
      // 가끔 선인장 위에 별 3개를 띄운다 (점프하면서 먹는 자리)
      if (Math.random() < 0.5) {
        [-36, c.w / 2, c.w + 36].forEach((off, i) => {
          stars.push({ x: x + off, y: GROUND - c.h - (i === 1 ? 70 : 45) });
        });
      }
    }

    function hit(obstacle) {
      const r = player.r;
      const left = player.x - r * 0.7;
      const right = player.x + r * 0.7;
      const top = player.y - r * 1.7;
      const pad = 4; // 살짝 스친 건 봐준다
      return right - pad > obstacle.x && left + pad < obstacle.x + obstacle.w && player.y - pad > GROUND - obstacle.h && top < GROUND;
    }

    function update(dt) {
      if (!started) return;
      time += dt;
      speed = Math.min(640, 280 + time * 9);
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
        spawn();
        nextGap = speed * (0.75 + Math.random() * 0.9) + 140;
      }

      obstacles.forEach((o) => { o.x -= dx; });
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
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#bfe9ff');
      sky.addColorStop(1, '#fff3d6');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      // 멀리 있는 구름과 언덕은 천천히 지나간다
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      for (let i = 0; i < 4; i++) {
        const cx = ((i * 170 - traveled * 0.15) % (W + 160) + W + 160) % (W + 160) - 80;
        const cy = 50 + (i % 2) * 40;
        ctx.beginPath(); ctx.ellipse(cx, cy, 34, 13, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(cx + 20, cy - 8, 20, 12, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = '#f2d9a8';
      for (let i = 0; i < 4; i++) {
        const hx = ((i * 220 - traveled * 0.35) % (W + 260) + W + 260) % (W + 260) - 130;
        ctx.beginPath(); ctx.ellipse(hx, GROUND, 120, 60 + (i % 2) * 25, 0, Math.PI, 0); ctx.fill();
      }

      // 땅
      ctx.fillStyle = '#e0b878';
      ctx.fillRect(0, GROUND, W, H - GROUND);
      ctx.fillStyle = '#c99c5a';
      ctx.fillRect(0, GROUND, W, 4);
      for (let gx = -(traveled % 40); gx < W; gx += 40) ctx.fillRect(gx, GROUND + 16, 14, 3);

      obstacles.forEach((o) => {
        if (o.double) {
          drawCactus(o.x, 20, o.h);
          drawCactus(o.x + o.w - 20, 20, o.h - 6);
        } else {
          drawCactus(o.x, o.w, o.h);
        }
      });

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '22px sans-serif';
      stars.forEach((s) => ctx.fillText('⭐', s.x, s.y));

      drawPlayer();

      ctx.font = 'bold 18px sans-serif';
      ctx.fillStyle = '#3b2a1a';
      popups.forEach((p) => {
        ctx.globalAlpha = Math.max(0, p.life / 0.8);
        ctx.fillText(p.text, p.x, p.y);
      });
      ctx.globalAlpha = 1;

      if (!started) {
        ctx.fillStyle = 'rgba(59,42,26,.55)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 22px sans-serif';
        ctx.fillText('화면을 누르면 출발! 🏃', W / 2, H / 2 - 30);
        ctx.font = '15px sans-serif';
        ctx.fillText('탭·스페이스로 점프, 한 번 더 누르면 2단 점프', W / 2, H / 2 + 6);
        ctx.fillText('🌵 선인장은 피하고 ⭐ 별은 모아요', W / 2, H / 2 + 30);
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

  // ---------- 기내 방송 따라하기: 켜진 순서대로 누르기 ----------
  const PADS = [
    { emoji: '✈️', color: '#ff8a3d' },
    { emoji: '🧳', color: '#4fa3ff' },
    { emoji: '🎫', color: '#5cb85c' },
    { emoji: '🌍', color: '#b06cff' },
  ];

  function startSimon() {
    const seq = [];
    let input = 0;
    let locked = true;
    let score = 0;

    board().innerHTML = `
      <p class="arcade-msg" id="a-msg"></p>
      <div class="pad-grid">${PADS.map((p, i) => `<button class="pad" data-pad="${i}" style="--c:${p.color}">${p.emoji}</button>`).join('')}</div>`;
    const pads = [...board().querySelectorAll('[data-pad]')];
    const msg = (text) => { $('#a-msg').textContent = text; };
    const draw = () => hud([`${seq.length}단계`, `점수 <b>${score}</b>`]);

    function flash(i, ms) {
      pads[i].classList.add('lit');
      Sound.sfx('beep');
      later(() => pads[i].classList.remove('lit'), ms);
    }

    function nextRound() {
      seq.push(rand(PADS.length));
      input = 0;
      locked = true;
      draw();
      msg('잘 보세요 👀');
      const gap = Math.max(380, 700 - seq.length * 30);
      seq.forEach((p, k) => later(() => flash(p, gap * 0.6), 600 + k * gap));
      later(() => {
        locked = false;
        msg('같은 순서로 눌러요!');
      }, 600 + seq.length * gap);
    }

    pads.forEach((pad, i) => pad.addEventListener('click', () => {
      if (locked) return;
      flash(i, 200);
      if (i !== seq[input]) {
        locked = true;
        Sound.sfx('bad');
        msg('앗, 순서가 달라요!');
        later(() => end(score, `${seq.length - 1}단계까지 성공`), 900);
        return;
      }
      input++;
      if (input === seq.length) {
        locked = true;
        score += 20;
        Sound.sfx('coin');
        msg('정답! 🎉');
        draw();
        later(nextRound, 800);
      }
    }));

    nextRound();
  }

  // ---------- 환전소 계산: 30초 동안 계산 문제 ----------
  function startExchange() {
    const DURATION = 30;
    let left = DURATION;
    let score = 0;
    let correct = 0;
    let q = null;

    board().innerHTML = `
      <div class="card exchange">
        <p class="exchange-q" id="a-q"></p>
        <div class="exchange-options" id="a-options"></div>
      </div>`;
    const draw = () => hud([`점수 <b>${score}</b>`, `정답 <b>${correct}</b>`, `⏱ <b>${Math.ceil(left)}</b>`]);

    function makeQuestion() {
      const max = 9 + correct * 3;
      const op = ['+', '-', '×'][rand(correct < 3 ? 2 : 3)];
      let a = 1 + rand(max);
      let b = 1 + rand(max);
      if (op === '×') { a = 2 + rand(8); b = 2 + rand(Math.min(9, 3 + correct)); }
      if (op === '-' && b > a) [a, b] = [b, a];
      const answer = op === '+' ? a + b : op === '-' ? a - b : a * b;
      const options = new Set([answer]);
      while (options.size < 4) {
        const off = (1 + rand(op === '×' ? 10 : 5)) * (Math.random() < 0.5 ? -1 : 1);
        if (answer + off >= 0) options.add(answer + off);
      }
      return { text: `🪙 ${a} ${op} ${b} = ?`, answer, options: shuffle([...options]) };
    }

    function ask() {
      q = makeQuestion();
      $('#a-q').textContent = q.text;
      $('#a-options').innerHTML = q.options.map((o) => `<button data-answer="${o}">${o}</button>`).join('');
    }

    $('#a-options').addEventListener('click', (e) => {
      const b = e.target.closest('[data-answer]');
      if (!b) return;
      if (Number(b.dataset.answer) === q.answer) {
        score += 10;
        correct++;
        Sound.sfx('coin');
      } else {
        score = Math.max(0, score - 5);
        Sound.sfx('bad');
      }
      draw();
      ask();
    });

    every(() => {
      left -= 0.1;
      draw();
      if (left <= 0) end(score, `${correct}문제를 맞혔어요`);
    }, 100);
    draw();
    ask();
  }

  return { start, stop };
})();
