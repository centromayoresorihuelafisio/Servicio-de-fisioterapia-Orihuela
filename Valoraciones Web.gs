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

    datos.forEach(fila => {
      const nombre = (fila[C.NOMBRE - 1] || '').toString().trim();
      if (!nombre) return; // fila vacía o incompleta, se ignora

      const fechaCelda = fila[C.FECHA - 1];
      const fechaISO = fechaCelda instanceof Date ? Utilities.formatDate(fechaCelda, tz, 'yyyy-MM-dd') : '';

      const registro = {
        fecha: fechaISO,
        tipo: (fila[C.TIPO - 1] || '').toString(),
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