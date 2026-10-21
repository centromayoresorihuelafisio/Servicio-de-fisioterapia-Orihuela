// ================================================================================
// agenda/Recordatorios.gs
// Recordatorios genéricos de la Agenda Web: llamar a un usuario, una reunión, un
// evento, una nota suelta, un festivo… Viven en su propia hoja "Recordatorios" (se crea sola
// al guardar el primero), así que no tocan ni la hoja de Agenda ni la de Eventos.
//
// Columnas: ID | Fecha | Hora | Tipo | Texto | Hecho
//   · Fecha y Hora son opcionales (un recordatorio sin fecha es una tarea suelta).
//   · Hecho = "Sí" cuando está completado, vacío si sigue pendiente.
//
// Todas las funciones *Web devuelven { success, recordatorios } con la lista
// COMPLETA ya actualizada, de modo que el cliente nunca tiene que "fusionar" nada.
// ================================================================================

// 'Festivo' marca un día entero en la Agenda (no es una tarea: no se completa ni caduca).
const RECORDATORIO_TIPOS_ = ['Llamar', 'Reunión', 'Evento', 'Nota', 'Festivo'];
const RECORDATORIO_CABECERAS_ = ['ID', 'Fecha', 'Hora', 'Tipo', 'Texto', 'Hecho'];

/** Devuelve la hoja de recordatorios; si no existe y `crear` es true, la crea. */
function obtenerHojaRecordatorios_(crear) {
  const ss = getSS();
  let sheet = ss.getSheetByName(SHEETS.RECORDATORIOS);
  if (sheet || !crear) return sheet;

  sheet = ss.insertSheet(SHEETS.RECORDATORIOS);
  sheet.getRange(1, 1, 1, RECORDATORIO_CABECERAS_.length)
    .setValues([RECORDATORIO_CABECERAS_])
    .setFontWeight('bold')
    .setBackground('#F1F5F9');
  sheet.setFrozenRows(1);
  sheet.setTabColor('#F0C14B');
  sheet.getRange('B2:B').setNumberFormat('dd/MM/yyyy');
  sheet.getRange('C2:C').setNumberFormat('@');   // la hora se guarda como texto "HH:mm"
  sheet.setColumnWidth(1, 90);
  sheet.setColumnWidth(5, 380);
  return sheet;
}

/** "yyyy-MM-dd" → Date a medianoche (zona del script), o '' si viene vacía, o null si no es válida. */
function parsearFechaRecordatorio_(iso) {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}

function normalizarHoraRecordatorio_(valor, tz) {
  if (valor instanceof Date) return Utilities.formatDate(valor, tz, 'HH:mm');   // por si se teclea a mano en Sheets
  const m = /^(\d{1,2}):(\d{2})/.exec(String(valor || '').trim());
  return m ? ('0' + m[1]).slice(-2) + ':' + m[2] : '';
}

/** Lee todos los recordatorios de la hoja como objetos listos para el cliente. */
function leerRecordatorios_(sheet) {
  if (!sheet) return [];
  const last = sheet.getLastRow();
  if (last < 2) return [];
  const tz = Session.getScriptTimeZone();
  return sheet.getRange(2, 1, last - 1, RECORDATORIO_CABECERAS_.length).getValues()
    .filter(f => f[0] && String(f[4]).trim() !== '')
    .map(f => ({
      id: String(f[0]),
      fecha: f[1] instanceof Date ? Utilities.formatDate(f[1], tz, 'yyyy-MM-dd') : '',
      hora: normalizarHoraRecordatorio_(f[2], tz),
      tipo: RECORDATORIO_TIPOS_.indexOf(f[3]) !== -1 ? f[3] : 'Nota',
      texto: String(f[4]),
      hecho: f[5] === true || String(f[5]).trim().toLowerCase() === 'sí' || String(f[5]).trim().toLowerCase() === 'si'
    }));
}

/**
 * Para que otras pestañas abiertas de la Agenda se refresquen sin hacer nada: el sondeo
 * del cliente (obtenerVersionAgendaWeb) compara la versión de la caché de la Agenda,
 * así que basta con subirla tras cada cambio.
 */
function avisarCambioRecordatorios_() {
  try { invalidarCacheAgenda_(obtenerHojaAgenda()); } catch (e) { /* no crítico */ }
  try { citasInvalidarCache_(); } catch (e) { /* no crítico */ }   // versión de la tabla plana "Citas"
}

function buscarFilaRecordatorio_(sheet, id) {
  const last = sheet.getLastRow();
  if (last < 2) return -1;
  const ids = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return -1;
}

function respuestaRecordatorios_(sheet) {
  return { success: true, recordatorios: leerRecordatorios_(sheet) };
}

/** Lista actual. Si la hoja aún no existe devuelve [] sin crearla. */
function obtenerRecordatoriosWeb() {
  try {
    return respuestaRecordatorios_(obtenerHojaRecordatorios_(false));
  } catch (e) {
    Logger.log('Error en obtenerRecordatoriosWeb: ' + e.message);
    return { success: false, message: e.message, recordatorios: [] };
  }
}

/**
 * Crea (sin `id`) o edita (con `id`) un recordatorio.
 * datos = { id?, texto, tipo, fecha ("yyyy-MM-dd" | ""), hora ("HH:mm" | "") }
 */
function guardarRecordatorioWeb(datos) {
  try {
    datos = datos || {};
    const texto = String(datos.texto || '').trim();
    if (!texto) return { success: false, message: 'Escribe qué quieres recordar.' };

    const fecha = parsearFechaRecordatorio_(datos.fecha);
    if (fecha === null) return { success: false, message: 'La fecha no es válida.' };

    const tipo = RECORDATORIO_TIPOS_.indexOf(datos.tipo) !== -1 ? datos.tipo : 'Nota';
    const hora = normalizarHoraRecordatorio_(datos.hora, Session.getScriptTimeZone());

    const sheet = obtenerHojaRecordatorios_(true);

    if (datos.id) {
      const fila = buscarFilaRecordatorio_(sheet, datos.id);
      if (fila === -1) return { success: false, message: 'Ese recordatorio ya no existe.' };
      sheet.getRange(fila, 2, 1, 4).setValues([[fecha, hora, tipo, texto]]);   // no toca ID ni Hecho
    } else {
      const fila = sheet.getLastRow() + 1;
      sheet.getRange(fila, 1, 1, RECORDATORIO_CABECERAS_.length)
        .setValues([[Utilities.getUuid().slice(0, 8), fecha, hora, tipo, texto, '']]);
    }

    avisarCambioRecordatorios_();
    return respuestaRecordatorios_(sheet);
  } catch (e) {
    Logger.log('Error en guardarRecordatorioWeb: ' + e.message);
    return { success: false, message: e.message };
  }
}

/** Marca o desmarca un recordatorio como hecho. */
function alternarRecordatorioWeb(id, hecho) {
  try {
    const sheet = obtenerHojaRecordatorios_(false);
    const fila = sheet ? buscarFilaRecordatorio_(sheet, id) : -1;
    if (fila === -1) return { success: false, message: 'Ese recordatorio ya no existe.' };
    sheet.getRange(fila, 6).setValue(hecho ? 'Sí' : '');
    avisarCambioRecordatorios_();
    return respuestaRecordatorios_(sheet);
  } catch (e) {
    Logger.log('Error en alternarRecordatorioWeb: ' + e.message);
    return { success: false, message: e.message };
  }
}

/** Elimina un recordatorio (borra su fila). */
function eliminarRecordatorioWeb(id) {
  try {
    const sheet = obtenerHojaRecordatorios_(false);
    const fila = sheet ? buscarFilaRecordatorio_(sheet, id) : -1;
    if (fila === -1) return { success: false, message: 'Ese recordatorio ya no existe.' };
    sheet.deleteRow(fila);
    avisarCambioRecordatorios_();
    return respuestaRecordatorios_(sheet);
  } catch (e) {
    Logger.log('Error en eliminarRecordatorioWeb: ' + e.message);
    return { success: false, message: e.message };
  }
}