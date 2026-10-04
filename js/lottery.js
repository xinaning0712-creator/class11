// 樂透抽籤機：透明大球＋七彩玻璃珠（重力、碰撞、瘋狂搖動、從出口掉出）
const CX = 300, CY = 262;     // 大球中心
const R = 232;                // 大球半徑
const RIN = 226;              // 珠子能活動的範圍
const BR = 23;                // 珠子半徑
const G = 1100;
const STEP = 1 / 120;
const TUBE_Y = 568;           // 珠子掉進管子後停的位置

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const NS = 'http://www.w3.org/2000/svg';

// 每個號碼一個顏色，繞色環一圈
export function ballColor(n, total = 24) {
  return `hsl(${Math.round(((n - 1) / total) * 360)} 55% 76%)`;   // 柔和的馬卡龍色
}

function svg(id) {
  return `<svg class="lottery-machine" viewBox="0 0 600 660" aria-hidden="true">
  <defs>
    <radialGradient id="${id}-glass" cx=".38" cy=".3" r=".8">
      <stop offset="0" stop-color="#fff" stop-opacity=".85"/>
      <stop offset=".6" stop-color="#fff" stop-opacity=".35"/>
      <stop offset="1" stop-color="#f3d6e0" stop-opacity=".65"/>
    </radialGradient>
    <radialGradient id="${id}-edge" cx=".5" cy=".5" r=".5">
      <stop offset=".8" stop-color="#b98597" stop-opacity="0"/>
      <stop offset="1" stop-color="#b98597" stop-opacity=".35"/>
    </radialGradient>
    <radialGradient id="${id}-shade" cx=".36" cy=".3" r=".8">
      <stop offset="0" stop-color="#fff" stop-opacity=".55"/>
      <stop offset=".4" stop-color="#fff" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity=".38"/>
    </radialGradient>
    <linearGradient id="${id}-metal" x1="0" x2="1">
      <stop offset="0" style="stop-color:color-mix(in srgb, var(--accent) 70%, black)"/>
      <stop offset=".25" style="stop-color:color-mix(in srgb, var(--accent) 55%, white)"/>
      <stop offset=".55" style="stop-color:var(--accent)"/>
      <stop offset="1" style="stop-color:color-mix(in srgb, var(--accent) 65%, black)"/>
    </linearGradient>
    <linearGradient id="${id}-tube" x1="0" x2="1">
      <stop offset="0" stop-color="#fff" stop-opacity=".25"/>
      <stop offset=".3" stop-color="#fff" stop-opacity=".75"/>
      <stop offset="1" stop-color="#e9c4d1" stop-opacity=".5"/>
    </linearGradient>
    <clipPath id="${id}-clip"><circle cx="${CX}" cy="${CY}" r="${RIN + 1}"/></clipPath>
  </defs>

  <ellipse cx="300" cy="640" rx="210" ry="13" fill="rgba(80,20,40,.15)"/>
  <path d="M232 612 L368 612 L338 488 L262 488 Z" fill="url(#${id}-metal)"/>
  <rect x="150" y="604" width="300" height="34" rx="14" fill="url(#${id}-metal)"/>
  <rect x="160" y="606" width="280" height="5" rx="2.5" fill="#fff" opacity=".35"/>

  <circle cx="${CX}" cy="${CY}" r="${R}" fill="url(#${id}-glass)"/>
  <g clip-path="url(#${id}-clip)"><g class="balls"></g></g>
  <circle cx="${CX}" cy="${CY}" r="${R}" fill="url(#${id}-edge)"/>
  <ellipse cx="${CX}" cy="${CY}" rx="${R}" ry="46" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="3"/>
  <path d="M120 150 A190 190 0 0 1 270 50" fill="none" stroke="#fff" stroke-width="16" stroke-linecap="round" opacity=".7"/>
  <circle cx="140" cy="200" r="7" fill="#fff" opacity=".7"/>
  <circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="rgba(90,40,60,.2)" stroke-width="4"/>
  <circle cx="300" cy="${CY - R - 4}" r="14" fill="url(#${id}-metal)"/>
  <ellipse cx="300" cy="${CY + R - 3}" rx="30" ry="9" fill="url(#${id}-metal)"/>

  <g class="tube-ball"></g>
  <rect x="270" y="${CY + R}" width="60" height="${TUBE_Y + BR + 6 - (CY + R)}" rx="10"
        fill="url(#${id}-tube)" stroke="rgba(90,40,60,.25)" stroke-width="2"/>
  <rect x="278" y="${CY + R + 6}" width="7" height="${TUBE_Y - (CY + R) - 4}" rx="3.5" fill="#fff" opacity=".6"/>
</svg>`;
}

function ballMarkup(id, n) {
  return `<circle r="${BR}" fill="${ballColor(n)}" fill-opacity=".92"/>
    <g class="ball-spin">
      <circle r="${BR * 0.52}" fill="#fff" fill-opacity=".9"/>
      <text text-anchor="middle" dominant-baseline="central" font-size="${n > 9 ? 17 : 20}"
            font-weight="700" fill="#3f2830" font-family="Noto Sans TC, sans-serif">${n}</text>
    </g>
    <circle r="${BR}" fill="url(#${id}-shade)"/>
    <ellipse cx="-8" cy="-10" rx="7" ry="4" fill="#fff" opacity=".85" transform="rotate(-35 -8 -10)"/>`;
}

// 用真實時間做的小動畫（就算畫面變慢也會準時結束）
function tween(ms, fn) {
  return new Promise((resolve) => {
    const start = performance.now();
    let done = false;
    const finish = () => { if (!done) { done = true; fn(1); resolve(); } };
    const frame = (now) => {
      if (done) return;
      const p = Math.min(1, (now - start) / ms);
      if (p >= 1) return finish();
      fn(p);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    setTimeout(finish, ms + 250);
  });
}

export function createLottery(container, numbers) {
  const id = `lot${Math.random().toString(36).slice(2, 7)}`;
  container.innerHTML = svg(id);
  const el = container.querySelector('svg');
  const layer = el.querySelector('.balls');
  const tubeLayer = el.querySelector('.tube-ball');

  let balls = [];
  let tubeBall = null;
  let running = null;

  function makeBall(n, x, y) {
    const g = document.createElementNS(NS, 'g');
    g.innerHTML = ballMarkup(id, n);
    return { n, g, spin: g.querySelector('.ball-spin'), x, y, vx: 0, vy: 0, a: Math.random() * 360 };
  }

  function place(b) {
    b.g.setAttribute('transform', `translate(${b.x.toFixed(1)} ${b.y.toFixed(1)})`);
    b.spin.setAttribute('transform', `rotate(${b.a.toFixed(0)})`);
  }

  function add(n, x, y) {
    const b = makeBall(n, x, y);
    layer.append(b.g);
    balls.push(b);
    place(b);
    return b;
  }

  for (const n of numbers) {
    const ang = Math.random() * Math.PI * 2;
    const rad = Math.random() * (RIN - BR - 6);
    add(n, CX + Math.cos(ang) * rad, CY + Math.sin(ang) * rad);
  }

  function step(mode, t) {
    const k = mode === 'shake' ? Math.min(1, t / 0.5) : 0;      // 慢慢加大力道
    const sway = k * Math.sin(t * Math.PI * 2 * 5) * 7000;
    for (const b of balls) {
      let ax = sway, ay = G;
      if (k) {
        const dx = b.x - CX, dy = b.y - CY;
        const d = Math.hypot(dx, dy) || 1;
        if (dy > -40) ay -= k * (4200 + 3000 * (dy / RIN));    // 底部吹氣，把珠子往上噴
        ax += k * (-dy / d) * 900;                             // 一點點繞圈
        ay += k * (dx / d) * 900;
        ax += k * (Math.random() - 0.5) * 17000;               // 瘋狂亂跳
        ay += k * (Math.random() - 0.5) * 17000;
      }
      b.vx = (b.vx + ax * STEP) * 0.997;
      b.vy = (b.vy + ay * STEP) * 0.997;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > 950) { b.vx *= 950 / sp; b.vy *= 950 / sp; }
      b.x += b.vx * STEP;
      b.y += b.vy * STEP;
      b.a += (b.vx * STEP / BR) * 57.3;
    }
    for (let i = 0; i < balls.length; i++) {
      for (let j = i + 1; j < balls.length; j++) {
        const a = balls[i], c = balls[j];
        const dx = c.x - a.x, dy = c.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d >= BR * 2 || d === 0) continue;
        const nx = dx / d, ny = dy / d;
        const push = (BR * 2 - d) / 2;
        a.x -= nx * push; a.y -= ny * push;
        c.x += nx * push; c.y += ny * push;
        const rv = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
        if (rv < 0) {
          const imp = -(1 + 0.55) * rv / 2;
          a.vx -= imp * nx; a.vy -= imp * ny;
          c.vx += imp * nx; c.vy += imp * ny;
        }
      }
    }
    const max = RIN - BR;
    for (const b of balls) {
      const dx = b.x - CX, dy = b.y - CY;
      const d = Math.hypot(dx, dy);
      if (d <= max) continue;
      const nx = dx / d, ny = dy / d;
      b.x = CX + nx * max; b.y = CY + ny * max;
      const vn = b.vx * nx + b.vy * ny;
      if (vn > 0) {
        b.vx -= (1 + 0.6) * vn * nx;
        b.vy -= (1 + 0.6) * vn * ny;
        b.vx *= 0.98; b.vy *= 0.98;
      }
    }
  }

  function renderAll() { for (const b of balls) place(b); }

  for (let i = 0; i < 600; i++) step(null, 0);
  renderAll();

  // 物理動畫：mode 持續 seconds 秒，之後讓珠子落下靜止
  function animate(seconds, mode, settle = 2.5) {
    if (running) cancelAnimationFrame(running);
    return new Promise((resolve) => {
      const start = performance.now();
      let last = start, acc = 0;
      const fallback = setTimeout(resolve, seconds * 1000 + 250);
      const frame = (now) => {
        const elapsed = (now - start) / 1000;
        acc += Math.min(0.05, (now - last) / 1000);
        last = now;
        while (acc >= STEP) { step(elapsed < seconds ? mode : null, elapsed); acc -= STEP; }
        renderAll();
        if (elapsed >= seconds) { clearTimeout(fallback); resolve(); }
        running = elapsed < seconds + settle ? requestAnimationFrame(frame) : null;
      };
      running = requestAnimationFrame(frame);
    });
  }

  function clearTube() {
    tubeBall?.g.remove();
    tubeBall = null;
  }

  return {
    el,
    count: () => balls.length,
    inside: () => balls.map((b) => b.n),

    // 瘋狂搖動
    async shake(seconds) {
      clearTube();
      el.classList.add('shaking-hard');
      if (reduceMotion) await new Promise((r) => setTimeout(r, 300));
      else await animate(seconds, 'shake');
      el.classList.remove('shaking-hard');
    },

    // 指定號碼的珠子從底部出口掉進管子
    async release(n) {
      const b = balls.find((x) => x.n === n);
      if (!b) return;
      balls = balls.filter((x) => x !== b);
      if (!running) animate(0, null, 1.5);
      const holeY = CY + RIN - BR;
      const x0 = b.x, y0 = b.y, a0 = b.a;
      await tween(reduceMotion ? 1 : 420, (p) => {
        const e = p * p;
        b.x = x0 + (CX - x0) * e;
        b.y = y0 + (holeY - y0) * e;
        b.a = a0 + p * 180;
        place(b);
      });
      tubeLayer.append(b.g);    // 移到管子裡（不再被大球裁切）
      tubeBall = b;
      await tween(reduceMotion ? 1 : 520, (p) => {
        // 掉下去，最後彈一下
        const bounce = p < 0.75 ? (p / 0.75) ** 2 : 1 - Math.sin(((p - 0.75) / 0.25) * Math.PI) * 0.06;
        b.y = holeY + (TUBE_Y - holeY) * bounce;
        b.a = a0 + 180 + p * 220;
        place(b);
      });
      b.a = 0;
      place(b);
    },

    // 把珠子放回大球（從上面掉進去）
    putBack(nums) {
      for (const n of [].concat(nums)) {
        if (tubeBall?.n === n) clearTube();
        if (balls.some((b) => b.n === n)) continue;
        const b = add(n, CX + (Math.random() - 0.5) * 120, CY - RIN + BR + 4 + Math.random() * 30);
        b.vy = 200;
      }
      animate(0, null, 2.5);
    },
  };
}
