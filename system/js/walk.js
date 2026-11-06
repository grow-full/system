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

  function init() {
    view = $('#walk-view');
    overlay = $('#walk-overlay');
    walker = $('#walk-walker');
    mascot = $('#walk-mascot');
    speech = $('#walk-speech');
    hint = $('#walk-hint');
    notice = $('#walk-notice');
    fade = $('#walk-fade');
    mascot.addEventListener('click', tap);
    document.addEventListener('keydown', onKey);
    $('#walk-pad').addEventListener('click', (e) => {
      const b = e.target.closest('[data-move]');
      if (b) nudge(b.dataset.move);
    });
    $('#btn-walk-reset').addEventListener('click', restart);
    $('#btn-walk-start').addEventListener('click', startWalk);
    $('#btn-walk-end').addEventListener('click', endWalk);
    $('#btn-walk-music').addEventListener('click', toggleMusic);
    $('#btn-walk-next').addEventListener('click', () => { if (!blockReason()) setStep('pick'); });
    $('#btn-walk-back').addEventListener('click', () => setStep('check'));
    $('#wc-places').addEventListener('click', (e) => {
      const b = e.target.closest('[data-start]');
      if (b) { chosenName = b.dataset.start; renderPick(); }
    });
    $('#btn-walk-care').addEventListener('click', () => window.show('pet'));   // 앱의 탭 전환 (app.js)
    $('#walk-places').addEventListener('click', (e) => {
      const b = e.target.closest('[data-place]');
      if (b) goTo(Number(b.dataset.place));
    });
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

  function placeName() {
    const id = plainId(pano.getPano());
    const names = typeof WALK_PLACES === 'undefined' ? {} : WALK_PLACES;
    for (const key in names) if (plainId(key) === id) return names[key];
    // 이름표에 없는 장소는 구글 설명을 쓰지 않는다 (사진을 올린 사람 이름이 들어 있을 때가 있어서)
    return '이름 없는 장소';
  }

  // 지금 장소에 대한 우왕이의 감상 하나 (바로 전에 한 말은 피한다)
  let lastComment = '';
  let idleSpeech = false;     // 지금 말풍선이 가만히 있을 때 한 혼잣말인지 (걸으면 바로 바꾼다)
  function placeComment() {
    const all = typeof WALK_COMMENTS === 'undefined' ? {} : WALK_COMMENTS;
    const fallback = typeof WALK_COMMENTS_DEFAULT === 'undefined' ? PHRASES : WALK_COMMENTS_DEFAULT;
    const lines = (pano && all[placeName()]) || fallback;
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
  }

  // ---------- 우왕이 위치 지도 ----------
  // 학교 지도 위에 우왕이(🐣)가 지금 있는 곳과 장소(📍)들을 보여 준다. 📍를 누르면 그곳으로 걸어간다.
  let minimap = null;
  let meMarker = null;

  async function initMinimap() {
    if (minimap || !pano) return;
    const { Map: GoogleMap } = await google.maps.importLibrary('maps');
    const { AdvancedMarkerElement } = await google.maps.importLibrary('marker');
    $('#walk-map-card').hidden = false;
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
  // 구글이 사진마다 붙이는 저작권 표시(올린 사람 이름)에 WALK_BLOCKED_AUTHORS의 이름이 있으면 뺀다
  function isBlocked(data) {
    const authors = typeof WALK_BLOCKED_AUTHORS === 'undefined' ? [] : WALK_BLOCKED_AUTHORS;
    const credit = (data && data.copyright) || '';
    return authors.some((name) => credit.includes(name));
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

  // ---------- 처음부터 다시 ----------
  function restart() {
    steps = 0;
    walkSeconds = 0;
    heartProgress = 0;
    lastMove = Date.now();
    if (pano) {
      pano.setPano(startId || WALK_PANO_ID);
      pano.setPov({ heading: 0, pitch: 0 });
      pano.setZoom(1);
      heading = target = 0;
      depth = targetDepth = 0;
    }
    renderStats();
    say('처음 자리로 돌아왔어요! 다시 걸어 볼까요? 🐾', 2200);
    toast('산책을 처음부터 다시 시작해요');
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
    heartProgress += added;
    let gained = 0;
    while (heartProgress >= STEPS_PER_HEART) {
      heartProgress -= STEPS_PER_HEART;
      if (state.pet.happy < MAX_HEARTS) { addHearts('happy', 1); gained++; }
    }
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
    return added;
  }

  function renderStats() {
    $('#walk-steps').textContent = steps.toLocaleString();
    // 다음 코인·하트까지 남은 양
    const left = WALK_COIN_SECONDS - (walkSeconds % WALK_COIN_SECONDS);
    const toHeart = STEPS_PER_HEART - heartProgress;
    const stampLeft = stampStepsLeft();
    $("#walk-next-coin").textContent = `다음 🪙 코인까지 ${Math.floor(left / 60)}분 ${String(left % 60).padStart(2, "0")}초 · 다음 💗 하트까지 ${toHeart}걸음`
      + (stampLeft > 0 ? ` · 🏅 도장까지 ${stampLeft}걸음` : "");
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
    dressMascot(mascot);
    setMascot(mascot, { mood: pet.sick ? 'sad' : pet.happy >= 3 ? 'happy' : 'normal', sleep: false, sick: pet.sick });

    let status = '';
    if (pet.stage === 'egg') status = '알에서 태어나면 같이 산책할 수 있어요 🥚';
    else if (state.flight) status = '우왕이는 지금 여행 중이에요 ✈️';
    overlay.dataset.away = Boolean(state.flight);
    $('#walk-status').textContent = status;
    renderStats();
    renderPlace();

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
    if (pet.sick) return '아플 때는 쉬어야 해요. 약을 먹고 다시 와요 💊';
    return '';
  }

  function renderCheck() {
    const pet = state.pet;
    const box = $('#walk-check-mascot');
    if (checkStage !== pet.stage) { mountMascot(box, pet.stage); checkStage = pet.stage; }
    dressMascot(box);
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

  // 산책 탭 안의 단계: 'check'(상태 체크) → 'pick'(출발 장소 고르기) → 'walk'(산책)
  function setStep(step) {
    inWalk = step === 'walk';
    $('#walk-check').hidden = step !== 'check';
    $('#walk-pick').hidden = step !== 'pick';
    $('#walk-main').hidden = step !== 'walk';
    if (step === 'check') renderCheck();
    if (step === 'pick') renderPick();
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
    $('#wc-places').innerHTML = list.map((name) => {
      const on = name === chosenName;
      const line = (comments[name] && comments[name][0]) || '우왕이와 걸어 볼까요?';
      return `<button role="radio" aria-checked="${on}" data-start="${name}">`
        + `<span class="pin">${placeIcon(name)}</span><span class="txt"><b>${name}${state.walkStamps[name] ? " <em class=\"visited\">🏅 방문</em>" : ""}</b><small>${line}</small></span><span class="check"></span></button>`;
    }).join('');
    $('#wc-pick-name').textContent = chosenName;
    $('#btn-walk-start').disabled = !chosenName || Boolean(blockReason());
  }

  function startWalk() {
    if (blockReason()) return;
    setStep('walk');
    const startPano = chosenStartId();
    if (pano && startPano) {
      // 고른 장소로 옮기고, "처음부터 다시 하기"도 여기서 시작하게 한다
      pano.setPano(startPano);
      pano.setPov({ heading: 0, pitch: 0 });
      startId = startPano;
      steps = 0;
      walkSeconds = 0;
      heartProgress = 0;
    }
    render();   // 지도가 아직 없으면 여기서 고른 장소로 불러온다
    if (pano) {
      heading = target = pano.getPov().heading;
      depth = targetDepth = 0;
      loop();
    }
    say(chosenName ? `${chosenName}에서 산책 출발! 🐾` : '산책 출발! 🐾', 1800);
    updateMusic();   // 버튼을 누른 순간이라 브라우저가 소리를 허락한다
    stampedPano = '';
    setTimeout(checkStamp, 800);   // 출발 장소도 도장을 찍는다 (지도가 자리를 잡은 뒤)
  }

  function endWalk() {
    toast(`산책 끝! ${steps.toLocaleString()}걸음 걸었어요 🐾`);
    setStep('check');
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
    hereSteps = 0;
    hereDone = false;
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
    const total = placeNames().length;
    const got = placeNames().filter((n) => state.walkStamps[n]).length;
    const allDone = !state.walkStampsDone && total > 0 && got >= total;
    if (allDone) {
      state.walkStampsDone = true;
      state.coins += STAMP_ALL_BONUS;
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
    Sound.bgm(map[placeName()] || fallback);
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
    inWalk = false;
    Sound.bgm('');
  }

  return { init, render: open, stop };
})();
