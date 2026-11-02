// ============================================================
// ✍️ 小組簡答：白板（short-host）和 iPad（short）共用
//  每組一台 iPad：選組別加入 → 看題目 → 打字作答送出（送出後鎖住）
//  白板：收齊或時間到一起翻開（先匿名）→ 老師點星星評分 → 揭曉組別並記到小組分
// ============================================================
export const GROUP_COLORS = ['#f4a3b8', '#f6c27a', '#9fd3a8', '#8fc3e8', '#c7a8e6', '#f2a07b', '#7fcfc4', '#e8b4d6', '#b9c97a', '#a7b4f0', '#e6c39a', '#9ad0e0'];
export const ANSWER_MAX = 300;
export const REJOIN_MS = 3 * 60 * 60 * 1000;     // 3 小時內重新打開網頁，會自動回到剛剛的房間

export const groupColor = (g) => GROUP_COLORS[((g && g.color) || 0) % GROUP_COLORS.length];

export function cleanAnswer(s) {
  return Array.from(String(s || '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim()).slice(0, ANSWER_MAX).join('');
}
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
