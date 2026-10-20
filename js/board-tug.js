// ============================================================
// 🪢 白板拔河（11班專屬樂園）：不用 iPad，兩隊在電子白板上直接答題拉繩子
//  - 左半邊：草莓兔兔隊；右半邊：奶茶熊熊隊（隊名可以改）
//  - 題目：自動出分數題，或老師在後台建的題組（每隊各自抽題）
//  - 手繪療癒風；不連線、不記錄成績
// ============================================================
import { makeQuestion, promptHTML, typeLabel, optionHTML, loadSets, makeDeck, esc, sound, onTap, replayAnim, tween } from './live-common.js?v=202610202039';
import { resetZoom } from './no-zoom.js?v=202610202039';
import { music } from './live-music.js?v=202610202039';

const $ = id => document.getElementById(id);
const LIMIT = 8;                       // 拉到 ±8 格就獲勝
const FINISH = 340;                    // 終點線離中線的距離（畫面座標）
const STEP = FINISH / LIMIT;
const LINE = '#5b4038', G = 470;
const KEYS = ['A', 'B', 'C', 'D'];

const S = { sets:[], src:null, level:'easy', seconds:90, names:['草莓兔兔隊','奶茶熊熊隊'], g:null, timers:new Set() };
function every(fn,ms){ const id=setInterval(fn,ms); S.timers.add(()=>clearInterval(id)); }
function later(fn,ms){ const id=setTimeout(fn,ms); S.timers.add(()=>clearTimeout(id)); }
function clearTimers(){ S.timers.forEach(f=>f()); S.timers.clear(); }
function showScreen(id){ document.querySelectorAll('.screen').forEach(s=>s.classList.toggle('active',s.id===id)); }

/* ── 設定畫面 ── */
function radio(sel,fn){ document.querySelectorAll(sel).forEach(b=>onTap(b,()=>{ document.querySelectorAll(sel).forEach(x=>x.classList.toggle('selected',x===b)); fn(b); sound.pop(); })); }
radio('.level-btn', b=>{ S.level=b.dataset.level; });
radio('.time-btn',  b=>{ S.seconds=parseInt(b.dataset.s,10)||90; });
async function refreshSets(){
  const sel=$('srcSel'); sel.disabled=true;
  const keep=S.src&&S.src.id;
  S.sets=await loadSets();
  sel.innerHTML='<option value="auto">🎲 自動出題：分數擴分約分</option>'
    + S.sets.map((s,i)=>'<option value="'+i+'">📚 '+esc(s.title)+'（'+s.questions.length+' 題）</option>').join('');
  const idx=S.sets.findIndex(s=>s.id===keep);
  sel.value= idx>=0 ? String(idx) : 'auto';
  sel.disabled=false; applySrc();
}
function applySrc(){
  const v=$('srcSel').value;
  S.src= v==='auto' ? null : S.sets[parseInt(v,10)]||null;
  $('levelRow').classList.toggle('hidden', !!S.src);
  $('srcInfo').textContent= S.src ? (S.src.subject?S.src.subject+'・':'')+S.src.questions.length+' 題（兩隊各自隨機抽題）' : '';
}
$('srcSel').addEventListener('change', ()=>{ applySrc(); sound.pop(); });
onTap($('srcRefresh'), refreshSets);
const cleanTeam=(s,d)=>Array.from(String(s||'').replace(/\s+/g,' ').trim()).slice(0,8).join('')||d;

/* ── 場景（手繪風）── */
function cloud(x,y,s){ return '<g transform="translate('+x+' '+y+') scale('+s+')"><path d="M-60 10 Q-62 -14 -38 -16 Q-30 -40 -4 -34 Q14 -50 34 -32 Q62 -34 60 -6 Q74 12 50 18 H-46 Q-70 20 -60 10Z" fill="#fff" stroke="'+LINE+'" stroke-width="3.5" stroke-linejoin="round"/></g>'; }
function tree(x,y,s){
  let t='<g transform="translate('+x+' '+y+') scale('+s+')"><path d="M-8 0 Q-6 -40 -2 -60 L6 -60 Q8 -40 10 0Z" fill="#9c7258" stroke="'+LINE+'" stroke-width="3.5"/>';
  t+='<path d="M-62 -70 Q-74 -110 -40 -122 Q-30 -156 6 -150 Q40 -164 54 -128 Q86 -112 66 -78 Q62 -52 30 -56 Q4 -42 -22 -54 Q-58 -46 -62 -70Z" fill="#f7c4cf" stroke="'+LINE+'" stroke-width="4" stroke-linejoin="round"/>';
  [[-34,-96],[0,-124],[30,-98],[-10,-76],[44,-72],[-46,-70],[14,-140]].forEach(([fx,fy])=>{ t+='<g transform="translate('+fx+' '+fy+')"><circle r="7" fill="#fff" stroke="'+LINE+'" stroke-width="2"/><circle r="2.6" fill="#f2a4b6"/></g>'; });
  return t+'</g>';
}
function flowers(x,y){ return '<g transform="translate('+x+' '+y+')"><circle r="4.5" fill="#fff" stroke="'+LINE+'" stroke-width="1.8"/><circle cx="10" cy="4" r="3.5" fill="#fff" stroke="'+LINE+'" stroke-width="1.6"/><circle cx="4" cy="-7" r="3" fill="#fff" stroke="'+LINE+'" stroke-width="1.5"/></g>'; }
function face(){ return '<circle cx="-7" cy="2" r="2.4" fill="'+LINE+'"/><circle cx="7" cy="2" r="2.4" fill="'+LINE+'"/><path d="M-3 7 Q0 10 3 7" stroke="'+LINE+'" stroke-width="2" fill="none" stroke-linecap="round"/><circle cx="-12" cy="8" r="3.2" fill="#f28da6" opacity=".7"/><circle cx="12" cy="8" r="3.2" fill="#f28da6" opacity=".7"/>'; }
function bunny(x,y,lean,s){ return '<g transform="translate('+x+' '+y+') rotate('+lean+') scale('+s+')">'
  +'<ellipse cx="0" cy="36" rx="22" ry="5" fill="rgba(91,64,56,.18)"/>'
  +'<path d="M-18 34 Q-22 0 0 -2 Q22 0 18 34Z" fill="#fff" stroke="'+LINE+'" stroke-width="3.5" stroke-linejoin="round"/>'
  +'<path d="M-14 8 H14 V20 H-14Z" fill="#f7c4cf" stroke="'+LINE+'" stroke-width="3"/>'
  +'<path d="M-12 -30 Q-20 -72 -8 -74 Q2 -72 -2 -32Z" fill="#fff" stroke="'+LINE+'" stroke-width="3.5"/><path d="M-9 -38 Q-14 -64 -8 -66" stroke="#f7c4cf" stroke-width="4" fill="none" stroke-linecap="round"/>'
  +'<path d="M12 -30 Q20 -72 8 -74 Q-2 -72 2 -32Z" fill="#fff" stroke="'+LINE+'" stroke-width="3.5"/><path d="M9 -38 Q14 -64 8 -66" stroke="#f7c4cf" stroke-width="4" fill="none" stroke-linecap="round"/>'
  +'<ellipse cx="0" cy="-12" rx="24" ry="21" fill="#fff" stroke="'+LINE+'" stroke-width="3.5"/>'
  +'<g transform="translate(0 -14)">'+face()+'</g>'
  +'<path d="M14 14 Q34 6 44 -6" stroke="'+LINE+'" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M14 14 Q34 6 44 -6" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/>'
  +'</g>'; }
function bear(x,y,lean,s){ return '<g transform="translate('+x+' '+y+') rotate('+lean+') scale('+s+')">'
  +'<ellipse cx="0" cy="36" rx="22" ry="5" fill="rgba(91,64,56,.18)"/>'
  +'<path d="M-20 34 Q-24 0 0 -2 Q24 0 20 34Z" fill="#d9b48e" stroke="'+LINE+'" stroke-width="3.5" stroke-linejoin="round"/>'
  +'<path d="M-14 8 H14 V20 H-14Z" fill="#a8d8d2" stroke="'+LINE+'" stroke-width="3"/>'
  +'<circle cx="-18" cy="-30" r="9" fill="#d9b48e" stroke="'+LINE+'" stroke-width="3.5"/><circle cx="-18" cy="-30" r="4" fill="#f2c9a0"/>'
  +'<circle cx="18" cy="-30" r="9" fill="#d9b48e" stroke="'+LINE+'" stroke-width="3.5"/><circle cx="18" cy="-30" r="4" fill="#f2c9a0"/>'
  +'<ellipse cx="0" cy="-12" rx="25" ry="21" fill="#d9b48e" stroke="'+LINE+'" stroke-width="3.5"/>'
  +'<ellipse cx="0" cy="-5" rx="9" ry="6" fill="#f6e2c8" stroke="'+LINE+'" stroke-width="2"/>'
  +'<g transform="translate(0 -16)"><circle cx="-8" cy="2" r="2.4" fill="'+LINE+'"/><circle cx="8" cy="2" r="2.4" fill="'+LINE+'"/><circle cx="-13" cy="8" r="3.2" fill="#f28da6" opacity=".6"/><circle cx="13" cy="8" r="3.2" fill="#f28da6" opacity=".6"/></g>'
  +'<path d="M0 -2 Q-2 1 0 2 Q2 1 0 -2" fill="'+LINE+'"/>'
  +'<path d="M-14 14 Q-34 6 -44 -6" stroke="'+LINE+'" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M-14 14 Q-34 6 -44 -6" stroke="#d9b48e" stroke-width="4" fill="none" stroke-linecap="round"/>'
  +'</g>'; }
function bubble(id,x,y,flip){
  return '<g id="'+id+'" class="bubble" transform="translate('+x+' '+y+')"><path d="M-84 -26 H84 Q98 -26 98 -12 V12 Q98 26 84 26 H'+(flip?'22 L18 44 L6':'-6 L-18 44 L-22')+' 26 H-84 Q-98 26 -98 12 V-12 Q-98 -26 -84 -26Z" fill="#fff" stroke="'+LINE+'" stroke-width="3.5" stroke-linejoin="round"/><text y="9" font-size="24" font-weight="700" fill="'+LINE+'" text-anchor="middle"></text></g>';
}
function drawScene(){
  let h='<defs><filter id="hand" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7"/><feDisplacementMap in="SourceGraphic" scale="3"/></filter></defs>';
  h+='<rect x="-800" y="-400" width="2800" height="1500" fill="#fdf3e4"/><g filter="url(#hand)">';
  h+='<g transform="translate(0 160)">'+cloud(200,80,.9)+cloud(600,60,1)+cloud(980,100,.85)+cloud(-150,120,.9)+cloud(1350,90,1)+'</g>';
  let fl='<path d="M-300 30 Q300 120 900 30 T 2100 30" fill="none" stroke="'+LINE+'" stroke-width="3"/>';
  const cols=['#f7c4cf','#fff','#ffe08a','#a8d8d2','#d5c2f0'];
  for(let i=0;i<26;i++){ const x=-260+i*62, y=30+90*Math.sin(Math.PI*((x+300)%1200)/1200)*.6; fl+='<path d="M'+(x-15)+' '+(y-2)+' L'+(x+15)+' '+(y-2)+' L'+x+' '+(y+30)+'Z" fill="'+cols[i%5]+'" stroke="'+LINE+'" stroke-width="2.5" stroke-linejoin="round"/>'; }
  h+='<g transform="translate(0 175)">'+fl+'</g>';
  h+='<path d="M-800 360 Q -400 300 0 350 T 600 330 T 1200 345 T 2000 340 V700 H-800Z" fill="#dcebc0" stroke="'+LINE+'" stroke-width="3"/>';
  h+='<path d="M-800 '+G+' Q -500 '+(G-14)+' -200 '+G+' T 400 '+G+' T 1000 '+G+' T 1600 '+G+' T 2200 '+G+' V900 H-800Z" fill="#c8dea3" stroke="'+LINE+'" stroke-width="4"/>';
  h+=tree(-20,G-10,1)+tree(1220,G-10,1)+tree(380,G-110,.55)+tree(820,G-112,.55);
  [[180,520],[300,540],[520,530],[700,545],[880,525],[1040,540],[420,500],[760,505]].forEach(([x,y])=>{ h+=flowers(x,y); });
  h+='<path d="M600 '+(G-20)+' V'+(G+60)+'" stroke="'+LINE+'" stroke-width="4" stroke-dasharray="10 10"/>';
  const L=600-FINISH, R=600+FINISH;
  [[L,'#ef9fb3'],[R,'#c9a27e']].forEach(([x,c])=>{ h+='<path d="M'+x+' '+(G-20)+' V'+(G+70)+'" stroke="'+c+'" stroke-width="10" stroke-linecap="round"/><path d="M'+x+' '+(G-20)+' V'+(G+70)+'" stroke="'+LINE+'" stroke-width="3" stroke-linecap="round" fill="none"/>'; });
  h+='<g transform="translate('+L+' '+(G+66)+')"><rect x="-4" y="-60" width="8" height="64" rx="3" fill="#fff4dc" stroke="'+LINE+'" stroke-width="3"/><path d="M4 -58 H54 L44 -44 L54 -30 H4Z" fill="#f7c4cf" stroke="'+LINE+'" stroke-width="3" stroke-linejoin="round"/><text x="27" y="-39" font-size="14" font-weight="700" fill="'+LINE+'" text-anchor="middle">終點</text></g>';
  h+='<g transform="translate('+R+' '+(G+66)+')"><rect x="-4" y="-60" width="8" height="64" rx="3" fill="#fff4dc" stroke="'+LINE+'" stroke-width="3"/><path d="M-4 -58 H-54 L-44 -44 L-54 -30 H-4Z" fill="#e8cfb2" stroke="'+LINE+'" stroke-width="3" stroke-linejoin="round"/><text x="-27" y="-39" font-size="14" font-weight="700" fill="'+LINE+'" text-anchor="middle">終點</text></g>';
  h+='</g>';
  // 會移動的部分（繩子、蝴蝶結、兩隊角色）：不套手繪濾鏡，動起來比較順
  const ry=G-62;
  h+='<g id="ropeGroup">';
  h+='<path d="M-200 '+ry+' Q 600 '+(ry+22)+' 1400 '+ry+'" fill="none" stroke="'+LINE+'" stroke-width="15" stroke-linecap="round"/>';
  h+='<path d="M-200 '+ry+' Q 600 '+(ry+22)+' 1400 '+ry+'" fill="none" stroke="#e9c79a" stroke-width="9" stroke-linecap="round" stroke-dasharray="14 6"/>';
  h+='<g transform="translate(600 '+(ry+10)+')"><path d="M0 0 L-24 -16 Q-30 0 -24 16Z M0 0 L24 -16 Q30 0 24 16Z" fill="#ef9fb3" stroke="'+LINE+'" stroke-width="3" stroke-linejoin="round"/><circle r="7" fill="#f7c4cf" stroke="'+LINE+'" stroke-width="3"/><path d="M-3 6 L-10 34 M3 6 L10 34" stroke="'+LINE+'" stroke-width="3"/></g>';
  h+='<g id="team0">'+[[80,-14],[185,-12],[290,-10]].map(([x,l])=>'<g class="pl">'+bunny(x,G-48,l,1.6)+'</g>').join('')+'</g>';
  h+='<g id="team1">'+[[910,10],[1015,12],[1120,14]].map(([x,l])=>'<g class="pl">'+bear(x,G-48,l,1.6)+'</g>').join('')+'</g>';
  h+='</g>';
  h+=bubble('bub0',430,G-185,false)+bubble('bub1',770,G-185,true);
  $('scene').innerHTML=h;
}
const CHEER_OK=['用力拉！💪','好棒！✨','加油加油！','拉過來！🎉'];
function say(t,text){
  const b=$('bub'+t); b.querySelector('text').textContent=text; b.classList.add('show');
  clearTimeout(b._t); b._t=setTimeout(()=>b.classList.remove('show'),1100);
}

/* ── 對戰 ── */
function newGame(){
  clearTimers(); music.stop();
  S.names=[cleanTeam($('name0').value,'草莓兔兔隊'), cleanTeam($('name1').value,'奶茶熊熊隊')];
  $('name0').value=S.names[0]; $('name1').value=S.names[1];
  const src=S.src;
  const deck=()=> src ? makeDeck(src) : (()=>makeQuestion(S.level));
  S.g={ pos:0, ropeX:0, cancel:null, running:false, left:S.seconds, endsAt:0,
        teams:[0,1].map(t=>({ t, next:deck(), q:null, score:0, correct:0, wrong:0, combo:0, best:0, locked:false })) };
  [0,1].forEach(t=>{ $('tName'+t).textContent=S.names[t]; $('tScore'+t).textContent='0'; $('combo'+t).classList.remove('on'); });
  $('timer').firstChild.textContent='⏳ '+S.seconds; $('timer').classList.remove('danger');
  drawScene(); setRope(0,true);
  $('endOv').classList.add('hidden');
  showScreen('scrGame');
  [0,1].forEach(t=>nextQ(t));
  [0,1].forEach(t=>$('panel'+t).classList.add('locked'));
  countdown();
}
function countdown(){
  let n=3; $('countOv').classList.remove('hidden'); $('countNum').textContent=n; replayAnim($('countNum'),'count'); sound.tick();
  every(()=>{
    n--;
    if(n>0){ $('countNum').textContent=n; replayAnim($('countNum'),'count'); sound.tick(); return; }
    if(n===0){ $('countNum').textContent='開始！'; replayAnim($('countNum'),'count'); sound.correct(); return; }
    $('countOv').classList.add('hidden'); clearTimers(); go();
  },800);
}
function go(){
  const g=S.g; g.running=true; g.endsAt=performance.now()+S.seconds*1000;
  [0,1].forEach(t=>$('panel'+t).classList.remove('locked'));
  music.play('think');
  every(()=>{
    const left=Math.max(0,Math.ceil((g.endsAt-performance.now())/1000));
    if(left!==g.left){
      g.left=left; $('timer').firstChild.textContent='⏳ '+left;
      $('timer').classList.toggle('danger',left<=10);
      if(left===10) music.speed(1.3);
      if(left<=5&&left>0) sound.tick();
    }
    if(left<=0) endGame();
  },200);
}
function nextQ(t){
  const tm=S.g.teams[t];
  tm.q=tm.next();
  const q=tm.q;
  $('type'+t).textContent=typeLabel(q);
  $('q'+t).innerHTML=promptHTML(q);
  const box=$('opts'+t);
  box.innerHTML=q.options.map((o,i)=>'<button class="opt" data-i="'+i+'"><span class="key">'+KEYS[i]+'</span><span>'+optionHTML(o,q)+'</span></button>').join('');
  tm.locked=false; $('panel'+t).classList.remove('locked');
}
function floatText(t,text,color){
  const el=document.createElement('div'); el.className='float'; el.textContent=text; el.style.color=color;
  $('panel'+t).appendChild(el); setTimeout(()=>el.remove(),950);
}
function pick(t,i,btn){
  const g=S.g; if(!g||!g.running) return;
  const tm=g.teams[t]; if(tm.locked) return;
  tm.locked=true; $('panel'+t).classList.add('locked');
  const btns=$('opts'+t).querySelectorAll('.opt');
  const dir= t===0 ? -1 : 1;
  if(i===tm.q.correctIndex){
    tm.correct++; tm.combo++; tm.best=Math.max(tm.best,tm.combo);
    const step= tm.combo>=3 ? 2 : 1;
    tm.score+=10*step; $('tScore'+t).textContent=tm.score;
    btn.classList.add('ok'); sound.correct();
    floatText(t, step>1?'🔥 +2 格':'+1 格', '#3f8f4f');
    const c=$('combo'+t);
    if(tm.combo>=3){ c.textContent='🔥 連對 '+tm.combo; c.classList.add('on'); replayAnim(c,'on'); } else c.classList.remove('on');
    say(t, tm.combo>=3?'連對 '+tm.combo+' 題！🔥':CHEER_OK[Math.floor(Math.random()*CHEER_OK.length)]);
    replayAnim($('team'+t),'yank'+t);
    move(dir*step);
    later(()=>{ if(g.running) nextQ(t); }, 450);
  }else{
    tm.wrong++; tm.combo=0; $('combo'+t).classList.remove('on');
    btn.classList.add('bad'); sound.wrong();
    btns.forEach((b,k)=>{ if(k===tm.q.correctIndex) b.classList.add('ok'); else if(b!==btn) b.classList.add('dim'); });
    floatText(t,'對方 +1 格','#c94a4a');
    say(1-t,'趁現在！💨');
    replayAnim($('team'+(1-t)),'yank'+(1-t));
    move(-dir);
    later(()=>{ if(g.running) nextQ(t); }, 1500);
  }
}
[0,1].forEach(t=>onTap($('opts'+t),(e,target)=>{
  const btn=target&&target.closest&&target.closest('.opt'); if(!btn) return;
  pick(t, parseInt(btn.dataset.i,10), btn);
}));
function move(d){
  const g=S.g;
  g.pos=Math.max(-LIMIT,Math.min(LIMIT,g.pos+d));
  setRope(g.pos);
  if(Math.abs(g.pos)>=LIMIT) later(()=>endGame(),500);
}
function setRope(pos,instant){
  const g=S.g; if(g.cancel) g.cancel();
  const target=pos*STEP;
  const apply=x=>{ g.ropeX=x; $('ropeGroup').setAttribute('transform','translate('+x.toFixed(1)+',0)'); };
  if(instant){ apply(target); return; }
  g.cancel=tween(g.ropeX,target,450,apply);
}
function endGame(){
  const g=S.g; if(!g||!g.running) return;
  g.running=false; clearTimers(); music.stop();
  [0,1].forEach(t=>$('panel'+t).classList.add('locked'));
  const winner= g.pos<0 ? 0 : g.pos>0 ? 1 : (g.teams[0].score>g.teams[1].score?0:g.teams[1].score>g.teams[0].score?1:-1);
  const byPull= Math.abs(g.pos)>=LIMIT;
  $('endTitle').textContent= winner<0 ? '🤝 平手！兩隊都好厲害！' : '🏆 '+(winner===0?'🐰 ':'🐻 ')+S.names[winner]+' 獲勝！';
  $('endRow').innerHTML=[0,1].map(t=>{ const tm=g.teams[t];
    return '<div class="end-team t'+t+'">'+(t===0?'🐰 ':'🐻 ')+esc(S.names[t])+(winner===t?' 👑':'')+'<br><b>'+tm.score+'</b> 分<br>答對 '+tm.correct+' 題・答錯 '+tm.wrong+' 題<br>最多連對 '+tm.best+' 題</div>'; }).join('')
    + '<div style="grid-column:1/-1;font-size:1rem;color:#8a6a5c">'+(byPull?'把蝴蝶結拉過終點，提前獲勝！':winner<0?'時間到，繩子剛好在正中間，比分也一樣！':'時間到，看繩子偏向哪一邊'+(g.pos===0?'（繩子在中間，比分數）':'')+'。')+'</div>';
  sound.win();
  later(()=>$('endOv').classList.remove('hidden'),700);
}

/* 提早結束：按兩次才算（避免小朋友誤觸） */
onTap($('stopBtn'),()=>{
  const b=$('stopBtn');
  if(b.classList.contains('armed')){ b.classList.remove('armed'); b.textContent='✕'; endGame(); return; }
  b.classList.add('armed'); b.textContent='再按一次結束';
  setTimeout(()=>{ b.classList.remove('armed'); b.textContent='✕'; },3000);
});
onTap($('goBtn'), newGame);
onTap($('againBtn'), newGame);
onTap($('setupBtn'), ()=>{ clearTimers(); music.stop(); if(S.g) S.g.running=false; $('endOv').classList.add('hidden'); showScreen('scrSetup'); });
onTap($('soundBtn'), ()=>{ sound.on=!sound.on; $('soundBtn').textContent=sound.on?'🔊':'🔇'; if(!sound.on) music.stop(); });
onTap($('musicBtn'), ()=>{ music.on=!music.on; $('musicBtn').classList.toggle('off',!music.on); if(!music.on) music.stop(); else if(S.g&&S.g.running) music.play('think'); });
document.addEventListener('pointerdown', ()=>{ if(sound.on) sound.ctx(); }, { once:true });
void resetZoom;

refreshSets();
