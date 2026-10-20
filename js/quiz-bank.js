// ============================================================
// 題庫共用工具（老師後台、白板、iPad 都會用）
//  - 題目文字排版：3/4 → 上下排版分數（題組有勾才會）、換行
//  - 檢查題目格式（從資料庫或網路收到的內容都先檢查）
//  - 整批貼上：從 Excel／Google 試算表複製的內容轉成題目
// ============================================================
import { SUPABASE_URL } from './config.js?v=202610202039';

export const SUBJECTS = ['國語', '數學', '英語', '社會', '自然', '其他'];
export const MAX_QUESTIONS = 100;
export const LIMITS = { text: 300, option: 80, title: 40 };
export const IMG_BUCKET = 'quiz-images';
export const IMG_PREFIX = SUPABASE_URL + '/storage/v1/object/public/' + IMG_BUCKET + '/';

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* 題目／選項文字 → 安全的 HTML（先跳脫，再把 3/4 換成上下排版） */
export function richText(s, frac) {
  let h = esc(s);
  if (frac) {
    // 分子可以是數字或 ?／？／□（填空題），分母是數字；2026/10/14 這種日期不會被換掉
    h = h.replace(/(^|[^\d/])(\d{1,4}|[?？□])\s*\/\s*(\d{1,4})(?![\d/])/g, (_, pre, n, d) =>
      pre + '<span class="frac"><span class="num">' + n + '</span><span class="den">' + d + '</span></span>');
  }
  return h.replace(/\n/g, '<br>');
}

/* 只接受放在自己題庫空間裡的圖片 */
export function cleanImg(url) {
  return typeof url === 'string' && url.startsWith(IMG_PREFIX) && url.length < 400 && !/["'<>\s]/.test(url) ? url : '';
}

function str(v, max) {
  return typeof v === 'string' ? v.replace(/\r/g, '').trim().slice(0, max) : '';
}

/* 一題：{ text, img, options:[2～4 個], answer } → 不合格回傳 null */
export function cleanQuestion(q) {
  if (!q || typeof q !== 'object') return null;
  const text = str(q.text, LIMITS.text);
  const img = cleanImg(q.img);
  const options = Array.isArray(q.options) ? q.options.slice(0, 4).map((o) => str(o, LIMITS.option)) : [];
  const answer = Number.isInteger(q.answer) ? q.answer : -1;
  if (!text && !img) return null;
  if (options.length < 2 || options.some((o) => !o)) return null;
  if (answer < 0 || answer >= options.length) return null;
  if (new Set(options).size !== options.length) return null;
  return { text, img, options, answer };
}

/* 一個題組 → 白板／iPad 用的格式 */
export function cleanSet(s) {
  if (!s || typeof s !== 'object') return null;
  const qs = (Array.isArray(s.questions) ? s.questions : []).slice(0, MAX_QUESTIONS).map(cleanQuestion).filter(Boolean);
  if (!qs.length) return null;
  return {
    id: Number.isInteger(s.id) ? s.id : 0,
    title: str(s.title, LIMITS.title) || '我的題組',
    subject: SUBJECTS.includes(s.subject) ? s.subject : '其他',
    frac: s.frac === true,
    shuffle: s.shuffle !== false,
    questions: qs,
  };
}

/* 從題組出一題：選項依設定打亂，回傳遊戲用的格式 */
export function toGameQuestion(q, set) {
  let order = q.options.map((_, i) => i);
  if (set.shuffle) {
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  }
  return {
    custom: true, frac: set.frac, title: set.title, text: q.text, img: q.img,
    options: order.map((i) => q.options[i]),
    correctIndex: order.indexOf(q.answer),
  };
}

/* 抽題機：一輪抽完才重新洗牌，且不會連續抽到同一題 */
export function makeDeck(set) {
  let pile = [], last = -1;
  return function next() {
    if (!pile.length) {
      pile = set.questions.map((_, i) => i);
      for (let i = pile.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pile[i], pile[j]] = [pile[j], pile[i]]; }
      if (pile.length > 1 && pile[pile.length - 1] === last) pile.unshift(pile.pop());
    }
    last = pile.pop();
    return toGameQuestion(set.questions[last], set);
  };
}

/* ============================================================
   整批貼上
   每一行一題，欄位用 Tab 分開（從 Excel／Google 試算表複製就是這樣）：
     題目 ⇥ 選項A ⇥ 選項B ⇥ 選項C ⇥ 選項D ⇥ 正確答案
   正確答案可以寫 A／B／C／D、1／2／3／4，或直接寫正確選項的文字。
   選項可以只有 2～3 個（例如是非題：⭕ ⇥ ❌）。
   ============================================================ */
function splitLine(line) {
  if (line.includes('\t')) return line.split('\t');
  if (line.includes('｜')) return line.split('｜');
  if (line.includes('|')) return line.split('|');
  return null;
}
function parseAnswer(raw, options) {
  const a = raw.trim();
  if (!a) return -1;
  const letter = a.toUpperCase().replace(/[（）()]/g, '');
  const fw = { 'Ａ': 'A', 'Ｂ': 'B', 'Ｃ': 'C', 'Ｄ': 'D', '１': '1', '２': '2', '３': '3', '４': '4' };
  const L = fw[letter] || letter;
  if (/^[A-D]$/.test(L)) return L.charCodeAt(0) - 65;
  if (/^[1-4]$/.test(L)) return Number(L) - 1;
  const exact = options.indexOf(a);
  if (exact >= 0) return exact;
  const part = options.map((o, i) => (o.includes(a) ? i : -1)).filter((i) => i >= 0);
  return part.length === 1 ? part[0] : -1;   // 例如答案寫「對」，選項是「⭕ 對」
}
const HEADER = /^(題目|問題|question)$/i;

export function parseBulk(text) {
  const rows = [], errors = [];
  String(text || '').replace(/\r/g, '').split('\n').forEach((line, i) => {
    if (!line.trim()) return;
    const cells = splitLine(line);
    const n = i + 1;
    if (!cells) { errors.push({ line: n, msg: '找不到分隔（請從試算表整列複製，或用 | 分開）' }); return; }
    const parts = cells.map((c) => c.trim());
    while (parts.length && !parts[parts.length - 1]) parts.pop();
    if (HEADER.test(parts[0] || '')) return;   // 跳過標題列
    if (parts.length < 4) { errors.push({ line: n, msg: '至少要有：題目、2 個選項、正確答案' }); return; }
    const textCell = parts[0];
    const options = parts.slice(1, -1).filter((o) => o);
    const answer = parseAnswer(parts[parts.length - 1], options);
    if (options.length > 4) { errors.push({ line: n, msg: '選項最多 4 個' }); return; }
    if (answer < 0 || answer >= options.length) { errors.push({ line: n, msg: '看不懂正確答案「' + parts[parts.length - 1] + '」（請寫 A～D 或 1～4）' }); return; }
    const q = cleanQuestion({ text: textCell, img: '', options, answer });
    if (!q) {
      const dup = new Set(options).size !== options.length;
      errors.push({ line: n, msg: dup ? '有兩個選項一模一樣' : '題目或選項是空的' });
      return;
    }
    rows.push(q);
  });
  return { rows, errors };
}

/* 示範題組（測試模式用，也當作新增題組時的範例） */
export const DEMO_SET = {
  id: -1, title: '🧪 示範題組：分數小測驗', subject: '數學', frac: true, shuffle: true,
  questions: [
    { text: '3/4 和哪一個分數一樣大？', img: '', options: ['6/8', '4/5', '3/8', '6/4'], answer: 0 },
    { text: '把 12/18 約成最簡分數', img: '', options: ['2/3', '6/9', '4/6', '3/2'], answer: 0 },
    { text: '2/5 = ?/15，? 是多少？', img: '', options: ['6', '12', '3', '5'], answer: 0 },
    { text: '分子分母同時乘以同一個數，分數的大小會？', img: '', options: ['不變', '變大', '變小'], answer: 0 },
    { text: '1/2 比 1/3 大', img: '', options: ['⭕ 對', '❌ 錯'], answer: 0 },
  ],
};
