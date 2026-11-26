// Keep private responses out of Cache Storage. Only top-level offline navigation
// receives a fallback. The browser handles all API requests normally.
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate" || event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !["/", "/review"].includes(url.pathname)) return;
  event.respondWith(
    fetch(event.request).catch(
      () =>
        new Response(
          '<!doctype html><html dir="rtl" lang="fa"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SHADVERSE JARVIS</title><main><h1>اتصال برقرار نیست</h1><p>پس از اتصال به شبکه، صفحه را دوباره باز کنید.</p><p lang="en" dir="ltr">You are offline. Reopen JARVIS when connected.</p></main></html>',
          { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
        ),
    ),
  );
});
