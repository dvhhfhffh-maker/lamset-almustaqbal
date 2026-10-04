const $=id=>document.getElementById(id);
const AV=["😎","🦁","🐼","🦊","🔥","😂"];
const LETTERS="ابتثجحخدذرزسشصضطظعغفقكلمنهوي".split("");
const QUESTIONS=[
["ما هي عاصمة اليابان؟","طوكيو",["طوكيو","سيول","بكين","بانكوك"]],
["كم عدد كواكب المجموعة الشمسية؟","8",["7","8","9","10"]],
["ما أكبر محيط في العالم؟","المحيط الهادئ",["الأطلسي","الهندي","المحيط الهادئ","المتجمد"]],
["ما الكوكب المعروف بالكوكب الأحمر؟","المريخ",["الزهرة","المريخ","المشتري","عطارد"]],
["ما عاصمة السعودية؟","الرياض",["جدة","الرياض","مكة","الدمام"]],
["كم ضلعًا للمثلث؟","3",["2","3","4","5"]],
["أي عضو يضخ الدم؟","القلب",["الرئة","الكبد","القلب","المعدة"]],
["كم دقيقة في الساعة؟","60",["30","45","60","90"]],
["أي دولة تشتهر ببرج إيفل؟","فرنسا",["إيطاليا","فرنسا","إسبانيا","ألمانيا"]],
["ما ناتج 9 × 7؟","63",["54","56","63","72"]],
["ما عكس كلمة سريع؟","بطيء",["قوي","بطيء","قصير","هادئ"]],
["كم شهرًا في السنة؟","12",["10","11","12","13"]],
["أي حاسة نستخدمها لسماع الموسيقى؟","السمع",["البصر","السمع","الشم","اللمس"]],
["أي قارة تقع فيها مصر؟","أفريقيا",["آسيا","أفريقيا","أوروبا","أمريكا"]],
["ما أكبر كوكب في المجموعة الشمسية؟","المشتري",["الأرض","زحل","المشتري","نبتون"]],
["صح أم خطأ: الماء يتجمد عند 0° مئوية.","صح",["صح","خطأ"]],
["أي من هذه رياضة جماعية؟","كرة القدم",["الجري","السباحة","كرة القدم","رفع الأثقال"]],
["ما الجهاز المستخدم لقياس درجة الحرارة؟","الترمومتر",["البوصلة","الترمومتر","المجهر","البارومتر"]],
["أي حيوان يُعرف بملك الغابة؟","الأسد",["الأسد","الحصان","الفيل","الذئب"]],
["من أسرع؟","الضوء",["الصوت","الضوء","متساويان","لا شيء"]]
];
const PUN=[
"قلّد أحد اللاعبين لمدة 30 ثانية 😂","تكلم بصوت طفل لجولة 👶","قم بـ10 Squats 💪","قل نكتة 😄",
"غنِّ مقطعًا قصيرًا 🎤","ابقَ صامتًا حتى دورك القادم 🤐","مثّل شخصية مشهورة 20 ثانية 🎭",
"تحدث بلهجة يختارها الأصدقاء 😎","اذكر 5 أسماء خلال 10 ثوانٍ ⏱️","قل جملة مضحكة يختارها أصدقاؤك 🤣",
"امشِ كأنك روبوت 20 ثانية 🤖","اذكر 3 أشياء تحبها بسرعة ⚡"
];
const WORD_LIST=["كتاب","بيت","تفاحة","أسد","دجاج","قمر","بحر","نمر","سكر","سيارة","طائرة","مدرسة","جامعة","شجرة","ورد","باب","نافذة","هاتف","حاسوب","ماء","شمس","ليل","نهار","طريق","مدينة","رياضة","كرة","ملعب","صديق","قصة","علم","تاريخ","تقنية","ذكاء","لغز","سؤال","جواب","قلم","مكتب","كرسي","غرفة","مطار","قطار","سفينة","جبل","وادي","صحراء","حديقة","برتقال","موز","عنب","تفاح","رمان","خبز","حليب","قهوة","شاي","نجم","سماء","سحاب","مطر","ريح","صوت","صورة","فيديو","لعبة","فريق","هدف","حارس","مدرب","لاعب","نهر","قارب","زهرة","طائر","سمك","حوت","عصفور","منزل","شارع","جسر","مكتبة","معلم","طالب","درس","ورقة"];\nconst WORDS=new Set(WORD_LIST.map(norm));
let peer=null,hostConn=null,isHost=false,myId=null,room=null,roomCode=null,tick=null,turnTimer=null,seq=0;
const conns=new Map(),usedQ=new Set(),usedPun=new Set(),usedWords=new Set();
function pick(a){return a[Math.floor(Math.random()*a.length)]}
function norm(s){return String(s||"").trim().replace(/[ًٌٍَُِّْـ]/g,"").replace(/[أإآٱ]/g,"ا").replace(/ى/g,"ي").replace(/ؤ/g,"و").replace(/ئ/g,"ي")}
function first(s){let n=norm(s);return n[0]||""}function last(s){let n=norm(s),c=n[n.length-1]||"";return c==="ة"?"ت":c}
function randomCode(){const c="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";let x="";for(let i=0;i<5;i++)x+=pick(c);return x}
function safe(s,n=20){return String(s||"").trim().slice(0,n)}
function esc(s){return String(s||"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))}
function publicRoom(){return JSON.parse(JSON.stringify(room))}
function broadcast(msg){for(const c of conns.values())if(c.open)c.send(msg)}
function broadcastState(){if(!isHost)return;broadcast({type:"state",state:publicRoom()});render()}
function hostEvent(kind,title,text=""){seq++;let e={kind,title,text,seq,at:Date.now()};broadcast({type:"event",event:e});handleEvent(e);broadcastState()}
function show(section){["home","lobby","game","results"].forEach(x=>$(x).classList.toggle("hidden",x!==section))}
function player(){return room?.players.find(p=>p.id===myId)}
function createPeer(id,onReady){$("conn").textContent="جاري الاتصال...";peer=new Peer(id,{debug:1});peer.on("open",pid=>{$("conn").textContent="متصل 🟢";myId=pid;onReady(pid)});peer.on("error",e=>{console.error(e);$("conn").textContent="خطأ اتصال 🔴";if(e.type==="unavailable-id"&&isHost){setTimeout(createRoom,300)}});peer.on("connection",conn=>{if(!isHost)return conn.close();attachHostConnection(conn)});peer.on("disconnected",()=>{$("conn").textContent="إعادة اتصال...";try{peer.reconnect()}catch{}})}
function createRoom(){if(peer&&!peer.destroyed)peer.destroy();isHost=true;roomCode=randomCode();createPeer("party-"+roomCode.toLowerCase(),pid=>{room={code:roomCode,name:safe($("rn").value,24)||"غرفة الأصدقاء",hostId:pid,phase:"lobby",mode:$("mode").value,target:Number($("target").value)||5,maxRounds:10,round:0,current:0,ends:null,prompt:null,chat:[],players:[{id:pid,name:safe($("cn").value)||"المضيف",avatar:pick(AV),score:0,ready:false,online:true}]};render()})}
function joinRoom(){let code=safe($("jc").value,5).toUpperCase(),name=safe($("jn").value)||"لاعب";if(code.length!==5)return alert("أدخل كود الغرفة من 5 أحرف");isHost=false;roomCode=code;if(peer&&!peer.destroyed)peer.destroy();createPeer(undefined,()=>{hostConn=peer.connect("party-"+code.toLowerCase(),{reliable:true});hostConn.on("open",()=>hostConn.send({type:"join",name}));hostConn.on("data",handleGuestData);hostConn.on("close",()=>{$("conn").textContent="المضيف خرج 🔴";alert("انقطع اتصال المضيف. أنشئوا غرفة جديدة للمتابعة.")});hostConn.on("error",()=>alert("تعذر الاتصال بالغرفة"))})}
function attachHostConnection(conn){conns.set(conn.peer,conn);conn.on("data",m=>handleHostAction(conn,m));conn.on("close",()=>{conns.delete(conn.peer);let p=room?.players.find(x=>x.id===conn.peer);if(p){p.online=false;broadcastState()}})}
function handleHostAction(conn,m){if(!room||!m)return;if(m.type==="join"){if(room.phase!=="lobby")return conn.send({type:"error",message:"اللعبة بدأت بالفعل"});if(room.players.length>=4)return conn.send({type:"error",message:"الغرفة ممتلئة"});if(room.players.some(p=>p.id===conn.peer))return;room.players.push({id:conn.peer,name:safe(m.name)||"لاعب",avatar:pick(AV),score:0,ready:false,online:true});conn.send({type:"joined",id:conn.peer,state:publicRoom()});hostEvent("info",(safe(m.name)||"لاعب")+" انضم 🎮");return}let p=room.players.find(x=>x.id===conn.peer);if(!p)return;if(m.type==="ready"){p.ready=!p.ready;broadcastState()}else if(m.type==="answer")hostAnswer(p,m.value);else if(m.type==="chat")hostChat(p,m.text);else if(m.type==="reaction")hostReaction(p,m.emoji)}
function handleGuestData(m){if(!m)return;if(m.type==="joined"){myId=m.id;room=m.state;render()}else if(m.type==="state"){room=m.state;render()}else if(m.type==="event")handleEvent(m.event);else if(m.type==="reaction")floatEmoji(m.emoji);else if(m.type==="error")alert(m.message)}
function sendAction(type,data={}){if(isHost){let p=player();if(type==="ready"){p.ready=!p.ready;broadcastState()}else if(type==="answer")hostAnswer(p,data.value);else if(type==="chat")hostChat(p,data.text);else if(type==="reaction")hostReaction(p,data.emoji)}else if(hostConn?.open)hostConn.send({type,...data})}
function canStart(){return isHost&&room?.players.length>=2&&room.players.every(p=>p.ready&&p.online)}
function startGame(){if(!canStart())return;usedQ.clear();usedPun.clear();usedWords.clear();room.players.forEach(p=>p.score=0);room.phase="playing";room.round=1;room.current=0;room.prompt=null;hostEvent("info","بدأ التحدي 🔥");setTimeout(startTurn,700)}
function nextQuestion(){let a=QUESTIONS.map((_,i)=>i).filter(i=>!usedQ.has(i));if(!a.length){usedQ.clear();a=QUESTIONS.map((_,i)=>i)}let idx=pick(a);usedQ.add(idx);return{kind:"question",idx,text:QUESTIONS[idx][0],options:QUESTIONS[idx][2]}}
function nextPun(){let a=PUN.map((_,i)=>i).filter(i=>!usedPun.has(i));if(!a.length){usedPun.clear();a=PUN.map((_,i)=>i)}let i=pick(a);usedPun.add(i);return PUN[i]}
function makePrompt(){let k=room.mode==="mixed"?pick(["question","end","chain","story"]):room.mode;if(k==="question")return nextQuestion();if(k==="end")return{kind:"end",letter:pick(LETTERS)};if(k==="chain"){let seed=pick(WORD_LIST);return{kind:"chain",previous:seed,letter:last(seed)}}return{kind:"story",letter:pick(LETTERS)}}
function startTurn(){if(!isHost||room.phase!=="playing")return;clearTimeout(turnTimer);room.prompt=makePrompt();room.ends=Date.now()+20000;let r=room.round,c=room.current;turnTimer=setTimeout(()=>{if(room.phase!=="playing"||room.round!==r||room.current!==c)return;hostEvent("pun","انتهى الوقت ⏰",nextPun());setTimeout(advance,2200)},20100);broadcastState()}
function finishCheck(){if(Math.max(...room.players.map(p=>p.score))>=room.target||room.round>room.maxRounds){clearTimeout(turnTimer);room.phase="finished";room.ends=null;room.prompt=null;broadcastState();return true}return false}
function advance(){if(!isHost||room.phase!=="playing")return;clearTimeout(turnTimer);room.current=(room.current+1)%room.players.length;if(room.current===0)room.round++;if(finishCheck())return;startTurn()}
function hostAnswer(p,v){if(!isHost||room.phase!=="playing"||room.players[room.current]?.id!==p.id)return;clearTimeout(turnTimer);let q=room.prompt,ok=false,title="";if(q.kind==="question"){ok=Number.isInteger(v)&&QUESTIONS[q.idx][2][v]===QUESTIONS[q.idx][1];title=ok?"إجابة صحيحة 🎉":"إجابة خاطئة 😈"}else if(q.kind==="end"){let w=norm(v);ok=WORDS.has(w)&&last(w)===norm(q.letter)&&!usedWords.has(w);if(ok)usedWords.add(w);title=ok?"كلمة صحيحة ✅":"الكلمة غير صحيحة أو مكررة"}else if(q.kind==="chain"){let w=norm(v);ok=WORDS.has(w)&&first(w)===norm(q.letter)&&!usedWords.has(w);if(ok)usedWords.add(w);title=ok?"سلسلة صحيحة ✅":"الكلمة لا تبدأ بالحرف المطلوب أو مكررة"}else{let s=String(v||"").trim(),n=norm(s),count=[...n].filter(c=>c===norm(q.letter)).length,wc=s.split(/\s+/).filter(Boolean).length;ok=count===0&&wc>=5;title=ok?"القصة اجتازت فحص الحرف ✅":count?"وجدنا الحرف المحظور "+count+" مرة ❌":"القصة قصيرة جدًا"}if(ok){p.score++;hostEvent("ok",title,"+1 نقطة");if(finishCheck())return;setTimeout(advance,1400)}else{hostEvent("pun",title,nextPun());setTimeout(advance,2300)}}
function hostChat(p,text){let t=safe(text,120);if(!t)return;room.chat.push({name:p.name,text:t,at:Date.now()});if(room.chat.length>60)room.chat.shift();broadcastState()}
function hostReaction(p,emoji){let e=["😂","🔥","😈","👏","🤦","💀"].includes(emoji)?emoji:"😂";broadcast({type:"reaction",emoji:e,from:p.name});floatEmoji(e)}
function render(){if(!room)return;if(room.phase==="lobby"){show("lobby");renderLobby()}else if(room.phase==="playing"){show("game");renderGame()}else{show("results");renderResults()}renderChats()}
function renderLobby(){$("lt").textContent="🔥 "+room.name;$("code").textContent=room.code;$("players").innerHTML=room.players.map(p=>'<div class="player"><b>'+p.avatar+' '+(p.id===room.hostId?'👑 ':'')+esc(p.name)+'</b><div class="'+(p.ready?'ready':'')+'">'+(p.online?(p.ready?'READY ✅':'غير جاهز'):'Offline')+'</div></div>').join("");let mine=player();$("ready").textContent=mine?.ready?"إلغاء الجاهزية":"أنا جاهز ✅";$("start").classList.toggle("hidden",!isHost);$("start").disabled=!canStart();$("ls").textContent=canStart()?"الجميع جاهز! ابدأ 🔥":"ينتظر جاهزية اللاعبين..."}
function renderGame(){$("round").textContent="الجولة "+room.round+" / "+room.maxRounds;$("scores").innerHTML=room.players.map((p,i)=>'<div class="score '+(i===room.current?'current':'')+'"><b>'+p.avatar+' '+esc(p.name)+'</b><div>'+p.score+' نقطة</div></div>').join("");let cp=room.players[room.current],mine=cp?.id===myId,p=room.prompt||{};$("turn").textContent=mine?"🔥 دورك الآن":"الدور على "+(cp?.name||"");$("opts").innerHTML="";$("textbox").classList.add("hidden");$("wait").textContent=mine?"":"انتظر دورك...";if(p.kind==="question"){$("kind").textContent="🧠 سؤال";$("pt").textContent=p.text;if(mine){p.options.forEach((o,i)=>{let b=document.createElement("button");b.className="btn btn2";b.textContent=o;b.onclick=()=>sendAction("answer",{value:i});$("opts").appendChild(b)})}}else if(p.kind==="end"){$("kind").textContent="🔤 نهاية الحرف";$("pt").textContent="اكتب كلمة تنتهي بحرف: "+p.letter;if(mine)$("textbox").classList.remove("hidden")}else if(p.kind==="chain"){$("kind").textContent="⛓️ آخر حرف";$("pt").textContent="بعد «"+p.previous+"» — كلمة تبدأ بـ "+p.letter;if(mine)$("textbox").classList.remove("hidden")}else if(p.kind==="story"){$("kind").textContent="✍️ قصة بلا حرف";$("pt").textContent="اكتب قصة قصيرة بدون حرف: "+p.letter;if(mine)$("textbox").classList.remove("hidden")}runTimer()}
function runTimer(){clearInterval(tick);let f=()=>{let s=Math.max(0,Math.ceil((((room&&room.ends)||Date.now())-Date.now())/1000));$("timer").textContent="00:"+String(s).padStart(2,"0")};f();tick=setInterval(f,250)}
function renderChats(){let h=(room?.chat||[]).map(m=>'<div class="msg"><b>'+esc(m.name)+':</b> '+esc(m.text)+'</div>').join("");["chat1","chat2"].forEach(x=>{let e=$(x);if(e){e.innerHTML=h;e.scrollTop=e.scrollHeight}})}
function handleEvent(e){if(!e||e.seq<=lastSeq)return;lastSeq=e.seq;if(e.kind==="pun")popup("😈",e.title,e.text);else if(e.kind==="ok")popup("✅",e.title,e.text);else popup("ℹ️",e.title,e.text)}
function popup(a,b,c){$("ove").textContent=a;$("ovt").textContent=b||"";$("ovx").textContent=c||"";$("ov").classList.add("show");setTimeout(()=>$("ov").classList.remove("show"),2200)}
function floatEmoji(x){let d=document.createElement("div");d.className="float";d.textContent=x;d.style.left=(15+Math.random()*70)+"%";document.body.appendChild(d);setTimeout(()=>d.remove(),1600)}
function renderResults(){clearInterval(tick);let r=[...room.players].sort((a,b)=>b.score-a.score);$("winner").textContent=r[0]?r[0].avatar+" "+r[0].name+" — "+r[0].score+" نقطة":"";$("rank").innerHTML=r.map((p,i)=>'<div class="rank">'+(["🥇","🥈","🥉"][i]||"🎮")+' '+esc(p.name)+" — "+p.score+"</div>").join("");for(let i=0;i<24;i++)setTimeout(()=>floatEmoji(["🎉","✨","🔥","🏆"][i%4]),i*70)}
async function shareRoom(){let url=location.origin+"/game.html?room="+room.code,text="انضم إلى غرفتي في تحدّي الأصحاب 🎮\\nالكود: "+room.code+"\\n"+url;if(navigator.share){try{await navigator.share({title:"تحدّي الأصحاب",text,url})}catch{}}else{await navigator.clipboard.writeText(text);alert("تم نسخ الرابط والكود ✅")}}
function sendChat(id){let e=$(id),t=e.value.trim();if(t){sendAction("chat",{text:t});e.value=""}}
$("createBtn").onclick=createRoom;$("joinBtn").onclick=joinRoom;$("ready").onclick=()=>sendAction("ready");$("start").onclick=startGame;$("share").onclick=shareRoom;$("submit").onclick=()=>{let v=$("ans").value.trim();if(v){sendAction("answer",{value:v});$("ans").value=""}};$("send1").onclick=()=>sendChat("ci1");$("send2").onclick=()=>sendChat("ci2");$("again").onclick=()=>location.href="/game.html";$("ov").onclick=()=>$("ov").classList.remove("show");
$("reacts").addEventListener("click",e=>{if(e.target.classList.contains("react"))sendAction("reaction",{emoji:e.target.textContent})});
["ci1","ci2"].forEach(id=>$(id).addEventListener("keydown",e=>{if(e.key==="Enter")sendChat(id)}));
const q=new URLSearchParams(location.search).get("room");if(q)$("jc").value=q.toUpperCase();