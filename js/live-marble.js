// ============================================================
// 🔮 玻璃球賽跑：彎彎曲曲的賽道與最後的比賽動畫
//  - 答題時間：玻璃球在起點待命（看不出哪隊領先，大家專心答題）
//  - 時間到：3、2、1、GO！依「每隊平均每人答對幾題」決定速度，
//    途中速度會忽快忽慢（會互相超車），但最後名次一定照答題成績
// ============================================================
import { candyBallSVG, LINE } from './candy-faces.js?v=202610202039';
import { TEAMS } from './live-common.js?v=202610202039';

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
function ferrisWheel(cx, cy, r, ground){
  const cabins = ['#ffb3cf', '#ffe25c', '#8ec9ff', '#a8e063', '#c6a8ff', '#ffad85', '#7be0bd', '#f6bfe0'];
  let h = '<g class="ferris" opacity=".78">';
  // 支腳
  h += '<path d="M' + (cx - 70) + ' ' + ground + ' L' + cx + ' ' + cy + ' L' + (cx + 70) + ' ' + ground + '" fill="none" stroke="#e2a9bb" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>';
  h += '<line x1="' + (cx - 42) + '" y1="' + (cy + (ground - cy) * 0.6) + '" x2="' + (cx + 42) + '" y2="' + (cy + (ground - cy) * 0.6) + '" stroke="#e2a9bb" stroke-width="5"/>';
  // 輪子（慢慢轉）
  h += '<g><animateTransform attributeName="transform" type="rotate" from="0 ' + cx + ' ' + cy + '" to="360 ' + cx + ' ' + cy + '" dur="40s" repeatCount="indefinite"/>';
  h += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="#e8b4c4" stroke-width="6"/>';
  h += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (r - 16) + '" fill="none" stroke="#f3d2dc" stroke-width="3"/>';
  for (let k = 0; k < 8; k++) {
    const a = Math.PI * 2 * k / 8, x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
    h += '<line x1="' + cx + '" y1="' + cy + '" x2="' + x.toFixed(1) + '" y2="' + y.toFixed(1) + '" stroke="#efc9d4" stroke-width="3"/>';
  }
  h += '</g>';
  // 車廂（不跟著輪子翻轉，永遠正正的掛著）
  for (let k = 0; k < 8; k++) {
    h += '<g><animateTransform attributeName="transform" type="rotate" from="' + (k * 45) + ' ' + cx + ' ' + cy + '" to="' + (k * 45 + 360) + ' ' + cx + ' ' + cy + '" dur="40s" repeatCount="indefinite"/>'
      + '<g transform="translate(' + (cx + r) + ' ' + cy + ')"><g><animateTransform attributeName="transform" type="rotate" from="' + (-k * 45) + '" to="' + (-k * 45 - 360) + '" dur="40s" repeatCount="indefinite"/>'
      + '<line x1="0" y1="0" x2="0" y2="9" stroke="#d98aa3" stroke-width="2"/><rect x="-11" y="8" width="22" height="17" rx="7" fill="' + cabins[k] + '" stroke="#fff" stroke-width="2"/></g></g></g>';
  }
  h += '<circle cx="' + cx + '" cy="' + cy + '" r="10" fill="#c25d7c"/></g>';
  return h;
}
/* ============================================================
   🌸 手繪療癒風場景（糖果球個人賽用）：奶油色天空、草地、櫻花樹、小白花、深咖啡外框
   畫在另一層背景（#mbBg），比賽時只有球在動，白板電腦才不會卡
   ============================================================ */
function cozyCloud(x, y, s){ return '<g transform="translate(' + x + ' ' + y + ') scale(' + s + ')"><path d="M-60 10 Q-62 -14 -38 -16 Q-30 -40 -4 -34 Q14 -50 34 -32 Q62 -34 60 -6 Q74 12 50 18 H-46 Q-70 20 -60 10Z" fill="#fff" stroke="' + LINE + '" stroke-width="3.5" stroke-linejoin="round"/></g>'; }
function cozyTree(x, y, s){
  let t = '<g transform="translate(' + x + ' ' + y + ') scale(' + s + ')"><path d="M-8 0 Q-6 -40 -2 -60 L6 -60 Q8 -40 10 0Z" fill="#9c7258" stroke="' + LINE + '" stroke-width="3.5"/>';
  t += '<path d="M-62 -70 Q-74 -110 -40 -122 Q-30 -156 6 -150 Q40 -164 54 -128 Q86 -112 66 -78 Q62 -52 30 -56 Q4 -42 -22 -54 Q-58 -46 -62 -70Z" fill="#f7c4cf" stroke="' + LINE + '" stroke-width="4" stroke-linejoin="round"/>';
  [[-34, -96], [0, -124], [30, -98], [-10, -76], [44, -72], [-46, -70], [14, -140]].forEach(([fx, fy]) => { t += '<g transform="translate(' + fx + ' ' + fy + ')"><circle r="7" fill="#fff" stroke="' + LINE + '" stroke-width="2"/><circle r="2.6" fill="#f2a4b6"/></g>'; });
  return t + '</g>';
}
function cozyFlowers(x, y){ return '<g transform="translate(' + x + ' ' + y + ')"><circle r="4.5" fill="#fff" stroke="' + LINE + '" stroke-width="1.8"/><circle cx="10" cy="4" r="3.5" fill="#fff" stroke="' + LINE + '" stroke-width="1.6"/><circle cx="4" cy="-7" r="3" fill="#fff" stroke="' + LINE + '" stroke-width="1.5"/></g>'; }
function cozyFlag(x, y, flip){ const d = flip ? -1 : 1;
  return '<g transform="translate(' + x + ' ' + y + ')"><rect x="-4" y="-70" width="8" height="74" rx="3" fill="#fff4dc" stroke="' + LINE + '" stroke-width="3"/>'
    + '<path d="M' + (4 * d) + ' -68 H' + (56 * d) + ' L' + (46 * d) + ' -54 L' + (56 * d) + ' -40 H' + (4 * d) + 'Z" fill="#f7c4cf" stroke="' + LINE + '" stroke-width="3.5" stroke-linejoin="round"/>'
    + '<text x="' + (28 * d) + '" y="-48" font-size="15" font-weight="700" fill="' + LINE + '" text-anchor="middle">終點</text></g>'; }
function cozyWheel(cx, cy, r, ground){
  let s = '<path d="M' + (cx - 64) + ' ' + ground + ' L' + cx + ' ' + cy + ' L' + (cx + 64) + ' ' + ground + '" fill="none" stroke="' + LINE + '" stroke-width="7" stroke-linejoin="round"/><path d="M' + (cx - 64) + ' ' + ground + ' L' + cx + ' ' + cy + ' L' + (cx + 64) + ' ' + ground + '" fill="none" stroke="#f3d7b6" stroke-width="3"/>';
  s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + LINE + '" stroke-width="5"/><circle cx="' + cx + '" cy="' + cy + '" r="' + (r - 12) + '" fill="none" stroke="#f7c4cf" stroke-width="6"/>';
  const cab = ['#f7c4cf', '#ffe08a', '#a8d8d2', '#c9e3a0', '#d5c2f0', '#ffc9a6', '#a8d8d2', '#f7c4cf'];
  for (let k = 0; k < 8; k++) { const a = Math.PI * 2 * k / 8, x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
    s += '<line x1="' + cx + '" y1="' + cy + '" x2="' + x.toFixed(1) + '" y2="' + y.toFixed(1) + '" stroke="' + LINE + '" stroke-width="2.5"/><rect x="' + (x - 13).toFixed(1) + '" y="' + (y + 2).toFixed(1) + '" width="26" height="20" rx="8" fill="' + cab[k] + '" stroke="' + LINE + '" stroke-width="3"/>'; }
  return s + '<circle cx="' + cx + '" cy="' + cy + '" r="9" fill="#ef9fb3" stroke="' + LINE + '" stroke-width="3"/>';
}
function cozyScene(T, wide, kind){
  const G = kind === 'coaster' ? COASTER.ground : H - 6;
  let h = '<defs><filter id="hand" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="4"/><feDisplacementMap in="SourceGraphic" scale="3"/></filter></defs>';
  h += '<rect x="-1200" y="-400" width="3600" height="1600" fill="' + (kind === 'coaster' ? '#fdf3e4' : '#d6e8b4') + '"/><g filter="url(#hand)">';
  if (kind === 'coaster') {
    h += '<path d="M-1200 470 Q -500 380 -300 440 Q 0 360 260 440 T 760 420 T 1240 430 T 1600 440 T 2400 440 V800 H-1200Z" fill="#dcebc0" stroke="' + LINE + '" stroke-width="3"/>';
    h += cozyCloud(380, 90, 1) + cozyCloud(760, 140, .8) + cozyCloud(1120, 80, .9) + cozyCloud(-60, 150, .9) + cozyCloud(1320, 190, 1);
    h += '<path d="M-1200 ' + G + ' Q -900 ' + (G - 16) + ' -600 ' + G + ' T 0 ' + G + ' T 600 ' + G + ' T 1200 ' + G + ' T 1800 ' + G + ' T 2400 ' + G + ' V1200 H-1200Z" fill="#c8dea3" stroke="' + LINE + '" stroke-width="4"/>';
    h += cozyWheel(1150, 400, 86, G);
    h += cozyTree(120, G + 6, 1.05) + cozyTree(700, G + 8, .85) + cozyTree(1010, G + 10, .7) + cozyTree(-40, G + 4, 1.2) + cozyTree(1300, G + 6, 1) + cozyTree(-200, G + 8, .9);
    [[300, 660], [520, 668], [620, 656], [880, 664], [1100, 662], [40, 670], [400, 672], [960, 672]].forEach(([x, y]) => { h += cozyFlowers(x, y); });
    // 支架
    let last = null;
    for (let i = 0; i < T.pts.length; i += 6) {
      if (i > T.loopFrom - 3 && i < T.loopTo + 3) { last = null; continue; }
      const p = pointAt(T, T.len[i] / T.total, wide / 2 + 2);
      if (p.y > G - 34) { last = null; continue; }
      if (last && p.x - last.x < 44) continue;
      h += '<rect x="' + (p.x - 4).toFixed(1) + '" y="' + p.y.toFixed(1) + '" width="8" height="' + (G - p.y).toFixed(1) + '" rx="3" fill="#fff4dc" stroke="' + LINE + '" stroke-width="3"/>';
      last = p;
    }
    // 月台
    const st = pointAt(T, 0.02, 0);
    h += '<rect x="30" y="' + (st.y + wide / 2 + 2) + '" width="250" height="18" rx="7" fill="#f7c4cf" stroke="' + LINE + '" stroke-width="4"/>';
    h += '<path d="M36 ' + (st.y - 92) + ' H274 L258 ' + (st.y - 56) + ' H52Z" fill="#a8d8d2" stroke="' + LINE + '" stroke-width="4" stroke-linejoin="round"/>';
    h += '<path d="M60 ' + (st.y - 80) + ' H250 M66 ' + (st.y - 68) + ' H244" stroke="#fff" stroke-width="5" stroke-linecap="round"/>';
    [66, 244].forEach(x => { h += '<rect x="' + (x - 5) + '" y="' + (st.y - 56) + '" width="10" height="82" rx="4" fill="#fff4dc" stroke="' + LINE + '" stroke-width="3"/>'; });
    h += '<g transform="translate(155 ' + (st.y - 118) + ')"><rect x="-96" y="-22" width="192" height="40" rx="14" fill="#fff4dc" stroke="' + LINE + '" stroke-width="4"/><text y="7" font-size="22" font-weight="700" fill="' + LINE + '" text-anchor="middle">🍬 糖果雲霄飛車</text></g>';
  } else {
    // 蛇形道：整片草地上的小公園
    h += cozyCloud(1110, 46, .7) + cozyCloud(80, 640, .6);
    h += cozyTree(600, 270, .5) + cozyTree(380, 270, .45) + cozyTree(820, 270, .45) + cozyTree(520, 494, .5) + cozyTree(300, 494, .45) + cozyTree(760, 494, .45);
    [[460, 240], [700, 236], [960, 244], [250, 236], [420, 460], [640, 470], [880, 462], [1060, 470], [200, 464]].forEach(([x, y]) => { h += cozyFlowers(x, y); });
  }
  // 軌道：咖啡外框＋奶油軌面＋粉紅鐵軌
  const center = offsetPath(T, 0, 2);
  h += '<path d="' + center + '" fill="none" stroke="' + LINE + '" stroke-width="' + (wide + 8) + '" stroke-linejoin="round" stroke-linecap="' + (kind === 'coaster' ? 'butt' : 'round') + '"/>';
  h += '<path d="' + center + '" fill="none" stroke="#fff4dc" stroke-width="' + wide + '" stroke-linejoin="round" stroke-linecap="' + (kind === 'coaster' ? 'butt' : 'round') + '"/>';
  let ties = '';
  for (let d = 12; d < T.total; d += 22) { const a = pointAt(T, d / T.total, -wide / 2 + 4), b = pointAt(T, d / T.total, wide / 2 - 4); ties += 'M' + a.x.toFixed(1) + ' ' + a.y.toFixed(1) + ' L' + b.x.toFixed(1) + ' ' + b.y.toFixed(1) + ' '; }
  h += '<path d="' + ties + '" stroke="#ecd3b0" stroke-width="4" stroke-linecap="round"/>';
  [-1, 1].forEach(sd => { h += '<path d="' + offsetPath(T, sd * (wide / 2 - 8), 2) + '" fill="none" stroke="#f2a4b6" stroke-width="5" stroke-linejoin="round"/>'; });
  // 起點（粉紅線）、終點旗
  const a = pointAt(T, START + 0.004, -wide / 2), b = pointAt(T, START + 0.004, wide / 2);
  h += '<path d="M' + a.x.toFixed(1) + ' ' + a.y.toFixed(1) + ' L' + b.x.toFixed(1) + ' ' + b.y.toFixed(1) + '" stroke="' + LINE + '" stroke-width="11" stroke-linecap="round"/><path d="M' + a.x.toFixed(1) + ' ' + a.y.toFixed(1) + ' L' + b.x.toFixed(1) + ' ' + b.y.toFixed(1) + '" stroke="#f7c4cf" stroke-width="6" stroke-linecap="round"/>';
  const fp = pointAt(T, 0.995, -wide / 2 - 2);
  h += cozyFlag(fp.x, fp.y - 4, kind === 'snake' ? false : false);
  if (kind === 'coaster') h += '<path transform="translate(' + (COASTER.loop.cx + COASTER.loop.drift / 2) + ' ' + COASTER.loop.cy + ') scale(1.4)" d="M0 -26 L7 -8 L26 -8 L11 4 L17 23 L0 12 L-17 23 L-11 4 L-26 -8 L-7 -8Z" fill="#ffe08a" stroke="' + LINE + '" stroke-width="3.5" stroke-linejoin="round"/>';
  else { const sp = pointAt(T, 0, -wide / 2 - 16); h += '<g transform="translate(' + (sp.x + 44) + ' ' + (sp.y - 6) + ')"><rect x="-40" y="-20" width="80" height="34" rx="12" fill="#fff4dc" stroke="' + LINE + '" stroke-width="3.5"/><text y="5" font-size="18" font-weight="700" fill="' + LINE + '" text-anchor="middle">起點</text></g>'; }
  return h + '</g>';
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
   ['🎪', 175, 628, 74, .95], ['🎠', 650, 628, 56, .95], ['🍿', 300, 630, 38, .95], ['🍭', 1250, 632, 42, .95],
   ['🎈', 560, 180, 42, .9], ['🎈', 590, 210, 30, .8], ['🌟', L.cx + L.drift / 2, L.cy + 14, 46, .95]]
    .forEach(([e, x, y, sz, o]) => { h += '<text x="' + x + '" y="' + y + '" font-size="' + sz + '" text-anchor="middle" opacity="' + o + '">' + e + '</text>'; });
  // 🎡 手畫的摩天輪（淡淡的玫瑰色，站在草地上當背景）
  h += ferrisWheel(1150, 400, 88, G);
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
  const cozy = cfg.style === 'cozy';            // 🌸 手繪療癒風（糖果球個人賽）
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
  // 背景層：手繪風的場景畫在另一張 svg（不會跟著球一起重畫）
  let bg = svg.parentNode && svg.parentNode.querySelector('.mb-bg');
  if (cozy) {
    if (!bg) { bg = document.createElementNS(NS, 'svg'); bg.setAttribute('class', 'mb-bg'); bg.setAttribute('preserveAspectRatio', 'xMidYMid meet'); bg.setAttribute('aria-hidden', 'true'); svg.parentNode.insertBefore(bg, svg); }
    bg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    bg.innerHTML = cozyScene(T, wide, kind);
    svg.classList.add('cozy');
  } else {
    if (bg) bg.remove();
    svg.classList.remove('cozy');
  }
  if (cozy) {
    // 場景都在背景層了
  } else if (kind === 'coaster') {
    h += coasterScene(T, wide);
  } else {
    // 背景小裝飾
    [['🌸', 600, 238], ['🍄', 380, 238], ['⭐', 820, 238], ['🌷', 520, 462], ['🍓', 300, 462], ['🧁', 760, 462], ['☁️', 1120, 50], ['☁️', 80, 640], ['🌈', 1140, 300], ['🎈', 60, 380]]
      .forEach(([e, x, y]) => { h += '<text x="' + x + '" y="' + y + '" font-size="34" text-anchor="middle" opacity=".55">' + e + '</text>'; });
    // 賽道本體
    h += '<path d="' + center + '" fill="none" stroke="#e8c9b8" stroke-width="' + (wide + 12) + '" stroke-linecap="round" stroke-linejoin="round"/>';
    h += '<path d="' + center + '" fill="none" stroke="#fffaf6" stroke-width="' + wide + '" stroke-linecap="round" stroke-linejoin="round"/>';
  }
  for (let i = 1; i < tk.lanes && kind !== 'coaster' && !cozy; i++) {
    h += '<path d="' + offsetPath(T, laneOff(i, tk) - tk.lane / 2, 3) + '" fill="none" stroke="#f0d9cc" stroke-width="2.5" stroke-dasharray="10 10"/>';
  }
  // 方向箭頭
  for (let k = 1; k < 12 && kind !== 'coaster' && !cozy; k++) {
    const p = pointAt(T, k / 12, 0), q = pointAt(T, k / 12 + 0.003, 0);
    const ang = Math.atan2(q.y - p.y, q.x - p.x) * 180 / Math.PI;
    h += '<text x="0" y="0" font-size="20" fill="#e3b7a8" text-anchor="middle" dominant-baseline="central" transform="translate(' + p.x.toFixed(1) + ',' + p.y.toFixed(1) + ') rotate(' + ang.toFixed(1) + ')">›</text>';
  }
  // 起點線、終點線（格子旗）
  const line = (p, cls, fill) => {
    const a = pointAt(T, p, -wide / 2), b = pointAt(T, p, wide / 2), a2 = pointAt(T, p + (p < 0.5 ? 0.006 : -0.006), -wide / 2), b2 = pointAt(T, p + (p < 0.5 ? 0.006 : -0.006), wide / 2);
    return '<path class="' + cls + '" d="M' + a.x + ' ' + a.y + ' L' + b.x + ' ' + b.y + ' L' + b2.x + ' ' + b2.y + ' L' + a2.x + ' ' + a2.y + ' Z" fill="' + fill + '"/>';
  };
  if (!cozy) {
    h += line(START + 0.004, 'start-line', '#f2a7bd');
    h += line(0.994, 'finish-line', 'url(#checker)');
    const s = pointAt(T, 0, -wide / 2 - 18), f = pointAt(T, 1, -wide / 2 - 22);
    if (kind !== 'coaster') h += '<text x="' + (s.x + 40) + '" y="' + s.y + '" font-size="24" font-weight="900" fill="#d0587e" text-anchor="middle">起點</text>';
    h += '<text x="' + (f.x - 20) + '" y="' + f.y + '" font-size="30" text-anchor="middle">🏁</text>';
  }
  // 軌跡（跑的時候拖出彩色尾巴）＋玻璃球
  for (let i = 0; i < n; i++) h += '<path id="mbTrail' + i + '" fill="none" stroke="' + palette[i].color + '" stroke-width="' + Math.round(tk.r * 0.75) + '" stroke-linecap="round" stroke-linejoin="round" opacity=".35" d=""/>';
  for (let i = 0; i < n; i++) {
    const c = palette[i], R = tk.r;
    h += '<g id="mb' + i + '" class="marble">'
      + '<g class="bob" style="animation-delay:-' + (i * 0.35).toFixed(2) + 's">'
      + (cozy ? candyBallSVG(c.color, cfg.faces ? cfg.faces[i] : i, R + 1)
      : '<ellipse cx="0" cy="' + (R + 3) + '" rx="' + (R * 0.8) + '" ry="4" fill="rgba(90,60,40,.18)"/>'
      + '<circle r="' + R + '" fill="url(#mg' + i + ')" stroke="' + c.deep + '" stroke-width="2"/>'
      + '<g transform="scale(' + (R / 16).toFixed(3) + ')">'
      + '<g id="mbSpin' + i + '"><path d="M-10 4 Q0 -13 10 4" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" opacity=".65"/></g>'
      + '<ellipse cx="-5" cy="-6" rx="5.5" ry="3.4" fill="#fff" opacity=".9"/></g>')
      + '<text class="mb-crown" y="' + (-R - 6) + '" font-size="22" text-anchor="middle" opacity="0">👑</text>'
      + '<text class="mb-medal" x="' + (R + 14) + '" y="7" font-size="24" text-anchor="middle"></text>'
      + '<g class="mb-tag" opacity="0"><circle cy="' + (-R - 20) + '" r="15" fill="#fff" stroke="' + (cozy ? LINE : '#c25d7c') + '" stroke-width="3"/><text y="' + (-R - 14) + '" font-size="18" font-weight="900" fill="' + (cozy ? LINE : '#c25d7c') + '" text-anchor="middle"></text></g>'
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
  const spin = track.svg.querySelector('#mbSpin' + i);
  if (spin) spin.setAttribute('transform', 'rotate(' + (pt.dist / track.r * 57.3 % 360).toFixed(1) + ')');
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
// pauseAt（秒）：跑到這個時間先停下來，呼叫 onPause(目前進度, 繼續跑的函式)
export function playRace(track, plan, { onLead, onFinish, onDone, pauseAt, onPause }) {
  track.svg.classList.add('racing');
  let start = null, alive = true, leader = -1;
  let pausedAt = 0, paused = false, pausedTotal = 0, pauseUsed = !(pauseAt > 0);
  const done = new Array(plan.n).fill(false);
  let finishedCount = 0;
  const ranks = new Array(plan.n).fill(0);
  const crown = i => track.svg.querySelector('#mb' + i + ' .mb-crown');
  const step = ts => {
    if (!alive) return;
    if (start === null) start = ts;
    if (paused) return;
    let t = (ts - start - pausedTotal) / 1000;
    if (!pauseUsed && t >= pauseAt) t = pauseAt;
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
    if (!pauseUsed && t >= pauseAt) {        // 中場暫停
      pauseUsed = true; paused = true; pausedAt = ts;
      if (leader >= 0) crown(leader).setAttribute('opacity', '0');
      onPause(prog.slice(), () => {
        if (!alive) return;
        paused = false;
        requestAnimationFrame(now => { pausedTotal += now - pausedAt; if (leader >= 0) crown(leader).setAttribute('opacity', '1'); requestAnimationFrame(step); });
      });
      return;
    }
    if (finishedCount < plan.n) requestAnimationFrame(step);
    else { alive = false; setTimeout(() => onDone && onDone(ranks), 900); }
  };
  requestAnimationFrame(step);
  return () => { alive = false; };
}

/* 球頭上的小號碼（中場預言用）；txt 空白就收起來 */
export function setTag(track, i, txt) {
  const g = track.svg.querySelector('#mb' + i + ' .mb-tag'); if (!g) return;
  g.querySelector('text').textContent = txt || '';
  g.setAttribute('opacity', txt ? '1' : '0');
}
/* 找一個「冠軍已經在前五名」的時間點來暫停（大約跑到一半） */
export function guessMoment(plan) {
  const champ = plan.finish.indexOf(Math.min(...plan.finish));
  const T = plan.finish[champ];
  let best = null, bestRank = 99;
  for (let t = T * 0.4; t <= T * 0.75; t += 0.05) {
    const prog = plan.curves.map(c => c(t));
    const rank = prog.filter(v => v > prog[champ]).length + 1;
    if (rank <= 5 && rank > 1) return t;            // 冠軍在前五、但還沒領先：最好猜也最刺激
    if (rank < bestRank) { bestRank = rank; best = t; }
  }
  return best ?? T * 0.5;
}

export function setMedal(track, i, rank) {
  const m = track.svg.querySelector('#mb' + i + ' .mb-medal');
  if (m) m.textContent = ['', '🥇', '🥈', '🥉', '🏅'][rank] || '🏅';
}
