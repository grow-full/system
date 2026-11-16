// 브라우저별 첫 방문을 집계한다. 게임 진행 초기화나 로그아웃과 독립적으로 유지한다.
const Visitors = (() => {
  const KEY = 'wooang-visitor-v1';
  let running = false;
  let memoryId = null;

  function visitorId() {
    if (memoryId) return memoryId;
    try {
      const saved = localStorage.getItem(KEY);
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(saved || '')) return (memoryId = saved);
      const next = crypto.randomUUID();
      localStorage.setItem(KEY, next);
      return (memoryId = next);
    } catch (e) {
      // 저장을 못 하면 재방문을 구분할 수 없으므로 조회만 한다.
      return null;
    }
  }

  function isPublicSite() {
    return location.protocol === 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  }

  async function refresh() {
    const label = document.querySelector('#visitor-count');
    if (!label || running) return;
    running = true;
    try {
      await Cloud.ready;
      const client = Cloud.getClient();
      if (!client) throw new Error('Supabase unavailable');
      const { data, error } = await client.rpc('record_site_visitor', { p_visitor_id: isPublicSite() ? visitorId() : null });
      if (error) throw error;
      if (data === null || !/^\d+$/.test(String(data))) throw new Error('Invalid visitor count');
      label.textContent = `${BigInt(data).toLocaleString('ko-KR')}명`;
      label.title = '브라우저별 첫 방문 기준 · 재방문 중복 제외';
    } catch (e) {
      label.textContent = '확인 불가';
      label.title = '이용자 수를 불러오지 못했어요. 잠시 후 다시 확인해 주세요.';
      console.warn('[Visitors] 집계 조회 실패', e);
    } finally {
      running = false;
    }
  }

  function init() {
    refresh();
    setInterval(() => { if (!document.hidden) refresh(); }, 60000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  }
  return { init };
})();
