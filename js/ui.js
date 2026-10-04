// 各頁共用的小工具
import { SEAT_COUNT } from './config.js';

export const STATUS = {
  green: { label: '完成', short: '綠' },
  yellow: { label: '未訂正完成', short: '黃' },
  red: { label: '未交', short: '紅' },
};

export const SEATS = Array.from({ length: SEAT_COUNT }, (_, i) => i + 1);

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

// 底部提示訊息；可帶一個按鈕（例如「復原」）與倒數秒數
let toastTimer = null;
export function toast(message, { action, seconds = 3, tone = 'info' } = {}) {
  let box = document.getElementById('toast');
  if (!box) {
    box = el('div', { id: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(box);
  }
  clearInterval(toastTimer);
  box.replaceChildren();
  box.className = `toast show ${tone}`;
  box.append(el('span', { class: 'toast-msg' }, message));

  let left = seconds;
  let countdown = null;
  if (action) {
    countdown = el('span', { class: 'toast-count' }, `${left}`);
    const btn = el('button', {
      class: 'toast-btn',
      type: 'button',
      onclick: async () => {
        hide();
        await action.run();
      },
    }, action.label, ' ', countdown);
    box.append(btn);
  }

  function hide() {
    clearInterval(toastTimer);
    box.className = 'toast';
  }

  toastTimer = setInterval(() => {
    left -= 1;
    if (countdown) countdown.textContent = `${left}`;
    if (left <= 0) hide();
  }, 1000);
}

export function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// 大時鐘與日期
export function startClock(timeEl, dateEl) {
  const timeFmt = new Intl.DateTimeFormat('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
  const dateFmt = new Intl.DateTimeFormat('zh-TW', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  const tick = () => {
    const now = new Date();
    timeEl.textContent = timeFmt.format(now);
    dateEl.textContent = dateFmt.format(now);
  };
  tick();
  setInterval(tick, 1000);
}

// 把 Canva 的分享連結（或嵌入程式碼）轉成可以放在網頁裡的嵌入網址
// 回傳 { url } 或 { error }
export function canvaEmbedUrl(input) {
  let text = (input || '').trim();
  const src = text.match(/src=["']([^"']+)["']/i);   // 貼的是整段嵌入程式碼
  if (src) text = src[1];
  if (!text) return { error: '請貼上 Canva 連結' };
  if (text.startsWith('//')) text = `https:${text}`;
  let u;
  try { u = new URL(text); } catch { return { error: '這看起來不是網址，請重新複製 Canva 的連結' }; }
  if (!/(^|\.)canva\.com$/.test(u.hostname)) {
    return { error: '請貼 canva.com 開頭的連結（短網址 canva.link 不能用，請在 Canva 複製完整的檢視連結）' };
  }
  const m = u.pathname.match(/^\/design\/([^/]+)(?:\/([^/]+))?\/(view|edit|watch)/);
  if (!m) return { error: '找不到設計編號，請在 Canva 按「分享」複製檢視連結' };
  if (m[3] === 'edit') {
    return { error: '這是「編輯」連結，請改用 Canva「分享 → 檢視連結」（網址結尾是 /view）' };
  }
  const path = m[2] ? `/design/${m[1]}/${m[2]}/view` : `/design/${m[1]}/view`;
  return { url: `https://www.canva.com${path}?embed` };
}
