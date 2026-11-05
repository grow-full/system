// 집중 모드: 화면을 보고 있는 동안만 시간이 흐르고, 누적 시간에 따라 코스튬을 준다.
// 화면 이탈 = 다른 탭으로 가기, 창 최소화, 다른 창 누르기. 앱을 닫아 둔 시간도 세지 않는다.
const Focus = (() => {
  const MAX_STEP = 2000; // 한 번에 더하는 최대 시간(ms). 절전 등으로 타이머가 늦게 불려도 몰아서 세지 않는다
  let last = Date.now();
  let pausedAt = 0;

  function isFocusFlight() {
    return !!(state.flight && state.flight.mode === 'focus');
  }

  function watching() {
    return !document.hidden && document.hasFocus();
  }

  // 1초마다 app.js가 부른다
  function tick() {
    const now = Date.now();
    const step = Math.min(MAX_STEP, Math.max(0, now - last));
    last = now;
    if (!isFocusFlight()) return;
    if (pausedAt && watching()) { // focus 이벤트를 놓쳤어도 화면으로 돌아왔으면 다시 흐른다
      resume();
      return;
    }
    if (watching()) {
      const f = state.flight;
      f.elapsed = Math.min(f.duration, (f.elapsed || 0) + step);
    } else if (!pausedAt) {
      pause();
    }
  }

  function pause() {
    if (!isFocusFlight() || pausedAt) return;
    pausedAt = Date.now();
    saveState();
    Travel.renderFocusState();
  }

  function resume() {
    last = Date.now();
    if (!pausedAt || !watching()) return;
    const away = Math.round((Date.now() - pausedAt) / 1000);
    pausedAt = 0;
    if (!isFocusFlight()) return;
    Travel.renderFocusState();
    toast(`⏸️ 화면을 벗어나서 ${durationLabel(away)} 동안 멈췄어요. 다시 집중해요!`);
  }

  function isPaused() {
    return isFocusFlight() && (!!pausedAt || !watching());
  }

  function totalHours() {
    return state.focusTotal / 3600;
  }

  // 누적 시간을 더하고, 새로 받은 코스튬 목록을 돌려준다
  function addTime(seconds) {
    const before = state.focusTotal;
    state.focusTotal = before + Math.max(0, Math.floor(seconds));
    const earned = FOCUS_COSTUMES.filter((c) => !state.outfits.includes(c.id) && state.focusTotal >= c.hours * 3600);
    earned.forEach((c) => state.outfits.push(c.id));
    return earned;
  }

  function nextCostume() {
    return FOCUS_COSTUMES.find((c) => state.focusTotal < c.hours * 3600) || null;
  }

  // 여행 탭에 보여 줄 한 줄 요약
  function summary() {
    const next = nextCostume();
    const total = `총 집중 ⏱️ ${durationLabel(state.focusTotal)}`;
    if (!next) return `${total} · 모든 코스튬을 모았어요 🎉`;
    return `${total} · 다음 코스튬 ${next.emoji} ${next.name}까지 ${durationLabel(next.hours * 3600 - state.focusTotal)}`;
  }

  function durationLabel(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h) return m ? `${h}시간 ${m}분` : `${h}시간`;
    if (m) return s && m < 10 ? `${m}분 ${s}초` : `${m}분`;
    return `${s}초`;
  }

  function init() {
    window.addEventListener('blur', pause);
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', () => (document.hidden ? pause() : resume()));
  }

  return { init, tick, isPaused, addTime, summary, totalHours, durationLabel };
})();
