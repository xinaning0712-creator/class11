// 聯絡簿頁：顯示 Canva 設計（連結在後台設定）
import { CLASS_NAME } from './config.js?v=202610191615';
import { configured, classroomDb, friendlyError } from './db.js?v=202610191615';
import { el, startClock, canvaEmbedUrl } from './ui.js?v=202610191615';
import { watchCountdowns, renderPanel } from './countdown.js?v=202610191615';

const $ = (id) => document.getElementById(id);
let current = null;
let ratio = 16 / 9;    // 寬 ÷ 高，後台可設定

// 「16:9」這種文字 → 數字
function parseRatio(text) {
  const m = String(text || '').match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
  return m ? Number(m[1]) / Number(m[2]) : 16 / 9;
}

document.title = `聯絡簿｜${CLASS_NAME}`;
$('class-name').textContent = CLASS_NAME;
startClock($('clock'), $('date'));

function show(message) {
  current = null;
  $('frame').replaceChildren(el('p', { class: 'empty' }, message));
}

async function load() {
  const { data, error } = await classroomDb()
    .from('settings').select('key, value').in('key', ['contact_book_url', 'contact_book_ratio', 'marquee_text']);
  if (error) return show(`讀取失敗：${friendlyError(error)}`);
  const setting = Object.fromEntries(data.map((r) => [r.key, r.value]));
  setMarquee(setting.marquee_text);
  ratio = parseRatio(setting.contact_book_ratio);
  fit();
  const { url, error: bad } = canvaEmbedUrl(setting.contact_book_url);
  if (!url) return show(setting.contact_book_url ? `聯絡簿連結有問題：${bad}` : '老師還沒有設定聯絡簿連結 📒');
  if (url === current) return;   // 同一個連結就不重新載入，避免翻到的頁被跳回第一頁
  current = url;
  // 外面包一層裁切框：Canva 畫面放大幾個像素、邊緣裁掉，左右才不會露出 Canva 的深色底線
  $('frame').replaceChildren(el('div', { class: 'contact-clip' }, el('iframe', {
    src: url,
    title: '聯絡簿',
    loading: 'eager',
    allowfullscreen: true,
    allow: 'fullscreen',
  })));
  fit();
}

// 讓聯絡簿剛好貼齊可用空間，不留黑邊
const BLEED = 4;   // Canva 畫面往外多出幾個像素（被裁掉的部分）
function fit() {
  const frame = $('frame');
  const clip = frame.querySelector('.contact-clip');
  const iframe = frame.querySelector('iframe');
  if (!clip || !iframe) return;
  const w = frame.clientWidth, h = frame.clientHeight;
  const width = Math.floor(Math.min(w, h * ratio));
  const height = Math.floor(width / ratio);
  clip.style.width = `${width}px`;
  clip.style.height = `${height}px`;
  iframe.style.width = `${width + BLEED * 2}px`;
  iframe.style.height = `${height + BLEED * 2}px`;
  iframe.style.margin = `${-BLEED}px`;
}
new ResizeObserver(fit).observe($('frame'));

/* ---------- 📢 跑馬燈（直書，由下往上捲；後台「聯絡簿」可以改文字，一行一則） ---------- */
const MQ_SPEED = 70;      // 每秒移動幾個像素（數字越大跑越快）
let mqText = null;
function setMarquee(raw) {
  const lines = String(raw || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const text = lines.join('　✦　');
  if (text === mqText) return;
  mqText = text;
  $('marquee').hidden = !text;
  layoutMarquee();
  fit();
}
function layoutMarquee() {
  const box = $('marquee');
  if (box.hidden) return;
  const win = box.querySelector('.mq-window'), track = box.querySelector('.mq-track');
  const vertical = getComputedStyle(track).flexDirection === 'column';
  const room = vertical ? win.clientHeight : win.clientWidth;
  // 直的：一個字一格往下排（比瀏覽器的直書排版穩定，emoji、英文也不會疊在一起）
  const unit = el('div', { class: 'mq-unit' });
  const addOnce = () => {
    const seg = typeof Intl !== 'undefined' && Intl.Segmenter ? [...new Intl.Segmenter('zh-Hant', { granularity: 'grapheme' }).segment(mqText + '　✦　')].map((x) => x.segment) : Array.from(mqText + '　✦　');
    if (vertical) unit.append(...seg.map((ch) => el('span', { class: /\s/.test(ch) ? 'mq-ch sp' : 'mq-ch' }, ch)));
    else unit.append(mqText + '　✦　');
  };
  track.replaceChildren(unit);
  addOnce();
  const len = () => (vertical ? unit.offsetHeight : unit.offsetWidth) || 1;
  let guard = 0;
  while (len() < room && guard++ < 20) addOnce();
  track.append(unit.cloneNode(true));
  track.lastChild.setAttribute('aria-hidden', 'true');
  track.style.setProperty('--mq-dur', `${Math.max(6, len() / MQ_SPEED)}s`);
}
let mqResize = 0;
new ResizeObserver(() => { clearTimeout(mqResize); mqResize = setTimeout(layoutMarquee, 200); }).observe($('marquee'));

async function start() {
  if (!configured) return show('還沒連上資料庫：請在 js/config.js 填入 Supabase 網址與公開鑰匙。');
  watchCountdowns((items) => renderPanel($('countdown'), items));
  await load();
  classroomDb().channel('contact')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, load)
    .subscribe();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
}
start();
