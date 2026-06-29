/* ============================================================
   Danji Pass — Service Worker
   전략: Cache First (정적 자산) + Network First (데이터)
   ============================================================ */

const CACHE_NAME    = "danji-pass-v1";
const CACHE_URLS    = [
  "/",
  "/index.html",
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
      // CDN은 실패해도 설치 중단 안 함 (addAll 대신 개별 처리)
      return Promise.allSettled(
        CACHE_URLS.map((url) =>
          cache.add(url).catch((err) =>
            console.warn("[SW] 캐싱 실패 (무시):", url, err)
          )
        )
      );
    })
  );
  self.skipWaiting();
});

/* ── 활성화: 이전 버전 캐시 정리 ── */
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
    )
  );
  self.clients.claim();
});

/* ── Fetch: Cache First → Network Fallback ── */
self.addEventListener("fetch", (event) => {
  // POST 요청 및 chrome-extension 스킵
  if (event.request.method !== "GET") return;
  if (!event.request.url.startsWith("http")) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      // 캐시 미스 → 네트워크 요청 후 캐시 저장
      return fetch(event.request)
        .then((response) => {
          // 유효한 응답만 캐싱
          if (
            !response ||
            response.status !== 200 ||
            response.type === "opaque"
          ) {
            return response;
          }
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) =>
            cache.put(event.request, cloned)
          );
          return response;
        })
        .catch(() => {
          // 네트워크도 실패 → index.html 반환 (오프라인 fallback)
          if (event.request.destination === "document") {
            return caches.match("/index.html");
          }
        });
    })
  );
});
