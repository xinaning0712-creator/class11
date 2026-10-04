// 主畫面（白板投影用）
import { CLASS_NAME, CLASSROOM_EMAIL } from './config.js';
import { configured, classroomDb, findOperator, friendlyError } from './db.js';
import { STATUS, SEATS, el, toast, debounce, startClock } from './ui.js';

const $ = (id) => document.getElementById(id);
const UNDO_SECONDS = 10;

let assignments = [];          // [{id, title}]
let lights = new Map();        // key `${assignmentId}-${seat}` → status
let operator = null;           // 能改燈號的連線（老師或教室模式）；null 代表只能看
let operatorRole = null;

document.title = CLASS_NAME;
$('class-name').textContent = CLASS_NAME;

startClock($('clock'), $('date'));

// ---------- 讀取資料 ----------
const key = (a, s) => `${a}-${s}`;

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
  assignments = as;
  lights = new Map(ls.map((l) => [key(l.assignment_id, l.seat), l.status]));
  render();
}
const reload = debounce(load, 300);

function showError(error) {
  $('board').replaceChildren(el('p', { class: 'empty' }, `讀取失敗：${friendlyError(error)}`));
}

// ---------- 畫面 ----------
function render() {
  const board = $('board');
  if (!assignments.length) {
    board.replaceChildren(el('p', { class: 'empty' }, '目前沒有作業項目 ✨'));
    return;
  }
  board.replaceChildren(...assignments.map(renderAssignment));
}

function renderAssignment(a) {
  const counts = { red: 0, yellow: 0 };
  const seats = SEATS.map((s) => {
    const st = lights.get(key(a.id, s)) ?? 'green';
    if (st in counts) counts[st] += 1;
    return el('button', {
      class: `seat ${st}`,
      type: 'button',
      'aria-label': `${s} 號，${STATUS[st].label}`,
      onclick: () => onSeatTap(a, s),
    }, s);
  });
  const summary = counts.red + counts.yellow === 0
    ? el('span', { class: 'badge done' }, '全部完成')
    : [
        counts.red ? el('span', { class: 'badge red' }, `未交 ${counts.red}`) : null,
        counts.yellow ? el('span', { class: 'badge yellow' }, `未訂正 ${counts.yellow}`) : null,
      ];
  return el('article', { class: 'assignment' },
    el('header', { class: 'assignment-head' },
      el('h2', {}, a.title),
      el('div', { class: 'badges' }, summary)),
    el('div', { class: 'seats' }, seats));
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

  lights.set(k, 'green');   // 先在畫面上變綠，感覺比較快
  render();
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
