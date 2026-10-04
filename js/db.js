// 連線到 Supabase。
// 老師登入和教室電腦登入分開保存，互不影響：
//  - 教室模式：一直記在這台裝置上。
//  - 老師登入：勾「記住我」才會一直記住，否則關掉分頁就登出。
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

export const configured = SUPABASE_URL.startsWith('https://') && SUPABASE_KEY.length > 20;

const REMEMBER_KEY = 'shiny11-teacher-remember';

function safe(fn, fallback = null) {
  try { return fn(); } catch { return fallback; }
}

export function setRememberTeacher(on) {
  safe(() => on ? localStorage.setItem(REMEMBER_KEY, '1') : localStorage.removeItem(REMEMBER_KEY));
}

function rememberTeacher() {
  return safe(() => localStorage.getItem(REMEMBER_KEY) === '1', false);
}

// 依「記住我」決定存在 localStorage（一直記得）或 sessionStorage（關分頁就忘）
const teacherStorage = {
  getItem: (k) => safe(() => localStorage.getItem(k)) ?? safe(() => sessionStorage.getItem(k)),
  setItem: (k, v) => {
    if (rememberTeacher()) {
      safe(() => localStorage.setItem(k, v));
      safe(() => sessionStorage.removeItem(k));
    } else {
      safe(() => sessionStorage.setItem(k, v));
      safe(() => localStorage.removeItem(k));
    }
  },
  removeItem: (k) => {
    safe(() => localStorage.removeItem(k));
    safe(() => sessionStorage.removeItem(k));
  },
};

let teacher = null;
let classroom = null;

export function teacherDb() {
  if (!configured) return null;
  teacher ??= createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { storageKey: 'shiny11-teacher', storage: teacherStorage },
  });
  return teacher;
}

export function classroomDb() {
  if (!configured) return null;
  classroom ??= createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { storageKey: 'shiny11-classroom' },
  });
  return classroom;
}

// 目前這個登入身分是什麼：'teacher'、'classroom' 或 null
export async function roleOf(db) {
  const { data: { session } } = await db.auth.getSession();
  if (!session) return null;
  const { data, error } = await db.rpc('my_role');
  if (error) return null;
  return data;
}

// 這台裝置能不能操作（老師登入或教室模式）；回傳 { db, role }，只能看時兩者都是 null
export async function findOperator() {
  if (await roleOf(teacherDb()) === 'teacher') return { db: teacherDb(), role: 'teacher' };
  if (await roleOf(classroomDb()) === 'classroom') return { db: classroomDb(), role: 'classroom' };
  return { db: null, role: null };
}

// 把資料庫的錯誤訊息轉成看得懂的中文
export function friendlyError(error) {
  const msg = error?.message || String(error);
  if (/Invalid login credentials/i.test(msg)) return '密碼不正確（或帳號 Email 拼錯）';
  if (/Email not confirmed/i.test(msg)) return '帳號還沒啟用：請到 Supabase 確認建立帳號時有勾 Auto Confirm User';
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return '連不上網路，請檢查網路後再試一次';
  if (/JWT|expired/i.test(msg)) return '登入已過期，請重新登入';
  return msg;
}
