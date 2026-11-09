// pwa/iconos.js — Iconos de la app instalable (CONTEXTO.md, sección 20), sin dependencias.
// Un solo dibujo (una cruz sanitaria redondeada en blanco cruzada por una línea de latido, sobre el gris
// --md-on-surface-med claro de ui/CSS_Global; elegido por el dueño el 9-nov-2026) del que salen el SVG y los PNG
// (192, 512 y «maskable» para Android). BARRA es el color de la barra de la ventana (--md-bg claro).
// Rasteriza a mano y guarda en PNG con zlib de Node, como pwa/iconos.js de Asistencia-CM. Lo usa pwa/build.js.
// Para cambiar el dibujo basta con tocar FONDO, TRAZOS, PUNTOS y HUECOS: el SVG y los PNG salen de ahí.
// pwa/manifest.json repite BARRA en theme_color: si cambia uno, cambia el otro.
'use strict';
const zlib = require('zlib');

// Coordenadas en una caja de 96 × 96
const FONDO = [0x5f, 0x63, 0x68];   // #5f6368, gris del icono
const BARRA = [0xf8, 0xf9, 0xfa];   // #f8f9fa, barra de la ventana (Windows pone la letra en oscuro)
const RADIO_ESQUINA = 22;
const TRAZOS = [                    // en blanco, extremos redondos: [x1, y1, x2, y2, medio grosor]
  [48, 22, 48, 74, 11], [22, 48, 74, 48, 11]   // cruz
];
const PUNTOS = [];                  // círculos blancos: [x, y, radio]
const HUECOS = [                    // en el color del fondo, encima de lo blanco: línea de latido
  [24, 49, 37, 49, 2.5], [37, 49, 42, 38, 2.5], [42, 38, 50, 61, 2.5],
  [50, 61, 56, 45, 2.5], [56, 45, 60, 49, 2.5], [60, 49, 72, 49, 2.5]
];
const MUESTRAS = 4;                 // 4 × 4 muestras por píxel para suavizar los bordes

const hex = function (c) { return '#' + c.map(function (v) { return ('0' + v.toString(16)).slice(-2); }).join(''); };

/** El mismo dibujo en SVG (icono de la pestaña del navegador). */
function svg() {
  const linea = function (s, color) {
    return '<path d="M' + s[0] + ' ' + s[1] + 'L' + s[2] + ' ' + s[3] + '" stroke="' + color + '" stroke-width="' + s[4] * 2 + '"/>';
  };
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">' +
    '<rect width="96" height="96" rx="' + RADIO_ESQUINA + '" fill="' + hex(FONDO) + '"/>' +
    '<g stroke-linecap="round" fill="none">' +
    TRAZOS.map(function (s) { return linea(s, '#fff'); }).join('') +
    HUECOS.map(function (s) { return linea(s, hex(FONDO)); }).join('') + '</g>' +
    PUNTOS.map(function (p) { return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + p[2] + '" fill="#fff"/>'; }).join('') +
    '</svg>';
}

function distanciaSegmento(px, py, s) {
  const dx = s[2] - s[0], dy = s[3] - s[1];
  const t = Math.max(0, Math.min(1, ((px - s[0]) * dx + (py - s[1]) * dy) / (dx * dx + dy * dy)));
  const x = s[0] + t * dx - px, y = s[1] + t * dy - py;
  return Math.sqrt(x * x + y * y);
}

function dentroEsquinas(x, y) {
  const r = RADIO_ESQUINA;
  const cx = Math.max(r, Math.min(96 - r, x)), cy = Math.max(r, Math.min(96 - r, y));
  return (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r;
}

function esBlanco(x, y) {
  if (HUECOS.some(function (s) { return distanciaSegmento(x, y, s) <= s[4]; })) return false;
  if (TRAZOS.some(function (s) { return distanciaSegmento(x, y, s) <= s[4]; })) return true;
  return PUNTOS.some(function (p) { return (x - p[0]) * (x - p[0]) + (y - p[1]) * (y - p[1]) <= p[2] * p[2]; });
}

/**
 * Píxeles RGBA del icono de lado `lado`.
 * maskable: fondo a sangre (sin esquinas) y dibujo al 80 % en el centro, dentro de la zona segura de Android.
 */
function pixeles(lado, maskable) {
  const escala = maskable ? 0.8 : 1;
  const datos = Buffer.alloc(lado * lado * 4);
  for (let py = 0; py < lado; py++) {
    for (let px = 0; px < lado; px++) {
      let fondo = 0, blanco = 0;
      for (let sy = 0; sy < MUESTRAS; sy++) {
        for (let sx = 0; sx < MUESTRAS; sx++) {
          const x = (px + (sx + 0.5) / MUESTRAS) / lado * 96;
          const y = (py + (sy + 0.5) / MUESTRAS) / lado * 96;
          if (!maskable && !dentroEsquinas(x, y)) continue;
          fondo++;
          if (esBlanco(48 + (x - 48) / escala, 48 + (y - 48) / escala)) blanco++;
        }
      }
      const i = (py * lado + px) * 4;
      const a = fondo / (MUESTRAS * MUESTRAS);
      const b = fondo ? blanco / fondo : 0;
      datos[i] = Math.round(FONDO[0] + (255 - FONDO[0]) * b);
      datos[i + 1] = Math.round(FONDO[1] + (255 - FONDO[1]) * b);
      datos[i + 2] = Math.round(FONDO[2] + (255 - FONDO[2]) * b);
      datos[i + 3] = Math.round(a * 255);
    }
  }
  return datos;
}

// ---------- PNG ----------

const TABLA_CRC = (function () {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = TABLA_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function trozo(tipo, datos) {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([largo, cuerpo, crc]);
}

function png(lado, rgba) {
  const cabecera = Buffer.alloc(13);
  cabecera.writeUInt32BE(lado, 0);
  cabecera.writeUInt32BE(lado, 4);
  cabecera[8] = 8;   // 8 bits por canal
  cabecera[9] = 6;   // RGBA
  const filas = Buffer.alloc(lado * (lado * 4 + 1));
  for (let y = 0; y < lado; y++) {
    filas[y * (lado * 4 + 1)] = 0;   // sin filtro
    rgba.copy(filas, y * (lado * 4 + 1) + 1, y * lado * 4, (y + 1) * lado * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo('IHDR', cabecera),
    trozo('IDAT', zlib.deflateSync(filas, { level: 9 })),
    trozo('IEND', Buffer.alloc(0))
  ]);
}

/** { 'icono.svg': texto, 'icono-192.png': Buffer, 'icono-512.png': Buffer, 'icono-maskable-512.png': Buffer } */
module.exports = function iconos() {
  return {
    'icono.svg': svg(),
    'icono-192.png': png(192, pixeles(192, false)),
    'icono-512.png': png(512, pixeles(512, false)),
    'icono-maskable-512.png': png(512, pixeles(512, true))
  };
};
module.exports.color = hex(BARRA);
