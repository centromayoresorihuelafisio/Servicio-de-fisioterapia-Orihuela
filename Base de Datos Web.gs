// la base de datos sin abrir la hoja de cálculo. La edición de cada paciente
// se hace desde ahí mismo, con un enlace a ?page=editarPaciente&fila=N que
// reutiliza el mismo FormularioEdicion.html que ya usa el menú 🧍 → Editar.
// ================================================================================

/**
 * Devuelve todas las filas de la Maestra (todas las columnas, tal cual están
 * en la hoja) para renderizar la tabla completa en la Web App.
 * Cada paciente incluye `_fila`: el número de fila real en la hoja, necesario
 * para poder editarlo después con actualizarPaciente(datos, _fila).
 */
function obtenerBaseDatosCompletaWeb() {
  try {
    const ss = getSS();
    const sheet = ss.getSheetByName(SHEETS.MAESTRA);
    if (!sheet) {
      return { headers: [], pacientes: [], error: `No se encontró la hoja "${SHEETS.MAESTRA}".` };
    }

    const lastRow = sheet.getLastRow();
    const lastColRaw = sheet.getLastColumn();
    const headersRaw = sheet.getRange(1, 1, 1, lastColRaw).getValues()[0];

    // La hoja suele tener columnas con formato pero sin cabecera al final
    // (celdas de formato heredado, sin dato real) — nos quedamos solo con
    // las columnas hasta la última que sí tiene nombre.
    let lastCol = 0;
    headersRaw.forEach((h, idx) => { if (h && h.toString().trim() !== '') lastCol = idx + 1; });
    const headers = headersRaw.slice(0, lastCol).map(h => h.toString().trim());

    if (lastRow < 2 || lastCol === 0) {
      return { headers: headers, pacientes: [] };
    }

    const rango = sheet.getRange(2, 1, lastRow - 1, lastCol);
    const data = rango.getValues();
    const colHC = headers.indexOf(COLUMNAS.MAESTRA.HISTORIA_CLINICA);

    // OPTIMIZACIÓN DE RENDIMIENTO: antes se pedía getRichTextValues() de TODO
    // el rango (todas las columnas, todos los pacientes) solo para leer el
    // enlace de UNA columna (Historia Clínica) — el mismo patrón que hacía
    // lenta la Agenda al principio. Con muchas columnas de ficha por
    // paciente, eso son muchas más celdas de las que realmente hacen falta.
    // Ahora se pide solo la columna de Historia Clínica.
    let richTextHC = null;
    if (colHC !== -1) {
      richTextHC = sheet.getRange(2, colHC + 1, lastRow - 1, 1).getRichTextValues();
    }

    const pacientes = data
      .map((row, i) => {
        const paciente = { _fila: i + 2 };
        headers.forEach((h, colIdx) => {
          let value = row[colIdx];

          if (colIdx === colHC) {
            // La celda de Historia Clínica es un enlace enriquecido: el texto
            // visible es "Ver Historia Clínica", la URL real va aparte.
            const richTextCell = richTextHC ? richTextHC[i][0] : null;
            const url = richTextCell ? richTextCell.getLinkUrl() : null;
            value = url || (value ? value.toString().trim() : '');
          } else if (Object.prototype.toString.call(value) === '[object Date]') {
            value = Utilities.formatDate(value, Session.getScriptTimeZone(), "dd/MM/yyyy");
          }

          paciente[h] = value;
        });
        return paciente;
      })
      // Ignorar filas completamente vacías (huecos en la hoja)
      .filter(p => p[COLUMNAS.MAESTRA.NOMBRE] && p[COLUMNAS.MAESTRA.NOMBRE].toString().trim() !== '');

    return { headers: headers, pacientes: pacientes };
  } catch (e) {
    Logger.log("Error en obtenerBaseDatosCompletaWeb: " + e.message);
    return { headers: [], pacientes: [], error: e.message };
  }
}

/**
 * Posición (0-based) de la columna Nombre en la Maestra, buscada por cabecera
 * y, si no aparece, por la posición fija de Config.gs.
 */
function indiceColumnaNombreMaestra_(sheet) {
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => h.toString().trim());
  const idx = headers.indexOf(COLUMNAS.MAESTRA.NOMBRE);
  return idx !== -1 ? idx : COLUMNAS_NUM.MAESTRA.NOMBRE - 1;
}

/**
 * Comprueba que la fila `fila` de la Maestra sigue siendo la del paciente que
 * el cliente cargó (mismo criterio que cambiarEstadoPacienteWeb): si la hoja
 * se ha ordenado o editado mientras la web estaba abierta, el número de fila
 * ya no apunta a la misma persona. Si el cliente no envía nombre, no se puede
 * comprobar y se da por buena.
 */
function filaMaestraEsElPaciente_(sheet, fila, nombreEsperado) {
  const esperado = (nombreEsperado === undefined || nombreEsperado === null) ? '' : String(nombreEsperado).trim();
  if (!esperado) return true;
  const actual = sheet.getRange(fila, indiceColumnaNombreMaestra_(sheet) + 1).getValue().toString().trim();
  return actual === esperado;
}

/**
 * Borra por completo la fila de un paciente en la Maestra (borrado real de
 * la fila, no solo de su contenido). Es una acción irreversible: no toca las
 * hojas de Agenda ni Valoraciones, así que si ese paciente tenía citas o
 * valoraciones seguirán apareciendo ahí con su nombre.
 *
 * `nombreEsperado` protege frente a filas que hayan cambiado de número (p. ej.
 * tras ordenar): si el nombre de esa fila ya no coincide, no se borra nada.
 */
function eliminarPacienteWeb(fila, nombreEsperado) {
  try {
    const ss = getSS();
    const sheet = ss.getSheetByName(SHEETS.MAESTRA);
    if (!sheet) return { success: false, message: `No se encontró la hoja "${SHEETS.MAESTRA}".` };

    const filaNum = parseInt(fila, 10);
    if (!filaNum || filaNum < 2 || filaNum > sheet.getLastRow()) {
      return { success: false, message: 'Fila no válida.' };
    }

    if (!filaMaestraEsElPaciente_(sheet, filaNum, nombreEsperado)) {
      return { success: false, message: 'La lista ha cambiado desde que se cargó. Recarga la página e inténtalo de nuevo.' };
    }

    sheet.deleteRow(filaNum);
    return { success: true, message: 'Usuario eliminado correctamente.' };
  } catch (e) {
    Logger.log('Error en eliminarPacienteWeb: ' + e.message);
    return { success: false, message: e.message };
  }
}

/**
 * Deshace un "Eliminar" reciente: vuelve a insertar la fila de un usuario
 * borrado, con los mismos datos que tenía. El cliente ya guardaba la ficha
 * completa en memoria (la misma que pinta en la tabla), así que aquí no hace
 * falta leer nada de la hoja primero — solo volver a escribirla.
 *
 * OJO: el enlace de Historia Clínica se restaura como texto plano (la URL),
 * no como el enlace enriquecido "Ver Historia Clínica" que tiene normalmente
 * — el dato no se pierde, pero para que vuelva a verse como un enlace bonito
 * habría que regenerarlo o pegarlo de nuevo desde Historia Clínica → Enlace HC.
 *
 * Las fechas llegan del cliente como texto "dd/MM/yyyy" (así se sirven en
 * obtenerBaseDatosCompletaWeb): aquí se convierten de nuevo a fecha real para
 * que la celda no quede como texto según la configuración regional de la hoja.
 *
 * @param {object} datosPaciente La ficha completa tal cual la tenía el
 *   cliente (incluye _fila, la fila original que ocupaba).
 */
function restaurarPacienteWeb(datosPaciente) {
  try {
    const ss = getSS();
    const sheet = ss.getSheetByName(SHEETS.MAESTRA);
    if (!sheet) return { success: false, message: `No se encontró la hoja "${SHEETS.MAESTRA}".` };

    if (!datosPaciente || !datosPaciente[COLUMNAS.MAESTRA.NOMBRE]) {
      return { success: false, message: 'No hay datos que restaurar.' };
    }

    const lastCol = sheet.getLastColumn();
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => h.toString().trim());

    const filaOriginal = parseInt(datosPaciente._fila, 10);
    const fila = (filaOriginal && filaOriginal <= sheet.getLastRow() + 1) ? filaOriginal : (sheet.getLastRow() + 1);

    const valores = headers.map(h => {
      const v = datosPaciente[h];
      return (v === undefined || v === null) ? '' : fechaTextoADate_(v);
    });

    sheet.insertRowBefore(fila);
    sheet.getRange(fila, 1, 1, valores.length).setValues([valores]);

    return { success: true, message: 'Usuario restaurado correctamente.' };
  } catch (e) {
    Logger.log('Error en restaurarPacienteWeb: ' + e.message);
    return { success: false, message: e.message };
  }
}

/**
 * Convierte un texto "dd/MM/yyyy" en un objeto Date (medianoche, en la zona
 * horaria del script). Cualquier otro valor —incluido un texto con formato de
 * fecha imposible como 31/02/2026— se devuelve tal cual.
 */
function fechaTextoADate_(valor) {
  if (typeof valor !== 'string') return valor;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(valor.trim());
  if (!m) return valor;
  const dia = Number(m[1]), mes = Number(m[2]), anio = Number(m[3]);
  const d = new Date(anio, mes - 1, dia);
  if (d.getFullYear() !== anio || d.getMonth() !== mes - 1 || d.getDate() !== dia) return valor;
  return d;
}

/**
 * Cambia solo el Estado de un usuario (menú de estado en línea de la Base de Datos Web).
 * "Alta" se rechaza aquí a propósito: tiene su propio flujo (darDeAltaPacienteWeb) que
 * actualiza también fechas, tipo de ingreso y la Historia Clínica.
 * `nombreEsperado` protege frente a filas que hayan cambiado de número (p. ej. tras ordenar).
 */
function cambiarEstadoPacienteWeb(fila, nuevoEstado, nombreEsperado) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);

    const sheet = getSS().getSheetByName(SHEETS.MAESTRA);
    if (!sheet) return { success: false, message: `No se encontró la hoja "${SHEETS.MAESTRA}".` };

    const rowIdx = parseInt(fila, 10);
    const estado = (nuevoEstado === null || nuevoEstado === undefined) ? '' : String(nuevoEstado).trim();
    if (!rowIdx || rowIdx < 2 || rowIdx > sheet.getLastRow()) return { success: false, message: 'Fila no válida.' };
    if (!estado || estado.length > 60) return { success: false, message: 'Estado no válido.' };
    if (/(^|[^a-záéíóúñ])alta([^a-záéíóúñ]|$)/i.test(estado)) {
      return { success: false, message: 'Para dar de alta usa el botón "Alta": actualiza también fechas e Historia Clínica.' };
    }

    const lastCol = sheet.getLastColumn();
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => h.toString().trim());
    let colEstado = headers.indexOf(COLUMNAS.MAESTRA.ESTADO);
    if (colEstado === -1) colEstado = COLUMNAS_NUM.MAESTRA.ESTADO - 1;

    const colNombre = headers.indexOf(COLUMNAS.MAESTRA.NOMBRE);
    if (nombreEsperado && colNombre !== -1) {
      const actual = sheet.getRange(rowIdx, colNombre + 1).getValue().toString().trim();
      if (actual !== String(nombreEsperado).trim()) {
        return { success: false, message: 'La lista ha cambiado desde que se cargó. Recarga la página e inténtalo de nuevo.' };
      }
    }

    sheet.getRange(rowIdx, colEstado + 1).setValue(estado);
    SpreadsheetApp.flush();
    return { success: true, message: 'Estado actualizado.' };
  } catch (e) {
    Logger.log('Error en cambiarEstadoPacienteWeb: ' + e.message);
    return { success: false, message: e.message };
  } finally {
    try { lock.releaseLock(); } catch (err) { /* sin bloqueo que liberar */ }
  }
}

/**
 * Cambia el Estado de varios usuarios a la vez (barra de acciones en lote de
 * la Base de Datos Web). "Alta" se rechaza aquí: el cliente ya evita
 * enviarla, pero se comprueba también en el servidor por si acaso.
 */
function cambiarEstadoLoteWeb(filas, nuevoEstado) {
  const estado = (nuevoEstado === null || nuevoEstado === undefined) ? '' : String(nuevoEstado).trim();
  if (!estado || estado.length > 60) return { success: false, message: 'Estado no válido.' };
  if (/(^|[^a-záéíóúñ])alta([^a-záéíóúñ]|$)/i.test(estado)) {
    return { success: false, message: 'Para dar de alta hazlo usuario por usuario: actualiza también fechas e Historia Clínica.' };
  }
  if (!Array.isArray(filas) || filas.length === 0) return { success: false, message: 'No hay usuarios seleccionados.' };

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const sheet = getSS().getSheetByName(SHEETS.MAESTRA);
    if (!sheet) return { success: false, message: `No se encontró la hoja "${SHEETS.MAESTRA}".` };

    const lastCol = sheet.getLastColumn(), lastRow = sheet.getLastRow();
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => h.toString().trim());
    let colEstado = headers.indexOf(COLUMNAS.MAESTRA.ESTADO);
    if (colEstado === -1) colEstado = COLUMNAS_NUM.MAESTRA.ESTADO - 1;

    const filasValidas = filas.map(f => parseInt(f, 10)).filter(f => f >= 2 && f <= lastRow);
    if (!filasValidas.length) return { success: false, message: 'Filas no válidas.' };

    const rangos = filasValidas.map(f => sheet.getRange(f, colEstado + 1).getA1Notation());
    sheet.getRangeList(rangos).setValue(estado);

    SpreadsheetApp.flush();
    return { success: true, message: 'Estado actualizado en ' + filasValidas.length + (filasValidas.length === 1 ? ' usuario.' : ' usuarios.') };
  } catch (e) {
    Logger.log('Error en cambiarEstadoLoteWeb: ' + e.message);
    return { success: false, message: e.message };
  } finally {
    try { lock.releaseLock(); } catch (err) { /* sin bloqueo que liberar */ }
  }
}

/**
 * Elimina varias filas de la Maestra a la vez (borrado real de fila, no solo
 * de contenido). Borra de abajo hacia arriba para que borrar una fila no
 * desplace el número de las que aún faltan por borrar.
 * Igual que eliminarPacienteWeb: no toca Agenda ni Valoraciones.
 *
 * `nombresEsperados` es un objeto { fila: nombre } con lo que el cliente cargó.
 * La comprobación es de todo o nada: si CUALQUIER fila ya no corresponde a su
 * nombre (o ya no existe), no se borra ninguna.
 */
function eliminarPacientesLoteWeb(filas, nombresEsperados) {
  if (!Array.isArray(filas) || filas.length === 0) return { success: false, message: 'No hay usuarios seleccionados.' };

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const sheet = getSS().getSheetByName(SHEETS.MAESTRA);
    if (!sheet) return { success: false, message: `No se encontró la hoja "${SHEETS.MAESTRA}".` };

    const lastRow = sheet.getLastRow();
    const filasValidas = Array.from(new Set(filas.map(f => parseInt(f, 10)).filter(f => f >= 2 && f <= lastRow)));
    if (!filasValidas.length) return { success: false, message: 'Filas no válidas.' };

    if (nombresEsperados && typeof nombresEsperados === 'object') {
      const pedidas = new Set(filas.map(f => parseInt(f, 10)));
      if (filasValidas.length !== pedidas.size) {
        return { success: false, message: 'La lista ha cambiado desde que se cargó. Recarga la página e inténtalo de nuevo.' };
      }
      const colNombre = indiceColumnaNombreMaestra_(sheet);
      const nombresHoja = sheet.getRange(2, colNombre + 1, lastRow - 1, 1).getValues();
      const cambiada = filasValidas.some(f => {
        const esperado = nombresEsperados[f];
        if (esperado === undefined || esperado === null) return true;
        return nombresHoja[f - 2][0].toString().trim() !== String(esperado).trim();
      });
      if (cambiada) return { success: false, message: 'La lista ha cambiado desde que se cargó. Recarga la página e inténtalo de nuevo.' };
    }

    filasValidas.sort((a, b) => b - a).forEach(f => sheet.deleteRow(f));

    return { success: true, message: filasValidas.length + (filasValidas.length === 1 ? ' usuario eliminado.' : ' usuarios eliminados.') };
  } catch (e) {
    Logger.log('Error en eliminarPacientesLoteWeb: ' + e.message);
    return { success: false, message: e.message };
  } finally {
    try { lock.releaseLock(); } catch (err) { /* sin bloqueo que liberar */ }
  }
}