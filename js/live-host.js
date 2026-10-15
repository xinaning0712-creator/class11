// ============================================================
// 分數大冒險・全班連線版：白板（老師）端
//  - 開房間（四位數代碼），孩子用 iPad 加入
//  - 三種玩法：全班拔河 / 搶答大挑戰 / 玻璃球賽跑
//  - 老師端負責計分與廣播；孩子端只送「答對／答錯」或「選了哪一個」
// ============================================================
import {
  LIVE, TEAMS, CHOICES, TRAP_LABEL, makeQuestion, promptHTML, typeLabel, fracHTML, esc, cleanName,
  optionHTML, loadSets, toGameQuestion, cleanSeat,
  connect, sound, onTap, replayAnim, tween, randInt, shuffle, isTestMode, store
} from './live-common.js?v=202610151259';
import { qrSvg } from './qr.js?v=202610151259';
import { buildTrack, planRace, playRace, setMedal } from './live-marble.js?v=202610151259';
import { music } from './live-music.js?v=202610151259';

const $ = id => document.getElementById(id);
const MAX_PLAYERS = 40;

/* ── 狀態 ── */
const S = {
  code:'', net:null, mode:'tug', level:'easy', teamN:3, quizN:LIVE.QUIZ_COUNT,
  sets:[], src:null, inOrder:true,   // src：選用的題組（null = 自動出分數題）
  phase:'lobby',               // lobby | play | end
  players:new Map(),           // id → {id,name,team,correct,wrong,score,last}
  kicked:new Set(),
  game:null, timers:new Set()
};
const isTeamMode = m => m==='tug' || m==='marble';
const teamCount  = m => m==='tug' ? 2 : S.teamN;
const validId = id => typeof id==='string' && /^[a-z0-9]{6,40}$/.test(id);

/* ── 計時器集中管理：換場時一次清乾淨 ── */
function every(fn,ms){ const id=setInterval(fn,ms); S.timers.add({id,i:true}); return id; }
function later(fn,ms){ const rec={i:false}; rec.id=setTimeout(()=>{ S.timers.delete(rec); fn(); },ms); S.timers.add(rec); return rec.id; }
function clearTimers(){ S.timers.forEach(t=>t.i?clearInterval(t.id):clearTimeout(t.id)); S.timers.clear(); }

function showScreen(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.toggle('active', s.id===id));
  $('main').scrollTop=0;
}
function send(event,payload){
  if(!S.net) return;
  Promise.resolve(S.net.send(event,payload)).catch(()=>{});
}

/* ============================================================
   開房間與連線
   ============================================================ */
function joinUrl(){
  const base=location.href.split('?')[0].replace(/[^/]*$/,'');
  return base+'live.html'+(isTestMode?'?test=1':'');
}
/* QR code 裡放「加入網址＋房間代碼」，孩子掃完只要輸入暱稱 */
function renderQR(){
  const url=joinUrl()+(isTestMode?'&':'?')+'code='+S.code;
  try{ $('qrBox').innerHTML=qrSvg(url,{ level:'M', margin:2 }); }
  catch(e){ $('qrBox').innerHTML=''; }
}
function setNet(st){
  const dot=$('netDot');
  dot.classList.remove('ok','bad');
  if(st==='SUBSCRIBED'){ dot.classList.add('ok'); dot.textContent='已連線'; $('retryBtn').classList.add('hidden'); }
  else if(st==='CHANNEL_ERROR'||st==='TIMED_OUT'||st==='CLOSED'||st==='ERR'){ dot.classList.add('bad'); dot.textContent='連線中斷'; $('retryBtn').classList.remove('hidden'); }
  else dot.textContent='連線中…';
}
async function openRoom(){
  S.code = store.get('fr-host-code') || String(randInt(1000,9999));
  store.set('fr-host-code', S.code);
  $('roomCode').textContent=S.code;
  $('joinUrl').textContent=joinUrl().replace(/^https?:\/\//,'');
  renderQR();
  $('testBadge').classList.toggle('hidden', !isTestMode);
  setNet('CONNECTING');
  try{
    if(S.net) S.net.close();
    S.net=await connect({ code:S.code, role:'host', onMessage:handle, onStatus:setNet });
    setNet('SUBSCRIBED');
    send('rollcall',{});            // 老師重新整理頁面時，請已經在房間裡的 iPad 再報到一次
    selfTest();
  }catch(e){ setNet('ERR'); }
}
/* iPad 路徑自我檢查：老師端用和 iPad 一樣的方式送一則訊息給自己，看收不收得到 */
let pingTimer=null, pinged=false;
function pingOK(){ pinged=true; clearTimeout(pingTimer); $('pathCheck').textContent='✅ iPad 連線路徑正常'; $('pathCheck').className='path ok'; }
async function selfTest(){
  if(!S.net||!S.net.selfTest) return;           // 測試模式不需要
  pinged=false; $('pathCheck').textContent='🔎 檢查 iPad 連線路徑…'; $('pathCheck').className='path';
  try{ await S.net.selfTest(); }catch(e){}
  pingTimer=setTimeout(()=>{ if(!pinged){ $('pathCheck').textContent='⚠️ iPad 會改用備用連線（一樣能玩，人多時可能較慢）'; $('pathCheck').className='path warn'; } },6000);
}
onTap($('retryBtn'), openRoom);

/* ============================================================
   收到 iPad 的訊息
   ============================================================ */
function handle(event,p){
  if(event==='ping'){ pingOK(); return; }
  if(!p||!validId(p.id)) return;
  if(event==='join') onJoin(p);
  else if(event==='ans') onAns(p);
  else if(event==='pick') onPick(p);
  else if(event==='leave') onLeave(p);
  else if(event==='here') onHere(p);
}

function uniqueName(name,selfId){
  const taken=new Set(); S.players.forEach(pl=>{ if(pl.id!==selfId) taken.add(pl.name); });
  if(!taken.has(name)) return name;
  for(let i=2;i<100;i++){ const n=Array.from(name).slice(0,LIVE.NAME_MAX-1).join('')+i; if(!taken.has(n)) return n; }
  return name+'?';
}
function teamSizes(){
  const c=new Array(teamCount(S.mode)).fill(0);
  S.players.forEach(pl=>{ if(pl.team>=0&&pl.team<c.length) c[pl.team]++; });
  return c;
}
function placeInSmallest(pl){
  const c=teamSizes(); let best=0;
  for(let i=1;i<c.length;i++) if(c[i]<c[best]) best=i;
  pl.team=best;
}
function assignTeams(reshuffle){
  if(!isTeamMode(S.mode)){ return; }
  const n=teamCount(S.mode);
  if(reshuffle){
    shuffle(Array.from(S.players.values())).forEach((pl,i)=>{ pl.team=i%n; });
  }else{
    S.players.forEach(pl=>{ if(pl.team>=n) pl.team=-1; });
    S.players.forEach(pl=>{ if(pl.team<0) placeInSmallest(pl); });
    // 人數差超過 1 時，從最多的隊伍移一個人到最少的隊伍（例如 2 隊改成 3 隊）
    for(let guard=0;guard<100;guard++){
      const c=teamSizes(); let mx=0, mn=0;
      c.forEach((v,i)=>{ if(v>c[mx]) mx=i; if(v<c[mn]) mn=i; });
      if(c[mx]-c[mn]<=1) break;
      const mover=Array.from(S.players.values()).reverse().find(pl=>pl.team===mx);
      mover.team=mn;
    }
  }
}
function setPayload(){ return S.src ? { title:S.src.title, frac:S.src.frac, shuffle:S.src.shuffle, questions:S.src.questions } : null; }
function teamMap(){ const m={}; S.players.forEach(pl=>{ m[pl.id]=pl.team; }); return m; }

let teamsTimer=null;
function broadcastTeams(){         // 大廳裡分隊有變動時通知 iPad（合併成一則，避免訊息太多）
  clearTimeout(teamsTimer);
  teamsTimer=setTimeout(()=>send('teams',{ mode:S.mode, teamN:teamCount(S.mode), map:isTeamMode(S.mode)?teamMap():{} }),400);
}

function onJoin(p){
  if(S.kicked.has(p.id)){ send('kick',{to:p.id}); return; }
  let pl=S.players.get(p.id);
  const name=cleanName(p.name)||'小勇者';
  const seat=cleanSeat(p.seat);
  // 同一個座號只能有一個人（成績才對得起來）
  if(seat){
    const other=Array.from(S.players.values()).find(o=>o.id!==p.id&&o.seat===seat);
    if(other){ checkSeat(other,p); return; }
  }
  if(pl){
    if(seat&&pl.seat!==seat) pl.seat=seat;
    if(S.phase==='lobby'&&name!==pl.name) pl.name=uniqueName(name,pl.id);
    if(S.phase==='lobby') renderLobby();
  }
  else{
    if(S.players.size>=MAX_PLAYERS){ send('full',{to:p.id}); return; }
    pl={ id:p.id, name:uniqueName(name,p.id), seat, team:-1, correct:0, wrong:0, answered:0, score:0, streak:0, last:0 };
    S.players.set(p.id,pl);
    if(isTeamMode(S.mode)) placeInSmallest(pl);
    sound.pop();
  }
  send('welcome',{ to:pl.id, name:pl.name, sync:syncFor(pl) });
  if(S.phase==='lobby'){ renderLobby(); broadcastTeams(); }
  else if(S.phase==='play') onLateJoin(pl);
}
/* 同一個座號又有人加入：先問原本那台 iPad 還在不在
   ・還在（回答 here）→ 新的這台是點錯座號，請他確認
   ・沒回應 → 原本那台已經關掉了，把成績和隊伍交給新的這台（不小心關掉網頁的孩子可以接著玩） */
const seatChecks=new Map();     // 原本的 id → { newP, timer }
function checkSeat(old,newP){
  const rec=seatChecks.get(old.id);
  if(rec){ rec.newP=newP; return; }
  const r={ newP };
  r.timer=setTimeout(()=>{ seatChecks.delete(old.id); takeOver(old.id, r.newP); },2500);
  seatChecks.set(old.id,r);
  send('check',{ to:old.id });
}
function onHere(p){
  const rec=seatChecks.get(p.id); if(!rec) return;
  clearTimeout(rec.timer); seatChecks.delete(p.id);
  send('seat-taken',{ to:rec.newP.id });
}
function takeOver(oldId,newP){
  const old=S.players.get(oldId);
  if(!old||S.kicked.has(newP.id)||S.players.has(newP.id)){ onJoin(newP); return; }
  S.players.delete(oldId);
  const pl=Object.assign({}, old, { id:newP.id, last:0 });
  if(S.phase==='lobby') pl.name=uniqueName(cleanName(newP.name)||old.name, pl.id);
  S.players.set(pl.id,pl);
  const g=S.game;
  if(g&&g.mode==='quiz'&&g.answers&&g.answers.has(oldId)){ g.answers.set(pl.id,g.answers.get(oldId)); g.answers.delete(oldId); }
  send('welcome',{ to:pl.id, name:pl.name, sync:syncFor(pl) });
  if(S.phase==='lobby'){ renderLobby(); broadcastTeams(); }
  else if(S.phase==='play') onLateJoin(pl);
}
function onLeave(p){
  if(S.phase!=='lobby') return;     // 遊戲中重新整理會先離開再加入，所以只在大廳時移除
  if(S.players.delete(p.id)){ renderLobby(); broadcastTeams(); }
}

/* 給（重新）加入的 iPad 目前進度 */
function syncFor(pl){
  const g=S.game;
  if(S.phase==='play'&&g){
    if(g.mode==='marble'&&!g.collecting) return { phase:'race' };
    if(g.mode==='quiz'){
      if(g.qPhase==='q') return { phase:'quiz-q', i:g.i, total:g.qs.length, q:publicQ(g.qs[g.i]), left:Math.max(1,Math.ceil((g.endsAt-performance.now())/1000)), score:pl.score };
      return { phase:'quiz-wait', total:g.qs.length, score:pl.score };
    }
    return { phase:'play', mode:g.mode, level:S.level, set:g.set, team:pl.team, teamN:teamCount(g.mode),
             left:Math.max(1,Math.ceil((g.endsAt-performance.now())/1000)), correct:pl.correct };
  }
  return { phase:'lobby', mode:S.mode, team:isTeamMode(S.mode)?pl.team:-1, teamN:teamCount(S.mode) };
}

/* ============================================================
   大廳
   ============================================================ */
function chipHTML(pl){ return '<button class="chip" data-id="'+esc(pl.id)+'">'+esc(pl.name)+'</button>'; }   // 白板只顯示暱稱，不顯示座號
const bySeat=(a,b)=>(a.seat||99)-(b.seat||99);
function renderLobby(){
  $('playerCount').textContent=S.players.size;
  $('startBtn').disabled=S.players.size===0;
  const box=$('lobbyPlayers');
  $('reshuffleBtn').classList.toggle('hidden', !isTeamMode(S.mode));
  if(!S.players.size){ box.innerHTML='<div class="empty-hint">等待大家加入中…</div>'; return; }
  const list=Array.from(S.players.values());
  if(isTeamMode(S.mode)){
    const n=teamCount(S.mode);
    let h='<div class="team-cols" style="grid-template-columns:repeat('+n+',1fr)">';
    for(let t=0;t<n;t++){
      const T=TEAMS[t], mem=list.filter(pl=>pl.team===t);
      h+='<div class="team-col" style="border-color:'+T.color+';background:'+T.light+'"><h3 style="color:'+T.deep+'">'+T.emoji+' '+T.name+'（'+mem.length+'）</h3><div class="chips">'+mem.map(chipHTML).join('')+'</div></div>';
    }
    box.innerHTML=h+'</div>';
  }else{
    box.innerHTML='<div class="chips" style="margin:8px 0 12px">'+list.map(chipHTML).join('')+'</div>';
  }
}
/* 點名字 → 請他重新取名（避免不適當的暱稱） */
onTap($('lobbyPlayers'), (e,target)=>{
  const chip=target.closest('[data-id]'); if(!chip) return;
  const pl=S.players.get(chip.getAttribute('data-id')); if(!pl) return;
  confirmBox('要把「'+esc(pl.name)+'」移出房間嗎？<br><small>（例如暱稱不適當，或同一個人重複加入）他可以重新加入。</small>', ()=>{
    S.players.delete(pl.id);
    send('kick',{to:pl.id});
    renderLobby(); broadcastTeams();
  });
});
onTap($('reshuffleBtn'), ()=>{ assignTeams(true); renderLobby(); broadcastTeams(); sound.pop(); });

document.querySelectorAll('.mode-btn').forEach(btn=>onTap(btn,()=>{
  S.mode=btn.dataset.mode;
  document.querySelectorAll('.mode-btn').forEach(b=>b.classList.toggle('selected',b===btn));
  $('optMarble').classList.toggle('hidden', S.mode!=='marble');
  applySrc();
  assignTeams(false); renderLobby(); broadcastTeams(); sound.pop();
}));
function radio(selector, onPick){
  document.querySelectorAll(selector).forEach(btn=>onTap(btn,()=>{
    document.querySelectorAll(selector).forEach(b=>b.classList.toggle('selected',b===btn));
    onPick(btn); sound.pop();
  }));
}
radio('.level-btn', b=>{ S.level=b.dataset.level; });

/* ── 題目來源：自動出分數題，或老師在後台建的題組 ── */
async function refreshSets(){
  $('srcSel').disabled=true;
  S.sets=await loadSets();
  const keep=S.src&&S.src.id;
  const sel=$('srcSel');
  sel.innerHTML='<option value="auto">🎲 自動出題：分數擴分約分</option>'
    + S.sets.map((s,i)=>'<option value="'+i+'">📚 '+esc(s.title)+'（'+s.questions.length+' 題）</option>').join('');
  const idx=S.sets.findIndex(s=>s.id===keep);
  sel.value= idx>=0 ? String(idx) : 'auto';
  sel.disabled=false;
  applySrc();
}
function applySrc(){
  const v=$('srcSel').value;
  S.src= v==='auto' ? null : S.sets[parseInt(v,10)]||null;
  $('optLevel').classList.toggle('hidden', !!S.src);
  $('optQuiz').classList.toggle('hidden', S.mode!=='quiz'||!!S.src);
  $('optOrder').classList.toggle('hidden', S.mode!=='quiz'||!S.src);
  $('srcInfo').textContent= S.src ? S.src.subject+'・'+S.src.questions.length+' 題'+(S.mode==='quiz'?'':'（每個人隨機抽題）') : '';
}
$('srcSel').addEventListener('change', ()=>{ applySrc(); sound.pop(); });
onTap($('srcRefresh'), refreshSets);
radio('.order-btn', b=>{ S.inOrder=b.dataset.order==='1'; });
radio('.teamn-btn', b=>{ S.teamN=parseInt(b.dataset.n,10); assignTeams(false); renderLobby(); broadcastTeams(); });
radio('.qn-btn',    b=>{ S.quizN=parseInt(b.dataset.n,10); });

onTap($('startBtn'), startGame);
onTap($('againBtn'), startGame);
onTap($('lobbyBtn'), backToLobby);

function startGame(){
  if(!S.players.size) return;
  clearTimers(); music.stop();
  S.players.forEach(pl=>{ pl.correct=0; pl.wrong=0; pl.answered=0; pl.score=0; pl.streak=0; pl.combo=0; pl.wrongRun=0; pl.lockUntil=0; pl.last=0; });
  assignTeams(false);
  S.phase='play';
  if(S.mode==='tug') startTug();
  else if(S.mode==='marble') startMarble();
  else startQuiz();
}
function backToLobby(){
  clearTimers(); music.stop();
  S.phase='lobby'; S.game=null;
  assignTeams(false);
  renderLobby(); showScreen('scrLobby');
  send('lobby',{ mode:S.mode, teamN:teamCount(S.mode), map:isTeamMode(S.mode)?teamMap():{} });
}
function onLateJoin(pl){
  const g=S.game; if(!g) return;
  if(g.mode==='tug') renderTugChips();
  if(g.mode==='quiz') renderAnswered();
}

/* ============================================================
   🪢 全班拔河
   ============================================================ */
const STEP = 336 / LIVE.TUG_LIMIT;     // 每一格在畫面上的距離（終點線在中線左右 336）
function drawBunting(){
  const g=$('bunting'); if(g.childNodes.length) return;
  const colors=['#f28bab','#fff','#d9b08c','#ffc7d6'];
  const yAt=x=>22+26*Math.sin(Math.PI*((((x%600)+600)%600)/600));
  let d='', h='';
  for(let x=-1200;x<=2400;x+=20) d+=(d?' L':'M')+x+' '+yAt(x).toFixed(1);
  h+='<path d="'+d+'" fill="none" stroke="#b88d6c" stroke-width="3"/>';
  let i=0;
  for(let x=-1190;x<=2390;x+=44,i++){
    const y=yAt(x);
    h+='<path d="M'+(x-13)+' '+y.toFixed(1)+' L'+(x+13)+' '+y.toFixed(1)+' L'+x+' '+(y+26).toFixed(1)+' Z" fill="'+colors[i%4]+'" stroke="#e2c2ab" stroke-width="1.5"/>';
  }
  g.innerHTML=h;
}
function drawTugTeams(){
  [[0,[58,128,198]],[1,[1002,1072,1136]]].forEach(([t,xs])=>{
    $('fig'+t).innerHTML=xs.map((x,i)=>'<text class="puller p'+t+'" x="'+x+'" y="262" text-anchor="middle" font-size="80" style="animation-delay:-'+(i*0.3).toFixed(1)+'s">'+TEAMS[t].animal+'</text>').join('');
    const sc=$('tugScore'+t), T=TEAMS[t];
    sc.style.borderColor=T.color; sc.style.color=T.deep;
    sc.querySelector('.tname').textContent=T.emoji+' '+T.name;
    $('finishLabel'+t).textContent=T.emoji+' 終點';
    const box=$('tugBox'+t); box.style.borderColor=T.color; box.style.background=T.light;
  });
}
function renderTugChips(){
  const g=S.game;
  for(let t=0;t<2;t++){
    const mem=Array.from(S.players.values()).filter(pl=>pl.team===t);
    $('tugBox'+t).querySelector('.chips').innerHTML=mem.map(pl=>
      '<span class="chip" data-id="'+esc(pl.id)+'" style="--fl:'+TEAMS[t].light+';border-color:'+TEAMS[t].color+'">'+esc(pl.name)+'<span class="cnt">'+pl.correct+'</span></span>').join('');
  }
  if(g) g.chips=new Map(Array.from(document.querySelectorAll('#scrTug .chip')).map(c=>[c.getAttribute('data-id'),c]));
}
function setRope(pos){
  const g=S.game;
  if(g.cancel) g.cancel();
  const target=pos*STEP;
  g.cancel=tween(g.ropeX, target, 450, x=>{ g.ropeX=x; $('ropeGroup').setAttribute('transform','translate('+x.toFixed(1)+',0)'); });
}
function startTug(){
  drawBunting(); drawTugTeams();
  const g=S.game={ mode:'tug', pos:0, ropeX:0, counts:[0,0], running:true, cancel:null,
                   endsAt:performance.now()+LIVE.TUG_SECONDS*1000, left:LIVE.TUG_SECONDS, chips:null };
  $('ropeGroup').setAttribute('transform','translate(0,0)');
  [0,1].forEach(t=>{ $('tugScore'+t).querySelector('b').textContent='0'; $('finish'+t).classList.remove('danger'); });
  renderTugChips(); renderTimer('tugTimer', g.left);
  showScreen('scrTug');
  g.set=setPayload();
  send('start',{ mode:'tug', level:S.level, set:g.set, left:LIVE.TUG_SECONDS, teamN:2, map:teamMap() });
  music.play('think');
  every(()=>{
    const left=Math.max(0,Math.ceil((g.endsAt-performance.now())/1000));
    if(left!==g.left){ g.left=left; renderTimer('tugTimer',left); if(left===10) music.speed(1.3); }
    if(left<=0) endTeamGame(g.pos<0?0:g.pos>0?1:-1);
  },250);
}
function renderTimer(id,left){ const el=$(id); el.textContent='⏳ '+left; el.classList.toggle('danger',left<=10); }

/* ============================================================
   🔮 玻璃球賽跑
   ・答題時間：玻璃球在起點待命，看不出哪隊領先（大家專心答題）
   ・時間到（或老師按「開始賽跑」）：3、2、1、GO！彎彎曲曲的賽道比賽
   ・速度看「每隊平均每人答對幾題」，人數不同也公平
   ============================================================ */
function marbleLegend(n){
  let h='';
  for(let i=0;i<n;i++){ const T=TEAMS[i]; h+='<span id="mbLeg'+i+'" class="mb-leg" style="border-color:'+T.color+';color:'+T.deep+'">'+T.emoji+' '+T.name+'<b></b></span>'; }
  $('mbLegend').innerHTML=h;
}
function startMarble(){
  const n=S.teamN;
  const g=S.game={ mode:'marble', n, counts:new Array(n).fill(0), power:new Array(n).fill(0), total:0, running:true, collecting:true, racing:false,
                   endsAt:performance.now()+LIVE.MARBLE_SECONDS*1000, left:LIVE.MARBLE_SECONDS, stopRace:null };
  g.track=buildTrack($('mbSvg'), n);
  $('mbSvg').classList.remove('racing');
  marbleLegend(n);
  $('mbTicker').innerHTML='';
  $('mbTotal').textContent='0';
  $('mbBanner').textContent='🔮 收集能量中！答對越多，玻璃球跑越快';
  $('mbBanner').className='mb-banner';
  $('mbCount').classList.add('hidden');
  $('mbStop').textContent='🏁 現在開始賽跑';
  $('mbStop').disabled=false;
  $('mbTimer').classList.remove('hidden');
  renderTimer('mbTimer',g.left);
  showScreen('scrMarble');
  g.set=setPayload();
  send('start',{ mode:'marble', level:S.level, set:g.set, left:LIVE.MARBLE_SECONDS, teamN:n, map:teamMap() });
  music.play('think');
  every(()=>{
    const left=Math.max(0,Math.ceil((g.endsAt-performance.now())/1000));
    if(left!==g.left){ g.left=left; renderTimer('mbTimer',left); if(left===10) music.speed(1.3); }
    if(left<=0) startRace();
  },250);
}
function addTicker(pl,combo){
  const el=document.createElement('span');
  el.className='tick'+(combo?' hot':'');
  el.textContent=combo ? '🔥 '+pl.name+' 連對！' : '⭐ '+pl.name+' 答對了！';
  const box=$('mbTicker'); box.insertBefore(el, box.firstChild);
  while(box.children.length>8) box.removeChild(box.lastChild);
}
/* 每隊平均每人答對幾題 */
function perCapita(g){
  const size=teamSizes();
  return g.power.map((c,i)=>c/Math.max(1,size[i]||0));   // 含連對加成
}
function startRace(){
  const g=S.game; if(!g||g.mode!=='marble'||!g.collecting) return;
  g.collecting=false; g.racing=true;
  clearTimers(); music.stop();
  send('race',{});
  $('mbTimer').classList.add('hidden');
  $('mbStop').disabled=true;
  $('mbBanner').textContent='🏁 準備好了嗎？';
  const scores=perCapita(g);
  g.scores=scores;
  const size=teamSizes();
  g.avg=g.counts.map((c,i)=>c/Math.max(1,size[i]||0));   // 顯示用：平均每人真的答對幾題
  const plan=planRace(scores);
  const cnt=$('mbCount');
  const seq=['3','2','1','GO!'];
  seq.forEach((txt,i)=>later(()=>{
    cnt.textContent=txt; cnt.classList.remove('hidden'); replayAnim(cnt,'pop-in');
    if(i<3) sound.tone(660,0,.18,'square',.12); else sound.tone(1047,0,.4,'triangle',.22);
  }, 300+i*900));
  later(()=>{
    cnt.classList.add('hidden');
    $('mbBanner').textContent='🔮 衝啊！';
    music.play('race');
    let lastLead=-1;
    g.stopRace=playRace(g.track, plan, {
      onLead:t=>{
        if(t===lastLead) return; lastLead=t;
        const T=TEAMS[t];
        $('mbBanner').textContent=T.emoji+' '+T.name+' 超前了！';
        $('mbBanner').style.color=T.deep;
        replayAnim($('mbBanner'),'boost');
        sound.pop();
      },
      onFinish:(t,rank)=>{
        setMedal(g.track,t,rank);
        const leg=$('mbLeg'+t); if(leg) leg.querySelector('b').textContent=' '+(['','🥇','🥈','🥉','🏅'][rank]||'🏅');
        if(rank===1){ const T=TEAMS[t]; $('mbBanner').textContent='🏁 '+T.emoji+' '+T.name+' 衝過終點！'; $('mbBanner').style.color=T.deep; sound.correct(); }
      },
      onDone:ranks=>{
        const order=Array.from({length:g.n},(_,i)=>i).sort((a,b)=>ranks[a]-ranks[b]||a-b);
        const tieTop=ranks.filter(r=>r===1).length>1;
        endTeamGame(tieTop?-1:order[0], order);
      }
    });
    // 最後衝刺提示
    later(()=>{ if(g.racing&&$('mbBanner').textContent.indexOf('終點')<0){ $('mbBanner').textContent='🔥 最後衝刺！'; $('mbBanner').style.color='#d9531e'; replayAnim($('mbBanner'),'boost'); } }, (Math.min(...plan.finish)-3)*1000);
  }, 300+3*900+500);
}

/* ── 拔河與賽跑共用：收到答題 ── */
function onAns(p){
  const g=S.game, pl=S.players.get(p.id);
  if(!pl||S.phase!=='play'||!g||!g.running||g.mode==='quiz') return;
  if(g.mode==='marble'&&!g.collecting) return;
  // 防止亂按：iPad 上選項晚 1.5 秒才能按、答錯要冷靜幾秒；白板這邊也再擋一次
  const now=performance.now();
  if(now<(pl.lockUntil||0)) return;              // 還在冷靜時間
  if(now-pl.last<900) return;                    // 太快了（正常要先看題目）
  pl.last=now;
  if(p.ok!==true){
    pl.wrong++; pl.combo=0; pl.wrongRun=(pl.wrongRun||0)+1;
    const L=LIVE.WRONG_LOCKS;
    pl.lockUntil=now+L[Math.min(pl.wrongRun,L.length)-1]-600;
    return;
  }
  pl.correct++; pl.wrongRun=0; pl.combo=(pl.combo||0)+1;
  const power=pl.combo>=LIVE.COMBO_AT?LIVE.COMBO_POWER:1;   // 連對加成
  const t=pl.team; if(t<0) return;
  const size=Math.max(1,teamSizes()[t]);
  if(g.mode==='tug'){
    g.counts[t]++;
    g.pos=Math.max(-LIVE.TUG_LIMIT, Math.min(LIVE.TUG_LIMIT, g.pos+(t===0?-1:1)*LIVE.TUG_PULL*power/size));
    setRope(g.pos);
    $('tugScore'+t).querySelector('b').textContent=g.counts[t];
    const chip=g.chips&&g.chips.get(pl.id);
    if(chip){ chip.querySelector('.cnt').textContent=pl.correct; replayAnim(chip,'flash'); }
    $('fig'+t).querySelectorAll('.puller').forEach(el=>replayAnim(el,'tug'));
    replayAnim($('ropeShake'),'shake-rope');
    const near=LIVE.TUG_LIMIT-3;
    $('finish0').classList.toggle('danger', g.pos<=-near);
    $('finish1').classList.toggle('danger', g.pos>=near);
    if(g.pos<=-LIVE.TUG_LIMIT) endTeamGame(0);
    else if(g.pos>=LIVE.TUG_LIMIT) endTeamGame(1);
  }else{
    g.counts[t]++; g.power[t]+=power; g.total++;
    $('mbTotal').textContent=g.total;
    replayAnim($('mbTotalBox'),'boost');
    addTicker(pl,power>1);
  }
}

function endTeamGame(winner,raceOrder){
  const g=S.game; if(!g||!g.running) return;
  g.running=false; g.racing=false;
  clearTimers(); music.stop();
  sound.win();
  const res={}; S.players.forEach(pl=>{ res[pl.id]=pl.correct; });
  const n=g.mode==='tug'?2:g.n;
  // 名次：拔河看勝負；賽跑照抵達順序
  let order=Array.from({length:n},(_,i)=>i);
  if(g.mode==='marble'&&raceOrder) order=raceOrder.slice();
  else if(winner===1) order.reverse();
  send('end',{ mode:g.mode, winner, order, teamN:n, res });
  saveTeamGame(g,winner,order);
  later(()=>showTeamEnd(g,winner,order), 1300);
}
function stars(){
  return Array.from(S.players.values()).filter(pl=>pl.correct>0).sort((a,b)=>b.correct-a.correct).slice(0,3);
}
function showTeamEnd(g,winner,order){
  S.phase='end';
  const title=$('endTitle'), body=$('endBody');
  if(winner<0){ title.textContent='🤝 平手！大家都好厲害！'; title.style.color='#8b4a5c'; }
  else{ const T=TEAMS[winner]; title.textContent='🏆 '+T.emoji+' '+T.name+' 獲勝！'; title.style.color=T.deep; }
  const medals=['🥇','🥈','🥉','🏅'];
  let h='<div class="rank-list">';
  order.forEach((t,i)=>{
    const T=TEAMS[t];
    const extra= g.mode==='marble'&&g.avg ? '（平均每人 '+(Math.round(g.avg[t]*10)/10)+' 題）' : '';
    h+='<div class="rank-item" style="border-color:'+T.color+';color:'+T.deep+'"><span>'+(winner<0&&g.mode==='tug'?'🤝':medals[i])+' '+T.emoji+' '+T.name+'</span><span>答對 '+g.counts[t]+' 題'+extra+'</span></div>';
  });
  h+='</div>';
  const st=stars();
  if(st.length) h+='<div>'+(g.mode==='tug'?'💪 拉繩之星':'✨ 推球之星')+'</div><div class="stars">'+st.map(pl=>'<span>'+esc(pl.name)+'・'+pl.correct+' 題</span>').join('')+'</div>';
  body.innerHTML=h;
  showScreen('scrEnd');
}
onTap($('tugStop'), ()=>confirmBox('要提早結束這一場嗎？',()=>{ const g=S.game; endTeamGame(g.pos<0?0:g.pos>0?1:-1); }));
onTap($('mbStop'), ()=>confirmBox('要現在結束答題、開始賽跑嗎？',()=>startRace()));

/* ============================================================
   🎯 搶答大挑戰
   ============================================================ */
function publicQ(q){
  if(q.custom) return { custom:true, title:q.title, frac:q.frac, text:q.text, img:q.img, options:q.options.slice() };
  return { type:q.type, n:q.n, d:q.d, k:q.k, options:q.options.map(o=>({n:o.n,d:o.d})) };
}
function startQuiz(){
  let qs=[];
  if(S.src){
    const list=S.inOrder ? S.src.questions.slice() : shuffle(S.src.questions);
    qs=list.map(q=>toGameQuestion(q,S.src));
  }else{ for(let i=0;i<S.quizN;i++) qs.push(makeQuestion(S.level)); }
  S.game={ mode:'quiz', qs, i:-1, qPhase:null, answers:new Map(), stats:[], endsAt:0, left:0, running:true };
  showScreen('scrQuiz');
  nextQuestion();
}
function renderAnswered(){
  const g=S.game; if(!g||g.mode!=='quiz') return;
  $('qzAnswered').textContent='已作答 '+g.answers.size+' / '+S.players.size;
}
function nextQuestion(){
  const g=S.game;
  clearTimers();
  g.i++;
  if(g.i>=g.qs.length){ endQuiz(); return; }
  const q=g.qs[g.i];
  g.answers=new Map(); g.qPhase='q';
  $('qzIndex').textContent='第 '+(g.i+1)+' / '+g.qs.length+' 題';
  $('qzType').textContent=typeLabel(q);
  $('qzPrompt').innerHTML=promptHTML(q);
  $('qzLeader').classList.add('hidden');
  $('qzOpts').classList.remove('hidden');
  $('qzPromptCard').classList.remove('hidden');
  $('qzOpts').innerHTML=q.options.map((o,i)=>
    '<div class="tile" style="background:'+CHOICES[i].color+'"><span class="shape">'+CHOICES[i].shape+'</span>'+optionHTML(o,q)
    +'<span class="count hidden"></span><span class="trap hidden"></span><div class="bar"></div></div>').join('');
  $('qzNext').textContent='⏩ 提早公布';
  renderAnswered();
  g.endsAt=performance.now()+LIVE.QUIZ_SECONDS*1000; g.left=LIVE.QUIZ_SECONDS;
  const t=$('qzTimer'); t.textContent=g.left; t.classList.remove('danger');
  send('q',{ i:g.i, total:g.qs.length, left:LIVE.QUIZ_SECONDS, q:publicQ(q) });
  music.play('think');
  every(()=>{
    const left=Math.max(0,Math.ceil((g.endsAt-performance.now())/1000));
    if(left!==g.left){
      g.left=left; t.textContent=left; t.classList.toggle('danger',left<=5);
      if(left<=5&&left>0) sound.tick();
      if(left===5) music.speed(1.3);
    }
    if(left<=0) reveal();
  },200);
}
function onPick(p){
  const g=S.game, pl=S.players.get(p.id);
  if(!pl||!g||g.mode!=='quiz'||g.qPhase!=='q'||p.i!==g.i||g.answers.has(pl.id)) return;
  if(!Number.isInteger(p.c)||p.c<0||p.c>=g.qs[g.i].options.length) return;
  const ms=Math.max(0,Math.min(LIVE.QUIZ_SECONDS*1000, Number(p.ms)||0));
  g.answers.set(pl.id,{ c:p.c, ms });
  renderAnswered();
  if(g.answers.size>=S.players.size) later(reveal,500);   // 全部答完就提早公布
}
function reveal(){
  const g=S.game; if(!g||g.qPhase!=='q') return;
  clearTimers();
  g.qPhase='reveal';
  music.stop();
  const q=g.qs[g.i], counts=[0,0,0,0], res={}, total=LIVE.QUIZ_SECONDS*1000;
  let right=0;
  S.players.forEach(pl=>{
    const a=g.answers.get(pl.id);
    const ok=!!a&&a.c===q.correctIndex;
    // 跟 Kahoot! 一樣：答對 500～1000 分，越快越高；連續答對再額外加分
    pl.streak = ok ? (pl.streak||0)+1 : 0;
    const speed = ok ? Math.round(500+500*(1-a.ms/total)) : 0;
    const bonus = ok ? Math.min(LIVE.STREAK_MAX, (pl.streak-1)*LIVE.STREAK_STEP) : 0;
    const pts = speed + bonus;
    if(a){ counts[a.c]++; pl.answered++; if(!ok) pl.wrong++; }
    if(ok){ pl.correct++; right++; }
    pl.score+=pts;
    // [答對?, 這題得分, 總分, 選了哪個, 名次, 花了幾毫秒, 連對幾題, 連對加分]
    res[pl.id]=[ok?1:0, pts, pl.score, a?a.c:-1, 0, a?Math.round(a.ms):-1, pl.streak, bonus];
  });
  const ranked=Array.from(S.players.values()).sort((a,b)=>b.score-a.score);
  ranked.forEach((pl,i)=>{ res[pl.id][4]=i+1; });
  g.stats.push({ answered:g.answers.size, right, label:qLabel(q) });
  send('reveal',{ i:g.i, correct:q.correctIndex, res });
  const max=Math.max(1,...counts);
  document.querySelectorAll('#qzOpts .tile').forEach((tile,i)=>{
    const c=tile.querySelector('.count'), tr=tile.querySelector('.trap');
    c.textContent=counts[i]+' 人'; c.classList.remove('hidden');
    tile.querySelector('.bar').style.width=(counts[i]/max*100)+'%';
    if(i===q.correctIndex) tile.classList.add('right');
    else{
      tile.classList.add('dim');
      const lab=q.custom?null:TRAP_LABEL[q.options[i].tag];
      if(lab&&counts[i]>0){ tr.textContent=lab; tr.classList.remove('hidden'); }
    }
  });
  $('qzTimer').classList.remove('danger');
  $('qzNext').textContent='🏅 排行榜';
  sound.pop();
}
function showLeader(){
  const g=S.game;
  g.qPhase='leader';
  const top=Array.from(S.players.values()).sort((a,b)=>b.score-a.score).slice(0,5);
  const medals=['🥇','🥈','🥉','4','5'];
  $('qzOpts').classList.add('hidden');
  $('qzPromptCard').classList.add('hidden');
  const L=$('qzLeader');
  L.innerHTML=top.map((pl,i)=>'<div class="lrow" style="animation-delay:'+(i*0.08)+'s"><span class="rk">'+medals[i]+'</span><span>'+esc(pl.name)+(pl.streak>=2?' <small class="streak">🔥'+pl.streak+'</small>':'')+'</span><span>'+pl.score+'</span></div>').join('')
    || '<div class="lrow"><span class="rk">🙂</span><span>還沒有人得分</span><span></span></div>';
  L.classList.remove('hidden');
  $('qzNext').textContent= g.i+1>=g.qs.length ? '🏆 看最後結果' : '➡️ 下一題';
}
onTap($('qzNext'), ()=>{
  const g=S.game; if(!g||g.mode!=='quiz') return;
  if(g.qPhase==='q') reveal();
  else if(g.qPhase==='reveal') showLeader();
  else if(g.qPhase==='leader') nextQuestion();
});
onTap($('qzStop'), ()=>confirmBox('要結束這次搶答嗎？', ()=>{ if(S.game&&S.game.qPhase==='q') reveal(); endQuiz(); }));

function endQuiz(){
  const g=S.game; if(!g||!g.running) return;
  g.running=false;
  clearTimers(); music.stop();
  const ranked=Array.from(S.players.values()).sort((a,b)=>b.score-a.score);
  const res={}; ranked.forEach((pl,i)=>{ res[pl.id]=[pl.score,i+1,pl.correct]; });
  send('end',{ mode:'quiz', res, total:g.stats.length });
  saveQuiz(g,ranked);
  sound.win();
  S.phase='end';
  $('endTitle').textContent='🏆 搶答結果';
  $('endTitle').style.color='#8b3550';
  const top=ranked.slice(0,3), order=[1,0,2], heights=[220,180,150], medals=['🥇','🥈','🥉'];
  let h='<div class="podium">';
  order.forEach(i=>{ const pl=top[i]; if(!pl) return;
    h+='<div class="pod" style="height:'+heights[i]+'px"><div class="medal">'+medals[i]+'</div><div class="nm">'+esc(pl.name)+'</div><div class="pt">'+pl.score+' 分</div></div>'; });
  h+='</div>';
  if(g.stats.length){
    h+='<div>📊 每一題全班答對率</div><div class="acc">';
    g.stats.forEach((s,i)=>{ const r=s.answered?s.right/s.answered:0;
      h+='<div class="col" style="height:'+Math.max(4,r*100)+'%"><b>'+Math.round(r*100)+'%</b><span>'+(i+1)+'</span></div>'; });
    h+='</div>';
  }
  $('endBody').innerHTML=h;
  showScreen('scrEnd');
}

/* ============================================================
   📊 成績紀錄：比賽結束自動存到後台
   ・要這台電腦已經「開教室模式」或「老師登入」才存得進去
   ・只存座號和暱稱，不存姓名
   ============================================================ */
let saver=null;           // { db, role }；null = 還沒檢查或沒登入
const noSave = isTestMode && !new URLSearchParams(location.search).has('save');   // 測試模式預設不存（網址加 &save=1 才存）
async function getSaver(force){
  if(noSave) return null;
  if(saver&&!force) return saver;
  try{
    const m=await import('./db.js?v=202610151259');
    const r=await m.findOperator();
    saver= r.db ? r : null;
  }catch(e){ saver=null; }
  return saver;
}
async function showSaveState(){
  const el=$('saveState');
  // 白板是投影給孩子看的，只顯示小小的符號；滑鼠移上去才看得到說明
  if(noSave){ el.textContent='💾 –'; el.title='測試模式不會存成績'; el.className='save-state'; return; }
  el.textContent='💾 …'; el.title=''; el.className='save-state';
  const sv=await getSaver(true);
  if(sv){ el.textContent='💾 ✓'; el.title='比賽成績會自動存到後台'; el.className='save-state ok'; }
  else{ el.textContent='💾 ✕'; el.title='這台電腦沒有開教室模式，成績不會存（到班網主畫面的 ⚙️ 開啟）'; el.className='save-state warn'; }
}
function qLabel(q){
  if(q.custom){
    const t=String(q.text||'').replace(/\s+/g,' ').trim();
    return t ? Array.from(t).slice(0,60).join('') : '（圖片題）';
  }
  if(q.type==='A') return '擴分 '+q.n+'/'+q.d+' = ?/'+(q.d*q.k);
  if(q.type==='B') return '約分 '+(q.n*q.k)+'/'+(q.d*q.k);
  return '和 '+q.n+'/'+q.d+' 相等';
}
function sourceName(){
  return S.src ? Array.from(S.src.title).slice(0,70).join('') : '自動出題（'+(S.level==='hard'?'🔥 挑戰':'🌱 簡單')+'）';
}
function playerRows(sortKey){
  const list=Array.from(S.players.values()).sort((a,b)=>b[sortKey]-a[sortKey]||bySeat(a,b));
  return list.map((pl,i)=>({ seat:pl.seat||null, name:pl.name, team:isTeamMode(S.game&&S.game.mode)?pl.team:null,
    correct:pl.correct, wrong:pl.wrong, answered:pl.answered||0, score:pl.score||0, rank:i+1 }));
}
function saveTeamGame(g,winner,order){
  const n=g.mode==='tug'?2:g.n;
  const teams=order.map(t=>({ team:t, name:TEAMS[t].name, emoji:TEAMS[t].emoji, correct:g.counts[t],
    members:Array.from(S.players.values()).filter(pl=>pl.team===t).length,
    perCapita:g.mode==='marble'&&g.avg?Math.round(g.avg[t]*10)/10:undefined }));
  const players=playerRows('correct');
  if(!players.some(p=>p.correct+p.wrong>0)) return endSave('','');
  record(g,{ mode:g.mode, source:sourceName(), player_count:players.length, players,
    summary:{ level:S.src?null:S.level, winner, winnerName:winner>=0?TEAMS[winner].name:null, teamN:n, teams } });
}
function saveQuiz(g){
  if(!g.stats.length) return endSave('','');
  const players=playerRows('score');
  record(g,{ mode:'quiz', source:sourceName(), player_count:players.length, players,
    summary:{ level:S.src?null:S.level, total:g.stats.length, questions:g.stats.map(s=>({ label:s.label, answered:s.answered, right:s.right })) } });
}
/* 結算畫面右下角的小符號（白板投影給孩子看，所以不寫字；滑鼠移上去才看得到說明） */
function endSave(text,cls,retry){
  const el=$('endSave');
  el.className='end-save'+(cls?' '+cls:'');
  el.title=text;
  el.textContent= cls==='ok' ? '💾 ✓' : cls==='warn' ? '💾 ✕' : text ? '💾 …' : '';
  if(retry){
    const b=document.createElement('button');
    b.className='btn'; b.style.marginLeft='8px'; b.textContent='↻'; b.title='再存一次';
    onTap(b, retry);
    el.appendChild(b);
  }
}
async function record(g,row){
  if(g.saved) return;
  if(noSave){ endSave('🧪 測試模式不會存成績',''); return; }
  endSave('💾 成績儲存中…','');
  const sv=await getSaver(false);
  if(!sv){ endSave('⚠️ 成績沒有存：這台電腦沒有開教室模式（到班網主畫面的 ⚙️ 設定開啟）','warn',()=>{ saver=null; record(g,row); }); return; }
  const { error }=await sv.db.from('game_results').insert(row);
  if(!error){ g.saved=true; endSave('✅ 成績已存到後台（📊 成績紀錄）','ok'); return; }
  const m=String(error.code||'')+' '+String(error.message||'');
  if(/game_results|42P01|PGRST205|does not exist/i.test(m)) endSave('⚠️ 成績沒有存：還沒建立成績資料表（請先執行 08_成績紀錄.sql）','warn',()=>record(g,row));
  else endSave('⚠️ 成績沒有存好（網路不穩？）','warn',()=>record(g,row));
}

/* ============================================================
   小工具：確認框、音效開關
   ============================================================ */
let modalYes=null;
function confirmBox(html,yes){ $('modalText').innerHTML=html; modalYes=yes; $('modal').classList.remove('hidden'); }
onTap($('modalYes'), ()=>{ $('modal').classList.add('hidden'); const f=modalYes; modalYes=null; if(f) f(); });
onTap($('modalNo'),  ()=>{ $('modal').classList.add('hidden'); modalYes=null; });
onTap($('soundBtn'), ()=>{ sound.on=!sound.on; $('soundBtn').textContent=sound.on?'🔊':'🔇'; if(!sound.on) music.stop(); });
onTap($('musicBtn'), ()=>{
  music.on=!music.on;
  $('musicBtn').classList.toggle('off',!music.on);
  if(!music.on) music.stop();
});
document.addEventListener('pointerdown', ()=>{ if(sound.on) sound.ctx(); }, { once:true });

renderLobby();
openRoom();
refreshSets();
showSaveState();
