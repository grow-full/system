// 수단·등급별 좌석 배치도. 좌석을 고르면 onPick(좌석)을 부른다.
// groups: 통로로 나뉜 좌석 묶음 크기 (예: [3, 3]은 3-3 배치)
const SEAT_CLASSES = {
  plane: [
    { id: 'economy', name: '이코노미', mult: 1, groups: [3, 3], rows: 10, firstRow: 20 },
    { id: 'business', name: '비즈니스', mult: 2, groups: [2, 2], rows: 4, firstRow: 7 },
    { id: 'first', name: '퍼스트', mult: 3, groups: [1, 1], rows: 3, firstRow: 1 },
  ],
  ktx: [
    { id: 'standard', name: '일반실', mult: 1, groups: [2, 2], rows: 10, firstRow: 1, car: 5 },
    { id: 'special', name: '특실', mult: 1.5, groups: [2, 1], rows: 8, firstRow: 1, car: 3 },
  ],
  bus: [
    { id: 'normal', name: '일반', mult: 1, groups: [2, 2], rows: 7, firstRow: 1 },
    { id: 'deluxe', name: '우등', mult: 1.3, groups: [2, 1], rows: 7, firstRow: 1 },
    { id: 'premium', name: '프리미엄', mult: 1.6, groups: [1, 1], rows: 8, firstRow: 1 },
  ],
  ship: [
    { id: 'seat', name: '일반석', mult: 1, groups: [2, 2], rows: 8, firstRow: 1 },
    { id: 'room', name: '객실', mult: 2, groups: [2, 2], rows: 3, firstRow: 1, rooms: true },
  ],
};

const SeatMap = (() => {
  const LETTERS = 'ABCDEFGH';
  let current = null; // { transport, cls, seats, picked, onPick }

  function classesFor(transport) {
    return SEAT_CLASSES[transport];
  }

  function classById(transport, id) {
    return SEAT_CLASSES[transport].find((c) => c.id === id) || SEAT_CLASSES[transport][0];
  }

  // 좌석 번호 규칙: 비행기 12A, KTX 5호차 3B, 버스 7, 배 일반석 4C, 배 객실 객실 205
  function label(transport, cls, row, col, number) {
    const letter = LETTERS[col];
    if (transport === 'ktx') return `${cls.car}호차 ${row}${letter}`;
    if (transport === 'bus') return String(number);
    if (cls.rooms) return `객실 ${200 + number}`;
    return `${row}${letter}`;
  }

  function build(transport, cls) {
    const perRow = cls.groups.reduce((a, b) => a + b, 0);
    const seats = [];
    let number = 0;
    for (let r = 0; r < cls.rows; r++) {
      const row = cls.firstRow + r;
      for (let col = 0; col < perRow; col++) {
        number++;
        seats.push({
          row: r,
          col,
          label: label(transport, cls, row, col, number),
          window: col === 0 || col === perRow - 1,
          taken: false,
        });
      }
    }
    // 다른 승객이 이미 앉은 자리 20~40%
    const takenRate = 0.2 + Math.random() * 0.2;
    seats.forEach((s) => { s.taken = Math.random() < takenRate; });
    if (seats.every((s) => s.taken)) seats[0].taken = false;
    return seats;
  }

  // 배치도를 새로 만든다 (등급을 바꾸거나 계획 화면에 다시 들어올 때)
  function open(el, transport, classId, onPick) {
    const cls = classById(transport, classId);
    current = { el, transport, cls, seats: build(transport, cls), picked: null, onPick };
    el.onclick = (e) => {
      const btn = e.target.closest('[data-seat]');
      if (!btn || btn.disabled) return;
      const seat = current.seats[Number(btn.dataset.seat)];
      current.picked = seat;
      Sound.sfx('beep');
      draw();
      onPick(seat);
    };
    draw();
  }

  function draw() {
    const { el, transport, cls, seats, picked } = current;
    const perRow = cls.groups.reduce((a, b) => a + b, 0);
    const front = { plane: '✈️ 앞쪽 (조종석)', ktx: '🚄 진행 방향', bus: '🚌 운전석', ship: '⛴️ 뱃머리' }[transport];
    const rows = [];
    for (let r = 0; r < cls.rows; r++) {
      const cells = [];
      let col = 0;
      cls.groups.forEach((size, g) => {
        if (g > 0) cells.push('<span class="aisle"></span>');
        for (let i = 0; i < size; i++, col++) {
          const index = r * perRow + col;
          const s = seats[index];
          const cn = ['seat', s.taken ? 'taken' : '', s.window ? 'win' : '', s === picked ? 'picked' : '', cls.rooms ? 'cabin' : '']
            .filter(Boolean).join(' ');
          const short = cls.rooms ? s.label.replace('객실 ', '') : transport === 'ktx' ? s.label.split(' ')[1] : s.label;
          cells.push(`<button class="${cn}" data-seat="${index}" ${s.taken ? 'disabled' : ''} aria-label="${s.label}${s.taken ? ' (이미 찬 좌석)' : ''}">${short}</button>`);
        }
      });
      rows.push(`<div class="seat-row">${cells.join('')}</div>`);
    }
    el.innerHTML = `
      <div class="seat-front">${front}</div>
      ${transport === 'ktx' ? `<div class="seat-car">${cls.car}호차 · ${cls.name}</div>` : ''}
      <div class="seat-grid">${rows.join('')}</div>
      <div class="seat-legend">
        <span><i class="seat"></i>빈 좌석</span>
        <span><i class="seat win"></i>${cls.rooms ? '바다 전망' : '창가'}</span>
        <span><i class="seat taken"></i>이미 찬 좌석</span>
        <span><i class="seat picked"></i>내 좌석</span>
      </div>`;
  }

  return { classesFor, classById, open };
})();
