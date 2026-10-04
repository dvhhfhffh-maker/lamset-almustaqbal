const $=id=>document.getElementById(id);
let me=null,token=null,room=null,pollTimer=null,tick=null,lastSeq=0,busy=false;

async function api(path,options={}){
  const response=await fetch('/party-api/'+path,{cache:'no-store',...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});
  const data=await response.json().catch(()=>({ok:false,error:'تعذر قراءة رد الخادم.'}));
  if(!response.ok||data.ok===false)throw new Error(data.error||'حدث خطأ في الاتصال.');
  return data;
}
function esc(s){return String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
function show(section){['home','lobby','game','results'].forEach(x=>$(x).classList.toggle('hidden',x!==section));}
function player(){return room?.players.find(p=>p.id===me);}
function setConn(text){$('conn').textContent=text;}
function sessionQuery(){return 'code='+encodeURIComponent(room.code)+'&id='+encodeURIComponent(me)+'&token='+encodeURIComponent(token);}

async function createRoom(){
  if(busy)return;busy=true;setConn('إنشاء الغرفة...');
  try{
    const d=await api('create',{method:'POST',body:JSON.stringify({
      name:$('cn').value.trim(),roomName:$('rn').value.trim(),mode:$('mode').value,
      targetScore:Number($('target').value)||5,maxRounds:10
    })});
    me=d.id;token=d.token;room=d.state;setConn('متصل 🟢');render();startPolling();
  }catch(e){setConn('خطأ 🔴');alert(e.message);}finally{busy=false;}
}
async function joinRoom(){
  if(busy)return;
  const code=$('jc').value.trim().toUpperCase();
  if(code.length!==5){alert('أدخل كود الغرفة من 5 أحرف.');return;}
  busy=true;setConn('دخول الغرفة...');
  try{
    const d=await api('join',{method:'POST',body:JSON.stringify({name:$('jn').value.trim(),code})});
    me=d.id;token=d.token;room=d.state;setConn('متصل 🟢');render();startPolling();
  }catch(e){setConn('خطأ 🔴');alert(e.message);}finally{busy=false;}
}
async function sendAction(type,data={}){
  if(!room||!me||!token)return;
  try{
    const d=await api('action',{method:'POST',body:JSON.stringify({code:room.code,id:me,token,type,data})});
    room=d.state;setConn('متصل 🟢');render();
  }catch(e){setConn('إعادة اتصال...');alert(e.message);}
}
function startPolling(){
  clearInterval(pollTimer);
  const poll=async()=>{
    if(!room||!me||!token)return;
    try{
      const r=await fetch('/party-api/state?'+sessionQuery(),{cache:'no-store'});
      const d=await r.json();
      if(!r.ok||d.ok===false)throw new Error(d.error||'فشل التحديث');
      room=d.state;setConn('متصل 🟢');handleLatestEvent();render();
    }catch(e){setConn('الاتصال ضعيف 🟠');}
  };
  poll();
  pollTimer=setInterval(poll,1000);
}
function handleLatestEvent(){
  const e=room?.lastEvent;if(!e||e.seq<=lastSeq)return;
  lastSeq=e.seq;
  if(e.kind==='pun')popup('😈',e.title,e.text);
  else if(e.kind==='ok')popup('✅',e.title,e.text);
  else if(e.kind==='reaction')floatEmoji(e.title);
  else if(e.kind==='finished')popup('🏆',e.title,e.text);
  else if(e.kind==='info')popup('ℹ️',e.title,e.text);
}
function canStart(){const online=room?.players.filter(p=>p.online)||[];return me===room?.hostId&&online.length>=2&&online.every(p=>p.ready);}
function render(){
  if(!room)return;
  handleLatestEvent();
  if(room.phase==='lobby'){show('lobby');renderLobby();}
  else if(room.phase==='playing'){show('game');renderGame();}
  else{show('results');renderResults();}
  renderChats();
}
function renderLobby(){
  $('lt').textContent='🔥 '+room.name;
  $('code').textContent=room.code;
  $('players').innerHTML=room.players.map(p=>'<div class="player '+(!p.online?'offline':'')+'"><b>'+p.avatar+' '+(p.id===room.hostId?'👑 ':'')+esc(p.name)+'</b><div class="'+(p.ready?'ready':'')+'">'+(p.online?(p.ready?'READY ✅':'غير جاهز'):'Offline')+'</div></div>').join('');
  const mine=player();$('ready').textContent=mine?.ready?'إلغاء الجاهزية':'أنا جاهز ✅';
  $('start').classList.toggle('hidden',me!==room.hostId);$('start').disabled=!canStart();
  $('ls').textContent=canStart()?'الجميع جاهز! ابدأ 🔥':'ينتظر جاهزية اللاعبين...';
}
function renderGame(){
  $('round').textContent='الجولة '+room.round+' / '+room.maxRounds;
  $('scores').innerHTML=room.players.map((p,i)=>'<div class="score '+(i===room.currentPlayerIndex?'current':'')+'"><b>'+p.avatar+' '+esc(p.name)+'</b><div>'+p.score+' نقطة</div></div>').join('');
  const cp=room.players[room.currentPlayerIndex],mine=cp?.id===me,p=room.prompt||{};
  $('turn').textContent=mine?'🔥 دورك الآن':'الدور على '+(cp?.name||'');
  $('opts').innerHTML='';$('textbox').classList.add('hidden');$('wait').textContent=mine?'':'انتظر دورك...';
  if(p.kind==='question'){
    $('kind').textContent='🧠 سؤال';$('pt').textContent=p.text;
    if(mine)p.options.forEach((o,i)=>{const b=document.createElement('button');b.className='btn btn2';b.textContent=o;b.onclick=()=>sendAction('answer',{value:i});$('opts').appendChild(b);});
  }else if(p.kind==='end'){
    $('kind').textContent='🔤 نهاية الحرف';$('pt').textContent='اكتب كلمة تنتهي بحرف: '+p.letter;if(mine)$('textbox').classList.remove('hidden');
  }else if(p.kind==='chain'){
    $('kind').textContent='⛓️ آخر حرف';$('pt').textContent='بعد «'+p.previous+'» — كلمة تبدأ بـ '+p.letter;if(mine)$('textbox').classList.remove('hidden');
  }else if(p.kind==='story'){
    $('kind').textContent='✍️ قصة بلا حرف';$('pt').textContent='اكتب قصة قصيرة بدون حرف: '+p.letter;if(mine)$('textbox').classList.remove('hidden');
  }
  runTimer();
}
function runTimer(){
  clearInterval(tick);
  const update=()=>{const s=Math.max(0,Math.ceil((((room&&room.turnEndsAt)||Date.now())-Date.now())/1000));$('timer').textContent='00:'+String(s).padStart(2,'0');};
  update();tick=setInterval(update,250);
}
function renderChats(){
  const html=(room?.chat||[]).map(m=>'<div class="msg"><b>'+esc(m.name)+':</b> '+esc(m.text)+'</div>').join('');
  ['chat1','chat2'].forEach(id=>{const el=$(id);if(el){el.innerHTML=html;el.scrollTop=el.scrollHeight;}});
}
function popup(a,b,c){
  $('ove').textContent=a;$('ovt').textContent=b||'';$('ovx').textContent=c||'';$('ov').classList.add('show');setTimeout(()=>$('ov').classList.remove('show'),2200);
}
function floatEmoji(x){const d=document.createElement('div');d.className='float';d.textContent=x;d.style.left=(15+Math.random()*70)+'%';document.body.appendChild(d);setTimeout(()=>d.remove(),1600);}
function renderResults(){
  clearInterval(tick);const r=[...room.players].sort((a,b)=>b.score-a.score);
  $('winner').textContent=r[0]?r[0].avatar+' '+r[0].name+' — '+r[0].score+' نقطة':'';
  $('rank').innerHTML=r.map((p,i)=>'<div class="rank">'+(['🥇','🥈','🥉'][i]||'🎮')+' '+esc(p.name)+' — '+p.score+'</div>').join('');
}
async function shareRoom(){
  const url=location.origin+'/play?room='+room.code;
  const text='انضم إلى غرفتي في تحدّي الأصحاب 🎮\nالكود: '+room.code+'\n'+url;
  if(navigator.share){try{await navigator.share({title:'تحدّي الأصحاب',text,url});}catch{}}
  else{await navigator.clipboard.writeText(text);alert('تم نسخ الرابط والكود ✅');}
}
function sendChat(id){const el=$(id),text=el.value.trim();if(text){sendAction('chat',{text});el.value='';}}

$('createBtn').onclick=createRoom;
$('joinBtn').onclick=joinRoom;
$('ready').onclick=()=>sendAction('ready');
$('start').onclick=()=>sendAction('start');
$('share').onclick=shareRoom;
$('submit').onclick=()=>{const v=$('ans').value.trim();if(v){sendAction('answer',{value:v});$('ans').value='';}};
$('send1').onclick=()=>sendChat('ci1');$('send2').onclick=()=>sendChat('ci2');
$('again').onclick=()=>location.href='/play';
$('ov').onclick=()=>$('ov').classList.remove('show');
$('reacts').addEventListener('click',e=>{if(e.target.classList.contains('react'))sendAction('reaction',{emoji:e.target.textContent});});
['ci1','ci2'].forEach(id=>$(id).addEventListener('keydown',e=>{if(e.key==='Enter')sendChat(id);}));
const invite=new URLSearchParams(location.search).get('room');if(invite)$('jc').value=invite.toUpperCase();
setConn('جاهز ✅');
