// 탭 전환, 공통 도구, 1초마다 도는 시계.
const $ = (selector) => document.querySelector(selector);

const TABS = ['pet', 'travel', 'games', 'community'];
let currentTab = 'pet';

// ---------- 공통 ----------
let toastTimer = 0;
function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

function show(tab) {
  if (currentTab === 'games' && tab !== 'games') Games.stop();
  currentTab = tab;
  TABS.forEach((t) => { $(`#screen-${t}`).hidden = t !== tab; });
  document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  window.scrollTo(0, 0);

  if (tab === 'pet') Pet.refresh();
  if (tab === 'travel') Travel.render();
  if (tab === 'games') Games.render();
  if (tab === 'community') Community.render();
  renderTop();
}

function renderTop() {
  $('#lv').textContent = state.level;
  $('#coins').textContent = state.coins;
  $('#exp-fill').style.width = `${(state.exp / expToNext(state.level)) * 100}%`;
}

function rewardExp(amount) {
  if (addExp(amount)) {
    Sound.sfx('levelup');
    toast(`레벨 업! Lv.${state.level} 🎉`);
  }
  const grown = checkGrowth();
  if (grown) {
    saveState();
    setTimeout(() => {
      Sound.sfx('levelup');
      toast(grown);
      Pet.refresh();
    }, 1500);
  }
  renderTop();
}

// ---------- 처음부터 다시 ----------
let resetArmed = false;
$('#btn-reset').addEventListener('click', (e) => {
  const btn = e.currentTarget;
  if (!resetArmed) {
    resetArmed = true;
    btn.textContent = '정말 처음부터 할까요? 한 번 더 누르면 새 알이 와요';
    setTimeout(() => {
      resetArmed = false;
      btn.textContent = '처음부터 다시 키우기';
    }, 3000);
    return;
  }
  resetArmed = false;
  btn.textContent = '처음부터 다시 키우기';
  Sound.stopAll();
  resetState();
  Travel.reset();
  Pet.resetView();
  toast('새 알이 도착했어요! 🥚');
  show('pet');
});

// ---------- 시작 ----------
document.querySelectorAll('.tabbar button').forEach((b) => {
  b.addEventListener('click', () => show(b.dataset.tab));
});

let saveCounter = 0;
setInterval(() => {
  simulate();
  if (state.flight && Date.now() - state.flight.start >= state.flight.duration) Travel.completeFlight();
  Travel.tick();
  if (++saveCounter % 10 === 0) saveState();
}, 1000);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) saveState();
});

simulate();
Pet.init();
Travel.init();
Games.init();
Community.init();
show('pet');

// 앱을 꺼 둔 사이에 도착했으면 바로 처리한다
if (state.flight && Date.now() - state.flight.start >= state.flight.duration) Travel.completeFlight();
