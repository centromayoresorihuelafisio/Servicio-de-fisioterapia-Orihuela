// =====================================================================================
// agenda/Disponibilidad.gs
// DISPONIBILIDAD DE LA AGENDA: horas CERRADAS (en las que no se dan citas) aunque existan como hueco en la parrilla de la Agenda.
//
// La parrilla de la Agenda tiene todos los huecos posibles (mañana 08:00–14:00, tarde 16:00–20:00, cada 30 min), pero el horario
// real del servicio cambia según la época. Aquí se guarda qué horas están cerradas en cada fecha; todo lo demás sigue abierto.
// Sin ninguna fila para una fecha, esa fecha queda exactamente como siempre (todo abierto).
//
// Se gestiona desde la web app: Agenda → menú ⋮ → Disponibilidad (agenda/Panel_Disponibilidad.html). No hay que tocar Sheets.
// Admite uno o varios horarios a la vez (p. ej. lunes–jueves y viernes distintos) y «días cerrados» completos (festivos, bajas).
//
// Dónde se respeta una hora cerrada (solo si está LIBRE; una cita ya puesta en esa hora nunca se esconde):
//   · Agenda web (obtenerAgendaSemanaWeb → Web_Semana_Citas.gs): el hueco no se devuelve → no se ve, no cuenta como libre y no se puede arrastrar a él.
//   · Formulario de cita (obtenerSemanasYHuecos): el hueco no se ofrece.
//   · Copiar a la siguiente cita (copiarVariasDesdeCitasWeb_): no se copia a una hora cerrada (error claro).
//
// Almacén: hoja "Disponibilidad" (se crea sola al aplicar por primera vez), una fila por fecha con alguna hora cerrada:
//   Fecha (texto "yyyy-MM-dd") | Horas cerradas (texto "08:00,08:30,...")
// =====================================================================================

const HOJA_DISPONIBILIDAD_ = 'Disponibilidad';
const CABECERAS_DISPONIBILIDAD_ = ['Fecha', 'Horas cerradas'];
const MAX_DIAS_DISPONIBILIDAD_ = 400;
let _cacheDisponibilidad_ = null; // lectura memorizada durante UNA ejecución (cada llamada del navegador es una ejecución nueva)

function _obtenerHojaDisponibilidad_(crear) {
  const ss = getSS_();
  let hoja = ss.getSheetByName(HOJA_DISPONIBILIDAD_);
  if (!hoja && crear) {
    hoja = ss.insertSheet(HOJA_DISPONIBILIDAD_);
    hoja.getRange(1, 1, 1, CABECERAS_DISPONIBILIDAD_.length).setValues([CABECERAS_DISPONIBILIDAD_]).setFontWeight('bold');
    hoja.setFrozenRows(1);
  }
  return hoja;
}

function _esFechaISO_(t) {
  return typeof t === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t) && !isNaN(new Date(t + 'T00:00:00').getTime());
}

/** "8:00" o "08:00" → "08:00" (la Agenda usa H:mm en unos sitios y HH:mm en otros). '' si no es una hora válida. */
function _horaHHmm_(t) {
  const m = /^(\d{1,2}):(\d{2})$/.exec((t == null ? '' : t).toString().trim());
  if (!m || +m[1] > 23 || +m[2] > 59) return '';
  return (m[1].length === 1 ? '0' : '') + m[1] + ':' + m[2];
}

function _normalizarHoras_(lista) {
  const vistas = {};
  (Array.isArray(lista) ? lista : []).forEach(h => { const n = _horaHHmm_(h); if (n) vistas[n] = true; });
  return Object.keys(vistas).sort();
}

/** Todas las fechas "yyyy-MM-dd" entre desde y hasta (incluidas) cuyo día de la semana (1=lunes … 5=viernes) esté en `dias`. */
function _fechasDelRango_(desde, hasta, dias) {
  const p = desde.split('-').map(Number);
  const fin = hasta.split('-').map(Number);
  const limite = new Date(fin[0], fin[1] - 1, fin[2]).getTime();
  const fechas = [];
  for (let i = 0; i <= MAX_DIAS_DISPONIBILIDAD_ + 400; i++) { // tope de seguridad; el rango se valida fuera
    const d = new Date(p[0], p[1] - 1, p[2] + i);
    if (d.getTime() > limite) break;
    if (dias.indexOf(d.getDay()) !== -1) {
      fechas.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'));
    }
  }
  return fechas;
}

/** Lee la hoja y devuelve { "yyyy-MM-dd": ["08:00", ...] }. Si la hoja aún no existe, devuelve {} (no la crea). */
function leerDisponibilidad_() {
  if (_cacheDisponibilidad_) return _cacheDisponibilidad_;
  const mapa = {};
  const hoja = _obtenerHojaDisponibilidad_(false);
  if (hoja && hoja.getLastRow() >= 2) {
    const tz = Session.getScriptTimeZone();
    hoja.getRange(2, 1, hoja.getLastRow() - 1, 2).getValues().forEach(f => {
      let fecha = f[0];
      if (fecha instanceof Date) fecha = Utilities.formatDate(fecha, tz, 'yyyy-MM-dd'); // por si Sheets la convirtió en fecha
      fecha = (fecha == null ? '' : fecha).toString().trim();
      if (!_esFechaISO_(fecha)) return;
      const horas = _normalizarHoras_((f[1] == null ? '' : f[1]).toString().split(','));
      if (horas.length) mapa[fecha] = horas;
    });
  }
  _cacheDisponibilidad_ = mapa;
  return mapa;
}

/** ¿Está cerrada esa hora ese día? `fechaISO` = "yyyy-MM-dd"; `hora` = "8:00" o "08:00". */
function disponibilidadCerrada_(mapa, fechaISO, hora) {
  const horas = mapa && mapa[fechaISO];
  if (!horas) return false;
  return horas.indexOf(_horaHHmm_(hora)) !== -1;
}

/** Para el panel: las horas cerradas de cada fecha entre desde y hasta (solo las fechas que tienen alguna) y las horas que ya tienen cita. */
function obtenerDisponibilidadWeb_(desdeISO, hastaISO) {
  try {
    if (!_esFechaISO_(desdeISO) || !_esFechaISO_(hastaISO)) return { success: false, message: 'Fechas no válidas.' };
    const mapa = leerDisponibilidad_();
    const cerrados = {};
    Object.keys(mapa).forEach(f => { if (f >= desdeISO && f <= hastaISO) cerrados[f] = mapa[f]; });
    return { success: true, cerrados: cerrados, citas: _citasPorFecha_(desdeISO, hastaISO) };
  } catch (e) {
    Logger.log('Error en obtenerDisponibilidadWeb_: ' + e.message);
    return { success: false, message: e.message };
  }
}

/** "Lun–Jue", "Vie", "Lun, Mié"… para los mensajes cuando hay más de un horario. */
function _etiquetaDias_(dias) {
  const N = { 1: 'Lun', 2: 'Mar', 3: 'Mié', 4: 'Jue', 5: 'Vie' };
  const d = dias.slice().sort();
  const seguidos = d.every((x, i) => i === 0 || x === d[i - 1] + 1);
  return (seguidos && d.length > 1) ? N[d[0]] + '–' + N[d[d.length - 1]] : d.map(x => N[x]).join(', ');
}

/** Las 20 horas de la parrilla de la Agenda (mañana 08:00–14:00, tarde 16:00–20:00, cada 30 min): lo que se cierra al cerrar un día completo. */
function _horasDeLaParrilla_() {
  const out = [];
  const pon = (m) => out.push(String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'));
  for (let m = 8 * 60; m < 14 * 60; m += 30) pon(m);
  for (let m = 16 * 60; m < 20 * 60; m += 30) pon(m);
  return out;
}

/** Horas con cita por fecha entre desde y hasta: { "yyyy-MM-dd": ["08:30", ...] } (una entrada por cita). Si falla la lectura, {} (el panel solo pierde el aviso). */
function _citasPorFecha_(desdeISO, hastaISO) {
  const out = {};
  try {
    citasLeer_().forEach(c => {
      if (!c || !c.fecha || c.fecha < desdeISO || c.fecha > hastaISO || !c.hora) return;
      const h = _horaHHmm_(c.hora);
      if (h) (out[c.fecha] = out[c.fecha] || []).push(h);
    });
  } catch (e) {
    Logger.log('Aviso en _citasPorFecha_: ' + e.message);
  }
  return out;
}

/** Valida la lista de días a cerrar por completo: solo fechas válidas de lunes a viernes. → { error, lista (ordenada, sin repetidos) } */
function _normalizarDiasCerrados_(lista) {
  const vistos = {};
  const arr = Array.isArray(lista) ? lista : [];
  for (let i = 0; i < arr.length; i++) {
    const f = (arr[i] == null ? '' : arr[i]).toString().trim();
    if (!_esFechaISO_(f)) return { error: 'Hay un día cerrado con una fecha no válida.', lista: [] };
    const d = new Date(f + 'T00:00:00').getDay();
    if (d < 1 || d > 5) return { error: 'Solo se pueden cerrar días de lunes a viernes (' + f + ').', lista: [] };
    vistos[f] = true;
  }
  return { error: '', lista: Object.keys(vistos).sort() };
}

/**
 * Fija las horas cerradas de las fechas del rango que caigan en los días de la semana elegidos (sustituye lo que hubiera).
 * Admite UNO o VARIOS horarios a la vez (p. ej. lunes–jueves con un horario y viernes con otro) y, además, `diasCerrados`:
 * fechas concretas que se cierran por completo (se aplican al final, así que mandan sobre el horario del rango).
 * Con `cerrados` vacío en un horario, esas fechas vuelven a quedar todo abierto.
 * Si solo se envía `diasCerrados` (con `horarios: []`), no se toca ningún otro horario y no hacen falta `desde`/`hasta`.
 * @param {{desde?: string, hasta?: string, horarios?: Array<{dias: number[], cerrados: string[]}>, dias?: number[], cerrados?: string[], diasCerrados?: string[]}} datos
 *   fechas "yyyy-MM-dd", dias 1=lunes … 5=viernes. Formato antiguo (dias + cerrados, un solo horario) también aceptado.
 * @return {{success: boolean, message?: string, mensaje?: string, dias?: number, cerradas?: number, citasEnHorasCerradas?: number}}
 */
function aplicarDisponibilidadWeb_(datos) {
  const lock = LockService.getScriptLock();
  try {
    datos = datos || {};
    const cerrarDias = _normalizarDiasCerrados_(datos.diasCerrados);
    if (cerrarDias.error) return { success: false, message: cerrarDias.error };
    const soloDias = cerrarDias.lista.length > 0 && Array.isArray(datos.horarios) && datos.horarios.length === 0;
    const asignaciones = [];   // [{ etiqueta, fechas, cerradas, completo? }]

    if (!soloDias) {
      const desde = datos.desde, hasta = datos.hasta;
      if (!_esFechaISO_(desde) || !_esFechaISO_(hasta) || desde > hasta) {
        return { success: false, message: 'Revisa las fechas: «Desde» no puede ser posterior a «Hasta».' };
      }
      const horarios = Array.isArray(datos.horarios) ? datos.horarios : [{ dias: datos.dias, cerrados: datos.cerrados }];
      const usados = {};
      for (let i = 0; i < horarios.length; i++) {
        const h = horarios[i] || {};
        const dias = (Array.isArray(h.dias) ? h.dias : []).map(Number).filter(d => d >= 1 && d <= 5);
        if (!dias.length) continue;
        for (let j = 0; j < dias.length; j++) {
          if (usados[dias[j]]) return { success: false, message: 'Un mismo día de la semana no puede tener dos horarios distintos.' };
          usados[dias[j]] = true;
        }
        const fechasG = _fechasDelRango_(desde, hasta, dias);
        if (fechasG.length) asignaciones.push({ etiqueta: _etiquetaDias_(dias), fechas: fechasG, cerradas: _normalizarHoras_(h.cerrados) });
      }
      if (!Object.keys(usados).length) return { success: false, message: 'Elige al menos un día de la semana.' };
      if (!asignaciones.length) return { success: false, message: 'Ese rango no incluye ninguno de los días de la semana elegidos.' };
    }
    // Los días cerrados van los últimos: si coinciden con una fecha del rango, mandan ellos.
    if (cerrarDias.lista.length) asignaciones.push({ etiqueta: 'Días cerrados', fechas: cerrarDias.lista, cerradas: _horasDeLaParrilla_(), completo: true });

    const unicas = {};
    asignaciones.forEach(a => a.fechas.forEach(f => { unicas[f] = true; }));
    const todas = Object.keys(unicas);
    if (todas.length > MAX_DIAS_DISPONIBILIDAD_) {
      return { success: false, message: 'Son demasiados días a la vez (máximo ' + MAX_DIAS_DISPONIBILIDAD_ + ').' };
    }

    lock.waitLock(20000);
    const hoja = _obtenerHojaDisponibilidad_(true);
    _cacheDisponibilidad_ = null;
    const mapa = leerDisponibilidad_();
    asignaciones.forEach(a => a.fechas.forEach(f => { if (a.cerradas.length) mapa[f] = a.cerradas.slice(); else delete mapa[f]; }));
    _escribirDisponibilidad_(hoja, mapa);
    _cacheDisponibilidad_ = null;
    citasInvalidarCache_();   // sube la versión de "Citas": la Agenda web (y las demás pestañas abiertas) recalculan la semana

    const algunaCerrada = asignaciones.some(a => a.cerradas.length);
    const afectadas = algunaCerrada ? _contarCitasEnHorasCerradas_(mapa, todas) : 0;
    let mensaje = asignaciones.map(a => {
      if (a.completo) return 'Cerrado el día completo en ' + a.fechas.length + ' día(s).';
      const txt = a.cerradas.length
        ? a.cerradas.length + ' hora(s) cerrada(s) en ' + a.fechas.length + ' día(s).'
        : 'Todas las horas abiertas en ' + a.fechas.length + ' día(s).';
      return asignaciones.length > 1 ? a.etiqueta + ': ' + txt : txt;
    }).join(' ');
    if (afectadas > 0) mensaje += ' Hay ' + afectadas + ' cita(s) puestas en horas cerradas: se mantienen.';
    const primero = asignaciones.filter(a => !a.completo)[0];
    return { success: true, mensaje: mensaje, dias: todas.length, cerradas: primero ? primero.cerradas.length : 0, citasEnHorasCerradas: afectadas };
  } catch (e) {
    Logger.log('Error en aplicarDisponibilidadWeb_: ' + e.message);
    return { success: false, message: 'No se pudo guardar: ' + e.message };
  } finally {
    try { lock.releaseLock(); } catch (e2) { /* no se llegó a obtener el bloqueo */ }
  }
}

/** Reescribe la hoja entera con el mapa (ordenado por fecha). Texto plano para que Sheets no convierta nada. */
function _escribirDisponibilidad_(hoja, mapa) {
  const filas = Object.keys(mapa).sort().map(f => [f, mapa[f].join(',')]);
  const maxFilas = Math.max(hoja.getMaxRows() - 1, 1);
  hoja.getRange(2, 1, maxFilas, CABECERAS_DISPONIBILIDAD_.length).clearContent();
  if (!filas.length) return;
  if (hoja.getMaxRows() < filas.length + 1) hoja.insertRowsAfter(hoja.getMaxRows(), filas.length + 1 - hoja.getMaxRows());
  hoja.getRange(2, 1, filas.length, CABECERAS_DISPONIBILIDAD_.length).setNumberFormat('@').setValues(filas);
}

/** Cuántas citas YA puestas caen en horas cerradas de esas fechas (se mantienen; solo se avisa). */
function _contarCitasEnHorasCerradas_(mapa, fechas) {
  const enRango = {};
  fechas.forEach(f => { enRango[f] = true; });
  return citasLeer_().filter(c => enRango[c.fecha] && c.hora && disponibilidadCerrada_(mapa, c.fecha, c.hora)).length;
}
