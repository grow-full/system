// 우왕이 캐릭터와 알.
// 알은 SVG, 태어난 뒤에는 실제 우왕이 PNG 시트(assets/uwang-*.png)를 쓴다. (MASCOT_SVG는 예전 임시 그림)
// 상태는 감싸는 요소의 data-* 속성으로 CSS에서 바꾼다:
//   data-stage(egg/baby/child/adult), data-form(어른 모습), data-mood(happy/normal/sad),
//   data-sleep, data-sick, data-look(left/right), data-face(동작 중 표정), data-anim(알 두드리기 tap), data-crack
// 몸 동작(이동·먹기·터치)은 아래 createUwangMotion이 맡는다.
// 성장 단계와 어른 모습별 장식은 acc-* 그룹으로 SVG 안에 모두 들어 있고, CSS가 골라서 보여 준다.
const MASCOT_SVG = `
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-label="우왕이">
  <ellipse cx="100" cy="188" rx="55" ry="8" fill="rgba(0,0,0,.12)"/>
  <g class="m-body">
    <g class="acc acc-gamer">
      <path d="M36 96 q0 -78 64 -78 q64 0 64 78" stroke="#4b4f8c" stroke-width="9" fill="none"/>
    </g>
    <circle class="m-skin" cx="50" cy="66" r="21" fill="#e8a54b"/>
    <circle cx="50" cy="66" r="11" fill="#f7d9a8"/>
    <circle class="m-skin" cx="150" cy="66" r="21" fill="#e8a54b"/>
    <circle cx="150" cy="66" r="11" fill="#f7d9a8"/>
    <ellipse class="m-skin" cx="100" cy="116" rx="74" ry="70" fill="#f5c16c"/>
    <ellipse cx="100" cy="140" rx="42" ry="32" fill="#fbe3b8"/>
    <g class="m-eyes">
      <g class="m-pupils">
        <ellipse cx="72" cy="104" rx="7" ry="9" fill="#3b2a1a"/>
        <ellipse cx="128" cy="104" rx="7" ry="9" fill="#3b2a1a"/>
        <circle cx="74" cy="100" r="2.5" fill="#fff"/>
        <circle cx="130" cy="100" r="2.5" fill="#fff"/>
      </g>
    </g>
    <g class="m-eyes-closed" stroke="#3b2a1a" stroke-width="4" fill="none" stroke-linecap="round">
      <path d="M64 104 q8 6 16 0"/>
      <path d="M120 104 q8 6 16 0"/>
    </g>
    <g class="m-eyes-x" stroke="#3b2a1a" stroke-width="4" stroke-linecap="round">
      <path d="M66 98 l12 12 M78 98 l-12 12"/>
      <path d="M122 98 l12 12 M134 98 l-12 12"/>
    </g>
    <ellipse cx="56" cy="126" rx="10" ry="6" fill="#f59a8b" opacity=".6"/>
    <ellipse cx="144" cy="126" rx="10" ry="6" fill="#f59a8b" opacity=".6"/>
    <ellipse cx="100" cy="124" rx="8" ry="5" fill="#7a4b2a"/>
    <g stroke="#7a4b2a" stroke-width="4" fill="none" stroke-linecap="round">
      <path class="m-mouth m-happy" d="M86 136 q14 14 28 0"/>
      <path class="m-mouth m-normal" d="M90 140 h20"/>
      <path class="m-mouth m-sad" d="M86 146 q14 -12 28 0"/>
    </g>
    <ellipse class="m-mouth m-open" cx="100" cy="142" rx="9" ry="7" fill="#7a4b2a"/>

    <!-- 어린이: 머리 위 새싹 -->
    <g class="acc acc-sprout" fill="#6cc070">
      <path d="M100 48 q-6 -20 -22 -20 q8 12 22 20 z"/>
      <path d="M100 48 q6 -18 20 -18 q-6 12 -20 18 z"/>
      <path d="M100 48 v-8" stroke="#4f9a54" stroke-width="3"/>
    </g>
    <!-- 반짝: 주변에 반짝이 -->
    <g class="acc acc-shiny" fill="#ffcf3f">
      <path d="M28 40 l4 10 l10 4 l-10 4 l-4 10 l-4 -10 l-10 -4 l10 -4 z"/>
      <path d="M170 30 l3 7 l7 3 l-7 3 l-3 7 l-3 -7 l-7 -3 l7 -3 z"/>
      <path d="M176 120 l3 7 l7 3 l-7 3 l-3 7 l-3 -7 l-7 -3 l7 -3 z"/>
    </g>
    <!-- 여행가: 탐험 모자 -->
    <g class="acc acc-traveler">
      <path d="M64 52 q2 -34 36 -34 q34 0 36 34 z" fill="#c08a4c"/>
      <rect x="66" y="42" width="68" height="9" fill="#6b4423"/>
      <ellipse cx="100" cy="52" rx="62" ry="10" fill="#a0703c"/>
    </g>
    <!-- 게이머: 헤드폰 귀 부분 -->
    <g class="acc acc-gamer" fill="#6c72d9">
      <rect x="20" y="82" width="22" height="38" rx="9"/>
      <rect x="158" y="82" width="22" height="38" rx="9"/>
    </g>
    <!-- 꾀죄죄: 헝클어진 털과 얼룩 -->
    <g class="acc acc-messy">
      <path d="M78 50 l6 -14 l6 12 l6 -14 l6 12 l6 -14 l6 14" stroke="#a87732" stroke-width="4" fill="none" stroke-linejoin="round"/>
      <ellipse cx="146" cy="150" rx="10" ry="6" fill="rgba(110,80,50,.35)"/>
      <ellipse cx="62" cy="160" rx="7" ry="4" fill="rgba(110,80,50,.35)"/>
      <ellipse cx="120" cy="76" rx="6" ry="4" fill="rgba(110,80,50,.3)"/>
    </g>
    <!-- 듬직: 진한 눈썹 -->
    <g class="acc acc-sturdy" stroke="#7a4b2a" stroke-width="5" stroke-linecap="round">
      <path d="M60 88 l22 -5"/>
      <path d="M118 83 l22 5"/>
    </g>
  </g>
</svg>`;

const EGG_SVG = `
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-label="우왕이 알">
  <ellipse cx="100" cy="188" rx="48" ry="7" fill="rgba(0,0,0,.12)"/>
  <g class="egg">
    <ellipse cx="100" cy="112" rx="58" ry="74" fill="#fff6e3" stroke="#eccb98" stroke-width="4"/>
    <circle cx="76" cy="90" r="10" fill="#ffd59e"/>
    <circle cx="124" cy="120" r="13" fill="#ffd59e"/>
    <circle cx="90" cy="150" r="8" fill="#ffd59e"/>
    <circle cx="128" cy="76" r="6" fill="#ffd59e"/>
    <path class="crack" d="M58 104 l14 10 l12 -12 l14 12 l12 -12 l14 12 l12 -10 l8 6" stroke="#b58a52" stroke-width="4" fill="none" stroke-linejoin="round"/>
  </g>
</svg>`;

// ---------- 우왕이 실제 이미지 ----------
// 시트의 칸은 등분 격자와 맞지 않는다(아래 줄일수록 위로 밀려 있고, 상태 시트 칸은 세로로 길다).
// 그래서 칸 % 대신, 측정한 각 그림의 발바닥(y)과 몸 중심(x)을 기준으로 잘라 보여 준다.
// 어떤 그림으로 바꿔도 발바닥은 상자 높이의 MOTION.feetY, 몸 중심은 가운데에 고정되고 비율도 찌그러지지 않는다.
const UWANG_SHEETS = {
  // 3x3: 열 = 마른/보통/(통통), 줄 = 피로 없음/졸림/심한 피로
  states: { url: 'assets/uwang-states.png', w: 1199, h: 1312, cx: [212, 598, 984], feet: [384, 783, 1206], ref: 363 },
  // 2x3: 열 = 마른/보통, 줄 = 씹기/웃음/놀람
  actions: { url: 'assets/uwang-actions.png', w: 1024, h: 1536, cx: [287, 730], feet: [484, 969, 1458], ref: 435 },
};
const UWANG_ART_HEIGHT = 0.83; // 보통 상태 그림의 키 (상자 크기 비율)
// angry: 화난 그림은 시트에 없어서, 볼을 부풀린 씹기 그림 위에 CSS로 화난 눈썹·💢·홍조를 겹친다 (.uwang-angry)
const UWANG_FACES = { chew: ['actions', 0], delight: ['actions', 1], surprise: ['actions', 2], pout: ['states', 1], angry: ['actions', 0] };

// ---------- 움직임 수치 (여기만 고치면 속도·진폭·시간이 바뀐다) ----------
// 길이 단위는 캐릭터 상자 크기 비율(성장 단계마다 자동으로 비례), 각도는 deg, 시간은 ms.
const MOTION = {
  feetY: 0.88,                 // 발바닥 높이 = 회전·눌림의 기준점
  mouth: { x: 0.5, y: 0.5 },   // 바른 자세의 입 위치 (씹는 표정 그림에서 측정)
  calmScale: 0.45,             // 아프거나 잘 때 진폭 배율
  // 걸음새: 매번 하나를 골라 걷는다. weight = 뽑힐 비율, snap < 1 이면 공중에 오래 떠 있고 > 1 이면 무겁게 걷는다.
  walk: { speed: 1.1, minMs: 700, maxMs: 2600, contactSquash: 0.035, easeMs: 240, edge: 8,
    gaits: {
      stroll: { weight: 3, speed: 1, stepMs: 290, bounce: 0.028, lean: 4, sway: 2.2, snap: 1 },     // 통통 걷기
      skip: { weight: 2, speed: 1.25, stepMs: 360, bounce: 0.06, lean: 3, sway: 1.2, snap: 0.6 },   // 깡충깡충 (기분 좋을 때 자주)
      waddle: { weight: 1.5, speed: 0.8, stepMs: 330, bounce: 0.016, lean: 2, sway: 4.5, snap: 1 }, // 뒤뚱뒤뚱
      trudge: { weight: 0, speed: 0.65, stepMs: 430, bounce: 0.01, lean: 1.5, sway: 2.6, snap: 1.6 }, // 터덜터덜 (피곤·아플 때만)
    } },
  land: { squash: 0.94, ms: 340 },
  // 대기 중 가끔 하는 짧은 동작 (매초 chance 확률). 같은 동작은 연달아 나오지 않는다.
  idle: { chance: 0.24, deg: 3.2, nodMs: 560, lookMs: 1500, look: 3, hop: 0.05, hopMs: 640, stretch: 0.045, stretchMs: 1200, wiggleMs: 860, wiggle: 3, droopMs: 1700, droop: 4 },
  joy: { jump: 0.06, double: [0.05, 0.03] },
  meal: { reactMs: 380, perk: 0.025, leanMs: 420, lean: 7, dip: 0.012, chews: 3, chewMs: 400, chewDip: 0.012, chewSquash: 0.965, happyMs: 820, happyRise: 0.02, happySway: 2.5 },
  snack: { hops: 2, hopMs: 240, hop: 0.045, reachMs: 220, lean: 5, dip: 0.01, chompMs: 110, crouchMs: 170, crouch: 0.9, takeoffMs: 90, riseMs: 200, jump: 0.16, fallMs: 170, landMs: 80, recoverMs: 260 },
  touch: { headLine: 0.6, headLean: 7, headInMs: 260, nuzzleMs: 520, headOutMs: 700, pokeJump: 0.08, minGapMs: 380, spamCount: 4, spamWindowMs: 1600 },
  // 화내기: 몸을 웅크려 부풀었다가 발을 두 번 쿵쿵 구르고, 고개를 휙 돌린 채 잠시 삐져 있다가 돌아온다
  angry: { puffMs: 260, puff: 0.04, stompMs: 230, stomps: 2, stomp: 0.035, shake: 2.2, turnMs: 260, turn: 6, sulkMs: 700, backMs: 420 },
  // 청소: 빗자루가 지나갈 때 깜짝 놀라 살짝 뛰어 넘고, 지나가면 몸을 털고 개운해한다
  clean: { sweepMs: 1200, watchLean: 3, hop: 0.07, hopMs: 420, shakeMs: 560, shake: 3.5, happyMs: 520 },
  // 약: 약을 보고 움찔 뒤로 → 입으로 꿀꺽 → 쓴맛에 부르르 → 다 나으면 기뻐한다 (기쁨 점프는 낫고 나서 pet.js가 joy로)
  medicine: { seeMs: 420, recoil: 4, flyMs: 520, gulpMs: 300, gulp: 0.02, shiverMs: 520, shiver: 2, settleMs: 300 },
};

function uwangReducedMotion() {
  return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

function uwangFrame(sheet, col, row) {
  const s = UWANG_SHEETS[sheet];
  const k = UWANG_ART_HEIGHT / s.ref;
  const v = (n) => `calc(var(--size) * ${n.toFixed(4)})`;
  return {
    backgroundImage: `url('${s.url}')`,
    backgroundSize: `${v(s.w * k)} ${v(s.h * k)}`,
    backgroundPosition: `${v(0.5 - s.cx[col] * k)} ${v(MOTION.feetY - s.feet[row] * k)}`,
  };
}

// 래퍼마다 transform을 하나씩 맡는다 (바깥 → 안쪽):
//   #walker(방 안 가로 위치) > .uwang-move(이동 바운스·기울기·도착 눌림) > .uwang-act(먹기·터치·까딱)
//   > .uwang-idle(무게중심 이동) > .uwang-breath(호흡) > 상태/표정 이미지 레이어와 의상
const UWANG_HTML = `<div class="uwang-art" aria-hidden="true"><div class="uwang-move"><div class="uwang-act"><div class="uwang-idle"><div class="uwang-breath">
 <div class="uwang-layer"></div><div class="uwang-layer"></div><div class="uwang-expression"></div>
 <div class="uwang-angry"><i class="brow brow-l"></i><i class="brow brow-r"></i><i class="flush flush-l"></i><i class="flush flush-r"></i><span class="vein">💢</span></div>
 <div class="uwang-sleep-mark">Zzz</div><span class="uwang-form-mark"></span><div class="outfit"></div>
</div></div></div></div></div>`;

function mountMascot(el, stage) {
  if (el._motion) el._motion.reset();
  el.innerHTML = stage === 'egg'
    ? `<div class="mascot-inner">${EGG_SVG}<div class="outfit"></div></div>`
    : `<div class="mascot-inner">${UWANG_HTML}</div>`;
  el.dataset.stage = stage;
  el.dataset.outfitKey = '';
  el.dataset.visualKey = '';
  el.dataset.face = '';
  el._visualLayer = undefined;
  updateUwangVisual(el);
}

function setMascot(el, props) {
  for (const key in props) el.dataset[key] = props[key];
}

// 지금 우왕이의 어른 모습과 입은 의상을 그린다
// 기본 옷(학사모, 뿔테 안경)은 산책 전용이라 walk가 true일 때만 보여 준다
function dressMascot(el, walk = false) {
  const pet = state.pet;
  updateUwangVisual(el);
  el.dataset.form = pet.stage === 'adult' ? pet.form : '';
  const worn = pet.stage === 'egg' ? [] : Object.entries(state.equipped).filter(([, id]) => id && OUTFITS[id] && (walk || !BASIC_OUTFITS[id]));   // 없어진 옷, 산책 밖의 기본 옷은 건너뛴다
  const key = worn.map(([slot, id]) => `${slot}:${id}`).join(',');
  if (el.dataset.outfitKey === key) return;
  el.dataset.outfitKey = key;
  el.dataset.head = worn.some(([slot]) => slot === 'head');
  const box = el.querySelector('.outfit');
  if (box) box.innerHTML = worn.map(([slot, id]) => `<span class="slot-${slot} o-${id}">${OUTFITS[id].art || OUTFITS[id].emoji}</span>`).join('');
}

// 잠깐 재생하는 CSS 동작: 알 두드리기(tap), 산책 화면 등의 joy/refuse/eat (style.css의 data-anim)
function playMascot(el, anim, ms) {
  const token = (el._animationToken || 0) + 1;
  el._animationToken = token;
  el.dataset.anim = '';
  void el.offsetWidth; // 같은 애니메이션을 다시 재생하기 위한 리플로우
  el.dataset.anim = anim;
  return new Promise((resolve) => setTimeout(() => {
    if (el._animationToken === token) el.dataset.anim = '';
    resolve();
  }, ms));
}

// 체형·피로(잘 때는 졸린 얼굴)에 맞는 대기 그림. 바뀔 때는 두 레이어로 크로스페이드한다.
function updateUwangVisual(el) {
  if (el.dataset.stage === 'egg' || !el.querySelector('.uwang-art')) return;
  const pet = state.pet;
  const col = pet.bodyShape === 'thin' ? 0 : 1;
  const row = el.dataset.sleep === 'true' ? 1 : ({ normal: 0, tired: 1, exhausted: 2 }[pet.fatigueStage] || 0);
  el.dataset.bodyShape = pet.bodyShape || 'normal';
  el.dataset.fatigueStage = pet.fatigueStage || 'normal';
  const key = `${col}:${row}`;
  if (el.dataset.visualKey !== key) {
    const layers = el.querySelectorAll('.uwang-layer');
    const next = el._visualLayer === 0 ? 1 : 0;
    Object.assign(layers[next].style, uwangFrame('states', col, row));
    layers[next].style.opacity = '1';
    layers[1 - next].style.opacity = '0';
    el._visualLayer = next;
    el.dataset.visualKey = key;
  }
  applyUwangFace(el);
  const marker = el.querySelector('.uwang-form-mark');
  if (marker) marker.textContent = pet.stage === 'adult' ?
    ({ shiny: '✨', traveler: '🧭', gamer: '🎧', messy: '💧', sturdy: '💪' }[pet.form] || '') : '';
}

// 동작 중 표정 하나를 유지한다. '' 이면 대기 그림으로 돌아간다.
function setUwangFace(el, face) {
  el.dataset.face = face || '';
  applyUwangFace(el);
}

function applyUwangFace(el) {
  const box = el.querySelector('.uwang-expression');
  const face = UWANG_FACES[el.dataset.face];
  if (!box || !face) return;
  const col = state.pet.bodyShape === 'thin' ? 0 : 1;
  const key = `${el.dataset.face}:${col}`;
  if (box.dataset.key === key) return;
  box.dataset.key = key;
  Object.assign(box.style, uwangFrame(face[0], col, face[1]));
}

// ---------- 우왕이 몸 동작 ----------
// 우선순위: 먹기·거절(4) > 터치·기쁨(3) > 이동(2) > 가끔 까딱(1). 높은 동작이 시작되면 낮은 동작은 바로 정리된다.
function createUwangMotion(el, walker, room) {
  const PRIORITY = { twitch: 1, walk: 2, touch: 3, joy: 3, feed: 4, refuse: 4 };
  let x = 0;
  let walkRun = null;
  let landAnim = null;
  let actRun = null;

  const part = (sel) => el.querySelector(sel);
  const size = () => el.offsetWidth || 150;
  const calm = () => el.dataset.sick === 'true' || el.dataset.sleep === 'true';
  const tf = (dy = 0, rot = 0, sx = 1, sy = 1) =>
    `translateY(${dy.toFixed(2)}px) rotate(${rot.toFixed(2)}deg) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`;

  // ----- 여러 동작 중 하나 고르기: [이름, 비율]. 바로 전에 한 동작은 피한다 -----
  const lastPick = {};
  function pick(group, options) {
    const live = options.filter(([, w]) => w > 0);
    const pool = live.length > 1 ? live.filter(([n]) => n !== lastPick[group]) : live;
    let r = Math.random() * pool.reduce((sum, [, w]) => sum + w, 0);
    let chosen = pool[pool.length - 1][0];
    for (const [n, w] of pool) { r -= w; if (r <= 0) { chosen = n; break; } }
    lastPick[group] = chosen;
    return chosen;
  }
  const tired = () => el.dataset.fatigueStage === 'tired' || el.dataset.fatigueStage === 'exhausted';
  const mood = () => el.dataset.mood || 'normal';

  // 걸음새: 아프거나 피곤하면 터덜터덜, 기분 좋으면 깡충깡충이 자주 나온다
  function pickGait() {
    const gaits = MOTION.walk.gaits;
    const name = calm() || tired() ? 'trudge' : pick('gait', Object.entries(gaits).map(([n, g]) =>
      [n, g.weight * (n === 'skip' ? ({ happy: 1.6, sad: 0.2 }[mood()] || 1) : 1)]));
    el.dataset.gait = name;
    return name;
  }

  // ----- 위치 -----
  function clampX(px) {
    const edge = MOTION.walk.edge;
    const max = Math.max(edge, room.clientWidth - size() - edge);
    return Math.min(max, Math.max(edge, px));
  }
  function setX(px) {
    x = px;
    walker.style.transform = `translateX(${x.toFixed(1)}px)`;
  }
  function place(px) {
    stopWalk();
    setX(clampX(px));
  }

  // ----- 이동: 진행 방향으로 기울고, 걸음마다 통통 튀고, 도착하면 한 번 눌렸다 돌아온다 -----
  function walkTo(target) {
    if (actRun && actRun.priority > PRIORITY.walk) return Promise.resolve(false);
    stopWalk();
    cancelAct();
    const from = x;
    const dist = clampX(target) - from;
    if (Math.abs(dist) < 2 || uwangReducedMotion()) {
      setX(from + dist);
      return Promise.resolve(true);
    }
    const cfg = MOTION.walk;
    const g = cfg.gaits[pickGait()];
    const s = size();
    const amp = calm() ? MOTION.calmScale : 1;
    const dur = Math.min(cfg.maxMs, Math.max(cfg.minMs, (Math.abs(dist) / (s * cfg.speed * g.speed)) * 1000));
    const dir = Math.sign(dist);
    const mover = part('.uwang-move');
    const t0 = performance.now();
    el.dataset.moving = dir < 0 ? 'left' : 'right';
    return new Promise((resolve) => {
      const run = { resolve, raf: 0 };
      walkRun = run;
      const frame = (now) => {
        if (walkRun !== run) return;
        const ms = Math.min(dur, now - t0);
        const t = ms / dur;
        setX(from + dist * (0.5 - Math.cos(Math.PI * t) / 2));
        const env = Math.max(0, Math.min(1, ms / cfg.easeMs, (dur - ms) / cfg.easeMs)); // 시작·끝을 부드럽게
        const phase = (Math.PI * ms) / g.stepMs;
        const lift = Math.pow(Math.abs(Math.sin(phase)), g.snap);
        const contact = Math.pow(1 - lift, 4) * cfg.contactSquash * env * amp;
        if (mover) {
          mover.style.transform = tf(-lift * g.bounce * s * env * amp,
            (dir * g.lean + Math.sin(phase) * g.sway) * env * amp, 1 + contact * 0.6, 1 - contact);
        }
        if (t < 1) run.raf = requestAnimationFrame(frame);
        else endWalk(true);
      };
      run.raf = requestAnimationFrame(frame);
    });
  }

  function endWalk(landed) {
    const run = walkRun;
    if (!run) return;
    walkRun = null;
    cancelAnimationFrame(run.raf);
    const mover = part('.uwang-move');
    if (mover) mover.style.transform = '';
    delete el.dataset.moving;
    delete el.dataset.gait;
    if (landed && mover && !uwangReducedMotion()) {
      const sq = (1 - MOTION.land.squash) * (calm() ? MOTION.calmScale : 1);
      landAnim = mover.animate([
        { transform: tf() },
        { transform: tf(0, 0, 1 + sq * 0.6, 1 - sq), offset: 0.35 },
        { transform: tf(0, 0, 1 - sq * 0.12, 1 + sq * 0.2), offset: 0.7 },
        { transform: tf() },
      ], { duration: MOTION.land.ms, easing: 'ease-out' });
    }
    run.resolve(landed);
  }

  // 멈추면 이동 동작도 즉시 정리한다 (지금 자리에서 바른 자세로)
  function stopWalk() {
    endWalk(false);
    if (landAnim) { landAnim.cancel(); landAnim = null; }
  }

  // ----- 동작 실행기: 타이머·애니메이션·임시 요소를 한곳에 모아 끝나거나 끊길 때 모두 정리한다 -----
  function beginAct(name) {
    const priority = PRIORITY[name];
    if (actRun && actRun.priority > priority) return null;
    if (priority <= PRIORITY.walk && walkRun) return null;
    cancelAct();
    if (priority > PRIORITY.walk) stopWalk();
    actRun = { name, priority, live: true, started: performance.now(), anims: [], timers: [], waiters: [], temps: [] };
    el.dataset.motion = name;
    return actRun;
  }

  function cancelAct() {
    const run = actRun;
    if (!run) return;
    actRun = null;
    run.live = false;
    run.anims.forEach((a) => a.cancel());
    run.timers.forEach(clearTimeout);
    run.temps.forEach((n) => n.remove());
    run.waiters.forEach((resolve) => resolve());
    setUwangFace(el, '');
    delete el.dataset.motion;
    delete el.dataset.idle;
  }

  function finish(run) {
    const ok = run.live;
    if (actRun === run) cancelAct();
    return ok;
  }

  function wait(run, ms) {
    return new Promise((resolve) => {
      run.waiters.push(resolve);
      run.timers.push(setTimeout(resolve, ms));
    });
  }
  function at(run, ms, fn) {
    run.timers.push(setTimeout(() => { if (run.live) fn(); }, ms));
  }

  // steps: [ms, dy(상자 비율), 회전, scaleX, scaleY, 다음 구간 easing]
  function body(run, steps) {
    const total = steps[steps.length - 1][0];
    const target = part('.uwang-act');
    if (!target || uwangReducedMotion()) return total;
    const s = size();
    const frames = steps.map(([ms, dy = 0, rot = 0, sx = 1, sy = 1, easing = 'ease-in-out']) =>
      ({ offset: ms / total, transform: tf(dy * s, rot, sx, sy), easing }));
    run.anims.push(target.animate(frames, { duration: total, fill: 'none' }));
    return total;
  }

  // 회전·눌림 뒤의 입 위치 (발바닥 기준으로 돌린다)
  function mouthAt(rot = 0, dy = 0, sy = 1) {
    const s = size();
    const r = (MOTION.feetY - MOTION.mouth.y) * s * sy;
    const a = (rot * Math.PI) / 180;
    return [MOTION.mouth.x * s + r * Math.sin(a), MOTION.feetY * s - r * Math.cos(a) + dy * s];
  }

  // 음식은 몸과 따로 움직인다 (.mascot-inner 좌표, 캐릭터 크기에 비례)
  function food(run, emoji, cls, steps, rest) {
    const inner = part('.mascot-inner');
    if (!inner) return;
    const n = document.createElement('span');
    n.className = `uwang-food ${cls}`;
    n.textContent = emoji;
    n.setAttribute('aria-hidden', 'true');
    inner.appendChild(n);
    run.temps.push(n);
    const total = steps[steps.length - 1][0];
    const frame = ([ms, p, scale = 1, opacity = 1, easing = 'ease-in-out']) => ({
      offset: ms / total, easing, opacity,
      transform: `translate(${p[0].toFixed(1)}px, ${p[1].toFixed(1)}px) translate(-50%, -50%) scale(${scale})`,
    });
    let frames = steps.map(frame);
    if (uwangReducedMotion()) {
      // 날아가지 않고 제자리(rest)에서 나타났다가 사라진다
      const still = frame([0, rest]).transform;
      frames = frames.map((f) => ({ ...f, transform: still }));
    }
    run.anims.push(n.animate(frames, { duration: total, fill: 'forwards' }));
  }

  const foodSide = () => (x + size() / 2 > room.clientWidth / 2 ? -1 : 1);

  // ----- 밥: 반응 → 숙이기 → 두세 번 씹으며 들썩 → 만족 -----
  async function meal(run, hooks) {
    const m = MOTION.meal;
    const k = calm() ? MOTION.calmScale : 1;
    const side = foodSide();
    const lean = side * m.lean * k;
    const s = size();
    const tLean = m.reactMs + m.leanMs;
    const tChew = tLean + m.chews * m.chewMs;
    const tEnd = tChew + m.happyMs;
    const sq = (1 - m.chewSquash) * k;

    const steps = [[0], [m.reactMs * 0.5, -m.perk * k, 0, 0.99, 1 + 0.03 * k], [m.reactMs], [tLean, m.dip, lean]];
    for (let i = 0; i < m.chews; i++) {
      const c = tLean + i * m.chewMs;
      steps.push([c + m.chewMs * 0.4, m.dip + m.chewDip * k, lean, 1 + sq * 0.6, 1 - sq]);
      steps.push([c + m.chewMs, m.dip, lean]);
    }
    steps.push([tChew + m.happyMs * 0.35, -m.happyRise * k, -side * m.happySway * k, 0.99, 1.02],
      [tChew + m.happyMs * 0.7, 0, side * m.happySway * 0.5 * k], [tEnd]);
    body(run, steps);

    const bowl = [s * (0.5 + side * 0.36), s * 0.84];
    const lift = [bowl[0], s * 0.74];
    const mouth = mouthAt(lean, m.dip);
    food(run, '🍚', 'food-bowl', [[0, bowl, 0.6, 0], [150, bowl, 1, 1], [tChew, bowl, 1, 1], [tChew + 260, bowl, 0.8, 0], [tEnd, bowl, 0.8, 0]], bowl);
    const bite = [[0, lift, 0.3, 0], [150, lift, 1.1, 1], [m.reactMs, lift, 1, 1], [tLean, mouth, 0.9, 1]];
    for (let i = 0; i < m.chews; i++) {
      const left = 1 - (i + 1) / m.chews;
      bite.push([tLean + i * m.chewMs + m.chewMs * 0.4, mouth, 0.9 * left, left ? 1 : 0]);
    }
    bite.push([tEnd, mouth, 0, 0]);
    food(run, '🍙', 'food-bite', bite, mouth);

    setUwangFace(el, 'surprise');
    at(run, m.reactMs, () => setUwangFace(el, 'chew'));
    for (let i = 0; i < m.chews; i++) at(run, tLean + i * m.chewMs + m.chewMs * 0.4, () => hooks.onBite && hooks.onBite());
    at(run, tChew, () => { setUwangFace(el, 'delight'); if (hooks.onHappy) hooks.onHappy(); });
    await wait(run, tEnd);
    return finish(run);
  }

  // ----- 간식: 기대 바운스 → 한입 → 몸 낮추기 → 기쁜 점프 → 착지 반동 (아프면 점프 대신 끄덕) -----
  async function snack(run, hooks) {
    const n = MOTION.snack;
    const lively = !calm();
    const k = lively ? 1 : MOTION.calmScale;
    const side = foodSide();
    const lean = side * n.lean * k;
    const s = size();

    const steps = [[0]];
    let t = 0;
    for (let i = 0; i < n.hops; i++) {
      steps.push([t + n.hopMs * 0.3, 0, 0, 1 + 0.04 * k, 1 - 0.06 * k], [t + n.hopMs * 0.65, -n.hop * k, 0, 0.98, 1.03]);
      t += n.hopMs;
      steps.push([t]);
    }
    const tHop = t;
    const tBite = tHop + n.reachMs;
    const tChomp = tBite + n.chompMs;
    steps.push([tBite, n.dip, lean], [tChomp, n.dip, lean * 0.5, 1.03, 0.96]);
    let tHappy = tChomp;
    let tEnd;
    if (lively) {
      const tCrouch = tChomp + n.crouchMs;
      const tTake = tCrouch + n.takeoffMs;
      const tApex = tTake + n.riseMs;
      const tFall = tApex + n.fallMs;
      const tLand = tFall + n.landMs;
      tEnd = tLand + n.recoverMs;
      steps.push(
        [tCrouch, 0.005, 0, 1 + (1 - n.crouch) * 0.6, n.crouch, 'ease-out'],
        [tTake, -0.02, 0, 0.96, 1.06, 'cubic-bezier(.15,.7,.35,1)'],
        [tApex, -n.jump, 0, 1, 1, 'cubic-bezier(.6,0,.85,.4)'],
        [tFall, -0.02, 0, 0.98, 1.04, 'ease-in'],
        [tLand, 0, 0, 1.07, 0.9, 'ease-out'],
        [tLand + n.recoverMs * 0.55, 0, 0, 0.985, 1.02],
        [tEnd]);
      tHappy = tTake;
    } else {
      tEnd = tChomp + 650;
      steps.push([tChomp + 280, 0.01, 0, 1.01, 0.985], [tEnd]);
    }
    body(run, steps);

    const start = [s * (0.5 + side * 0.38), s * 0.3];
    const mouth = mouthAt(lean, n.dip);
    food(run, '🍰', 'food-snack', [[0, start, 0.4, 0], [140, start, 1.1, 1], [tHop, start, 1, 1],
      [tBite, mouth, 0.85, 1], [tBite + 50, mouth, 0.5, 1], [tChomp, mouth, 0, 0], [tEnd, mouth, 0, 0]], mouth);

    setUwangFace(el, 'surprise');
    at(run, tHop, () => setUwangFace(el, 'chew'));
    at(run, tBite, () => hooks.onBite && hooks.onBite());
    at(run, tChomp, () => setUwangFace(el, 'delight'));
    at(run, tHappy, () => hooks.onHappy && hooks.onHappy());
    await wait(run, tEnd);
    return finish(run);
  }

  function feed(kind, hooks = {}) {
    const run = beginAct('feed');
    if (!run) return Promise.resolve(false);
    return kind === 'snack' ? snack(run, hooks) : meal(run, hooks);
  }

  // ----- 약: 약을 보고 움찔 → 입으로 꿀꺽 → 쓴맛에 부르르 → 진정 -----
  function medicine(hooks = {}) {
    const run = beginAct('feed');
    if (!run) return Promise.resolve(false);
    const m = MOTION.medicine;
    const side = foodSide();
    const s = size();
    const tSee = m.seeMs;
    const tGulp = tSee + m.flyMs;
    const tSwallow = tGulp + m.gulpMs * 0.4;
    const tShiver = tGulp + m.gulpMs;
    const tEnd = tShiver + m.shiverMs + m.settleMs;
    const steps = [[0, 0, 0, 1, 1, 'ease-out'], [tSee * 0.5, -0.006, -side * m.recoil, 0.99, 1.015], [tSee, -0.004, -side * m.recoil * 0.8],
      [tGulp, 0.004, side * 1.5, 1, 1, 'ease-in'], [tSwallow, m.gulp, 0, 1.03, 0.96, 'ease-out'], [tShiver, -0.006, 0, 0.99, 1.015]];
    const shakes = Math.max(2, Math.round(m.shiverMs / 65));
    for (let i = 1; i <= shakes; i++) {
      const fade = 1 - i / (shakes + 1);
      steps.push([tShiver + (m.shiverMs * i) / shakes, 0.002, (i % 2 ? 1 : -1) * m.shiver * fade, 1.01, 0.99]);
    }
    steps.push([tEnd]);
    body(run, steps);
    const start = [s * (0.5 + side * 0.42), s * 0.42];
    const mouth = mouthAt(side * 1.5, 0.004);
    food(run, '💊', 'food-pill', [[0, start, 0.4, 0], [160, start, 1.1, 1], [tSee, start, 1, 1],
      [tGulp, mouth, 0.7, 1, 'ease-in'], [tSwallow, mouth, 0, 0], [tEnd, mouth, 0, 0]], mouth);
    setUwangFace(el, 'surprise');
    at(run, tSee + m.flyMs * 0.6, () => setUwangFace(el, 'chew'));
    at(run, tSwallow, () => hooks.onSwallow && hooks.onSwallow());
    return wait(run, tEnd).then(() => finish(run));
  }

  // ----- 청소: 빗자루가 오른쪽에서 왼쪽으로 지나간다(fx-wipe). 지켜보다 지나갈 때 살짝 뛰어 넘고, 몸을 털고 개운해한다 -----
  function clean() {
    const run = beginAct('feed');
    if (!run) return Promise.resolve(false);
    const c = MOTION.clean;
    const s = size();
    const W = room.clientWidth || s * 3;
    const center = x + s / 2;
    const lively = !calm();
    const k = lively ? 1 : MOTION.calmScale;
    // 빗자루 가운데가 우왕이 가운데를 지나는 시각 (style.css의 .fx-wipe: 폭 60px, right -60 → 100%+60)
    const tPass = Math.max(0, Math.min(c.sweepMs, ((W + 30 - center) / (W + 120)) * c.sweepMs));
    const tCrouch = Math.max(160, tPass - c.hopMs * 0.45);
    const tLand = tCrouch + c.hopMs * 0.75;
    const tShake = tCrouch + c.hopMs;
    const tHappy = tShake + c.shakeMs;
    const tEnd = tHappy + c.happyMs;
    const up = 'cubic-bezier(.15,.7,.35,1)';
    const down = 'cubic-bezier(.6,0,.85,.4)';
    const steps = [[0, 0, 0, 1, 1, 'ease-out']];
    if (tCrouch > 260) steps.push([Math.min(320, tCrouch * 0.5), 0, c.watchLean * k]); // 빗자루 쪽을 본다
    if (lively) {
      steps.push([tCrouch, 0.005, 0, 1.05, 0.9, up], [tCrouch + c.hopMs * 0.4, -c.hop, -2, 0.98, 1.04, down],
        [tLand, 0, 0, 1.05, 0.93, 'ease-out'], [tShake, 0, 0, 1, 1]);
    } else {
      steps.push([tCrouch, 0.003, -c.watchLean * k, 1.01, 0.99], [tShake, 0, 0]); // 아플 때는 뛰지 않고 비켜서기만
    }
    const n = 6;
    for (let i = 1; i <= n; i++) steps.push([tShake + (c.shakeMs * i) / n, 0, (i % 2 ? 1 : -1) * c.shake * k * (1 - i / (n + 1)), 1.01, 0.99]);
    steps.push([tHappy + c.happyMs * 0.4, -0.012 * k, 0, 0.99, 1.02], [tEnd]);
    body(run, steps);
    setUwangFace(el, 'surprise');
    at(run, tShake, () => setUwangFace(el, 'delight'));
    return wait(run, tEnd).then(() => finish(run));
  }

  // ----- 화내기: 부풀었다가 발을 쿵쿵 → 손 반대쪽으로 고개를 휙 → 잠시 삐져 있다가 돌아온다 -----
  // side: 화나게 한 쪽(손 방향). 표정은 화난 얼굴 하나를 유지한다.
  function angrySteps(side) {
    const a = MOTION.angry;
    const k = calm() ? MOTION.calmScale : 1;
    const steps = [[0, 0, 0, 1, 1, 'ease-out'], [a.puffMs, 0.006, 0, 1 + a.puff * k, 1 - a.puff * 1.2 * k]];
    let t = a.puffMs;
    for (let i = 0; i < a.stomps; i++) {
      const d = i % 2 ? -1 : 1;
      steps.push([t + a.stompMs * 0.45, -a.stomp * k, d * a.shake * k, 0.99, 1.02, 'cubic-bezier(.6,0,.85,.4)'],
        [t + a.stompMs, 0, -d * a.shake * 0.4 * k, 1 + a.puff * 0.8 * k, 1 - a.puff * k, 'ease-out']);
      t += a.stompMs;
    }
    const tTurn = t + a.turnMs;
    const tSulk = tTurn + a.sulkMs;
    const turn = -side * a.turn * k;
    steps.push([tTurn, 0, turn, 1.01, 0.99, 'ease-in-out'], [tTurn + a.sulkMs * 0.5, 0.004, turn * 0.85, 1.015, 0.985],
      [tSulk, 0, turn, 1.01, 0.99, 'cubic-bezier(.45,0,.3,1)'], [tSulk + a.backMs]);
    return { steps, faceOff: tSulk + a.backMs * 0.5 };
  }

  // 혼자 화내기 (예: 낮잠을 깨웠을 때). 터치로 화낼 때는 touch('angry')를 쓴다.
  function angry(side = Math.random() < 0.5 ? -1 : 1) {
    const run = beginAct('touch');
    if (!run) return Promise.resolve(false);
    run.kind = 'angry';
    const { steps, faceOff } = angrySteps(side);
    const ms = body(run, steps);
    setUwangFace(el, 'angry');
    at(run, faceOff, () => setUwangFace(el, ''));
    return wait(run, ms).then(() => finish(run));
  }

  // ----- 터치 -----
  // kind: head(쓰다듬기) / body(톡) / angry(연속 터치에 화내기) / comfort(아플 때)
  // 반응 중 짧은 간격의 터치는 무시해서 동작·효과가 쌓이지 않게 한다. 받아들이면 { ms, done } 을 돌려준다.
  function touch(kind, side = 1) {
    const c = MOTION.touch;
    if (actRun && actRun.name === 'touch') {
      if (actRun.kind === 'angry') return null; // 화내는 중에는 더 만져도 쌓이지 않는다
      if (kind !== 'angry' && performance.now() - actRun.started < c.minGapMs) return null;
    }
    const run = beginAct('touch');
    if (!run) return null;
    run.kind = kind;
    let ms;
    if (kind === 'head') {
      // 모두 손길 쪽으로 기운 뒤 천천히 돌아온다: 비비기 / 문지르기 / 끄덕끄덕
      const lean = side * c.headLean;
      const tIn = c.headInMs;
      const out = 'cubic-bezier(.45,0,.3,1)';
      const v = pick('head', [['nuzzle', 1], ['rub', 1], ['nod', 1]]);
      let tHold;
      let steps;
      if (v === 'nuzzle') {
        tHold = tIn + c.nuzzleMs;
        steps = [[tIn, 0.008, lean, 1.01, 0.99], [tIn + c.nuzzleMs * 0.3, 0.004, lean - side * 1.6],
          [tIn + c.nuzzleMs * 0.65, 0.008, lean]];
      } else if (v === 'rub') {
        tHold = tIn + 1000;
        steps = [[tIn, 0.008, lean, 1.01, 0.99], [tIn + 250, 0.005, lean * 0.55], [tIn + 500, 0.008, lean],
          [tIn + 750, 0.005, lean * 0.55]];
      } else {
        tHold = tIn + 720;
        steps = [[tIn, 0.008, lean], [tIn + 180, 0.017, lean + side * 1.5, 1.012, 0.982], [tIn + 360, 0.006, lean],
          [tIn + 540, 0.017, lean + side * 1.5, 1.012, 0.982]];
      }
      ms = body(run, [[0, 0, 0, 1, 1, 'ease-out'], ...steps, [tHold, 0.008, lean, 1.01, 0.99, out], [tHold + c.headOutMs]]);
      run.variant = v;
      setUwangFace(el, 'delight');
      at(run, tHold + c.headOutMs * 0.5, () => setUwangFace(el, ''));
    } else if (kind === 'body') {
      // 모두 짧게 움츠렸다 작게 뛰고 착지 후 복귀: 똑바로 / 손 반대쪽으로 피하며 / 두 번 콩콩
      const j = c.pokeJump;
      const crouch = [120, 0.004, 0, 1.05, 0.9, 'cubic-bezier(.15,.7,.35,1)'];
      const rise = 'cubic-bezier(.6,0,.85,.4)';
      const v = pick('body', [['pop', 1], ['dodge', 1], ['double', 1]]);
      let land = 470;
      if (v === 'pop') {
        ms = body(run, [[0, 0, 0, 1, 1, 'ease-out'], crouch, [310, -j, 0, 0.98, 1.04, rise],
          [470, 0, 0, 1.05, 0.93, 'ease-out'], [600, 0, 0, 0.99, 1.012], [740]]);
      } else if (v === 'dodge') {
        ms = body(run, [[0, 0, 0, 1, 1, 'ease-out'], [120, 0.004, side * 1.5, 1.05, 0.9, 'cubic-bezier(.15,.7,.35,1)'],
          [310, -j * 0.85, -side * 5, 0.98, 1.04, rise], [470, 0, -side * 2, 1.05, 0.93, 'ease-out'],
          [630, 0, side * 0.8, 0.99, 1.012], [820]]);
      } else {
        land = 390;
        ms = body(run, [[0, 0, 0, 1, 1, 'ease-out'], [110, 0.004, 0, 1.05, 0.9, 'cubic-bezier(.15,.7,.35,1)'],
          [260, -j * 0.7, 0, 0.98, 1.04, rise], [390, 0, 0, 1.04, 0.94, 'cubic-bezier(.15,.7,.35,1)'],
          [510, -j * 0.4, 0, 0.99, 1.02, rise], [620, 0, 0, 1.03, 0.95, 'ease-out'], [740, 0, 0, 0.995, 1.008], [860]]);
      }
      run.variant = v;
      setUwangFace(el, 'surprise');
      at(run, land, () => setUwangFace(el, ''));
    } else if (kind === 'angry') {
      const { steps, faceOff } = angrySteps(side);
      ms = body(run, steps);
      setUwangFace(el, 'angry');
      at(run, faceOff, () => setUwangFace(el, ''));
    } else {
      ms = body(run, [[0], [450, 0.004, side * 2.5, 1.01, 0.99], [1100]]);
    }
    return { ms, done: wait(run, ms).then(() => finish(run)) };
  }

  // 작은 기쁨 점프 (약 먹고 나음, 놀이 성공, 옷 입기). 아프거나 잘 때는 하지 않는다.
  function joy() {
    if (calm()) return Promise.resolve(false);
    const run = beginAct('joy');
    if (!run) return Promise.resolve(false);
    const J = MOTION.joy;
    const up = 'cubic-bezier(.15,.7,.35,1)';
    const down = 'cubic-bezier(.6,0,.85,.4)';
    const d = Math.random() < 0.5 ? -1 : 1;
    const v = pick('joy', [['jump', 1], ['double', 1], ['twist', 1]]);
    let steps;
    if (v === 'jump') {
      steps = [[0, 0, 0, 1, 1, 'ease-out'], [110, 0.004, 0, 1.05, 0.92, up], [300, -J.jump, 0, 0.98, 1.03, down],
        [440, 0, 0, 1.05, 0.93, 'ease-out'], [560, 0, 0, 0.99, 1.01], [660]];
    } else if (v === 'double') {
      const [h1, h2] = J.double;
      steps = [[0, 0, 0, 1, 1, 'ease-out'], [100, 0.004, 0, 1.05, 0.92, up], [250, -h1, -d * 2, 0.98, 1.03, down],
        [380, 0, 0, 1.04, 0.94, up], [520, -h2, d * 2, 0.99, 1.02, down], [640, 0, 0, 1.04, 0.94, 'ease-out'], [760, 0, 0, 0.995, 1.008], [860]];
    } else {
      // 좌우로 몸을 흔들다가 작게 뛴다
      steps = [[0], [120, 0, d * 3.5], [240, 0, -d * 3.5], [360, 0, d * 3], [460, 0.004, 0, 1.05, 0.92, up],
        [620, -J.jump * 0.7, 0, 0.98, 1.03, down], [750, 0, 0, 1.05, 0.93, 'ease-out'], [870, 0, 0, 0.99, 1.01], [960]];
    }
    const ms = body(run, steps);
    run.variant = v;
    setUwangFace(el, 'delight');
    return wait(run, ms).then(() => finish(run));
  }

  // 배불러서 고개를 젓는다
  function refuse() {
    const run = beginAct('refuse');
    if (!run) return Promise.resolve(false);
    const ms = body(run, [[0], [180, 0, -4], [400, 0, 4], [620, 0, -3.5], [840, 0, 3], [1060, 0, -1.5], [1250]]);
    setUwangFace(el, 'pout');
    return wait(run, ms).then(() => finish(run));
  }

  // 대기 중 가끔 하는 짧은 동작 (시작과 끝은 바른 자세, 표정은 지금 체형·피로 그림 그대로)
  //   까딱 / 들썩 / 두리번 / 기지개 / 몸 흔들기 / 제자리 콩 / 꾸벅 졸기
  // 아플 때는 작게 까딱·두리번만, 피곤하면 꾸벅 졸기가 자주, 기분 좋으면 콩·흔들기가 자주 나온다.
  function twitch() {
    if (el.dataset.sleep === 'true') return false;
    const run = beginAct('twitch');
    if (!run) return false;
    const c = MOTION.idle;
    const sick = el.dataset.sick === 'true';
    const k = sick ? MOTION.calmScale : 1;
    const d = Math.random() < 0.5 ? -1 : 1;
    const happy = mood() === 'happy';
    const sleepy = tired();
    const v = sick
      ? pick('idle', [['nod', 1], ['look', 1]])
      : pick('idle', [
        ['nod', 2], ['bob', 1.5], ['look', 1.5],
        ['stretch', sleepy ? 0.6 : 1], ['wiggle', sleepy ? 0 : happy ? 1.6 : 0.8],
        ['hop', sleepy ? 0 : happy ? 1.4 : 0.5], ['droop', sleepy ? 2.5 : 0],
      ]);
    let steps;
    if (v === 'nod') {
      const t = c.nodMs;
      steps = [[0], [t * 0.35, -0.006 * k, d * c.deg * k], [t * 0.7, 0, -d * c.deg * 0.25 * k], [t]];
    } else if (v === 'bob') {
      const t = c.nodMs;
      steps = [[0], [t * 0.3, 0.004, 0, 1.02, 0.97], [t * 0.6, -0.012, 0, 0.99, 1.015], [t]];
    } else if (v === 'look') {
      const t = c.lookMs; // 한쪽을 보고 잠시 멈췄다가 반대쪽, 다시 정면
      const a = c.look * k;
      steps = [[0], [t * 0.18, 0, d * a], [t * 0.4, 0, d * a], [t * 0.58, 0, -d * a], [t * 0.8, 0, -d * a], [t]];
    } else if (v === 'stretch') {
      const t = c.stretchMs; // 살짝 움츠렸다가 위로 쭉 늘이고, 툭 내려와 한 번 눌린다
      const s = c.stretch;
      steps = [[0], [t * 0.15, 0.004, 0, 1.02, 0.975], [t * 0.45, -0.008, 0, 1 - s * 0.5, 1 + s, 'ease-out'],
        [t * 0.62, -0.008, 0, 1 - s * 0.5, 1 + s, 'ease-in'], [t * 0.78, 0, 0, 1.025, 0.97], [t]];
    } else if (v === 'wiggle') {
      const t = c.wiggleMs;
      const a = c.wiggle;
      steps = [[0], [t * 0.15, 0, d * a, 1.01, 0.99], [t * 0.32, 0, -d * a], [t * 0.5, 0, d * a * 0.8, 1.01, 0.99],
        [t * 0.68, 0, -d * a * 0.6], [t * 0.85, 0, d * a * 0.2], [t]];
    } else if (v === 'hop') {
      const t = c.hopMs;
      steps = [[0, 0, 0, 1, 1, 'ease-out'], [t * 0.2, 0.004, 0, 1.04, 0.93, 'cubic-bezier(.15,.7,.35,1)'],
        [t * 0.45, -c.hop, 0, 0.985, 1.025, 'cubic-bezier(.6,0,.85,.4)'], [t * 0.68, 0, 0, 1.04, 0.94, 'ease-out'],
        [t * 0.84, 0, 0, 0.995, 1.008], [t]];
    } else {
      // 꾸벅: 천천히 한쪽으로 처지다가 퍼뜩 깨서 돌아온다
      const t = c.droopMs;
      steps = [[0], [t * 0.62, 0.012, d * c.droop, 1.015, 0.975, 'cubic-bezier(.2,.8,.3,1)'],
        [t * 0.74, -0.008, -d * 0.8, 0.99, 1.015], [t * 0.86, 0, d * 0.3], [t]];
    }
    const ms = body(run, steps);
    run.variant = v;
    el.dataset.idle = v;
    wait(run, ms).then(() => finish(run));
    return true;
  }

  // 모든 동작·타이머·임시 효과를 정리한다 (초기화, 성장해서 그림을 다시 그릴 때)
  function reset() {
    stopWalk();
    cancelAct();
    el.querySelectorAll('.uwang-food, .interaction-heart').forEach((n) => n.remove());
  }

  const api = {
    place, walkTo, stopWalk, feed, medicine, clean, angry, touch, joy, refuse, twitch, reset,
    x: () => x,
    walking: () => Boolean(walkRun),
    acting: () => Boolean(actRun && actRun.priority > PRIORITY.walk),
    idling: () => Boolean(actRun && actRun.name === 'twitch'),
  };
  el._motion = api;
  return api;
}
