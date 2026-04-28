// ============================================================
// NexChat — Profile Page Controller
// ============================================================

let currentUser = null;
let userProfile = null;
let editingField = null;

document.addEventListener('DOMContentLoaded', async () => {
  currentUser = await requireAuth('login.html');
  await loadProfile();
  await Notifications.init();
});

async function loadProfile() {
  userProfile = await Users.getCurrentUser();
  if (!userProfile) return showToast('Failed to load profile.', 'error');

  // Avatar
  const avatar = document.getElementById('profile-avatar');
  const initials = getInitials(userProfile.displayName || userProfile.username || '?');
  const bg = stringToColor(userProfile.uid);
  avatar.style.background = bg;
  avatar.innerHTML = userProfile.photoURL ? `<img src="${userProfile.photoURL}" alt="">` : initials;

  // Info
  document.getElementById('profile-name').textContent = userProfile.displayName || 'No Name';
  document.getElementById('profile-username').textContent = `@${userProfile.username || 'username'}`;
  document.getElementById('profile-bio').textContent = userProfile.bio || 'No bio yet';
  document.getElementById('edit-name-sub').textContent = userProfile.displayName || '—';
  document.getElementById('edit-username-sub').textContent = `@${userProfile.username || '—'}`;
  document.getElementById('edit-bio-sub').textContent = userProfile.bio || '—';

  if (userProfile.phone) {
    document.getElementById('profile-phone').style.display = 'flex';
    document.getElementById('profile-phone-text').textContent = userProfile.phone;
  }

  // Settings toggles
  const s = userProfile.settings || {};
  setToggle('notif-toggle', s.notifications !== false);
  setToggle('receipts-toggle', s.readReceipts !== false);
  setToggle('sound-toggle', s.sound !== false);
  setToggle('lastseen-toggle', s.lastSeen !== false);

  // Blocked count
  const blocked = userProfile.blocked ? Object.keys(userProfile.blocked).length : 0;
  document.getElementById('blocked-count-sub').textContent =
    blocked > 0 ? `${blocked} blocked user${blocked > 1 ? 's' : ''}` : 'No blocked users';
}

function setToggle(id, on) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle('on', on);
}

// ─── Avatar Upload ────────────────────────────────────────
async function handleAvatarUpload(input) {
  const file = input.files?.[0];
  if (!file) return;
  showLoader('Uploading photo...');
  const res = await Users.uploadProfilePhoto(currentUser.uid, file);
  hideLoader();
  if (!res.success) return showToast(res.error, 'error');
  const avatar = document.getElementById('profile-avatar');
  avatar.innerHTML = `<img src="${res.url}" alt="">`;
  showToast('Profile photo updated!', 'success');
  input.value = '';
}

// ─── Edit Modal ───────────────────────────────────────────
function openEditModal(field) {
  editingField = field;
  const configs = {
    name: { title: 'Edit Name', label: 'Display Name', value: userProfile.displayName || '', rows: 1 },
    username: { title: 'Edit Username', label: 'Username (letters, numbers, _ only)', value: userProfile.username || '', rows: 1 },
    bio: { title: 'Edit Bio', label: 'About You', value: userProfile.bio || '', rows: 3 },
  };
  const c = configs[field];
  document.getElementById('edit-modal-title').textContent = c.title;
  document.getElementById('edit-field-label').textContent = c.label;
  const inp = document.getElementById('edit-field-input');
  inp.value = c.value;
  inp.rows = c.rows;
  document.getElementById('edit-modal').style.display = 'flex';
  setTimeout(() => inp.focus(), 100);
}

async function saveEdit() {
  const value = document.getElementById('edit-field-input').value.trim();
  if (!value) return showToast('Value cannot be empty.', 'error');

  const updates = {};
  if (editingField === 'name') updates.displayName = value;
  if (editingField === 'username') updates.username = value;
  if (editingField === 'bio') updates.bio = value;

  showLoader('Saving...');
  const res = await Users.updateProfile(currentUser.uid, updates);
  hideLoader();

  if (!res.success) return showToast(res.error, 'error');

  document.getElementById('edit-modal').style.display = 'none';
  showToast('Profile updated!', 'success');
  await loadProfile();
}

// ─── Settings Toggles ─────────────────────────────────────
async function toggleSetting(key, el) {
  const isOn = el.classList.toggle('on');
  const updates = {};
  updates[`settings/${key}`] = isOn;
  await db.ref(`users/${currentUser.uid}`).update(updates);

  if (key === 'notifications' && isOn) {
    await Notifications.requestPermission(currentUser.uid);
  }
}

// ─── Blocked Users ────────────────────────────────────────
async function openBlockedList() {
  document.getElementById('blocked-modal').style.display = 'flex';
  const container = document.getElementById('blocked-list-content');

  const snap = await db.ref(`users/${currentUser.uid}/blocked`).once('value');
  if (!snap.exists()) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">✅</div><p>No blocked users</p></div>';
    return;
  }

  const blockedUids = Object.keys(snap.val());
  const users = await Promise.all(
    blockedUids.map(uid => db.ref(`users/${uid}`).once('value').then(s => s.exists() ? { uid, ...s.val() } : null))
  );

  const valid = users.filter(Boolean);
  if (valid.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">✅</div><p>No blocked users</p></div>';
    return;
  }

  container.innerHTML = valid.map(u => `
    <div class="blocked-user-item">
      <div class="avatar avatar-sm" style="background:${stringToColor(u.uid)}">${getInitials(u.displayName || '?')}</div>
      <div class="blocked-user-name">${sanitize(u.displayName || u.username || 'Unknown')}</div>
      <button class="btn btn-secondary btn-sm" onclick="unblockUser('${u.uid}', this)">Unblock</button>
    </div>
  `).join('');
}

async function unblockUser(uid, btn) {
  btn.disabled = true;
  await Users.unblockUser(currentUser.uid, uid);
  btn.closest('.blocked-user-item').remove();
  showToast('User unblocked.', 'success');
  await loadProfile();
}

// ─── Security ─────────────────────────────────────────────
function showEncryptionInfo() {
  alert('🔒 NexChat uses AES-256-GCM end-to-end encryption.\n\nMessages are encrypted on your device before being sent, and only decrypted by the recipient. Even Firebase cannot read your messages.');
}

async function changePassword() {
  const email = auth.currentUser?.email;
  if (!email) return showToast('Password change is only available for email accounts.', 'info');

  if (confirm(`Send a password reset email to ${email}?`)) {
    try {
      await auth.sendPasswordResetEmail(email);
      showToast('Password reset email sent!', 'success');
    } catch (e) {
      showToast('Failed to send reset email.', 'error');
    }
  }
}

// ─── About ────────────────────────────────────────────────
function showAbout() {
  alert('NexChat v1.0.0\n\nA modern real-time messaging app built with Firebase.\n\n🔒 E2E Encrypted\n⚡ Real-time\n📱 Mobile First\n\nBuilt with ❤️');
}

// ─── Delete Account ───────────────────────────────────────
async function confirmDeleteAccount() {
  const confirmed = confirm('⚠️ Delete your account?\n\nThis will permanently delete all your messages, contacts and account data. This action CANNOT be undone.');
  if (!confirmed) return;

  const again = confirm('Are you absolutely sure? Type OK to confirm.');
  if (!again) return;

  try {
    showLoader('Deleting account...');
    // Remove user data
    await db.ref(`users/${currentUser.uid}`).remove();
    await db.ref(`contacts/${currentUser.uid}`).remove();
    // Delete auth account
    await auth.currentUser.delete();
    hideLoader();
    window.location.href = 'index.html';
  } catch (err) {
    hideLoader();
    if (err.code === 'auth/requires-recent-login') {
      showToast('Please log out and log back in before deleting your account.', 'error');
    } else {
      showToast('Failed to delete account: ' + err.message, 'error');
    }
  }
}
