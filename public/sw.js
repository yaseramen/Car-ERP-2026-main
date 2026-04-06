const CACHE_NAME = "alameen-pwa-v6";
const API_CACHE_NAME = "alameen-api-v6";

// لا نُخزّن بيانات مالية/معاملات في الـ cache لتجنب عرض بيانات قديمة
const API_CACHE_PATHS = [
  '/api/admin/workshop/orders',
  '/api/admin/inventory/items',
  '/api/admin/customers',
  '/api/admin/suppliers',
  '/api/admin/reports/inventory',
  '/api/admin/reports/workshop',
  '/api/admin/reports/suppliers',
  '/api/admin/payment-methods',
  '/api/admin/digital-fee',
  '/api/admin/inventory/categories'
];
// المستثناة من الـ cache: invoices, treasuries, expenses-income, summary, sales, profit

function shouldCacheApi(url) {
  return API_CACHE_PATHS.some(p => url.includes(p));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME && k !== API_CACHE_NAME).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = event.request.url;
  const isApi = url.includes("/api/");

  if (event.request.method !== "GET") return;

  if (isApi && shouldCacheApi(url)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok && response.status === 200) {
            const clone = response.clone();
            caches.open(API_CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() =>
          caches.match(event.request).then((cached) => cached || new Response(JSON.stringify({ error: "offline" }), {
            status: 503,
            headers: { "Content-Type": "application/json" }
          }))
        )
    );
    return;
  }

  if (isApi) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && !url.includes("/api/")) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() =>
        caches.match(event.request).then((r) => r || caches.match("/"))
      )
  );
});
