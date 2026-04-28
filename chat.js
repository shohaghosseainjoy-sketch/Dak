// ============================================================
// NexChat — Chat Page Controller
// Full real-time chat with all features
// ============================================================

let currentUser = null;
let activeChatId = null;
let activeContact = null;
let allChats = [];
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

// ─── Init ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  currentUser = await requireAuth('login.html');
  await Auth.updateUserPresence(currentUser.uid);
  await Notifications.init();
  await Notifications.requestPermission(currentUser.uid).catch(() => {});
  loadChatList();
  setupGlobalListeners();
});

// ─── Chat List ────────────────────────────────────────────
function loadChatList() {
  Messaging.listenToChatList(currentUser.uid, (chats) => {
    allChats = chats;
    renderChatList(chats);
    document.getElementById('chat-list-skeleton').style.display = 'none';
  });
}

function renderChatList(chats) {
  const container = document.getElementById('chat-list');
  const existing = container.querySelector('#chat-list-items');
  if (existing) existing.remove();

  if (chats.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = `
      <div class="empty-state-icon">💬</div>
      <h3>No conversations yet</h3>
      <p>Start chatting by finding a contact</p>
      <button class="btn btn-secondary btn-sm" onclick="openNewChat()" style="margin-top:8px">+ New Chat</button>
    `;
    container.appendChild(empty);
    return;
  }

  const list = document.createElement('div');
  list.id = 'chat-list-items';
  chats.forEach(chat => {
    const item = createChatListItem(chat);
    list.appendChild(item);
  });
  container.appendChild(list);
}

function createChatListItem(chat) {
  const contact = chat.contact;
  const unread = chat.unread?.[currentUser.uid] || 0;
  const isOnline = contact.status === 'online';
  const initials = getInitials(contact.displayName || contact.username || '?');
  const bgColor = stringToColor(contact.uid);

  const div = document.createElement('div');
  div.className = `chat-item${activeChatId === chat.id ? ' active' : ''}`;
  div.dataset.chatId = chat.id;
  div.dataset.contactUid = contact.uid;
  div.onclick = () => openChat(contact);
  div.innerHTML = `
    <div class="avatar-wrap">
      <div class="avatar" style="background:${bgColor}">
        ${contact.photoURL ? `<img src="${contact.photoURL}" alt="">` : initials}
      </div>
      ${isOnline ? '<div class="online-dot"></div>' : ''}
    </div>
    <div class="chat-item-content">
      <div class="chat-item-top">
        <span class="chat-item-name">${sanitize(contact.displayName || contact.username || 'Unknown')}</span>
        <span class="chat-item-time">${formatChatListTime(chat.lastMessageTime)}</span>
      </div>
      <div class="chat-item-bottom">
        <span class="chat-item-preview ${unread > 0 ? 'unread' : ''}">${sanitize(chat.lastMessage || 'Start chatting')}</span>
        ${unread > 0 ? `<span class="badge">${unread > 99 ? '99+' : unread}</span>` : ''}
      </div>
    </div>
  `;
  return div;
}

// ─── Open Chat ────────────────────────────────────────────
async function openChat(contact) {
  if (activeContact?.uid === contact.uid) return;

  // Remove old listener
  if (activeChatId) Messaging.removeListener(activeChatId);

  activeContact = contact;
  activeChatId = await Messaging.getOrCreateChat(currentUser.uid, contact.uid);

  // Update active state
  document.querySelectorAll('.chat-item').forEach(el => {
    el.classList.toggle('active', el.dataset.contactUid === contact.uid);
  });

  // Show chat window
  document.getElementById('chat-welcome').style.display = 'none';
  document.getElementById('chat-header').style.display = 'flex';
  document.getElementById('messages-container').style.display = 'flex';
  document.getElementById('typing-wrap').style.display = 'block';
  document.getElementById('input-bar').style.display = 'flex';

  // Mobile: show chat window
  document.getElementById('chat-window').classList.add('active');
  document.getElementById('sidebar').classList.add('hidden');

  // Update header
  updateChatHeader(contact);

  // Listen to contact's online status
  db.ref(`users/${contact.uid}`).on('value', snap => {
    if (snap.exists()) {
      const u = snap.val();
      const dot = document.getElementById('chat-header-online-dot');
      const status = document.getElementById('chat-header-status');
      if (u.status === 'online') {
        dot.style.display = 'block';
        status.textContent = 'online';
        status.className = 'chat-header-status online';
      } else {
        dot.style.display = 'none';
        status.textContent = Users.formatLastSeen(u.lastSeen);
        status.className = 'chat-header-status';
      }
    }
  });

  // Listen to messages
  Messaging.listenToMessages(activeChatId, currentUser.uid, renderMessages);

  // Listen to typing
  Messaging.listenToTyping(activeChatId, currentUser.uid, isTyping => {
    document.getElementById('typing-wrap').style.display = isTyping ? 'block' : 'none';
    if (isTyping) scrollToBottom();
  });

  // Reset unread
  db.ref(`chats/${activeChatId}/unread/${currentUser.uid}`).set(0);
}

function updateChatHeader(contact) {
  const initials = getInitials(contact.displayName || contact.username || '?');
  const bgColor = stringToColor(contact.uid);
  const avatar = document.getElementById('chat-header-avatar');
  avatar.style.background = bgColor;
  avatar.innerHTML = contact.photoURL ? `<img src="${contact.photoURL}" alt="">` : initials;
  document.getElementById('chat-header-name').textContent = contact.displayName || contact.username || 'Unknown';
}

function closeChatWindow() {
  document.getElementById('chat-window').classList.remove('active');
  document.getElementById('sidebar').classList.remove('hidden');
  document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
  activeChatId = null;
  activeContact = null;
}

// ─── Render Messages ──────────────────────────────────────
function renderMessages(messages) {
  const container = document.getElementById('messages-container');
  container.innerHTML = '';

  let lastDate = null;
  messages.forEach((msg, i) => {
    const msgDate = new Date(msg.timestamp).toDateString();
    if (msgDate !== lastDate) {
      const sep = document.createElement('div');
      sep.className = 'date-sep';
      sep.innerHTML = `<span>${Users.formatDateSeparator(msg.timestamp)}</span>`;
      container.appendChild(sep);
      lastDate = msgDate;
    }

    const isOut = msg.senderId === currentUser.uid;
    const wrap = document.createElement('div');
    wrap.className = `msg-wrap ${isOut ? 'out' : 'in'}`;
    wrap.dataset.msgId = msg.id;

    const bubble = createBubble(msg, isOut);
    const meta = createMsgMeta(msg, isOut);

    wrap.appendChild(bubble);
    wrap.appendChild(meta);

    // Context menu on long press / right click
    wrap.addEventListener('contextmenu', (e) => { e.preventDefault(); showMsgContextMenu(e, msg, isOut); });
    wrap.addEventListener('touchstart', longPressHandler(wrap, msg, isOut), { passive: true });

    container.appendChild(wrap);
  });

  scrollToBottom();
}

function createBubble(msg, isOut) {
  const bubble = document.createElement('div');

  if (msg.type === 'deleted') {
    bubble.className = 'bubble deleted';
    bubble.textContent = '🚫 This message was deleted';
    return bubble;
  }

  if (msg.type === 'image') {
    bubble.className = 'bubble bubble-image';
    bubble.innerHTML = `<img src="${msg.mediaURL}" alt="Image" loading="lazy" onclick="openImageModal('${msg.mediaURL}', 'Image')">`;
    if (msg.content) {
      const cap = document.createElement('p');
      cap.style.cssText = 'padding:6px 4px 2px;font-size:0.875rem;';
      cap.textContent = msg.content;
      bubble.appendChild(cap);
    }
    return bubble;
  }

  if (msg.type === 'video') {
    bubble.className = 'bubble bubble-video';
    bubble.innerHTML = `<video src="${msg.mediaURL}" controls preload="metadata"></video>`;
    return bubble;
  }

  if (msg.type === 'audio') {
    bubble.className = 'bubble bubble-audio';
    bubble.innerHTML = `
      <button class="audio-play-btn" onclick="toggleAudio(this, '${msg.mediaURL}')">▶</button>
      <div class="audio-waveform">${generateWaveform()}</div>
      <span class="audio-duration" id="dur-${msg.id}">0:00</span>
      <audio id="audio-${msg.id}" src="${msg.mediaURL}" preload="metadata" onloadedmetadata="updateAudioDur('${msg.id}', this)"></audio>
    `;
    return bubble;
  }

  if (msg.type === 'file') {
    const icon = getFileIcon(msg.mediaURL || '');
    const name = msg.content || 'File';
    bubble.className = 'bubble bubble-file';
    bubble.innerHTML = `
      <div class="file-icon">${icon}</div>
      <div class="file-info">
        <div class="file-name">${sanitize(name)}</div>
        <div class="file-size">Tap to download</div>
      </div>
      <a href="${msg.mediaURL}" download="${name}" target="_blank" class="file-download" style="color:inherit">⬇</a>
    `;
    return bubble;
  }

  // Text
  bubble.className = 'bubble';
  bubble.innerHTML = linkify(msg.content || '');
  return bubble;
}

function createMsgMeta(msg, isOut) {
  const meta = document.createElement('div');
  meta.className = 'msg-meta';
  const timeStr = Users.formatTime(msg.timestamp);

  let statusHtml = '';
  if (isOut) {
    const statusMap = { seen: '✔✔', delivered: '✔✔', sent: '✔' };
    const statusClass = msg.status || 'sent';
    statusHtml = `<span class="msg-status ${statusClass}">${statusMap[statusClass] || '✔'}</span>`;
  }
  meta.innerHTML = `<span class="msg-time">${timeStr}</span>${statusHtml}`;
  return meta;
}

function generateWaveform() {
  return Array.from({ length: 20 }, () => {
    const h = 4 + Math.random() * 16;
    return `<div class="audio-bar" style="height:${h}px"></div>`;
  }).join('');
}

function updateAudioDur(id, el) {
  const dur = el.duration;
  if (!isNaN(dur)) {
    const m = Math.floor(dur / 60);
    const s = Math.floor(dur % 60).toString().padStart(2, '0');
    document.getElementById(`dur-${id}`).textContent = `${m}:${s}`;
  }
}

function toggleAudio(btn, src) {
  const audioEls = document.querySelectorAll('audio');
  audioEls.forEach(a => { if (a.src !== src || a.paused === false) { a.pause(); } });
  const audio = Array.from(audioEls).find(a => a.src === src);
  if (audio) {
    if (audio.paused) { audio.play(); btn.textContent = '⏸'; }
    else { audio.pause(); btn.textContent = '▶'; }
    audio.onended = () => { btn.textContent = '▶'; };
  }
}

function getFileIcon(url) {
  const ext = url.split('.').pop().toLowerCase();
  const icons = { pdf: '📄', doc: '📝', docx: '📝', xls: '📊', xlsx: '📊', ppt: '📊', zip: '🗜', rar: '🗜', mp3: '🎵', mp4: '🎬', mov: '🎬' };
  return icons[ext] || '📎';
}

// ─── Message Context Menu ─────────────────────────────────
let longPressTimer = null;
function longPressHandler(wrap, msg, isOut) {
  return (e) => {
    longPressTimer = setTimeout(() => showMsgContextMenu(e, msg, isOut, wrap), 500);
  };
}

function showMsgContextMenu(e, msg, isOut, wrap) {
  const existing = document.querySelector('.context-menu.msg-ctx');
  existing?.remove();

  const menu = document.createElement('div');
  menu.className = 'context-menu msg-ctx';
  const x = Math.min(e.clientX || (wrap?.getBoundingClientRect().left + 100), window.innerWidth - 180);
  const y = e.clientY || e.touches?.[0]?.clientY || 200;
  menu.style.cssText = `left:${x}px;top:${y}px`;

  menu.innerHTML = `
    <div class="context-menu-item" onclick="copyMessage('${sanitize(msg.content || '')}')">📋 Copy</div>
    ${isOut && msg.type !== 'deleted' ? `<div class="context-menu-item danger" onclick="deleteMessage('${msg.id}')">🗑 Delete</div>` : ''}
    <div class="context-menu-item" onclick="this.closest('.context-menu').remove()">✕ Close</div>
  `;
  document.body.appendChild(menu);
  setTimeout(() => document.addEventListener('click', () => menu.remove(), { once: true }), 100);
}

function copyMessage(text) {
  navigator.clipboard.writeText(text).then(() => showToast('Copied!', 'success'));
  document.querySelector('.context-menu.msg-ctx')?.remove();
}

async function deleteMessage(msgId) {
  document.querySelector('.context-menu.msg-ctx')?.remove();
  const res = await Messaging.deleteMessage(activeChatId, msgId, currentUser.uid);
  if (!res.success) showToast(res.error, 'error');
}

// ─── Send Message ─────────────────────────────────────────
async function handleSendMessage() {
  const input = document.getElementById('msg-input');
  const text = input.value.trim();
  if (!text || !activeChatId) return;

  input.value = '';
  autoResize(input);
  document.getElementById('send-btn').classList.remove('visible');
  document.getElementById('record-btn').style.display = 'flex';

  Messaging.setTyping(activeChatId, currentUser.uid, false);

  const res = await Messaging.sendMessage(activeChatId, currentUser.uid, text, 'text');
  if (!res.success) showToast('Failed to send message.', 'error');
}

// ─── Input Handling ───────────────────────────────────────
function handleInputChange(el) {
  autoResize(el);
  const hasText = el.value.trim().length > 0;
  document.getElementById('send-btn').classList.toggle('visible', hasText);
  document.getElementById('record-btn').style.display = hasText ? 'none' : 'flex';

  if (activeChatId && hasText) {
    Messaging.setTyping(activeChatId, currentUser.uid, true);
  } else {
    Messaging.setTyping(activeChatId, currentUser.uid, false);
  }
}

function handleInputKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSendMessage();
  }
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 128) + 'px';
}

// ─── Attach Panel ─────────────────────────────────────────
let attachOpen = false;
function toggleAttachPanel() {
  attachOpen = !attachOpen;
  document.getElementById('attach-panel').style.display = attachOpen ? 'grid' : 'none';
  document.getElementById('attach-btn').textContent = attachOpen ? '✕' : '📎';
}

function triggerFileInput(type) {
  toggleAttachPanel();
  document.getElementById(`file-input-${type}`)?.click();
}

function openCamera() {
  toggleAttachPanel();
  document.getElementById('file-input-camera')?.click();
}

// ─── File Upload ──────────────────────────────────────────
async function handleFileUpload(input, type) {
  const file = input.files?.[0];
  if (!file || !activeChatId) return;
  input.value = '';

  // Show progress in input bar
  const progressEl = showUploadProgress(type);

  const res = await Messaging.uploadMedia(file, activeChatId, currentUser.uid, (pct) => {
    if (progressEl) progressEl.querySelector('.progress-bar').style.width = pct + '%';
  });

  removeUploadProgress(progressEl);

  if (!res.success) return showToast(res.error, 'error');

  const caption = type === 'file' ? res.name : '';
  await Messaging.sendMessage(activeChatId, currentUser.uid, caption, type, res.url);
}

function showUploadProgress(type) {
  const input = document.getElementById('msg-input').parentElement;
  const el = document.createElement('div');
  el.className = 'upload-progress';
  el.innerHTML = `
    <span>${type === 'image' ? '🖼' : type === 'video' ? '🎬' : '📄'} Uploading...</span>
    <div class="progress-bar-wrap"><div class="progress-bar" style="width:0%"></div></div>
  `;
  document.getElementById('input-bar').insertBefore(el, document.getElementById('input-bar').firstChild);
  return el;
}

function removeUploadProgress(el) { el?.remove(); }

// ─── Voice Recording ──────────────────────────────────────
async function toggleRecording() {
  if (isRecording) stopRecording();
  else startRecording();
}

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];
    mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
    mediaRecorder.onstop = async () => {
      const blob = new Blob(audioChunks, { type: 'audio/webm' });
      const file = new File([blob], `voice_${Date.now()}.webm`, { type: 'audio/webm' });
      stream.getTracks().forEach(t => t.stop());

      const progressEl = showUploadProgress('audio');
      const res = await Messaging.uploadMedia(file, activeChatId, currentUser.uid, pct => {
        if (progressEl) progressEl.querySelector('.progress-bar').style.width = pct + '%';
      });
      removeUploadProgress(progressEl);
      if (res.success) {
        await Messaging.sendMessage(activeChatId, currentUser.uid, 'Voice message', 'audio', res.url);
      }
    };
    mediaRecorder.start();
    isRecording = true;
    document.getElementById('record-btn').classList.add('recording');
    document.getElementById('record-btn').textContent = '⏹';
    showToast('Recording... Tap to stop', 'info');
  } catch (err) {
    showToast('Microphone access denied.', 'error');
  }
}

function stopRecording() {
  mediaRecorder?.stop();
  isRecording = false;
  document.getElementById('record-btn').classList.remove('recording');
  document.getElementById('record-btn').textContent = '🎤';
}

// ─── Chat Search ──────────────────────────────────────────
function handleChatSearch(query) {
  if (!query.trim()) {
    renderChatList(allChats);
    return;
  }
  const q = query.toLowerCase();
  const filtered = allChats.filter(chat =>
    chat.contact?.displayName?.toLowerCase().includes(q) ||
    chat.contact?.username?.toLowerCase().includes(q) ||
    chat.lastMessage?.toLowerCase().includes(q)
  );
  renderChatList(filtered);
}

// ─── User Search ──────────────────────────────────────────
async function handleUserSearch(query) {
  const container = document.getElementById('user-search-results');
  if (!query.trim()) {
    container.innerHTML = '<div class="empty-state" style="padding:16px 0"><div class="empty-state-icon">🔍</div><p>Search for a user</p></div>';
    return;
  }
  container.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text-muted)">Searching...</div>';

  const results = await Users.searchByUsername(query);

  // Also try phone search
  if (query.startsWith('+') || /^\d+$/.test(query)) {
    const byPhone = await Users.findByPhone(query);
    if (byPhone && !results.find(u => u.uid === byPhone.uid)) results.push(byPhone);
  }

  if (results.length === 0) {
    container.innerHTML = '<div class="empty-state" style="padding:16px 0"><p>No users found</p></div>';
    return;
  }

  container.innerHTML = results.filter(u => u.uid !== currentUser.uid).map(u => {
    const initials = getInitials(u.displayName || u.username || '?');
    const bg = stringToColor(u.uid);
    return `
      <div onclick="startChatWith('${u.uid}')" style="display:flex;align-items:center;gap:12px;padding:12px;border-radius:var(--radius-md);cursor:pointer;transition:background 0.15s" onmouseover="this.style.background='var(--bg-hover)'" onmouseout="this.style.background=''">
        <div class="avatar" style="background:${bg}">${u.photoURL ? `<img src="${u.photoURL}" alt="">` : initials}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:0.9375rem">${sanitize(u.displayName || u.username)}</div>
          <div style="font-size:0.8125rem;color:var(--text-muted)">@${sanitize(u.username || '')}</div>
        </div>
        <div class="chip">${u.status === 'online' ? '🟢 Online' : 'Offline'}</div>
      </div>
    `;
  }).join('');
}

async function startChatWith(uid) {
  document.getElementById('new-chat-modal').style.display = 'none';
  const snap = await db.ref(`users/${uid}`).once('value');
  if (snap.exists()) {
    await openChat({ uid, ...snap.val() });
    await Users.addContact(currentUser.uid, uid);
  }
}

// ─── Contacts List ────────────────────────────────────────
async function loadContacts() {
  const contacts = await Users.getContacts(currentUser.uid);
  const container = document.getElementById('contacts-list');
  if (contacts.length === 0) {
    container.innerHTML = '<div style="color:var(--text-muted);font-size:0.875rem;padding:8px 0">No contacts yet. Search above to add.</div>';
    return;
  }
  container.innerHTML = contacts.map(u => {
    const initials = getInitials(u.displayName || u.username || '?');
    const bg = stringToColor(u.uid);
    return `
      <div onclick="startChatWith('${u.uid}')" style="display:flex;align-items:center;gap:12px;padding:10px;border-radius:var(--radius-sm);cursor:pointer;transition:background 0.15s" onmouseover="this.style.background='var(--bg-hover)'" onmouseout="this.style.background=''">
        <div class="avatar avatar-sm" style="background:${bg}">${u.photoURL ? `<img src="${u.photoURL}" alt="">` : initials}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:500;font-size:0.875rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${sanitize(u.displayName || u.username)}</div>
          <div style="font-size:0.75rem;color:var(--text-muted)">${u.status === 'online' ? '🟢 Online' : Users.formatLastSeen(u.lastSeen)}</div>
        </div>
      </div>
    `;
  }).join('');
}

function openNewChat() {
  document.getElementById('new-chat-modal').style.display = 'flex';
  document.getElementById('user-search-input').value = '';
  document.getElementById('user-search-results').innerHTML = '<div class="empty-state" style="padding:16px 0"><div class="empty-state-icon">🔍</div><p>Search for a user to start chatting</p></div>';
  loadContacts();
  closeSidebarMenu();
}

// ─── Contact Info ─────────────────────────────────────────
function openContactInfo() {
  if (!activeContact) return;
  const u = activeContact;
  const initials = getInitials(u.displayName || u.username || '?');
  const bg = stringToColor(u.uid);
  document.getElementById('contact-info-content').innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;gap:12px;padding:16px 0 24px;text-align:center">
      <div class="avatar avatar-xl" style="background:${bg}">${u.photoURL ? `<img src="${u.photoURL}" alt="">` : initials}</div>
      <div>
        <div style="font-family:var(--font-display);font-size:1.25rem;font-weight:700">${sanitize(u.displayName || u.username)}</div>
        <div style="color:var(--text-secondary);font-size:0.875rem">@${sanitize(u.username || '')}</div>
      </div>
      ${u.bio ? `<p style="color:var(--text-secondary);font-size:0.875rem;max-width:280px;line-height:1.6">${sanitize(u.bio)}</p>` : ''}
      <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">
        <div class="chip">${u.status === 'online' ? '🟢 Online' : Users.formatLastSeen(u.lastSeen)}</div>
        ${u.phone ? `<div class="chip">📞 ${u.phone}</div>` : ''}
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:8px">
      <button class="btn btn-secondary btn-full" onclick="Users.addContact('${currentUser.uid}','${u.uid}');showToast('Contact added!','success')">➕ Add Contact</button>
      <button class="btn btn-danger btn-full" onclick="blockContact('${u.uid}')">🚫 Block User</button>
    </div>
  `;
  document.getElementById('contact-info-modal').style.display = 'flex';
}

async function blockCurrentContact() {
  closeChatMenu();
  if (!activeContact) return;
  await blockContact(activeContact.uid);
}

async function blockContact(uid) {
  await Users.blockUser(currentUser.uid, uid);
  showToast('User blocked.', 'info');
  document.getElementById('contact-info-modal').style.display = 'none';
}

// ─── Report ───────────────────────────────────────────────
function reportCurrentContact() {
  closeChatMenu();
  document.getElementById('report-modal').style.display = 'flex';
}

async function submitReport() {
  const reason = document.querySelector('input[name="report-reason"]:checked')?.value;
  if (!reason) return showToast('Please select a reason.', 'error');
  await Users.reportUser(currentUser.uid, activeContact.uid, reason);
  document.getElementById('report-modal').style.display = 'none';
  showToast('Report submitted. Thank you.', 'success');
}

// ─── Admin Panel ──────────────────────────────────────────
async function openAdminPanel() {
  closeSidebarMenu();
  document.getElementById('admin-modal').style.display = 'flex';

  const snap = await db.ref('users').once('value');
  const users = [];
  snap.forEach(child => users.push({ uid: child.key, ...child.val() }));

  const reportsSnap = await db.ref('reports').once('value');
  const reports = [];
  reportsSnap.forEach(child => reports.push({ id: child.key, ...child.val() }));

  document.getElementById('admin-content').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:20px">
      <div>
        <div style="font-size:0.75rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:12px">
          📊 Stats
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div style="background:var(--bg-tertiary);border-radius:var(--radius-md);padding:16px;border:1px solid var(--border)">
            <div style="font-size:1.75rem;font-weight:800;font-family:var(--font-display)">${users.length}</div>
            <div style="color:var(--text-muted);font-size:0.8125rem;margin-top:4px">Total Users</div>
          </div>
          <div style="background:var(--bg-tertiary);border-radius:var(--radius-md);padding:16px;border:1px solid var(--border)">
            <div style="font-size:1.75rem;font-weight:800;font-family:var(--font-display)">${users.filter(u => u.status === 'online').length}</div>
            <div style="color:var(--text-muted);font-size:0.8125rem;margin-top:4px">Online Now</div>
          </div>
          <div style="background:var(--bg-tertiary);border-radius:var(--radius-md);padding:16px;border:1px solid var(--border)">
            <div style="font-size:1.75rem;font-weight:800;font-family:var(--font-display)">${reports.filter(r => r.status === 'pending').length}</div>
            <div style="color:var(--text-muted);font-size:0.8125rem;margin-top:4px">Pending Reports</div>
          </div>
          <div style="background:var(--bg-tertiary);border-radius:var(--radius-md);padding:16px;border:1px solid var(--border)">
            <div style="font-size:1.75rem;font-weight:800;font-family:var(--font-display)">${users.filter(u => u.createdAt > Date.now() - 86400000).length}</div>
            <div style="color:var(--text-muted);font-size:0.8125rem;margin-top:4px">New Today</div>
          </div>
        </div>
      </div>
      <div>
        <div style="font-size:0.75rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:12px">
          👥 Recent Users
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;max-height:240px;overflow-y:auto">
          ${users.slice(0,15).map(u => `
            <div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--bg-tertiary);border-radius:var(--radius-sm);border:1px solid var(--border)">
              <div class="avatar avatar-sm" style="background:${stringToColor(u.uid)}">${getInitials(u.displayName || u.username || '?')}</div>
              <div style="flex:1;min-width:0">
                <div style="font-weight:500;font-size:0.875rem">${sanitize(u.displayName || u.username || 'Unknown')}</div>
                <div style="font-size:0.75rem;color:var(--text-muted)">${u.email || u.phone || ''}</div>
              </div>
              <div class="chip" style="font-size:0.75rem">${u.status === 'online' ? '🟢' : '⚫'}</div>
            </div>
          `).join('')}
        </div>
      </div>
      ${reports.length > 0 ? `
      <div>
        <div style="font-size:0.75rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:12px">
          ⚠️ Reports
        </div>
        <div style="display:flex;flex-direction:column;gap:4px">
          ${reports.slice(0,5).map(r => `
            <div style="padding:10px;background:rgba(255,68,68,0.05);border:1px solid rgba(255,68,68,0.1);border-radius:var(--radius-sm)">
              <div style="font-size:0.8125rem;font-weight:500">Reason: ${sanitize(r.reason)}</div>
              <div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px">Status: ${r.status}</div>
            </div>
          `).join('')}
        </div>
      </div>` : ''}
    </div>
  `;
}

// ─── Menu Toggles ─────────────────────────────────────────
function toggleSidebarMenu() {
  const m = document.getElementById('sidebar-menu');
  m.style.display = m.style.display === 'none' ? 'block' : 'none';
}
function closeSidebarMenu() { document.getElementById('sidebar-menu').style.display = 'none'; }

function toggleChatMenu() {
  const m = document.getElementById('chat-menu');
  m.style.display = m.style.display === 'none' ? 'block' : 'none';
}
function closeChatMenu() { document.getElementById('chat-menu').style.display = 'none'; }

function clearChatConfirm() {
  closeChatMenu();
  if (confirm('Clear all messages in this chat? This cannot be undone.')) {
    db.ref(`messages/${activeChatId}`).remove();
    showToast('Chat cleared.', 'info');
  }
}

function startCall(type) {
  showToast(`${type === 'audio' ? '📞 Voice' : '📹 Video'} call feature coming soon!`, 'info');
}

// ─── Scroll ───────────────────────────────────────────────
function scrollToBottom(smooth = true) {
  const c = document.getElementById('messages-container');
  c.scrollTo({ top: c.scrollHeight, behavior: smooth ? 'smooth' : 'instant' });
}

// ─── Global Listeners ─────────────────────────────────────
function setupGlobalListeners() {
  // Close menus on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#sidebar-menu') && !e.target.closest('#menu-btn')) {
      closeSidebarMenu();
    }
    if (!e.target.closest('#chat-menu') && !e.target.closest('#chat-menu-btn')) {
      closeChatMenu();
    }
    if (!e.target.closest('#attach-panel') && !e.target.closest('#attach-btn') && attachOpen) {
      toggleAttachPanel();
    }
  });

  // Handle back/forward for mobile
  window.addEventListener('popstate', () => {
    if (activeChatId) closeChatWindow();
  });

  // Drag & drop on chat window
  const chatWindow = document.getElementById('chat-window');
  chatWindow.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  chatWindow.addEventListener('drop', e => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && activeChatId) {
      const type = Messaging.getFileType(file);
      handleDroppedFile(file, type);
    }
  });
}

async function handleDroppedFile(file, type) {
  const progressEl = showUploadProgress(type);
  const res = await Messaging.uploadMedia(file, activeChatId, currentUser.uid, pct => {
    if (progressEl) progressEl.querySelector('.progress-bar').style.width = pct + '%';
  });
  removeUploadProgress(progressEl);
  if (!res.success) return showToast(res.error, 'error');
  await Messaging.sendMessage(activeChatId, currentUser.uid, file.name, type, res.url);
}

// ─── Search messages ──────────────────────────────────────
function openSearchMessages() {
  closeChatMenu();
  const query = prompt('Search messages:');
  if (!query) return;
  const msgs = document.querySelectorAll('.bubble');
  let found = 0;
  msgs.forEach(m => {
    if (m.textContent.toLowerCase().includes(query.toLowerCase())) {
      m.scrollIntoView({ behavior: 'smooth', block: 'center' });
      m.style.outline = '2px solid var(--accent)';
      setTimeout(() => m.style.outline = '', 2000);
      found++;
    }
  });
  if (!found) showToast('No messages found.', 'info');
  else showToast(`${found} message(s) found.`, 'success');
}
