// ================================================================================
// ARCHIVO: Config.gs
// ================================================================================
/**
 * Configuración centralizada de nombres de hoja usados en todo el proyecto.
 * Antes "Base de Datos Maestra" estaba escrito como texto literal en más de
 * una decena de archivos; ahora vive en un único sitio. Si algún día cambias
 * el nombre real de la pestaña en Sheets, solo hay que tocarlo aquí.
 *
 * NOTA: NOMBRE_HOJA_AGENDA (definida en Cita.gs, ej. "Agenda 2025-2026") no se
 * incluyó aquí porque cambia cada curso y ya existe obtenerNombreHojaAgendaActiva()
 * en "Ir a fecha.gs" que la calcula dinámicamente. Se deja fuera de esta migración
 * a propósito — es un caso aparte, no una simple constante repetida.
 */
const SHEETS = {
  MAESTRA: "Base de Datos Maestra",
  VALORACIONES: "Valoraciones",
  EVENTOS: "Eventos"
};