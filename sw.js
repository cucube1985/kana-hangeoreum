'use strict';
/* 오프라인 사용을 위한 서비스 워커. 배포할 때 이 파일을 고칠 필요가 없어요.
   - 앱 파일: 온라인이면 매번 서버에 바뀌었는지 확인하고(바뀌지 않았으면 짧은 304 응답) 최신본을 저장해요.
   - 음성: audio-map.js와 비교해 새 파일만 받고, 쓰지 않는 파일은 지워요. 음성 파일은 번호를 바꾸지 않고
     새 문장은 새 번호로 추가한다는 규칙(generate-audio.py)에 기대요.
   이 파일의 동작을 바꾸면 브라우저가 내용 차이를 감지해 자동으로 새 서비스 워커를 설치해요. */
const CORE_CACHE = 'kana-core';
const AUDIO_CACHE = 'kana-audio';
const FONT_CACHE = 'kana-fonts';
const CACHES = [CORE_CACHE, AUDIO_CACHE, FONT_CACHE];
// 첫 설치 때 미리 저장할 앱 파일. 새 파일을 index.html에 연결하면 여기에도 추가하세요 (verify.js가 확인해요).
const CORE = ['./','index.html','style.css','app.js','kana-data.js','audio-map.js','stroke-data.js','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png','icons/maskable-512.png','icons/apple-touch-icon.png'];

async function cacheCore(){
  const cache = await caches.open(CORE_CACHE);
  await Promise.all(CORE.map(async path => {const response = await fetch(path, {cache:'no-cache'});if(!response.ok)throw new Error(path);await cache.put(path, response);}));
}
// 최신 audio-map.js에 맞춰 음성 저장소를 맞춰요.
async function syncAudio(){
  // 오프라인이면 저장해 둔 audio-map.js로 확인해요.
  const text = await fetch('audio-map.js', {cache:'no-cache'}).then(response => {if(!response.ok)throw new Error('audio-map');return response.text();})
    .catch(async () => {const stored = await (await caches.open(CORE_CACHE)).match('audio-map.js');if(!stored)throw new Error('offline');return stored.text();});
  const wanted = new Set(Object.values(JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1))).map(path => new URL(path, registration.scope).href));
  const cache = await caches.open(AUDIO_CACHE), stored = new Set((await cache.keys()).map(request => request.url));
  const missing = [];
  for(const url of wanted){
    if(stored.has(url))continue;
    // 예전 버전 저장소(kana-v1, kana-v2 …)에 있으면 옮겨 와서 다시 받지 않아요.
    const old = await caches.match(url);
    if(old)await cache.put(url, old);else missing.push(url);
  }
  await Promise.all([...stored].filter(url => !wanted.has(url)).map(url => cache.delete(url)));
  for(let i = 0; i < missing.length; i += 40) await cache.addAll(missing.slice(i, i + 40));
  return {total:wanted.size, added:missing.length};
}

self.addEventListener('install', event => {
  event.waitUntil(cacheCore().then(syncAudio).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  // 음성은 설치 때 이미 옮겼으니 예전 버전 저장소는 지워요.
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => !CACHES.includes(key)).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
// 페이지가 열릴 때마다 음성 목록을 맞춰요. 결과를 페이지에 알려 오프라인 준비 상태를 표시해요.
self.addEventListener('message', event => {
  if(event.data !== 'sync-audio')return;
  event.waitUntil(syncAudio().then(result => ({type:'audio-synced', ok:true, ...result}), () => ({type:'audio-synced', ok:false})).then(message => event.source?.postMessage(message)));
});

// Safari는 미디어에 Range 요청을 보내므로 저장본으로 206 응답을 만들어 줘요.
async function audioResponse(request){
  const cache = await caches.open(AUDIO_CACHE);
  let hit = await cache.match(request.url);
  if(!hit){
    const response = await fetch(request.url);
    if(!response.ok)return response;
    await cache.put(request.url, response.clone());hit = response;
  }
  const range = request.headers.get('range');
  if(!range) return hit;
  const buffer = await hit.arrayBuffer(), size = buffer.byteLength;
  const [, from, to] = /bytes=(\d*)-(\d*)/.exec(range) || [];
  const start = Number(from) || 0, end = to ? Math.min(Number(to), size - 1) : size - 1;
  return new Response(buffer.slice(start, end + 1), {status:206, headers:{'Content-Type':'audio/mpeg','Content-Range':`bytes ${start}-${end}/${size}`,'Content-Length':String(end - start + 1),'Accept-Ranges':'bytes'}});
}
// 앱 파일은 서버에 바뀌었는지 확인해 최신본을 쓰고, 오프라인이면 저장본을 써요.
async function networkFirst(request){
  try{
    const response = await fetch(request, {cache:'no-cache'});
    if(response.ok){const copy = response.clone();caches.open(CORE_CACHE).then(cache => cache.put(request, copy));}
    return response;
  }catch(error){
    const cache = await caches.open(CORE_CACHE);
    return (await cache.match(request, {ignoreSearch:true})) || (request.mode === 'navigate' ? cache.match('index.html') : Response.error());
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
