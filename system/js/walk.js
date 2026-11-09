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
  function placeComment() {
    const all = typeof WALK_COMMENTS === 'undefined' ? {} : WALK_COMMENTS;
    const fallback = typeof WALK_COMMENTS_DEFAULT === 'undefined' ? PHRASES : WALK_COMMENTS_DEFAULT;
    const timely = inWalk ? timeComment() : '';
    if (timely && timely !== lastComment) { lastComment = timely; return timely; }
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
  // 학교 지도 위에 우왕이(🐣)가 지금 있는 곳과 장소(📍)들을 보여 준다. 📍를 누르면 그곳으로 걸어간다.
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

    // 우왕이 🐣
    const me = document.createElement('div');
    me.className = 'map-me';
    me.textContent = '🐣';
    meMarker = new AdvancedMarkerElement({ map: minimap, position: pano.getPosition(), content: me, zIndex: 999 });

    // 처음에는 장소가 모두 보이게 맞춘다
    if (!bounds.isEmpty()) minimap.fitBounds(bounds, 24);
    updateMinimap();
  }

  function updateMinimap() {
    if (!minimap || !meMarker || !pano) return;
    const pos = pano.getPosition();
    if (!pos) return;
    meMarker.position = pos;
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

  async function goTo(index) {
    const p = places[index];
    const spot = p && nearestSpot(p);
    if (!spot || traveling || !canWalk()) return;
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
      showNotice('Google Maps API 키가 없어요. js/maps-key.example.js를 js/maps-key.js로 복사하고 키를 넣어 주세요.');
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

  async function go(backward = false) {
    if (!pano || !service || traveling || !canWalk()) return;
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
    if (!pano || traveling || !canWalk()) return;
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
  let greeting = false;

  // 장소에 도착했을 때 그 장소의 친구를 세운다
  function setFriend(name) {
    const all = typeof WALK_FRIENDS === 'undefined' ? {} : WALK_FRIENDS;
    friend = (name && all[name]) || null;
    friendMet = false;
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

  async function greet() {
    if (!friend || greeting) return;
    greeting = true;
    friendMet = true;
    const f = friend;
    if (session && !session.friends.includes(f.name)) session.friends.push(f.name);
    if (!state.walkFriends.includes(f.name)) {
      // 처음 만난 친구: 코인, 다 찾으면 보너스 (보너스는 한 번만)
      state.walkFriends.push(f.name);
      state.coins += FRIEND_COINS;
      if (session) session.coins += FRIEND_COINS;
      const list = friendList();
      const got = list.filter((x) => state.walkFriends.includes(x.name)).length;
      const allDone = !state.walkFriendsDone && list.length > 0 && got >= list.length;
      if (allDone) {
        state.walkFriendsDone = true;
        state.coins += FRIEND_ALL_BONUS;
        if (session) session.coins += FRIEND_ALL_BONUS;
      }
      saveState();
      renderTop();
      renderFriendHint();
      setTimeout(() => toast(`🤝 ${f.name}를 찾았어요! 🪙 +${FRIEND_COINS} (${got}/${list.length})`), 1700);
      if (allDone) {
        setTimeout(() => {
          Sound.sfx('levelup');
          toast(`🎉 숨어 있던 친구 ${list.length}명을 모두 찾았어요! 보너스 🪙 +${FRIEND_ALL_BONUS}`);
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
    return state.pet.stage !== 'egg' && !state.flight;
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
    // 컵은 우왕이 그림 안에 넣어서, 몸이 흔들려도 입에 딱 붙어 있게 한다
    const inner = mascot.querySelector('.mascot-inner') || mascot;
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
    for (let i = 0; i < MAX_HEARTS; i++) html += `<span class="${i < state.pet.happy ? 'on' : 'off'}">❤️</span>`;
    $('#walk-happy').innerHTML = html;
  }

  function tick() {
    if ($('#screen-walk').hidden) return;
    if (!inWalk) { renderCheck(); updateMusic(); return; }   // 산책 전 체크 화면 (음악은 끈다)
    // 지도가 떠 있고 우왕이가 같이 걸을 수 있을 때만 산책 시간이 흐른다
    if (pano && canWalk()) {
      walkSeconds++;
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
    for (let i = 0; i < MAX_HEARTS; i++) hearts += `<span class="${i < pet.hunger ? 'on' : 'off'}">❤️</span>`;
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
    if (step === 'check') renderCheck();
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
  const FRIEND_COINS = 2;        // 친구를 처음 만나면
  const FRIEND_ALL_BONUS = 15;   // 친구를 모두 찾으면

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
    $('#walk-friend-count').textContent = `${met.length} / ${list.length}`;
    $('#walk-friends').innerHTML = list.map((f) => (state.walkFriends.includes(f.name)
      ? `<div class="walk-friend-badge" title="${f.name}"><div class="face">${friendFace(f)}</div><small>${f.name}</small></div>`
      : `<div class="walk-friend-badge locked" title="아직 못 찾은 친구"><div class="face">${friendFace(f)}<b>?</b></div><small>???</small></div>`)).join('');
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
    morning: { label: '아침', icon: '☀️', lines: ['아침 공기가 상쾌해요 ☀️', '1교시 가는 사람들이 바빠 보여요', '아침 산책은 기분이 좋아요 🌤️'] },
    day: { label: '낮', icon: '🌤️', lines: ['햇빛이 따뜻해요 🌤️', '점심 먹고 산책하기 딱 좋아요', '낮에는 캠퍼스가 북적북적해요'] },
    evening: { label: '저녁', icon: '🌇', lines: ['노을이 예뻐요 🌇', '하늘이 주황색으로 물들었어요', '저녁 바람이 선선해요'] },
    night: { label: '밤', icon: '🌙', lines: ['밤 산책은 조금 무섭지만 신나요 🌙', '가로등 불빛이 예뻐요 💡', '졸리지만 조금만 더 걸어요 😪'] },
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
  }

  function startWalk() {
    if (blockReason()) return;
    setStep('walk');
    newSession();
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
  }

  // 산책에서 돌아오면 옷과 헤드셋을 모두 벗는다 (다음 산책 때 다시 골라 입는다)
  function undressAll() {
    Object.keys(state.equipped).forEach((slot) => { state.equipped[slot] = null; });
    state.walkHeadset = false;
    saveState();
    renderHeadset();
  }

  function endWalk() {
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
    if (hereName && session) session.places.add(hereName);
    hereSteps = 0;
    hereDone = false;
    setFriend(hereName);   // 이 장소에 사는 친구
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
