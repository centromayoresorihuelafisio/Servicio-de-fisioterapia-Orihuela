/**
 * Configuración centralizada de nombres de hoja usados en todo el proyecto.
 * Antes "Base de Datos Maestra" estaba escrito como texto literal en más de
 * una decena de archivos; ahora vive en un único sitio. Si algún día cambias
 * el nombre real de la pestaña en Sheets, solo hay que tocarlo aquí.
 */
const SHEETS = {
  MAESTRA: "Base de Datos Maestra",
  VALORACIONES: "Valoraciones",
  RECORDATORIOS: "Recordatorios",
  HISTORIAL: "Historial Estado",  // cambios de Estado / Tipo de Ingreso / Gravedad (usuarios/Historial_Estado.gs, CONTEXTO.md sección 11, paso 4)
  CITAS: "Citas",                 // tabla plana de citas (agenda/Citas_Datos.gs, CONTEXTO.md sección 11, paso 6). Desde el corte (21-oct-2026) es la única fuente de las citas
  ACCESOS: "Accesos",             // cuentas de la app (acceso/Cuentas.gs, CONTEXTO.md sección 17)
  REGISTRO: "Registro"            // solo se añaden filas (acceso/Registro.gs, CONTEXTO.md sección 17)
};

/**
 * Claves de PropertiesService (Script Properties) usadas para la configuración
 * ajustable desde el editor (ver core/PanelAdmin.gs). Antes cada clave estaba escrita
 * como texto literal por separado en core/PanelAdmin.gs y en el archivo que la
 * consume (usuarios/Whatsapp.gs); un typo en una de las dos copias
 * rompería la lectura sin ningún aviso. Ahora hay una única fuente por clave.
 */
const PROP_KEYS = {
  WHATSAPP_MESSAGE: "WHATSAPP_MESSAGE",
  ACCESO_ITERACIONES: "ACCESO_ITERACIONES",
  ACCESOS_SUSPENDIDOS: "ACCESOS_SUSPENDIDOS",   // plan de emergencia, nivel 2 (CONTEXTO.md, 17.9): solo entra el administrador
  APP_CERRADA: "APP_CERRADA",                   // nivel 3: nadie entra; solo se reabre desde el editor
  COPIAS_CARPETA: "COPIAS_CARPETA"              // ID de la carpeta de Drive de las copias de seguridad (CONTEXTO.md, sección 21)
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
    // Cómo le gusta al usuario que le llamen (p. ej. «MONSE»), aunque no sea el nombre del DNI (CONTEXTO.md, sección 22).
    // Columna opcional, al final de la Maestra; misma regla de escritura que el nombre (normalizarNombreUsuario_).
    NOMBRE_HABITUAL: "Nombre habitual",
    DNI: "DNI",
    FECHA_NACIMIENTO: "Fecha nacimiento",
    // Nombre del campo "Edad" que calculan al leer los lectores de la Maestra. La edad NO se guarda en la hoja
    // (CONTEXTO.md, sección 11, decisión 6).
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
    OBSERVACIONES: "Observaciones",
    // Cabecera "sin espacio/sin acento" que usa usuarios/Contactos_Google.gs
    // como primer intento antes de caer al buscador difuso de variantes.
    TELEFONO_FORM: "telefono1"
  },
  // Cabeceras de la tabla de la semana que la Agenda web recibe del servidor (agenda/Web_Semana_Citas.gs); el cliente las usa como
  // claves. NO son columnas de la hoja "Citas" (Citas_Datos.gs recorre COLUMNAS.CITAS y espera que existan en la hoja).
  SEMANA_WEB: {
    FECHA: "Fecha",
    DIA: "Día",
    HORA: "Hora",
    USUARIO: "Usuario",
    TELEFONO: "Teléfono",
    SESION: "Sesión",
    ASISTENCIA: "Asistencia",
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
 * Aviso de absentismo (decisión del dueño, 3-nov-2026): un usuario lo tiene con 3 o más citas «No asistido» desde el ingreso de su
 * último episodio (las «Justificada» no cuentan). Se ve junto al nombre en la Agenda y en la tarjeta «Asistencia a citas» de la ficha.
 */
const ABSENTISMO_UMBRAL = 3;

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
 */
const COLUMNAS_NUM = {
  MAESTRA: {
    NOMBRE: 2,
    TELEFONO: 4,
    ESTADO: 8
  },
  // Orden posicional exacto con el que procesarValoracion_() (Guardar
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
    DNI: 14,  // Añadida al final (05/10/2026) para no mover ninguna columna existente
    // ID estable del usuario (CONTEXTO.md, sección 11, paso 8). Añadida al final (22-oct-2026). La rellena
    // herramientas/Asignar_ID_Paciente_en_Valoraciones.gs en las filas existentes. Nunca se edita a mano.
    ID_PACIENTE: 15
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
 * Estados de un usuario (columna "Estado" de la Maestra). FUENTE ÚNICA: el texto va SIN emoji (desde el
 * 27-oct-2026) y debe coincidir con lo que hay escrito en las celdas de la hoja. Para comparar con valores
 * que aún pudieran llevar emoji, usar textoSinEmoji_ (core/Utils.gs).
 * - Servidor: se usa directamente (ESTADOS_PACIENTE.ALTA, ...).
 * - Cliente (HTML): las páginas lo reciben con <script> generado por incluirEstados_() (core/WebApp.gs),
 *   y los archivos de las vistas lo leen como ESTADOS_PACIENTE.
 * LISTA_EDICION = los que se ofrecen al editar y en la ficha; LISTA_NUEVO = los que se ofrecen al crear un usuario.
 */
const ESTADOS_PACIENTE = (function () {
  const e = {
    ACTIVO: "Activo",
    EN_ESPERA: "En espera",
    ALTA: "Alta",
    CONTACTARA: "Contactará",
    NO_RESPONDE: "No responde"
  };
  e.LISTA_EDICION = [e.ACTIVO, e.EN_ESPERA, e.CONTACTARA, e.NO_RESPONDE, e.ALTA];
  e.LISTA_NUEVO = [e.ACTIVO, e.EN_ESPERA, e.CONTACTARA];
  e.DEFECTO_NUEVO = e.EN_ESPERA;
  return e;
})();

/**
 * Gravedad (columna "Gravedad" de la Maestra). FUENTE ÚNICA, sin emoji. En el navegador la define incluirEstados_()
 * (core/WebApp.gs) igual que ESTADOS_PACIENTE. Los rangos de la puntuación de gravedad viven en los formularios.
 * "Grave" se llamaba "Urgente" hasta el 5-nov-2026 (la hoja ya se migró): por si quedara alguna celda antigua, "Urgente"
 * se sigue leyendo como Grave.
 */
const GRAVEDAD_PACIENTE = (function () {
  const g = { LEVE: "Leve", MODERADO: "Moderado", GRAVE: "Grave" };
  g.LISTA = [g.LEVE, g.MODERADO, g.GRAVE];
  return g;
})();

/**
 * Tipo de ingreso (columna "Tipo de Ingreso" de la Maestra). FUENTE ÚNICA, sin emoji; en el navegador, igual que la
 * Gravedad. Al dar el alta la celda se vacía (usuarios/Alta.gs).
 */
const TIPOS_INGRESO = (function () {
  const t = { VOLANTE: "Volante", DERIVACION_PROPIA: "Derivación propia", ANTIGUO: "Antiguo paciente" };
  t.LISTA = [t.VOLANTE, t.DERIVACION_PROPIA, t.ANTIGUO];
  t.DEFECTO = t.VOLANTE;
  return t;
})();
