// ============================================================================
// sw.js — Service worker da Verdelago Operações (PWA instalável)
// ----------------------------------------------------------------------------
// Estratégia "rede primeiro" para o código da app: com internet busca sempre
// a versão mais recente; sem internet, recorre à cópia em cache. Nunca guarda
// em cache os pedidos ao Microsoft Graph / login nem o atualizacoes.json.
// ============================================================================

const CACHE = "verdelago-ops-v2";

self.addEventListener("install", e => {
  self.skipWaiting();           // ativa logo a versão nova
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const nomes = await caches.keys();
    await Promise.all(nomes.filter(n => n !== CACHE).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", e => {
  const req = e.request;
  const url = new URL(req.url);

  // só tratamos pedidos GET do próprio site
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  // ficheiro de atualizações: sempre fresco, nunca da cache
  if (url.pathname.endsWith("atualizacoes.json")) {
    e.respondWith(fetch(req).catch(() => caches.match(req)));
    return;
  }

  // resto do site (html, js, css, ícones): rede primeiro, cache como recurso
  e.respondWith((async () => {
    try {
      const resp = await fetch(req);
      const cache = await caches.open(CACHE);
      cache.put(req, resp.clone());        // guarda a versão fresca
      return resp;
    } catch (err) {
      const cached = await caches.match(req);
      if (cached) return cached;
      // fallback para a página inicial em navegações offline
      if (req.mode === "navigate") return caches.match("index.html");
      throw err;
    }
  })());
});
