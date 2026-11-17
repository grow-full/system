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
    $('#walk-friend').addEventListener('click', () => { if (canWalk()) greet(); });
    document.addEventListener('keydown', onKey);
    $('#walk-pad').addEventListener('click', (e) => {
      const b = e.target.closest('[data-move]');
      if (b) nudge(b.dataset.move);
    });
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
    $('#btn-summary-booth').addEventListener('click', takeBooth);
    $('#booth-again').addEventListener('click', takeBooth);
    $('#booth-close').addEventListener('click', () => { $('#booth').hidden = true; });
    $('#walk-note-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') saveNote(); });
    $('#walk-talk-btn').addEventListener('click', talkFriend);
    $('#guide-next').addEventListener('click', nextGuide);
    $('#guide-skip').addEventListener('click', closeGuide);
    $('#walk-quests').addEventListener('click', (e) => {
      const b = e.target.closest('[data-claim]');
      if (b) claimQuest(b.dataset.claim);
    });
    $('#btn-walk-next').addEventListener('click', () => { if (!blockReason()) setStep('pick'); });
    $('#btn-walk-back').addEventListener('click', () => setStep('check'));
    $('#btn-walk-dress').addEventListener('click', () => { if (chosenName && !blockReason()) setStep('dress'); });
    $('#btn-walk-dress-back').addEventListener('click', () => setStep('pick'));
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
    pano.setPano(next.spot.id);
    startId = next.spot.id;   // 처음부터 다시 하기도 여기서 시작한다
    heading = target = pano.getPov().heading;
    depth = targetDepth = 0;
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

    targetDepth = 0;
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
    fade.classList.add('on');
    await wait(350);
    pano.setPano(spot.id);
    pano.setPov({ heading: bearing, pitch: 0 });
    heading = target = bearing;

    // 4) 도착한 곳에서 우왕이가 저 앞에서 걸어 나와 원래 자리로 온다
    await wait(250);
    fade.classList.remove('on');
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
      linksControl: false,
      panControl: false,          // 오른쪽 아래 방향 버튼과 겹치지 않게
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
    pano.addListener('position_changed', () => { renderPlaces(); updateMinimap(); checkStamp(); });
    heading = target = 0;
    loading = false;
    loadPlaces();
    loop();
  }

  // ---------- 방향키로 돌아다니기 ----------
  // 파란 점(사람들이 올린 360° 사진)은 서로 연결되어 있지 않아서,
  // 보고 있는 방향으로 조금씩 멀리 찾아보며 가장 가까운 사진으로 건너뛴다.
  const SEARCH_STEPS = [20, 40, 80, 150];   // 앞쪽으로 몇 m 지점에서 찾을지

  function findAhead(direction) {
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
          if (Math.abs(wrap(bearing - direction)) > 50) { next(); return; }
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
    traveling = true;
    const look = pano.getPov().heading;
    const direction = backward ? wrap(look + 180) : look;
    target = look;                    // 우왕이가 앞장선다
    say('저쪽으로 가 볼까요?', 1200);
    const found = await findAhead(direction);
    if (found) {
      pano.setPano(found.id);
      pano.setPov({ heading: look, pitch: pano.getPov().pitch });
      heading = target = look;        // 새 장소에서도 바로 앞에 서 있는다
      depth = targetDepth = 0;
      lastMove = Date.now();
      say(`${found.meters}m 걸어왔어요 🐾`, 1800);
      setTimeout(() => say(placeComment(), 3200), 1800);
      addSteps(found.meters);
    } else {
      say('이쪽으로는 길이 없어요 🤔', 1800);
      playMascot(mascot, 'refuse', 600);
    }
    traveling = false;
  }

  function onKey(e) {
    if ($('#screen-walk').hidden || !pano || !inWalk || e.target.closest('input, textarea, select')) return;
    const keys = { ArrowUp: 'forward', ArrowDown: 'back', ArrowLeft: 'left', ArrowRight: 'right' };
    if (!keys[e.key]) return;
    e.preventDefault();   // 화면이 스크롤되지 않게
    nudge(keys[e.key]);
  }

  // ---------- 방향키로 우왕이를 한 걸음씩 ----------
  const SIDE_STEP = 12;       // ←/→ 한 번에 옆으로 가는 각도
  const DEPTH_STEP = 0.2;     // ↑/↓ 한 번에 멀어지거나 다가오는 정도
  const MAX_DEPTH = 0.72;     // 이보다 멀리 가면 다음 장소를 찾아간다
  let targetDepth = 0;
  let followUntil = 0;        // 이 시각까지는 화면이 우왕이를 따라 돈다

  function nudge(dir) {
    if (!pano) return;
    if (!canWalk()) {   // 못 걷는 이유를 말해 준다 (알, 아픔, 여행 중)
      say(state.pet.sick ? '아파서 걸을 수 없어요 🤒' : '지금은 걸을 수 없어요', 1600);
      return;
    }
    if (traveling) return;   // 다른 곳으로 걸어가는 중이면 잠깐 기다린다
    lastMove = Date.now() + 4000;    // 직접 움직이는 동안은 혼자 돌아다니지 않는다
    followUntil = Date.now() + 1500;
    if (dir === 'left' || dir === 'right') {
      target = wrap(target + (dir === 'left' ? -SIDE_STEP : SIDE_STEP));
      setMascot(mascot, { look: dir });
    } else if (dir === 'forward') {
      if (targetDepth >= MAX_DEPTH - 0.01) { go(); return; }   // 끝까지 갔으면 다음 장소로
      targetDepth = Math.min(MAX_DEPTH, targetDepth + DEPTH_STEP);
      setMascot(mascot, { look: '' });
    } else {
      targetDepth = Math.max(0, targetDepth - DEPTH_STEP);
      setMascot(mascot, { look: '' });
    }
    const added = addSteps(2.1);   // 한 번 누를 때 세 걸음
    stepHere(added);               // 이 장소에서 걸은 걸음 (도장)
    // 걸을 때마다 이 장소에 대한 감상을 말한다 (앞의 말이 끝난 뒤에 다음 말)
    if (Date.now() > speechUntil || idleSpeech) say(placeComment(), 2600);
  }

  function showNotice(text) { notice.textContent = text; notice.hidden = false; }
  function hideNotice() { notice.hidden = true; }

  // ---------- 우왕이 자리 계산 ----------
  // -180 ~ 180도로 맞춘다
  function wrap(deg) { return ((deg + 540) % 360) - 180; }

  function place() {
    if (!pano) return;
    const pov = pano.getPov();
    const zoom = pano.getZoom() || 1;
    const fov = 180 / 2 ** zoom;                 // 스트리트 뷰의 가로 시야각
    const w = overlay.clientWidth;
    const h = overlay.clientHeight;
    const pxPerDeg = w / fov;
    // depth: 0이면 바로 앞, 1이면 저 멀리 (멀어질수록 작아지고 수평선 쪽으로 올라간다)
    const size = BASE_SIZE * 2 ** (zoom - 1) * (1 - 0.7 * depth);
    const x = w / 2 + wrap(heading - pov.heading) * pxPerDeg;
    const y = h * (FOOT_AT + (HORIZON_AT - FOOT_AT) * depth);   // 화면 중간보다 조금 아래에 서 있는다
    walker.style.setProperty('--size', `${size}px`);
    walker.style.transform = `translate(${x - size / 2}px, ${y - size}px)`;

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
  const MEET_DEG = 9;          // 이만큼 가까워지면 만난 것으로 본다 (방향)
  const MEET_DEPTH = 0.22;     // (거리)
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

  // 우왕이가 친구 가까이 왔는지 (loop에서 매 프레임)
  function checkMeet() {
    if (!friend || friendMet || greeting || walkingAway || !canWalk()) return;
    if (Math.abs(wrap(heading - friendHeading)) < MEET_DEG && Math.abs(depth - FRIEND_DEPTH) < MEET_DEPTH) greet();
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
    $('#walk-friend-speech').textContent = friend.hello;
    playMascot(mascot, 'joy', 600);
    Sound.sfx('ding');
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
    // 우왕이가 친구 쪽을 바라본다
    setMascot(mascot, { look: wrap(friendHeading - heading) < 0 ? 'left' : 'right' });
    fSpeech.textContent = f.hello;
    fEl.classList.remove('hop');
    void fEl.offsetWidth;
    fEl.classList.add('hop');
    Sound.sfx('ding');
    await wait(1700);
    if (friend !== f) { greeting = false; return; }   // 그새 다른 장소로 갔으면 그만
    say(f.reply, 2400);
    playMascot(mascot, 'joy', 600);
    await wait(2400);
    fSpeech.textContent = '';
    fEl.classList.remove('hop');
    greeting = false;
  }

  // 부드럽게 걸어가기
  function loop() {
    cancelAnimationFrame(frame);
    const step = () => {
      if ($('#screen-walk').hidden || !pano || !inWalk) return;
      const diff = wrap(target - heading);
      const turning = Math.abs(diff) > 0.05;
      if (turning) heading = wrap(heading + Math.sign(diff) * Math.min(Math.abs(diff), 0.4));
      // 방향키로 멀어지거나 다가올 때 (장소 바로 가기 중에는 그쪽 애니메이션이 depth를 정한다)
      const dd = walkingAway ? 0 : targetDepth - depth;
      const stepping = Math.abs(dd) > 0.002;
      if (stepping) depth += Math.sign(dd) * Math.min(Math.abs(dd), 0.01);
      if (!turning && !stepping) setMascot(mascot, { look: '' });
      // 우왕이가 화면 끝으로 가면 화면이 따라 돈다
      if (Date.now() < followUntil) {
        const fov = 180 / 2 ** (pano.getZoom() || 1);
        const pov = pano.getPov();
        const off = wrap(heading - pov.heading);
        if (Math.abs(off) > fov * 0.3) pano.setPov({ heading: wrap(pov.heading + Math.sign(off) * 0.4), pitch: pov.pitch });
      }
      walker.dataset.walking = turning || stepping || walkingAway;
      checkMeet();
      place();
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  }

  // ---------- 시간 흐름 ----------
  function canWalk() {
    // 산책 중에는 밤이거나 불이 꺼져 있어도 깨어서 걷는다
    // 아프면 걷지 않는다 (걸음·하트·코인이 쌓이지 않는다)
    return state.pet.stage !== 'egg' && !state.flight && !state.pet.sick;
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
    playMascot(mascot, 'eat', 1300).then(() => playMascot(mascot, 'joy', 600));   // 입을 벌리고 꿀꺽꿀꺽
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
    + '<path d="M2.5 10 H23.5 L22 44 Q21.8 46.5 19 46.5 H7 Q4.2 46.5 4 44 Z" fill="#7cc4c0" stroke="#4f8f8b" stroke-width="1.5" stroke-linejoin="round"/>'
    + '<path d="M3.3 22 H22.7 L22.45 28 H3.55 Z" fill="#5fa9a5"/>'
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
    const stampLeft = stampStepsLeft();
    $('#wn-stamp').hidden = stampLeft <= 0;
    if (stampLeft > 0) {
      $('#wn-stamp-label').textContent = `${hereName} 도장`;
      $('#wn-stamp-left').textContent = `${stampLeft}걸음 남음`;
      bar('#wn-stamp-bar', STAMP_STEPS - stampLeft, STAMP_STEPS);
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
    if (!inWalk) { renderCheck(); updateMusic(); return; }   // 산책 전 체크 화면 (음악은 끈다)
    // 산책 중에 아파지면 한 번 알려 주고 걸음을 멈춘다
    if (state.pet.sick) {
      if (!sickNoted) { sickNoted = true; say('으으… 아파서 더 못 걸어요 🤒 산책을 끝내고 쉬어요', 4000); }
    } else sickNoted = false;
    // 지도가 늦게 준비되면 출발 때의 장소 확인이 빠지므로, 준비되는 대로 한 번 더 확인한다 (친구·선물 상자 설정)
    if (pano && stampedPano === '') checkStamp();
    renderWarmth();
    renderTalk();
    // 지도가 떠 있고 우왕이가 같이 걸을 수 있을 때만 산책 시간이 흐른다
    if (pano && canWalk()) {
      walkSeconds++;
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
    // 사용자가 보고 있는 쪽 근처로 걸어간다
    const center = pano.getPov().heading;
    target = wrap(center + (Math.random() * 60 - 30));
    setMascot(mascot, { look: wrap(target - heading) < 0 ? 'left' : 'right' });
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
    $('#walk-dress').hidden = step !== 'dress';
    $('#walk-summary').hidden = step !== 'summary';
    $('#walk-main').hidden = step !== 'walk';
    if (step === 'check') { renderCheck(); renderQuests(); renderWalkLog(); }
    if (step === 'pick') renderPick();
    if (step === 'dress') { renderDress(); sayDress('오늘은 뭐 입고 나갈까요? 👕'); }
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
    $('#wc-pick-line').textContent = chosenName ? `${placeIcon(chosenName)} ${chosenName} · ${line}` : '';
    $('#wc-pick-name').textContent = chosenName;
    $('#btn-walk-dress').disabled = !chosenName || Boolean(blockReason());
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
    if (!inWalk) renderQuests();
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
    box.innerHTML = defs.map((d) => {
      const now = Math.min(q.progress[d.kind] || 0, d.goal);
      const claimed = q.claimed.includes(d.id);
      const ready = !claimed && now >= d.goal;
      const action = claimed
        ? '<b class="quest-done">받음 ✔</b>'
        : ready ? `<button class="quest-claim" data-claim="${d.id}">🪙 ${d.reward} 받기</button>`
        : `<small class="quest-reward">🪙 ${d.reward}</small>`;
      return `<li class="${claimed ? 'is-done' : ''}"><span class="quest-what">${d.label}<small>${now} / ${d.goal} ${d.unit}</small></span>${action}</li>`;
    }).join('');
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
  }

  function saveNote() {
    const text = $('#walk-note-input').value.trim();
    const msg = $('#walk-note-msg');
    const entry = (state.walkLog || []).find((e) => e.at === lastLogAt);
    if (!entry) { msg.textContent = '저장할 산책 기록이 없어요.'; return; }
    if (!text) { msg.textContent = '소감을 한 줄 적어 주세요.'; return; }
    entry.note = text.slice(0, 60);
    saveState();
    renderWalkLog();
    msg.textContent = '산책 기록에 저장했어요 💗';
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
    session = { coins: 0, hearts: 0, drinks: 0, stamps: [], friends: [], places: new Set(), time: timeOfDay() };
  }

  function fmtTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m >= 60
      ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  let summaryStage = null;

  function renderSummary() {
    const s = session || { coins: 0, hearts: 0, stamps: [], friends: [], places: new Set(), time: timeOfDay() };
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
    $('#btn-summary-booth').hidden = false;
    $('#booth-help').hidden = false;
    $('#booth-help').textContent = s.friends.length
      ? '오늘 만난 친구들과 함께 인생네컷을 찍을 수 있어요 📸'
      : '우왕이 혼자서도 인생네컷을 찍을 수 있어요 📸';
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
      pano.setPano(startPano);
      pano.setPov({ heading: 0, pitch: 0 });
      startId = startPano;
    }
    render();   // 지도가 아직 없으면 여기서 고른 장소로 불러온다
    if (pano) {
      heading = target = pano.getPov().heading;
      depth = targetDepth = 0;
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
  // 이름표가 있는 장소에 도착한 뒤, 그 장소에서 방향키로 50걸음 이상 걸으면 도장을 찍는다.
  // (장소를 옮기며 늘어난 걸음은 세지 않는다.) 처음 받은 도장이면 코인 3개, 다 모으면 코인 30개 보너스.
  const STAMP_STEPS = 50;
  const STAMP_COINS = 3;
  const STAMP_ALL_BONUS = 30;
  let stampedPano = '';   // 지금 걸음을 세고 있는 사진
  let hereName = '';      // 지금 장소 이름 (이름표에 없으면 '')
  let hereSteps = 0;      // 이 장소에 와서 걸은 걸음
  let hereDone = false;   // 이번 방문에서 도장을 이미 찍었는지

  function namedHere() {
    const names = typeof WALK_PLACES === 'undefined' ? {} : WALK_PLACES;
    const id = plainId(pano.getPano());
    const key = Object.keys(names).find((k) => plainId(k) === id);
    return key ? names[key] : '';
  }

  // 새 장소에 도착하면 걸음을 0부터 센다
  function checkStamp() {
    if (!pano || !inWalk || pano.getStatus() !== 'OK') return;
    const here = pano.getPano();
    if (here === stampedPano) return;
    stampedPano = here;
    hereName = namedHere();
    if (hereName && session && !session.places.has(hereName)) { session.places.add(hereName); bumpQuest('places', 1); }
    hereSteps = 0;
    hereDone = false;
    setFriend(hereName);   // 이 장소에 사는 친구
    // 선물 상자는 장소 이름이 붙은 사진이 아니어도, 장소에서 150m 안이면 나온다 (친구보다 쉽게 찾도록)
    setGift(hereName || nearName());
    renderStats();
    if (hereName && !state.walkStamps[hereName]) {
      setTimeout(() => say(`여기서 ${STAMP_STEPS}걸음 걸으면 도장을 받아요 🏅`, 2600), 2600);
    }
  }

  // 도장까지 남은 걸음 (도장을 받을 수 없는 곳이면 0)
  function stampStepsLeft() {
    if (!hereName || hereDone) return 0;
    return Math.max(0, STAMP_STEPS - hereSteps);
  }

  function stepHere(added) {
    if (!hereName || hereDone || !inWalk) return;
    hereSteps += added;
    renderStats();
    if (hereSteps >= STAMP_STEPS) awardStamp(hereName);
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
    { icon: '👣', text: '방향키나 아래 ▲◀▼▶ 버튼으로 우왕이를 걷게 해요. 화면을 드래그하면 둘러볼 수 있어요.' },
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
  // 네 컷을 그림으로 그려서 보여 준다. 스트리트 뷰 사진을 쓰지 않으니, 저장은 하지 않고 화면에만 보여 준다.
  const BOOTH_FRAMES = 4;
  const BOOTH_BG = ['#fde8ee', '#e6f4ff', '#fff4d6', '#e9f7e8'];
  const BOOTH_REACTIONS = ['💗', '✨', '🐾', '😊'];
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

  function drawBoothHeader(g, W) {
    g.fillStyle = '#f4ead6';
    g.fillRect(0, 0, W, 40);
    g.fillStyle = '#8c1d40';
    g.font = '16px "Galmuri11", "Malgun Gothic", sans-serif';
    g.textAlign = 'center';
    g.fillText('우왕이 인생네컷', W / 2, 26);
  }

  // 컷마다 다른 연출: 기울기, 좌우 반전, 크기, 머리 위 표정, 말풍선, 반응 스티커
  const BOOTH_VARIANTS = [
    { bg: '#fde8ee', tilt: 0, flip: false, scale: 1, face: '😊', reaction: '💗', say: '같이 찍어요!', bounce: 0 },
    { bg: '#e6f4ff', tilt: -9, flip: false, scale: 1, face: '😆', reaction: '✨', say: '헤헤, 신나요!', bounce: 14 },
    { bg: '#fff4d6', tilt: 0, flip: true, scale: 1.06, face: '😳', reaction: '🐾', say: '아 찍힌다!', bounce: 6 },
    { bg: '#e9f7e8', tilt: 7, flip: false, scale: 0.95, face: '😎', reaction: '😊', say: '오늘 최고!', bounce: 0 },
  ];

  // 말풍선: 흰 바탕, 버건디 도트 테두리, 꼬리 한 칸
  function drawBubble(g, text, x, y) {
    g.font = '12px "Galmuri11", "Malgun Gothic", sans-serif';
    g.textAlign = 'left';
    const w = g.measureText(text).width + 14;
    g.fillStyle = '#fffaf0';
    g.fillRect(x, y, w, 22);
    g.strokeStyle = '#4a0d22';
    g.lineWidth = 2;
    g.strokeRect(x + 1, y + 1, w - 2, 20);
    g.fillStyle = '#4a0d22';
    g.fillText(text, x + 7, y + 15);
  }

  // 한 컷: 배경, 친구들(뒤, 번갈아 튐), 우왕이(기울기·반전·크기), 머리 위 표정, 말풍선, 반응 스티커
  function drawBoothFrame(g, y, uImg, friends, v) {
    const W = 240;
    const H = 180;
    g.fillStyle = v.bg;
    g.fillRect(0, y, W, H);
    g.fillStyle = 'rgba(74, 13, 34, .05)';
    for (let yy = y; yy < y + H; yy += 3) g.fillRect(0, yy, W, 1);

    friends.forEach((f, i) => {
      const size = 66;
      const x = 118 + i * 36;
      const top = y + 58 - (i % 2) * 14 - (i % 2 === 0 ? v.bounce : 0);
      if (f.img) g.drawImage(f.img, x, top, size, size);
      else {
        g.font = '40px sans-serif';
        g.textAlign = 'center';
        g.fillText('🐾', x + size / 2, top + size * 0.7);
      }
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

    // 머리 위 표정 이모지
    g.font = '26px sans-serif';
    g.textAlign = 'center';
    g.fillText(v.face, cx, y + 52);

    g.textAlign = 'left';
    g.font = '24px sans-serif';
    g.fillText(v.reaction, 12, y + 36);
    drawBubble(g, v.say, 96, y + 10);

    g.fillStyle = '#4a0d22';
    g.font = '12px "Galmuri11", "Malgun Gothic", sans-serif';
    g.textAlign = 'right';
    g.fillText(`${(y - 40) / 180 + 1} / ${BOOTH_FRAMES}`, W - 10, y + H - 8);

    g.strokeStyle = '#4a0d22';
    g.lineWidth = 2;
    g.strokeRect(1, y + 1, W - 2, H - 2);
  }

  async function takeBooth() {
    if (boothBusy) return;
    boothBusy = true;
    const booth = $('#booth');
    const cv = $('#booth-canvas');
    const status = $('#booth-status');
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    booth.hidden = false;
    g.fillStyle = '#fffaf0';
    g.fillRect(0, 0, cv.width, cv.height);
    drawBoothHeader(g, cv.width);

    const names = session ? [...new Set(session.friends)] : [];
    const friends = await Promise.all(names.slice(0, 3).map(async (n) => {
      const f = friendByName(n);
      return { name: n, img: await friendArtImage(f) };
    }));
    const uImg = await loadBoothImage(mapMeSrc());

    // 찍을 때마다 컷 순서를 섞는다
    const order = BOOTH_VARIANTS.slice().sort(() => Math.random() - 0.5);
    for (let i = 0; i < BOOTH_FRAMES; i++) {
      for (const n of [3, 2, 1]) {
        status.textContent = `${n}…`;
        await wait(450);
      }
      fade.classList.add('on');   // 찰칵 플래시
      setTimeout(() => fade.classList.remove('on'), 160);
      Sound.sfx('ding');
      status.textContent = `찰칵! (${i + 1} / ${BOOTH_FRAMES})`;
      drawBoothFrame(g, 40 + i * 180, uImg, friends, order[i]);
      await wait(250);
    }
    status.textContent = '네 컷 완성! 💗 (사진은 저장되지 않아요)';
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
    Sound.bgm('');
  }

  return { init, render: open, stop };
})();
