// 聯絡簿頁：顯示 Canva 設計（連結在後台設定）
import { CLASS_NAME } from './config.js';
import { configured, classroomDb, friendlyError } from './db.js';
import { el, startClock, canvaEmbedUrl } from './ui.js';

const $ = (id) => document.getElementById(id);
let current = null;

document.title = `聯絡簿｜${CLASS_NAME}`;
$('class-name').textContent = CLASS_NAME;
startClock($('clock'), $('date'));

function show(message) {
  current = null;
  $('frame').replaceChildren(el('p', { class: 'empty' }, message));
}

async function load() {
  const { data, error } = await classroomDb()
    .from('settings').select('value').eq('key', 'contact_book_url').maybeSingle();
  if (error) return show(`讀取失敗：${friendlyError(error)}`);
  const { url, error: bad } = canvaEmbedUrl(data?.value);
  if (!url) return show(data?.value ? `聯絡簿連結有問題：${bad}` : '老師還沒有設定聯絡簿連結 📒');
  if (url === current) return;   // 同一個連結就不重新載入，避免翻到的頁被跳回第一頁
  current = url;
  $('frame').replaceChildren(el('iframe', {
    src: url,
    title: '聯絡簿',
    loading: 'eager',
    allowfullscreen: true,
    allow: 'fullscreen',
  }));
}

async function start() {
  if (!configured) return show('還沒連上資料庫：請在 js/config.js 填入 Supabase 網址與公開鑰匙。');
  await load();
  classroomDb().channel('contact')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, load)
    .subscribe();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
}
start();
