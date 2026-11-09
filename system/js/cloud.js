// 아이디/비밀번호 로그인과 클라우드 저장 (Supabase).
// 로그인하면 진행을 계정에 올려 두고, 여러 기기 중 가장 최근에 직접 플레이한 쪽(state.playedAt이 큰 쪽)의 진행을 쓴다.
// SUPABASE_CONFIG가 없으면 아무 일도 하지 않고, 진행은 지금처럼 이 기기에만 저장된다.
const Cloud = (() => {
  const SDK = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
  // Supabase 로그인은 이메일이 필요해서, 아이디를 "아이디@ID_DOMAIN" 모양으로 바꿔 쓴다. 실제 메일은 보내지 않는다.
  const ID_DOMAIN = 'wooang.app';
  const ID_RULE = /^[a-z0-9_]{4,16}$/;
  // 기기마다 달라야 하는 값은 올리지도, 받아 오지도 않는다
  const LOCAL_KEYS = ['deviceId', 'likedPosts', 'notifyOn', 'voiceOn'];
  const PUSH_DELAY = 3000;
  const TOAST_KEY = 'wooang-cloud-toast';

  let client = null;
  let user = null;
  let status = 'off';  // off(설정 없음) | out(로그아웃) | ready | syncing | error
  let pushTimer = 0;
  let pushing = null;
  let pushedAt = 0;    // 서버에 올라가 있는 진행의 playedAt
  let lastSync = 0;
  let reloading = false;

  const enabled = () => typeof SUPABASE_CONFIG !== 'undefined' && !!SUPABASE_CONFIG;
  const toEmail = (id) => `${id}@${ID_DOMAIN}`;
  const username = () => (user ? (user.user_metadata && user.user_metadata.username) || user.email.split('@')[0] : '');

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error(`스크립트를 불러오지 못했어요: ${src}`));
      document.head.appendChild(s);
    });
  }

  function setStatus(next) {
    status = next;
    renderButton();
    if (!$('#account-modal').hidden) renderModal();
  }

  // ---------- 서버와 주고받기 ----------
  function syncable() {
    const data = JSON.parse(JSON.stringify(state));
    LOCAL_KEYS.forEach((k) => delete data[k]);
    delete data.owner;
    return data;
  }

  function fetchRow(columns) {
    return client.from('saves').select(columns).eq('user_id', user.id).maybeSingle();
  }

  // 받아 온 진행으로 바꾸고 새로고침한다 (모든 화면이 새 state로 다시 그려지도록)
  // row가 null이면 이 계정의 저장이 없으므로 새로 시작한다.
  function adopt(row, message) {
    const next = (row && normalizeState(row.data)) || defaultState();
    LOCAL_KEYS.forEach((k) => { next[k] = state[k]; });
    next.owner = user ? user.id : null;
    next.playedAt = row ? row.played_at : 0; // 비교 기준은 서버의 played_at 열이다 (안 맞추면 새로고침이 반복될 수 있다)
    pushedAt = next.playedAt;
    state = next;
    saveState();
    reloading = true;
    if (message) sessionStorage.setItem(TOAST_KEY, message);
    location.reload();
  }

  async function push() {
    clearTimeout(pushTimer);
    if (!user || reloading) return;
    if (pushing) {
      await pushing;
      if (state.playedAt > pushedAt) return push();
      return;
    }
    pushing = (async () => {
      setStatus('syncing');
      try {
        const { data: row, error } = await fetchRow('played_at');
        if (error) throw error;
        if (row && row.played_at > state.playedAt) {
          // 그사이 다른 기기에서 더 최근에 플레이했다 → 그쪽 진행을 쓴다
          const { data: full, error: fullError } = await fetchRow('data, played_at');
          if (fullError) throw fullError;
          adopt(full, '다른 기기에서 이어 한 진행을 불러왔어요 ☁️');
          return;
        }
        const playedAt = state.playedAt;
        const { error: saveError } = await client.from('saves').upsert({
          user_id: user.id,
          data: syncable(),
          played_at: playedAt,
          updated_at: new Date().toISOString(),
        });
        if (saveError) throw saveError;
        pushedAt = Math.max(pushedAt, playedAt);
        lastSync = Date.now();
        setStatus('ready');
      } catch (e) {
        console.warn('[Cloud] 저장 실패', e);
        setStatus('error');
      } finally {
        pushing = null;
      }
    })();
    return pushing;
  }

  // 로그인 직후와 앱으로 돌아올 때: 서버 진행과 이 기기 진행 중 최근 것을 고른다
  async function reconcile() {
    if (!user || reloading) return;
    setStatus('syncing');
    try {
      const { data: row, error } = await fetchRow('data, played_at');
      if (error) throw error;
      const othersSave = state.owner && state.owner !== user.id;
      if (othersSave || (row && row.played_at > state.playedAt)) {
        adopt(row, row ? '계정에 저장된 진행을 불러왔어요 ☁️' : '');
        return;
      }
      if (state.owner !== user.id) {
        state.owner = user.id; // 로그인 전에 이 기기에서 하던 진행을 이 계정 것으로 삼는다 (계정에 저장이 없을 때만)
        saveState();
      }
      if (row) pushedAt = row.played_at;
      if (!row || state.playedAt > row.played_at) {
        await push();
      } else {
        lastSync = Date.now();
        setStatus('ready');
      }
    } catch (e) {
      console.warn('[Cloud] 불러오기 실패', e);
      setStatus('error');
    }
  }

  // state.js의 saveState()가 부른다. 직접 플레이해서 바뀐 게 있을 때만 잠시 모았다가 올린다.
  function onSave() {
    if (!user || reloading || state.playedAt <= pushedAt) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(push, PUSH_DELAY);
  }

  // ---------- 로그인 ----------
  function friendlyError(error) {
    const code = error.code || '';
    const msg = error.message || '';
    if (code === 'user_already_exists' || /already registered/i.test(msg)) return '이미 사용 중인 아이디예요.';
    if (code === 'invalid_credentials' || /invalid login/i.test(msg)) return '아이디 또는 비밀번호가 맞지 않아요.';
    if (code === 'weak_password' || /password/i.test(msg)) return '비밀번호를 6자 이상으로 만들어 주세요.';
    if (code === 'email_not_confirmed' || code === 'over_email_send_rate_limit' || /confirm/i.test(msg)) {
      return 'Supabase에서 "Confirm email" 설정을 꺼야 아이디로 가입할 수 있어요. (관리자에게 알려 주세요)';
    }
    if (/fetch|network/i.test(msg)) return '인터넷 연결을 확인해 주세요.';
    return `잠시 후 다시 시도해 주세요. (${msg || code})`;
  }

  async function login(id, password, isSignUp) {
    if (!client) throw new Error('서버에 연결하지 못했어요. 새로고침 후 다시 시도해 주세요.');
    id = id.trim().toLowerCase();
    if (!ID_RULE.test(id)) throw new Error('아이디는 영어 소문자·숫자·밑줄(_)로 4~16자예요.');
    if (password.length < 6) throw new Error('비밀번호는 6자 이상이에요.');
    const email = toEmail(id);
    const { data, error } = isSignUp
      ? await client.auth.signUp({ email, password, options: { data: { username: id } } })
      : await client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(friendlyError(error));
    if (!data.session) throw new Error(friendlyError({ code: 'email_not_confirmed' }));
    user = data.user;
    await reconcile();
  }

  async function logout() {
    if (state.playedAt > pushedAt) await push();
    await client.auth.signOut();
    user = null;
    // 이 기기에서는 새로 시작한다. 진행은 계정에 남아 있어서 다시 로그인하면 이어 할 수 있다.
    const next = defaultState();
    LOCAL_KEYS.forEach((k) => { next[k] = state[k]; });
    state = next;
    saveState();
    reloading = true;
    sessionStorage.setItem(TOAST_KEY, '로그아웃했어요. 다시 로그인하면 이어서 할 수 있어요.');
    location.reload();
  }

  // ---------- 화면 ----------
  function renderButton() {
    const btn = $('#btn-account');
    const icon = { off: '👤', out: '👤', ready: '☁️', syncing: '⏳', error: '⚠️' }[status];
    btn.textContent = icon;
    btn.classList.toggle('on', !!user);
    btn.setAttribute('aria-label', user ? `계정: ${username()}` : '로그인');
  }

  function timeText(time) {
    if (!time) return '아직 없음';
    const sec = Math.floor((Date.now() - time) / 1000);
    if (sec < 60) return '방금';
    if (sec < 3600) return `${Math.floor(sec / 60)}분 전`;
    return new Date(time).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function renderModal() {
    const card = $('#account-card');
    if (status === 'off') {
      card.innerHTML = `
        <div class="big">👤</div>
        <h3>계정 저장 준비 중</h3>
        <p>아직 서버 설정이 없어서 진행이 이 기기에만 저장돼요.<br>js/supabase-config.js에 Supabase 설정을 넣으면 아이디로 로그인할 수 있어요.</p>
        <button class="ghost" data-act="close">닫기</button>`;
      return;
    }
    if (user) {
      const statusText = {
        syncing: '저장하는 중…',
        error: '⚠️ 저장에 실패했어요. 인터넷 연결을 확인해 주세요.',
        ready: `마지막 저장: ${timeText(lastSync)}`,
      }[status] || '';
      card.innerHTML = `
        <div class="big">☁️</div>
        <h3>${username()}</h3>
        <p>진행이 계정에 저장되고 있어요.<br>다른 기기에서 같은 아이디로 로그인하면 이어서 할 수 있어요.</p>
        <p class="account-status">${statusText}</p>
        <button class="primary" data-act="sync">지금 저장하기</button>
        <button class="ghost" data-act="logout">로그아웃</button>
        <button class="ghost" data-act="close">닫기</button>`;
      return;
    }
    card.innerHTML = `
      <div class="big">🐻</div>
      <h3>아이디로 로그인</h3>
      <p>로그인하면 진행이 계정에 저장돼서<br>다른 기기에서도 이어서 할 수 있어요.</p>
      <form class="form account-form" id="account-form">
        <label for="acc-id">아이디</label>
        <input id="acc-id" maxlength="16" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="영어 소문자·숫자 4~16자">
        <label for="acc-pw">비밀번호</label>
        <input id="acc-pw" type="password" autocomplete="current-password" placeholder="6자 이상">
        <p class="account-error" id="acc-error"></p>
        <button type="submit" class="primary">로그인</button>
        <button type="button" class="ghost" data-act="signup">처음이에요 · 회원가입</button>
      </form>
      <button class="ghost" data-act="close">닫기</button>`;
  }

  function openModal() {
    renderModal();
    $('#account-modal').hidden = false;
    const idInput = $('#acc-id');
    if (idInput) idInput.focus();
  }

  function closeModal() {
    $('#account-modal').hidden = true;
  }

  async function submitLogin(isSignUp) {
    const errorEl = $('#acc-error');
    const buttons = $('#account-form').querySelectorAll('button');
    buttons.forEach((b) => { b.disabled = true; });
    errorEl.textContent = isSignUp ? '가입하는 중…' : '로그인하는 중…';
    try {
      await login($('#acc-id').value, $('#acc-pw').value, isSignUp);
      if (!reloading) {
        toast(isSignUp ? `반가워요, ${username()}님! 진행을 계정에 저장했어요 ☁️` : `${username()}님, 다시 만나서 반가워요!`);
        closeModal();
      }
    } catch (e) {
      errorEl.textContent = e.message;
      buttons.forEach((b) => { b.disabled = false; });
    }
  }

  function bindModal() {
    $('#btn-account').addEventListener('click', openModal);
    const modal = $('#account-modal');
    modal.addEventListener('click', (e) => {
      if (e.target === modal) return closeModal();
      const act = e.target.dataset && e.target.dataset.act;
      if (act === 'close') closeModal();
      if (act === 'signup') submitLogin(true);
      if (act === 'sync') push();
      if (act === 'logout') {
        e.target.disabled = true;
        logout().catch(() => { e.target.disabled = false; toast('로그아웃하지 못했어요. 다시 시도해 주세요.'); });
      }
    });
    modal.addEventListener('submit', (e) => {
      e.preventDefault();
      submitLogin(false);
    });
  }

  // ---------- 시작 ----------
  async function init() {
    bindModal();
    const pending = sessionStorage.getItem(TOAST_KEY);
    if (pending) {
      sessionStorage.removeItem(TOAST_KEY);
      setTimeout(() => toast(pending), 300);
    }
    if (!enabled()) {
      setStatus('off');
      return;
    }
    setStatus('out');

    // 로그인한 상태에서 직접 누르거나 키를 칠 때가 "플레이한 시각"이다.
    // 받아 온 진행보다 항상 커지게 해서, 기기끼리 시계가 조금 달라도 방금 한 플레이가 밀리지 않게 한다.
    const markPlayed = () => { if (user) state.playedAt = Math.max(Date.now(), state.playedAt + 1); };
    document.addEventListener('pointerdown', markPlayed, true);
    document.addEventListener('keydown', markPlayed, true);

    document.addEventListener('visibilitychange', () => {
      if (!user) return;
      if (document.hidden) {
        if (state.playedAt > pushedAt) push();
      } else {
        reconcile();
      }
    });

    try {
      await loadScript(SDK);
      client = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, storageKey: 'wooang-auth' },
      });
      const { data } = await client.auth.getSession();
      user = data.session ? data.session.user : null;
      if (user) await reconcile();
      else setStatus('out');
    } catch (e) {
      console.warn('[Cloud] 시작 실패', e);
      setStatus('error');
    }
  }

  return { init, onSave, push };
})();
