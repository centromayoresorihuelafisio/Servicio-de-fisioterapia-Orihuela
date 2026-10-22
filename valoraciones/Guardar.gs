/**
 * Lee la Base de Datos Maestra y devuelve un array [{ nombre, telefono, dni }], uno por
 * fila con nombre. El DNI se localiza por su cabecera (COLUMNAS.MAESTRA.DNI); si la hoja
 * no tiene esa columna, todos salen con dni vacío. Nombre y teléfono siguen leyéndose por
 * posición, igual que antes.
 */
function leerPacientesMaestra_() {
  const sheet = getSS().getSheetByName(SHEETS.MAESTRA);
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const COLUMNA_NOMBRE = COLUMNAS_NUM.MAESTRA.NOMBRE;     // Columna B (Nombre)
  const COLUMNA_TELEFONO = COLUMNAS_NUM.MAESTRA.TELEFONO; // Columna D (Teléfono)

  const cabeceras = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    .map(h => h.toString().trim().toLowerCase());
  const idxDni = cabeceras.indexOf(COLUMNAS.MAESTRA.DNI.toLowerCase()); // 0-based, -1 si no existe

  const ancho = Math.max(COLUMNA_TELEFONO, idxDni + 1);
  const datos = sheet.getRange(2, 1, lastRow - 1, ancho).getValues();

  const pacientes = [];
  datos.forEach(row => {
    const nombre = row[COLUMNA_NOMBRE - 1] ? row[COLUMNA_NOMBRE - 1].toString().trim() : '';
    if (!nombre) return;
    pacientes.push({
      nombre: nombre,
      telefono: row[COLUMNA_TELEFONO - 1] ? row[COLUMNA_TELEFONO - 1].toString().trim() : '',
      dni: (idxDni !== -1 && row[idxDni]) ? row[idxDni].toString().trim().toUpperCase() : ''
    });
  });
  return pacientes;
}

/**
 * Obtiene todos los pacientes de la Base de Datos Maestra para el autocompletado,
 * y además obtiene el valor de la celda activa para precargarlo.
 *
 * Devuelve `allPatientsData` (nombre → teléfono, como siempre; lo usa el formulario
 * antiguo) y `pacientes` ([{ nombre, telefono, dni }]), que sí distingue a dos
 * pacientes con el mismo nombre.
 */
function obtenerPacientesParaAutocompletar() {
  try {
    const pacientes = leerPacientesMaestra_();
    const allPatientsData = {};
    pacientes.forEach(p => { allPatientsData[p.nombre] = p.telefono; });

    return { allPatientsData: allPatientsData, pacientes: pacientes };

  } catch (e) {
    Logger.log("Error en autocompletado: " + e.message);
    return { allPatientsData: {}, pacientes: [], error: e.message };
  }
}

// NOTA: normalizarFormatoNombre() se centralizó en core/Utils.gs (14/07/2026) para
// eliminar la definición duplicada que existía aquí. Ver core/Utils.gs — misma lógica, fuente única.

/**
 * Procesa los datos del formulario de valoración y los guarda.
 * Calcula los promedios de las secciones funcionales.
 * @param {object} data El objeto con los datos del formulario.
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

    // 1. Normalización Capa 2 (Servidor) - Ahora en mayúsculas siempre
    const nombreFinal = normalizarFormatoNombre(data.nombre);
    if (!nombreFinal) throw new Error("Nombre de paciente inválido.");

    // DNI del paciente: lo normal es que el formulario lo envíe ya elegido. Si no llega (p. ej. el
    // formulario antiguo del menú de Sheets), se busca en la Maestra por nombre; si ese nombre
    // corresponde a varios pacientes con DNI distintos, no se adivina: se pide elegir uno.
    let dni = (data.dni || "").toString().trim().toUpperCase();
    if (!dni) {
      const limpiar = s => s.toString().trim().replace(/\s+/g, ' ').toUpperCase();
      const coincidencias = leerPacientesMaestra_().filter(p => limpiar(p.nombre) === limpiar(nombreFinal));
      const dnisDistintos = Array.from(new Set(coincidencias.map(p => p.dni).filter(d => d)));
      if (dnisDistintos.length > 1) {
        throw new Error("Hay varios pacientes llamados '" + nombreFinal + "' (DNI distintos). Elige el paciente desde la Base de Datos o desde Valoraciones, donde se distinguen por DNI.");
      }
      if (dnisDistintos.length === 1) dni = dnisDistintos[0];
    }

    const tipoValoracion = data.tipoValoracion || "Inicial";
    const telefono = data.telefono || "";
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

    // 5. Preparar fila (Ajusta el orden según las columnas físicas de tu Google Sheets)
    const filaDatos = [
      fechaSolo,           // Fecha como objeto nativo
      tipoValoracion,       // Tipo (Inicial, Seguimiento, Final)
      nombreFinal,          // Nombre Normalizado
      telefono,             // Teléfono
      pegDolorOutput,       // PEG Dolor
      pegActividadOutput,   // PEG Actividad
      pegVidaOutput,        // PEG Vida
      mediaColumna,         // Media Columna
      mediaMS,              // Media MS
      mediaMI,              // Media MI
      mediaFG,              // Función Global
      analgesicosOutput,    // Analgésicos
      notas,                // Notas Clínicas
      dni                   // DNI (columna 14; vacío si el paciente no tiene DNI en la Maestra)
    ];

    sheet.appendRow(filaDatos);
    return `Valoración de tipo '${tipoValoracion}' guardada con éxito.`;

  } catch (e) {
    Logger.log("Error al procesar valoración: " + e.message);
    throw new Error("Error al guardar: " + e.message);
  }
}

