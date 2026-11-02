// ================================================================================
// AGENDA WEB — puntos de entrada del cliente (agenda/Web_Vista.html)
//
// Desde el corte (21-oct-2026) la Agenda web trabaja SOLO sobre la tabla "Citas":
// cada función de este archivo conserva el nombre que llama el cliente con
// google.script.run y delega en su versión "...DesdeCitasWeb_" (agenda/Web_Semana_Citas.gs
// y agenda/Web_Escritura_Citas.gs, sobre la capa agenda/Citas_Datos.gs). Las citas se
// identifican por su ID (los huecos libres por "hueco AAAA-MM-DD HH:mm"), no por fila.
// La hoja "Agenda AAAA-AAAA" quedó congelada como archivo y ya no se lee ni se escribe.
// ================================================================================

// Nombres de mes en español. Utilities.formatDate con el patrón "MMMM" usa
// el locale del propio script (no el de la hoja), y en muchas cuentas ese
// locale resuelve a inglés — de ahí el "13 de July" en vez de "13 de julio".
// Construimos la etiqueta a mano para que siempre salga en español, sin
// depender de esa configuración.
const MESES_ES_ = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];

/**
 * Construye la etiqueta "13 de julio – 17 de julio 2026" para el rango de
 * semana lunes-viernes, siempre con los nombres de mes en español. Si ambas
 * fechas caen en el mismo mes no repite el nombre del mes en la primera.
 */
function formatearRangoSemanaEs_(lunes, viernes) {
  const mismoMes = lunes.getMonth() === viernes.getMonth();
  const inicio = mismoMes
    ? `${lunes.getDate()}`
    : `${lunes.getDate()} de ${MESES_ES_[lunes.getMonth()]}`;
  const fin = `${viernes.getDate()} de ${MESES_ES_[viernes.getMonth()]} ${viernes.getFullYear()}`;
  return `${inicio} – ${fin}`;
}


/** Citas de la semana de lunes a viernes que contiene `fechaISO` ("yyyy-MM-dd"; sin fecha, la actual). */
function obtenerAgendaSemanaWeb(fechaISO) {
  return obtenerAgendaSemanaDesdeCitasWeb_(fechaISO);
}

/**
 * Versión actual de los datos de la Agenda: sube con cada escritura en la tabla "Citas". Llamada barata pensada para el sondeo
 * frecuente de agenda/Web_Vista.html: si el número no cambió, el cliente no pide los datos de la semana.
 */
function obtenerVersionAgendaWeb() {
  return { sheetId: 'citas', version: citasVersion_() };
}

/** Edita un campo de una cita. `fila` es el ID de la cita. */
function actualizarCampoAgendaWeb(fila, campo, valor) {
  try {
    return actualizarCampoDesdeCitasWeb_(fila, campo, valor);
  } catch (e) {
    Logger.log('Error en actualizarCampoAgendaWeb: ' + e.message);
    return { success: false, message: e.message };
  }
}

/** Elimina una cita (el hueco queda libre). `fila` es el ID de la cita. */
function eliminarDatosFilaAgendaWeb(fila) {
  try {
    return eliminarDesdeCitasWeb_([fila]);
  } catch (e) {
    Logger.log('Error en eliminarDatosFilaAgendaWeb: ' + e.message);
    return { success: false, message: e.message };
  }
}

/** Elimina varias citas a la vez. `filas` son IDs de cita. */
function eliminarVariasCitasWeb(filas) {
  try {
    return eliminarDesdeCitasWeb_(filas);
  } catch (e) {
    Logger.log('Error en eliminarVariasCitasWeb: ' + e.message);
    return { success: false, message: e.message };
  }
}

/** Deshacer una eliminación. `snapshots` son los que devolvió la eliminación. */
function restaurarCitasWeb(snapshots) {
  try {
    return restaurarDesdeCitasWeb_(snapshots);
  } catch (e) {
    Logger.log('Error en restaurarCitasWeb: ' + e.message);
    return { success: false, message: e.message };
  }
}

/** Asigna un usuario a un hueco libre. `fila` es la clave del hueco ("hueco AAAA-MM-DD HH:mm"); el usuario va por su ID paciente. */
function asignarPacienteHuecoWeb(fila, idPaciente) {
  try {
    return asignarPacienteDesdeCitasWeb_(fila, idPaciente);
  } catch (e) {
    Logger.log('Error en asignarPacienteHuecoWeb: ' + e.message);
    return { success: false, message: e.message };
  }
}

/**
 * Lista ligera de usuarios para el selector de huecos de la Agenda (id, nombre, DNI, teléfonos y estado, en el orden de la Maestra).
 * Es el RESPALDO: normalmente la lista llega con las fichas (`obtenerFichasUsuariosWeb`, que ya lee la Maestra entera); esta
 * función solo se llama si se abre el selector antes de que lleguen. Una sola lectura de la Maestra, solo las columnas necesarias.
 */
function obtenerUsuariosParaCitaWeb() {
  try {
    const C = COLUMNAS.MAESTRA;
    const bd = leerMaestraParaFicha_([C.ID_PACIENTE, C.DNI, C.TELEFONO_1, C.TELEFONO_2, C.ESTADO]);
    if (bd.error) return { success: false, message: bd.error };
    const r = usuariosParaSelectorDesdeMaestra_(bd.pacientes);
    return { success: true, usuarios: r.usuarios, sinId: r.sinId };
  } catch (e) {
    Logger.log('Error en obtenerUsuariosParaCitaWeb: ' + e.message);
    return { success: false, message: e.message };
  }
}

/** URL de WhatsApp de la persona de una cita. `fila` es el ID de la cita. */
function generarUrlWhatsappParaAgendaWeb(fila) {
  try {
    return generarUrlWhatsappDesdeCitasWeb_(fila);
  } catch (e) {
    Logger.log('Error en generarUrlWhatsappParaAgendaWeb: ' + e.message);
    return { success: false, message: e.message };
  }
}

/** Datos para el asistente de WhatsApp por lotes. `filas` son IDs de cita. */
function datosWhatsappLoteAgendaWeb_(filas) {
  try {
    return datosWhatsappLoteDesdeCitasWeb_(filas);
  } catch (e) {
    Logger.log('Error en datosWhatsappLoteAgendaWeb_: ' + e.message);
    return { success: false, message: e.message };
  }
}

/** Da de alta al usuario de una cita. `fila` es el ID de la cita. */
function darDeAltaPacienteParaAgendaWeb(fila) {
  try {
    return darDeAltaDesdeCitasWeb_(fila);
  } catch (e) {
    Logger.log('Error en darDeAltaPacienteParaAgendaWeb: ' + e.message);
    return { success: false, message: e.message };
  }
}

/** Copia citas a su siguiente semana ("Siguiente cita"). Cada `fila` es el ID de la cita. */
function copiarVariasCitasWeb(items, forzar) {
  try {
    return copiarVariasDesdeCitasWeb_(items, forzar);
  } catch (e) {
    Logger.log('Error en copiarVariasCitasWeb: ' + e.message);
    return { success: false, message: e.message };
  }
}

/** Mueve una cita a otro hueco (arrastrar y soltar). `filaOrigen` es el ID de la cita; `filaDestino`, "hueco AAAA-MM-DD HH:mm". */
function moverCitaWeb(filaOrigen, filaDestino) {
  return moverDesdeCitasWeb_(filaOrigen, filaDestino);
}

/** Intercambia dos citas. `filaA` y `filaB` son IDs de cita. */
function intercambiarCitasWeb(filaA, filaB) {
  return intercambiarDesdeCitasWeb_(filaA, filaB);
}
