// The editor options lab's dropped connection: a service worker that fails the next request for a
// dialog's code (`chunks/<name>-dialog-<hash>.js`) once the page arms it, as a dropped connection
// would, and passes every other request through untouched.

let failNext = false;

self.addEventListener('install', () => {
  void self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  if (event.data !== 'fail-next-dialog') return;
  failNext = true;
  event.source?.postMessage('armed');
});

self.addEventListener('fetch', (event) => {
  if (
    !failNext ||
    !/\/chunks\/[a-z-]+-dialog-[A-Z0-9]+\.js$/.test(new URL(event.request.url).pathname)
  )
    return;
  failNext = false;
  event.respondWith(Response.error());
});
