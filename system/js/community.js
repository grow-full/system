// 커뮤니티 탭: 여행 꿀팁 쓰기, 보기, 좋아요(누르기/취소), 댓글.
// FIREBASE_CONFIG가 있으면 Firestore에 저장해서 모두와 공유하고,
// 없으면 이 브라우저(localStorage)에만 저장한다.
const Community = (() => {
  const CATEGORIES = ['교통', '맛집', '숙소', '관광', '쇼핑', '기타'];
  const LOCAL_KEY = 'wooang-community-v1';
  const MAX_LENGTH = 300;
  const MAX_COMMENT = 100;

  let store = null;
  let posts = [];
  let filter = 'all';
  let sort = 'new';
  let deleteArmed = null;          // 글 id 또는 'c:댓글 id'
  const openComments = new Set();  // 댓글 창을 펼친 글
  const drafts = {};               // 쓰던 댓글 (목록을 다시 그려도 남도록)

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
    async like(id, delta) {
      const list = this.read();
      const post = list.find((p) => p.id === id);
      if (post) post.likes = Math.max(0, post.likes + delta);
      this.write(list);
    },
    async remove(id) {
      this.write(this.read().filter((p) => p.id !== id));
    },
    async addComment(id, comment) {
      const list = this.read();
      const post = list.find((p) => p.id === id);
      if (post) post.comments = [...(post.comments || []), comment];
      this.write(list);
    },
    async removeComment(id, comment) {
      const list = this.read();
      const post = list.find((p) => p.id === id);
      if (post) post.comments = (post.comments || []).filter((c) => c.id !== comment.id);
      this.write(list);
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
    async like(id, delta) {
      await this.db.collection('tips').doc(id).update({ likes: firebase.firestore.FieldValue.increment(delta) });
    },
    async remove(id) {
      await this.db.collection('tips').doc(id).delete();
    },
    // 댓글은 글 문서의 comments 배열에 넣는다 (배열 안에는 서버 시각을 못 써서 기기 시각을 쓴다)
    async addComment(id, comment) {
      await this.db.collection('tips').doc(id).update({ comments: firebase.firestore.FieldValue.arrayUnion(comment) });
    },
    async removeComment(id, comment) {
      await this.db.collection('tips').doc(id).update({ comments: firebase.firestore.FieldValue.arrayRemove(comment) });
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
    $('#post-list').addEventListener('submit', submitComment);
    $('#post-list').addEventListener('input', (e) => {
      const input = e.target.closest('[data-comment-input]');
      if (input) drafts[input.dataset.commentInput] = input.value;
    });

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
      const comments = p.comments || [];
      const open = openComments.has(p.id);
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
              <button data-toggle-comments="${p.id}" class="${open ? 'on' : ''}">💬 ${comments.length}</button>
              <button data-like="${p.id}" class="${liked ? 'liked' : ''}" aria-pressed="${liked}" title="${liked ? '좋아요 취소' : '좋아요'}">${liked ? '❤️' : '🤍'} ${p.likes}</button>
            </span>
          </div>
          ${open ? commentsHtml(p.id, comments) : ''}
        </article>`;
    }).join('');
  }

  function commentsHtml(postId, comments) {
    const list = comments.slice().sort((a, b) => a.createdAt - b.createdAt).map((c) => {
      const mine = c.authorKey === state.deviceId;
      const armed = deleteArmed === `c:${c.id}`;
      return `
        <li class="comment">
          <div class="comment-head">
            <b>${escapeHtml(c.author)}</b>
            <span>${timeAgo(c.createdAt)}</span>
            ${mine ? `<button data-comment-delete="${postId}|${c.id}">${armed ? '정말 삭제?' : '삭제'}</button>` : ''}
          </div>
          <p>${escapeHtml(c.text)}</p>
        </li>`;
    }).join('');
    return `
      <div class="comments">
        ${list ? `<ul>${list}</ul>` : '<p class="comment-empty">첫 댓글을 남겨 주세요!</p>'}
        <form class="comment-form" data-comment-form="${postId}">
          <input data-comment-input="${postId}" maxlength="${MAX_COMMENT}" placeholder="댓글 달기 (${MAX_COMMENT}자)" autocomplete="off" value="${escapeHtml(drafts[postId] || '')}">
          <button type="submit">등록</button>
        </form>
      </div>`;
  }

  async function onListClick(e) {
    const likeBtn = e.target.closest('[data-like]');
    const deleteBtn = e.target.closest('[data-delete]');
    const toggleBtn = e.target.closest('[data-toggle-comments]');
    const commentDeleteBtn = e.target.closest('[data-comment-delete]');
    if (toggleBtn) {
      const id = toggleBtn.dataset.toggleComments;
      if (openComments.has(id)) openComments.delete(id);
      else openComments.add(id);
      renderList();
      return;
    }
    if (commentDeleteBtn) {
      const [postId, commentId] = commentDeleteBtn.dataset.commentDelete.split('|');
      return deleteComment(postId, commentId);
    }
    if (likeBtn) {
      const id = likeBtn.dataset.like;
      const liked = state.likedPosts.includes(id);
      const delta = liked ? -1 : 1; // 이미 눌렀으면 취소
      state.likedPosts = liked ? state.likedPosts.filter((x) => x !== id) : [...state.likedPosts, id];
      saveState();
      const post = posts.find((p) => p.id === id);
      if (post) post.likes = Math.max(0, post.likes + delta);
      renderList();
      try {
        await store.like(id, delta);
      } catch (err) {
        console.error(err);
        toast(liked ? '좋아요 취소를 저장하지 못했어요' : '좋아요를 저장하지 못했어요');
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

  async function submitComment(e) {
    const form = e.target.closest('[data-comment-form]');
    if (!form) return;
    e.preventDefault();
    const postId = form.dataset.commentForm;
    const text = form.querySelector('input').value.trim();
    if (text.length < 2) return toast('댓글을 2글자 이상 적어 주세요');
    const comment = {
      id: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      author: state.nickname || '익명 여행자',
      text: text.slice(0, MAX_COMMENT),
      authorKey: state.deviceId,
      createdAt: Date.now(),
    };
    const button = form.querySelector('button');
    button.disabled = true;
    try {
      await store.addComment(postId, comment);
    } catch (err) {
      console.error(err);
      button.disabled = false;
      return toast('댓글을 등록하지 못했어요. 잠시 후 다시 시도해 주세요');
    }
    delete drafts[postId];
    toast('댓글을 달았어요 💬');
    refresh();
  }

  async function deleteComment(postId, commentId) {
    const key = `c:${commentId}`;
    if (deleteArmed !== key) {
      deleteArmed = key;
      renderList();
      return;
    }
    deleteArmed = null;
    const post = posts.find((p) => p.id === postId);
    const comment = post && (post.comments || []).find((c) => c.id === commentId);
    if (!comment) return refresh();
    try {
      await store.removeComment(postId, comment);
      toast('댓글을 삭제했어요');
    } catch (err) {
      console.error(err);
      toast('댓글을 삭제하지 못했어요');
    }
    refresh();
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
