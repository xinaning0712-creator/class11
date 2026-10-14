// 後台：🎮 題庫（全班對戰用的自訂題組）
//  - 題組列表：新增、編輯、複製、刪除
//  - 編輯器：題目、圖片、2～4 個選項、勾選正解；可整批從試算表貼上
import { friendlyError } from './db.js?v=202610142323';
import { el, toast } from './ui.js?v=202610142323';
import {
  SUBJECTS, MAX_QUESTIONS, LIMITS, IMG_BUCKET, cleanQuestion, parseBulk, richText, DEMO_SET,
} from './quiz-bank.js?v=202610142323';
import { readSheetFile } from './sheet-import.js?v=202610142323';

const $ = (id) => document.getElementById(id);
const TABLE = 'quiz_sets';
const LETTERS = ['A', 'B', 'C', 'D'];

let db = null;
let sets = [];
let ed = null;          // 正在編輯的題組
let dirty = false;
let uploadFor = -1;     // 正在幫第幾題上傳圖片

const fail = (what, error) => toast(`${what}失敗：${friendlyError(error)}`, { tone: 'error', seconds: 6 });
const missingTable = (e) => /quiz_sets|42P01|PGRST205|does not exist|Could not find the table/i.test(`${e?.code} ${e?.message}`);

/* ---------- 編輯器裡的一題：4 個選項格（空白的不算） ---------- */
const blankQ = () => ({ text: '', img: '', slots: ['', '', '', ''], answer: 0 });
function toEditQ(q) {
  const slots = ['', '', '', ''];
  q.options.forEach((o, i) => { slots[i] = o; });
  return { text: q.text, img: q.img || '', slots, answer: q.answer };
}
/* 編輯格式 → 儲存格式；有問題回傳錯誤訊息 */
function fromEditQ(q) {
  const idx = [], options = [];
  q.slots.forEach((s, i) => { const t = s.trim(); if (t) { idx.push(i); options.push(t); } });
  if (!q.text.trim() && !q.img) return { error: '題目是空的' };
  if (options.length < 2) return { error: '至少要有 2 個選項' };
  if (!q.slots[q.answer]?.trim()) return { error: '勾選的正確答案是空白的' };
  if (new Set(options).size !== options.length) return { error: '有兩個選項一模一樣' };
  const out = cleanQuestion({ text: q.text, img: q.img, options, answer: idx.indexOf(q.answer) });
  return out ? { q: out } : { error: '格式不正確' };
}

export function init(client) {
  db = client;
  $('qz-subject').replaceChildren(...SUBJECTS.map((s) => el('option', { value: s }, s)));
  $('qz-new').addEventListener('click', () => openEditor(null));
  $('qz-back').addEventListener('click', () => {
    if (dirty && !confirm('還沒儲存，確定要離開嗎？')) return;
    closeEditor();
  });
  $('qz-save').addEventListener('click', save);
  $('qz-add').addEventListener('click', () => addQuestion());
  $('qz-add-bottom').addEventListener('click', () => addQuestion());

  // 題組設定
  $('qz-title').addEventListener('input', (e) => { ed.title = e.target.value; touch(); });
  $('qz-subject').addEventListener('change', (e) => { ed.subject = e.target.value; touch(); });
  $('qz-frac').addEventListener('change', (e) => { ed.frac = e.target.checked; touch(); renderQuestions(); });
  $('qz-shuffle').addEventListener('change', (e) => { ed.shuffle = e.target.checked; touch(); });

  // 整批貼上
  $('qz-bulk-toggle').addEventListener('click', () => {
    const box = $('qz-bulk');
    box.hidden = !box.hidden;
    if (!box.hidden) $('qz-bulk-text').focus();
  });
  $('qz-bulk-cancel').addEventListener('click', () => { $('qz-bulk').hidden = true; });
  $('qz-bulk-text').addEventListener('input', previewBulk);
  $('qz-bulk-add').addEventListener('click', addBulk);
  $('qz-file-pick').addEventListener('click', () => { $('qz-sheet-file').value = ''; $('qz-sheet-file').click(); });
  $('qz-sheet-file').addEventListener('change', onSheetFile);

  // 圖片
  $('qz-file').addEventListener('change', onFile);

  window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
}

/* ============================================================
   題組列表
   ============================================================ */
export async function load() {
  const { data, error } = await db.from(TABLE).select('id, title, subject, frac, shuffle, questions, updated_at')
    .order('updated_at', { ascending: false });
  $('qz-setup').hidden = !(error && missingTable(error));
  $('qz-new').disabled = !!error;
  if (error) { if (!missingTable(error)) fail('讀取題庫', error); sets = []; renderList(); return; }
  sets = data;
  renderList();
}

function renderList() {
  const list = $('qz-list');
  if (!sets.length) {
    list.replaceChildren(el('div', { class: 'card qz-empty' },
      el('p', {}, '還沒有題組。按「＋ 新增題組」開始，或先用示範題組看看長什麼樣子。'),
      el('button', { class: 'btn', type: 'button', onclick: useDemo, disabled: $('qz-new').disabled }, '🧪 建立示範題組')));
    return;
  }
  list.replaceChildren(...sets.map((s) => {
    const n = Array.isArray(s.questions) ? s.questions.length : 0;
    const date = new Date(s.updated_at).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' });
    return el('div', { class: 'card qz-set' },
      el('div', { class: 'qz-set-main' },
        el('span', { class: 'qz-subject' }, s.subject),
        el('strong', { class: 'qz-set-title' }, s.title),
        el('span', { class: 'muted' }, `${n} 題・${date} 更新`)),
      el('span', { class: 'row-actions' },
        el('button', { class: 'btn small primary', type: 'button', onclick: () => openEditor(s) }, '編輯'),
        el('button', { class: 'btn small ghost', type: 'button', onclick: () => copySet(s) }, '複製'),
        el('button', { class: 'btn small ghost', type: 'button', onclick: () => removeSet(s) }, '刪除')));
  }));
}

async function useDemo() {
  const { id, ...row } = DEMO_SET;
  const { error } = await db.from(TABLE).insert({ ...row, title: '示範題組：分數小測驗' });
  if (error) return fail('建立', error);
  toast('已建立示範題組');
  load();
}

async function copySet(s) {
  const title = `${s.title}（複本）`.slice(0, LIMITS.title);
  const { error } = await db.from(TABLE).insert({ title, subject: s.subject, frac: s.frac, shuffle: s.shuffle, questions: s.questions });
  if (error) return fail('複製', error);
  toast(`已複製成「${title}」`);
  load();
}

async function removeSet(s) {
  if (!confirm(`確定要刪除題組「${s.title}」嗎？刪掉就救不回來了。`)) return;
  const { error } = await db.from(TABLE).delete().eq('id', s.id);
  if (error) return fail('刪除', error);
  toast('已刪除');
  load();
}

/* ============================================================
   編輯器
   ============================================================ */
function openEditor(s) {
  ed = s
    ? { id: s.id, title: s.title, subject: s.subject, frac: s.frac, shuffle: s.shuffle,
        questions: (s.questions || []).map((q) => cleanQuestion(q)).filter(Boolean).map(toEditQ) }
    : { id: null, title: '', subject: '數學', frac: true, shuffle: true, questions: [blankQ()] };
  dirty = false;
  $('qz-title').value = ed.title;
  $('qz-subject').value = ed.subject;
  $('qz-frac').checked = ed.frac;
  $('qz-shuffle').checked = ed.shuffle;
  $('qz-bulk').hidden = true;
  $('qz-bulk-text').value = '';
  previewBulk();
  $('qz-list-view').hidden = true;
  $('qz-edit-view').hidden = false;
  setStatus(s ? '' : '新的題組');
  renderQuestions();
  if (!s) $('qz-title').focus();
  window.scrollTo(0, 0);
}
function closeEditor() {
  ed = null; dirty = false;
  $('qz-edit-view').hidden = true;
  $('qz-list-view').hidden = false;
  load();
}
function touch() { dirty = true; setStatus('● 還沒儲存'); }
function setStatus(t) { $('qz-status').textContent = t; }

function addQuestion(q) {
  if (ed.questions.length >= MAX_QUESTIONS) return toast(`一個題組最多 ${MAX_QUESTIONS} 題`, { tone: 'error' });
  ed.questions.push(q || blankQ());
  touch();
  renderQuestions();
  const cards = $('qz-questions').children;
  cards[cards.length - 1]?.querySelector('textarea')?.focus();
}

function move(i, d) {
  const j = i + d;
  if (j < 0 || j >= ed.questions.length) return;
  [ed.questions[i], ed.questions[j]] = [ed.questions[j], ed.questions[i]];
  touch(); renderQuestions();
}

function renderQuestions() {
  $('qz-count').textContent = `共 ${ed.questions.length} 題`;
  $('qz-questions').replaceChildren(...ed.questions.map((q, i) => questionCard(q, i)));
}

function questionCard(q, i) {
  const text = el('textarea', { rows: 2, maxlength: LIMITS.text, placeholder: '輸入題目' + (ed.frac ? '（3/4 會顯示成上下排版的分數）' : '') });
  text.value = q.text;
  const preview = el('div', { class: 'qz-preview' });
  const showPreview = () => {
    preview.innerHTML = ed.frac && /\d\s*\/\s*\d/.test(q.text) ? '預覽：' + richText(q.text, true) : '';
  };
  text.addEventListener('input', () => { q.text = text.value; touch(); showPreview(); });
  showPreview();

  const imgBox = q.img
    ? el('div', { class: 'qz-img' },
        el('img', { src: q.img, alt: '題目圖片' }),
        el('button', { class: 'btn small ghost', type: 'button', onclick: () => { q.img = ''; touch(); renderQuestions(); } }, '移除圖片'))
    : el('button', { class: 'btn small', type: 'button', onclick: () => pickImage(i) }, '🖼️ 加圖片');

  const opts = q.slots.map((s, k) => {
    const radio = el('input', { type: 'radio', name: `qz-ans-${i}`, 'aria-label': `正確答案是 ${LETTERS[k]}` });
    radio.checked = q.answer === k;
    radio.addEventListener('change', () => { q.answer = k; touch(); row.classList.add('is-answer'); refreshAnswer(); });
    const input = el('input', { type: 'text', maxlength: LIMITS.option, placeholder: k < 2 ? `選項 ${LETTERS[k]}` : `選項 ${LETTERS[k]}（可不填）` });
    input.value = s;
    input.addEventListener('input', () => { q.slots[k] = input.value; touch(); });
    const row = el('label', { class: `qz-opt${q.answer === k ? ' is-answer' : ''}` },
      radio, el('span', { class: 'qz-letter' }, LETTERS[k]), input);
    return row;
  });
  const refreshAnswer = () => opts.forEach((r, k) => r.classList.toggle('is-answer', q.answer === k));

  return el('div', { class: 'card qz-q' },
    el('div', { class: 'qz-q-head' },
      el('strong', {}, `第 ${i + 1} 題`),
      el('span', { class: 'row-actions' },
        el('button', { class: 'btn small ghost', type: 'button', title: '上移', 'aria-label': '上移', onclick: () => move(i, -1), disabled: i === 0 }, '↑'),
        el('button', { class: 'btn small ghost', type: 'button', title: '下移', 'aria-label': '下移', onclick: () => move(i, 1), disabled: i === ed.questions.length - 1 }, '↓'),
        el('button', { class: 'btn small ghost', type: 'button', onclick: () => {
          if (ed.questions.length >= MAX_QUESTIONS) return toast(`一個題組最多 ${MAX_QUESTIONS} 題`, { tone: 'error' });
          ed.questions.splice(i + 1, 0, { ...q, slots: [...q.slots] }); touch(); renderQuestions();
        } }, '複製'),
        el('button', { class: 'btn small ghost', type: 'button', onclick: () => {
          if ((q.text || q.slots.some((s) => s)) && !confirm(`確定要刪除第 ${i + 1} 題嗎？`)) return;
          ed.questions.splice(i, 1); touch(); renderQuestions();
        } }, '刪除'))),
    text, preview, imgBox,
    el('p', { class: 'hint' }, '點圓圈選正確答案：'),
    el('div', { class: 'qz-opts' }, ...opts));
}

/* ---------- 儲存 ---------- */
async function save() {
  const title = ed.title.trim();
  if (!title) { $('qz-title').focus(); return toast('請幫題組取個名字', { tone: 'error' }); }
  const questions = [], problems = [];
  ed.questions.forEach((q, i) => {
    const blank = !q.text.trim() && !q.img && q.slots.every((s) => !s.trim());
    if (blank) return;                       // 完全空白的題目直接略過
    const r = fromEditQ(q);
    if (r.error) problems.push(`第 ${i + 1} 題：${r.error}`);
    else questions.push(r.q);
  });
  if (problems.length) return toast(problems.slice(0, 3).join('；') + (problems.length > 3 ? '…' : ''), { tone: 'error', seconds: 8 });
  if (!questions.length) return toast('至少要有一題', { tone: 'error' });

  const row = { title, subject: ed.subject, frac: ed.frac, shuffle: ed.shuffle, questions, updated_at: new Date().toISOString() };
  $('qz-save').disabled = true;
  setStatus('儲存中…');
  const res = ed.id
    ? await db.from(TABLE).update(row).eq('id', ed.id).select('id').single()
    : await db.from(TABLE).insert(row).select('id').single();
  $('qz-save').disabled = false;
  if (res.error) { setStatus('● 還沒儲存'); return fail('儲存', res.error); }
  ed.id = res.data.id;
  ed.questions = questions.map(toEditQ);
  dirty = false;
  renderQuestions();
  setStatus(`✓ 已儲存（${questions.length} 題）`);
  toast(`「${title}」已儲存，全班對戰的白板重新整理後就能選`);
}

/* ---------- 整批貼上 ---------- */
let bulkRows = [];
function previewBulk() {
  const { rows, errors } = parseBulk($('qz-bulk-text').value);
  bulkRows = rows;
  const box = $('qz-bulk-preview');
  const room = MAX_QUESTIONS - (ed ? ed.questions.filter((q) => q.text || q.slots.some((s) => s)).length : 0);
  const parts = [];
  if (rows.length) parts.push(el('p', { class: 'qz-ok' }, `✓ 可以加入 ${Math.min(rows.length, room)} 題` + (rows.length > room ? `（超過上限，只會加入前 ${room} 題）` : '')));
  if (errors.length) {
    parts.push(el('p', { class: 'qz-bad' }, `⚠️ ${errors.length} 行沒辦法加入：`));
    parts.push(el('ul', { class: 'qz-bad-list' }, ...errors.slice(0, 8).map((e) => el('li', {}, `第 ${e.line} 行：${e.msg}`)),
      errors.length > 8 ? el('li', {}, `……還有 ${errors.length - 8} 行`) : null));
  }
  box.replaceChildren(...parts);
  $('qz-bulk-add').disabled = !rows.length || room <= 0;
}
/* 從 Excel／CSV 匯入：讀成一列一列的文字，放進上面的框框，用同一套檢查與預覽 */
async function onSheetFile(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const rows = await readSheetFile(file);
    const lines = rows
      .map((r) => r.map((c) => String(c ?? '').replace(/[\t\r\n]+/g, ' ').trim()))
      .filter((r) => r.some((c) => c))
      .map((r) => r.join('\t'));
    if (!lines.length) return toast('這個檔案裡沒有題目', { tone: 'error' });
    $('qz-bulk').hidden = false;
    $('qz-bulk-text').value = lines.join('\n');
    previewBulk();
    toast(`從「${file.name}」讀到 ${lines.length} 列，確認下面的結果後按「加入題目」`, { seconds: 5 });
  } catch (err) {
    toast(`匯入失敗：${err.message || err}`, { tone: 'error', seconds: 7 });
  }
}

function addBulk() {
  if (!bulkRows.length) return;
  // 如果編輯器裡只有一題空白的，直接取代掉
  ed.questions = ed.questions.filter((q) => q.text.trim() || q.img || q.slots.some((s) => s.trim()));
  const room = MAX_QUESTIONS - ed.questions.length;
  const add = bulkRows.slice(0, room).map(toEditQ);
  ed.questions.push(...add);
  touch();
  renderQuestions();
  $('qz-bulk-text').value = '';
  previewBulk();
  $('qz-bulk').hidden = true;
  toast(`加入了 ${add.length} 題，記得按「儲存」`);
}

/* ---------- 圖片：縮小後上傳 ---------- */
function pickImage(i) {
  uploadFor = i;
  $('qz-file').value = '';
  $('qz-file').click();
}
async function onFile(e) {
  const file = e.target.files?.[0];
  const i = uploadFor;
  if (!file || !ed || !ed.questions[i]) return;
  if (!file.type.startsWith('image/')) return toast('請選擇圖片檔', { tone: 'error' });
  setStatus('圖片上傳中…');
  try {
    const { blob, type, ext } = await shrink(file);
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await db.storage.from(IMG_BUCKET).upload(path, blob, { contentType: type, upsert: false });
    if (error) throw error;
    const { data } = db.storage.from(IMG_BUCKET).getPublicUrl(path);
    if (ed.questions[i]) ed.questions[i].img = data.publicUrl;
    touch();
    renderQuestions();
    toast('圖片已加入，記得按「儲存」');
  } catch (err) {
    setStatus(dirty ? '● 還沒儲存' : '');
    const msg = /Bucket not found/i.test(err?.message || '') ? '圖片空間還沒建立，請先執行 06_題庫.sql' : friendlyError(err);
    toast(`圖片上傳失敗：${msg}`, { tone: 'error', seconds: 6 });
  }
}
/* 縮小到最長邊 1280px，存成 JPEG（GIF 動圖小於 1.5MB 時保留原檔） */
async function shrink(file) {
  if (file.type === 'image/gif' && file.size < 1.5e6) return { blob: file, type: 'image/gif', ext: 'gif' };
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, bad) => {
      const im = new Image();
      im.onload = () => ok(im);
      im.onerror = () => bad(new Error('這張圖片讀不出來，請換成 JPG 或 PNG'));
      im.src = url;
    });
    const scale = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale)), h = Math.max(1, Math.round(img.naturalHeight * scale));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);    // 透明背景改成白色
    g.drawImage(img, 0, 0, w, h);
    const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.85));
    if (!blob) throw new Error('圖片轉檔失敗');
    return { blob, type: 'image/jpeg', ext: 'jpg' };
  } finally {
    URL.revokeObjectURL(url);
  }
}
