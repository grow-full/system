// 여행 탭: 모드·교통수단·출발지·도착지 고르기 → 기다릴 시간 → 좌석 고르기 → 결제·발권 → 탑승 → 도착.
// 일반 여행은 실제 시간으로 흐르고(앱을 닫아도 진행), 집중 모드는 화면을 보고 있을 때만 흐른다(focus.js).
const Travel = (() => {
  const MIN_SECONDS = 10;
  const MAX_SECONDS = 24 * 3600 - 1;
  const STEP = { h: 3600, m: 60, s: 1 };
  const MODE_NOTES = {
    normal: '🧳 앱을 닫아도 실제 시간으로 흘러가고, 시간이 되면 도착해요.',
    focus: '📚 탑승하면 탈것과 시간만 보여요. 화면을 벗어나면 타이머가 멈추고, 집중한 시간만큼 공부 코스튬이 가까워져요.',
  };
  const GATE_NAMES = { plane: '게이트', ktx: '타는 곳', bus: '승차홈', ship: '승선구' };
  const COMPANY_KO = { plane: '우왕에어', ktx: '우왕레일', bus: '우왕고속', ship: '우왕페리' };

  const plan = { mode: 'normal', transport: 'plane', fromId: 'ICN', destId: null, seconds: 0, classId: 'economy', seat: null };
  let planTripKey = '';  // 경로가 바뀌면 기다릴 시간을 실제 소요시간으로 되돌린다
  let seatKey = '';      // 수단·등급이 바뀌면 좌석 배치도를 새로 만든다
  let announceIndex = -1;
  let announceFor = null;
  let sceneFor = null;
  let cancelArmed = false;
  const VOICE_DELAY = 900;  // 딩동 소리 뒤 방송을 읽기 시작할 때까지(ms)
  const VOICE_GAP = 2000;   // 도착 방송이 끝나고 도착할 때까지 여유(ms)
  let voiceToken = 0;
  let voiceUntil = 0;       // 이 시각까지는 방송을 읽는 중일 수 있으니 도착을 미룬다

  function init() {
    $('#mode-pick').addEventListener('click', (e) => {
      const b = e.target.closest('[data-mode]');
      if (!b) return;
      plan.mode = b.dataset.mode;
      renderPlan();
    });
    $('#transport-pick').addEventListener('click', (e) => {
      const b = e.target.closest('[data-transport]');
      if (!b || b.dataset.transport === plan.transport) return;
      plan.transport = b.dataset.transport;
      plan.classId = SeatMap.classesFor(plan.transport)[0].id;
      renderPlan();
    });
    $('#from-select').addEventListener('change', (e) => { plan.fromId = e.target.value; renderPlan(); });
    $('#dest-select').addEventListener('change', (e) => { plan.destId = e.target.value; renderPlan(); });
    $('#class-pick').addEventListener('click', (e) => {
      const b = e.target.closest('[data-class]');
      if (!b || b.dataset.class === plan.classId) return;
      plan.classId = b.dataset.class;
      renderPlan();
    });

    document.querySelectorAll('.adj').forEach((btn) => {
      holdRepeat(btn, () => adjust(btn.dataset.unit, Number(btn.dataset.dir)));
    });
    document.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => {
      const trip = currentTrip();
      plan.seconds = b.dataset.preset === 'real' ? (trip ? trip.minutes * 60 : plan.seconds) : Number(b.dataset.preset);
      renderTimer();
    }));

    $('#btn-issue').addEventListener('click', issueTicket);
    $('#btn-board').addEventListener('click', board);
    $('#btn-ticket-back').addEventListener('click', cancelTicket);

    document.querySelectorAll('[data-sound]').forEach((b) => b.addEventListener('click', () => {
      Sound.toggle(b.dataset.sound);
      syncSoundButtons();
    }));
    $('#btn-voice').addEventListener('click', () => {
      state.voiceOn = !state.voiceOn;
      if (!state.voiceOn) Sound.stopSpeaking();
      saveState();
      syncSoundButtons();
      toast(state.voiceOn ? '📢 방송을 켰어요' : '방송을 껐어요');
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

  function currentView() {
    return state.arrival ? 'arrival' : state.flight ? 'flight' : state.ticket ? 'ticket' : 'plan';
  }

  function render() {
    const views = { plan: '#travel-plan', ticket: '#travel-ticket', flight: '#travel-flight', arrival: '#travel-arrival' };
    const current = currentView();
    for (const key in views) $(views[key]).hidden = key !== current;
    document.body.classList.toggle('focus-mode', current === 'flight' && state.flight.mode === 'focus');
    if (current !== 'plan') seatKey = '';
    if (current === 'plan') renderPlan();
    if (current === 'ticket') renderTicket();
    if (current === 'flight') renderFlight();
    if (current === 'arrival') renderArrival();
    renderPassport(); // 여권·기념품은 오른쪽 패널에 늘 보인다
  }

  // ---------- 계획 ----------
  function currentTrip() {
    return Routes.trip(plan.transport, plan.fromId, plan.destId);
  }

  // 출발지·도착지가 지금 수단으로 맞지 않으면 첫 번째로 가능한 값으로 바꾼다
  function syncPlan() {
    const origins = Routes.origins(plan.transport);
    if (!origins.some((o) => o.id === plan.fromId)) plan.fromId = origins[0].id;
    const dests = Routes.destinations(plan.transport, plan.fromId);
    if (!dests.some((d) => d.id === plan.destId)) plan.destId = dests.length ? dests[0].id : null;
    const trip = currentTrip();
    const key = `${plan.transport}|${plan.fromId}|${plan.destId}`;
    if (key !== planTripKey) {
      planTripKey = key;
      if (trip) plan.seconds = trip.minutes * 60;
    }
    return { origins, dests, trip };
  }

  function renderPlan() {
    const { origins, dests, trip } = syncPlan();
    const t = TRANSPORTS[plan.transport];

    document.querySelectorAll('#mode-pick [data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === plan.mode));
    document.querySelectorAll('#transport-pick [data-transport]').forEach((b) => b.classList.toggle('on', b.dataset.transport === plan.transport));
    $('#mode-note').textContent = MODE_NOTES[plan.mode];

    $('#from-select').innerHTML = origins.map((o) => `<option value="${o.id}">${o.label}</option>`).join('');
    $('#from-select').value = plan.fromId;
    const dest = $('#dest-select');
    dest.innerHTML = dests.length
      ? REGIONS.map((region) => {
        const options = dests.filter((d) => d.region === region)
          .map((d) => `<option value="${d.id}">${d.icon} ${d.name} · ${flightLabel(Routes.trip(plan.transport, plan.fromId, d.id).minutes)}</option>`)
          .join('');
        return options ? `<optgroup label="${region}">${options}</optgroup>` : '';
      }).join('')
      : '<option value="">갈 수 있는 곳이 없어요</option>';
    dest.disabled = !dests.length;
    if (plan.destId) dest.value = plan.destId;

    if (trip) {
      const d = destById(plan.destId);
      const visits = state.visited[d.id] || 0;
      $('#dest-info').innerHTML = `
        <span class="emoji" style="background:${d.sky}">${d.icon}</span>
        <div>
          <b>${d.name}</b> <small>${d.country}${trip.toCode !== d.name ? ` · ${trip.toCode}` : ''}</small>
          <p>${trip.fromName} 출발 · ${t.icon} ${t.name} 약 ${flightLabel(trip.minutes)} · ${trip.km.toLocaleString()}km</p>
          <p>${visits ? `방문 ${visits}회` : `첫 방문 선물: ${d.souvenir.emoji} ${d.souvenir.name} · ${d.outfit.emoji} ${d.outfit.name}`}</p>
        </div>`;
    } else {
      $('#dest-info').innerHTML = `<p class="sub">${t.icon} ${t.name}로 이 출발지에서 갈 수 있는 곳이 없어요. 다른 출발지를 골라 보세요.</p>`;
    }
    $('#preset-real').textContent = `${t.icon} 실제 소요시간`;

    renderTimer();
    renderSeats();
    renderFare();
    $('#focus-summary').textContent = Focus.summary();
    // 여권·기념품은 render()에서 모든 단계마다 그린다 (오른쪽 패널에 늘 보임)
  }

  function renderTimer() {
    const s = plan.seconds;
    $('#t-h').textContent = pad(Math.floor(s / 3600));
    $('#t-m').textContent = pad(Math.floor((s % 3600) / 60));
    $('#t-s').textContent = pad(s % 60);

    const trip = currentTrip();
    if (!trip) {
      $('#timer-note').textContent = '';
      return;
    }
    const diff = s - trip.minutes * 60;
    let note;
    if (diff === 0) note = `실제 소요시간과 똑같이 기다려요 ${TRANSPORTS[plan.transport].icon}`;
    else if (diff < 0) note = `실제보다 ${durationText(-diff)} 짧게 기다려요`;
    else note = `실제보다 ${durationText(diff)} 길게 기다려요`;
    const when = plan.mode === 'focus'
      ? '집중 모드는 화면을 보고 있는 동안만 시간이 흘러요'
      : `지금 출발하면 <b>${clockText(Date.now() + s * 1000)}</b> 도착`;
    $('#timer-note').innerHTML = `${note}<br>${when}`;
  }

  function renderSeats() {
    const classes = SeatMap.classesFor(plan.transport);
    $('#class-pick').innerHTML = classes.map((c) => `<button data-class="${c.id}" class="${c.id === plan.classId ? 'on' : ''}">${c.name}<small>×${c.mult}</small></button>`).join('');
    const key = `${plan.transport}|${plan.classId}`;
    if (key === seatKey) return;
    seatKey = key;
    plan.seat = null;
    SeatMap.open($('#seatmap'), plan.transport, plan.classId, (seat) => {
      plan.seat = seat;
      renderFare();
    });
  }

  function currentFare() {
    const trip = currentTrip();
    if (!trip) return null;
    const cls = SeatMap.classById(plan.transport, plan.classId);
    return {
      cls,
      trip,
      fare: Routes.fare(plan.transport, trip.km, cls.mult),
      full: Routes.fare(plan.transport, trip.km, cls.mult, false),
    };
  }

  function renderFare() {
    const info = currentFare();
    const t = TRANSPORTS[plan.transport];
    const btn = $('#btn-issue');
    const note = $('#issue-note');
    if (!info) {
      $('#fare-box').innerHTML = '';
      btn.disabled = true;
      btn.textContent = `🎫 ${t.pass} 발권하기`;
      note.textContent = '갈 수 있는 도착지를 먼저 골라 주세요.';
      return;
    }
    const { cls, trip, fare, full } = info;
    const price = fare === 0
      ? `<s>🪙 ${full}</s> <b class="free">첫 여행 무료 🎁</b>`
      : `<b>🪙 ${fare}</b>`;
    $('#fare-box').innerHTML = `
      <div><small>좌석</small><b>${plan.seat ? `${cls.name} · ${plan.seat.label}${plan.seat.window ? (cls.rooms ? ' (바다 전망)' : ' (창가)') : ''}` : '좌석을 골라 주세요'}</b></div>
      <div class="price"><small>요금 · ${trip.km.toLocaleString()}km · ${cls.name} ×${cls.mult}</small>${price}</div>`;
    btn.textContent = `🎫 ${t.pass} 발권하기 · ${fare === 0 ? '무료' : `🪙 ${fare}`}`;
    const short = fare - state.coins;
    btn.disabled = !plan.seat || short > 0;
    if (!plan.seat) note.textContent = '위 배치도에서 좌석을 골라 주세요.';
    else if (short > 0) note.textContent = `코인이 부족해요. 게임으로 모아 보세요! (🪙 ${short}개 더 필요)`;
    else note.textContent = `내 코인 🪙 ${state.coins} → 발권 후 🪙 ${state.coins - fare}`;
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
    const info = currentFare();
    if (!info || !plan.seat) return toast('좌석을 먼저 골라 주세요');
    const { cls, trip, fare } = info;
    if (state.coins < fare) return toast('코인이 부족해요. 게임으로 모아 보세요!');

    const d = destById(plan.destId);
    const i = DESTINATIONS.indexOf(d);
    const t = plan.transport;
    state.coins -= fare;
    state.ticket = {
      mode: plan.mode,
      transport: t,
      from: plan.fromId,
      fromCode: trip.fromCode,
      fromName: trip.fromName,
      destId: d.id,
      toCode: trip.toCode,
      toName: trip.toName,
      seconds: plan.seconds,
      flightNo: { plane: `WA${101 + i}`, ktx: `${101 + i}열차`, bus: `WB${101 + i}`, ship: `우왕${i + 1}호` }[t],
      seat: plan.seat.label,
      window: plan.seat.window,
      seatClass: cls.id,
      className: cls.name,
      fare,
      gate: 1 + Math.floor(Math.random() * (t === 'plane' ? 50 : 12)),
    };
    saveState();
    renderTop();
    if (fare) Sound.sfx('coin');
    toast(fare ? `🪙 ${fare}코인을 내고 ${TRANSPORTS[t].pass}을 받았어요` : '🎁 첫 여행은 무료예요!');
    render();
  }

  // 아직 타지 않은 표는 요금을 돌려준다
  function cancelTicket() {
    const tk = state.ticket;
    if (!tk) return;
    state.coins += tk.fare;
    state.ticket = null;
    saveState();
    renderTop();
    if (tk.fare) toast(`표를 취소하고 🪙 ${tk.fare}코인을 돌려받았어요`);
    render();
  }

  // ---------- 탑승권 ----------
  function renderTicket() {
    const tk = state.ticket;
    const d = destById(tk.destId);
    const t = TRANSPORTS[tk.transport];
    const el = $('#ticket');
    el.classList.remove('torn');
    $('#ticket-title').textContent = `${t.pass}이 발권되었어요 🎫`;
    el.innerHTML = `
      <div class="t-main">
        <div class="t-head">${t.company} · ${t.passEn}${tk.mode === 'focus' ? ' · 📚 FOCUS' : ''}</div>
        <div class="t-route">
          <div><b>${tk.fromCode}</b><small>${tk.fromName}</small></div>
          <span class="arrow">${t.icon}</span>
          <div><b>${tk.toCode}</b><small>${d.name}</small></div>
        </div>
        <dl class="t-info">
          <div><dt>승객</dt><dd>우왕이</dd></div>
          <div><dt>${tk.transport === 'plane' ? '편명' : '운행'}</dt><dd>${tk.flightNo}</dd></div>
          <div><dt>좌석 (${tk.className}${tk.window ? ' · 창가' : ''})</dt><dd>${tk.seat}</dd></div>
          <div><dt>${GATE_NAMES[tk.transport]}</dt><dd>${tk.gate}</dd></div>
          <div><dt>소요 시간</dt><dd>${durationText(tk.seconds)}</dd></div>
          <div><dt>${tk.mode === 'focus' ? '모드' : '도착 예정'}</dt><dd>${tk.mode === 'focus' ? '📚 집중 모드' : clockText(Date.now() + tk.seconds * 1000)}</dd></div>
          <div><dt>요금</dt><dd>${tk.fare ? `🪙 ${tk.fare}` : '🎁 무료'}</dd></div>
        </dl>
      </div>
      <div class="t-stub">
        <div class="barcode"></div>
        <small>${tk.flightNo} · ${tk.seat}</small>
      </div>`;
    $('#btn-board').textContent = `${t.board} ${t.icon}`;
    $('#btn-board').disabled = false;
    $('#btn-ticket-back').textContent = tk.fare ? `표 취소하고 다시 계획하기 (🪙 ${tk.fare} 환불)` : '계획 다시 세우기';
  }

  function board() {
    const tk = state.ticket;
    if (!tk) return;
    if (state.lecture) return toast('우왕이가 수업 중이에요. 수업이 끝나면 떠나요 📚');
    if (state.study) return toast('우왕이가 공부 중이에요. 공부가 끝나면 떠나요 ✏️');
    $('#btn-board').disabled = true;
    Sound.sfx('tear');
    $('#ticket').classList.add('torn');
    setTimeout(() => {
      state.flight = {
        mode: tk.mode,
        transport: tk.transport,
        from: tk.from,
        fromCode: tk.fromCode,
        toCode: tk.toCode,
        destId: tk.destId,
        start: Date.now(),
        duration: tk.seconds * 1000,
        elapsed: 0,
        flightNo: tk.flightNo,
        seat: tk.seat,
        seatClass: tk.seatClass,
        fare: tk.fare,
      };
      state.ticket = null;
      saveState();
      if (tk.mode === 'normal' && !Sound.isOn('cabin')) Sound.toggle('cabin');
      render();
    }, 900);
  }

  // ---------- 이동 중 ----------
  function elapsedOf(f) {
    return f.mode === 'focus' ? f.elapsed || 0 : Date.now() - f.start;
  }

  // 시간이 다 됐어도 방송을 읽는 중이면 다 읽을 때까지 도착을 미룬다
  function isDone() {
    const f = state.flight;
    if (!f || elapsedOf(f) < f.duration) return false;
    return f.mode === 'focus' || Date.now() >= voiceUntil;
  }

  // 방송을 읽는 데 걸릴 대략적인 시간(ms). 방송 시각을 정할 때만 쓰고, 실제 도착은 다 읽은 뒤에 한다
  function speechMs(text) {
    return VOICE_DELAY + 1500 + text.length * 150;
  }

  function playVoice(f, text) {
    const token = ++voiceToken;
    voiceUntil = Date.now() + speechMs(text) * 2 + 5000; // 음성 끝 신호가 안 오는 브라우저를 위한 최대 대기
    const done = () => { if (token === voiceToken) voiceUntil = 0; };
    setTimeout(() => {
      if (token !== voiceToken || !state.voiceOn || !state.flight || state.flight.start !== f.start) return done();
      if (!Sound.speak(text, done)) done();
    }, VOICE_DELAY);
  }

  function syncSoundButtons() {
    document.querySelectorAll('[data-sound]').forEach((b) => b.classList.toggle('on', Sound.isOn(b.dataset.sound)));
    $('#btn-voice').classList.toggle('on', state.voiceOn);
  }

  // 방송 목록. time: 출발 후 몇 ms에 나오는지, voice: 음성으로 읽을지
  function announcements(f) {
    const d = destById(f.destId);
    const tr = f.transport || 'plane';
    const total = f.duration;
    const landIn = total >= 5 * 60000 ? '약 1분 후' : '잠시 후';
    const plane = tr === 'plane';
    const start = {
      plane: '이륙합니다! 좌석벨트를 매 주세요 💺',
      ktx: '열차가 출발합니다! 창밖 풍경이 빠르게 지나가요 🚄',
      bus: '버스가 출발합니다! 안전벨트를 매 주세요 💺',
      ship: '배가 출항합니다! 뱃고동 소리가 들려요 ⛴️',
    }[tr];
    const snack = {
      plane: '기내식이 나왔어요! 우왕이가 맛있게 먹었어요 🍱',
      ktx: '간식 카트가 지나가요! 우왕이가 바나나우유를 샀어요 🍼',
      bus: '휴게소에 잠깐 들렀어요! 우왕이가 호두과자를 먹었어요 🥜',
      ship: '갑판에 나가 시원한 바닷바람을 쐬었어요 🌬️',
    }[tr];
    const welcome = {
      time: Math.min(10000, total * 0.3),
      voice: true,
      notice: `${d.name}행 환영 방송`,
      text: `승객 여러분, 안녕하십니까. ${COMPANY_KO[tr]} ${f.flightNo}${plane ? '편' : ''} ${d.name}행에 탑승해 주셔서 감사합니다. `
        + `목적지까지 걸리는 시간은 ${durationText(Math.round(total / 1000))}입니다. 편안한 여행 되십시오.`,
    };
    const landText = plane
      ? `승객 여러분, 우리 비행기는 ${landIn} ${d.name} 공항에 착륙하겠습니다. 좌석 등받이와 테이블을 제자리로 해 주시고, 좌석벨트를 매 주시기 바랍니다.`
      : `승객 여러분, ${landIn} ${d.name}에 도착합니다. 내리실 때 두고 내리는 물건이 없는지 확인해 주시기 바랍니다.`;
    // 도착 방송은 도착 전에 다 읽을 수 있게 시작한다 (5분 이상이면 1분 전)
    const land = {
      time: total >= 5 * 60000 ? total - 60000 : Math.max(1000, total - speechMs(landText) - VOICE_GAP),
      voice: true,
      notice: `${landIn} ${d.name}에 도착해요`,
      text: landText,
    };
    const list = [{ time: 0, text: start }];
    // 환영 방송이 도착 방송 전에 끝나지 못할 만큼 짧은 여행이면 환영 방송을 뺀다 (방송이 서로 끊기지 않게)
    if (welcome.time + speechMs(welcome.text) + VOICE_GAP <= land.time) list.push(welcome);
    // 2분보다 짧은 여행은 간식·조명 안내도 뺀다
    if (total >= 2 * 60000) {
      list.push({ time: total * 0.35, text: snack });
      list.push({ time: total * 0.6, text: plane ? '기내 조명이 어두워졌어요. 음악을 켜고 쉬어 볼까요? 🎵' : '창밖 풍경을 보며 음악을 들어 볼까요? 🎵' });
    }
    list.push(land);
    return list.sort((a, b) => a.time - b.time);
  }

  function renderFlight() {
    const f = state.flight;
    const tr = f.transport || 'plane';
    const t = TRANSPORTS[tr];
    const focus = f.mode === 'focus';
    if (sceneFor !== f.start) {
      Sky.build($('#window'), $('#sky'), tr);
      sceneFor = f.start;
    }
    $('#from-code').textContent = f.fromCode || 'ICN';
    $('#to-code').textContent = f.toCode || destById(f.destId).code;
    $('#plane').textContent = t.icon;
    $('#eta').textContent = `${f.flightNo} · 좌석 ${f.seat} · ${clockText(f.start + f.duration)} 도착 예정`;
    $('#noise-label').textContent = t.noise;
    $('#voice-label').textContent = t.voice;
    $('#focus-panel').hidden = !focus;
    $('#announce').hidden = focus;
    $('#sound-panel').hidden = focus;
    $('#eta').hidden = focus;
    $('#flight-note').textContent = focus
      ? '화면을 벗어나면 타이머가 멈춰요. 집중한 시간은 그만둬도 기록돼요.'
      : '다른 탭을 쓰거나 앱을 닫아도 시간은 계속 흘러가요.';
    const mini = $('#mascot-flight');
    mountMascot(mini, state.pet.stage === 'egg' ? 'baby' : state.pet.stage);
    setMascot(mini, { mood: 'happy' });
    dressMascot(mini);
    cancelArmed = false;
    $('#btn-cancel-flight').textContent = cancelLabel();
    syncSoundButtons();
    tick();
  }

  function cancelLabel() {
    const f = state.flight;
    if (!f) return '';
    if (f.mode === 'focus') return '그만하기';
    return (f.transport || 'plane') === 'plane' ? '회항하기 (여행 취소)' : '여행 취소하기';
  }

  // 집중 모드에서 멈춤/집중 표시만 바로 바꾼다 (focus.js가 부른다)
  function renderFocusState() {
    const f = state.flight;
    if (!f || f.mode !== 'focus' || $('#travel-flight').hidden) return;
    const paused = Focus.isPaused();
    const badge = $('#focus-badge');
    badge.textContent = paused ? '⏸️ 멈춤 · 화면으로 돌아오면 이어서 흘러요' : '📚 집중 중';
    badge.classList.toggle('paused', paused);
    $('#focus-elapsed').textContent = Focus.durationLabel(Math.floor((f.elapsed || 0) / 1000));
  }

  // 1초마다 app.js에서 부른다. 일반 여행의 방송은 다른 탭에 있어도 나온다.
  function tick() {
    const f = state.flight;
    if (!f) return;
    const elapsed = elapsedOf(f);

    if (f.mode !== 'focus') {
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
          if (a.voice && state.voiceOn) playVoice(f, a.text);
          if (a.notice && $('#travel-flight').hidden) toast(`📢 방송: ${a.notice}`);
        }
      }
    }

    if ($('#travel-flight').hidden) return;
    Sky.update($('#sky'));
    const progress = Math.min(1, elapsed / f.duration);
    $('#countdown').textContent = formatClock(Math.max(0, Math.ceil((f.duration - elapsed) / 1000)));
    $('#track-fill').style.width = `${progress * 100}%`;
    $('#plane').style.left = `${progress * 100}%`;
    renderFocusState();
  }

  function cancelFlight() {
    const btn = $('#btn-cancel-flight');
    const f = state.flight;
    const focus = f.mode === 'focus';
    if (!cancelArmed) {
      cancelArmed = true;
      btn.textContent = focus
        ? '정말 그만할까요? 한 번 더 누르면 그만둬요 (집중한 시간은 기록돼요)'
        : '정말 취소할까요? 한 번 더 누르면 출발지로 돌아와요 (요금은 돌려받지 못해요)';
      setTimeout(() => {
        cancelArmed = false;
        if (state.flight) btn.textContent = cancelLabel();
      }, 3000);
      return;
    }
    cancelArmed = false;
    let message = '여행을 취소했어요. 다음에 다시 떠나요!';
    if (focus) {
      const seconds = Math.floor((f.elapsed || 0) / 1000);
      const earned = Focus.addTime(seconds);
      message = `📚 ${Focus.durationLabel(seconds)} 집중했어요! 수고했어요`;
      if (earned.length) message += ` · 새 코스튬 ${earned.map((c) => c.emoji).join('')}`;
    }
    state.flight = null;
    saveState();
    Sound.stopAll();
    Sound.stopSpeaking();
    toast(message);
    render();
  }

  // 시간이 다 되면 app.js가 부른다 (일반 여행은 다른 탭에 있어도)
  function completeFlight() {
    const f = state.flight;
    const d = destById(f.destId);
    const newSouvenir = !state.souvenirs.includes(d.id);
    const newOutfit = !state.outfits.includes(d.id);
    state.visited[d.id] = (state.visited[d.id] || 0) + 1;
    state.trips++;
    if (newSouvenir) state.souvenirs.push(d.id);
    // 새 기념품은 방에 빈 장식 자리가 있으면 바로 꾸며 둔다 (자리 6곳: pet.js DECOR_SLOTS)
    let decorPlaced = false;
    if (newSouvenir) {
      const decor = Array.from({ length: 6 }, (_, i) => state.decor[i] || null);
      const free = decor.indexOf(null);
      if (free >= 0) { decor[free] = d.id; state.decor = decor; decorPlaced = true; }
    }
    if (newOutfit) state.outfits.push(d.id);
    let focusSeconds = 0;
    let costumes = [];
    if (f.mode === 'focus') {
      focusSeconds = Math.floor(f.duration / 1000);
      costumes = Focus.addTime(focusSeconds).map((c) => c.id);
    }
    state.flight = null;
    state.arrival = { destId: d.id, newSouvenir, newOutfit, focusSeconds, costumes, decorPlaced };
    addHearts('happy', 1);
    rewardExp(30);
    saveState();
    Sound.stopAll();
    Sound.sfx('ding');
    toast(`${TRANSPORTS[f.transport || 'plane'].icon} ${d.name}에 도착했어요! 여행 탭에서 확인해 보세요`);
    if (!$('#screen-travel').hidden) render();
  }

  // ---------- 도착 ----------
  function renderArrival() {
    const a = state.arrival;
    const d = destById(a.destId);
    $('#arrival-hero').style.background = d.sky;
    $('#arrival-scene').textContent = d.scene;
    $('#arrival-title').textContent = `${d.name} 도착!`;
    $('#arrival-stamp').textContent = d.code;
    const chips = ['✨ 경험치 +30', '💗 행복 +1'].map((t) => `<span class="chip">${t}</span>`);
    if (a.focusSeconds) chips.push(`<span class="chip">📚 집중 ${Focus.durationLabel(a.focusSeconds)}</span>`);
    if (a.newSouvenir) chips.push(`<span class="chip new">🎁 새 기념품: ${d.souvenir.emoji} ${d.souvenir.name}${a.decorPlaced ? ' (우왕이 방에 장식했어요)' : ' (방 꾸미기에서 장식해 보세요)'}</span>`);
    if (a.newOutfit) chips.push(`<span class="chip new">👗 새 의상: ${d.outfit.emoji} ${d.outfit.name} (옷장에서 입혀 보세요)</span>`);
    (a.costumes || []).forEach((id) => {
      const c = OUTFITS[id];
      chips.push(`<span class="chip new">🎓 공부 코스튬: ${c.emoji} ${c.name} (집중 ${c.hours}시간 달성!)</span>`);
    });
    $('#arrival-reward').innerHTML = chips.join('');
    $('#btn-arrival-tips').textContent = `💬 ${d.name} 꿀팁 보러 가기`;
  }

  function finishArrival() {
    state.arrival = null;
    saveState();
  }

  function reset() {
    sceneFor = null;
    seatKey = '';
    planTripKey = '';
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

  return { init, render, tick, isDone, completeFlight, renderFocusState, reset };
})();

function formatClock(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}
