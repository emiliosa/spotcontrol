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
var version = '11560001';
var domainPath = '/spotcontrol/';
var cacheName = 'cacheResources' + version;
var filesToCache = [
    domainPath,
    domainPath + 'index.html',
    domainPath + 'mark.html',
    domainPath + 'scripts/app.js',
    domainPath + 'scripts/conf.js',
    domainPath + 'scripts/login.js',
    domainPath + 'assets/bootstrap/bootstrap.min.css',
    domainPath + 'assets/styles/theme/components-rounded.css',
    domainPath + 'assets/styles/main.css',
    domainPath + 'assets/styles/mobile_main.css',
    domainPath + 'assets/styles/gps-icon.css',
    domainPath + 'assets/images/maxtracker-lg.png',
    domainPath + 'assets/images/maxtracker-sm.png',
    domainPath + 'assets/images/ic_refresh_white_24px.svg',
    domainPath + 'assets/images/map-marker-alt.svg',
    domainPath + 'assets/images/sign-out-alt.svg',
    domainPath + 'assets/images/no-avatar.jpg',
    domainPath + 'assets/images/auto.png',
    domainPath + 'assets/scripts/plugins/jquery-1.11.0.min.js',
    domainPath + 'assets/scripts/plugins/jquery-ui/jquery-ui-1.10.3.custom.min.js',
    domainPath + 'assets/scripts/plugins/jquery-validation/js/jquery.validate.min.js',
    domainPath + 'assets/scripts/plugins/bootstrap/bootstrap.min.js',
    domainPath + 'assets/scripts/plugins/moment.js',
    domainPath + 'assets/scripts/plugins/hmac-sha256.js',
    domainPath + 'assets/styles/inline.css',
    domainPath + 'assets/styles/font-awesome.min.css',
    domainPath + 'assets/fonts/fontawesome-webfont.eot',
    domainPath + 'assets/fonts/fontawesome-webfont.ttf',
    domainPath + 'assets/fonts/fontawesome-webfont.woff',
    domainPath + 'assets/fonts/fontawesome-webfont.woff2',
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
    return self.clients.claim();
});

self.addEventListener('fetch', function(e) {
    console.log('[Service Worker] Fetch Registred');
    e.respondWith(caches.match(e.request)
        .then(function(response) {
            return response || fetch(e.request);
        })
        .catch(function() {
            //Si devuelve datos de la cache pero no encuentra conexión en la red
            console.log("Service Worker Offline");
        })
    );
});


// self.addEventListener('fetch', function(e) {
//     console.log('[Service Worker] Fetch Registred');
//     e.respondWith(fromNetwork(e.request, 10 * 1000)
//         .catch(function() {
//             return fromCache(e.request);
//         })
//     );
// });

function fromNetwork(request, timeout) {
    console.log('fetch from network');

    return new Promise(function(fulfill, reject) {
        var timeoutId = setTimeout(reject, timeout);
        fetch(request).then(function(response) {
            console.warn('fetch fromNetwork rejected');
            clearTimeout(timeoutId);
            fulfill(response);
        }, reject);
    });
}

function fromCache(request) {
    console.log('fetch from cache');
    return caches.open(cacheName).then(function(cache) {
        return cache.match(request)
            .then(function(matching) {
                return matching || Promise.reject('no-match');
            })
            .catch(function() {
                //Si devuelve datos de la cache pero no encuentra conexión en la red
                console.log("Service Worker Offline");
            });
    });
}
