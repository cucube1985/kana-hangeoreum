'use strict';
// 오프라인 사용을 위한 서비스 워커. 앱 파일을 바꿔 배포할 때는 VERSION을 올려 주세요.
const VERSION = 'kana-v1';
const FONT_CACHE = 'kana-fonts';
importScripts('audio-map.js');
const CORE = ['./','index.html','style.css','app.js','kana-data.js','audio-map.js','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png','icons/maskable-512.png','icons/apple-touch-icon.png'];
const AUDIO = [...new Set(Object.values(AUDIO_FILES))];

self.addEventListener('install', event => {
  // 음성까지 모두 저장해야 설치가 끝나요. 하나라도 실패하면 다음 방문 때 다시 시도해요.
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll([...CORE, ...AUDIO])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== VERSION && key !== FONT_CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

// 음성은 저장본을 먼저 써요. Safari는 미디어에 Range 요청을 보내므로 206 응답을 만들어 줘요.
async function audioResponse(request){
  const hit = await caches.match(request.url);
  if(!hit) return fetch(request);
  const range = request.headers.get('range');
  if(!range) return hit;
  const buffer = await hit.arrayBuffer(), size = buffer.byteLength;
  const [, from, to] = /bytes=(\d*)-(\d*)/.exec(range) || [];
  const start = Number(from) || 0, end = to ? Math.min(Number(to), size - 1) : size - 1;
  return new Response(buffer.slice(start, end + 1), {status:206, headers:{'Content-Type':'audio/mpeg','Content-Range':`bytes ${start}-${end}/${size}`,'Content-Length':String(end - start + 1),'Accept-Ranges':'bytes'}});
}
// 앱 파일은 최신본을 먼저 받고, 오프라인이면 저장본을 써요.
async function networkFirst(request){
  try{
    const response = await fetch(request);
    if(response.ok){const copy = response.clone();caches.open(VERSION).then(cache => cache.put(request, copy));}
    return response;
  }catch(error){
    return (await caches.match(request, {ignoreSearch:true})) || (request.mode === 'navigate' ? caches.match('index.html') : Response.error());
  }
}
// 글꼴은 저장본을 바로 쓰고 뒤에서 새로 받아요.
async function fontResponse(request){
  const cache = await caches.open(FONT_CACHE), hit = await cache.match(request);
  const network = fetch(request).then(response => {if(response.ok || response.type === 'opaque')cache.put(request, response.clone());return response;}).catch(() => hit);
  return hit || network;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if(request.method !== 'GET') return;
  const url = new URL(request.url);
  if(url.origin === location.origin) event.respondWith(url.pathname.includes('/audio/') ? audioResponse(request) : networkFirst(request));
  else if(/(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) event.respondWith(fontResponse(request));
});
