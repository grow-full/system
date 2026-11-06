// 기내 소음, 빗소리, 음악, 효과음을 Web Audio API로 직접 합성한다.
// 외부 음원 파일이 없어서 저작권 걱정이 없다.
const Sound = (() => {
  let ctx = null;
  let master = null;
  const active = {};

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.8;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function noiseSource() {
    const length = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    return src;
  }

  function note(freq, time, duration, type, volume) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(volume, time + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    osc.connect(gain).connect(master);
    osc.start(time);
    osc.stop(time + duration + 0.05);
  }

  // 각 함수는 소리를 시작하고, 멈추는 함수를 돌려준다.
  const makers = {
    cabin() {
      const src = noiseSource();
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 320;
      const gain = ctx.createGain();
      gain.gain.value = 0.5;
      src.connect(lowpass).connect(gain).connect(master);
      src.start();
      return () => { src.stop(); gain.disconnect(); };
    },

    rain() {
      const src = noiseSource();
      const highpass = ctx.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.value = 1200;
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 6000;
      const gain = ctx.createGain();
      gain.gain.value = 0.18;
      src.connect(highpass).connect(lowpass).connect(gain).connect(master);
      src.start();
      const drops = setInterval(() => {
        if (Math.random() < 0.5) note(1800 + Math.random() * 1500, ctx.currentTime, 0.06, 'sine', 0.03);
      }, 90);
      return () => { src.stop(); clearInterval(drops); gain.disconnect(); };
    },

    music() {
      const melody = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33];
      const bass = [130.81, 110.0, 174.61, 196.0];
      const beat = 0.42;
      let step = 0;
      let next = ctx.currentTime + 0.1;
      const timer = setInterval(() => {
        while (next < ctx.currentTime + 0.3) {
          if (step % 8 === 0) note(bass[Math.floor(step / 8) % bass.length], next, beat * 7, 'sine', 0.12);
          if (Math.random() < 0.7) note(melody[Math.floor(Math.random() * melody.length)], next, beat * 1.5, 'triangle', 0.07);
          next += beat;
          step++;
        }
      }, 100);
      return () => clearInterval(timer);
    },
  };

  // ---------- 산책 배경음: 장소 분위기마다 다른 음악 ----------
  // 각 테마는 out(테마 전용 볼륨)에 소리를 내고, 멈추는 함수를 돌려준다.
  let noiseBuf = null;
  function noiseBuffer() {
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  }

  function tone(out, freq, time, duration, type, volume, attack = 0.02) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(volume, time + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    osc.connect(gain).connect(out);
    osc.start(time);
    osc.stop(time + duration + 0.05);
  }

  // 짧은 잡음 (하이햇, 스네어)
  function hit(out, time, freq, duration, volume) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer();
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    src.connect(filter).connect(gain).connect(out);
    src.start(time, Math.random());
    src.stop(time + duration + 0.05);
  }

  // 북 (낮게 떨어지는 사인파)
  function kick(out, time, volume) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(45, time + 0.15);
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.3);
    osc.connect(gain).connect(out);
    osc.start(time);
    osc.stop(time + 0.35);
  }

  // 새소리 한 번 (짹짹 2~4번)
  function bird(out, time) {
    const base = 2600 + Math.random() * 1400;
    const chirps = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < chirps; i++) {
      const t = time + i * 0.11;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(base, t);
      osc.frequency.exponentialRampToValueAtTime(base * 1.45, t + 0.07);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.035, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      osc.connect(gain).connect(out);
      osc.start(t);
      osc.stop(t + 0.12);
    }
  }

  // 천천히 일렁이는 잡음 (물결, 바람)
  function swell(out, type, freq, volume, rate) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer();
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = rate;
    depth.gain.value = volume * 0.8;
    lfo.connect(depth).connect(gain.gain);
    src.connect(filter).connect(gain).connect(out);
    src.start();
    lfo.start();
    return () => { src.stop(); lfo.stop(); };
  }

  // 박자에 맞춰 onBeat(시각, 몇 번째 박)를 부르는 순서기
  function sequence(beat, onBeat) {
    let step = 0;
    let next = ctx.currentTime + 0.15;
    const timer = setInterval(() => {
      while (next < ctx.currentTime + 0.35) {
        onBeat(next, step);
        next += beat;
        step++;
      }
    }, 100);
    return () => clearInterval(timer);
  }

  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  // 화음 진행 (도-솔-라-파): 각 화음의 구성음
  const CHORDS = [[261.63, 329.63, 392.0], [196.0, 246.94, 293.66], [220.0, 261.63, 329.63], [174.61, 220.0, 261.63]];

  const themes = {
    // 물가: 잔잔한 물결 + 맑은 퉁김 소리
    pond(out) {
      const stopWater = swell(out, 'bandpass', 420, 0.06, 0.18);
      const notes = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];
      const stopSeq = sequence(0.6, (t, s) => {
        if (s % 8 === 0) tone(out, CHORDS[(s / 8) % 4][0] / 2, t, 4.5, 'sine', 0.07, 0.4);
        if (Math.random() < 0.45) tone(out, pick(notes), t, 1.4, 'sine', 0.045);
      });
      return () => { stopWater(); stopSeq(); };
    },

    // 숲: 새소리 + 포근한 멜로디
    forest(out) {
      const notes = [392.0, 440.0, 493.88, 587.33, 659.25];
      const stopSeq = sequence(0.48, (t, s) => {
        if (s % 8 === 0) tone(out, CHORDS[(s / 8) % 4][0] / 2, t, 3.6, 'sine', 0.06, 0.2);
        if (Math.random() < 0.5) tone(out, pick(notes), t, 0.9, 'triangle', 0.04);
        if (Math.random() < 0.12) bird(out, t + Math.random() * 0.3);
      });
      return stopSeq;
    },

    // 캠퍼스: 밝고 경쾌한 멜로디 + 가벼운 박자
    campus(out) {
      const stopSeq = sequence(0.3, (t, s) => {
        const chord = CHORDS[Math.floor(s / 8) % 4];
        if (s % 8 === 0) tone(out, chord[0] / 2, t, 2.2, 'triangle', 0.07);
        tone(out, chord[s % 3] * 2, t, 0.25, 'triangle', 0.035);
        if (s % 2 === 1) hit(out, t, 7000, 0.04, 0.025);
        if (s % 4 === 2 && Math.random() < 0.6) tone(out, chord[2] * 2, t, 0.5, 'sine', 0.04);
      });
      return stopSeq;
    },

    // 공대: 8비트 게임 같은 전자음 아르페지오
    tech(out) {
      const prog = [[220.0, 261.63, 329.63], [174.61, 220.0, 261.63], [261.63, 329.63, 392.0], [196.0, 246.94, 293.66]];
      const stopSeq = sequence(0.15, (t, s) => {
        const chord = prog[Math.floor(s / 16) % 4];
        const order = [0, 1, 2, 1];
        tone(out, chord[order[s % 4]] * 2, t, 0.12, 'square', 0.022);
        if (s % 4 === 0) tone(out, chord[0] / 2, t, 0.5, 'triangle', 0.08);
        if (s % 8 === 4) hit(out, t, 5000, 0.05, 0.02);
      });
      return stopSeq;
    },

    // 운동장: 둥둥 북소리 행진곡
    sport(out) {
      const tune = [392.0, 392.0, 523.25, 392.0, 440.0, 493.88, 523.25, 0, 523.25, 587.33, 659.25, 523.25, 587.33, 493.88, 392.0, 0];
      const stopSeq = sequence(0.36, (t, s) => {
        if (s % 2 === 0) kick(out, t, 0.22);
        else hit(out, t, 1800, 0.12, 0.06);
        const f = tune[s % tune.length];
        if (f) tone(out, f, t, 0.3, 'square', 0.028);
        if (s % 4 === 0) tone(out, CHORDS[Math.floor(s / 4) % 4][0] / 2, t, 1.2, 'triangle', 0.06);
      });
      return stopSeq;
    },

    // 하늘: 바람 소리 + 몽글몽글한 화음 + 반짝이는 소리
    sky(out) {
      const stopWind = swell(out, 'lowpass', 650, 0.05, 0.1);
      const stopSeq = sequence(0.5, (t, s) => {
        if (s % 8 === 0) CHORDS[(s / 8) % 4].forEach((f) => tone(out, f, t, 5, 'sine', 0.035, 1.5));
        if (Math.random() < 0.18) tone(out, pick([1046.5, 1174.66, 1318.51, 1567.98]), t, 1.6, 'sine', 0.025);
      });
      return () => { stopWind(); stopSeq(); };
    },
  };

  let bgmTheme = '';
  let bgmStop = null;
  let bgmGain = null;

  // 테마를 바꾼다 (같은 테마면 그대로, 빈 값이면 끈다). 앞의 음악은 부드럽게 줄어들며 꺼진다.
  function bgm(theme) {
    if (theme === bgmTheme) return;
    if (!ensure()) return;
    if (bgmStop) {
      const oldStop = bgmStop;
      const oldGain = bgmGain;
      oldGain.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
      setTimeout(() => { oldStop(); oldGain.disconnect(); }, 1500);
    }
    bgmTheme = theme;
    bgmStop = null;
    bgmGain = null;
    if (!theme || !themes[theme]) { bgmTheme = ''; return; }
    bgmGain = ctx.createGain();
    bgmGain.gain.setValueAtTime(0, ctx.currentTime);
    bgmGain.gain.setTargetAtTime(0.9, ctx.currentTime, 0.6);
    bgmGain.connect(master);
    bgmStop = themes[theme](bgmGain);
  }

  function toggle(name) {
    if (!ensure()) return false;
    if (active[name]) {
      active[name]();
      delete active[name];
      return false;
    }
    active[name] = makers[name]();
    return true;
  }

  function isOn(name) {
    return Boolean(active[name]);
  }

  function stopAll() {
    for (const name in active) {
      active[name]();
      delete active[name];
    }
    if (ctx) bgm('');
  }

  function sfx(kind) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    switch (kind) {
      case 'coin':
        note(880, t, 0.08, 'square', 0.04);
        note(1320, t + 0.07, 0.15, 'square', 0.04);
        break;
      case 'ding':
        note(1046.5, t, 0.6, 'sine', 0.12);
        note(1318.5, t + 0.25, 0.8, 'sine', 0.12);
        break;
      case 'levelup':
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => note(f, t + i * 0.1, 0.3, 'triangle', 0.1));
        break;
      case 'bad':
        note(150, t, 0.3, 'sawtooth', 0.08);
        break;
      case 'beep':
        note(2200, t, 0.05, 'square', 0.03);
        break;
      case 'tear': {
        const src = noiseSource();
        const highpass = ctx.createBiquadFilter();
        highpass.type = 'highpass';
        highpass.frequency.value = 2000;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.25, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
        src.connect(highpass).connect(gain).connect(master);
        src.start(t);
        src.stop(t + 0.4);
        break;
      }
      default:
        note(440, t, 0.15, 'sine', 0.08);
    }
  }

  // 브라우저에 내장된 한국어 음성으로 읽는다 (기내 방송용). 음성이 없는 브라우저에서는 조용히 넘어간다.
  function speak(text) {
    if (!('speechSynthesis' in window)) return;
    const clean = text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '').trim();
    const utter = new SpeechSynthesisUtterance(clean);
    utter.lang = 'ko-KR';
    utter.rate = 0.95;
    const voice = speechSynthesis.getVoices().find((v) => v.lang && v.lang.startsWith('ko'));
    if (voice) utter.voice = voice;
    speechSynthesis.cancel();
    speechSynthesis.speak(utter);
  }

  function stopSpeaking() {
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  }

  return { toggle, isOn, stopAll, sfx, speak, stopSpeaking, bgm };
})();
