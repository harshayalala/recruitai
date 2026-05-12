/* ============================================================
   RecruitAI — Service Worker (sw.js)
   Caches frontend assets for offline use
   ============================================================ */

const CACHE_NAME = "recruitai-v1";
const CACHE_VERSION = "1.0.0";

// Assets to cache on install
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/styles.css",
  "/script.js",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;1,9..40,300&display=swap"
];

/* ── Install: cache all static assets ── */
self.addEventListener("install", event => {
  console.log("[SW] Installing RecruitAI Service Worker v" + CACHE_VERSION);
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log("[SW] Caching static assets");
      return cache.addAll(STATIC_ASSETS.map(url => new Request(url, { cache: "reload" })))
        .catch(err => console.warn("[SW] Some assets failed to cache:", err));
    })
  );
  self.skipWaiting();
});

/* ── Activate: clean old caches ── */
self.addEventListener("activate", event => {
  console.log("[SW] Activating new service worker");
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log("[SW] Deleting old cache:", key);
            return caches.delete(key);
          })
      )
    )
  );
  self.clients.claim();
});

/* ── Fetch: cache-first for static, network-first for API ── */
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== "GET") return;

  // API calls — always network, no cache
  if (url.hostname.includes("onrender.com") || url.pathname.includes("/api/")) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(
          JSON.stringify({ error: "You are offline. Please connect to the internet to analyze resumes." }),
          { status: 503, headers: { "Content-Type": "application/json" } }
        )
      )
    );
    return;
  }

  // Google Fonts — cache-first
  if (url.hostname.includes("fonts.googleapis.com") || url.hostname.includes("fonts.gstatic.com")) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        });
      })
    );
    return;
  }

  // Static assets — cache-first, fallback to network
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200 || response.type === "opaque") return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      }).catch(() => {
        // Offline fallback for HTML pages
        if (event.request.destination === "document") {
          return caches.match("/index.html");
        }
      });
    })
  );
});

/* ── Background sync placeholder ── */
self.addEventListener("sync", event => {
  console.log("[SW] Background sync:", event.tag);
});

/* ── Push notification placeholder ── */
self.addEventListener("push", event => {
  const data = event.data ? event.data.json() : { title: "RecruitAI", body: "Analysis complete!" };
  self.registration.showNotification(data.title, {
    body: data.body,
    icon: "/icon-192.png",
    badge: "/icon-192.png"
  });
});
