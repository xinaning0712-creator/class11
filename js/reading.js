// ============================================================
// 🐻 熊熊遊樂園・老師後台
//  科任老師（例如智慧閱讀老師）：
//   🌟 上課計分（投影在白板，點孩子或小組加扣分）
//   👥 名單與分組  🎟 兌換集點（11 班）  📊 學期統計  🎮 題庫  ⚙️ 設定
//  班導（用自己的老師帳號登入）：只看得到 11 班的名單、兌換集點、學期統計
// ============================================================
import { configured, rcDb, setRememberRc, friendlyError } from './db.js?v=202611021734';
import { el, toast } from './ui.js?v=202611021734';
import { avatarImg, avatarOf, AVATAR_COUNT, avatarName } from './bear-friends.js?v=202611021734';
import { ask, sure } from './dialogs.js?v=202611021734';
import * as quizbank from './admin-quiz.js?v=202611021734';

const $ = (id) => document.getElementById(id);
const DOMAIN = '@shiny11.local';
const ACCOUNT_KEY = 'shiny11-rc-account';
const GROUP_COLORS = ['#f4a3b8', '#f6c27a', '#9fd3a8', '#8fc3e8', '#c7a8e6', '#f2a07b', '#7fcfc4', '#e8b4d6', '#b9c97a', '#a7b4f0', '#e6c39a', '#9ad0e0'];

const db = rcDb();
const A = {
  me: null,            // { user_id, name, subject, game_join, game_top, game_win }；班導登入時是 null
  uid: null,
  isOwner: false,      // 現在這一班是不是自己的（自己的班：可以計分、改設定；別人的班：只能看名單、兌換、統計）
  labels: {},          // 別人的班顯示「11班・智慧閱讀」
  courses: [], course: null,
  students: [], groups: [], behaviors: [],
  events: [],          // 這個班全部的加扣分（含撤銷的）
  exchanges: [],
  tab: 'board',
  who: 'stu',          // 計分對象：stu 個人、grp 小組
  multi: false, picked: new Set(),
  target: null,        // 加扣分視窗：{ kind:'stu'|'grp', ids:[…] }
};

const fail = (what, error) => toast(`${what}失敗：${friendlyError(error)}`, { tone: 'error', seconds: 6 });
const byId = (list, id) => list.find((x) => x.id === id);
const sortSeat = (a, b) => a.seat - b.seat;
const live = (e) => !e.undone_at;
const groupColor = (g) => GROUP_COLORS[(g?.color ?? 0) % GROUP_COLORS.length];
const stuLabel = (s) => `${s.seat} 號${s.name ? ' ' + s.name : ''}`;

/* ============================================================
   小音效（Web Audio 即時合成，不用載入檔案）
   ============================================================ */
let ac = null;
function tone(f, start, dur, type = 'triangle', vol = 0.18) {
  try {
    ac ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();
    const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime + start;
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + dur + 0.05);
  } catch { /* 沒有音效也沒關係 */ }
}
const sfx = {
  plus() { tone(784, 0, 0.14); tone(1047, 0.1, 0.22); tone(1319, 0.2, 0.3); },
  minus() { tone(330, 0, 0.18, 'sine', 0.14); tone(247, 0.14, 0.3, 'sine', 0.12); },
  pop() { tone(660, 0, 0.08, 'sine', 0.1); },
};

/* ============================================================
   期間（學期）：上學期 8/1～1/31，下學期 2/1～7/31
   ============================================================ */
function termRange(offset = 0) {
  const now = new Date();
  let y = now.getFullYear(), first = now.getMonth() >= 7 || now.getMonth() === 0;   // 8～12 月、1 月是上學期
  if (now.getMonth() === 0) y -= 1;
  let startY = y, startM = first ? 7 : 1;
  for (let i = 0; i < -offset; i++) {
    if (startM === 7) startM = 1; else { startM = 7; startY -= 1; }
  }
  const start = new Date(startY, startM, 1);
  const end = startM === 7 ? new Date(startY + 1, 1, 1) : new Date(startY, 7, 1);
  return { start, end };
}
function currentRange() {
  const v = $('st-range')?.value || 'term';
  if (v === 'term') return termRange(0);
  if (v === 'last') return termRange(-1);
  if (v === '30') return { start: new Date(Date.now() - 30 * 864e5), end: new Date(Date.now() + 864e5) };
  return { start: new Date(2000, 0, 1), end: new Date(2100, 0, 1) };
}
const inRange = (iso, r) => { const t = new Date(iso); return t >= r.start && t < r.end; };
const fmtDate = (d) => d.toLocaleDateString('zh-TW', { year: 'numeric', month: 'numeric', day: 'numeric' });
const fmtTime = (iso) => new Date(iso).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

/* ============================================================
   🎨 版面風格（記在這台電腦）
   ============================================================ */
const THEME_KEY = 'shiny11-rc-theme';
const THEMES = [
  { id: 'rose', name: '🌸 玫瑰奶茶', sw: ['#fbf0f3', '#c25d7c', '#ffe9a8'] },
  { id: 'matcha', name: '🍵 抹茶拿鐵', sw: ['#eef3e6', '#6f9a5b', '#fff3c4'] },
  { id: 'bear', name: '🧸 奶茶熊', sw: ['#f4ece2', '#9c6f45', '#f6d9a8'] },
  { id: 'candy', name: '🍬 糖果繽紛', sw: ['#fff5fb', '#e0609b', '#9fd3a8'] },
  { id: 'night', name: '🌙 星空夜晚', sw: ['#1f2340', '#f2a7c3', '#ffd86b'], dark: true },
  { id: 'lux', name: '🖤 黑金典雅', sw: ['#141418', '#c9a25b', '#f2ede4'], dark: true, mature: true },
  { id: 'gallery', name: '🤍 極簡美術館', sw: ['#f4f3f0', '#141414', '#e2e0db'], mature: true },
  { id: 'neon', name: '⚡ 電競霓虹', sw: ['#0a0e1d', '#3fe0ff', '#ff4fd8'], dark: true, mature: true },
];
function applyTheme(id) {
  const th = THEMES.find((x) => x.id === id) || THEMES[0];
  const t = th.id;
  if (t === 'rose') delete document.body.dataset.rcTheme; else document.body.dataset.rcTheme = t;
  document.body.toggleAttribute('data-rc-dark', !!th.dark);       // 深色底：按鈕、輸入框跟著變深
  document.body.toggleAttribute('data-rc-mature', !!th.mature);   // 成熟風：換成黑體
  try { localStorage.setItem(THEME_KEY, t); } catch { /* ignore */ }
  document.querySelectorAll('.rc-theme').forEach((b) => b.classList.toggle('on', b.dataset.theme === t));
}
function renderThemes() {
  let cur = 'rose';
  try { cur = localStorage.getItem(THEME_KEY) || 'rose'; } catch { /* ignore */ }
  $('theme-list').replaceChildren(...THEMES.map((t) => el('button', {
    class: 'rc-theme' + (t.id === cur ? ' on' : ''), type: 'button', 'data-theme': t.id,
    onclick: () => { applyTheme(t.id); sfx.pop(); },
  }, el('span', { class: 'rc-theme-sw' }, ...t.sw.map((c) => el('i', { style: `background:${c}` }))), el('span', {}, t.name))));
}
try { applyTheme(localStorage.getItem(THEME_KEY) || 'rose'); } catch { /* ignore */ }

/* ============================================================
   登入
   ============================================================ */
function showLogin(msg) {
  $('app-view').hidden = true;
  $('login-view').hidden = false;
  $('login-bear').innerHTML = avatarImg(0, 96);
  try { $('rc-account').value = localStorage.getItem(ACCOUNT_KEY) || ''; } catch { /* ignore */ }
  if (msg) { $('login-err').textContent = msg; $('login-err').hidden = false; }
  ($('rc-account').value ? $('pw') : $('rc-account')).focus();
}

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const acct = $('rc-account').value.trim().toLowerCase();
  const email = acct.includes('@') ? acct : acct + DOMAIN;
  $('login-err').hidden = true;
  setRememberRc($('remember').checked);
  const { error } = await db.auth.signInWithPassword({ email, password: $('pw').value });
  if (error) { $('login-err').textContent = friendlyError(error); $('login-err').hidden = false; return; }
  try { localStorage.setItem(ACCOUNT_KEY, acct); } catch { /* ignore */ }
  $('pw').value = '';
  start();
});

$('logout').addEventListener('click', async () => {
  await db.auth.signOut();
  location.reload();
});

async function start() {
  const { data: { session } } = await db.auth.getSession();
  if (!session) return showLogin();
  const uid = session.user.id;

  const { data: me, error } = await db.from('rc_teachers').select('*').eq('user_id', uid).maybeSingle();
  if (error && /rc_teachers|42P01|PGRST205/.test(`${error.code} ${error.message}`)) {
    return showLogin('還沒建立熊熊遊樂園的資料表：請先在 Supabase 執行 supabase/10_熊熊遊樂園_科任老師.sql');
  }
  A.me = me || null;
  A.uid = uid;
  const { data: role } = await db.rpc('my_role');
  A.homeroom = role === 'teacher';      // 班導：題庫要選科目
  if (!A.me) {
    if (!A.homeroom) {
      await db.auth.signOut();
      return showLogin('這個帳號還不能使用熊熊遊樂園後台（請班導幫忙開通）');
    }
  }

  const { data: courses, error: cErr } = await db.from('rc_courses').select('*').order('sort').order('id');
  if (cErr) return fail('讀取班級', cErr);
  A.courses = courses || [];
  if (!A.courses.length) {
    await db.auth.signOut();
    return showLogin(A.me ? '找不到你的班級，請班導重新執行設定' : '科任老師還沒建立 11 班');
  }
  // 自己的班排前面；別人的班查一下是哪一科（例如班導看到的「11班・智慧閱讀」）
  A.courses.sort((a, b) => (a.owner === uid ? 0 : 1) - (b.owner === uid ? 0 : 1) || a.sort - b.sort || a.id - b.id);
  await Promise.all(A.courses.filter((c) => c.owner !== uid).map(async (c) => {
    const { data } = await db.rpc('rc_course_teacher', { p_course: c.id });
    if (data) A.labels[c.id] = data;
  }));

  $('login-view').hidden = true;
  $('app-view').hidden = false;
  $('rc-who').textContent = A.me ? me.subject : '班導';   // 上方只顯示科目（投影時不用秀老師的名字）

  if (A.me) {
    quizbank.init(db, { owner: uid, oneSubject: !A.homeroom });
    quizbank.load();
    await loadBehaviors();
  }
  let saved = null;
  try { saved = Number(sessionStorage.getItem('rc-course')); } catch { /* ignore */ }
  // 有好幾個班：先問今天要上哪一班（重新整理時記得剛剛選的班，不會再問）
  const first = A.courses.find((c) => c.id === saved) || (A.courses.length > 1 ? await pickCourse(false) : A.courses[0]);
  await selectCourse(first);
  showTab(A.isOwner ? 'board' : 'roster');
}

/* ============================================================
   班級切換與資料讀取
   ============================================================ */
/* 畫面上只顯示「現在這一班」；其他班的名字只會出現在按「換班」後的選班視窗裡
   （投影到白板時，孩子不會看到老師還帶哪些班） */
function courseLabel(c) {
  if (!c) return '';
  const mineSomewhere = A.courses.some((x) => x.owner === A.uid);
  return c.owner !== A.uid && mineSomewhere ? `${c.name}・${A.labels[c.id] || '科任課'}` : c.name;
}
function renderClassPills() {
  $('rc-current').textContent = courseLabel(A.course);
  $('rc-switch').hidden = A.courses.length < 2;
}

/* 選班視窗：回傳選到的班；canCancel = false 時一定要選一班 */
let pickResolve = null;
function pickCourse(canCancel = true) {
  $('cls-pick').replaceChildren(...A.courses.map((c) => el('button', {
    class: 'rc-pick-btn' + (c.id === A.course?.id ? ' active' : ''), type: 'button',
    onclick: () => { const r = pickResolve; pickResolve = null; $('cls-dialog').close(); r?.(c); },
  }, courseLabel(c))));
  $('cls-cancel').hidden = !canCancel;
  return new Promise((resolve) => {
    pickResolve = resolve;
    $('cls-dialog').showModal();
  });
}
$('cls-cancel').addEventListener('click', () => { const r = pickResolve; pickResolve = null; $('cls-dialog').close(); r?.(null); });
$('cls-dialog').addEventListener('cancel', (e) => {
  if ($('cls-cancel').hidden) { e.preventDefault(); return; }   // 第一次一定要選
  const r = pickResolve; pickResolve = null; r?.(null);
});
$('rc-switch').addEventListener('click', async () => {
  const c = await pickCourse(true);
  if (c && c.id !== A.course?.id) { await selectCourse(c); toast(`已切換到 ${courseLabel(c)}`); }
});

async function selectCourse(c) {
  A.course = c;
  A.isOwner = c.owner === A.uid;
  document.body.classList.toggle('rc-homeroom', !A.isOwner);   // 別人的班：只顯示名單、兌換、統計
  A.picked.clear();
  try { sessionStorage.setItem('rc-course', String(c.id)); } catch { /* ignore */ }
  renderClassPills();
  document.body.classList.toggle('rc-is-home', !!c.stamps);   // 只有連到扭蛋集點的班才有「兌換集點」
  const play = `live-host.html?rc=${c.id}&n=${c.seat_count}`;
  $('bd-play').href = play;
  const qp = $('rc-quiz-play'); if (qp) qp.href = play;
  if (!canUse(A.tab)) showTab(A.isOwner ? 'board' : 'roster');   // 換到不能用這個分頁的班
  await loadCourse();
}

/* 一次讀 1000 筆，讀到完為止（Supabase 一次最多回傳 1000 筆） */
async function loadAll(build) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

async function loadCourse() {
  const id = A.course.id;
  try {
    const [stu, grp, ev, ex] = await Promise.all([
      loadAll(() => db.from('rc_students').select('*').eq('course_id', id).order('seat')),
      loadAll(() => db.from('rc_groups').select('*').eq('course_id', id).order('sort').order('id')),
      loadAll(() => db.from('rc_events').select('*').eq('course_id', id).order('id')),
      A.course.stamps ? loadAll(() => db.from('rc_exchanges').select('*').eq('course_id', id).order('id')) : [],
    ]);
    A.students = stu; A.groups = grp; A.events = ev; A.exchanges = ex;
  } catch (error) { return fail('讀取資料', error); }
  renderAll();
}

async function loadBehaviors() {
  const { data, error } = await db.from('rc_behaviors').select('*').order('sort').order('id');
  if (error) return fail('讀取加扣分項目', error);
  A.behaviors = data;
}

/* ============================================================
   分數計算
   ============================================================ */
function stuPoints(id, range) {
  let sum = 0;
  for (const e of A.events) if (e.student_id === id && live(e) && (!range || inRange(e.created_at, range))) sum += e.points;
  return sum;
}
function grpPoints(id, range) {
  let sum = 0;
  for (const e of A.events) if (e.group_id === id && live(e) && (!range || inRange(e.created_at, range))) sum += e.points;
  return sum;
}
/* 兌換用的餘額：全部的個人分 − 已經換掉的分數（和資料庫的 rc_balance 一樣） */
function balance(id) {
  let used = 0;
  for (const x of A.exchanges) if (x.student_id === id && live(x)) used += x.points;
  return stuPoints(id) - used;
}

/* ============================================================
   分頁
   ============================================================ */
/* 班導只能用名單、兌換、統計；兌換只有 11 班有 */
function canUse(name) {
  const btn = document.querySelector(`.tab[data-tab="${name}"]`);
  if (!btn) return false;
  if ('own' in btn.dataset && !A.isOwner) return false;
  if ('home' in btn.dataset && !A.course?.stamps) return false;
  return true;
}
function showTab(name) {
  if (!canUse(name)) name = A.isOwner ? 'board' : 'roster';
  A.tab = name;
  document.querySelectorAll('.tab[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('main[id^="tab-"]').forEach((p) => { p.hidden = p.id !== `tab-${name}`; });
  renderTab();
}
document.querySelectorAll('.tab[data-tab]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

function renderAll() {
  renderExBadge();
  renderTab();
}
function renderTab() {
  if (!A.course) return;
  if (A.tab === 'board') renderBoard();
  else if (A.tab === 'roster') { renderGroups(); renderRoster(); }
  else if (A.tab === 'exchange') renderExchange();
  else if (A.tab === 'stats') renderStats();
  else if (A.tab === 'settings') renderSettings();
}

/* ============================================================
   🌟 上課計分
   ============================================================ */
function setWho(who) {
  A.who = who; A.picked.clear();
  $('bd-who-stu').classList.toggle('active', who === 'stu');
  $('bd-who-grp').classList.toggle('active', who === 'grp');
  renderBoard();
}
$('bd-who-stu').addEventListener('click', () => setWho('stu'));
$('bd-who-grp').addEventListener('click', () => setWho('grp'));
$('bd-multi').addEventListener('click', () => { A.multi = !A.multi; A.picked.clear(); renderBoard(); });
$('bd-multi-clear').addEventListener('click', () => { A.multi = false; A.picked.clear(); renderBoard(); });
$('bd-multi-go').addEventListener('click', () => {
  if (A.picked.size) openBehaviors({ kind: A.who, ids: [...A.picked] });
});
$('bd-all').addEventListener('click', () => {
  const ids = A.who === 'stu' ? A.students.map((s) => s.id) : A.groups.map((g) => g.id);
  if (ids.length) openBehaviors({ kind: A.who, ids, all: true });
});

function renderBoard() {
  const term = termRange(0);
  const grid = $('bd-grid');
  $('bd-multi').classList.toggle('primary', A.multi);
  $('bd-multibar').hidden = !A.multi;
  $('bd-multi-n').textContent = `已選 ${A.picked.size} ${A.who === 'stu' ? '人' : '組'}`;
  $('bd-multi-go').disabled = !A.picked.size;

  const empty = A.who === 'stu' ? !A.students.length : !A.groups.length;
  $('bd-empty').hidden = !empty;
  if (empty) {
    $('bd-empty').replaceChildren(el('p', {}, A.who === 'stu' ? '這個班還沒有名單。' : '這個班還沒有分組。'),
      el('button', { class: 'btn primary', type: 'button', onclick: () => showTab('roster') }, '到「👥 名單與分組」設定'));
    grid.replaceChildren();
    return;
  }

  if (A.who === 'stu') {
    grid.className = 'rc-grid';
    grid.replaceChildren(...A.students.slice().sort(sortSeat).map((s) => {
      const g = byId(A.groups, s.group_id);
      const pts = stuPoints(s.id, term);
      return el('button', {
        class: 'rc-card' + (A.picked.has(s.id) ? ' picked' : ''), type: 'button', 'data-id': s.id,
        style: g ? `--gc:${groupColor(g)}` : null,
        onclick: () => tapCard('stu', s.id),
      },
      el('span', { class: 'rc-pts' + (pts < 0 ? ' neg' : '') }, String(pts)),
      htmlEl('span', { class: 'rc-av' }, avatarImg(avatarOf(s), 120)),
      el('span', { class: 'rc-name' }, el('b', {}, String(s.seat)), ' ', s.name || ''));
    }));
  } else {
    grid.className = 'rc-grid groups';
    grid.replaceChildren(...A.groups.map((g) => {
      const mem = A.students.filter((s) => s.group_id === g.id).sort(sortSeat);
      const pts = grpPoints(g.id, term);
      return el('button', {
        class: 'rc-card grp' + (A.picked.has(g.id) ? ' picked' : ''), type: 'button', 'data-id': g.id,
        style: `--gc:${groupColor(g)}`, onclick: () => tapCard('grp', g.id),
      },
      el('span', { class: 'rc-pts' + (pts < 0 ? ' neg' : '') }, String(pts)),
      el('span', { class: 'rc-grp-name' }, g.name),
      htmlEl('span', { class: 'rc-grp-avs' }, mem.map((s) => avatarImg(avatarOf(s), 56)).join('') || '<span class="muted">（還沒有組員）</span>'),
      el('span', { class: 'rc-grp-mem' }, mem.map((s) => s.seat).join('、')));
    }));
  }
}
function htmlEl(tag, attrs, html) { const n = el(tag, attrs); n.innerHTML = html; return n; }

function tapCard(kind, id) {
  sfx.pop();
  if (A.multi) {
    if (A.picked.has(id)) A.picked.delete(id); else A.picked.add(id);
    renderBoard();
    return;
  }
  openBehaviors({ kind, ids: [id] });
}

/* ---------- 加扣分視窗 ---------- */
function openBehaviors(target) {
  A.target = target;
  const { kind, ids } = target;
  let head;
  if (ids.length === 1) {
    const x = kind === 'stu' ? byId(A.students, ids[0]) : byId(A.groups, ids[0]);
    head = kind === 'stu'
      ? htmlEl('div', { class: 'rc-target-one' }, `${avatarImg(avatarOf(x), 84)}<span><b>${x.seat}</b> ${escapeHtml(x.name || '')}</span>`)
      : el('div', { class: 'rc-target-one grp', style: `--gc:${groupColor(x)}` }, el('span', {}, '👥 ', x.name));
  } else {
    head = el('div', { class: 'rc-target-one' }, el('span', {}, target.all
      ? (kind === 'stu' ? `🌈 全班 ${ids.length} 人` : `🌈 全部 ${ids.length} 組`)
      : `☑️ 已選 ${ids.length} ${kind === 'stu' ? '人' : '組'}`));
  }
  $('bh-target').replaceChildren(head);
  const active = A.behaviors.filter((b) => b.active);
  const btn = (b) => el('button', { class: 'rc-bh' + (b.points < 0 ? ' minus' : ''), type: 'button', onclick: () => give(b) },
    el('span', { class: 'rc-bh-emoji' }, b.emoji || '⭐'),
    el('span', { class: 'rc-bh-label' }, b.label),
    el('span', { class: 'rc-bh-pts' }, (b.points > 0 ? '+' : '') + b.points));
  $('bh-plus').replaceChildren(...active.filter((b) => b.points > 0).map(btn));
  $('bh-minus').replaceChildren(...active.filter((b) => b.points < 0).map(btn));
  if (!active.length) $('bh-plus').replaceChildren(el('p', { class: 'hint' }, '還沒有加扣分項目，請到「⚙️ 設定」新增。'));
  $('bh-custom').hidden = false;
  $('bh-dialog').showModal();
}
$('bh-close').addEventListener('click', () => $('bh-dialog').close());
$('bh-custom').addEventListener('click', giveCustom);
$('bh-dialog').addEventListener('click', (e) => { if (e.target === $('bh-dialog')) $('bh-dialog').close(); });

/* ✏️ 自訂：臨時給幾分、寫個原因（不用先新增項目） */
async function giveCustom() {
  $('bh-dialog').close();
  const pts = await ask('要加（或扣）幾分？扣分請打負數，例如 -2', {
    value: '1', ok: '下一步',
    check: (v) => (/^[+-]?\d+$/.test(v) && +v !== 0 && Math.abs(+v) <= 10 ? '' : '請輸入 −10～+10 的數字（不能是 0）'),
  });
  if (pts === null) return;
  const why = await ask('原因（會記在加扣分紀錄裡）：', { placeholder: '例如：朗讀比賽', ok: '給分' });
  if (why === null) return;
  give({ emoji: '✏️', label: why.slice(0, 16), points: Number(pts) });
}

async function give(b) {
  const { kind, ids } = A.target;
  $('bh-dialog').close();
  const batch = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const rows = ids.map((id) => ({
    course_id: A.course.id, label: `${b.emoji || ''} ${b.label}`.trim(), points: b.points, batch,
    student_id: kind === 'stu' ? id : null, group_id: kind === 'grp' ? id : null,
  }));
  const { data, error } = await db.from('rc_events').insert(rows).select('*');
  if (error) return fail('加分', error);
  A.events.push(...data);
  if (A.multi) { A.multi = false; A.picked.clear(); }
  renderBoard();
  renderExBadge();
  (b.points > 0 ? sfx.plus : sfx.minus)();
  ids.forEach((id) => floatPoints(id, b.points));
  const who = ids.length === 1
    ? (kind === 'stu' ? stuLabel(byId(A.students, ids[0])) : byId(A.groups, ids[0]).name)
    : `${ids.length} ${kind === 'stu' ? '人' : '組'}`;
  toast(`${who} ${b.points > 0 ? '+' : ''}${b.points}（${b.label}）`, {
    seconds: 6, action: { label: '復原', run: () => undoBatch(batch) },
  });
}

/* 卡片上飄出 +1 / −1 */
function floatPoints(id, pts) {
  const card = document.querySelector(`#bd-grid [data-id="${id}"]`);
  if (!card) return;
  const f = el('span', { class: 'rc-float' + (pts < 0 ? ' neg' : '') }, (pts > 0 ? '+' : '') + pts);
  card.append(f);
  card.classList.remove('bump'); void card.offsetWidth; card.classList.add(pts > 0 ? 'bump' : 'shake');
  setTimeout(() => f.remove(), 1300);
}

async function undoBatch(batch) {
  const now = new Date().toISOString();
  const { error } = await db.from('rc_events').update({ undone_at: now }).eq('batch', batch).is('undone_at', null);
  if (error) return fail('復原', error);
  A.events.forEach((e) => { if (e.batch === batch && !e.undone_at) e.undone_at = now; });
  renderAll();
  toast('已復原');
}
async function undoEvent(e) {
  if (e.batch) return undoBatchConfirm(e);
  const now = new Date().toISOString();
  const { error } = await db.from('rc_events').update({ undone_at: now }).eq('id', e.id);
  if (error) return fail('撤銷', error);
  e.undone_at = now;
  renderAll();
}
async function undoBatchConfirm(e) {
  const n = A.events.filter((x) => x.batch === e.batch && live(x)).length;
  if (n > 1 && !(await sure(`這筆是同一次加給 ${n} 個人／組的，要一起撤銷嗎？`, { ok: '一起撤銷' }))) return;
  undoBatch(e.batch);
}

/* ---------- 全螢幕（投影用） ---------- */
function setFull(on) {
  document.body.classList.toggle('rc-fullboard', on);
  $('bd-exit-full').hidden = !on;
  if (on && A.tab !== 'board') showTab('board');
}
$('rc-full').addEventListener('click', async () => {
  try { await document.documentElement.requestFullscreen(); } catch { /* 有些瀏覽器不支援，一樣切成白板模式 */ }
  setFull(true);
});
$('bd-exit-full').addEventListener('click', async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); } catch { /* ignore */ }
  setFull(false);
});
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) setFull(false); });

/* ============================================================
   👥 名單
   ============================================================ */
/* 一行一個人：「座號 姓名」或「姓名 座號」都可以（Tab、空白、逗號分隔）；標題列會自動跳過 */
function parseRoster(text) {
  const out = new Map();
  for (const raw of String(text).split(/\r?\n/)) {
    const cells = raw.split(/[\t,，]+|\s{2,}/).map((c) => c.trim()).filter(Boolean);
    if (cells.length === 1) cells.splice(0, 1, ...cells[0].split(/\s+/));   // 「1 王小明」只用一個空白隔開
    const i = cells.findIndex((c) => /^\d{1,2}\s*號?$/.test(c));
    if (i < 0) continue;
    const seat = parseInt(cells[i], 10);
    const name = cells.filter((_, k) => k !== i).find((c) => !/^\d+$/.test(c)) || '';
    if (seat < 1 || seat > 40) continue;
    out.set(seat, Array.from(name.replace(/\s+/g, ' ')).slice(0, 12).join(''));
  }
  return [...out.entries()].sort((a, b) => a[0] - b[0]).map(([seat, name]) => ({ seat, name }));
}
$('ro-paste').addEventListener('input', () => {
  const rows = parseRoster($('ro-paste').value);
  $('ro-import').disabled = !rows.length;
  $('ro-preview').textContent = rows.length
    ? `看得懂 ${rows.length} 個人：` + rows.slice(0, 6).map((r) => `${r.seat} ${r.name}`).join('、') + (rows.length > 6 ? '…' : '')
    : ($('ro-paste').value.trim() ? '⚠️ 看不懂這個格式：每一行要有座號和姓名' : '');
});
$('ro-clear').addEventListener('click', () => { $('ro-paste').value = ''; $('ro-paste').dispatchEvent(new Event('input')); });
$('ro-import').addEventListener('click', async () => {
  const rows = parseRoster($('ro-paste').value);
  if (!rows.length) return;
  const { error } = await db.from('rc_students')
    .upsert(rows.map((r) => ({ course_id: A.course.id, seat: r.seat, name: r.name })), { onConflict: 'course_id,seat' });
  if (error) return fail('匯入名單', error);
  // 班級人數跟著名單（科任老師才能改）
  const max = Math.max(...rows.map((r) => r.seat), ...A.students.map((s) => s.seat));
  if (A.isOwner && max !== A.course.seat_count) {
    const { error: e2 } = await db.from('rc_courses').update({ seat_count: max }).eq('id', A.course.id);
    if (!e2) { A.course.seat_count = max; await selectCourse(A.course); }
  }
  $('ro-paste').value = ''; $('ro-paste').dispatchEvent(new Event('input'));
  toast(`已匯入 ${rows.length} 個人`);
  await loadCourse();
});

function renderRoster() {
  const list = $('ro-list');
  if (!A.students.length) { list.replaceChildren(el('p', { class: 'empty small' }, '還沒有名單，先從上面貼上。')); return; }
  list.replaceChildren(...A.students.slice().sort(sortSeat).map((s) => {
    const name = el('input', { type: 'text', value: s.name, maxlength: '12', 'aria-label': `${s.seat} 號姓名` });
    name.addEventListener('change', () => saveStudent(s, { name: name.value.trim() }));
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') name.blur(); });
    const grp = el('select', { 'aria-label': `${s.seat} 號組別` },
      el('option', { value: '' }, '（沒有分組）'),
      ...A.groups.map((g) => el('option', { value: g.id, selected: g.id === s.group_id }, g.name)));
    grp.addEventListener('change', () => saveStudent(s, { group_id: grp.value ? Number(grp.value) : null }));
    return el('div', { class: 'rc-ro-row' },
      el('b', { class: 'rc-ro-seat' }, String(s.seat)),
      htmlEl('button', { class: 'rc-ro-av', type: 'button', title: '換小角色', onclick: () => openAvatars(s) }, avatarImg(avatarOf(s), 48)),
      name, grp,
      el('button', { class: 'btn small ghost', type: 'button', onclick: () => removeStudent(s) }, '刪除'));
  }));
}
async function saveStudent(s, patch) {
  const { error } = await db.from('rc_students').update(patch).eq('id', s.id);
  if (error) { fail('儲存', error); return renderRoster(); }
  Object.assign(s, patch);
  if ('group_id' in patch) renderGroups();
  if ('avatar' in patch) renderRoster();
}
async function removeStudent(s) {
  if (!(await sure(`確定要把 ${stuLabel(s)} 從名單刪掉嗎？\n他的加扣分紀錄也會一起刪掉。`, { ok: '刪除', danger: true }))) return;
  const { error } = await db.from('rc_students').delete().eq('id', s.id);
  if (error) return fail('刪除', error);
  await loadCourse();
}

/* ---------- 換小角色 ---------- */
let avFor = null;
function openAvatars(s) {
  avFor = s;
  $('av-title').textContent = `幫 ${stuLabel(s)} 選一隻小角色`;
  const cur = avatarOf(s);
  $('av-grid').replaceChildren(...Array.from({ length: AVATAR_COUNT }, (_, i) =>
    htmlEl('button', { class: 'rc-av-pick' + (i === cur ? ' on' : ''), type: 'button', title: avatarName(i), onclick: () => pickAvatar(i) }, avatarImg(i, 64))));
  $('av-dialog').showModal();
}
async function pickAvatar(i) {
  $('av-dialog').close();
  if (avFor) await saveStudent(avFor, { avatar: i });
  sfx.pop();
}
$('av-close').addEventListener('click', () => $('av-dialog').close());
$('av-dialog').addEventListener('click', (e) => { if (e.target === $('av-dialog')) $('av-dialog').close(); });

/* ============================================================
   👥 分組（拖曳）
   ============================================================ */
let chosenChip = null;   // 點選模式：先點孩子再點組別

function renderGroups() {
  const box = $('gr-board');
  const col = (g) => {
    const mem = A.students.filter((s) => (g ? s.group_id === g.id : !s.group_id || !byId(A.groups, s.group_id))).sort(sortSeat);
    const head = g
      ? el('div', { class: 'rc-col-head' },
        el('button', { class: 'rc-col-name', type: 'button', title: '改組名', onclick: () => renameGroup(g) }, g.name),
        el('span', { class: 'muted' }, `${mem.length} 人`),
        el('button', { class: 'rc-col-del', type: 'button', title: '刪除這一組', onclick: () => removeGroup(g) }, '✕'))
      : el('div', { class: 'rc-col-head' }, el('span', { class: 'rc-col-name plain' }, '還沒分組'), el('span', { class: 'muted' }, `${mem.length} 人`));
    const column = el('div', { class: 'rc-col' + (g ? '' : ' none'), 'data-drop': g ? g.id : '', style: g ? `--gc:${groupColor(g)}` : null }, head,
      el('div', { class: 'rc-chips' }, ...mem.map((s) => htmlEl('div', {
        class: 'rc-chip' + (chosenChip === s.id ? ' chosen' : ''), 'data-stu': s.id, tabindex: '0',
      }, `${avatarImg(avatarOf(s), 34)}<span><b>${s.seat}</b> ${escapeHtml(s.name || '')}</span>`))));
    head.addEventListener('click', (e) => {
      if (chosenChip == null || e.target.closest('button')) return;
      moveTo(chosenChip, g ? g.id : null);
    });
    return column;
  };
  box.replaceChildren(col(null), ...A.groups.map(col));
}

async function moveTo(stuId, groupId) {
  chosenChip = null;
  const s = byId(A.students, stuId);
  if (!s) return;
  if ((s.group_id || null) === groupId) return renderGroups();
  await saveStudent(s, { group_id: groupId });
  renderRoster();
  sfx.pop();
}

/* 拖曳：滑鼠和手指都可以（Pointer Events） */
(function setupDrag() {
  const box = $('gr-board');
  let drag = null;
  box.addEventListener('pointerdown', (e) => {
    const chip = e.target.closest('.rc-chip');
    if (!chip) return;
    drag = { chip, id: Number(chip.dataset.stu), x: e.clientX, y: e.clientY, ghost: null, pid: e.pointerId };
  });
  window.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pid) return;
    if (!drag.ghost) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 8) return;
      drag.ghost = drag.chip.cloneNode(true);
      drag.ghost.classList.add('rc-ghost');
      document.body.append(drag.ghost);
      drag.chip.classList.add('dragging');
      document.body.classList.add('rc-dragging');
    }
    e.preventDefault();
    drag.ghost.style.left = `${e.clientX}px`;
    drag.ghost.style.top = `${e.clientY}px`;
    document.querySelectorAll('.rc-col.over').forEach((c) => c.classList.remove('over'));
    const under = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-drop]');
    if (under) under.classList.add('over');
  }, { passive: false });
  const end = (e) => {
    if (!drag || e.pointerId !== drag.pid) return;
    const d = drag; drag = null;
    document.body.classList.remove('rc-dragging');
    document.querySelectorAll('.rc-col.over').forEach((c) => c.classList.remove('over'));
    if (!d.ghost) {                         // 只是點一下：選取這個孩子
      chosenChip = chosenChip === d.id ? null : d.id;
      renderGroups();
      return;
    }
    d.ghost.remove(); d.chip.classList.remove('dragging');
    const under = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-drop]');
    if (under) moveTo(d.id, under.dataset.drop ? Number(under.dataset.drop) : null);
  };
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', (e) => {
    if (!drag || e.pointerId !== drag.pid) return;
    drag.ghost?.remove(); drag.chip.classList.remove('dragging'); drag = null;
    document.body.classList.remove('rc-dragging');
  });
})();

$('gr-add').addEventListener('click', async () => {
  const n = A.groups.length + 1;
  const name = await ask('新的組名：', { value: `第${'一二三四五六七八九十'[n - 1] || n}組`, ok: '新增' });
  if (!name) return;
  const { error } = await db.from('rc_groups').insert({ course_id: A.course.id, name: name.trim().slice(0, 12), color: (n - 1) % 12, sort: n });
  if (error) return fail('新增組別', error);
  await loadCourse();
});
$('gr-auto').addEventListener('click', async () => {
  if (!A.students.length) return toast('先匯入名單喔');
  const ans = await ask('要分成幾組？（會依座號平均分）', {
    value: String(A.groups.length || 6), ok: '分組',
    check: (v) => (/^\d+$/.test(v) && +v >= 1 && +v <= 12 ? '' : '請輸入 1～12 的數字'),
  });
  if (ans === null) return;
  const n = Number(ans);
  if (A.students.some((s) => s.group_id) && !(await sure('已經分好的組會重新分配，確定嗎？', { ok: '重新分組' }))) return;
  // 組數不夠就補，多的保留（空的組可以自己刪）
  for (let i = A.groups.length; i < n; i++) {
    const { error } = await db.from('rc_groups').insert({ course_id: A.course.id, name: `第${'一二三四五六七八九十'[i] || i + 1}組`, color: i % 12, sort: i + 1 });
    if (error) return fail('新增組別', error);
  }
  const { data: grps } = await db.from('rc_groups').select('*').eq('course_id', A.course.id).order('sort').order('id');
  const use = grps.slice(0, n);
  const list = A.students.slice().sort(sortSeat);
  const per = Math.ceil(list.length / n);
  for (let i = 0; i < list.length; i++) {
    const g = use[Math.min(n - 1, Math.floor(i / per))];
    if (list[i].group_id !== g.id) {
      const { error } = await db.from('rc_students').update({ group_id: g.id }).eq('id', list[i].id);
      if (error) return fail('分組', error);
    }
  }
  toast(`已依座號分成 ${n} 組，可以再拖曳微調`);
  await loadCourse();
});
async function renameGroup(g) {
  const name = await ask('組名：', { value: g.name, ok: '儲存' });
  if (!name || name === g.name) return;
  const { error } = await db.from('rc_groups').update({ name: name.trim().slice(0, 12) }).eq('id', g.id);
  if (error) return fail('改組名', error);
  g.name = name.trim().slice(0, 12);
  renderGroups(); renderRoster();
}
async function removeGroup(g) {
  const n = A.students.filter((s) => s.group_id === g.id).length;
  if (!(await sure(`確定要刪除「${g.name}」嗎？\n${n ? `組裡的 ${n} 個人會變成「還沒分組」，` : ''}這一組的小組分紀錄也會一起刪掉。`, { ok: '刪除', danger: true }))) return;
  const { error } = await db.from('rc_groups').delete().eq('id', g.id);
  if (error) return fail('刪除組別', error);
  await loadCourse();
}

/* ============================================================
   🎟 兌換集點（11 班）
   ============================================================ */
function renderExBadge() {
  const rate = A.course?.point_rate || 5;
  const n = A.course?.stamps ? A.students.filter((s) => balance(s.id) >= rate).length : 0;
  $('ex-badge').hidden = !n;
  $('ex-badge').textContent = n;
}
function renderExchange() {
  const rate = A.course.point_rate;
  $('ex-rule').textContent = `個人分每 ${rate} 分可以換 1 個集點（小組分不能換）。`;
  const rows = A.students.slice().sort(sortSeat).map((s) => ({ s, bal: balance(s.id) }));
  const ready = rows.filter((r) => r.bal >= rate);
  const wait = rows.filter((r) => r.bal < rate);
  const card = ({ s, bal }) => {
    const can = Math.floor(bal / rate);
    return el('div', { class: 'card rc-ex' + (can ? ' ready' : '') },
      htmlEl('span', { class: 'rc-ex-av' }, avatarImg(avatarOf(s), 56)),
      el('span', { class: 'rc-ex-name' }, el('b', {}, String(s.seat)), ' ', s.name || ''),
      el('span', { class: 'rc-ex-bal' }, `${bal} 分`),
      can
        ? el('button', { class: 'btn primary', type: 'button', onclick: () => doExchange(s, can) }, `✅ 蓋好了，換 ${can} 點`)
        : el('span', { class: 'muted rc-ex-need' }, `再 ${rate - Math.max(0, bal) % rate || rate} 分`));
  };
  $('ex-list').replaceChildren(
    ready.length ? el('p', { class: 'form-title' }, `🎉 可以蓋章的（${ready.length} 人）`) : el('p', { class: 'muted' }, '目前還沒有人可以換集點。'),
    ...ready.map(card),
    wait.length ? el('p', { class: 'form-title rc-ex-sub' }, '還差一點的') : '',
    ...wait.map(card));
  const hist = A.exchanges.slice().reverse().slice(0, 100);
  $('ex-history').replaceChildren(...(hist.length ? hist.map((x) => {
    const s = byId(A.students, x.student_id);
    return el('div', { class: 'rc-log' + (x.undone_at ? ' undone' : '') },
      el('span', { class: 'muted' }, fmtTime(x.created_at)),
      el('span', {}, `${s ? stuLabel(s) : '（已刪除）'}：蓋 ${x.stamps} 點（用掉 ${x.points} 分）・${x.actor}`),
      x.undone_at ? el('span', { class: 'muted' }, '已撤銷')
        : el('button', { class: 'btn small ghost', type: 'button', onclick: () => undoExchange(x) }, '撤銷'));
  }) : [el('p', { class: 'muted' }, '還沒有兌換紀錄')]));
}
async function doExchange(s, max) {
  let n = max;
  if (max > 1) {
    const ans = await ask(`集點卡蓋好了嗎？\n${stuLabel(s)} 可以換 ${max} 點，這次換幾點？`, {
      value: String(max), ok: '換集點',
      check: (v) => (/^\d+$/.test(v) && +v >= 1 && +v <= max ? '' : `請輸入 1～${max}`),
    });
    if (ans === null) return;
    n = Number(ans);
  } else if (!(await sure(`集點卡蓋好了嗎？\n${stuLabel(s)}：換 1 點（用掉 ${A.course.point_rate} 分）`, { ok: '蓋好了' }))) return;
  const { error } = await db.rpc('rc_exchange', { p_student: s.id, p_stamps: n });
  if (error) return fail('兌換', error);
  sfx.plus();
  toast(`${stuLabel(s)} 換了 ${n} 點 🎟`);
  await loadCourse();
}
async function undoExchange(x) {
  if (!(await sure('確定要撤銷這筆兌換嗎？\n分數會加回去（記得把集點卡上的章劃掉）。', { ok: '撤銷' }))) return;
  const { error } = await db.rpc('rc_undo_exchange', { p_id: x.id });
  if (error) return fail('撤銷', error);
  await loadCourse();
}

/* ============================================================
   📊 學期統計
   ============================================================ */
$('st-range').addEventListener('change', renderStats);

function statRows(range) {
  return A.students.slice().sort(sortSeat).map((s) => {
    let plus = 0, minus = 0, game = 0;
    for (const e of A.events) {
      if (e.student_id !== s.id || !live(e) || !inRange(e.created_at, range)) continue;
      if (e.source === 'game') game += e.points;
      else if (e.points > 0) plus += e.points;
      else minus += e.points;
    }
    const stamps = A.exchanges.filter((x) => x.student_id === s.id && live(x) && inRange(x.created_at, range)).reduce((a, x) => a + x.stamps, 0);
    const g = byId(A.groups, s.group_id);
    return { s, group: g?.name || '', plus, minus, game, total: plus + minus + game, stamps };
  });
}
function renderStats() {
  const range = currentRange();
  const v = $('st-range').value;
  $('st-range-text').textContent = v === 'all' ? '' : `${fmtDate(range.start)} ～ ${fmtDate(new Date(range.end - 864e5))}`;
  const rows = statRows(range);
  const home = A.course.stamps;
  const th = (...xs) => el('tr', {}, ...xs.map((x, i) => el('th', { class: i >= (xs[0] === '組別' ? 1 : 3) ? 'num' : null }, x)));
  const tbl = el('table', { class: 'rc-table' },
    el('thead', {}, th('座號', '姓名', '組別', '加分', '扣分', '🎡 遊戲', '合計', ...(home ? ['🎟 已換集點'] : []))),
    el('tbody', {}, ...rows.map((r) => el('tr', {},
      el('td', {}, String(r.s.seat)), el('td', {}, r.s.name), el('td', {}, r.group),
      el('td', { class: 'num plus' }, r.plus ? `+${r.plus}` : '0'), el('td', { class: 'num minus' }, String(r.minus)),
      el('td', { class: 'num' }, String(r.game)), el('td', { class: 'num total' }, String(r.total)),
      ...(home ? [el('td', { class: 'num' }, String(r.stamps))] : [])))));
  $('st-students').replaceChildren(rows.length ? tbl : el('p', { class: 'muted' }, '還沒有名單'));

  const gRows = A.groups.map((g) => ({ g, pts: grpPoints(g.id, range), n: A.students.filter((s) => s.group_id === g.id).length }));
  $('st-groups').replaceChildren(gRows.length ? el('table', { class: 'rc-table' },
    el('thead', {}, th('組別', '人數', '小組分')),
    el('tbody', {}, ...gRows.map((r) => el('tr', {},
      el('td', {}, el('span', { class: 'rc-dot', style: `background:${groupColor(r.g)}` }), r.g.name),
      el('td', { class: 'num' }, String(r.n)), el('td', { class: 'num total' }, String(r.pts))))))
    : el('p', { class: 'muted' }, '還沒有分組'));

  // 加扣分紀錄（最新的 150 筆）
  const log = A.events.filter((e) => inRange(e.created_at, range)).slice().reverse().slice(0, 150);
  $('st-log').replaceChildren(...(log.length ? log.map((e) => {
    const who = e.student_id ? (byId(A.students, e.student_id) ? stuLabel(byId(A.students, e.student_id)) : '（已刪除）')
      : `👥 ${byId(A.groups, e.group_id)?.name || '（已刪除的組）'}`;
    return el('div', { class: 'rc-log' + (e.undone_at ? ' undone' : '') },
      el('span', { class: 'muted' }, fmtTime(e.created_at)),
      el('span', {}, `${who}：${e.label} `, el('b', { class: e.points < 0 ? 'minus' : 'plus' }, (e.points > 0 ? '+' : '') + e.points)),
      e.undone_at ? el('span', { class: 'muted' }, '已撤銷')
        : A.isOwner ? el('button', { class: 'btn small ghost', type: 'button', onclick: () => undoEvent(e) }, '撤銷') : '');
  }) : [el('p', { class: 'muted' }, '這段期間還沒有紀錄')]));

  loadGames(range);
}

const MODE_NAME = { tug: '🪢 拔河', marble: '🔮 玻璃球', quiz: '🎯 搶答', candy: '🍬 糖果球' };
async function loadGames(range) {
  const { data, error } = await db.from('game_results').select('id, played_at, mode, source, player_count, awarded_at')
    .eq('course_id', A.course.id).gte('played_at', range.start.toISOString()).lt('played_at', range.end.toISOString())
    .order('played_at', { ascending: false }).limit(100);
  if (error) { $('st-games').replaceChildren(el('p', { class: 'muted' }, '讀不到場次')); return; }
  $('st-games').replaceChildren(...(data.length ? data.map((g) => el('div', { class: 'rc-log' },
    el('span', { class: 'muted' }, fmtTime(g.played_at)),
    el('span', {}, `${MODE_NAME[g.mode] || g.mode}・${g.source}・${g.player_count} 人`),
    g.awarded_at ? el('span', { class: 'muted' }, '⭐ 已記分')
      : A.isOwner ? el('button', { class: 'btn small primary', type: 'button', onclick: () => awardGame(g) }, '⭐ 記到課堂分數') : el('span', { class: 'muted' }, '未記分')))
    : [el('p', { class: 'muted' }, '這段期間還沒有玩過熊熊遊樂園')]));
}
async function awardGame(g) {
  const { data, error } = await db.rpc('rc_award_game', { p_game: g.id });
  if (error) return fail('記分', error);
  toast(`已幫 ${data} 位同學記分 ⭐`);
  await loadCourse();
}

$('st-export').addEventListener('click', () => {
  const range = currentRange();
  const rows = statRows(range);
  const home = A.course.stamps;
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [
    [`${A.course.name} ${A.course.owner === A.uid ? (A.me?.subject || '熊熊遊樂園') : (A.labels[A.course.id] || '熊熊遊樂園')} 課堂分數`, `${fmtDate(range.start)}～${fmtDate(new Date(range.end - 864e5))}`].map(q).join(','),
    ['座號', '姓名', '組別', '加分', '扣分', '遊戲', '合計', ...(home ? ['已換集點'] : []), '小組分'].map(q).join(','),
    ...rows.map((r) => [r.s.seat, r.s.name, r.group, r.plus, r.minus, r.game, r.total, ...(home ? [r.stamps] : []),
      r.s.group_id ? grpPoints(r.s.group_id, range) : ''].map(q).join(',')),
  ];
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = el('a', { href: URL.createObjectURL(blob), download: `${A.course.name}_課堂分數_${fmtDate(new Date()).replace(/\//g, '-')}.csv` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
});

/* ============================================================
   ⚙️ 設定
   ============================================================ */
function renderSettings() {
  if (!A.isOwner) return;
  renderThemes();
  renderBehaviorList();
  A.rules = gameRules();
  renderGameRules();
  const home = A.courses.find((c) => c.stamps && c.owner === A.uid);
  $('rate-field').hidden = !home;
  if (home) $('rule-rate').value = home.point_rate;
  $('me-name').value = A.me.name;
  $('me-subject').value = A.me.subject;
  $('cls-list').replaceChildren(...A.courses.filter((c) => c.owner === A.uid).map((c) => el('div', { class: 'rc-cls-row' },
    el('b', {}, c.name), el('span', { class: 'muted' }, `${c.seat_count} 人${c.stamps ? '・可換扭蛋集點' : ''}`),
    el('button', { class: 'btn small ghost', type: 'button', onclick: () => renameCourse(c) }, '改名'),
    c.is_home ? '' : el('button', { class: 'btn small ghost', type: 'button', onclick: () => removeCourse(c) }, '刪除'))));
}
async function renameCourse(c) {
  const name = await ask('班級名稱：', { value: c.name, ok: '儲存' });
  if (!name || name === c.name) return;
  const { error } = await db.from('rc_courses').update({ name: name.slice(0, 12) }).eq('id', c.id);
  if (error) return fail('改名', error);
  c.name = name.slice(0, 12);
  renderClassPills(); renderSettings();
  toast(`已改名為「${c.name}」`);
}

function renderBehaviorList() {
  const list = $('bh-list');
  list.replaceChildren(...A.behaviors.map((b) => {
    const emoji = el('input', { type: 'text', value: b.emoji, maxlength: '4', class: 'rc-bh-emoji-in', 'aria-label': '圖示' });
    const label = el('input', { type: 'text', value: b.label, maxlength: '16', 'aria-label': '項目名稱' });
    const pts = el('input', { type: 'number', min: '-10', max: '10', step: '1', value: b.points, class: 'rc-bh-pts-in', 'aria-label': '分數（−10～+10）' });
    const save = (patch) => saveBehavior(b, patch);
    emoji.addEventListener('change', () => save({ emoji: emoji.value.trim() || '⭐' }));
    label.addEventListener('change', () => { if (label.value.trim()) save({ label: label.value.trim() }); });
    pts.addEventListener('change', () => {
      const n = Math.round(Number(pts.value));
      if (!n || n < -10 || n > 10) { pts.value = b.points; return toast('分數請填 −10～+10（不能是 0）', { tone: 'error' }); }
      save({ points: n });
    });
    return el('div', { class: 'rc-bh-row' + (b.points < 0 ? ' minus' : ''), 'data-bh': b.id },
      el('span', { class: 'rc-handle', title: '拖曳調整順序' }, '⠿'), emoji, label, pts,
      el('button', { class: 'btn small ghost', type: 'button', onclick: () => removeBehavior(b) }, '刪除'));
  }));
}
async function saveBehavior(b, patch) {
  const { error } = await db.from('rc_behaviors').update(patch).eq('id', b.id);
  if (error) return fail('儲存', error);
  Object.assign(b, patch);
  renderBehaviorList();
  toast('已儲存');
}
async function removeBehavior(b) {
  if (!(await sure(`確定要刪除「${b.label}」嗎？\n（以前的加扣分紀錄不會不見）`, { ok: '刪除', danger: true }))) return;
  const { error } = await db.from('rc_behaviors').delete().eq('id', b.id);
  if (error) return fail('刪除', error);
  A.behaviors = A.behaviors.filter((x) => x !== b);
  renderBehaviorList();
}
$('bh-add').addEventListener('click', async () => {
  const { data, error } = await db.from('rc_behaviors')
    .insert({ label: '新項目', emoji: '⭐', points: 1, sort: (A.behaviors.at(-1)?.sort || 0) + 1 }).select('*').single();
  if (error) return fail('新增', error);
  A.behaviors.push(data);
  renderBehaviorList();
  $('bh-list').lastElementChild?.querySelector('input:nth-of-type(2)')?.select();
});

/* 拖曳 ⠿ 調整加扣分項目的順序 */
(function setupBehaviorSort() {
  const list = $('bh-list');
  let drag = null;
  list.addEventListener('pointerdown', (e) => {
    const h = e.target.closest('.rc-handle');
    if (!h) return;
    e.preventDefault();
    drag = { row: h.closest('.rc-bh-row'), pid: e.pointerId };
    drag.row.classList.add('dragging');
  });
  window.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pid) return;
    const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('.rc-bh-row');
    if (!over || over === drag.row) return;
    const r = over.getBoundingClientRect();
    over.parentNode.insertBefore(drag.row, e.clientY < r.top + r.height / 2 ? over : over.nextSibling);
  });
  window.addEventListener('pointerup', async (e) => {
    if (!drag || e.pointerId !== drag.pid) return;
    drag.row.classList.remove('dragging'); drag = null;
    const ids = [...list.querySelectorAll('[data-bh]')].map((r) => Number(r.dataset.bh));
    await Promise.all(ids.map((id, i) => db.from('rc_behaviors').update({ sort: i + 1 }).eq('id', id)));
    ids.forEach((id, i) => { const b = byId(A.behaviors, id); if (b) b.sort = i + 1; });
    A.behaviors.sort((a, b) => a.sort - b.sort);
  });
})();

/* ---------- 🎡 熊熊遊樂園換分規則（一條一條，可以自由新增、刪除） ---------- */
const RULE_TYPES = [
  { t: 'join', label: '有答題的同學', n: false },
  { t: 'correct', label: '每答對 1 題', n: false },
  { t: 'rank', label: '第 n 名', n: true, pre: '第', post: '名' },
  { t: 'top', label: '前 n 名', n: true, pre: '前', post: '名' },
  { t: 'win', label: '獲勝隊伍的同學（拔河、玻璃球）', n: false },
  { t: 'perfect', label: '全部答對（沒有答錯）', n: false },
];
function gameRules() {
  if (Array.isArray(A.me?.game_rules)) return A.me.game_rules.map((r) => ({ ...r }));
  // 還沒執行 13 號 SQL：用以前的三條
  return [{ t: 'join', pts: A.me?.game_join ?? 1 }, { t: 'top', n: 3, pts: A.me?.game_top ?? 1 }, { t: 'win', pts: A.me?.game_win ?? 1 }];
}
function ruleText(r) {
  const T = RULE_TYPES.find((x) => x.t === r.t);
  const who = !T ? '?' : T.n ? `${T.pre} ${r.n || 1} ${T.post}` : T.label;
  return `${who} ${r.pts > 0 ? '+' : ''}${r.pts} 分${r.t === 'correct' ? '（× 答對題數）' : ''}`;
}
function renderGameRules() {
  const box = $('game-rules');
  box.replaceChildren(...A.rules.map((r, i) => {
    const type = el('select', { 'aria-label': '條件' }, ...RULE_TYPES.map((T) => el('option', { value: T.t, selected: T.t === r.t }, T.n ? `${T.pre} n ${T.post}` : T.label)));
    const n = el('input', { type: 'number', min: '1', max: '40', step: '1', value: r.n || 1, class: 'rc-rule-n', 'aria-label': '名次' });
    const pts = el('input', { type: 'number', min: '-10', max: '10', step: '1', value: r.pts, class: 'rc-bh-pts-in', 'aria-label': '分數' });
    const T = RULE_TYPES.find((x) => x.t === r.t);
    n.hidden = !T?.n;
    type.addEventListener('change', () => { r.t = type.value; if (RULE_TYPES.find((x) => x.t === r.t)?.n && !r.n) r.n = r.t === 'rank' ? 1 : 3; renderGameRules(); });
    n.addEventListener('input', () => { r.n = Math.max(1, Math.min(40, Math.round(+n.value) || 1)); renderExample(); });
    pts.addEventListener('input', () => { r.pts = Math.max(-10, Math.min(10, Math.round(+pts.value) || 0)); renderExample(); });
    return el('div', { class: 'rc-rule-row' },
      el('span', { class: 'rc-rule-no' }, String(i + 1)), type, n,
      el('span', { class: 'rc-rule-plus' }, '→'), pts, el('span', { class: 'muted' }, r.t === 'correct' ? '分／題' : '分'),
      el('button', { class: 'btn small ghost', type: 'button', onclick: () => { A.rules.splice(i, 1); renderGameRules(); } }, '刪除'));
  }));
  if (!A.rules.length) box.replaceChildren(el('p', { class: 'muted' }, '目前沒有規則（玩完不會自動加分）。按「＋ 新增規則」新增。'));
  renderExample();
}
/* 例子：讓老師一看就知道會加幾分 */
function renderExample() {
  const sim = (who) => A.rules.reduce((sum, r) => {
    const p = Number(r.pts) || 0;
    if (r.t === 'join') return sum + p;
    if (r.t === 'correct') return sum + p * who.correct;
    if (r.t === 'rank') return sum + (who.rank === (r.n || 1) ? p : 0);
    if (r.t === 'top') return sum + (who.rank <= (r.n || 1) ? p : 0);
    if (r.t === 'win') return sum + (who.win ? p : 0);
    if (r.t === 'perfect') return sum + (who.wrong === 0 ? p : 0);
    return sum;
  }, 0);
  const a = sim({ correct: 10, wrong: 0, rank: 1, win: true });
  const b = sim({ correct: 5, wrong: 3, rank: 8, win: false });
  $('game-rules-eg').textContent = `例如：全對 10 題、第 1 名、獲勝隊伍 → ${a > 0 ? '+' : ''}${a} 分；答對 5 題、答錯 3 題、第 8 名 → ${b > 0 ? '+' : ''}${b} 分`;
}
$('gr-rule-add').addEventListener('click', () => {
  if (A.rules.length >= 20) return toast('最多 20 條規則', { tone: 'error' });
  A.rules.push({ t: 'top', n: 3, pts: 1 });
  renderGameRules();
});

$('rule-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const n = (id, lo, hi) => Math.min(hi, Math.max(lo, Math.round(Number($(id).value) || 0)));
  const rules = A.rules.filter((r) => r.pts).map((r) => (RULE_TYPES.find((x) => x.t === r.t)?.n ? { t: r.t, n: r.n || 1, pts: r.pts } : { t: r.t, pts: r.pts }));
  const patch = { game_rules: rules };
  const { error } = await db.from('rc_teachers').update(patch).eq('user_id', A.me.user_id);
  if (error) {
    if (/game_rules/.test(error.message || '')) return toast('還差一步：請班導在 Supabase 執行 13_熊熊遊樂園換分規則.sql', { tone: 'error', seconds: 8 });
    return fail('儲存', error);
  }
  Object.assign(A.me, patch);
  A.rules = gameRules();
  renderGameRules();
  const home = A.courses.find((c) => c.stamps && c.owner === A.uid);
  if (home) {
    const rate = n('rule-rate', 1, 100);
    const { error: e2 } = await db.from('rc_courses').update({ point_rate: rate }).eq('id', home.id);
    if (e2) return fail('儲存', e2);
    home.point_rate = rate;
    renderExBadge();
  }
  toast('規則已儲存');
});
$('me-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const patch = { name: $('me-name').value.trim() || '老師', subject: $('me-subject').value.trim() || '熊熊遊樂園' };
  const { error } = await db.from('rc_teachers').update(patch).eq('user_id', A.me.user_id);
  if (error) return fail('儲存', error);
  Object.assign(A.me, patch);
  $('rc-who').textContent = A.me.subject;
  toast('已儲存');
});
$('cls-add').addEventListener('click', async () => {
  const name = await ask('新班級的名稱（例如：510）：', { ok: '新增' });
  if (!name) return;
  const { data, error } = await db.from('rc_courses')
    .insert({ owner: A.me.user_id, name: name.trim().slice(0, 12), sort: A.courses.length }).select('*').single();
  if (error) return fail('新增班級', error);
  A.courses.push(data);
  renderClassPills(); renderSettings();
  toast(`已新增「${data.name}」，記得到「👥 名單與分組」貼上名單`);
});
async function removeCourse(c) {
  const typed = await ask(`確定要刪除「${c.name}」嗎？\n名單、分組和所有加扣分紀錄都會一起刪掉，救不回來。\n請輸入班級名稱「${c.name}」確認：`, {
    ok: '刪除', danger: true, check: (v) => (v === c.name ? '' : `請輸入「${c.name}」`),
  });
  if (typed !== c.name) return;
  const { error } = await db.from('rc_courses').delete().eq('id', c.id);
  if (error) return fail('刪除班級', error);
  A.courses = A.courses.filter((x) => x !== c);
  if (A.course === c) await selectCourse(A.courses[0]); else renderClassPills();
  renderSettings();
}

/* ============================================================
   其他
   ============================================================ */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && A.course && !$('bh-dialog').open) loadCourse();
});

if (!configured || !db) showLogin('還沒設定 Supabase（js/config.js）');
else start();
