/**
 * Procesa los datos del formulario de valoración, calcula los promedios
 * de las secciones funcionales y los guarda en la hoja de cálculo.
 * @param {object} data El objeto con los datos del formulario.
 * @returns {string} Un mensaje de éxito o fracaso.
 */
function procesarValoracion(data) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("Valoraciones");
    if (!sheet) {
      throw new Error("No se encontró la hoja 'Valoraciones'.");
    }

    /**
     * Calcula el promedio de un array de valores, ignorando null, undefined y NaN.
     * Devuelve null si no hay valores válidos.
     * @param {Array} values Array de valores (puede contener null, undefined o NaN).
     * @returns {number|null} El promedio redondeado o null.
     */
    const safeAverage = (values) => {
      const validValues = values.filter(v => v !== null && v !== undefined && !isNaN(v));
      if (validValues.length === 0) return null;
      const sum = validValues.reduce((acc, current) => acc + current, 0);
      return Math.round(sum / validValues.length);
    };

    // --- PROCESAMIENTO DE DATOS ---

    // Convertir valores PEG y Analgésicos. Si es NaN (no valorado), se guarda null.
    const pegDolor     = parseFloat(data.pegDolor);
    const pegActividad = parseFloat(data.pegActividad);
    const pegVida      = parseFloat(data.pegVida);
    const analgesicos  = parseInt(data.analgesicos, 10);

    const pegDolorOutput     = isNaN(pegDolor)     ? null : pegDolor;
    const pegActividadOutput = isNaN(pegActividad) ? null : pegActividad;
    const pegVidaOutput      = isNaN(pegVida)      ? null : pegVida;
    const analgesicosOutput  = isNaN(analgesicos)  ? null : analgesicos;

    // 1. Calcular la media de cada sección funcional
    const mediaColumna = safeAverage([
      parseFloat(data.columnaLevantarse),
      parseFloat(data.columnaAgacharse),
    ]);

    const mediaMS = safeAverage([
      parseFloat(data.msVestirse),
      parseFloat(data.msAlcanzar),
    ]);

    const mediaMI = safeAverage([
      parseFloat(data.miCaminar),
      parseFloat(data.miEscaleras),
      parseFloat(data.miSilla),
    ]);

    // 2. Calcular la Función Global (FG) promediando solo las secciones valoradas.
    //    safeAverage ya ignora los null internamente, no hace falta filtrar antes.
    const mediaFG = safeAverage([mediaColumna, mediaMS, mediaMI]);

    // 3. Preparar la fila para la hoja de cálculo
    const filaDatos = [
      new Date().toLocaleDateString('es-ES'),
      data.nombre,
      pegDolorOutput,
      pegActividadOutput,
      pegVidaOutput,
      mediaColumna,
      mediaMS,
      mediaMI,
      mediaFG,
      analgesicosOutput,
    ];

    sheet.appendRow(filaDatos);
    return "Valoración guardada con éxito.";

  } catch (e) {
    Logger.log("Error al procesar valoración: " + e.message);
    throw new Error("Error al guardar la valoración: " + e.message);
  }
}
/**
 * Función de testeo de errores de cálculo
 */
function testProcesarValoracion() {
  const casos = [
    {
      nombre: "Caso 1 – Todo valorado",
      data: {
        nombre: "Paciente A",
        pegDolor: "7", pegActividad: "5", pegVida: "6",
        columnaLevantarse: "4", columnaAgacharse: "6",
        msVestirse: "3", msAlcanzar: "5",
        miCaminar: "4", miEscaleras: "6", miSilla: "2",
        analgesicos: "2",
      },
      // mediaColumna=5, mediaMS=4, mediaMI=4 → mediaFG=4
      esperado: { mediaColumna: 5, mediaMS: 4, mediaMI: 4, mediaFG: 4 },
    },
    {
      nombre: "Caso 2 – Columna no valorada",
      data: {
        nombre: "Paciente B",
        pegDolor: "", pegActividad: "", pegVida: "",
        columnaLevantarse: "", columnaAgacharse: "",  // <-- sin valorar
        msVestirse: "6", msAlcanzar: "4",
        miCaminar: "8", miEscaleras: "6", miSilla: "4",
        analgesicos: "",
      },
      // mediaColumna=null, mediaMS=5, mediaMI=6 → mediaFG=6 (solo MS y MI)
      esperado: { mediaColumna: null, mediaMS: 5, mediaMI: 6, mediaFG: 6 },
    },
    {
      nombre: "Caso 3 – Nada valorado",
      data: {
        nombre: "Paciente C",
        pegDolor: "", pegActividad: "", pegVida: "",
        columnaLevantarse: "", columnaAgacharse: "",
        msVestirse: "", msAlcanzar: "",
        miCaminar: "", miEscaleras: "", miSilla: "",
        analgesicos: "",
      },
      // Todo null → mediaFG debe ser null, no 0
      esperado: { mediaColumna: null, mediaMS: null, mediaMI: null, mediaFG: null },
    },
  ];

  // Replicar la lógica de safeAverage aquí para poder testearla de forma aislada
  const safeAverage = (values) => {
    const validValues = values.filter(v => v !== null && v !== undefined && !isNaN(v));
    if (validValues.length === 0) return null;
    const sum = validValues.reduce((acc, current) => acc + current, 0);
    return Math.round(sum / validValues.length);
  };

  let todosCorrecto = true;

  casos.forEach(caso => {
    const d = caso.data;
    const mediaColumna = safeAverage([parseFloat(d.columnaLevantarse), parseFloat(d.columnaAgacharse)]);
    const mediaMS      = safeAverage([parseFloat(d.msVestirse), parseFloat(d.msAlcanzar)]);
    const mediaMI      = safeAverage([parseFloat(d.miCaminar), parseFloat(d.miEscaleras), parseFloat(d.miSilla)]);
    const mediaFG      = safeAverage([mediaColumna, mediaMS, mediaMI]);

    const resultados = { mediaColumna, mediaMS, mediaMI, mediaFG };
    const esp        = caso.esperado;

    const ok =
      resultados.mediaColumna === esp.mediaColumna &&
      resultados.mediaMS      === esp.mediaMS      &&
      resultados.mediaMI      === esp.mediaMI      &&
      resultados.mediaFG      === esp.mediaFG;

    if (ok) {
      Logger.log(`✅ ${caso.nombre} → CORRECTO`);
    } else {
      todosCorrecto = false;
      Logger.log(`❌ ${caso.nombre} → ERROR`);
      Logger.log(`   Esperado:  ${JSON.stringify(esp)}`);
      Logger.log(`   Obtenido:  ${JSON.stringify(resultados)}`);
    }
  });

  Logger.log(todosCorrecto ? "✅ Todos los tests pasaron." : "❌ Hay fallos. Revisa los logs.");
}