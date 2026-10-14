// 主畫面（白板投影用）
import { CLASS_NAME, CLASSROOM_EMAIL } from './config.js?v=202610142100';
import { configured, classroomDb, findOperator, friendlyError } from './db.js?v=202610142100';
import { STATUS, SEATS, el, toast, debounce, startClock } from './ui.js?v=202610142100';
import { celebrate } from './celebrate.js?v=202610142100';
import { watchCountdowns, renderStrip } from './countdown.js?v=202610142100';

const $ = (id) => document.getElementById(id);
const UNDO_SECONDS = 10;

// ---------- 全班完成動畫的設定 ----------
const RAINBOW = ['pink', 'peach', 'honey', 'sage', 'sky', 'lavender'];   // 彩色記憶球的顏色
const PARTY_MS = 4800;          // 彩色慶祝多久（跟「全班完成！」彩帶一起，彩帶結束才開始滾）
const ARCHIVE_AFTER_MS = 11_000; // 等「點錯了，復原」的 10 秒過了，才真的封存
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
// 正在播完成動畫、或已經收掉等封存的作業：id → { a, node, index, timers, hidden }
const leaving = new Map();

let assignments = [];          // [{id, title}]
let lights = new Map();        // key `${assignmentId}-${seat}` → status
let operator = null;           // 能改燈號的連線（老師或教室模式）；null 代表只能看
let operatorRole = null;

document.title = CLASS_NAME;
$('class-name').textContent = CLASS_NAME;

startClock($('clock'), $('date'));

// ---------- 讀取資料 ----------
const key = (a, s) => `${a}-${s}`;
const allGreen = (id, map) => SEATS.every((s) => (map.get(key(id, s)) ?? 'green') === 'green');

// 從「還有人沒完成」變成「全班綠燈」→ 慶祝（剛新增的作業本來就全綠，不算）
function celebrateNewlyDone(before, after) {
  for (const a of assignments) {
    const known = SEATS.some((s) => before.has(key(a.id, s)));
    if (known && !allGreen(a.id, before) && allGreen(a.id, after) && !leaving.has(a.id)) {
      celebrate(a.title);
      startLeaving(a);
    }
  }
}

async function load() {
  const db = classroomDb();
  const { data: as, error: e1 } = await db
    .from('assignments').select('id, title').eq('archived', false)
    .order('created_at', { ascending: false });
  if (e1) return showError(e1);
  const ids = as.map((a) => a.id);
  let ls = [];
  if (ids.length) {
    const { data, error: e2 } = await db
      .from('lights').select('assignment_id, seat, status').in('assignment_id', ids);
    if (e2) return showError(e2);
    ls = data;
  }
  const before = lights;
  assignments = as;
  lights = new Map(ls.map((l) => [key(l.assignment_id, l.seat), l.status]));
  syncLeaving();
  render();
  celebrateNewlyDone(before, lights);
}
const reload = debounce(load, 300);

function showError(error) {
  $('board').replaceChildren(el('p', { class: 'empty' }, `讀取失敗：${friendlyError(error)}`));
}

// ---------- 畫面 ----------
// 作業數量決定排版：3 項以下 → 櫃子比較寬，每層 6 顆、4 層；4 項以上 → 每排 4 個櫃子，每層 4 顆、6 層
function layoutFor(n) {
  return n <= 3 ? { cols: Math.max(n, 1), perRow: 6 } : { cols: 4, perRow: 4 };
}

function render() {
  const board = $('board');
  const visible = assignments.filter((a) => !leaving.has(a.id));
  const animating = [...leaving.values()].filter((l) => !l.hidden).sort((x, y) => x.index - y.index);
  const total = visible.length + animating.length;
  if (!total) {
    board.style.removeProperty('--cols');
    board.replaceChildren(el('p', { class: 'empty' }, '目前沒有作業項目 ✨'));
    return;
  }
  const { cols, perRow } = layoutFor(total);
  board.style.setProperty('--cols', cols);
  const nodes = visible.map((a) => renderAssignment(a, perRow));
  // 正在播動畫的櫃子沿用原本的畫面（不重畫，動畫才不會中斷），放回原本的位置
  for (const l of animating) nodes.splice(Math.min(l.index, nodes.length), 0, l.node);
  board.replaceChildren(...nodes);
}

function renderAssignment(a, perRow) {
  const counts = { red: 0, yellow: 0 };
  const shelves = [];
  for (let start = 0; start < SEATS.length; start += perRow) {
    const seats = SEATS.slice(start, start + perRow).map((s) => {
      const st = lights.get(key(a.id, s)) ?? 'green';
      if (st in counts) counts[st] += 1;
      return el('button', {
        class: `seat orb ${st}`,
        type: 'button',
        'aria-label': `${s} 號，${STATUS[st].label}`,
        onclick: () => onSeatTap(a, s),
      }, s);
    });
    shelves.push(el('div', { class: 'shelf' }, seats));
  }
  const summary = counts.red + counts.yellow === 0
    ? el('span', { class: 'badge done' }, '全部完成')
    : [
        counts.red ? el('span', { class: 'badge red' }, `未交 ${counts.red}`) : null,
        counts.yellow ? el('span', { class: 'badge yellow' }, `未訂正 ${counts.yellow}`) : null,
      ];
  const node = el('article', { class: 'assignment cabinet', 'data-id': a.id },
    el('header', { class: 'assignment-head' },
      el('h2', {}, a.title),
      el('div', { class: 'badges' }, summary)),
    el('div', { class: 'shelves' }, shelves));
  node.style.setProperty('--per-row', perRow);
  return node;
}

// ---------- 全班完成：彩色慶祝 → 架子由下往上傾斜、球球滾出去 → 櫃子收掉 → 自動封存 ----------
function startLeaving(a) {
  const node = $('board').querySelector(`.cabinet[data-id="${a.id}"]`);
  if (!node) return;
  const index = [...node.parentNode.children].indexOf(node);
  const L = { a, node, index, timers: [], hidden: false };
  leaving.set(a.id, L);
  playLeave(L);
  L.timers.push(setTimeout(() => tryArchive(L), ARCHIVE_AFTER_MS));
}

function playLeave(L) {
  const later = (fn, ms) => L.timers.push(setTimeout(fn, ms));
  const node = L.node;
  const shelves = [...node.querySelectorAll('.shelf')];
  const rowsN = shelves.length;
  const perRow = shelves[0]?.children.length || 4;

  // 1. 全部變成彩色記憶球，斜斜排成彩虹
  node.classList.add('celebrating');
  shelves.forEach((shelf, r) => [...shelf.children].forEach((seat, ci) => {
    seat.classList.remove('green', 'yellow', 'red');
    seat.classList.add('party', RAINBOW[(r + ci + 1) % RAINBOW.length]);
  }));
  if (reduceMotion) { later(() => hideLeaving(L), PARTY_MS); return; }

  later(() => {
    // 2. 最下面那層先往右傾，最右邊那顆先滾，一顆接一顆沿著架子滾出去；再一層一層往上
    shelves.forEach((shelf, r) => {
      const rowStart = 0.2 + (rowsN - 1 - r) * 0.55;
      shelf.style.animationDelay = `${rowStart}s`;
      shelf.classList.add('tilt');
      [...shelf.children].forEach((seat, ci) => {
        seat.style.animationDelay = `${(rowStart + 0.18 + (perRow - 1 - ci) * 0.12).toFixed(2)}s`;
        seat.classList.remove('party');
        seat.classList.add('roll');
      });
    });
    const rollMs = (0.2 + (rowsN - 1) * 0.55 + 0.18 + (perRow - 1) * 0.12 + 1.0) * 1000;
    // 3. 滾完 → 櫃子縮小淡出 → 收掉，旁邊的櫃子補位
    later(() => {
      node.classList.add('vanish');
      later(() => hideLeaving(L), 700);
    }, rollMs + 100);
  }, PARTY_MS);
}

function hideLeaving(L) {
  if (!leaving.has(L.a.id)) return;
  L.hidden = true;
  render();
}

function cancelLeaving(id) {
  const L = leaving.get(id);
  if (!L) return;
  L.timers.forEach(clearTimeout);
  leaving.delete(id);
}

// 4. 復原的時間過了，還是全班綠燈 → 封存（資料庫會再確認一次真的是全綠才封存）
async function tryArchive(L) {
  if (!leaving.has(L.a.id) || !operator) return;   // 只能查看的裝置不動手，交給教室電腦
  const { data, error } = await operator.rpc('archive_if_done', { p_assignment: L.a.id });
  if (error) {
    console.warn('自動封存沒有成功（請確認已執行 supabase/07_自動封存與清除.sql）：', error.message);
    return;   // 這台畫面上先收著，不打擾上課
  }
  if (data === false) cancelLeaving(L.a.id);   // 有人按了復原，不是全綠了
  load();
}

// 每次重新讀資料後：按了復原（不再全綠）就把櫃子放回來；已經封存好的就清掉記錄
function syncLeaving() {
  for (const [id, L] of leaving) {
    const stillActive = assignments.some((a) => a.id === id);
    if (stillActive && !allGreen(id, lights)) { cancelLeaving(id); continue; }
    if (!stillActive && L.hidden) leaving.delete(id);
  }
}

// ---------- 孩子點燈 ----------
async function onSeatTap(a, seat) {
  const k = key(a.id, seat);
  const before = lights.get(k);
  if (!operator) {
    toast('這台裝置只能查看，不能修改', { seconds: 3 });
    return;
  }
  if (before === 'green') return;

  const snapshot = new Map(lights);
  lights.set(k, 'green');   // 先在畫面上變綠，感覺比較快
  render();
  celebrateNewlyDone(snapshot, lights);
  const { data: logId, error } = await operator.rpc('set_light', {
    p_assignment: a.id, p_seat: seat, p_status: 'green',
  });
  if (error) {
    lights.set(k, before);
    render();
    toast(`沒有改成功：${friendlyError(error)}`, { tone: 'error', seconds: 5 });
    return;
  }
  if (!logId) return;
  toast(`${seat} 號「${a.title}」改成綠燈 ✓`, {
    seconds: UNDO_SECONDS,
    action: { label: '點錯了，復原', run: () => undo(logId, seat) },
  });
}

async function undo(logId, seat) {
  const { error } = await operator.rpc('undo_light_change', { p_log: logId });
  if (error) {
    toast(`無法復原：${friendlyError(error)}`, { tone: 'error', seconds: 5 });
  } else {
    toast(`已復原 ${seat} 號`, { seconds: 3 });
  }
  load();
}

// ---------- 這台裝置能不能操作 ----------
async function refreshOperator() {
  ({ db: operator, role: operatorRole } = await findOperator());
  document.body.classList.toggle('can-operate', !!operator);
  $('mode-hint').textContent = operator ? '' : '僅供查看';

  const status = operatorRole === 'teacher' ? '老師已登入，可以修改燈號。'
    : operatorRole === 'classroom' ? '教室模式已開啟：孩子可以點自己的座號改成綠燈。'
    : '目前只能查看燈號。';
  $('settings-status').textContent = status;
  $('classroom-login').hidden = operatorRole === 'classroom';
  $('classroom-logout-btn').hidden = operatorRole !== 'classroom';
}

$('settings-btn').addEventListener('click', () => {
  $('classroom-err').hidden = true;
  $('classroom-pw').value = '';
  $('settings').showModal();
});

$('classroom-login-btn').addEventListener('click', async () => {
  const pw = $('classroom-pw').value;
  if (!pw) return;
  const { error } = await classroomDb().auth.signInWithPassword({ email: CLASSROOM_EMAIL, password: pw });
  if (error) {
    $('classroom-err').textContent = friendlyError(error);
    $('classroom-err').hidden = false;
    return;
  }
  await refreshOperator();
  $('settings').close();
  toast('教室模式已開啟', { seconds: 3 });
});

$('classroom-pw').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); $('classroom-login-btn').click(); }
});

$('classroom-logout-btn').addEventListener('click', async () => {
  if (!confirm('確定要關閉教室模式嗎？關閉後孩子就不能點燈號。')) return;
  await classroomDb().auth.signOut();
  await refreshOperator();
  $('settings').close();
});

// ---------- 啟動 ----------
async function start() {
  if (!configured) {
    $('board').replaceChildren(el('p', { class: 'empty' },
      '還沒連上資料庫：請在 js/config.js 填入 Supabase 網址與公開鑰匙。'));
    $('settings-btn').hidden = true;
    return;
  }
  watchCountdowns((items) => renderStrip($('countdown-strip'), items));
  await refreshOperator();
  await load();

  // 即時同步：別台電腦改了燈號，這裡馬上更新
  classroomDb().channel('board')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'lights' }, reload)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'assignments' }, reload)
    .subscribe();

  // 保險：每分鐘、以及畫面切回來時都重新讀一次（白板整天開著，網路偶爾會斷）
  setInterval(load, 60_000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { refreshOperator(); load(); }
  });
}
start();
