// =====================================================================================
// agenda/Disponibilidad.gs
// DISPONIBILIDAD DE LA AGENDA: horas CERRADAS (en las que no se dan citas) aunque existan como hueco en la hoja de la Agenda.
//
// La hoja de la Agenda se genera con todos los huecos posibles (mañana 08:00–14:00, tarde 16:00–20:00, cada 30 min), pero el horario
// real del servicio cambia según la época. Aquí se guarda qué horas están cerradas en cada fecha; todo lo demás sigue abierto.
// Sin ninguna fila para una fecha, esa fecha queda exactamente como siempre (todo abierto).
//
// Se gestiona desde la web app: Agenda → menú ⋮ → Disponibilidad (agenda/Panel_Disponibilidad.html). No hay que tocar Sheets.
//
// Dónde se respeta una hora cerrada (solo si está LIBRE; una cita ya puesta en esa hora nunca se esconde):
//   · Agenda web (obtenerAgendaSemanaWeb): el hueco no se devuelve → no se ve, no cuenta como libre y no se puede arrastrar a él.
//   · Formulario de cita (obtenerSemanasYHuecos): el hueco no se ofrece.
//   · Copiar a la siguiente cita (_prepararCopiaCita): no se copia a una hora cerrada (error claro).
//
// Almacén: hoja "Disponibilidad" (se crea sola al aplicar por primera vez), una fila por fecha con alguna hora cerrada:
//   Fecha (texto "yyyy-MM-dd") | Horas cerradas (texto "08:00,08:30,...")
// =====================================================================================

const HOJA_DISPONIBILIDAD_ = 'Disponibilidad';
const CABECERAS_DISPONIBILIDAD_ = ['Fecha', 'Horas cerradas'];
const MAX_DIAS_DISPONIBILIDAD_ = 400;
let _cacheDisponibilidad_ = null; // lectura memorizada durante UNA ejecución (cada llamada del navegador es una ejecución nueva)

function _obtenerHojaDisponibilidad_(crear) {
  const ss = getSS();
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

/** Para el panel: las horas cerradas de cada fecha entre desde y hasta (solo las fechas que tienen alguna). */
function obtenerDisponibilidadWeb(desdeISO, hastaISO) {
  try {
    if (!_esFechaISO_(desdeISO) || !_esFechaISO_(hastaISO)) return { success: false, message: 'Fechas no válidas.' };
    const mapa = leerDisponibilidad_();
    const cerrados = {};
    Object.keys(mapa).forEach(f => { if (f >= desdeISO && f <= hastaISO) cerrados[f] = mapa[f]; });
    return { success: true, cerrados: cerrados };
  } catch (e) {
    Logger.log('Error en obtenerDisponibilidadWeb: ' + e.message);
    return { success: false, message: e.message };
  }
}

/**
 * Fija las horas cerradas de TODAS las fechas del rango que caigan en los días de la semana elegidos (sustituye lo que hubiera).
 * Con `cerrados` vacío, esas fechas vuelven a quedar todo abierto.
 * @param {{desde: string, hasta: string, dias: number[], cerrados: string[]}} datos  fechas "yyyy-MM-dd", dias 1=lunes … 5=viernes
 * @return {{success: boolean, message?: string, mensaje?: string, dias?: number, cerradas?: number, citasEnHorasCerradas?: number}}
 */
function aplicarDisponibilidadWeb(datos) {
  const lock = LockService.getScriptLock();
  try {
    datos = datos || {};
    const desde = datos.desde, hasta = datos.hasta;
    if (!_esFechaISO_(desde) || !_esFechaISO_(hasta) || desde > hasta) {
      return { success: false, message: 'Revisa las fechas: «Desde» no puede ser posterior a «Hasta».' };
    }
    const dias = (Array.isArray(datos.dias) ? datos.dias : []).map(Number).filter(d => d >= 1 && d <= 5);
    if (!dias.length) return { success: false, message: 'Elige al menos un día de la semana.' };
    const cerradas = _normalizarHoras_(datos.cerrados);
    const fechas = _fechasDelRango_(desde, hasta, dias);
    if (!fechas.length) return { success: false, message: 'Ese rango no incluye ninguno de los días de la semana elegidos.' };
    if (fechas.length > MAX_DIAS_DISPONIBILIDAD_) {
      return { success: false, message: 'El rango es demasiado largo (máximo ' + MAX_DIAS_DISPONIBILIDAD_ + ' días a la vez).' };
    }

    lock.waitLock(20000);
    const hoja = _obtenerHojaDisponibilidad_(true);
    _cacheDisponibilidad_ = null;
    const mapa = leerDisponibilidad_();
    fechas.forEach(f => { if (cerradas.length) mapa[f] = cerradas.slice(); else delete mapa[f]; });
    _escribirDisponibilidad_(hoja, mapa);
    _cacheDisponibilidad_ = null;
    invalidarCacheAgenda_(obtenerHojaAgenda()); // la Agenda web (y las demás pestañas abiertas) deben recalcular la semana

    const afectadas = cerradas.length ? _contarCitasEnHorasCerradas_(mapa, fechas) : 0;
    let mensaje = cerradas.length
      ? cerradas.length + ' hora(s) cerrada(s) en ' + fechas.length + ' día(s).'
      : 'Todas las horas abiertas en ' + fechas.length + ' día(s).';
    if (afectadas > 0) mensaje += ' Hay ' + afectadas + ' cita(s) puestas en horas cerradas: se mantienen.';
    return { success: true, mensaje: mensaje, dias: fechas.length, cerradas: cerradas.length, citasEnHorasCerradas: afectadas };
  } catch (e) {
    Logger.log('Error en aplicarDisponibilidadWeb: ' + e.message);
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
  const sheet = obtenerHojaAgenda();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => h.toString().trim());
  const cF = headers.indexOf(COLUMNAS.AGENDA.FECHA), cH = headers.indexOf(COLUMNAS.AGENDA.HORA), cU = headers.indexOf(COLUMNAS.AGENDA.USUARIO);
  if (cF === -1 || cH === -1 || cU === -1) return 0;
  const tz = Session.getScriptTimeZone();
  const enRango = {};
  fechas.forEach(f => { enRango[f] = true; });
  const col = c => sheet.getRange(2, c + 1, lastRow - 1, 1).getValues();
  const F = col(cF), H = col(cH), U = col(cU);
  let n = 0;
  for (let i = 0; i < F.length; i++) {
    if (!(F[i][0] instanceof Date) || !(H[i][0] instanceof Date)) continue;
    const usuario = U[i][0];
    if (!(usuario && usuario.toString().trim() !== '')) continue;
    const iso = Utilities.formatDate(F[i][0], tz, 'yyyy-MM-dd');
    if (enRango[iso] && disponibilidadCerrada_(mapa, iso, Utilities.formatDate(H[i][0], tz, 'HH:mm'))) n++;
  }
  return n;
}
