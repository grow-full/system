# 레트로 도트 + PC 가로 화면 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 우왕이 앱 전체를 크림 LCD + 버건디 도트 스타일로, 세로 휴대폰 화면을 PC용 가로 3단(왼쪽 메뉴·가운데·오른쪽 패널) 화면으로 바꾼다.

**Architecture:** 빌드 도구 없는 정적 웹앱(HTML + CSS + 바닐라 JS, 전역 스크립트). 마크업은 탭마다 `col-main`/`col-side`로 나누고 기존 `id`를 모두 유지해 JS 동작을 보존한다. 도트 그림은 글자 지도 → `<rect>` SVG로 만드는 공용 함수 하나(`pixelSvg`)로 우왕이·알·아이콘을 모두 그린다.

**Tech Stack:** HTML, CSS(Grid, CSS 변수, `steps()`), 바닐라 JS, Galmuri11 웹폰트(jsDelivr `galmuri@2.40.3`).

**Spec:** `docs/superpowers/specs/2026-11-07-retro-pixel-landscape-design.md`

## Global Constraints

- 앱 폴더: `system/` (이하 경로는 모두 이 폴더 기준). 저장 키 `wooang-travel-v2`와 `state` 구조는 바꾸지 않는다.
- 모든 기존 요소의 `id`, `data-*` 속성, 탭 버튼의 `class="tabbar"` 컨테이너와 `data-tab`은 유지한다.
- 색 변수: `--page #5e1028`, `--lcd #f4ead6`, `--lcd-dark #e8dabf`, `--ink #4a0d22`, `--primary #8c1d40`, `--primary-dark #5e1028`, `--sub #8a6a72`, `--tint #f2d9df`, 포인트 `#f4a7b9`, `#9fd3e8`.
- 글씨: `https://cdn.jsdelivr.net/npm/galmuri@2.40.3/dist/galmuri.css`, `font-family: "Galmuri11", system-ui, sans-serif`. 글씨 크기는 12·16·24px만. 주아·고운돋움 링크는 지운다.
- `border-radius` 0. 상자 테두리 2px 계단 모양, 그림자 3px 끊김, 버튼 누르면 3px 내려감.
- 가로 틀: 900px 이상에서 `200px | 1fr | 340px`, 높이 `100vh`, 가운데·오른쪽은 각자 스크롤, 최대 폭 1400px 가운데 정렬. 900px 미만에서 위아래로 쌓기.
- 우왕이·알: 32×32칸, `viewBox="0 0 200 200"`, 한 칸 6.25, `shape-rendering="crispEdges"`. 기존 클래스 이름 전부 유지.
- 아이콘: 16×16칸.
- 여행지·의상 이모지, 특산품 받기 캔버스 그림은 바꾸지 않는다.
- 커밋은 사용자가 요청할 때만 한다 (사용자 지시가 이 계획의 "Commit" 단계보다 우선).

## 확인 도구 (모든 Task 공통)

자동 테스트 프레임워크가 없으므로, 화면 없는 Edge로 확인한다. `$S`는 스크래치패드 폴더다.

- **오류 확인:** `msedge --headless=new --enable-logging=stderr --v=0 --user-data-dir=$S\p --virtual-time-budget=3000 --dump-dom file:///C:/Users/yooch/system/system/index.html#<tab>` → stderr에 `Uncaught`가 없어야 한다.
- **스크린샷:** `msedge --headless=new --hide-scrollbars --window-size=1280,800 --virtual-time-budget=3000 --screenshot=$S\<name>.png <url>`. 좁은 창은 `--window-size=800,900`. 알에서 깬 모습은 `--virtual-time-budget=36000`.

## Review Focus

1. **인터넷이 없어 글씨를 못 불러올 때** → 기본 글씨로 보이고 버튼 글자가 넘치거나 잘리지 않아야 한다. (Task 1에서 글씨 링크를 빼고 찍은 스크린샷으로 확인)
2. **창 높이가 낮을 때(1280×650)** → 오른쪽 패널의 돌보기 버튼이 잘리지 않고 패널 안에서 스크롤돼야 한다. (Task 2)
3. **말 걸기·놀아주기 판이 열렸을 때** → 오른쪽 패널에서 버튼 자리를 대신하고, 가운데 방 크기는 그대로여야 한다. (Task 3)
4. **어른 모습 5가지 + 옷 입힘 + 아픔/잠/꼬질꼬질** → 도트 우왕이에서도 장식·얼룩·의상이 제자리에 보여야 한다. (Task 4에서 `data-*`를 바꿔 가며 찍기)
5. **비행 중 다른 탭에서 돌아올 때 / 게임 중 목록에서 다른 게임을 누를 때** → 여행 오른쪽 패널은 늘 보이고, 게임은 실행 중인 게임을 멈추고 새 게임을 연다. (Task 5, 6)

---

### Task 1: 공통 도트 스타일 (색·글씨·상자·버튼)

**Files:**
- Modify: `index.html` (head의 글씨 링크)
- Modify: `css/style.css` (`:root`, `body`, 입력칸, `.card`, `.primary`, `.ghost`, `button` 공통, 모든 `border-radius`)

**Interfaces:**
- Produces: CSS 변수 `--page --lcd --lcd-dark --ink --primary --primary-dark --sub --tint --line(=--ink)`, 공용 클래스 `.px-box`(계단 테두리 상자), `.px-btn`(눌리는 버튼) — 이후 Task가 새 요소에 붙여 쓴다. 기존 `.card`, `.primary`, `.actions button` 등은 같은 규칙을 직접 받는다.

- [ ] **Step 1:** 글씨 링크를 Galmuri로 교체, `body`에 `font-family: "Galmuri11", system-ui, sans-serif; -webkit-font-smoothing: none; font-smooth: never;`. 주아용 규칙(`h1, h2, h3, b, strong, button, .speech ...`)은 지운다.
- [ ] **Step 2:** `:root` 색 변수를 Global Constraints 값으로 바꾸고, 앱 배경에 LCD 격자(`repeating-linear-gradient` 두 방향, 1px, 3px 간격, `rgba(74,13,34,.05)`)를 깐다.
- [ ] **Step 3:** 모든 `border-radius`를 0으로(원형이 필요한 그림 요소 제외), `.card`와 버튼류를 계단 테두리 + 3px 끊긴 그림자로, `:active`에서 `transform: translate(3px,3px)` + 그림자 제거.
- [ ] **Step 4: 확인** — 오류 확인 + 1280×800 스크린샷 1장, 글씨 링크를 잠시 뺀 스크린샷 1장(Review Focus 1). 기대: 크림 바탕·버건디 각진 상자·도트 글씨, 글자 넘침 없음.

### Task 2: 왼쪽 메뉴와 가로 3단 틀

**Files:**
- Modify: `index.html` (`header.topbar` + `nav.tabbar` → `aside.sidebar` 하나로, 각 `section.screen` 안을 `div.col-main` + `aside.col-side`로 나눔 — 실제 요소 이동은 Task 3·5·6·7에서, 여기서는 빈 `col-side`만 만들고 기존 내용은 `col-main`에 넣는다)
- Modify: `css/style.css` (`#app` 그리드, `.sidebar`, `.screen` 그리드, `@media (max-width: 899px)`)
- Modify: `js/app.js` (첫 탭을 주소 해시로)

**Interfaces:**
- Produces: 레이아웃 클래스 `.sidebar`, `.screen`(`display:grid; grid-template-columns: 1fr 340px`), `.col-main`, `.col-side`. 해시 `#pet|#travel|#games|#community`로 첫 탭 선택.

- [ ] **Step 1:** `.sidebar` 순서: Lv·경험치 → `nav.tabbar`(세로, 아이콘+글자) → 아래쪽에 코인·알림 버튼. 선택된 탭은 `--primary` 바탕 + 흰 글씨 + `▶` 표시.
- [ ] **Step 2:** `app.js` 마지막 `show('pet')`을 `show(['pet','travel','games','community'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'pet')`로.
- [ ] **Step 3:** 900px 미만 미디어쿼리: `#app`은 한 줄, `.sidebar`는 위쪽 가로 막대(sticky), `.screen`은 한 줄로 쌓임.
- [ ] **Step 4: 확인** — 4개 해시 각각 1280×800 스크린샷, 800×900 1장, 1280×650 1장(Review Focus 2). 기대: 왼쪽 메뉴 고정, 선택 탭 표시가 해시와 일치, 낮은 창에서 패널만 스크롤.

### Task 3: 우왕이 탭 배치 + 도트 아이콘

**Files:**
- Create: `js/pixel-icons.js` (`index.html`에서 `mascot.js` 앞에 로드)
- Modify: `index.html` (우왕이 탭: `status-card`, `#pet-actions`, `.room-hint`, `#talk-panel`, `#play-panel`을 `col-side`로; 버튼 이모지 `<span>`을 `<span class="ico" data-icon="meal">` 등으로)
- Modify: `js/pet.js` (`hearts()`, 똥, 음식·약·비눗방울·물방울·반짝이 효과를 아이콘으로)
- Modify: `css/style.css` (`.room` 높이 420px, 옷장·도감 2칸, `.ico` 크기)

**Interfaces:**
- Produces:
  - `pixelSvg(rows: string[], palette: Record<string,string>, opts?: { size?: number, cls?: Record<string,string> }) -> string` — `rows`는 같은 길이의 문자열 배열, 글자 하나가 한 칸, `.`은 빈칸. `palette`의 글자 → 색. `opts.cls`의 글자 → 그 칸들을 `<g class="...">`로 묶음(색은 `fill` 속성으로 그룹에). `viewBox`는 `0 0 200 200`(32칸) 또는 `0 0 16 16`(아이콘)로 `size`에서 정함. 연속된 같은 글자는 가로로 합쳐 `<rect>` 수를 줄인다.
  - `PIXEL_ICONS: Record<string, string[]>` 키: `meal snack play clean bath medicine lights talk poop food pill bubble drop sparkle fly sick zzz heart heartEmpty coin bellOn bellOff tabPet tabTravel tabGames tabCommunity`.
  - `icon(name: string, size = 24) -> string` — 16×16 아이콘 SVG 문자열(`class="ico"`).
  - `hydrateIcons(root: ParentNode = document)` — `[data-icon]` 요소 안을 `icon(...)`으로 채움. `app.js` 시작 때 한 번 호출.
- [ ] **Step 1:** `pixelSvg`, `icon`, `hydrateIcons` 작성 + 아이콘 지도 26개.
- [ ] **Step 2:** 우왕이 탭 요소를 `col-side`로 옮기고 버튼·하트·코인·알림·탭 아이콘을 `data-icon`으로 교체. `notify.js`가 알림 버튼 글자(🔕/🔔)를 바꾸는 부분은 `icon('bellOn'|'bellOff')`로.
- [ ] **Step 3:** `pet.js`의 효과 요소에 이모지 대신 `icon(...)`을 넣는다(`textContent` → `innerHTML`). 파리(`.fly`)도 아이콘.
- [ ] **Step 4: 확인** — 1280×800 스크린샷(알), 36초 뒤 스크린샷(아기), 오류 확인. 말 걸기 판이 열린 상태는 `pet.js`를 고치지 않고 확인할 수 없으므로 사용자 손 확인 목록에 올린다(Review Focus 3).

### Task 4: 우왕이·알 도트 그림

**Files:**
- Modify: `js/mascot.js` (`MASCOT_SVG`, `EGG_SVG`를 `pixelSvg` 지도로)
- Modify: `js/pet.js` (`gazeAt`: `--gx`/`--gy`를 ±6.25 단위로 반올림)
- Modify: `css/style.css` (`.m-skin` 색 규칙이 그룹 `fill`에 맞게, 눈 깜빡임·걷기·점프 없는 움직임을 `steps()`로)

**Interfaces:**
- Consumes: `pixelSvg` (Task 3)
- Produces: 같은 이름의 `MASCOT_SVG`, `EGG_SVG` 문자열과 같은 클래스 구조(스펙 5.1 목록).

- [ ] **Step 1:** 32×32 지도 작성 — 몸통·귀(`m-skin` 그룹), 배, 눈(`m-pupils` 안에 검은 눈동자 2×3칸 + 흰 반짝임 1칸), 감은 눈, X 눈, 볼, 코, 입 4종, 장식 6종(새싹, 반짝이, 탐험 모자, 헤드폰, 헝클어진 털+얼룩, 눈썹), 그림자. 알: 32×32 알 + 점 4개 + `crack` 그룹.
- [ ] **Step 2:** `gazeAt`에서 `Math.round(dx/len) * 6.25`, `Math.round(dy/len) * 6.25`.
- [ ] **Step 3: 확인** — 어른 모습 5종 × (보통/아픔/잠/꼬질꼬질) 스크린샷. `localStorage`를 미리 넣을 수 없으므로 임시 확인용 HTML(`$S\mascot-check.html`, 앱 폴더에 두지 않음)에서 `mountMascot`/`setMascot`/`dressMascot`을 불러 한 장에 그려 찍는다(Review Focus 4).

### Task 5: 여행 탭

**Files:**
- Modify: `index.html` (`h3 내 여권`, `#stamps`, `#souvenir-title`, `#souvenirs`를 `#travel-plan` 밖 `col-side`로; 나머지 4단계 화면은 `col-main`)
- Modify: `css/style.css` (탑승권·창밖·카운트다운·스탬프 도트화, `.window` 둥근 창 → 각진 창)

**Interfaces:**
- Consumes: Task 1·2 공통 클래스. `travel.js`는 그대로(같은 `id`).

- [ ] **Step 1:** 마크업 이동 + 도트 스타일.
- [ ] **Step 2: 확인** — `#travel` 스크린샷, 오류 확인. 비행 중 화면은 사용자 손 확인(1분 비행)(Review Focus 5).

### Task 6: 게임 탭

**Files:**
- Modify: `index.html` (`#games-hub`를 `col-side`로, `col-main`에 `#game-empty` 안내 "오른쪽에서 게임을 골라 주세요" + `#game-view`, `#game-result`)
- Modify: `js/games.js` (`render`/`open`/`stop`에서 `#games-hub`를 숨기지 않음, `#game-empty.hidden = Boolean(current)`, 고른 게임 카드에 `.on`; `render()`의 `if (current) return;`을 지우고 목록은 늘 다시 그림)
- Modify: `css/style.css` (게임 카드·HUD·짝 맞추기 카드·퀴즈 버튼 도트화)
- Modify: `js/minigame.js:154` (`ctx.font = '16px Galmuri11, sans-serif'`)

- [ ] **Step 1:** 마크업·JS·CSS 수정. 게임 중 다른 카드를 누르면 `open()`이 `stopRunning()`부터 부르는지 확인(이미 그럼).
- [ ] **Step 2: 확인** — `#games` 스크린샷, 오류 확인.

### Task 7: 커뮤니티 탭

**Files:**
- Modify: `index.html` (`#community-mode`, `.community-bar`, `#btn-write`, `#write-form`을 `col-side`로, `#post-list`는 `col-main`)
- Modify: `css/style.css` (글 카드·태그·좋아요·정렬 버튼 도트화)

- [ ] **Step 1:** 마크업 이동 + 도트 스타일.
- [ ] **Step 2: 확인** — `#community` 스크린샷, 오류 확인.

### Task 8: 마무리

**Files:**
- Modify: `README.md` (화면 설명: 가로 3단·도트, 폴더 구조에 `js/pixel-icons.js`, "우왕이 그림은 임시" 문단을 도트 지도 교체 방법으로)

- [ ] **Step 1:** README 수정.
- [ ] **Step 2: 전체 확인** — 4개 탭 × (1280×800, 800×900) 스크린샷 8장 + 오류 확인. 남은 둥근 모서리·주황색이 없는지 `grep -n "border-radius: [1-9]\|#ff8a3d\|Jua\|Gowun" css/style.css index.html`로 확인(결과 없음이 기대값, 원형 그림 요소 예외는 주석으로 표시).
- [ ] **Step 3:** 사용자에게 손 확인 목록 전달: 돌보기 8개, 말 걸기 판, 걷기·쳐다보기, 여행 1분, 게임 3종, 글쓰기.
