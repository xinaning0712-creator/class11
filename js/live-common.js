// ============================================================
// 分數大冒險・全班連線版：白板（live-host）和 iPad（live）共用的程式
//  - 出題：擴分填空 / 約分到最簡 / 判斷相等，陷阱依迷思產生，並標記陷阱種類
//  - 分數上下排版
//  - 連線：Supabase 即時廣播（正式上課）或 BroadcastChannel（同一台電腦測試用，網址加 ?test=1）
// ============================================================
import { SUPABASE_URL, SUPABASE_KEY } from './config.js?v=202610142000';
import { richText, cleanImg, cleanSet, makeDeck, toGameQuestion, DEMO_SET } from './quiz-bank.js?v=202610142000';
export { cleanSet, makeDeck, toGameQuestion };

/* ── 老師可以調整的設定 ── */
export const LIVE = {
  TUG_SECONDS: 120,      // 全班拔河：每場秒數
  TUG_LIMIT: 10,         // 全班拔河：旗子走到 ±10 格就獲勝
  TUG_PULL: 2.5,         // 全班拔河：一隊「每個人」答對一題，旗子平均移動幾格 ÷ 隊伍人數（人數不同也公平）
  MARBLE_SECONDS: 180,   // 玻璃球賽跑：時間上限（秒），時間到時跑最前面的隊伍獲勝
  MARBLE_GOAL: 10,       // 玻璃球賽跑：平均每人答對幾題，球會到終點
  QUIZ_SECONDS: 20,      // 搶答：每題秒數
  QUIZ_COUNT: 10,        // 搶答：預設題數
  WRONG_LOCK_MS: 1000,   // iPad 答錯後暫停幾毫秒
  NAME_MAX: 8            // 暱稱最多幾個字
};

/* ── 隊伍：顏色、名稱、角色 ── */
export const TEAMS = [
  { key:'straw',  name:'草莓兔兔隊', emoji:'🍓', animal:'🐰', color:'#f28bab', deep:'#d0587e', light:'#ffe9f0' },
  { key:'milk',   name:'奶茶熊熊隊', emoji:'🧋', animal:'🐻', color:'#c49a74', deep:'#8b5e3c', light:'#f6ece2' },
  { key:'berry',  name:'藍莓喵喵隊', emoji:'🫐', animal:'🐱', color:'#93a8e6', deep:'#5368b8', light:'#eaeefc' },
  { key:'matcha', name:'抹茶狗狗隊', emoji:'🍵', animal:'🐶', color:'#9ccc8a', deep:'#4f8a3d', light:'#eef7e8' }
];

/* ── 搶答四個選項的形狀與顏色（像 Kahoot，但是奶茶玫粉版） ── */
export const CHOICES = [
  { shape:'▲', color:'#e7849f', name:'粉紅三角' },
  { shape:'◆', color:'#7fa7d9', name:'藍色菱形' },
  { shape:'●', color:'#e2ad4f', name:'蜂蜜圓形' },
  { shape:'■', color:'#86bd73', name:'抹茶方形' }
];

/* ── 陷阱種類（搶答公布答案時，老師可以看到大家掉進哪種迷思） ── */
export const TRAP_LABEL = {
  add:'🪤 用加的', k:'🪤 填了倍數', one:'🪤 只做一邊', big:'🪤 數字大就大',
  partial:'🪤 沒約到底', sub:'🪤 用減的', near:'🪤 差一點'
};

/* ============================================================
   數學工具
   ============================================================ */
export function randInt(a,b){ return Math.floor(Math.random()*(b-a+1))+a; }
export function shuffle(arr){
  const a=arr.slice();
  for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); const t=a[i]; a[i]=a[j]; a[j]=t; }
  return a;
}
export function gcd(a,b){ a=Math.abs(a); b=Math.abs(b); while(b){ const t=a%b; a=b; b=t; } return a; }
export function simplify(n,d){ const g=gcd(n,d)||1; return [n/g, d/g]; }
export function isEqual(a,b,c,d){ return a*d===b*c; }   // 交叉相乘，不用小數

export const LEVELS = {
  easy: { dMin:2, dMax:6,  kMin:2, kMax:4, improper:false },   // 🌱 簡單
  hard: { dMin:2, dMax:10, kMin:2, kMax:6, improper:true  }    // 🔥 挑戰（可出現假分數、多次約分）
};

function genBase(cfg){
  for(let i=0;i<300;i++){
    const d=randInt(cfg.dMin,cfg.dMax);
    const n=(cfg.improper && Math.random()<0.25) ? randInt(d+1,2*d-1) : randInt(1,d-1);
    if(gcd(n,d)===1) return [n,d];
  }
  return [1,2];
}

function trapCandidates(type,n,d,k){
  const N=n*k, D=d*k, p1=[], p2=[];
  if(type==='A'){
    p1.push({n:D-d+n,d:D,tag:'add'},{n:k,d:D,tag:'k'},{n:n,d:D,tag:'one'},{n:D,d:D,tag:'big'});
    p2.push({n:N+1,d:D,tag:'near'},{n:N-1,d:D,tag:'near'},{n:n*(k+1),d:D,tag:'near'},{n:n+k,d:D,tag:'add'},{n:N+n,d:D,tag:'near'});
  }else if(type==='B'){
    for(let j=2;j<k;j++){ if(k%j===0) p1.push({n:N/j,d:D/j,tag:'partial',partial:true}); }
    if(N-(D-d)>0) p1.push({n:N-(D-d),d:d,tag:'sub'});
    p1.push({n:n,d:D,tag:'one'},{n:N,d:d,tag:'one'});
    const c=randInt(1,Math.max(1,Math.min(N,D)-1));
    p2.push({n:N-c,d:D-c,tag:'sub'},{n:n+1,d:d,tag:'near'},{n:n,d:d+1,tag:'near'},{n:N+1,d:D,tag:'near'});
    if(n>1) p2.push({n:n-1,d:d,tag:'near'});
  }else{
    const m=randInt(1,4);
    p1.push({n:n+m,d:d+m,tag:'add'});
    p1.push(Math.random()<0.5 ? {n:N,d:d,tag:'one'} : {n:n,d:D,tag:'one'});
    const k2=k+randInt(2,4);
    p1.push(Math.random()<0.5 ? {n:n*k2+1,d:d*k2,tag:'big'} : {n:n*k2,d:d*k2+1,tag:'big'});
    p2.push({n:N,d:d,tag:'one'},{n:n,d:D,tag:'one'},{n:N+1,d:D,tag:'near'},{n:N,d:D+1,tag:'near'},
            {n:N+randInt(1,5),d:D+randInt(1,5),tag:'add'});
  }
  return shuffle(p1).concat(shuffle(p2));
}

function optionOK(c,chosen,type,base,qFrac,state){
  if(!Number.isInteger(c.n)||!Number.isInteger(c.d)||c.n<=0||c.d<=0||c.n>200||c.d>200) return false;
  if(chosen.some(o=>o.n===c.n&&o.d===c.d)) return false;
  if(isEqual(c.n,c.d,base.n,base.d)){
    if(type!=='B'||!c.partial||state.hasPartial||gcd(c.n,c.d)===1) return false;
    if(qFrac&&c.n===qFrac.n&&c.d===qFrac.d) return false;
    state.hasPartial=true; return true;
  }
  return !chosen.some(o=>isEqual(o.n,o.d,c.n,c.d));
}
function pickOptions(correct,list,type,base,qFrac){
  const chosen=[correct], state={hasPartial:false};
  for(const c of list){ if(chosen.length===4) break; if(optionOK(c,chosen,type,base,qFrac,state)) chosen.push(c); }
  return chosen.length===4 ? chosen : null;
}
function fallbackOptions(correct,type,base,qFrac){
  const chosen=[correct], state={hasPartial:false};
  for(const dl of [1,-1,2,-2,3,-3,4,5,6,7,8,9]){
    if(chosen.length===4) break;
    const c={n:correct.n+dl,d:correct.d,tag:'near'};
    if(optionOK(c,chosen,type,base,qFrac,state)) chosen.push(c);
  }
  return chosen;
}

/* 產生一題：{type,n,d,k,options:[{n,d,tag}],correctIndex} */
export function makeQuestion(level){
  const cfg=LEVELS[level]||LEVELS.easy;
  const type=['A','B','C'][randInt(0,2)];
  const [n,d]=genBase(cfg);
  let k=randInt(cfg.kMin,cfg.kMax);
  if(type==='B'&&level==='hard'&&Math.random()<0.6) k=[4,6][randInt(0,1)];
  const base={n,d};
  const correct= type==='B' ? {n,d,tag:'ok'} : {n:n*k,d:d*k,tag:'ok'};
  const qFrac= type==='B' ? {n:n*k,d:d*k} : null;
  let opts=null;
  for(let t=0;t<50&&!opts;t++) opts=pickOptions(correct,trapCandidates(type,n,d,k),type,base,qFrac);
  if(!opts) opts=fallbackOptions(correct,type,base,qFrac);
  const options=shuffle(opts);
  return { type, n, d, k, options, correctIndex:options.indexOf(correct) };
}

/* 檢查從網路收到的題目格式（只接受整數，避免奇怪的內容被顯示） */
export function cleanQuestion(q){
  if(q&&q.custom){
    const text=typeof q.text==='string'?q.text.slice(0,300):'';
    const img=cleanImg(q.img);
    const options=Array.isArray(q.options)?q.options.slice(0,4).map(o=>typeof o==='string'?o.slice(0,80):''):[];
    if((!text&&!img)||options.length<2||options.some(o=>!o)) return null;
    return { custom:true, frac:q.frac===true, title:typeof q.title==='string'?q.title.slice(0,40):'', text, img, options };
  }
  if(!q||!['A','B','C'].includes(q.type)) return null;
  const ints=[q.n,q.d,q.k].every(v=>Number.isInteger(v)&&v>0&&v<=200);
  if(!ints||!Array.isArray(q.options)||q.options.length!==4) return null;
  const options=q.options.map(o=>({n:o&&o.n, d:o&&o.d}));
  if(!options.every(o=>Number.isInteger(o.n)&&Number.isInteger(o.d)&&o.n>0&&o.d>0&&o.n<=400&&o.d<=400)) return null;
  return { type:q.type, n:q.n, d:q.d, k:q.k, options };
}

/* ============================================================
   顯示
   ============================================================ */
export function esc(s){
  return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function num(v){ return Number.isFinite(v) ? String(v) : esc(v); }
export function fracHTML(n,d,cls){
  return '<span class="frac'+(cls?' '+cls:'')+'"><span class="num">'+num(n)+'</span><span class="den">'+num(d)+'</span></span>';
}
const QMARK='<span class="qmark">?</span>';
export function typeLabel(q){
  if(q.custom) return '📚 '+(q.title||'題組');
  return q.type==='A' ? '📝 擴分填空' : q.type==='B' ? '✂️ 約成最簡分數' : '⚖️ 判斷相等';
}
export function promptHTML(q){
  if(q.custom) return (q.text?'<span class="q-words">'+richText(q.text,q.frac)+'</span>':'')+(q.img?'<img class="q-img" src="'+esc(q.img)+'" alt="題目圖片">':'');
  if(q.type==='A') return fracHTML(q.n,q.d)+'<span class="eq">=</span><span class="frac"><span class="num">'+QMARK+'</span><span class="den">'+num(q.d*q.k)+'</span></span>';
  if(q.type==='B') return '把 '+fracHTML(q.n*q.k,q.d*q.k)+' 約成最簡分數';
  return '哪一個和 '+fracHTML(q.n,q.d)+' 一樣大？';
}

/* 選項的顯示（分數題是上下排版的分數；自訂題是文字） */
export function optionHTML(o,q){
  return q&&q.custom ? '<span class="opt-words">'+richText(o,q.frac)+'</span>' : fracHTML(o.n,o.d);
}

/* 白板讀取老師在後台建好的題組（測試模式用示範題組） */
export async function loadSets(){
  if(isTestMode) return [cleanSet(DEMO_SET)];
  try{
    const r=await fetch(SUPABASE_URL+'/rest/v1/quiz_sets?select=id,title,subject,frac,shuffle,questions&order=updated_at.desc',
      { headers:{ apikey:SUPABASE_KEY, Authorization:'Bearer '+SUPABASE_KEY } });
    if(!r.ok) return [];
    const rows=await r.json();
    return (Array.isArray(rows)?rows:[]).map(cleanSet).filter(Boolean);
  }catch(e){ return []; }
}

/* 暱稱整理：去頭尾空白、最多 8 個字 */
export function cleanName(s){
  const t=String(s||'').replace(/\s+/g,' ').trim();
  return Array.from(t).slice(0,LIVE.NAME_MAX).join('');
}
export function randomId(){
  return Math.random().toString(36).slice(2,10)+Date.now().toString(36).slice(-4);
}
export const store={
  get(k){ try{ return sessionStorage.getItem(k); }catch(e){ return null; } },
  set(k,v){ try{ sessionStorage.setItem(k,v); }catch(e){} },
  del(k){ try{ sessionStorage.removeItem(k); }catch(e){} }
};
export const isTestMode = new URLSearchParams(location.search).has('test');

/* ============================================================
   連線
   ・老師（host）：聽「in」頻道、在「out」頻道廣播
   ・孩子（player）：聽「out」頻道；送出時用 REST 直接傳給「in」頻道
     → 孩子不會收到別人的答題訊息，全班 24 台同時玩也不會超過免費方案的訊息量
   ============================================================ */
/* 用 REST 傳一則廣播（孩子端送答案用；老師端也用它做「iPad 路徑自我檢查」） */
export async function restBroadcast(topic,event,payload){
  const r=await fetch(SUPABASE_URL+'/realtime/v1/api/broadcast',{
    method:'POST',
    headers:{ 'apikey':SUPABASE_KEY, 'Content-Type':'application/json' },
    body:JSON.stringify({ messages:[{ topic, event, payload }] })
  });
  if(!r.ok) throw new Error('HTTP '+r.status);
}

export async function connect({ code, role, onMessage, onStatus }){
  const inName='fr-'+code+'-in', outName='fr-'+code+'-out';
  const listenName= role==='host' ? inName : outName;
  const sendName  = role==='host' ? outName : inName;
  const status = s=>{ if(onStatus) onStatus(s); };

  /* 測試模式：同一台電腦的分頁之間互傳 */
  if(isTestMode){
    const listen=new BroadcastChannel(listenName), sender=new BroadcastChannel(sendName);
    listen.onmessage=e=>{ const m=e.data||{}; if(m.event) onMessage(m.event, m.payload||{}); };
    status('SUBSCRIBED');
    return {
      kind:'test',
      send(event,payload){ sender.postMessage({event,payload}); return Promise.resolve(); },
      close(){ listen.close(); sender.close(); }
    };
  }

  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  const sb=createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth:{ persistSession:false, autoRefreshToken:false, detectSessionInUrl:false, storageKey:'fr-live' },
    realtime:{ params:{ eventsPerSecond:20 } }
  });
  const subscribe = ch => new Promise((resolve,reject)=>{
    let settled=false;
    const timer=setTimeout(()=>{ if(!settled){ settled=true; reject(new Error('TIMED_OUT')); } }, 15000);
    ch.subscribe(st=>{
      status(st);
      if(settled) return;
      if(st==='SUBSCRIBED'){ settled=true; clearTimeout(timer); resolve(); }
      else if(st==='CHANNEL_ERROR'||st==='TIMED_OUT'||st==='CLOSED'){ settled=true; clearTimeout(timer); reject(new Error(st)); }
    });
  });

  const listen=sb.channel(listenName, { config:{ broadcast:{ self:false } } });
  listen.on('broadcast', { event:'*' }, msg=>{ if(msg&&msg.event) onMessage(msg.event, msg.payload||{}); });
  await subscribe(listen);

  let wsSender=null;
  async function wsSend(event,payload){
    if(!wsSender){
      wsSender=sb.channel(sendName, { config:{ broadcast:{ self:false } } });
      await subscribe(wsSender);
    }
    return wsSender.send({ type:'broadcast', event, payload });
  }
  if(role==='host') await wsSend('hello',{});   // 老師先把廣播頻道連好

  let restOK=true;
  const restSend=(event,payload)=>restBroadcast(sendName,event,payload);

  return {
    kind:'supabase',
    async send(event,payload){
      if(role==='host') return wsSend(event,payload);
      if(restOK){
        try{ return await restSend(event,payload); }
        catch(e){ restOK=false; }   // REST 不通時，改用一般連線（訊息量較大，但一樣能玩）
      }
      return wsSend(event,payload);
    },
    selfTest(){ return restBroadcast(inName,'ping',{ t:Date.now() }); },   // 老師端：模擬 iPad 傳訊息給自己
    close(){ try{ sb.removeAllChannels(); }catch(e){} }
  };
}

/* ============================================================
   音效（Web Audio 即時合成）
   ============================================================ */
let ac=null;
export const sound={
  on:true,
  ctx(){
    if(!ac){ const C=window.AudioContext||window.webkitAudioContext; if(!C) return null; ac=new C(); }
    if(ac.state==='suspended') ac.resume();
    return ac;
  },
  tone(f,start,dur,type,vol){
    if(!this.on) return;
    const c=this.ctx(); if(!c) return;
    const o=c.createOscillator(), g=c.createGain(), t=c.currentTime+start;
    o.type=type||'sine'; o.frequency.value=f;
    g.gain.setValueAtTime(0.0001,t);
    g.gain.exponentialRampToValueAtTime(vol||0.2,t+0.02);
    g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t+dur+0.05);
  },
  correct(){ this.tone(784,0,.16,'triangle',.22); this.tone(1175,.12,.3,'triangle',.22); },
  wrong(){ this.tone(196,0,.3,'sawtooth',.1); this.tone(147,.14,.4,'sawtooth',.1); },
  tick(){ this.tone(880,0,.05,'square',.06); },
  pop(){ this.tone(660,0,.08,'sine',.12); },
  win(){ [523,659,784].forEach((f,i)=>this.tone(f,i*.15,.22,'square',.09)); this.tone(1047,.45,.8,'triangle',.2); this.tone(784,.45,.8,'triangle',.1); }
};

/* 用 Pointer Events 的輕觸判定（捲動中不算點擊） */
export function onTap(el,handler){
  const starts=new Map();
  el.addEventListener('pointerdown',e=>starts.set(e.pointerId,{x:e.clientX,y:e.clientY,target:e.target}));
  el.addEventListener('pointerup',e=>{
    const s=starts.get(e.pointerId); starts.delete(e.pointerId);
    if(!s||Math.hypot(e.clientX-s.x,e.clientY-s.y)>18) return;
    handler(e,s.target);
  });
  el.addEventListener('pointercancel',e=>starts.delete(e.pointerId));
}
export function replayAnim(el,cls){ el.classList.remove(cls); void el.getBoundingClientRect(); el.classList.add(cls); }
export function tween(from,to,ms,onUpdate,ease){
  ease=ease||(p=>1-Math.pow(1-p,3));
  let start=null, alive=true, id=0;
  const step=ts=>{ if(!alive) return; if(start===null) start=ts; const p=Math.min(1,(ts-start)/ms); onUpdate(from+(to-from)*ease(p)); if(p<1) id=requestAnimationFrame(step); };
  id=requestAnimationFrame(step);
  return ()=>{ alive=false; cancelAnimationFrame(id); };
}
