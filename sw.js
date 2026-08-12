// مرساة — Service Worker v91-r11 (توازن بصري: مربّع الإكمال أبرز من إزالة أهم اليوم)
//
// مهم عند النشر: ارفع رقم النسخة في CACHE_NAME عند أي تعديل على
// index.html أو app.js أو manifest.webmanifest أو الأيقونات والخطوط.
// هذا هو المُشغّل الوحيد للتحديث؛
// بدونه يبقى المتصفح يخدم النسخة المخزّنة.
const CACHE_PREFIX = 'mersah-static-';
const CACHE_NAME = `${CACHE_PREFIX}v91-r11`;
const SHELL_DOCUMENT = './index.html';
const CORE_SHELL = [
  './',
  SHELL_DOCUMENT,
  './app.js',
  './manifest.webmanifest'
];
const OPTIONAL_SHELL = [
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-1024.png',
  './fonts/plex-arabic-arabic-400.woff2',
  './fonts/plex-arabic-arabic-600.woff2',
  './fonts/plex-arabic-latin-400.woff2',
  './fonts/plex-arabic-latin-600.woff2'
];
const APP_SHELL = [...CORE_SHELL, ...OPTIONAL_SHELL];
const APP_SHELL_URLS = new Set(APP_SHELL.map(path => new URL(path, self.location).href));

const OFFLINE_FALLBACK = `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8">
<title>مرساة</title><body style="font-family:-apple-system,sans-serif;padding:2rem;line-height:1.7">
<h1>مرساة غير متاحة</h1><p>لم يكتمل التخزين المحلي بعد. أعد تحميل الصفحة مرة واحدة وأنت متصل بالإنترنت.</p>`;

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async cache => {
        await cache.addAll(CORE_SHELL);
        await Promise.allSettled(OPTIONAL_SHELL.map(path => cache.add(path)));
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // التنقّل: الكاش أولًا بلا أي انتظار للشبكة.
  // الفتح فوري على أي شبكة، وهو شرط مقياس زمن الالتقاط.
  // التحديث يأتي عبر تثبيت service worker بنسخة جديدة لا عبر هذا المسار،
  // ما يمنع اختلاف النسخ بين index.html و app.js.
  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(SHELL_DOCUMENT);
      if (cached) return cached;
      try {
        const response = await fetch(event.request);
        if (response.ok) await cache.put(SHELL_DOCUMENT, response.clone());
        return response;
      } catch (error) {
        return new Response(OFFLINE_FALLBACK, {
          status: 503,
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      }
    })());
    return;
  }

  if (!APP_SHELL_URLS.has(url.href)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(event.request);
    if (cached) return cached;
    const response = await fetch(event.request);
    if (response && response.ok && response.type !== 'opaque') {
      await cache.put(event.request, response.clone());
    }
    return response;
  })());
});
