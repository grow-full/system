// 커뮤니티 탭: 여행 꿀팁 쓰기, 보기, 좋아요.
// FIREBASE_CONFIG가 있으면 Firestore에 저장해서 모두와 공유하고,
// 없으면 이 브라우저(localStorage)에만 저장한다.
const Community = (() => {
  const CATEGORIES = ['교통', '맛집', '숙소', '관광', '쇼핑', '기타'];
  const LOCAL_KEY = 'wooang-community-v1';
  const MAX_LENGTH = 300;

  let store = null;
  let posts = [];
  let filter = 'all';
  let sort = 'new';
  let deleteArmed = null;

  // ---------- 저장소: 이 기기 ----------
  const localStore = {
    shared: false,
    async init() {},
    read() {
      try {
        const saved = JSON.parse(localStorage.getItem(LOCAL_KEY));
        if (Array.isArray(saved)) return saved;
      } catch (e) {
        // 손상된 데이터는 예시 글로 다시 시작
      }
      const seeds = seedPosts();
      this.write(seeds);
      return seeds;
    },
    write(list) {
      try {
        localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
      } catch (e) {
        // 저장 실패는 무시
      }
    },
    async list() {
      return this.read();
    },
    async add(post) {
      const list = this.read();
      list.unshift({ ...post, id: `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, likes: 0, createdAt: Date.now() });
      this.write(list);
    },
    async like(id) {
      const list = this.read();
      const post = list.find((p) => p.id === id);
      if (post) post.likes++;
      this.write(list);
    },
    async remove(id) {
      this.write(this.read().filter((p) => p.id !== id));
    },
  };

  // 처음 열었을 때 보이는 예시 글 (data.js의 tips)
  function seedPosts() {
    const now = Date.now();
    let n = 0;
    return DESTINATIONS.flatMap((d) => d.tips.map((tip) => {
      n++;
      return {
        id: `seed-${d.id}-${n}`,
        author: '우왕이 가이드',
        guide: true,
        destId: d.id,
        category: tip.category,
        text: tip.text,
        likes: (n * 7) % 13,
        createdAt: now - n * 3 * 3600 * 1000,
        authorKey: 'guide',
      };
    }));
  }

  // ---------- 저장소: Firebase (모두와 공유) ----------
  const FIREBASE_SDK = 'https://www.gstatic.com/firebasejs/10.12.2';
  const firebaseStore = {
    shared: true,
    db: null,
    async init() {
      await loadScript(`${FIREBASE_SDK}/firebase-app-compat.js`);
      await loadScript(`${FIREBASE_SDK}/firebase-firestore-compat.js`);
      firebase.initializeApp(FIREBASE_CONFIG);
      this.db = firebase.firestore();
    },
    async list() {
      const snap = await this.db.collection('tips').orderBy('createdAt', 'desc').limit(200).get();
      return snap.docs.map((doc) => {
        const p = doc.data();
        return { ...p, id: doc.id, createdAt: p.createdAt ? p.createdAt.toMillis() : Date.now() };
      });
    },
    async add(post) {
      await this.db.collection('tips').add({
        ...post,
        likes: 0,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
    },
    async like(id) {
      await this.db.collection('tips').doc(id).update({ likes: firebase.firestore.FieldValue.increment(1) });
    },
    async remove(id) {
      await this.db.collection('tips').doc(id).delete();
    },
  };

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error(`스크립트를 불러오지 못했어요: ${src}`));
      document.head.appendChild(s);
    });
  }

  // ---------- 화면 ----------
  async function init() {
    $('#tip-filter').innerHTML = `<option value="all">🌏 전체 여행지</option>${destOptionsHtml()}`;
    $('#w-dest').innerHTML = destOptionsHtml();
    $('#w-cat').innerHTML = CATEGORIES.map((c) => `<option>${c}</option>`).join('');

    $('#tip-filter').addEventListener('change', (e) => { filter = e.target.value; renderList(); });
    document.querySelectorAll('[data-sort]').forEach((b) => b.addEventListener('click', () => {
      sort = b.dataset.sort;
      document.querySelectorAll('[data-sort]').forEach((x) => x.classList.toggle('on', x === b));
      renderList();
    }));
    $('#btn-write').addEventListener('click', openForm);
    $('#btn-write-cancel').addEventListener('click', closeForm);
    $('#w-text').addEventListener('input', () => { $('#w-count').textContent = `${$('#w-text').value.length} / ${MAX_LENGTH}`; });
    $('#write-form').addEventListener('submit', submit);
    $('#post-list').addEventListener('click', onListClick);

    store = localStore;
    if (typeof FIREBASE_CONFIG !== 'undefined' && FIREBASE_CONFIG) {
      try {
        await firebaseStore.init();
        store = firebaseStore;
      } catch (e) {
        console.error(e);
        toast('공유 서버에 연결하지 못해서 이 기기에만 저장해요');
      }
    }
    $('#community-mode').textContent = store.shared
      ? '🌐 모두와 공유되는 게시판이에요. 다른 사람을 배려해서 써 주세요.'
      : '📱 지금은 글이 이 기기에만 저장돼요. js/firebase-config.js에 Firebase 설정을 넣으면 모두와 공유돼요.';
    await refresh();
  }

  async function refresh() {
    try {
      posts = await store.list();
    } catch (e) {
      console.error(e);
      toast('글을 불러오지 못했어요. 잠시 후 다시 시도해 주세요');
    }
    renderList();
  }

  function render() {
    refresh();
  }

  function renderList() {
    const list = posts
      .filter((p) => filter === 'all' || p.destId === filter)
      .sort((a, b) => (sort === 'top' ? b.likes - a.likes || b.createdAt - a.createdAt : b.createdAt - a.createdAt));

    if (!list.length) {
      const d = filter === 'all' ? null : destById(filter);
      $('#post-list').innerHTML = `<p class="empty">${d ? `아직 ${d.name} 꿀팁이 없어요.<br>첫 번째 꿀팁을 남겨 주세요! ✏️` : '아직 글이 없어요.'}</p>`;
      return;
    }

    $('#post-list').innerHTML = list.map((p) => {
      const d = destById(p.destId);
      const mine = p.authorKey === state.deviceId;
      const liked = state.likedPosts.includes(p.id);
      return `
        <article class="post">
          <div class="post-tags">
            <span class="tag">${d.icon} ${d.name}</span>
            <span class="tag cat">${escapeHtml(p.category)}</span>
          </div>
          <p class="post-text">${escapeHtml(p.text)}</p>
          <div class="post-meta">
            <span>${p.guide ? '🐻 ' : ''}${escapeHtml(p.author)} · ${timeAgo(p.createdAt)}</span>
            <span class="post-actions">
              ${mine ? `<button data-delete="${p.id}">${deleteArmed === p.id ? '정말 삭제?' : '삭제'}</button>` : ''}
              <button data-like="${p.id}" class="${liked ? 'liked' : ''}">❤️ ${p.likes}</button>
            </span>
          </div>
        </article>`;
    }).join('');
  }

  async function onListClick(e) {
    const likeBtn = e.target.closest('[data-like]');
    const deleteBtn = e.target.closest('[data-delete]');
    if (likeBtn) {
      const id = likeBtn.dataset.like;
      if (state.likedPosts.includes(id)) return toast('이미 좋아요를 눌렀어요');
      state.likedPosts.push(id);
      saveState();
      const post = posts.find((p) => p.id === id);
      if (post) post.likes++;
      renderList();
      try {
        await store.like(id);
      } catch (err) {
        console.error(err);
        toast('좋아요를 저장하지 못했어요');
      }
    }
    if (deleteBtn) {
      const id = deleteBtn.dataset.delete;
      if (deleteArmed !== id) {
        deleteArmed = id;
        renderList();
        return;
      }
      deleteArmed = null;
      try {
        await store.remove(id);
        toast('글을 삭제했어요');
      } catch (err) {
        console.error(err);
        toast('삭제하지 못했어요');
      }
      refresh();
    }
  }

  function openForm() {
    $('#write-form').hidden = false;
    $('#btn-write').hidden = true;
    $('#w-name').value = state.nickname;
    $('#w-dest').value = filter !== 'all' ? filter : (state.arrival && state.arrival.destId) || DESTINATIONS[0].id;
    $('#w-text').focus();
  }

  function closeForm() {
    $('#write-form').hidden = true;
    $('#btn-write').hidden = false;
    $('#w-text').value = '';
    $('#w-count').textContent = `0 / ${MAX_LENGTH}`;
  }

  async function submit(e) {
    e.preventDefault();
    const text = $('#w-text').value.trim();
    if (text.length < 5) return toast('꿀팁을 5글자 이상 적어 주세요');
    const author = $('#w-name').value.trim() || '익명 여행자';
    state.nickname = $('#w-name').value.trim();
    saveState();
    try {
      await store.add({
        author,
        destId: $('#w-dest').value,
        category: $('#w-cat').value,
        text: text.slice(0, MAX_LENGTH),
        authorKey: state.deviceId,
      });
    } catch (err) {
      console.error(err);
      return toast('등록하지 못했어요. 잠시 후 다시 시도해 주세요');
    }
    rewardExp(5);
    renderTop();
    toast('꿀팁이 등록되었어요! 고마워요 🙌');
    closeForm();
    sort = 'new';
    document.querySelectorAll('[data-sort]').forEach((x) => x.classList.toggle('on', x.dataset.sort === 'new'));
    refresh();
  }

  // 도착 화면에서 "꿀팁 보러 가기"를 눌렀을 때
  function openFor(destId) {
    filter = destId;
    $('#tip-filter').value = destId;
    show('community');
  }

  function timeAgo(time) {
    const minutes = Math.floor((Date.now() - time) / 60000);
    if (minutes < 1) return '방금';
    if (minutes < 60) return `${minutes}분 전`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}시간 전`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}일 전`;
    return new Date(time).toLocaleDateString('ko-KR');
  }

  return { init, render, openFor };
})();

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
