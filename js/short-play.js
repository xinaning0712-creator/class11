// ============================================================
// ✍️ 小組簡答・iPad 端（每組一台）
//  輸入房間代碼 → 選組別 → 看題目、打字作答 → 送出（送出後鎖住）→ 看評分
//  不小心關掉網頁：3 小時內重新打開會自動回到同一組；白板也可以叫出「📲 回來玩」
// ============================================================
import { connect, sound, onTap, keep, randomId } from './live-common.js?v=202611051921';
import { groupColor, cleanAnswer, esc, REJOIN_MS, ANSWER_MAX } from './short-common.js?v=202611051921';
import { resetZoom } from './no-zoom.js?v=202611051921';

const $ = (id) => document.getElementById(id);
const P = {
  id: keep.get('sa-id') || randomId(),
  code: '', net: null, gen: 0, group: 0, joined: false, groups: [],
  i: -1, sent: false, endsAt: 0, timer: 0, tries: 0, joinTimer: 0, healTimer: 0, healTries: 0,
};
keep.set('sa-id', P.id);

function show(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
  $('main').scrollTop = 0;
}
function send(event, payload) {
  if (!P.net) return;
  Promise.resolve(P.net.send(event, { ...payload, id: P.id })).catch(() => setNet('ERR'));
}
function setNet(st) {
  const d = $('netDot'); d.classList.remove('ok', 'bad');
  if (st === 'SUBSCRIBED') { d.classList.add('ok'); d.textContent = '已連線'; P.healTries = 0; }
  else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED', 'ERR'].includes(st)) {
    d.classList.add('bad'); d.textContent = '網路不穩，重新連線中…';
    if (P.code && !P.healTimer) {
      const wait = [3000, 6000, 10000][P.healTries] || 15000;
      P.healTimer = setTimeout(() => { P.healTimer = 0; P.healTries++; reconnect(); }, wait);
    }
  } else d.textContent = '連線中…';
}

/* ============================================================
   連線、選組別
   ============================================================ */
async function open(code) {
  P.code = code;
  const gen = ++P.gen;
  try {
    if (P.net) P.net.close();
    P.net = await connect({ code, role: 'player', onMessage: handle, onStatus: (st) => { if (gen === P.gen) setNet(st); } });
  } catch { $('codeMsg').textContent = '連不上網路，請確認 Wi-Fi 後再試一次'; return false; }
  return true;
}
async function reconnect() {
  if (!P.code) return;
  if (!(await open(P.code))) return;
  if (P.group) sendJoin(); else send('hi', {});
}
async function goCode() {
  const code = $('codeIn').value.replace(/\D/g, '').slice(0, 4);
  if (code.length !== 4) { $('codeMsg').textContent = '請輸入白板上的 4 位數代碼'; return; }
  $('codeMsg').textContent = '連線中…';
  if (!(await open(code))) return;
  P.groups = [];
  send('hi', {});
  // 等白板回傳組別；沒回應就再問幾次
  let n = 0;
  const ask = () => {
    if (P.groups.length || P.group) return;
    if (++n >= 5) { $('codeMsg').textContent = '找不到這個房間，請確認白板上的代碼'; return; }
    send('hi', {}); setTimeout(ask, 2000);
  };
  setTimeout(ask, 2000);
}
onTap($('codeBtn'), goCode);
$('codeIn').addEventListener('input', () => { $('codeIn').value = $('codeIn').value.replace(/\D/g, '').slice(0, 4); });
$('codeIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); goCode(); } });

function renderGroups() {
  $('groupList').innerHTML = P.groups.map((g) => `<button class="gbtn${g.taken ? ' taken' : ''}" data-g="${g.id}" style="--gc:${groupColor(g)}">${esc(g.name)}${g.taken ? '<small>已經有 iPad 了</small>' : ''}</button>`).join('')
    || '<p class="msg">老師還沒有分組喔</p>';
}
$('groupList').addEventListener('click', (e) => {
  const b = e.target.closest('[data-g]');
  if (!b) return;
  P.group = Number(b.dataset.g);
  $('groupMsg').textContent = '加入中…';
  sound.pop();
  sendJoin();
});
function sendJoin() {
  P.tries = 0;
  const go = () => {
    if (P.joined) return;
    send('join', { group: P.group });
    if (++P.tries < 5) P.joinTimer = setTimeout(go, 2500);
    else { $('groupMsg').textContent = '加入不了，請找老師幫忙'; }
  };
  P.joined = false;
  clearTimeout(P.joinTimer);
  go();
}

/* ============================================================
   收到白板的訊息
   ============================================================ */
function handle(event, p) {
  p = p || {};
  if (p.to !== undefined && p.to !== P.id) return;
  switch (event) {
    case 'groups':
      P.groups = Array.isArray(p.list) ? p.list : [];
      if (!P.joined && !P.group) { renderGroups(); show('pGroup'); $('codeMsg').textContent = ''; }
      return;
    case 'rollcall': if (P.group) { P.joined = false; sendJoin(); } return;
    case 'check': if (P.joined) send('here', {}); return;
    case 'taken':
      P.joined = false; P.group = 0; clearTimeout(P.joinTimer);
      $('groupMsg').textContent = '這一組已經有一台 iPad 在用了，請確認是不是點錯組別';
      send('hi', {}); show('pGroup');
      return;
    case 'nogroup': P.group = 0; P.joined = false; send('hi', {}); return;
    case 'welcome': return onWelcome(p);
  }
  if (!P.joined) return;
  switch (event) {
    case 'q': showQ(p, null); break;
    case 'got': if (Number(p.i) === P.i) lockSent(); break;
    case 'collect': stopTimer(); if (!P.sent) showResult('⏰', '時間到！大螢幕要翻開答案囉', null); break;
    case 'scored': showScored(p); break;
    case 'lobby': waitScreen('等老師出題…'); break;
    case 'end': showResult('🏁', '這一回合結束了，謝謝你們！', null); keep.set('sa-at', '0'); break;
  }
}
function onWelcome(p) {
  P.joined = true; clearTimeout(P.joinTimer);
  P.group = Number(p.group);
  const color = groupColor(p);
  ['meTag', 'meTag2', 'meTag3'].forEach((id) => { $(id).textContent = `👥 ${p.name}`; $(id).style.setProperty('--gc', color); });
  keep.set('sa-code', P.code); keep.set('sa-group', String(P.group)); keep.set('sa-at', String(Date.now()));
  $('groupMsg').textContent = '';
  $('backBtn').classList.add('hidden');
  sound.pop();
  const s = p.sync || {};
  if (s.phase === 'q') showQ(s, s.sent);
  else if (s.phase === 'reveal') {
    if (s.stars !== null && s.stars !== undefined) showScored({ stars: s.stars, pts: s.pts, answered: s.sent !== null });
    else showResult('👀', '老師正在大螢幕上看答案…', s.sent);
  } else if (s.phase === 'end') showResult('🏁', '這一回合結束了', null);
  else waitScreen('等老師出題…');
}
function waitScreen(t) { stopTimer(); $('waitText').textContent = t; show('pWait'); }

/* ---------- 作答 ---------- */
const DRAFT = () => `sa-draft-${P.code}-${P.group}-${P.i}`;
function showQ(q, sentText) {
  const newQ = Number(q.i) !== P.i;
  P.i = Number(q.i);
  $('qNo').textContent = q.total > 1 ? `第 ${P.i + 1} / ${q.total} 題` : '';
  $('qText').textContent = q.text || '';
  $('qImg').classList.toggle('hidden', !q.img);
  if (q.img) $('qImg').src = q.img;
  P.sent = false;
  if (newQ || sentText) $('answer').value = sentText ?? (keep.get(DRAFT()) || '');
  if (sentText) lockSent(); else unlock();
  startTimer(Number(q.left) || 0);
  show('pQ');
  updateCount();
}
function unlock() {
  $('answer').disabled = false;
  $('sendBtn').classList.remove('hidden');
  $('sentBox').classList.add('hidden');
  updateCount();
}
function lockSent() {
  P.sent = true;
  $('answer').disabled = true;
  $('sendBtn').classList.add('hidden');
  $('sentBox').classList.remove('hidden');
}
function updateCount() {
  const n = Array.from($('answer').value).length;
  $('count').textContent = `${n} / ${ANSWER_MAX}`;
  $('sendBtn').disabled = !cleanAnswer($('answer').value) || P.sent;
}
$('answer').addEventListener('input', () => { updateCount(); keep.set(DRAFT(), $('answer').value); });
onTap($('sendBtn'), () => { if (!$('sendBtn').disabled) $('sureModal').classList.remove('hidden'); });
onTap($('sureNo'), () => $('sureModal').classList.add('hidden'));
onTap($('sureYes'), () => {
  $('sureModal').classList.add('hidden');
  const text = cleanAnswer($('answer').value);
  if (!text) return;
  $('sendBtn').disabled = true;
  let n = 0;
  const go = () => {
    if (P.sent) return;
    send('answer', { group: P.group, i: P.i, text });
    if (++n < 5) setTimeout(go, 2000);
  };
  go();
  sound.correct();
});

function startTimer(left) {
  stopTimer();
  if (!left) { $('timer').textContent = ''; return; }
  P.endsAt = Date.now() + left * 1000;
  const tick = () => {
    const s = Math.max(0, Math.ceil((P.endsAt - Date.now()) / 1000));
    $('timer').textContent = `⏳ ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    if (s <= 0) stopTimer();
  };
  tick(); P.timer = setInterval(tick, 250);
}
function stopTimer() { clearInterval(P.timer); P.timer = 0; }

/* ---------- 結果 ---------- */
function showResult(big, sub, myText) {
  $('resultBig').textContent = big;
  $('resultSub').textContent = sub;
  $('myAnswer').classList.toggle('hidden', !myText);
  $('myAnswer').textContent = myText ? `我們的答案：${myText}` : '';
  show('pResult');
}
function showScored(p) {
  stopTimer();
  if (!p.answered) return showResult('📝', '這一題你們沒有送出答案，下一題加油！', null);
  const n = Number(p.stars) || 0;
  if (n > 0) { showResult('⭐'.repeat(n), `得到 ${n} 顆星！小組分 +${p.pts}`, null); sound.win(); }
  else showResult('💪', '這一題沒有得分，下一題再努力！', null);
}

/* ============================================================
   自動回到剛剛的組別
   ============================================================ */
const urlCode = (new URLSearchParams(location.search).get('code') || '').replace(/\D/g, '').slice(0, 4);
const lastCode = (keep.get('sa-code') || '').replace(/\D/g, '');
const lastGroup = Number(keep.get('sa-group')) || 0;
const fresh = lastCode.length === 4 && lastGroup && Date.now() - Number(keep.get('sa-at') || 0) < REJOIN_MS;
$('codeIn').value = urlCode || (fresh ? lastCode : '');
if (fresh && (!urlCode || urlCode === lastCode)) {
  P.group = lastGroup;
  open(lastCode).then((ok) => { if (ok) sendJoin(); });
  $('backBtn').classList.remove('hidden');
} else if (urlCode) {
  goCode();
}
onTap($('backBtn'), async () => {
  P.group = lastGroup; $('codeIn').value = lastCode;
  if (await open(lastCode)) sendJoin();
});
// 切到別的 App 再回來：重新連線
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); return; }
  if (hiddenAt && Date.now() - hiddenAt > 2000 && P.joined) { P.joined = false; reconnect(); }
  hiddenAt = 0;
});
document.addEventListener('pointerdown', () => { if (sound.on) sound.ctx(); }, { once: true });
void resetZoom;
