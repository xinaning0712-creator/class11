// ============================================================
// 分數大冒險・全班連線版：白板（老師）端
//  - 開房間（四位數代碼），孩子用 iPad 加入
//  - 三種玩法：全班拔河 / 搶答大挑戰 / 玻璃球賽跑
//  - 老師端負責計分與廣播；孩子端只送「答對／答錯」或「選了哪一個」
// ============================================================
import {
  LIVE, TEAMS, CHOICES, TRAP_LABEL, makeQuestion, promptHTML, typeLabel, fracHTML, esc, cleanName,
  optionHTML, loadSets, toGameQuestion,
  connect, sound, onTap, replayAnim, tween, randInt, shuffle, isTestMode, store
} from './live-common.js?v=202610142113';
import { qrSvg } from './qr.js?v=202610142113';

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
  if(!pl){
    if(S.players.size>=MAX_PLAYERS){ send('full',{to:p.id}); return; }
    pl={ id:p.id, name:uniqueName(name,p.id), team:-1, correct:0, wrong:0, score:0, streak:0, last:0 };
    S.players.set(p.id,pl);
    if(isTeamMode(S.mode)) placeInSmallest(pl);
    sound.pop();
  }
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
function chipHTML(pl){ return '<button class="chip" data-id="'+esc(pl.id)+'">'+esc(pl.name)+'</button>'; }
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
  confirmBox('要請「'+esc(pl.name)+'」重新取一個暱稱嗎？', ()=>{
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
  clearTimers();
  S.players.forEach(pl=>{ pl.correct=0; pl.wrong=0; pl.score=0; pl.streak=0; });
  assignTeams(false);
  S.phase='play';
  if(S.mode==='tug') startTug();
  else if(S.mode==='marble') startMarble();
  else startQuiz();
}
function backToLobby(){
  clearTimers();
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
  every(()=>{
    const left=Math.max(0,Math.ceil((g.endsAt-performance.now())/1000));
    if(left!==g.left){ g.left=left; renderTimer('tugTimer',left); }
    if(left<=0) endTeamGame(g.pos<0?0:g.pos>0?1:-1);
  },250);
}
function renderTimer(id,left){ const el=$(id); el.textContent='⏳ '+left; el.classList.toggle('danger',left<=10); }

/* ============================================================
   🔮 玻璃球賽跑
   ============================================================ */
const MX0=276, MX1=1084, MR=30;
function buildMarble(n){
  const laneH=130, top=16, H=top*2+n*laneH, svg=$('mbSvg');
  svg.setAttribute('viewBox','0 0 1200 '+H);
  let h='<defs>';
  for(let i=0;i<n;i++){
    const T=TEAMS[i];
    h+='<radialGradient id="mg'+i+'" cx="35%" cy="30%" r="75%"><stop offset="0%" stop-color="#fff"/><stop offset="30%" stop-color="'+T.light+'"/><stop offset="72%" stop-color="'+T.color+'"/><stop offset="100%" stop-color="'+T.deep+'"/></radialGradient>';
  }
  h+='</defs>';
  for(let i=0;i<n;i++){
    const T=TEAMS[i], y0=top+i*laneH, cy=y0+laneH/2;
    h+='<rect x="10" y="'+(y0+8)+'" width="1180" height="'+(laneH-16)+'" rx="26" fill="'+T.light+'" opacity=".85"/>';
    h+='<text x="46" y="'+(cy+16)+'" text-anchor="middle" font-size="44">'+T.emoji+'</text>';
    h+='<text x="84" y="'+(cy-6)+'" font-size="26" font-weight="900" fill="'+T.deep+'">'+T.name+'</text>';
    h+='<text id="mbCnt'+i+'" x="84" y="'+(cy+28)+'" font-size="22" font-weight="800" fill="'+T.deep+'">⭐ 答對 0</text>';
    h+='<rect x="240" y="'+(cy-36)+'" width="880" height="72" rx="36" fill="#fff" stroke="'+T.color+'" stroke-width="4"/>';
    h+='<rect id="mbFill'+i+'" x="240" y="'+(cy-36)+'" width="72" height="72" rx="36" fill="'+T.color+'" opacity=".28"/>';
    h+='<line x1="270" y1="'+(cy-24)+'" x2="1090" y2="'+(cy-24)+'" stroke="#fff" stroke-width="6" stroke-linecap="round" opacity=".9"/>';
    for(let r=0;r<4;r++) for(let c=0;c<2;c++) h+='<rect x="'+(1084+c*12)+'" y="'+(cy-24+r*12)+'" width="12" height="12" fill="'+((r+c)%2?'#5b4038':'#fff')+'"/>';
    h+='<text id="mbMedal'+i+'" x="1158" y="'+(cy+16)+'" text-anchor="middle" font-size="44">🏁</text>';
    h+='<g id="mb'+i+'" transform="translate('+MX0+','+cy+')">'
      +'<ellipse cx="0" cy="'+(MR+4)+'" rx="'+(MR*0.8)+'" ry="6" fill="rgba(90,60,40,.18)"/>'
      +'<circle r="'+MR+'" fill="url(#mg'+i+')" stroke="'+T.deep+'" stroke-width="2"/>'
      +'<g id="mbSpin'+i+'"><path d="M-19 7 Q0 -24 19 7" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".65"/><circle cx="9" cy="12" r="5" fill="#fff" opacity=".5"/></g>'
      +'<ellipse cx="-10" cy="-12" rx="10" ry="6" fill="#fff" opacity=".85"/>'
      +'</g>';
  }
  svg.innerHTML=h;
  return Array.from({length:n},(_,i)=>top+i*laneH+laneH/2);
}
function setMarble(i,prog){
  const g=S.game, x=MX0+(MX1-MX0)*Math.min(100,prog)/100;
  const el=$('mb'+i); if(!el) return;
  const cy=g.cy[i];
  el.setAttribute('transform','translate('+x.toFixed(1)+','+cy+')');
  $('mbSpin'+i).setAttribute('transform','rotate('+((x-MX0)/MR*57.3).toFixed(1)+')');
  $('mbFill'+i).setAttribute('width',(x-240+36).toFixed(1));
  g.shown[i]=prog;
}
function startMarble(){
  const n=S.teamN;
  const cy=buildMarble(n);
  const g=S.game={ mode:'marble', n, cy, prog:new Array(n).fill(0), shown:new Array(n).fill(0), counts:new Array(n).fill(0),
                   cancels:new Array(n).fill(null), running:true, endsAt:performance.now()+LIVE.MARBLE_SECONDS*1000, left:LIVE.MARBLE_SECONDS };
  $('mbTicker').innerHTML='';
  renderTimer('mbTimer',g.left);
  showScreen('scrMarble');
  g.set=setPayload();
  send('start',{ mode:'marble', level:S.level, set:g.set, left:LIVE.MARBLE_SECONDS, teamN:n, map:teamMap() });
  every(()=>{
    const left=Math.max(0,Math.ceil((g.endsAt-performance.now())/1000));
    if(left!==g.left){ g.left=left; renderTimer('mbTimer',left); }
    if(left<=0){
      let best=0; for(let i=1;i<n;i++) if(g.prog[i]>g.prog[best]) best=i;
      endTeamGame(g.prog.every(p=>p===g.prog[best])&&n>1 ? -1 : best);
    }
  },250);
}
function addTicker(pl){
  const T=TEAMS[pl.team], el=document.createElement('span');
  el.className='tick'; el.style.borderColor=T.color; el.style.color=T.deep;
  el.textContent=T.emoji+' '+pl.name+' 推了一下！';
  const box=$('mbTicker'); box.insertBefore(el, box.firstChild);
  while(box.children.length>8) box.removeChild(box.lastChild);
}

/* ── 拔河與賽跑共用：收到答題 ── */
function onAns(p){
  const g=S.game, pl=S.players.get(p.id);
  if(!pl||S.phase!=='play'||!g||!g.running||g.mode==='quiz') return;
  const now=performance.now();
  if(now-pl.last<250) return;                   // 防止連點灌分
  pl.last=now;
  if(p.ok!==true){ pl.wrong++; return; }
  pl.correct++;
  const t=pl.team; if(t<0) return;
  const size=Math.max(1,teamSizes()[t]);
  if(g.mode==='tug'){
    g.counts[t]++;
    g.pos=Math.max(-LIVE.TUG_LIMIT, Math.min(LIVE.TUG_LIMIT, g.pos+(t===0?-1:1)*LIVE.TUG_PULL/size));
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
    g.counts[t]++;
    g.prog[t]=Math.min(100, g.prog[t]+100/(LIVE.MARBLE_GOAL*size));
    $('mbCnt'+t).textContent='⭐ 答對 '+g.counts[t];
    if(g.cancels[t]) g.cancels[t]();
    const from=g.shown[t], to=g.prog[t];
    g.cancels[t]=tween(from,to,500,v=>setMarble(t,v));
    addTicker(pl);
    if(g.prog[t]>=100){ $('mbMedal'+t).textContent='🥇'; endTeamGame(t); }
  }
}

function endTeamGame(winner){
  const g=S.game; if(!g||!g.running) return;
  g.running=false;
  clearTimers();
  sound.win();
  const res={}; S.players.forEach(pl=>{ res[pl.id]=pl.correct; });
  const n=g.mode==='tug'?2:g.n;
  // 名次：拔河看勝負；賽跑依進度排
  const order=Array.from({length:n},(_,i)=>i);
  if(g.mode==='marble') order.sort((a,b)=>g.prog[b]-g.prog[a]);
  else if(winner===1) order.reverse();
  send('end',{ mode:g.mode, winner, order, teamN:n, res });
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
    const extra= g.mode==='marble' ? '（'+Math.round(g.prog[t])+'%）' : '';
    h+='<div class="rank-item" style="border-color:'+T.color+';color:'+T.deep+'"><span>'+(winner<0&&g.mode==='tug'?'🤝':medals[i])+' '+T.emoji+' '+T.name+'</span><span>答對 '+g.counts[t]+' 題'+extra+'</span></div>';
  });
  h+='</div>';
  const st=stars();
  if(st.length) h+='<div>'+(g.mode==='tug'?'💪 拉繩之星':'✨ 推球之星')+'</div><div class="stars">'+st.map(pl=>'<span>'+esc(pl.name)+'・'+pl.correct+' 題</span>').join('')+'</div>';
  body.innerHTML=h;
  showScreen('scrEnd');
}
onTap($('tugStop'), ()=>confirmBox('要提早結束這一場嗎？',()=>{ const g=S.game; endTeamGame(g.pos<0?0:g.pos>0?1:-1); }));
onTap($('mbStop'), ()=>confirmBox('要提早結束這一場嗎？',()=>{
  const g=S.game; let best=0; for(let i=1;i<g.n;i++) if(g.prog[i]>g.prog[best]) best=i;
  endTeamGame(g.prog.every(v=>v===g.prog[best]) ? -1 : best);
}));

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
  every(()=>{
    const left=Math.max(0,Math.ceil((g.endsAt-performance.now())/1000));
    if(left!==g.left){
      g.left=left; t.textContent=left; t.classList.toggle('danger',left<=5);
      if(left<=5&&left>0) sound.tick();
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
    if(a) counts[a.c]++;
    if(ok){ pl.correct++; right++; }
    pl.score+=pts;
    // [答對?, 這題得分, 總分, 選了哪個, 名次, 花了幾毫秒, 連對幾題, 連對加分]
    res[pl.id]=[ok?1:0, pts, pl.score, a?a.c:-1, 0, a?Math.round(a.ms):-1, pl.streak, bonus];
  });
  const ranked=Array.from(S.players.values()).sort((a,b)=>b.score-a.score);
  ranked.forEach((pl,i)=>{ res[pl.id][4]=i+1; });
  g.stats.push({ answered:g.answers.size, right });
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
  clearTimers();
  const ranked=Array.from(S.players.values()).sort((a,b)=>b.score-a.score);
  const res={}; ranked.forEach((pl,i)=>{ res[pl.id]=[pl.score,i+1,pl.correct]; });
  send('end',{ mode:'quiz', res, total:g.stats.length });
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
   小工具：確認框、音效開關
   ============================================================ */
let modalYes=null;
function confirmBox(html,yes){ $('modalText').innerHTML=html; modalYes=yes; $('modal').classList.remove('hidden'); }
onTap($('modalYes'), ()=>{ $('modal').classList.add('hidden'); const f=modalYes; modalYes=null; if(f) f(); });
onTap($('modalNo'),  ()=>{ $('modal').classList.add('hidden'); modalYes=null; });
onTap($('soundBtn'), ()=>{ sound.on=!sound.on; $('soundBtn').textContent=sound.on?'🔊':'🔇'; });
document.addEventListener('pointerdown', ()=>{ if(sound.on) sound.ctx(); }, { once:true });

renderLobby();
openRoom();
refreshSets();
