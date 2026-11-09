// 우왕이 키우기 (다마고치 방식).
// 알에서 태어나 배고픔·행복을 채워 주고, 똥을 치우고, 아프면 약을 주고, 밤에는 불을 꺼 준다.
// 규칙(시간이 지나면 줄어드는 수치 등)은 state.js에 있고, 여기서는 화면과 돌보기 동작을 다룬다.
const Pet = (() => {
  const PLAY_ROUNDS = 5;
  const PHRASES = ['오늘은 어디로 여행 갈까? ✈️', '방 안을 산책 중이에요', '콧노래가 나와요 ♪', '창밖 구경 중이에요 ☁️'];

  let room, walker, mascot, fx;
  let motion;            // 우왕이 몸 동작 (mascot.js의 createUwangMotion)
  let recenter = false;  // 방이 숨겨져 있어 자리를 못 잡았으면 다음에 보일 때 가운데로
  let mountedStage = null;
  let interactionVersion = 0;
  let touchTimes = [];
  let reactingUntil = 0;
  let busy = false;      // 먹기·청소 같은 동작이 진행 중
  let play = null;       // 놀아주기 진행 상태
  let hatching = false;
  let eggTaps = 0;
  let ticks = 0;
  let speech = { text: '', until: 0 };

  function init() {
    room = $('#room');
    walker = $('#walker');
    mascot = $('#mascot');
    fx = $('#room-fx');
    motion = createUwangMotion(mascot, walker, room);
    document.querySelectorAll('[data-action]').forEach((b) => b.addEventListener('click', () => act(b.dataset.action)));
    document.querySelectorAll('[data-guess]').forEach((b) => b.addEventListener('click', () => guess(b.dataset.guess)));
    mascot.addEventListener('click', tapMascot);
    mascot.tabIndex = 0;
    mascot.setAttribute('role', 'button');
    mascot.setAttribute('aria-label', '우왕이: 머리를 누르면 쓰다듬기, 몸통을 누르면 톡톡');
    mascot.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tapMascot(); }
    });
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
    if (isAsleep() || state.flight) motion.stopWalk(); // 잠들거나 떠나면 걷던 동작을 바로 정리
    else if (++ticks % 3 === 0) walk();
    else if (Math.random() < MOTION.idle.chance) idleTwitch();
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

  // instant: 처음 자리를 잡을 때처럼 걸어가는 동작 없이 옮긴다
  function moveTo(px, instant = false) {
    if (!room.clientWidth) { recenter = true; return Promise.resolve(false); }
    if (instant) { motion.place(px); return Promise.resolve(true); }
    return motion.walkTo(px);
  }

  function walk() {
    if (busy || Date.now() < reactingUntil || play || state.flight || state.pet.stage === 'egg' || isAsleep()) return;
    // 대기 동작(기지개·꾸벅 등)이 끝나기 전에 걷기 시작해서 동작이 뚝 끊기지 않게 한다
    if (motion.walking() || motion.acting() || motion.idling() || uwangReducedMotion()) return;
    const size = mascot.offsetWidth;
    const maxX = Math.max(10, room.clientWidth - size - 10 - state.pet.poop * 34);
    const next = 10 + Math.random() * (maxX - 10);
    if (Math.abs(next - motion.x()) < size * 0.2) return; // 제자리걸음은 하지 않는다
    setMascot(mascot, { look: next < motion.x() ? 'left' : 'right' });
    motion.walkTo(next).then(() => { if (!play) setMascot(mascot, { look: '' }); });
  }

  function idleTwitch() {
    if (busy || play || state.flight || state.pet.stage === 'egg' || isAsleep() || Date.now() < reactingUntil) return;
    if (motion.walking() || motion.acting() || motion.idling()) return; // 진행 중인 동작을 끊지 않는다
    motion.twitch();
  }

  // ---------- 화면 ----------
  function mood() {
    const pet = state.pet;
    if (pet.sick || pet.hunger === 0 || pet.happy === 0) return 'sad';
    return pet.happy >= 3 ? 'happy' : 'normal';
  }

  function hearts(count) {
    let html = '';
    for (let i = 0; i < MAX_HEARTS; i++) html += `<span class="${i < count ? 'on' : 'off'}">❤️</span>`;
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
      mountMascot(mascot, pet.stage); // 남은 동작·타이머·임시 효과도 여기서 정리된다
      setMascot(mascot, { crack: false, look: '', anim: '' });
      mountedStage = pet.stage;
      if (room.clientWidth) motion.place(motion.x()); // 성장해서 커져도 방 밖으로 잘리지 않게
    }
    // 잘 때·아플 때 표시를 먼저 정해야 대기 그림(잘 때 졸린 얼굴)이 맞게 골라진다
    setMascot(mascot, { mood: (play && play.mood) || mood(), sleep: asleep, sick: pet.sick });
    dressMascot(mascot);
    room.dataset.night = isNight();
    room.dataset.lights = pet.lightsOff && !away ? 'off' : 'on';
    room.dataset.asleep = asleep && !away;

    $('#poops').innerHTML = away ? '' : '<span>💩</span>'.repeat(pet.poop);
    $('#room-badges').innerHTML = pet.sick && !away ? '<span title="아파요">🤒</span>' : '';
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

    const status = $('#visual-status');
    if (status) status.textContent = pet.stage === 'egg' ? '알을 5번 누르면 태어나요' :
      `${pet.bodyShape === 'thin' ? '마른 체형' : '보통 체형'} · ${{normal:'피로 없음',tired:'졸림',exhausted:'심한 피로 · 다크서클'}[pet.fatigueStage]}`;
    $('#lights-label').textContent = pet.lightsOff ? '불 켜기' : '불 끄기';
    const locked = pet.stage === 'egg' || away || busy;
    document.querySelectorAll('[data-action]').forEach((b) => { b.disabled = locked; });
    $('#pet-actions').hidden = Boolean(play);
    $('#play-panel').hidden = !play;
  }

  // ---------- 돌보기 ----------
  function act(action) {
    const pet = state.pet;
    if (busy || play || state.flight || pet.stage === 'egg') return;
    if (action === 'lights') return toggleLights();
    if (isAsleep()) {
      return toast(isNight() ? '밤이라 자고 있어요 🌙 아침 8시에 일어나요' : '낮잠 자는 중이에요. 불을 켜면 일어나요 💡');
    }
    if (action === 'meal') {
      if (pet.hunger >= MAX_HEARTS) return refuse();
      addHearts('hunger', 1);
      recoverNutrition();
      pet.weight += 1;
      rewardExp(5);
      saveState();
      return eat('meal');
    }
    if (action === 'snack') {
      if (state.coins < SNACK_COST) return toast(`코인이 부족해요 (간식 🪙${SNACK_COST}). 게임으로 모아 보세요!`);
      state.coins -= SNACK_COST;
      addHearts('happy', 1);
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
    if (action === 'medicine') {
      if (!pet.sick) return toast('아프지 않아요! 약은 필요 없어요');
      return cure();
    }
  }

  function toggleLights() {
    const pet = state.pet;
    const wasAsleep = isAsleep();
    pet.lightsOff = !pet.lightsOff;
    pet.timers.nap = 0;
    saveState();
    if (pet.lightsOff) toast(isNight() ? '불을 껐어요. 잘 자, 우왕아 🌙' : '불을 껐어요. 우왕이가 낮잠을 자요 💤');
    else toast(isNight() ? '불을 켰어요. 밤이라 우왕이는 계속 자요' : '불을 켰어요. 우왕이가 일어났어요!');
    render();
    // 낮잠 자다 불이 켜져 깨면 잠깐 투덜대며 화낸다
    if (wasAsleep && !isAsleep() && !busy && !play && pet.stage !== 'egg') {
      say('으으… 왜 깨워! 💢', 1800);
      reactingUntil = Date.now() + 2500;
      motion.angry();
    }
  }

  async function refuse() {
    busy = true;
    say('배불러요! 🙅');
    render();
    stopWalking();
    await motion.refuse();
    busy = false;
    render();
  }

  // 걷던 중이면 지금 자리에서 바로 멈추고 바른 자세로 돌아온다
  function stopWalking() {
    motion.stopWalk();
    setMascot(mascot, { look: '' });
  }

  // 밥과 간식은 동작 순서와 리듬이 다르다 (mascot.js의 MOTION.meal / MOTION.snack)
  async function eat(kind) {
    const version = ++interactionVersion;
    busy = true;
    stopWalking();
    say(kind === 'meal' ? '밥 먹을 시간! 냠냠 🍚' : '달콤한 간식이다! 🍰', 3500);
    render();
    Sound.sfx('beep');
    await motion.feed(kind, {
      onBite: () => Sound.sfx('beep'),
      onHappy: () => {
        if (version !== interactionVersion) return;
        say(kind === 'meal' ? '잘 먹었습니다! 😊' : '달콤해서 행복해요! 💕');
        touchEffect(kind === 'meal' ? '✨' : '💕');
      },
    });
    if (version !== interactionVersion) return;
    busy = false;
    render();
  }

  // 효과는 하나만 띄운다 (연속 터치로 쌓이지 않게)
  function touchEffect(symbol) {
    mascot.querySelectorAll('.interaction-heart').forEach((n) => n.remove());
    const effect = document.createElement('span');
    effect.className = 'interaction-heart';
    effect.textContent = symbol;
    effect.setAttribute('aria-hidden', 'true');
    mascot.appendChild(effect);
    setTimeout(() => effect.remove(), 1000);
  }

  // 빗자루가 방을 쓸고 지나가는 동안 우왕이는 지켜보다 뛰어 넘고, 몸을 털고 개운해한다 (MOTION.clean)
  async function clean() {
    const version = ++interactionVersion;
    busy = true;
    stopWalking();
    say('청소해요! 🧹', 2500);
    render();
    const wipe = document.createElement('div');
    wipe.className = 'fx-wipe';
    wipe.innerHTML = '<span class="fx-broom">🧹</span>';
    fx.appendChild(wipe);
    Sound.sfx('tear');
    const swept = new Promise((resolve) => setTimeout(() => {
      wipe.remove();
      if (version === interactionVersion) {
        state.pet.poop = 0;
        state.pet.timers.sickRisk = 0;
        rewardExp(5);
        saveState();
        say('깨끗해졌어요! ✨');
        render();
      }
      resolve();
    }, MOTION.clean.sweepMs));
    await Promise.all([swept, motion.clean()]);
    if (version !== interactionVersion) return;
    busy = false;
    render();
  }

  // 약을 보고 움찔 → 꿀꺽 → 쓴맛에 부르르 → 다 나으면 기뻐서 뛴다 (MOTION.medicine)
  async function cure() {
    const version = ++interactionVersion;
    busy = true;
    stopWalking();
    say('으… 약 먹기 싫은데… 💊', 2500);
    render();
    await motion.medicine({ onSwallow: () => { Sound.sfx('beep'); say('꿀꺽! 써요… 😖', 1500); } });
    if (version !== interactionVersion) return;
    state.pet.sick = false;
    rewardExp(5);
    saveState();
    busy = false;
    const sparkle = document.createElement('span');
    sparkle.className = 'fx-sparkle';
    sparkle.textContent = '✨';
    sparkle.style.left = `${motion.x() + mascot.offsetWidth / 2 - 16}px`;
    fx.appendChild(sparkle);
    setTimeout(() => sparkle.remove(), 1000);
    Sound.sfx('levelup');
    say('다 나았어요! 💪');
    render(); // 아픈 표시를 먼저 풀어야 기쁨 점프가 허용된다
    motion.joy();
  }

  // 알을 톡톡 두드리거나, 우왕이를 쓰다듬는다
  function tapMascot(event) {
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
    const c = MOTION.touch;
    const now = Date.now();
    touchTimes = touchTimes.filter(t => now - t < c.spamWindowMs);
    touchTimes.push(now);
    // 마우스 클릭과 모바일 탭 모두 click으로 들어온다. 키보드(detail 0)는 머리 쓰다듬기로 본다.
    const rect = mascot.getBoundingClientRect();
    const keyboard = !event || event.detail === 0;
    const head = keyboard || (event.clientY - rect.top) / rect.height < c.headLine;
    const side = keyboard ? 1 : (event.clientX < rect.left + rect.width / 2 ? -1 : 1);
    // 너무 빨리 계속 만지면 화낸다 (아플 때는 화내지 않고 살살 반응)
    const kind = pet.sick ? 'comfort' : touchTimes.length >= c.spamCount ? 'angry' : head ? 'head' : 'body';
    const reaction = motion.touch(kind, side); // 걷던 중이면 그 자리에서 멈추고 반응한다
    if (!reaction) return; // 반응 중 짧은 간격의 터치는 쌓지 않는다
    if (kind === 'angry') touchTimes = [];
    setMascot(mascot, { look: '' });
    say({ comfort: '살살 만져 주세요…', angry: '그만 좀 만져! 💢', head: '헤헤, 기분 좋아요 😊', body: '앗, 간지러워! 😆' }[kind], 1800);
    reactingUntil = now + reaction.ms + 400;
    if (kind === 'head') touchEffect('♥');
  }

  // ---------- 놀아주기: 우왕이가 볼 방향 맞히기 ----------
  function startPlay() {
    play = { round: 0, wins: 0, waiting: false, mood: '' };
    motion.reset();
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
    if (wins >= 3) {
      addHearts('happy', 1);
      pet.weight = Math.max(1, pet.weight - 1);
      rewardExp(15);
      say(`${wins}번 맞혔어요! 신나요 🎉`);
      motion.joy();
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
    if (state.equipped[slot] && !busy && !play && !isAsleep() && state.pet.stage !== 'egg') motion.joy();
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
    if (recenter && room.clientWidth) {
      recenter = false;
      moveTo(centerX(), true);
    } else if (room.clientWidth && !motion.walking()) motion.place(motion.x());
  }

  function resetView() {
    interactionVersion++;
    mascot._animationToken = (mascot._animationToken || 0) + 1;
    motion.reset(); // 이동·동작·타이머·음식·하트 효과 정리
    touchTimes = [];
    reactingUntil = 0;
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
