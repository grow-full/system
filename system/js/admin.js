(() => {
  const status = document.querySelector('#status');
  const frame = document.querySelector('#dashboard');
  const reload = document.querySelector('#reload');
  if (!window.supabase || typeof SUPABASE_CONFIG === 'undefined' || !SUPABASE_CONFIG) {
    status.textContent = '계정 서비스에 연결할 수 없습니다.';
    return;
  }

  const client = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'wooang-auth' },
  });
  let request = 0;

  function clearDashboard() {
    request++;
    frame.hidden = true;
    frame.removeAttribute('srcdoc');
    reload.hidden = true;
  }

  async function loadDashboard() {
    clearDashboard();
    const current = request;
    status.textContent = '계정을 확인하는 중입니다.';
    try {
      const { data: { session }, error: sessionError } = await client.auth.getSession();
      if (current !== request) return;
      if (sessionError) throw sessionError;
      if (!session) {
        status.textContent = '게임에서 관리자 계정으로 로그인한 뒤 다시 접속해 주세요.';
        return;
      }
      const { data, error } = await client.rpc('site_admin_dashboard');
      if (current !== request) return;
      if (error?.code === '42501') {
        status.textContent = '이 계정에는 접근 권한이 없습니다.';
        return;
      }
      if (error || typeof data !== 'string') throw error || new Error('Missing dashboard');
      frame.srcdoc = data;
      frame.hidden = false;
      reload.hidden = false;
      status.textContent = '';
    } catch {
      if (current !== request) return;
      status.textContent = '방문 통계를 불러오지 못했습니다.';
      reload.hidden = false;
    }
  }

  reload.addEventListener('click', loadDashboard);
  client.auth.onAuthStateChange((event) => {
    if (event !== 'SIGNED_OUT') return;
    clearDashboard();
    status.textContent = '게임에서 관리자 계정으로 로그인한 뒤 다시 접속해 주세요.';
  });
  window.addEventListener('pagehide', clearDashboard);
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) loadDashboard();
  });
  loadDashboard();
})();
