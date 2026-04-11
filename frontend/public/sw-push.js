// CarryOn™ Push Notification Service Worker

self.addEventListener('push', function(event) {
  console.log('[Service Worker] Push Received.');
  
  let data = { title: 'CarryOn™', body: 'You have a new notification', icon: '/logo192.png' };
  
  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch (e) {
    console.error('Error parsing push data:', e);
  }

  const options = {
    body: data.body || 'You have a new notification',
    icon: data.icon || '/logo192.png',
    badge: '/logo192.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/',
      type: data.type || 'general'
    },
    actions: data.actions || [],
    tag: data.tag || 'carryon-notification',
    renotify: true
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'CarryOn™', options)
      .then(function() {
        // Update badge count on the PWA icon
        if (navigator.setAppBadge) {
          return self.registration.getNotifications().then(function(notifications) {
            navigator.setAppBadge(notifications.length);
          });
        }
      })
  );
});

self.addEventListener('notificationclick', function(event) {
  console.log('[Service Worker] Notification click received.');
  
  event.notification.close();

  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    // Update badge count (decrement since we closed one)
    self.registration.getNotifications()
      .then(function(notifications) {
        if (navigator.setAppBadge) {
          if (notifications.length > 0) {
            navigator.setAppBadge(notifications.length);
          } else {
            navigator.clearAppBadge();
          }
        }
      })
      .then(function() {
        return clients.matchAll({ type: 'window', includeUncontrolled: true });
      })
      .then(function(clientList) {
        // Check if there's already a window open
        for (let i = 0; i < clientList.length; i++) {
          const client = clientList[i];
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.navigate(urlToOpen);
            return client.focus();
          }
        }
        // If no window is open, open a new one
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});

// Handle notification dismissal (user swipes away)
self.addEventListener('notificationclose', function(event) {
  console.log('[Service Worker] Notification dismissed.');
  event.waitUntil(
    self.registration.getNotifications().then(function(notifications) {
      if (navigator.setAppBadge) {
        if (notifications.length > 0) {
          navigator.setAppBadge(notifications.length);
        } else {
          navigator.clearAppBadge();
        }
      }
    })
  );
});

// Listen for messages from the client to manage badge
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'CLEAR_BADGE') {
    if (navigator.clearAppBadge) {
      navigator.clearAppBadge();
    }
  } else if (event.data && event.data.type === 'SET_BADGE') {
    var count = event.data.count || 0;
    if (count > 0 && navigator.setAppBadge) {
      navigator.setAppBadge(count);
    } else if (navigator.clearAppBadge) {
      navigator.clearAppBadge();
    }
  }
});

self.addEventListener('install', function(event) {
  console.log('[Service Worker] Installing...');
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  console.log('[Service Worker] Activating...');
  event.waitUntil(clients.claim());
});
