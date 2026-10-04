// 老師後台
import { CLASS_NAME, TEACHER_EMAIL } from './config.js';
import { configured, teacherDb, setRememberTeacher, roleOf, friendlyError } from './db.js';
import { STATUS, SEATS, el, toast, debounce, canvaEmbedUrl } from './ui.js';
import * as gacha from './admin-gacha.js';

const $ = (id) => document.getElementById(id);
const key = (a, s) => `${a}-${s}`;

let db = null;
let pen = 'red';
let assignments = [];   // 全部作業（含封存）
let lights = new Map();

$('login-class').textContent = CLASS_NAME;

// ---------- 登入 / 登出 ----------
function showLogin() {
  $('app-view').hidden = true;
  $('login-view').hidden = false;
  $('pw').focus();
}

async function showApp() {
  $('login-view').hidden = true;
  $('app-view').hidden = false;
  gacha.init(db);
  await Promise.all([load(), gacha.load(), loadContact()]);
  const reloadGacha = debounce(gacha.load, 300);
  db.channel('admin')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'lights' }, reload)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'assignments' }, reload)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'prizes' }, reloadGacha)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'punishments' }, reloadGacha)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'draws' }, reloadGacha)
    .subscribe();
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { load(); gacha.load(); }
  });
}

// ---------- 📒 聯絡簿連結 ----------
async function loadContact() {
  const { data, error } = await db.from('settings').select('key, value')
    .in('key', ['contact_book_url', 'contact_book_ratio']);
  if (error) return;
  const setting = Object.fromEntries(data.map((r) => [r.key, r.value]));
  $('contact-url').value = setting.contact_book_url ?? '';
  $('contact-ratio').value = setting.contact_book_ratio ?? '16:9';
  $('contact-msg').textContent = setting.contact_book_url ? '目前的聯絡簿連結 ✓' : '還沒有設定聯絡簿連結';
}

$('contact-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const raw = $('contact-url').value.trim();
  const { url, error: bad } = canvaEmbedUrl(raw);
  if (!url) {
    $('contact-msg').textContent = `⚠️ ${bad}`;
    return;
  }
  const value = url.replace(/\?embed$/, '');   // 存成一般的檢視連結
  const now = new Date().toISOString();
  const { error } = await db.from('settings').upsert([
    { key: 'contact_book_url', value, updated_at: now },
    { key: 'contact_book_ratio', value: $('contact-ratio').value, updated_at: now },
  ]);
  if (error) return toast(`儲存失敗：${friendlyError(error)}`, { tone: 'error', seconds: 5 });
  $('contact-url').value = value;
  $('contact-msg').textContent = '已儲存 ✓ 教室的聯絡簿頁會自動更新';
  toast('聯絡簿連結已儲存');
});

// ---------- 分頁切換 ----------
const TAB_KEY = 'shiny11-admin-tab';
function showTab(name) {
  if (!document.getElementById(`tab-${name}`)) name = 'homework';
  document.querySelectorAll('button.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach((p) => { p.hidden = p.id !== `tab-${name}`; });
  try { sessionStorage.setItem(TAB_KEY, name); } catch { /* 記不住也沒關係 */ }
}
document.querySelectorAll('button.tab').forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));
try { showTab(sessionStorage.getItem(TAB_KEY) || 'homework'); } catch { showTab('homework'); }

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('login-err').hidden = true;
  setRememberTeacher($('remember').checked);
  const { error } = await db.auth.signInWithPassword({ email: TEACHER_EMAIL, password: $('pw').value });
  if (error) {
    $('login-err').textContent = friendlyError(error);
    $('login-err').hidden = false;
    return;
  }
  if (await roleOf(db) !== 'teacher') {
    await db.auth.signOut();
    $('login-err').textContent = '這個帳號沒有老師權限';
    $('login-err').hidden = false;
    return;
  }
  $('pw').value = '';
  showApp();
});

$('logout').addEventListener('click', async () => {
  await db.auth.signOut();
  location.reload();
});

// ---------- 讀取 ----------
async function load() {
  const { data: as, error: e1 } = await db
    .from('assignments').select('id, title, archived, created_at')
    .order('created_at', { ascending: false });
  if (e1) return toast(`讀取失敗：${friendlyError(e1)}`, { tone: 'error', seconds: 5 });
  const activeIds = as.filter((a) => !a.archived).map((a) => a.id);
  let ls = [];
  if (activeIds.length) {
    const { data, error: e2 } = await db
      .from('lights').select('assignment_id, seat, status').in('assignment_id', activeIds);
    if (e2) return toast(`讀取失敗：${friendlyError(e2)}`, { tone: 'error', seconds: 5 });
    ls = data;
  }
  assignments = as;
  lights = new Map(ls.map((l) => [key(l.assignment_id, l.seat), l.status]));
  render();
}
const reload = debounce(load, 300);

// ---------- 畫面 ----------
function render() {
  const active = assignments.filter((a) => !a.archived);
  const archived = assignments.filter((a) => a.archived);

  $('active-list').replaceChildren(...(active.length
    ? active.map(renderActive)
    : [el('p', { class: 'empty small' }, '目前沒有作業項目，從上面新增一個吧。')]));

  $('archived-list').replaceChildren(...(archived.length
    ? archived.map((a) => el('div', { class: 'archived-row' },
        el('span', {}, a.title),
        el('button', { class: 'btn small', type: 'button', onclick: () => setArchived(a, false) }, '還原')))
    : [el('p', { class: 'muted' }, '沒有封存的作業')]));
}

function renderActive(a) {
  const seats = SEATS.map((s) => {
    const st = lights.get(key(a.id, s)) ?? 'green';
    return el('button', {
      class: `seat ${st}`,
      type: 'button',
      'aria-label': `${s} 號，${STATUS[st].label}`,
      onclick: () => setLight(a, s),
    }, s);
  });
  return el('article', { class: 'card admin-assignment' },
    el('header', { class: 'assignment-head' },
      el('h2', {}, a.title),
      el('div', { class: 'row-actions' },
        el('button', { class: 'btn small ghost', type: 'button', onclick: () => rename(a) }, '改名'),
        el('button', { class: 'btn small', type: 'button', onclick: () => setArchived(a, true) }, '封存'))),
    el('div', { class: 'seats compact' }, seats));
}

// ---------- 動作 ----------
$('add-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = $('new-title').value.trim();
  if (!title) return;
  const { error } = await db.from('assignments').insert({ title });
  if (error) return toast(`新增失敗：${friendlyError(error)}`, { tone: 'error', seconds: 5 });
  $('new-title').value = '';
  toast(`已新增「${title}」`);
  load();
});

document.querySelectorAll('.pen').forEach((btn) => {
  btn.addEventListener('click', () => {
    pen = btn.dataset.pen;
    document.querySelectorAll('.pen').forEach((b) => {
      b.classList.toggle('active', b === btn);
      b.setAttribute('aria-checked', b === btn);
    });
  });
});

async function setLight(a, seat) {
  const k = key(a.id, seat);
  const before = lights.get(k);
  if (before === pen) return;
  lights.set(k, pen);
  render();
  const { error } = await db.rpc('set_light', { p_assignment: a.id, p_seat: seat, p_status: pen });
  if (error) {
    lights.set(k, before);
    render();
    toast(`沒有改成功：${friendlyError(error)}`, { tone: 'error', seconds: 5 });
  }
}

async function setArchived(a, archived) {
  if (archived && !confirm(`確定要封存「${a.title}」嗎？\n封存後主畫面就不會顯示，之後可以在「已封存的作業」還原。`)) return;
  const { error } = await db.from('assignments').update({ archived }).eq('id', a.id);
  if (error) return toast(`操作失敗：${friendlyError(error)}`, { tone: 'error', seconds: 5 });
  toast(archived ? `已封存「${a.title}」` : `已還原「${a.title}」`);
  load();
}

async function rename(a) {
  const title = prompt('新的作業名稱：', a.title)?.trim();
  if (!title || title === a.title) return;
  const { error } = await db.from('assignments').update({ title }).eq('id', a.id);
  if (error) return toast(`改名失敗：${friendlyError(error)}`, { tone: 'error', seconds: 5 });
  load();
}

// ---------- 啟動 ----------
async function start() {
  if (!configured) {
    $('login-view').hidden = false;
    $('login-form').replaceChildren(el('h1', {}, '老師後台'),
      el('p', { class: 'error' }, '還沒連上資料庫：請在 js/config.js 填入 Supabase 網址與公開鑰匙。'));
    return;
  }
  db = teacherDb();
  if (await roleOf(db) === 'teacher') showApp();
  else showLogin();
}
start();
