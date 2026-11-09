// 도트(픽셀) 그림 도구와 16×16 아이콘 모음.
// 그림은 글자 지도로 적는다: 한 글자가 한 칸, '.'은 빈칸, 나머지 글자는 PX 팔레트의 색.
// 같은 색이 가로로 이어지면 <rect> 하나로 합쳐서 그린다.

const PX = {
  K: '#4a0d22', // 테두리·글씨 (진한 버건디)
  M: '#8c1d40', // 버건디
  W: '#ffffff',
  R: '#e0475f', // 빨강 (하트, 약)
  P: '#f4a7b9', // 연분홍
  B: '#9fd3e8', // 하늘
  Y: '#f5c84c', // 노랑
  O: '#e8a54b', // 주황 (우왕이 귀)
  S: '#f5c16c', // 우왕이 몸
  E: '#fbe3b8', // 우왕이 배·귀 안쪽
  C: '#f59a8b', // 볼
  N: '#8a5a2b', // 갈색
  G: '#6cc070', // 초록
  V: '#5b5fb0', // 남색 (헤드폰)
  D: '#b8a9ad', // 회색
  L: '#e8dabf', // LCD 어두운 칸
  H: 'rgba(74,13,34,.18)', // 그림자·얼룩
};

// 글자 지도를 <rect> 묶음으로. scale: 한 칸 크기, (x0, y0): 시작 칸
// palette에서 null인 글자는 fill 없이 그려서 감싸는 <g>의 색을 따른다 (우왕이 몸 색 바꾸기용)
function pixelRects(rows, palette = PX, scale = 1, x0 = 0, y0 = 0) {
  const byColor = new Map();
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      let end = x + 1;
      while (end < row.length && row[end] === ch) end++;
      if (ch !== '.' && ch !== ' ' && ch in palette) {
        const color = palette[ch];
        if (!byColor.has(color)) byColor.set(color, []);
        byColor.get(color).push(`<rect x="${(x0 + x) * scale}" y="${(y0 + y) * scale}" width="${(end - x) * scale}" height="${scale}"/>`);
      }
      x = end;
    }
  });
  return [...byColor].map(([color, rects]) => (color ? `<g fill="${color}">${rects.join('')}</g>` : rects.join(''))).join('');
}

// 글자 지도 하나를 SVG 한 장으로
function pixelSvg(rows, palette = PX, cls = '') {
  const w = Math.max(...rows.map((r) => r.length));
  const h = rows.length;
  return `<svg class="${cls}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${pixelRects(rows, palette)}</svg>`;
}

const PIXEL_ICONS = {
  meal: [
    '................',
    '.......KK.......',
    '......KWWK......',
    '.....KWWWWK.....',
    '....KWWWWWWK....',
    '....KWWWWWWK....',
    '...KWWWWWWWWK...',
    '...KWWWWWWWWK...',
    '..KWWWWWWWWWWK..',
    '..KWWKKKKKKWWK..',
    '..KWKKKKKKKKWK..',
    '..KWKKKKKKKKWK..',
    '...KKKKKKKKKK...',
  ],
  snack: [
    '................',
    '.......RR.......',
    '......RRRR......',
    '.......KK.......',
    '....KKKKKKKK....',
    '...KPPPPPPPPK...',
    '...KWWWWWWWWK...',
    '...KPPPPPPPPK...',
    '...KYYYYYYYYK...',
    '...KWWWWWWWWK...',
    '...KYYYYYYYYK...',
    '...KKKKKKKKKK...',
  ],
  play: [
    '.....KKKKKK.....',
    '...KKYYYYYYKK...',
    '..KYYYYYYYYYYK..',
    '..KYWWYYYYYYYK..',
    '.KYYWYYYYYYYYYK.',
    '.KWWWWWWWWWWWWK.',
    '.KYYYYYYYYYYYYK.',
    '.KYYYYYYYYYYYYK.',
    '.KWWWWWWWWWWWWK.',
    '.KYYYYYYYYYYYYK.',
    '..KYYYYYYYYYYK..',
    '..KYYYYYYYYYYK..',
    '...KKYYYYYYKK...',
    '.....KKKKKK.....',
  ],
  clean: [
    '...........KK...',
    '..........KNK...',
    '.........KNK....',
    '........KNK.....',
    '.......KNK......',
    '......KNK.......',
    '.....KKKK.......',
    '....KYYYYK......',
    '...KYYYYYYK.....',
    '..KYKYKYKYYK....',
    '..KYKYKYKYK.....',
    '...KKKKKKK......',
  ],
  bath: [
    '.......BB..B....',
    '......B..BB.B...',
    '...KK..BB.......',
    '..K..K..........',
    '..K.............',
    '.KKKKKKKKKKKKKK.',
    '.KWWWBBWWWBBWWK.',
    '.KWWWWWWWWWWWWK.',
    '..KWWWWWWWWWWK..',
    '..KWWWWWWWWWWK..',
    '...KKKKKKKKKK...',
    '...K........K...',
  ],
  medicine: [
    '................',
    '...KKKKKKKKKK...',
    '..KRRRRRKWWWWK..',
    '.KRRWRRRKWWWWWK.',
    '.KRRRRRRKWWWWWK.',
    '.KRRRRRRKWWWWWK.',
    '..KRRRRRKWWWWK..',
    '...KKKKKKKKKK...',
  ],
  lights: [
    '.....KKKKKK.....',
    '....KYYYYYYK....',
    '...KYYWYYYYYK...',
    '...KYWYYYYYYK...',
    '...KYYYYYYYYK...',
    '...KYYYYYYYYK...',
    '....KYYYYYYK....',
    '.....KYYYYK.....',
    '.....KKKKKK.....',
    '.....KDDDDK.....',
    '.....KKKKKK.....',
    '.....KDDDDK.....',
    '......KKKK......',
  ],
  talk: [
    '..KKKKKKKKKKKK..',
    '.KWWWWWWWWWWWWK.',
    '.KWWWWWWWWWWWWK.',
    '.KWWKWWKWWKWWWK.',
    '.KWWWWWWWWWWWWK.',
    '.KWWWWWWWWWWWWK.',
    '..KKKKWWKKKKKK..',
    '.....KWK........',
    '.....KK.........',
  ],
  poop: [
    '.......KK.......',
    '......KNNK......',
    '.....KNNNNK.....',
    '....KKNNNNKK....',
    '...KNNNNNNNNK...',
    '..KNNWKNNWKNNK..',
    '..KNNNNNNNNNNK..',
    '.KKNNNKKKKNNNKK.',
    'KNNNNNNNNNNNNNNK',
    'KNNNNNNNNNNNNNNK',
    '.KKKKKKKKKKKKKK.',
  ],
  bubble: [
    '....KKKKKKK.....',
    '...KBBBBBBBK....',
    '..KBWWBBBBBBK...',
    '..KBWBBBBBBBK...',
    '..KBBBBBBBBBK...',
    '..KBBBBBBBBBK...',
    '..KBBBBBBBBBK...',
    '...KBBBBBBBK....',
    '....KKKKKKK.....',
  ],
  drop: [
    '.......K........',
    '......KBK.......',
    '......KBK.......',
    '.....KBBBK......',
    '....KBBBBBK.....',
    '....KBWBBBK.....',
    '....KBWBBBK.....',
    '.....KBBBK......',
    '......KKK.......',
  ],
  sparkle: [
    '.......K........',
    '.......Y........',
    '......YYY.......',
    '..K..YYWYY..K...',
    '.KYYYYWWWYYYYK..',
    '..K..YYWYY..K...',
    '......YYY.......',
    '.......Y........',
    '.......K........',
  ],
  fly: [
    '....BB..BB......',
    '...BWWBBWWB.....',
    '....BB..BB......',
    '.....KKKK.......',
    '....KKKKKK......',
    '...KRKKKKRK.....',
    '....KKKKKK......',
    '.....KKKK.......',
  ],
  sick: [
    '.........KK.....',
    '........KWWK....',
    '.......KWWK.....',
    '......KWWK......',
    '.....KWWK.......',
    '....KRWK........',
    '...KRRK.........',
    '..KRRRK.........',
    '..KRRK..........',
    '...KK...........',
  ],
  zzz: [
    '.........KKKKK..',
    '...........K....',
    '..........K.....',
    '.........KKKKK..',
    '................',
    '..KKKKKK........',
    '......K.........',
    '.....K..........',
    '....K...........',
    '...K............',
    '..KKKKKK........',
  ],
  heart: [
    '...KKK....KKK...',
    '..KRRRK..KRRRK..',
    '.KRWRRRKKRRRRRK.',
    '.KRWRRRRRRRRRRK.',
    '.KRRRRRRRRRRRRK.',
    '..KRRRRRRRRRRK..',
    '...KRRRRRRRRK...',
    '....KRRRRRRK....',
    '.....KRRRRK.....',
    '......KRRK......',
    '.......KK.......',
  ],
  heartEmpty: [
    '...KKK....KKK...',
    '..KLLLK..KLLLK..',
    '.KLLLLLKKLLLLLK.',
    '.KLLLLLLLLLLLLK.',
    '.KLLLLLLLLLLLLK.',
    '..KLLLLLLLLLLK..',
    '...KLLLLLLLLK...',
    '....KLLLLLLK....',
    '.....KLLLLK.....',
    '......KLLK......',
    '.......KK.......',
  ],
  coin: [
    '.....KKKKKK.....',
    '...KKYYYYYYKK...',
    '..KYYYYYYYYYYK..',
    '..KYYWYYYYYYYK..',
    '.KYYWYYKKYYYYYK.',
    '.KYYYYKYYKYYYYK.',
    '.KYYYYKYYYYYYYK.',
    '.KYYYYKYYKYYYYK.',
    '.KYYYYYKKYYYYYK.',
    '..KYYYYYYYYYYK..',
    '..KYYYYYYYYYYK..',
    '...KKYYYYYYKK...',
    '.....KKKKKK.....',
  ],
  bellOn: [
    '.......KK.......',
    '......KYYK......',
    '.....KYYYYK.....',
    '....KYWYYYYK....',
    '....KYWYYYYK....',
    '....KYYYYYYK....',
    '...KYYYYYYYYK...',
    '..KYYYYYYYYYYK..',
    '..KKKKKKKKKKKK..',
    '......KYYK......',
    '.......KK.......',
  ],
  bellOff: [
    '.......KK.....K.',
    '......KDDK...K..',
    '.....KDDDDK.K...',
    '....KDWDDDDK....',
    '....KDWDDDKK....',
    '....KDDDDKDK....',
    '...KDDDDKDDDK...',
    '..KDDDDKDDDDDK..',
    '..KKKKKKKKKKKK..',
    '....K.KDDK......',
    '...K...KK.......',
  ],
  tabPet: [
    '..KKK......KKK..',
    '.KOOOK....KOOOK.',
    '.KOEOKKKKKKOEOK.',
    '..KKSSSSSSSSKK..',
    '..KSSSSSSSSSSK..',
    '.KSSKKSSSSKKSSK.',
    '.KSSKKSSSSKKSSK.',
    '.KSSSSSSSSSSSSK.',
    '.KSCSSSNNSSSCSK.',
    '.KSSSSKSSKSSSSK.',
    '..KSSSSKKSSSSK..',
    '...KKKKKKKKKK...',
  ],
  tabTravel: [
    '.......KK.......',
    '......KWWK......',
    '......KWWK......',
    '..KKKKKWWKKKKK..',
    '.KWWWWWWWWWWWWK.',
    '..KKKKKWWKKKKK..',
    '......KWWK......',
    '......KWWK......',
    '.....KKWWKK.....',
    '....KWWWWWWK....',
    '.....KKKKKK.....',
  ],
  tabGames: [
    '..KKKKKKKKKKKK..',
    '.KWWWWWWWWWWWWK.',
    'KWWKWWWWWWWRWWWK',
    'KWKKKWWWWWRWRWWK',
    'KWWKWWWWWWWRWWWK',
    'KWWWWWKKKKWWWWWK',
    '.KWWWKK..KKWWWK.',
    '..KKK......KKK..',
  ],
};
PIXEL_ICONS.tabWalk = [ // 발바닥
  '...KK......KK...',
  '..KPPK....KPPK..',
  '..KPPK....KPPK..',
  'KK.KK..KK..KK.KK',
  'KPK...KPPK...KPK',
  'KPK...KPPK...KPK',
  '.K.....KK.....K.',
  '.....KKKKKK.....',
  '....KPPPPPPK....',
  '...KPPPPPPPPK...',
  '...KPPPPPPPPK...',
  '....KPPKKPPK....',
  '.....KK..KK.....',
];
PIXEL_ICONS.tabCommunity = PIXEL_ICONS.talk;
PIXEL_ICONS.food = PIXEL_ICONS.meal;
PIXEL_ICONS.pill = PIXEL_ICONS.medicine;

// 아이콘 이름 → 16칸 정사각형 SVG. 지도가 16칸보다 작으면 가운데에 놓는다.
function icon(name, size = 24) {
  const rows = PIXEL_ICONS[name];
  if (!rows) return '';
  const top = Math.floor((16 - rows.length) / 2);
  const padded = [...Array(top).fill(''), ...rows];
  return `<svg class="ico-svg" width="${size}" height="${size}" viewBox="0 0 16 16" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${pixelRects(padded)}</svg>`;
}

// data-icon="이름"이 붙은 요소 안을 아이콘으로 채운다. data-size로 크기 지정 (기본 24)
function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    el.innerHTML = icon(el.dataset.icon, Number(el.dataset.size) || 24);
  });
}
