// 우왕이 캐릭터와 알 (임시 SVG).
// 실제 우왕이 일러스트를 받으면 이 SVG를 교체하거나 Rive 애니메이션으로 바꾸면 된다.
// 상태는 감싸는 요소의 data-* 속성으로 CSS에서 바꾼다:
//   data-stage(egg/baby/child/adult), data-form(어른 모습), data-mood(happy/normal/sad),
//   data-sleep, data-sick, data-look(left/right), data-anim(eat/refuse/joy/tap), data-crack
// 성장 단계와 어른 모습별 장식은 acc-* 그룹으로 SVG 안에 모두 들어 있고, CSS가 골라서 보여 준다.
const MASCOT_SVG = `
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-label="우왕이">
  <ellipse cx="100" cy="188" rx="55" ry="8" fill="rgba(0,0,0,.12)"/>
  <g class="m-body">
    <g class="acc acc-gamer">
      <path d="M36 96 q0 -78 64 -78 q64 0 64 78" stroke="#4b4f8c" stroke-width="9" fill="none"/>
    </g>
    <circle class="m-skin" cx="50" cy="66" r="21" fill="#e8a54b"/>
    <circle cx="50" cy="66" r="11" fill="#f7d9a8"/>
    <circle class="m-skin" cx="150" cy="66" r="21" fill="#e8a54b"/>
    <circle cx="150" cy="66" r="11" fill="#f7d9a8"/>
    <ellipse class="m-skin" cx="100" cy="116" rx="74" ry="70" fill="#f5c16c"/>
    <ellipse cx="100" cy="140" rx="42" ry="32" fill="#fbe3b8"/>
    <g class="m-eyes">
      <g class="m-pupils">
        <ellipse cx="72" cy="104" rx="7" ry="9" fill="#3b2a1a"/>
        <ellipse cx="128" cy="104" rx="7" ry="9" fill="#3b2a1a"/>
        <circle cx="74" cy="100" r="2.5" fill="#fff"/>
        <circle cx="130" cy="100" r="2.5" fill="#fff"/>
      </g>
    </g>
    <g class="m-eyes-closed" stroke="#3b2a1a" stroke-width="4" fill="none" stroke-linecap="round">
      <path d="M64 104 q8 6 16 0"/>
      <path d="M120 104 q8 6 16 0"/>
    </g>
    <g class="m-eyes-x" stroke="#3b2a1a" stroke-width="4" stroke-linecap="round">
      <path d="M66 98 l12 12 M78 98 l-12 12"/>
      <path d="M122 98 l12 12 M134 98 l-12 12"/>
    </g>
    <ellipse cx="56" cy="126" rx="10" ry="6" fill="#f59a8b" opacity=".6"/>
    <ellipse cx="144" cy="126" rx="10" ry="6" fill="#f59a8b" opacity=".6"/>
    <ellipse cx="100" cy="124" rx="8" ry="5" fill="#7a4b2a"/>
    <g stroke="#7a4b2a" stroke-width="4" fill="none" stroke-linecap="round">
      <path class="m-mouth m-happy" d="M86 136 q14 14 28 0"/>
      <path class="m-mouth m-normal" d="M90 140 h20"/>
      <path class="m-mouth m-sad" d="M86 146 q14 -12 28 0"/>
    </g>
    <ellipse class="m-mouth m-open" cx="100" cy="142" rx="9" ry="7" fill="#7a4b2a"/>

    <!-- 어린이: 머리 위 새싹 -->
    <g class="acc acc-sprout" fill="#6cc070">
      <path d="M100 48 q-6 -20 -22 -20 q8 12 22 20 z"/>
      <path d="M100 48 q6 -18 20 -18 q-6 12 -20 18 z"/>
      <path d="M100 48 v-8" stroke="#4f9a54" stroke-width="3"/>
    </g>
    <!-- 반짝: 주변에 반짝이 -->
    <g class="acc acc-shiny" fill="#ffcf3f">
      <path d="M28 40 l4 10 l10 4 l-10 4 l-4 10 l-4 -10 l-10 -4 l10 -4 z"/>
      <path d="M170 30 l3 7 l7 3 l-7 3 l-3 7 l-3 -7 l-7 -3 l7 -3 z"/>
      <path d="M176 120 l3 7 l7 3 l-7 3 l-3 7 l-3 -7 l-7 -3 l7 -3 z"/>
    </g>
    <!-- 여행가: 탐험 모자 -->
    <g class="acc acc-traveler">
      <path d="M64 52 q2 -34 36 -34 q34 0 36 34 z" fill="#c08a4c"/>
      <rect x="66" y="42" width="68" height="9" fill="#6b4423"/>
      <ellipse cx="100" cy="52" rx="62" ry="10" fill="#a0703c"/>
    </g>
    <!-- 게이머: 헤드폰 귀 부분 -->
    <g class="acc acc-gamer" fill="#6c72d9">
      <rect x="20" y="82" width="22" height="38" rx="9"/>
      <rect x="158" y="82" width="22" height="38" rx="9"/>
    </g>
    <!-- 꾀죄죄: 헝클어진 털과 얼룩 -->
    <g class="acc acc-messy">
      <path d="M78 50 l6 -14 l6 12 l6 -14 l6 12 l6 -14 l6 14" stroke="#a87732" stroke-width="4" fill="none" stroke-linejoin="round"/>
      <ellipse cx="146" cy="150" rx="10" ry="6" fill="rgba(110,80,50,.35)"/>
      <ellipse cx="62" cy="160" rx="7" ry="4" fill="rgba(110,80,50,.35)"/>
      <ellipse cx="120" cy="76" rx="6" ry="4" fill="rgba(110,80,50,.3)"/>
    </g>
    <!-- 듬직: 진한 눈썹 -->
    <g class="acc acc-sturdy" stroke="#7a4b2a" stroke-width="5" stroke-linecap="round">
      <path d="M60 88 l22 -5"/>
      <path d="M118 83 l22 5"/>
    </g>
  </g>
</svg>`;

const EGG_SVG = `
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-label="우왕이 알">
  <ellipse cx="100" cy="188" rx="48" ry="7" fill="rgba(0,0,0,.12)"/>
  <g class="egg">
    <ellipse cx="100" cy="112" rx="58" ry="74" fill="#fff6e3" stroke="#eccb98" stroke-width="4"/>
    <circle cx="76" cy="90" r="10" fill="#ffd59e"/>
    <circle cx="124" cy="120" r="13" fill="#ffd59e"/>
    <circle cx="90" cy="150" r="8" fill="#ffd59e"/>
    <circle cx="128" cy="76" r="6" fill="#ffd59e"/>
    <path class="crack" d="M58 104 l14 10 l12 -12 l14 12 l12 -12 l14 12 l12 -10 l8 6" stroke="#b58a52" stroke-width="4" fill="none" stroke-linejoin="round"/>
  </g>
</svg>`;

function mountMascot(el, stage) {
  el.innerHTML = `<div class="mascot-inner">${stage === 'egg' ? EGG_SVG : MASCOT_SVG}<div class="outfit"></div></div>`;
  el.dataset.stage = stage;
  el.dataset.outfitKey = '';
}

function setMascot(el, props) {
  for (const key in props) el.dataset[key] = props[key];
}

// 지금 우왕이의 어른 모습과 입은 의상을 그린다
function dressMascot(el) {
  const pet = state.pet;
  el.dataset.form = pet.stage === 'adult' ? pet.form : '';
  const worn = pet.stage === 'egg' ? [] : Object.entries(state.equipped).filter(([, id]) => id);
  const key = worn.map(([slot, id]) => `${slot}:${id}`).join(',');
  if (el.dataset.outfitKey === key) return;
  el.dataset.outfitKey = key;
  el.dataset.head = worn.some(([slot]) => slot === 'head');
  const box = el.querySelector('.outfit');
  if (box) box.innerHTML = worn.map(([slot, id]) => `<span class="slot-${slot}">${OUTFITS[id].emoji}</span>`).join('');
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
