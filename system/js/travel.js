// 여행 탭: 여행지 고르기 → 기다릴 시간 정하기 → 탑승권 → 비행(실시간) → 도착.
const Travel = (() => {
  const MIN_SECONDS = 10;
  const MAX_SECONDS = 24 * 3600 - 1;
  const STEP = { h: 3600, m: 60, s: 1 };
  const plan = { destId: DESTINATIONS[0].id, seconds: DESTINATIONS[0].minutes * 60 };
  let ticket = null; // 발권했지만 아직 타지 않은 탑승권
  let announceIndex = -1;
  let announceFor = null;
  let cloudsFor = null;
  let cancelArmed = false;

  function init() {
    const select = $('#dest-select');
    select.innerHTML = destOptionsHtml({ withTime: true });
    select.value = plan.destId;
    select.addEventListener('change', () => {
      plan.destId = select.value;
      plan.seconds = destById(plan.destId).minutes * 60;
      renderPlan();
    });

    document.querySelectorAll('.adj').forEach((btn) => {
      holdRepeat(btn, () => adjust(btn.dataset.unit, Number(btn.dataset.dir)));
    });
    document.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => {
      plan.seconds = b.dataset.preset === 'real' ? destById(plan.destId).minutes * 60 : Number(b.dataset.preset);
      renderTimer();
    }));

    $('#btn-issue').addEventListener('click', issueTicket);
    $('#btn-board').addEventListener('click', board);
    $('#btn-ticket-back').addEventListener('click', () => { ticket = null; render(); });

    document.querySelectorAll('[data-sound]').forEach((b) => b.addEventListener('click', () => {
      Sound.toggle(b.dataset.sound);
      syncSoundButtons();
    }));
    $('#btn-voice').addEventListener('click', () => {
      state.voiceOn = !state.voiceOn;
      if (!state.voiceOn) Sound.stopSpeaking();
      saveState();
      syncSoundButtons();
      toast(state.voiceOn ? '📢 기내 방송을 켰어요' : '기내 방송을 껐어요');
    });
    $('#btn-cancel-flight').addEventListener('click', cancelFlight);

    $('#btn-arrival-tips').addEventListener('click', () => {
      const destId = state.arrival.destId;
      finishArrival();
      Community.openFor(destId);
    });
    $('#btn-arrival-games').addEventListener('click', () => { finishArrival(); show('games'); });
    $('#btn-arrival-done').addEventListener('click', () => { finishArrival(); render(); });
  }

  // 누르고 있으면 계속 바뀌는 ▲▼ 버튼
  function holdRepeat(btn, fn) {
    let delay = 0;
    let repeat = 0;
    const stop = () => { clearTimeout(delay); clearInterval(repeat); };
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      fn();
      delay = setTimeout(() => { repeat = setInterval(fn, 70); }, 400);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => btn.addEventListener(ev, stop));
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); }
    });
  }

  function adjust(unit, dir) {
    plan.seconds = Math.max(MIN_SECONDS, Math.min(MAX_SECONDS, plan.seconds + dir * STEP[unit]));
    renderTimer();
  }

  function render() {
    const views = { plan: '#travel-plan', ticket: '#travel-ticket', flight: '#travel-flight', arrival: '#travel-arrival' };
    const current = state.arrival ? 'arrival' : state.flight ? 'flight' : ticket ? 'ticket' : 'plan';
    for (const key in views) $(views[key]).hidden = key !== current;
    if (current === 'plan') renderPlan();
    if (current === 'ticket') renderTicket();
    if (current === 'flight') renderFlight();
    if (current === 'arrival') renderArrival();
  }

  // ---------- 계획 ----------
  function renderPlan() {
    const d = destById(plan.destId);
    const visits = state.visited[d.id] || 0;
    $('#dest-select').value = d.id;
    $('#dest-info').innerHTML = `
      <span class="emoji" style="background:${d.sky}">${d.icon}</span>
      <div>
        <b>${d.name}</b> <small>${d.country} · ${d.code}</small>
        <p>실제 비행시간 약 ${flightLabel(d.minutes)}</p>
        <p>${visits ? `방문 ${visits}회` : `첫 방문 선물: ${d.souvenir.emoji} ${d.souvenir.name} · ${d.outfit.emoji} ${d.outfit.name}`}</p>
      </div>`;
    renderTimer();
    renderPassport();
  }

  function renderTimer() {
    const s = plan.seconds;
    $('#t-h').textContent = pad(Math.floor(s / 3600));
    $('#t-m').textContent = pad(Math.floor((s % 3600) / 60));
    $('#t-s').textContent = pad(s % 60);

    const real = destById(plan.destId).minutes * 60;
    const diff = s - real;
    let note;
    if (diff === 0) note = '실제 비행시간과 똑같이 기다려요 ✈️';
    else if (diff < 0) note = `실제보다 ${durationText(-diff)} 짧게 기다려요`;
    else note = `실제보다 ${durationText(diff)} 길게 기다려요`;
    $('#timer-note').innerHTML = `${note}<br>지금 출발하면 <b>${clockText(Date.now() + s * 1000)}</b> 도착`;
  }

  function renderPassport() {
    $('#stamps').innerHTML = DESTINATIONS.map((d) => {
      const visits = state.visited[d.id] || 0;
      return visits
        ? `<div class="stamp" style="--c:${d.color}" title="${d.name} ${visits}회"><b>${d.code}</b><small>${d.name}</small></div>`
        : `<div class="stamp locked" title="${d.name}"><b>?</b><small>${d.code}</small></div>`;
    }).join('');

    const owned = DESTINATIONS.filter((d) => state.souvenirs.includes(d.id));
    $('#souvenir-title').textContent = `기념품 ${owned.length} / ${DESTINATIONS.length}`;
    $('#souvenirs').innerHTML = owned.length
      ? owned.map((d) => `<span class="chip">${d.souvenir.emoji} ${d.souvenir.name}</span>`).join('')
      : '<p class="sub empty">여행지에 처음 도착하면 기념품을 받아요.</p>';
  }

  function travelBlocker() {
    const pet = state.pet;
    if (pet.stage === 'egg') return '아직 알이에요! 우왕이가 태어난 다음에 떠날 수 있어요 🥚';
    if (pet.sick) return '아플 때는 여행을 갈 수 없어요. 먼저 약을 주세요 💊';
    if (pet.hunger === 0) return '배가 너무 고파서 못 가요. 밥을 먼저 주세요 🍙';
    return '';
  }

  function issueTicket() {
    const problem = travelBlocker();
    if (problem) return toast(problem);
    const d = destById(plan.destId);
    ticket = {
      destId: d.id,
      seconds: plan.seconds,
      flightNo: `WA${101 + DESTINATIONS.indexOf(d)}`,
      seat: `${1 + Math.floor(Math.random() * 40)}${Math.random() < 0.5 ? 'A' : 'K'}`,
      gate: 1 + Math.floor(Math.random() * 50),
    };
    render();
  }

  // ---------- 탑승권 ----------
  function renderTicket() {
    const d = destById(ticket.destId);
    const el = $('#ticket');
    el.classList.remove('torn');
    el.innerHTML = `
      <div class="t-main">
        <div class="t-head">WOOANG AIR · BOARDING PASS</div>
        <div class="t-route">
          <div><b>ICN</b><small>인천</small></div>
          <span class="arrow">✈️</span>
          <div><b>${d.code}</b><small>${d.name}</small></div>
        </div>
        <dl class="t-info">
          <div><dt>승객</dt><dd>우왕이</dd></div>
          <div><dt>편명</dt><dd>${ticket.flightNo}</dd></div>
          <div><dt>좌석 (창가)</dt><dd>${ticket.seat}</dd></div>
          <div><dt>게이트</dt><dd>${ticket.gate}</dd></div>
          <div><dt>비행 시간</dt><dd>${durationText(ticket.seconds)}</dd></div>
          <div><dt>도착 예정</dt><dd>${clockText(Date.now() + ticket.seconds * 1000)}</dd></div>
        </dl>
      </div>
      <div class="t-stub">
        <div class="barcode"></div>
        <small>${ticket.flightNo} · ${ticket.seat}</small>
      </div>`;
    $('#btn-board').disabled = false;
  }

  function board() {
    $('#btn-board').disabled = true;
    Sound.sfx('tear');
    $('#ticket').classList.add('torn');
    setTimeout(() => {
      state.flight = {
        destId: ticket.destId,
        start: Date.now(),
        duration: ticket.seconds * 1000,
        flightNo: ticket.flightNo,
        seat: ticket.seat,
      };
      ticket = null;
      saveState();
      if (!Sound.isOn('cabin')) Sound.toggle('cabin');
      render();
    }, 900);
  }

  // ---------- 비행 ----------
  function buildClouds() {
    const sky = $('#sky');
    sky.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const near = i % 3 === 0; // 가까운 구름은 크고 빠르게, 먼 구름은 작고 느리게
      const cloud = document.createElement('span');
      cloud.className = 'cloud';
      cloud.textContent = '☁️';
      cloud.style.fontSize = `${near ? 64 + Math.random() * 30 : 26 + Math.random() * 22}px`;
      cloud.style.top = `${Math.random() * 80}%`;
      cloud.style.opacity = near ? 0.95 : 0.7;
      cloud.style.animationDuration = `${near ? 4 + Math.random() * 2 : 10 + Math.random() * 6}s`;
      cloud.style.animationDelay = `${-Math.random() * 12}s`;
      sky.appendChild(cloud);
    }
  }

  function syncSoundButtons() {
    document.querySelectorAll('[data-sound]').forEach((b) => b.classList.toggle('on', Sound.isOn(b.dataset.sound)));
    $('#btn-voice').classList.toggle('on', state.voiceOn);
  }

  // 기내 방송 목록. time: 이륙 후 몇 ms에 나오는지, voice: 음성으로 읽을지
  function announcements(f) {
    const d = destById(f.destId);
    const total = f.duration;
    const landIn = total >= 5 * 60000 ? '약 1분 후' : '잠시 후';
    const list = [
      { time: 0, text: '이륙합니다! 좌석벨트를 매 주세요 💺' },
      {
        time: Math.min(10000, total * 0.3),
        voice: true,
        notice: `${d.name}행 환영 방송`,
        text: `승객 여러분, 안녕하십니까. 우왕에어 ${f.flightNo}편 ${d.name}행에 탑승해 주셔서 감사합니다. `
          + `목적지까지 비행 시간은 ${durationText(Math.round(total / 1000))}입니다. 편안한 여행 되십시오.`,
      },
      { time: total * 0.35, long: true, text: '기내식이 나왔어요! 우왕이가 맛있게 먹었어요 🍱' },
      { time: total * 0.6, long: true, text: '기내 조명이 어두워졌어요. 음악을 켜고 쉬어 볼까요? 🎵' },
      {
        time: Math.max(total - 60000, total * 0.8),
        voice: true,
        notice: `${landIn} ${d.name}에 착륙해요`,
        text: `승객 여러분, 우리 비행기는 ${landIn} ${d.name} 공항에 착륙하겠습니다. `
          + '좌석 등받이와 테이블을 제자리로 해 주시고, 좌석벨트를 매 주시기 바랍니다.',
      },
    ];
    // 2분보다 짧은 비행은 방송이 겹치지 않게 기내식·조명 안내를 뺀다
    return list.filter((a) => !a.long || total >= 2 * 60000).sort((a, b) => a.time - b.time);
  }

  function renderFlight() {
    const f = state.flight;
    if (cloudsFor !== f.start) {
      buildClouds();
      cloudsFor = f.start;
    }
    $('#to-code').textContent = destById(f.destId).code;
    $('#eta').textContent = `${f.flightNo} · 좌석 ${f.seat} · ${clockText(f.start + f.duration)} 도착 예정`;
    const mini = $('#mascot-flight');
    mountMascot(mini, state.pet.stage === 'egg' ? 'baby' : state.pet.stage);
    setMascot(mini, { mood: 'happy' });
    dressMascot(mini);
    cancelArmed = false;
    $('#btn-cancel-flight').textContent = '회항하기 (여행 취소)';
    syncSoundButtons();
    tick();
  }

  // 1초마다 app.js에서 부른다. 방송은 다른 탭에 있어도 나온다.
  function tick() {
    const f = state.flight;
    if (!f) return;
    const elapsed = Date.now() - f.start;

    if (announceFor !== f.start) {
      announceFor = f.start;
      announceIndex = -1;
    }
    const list = announcements(f);
    let index = 0;
    list.forEach((a, i) => { if (elapsed >= a.time) index = i; });
    if (index !== announceIndex) {
      // 앱을 다시 열었을 때 이미 지난 방송은 다시 틀지 않는다
      const live = announceIndex !== -1 || elapsed < 3000;
      announceIndex = index;
      const a = list[index];
      $('#announce-text').textContent = a.text;
      if (live) {
        Sound.sfx('ding');
        if (a.voice && state.voiceOn) setTimeout(() => Sound.speak(a.text), 900);
        if (a.notice && $('#travel-flight').hidden) toast(`📢 기내 방송: ${a.notice}`);
      }
    }

    if ($('#travel-flight').hidden) return;
    const progress = Math.min(1, elapsed / f.duration);
    $('#countdown').textContent = formatClock(Math.max(0, Math.ceil((f.duration - elapsed) / 1000)));
    $('#track-fill').style.width = `${progress * 100}%`;
    $('#plane').style.left = `${progress * 100}%`;
  }

  function cancelFlight() {
    const btn = $('#btn-cancel-flight');
    if (!cancelArmed) {
      cancelArmed = true;
      btn.textContent = '정말 회항할까요? 한 번 더 누르면 인천으로 돌아와요';
      setTimeout(() => {
        cancelArmed = false;
        btn.textContent = '회항하기 (여행 취소)';
      }, 3000);
      return;
    }
    state.flight = null;
    saveState();
    Sound.stopAll();
    Sound.stopSpeaking();
    toast('회항했어요. 다음에 다시 떠나요!');
    render();
  }

  // 비행 시간이 다 되면 app.js가 부른다 (다른 탭에 있어도)
  function completeFlight() {
    const d = destById(state.flight.destId);
    const newSouvenir = !state.souvenirs.includes(d.id);
    const newOutfit = !state.outfits.includes(d.id);
    state.visited[d.id] = (state.visited[d.id] || 0) + 1;
    state.trips++;
    if (newSouvenir) state.souvenirs.push(d.id);
    if (newOutfit) state.outfits.push(d.id);
    state.flight = null;
    state.arrival = { destId: d.id, newSouvenir, newOutfit };
    addHearts('happy', 1);
    rewardExp(30);
    saveState();
    Sound.stopAll();
    Sound.sfx('ding');
    toast(`✈️ ${d.name}에 도착했어요! 여행 탭에서 확인해 보세요`);
    if (!$('#screen-travel').hidden) render();
  }

  // ---------- 도착 ----------
  function renderArrival() {
    const d = destById(state.arrival.destId);
    $('#arrival-hero').style.background = d.sky;
    $('#arrival-scene').textContent = d.scene;
    $('#arrival-title').textContent = `${d.name} 도착!`;
    $('#arrival-stamp').textContent = d.code;
    const chips = ['✨ 경험치 +30', '💗 행복 +1'].map((t) => `<span class="chip">${t}</span>`);
    if (state.arrival.newSouvenir) chips.push(`<span class="chip new">🎁 새 기념품: ${d.souvenir.emoji} ${d.souvenir.name}</span>`);
    if (state.arrival.newOutfit) chips.push(`<span class="chip new">👗 새 의상: ${d.outfit.emoji} ${d.outfit.name} (옷장에서 입혀 보세요)</span>`);
    $('#arrival-reward').innerHTML = chips.join('');
    $('#btn-arrival-tips').textContent = `💬 ${d.name} 꿀팁 보러 가기`;
  }

  function finishArrival() {
    state.arrival = null;
    saveState();
  }

  function reset() {
    ticket = null;
    cloudsFor = null;
  }

  // ---------- 시간 글자 ----------
  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function durationText(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const parts = [];
    if (h) parts.push(`${h}시간`);
    if (m) parts.push(`${m}분`);
    if (s || !parts.length) parts.push(`${s}초`);
    return parts.join(' ');
  }

  function clockText(time) {
    const d = new Date(time);
    const sameDay = d.toDateString() === new Date().toDateString();
    return `${sameDay ? '' : '내일 '}${d.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })}`;
  }

  return { init, render, tick, completeFlight, reset };
})();

function formatClock(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}
