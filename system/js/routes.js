// 교통수단, 출발지(공항·도시), 국내 경로, 거리와 요금 계산.
// 요금 = round((5 + 거리km ÷ 100) × 수단 배수 × 등급 배수), 최소 1코인. 첫 여행은 0코인.
const TRANSPORTS = {
  plane: {
    icon: '✈️', name: '비행기', mult: 1, company: 'WOOANG AIR', pass: '탑승권', passEn: 'BOARDING PASS',
    board: '탑승하기', noise: '기내 소음', voice: '기내 방송', where: '공항',
  },
  ktx: {
    icon: '🚄', name: 'KTX', mult: 0.8, company: 'WOOANG RAIL', pass: '승차권', passEn: 'KTX TICKET',
    board: '열차 타기', noise: '열차 소음', voice: '열차 방송', where: '역',
  },
  bus: {
    icon: '🚌', name: '고속버스', mult: 0.6, company: 'WOOANG BUS', pass: '승차권', passEn: 'EXPRESS BUS',
    board: '버스 타기', noise: '버스 소음', voice: '버스 방송', where: '터미널',
  },
  ship: {
    icon: '⛴️', name: '배', mult: 0.7, company: 'WOOANG FERRY', pass: '승선권', passEn: 'FERRY TICKET',
    board: '배 타기', noise: '선내 소음', voice: '선내 방송', where: '항',
  },
};

// 비행기 출발 공항. intl: 국제선이 있는 공항
const AIRPORTS = [
  { id: 'ICN', name: '인천', lat: 37.46, lon: 126.44, intl: true },
  { id: 'GMP', name: '김포', lat: 37.56, lon: 126.80, intl: true },
  { id: 'PUS', name: '김해', lat: 35.18, lon: 128.94, intl: true },
  { id: 'CJU', name: '제주', lat: 33.51, lon: 126.49, intl: true },
  { id: 'TAE', name: '대구', lat: 35.89, lon: 128.66, intl: true },
  { id: 'CJJ', name: '청주', lat: 36.72, lon: 127.50, intl: true },
  { id: 'KWJ', name: '광주', lat: 35.13, lon: 126.81, intl: false },
  { id: 'YNY', name: '양양', lat: 38.06, lon: 128.67, intl: false },
];

// KTX·고속버스·배 출발 도시
const CITIES = [
  { id: 'seoul', name: '서울' },
  { id: 'busan', name: '부산' },
  { id: 'daegu', name: '대구' },
  { id: 'daejeon', name: '대전' },
  { id: 'gwangju', name: '광주' },
  { id: 'mokpo', name: '목포' },
  { id: 'yeosu', name: '여수' },
];

// 국내 경로표 [출발 도시, 도착 여행지, km, 분]. 여기에 없는 조합은 갈 수 없다.
const GROUND_ROUTES = {
  ktx: [
    ['seoul', 'busan', 417, 150], ['seoul', 'gyeongju', 360, 125], ['seoul', 'gangneung', 230, 115],
    ['seoul', 'jeonju', 230, 100], ['seoul', 'yeosu', 400, 180],
    ['busan', 'seoul', 417, 150], ['busan', 'gyeongju', 50, 30],
    ['daegu', 'seoul', 290, 100], ['daegu', 'busan', 120, 50], ['daegu', 'gyeongju', 70, 20],
    ['daejeon', 'seoul', 160, 60], ['daejeon', 'busan', 255, 95], ['daejeon', 'gyeongju', 200, 70],
    ['gwangju', 'seoul', 300, 110], ['mokpo', 'seoul', 400, 150],
    ['yeosu', 'seoul', 400, 180], ['yeosu', 'jeonju', 170, 65],
  ],
  bus: [
    ['seoul', 'busan', 400, 260], ['seoul', 'gyeongju', 340, 230], ['seoul', 'gangneung', 230, 160],
    ['seoul', 'jeonju', 230, 160], ['seoul', 'yeosu', 380, 250],
    ['busan', 'seoul', 400, 260], ['busan', 'gyeongju', 80, 60], ['busan', 'yeosu', 220, 180],
    ['daegu', 'seoul', 290, 210], ['daegu', 'busan', 130, 100], ['daegu', 'gyeongju', 70, 60],
    ['daejeon', 'seoul', 160, 120], ['daejeon', 'jeonju', 100, 80],
    ['gwangju', 'seoul', 300, 210], ['gwangju', 'jeonju', 100, 80], ['gwangju', 'yeosu', 120, 100],
    ['gwangju', 'busan', 260, 210], ['mokpo', 'seoul', 380, 260],
    ['yeosu', 'seoul', 380, 250], ['yeosu', 'busan', 220, 180],
  ],
  ship: [
    ['busan', 'jeju', 290, 720], ['mokpo', 'jeju', 180, 270], ['yeosu', 'jeju', 230, 330],
  ],
};

const Routes = (() => {
  const MIN_FLIGHT_KM = 100; // 이보다 가까운 공항끼리는 비행기를 타지 않는다
  const ICN = AIRPORTS[0];

  function km(a, b) {
    const rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad;
    const dLon = (b.lon - a.lon) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
    return Math.round(2 * 6371 * Math.asin(Math.sqrt(h)));
  }

  function airport(id) {
    return AIRPORTS.find((a) => a.id === id) || ICN;
  }

  function city(id) {
    return CITIES.find((c) => c.id === id) || CITIES[0];
  }

  // 출발지 목록 [{ id, label }]
  function origins(transport) {
    if (transport === 'plane') return AIRPORTS.map((a) => ({ id: a.id, label: `${a.name} (${a.id})` }));
    const ids = new Set(GROUND_ROUTES[transport].map((r) => r[0]));
    return CITIES.filter((c) => ids.has(c.id)).map((c) => ({ id: c.id, label: `${c.name}${TRANSPORTS[transport].where}` }));
  }

  // 출발지에서 갈 수 있는 여행지 목록
  function destinations(transport, fromId) {
    return DESTINATIONS.filter((d) => trip(transport, fromId, d.id));
  }

  // 경로 정보 { km, minutes, fromCode, fromName, toCode, toName }. 갈 수 없으면 null
  function trip(transport, fromId, destId) {
    const d = DESTINATIONS.find((x) => x.id === destId);
    if (!d) return null;
    if (transport === 'plane') {
      const a = AIRPORTS.find((x) => x.id === fromId);
      if (!a) return null;
      const domestic = d.region === '국내';
      if (domestic && !d.airport) return null;
      if (!domestic && !a.intl) return null;
      const dist = km(a, d);
      if (dist < MIN_FLIGHT_KM) return null;
      const minutes = domestic
        ? Math.round(25 + dist / 10)
        : Math.max(30, Math.round(d.minutes + (dist - km(ICN, d)) / 8)); // 인천 기준 시간을 거리 차이만큼 보정
      return { km: dist, minutes, fromCode: a.id, fromName: a.name, toCode: d.code, toName: d.name };
    }
    const routes = GROUND_ROUTES[transport] || [];
    const r = routes.find(([from, to]) => from === fromId && to === destId);
    if (!r) return null;
    const c = city(fromId);
    const where = TRANSPORTS[transport].where;
    return { km: r[2], minutes: r[3], fromCode: c.name, fromName: `${c.name}${where}`, toCode: d.name, toName: `${d.name}${where}` };
  }

  // 앱에서 처음 하는 여행은 무료
  function isFreeTrip() {
    return state.trips === 0;
  }

  // 코인은 늘 자연수. 첫 여행만 0 (applyFree가 false면 원래 요금)
  function fare(transport, distKm, classMult, applyFree = true) {
    if (applyFree && isFreeTrip()) return 0;
    return Math.max(1, Math.round((5 + distKm / 100) * TRANSPORTS[transport].mult * classMult));
  }

  return { origins, destinations, trip, fare, isFreeTrip, airport, city };
})();
