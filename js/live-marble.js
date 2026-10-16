// ============================================================
// 🔮 玻璃球賽跑：彎彎曲曲的賽道與最後的比賽動畫
//  - 答題時間：玻璃球在起點待命（看不出哪隊領先，大家專心答題）
//  - 時間到：3、2、1、GO！依「每隊平均每人答對幾題」決定速度，
//    途中速度會忽快忽慢（會互相超車），但最後名次一定照答題成績
// ============================================================
import { TEAMS } from './live-common.js?v=202610161920';

/* ── 可以調整的設定 ── */
export const RACE = {
  WIN_SECONDS: 13,     // 第一名跑完全程大約幾秒
  MAX_GAP: 4.5,        // 最後一名最多比第一名慢幾秒（差距依答題成績換算）
  LANE: 34,            // 每條跑道寬度
  R: 16                // 玻璃球半徑
};

const W = 1200, H = 680;
const NS = 'http://www.w3.org/2000/svg';

/* ── 賽道：三段波浪直線＋兩個大迴轉（像蛇一樣來回） ── */
function trackPoints(){
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
  // 累積長度
  const len = [0];
  for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, len, total: len[len.length - 1] };
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
const laneOff = (i, n) => (i - (n - 1) / 2) * RACE.LANE;

/* ============================================================
   畫賽道（答題時間就先畫好，玻璃球在起點待命）
   ============================================================ */
export function buildTrack(svg, n) {
  const T = trackPoints();
  const wide = n * RACE.LANE + 22;
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  let h = '<defs>';
  for (let i = 0; i < n; i++) {
    const c = TEAMS[i];
    h += '<radialGradient id="mg' + i + '" cx="35%" cy="30%" r="75%"><stop offset="0%" stop-color="#fff"/><stop offset="30%" stop-color="' + c.light + '"/><stop offset="72%" stop-color="' + c.color + '"/><stop offset="100%" stop-color="' + c.deep + '"/></radialGradient>';
  }
  h += '<pattern id="checker" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="12" height="12" fill="#fff"/><rect width="6" height="6" fill="#5b4038"/><rect x="6" y="6" width="6" height="6" fill="#5b4038"/></pattern>';
  h += '</defs>';
  // 背景小裝飾
  [['🌸', 600, 238], ['🍄', 380, 238], ['⭐', 820, 238], ['🌷', 520, 462], ['🍓', 300, 462], ['🧁', 760, 462], ['☁️', 1120, 50], ['☁️', 80, 640], ['🌈', 1140, 300], ['🎈', 60, 380]]
    .forEach(([e, x, y]) => { h += '<text x="' + x + '" y="' + y + '" font-size="34" text-anchor="middle" opacity=".55">' + e + '</text>'; });
  // 賽道本體
  const center = offsetPath(T, 0, 2);
  h += '<path d="' + center + '" fill="none" stroke="#e8c9b8" stroke-width="' + (wide + 12) + '" stroke-linecap="round" stroke-linejoin="round"/>';
  h += '<path d="' + center + '" fill="none" stroke="#fffaf6" stroke-width="' + wide + '" stroke-linecap="round" stroke-linejoin="round"/>';
  for (let i = 1; i < n; i++) {
    h += '<path d="' + offsetPath(T, laneOff(i, n) - RACE.LANE / 2, 3) + '" fill="none" stroke="#f0d9cc" stroke-width="2.5" stroke-dasharray="10 10"/>';
  }
  // 方向箭頭
  for (let k = 1; k < 12; k++) {
    const p = pointAt(T, k / 12, 0), q = pointAt(T, k / 12 + 0.003, 0);
    const ang = Math.atan2(q.y - p.y, q.x - p.x) * 180 / Math.PI;
    h += '<text x="0" y="0" font-size="20" fill="#e3b7a8" text-anchor="middle" dominant-baseline="central" transform="translate(' + p.x.toFixed(1) + ',' + p.y.toFixed(1) + ') rotate(' + ang.toFixed(1) + ')">›</text>';
  }
  // 起點線、終點線（格子旗）
  const line = (p, cls, fill) => {
    const a = pointAt(T, p, -wide / 2), b = pointAt(T, p, wide / 2), a2 = pointAt(T, p + (p < 0.5 ? 0.006 : -0.006), -wide / 2), b2 = pointAt(T, p + (p < 0.5 ? 0.006 : -0.006), wide / 2);
    return '<path class="' + cls + '" d="M' + a.x + ' ' + a.y + ' L' + b.x + ' ' + b.y + ' L' + b2.x + ' ' + b2.y + ' L' + a2.x + ' ' + a2.y + ' Z" fill="' + fill + '"/>';
  };
  h += line(0.012, 'start-line', '#f2a7bd');
  h += line(0.994, 'finish-line', 'url(#checker)');
  const s = pointAt(T, 0, -wide / 2 - 18), f = pointAt(T, 1, -wide / 2 - 22);
  h += '<text x="' + (s.x + 40) + '" y="' + s.y + '" font-size="24" font-weight="900" fill="#d0587e" text-anchor="middle">起點</text>';
  h += '<text x="' + (f.x - 20) + '" y="' + f.y + '" font-size="30" text-anchor="middle">🏁</text>';
  // 軌跡（跑的時候拖出彩色尾巴）＋玻璃球
  for (let i = 0; i < n; i++) h += '<path id="mbTrail' + i + '" fill="none" stroke="' + TEAMS[i].color + '" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" opacity=".35" d=""/>';
  for (let i = 0; i < n; i++) {
    const c = TEAMS[i], R = RACE.R;
    h += '<g id="mb' + i + '" class="marble">'
      + '<g class="bob" style="animation-delay:-' + (i * 0.35).toFixed(2) + 's">'
      + '<ellipse cx="0" cy="' + (R + 3) + '" rx="' + (R * 0.8) + '" ry="4" fill="rgba(90,60,40,.18)"/>'
      + '<circle r="' + R + '" fill="url(#mg' + i + ')" stroke="' + c.deep + '" stroke-width="2"/>'
      + '<g id="mbSpin' + i + '"><path d="M-10 4 Q0 -13 10 4" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" opacity=".65"/></g>'
      + '<ellipse cx="-5" cy="-6" rx="5.5" ry="3.4" fill="#fff" opacity=".9"/>'
      + '<text class="mb-crown" y="' + (-R - 6) + '" font-size="22" text-anchor="middle" opacity="0">👑</text>'
      + '<text class="mb-medal" x="' + (R + 14) + '" y="7" font-size="24" text-anchor="middle"></text>'
      + '</g></g>';
  }
  svg.innerHTML = h;
  const track = { T, n, svg, trails: Array.from({ length: n }, () => []) };
  for (let i = 0; i < n; i++) place(track, i, 0);
  return track;
}

function place(track, i, p) {
  const pt = pointAt(track.T, p, laneOff(i, track.n));
  const g = track.svg.querySelector('#mb' + i);
  if (!g) return pt;
  g.setAttribute('transform', 'translate(' + pt.x.toFixed(1) + ',' + pt.y.toFixed(1) + ')');
  track.svg.querySelector('#mbSpin' + i).setAttribute('transform', 'rotate(' + (pt.dist / RACE.R * 57.3 % 360).toFixed(1) + ')');
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
