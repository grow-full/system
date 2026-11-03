// 돌봄 알림: 우왕이에게 새로 필요한 것(약, 똥 치우기, 밥…)이 생기면 알려 준다.
// 상단 🔔 버튼으로 켜고 끈다. 앱(브라우저 탭)이 열려 있을 때만 동작한다.
const Notify = (() => {
  let lastNeeds = null; // 직전에 확인한 요구. 처음 확인할 때는 알리지 않고 기준으로만 삼는다

  // 브라우저 알림은 https(또는 이 PC의 파일·localhost)에서만 쓸 수 있다
  function supported() {
    return 'Notification' in window && window.isSecureContext;
  }

  function render() {
    const btn = $('#btn-notify');
    btn.textContent = state.notifyOn ? '🔔' : '🔕';
    btn.classList.toggle('on', state.notifyOn);
    btn.setAttribute('aria-pressed', String(state.notifyOn));
    btn.title = state.notifyOn ? '돌봄 알림 켜짐 (누르면 꺼요)' : '돌봄 알림 꺼짐 (누르면 켜요)';
  }

  async function onClick() {
    if (state.notifyOn) {
      state.notifyOn = false;
      toast('🔕 돌봄 알림을 껐어요');
    } else {
      if (!supported()) return toast('이 환경에서는 알림을 쓸 수 없어요 (https 주소에서만 돼요)');
      let permission = Notification.permission;
      if (permission === 'default') {
        try {
          permission = await Notification.requestPermission();
        } catch (e) {
          permission = 'denied';
        }
      }
      if (permission !== 'granted') return toast('브라우저 설정에서 이 사이트의 알림을 허용해 주세요');
      state.notifyOn = true;
      toast('🔔 우왕이가 돌봄이 필요하면 알려 드릴게요');
    }
    saveState();
    render();
  }

  function send(text) {
    if (!supported() || Notification.permission !== 'granted') return;
    try {
      const n = new Notification('우왕이가 불러요', { body: text });
      n.onclick = () => {
        window.focus();
        show('pet');
        n.close();
      };
    } catch (e) {
      // 일부 모바일 브라우저는 페이지에서 바로 알림을 만들 수 없다
    }
  }

  // 1초마다 app.js에서 부른다. 새로 생긴 요구 중 가장 급한 것 하나만 알린다.
  function tick() {
    const needs = petNeeds();
    const fresh = lastNeeds ? needs.filter((n) => !lastNeeds.includes(n)) : [];
    lastNeeds = needs;
    if (!state.notifyOn || fresh.length === 0) return;

    if (document.hidden) send(fresh[0]);
    else if (currentTab !== 'pet') toast(`🐻 ${fresh[0]}`); // 우왕이 탭에서는 말풍선으로 이미 보인다
  }

  function init() {
    // 켜 둔 뒤에 브라우저 설정에서 권한을 막았으면 꺼진 상태로 맞춘다
    if (state.notifyOn && (!supported() || Notification.permission !== 'granted')) {
      state.notifyOn = false;
      saveState();
    }
    $('#btn-notify').addEventListener('click', onClick);
    render();
  }

  return { init, tick };
})();
