/**
 * Lee la Base de Datos Maestra y devuelve un array [{ id, nombre, telefono, dni }], uno por fila con nombre.
 * El ID paciente y el DNI se localizan por su cabecera (COLUMNAS.MAESTRA); nombre y teléfono, por posición.
 * Una sola lectura de la hoja: de ahí salen el autocompletado del formulario, los datos que se guardan en
 * cada valoración y los nombres que muestra la página Valoraciones.
 */
function leerPacientesMaestra_() {
  const sheet = getSS().getSheetByName(SHEETS.MAESTRA);
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const COLUMNA_NOMBRE = COLUMNAS_NUM.MAESTRA.NOMBRE;     // Columna B (Nombre)
  const COLUMNA_TELEFONO = COLUMNAS_NUM.MAESTRA.TELEFONO; // Columna D (Teléfono)

  const idxDni = obtenerIndiceColumnaPorNombre_(sheet, COLUMNAS.MAESTRA.DNI);          // 0-based, -1 si no existe
  const idxId = obtenerIndiceColumnaPorNombre_(sheet, COLUMNAS.MAESTRA.ID_PACIENTE);   // 0-based, -1 si no existe

  const ancho = Math.max(COLUMNA_TELEFONO, idxDni + 1, idxId + 1);
  const datos = sheet.getRange(2, 1, lastRow - 1, ancho).getValues();

  const pacientes = [];
  datos.forEach(row => {
    const nombre = row[COLUMNA_NOMBRE - 1] ? row[COLUMNA_NOMBRE - 1].toString().trim() : '';
    if (!nombre) return;
    pacientes.push({
      id: (idxId !== -1 && row[idxId]) ? row[idxId].toString().trim() : '',
      nombre: nombre,
      telefono: row[COLUMNA_TELEFONO - 1] ? row[COLUMNA_TELEFONO - 1].toString().trim() : '',
      dni: (idxDni !== -1 && row[idxDni]) ? row[idxDni].toString().trim().toUpperCase() : ''
    });
  });
  return pacientes;
}

/** Usuario de la Maestra con ese ID paciente ({ id, nombre, telefono, dni }); null si no existe o el ID viene vacío. */
function pacienteMaestraPorId_(idPaciente) {
  const id = String(idPaciente || '').trim();
  if (!id) return null;
  return leerPacientesMaestra_().filter(p => p.id === id)[0] || null;
}

/**
 * Lista de usuarios de la Base de Datos Maestra para el autocompletado del formulario de valoración.
 * Devuelve `pacientes` ([{ id, nombre, telefono, dni }]): el ID es lo que el formulario envía al guardar,
 * y distingue a dos usuarios con el mismo nombre.
 */
function obtenerPacientesParaAutocompletar() {
  try {
    return { pacientes: leerPacientesMaestra_() };
  } catch (e) {
    Logger.log("Error en autocompletado: " + e.message);
    return { pacientes: [], error: e.message };
  }
}

// NOTA: normalizarFormatoNombre() se centralizó en core/Utils.gs (14/07/2026) para
// eliminar la definición duplicada que existía aquí. Ver core/Utils.gs — misma lógica, fuente única.

/**
 * Procesa los datos del formulario de valoración y los guarda.
 * Calcula los promedios de las secciones funcionales.
 * @param {object} data Datos del formulario; `idPaciente` identifica al usuario (obligatorio).
 * @returns {string} Un mensaje de éxito o fracaso.
 */
function procesarValoracion(data) {
  try {
    const ss = getSS();
    const sheet = ss.getSheetByName(SHEETS.VALORACIONES);
    if (!sheet) throw new Error("No se encontró la hoja 'Valoraciones'.");

    /**
     * Calcula el promedio de un array de valores.
     * Al filtrar null, undefined y NaN, si una categoría no es valorada, 
     * el array queda vacío (length === 0) y devuelve null, evitando promediar falsamente con 0.
     */
    const safeAverage = (values) => {
      const validValues = values.filter(v => v !== null && v !== undefined && !isNaN(v));
      if (validValues.length === 0) return null;
      const sum = validValues.reduce((acc, current) => acc + current, 0);
      // Calcula el promedio y lo redondea a un decimal.
      return Math.round((sum / validValues.length) * 10) / 10; 
    };

    // 1. Usuario: el formulario envía SOLO su ID paciente; nombre, DNI y teléfono salen de la Maestra.
    const paciente = pacienteMaestraPorId_(data.idPaciente);
    if (!paciente) throw new Error("No se encontró al usuario en Usuarios (ID paciente). Elígelo de la lista.");
    const nombreFinal = normalizarFormatoNombre(paciente.nombre) || paciente.nombre;
    const dni = paciente.dni;
    const telefono = telefonoNormalizar_(paciente.telefono);   // solo dígitos (regla única, core/Utils.gs)

    const tipoValoracion = data.tipoValoracion || "Inicial";
    const notas = data.notas ? data.notas.trim() : "";

    // 2. Parseo de datos clínicos
    const parseOrNull = (val) => (val === "" || val === null || isNaN(parseFloat(val))) ? null : parseFloat(val);
    
    const pegDolorOutput     = parseOrNull(data.pegDolor);
    const pegActividadOutput = parseOrNull(data.pegActividad);
    const pegVidaOutput      = parseOrNull(data.pegVida);
    const analgesicosOutput  = parseOrNull(data.analgesicos);

    // 3. Cálculo de sub-escalas funcionales
    const mediaColumna = safeAverage([parseOrNull(data.columnaLevantarse), parseOrNull(data.columnaAgacharse)]);
    const mediaMS = safeAverage([parseOrNull(data.msVestirse), parseOrNull(data.msAlcanzar)]);
    const mediaMI = safeAverage([parseOrNull(data.miCaminar), parseOrNull(data.miEscaleras), parseOrNull(data.miSilla)]);

    // 4. Cálculo de Función Global (Ignora limpiamente las regiones sin valorar)
    const mediaFG = safeAverage([mediaColumna, mediaMS, mediaMI]);

    const hoy = new Date();
    const fechaSolo = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());

    // 5. Preparar fila: cada valor en su columna (COLUMNAS_NUM.VALORACIONES, core/Config.gs)
    const C = COLUMNAS_NUM.VALORACIONES;
    const filaDatos = [];
    filaDatos[C.FECHA - 1] = fechaSolo;               // Fecha como objeto nativo
    filaDatos[C.TIPO - 1] = tipoValoracion;           // Inicial, Seguimiento, Final
    filaDatos[C.NOMBRE - 1] = nombreFinal;            // Nombre normalizado (el de la Maestra en este momento)
    filaDatos[C.TELEFONO - 1] = telefono;
    filaDatos[C.PEG_DOLOR - 1] = pegDolorOutput;
    filaDatos[C.PEG_ACTIVIDAD - 1] = pegActividadOutput;
    filaDatos[C.PEG_VIDA - 1] = pegVidaOutput;
    filaDatos[C.MEDIA_COLUMNA - 1] = mediaColumna;
    filaDatos[C.MEDIA_MS - 1] = mediaMS;
    filaDatos[C.MEDIA_MI - 1] = mediaMI;
    filaDatos[C.FUNCION_GLOBAL - 1] = mediaFG;
    filaDatos[C.ANALGESICOS - 1] = analgesicosOutput;
    filaDatos[C.NOTAS - 1] = notas;
    filaDatos[C.DNI - 1] = dni;                       // vacío si el usuario no tiene DNI en la Maestra
    filaDatos[C.ID_PACIENTE - 1] = paciente.id;       // con qué usuario se enlaza la valoración (nunca se edita a mano)

    telefonoFormatoTexto_(sheet, sheet.getLastRow() + 1, C.TELEFONO);   // la fila nueva, con el teléfono como texto (si no, Sheets lo convierte en número)
    sheet.appendRow(filaDatos);
    return `Valoración de tipo '${tipoValoracion}' guardada con éxito.`;

  } catch (e) {
    Logger.log("Error al procesar valoración: " + e.message);
    throw new Error("Error al guardar: " + e.message);
  }
}

