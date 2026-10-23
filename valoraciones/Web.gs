// seleccionar uno, su historial completo para ver la evolución.
//
// La hoja "Valoraciones" tiene una fila por valoración (un paciente puede
// tener varias a lo largo del tiempo: Inicial, Seguimiento, Final...), así
// que aquí se agrupan por DNI (o por nombre, en las filas que aún no tienen DNI)
// antes de servirlas a la Web App.

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
    const C = COLUMNAS_NUM.VALORACIONES; // posiciones 1-based, ver core/Config.gs

    // La columna ID puede no existir todavía en la hoja: se lee solo hasta donde llegue.
    const ultimaCol = Math.min(C.ID_PACIENTE, sheet.getMaxColumns());
    const datos = sheet.getRange(2, 1, lastRow - 1, ultimaCol).getValues();
    // Nombre, DNI y teléfono ACTUALES de cada usuario (Maestra); la fila de la hoja solo guarda lo que había al valorar.
    const maestra = {};
    leerPacientesMaestra_().forEach(p => { if (p.id) maestra[p.id] = p; });
    const porPaciente = {};
    let sinId = 0;

    datos.forEach((fila, i) => {
      const nombre = (fila[C.NOMBRE - 1] || '').toString().trim();
      if (!nombre) return; // fila vacía o incompleta, se ignora

      const id = idPacienteDeFila_(fila, C);
      if (!id) { sinId++; return; }

      if (!porPaciente[id]) {
        const m = maestra[id];
        porPaciente[id] = {
          clave: id,
          idPaciente: id,
          nombre: m ? m.nombre : nombre,
          dni: m ? m.dni : normalizarDniValoracion_(fila[C.DNI - 1]),
          telefono: m ? m.telefono : '',
          historial: []
        };
      }
      const p = porPaciente[id];
      p.historial.push(registroValoracion_(fila, i, C, tz));
      // Usuario que ya no está en la Maestra: se muestra con el último teléfono no vacío de sus filas.
      if (!maestra[id] && fila[C.TELEFONO - 1]) p.telefono = fila[C.TELEFONO - 1].toString();
    });

    const pacientes = Object.keys(porPaciente).map(clave => {
      const p = porPaciente[clave];
      p.historial.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
      p.ultima = p.historial[p.historial.length - 1];
      p.numValoraciones = p.historial.length;
      return p;
    });

    // Más reciente primero por defecto.
    pacientes.sort((a, b) => (a.ultima.fecha < b.ultima.fecha ? 1 : a.ultima.fecha > b.ultima.fecha ? -1 : 0));

    return { pacientes: pacientes, sinId: sinId };
  } catch (e) {
    Logger.log('Error en obtenerValoracionesWeb: ' + e.message);
    return { pacientes: [], error: e.message };
  }
}

/** ID paciente de una fila ya leída de la hoja Valoraciones ('' si aún no lo tiene). */
function idPacienteDeFila_(fila, C) {
  const v = fila[C.ID_PACIENTE - 1];
  return (v === null || v === undefined) ? '' : v.toString().trim();
}

/**
 * Convierte una fila de la hoja "Valoraciones" en el registro que viaja al cliente.
 * Lo comparten obtenerValoracionesWeb (página Valoraciones) y obtenerValoracionesUsuarioWeb
 * (sección Valoraciones de la ficha de usuario), para que los dos pinten exactamente los mismos datos.
 * @param {Array} fila   Valores de la fila (0-based).
 * @param {number} i     Posición de la fila dentro de lo leído (la fila real de la hoja es i + 2).
 * @param {Object} C     COLUMNAS_NUM.VALORACIONES
 * @param {string} tz    Zona horaria para formatear la fecha.
 */
function registroValoracion_(fila, i, C, tz) {
  const fechaCelda = fila[C.FECHA - 1];
  return {
    _fila: i + 2, // fila real en la hoja (para poder editarla o borrarla)
    idPaciente: idPacienteDeFila_(fila, C), // usuario al que pertenece (sirve para validar al editar/borrar/deshacer)
    nombre: (fila[C.NOMBRE - 1] || '').toString().trim(), // nombre tal cual está en ESA fila (informativo; también permite deshacer un borrado)
    fecha: fechaCelda instanceof Date ? Utilities.formatDate(fechaCelda, tz, 'yyyy-MM-dd') : '',
    dni: normalizarDniValoracion_(fila[C.DNI - 1]), // DNI de ESA fila (informativo)
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
}

/**
 * Historial de valoraciones de UN usuario, de la más antigua a la más reciente. Lo usa el panel lateral
 * de valoraciones del usuario (valoraciones/Panel_Valoraciones), abierto desde la ficha en Agenda, Base de Datos y HC.
 * Son del usuario las filas con ese ID paciente; ni el nombre ni el DNI intervienen.
 *
 * @param {string} idPaciente ID paciente del usuario (Maestra).
 * @return {{success: boolean, historial?: Array, message?: string}}
 */
function obtenerValoracionesUsuarioWeb(idPaciente) {
  try {
    const id = String(idPaciente || '').trim();
    if (!id) return { success: true, historial: [] };

    const sheet = getSS().getSheetByName(SHEETS.VALORACIONES);
    if (!sheet) return { success: false, message: `No se encontró la hoja "${SHEETS.VALORACIONES}".` };

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return { success: true, historial: [] };

    const tz = Session.getScriptTimeZone();
    const C = COLUMNAS_NUM.VALORACIONES;
    // La columna ID puede no existir todavía en la hoja: se lee solo hasta donde llegue.
    const ultimaCol = Math.min(C.ID_PACIENTE, sheet.getMaxColumns());
    const datos = sheet.getRange(2, 1, lastRow - 1, ultimaCol).getValues();

    const historial = [];
    datos.forEach((fila, i) => {
      if (idPacienteDeFila_(fila, C) === id) historial.push(registroValoracion_(fila, i, C, tz));
    });

    historial.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a._fila - b._fila));
    return { success: true, historial: historial };
  } catch (e) {
    Logger.log('Error en obtenerValoracionesUsuarioWeb: ' + e.message);
    return { success: false, message: e.message };
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
 * Normaliza un DNI leído de una celda o recibido del cliente: texto sin espacios
 * en los extremos y en mayúsculas ('' si está vacío).
 */
function normalizarDniValoracion_(valor) {
  return (valor === null || valor === undefined) ? '' : valor.toString().trim().toUpperCase();
}

/**
 * Comprueba que la fila `fila` de la hoja Valoraciones sigue siendo la que el cliente cargó: mismo ID paciente
 * (obligatorio) y, si se envía, misma fecha (yyyy-MM-dd; hace falta porque un usuario tiene varias valoraciones).
 */
function filaValoracionCoincide_(sheet, fila, idEsperado, fechaEsperadaISO) {
  const id = String(idEsperado || '').trim();
  if (!id) return false;
  const C = COLUMNAS_NUM.VALORACIONES;
  const ancho = Math.min(Math.max(C.FECHA, C.ID_PACIENTE), sheet.getMaxColumns());
  const celdas = sheet.getRange(fila, 1, 1, ancho).getValues()[0];

  if (idPacienteDeFila_(celdas, C) !== id) return false;
  if (fechaEsperadaISO !== undefined && fechaEsperadaISO !== null) {
    const celdaFecha = celdas[C.FECHA - 1];
    const iso = celdaFecha instanceof Date ? Utilities.formatDate(celdaFecha, Session.getScriptTimeZone(), 'yyyy-MM-dd') : '';
    if (iso !== String(fechaEsperadaISO)) return false;
  }
  return true;
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
 *   funcionGlobal, analgesicos, notas, idPaciente, fechaOriginal } —
 *   `idPaciente` y `fechaOriginal` (la fecha ANTES de corregirla) sirven para
 *   comprobar que la fila sigue siendo la misma valoración.
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
    if (!String(datos.idPaciente || '').trim()) return { success: false, message: 'Falta el ID del usuario.' };
    if (!filaValoracionCoincide_(sheet, fila, datos.idPaciente, datos.fechaOriginal)) {
      return { success: false, message: 'La lista ha cambiado desde que se cargó. Recarga la página e inténtalo de nuevo.' };
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
    // El DNI y el ID paciente tampoco se tocan al corregir una valoración (identifican a la persona, como el nombre).
    Object.keys(C).forEach(clave => {
      if (clave === 'NOMBRE' || clave === 'DNI' || clave === 'ID_PACIENTE') return;
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
 *
 * `idPaciente` y `fechaEsperada` (yyyy-MM-dd) protegen frente a filas que hayan
 * cambiado de número: si ya no coinciden, no se borra nada.
 */
function eliminarValoracionWeb(fila, idPaciente, fechaEsperada) {
  try {
    const ss = getSS();
    const sheet = ss.getSheetByName(SHEETS.VALORACIONES);
    if (!sheet) return { success: false, message: `No se encontró la hoja "${SHEETS.VALORACIONES}".` };

    const filaNum = parseInt(fila, 10);
    if (!filaNum || filaNum < 2 || filaNum > sheet.getLastRow()) {
      return { success: false, message: 'Fila no válida.' };
    }

    if (!String(idPaciente || '').trim()) return { success: false, message: 'Falta el ID del usuario.' };
    if (!filaValoracionCoincide_(sheet, filaNum, idPaciente, fechaEsperada)) {
      return { success: false, message: 'La lista ha cambiado desde que se cargó. Recarga la página e inténtalo de nuevo.' };
    }

    sheet.deleteRow(filaNum);
    return { success: true, message: 'Valoración eliminada correctamente.' };
  } catch (e) {
    Logger.log('Error en eliminarValoracionWeb: ' + e.message);
    return { success: false, message: e.message };
  }
}

/**
 * Deshace un "Eliminar" reciente: vuelve a insertar la fila de una
 * valoración borrada, con los mismos datos que tenía. El cliente ya guardaba
 * el registro completo en memoria (el mismo que pinta en el historial), así
 * que aquí no hace falta leer nada de la hoja primero.
 * @param {object} datos El registro completo (fecha, tipo, pegDolor, ..., _fila,
 *   idPaciente, nombre, dni). El usuario debe seguir existiendo en la Maestra.
 */
function restaurarValoracionWeb(datos) {
  try {
    const ss = getSS();
    const sheet = ss.getSheetByName(SHEETS.VALORACIONES);
    if (!sheet) return { success: false, message: `No se encontró la hoja "${SHEETS.VALORACIONES}".` };

    if (!datos) return { success: false, message: 'No hay datos que restaurar.' };
    const paciente = pacienteMaestraPorId_(datos.idPaciente);
    if (!paciente) return { success: false, message: 'El usuario ya no está en la Base de Datos: no se puede restaurar su valoración.' };

    const fechaObj = parsearFechaISO_(datos.fecha);
    if (!fechaObj) return { success: false, message: 'La fecha guardada no es válida.' };

    const C = COLUMNAS_NUM.VALORACIONES;
    const filaOriginal = parseInt(datos._fila, 10);
    const fila = (filaOriginal && filaOriginal <= sheet.getLastRow() + 1) ? filaOriginal : (sheet.getLastRow() + 1);

    const filaDatos = [];
    filaDatos[C.FECHA - 1] = fechaObj;
    filaDatos[C.TIPO - 1] = datos.tipo || '';
    filaDatos[C.NOMBRE - 1] = datos.nombre || paciente.nombre;
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
    filaDatos[C.DNI - 1] = normalizarDniValoracion_(datos.dni);
    filaDatos[C.ID_PACIENTE - 1] = paciente.id;

    // Si la hoja aún no tiene la columna del ID, se amplía para poder escribir la fila completa.
    if (sheet.getMaxColumns() < C.ID_PACIENTE) sheet.insertColumnsAfter(sheet.getMaxColumns(), C.ID_PACIENTE - sheet.getMaxColumns());

    sheet.insertRowBefore(fila);
    sheet.getRange(fila, 1, 1, filaDatos.length).setValues([filaDatos]);

    return { success: true, message: 'Valoración restaurada correctamente.' };
  } catch (e) {
    Logger.log('Error en restaurarValoracionWeb: ' + e.message);
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

