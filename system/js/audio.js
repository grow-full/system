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

  return { toggle, isOn, stopAll, sfx };
})();
