'use strict';

/* =========================================================
   北京通勤模拟器 · 主逻辑
   ========================================================= */

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const worldCanvas = document.createElement('canvas');
worldCanvas.width = VW;
worldCanvas.height = VH;
const wc = worldCanvas.getContext('2d');
wc.imageSmoothingEnabled = false;
ctx.imageSmoothingEnabled = false;

/* ---------------------------- 模式 ---------------------------- */

const MODES = {
  morning: {
    key: 'morning',
    name: '早高峰',
    objective: '09:00 前赶到公司打卡',
    startClock: 8 * 60 + 12,
    deadline: 9 * 60,
    startX: HOME_DOOR + 110,
    startDir: 1,
    goalId: 'office',
    goalDoor: OFFICE_DOOR,
    caller: '老板',
    callerRole: '部门领导',
    avatar: 'boss',
    callText: '你怎么天天迟到，明天不用来了！你被开除了！',
    winTitle: '打卡成功！',
    winSub: '09:00 之前，你站在了工位前。',
    winFlavor: '老板：「嗯，今天来得挺早。」',
    timeHint: '距打卡',
    failSub: '09:00 的打卡时间已经过了，你还在路上'
  },
  evening: {
    key: 'evening',
    name: '晚高峰',
    objective: '20:30 前赶回家',
    startClock: 19 * 60 + 45,
    deadline: 20 * 60 + 30,
    startX: OFFICE_DOOR - 110,
    startDir: -1,
    goalId: 'home',
    goalDoor: HOME_DOOR,
    caller: '老婆',
    callerRole: '家里',
    avatar: 'wife',
    callText: '你又死哪去了！这么晚还不着家！',
    winTitle: '到家了！',
    winSub: '20:30 之前，你推开了家门。',
    winFlavor: '老婆：「饭在锅里，自己热。」',
    timeHint: '距到家',
    failSub: '20:30 的到家时间已经过了，你还在路上'
  }
};

/* ---------------------------- 状态 ---------------------------- */

const game = {
  screen: 'menu',
  mode: 'morning',
  t: 0,
  clock: 0,
  deadline: 0,
  camX: 0,
  paused: false,
  panel: null,
  ride: null,
  phone: null,
  win: null,
  toasts: [],
  stats: { rides: 0, lines: [], startClock: 0 },
  menuPan: 0,
  player: {
    x: 140, z: 0, vz: 0, walk: 0, dir: 1,
    moving: false, target: null, pending: null,
    hidden: false, bike: 0, jumpLatch: false
  }
};

const ui = { hits: [], hovering: false };
const mouse = { x: -999, y: -999 };

initWorld();
game.camX = 0;

/* ---------------------------- 存档 / 流程 ---------------------------- */

function startGame(key) {
  const M = MODES[key];
  game.mode = key;
  game.screen = 'play';
  game.paused = false;
  game.clock = M.startClock;
  game.deadline = M.deadline;
  game.panel = null;
  game.ride = null;
  game.phone = null;
  game.win = null;
  game.toasts = [];
  game.stats = { rides: 0, lines: [], startClock: M.startClock };
  game.camX = clamp(M.startX - VW / 2, 0, WORLD_W - VW);

  const p = game.player;
  p.x = M.startX;
  p.z = 0; p.vz = 0; p.dir = M.startDir; p.walk = 0;
  p.moving = false; p.target = null; p.pending = null;
  p.hidden = false; p.bike = 0; p.jumpLatch = false;

  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  AudioSys.init();
  AudioSys.chime();
  addToast(M.name + '：' + M.objective, 'info', 3.6);
  addToast('点击地铁口 / 按 E 进站', 'info', 3.6);
}

function goMenu() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  game.screen = 'menu';
  game.mode = 'morning';
  game.paused = false;
  game.panel = null;
  game.ride = null;
  game.phone = null;
  game.win = null;
  game.toasts = [];
  game.menuPan = 0;
  game.camX = 0;
  game.player.hidden = false;
  game.player.moving = false;
  game.player.z = 0;
  game.player.x = HOME_DOOR + 60;
}

function triggerWin() {
  if (game.screen !== 'play') return;
  game.screen = 'win';
  game.win = { t: 0 };
  game.ride = null;
  game.panel = null;
  game.player.moving = false;
  AudioSys.fanfare();
}

function triggerFail() {
  if (game.screen !== 'play') return;
  game.screen = 'over';
  game.panel = null;
  game.ride = null;
  game.paused = false;
  game.player.hidden = false;
  game.player.moving = false;
  const M = MODES[game.mode];
  game.phone = { t: 0, typed: 0, text: M.callText, rang1: false, rang2: false, spoke: false };
  AudioSys.failSting();
  addToast('完蛋，迟到了', 'bad', 4);
}

function addMinutes(m) {
  if (game.screen !== 'play') return;
  game.clock += m;
  if (game.clock >= game.deadline && !(game.ride && game.ride.phase === 'travel')) {
    triggerFail();
  }
}

function addToast(text, kind = 'info', life = 3) {
  game.toasts.push({ text, kind, t: 0, life });
  if (game.toasts.length > 5) game.toasts.shift();
}

/* ---------------------------- 输入 ---------------------------- */

const keys = {};

function updateMouse(e) {
  const r = canvas.getBoundingClientRect();
  mouse.x = ((e.clientX - r.left) / r.width) * SW;
  mouse.y = ((e.clientY - r.top) / r.height) * SH;
}

canvas.addEventListener('pointermove', (e) => updateMouse(e));
canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  AudioSys.init();
  updateMouse(e);

  for (let i = ui.hits.length - 1; i >= 0; i--) {
    const h = ui.hits[i];
    if (inRect(mouse.x, mouse.y, h)) {
      if (h.action) h.action();
      AudioSys.click();
      return;
    }
  }

  if (game.screen !== 'play' || game.paused) return;

  if (game.ride) {
    if (game.ride.phase === 'squeeze') squeezeClick();
    return;
  }
  if (game.panel) {
    const r = game.panel.rect;
    if (!r || !inRect(mouse.x, mouse.y, r)) game.panel = null;
    return;
  }
  handleWorldClick();
});

window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' '].includes(k)) e.preventDefault();
  keys[k] = true;
  AudioSys.init();

  if (k === 'escape') {
    if (game.panel) game.panel = null;
    else if (game.screen === 'play') game.paused = !game.paused;
    return;
  }
  if (k === 'm') {
    toggleMute();
    return;
  }
  if (k === ' ') {
    if (game.ride && game.ride.phase === 'squeeze') squeezeClick();
    return;
  }
  if (game.screen === 'play' && !game.paused && !game.ride && !game.panel) {
    if (k === 'e') {
      const near = nearestSpot(62);
      if (near) interact(near);
    } else if (k === 's') {
      const near = nearestSpot(62);
      if (near && near.type === 'station') interact(near);
    }
  }
  if ((k === 'r') && (game.screen === 'over' || game.screen === 'win')) {
    startGame(game.mode);
  }
});

window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
window.addEventListener('blur', () => {
  for (const k in keys) keys[k] = false;
});

function toggleMute() {
  AudioSys.muted = !AudioSys.muted;
  if (AudioSys.muted && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  addToast(AudioSys.muted ? '已静音' : '声音已开启', 'info', 1.6);
}

/* ---------------------------- 交互 ---------------------------- */

function nearestSpot(maxDist) {
  const p = game.player;
  let best = null;
  let bd = maxDist;
  for (const s of SPOTS) {
    const d = Math.abs(s.x - p.x);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

function handleWorldClick() {
  const p = game.player;
  const wx = mouse.x / SCALE + game.camX;

  let clicked = null;
  let bd = 34;
  for (const s of SPOTS) {
    const d = Math.abs(s.x - wx);
    if (d < bd) { bd = d; clicked = s; }
  }

  if (clicked) {
    if (zoneOf(clicked.x) !== zoneOf(p.x)) {
      addToast('中间隔着环路围挡，得先坐地铁或公交过去', 'warn');
      return;
    }
    if (Math.abs(clicked.x - p.x) < 62) interact(clicked);
    else walkToSpot(clicked);
    return;
  }

  const tx = clamp(wx, 20, WORLD_W - 20);
  if (zoneOf(tx) !== zoneOf(p.x)) {
    addToast('前面是围挡，此路不通', 'warn');
    return;
  }
  p.target = tx;
  p.pending = null;
}

function walkToSpot(spot) {
  const p = game.player;
  const off = p.x < spot.x ? -42 : 42;
  p.target = spot.x + off;
  p.pending = spot;
}

function interact(spot) {
  const M = MODES[game.mode];
  const p = game.player;
  if (Math.abs(spot.x - p.x) > 70) { walkToSpot(spot); return; }

  if (spot.type === 'station') {
    openStationPanel(spot.id);
  } else if (spot.type === 'bus') {
    openBusPanel(spot);
  } else if (spot.type === 'door') {
    if (spot.id === M.goalId) {
      triggerWin();
    } else {
      addToast(spot.id === 'office' ? '现在不是上班时间，公司黑着灯' : '还不到回家的时候，先赶路吧', 'info');
    }
  } else if (spot.type === 'bike') {
    if (p.bike > 0) { addToast('已经在骑了', 'info', 1.4); return; }
    p.bike = 10;
    addMinutes(1);
    addToast('扫码骑车 +速度（10 秒）', 'good');
  }
}

function crowdLevel(stationId) {
  const st = STATIONS[stationId];
  const base = (st.major ? 2.4 : 1.4) * (game.mode === 'evening' ? 1.55 : 1);
  return clamp(Math.round(base + rand(-0.5, 0.6)), 1, 4);
}

function openStationPanel(id) {
  const st = STATIONS[id];
  const opts = optionsFor(id).map((o) => ({ ...o, crowd: crowdLevel(id) }));
  game.panel = { type: 'station', id, opts };
  AudioSys.chime();
}

function openBusPanel(spot) {
  game.panel = { type: 'bus', to: spot.to, from: spot.id, rect: null };
  AudioSys.chime();
}

/* ---------------------------- 乘车 ---------------------------- */

function startMetroRide(o, stationId) {
  const st = STATIONS[stationId];
  const q = clamp(Math.round((o.crowd || 2) * rand(0.55, 0.9)), 1, 5);
  game.panel = null;
  addMinutes(q);
  if (game.screen !== 'play') return;
  addToast('「' + st.name + '」限流排队 +' + q + ' 分钟', 'warn');

  game.ride = {
    kind: 'metro',
    lineId: o.line,
    lineName: LINES[o.line].name,
    color: LINES[o.line].color,
    from: stationId,
    fromName: st.name,
    to: o.to,
    toName: STATIONS[o.to].name,
    toX: STATIONS[o.to].x,
    cost: o.min,
    phase: 'queue',
    t: 0,
    dur: rand(1.5, 2.3),
    prog: 0,
    clicks: 0,
    window: 3.4,
    delay: 0,
    delayMsg: null,
    queueMin: q
  };
  game.player.hidden = true;
  game.stats.rides++;
  if (!game.stats.lines.includes(LINES[o.line].name)) game.stats.lines.push(LINES[o.line].name);
  AudioSys.chime();
}

function startBusRide(p) {
  const destName = p.to === 'E' ? '国贸' : '天通苑北';
  const toX = p.to === 'E' ? BUS_E : BUS_A;
  game.panel = null;
  addMinutes(3);
  if (game.screen !== 'play') return;
  addToast('等公交 +3 分钟', 'warn');

  game.ride = {
    kind: 'bus',
    lineId: 'bus',
    lineName: '快3路',
    color: '#4a9e6b',
    from: p.from,
    fromName: '公交站',
    to: p.to,
    toName: destName,
    toX,
    cost: 32,
    phase: 'queue',
    t: 0,
    dur: 1.6,
    prog: 0,
    clicks: 0,
    window: 3.4,
    delay: 0,
    delayMsg: null,
    queueMin: 3
  };
  game.player.hidden = true;
  game.stats.rides++;
  if (!game.stats.lines.includes('快3路')) game.stats.lines.push('快3路');
  AudioSys.chime();
}

function updateRide(dt) {
  const r = game.ride;
  if (!r) return;
  r.t += dt;

  if (r.phase === 'queue') {
    if (r.t >= r.dur) {
      r.t = 0;
      if (r.kind === 'metro') {
        r.phase = 'squeeze';
        r.prog = 0;
        r.clicks = 0;
      } else {
        boardRide();
      }
    }
  } else if (r.phase === 'squeeze') {
    r.prog = Math.max(0, r.prog - dt * 7);
    if (r.prog >= 100) {
      r.prog = 100;
      addToast('挤上去了！', 'good', 2);
      boardRide();
    } else if (r.t >= r.window) {
      addMinutes(2);
      if (game.screen !== 'play') return;
      addToast('没挤上去…等下一班 +2 分钟', 'bad');
      boardRide();
    }
  } else if (r.phase === 'travel') {
    if (r.t >= (r.kind === 'bus' ? 3.0 : 2.2)) arriveRide();
  }
}

function boardRide() {
  const r = game.ride;
  if (!r) return;
  r.phase = 'travel';
  r.t = 0;
  addMinutes(r.cost);
  if (game.screen !== 'play') return;

  if (r.kind === 'metro' && Math.random() < 0.18) {
    r.delay = randInt(2, 5);
    r.delayMsg = '列车临时停车';
  }
  if (r.kind === 'bus' && Math.random() < (game.mode === 'evening' ? 0.72 : 0.55)) {
    r.delay = randInt(6, 15);
    r.delayMsg = '堵在五环上';
  }
  if (r.delay) addToast(r.delayMsg + ' +' + r.delay + ' 分钟', 'bad', 3.4);
  AudioSys.door();
}

function arriveRide() {
  const r = game.ride;
  game.ride = null;
  const p = game.player;
  p.hidden = false;
  p.x = r.toX - 44;
  p.z = 0;
  p.vz = 0;
  p.dir = 1;
  p.target = null;
  p.pending = null;
  p.moving = false;
  game.camX = clamp(p.x - VW / 2, 0, WORLD_W - VW);

  if (r.delay) addMinutes(r.delay);
  if (game.screen !== 'play') return;

  addToast('到达「' + r.toName + '」', 'info', 2.6);
  const M = MODES[game.mode];
  if (Math.abs(r.toX - M.goalDoor) < 420) {
    addToast('目标就在前面，走过去！', 'good', 2.8);
  }
  if (r.kind === 'bus') addToast('公交车摇摇晃晃到站了', 'info', 2.4);
}

function squeezeClick() {
  const r = game.ride;
  if (!r || r.phase !== 'squeeze') return;
  r.prog = Math.min(120, r.prog + 13);
  r.clicks++;
  AudioSys.tone(300 + Math.random() * 220, 0.045, 'square', 0.03);
  game.shake = Math.min(4, game.shake + 1);
}

/* ---------------------------- 更新 ---------------------------- */

function update(dt) {
  game.t += dt;
  game.shake = Math.max(0, game.shake - dt * 8);
  updateWorld(dt);
  for (const t of game.toasts) t.t += dt;
  game.toasts = game.toasts.filter((t) => t.t < t.life);

  if (game.screen === 'menu') {
    game.menuPan += dt * 0.07;
    const k = (Math.sin(game.menuPan - Math.PI / 2) + 1) / 2;
    game.camX = k * (WORLD_W - VW);
    game.player.walk += dt;
    return;
  }

  if (game.screen === 'play') {
    if (!game.paused) {
      game.clock += dt * CLOCK_RATE;
      if (game.clock >= game.deadline && !(game.ride && game.ride.phase === 'travel')) {
        triggerFail();
      }
      updatePlayer(dt);
      if (game.ride) updateRide(dt);
    }
    updateCamera(dt);
  }

  if (game.screen === 'over' && game.phone) updatePhone(dt);
  if (game.screen === 'win' && game.win) game.win.t += dt;
}

function updatePlayer(dt) {
  const p = game.player;
  if (game.ride || game.panel) { p.moving = false; return; }
  if (p.hidden) p.hidden = false;

  let ax = 0;
  if (keys['a'] || keys['arrowleft']) ax -= 1;
  if (keys['d'] || keys['arrowright']) ax += 1;

  if (ax !== 0) {
    p.dir = ax;
    p.target = null;
    p.pending = null;
  } else if (p.target !== null) {
    const dx = p.target - p.x;
    if (Math.abs(dx) <= 2) {
      p.x = p.target;
      p.target = null;
      const pend = p.pending;
      p.pending = null;
      if (pend) interact(pend);
    } else {
      ax = Math.sign(dx);
      p.dir = ax;
    }
  }

  if (ax !== 0) {
    const speed = p.bike > 0 ? 108 : 62;
    movePlayer(ax * speed * dt);
    p.moving = true;
    p.walk += dt * (p.bike > 0 ? 1.6 : 1);
  } else {
    p.moving = false;
  }

  if ((keys['w'] || keys['arrowup']) && p.z === 0 && !p.jumpLatch) {
    p.vz = 132;
    p.jumpLatch = true;
    AudioSys.tone(300, 0.06, 'square', 0.018, 0, 500);
  }
  if (!keys['w'] && !keys['arrowup']) p.jumpLatch = false;

  if (p.z > 0 || p.vz !== 0) {
    p.z += p.vz * dt;
    p.vz -= 480 * dt;
    if (p.z <= 0) { p.z = 0; p.vz = 0; }
  }

  if (p.bike > 0) {
    p.bike -= dt;
    if (p.bike <= 0) { p.bike = 0; addToast('共享单车到期，已还车', 'info', 2); }
  }
}

function movePlayer(dx) {
  const p = game.player;
  const old = p.x;
  let nx = clamp(old + dx, 16, WORLD_W - 16);
  for (const b of BARRIERS) {
    if (old <= b - 10 && nx > b - 12) nx = b - 12;
    else if (old >= b + 10 && nx < b + 12) nx = b + 12;
  }
  if (nx === old && dx !== 0) {
    p.target = null;
    p.pending = null;
    if (!game._blockToast || game.t - game._blockToast > 1.5) {
      addToast('前面封路了，只能坐地铁或公交', 'warn');
      game._blockToast = game.t;
    }
  }
  p.x = nx;
}

function updateCamera(dt) {
  const target = clamp(game.player.x - VW / 2, 0, WORLD_W - VW);
  game.camX += (target - game.camX) * Math.min(1, dt * 7);
}

function updatePhone(dt) {
  const ph = game.phone;
  if (!ph) return;
  ph.t += dt;

  if (!ph.rang1 && ph.t > 0.15) { ph.rang1 = true; AudioSys.ring(); }
  if (!ph.rang2 && ph.t > 0.9) { ph.rang2 = true; AudioSys.ring(); }
  if (!ph.spoke && ph.t > 1.3) {
    ph.spoke = true;
    speakAngry(ph.text, MODES[game.mode].caller);
  }
  if (ph.t > 1.3) {
    ph.typed = Math.min(ph.text.length, ph.typed + dt * 15);
  }
}

/* ---------------------------- 渲染 ---------------------------- */

function render() {
  ui.hits.length = 0;
  ui.hovering = false;

  drawWorld(game);

  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, SW, SH);
  ctx.drawImage(worldCanvas, 0, 0, VW, VH, 0, 0, SW, SH);

  if (game.shake > 0) {
    const sx = (Math.random() - 0.5) * game.shake * 2;
    const sy = (Math.random() - 0.5) * game.shake * 2;
    ctx.save();
    ctx.translate(sx, sy);
  }

  if (game.screen === 'play' && !game.ride && !game.panel && !game.paused) {
    drawWorldLabels();
  }

  if (game.ride) drawRide();
  if (game.panel) drawPanel();
  if (game.screen === 'play') drawHUD();
  if (game.paused && game.screen === 'play') drawPause();
  if (!game.panel && !game.paused) drawToasts();

  if (game.shake > 0) ctx.restore();

  if (game.phone) drawPhone();
  if (game.win) drawWin();
  if (game.screen === 'menu') drawMenu();

  canvas.style.cursor = ui.hovering ? 'pointer' : 'default';
}

/* ---------------------------- 世界内标签 ---------------------------- */

function drawWorldLabels() {
  const M = MODES[game.mode];
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const s of SPOTS) {
    const sx = (s.x - game.camX) * SCALE;
    if (sx < -120 || sx > SW + 120) continue;

    if (s.type === 'station') {
      const st = STATIONS[s.id];
      const sy = (GROUND_Y - 55) * SCALE;
      st.lines.forEach((lid, i) => {
        ctx.fillStyle = LINES[lid].color;
        ctx.fillRect(sx - 54 + i * 10, sy - 5, 7, 10);
      });
      ctx.font = '700 12px ' + FONT;
      ctx.fillStyle = '#ffe9b0';
      ctx.fillText(st.name, sx + 4, sy);
    } else if (s.type === 'bus') {
      const sy = (GROUND_Y - 50) * SCALE;
      ctx.font = '700 12px ' + FONT;
      ctx.fillStyle = '#d8ecff';
      ctx.fillText('快3路', sx, sy);
    } else if (s.type === 'door') {
      const isGoal = s.id === M.goalId;
      const sy = (GROUND_Y - 58) * SCALE;
      ctx.font = '700 12px ' + FONT;
      const label = s.id === 'office' ? (isGoal ? '公司 · 打卡' : '公司') : '家';
      const tw = ctx.measureText(label).width + 18;
      ctx.fillStyle = 'rgba(9,13,22,0.85)';
      roundRect(ctx, sx - tw / 2, sy - 11, tw, 22, 4);
      ctx.fill();
      ctx.strokeStyle = isGoal ? 'rgba(255,217,121,0.65)' : 'rgba(120,140,170,0.4)';
      ctx.lineWidth = 1;
      roundRect(ctx, sx - tw / 2 + 0.5, sy - 10.5, tw - 1, 21, 4);
      ctx.stroke();
      ctx.fillStyle = isGoal ? '#ffd979' : '#cfd8e8';
      ctx.fillText(label, sx, sy);
      if (isGoal) {
        const bob = Math.sin(game.t * 4) * 4;
        const ax = sx;
        const ay = sy - 30 + bob;
        ctx.fillStyle = '#ffd979';
        ctx.beginPath();
        ctx.moveTo(ax, ay + 12);
        ctx.lineTo(ax - 7, ay + 1);
        ctx.lineTo(ax + 7, ay + 1);
        ctx.closePath();
        ctx.fill();
        ctx.fillRect(ax - 2, ay - 8, 4, 10);
      }
    }
  }

  const near = nearestSpot(62);
  if (near) {
    const px = (game.player.x - game.camX) * SCALE;
    const py = (GROUND_Y - game.player.z) * SCALE - 96;
    const label = near.type === 'station' ? '进站'
      : near.type === 'bus' ? '坐公交'
      : near.type === 'door' ? '进入' : '骑车';
    drawBubble(px, py, 'E / 点击 · ' + label);
  }
}

function drawBubble(cx, cy, text) {
  ctx.font = '600 12px ' + FONT;
  const w = ctx.measureText(text).width + 22;
  const h = 26;
  const x = cx - w / 2;
  const y = cy - h / 2;
  ctx.fillStyle = 'rgba(9,13,22,0.88)';
  roundRect(ctx, x, y, w, h, 6);
  ctx.fill();
  ctx.strokeStyle = '#7d8aa3';
  ctx.lineWidth = 1;
  roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 6);
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f2e9d0';
  ctx.fillText(text, cx, cy + 1);
  ctx.fillStyle = 'rgba(9,13,22,0.88)';
  ctx.beginPath();
  ctx.moveTo(cx - 4, y + h);
  ctx.lineTo(cx + 4, y + h);
  ctx.lineTo(cx, y + h + 5);
  ctx.closePath();
  ctx.fill();
}

/* ---------------------------- HUD ---------------------------- */

function drawHUD() {
  const M = MODES[game.mode];
  const remain = Math.max(0, game.deadline - game.clock);

  // 左上：目标
  const ox = 16, oy = 14, ow = 306, oh = 56;
  ctx.fillStyle = 'rgba(9,12,20,0.74)';
  ctx.fillRect(ox, oy, ow, oh);
  ctx.strokeStyle = 'rgba(120,140,170,0.45)';
  ctx.lineWidth = 1;
  ctx.strokeRect(ox + 0.5, oy + 0.5, ow - 1, oh - 1);

  ctx.fillStyle = game.mode === 'morning' ? '#c8342c' : '#4a5bb0';
  ctx.fillRect(ox + 10, oy + 10, 58, 20);
  ctx.font = '700 12px ' + FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.fillText(M.name, ox + 39, oy + 21);

  ctx.textAlign = 'left';
  ctx.font = '700 14px ' + FONT;
  ctx.fillStyle = '#f2e9d0';
  ctx.fillText(M.objective, ox + 78, oy + 21);
  ctx.font = '500 11px ' + FONT;
  ctx.fillStyle = '#8b97ad';
  ctx.fillText('点击地铁口进站 · 围挡只能坐车通过', ox + 12, oy + 43);

  // 中间：时钟
  const cw = 286, ch = 68;
  const cx = SW / 2 - cw / 2, cy = 10;
  ctx.fillStyle = 'rgba(9,12,20,0.8)';
  ctx.fillRect(cx, cy, cw, ch);
  ctx.strokeStyle = '#3d4a63';
  ctx.lineWidth = 1;
  ctx.strokeRect(cx + 0.5, cy + 0.5, cw - 1, ch - 1);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 28px ' + MONO;
  ctx.fillStyle = remain < 8 ? '#ff8a80' : '#f4ecd6';
  ctx.fillText(fmtClock(game.clock), SW / 2, cy + 28);

  ctx.font = '600 12px ' + FONT;
  ctx.fillStyle = remain < 8 ? '#ff8a80' : '#9fb4d0';
  ctx.fillText(M.timeHint + ' ' + Math.ceil(remain) + ' 分钟', SW / 2, cy + 48);

  const total = Math.max(1, game.deadline - M.startClock);
  const prog = clamp((game.clock - M.startClock) / total, 0, 1);
  ctx.fillStyle = '#1a2233';
  ctx.fillRect(cx + 18, cy + 58, cw - 36, 4);
  ctx.fillStyle = remain < 8 ? '#e8443a' : '#5fc98a';
  ctx.fillRect(cx + 18, cy + 58, (cw - 36) * prog, 4);

  // 右上：按钮
  drawButton(SW - 98, 14, 38, 34, '音', toggleMute, { font: '700 13px ' + FONT });
  drawButton(SW - 52, 14, 38, 34, '≡', () => { game.paused = !game.paused; }, { font: '700 16px ' + FONT });

  // 底部提示
  if (!game.ride) {
    ctx.fillStyle = 'rgba(6,9,15,0.42)';
    ctx.fillRect(0, SH - 30, SW, 30);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = '500 11px ' + FONT;
    ctx.fillStyle = 'rgba(214,226,242,0.62)';
    ctx.fillText('A / D 移动　W 跳跃　S 进站　鼠标点击站点和按钮　E 互动　ESC 暂停', 18, SH - 15);
  }
}

/* ---------------------------- 面板 ---------------------------- */

function drawPanel() {
  const p = game.panel;
  if (p.type === 'station') drawStationPanel(p);
  else if (p.type === 'bus') drawBusPanel(p);
}

function drawStationPanel(p) {
  const st = STATIONS[p.id];
  const M = MODES[game.mode];
  const opts = p.opts;
  const rowH = 58;
  const w = 660;
  const h = 128 + Math.max(1, opts.length) * rowH + 84;
  const x = (SW - w) / 2;
  const y = (SH - h) / 2;
  p.rect = { x, y, w, h };

  ctx.fillStyle = 'rgba(4,6,12,0.62)';
  ctx.fillRect(0, 0, SW, SH);

  ctx.fillStyle = 'rgba(10,14,23,0.97)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#4a5a78';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  ctx.fillStyle = st.lines.length ? LINES[st.lines[0]].color : '#3fa9dc';
  ctx.fillRect(x, y, w, 3);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = '800 26px ' + FONT;
  ctx.fillStyle = '#f4ecd6';
  ctx.fillText(st.name, x + 24, y + 46);
  const nameW = ctx.measureText(st.name).width;

  let bx = x + 24 + nameW + 14;
  for (const lid of st.lines) bx += lineBadge(bx, y + 28, lid) + 6;

  ctx.textAlign = 'right';
  ctx.font = '700 20px ' + MONO;
  ctx.fillStyle = '#9fe0ff';
  ctx.fillText(fmtClock(game.clock), x + w - 54, y + 40);
  ctx.font = '500 12px ' + FONT;
  ctx.fillStyle = '#8b97ad';
  ctx.fillText(M.timeHint + ' ' + Math.ceil(Math.max(0, game.deadline - game.clock)) + ' 分钟', x + w - 54, y + 60);

  ctx.textAlign = 'left';
  ctx.font = '500 12px ' + FONT;
  ctx.fillStyle = '#8b97ad';
  ctx.fillText('选择一条线路 · 进站会限流排队，车门要关时狂点鼠标挤上去', x + 24, y + 84);

  const startY = y + 102;
  if (opts.length === 0) {
    ctx.fillStyle = '#e8a33d';
    ctx.font = '700 15px ' + FONT;
    ctx.fillText('这个站暂时没有可乘坐的线路方向…', x + 24, startY + 32);
  }
  opts.forEach((o, i) => {
    drawLineRow(x + 22, startY + i * rowH, w - 44, rowH - 10, o, () => startMetroRide(o, p.id));
  });

  drawRouteStrip(x + 34, startY + Math.max(1, opts.length) * rowH + 34, w - 68, p.id);

  // 关闭
  const closeX = x + w - 42, closeY = y + 12;
  const hover = inRect(mouse.x, mouse.y, { x: closeX, y: closeY, w: 26, h: 26 });
  if (hover) ui.hovering = true;
  ctx.fillStyle = hover ? '#33456a' : '#2a3550';
  ctx.fillRect(closeX, closeY, 26, 26);
  ctx.strokeStyle = '#5b6a86';
  ctx.lineWidth = 1;
  ctx.strokeRect(closeX + 0.5, closeY + 0.5, 25, 25);
  ctx.fillStyle = '#f2e9d0';
  ctx.font = '700 15px ' + FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('×', closeX + 13, closeY + 14);
  ui.hits.push({ x: closeX, y: closeY, w: 26, h: 26, action: () => { game.panel = null; } });
}

function drawRouteStrip(x, y, w, currentId) {
  const ids = ['ttyb', 'lsq', 'wjx', 'syj', 'gm'];
  const gap = (w - 60) / (ids.length - 1);
  const goalId = MODES[game.mode].goalId === 'office' ? 'gm' : 'ttyb';

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = '600 11px ' + FONT;
  ctx.fillStyle = '#8b97ad';
  ctx.fillText('线路图', x - 8, y - 16);

  const segLines = ['5', '13', '13', '10'];
  for (let i = 0; i < ids.length - 1; i++) {
    ctx.fillStyle = LINES[segLines[i]].color;
    ctx.fillRect(x + 30 + i * gap, y + 22, gap, 5);
  }

  ids.forEach((id, i) => {
    const px = x + 30 + i * gap;
    const isCur = id === currentId;
    const isGoal = id === goalId;
    ctx.fillStyle = isCur ? '#ffd979' : '#0f1520';
    ctx.beginPath();
    ctx.arc(px, y + 24.5, isCur ? 7 : 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = isCur ? '#ffd979' : '#8b97ad';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px, y + 24.5, isCur ? 7 : 5, 0, Math.PI * 2);
    ctx.stroke();
    if (isCur) {
      ctx.fillStyle = '#ffd979';
      ctx.beginPath();
      ctx.arc(px, y + 24.5, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '600 10px ' + FONT;
    ctx.fillStyle = isCur ? '#ffd979' : '#a9b6ca';
    ctx.fillText(STATIONS[id].name, px, y + 48);
    if (isGoal) {
      ctx.fillStyle = '#9fe8a8';
      ctx.font = '700 12px ' + FONT;
      ctx.fillText('★ 目标', px, y - 2);
    }
  });
}

function drawLineRow(x, y, w, h, o, action) {
  const line = LINES[o.line];
  const hover = inRect(mouse.x, mouse.y, { x, y, w, h });
  if (hover) ui.hovering = true;

  ctx.fillStyle = hover ? '#202c42' : '#141b29';
  ctx.fillRect(x, y, w, h);
  if (hover) {
    ctx.strokeStyle = '#ffd979';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  }
  ctx.fillStyle = line.color;
  ctx.fillRect(x, y, 6, h);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 12px ' + FONT;
  ctx.fillStyle = line.color;
  roundRect(ctx, x + 18, y + h / 2 - 10, 54, 20, 3);
  ctx.fill();
  ctx.fillStyle = '#0d1119';
  ctx.fillText(line.name, x + 45, y + h / 2 + 1);

  ctx.textAlign = 'left';
  ctx.font = '700 17px ' + FONT;
  ctx.fillStyle = '#f2e9d0';
  ctx.fillText('往 ' + STATIONS[o.to].name, x + 86, y + h / 2 + 1);

  ctx.textAlign = 'right';
  ctx.font = '700 15px ' + MONO;
  ctx.fillStyle = '#9fe0ff';
  ctx.fillText(o.min + ' 分钟', x + w - 16, y + h / 2 - 7);
  ctx.font = '500 11px ' + FONT;
  ctx.fillStyle = '#8b97ad';
  ctx.fillText('拥挤 ' + '●'.repeat(o.crowd) + '○'.repeat(4 - o.crowd), x + w - 16, y + h / 2 + 11);

  ui.hits.push({ x, y, w, h, action });
}

function drawBusPanel(p) {
  const destName = p.to === 'E' ? '国贸' : '天通苑北';
  const w = 580, h = 306;
  const x = (SW - w) / 2;
  const y = (SH - h) / 2;
  p.rect = { x, y, w, h };

  ctx.fillStyle = 'rgba(4,6,12,0.62)';
  ctx.fillRect(0, 0, SW, SH);
  ctx.fillStyle = 'rgba(10,14,23,0.97)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#4a5a78';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  ctx.fillStyle = '#4a9e6b';
  ctx.fillRect(x, y, w, 3);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = '800 24px ' + FONT;
  ctx.fillStyle = '#f4ecd6';
  ctx.fillText('快3路 公交站', x + 24, y + 44);
  ctx.font = '500 12px ' + FONT;
  ctx.fillStyle = '#8b97ad';
  ctx.fillText('直达 ' + destName + ' · 不用换乘 · 但地面交通说不准', x + 24, y + 66);

  const rx = x + 24, ry = y + 88, rw = w - 48, rh = 78;
  const hover = inRect(mouse.x, mouse.y, { x: rx, y: ry, w: rw, h: rh });
  if (hover) ui.hovering = true;
  ctx.fillStyle = hover ? '#20342a' : '#132018';
  ctx.fillRect(rx, ry, rw, rh);
  if (hover) {
    ctx.strokeStyle = '#9fe8a8';
    ctx.lineWidth = 2;
    ctx.strokeRect(rx + 1, ry + 1, rw - 2, rh - 2);
  }
  ctx.fillStyle = '#4a9e6b';
  ctx.fillRect(rx, ry, 6, rh);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 11px ' + FONT;
  ctx.fillStyle = '#4a9e6b';
  roundRect(ctx, rx + 18, ry + 15, 46, 20, 3);
  ctx.fill();
  ctx.fillStyle = '#0d1119';
  ctx.fillText('快3路', rx + 41, ry + 26);

  ctx.textAlign = 'left';
  ctx.font = '800 20px ' + FONT;
  ctx.fillStyle = '#f2e9d0';
  ctx.fillText('→ ' + destName, rx + 78, ry + 26);

  ctx.textAlign = 'right';
  ctx.font = '700 16px ' + MONO;
  ctx.fillStyle = '#9fe0ff';
  ctx.fillText('约 32 分钟', rx + rw - 16, ry + 22);

  ctx.textAlign = 'left';
  ctx.font = '500 12px ' + FONT;
  ctx.fillStyle = '#ffcf6b';
  ctx.fillText('⚠ 走五环快速路，可能堵车 +6~15 分钟', rx + 18, ry + 54);

  ctx.textAlign = 'left';
  ctx.font = '500 12px ' + FONT;
  ctx.fillStyle = '#8b97ad';
  ctx.fillText('提示：地铁虽然要换乘，但时间更稳。', x + 24, y + 194);

  drawButton(x + 24, y + 210, (w - 60) / 2, 46, '上车（等车 +3 分钟）', () => startBusRide(p), {
    bg: '#173024', hoverBg: '#1f4633', border: '#4a9e6b', color: '#d8ffe4', font: '700 14px ' + FONT
  });
  drawButton(x + 24 + (w - 60) / 2 + 12, y + 210, (w - 60) / 2, 46, '算了，去坐地铁', () => { game.panel = null; }, {
    font: '700 14px ' + FONT
  });

  const closeX = x + w - 42, closeY = y + 12;
  const hov2 = inRect(mouse.x, mouse.y, { x: closeX, y: closeY, w: 26, h: 26 });
  if (hov2) ui.hovering = true;
  ctx.fillStyle = hov2 ? '#33456a' : '#2a3550';
  ctx.fillRect(closeX, closeY, 26, 26);
  ctx.strokeStyle = '#5b6a86';
  ctx.lineWidth = 1;
  ctx.strokeRect(closeX + 0.5, closeY + 0.5, 25, 25);
  ctx.fillStyle = '#f2e9d0';
  ctx.font = '700 15px ' + FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('×', closeX + 13, closeY + 14);
  ui.hits.push({ x: closeX, y: closeY, w: 26, h: 26, action: () => { game.panel = null; } });
}

/* ---------------------------- 按钮 / 通用控件 ---------------------------- */

function drawButton(x, y, w, h, label, action, opt = {}) {
  const hover = inRect(mouse.x, mouse.y, { x, y, w, h });
  if (hover) ui.hovering = true;
  ctx.fillStyle = hover ? (opt.hoverBg || '#2b3a55') : (opt.bg || '#1a2333');
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = hover ? '#ffd979' : (opt.border || '#4a5a78');
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = opt.color || '#f2e9d0';
  ctx.font = opt.font || ('700 16px ' + FONT);
  ctx.fillText(label, x + w / 2, y + h / 2 + 1);
  ui.hits.push({ x, y, w, h, action });
}

function lineBadge(x, y, lid) {
  const line = LINES[lid];
  const w = 46, h = 18;
  ctx.font = '700 11px ' + FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = line.color;
  roundRect(ctx, x, y, w, h, 3);
  ctx.fill();
  ctx.fillStyle = '#0d1119';
  ctx.fillText(line.name, x + w / 2, y + h / 2 + 1);
  return w;
}

function bar(x, y, w, h, k, col) {
  ctx.fillStyle = '#141b29';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#3d4a63';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.fillStyle = col;
  ctx.fillRect(x + 2, y + 2, (w - 4) * clamp(k, 0, 1), h - 4);
}

/* ---------------------------- 乘车画面 ---------------------------- */

function drawRide() {
  const r = game.ride;
  ctx.fillStyle = 'rgba(5,7,13,0.9)';
  ctx.fillRect(0, 0, SW, SH);

  if (r.phase === 'queue') drawQueueScene(r);
  else if (r.phase === 'squeeze') drawSqueezeScene(r);
  else drawTravelScene(r);
}

function drawQueueScene(r) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.font = '500 13px ' + FONT;
  ctx.fillStyle = '#7f8ca4';
  ctx.fillText('站厅 · 限流围栏', SW / 2, 118);

  ctx.font = '800 34px ' + FONT;
  ctx.fillStyle = '#f4ecd6';
  ctx.fillText(r.fromName, SW / 2, 158);

  ctx.font = '500 14px ' + FONT;
  ctx.fillStyle = '#a9b6ca';
  ctx.fillText('队伍一眼望不到头，前面全是人头…', SW / 2, 192);

  // 闸机
  for (let i = 0; i < 4; i++) {
    const gx = SW / 2 - 200 + i * 130;
    ctx.fillStyle = '#232d3f';
    ctx.fillRect(gx, 292, 28, 76);
    ctx.fillStyle = '#3b4a63';
    ctx.fillRect(gx, 292, 28, 4);
    ctx.fillStyle = i % 2 ? '#4a9e6b' : '#e8a33d';
    ctx.fillRect(gx + 8, 302, 12, 4);
  }

  // 站台地面
  ctx.fillStyle = '#0c121c';
  ctx.fillRect(0, 430, SW, 110);
  ctx.fillStyle = r.color;
  ctx.fillRect(0, 430, SW, 3);

  // 人群（后排先画）
  const cols = ['#39445a', '#4a3f52', '#3b4a45', '#4a4437', '#3e3a4a'];
  for (let row = 2; row >= 0; row--) {
    for (let i = 0; i < 18; i++) {
      const px = 46 + i * 52 + row * 22 + Math.sin(game.t * 1.6 + i + row) * 2;
      const feet = 428 - row * 24;
      ctx.fillStyle = cols[(i + row) % cols.length];
      ctx.fillRect(px - 7, feet - 30, 14, 30);
      ctx.fillRect(px - 6, feet - 42, 12, 12);
      ctx.fillStyle = '#20242e';
      ctx.fillRect(px - 7, feet - 3, 5, 3);
      ctx.fillRect(px + 2, feet - 3, 5, 3);
    }
  }

  bar(SW / 2 - 150, 476, 300, 12, r.t / r.dur, '#ffd979');
  ctx.font = '700 13px ' + FONT;
  ctx.fillStyle = '#ffd979';
  ctx.fillText('排队中 · 已计入 +' + r.queueMin + ' 分钟', SW / 2, 504);

  ctx.font = '500 12px ' + FONT;
  ctx.fillStyle = '#7f8ca4';
  ctx.fillText('下一班车马上进站…', SW / 2, 526);
}

function drawTrainDoor(x, y, w, h, col) {
  ctx.fillStyle = '#0b111c';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#182335';
  ctx.fillRect(x + 4, y + 4, w / 2 - 6, h - 8);
  ctx.fillRect(x + w / 2 + 2, y + 4, w / 2 - 6, h - 8);
  ctx.fillStyle = 'rgba(150,200,240,0.20)';
  ctx.fillRect(x + 10, y + 14, w / 2 - 18, 52);
  ctx.fillRect(x + w / 2 + 8, y + 14, w / 2 - 18, 52);
  ctx.fillStyle = col;
  ctx.fillRect(x + w / 2 - 1, y + 6, 2, h - 12);
  ctx.fillStyle = '#8b97ad';
  ctx.fillRect(x + 6, y + 80, w - 12, 3);
  ctx.strokeStyle = col;
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
}

function drawSqueezeScene(r) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.font = '800 26px ' + FONT;
  ctx.fillStyle = '#ffd979';
  ctx.fillText('车门要关了！', SW / 2, 128);

  ctx.font = '500 13px ' + FONT;
  ctx.fillStyle = '#a9b6ca';
  ctx.fillText(r.lineName + ' · 往 ' + r.toName + ' · 再挤不上去就等下一班', SW / 2, 158);

  // 车厢
  const cx = SW / 2;
  const carX = cx - 330, carY = 182, carW = 660, carH = 196;
  ctx.fillStyle = '#141b29';
  ctx.fillRect(carX, carY, carW, carH);
  ctx.fillStyle = r.color;
  ctx.fillRect(carX, carY, carW, 4);
  ctx.fillRect(carX, carY + carH - 4, carW, 4);

  // 两侧车门
  drawTrainDoor(carX + 34, carY + 24, 96, 148, r.color);
  drawTrainDoor(carX + carW - 130, carY + 24, 96, 148, r.color);

  // 中间打开的车厢
  ctx.fillStyle = 'rgba(255,235,190,0.10)';
  ctx.fillRect(cx - 200, carY + 24, 400, 148);
  ctx.fillStyle = 'rgba(255,240,200,0.22)';
  ctx.fillRect(cx - 200, carY + 8, 400, 10);
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = 'rgba(255,240,200,0.30)';
    ctx.fillRect(cx - 170 + i * 140, carY + 14, 60, 5);
  }
  // 扶手杆
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = 'rgba(185,198,220,0.22)';
    ctx.fillRect(cx - 176 + i * 88, carY + 26, 3, 142);
  }
  ctx.fillStyle = 'rgba(185,198,220,0.18)';
  ctx.fillRect(cx - 200, carY + 30, 400, 3);
  // 地板
  ctx.fillStyle = '#0d1420';
  ctx.fillRect(cx - 200, carY + 170, 400, 4);

  const cols = ['#38405a', '#453a4e', '#39463f', '#463f35'];
  for (let i = 0; i < 11; i++) {
    const px = cx - 188 + i * 38 + Math.sin(game.t * 2.2 + i) * 2;
    const feet = carY + 172;
    ctx.fillStyle = cols[i % 4];
    ctx.fillRect(px - 8, feet - 48, 16, 48);
    ctx.fillRect(px - 7, feet - 62, 14, 14);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(px - 8, feet - 36, 16, 2);
  }

  ctx.font = '800 21px ' + FONT;
  ctx.fillStyle = Math.sin(game.t * 14) > 0 ? '#ff8a80' : '#f4ecd6';
  ctx.fillText('狂戳鼠标 / 空格！', cx, 404);

  ctx.font = '600 12px ' + FONT;
  ctx.fillStyle = '#8b97ad';
  ctx.textAlign = 'left';
  ctx.fillText('挤车进度', cx - 160, 430);
  ctx.textAlign = 'center';
  bar(cx - 160, 440, 320, 18, r.prog / 100, '#5fc98a');

  const left = Math.max(0, r.window - r.t);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#8b97ad';
  ctx.fillText('车门关闭 ' + left.toFixed(1) + 's', cx - 160, 472);
  ctx.textAlign = 'center';
  bar(cx - 160, 482, 320, 8, left / r.window, '#e8443a');

  ctx.font = '500 12px ' + FONT;
  ctx.fillStyle = '#6f7c94';
  ctx.fillText('点击次数 ' + r.clicks + ' · 慢一点就会被后面的人顶出去', cx, 510);
}

function drawTravelScene(r) {
  ctx.fillStyle = '#070a12';
  ctx.fillRect(0, 0, SW, SH);

  // 速度线
  for (let i = 0; i < 30; i++) {
    const y = 40 + ((i * 67 + game.t * 220) % 480);
    const x = ((i * 149 - game.t * 520) % (SW + 260)) - 130;
    ctx.fillStyle = i % 3 ? 'rgba(120,180,255,0.10)' : 'rgba(255,240,180,0.12)';
    ctx.fillRect(x, y, 70 + (i % 5) * 40, 2);
  }

  // 车厢
  const cy = 238;
  ctx.fillStyle = '#141b29';
  ctx.fillRect(150, cy, 660, 132);
  ctx.fillStyle = r.color;
  ctx.fillRect(150, cy, 660, 5);
  ctx.fillRect(150, cy + 127, 660, 5);

  for (let i = 0; i < 6; i++) {
    const wx = 172 + i * 106;
    ctx.fillStyle = '#2a3a52';
    ctx.fillRect(wx, cy + 22, 84, 66);
    ctx.fillStyle = 'rgba(255,230,170,0.16)';
    ctx.fillRect(wx + 3, cy + 25, 78, 60);
    for (let j = 0; j < 3; j++) {
      const px = wx + 14 + j * 24;
      const sway = Math.sin(game.t * 3 + i + j) * 1.5;
      ctx.fillStyle = ['#39445a', '#4a3f52', '#3b4a45'][(i + j) % 3];
      ctx.fillRect(px + sway - 5, cy + 48, 10, 40);
      ctx.fillRect(px + sway - 4, cy + 37, 8, 10);
    }
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 12px ' + FONT;
  ctx.fillStyle = r.color;
  ctx.fillText(r.lineName, SW / 2, 118);
  ctx.font = '800 28px ' + FONT;
  ctx.fillStyle = '#f4ecd6';
  ctx.fillText('开往 ' + r.toName, SW / 2, 152);
  ctx.font = '500 13px ' + FONT;
  ctx.fillStyle = '#8b97ad';
  ctx.fillText(r.fromName + ' → ' + r.toName + ' · 预计 ' + r.cost + ' 分钟', SW / 2, 182);

  if (r.delay) {
    ctx.font = '700 14px ' + FONT;
    ctx.fillStyle = '#ff6b5e';
    ctx.fillText('⚠ ' + r.delayMsg + ' +' + r.delay + ' 分钟', SW / 2, 208);
  }

  bar(280, 412, 400, 10, r.t / (r.kind === 'bus' ? 3.0 : 2.2), r.color);

  ctx.font = '500 12px ' + FONT;
  ctx.fillStyle = '#6f7c94';
  ctx.fillText(r.kind === 'bus' ? '公交车在车流里缓慢挪动…' : '列车行驶中，手机没信号…', SW / 2, 448);
  if (r.prog >= 100) {
    ctx.fillStyle = '#5fc98a';
    ctx.fillText('挤上车了，站稳扶好', SW / 2, 476);
  }
}

/* ---------------------------- 提示 / 电话 / 结算 / 菜单 ---------------------------- */

function drawToasts() {
  let y = 92;
  const riding = !!game.ride;
  const list = riding ? game.toasts.slice(-1) : game.toasts;
  ctx.textAlign = riding ? 'left' : 'center';
  ctx.textBaseline = 'middle';
  for (const t of list) {
    const a = Math.min(1, t.t / 0.16) * Math.min(1, Math.max(0, (t.life - t.t) / 0.5));
    if (a <= 0) continue;
    ctx.font = '600 13px ' + FONT;
    const w = ctx.measureText(t.text).width + 36;
    const x = riding ? 20 : SW / 2 - w / 2;
    const col = { info: '#cfe6f5', good: '#9fe8a8', warn: '#ffd979', bad: '#ff8a80' }[t.kind] || '#cfe6f5';
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(8,11,18,0.84)';
    roundRect(ctx, x, y, w, 28, 4);
    ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth = 1;
    roundRect(ctx, x + 0.5, y + 0.5, w - 1, 27, 4);
    ctx.stroke();
    ctx.fillStyle = col;
    if (riding) ctx.fillText(t.text, x + 18, y + 15);
    else ctx.fillText(t.text, SW / 2, y + 15);
    ctx.globalAlpha = 1;
    y += 34;
  }
}

function drawAvatar(cx, cy, kind) {
  ctx.fillStyle = kind === 'wife' ? '#5a2e46' : '#2f3b52';
  ctx.beginPath();
  ctx.arc(cx, cy, 30, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, 30, 0, Math.PI * 2);
  ctx.clip();

  ctx.fillStyle = kind === 'wife' ? '#f0c9a3' : '#e6b98f';
  ctx.fillRect(cx - 12, cy - 8, 24, 27);

  if (kind === 'wife') {
    ctx.fillStyle = '#2a1d24';
    ctx.fillRect(cx - 16, cy - 18, 32, 12);
    ctx.fillRect(cx - 18, cy - 10, 8, 28);
    ctx.fillRect(cx + 10, cy - 10, 8, 28);
    ctx.fillRect(cx - 3, cy - 23, 6, 6);
  } else {
    ctx.fillStyle = '#2b2620';
    ctx.fillRect(cx - 14, cy - 18, 28, 8);
    ctx.fillRect(cx - 14, cy - 18, 4, 15);
    ctx.fillRect(cx + 10, cy - 18, 4, 15);
  }

  ctx.strokeStyle = '#3a2a22';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx - 9, cy - 1); ctx.lineTo(cx - 3, cy + 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + 9, cy - 1); ctx.lineTo(cx + 3, cy + 2); ctx.stroke();

  ctx.fillStyle = '#221a18';
  ctx.fillRect(cx - 7, cy + 3, 4, 3);
  ctx.fillRect(cx + 3, cy + 3, 4, 3);

  ctx.fillStyle = '#7a2a2a';
  ctx.fillRect(cx - 6, cy + 13, 12, 5);
  ctx.fillStyle = '#3a1010';
  ctx.fillRect(cx - 3, cy + 14, 6, 2);

  if (kind === 'boss') {
    ctx.strokeStyle = '#1b1b25';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(cx - 9, cy + 1, 7, 6);
    ctx.strokeRect(cx + 2, cy + 1, 7, 6);
    ctx.beginPath(); ctx.moveTo(cx - 2, cy + 4); ctx.lineTo(cx + 2, cy + 4); ctx.stroke();
  }
  ctx.restore();

  ctx.strokeStyle = '#c8342c';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, 30, 0, Math.PI * 2);
  ctx.stroke();
}

function drawPhone() {
  const ph = game.phone;
  const M = MODES[game.mode];
  if (!ph) return;

  const k = clamp(ph.t / 0.5, 0, 1);
  const ease = 1 - Math.pow(1 - k, 3);
  const w = 392, h = 230;
  const x = SW - w - 22;
  const y = SH - h - 20 + (1 - ease) * 280;

  ctx.fillStyle = 'rgba(4,6,12,' + (0.5 * ease).toFixed(3) + ')';
  ctx.fillRect(0, 0, SW, SH);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 30px ' + FONT;
  ctx.fillStyle = '#ff3b30';
  ctx.shadowColor = '#ff3b30';
  ctx.shadowBlur = 16;
  ctx.fillText('你迟到了', SW / 2, 58);
  ctx.shadowBlur = 0;
  ctx.font = '500 13px ' + FONT;
  ctx.fillStyle = '#d6a3a0';
  ctx.fillText(M.failSub, SW / 2, 86);

  // 卡片
  ctx.fillStyle = '#0f131c';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#c8342c';
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
  ctx.fillStyle = '#c8342c';
  ctx.fillRect(x, y, w, 28);

  ctx.textAlign = 'left';
  ctx.font = '700 12px ' + FONT;
  ctx.fillStyle = '#ffe8e6';
  ctx.fillText('来电 · ' + M.caller, x + 12, y + 15);

  const sec = Math.max(0, Math.floor(ph.t));
  const dur = String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0');
  ctx.textAlign = 'right';
  ctx.fillText(ph.t < 1.1 ? '来电中…' : '通话中 ' + dur, x + w - 12, y + 15);

  drawAvatar(x + 48, y + 76, M.avatar);

  ctx.textAlign = 'left';
  ctx.font = '800 20px ' + FONT;
  ctx.fillStyle = '#f4ecd6';
  ctx.fillText(M.caller, x + 90, y + 64);
  ctx.font = '500 11px ' + FONT;
  ctx.fillStyle = '#8b97ad';
  ctx.fillText(M.callerRole, x + 90, y + 84);

  const talking = ph.t > 1.1 && ph.typed < ph.text.length + 0.5;
  for (let i = 0; i < 3; i++) {
    const bh = talking ? 4 + Math.abs(Math.sin(ph.t * 12 + i)) * 9 : 3;
    ctx.fillStyle = '#ff6b5e';
    ctx.fillRect(x + 90 + i * 6, y + 100 - bh, 3, bh);
  }

  // 红色字幕
  ctx.fillStyle = 'rgba(60,10,10,0.55)';
  ctx.fillRect(x + 14, y + 112, w - 28, 62);
  ctx.strokeStyle = 'rgba(200,52,44,0.6)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 14.5, y + 112.5, w - 29, 61);

  const shown = ph.text.slice(0, Math.floor(ph.typed));
  const font = '700 17px ' + FONT;
  const lines = wrapText(ctx, shown + (ph.typed < ph.text.length ? '▌' : ''), w - 60, font);

  ctx.save();
  if (talking) {
    ctx.translate(Math.sin(ph.t * 47) * 1.4, Math.cos(ph.t * 39) * 1.4);
  }
  ctx.font = font;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ff3b30';
  ctx.shadowColor = 'rgba(255,59,48,0.85)';
  ctx.shadowBlur = 8;
  lines.forEach((ln, i) => ctx.fillText(ln, x + 30, y + 136 + i * 24));
  ctx.restore();

  const done = ph.typed >= ph.text.length;
  if (done) {
    drawButton(x + 18, y + h - 44, 168, 30, '再试一次 (R)', () => startGame(game.mode), { font: '700 13px ' + FONT });
    drawButton(x + w - 186, y + h - 44, 168, 30, '返回菜单', goMenu, { font: '700 13px ' + FONT });
  } else {
    ctx.textAlign = 'center';
    ctx.font = '500 11px ' + FONT;
    ctx.fillStyle = '#6f7c94';
    ctx.fillText('……', x + w / 2, y + h - 28);
  }
}

function drawWin() {
  const M = MODES[game.mode];
  const w = 604, h = 336;
  const x = (SW - w) / 2;
  const y = (SH - h) / 2;
  const k = clamp(game.win.t / 0.4, 0, 1);
  const ease = 1 - Math.pow(1 - k, 3);

  ctx.fillStyle = 'rgba(4,6,12,' + (0.62 * ease).toFixed(3) + ')';
  ctx.fillRect(0, 0, SW, SH);

  if (k < 0.5) return;

  ctx.fillStyle = 'rgba(10,14,23,0.97)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#c9a24a';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  ctx.fillStyle = '#ffd979';
  ctx.fillRect(x, y, w, 4);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 38px ' + FONT;
  ctx.fillStyle = '#ffd979';
  ctx.shadowColor = 'rgba(255,217,121,0.6)';
  ctx.shadowBlur = 14;
  ctx.fillText(M.winTitle, SW / 2, y + 66);
  ctx.shadowBlur = 0;

  ctx.font = '500 14px ' + FONT;
  ctx.fillStyle = '#c9d6e6';
  ctx.fillText(M.winSub, SW / 2, y + 100);

  ctx.font = '500 13px ' + FONT;
  ctx.fillStyle = '#9fe8a8';
  ctx.fillText(M.winFlavor, SW / 2, y + 124);

  const rows = [
    ['到达时间', fmtClock(game.clock)],
    ['路上用时', Math.round(game.clock - game.stats.startClock) + ' 分钟'],
    ['乘车 / 换乘', game.stats.rides + ' 次'],
    ['乘坐线路', game.stats.lines.length ? game.stats.lines.join(' → ') : '全程步行']
  ];

  rows.forEach((row, i) => {
    const ry = y + 156 + i * 30;
    ctx.textAlign = 'left';
    ctx.font = '500 13px ' + FONT;
    ctx.fillStyle = '#8b97ad';
    ctx.fillText(row[0], x + 40, ry);
    ctx.textAlign = 'right';
    ctx.font = '700 14px ' + MONO;
    ctx.fillStyle = '#e6eef8';
    ctx.fillText(row[1], x + w - 40, ry);
  });

  drawButton(x + 40, y + h - 58, (w - 108) / 2, 40, '再来一次 (R)', () => startGame(game.mode), {
    bg: '#2a2416', border: '#c9a24a', color: '#ffe9b0'
  });
  drawButton(x + 68 + (w - 108) / 2, y + h - 58, (w - 108) / 2, 40, '返回菜单', goMenu);
}

function drawPause() {
  const w = 480, h = 322;
  const x = (SW - w) / 2;
  const y = (SH - h) / 2;

  ctx.fillStyle = 'rgba(4,6,12,0.7)';
  ctx.fillRect(0, 0, SW, SH);
  ctx.fillStyle = 'rgba(10,14,23,0.98)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#4a5a78';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '800 30px ' + FONT;
  ctx.fillStyle = '#f4ecd6';
  ctx.fillText('暂停', SW / 2, y + 52);

  ctx.font = '500 12px ' + FONT;
  ctx.fillStyle = '#8b97ad';
  ctx.fillText('时钟已暂停，老板的时间观念可不会暂停', SW / 2, y + 84);

  drawButton(x + 40, y + 108, w - 80, 44, '继续赶路', () => { game.paused = false; }, {
    bg: '#173024', hoverBg: '#1f4633', border: '#4a9e6b', color: '#d8ffe4'
  });
  drawButton(x + 40, y + 162, w - 80, 44, '重新开始', () => startGame(game.mode));
  drawButton(x + 40, y + 216, w - 80, 44, '返回主菜单', goMenu);

  ctx.font = '500 11px ' + FONT;
  ctx.fillStyle = '#6f7c94';
  ctx.fillText('A/D 移动 · W 跳 · S 进站 · E 互动 · 鼠标点击一切', SW / 2, y + h - 28);
}

/* ---------------------------- 菜单 ---------------------------- */

function drawMenu() {
  ctx.fillStyle = 'rgba(8,10,18,0.6)';
  ctx.fillRect(0, 0, SW, SH);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.font = '900 50px ' + FONT;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillText('北京通勤模拟器', SW / 2 + 4, 126);
  ctx.fillStyle = '#f4ecd6';
  ctx.fillText('北京通勤模拟器', SW / 2, 122);

  ctx.font = '700 13px ' + MONO;
  ctx.fillStyle = '#ffd979';
  ctx.fillText('BEIJING RUSH HOUR SIMULATOR · 2D PIXEL PROTOTYPE', SW / 2, 158);

  ctx.font = '500 13px ' + FONT;
  ctx.fillStyle = '#a9b6ca';
  ctx.fillText('点击地铁口进站 → 选线路 → 排队挤车 → 出站走到目的地', SW / 2, 186);

  drawModeCard(132, 214, 330, 132, 'morning', '早高峰', '08:12 → 09:00', '赶到公司打卡', '#e8a33d');
  drawModeCard(498, 214, 330, 132, 'evening', '晚高峰', '19:45 → 20:30', '挤回家吃口热饭', '#7f8fd8');

  ctx.font = '500 12px ' + FONT;
  ctx.fillStyle = '#8b97ad';
  ctx.fillText('提示：环路和施工围挡挡住了步行路线，只能坐地铁或公交跨越', SW / 2, 384);

  ctx.font = '500 12px ' + FONT;
  ctx.fillStyle = '#cfd8e8';
  ctx.fillText('A / D 移动　W 跳跃　S 进站　鼠标点击站点与按钮　E 互动　ESC 暂停', SW / 2, 462);
  ctx.fillStyle = '#6f7c94';
  ctx.fillText('原型 v0.1 · 细节待补充', SW / 2, 494);
}

function drawModeCard(x, y, w, h, mode, title, sub, desc, accent) {
  const hover = inRect(mouse.x, mouse.y, { x, y, w, h });
  if (hover) ui.hovering = true;

  ctx.fillStyle = hover ? 'rgba(30,40,60,0.97)' : 'rgba(14,19,30,0.93)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = hover ? '#ffd979' : accent;
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  ctx.fillStyle = accent;
  ctx.fillRect(x, y, w, 4);

  // 图标
  if (mode === 'morning') {
    ctx.fillStyle = '#ffd979';
    ctx.beginPath();
    ctx.arc(x + 44, y + 48, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0e131e';
    ctx.fillRect(x + 26, y + 32, 14, 4);
  } else {
    ctx.fillStyle = '#dfe6ff';
    ctx.beginPath();
    ctx.arc(x + 44, y + 48, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0e131e';
    ctx.beginPath();
    ctx.arc(x + 52, y + 42, 13, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = '800 24px ' + FONT;
  ctx.fillStyle = '#f4ecd6';
  ctx.fillText(title, x + 76, y + 44);

  ctx.font = '700 13px ' + MONO;
  ctx.fillStyle = accent;
  ctx.fillText(sub, x + 76, y + 72);

  ctx.font = '500 13px ' + FONT;
  ctx.fillStyle = '#a9b6ca';
  ctx.fillText(desc, x + 22, y + 108);

  ctx.textAlign = 'right';
  ctx.font = '700 12px ' + FONT;
  ctx.fillStyle = hover ? '#ffd979' : '#6f7c94';
  ctx.fillText(hover ? '点击开始 ▶' : '点击开始', x + w - 20, y + 108);

  ui.hits.push({ x, y, w, h, action: () => startGame(mode) });
}

/* ---------------------------- 主循环 ---------------------------- */

let lastT = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  update(dt);
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.BJ = { game, startGame, goMenu, MODES, STATIONS, LINES };
