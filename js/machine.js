// 扭蛋機：立體外觀＋膠囊物理（重力、碰撞、翻滾）
export const CAPSULE_COLORS = ['#f2a99a', '#f5cd7a', '#9fd0b0', '#9fc0e8', '#d3a8e0', '#f39bb4', '#f7b27a'];

const CX = 100, CY = 100;      // 玻璃球中心
const DOME = 78;               // 玻璃球半徑
const INNER = 75;              // 膠囊能活動的範圍
const CR = 12.5;               // 膠囊半徑
const G = 900;                 // 重力
const STEP = 1 / 120;          // 每一小步的時間（秒）

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let uid = 0;

function svg(id, kind) {
  const body = `var(--${kind}-body)`;
  const knob = `var(--${kind}-knob)`;
  const mix = (c, other, pct) => `color-mix(in srgb, ${c} ${pct}%, ${other})`;
  return `<svg class="machine ${kind}" viewBox="0 0 200 284" aria-hidden="true">
  <defs>
    <radialGradient id="${id}-glass" cx=".38" cy=".3" r=".8">
      <stop offset="0" stop-color="#fff" stop-opacity=".9"/>
      <stop offset=".55" stop-color="#fff" stop-opacity=".4"/>
      <stop offset="1" stop-color="#dfe7ee" stop-opacity=".7"/>
    </radialGradient>
    <radialGradient id="${id}-edge" cx=".5" cy=".5" r=".5">
      <stop offset=".78" stop-color="#8aa0b4" stop-opacity="0"/>
      <stop offset="1" stop-color="#8aa0b4" stop-opacity=".35"/>
    </radialGradient>
    <radialGradient id="${id}-shade" cx=".36" cy=".3" r=".78">
      <stop offset="0" stop-color="#fff" stop-opacity=".45"/>
      <stop offset=".45" stop-color="#fff" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity=".32"/>
    </radialGradient>
    <linearGradient id="${id}-body" x1="0" x2="1">
      <stop offset="0" style="stop-color:${mix(body, 'black', 72)}"/>
      <stop offset=".22" style="stop-color:${mix(body, 'white', 78)}"/>
      <stop offset=".5" style="stop-color:${body}"/>
      <stop offset="1" style="stop-color:${mix(body, 'black', 68)}"/>
    </linearGradient>
    <radialGradient id="${id}-knob" cx=".36" cy=".3" r=".75">
      <stop offset="0" stop-color="#fff"/>
      <stop offset=".55" style="stop-color:${knob}"/>
      <stop offset="1" style="stop-color:${mix(knob, 'black', 70)}"/>
    </radialGradient>
    <linearGradient id="${id}-handle" x1="0" x2="1">
      <stop offset="0" style="stop-color:${mix(body, 'black', 70)}"/>
      <stop offset=".4" style="stop-color:${mix(body, 'white', 85)}"/>
      <stop offset="1" style="stop-color:${mix(body, 'black', 75)}"/>
    </linearGradient>
    <clipPath id="${id}-clip"><circle cx="${CX}" cy="${CY}" r="${INNER + 1}"/></clipPath>
  </defs>

  <ellipse cx="100" cy="276" rx="80" ry="7" fill="rgba(0,0,0,.13)"/>

  <circle cx="${CX}" cy="${CY}" r="${DOME}" fill="url(#${id}-glass)"/>
  <g clip-path="url(#${id}-clip)"><g class="capsules"></g></g>
  <circle cx="${CX}" cy="${CY}" r="${DOME}" fill="url(#${id}-edge)"/>
  <path d="M46 70 A60 60 0 0 1 96 32" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" opacity=".75"/>
  <circle cx="58" cy="94" r="4" fill="#fff" opacity=".7"/>
  <circle cx="${CX}" cy="${CY}" r="${DOME}" fill="none" stroke="rgba(60,70,80,.18)" stroke-width="2.5"/>

  <rect x="40" y="166" width="120" height="16" rx="6" fill="url(#${id}-body)"/>
  <rect x="44" y="167" width="112" height="3" rx="1.5" fill="#fff" opacity=".35"/>
  <rect x="26" y="178" width="148" height="94" rx="20" fill="url(#${id}-body)"/>
  <rect x="34" y="180" width="132" height="5" rx="2.5" fill="#fff" opacity=".28"/>

  <rect x="70" y="244" width="60" height="22" rx="10" fill="rgba(0,0,0,.42)"/>
  <rect x="74" y="258" width="52" height="6" rx="3" fill="rgba(255,255,255,.12)"/>

  <g class="knob">
    <circle cx="100" cy="214" r="25" fill="rgba(0,0,0,.15)" transform="translate(1.5 2.5)"/>
    <circle cx="100" cy="214" r="25" fill="url(#${id}-knob)"/>
    <rect x="94.5" y="194" width="11" height="40" rx="5.5" fill="url(#${id}-handle)"/>
  </g>
</svg>`;
}

function capsuleMarkup(id, color) {
  return `<g class="cap-spin">
      <circle r="${CR}" fill="#fbfbfb"/>
      <path d="M${-CR} 0 A${CR} ${CR} 0 0 1 ${CR} 0 Z" fill="${color}"/>
      <line x1="${-CR}" y1="0" x2="${CR}" y2="0" stroke="rgba(0,0,0,.14)" stroke-width="1.2"/>
    </g>
    <circle r="${CR}" fill="url(#${id}-shade)"/>
    <ellipse cx="-4.5" cy="-5.5" rx="4" ry="2.4" fill="#fff" opacity=".8" transform="rotate(-35 -4.5 -5.5)"/>`;
}

export function createMachine(container, kind, count = 18) {
  const id = `m${++uid}`;
  container.innerHTML = svg(id, kind);
  const el = container.querySelector('svg');
  const layer = el.querySelector('.capsules');
  const NS = 'http://www.w3.org/2000/svg';

  let caps = [];
  for (let i = 0; i < count; i++) {
    const color = CAPSULE_COLORS[i % CAPSULE_COLORS.length];
    const g = document.createElementNS(NS, 'g');
    g.innerHTML = capsuleMarkup(id, color);
    layer.append(g);
    const ang = Math.random() * Math.PI * 2;
    const rad = Math.random() * (INNER - CR - 4);
    caps.push({
      g, spin: g.firstElementChild, color,
      x: CX + Math.cos(ang) * rad, y: CY + Math.sin(ang) * rad,
      vx: 0, vy: 0, a: Math.random() * 360,
    });
  }

  // 一小步物理運算
  function step(stirring) {
    for (const c of caps) {
      let ax = 0, ay = G;
      if (stirring) {
        const dx = c.x - CX, dy = c.y - CY;
        const d = Math.hypot(dx, dy) || 1;
        ax += (-dy / d) * 800;                         // 繞圈攪動
        ay += (dx / d) * 800;
        if (dy > 0) ay -= 4600 * (dy / INNER);          // 底部往上翻
        ax += (Math.random() - 0.5) * 14000;           // 隨機亂跳
        ay += (Math.random() - 0.5) * 14000;
      }
      c.vx = (c.vx + ax * STEP) * 0.997;
      c.vy = (c.vy + ay * STEP) * 0.997;
      const sp = Math.hypot(c.vx, c.vy);
      if (sp > 700) { c.vx *= 700 / sp; c.vy *= 700 / sp; }
      c.x += c.vx * STEP;
      c.y += c.vy * STEP;
      c.a += (c.vx * STEP / CR) * 57.3;
    }
    // 膠囊互相碰撞
    for (let i = 0; i < caps.length; i++) {
      for (let j = i + 1; j < caps.length; j++) {
        const a = caps[i], b = caps[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d >= CR * 2 || d === 0) continue;
        const nx = dx / d, ny = dy / d;
        const push = (CR * 2 - d) / 2;
        a.x -= nx * push; a.y -= ny * push;
        b.x += nx * push; b.y += ny * push;
        const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rv < 0) {
          const imp = -(1 + 0.45) * rv / 2;
          a.vx -= imp * nx; a.vy -= imp * ny;
          b.vx += imp * nx; b.vy += imp * ny;
        }
      }
    }
    // 撞到玻璃
    const max = INNER - CR;
    for (const c of caps) {
      const dx = c.x - CX, dy = c.y - CY;
      const d = Math.hypot(dx, dy);
      if (d <= max) continue;
      const nx = dx / d, ny = dy / d;
      c.x = CX + nx * max; c.y = CY + ny * max;
      const vn = c.vx * nx + c.vy * ny;
      if (vn > 0) {
        c.vx -= (1 + 0.55) * vn * nx;
        c.vy -= (1 + 0.55) * vn * ny;
        c.vx *= 0.98; c.vy *= 0.98;
      }
    }
  }

  function render() {
    for (const c of caps) {
      c.g.setAttribute('transform', `translate(${c.x.toFixed(2)} ${c.y.toFixed(2)})`);
      c.spin.setAttribute('transform', `rotate(${c.a.toFixed(1)})`);
    }
  }

  // 一開始先讓膠囊自然落到底部
  for (let i = 0; i < 480; i++) step(false);
  render();

  let running = null;

  // 播放物理動畫：stirSeconds 秒的攪動，接著讓膠囊落下靜止
  function animate(stirSeconds, settleSeconds = 2.2) {
    if (running) cancelAnimationFrame(running);
    // 以真實時間計時：就算電腦忙、畫面變慢，也會準時結束
    return new Promise((resolve) => {
      const start = performance.now();
      let last = start;
      let acc = 0;
      const done = () => { clearTimeout(fallback); resolve(); };
      const fallback = setTimeout(done, stirSeconds * 1000 + 200);
      const frame = (now) => {
        const elapsed = (now - start) / 1000;
        acc += Math.min(0.05, (now - last) / 1000);
        last = now;
        while (acc >= STEP) {
          step(elapsed < stirSeconds);
          acc -= STEP;
        }
        render();
        if (elapsed >= stirSeconds) done();
        if (elapsed < stirSeconds + settleSeconds) running = requestAnimationFrame(frame);
        else running = null;
      };
      running = requestAnimationFrame(frame);
    });
  }

  return {
    el,
    // 轉動把手：整台搖晃、膠囊翻滾
    async stir(seconds) {
      if (reduceMotion) return;
      el.classList.add('spinning');
      await animate(seconds);
      el.classList.remove('spinning');
    },
    // 拿走最底下的一顆膠囊（掉出出口），回傳它的顏色
    take() {
      if (!caps.length) return CAPSULE_COLORS[0];
      const c = caps.reduce((low, x) => (x.y > low.y ? x : low));
      caps = caps.filter((x) => x !== c);
      c.g.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' })
        .finished.then(() => c.g.remove());
      if (!running) animate(0, 1.5);
      return c.color;
    },
  };
}
