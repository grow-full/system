// 우왕이 상태 저장/불러오기와 다마고치 규칙(배고픔, 행복, 똥, 병, 잠).
const STORAGE_KEY = 'wooang-travel-v2';

const MAX_HEARTS = 4;
const HATCH_SECONDS = 30;
const SNACK_COST = 3;
const CHILD_LEVEL = 3;
const ADULT_LEVEL = 5;

// 어른이 될 때 그동안 어떻게 키웠는지에 따라 모습이 갈라진다 (decideForm 참고)
const ADULT_FORMS = {
  shiny: { name: '반짝 우왕이', icon: '🌟', hint: '돌봄 실수 1번 이하로 키우면' },
  traveler: { name: '여행가 우왕이', icon: '✈️', hint: '여행을 3번 이상, 게임보다 많이 다니면' },
  gamer: { name: '게이머 우왕이', icon: '🎮', hint: '게임을 6판 이상 하면' },
  sturdy: { name: '듬직 우왕이', icon: '💪', hint: '평범하게 무난히 키우면' },
  messy: { name: '꾀죄죄 우왕이', icon: '😪', hint: '돌봄 실수가 4번 이상이면' },
};

// 단위: 분. 숫자를 바꾸면 우왕이가 빨리/천천히 배고파진다.
const CARE = {
  hungerEvery: 40,     // 배고픔 하트 1개가 줄어드는 간격
  happyEvery: 50,      // 행복 하트 1개가 줄어드는 간격 (아프거나 똥이 많으면 2배 빠름)
  poopEvery: 90,       // 똥을 싸는 간격
  sickFromPoop: 60,    // 똥 2개 이상을 이만큼 두면 병에 걸림
  sickFromStarve: 120, // 배고픔 0으로 이만큼 지나면 병에 걸림
  napLength: 60,       // 낮잠 길이
  lightsGrace: 15,     // 밤에 불을 켜 둔 채 이만큼 지나면 돌봄 실수
};
const NIGHT_START = 22;
const NIGHT_END = 8;

function defaultPet() {
  return {
    stage: 'egg', // egg → baby → child → adult
    form: null,   // 어른이 된 뒤의 모습 (ADULT_FORMS의 키)
    bornAt: Date.now(),
    hatchedAt: null,
    hunger: 3,
    happy: 3,
    weight: 5,
    poop: 0,
    sick: false,
    lightsOff: false,
    careMistakes: 0,
    wasNight: false,
    timers: { hunger: 0, happy: 0, poop: 0, sickRisk: 0, starve: 0, nap: 0, nightLight: 0 },
  };
}

function defaultState() {
  return {
    version: 2,
    pet: defaultPet(),
    level: 1,
    exp: 0,
    coins: 0,       // 코인은 게임으로만 번다 (games.js)
    coinsEarned: 0, // 지금까지 게임으로 번 코인
    lastTick: Date.now(),
    ticket: null,   // 발권했지만 아직 타지 않은 표 (요금은 발권할 때 낸다)
    flight: null,   // { mode, transport, from, destId, start, duration, elapsed, flightNo, seat, seatClass, fare }
    arrival: null,  // 도착 화면을 아직 확인하지 않은 여행
    trips: 0,
    gamesPlayed: 0,
    visited: {},
    souvenirs: [],
    outfits: [],    // 받은 의상 (여행지 id)
    equipped: { head: null, face: null, neck: null, hand: null },
    forms: [],      // 지금까지 키워 본 어른 모습 (다시 키워도 남는다)
    bestScores: {},
    deviceId: Math.random().toString(36).slice(2, 10),
    likedPosts: [],
    nickname: '',
    voiceOn: true,  // 기내 방송 음성
    notifyOn: false, // 돌봄 알림 (notify.js)
    focusTotal: 0,  // 집중 모드 누적 시간(초)
    playedAt: 0,    // 마지막으로 직접 플레이한 시각. 기기끼리 이 값이 큰 쪽 진행을 쓴다 (cloud.js)
    owner: null,    // 이 진행이 속한 계정 id (로그인 안 했으면 null)
  };
}

// 저장해 둔 데이터를 지금 버전의 모양으로 맞춘다. 기기 저장소와 클라우드 저장 모두 여기를 거친다.
function normalizeState(saved) {
  if (!saved || saved.version !== 2) return null;
  const merged = Object.assign(defaultState(), saved);
  merged.pet = Object.assign(defaultPet(), saved.pet);
  merged.pet.timers = Object.assign(defaultPet().timers, saved.pet && saved.pet.timers);
  merged.equipped = Object.assign(defaultState().equipped, saved.equipped);
  if (merged.pet.stage === 'adult' && !merged.pet.form) merged.pet.form = 'sturdy'; // 진화 기능 이전에 어른이 된 경우
  // 교통수단·집중 모드 기능 이전에 출발한 비행은 인천발 일반 비행기로 본다
  if (merged.flight && !merged.flight.transport) {
    Object.assign(merged.flight, { mode: 'normal', transport: 'plane', from: 'ICN', seatClass: 'economy', fare: 0 });
  }
  return merged;
}

function loadState() {
  try {
    const merged = normalizeState(JSON.parse(localStorage.getItem(STORAGE_KEY)));
    if (merged) return merged;
  } catch (e) {
    // 저장소를 쓸 수 없으면 새로 시작
  }
  return defaultState();
}

let state = loadState();

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    // 저장 실패는 무시 (시크릿 모드 등)
  }
  if (typeof Cloud !== 'undefined') Cloud.onSave();
}

function resetState() {
  const { deviceId, likedPosts, nickname, forms, notifyOn, owner } = state;
  state = Object.assign(defaultState(), { deviceId, likedPosts, nickname, forms, notifyOn, owner, playedAt: owner ? Date.now() : 0 });
  saveState();
}

function addHearts(key, delta) {
  state.pet[key] = Math.max(0, Math.min(MAX_HEARTS, state.pet[key] + delta));
}

function isNight(time = Date.now()) {
  const hour = new Date(time).getHours();
  return hour >= NIGHT_START || hour < NIGHT_END;
}

function isAsleep() {
  return state.pet.stage !== 'egg' && (state.pet.lightsOff || isNight());
}

// 앱을 꺼 둔 시간까지 1분 단위로 따라잡는다 (최대 3일).
function simulate() {
  const now = Date.now();
  if (state.pet.stage === 'egg') {
    state.lastTick = now;
    return;
  }
  const minutes = Math.floor((now - state.lastTick) / 60000);
  if (minutes <= 0) return;
  const start = state.lastTick;
  state.lastTick += minutes * 60000;
  const steps = Math.min(minutes, 3 * 24 * 60);
  for (let i = 1; i <= steps; i++) stepMinute(start + (minutes - steps + i) * 60000);
}

function stepMinute(time) {
  const pet = state.pet;
  const tm = pet.timers;
  if (state.flight) return; // 여행 중에는 기내에서 돌봐 준다

  const night = isNight(time);
  if (!night && pet.wasNight) pet.lightsOff = false; // 아침이 되면 저절로 일어난다
  pet.wasNight = night;

  if (night) {
    if (!pet.lightsOff && ++tm.nightLight === CARE.lightsGrace) {
      pet.careMistakes++;
      addHearts('happy', -1);
    }
    return;
  }
  tm.nightLight = 0;

  if (pet.lightsOff) {
    if (++tm.nap >= CARE.napLength) {
      pet.lightsOff = false;
      tm.nap = 0;
    }
    return;
  }
  tm.nap = 0;

  if (++tm.hunger >= CARE.hungerEvery) {
    tm.hunger = 0;
    addHearts('hunger', -1);
  }
  tm.happy += pet.sick || pet.poop >= 2 ? 2 : 1;
  if (tm.happy >= CARE.happyEvery) {
    tm.happy = 0;
    addHearts('happy', -1);
  }
  if (++tm.poop >= CARE.poopEvery) {
    tm.poop = 0;
    pet.poop = Math.min(4, pet.poop + 1);
  }

  tm.sickRisk = pet.poop >= 2 ? tm.sickRisk + 1 : 0;
  tm.starve = pet.hunger === 0 ? tm.starve + 1 : 0;
  if (!pet.sick && (tm.sickRisk >= CARE.sickFromPoop || tm.starve >= CARE.sickFromStarve)) {
    pet.sick = true;
    pet.careMistakes++;
    tm.sickRisk = 0;
    tm.starve = 0;
  }
}

function hatch() {
  const pet = state.pet;
  pet.stage = 'baby';
  pet.hatchedAt = Date.now();
  pet.wasNight = isNight();
  state.lastTick = Date.now();
}

function decideForm() {
  const mistakes = state.pet.careMistakes;
  if (mistakes >= 4) return 'messy';
  if (state.trips >= 3 && state.trips * 2 >= state.gamesPlayed) return 'traveler';
  if (state.gamesPlayed >= 6) return 'gamer';
  if (mistakes <= 1) return 'shiny';
  return 'sturdy';
}

// 성장했으면 알림 문구를, 아니면 빈 문자열을 돌려준다
function checkGrowth() {
  const pet = state.pet;
  if (pet.stage === 'baby' && state.level >= CHILD_LEVEL) {
    pet.stage = 'child';
    return '우왕이가 어린이가 되었어요! 🌱';
  }
  if (pet.stage === 'child' && state.level >= ADULT_LEVEL) {
    pet.stage = 'adult';
    pet.form = decideForm();
    if (!state.forms.includes(pet.form)) state.forms.push(pet.form);
    const form = ADULT_FORMS[pet.form];
    return `우왕이가 ${form.icon} ${josa(form.name, '으로', '로')} 자랐어요!`;
  }
  return '';
}

function stageLabel() {
  const pet = state.pet;
  if (pet.stage === 'adult') return ADULT_FORMS[pet.form].name;
  return { egg: '알', baby: '아기', child: '어린이' }[pet.stage];
}

function nextGrowthLevel() {
  return { baby: CHILD_LEVEL, child: ADULT_LEVEL }[state.pet.stage] || null;
}

function ageDays() {
  const pet = state.pet;
  return pet.hatchedAt ? Math.floor((Date.now() - pet.hatchedAt) / 86400000) : 0;
}

// 지금 우왕이에게 필요한 것 (급한 순서)
function petNeeds() {
  const pet = state.pet;
  if (pet.stage === 'egg' || state.flight) return [];
  const needs = [];
  if (pet.sick) needs.push('아파요… 약이 필요해요 💊');
  if (isNight() && !pet.lightsOff) needs.push('졸려요… 불을 꺼 주세요 💡');
  if (pet.poop > 0) needs.push('똥을 치워 주세요 🚽');
  if (pet.hunger === 0) needs.push('배고파요! 밥을 주세요 🍙');
  if (pet.happy === 0) needs.push('심심해요… 놀아 주세요 🎾');
  return needs;
}

function expToNext(level) {
  return level * 50;
}

// 레벨이 올랐으면 true
function addExp(amount) {
  state.exp += amount;
  let leveledUp = false;
  while (state.exp >= expToNext(state.level)) {
    state.exp -= expToNext(state.level);
    state.level++;
    leveledUp = true;
  }
  return leveledUp;
}
