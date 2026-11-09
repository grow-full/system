// 우왕이 키우기 (다마고치 방식).
// 알에서 태어나 배고픔·행복을 채워 주고, 똥을 치우고, 아프면 약을 주고, 밤에는 불을 꺼 준다.
// 규칙(시간이 지나면 줄어드는 수치 등)은 state.js에 있고, 여기서는 화면과 돌보기 동작을 다룬다.
const Pet = (() => {
  const PLAY_ROUNDS = 5;
  const PHRASES = ['오늘은 어디로 여행 갈까? ✈️', '방 안을 산책 중이에요', '콧노래가 나와요 ♪', '창밖 구경 중이에요 ☁️'];
  const HOLD_MS = 300;    // 이만큼 누르고 있으면 걷기 시작
  const WALK_SPEED = 140; // 길게 눌러 걸을 때 빠르기 (px/초)
  const GAZE_MS = 2000;   // 톡 누른 곳을 쳐다보는 시간
  const ANIM_MS = { joy: 600, tap: 400, refuse: 1500 };

  let room, walker, mascot, fx;
  let mountedStage = null;
  let busy = false;      // 먹기·청소 같은 동작이 진행 중
  let play = null;       // 놀아주기 진행 상태
  let talking = false;   // 말 걸기 판이 열려 있음
  let hold = null;       // 누르고 있는 상태 { dir, px, py, timer, raf, last, walking }
  let gazeTimer = 0;     // 톡 누른 곳을 쳐다보는 중이면 정면으로 돌아오기까지의 타이머
  let lastPoop = null;   // 지난번 화면을 그릴 때의 똥 개수
  let hatching = false;
  let eggTaps = 0;
  let x = 0;
  let ticks = 0;
  let speech = { text: '', until: 0 };

  function init() {
    room = $('#room');
    walker = $('#walker');
    mascot = $('#mascot');
    fx = $('#room-fx');
    document.querySelectorAll('[data-action]').forEach((b) => b.addEventListener('click', () => act(b.dataset.action)));
    document.querySelectorAll('[data-guess]').forEach((b) => b.addEventListener('click', () => guess(b.dataset.guess)));
    mascot.addEventListener('click', tapMascot);
    document.querySelectorAll('[data-talk]').forEach((b) => b.addEventListener('click', () => talk(b.dataset.talk)));
    $('#btn-talk-close').addEventListener('click', () => { talking = false; render(); });
    $('#talk-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = $('#talk-input');
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      talk(keyFor(text));
    });
    room.addEventListener('pointerdown', startHold);
    window.addEventListener('pointerup', releaseHold);
    window.addEventListener('pointercancel', endHold);
    room.addEventListener('pointerleave', endHold);
    room.addEventListener('contextmenu', (e) => e.preventDefault()); // 휴대폰에서 길게 누를 때 메뉴가 뜨지 않게
    $('#btn-away').addEventListener('click', () => show('travel'));
    $('#wardrobe').addEventListener('click', (e) => {
      const b = e.target.closest('[data-wear]');
      if (b) wear(b.dataset.wear);
    });
    render();
    renderCollections();
    moveTo(centerX(), true);
    setInterval(tick, 1000);
  }

  // ---------- 시간 흐름 ----------
  function tick() {
    const pet = state.pet;
    if (pet.stage === 'egg' && (eggTaps >= 5 || Date.now() - pet.bornAt >= HATCH_SECONDS * 1000)) hatchNow();
    if ($('#screen-pet').hidden) return;
    if (++ticks % 3 === 0) walk();
    render();
  }

  function hatchNow() {
    if (hatching) return;
    hatching = true;
    setMascot(mascot, { crack: true });
    playMascot(mascot, 'tap', 400);
    setTimeout(() => {
      hatch();
      eggTaps = 0;
      hatching = false;
      saveState();
      Sound.sfx('levelup');
      toast('우왕이가 태어났어요! 🐣 잘 돌봐 주세요');
      render();
      moveTo(centerX(), true);
    }, 1200);
  }

  function centerX() {
    return Math.max(0, (room.clientWidth - mascot.offsetWidth) / 2);
  }

  // instant: 처음 자리를 잡을 때처럼 걸어가는 애니메이션 없이 옮긴다
  function moveTo(px, instant = false) {
    x = px;
    if (instant) walker.style.transition = 'none';
    walker.style.transform = `translateX(${x}px)`;
    if (instant) {
      void walker.offsetWidth;
      walker.style.transition = '';
    }
  }

  // 우왕이가 갈 수 있는 가장 오른쪽 위치 (똥이 있으면 그만큼 덜 간다)
  function maxX() {
    return Math.max(10, room.clientWidth - mascot.offsetWidth - 10 - state.pet.poop * 34);
  }

  function walk() {
    if (busy || play || hold || gazeTimer || state.flight || state.pet.stage === 'egg' || isAsleep()) return;
    const next = 10 + Math.random() * (maxX() - 10);
    setMascot(mascot, { look: next < x ? 'left' : 'right' });
    moveTo(next);
    setTimeout(() => { if (!play && !hold && !gazeTimer) setMascot(mascot, { look: '' }); }, 1600);
  }

  // 혼자 걷던 중이면 지금 화면에 보이는 자리를 x로 삼는다
  function syncShownX() {
    const shown = getComputedStyle(walker).transform;
    if (shown && shown !== 'none') x = new DOMMatrix(shown).m41;
  }

  // ---------- 톡 누르면 쳐다보기 / 꾹 누르면 걷기 ----------
  function canMove() {
    return state.pet.stage !== 'egg' && !hatching && !busy && !play && !state.flight && !isAsleep();
  }

  // 방의 빈 곳을 누르면, 우왕이보다 오른쪽인지 왼쪽인지로 갈 방향을 정한다
  function startHold(e) {
    if (e.button > 0 || e.target.closest('#mascot, button')) return;
    endHold();
    if (!canMove()) return;
    const px = e.clientX - room.getBoundingClientRect().left;
    const dir = px > x + mascot.offsetWidth / 2 ? 'right' : 'left';
    hold = { dir, px: e.clientX, py: e.clientY, raf: 0, last: 0, walking: false, timer: setTimeout(beginHoldWalk, HOLD_MS) };
  }

  // 손을 뗐을 때 아직 걷기 전이면(짧게 톡 누름) 누른 곳을 쳐다본다
  function releaseHold() {
    if (!hold) return;
    const tapped = !hold.walking;
    const { px, py } = hold;
    endHold();
    if (tapped) gazeAt(px, py);
  }

  // 눈동자를 화면의 (clientX, clientY) 쪽으로 돌렸다가 GAZE_MS 뒤에 정면으로 돌아온다
  function gazeAt(clientX, clientY) {
    if (state.pet.sick || !canMove()) return; // 아플 때는 눈이 X 모양이라 눈동자가 없다
    const box = mascot.getBoundingClientRect();
    const dx = clientX - (box.left + box.width / 2);
    const dy = clientY - (box.top + box.height * 0.4); // 눈 높이
    const len = Math.hypot(dx, dy) || 1;
    // 도트라서 눈동자는 한 칸(6.25) 단위로만 움직인다
    mascot.style.setProperty('--gx', `${Math.round(dx / len) * 6.25}px`);
    mascot.style.setProperty('--gy', `${Math.round(dy / len) * 6.25}px`);
    setMascot(mascot, { look: 'point' });
    clearTimeout(gazeTimer);
    gazeTimer = setTimeout(stopGaze, GAZE_MS);
  }

  function stopGaze() {
    clearTimeout(gazeTimer);
    gazeTimer = 0;
    if (mascot.dataset.look === 'point') setMascot(mascot, { look: '' });
  }

  function beginHoldWalk() {
    if (!hold) return;
    if (!canMove()) return endHold();
    stopGaze();
    syncShownX();
    walker.style.transition = 'none';
    walker.style.transform = `translateX(${x}px)`;
    walker.dataset.walking = 'true';
    setMascot(mascot, { look: hold.dir });
    hold.walking = true;
    hold.raf = requestAnimationFrame(stepHold);
  }

  function stepHold(time) {
    if (!hold) return;
    if (!canMove()) return endHold();
    const dt = hold.last ? Math.min(0.05, (time - hold.last) / 1000) : 0;
    hold.last = time;
    const next = Math.max(10, Math.min(maxX(), x + (hold.dir === 'right' ? 1 : -1) * WALK_SPEED * dt));
    const atWall = next === x && dt > 0;
    x = next;
    walker.style.transform = `translateX(${x}px)`;
    walker.dataset.walking = atWall ? 'false' : 'true';
    hold.raf = requestAnimationFrame(stepHold);
  }

  function endHold() {
    if (!hold) return;
    clearTimeout(hold.timer);
    cancelAnimationFrame(hold.raf);
    if (hold.walking) {
      walker.dataset.walking = 'false';
      void walker.offsetWidth;
      walker.style.transition = '';
      if (!play) setMascot(mascot, { look: '' });
    }
    hold = null;
  }

  // ---------- 화면 ----------
  function mood() {
    const pet = state.pet;
    if (pet.sick || pet.hunger === 0 || pet.happy === 0) return 'sad';
    return pet.happy >= 3 ? 'happy' : 'normal';
  }

  function hearts(count) {
    let html = '';
    for (let i = 0; i < MAX_HEARTS; i++) html += `<span class="${i < count ? 'on' : 'off'}">${icon(i < count ? 'heart' : 'heartEmpty', 20)}</span>`;
    return html;
  }

  function say(text, ms = 2500) {
    speech = { text, until: Date.now() + ms };
    $('#speech').textContent = text;
  }

  function speechText() {
    const pet = state.pet;
    if (Date.now() < speech.until) return speech.text;
    if (pet.stage === 'egg') return '톡톡 눌러 보세요!';
    if (state.flight || isAsleep()) return '';
    const needs = petNeeds();
    if (needs.length) return needs[0];
    return PHRASES[Math.floor(Date.now() / 15000) % PHRASES.length];
  }

  function render() {
    const pet = state.pet;
    const away = Boolean(state.flight);
    const asleep = isAsleep();

    if (mountedStage !== pet.stage) {
      mountMascot(mascot, pet.stage);
      setMascot(mascot, { crack: false, look: '', anim: '' });
      mountedStage = pet.stage;
    }
    dressMascot(mascot);
    room.dataset.night = isNight();
    room.dataset.lights = pet.lightsOff && !away ? 'off' : 'on';
    room.dataset.asleep = asleep && !away;
    setMascot(mascot, { mood: (play && play.mood) || mood(), sleep: asleep, sick: pet.sick, dirty: pet.dirty && !away });
    walker.dataset.dirty = pet.dirty && !away && !asleep;

    // 보고 있는 동안 똥이 늘었으면 알려 준다
    if (lastPoop !== null && pet.poop > lastPoop && !away && !asleep) say('끙차! 💩', 2000);
    lastPoop = pet.poop;
    $('#poops').innerHTML = away ? '' : `<span>${icon('poop', 36)}</span>`.repeat(pet.poop);
    $('#room-badges').innerHTML = pet.sick && !away ? `<span title="아파요">${icon('sick', 32)}</span>` : '';
    $('#speech').textContent = speechText();

    $('#away').hidden = !away;
    if (away) {
      const f = state.flight;
      $('#away-text').textContent = `${josa(destById(f.destId).name, '으로', '로')} 여행 중이에요`;
      $('#away-time').textContent = formatClock(Math.max(0, Math.ceil((f.start + f.duration - Date.now()) / 1000)));
    }

    $('#h-hunger').innerHTML = hearts(pet.hunger);
    $('#h-happy').innerHTML = hearts(pet.happy);
    if (pet.stage === 'egg') {
      const left = Math.max(0, HATCH_SECONDS - Math.floor((Date.now() - pet.bornAt) / 1000));
      $('#pet-info').textContent = `알 · ${left}초 뒤에 태어나요`;
    } else {
      const next = nextGrowthLevel();
      $('#pet-info').textContent = `${stageLabel()} · ${ageDays() + 1}일째 · 몸무게 ${pet.weight}g · 돌봄 실수 ${pet.careMistakes}`
        + (next ? ` · Lv.${next}에 성장` : '');
    }

    $('#lights-label').textContent = pet.lightsOff ? '불 켜기' : '불 끄기';
    const locked = pet.stage === 'egg' || away || busy;
    document.querySelectorAll('[data-action]').forEach((b) => { b.disabled = locked; });
    if (talking && (pet.stage === 'egg' || away || asleep)) talking = false; // 자거나 여행을 떠나면 말 걸기 판을 닫는다
    $('#pet-actions').hidden = Boolean(play) || talking;
    $('#play-panel').hidden = !play;
    $('#talk-panel').hidden = !talking || Boolean(play);
  }

  // ---------- 돌보기 ----------
  function act(action) {
    const pet = state.pet;
    if (action === 'lights') return toggleLights();
    if (isAsleep()) {
      return toast(isNight() ? '밤이라 자고 있어요 🌙 아침 8시에 일어나요' : '낮잠 자는 중이에요. 불을 켜면 일어나요 💡');
    }
    if (action === 'meal') {
      if (pet.hunger >= MAX_HEARTS) return refuse();
      addHearts('hunger', 1);
      eatFood();
      pet.weight += 1;
      rewardExp(5);
      saveState();
      return eat('food');
    }
    if (action === 'snack') {
      if (state.coins < SNACK_COST) return toast(`코인이 부족해요 (간식 🪙${SNACK_COST}). 게임으로 모아 보세요!`);
      state.coins -= SNACK_COST;
      addHearts('happy', 1);
      eatFood();
      pet.weight += 2;
      rewardExp(3);
      saveState();
      return eat('snack');
    }
    if (action === 'play') {
      if (pet.sick) return toast('아파서 놀 수 없어요. 먼저 약을 주세요 💊');
      return startPlay();
    }
    if (action === 'clean') {
      if (!pet.poop) return toast('치울 게 없어요. 깨끗해요! ✨');
      return clean();
    }
    if (action === 'bath') {
      if (!pet.dirty) return toast('아직 깨끗해요! ✨');
      return bathe();
    }
    if (action === 'medicine') {
      if (!pet.sick) return toast('아프지 않아요! 약은 필요 없어요');
      return cure();
    }
    if (action === 'talk') {
      talking = true;
      return render();
    }
  }

  // ---------- 말 걸기 ----------
  // 고른 말과 지금 우왕이 상태에 맞는 대답과 동작. 수치는 바뀌지 않는다.
  function replyTo(key) {
    const pet = state.pet;
    const hour = new Date().getHours();
    if (key === 'hello') {
      if (pet.sick) return ['안녕… 몸이 좀 안 좋아요 🤒', 'tap'];
      if (hour < 12) return ['좋은 아침이에요! ☀️', 'joy'];
      if (hour < 18) return ['안녕하세요! 반가워요 👋', 'joy'];
      return ['안녕! 오늘 하루 어땠어요? 🌆', 'joy'];
    }
    if (key === 'love') {
      if (pet.sick) return ['저도요… 얼른 나을게요 🤒', 'tap'];
      if (pet.happy >= 3) return ['저도 사랑해요! 💕', 'joy'];
      return ['저도요! 그런데 조금 심심해요…', 'tap'];
    }
    if (key === 'hungry') {
      if (pet.hunger === 0) return ['너무 배고파요! 밥 주세요 🍙', 'tap'];
      if (pet.hunger === 1) return ['조금 배고파요… 🍙', 'tap'];
      if (pet.hunger >= MAX_HEARTS) return ['배불러요! 🙅', 'refuse'];
      return ['괜찮아요, 아직 든든해요 😋', 'joy'];
    }
    if (key === 'mood') {
      if (pet.sick) return ['아파요… 약이 필요해요 💊', 'tap'];
      if (pet.poop > 0) return ['방이 지저분해서 찝찝해요 💩', 'refuse'];
      if (pet.dirty) return ['몸이 찝찝해요… 씻고 싶어요 🛁', 'refuse'];
      if (pet.happy === 0) return ['너무 심심해요… 놀아 주세요 🎾', 'tap'];
      if (pet.happy >= MAX_HEARTS) return ['최고로 행복해요! 🥰', 'joy'];
      if (pet.happy >= 3) return ['기분 좋아요 😊', 'joy'];
      return ['그냥 그래요. 같이 놀래요?', 'tap'];
    }
    if (key === 'where') {
      const fresh = DESTINATIONS.filter((d) => !state.visited[d.id]);
      const pool = fresh.length ? fresh : DESTINATIONS;
      const d = pool[Math.floor(Math.random() * pool.length)];
      return [`${d.icon} ${d.name}에 ${fresh.length ? '가 보고' : '또 가고'} 싶어요!`, 'joy'];
    }
    if (key === 'name') return ['저는 우왕이에요! 잘 부탁해요 🐣', 'joy'];
    if (key === 'thanks') return ['헤헤, 천만에요 😊', 'joy'];
    if (key === 'praise') return ['부끄러워요 ☺️', 'joy'];
    if (key === 'mean') return ['힝… 😢', 'refuse'];
    if (key === 'unknown') return [UNKNOWN_REPLIES[Math.floor(Math.random() * UNKNOWN_REPLIES.length)], 'tap'];
    // 'night': 말을 걸 수 있는 건 깨어 있을 때뿐이라 늘 낮이다
    return ['아직 안 졸려요! 더 놀아요 😆', 'refuse'];
  }

  // 직접 입력한 말에 들어 있는 낱말로 어떤 대답을 할지 고른다 (위에 있는 것부터 먼저 확인)
  const TALK_WORDS = [
    ['night', ['잘자', '잘 자', '졸려', '졸리', '굿나잇']],
    ['hungry', ['배고', '배불', '밥', '먹', '간식']],
    ['love', ['사랑', '좋아해']],
    ['name', ['이름', '누구']],
    ['thanks', ['고마', '고맙', '감사', '땡큐']],
    ['praise', ['귀여', '귀엽', '예뻐', '예쁘', '이뻐', '멋져', '멋있', '최고']],
    ['mean', ['미워', '싫어', '바보', '멍청']],
    ['where', ['여행', '어디', '가고 싶', '가고싶']],
    ['mood', ['기분', '괜찮', '행복', '어때', '심심']],
    ['hello', ['안녕', '하이', '반가', 'hi', 'hello', '헬로']],
  ];
  const UNKNOWN_REPLIES = ['음… 무슨 말인지 잘 모르겠어요 🤔', '우왕! 신기한 말이에요 😮', '그게 뭐예요? 더 알려 주세요!', '헤헤, 잘 모르겠지만 좋아요 😊'];

  function keyFor(text) {
    const t = text.toLowerCase();
    const found = TALK_WORDS.find(([, words]) => words.some((w) => t.includes(w)));
    return found ? found[0] : 'unknown';
  }

  function talk(key) {
    if (!talking || busy) return;
    if (state.pet.stage === 'egg' || state.flight || isAsleep()) {
      talking = false;
      return render();
    }
    const [text, anim] = replyTo(key);
    endHold();
    say(text, 3000);
    Sound.sfx('beep');
    render();
    playMascot(mascot, anim, ANIM_MS[anim]);
  }

  function toggleLights() {
    const pet = state.pet;
    pet.lightsOff = !pet.lightsOff;
    pet.timers.nap = 0;
    saveState();
    if (pet.lightsOff) toast(isNight() ? '불을 껐어요. 잘 자, 우왕아 🌙' : '불을 껐어요. 우왕이가 낮잠을 자요 💤');
    else toast(isNight() ? '불을 켰어요. 밤이라 우왕이는 계속 자요' : '불을 켰어요. 우왕이가 일어났어요!');
    render();
  }

  async function refuse() {
    busy = true;
    say('배불러요! 🙅');
    render();
    await playMascot(mascot, 'refuse', 1500);
    busy = false;
    render();
  }

  async function eat(emoji) {
    busy = true;
    say('냠냠 😋', 1800);
    render();
    const food = document.createElement('span');
    food.className = 'fx-food';
    food.innerHTML = icon(emoji, 44);
    food.style.left = `${Math.min(room.clientWidth - 50, x + mascot.offsetWidth - 16)}px`;
    fx.appendChild(food);
    Sound.sfx('beep');
    setTimeout(() => { food.style.transform = 'scale(.65)'; Sound.sfx('beep'); }, 500);
    setTimeout(() => { food.style.transform = 'scale(.35)'; Sound.sfx('beep'); }, 1000);
    setTimeout(() => { food.style.opacity = '0'; }, 1400);
    await playMascot(mascot, 'eat', 1600);
    food.remove();
    busy = false;
    render();
  }

  function clean() {
    busy = true;
    render();
    const wipe = document.createElement('div');
    wipe.className = 'fx-wipe';
    fx.appendChild(wipe);
    Sound.sfx('tear');
    setTimeout(() => {
      state.pet.poop = 0;
      state.pet.timers.sickRisk = 0;
      rewardExp(5);
      saveState();
      wipe.remove();
      busy = false;
      say('깨끗해졌어요! ✨');
      render();
    }, 1200);
  }

  // 비눗방울이 생기고 물방울이 떨어진 뒤 깨끗해진다
  function bathe() {
    busy = true;
    say('보글보글… 🫧', 1600);
    render();
    const left = x;
    const width = mascot.offsetWidth;
    const effects = [];
    for (let i = 0; i < 8; i++) {
      const b = document.createElement('span');
      b.className = 'fx-bubble';
      b.innerHTML = icon('bubble', 28);
      b.style.left = `${left + Math.random() * (width - 20)}px`;
      b.style.bottom = `${30 + Math.random() * 90}px`;
      b.style.animationDelay = `${i * 0.12}s`;
      fx.appendChild(b);
      effects.push(b);
    }
    for (let i = 0; i < 10; i++) {
      const d = document.createElement('span');
      d.className = 'fx-drop';
      d.innerHTML = icon('drop', 20);
      d.style.left = `${left + Math.random() * (width - 10)}px`;
      d.style.animationDelay = `${0.3 + i * 0.1}s`;
      fx.appendChild(d);
      effects.push(d);
    }
    Sound.sfx('tear');
    playMascot(mascot, 'refuse', 1500); // 몸을 부르르 턴다
    setTimeout(() => {
      effects.forEach((el) => el.remove());
      state.pet.dirty = false;
      state.pet.timers.dirt = 0;
      rewardExp(5);
      saveState();
      busy = false;
      const sparkle = document.createElement('span');
      sparkle.className = 'fx-sparkle';
      sparkle.innerHTML = icon('sparkle', 36);
      sparkle.style.left = `${x + mascot.offsetWidth / 2 - 16}px`;
      fx.appendChild(sparkle);
      setTimeout(() => sparkle.remove(), 1000);
      Sound.sfx('levelup');
      say('뽀득뽀득! 개운해요 ✨');
      render();
      playMascot(mascot, 'joy', 600);
    }, 1600);
  }

  function cure() {
    busy = true;
    render();
    const pill = document.createElement('span');
    pill.className = 'fx-pill';
    pill.innerHTML = icon('pill', 36);
    fx.appendChild(pill);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      pill.style.right = `${room.clientWidth - x - mascot.offsetWidth / 2}px`;
    }));
    setTimeout(() => {
      pill.remove();
      state.pet.sick = false;
      rewardExp(5);
      saveState();
      busy = false;
      const sparkle = document.createElement('span');
      sparkle.className = 'fx-sparkle';
      sparkle.innerHTML = icon('sparkle', 36);
      sparkle.style.left = `${x + mascot.offsetWidth / 2 - 16}px`;
      fx.appendChild(sparkle);
      setTimeout(() => sparkle.remove(), 1000);
      Sound.sfx('levelup');
      say('다 나았어요! 💪');
      render();
      playMascot(mascot, 'joy', 600);
    }, 1000);
  }

  // 알을 톡톡 두드리거나, 우왕이를 쓰다듬는다
  function tapMascot() {
    const pet = state.pet;
    if (pet.stage === 'egg') {
      if (hatching) return;
      eggTaps++;
      Sound.sfx('beep');
      playMascot(mascot, 'tap', 400);
      say(`톡톡! (${eggTaps}/5)`, 1500);
      return;
    }
    if (busy || play || state.flight || isAsleep()) return;
    say(pet.sick ? '으으… 아파요' : '헤헤, 간지러워요 😊', 1500);
    playMascot(mascot, 'joy', 600);
  }

  // ---------- 놀아주기: 우왕이가 볼 방향 맞히기 ----------
  function startPlay() {
    play = { round: 0, wins: 0, waiting: false, mood: '' };
    moveTo(centerX());
    setMascot(mascot, { look: '' });
    updatePlay();
    render();
  }

  function updatePlay(message) {
    $('#play-text').textContent = message || `우왕이가 어느 쪽을 볼까요? (${play.round + 1}/${PLAY_ROUNDS})`;
    $('#play-score').textContent = `맞힌 횟수 ${play.wins} · 3번 이상 맞히면 행복 +1`;
    document.querySelectorAll('[data-guess]').forEach((b) => { b.disabled = play.waiting; });
  }

  function guess(choice) {
    if (!play || play.waiting) return;
    const dir = Math.random() < 0.5 ? 'left' : 'right';
    const win = choice === dir;
    if (win) play.wins++;
    play.waiting = true;
    play.mood = win ? 'happy' : 'sad';
    setMascot(mascot, { look: dir, mood: play.mood });
    Sound.sfx(win ? 'coin' : 'bad');
    updatePlay(win ? '⭕ 맞았어요!' : '❌ 아쉬워요!');
    setTimeout(() => {
      play.round++;
      play.waiting = false;
      play.mood = '';
      setMascot(mascot, { look: '' });
      if (play.round >= PLAY_ROUNDS) finishPlay();
      else updatePlay();
    }, 1000);
  }

  function finishPlay() {
    const pet = state.pet;
    const wins = play.wins;
    play = null;
    pet.dirty = true; // 신나게 놀고 나면 꼬질꼬질해진다
    pet.timers.dirt = 0;
    if (wins >= 3) {
      addHearts('happy', 1);
      pet.weight = Math.max(1, pet.weight - 1);
      rewardExp(15);
      say(`${wins}번 맞혔어요! 신나요 🎉`);
      playMascot(mascot, 'joy', 600);
    } else {
      rewardExp(5);
      say(`${wins}번 맞혔어요. 다음엔 더 잘할래요!`);
    }
    saveState();
    render();
  }

  // ---------- 옷장과 도감 ----------
  function wear(destId) {
    const { slot } = OUTFITS[destId];
    state.equipped[slot] = state.equipped[slot] === destId ? null : destId;
    saveState();
    render();
    renderCollections();
    if (state.equipped[slot] && !busy && !play && !isAsleep()) playMascot(mascot, 'joy', 600);
  }

  function renderCollections() {
    // 여행지 의상 + 집중 모드 코스튬
    const items = [
      ...DESTINATIONS.map((d) => ({ id: d.id, outfit: d.outfit, locked: d.name, hint: `${d.name}에 가면 받아요` })),
      ...FOCUS_COSTUMES.map((c) => ({ id: c.id, outfit: c, locked: `📚 ${c.hours}시간`, hint: `집중 모드로 ${c.hours}시간 모으면 받아요` })),
    ];
    $('#wardrobe-count').textContent = `${items.filter((it) => state.outfits.includes(it.id)).length} / ${items.length}`;
    $('#wardrobe').innerHTML = items.map(({ id, outfit: o, locked, hint }) => {
      if (!state.outfits.includes(id)) {
        return `<button class="wear" disabled title="${hint}"><span>❔</span>${locked}</button>`;
      }
      const on = state.equipped[o.slot] === id;
      return `<button class="wear${on ? ' on' : ''}" data-wear="${id}"><span>${o.emoji}</span>${o.name}<small>${SLOT_NAMES[o.slot]}${on ? ' · 입는 중' : ''}</small></button>`;
    }).join('');

    const keys = Object.keys(ADULT_FORMS);
    $('#forms-count').textContent = `${state.forms.length} / ${keys.length}`;
    $('#forms').innerHTML = keys.map((k) => {
      const f = ADULT_FORMS[k];
      const current = state.pet.stage === 'adult' && state.pet.form === k;
      return state.forms.includes(k)
        ? `<div class="form-item${current ? ' current' : ''}" title="${f.hint}"><span>${f.icon}</span>${f.name}</div>`
        : `<div class="form-item locked" title="${f.hint}"><span>❔</span>???</div>`;
    }).join('');
    $('#forms-note').textContent = state.pet.stage === 'adult'
      ? '처음부터 다시 키우면 다른 모습으로 자랄 수도 있어요. 도감은 그대로 남아요.'
      : `어른이 되면 키운 방법에 따라 모습이 정해져요. 힌트: ${Object.values(ADULT_FORMS).map((f) => `${f.icon} ${f.hint}`).join(' / ')}`;
  }

  function refresh() {
    render();
    renderCollections();
  }

  function resetView() {
    endHold();
    stopGaze();
    lastPoop = null;
    talking = false;
    play = null;
    busy = false;
    hatching = false;
    eggTaps = 0;
    mountedStage = null;
    speech = { text: '', until: 0 };
    fx.innerHTML = '';
    render();
    renderCollections();
    moveTo(centerX(), true);
  }

  return { init, refresh, resetView };
})();
