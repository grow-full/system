// 여행지 데이터. 비행시간(minutes)은 인천 출발 직항 기준의 대략적인 시간이다.
// 여행지를 추가하려면 DESTINATIONS에 항목을 하나 더 넣으면 된다.
// tips는 커뮤니티 탭에 처음 들어 있는 예시 글이 된다.
const REGIONS = ['국내', '아시아', '유럽', '미주·오세아니아'];

const DESTINATIONS = [
  {
    id: 'jeju', name: '제주도', country: '대한민국', region: '국내', code: 'CJU', minutes: 70,
    icon: '🏝️', color: '#ff9f43', sky: 'linear-gradient(135deg, #4facfe, #43e97b)', scene: '🌊🏝️🍊',
    item: { emoji: '🍊', name: '감귤' }, souvenir: { emoji: '🗿', name: '돌하르방 미니어처' },
    tips: [
      { category: '교통', text: '버스 배차 간격이 길어서 렌터카나 택시 투어를 많이 이용해요.' },
      { category: '관광', text: '해안가는 바람이 세니까 얇은 겉옷을 꼭 챙기세요.' },
    ],
  },
  {
    id: 'tokyo', name: '도쿄', country: '일본', region: '아시아', code: 'NRT', minutes: 140,
    icon: '🗻', color: '#e84393', sky: 'linear-gradient(135deg, #ff9a9e, #fbc2eb)', scene: '🗻🌸🍣',
    item: { emoji: '🍣', name: '초밥' }, souvenir: { emoji: '🎏', name: '잉어 깃발' },
    tips: [
      { category: '교통', text: '스이카(Suica)나 파스모(PASMO) 하나로 지하철과 편의점 결제까지 할 수 있어요.' },
      { category: '기타', text: '길거리에 쓰레기통이 드물어요. 작은 봉투를 챙기면 편해요.' },
    ],
  },
  {
    id: 'osaka', name: '오사카', country: '일본', region: '아시아', code: 'KIX', minutes: 110,
    icon: '🏯', color: '#fd79a8', sky: 'linear-gradient(135deg, #f6d365, #fda085)', scene: '🏯🐙🎡',
    item: { emoji: '🐙', name: '타코야키' }, souvenir: { emoji: '🐱', name: '복고양이 인형' },
    tips: [
      { category: '교통', text: '여러 관광지를 돌 거면 오사카 주유패스를 비교해 보세요.' },
      { category: '맛집', text: '도톤보리는 저녁에 사람이 아주 많아요. 낮에 한 번 둘러보는 걸 추천해요.' },
    ],
  },
  {
    id: 'fukuoka', name: '후쿠오카', country: '일본', region: '아시아', code: 'FUK', minutes: 80,
    icon: '♨️', color: '#e17055', sky: 'linear-gradient(135deg, #fbc2eb, #a6c1ee)', scene: '♨️🍜🏮',
    item: { emoji: '🍜', name: '돈코츠 라멘' }, souvenir: { emoji: '🎐', name: '유리 풍경' },
    tips: [
      { category: '교통', text: '공항에서 시내(하카타)까지 지하철로 10분 정도라 아주 가까워요.' },
      { category: '맛집', text: '나카스 강변 포장마차(야타이)는 저녁에 열려요.' },
    ],
  },
  {
    id: 'taipei', name: '타이베이', country: '대만', region: '아시아', code: 'TPE', minutes: 150,
    icon: '🏙️', color: '#00b894', sky: 'linear-gradient(135deg, #84fab0, #8fd3f4)', scene: '🏙️🧋🏮',
    item: { emoji: '🧋', name: '버블티' }, souvenir: { emoji: '🏮', name: '풍등 미니어처' },
    tips: [
      { category: '교통', text: '이지카드(EasyCard)로 지하철, 버스, 편의점을 다 이용할 수 있어요.' },
      { category: '쇼핑', text: '야시장 노점은 현금만 받는 곳이 많아요.' },
    ],
  },
  {
    id: 'danang', name: '다낭', country: '베트남', region: '아시아', code: 'DAD', minutes: 280,
    icon: '🏖️', color: '#fdcb6e', sky: 'linear-gradient(135deg, #f093fb, #f5576c)', scene: '🏖️🥖🌴',
    item: { emoji: '🥖', name: '반미' }, souvenir: { emoji: '☕', name: '베트남 커피 필터' },
    tips: [
      { category: '교통', text: '그랩(Grab) 앱으로 택시를 부르면 요금이 미리 정해져서 편해요.' },
      { category: '쇼핑', text: '베트남 동은 0이 많아요. 계산할 때 단위를 꼭 확인하세요.' },
    ],
  },
  {
    id: 'bangkok', name: '방콕', country: '태국', region: '아시아', code: 'BKK', minutes: 350,
    icon: '🛕', color: '#e1a100', sky: 'linear-gradient(135deg, #fddb92, #d1fdff)', scene: '🛕🥭🐘',
    item: { emoji: '🥭', name: '망고' }, souvenir: { emoji: '🐘', name: '코끼리 바지' },
    tips: [
      { category: '관광', text: '왕궁과 사원은 어깨와 무릎을 가리는 옷을 입어야 들어갈 수 있어요.' },
      { category: '교통', text: '출퇴근 시간에는 BTS 지상철이 택시보다 훨씬 빨라요.' },
    ],
  },
  {
    id: 'singapore', name: '싱가포르', country: '싱가포르', region: '아시아', code: 'SIN', minutes: 390,
    icon: '🦁', color: '#d63031', sky: 'linear-gradient(135deg, #ff758c, #ff7eb3)', scene: '🦁🌃🦀',
    item: { emoji: '🦀', name: '칠리크랩' }, souvenir: { emoji: '🍯', name: '카야잼' },
    tips: [
      { category: '교통', text: '지하철(MRT) 안에서는 음식과 음료를 먹으면 벌금을 낼 수 있어요.' },
      { category: '기타', text: '껌은 반입이 제한되니 챙겨 가지 마세요.' },
    ],
  },
  {
    id: 'paris', name: '파리', country: '프랑스', region: '유럽', code: 'CDG', minutes: 830,
    icon: '🗼', color: '#6c5ce7', sky: 'linear-gradient(135deg, #a18cd1, #fbc2eb)', scene: '🗼🥐🎨',
    item: { emoji: '🥐', name: '크루아상' }, souvenir: { emoji: '🗼', name: '에펠탑 키링' },
    tips: [
      { category: '관광', text: '루브르 같은 인기 박물관은 시간 예약을 해 두면 줄을 서지 않아요.' },
      { category: '기타', text: '관광지와 지하철에서는 소매치기를 조심하고 가방을 앞으로 메세요.' },
    ],
  },
  {
    id: 'london', name: '런던', country: '영국', region: '유럽', code: 'LHR', minutes: 860,
    icon: '🎡', color: '#0984e3', sky: 'linear-gradient(135deg, #89f7fe, #66a6ff)', scene: '🎡💂🐟',
    item: { emoji: '🐟', name: '피시 앤 칩스' }, souvenir: { emoji: '💂', name: '근위병 인형' },
    tips: [
      { category: '교통', text: '지하철과 버스는 컨택리스 카드로 바로 탈 수 있고 하루 요금 상한이 있어요.' },
      { category: '기타', text: '날씨가 자주 바뀌니 작은 우산을 늘 들고 다니세요.' },
    ],
  },
  {
    id: 'rome', name: '로마', country: '이탈리아', region: '유럽', code: 'FCO', minutes: 820,
    icon: '🏛️', color: '#c0392b', sky: 'linear-gradient(135deg, #f6d365, #fda085)', scene: '🏛️🍕⛲',
    item: { emoji: '🍕', name: '피자' }, souvenir: { emoji: '🛵', name: '스쿠터 미니어처' },
    tips: [
      { category: '관광', text: '성당에 들어갈 때는 어깨와 무릎을 가리는 옷이 필요해요.' },
      { category: '기타', text: '거리 곳곳의 식수대(나소네)에서 물을 무료로 마실 수 있어요.' },
    ],
  },
  {
    id: 'hawaii', name: '하와이', country: '미국', region: '미주·오세아니아', code: 'HNL', minutes: 510,
    icon: '🌴', color: '#00cec9', sky: 'linear-gradient(135deg, #43e97b, #38f9d7)', scene: '🌴🌺🍍',
    item: { emoji: '🍍', name: '파인애플' }, souvenir: { emoji: '🌺', name: '레이 꽃목걸이' },
    tips: [
      { category: '관광', text: '햇볕이 아주 강해요. 산호초를 지키는 선크림을 쓰세요.' },
      { category: '기타', text: '미국 여행이라 출발 전에 ESTA(전자여행허가)를 받아야 해요.' },
    ],
  },
  {
    id: 'la', name: '로스앤젤레스', country: '미국', region: '미주·오세아니아', code: 'LAX', minutes: 660,
    icon: '🌇', color: '#e67e22', sky: 'linear-gradient(135deg, #fa709a, #fee140)', scene: '🌇🎬🌮',
    item: { emoji: '🌮', name: '타코' }, souvenir: { emoji: '🎬', name: '영화 슬레이트' },
    tips: [
      { category: '교통', text: '도시가 넓어서 렌터카나 차량 공유 앱을 많이 써요.' },
      { category: '맛집', text: '식당에서는 보통 금액의 18~20% 정도를 팁으로 내요.' },
    ],
  },
  {
    id: 'newyork', name: '뉴욕', country: '미국', region: '미주·오세아니아', code: 'JFK', minutes: 840,
    icon: '🗽', color: '#2d3436', sky: 'linear-gradient(135deg, #667eea, #764ba2)', scene: '🗽🥯🍎',
    item: { emoji: '🥯', name: '베이글' }, souvenir: { emoji: '🍎', name: '빅애플 마그넷' },
    tips: [
      { category: '교통', text: '지하철은 24시간 다니고, 개찰구에서 컨택리스 카드를 바로 찍으면 돼요.' },
      { category: '관광', text: '전망대는 해 질 무렵 시간대가 인기가 많아서 미리 예약하는 게 좋아요.' },
    ],
  },
  {
    id: 'sydney', name: '시드니', country: '호주', region: '미주·오세아니아', code: 'SYD', minutes: 630,
    icon: '🦘', color: '#16a085', sky: 'linear-gradient(135deg, #4facfe, #00f2fe)', scene: '🦘🐨🌊',
    item: { emoji: '🥧', name: '미트파이' }, souvenir: { emoji: '🐨', name: '코알라 인형' },
    tips: [
      { category: '기타', text: '계절이 한국과 반대예요. 한국이 겨울이면 호주는 여름이에요.' },
      { category: '교통', text: '대중교통은 오팔카드나 컨택리스 카드로 탈 수 있어요.' },
    ],
  },
];

// 여행지에 처음 도착하면 받는 의상. slot: 입는 자리
const SLOT_NAMES = { head: '머리', face: '얼굴', neck: '목', hand: '손' };
const OUTFITS = {
  jeju: { emoji: '🍊', name: '감귤 모자', slot: 'head' },
  tokyo: { emoji: '🌸', name: '벚꽃 머리핀', slot: 'head' },
  osaka: { emoji: '🏮', name: '초롱', slot: 'hand' },
  fukuoka: { emoji: '🎐', name: '유리 풍경', slot: 'hand' },
  taipei: { emoji: '🧋', name: '버블티', slot: 'hand' },
  danang: { emoji: '👒', name: '밀짚모자', slot: 'head' },
  bangkok: { emoji: '🌼', name: '재스민 꽃', slot: 'head' },
  singapore: { emoji: '🌂', name: '우산', slot: 'hand' },
  paris: { emoji: '🎨', name: '화가 팔레트', slot: 'hand' },
  london: { emoji: '🎩', name: '신사 모자', slot: 'head' },
  rome: { emoji: '🍦', name: '젤라토', slot: 'hand' },
  hawaii: { emoji: '🌺', name: '꽃목걸이', slot: 'neck' },
  la: { emoji: '🕶️', name: '선글라스', slot: 'face' },
  newyork: { emoji: '🧢', name: '야구 모자', slot: 'head' },
  sydney: { emoji: '🤿', name: '스노클 마스크', slot: 'face' },
};
DESTINATIONS.forEach((d) => { d.outfit = OUTFITS[d.id]; });

// 공부할 때 쓰는 갈색 뿔테 안경 (그림 이모지는 파란색이라 직접 그린다)
// 좌표는 우왕이 그림(200×200)과 같아서 렌즈가 우왕이 눈(72,104 / 128,104)에 맞는다.
const HORN_GLASSES_SVG = '<svg viewBox="38 86 124 36" xmlns="http://www.w3.org/2000/svg">'
  + '<g fill="rgba(255,255,255,.28)" stroke="#4a2c17" stroke-width="5.5" stroke-linejoin="round">'
  + '<rect x="51" y="91" width="42" height="27" rx="9"/><rect x="107" y="91" width="42" height="27" rx="9"/></g>'
  + '<path d="M51 95 h42 M107 95 h42" stroke="#2e1a0d" stroke-width="7" stroke-linecap="round"/>'
  + '<path d="M93 99 q7 -6 14 0" stroke="#4a2c17" stroke-width="5" fill="none" stroke-linecap="round"/>'
  + '<path d="M51 97 l-10 -2 M149 97 l10 -2" stroke="#4a2c17" stroke-width="5" stroke-linecap="round"/>'
  + '</svg>';

// 처음부터 가지고 있는 기본 옷 (여행을 가지 않아도 언제나 입을 수 있다)
const BASIC_OUTFITS = {
  basic_cap: { emoji: '🎓', name: '학사모', slot: 'head' },
  basic_glasses: { emoji: '👓', name: '뿔테 안경', slot: 'face', art: HORN_GLASSES_SVG },
};
Object.assign(OUTFITS, BASIC_OUTFITS);

// 지금 입을 수 있는 옷 id (기본 옷 + 여행에서 받은 옷)
function ownedOutfitIds() {
  return [...Object.keys(BASIC_OUTFITS), ...state.outfits.filter((id) => OUTFITS[id])];
}

function destById(id) {
  return DESTINATIONS.find((d) => d.id === id) || DESTINATIONS[0];
}

// 지역별로 묶은 <option> 목록
function destOptionsHtml({ withTime = false } = {}) {
  return REGIONS.map((region) => {
    const options = DESTINATIONS.filter((d) => d.region === region)
      .map((d) => `<option value="${d.id}">${d.icon} ${d.name}${withTime ? ` · ${flightLabel(d.minutes)}` : ''}</option>`)
      .join('');
    return `<optgroup label="${region}">${options}</optgroup>`;
  }).join('');
}

// 받침에 맞는 조사를 고른다. 예) josa('로마', '은', '는') → '로마는'
function josa(word, withBatchim, withoutBatchim) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return `${word}${withoutBatchim}`;
  const jong = code % 28;
  // '으로/로'는 ㄹ 받침(8)일 때도 '로'를 쓴다
  const useWith = withBatchim === '으로' ? jong !== 0 && jong !== 8 : jong !== 0;
  return `${word}${useWith ? withBatchim : withoutBatchim}`;
}

function flightLabel(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m}분`;
  return m ? `${h}시간 ${m}분` : `${h}시간`;
}

// 버튼에 보여 줄 옷 그림 (직접 그린 그림이 있으면 그것, 없으면 이모지)
function outfitIcon(o) {
  return o.art ? `<i class="outfit-art">${o.art}</i>` : o.emoji;
}
