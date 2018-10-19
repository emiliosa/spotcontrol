// Copyright 2016 Google Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//var dataCacheName = 'cacheData';
var cacheName = 'cacheResources';
var filesToCache = [
    '/',
    'index.html',
    'mark.html',
    'scripts/app.js',
    'scripts/conf.js',
    'assets/bootstrap/bootstrap.min.css?v=11540001',
    'assets/styles/theme/components-rounded.css?v=11540001',
    'assets/styles/mobile_main.css?v=11540001',
    'assets/styles/gps-icon.css?v=11540001',
    'assets/images/maxtracker-lg.png',
    'assets/images/maxtracker-sm.png',
    'assets/images/ic_refresh_white_24px.svg',
    'assets/images/map-marker-alt.svg',
    'assets/images/sign-out-alt.svg',
    'assets/images/no-avatar.jpg',
    'assets/images/auto.png',
    'assets/scripts/plugins/jquery-1.11.0.min.js?v=11540001',
    'assets/scripts/plugins/jquery-ui/jquery-ui-1.10.3.custom.min.js?v=11540001',
    'assets/scripts/plugins/bootstrap/bootstrap.min.js?v=11540001',
    'assets/scripts/plugins/moment.js',
    'assets/styles/inline.css',
    'assets/styles/font-awesome.min.css',
    'assets/fonts/fontawesome-webfont.eot',
    'assets/fonts/fontawesome-webfont.ttf',
    'assets/fonts/fontawesome-webfont.woff',
    'assets/fonts/fontawesome-webfont.woff2',
    'assets/scripts/plugins/jquery-1.11.0.min.js?v=11540001',
    'assets/scripts/plugins/jquery-ui/jquery-ui-1.10.3.custom.min.js?v=11540001',
    'assets/scripts/plugins/bootstrap/bootstrap.min.js?v=11540001',
    'assets/scripts/plugins/hmac-sha256.js',
];

self.addEventListener('install', function(e) {
    console.log('[ServiceWorker] Install');
    e.waitUntil(caches.open(cacheName).then(function(cache) {
        console.log('[ServiceWorker] Caching app shell');
        return cache.addAll(filesToCache);
    }));
});

self.addEventListener('activate', function(e) {
    console.log('[ServiceWorker] Activate');
    e.waitUntil(caches.keys().then(function(keyList) {
        return Promise.all(keyList.map(function(key) {
            if (key !== cacheName) {
                console.log('[ServiceWorker] Removing old cache', key);
                return caches.delete(key);
            }
        }));
    }));

});

self.addEventListener('fetch', function(e) {
    console.log('[Service Worker] Fetch Registred');
    e.respondWith(caches.match(e.request).then(function(response) {
        return response || fetch(e.request);
    })
    .catch(function() {
        //Si devuelve datos de la cache pero no encuentra conexión en la red
        console.log("Service Worker Offline");
    })

    );
});
