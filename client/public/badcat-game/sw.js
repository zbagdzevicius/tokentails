/* Bad Cat Daily service worker (GDD 8: offline-capable for assets). Plain JS, no build step.
 * Registered as sw.js?v=<build id>: every build gets its own cache, old caches are dropped on activate.
 * Routing:
 *   - other origins (backend API, PostHog) and non-GET requests: not touched
 *   - build/* (hashed JS/CSS/assets), icons, icon.svg, manifest: cache first
 *   - HTML pages and navigations, daily JSON, other JSON (treat meter, Pink Paw list): network first,
 *     cache as fallback; an offline navigation falls back to the cached index
 *   - sw.js itself: never cached
 */
'use strict';

var BC_VERSION = (function () {
  try {
    return new URL(self.location.href).searchParams.get('v') || 'dev';
  } catch (e) {
    return 'dev';
  }
})();
var BC_CACHE = 'bcd-' + BC_VERSION;
var BC_PREFIX = 'bcd-';

/**
 * Pure routing: 'cache-first' | 'network-first' | 'bypass'. `scope` is the registration scope URL. `assetBase`
 * (optional) is the folder of sw.js: under the `/badcat/` scope the pages load their assets from `/badcat-game/`,
 * so paths under it are routed relative to it.
 */
function bcRoute(url, scope, method, mode, assetBase) {
  var u;
  var s;
  var a = null;
  try {
    u = new URL(url);
    s = new URL(scope);
    if (assetBase) a = new URL(assetBase);
  } catch (e) {
    return 'bypass';
  }
  if ((method || 'GET') !== 'GET') return 'bypass';
  if (u.origin !== s.origin) return 'bypass';
  var root = s.pathname;
  if (u.pathname.indexOf(root) !== 0) {
    if (!a || a.origin !== u.origin || u.pathname.indexOf(a.pathname) !== 0) return 'bypass';
    root = a.pathname;
  }
  var rel = u.pathname.slice(root.length);
  if (rel === 'sw.js') return 'bypass';
  if (mode === 'navigate') return 'network-first';
  if (rel.indexOf('build/') === 0) return 'cache-first';
  if (rel.indexOf('icons/') === 0 || rel === 'icon.svg' || rel === 'manifest.webmanifest') return 'cache-first';
  if (rel === '' || /\.html$/.test(rel)) return 'network-first';
  if (/\.json$/.test(rel)) return 'network-first';
  if (/^og\//.test(rel)) return 'cache-first';
  return 'bypass';
}
self.bcRoute = bcRoute;

function indexUrl() {
  return self.registration ? self.registration.scope : './';
}

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches
      .open(BC_CACHE)
      .then(function (c) {
        return c.addAll([indexUrl(), 'manifest.webmanifest', 'icon.svg']).catch(function () {});
      })
      .then(function () {
        return self.skipWaiting();
      }),
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys.map(function (k) {
            return k.indexOf(BC_PREFIX) === 0 && k !== BC_CACHE ? caches.delete(k) : null;
          }),
        );
      })
      .then(function () {
        return self.clients.claim();
      }),
  );
});

function putCopy(req, res) {
  if (!res || res.status !== 200 || res.type === 'opaque') return;
  var copy = res.clone();
  caches.open(BC_CACHE).then(function (c) {
    c.put(req, copy);
  });
}

function cacheFirst(req) {
  return caches.match(req).then(function (hit) {
    if (hit) return hit;
    return fetch(req).then(function (res) {
      putCopy(req, res);
      return res;
    });
  });
}

function networkFirst(req, navigate) {
  return fetch(req)
    .then(function (res) {
      putCopy(req, res);
      return res;
    })
    .catch(function () {
      return caches.match(req).then(function (hit) {
        if (hit) return hit;
        if (navigate) {
          return caches.match(indexUrl()).then(function (idx) {
            return idx || new Response('Offline. Your cat is napping until the internet comes back.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
          });
        }
        return new Response('', { status: 504 });
      });
    });
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  var how = bcRoute(req.url, indexUrl(), req.method, req.mode, new URL('./', self.location.href).href);
  if (how === 'bypass') return;
  event.respondWith(how === 'cache-first' ? cacheFirst(req) : networkFirst(req, req.mode === 'navigate'));
});

/* Phase 2 web push (GDD 3.5 "return reasons"; backend/src/badcat/badcat-push.service.ts): the daily reminder the
 * player opted into in Settings. The payload is { title, body, url, tag }; the click opens (or focuses) the game at
 * that url, only when it is on this site. */
function bcPushData(event) {
  try {
    var d = event.data ? event.data.json() : null;
    if (d && typeof d === 'object') return d;
  } catch (e) {
    /* not JSON */
  }
  return {};
}
self.bcPushData = bcPushData;

self.addEventListener('push', function (event) {
  var d = bcPushData(event);
  var title = typeof d.title === 'string' && d.title ? d.title.slice(0, 80) : "Today's room is open";
  var body = typeof d.body === 'string' ? d.body.slice(0, 160) : 'The human is busy. Go.';
  var url = typeof d.url === 'string' ? d.url : indexUrl();
  event.waitUntil(
    self.registration.showNotification(title, {
      body: body,
      tag: typeof d.tag === 'string' ? d.tag : 'badcat-daily',
      icon: new URL('icons/icon-192.png', self.location.href).href,
      badge: new URL('icons/icon-192.png', self.location.href).href,
      data: { url: url },
    }),
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var target = (event.notification.data && event.notification.data.url) || indexUrl();
  var u;
  try {
    u = new URL(target, self.location.href);
    if (u.origin !== self.location.origin) u = new URL(indexUrl());
  } catch (e) {
    u = new URL(indexUrl());
  }
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].url.indexOf(new URL(indexUrl()).pathname) >= 0 && 'focus' in list[i]) {
          if ('navigate' in list[i]) list[i].navigate(u.href);
          return list[i].focus();
        }
      }
      return self.clients.openWindow ? self.clients.openWindow(u.href) : null;
    }),
  );
});
