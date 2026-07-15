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

/**
 * Nombres de columna (cabeceras de la fila 1) de cada hoja. Se centralizan TODAS
 * las cabeceras usadas en el código, aunque solo aparezcan en un único archivo:
 * así, si algún día renombras una columna en Sheets, solo tienes que tocar este
 * archivo, sin tener que localizar primero qué función concreta la usaba.
 */
const COLUMNAS = {
  MAESTRA: {
    NOMBRE: "Nombre",
    DNI: "DNI",
    FECHA_NACIMIENTO: "Fecha nacimiento",
    EDAD: "Edad",
    ESTADO: "Estado",
    HISTORIA_CLINICA: "Historia clínica",
    FECHA_INSCRIPCION: "Fecha inscripción",
    TELEFONO: "Teléfono",       // OJO: no confirmado — ver nota en onEdit edad tlf.gs
    TELEFONO_1: "Teléfono 1",
    TELEFONO_2: "Teléfono 2",
    // Cabecera "sin espacio/sin acento" que usa Sincronizar contactos google.gs
    // como primer intento antes de caer al buscador difuso de variantes.
    TELEFONO_FORM: "telefono1"
  },
  AGENDA: {
    FECHA: "Fecha",
    DIA: "Día",
    HORA: "Hora",
    USUARIO: "Usuario",
    TELEFONO: "Teléfono",
    SESION: "Sesión",
    ASISTENCIA: "Asistencia",
    ID_EVENTO_CALENDAR: "ID Evento Calendar",
    NOTAS: "Notas",
    HISTORIA_CLINICA: "Historia clínica"
  }
};