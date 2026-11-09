// 우왕이 친구들 그림 (임시 SVG).
// 충북대 캐릭터 소개를 참고해 단순하게 그린 것이에요. 공식 일러스트를 쓸 수 있게 되면
// maps-config.js의 WALK_FRIENDS에서 image: 'images/좌왕이.png'처럼 그림 파일을 지정하면 이 그림 대신 나와요.
const OUTLINE = '#5a3a1e';

const FRIEND_ART = {
  // 좌왕이: 밤송이처럼 위가 뾰족한 주황 얼굴, 작은 귀
  jwawang: `
<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
  <path d="M30 44 l-6 -18 l18 10z M90 44 l6 -18 l-18 10z" fill="#fff4e0" stroke="${OUTLINE}" stroke-width="3" stroke-linejoin="round"/>
  <path d="M60 12 C70 30 102 40 102 72 C102 100 84 110 60 110 C36 110 18 100 18 72 C18 40 50 30 60 12Z" fill="#f9b160" stroke="${OUTLINE}" stroke-width="3.5" stroke-linejoin="round"/>
  <path d="M22 86 C34 98 86 98 98 86 C96 100 82 108 60 108 C38 108 24 100 22 86Z" fill="#ffe0a8"/>
  <circle cx="34" cy="76" r="7" fill="#f78f8f"/><circle cx="86" cy="76" r="7" fill="#f78f8f"/>
  <circle cx="49" cy="70" r="4" fill="${OUTLINE}"/><circle cx="71" cy="70" r="4" fill="${OUTLINE}"/>
  <path d="M52 80 q4 4 8 0 q4 4 8 0" stroke="${OUTLINE}" stroke-width="3" fill="none" stroke-linecap="round"/>
</svg>`,

  // 스테디: 동글동글 갈색 곰, 동그란 안경
  steady: `
<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
  <circle cx="26" cy="30" r="15" fill="#a87447" stroke="${OUTLINE}" stroke-width="3.5"/>
  <circle cx="94" cy="30" r="15" fill="#a87447" stroke="${OUTLINE}" stroke-width="3.5"/>
  <circle cx="26" cy="30" r="7" fill="#5a3a1e"/><circle cx="94" cy="30" r="7" fill="#5a3a1e"/>
  <ellipse cx="60" cy="68" rx="48" ry="42" fill="#a87447" stroke="${OUTLINE}" stroke-width="3.5"/>
  <ellipse cx="60" cy="88" rx="17" ry="14" fill="#fff"/>
  <circle cx="47" cy="66" r="9" fill="#fff" stroke="${OUTLINE}" stroke-width="2.5"/>
  <circle cx="73" cy="66" r="9" fill="#fff" stroke="${OUTLINE}" stroke-width="2.5"/>
  <path d="M56 66 h8" stroke="${OUTLINE}" stroke-width="2.5"/>
  <circle cx="47" cy="66" r="3.5" fill="${OUTLINE}"/><circle cx="73" cy="66" r="3.5" fill="${OUTLINE}"/>
  <ellipse cx="60" cy="82" rx="5" ry="4" fill="${OUTLINE}"/>
  <path d="M55 90 q5 5 10 0" stroke="${OUTLINE}" stroke-width="2.5" fill="none" stroke-linecap="round"/>
</svg>`,

  // 타나: 귀여운 주황 호랑이, 볼과 이마의 줄무늬
  tana: `
<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
  <circle cx="30" cy="34" r="12" fill="#f4a24c" stroke="${OUTLINE}" stroke-width="3.5"/>
  <circle cx="90" cy="34" r="12" fill="#f4a24c" stroke="${OUTLINE}" stroke-width="3.5"/>
  <circle cx="30" cy="34" r="5" fill="#fff4e0"/><circle cx="90" cy="34" r="5" fill="#fff4e0"/>
  <ellipse cx="60" cy="70" rx="52" ry="40" fill="#f4a24c" stroke="${OUTLINE}" stroke-width="3.5"/>
  <path d="M54 32 l6 10 l6 -10" stroke="${OUTLINE}" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M12 64 h14 M12 74 h12 M108 64 h-14 M108 74 h-12" stroke="${OUTLINE}" stroke-width="3.5" stroke-linecap="round"/>
  <ellipse cx="60" cy="86" rx="16" ry="12" fill="#fff"/>
  <path d="M44 62 q5 -5 10 0 M66 62 q5 -5 10 0" stroke="${OUTLINE}" stroke-width="3" fill="none" stroke-linecap="round"/>
  <path d="M55 80 l5 4 l5 -4z" fill="${OUTLINE}" stroke="${OUTLINE}" stroke-width="2" stroke-linejoin="round"/>
  <path d="M54 89 q6 5 12 0" stroke="${OUTLINE}" stroke-width="2.5" fill="none" stroke-linecap="round"/>
</svg>`,

  // 느루: 몽글몽글 풍성한 초록 머리의 느티나무 아이
  neuru: `
<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
  <g fill="#4f8f3a" stroke="${OUTLINE}" stroke-width="3.5">
    <circle cx="60" cy="24" r="20"/><circle cx="32" cy="34" r="18"/><circle cx="88" cy="34" r="18"/>
    <circle cx="18" cy="62" r="17"/><circle cx="102" cy="62" r="17"/>
    <circle cx="24" cy="90" r="16"/><circle cx="96" cy="90" r="16"/>
  </g>
  <circle cx="60" cy="60" r="44" fill="#4f8f3a"/>
  <ellipse cx="60" cy="74" rx="30" ry="27" fill="#f7d3a6" stroke="${OUTLINE}" stroke-width="3.5"/>
  <circle cx="44" cy="80" r="6" fill="#f78f8f"/><circle cx="76" cy="80" r="6" fill="#f78f8f"/>
  <path d="M46 70 q4 -4 8 0 M66 70 q4 -4 8 0" stroke="${OUTLINE}" stroke-width="3" fill="none" stroke-linecap="round"/>
  <path d="M54 84 q6 6 12 0" stroke="${OUTLINE}" stroke-width="3" fill="none" stroke-linecap="round"/>
</svg>`,

  // 은송이: 노란 머리에 하얀 미선나무 꽃을 단 꽃송이 요정
  eunsong: `
<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
  <path d="M18 70 C14 34 40 18 62 20 C88 22 106 42 102 74 L100 96 C96 104 86 104 84 96 L84 70 L36 70 L36 96 C34 104 22 104 20 96Z" fill="#ffd24d" stroke="${OUTLINE}" stroke-width="3.5" stroke-linejoin="round"/>
  <ellipse cx="60" cy="74" rx="34" ry="32" fill="#f7c99a" stroke="${OUTLINE}" stroke-width="3.5"/>
  <path d="M28 60 C34 40 56 34 80 44 C70 50 46 54 28 60Z" fill="#ffd24d" stroke="${OUTLINE}" stroke-width="3" stroke-linejoin="round"/>
  <g transform="translate(88 30)" fill="#fffdf6" stroke="${OUTLINE}" stroke-width="2.5" stroke-linejoin="round">
    <path d="M0 0 C-4 -16 8 -22 10 -8Z"/><path d="M0 0 C12 -10 22 0 10 6Z"/><path d="M0 0 C10 10 2 22 -6 12Z"/>
    <path d="M0 0 C-12 10 -20 0 -10 -6Z"/><circle r="3.5" fill="#ffd24d"/>
  </g>
  <circle cx="42" cy="84" r="7" fill="#f78f8f"/><circle cx="78" cy="84" r="7" fill="#f78f8f"/>
  <circle cx="48" cy="74" r="4" fill="${OUTLINE}"/><circle cx="72" cy="74" r="4" fill="${OUTLINE}"/>
  <path d="M53 86 q7 7 14 0" stroke="${OUTLINE}" stroke-width="3" fill="none" stroke-linecap="round"/>
</svg>`,
};
