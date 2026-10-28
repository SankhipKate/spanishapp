const CACHE='slova-static-v26-cloud';
const ASSETS=['./','./index.html','./style.css?v=24','./app.js?v=25','./engine.mjs?v=25','./cloud-api.mjs?v=25','./manifest.webmanifest','./icon.svg','./apple-touch-icon.png','./config.js'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('slova-static-')&&k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim()});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(u.origin!==self.location.origin||e.request.method!=='GET')return;
 e.respondWith(fetch(e.request,{cache:'no-store'}).then(r=>{if(r.ok){const copy=r.clone();e.waitUntil(caches.open(CACHE).then(c=>c.put(e.request,copy)))}return r}).catch(async()=>await caches.match(e.request)||Response.error()));
});
