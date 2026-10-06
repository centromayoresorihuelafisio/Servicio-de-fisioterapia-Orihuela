/**
 * Ficha de usuario para el panel lateral de la Agenda web.
 * Devuelve el registro completo del paciente en la Maestra (teléfonos, DNI,
 * clasificación, diagnóstico…), buscándolo por nombre.
 */
function obtenerFichaUsuarioWeb(nombre) {
  try {
    const objetivo = normalizarNombreFicha_(nombre);
    if (!objetivo) return { success: false, message: 'La cita no tiene usuario asignado.' };

    const bd = obtenerBaseDatosCompletaWeb();
    if (bd.error) return { success: false, message: bd.error };

    const colNombre = COLUMNAS.MAESTRA.NOMBRE;
    const paciente = bd.pacientes.filter(p => normalizarNombreFicha_(p[colNombre]) === objetivo)[0];
    if (!paciente) return { success: false, message: 'No se encontró a este usuario en la Base de Datos.' };

    return { success: true, headers: bd.headers, paciente: paciente };
  } catch (e) {
    Logger.log('Error en obtenerFichaUsuarioWeb: ' + e.message);
    return { success: false, message: e.message };
  }
}

function normalizarNombreFicha_(texto) {
  return String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
}
