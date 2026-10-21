/**
 * Configuración centralizada de nombres de hoja usados en todo el proyecto.
 * Antes "Base de Datos Maestra" estaba escrito como texto literal en más de
 * una decena de archivos; ahora vive en un único sitio. Si algún día cambias
 * el nombre real de la pestaña en Sheets, solo hay que tocarlo aquí.
 */
const SHEETS = {
  MAESTRA: "Base de Datos Maestra",
  VALORACIONES: "Valoraciones",
  EVENTOS: "Eventos",
  RECORDATORIOS: "Recordatorios",
  HISTORIAL: "Historial Estado",  // cambios de Estado / Tipo de Ingreso / Gravedad (usuarios/Historial_Estado.gs, CONTEXTO.md sección 11, paso 4)
  CITAS: "Citas"                  // tabla plana de citas (agenda/Citas_Datos.gs, CONTEXTO.md sección 11, paso 6). Hasta el corte es una COPIA de la Agenda
};

/**
 * Claves de PropertiesService (Script Properties) usadas para la configuración
 * ajustable desde el menú ⚙️ (ver core/PanelAdmin.gs). Antes cada clave estaba escrita
 * como texto literal por separado en core/PanelAdmin.gs y en el archivo que la
 * consume (historia/Generar.gs / usuarios/Whatsapp.gs); un typo en una de las dos copias
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
    TIPO_INGRESO: "Tipo de Ingreso",
    GRAVEDAD: "Gravedad",
    HISTORIA_CLINICA: "Historia clínica",
    FECHA_INSCRIPCION: "Fecha inscripción",
    // ID estable del usuario (CONTEXTO.md, sección 11, paso 3). Columna al FINAL de la Maestra. Lo genera
    // herramientas/Asignar_IDs_Paciente.gs para las filas existentes y guardarPaciente para las nuevas.
    // Nunca se edita a mano: actualizarPaciente lo conserva siempre tal cual.
    ID_PACIENTE: "ID paciente",
    TELEFONO: "Teléfono 1",     // Confirmado (17/09/2026): la columna real se llama "Teléfono 1"
    TELEFONO_1: "Teléfono 1",
    TELEFONO_2: "Teléfono 2",
    // Cabecera "sin espacio/sin acento" que usa usuarios/Contactos_Google.gs
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
  },
  // Hoja "Citas" (una fila por cita real, sin huecos libres). Teléfono y enlace a la HC no se guardan: se consultan por ID paciente.
  CITAS: {
    ID: "ID cita",
    FECHA: "Fecha",
    HORA: "Hora",
    ID_PACIENTE: "ID paciente",
    NOMBRE: "Nombre",            // referencia: el nombre tal como estaba en la Agenda (no localiza a nadie; localiza el ID paciente)
    SESION: "Sesión",
    ASISTENCIA: "Asistencia",
    NOTAS: "Notas",
    ID_EVENTO_CALENDAR: "ID Evento Calendar",
    CREADA: "Creada el"          // vacío en las citas migradas (no se puede reconstruir); lo rellenará la capa de escritura
  }
};

/**
 * Categorías de Asistencia de una cita (decisión del dueño, 20-oct-2026: se mantienen estas 4; CONTEXTO.md sección 11, paso 5).
 * Es la fuente única: el valor que se guarda en la hoja "Citas" es exactamente uno de estos textos.
 */
const ASISTENCIA_CITA = {
  PENDIENTE: "Pendiente",
  ASISTIDO: "Asistido",
  NO_ASISTIDO: "No asistido",
  JUSTIFICADA: "Justificada"
};

/**
 * Campos de la Maestra cuyos cambios se guardan en el historial (usuarios/Historial_Estado.gs). Estado + Tipo de Ingreso +
 * Gravedad son lo que decide la "Prioridad" (la puntuación de usuarios/Ordenar.gs); la puntuación en sí no se guarda.
 */
const HISTORIAL_CAMPOS = [COLUMNAS.MAESTRA.ESTADO, COLUMNAS.MAESTRA.TIPO_INGRESO, COLUMNAS.MAESTRA.GRAVEDAD];

/**
 * Posición numérica (1 = columna A) de las mismas columnas de arriba, para el
 * código que accede por número de columna en vez de buscar por nombre de
 * cabecera. Igual que con COLUMNAS: se incluyen aunque solo se usen en un
 * único archivo, para tener un solo sitio que tocar si la hoja cambia de
 * estructura.
 *
 * TELEFONO y SESION de AGENDA no los usa ningún archivo activo ahora mismo
 * (eran constantes declaradas en agenda/Cita.gs sin ninguna referencia real) — se
 * dejan aquí documentadas como referencia de la estructura real de la hoja,
 * por si las necesitas más adelante.
 */
const COLUMNAS_NUM = {
  MAESTRA: {
    NOMBRE: 2,
    TELEFONO: 4,
    ESTADO: 8
  },
  AGENDA: {
    FECHA: 1,
    DIA: 2,
    HORA: 3,
    USUARIO: 4,
    TELEFONO: 5,
    SESION: 6,
    ASISTENCIA: 7,
    HISTORIA_CLINICA: 9,
    NOTAS: 10
  },
  // Orden posicional exacto con el que procesarValoracion() (Guardar
  // Valoraciones.gs) escribe cada fila con appendRow — esa función no busca
  // por cabecera, así que aquí seguimos la misma convención en vez de
  // inventar nombres de cabecera que no podemos confirmar.
  VALORACIONES: {
    FECHA: 1,
    TIPO: 2,
    NOMBRE: 3,
    TELEFONO: 4,
    PEG_DOLOR: 5,
    PEG_ACTIVIDAD: 6,
    PEG_VIDA: 7,
    MEDIA_COLUMNA: 8,
    MEDIA_MS: 9,
    MEDIA_MI: 10,
    FUNCION_GLOBAL: 11,
    ANALGESICOS: 12,
    NOTAS: 13,
    DNI: 14   // Añadida al final (05/10/2026) para no mover ninguna columna existente
  }
};

/**
 * Paneles de formulario bajo demanda (ver ui/JS_Paneles_Diferidos.html).
 * true  → Valoración, Editar, Cita, Nuevo usuario y Buscar huérfana no van dentro de la página: se piden
 *         al servidor la primera vez (y se precargan en segundo plano), con lo que la página pesa mucho menos.
 * false → vuelven a ir dentro de la página, exactamente como antes. Es el interruptor para deshacer el cambio.
 */
const PANELES_BAJO_DEMANDA = true;

/**
 * Estados de un usuario (columna "Estado" de la Maestra). FUENTE ÚNICA: el texto lleva emoji y debe
 * coincidir exactamente con lo que hay escrito en las celdas de la hoja.
 * - Servidor: se usa directamente (ESTADOS_PACIENTE.ALTA, ...).
 * - Cliente (HTML): las páginas lo reciben con <script> generado por incluirEstados() (core/WebApp.gs),
 *   y los archivos de las vistas lo leen como ESTADOS_PACIENTE.
 * LISTA_EDICION = los que se ofrecen al editar y en la ficha; LISTA_NUEVO = los que se ofrecen al crear un usuario.
 */
const ESTADOS_PACIENTE = (function () {
  const e = {
    ACTIVO: "🟢 Activo",
    EN_ESPERA: "🟡 En espera",
    ALTA: "✔️ Alta",
    CONTACTARA: "🕐 Contactará",
    NO_RESPONDE: "🚫 No responde"
  };
  e.LISTA_EDICION = [e.ACTIVO, e.EN_ESPERA, e.CONTACTARA, e.NO_RESPONDE, e.ALTA];
  e.LISTA_NUEVO = [e.ACTIVO, e.EN_ESPERA, e.CONTACTARA];
  e.DEFECTO_NUEVO = e.EN_ESPERA;
  return e;
})();
