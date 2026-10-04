// ============================================================
// 網站設定
// SUPABASE_URL 和 SUPABASE_KEY 從 Supabase 的「Project Settings → API Keys」複製過來。
// 這把是「公開鑰匙」（Publishable / anon key），本來就設計成可以放在網頁裡，
// 真正的保護靠資料庫的權限設定。
// ⚠️ 千萬不要把「secret / service_role」那把鑰匙貼到這裡。
// ============================================================

export const SUPABASE_URL = 'https://kpioyqyeubinxitjvcei.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_ryf5day9SRaVK7jJkw9ccg_VfeRwrGS';

export const CLASS_NAME = '最閃亮的11班';
export const SEAT_COUNT = 24;

// 登入用的虛構 Email（不是真的信箱，只是帳號名稱）
export const TEACHER_EMAIL = 'teacher@shiny11.local';
export const CLASSROOM_EMAIL = 'classroom@shiny11.local';
