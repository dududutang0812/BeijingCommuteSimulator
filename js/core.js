'use strict';

/* =========================================================
   北京通勤模拟器 · 公共常量 / 工具 / 音效
   ========================================================= */

const VW = 480;               // 世界虚拟分辨率（低分辨率像素画布）
const VH = 270;
const SCALE = 2;              // 放大倍数：960 x 540
const SW = VW * SCALE;
const SH = VH * SCALE;

const GROUND_Y = 208;         // 人行道面（玩家脚底）
const ROAD_Y = 226;           // 马路
const WORLD_W = 3040;         // 世界宽度（虚拟像素）
const CLOCK_RATE = 0.42;      // 现实 1 秒 = 游戏 0.42 分钟

const FONT = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC",system-ui,sans-serif';
const MONO = 'ui-monospace,"SF Mono",Menlo,Consolas,monospace';

/* ---------------------------- 工具 ---------------------------- */

function R(c, x, y, w, h, col) {
  c.fillStyle = col;
  c.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
}

const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const hash = (n) => {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
};

function inRect(x, y, r) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

function roundRect(c, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + rr, y);
  c.lineTo(x + w - rr, y);
  c.quadraticCurveTo(x + w, y, x + w, y + rr);
  c.lineTo(x + w, y + h - rr);
  c.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  c.lineTo(x + rr, y + h);
  c.quadraticCurveTo(x, y + h, x, y + h - rr);
  c.lineTo(x, y + rr);
  c.quadraticCurveTo(x, y, x + rr, y);
  c.closePath();
}

function fmtClock(mins) {
  const m = Math.max(0, Math.floor(mins));
  const h = Math.floor(m / 60) % 24;
  const mm = m % 60;
  return String(h).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
}

function wrapText(c, text, maxWidth, font) {
  c.font = font;
  const lines = [];
  let cur = '';
  for (const ch of text) {
    const test = cur + ch;
    if (cur && c.measureText(test).width > maxWidth) {
      lines.push(cur);
      cur = ch;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/* ---------------------------- 音效 ---------------------------- */

const AudioSys = {
  ac: null,
  muted: false,

  init() {
    if (!this.ac) {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) this.ac = new AC();
      } catch (e) { /* 忽略 */ }
    }
    if (this.ac && this.ac.state === 'suspended') this.ac.resume();
  },

  tone(freq, dur, type = 'square', vol = 0.05, delay = 0, slideTo = null) {
    if (this.muted) return;
    this.init();
    const ac = this.ac;
    if (!ac) return;
    const t0 = ac.currentTime + delay;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  },

  noise(dur = 0.2, vol = 0.04) {
    if (this.muted) return;
    this.init();
    const ac = this.ac;
    if (!ac) return;
    const n = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, n, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ac.createBufferSource();
    const gain = ac.createGain();
    gain.gain.value = vol;
    src.buffer = buf;
    src.connect(gain);
    gain.connect(ac.destination);
    src.start();
  },

  chime() {
    this.tone(880, 0.14, 'sine', 0.045, 0);
    this.tone(1320, 0.2, 'sine', 0.035, 0.12);
  },

  door() {
    this.noise(0.16, 0.03);
    this.tone(150, 0.14, 'square', 0.04);
  },

  ring() {
    this.tone(760, 0.16, 'square', 0.045, 0);
    this.tone(980, 0.16, 'square', 0.045, 0.18);
  },

  click() {
    this.tone(620, 0.035, 'square', 0.025);
  },

  fanfare() {
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.05, i * 0.12));
  },

  failSting() {
    this.tone(220, 0.5, 'sawtooth', 0.045, 0, 80);
    this.tone(180, 0.6, 'square', 0.03, 0.15, 60);
  }
};

/* ---------------------------- 语音 ---------------------------- */

let zhVoice = null;
function loadVoices() {
  if (!('speechSynthesis' in window)) return;
  const list = window.speechSynthesis.getVoices() || [];
  zhVoice = list.find((v) => /^zh[-_]CN/i.test(v.lang))
    || list.find((v) => /^zh/i.test(v.lang))
    || null;
}
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  loadVoices();
  try { window.speechSynthesis.addEventListener('voiceschanged', loadVoices); } catch (e) { /* 忽略 */ }
}

function speakAngry(text, who) {
  if (AudioSys.muted) return;
  if (!('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    u.pitch = who === '老婆' ? 1.45 : 0.5;
    u.rate = who === '老婆' ? 1.2 : 1.05;
    u.volume = 1;
    if (zhVoice) u.voice = zhVoice;
    window.speechSynthesis.speak(u);
  } catch (e) { /* 忽略 */ }
}
