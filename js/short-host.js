// ============================================================
// ✍️ 小組簡答・白板端（老師）
//  網址：short-host.html?rc=班級編號（從熊熊遊樂園後台「✍️ 小組簡答」進來）
// ============================================================
import { connect, sound, onTap, store, isTestMode } from './live-common.js?v=202611061447';
import { qrSvg } from './qr.js?v=202611061447';
import { RC_COURSE, rcSession } from './rc-mode.js?v=202611061447';
import { groupColor, cleanAnswer, esc } from './short-common.js?v=202611061447';

const $ = (id) => document.getElementById(id);
const S = {
  db: null, uid: null, course: null, groups: [], students: [], sets: [], stars: [1, 2, 3], toMember: true,
  code: '', net: null,
  devices: new Map(),          // 組別 id → iPad 的 id
  phase: 'lobby',              // lobby | q | reveal | end
  set: null, qi: 0, q: null, qCount: 0,
  answers: new Map(),          // 組別 id → { text, at }
  order: [],                   // 翻開時的順序（打亂）
  scores: new Map(),           // 組別 id → 星星 0～3
  scored: false,
  endsAt: 0, timer: 0,
  session: '', totals: new Map(),
};

function show(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
  $('main').scrollTop = 0;
  $('rejoinBtn').classList.toggle('hidden', id === 'sLobby' || id === 'sLogin');
}
function send(event, payload) {
  if (!S.net) return;
  Promise.resolve(S.net.send(event, payload)).catch(() => {});
}
const gById = (id) => S.groups.find((g) => g.id === id);

/* ============================================================
   開始：登入、讀組別和題組、開房間
   ============================================================ */
async function boot() {
  const ses = await rcSession();
  if (!ses || !RC_COURSE) { show('sLogin'); return; }
  S.db = ses.db; S.uid = ses.uid;
  const [{ data: course }, { data: groups }, { data: me }, { data: students }] = await Promise.all([
    S.db.from('rc_courses').select('id, name, owner').eq('id', RC_COURSE).maybeSingle(),
    S.db.from('rc_groups').select('id, name, color, sort').eq('course_id', RC_COURSE).order('sort').order('id'),
    S.db.from('rc_teachers').select('*').eq('user_id', S.uid).maybeSingle(),
    S.db.from('rc_students').select('id, group_id').eq('course_id', RC_COURSE),
  ]);
  S.students = students || [];
  S.toMember = me?.group_to_member !== false;
  if (!course || course.owner !== S.uid) { show('sLogin'); return; }
  S.course = course;
  S.groups = groups || [];
  if (Array.isArray(me?.short_stars) && me.short_stars.length === 3) S.stars = me.short_stars.map((n) => Number(n) || 0);
  document.title = `小組簡答・${course.name}（白板）`;
  $('title').textContent = `✍️ 小組簡答・${course.name}`;
  $('homeBtn').href = 'reading.html';
  await loadSets();
  renderLobby();
  show('sLobby');
  openRoom();
}

async function loadSets() {
  const { data } = await S.db.from('quiz_sets').select('id, title, questions, updated_at')
    .eq('owner', S.uid).eq('qtype', 'short').order('updated_at', { ascending: false });
  S.sets = (data || []).map((s) => ({ ...s, questions: (s.questions || []).filter((q) => q && (q.text || q.img)) }))
    .filter((s) => s.questions.length);
  $('setSel').replaceChildren(
    new Option('✏️ 臨時出一題', ''),
    ...S.sets.map((s, i) => new Option(`📚 ${s.title}（${s.questions.length} 題）`, String(i))));
  if (S.sets.length) $('setSel').value = '0';
  applySet();
}
function applySet() {
  const v = $('setSel').value;
  S.set = v === '' ? null : S.sets[Number(v)];
  $('quickRow').classList.toggle('hidden', !!S.set);
  $('setInfo').textContent = S.set ? `共 ${S.set.questions.length} 題，會照順序出` : (S.sets.length ? '' : '（題庫還沒有簡答題組，可以先臨時出題）');
  $('startBtn').textContent = '▶️ 開始第 1 題';
}
$('setSel').addEventListener('change', applySet);

/* ---------- 房間與連線 ---------- */
function joinUrl() {
  const base = location.href.split('?')[0].replace(/[^/]*$/, '');
  const q = new URLSearchParams({ code: S.code });
  if (isTestMode) q.set('test', '1');
  return `${base}short.html?${q}`;
}
function setNet(st) {
  const d = $('netDot'); d.classList.remove('ok', 'bad');
  if (st === 'SUBSCRIBED') { d.classList.add('ok'); d.textContent = '已連線'; }
  else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED', 'ERR'].includes(st)) { d.classList.add('bad'); d.textContent = '連線中斷，重新連線中…'; setTimeout(openRoom, 4000); }
  else d.textContent = '連線中…';
}
async function openRoom() {
  S.code = store.get('sa-host-code') || String(1000 + Math.floor(Math.random() * 9000));
  store.set('sa-host-code', S.code);
  $('roomCode').textContent = S.code;
  $('joinUrl').textContent = joinUrl().replace(/^https?:\/\//, '').replace(/\?.*$/, '');
  try { $('qrBox').innerHTML = qrSvg(joinUrl(), { level: 'M', margin: 2 }); } catch { $('qrBox').innerHTML = ''; }
  try {
    if (S.net) S.net.close();
    S.net = await connect({ code: S.code, role: 'host', onMessage: handle, onStatus: setNet });
    setNet('SUBSCRIBED');
    send('rollcall', {});             // 白板重新整理：請 iPad 再報到一次
    sendGroups();
  } catch { setNet('ERR'); }
}

/* ============================================================
   收到 iPad 的訊息
   ============================================================ */
function handle(event, p) {
  p = p || {};
  if (typeof p.id !== 'string' || !/^[a-z0-9]{6,40}$/.test(p.id)) return;
  if (event === 'hi') return sendGroups();
  if (event === 'join') return onJoin(p);
  if (event === 'here') return onHere(p);
  if (event === 'answer') return onAnswer(p);
}
function sendGroups() {
  send('groups', { list: S.groups.map((g) => ({ id: g.id, name: g.name, color: g.color, taken: S.devices.has(g.id) })), course: S.course?.name || '' });
}

const checks = new Map();      // 組別 id → { newId, timer }
function onJoin(p) {
  const gid = Number(p.group);
  const g = gById(gid);
  if (!g) { send('nogroup', { to: p.id }); return; }
  const cur = S.devices.get(gid);
  if (cur && cur !== p.id) {
    // 這組已經有 iPad：問問原本那台還在不在；沒回應就交給新的這台（不小心關掉網頁的組別可以回來）
    const old = checks.get(gid);
    if (old) { old.newId = p.id; return; }
    const rec = { newId: p.id };
    rec.timer = setTimeout(() => { checks.delete(gid); S.devices.set(gid, rec.newId); welcome(gid, rec.newId); }, 2500);
    checks.set(gid, rec);
    send('check', { to: cur });
    return;
  }
  for (const [k, v] of S.devices) if (v === p.id && k !== gid) S.devices.delete(k);   // 同一台換組別
  S.devices.set(gid, p.id);
  welcome(gid, p.id);
}
function onHere(p) {
  for (const [gid, rec] of checks) {
    if (S.devices.get(gid) !== p.id) continue;
    clearTimeout(rec.timer); checks.delete(gid);
    send('taken', { to: rec.newId });
  }
}
function welcome(gid, id) {
  const g = gById(gid);
  send('welcome', { to: id, group: gid, name: g.name, color: g.color, sync: syncFor(gid) });
  sound.pop();
  renderLobby(); renderStatus(); sendGroups();
}
function syncFor(gid) {
  if (S.phase === 'q') {
    const a = S.answers.get(gid);
    return { phase: 'q', i: S.qi, total: S.qCount, text: S.q.text, img: S.q.img || '', left: leftSec(), sent: a ? a.text : null };
  }
  if (S.phase === 'reveal') return { phase: 'reveal', sent: S.answers.get(gid)?.text ?? null, stars: S.scored ? (S.scores.get(gid) ?? 0) : null, pts: S.scored ? starPts(S.scores.get(gid) ?? 0) : null };
  if (S.phase === 'end') return { phase: 'end' };
  return { phase: 'lobby' };
}
function onAnswer(p) {
  if (S.phase !== 'q') return;
  const gid = Number(p.group);
  if (S.devices.get(gid) !== p.id) return;           // 不是這組的 iPad
  if (Number(p.i) !== S.qi) return;                  // 上一題的答案
  if (S.answers.has(gid)) { send('got', { to: p.id, i: S.qi }); return; }   // 已經收過（送出後就鎖住）
  const text = cleanAnswer(p.text);
  if (!text) return;
  S.answers.set(gid, { text, at: Date.now() });
  send('got', { to: p.id, i: S.qi });
  sound.pop();
  renderStatus();
  const joined = [...S.devices.keys()].filter((g) => gById(g));
  if (joined.length && joined.every((g) => S.answers.has(g))) setTimeout(() => { if (S.phase === 'q') reveal(); }, 1200);   // 全部送出：自動翻開
}

/* ============================================================
   大廳
   ============================================================ */
function renderLobby() {
  $('groupN').textContent = S.groups.length;
  $('joinedN').textContent = [...S.devices.keys()].filter((g) => gById(g)).length;
  $('noGroups').classList.toggle('hidden', S.groups.length > 0);
  $('lobbyGroups').innerHTML = S.groups.map((g) => {
    const on = S.devices.has(g.id);
    return `<div class="gtile${on ? ' on' : ''}" style="--gc:${groupColor(g)}">${esc(g.name)}<span class="st">${on ? '📱 已加入' : '等待加入…'}</span></div>`;
  }).join('');
  $('startBtn').disabled = !S.groups.length;
}

/* ============================================================
   出題
   ============================================================ */
function newSession() { return new Date().toISOString().slice(0, 16) + '-' + S.code; }
onTap($('startBtn'), () => {
  if (S.set) { S.qi = 0; S.qCount = S.set.questions.length; }
  else {
    const t = $('quickQ').value.trim();
    if (!t) { $('quickQ').focus(); return; }
    S.qi = 0; S.qCount = 1;
  }
  if (!S.session) S.session = newSession();
  askQuestion();
});
function currentQ() {
  if (S.set) { const q = S.set.questions[S.qi]; return { text: q.text || '', img: q.img || '', ref: q.ref || '' }; }
  return { text: $('quickQ').value.trim(), img: '', ref: '' };
}
function leftSec() { return S.endsAt ? Math.max(0, Math.ceil((S.endsAt - Date.now()) / 1000)) : 0; }
function askQuestion() {
  S.q = currentQ();
  S.phase = 'q';
  S.answers = new Map(); S.scores = new Map(); S.scored = false; S.order = [];
  const secs = Number($('timeSel').value) || 0;
  S.endsAt = secs ? Date.now() + secs * 1000 : 0;
  $('qNo').textContent = S.qCount > 1 ? `第 ${S.qi + 1} / ${S.qCount} 題` : '這一題';
  $('qText').textContent = S.q.text;
  $('qImg').classList.toggle('hidden', !S.q.img);
  if (S.q.img) $('qImg').src = S.q.img;
  renderStatus();
  show('sQ');
  send('q', { i: S.qi, total: S.qCount, text: S.q.text, img: S.q.img, left: leftSec() });
  clearInterval(S.timer);
  tick();
  S.timer = setInterval(tick, 250);
}
function tick() {
  const el = $('timer');
  if (!S.endsAt) { el.textContent = ''; return; }
  const s = leftSec();
  el.textContent = `⏳ ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  el.classList.toggle('low', s <= 10);
  if (s <= 0 && S.phase === 'q') reveal();
}
function renderStatus() {
  if (S.phase !== 'q') return;
  $('qStatus').innerHTML = S.groups.map((g) => {
    const on = S.devices.has(g.id), done = S.answers.has(g.id);
    return `<div class="gtile${on ? ' on' : ''}${done ? ' done' : ''}" style="--gc:${groupColor(g)}">${esc(g.name)}<span class="st">${done ? '已送出' : on ? '✏️ 作答中…' : '沒有 iPad'}</span></div>`;
  }).join('');
}
onTap($('collectBtn'), () => { if (S.phase === 'q') reveal(); });

/* ============================================================
   翻開答案（先匿名）→ 評分 → 揭曉組別並記分
   ============================================================ */
const LETTERS = 'ABCDEFGHIJKL';
function reveal() {
  clearInterval(S.timer);
  S.phase = 'reveal';
  send('collect', { i: S.qi });
  const gids = S.groups.map((g) => g.id).filter((id) => S.answers.has(id));
  for (let i = gids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [gids[i], gids[j]] = [gids[j], gids[i]]; }
  S.order = gids;
  $('rNo').textContent = S.qCount > 1 ? `第 ${S.qi + 1} / ${S.qCount} 題` : '這一題';
  $('rText').textContent = S.q.text;
  $('refBtn').classList.toggle('hidden', !S.q.ref);
  $('refBox').classList.add('hidden');
  $('refBox').innerHTML = S.q.ref ? `<b>💡 參考答案：</b>${esc(S.q.ref)}` : '';
  $('scoreBtn').classList.remove('hidden');
  $('scoreBtn').disabled = false;
  $('nextBtn').classList.add('hidden');
  $('saveNote').textContent = '';
  renderAnswers();
  show('sReveal');
  sound.win();
}
function starPts(n) { return n > 0 ? (S.stars[n - 1] || 0) : 0; }
function renderAnswers() {
  const box = $('answers');
  if (!S.order.length) { box.innerHTML = '<div class="card" style="text-align:center;font-size:1.3rem;font-weight:800">這一題沒有組別送出答案</div>'; return; }
  box.innerHTML = S.order.map((gid, k) => {
    const g = gById(gid), a = S.answers.get(gid), st = S.scores.get(gid) ?? -1;
    const label = S.scored ? `<span class="gname">${esc(g?.name || '')}</span>` : `答案 ${LETTERS[k] || k + 1}`;
    const btns = [0, 1, 2, 3].map((n) => `<button class="star-btn${n === 0 ? ' zero' : ''}${st === n ? ' on' : ''}" data-g="${gid}" data-n="${n}" ${S.scored ? 'disabled' : ''}>${n === 0 ? '不給分' : '⭐'.repeat(n)}${n ? `<small> +${starPts(n)}</small>` : ''}</button>`).join('');
    const pts = S.scored && starPts(st) ? `<span class="pts-pop">+${starPts(st)}</span>` : '';
    return `<div class="acard${S.scored ? ' shown' : ''}" style="--gc:${groupColor(g)}; animation-delay:${S.scored ? 0 : k * 0.12}s">
      <div class="alabel">${label}</div>
      <div class="atext">${esc(a.text)}</div>
      <div class="stars">${btns}</div>${pts}</div>`;
  }).join('');
}
$('answers').addEventListener('click', (e) => {
  const b = e.target.closest('.star-btn');
  if (!b || S.scored) return;
  const gid = Number(b.dataset.g), n = Number(b.dataset.n);
  S.scores.set(gid, n);
  sound.pop();
  renderAnswers();
});
onTap($('refBtn'), () => $('refBox').classList.toggle('hidden'));

onTap($('scoreBtn'), async () => {
  if (S.scored || S.phase !== 'reveal') return;
  const unscored = S.order.filter((g) => !S.scores.has(g)).length;
  if (unscored) {
    $('saveNote').textContent = `還有 ${unscored} 張答案還沒評分（不給分也可以按「不給分」）`;
    return;
  }
  $('scoreBtn').disabled = true;
  S.scored = true;
  renderAnswers();
  sound.win();
  // 每組的分數 → 小組分；作答內容 → 簡答紀錄
  const label = `✍️ 小組簡答${S.qCount > 1 ? ` 第${S.qi + 1}題` : ''}`;
  const batch = `short-${Date.now().toString(36)}`;
  const events = S.order.filter((g) => starPts(S.scores.get(g)) !== 0)
    .map((g) => ({ course_id: RC_COURSE, group_id: g, student_id: null, label, points: starPts(S.scores.get(g)), batch, source: 'manual' }));
  if (S.toMember) {         // 小組分也累積到組員的個人分
    for (const ev of events.slice()) {
      const gname = gById(ev.group_id)?.name || '小組';
      S.students.filter((st) => st.group_id === ev.group_id).forEach((st) => events.push({
        course_id: RC_COURSE, student_id: st.id, group_id: null, label: `👥 ${gname}：${label}`.slice(0, 40), points: ev.points, batch, source: 'group',
      }));
    }
  }
  const rows = S.order.map((g) => ({
    course_id: RC_COURSE, session: S.session, set_title: S.set ? S.set.title : '臨時出題', q_index: S.qi,
    question: (S.q.text || '（圖片題）').slice(0, 400), group_id: g, group_name: gById(g)?.name || '',
    answer: S.answers.get(g).text, stars: S.scores.get(g), points: starPts(S.scores.get(g)),
  }));
  S.order.forEach((g) => S.totals.set(g, (S.totals.get(g) || 0) + starPts(S.scores.get(g))));
  S.groups.forEach((g) => {
    const id = S.devices.get(g.id);
    if (id) send('scored', { to: id, stars: S.scores.get(g.id) ?? null, pts: starPts(S.scores.get(g.id) ?? 0), answered: S.answers.has(g.id) });
  });
  $('scoreBtn').classList.add('hidden');
  $('nextBtn').classList.toggle('hidden', !(S.set && S.qi < S.qCount - 1));
  $('saveNote').textContent = '💾 儲存中…';
  try {
    if (events.length) { const { error } = await S.db.from('rc_events').insert(events); if (error) throw error; }
    const { error: e2 } = await S.db.from('rc_short_answers').insert(rows);
    if (e2) throw e2;
    $('saveNote').textContent = `💾 ✓ 已記到小組分（${events.filter((e) => e.group_id).length} 組）${S.toMember ? '，組員的個人分也加了' : ''}`;
  } catch (err) {
    $('saveNote').innerHTML = `⚠️ 沒存好：${esc(err?.message || err)} <button class="btn" id="retrySave">↻ 再存一次</button>`;
    $('retrySave')?.addEventListener('click', async () => {
      const r1 = events.length ? await S.db.from('rc_events').insert(events) : { error: null };
      const r2 = await S.db.from('rc_short_answers').insert(rows);
      $('saveNote').textContent = !r1.error && !r2.error ? '💾 ✓ 已記到小組分' : '⚠️ 還是沒存好，請檢查網路';
    });
  }
});
onTap($('nextBtn'), () => { if (S.set && S.qi < S.qCount - 1) { S.qi++; askQuestion(); } });
onTap($('endBtn'), () => {
  clearInterval(S.timer);
  S.phase = 'end';
  send('end', {});
  const rows = S.groups.map((g) => ({ g, pts: S.totals.get(g.id) || 0 })).sort((a, b) => b.pts - a.pts);
  $('endTable').innerHTML = rows.map(({ g, pts }) => `<tr><td><span style="display:inline-block;width:.8em;height:.8em;border-radius:50%;background:${groupColor(g)};margin-right:.5em"></span>${esc(g.name)}</td><td>${pts > 0 ? '+' : ''}${pts}</td></tr>`).join('');
  show('sEnd');
});
onTap($('againBtn'), () => {
  S.phase = 'lobby'; S.totals = new Map(); S.session = '';
  send('lobby', {});
  renderLobby(); applySet(); show('sLobby');
});

/* ---------- 📲 回來玩 ---------- */
let rejoinTimer = 0;
onTap($('rejoinBtn'), () => {
  try { $('rejoinQr').innerHTML = qrSvg(joinUrl(), { level: 'M', margin: 2 }); } catch { $('rejoinQr').innerHTML = ''; }
  $('rejoinCode').textContent = S.code;
  $('rejoinModal').classList.remove('hidden');
  clearTimeout(rejoinTimer);
  rejoinTimer = setTimeout(() => $('rejoinModal').classList.add('hidden'), 30000);
});
onTap($('rejoinClose'), () => $('rejoinModal').classList.add('hidden'));
onTap($('soundBtn'), () => { sound.on = !sound.on; $('soundBtn').textContent = sound.on ? '🔊' : '🔇'; });
document.addEventListener('pointerdown', () => { if (sound.on) sound.ctx(); }, { once: true });

boot();
