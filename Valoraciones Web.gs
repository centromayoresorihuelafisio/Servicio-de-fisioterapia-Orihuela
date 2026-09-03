// ARCHIVO: Valoraciones Web.gs
// Alimenta la pestaña "Valoraciones" de la Web App (?page=valoraciones): una
// tabla con una fila por paciente (su valoración más reciente) y, al
// seleccionar uno, su historial completo para ver la evolución.
//
// La hoja "Valoraciones" tiene una fila por valoración (un paciente puede
// tener varias a lo largo del tiempo: Inicial, Seguimiento, Final...), así
// que aquí se agrupan por nombre antes de servirlas a la Web App.

/**
 * Devuelve todos los pacientes con al menos una valoración, cada uno con su
 * valoración más reciente (para la tabla principal) y su historial completo
 * ordenado cronológicamente (para el detalle y la gráfica de evolución).
 */
function obtenerValoracionesWeb() {
  try {
    const ss = getSS();
    const sheet = ss.getSheetByName(SHEETS.VALORACIONES);
    if (!sheet) {
      return { pacientes: [], error: `No se encontró la hoja "${SHEETS.VALORACIONES}".` };
    }

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return { pacientes: [] };

    const tz = Session.getScriptTimeZone();
    const C = COLUMNAS_NUM.VALORACIONES; // posiciones 1-based, ver Config.gs

    const datos = sheet.getRange(2, 1, lastRow - 1, C.NOTAS).getValues();
    const porPaciente = {};

    datos.forEach((fila, i) => {
      const nombre = (fila[C.NOMBRE - 1] || '').toString().trim();
      if (!nombre) return; // fila vacía o incompleta, se ignora

      const fechaCelda = fila[C.FECHA - 1];
      const fechaISO = fechaCelda instanceof Date ? Utilities.formatDate(fechaCelda, tz, 'yyyy-MM-dd') : '';

      const registro = {
        _fila: i + 2, // fila real en la hoja (para poder editarla o borrarla)
        fecha: fechaISO,
        tipo: (fila[C.TIPO - 1] || '').toString(),
        telefono: (fila[C.TELEFONO - 1] || '').toString(),
        pegDolor: numeroOVacio_(fila[C.PEG_DOLOR - 1]),
        pegActividad: numeroOVacio_(fila[C.PEG_ACTIVIDAD - 1]),
        pegVida: numeroOVacio_(fila[C.PEG_VIDA - 1]),
        mediaColumna: numeroOVacio_(fila[C.MEDIA_COLUMNA - 1]),
        mediaMS: numeroOVacio_(fila[C.MEDIA_MS - 1]),
        mediaMI: numeroOVacio_(fila[C.MEDIA_MI - 1]),
        funcionGlobal: numeroOVacio_(fila[C.FUNCION_GLOBAL - 1]),
        analgesicos: numeroOVacio_(fila[C.ANALGESICOS - 1]),
        notas: (fila[C.NOTAS - 1] || '').toString()
      };

      if (!porPaciente[nombre]) {
        porPaciente[nombre] = {
          nombre: nombre,
          telefono: (fila[C.TELEFONO - 1] || '').toString(),
          historial: []
        };
      }
      porPaciente[nombre].historial.push(registro);
      // Nos quedamos con el teléfono más reciente no vacío, por si cambió.
      if (fila[C.TELEFONO - 1]) porPaciente[nombre].telefono = fila[C.TELEFONO - 1].toString();
    });

    const pacientes = Object.keys(porPaciente).map(nombre => {
      const p = porPaciente[nombre];
      p.historial.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
      p.ultima = p.historial[p.historial.length - 1];
      p.numValoraciones = p.historial.length;
      return p;
    });

    // Más reciente primero por defecto.
    pacientes.sort((a, b) => (a.ultima.fecha < b.ultima.fecha ? 1 : a.ultima.fecha > b.ultima.fecha ? -1 : 0));

    return { pacientes: pacientes };
  } catch (e) {
    Logger.log('Error en obtenerValoracionesWeb: ' + e.message);
    return { pacientes: [], error: e.message };
  }
}

/**
 * Normaliza una celda numérica: null/''/no numérico → null (para que el
 * cliente lo pinte como "—" en vez de como un 0 engañoso), número → number.
 */
function numeroOVacio_(valor) {
  if (valor === '' || valor === null || valor === undefined) return null;
  const n = Number(valor);
  return isNaN(n) ? null : n;
}

/**
 * Sobrescribe una valoración ya guardada (fila existente de la hoja
 * "Valoraciones") con los datos corregidos — pensado para arreglar una fecha
 * equivocada o cualquier otro dato mal introducido. A diferencia del
 * formulario de creación, aquí cada campo se guarda tal cual se recibe, sin
 * recalcular nada (p.ej. si solo se corrige la fecha, el resto de valores no
 * se tocan).
 *
 * @param {object} datos { fila, fecha (yyyy-MM-dd), tipo, telefono,
 *   pegDolor, pegActividad, pegVida, mediaColumna, mediaMS, mediaMI,
 *   funcionGlobal, analgesicos, notas }
 */
function actualizarValoracionWeb(datos) {
  try {
    const ss = getSS();
    const sheet = ss.getSheetByName(SHEETS.VALORACIONES);
    if (!sheet) return { success: false, message: `No se encontró la hoja "${SHEETS.VALORACIONES}".` };

    const fila = parseInt(datos.fila, 10);
    if (!fila || fila < 2 || fila > sheet.getLastRow()) {
      return { success: false, message: 'Fila no válida.' };
    }

    const fecha = parsearFechaISO_(datos.fecha);
    if (!fecha) return { success: false, message: 'La fecha no es válida.' };

    const C = COLUMNAS_NUM.VALORACIONES;
    // Nombre (columna C) se deja intacto a propósito: cambiar de paciente no
    // es "corregir un dato", es reasignar la valoración a otra persona — si
    // hiciera falta, mejor borrar y crear una nueva desde el formulario.
    const filaDatos = [];
    filaDatos[C.FECHA - 1] = fecha;
    filaDatos[C.TIPO - 1] = datos.tipo || 'Inicial';
    filaDatos[C.TELEFONO - 1] = datos.telefono || '';
    filaDatos[C.PEG_DOLOR - 1] = numeroOVacio_(datos.pegDolor);
    filaDatos[C.PEG_ACTIVIDAD - 1] = numeroOVacio_(datos.pegActividad);
    filaDatos[C.PEG_VIDA - 1] = numeroOVacio_(datos.pegVida);
    filaDatos[C.MEDIA_COLUMNA - 1] = numeroOVacio_(datos.mediaColumna);
    filaDatos[C.MEDIA_MS - 1] = numeroOVacio_(datos.mediaMS);
    filaDatos[C.MEDIA_MI - 1] = numeroOVacio_(datos.mediaMI);
    filaDatos[C.FUNCION_GLOBAL - 1] = numeroOVacio_(datos.funcionGlobal);
    filaDatos[C.ANALGESICOS - 1] = numeroOVacio_(datos.analgesicos);
    filaDatos[C.NOTAS - 1] = datos.notas || '';

    // Escribimos cada campo por su columna exacta (en vez de la fila entera
    // de un tirón) para no pisar la columna Nombre, que no viaja en filaDatos.
    Object.keys(C).forEach(clave => {
      if (clave === 'NOMBRE') return;
      sheet.getRange(fila, C[clave]).setValue(filaDatos[C[clave] - 1]);
    });

    return { success: true, message: 'Valoración actualizada correctamente.' };
  } catch (e) {
    Logger.log('Error en actualizarValoracionWeb: ' + e.message);
    return { success: false, message: e.message };
  }
}

/**
 * Elimina por completo una fila de la hoja "Valoraciones" (borrado real de
 * la fila, no solo de su contenido).
 */
function eliminarValoracionWeb(fila) {
  try {
    const ss = getSS();
    const sheet = ss.getSheetByName(SHEETS.VALORACIONES);
    if (!sheet) return { success: false, message: `No se encontró la hoja "${SHEETS.VALORACIONES}".` };

    const filaNum = parseInt(fila, 10);
    if (!filaNum || filaNum < 2 || filaNum > sheet.getLastRow()) {
      return { success: false, message: 'Fila no válida.' };
    }

    sheet.deleteRow(filaNum);
    return { success: true, message: 'Valoración eliminada correctamente.' };
  } catch (e) {
    Logger.log('Error en eliminarValoracionWeb: ' + e.message);
    return { success: false, message: e.message };
  }
}

/**
 * Convierte una fecha "yyyy-MM-dd" (la que da un <input type="date">) en un
 * objeto Date a mediodía, para evitar problemas de zona horaria al guardar.
 * Devuelve null si el texto no tiene ese formato.
 */
function parsearFechaISO_(fechaISO) {
  if (!fechaISO || typeof fechaISO !== 'string') return null;
  const partes = fechaISO.split('-');
  if (partes.length !== 3) return null;
  const [anio, mes, dia] = partes.map(Number);
  if (!anio || !mes || !dia) return null;
  return new Date(anio, mes - 1, dia, 12, 0, 0);
}