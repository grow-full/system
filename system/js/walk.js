// 산책: 구글 스트리트 뷰 위에서 우왕이가 돌아다닌다.
// 우왕이는 화면이 아니라 "장소 안의 방향(heading)"에 서 있어서,
// 사용자가 화면을 돌리면 우왕이도 반대쪽으로 밀려나 그 자리에 있는 것처럼 보인다.
const Walk = (() => {
  const FOOT_AT = 0.68;       // 우왕이 발 높이 (화면 위에서부터 비율, 0.5가 한가운데)
  const BASE_SIZE = 150;      // zoom 1일 때 우왕이 크기(px)
  const PHRASES = ['여기 공기가 좋아요 🌿', '저기도 가 볼까요?', '산책 최고예요 ♪', '두리번두리번 👀'];

  let view, overlay, walker, mascot, speech, hint, notice;
  let pano = null;
  let loading = false;
  let mountedStage = null;
  let heading = 0;            // 우왕이가 지금 서 있는 방향
  let target = 0;             // 우왕이가 걸어가는 방향
  let lastMove = 0;
  let speechUntil = 0;
  let frame = 0;
  let service = null;         // 근처 스트리트 뷰 사진 찾기
  let spherical = null;       // 위도·경도 거리/방향 계산
  let traveling = false;      // 다음 장소를 찾는 중
  const HORIZON_AT = 0.5;     // 우왕이가 멀어질 때 다가가는 수평선 높이 (화면 위에서부터 비율)
  let depth = 0;              // 0: 바로 앞, 1: 저 멀리
  let walkingAway = false;    // 장소 바로 가기로 걸어가는 중
  let fade = null;
  let startId = null;         // 처음 연 장소 (다시 하기 때 돌아갈 곳)

  // 장소 이름을 바꾸면 이미 받은 도장도 새 이름으로 옮긴다 (예전 이름: 새 이름)
  const RENAMED_PLACES = { '개신문화관': '개신문화관&중앙도서관', '개신문화관 뒷문': '사범대 가는길', '자연대': '자연과학대학' };
  function migrateStampNames() {
    let changed = false;
    for (const [from, to] of Object.entries(RENAMED_PLACES)) {
      if (state.walkStamps[from] && !state.walkStamps[to]) {
        state.walkStamps[to] = state.walkStamps[from];
        changed = true;
      }
      if (state.walkStamps[from]) { delete state.walkStamps[from]; changed = true; }
    }
    if (changed) saveState();
  }

  function init() {
    migrateStampNames();
    // 없어진 옷(예: 빠진 기본 옷)을 입고 있었다면 벗긴다
    Object.keys(state.equipped).forEach((slot) => { if (state.equipped[slot] && !OUTFITS[state.equipped[slot]]) state.equipped[slot] = null; });
    view = $('#walk-view');
    overlay = $('#walk-overlay');
    walker = $('#walk-walker');
    mascot = $('#walk-mascot');
    speech = $('#walk-speech');
    hint = $('#walk-hint');
    notice = $('#walk-notice');
    fade = $('#walk-fade');
    mascot.addEventListener('click', tap);
    $('#walk-hooves').addEventListener('click', (e) => { if (e.target.closest('.walk-hoof')) tap(); });
    $('#walk-view-toggle').addEventListener('click', toggleView);
    applyView();
    overlay.addEventListener('click', onViewClick);
    $('#walk-friend').addEventListener('click', () => { if (canWalk()) greet(); });
    document.addEventListener('keydown', onKey);
    document.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', () => held.clear());   // 창을 벗어나면 누르고 있던 키를 놓은 것으로 본다
    // 우왕이가 화면 밖에 있을 때 뜨는 안내를 누르면 화면이 우왕이 쪽으로 돈다
    $('#walk-hint').addEventListener('click', () => turnTo(heading));
    $('#btn-walk-start').addEventListener('click', startWalk);
    $('#btn-walk-end').addEventListener('click', endWalk);
    $('#btn-walk-music').addEventListener('click', toggleMusic);
    $('#btn-walk-headset').addEventListener('click', toggleHeadset);
    $('#btn-walk-drink').addEventListener('click', drink);
    $('#walk-gift').addEventListener('click', openGift);
    $('#gift-reveal-ok').addEventListener('click', closeReveal);
    $('#btn-friend-claim').addEventListener('click', claimFriendReward);
    $('#walk-note-save').addEventListener('click', saveNote);
    $('#walk-log-prev').addEventListener('click', () => { logPage--; renderWalkLog(); });
    $('#walk-log-next').addEventListener('click', () => { logPage++; renderWalkLog(); });
    $('#btn-summary-booth').addEventListener('click', openBooth);
    $('#btn-summary-ask').addEventListener('click', askUwangAboutWalk);
    $('#booth-again').addEventListener('click', openBooth);
    $('#booth-close').addEventListener('click', () => { $('#booth').hidden = true; });
    $('#walk-note-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') saveNote(); });
    $('#walk-note-close').addEventListener('click', () => { $('#walk-note-msg-box').hidden = true; });
    $('#walk-talk-btn').addEventListener('click', talkFriend);
    $('#walk-cafe-btn').addEventListener('click', restAtCafe);
    $('#cafe-stand').addEventListener('click', standUpCafe);
    $('#guide-next').addEventListener('click', nextGuide);
    $('#guide-skip').addEventListener('click', closeGuide);
    $('#walk-quests').addEventListener('click', (e) => {
      const b = e.target.closest('[data-claim]');
      if (b) claimQuest(b.dataset.claim);
    });
    $('#btn-walk-next').addEventListener('click', () => { if (!blockReason()) setStep('pick'); });
    $('#btn-walk-back').addEventListener('click', () => setStep('check'));
    document.querySelectorAll('[data-setup]').forEach((b) => b.addEventListener('click', () => setSetupTab(b.dataset.setup)));
    $('#btn-walk-random').addEventListener('click', randomOutfit);
    $('#wd-list').addEventListener('click', (e) => {
      const b = e.target.closest('[data-dress]');
      if (b) dressUp(b.dataset.dress);
    });
    $('#wc-places').addEventListener('click', (e) => {
      const b = e.target.closest('[data-start]');
      if (b) { chosenName = b.dataset.start; renderPick(); }
    });
    $('#btn-walk-care').addEventListener('click', () => window.show('pet'));   // 앱의 탭 전환 (app.js)
    $('#walk-places').addEventListener('click', (e) => {
      const b = e.target.closest('[data-place]');
      if (b) goTo(Number(b.dataset.place));
    });
    $('#walk-nav').addEventListener('click', (e) => {
      const b = e.target.closest('[data-nav]');
      if (b && !b.disabled) setNav(b.dataset.nav);
    });
    setNav('map');
    $('#walk-arrows').addEventListener('click', (e) => {
      const b = e.target.closest('.walk-arrow');
      if (b && arrowItems[Number(b.dataset.i)]) walkAlongArrow(arrowItems[Number(b.dataset.i)], b);
    });
    $('#btn-summary-again').addEventListener('click', () => setStep('check'));
    $('#btn-summary-pet').addEventListener('click', () => window.show('pet'));
    setInterval(tick, 1000);
  }

  // ---------- 장소 이름 ----------
  // 같은 장소라도 ID가 'CAoS…'(API용)와 'CIHM…'(지도 주소용) 두 모양으로 쓰여서 하나로 맞춘다.
  // 'CAoS…'는 안쪽 ID를 감싼 base64라 풀어서 안쪽 ID를 꺼낸다.
  function plainId(id) {
    if (!id || !id.startsWith('CAoS')) return id;
    try {
      const raw = atob(id.replace(/\./g, '=').replace(/-/g, '+').replace(/_/g, '/'));
      const len = raw.charCodeAt(3);
      return raw.slice(4, 4 + len) || id;
    } catch (e) {
      return id;
    }
  }

  // 이름표에 없는 사진은 가장 가까운 이름 있는 장소를 따서 "○○ 근처"라고 부른다.
  // 구글 설명은 쓰지 않는다 (사진을 올린 사람 이름이 들어 있을 때가 있어서).
  const NEAR_METERS = 150;   // 이보다 멀면 "캠퍼스 어딘가"

  function exactName() {
    const id = plainId(pano.getPano());
    const names = typeof WALK_PLACES === 'undefined' ? {} : WALK_PLACES;
    for (const key in names) if (plainId(key) === id) return names[key];
    return '';
  }

  function nearName() {
    if (!pano || !places.length || !spherical) return '';
    let best = null;
    for (const p of places) {
      const s = nearestSpot(p);
      if (s && (!best || s.meters < best.meters)) best = { name: p.name, meters: s.meters };
    }
    return best && best.meters <= NEAR_METERS ? best.name : '';
  }

  // 감상, 배경음, 아이콘을 고를 때 쓰는 이름 (근처 장소면 그 장소 것을 빌려 쓴다)
  function moodName() {
    return exactName() || nearName();
  }

  function placeName() {
    const exact = exactName();
    if (exact) return exact;
    const near = nearName();
    return near ? `${near} 근처` : '캠퍼스 어딘가';
  }

  // 지금 장소에 대한 우왕이의 감상 하나 (바로 전에 한 말은 피한다)
  let lastComment = '';
  let idleSpeech = false;     // 지금 말풍선이 가만히 있을 때 한 혼잣말인지 (걸으면 바로 바꾼다)
  // 장소와 상관없이 가끔 나오는 말: 주변 구경, 우왕이의 상태(걸은 양·행복·배고픔·산책 시간)에 따라 고른다
  const GENERIC_LINES = [
    '사람들이 지나가요 👀', '새 소리가 들려요 🐦', '저 나무 좀 봐요 🌳', '바람이 살랑살랑 🍃',
    '오늘 산책 기분 좋아요 😊', '누가 나를 봤을까요? 😳', '여기 사진 찍기 좋아요 📷', '발바닥이 간지러워요 🐾',
    '좋은 하루예요 ✨', '저 구름 모양 보세요, 꼭 뭐 같아요 ☁️',
  ];

  function moodPool() {
    const pool = GENERIC_LINES.slice();
    const pet = state.pet;
    if (steps >= 300) pool.push('다리가 조금 뻐근해요 😅', '걸음이 차곡차곡 쌓이고 있어요! 👣');
    if (walkSeconds >= 600) pool.push('벌써 10분이나 걸었어요! ⏱️');
    if (pet.happy >= 4) pool.push('오늘 기분 최고예요 💗', '산책하니까 신나요!');
    if (pet.hunger <= 1) pool.push('배가 살짝 고파요… 🍙');
    return pool;
  }

  function placeComment() {
    const all = typeof WALK_COMMENTS === 'undefined' ? {} : WALK_COMMENTS;
    const fallback = typeof WALK_COMMENTS_DEFAULT === 'undefined' ? PHRASES : WALK_COMMENTS_DEFAULT;
    const timely = inWalk ? timeComment() : '';
    if (timely && timely !== lastComment) { lastComment = timely; return timely; }
    if (inWalk && Math.random() < 0.3) {
      const pool = moodPool().filter((l) => l !== lastComment);
      lastComment = pool[Math.floor(Math.random() * pool.length)];
      return lastComment;
    }
    const lines = (pano && all[moodName()]) || fallback;
    const choices = lines.length > 1 ? lines.filter((l) => l !== lastComment) : lines;
    lastComment = choices[Math.floor(Math.random() * choices.length)];
    return lastComment;
  }

  function renderPlace() {
    const el = $('#walk-place');
    el.hidden = !pano || pano.getStatus() !== 'OK';
    if (!el.hidden) el.textContent = `📍 ${placeName()}`;
  }

  // ---------- 장소 바로 가기 ----------
  // WALK_PLACES에 이름을 붙인 장소를 버튼으로 보여 주고, 누르면 우왕이가 그곳까지 걸어간다.
  // 같은 이름이 여러 장이면(예: 정문 2장) 하나의 버튼으로 묶고, 지금 자리에서 가까운 사진으로 간다.
  let places = [];           // [{ name, spots: [{ id, latLng }] }]

  // 'CIHM…' 모양을 API가 쓰는 'CAoS…' 모양으로 감싼다 (plainId의 반대)
  function apiId(id) {
    if (!id || id.startsWith('CAoS')) return id;
    const raw = String.fromCharCode(0x08, 0x0a, 0x12, id.length) + id;
    return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '.');
  }

  function lookup(id) {
    return new Promise((resolve) => {
      const tryIds = [apiId(id), id];
      const next = () => {
        const pid = tryIds.shift();
        if (!pid) { resolve(null); return; }
        service.getPanorama({ pano: pid }, (data, status) => {
          if (status === 'OK' && data) resolve({ id: data.location.pano, latLng: data.location.latLng, blocked: isBlocked(data) });
          else next();
        });
      };
      next();
    });
  }

  async function loadPlaces() {
    const names = typeof WALK_PLACES === 'undefined' ? {} : WALK_PLACES;
    const byName = new Map();
    for (const id in names) {
      if (!byName.has(names[id])) byName.set(names[id], []);
      byName.get(names[id]).push(id);
    }
    places = [...byName].map(([name, ids]) => ({ name, ids, spots: [] }));
    renderPlaces();
    await Promise.all(places.map(async (p) => {
      const found = (await Promise.all(p.ids.map(lookup))).filter(Boolean);
      p.spots = found.filter((s) => !s.blocked);
      p.hidden = found.length > 0 && p.spots.length === 0;   // 사진이 모두 뺀 사람 것이면 버튼을 숨긴다
    }));
    places = places.filter((p) => !p.hidden);
    renderPlaces();
    renderPick();   // 불러온 위치로 약도를 다시 그린다
    await leaveBlockedStart();
    initMinimap();
    renderStamps();   // 뺀 사람 사진을 거른 뒤의 장소 목록으로 다시 그린다
    renderPlace();    // 이름표 없는 곳이면 "○○ 근처"로 다시 쓴다
    updateMusic();
  }

  // ---------- 지도 / 목록 바꿔 보기 ----------
  // 지도가 준비되기 전(또는 못 불러오면)에는 목록으로 보여 준다
  let navView = 'map';
  let mapReady = false;

  function setNav(view) {
    navView = view;
    const show = mapReady ? view : 'list';
    $('#walk-minimap').hidden = show !== 'map';
    $('#walk-places').hidden = show !== 'list';
    $('#walk-nav-map').disabled = !mapReady;
    ['map', 'list'].forEach((v) => $(`#walk-nav-${v}`).setAttribute('aria-selected', show === v));
    $('#walk-nav-help').textContent = show === 'map'
      ? '📍를 누르면 우왕이가 그곳으로 걸어가요'
      : '가까운 순서예요. 누르면 우왕이가 걸어가요';
  }

  // ---------- 우왕이 위치 지도 ----------
  // 학교 지도 위에 우왕이(그림)가 지금 있는 곳과 장소(📍)들을 보여 준다. 📍를 누르면 그곳으로 걸어간다.
  let minimap = null;
  let meMarker = null;

  async function initMinimap() {
    if (minimap || !pano) return;
    const { Map: GoogleMap } = await google.maps.importLibrary('maps');
    const { AdvancedMarkerElement } = await google.maps.importLibrary('marker');
    mapReady = true;
    setNav(navView);
    minimap = new GoogleMap($('#walk-minimap'), {
      mapId: 'DEMO_MAP_ID',          // 그림 마커(AdvancedMarker)를 쓰려면 필요하다
      center: pano.getPosition(),
      zoom: 16,
      disableDefaultUI: true,
      zoomControl: true,
      clickableIcons: false,
      gestureHandling: 'cooperative',
    });

    // 장소 📍 (같은 이름이 여러 장이면 첫 사진 자리에)
    const bounds = new google.maps.LatLngBounds();
    places.forEach((p, i) => {
      if (!p.spots.length) return;
      const pos = p.spots[0].latLng;
      bounds.extend(pos);
      const el = document.createElement('button');
      el.className = 'map-pin';
      el.innerHTML = `<span>📍</span><b>${p.name}</b>`;
      el.title = `${p.name}(으)로 걸어가기`;
      new AdvancedMarkerElement({ map: minimap, position: pos, content: el });
      el.addEventListener('click', () => goTo(i));
    });

    // 우왕이 그림 (지금 성장 단계의 그림)
    const me = document.createElement('div');
    me.className = 'map-me';
    me.innerHTML = `<img src="${mapMeSrc()}" alt="우왕이">`;
    meMarker = new AdvancedMarkerElement({ map: minimap, position: pano.getPosition(), content: me, zIndex: 999 });

    // 처음에는 장소가 모두 보이게 맞춘다
    if (!bounds.isEmpty()) minimap.fitBounds(bounds, 24);
    updateMinimap();
  }

  // 지도 위 우왕이 그림: 성장 단계에 맞는 그림을 쓴다 (알 단계는 아기 그림)
  function mapMeSrc() {
    const stage = state.pet.stage;
    return `assets/uwang-${['baby', 'child', 'adult'].includes(stage) ? stage : 'baby'}.png`;
  }

  function updateMinimap() {
    if (!minimap || !meMarker || !pano) return;
    const pos = pano.getPosition();
    if (!pos) return;
    meMarker.position = pos;
    // 성장하면 지도 위 그림도 바꾼다
    const img = meMarker.content && meMarker.content.querySelector('img');
    if (img && img.getAttribute('src') !== mapMeSrc()) img.setAttribute('src', mapMeSrc());
    // 우왕이가 지도 밖으로 나가면 따라간다
    const view = minimap.getBounds();
    if (view && !view.contains(pos)) minimap.panTo(pos);
  }

  // ---------- 보여 주지 않을 사람의 사진 ----------
  // WALK_BLOCKED_PANOS에 있는 사진, 또는 저작권 표시(올린 사람 이름)에 WALK_BLOCKED_AUTHORS의 이름이 있는 사진은 뺀다
  function isBlocked(data) {
    const authors = typeof WALK_BLOCKED_AUTHORS === 'undefined' ? [] : WALK_BLOCKED_AUTHORS;
    const panos = typeof WALK_BLOCKED_PANOS === 'undefined' ? [] : WALK_BLOCKED_PANOS;
    const credit = (data && data.copyright) || '';
    return panos.includes(data && data.location && data.location.pano) || authors.some((name) => credit.includes(name));
  }

  // 지금(처음) 장소가 뺀 사람의 사진이면 가장 가까운 다른 장소로 옮긴다
  async function leaveBlockedStart() {
    const here = await lookup(pano.getPano());
    if (!here || !here.blocked) return;
    const next = places.map((p) => ({ p, spot: nearestSpot(p) })).filter((x) => x.spot)
      .sort((a, b) => a.spot.meters - b.spot.meters)[0];
    if (!next) {
      showNotice('보여 줄 수 있는 산책 장소가 없어요. js/maps-config.js의 장소 목록을 확인해 주세요.');
      return;
    }
    movePano(next.spot.id);
    startId = next.spot.id;   // 처음부터 다시 하기도 여기서 시작한다
    heading = target = pano.getPov().heading;
    depth = 0;
  }

  // 지금 자리에서 그 장소의 가장 가까운 사진과 거리
  function nearestSpot(p) {
    const here = pano && pano.getPosition();
    let best = null;
    for (const s of p.spots) {
      const meters = here ? spherical.computeDistanceBetween(here, s.latLng) : Infinity;
      if (!best || meters < best.meters) best = { ...s, meters };
    }
    return best;
  }

  function placeIcon(name) {
    const icons = typeof WALK_ICONS === 'undefined' ? {} : WALK_ICONS;
    return icons[name] || '📍';
  }

  function renderPlaces() {
    const box = $('#walk-places');
    if (!pano || !places.length) { box.parentElement.hidden = true; return; }
    box.parentElement.hidden = false;
    const hereId = plainId(pano.getPano());
    const list = places.map((p) => ({ p, spot: nearestSpot(p), here: p.ids.some((id) => plainId(id) === hereId) }));
    list.sort((a, b) => (a.here ? -1 : b.here ? 1 : (a.spot ? a.spot.meters : Infinity) - (b.spot ? b.spot.meters : Infinity)));
    box.innerHTML = list.map(({ p, spot, here }, i) => {
      const dist = here ? '여기' : !spot ? '…' : spot.meters >= 1000 ? `${(spot.meters / 1000).toFixed(1)}km` : `${Math.round(spot.meters)}m`;
      return `<button data-place="${places.indexOf(p)}" class="${here ? 'here' : ''}" ${here || !spot ? 'disabled' : ''}>`
        + `<span class="ico" aria-hidden="true">${placeIcon(p.name)}</span><b>${p.name}</b><small>${dist}</small></button>`;
    }).join('');
  }

  // 장소로 걸어가기도 같은 방식으로 감싼다 (오류가 나도 방향키가 막히지 않게)
  async function goTo(index) {
    const p = places[index];
    const spot = p && nearestSpot(p);
    if (!spot || traveling || !canWalk()) return;
    try {
      await goToInner(index, spot);
    } catch (e) {
      console.error('장소로 걷기 실패', e);
      traveling = false;
    }
  }

  async function goToInner(index, spot) {
    const p = places[index];
    traveling = true;
    const from = pano.getPosition();
    const bearing = from ? spherical.computeHeading(from, spot.latLng) : pano.getPov().heading;

    keyTurn = false;
    // 1) 갈 방향을 바라보고, 우왕이가 화면 한가운데에서 앞을 향해 선다
    pano.setPov({ heading: bearing, pitch: 0 });
    heading = target = bearing;
    setMascot(mascot, { look: '' });
    say(`${josa(p.name, '으로', '로')} 가요! 🐾`, 1400);
    await wait(700);

    // 2) 우왕이가 그 장소 안쪽(먼 곳)으로 걸어 들어간다. 멀리 갈수록 조금 더 오래 걷는다
    const walkMs = Math.min(3200, Math.max(1600, spot.meters * 12));
    walkingAway = true;
    await animate(walkMs, (t) => { depth = t; });

    // 3) 화면이 부드럽게 넘어가며 도착한 장소로 바뀐다
    await softSwitch(() => {
      movePano(spot.id);
      pano.setPov({ heading: bearing, pitch: 0 });
      heading = target = bearing;
    });

    // 4) 도착한 곳에서 우왕이가 저 앞에서 걸어 나와 원래 자리로 온다
    await animate(700, (t) => { depth = 0.45 * (1 - t); });
    walkingAway = false;
    depth = 0;

    lastMove = Date.now();
    addSteps(spot.meters);
    say(`${p.name}에 도착했어요! ${Math.round(spot.meters)}m 걸었어요`, 2400);
    setTimeout(() => say(placeComment(), 3200), 2400);   // 도착한 곳의 감상
    playMascot(mascot, 'joy', 600);
    traveling = false;
  }

  function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

  // 다른 사진으로 넘어갈 때: 하얗게 번쩍이지 않게, 사진만 크림색으로 살짝 덮이며 흐려졌다가(우왕이는 그 위에 그대로 보인다)
  // 새 사진을 불러오는 동안 잠깐 기다린 뒤 다시 또렷해진다. 화면이 갑자기 밝아지거나 휙 바뀌지 않아 멀미가 덜하다.
  const SOFT_MS = 420;
  async function softSwitch(doSwitch) {
    const stage = view.parentElement;
    stage.dataset.moving = 'true';
    fade.classList.add('on');
    await wait(SOFT_MS);
    doSwitch();
    await wait(SOFT_MS);
    fade.classList.remove('on');
    delete stage.dataset.moving;
  }

  // ms 동안 0→1로 부드럽게 움직이며 onFrame(t)를 부른다
  function animate(ms, onFrame) {
    return new Promise((resolve) => {
      const start = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - start) / ms);
        onFrame(t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);   // 천천히 시작해서 천천히 멈춘다
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
  }

  // ---------- 지도 불러오기 ----------
  function loadMaps() {
    if (pano || loading) return;
    if (typeof MAPS_API_KEY === 'undefined' || !MAPS_API_KEY) {
      showNotice('Google Maps API 키가 없어요. js/maps-key.js에 키가 들어 있는지 확인해 주세요.');
      return;
    }
    if (location.protocol === 'file:') {
      showNotice('지도는 파일을 더블클릭해서는 열리지 않아요. serve.ps1로 서버를 띄운 뒤 http://localhost:8000 으로 열어 주세요.');
      return;
    }
    loading = true;
    showNotice('지도를 불러오는 중이에요…');
    window.gm_authFailure = () => showNotice('API 키가 거부되었어요. 키의 웹사이트 제한에 지금 주소가 들어 있는지, Maps JavaScript API가 켜져 있는지 확인해 주세요.');
    window.__walkMapsReady = createPanorama;
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(MAPS_API_KEY)}&v=weekly&loading=async&callback=__walkMapsReady`;
    s.async = true;
    s.onerror = () => { loading = false; showNotice('지도를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.'); };
    document.head.appendChild(s);
  }

  async function createPanorama() {
    const { StreetViewPanorama, StreetViewService } = await google.maps.importLibrary('streetView');
    spherical = (await google.maps.importLibrary('geometry')).spherical;
    service = new StreetViewService();
    // 공유 링크의 파노라마 ID 끝에 붙는 '.'이 API에서는 다르게 쓰일 수 있어서 차례로 시도한다
    // 체크 화면에서 고른 장소에서 시작한다 (안 골랐으면 maps-config.js의 WALK_PANO_ID)
    const first = chosenStartId() || WALK_PANO_ID;
    const ids = [first, first.replace(/\.$/, '')].filter((v, i, a) => a.indexOf(v) === i);
    pano = new StreetViewPanorama(view, {
      keyboardShortcuts: false,   // 방향키는 우리가 직접 처리한다
      pano: ids[0],
      pov: { heading: 0, pitch: 0 },
      zoom: 1,
      addressControl: false,
      fullscreenControl: false,
      motionTracking: false,
      motionTrackingControl: false,
      showRoadLabels: false,
      // 구글이 그리는 바닥 화살표는 사진끼리 이어진 곳(25곳 중 2곳)에만 나와서 끄고, 우리 화살표를 어디서나 그린다
      linksControl: false,
      panControl: false,
      zoomControl: false,
      clickToGo: false,
    });
    let tried = 0;
    let started = false;
    pano.addListener('status_changed', () => {
      if (pano.getStatus() === 'OK') { if (!started) startId = pano.getPano(); started = true; hideNotice(); return; }
      if (started) return;   // 처음 장소를 연 뒤의 이동 실패는 go()에서 처리한다
      if (++tried < ids.length) pano.setPano(ids[tried]);
      else showNotice('이 장소의 스트리트 뷰를 찾지 못했어요. js/maps-config.js의 WALK_PANO_ID를 확인해 주세요.');
    });
    pano.addListener('pov_changed', place);
    pano.addListener('zoom_changed', place);
    pano.addListener('position_changed', () => { renderPlaces(); updateMinimap(); checkStamp(); onPanoMoved(); refreshArrows(); });
    heading = target = 0;
    loading = false;
    loadPlaces();
    loop();
  }

  // ---------- 방향키로 돌아다니기 ----------
  // 파란 점(사람들이 올린 360° 사진)은 서로 연결되어 있지 않아서,
  // 보고 있는 방향으로 조금씩 멀리 찾아보며 가장 가까운 사진으로 건너뛴다.
  const SEARCH_STEPS = [20, 40, 80, 150];   // 앞쪽으로 몇 m 지점에서 찾을지

  function findAhead(direction, spread = 50) {
    const from = pano.getPosition();
    const currentId = pano.getPano();
    let i = 0;
    return new Promise((resolve) => {
      if (!from) { resolve(null); return; }   // 아직 장소를 불러오는 중
      const next = () => {
        if (i >= SEARCH_STEPS.length) { resolve(null); return; }
        const dist = SEARCH_STEPS[i++];
        const spot = spherical.computeOffset(from, dist, direction);
        service.getPanorama({ location: spot, radius: dist * 0.7, preference: google.maps.StreetViewPreference.NEAREST }, (data, status) => {
          if (status !== 'OK' || !data || data.location.pano === currentId || isBlocked(data)) { next(); return; }
          // 보는 방향에서 너무 옆으로 벗어난 사진은 건너뛴다
          const bearing = spherical.computeHeading(from, data.location.latLng);
          if (Math.abs(wrap(bearing - direction)) > spread) { next(); return; }
          resolve({ id: data.location.pano, meters: Math.round(spherical.computeDistanceBetween(from, data.location.latLng)) });
        });
      };
      next();
    });
  }

  // 걷기가 중간에 오류로 끊겨도 '이동 중' 표시가 남아 방향키가 막히지 않게 감싼다
  async function go(backward = false) {
    if (!pano || !service || traveling || !canWalk()) return;
    try {
      await goInner(backward);
    } catch (e) {
      console.error('걷기 실패', e);
      traveling = false;
    }
  }

  async function goInner(backward = false) {
    const look = pano.getPov().heading;
    await walkDirection(backward ? wrap(look + 180) : look, look, backward);
  }

  // 한 걸음(다음 사진)씩 걸어간다. 스트리트 뷰처럼 화면이 우왕이를 따라간다.
  // 1) 우왕이가 앞으로 몇 걸음 걸어 나가고(뒤로 갈 때는 나에게 다가오고), 그동안 다음 사진을 찾는다
  // 2) 화면이 살짝 번지며 다음 사진으로 넘어가고 3) 우왕이가 다시 화면 가운데 제자리로 돌아온다
  // look: 도착해서 바라볼 방향
  const STEP_OUT_MS = 520;
  const STEP_IN_MS = 420;
  // known: 이미 찾아 둔 사진 { id, meters } (바닥 화살표)
  // slow: 천천히 걷기 (바닥 화살표) — 더 오래, 더 멀리 걸어 나가고, 걷는 동안 화면도 그쪽으로 천천히 돌며, 화면이 부드럽게 넘어간다
  async function walkDirection(direction, look, backward = false, known = null, slow = false) {
    traveling = true;
    walkingAway = true;
    const first = firstPerson();
    const d0 = first ? 0 : depth;   // 3인칭: 우왕이가 서 있던 거리에서 걸어 나간다
    // 걸어 나가는 곳 (+는 화면 안쪽, -는 나에게 다가옴)
    // 천천히 걸을 때(바닥 화살표) 앞쪽이면 지평선 가까이까지 길게 걸어간다
    const far = backward ? Math.max(MIN_DEPTH, d0 - (slow ? 0.8 : 0.5)) : slow ? MAX_DEPTH : Math.min(MAX_DEPTH, Math.max(d0, 0) + 0.45);
    // 걷는 시간: 천천히 걸을 때는 거리에 따라 2.6~4초
    const outMs = slow ? Math.min(4000, Math.max(2600, ((known && known.meters) || 60) * 30)) : STEP_OUT_MS;
    const inMs = slow ? 1300 : STEP_IN_MS;
    const pov0 = pano.getPov();
    const camTurn = slow && !backward ? wrap(look - pov0.heading) : 0;   // 걷는 동안 화면이 갈 쪽으로 돈다
    const rest = first ? 0 : Math.min(0.3, Math.max(-0.5, d0));   // 도착해서 돌아갈 자리
    let ended = false;
    if (slow) walker.dataset.stride = 'true';   // 성큼성큼 크게 걷는다 (CSS)
    try {
      setMascot(mascot, { look: '' });
      const search = known ? Promise.resolve(known) : findNext(direction);   // 길 찾기와 걷는 모습을 함께 시작한다
      // 3인칭: 앞으로 갈 때는 우왕이가 갈 쪽으로 몸을 틀며 걸어 나간다
      const h0 = heading;
      const turnBy = !first && !backward ? wrap(direction - h0) : 0;
      // 천천히 걸을 때: 처음 40%는 화살표 쪽으로 몸을 틀며 걸어가고(옆을 보며), 10%부터는 그 길을 따라 멀리 걸어 들어간다
      if (slow && Math.abs(turnBy) > 3) {
        setMascot(mascot, { look: turnBy < 0 ? 'left' : 'right' });
        lookUntil = Date.now() + outMs * 0.4;   // 도는 동안은 고개 방향을 그대로 둔다
      }
      let faced = false;
      await animate(outMs, (t) => {
        if (slow && !backward) {
          const turnT = Math.min(1, t / 0.4);
          const goT = Math.max(0, (t - 0.1) / 0.9);   // 거의 처음부터 앞으로 걸어 들어가며 점점 작아진다
          heading = wrap(h0 + turnBy * turnT);
          depth = d0 + (far - d0) * goT;
          if (!faced && turnT >= 1) { faced = true; setMascot(mascot, { look: '' }); }   // 다 돌았으면 앞(길)을 보고 걷는다
          if (camTurn) pano.setPov({ heading: wrap(pov0.heading + camTurn * Math.min(1, t / 0.5)), pitch: pov0.pitch });
        } else {
          depth = d0 + (far - d0) * t;
          if (turnBy) heading = wrap(h0 + turnBy * t);
          if (camTurn) pano.setPov({ heading: wrap(pov0.heading + camTurn * t), pitch: pov0.pitch });
        }
      });
      const found = await search;
      if (found) {
        await softSwitch(() => {
          movePano(found.id);
          pano.setPov({ heading: look, pitch: pano.getPov().pitch });
          target = look;
          if (first) heading = look;   // 3인칭 우왕이는 화면 속 자기 자리(방향)를 그대로 지킨다
        });
        // 화면이 따라와서 우왕이가 다시 가까워진다 (1인칭은 다가갔던 화면이 원래대로).
        // 천천히 걸을 때는 저 앞에서부터 걸어 나와 제자리로 온다
        const inFrom = first ? far : slow ? 0.75 : (d0 + far) / 2;
        await animate(inMs, (t) => { depth = inFrom + (rest - inFrom) * t; });
        ended = true;
        lastMove = Date.now();
        addSteps(found.meters);
        // 걸을 때마다 말하면 시끄러우니, 앞의 말이 끝났을 때만 이 장소의 감상을 말한다
        if (Date.now() > speechUntil || idleSpeech) say(placeComment(), 2600);
      } else {
        await animate(280, (t) => { depth = far + (d0 - far) * t; });
        ended = true;
        say('이쪽으로는 길이 없어요 🤔', 1800);
        playMascot(mascot, 'refuse', 600);
      }
    } finally {
      if (first || !ended) depth = rest;
      delete walker.dataset.stride;
      walkingAway = false;
      traveling = false;
    }
  }

  // 방향에 맞는 다음 사진: 먼저 길(링크) 중 누른 방향에 가장 가까운 것, 없으면 근처를 찾아본다
  async function findNext(direction) {
    const link = linkToward(direction);
    if (link) {
      const hit = await linkInfo(link.pano);
      if (hit) return hit;
    }
    return findAhead(direction, 70);
  }

  // 지금 사진에서 이어진 길 가운데 방향이 60도 안에서 가장 가까운 것
  function linkToward(direction) {
    const links = (pano.getLinks && pano.getLinks()) || [];
    let best = null;
    let bestDiff = 60;
    links.forEach((l) => {
      const d = Math.abs(wrap(Number(l.heading) - direction));
      if (d < bestDiff) { bestDiff = d; best = l; }
    });
    return best;
  }

  function linkInfo(id) {
    return new Promise((resolve) => {
      service.getPanorama({ pano: id }, (data, status) => {
        if (status !== 'OK' || !data || isBlocked(data)) { resolve(null); return; }
        const from = pano.getPosition();
        resolve({ id: data.location.pano, meters: from ? Math.round(spherical.computeDistanceBetween(from, data.location.latLng)) : 10 });
      });
    });
  }

  // ---------- 바닥 화살표로 걷기 (스트리트 뷰가 직접 옮겨 간다) ----------
  // 바닥의 길 화살표나 길 위를 누르면 스트리트 뷰가 그쪽 사진으로 옮겨 간다.
  // 그때 걸은 거리만큼 걸음을 세고, 산책에서 뺀 사진(실내·뺀 사람 사진)이거나 지금 걸을 수 없으면 원래 자리로 되돌아간다.
  let selfMoveUntil = 0;       // 이 시각까지의 이동은 우리가 옮긴 것 (걸음은 거기서 따로 센다)
  let lastSpot = null;         // 마지막으로 서 있던 사진 { id, pos }

  // 우리가 사진을 옮길 때는 이걸로 옮긴다
  function movePano(id) {
    selfMoveUntil = Date.now() + 2500;
    pano.setPano(id);
  }

  async function onPanoMoved() {
    if (!pano) return;
    const id = pano.getPano();
    const pos = pano.getPosition();
    if (!pos) return;
    const prev = lastSpot;
    lastSpot = { id, pos };
    if (!prev || prev.id === id || !inWalk || Date.now() < selfMoveUntil) return;   // 처음 연 곳이거나 우리가 옮긴 것
    if (!canWalk()) {
      say(state.pet.sick ? '아파서 걸을 수 없어요 🤒' : cafeSitting ? '카페에서 쉬는 중이에요' : '지금은 걸을 수 없어요', 1600);
      lastSpot = prev;
      movePano(prev.id);
      return;
    }
    const here = await lookup(id);
    if (here && here.blocked) {
      say('그쪽은 산책할 수 없는 곳이에요 🙅', 1800);
      lastSpot = prev;
      movePano(prev.id);
      return;
    }
    addSteps(Math.round(spherical.computeDistanceBetween(prev.pos, pos)));
    lastMove = Date.now();
    if (Date.now() > speechUntil || idleSpeech) say(placeComment(), 2600);
  }

  // ---------- 바닥 화살표 (스트리트 뷰처럼) ----------
  // 사진에 도착하면 주변 8방향과 이어진 길에서 다음 사진을 찾아, 갈 수 있는 쪽마다 바닥에 화살표를 그린다.
  // (캠퍼스 사진들은 서로 70~150m씩 떨어져 있어서, 70m 앞을 넓게 찾고 모자라면 130m 앞도 찾는다)
  // 화살표를 누르면 그쪽으로 걸어간다. 산책에서 뺀 사진(실내·뺀 사람 사진)은 화살표를 만들지 않는다.
  // 앞쪽 화살표는 그 길이 이어지는 방향의 바닥 위(발밑을 둘러싼 호)에 놓고 꺾쇠가 길을 따라 뻗어 나가는 쪽을 가리킨다.
  // 옆은 화면 양쪽 끝에, 뒤쪽은 화면 맨 아래 가운데에 놓는다.
  const PROBE_DIRS = 8;        // 찾아보는 방향 수
  const PROBE_RINGS = [[70, 65], [130, 110]];   // [이만큼(m) 앞에서, 이 반경 안을] 찾는다. 두 번째는 화살표가 3개보다 적을 때만
  const PROBE_ENOUGH = 3;
  const ARROW_MERGE = 30;      // 방향이 이만큼(도) 안으로 겹치면 가까운 사진 하나만 남긴다
  let arrowItems = [];         // [{ id, heading, meters }]
  let arrowToken = 0;          // 사진이 바뀌면 예전 결과는 버린다

  function panoData(request) {
    return new Promise((resolve) => service.getPanorama(request, (d, s) => resolve(s === 'OK' && d ? d : null)));
  }

  async function refreshArrows() {
    if (!pano || !service || !spherical) return;
    const from = pano.getPosition();
    if (!from) return;
    const token = ++arrowToken;
    arrowItems = [];
    renderArrows();
    const currentId = pano.getPano();
    const ring = ([dist, radius]) => [...Array(PROBE_DIRS)].map((_, i) => panoData({
      location: spherical.computeOffset(from, dist, (360 / PROBE_DIRS) * i),
      radius,
      preference: google.maps.StreetViewPreference.NEAREST,
    }));
    const links = ((pano.getLinks && pano.getLinks()) || []).map((l) => panoData({ pano: l.pano }));
    let found = await Promise.all([...ring(PROBE_RINGS[0]), ...links]);
    if (token !== arrowToken) return;   // 그사이 다른 사진으로 갔다
    const distinct = new Set(found.filter((d) => d && d.location.pano !== currentId).map((d) => d.location.pano));
    if (distinct.size < PROBE_ENOUGH) {
      found = found.concat(await Promise.all(ring(PROBE_RINGS[1])));
      if (token !== arrowToken) return;
    }
    const seen = new Set([currentId]);
    const items = [];
    for (const d of found) {
      if (!d || seen.has(d.location.pano) || isBlocked(d)) continue;
      seen.add(d.location.pano);
      const meters = Math.round(spherical.computeDistanceBetween(from, d.location.latLng));
      if (meters < 4) continue;   // 같은 자리에서 찍은 사진
      items.push({ id: d.location.pano, heading: spherical.computeHeading(from, d.location.latLng), meters });
    }
    // 비슷한 방향이면 가까운 사진 하나만
    items.sort((a, b) => a.meters - b.meters);
    arrowItems = items.filter((it, i) => !items.slice(0, i).some((o) => Math.abs(wrap(o.heading - it.heading)) < ARROW_MERGE));
    renderArrows();
  }

  function renderArrows() {
    $('#walk-arrows').innerHTML = arrowItems.map((it, i) =>
      `<button class="walk-arrow" type="button" data-i="${i}" title="이쪽으로 걷기 (${it.meters}m)" aria-label="이쪽으로 걷기 (${it.meters}m)">`
      + '<svg viewBox="-60 -30 120 60" aria-hidden="true"><g transform="scale(1 .46)">'
      + '<circle r="56" class="arrow-disc"/>'
      + '<path class="arrow-chev" d="M-24 12 L0 -14 L24 12 L15 19 L0 3 L-15 19 Z"/></g></svg></button>').join('');
    placeArrows();
  }

  // 매 프레임 (place에서): 화살표를 길 방향에 맞춰 바닥에 놓고, 화살표 모양(꺾쇠)도 그 방향으로 돌린다
  function placeArrows() {
    const box = $('#walk-arrows');
    const show = inWalk && !traveling && !walkingAway && canWalk() && !state.flight && arrowItems.length > 0;
    box.hidden = !show;
    if (!show) return;
    const pov = pano.getPov();
    const fov = 180 / 2 ** (pano.getZoom() || 1);
    const w = overlay.clientWidth;
    const h = overlay.clientHeight;
    const pxPerDeg = w / fov;
    const margin = 64;
    // 한 화면에 1~2개만: 보고 있는 쪽(앞 ±55°)에 있는 길 가운데 정면에 가까운 2개.
    // 앞쪽에 길이 없으면, 가장 덜 돌아도 되는 쪽 하나만 화면 끝(옆·뒤)에 보여 준다
    const FRONT_DEG = 55;
    const rels = arrowItems.map((it) => wrap(it.heading - pov.heading));   // 화면 정면에서 몇 도 옆인지
    const byFront = rels.map((rel, i) => ({ rel, i })).sort((a, b) => Math.abs(a.rel) - Math.abs(b.rel));
    const front = byFront.filter((r) => Math.abs(r.rel) <= FRONT_DEG).slice(0, 2).map((r) => r.i);
    const shown = new Set(front.length ? front : byFront.slice(0, 1).map((r) => r.i));
    const spots = arrowItems.map((it, i) => {
      const rel = rels[i];
      let kind = Math.abs(rel) <= FRONT_DEG ? 'front' : Math.abs(rel) >= 125 ? 'back' : rel < 0 ? 'left' : 'right';
      if (!shown.has(i)) kind = 'hide';
      let x = 0;
      let y = 0;
      let turn = rel;                  // 화면에서 꺾쇠가 가리킬 방향 (도, 위쪽이 0)
      if (kind === 'front') {
        // 앞쪽: 그 길이 이어지는 방향대로 바닥 위에 놓는다. 정면 길은 조금 더 멀리(위쪽), 비스듬한 길은 가까이(아래쪽)에 놓여
        // 화살표들이 발밑을 둘러싼 호를 이루고, 꺾쇠는 발밑에서 그 길을 따라 뻗어 나가는 쪽을 가리킨다
        x = Math.min(w - margin, Math.max(margin, w / 2 + rel * pxPerDeg));
        y = h * (0.96 - 0.2 * Math.cos((rel * Math.PI) / 180));
        turn = (Math.atan2(x - w / 2, h * 1.12 - y) * 180) / Math.PI;
      } else if (kind === 'left' || kind === 'right') {   // 옆쪽: 화면 양 끝, 옆을 가리킨다
        x = kind === 'left' ? margin : w - margin;
        y = h * 0.86;
      } else if (kind === 'back') {    // 뒤쪽: 화면 맨 아래 가운데 (1인칭 발굽 사이), 아래를 가리킨다
        x = w / 2;
        y = h * 0.94;
      }
      return { kind, rel, turn, x, y };
    });
    // 앞쪽 화살표끼리 겹치면 정면에서 먼 쪽을 조금 더 길 쪽(위)으로 민다
    const fronts = spots.filter((s) => s.kind === 'front').sort((a, b) => Math.abs(a.rel) - Math.abs(b.rel));
    for (let i = 1; i < fronts.length; i++) {
      const a = fronts[0];
      const b = fronts[i];
      if (Math.abs(b.x - a.x) < 120 && Math.abs(b.y - a.y) < 50) {
        b.y = a.y - 54;
        b.turn = (Math.atan2(b.x - w / 2, h * 1.12 - b.y) * 180) / Math.PI;
      }
    }
    [...box.children].forEach((el, i) => {
      const s = spots[i];
      if (!s) return;
      el.hidden = s.kind === 'hide';
      if (el.hidden) return;
      el.style.left = `${s.x}px`;
      el.style.top = `${s.y}px`;
      // 원판은 바닥에 누워 있어서 세로로 눌려 있다(0.46). 눌린 뒤에 화면에서 turn 방향이 되도록, 누르기 전 각도로 바꿔 돌린다
      const t = (s.turn * Math.PI) / 180;
      const ground = (Math.atan2(Math.sin(t), Math.cos(t) / 0.46) * 180) / Math.PI;
      el.querySelector('.arrow-chev').setAttribute('transform', `rotate(${ground.toFixed(1)})`);
    });
  }

  // 화살표를 누르면 그 사진으로 걸어간다 (앞·옆이면 그쪽을 바라보며, 뒤쪽이면 보던 쪽을 그대로 보며 물러난다)
  function walkAlongArrow(it, el) {
    if (!pano || traveling) return;
    if (!canWalk()) {
      say(state.pet.sick ? '아파서 걸을 수 없어요 🤒' : cafeSitting ? '카페에서 쉬는 중이에요' : '지금은 걸을 수 없어요', 1600);
      return;
    }
    const pov = pano.getPov();
    const backward = Math.abs(wrap(it.heading - pov.heading)) >= 125;
    lastMove = Date.now() + 4000;
    const fail = (e) => { console.error('걷기 실패', e); traveling = false; walkingAway = false; };
    // 3인칭 앞·옆 화살표: 우왕이가 화살표 자리까지 걸어가서 그 길로 걸어 들어간다
    if (!firstPerson() && !backward && el) {
      arrowWalkThird(it, arrowSpot(el)).catch(fail);
      return;
    }
    walkDirection(it.heading, backward ? pov.heading : it.heading, backward, { id: it.id, meters: it.meters }, true).catch(fail);
  }

  // 화살표가 놓인 바닥 자리를 우왕이 자리(방향 heading, 거리 depth)로 바꾼다 (우왕이 발이 화살표 위에 닿도록)
  function arrowSpot(el) {
    const box = overlay.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2 - box.left;
    const y = r.top + r.height / 2 - box.top;
    const fov = 180 / 2 ** (pano.getZoom() || 1);
    return {
      heading: wrap(pano.getPov().heading + (x - box.width / 2) / (box.width / fov)),
      depth: Math.min(MAX_DEPTH, Math.max(MIN_DEPTH, (FOOT_AT - y / box.height) / (FOOT_AT - HORIZON_AT))),
      px: Math.hypot(x - (box.width / 2 + wrap(heading - pano.getPov().heading) * (box.width / fov)), y - box.height * (FOOT_AT + (HORIZON_AT - FOOT_AT) * depth)),
    };
  }

  // 3인칭 바닥 화살표로 걷기
  // 1) 우왕이가 화살표가 놓인 바닥까지 걸어간다 (멀수록 오래)
  // 2) 화살표가 가리키는 길을 따라 화면 안쪽으로 걸어 들어간다. 화면도 그쪽으로 돌고, 걷는 도중에 부드럽게 다음 장소로 넘어간다
  // 3) 넘어간 뒤에도 몇 걸음 더 걷다가 제자리에 선다
  async function arrowWalkThird(it, spot) {
    traveling = true;
    walkingAway = true;
    walker.dataset.stride = 'true';
    const look = it.heading;
    try {
      // 1) 화살표 자리까지
      const h0 = heading;
      const d0 = depth;
      const toArrow = wrap(spot.heading - h0);
      const leg1 = Math.min(2500, Math.max(1000, spot.px * 5));
      if (Math.abs(toArrow) > 2) {
        setMascot(mascot, { look: toArrow < 0 ? 'left' : 'right' });
        lookUntil = Date.now() + leg1;
      }
      await animate(leg1, (t) => {
        heading = wrap(h0 + toArrow * t);
        depth = d0 + (spot.depth - d0) * t;
      });

      // 2) 길을 따라 걸어 들어가며 다음 장소로
      setMascot(mascot, { look: '' });
      lookUntil = 0;
      const pov0 = pano.getPov();
      const camTurn = wrap(look - pov0.heading);
      const h1 = heading;
      const d1 = depth;
      const alongPath = wrap(look - h1);
      const goFar = 0.55;
      const leg2 = 2800;
      let switched = false;
      const switching = (async () => {
        await wait(leg2 * 0.5);   // 화면이 그쪽으로 다 돌았을 때쯤 넘어가기 시작한다
        await softSwitch(() => {
          movePano(it.id);
          pano.setPov({ heading: look, pitch: pov0.pitch });
          target = look;
          switched = true;
        });
      })();
      await animate(leg2, (t) => {
        heading = wrap(h1 + alongPath * t);
        depth = d1 + (goFar - d1) * t;
        if (!switched) pano.setPov({ heading: wrap(pov0.heading + camTurn * Math.min(1, t / 0.45)), pitch: pov0.pitch });
      });
      await switching;

      // 3) 화면이 따라와서 우왕이가 다시 가까워지며 제자리에 선다
      const d2 = depth;
      await animate(900, (t) => { depth = d2 + (0.15 - d2) * t; });
      lastMove = Date.now();
      addSteps(it.meters);
      if (Date.now() > speechUntil || idleSpeech) say(placeComment(), 2600);
    } finally {
      delete walker.dataset.stride;
      walkingAway = false;
      traveling = false;
    }
  }

  const KEY_DIRS = { ArrowUp: 'forward', ArrowDown: 'back', ArrowLeft: 'left', ArrowRight: 'right' };

  function onKey(e) {
    if ($('#screen-walk').hidden || !pano || !inWalk || e.target.closest('input, textarea, select')) return;
    const dir = KEY_DIRS[e.key];
    if (!dir) return;
    e.preventDefault();   // 화면이 스크롤되지 않게
    // 3인칭 ↑/↓: 누르고 있는 동안 우왕이가 앞뒤로 걷는다 (키 반복은 무시). 나머지는 1인칭처럼
    if (!firstPerson() && (dir === 'forward' || dir === 'back')) {
      if (!e.repeat || !held.has(dir)) pressDir(dir);
      return;
    }
    nudge(dir, e.repeat);
  }

  function onKeyUp(e) {
    const dir = KEY_DIRS[e.key];
    if (dir) held.delete(dir);
  }

  // 화면 클릭으로 우왕이가 그 방향으로 걷게 한다
  function onViewClick(e) {
    if (!pano || !inWalk || !canWalk()) return;
    if ($('#screen-walk').hidden) return;
    if (e.target.closest('button, input, textarea, select, [data-claim], [data-dress], [data-start], [data-place], [data-nav], [data-i]')) return;
    const rect = overlay.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const W = overlay.clientWidth;
    const H = overlay.clientHeight;
    const pov = pano.getPov();
    const zoom = pano.getZoom() || 1;
    const fov = 180 / 2 ** zoom;
    const pxPerDeg = W / fov;
    const clickDeg = pov.heading + (x - W / 2) / pxPerDeg;
    if (firstPerson()) {
      turnTo(clickDeg);
    } else {
      const clickDepth = (y - H * HORIZON_AT) / (H * (FOOT_AT - HORIZON_AT));
      goal = { heading: wrap(clickDeg), depth: Math.min(MAX_DEPTH, Math.max(MIN_DEPTH, clickDepth)), idle: false };
      lastMove = Date.now() + 4000;
    }
  }

  // ---------- 방향키: 스트리트 뷰처럼 ----------
  // ←/→: 화면(시점)이 돌고 우왕이도 그쪽을 바라본다. 우왕이는 늘 화면 가운데에 있다.
  // ↑: 바라보는 쪽으로 한 걸음(다음 사진) 걸어간다. ↓: 바라보는 방향은 그대로 두고 뒤쪽 사진으로 물러난다.
  // 누르고 있으면 계속 돌거나 걷는다.
  const TURN_STEP = 20;        // ←/→ 한 번에 도는 각도
  const TURN_SPEED = 2.5;      // 한 프레임에 도는 최대 각도
  const TURN_LEAD_MAX = 40;    // 키를 계속 눌러도 화면보다 이만큼 이상 앞서 돌지 않는다 (키 반복이 빨라도 어지럽지 않게)
  let keyTurn = false;         // 키나 클릭으로 정한 방향(target)으로 화면을 돌리는 중
  let lookUntil = 0;           // 이 시각까지는 우왕이가 고개 돌린 방향을 유지한다

  // 화면을 그 방향으로 부드럽게 돌린다 (loop에서 돌린다)
  function turnTo(dir) {
    target = wrap(dir);
    keyTurn = true;
  }

  function nudge(dir) {
    if (!pano) return;
    if (!canWalk()) {   // 못 걷는 이유를 말해 준다 (알, 아픔, 카페)
      say(state.pet.sick ? '아파서 걸을 수 없어요 🤒' : cafeSitting ? '카페에서 쉬는 중이에요' : '지금은 걸을 수 없어요', 1600);
      return;
    }
    if (traveling) return;   // 한 걸음 걷는 중이면 끝날 때까지 기다린다 (누르고 있으면 끝난 뒤 이어서 걷는다)
    lastMove = Date.now() + 4000;   // 직접 움직이는 동안은 두리번거리지 않는다
    if (dir === 'left' || dir === 'right') {
      const now = pano.getPov().heading;
      let next = wrap((keyTurn ? target : now) + (dir === 'left' ? -TURN_STEP : TURN_STEP));
      const lead = wrap(next - now);
      if (Math.abs(lead) > TURN_LEAD_MAX) next = wrap(now + Math.sign(lead) * TURN_LEAD_MAX);
      turnTo(next);
      return;
    }
    go(dir === 'back');
  }

  // ---------- 3인칭: 시점은 1인칭처럼 돌리고, 우왕이는 자유롭게 걷는다 ----------
  // ←/→: 시점을 돌린다 (1인칭과 같다). 땅을 누르면 그쪽으로 돌아서 한 걸음 걸어간다.
  // ↑/↓: 누르고 있는 동안 우왕이가 사진 속에서 앞뒤로 걷는다 (↑ 멀어지며 작아짐, ↓ 다가오며 커짐).
  //      끝(지평선 / 화면 맨 아래)에 닿은 뒤에도 0.8초 더 누르고 있으면 화면이 따라 다음·뒤쪽 사진으로 넘어간다.
  // 우왕이는 화면 가운데에 묶여 있지 않다.
  //  - 시점을 돌려 우왕이가 화면 가장자리 쪽으로 밀려나면 화면 안쪽으로 걸어온다 (멀리 떨어지면 뛰어온다)
  //  - 가만히 있으면 화면 안에서 혼자 돌아다닌다
  const MAX_DEPTH = 0.95;           // 지평선 가까이
  const MIN_DEPTH = -1.7;           // 화면 맨 아래
  const WALK_SCREEN_SPEED = 0.36;   // 걷는 빠르기: 1초에 산책 화면 높이의 36%만큼 (옆·앞뒤 모두 화면에서 같은 빠르기)
  const COMPANION_ZONE = 0.32;      // 화면 가운데에서 시야의 이만큼 안이면 그대로 두고, 벗어나면 화면 안쪽으로 걸어온다
  const RUN_MAX = 4;                // 멀리 떨어지면 걷는 빠르기의 이만큼까지 뛰어온다
  const EDGE_HOLD = 0.8;            // 끝에 닿은 뒤 이만큼(초) 더 누르고 있으면 다음 사진으로 간다 (잠깐 눌러서는 넘어가지 않게)
  let goal = null;                  // 우왕이가 걸어갈 곳 { heading, depth, idle }
  const held = new Set();           // 누르고 있는 ↑/↓ ('forward' / 'back')
  let edgeTime = 0;                 // 끝에서 누르고 있던 시간
  let walkedMeters = 0;             // 걸음으로 바꾸기 전에 모아 둔 거리

  // 3인칭 ↑/↓를 누르기 시작했다
  function pressDir(dir) {
    if (!pano) return;
    if (!canWalk()) {
      say(state.pet.sick ? '아파서 걸을 수 없어요 🤒' : cafeSitting ? '카페에서 쉬는 중이에요' : '지금은 걸을 수 없어요', 1600);
      return;
    }
    held.add(dir);
    if (goal && goal.idle) goal = null;   // 혼자 돌아다니던 건 그만
    lastMove = Date.now() + 4000;
  }

  // 키나 클릭으로 정한 방향(target)으로 화면을 부드럽게 돌린다 (1인칭·3인칭 같다). 돌고 있으면 true
  function turnCamera() {
    if (!keyTurn) return false;
    const pov = pano.getPov();
    const diff = wrap(target - pov.heading);
    if (Math.abs(diff) > 0.3) {
      // 처음엔 빠르게, 다 와 갈수록 천천히 돈다
      const amount = Math.min(Math.abs(diff), TURN_SPEED, Math.max(0.6, Math.abs(diff) * 0.2));
      pano.setPov({ heading: wrap(pov.heading + Math.sign(diff) * amount), pitch: pov.pitch });
      return true;
    }
    pano.setPov({ heading: target, pitch: pov.pitch });
    keyTurn = false;
    return false;
  }

  // 매 프레임 (3인칭): 화면을 돌리고, 우왕이를 움직인다 (↑/↓ 앞뒤 걷기 + 화면 안쪽으로 따라오기). 움직였으면 true
  function stepThird(dt) {
    turnCamera();
    if (traveling || walkingAway || !canWalk()) { edgeTime = 0; return false; }
    const W = overlay.clientWidth;
    const H = overlay.clientHeight;
    const pov = pano.getPov();
    const fov = 180 / 2 ** (pano.getZoom() || 1);
    const speedPx = WALK_SCREEN_SPEED * H;
    const sideSpeed = speedPx / (W / fov);                       // 옆으로 (도/초)
    const depthSpeed = speedPx / ((FOOT_AT - HORIZON_AT) * H);   // 앞뒤로 (깊이/초)
    let moving = false;

    // ↑/↓를 누르고 있으면 우왕이가 앞뒤로 걷는다
    const dz = (held.has('forward') ? 1 : 0) - (held.has('back') ? 1 : 0);
    if (dz) {
      if (goal && goal.idle) goal = null;
      lastMove = Date.now() + 4000;
      const before = depth;
      depth = Math.min(MAX_DEPTH, Math.max(MIN_DEPTH, depth + dz * depthSpeed * dt));
      walkedMeters += Math.abs(depth - before) * 10.5;
      if (walkedMeters >= 2.1) { addSteps(walkedMeters); walkedMeters = 0; }
      moving = true;
      // 끝에 닿은 뒤에도 계속 누르고 있으면 화면이 따라 다음·뒤쪽 사진으로 넘어간다
      const atEdge = dz > 0 ? depth >= MAX_DEPTH - 1e-3 : depth <= MIN_DEPTH + 1e-3;
      if (atEdge) {
        // 끝에 막 닿았으면 더 누르고 있으면 넘어간다고 알려 준다
        if (edgeTime === 0) say(dz > 0 ? '계속 누르고 있으면 앞으로 더 가요 🐾' : '계속 누르고 있으면 뒤로 더 가요 🐾', 1400);
        edgeTime += dt;
        if (edgeTime >= EDGE_HOLD) { edgeTime = 0; walkOnward(dz > 0 ? 'forward' : 'back'); return true; }
      } else {
        edgeTime = 0;
      }
    } else {
      edgeTime = 0;
    }

    // 시점을 돌려 화면 가장자리 쪽으로 밀려났으면 화면 안쪽으로 걸어온다 (혼자 돌아다니던 중이어도)
    const off = wrap(heading - pov.heading);
    const zone = fov * COMPANION_ZONE;
    if (Math.abs(off) > zone && !(goal && !goal.idle)) {
      goal = { heading: wrap(pov.heading + Math.sign(off) * zone * 0.5), depth, idle: false };
    }
    if (goal) {
      // 멀리 떨어질수록 빨리 뛰어온다 (시점을 빨리 돌려도 따라올 수 있게). 혼자 돌아다닐 때는 천천히
      const run = goal.idle ? 0.6 : Math.min(RUN_MAX, 1 + Math.max(0, Math.abs(off) - zone) / 20);
      const sideStep = sideSpeed * run * dt;
      const depthStep = depthSpeed * Math.min(run, 1.5) * dt;
      const dh = wrap(goal.heading - heading);
      const dd = dz ? 0 : goal.depth - depth;   // ↑/↓로 걷는 중이면 거리는 그쪽을 따른다
      if (Math.abs(dh) <= sideStep && Math.abs(dd) <= depthStep) {   // 도착
        heading = wrap(goal.heading);
        if (!dz) depth = goal.depth;
        goal = null;
      } else {
        const dx = Math.abs(dh) <= sideStep ? dh / sideStep : Math.sign(dh);
        const gz = Math.abs(dd) <= depthStep ? dd / depthStep : Math.sign(dd);
        heading = wrap(heading + dx * sideStep);
        if (!dz) depth = Math.min(MAX_DEPTH, Math.max(MIN_DEPTH, depth + gz * depthStep));
        if (Math.abs(dx) > 0.2) { setMascot(mascot, { look: dx < 0 ? 'left' : 'right' }); lookUntil = Date.now() + 200; }
        moving = true;
      }
    }
    if (moving && Date.now() > lookUntil) setMascot(mascot, { look: '' });
    return moving;
  }

  // 3인칭: 끝까지 걸어간 뒤 그 방향의 다음 사진으로 이어서 걷는다.
  // forward: 우왕이가 걷던 방향으로 가고, 화면도 그쪽을 본다. back: 화면 뒤쪽 사진으로 물러나고, 화면은 보던 쪽을 그대로 본다.
  async function walkOnward(kind) {
    if (traveling || !pano || !service) return;
    traveling = true;
    const forward = kind === 'forward';
    const pov = pano.getPov();
    const direction = forward ? heading : wrap(pov.heading + 180);
    const look = forward ? heading : pov.heading;
    try {
      const found = await findNext(direction);
      if (!found) {
        say('이쪽으로는 길이 없어요 🤔', 1800);
        playMascot(mascot, 'refuse', 600);
        depth = forward ? MAX_DEPTH - 0.15 : MIN_DEPTH + 0.3;   // 끝에서 살짝 물러난다
        return;
      }
      await softSwitch(() => {
        movePano(found.id);
        pano.setPov({ heading: look, pitch: pov.pitch });
        target = look;
        keyTurn = false;
        depth = forward ? 0.15 : -0.2;   // 화면이 따라와서 우왕이가 다시 가까이 보인다 (누르고 있으면 계속 걷는다)
      });
      lastMove = Date.now();
      addSteps(found.meters);
      if (Date.now() > speechUntil || idleSpeech) say(placeComment(), 2600);
    } catch (e) {
      console.error('걷기 실패', e);
    } finally {
      traveling = false;
      edgeTime = 0;
    }
  }

  // ---------- 1인칭 / 3인칭 ----------
  // 3인칭: 시점은 1인칭처럼 돌리고, ↑/↓로 우왕이가 직접 앞뒤로 걷는다. 우왕이는 화면 안에서 자유롭게 따라온다 (옷과 동작이 보인다).
  // 1인칭: 화면이 우왕이의 눈이 된다. 우왕이 대신 화면 아래쪽에 앞발굽이 보이고, 말풍선은 화면 아래쪽에 뜬다.
  // 고른 방식은 저장해 두고 다음 산책에도 그대로 쓴다.
  function firstPerson() { return state.walkView === 'first'; }

  function applyView() {
    const first = firstPerson();
    view.parentElement.dataset.view = first ? 'first' : 'third';
    const b = $('#walk-view-toggle');
    b.textContent = first ? '🐮 우왕이 보기' : '👀 1인칭 보기';
    b.setAttribute('aria-pressed', String(first));
    $('#walk-hooves').hidden = !first;
    if (!first) view.style.transform = '';
    goal = null;
    keyTurn = false;
    held.clear();
    edgeTime = 0;
    if (pano) {
      heading = target = pano.getPov().heading;   // 화면은 그대로 두고, 3인칭이면 우왕이가 화면 가운데에서 시작한다
      depth = 0;
    }
    place();
  }

  function toggleView() {
    state.walkView = firstPerson() ? 'third' : 'first';
    saveState();
    applyView();
    say(firstPerson() ? '이제 우왕이 눈으로 봐요 👀' : '우왕이가 다시 보여요 🐮', 1600);
  }

  function showNotice(text) { notice.textContent = text; notice.hidden = false; }
  function hideNotice() { notice.hidden = true; }

  // ---------- 우왕이 자리 계산 ----------
  // -180 ~ 180도로 맞춘다
  function wrap(deg) { return ((deg + 540) % 360) - 180; }

  function place() {
    if (!pano) return;
    placeArrows();
    const pov = pano.getPov();
    const zoom = pano.getZoom() || 1;
    const fov = 180 / 2 ** zoom;                 // 스트리트 뷰의 가로 시야각
    const w = overlay.clientWidth;
    const h = overlay.clientHeight;
    const pxPerDeg = w / fov;
    // depth: 0이면 바로 앞, 1이면 저 멀리 (멀어질수록 작아지고 수평선 쪽으로 올라간다)
    // 원근감: 우왕이가 앞으로(화면 안쪽으로) 걸어갈수록 점점 작아진다.
    //   절반쯤 가면 반 크기, 지평선 가까이(가장 멀리) 가면 1/3 크기. 발밑(음수 depth)은 화면 아래쪽까지 내려와 조금 더 크게 보인다
    const size = BASE_SIZE * 2 ** (zoom - 1) * (depth >= 0 ? 1 / (1 + 2.2 * depth) : 1 - 0.3 * depth);
    // 3인칭: 우왕이는 사진 속 방향(heading)에 서 있다. 1인칭: 화면 가운데 (말풍선 자리만 쓴다)
    const x = firstPerson() ? w / 2 : w / 2 + wrap(heading - pov.heading) * pxPerDeg;
    const y = h * (FOOT_AT + (HORIZON_AT - FOOT_AT) * depth);   // 화면 중간보다 조금 아래에 서 있는다
    walker.style.setProperty('--size', `${size}px`);
    if (firstPerson()) {
      // 1인칭: 우왕이 몸은 숨기고(CSS) 말풍선만 화면 가운데 조금 아래에 띄운다 (바닥 화살표를 가리지 않게)
      walker.style.transform = `translate(${w / 2}px, ${Math.round(h * 0.66)}px)`;
      // 앞으로 걸을 때는 화면이 살짝 다가가고, 걸음마다 위아래로 흔들린다 (가장자리가 보이지 않게 조금 확대해 둔다)
      // (멀미가 나지 않게 흔들림은 1.5px, 다가가는 확대는 조금만)
      const bob = walkingAway ? Math.sin(performance.now() / 110) * 1.5 : 0;
      view.style.transform = `translateY(${bob.toFixed(1)}px) scale(${(1.03 + Math.max(0, depth) * 0.08).toFixed(3)})`;
    } else {
      walker.style.transform = `translate(${x - size / 2}px, ${y - size}px)`;
    }

    const away = Boolean(state.flight);
    const off = away ? '' : x < -size / 2 ? 'left' : x > w + size / 2 ? 'right' : '';
    walker.hidden = away || Boolean(off);
    hint.hidden = !off;
    if (off) hint.textContent = off === 'left' ? '← 우왕이는 이쪽에 있어요' : '우왕이는 이쪽에 있어요 →';
    hint.dataset.side = off;

    // 숨은 선물(🎁)도 같은 방식으로 장소 안에 둔다. 찾으면 사라진다
    // (상자는 left/top으로 옮긴다: transform은 흔들기 애니메이션이 쓰고 있다)
    const gEl = $('#walk-gift');
    if (!gift || away || walkingAway) {
      gEl.hidden = true;
    } else {
      const gSize = Math.max(34, BASE_SIZE * 2 ** (zoom - 1) * (1 - 0.7 * GIFT_DEPTH) * 0.3);
      // 상자는 장소 쪽에 놓인다: 걸어가도 그 장소가 있는 방향에 계속 보인다 (도착한 시선에 묶이지 않는다)
      const gp = places.find((x) => x.name === giftPlace);
      const gs = gp && nearestSpot(gp);
      const here = pano.getPosition();
      const gBearing = gs && here && gs.meters > 8 ? spherical.computeHeading(here, gs.latLng) : pov.heading + 22;
      const gx = w / 2 + wrap(gBearing - pov.heading) * pxPerDeg;
      const gy = h * (FOOT_AT + (HORIZON_AT - FOOT_AT) * GIFT_DEPTH);
      gEl.style.width = `${gSize}px`;
      gEl.style.height = `${gSize}px`;
      gEl.style.left = `${gx - gSize / 2}px`;
      // 상자 그림은 칸 맨 아래에 3/32만큼 여백이 있어서, 그만큼 올려 상자 밑면이 바닥 선(gy)에 닿게 한다
      gEl.style.top = `${gy - gSize * 0.906}px`;
      gEl.hidden = gx < -gSize || gx > w + gSize;
    }

    // 친구도 같은 방식으로 장소 안의 방향에 세운다
    const fEl = $('#walk-friend');
    if (!friend || away || walkingAway) { fEl.hidden = true; return; }
    const fSize = BASE_SIZE * 2 ** (zoom - 1) * (1 - 0.7 * FRIEND_DEPTH) * 0.75;
    const fx = w / 2 + wrap(friendHeading - pov.heading) * pxPerDeg;
    const fy = h * (FOOT_AT + (HORIZON_AT - FOOT_AT) * FRIEND_DEPTH);
    fEl.style.setProperty('--fsize', `${fSize}px`);
    fEl.style.transform = `translate(${fx - fSize / 2}px, ${fy - fSize}px)`;
    fEl.style.zIndex = depth > FRIEND_DEPTH ? 3 : 1;   // 우왕이가 친구보다 멀리 가면 친구가 앞에 보인다
    fEl.hidden = fx < -fSize || fx > w + fSize;
  }

  // ---------- 우왕이 친구 ----------
  // 몇몇 장소에는 친구가 산다 (maps-config.js의 WALK_FRIENDS). 우왕이가 가까이 가면 서로 인사한다.
  const FRIEND_DEPTH = 0.25;   // 친구가 서 있는 거리 (우왕이 바로 앞보다 조금 멀리)
  const MEET_DEG = 9;          // 3인칭: 우왕이가 친구 옆(방향)으로 이만큼 가까이 가면 만난 것으로 본다
  const MEET_DEPTH = 0.35;     // 3인칭: (거리)
  const MEET_LOOK_DEG = 14;    // 화면이 친구 쪽으로 이만큼 돌아보면 만난 것으로 본다
  let friend = null;
  let friendHeading = 0;
  let friendMet = false;       // 이번 방문에서 인사를 나눴는지
  let talkedHere = false;      // 이번 방문에서 이 친구에게 말을 걸었는지 (다음 방문 때 다시 뜬다)
  let greeting = false;

  // 장소에 도착했을 때 그 장소의 친구를 세운다
  function setFriend(name) {
    const all = typeof WALK_FRIENDS === 'undefined' ? {} : WALK_FRIENDS;
    friend = (name && all[name]) || null;
    friendMet = false;
    talkedHere = false;
    $('#walk-friend-speech').textContent = '';
    if (!friend) { $('#walk-friend').hidden = true; return; }
    friendHeading = wrap(pano.getPov().heading + (friend.offset || 25));
    const art = typeof FRIEND_ART === 'undefined' ? {} : FRIEND_ART;
    const body = $('#walk-friend-body');
    if (friend.image) body.innerHTML = `<img src="${friend.image}" alt="">`;   // 그림 파일이 있으면 그걸 쓴다
    else if (art[friend.art]) body.innerHTML = art[friend.art];
    else body.textContent = friend.emoji || '🙂';
    $('#walk-friend-name').textContent = friend.name;
    $('#walk-friend').setAttribute('aria-label', `${friend.name}에게 인사하기`);
  }

  // 화면이 친구 쪽을 봤는지, 또는 3인칭 우왕이가 친구 가까이 갔는지 (loop에서 매 프레임). 친구를 직접 눌러도 인사한다.
  function checkMeet() {
    if (!friend || friendMet || greeting || walkingAway || !canWalk()) return;
    const facing = Math.abs(wrap(pano.getPov().heading - friendHeading)) < MEET_LOOK_DEG;   // 화면이 친구 쪽을 봤다
    const close = Math.abs(wrap(heading - friendHeading)) < MEET_DEG && Math.abs(depth - FRIEND_DEPTH) < MEET_DEPTH;
    if (!facing && !(close && !firstPerson())) return;
    if (!firstPerson()) {
      // 3인칭: 우왕이가 친구 옆으로 걸어가서 인사한다 (오던 쪽에 선다)
      const side = wrap(friendHeading - heading) >= 0 ? -1 : 1;
      goal = { heading: wrap(friendHeading + side * 7), depth: FRIEND_DEPTH, idle: false };
    }
    greet();
  }

  // ---------- 숨은 선물 상자 ----------
  // 장소마다 선물 상자가 하나 숨어 있다 (maps-config.js의 WALK_GIFTS). 상자를 누르면 열려서 받는다.
  let gift = null;             // 이 장소의 선물 id (없으면 null)
  const GIFT_DEPTH = 0.3;      // 상자가 놓인 거리 (화면 위쪽일수록 멀다)
  let giftPlace = '';          // 상자가 놓인 장소 이름 (방향은 장소를 따라 매번 계산한다)
  let giftOpened = false;      // 이미 열었는지 (두 번 받지 않게)

  // 이미 가진 선물인지
  function giftOwned(id) {
    const item = GIFT_ITEMS[id];
    if (!item) return true;
    if (item.kind === 'outfit') return state.outfits.includes(id);
    if (item.kind === 'card') return state.photoCards.includes(id);
    return state.walkGiftsOpened.includes(id);   // 코인·하트 상자는 한 번만
  }

  // 도착한 장소에 선물 상자를 놓는다 (이미 받은 선물이면 놓지 않는다)
  function setGift(name) {
    const all = typeof WALK_GIFTS === 'undefined' ? {} : WALK_GIFTS;
    const id = name && all[name];
    gift = id && !giftOwned(id) ? id : null;
    giftOpened = false;
    $('#walk-gift').hidden = !gift;
    giftPlace = gift ? name : '';
  }

  // 상자를 누르면 살짝 튀었다가 열리고, 받은 것을 보여 준다
  function openGift() {
    if (!gift || giftOpened) return;
    giftOpened = true;
    const id = gift;
    const box = $('#walk-gift');
    box.classList.add('opening');
    Sound.sfx('levelup');
    setTimeout(() => {
      grantGift(id);
      box.hidden = true;
      box.classList.remove('opening');
      showReveal(id);
    }, 600);
  }

  function grantGift(id) {
    const item = GIFT_ITEMS[id];
    if (!state.walkGiftsOpened.includes(id)) state.walkGiftsOpened.push(id);
    if (item.kind === 'outfit') {
      if (!state.outfits.includes(id)) state.outfits.push(id);   // 옷장에 바로 넣는다
    } else if (item.kind === 'card') {
      if (!state.photoCards.includes(id)) state.photoCards.push(id);   // 포토카드 모음에 넣는다
    } else if (item.kind === 'coins') {
      state.coins += item.amount;
      if (session) session.coins += item.amount;
      renderTop();
    } else if (item.kind === 'heart') {
      addHearts('happy', item.amount);
      if (session) session.hearts += item.amount;
      renderStats();
    }
    gift = null;
    saveState();
  }

  // 이름으로 친구 정보 찾기 (친구 포토카드 그림에 쓴다)
  function friendByName(name) {
    const all = typeof WALK_FRIENDS === 'undefined' ? {} : WALK_FRIENDS;
    return Object.values(all).find((f) => f.name === name) || {};
  }

  function showReveal(id) {
    const item = GIFT_ITEMS[id];
    const art = {
      outfit: () => outfitIcon(OUTFITS[id]),
      card: () => (item.friend
        ? `<span class="reveal-friend">${friendFace(friendByName(item.friend))}</span>`
        : `<img class="reveal-card" src="${mapMeSrc()}" alt="우왕이 포토카드">`),
      coins: () => '<span class="reveal-emoji">🪙</span>',
      heart: () => '<span class="reveal-emoji">💗</span>',
    }[item.kind];
    const desc = {
      outfit: '옷장에 들어갔어요. 산책 옷 입기에서 바로 입을 수 있어요.',
      card: '포토카드를 받았어요. 산책 기록에서 몇 장 모았는지 볼 수 있어요.',
      coins: `코인 ${item.amount}개를 받았어요.`,
      heart: `행복 하트 ${item.amount}개가 찼어요.`,
    }[item.kind];
    $('#gift-reveal-art').innerHTML = art();
    $('#gift-reveal-name').textContent = item.name;
    $('#gift-reveal-desc').textContent = desc;
    $('#gift-reveal').hidden = false;
    const card = $('#gift-reveal .gift-reveal-card');
    card.classList.remove('pop');
    void card.offsetWidth;   // 같은 애니메이션을 다시 돌리려고 강제로 다시 그린다
    card.classList.add('pop');
    say(`🎁 ${item.name}을(를) 받았어요!`, 3000);
    renderWalkLog();
  }

  function closeReveal() {
    $('#gift-reveal').hidden = true;
  }

  // 말걸기 버튼: 친구가 화면에 보이면 바로 뜬다. 누르면 코인을 주는데, 같은 친구에게는 하루에 한 번만 준다.
  const TALK_COINS = 3;

  function talkedToday(name) {
    const t = state.walkTalked;
    return Boolean(t && t.day === todayKey() && t.names.includes(name));
  }

  // ---------- 카페에서 쉬기 (씨비앤유스타) ----------
  // 씨비앤유스타에 도착하면 "카페에서 쉬기" 버튼이 뜬다. 누르면 행복도가 조금 오르고, 떠나면 다음 방문 때 다시 뜬다.
  const CAFE_PLACE = '씨비앤유스타';
  const CAFE_HAPPY = 5;   // 일어날 때 적립되는 행복도
  let cafeRestedHere = false;   // 이번 방문에서 이미 쉬었는지
  let cafeSitting = false;      // 지금 카페 테이블에 앉아 있는지 (앉아 있는 동안은 걷지 않는다)
  let cafeSince = 0;            // 앉은 시각 (시계에 쉬고 있는 시간을 보여 준다)
  let cafeTalkAt = 0;           // 마지막으로 손님 말풍선을 바꾼 시각

  // 카페 손님들이 하는 말 (학생 / 교수님)
  const CAFE_LINES = {
    student: ['하하, 진짜요?', '그래서 어떻게 됐어요?', '오늘 학식은 뭘까?', '여기 커피 진짜 맛있어요!', '과제 어디까지 했어요?', '주말에 뭐 할 거예요?', '저 방금 웃겼죠 ㅎㅎ', '그 얘기 진짜예요?', '배고파요… 빵 시킬까?', '시험 끝나면 여행 가요!', '아 맞다, 그거 봤어요?', '음악 바꿔도 될까요?'],
    prof: ['흠흠, 날씨가 좋네요', '이 자리 좋군요', '커피 한 잔의 여유가 필요하지요', '요즘 학생들 열심히 하네요', '오늘도 수고했어요', '책 한 권 읽기 좋은 날이에요', '창가 자리가 제일 좋아요', '조용히 쉬기 좋은 곳이에요'],
  };
  // 같은 종류 안에서 고르되, 지금 다른 손님이 하고 있는 말은 피한다 (두 학생이 같은 말을 하지 않게)
  const pickCafeLine = (pool, taken = []) => {
    const all = CAFE_LINES[pool];
    const free = all.filter((l) => !taken.includes(l));
    const list = free.length ? free : all;
    return list[Math.floor(Math.random() * list.length)];
  };

  // 손님 한 명의 말풍선을 같은 종류의 다른 말로 바꾼다 (5초마다, 다른 손님과 겹치지 않게)
  function rotateCafeTalk() {
    const els = [...document.querySelectorAll('#cafe-guests .cafe-talk')];
    if (!els.length) return;
    const el = els[Math.floor(Math.random() * els.length)];
    const taken = els.filter((x) => x !== el).map((x) => x.textContent);
    el.textContent = pickCafeLine(el.dataset.pool, taken);
  }

  // 카페 시계: 앉은 뒤로 흐른 시간 (분:초), 손님 말풍선도 가끔 바뀐다
  function renderCafeClock() {
    const el = $('#cafe-time');
    if (!el || !cafeSitting) return;
    const now = Date.now();
    const s = Math.floor((now - cafeSince) / 1000);
    el.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    if (now - cafeTalkAt > 5000) { cafeTalkAt = now; rotateCafeTalk(); }
  }

  // 카페 화면을 연다: 우왕이가 테이블에 앉는다
  // 뒤쪽 테이블의 손님: 우왕이 학생 둘과 안경 낀 교수님 (교수님은 털을 바래고 안경·흰 눈썹·콧수염을 얹는다)
  function cafeGuestsHTML() {
    const src = mapMeSrc();
    // 두 학생은 마주 보고 이야기하고, 교수님도 옆자리와 대화 중이다 (말풍선으로 표시)
    const student = (x, face, line) => `<div class="cafe-guest" style="left:${x}%">
        <img class="cafe-guest-img ${face}" src="${src}" alt="">
        <span class="cafe-talk" data-pool="student">${line}</span>
      </div>`;
    const prof = `<div class="cafe-guest prof-guest" style="left:84%">
        <img class="cafe-guest-img prof" src="${src}" alt="">
        <span class="prof-brow l"></span><span class="prof-brow r"></span>
        <span class="prof-glasses">${HORN_GLASSES_SVG}</span>
        <span class="prof-stache"></span>
        <span class="cafe-talk" data-pool="prof">${pickCafeLine('prof')}</span>
      </div>`;
    // 음료: 두 학생 사이 테이블과 교수님 테이블 위에 놓는다 (사람들 앞쪽, 테이블 위에 보인다)
    // 두 학생은 서로 다른 말로 시작한다
    const lineA = pickCafeLine('student');
    const lineB = pickCafeLine('student', [lineA]);
    const cup = (x, kind) =>`<span class="cafe-cup ${kind}" style="left:${x}%"></span>`;
    return `<div class="cafe-table cafe-table-l"></div><div class="cafe-table cafe-table-r"></div>`
      + '<div class="cafe-sofa" style="left:9%"><i></i><i></i></div>' + student(9, '', lineA) + student(31, '', lineB) + prof
      + cup(15, 'latte') + cup(23, 'iced') + cup(76, 'iced');
  }

  function openCafeScene() {
    cafeSitting = true;
    cafeSince = Date.now();
    cafeTalkAt = Date.now();
    renderCafeClock();
    $('#cafe-guests').innerHTML = cafeGuestsHTML();
    $('#cafe-uwang').src = mapMeSrc();
    $('#cafe-scene').hidden = false;
    renderCafe();
  }

  // 일어나기: 다시 걸을 수 있다
  function standUpCafe() {
    if (!cafeSitting) return;
    cafeSitting = false;
    $('#cafe-scene').hidden = true;
    const before = state.pet.happy;
    addHearts('happy', CAFE_HAPPY);
    const gained = state.pet.happy - before;
    if (gained && session) session.hearts += gained;
    if (gained) saveState();
    renderStats();
    renderCafe();
    toast(gained ? `카페에서 쉬고 일어났어요 행복 +${gained}` : '카페에서 쉬고 일어났어요 (행복도가 가득 찼어요)');
  }

  // 씨비앤유스타 주변(CAFE_NEAR_METERS 안)에 있는지: 친구처럼 그 자리 근처에서만 보인다
  const CAFE_NEAR_METERS = 60;
  function nearCafe() {
    if (!pano || !spherical || !places.length) return false;
    const p = places.find((x) => x.name === CAFE_PLACE);
    const s = p && nearestSpot(p);
    return Boolean(s && s.meters <= CAFE_NEAR_METERS);
  }

  function renderCafe() {
    const btn = $('#walk-cafe-btn');
    if (!btn) return;
    const near = inWalk && canWalk() && nearCafe();
    // 자리를 떠나면 다음에 다시 올 때 쉴 수 있다
    if (!nearCafe()) cafeRestedHere = false;
    // 화면의 한 자리에 고정된다 (우왕이를 따라다니지 않는다, 카페 앞에서만 보인다)
    btn.hidden = !(near && !cafeRestedHere);
  }

  // 앉으면 이번 방문의 쉬기가 끝나고, 행복도는 일어날 때 적립된다
  function restAtCafe() {
    if (!nearCafe() || !canWalk() || cafeRestedHere) return;
    cafeRestedHere = true;
    renderCafe();
    Sound.sfx('ding');
    openCafeScene();
  }

  function renderTalk() {
    const btn = $('#walk-talk-btn');
    if (!btn) return;
    const fEl = $('#walk-friend');
    const show = Boolean(friend) && inWalk && canWalk() && !fEl.hidden && !talkedHere;
    btn.hidden = !show;
    if (!show) return;
    btn.textContent = `💬 말걸기 (+${TALK_COINS})`;
    const b = fEl.getBoundingClientRect();
    const o = overlay.getBoundingClientRect();
    btn.style.left = `${b.left + b.width / 2 - o.left}px`;
    btn.style.top = `${b.top - o.top - 6}px`;
  }

  function talkFriend() {
    if (!friend || !canWalk() || talkedHere) return;
    talkedHere = true;   // 누르면 버튼이 사라지고, 다음 방문 때 다시 뜬다
    // 말을 건 친구도 이번 산책에서 만난 친구로 기록한다 (인생네컷·산책 기록에 함께 나온다)
    if (session && !session.friends.includes(friend.name)) session.friends.push(friend.name);
    state.coins += TALK_COINS;
    if (session) session.coins += TALK_COINS;
    saveState();
    renderTop();
    // 친구가 먼저 말하고, 잠시 뒤 우왕이가 대답한다 (대화는 여러 개 중 무작위)
    const pool = WALK_TALKS[friend.art] || [{ f: friend.hello, u: friend.reply }];
    const ex = pool[Math.floor(Math.random() * pool.length)];
    const who = friend;
    const fSpeech = $('#walk-friend-speech');
    fSpeech.textContent = ex.f;
    Sound.sfx('ding');
    setTimeout(() => {
      if (friend !== who) return;
      say(ex.u, 2600);
      playMascot(mascot, 'joy', 600);
    }, 1300);
    setTimeout(() => { if (friend === who) fSpeech.textContent = ''; }, 4200);
    toast(`💬 ${friend.name}와 이야기했어요 🪙 +${TALK_COINS}`);
    renderTalk();
  }

  async function greet() {
    if (!friend || greeting) return;
    greeting = true;
    friendMet = true;
    const f = friend;
    if (session && !session.friends.includes(f.name)) { session.friends.push(f.name); bumpQuest('friends', 1); }
    if (!state.walkFriends.includes(f.name)) {
      // 처음 만난 친구: 보상은 쌓아 두고, '친구 보상 받기' 버튼을 눌러야 코인으로 들어온다 (보너스도 한 번만 쌓인다)
      state.walkFriends.push(f.name);
      state.walkFriendReward += FRIEND_COINS;
      const list = friendList();
      const got = list.filter((x) => state.walkFriends.includes(x.name)).length;
      const allDone = !state.walkFriendsDone && list.length > 0 && got >= list.length;
      if (allDone) {
        state.walkFriendsDone = true;
        state.walkFriendReward += FRIEND_ALL_BONUS;
      }
      saveState();
      renderFriendHint();
      setTimeout(() => toast(`🤝 ${f.name}를 찾았어요! 보상 🪙 ${FRIEND_COINS}개를 받을 수 있어요 (${got}/${list.length})`), 1700);
      if (allDone) {
        setTimeout(() => {
          Sound.sfx('levelup');
          toast(`🎉 숨어 있던 친구 ${list.length}명을 모두 찾았어요! 보너스 🪙 +${FRIEND_ALL_BONUS}도 받을 수 있어요`);
        }, 4400);
      }
    }
    const fEl = $('#walk-friend');
    const fSpeech = $('#walk-friend-speech');
    // 우왕이가 친구 쪽을 바라본다 (인사하는 동안은 고개를 그대로 둔다)
    setMascot(mascot, { look: wrap(friendHeading - heading) < 0 ? 'left' : 'right' });
    lookUntil = Date.now() + 4000;
    const greetPool = WALK_TALKS[f.art] || [{ f: f.hello, u: f.reply }];
    const greetEx = greetPool[Math.floor(Math.random() * greetPool.length)];
    fSpeech.textContent = greetEx.f;
    fEl.classList.remove('hop');
    void fEl.offsetWidth;
    fEl.classList.add('hop');
    Sound.sfx('ding');
    await wait(1700);
    if (friend !== f) { greeting = false; return; }   // 그새 다른 장소로 갔으면 그만
    say(greetEx.u, 2400);
    playMascot(mascot, 'joy', 600);
    await wait(2400);
    fSpeech.textContent = '';
    fEl.classList.remove('hop');
    greeting = false;
  }

  // 매 프레임: 1인칭은 화면 돌리기, 3인칭은 우왕이 걷기
  let lastFrameAt = 0;
  function loop() {
    cancelAnimationFrame(frame);
    lastFrameAt = performance.now();
    const step = (now) => {
      if ($('#screen-walk').hidden || !pano || !inWalk) return;
      const dt = Math.min(0.05, Math.max(0, (now - lastFrameAt) / 1000));
      lastFrameAt = now;
      const first = firstPerson();
      const moving = first ? stepFirst() : stepThird(dt);
      if (!moving && Date.now() > lookUntil) setMascot(mascot, { look: '' });
      walker.dataset.walking = moving || walkingAway || (!first && traveling);
      view.parentElement.dataset.walking = walkingAway;   // 1인칭 발굽은 한 걸음 걸을 때만 번갈아 움직인다
      checkMeet();
      place();
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  }

  // 1인칭: 키나 클릭으로 정한 방향(target)으로 화면을 돌린다.
  // 우왕이(눈)는 늘 화면이 보는 쪽을 보고, 화면이 돌면 고개도 그쪽으로 돌린다. 돌고 있으면 true
  function stepFirst() {
    const turning = turnCamera();
    const pov = pano.getPov();
    const delta = wrap(pov.heading - heading);   // 이번 프레임에 화면이 돈 양 (손으로 끌어서 돌린 것도 포함)
    heading = pov.heading;
    if (!keyTurn) target = heading;
    if (Math.abs(delta) > 0.15) {
      setMascot(mascot, { look: delta < 0 ? 'left' : 'right' });
      lookUntil = Date.now() + 250;
    }
    return turning;
  }

  // ---------- 시간 흐름 ----------
  function canWalk() {
    // 산책 중에는 밤이거나 불이 꺼져 있어도 깨어서 걷는다
    // 아프면 걷지 않는다 (걸음·하트·코인이 쌓이지 않는다)
    return state.pet.stage !== 'egg' && !state.flight && !state.pet.sick && !cafeSitting;
  }

  // ---------- 걸음 수 · 산책 시간 · 행복 ----------
  // 산책 기록은 이번에 앱을 연 동안만 센다 (새로고침하면 0부터)
  const METERS_PER_STEP = 0.7;
  const WALK_COIN_SECONDS = 10 * 60;   // 이만큼 산책할 때마다
  const WALK_COIN_REWARD = 5;          // 코인을 이만큼 준다
  const STEPS_PER_HEART = 100;   // 이만큼 걸을 때마다 행복 하트 +1
  let steps = 0;
  let walkSeconds = 0;
  let heartProgress = 0;

  function addSteps(meters) {
    const added = Math.max(1, Math.round(meters / METERS_PER_STEP));
    steps += added;
    bumpQuest('steps', added);
    addHeartProgress(added);
    checkThirst();
    return added;
  }

  // 하트까지 모은 걸음을 더하고, 다 차면 행복 하트를 준다
  function addHeartProgress(amount) {
    heartProgress += amount;
    let gained = 0;
    while (heartProgress >= STEPS_PER_HEART) {
      heartProgress -= STEPS_PER_HEART;
      if (state.pet.happy < MAX_HEARTS) { addHearts('happy', 1); gained++; }
    }
    if (gained && session) session.hearts += gained;
    if (gained) {
      saveState();
      Sound.sfx('levelup');
      toast(`산책해서 우왕이가 행복해졌어요 💗 +${gained}`);
      const el = $('#walk-happy');
      el.classList.remove('up');
      void el.offsetWidth;
      el.classList.add('up');
    }
    renderStats();
  }

  // ---------- 물 마시기 ----------
  // 80걸음쯤 걸으면 목이 마르다. 목마를 때 마시면 다음 하트까지 30걸음 당겨 준다.
  const THIRST_STEPS = 80;
  const DRINK_BONUS = 30;
  let drankAt = 0;          // 마지막으로 물 마셨을 때의 걸음 수
  let thirsty = false;
  let drinking = false;

  function checkThirst() {
    if (thirsty || steps - drankAt < THIRST_STEPS) return;
    thirsty = true;
    renderDrink();
    say('목말라요… 물 마시고 싶어요 💧', 2600);
  }

  function renderDrink() {
    const btn = $('#btn-walk-drink');
    btn.classList.toggle('thirsty', thirsty);
    $('#walk-drink-label').textContent = thirsty ? '목말라요!' : '물 마시기';
  }

  function drink() {
    if (!inWalk || drinking || !canWalk()) return;
    drinking = true;
    // 컵은 우왕이 몸과 같이 움직이는 층에 넣어서, 몸이 흔들려도 입에 딱 붙어 있게 한다
    const inner = mascot.querySelector('.uwang-breath') || mascot.querySelector('.mascot-inner') || mascot;
    let cup = inner.querySelector('.walk-cup');
    if (!cup) {
      cup = document.createElement('span');
      cup.className = 'walk-cup';
      cup.setAttribute('aria-hidden', 'true');
      cup.innerHTML = TUMBLER_SVG;
      inner.appendChild(cup);
    }
    cup.classList.remove('show');
    void cup.offsetWidth;
    cup.classList.add('show');
    playMascot(mascot, 'eat', 1300);   // 입을 벌리고 한 번 꿀꺽
    setTimeout(() => Sound.sfx('gulp'), 450);
    if (thirsty) {
      thirsty = false;
      drankAt = steps;
      if (session) session.drinks++;
      bumpQuest('drinks', 1);
      say(pickOne(['꿀꺽꿀꺽… 캬, 시원해요! 💧', '물 마시니까 힘이 나요 💪', '살 것 같아요! 고마워요 😊']), 2400);
      addHeartProgress(DRINK_BONUS);
    } else {
      say(pickOne(['홀짝… 아직 목은 안 말라요 😋', '조금만 마실게요, 더 걸어요! 🐾']), 2000);
    }
    renderDrink();
    setTimeout(() => { drinking = false; }, 1900);
  }

  // 텀블러 그림: 뚜껑 왼쪽의 마시는 구멍이 우왕이 입에 닿는다
  const TUMBLER_SVG = '<svg viewBox="0 0 26 48">'
    + '<path d="M2.5 10 H23.5 L22 44 Q21.8 46.5 19 46.5 H7 Q4.2 46.5 4 44 Z" fill="#2b9bd0" stroke="#15546f" stroke-width="1.5" stroke-linejoin="round"/>'
    + '<path d="M3.3 22 H22.7 L22.45 28 H3.55 Z" fill="#1c7fb0"/>'
    + '<path d="M6.5 13 L7.4 41" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".55"/>'
    + '<rect x="1" y="3" width="24" height="7.5" rx="2.5" fill="#f6f2ec" stroke="#8a7f74" stroke-width="1.5"/>'
    + '<rect x="3" y="0.8" width="7" height="3.2" rx="1.3" fill="#e4ddd3" stroke="#8a7f74" stroke-width="1.2"/>'
    + '</svg>';

  // 다음 코인·하트·도장까지 남은 양을 막대로 보여 준다
  function renderNext() {
    const bar = (id, done, total) => { $(id).style.width = `${Math.min(100, Math.round((done / total) * 100))}%`; };

    const coinDone = walkSeconds % WALK_COIN_SECONDS;
    const left = WALK_COIN_SECONDS - coinDone;
    const min = Math.floor(left / 60);
    const sec = left % 60;
    $('#wn-coin-left').textContent = min ? `${min}분 ${sec}초 남음` : `${sec}초 남음`;
    bar('#wn-coin-bar', coinDone, WALK_COIN_SECONDS);

    const full = state.pet.happy >= MAX_HEARTS;
    $('#wn-heart').classList.toggle('full', full);
    $('#wn-heart-left').textContent = full ? '행복 가득!' : `${STEPS_PER_HEART - heartProgress}걸음 남음`;
    bar('#wn-heart-bar', full ? 1 : heartProgress, full ? 1 : STEPS_PER_HEART);

    // 도장은 이름 있는 장소에서 아직 안 받았을 때만 보여 준다
    const stampLeft = stampSecondsLeft();
    $('#wn-stamp').hidden = stampLeft <= 0;
    if (stampLeft > 0) {
      $('#wn-stamp-label').textContent = `${hereName} 도장`;
      $('#wn-stamp-left').textContent = `${stampLeft}초 남음`;
      bar('#wn-stamp-bar', STAMP_SECONDS - stampLeft, STAMP_SECONDS);
    }
  }

  function renderStats() {
    $('#walk-steps').textContent = steps.toLocaleString();
    renderNext();
    const m = Math.floor(walkSeconds / 60);
    const s = walkSeconds % 60;
    $('#walk-time').textContent = m >= 60
      ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    let html = '';
    for (let i = 0; i < MAX_HEARTS; i++) html += `<span class="${i < state.pet.happy ? 'on' : 'off'}">${icon(i < state.pet.happy ? 'heart' : 'heartEmpty', 20)}</span>`;
    $('#walk-happy').innerHTML = html;
  }

  function tick() {
    if ($('#screen-walk').hidden) return;
    renderCafe();   // 산책 중이 아니면 카페 버튼을 숨긴다 (씨비앤유스타에서만 보인다)
    if (!inWalk) { renderCheck(); updateMusic(); return; }   // 산책 전 체크 화면 (음악은 끈다)
    // 산책 중에 아파지면 한 번 알려 주고 걸음을 멈춘다
    if (state.pet.sick) {
      if (!sickNoted) { sickNoted = true; say('으으… 아파서 더 못 걸어요 🤒 산책을 끝내고 쉬어요', 4000); }
    } else sickNoted = false;
    // 지도가 늦게 준비되면 출발 때의 장소 확인이 빠지므로, 준비되는 대로 한 번 더 확인한다 (친구·선물 상자 설정)
    if (pano && stampedPano === '') checkStamp();
    renderWarmth();
    renderTalk();
    renderCafe();
    renderCafeClock();
    // 지도가 떠 있고 우왕이가 같이 걸을 수 있을 때만 산책 시간이 흐른다
    if (pano && canWalk()) {
      walkSeconds++;
      stayHere();   // 도장: 이름 있는 장소에서 머문 시간
      if (walkSeconds % 60 === 0) bumpQuest('minutes', 1);
      // 산책 10분마다 코인 5개
      if (walkSeconds % WALK_COIN_SECONDS === 0) {
        state.coins += WALK_COIN_REWARD;
        if (session) session.coins += WALK_COIN_REWARD;
        saveState();
        renderTop();
        Sound.sfx('levelup');
        toast(`산책 ${walkSeconds / 60}분 달성! 🪙 +${WALK_COIN_REWARD}`);
        say(`${walkSeconds / 60}분이나 걸었어요! 코인 받았어요 🪙`, 2400);
      }
    }
    render();
    updateMusic();   // 장소가 바뀌면 그 장소 음악으로
    if (!pano || traveling || !canWalk() || Date.now() - lastMove < 4000) return;
    lastMove = Date.now();
    if (!firstPerson() && !goal) {
      // 3인칭: 가만히 있으면 화면 안에서 혼자 조금 걸어 다닌다 (화면 밖에 있으면 그대로 둔다)
      const pov = pano.getPov();
      const fov = 180 / 2 ** (pano.getZoom() || 1);
      if (Math.abs(wrap(heading - pov.heading)) < fov * 0.4) {
        goal = {
          heading: wrap(pov.heading + (Math.random() * 2 - 1) * fov * 0.25),
          depth: Math.random() * 1.1 - 0.5,
          idle: true,
        };
        return;
      }
    }
    // 1인칭: 제자리에서 두리번거린다 (화면은 돌리지 않는다)
    setMascot(mascot, { look: Math.random() < 0.5 ? 'left' : 'right' });
    lookUntil = Date.now() + 1200;
  }

  function say(text, ms = 2200) {
    speech.textContent = text;
    speechUntil = Date.now() + ms;
    idleSpeech = false;
  }

  function tap() {
    if (!canWalk()) return;
    say(state.pet.sick ? '으으… 아파요' : '헤헤, 같이 걸어요 😊', 1500);
    playMascot(mascot, 'joy', 600);
  }

  // ---------- 화면 ----------
  function render() {
    const pet = state.pet;
    if (mountedStage !== pet.stage) {
      mountMascot(mascot, pet.stage);
      setMascot(mascot, { look: '', anim: '' });
      mountedStage = pet.stage;
    }
    dressMascot(mascot, true);
    setMascot(mascot, { mood: pet.sick ? 'sad' : pet.happy >= 3 ? 'happy' : 'normal', sleep: false, sick: pet.sick });
    renderHeadset();

    let status = '';
    if (pet.stage === 'egg') status = '알에서 태어나면 같이 산책할 수 있어요 🥚';
    else if (state.flight) status = '우왕이는 지금 여행 중이에요 ✈️';
    else if (pet.sick) status = '우왕이가 아파서 쉬고 있어요 🤒 산책을 끝내고 약을 먹여 주세요';
    overlay.dataset.away = Boolean(state.flight);
    $('#walk-status').textContent = status;
    renderStats();
    renderPlace();
    applyTime();   // 실제 시계에 맞춰 아침·낮·저녁·밤 색

    // 가만히 있을 때도 가끔 이 장소 이야기를 한다
    if (Date.now() > speechUntil) {
      if (canWalk()) { say(placeComment(), 8000); idleSpeech = true; }
      else speech.textContent = '';
    }
    loadMaps();
  }

  // ---------- 산책 전 체크 ----------
  // 산책 탭을 열면 먼저 건강·배고픔·심심함을 보고, "산책 나가기"를 눌러야 지도로 간다.
  let inWalk = false;
  let checkStage = null;

  // 산책을 못 나가는 이유 (없으면 '')
  function blockReason() {
    const pet = state.pet;
    if (pet.stage === 'egg') return '아직 알이에요. 태어나면 같이 산책할 수 있어요 🥚';
    if (state.flight) return '우왕이는 지금 여행 중이에요. 돌아오면 산책해요 ✈️';
    if (state.lecture) return '우왕이는 지금 수업 중이에요. 끝나면 산책해요 📚';
    if (state.study) return '우왕이는 지금 공부 중이에요. 끝나면 산책해요 ✏️';
    if (pet.sick) return '아플 때는 쉬어야 해요. 약을 먹고 다시 와요 💊';
    return '';
  }

  function renderCheck() {
    const pet = state.pet;
    const box = $('#walk-check-mascot');
    if (checkStage !== pet.stage) { mountMascot(box, pet.stage); checkStage = pet.stage; }
    dressMascot(box, true);
    setMascot(box, { mood: pet.sick || pet.hunger === 0 || pet.happy === 0 ? 'sad' : pet.happy >= 3 ? 'happy' : 'normal', sleep: false, sick: pet.sick });

    const bored = MAX_HEARTS - pet.happy;   // 행복이 낮을수록 심심하다
    let hearts = '';
    for (let i = 0; i < MAX_HEARTS; i++) hearts += `<span class="${i < pet.hunger ? 'on' : 'off'}">${icon(i < pet.hunger ? 'heart' : 'heartEmpty', 20)}</span>`;
    $('#wc-hunger').innerHTML = hearts;
    let yawns = '';
    for (let i = 0; i < MAX_HEARTS; i++) yawns += `<span class="${i < bored ? 'on' : 'off'}">🥱</span>`;
    $('#wc-bored').innerHTML = yawns;
    $('#wc-health').textContent = pet.stage === 'egg' ? '알 속에서 쑥쑥 🥚' : pet.sick ? '아파요 🤒' : '튼튼해요 💪';

    const reason = blockReason();
    let text;
    let level;
    if (reason) { text = reason; level = 'stop'; }
    else if (pet.hunger === 0) { text = '배가 너무 고파요… 밥을 먹고 가면 더 신나게 걸을 수 있어요 🍙'; level = 'warn'; }
    else if (bored >= 3) { text = '엄청 심심해요! 빨리 산책 가요, 걸으면 행복해져요 💗'; level = 'warn'; }
    else if (bored >= 1) { text = '조금 심심해요. 같이 산책할까요? 🐾'; level = 'ok'; }
    else { text = '컨디션 최고예요! 신나게 산책해요 ✨'; level = 'ok'; }
    const verdict = $('#wc-verdict');
    verdict.textContent = text;
    verdict.dataset.level = level;
    $('#btn-walk-next').disabled = Boolean(reason);
    $('#btn-walk-care').hidden = !(pet.sick || pet.hunger === 0);
  }

  // 산책 탭 안의 단계: 'check'(상태 체크) → 'pick'(출발 장소) → 'dress'(옷 입기) → 'walk'(산책)
  function setStep(step) {
    inWalk = step === 'walk';
    $('#walk-check').hidden = step !== 'check';
    $('#walk-pick').hidden = step !== 'pick';
    $('#walk-summary').hidden = step !== 'summary';
    $('#walk-main').hidden = step !== 'walk';
    if (step === 'check') { renderCheck(); renderQuests(); renderWalkLog(); }
    if (step === 'pick') { renderPick(); renderDress(); setSetupTab('place'); }
    renderFriendHint();
    if (step === 'walk') renderStamps();
    window.scrollTo(0, 0);
    updateMusic();
  }

  // ---------- 출발 장소 고르기 ----------
  let chosenName = '';   // 고른 장소 이름 (WALK_PLACES의 이름)

  function placeNames() {
    const names = typeof WALK_PLACES === 'undefined' ? {} : WALK_PLACES;
    const blockedIds = new Set(places.filter((p) => p.hidden).flatMap((p) => p.ids));
    return [...new Set(Object.keys(names).filter((id) => !blockedIds.has(id)).map((id) => names[id]))];
  }

  // 이 이름의 첫 번째 사진 ID (API가 쓰는 'CAoS…' 모양)
  function idForName(name) {
    const names = typeof WALK_PLACES === 'undefined' ? {} : WALK_PLACES;
    const loaded = places.find((p) => p.name === name);
    if (loaded && loaded.spots.length) return loaded.spots[0].id;   // 뺀 사람 사진이 아닌 것
    const id = Object.keys(names).find((k) => names[k] === name);
    return id ? apiId(id) : '';
  }

  function chosenStartId() {
    return chosenName ? idForName(chosenName) : '';
  }

  function renderPick() {
    const list = placeNames();
    if (!chosenName || !list.includes(chosenName)) {
      // 처음에는 maps-config.js의 시작 장소(WALK_PANO_ID)를 고른 상태로 둔다
      const names = typeof WALK_PLACES === 'undefined' ? {} : WALK_PLACES;
      const startKey = Object.keys(names).find((k) => plainId(k) === plainId(WALK_PANO_ID));
      chosenName = (startKey && list.includes(names[startKey]) ? names[startKey] : list[0]) || '';
    }
    const comments = typeof WALK_COMMENTS === 'undefined' ? {} : WALK_COMMENTS;
    // 두 칸 바둑판: 아이콘과 이름만 (감상 한 줄은 고른 장소만 아래 막대에)
    $('#wc-places').innerHTML = list.map((name) => {
      const on = name === chosenName;
      const visited = state.walkStamps[name] ? '<em class="visited" title="도장 받은 곳">🏅</em>' : '';
      return `<button role="radio" aria-checked="${on}" data-start="${name}">`
        + `<span class="pin">${placeIcon(name)}</span><b>${name}</b>${visited}</button>`;
    }).join('');
    const line = (comments[chosenName] && comments[chosenName][0]) || '우왕이와 걸어 볼까요?';
    // 고른 장소를 크게 보여 주는 카드: 아이콘, 우왕이 한 줄, 도장 기록 (숨은 친구는 알려 주지 않는다)
    const rec = chosenName ? state.walkStamps[chosenName] : null;
    $('#wc-card').innerHTML = chosenName
      ? `<span class="pc-icon">${placeIcon(chosenName)}</span>`
        + `<div class="pc-body"><b class="pc-name">${chosenName}</b>`
        + `<p class="pc-line">“${line}”</p>`
        + `<small class="pc-meta">${rec ? `🏅 도장 ${rec.visits}번 방문` : '🏅 아직 도장이 없어요'}</small></div>`
      : '';
    $('#wc-pick-line').textContent = chosenName ? `${placeIcon(chosenName)} ${chosenName} · ${line}` : '';
    $('#wd-place-name').textContent = chosenName;
    $('#btn-walk-start').disabled = !chosenName || Boolean(blockReason());
  }

  // 산책 준비 화면의 탭: 장소 / 옷 (한 번에 하나만 보이고, 아래 막대의 산책 버튼은 그대로다)
  function setSetupTab(tab) {
    const dress = tab === 'dress';
    $('#setup-place').hidden = dress;
    $('#setup-dress').hidden = !dress;
    document.querySelectorAll('[data-setup]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.setup === tab)));
    if (dress) { renderDress(); sayDress('오늘은 뭐 입고 나갈까요? 👕'); }
  }

  // ---------- 숨은 친구 안내 ----------
  // 어디에 있는지는 알려 주지 않고, 몇 명이 숨어 있고 몇 명을 만났는지만 보여 준다.
  const FRIEND_COINS = 5;        // 친구를 처음 만나면
  const FRIEND_ALL_BONUS = 25;   // 친구를 모두 찾으면

  // 친구 목록 (이름이 같으면 한 번만)
  function friendList() {
    const all = typeof WALK_FRIENDS === 'undefined' ? {} : WALK_FRIENDS;
    const seen = new Set();
    return Object.values(all).filter((f) => !seen.has(f.name) && seen.add(f.name));
  }

  function friendFace(f) {
    if (f.image) return `<img src="${f.image}" alt="">`;
    const art = typeof FRIEND_ART === 'undefined' ? null : FRIEND_ART[f.art];
    return art || `<span class="emoji">${f.emoji || '🐾'}</span>`;
  }

  function renderFriendHint() {
    const list = friendList();
    const met = list.filter((f) => state.walkFriends.includes(f.name));
    let text = '';
    if (list.length && met.length >= list.length) {
      text = `🎉 숨어 있던 친구 ${list.length}명을 모두 찾았어요! 다시 만나러 가도 반겨 줘요.`;
    } else if (list.length) {
      text = `🤫 캠퍼스 곳곳에 우왕이 친구 ${list.length}명이 숨어 있어요! 여기저기 걸어 다니며 찾아서 인사해 보세요.`;
    }
    const hintEl = $('#wc-friend-hint');   // 출발 장소 고르기 화면에만 있다
    hintEl.textContent = text;
    hintEl.hidden = !text;

    // 찾은 친구 칸: 만난 친구는 얼굴, 아직이면 그림자와 ?
    // 쌓인 친구 보상이 있으면 '받기' 버튼을 보여 준다
    const claim = $('#btn-friend-claim');
    if (claim) {
      claim.hidden = !state.walkFriendReward;
      claim.textContent = `🪙 친구 보상 받기 (+${state.walkFriendReward})`;
    }

    $('#walk-friend-count').textContent = `${met.length} / ${list.length}`;
    $('#walk-friends').innerHTML = list.map((f) => (state.walkFriends.includes(f.name)
      ? `<div class="walk-friend-badge" title="${f.name}"><div class="face">${friendFace(f)}</div><small>${f.name}</small></div>`
      : `<div class="walk-friend-badge locked" title="아직 못 찾은 친구"><div class="face">${friendFace(f)}<b>?</b></div><small>???</small></div>`)).join('');
  }

  // 쌓아 둔 친구 보상을 코인으로 받는다
  function claimFriendReward() {
    const amount = state.walkFriendReward;
    if (!amount) return;
    state.coins += amount;
    if (session) session.coins += amount;
    state.walkFriendReward = 0;
    saveState();
    renderTop();
    renderFriendHint();
    Sound.sfx('levelup');
    toast(`🤝 친구 보상 🪙 +${amount}을 받았어요!`);
  }

  // ---------- 친구 위치 힌트 ----------
  // 아직 못 만난 친구 중 가장 가까운 친구가 사는 장소와의 거리를 온도로 보여 준다 (정확한 거리와 이름은 숨긴다)
  const WARM_BANDS = [[40, '🔥 아주 가까워요!'], [120, '🌡️ 따뜻해요'], [300, '❄️ 조금 멀어요'], [Infinity, '🧊 멀리 있어요']];
  let sickNoted = false;   // 산책 중 아프다는 말을 이미 했는지

  function friendWarmth() {
    if (!pano || !spherical || !canWalk() || !places.length) return '';
    const here = pano.getPosition();
    if (!here) return '';
    const all = typeof WALK_FRIENDS === 'undefined' ? {} : WALK_FRIENDS;
    let best = Infinity;
    for (const [placeName, f] of Object.entries(all)) {
      if (state.walkFriends.includes(f.name)) continue;   // 이미 만난 친구는 빼고
      const p = places.find((x) => x.name === placeName);
      const spot = p && p.spots[0];
      if (!spot) continue;
      best = Math.min(best, spherical.computeDistanceBetween(here, spot.latLng));
    }
    if (best === Infinity) return '';
    return WARM_BANDS.find(([max]) => best <= max)[1];
  }

  function renderWarmth() {
    const el = $('#walk-warm');
    if (!el) return;
    const text = inWalk ? friendWarmth() : '';
    el.hidden = !text;
    el.textContent = text ? `숨은 친구: ${text}` : '';
  }

  // ---------- 오늘의 퀘스트 ----------
  // 날마다 세 가지를 고른다 (같은 날에는 새로고침해도 같다). 날이 바뀌면 새로 고르고, 받지 않은 보상은 사라진다.
  const QUEST_POOL = [
    { id: 'steps300', kind: 'steps', goal: 300, unit: '걸음', label: '산책에서 걸음 채우기', reward: 6 },
    { id: 'steps800', kind: 'steps', goal: 800, unit: '걸음', label: '산책에서 많이 걷기', reward: 12 },
    { id: 'minutes5', kind: 'minutes', goal: 5, unit: '분', label: '산책 시간 채우기', reward: 6 },
    { id: 'minutes15', kind: 'minutes', goal: 15, unit: '분', label: '오래 산책하기', reward: 12 },
    { id: 'places2', kind: 'places', goal: 2, unit: '곳', label: '새로운 장소 가 보기', reward: 8 },
    { id: 'drink1', kind: 'drinks', goal: 1, unit: '번', label: '목마를 때 물 마시기', reward: 5 },
    { id: 'friend1', kind: 'friends', goal: 1, unit: '명', label: '숨은 친구와 인사하기', reward: 8 },
    { id: 'stamp1', kind: 'stamps', goal: 1, unit: '개', label: '도장 하나 받기', reward: 6 },
  ];
  const QUEST_COUNT = 3;

  function todayKey(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // 날짜 문자열로 같은 순서를 만드는 간단한 난수 (같은 날이면 항상 같은 퀘스트가 나온다)
  function pickQuests(day) {
    let seed = 0;
    for (const ch of day) seed = (Math.imul(seed, 31) + ch.charCodeAt(0)) >>> 0;
    const pool = QUEST_POOL.slice();
    const picked = [];
    const kinds = new Set();
    while (picked.length < QUEST_COUNT && pool.length) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const [q] = pool.splice(seed % pool.length, 1);
      if (kinds.has(q.kind)) continue;   // 같은 종류는 한 번만
      kinds.add(q.kind);
      picked.push(q.id);
    }
    return picked;
  }

  function ensureQuests() {
    const day = todayKey();
    if (state.quests && state.quests.day === day) return state.quests;
    state.quests = { day, ids: pickQuests(day), progress: {}, claimed: [] };
    saveState();
    return state.quests;
  }

  function bumpQuest(kind, n = 1) {
    const q = ensureQuests();
    q.progress[kind] = (q.progress[kind] || 0) + n;
    // 걸음마다 저장하지 않는다: app.js가 10초마다와 탭을 숨길 때 저장하고, 산책을 끝낼 때도 저장한다
    renderQuests();   // 산책 중에도 화면 안의 퀘스트 카드가 바로 바뀌도록 그린다
  }

  function claimQuest(id) {
    const q = ensureQuests();
    const def = QUEST_POOL.find((x) => x.id === id);
    if (!def || !q.ids.includes(id) || q.claimed.includes(id) || (q.progress[def.kind] || 0) < def.goal) return;
    q.claimed.push(id);
    state.coins += def.reward;
    if (session) session.coins += def.reward;
    saveState();
    renderTop();
    renderQuests();
    Sound.sfx('levelup');
    toast(`📜 퀘스트 완료! 🪙 +${def.reward}`);
  }

  function renderQuests() {
    const box = $('#walk-quests');
    if (!box) return;
    const q = ensureQuests();
    const defs = q.ids.map((id) => QUEST_POOL.find((x) => x.id === id)).filter(Boolean);
    const doneCount = defs.filter((d) => q.claimed.includes(d.id)).length;
    $('#walk-quest-count').textContent = `${doneCount} / ${defs.length}`;
    const html = defs.map((d) => {
      const now = Math.min(q.progress[d.kind] || 0, d.goal);
      const claimed = q.claimed.includes(d.id);
      const ready = !claimed && now >= d.goal;
      const action = claimed
        ? '<b class="quest-done">받음 ✔</b>'
        : ready ? `<button class="quest-claim" data-claim="${d.id}">🪙 ${d.reward} 받기</button>`
        : `<small class="quest-reward">🪙 ${d.reward}</small>`;
      return `<li class="${claimed ? 'is-done' : ''}"><span class="quest-what">${d.label}<small>${now} / ${d.goal} ${d.unit}</small></span>${action}</li>`;
    }).join('');
    box.innerHTML = html;
  }

  // ---------- 산책 기록 ----------
  // 산책을 끝낼 때마다 한 줄씩 남는다 (아무것도 안 한 산책은 남기지 않는다). 최근 50개까지 보관한다.
  const WALK_LOG_MAX = 300;   // 이만큼까지 남긴다 (넘으면 가장 오래된 것부터 지운다)
  const LOG_PAGE_SIZE = 6;    // 한 페이지에 보여 줄 기록 수
  let logPage = 0;            // 지금 보고 있는 페이지 (0부터, 0이 가장 최근)

  let lastLogAt = 0;   // 방금 끝낸 산책의 기록 시각 (소감을 이 기록에 붙인다, 0이면 기록이 없다)

  function saveWalkLog() {
    lastLogAt = 0;
    if (!session) return;
    if (!steps && !walkSeconds) return;
    const entry = {
      at: Date.now(), time: session.time, steps, seconds: walkSeconds,
      places: session.places.size, coins: session.coins, hearts: session.hearts,
      drinks: session.drinks, stamps: session.stamps.length, friends: session.friends.length,
      friendNames: [...new Set(session.friends)],   // 이번 산책에서 인사한 친구 이름 (중복 없이)
    };
    state.walkLog = [entry, ...(state.walkLog || [])].slice(0, WALK_LOG_MAX);
    lastLogAt = entry.at;
    logPage = 0;   // 새 산책 기록은 1페이지(가장 최근)에서 보인다
    saveState();
  }

  // 소감 칸: 기록이 있을 때만 보이고, 저장하면 그 산책 기록에 붙는다
  function resetNote() {
    $('#walk-note-card').hidden = !lastLogAt;
    $('#walk-note-input').value = '';
    $('#walk-note-msg').textContent = '';
    $('#walk-note-msg-box').hidden = true;
  }

  const NOTE_COINS = 5;   // 소감을 저장하면 주는 코인

  function saveNote() {
    const text = $('#walk-note-input').value.trim();
    const msg = $('#walk-note-msg');
    const entry = (state.walkLog || []).find((e) => e.at === lastLogAt);
    if (!entry) { msg.textContent = '저장할 산책 기록이 없어요.'; return; }
    if (!text) { msg.textContent = '소감을 한 줄 적어 주세요.'; return; }
    entry.note = text.slice(0, 60);
    // 소감은 산책마다 한 번만 코인을 준다 (고쳐서 다시 저장해도 또 받지 않는다)
    let reward = '';
    if (!entry.noted) {
      entry.noted = true;
      state.coins += NOTE_COINS;
      if (session) session.coins += NOTE_COINS;
      renderTop();
      reward = ` 🪙 +${NOTE_COINS}`;
    }
    saveState();
    renderWalkLog();
    msg.textContent = `저장되었어요! 적은 소감이 산책 기록에 반영되었어요 💗${reward}`;
    $('#walk-note-msg-box').hidden = false;
    say('소감 고마워요! 💗', 2000);
  }

  // 기록에 적힌 글을 HTML로 쓰이지 않게 바꾼다
  function noteText(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function renderWalkLog() {
    const box = $('#walk-log');
    if (!box) return;
    const list = state.walkLog || [];
    const totalSteps = list.reduce((a, e) => a + (e.steps || 0), 0);
    const totalSec = list.reduce((a, e) => a + (e.seconds || 0), 0);
    const cards = `🖼️ 포토카드 ${state.photoCards.length}장`;
    $('#walk-log-total').textContent = list.length
      ? `${list.length}번 · ${totalSteps.toLocaleString()}걸음 · ${fmtTime(totalSec)} · ${cards}`
      : cards;
    // 페이지 나누기: 가장 최근 기록이 1페이지에 온다
    const pages = Math.max(1, Math.ceil(list.length / LOG_PAGE_SIZE));
    logPage = Math.min(Math.max(0, logPage), pages - 1);
    const shown = list.slice(logPage * LOG_PAGE_SIZE, logPage * LOG_PAGE_SIZE + LOG_PAGE_SIZE);
    const pager = $('#walk-log-pager');
    if (pager) {
      pager.hidden = list.length <= LOG_PAGE_SIZE;
      $('#walk-log-page').textContent = `${logPage + 1} / ${pages}`;
      $('#walk-log-prev').disabled = logPage === 0;
      $('#walk-log-next').disabled = logPage >= pages - 1;
    }
    box.innerHTML = list.length ? shown.map((e) => {
      const d = new Date(e.at);
      const when = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      const t = TIMES[e.time] || { label: '산책', icon: '🐾' };
      const names = e.friendNames && e.friendNames.length ? `<small class="log-friends">만난 친구: ${e.friendNames.map((n) => `<span class="log-face" title="${noteText(n)}">${friendFace(friendByName(n))}</span>`).join('')}</small>` : '';
      const note = e.note ? `<small class="log-note">💬 ${noteText(e.note)}</small>` : '';
      return `<li><span class="log-when">${when}</span><span class="log-what">${t.icon} ${t.label} · ${e.steps.toLocaleString()}걸음 · ${fmtTime(e.seconds)}</span><small>장소 ${e.places} · 🪙 ${e.coins}</small>${names}${note}</li>`;
    }).join('') : '<li class="log-empty">아직 산책 기록이 없어요. 산책을 마치면 여기에 남아요.</li>';
  }

  // ---------- 옷 입기 ----------
  // 옷장(state.equipped)을 그대로 쓰기 때문에 여기서 입힌 옷은 우왕이 탭에서도 입고 있다.
  // 헤드셋은 산책할 때만 쓰는 소품이라 state.walkHeadset에 따로 저장한다.
  let dressStage = null;

  // 옷을 입힐 때 우왕이가 하는 말 (의상 id: 말)
  const DRESS_LINES = {
    headset: '헤드셋 끼니까 신나요 🎧♪',
    basic_cap: '학사모 쓰니까 졸업하는 기분이에요 🎓',
    basic_glasses: '뿔테 안경 쓰니까 공부 잘할 것 같아요 📚',
    jeju: '감귤 모자 상큼해요! 🍊',
    tokyo: '벚꽃 머리핀, 봄 같아요 🌸',
    osaka: '초롱 들고 가면 밤길도 환해요 🏮',
    fukuoka: '걸을 때마다 딸랑딸랑 🎐',
    taipei: '버블티 마시면서 걸을래요 🧋',
    danang: '밀짚모자 쓰니까 여름 같아요 👒',
    bangkok: '재스민 꽃 향기가 솔솔 🌼',
    singapore: '비가 와도 걱정 없어요 🌂',
    paris: '오늘은 화가 우왕이에요 🎨',
    london: '신사 우왕이, 인사드려요 🎩',
    rome: '젤라토 녹기 전에 출발! 🍦',
    hawaii: '알로하~ 꽃목걸이 예뻐요 🌺',
    la: '선글라스 끼니까 멋쟁이 같아요 😎',
    newyork: '야구 모자 쓰고 씩씩하게! 🧢',
    sydney: '솔못에 들어가려는 건 아니에요… 🤿',
  };
  const UNDRESS_LINES = ['벗었어요, 가벼워요!', '이건 다음에 입을래요', '홀가분해요 🐾'];

  function sayDress(text) {
    const el = $('#wd-say');
    el.textContent = text;
    el.classList.remove('pop');
    void el.offsetWidth;   // 같은 애니메이션을 다시 재생
    el.classList.add('pop');
  }

  function pickOne(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function dressUp(id) {
    const box = $('#walk-dress-mascot');
    let on;
    if (id === 'headset') {
      state.walkHeadset = !state.walkHeadset;
      on = state.walkHeadset;
    } else {
      if (!ownedOutfitIds().includes(id)) return;
      const { slot } = OUTFITS[id];
      state.equipped[slot] = state.equipped[slot] === id ? null : id;
      on = state.equipped[slot] === id;
    }
    saveState();
    renderDress();
    renderHeadset();
    if (on) {
      const o = OUTFITS[id];
      sayDress(DRESS_LINES[id] || `${o.emoji} ${o.name} 잘 어울려요?`);
      playMascot(box, 'joy', 600);
    } else {
      sayDress(pickOne(UNDRESS_LINES));
    }
  }

  // 오늘의 코디: 부위마다 가진 옷 중 하나를 고르거나 비워 두고, 헤드셋도 반반으로 정한다
  function randomOutfit() {
    const box = $('#walk-dress-mascot');
    const owned = ownedOutfitIds();
    const before = JSON.stringify([state.equipped, state.walkHeadset]);
    for (let tries = 0; tries < 5; tries++) {
      const bySlot = {};
      owned.forEach((id) => { (bySlot[OUTFITS[id].slot] = bySlot[OUTFITS[id].slot] || []).push(id); });
      Object.keys(state.equipped).forEach((slot) => {
        const choices = bySlot[slot] || [];
        state.equipped[slot] = choices.length && Math.random() < 0.7 ? pickOne(choices) : null;
      });
      // 가진 옷이 있으면 적어도 하나는 입힌다
      if (owned.length && !Object.values(state.equipped).some(Boolean)) {
        const id = pickOne(owned);
        state.equipped[OUTFITS[id].slot] = id;
      }
      state.walkHeadset = Math.random() < 0.5;
      if (JSON.stringify([state.equipped, state.walkHeadset]) !== before) break;   // 방금이랑 똑같으면 다시
    }
    saveState();
    renderDress();
    renderHeadset();
    playMascot(box, 'joy', 600);
    Sound.sfx('ding');
    const worn = Object.values(state.equipped).filter(Boolean).map((id) => OUTFITS[id].emoji);
    if (state.walkHeadset) worn.push('🎧');
    sayDress(!owned.length
      ? (state.walkHeadset ? '오늘은 헤드셋! 여행 가서 옷도 받아 와요 ✈️' : '오늘은 그냥 나갈래요! 여행 가서 옷도 받아 와요 ✈️')
      : `오늘의 코디 완성! ${worn.join('')} ✨`);
  }


  function renderDress() {
    const pet = state.pet;
    const box = $('#walk-dress-mascot');
    if (dressStage !== pet.stage) { mountMascot(box, pet.stage); dressStage = pet.stage; }
    dressMascot(box, true);
    setMascot(box, { mood: 'happy', sleep: false, sick: pet.sick, headset: Boolean(state.walkHeadset) });
    $('#dress-room').dataset.time = timeOfDay();   // 창밖이 실제 시간대를 따라간다

    const headsetOn = Boolean(state.walkHeadset);
    const owned = ownedOutfitIds();
    const item = (id, emoji, name, sub, on) => `<button class="wear${on ? ' on' : ''}" data-dress="${id}" aria-pressed="${on}">`
      + `<span>${emoji}</span>${name}<small>${sub}${on ? ' · 입는 중' : ''}</small></button>`;
    $('#wd-list').innerHTML = [
      item('headset', '🎧', '헤드셋', '산책 소품', headsetOn),
      ...owned.map((id) => item(id, outfitIcon(OUTFITS[id]), OUTFITS[id].name, SLOT_NAMES[OUTFITS[id].slot], state.equipped[OUTFITS[id].slot] === id)),
    ].join('');

    const worn = Object.entries(state.equipped).filter(([, id]) => id && OUTFITS[id]).map(([, id]) => `${outfitIcon(OUTFITS[id])} ${OUTFITS[id].name}`);
    if (headsetOn) worn.push('🎧 헤드셋');
    $('#wd-worn').innerHTML = worn.length ? `입은 옷: ${worn.join(', ')}` : '지금은 아무것도 안 입었어요. 그대로 나가도 좋아요!';
    $('#wd-place-name').textContent = chosenName;
    $('#btn-walk-start').disabled = !chosenName || Boolean(blockReason());
  }

  // ---------- 시간대 ----------
  // 실제 시계에 맞춰 화면 색과 우왕이의 말이 바뀐다
  const TIMES = {
    morning: { label: '아침', icon: '☀️', lines: ['아침 공기가 상쾌해요 ☀️', '1교시 가는 사람들이 바빠 보여요', '아침 산책은 기분이 좋아요 🌤️', '이슬 맺힌 풀이 반짝반짝해요 💧', '일찍 일어나니까 뿌듯해요 🌅', '커피 냄새가 솔솔 나요 ☕'] },
    day: { label: '낮', icon: '🌤️', lines: ['햇빛이 따뜻해요 🌤️', '점심 먹고 산책하기 딱 좋아요', '낮에는 캠퍼스가 북적북적해요', '그늘에서 잠깐 쉬고 싶어요 🌳', '구름이 천천히 흘러가요 ☁️', '매점 앞이 제일 시끌벅적해요 🍢'] },
    evening: { label: '저녁', icon: '🌇', lines: ['노을이 예뻐요 🌇', '하늘이 주황색으로 물들었어요', '저녁 바람이 선선해요', '집에 가는 사람들이 많아요 🚶', '가로등이 하나둘 켜져요 💡', '오늘 하루도 수고했어요 🌙'] },
    night: { label: '밤', icon: '🌙', lines: ['밤 산책은 조금 무섭지만 신나요 🌙', '가로등 불빛이 예뻐요 💡', '졸리지만 조금만 더 걸어요 😪', '별이 보이는 것 같아요 ⭐', '조용해서 발소리가 크게 들려요 👣', '창문에 불 켜진 방이 많아요 🏠'] },
  };

  function timeOfDay(date = new Date()) {
    const h = date.getHours();
    if (h >= 5 && h < 10) return 'morning';
    if (h >= 10 && h < 17) return 'day';
    if (h >= 17 && h < 19) return 'evening';
    return 'night';
  }

  function applyTime() {
    const tint = $('#walk-tint');
    const now = timeOfDay();
    if (tint.dataset.time !== now) tint.dataset.time = now;
  }

  // 가끔(5번에 1번) 장소 감상 대신 시간대에 맞는 말을 한다
  function timeComment() {
    return Math.random() < 0.2 ? TIMES[timeOfDay()].lines[Math.floor(Math.random() * TIMES[timeOfDay()].lines.length)] : '';
  }

  // ---------- 이번 산책 기록 (끝낼 때 요약으로 보여 준다) ----------
  let session = null;

  function newSession() {
    session = { coins: 0, hearts: 0, drinks: 0, stamps: [], friends: [], places: new Set(), time: timeOfDay(), booths: 0 };
  }

  function fmtTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m >= 60
      ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  let summaryStage = null;

  // 방금 끝낸 산책 요약 (우왕이에게 산책 어땠는지 물을 때 쓴다)
  let lastWalk = null;

  // 우왕이에게 산책 어땠는지 묻는다: 우왕이가 이번 산책에 맞는 말을 말풍선으로 한다
  function askUwangAboutWalk() {
    const w = lastWalk || { steps: 0, minutes: 0, friends: 0, places: 0, booths: 0, drinks: 0 };
    const lines = [];
    // 걸은 양
    if (w.steps >= 2000) lines.push('학교가 넓어서 다리가 아파요… 그래도 풍경 보며 걸으니 재밌었어요!');
    else if (w.steps >= 1500) lines.push('많이 걸어서 다리가 조금 뻐근해요! 그래도 정말 재밌었어요 😊');
    else if (w.steps >= 500) lines.push(`${w.steps.toLocaleString()}걸음 걸었어요. 오늘 산책 꽤 괜찮았죠?`);
    else lines.push('조금 걸었지만 바람 쐬니까 기분이 좋았어요!');
    if (w.minutes >= 10) lines.push(`${w.minutes}분이나 걸었어요! 오늘 나 엄청 씩씩했죠?`);
    if (w.minutes > 0 && w.minutes < 5) lines.push('짧게 걸었지만 기분 전환은 확실히 했어요!');
    // 본 것과 들른 곳
    if (w.places >= 5) lines.push('여기저기 많이 들러서 학교 구경을 제대로 한 기분이에요!');
    else if (w.places >= 3) lines.push('여러 곳을 들러서 구경할 게 많았어요!');
    if (w.places >= 2) lines.push('학교 안 풍경을 보며 걷다 보니 애교심이 생겨요! 🏫');
    lines.push('캠퍼스 바람이 시원해서 좋았어요 🍃', '벤치 옆을 지날 때 잠깐 앉고 싶었어요');
    // 사람들
    if (w.friends) lines.push(`친구 ${w.friends}명이랑 인사해서 정말 즐거웠어요!`);
    else lines.push('혼자 걸어도 나름 재밌었어요. 다음엔 친구를 찾아봐요!');
    // 한 일
    if (w.booths) lines.push('사진도 찍어서 오늘 추억이 하나 생겼어요 📸');
    if (w.drinks) lines.push('목마를 때 물도 마셔서 개운해요 💧');
    lines.push('다음 산책은 어디로 갈까요? 🐾', '오늘 산책 최고였어요! 또 같이 걸어요 🐾');
    const text = lines[Math.floor(Math.random() * lines.length)];
    const speech = $('#ws-speech');
    speech.textContent = text;
    speech.hidden = false;
    $('#btn-summary-ask').hidden = true;   // 말걸기처럼, 누르면 버튼은 사라지고 말풍선이 남는다
    playMascot($('#walk-summary-mascot'), 'joy', 600);
    Sound.sfx('ding');
  }

  function renderSummary() {
    const s = session || { coins: 0, hearts: 0, stamps: [], friends: [], places: new Set(), time: timeOfDay(), booths: 0 };
    lastWalk = { steps, minutes: Math.floor(walkSeconds / 60), friends: s.friends.length, places: s.places.size, booths: s.booths || 0, drinks: s.drinks || 0 };
    $('#ws-speech').hidden = true;
    $('#btn-summary-ask').hidden = false;
    const t = TIMES[s.time];
    $('#ws-title').textContent = `${t.label} 산책 끝! ${t.icon}`;
    $('#ws-sub').textContent = steps > 0
      ? `우왕이와 ${steps.toLocaleString()}걸음 걸었어요.${s.hearts ? ` 산책 덕분에 💗 행복이 ${s.hearts} 올랐어요.` : ''}${s.drinks ? ` 물도 💧 ${s.drinks}번 마셨어요.` : ''}`
      : '이번엔 거의 안 걸었어요. 다음엔 같이 더 걸어요!';
    $('#ws-steps').textContent = steps.toLocaleString();
    $('#ws-time').textContent = fmtTime(walkSeconds);
    $('#ws-coins').textContent = `🪙 ${s.coins}`;
    $('#ws-places').textContent = `${s.places.size}곳`;

    $('#ws-stamps-row').hidden = !s.stamps.length;
    $('#ws-stamps').innerHTML = s.stamps.map((n) => `<span class="walk-stamp" title="${n}"><span>${placeIcon(n)}</span><small>${n}</small></span>`).join('');
    const met = friendList().filter((f) => s.friends.includes(f.name));
    $('#ws-friends-row').hidden = !met.length;
    $('#ws-friends').innerHTML = met.map((f) => `<span class="walk-friend-badge"><span class="face">${friendFace(f)}</span><small>${f.name}</small></span>`).join('');

    const pet = state.pet;
    const box = $('#walk-summary-mascot');
    if (summaryStage !== pet.stage) { mountMascot(box, pet.stage); summaryStage = pet.stage; }
    dressMascot(box, true);
    setMascot(box, { mood: 'happy', sleep: false, sick: pet.sick, headset: Boolean(state.walkHeadset) });
    if (steps > 0) setTimeout(() => playMascot(box, 'joy', 600), 300);
    // 이번 산책에서 친구를 만났을 때만 인생네컷 버튼을 보여 준다
    // 인생네컷은 항상 찍을 수 있다 (친구가 있으면 함께, 없으면 우왕이 혼자)
    // 산책 한 번에 인생네컷은 BOOTH_PER_WALK번까지 찍을 수 있다
    const left = BOOTH_PER_WALK - (s.booths || 0);
    $('#btn-summary-booth').hidden = false;
    $('#btn-summary-booth').disabled = left <= 0;
    $('#booth-help').hidden = false;
    const base = '우왕이와 사진 한컷 어때요?';
    $('#booth-help').textContent = left > 0 ? `${base} (찍을 수 있는 횟수: ${left}번)` : '이번 산책의 인생네컷을 모두 찍었어요';
  }

  function startWalk() {
    if (blockReason()) return;
    setStep('walk');
    newSession();
    sickNoted = false;
    steps = 0;
    walkSeconds = 0;
    heartProgress = 0;
    drankAt = 0;
    thirsty = false;
    renderDrink();
    const startPano = chosenStartId();
    if (pano && startPano) {
      // 고른 장소로 옮긴다
      movePano(startPano);
      pano.setPov({ heading: 0, pitch: 0 });
      startId = startPano;
    }
    render();   // 지도가 아직 없으면 여기서 고른 장소로 불러온다
    if (pano) {
      heading = target = pano.getPov().heading;
      depth = 0;
      keyTurn = false;
      goal = null;
      held.clear();
      loop();
    }
    const t = TIMES[timeOfDay()];
    applyTime();
    say(chosenName ? `${chosenName}에서 ${t.label} 산책 출발! ${t.icon}` : `${t.label} 산책 출발! ${t.icon}`, 2000);
    updateMusic();   // 버튼을 누른 순간이라 브라우저가 소리를 허락한다
    stampedPano = '';
    setTimeout(checkStamp, 800);   // 출발 장소도 도장을 찍는다 (지도가 자리를 잡은 뒤)
    setTimeout(showGuide, 1500);   // 처음 산책이면 안내 말풍선을 띄운다
  }

  // 산책에서 돌아오면 옷과 헤드셋을 모두 벗는다 (다음 산책 때 다시 골라 입는다)
  function undressAll() {
    Object.keys(state.equipped).forEach((slot) => { state.equipped[slot] = null; });
    state.walkHeadset = false;
    saveState();
    renderHeadset();
  }

  function endWalk() {
    $('#walk-guide').hidden = true;   // 안내가 아직 남아 있어도 산책이 끝나면 닫는다 (다음 산책에 이어서 본다)
    saveWalkLog();
    resetNote();
    setStep('summary');
    renderSummary();   // 요약에는 입고 나갔던 모습 그대로 보여 준다
    undressAll();
    Sound.sfx('ding');
  }

  // 산책 탭을 열 때마다 체크 화면부터 보여 준다
  function open() {
    setStep('check');
  }

  // ---------- 산책 도장 ----------
  // 이름표가 있는 장소에 도착한 뒤, 그 자리에서 10초 동안 머물며 둘러보면 도장을 찍는다.
  // (걸을 때마다 다음 사진으로 넘어가므로 걸음 대신 머문 시간을 센다.) 처음 받은 도장이면 코인 3개, 다 모으면 코인 30개 보너스.
  const STAMP_SECONDS = 10;
  const STAMP_COINS = 3;
  const STAMP_ALL_BONUS = 30;
  let stampedPano = '';   // 지금 걸음을 세고 있는 사진
  let hereName = '';      // 지금 장소 이름 (이름표에 없으면 '')
  let hereSeconds = 0;    // 이 장소에 와서 머문 시간(초)
  let hereDone = false;   // 이번 방문에서 도장을 이미 찍었는지

  function namedHere() {
    const names = typeof WALK_PLACES === 'undefined' ? {} : WALK_PLACES;
    const id = plainId(pano.getPano());
    const key = Object.keys(names).find((k) => plainId(k) === id);
    return key ? names[key] : '';
  }

  // 새 장소에 도착하면 머문 시간을 0부터 센다
  function checkStamp() {
    if (!pano || !inWalk || pano.getStatus() !== 'OK') return;
    const here = pano.getPano();
    if (here === stampedPano) return;
    stampedPano = here;
    hereName = namedHere();
    if (hereName && session && !session.places.has(hereName)) { session.places.add(hereName); bumpQuest('places', 1); }
    hereSeconds = 0;
    hereDone = false;
    setFriend(hereName);   // 이 장소에 사는 친구
    // 선물 상자는 장소 이름이 붙은 사진이 아니어도, 장소에서 150m 안이면 나온다 (친구보다 쉽게 찾도록)
    setGift(hereName || nearName());
    renderStats();
    if (hereName && !state.walkStamps[hereName]) {
      setTimeout(() => say(`여기서 ${STAMP_SECONDS}초 동안 둘러보면 도장을 받아요 🏅`, 2600), 2600);
    }
  }

  // 도장까지 남은 시간(초) (도장을 받을 수 없는 곳이면 0)
  function stampSecondsLeft() {
    if (!hereName || hereDone) return 0;
    return Math.max(0, STAMP_SECONDS - hereSeconds);
  }

  // 1초마다 (tick): 이름 있는 장소에 서 있으면 머문 시간을 센다 (걸어가는 중이나 못 걸을 때는 세지 않는다)
  function stayHere() {
    if (!hereName || hereDone || !inWalk || traveling || !canWalk()) return;
    hereSeconds++;
    renderStats();
    if (hereSeconds >= STAMP_SECONDS) awardStamp(hereName);
  }

  function awardStamp(name) {
    hereDone = true;
    const record = state.walkStamps[name];
    if (record) {
      // 이미 받은 도장: 방문 횟수만 늘린다
      record.visits++;
      saveState();
      renderStamps();
      renderStats();
      return;
    }
    // 처음 온 장소: 도장 + 코인
    state.walkStamps[name] = { first: Date.now(), visits: 1 };
    state.coins += STAMP_COINS;
    if (session) { session.coins += STAMP_COINS; session.stamps.push(name); }
    bumpQuest('stamps', 1);
    const total = placeNames().length;
    const got = placeNames().filter((n) => state.walkStamps[n]).length;
    const allDone = !state.walkStampsDone && total > 0 && got >= total;
    if (allDone) {
      state.walkStampsDone = true;
      state.coins += STAMP_ALL_BONUS;
      if (session) session.coins += STAMP_ALL_BONUS;
    }
    saveState();
    renderTop();
    renderStamps();
    renderStats();
    popStamp(name);
    Sound.sfx('ding');
    toast(`🏅 ${name} 도장 획득! 🪙 +${STAMP_COINS} (${got}/${total})`);
    if (allDone) {
      setTimeout(() => {
        Sound.sfx('levelup');
        toast(`🎉 산책 도장을 모두 모았어요! 보너스 🪙 +${STAMP_ALL_BONUS}`);
        say('학교를 다 돌아봤어요! 최고예요 🎉', 3000);
      }, 2600);
    }
  }

  // 화면 가운데에 도장이 쾅 찍히는 효과
  function popStamp(name) {
    const el = $('#walk-stamp-pop');
    el.innerHTML = `<span>${placeIcon(name)}</span><b>${name}</b><small>도장 획득!</small>`;
    el.hidden = false;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(popStamp.timer);
    popStamp.timer = setTimeout(() => { el.hidden = true; }, 2200);
  }

  function renderStamps() {
    const list = placeNames();
    const got = list.filter((n) => state.walkStamps[n]).length;
    $('#walk-stamp-count').textContent = `${got} / ${list.length}`;
    $('#walk-stamps').innerHTML = list.map((name) => {
      const rec = state.walkStamps[name];
      return rec
        ? `<div class="walk-stamp" title="${name} · ${rec.visits}번 방문"><span>${placeIcon(name)}</span><small>${name}</small></div>`
        : `<div class="walk-stamp locked" title="아직 안 가 본 곳"><span>?</span><small>${name}</small></div>`;
    }).join('');
  }

  // ---------- 배경음 ----------
  // 산책 화면에 있는 동안 지금 장소 분위기에 맞는 음악을 튼다 (maps-config.js의 WALK_MUSIC)
  let musicOn = true;

  function updateMusic() {
    const visible = !$('#screen-walk').hidden && inWalk;
    if (!visible || !musicOn || !pano) { Sound.bgm(''); return; }
    const map = typeof WALK_MUSIC === 'undefined' ? {} : WALK_MUSIC;
    const fallback = typeof WALK_MUSIC_DEFAULT === 'undefined' ? 'campus' : WALK_MUSIC_DEFAULT;
    Sound.bgm(map[moodName()] || fallback);
  }

  // ---------- 첫 산책 안내 ----------
  // 처음 산책을 시작하면 말풍선으로 조작법과 볼거리를 한 번 알려 준다. 건너뛰거나 다 보면 다시 뜨지 않는다.
  const GUIDE_STEPS = [
    { icon: '🐾', text: '처음 나왔어요! 여기는 우왕이와 함께 걷는 산책길이에요.' },
    { icon: '👣', text: '바닥의 화살표를 누르면 그쪽으로 걸어가요. 화면을 끌어서 둘러보고, 키보드 방향키로도 움직일 수 있어요. 오른쪽 위 👀 버튼으로 우왕이 눈으로 볼 수도 있어요.' },
    { icon: '📍', text: '📍 목록에서 장소를 고르면 우왕이가 그곳까지 걸어가요. 🗺️ 지도로 바꿔 볼 수도 있어요.' },
    { icon: '💧', text: '목이 마르면 💧 물을 마셔요. 🎵 배경음과 🎧 헤드셋도 바꿀 수 있어요.' },
    { icon: '🎁', text: '곳곳에 선물 상자가 숨어 있어요! 장소 근처에 가서 화면을 둘러보고, 반짝이는 상자를 누르면 열려요.' },
    { icon: '📸', text: '산책이 끝나면 인생네컷을 찍을 수 있어요. 친구를 만났다면 함께 찍히고, 혼자서도 찍을 수 있어요!' },
    { icon: '🤝', text: '숨은 친구를 찾고 📜 오늘의 퀘스트를 끝내면 코인이 쌓여요. 아프면 걷지 않으니 꼭 돌봐 주세요!' },
  ];
  let guideStep = 0;

  function showGuide() {
    if (state.walkGuideSeen || !inWalk) return;
    guideStep = 0;
    renderGuide();
    $('#walk-guide').hidden = false;
  }

  function renderGuide() {
    const s = GUIDE_STEPS[guideStep];
    $('#guide-icon').textContent = s.icon;
    $('#guide-text').textContent = s.text;
    $('#guide-count').textContent = `${guideStep + 1} / ${GUIDE_STEPS.length}`;
    $('#guide-dots').innerHTML = GUIDE_STEPS.map((_, i) => `<i class="${i <= guideStep ? 'on' : ''}"></i>`).join('');
    $('#guide-next').textContent = guideStep === GUIDE_STEPS.length - 1 ? '시작하기' : '다음';
    const bubble = $('#walk-guide .guide-bubble');
    bubble.classList.remove('pop');
    void bubble.offsetWidth;   // 같은 애니메이션을 다시 돌리려고 강제로 다시 그린다
    bubble.classList.add('pop');
  }

  function nextGuide() {
    if (guideStep < GUIDE_STEPS.length - 1) { guideStep++; renderGuide(); }
    else closeGuide();
  }

  function closeGuide() {
    $('#walk-guide').hidden = true;
    if (!state.walkGuideSeen) { state.walkGuideSeen = true; saveState(); }
  }

  // ---------- 인생네컷 (우왕이와 이번 산책에서 만난 친구) ----------
  // 프레임(기본·프리미엄) → 컷 수(네컷·여섯컷)를 고르고, 그림으로 찍어서 출력 화면에 보여 준다.
  // 스트리트 뷰 사진을 쓰지 않으니, 저장은 하지 않고 화면에만 보여 준다.
  const BOOTH_CELL_W = 240;
  const BOOTH_CELL_H = 180;
  const BOOTH_HEAD_H = 40;   // 위쪽 제목 띠
  const BOOTH_FOOT_H = 44;   // 아래쪽 날짜 띠
  const BOOTH_POND_IMG = 'assets/solmot.png'; // 실제 솔못 사진이 있으면 이 파일을 쓴다
  const BOOTH_HAPPY = 5;                      // 인생네컷을 다 찍으면 올라가는 행복도
  const BOOTH_PER_WALK = 2;                   // 산책 한 번에 찍을 수 있는 인생네컷 수
  const BOOTH_MARGIN_BASIC = 8;               // 기본 프레임: 검정 테두리 두께
  const BOOTH_MARGIN_PREMIUM = 22;            // 프리미엄 프레임: 우왕이 그림이 들어가는 테두리 두께
  let boothBusy = false;

  // 친구 그림을 이미지로 바꾼다 (파일 그림이면 그대로, SVG 그림이면 이미지로 만든다)
  function friendArtImage(f) {
    return new Promise((resolve) => {
      if (f.image) {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = f.image;
        return;
      }
      const art = typeof FRIEND_ART === 'undefined' ? null : FRIEND_ART[f.art];
      if (!art || !art.includes('<svg')) { resolve(null); return; }
      const svg = art.includes('xmlns=') ? art : art.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  }

  function loadBoothImage(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  // 컷 배치: 네컷은 한 줄로 네 장, 여섯컷은 두 칸씩 세 줄
  function boothLayout(count) {
    const cols = count === 6 ? 2 : 1;
    const rows = Math.ceil(count / cols);
    return { cols, rows, W: cols * BOOTH_CELL_W, H: BOOTH_HEAD_H + rows * BOOTH_CELL_H + BOOTH_FOOT_H };
  }

  function todayText() {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}.${mm}.${dd}`;
  }

  function drawBoothHeader(g, W) {
    g.fillStyle = '#f4ead6';
    g.fillRect(0, 0, W, BOOTH_HEAD_H);
    g.fillStyle = '#8c1d40';
    g.font = '16px "Galmuri11", "Malgun Gothic", sans-serif';
    g.textAlign = 'center';
    g.fillText('우왕이 인생네컷', W / 2, 26);
  }

  // 아래 띠: 오늘 날짜
  function drawBoothFoot(g, W, H) {
    g.fillStyle = '#f4ead6';
    g.fillRect(0, H - BOOTH_FOOT_H, W, BOOTH_FOOT_H);
    g.fillStyle = '#8c1d40';
    g.font = '16px "Galmuri11", "Malgun Gothic", sans-serif';
    g.textAlign = 'center';
    g.fillText(todayText(), W / 2, H - 16);
  }

  // 말풍선 문구: 컷마다 겹치지 않게 골라 쓴다 (글자 수가 많아도 칸 안에 들어가게 말풍선 위치를 조정한다)
  const BOOTH_SAYS = ['같이 찍어요!', '헤헤, 신나요!', '아 찍힌다!', '오늘 최고!', '봄이다~', '반짝반짝!', '노래 듣는 중!', '고마워요!',
    '오늘 학식은 뭘까?', '이천원의 저녁밥 먹자~', '오늘 하루도 수고했어', '커피 한 잔 하고 갈까?', '과제는 언제 끝나지…',
    '월요일이 또 왔어', '주말엔 뭐 하지?', '배고파요 밥 줘!', '산책 최고다~', '친구가 최고야!', '집에 가기 싫다…', '오늘도 맑음!', '체력 충전 완료!'];

  // 컷마다 다른 연출: 기울기, 좌우 반전, 크기, 말풍선
  // bg는 기본 프레임(색만 있는 화면)의 배경색, ink는 글자색이다
  const BOOTH_VARIANTS = [
    { bg: '#fde8ee', tilt: 0, flip: false, scale: 1, bounce: 0 },
    { bg: '#e6f4ff', tilt: -9, flip: false, scale: 1, bounce: 14, ink: '#1d3b5c' },
    { bg: '#fff4d6', tilt: 0, flip: true, scale: 1.06, bounce: 6, ink: '#6b4a00' },
    { bg: '#e9f7e8', tilt: 7, flip: false, scale: 0.95, bounce: 0, ink: '#1e4d2b' },
    { bg: '#ffeef5', tilt: 4, flip: false, scale: 1, bounce: 4 },
    { bg: '#2b2d55', tilt: -4, flip: false, scale: 1.02, bounce: 10, ink: '#ffffff' },
    { bg: '#f3eaff', tilt: -5, flip: true, scale: 1, bounce: 0 },
    { bg: '#fff0e0', tilt: 0, flip: false, scale: 1.04, bounce: 8 },
  ];

  // 프리미엄 프레임 배경: 솔못(연못)을 그린다 (실제 사진 파일이 있으면 그것을 쓴다)
  function drawPond(g, y, W, H) {
    const sky = g.createLinearGradient(0, y, 0, y + 90);
    sky.addColorStop(0, '#9fd8ff');
    sky.addColorStop(1, '#e8f7ff');
    g.fillStyle = sky;
    g.fillRect(0, y, W, 90);
    // 멀리 나무 줄
    g.fillStyle = '#8fca8a';
    for (let xx = -10; xx < W + 20; xx += 26) {
      g.beginPath(); g.arc(xx, y + 84, 22, 0, Math.PI * 2); g.fill();
    }
    // 연못 물
    const water = g.createLinearGradient(0, y + 80, 0, y + H);
    water.addColorStop(0, '#7fc9e6');
    water.addColorStop(1, '#4fa6cc');
    g.fillStyle = water;
    g.fillRect(0, y + 80, W, H - 80);
    // 물결 무늬
    g.strokeStyle = 'rgba(255, 255, 255, .45)';
    g.lineWidth = 1.5;
    for (let yy = y + 98; yy < y + H; yy += 22) {
      for (let xx = 10; xx < W; xx += 46) {
        g.beginPath();
        g.moveTo(xx, yy);
        g.quadraticCurveTo(xx + 11, yy - 4, xx + 22, yy);
        g.stroke();
      }
    }
    // 연잎
    g.fillStyle = '#5fb36a';
    [[30, y + 150, 10], [196, y + 124, 9], [212, y + 166, 11]].forEach(([x, yy, r]) => {
      g.beginPath(); g.arc(x, yy, r, 0.2, Math.PI * 2 - 0.2); g.lineTo(x, yy); g.fill();
    });
    // 물가 둑
    g.fillStyle = '#a8dd8f';
    g.beginPath();
    g.moveTo(0, y + 76); g.lineTo(W, y + 76); g.lineTo(W, y + 84); g.lineTo(0, y + 92);
    g.fill();
  }

  // 프리미엄 배경 사진을 칸에 꽉 차게 맞춘다 (가운데 기준으로 잘린다)
  function drawPondFrame(g, y, W, H, img) {
    if (!img) { drawPond(g, y, W, H); return; }
    const s = Math.max(W / img.naturalWidth, H / img.naturalHeight);
    const dw = img.naturalWidth * s;
    const dh = img.naturalHeight * s;
    g.drawImage(img, (W - dw) / 2, y + (H - dh) / 2, dw, dh);
  }

  // 말풍선: 흰 바탕, 버건디 도트 테두리, 꼬리 한 칸
  function drawBubble(g, text, x, y) {
    g.font = '12px "Galmuri11", "Malgun Gothic", sans-serif';
    g.textAlign = 'left';
    const w = g.measureText(text).width + 14;
    x = Math.max(6, Math.min(x, BOOTH_CELL_W - w - 6));
    g.fillStyle = '#fffaf0';
    g.fillRect(x, y, w, 22);
    g.strokeStyle = '#4a0d22';
    g.lineWidth = 2;
    g.strokeRect(x + 1, y + 1, w - 2, 20);
    g.fillStyle = '#4a0d22';
    g.fillText(text, x + 7, y + 15);
  }

  // 한 컷 (cellX, cellY 자리에 240x180으로 그린다)
  function drawBoothFrame(g, cellX, cellY, uImg, friends, v, frame, pondImg, label) {
    const W = BOOTH_CELL_W;
    const H = BOOTH_CELL_H;
    const y = 0;
    const premium = frame === 'premium';
    // 프리미엄 배경은 밝은 편이라 글자색을 어두운 버건디로 통일한다
    const ink = premium ? '#4a0d22' : (v.ink || '#4a0d22');
    g.save();
    g.translate(cellX, cellY);
    g.beginPath();
    g.rect(0, y, W, H);
    g.clip();
    if (premium) {
      drawPondFrame(g, y, W, H, pondImg);
    } else {
      g.fillStyle = v.bg;
      g.fillRect(0, y, W, H);
    }

    friends.forEach((f, i) => {
      const size = 66;
      const x = 118 + i * 36;
      const top = y + 58 - (i % 2) * 14 - (i % 2 === 0 ? v.bounce : 0);
      if (f.img) g.drawImage(f.img, x, top, size, size);
    });

    const baseH = 118;
    const uH = baseH * v.scale;
    const uW = uImg ? (uImg.naturalWidth / uImg.naturalHeight) * uH : uH;
    const cx = 20 + uW / 2;
    const cy = y + 52 + uH / 2;
    g.save();
    g.translate(cx, cy);
    g.rotate((v.tilt * Math.PI) / 180);
    if (v.flip) g.scale(-1, 1);
    if (uImg) g.drawImage(uImg, -uW / 2, -uH / 2, uW, uH);
    g.restore();

    drawBubble(g, v.say, 96, y + 10);

    g.fillStyle = ink;
    g.font = '12px "Galmuri11", "Malgun Gothic", sans-serif';
    g.textAlign = 'right';
    g.fillText(label, W - 10, y + H - 8);
    g.restore();

    g.strokeStyle = '#4a0d22';
    g.lineWidth = 2;
    g.strokeRect(cellX + 1, cellY + 1, W - 2, H - 2);
  }

  // ----- 단계별 선택 (같은 자리에 버튼 두 개씩 바꿔 보여 준다) -----
  function askBooth(title, options, onPick) {
    const box = $('#booth-frames');
    box.innerHTML = '';
    options.forEach((o) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `booth-frame-btn tone-${o.tone || 'pink'}`;
      b.innerHTML = `<span>${o.label}</span><small>${o.sub}</small>`;
      b.addEventListener('click', () => onPick(o.value));
      box.appendChild(b);
    });
    box.hidden = false;
    $('#booth-status').textContent = title;
  }

  // 찍기 전 화면: 프레임 고르기. 찍는 중·출력 중에는 숨긴다.
  function openBooth() {
    if (boothBusy) return;
    if (session && (session.booths || 0) >= BOOTH_PER_WALK) {
      toast(`이번 산책에서는 인생네컷을 ${BOOTH_PER_WALK}번 찍었어요`);
      return;
    }
    $('#booth').hidden = false;
    $('#booth-title').hidden = true;
    $('#booth-paper').hidden = true;
    $('#booth-again').hidden = true;
    askBooth('프레임을 골라 주세요', [
      { label: '기본 프레임', sub: '색만 있는 화면', value: 'basic', tone: 'pink' },
      { label: '프리미엄 프레임', sub: `솔못 배경 · 코인 ${BOOTH_PREMIUM_COST}개`, value: 'premium', tone: 'mint' },
    ], pickFrame);
  }

  // 프리미엄 프레임은 코인을 쓴다. 모자라면 알려 주고, 고르는 순간 뺀다.
  const BOOTH_PREMIUM_COST = 3;

  // 프레임을 고르면 바로 네컷을 찍는다
  function pickFrame(frame) {
    if (frame === 'premium') {
      if (state.coins < BOOTH_PREMIUM_COST) {
        toast(`코인이 부족해요 (프리미엄 프레임 🪙${BOOTH_PREMIUM_COST}, 가진 코인 🪙${state.coins})`);
        return;
      }
      state.coins -= BOOTH_PREMIUM_COST;
      saveState();
      renderTop();
    }
    if (session) session.booths = (session.booths || 0) + 1;   // 이번 산책에서 찍은 횟수
    takeBooth(frame, 4);
  }

  // 찍기: 카운트다운 → 찰칵 → 전부 찍으면 출력 모션
  // 출력용 테두리: 기본은 검정 테두리, 프리미엄은 분홍·민트 체크 테두리
  function drawBoothBorder(g, CW, CH, M, frame) {
    if (frame !== 'premium') return;   // 기본 프레임은 채워 둔 검정 바탕이 테두리가 된다
    // 프리미엄: 솔못(연못) 느낌의 물결 무늬와 연잎. 안쪽 사진판은 나중에 그 위에 그려서 가장자리만 보인다.
    const water = g.createLinearGradient(0, 0, 0, CH);
    water.addColorStop(0, '#7fc9e6');
    water.addColorStop(1, '#4fa6cc');
    g.fillStyle = water;
    g.fillRect(0, 0, CW, CH);
    g.strokeStyle = 'rgba(255, 255, 255, .5)';
    g.lineWidth = 1.5;
    for (let y = 6; y < CH; y += 10) {
      for (let x = 0; x < CW; x += 20) {
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo(x + 5, y - 3, x + 10, y);
        g.quadraticCurveTo(x + 15, y + 3, x + 20, y);
        g.stroke();
      }
    }
    // 연잎: 네 모서리에 하나씩
    g.fillStyle = '#5fb36a';
    [[M / 2, M / 2], [CW - M / 2, M / 2], [M / 2, CH - M / 2], [CW - M / 2, CH - M / 2]].forEach(([x, y]) => {
      g.beginPath(); g.arc(x, y, M / 3, 0.2, Math.PI * 2 - 0.2); g.lineTo(x, y); g.fill();
    });
    g.strokeStyle = '#4a0d22';
    g.lineWidth = 1;
    g.strokeRect(M - 0.5, M - 0.5, CW - 2 * M + 1, CH - 2 * M + 1);
  }

  async function takeBooth(frame, count) {
    if (boothBusy) return;
    boothBusy = true;
    const cv = $('#booth-canvas');
    const status = $('#booth-status');
    const paper = $('#booth-paper');
    const { cols, rows, W, H } = boothLayout(count);
    const M = frame === 'premium' ? BOOTH_MARGIN_PREMIUM : BOOTH_MARGIN_BASIC;   // 테두리 두께
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    cv.width = W + M * 2;
    cv.height = H + M * 2;
    cv.style.width = count === 6 ? '240px' : '200px';
    $('#booth-frames').hidden = true;
    $('#booth-title').hidden = true;
    paper.hidden = false;
    paper.classList.remove('printing');
    $('#booth-again').hidden = true;

    g.fillStyle = frame === 'premium' ? '#fffaf0' : '#111111';
    g.fillRect(0, 0, cv.width, cv.height);

    const names = session ? [...new Set(session.friends)] : [];
    const friends = await Promise.all(names.slice(0, 3).map(async (n) => {
      const f = friendByName(n);
      return { name: n, img: await friendArtImage(f) };
    }));
    const uImg = await loadBoothImage(mapMeSrc());
    const pondImg = frame === 'premium' ? await loadBoothImage(BOOTH_POND_IMG) : null;
    drawBoothBorder(g, cv.width, cv.height, M, frame);
    // 안쪽 사진판은 테두리 안쪽에 그린다
    g.save();
    g.translate(M, M);
    drawBoothHeader(g, W);
    drawBoothFoot(g, W, H);

    // 연출 8가지 중 필요한 만큼 골라 순서를 섞는다
    const order = BOOTH_VARIANTS.slice().sort(() => Math.random() - 0.5);
    const says = BOOTH_SAYS.slice().sort(() => Math.random() - 0.5);
    for (let i = 0; i < count; i++) {
      for (const n of [3, 2, 1]) {
        status.textContent = `${n}…`;
        await wait(300);
      }
      fade.classList.add('flash');   // 찰칵 플래시 (인생네컷은 진짜 사진기처럼 번쩍인다)
      setTimeout(() => fade.classList.remove('flash'), 160);
      Sound.sfx('ding');
      status.textContent = `찰칵! (${i + 1} / ${count})`;
      const col = cols === 2 ? i % 2 : 0;
      const row = Math.floor(i / cols);
      drawBoothFrame(g, col * BOOTH_CELL_W, BOOTH_HEAD_H + row * BOOTH_CELL_H, uImg, friends,
        { ...order[i % order.length], say: says[i % says.length] }, frame, pondImg, `${i + 1} / ${count}`);
      await wait(150);
    }
    g.restore();

    // 마지막 컷을 잠깐 보여 준 뒤, "조금만 기다려주세요!" 창을 띄우고 기계가 출력하기 시작한다
    await wait(1400);
    const waitBox = $('#booth-wait');
    waitBox.hidden = false;
    status.textContent = '출력 준비 중…';
    await wait(1600);
    waitBox.hidden = true;

    // 출력: 종이가 슬롯에서 천천히 나온다
    status.textContent = '출력 중…';
    Sound.sfx('ding');
    paper.classList.add('printing');
    await wait(1900);
    paper.classList.remove('printing');
    // 인생네컷을 찍으면 우왕이가 행복해진다 (최대치를 넘지 않는다)
    const happyBefore = state.pet.happy;
    addHearts('happy', BOOTH_HAPPY);
    const happyGained = state.pet.happy - happyBefore;
    if (happyGained > 0) {
      if (session) session.hearts += happyGained;
      saveState();
      renderStats();
    }
    // 찍는 창이 떠 있어서 화면 아래의 알림은 가려진다. 그래서 행복도 결과를 창 안에 적는다.
    const happyText = happyGained > 0
      ? `행복도 +${happyGained} 올랐어요!`
      : `행복도가 이미 가득 찼어요 (최대 ${MAX_HEARTS})`;
    status.textContent = `${happyText} (사진은 저장되지 않아요)`;
    $('#booth-again').hidden = false;
    boothBusy = false;
  }

  // ---------- 헤드셋 ----------
  // 산책할 때만 우왕이에게 헤드셋을 씌운다 (게이머 우왕이의 헤드폰 그림을 같이 쓴다)
  function toggleHeadset() {
    state.walkHeadset = !state.walkHeadset;
    saveState();
    renderHeadset();
    if (!inWalk) return;
    if (state.walkHeadset) {
      say(musicOn ? '음악이 더 잘 들려요 🎧♪' : '헤드셋 꼈어요! 음악도 켜 볼까요? 🎧', 2200);
      playMascot(mascot, 'joy', 600);
    } else {
      say('주변 소리도 들어 볼게요 👂', 1800);
    }
  }

  function renderHeadset() {
    const on = Boolean(state.walkHeadset);
    setMascot(mascot, { headset: on });
    $('#btn-walk-headset').setAttribute('aria-pressed', on);
    $('#walk-headset-label').textContent = on ? '헤드셋 벗기' : '헤드셋 끼기';
  }

  function toggleMusic() {
    musicOn = !musicOn;
    const btn = $('#btn-walk-music');
    btn.setAttribute('aria-pressed', musicOn);
    $('#walk-music-icon').textContent = musicOn ? '🎵' : '🔇';
    $('#walk-music-label').textContent = musicOn ? '배경음 켜짐' : '배경음 꺼짐';
    updateMusic();
  }

  // 다른 탭으로 갈 때 (app.js)
  function stop() {
    if (inWalk) undressAll();   // 산책 중에 다른 탭으로 가도 산책을 다녀온 것으로 본다
    inWalk = false;
    if (cafeSitting) standUpCafe();   // 카페에 앉은 채로 산책을 끝내면 자리에서 일어난다
    Sound.bgm('');
  }

  return { init, render: open, stop };
})();
