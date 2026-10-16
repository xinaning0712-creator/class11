// ============================================================
// iPad 防放大：iPad 的 Safari 會忽略網頁的「禁止縮放」設定，
// 孩子兩指撐開或快點兩下，畫面會放大到只看得到一兩個選項。
//  1. 擋住兩指縮放、快點兩下放大
//  2. 萬一還是放大了，自動縮回原本大小
// ============================================================
const meta = document.querySelector('meta[name="viewport"]');
const BASE = meta ? meta.getAttribute('content') : '';
const typing = () => { const a = document.activeElement; return a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName); };

// 1-1 兩指縮放（Safari 專用的 gesture 事件＋兩指 touchmove）
['gesturestart', 'gesturechange', 'gestureend'].forEach(t =>
  document.addEventListener(t, e => e.preventDefault(), { passive: false }));
document.addEventListener('touchmove', e => {
  if (e.touches.length > 1 || (typeof e.scale === 'number' && e.scale !== 1)) e.preventDefault();
}, { passive: false });

// 1-2 快點兩下放大（按鈕都用 pointerdown／pointerup，擋掉 touchend 不影響作答）
let lastEnd = 0;
document.addEventListener('touchend', e => {
  const now = Date.now();
  if (now - lastEnd < 350 && !(e.target.closest && e.target.closest('input,textarea,select'))) e.preventDefault();
  lastEnd = now;
}, { passive: false });
document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });

// 2. 放大了就自動縮回來（改一下 viewport 設定，Safari 會重新套用成 1 倍）
export function resetZoom() {
  if (!meta) return;
  meta.setAttribute('content', BASE.replace(/maximum-scale=[^,]*/, 'maximum-scale=1.01'));
  setTimeout(() => { meta.setAttribute('content', BASE); window.scrollTo(0, 0); }, 60);
}
const vv = window.visualViewport;
let timer = 0;
function check() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (vv && vv.scale > 1.02 && !typing()) resetZoom();
  }, 350);
}
if (vv) { vv.addEventListener('resize', check); vv.addEventListener('scroll', check); }
document.addEventListener('focusout', () => setTimeout(check, 300));   // 打完暱稱收起鍵盤後也檢查一次
