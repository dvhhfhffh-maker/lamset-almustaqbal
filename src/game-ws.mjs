import { WebSocketServer, WebSocket } from 'ws';
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

const wordList = [
  'كتاب','بيت','تفاحة','أسد','دجاج','قمر','بحر','نمر','سكر','سيارة','طائرة','مدرسة','جامعة','شجرة',
  'ورد','باب','نافذة','هاتف','حاسوب','ماء','شمس','ليل','نهار','طريق','مدينة','رياضة','كرة','ملعب',
  'صديق','قصة','علم','تاريخ','تقنية','ذكاء','لغز','سؤال','جواب','قلم','مكتب','كرسي','غرفة','مطار',
  'قطار','سفينة','جبل','وادي','صحراء','حديقة','برتقال','موز','عنب','تفاح','رمان','خبز','حليب',
  'قهوة','شاي','نجم','سماء','سحاب','مطر','ريح','صوت','صورة','فيديو','لعبة','فريق','هدف','حارس',
  'مدرب','لاعب','نهر','قارب','زهرة','طائر','سمك','حوت','عصفور','منزل','شارع','جسر','مكتبة','معلم','طالب','درس','ورقة'
];

const letters = 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي'.split('');
const avatars = ['😎','🦁','🐼','🦊','🔥','😂'];

function normalizeArabic(value='') {
  return String(value).trim()
    .replace(/[ًٌٍَُِّْـ]/g,'')
    .replace(/[أإآٱ]/g,'ا')
    .replace(/ى/g,'ي')
    .replace(/ؤ/g,'و')
    .replace(/ئ/g,'ي');
}
const wordSet = new Set(wordList.map(normalizeArabic));
function firstLetter(value){ const n=normalizeArabic(value); return n[0] || ''; }
function lastLetter(value){ const n=normalizeArabic(value); const c=n[n.length-1] || ''; return c === 'ة' ? 'ت' : c; }
function pick(items){ return items[Math.floor(Math.random()*items.length)]; }
function safeText(value,max=24){ return String(value ?? '').trim().slice(0,max); }
function makeRoomCode(){
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code='';
  do {
    code='';
    for(let i=0;i<5;i++) code+=pick(chars);
  } while(rooms.has(code));
  return code;
}
function isOpen(ws){ return ws && ws.readyState === WebSocket.OPEN; }

function publicState(room){
  return {
    code:room.code,name:room.name,hostId:room.hostId,phase:room.phase,mode:room.mode,
    targetScore:room.targetScore,maxRounds:room.maxRounds,round:room.round,
    currentPlayerIndex:room.currentPlayerIndex,turnEndsAt:room.turnEndsAt,prompt:room.prompt,
    chatEnabled:room.chatEnabled,chat:room.chat.slice(-50),
    players:room.players.map(function(player){
      return {id:player.id,name:player.name,avatar:player.avatar,score:player.score,ready:player.ready,online:player.online};
    })
  };
}
function send(ws,payload){ if(isOpen(ws)) ws.send(JSON.stringify(payload)); }
function broadcast(room,payload){ for(const player of room.players) send(player.socket,payload); }
function broadcastState(room){ broadcast(room,{type:'state',state:publicState(room)}); }
function event(room,kind,title,text=''){
  room.eventSeq += 1;
  const data={kind:kind,title:title,text:text,seq:room.eventSeq,at:Date.now()};
  broadcast(room,{type:'event',event:data});
  broadcastState(room);
}
function nextPunishment(room){
  let available=punishments.map(function(_,i){return i;}).filter(function(i){return !room.usedPunishments.has(i);});
  if(!available.length){ room.usedPunishments.clear(); available=punishments.map(function(_,i){return i;}); }
  const index=pick(available);
  room.usedPunishments.add(index);
  return punishments[index];
}
function nextQuestion(room){
  let available=questions.map(function(_,i){return i;}).filter(function(i){return !room.usedQuestions.has(i);});
  if(!available.length){ room.usedQuestions.clear(); available=questions.map(function(_,i){return i;}); }
  const index=pick(available);
  room.usedQuestions.add(index);
  return {kind:'question',questionIndex:index,text:questions[index][0],options:questions[index][2]};
}
function makePrompt(room){
  let kind=room.mode;
  if(kind==='mixed') kind=pick(['question','end','chain','story']);
  if(kind==='question') return nextQuestion(room);
  if(kind==='end') return {kind:'end',letter:pick(letters)};
  if(kind==='chain'){
    const previous=pick(wordList);
    room.usedWords.add(normalizeArabic(previous));
    return {kind:'chain',previous:previous,letter:lastLetter(previous)};
  }
  return {kind:'story',letter:pick(letters)};
}
function clearTurnTimer(room){ if(room.timer){ clearTimeout(room.timer); room.timer=null; } }
function finish(room){ clearTurnTimer(room); room.phase='finished'; room.turnEndsAt=null; room.prompt=null; broadcastState(room); }
function shouldFinish(room){
  const highest=Math.max.apply(null,room.players.map(function(p){return p.score;}));
  if(highest>=room.targetScore || room.round>room.maxRounds){ finish(room); return true; }
  return false;
}
function startTurn(room){
  if(room.phase!=='playing') return;
  clearTurnTimer(room);
  room.prompt=makePrompt(room);
  room.turnEndsAt=Date.now()+20000;
  const expectedRound=room.round;
  const expectedPlayer=room.currentPlayerIndex;
  room.timer=setTimeout(function(){
    if(room.phase!=='playing' || room.round!==expectedRound || room.currentPlayerIndex!==expectedPlayer) return;
    event(room,'pun','انتهى الوقت ⏰',nextPunishment(room));
    setTimeout(function(){advance(room);},2300);
  },20100);
  broadcastState(room);
}
function advance(room){
  if(room.phase!=='playing') return;
  clearTurnTimer(room);
  room.currentPlayerIndex=(room.currentPlayerIndex+1)%room.players.length;
  if(room.currentPlayerIndex===0) room.round += 1;
  if(shouldFinish(room)) return;
  startTurn(room);
}
function validateAnswer(room,player,value){
  if(room.phase!=='playing' || room.players[room.currentPlayerIndex]?.id!==player.id) return;
  clearTurnTimer(room);
  const prompt=room.prompt;
  if(!prompt) return;
  let ok=false;
  let title='';

  if(prompt.kind==='question'){
    const correct=questions[prompt.questionIndex][1];
    const options=questions[prompt.questionIndex][2];
    const selected=Number.isInteger(value) ? options[value] : '';
    ok=selected===correct;
    title=ok?'إجابة صحيحة 🎉':'إجابة خاطئة 😈';
  } else if(prompt.kind==='end'){
    const word=normalizeArabic(value);
    ok=wordSet.has(word) && lastLetter(word)===normalizeArabic(prompt.letter) && !room.usedWords.has(word);
    if(ok) room.usedWords.add(word);
    title=ok?'كلمة صحيحة ✅':'الكلمة غير صحيحة أو مكررة';
  } else if(prompt.kind==='chain'){
    const word=normalizeArabic(value);
    ok=wordSet.has(word) && firstLetter(word)===normalizeArabic(prompt.letter) && !room.usedWords.has(word);
    if(ok) room.usedWords.add(word);
    title=ok?'سلسلة صحيحة ✅':'الكلمة لا تبدأ بالحرف المطلوب أو مكررة';
  } else if(prompt.kind==='story'){
    const story=String(value ?? '').trim();
    const normalized=normalizeArabic(story);
    const blocked=normalizeArabic(prompt.letter);
    const count=[...normalized].filter(function(char){return char===blocked;}).length;
    const words=story.split(/\s+/).filter(Boolean).length;
    ok=count===0 && words>=5;
    title=ok?'القصة اجتازت فحص الحرف ✅':(count>0?'وجدنا الحرف المحظور '+count+' مرة ❌':'القصة قصيرة جدًا');
  }

  if(ok){
    player.score += 1;
    event(room,'ok',title,'+1 نقطة');
    if(shouldFinish(room)) return;
    setTimeout(function(){advance(room);},1500);
  } else {
    event(room,'pun',title,nextPunishment(room));
    setTimeout(function(){advance(room);},2400);
  }
}
function startGame(room,player){
  if(player.id!==room.hostId || room.phase!=='lobby') return;
  if(room.players.length<2 || !room.players.every(function(p){return p.ready && p.online;})){
    send(player.socket,{type:'error',message:'يجب أن يكون جميع اللاعبين جاهزين.'});
    return;
  }
  room.phase='playing'; room.round=1; room.currentPlayerIndex=0;
  room.players.forEach(function(p){p.score=0;});
  room.usedQuestions.clear(); room.usedPunishments.clear(); room.usedWords.clear();
  event(room,'info','بدأ التحدي 🔥');
  setTimeout(function(){startTurn(room);},800);
}
function leavePlayer(ws){
  const session=ws.gameSession || {};
  if(!session.roomCode || !session.playerId) return;
  const room=rooms.get(session.roomCode);
  if(!room) return;
  const player=room.players.find(function(p){return p.id===session.playerId;});
  if(player) player.online=false;
  if(room.hostId===session.playerId){
    const next=room.players.find(function(p){return p.online;});
    if(next){ room.hostId=next.id; event(room,'info',next.name+' أصبح المضيف 👑'); }
  }
  if(!room.players.some(function(p){return p.online;})){
    clearTurnTimer(room);
    room.cleanupTimer=setTimeout(function(){
      const current=rooms.get(session.roomCode);
      if(current && !current.players.some(function(p){return p.online;})) rooms.delete(session.roomCode);
    },10*60*1000);
  } else {
    broadcastState(room);
  }
}

export function attachGameWebSocketServer(server){
  const wss=new WebSocketServer({noServer:true});

  server.on('upgrade',function(request,socket,head){
    let pathname;
    try{ pathname=new URL(request.url,'http://localhost').pathname; }catch{ socket.destroy(); return; }
    if(pathname!=='/game-ws') return;
    wss.handleUpgrade(request,socket,head,function(ws){wss.emit('connection',ws,request);});
  });

  wss.on('connection',function(ws){
    ws.gameSession={roomCode:null,playerId:null};

    ws.on('message',function(raw){
      let message;
      try{ message=JSON.parse(String(raw)); }catch{ return; }

      if(message.type==='create'){
        const code=makeRoomCode();
        const id=randomUUID();
        const player={id:id,name:safeText(message.name,20)||'المضيف',avatar:pick(avatars),score:0,ready:false,online:true,socket:ws};
        const room={
          code:code,name:safeText(message.roomName,24)||'غرفة الأصدقاء',hostId:id,phase:'lobby',
          mode:['mixed','question','end','chain','story'].includes(message.mode)?message.mode:'mixed',
          targetScore:[5,10,15,20].includes(Number(message.targetScore))?Number(message.targetScore):5,
          maxRounds:[5,10,15,20].includes(Number(message.maxRounds))?Number(message.maxRounds):10,
          round:0,currentPlayerIndex:0,turnEndsAt:null,prompt:null,chatEnabled:true,chat:[],players:[player],
          usedQuestions:new Set(),usedPunishments:new Set(),usedWords:new Set(),eventSeq:0,timer:null,cleanupTimer:null
        };
        rooms.set(code,room);
        ws.gameSession={roomCode:code,playerId:id};
        send(ws,{type:'joined',id:id,state:publicState(room)});
        return;
      }

      if(message.type==='join'){
        const code=safeText(message.code,5).toUpperCase();
        const room=rooms.get(code);
        if(!room){ send(ws,{type:'error',message:'الغرفة غير موجودة.'}); return; }
        if(room.phase!=='lobby'){ send(ws,{type:'error',message:'اللعبة بدأت بالفعل.'}); return; }
        if(room.players.length>=4){ send(ws,{type:'error',message:'الغرفة ممتلئة.'}); return; }
        const id=randomUUID();
        const player={id:id,name:safeText(message.name,20)||'لاعب',avatar:pick(avatars),score:0,ready:false,online:true,socket:ws};
        room.players.push(player);
        ws.gameSession={roomCode:code,playerId:id};
        send(ws,{type:'joined',id:id,state:publicState(room)});
        event(room,'info',player.name+' انضم للغرفة 🎮');
        return;
      }

      const session=ws.gameSession || {};
      const room=rooms.get(session.roomCode);
      const player=room?.players.find(function(p){return p.id===session.playerId;});
      if(!room || !player) return;

      if(message.type==='ready' && room.phase==='lobby'){
        player.ready=!player.ready; broadcastState(room);
      } else if(message.type==='start'){
        startGame(room,player);
      } else if(message.type==='answer'){
        validateAnswer(room,player,message.value);
      } else if(message.type==='chat' && room.chatEnabled){
        const text=safeText(message.text,120);
        if(text){
          room.chat.push({id:randomUUID(),playerId:player.id,name:player.name,text:text,at:Date.now()});
          if(room.chat.length>100) room.chat.shift();
          broadcastState(room);
        }
      } else if(message.type==='reaction'){
        const emoji=['😂','🔥','😈','👏','🤦','💀'].includes(message.emoji)?message.emoji:'😂';
        broadcast(room,{type:'reaction',emoji:emoji,playerId:player.id,name:player.name});
      }
    });

    ws.on('close',function(){leavePlayer(ws);});
    ws.on('error',function(){leavePlayer(ws);});
  });

  return wss;
}
