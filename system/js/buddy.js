// 게임 속 우왕이 반응.
// - GameBuddy: 짝 맞추기·여행 퀴즈·결과 창에 나오는 작은 우왕이 (몸짓 = CSS data-pose, 표정 = mascot.js의 setUwangFace)
// - uwangCanvasArt: 특산품 받기 캔버스에 실제 우왕이 그림을 그리기 위한 이미지와 잘라 낼 영역
// 그림에는 팔이 따로 없어서 박수·만세·브이 같은 손동작은 몸짓에 손 이모지(prop)를 곁들여 보여 준다.
// 표정 이름: '' = 지금 성장 단계의 기본 그림(활짝 웃음), delight = 눈 접은 웃음, surprise = 놀람(동그란 입),
//           chew = 볼 부풀림(집중·의욕), pout = 처진 눈(아쉬움)

// 게임에서는 알도 아기 모습으로 보여 준다 (여행 기내 화면과 같다)
function buddyStage() {
  return state.pet.stage === 'egg' ? 'baby' : state.pet.stage;
}

const UWANG_IMAGE_CACHE = {};
function uwangImage(url) {
  if (!UWANG_IMAGE_CACHE[url]) {
    const img = new Image();
    img.src = url;
    UWANG_IMAGE_CACHE[url] = img;
  }
  return UWANG_IMAGE_CACHE[url];
}

// 표정(face)에 맞는 그림 한 장. 돌려준 영역을 발바닥 기준으로 그리면 된다.
// ref = 그림 속 캐릭터 키(px). 원하는 키 / ref 로 배율을 정하면 단계 그림과 표정 그림의 크기가 같아진다.
function uwangCanvasArt(face) {
  const thin = state.pet.bodyShape === 'thin' ? 0 : 1;
  // 기본 그림: 성장 단계 그림이 UWANG_SHEETS에 있으면 그것, 없으면 상태 시트의 피로 없음 그림
  let sheet = UWANG_SHEETS[buddyStage()] ? buddyStage() : 'states';
  let col = sheet === 'states' ? thin : 0;
  let row = 0;
  if (UWANG_FACES[face]) {
    [sheet, row] = UWANG_FACES[face];
    col = thin;
  }
  const s = UWANG_SHEETS[sheet];
  const multi = s.cx.length > 1;
  const half = multi ? (s.cx[1] - s.cx[0]) / 2 : s.w / 2;
  const top = multi ? Math.max(0, s.feet[row] - s.ref * 1.06) : 0; // 시트는 윗줄 그림이 비치지 않게 캐릭터 키만큼만
  return { img: uwangImage(s.url), sx: s.cx[col] - half, sy: top, sw: half * 2, sh: s.feet[row] - top, ref: s.ref };
}

const GameBuddy = (() => {
  // 손 이모지 위치: 상자 기준 % (head = 머리 옆, hand = 오른손 근처, up = 머리 위, chin = 턱 옆)
  const PROP_SPOT = { head: [70, 8], hand: [74, 52], up: [50, -12], chin: [70, 40] };

  function mount(box) {
    if (!box) return null;
    box.innerHTML = '<div class="mascot-wrap"></div><span class="buddy-prop"></span>';
    const el = box.firstChild;
    mountMascot(el, buddyStage());
    box._token = 0;
    return box;
  }

  // 한 동작: { pose, face, prop, spot, ms }. ms가 0이면 다음 동작이 올 때까지 그대로 둔다.
  function show(box, step) {
    const el = box.querySelector('.mascot-wrap');
    const prop = box.querySelector('.buddy-prop');
    el.dataset.pose = '';
    prop.className = 'buddy-prop';
    void el.offsetWidth; // 같은 몸짓을 다시 재생하기 위한 리플로우
    el.dataset.pose = step.pose || '';
    setUwangFace(el, step.face || '');
    prop.textContent = step.prop || '';
    if (step.prop) {
      const [x, y] = PROP_SPOT[step.spot || 'hand'];
      prop.style.left = `${x}%`;
      prop.style.top = `${y}%`;
      prop.classList.add('on', `prop-${step.pose || 'still'}`);
    }
  }

  function rest(box) {
    show(box, {});
  }

  // 동작 여러 개를 차례로 한다. 새 act가 오면 남은 동작은 취소된다. 다 끝나면 promise가 풀린다.
  function act(box, ...steps) {
    if (!box || !box.querySelector('.mascot-wrap')) return Promise.resolve();
    const token = ++box._token;
    return steps.reduce((p, step) => p.then(() => {
      if (box._token !== token) return null;
      show(box, step);
      if (!step.ms) return null;
      return new Promise((resolve) => setTimeout(resolve, step.ms));
    }), Promise.resolve()).then(() => {
      const last = steps[steps.length - 1];
      if (box._token === token && last && last.ms) rest(box);
    });
  }

  return { mount, act, rest };
})();
