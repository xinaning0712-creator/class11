// 後台：考試設定（存在 settings 表的 exam_config，考試頁會自動更新）
import { friendlyError } from './db.js?v=202611022002';
import { el, toast } from './ui.js?v=202611022002';
import { EXAM_KEY, AUDIO_KEY, AUDIO_BUCKET, parseAudio, ORDERS, parseConfig, autoLayout, isoDate, toMinutes, fromMinutes } from './exam-core.js?v=202611022002';

const $ = (id) => document.getElementById(id);
const DEFAULT_MINUTES = 40;
const BREAK_MINUTES = 10;

let db = null;
let cfg = parseConfig(null);
let picked = null;   // 座位表：第一個點到的格子
let audio = null;    // 英聽：{ date, url, path, name }
let drag = null;

export function init(client) {
  db = client;
  $('ex-order').replaceChildren(...Object.entries(ORDERS).map(([v, label]) => el('option', { value: v }, label)));
  $('ex-add-day').addEventListener('click', addDay);
  $('ex-save').addEventListener('click', save);
  $('ex-flip').addEventListener('click', flip);
  $('ex-grid').addEventListener('pointerdown', dragStart);
  $('ex-audio-file').addEventListener('change', uploadAudio);
  $('ex-audio-del').addEventListener('click', deleteAudio);
  $('ex-audio-date').addEventListener('change', changeAudioDate);
  for (const id of ['ex-size', 'ex-cols', 'ex-rows', 'ex-order']) {
    $(id).addEventListener('change', rearrange);
  }
}

export async function load() {
  const { data, error } = await db.from('settings').select('key, value').in('key', [EXAM_KEY, AUDIO_KEY]);
  if (error) return;
  const setting = Object.fromEntries(data.map((r) => [r.key, r.value]));
  cfg = parseConfig(setting[EXAM_KEY] ?? null);
  audio = parseAudio(setting[AUDIO_KEY]);
  renderAudio();
  picked = null;
  $('ex-title').value = cfg.title;
  $('ex-note').value = cfg.note;
  $('ex-size').value = cfg.classSize;
  $('ex-cols').value = cfg.cols;
  $('ex-rows').value = cfg.rows;
  $('ex-order').value = cfg.order;
  renderDays();
  renderSeats();
}

// ---------- 考程 ----------
function addDay() {
  const last = cfg.days[cfg.days.length - 1];
  let date = isoDate();
  if (last?.date) {
    const [y, m, d] = last.date.split('-').map(Number);
    date = isoDate(new Date(y, m - 1, d + 1));
  }
  cfg.days.push({ date, slots: [{ subject: '', start: '08:40', end: '09:20' }] });
  renderDays();
}

function addSlot(day) {
  const last = day.slots[day.slots.length - 1];
  const start = last?.end ? toMinutes(last.end) + BREAK_MINUTES : toMinutes('08:40');
  day.slots.push({ subject: '', start: fromMinutes(start), end: fromMinutes(start + DEFAULT_MINUTES) });
  renderDays();
}

function renderDays() {
  $('ex-days').replaceChildren(...(cfg.days.length ? cfg.days.map((day) => {
    const date = el('input', { type: 'date', value: day.date, 'aria-label': '考試日期' });
    date.addEventListener('change', () => { day.date = date.value; });
    return el('div', { class: 'ex-day' },
      el('div', { class: 'ex-day-head' }, date,
        el('button', { class: 'btn small', type: 'button', onclick: () => addSlot(day) }, '＋ 加一節'),
        el('button', { class: 'btn small ghost', type: 'button', onclick: () => {
          cfg.days = cfg.days.filter((d) => d !== day);
          renderDays();
        } }, '刪除這天')),
      ...day.slots.map((s) => slotRow(day, s)));
  }) : [el('p', { class: 'muted' }, '還沒有考試日，按下面的「新增考試日」開始')]));
}

function slotRow(day, slot) {
  const bind = (input, field) => {
    input.addEventListener('input', () => { slot[field] = input.value; });
    return input;
  };
  return el('div', { class: 'ex-slot' },
    bind(el('input', { type: 'text', value: slot.subject, maxlength: 12, list: 'ex-subjects', placeholder: '科目', 'aria-label': '科目' }), 'subject'),
    bind(el('input', { type: 'time', value: slot.start, 'aria-label': '開始時間' }), 'start'),
    el('span', {}, '到'),
    bind(el('input', { type: 'time', value: slot.end, 'aria-label': '結束時間' }), 'end'),
    el('button', { class: 'btn small ghost', type: 'button', onclick: () => {
      day.slots = day.slots.filter((x) => x !== slot);
      renderDays();
    } }, '刪除'));
}

// ---------- 🎧 英聽 ----------
const putAudio = (value) => db.from('settings').upsert([
  { key: AUDIO_KEY, value, updated_at: new Date().toISOString() },
]);

function renderAudio() {
  const date = $('ex-audio-date');
  date.value = audio?.date ?? cfg.days[0]?.date ?? '';
  $('ex-audio-del').hidden = !audio;
  $('ex-audio-msg').textContent = !audio ? '還沒有上傳音檔'
    : cfg.days.some((d) => d.date === audio.date) ? `目前的音檔：${audio.name} ✓`
    : `目前的音檔：${audio.name}（⚠️ 這天不是考試日，考試頁不會出現）`;
}

function audioError(error) {
  if (/bucket/i.test(error?.message ?? '')) return '雲端還沒開好：請先到 Supabase 執行 supabase/12_考試英聽.sql';
  if (/size|too large|exceeded/i.test(error?.message ?? '')) return '檔案太大，最大 50MB';
  return friendlyError(error);
}

async function uploadAudio(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const date = $('ex-audio-date').value;
  if (!date) return toast('請先選音檔要在哪一天出現', { tone: 'error', seconds: 4 });
  const ext = (file.name.match(/\.(mp3|m4a|wav)$/i)?.[1] ?? 'mp3').toLowerCase();
  const type = { mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav' }[ext];
  const path = `${crypto.randomUUID()}.${ext}`;   // 隨機檔名，猜不到網址
  $('ex-audio-msg').textContent = '上傳中，請不要關閉這一頁…';
  const bucket = db.storage.from(AUDIO_BUCKET);
  const { error } = await bucket.upload(path, file, { contentType: type, upsert: false });
  if (error) {
    renderAudio();
    return toast(`上傳失敗：${audioError(error)}`, { tone: 'error', seconds: 7 });
  }
  const url = bucket.getPublicUrl(path).data.publicUrl;
  const next = { date, url, path, name: file.name };
  const { error: saveError } = await putAudio(JSON.stringify(next));
  if (saveError) {
    await bucket.remove([path]);
    renderAudio();
    return toast(`儲存失敗：${friendlyError(saveError)}`, { tone: 'error', seconds: 5 });
  }
  if (audio?.path) await bucket.remove([audio.path]);   // 換檔時把舊的刪掉
  audio = next;
  renderAudio();
  toast('英聽已上傳，考試頁會自動更新');
}

async function changeAudioDate() {
  const date = $('ex-audio-date').value;
  if (!audio || !date) return;
  const next = { ...audio, date };
  const { error } = await putAudio(JSON.stringify(next));
  if (error) return toast(`儲存失敗：${friendlyError(error)}`, { tone: 'error', seconds: 5 });
  audio = next;
  renderAudio();
}

async function deleteAudio() {
  if (!audio || !confirm('確定要刪除英聽音檔嗎？刪掉就救不回來。')) return;
  const { error } = await db.storage.from(AUDIO_BUCKET).remove([audio.path]);
  if (error) return toast(`刪除失敗：${audioError(error)}`, { tone: 'error', seconds: 5 });
  const { error: saveError } = await putAudio('');
  if (saveError) return toast(`刪除失敗：${friendlyError(saveError)}`, { tone: 'error', seconds: 5 });
  audio = null;
  renderAudio();
  toast('英聽音檔已刪除');
}

// ---------- 座位 ----------
function readSize() {
  const num = (id, fallback) => Math.round(Number($(id).value)) || fallback;
  cfg.classSize = Math.min(60, Math.max(1, num('ex-size', cfg.classSize)));
  cfg.cols = Math.min(12, Math.max(1, num('ex-cols', cfg.cols)));
  cfg.rows = Math.min(12, Math.max(1, num('ex-rows', cfg.rows)));
  cfg.order = $('ex-order').value;
}

function rearrange() {
  readSize();
  cfg.layout = autoLayout(cfg.classSize, cfg.cols, cfg.rows, cfg.order);
  picked = null;
  renderSeats();
}

function flip() {
  const out = [];
  for (let r = 0; r < cfg.rows; r += 1) {
    out.push(...cfg.layout.slice(r * cfg.cols, (r + 1) * cfg.cols).reverse());
  }
  cfg.layout = out;
  picked = null;
  renderSeats();
}

// 拖拉：按住座號拖到另一格放開就互換；沒拖動就當作點一下
const DRAG_START_PX = 6;
const cellAt = (x, y) => document.elementFromPoint(x, y)?.closest('.ex-cell') ?? null;
const clearOver = () => document.querySelectorAll('.ex-cell.over').forEach((c) => c.classList.remove('over'));

function dragStart(e) {
  const cell = e.target.closest('.ex-cell');
  if (!cell || drag) return;
  e.preventDefault();
  drag = { cell, from: Number(cell.dataset.i), x: e.clientX, y: e.clientY, id: e.pointerId, ghost: null };
  window.addEventListener('pointermove', dragMove);
  window.addEventListener('pointerup', dragEnd);
  window.addEventListener('pointercancel', dragCancel);
}

function dragMove(e) {
  if (!drag || e.pointerId !== drag.id) return;
  if (!drag.ghost) {
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < DRAG_START_PX) return;
    if (!cfg.layout[drag.from]) return;   // 空位不用拖
    drag.ghost = el('div', { class: 'ex-ghost' }, cfg.layout[drag.from]);
    document.body.append(drag.ghost);
    drag.cell.classList.add('dragging');
    picked = null;
  }
  drag.ghost.style.left = `${e.clientX}px`;
  drag.ghost.style.top = `${e.clientY}px`;
  clearOver();
  const over = cellAt(e.clientX, e.clientY);
  if (over && over !== drag.cell) over.classList.add('over');
}

function dragFinish() {
  window.removeEventListener('pointermove', dragMove);
  window.removeEventListener('pointerup', dragEnd);
  window.removeEventListener('pointercancel', dragCancel);
  const d = drag;
  drag = null;
  d.ghost?.remove();
  clearOver();
  return d;
}

function dragEnd(e) {
  if (!drag || e.pointerId !== drag.id) return;
  const d = dragFinish();
  if (!d.ghost) return tapCell(d.from);
  const over = cellAt(e.clientX, e.clientY);
  if (over && over !== d.cell) {
    const to = Number(over.dataset.i);
    [cfg.layout[d.from], cfg.layout[to]] = [cfg.layout[to], cfg.layout[d.from]];
  }
  renderSeats();
}

function dragCancel(e) {
  if (!drag || e.pointerId !== drag.id) return;
  dragFinish();
  renderSeats();
}

function tapCell(i) {
  if (picked === null) {
    picked = i;
  } else {
    if (picked !== i) [cfg.layout[picked], cfg.layout[i]] = [cfg.layout[i], cfg.layout[picked]];
    picked = null;
  }
  renderSeats();
}

function renderSeats() {
  const grid = $('ex-grid');
  grid.style.setProperty('--cols', cfg.cols);
  grid.replaceChildren(...cfg.layout.map((n, i) => el('button', {
    class: `ex-cell${n ? '' : ' blank'}${picked === i ? ' picked' : ''}`,
    type: 'button',
    'aria-label': n ? `${n} 號` : '空位',
    'data-i': i,
    onclick: (e) => { if (e.detail === 0) tapCell(i); },   // 手指和滑鼠走拖拉那邊，這裡只接鍵盤
  }, n || '空')));
  const seats = cfg.cols * cfg.rows;
  $('ex-seat-msg').textContent = seats < cfg.classSize
    ? `⚠️ ${cfg.cols} × ${cfg.rows} 只有 ${seats} 個位子，坐不下 ${cfg.classSize} 人`
    : '';
}

// ---------- 儲存 ----------
async function save() {
  readSize();
  if (cfg.cols * cfg.rows < cfg.classSize) return toast('座位不夠，請調整欄數或排數', { tone: 'error', seconds: 4 });
  const dates = cfg.days.map((d) => d.date);
  if (dates.some((d) => !d)) return toast('有考試日還沒選日期', { tone: 'error', seconds: 4 });
  if (new Set(dates).size !== dates.length) return toast('有兩天的日期一樣，請改一下', { tone: 'error', seconds: 4 });
  for (const day of cfg.days) {
    for (const s of day.slots) {
      if (!s.subject.trim()) return toast(`${day.date} 有一節沒填科目`, { tone: 'error', seconds: 4 });
      if (!s.start || !s.end || s.start >= s.end) return toast(`${s.subject}的結束時間要晚於開始時間`, { tone: 'error', seconds: 4 });
    }
  }
  cfg.title = $('ex-title').value.trim() || '期中考';
  cfg.note = $('ex-note').value.trim();
  const { error } = await db.from('settings').upsert([
    { key: EXAM_KEY, value: JSON.stringify(cfg), updated_at: new Date().toISOString() },
  ]);
  if (error) return toast(`儲存失敗：${friendlyError(error)}`, { tone: 'error', seconds: 5 });
  toast('考試設定已儲存，考試頁會自動更新');
  load();
}
