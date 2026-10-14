// 後台：📊 成績紀錄（全班對戰）
//  - 👧 每個孩子：依座號統計參加場數、答對、答錯、答對率、搶答平均名次；點一列看每一場
//  - 🎮 每一場：每場的結果、每個人的成績；搶答另外列出每一題全班答對率
//  - 匯出 Excel（.csv，Excel 可以直接打開）、刪除單場、清除半年前的紀錄
import { SEAT_COUNT } from './config.js?v=202610142307';
import { friendlyError } from './db.js?v=202610142307';
import { el, toast } from './ui.js?v=202610142307';

const $ = (id) => document.getElementById(id);
const TABLE = 'game_results';
const MODE = {
  quiz: { icon: '🎯', name: '搶答' },
  tug: { icon: '🪢', name: '拔河' },
  marble: { icon: '🔮', name: '賽跑' },
};
const TEAM_NAMES = ['🍓 草莓兔兔隊', '🧋 奶茶熊熊隊', '🫐 藍莓喵喵隊', '🍵 抹茶狗狗隊'];
const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

let db = null;
let rows = [];
let view = 'seat';
let openSeat = 0;
let loading = false;

const missingTable = (e) => /game_results|42P01|PGRST205|does not exist|Could not find the table/i.test(`${e?.code} ${e?.message}`);
const fail = (what, error) => toast(`${what}失敗：${friendlyError(error)}`, { tone: 'error', seconds: 6 });
const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);

/* ---------- 時間 ---------- */
function termStart(now = new Date()) {
  const y = now.getFullYear(), m = now.getMonth() + 1;
  if (m >= 8) return new Date(y, 7, 1);        // 上學期：8/1 起
  if (m === 1) return new Date(y - 1, 7, 1);   // 1 月還是上學期
  return new Date(y, 1, 1);                    // 下學期：2/1 起
}
function rangeStart() {
  const v = $('rs-range').value;
  if (v === 'all') return null;
  if (v === 'term') return termStart();
  const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - Number(v) + 1);
  return d;
}
function fmtDate(iso, withTime = true) {
  const d = new Date(iso);
  const s = `${d.getMonth() + 1}/${d.getDate()}（${WEEK[d.getDay()]}）`;
  return withTime ? `${s} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : s;
}

/* ---------- 讀資料 ---------- */
export function init(client) {
  db = client;
  $('rs-view-seat').addEventListener('click', () => setView('seat'));
  $('rs-view-game').addEventListener('click', () => setView('game'));
  $('rs-range').addEventListener('change', load);
  $('rs-mode').addEventListener('change', render);
  $('rs-refresh').addEventListener('click', load);
  $('rs-export').addEventListener('click', exportCsv);
  $('rs-purge').addEventListener('click', purge);
  document.querySelector('button.tab[data-tab="results"]')?.addEventListener('click', load);
}

export async function load() {
  if (!db || loading) return;
  loading = true;
  let q = db.from(TABLE).select('id, played_at, mode, source, player_count, players, summary')
    .order('played_at', { ascending: false }).limit(2000);
  const from = rangeStart();
  if (from) q = q.gte('played_at', from.toISOString());
  const { data, error } = await q;
  loading = false;
  $('rs-setup').hidden = !(error && missingTable(error));
  if (error) {
    rows = [];
    render();
    if (!missingTable(error)) fail('讀取成績', error);
    return;
  }
  rows = (data || []).map(clean).filter(Boolean);
  render();
}

/* 資料是白板存進來的，顯示前再整理一次 */
function clean(r) {
  if (!r || !MODE[r.mode]) return null;
  const players = (Array.isArray(r.players) ? r.players : []).map((p) => ({
    seat: Number.isInteger(p?.seat) && p.seat >= 1 && p.seat <= 60 ? p.seat : 0,
    name: String(p?.name ?? '').slice(0, 16),
    team: Number.isInteger(p?.team) && p.team >= 0 && p.team < 4 ? p.team : -1,
    correct: Math.max(0, p?.correct | 0),
    wrong: Math.max(0, p?.wrong | 0),
    answered: Math.max(0, p?.answered | 0),
    score: Math.max(0, p?.score | 0),
    rank: Math.max(0, p?.rank | 0),
  }));
  const summary = r.summary && typeof r.summary === 'object' ? r.summary : {};
  return { id: r.id, at: r.played_at, mode: r.mode, source: String(r.source || ''), players, summary };
}

function visible() {
  const m = $('rs-mode').value;
  return m ? rows.filter((r) => r.mode === m) : rows;
}

function setView(v) {
  view = v;
  $('rs-view-seat').classList.toggle('active', v === 'seat');
  $('rs-view-game').classList.toggle('active', v === 'game');
  $('rs-seat-view').hidden = v !== 'seat';
  $('rs-game-view').hidden = v !== 'game';
  render();
}

function render() {
  const list = visible();
  const kids = new Set();
  list.forEach((r) => r.players.forEach((p) => { if (p.seat) kids.add(p.seat); }));
  $('rs-summary').textContent = list.length
    ? `共 ${list.length} 場，${kids.size} 位小朋友參加過。`
    : '這段期間還沒有比賽紀錄。在「全班對戰」玩完一場，就會自動出現在這裡。';
  if (view === 'seat') renderSeats(list); else renderGames(list);
}

/* ---------- 👧 每個孩子 ---------- */
function seatStats(list) {
  const stats = new Map();
  for (let s = 1; s <= SEAT_COUNT; s++) stats.set(s, { seat: s, name: '', games: [], correct: 0, wrong: 0, quizRanks: [] });
  // list 是新的在前面，第一次看到的暱稱就是最近用的
  list.forEach((r) => r.players.forEach((p) => {
    if (!p.seat) return;
    if (!stats.has(p.seat)) stats.set(p.seat, { seat: p.seat, name: '', games: [], correct: 0, wrong: 0, quizRanks: [] });
    const st = stats.get(p.seat);
    if (!st.name) st.name = p.name;
    st.games.push({ r, p });
    st.correct += p.correct;
    st.wrong += p.wrong;
    if (r.mode === 'quiz' && p.rank) st.quizRanks.push(p.rank);
  }));
  return [...stats.values()].sort((a, b) => a.seat - b.seat);
}

const NUMERIC = new Set(['名次', '場數', '分數', '答對', '答錯', '沒作答', '搶答平均名次']);
const th = (t) => el('th', { class: NUMERIC.has(t) ? 'rs-num' : null }, t);

function rateCell(rate) {
  if (rate == null) return el('td', { class: 'rs-num muted' }, '—');
  const tone = rate >= 80 ? 'good' : rate >= 60 ? 'mid' : 'low';
  return el('td', {}, el('div', { class: 'rs-rate' },
    el('span', { class: `rs-bar ${tone}` }, el('i', { style: `width:${rate}%` })),
    el('b', {}, `${rate}%`)));
}

function renderSeats(list) {
  const box = $('rs-seat-view');
  const stats = seatStats(list);
  const head = el('tr', {}, ...['座號', '最近的暱稱', '場數', '答對', '答錯', '答對率', '搶答平均名次'].map(th));
  const body = [];
  stats.forEach((st) => {
    const n = st.games.length;
    const avgRank = st.quizRanks.length ? (st.quizRanks.reduce((a, b) => a + b, 0) / st.quizRanks.length).toFixed(1) : null;
    const tr = el('tr', {
      class: `rs-seat-row${n ? '' : ' none'}${openSeat === st.seat ? ' open' : ''}`,
      tabindex: n ? '0' : null,
      onclick: () => { if (!n) return; openSeat = openSeat === st.seat ? 0 : st.seat; renderSeats(list); },
      onkeydown: (e) => { if (n && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openSeat = openSeat === st.seat ? 0 : st.seat; renderSeats(list); } },
    },
    el('td', { class: 'rs-seat' }, el('span', {}, st.seat)),
    el('td', {}, n ? st.name : el('span', { class: 'muted' }, '沒有參加')),
    el('td', { class: 'rs-num' }, n || '—'),
    el('td', { class: 'rs-num' }, n ? st.correct : '—'),
    el('td', { class: 'rs-num' }, n ? st.wrong : '—'),
    rateCell(pct(st.correct, st.correct + st.wrong)),
    el('td', { class: 'rs-num' }, avgRank ? `第 ${avgRank} 名` : '—'));
    body.push(tr);
    if (openSeat === st.seat && n) body.push(el('tr', { class: 'rs-detail' }, el('td', { colspan: '7' }, seatDetail(st))));
  });
  box.replaceChildren(
    el('p', { class: 'hint' }, '點一位小朋友，可以看他每一場的成績。答對率＝答對 ÷（答對＋答錯），搶答時沒作答的題目不算。'),
    el('div', { class: 'rs-table-wrap' }, el('table', { class: 'rs-table' }, el('thead', {}, head), el('tbody', {}, body))),
  );
}

function seatDetail(st) {
  const items = st.games.map(({ r, p }) => {
    const M = MODE[r.mode];
    let result;
    if (r.mode === 'quiz') {
      const total = r.summary.total | 0;
      result = `${p.score} 分・第 ${p.rank} 名／${r.players.length} 人・答對 ${p.correct}${total ? ` / ${total}` : ''} 題`;
    } else {
      const team = p.team >= 0 ? TEAM_NAMES[p.team] : '';
      const won = Number.isInteger(r.summary.winner) && r.summary.winner >= 0 && r.summary.winner === p.team;
      result = `${team}${won ? ' 🏆' : ''}・答對 ${p.correct} 題、答錯 ${p.wrong} 題`;
    }
    return el('li', {},
      el('span', { class: 'rs-when' }, fmtDate(r.at)),
      el('span', {}, `${M.icon} ${M.name}`),
      el('span', { class: 'rs-src' }, r.source),
      el('span', { class: 'rs-res' }, result),
      p.name !== st.name ? el('span', { class: 'muted' }, `（暱稱：${p.name}）`) : null);
  });
  return el('ul', { class: 'rs-seat-games' }, items);
}

/* ---------- 🎮 每一場 ---------- */
function gameHeadline(r) {
  if (r.mode === 'quiz') {
    const top = r.players.filter((p) => p.score > 0).sort((a, b) => a.rank - b.rank).slice(0, 3);
    return top.map((p, i) => `${['🥇', '🥈', '🥉'][i]} ${p.name}`).join('　') || '沒有人得分';
  }
  const w = r.summary.winner;
  return Number.isInteger(w) && w >= 0 ? `🏆 ${TEAM_NAMES[w] || r.summary.winnerName || ''} 獲勝` : '🤝 平手';
}

function renderGames(list) {
  const box = $('rs-game-view');
  if (!list.length) { box.replaceChildren(); return; }
  box.replaceChildren(...list.map((r) => {
    const M = MODE[r.mode];
    const det = el('details', { class: 'card rs-game' },
      el('summary', {},
        el('span', { class: 'rs-when' }, fmtDate(r.at)),
        el('span', { class: 'rs-mode' }, `${M.icon} ${M.name}`),
        el('span', { class: 'rs-src' }, r.source),
        el('span', { class: 'muted' }, `${r.players.length} 人`),
        el('span', { class: 'rs-head' }, gameHeadline(r))));
    det.addEventListener('toggle', () => {
      if (det.open && det.children.length === 1) det.append(gameBody(r));
    }, { once: false });
    return det;
  }));
}

function gameBody(r) {
  const parts = [];
  const quiz = r.mode === 'quiz';
  if (!quiz && Array.isArray(r.summary.teams)) {
    parts.push(el('div', { class: 'rs-teams' }, r.summary.teams.map((t, i) => el('span', { class: 'rs-team' },
      `${i === 0 && r.summary.winner >= 0 ? '🏆 ' : ''}${TEAM_NAMES[t.team] || t.name || ''}：答對 ${t.correct | 0} 題（${t.members | 0} 人）${Number.isFinite(t.perCapita) ? `・平均每人 ${t.perCapita} 題` : ''}`))));
  }
  if (quiz && Array.isArray(r.summary.questions) && r.summary.questions.length) {
    parts.push(el('p', { class: 'form-title' }, '每一題全班答對率'));
    parts.push(el('ol', { class: 'rs-qs' }, r.summary.questions.map((q) => {
      const rate = pct(q.right | 0, q.answered | 0);
      const tone = rate == null ? '' : rate >= 80 ? 'good' : rate >= 60 ? 'mid' : 'low';
      return el('li', { class: tone },
        el('span', { class: 'rs-qlabel' }, String(q.label || '')),
        el('span', { class: `rs-bar ${tone}` }, el('i', { style: `width:${rate ?? 0}%` })),
        el('b', {}, rate == null ? '沒人作答' : `${rate}%`),
        el('span', { class: 'muted' }, `${q.right | 0}/${q.answered | 0} 人`));
    })));
  }
  const cols = quiz ? ['名次', '座號', '暱稱', '分數', '答對', '答錯', '沒作答'] : ['名次', '座號', '暱稱', '隊伍', '答對', '答錯'];
  const total = r.summary.total | 0;
  const sorted = [...r.players].sort((a, b) => (a.rank || 99) - (b.rank || 99));
  parts.push(el('div', { class: 'rs-table-wrap' }, el('table', { class: 'rs-table' },
    el('thead', {}, el('tr', {}, cols.map(th))),
    el('tbody', {}, sorted.map((p) => el('tr', {},
      el('td', { class: 'rs-num' }, p.rank || '—'),
      el('td', { class: 'rs-seat' }, p.seat ? el('span', {}, p.seat) : '—'),
      el('td', {}, p.name),
      quiz ? el('td', { class: 'rs-num' }, p.score) : el('td', {}, p.team >= 0 ? TEAM_NAMES[p.team] : '—'),
      el('td', { class: 'rs-num' }, p.correct),
      el('td', { class: 'rs-num' }, p.wrong),
      quiz ? el('td', { class: 'rs-num' }, Math.max(0, total - p.answered)) : null))))));
  parts.push(el('div', { class: 'row-actions' },
    el('button', { class: 'btn ghost small', type: 'button', onclick: () => removeGame(r) }, '🗑️ 刪除這一場')));
  return el('div', { class: 'rs-body' }, parts);
}

async function removeGame(r) {
  if (!confirm(`確定要刪除 ${fmtDate(r.at)} 這一場${MODE[r.mode].name}的成績嗎？刪除後就找不回來了。`)) return;
  const { error } = await db.from(TABLE).delete().eq('id', r.id);
  if (error) return fail('刪除', error);
  rows = rows.filter((x) => x.id !== r.id);
  render();
  toast('已刪除這一場');
}

/* ---------- 清除半年前 ---------- */
async function purge() {
  const before = new Date(); before.setMonth(before.getMonth() - 6);
  const { count, error } = await db.from(TABLE).select('id', { count: 'exact', head: true }).lt('played_at', before.toISOString());
  if (error) return missingTable(error) ? toast('還沒建立成績資料表，請先執行 08_成績紀錄.sql', { tone: 'error', seconds: 6 }) : fail('檢查', error);
  if (!count) return toast('沒有半年前的成績，不用清除 🙂');
  if (!confirm(`有 ${count} 場是半年前（${fmtDate(before.toISOString(), false)}以前）的比賽。\n要全部刪除嗎？刪除後就找不回來了。\n\n想留底的話，可以先選「全部」期間，按「匯出 Excel」。`)) return;
  const { error: e2 } = await db.from(TABLE).delete().lt('played_at', before.toISOString());
  if (e2) return fail('清除', e2);
  toast(`已清除 ${count} 場舊成績`);
  load();
}

/* ---------- 匯出 Excel（CSV，UTF-8 加 BOM，Excel 打開不會亂碼） ---------- */
function cell(v) {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;           // 避免被 Excel 當成公式
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function download(name, lines) {
  const csv = '﻿' + lines.map((r) => r.map(cell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = el('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function exportCsv() {
  const list = visible();
  if (!list.length) return toast('這段期間沒有成績可以匯出');
  const today = new Date();
  const tag = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
  if (view === 'seat') {
    const lines = [['座號', '最近的暱稱', '場數', '答對', '答錯', '答對率(%)', '搶答場數', '搶答平均名次']];
    seatStats(list).forEach((st) => {
      const n = st.games.length;
      const avg = st.quizRanks.length ? (st.quizRanks.reduce((a, b) => a + b, 0) / st.quizRanks.length).toFixed(1) : '';
      lines.push([st.seat, st.name, n, n ? st.correct : '', n ? st.wrong : '', pct(st.correct, st.correct + st.wrong) ?? '', st.quizRanks.length, avg]);
    });
    download(`全班對戰_每個孩子_${tag}.csv`, lines);
  } else {
    const lines = [['日期', '時間', '玩法', '題組', '座號', '暱稱', '隊伍', '名次', '分數', '答對', '答錯', '這場結果']];
    [...list].reverse().forEach((r) => {
      const d = new Date(r.at);
      const date = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
      const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      [...r.players].sort((a, b) => (a.seat || 99) - (b.seat || 99)).forEach((p) => {
        lines.push([date, time, MODE[r.mode].name, r.source, p.seat || '', p.name,
          p.team >= 0 ? TEAM_NAMES[p.team].replace(/^\S+\s/, '') : '', p.rank || '',
          r.mode === 'quiz' ? p.score : '', p.correct, p.wrong, gameHeadline(r)]);
      });
    });
    download(`全班對戰_每一場_${tag}.csv`, lines);
  }
  toast('已下載，用 Excel 打開就可以了');
}
