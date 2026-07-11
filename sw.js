/* ============================================================
   Danji Pass — Service Worker
   전략:
   - HTML 문서(index.html): Network First → 항상 최신 버전 우선 시도
   - 정적 자산(아이콘, CDN 폰트/라이브러리): Cache First → 빠른 로딩
   ============================================================ */

const CACHE_NAME    = "danji-pass-v5";
const CACHE_URLS    = [
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  /* 외부 CDN — 오프라인 대비 캐싱 */
  "https://cdn.tailwindcss.com?plugins=forms,container-queries",
  "https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js",
  "https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;700;800&family=JetBrains+Mono:wght@600&display=swap",
  "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
];

/* ── 설치: 정적 자산 사전 캐싱 ── */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        CACHE_URLS.map((url) =>
          cache.add(url).catch((err) =>
            console.warn("[SW] 캐싱 실패 (무시):", url, err)
          )
        )
      );
    })
  );
  self.skipWaiting(); // 새 SW를 즉시 활성화 대기 상태로
});

/* ── 활성화: 이전 버전 캐시 정리 + 즉시 모든 탭 제어 ── */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => {
            console.log("[SW] 구버전 캐시 삭제:", key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim()) // 새 SW가 즉시 모든 열린 탭을 제어
  );
});

/* ── Fetch 전략 분기 ── */
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (!event.request.url.startsWith("http")) return;

  const isDocument =
    event.request.mode === "navigate" ||
    event.request.destination === "document" ||
    event.request.url.endsWith("/index.html") ||
    event.request.url.endsWith("/");

  if (isDocument) {
    // HTML 문서: Network First — 항상 최신 버전을 우선 시도
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match("/index.html")))
    );
    return;
  }

  // 정적 자산: Cache First → Network Fallback
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type === "opaque") {
            return response;
          }
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
          return response;
        })
        .catch(() => {});
    })
  );
});
