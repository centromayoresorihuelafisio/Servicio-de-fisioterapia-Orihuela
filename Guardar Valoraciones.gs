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

    // --- LÓGICA DE CORRECCIÓN: Función auxiliar para calcular promedio seguro ---
    /**
     * Calcula el promedio de un array de valores, ignorando NaN y devuelve
     * null si no hay valores válidos para promediar.
     * @param {number[]} values Array de valores numéricos (puede contener NaN).
     * @returns {number|null} El promedio redondeado o null.
     */
    const safeAverage = (values) => {
      // 1. Filtrar los valores válidos (que no sean NaN)
      const validValues = values.filter(v => !isNaN(v));
      
      // 2. Si no hay valores válidos, retorna null.
      if (validValues.length === 0) return null; 

      // 3. Calcular la suma y el promedio
      const sum = validValues.reduce((acc, current) => acc + current, 0);
      return Math.round(sum / validValues.length);
    };

    // --- PROCESAMIENTO DE DATOS ---
    
    // Convertir los valores PEG y Analgésicos. Si es NaN (no valorado), guardamos null
    const pegDolor = parseFloat(data.pegDolor);
    const pegActividad = parseFloat(data.pegActividad);
    const pegVida = parseFloat(data.pegVida);
    const analgesicos = parseInt(data.analgesicos, 10);
    
    // Los campos individuales se guardan como null si no fueron valorados (NaN)
    const pegDolorOutput = isNaN(pegDolor) ? null : pegDolor;
    const pegActividadOutput = isNaN(pegActividad) ? null : pegActividad;
    const pegVidaOutput = isNaN(pegVida) ? null : pegVida;
    const analgesicosOutput = isNaN(analgesicos) ? null : analgesicos;


    // 1. Calcular la media de cada sección funcional (USANDO safeAverage)
    
    // Columna
    const columnaLevantarse = parseFloat(data.columnaLevantarse);
    const columnaAgacharse = parseFloat(data.columnaAgacharse);
    let mediaColumna = safeAverage([columnaLevantarse, columnaAgacharse]);

    // Miembro Superior (MS)
    const msVestirse = parseFloat(data.msVestirse);
    const msAlcanzar = parseFloat(data.msAlcanzar);
    let mediaMS = safeAverage([msVestirse, msAlcanzar]);

    // Miembro Inferior (MI)
    const miCaminar = parseFloat(data.miCaminar);
    const miEscaleras = parseFloat(data.miEscaleras);
    const miSilla = parseFloat(data.miSilla);
    let mediaMI = safeAverage([miCaminar, miEscaleras, miSilla]);

    // 2. Calcular la media de la Función Global (FG), solo promediando promedios válidos
    const promediosFuncionales = [mediaColumna, mediaMS, mediaMI];
    // Quitamos los nulls (ítems no valorados) antes de llamar a safeAverage
    let mediaFG = safeAverage(promediosFuncionales.filter(v => v !== null)); 

    // 3. SANITIZACIÓN FINAL (Asegura que no se escriba NaN, aunque safeAverage debería evitarlo)
    mediaColumna = isNaN(mediaColumna) ? null : mediaColumna;
    mediaMS = isNaN(mediaMS) ? null : mediaMS;
    mediaMI = isNaN(mediaMI) ? null : mediaMI;
    mediaFG = isNaN(mediaFG) ? null : mediaFG;


    // 4. Preparar la fila para la hoja de cálculo
    const filaDatos = [
// ELIMINA ESTA LÍNEA COMPLETA:
//      new Date(), // Fecha actual
// Y REEMPLÁZALA POR LA SIGUIENTE:
      new Date().toLocaleDateString('es-ES'), // Solo la fecha en formato local
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

    // Añadir la nueva fila a la hoja de cálculo
    sheet.appendRow(filaDatos);

    return "Valoración guardada con éxito.";

  } catch (e) {
    Logger.log("Error al procesar valoración: " + e.message);
    throw new Error("Error al guardar la valoración: " + e.message);
  }
}
