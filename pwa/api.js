// pwa/api.js — Pieza propia de la app instalable (CONTEXTO.md, sección 20). pwa/build.js la publica como pwa.js y la
// carga en <head> de cada página, antes que ui/Acceso. Da window.PWA:
//   · enviar(token, accion, datos): lo que en la web hace google.script.run.api(...). Va con fetch a doPost
//     (acceso/Api.gs) con un POST en text/plain (sin consulta previa de CORS) y responde lo mismo que api().
//   · panel(ruta): el HTML de un panel diferido, que viaja con la app (ui/JS_Paneles_Diferidos).
//   · param(nombre): un valor de la dirección, solo letras, números y guiones (la historia clínica).
//   · destino(url): convierte una dirección «?page=…» (relativa o la /exec de Google) en la página de la app.
// La dirección /exec no está en el código (la web de la app es pública): se escribe una vez por aparato en la
// pantalla «Conectar la app» o llega en un enlace …/#conectar=<dirección>, y se guarda en este aparato.
// pwa/build.js sustituye __PAGINAS__ y __VERSION__.
(function () {
  'use strict';

  var PAGINAS = __PAGINAS__;     // clave de PAGINAS_WEB (y 'hc') -> archivo de la app
  var VERSION = '__VERSION__';
  var CLAVE_CONEXION = 'fisioterapia|conexionPWA';   // { url } en localStorage (prefijo propio: el origen se comparte con Asistencia-CM)
  var URL_VALIDA = /^https:\/\/script\.google\.com\/(a\/[^/]+\/)?macros\/s\/[\w-]+\/exec$/;
  var NO_RESPONDE = 'Esa dirección no responde como la aplicación. Comprueba que es la de la implementación ' +
    '(acaba en /exec) y que tiene la última versión del código.';
  var SIN_RED = 'No hay conexión con el servidor. Comprueba internet y vuelve a intentarlo.';

  function leerConexion() {
    try {
      var c = JSON.parse(window.localStorage.getItem(CLAVE_CONEXION) || 'null');
      return c && URL_VALIDA.test(c.url || '') ? c : null;
    } catch (e) { return null; }
  }
  function guardarConexion(c) {
    try { window.localStorage.setItem(CLAVE_CONEXION, JSON.stringify(c)); return true; } catch (e) { return false; }
  }

  /** Una petición a doPost. Se resuelve con la respuesta de api(); se rechaza solo si falla la red. */
  function peticion(url, token, accion, datos) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token: token || '', accion: accion, datos: datos || [] }),
      redirect: 'follow',
      cache: 'no-store',
      credentials: 'omit'
    }).then(function (r) {
      return r.text().then(function (texto) {
        try {
          var datosR = JSON.parse(texto);
          if (datosR && typeof datosR.ok === 'boolean') return datosR;
        } catch (e) { /* no es JSON: más abajo */ }
        if (r.status >= 500) throw new Error(SIN_RED);   // fallo pasajero de Google
        return { ok: false, error: NO_RESPONDE, codigo: 'NO_RESPONDE' };
      });
    }, function () { throw new Error(SIN_RED); });
  }

  var sinFin = new Promise(function () {});

  function enviar(token, accion, datos) {
    if (enlace) { abrirConexion(enlace.url); return sinFin; }   // la pantalla de conexión recarga la app al terminar
    var c = leerConexion();
    if (!c) { abrirConexion(''); return sinFin; }
    return peticion(c.url, token, accion, datos).then(function (r) {
      if (r.codigo === 'NO_RESPONDE') { abrirConexion(c.url, r.error); return sinFin; }
      return r;
    });
  }

  // ---------- Páginas y enlaces ----------
  // Las páginas de la web se piden con ?page=… (core/WebApp.gs, doGet). Aquí cada una es un archivo; los enlaces
  // relativos (./?page=agenda) y los guardados en la hoja (…/exec?page=hc&id=…) se llevan a su archivo.

  function carpeta() { return location.pathname.replace(/[^/]*$/, ''); }

  function destino(url) {
    var u;
    try { u = new URL(url, location.href); } catch (e) { return null; }
    var deGoogle = u.origin === 'https://script.google.com' && /\/exec$/.test(u.pathname);
    var propia = u.origin === location.origin && u.pathname.replace(/[^/]*$/, '') === carpeta() &&
      /^(|index\.html)$/.test(u.pathname.slice(carpeta().length));
    if (!deGoogle && !propia) return null;
    var pagina = u.searchParams.get('page') || 'baseDatos';
    u.searchParams.delete('page');
    var resto = u.searchParams.toString();
    return (PAGINAS[pagina] || PAGINAS.baseDatos) + (resto ? '?' + resto : '') + u.hash;
  }

  // Clics en enlaces: después de que la página los atienda (si ella ya hizo preventDefault, no se toca).
  window.addEventListener('click', function (ev) {
    if (ev.defaultPrevented || ev.button !== 0) return;
    var a = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
    if (!a) return;
    var d = destino(a.href);
    if (!d) return;
    ev.preventDefault();
    if (a.getAttribute('target') === '_blank' || ev.ctrlKey || ev.metaKey || ev.shiftKey) window.open(d, '_blank', 'noopener');
    else location.href = d;
  });

  var abrirReal = window.open;
  window.open = function (url, nombre, opciones) {
    var d = url ? destino(String(url)) : null;
    return abrirReal.call(window, d || url, nombre, opciones);
  };

  // ---------- Paneles diferidos ----------
  var LISTA_PANELES = __PANELES__;
  function panel(ruta) {
    if (LISTA_PANELES.indexOf(ruta) === -1) return Promise.reject(new Error('Panel no disponible: ' + ruta));
    return fetch('paneles/' + ruta + '.html?v=' + VERSION).then(function (r) {
      if (!r.ok) throw new Error('No se pudo cargar el formulario (' + r.status + ').');
      return r.text();
    }, function () { throw new Error(SIN_RED); });
  }

  function param(nombre) {
    return String(new URLSearchParams(location.search).get(nombre) || '').replace(/[^\w-]/g, '');
  }

  // ---------- Pantalla «Conectar la app» ----------
  // Sale la primera vez en cada aparato y si la dirección guardada deja de responder como la aplicación.
  // Antes de guardar, prueba la dirección con la acción pública conectarPWA; al guardar, recarga la página.
  var pantalla = null, pedida = false;

  function abrirConexion(url, error) {
    if (pantalla) { if (error) mostrarError(error); return; }
    if (pedida) return;   // ya se está montando (la página aún carga)
    pedida = true;
    var montar = function () {
      pantalla = document.createElement('div');
      pantalla.className = 'pwa-conexion';
      pantalla.setAttribute('role', 'dialog');
      pantalla.setAttribute('aria-modal', 'true');
      pantalla.setAttribute('aria-labelledby', 'pwaTitulo');
      pantalla.innerHTML =
        '<form class="pwa-conexion-caja" id="pwaForm">' +
          '<img class="pwa-conexion-icono" src="iconos/icono-192.png" alt="" width="64" height="64">' +
          '<h1 id="pwaTitulo">Conectar la app</h1>' +
          '<p>Pega la dirección de la aplicación (la de la implementación, acaba en <b>/exec</b>). ' +
            'Solo hay que hacerlo una vez en este aparato.</p>' +
          '<div class="md-campo">' +
            '<input class="md-campo__control" id="pwaUrl" type="url" placeholder=" " autocomplete="off" spellcheck="false">' +
            '<label class="md-campo__etiqueta" for="pwaUrl">Dirección de la aplicación</label>' +
          '</div>' +
          '<p class="pwa-conexion-error" id="pwaError" role="alert"></p>' +
          '<button class="md-btn md-btn--tonal" type="submit" id="pwaConectar">Conectar</button>' +
        '</form>';
      document.body.appendChild(pantalla);
      var campo = pantalla.querySelector('#pwaUrl');
      campo.value = url || '';
      pantalla.addEventListener('keydown', function (ev) { ev.stopPropagation(); });   // que no salten atajos de la página
      pantalla.querySelector('#pwaForm').addEventListener('submit', function (ev) { ev.preventDefault(); conectar(); });
      // Después de que el login (ui/Acceso) ponga su foco: esta pantalla va encima.
      setTimeout(function () {
        if (error) mostrarError(error);
        else if (url) conectar();
        else campo.focus();
      }, 0);
    };
    if (document.body) montar(); else document.addEventListener('DOMContentLoaded', montar);
  }

  function mostrarError(texto) {
    pantalla.querySelector('#pwaError').textContent = texto;
    pantalla.querySelector('#pwaUrl').focus();
  }

  function conectar() {
    var boton = pantalla.querySelector('#pwaConectar');
    if (boton.disabled) return;
    var url = pantalla.querySelector('#pwaUrl').value.trim();
    pantalla.querySelector('#pwaError').textContent = '';
    if (!URL_VALIDA.test(url)) { enlace = null; return mostrarError('Pega la dirección completa: empieza por https://script.google.com/ y acaba en /exec.'); }
    boton.disabled = true;
    boton.textContent = 'Comprobando…';
    var soltar = function () { boton.disabled = false; boton.textContent = 'Conectar'; enlace = null; };
    peticion(url, '', 'conectarPWA', []).then(function (r) {
      if (r.ok || r.codigo === 'CERRADA') {   // cerrada también es la aplicación: ui/Acceso enseñará el aviso
        if (!guardarConexion({ url: url })) { soltar(); return mostrarError('Este navegador no deja guardar datos. Sal del modo incógnito o revisa los permisos del sitio.'); }
        location.reload();
        return;
      }
      soltar();
      mostrarError(r.codigo === 'ACCION' ? NO_RESPONDE : (r.error || NO_RESPONDE));
    }, function (e) { soltar(); mostrarError(e.message); });
  }

  // Enlace de conexión: …/#conectar=<dirección /exec>. Lo que va detrás de «#» no llega a ningún servidor.
  // Se lee, se quita de la dirección y la pantalla de conexión se rellena y se comprueba sola.
  var enlace = null;
  (function leerEnlace() {
    var h = String(location.hash || '').replace(/^#/, '');
    if (h.indexOf('conectar=') < 0) return;
    enlace = { url: (new URLSearchParams(h).get('conectar') || '').trim() };
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* se ignora */ }
    if (!leerConexion() || leerConexion().url !== enlace.url) abrirConexion(enlace.url);
    else enlace = null;
  })();
  // Sin dirección guardada, la pantalla de conexión sale ya (encima del login).
  if (!enlace && !leerConexion()) abrirConexion('');

  window.PWA = { enviar: enviar, panel: panel, param: param, destino: destino, version: VERSION };

  // ---------- Service worker ----------
  // Guarda solo los archivos de la app para que arranque rápido. Nunca guarda datos ni llamadas al servidor.
  if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* sin service worker: la app va igual */ });
    });
  }
})();
