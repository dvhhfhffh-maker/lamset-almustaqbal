const $ = id => document.getElementById(id);
let ws = null;
let me = null;
let room = null;
let timerHandle = null;
let lastEventSeq = 0;

function connect() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(protocol + '//' + location.host + '/game-ws');

  ws.addEventListener('open', () => {
    $('conn').textContent = 'متصل 🟢';
  });

  ws.addEventListener('close', () => {
    $('conn').textContent = 'انقطع الاتصال 🔴';
    setTimeout(connect, 1500);
  });

  ws.addEventListener('error', () => {
    $('conn').textContent = 'خطأ اتصال 🔴';
  });

  ws.addEventListener('message', event => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }

    if (message.type === 'joined') {
      me = message.playerId;
      room = message.state;
      render();
      return;
    }

    if (message.type === 'state') {
      room = message.state;
      render();
      return;
    }

    if (message.type === 'event') {
      handleEvent(message.event);
      return;
    }

    if (message.type === 'reaction') {
      floatEmoji(message.emoji);
      return;
    }

    if (message.type === 'error') {
      alert(message.message || 'حدث خطأ.');
    }
  });
}

function send(type, data = {}) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    alert('الاتصال بالخادم غير جاهز. حاول مرة أخرى.');
    return;
  }
  ws.send(JSON.stringify({ type, ...data }));
}

function createRoom() {
  const name = $('cn').value.trim();
  const roomName = $('rn').value.trim();
  if (!name) return alert('اكتب اسمك أولًا.');

  send('create_room', {
    playerName: name,
    roomName,
    mode: $('mode').value,
    targetScore: Number($('target').value) || 5,
    maxRounds: 10
  });
}

function joinRoom() {
  const name = $('jn').value.trim();
  const code = $('jc').value.trim().toUpperCase();
  if (!name) return alert('اكتب اسمك أولًا.');
  if (code.length !== 5) return alert('أدخل كود الغرفة المكوّن من 5 أحرف.');

  send('join_room', { playerName: name, code });
}

function show(section) {
  ['home','lobby','game','results'].forEach(id => {
    $(id).classList.toggle('hidden', id !== section);
  });
}

function currentPlayer() {
  return room?.players?.[room.currentPlayerIndex] || null;
}

function myPlayer() {
  return room?.players?.find(p => p.id === me) || null;
}

function canStart() {
  return room &&
    me === room.hostId &&
    room.players.length >= 2 &&
    room.players.every(p => p.ready && p.online);
}

function render() {
  if (!room) return;

  if (room.phase === 'lobby') {
    show('lobby');
    renderLobby();
  } else if (room.phase === 'playing') {
    show('game');
    renderGame();
  } else if (room.phase === 'finished') {
    show('results');
    renderResults();
  }

  renderChats();
}

function renderLobby() {
  $('lt').textContent = '🔥 ' + room.name;
  $('code').textContent = room.code;

  $('players').innerHTML = room.players.map(player => {
    const crown = player.id === room.hostId ? '👑 ' : '';
    const status = player.online ? (player.ready ? 'READY ✅' : 'غير جاهز') : 'Offline';
    return '<div class="player' + (player.online ? '' : ' offline') + '">' +
      '<b>' + player.avatar + ' ' + crown + escapeHtml(player.name) + '</b>' +
      '<div class="' + (player.ready ? 'ready' : '') + '">' + status + '</div>' +
      '</div>';
  }).join('');

  const mine = myPlayer();
  $('ready').textContent = mine?.ready ? 'إلغاء الجاهزية' : 'أنا جاهز ✅';

  $('start').classList.toggle('hidden', me !== room.hostId);
  $('start').disabled = !canStart();
  $('ls').textContent = canStart()
    ? 'الجميع جاهز! ابدأ اللعبة 🔥'
    : 'ينتظر جاهزية اللاعبين...';
}

function renderGame() {
  $('round').textContent = 'الجولة ' + room.round + ' / ' + room.maxRounds;

  $('scores').innerHTML = room.players.map((player, index) => {
    return '<div class="score ' + (index === room.currentPlayerIndex ? 'current' : '') + '">' +
      '<b>' + player.avatar + ' ' + escapeHtml(player.name) + '</b>' +
      '<div>' + player.score + ' نقطة</div>' +
      '</div>';
  }).join('');

  const current = currentPlayer();
  const isMyTurn = current?.id === me;
  const prompt = room.prompt || {};

  $('turn').textContent = isMyTurn
    ? '🔥 دورك الآن'
    : 'الدور على ' + (current?.name || '');

  $('opts').innerHTML = '';
  $('textbox').classList.add('hidden');
  $('wait').textContent = isMyTurn ? '' : 'انتظر دورك...';

  if (prompt.kind === 'question') {
    $('kind').textContent = '🧠 سؤال';
    $('pt').textContent = prompt.text || '';
    if (isMyTurn) {
      (prompt.options || []).forEach((option, index) => {
        const button = document.createElement('button');
        button.className = 'btn btn2';
        button.textContent = option;
        button.addEventListener('click', () => send('answer', { value:index }));
        $('opts').appendChild(button);
      });
    }
  } else if (prompt.kind === 'end') {
    $('kind').textContent = '🔤 نهاية الحرف';
    $('pt').textContent = 'اكتب كلمة تنتهي بحرف: ' + prompt.letter;
    if (isMyTurn) {
      $('textbox').classList.remove('hidden');
      $('ans').placeholder = 'اكتب كلمة عربية...';
    }
  } else if (prompt.kind === 'chain') {
    $('kind').textContent = '⛓️ آخر حرف';
    $('pt').textContent = 'بعد «' + prompt.previousWord + '» — كلمة تبدأ بـ ' + prompt.requiredLetter;
    if (isMyTurn) {
      $('textbox').classList.remove('hidden');
      $('ans').placeholder = 'اكتب كلمة تبدأ بالحرف المطلوب...';
    }
  } else if (prompt.kind === 'story') {
    $('kind').textContent = '✍️ قصة بلا حرف';
    $('pt').textContent = 'اكتب قصة قصيرة بدون حرف: ' + prompt.blockedLetter;
    if (isMyTurn) {
      $('textbox').classList.remove('hidden');
      $('ans').placeholder = 'اكتب قصة من 5 كلمات أو أكثر...';
    }
  } else {
    $('kind').textContent = 'جاري تجهيز الجولة...';
    $('pt').textContent = '';
  }

  runTimer();
}

function runTimer() {
  clearInterval(timerHandle);

  const update = () => {
    const end = room?.turnEndsAt || Date.now();
    const seconds = Math.max(0, Math.ceil((end - Date.now()) / 1000));
    $('timer').textContent = '00:' + String(seconds).padStart(2, '0');
  };

  update();
  timerHandle = setInterval(update, 250);
}

function submitTextAnswer() {
  const value = $('ans').value.trim();
  if (!value) return;
  send('answer', { value });
  $('ans').value = '';
}

function sendChat(inputId) {
  const input = $(inputId);
  const text = input.value.trim();
  if (!text) return;
  send('chat', { text });
  input.value = '';
}

function renderChats() {
  const html = (room?.chat || []).map(message => {
    return '<div class="msg"><b>' + escapeHtml(message.name) + ':</b> ' +
      escapeHtml(message.text) + '</div>';
  }).join('');

  ['chat1','chat2'].forEach(id => {
    const element = $(id);
    if (!element) return;
    element.innerHTML = html;
    element.scrollTop = element.scrollHeight;
  });
}

function handleEvent(event) {
  if (!event || (event.seq && event.seq <= lastEventSeq)) return;
  if (event.seq) lastEventSeq = event.seq;

  if (event.kind === 'punishment') {
    popup('😈', event.title || 'العقاب', event.text || '');
  } else if (event.kind === 'success') {
    popup('✅', event.title || 'إجابة صحيحة', event.text || '+1 نقطة');
  } else {
    popup('ℹ️', event.title || 'تنبيه', event.text || '');
  }
}

function popup(emoji, title, text) {
  $('ove').textContent = emoji;
  $('ovt').textContent = title;
  $('ovx').textContent = text;
  $('ov').classList.add('show');
  setTimeout(() => $('ov').classList.remove('show'), 2200);
}

function floatEmoji(emoji) {
  const element = document.createElement('div');
  element.className = 'float';
  element.textContent = emoji;
  element.style.left = (15 + Math.random() * 70) + '%';
  document.body.appendChild(element);
  setTimeout(() => element.remove(), 1600);
}

function renderResults() {
  clearInterval(timerHandle);
  const ranking = [...(room.players || [])].sort((a,b) => b.score - a.score);
  const winner = ranking[0];

  $('winner').textContent = winner
    ? winner.avatar + ' ' + winner.name + ' — ' + winner.score + ' نقطة'
    : '';

  $('rank').innerHTML = ranking.map((player, index) => {
    const medal = ['🥇','🥈','🥉'][index] || '🎮';
    return '<div class="rank">' + medal + ' ' + escapeHtml(player.name) +
      ' — ' + player.score + '</div>';
  }).join('');

  for (let i = 0; i < 24; i++) {
    setTimeout(() => floatEmoji(['🎉','✨','🔥','🏆'][i % 4]), i * 70);
  }
}

async function shareRoom() {
  const url = location.origin + '/game.html?room=' + room.code;
  const text = 'انضم إلى غرفتي في تحدّي الأصحاب 🎮\nالكود: ' + room.code + '\n' + url;

  if (navigator.share) {
    try {
      await navigator.share({ title:'تحدّي الأصحاب', text, url });
      return;
    } catch {}
  }

  try {
    await navigator.clipboard.writeText(text);
    alert('تم نسخ الرابط والكود ✅');
  } catch {
    prompt('انسخ الرابط:', text);
  }
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"]/g, char => ({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;'
  }[char]));
}

$('createBtn').addEventListener('click', createRoom);
$('joinBtn').addEventListener('click', joinRoom);
$('ready').addEventListener('click', () => send('ready'));
$('start').addEventListener('click', () => send('start'));
$('share').addEventListener('click', shareRoom);
$('submit').addEventListener('click', submitTextAnswer);
$('send1').addEventListener('click', () => sendChat('ci1'));
$('send2').addEventListener('click', () => sendChat('ci2'));
$('again').addEventListener('click', () => { location.href = '/game.html'; });
$('ov').addEventListener('click', () => $('ov').classList.remove('show'));

$('reacts').addEventListener('click', event => {
  if (event.target.classList.contains('react')) {
    send('reaction', { emoji:event.target.textContent });
  }
});

['ci1','ci2'].forEach(id => {
  $(id).addEventListener('keydown', event => {
    if (event.key === 'Enter') sendChat(id);
  });
});

const requestedRoom = new URLSearchParams(location.search).get('room');
if (requestedRoom) $('jc').value = requestedRoom.toUpperCase();

connect();
