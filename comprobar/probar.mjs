// comprobar/probar.mjs - Prueba del propio comprobador: en una copia temporal del proyecto mete a propósito
// cada fallo conocido (también los casos reales de la sección 14) y mira que coherencia.mjs lo detecta.
// No toca el proyecto. Uso: node comprobar/probar.mjs

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '..');
const FUERA = new Set(['node_modules', '.git', 'comprobar']);

const anadirCss = (archivo, css) => t => t.replace(/<\/style>/, css + '\n</style>');
const alFinal = texto => t => t + texto + '\n';

// Cada caso: qué se cambia y qué línea debe aparecer en el apartado que toca del informe.
const CASOS = [
  { nombre: 'Caso real: .nu .ms pinta el icono de «Guardar usuario»', archivo: 'usuarios/Panel_Nuevo.html', cambio: anadirCss('', '.nu .ms { color: var(--md-on-surface-med); }'), titulo: 'alcanzan a los iconos', busca: '.nu .ms' },
  { nombre: 'Caso real: .avatar y .chip de la Agenda en la HC', archivo: 'historia/Panel_HC.html', cambio: t => t.replaceAll('hc-iniciales', 'avatar').replaceAll('hc-chip', 'chip'), titulo: 'panel compartido', busca: 'historia/Panel_HC.html' },
  { nombre: 'Caso real: segundo borde de foco en Estadísticas', archivo: 'dashboard/CSS_Estadisticas.html', cambio: alFinal('select:focus-visible, input[type="date"]:focus-visible { border-color: var(--md-primary); box-shadow: 0 0 0 1px var(--md-primary); }'), titulo: 'borde común', busca: 'select:focus-visible' },
  { nombre: 'Caso real: segundo borde de foco en Editar valoración', archivo: 'valoraciones/CSS_Valoraciones.html', cambio: alFinal('.form-grid input:focus, .form-grid select:focus { border-color: var(--md-primary); box-shadow: 0 0 0 1px var(--md-primary); }'), titulo: 'borde común', busca: '.form-grid input:focus' },
  { nombre: 'Caso real: reinicio .pv * que quita el relleno a los botones', archivo: 'valoraciones/Panel_Valoracion.html', cambio: anadirCss('', '.pv * { padding: 0; }'), titulo: 'Reinicios', busca: '.pv *' },
  { nombre: 'Regla que cambia un botón común', archivo: 'agenda/Panel_Cita.html', cambio: anadirCss('', '.pc .md-btn { background: var(--md-surface); }'), titulo: 'aspecto de una pieza común', busca: '.pc .md-btn' },
  { nombre: 'Regla que cambia un campo común', archivo: 'usuarios/Panel_Editar.html', cambio: anadirCss('', '.pe .md-campo__control { height: 30px; }'), titulo: 'aspecto de una pieza común', busca: '.pe .md-campo__control' },
  { nombre: 'Regla que cambia un chip común', archivo: 'agenda/Panel_Disponibilidad.html', cambio: anadirCss('', '.x .md-chip { color: var(--md-error); }'), titulo: 'aspecto de una pieza común', busca: '.x .md-chip' },
  { nombre: 'Regla que cambia un aviso común', archivo: 'agenda/CSS_Agenda.html', cambio: alFinal('.toast-aviso { box-shadow: none; }'), titulo: 'aspecto de una pieza común', busca: '.toast-aviso' },
  { nombre: 'Colocar un botón sigue permitido', archivo: 'agenda/Panel_Cita.html', cambio: anadirCss('', '.pc .md-btn { margin-left: auto; }'), titulo: 'aspecto de una pieza común', busca: '.pc .md-btn', noDebe: true },
  { nombre: 'Color suelto', archivo: 'agenda/CSS_Agenda.html', cambio: alFinal('.prueba-hex { color: #123456; }'), titulo: 'hexadecimales', busca: '#123456' },
  { nombre: 'Color suelto en impresión sigue permitido', archivo: 'agenda/CSS_Agenda.html', cambio: alFinal('@media print { .prueba-hex { color: #123456; } }'), titulo: 'hexadecimales', busca: '#123456', noDebe: true },
  { nombre: 'Girador propio', archivo: 'agenda/CSS_Agenda.html', cambio: alFinal('@keyframes gira { to { transform: rotate(360deg); } }'), titulo: 'girador', busca: 'gira' },
  { nombre: 'Capa con número', archivo: 'agenda/CSS_Agenda.html', cambio: alFinal('.prueba { z-index: 50; }'), titulo: 'z-index', busca: 'z-index' },
  { nombre: 'Esquina suelta', archivo: 'agenda/CSS_Agenda.html', cambio: alFinal('.prueba { border-radius: 7px; }'), titulo: 'Esquinas', busca: '7px' },
  { nombre: 'Tamaño de letra suelto', archivo: 'agenda/CSS_Agenda.html', cambio: alFinal('.prueba { font-size: 13px; }'), titulo: 'Tamaños de letra', busca: '13px' },
  { nombre: 'Tema con prefers-color-scheme', archivo: 'agenda/CSS_Agenda.html', cambio: alFinal('@media (prefers-color-scheme: dark) { .prueba { top: 0; } }'), titulo: 'prefers-color-scheme', busca: 'prefers-color-scheme' },
  { nombre: 'outline: none sin sustituto', archivo: 'agenda/CSS_Agenda.html', cambio: alFinal('.prueba-sin-foco { outline: none; }'), titulo: 'outline: none', busca: '.prueba-sin-foco' },
  { nombre: 'id repetido entre dos archivos de una página', archivo: 'usuarios/Panel_Nuevo.html', cambio: alFinal('<div id="fichaDuplicada"></div>'), extra: ['usuarios/BaseDatos_Vista.html', alFinal('<div id="fichaDuplicada"></div>')], titulo: 'id repetidos', busca: 'fichaDuplicada' },
  { nombre: 'Salto de línea CRLF', archivo: 'core/Config.gs', cambio: t => t.replace('\n', '\r\n'), titulo: 'CRLF', busca: 'core/Config.gs' },
  { nombre: 'Error de sintaxis en un script', archivo: 'ui/JS_Telefono.html', cambio: t => t.replace('<script>', '<script>\nfunction ( {'), titulo: 'sintaxis', busca: 'ui/JS_Telefono.html' },
  { nombre: 'Pieza nueva en CSS_Global se vigila sola', archivo: 'ui/CSS_Global.html', cambio: alFinal('.md-nueva { color: var(--md-primary); }'), extra: ['agenda/CSS_Agenda.html', alFinal('.x .md-nueva { color: var(--md-error); }')], titulo: 'aspecto de una pieza común', busca: '.x .md-nueva' },
];

function informe(raiz) {
  const r = spawnSync(process.execPath, [path.join(AQUI, 'coherencia.mjs'), '--raiz=' + raiz], { encoding: 'utf8' });
  if (r.status !== 0 && r.status !== 1) throw new Error('El comprobador se ha roto:\n' + r.stderr);
  return r.stdout;
}
const apartado = (salida, titulo) => {
  const bloques = salida.split(/\n(?=  \[)/);
  return bloques.find(b => b.split('\n')[0].includes(titulo)) ?? '';
};

const copia = fs.mkdtempSync(path.join(os.tmpdir(), 'coherencia-'));
fs.cpSync(RAIZ, copia, { recursive: true, filter: f => !FUERA.has(path.basename(f)) });
let fallos = 0;
try {
  for (const caso of CASOS) {
    const cambios = [[caso.archivo, caso.cambio], ...(caso.extra ? [caso.extra] : [])];
    const previo = cambios.map(([a]) => [a, fs.readFileSync(path.join(copia, a), 'utf8')]);
    let ok;
    for (const [a, fn] of cambios) fs.writeFileSync(path.join(copia, a), fn(fs.readFileSync(path.join(copia, a), 'utf8')));
    const texto = apartado(informe(copia), caso.titulo).split('\n').slice(1).join('\n');
    ok = texto.includes(caso.busca) !== !!caso.noDebe;
    for (const [a, t] of previo) fs.writeFileSync(path.join(copia, a), t);
    console.log(`  [${ok ? 'OK' : 'FALLA'}] ${caso.nombre}`);
    if (!ok) fallos++;
  }
} finally {
  fs.rmSync(copia, { recursive: true, force: true });
}
console.log(fallos ? `\n${fallos} pruebas fallan.` : `\nLas ${CASOS.length} pruebas pasan.`);
process.exitCode = fallos ? 1 : 0;
