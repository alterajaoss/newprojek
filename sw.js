/* iWallet service worker
   - Aplikasi bisa dibuka tanpa internet (file inti disimpan di cache).
   - Data pengguna TIDAK disimpan di sini (ada di localStorage + cloud Firestore),
     jadi memperbarui versi cache tidak akan menghapus data.
   - Permintaan login Google & Firestore TIDAK PERNAH di-cache (harus selalu langsung ke server).
   Naikkan CACHE_VERSION setiap kali kamu mengubah file aplikasi. */
const CACHE_VERSION = 'v5';
const CORE_CACHE = 'iwallet-core-' + CACHE_VERSION;
const RUNTIME_CACHE = 'iwallet-runtime-' + CACHE_VERSION;

const CDN_HOSTS = [
  'cdn.jsdelivr.net',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'www.gstatic.com'   // modul Firebase (hanya /firebasejs/*)
];

const CORE_FILES = [
  './',
  './index.html',
  './output.css',
  './manifest.webmanifest',
  './firebase-config.js',
  './cloud.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-192.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CORE_CACHE)
      .then((cache) => cache.addAll(CORE_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('iwallet-') && k !== CORE_CACHE && k !== RUNTIME_CACHE)
            .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Jalur milik Firebase Hosting (mis. /__/auth/handler untuk login Google): jangan dicegat.
  if (url.origin === self.location.origin && url.pathname.startsWith('/__/')) return;

  // Lalu lintas lintas-origin hanya di-cache untuk pustaka/font statis.
  // Google Auth, Firestore, dan API lain dibiarkan langsung ke jaringan.
  if (url.origin !== self.location.origin && !CDN_HOSTS.includes(url.hostname)) return;
  if (url.hostname === 'www.gstatic.com' && !url.pathname.startsWith('/firebasejs/')) return;

  // Halaman: tampilkan salinan cache SEKETIKA (cepat walau sinyal lemah),
  // lalu ambil versi terbaru di latar belakang untuk pembukaan berikutnya.
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then((cached) => {
        const network = fetch(req).then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CORE_CACHE).then((c) => c.put('./index.html', copy));
          }
          return res;
        }).catch(() => cached);
        event.waitUntil(network.catch(() => {}));
        return cached || network;
      })
    );
    return;
  }

  // File milik sendiri: cache dulu, perbarui di latar belakang.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req).then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CORE_CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }).catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // CDN (Chart.js, Google Fonts): simpan otomatis agar tetap jalan saat offline.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        if (res && (res.ok || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
