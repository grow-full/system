// 창밖 풍경: 지금 시각에 따라 새벽·낮·노을·밤으로 바뀌고, 교통수단마다 지나가는 풍경이 다르다.
const Sky = (() => {
  const PHASES = [
    { id: 'night', from: 0, to: 5 },
    { id: 'dawn', from: 5, to: 7 },
    { id: 'day', from: 7, to: 17 },
    { id: 'sunset', from: 17, to: 19 },
    { id: 'night', from: 19, to: 24 },
  ];

  function phase(time = Date.now()) {
    const hour = new Date(time).getHours();
    return PHASES.find((p) => hour >= p.from && hour < p.to).id;
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function drifting(text, cls, { size, top, bottom, duration, opacity = 1 }) {
    const el = document.createElement('span');
    el.className = `drift ${cls}`;
    el.textContent = text;
    el.style.fontSize = `${size}px`;
    if (top !== undefined) el.style.top = `${top}%`;
    if (bottom !== undefined) el.style.bottom = `${bottom}%`;
    el.style.opacity = opacity;
    el.style.animationDuration = `${duration}s`;
    el.style.animationDelay = `${-Math.random() * duration * 2}s`;
    return el;
  }

  function clouds(sky, count, high = false) {
    for (let i = 0; i < count; i++) {
      const near = i % 3 === 0; // 가까운 구름은 크고 빠르게, 먼 구름은 작고 느리게
      sky.appendChild(drifting('☁️', 'cloud', {
        size: near ? rand(64, 94) : rand(26, 48),
        top: high ? rand(0, 35) : rand(0, 80),
        duration: near ? rand(4, 6) : rand(10, 16),
        opacity: near ? 0.95 : 0.7,
      }));
    }
  }

  function land(sky, speed) {
    const ground = document.createElement('div');
    ground.className = 'ground';
    sky.appendChild(ground);
    const far = ['🏔️', '⛰️', '🏔️'];
    const near = ['🌲', '🌳', '🏠', '🏢', '🌲', '🌾', '🏡', '🌳'];
    far.forEach(() => sky.appendChild(drifting(far[Math.floor(Math.random() * far.length)], 'scenery far', {
      size: rand(60, 80), bottom: 22, duration: speed * 4,
    })));
    near.forEach((t) => sky.appendChild(drifting(t, 'scenery near', {
      size: rand(34, 48), bottom: rand(4, 14), duration: speed * rand(0.8, 1.2),
    })));
    clouds(sky, 3, true);
  }

  function sea(sky) {
    clouds(sky, 4, true);
    sky.appendChild(drifting('🏝️', 'scenery far', { size: 46, bottom: 30, duration: 30 }));
    const water = document.createElement('div');
    water.className = 'sea';
    for (let i = 0; i < 3; i++) {
      const row = document.createElement('div');
      row.className = 'waves';
      row.textContent = '🌊'.repeat(8);
      row.style.bottom = `${i * 10}%`;
      row.style.animationDelay = `${-i * 0.7}s`;
      water.appendChild(row);
    }
    sky.appendChild(water);
  }

  function nightSky(sky) {
    const stars = document.createElement('div');
    stars.className = 'stars';
    for (let i = 0; i < 14; i++) {
      const s = document.createElement('i');
      s.style.left = `${rand(2, 96)}%`;
      s.style.top = `${rand(2, 50)}%`;
      s.style.animationDelay = `${-rand(0, 3)}s`;
      stars.appendChild(s);
    }
    sky.appendChild(stars);
    const moon = document.createElement('span');
    moon.className = 'moon';
    moon.textContent = '🌙';
    sky.appendChild(moon);
    const sun = document.createElement('span');
    sun.className = 'sun';
    sun.textContent = '🌞';
    sky.appendChild(sun);
  }

  // 창 안의 풍경을 새로 만든다
  function build(win, sky, transport) {
    win.className = `window ${transport === 'plane' ? '' : transport === 'ship' ? 'porthole' : 'rail'}`.trim();
    sky.innerHTML = '';
    nightSky(sky);
    if (transport === 'plane') clouds(sky, 9);
    else if (transport === 'ship') sea(sky);
    else land(sky, transport === 'ktx' ? 2.5 : 6);
    update(sky);
  }

  // 시간대만 다시 맞춘다 (1분마다)
  function update(sky) {
    const p = phase();
    if (sky.dataset.phase === p) return;
    sky.dataset.phase = p;
    sky.classList.remove('dawn', 'day', 'sunset', 'night');
    sky.classList.add(p);
  }

  return { phase, build, update };
})();
