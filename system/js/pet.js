// 우왕이 키우기 (다마고치 방식).
// 알에서 태어나 배고픔·행복을 채워 주고, 똥을 치우고, 아프면 약을 주고, 밤에는 불을 꺼 준다.
// 규칙(시간이 지나면 줄어드는 수치 등)은 state.js에 있고, 여기서는 화면과 돌보기 동작을 다룬다.
const Pet = (() => {
  const PLAY_ROUNDS = 5;
  const PHRASES = ['오늘은 어디로 여행 갈까? ✈️', '방 안을 산책 중이에요', '콧노래가 나와요 ♪', '창밖 구경 중이에요 ☁️'];

  let room, walker, mascot, fx;
  let mountedStage = null;
  let busy = false;      // 먹기·청소 같은 동작이 진행 중
  let play = null;       // 놀아주기 진행 상태
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

  function walk() {
    if (busy || play || state.flight || state.pet.stage === 'egg' || isAsleep()) return;
    const maxX = Math.max(10, room.clientWidth - mascot.offsetWidth - 10 - state.pet.poop * 34);
    const next = 10 + Math.random() * (maxX - 10);
    setMascot(mascot, { look: next < x ? 'left' : 'right' });
    moveTo(next);
    setTimeout(() => { if (!play) setMascot(mascot, { look: '' }); }, 1600);
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
      mountMascot(mascot, pet.stage);
      setMascot(mascot, { crack: false, look: '', anim: '' });
      mountedStage = pet.stage;
    }
    dressMascot(mascot);
    room.dataset.night = isNight();
    room.dataset.lights = pet.lightsOff && !away ? 'off' : 'on';
    room.dataset.asleep = asleep && !away;
    setMascot(mascot, { mood: (play && play.mood) || mood(), sleep: asleep, sick: pet.sick });

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

    $('#lights-label').textContent = pet.lightsOff ? '불 켜기' : '불 끄기';
    const locked = pet.stage === 'egg' || away || busy;
    document.querySelectorAll('[data-action]').forEach((b) => { b.disabled = locked; });
    $('#pet-actions').hidden = Boolean(play);
    $('#play-panel').hidden = !play;
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
      pet.weight += 1;
      rewardExp(5);
      saveState();
      return eat('🍙');
    }
    if (action === 'snack') {
      if (state.coins < SNACK_COST) return toast(`코인이 부족해요 (간식 🪙${SNACK_COST}). 게임으로 모아 보세요!`);
      state.coins -= SNACK_COST;
      addHearts('happy', 1);
      pet.weight += 2;
      rewardExp(3);
      saveState();
      return eat('🍰');
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
    food.textContent = emoji;
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

  function cure() {
    busy = true;
    render();
    const pill = document.createElement('span');
    pill.className = 'fx-pill';
    pill.textContent = '💊';
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
      sparkle.textContent = '✨';
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
    $('#wardrobe-count').textContent = `${state.outfits.length} / ${DESTINATIONS.length}`;
    $('#wardrobe').innerHTML = DESTINATIONS.map((d) => {
      const o = d.outfit;
      if (!state.outfits.includes(d.id)) {
        return `<button class="wear" disabled title="${d.name}에 가면 받아요"><span>❔</span>${d.name}</button>`;
      }
      const on = state.equipped[o.slot] === d.id;
      return `<button class="wear${on ? ' on' : ''}" data-wear="${d.id}"><span>${o.emoji}</span>${o.name}<small>${SLOT_NAMES[o.slot]}${on ? ' · 입는 중' : ''}</small></button>`;
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
