/**
 * Ficha de usuario para el panel lateral de la Agenda web.
 *
 * RENDIMIENTO: antes cada clic en un nombre llamaba al servidor, que releía la
 * Base de Datos completa (con todas sus columnas y el rich text de Historia
 * clínica) solo para devolver UNA ficha. Ahora el cliente (agenda/Web_Vista.html)
 * pide TODAS las fichas de una vez, en segundo plano, con obtenerFichasUsuariosWeb()
 * y abre el panel desde memoria. obtenerFichaUsuarioWeb() queda solo como
 * respaldo (usuario dado de alta después de la última carga, o carga aún en curso).
 *
 * El cliente puede pedir solo algunas columnas (parámetro `campos`). Hoy la ficha
 * muestra también "Otros datos" (como la de la Base de Datos), así que la Agenda las
 * pide todas; sigue sin leerse el rich text de Historia clínica: el enlace a la
 * historia se abre desde la fila de la Agenda, no desde estos datos.
 *
 * Cada ficha lleva `_fila` (fila de la Maestra) para poder cambiar el Estado desde
 * la ficha con cambiarEstadoPacienteWeb(fila, estado, nombre), que comprueba el nombre
 * antes de escribir por si las filas se han reordenado desde la carga.
 */

/**
 * Todas las fichas, indexadas por nombre normalizado (mayúsculas, sin tildes,
 * espacios simples). Si hay nombres duplicados en la Maestra se queda con el
 * primero, igual que hacía la búsqueda individual.
 * @param {string[]=} campos Cabeceras que necesita el cliente. Si se omite, todas.
 */
function obtenerFichasUsuariosWeb(campos) {
  try {
    const bd = leerMaestraParaFicha_(campos);
    if (bd.error) return { success: false, message: bd.error };

    const colNombre = COLUMNAS.MAESTRA.NOMBRE;
    const fichas = {};
    bd.pacientes.forEach(function(p) {
      const clave = normalizarNombreFicha_(p[colNombre]);
      if (clave && !Object.prototype.hasOwnProperty.call(fichas, clave)) fichas[clave] = p;
    });

    return { success: true, headers: bd.headers, fichas: fichas, generado: Date.now() };
  } catch (e) {
    Logger.log('Error en obtenerFichasUsuariosWeb: ' + e.message);
    return { success: false, message: e.message };
  }
}

/**
 * Respaldo: una sola ficha por nombre. Mismo formato de respuesta que siempre
 * ({ success, headers, paciente }), de modo que el cliente la trata igual.
 * @param {string} nombre
 * @param {string[]=} campos Cabeceras que necesita el cliente. Si se omite, todas.
 */
function obtenerFichaUsuarioWeb(nombre, campos) {
  try {
    const objetivo = normalizarNombreFicha_(nombre);
    if (!objetivo) return { success: false, message: 'La cita no tiene usuario asignado.' };

    const bd = leerMaestraParaFicha_(campos);
    if (bd.error) return { success: false, message: bd.error };

    const colNombre = COLUMNAS.MAESTRA.NOMBRE;
    const paciente = bd.pacientes.filter(function(p) { return normalizarNombreFicha_(p[colNombre]) === objetivo; })[0];
    if (!paciente) return { success: false, message: 'No se encontró a este usuario en la Base de Datos.' };

    return { success: true, headers: bd.headers, paciente: paciente };
  } catch (e) {
    Logger.log('Error en obtenerFichaUsuarioWeb: ' + e.message);
    return { success: false, message: e.message };
  }
}

/**
 * Lee la Maestra una sola vez y devuelve { headers, pacientes } con SOLO las
 * columnas pedidas (más Nombre, que siempre hace falta para identificar la fila).
 * Las fechas se formatean dd/MM/yyyy, como en obtenerBaseDatosCompletaWeb.
 */
function leerMaestraParaFicha_(campos) {
  const sheet = getSS().getSheetByName(SHEETS.MAESTRA);
  if (!sheet) return { headers: [], pacientes: [], error: 'No se encontró la hoja "' + SHEETS.MAESTRA + '".' };

  const lastRow = sheet.getLastRow();
  const lastColRaw = sheet.getLastColumn();
  if (lastRow < 2 || lastColRaw < 1) return { headers: [], pacientes: [] };

  const headersRaw = sheet.getRange(1, 1, 1, lastColRaw).getValues()[0];
  const pedidos = (campos && campos.length)
    ? campos.concat([COLUMNAS.MAESTRA.NOMBRE]).map(normalizarNombreFicha_)
    : null;

  // Columnas a conservar: (índice 0-based, cabecera). Se ignoran las columnas sin cabecera.
  const cols = [];
  headersRaw.forEach(function(h, idx) {
    const t = String(h === null || h === undefined ? '' : h).trim();
    if (t && (!pedidos || pedidos.indexOf(normalizarNombreFicha_(t)) !== -1)) cols.push({ idx: idx, h: t });
  });
  if (!cols.length) return { headers: [], pacientes: [] };

  // Una única lectura, hasta la última columna necesaria (no hasta el final de la hoja).
  const ultimaCol = cols[cols.length - 1].idx + 1;
  const datos = sheet.getRange(2, 1, lastRow - 1, ultimaCol).getValues();
  const tz = Session.getScriptTimeZone();
  const colNombre = COLUMNAS.MAESTRA.NOMBRE;

  const pacientes = [];
  datos.forEach(function(row, i) {
    const p = { _fila: i + 2 };   // fila real en la hoja (los datos empiezan en la 2)
    cols.forEach(function(c) {
      let v = row[c.idx];
      if (Object.prototype.toString.call(v) === '[object Date]') v = Utilities.formatDate(v, tz, 'dd/MM/yyyy');
      p[c.h] = v;
    });
    // Ignorar filas vacías (huecos en la hoja)
    if (p[colNombre] && String(p[colNombre]).trim() !== '') pacientes.push(p);
  });

  return { headers: cols.map(function(c) { return c.h; }), pacientes: pacientes };
}

function normalizarNombreFicha_(texto) {
  return String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
}
