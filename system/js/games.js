// 게임 탭: 게임 목록과 짝 맞추기, 여행 퀴즈. 특산품 받기는 minigame.js.
const Games = (() => {
  const LIST = [
    { id: 'catch', icon: '🧺', title: '특산품 받기', desc: '떨어지는 여행지 먹거리를 받아요. ⚡는 피하세요!' },
    { id: 'memory', icon: '🃏', title: '짝 맞추기', desc: '뒤집힌 카드 16장에서 같은 그림 8쌍을 찾아요.' },
    { id: 'quiz', icon: '❓', title: '여행 퀴즈', desc: '비행시간, 나라, 대표 먹거리를 맞혀요. 5문제!' },
  ];
  const QUIZ_COUNT = 5;

  let current = null;
  let memory = null;
  let memoryTimer = 0;
  let quiz = null;
  let pending = []; // 게임 안에서 걸어 둔 타이머 (게임을 바꾸거나 멈추면 모두 취소)

  function later(fn, ms) {
    pending.push(setTimeout(fn, ms));
  }

  function init() {
    MiniGame.init($('#game-canvas'));
    $('#btn-game-back').addEventListener('click', stop);
  }

  // 게임 목록은 오른쪽 패널에 늘 보인다. 가운데는 고른 게임, 안 골랐으면 안내 화면
  function render() {
    $('#game-view').hidden = !current;
    $('#game-empty').hidden = Boolean(current);
    $('#game-list').innerHTML = LIST.map((g) => `
      <button class="game-card${g.id === current ? ' on' : ''}" data-game="${g.id}">
        <span class="gi">${g.icon}</span>
        <span class="info"><b>${g.title}</b><small>${g.desc}</small></span>
        <span class="best">최고 ${state.bestScores[g.id] || 0}점</span>
      </button>`).join('');
    document.querySelectorAll('[data-game]').forEach((b) => b.addEventListener('click', () => open(b.dataset.game)));
  }

  function open(id) {
    stopRunning();
    current = id;
    render();
    $('#game-result').hidden = true;
    $('#game-title').textContent = LIST.find((g) => g.id === id).title;
    ['catch', 'memory', 'quiz'].forEach((g) => { $(`#game-${g}`).hidden = g !== id; });
    if (id === 'catch') showCatchIntro();
    if (id === 'memory') startMemory();
    if (id === 'quiz') startQuiz();
  }

  function stopRunning() {
    MiniGame.stop();
    clearInterval(memoryTimer);
    pending.forEach(clearTimeout);
    pending = [];
  }

  // 다른 탭으로 가거나 목록으로 돌아갈 때
  function stop() {
    stopRunning();
    current = null;
    $('#game-result').hidden = true;
    render();
  }

  function finish(id, score, detail = '') {
    const coins = Math.floor(score / 10);
    const exp = Math.floor(score / 5);
    const isBest = score > (state.bestScores[id] || 0);
    const happy = score >= 50 && state.pet.stage !== 'egg';
    if (isBest) state.bestScores[id] = score;
    state.gamesPlayed++;
    state.coins += coins;
    if (happy) addHearts('happy', 1);
    rewardExp(exp);
    saveState();
    renderTop();

    const modal = $('#game-result');
    modal.innerHTML = `
      <div class="card">
        <div class="big">${score >= 150 ? '🏆' : score >= 50 ? '🎉' : '😊'}</div>
        <h3>${score}점${isBest ? ' · 최고 기록!' : ''}</h3>
        ${detail ? `<p>${detail}</p>` : ''}
        <p>🪙 +${coins} · ✨ 경험치 +${exp}${happy ? ' · 💗 우왕이 행복 +1' : ''}</p>
        <button class="primary" id="res-retry">한 번 더!</button>
        <button class="ghost" id="res-hub">게임 목록</button>
      </div>`;
    modal.hidden = false;
    $('#res-retry').addEventListener('click', () => open(id));
    $('#res-hub').addEventListener('click', stop);
  }

  // ---------- 특산품 받기 ----------
  function showCatchIntro() {
    const intro = $('#catch-intro');
    const lastDest = state.arrival ? state.arrival.destId : null;
    intro.innerHTML = `
      <div class="card form">
        <div class="big">🧺</div>
        <h3>특산품 받기</h3>
        <label for="catch-dest">어느 여행지 먹거리를 받을까요?</label>
        <select id="catch-dest">${destOptionsHtml()}</select>
        <ul class="rules">
          <li>먹거리 +10점 · ⭐ +30점</li>
          <li>⚡에 닿으면 하트가 줄어요</li>
          <li>드래그하거나 ← → 키로 움직여요</li>
        </ul>
        <button class="primary" id="catch-start">시작!</button>
      </div>`;
    const select = $('#catch-dest');
    select.value = lastDest || DESTINATIONS[Math.floor(Math.random() * DESTINATIONS.length)].id;
    intro.hidden = false;
    $('#catch-start').addEventListener('click', () => {
      const dest = destById(select.value);
      intro.hidden = true;
      MiniGame.start(dest, (score) => finish('catch', score, `${dest.item.emoji} ${dest.name}의 ${dest.item.name}`));
    });
  }

  // ---------- 짝 맞추기 ----------
  function startMemory() {
    const emojis = shuffle(DESTINATIONS.map((d) => d.item.emoji)).slice(0, 8);
    memory = {
      cards: shuffle([...emojis, ...emojis]).map((emoji) => ({ emoji, open: false, done: false })),
      first: null,
      lock: false,
      moves: 0,
      pairs: 0,
      start: Date.now(),
    };
    clearInterval(memoryTimer);
    memoryTimer = setInterval(updateMemoryHud, 500);
    renderMemory();
  }

  function renderMemory() {
    const grid = $('#memory-grid');
    grid.innerHTML = memory.cards.map((c, i) => `
      <button class="mcard${c.open ? ' open' : ''}${c.done ? ' done' : ''}" data-card="${i}" aria-label="카드 ${i + 1}">
        ${c.open || c.done ? c.emoji : '?'}
      </button>`).join('');
    grid.querySelectorAll('[data-card]').forEach((b) => b.addEventListener('click', () => flip(Number(b.dataset.card))));
    updateMemoryHud();
  }

  function updateMemoryHud() {
    $('#m-moves').textContent = memory.moves;
    $('#m-pairs').textContent = memory.pairs;
    $('#m-time').textContent = Math.floor((Date.now() - memory.start) / 1000);
  }

  function flip(index) {
    const card = memory.cards[index];
    if (memory.lock || card.open || card.done) return;
    card.open = true;
    Sound.sfx('beep');
    if (!memory.first) {
      memory.first = card;
      renderMemory();
      return;
    }
    const first = memory.first;
    memory.first = null;
    memory.moves++;
    if (first.emoji === card.emoji) {
      first.done = card.done = true;
      memory.pairs++;
      Sound.sfx('coin');
      renderMemory();
      if (memory.pairs === 8) {
        clearInterval(memoryTimer);
        const seconds = Math.floor((Date.now() - memory.start) / 1000);
        const score = Math.max(10, 200 - memory.moves * 4 - seconds);
        later(() => finish('memory', score, `${memory.moves}번 시도 · ${seconds}초`), 400);
      }
      return;
    }
    memory.lock = true;
    renderMemory();
    later(() => {
      first.open = card.open = false;
      memory.lock = false;
      renderMemory();
    }, 700);
  }

  // ---------- 여행 퀴즈 ----------
  function makeQuestion(dest, type) {
    const others = DESTINATIONS.filter((d) => d.id !== dest.id);
    let text, answer, pool;
    if (type === 'time') {
      text = `인천에서 ${dest.icon} ${dest.name}까지 비행시간은 약 얼마일까요?`;
      answer = flightLabel(dest.minutes);
      pool = others.map((d) => flightLabel(d.minutes));
    } else if (type === 'country') {
      text = `${dest.icon} ${josa(dest.name, '은', '는')} 어느 나라에 있을까요?`;
      answer = dest.country;
      pool = others.map((d) => d.country);
    } else {
      text = `${dest.icon} ${dest.name}의 대표 먹거리로 어울리는 것은?`;
      answer = `${dest.item.emoji} ${dest.item.name}`;
      pool = others.map((d) => `${d.item.emoji} ${d.item.name}`);
    }
    const wrong = shuffle([...new Set(pool)].filter((o) => o !== answer)).slice(0, 3);
    return { text, answer, options: shuffle([answer, ...wrong]) };
  }

  function startQuiz() {
    const types = ['time', 'country', 'food'];
    const picks = shuffle(DESTINATIONS.slice()).slice(0, QUIZ_COUNT);
    quiz = { questions: picks.map((d, i) => makeQuestion(d, types[i % types.length])), index: 0, score: 0 };
    renderQuiz();
  }

  function renderQuiz() {
    const q = quiz.questions[quiz.index];
    $('#q-progress').textContent = `${quiz.index + 1} / ${QUIZ_COUNT}`;
    $('#q-score').textContent = quiz.score;
    $('#q-text').textContent = q.text;
    const box = $('#q-options');
    box.innerHTML = q.options.map((o, i) => `<button data-option="${i}">${o}</button>`).join('');
    box.querySelectorAll('[data-option]').forEach((b) => b.addEventListener('click', () => answer(b)));
  }

  function answer(button) {
    const q = quiz.questions[quiz.index];
    const buttons = $('#q-options').querySelectorAll('button');
    buttons.forEach((b) => {
      b.disabled = true;
      if (b.textContent === q.answer) b.classList.add('correct');
    });
    if (button.textContent === q.answer) {
      quiz.score += 20;
      Sound.sfx('coin');
    } else {
      button.classList.add('wrong');
      Sound.sfx('bad');
    }
    $('#q-score').textContent = quiz.score;
    later(() => {
      quiz.index++;
      if (quiz.index < QUIZ_COUNT) renderQuiz();
      else finish('quiz', quiz.score, `${QUIZ_COUNT}문제 중 ${quiz.score / 20}개 정답`);
    }, 1000);
  }

  return { init, render, stop };
})();

function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
