// ============================================================
// 分數大冒險・全班連線版：孩子的 iPad 端
//  - 輸入房間代碼與暱稱加入
//  - 拔河／賽跑：自己一直答題，答對就幫隊伍出力
//  - 搶答：看白板的題目，在 iPad 上選答案
// ============================================================
import {
  LIVE, TEAMS, CHOICES, LEVELS, makeQuestion, cleanQuestion, promptHTML, typeLabel, fracHTML, esc,
  optionHTML, cleanSet, makeDeck,
  cleanName, cleanSeat, SEAT_COUNT, randomId, connect, sound, onTap, store
} from './live-common.js?v=202610142127';

const $ = id => document.getElementById(id);
const P = {
  id: store.get('fr-id') || randomId(),
  name:'', seat:0, code:'', net:null, joined:false, tries:0, joinTimer:null,
  mode:null, level:'easy', team:-1, teamN:2, set:null, deck:null,
  q:null, locked:false, playing:false, correct:0, score:0, quiz:null,
  timerId:null, endsAt:0, token:0, screen:'pJoin'
};
store.set('fr-id', P.id);

function showScreen(id){
  P.screen=id;
  document.querySelectorAll('.screen').forEach(s=>s.classList.toggle('active', s.id===id));
  $('main').scrollTop=0;
}
function send(event,payload){
  if(!P.net) return;
  Promise.resolve(P.net.send(event,payload)).catch(()=>setNet('ERR'));
}
function setNet(st){
  const d=$('netDot'); d.classList.remove('ok','bad');
  if(st==='SUBSCRIBED'){ d.classList.add('ok'); d.textContent='已連線'; }
  else if(st==='CHANNEL_ERROR'||st==='TIMED_OUT'||st==='CLOSED'||st==='ERR'){ d.classList.add('bad'); d.textContent='網路不穩，請靠近 Wi-Fi'; }
  else d.textContent='連線中…';
}
function msg(t){ $('joinMsg').textContent=t||''; }

/* ── 倒數（只是顯示用，真正的時間以白板為準） ── */
function startCountdown(el,left,onEnd){
  stopCountdown();
  P.endsAt=performance.now()+Math.max(0,left)*1000;
  const tick=()=>{
    const s=Math.max(0,Math.ceil((P.endsAt-performance.now())/1000));
    el.textContent='⏳ '+s;
    if(s<=0){ stopCountdown(); if(onEnd) onEnd(); }
  };
  tick(); P.timerId=setInterval(tick,250);
}
function stopCountdown(){ if(P.timerId){ clearInterval(P.timerId); P.timerId=null; } }

/* ============================================================
   加入房間
   ============================================================ */
/* ── 座號按鈕 ── */
function buildSeats(){
  const box=$('seatGrid'); let h='';
  for(let i=1;i<=SEAT_COUNT;i++) h+='<button type="button" class="seat-btn" data-seat="'+i+'">'+i+'</button>';
  box.innerHTML=h;
  markSeat();
}
function markSeat(){
  $('seatGrid').querySelectorAll('[data-seat]').forEach(b=>{
    const on=Number(b.getAttribute('data-seat'))===P.seat;
    b.classList.toggle('selected',on); b.setAttribute('aria-pressed',on?'true':'false');
  });
}
onTap($('seatGrid'), (e,target)=>{
  const b=target.closest('[data-seat]'); if(!b) return;
  P.seat=cleanSeat(b.getAttribute('data-seat')); markSeat(); sound.pop();
  if(/座號/.test($('joinMsg').textContent)) msg('');
});
const joinInfo=()=>({ id:P.id, name:P.name, seat:P.seat });

async function doJoin(){
  const code=$('codeIn').value.replace(/\D/g,'').slice(0,4);
  const name=cleanName($('nameIn').value);
  if(code.length!==4){ msg('請輸入白板上的 4 位數代碼'); return; }
  if(!name){ msg('請幫自己取一個暱稱'); return; }
  if(!P.seat){ msg('請點選你的座號'); return; }
  P.code=code; P.name=name; P.joined=false;
  $('joinBtn').disabled=true; msg('連線中…');
  try{
    if(P.net) P.net.close();
    P.net=await connect({ code, role:'player', onMessage:handle, onStatus:setNet });
  }catch(e){ fail('連不上網路，請確認 Wi-Fi 後再試一次'); return; }
  P.tries=0; sendJoin();
}
function sendJoin(){
  send('join',joinInfo());
  clearTimeout(P.joinTimer);
  P.joinTimer=setTimeout(()=>{
    if(P.joined) return;
    P.tries++;
    if(P.tries>=4) fail('找不到這個房間，請確認白板上的代碼');
    else sendJoin();
  },2500);
}
function fail(t){
  $('joinBtn').disabled=false; msg(t);
  if(P.net){ P.net.close(); P.net=null; }
  showScreen('pJoin');
}
onTap($('joinBtn'), doJoin);
$('codeIn').addEventListener('input', ()=>{ $('codeIn').value=$('codeIn').value.replace(/\D/g,'').slice(0,4); });
$('nameIn').addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); doJoin(); } });
$('codeIn').addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); $('nameIn').focus(); } });

/* ============================================================
   收到白板的訊息
   ============================================================ */
function teamOf(map){ const t=map&&map[P.id]; return Number.isInteger(t)&&t>=0&&t<TEAMS.length ? t : -1; }

function handle(event,p){
  p=p||{};
  if(p.to!==undefined && p.to!==P.id) return;        // 給別人的訊息
  switch(event){
    case 'welcome':
      P.joined=true; clearTimeout(P.joinTimer);
      P.name=cleanName(p.name)||P.name;
      store.set('fr-code',P.code); store.set('fr-name',P.name); store.set('fr-seat',String(P.seat));
      $('joinBtn').disabled=false; msg('');
      applySync(p.sync||{});
      return;
    case 'kick': kicked(); return;
    case 'full': fail('房間人數已滿，請找老師幫忙'); return;
    case 'seat-taken':
      P.joined=false; clearTimeout(P.joinTimer); store.del('fr-code');
      fail(cleanSeat(p.seat)+' 號已經有人加入了（'+(cleanName(p.name)||'？')+'）。請確認座號；如果真的是你，請老師在白板上點那個名字移除，再加入一次。');
      return;
    case 'rollcall': if(P.joined) send('join',joinInfo()); return;
  }
  if(!P.joined) return;
  switch(event){
    case 'teams':
      P.mode=p.mode; P.teamN=p.teamN; P.team=teamOf(p.map);
      if(P.screen==='pWait') showWait();
      break;
    case 'lobby':
      P.mode=p.mode; P.teamN=p.teamN; P.team=teamOf(p.map);
      endPlaying(); showWait();
      break;
    case 'start':
      P.mode=p.mode; P.teamN=p.teamN; P.team=teamOf(p.map);
      P.level=LEVELS[p.level]?p.level:'easy';
      useSet(p.set);
      if(P.team<0){ showWait(); send('join',joinInfo()); break; }  // 剛好晚一步加入：再報到一次拿隊伍
      startPlay({ left:p.left, correct:0 });
      break;
    case 'q': showQuizQ(p); break;
    case 'reveal': showReveal(p); break;
    case 'end': showEnd(p); break;
  }
}
function applySync(s){
  if(s.phase==='play'){
    P.mode=s.mode; P.level=LEVELS[s.level]?s.level:'easy'; P.teamN=s.teamN; useSet(s.set);
    P.team=Number.isInteger(s.team)?s.team:-1;
    if(P.team>=0){ startPlay({ left:s.left, correct:s.correct }); return; }
  }else if(s.phase==='quiz-q'){
    P.mode='quiz'; P.score=s.score||0; showQuizQ(s); return;
  }else if(s.phase==='quiz-wait'){
    P.mode='quiz'; P.score=s.score||0;
    resultBox('<div class="result-sub">🎯 搶答進行中</div><div class="wait-anim">⏳</div><div class="wait-text">下一題馬上來！</div>');
    return;
  }else{
    P.mode=s.mode; P.teamN=s.teamN; P.team=Number.isInteger(s.team)?s.team:-1;
  }
  showWait();
}
function kicked(){
  endPlaying();
  P.joined=false;
  if(P.net){ P.net.close(); P.net=null; }
  store.del('fr-code'); store.del('fr-name');
  $('nameIn').value='';
  $('joinBtn').disabled=false;
  msg('老師請你重新加入一次（可以換一個暱稱）🙂');
  showScreen('pJoin');
}

/* ── 等待畫面 ── */
function teamBadgeHTML(t,cls){
  const T=TEAMS[t];
  return '<span class="'+(cls||'team-badge')+'" style="border-color:'+T.color+';color:'+T.deep+'">'+T.emoji+' '+T.name+' '+T.animal+'</span>';
}
function showWait(){
  $('waitHello').textContent='嗨，'+P.name+'！'+(P.seat?'（'+P.seat+' 號）':'');
  const teamMode=(P.mode==='tug'||P.mode==='marble')&&P.team>=0;
  $('waitTeam').innerHTML= teamMode ? '你是 '+teamBadgeHTML(P.team) : '';
  const label={ tug:'🪢 準備全班拔河！', marble:'🔮 準備玻璃球賽跑！', quiz:'🎯 準備搶答大挑戰！' }[P.mode]||'';
  $('waitText').textContent=(label?label+' ':'')+'等老師按開始…';
  showScreen('pWait');
}
/* 老師選了自訂題組：在 iPad 上建一台抽題機 */
function useSet(raw){ P.set=raw?cleanSet(raw):null; P.deck=P.set?makeDeck(P.set):null; }
function endPlaying(){ P.playing=false; P.token++; stopCountdown(); }

/* ============================================================
   🪢 拔河／🔮 賽跑：自己一直答題
   ============================================================ */
function startPlay(s){
  endPlaying();
  P.playing=true;
  P.correct=s.correct||0;
  const T=TEAMS[P.team];
  $('playTeam').textContent=T.emoji+' '+T.name;
  $('playTeam').style.borderColor=T.color; $('playTeam').style.color=T.deep;
  $('playCount').textContent='⭐ '+P.correct;
  $('playTimeup').classList.add('hidden');
  showScreen('pPlay');
  startCountdown($('playTimer'), s.left, ()=>{ P.playing=false; P.token++; $('playTimeup').classList.remove('hidden'); });
  nextPlayQ();
}
function nextPlayQ(){
  if(!P.playing) return;
  P.q=P.deck ? P.deck() : makeQuestion(P.level);
  $('playType').textContent=typeLabel(P.q);
  $('playPrompt').innerHTML=promptHTML(P.q);
  const T=TEAMS[P.team]||TEAMS[0];
  $('playOpts').innerHTML=P.q.options.map((o,i)=>'<button class="opt" data-index="'+i+'" style="border-color:'+T.light+'">'+optionHTML(o,P.q)+'</button>').join('');
  $('playOpts').classList.remove('locked');
  P.locked=false;
}
$('playOpts').addEventListener('pointerdown', e=>{
  const btn=e.target.closest('[data-index]'); if(!btn) return;
  e.preventDefault();
  answerPlay(parseInt(btn.getAttribute('data-index'),10), btn);
});
function answerPlay(i,btn){
  if(P.locked||!P.playing) return;
  P.locked=true;
  const ok=i===P.q.correctIndex, tk=P.token;
  send('ans',{ id:P.id, ok });
  if(ok){
    P.correct++;
    $('playCount').textContent='⭐ '+P.correct;
    btn.classList.add('right');
    floatText(btn, P.mode==='tug'?'💪 +1':'🔮 +1');
    sound.correct();
    setTimeout(()=>{ if(tk===P.token) nextPlayQ(); },450);
  }else{
    btn.classList.add('wrong');
    const rb=$('playOpts').querySelector('[data-index="'+P.q.correctIndex+'"]');
    if(rb) rb.classList.add('reveal');
    $('playOpts').classList.add('locked');
    sound.wrong();
    setTimeout(()=>{ if(tk===P.token) nextPlayQ(); }, LIVE.WRONG_LOCK_MS);
  }
}
function floatText(el,text){
  const r=el.getBoundingClientRect(), f=document.createElement('div');
  f.className='float'; f.textContent=text;
  f.style.left=(r.left+r.width/2)+'px'; f.style.top=(r.top+r.height/2)+'px';
  f.addEventListener('animationend',()=>f.remove());
  document.body.appendChild(f);
}

/* ============================================================
   🎯 搶答
   ============================================================ */
function showQuizQ(s){
  const q=cleanQuestion(s.q);
  if(!q||!Number.isInteger(s.i)) return;
  endPlaying();
  P.quiz={ i:s.i, total:s.total, q, start:performance.now(), picked:false };
  $('quizIndex').textContent='第 '+(s.i+1)+' / '+s.total+' 題';
  $('quizScore').textContent=P.score+' 分';
  $('quizType').textContent=typeLabel(q);
  $('quizPrompt').innerHTML=promptHTML(q);
  $('quizOpts').innerHTML=q.options.map((o,i)=>
    '<button class="opt color" data-index="'+i+'" style="background:'+CHOICES[i].color+';border-color:'+CHOICES[i].color+'"><span class="shape">'+CHOICES[i].shape+'</span>'+optionHTML(o,q)+'</button>').join('');
  $('quizTimeup').classList.add('hidden');
  showScreen('pQuiz');
  startCountdown($('quizTimer'), s.left, ()=>{ if(P.quiz&&!P.quiz.picked){ P.quiz.picked=true; $('quizTimeup').classList.remove('hidden'); } });
}
$('quizOpts').addEventListener('pointerdown', e=>{
  const btn=e.target.closest('[data-index]'); if(!btn) return;
  e.preventDefault();
  const z=P.quiz; if(!z||z.picked) return;
  z.picked=true;
  const c=parseInt(btn.getAttribute('data-index'),10);
  z.choice=c;
  send('pick',{ id:P.id, i:z.i, c, ms:Math.round(performance.now()-z.start) });
  sound.pop();
  stopCountdown();
  resultBox('<div class="result-sub">已送出！</div><div class="picked-shape" style="background:'+CHOICES[c].color+'">'+CHOICES[c].shape+'</div><div class="wait-text">看看白板，等大家作答…</div>');
});
function resultBox(html){ $('resultBox').innerHTML=html; showScreen('pResult'); }
function showReveal(p){
  stopCountdown();
  const z=P.quiz;
  const r=p.res&&Array.isArray(p.res[P.id])?p.res[P.id]:null;
  if(!z||p.i!==z.i||!r){ resultBox('<div class="result-sub">這題沒有接到，下一題加油！💪</div>'); return; }
  const ok=r[0]===1, pts=r[1]|0, total=r[2]|0, choice=r[3], rank=r[4]|0;
  const ms=Number.isFinite(r[5])?r[5]:-1, streak=r[6]|0, bonus=r[7]|0;
  P.score=total;
  let h;
  if(ok){
    h='<div class="result-big">✅ 答對了！</div><div class="result-sub">+'+pts+' 分'
      +(ms>=0?'<span class="secs">（'+(ms/1000).toFixed(1)+' 秒）</span>':'')+'</div>';
    if(streak>=2) h+='<div class="streak-line">🔥 連對 '+streak+' 題'+(bonus>0?'，多加 '+bonus+' 分！':'！')+'</div>';
    sound.correct();
  }
  else{
    const c=Number.isInteger(p.correct)&&p.correct>=0&&p.correct<z.q.options.length ? p.correct : 0;
    const o=z.q.options[c];
    h= choice<0 ? '<div class="result-big">⏰ 來不及了！</div>' : '<div class="result-big">❌ 差一點！</div>';
    h+='<div class="result-sub">正確答案是 <span style="color:'+CHOICES[c].color+'">'+CHOICES[c].shape+'</span> '+optionHTML(o,z.q)+'</div>';
    sound.wrong();
  }
  h+='<div class="score-line">目前 '+total+' 分'+(total>0&&rank>0&&rank<=3?'・第 '+rank+' 名 🎉':'・繼續加油！')+'</div>';
  resultBox(h);
}

/* ============================================================
   結束
   ============================================================ */
function showEnd(p){
  endPlaying();
  const box=$('endBox');
  let h='';
  if(p.mode==='quiz'){
    const r=p.res&&Array.isArray(p.res[P.id])?p.res[P.id]:null;
    h='<div class="result-big">🏁 搶答結束！</div>';
    if(r){
      const medal=['','🥇','🥈','🥉'][r[1]]||'';
      h+='<div class="result-sub">'+(medal?medal+' ':'')+'你得到 '+(r[0]|0)+' 分</div><div class="score-line">答對 '+(r[2]|0)+' 題，辛苦了！</div>';
    }
  }else{
    const w=Number.isInteger(p.winner)?p.winner:-1;
    if(w<0) h='<div class="result-big">🤝 平手！</div>';
    else if(w===P.team) h='<div class="result-big">🎉 我們贏了！</div><div class="result-sub">'+TEAMS[w].emoji+' '+TEAMS[w].name+' 第一名！</div>';
    else h='<div class="result-big">🏆 '+TEAMS[w].emoji+' '+TEAMS[w].name+' 獲勝！</div>';
    const mine=p.res?p.res[P.id]|0:P.correct;
    h+='<div class="score-line">你幫隊伍答對了 '+mine+' 題 💪</div>';
  }
  h+='<div class="wait-text" style="margin-top:18px">看看白板，等老師開始下一場～</div>';
  box.innerHTML=h;
  showScreen('pEnd');
  sound.win();
}

/* ── 音效開關、自動重新加入 ── */
onTap($('soundBtn'), ()=>{ sound.on=!sound.on; $('soundBtn').textContent=sound.on?'🔊':'🔇'; });
document.addEventListener('pointerdown', ()=>{ if(sound.on) sound.ctx(); }, { once:true });

const urlCode=(new URLSearchParams(location.search).get('code')||'').replace(/\D/g,'').slice(0,4);
$('codeIn').value=urlCode||store.get('fr-code')||'';
$('nameIn').value=store.get('fr-name')||'';
P.seat=cleanSeat(store.get('fr-seat'));
buildSeats();
if(store.get('fr-code')&&store.get('fr-name')&&P.seat) doJoin();   // 重新整理後自動回到房間
