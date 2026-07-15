/**
 * Abre la interfaz de usuario para el formulario de valoración.
 */
function abrirFormularioValoracion() {
  const ui = SpreadsheetApp.getUi();
  const tmpl = HtmlService.createTemplateFromFile('Valoracion');
  
  const html = tmpl.evaluate()
      .setWidth(800)
      .setHeight(850);
      
  ui.showModalDialog(html, ' ');
}

/**
 * Obtiene todos los pacientes de la Base de Datos Maestra para el autocompletado,
 * y además obtiene el valor de la celda activa para precargarlo.
 */
function obtenerPacientesParaAutocompletar() {
  const HOJA_MAESTRA = SHEETS.MAESTRA;
  const COLUMNA_NOMBRE = COLUMNAS_NUM.MAESTRA.NOMBRE;   // Columna B (Nombre)
  const COLUMNA_TELEFONO = COLUMNAS_NUM.MAESTRA.TELEFONO; // Columna D (Teléfono)
  
  try {
    const ss = getSS(); // Lista completa: funciona igual desde cualquier contexto
    
    // Valor de la celda activa: SOLO existe con sesión de usuario real (menú)
    let activeCellValue = "";
    try {
      const activeSS = SpreadsheetApp.getActiveSpreadsheet();
      const activeCell = activeSS.getActiveCell();
      if (activeCell) {
        activeCellValue = activeCell.getValue().toString().trim().toUpperCase();
      }
    } catch(e) {
      // Sin sesión activa (Web App) → seguimos sin celda precargada, sin problema
    }

    const sheet = ss.getSheetByName(HOJA_MAESTRA);
    if (!sheet) return { allPatientsData: {}, activeCellValue: activeCellValue };

    const lastRow = sheet.getLastRow();
    const allPatientsData = {}; 
    
    if (lastRow > 1) {
      const allDataRange = sheet.getRange(2, COLUMNA_NOMBRE, lastRow - 1, COLUMNA_TELEFONO - COLUMNA_NOMBRE + 1);
      const allData = allDataRange.getValues(); 
      
      allData.forEach(row => {
        const name = row[0] ? row[0].toString().trim() : '';
        const phone = row[row.length - 1] ? row[row.length - 1].toString().trim() : '';
        
        if (name) {
          allPatientsData[name] = phone;
        }
      });
    }
    
    return { allPatientsData: allPatientsData, activeCellValue: activeCellValue };
    
  } catch (e) {
    Logger.log("Error en autocompletado: " + e.message);
    return { allPatientsData: {}, activeCellValue: "", error: e.message };
  }
}

// NOTA: normalizarFormatoNombre() se centralizó en Utils.gs (14/07/2026) para
// eliminar la definición duplicada que existía aquí. Ver Utils.gs — misma lógica, fuente única.

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
      notas                 // Notas Clínicas
    ];

    sheet.appendRow(filaDatos);
    return `Valoración de tipo '${tipoValoracion}' guardada con éxito.`;

  } catch (e) {
    Logger.log("Error al procesar valoración: " + e.message);
    throw new Error("Error al guardar: " + e.message);
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
        nombre: "paciente a", tipoValoracion: "Inicial", telefono: "123",
        pegDolor: "7", pegActividad: "5", pegVida: "6",
        columnaLevantarse: "4", columnaAgacharse: "6",
        msVestirse: "3", msAlcanzar: "5",
        miCaminar: "4", miEscaleras: "6", miSilla: "2",
        analgesicos: "2", notas: "Nota test"
      },
      esperado: { mediaColumna: 5, mediaMS: 4, mediaMI: 4, mediaFG: 4.3 }, // 13/3 = 4.333 -> 4.3
    },
    {
      nombre: "Caso 2 – Columna no valorada",
      data: {
        nombre: "PACIENTE B", tipoValoracion: "Seguimiento", telefono: "",
        pegDolor: "", pegActividad: "", pegVida: "",
        columnaLevantarse: "", columnaAgacharse: "",
        msVestirse: "6", msAlcanzar: "4",
        miCaminar: "8", miEscaleras: "6", miSilla: "4",
        analgesicos: "", notas: ""
      },
      esperado: { mediaColumna: null, mediaMS: 5, mediaMI: 6, mediaFG: 5.5 }, // 11/2 = 5.5
    },
    {
      nombre: "Caso 3 – Nada valorado",
      data: {
        nombre: "Paciente C",
        pegDolor: "", pegActividad: "", pegVida: "",
        columnaLevantarse: "", columnaAgacharse: "",
        msVestirse: "", msAlcanzar: "",
        miCaminar: "", miEscaleras: "", miSilla: "",
        analgesicos: "", notas: ""
      },
      esperado: { mediaColumna: null, mediaMS: null, mediaMI: null, mediaFG: null },
    },
  ];

  const safeAverage = (values) => {
    const validValues = values.filter(v => v !== null && v !== undefined && !isNaN(v));
    if (validValues.length === 0) return null;
    const sum = validValues.reduce((acc, current) => acc + current, 0);
    return Math.round((sum / validValues.length) * 10) / 10;
  };
  const parseOrNull = (val) => (val === "" || val === null || isNaN(parseFloat(val))) ? null : parseFloat(val);

  let todosCorrecto = true;

  casos.forEach(caso => {
    const d = caso.data;
    const mediaColumna = safeAverage([parseOrNull(d.columnaLevantarse), parseOrNull(d.columnaAgacharse)]);
    const mediaMS      = safeAverage([parseOrNull(d.msVestirse), parseOrNull(d.msAlcanzar)]);
    const mediaMI      = safeAverage([parseOrNull(d.miCaminar), parseOrNull(d.miEscaleras), parseOrNull(d.miSilla)]);
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