'use strict';

/* =========================================================
   世界数据 / 关卡地图 / 2D 像素场景绘制
   ========================================================= */

/* ---------------------------- 地铁线路 ---------------------------- */

const STATIONS = {
  ttyb: { id: 'ttyb', name: '天通苑北', x: 380, lines: ['5'] },
  lsq:  { id: 'lsq',  name: '立水桥',   x: 1000, lines: ['5', '13'], major: true },
  wjx:  { id: 'wjx',  name: '望京西',   x: 1520, lines: ['13'] },
  syj:  { id: 'syj',  name: '芍药居',   x: 1980, lines: ['13', '10'], major: true },
  gm:   { id: 'gm',   name: '国贸',     x: 2620, lines: ['10', '1'], major: true }
};

const LINES = {
  '5':  { id: '5',  name: '5号线',  color: '#b3328f', stops: ['ttyb', 'lsq'], times: [5] },
  '13': { id: '13', name: '13号线', color: '#e0c245', stops: ['lsq', 'wjx', 'syj'], times: [6, 3] },
  '10': { id: '10', name: '10号线', color: '#3fa9dc', stops: ['syj', 'gm'], times: [7] },
  '1':  { id: '1',  name: '1号线',  color: '#d24b3e', stops: ['gm'], times: [] }
};

/* 环路 / 施工围挡：挡住步行，只能坐地铁或公交跨越 */
const BARRIERS = [800, 1180, 1700, 2160];

const HOME_DOOR = 90;
const OFFICE_DOOR = 2870;
const BUS_A = 620;    // 天通苑北侧公交站
const BUS_E = 2380;   // 国贸侧公交站

const SPOTS = [
  { type: 'door',    id: 'home',   x: HOME_DOOR },
  { type: 'station', id: 'ttyb',   x: STATIONS.ttyb.x },
  { type: 'bus',     id: 'A',      x: BUS_A, to: 'E' },
  { type: 'bike',    id: 'bike1',  x: 500 },
  { type: 'station', id: 'lsq',    x: STATIONS.lsq.x },
  { type: 'station', id: 'wjx',    x: STATIONS.wjx.x },
  { type: 'bike',    id: 'bike2',  x: 1440 },
  { type: 'station', id: 'syj',    x: STATIONS.syj.x },
  { type: 'bus',     id: 'E',      x: BUS_E, to: 'A' },
  { type: 'bike',    id: 'bike3',  x: 2300 },
  { type: 'station', id: 'gm',     x: STATIONS.gm.x },
  { type: 'door',    id: 'office', x: OFFICE_DOOR }
];

function zoneOf(x) {
  for (let i = 0; i < BARRIERS.length; i++) if (x < BARRIERS[i]) return i;
  return BARRIERS.length;
}

/* 站点可乘坐的相邻站 */
function optionsFor(stationId) {
  const station = STATIONS[stationId];
  if (!station) return [];
  const out = [];
  for (const lid of station.lines) {
    const line = LINES[lid];
    const i = line.stops.indexOf(stationId);
    if (i < 0) continue;
    if (i > 0) out.push({ line: lid, to: line.stops[i - 1], min: line.times[i - 1] });
    if (i < line.stops.length - 1) out.push({ line: lid, to: line.stops[i + 1], min: line.times[i] });
  }
  return out;
}

/* ---------------------------- 世界对象 ---------------------------- */

const W = {
  buildings: [],
  far: [],
  mid: [],
  clouds: [],
  lamps: [],
  trees: [],
  bins: [],
  npcs: [],
  cars: []
};

const NPC_PALETTES = [
  { coat: '#4a6fa5', coatDark: '#3a5a86', pants: '#2b3145', hair: '#1b1a24', skin: '#e9c09a', bag: '#7a5b3a' },
  { coat: '#a5564a', coatDark: '#86443a', pants: '#35303c', hair: '#2a1d18', skin: '#f0c9a3', bag: null },
  { coat: '#5f8a63', coatDark: '#4b7050', pants: '#2e3440', hair: '#16161e', skin: '#e4b48f', bag: '#4a4a58' },
  { coat: '#8a6fa8', coatDark: '#6f5789', pants: '#2a2e3a', hair: '#241a20', skin: '#f2cba6', bag: null },
  { coat: '#d0c6ae', coatDark: '#b2a78d', pants: '#3a4050', hair: '#1e1a1a', skin: '#e9c09a', bag: '#9a6b45' },
  { coat: '#3b4658', coatDark: '#2c3544', pants: '#20242e', hair: '#151219', skin: '#dcae86', bag: null },
  { coat: '#c98a3f', coatDark: '#a86f30', pants: '#333a48', hair: '#22181a', skin: '#f0c9a3', bag: '#6b4b33' }
];

function initWorld() {
  /* --- 建筑 --- */
  W.buildings = [
    // A 区：回龙观 / 天通苑 老小区
    { x: -12, w: 262, h: 134, style: 'res' },
    { x: 252, w: 84, h: 52, style: 'shop', awning: '#d8563a' },
    { x: 338, w: 120, h: 118, style: 'res' },
    { x: 460, w: 120, h: 104, style: 'res' },
    { x: 582, w: 206, h: 96, style: 'res' },
    // B 区：立水桥
    { x: 802, w: 190, h: 112, style: 'mall' },
    { x: 994, w: 178, h: 150, style: 'office' },
    // C 区：望京
    { x: 1182, w: 200, h: 162, style: 'tower', glass: '#2f6f92' },
    { x: 1384, w: 100, h: 56, style: 'shop', awning: '#3aa06a' },
    { x: 1486, w: 206, h: 128, style: 'office' },
    // D 区：芍药居
    { x: 1702, w: 186, h: 122, style: 'res' },
    { x: 1890, w: 100, h: 52, style: 'shop', awning: '#e5c84b' },
    { x: 1994, w: 158, h: 140, style: 'office' },
    // E 区：国贸 CBD
    { x: 2162, w: 180, h: 190, style: 'tower', glass: '#3b5a7a' },
    { x: 2344, w: 230, h: 226, style: 'tower', glass: '#46617f' },
    { x: 2576, w: 348, h: 172, style: 'office', door: OFFICE_DOOR },
    { x: 2926, w: 120, h: 148, style: 'res' }
  ];

  /* --- 远景天际线 --- */
  W.far = [];
  let fx = -40;
  while (fx < WORLD_W * 0.35 + VW + 120) {
    const w = 14 + Math.floor(hash(fx * 1.13) * 26);
    const h = 26 + Math.floor(hash(fx * 0.77) * 74);
    W.far.push({ x: fx, w, h });
    fx += w + 2 + Math.floor(hash(fx * 2.1) * 10);
  }

  W.mid = [];
  let mx = -60;
  while (mx < WORLD_W * 0.55 + VW + 120) {
    const w = 20 + Math.floor(hash(mx * 0.53) * 34);
    const h = 34 + Math.floor(hash(mx * 1.91) * 96);
    W.mid.push({ x: mx, w, h });
    mx += w + 4;
  }

  /* --- 云 --- */
  W.clouds = [];
  for (let i = 0; i < 9; i++) {
    W.clouds.push({ x: rand(0, VW), y: rand(14, 96), s: rand(0.8, 2.1), sp: rand(1.2, 4.2) });
  }

  /* --- 路灯 / 树 / 垃圾桶 --- */
  W.lamps = [150, 470, 740, 930, 1150, 1450, 1680, 1900, 2140, 2360, 2560, 2790, 2990];
  W.trees = [230, 560, 910, 1470, 1740, 2110, 2450, 2960];
  W.bins = [400, 1060, 1600, 2050, 2700];

  /* --- 行人和车 --- */
  W.npcs = [];
  const ranges = [[40, 760], [820, 1160], [1200, 1680], [1720, 2140], [2180, 2990]];
  for (let i = 0; i < 27; i++) {
    const zr = ranges[i % ranges.length];
    const pal = NPC_PALETTES[i % NPC_PALETTES.length];
    W.npcs.push({
      x: rand(zr[0], zr[1]),
      min: zr[0], max: zr[1],
      dir: Math.random() < 0.5 ? -1 : 1,
      sp: rand(12, 30),
      pause: rand(0, 3),
      phase: rand(0, 9),
      moving: true,
      pal
    });
  }

  W.cars = [];
  const carCols = ['#c94b3f', '#3f6fae', '#e0c245', '#d9dde3', '#4a8f6a', '#8a4f9e', '#b8783f'];
  for (let i = 0; i < 14; i++) {
    W.cars.push({ x: rand(0, WORLD_W), lane: i % 2, sp: rand(26, 66), col: pick(carCols) });
  }
}

function updateWorld(dt) {
  for (const n of W.npcs) {
    if (n.pause > 0) {
      n.pause -= dt;
      n.moving = false;
      continue;
    }
    n.moving = true;
    n.x += n.dir * n.sp * dt;
    n.phase += dt;
    if (n.x < n.min) { n.x = n.min; n.dir = 1; }
    if (n.x > n.max) { n.x = n.max; n.dir = -1; }
    if (Math.random() < dt * 0.12) n.pause = rand(0.8, 3.2);
  }
  for (const c of W.cars) {
    const dir = c.lane === 0 ? 1 : -1;
    c.x += dir * c.sp * dt;
    if (c.x > WORLD_W + 60) c.x = -60;
    if (c.x < -60) c.x = WORLD_W + 60;
  }
}

/* ---------------------------- 绘制入口 ---------------------------- */

function drawWorld(g) {
  const c = wc;
  const night = g.mode === 'evening';
  const cam = Math.round(g.camX);

  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, VW, VH);

  drawSky(c, night, g.t);
  drawSkyline(c, cam, night);
  drawClouds(c, cam, g.t, night);

  c.save();
  c.translate(-cam, 0);
  for (const b of W.buildings) {
    if (b.x + b.w < cam - 20 || b.x > cam + VW + 20) continue;
    drawBuilding(c, b, night);
  }
  c.restore();

  drawGround(c, cam, night);

  c.save();
  c.translate(-cam, 0);
  drawProps(c, g, night);
  for (const n of W.npcs) {
    if (n.x < cam - 30 || n.x > cam + VW + 30) continue;
    drawPerson(c, n.x, GROUND_Y, {
      dir: n.dir, moving: n.moving, phase: n.phase,
      coat: n.pal.coat, coatDark: n.pal.coatDark, pants: n.pal.pants,
      hair: n.pal.hair, skin: n.pal.skin, bag: n.pal.bag
    });
  }
  drawPlayer(c, g);
  c.restore();

  drawCars(c, cam, night);
  drawAtmosphere(c, night, g.t);
}

/* ---------------------------- 天空 ---------------------------- */

function drawSky(c, night, t) {
  const grad = c.createLinearGradient(0, 0, 0, GROUND_Y);
  if (night) {
    grad.addColorStop(0, '#0f1428');
    grad.addColorStop(0.5, '#232a4a');
    grad.addColorStop(0.82, '#4b3c58');
    grad.addColorStop(1, '#6b4a5c');
  } else {
    grad.addColorStop(0, '#6fb7dd');
    grad.addColorStop(0.45, '#a9d9ec');
    grad.addColorStop(0.8, '#f6d9a8');
    grad.addColorStop(1, '#ffcf9a');
  }
  c.fillStyle = grad;
  c.fillRect(0, 0, VW, GROUND_Y);

  if (night) {
    for (let i = 0; i < 64; i++) {
      const x = Math.floor(hash(i * 7.3) * VW);
      const y = Math.floor(hash(i * 3.1) * 128 + 4);
      const tw = 0.5 + 0.5 * Math.sin(t * 2 + i);
      c.fillStyle = 'rgba(255,248,220,' + (0.18 + tw * 0.55).toFixed(3) + ')';
      c.fillRect(x, y, 1, 1);
    }
    c.fillStyle = '#f6f0d0';
    c.beginPath(); c.arc(388, 50, 15, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#e2dab4';
    c.beginPath(); c.arc(393, 46, 4, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(382, 57, 3, 0, Math.PI * 2); c.fill();
  } else {
    const sg = c.createRadialGradient(400, 44, 3, 400, 44, 48);
    sg.addColorStop(0, 'rgba(255,246,205,0.95)');
    sg.addColorStop(0.35, 'rgba(255,216,145,0.45)');
    sg.addColorStop(1, 'rgba(255,216,145,0)');
    c.fillStyle = sg;
    c.fillRect(336, 0, 128, 128);
    c.fillStyle = '#fff6cf';
    c.beginPath(); c.arc(400, 44, 13, 0, Math.PI * 2); c.fill();
  }
}

function drawClouds(c, cam, t, night) {
  for (const cl of W.clouds) {
    let x = cl.x - cam * 0.06 + t * cl.sp;
    const span = VW + 100;
    x = ((x % span) + span) % span - 50;
    const col = night ? 'rgba(150,160,200,0.16)' : 'rgba(255,255,255,0.78)';
    const s = cl.s;
    R(c, x, cl.y, 26 * s, 5 * s, col);
    R(c, x + 6 * s, cl.y - 5 * s, 14 * s, 5 * s, col);
    R(c, x + 16 * s, cl.y + 2 * s, 14 * s, 4 * s, col);
    R(c, x + 4 * s, cl.y + 4 * s, 18 * s, 2 * s, col);
  }
}

function drawSkyline(c, cam, night) {
  const off = cam * 0.22;
  const col = night ? '#1b2036' : '#93b6c8';
  for (const b of W.far) {
    const sx = b.x - off;
    if (sx > VW + 40 || sx + b.w < -40) continue;
    R(c, sx, GROUND_Y - b.h, b.w, b.h, col);
    R(c, sx, GROUND_Y - b.h, 2, b.h, night ? '#242b45' : '#a6c5d4');
    if (night) {
      for (let wy = GROUND_Y - b.h + 6; wy < GROUND_Y - 10; wy += 9) {
        for (let wx = sx + 4; wx < sx + b.w - 4; wx += 8) {
          if (hash(wx * 1.3 + wy * 2.7) > 0.78) R(c, wx, wy, 2, 3, '#ffd98a');
        }
      }
    }
  }

  const off2 = cam * 0.45;
  const col2 = night ? '#111628' : '#7ea2b8';
  for (const b of W.mid) {
    const sx = b.x - off2;
    if (sx > VW + 50 || sx + b.w < -50) continue;
    R(c, sx, GROUND_Y - b.h, b.w, b.h, col2);
    if (b.w > 24) R(c, sx + 6, GROUND_Y - b.h - 4, 8, 4, col2);
    if (night) {
      for (let wy = GROUND_Y - b.h + 8; wy < GROUND_Y - 12; wy += 10) {
        for (let wx = sx + 6; wx < sx + b.w - 6; wx += 10) {
          if (hash(wx * 3.1 + wy * 1.7) > 0.72) R(c, wx, wy, 3, 3, '#ffdf9c');
        }
      }
    } else {
      for (let wy = GROUND_Y - b.h + 8; wy < GROUND_Y - 12; wy += 10) {
        for (let wx = sx + 6; wx < sx + b.w - 6; wx += 10) {
          R(c, wx, wy, 3, 3, 'rgba(210,232,242,0.25)');
        }
      }
    }
  }
}

/* ---------------------------- 建筑 ---------------------------- */

function drawBuilding(c, b, night) {
  if (b.style === 'res') drawResidential(c, b, night);
  else if (b.style === 'office') drawOffice(c, b, night);
  else if (b.style === 'mall') drawMall(c, b, night);
  else if (b.style === 'shop') drawShop(c, b, night);
  else if (b.style === 'tower') drawTower(c, b, night);
}

function drawResidential(c, b, night) {
  const x = b.x, w = b.w, h = b.h, top = GROUND_Y - h;
  R(c, x, top, w, h, night ? '#3d3a4c' : '#a98a70');
  R(c, x, top, w, 3, night ? '#33303f' : '#8f7159');
  R(c, x, top, w, 1, night ? '#57506a' : '#c0a184');

  if (hash(x * 0.3) > 0.4) {
    R(c, x + w - 26, top - 8, 15, 8, night ? '#2f2c3b' : '#7a6150');
    R(c, x + w - 23, top - 11, 9, 3, night ? '#262433' : '#6a5445');
  }
  if (hash(x * 1.7) > 0.6) R(c, x + 8, top - 12, 2, 12, night ? '#2a2836' : '#6b5444');

  for (let fy = top + 12; fy < GROUND_Y - 22; fy += 20) {
    for (let fx = x + 7; fx < x + w - 12; fx += 17) {
      const lit = night ? hash(fx * 1.7 + fy * 3.3) > 0.42 : hash(fx * 1.7 + fy * 3.3) > 0.82;
      R(c, fx, fy, 10, 10, lit ? (night ? '#ffd489' : '#cfe6ef') : (night ? '#272a3a' : '#6f8797'));
      R(c, fx, fy, 10, 1, night ? '#1e2130' : '#5b7484');
      R(c, fx - 1, fy + 10, 12, 2, night ? '#565068' : '#8a6b55');
      if (hash(fx + fy) > 0.62) R(c, fx + 2, fy + 7, 5, 3, night ? '#3f3a4e' : '#7d6552');
    }
  }
  R(c, x, GROUND_Y - 18, w, 18, night ? '#2c2b39' : '#876b55');
  const unit = Math.max(1, Math.floor(w / 26));
  for (let i = 0; i < unit; i++) {
    R(c, x + 8 + i * 26, GROUND_Y - 12, 12, 12, night ? '#242331' : '#6b5443');
  }
}

function drawOffice(c, b, night) {
  const x = b.x, w = b.w, h = b.h, top = GROUND_Y - h;
  R(c, x, top, w, h, night ? '#28304a' : '#7e8b9c');
  R(c, x, top, w, 6, night ? '#1c2336' : '#5f6c7c');
  for (let fy = top + 10; fy < GROUND_Y - 20; fy += 14) {
    for (let fx = x + 6; fx < x + w - 8; fx += 13) {
      const lit = hash(fx * 1.3 + fy * 4.1) > (night ? 0.55 : 0.86);
      R(c, fx, fy, 8, 8, lit ? (night ? '#ffd489' : '#cfe4ee') : (night ? '#1e2638' : '#a9c4d4'));
    }
  }
  R(c, x, GROUND_Y - 18, w, 18, night ? '#242b3d' : '#68777f');
  R(c, x + 4, top + 4, w - 8, 2, night ? '#33405c' : '#96a6b4');
}

function drawMall(c, b, night) {
  const x = b.x, w = b.w, h = b.h, top = GROUND_Y - h;
  R(c, x, top, w, h, night ? '#2a2c3d' : '#8e93a3');
  R(c, x, top, w, 8, night ? '#1e2030' : '#6f7686');
  R(c, x + 6, top + 12, w - 12, 16, night ? '#171a28' : '#2f3444');
  for (let i = 0; i < w - 12; i += 4) {
    R(c, x + 6 + i, top + 12, 2, 1, '#ff77c8');
    R(c, x + 6 + i, top + 27, 2, 1, '#ff77c8');
  }
  for (let fx = x + 10; fx < x + w - 16; fx += 22) {
    R(c, fx, top + 36, 14, 10, night ? '#ffd489' : '#cfe6ef');
    R(c, fx, top + 50, 14, 8, night ? '#2b2e42' : '#7f94a4');
  }
  R(c, x, GROUND_Y - 16, w, 16, night ? '#1d2030' : '#6f7686');
}

function drawShop(c, b, night) {
  const x = b.x, w = b.w, h = b.h, top = GROUND_Y - h;
  R(c, x, top, w, h, night ? '#33313f' : '#c9b79c');
  R(c, x, top, w, 6, night ? '#232332' : '#8f7f68');
  const aw = b.awning || '#d8563a';
  for (let i = 0; i < Math.ceil(w / 8); i++) {
    R(c, x + i * 8, top + 8, 8, 8, i % 2 ? '#f2e9d0' : aw);
  }
  R(c, x, top + 16, w, 2, 'rgba(0,0,0,0.22)');
  R(c, x + 6, top + 22, w - 12, h - 28, night ? '#ffcf7a' : '#6f8fa0');
  R(c, x + 6, top + 22, w - 12, 2, 'rgba(255,255,255,0.3)');
  R(c, x + w - 20, top + 24, 2, h - 30, 'rgba(30,35,45,0.45)');
}

function drawTower(c, b, night) {
  const x = b.x, w = b.w, h = b.h, top = GROUND_Y - h;
  R(c, x, top, w, h, night ? '#1c2436' : '#5f7d96');
  for (let fx = x + 3; fx < x + w - 2; fx += 9) {
    R(c, fx, top + 4, 2, h - 4, night ? '#141b2b' : '#4a6478');
  }
  for (let fy = top + 4; fy < GROUND_Y; fy += 9) {
    R(c, x, fy, w, 1, night ? '#141b2b' : '#4a6478');
  }
  for (let i = 0; i < w; i += 18) {
    if (hash(i + x) > 0.55) {
      R(c, x + i + 2, top + 8, 3, Math.min(h - 24, 64), night ? '#2a3a55' : '#7fa3bb');
    }
  }
  for (let fy = top + 6; fy < GROUND_Y - 24; fy += 18) {
    for (let fx = x + 4; fx < x + w - 6; fx += 18) {
      if (hash(fx * 2.3 + fy * 1.1) > (night ? 0.6 : 0.9)) {
        R(c, fx, fy, 5, 4, night ? '#ffdf9c' : '#a7c9dc');
      }
    }
  }
  R(c, x, top, w, 4, night ? '#101724' : '#4b6478');
  R(c, x + Math.floor(w / 2), top - 16, 2, 16, night ? '#2a3247' : '#4a5b6e');
  R(c, x + Math.floor(w / 2) - 1, top - 18, 4, 3, '#e8443a');
}

/* ---------------------------- 地面 / 车流 ---------------------------- */

function drawGround(c, cam, night) {
  R(c, 0, GROUND_Y, VW, 18, night ? '#3c4048' : '#9aa0a8');
  R(c, 0, GROUND_Y, VW, 3, night ? '#454a54' : '#a9afb7');
  for (let x = -(cam % 24); x < VW; x += 24) {
    R(c, x, GROUND_Y, 1, 18, night ? '#343841' : '#888e96');
  }
  for (let x = -((cam + 9) % 48); x < VW; x += 48) {
    R(c, x, GROUND_Y + 6, 20, 1, night ? '#383c45' : '#8f959d');
  }
  R(c, 0, GROUND_Y + 18, VW, 3, night ? '#575c66' : '#7e848d');
  R(c, 0, GROUND_Y + 21, VW, VH - GROUND_Y - 21, night ? '#1b1e25' : '#2f333b');
  for (let x = -((cam + 20) % 64); x < VW; x += 64) {
    R(c, x, GROUND_Y + 39, 30, 2, night ? '#3a3f4a' : '#4b505a');
  }
  for (let i = 0; i < 6; i++) {
    const wx = ((i * 613 - cam) % 1400 + 1400) % 1400 - 60;
    if (wx > -20 && wx < VW + 20) R(c, wx, GROUND_Y + 44, 10, 4, night ? '#262a33' : '#3a3e46');
  }
}

function drawCars(c, cam, night) {
  for (const car of W.cars) {
    const sx = car.x - cam;
    if (sx < -50 || sx > VW + 50) continue;
    const y = car.lane === 0 ? 238 : 253;
    const dir = car.lane === 0 ? 1 : -1;
    drawCar(c, sx, y, dir, car.col, night);
  }
}

function drawCar(c, x, y, dir, col, night) {
  const w = 28, h = 11;
  const left = x - w / 2;
  const body = night ? shadeColor(col, -0.32) : col;
  R(c, left, y + 4, w, h - 4, body);
  R(c, left + 5, y, w - 11, 5, body);
  R(c, left + 3, y + 1, w - 6, 1, 'rgba(255,255,255,0.25)');
  R(c, left + 6, y + 1, 6, 3, night ? '#5c7385' : '#cfe6f5');
  R(c, left + 15, y + 1, 6, 3, night ? '#5c7385' : '#cfe6f5');
  R(c, left + 3, y + h - 2, 6, 3, '#15171d');
  R(c, left + w - 9, y + h - 2, 6, 3, '#15171d');
  if (night) {
    const hx = dir > 0 ? left + w : left;
    R(c, hx - 2, y + 5, 4, 2, '#fff3b0');
    R(c, left + w / 2 - 2, y + 8, 4, 1, '#ff8a5c');
  }
}

function shadeColor(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = clamp(Math.round(r + 255 * amt), 0, 255);
  g = clamp(Math.round(g + 255 * amt), 0, 255);
  b = clamp(Math.round(b + 255 * amt), 0, 255);
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}

/* ---------------------------- 场景道具 ---------------------------- */

function drawProps(c, g, night) {
  for (const x of W.lamps) drawLamp(c, x, night);
  for (const x of W.trees) drawTree(c, x, night);
  for (const x of W.bins) drawBin(c, x, night);
  for (const s of SPOTS) {
    if (s.type === 'bike') drawBike(c, s.x, night);
  }
  for (const x of BARRIERS) drawBarrier(c, x, night);
  for (const s of SPOTS) {
    if (s.type === 'station') drawStationEntrance(c, STATIONS[s.id], night);
    else if (s.type === 'bus') drawBusStop(c, s.x, night);
    else if (s.type === 'door') drawDoor(c, s.id, s.x, night, g);
  }
}

function drawLamp(c, x, night) {
  R(c, x - 1, GROUND_Y - 46, 3, 46, '#3d4554');
  R(c, x - 7, GROUND_Y - 50, 14, 4, '#3d4554');
  R(c, x - 6, GROUND_Y - 48, 10, 3, night ? '#ffe9a3' : '#59616e');
  if (night) {
    const grd = c.createRadialGradient(x, GROUND_Y - 47, 2, x, GROUND_Y - 47, 46);
    grd.addColorStop(0, 'rgba(255,225,150,0.32)');
    grd.addColorStop(1, 'rgba(255,225,150,0)');
    c.fillStyle = grd;
    c.fillRect(x - 46, GROUND_Y - 93, 92, 92);
  }
}

function drawTree(c, x, night) {
  R(c, x - 2, GROUND_Y - 28, 5, 28, night ? '#332a28' : '#4a3428');
  R(c, x - 12, GROUND_Y - 44, 24, 16, night ? '#1f3d2c' : '#2f6b3f');
  R(c, x - 8, GROUND_Y - 52, 16, 10, night ? '#254a35' : '#3b7f4a');
  R(c, x - 5, GROUND_Y - 50, 6, 4, night ? '#2c543c' : '#4f9559');
  R(c, x - 14, GROUND_Y - 36, 6, 6, night ? '#1b3527' : '#2a6038');
  R(c, x + 8, GROUND_Y - 38, 6, 8, night ? '#1b3527' : '#2a6038');
}

function drawBin(c, x, night) {
  R(c, x - 5, GROUND_Y - 12, 10, 12, night ? '#2f3a45' : '#4b5a63');
  R(c, x - 6, GROUND_Y - 13, 12, 2, night ? '#3d4b57' : '#5d6e78');
  R(c, x - 3, GROUND_Y - 9, 6, 1, night ? '#243039' : '#39464d');
}

function drawBike(c, x, night) {
  const col = night ? '#8f97a8' : '#2b2f38';
  R(c, x - 8, GROUND_Y - 8, 16, 2, col);
  R(c, x - 8, GROUND_Y - 8, 2, 7, col);
  R(c, x + 6, GROUND_Y - 8, 2, 7, col);
  R(c, x - 10, GROUND_Y - 4, 4, 4, '#e8a33d');
  R(c, x + 6, GROUND_Y - 4, 4, 4, '#e8a33d');
  R(c, x - 1, GROUND_Y - 14, 2, 7, col);
  R(c, x - 5, GROUND_Y - 15, 9, 2, col);
  R(c, x - 7, GROUND_Y - 13, 3, 2, '#e8a33d');
}

function drawBarrier(c, x, night) {
  const y = GROUND_Y;
  R(c, x - 3, y - 34, 6, 34, '#5a6272');
  R(c, x - 44, y - 32, 88, 22, '#2a2f3a');
  for (let i = -42; i < 44; i += 12) {
    const odd = Math.floor((i + 42) / 12) % 2 === 0;
    R(c, x + i, y - 30, 7, 18, odd ? '#e8a33d' : '#f2e9d0');
  }
  R(c, x - 44, y - 32, 88, 3, '#4a5260');
  R(c, x - 44, y - 12, 88, 2, '#1c2029');
  R(c, x - 11, y - 52, 22, 17, '#c23b2e');
  R(c, x - 9, y - 50, 18, 13, '#f2e9d0');
  R(c, x - 2, y - 48, 4, 6, '#c23b2e');
  R(c, x - 2, y - 40, 4, 2, '#c23b2e');
}

function drawStationEntrance(c, st, night) {
  const x = st.x;
  const col = LINES[st.lines[0]].color;
  // 牌匾背板（文字在 HUD 层绘制，保证清晰）
  R(c, x - 34, GROUND_Y - 66, 68, 22, '#0e1522');
  R(c, x - 34, GROUND_Y - 66, 68, 2, '#3d4f6b');
  R(c, x - 34, GROUND_Y - 46, 68, 3, col);
  R(c, x - 30, GROUND_Y - 70, 2, 4, '#6f7a8c');
  R(c, x + 28, GROUND_Y - 70, 2, 4, '#6f7a8c');
  R(c, x - 2, GROUND_Y - 71, 4, 3, night ? '#ffe9a3' : '#5b6a80');
  // 柱子
  R(c, x - 28, GROUND_Y - 44, 3, 44, '#6f7a8c');
  R(c, x + 25, GROUND_Y - 44, 3, 44, '#6f7a8c');
  // 栏杆
  R(c, x - 24, GROUND_Y - 22, 48, 3, '#8b96a8');
  for (let i = -24; i <= 24; i += 8) R(c, x + i, GROUND_Y - 22, 2, 22, '#7a8496');
  // 楼梯口
  R(c, x - 20, GROUND_Y - 15, 40, 15, '#0a0e16');
  for (let i = 1; i < 6; i++) R(c, x - 20, GROUND_Y - 15 + i * 2.4, 40, 1, '#242c3a');
  const grd = c.createLinearGradient(0, GROUND_Y - 15, 0, GROUND_Y);
  grd.addColorStop(0, 'rgba(120,170,220,0)');
  grd.addColorStop(1, 'rgba(120,170,220,0.32)');
  c.fillStyle = grd;
  c.fillRect(x - 20, GROUND_Y - 15, 40, 15);
}

function drawBusStop(c, x, night) {
  const y = GROUND_Y;
  R(c, x - 1, y - 42, 3, 42, '#5b6472');
  R(c, x - 24, y - 58, 48, 17, '#0f1826');
  R(c, x - 22, y - 56, 44, 13, night ? '#2b4a6e' : '#3f6f9e');
  R(c, x - 22, y - 44, 44, 1, '#7fb2d8');
  R(c, x + 10, y - 8, 18, 2, '#6a5038');
  R(c, x + 10, y - 6, 2, 6, '#6a5038');
  R(c, x + 26, y - 6, 2, 6, '#6a5038');
  if (night) {
    const grd = c.createRadialGradient(x, y - 48, 2, x, y - 48, 32);
    grd.addColorStop(0, 'rgba(130,190,255,0.22)');
    grd.addColorStop(1, 'rgba(130,190,255,0)');
    c.fillStyle = grd;
    c.fillRect(x - 32, y - 80, 64, 64);
  }
}

function drawDoor(c, id, x, night, g) {
  const y = GROUND_Y;
  if (id === 'home') {
    R(c, x - 20, y - 42, 40, 42, night ? '#332a24' : '#4a3a2c');
    R(c, x - 16, y - 38, 32, 38, night ? '#5c3f2c' : '#7a5236');
    R(c, x - 12, y - 34, 24, 34, night ? '#7d5334' : '#5a3d2a');
    R(c, x - 2, y - 20, 3, 3, '#e8c25a');
    R(c, x - 10, y - 46, 20, 5, night ? '#ffd98a' : '#2e2620');
    R(c, x - 14, y - 50, 28, 4, night ? '#5a4a3a' : '#3a3028');
    if (night) {
      const grd = c.createRadialGradient(x, y - 40, 2, x, y - 40, 30);
      grd.addColorStop(0, 'rgba(255,200,120,0.3)');
      grd.addColorStop(1, 'rgba(255,200,120,0)');
      c.fillStyle = grd;
      c.fillRect(x - 30, y - 70, 60, 60);
    }
  } else {
    R(c, x - 28, y - 50, 56, 50, night ? '#1a2233' : '#3e4a58');
    R(c, x - 24, y - 46, 48, 46, night ? '#2b3b52' : '#8fb6c9');
    R(c, x - 20, y - 42, 6, 38, 'rgba(255,255,255,0.18)');
    R(c, x + 10, y - 42, 4, 38, 'rgba(255,255,255,0.1)');
    R(c, x - 8, y - 32, 16, 32, '#12202c');
    R(c, x - 6, y - 30, 4, 28, '#3f5a6e');
    R(c, x - 32, y - 54, 64, 5, '#222b3a');
    R(c, x - 30, y - 4, 60, 4, '#4a5260');
    if (night) {
      const grd = c.createRadialGradient(x, y - 26, 4, x, y - 26, 36);
      grd.addColorStop(0, 'rgba(255,225,160,0.35)');
      grd.addColorStop(1, 'rgba(255,225,160,0)');
      c.fillStyle = grd;
      c.fillRect(x - 38, y - 62, 76, 66);
    }
  }
}

/* ---------------------------- 人物 ---------------------------- */

function drawPerson(c, x, feetY, o) {
  const f = o.dir >= 0 ? 1 : -1;
  const ph = o.phase || 0;
  const sw = o.moving ? Math.sin(ph * 11) : 0;
  const bob = o.moving ? Math.abs(Math.sin(ph * 11)) : 0;
  const y = feetY - bob;
  const skin = o.skin || '#e9c09a';
  const hair = o.hair || '#1b1a24';
  const coat = o.coat || '#5b7fae';
  const coatD = o.coatDark || '#3f5d86';
  const pants = o.pants || '#2b3145';
  const shoe = o.shoe || '#171820';

  c.fillStyle = 'rgba(0,0,0,0.25)';
  c.fillRect(Math.round(x - 6), Math.round(feetY - 1), 12, 2);

  const l1 = sw * 2.2;
  const l2 = -sw * 2.2;
  R(c, x - 4 + l1, y - 9, 3, 9, pants);
  R(c, x + 1 + l2, y - 9, 3, 9, pants);
  R(c, x - 4 + l1, y - 2, 4, 2, shoe);
  R(c, x + 1 + l2, y - 2, 4, 2, shoe);

  R(c, x - 5, y - 19, 10, 11, coat);
  R(c, x - 5, y - 19, 10, 2, coatD);
  R(c, x - 7, y - 18, 2, 8, coatD);
  R(c, x + 5, y - 18, 2, 8, coatD);

  R(c, x - 4, y - 27, 8, 8, skin);
  R(c, x - 4, y - 28, 8, 3, hair);
  R(c, x + (f > 0 ? -4 : 4), y - 26, 1, 4, hair);
  R(c, x + (f > 0 ? 1 : -2), y - 24, 2, 2, '#1b1b25');

  if (o.bag) R(c, x - f * 7, y - 17, 3, 7, o.bag);
  if (o.phone) R(c, x + f * 6, y - 16, 2, 3, '#a9ecff');
}

function drawPlayer(c, g) {
  const p = g.player;
  if (p.hidden) return;
  const feet = GROUND_Y - p.z;
  drawPerson(c, p.x, feet, {
    dir: p.dir,
    moving: p.moving,
    phase: p.walk,
    coat: '#f0f2f5',
    coatDark: '#c9ced6',
    pants: '#2b3145',
    hair: '#1b1a24',
    skin: '#e9c09a',
    bag: '#8a5a3b',
    phone: true
  });
  if (p.bike > 0) {
    R(c, p.x - 9, feet - 3, 5, 5, '#2b2f38');
    R(c, p.x + 5, feet - 3, 5, 5, '#2b2f38');
    R(c, p.x - 9, feet - 8, 18, 2, '#2b2f38');
  }
}

/* ---------------------------- 夜色氛围 ---------------------------- */

function drawAtmosphere(c, night, t) {
  if (night) {
    const grd = c.createLinearGradient(0, 0, 0, VH);
    grd.addColorStop(0, 'rgba(30,40,90,0.22)');
    grd.addColorStop(1, 'rgba(10,10,30,0.18)');
    c.fillStyle = grd;
    c.fillRect(0, 0, VW, VH);
  } else {
    const grd = c.createLinearGradient(0, 0, 0, VH);
    grd.addColorStop(0, 'rgba(255,210,150,0.08)');
    grd.addColorStop(1, 'rgba(255,180,120,0.05)');
    c.fillStyle = grd;
    c.fillRect(0, 0, VW, VH);
  }
  const vg = c.createRadialGradient(VW / 2, VH / 2, 120, VW / 2, VH / 2, 320);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.35)');
  c.fillStyle = vg;
  c.fillRect(0, 0, VW, VH);
}
