// ============================================================
// 熊熊遊樂園的「科任老師模式」
//  白板網址帶著 ?rc=班級編號&n=人數 時（從熊熊遊樂園後台按「開遊戲」進來）：
//   ・題目只列這位老師自己的題組
//   ・成績記到這個班，結算時可以換成課堂分數
// ============================================================
export const RC_COURSE = (() => {
  const id = Number(new URLSearchParams(location.search).get('rc'));
  return Number.isInteger(id) && id > 0 ? id : 0;
})();

// 沒登入時用一個不存在的帳號查題組 → 不會列出別人的題組
const NOBODY = '00000000-0000-0000-0000-000000000000';

let cached = null;
/* 目前登入的科任老師：{ db, uid }；沒登入回傳 null */
export async function rcSession() {
  if (!RC_COURSE) return null;
  if (cached) return cached;
  try {
    const { rcDb } = await import('./db.js?v=202610311901');
    const db = rcDb();
    if (!db) return null;
    const { data: { session } } = await db.auth.getSession();
    cached = session ? { db, uid: session.user.id } : null;
  } catch { cached = null; }
  return cached;
}

/* 白板列題組時用：科任老師模式回傳老師的 id；班導模式回傳 undefined */
export async function setsOwner() {
  if (!RC_COURSE) return undefined;
  const s = await rcSession();
  return s ? s.uid : NOBODY;
}

/* 這個班的名稱（白板標題用） */
export async function rcCourseName() {
  const s = await rcSession();
  if (!s) return '';
  const { data } = await s.db.from('rc_courses').select('name').eq('id', RC_COURSE).maybeSingle();
  return data?.name || '';
}

/* 從目前網址留下 rc、n（換頁時帶著走） */
export function rcQuery() {
  const q = new URLSearchParams(location.search), out = new URLSearchParams();
  ['rc', 'n'].forEach((k) => { if (q.get(k)) out.set(k, q.get(k)); });
  return out;
}
