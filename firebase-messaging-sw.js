// ============================================================
// NexChat — Firebase Messaging Service Worker
// Handles background push notifications
// Save as: firebase-messaging-sw.js (root of project)
// ============================================================

importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
});

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  const { title, body, icon } = payload.notification || {};
  const data = payload.data || {};

  self.registration.showNotification(title || 'NexChat', {
    body: body || 'You have a new message',
    icon: icon || '/assets/icon-192.png',
    badge: '/assets/icon-72.png',
    tag: data.chatId || 'nexchat-msg',
    data: { url: '/chat.html', chatId: data.chatId },
    actions: [
      { action: 'open', title: 'Open Chat' },
      { action: 'dismiss', title: 'Dismiss' }
    ],
    vibrate: [200, 100, 200]
  });
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const url = event.notification.data?.url || '/chat.html';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      for (const client of windowClients) {
        if (client.url.includes(url) && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

// Cache app shell on install
const CACHE_NAME = 'nexchat-v1';
const CACHE_URLS = [
  '/',
  '/index.html',
  '/login.html',
  '/chat.html',
  '/profile.html',
  '/css/global.css',
  '/css/chat.css',
  '/css/login.css',
  '/css/profile.css'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CACHE_URLS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first strategy for HTML, cache-first for assets
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (event.request.url.includes('firebaseio.com') || event.request.url.includes('googleapis.com')) return;

  event.respondWith(
    fetch(event.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
