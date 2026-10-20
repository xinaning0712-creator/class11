// ============================================================
// 🔮 玻璃球賽跑：彎彎曲曲的賽道與最後的比賽動畫
//  - 答題時間：玻璃球在起點待命（看不出哪隊領先，大家專心答題）
//  - 時間到：3、2、1、GO！依「每隊平均每人答對幾題」決定速度，
//    途中速度會忽快忽慢（會互相超車），但最後名次一定照答題成績
// ============================================================
import { TEAMS } from './live-common.js?v=202610201930';

/* ── 可以調整的設定 ── */
export const RACE = {
  WIN_SECONDS: 13,     // 第一名跑完全程大約幾秒
  MAX_GAP: 4.5,        // 最後一名最多比第一名慢幾秒（差距依答題成績換算）
  LANE: 34,            // 每條跑道寬度
  R: 16                // 玻璃球半徑
};

const W = 1200, H = 680;
const NS = 'http://www.w3.org/2000/svg';

/* ── 跑道種類（白板大廳可以選） ── */
export const TRACKS = {
  snake:   { name: '🐍 彎彎蛇形道' },
  coaster: { name: '🎢 雲霄飛車' }
};
function finishPoints(pts){
  const len = [0];
  for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, len, total: len[len.length - 1] };
}
/* 穿過幾個點的平滑曲線（Catmull-Rom） */
function smooth(ctrl, per) {
  const out = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map(j => 0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)));
    }
  }
  out.push(ctrl[ctrl.length - 1].slice());
  return out;
}
/* 🎢 雲霄飛車：月台 → 大俯衝 → 小山丘 → 360 度大迴圈 → 最後的山丘 → 終點
   山頂、谷底都用圓滑的曲線接起來（坡度在頂點是 0），看起來才順 */
const COASTER = { ground: 640, loop: { cx: 880, cy: 460, r: 140, drift: 44 } };
function coasterPoints(){
  const L = COASTER.loop, pts = [];
  // [x, y]：月台、谷底、山頂、谷底（進迴圈）
  const keys = [[70, 236], [250, 236], [440, L.cy + L.r], [625, 380], [800, L.cy + L.r]];
  pts.push(keys[0].slice());
  for (let k = 0; k < keys.length - 1; k++) {
    const [x0, y0] = keys[k], [x1, y1] = keys[k + 1];
    const steps = Math.max(20, Math.round(Math.hypot(x1 - x0, y1 - y0) / 4));
    for (let i = 1; i <= steps; i++) {
      const u = i / steps, e = (1 - Math.cos(Math.PI * u)) / 2;
      pts.push([x0 + (x1 - x0) * u, y0 + (y1 - y0) * e]);
    }
  }
  for (let x = 804; x <= L.cx; x += 4) pts.push([x, L.cy + L.r]);          // 平平的進迴圈
  const loopFrom = pts.length;
  for (let k = 1; k <= 200; k++) {                                         // 360 度大迴圈
    const t = 2 * Math.PI * k / 200;
    pts.push([L.cx + L.r * Math.sin(t) + L.drift * k / 200, L.cy + L.r * Math.cos(t)]);
  }
  const loopTo = pts.length;
  const ex = L.cx + L.drift, keys2 = [[ex, L.cy + L.r], [1080, 515], [1160, L.cy + L.r]];
  for (let k = 0; k < keys2.length - 1; k++) {
    const [x0, y0] = keys2[k], [x1, y1] = keys2[k + 1];
    const steps = Math.max(20, Math.round(Math.hypot(x1 - x0, y1 - y0) / 4));
    for (let i = 1; i <= steps; i++) {
      const u = i / steps, e = (1 - Math.cos(Math.PI * u)) / 2;
      pts.push([x0 + (x1 - x0) * u, y0 + (y1 - y0) * e]);
    }
  }
  for (let x = 1164; x <= 1196; x += 4) pts.push([x, L.cy + L.r]);       // 終點前一小段平路
  const T = finishPoints(pts);
  T.loopFrom = loopFrom; T.loopTo = loopTo;
  return T;
}
function coasterScene(T, wide){
  const G = COASTER.ground, L = COASTER.loop;
  let h = '<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe3ec"/><stop offset=".65" stop-color="#fff4ec"/><stop offset="1" stop-color="#fffaf4"/></linearGradient>'
    + '<linearGradient id="grass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfe9b9"/><stop offset="1" stop-color="#b3d99b"/></linearGradient></defs>';
  // 天空和草地往左右多畫一些，螢幕比較寬時兩邊也不會空空的
  h += '<rect x="-1200" y="-200" width="3600" height="' + (G + 200) + '" fill="url(#sky)"/>';
  h += '<path d="M-1200 ' + G + ' Q-900 ' + (G - 18) + ' -600 ' + G + ' T0 ' + G + ' T600 ' + G + ' T1200 ' + G + ' T1800 ' + G + ' T2400 ' + G + ' V1000 H-1200 Z" fill="url(#grass)"/>';
  // 遠方的遊樂園
  [['☁️', 380, 96, 54, .8], ['☁️', 760, 150, 44, .7], ['☁️', 1130, 86, 40, .7], ['☁️', -60, 160, 46, .6], ['☁️', 1300, 200, 50, .6],
   ['🎡', 1120, 300, 120, .9], ['🎪', 175, 628, 74, .95], ['🎠', 650, 628, 56, .95], ['🍿', 300, 630, 38, .95], ['🍭', 1250, 632, 42, .95],
   ['🎈', 560, 180, 42, .9], ['🎈', 590, 210, 30, .8], ['🌟', L.cx + L.drift / 2, L.cy + 14, 46, .95]]
    .forEach(([e, x, y, sz, o]) => { h += '<text x="' + x + '" y="' + y + '" font-size="' + sz + '" text-anchor="middle" opacity="' + o + '">' + e + '</text>'; });
  // 格子支架（迴圈那段不畫）：兩根柱子＋交叉的斜撐
  let posts = '', braces = '';
  let last = null;
  for (let i = 0; i < T.pts.length; i += 6) {
    if (i > T.loopFrom - 3 && i < T.loopTo + 3) { last = null; continue; }
    const p = pointAt(T, T.len[i] / T.total, wide / 2 + 3);
    if (p.y > G - 34) { last = null; continue; }
    if (last && p.x - last.x < 34) continue;
    posts += 'M' + p.x.toFixed(1) + ' ' + p.y.toFixed(1) + ' V' + G + ' ';
    if (last) {
      const yb = Math.max(p.y, last.y) + 8;
      for (let y = yb; y + 50 < G; y += 56) braces += 'M' + last.x.toFixed(1) + ' ' + y.toFixed(1) + ' L' + p.x.toFixed(1) + ' ' + (y + 50).toFixed(1) + ' M' + p.x.toFixed(1) + ' ' + y.toFixed(1) + ' L' + last.x.toFixed(1) + ' ' + (y + 50).toFixed(1) + ' ';
    }
    last = p;
  }
  h += '<path d="' + braces + '" stroke="#efc9d4" stroke-width="2.5" fill="none" opacity=".9"/>';
  h += '<path d="' + posts + '" stroke="#e2a9bb" stroke-width="5" stroke-linecap="round" fill="none"/>';
  // 月台
  const st = pointAt(T, 0.02, 0);
  h += '<rect x="30" y="' + (st.y + wide / 2 + 4) + '" width="250" height="16" rx="6" fill="#d98aa3"/>';
  h += '<path d="M42 ' + (st.y - wide / 2 - 58) + ' H270 L252 ' + (st.y - wide / 2 - 30) + ' H60 Z" fill="#f4b6c8" stroke="#c25d7c" stroke-width="3" stroke-linejoin="round"/>';
  h += '<text x="156" y="' + (st.y - wide / 2 - 37) + '" font-size="20" font-weight="900" fill="#8b3550" text-anchor="middle">🎢 糖果雲霄飛車</text>';
  [60, 252].forEach(x => { h += '<line x1="' + x + '" y1="' + (st.y - wide / 2 - 30) + '" x2="' + x + '" y2="' + (st.y + wide / 2 + 4) + '" stroke="#c25d7c" stroke-width="4"/>'; });
  // 軌道：淡淡的軌面＋枕木＋兩條鐵軌
  const center = offsetPath(T, 0, 2);
  h += '<path d="' + center + '" fill="none" stroke="#fff7f1" stroke-width="' + (wide - 2) + '" stroke-linecap="butt" stroke-linejoin="round" opacity=".92"/>';
  let ties = '';
  for (let d = 10; d < T.total; d += 20) {
    const q = d / T.total, a = pointAt(T, q, -wide / 2), b = pointAt(T, q, wide / 2);
    ties += 'M' + a.x.toFixed(1) + ' ' + a.y.toFixed(1) + ' L' + b.x.toFixed(1) + ' ' + b.y.toFixed(1) + ' ';
  }
  h += '<path d="' + ties + '" stroke="#f0cdd8" stroke-width="3" stroke-linecap="round" fill="none"/>';
  [-1, 1].forEach(sd => { h += '<path d="' + offsetPath(T, sd * wide / 2, 2) + '" fill="none" stroke="#c25d7c" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>'; });
  return h;
}

/* ── 賽道：三段波浪直線＋兩個大迴轉（像蛇一樣來回） ── */
function trackPoints(kind){
  if (kind === 'coaster') return coasterPoints();
  const pts = [];
  const A = 30, WAVES = 2, TURN = 112;
  const rows = [
    { y: 120, x0: 90,  x1: 1010 },
    { y: 120 + TURN * 2, x0: 1010, x1: 190 },
    { y: 120 + TURN * 4, x0: 190, x1: 1110 }
  ];
  const wave = (row, steps) => {
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const env = Math.pow(Math.sin(Math.PI * u), 2);           // 頭尾變平，接彎道才順
      pts.push([row.x0 + (row.x1 - row.x0) * u, row.y + A * Math.sin(2 * Math.PI * WAVES * u) * env]);
    }
  };
  const turn = (cx, cy, dir) => {      // dir=1：右邊往下迴轉；dir=-1：左邊往下迴轉
    for (let i = 1; i < 60; i++) {
      const a = -Math.PI / 2 + Math.PI * i / 60;
      pts.push([cx + dir * TURN * Math.cos(a), cy + TURN * Math.sin(a)]);
    }
  };
  wave(rows[0], 160); turn(1010, 120 + TURN, 1);
  wave(rows[1], 160); turn(190, 120 + TURN * 3, -1);
  wave(rows[2], 160);
  return finishPoints(pts);
}

/* 雲霄飛車：上坡慢、下坡快。把「進度」換成「實際走到哪」：
   下坡的地方很快就走過去，上坡的地方要花比較久（總時間不變，名次照樣照成績） */
function buildWarp(T, kind){
  const n = T.pts.length;
  if (kind !== 'coaster') return null;
  const E = [0];
  for (let i = 1; i < n; i++) {
    const seg = T.len[i] - T.len[i - 1] || 1e-6;
    const dy = (T.pts[i][1] - T.pts[i - 1][1]) / seg;       // 往下（畫面 y 變大）是正的
    const f = Math.max(0.38, Math.min(2.6, 1 + 1.5 * dy));  // 下坡最快 2.6 倍、上坡最慢 0.38 倍
    E.push(E[i - 1] + seg / f);
  }
  const tot = E[n - 1];
  return E.map(e => e / tot);
}
function warpProg(T, e){
  if (!T.warp || e <= 0 || e >= 1) return e;
  const W = T.warp;
  let lo = 0, hi = W.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (W[m] <= e) lo = m; else hi = m; }
  const t = (e - W[lo]) / ((W[hi] - W[lo]) || 1);
  return (T.len[lo] + (T.len[hi] - T.len[lo]) * t) / T.total;
}

/* 在賽道上走到 p（0～1）時的位置；off = 往左右偏幾格（跑道） */
function pointAt(T, p, off) {
  const d = Math.max(0, Math.min(1, p)) * T.total;
  let lo = 0, hi = T.len.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T.len[m] <= d) lo = m; else hi = m; }
  const a = T.pts[lo], b = T.pts[hi];
  const seg = (T.len[hi] - T.len[lo]) || 1, t = (d - T.len[lo]) / seg;
  const dx = (b[0] - a[0]) / seg, dy = (b[1] - a[1]) / seg;
  return { x: a[0] + (b[0] - a[0]) * t - dy * off, y: a[1] + (b[1] - a[1]) * t + dx * off, dist: d };
}
function offsetPath(T, off, step) {
  let d = '';
  for (let i = 0; i < T.pts.length; i += step) {
    const p = pointAt(T, T.len[i] / T.total, off);
    d += (d ? ' L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1);
  }
  const e = pointAt(T, 1, off);
  return d + ' L' + e.x.toFixed(1) + ' ' + e.y.toFixed(1);
}
// 第 i 顆球在第幾條跑道（球比跑道多時，幾顆球共用一條）
// 起跑線位置；球比跑道多時，後面幾排往後站（像賽車的起跑格）
const START = 0.03, ROW_GAP = 0.0075;
const laneOff = (i, tk) => ((i % tk.lanes) - (tk.lanes - 1) / 2) * tk.lane;

/* ============================================================
   畫賽道（答題時間就先畫好，玻璃球在起點待命）
   ============================================================ */
// cfg（可省略）：palette 每顆球的顏色 [{color,light,deep}]、lanes 跑道數、lane 跑道寬、r 球半徑
export function buildTrack(svg, n, cfg = {}) {
  const kind = TRACKS[cfg.kind] ? cfg.kind : 'snake';
  const T = trackPoints(kind);
  T.warp = buildWarp(T, kind);
  const palette = cfg.palette || TEAMS;
  const tk = { lanes: cfg.lanes || n, lane: cfg.lane || RACE.LANE, r: cfg.r || RACE.R };
  if (kind === 'coaster') {           // 雲霄飛車軌道比較窄：最多 3 條
    tk.lanes = Math.min(tk.lanes, 3);
    tk.lane = Math.min(tk.lane, 16);
    tk.r = Math.min(tk.r, 11);
  }
  const wide = tk.lanes * tk.lane + (kind === 'coaster' ? 10 : 22);
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  let h = '<defs>';
  for (let i = 0; i < n; i++) {
    const c = palette[i];
    h += '<radialGradient id="mg' + i + '" cx="35%" cy="30%" r="75%"><stop offset="0%" stop-color="#fff"/><stop offset="30%" stop-color="' + c.light + '"/><stop offset="72%" stop-color="' + c.color + '"/><stop offset="100%" stop-color="' + c.deep + '"/></radialGradient>';
  }
  h += '<pattern id="checker" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="12" height="12" fill="#fff"/><rect width="6" height="6" fill="#5b4038"/><rect x="6" y="6" width="6" height="6" fill="#5b4038"/></pattern>';
  h += '</defs>';
  const center = offsetPath(T, 0, 2);
  if (kind === 'coaster') {
    h += coasterScene(T, wide);
  } else {
    // 背景小裝飾
    [['🌸', 600, 238], ['🍄', 380, 238], ['⭐', 820, 238], ['🌷', 520, 462], ['🍓', 300, 462], ['🧁', 760, 462], ['☁️', 1120, 50], ['☁️', 80, 640], ['🌈', 1140, 300], ['🎈', 60, 380]]
      .forEach(([e, x, y]) => { h += '<text x="' + x + '" y="' + y + '" font-size="34" text-anchor="middle" opacity=".55">' + e + '</text>'; });
    // 賽道本體
    h += '<path d="' + center + '" fill="none" stroke="#e8c9b8" stroke-width="' + (wide + 12) + '" stroke-linecap="round" stroke-linejoin="round"/>';
    h += '<path d="' + center + '" fill="none" stroke="#fffaf6" stroke-width="' + wide + '" stroke-linecap="round" stroke-linejoin="round"/>';
  }
  for (let i = 1; i < tk.lanes && kind !== 'coaster'; i++) {
    h += '<path d="' + offsetPath(T, laneOff(i, tk) - tk.lane / 2, 3) + '" fill="none" stroke="#f0d9cc" stroke-width="2.5" stroke-dasharray="10 10"/>';
  }
  // 方向箭頭
  for (let k = 1; k < 12 && kind !== 'coaster'; k++) {
    const p = pointAt(T, k / 12, 0), q = pointAt(T, k / 12 + 0.003, 0);
    const ang = Math.atan2(q.y - p.y, q.x - p.x) * 180 / Math.PI;
    h += '<text x="0" y="0" font-size="20" fill="#e3b7a8" text-anchor="middle" dominant-baseline="central" transform="translate(' + p.x.toFixed(1) + ',' + p.y.toFixed(1) + ') rotate(' + ang.toFixed(1) + ')">›</text>';
  }
  // 起點線、終點線（格子旗）
  const line = (p, cls, fill) => {
    const a = pointAt(T, p, -wide / 2), b = pointAt(T, p, wide / 2), a2 = pointAt(T, p + (p < 0.5 ? 0.006 : -0.006), -wide / 2), b2 = pointAt(T, p + (p < 0.5 ? 0.006 : -0.006), wide / 2);
    return '<path class="' + cls + '" d="M' + a.x + ' ' + a.y + ' L' + b.x + ' ' + b.y + ' L' + b2.x + ' ' + b2.y + ' L' + a2.x + ' ' + a2.y + ' Z" fill="' + fill + '"/>';
  };
  h += line(START + 0.004, 'start-line', '#f2a7bd');
  h += line(0.994, 'finish-line', 'url(#checker)');
  const s = pointAt(T, 0, -wide / 2 - 18), f = pointAt(T, 1, -wide / 2 - 22);
  if (kind !== 'coaster') h += '<text x="' + (s.x + 40) + '" y="' + s.y + '" font-size="24" font-weight="900" fill="#d0587e" text-anchor="middle">起點</text>';
  h += '<text x="' + (f.x - 20) + '" y="' + f.y + '" font-size="30" text-anchor="middle">🏁</text>';
  // 軌跡（跑的時候拖出彩色尾巴）＋玻璃球
  for (let i = 0; i < n; i++) h += '<path id="mbTrail' + i + '" fill="none" stroke="' + palette[i].color + '" stroke-width="' + Math.round(tk.r * 0.75) + '" stroke-linecap="round" stroke-linejoin="round" opacity=".35" d=""/>';
  for (let i = 0; i < n; i++) {
    const c = palette[i], R = tk.r;
    h += '<g id="mb' + i + '" class="marble">'
      + '<g class="bob" style="animation-delay:-' + (i * 0.35).toFixed(2) + 's">'
      + '<ellipse cx="0" cy="' + (R + 3) + '" rx="' + (R * 0.8) + '" ry="4" fill="rgba(90,60,40,.18)"/>'
      + '<circle r="' + R + '" fill="url(#mg' + i + ')" stroke="' + c.deep + '" stroke-width="2"/>'
      + '<g transform="scale(' + (R / 16).toFixed(3) + ')">'
      + '<g id="mbSpin' + i + '"><path d="M-10 4 Q0 -13 10 4" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" opacity=".65"/></g>'
      + '<ellipse cx="-5" cy="-6" rx="5.5" ry="3.4" fill="#fff" opacity=".9"/></g>'
      + '<text class="mb-crown" y="' + (-R - 6) + '" font-size="22" text-anchor="middle" opacity="0">👑</text>'
      + '<text class="mb-medal" x="' + (R + 14) + '" y="7" font-size="24" text-anchor="middle"></text>'
      + '</g></g>';
  }
  svg.innerHTML = h;
  const track = Object.assign(tk, { kind, T, n, svg, trails: Array.from({ length: n }, () => []),
    p0: Array.from({ length: n }, (_, i) => Math.max(0, START - 0.004 - Math.floor(i / tk.lanes) * ROW_GAP)) });
  for (let i = 0; i < n; i++) place(track, i, 0);
  return track;
}

function place(track, i, prog) {
  const p = track.p0[i] + (1 - track.p0[i]) * warpProg(track.T, prog);     // 從自己的起跑位置跑到終點（雲霄飛車：上坡慢、下坡快）
  const pt = pointAt(track.T, p, laneOff(i, track));
  const g = track.svg.querySelector('#mb' + i);
  if (!g) return pt;
  g.setAttribute('transform', 'translate(' + pt.x.toFixed(1) + ',' + pt.y.toFixed(1) + ')');
  track.svg.querySelector('#mbSpin' + i).setAttribute('transform', 'rotate(' + (pt.dist / track.r * 57.3 % 360).toFixed(1) + ')');
  return pt;
}

/* ============================================================
   決定每隊怎麼跑：速度忽快忽慢，但抵達時間照成績
   scores：每隊「平均每人答對幾題」
   ============================================================ */
export function planRace(scores) {
  const n = scores.length, best = Math.max(...scores);
  const finish = scores.map(s => best > 0 ? RACE.WIN_SECONDS + RACE.MAX_GAP * (best - s) / best : RACE.WIN_SECONDS);
  const dt = 1 / 60;
  const curves = finish.map((Tf, i) => {
    const w1 = 0.7 + Math.random() * 0.6, w2 = 1.4 + Math.random() * 0.9;
    const p1 = Math.random() * 6.28, p2 = Math.random() * 6.28;
    const speed = t => Math.min(1, t / 1.2) * (1 + 0.5 * Math.sin(w1 * t + p1) + 0.28 * Math.sin(w2 * t + p2));
    const F = [0];
    const steps = Math.ceil(Tf / dt);
    for (let k = 1; k <= steps; k++) F.push(F[k - 1] + Math.max(0.12, speed(k * dt)) * dt);
    const total = F[F.length - 1];
    return t => {
      if (t >= Tf) return 1;
      const k = t / dt, a = Math.floor(k), b = Math.min(F.length - 1, a + 1);
      return (F[a] + (F[b] - F[a]) * (k - a)) / total;
    };
  });
  return { finish, curves, n };
}

/* ============================================================
   播放比賽：onLead(隊伍)、onFinish(隊伍, 名次)、onDone()
   ============================================================ */
export function playRace(track, plan, { onLead, onFinish, onDone }) {
  track.svg.classList.add('racing');
  let start = null, alive = true, leader = -1;
  const done = new Array(plan.n).fill(false);
  let finishedCount = 0;
  const ranks = new Array(plan.n).fill(0);
  const crown = i => track.svg.querySelector('#mb' + i + ' .mb-crown');
  const step = ts => {
    if (!alive) return;
    if (start === null) start = ts;
    const t = (ts - start) / 1000;
    const prog = [];
    for (let i = 0; i < plan.n; i++) {
      const p = plan.curves[i](t);
      prog.push(p);
      const pt = place(track, i, p);
      const tr = track.trails[i];
      tr.push(pt.x.toFixed(1) + ' ' + pt.y.toFixed(1));
      if (tr.length > 14) tr.shift();
      track.svg.querySelector('#mbTrail' + i).setAttribute('d', 'M' + tr.join(' L'));
      if (p >= 1 && !done[i]) {
        done[i] = true;
        // 同時抵達算同名次
        const same = plan.finish.findIndex((f, j) => j !== i && done[j] && Math.abs(f - plan.finish[i]) < 1e-6);
        ranks[i] = same >= 0 ? ranks[same] : finishedCount + 1;
        finishedCount++;
        if (onFinish) onFinish(i, ranks[i]);
      }
    }
    // 目前誰領先（還沒到終點的時候才換皇冠）
    let lead = 0;
    for (let i = 1; i < plan.n; i++) if (prog[i] > prog[lead] + 1e-9) lead = i;
    if (lead !== leader && finishedCount === 0) {
      if (leader >= 0) crown(leader).setAttribute('opacity', '0');
      crown(lead).setAttribute('opacity', '1');
      if (leader >= 0 && onLead) onLead(lead);
      leader = lead;
    }
    if (finishedCount < plan.n) requestAnimationFrame(step);
    else { alive = false; setTimeout(() => onDone && onDone(ranks), 900); }
  };
  requestAnimationFrame(step);
  return () => { alive = false; };
}

export function setMedal(track, i, rank) {
  const m = track.svg.querySelector('#mb' + i + ' .mb-medal');
  if (m) m.textContent = ['', '🥇', '🥈', '🥉', '🏅'][rank] || '🏅';
}
