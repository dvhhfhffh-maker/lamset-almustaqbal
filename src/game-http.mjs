import express from 'express';
import { randomUUID } from 'node:crypto';

const rooms = new Map();
const questions = [
  ['ما هي عاصمة اليابان؟','طوكيو',['طوكيو','سيول','بكين','بانكوك']],
  ['كم عدد كواكب المجموعة الشمسية؟','8',['7','8','9','10']],
  ['ما أكبر محيط في العالم؟','المحيط الهادئ',['الأطلسي','الهندي','المحيط الهادئ','المتجمد']],
  ['ما الكوكب المعروف بالكوكب الأحمر؟','المريخ',['الزهرة','المريخ','المشتري','عطارد']],
  ['ما عاصمة السعودية؟','الرياض',['جدة','الرياض','مكة','الدمام']],
  ['كم ضلعًا للمثلث؟','3',['2','3','4','5']],
  ['أي عضو يضخ الدم؟','القلب',['الرئة','الكبد','القلب','المعدة']],
  ['كم دقيقة في الساعة؟','60',['30','45','60','90']],
  ['أي دولة تشتهر ببرج إيفل؟','فرنسا',['إيطاليا','فرنسا','إسبانيا','ألمانيا']],
  ['ما ناتج 9 × 7؟','63',['54','56','63','72']],
  ['ما عكس كلمة سريع؟','بطيء',['قوي','بطيء','قصير','هادئ']],
  ['كم شهرًا في السنة؟','12',['10','11','12','13']],
  ['أي حاسة نستخدمها لسماع الموسيقى؟','السمع',['البصر','السمع','الشم','اللمس']],
  ['أي قارة تقع فيها مصر؟','أفريقيا',['آسيا','أفريقيا','أوروبا','أمريكا']],
  ['ما أكبر كوكب في المجموعة الشمسية؟','المشتري',['الأرض','زحل','المشتري','نبتون']],
  ['صح أم خطأ: الماء يتجمد عند 0° مئوية.','صح',['صح','خطأ']],
  ['أي من هذه رياضة جماعية؟','كرة القدم',['الجري','السباحة','كرة القدم','رفع الأثقال']],
  ['ما الجهاز المستخدم لقياس درجة الحرارة؟','الترمومتر',['البوصلة','الترمومتر','المجهر','البارومتر']],
  ['أي حيوان يُعرف بملك الغابة؟','الأسد',['الأسد','الحصان','الفيل','الذئب']],
  ['من أسرع؟','الضوء',['الصوت','الضوء','متساويان','لا شيء']]
];

const punishments = [
  'قلّد أحد اللاعبين لمدة 30 ثانية 😂','تكلم بصوت طفل لجولة 👶','قم بـ10 Squats 💪','قل نكتة 😄',
  'غنِّ مقطعًا قصيرًا 🎤','ابقَ صامتًا حتى دورك القادم 🤐','مثّل شخصية مشهورة لمدة 20 ثانية 🎭',
  'تحدث بلهجة يختارها الأصدقاء 😎','اذكر 5 أسماء خلال 10 ثوانٍ ⏱️','قل جملة مضحكة يختارها أصدقاؤك 🤣',
  'امشِ كأنك روبوت لمدة 20 ثانية 🤖','اذكر 3 أشياء تحبها بسرعة ⚡'
];
const wordList = ['كتاب','بيت','تفاحة','أسد','دجاج','قمر','بحر','نمر','سكر','سيارة','طائرة','مدرسة','جامعة','شجرة','ورد','باب','نافذة','هاتف','حاسوب','ماء','شمس','ليل','نهار','طريق','مدينة','رياضة','كرة','ملعب','صديق','قصة','علم','تاريخ','تقنية','ذكاء','لغز','سؤال','جواب','قلم','مكتب','كرسي','غرفة','مطار','قطار','سفينة','جبل','وادي','صحراء','حديقة','برتقال','موز','عنب','تفاح','رمان','خبز','حليب','قهوة','شاي','نجم','سماء','سحاب','مطر','ريح','صوت','صورة','فيديو','لعبة','فريق','هدف','حارس','مدرب','لاعب','نهر','قارب','زهرة','طائر','سمك','حوت','عصفور','منزل','شارع','جسر','مكتبة','معلم','طالب','درس','ورقة'];
const letters='ابتثجحخدذرزسشصضطظعغفقكلمنهوي'.split('');
const avatars=['😎','🦁','🐼','🦊','🔥','😂'];

function norm(v=''){return String(v).trim().replace(/[ًٌٍَُِّْـ]/g,'').replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ؤ/g,'و').replace(/ئ/g,'ي');}
const wordSet=new Set(wordList.map(norm));
function first(v){const n=norm(v);return n[0]||'';}
function last(v){const n=norm(v),c=n[n.length-1]||'';return c==='ة'?'ت':c;}
function pick(a){return a[Math.floor(Math.random()*a.length)];}
function clean(v,max=24){return String(v??'').trim().slice(0,max);}
function makeCode(){const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let c='';do{c='';for(let i=0;i<5;i++)c+=pick(chars);}while(rooms.has(c));return c;}
function touch(room,player){player.lastSeen=Date.now();player.online=true;refreshPresence(room);}
function refreshPresence(room){
  const now=Date.now();
  room.players.forEach(p=>{if(now-p.lastSeen>12000)p.online=false;});
  const host=room.players.find(p=>p.id===room.hostId);
  if(host&&!host.online){const next=room.players.find(p=>p.online);if(next){room.hostId=next.id;setEvent(room,'info',next.name+' أصبح المضيف 👑');}}
}
function publicState(room){
  refreshPresence(room);
  return {
    code:room.code,name:room.name,hostId:room.hostId,phase:room.phase,mode:room.mode,targetScore:room.targetScore,maxRounds:room.maxRounds,
    round:room.round,currentPlayerIndex:room.currentPlayerIndex,turnEndsAt:room.turnEndsAt,prompt:room.prompt,chatEnabled:true,
    chat:room.chat.slice(-50),lastEvent:room.lastEvent,
    players:room.players.map(p=>({id:p.id,name:p.name,avatar:p.avatar,score:p.score,ready:p.ready,online:p.online}))
  };
}
function setEvent(room,kind,title,text=''){
  room.eventSeq++;room.lastEvent={kind,title,text,seq:room.eventSeq,at:Date.now()};
}
function unusedIndex(total,used){let a=Array.from({length:total},(_,i)=>i).filter(i=>!used.has(i));if(!a.length){used.clear();a=Array.from({length:total},(_,i)=>i);}const i=pick(a);used.add(i);return i;}
function nextQuestion(room){const i=unusedIndex(questions.length,room.usedQuestions);return{kind:'question',questionIndex:i,text:questions[i][0],options:questions[i][2]};}
function nextPun(room){return punishments[unusedIndex(punishments.length,room.usedPunishments)];}
function prompt(room){let k=room.mode;if(k==='mixed')k=pick(['question','end','chain','story']);if(k==='question')return nextQuestion(room);if(k==='end')return{kind:'end',letter:pick(letters)};if(k==='chain'){const w=pick(wordList);room.usedWords.add(norm(w));return{kind:'chain',previous:w,letter:last(w)};}return{kind:'story',letter:pick(letters)};}
function clearTimer(room){if(room.timer){clearTimeout(room.timer);room.timer=null;}}
function finish(room){clearTimer(room);room.phase='finished';room.turnEndsAt=null;room.prompt=null;setEvent(room,'finished','انتهت اللعبة 🏆','');}
function shouldFinish(room){if(Math.max(...room.players.map(p=>p.score))>=room.targetScore||room.round>room.maxRounds){finish(room);return true;}return false;}
function startTurn(room){
  if(room.phase!=='playing')return;clearTimer(room);room.prompt=prompt(room);room.turnEndsAt=Date.now()+20000;
  const rr=room.round,cc=room.currentPlayerIndex;
  room.timer=setTimeout(()=>{if(room.phase!=='playing'||room.round!==rr||room.currentPlayerIndex!==cc)return;setEvent(room,'pun','انتهى الوقت ⏰',nextPun(room));setTimeout(()=>advance(room),2300);},20100);
}
function advance(room){if(room.phase!=='playing')return;clearTimer(room);room.currentPlayerIndex=(room.currentPlayerIndex+1)%room.players.length;if(room.currentPlayerIndex===0)room.round++;if(shouldFinish(room))return;startTurn(room);}
function answer(room,player,value){
  if(room.phase!=='playing'||room.players[room.currentPlayerIndex]?.id!==player.id||!room.prompt)return;
  clearTimer(room);const p=room.prompt;let ok=false,title='';
  if(p.kind==='question'){const q=questions[p.questionIndex];ok=Number.isInteger(value)&&q[2][value]===q[1];title=ok?'إجابة صحيحة 🎉':'إجابة خاطئة 😈';}
  else if(p.kind==='end'){const w=norm(value);ok=wordSet.has(w)&&last(w)===norm(p.letter)&&!room.usedWords.has(w);if(ok)room.usedWords.add(w);title=ok?'كلمة صحيحة ✅':'الكلمة غير صحيحة أو مكررة';}
  else if(p.kind==='chain'){const w=norm(value);ok=wordSet.has(w)&&first(w)===norm(p.letter)&&!room.usedWords.has(w);if(ok)room.usedWords.add(w);title=ok?'سلسلة صحيحة ✅':'الكلمة لا تبدأ بالحرف المطلوب أو مكررة';}
  else{const story=String(value??'').trim(),n=norm(story),b=norm(p.letter),count=[...n].filter(c=>c===b).length,wc=story.split(/\s+/).filter(Boolean).length;ok=count===0&&wc>=5;title=ok?'القصة اجتازت فحص الحرف ✅':count>0?'وجدنا الحرف المحظور '+count+' مرة ❌':'القصة قصيرة جدًا';}
  if(ok){player.score++;setEvent(room,'ok',title,'+1 نقطة');if(shouldFinish(room))return;setTimeout(()=>advance(room),1500);}
  else{setEvent(room,'pun',title,nextPun(room));setTimeout(()=>advance(room),2400);}
}
function createRoom(body){
  const id=randomUUID(),token=randomUUID(),code=makeCode(),now=Date.now();
  const player={id,token,name:clean(body.name,20)||'المضيف',avatar:pick(avatars),score:0,ready:false,online:true,lastSeen:now};
  const room={code,name:clean(body.roomName,24)||'غرفة الأصدقاء',hostId:id,phase:'lobby',mode:['mixed','question','end','chain','story'].includes(body.mode)?body.mode:'mixed',
    targetScore:[5,10,15,20].includes(Number(body.targetScore))?Number(body.targetScore):5,maxRounds:[5,10,15,20].includes(Number(body.maxRounds))?Number(body.maxRounds):10,
    round:0,currentPlayerIndex:0,turnEndsAt:null,prompt:null,chat:[],players:[player],usedQuestions:new Set(),usedPunishments:new Set(),usedWords:new Set(),eventSeq:0,lastEvent:null,timer:null};
  rooms.set(code,room);return{room,player};
}
function auth(bodyOrQuery){
  const code=clean(bodyOrQuery.code,5).toUpperCase(),room=rooms.get(code);if(!room)return{error:'الغرفة غير موجودة.'};
  const player=room.players.find(p=>p.id===bodyOrQuery.id&&p.token===bodyOrQuery.token);if(!player)return{error:'انتهت جلسة اللاعب. أعد الدخول للغرفة.'};
  touch(room,player);return{room,player};
}

export function attachGameHttpRoutes(app){
  const router=express.Router();
  router.use(express.json({limit:'16kb'}));
  router.use((req,res,next)=>{res.set('Cache-Control','no-store');next();});

  router.post('/create',(req,res)=>{const {room,player}=createRoom(req.body||{});res.json({ok:true,id:player.id,token:player.token,state:publicState(room)});});
  router.post('/join',(req,res)=>{
    const body=req.body||{},code=clean(body.code,5).toUpperCase(),room=rooms.get(code);
    if(!room)return res.status(404).json({ok:false,error:'الغرفة غير موجودة.'});
    refreshPresence(room);
    if(room.phase!=='lobby')return res.status(409).json({ok:false,error:'اللعبة بدأت بالفعل.'});
    if(room.players.filter(p=>p.online).length>=4)return res.status(409).json({ok:false,error:'الغرفة ممتلئة.'});
    const id=randomUUID(),token=randomUUID();
    const player={id,token,name:clean(body.name,20)||'لاعب',avatar:pick(avatars),score:0,ready:false,online:true,lastSeen:Date.now()};
    room.players.push(player);setEvent(room,'info',player.name+' انضم للغرفة 🎮');
    res.json({ok:true,id,token,state:publicState(room)});
  });
  router.get('/state',(req,res)=>{
    const a=auth(req.query);if(a.error)return res.status(401).json({ok:false,error:a.error});
    res.json({ok:true,state:publicState(a.room)});
  });
  router.post('/action',(req,res)=>{
    const body=req.body||{},a=auth(body);if(a.error)return res.status(401).json({ok:false,error:a.error});
    const {room,player}=a,type=body.type,data=body.data||{};
    if(type==='ready'&&room.phase==='lobby'){player.ready=!player.ready;}
    else if(type==='start'){
      if(player.id!==room.hostId)return res.status(403).json({ok:false,error:'المضيف فقط يستطيع بدء اللعبة.'});
      refreshPresence(room);
      if(room.players.filter(p=>p.online).length<2||!room.players.filter(p=>p.online).every(p=>p.ready))return res.status(409).json({ok:false,error:'يجب أن يكون اللاعبون المتصلون جاهزين.'});
      room.phase='playing';room.round=1;room.currentPlayerIndex=0;room.players.forEach(p=>p.score=0);room.usedQuestions.clear();room.usedPunishments.clear();room.usedWords.clear();setEvent(room,'info','بدأ التحدي 🔥');setTimeout(()=>startTurn(room),500);
    }
    else if(type==='answer')answer(room,player,data.value);
    else if(type==='chat'){const t=clean(data.text,120);if(t){room.chat.push({id:randomUUID(),playerId:player.id,name:player.name,text:t,at:Date.now()});if(room.chat.length>100)room.chat.shift();}}
    else if(type==='reaction'){const e=['😂','🔥','😈','👏','🤦','💀'].includes(data.emoji)?data.emoji:'😂';setEvent(room,'reaction',e,player.name);}
    res.json({ok:true,state:publicState(room)});
  });
  app.use('/party-api',router);
}
