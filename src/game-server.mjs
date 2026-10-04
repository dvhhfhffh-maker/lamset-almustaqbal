import { randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';

const rooms = new Map();

const questions = [
  { q:'ما هي عاصمة اليابان؟', a:'طوكيو', o:['طوكيو','سيول','بكين','بانكوك'] },
  { q:'كم عدد كواكب المجموعة الشمسية؟', a:'8', o:['7','8','9','10'] },
  { q:'ما أكبر محيط في العالم؟', a:'المحيط الهادئ', o:['الأطلسي','الهندي','المحيط الهادئ','المتجمد'] },
  { q:'ما الكوكب المعروف بالكوكب الأحمر؟', a:'المريخ', o:['الزهرة','المريخ','المشتري','عطارد'] },
  { q:'ما عاصمة السعودية؟', a:'الرياض', o:['جدة','الرياض','مكة','الدمام'] },
  { q:'كم ضلعًا للمثلث؟', a:'3', o:['2','3','4','5'] },
  { q:'أي عضو يضخ الدم؟', a:'القلب', o:['الرئة','الكبد','القلب','المعدة'] },
  { q:'كم دقيقة في الساعة؟', a:'60', o:['30','45','60','90'] },
  { q:'أي دولة تشتهر ببرج إيفل؟', a:'فرنسا', o:['إيطاليا','فرنسا','إسبانيا','ألمانيا'] },
  { q:'ما ناتج 9 × 7؟', a:'63', o:['54','56','63','72'] },
  { q:'ما عكس كلمة سريع؟', a:'بطيء', o:['قوي','بطيء','قصير','هادئ'] },
  { q:'كم شهرًا في السنة؟', a:'12', o:['10','11','12','13'] },
  { q:'أي حاسة نستخدمها لسماع الموسيقى؟', a:'السمع', o:['البصر','السمع','الشم','اللمس'] },
  { q:'أي قارة تقع فيها مصر؟', a:'أفريقيا', o:['آسيا','أفريقيا','أوروبا','أمريكا'] },
  { q:'ما أكبر كوكب في المجموعة الشمسية؟', a:'المشتري', o:['الأرض','زحل','المشتري','نبتون'] },
  { q:'صح أم خطأ: الماء يتجمد عند 0° مئوية.', a:'صح', o:['صح','خطأ'] },
  { q:'أي من هذه رياضة جماعية؟', a:'كرة القدم', o:['الجري','السباحة','كرة القدم','رفع الأثقال'] },
  { q:'ما الجهاز المستخدم لقياس درجة الحرارة؟', a:'الترمومتر', o:['البوصلة','الترمومتر','المجهر','البارومتر'] },
  { q:'أي حيوان يُعرف بملك الغابة؟', a:'الأسد', o:['الأسد','الحصان','الفيل','الذئب'] },
  { q:'من أسرع؟', a:'الضوء', o:['الصوت','الضوء','متساويان','لا شيء'] }
];

const punishments = [
  'قلّد أحد اللاعبين لمدة 30 ثانية 😂',
  'تكلم بصوت طفل لجولة 👶',
  'قم بـ10 Squats 💪',
  'قل نكتة 😄',
  'غنِّ مقطعًا قصيرًا 🎤',
  'ابقَ صامتًا حتى دورك القادم 🤐',
  'مثّل شخصية مشهورة 20 ثانية 🎭',
  'تحدث بلهجة يختارها الأصدقاء 😎',
  'اذكر 5 أسماء خلال 10 ثوانٍ ⏱️',
  'قل جملة مضحكة يختارها أصدقاؤك 🤣',
  'امشِ كأنك روبوت 20 ثانية 🤖',
  'اذكر 3 أشياء تحبها بسرعة ⚡'
];

const rawWords = [
  'كتاب','بيت','تفاحة','أسد','دجاج','قمر','بحر','نمر','سكر','سيارة','طائرة','مدرسة','جامعة','شجرة','ورد','باب','نافذة','هاتف','حاسوب','ماء',
  'شمس','ليل','نهار','طريق','مدينة','رياضة','كرة','ملعب','صديق','قصة','علم','تاريخ','تقنية','ذكاء','لغز','سؤال','جواب','قلم','مكتب','كرسي',
  'غرفة','مطار','قطار','سفينة','جبل','وادي','صحراء','حديقة','برتقال','موز','عنب','تفاح','رمان','خبز','حليب','قهوة','شاي','نجم','سماء','سحاب',
  'مطر','ريح','صوت','صورة','فيديو','لعبة','فريق','هدف','حارس','مدرب','لاعب','نهر','قارب','زهرة','طائر','سمك','حوت','عصفور','منزل','شارع',
  'جسر','مكتبة','معلم','طالب','درس','ورقة'
];

const letters = 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي'.split('');
const avatars = ['😎','🦁','🐼','🦊','🔥','😂'];

function normalize(value) {
  return String(value || '').trim()
    .replace(/[ًٌٍَُِّْـ]/g,'')
    .replace(/[أإآٱ]/g,'ا')
    .replace(/ى/g,'ي')
    .replace(/ؤ/g,'و')
    .replace(/ئ/g,'ي');
}
const words = new Set(rawWords.map(normalize));

function firstLetter(value) {
  const n = normalize(value);
  return n[0] || '';
}
function lastLetter(value) {
  const n = normalize(value);
  const c = n[n.length - 1] || '';
  return c === 'ة' ? 'ت' : c;
}
function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}
function safeText(value, max = 24) {
  return String(value || '').trim().slice(0, max);
}
function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  do {
    code = '';
    for (let i = 0; i < 5; i++) code += pick(chars);
  } while (rooms.has(code));
  return code;
}
function send(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}
function publicRoom(room) {
  return {
    code: room.code,
    name: room.name,
    hostId: room.hostId,
    phase: room.phase,
    mode: room.mode,
    targetScore: room.targetScore,
    maxRounds: room.maxRounds,
    round: room.round,
    currentPlayerIndex: room.currentPlayerIndex,
    turnEndsAt: room.turnEndsAt,
    prompt: room.prompt,
    players: room.players.map(p => ({
      id: p.id, name: p.name, avatar: p.avatar, score: p.score, ready: p.ready, online: p.online
    })),
    chat: room.chat.slice(-50)
  };
}
function broadcast(room, payload) {
  for (const player of room.players) {
    const socket = room.sockets.get(player.id);
    if (socket) send(socket, payload);
  }
}
function broadcastState(room) {
  broadcast(room, { type:'state', state:publicRoom(room) });
}
function emitEvent(room, kind, title, text = '') {
  room.eventSeq += 1;
  const event = { kind, title, text, seq:room.eventSeq, at:Date.now() };
  broadcast(room, { type:'event', event });
  broadcastState(room);
}
function nextUnusedIndex(total, used) {
  let pool = Array.from({length:total}, (_,i) => i).filter(i => !used.has(i));
  if (!pool.length) {
    used.clear();
    pool = Array.from({length:total}, (_,i) => i);
  }
  const index = pick(pool);
  used.add(index);
  return index;
}
function nextQuestion(room) {
  const index = nextUnusedIndex(questions.length, room.usedQuestions);
  const q = questions[index];
  return { kind:'question', questionIndex:index, text:q.q, options:q.o };
}
function nextPunishment(room) {
  const index = nextUnusedIndex(punishments.length, room.usedPunishments);
  return punishments[index];
}
function makePrompt(room) {
  let kind = room.mode;
  if (kind === 'mixed') kind = pick(['question','end','chain','story']);
  if (kind === 'question') return nextQuestion(room);
  if (kind === 'end') return { kind:'end', letter:pick(letters) };
  if (kind === 'chain') {
    const seed = pick(rawWords);
    room.usedWords.add(normalize(seed));
    return { kind:'chain', previousWord:seed, requiredLetter:lastLetter(seed) };
  }
  return { kind:'story', blockedLetter:pick(letters) };
}
function clearTurnTimer(room) {
  if (room.turnTimer) clearTimeout(room.turnTimer);
  room.turnTimer = null;
}
function finishRoom(room) {
  clearTurnTimer(room);
  room.phase = 'finished';
  room.prompt = null;
  room.turnEndsAt = null;
  broadcastState(room);
}
function shouldFinish(room) {
  const best = Math.max(...room.players.map(p => p.score));
  if (best >= room.targetScore || room.round > room.maxRounds) {
    finishRoom(room);
    return true;
  }
  return false;
}
function startTurn(room) {
  if (room.phase !== 'playing') return;
  clearTurnTimer(room);
  room.prompt = makePrompt(room);
  room.turnEndsAt = Date.now() + room.timerSeconds * 1000;
  const expectedRound = room.round;
  const expectedIndex = room.currentPlayerIndex;
  room.turnTimer = setTimeout(() => {
    if (room.phase !== 'playing' || room.round !== expectedRound || room.currentPlayerIndex !== expectedIndex) return;
    emitEvent(room, 'punishment', 'انتهى الوقت ⏰', nextPunishment(room));
    setTimeout(() => advanceTurn(room), 2200);
  }, room.timerSeconds * 1000 + 120);
  broadcastState(room);
}
function advanceTurn(room) {
  if (room.phase !== 'playing') return;
  clearTurnTimer(room);
  room.currentPlayerIndex = (room.currentPlayerIndex + 1) % room.players.length;
  if (room.currentPlayerIndex === 0) room.round += 1;
  if (shouldFinish(room)) return;
  startTurn(room);
}
function handleAnswer(room, player, value) {
  if (room.phase !== 'playing') return;
  const current = room.players[room.currentPlayerIndex];
  if (!current || current.id !== player.id || !room.prompt) return;

  clearTurnTimer(room);
  const prompt = room.prompt;
  let ok = false;
  let title = '';

  if (prompt.kind === 'question') {
    const question = questions[prompt.questionIndex];
    const index = Number(value);
    ok = Number.isInteger(index) && question.o[index] === question.a;
    title = ok ? 'إجابة صحيحة 🎉' : 'إجابة خاطئة 😈';
  } else if (prompt.kind === 'end') {
    const word = safeText(value, 40);
    const normalized = normalize(word);
    ok = words.has(normalized) &&
      lastLetter(word) === normalize(prompt.letter) &&
      !room.usedWords.has(normalized);
    if (ok) room.usedWords.add(normalized);
    title = ok ? 'كلمة صحيحة ✅' : 'الكلمة غير صحيحة أو مكررة';
  } else if (prompt.kind === 'chain') {
    const word = safeText(value, 40);
    const normalized = normalize(word);
    ok = words.has(normalized) &&
      firstLetter(word) === normalize(prompt.requiredLetter) &&
      !room.usedWords.has(normalized);
    if (ok) room.usedWords.add(normalized);
    title = ok ? 'سلسلة صحيحة ✅' : 'الكلمة لا تبدأ بالحرف المطلوب أو مكررة';
  } else if (prompt.kind === 'story') {
    const story = String(value || '').trim().slice(0, 1000);
    const normalizedStory = normalize(story);
    const target = normalize(prompt.blockedLetter);
    const count = [...normalizedStory].filter(c => c === target).length;
    const wordCount = story.split(/\s+/).filter(Boolean).length;
    ok = count === 0 && wordCount >= 5;
    title = ok ? 'القصة اجتازت فحص الحرف ✅' :
      (count > 0 ? 'وجدنا الحرف المحظور ' + count + ' مرة ❌' : 'القصة قصيرة جدًا');
  }

  if (ok) {
    player.score += 1;
    emitEvent(room, 'success', title, '+1 نقطة');
    if (shouldFinish(room)) return;
    setTimeout(() => advanceTurn(room), 1400);
  } else {
    emitEvent(room, 'punishment', title, nextPunishment(room));
    setTimeout(() => advanceTurn(room), 2300);
  }
}
function leaveRoom(ws) {
  const room = rooms.get(ws.roomCode);
  if (!room || !ws.playerId) return;

  room.sockets.delete(ws.playerId);
  const player = room.players.find(p => p.id === ws.playerId);
  if (player) player.online = false;

  if (room.hostId === ws.playerId) {
    const nextHost = room.players.find(p => p.online);
    if (nextHost) {
      room.hostId = nextHost.id;
      emitEvent(room, 'info', nextHost.name + ' أصبح المضيف 👑');
    }
  }

  if (!room.players.some(p => p.online)) {
    clearTurnTimer(room);
    setTimeout(() => {
      const current = rooms.get(room.code);
      if (current && !current.players.some(p => p.online)) rooms.delete(room.code);
    }, 10 * 60 * 1000);
  } else {
    broadcastState(room);
  }
}

export function attachGameServer(server) {
  const wss = new WebSocketServer({ noServer:true, maxPayload:32 * 1024 });

  server.on('upgrade', (req, socket, head) => {
    let path = '';
    try { path = new URL(req.url, 'http://localhost').pathname; } catch {}
    if (path !== '/game-ws') return;
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
  });

  wss.on('connection', ws => {
    ws.playerId = null;
    ws.roomCode = null;

    ws.on('message', raw => {
      let message;
      try { message = JSON.parse(raw.toString()); } catch { return; }

      if (message.type === 'create_room') {
        const code = makeCode();
        const playerId = randomUUID();
        const player = {
          id: playerId,
          name: safeText(message.playerName, 20) || 'المضيف',
          avatar: pick(avatars),
          score: 0,
          ready: false,
          online: true
        };
        const room = {
          code,
          name: safeText(message.roomName, 24) || 'غرفة الأصدقاء',
          hostId: playerId,
          phase: 'lobby',
          mode: ['mixed','question','end','chain','story'].includes(message.mode) ? message.mode : 'mixed',
          targetScore: [5,10,15,20].includes(Number(message.targetScore)) ? Number(message.targetScore) : 5,
          maxRounds: [5,10,15,20].includes(Number(message.maxRounds)) ? Number(message.maxRounds) : 10,
          timerSeconds: 20,
          round: 0,
          currentPlayerIndex: 0,
          turnEndsAt: null,
          prompt: null,
          players: [player],
          chat: [],
          sockets: new Map([[playerId, ws]]),
          usedQuestions: new Set(),
          usedPunishments: new Set(),
          usedWords: new Set(),
          eventSeq: 0,
          turnTimer: null
        };
        rooms.set(code, room);
        ws.playerId = playerId;
        ws.roomCode = code;
        send(ws, { type:'joined', playerId, state:publicRoom(room) });
        broadcastState(room);
        return;
      }

      if (message.type === 'join_room') {
        const code = safeText(message.code, 5).toUpperCase();
        const room = rooms.get(code);
        if (!room) return send(ws, {type:'error', message:'الغرفة غير موجودة.'});
        if (room.phase !== 'lobby') return send(ws, {type:'error', message:'اللعبة بدأت بالفعل.'});
        if (room.players.length >= 4) return send(ws, {type:'error', message:'الغرفة ممتلئة.'});

        const playerId = randomUUID();
        const player = {
          id: playerId,
          name: safeText(message.playerName, 20) || 'لاعب',
          avatar: pick(avatars),
          score: 0,
          ready: false,
          online: true
        };
        room.players.push(player);
        room.sockets.set(playerId, ws);
        ws.playerId = playerId;
        ws.roomCode = code;
        send(ws, { type:'joined', playerId, state:publicRoom(room) });
        emitEvent(room, 'info', player.name + ' انضم للغرفة 🎮');
        return;
      }

      const room = rooms.get(ws.roomCode);
      if (!room || !ws.playerId) return;
      const player = room.players.find(p => p.id === ws.playerId);
      if (!player) return;

      if (message.type === 'ready' && room.phase === 'lobby') {
        player.ready = !player.ready;
        broadcastState(room);
        return;
      }

      if (message.type === 'start' && room.phase === 'lobby') {
        if (room.hostId !== player.id) return;
        if (room.players.length < 2 || !room.players.every(p => p.ready && p.online)) {
          return send(ws, {type:'error', message:'يجب وجود لاعبين جاهزين على الأقل.'});
        }
        room.phase = 'playing';
        room.round = 1;
        room.currentPlayerIndex = 0;
        room.players.forEach(p => { p.score = 0; });
        room.usedQuestions.clear();
        room.usedPunishments.clear();
        room.usedWords.clear();
        emitEvent(room, 'info', 'بدأ التحدي 🔥');
        setTimeout(() => startTurn(room), 700);
        return;
      }

      if (message.type === 'answer') {
        handleAnswer(room, player, message.value);
        return;
      }

      if (message.type === 'chat') {
        const text = safeText(message.text, 120);
        if (!text) return;
        room.chat.push({ id:randomUUID(), playerId:player.id, name:player.name, text, at:Date.now() });
        if (room.chat.length > 80) room.chat.shift();
        broadcastState(room);
        return;
      }

      if (message.type === 'reaction') {
        const emoji = ['😂','🔥','😈','👏','🤦','💀'].includes(message.emoji) ? message.emoji : '😂';
        broadcast(room, { type:'reaction', emoji, playerId:player.id, name:player.name });
      }
    });

    ws.on('close', () => leaveRoom(ws));
    ws.on('error', () => {});
  });

  return wss;
}
