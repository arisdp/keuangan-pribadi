const CACHE_NAME = 'nusantara-wealth-v3';
const DYNAMIC_CACHE_NAME = 'nusantara-wealth-dynamic-v3';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/assets/icon-192.png'
];

// 1. Install Event - Pre-cache core app shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {});
    }).then(() => self.skipWaiting())
  );
});

// 2. Activate Event - Clean up old cache versions immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME && cache !== DYNAMIC_CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Fetch Event - Aggressive Caching Strategy
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests or browser extension requests
  if (event.request.method !== 'GET' || !url.protocol.startsWith('http')) {
    return;
  }

  // API Requests: Network First, fallback to graceful JSON offline response
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          return networkResponse;
        })
        .catch(() => {
          return new Response(
            JSON.stringify({ 
              offline: true, 
              message: 'Mode Offline: Menggunakan penyimpanan data lokal (IndexedDB / localStorage).' 
            }),
            { 
              headers: { 'Content-Type': 'application/json' }, 
              status: 503 
            }
          );
        })
    );
    return;
  }

  // Navigation Requests (HTML Documents): Cache-First / Network Fallback for ultra-fast load
  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          // Revalidate in background to keep cache fresh
          fetch(event.request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
            }
          }).catch(() => {});
          return cachedResponse;
        }

        // If not in cache, fetch from network
        return fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
            }
            return networkResponse;
          })
          .catch(() => {
            return caches.match('/index.html') || caches.match('/');
          });
      })
    );
    return;
  }

  // Static Assets (JS, CSS, Web Fonts, Images, SVGs): Stale-While-Revalidate Strategy
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (
            networkResponse && 
            networkResponse.status === 200 && 
            (networkResponse.type === 'basic' || networkResponse.type === 'cors')
          ) {
            const responseClone = networkResponse.clone();
            caches.open(DYNAMIC_CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => {});

      // Stale-While-Revalidate: Return cached version immediately if available while fetching updated asset in background
      return cachedResponse || fetchPromise;
    })
  );
});

// 4. Local Push Notifications for Recurring Transactions (Tagihan Rutin Jatuh Tempo <= 3 Hari)
/**
 * Calculates days remaining until the next due day in current/next month.
 * Returns { daysUntilDue, dueDateString }
 */
function calculateDaysUntilDue(dayOfMonth) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed
  const todayDate = now.getDate();

  // Clamp dayOfMonth to valid days in current month
  const lastDayThisMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const validDayThisMonth = Math.min(dayOfMonth, lastDayThisMonth);

  let targetDate = new Date(currentYear, currentMonth, validDayThisMonth);

  // Normalize time components for accurate day comparison
  const startOfToday = new Date(currentYear, currentMonth, todayDate);

  // If due date in current month has passed today, check next month
  if (targetDate.getTime() < startOfToday.getTime()) {
    const lastDayNextMonth = new Date(currentYear, currentMonth + 2, 0).getDate();
    const validDayNextMonth = Math.min(dayOfMonth, lastDayNextMonth);
    targetDate = new Date(currentYear, currentMonth + 1, validDayNextMonth);
  }

  const diffMs = targetDate.getTime() - startOfToday.getTime();
  const daysUntilDue = Math.round(diffMs / (1000 * 60 * 60 * 24));

  const options = { day: 'numeric', month: 'long', year: 'numeric' };
  const dueDateString = targetDate.toLocaleDateString('id-ID', options);

  return { daysUntilDue, dueDateString, targetDate };
}

/**
 * Inspect active recurring transactions and trigger local push notifications
 * for any items due within 3 days (0, 1, 2, or 3 days).
 */
async function checkAndShowRecurringNotifications(recurringTransactions) {
  if (!recurringTransactions || !Array.isArray(recurringTransactions)) return;
  if (!('showNotification' in self.registration)) return;
  if (self.Notification && self.Notification.permission !== 'granted') {
    return;
  }

  const activeRecs = recurringTransactions.filter(r => r.isActive !== false);
  const nowYear = new Date().getFullYear();
  const nowMonth = new Date().getMonth() + 1;

  for (const item of activeRecs) {
    const { daysUntilDue, dueDateString } = calculateDaysUntilDue(item.dayOfMonth || 1);

    // Filter items falling due within 3 days (0 = hari ini, 1 = besok, 2 = 2 hari lagi, 3 = 3 hari lagi)
    if (daysUntilDue >= 0 && daysUntilDue <= 3) {
      let statusText = '';
      if (daysUntilDue === 0) {
        statusText = 'JATUH TEMPO HARI INI';
      } else if (daysUntilDue === 1) {
        statusText = 'Jatuh Tempo Besok';
      } else {
        statusText = `Jatuh Tempo Dalam ${daysUntilDue} Hari`;
      }

      const formattedAmount = new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0
      }).format(item.amount || 0);

      const title = `⏰ Tagihan Rutin: ${item.title || 'Tagihan'}`;
      const notificationTag = `recurring-due-${item.id}-${nowYear}-${nowMonth}-${daysUntilDue}`;

      const options = {
        body: `[${statusText}] Nominal: ${formattedAmount}\nKategori: ${item.category || 'Umum'}\nJatuh tempo: ${dueDateString}.`,
        icon: '/assets/icon-192.png',
        badge: '/assets/icon-192.png',
        tag: notificationTag,
        renotify: true,
        vibrate: [200, 100, 200],
        data: {
          url: '/',
          recurringId: item.id,
          daysUntilDue
        },
        actions: [
          { action: 'open_app', title: 'Buka Aplikasi' },
          { action: 'dismiss', title: 'Abaikan' }
        ]
      };

      try {
        await self.registration.showNotification(title, options);
      } catch {
        // Ignore notification errors silently
      }
    }
  }
}

// 5. Service Worker Message & Push Event Handlers
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CHECK_RECURRING_DUE') {
    checkAndShowRecurringNotifications(event.data.recurringTransactions);
  }

  if (event.data && event.data.type === 'TEST_NOTIFICATION') {
    if (self.Notification && self.Notification.permission !== 'granted') {
      return;
    }
    self.registration.showNotification('🔔 Tes Pemberitahuan Nusantara Wealth', {
      body: 'Sistem pengingat tagihan rutin (Push Local SW <= 3 hari) aktif dan berjalan dengan baik.',
      icon: '/assets/icon-192.png',
      badge: '/assets/icon-192.png',
      tag: 'test-notification'
    });
  }
});

// Push Event listener (for server-sent web push if configured)
self.addEventListener('push', (event) => {
  if (!event.data) return;
  try {
    const payload = event.data.json();
    if (payload && payload.recurringTransactions) {
      event.waitUntil(checkAndShowRecurringNotifications(payload.recurringTransactions));
    } else if (payload && payload.title) {
      event.waitUntil(
        self.registration.showNotification(payload.title, {
          body: payload.body || '',
          icon: '/assets/icon-192.png',
          badge: '/assets/icon-192.png',
          tag: payload.tag || 'push-notice'
        })
      );
    }
  } catch {
    // Ignore malformed push payload
  }
});

// Notification Click Event Handler - Open / Focus App
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
