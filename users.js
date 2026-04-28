// ============================================================
// NexChat - Users & Contacts Module
// Search, add/remove contacts, block, profile updates
// ============================================================

const Users = (() => {

  // ─── Get Current User Profile ─────────────────────────────
  const getCurrentUser = async () => {
    const user = auth.currentUser;
    if (!user) return null;
    const snap = await db.ref(`users/${user.uid}`).once('value');
    return snap.exists() ? { uid: user.uid, ...snap.val() } : null;
  };

  // ─── Listen to User Profile ───────────────────────────────
  const listenToUser = (uid, callback) => {
    db.ref(`users/${uid}`).on('value', snap => {
      callback(snap.exists() ? { uid, ...snap.val() } : null);
    });
  };

  // ─── Update Profile ───────────────────────────────────────
  const updateProfile = async (uid, updates) => {
    try {
      // Validate username uniqueness
      if (updates.username) {
        const existing = await findByUsername(updates.username);
        if (existing && existing.uid !== uid) {
          return { success: false, error: 'Username already taken.' };
        }
        updates.username = updates.username.toLowerCase().replace(/[^a-z0-9_]/g, '');
      }
      await db.ref(`users/${uid}`).update({ ...updates, updatedAt: firebase.database.ServerValue.TIMESTAMP });
      if (updates.displayName) {
        await auth.currentUser?.updateProfile({ displayName: updates.displayName });
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  // ─── Upload Profile Photo ─────────────────────────────────
  const uploadProfilePhoto = async (uid, file) => {
    try {
      if (file.size > 5 * 1024 * 1024) return { success: false, error: 'Photo must be under 5MB.' };
      const ref = storage.ref(`profile_photos/${uid}`);
      await ref.put(file);
      const url = await ref.getDownloadURL();
      await db.ref(`users/${uid}`).update({ photoURL: url });
      await auth.currentUser?.updateProfile({ photoURL: url });
      return { success: true, url };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  // ─── Search Users by Username ─────────────────────────────
  const searchByUsername = async (query) => {
    if (!query || query.length < 2) return [];
    const q = query.toLowerCase().trim();
    const snap = await db.ref('users').orderByChild('username').startAt(q).endAt(q + '\uf8ff').limitToFirst(20).once('value');
    const results = [];
    snap.forEach(child => results.push({ uid: child.key, ...child.val() }));
    return results;
  };

  // ─── Find by Username (exact) ─────────────────────────────
  const findByUsername = async (username) => {
    const q = username.toLowerCase().trim();
    const snap = await db.ref('users').orderByChild('username').equalTo(q).limitToFirst(1).once('value');
    let user = null;
    snap.forEach(child => { user = { uid: child.key, ...child.val() }; });
    return user;
  };

  // ─── Find by Phone ────────────────────────────────────────
  const findByPhone = async (phone) => {
    const snap = await db.ref('users').orderByChild('phone').equalTo(phone).limitToFirst(1).once('value');
    let user = null;
    snap.forEach(child => { user = { uid: child.key, ...child.val() }; });
    return user;
  };

  // ─── Get Contacts ─────────────────────────────────────────
  const getContacts = async (uid) => {
    const snap = await db.ref(`contacts/${uid}`).once('value');
    if (!snap.exists()) return [];
    const contactIds = Object.keys(snap.val());
    const users = await Promise.all(
      contactIds.map(id => db.ref(`users/${id}`).once('value').then(s => s.exists() ? { uid: id, ...s.val() } : null))
    );
    return users.filter(Boolean);
  };

  // ─── Add Contact ─────────────────────────────────────────
  const addContact = async (uid, targetUid) => {
    if (uid === targetUid) return { success: false, error: 'Cannot add yourself.' };
    const targetSnap = await db.ref(`users/${targetUid}`).once('value');
    if (!targetSnap.exists()) return { success: false, error: 'User not found.' };
    await db.ref(`contacts/${uid}/${targetUid}`).set(true);
    return { success: true };
  };

  // ─── Remove Contact ───────────────────────────────────────
  const removeContact = async (uid, targetUid) => {
    await db.ref(`contacts/${uid}/${targetUid}`).remove();
    return { success: true };
  };

  // ─── Block User ───────────────────────────────────────────
  const blockUser = async (uid, targetUid) => {
    await db.ref(`users/${uid}/blocked/${targetUid}`).set(true);
    return { success: true };
  };

  // ─── Unblock User ─────────────────────────────────────────
  const unblockUser = async (uid, targetUid) => {
    await db.ref(`users/${uid}/blocked/${targetUid}`).remove();
    return { success: true };
  };

  // ─── Check if Blocked ─────────────────────────────────────
  const isBlocked = async (uid, targetUid) => {
    const snap = await db.ref(`users/${uid}/blocked/${targetUid}`).once('value');
    return snap.exists();
  };

  // ─── Report User ──────────────────────────────────────────
  const reportUser = async (reporterUid, targetUid, reason) => {
    const reportRef = db.ref('reports').push();
    await reportRef.set({
      reporter: reporterUid,
      target: targetUid,
      reason,
      timestamp: firebase.database.ServerValue.TIMESTAMP,
      status: 'pending'
    });
    return { success: true };
  };

  // ─── Format Last Seen ─────────────────────────────────────
  const formatLastSeen = (timestamp) => {
    if (!timestamp) return 'last seen a while ago';
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `last seen ${mins}m ago`;
    if (hours < 24) return `last seen ${hours}h ago`;
    if (days < 7) return `last seen ${days}d ago`;
    return `last seen ${new Date(timestamp).toLocaleDateString()}`;
  };

  // ─── Format Message Time ──────────────────────────────────
  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const d = new Date(timestamp);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDateSeparator = (timestamp) => {
    if (!timestamp) return '';
    const d = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  };

  return {
    getCurrentUser,
    listenToUser,
    updateProfile,
    uploadProfilePhoto,
    searchByUsername,
    findByUsername,
    findByPhone,
    getContacts,
    addContact,
    removeContact,
    blockUser,
    unblockUser,
    isBlocked,
    reportUser,
    formatLastSeen,
    formatTime,
    formatDateSeparator
  };
})();

window.Users = Users;
