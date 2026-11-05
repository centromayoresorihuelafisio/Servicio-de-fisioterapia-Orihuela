// comprobar/coherencia.mjs - Comprobación automática de coherencia (conversación 6, sección 14 de CONTEXTO.md).
// Repite la «medición final» de la sección 13, busca reglas propias que tapen las comunes de ui/CSS_Global
// y vigila la puerta única del servidor (sección 17).
// Solo lee archivos: no cambia nada. La terminación .mjs hace que `clasp push` no lo suba (comprobado con `clasp status`).
//
// Uso (desde la raíz del proyecto):
//   node comprobar/coherencia.mjs             informe; termina con error si hay algo que revisar
//   node comprobar/coherencia.mjs --detalle   además, lista lo permitido y por qué
//   node comprobar/coherencia.mjs --raiz=RUTA comprueba otra copia del proyecto (la usan las pruebas)

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const DETALLE = args.includes('--detalle');
const argRaiz = args.find(a => a.startsWith('--raiz='));
const RAIZ = argRaiz ? path.resolve(argRaiz.slice(7)) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const GLOBAL = 'ui/CSS_Global.html';
const CARPETAS_FUERA = new Set(['node_modules', '.git', 'comprobar']);

// ===== Excepciones: lo que se permite a propósito, siempre con su motivo =====
// c = comprobación; archivo = archivo exacto; texto = (opcional) trozo del hallazgo al que se limita.
const EXCEPCIONES = [
  { c: 'hex', archivo: 'dashboard/JS_Exportar.html', motivo: 'lienzo de los PNG exportados: no puede leer las variables' },
  { c: 'hex', archivo: 'ui/JS_Paneles_Diferidos.html', motivo: 'color de respaldo dentro de var(): solo si faltara CSS_Global' },
  { c: 'hex', archivo: 'agenda/Recordatorios.gs', motivo: 'colores de la hoja de cálculo, no de la pantalla' },
  { c: 'hex', archivo: 'core/WebApp.gs', motivo: 'página índice antigua, escrita en el propio core/WebApp.gs (no se toca sin visto bueno)' },
  { c: 'esquina', archivo: 'core/WebApp.gs', motivo: 'página índice antigua, escrita en el propio core/WebApp.gs (no se toca sin visto bueno)' },
  { c: 'letra', archivo: 'core/WebApp.gs', motivo: 'página índice antigua, escrita en el propio core/WebApp.gs (no se toca sin visto bueno)' },
  { c: 'color', archivo: 'core/WebApp.gs', motivo: 'página índice antigua, escrita en el propio core/WebApp.gs (no se toca sin visto bueno)' },
  { c: 'sombra', archivo: 'core/WebApp.gs', motivo: 'página índice antigua, escrita en el propio core/WebApp.gs (no se toca sin visto bueno)' },
  { c: 'tiempo', archivo: 'core/WebApp.gs', motivo: 'página índice antigua, escrita en el propio core/WebApp.gs (no se toca sin visto bueno)' },
  { c: 'contorno', archivo: 'agenda/CSS_Agenda.html', texto: '.input-celda', motivo: 'el campo editable de la celda ya se distingue por su borde y su sombra' },
  { c: 'contorno', archivo: 'agenda/CSS_Agenda.html', texto: '.su-buscar', motivo: 'buscador dentro de un menú recién abierto: el foco es siempre suyo y se ve el cursor' },
  { c: 'contorno', archivo: 'usuarios/Panel_Nuevo.html', texto: '.ms-search-input', motivo: 'buscador dentro de un menú recién abierto: el foco es siempre suyo y se ve el cursor' },
  { c: 'contorno', archivo: 'usuarios/Panel_Editar.html', texto: '.ms-search-input', motivo: 'buscador dentro de un menú recién abierto: el foco es siempre suyo y se ve el cursor' },
  { c: 'foco', archivo: 'ui/CSS_Ficha.html', motivo: 'solo mete el anillo común hacia dentro, porque la fila ocupa todo el ancho' },
  { c: 'foco', archivo: 'usuarios/CSS_Usuarios.html', texto: '.menu-item', motivo: 'solo mete el anillo común hacia dentro, porque la fila ocupa todo el ancho' },
  { c: 'foco', archivo: 'usuarios/Panel_Nuevo.html', texto: ':has(input:focus-visible)', motivo: 'el control real está oculto: el anillo va en su contenedor' },
  { c: 'foco', archivo: 'valoraciones/Panel_Valoraciones.html', texto: '.pvs-undo', motivo: 'mismo color de foco que el aviso común, sobre fondo oscuro' },
  { c: 'tapa', archivo: 'dashboard/CSS_Estadisticas.html', texto: 'header.top', motivo: 'relleno de la cabecera: colocación permitida (sección 6)' },
  { c: 'tapa', archivo: 'valoraciones/CSS_Valoraciones.html', texto: '.modal-box-ancho', motivo: 'tope de alto de una variante ancha: colocación' },
  { c: 'fuga', archivo: 'agenda/Panel_Recordatorios.html', texto: 'JS_Agenda_Resumen', motivo: 'la Agenda pinta los recordatorios con sus clases a propósito' },
  { c: 'variable', archivo: 'dashboard/JS_Graficos.html', texto: '.gr-export', motivo: 'letra fija de los gráficos exportados a imagen' },
  { c: 'reinicio', archivo: 'agenda/Panel_Cita.html', texto: '.pc-hoja-cuerpo', motivo: 'solo min-height: 0 para que la hoja haga scroll: colocación' },
  { c: 'fuga', archivo: 'ui/CSS_Ficha.html', motivo: 'piezas fu-* de la ficha, reutilizadas a propósito' },
  { c: 'puerta', archivo: 'ui/Acceso.html', motivo: 'es la propia llamar(), la única que habla con el servidor' },
];

// ===== Una sola puerta (sección 17): lo que puede quedar público y lo que aún falta por pasar a llamar() =====
const API = 'acceso/Api.gs';
const PUBLICAS = {
  doGet: 'Apps Script la exige pública', api: 'la única puerta del navegador',
  accesoPrepararHojas: 'editor', accesoComprobarPropietario: 'editor', accesoMedirIteraciones: 'editor', accesoCrearAdministrador: 'editor', accesoProbarCorreo: 'editor',
  accesoSuspenderUsuarios: 'editor', accesoReanudarUsuarios: 'editor', accesoCerrarApp: 'editor', accesoAbrirApp: 'editor',
  configurarMensajeWhatsapp: 'editor', sincronizarContactosGoogle: 'editor', exportarProyectoAUnicoArchivo: 'editor', sembrarHistorialEstado: 'editor', verificarHistorialEstado: 'editor',
  revisarParesIdsPaciente: 'editor', asignarIdsPaciente: 'editor', revisarIdPacienteEnHC: 'editor', asignarIdPacienteEnHC: 'editor', revisarIdPacienteEnValoraciones: 'editor', asignarIdPacienteEnValoraciones: 'editor', migrarGravedadUrgenteAGrave: 'editor',
};
// Transición de la fase 2 (17.10): terminada el 2-nov-2026, las dos listas quedan vacías. Si algún día se vuelve a usar,
// una entrada que ya no hace falta se avisa, para que la lista solo baje.
const HTML_PENDIENTE = {
};
const FN_PENDIENTE = {
};

// ===== Lectura de archivos =====
function recorrer(dir, salida = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!CARPETAS_FUERA.has(e.name)) recorrer(path.join(dir, e.name), salida); }
    else salida.push(path.join(dir, e.name));
  }
  return salida;
}
const rel = f => path.relative(RAIZ, f).split(path.sep).join('/');
const todos = recorrer(RAIZ).map(rel);
const codigo = todos.filter(f => /\.(html|gs)$/.test(f));
const textoDe = new Map(codigo.map(f => [f, fs.readFileSync(path.join(RAIZ, f), 'utf8')]));
const lineaDe = (texto, pos) => texto.slice(0, pos).split('\n').length;
// Sustituye un trozo por espacios sin mover las posiciones (conserva los saltos de línea).
const blanco = s => s.replace(/[^\n]/g, ' ');

// ===== Lectura de estilos =====
// Devuelve los trozos de CSS de un archivo: { inicio, css }, con comentarios y scriptlets en blanco.
function trozosCss(archivo) {
  const t = textoDe.get(archivo);
  if (/\.gs$/.test(archivo) && !/<style[\s>]/.test(t)) return [];
  if (/(^|\/)CSS_[^/]*\.html$/.test(archivo)) return [{ inicio: 0, css: t }];
  const trozos = [];
  for (const m of t.matchAll(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/g)) trozos.push({ inicio: m.index + m[0].indexOf('>') + 1, css: m[1] });
  return trozos;
}
function limpiarCss(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, blanco).replace(/<\?[\s\S]*?\?>/g, blanco).replace(/<!--|-->/g, blanco);
}
function cierreLlave(css, desde) {
  let comilla = '';
  for (let i = desde; i < css.length; i++) {
    const c = css[i];
    if (comilla) { if (c === '\\') i++; else if (c === comilla) comilla = ''; }
    else if (c === '"' || c === "'") comilla = c;
    else if (c === '}') return i;
  }
  return css.length;
}
function partirArriba(s, sep) {
  const partes = []; let n = 0, ini = 0;
  for (let i = 0; i < s.length; i++) {
    if ('([' .includes(s[i])) n++; else if (')]'.includes(s[i])) n--;
    else if (s[i] === sep && n === 0) { partes.push(s.slice(ini, i)); ini = i + 1; }
  }
  partes.push(s.slice(ini));
  return partes.map(p => p.trim()).filter(Boolean);
}
function declaraciones(cuerpo) {
  return partirArriba(cuerpo, ';').map(d => {
    const i = d.indexOf(':');
    return i < 0 ? null : { prop: d.slice(0, i).trim().toLowerCase(), val: d.slice(i + 1).trim() };
  }).filter(Boolean);
}
// Un selector se parte en piezas por espacios y por > + ~, respetando paréntesis y corchetes.
function compuestos(sel) {
  const r = []; let n = 0, act = '';
  for (const c of sel) {
    if ('(['.includes(c)) n++; else if (')]'.includes(c)) n--;
    if (n === 0 && /[\s>+~]/.test(c)) { if (act) r.push(act); act = ''; } else act += c;
  }
  if (act) r.push(act);
  return r;
}
const sinParentesis = s => { let p; do { p = s; s = s.replace(/\([^()]*\)/g, '').replace(/\[[^\]]*\]/g, ''); } while (p !== s); return s; };
const clasesDe = comp => [...sinParentesis(comp).matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map(m => m[1]);

const reglas = [];     // una por cada selector de cada regla
const keyframes = [];  // { archivo, nombre, cuerpo, linea }
const zonasImpresion = new Map();  // archivo -> [[ini, fin], ...]

function leerCss(archivo, inicio, cssCrudo) {
  const css = limpiarCss(cssCrudo), original = textoDe.get(archivo);
  const contexto = []; let i = 0, ini = 0;
  while (i < css.length) {
    const c = css[i];
    if (c === ';') { ini = i + 1; i++; continue; }
    if (c === '}') {
      const ctx = contexto.pop();
      if (ctx && ctx.imprimir) { if (!zonasImpresion.has(archivo)) zonasImpresion.set(archivo, []); zonasImpresion.get(archivo).push([inicio + ctx.pos, inicio + i]); }
      ini = i + 1; i++; continue;
    }
    if (c !== '{') { i++; continue; }
    const previo = css.slice(ini, i).trim();
    const linea = lineaDe(original, inicio + ini + (css.slice(ini, i).length - css.slice(ini, i).trimStart().length));
    if (/^@(media|supports|layer|container)/.test(previo)) {
      contexto.push({ imprimir: /\bprint\b/.test(previo), pos: i });
      i++; ini = i; continue;
    }
    if (/^@(-webkit-)?keyframes/.test(previo)) {
      let n = 1, j = i + 1;
      for (; j < css.length && n; j++) { if (css[j] === '{') n++; else if (css[j] === '}') n--; }
      keyframes.push({ archivo, nombre: previo.split(/\s+/)[1], cuerpo: css.slice(i, j), linea });
      i = j; ini = j; continue;
    }
    const fin = cierreLlave(css, i + 1);
    const impresion = contexto.some(x => x.imprimir);
    if (!previo.startsWith('@')) {
      const decl = declaraciones(css.slice(i + 1, fin));
      for (const selector of partirArriba(previo.replace(/\s+/g, ' '), ',')) {
        reglas.push({ archivo, selector, comps: compuestos(selector), decl, impresion, linea });
      }
    }
    i = fin + 1; ini = i;
  }
}
for (const f of codigo) for (const t of trozosCss(f)) leerCss(f, t.inicio, t.css);
const enImpresion = (archivo, pos) => (zonasImpresion.get(archivo) || []).some(([a, b]) => pos >= a && pos <= b);
const propias = reglas.filter(r => r.archivo !== GLOBAL);
const propiasPantalla = propias.filter(r => !r.impresion);

// ===== Páginas y lo que cada una incluye =====
// Piezas que se incluyen con una función propia en vez de con su ruta (core/WebApp.gs, fase 3 de la sección 17).
const PIEZAS_FIJAS = { incluirAcceso_: 'ui/Acceso.html', incluirPestanas_: 'ui/Pestanas.html' };
const incluidos = new Map();
for (const [f, t] of textoDe) {
  if (!f.endsWith('.html')) continue;
  const lista = [...t.matchAll(/<\?!?=\s*(?:include_|incluirPanel_)\(\s*'([^']+)'/g)].map(m => m[1] + '.html')
    .concat(Object.entries(PIEZAS_FIJAS).filter(([fn]) => t.includes(fn + '(')).map(([, x]) => x))
    .filter(x => textoDe.has(x));
  incluidos.set(f, lista);
}
const raices = [...incluidos.keys()].filter(f => /(_Vista|Guia_Visual)\.html$/.test(f) && ![...incluidos.values()].some(l => l.includes(f)));
const arbol = (f, vistos = new Set()) => { if (!vistos.has(f)) { vistos.add(f); (incluidos.get(f) || []).forEach(x => arbol(x, vistos)); } return vistos; };
const paginas = new Map(raices.map(r => [r, arbol(r)]));

// ===== Clases usadas en el marcado de cada archivo =====
const CLASE_OK = /^[a-zA-Z][\w-]*$/;
function clasesMarcado(t) {
  const s = new Set();
  const anadir = txt => txt.split(/\s+/).filter(x => CLASE_OK.test(x)).forEach(x => s.add(x));
  for (const m of t.matchAll(/class\s*=\s*"([^"]*)"/g)) anadir(m[1]);
  for (const m of t.matchAll(/class\s*=\s*\\?'([^'\\]*)\\?'/g)) anadir(m[1]);
  for (const m of t.matchAll(/className\s*=\s*['"]([^'"]*)['"]/g)) anadir(m[1]);
  for (const m of t.matchAll(/classList\.(?:add|toggle|remove)\(\s*['"]([^'"]+)['"]/g)) anadir(m[1]);
  return s;
}
const sinEstilos = t => t.replace(/<style(?:\s[^>]*)?>[\s\S]*?<\/style>/g, blanco);
const marcado = new Map(codigo.map(f => [f, clasesMarcado(sinEstilos(textoDe.get(f)))]));

// ===== Piezas comunes: se sacan de CSS_Global, así una pieza nueva se vigila sola =====
const ES_ICONO = /^(material-symbols-outlined|ms(-sm|-lg|-fill)?)$/;   // los iconos no son pieza: su color y tamaño se vigilan aparte
const piezas = new Set(), piezaEtiqueta = new Map(), sinEtiqueta = new Set();
for (const r of reglas.filter(x => x.archivo === GLOBAL)) {
  for (const c of r.comps) {
    const cl = clasesDe(c);
    if (cl.length !== 1 && !cl[0]?.startsWith('md-')) continue;
    cl.filter(x => x !== 'visible' && !ES_ICONO.test(x)).forEach(x => piezas.add(x));
    const et = /^[a-z]+(?=\.)/.exec(c);   // header.top: solo es esa pieza si el selector dice header
    if (et && cl.length === 1) piezaEtiqueta.set(cl[0], et[0]); else cl.forEach(x => sinEtiqueta.add(x));
  }
}
sinEtiqueta.forEach(x => piezaEtiqueta.delete(x));
const esPieza = comp => clasesDe(comp).some(x => piezas.has(x) && (!piezaEtiqueta.has(x) || comp.startsWith(piezaEtiqueta.get(x) + '.')));
const BOTONES = /^(md-btn|md-chip|btn-toolbar)/;
const esBoton = c => clasesDe(c).some(x => BOTONES.test(x));

// Qué va dentro de qué: para cada clase, las etiqueta.clase que tiene dentro (también en el HTML escrito en JavaScript).
const SIN_CIERRE = new Set(['input', 'br', 'hr', 'img', 'meta', 'link']);
const anidado = new Map();
for (const [f, t] of textoDe) {
  if (!f.endsWith('.html')) continue;
  const pila = [], todo = new Set();
  for (const m of sinEstilos(t).matchAll(/<(\/?)([a-z][a-z0-9]*)\b([^<>]*)>/g)) {
    const [, cierra, tag, attrs] = m;
    if (cierra) {
      const i = pila.map(x => x.tag).lastIndexOf(tag);
      if (i >= 0) pila.length = i;
      continue;
    }
    const clases = [...clasesMarcado(attrs)];
    clases.forEach(c => todo.add(`${tag}.${c}`));
    for (const padre of pila) for (const k of padre.clases) {
      if (!anidado.has(k)) anidado.set(k, new Set());
      clases.forEach(c => anidado.get(k).add(`${tag}.${c}`));
    }
    if (!SIN_CIERRE.has(tag) && !attrs.endsWith('/')) pila.push({ tag, clases });
  }
  // La raíz de un panel (.pc, .pvs...) a veces la pone el JavaScript: se da por hecho que lo envuelve todo.
  const cuenta = {};
  reglas.filter(r => r.archivo === f).forEach(r => { const k = clasesDe(r.comps[0])[0]; if (k) cuenta[k] = (cuenta[k] || 0) + 1; });
  const [raiz, n] = Object.entries(cuenta).sort((a, b) => b[1] - a[1])[0] || [];
  if (raiz && n >= 10 && n / reglas.filter(r => r.archivo === f).length > .4) {
    if (!anidado.has(raiz)) anidado.set(raiz, new Set());
    todo.forEach(x => anidado.get(raiz).add(x));
  }
}
const CONTROLES = { button: /^button\.(md-btn|md-chip|btn-toolbar)/, a: /^a\.(md-btn|tab-cambio)/, input: /^input\.md-campo__control/, select: /^select\.md-campo__control/, textarea: /^textarea\.md-campo__control/, label: /^label\.md-campo__etiqueta/ };
const COMUN_DENTRO = /\.(md-btn|md-chip|btn-toolbar|md-campo__control|md-campo__etiqueta)/;
const contieneComun = (clase, expr = COMUN_DENTRO) => [...(anidado.get(clase) || [])].some(x => expr.test(x));

// Lo que no es colocación: una página no debe cambiarlo en una pieza común (sección 13, regla b).
const ASPECTO = /^(color|background|border(?!-collapse|-spacing)|box-shadow|outline|font|letter-spacing|line-height|text-(?!align|overflow)|opacity|transition|animation|padding|height|min-height|max-height|cursor|fill|stroke)/;

// ===== Comprobaciones =====
const resultados = [];
function anotar(c, titulo, hallazgos, nota) {
  const revisar = [], permitidos = [];
  for (const h of hallazgos) {
    const ex = h.motivo ? h : EXCEPCIONES.find(e => e.c === c && e.archivo === h.archivo && (!e.texto || h.texto.includes(e.texto)));
    if (ex) permitidos.push({ ...h, motivo: ex.motivo }); else revisar.push(h);
  }
  resultados.push({ c, titulo, revisar, permitidos, nota });
}
const quitarComentarios = t => t.replace(/\/\*[\s\S]*?\*\//g, blanco).replace(/^(\s*)\/\/.*$/gm, blanco).replace(/<!--[\s\S]*?-->/g, blanco);
// Busca una expresión en todo el texto de los archivos (estilos, atributos style y JavaScript).
function buscar(expr, { incluirGlobal = false, filtro = () => true } = {}) {
  const r = [];
  for (const [archivo, t] of textoDe) {
    if (!incluirGlobal && archivo === GLOBAL) continue;
    const limpio = quitarComentarios(t);
    for (const m of limpio.matchAll(expr)) {
      if (!filtro(m, archivo, limpio)) continue;
      const linea = lineaDe(t, m.index);
      r.push({ archivo, linea, texto: m[0].trim().slice(0, 90), pos: m.index });
    }
  }
  return r;
}
const IMPRESION = 'impresión: colores fijos para el papel';
const marcarImpresion = l => l.map(h => enImpresion(h.archivo, h.pos) ? { ...h, motivo: IMPRESION } : h);

function deRegla(r, texto) { return { archivo: r.archivo, linea: r.linea, texto: texto || r.selector }; }

// ----- A. Medición final de la sección 13 -----
anotar('hex', 'Colores hexadecimales fuera de CSS_Global', marcarImpresion(buscar(/(?<![&\w])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g, {
  filtro: (m, a, t) => !/(href|id|for)=["']$/.test(t.slice(Math.max(0, m.index - 6), m.index)),
})));
anotar('color', 'Colores rgb()/hsl() fuera de CSS_Global', marcarImpresion(buscar(/\b(?:rgba?|hsla?)\(\s*[\d.]/g, { filtro: (m, a) => a !== 'dashboard/JS_Exportar.html' })));
anotar('prefijo', 'Prefijos propios --ag-, --pc-, --nu-, --pe-, --wl-, --sf-, --hc-', buscar(/--(?:ag|pc|nu|pe|wl|sf|hc)-[\w-]+/g));
const globales = new Set(reglas.filter(r => r.archivo === GLOBAL).flatMap(r => r.decl.map(d => d.prop)).filter(p => p.startsWith('--')));
const PUNTEROS = { '--t-c': 'puntero a los tonos de Estadísticas', '--rc-c': 'puntero al color del tipo de recordatorio', '--rc-bg': 'puntero al color del tipo de recordatorio', '--md-campo-fondo': 'ajuste previsto por .md-campo' };
anotar('variable', 'Variables propias declaradas fuera de CSS_Global', propias.flatMap(r => r.decl.filter(d => d.prop.startsWith('--')).map(d => {
  const h = deRegla(r, `${d.prop} en ${r.selector}`);
  if (PUNTEROS[d.prop]) return { ...h, motivo: PUNTEROS[d.prop] };
  if (globales.has(d.prop)) return { ...h, texto: h.texto + ' (cambia una variable común)' };
  if (/var\(--(md|t)-/.test(d.val)) return { ...h, motivo: 'puntero por clase a un color común' };
  if (!/#|rgb|hsl/.test(d.val)) return { ...h, motivo: 'medida de colocación, no un color' };
  return h;
})));
const giros = keyframes.filter(k => /rotate\(/.test(k.cuerpo));
anotar('girador', '@keyframes de girador distintos de md-spin', giros.filter(k => k.nombre !== 'md-spin').map(k => ({ archivo: k.archivo, linea: k.linea, texto: k.nombre })),
  giros.some(k => k.nombre === 'md-spin') ? '' : 'FALTA md-spin en CSS_Global');
const veces = {};
keyframes.filter(k => k.archivo !== GLOBAL).forEach(k => (veces[k.nombre] ||= new Set()).add(k.archivo));
anotar('keyframes', 'Animaciones (@keyframes) con el mismo nombre en varios archivos', keyframes.filter(k => veces[k.nombre]?.size > 1).map(k => ({ archivo: k.archivo, linea: k.linea, texto: k.nombre })));

const esquinaBuena = v => v.split(/\s+/).every(x => /^(var\(--md-shape-[a-z]+\)|50%|0|inherit)$/.test(x));
anotar('esquina', 'Esquinas fuera de --md-shape-*, 50%, 0 e inherit', propiasPantalla.flatMap(r => r.decl.filter(d => /radius$/.test(d.prop) && !esquinaBuena(d.val.replace(/\s*!important/, ''))).map(d => deRegla(r, `${r.selector} { ${d.prop}: ${d.val} }`))).concat(
  buscar(/border(?:-[a-z]+)*-radius:\s*[^;"']+/g, { filtro: (m, a, t) => !enCss(a, m.index) && !esquinaBuena(m[0].replace(/^[^:]+:\s*/, '').trim()) && !/\$\{|\+/.test(m[0]) })));
function enCss(archivo, pos) { return trozosCss(archivo).some(t => pos >= t.inicio && pos <= t.inicio + t.css.length); }

anotar('capa', 'z-index con número', buscar(/z-?index['"]?\s*[:=]\s*['"]?-?\d/gi));
anotar('curva', 'cubic-bezier fuera de CSS_Global', buscar(/cubic-bezier\(/g));
anotar('tema', 'prefers-color-scheme', buscar(/prefers-color-scheme/g, { incluirGlobal: true }));
const decl = (props) => propias.flatMap(r => r.decl.filter(d => props.test(d.prop)).map(d => ({ r, d })));
anotar('onda', 'Onda (ripple) o scale( en estilos', [
  ...decl(/^(transform|animation)/).filter(({ d }) => /\b(scale\(|ripple)/.test(d.val)).map(({ r, d }) => deRegla(r, `${r.selector} { ${d.prop}: ${d.val} }`)),
  ...keyframes.filter(k => /\bscale\(/.test(k.cuerpo)).map(k => ({ archivo: k.archivo, linea: k.linea, texto: k.nombre })),
  ...propias.filter(r => /ripple/.test(r.selector)).map(r => deRegla(r)),
]);
// Sin difuminado (tercer número a 0) no es una sombra sino una línea o un anillo.
const sombraBuena = v => /^(none|inherit|var\(--md-elev-(\d|lateral)\))$/.test(v.replace(/\s*!important/, '')) ||
  partirArriba(v.replace(/\s*!important/, ''), ',').every(x => /^var\(--md-elev-(\d|lateral)\)$/.test(x) || /^(inset )?(-?[\d.]+(px)? ){2}0( -?[\d.]+(px)?)? /.test(x));
anotar('sombra', 'Sombras sueltas (fuera de --md-elev-*)', decl(/^box-shadow$/).filter(({ r, d }) => !r.impresion && !sombraBuena(d.val)).map(({ r, d }) => deRegla(r, `${r.selector} { box-shadow: ${d.val} }`)));
anotar('tiempo', 'Duraciones sueltas en transiciones y animaciones (fuera de --dur-*)', decl(/^(transition|animation)(-duration)?$/).filter(({ r, d }) => !r.impresion && /(?<![\w-])(\d*\.)?\d+m?s\b/.test(d.val.replace(/var\([^)]*\)/g, '').replace(/\b0s\b/g, ''))).map(({ r, d }) => {
  const h = deRegla(r, `${r.selector} { ${d.prop}: ${d.val} }`);
  if (/infinite/.test(d.val) && !/md-spin/.test(d.val)) return { ...h, motivo: 'animación continua: CSS_Global también usa ritmos fijos' };
  return h;
}));

// Letra: la escala --fs-*; solo los iconos llevan tamaño propio (conversación 5).
const ICONO = /material-symbols|\.ms\b|\.ms-|icono|icon\b|-ico\b|\.ic-?\d|\.ic-|chev|\.asa\b|\.i\b|flecha/;
const letraBuena = v => /^(var\(--fs-[a-z0-9]+\)|inherit|\d*\.?\d+em|\d+%)$/.test(v.replace(/\s*!important/, ''));
anotar('letra', 'Tamaños de letra fuera de la escala --fs-* (sin contar iconos)', propiasPantalla.flatMap(r => r.decl.filter(d => d.prop === 'font-size' && !letraBuena(d.val)).map(d => {
  const h = deRegla(r, `${r.selector} { font-size: ${d.val} }`);
  return ICONO.test(r.comps[r.comps.length - 1]) ? { ...h, motivo: 'icono: lleva tamaño propio' } : h;
})).concat(buscar(/font-size:\s*\d[^;"']*/g, { filtro: (m, a, t) => !enCss(a, m.index) && !/material-symbols-outlined"[^>]*$/.test(t.slice(Math.max(0, m.index - 120), m.index)) })));

// outline:none solo vale si hay un sustituto; lo vigila la parte B (foco). Aquí se cuentan.
const sinContorno = propias.filter(r => r.decl.some(d => /^outline(-style)?$/.test(d.prop) && /^(none|0)$/.test(d.val)));
const CON_FOCO = /:focus(-visible|-within)?/;
const baseFoco = c => c.replace(/:focus(-visible|-within)?/g, '').replace(/:hover|:active|:not\([^)]*\)/g, '');
const sustituto = r => {
  const base = baseFoco(r.comps[r.comps.length - 1]);
  const bases = clasesDe(base), padres = r.comps.slice(0, -1).flatMap(clasesDe);
  if (reglas.some(o => /:focus-within/.test(o.selector) && o.decl.some(d => d.prop === 'box-shadow') && o.comps.some(c => /:focus-within/.test(c) && clasesDe(c).some(x => padres.includes(x))))) return true;
  return propias.some(o => CON_FOCO.test(o.selector) && o.decl.some(d => /^(box-shadow|border|background)/.test(d.prop)) && o.comps.some(c => CON_FOCO.test(c) && (baseFoco(c) === base || clasesDe(c).some(x => bases.includes(x)))));
};
anotar('contorno', 'outline: none sin un foco propio que lo sustituya', sinContorno.filter(r => !r.selector.includes(':focus')).map(r => sustituto(r) ? { ...deRegla(r), motivo: 'tiene su foco propio (borde o fondo)' } : deRegla(r)));

// id repetidos: en una misma página, en archivos distintos o dos veces en el HTML de un archivo.
function idsDe(t) {
  const fuera = t.replace(/<script(?:\s[^>]*)?>[\s\S]*?<\/script>/g, blanco).replace(/<!--[\s\S]*?-->/g, blanco);
  const lista = [...fuera.matchAll(/\sid\s*=\s*"([^"<>{}$+']+)"/g)].map(m => ({ id: m[1], linea: lineaDe(t, m.index) }));
  return lista;
}
const hallId = [];
for (const [pag, arch] of paginas) {
  const donde = new Map();
  for (const f of arch) for (const x of idsDe(textoDe.get(f))) { if (!donde.has(x.id)) donde.set(x.id, []); donde.get(x.id).push({ f, linea: x.linea }); }
  for (const [id, lista] of donde) if (lista.length > 1) hallId.push({ archivo: lista[0].f, linea: lista[0].linea, texto: `id "${id}" repetido en ${pag}: ${lista.map(x => x.f + ':' + x.linea).join(', ')}` });
}
anotar('id', 'id repetidos dentro de una página', hallId.filter((h, i) => hallId.findIndex(o => o.texto.split(' repetido')[0] === h.texto.split(' repetido')[0] && o.archivo === h.archivo) === i));

// Saltos de línea: ningún CRLF en ningún archivo de texto.
const dirComprobar = path.join(RAIZ, 'comprobar');
const textos = recorrer(RAIZ).concat(fs.existsSync(dirComprobar) ? recorrer(dirComprobar) : []).map(rel);
anotar('lf', 'Archivos con CRLF', textos.filter(f => /\.(html|gs|md|json|mjs|js)$/.test(f) && !/package-lock/.test(f)).flatMap(f => {
  const b = fs.readFileSync(path.join(RAIZ, f));
  return b.includes(13) ? [{ archivo: f, linea: 0, texto: 'contiene CRLF' }] : [];
}));

// Sintaxis de JavaScript (lo mismo que node --check).
function comprobarJs(archivo, codigoJs, base) {
  const limpio = codigoJs.replace(/<\?!?=\s*(include_|incluirPanel_)\([\s\S]*?\?>/g, blanco).replace(/<\?[\s\S]*?\?>/g, m => 'null' + blanco(m.slice(4)));
  try { new vm.Script(limpio, { filename: archivo }); return null; }
  catch (e) {
    const m = /:(\d+)/.exec((e.stack || '').split('\n')[0]);
    return { archivo, linea: base + (m ? +m[1] - 1 : 0), texto: e.message };
  }
}
const hallJs = [];
for (const [f, t] of textoDe) {
  if (f.endsWith('.gs')) { const h = comprobarJs(f, t, 1); if (h) hallJs.push(h); continue; }
  if (/(^|\/)CSS_/.test(f)) continue;
  const bloques = [...t.replace(/<!--[\s\S]*?-->/g, blanco).matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/g)];
  if (/(^|\/)JS_/.test(f) && !bloques.length) { const h = comprobarJs(f, t, 1); if (h) hallJs.push(h); continue; }
  for (const b of bloques) {
    if (/\bsrc=|type="(?!text\/javascript)/.test(b[1] || '')) continue;
    const h = comprobarJs(f, b[2], lineaDe(t, b.index));
    if (h) hallJs.push(h);
  }
}
anotar('js', 'Errores de sintaxis en <script> y .gs', hallJs);

// ----- B. Reglas propias que tapan lo común -----
const ultima = r => r.comps[r.comps.length - 1];
const aspectoDe = r => r.decl.filter(d => ASPECTO.test(d.prop));

anotar('tapa', 'Reglas propias que cambian el aspecto de una pieza común', propiasPantalla.filter(r => esPieza(ultima(r)) && aspectoDe(r).length).map(r =>
  deRegla(r, `${r.selector} { ${aspectoDe(r).map(d => d.prop).join(', ')} }`)));

// Lo que hay dentro de los botones comunes (iconos sobre todo): caso real .nu .ms de usuarios/Panel_Nuevo.
const dentroBoton = new Map();
for (const [f, t] of textoDe) {
  const s = new Set();
  for (const m of t.matchAll(/<(button|a)\b[^>]*class\s*=\s*\\?["'][^"']*\b(?:md-btn|md-chip|btn-toolbar)[^"']*["'][^>]*>([\s\S]*?)<\/\1>/g)) clasesMarcado(m[2]).forEach(x => s.add(x));
  dentroBoton.set(f, s);
}
const COLOR_TAM = /^(color|font-size)$/;
anotar('dentro', 'Reglas propias que cambian lo que va dentro de un botón común', propiasPantalla.filter(r => r.comps.slice(0, -1).some(esBoton) && aspectoDe(r).length).map(r =>
  deRegla(r, `${r.selector} { ${aspectoDe(r).map(d => d.prop).join(', ')} }`)));
anotar('icono', 'Reglas generales que alcanzan a los iconos de los botones comunes', propiasPantalla.flatMap(r => {
  if (r.comps.some(esBoton) || r.comps.length < 2) return [];
  const clase = clasesDe(ultima(r)).find(x => dentroBoton.get(r.archivo)?.has(x));
  if (!clase || !clasesDe(r.comps[r.comps.length - 2]).some(k => contieneComun(k, /\.(md-btn|md-chip|btn-toolbar)/))) return [];
  const props = r.decl.filter(d => COLOR_TAM.test(d.prop) && d.val !== 'inherit');
  const sueltas = props.filter(d => !propiasPantalla.some(o => o.archivo === r.archivo && o.comps.some(esBoton) && clasesDe(ultima(o)).includes(clase) && o.decl.some(x => x.prop === d.prop)));
  return sueltas.length ? [deRegla(r, `${r.selector} { ${sueltas.map(d => d.prop).join(', ')} } alcanza a .${clase} dentro de un botón`)] : [];
}));

// Foco: una regla propia que añade borde o sombra sin quitar el contorno común suma un segundo borde.
const quitaContorno = new Set(), clasesSinContorno = new Set();
for (const r of reglas) if (r.decl.some(d => /^outline(-style)?$/.test(d.prop) && /^(none|0)$/.test(d.val))) {
  quitaContorno.add(baseFoco(r.selector));
  clasesDe(baseFoco(r.comps[r.comps.length - 1])).forEach(x => clasesSinContorno.add(x));
}
anotar('foco', 'Reglas de foco propias que suman o cambian el borde común', propiasPantalla.flatMap(r => {
  if (!/:focus(-visible)?(?!-within)/.test(r.selector)) return [];
  const pinta = r.decl.filter(d => /^(outline|box-shadow|border)/.test(d.prop));
  if (!pinta.length) return [];
  const comp = r.comps.find(c => /:focus(-visible)?(?!-within)/.test(c));
  const base = baseFoco(comp);
  const cambiaContorno = pinta.some(d => d.prop.startsWith('outline') && !/^(none|0)$/.test(d.val));
  const sustituye = quitaContorno.has(baseFoco(r.selector)) || clasesDe(base).some(x => clasesSinContorno.has(x));
  if (!cambiaContorno && (sustituye || pinta.some(d => d.prop === 'outline'))) return [];
  return [deRegla(r, `${r.selector} { ${pinta.map(d => d.prop).join(', ')} }`)];
}));

// Reinicios que empatan o ganan a las piezas comunes: caso real .pv * de valoraciones/Panel_Valoracion.
const TAG_CONTROL = /^(\*|button|input|select|textarea|a|label)$/;
anotar('reinicio', 'Reinicios con ámbito que quitan estilo a botones o campos comunes', propiasPantalla.filter(r => {
  const sub = sinParentesis(ultima(r)).replace(/:+[\w-]+/g, '');
  if (!TAG_CONTROL.test(sub) || /:not\([^)]*md-/.test(r.selector)) return false;
  return aspectoDe(r).length > 0 && r.comps.length > 1 && clasesDe(r.comps[r.comps.length - 2]).some(k => contieneComun(k, CONTROLES[sub] || COMUN_DENTRO));
}).map(r => deRegla(r, `${r.selector} { ${aspectoDe(r).map(d => d.prop).join(', ')} }`)));

// Nombres de una pantalla que también usa un panel compartido: caso real .avatar y .chip de agenda/CSS_Agenda.
const esPanel = f => /\/(Panel_|Whatsapp_Dialogo|JS_Selector_Fecha)/.test(f);
const familia = (a, b) => {
  if (a === b) return true;
  if (/CSS_Ficha/.test(a) && /(JS_Ficha|Ficha_Usuario)/.test(b)) return true;
  return !esPanel(a) && !esPanel(b) && path.dirname(a) === path.dirname(b);
};
const comparten = (a, b) => [...paginas.values()].some(s => s.has(a) && s.has(b));
const vistos = new Set(), hallFuga = [];
for (const r of propiasPantalla) {
  const clases = [...new Set(r.comps.flatMap(clasesDe))];
  if (!clases.length || !clases.some(x => !piezas.has(x))) continue;
  for (const [g, marc] of marcado) {
    if (familia(r.archivo, g) || !g.endsWith('.html') || !comparten(r.archivo, g)) continue;
    if (!clases.every(x => marc.has(x))) continue;
    const clave = r.archivo + r.selector + g;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    hallFuga.push(deRegla(r, `${r.selector} también se aplica en ${g}`));
  }
}
anotar('fuga', 'Nombres de una pantalla que afectan a un panel compartido', hallFuga);

// ----- C. Una sola puerta (sección 17) -----
const motivoPendiente = conv => `pendiente de la conversación ${conv} de la sección 17`;
const hallPuerta = buscar(/google\s*\.\s*script\b/g, { incluirGlobal: true }).map(h => HTML_PENDIENTE[h.archivo] ? { ...h, motivo: motivoPendiente(HTML_PENDIENTE[h.archivo]) } : h);
for (const f of Object.keys(HTML_PENDIENTE)) if (!hallPuerta.some(h => h.archivo === f)) hallPuerta.push({ archivo: f, linea: 0, texto: 'ya no usa google.script: quítalo de HTML_PENDIENTE' });
anotar('puerta', 'google.script fuera de llamar()', hallPuerta);

const fnPendiente = new Map(Object.entries(FN_PENDIENTE).flatMap(([conv, lista]) => lista.split(' ').map(n => [n, conv])));
const definidas = new Map();   // nombre de función de primer nivel -> dónde está
for (const [archivo, t] of textoDe) {
  if (!archivo.endsWith('.gs')) continue;
  const limpio = quitarComentarios(t);
  for (const m of limpio.matchAll(/^function\s+([\w$]+)\s*\(/gm)) definidas.set(m[1], { archivo, linea: lineaDe(t, m.index) });
}
const hallPublicas = [...definidas].filter(([n]) => !n.endsWith('_')).map(([n, d]) => {
  const h = { ...d, texto: n };
  if (PUBLICAS[n]) return { ...h, motivo: PUBLICAS[n] };
  return fnPendiente.has(n) ? { ...h, motivo: motivoPendiente(fnPendiente.get(n)) } : h;
});
for (const n of [...Object.keys(PUBLICAS), ...fnPendiente.keys()]) if (!definidas.has(n)) hallPublicas.push({ archivo: API, linea: 0, texto: `${n} ya no existe con ese nombre: quítala de la lista` });
anotar('publica', 'Funciones públicas fuera de la lista permitida', hallPublicas);

// Las del editor siguen públicas, pero lo primero que hacen es comprobar que las lanza el propietario (17.2).
const hallPropietario = Object.keys(PUBLICAS).filter(n => PUBLICAS[n] === 'editor' && definidas.has(n)).filter(n => {
  const { archivo } = definidas.get(n);
  return !new RegExp(`^function ${n}\\s*\\([^)]*\\)\\s*\\{\\s*soloPropietario_\\(`, 'm').test(quitarComentarios(textoDe.get(archivo)));
}).map(n => ({ ...definidas.get(n), texto: n }));
anotar('propietario', 'Funciones del editor que no empiezan por soloPropietario_()', hallPropietario);

// Las acciones se leen del propio accesoAcciones_ (acceso/Api.gs).
const textoApi = quitarComentarios(textoDe.get(API) || '');
const cuerpoAcciones = /function accesoAcciones_\(\) \{([\s\S]*?)\n\}/.exec(textoApi)?.[1] || '';
const acciones = new Map([...cuerpoAcciones.matchAll(/^\s*(\w+):\s*\{\s*fn:\s*(\w+)/gm)].map(m => [m[1], m[2]]));
const hallAccion = [...acciones].filter(([, fn]) => !definidas.has(fn)).map(([n, fn]) => ({ archivo: API, linea: 0, texto: `${n} apunta a ${fn}, que no existe` }));
const LLAMADAS = /(?<![\w.])(?:window\.)?(?:llamar\(\s*|(?:window\.)?WhatsappDialogo\.(?:abrir|precargar)\(\s*)(?:'(\w+)'|([^'\s,)][^,)]*))?/g;
for (const h of buscar(LLAMADAS, { incluirGlobal: true })) {
  const [, literal, variable] = new RegExp(LLAMADAS.source).exec(h.texto) || [];
  if (literal ? acciones.has(literal) : !h.texto.includes('(')) continue;
  if (literal) hallAccion.push({ ...h, texto: literal });
  else hallAccion.push({ ...h, texto: variable || h.texto, motivo: h.archivo === 'usuarios/Whatsapp_Dialogo.html' ? 'recibe la acción de quien abre el diálogo, que sí se comprueba' : undefined });
}
anotar('accion', 'llamar() a acciones que no están en ACCIONES', hallAccion, acciones.size ? '' : 'NO SE HA PODIDO LEER accesoAcciones_');

// Regla de transición: una función renombrada con _ ya no se puede llamar por su nombre antiguo, ni en el navegador ni en el servidor.
const renombradas = [...acciones].filter(([n, fn]) => fn === n + '_').map(([n]) => n);
anotar('antigua', 'Llamadas por el nombre antiguo a funciones ya privadas', renombradas.length ? buscar(new RegExp(`(?<![\\w'])(?:${renombradas.join('|')})\\(`, 'g'), { incluirGlobal: true }) : []);

anotar('local', 'Nombres locales que tapan llamar()', buscar(/(?:\bfunction\s+|\b(?:var|let|const)\s+)llamar\b/g, { incluirGlobal: true }));

// ===== Informe =====
const grupos = [
  ['A. Medición final (sección 13)', ['hex', 'color', 'prefijo', 'variable', 'girador', 'keyframes', 'esquina', 'capa', 'curva', 'tema', 'onda', 'sombra', 'tiempo', 'letra', 'contorno', 'id', 'lf', 'js']],
  ['B. Reglas propias que tapan lo común', ['tapa', 'dentro', 'icono', 'foco', 'reinicio', 'fuga']],
  ['C. Una sola puerta (sección 17)', ['puerta', 'publica', 'propietario', 'accion', 'antigua', 'local']],
];
let totalRevisar = 0;
console.log(`Comprobación de coherencia · ${codigo.length} archivos · ${reglas.length} reglas de estilo · ${piezas.size} clases comunes · ${paginas.size} páginas`);
for (const [titulo, ids] of grupos) {
  console.log(`\n${titulo}`);
  for (const id of ids) {
    const r = resultados.find(x => x.c === id);
    totalRevisar += r.revisar.length + (r.nota ? 1 : 0);
    const permitido = r.permitidos.length ? ` (más ${r.permitidos.length} permitidos)` : '';
    console.log(`  [${r.revisar.length || r.nota ? 'REVISAR' : 'OK'}] ${r.titulo}: ${r.revisar.length}${permitido}${r.nota ? ' · ' + r.nota : ''}`);
    for (const h of r.revisar) console.log(`      ${h.archivo}:${h.linea}  ${h.texto}`);
    if (DETALLE) for (const h of r.permitidos) console.log(`      permitido ${h.archivo}:${h.linea}  ${h.texto}  → ${h.motivo}`);
  }
}
console.log(totalRevisar ? `\nResultado: ${totalRevisar} cosas que revisar.` : '\nResultado: todo en orden.');
process.exitCode = totalRevisar ? 1 : 0;
