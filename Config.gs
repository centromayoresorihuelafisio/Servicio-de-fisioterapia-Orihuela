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

/**
 * Claves de PropertiesService (Script Properties) usadas para la configuración
 * ajustable desde el menú ⚙️ (ver PanelAdmin.gs). Antes cada clave estaba escrita
 * como texto literal por separado en PanelAdmin.gs y en el archivo que la
 * consume (Historia Clínica.gs / Whatsapp.gs); un typo en una de las dos copias
 * rompería la lectura sin ningún aviso. Ahora hay una única fuente por clave.
 */
const PROP_KEYS = {
  DOC_TEMPLATE_ID: "DOC_TEMPLATE_ID",
  DRIVE_FOLDER_ID: "DRIVE_FOLDER_ID",
  WHATSAPP_MESSAGE: "WHATSAPP_MESSAGE"
};