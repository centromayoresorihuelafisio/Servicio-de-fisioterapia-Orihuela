// comprobar/copias.mjs
// Prueba fuera de Google de core/Copias_Seguridad.gs (CONTEXTO.md, sección 21): carga el archivo con imitaciones
// sencillas de DriveApp, ScriptApp, MailApp, etc. y comprueba carpeta, nombres, poda, activador sin duplicados,
// que la función del activador no la pueda lanzar cualquiera y el correo si falla. Uso: node comprobar/copias.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const codigo = readFileSync(path.join(raiz, 'core/Copias_Seguridad.gs'), 'utf8');

let fallos = 0, pruebas = 0;
function ok(cond, texto) {
  pruebas++;
  if (cond) console.log('  [OK] ' + texto);
  else { fallos++; console.log('  [FALLA] ' + texto); }
}

function iterador(lista) { let i = 0; return { hasNext: () => i < lista.length, next: () => lista[i++] }; }

/** Un mundo nuevo para cada prueba: Drive, activadores, propiedades, correos y registro imitados. */
function mundo({ fallaCopia = false } = {}) {
  let reloj = Date.UTC(2026, 10, 1, 2, 0);   // 1-nov-2026, 03:00 en Madrid
  let siguienteId = 1;
  const carpetas = [], archivos = [], activadores = [], correos = [], registro = [], props = {};

  function nuevoArchivo(nombre, carpeta, fecha) {
    const a = { id: 'f' + siguienteId++, nombre, carpeta, papelera: false, creado: new Date(fecha ?? reloj),
      getName() { return this.nombre; }, getId() { return this.id; }, isTrashed() { return this.papelera; },
      setTrashed(v) { this.papelera = v; }, getDateCreated() { return this.creado; }, getUrl() { return 'https://drive/' + this.id; },
      makeCopy(nombre, destino) { if (fallaCopia) throw new Error('Drive no responde'); return nuevoArchivo(nombre, destino); } };
    archivos.push(a);
    return a;
  }
  function nuevaCarpeta(nombre) {
    const c = { id: 'd' + siguienteId++, nombre, papelera: false,
      getId() { return this.id; }, isTrashed() { return this.papelera; }, getUrl() { return 'https://drive/carpeta/' + this.id; },
      getFiles() { return iterador(archivos.filter(a => a.carpeta === c && !a.papelera)); } };
    carpetas.push(c);
    return c;
  }
  const hoja = nuevoArchivo('Base de datos fisio', null);

  const ctx = {
    console: { error: () => {}, log: () => {} },
    PROP_KEYS: { COPIAS_CARPETA: 'COPIAS_CARPETA' },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] ?? null, setProperty: (k, v) => { props[k] = v; } }) },
    DriveApp: {
      getFolderById: id => { const c = carpetas.find(x => x.id === id); if (!c) throw new Error('no existe'); return c; },
      getFoldersByName: n => iterador(carpetas.filter(c => c.nombre === n)),
      createFolder: n => nuevaCarpeta(n),
      getFileById: id => archivos.find(a => a.id === id),
    },
    SpreadsheetApp: { flush: () => {} },
    getSS_: () => ({ getId: () => hoja.id, getOwner: () => ({ getEmail: () => 'duena@ejemplo.es' }) }),
    Utilities: { formatDate: (d, tz, f) => {
      const p = new Intl.DateTimeFormat('es-ES', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
        .formatToParts(d).reduce((o, x) => (o[x.type] = x.value, o), {});
      return f.replace('yyyy', p.year).replace('MM', p.month).replace('dd', p.day).replace('HH', p.hour).replace('mm', p.minute);
    } },
    Session: { getScriptTimeZone: () => 'Europe/Madrid', getEffectiveUser: () => ({ getEmail: () => 'duena@ejemplo.es' }) },
    ScriptApp: {
      WeekDay: { SUNDAY: 'SUNDAY' },
      getProjectTriggers: () => activadores.slice(),
      deleteTrigger: t => activadores.splice(activadores.indexOf(t), 1),
      newTrigger: fn => {
        const t = { fn, uid: 'act' + siguienteId++, getHandlerFunction() { return this.fn; }, getUniqueId() { return this.uid; } };
        const b = { timeBased: () => b, onWeekDay: d => { t.dia = d; return b; }, atHour: h => { t.hora = h; return b; }, create: () => { activadores.push(t); return t; } };
        return b;
      },
    },
    MailApp: { sendEmail: (a, asunto, cuerpo) => correos.push({ a, asunto, cuerpo }) },
    conBloqueoScript_: fn => fn(),
    registroAnotar_: (...a) => registro.push(a),
    soloPropietario_: () => {},
    Logger: { log: () => {} },
  };
  vm.createContext(ctx);
  vm.runInContext(codigo + '\n;globalThis.__f = { copiasCarpeta_, copiasNombre_, copiasListar_, copiasPodar_, copiasHacer_, copiaSeguridadSemanal, copiasInstalarActivador_, copiasQuitarActivador_, copiasEstado_, copiasActivar_, copiasHacerAhora_, COPIAS_GUARDAR_, COPIAS_PREFIJO_, COPIAS_CARPETA_NOMBRE_ };', ctx);
  return { f: ctx.__f, carpetas, archivos, activadores, correos, registro, props, nuevoArchivo, nuevaCarpeta,
    avanzar: ms => { reloj += ms; }, ctx };
}

const SEMANA = 7 * 24 * 3600 * 1000;

console.log('Carpeta');
{
  const m = mundo();
  ok(m.f.copiasCarpeta_(false) === null, 'sin crear, si no hay carpeta, devuelve null y no crea nada');
  ok(m.carpetas.length === 0, '… y no hay carpetas');
  const c = m.f.copiasCarpeta_(true);
  ok(m.carpetas.length === 1 && c.nombre === m.f.COPIAS_CARPETA_NOMBRE_, 'la crea con su nombre');
  ok(m.props.COPIAS_CARPETA === c.id, 'guarda su ID');
  ok(m.f.copiasCarpeta_(true) === c && m.carpetas.length === 1, 'la segunda vez la reutiliza');
  c.papelera = true;
  const c2 = m.f.copiasCarpeta_(true);
  ok(c2 !== c && m.props.COPIAS_CARPETA === c2.id, 'si está en la papelera, crea otra y guarda el ID nuevo');
}
{
  const m = mundo();
  const hecha = m.nuevaCarpeta(m.f.COPIAS_CARPETA_NOMBRE_);
  ok(m.f.copiasCarpeta_(true) === hecha && m.carpetas.length === 1, 'si ya existe con ese nombre (p. ej. hecha a mano), la usa');
}

console.log('Nombres');
{
  const m = mundo();
  const n = m.f.copiasNombre_(new Date(Date.UTC(2026, 10, 15, 2, 5)), 'semanal');
  ok(n === 'Copia Fisioterapia Orihuela 2026-11-15 03.05', 'semanal, con fecha y hora de Madrid: ' + n);
  ok(m.f.copiasNombre_(new Date(Date.UTC(2026, 10, 15, 2, 5)), 'manual').endsWith(' (a mano)'), 'la manual lleva «(a mano)»');
}

console.log('Copias y poda');
{
  const m = mundo();
  const c = m.f.copiasCarpeta_(true);
  const ajeno = m.nuevoArchivo('Notas mías.txt', c);   // otro archivo en la carpeta: nunca se toca
  const nombres = [];
  for (let i = 0; i < 11; i++) { nombres.push(m.f.copiasHacer_('semanal').nombre); m.avanzar(SEMANA); }
  const vivas = m.f.copiasListar_(c);
  ok(vivas.length === m.f.COPIAS_GUARDAR_, 'tras 11 semanas quedan ' + m.f.COPIAS_GUARDAR_ + ' copias');
  ok(vivas[0].nombre === nombres[10] && vivas.at(-1).nombre === nombres[3], 'quedan las más nuevas, ordenadas de nueva a vieja');
  const papelera = m.archivos.filter(a => a.papelera);
  ok(papelera.length === 3 && papelera.every(a => nombres.slice(0, 3).includes(a.nombre)), 'las 3 más viejas van a la papelera (no se borran del todo)');
  ok(!ajeno.papelera, 'un archivo que no es una copia no se toca');
  ok(m.archivos.every(a => a.carpeta === c || a.carpeta === null), 'todas las copias van a la carpeta');
  const r = m.f.copiasHacerAhora_();
  ok(r.hecha && r.hecha.nombre.endsWith('(a mano)') && r.hecha.borradas === 1, 'la copia a mano cuenta y poda una más');
  ok(r.copias.length === m.f.COPIAS_GUARDAR_ && r.copias[0].fecha && r.copias[0].url, 'el estado trae la lista con fecha y enlace');
}

console.log('Activador');
{
  const m = mundo();
  m.f.copiasInstalarActivador_();
  m.f.copiasInstalarActivador_();
  m.f.copiasActivar_(true);
  ok(m.activadores.length === 1, 'instalarlo tres veces deja un solo activador');
  ok(m.activadores[0].fn === 'copiaSeguridadSemanal' && m.activadores[0].dia === 'SUNDAY' && m.activadores[0].hora === 3, 'semanal, domingos a las 3');
  ok(m.carpetas.length === 1, 'al activarlo ya se crea la carpeta');
  const otro = m.ctx.ScriptApp.newTrigger('otraCosa').timeBased().create();
  m.f.copiasInstalarActivador_();
  ok(m.activadores.includes(otro) && m.activadores.length === 2, 'no toca activadores de otras funciones');
  ok(m.f.copiasEstado_().activa === true, 'el estado dice activada');
  const e = m.f.copiasActivar_(false);
  ok(e.activa === false && m.activadores.length === 1 && m.activadores[0] === otro, 'desactivar quita solo el de copias');
}

console.log('Función del activador');
{
  const m = mundo();
  let error = '';
  try { m.f.copiaSeguridadSemanal(); } catch (e) { error = e.message; }
  ok(error && m.archivos.length === 1, 'sin aviso de activador, no hace nada y da error');
  error = '';
  try { m.f.copiaSeguridadSemanal({ triggerUid: 'inventado' }); } catch (e) { error = e.message; }
  ok(error && m.archivos.length === 1, 'con un número de activador inventado, tampoco');
  m.f.copiasInstalarActivador_();
  m.f.copiaSeguridadSemanal({ triggerUid: m.activadores[0].uid });
  ok(m.archivos.length === 2 && m.registro.at(-1)[2] === 'copia_seguridad' && m.registro.at(-1)[5] === 'ok', 'con el activador de verdad hace la copia y lo anota en Registro');
  ok(m.correos.length === 0, 'si va bien, no manda correo');
}
{
  const m = mundo({ fallaCopia: true });
  m.f.copiasInstalarActivador_();
  let error = '';
  try { m.f.copiaSeguridadSemanal({ triggerUid: m.activadores[0].uid }); } catch (e) { error = e.message; }
  ok(!error, 'si la copia falla, la función no revienta');
  ok(m.correos.length === 1 && m.correos[0].a === 'duena@ejemplo.es' && m.correos[0].cuerpo.includes('Drive no responde'), 'manda un correo a la propietaria con el motivo');
  ok(m.registro.at(-1)[5] === 'error', 'y lo anota como error en Registro');
  error = '';
  try { m.f.copiasHacerAhora_(); } catch (e) { error = e.message; }
  ok(error === 'Drive no responde' && m.correos.length === 1, 'la copia a mano que falla da el error en pantalla, sin correo');
}

console.log(`\n${pruebas - fallos} de ${pruebas} pruebas bien.`);
process.exit(fallos ? 1 : 0);
