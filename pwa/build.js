// pwa/build.js — Monta la app instalable (PWA; CONTEXTO.md, sección 20) con el mismo código que la web de Apps Script.
// No hay una segunda copia de las pantallas: ejecuta en Node core/Config.gs, core/Patologias.gs, core/Utils.gs,
// core/Nombres_Oficiales.gs y core/WebApp.gs (sin cambiarlos) y evalúa las mismas plantillas que doGet, con sus include_,
// incluirPanel_, incluirAcceso_, incluirPestanas_, incluirEstados_, incluirPatologias_ e incluirNombres_. Igual que Apps Script, solo evalúa las <? ?> de las
// plantillas, nunca las de lo incluido con include_() (trampa 2 de la sección 7).
//   · una página por entrada de PAGINAS_WEB, más hc.html (historia/HC_Vista) e index.html, que hace de doGet: lleva
//     ./?page=… a su archivo; la dirección de la app (baseUrl) es «./».
//   · los paneles de PANELES_DIFERIDOS_ como archivos (paneles/…), que pwa.js entrega sin pasar por el servidor.
//   · pwa.js (pwa/api.js), pwa.css, sw.js, manifest.json e iconos (pwa/iconos.js).
//
// Uso (desde la raíz del proyecto; sin dependencias):
//   node pwa/build.js          → pwa/dist/  (lo publica solo .github/workflows/pwa.yml en GitHub Pages)
//   node pwa/build.js --sim    → sim/pwa/   (para probar sin Google con sim/pwa-mock.js; ver sim/LEEME.md)
'use strict';
const fs = require('fs'), p = require('path'), vm = require('vm'), crypto = require('crypto');
const iconos = require('./iconos');

const PWA = __dirname, RAIZ = p.join(PWA, '..');
const conSim = process.argv.indexOf('--sim') >= 0;
const SALIDA = conSim ? p.join(RAIZ, 'sim', 'pwa') : p.join(PWA, 'dist');
const BASE = './';   // lo que en la web es ScriptApp.getService().getUrl()

const leer = function (ruta) { return fs.readFileSync(p.join(RAIZ, ruta), 'utf8'); };
const leerHtml = function (nombre) {
  const ruta = nombre + '.html';
  if (!fs.existsSync(p.join(RAIZ, ruta))) throw new Error('No existe el archivo incluido: ' + ruta);
  return leer(ruta);
};
function fallo(texto) { throw new Error(texto); }

// ---------- Apps Script imitado: lo justo para las plantillas ----------
const ctx = vm.createContext({ console: console });
ctx.HtmlService = {
  createHtmlOutputFromFile: function (n) { return { getContent: function () { return leerHtml(n); } }; },
  createTemplateFromFile: function (n) { return plantilla(n); }
};
ctx.ScriptApp = { getService: function () { return { getUrl: function () { return BASE; } }; } };
ctx.__esc = function (v) {
  return String(v === null || v === undefined ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
};
['core/Config.gs', 'core/Patologias.gs', 'core/Utils.gs', 'core/Nombres_Oficiales.gs', 'core/WebApp.gs'].forEach(function (f) {
  vm.runInContext(leer(f), ctx, { filename: f });
});
const enCtx = function (codigo) { return vm.runInContext(codigo, ctx); };

/** Convierte una plantilla de Apps Script en una función (como hace HtmlService.createTemplate). */
function compilar(texto, nombre) {
  let codigo = 'var __o = "";\n', ultimo = 0, m;
  const re = /<\?(!=|=)?([\s\S]*?)\?>/g;
  while ((m = re.exec(texto))) {
    codigo += '__o += ' + JSON.stringify(texto.slice(ultimo, m.index)) + ';\n';
    const dentro = m[2].trim().replace(/;+\s*$/, '');
    if (m[1] === '!=') codigo += '__o += (' + dentro + ');\n';
    else if (m[1] === '=') codigo += '__o += __esc(' + dentro + ');\n';
    else codigo += m[2] + '\n';
    ultimo = re.lastIndex;
  }
  codigo += '__o += ' + JSON.stringify(texto.slice(ultimo)) + ';\nreturn __o;';
  try {
    return enCtx('(function (__v) { with (__v) {\n' + codigo + '\n} })');
  } catch (e) { fallo('No se pudo leer la plantilla ' + nombre + ': ' + e.message); }
}

function plantilla(nombre) {
  const t = {};
  Object.defineProperty(t, 'evaluate', {
    enumerable: false,
    value: function () {
      const html = compilar(leerHtml(nombre), nombre)(t);
      const salida = { getContent: function () { return html; } };
      salida.setTitle = salida.addMetaTag = function () { return salida; };
      return salida;
    }
  });
  return t;
}

// ---------- Páginas ----------
const PAGINAS_WEB = enCtx('PAGINAS_WEB');
const PANELES = enCtx('PANELES_DIFERIDOS_').slice();
const ARCHIVO_DE = {   // clave de ?page= -> archivo de la app (la HC aparte, como en doGet)
  baseDatos: 'usuarios.html', agenda: 'agenda.html', valoraciones: 'valoraciones.html',
  dashboard: 'estadisticas.html', configuracion: 'configuracion.html', guiaVisual: 'guia-visual.html', hc: 'hc.html'
};
Object.keys(PAGINAS_WEB).forEach(function (k) {
  if (!ARCHIVO_DE[k]) fallo('Falta en pwa/build.js (ARCHIVO_DE) el archivo de la página nueva «' + k + '» de PAGINAS_WEB.');
});

const paginas = {};   // archivo -> html
Object.keys(PAGINAS_WEB).forEach(function (k) {
  const t = plantilla(PAGINAS_WEB[k].archivo);
  t.baseUrl = BASE;
  t.pagina = k;   // como doGet: usuarios.html y agenda.html son la misma página, cada una abre con su sección
  paginas[ARCHIVO_DE[k]] = t.evaluate().getContent();
});

// La historia clínica: lo que en la web pone servirFichaHCWeb_ (historia/HC_Web.gs) se lee aquí de la dirección.
(function () {
  const t = plantilla('historia/HC_Vista');
  t.baseUrl = BASE;
  t.idHC = '__PWA_ID_HC__';
  t.idPaciente = '__PWA_ID_PACIENTE__';
  t.imprimir = '__PWA_IMPRIMIR__';
  let html = t.evaluate().getContent();
  [['"__PWA_ID_HC__"', "PWA.param('id')"], ['"__PWA_ID_PACIENTE__"', "PWA.param('idPaciente')"],
    ['"__PWA_IMPRIMIR__"', "(PWA.param('imprimir') === '1')"]].forEach(function (r) {
    if (html.split(r[0]).length !== 2) fallo('historia/HC_Vista: se esperaba un solo ' + r[0] + '. ¿Ha cambiado servirFichaHCWeb_?');
    html = html.split(r[0]).join(r[1]);
  });
  paginas['hc.html'] = html;
})();

// Enlaces ./?page=X (pestañas, «Ir a Usuarios»): directamente a su archivo.
Object.keys(paginas).forEach(function (f) {
  paginas[f] = paginas[f].replace(/href="\.\/\?page=(\w+)"/g, function (todo, k) { return 'href="' + (ARCHIVO_DE[k] || ARCHIVO_DE.baseDatos) + '"'; });
});

// ---------- Cabecera propia de la app en cada página ----------
const COLOR = iconos.color;
function cabeza(html, nombre, soloEnlaces) {
  const extra = [];
  if (!/<meta charset/i.test(html)) extra.push('<meta charset="utf-8">');
  if (!/name="viewport"/i.test(html)) extra.push('<meta name="viewport" content="width=device-width, initial-scale=1">');
  extra.push('<meta name="theme-color" content="' + COLOR + '">',
    '<link rel="manifest" href="manifest.json">',
    '<link rel="icon" href="iconos/icono.svg" type="image/svg+xml">',
    '<link rel="apple-touch-icon" href="iconos/icono-192.png">');
  if (!soloEnlaces) extra.push('<link rel="stylesheet" href="pwa.css?v=__V__">',
    '<script src="' + (conSim ? '../pwa-mock.js"></script>\n<script src="' : '') + 'pwa.js?v=__V__"></script>');
  const partes = html.split(/<head>/i);
  if (partes.length !== 2) fallo(nombre + ': se esperaba exactamente un <head>.');
  return partes[0] + '<head>\n' + extra.join('\n') + '\n' + partes[1];
}
Object.keys(paginas).forEach(function (f) { paginas[f] = cabeza(paginas[f], f); });

// index.html: hace de doGet. Lleva ./?page=… (y ./ a secas) al archivo de esa página, conservando lo demás (también el
// enlace #conectar=…, por eso aquí no se carga pwa.js, que lo leería y lo quitaría antes de saltar).
paginas['index.html'] = cabeza('<!DOCTYPE html>\n<html lang="es">\n<head>\n<title>Fisioterapia Orihuela</title>\n</head>\n' +
  '<body>\n<script>\n(function () {\n  var A = ' + JSON.stringify(ARCHIVO_DE) + ';\n' +
  "  var q = new URLSearchParams(location.search), k = q.get('page') || 'baseDatos';\n" +
  "  q.delete('page');\n  var resto = q.toString();\n" +
  "  location.replace((A[k] || A.baseDatos) + (resto ? '?' + resto : '') + location.hash);\n})();\n</script>\n</body>\n</html>\n", 'index.html', true);

// ---------- Comprobaciones ----------
const errores = [];
Object.keys(paginas).forEach(function (f) {
  const html = paginas[f];
  // ids repetidos en el HTML de la página (fuera de <script> y <template>)
  const sinCodigo = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<template[\s\S]*?<\/template>/gi, '');
  const vistos = {};
  (sinCodigo.match(/\sid="[^"]+"/g) || []).forEach(function (a) {
    const id = a.slice(5, -1);
    if (vistos[id]) errores.push(f + ': id repetido «' + id + '»');
    vistos[id] = true;
  });
  if (/['"]asistencia\|/.test(html)) errores.push(f + ': usa una clave de almacenamiento de Asistencia-CM (asistencia|…)');
  if (f !== 'index.html' && html.indexOf('acceso-cierre') < 0) errores.push(f + ': falta el portero ui/Acceso');
});
if (errores.length) fallo('El montaje no ha pasado las comprobaciones:\n  ' + errores.join('\n  '));

// ---------- Archivos y versión ----------
const archivos = {};   // ruta de salida -> contenido
Object.keys(paginas).forEach(function (f) { archivos[f] = paginas[f]; });
PANELES.forEach(function (r) { archivos['paneles/' + r + '.html'] = leerHtml(r); });
archivos['pwa.js'] = leer('pwa/api.js')
  .split('__PAGINAS__').join(JSON.stringify(ARCHIVO_DE))
  .split('__PANELES__').join(JSON.stringify(PANELES));
archivos['pwa.css'] = leer('pwa/pwa.css');
archivos['manifest.json'] = leer('pwa/manifest.json');
const ic = iconos();
Object.keys(ic).forEach(function (n) { archivos['iconos/' + n] = ic[n]; });

const huella = crypto.createHash('sha1');
Object.keys(archivos).sort().forEach(function (k) { huella.update(k); huella.update(archivos[k]); });
const version = huella.digest('hex').slice(0, 10);
Object.keys(archivos).forEach(function (k) {
  if (typeof archivos[k] === 'string') archivos[k] = archivos[k].split('__V__').join(version).split('__VERSION__').join(version);
});
if (archivos['pwa.js'].indexOf("'" + version + "'") < 0) fallo('Falta __VERSION__ en pwa/api.js.');

// Lo que guarda el service worker: las páginas (sin parámetros) y lo demás tal como lo piden las páginas (?v=).
const guardar = ['./'].concat(Object.keys(paginas)).concat(['manifest.json', 'pwa.js?v=' + version, 'pwa.css?v=' + version])
  .concat(Object.keys(ic).map(function (n) { return 'iconos/' + n; }))
  .concat(PANELES.map(function (r) { return 'paneles/' + r + '.html?v=' + version; }));
archivos['sw.js'] = leer('pwa/sw.js').split('__VERSION__').join(version).split('__ARCHIVOS__').join(JSON.stringify(guardar, null, 2));

// ---------- Escribir ----------
fs.rmSync(SALIDA, { recursive: true, force: true });
Object.keys(archivos).forEach(function (k) {
  const destino = p.join(SALIDA, k);
  fs.mkdirSync(p.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, archivos[k]);
});
fs.writeFileSync(p.join(SALIDA, '.nojekyll'), '');   // GitHub Pages: servir tal cual

console.log(p.relative(RAIZ, SALIDA).split(p.sep).join('/') + '/ listo · versión ' + version + ' · ' +
  Object.keys(paginas).length + ' páginas, ' + PANELES.length + ' paneles');
