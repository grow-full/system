// 우왕이 캐릭터와 알 (임시 도트 그림, 32×32칸).
// 실제 우왕이 도트 그림을 받으면 아래 모양 정의(타원·점 좌표)를 바꾸면 된다.
// 상태는 감싸는 요소의 data-* 속성으로 CSS에서 바꾼다:
//   data-stage(egg/baby/child/adult), data-form(어른 모습), data-mood(happy/normal/sad),
//   data-sleep, data-sick, data-look(left/right/point), data-anim(eat/refuse/joy/tap), data-crack
// 성장 단계와 어른 모습별 장식은 acc-* 그룹으로 SVG 안에 모두 들어 있고, CSS가 골라서 보여 준다.

const GRID = 32;
const CELL = 200 / GRID; // 한 칸 = 6.25 (viewBox 200 기준)

// 32×32 빈 격자
function pxGrid() {
  return Array.from({ length: GRID }, () => Array(GRID).fill('.'));
}

// 타원 안의 칸을 ch로 채운다 (칸 가운데가 타원 안이면 채움)
function pxEllipse(g, cx, cy, rx, ry, ch) {
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) g[y][x] = ch;
    }
  }
  return g;
}

// [x, y] 목록의 칸을 ch로
function pxDots(g, points, ch) {
  points.forEach(([x, y]) => { g[y][x] = ch; });
  return g;
}

// 칠해진 칸 중 바깥과 맞닿은 칸만 남겨 테두리를 만든다
function pxOutline(shape, ch) {
  const out = pxGrid();
  const filled = (x, y) => x >= 0 && y >= 0 && x < GRID && y < GRID && shape[y][x] !== '.';
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      if (filled(x, y) && (!filled(x - 1, y) || !filled(x + 1, y) || !filled(x, y - 1) || !filled(x, y + 1))) out[y][x] = ch;
    }
  }
  return out;
}

// 격자 하나를 <g>로. palette에서 null인 글자는 감싸는 그룹의 색을 따른다
function pxLayer(g, cls = '', palette = PX, attrs = '') {
  const rows = g.map((r) => r.join(''));
  return `<g${cls ? ` class="${cls}"` : ''}${attrs ? ` ${attrs}` : ''}>${pixelRects(rows, palette, CELL)}</g>`;
}

// 가로줄 [x1..x2] 칸들
function pxRun(x1, x2, y) {
  const pts = [];
  for (let x = x1; x <= x2; x++) pts.push([x, y]);
  return pts;
}

// 반짝이 (가운데 흰 칸 + 상하좌우 노란 칸)
function pxSparkle(x, y) {
  return [[x, y - 1], [x - 1, y], [x + 1, y], [x, y + 1]];
}

const MASCOT_SVG = (() => {
  // 몸통 실루엣: 머리 겸 몸 + 두 귀
  const body = pxGrid();
  pxEllipse(body, 8, 10, 3.5, 3.5, 'S');
  pxEllipse(body, 24, 10, 3.5, 3.5, 'S');
  pxEllipse(body, 16, 19.6, 12.3, 11.2, 'S');
  const outline = pxOutline(body, 'K');
  const skin = body.map((row, y) => row.map((c, x) => (outline[y][x] === 'K' ? '.' : c)));

  const shadow = pxEllipse(pxGrid(), 16, 31.2, 10, 1, 'H');
  const inner = pxGrid();
  pxEllipse(inner, 8, 9.6, 1.6, 1.6, 'E');
  pxEllipse(inner, 24, 9.6, 1.6, 1.6, 'E');
  pxEllipse(inner, 16, 24.6, 6.6, 4.6, 'E');
  const cheeks = pxDots(pxGrid(), [[7, 20], [8, 20], [23, 20], [24, 20]], 'C');
  const nose = pxDots(pxGrid(), [[15, 19], [16, 19]], 'N');

  const pupils = pxDots(pxGrid(), [
    [10, 16], [10, 17], [11, 17], [10, 18], [11, 18],
    [20, 16], [20, 17], [21, 17], [20, 18], [21, 18],
  ], 'K');
  pxDots(pupils, [[11, 16], [21, 16]], 'W');
  const closed = pxDots(pxGrid(), [[9, 16], [10, 17], [11, 17], [12, 16], [19, 16], [20, 17], [21, 17], [22, 16]], 'K');
  const xEyes = pxDots(pxGrid(), [
    [9, 16], [11, 16], [10, 17], [9, 18], [11, 18],
    [20, 16], [22, 16], [21, 17], [20, 18], [22, 18],
  ], 'K');

  const happy = pxDots(pxGrid(), [[13, 21], [18, 21], ...pxRun(14, 17, 22)], 'N');
  const normal = pxDots(pxGrid(), pxRun(14, 17, 22), 'N');
  const sad = pxDots(pxGrid(), [...pxRun(14, 17, 21), [13, 22], [18, 22]], 'N');
  const open = pxDots(pxGrid(), [...pxRun(14, 17, 21), ...pxRun(14, 17, 22), [15, 23], [16, 23]], 'N');

  // 어린이: 머리 위 새싹
  const sprout = pxDots(pxGrid(), [[16, 6], [16, 7], ...pxRun(13, 15, 5), ...pxRun(17, 19, 5), [12, 4], [13, 4], [19, 4], [20, 4]], 'G');
  // 반짝: 주변 반짝이
  const shiny = pxDots(pxGrid(), [...pxSparkle(3, 5), ...pxSparkle(28, 4), ...pxSparkle(29, 20)], 'Y');
  pxDots(shiny, [[3, 5], [28, 4], [29, 20]], 'W');
  // 여행가: 탐험 모자
  const hat = pxGrid();
  pxDots(hat, pxRun(12, 19, 3), 'K');
  for (let y = 4; y <= 6; y++) pxDots(pxDots(hat, pxRun(12, 19, y), 'O'), [[11, y], [20, y]], 'K');
  pxDots(hat, pxRun(11, 20, 7), 'N');
  pxDots(hat, pxRun(6, 25, 8), 'N');
  pxDots(hat, [[5, 8], [26, 8]], 'K');
  // 게이머: 헤드폰 (머리띠 + 귀 덮개)
  const band = pxDots(pxGrid(), [...pxRun(10, 21, 4), [8, 5], [9, 5], [22, 5], [23, 5], [7, 6], [24, 6], [6, 7], [25, 7]], 'V');
  const cups = pxGrid();
  for (let y = 13; y <= 19; y++) pxDots(cups, [[2, y], [3, y], [4, y], [27, y], [28, y], [29, y]], 'V');
  pxDots(cups, [[3, 14], [28, 14]], 'B');
  // 꾀죄죄: 헝클어진 털과 얼룩
  const messy = pxDots(pxGrid(), [[13, 6], [16, 6], [19, 6], [12, 7], [14, 7], [15, 7], [17, 7], [18, 7], [20, 7]], 'N');
  pxDots(messy, [[22, 26], [23, 26], [9, 27], [19, 12], [20, 12]], 'H');
  // 듬직: 진한 눈썹
  const brows = pxDots(pxGrid(), [[9, 13], [10, 13], [11, 14], [12, 14], [19, 14], [20, 14], [21, 13], [22, 13]], 'K');

  const skinPalette = { ...PX, S: null };
  return `
<svg viewBox="0 0 200 200" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg" aria-label="우왕이">
  ${pxLayer(shadow)}
  <g class="m-body">
    <g class="acc acc-gamer">${pxLayer(band)}</g>
    ${pxLayer(skin, 'm-skin', skinPalette, `fill="${PX.S}"`)}
    ${pxLayer(inner)}
    ${pxLayer(outline)}
    ${pxLayer(cheeks)}
    ${pxLayer(nose)}
    <g class="m-eyes">${pxLayer(pupils, 'm-pupils')}</g>
    ${pxLayer(closed, 'm-eyes-closed')}
    ${pxLayer(xEyes, 'm-eyes-x')}
    ${pxLayer(happy, 'm-mouth m-happy')}
    ${pxLayer(normal, 'm-mouth m-normal')}
    ${pxLayer(sad, 'm-mouth m-sad')}
    ${pxLayer(open, 'm-mouth m-open')}
    ${pxLayer(sprout, 'acc acc-sprout')}
    ${pxLayer(shiny, 'acc acc-shiny')}
    ${pxLayer(hat, 'acc acc-traveler')}
    ${pxLayer(cups, 'acc acc-gamer')}
    ${pxLayer(messy, 'acc acc-messy')}
    ${pxLayer(brows, 'acc acc-sturdy')}
  </g>
</svg>`;
})();

const EGG_SVG = (() => {
  const palette = { ...PX, T: '#b98a52', F: '#fff6e3', Q: '#ffd59e' };
  const shape = pxEllipse(pxGrid(), 16, 18.6, 9.6, 12.4, 'F');
  const outline = pxOutline(shape, 'T');
  const fill = shape.map((row, y) => row.map((c, x) => (outline[y][x] === 'T' ? '.' : c)));
  const spots = pxGrid();
  pxEllipse(spots, 12, 14, 1.7, 1.7, 'Q');
  pxEllipse(spots, 19.5, 19.5, 2.1, 2.1, 'Q');
  pxEllipse(spots, 14, 25, 1.3, 1.3, 'Q');
  pxEllipse(spots, 20, 11, 1.1, 1.1, 'Q');
  const crack = pxGrid();
  for (let x = 7; x <= 24; x++) crack[x % 4 < 2 ? 17 : 18][x] = 'N';
  const shadow = pxEllipse(pxGrid(), 16, 31.2, 8, 1, 'H');
  return `
<svg viewBox="0 0 200 200" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg" aria-label="우왕이 알">
  ${pxLayer(shadow)}
  <g class="egg">
    ${pxLayer(fill, '', palette)}
    ${pxLayer(spots, '', palette)}
    ${pxLayer(outline, '', palette)}
    ${pxLayer(crack, 'crack', palette)}
  </g>
</svg>`;
})();

function mountMascot(el, stage) {
  el.innerHTML = `<div class="mascot-inner">${stage === 'egg' ? EGG_SVG : MASCOT_SVG}<div class="outfit"></div></div>`;
  el.dataset.stage = stage;
  el.dataset.outfitKey = '';
}

function setMascot(el, props) {
  for (const key in props) el.dataset[key] = props[key];
}

// 지금 우왕이의 어른 모습과 입은 의상을 그린다
// 기본 옷(학사모, 뿔테 안경)은 산책 전용이라 walk가 true일 때만 보여 준다
function dressMascot(el, walk = false) {
  const pet = state.pet;
  el.dataset.form = pet.stage === 'adult' ? pet.form : '';
  const worn = pet.stage === 'egg' ? [] : Object.entries(state.equipped).filter(([, id]) => id && OUTFITS[id] && (walk || !BASIC_OUTFITS[id]));   // 없어진 옷, 산책 밖의 기본 옷은 건너뛴다
  const key = worn.map(([slot, id]) => `${slot}:${id}`).join(',');
  if (el.dataset.outfitKey === key) return;
  el.dataset.outfitKey = key;
  el.dataset.head = worn.some(([slot]) => slot === 'head');
  const box = el.querySelector('.outfit');
  if (box) box.innerHTML = worn.map(([slot, id]) => `<span class="slot-${slot} o-${id}">${OUTFITS[id].art || OUTFITS[id].emoji}</span>`).join('');
}

// 잠깐 재생하는 동작 (먹기, 고개 젓기 등)
function playMascot(el, anim, ms) {
  el.dataset.anim = '';
  void el.offsetWidth; // 같은 애니메이션을 다시 재생하기 위한 리플로우
  el.dataset.anim = anim;
  return new Promise((resolve) => setTimeout(() => {
    el.dataset.anim = '';
    resolve();
  }, ms));
}
