// pwa/sw.js — Service worker de la app instalable (CONTEXTO.md, sección 20).
// Solo guarda los archivos de la propia app (páginas, pwa.js, pwa.css, paneles, manifiesto e iconos) para que arranque
// rápido. NUNCA guarda datos: las llamadas al servidor (POST a script.google.com) y todo lo de otros sitios (fuentes de
// Google) no pasan por aquí. No hay modo sin conexión: sin red, la página carga pero las llamadas fallan con un aviso.
// Las páginas se piden primero a la red, así una versión nueva llega en cuanto hay conexión.
// pwa/build.js pone __VERSION__ (huella de los archivos) y __ARCHIVOS__: al publicar otra versión se tiran los de antes.
'use strict';

const CACHE = 'fisioterapia-__VERSION__';
const ARCHIVOS = __ARCHIVOS__;

self.addEventListener('install', function (ev) {
  ev.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ARCHIVOS); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (ev) {
  ev.waitUntil(caches.keys().then(function (claves) {
    return Promise.all(claves.filter(function (k) { return k.indexOf('fisioterapia-') === 0 && k !== CACHE; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (ev) {
  const pet = ev.request;
  const url = new URL(pet.url);
  if (pet.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.indexOf(self.registration.scope.replace(self.location.origin, '')) !== 0) return;   // solo esta app
  if (pet.mode === 'navigate') {
    // Primero la red; sin red, la página guardada (sin los parámetros de la dirección)
    ev.respondWith(fetch(pet).catch(function () {
      return caches.match(pet, { ignoreSearch: true });
    }));
    return;
  }
  ev.respondWith(caches.match(pet).then(function (r) { return r || fetch(pet); }));
});
