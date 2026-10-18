// ============================================================
// 主畫面小工具
//  1. 圓形計時器：倒數／順時，可以拖到畫面任何地方、拉右下角把手放大縮小
//  2. 安靜熊：用麥克風聽教室的聲音，太吵熊熊會被吵醒
// 設定（位置、大小、時間、門檻）存在這台電腦的瀏覽器裡。
// ============================================================
const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');
const load = (k, d) => { try { const v = localStorage.getItem('c11-' + k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem('c11-' + k, JSON.stringify(v)); } catch { /* 存不了也沒關係 */ } };

const BEAR_SVG = `
<svg class="ct-bear" viewBox="0 0 240 230" role="img" aria-label="小熊">
  <g class="ct-whole"><g class="ct-breathe">
    <ellipse cx="110" cy="178" rx="62" ry="42" fill="var(--ct-bear)" stroke="var(--ct-bear-ink)" stroke-width="3"/>
    <ellipse cx="110" cy="186" rx="34" ry="24" fill="var(--ct-bear-light)"/>
    <ellipse cx="62" cy="208" rx="22" ry="16" fill="var(--ct-bear)" stroke="var(--ct-bear-ink)" stroke-width="3"/><ellipse cx="58" cy="210" rx="11" ry="9" fill="var(--ct-pad)"/>
    <ellipse cx="158" cy="208" rx="22" ry="16" fill="var(--ct-bear)" stroke="var(--ct-bear-ink)" stroke-width="3"/><ellipse cx="162" cy="210" rx="11" ry="9" fill="var(--ct-pad)"/>
    <rect x="80" y="156" width="60" height="38" rx="10" fill="var(--ct-sign)" stroke="var(--ct-bear-ink)" stroke-width="3"/>
    <text x="110" y="185" text-anchor="middle" font-family="Fredoka,sans-serif" font-weight="700" font-size="28" fill="#fff">11</text>
    <ellipse cx="76" cy="172" rx="14" ry="11" fill="var(--ct-bear)" stroke="var(--ct-bear-ink)" stroke-width="3"/>
    <ellipse cx="144" cy="172" rx="14" ry="11" fill="var(--ct-bear)" stroke="var(--ct-bear-ink)" stroke-width="3"/>
    <g class="ct-head">
      <circle cx="66" cy="52" r="22" fill="var(--ct-bear)" stroke="var(--ct-bear-ink)" stroke-width="3"/><circle cx="66" cy="52" r="11" fill="var(--ct-pad)"/>
      <circle cx="154" cy="52" r="22" fill="var(--ct-bear)" stroke="var(--ct-bear-ink)" stroke-width="3"/><circle cx="154" cy="52" r="11" fill="var(--ct-pad)"/>
      <ellipse cx="110" cy="96" rx="60" ry="52" fill="var(--ct-bear)" stroke="var(--ct-bear-ink)" stroke-width="3"/>
      <ellipse cx="110" cy="116" rx="24" ry="18" fill="var(--ct-bear-light)"/>
      <ellipse cx="110" cy="107" rx="8" ry="6" fill="var(--ct-bear-ink)"/>
      <path d="M110 113v5M102 120q8 6 16 0" fill="none" stroke="var(--ct-bear-ink)" stroke-width="3" stroke-linecap="round"/>
      <g class="ct-es"><path d="M78 94q9 8 18 0M124 94q9 8 18 0" fill="none" stroke="var(--ct-bear-ink)" stroke-width="4" stroke-linecap="round"/></g>
      <g class="ct-eh"><path d="M78 92h18M124 92h18" stroke="var(--ct-bear-ink)" stroke-width="4" stroke-linecap="round"/><path d="M80 95q7 4 14 0M126 95q7 4 14 0" fill="none" stroke="var(--ct-bear-ink)" stroke-width="3" stroke-linecap="round"/></g>
      <g class="ct-eo"><circle cx="87" cy="91" r="9" fill="var(--ct-bear-ink)"/><circle cx="133" cy="91" r="9" fill="var(--ct-bear-ink)"/><circle cx="90" cy="88" r="3" fill="#fff"/><circle cx="136" cy="88" r="3" fill="#fff"/></g>
      <ellipse cx="70" cy="112" rx="10" ry="7" fill="var(--ct-blush)" opacity=".75"/><ellipse cx="150" cy="112" rx="10" ry="7" fill="var(--ct-blush)" opacity=".75"/>
    </g>
  </g>
  <g class="ct-alert" fill="var(--ct-loud)" font-family="Fredoka,sans-serif" font-weight="700"><text x="182" y="62" font-size="40">!</text><text x="200" y="50" font-size="30">!</text><path d="M30 50 l14 10 M24 72 l16 2 M36 30 l10 14" stroke="var(--ct-loud)" stroke-width="4" stroke-linecap="round"/></g>
  </g>
  <g class="ct-zzz" fill="var(--ct-sky)" font-family="Fredoka,sans-serif" font-weight="600"><text x="172" y="60" font-size="22">z</text><text x="188" y="42" font-size="28">z</text><text x="206" y="22" font-size="34">Z</text></g>
</svg>`;

const HTML = `
<div class="ct-dock">
  <button class="ct-mini" id="ct-miniTimer" type="button" aria-pressed="false" aria-label="顯示或收起計時器">
    <svg viewBox="0 0 58 48" aria-hidden="true"><circle cx="29" cy="27" r="17" fill="none" stroke="var(--ct-rose)" stroke-width="4"/><path d="M29 27V17M29 27l7 4" stroke="var(--ct-ink)" stroke-width="3.5" stroke-linecap="round"/><rect x="24" y="3" width="10" height="5" rx="2" fill="var(--ct-rose)"/></svg>
    <span class="ct-mini-lbl">計時器</span>
  </button>
  <button class="ct-mini" id="ct-miniVol" type="button" aria-label="打開安靜熊">
    <svg viewBox="0 0 58 48" aria-hidden="true">
      <circle cx="14" cy="12" r="8" fill="var(--ct-bear)" stroke="var(--ct-bear-ink)" stroke-width="2"/><circle cx="44" cy="12" r="8" fill="var(--ct-bear)" stroke="var(--ct-bear-ink)" stroke-width="2"/>
      <circle cx="14" cy="12" r="4" fill="var(--ct-pad)"/><circle cx="44" cy="12" r="4" fill="var(--ct-pad)"/>
      <ellipse cx="29" cy="27" rx="19" ry="17" fill="var(--ct-bear)" stroke="var(--ct-bear-ink)" stroke-width="2"/>
      <ellipse cx="29" cy="33" rx="8" ry="6" fill="var(--ct-bear-light)"/><ellipse cx="29" cy="30" rx="3" ry="2.2" fill="var(--ct-bear-ink)"/>
      <g id="ct-miniEyes"></g>
      <circle cx="16" cy="31" r="3" fill="var(--ct-blush)" opacity=".8"/><circle cx="42" cy="31" r="3" fill="var(--ct-blush)" opacity=".8"/>
    </svg>
    <span class="ct-mini-lbl">安靜熊</span>
  </button>
</div>

<div class="ct-ft" id="ct-ft" tabindex="0" aria-label="計時器，可以拖曳" hidden>
  <div class="ct-face"></div>
  <svg class="ct-ring" viewBox="0 0 200 200" aria-hidden="true">
    <circle cx="100" cy="100" r="88" fill="none" stroke="var(--ct-tea-soft)" stroke-width="12"/>
    <circle class="ct-arc" id="ct-arc" cx="100" cy="100" r="88" fill="none" stroke="var(--ct-rose)" stroke-width="12" stroke-linecap="round" stroke-dasharray="553 553" transform="rotate(-90 100 100)"/>
  </svg>
  <div class="ct-read"><div class="ct-big" id="ct-time" aria-live="polite">5:00</div><div class="ct-sub" id="ct-subT">點我設定</div></div>
  <button class="ct-x" id="ct-hide" type="button" aria-label="收起計時器">×</button>
  <button class="ct-rs" id="ct-rs" type="button" aria-label="拉這裡放大縮小"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 20H4v-5M15 4h5v5M4 20l7-7M20 4l-7 7" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
  <button class="ct-play" id="ct-play" type="button" aria-label="開始"><svg viewBox="0 0 24 24" id="ct-icon" aria-hidden="true"></svg></button>
</div>

<div class="ct-overlay" id="ct-ovTimer" hidden role="dialog" aria-modal="true" aria-labelledby="ct-hTimer">
  <section class="ct-panel ct-narrow">
    <div class="ct-ptop"><h2 id="ct-hTimer">計時器設定</h2><div class="ct-acts"><button class="ct-btn ct-soft" id="ct-closeTimer" type="button">完成</button></div></div>
    <div class="ct-seg" role="group" aria-label="計時方式">
      <button id="ct-modeDown" type="button" aria-pressed="true">倒數</button>
      <button id="ct-modeUp" type="button" aria-pressed="false">順時</button>
    </div>
    <div id="ct-downCtrls" class="ct-row">
      <span class="ct-lbl">倒數多久</span>
      <div class="ct-presets" id="ct-presets"></div>
      <div class="ct-custom"><span>自訂</span><input id="ct-cMin" type="number" min="0" max="99" inputmode="numeric" aria-label="分鐘"><span>分</span><input id="ct-cSec" type="number" min="0" max="59" inputmode="numeric" aria-label="秒"><span>秒</span></div>
      <div class="ct-bump"><button class="ct-btn" id="ct-bm1" type="button">−1 分</button><button class="ct-btn" id="ct-b30" type="button">＋30 秒</button><button class="ct-btn" id="ct-b1" type="button">＋1 分</button></div>
    </div>
    <div class="ct-go"><button class="ct-btn ct-main" id="ct-start" type="button">開始</button><button class="ct-btn" id="ct-reset" type="button">重來</button></div>
    <div class="ct-row">
      <span class="ct-lbl">圓圈大小（也可以拉圓圈右下角的把手）</span>
      <div class="ct-seg" role="group" aria-label="圓圈大小" id="ct-sizes">
        <button data-s="170" type="button" aria-pressed="false">小</button>
        <button data-s="250" type="button" aria-pressed="false">中</button>
        <button data-s="360" type="button" aria-pressed="false">大</button>
      </div>
    </div>
    <button class="ct-toggle" id="ct-tSound" type="button" aria-pressed="true"><span class="ct-box">✓</span><span>時間到響鈴</span></button>
  </section>
</div>

<div class="ct-overlay" id="ct-ovVol" hidden role="dialog" aria-modal="true" aria-labelledby="ct-hVol">
  <section class="ct-panel">
    <div class="ct-ptop"><h2 id="ct-hVol">安靜熊</h2><div class="ct-acts"><button class="ct-btn" id="ct-fs" type="button">全螢幕</button><button class="ct-btn ct-soft" id="ct-closeVol" type="button">縮小</button></div></div>
    <div class="ct-volbody">
      <div class="ct-stage" id="ct-stage"><div class="ct-bearwrap">${BEAR_SVG}</div><div class="ct-say" id="ct-say">熊熊在睡覺，噓～</div></div>
      <div class="ct-meter">
        <div class="ct-bar" aria-hidden="true"><span class="ct-fill" id="ct-fill"></span><span class="ct-line" id="ct-line"></span></div>
        <div class="ct-scale"><span>很安靜</span><span>這條線＝吵醒熊熊</span><span>很吵</span></div>
        <div class="ct-vstats">
          <div class="ct-vs"><span>這次安靜了</span><b id="ct-quiet">0:00</b></div>
          <div class="ct-vs"><span>被吵醒</span><b id="ct-wakes">0 次</b></div>
        </div>
        <button class="ct-btn ct-main" id="ct-mic" type="button">開始聽教室的聲音</button>
        <p class="ct-note" id="ct-micNote">按上面的按鈕，瀏覽器會問能不能用麥克風，按「允許」。</p>
        <div class="ct-field" id="ct-demoBox" hidden>
          <label for="ct-demo">試玩：拉這條假裝教室的聲音 <span id="ct-demoVal">10</span></label>
          <input id="ct-demo" type="range" min="0" max="100" value="10">
        </div>
        <div class="ct-field"><label for="ct-thr">多吵會吵醒熊熊 <span id="ct-thrVal">60</span></label><input id="ct-thr" type="range" min="15" max="95"></div>
        <div class="ct-field"><label for="ct-sens">麥克風靈敏度 <span id="ct-sensVal">中</span></label><input id="ct-sens" type="range" min="1" max="5"></div>
        <button class="ct-toggle" id="ct-vSound" type="button" aria-pressed="true"><span class="ct-box">✓</span><span>熊熊醒來時出聲提醒</span></button>
        <button class="ct-btn" id="ct-resetVol" type="button">歸零重新計算</button>
      </div>
    </div>
  </section>
</div>`;

const root = document.createElement('div');
root.className = 'ct';
root.innerHTML = HTML;
document.body.appendChild(root);

/* ---------- 聲音（自己的 AudioContext，不影響班網其他音效） ---------- */
let ac = null;
function audio() {
  if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { /* 不支援就不出聲 */ } }
  if (ac && ac.state === 'suspended') ac.resume();
  return ac;
}
function tone(freq, start, dur, vol) {
  const a = audio(); if (!a) return;
  const o = a.createOscillator(), g = a.createGain(), t = a.currentTime + start;
  o.type = 'sine'; o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .02); g.gain.exponentialRampToValueAtTime(.001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + .05);
}
function chime() { [0, .9, 1.8].forEach((t) => { tone(1046, t, .9, .28); tone(1318, t + .12, .9, .2); tone(1568, t + .24, 1.1, .18); }); }
function grumble() {
  const a = audio(); if (!a) return;
  const t = a.currentTime;
  [0, .28].forEach((d, i) => {
    const o = a.createOscillator(), g = a.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(i ? 330 : 392, t + d); o.frequency.linearRampToValueAtTime(i ? 247 : 330, t + d + .22);
    g.gain.setValueAtTime(0, t + d); g.gain.linearRampToValueAtTime(.25, t + d + .03); g.gain.exponentialRampToValueAtTime(.001, t + d + .26);
    o.connect(g).connect(a.destination); o.start(t + d); o.stop(t + d + .3);
  });
}

/* ---------- 螢幕不要自動關 ---------- */
let wake = null;
async function keepAwake() {
  try { if (navigator.wakeLock && !wake) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); } } catch { /* 不支援就算了 */ }
}
function openOv(id) { $(id).hidden = false; keepAwake(); }
function closeOv(id) { $(id).hidden = true; if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {}); }
$('ct-closeTimer').onclick = () => closeOv('ct-ovTimer');
$('ct-miniVol').onclick = () => openOv('ct-ovVol');
$('ct-closeVol').onclick = () => closeOv('ct-ovVol');
$('ct-fs').onclick = () => {
  const el = document.documentElement;
  try { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else if (el.requestFullscreen) el.requestFullscreen().catch(() => {}); } catch { /* 不支援全螢幕 */ }
};
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeOv('ct-ovTimer'); closeOv('ct-ovVol'); } });

/* ---------- 圓形計時器：位置、大小、拖曳 ---------- */
const ft = $('ct-ft');
const F = { size: load('ftSize', 250), shown: load('ftShown', false), x: load('ftX', null), y: load('ftY', null) };
const MIN_SIZE = 140;
const maxSize = () => Math.max(MIN_SIZE, Math.min(innerWidth, innerHeight) - 24);
function clampPos() {
  F.size = Math.max(MIN_SIZE, Math.min(maxSize(), F.size));
  const s = F.size, w = innerWidth, h = innerHeight;
  if (F.x == null) { F.x = Math.max(8, w - s - 120); F.y = Math.max(8, h * .3); }
  F.x = Math.max(4, Math.min(w - s - 4, F.x));
  F.y = Math.max(4, Math.min(h - s * 1.12 - 4, F.y));
}
function placeFt() {
  clampPos();
  ft.style.setProperty('--fs', F.size + 'px');
  ft.style.transform = `translate(${F.x}px, ${F.y}px)`;
  ft.hidden = !F.shown;
  $('ct-miniTimer').setAttribute('aria-pressed', String(F.shown));
  document.querySelectorAll('#ct-sizes button').forEach((b) => b.setAttribute('aria-pressed', String(Math.abs(Number(b.dataset.s) - F.size) < 30)));
}
const savePos = () => { save('ftSize', F.size); save('ftX', F.x); save('ftY', F.y); };
addEventListener('resize', placeFt);

let drag = null;
ft.addEventListener('pointerdown', (e) => {
  if (e.target.closest('button')) return;
  e.preventDefault();
  drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: F.x, oy: F.y, moved: false };
  try { ft.setPointerCapture(e.pointerId); } catch { /* ignore */ }
});
ft.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
  if (!drag.moved && Math.hypot(dx, dy) > 6) { drag.moved = true; ft.classList.add('ct-dragging'); }
  if (drag.moved) { F.x = drag.ox + dx; F.y = drag.oy + dy; placeFt(); }
});
ft.addEventListener('pointerup', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const moved = drag.moved; drag = null; ft.classList.remove('ct-dragging');
  if (moved) savePos(); else openOv('ct-ovTimer');
});
ft.addEventListener('pointercancel', () => { drag = null; ft.classList.remove('ct-dragging'); });
ft.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target === ft) openOv('ct-ovTimer'); });

let rs = null;
const rsBtn = $('ct-rs');
rsBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault(); e.stopPropagation();
  const r = ft.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  rs = { id: e.pointerId, cx, cy, s0: F.size, d0: Math.hypot(e.clientX - cx, e.clientY - cy) };
  ft.classList.add('ct-resizing');
  try { rsBtn.setPointerCapture(e.pointerId); } catch { /* ignore */ }
});
rsBtn.addEventListener('pointermove', (e) => {
  if (!rs || e.pointerId !== rs.id) return;
  const d = Math.hypot(e.clientX - rs.cx, e.clientY - rs.cy);
  const ns = Math.max(MIN_SIZE, Math.min(maxSize(), Math.round(rs.s0 * d / Math.max(20, rs.d0))));
  F.x = rs.cx - ns / 2; F.y = rs.cy - ns / 2; F.size = ns; placeFt();
});
const endRs = (e) => { if (!rs || e.pointerId !== rs.id) return; rs = null; ft.classList.remove('ct-resizing'); savePos(); };
rsBtn.addEventListener('pointerup', endRs);
rsBtn.addEventListener('pointercancel', endRs);

$('ct-hide').onclick = () => { F.shown = false; save('ftShown', false); placeFt(); };
$('ct-miniTimer').onclick = () => { F.shown = !F.shown; save('ftShown', F.shown); placeFt(); };
$('ct-sizes').onclick = (e) => {
  const b = e.target.closest('button[data-s]'); if (!b) return;
  const old = F.size; F.size = Number(b.dataset.s);
  F.x += (old - F.size) / 2; F.y += (old - F.size) / 2;
  placeFt(); savePos();
};
placeFt();

/* ---------- 計時邏輯 ---------- */
const PRESETS = [1, 2, 3, 5, 10, 15];
const T = { mode: 'down', total: load('total', 300), running: false, endAt: 0, left: 0, startAt: 0, elapsed: 0, done: false, sound: load('tSound', true) };
const fmtDown = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + pad(s % 60); };
const fmtUp = (ms) => { const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return h ? h + ':' + pad(m) + ':' + pad(s % 60) : m + ':' + pad(s % 60); };
$('ct-presets').innerHTML = PRESETS.map((m) => `<button data-m="${m}" type="button" aria-pressed="false">${m}<small>分</small></button>`).join('');
const ICON = {
  play: '<path d="M7 4l13 8-13 8z" fill="currentColor"/>',
  pause: '<rect x="5" y="4" width="5" height="16" rx="1.5" fill="currentColor"/><rect x="14" y="4" width="5" height="16" rx="1.5" fill="currentColor"/>',
  again: '<path d="M12 5a7 7 0 1 1-6.6 4.7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M4 4v6h6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
};
function setTotal(sec) {
  sec = Math.max(5, Math.min(99 * 60 + 59, Math.round(sec)));
  T.total = sec; T.left = sec * 1000; T.done = false; T.running = false;
  save('total', sec);
  $('ct-cMin').value = Math.floor(sec / 60); $('ct-cSec').value = sec % 60;
  renderT();
}
function renderT() {
  const now = Date.now();
  let ms, frac, txt;
  if (T.mode === 'down') { ms = T.running ? T.endAt - now : T.left; frac = T.total ? Math.max(0, ms) / (T.total * 1000) : 0; txt = fmtDown(ms); }
  else { ms = T.running ? T.elapsed + (now - T.startAt) : T.elapsed; frac = ms ? (ms / 1000 % 60) / 60 : 0; txt = fmtUp(ms); }
  $('ct-time').textContent = txt;
  $('ct-arc').style.strokeDashoffset = String(553 * (1 - frac));
  ft.classList.toggle('ct-done', T.done);
  const paused = T.mode === 'down' ? (T.left < T.total * 1000 && !T.done) : T.elapsed > 0;
  $('ct-subT').textContent = T.done ? '時間到！' : T.running ? (T.mode === 'down' ? '倒數中' : '計時中') : paused ? '暫停中' : '點我設定';
  $('ct-icon').innerHTML = T.running ? ICON.pause : T.done ? ICON.again : ICON.play;
  $('ct-play').setAttribute('aria-label', T.running ? '暫停' : T.done ? '再一次' : '開始');
  $('ct-start').textContent = T.running ? '暫停' : T.done ? '再一次' : paused ? '繼續' : '開始';
  document.querySelectorAll('#ct-presets button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.m) * 60 === T.total)));
  $('ct-miniTimer').classList.toggle('ct-alarm', T.done && !F.shown);
}
function finish() {
  T.running = false; T.left = 0; T.done = true;
  if (T.sound) chime();
  if (!F.shown) { F.shown = true; save('ftShown', true); placeFt(); }
  renderT();
}
setInterval(() => { if (T.running && T.mode === 'down' && T.endAt - Date.now() <= 0) finish(); if (T.running || T.done) renderT(); }, 200);
function toggleRun() {
  audio();
  if (T.mode === 'down') {
    if (T.running) { T.left = T.endAt - Date.now(); T.running = false; }
    else { if (T.done || T.left <= 0) { T.left = T.total * 1000; T.done = false; } T.endAt = Date.now() + T.left; T.running = true; keepAwake(); }
  } else if (T.running) { T.elapsed += Date.now() - T.startAt; T.running = false; }
  else { T.startAt = Date.now(); T.running = true; keepAwake(); }
  renderT();
}
$('ct-play').onclick = toggleRun;
$('ct-start').onclick = () => { toggleRun(); if (T.running) closeOv('ct-ovTimer'); };
$('ct-reset').onclick = () => { T.running = false; T.done = false; T.left = T.total * 1000; T.elapsed = 0; renderT(); };
$('ct-presets').onclick = (e) => { const b = e.target.closest('button[data-m]'); if (b) setTotal(Number(b.dataset.m) * 60); };
function fromInputs() {
  const m = Math.max(0, Math.min(99, Number($('ct-cMin').value) || 0));
  const s = Math.max(0, Math.min(59, Number($('ct-cSec').value) || 0));
  setTotal(m * 60 + s);
}
$('ct-cMin').onchange = fromInputs;
$('ct-cSec').onchange = fromInputs;
function bump(sec) {
  if (T.mode !== 'down') return;
  if (T.running) { T.endAt = Math.max(Date.now() + 1000, T.endAt + sec * 1000); T.total = Math.max(T.total, Math.ceil((T.endAt - Date.now()) / 1000)); }
  else { const nl = Math.max(5000, (T.done ? 0 : T.left) + sec * 1000); T.done = false; T.left = nl; if (nl > T.total * 1000) T.total = Math.ceil(nl / 1000); }
  renderT();
}
$('ct-bm1').onclick = () => bump(-60);
$('ct-b30').onclick = () => bump(30);
$('ct-b1').onclick = () => bump(60);
function setMode(m) {
  if (T.mode === m) return;
  T.running = false; T.done = false; T.mode = m; T.elapsed = 0; T.left = T.total * 1000;
  $('ct-modeDown').setAttribute('aria-pressed', String(m === 'down'));
  $('ct-modeUp').setAttribute('aria-pressed', String(m === 'up'));
  $('ct-downCtrls').hidden = m !== 'down';
  renderT();
}
$('ct-modeDown').onclick = () => setMode('down');
$('ct-modeUp').onclick = () => setMode('up');
$('ct-tSound').setAttribute('aria-pressed', String(T.sound));
$('ct-tSound').onclick = () => { T.sound = !T.sound; save('tSound', T.sound); $('ct-tSound').setAttribute('aria-pressed', String(T.sound)); if (T.sound) tone(1046, 0, .4, .2); };
setTotal(T.total);

/* ---------- 安靜熊 ---------- */
const V = { thr: load('thr', 60), sens: load('sens', 3), sound: load('vSound', true), level: 0, state: '', overSince: 0, quietSince: Date.now(), wakes: 0, lastLoud: 0, listening: false, demo: false };
const SENS = ['很低', '低', '中', '高', '很高'], GAIN = [.45, .7, 1, 1.5, 2.3];
const SAY = {
  sleep: ['熊熊在睡覺，噓～', '熊熊睡得好香', '保持安靜，熊熊做好夢'],
  stir: ['熊熊翻身了…小聲一點', '熊熊耳朵動了一下！', '嗯…熊熊快要醒了'],
  awake: ['熊熊被吵醒了！', '太吵啦！熊熊醒來了', '噓！熊熊生氣了'],
};
const MINI_EYES = {
  sleep: '<path d="M18 24q3.5 3 7 0M33 24q3.5 3 7 0" fill="none" stroke="var(--ct-bear-ink)" stroke-width="2.5" stroke-linecap="round"/>',
  stir: '<path d="M18 24h7M33 24h7" stroke="var(--ct-bear-ink)" stroke-width="2.5" stroke-linecap="round"/>',
  awake: '<circle cx="21.5" cy="23" r="3.5" fill="var(--ct-bear-ink)"/><circle cx="36.5" cy="23" r="3.5" fill="var(--ct-bear-ink)"/>',
};
let analyser = null, buf = null, stream = null;
function setThr(v) { V.thr = Number(v); save('thr', V.thr); $('ct-thr').value = V.thr; $('ct-thrVal').textContent = V.thr; $('ct-line').style.left = `calc(${V.thr}% - 2px)`; }
function setSens(v) { V.sens = Number(v); save('sens', V.sens); $('ct-sens').value = V.sens; $('ct-sensVal').textContent = SENS[V.sens - 1]; }
setThr(V.thr); setSens(V.sens);
$('ct-thr').oninput = (e) => setThr(e.target.value);
$('ct-sens').oninput = (e) => setSens(e.target.value);
$('ct-vSound').setAttribute('aria-pressed', String(V.sound));
$('ct-vSound').onclick = () => { V.sound = !V.sound; save('vSound', V.sound); $('ct-vSound').setAttribute('aria-pressed', String(V.sound)); if (V.sound) grumble(); };
function setState(s) {
  if (V.state === s) return;
  const prev = V.state; V.state = s;
  const st = $('ct-stage');
  st.classList.toggle('ct-stir', s === 'stir'); st.classList.toggle('ct-awake', s === 'awake');
  const arr = SAY[s]; $('ct-say').textContent = arr[Math.floor(Math.random() * arr.length)];
  if (s === 'awake' && prev !== 'awake') { V.wakes++; $('ct-wakes').textContent = V.wakes + ' 次'; if (V.sound) grumble(); }
  if (s === 'sleep') V.quietSince = Date.now();
  $('ct-miniEyes').innerHTML = MINI_EYES[s];
  $('ct-miniVol').classList.toggle('ct-alarm', s === 'awake');
}
setState('sleep');
function readMic() {
  if (!analyser) return 0;
  analyser.getFloatTimeDomainData(buf);
  let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  const db = 20 * Math.log10(Math.sqrt(s / buf.length) + 1e-8);
  // 大約 -70dB（很安靜）到 -10dB（很吵）對應 0～100
  return Math.max(0, Math.min(100, (db + 70) / 60 * 100 * GAIN[V.sens - 1]));
}
function vloop() {
  if (V.listening || V.demo) {
    const raw = V.demo ? Number($('ct-demo').value) : readMic();
    V.level = V.level * .75 + raw * .25;
    const lv = V.level, now = Date.now();
    $('ct-fill').style.width = lv.toFixed(1) + '%';
    $('ct-fill').style.background = lv >= V.thr ? 'var(--ct-loud)' : lv >= V.thr * .7 ? 'var(--ct-warn)' : 'var(--ct-calm)';
    if (lv >= V.thr) { V.lastLoud = now; if (!V.overSince) V.overSince = now; if (now - V.overSince > 500) setState('awake'); }
    else {
      V.overSince = 0;
      if (V.state === 'awake') { if (now - V.lastLoud > 3000 && lv < V.thr * .7) setState('stir'); }
      else setState(lv >= V.thr * .7 ? 'stir' : 'sleep');
    }
    $('ct-quiet').textContent = fmtUp(V.state === 'awake' ? 0 : now - V.quietSince);
  }
  requestAnimationFrame(vloop);
}
requestAnimationFrame(vloop);
function startDemo(msg) {
  V.demo = true; $('ct-demoBox').hidden = false;
  $('ct-micNote').className = 'ct-note ct-err'; $('ct-micNote').textContent = msg;
  $('ct-mic').textContent = '再試一次麥克風';
}
$('ct-demo').oninput = (e) => { $('ct-demoVal').textContent = e.target.value; };
$('ct-mic').onclick = async () => {
  audio();
  if (V.listening) {
    stream?.getTracks().forEach((t) => t.stop());
    V.listening = false; analyser = null;
    $('ct-mic').textContent = '開始聽教室的聲音';
    $('ct-micNote').className = 'ct-note'; $('ct-micNote').textContent = '已經停止聽了。';
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) { startDemo('這台電腦的瀏覽器沒辦法用麥克風，先用下面的拉桿試玩。'); return; }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    const a = audio();
    const src = a.createMediaStreamSource(stream);
    analyser = a.createAnalyser(); analyser.fftSize = 2048; buf = new Float32Array(analyser.fftSize);
    src.connect(analyser);
    V.listening = true; V.demo = false; $('ct-demoBox').hidden = true; V.quietSince = Date.now();
    $('ct-mic').textContent = '停止聽';
    $('ct-micNote').className = 'ct-note';
    $('ct-micNote').textContent = '正在聽教室的聲音。如果熊熊一直被吵醒，把「多吵會吵醒熊熊」往右拉，或把靈敏度調低。';
    keepAwake();
  } catch (e) {
    const n = e?.name;
    startDemo(n === 'NotFoundError' ? '找不到麥克風。接上 USB 麥克風後再按一次；現在先用拉桿試玩。'
      : n === 'NotAllowedError' ? '麥克風沒有被允許。點網址列左邊的圖示，把「麥克風」改成允許，再按一次；現在先用拉桿試玩。'
      : '麥克風打不開，先用拉桿試玩。');
  }
};
$('ct-resetVol').onclick = () => { V.wakes = 0; $('ct-wakes').textContent = '0 次'; V.quietSince = Date.now(); V.state = ''; setState('sleep'); };
