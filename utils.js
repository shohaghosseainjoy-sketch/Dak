// ============================================================
// NexChat - Shared Utilities
// ============================================================

// ─── Toast Notifications ──────────────────────────────────
const showToast = (message, type = 'info', duration = 3500) => {
  const existing = document.querySelector('.toast');
  existing?.remove();

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
  toast.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ'}</span><span>${message}</span>`;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 400); }, duration);
};

// ─── Loading Overlay ──────────────────────────────────────
const showLoader = (msg = 'Loading...') => {
  let overlay = document.getElementById('global-loader');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'global-loader';
    overlay.innerHTML = `<div class="loader-inner"><div class="loader-spinner"></div><p>${msg}</p></div>`;
    document.body.appendChild(overlay);
  } else {
    overlay.querySelector('p').textContent = msg;
    overlay.style.display = 'flex';
  }
};

const hideLoader = () => {
  const overlay = document.getElementById('global-loader');
  if (overlay) overlay.style.display = 'none';
};

// ─── Format File Size ─────────────────────────────────────
const formatFileSize = (bytes) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

// ─── Sanitize HTML ────────────────────────────────────────
const sanitize = (str) => {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
};

// ─── Linkify Text ─────────────────────────────────────────
const linkify = (text) => {
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g;
  return sanitize(text).replace(urlRegex, url =>
    `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`
  );
};

// ─── Format Timestamp ─────────────────────────────────────
const formatChatListTime = (timestamp) => {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  const now = new Date();
  const diff = now - d;
  if (diff < 86400000 && d.getDate() === now.getDate()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (diff < 604800000) {
    return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];
  }
  return d.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: '2-digit' });
};

// ─── Debounce ─────────────────────────────────────────────
const debounce = (fn, delay) => {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
};

// ─── Check Auth Guard ─────────────────────────────────────
const requireAuth = (redirectTo = 'login.html') => {
  return new Promise((resolve) => {
    const unsub = auth.onAuthStateChanged(user => {
      unsub();
      if (!user) {
        window.location.href = redirectTo;
      } else {
        resolve(user);
      }
    });
  });
};

// ─── Avatar Initials ─────────────────────────────────────
const getInitials = (name) => {
  if (!name) return '?';
  const parts = name.trim().split(' ');
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
};

// ─── Generate Gradient Color from String ─────────────────
const stringToColor = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 40%, 30%)`;
};

// ─── Image Preview Modal ──────────────────────────────────
const openImageModal = (src, caption = '') => {
  const modal = document.createElement('div');
  modal.className = 'media-modal';
  modal.innerHTML = `
    <div class="media-modal-overlay" onclick="this.parentElement.remove()"></div>
    <div class="media-modal-content">
      <button class="media-modal-close" onclick="this.closest('.media-modal').remove()">✕</button>
      <img src="${src}" alt="${caption}" />
      ${caption ? `<p class="media-caption">${sanitize(caption)}</p>` : ''}
    </div>
  `;
  document.body.appendChild(modal);
};

window.showToast = showToast;
window.showLoader = showLoader;
window.hideLoader = hideLoader;
window.formatFileSize = formatFileSize;
window.sanitize = sanitize;
window.linkify = linkify;
window.formatChatListTime = formatChatListTime;
window.debounce = debounce;
window.requireAuth = requireAuth;
window.getInitials = getInitials;
window.stringToColor = stringToColor;
window.openImageModal = openImageModal;
