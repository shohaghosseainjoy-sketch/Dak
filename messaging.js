// ============================================================
// NexChat - Messaging Module
// Real-time messages, typing, read receipts, media
// ============================================================

const Messaging = (() => {
  const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
  let activeListeners = {};
  let typingTimeout = null;
  let chatEncryptionKeys = {};

  // ─── Get Chat ID ─────────────────────────────────────────
  const getChatId = (uid1, uid2) => [uid1, uid2].sort().join('_');

  // ─── Get or Create Chat ───────────────────────────────────
  const getOrCreateChat = async (currentUid, targetUid) => {
    const chatId = getChatId(currentUid, targetUid);
    const chatRef = db.ref(`chats/${chatId}`);
    const snap = await chatRef.once('value');
    if (!snap.exists()) {
      await chatRef.set({
        participants: { [currentUid]: true, [targetUid]: true },
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        lastMessage: null,
        lastMessageTime: null
      });
    }
    // Cache encryption key
    if (!chatEncryptionKeys[chatId]) {
      chatEncryptionKeys[chatId] = await EncryptionUtil.generateChatKey(currentUid, targetUid);
    }
    return chatId;
  };

  // ─── Send Message ─────────────────────────────────────────
  const sendMessage = async (chatId, senderId, content, type = 'text', mediaURL = null) => {
    try {
      const key = chatEncryptionKeys[chatId];
      const encryptedContent = key && type === 'text'
        ? await EncryptionUtil.encrypt(content, key)
        : content;

      const msgRef = db.ref(`messages/${chatId}`).push();
      const message = {
        id: msgRef.key,
        senderId,
        content: encryptedContent,
        type, // text | image | video | audio | file
        mediaURL: mediaURL || null,
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        status: 'sent', // sent | delivered | seen
        encrypted: type === 'text' && !!key
      };

      await msgRef.set(message);

      // Update chat meta
      await db.ref(`chats/${chatId}`).update({
        lastMessage: type === 'text' ? content.slice(0, 60) : `📎 ${type}`,
        lastMessageTime: firebase.database.ServerValue.TIMESTAMP,
        lastSenderId: senderId
      });

      // Update unread count for recipient
      const participants = await db.ref(`chats/${chatId}/participants`).once('value');
      const recipientUid = Object.keys(participants.val()).find(uid => uid !== senderId);
      if (recipientUid) {
        const unreadRef = db.ref(`chats/${chatId}/unread/${recipientUid}`);
        const snap = await unreadRef.once('value');
        await unreadRef.set((snap.val() || 0) + 1);
      }

      return { success: true, messageId: msgRef.key };
    } catch (err) {
      console.error('Send message error:', err);
      return { success: false, error: err.message };
    }
  };

  // ─── Listen to Messages ───────────────────────────────────
  const listenToMessages = (chatId, currentUid, callback) => {
    // Remove existing listener
    if (activeListeners[chatId]) {
      db.ref(`messages/${chatId}`).off('value', activeListeners[chatId]);
    }

    const handler = async (snap) => {
      const messages = [];
      const key = chatEncryptionKeys[chatId];
      snap.forEach(child => {
        messages.push({ ...child.val(), id: child.key });
      });

      // Decrypt text messages
      const decrypted = await Promise.all(messages.map(async msg => {
        if (msg.encrypted && key && msg.type === 'text') {
          return { ...msg, content: await EncryptionUtil.decrypt(msg.content, key) };
        }
        return msg;
      }));

      callback(decrypted);

      // Mark messages as delivered/seen
      markMessagesAsSeen(chatId, currentUid, messages);
    };

    db.ref(`messages/${chatId}`).orderByChild('timestamp').on('value', handler);
    activeListeners[chatId] = handler;
  };

  // ─── Mark Messages As Seen ───────────────────────────────
  const markMessagesAsSeen = async (chatId, viewerUid, messages) => {
    const updates = {};
    messages.forEach(msg => {
      if (msg.senderId !== viewerUid && msg.status !== 'seen') {
        updates[`messages/${chatId}/${msg.id}/status`] = 'seen';
      }
    });
    if (Object.keys(updates).length > 0) {
      await db.ref().update(updates);
      await db.ref(`chats/${chatId}/unread/${viewerUid}`).set(0);
    }
  };

  // ─── Typing Indicator ─────────────────────────────────────
  const setTyping = (chatId, uid, isTyping) => {
    db.ref(`typing/${chatId}/${uid}`).set(isTyping ? true : null);
    if (isTyping) {
      clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => {
        db.ref(`typing/${chatId}/${uid}`).set(null);
      }, 3000);
    }
  };

  const listenToTyping = (chatId, currentUid, callback) => {
    db.ref(`typing/${chatId}`).on('value', snap => {
      const data = snap.val() || {};
      const typingUsers = Object.keys(data).filter(uid => uid !== currentUid && data[uid]);
      callback(typingUsers.length > 0);
    });
  };

  // ─── Load Chat List ───────────────────────────────────────
  const listenToChatList = (uid, callback) => {
    db.ref('chats').orderByChild(`participants/${uid}`).equalTo(true).on('value', async snap => {
      const chats = [];
      const promises = [];

      snap.forEach(child => {
        const chat = { id: child.key, ...child.val() };
        const otherUid = Object.keys(chat.participants).find(p => p !== uid);
        if (otherUid) {
          promises.push(
            db.ref(`users/${otherUid}`).once('value').then(userSnap => {
              if (userSnap.exists()) {
                chats.push({ ...chat, contact: { uid: otherUid, ...userSnap.val() } });
              }
            })
          );
        }
      });

      await Promise.all(promises);
      chats.sort((a, b) => (b.lastMessageTime || 0) - (a.lastMessageTime || 0));
      callback(chats);
    });
  };

  // ─── Upload Media ─────────────────────────────────────────
  const uploadMedia = async (file, chatId, senderId, onProgress) => {
    if (file.size > MAX_FILE_SIZE) {
      return { success: false, error: 'File size exceeds 20MB limit.' };
    }

    const ext = file.name.split('.').pop();
    const fileName = `${Date.now()}_${senderId}.${ext}`;
    const path = `chat_media/${chatId}/${fileName}`;
    const ref = storage.ref(path);

    return new Promise((resolve) => {
      const task = ref.put(file);
      task.on('state_changed',
        snap => {
          const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
          onProgress?.(pct);
        },
        err => resolve({ success: false, error: err.message }),
        async () => {
          const url = await task.snapshot.ref.getDownloadURL();
          resolve({ success: true, url, name: file.name, size: file.size });
        }
      );
    });
  };

  // ─── Get Message Type from File ───────────────────────────
  const getFileType = (file) => {
    if (file.type.startsWith('image/')) return 'image';
    if (file.type.startsWith('video/')) return 'video';
    if (file.type.startsWith('audio/')) return 'audio';
    return 'file';
  };

  // ─── Delete Message ───────────────────────────────────────
  const deleteMessage = async (chatId, messageId, senderId) => {
    const msgRef = db.ref(`messages/${chatId}/${messageId}`);
    const snap = await msgRef.once('value');
    if (snap.exists() && snap.val().senderId === senderId) {
      await msgRef.update({ content: 'This message was deleted', type: 'deleted', mediaURL: null });
      return { success: true };
    }
    return { success: false, error: 'Not authorized.' };
  };

  // ─── Remove Listener ─────────────────────────────────────
  const removeListener = (chatId) => {
    if (activeListeners[chatId]) {
      db.ref(`messages/${chatId}`).off('value', activeListeners[chatId]);
      delete activeListeners[chatId];
    }
    db.ref(`typing/${chatId}`).off();
  };

  return {
    getChatId,
    getOrCreateChat,
    sendMessage,
    listenToMessages,
    listenToChatList,
    setTyping,
    listenToTyping,
    uploadMedia,
    getFileType,
    deleteMessage,
    removeListener,
    markMessagesAsSeen
  };
})();

window.Messaging = Messaging;
