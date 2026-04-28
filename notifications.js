// ============================================================
// NexChat - Notifications Module (FCM)
// ============================================================

const Notifications = (() => {
  let messaging = null;

  const init = async () => {
    try {
      if (!firebase.messaging.isSupported()) return;
      messaging = firebase.messaging();
      messaging.usePublicVapidKey(FCM_VAPID_KEY);
    } catch (e) {
      console.warn('FCM not supported:', e);
    }
  };

  const requestPermission = async (uid) => {
    if (!messaging) return false;
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return false;
      const token = await messaging.getToken();
      if (token) {
        await db.ref(`users/${uid}/fcmToken`).set(token);
        setupForegroundHandler();
        return true;
      }
      return false;
    } catch (e) {
      console.warn('Notification permission error:', e);
      return false;
    }
  };

  const setupForegroundHandler = () => {
    if (!messaging) return;
    messaging.onMessage(payload => {
      const { title, body, icon } = payload.notification || {};
      showInAppNotification(title, body, icon);
    });
  };

  const showInAppNotification = (title, body, icon) => {
    const container = document.getElementById('notification-container') || createNotifContainer();
    const notif = document.createElement('div');
    notif.className = 'in-app-notif';
    notif.innerHTML = `
      <div class="notif-icon">
        ${icon ? `<img src="${icon}" alt="">` : '<div class="notif-avatar">N</div>'}
      </div>
      <div class="notif-text">
        <div class="notif-title">${title || 'NexChat'}</div>
        <div class="notif-body">${body || ''}</div>
      </div>
      <button class="notif-close" onclick="this.parentElement.remove()">✕</button>
    `;
    container.appendChild(notif);
    setTimeout(() => notif.remove(), 5000);
  };

  const createNotifContainer = () => {
    const el = document.createElement('div');
    el.id = 'notification-container';
    document.body.appendChild(el);
    return el;
  };

  const showBrowserNotif = (title, body, onClick) => {
    if (Notification.permission !== 'granted') return;
    const notif = new Notification(title, { body, icon: 'assets/icon-192.png', badge: 'assets/icon-72.png' });
    notif.onclick = () => { onClick?.(); notif.close(); };
  };

  return { init, requestPermission, showInAppNotification, showBrowserNotif };
})();

window.Notifications = Notifications;
