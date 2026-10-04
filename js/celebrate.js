// 慶祝動畫：滿天彩帶＋大大的訊息
import * as sound from './sound.js';

const COLORS = ['#f39bb4', '#e86f92', '#f7c6d4', '#f5cd7a', '#9fd0b0', '#9fc0e8', '#d3a8e0', '#ffffff'];
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

let overlay = null;
let hideTimer = null;

// 彩帶動畫（可單獨使用，例如點名時小小撒一下）
export function confetti({ count = 180, duration = 4200 } = {}) {
  if (reduceMotion) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti';
  document.body.append(canvas);
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const resize = () => {
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
  };
  resize();

  const W = () => canvas.width, H = () => canvas.height;
  const pieces = Array.from({ length: count }, (_, i) => {
    const fromLeft = i % 2 === 0;
    return {
      x: fromLeft ? -20 * dpr : W() + 20 * dpr,
      y: H() * (0.55 + Math.random() * 0.35),
      vx: (fromLeft ? 1 : -1) * (6 + Math.random() * 12) * dpr,
      vy: -(14 + Math.random() * 14) * dpr,
      size: (7 + Math.random() * 9) * dpr,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.35,
      round: Math.random() < 0.3,
      wobble: Math.random() * Math.PI * 2,
    };
  });

  const start = performance.now();
  let last = start;
  const frame = (now) => {
    const t = now - start;
    const dt = Math.min(2.5, (now - last) / 16.7);
    last = now;
    ctx.clearRect(0, 0, W(), H());
    ctx.globalAlpha = t > duration - 800 ? Math.max(0, (duration - t) / 800) : 1;
    for (const p of pieces) {
      p.vy += 0.42 * dpr * dt;
      p.vx *= 0.985;
      p.vy = Math.min(p.vy, 5 * dpr);
      p.wobble += 0.12 * dt;
      p.x += (p.vx + Math.sin(p.wobble) * 1.4 * dpr) * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.round) {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2.4, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2 * Math.abs(Math.cos(p.wobble)) + 1);
      }
      ctx.restore();
    }
    if (t < duration) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}

// 某個作業全班完成
export function celebrate(title) {
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'celebrate';
    overlay.setAttribute('role', 'status');
    overlay.addEventListener('click', hide);
    document.body.append(overlay);
  }
  const titles = overlay.classList.contains('show')
    ? [...overlay.querySelectorAll('.celebrate-title')].map((n) => n.textContent).concat(title)
    : [title];

  overlay.innerHTML = `<div class="celebrate-card">
      <div class="celebrate-emoji">🎉</div>
      <p class="celebrate-main">全班完成！</p>
      ${titles.map(() => '<p class="celebrate-title"></p>').join('')}
    </div>`;
  overlay.querySelectorAll('.celebrate-title').forEach((n, i) => { n.textContent = titles[i]; });
  overlay.classList.add('show');

  confetti();
  sound.fanfare();
  clearTimeout(hideTimer);
  hideTimer = setTimeout(hide, 4500);
}

function hide() {
  clearTimeout(hideTimer);
  overlay?.classList.remove('show');
}
