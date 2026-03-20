/**
 * Inserta un hipervínculo a la Historia Clínica del paciente seleccionado en la hoja de Agenda.
 * OPTIMIZADO: Lee la Base de Datos Maestra una sola vez para procesar múltiples filas instantáneamente.
 */
function insertarEnlaceHistoriaClinica() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  try {
    const sheetAgenda = ss.getActiveSheet();
    const sheetName = sheetAgenda.getName();

    // 1. Validar si es una hoja de Agenda
    if (!sheetName.startsWith("Agenda ")) {
      ui.alert("Error", "Esta función solo se puede usar en una hoja de 'Agenda AAAA-AAAA'.", ui.ButtonSet.OK);
      return;
    }

    const activeRange = sheetAgenda.getActiveRange(); 
    const headersAgenda = sheetAgenda.getRange(1, 1, 1, sheetAgenda.getMaxColumns()).getValues()[0];
    
    // 2. Determinar los índices de columna por nombre
    const COL_INDICES = {
      USUARIO: headersAgenda.findIndex(h => h.toString().trim() === 'Usuario') + 1,
      HC_CLINICA: headersAgenda.findIndex(h => h.toString().trim() === 'Historia clínica') + 1
    };
    
    if (COL_INDICES.USUARIO === 0 || COL_INDICES.HC_CLINICA === 0) {
      ui.alert("Error", "No se encontraron las columnas 'Usuario' o 'Historia clínica' en esta hoja.", ui.ButtonSet.OK);
      return;
    }

    // --- OPTIMIZACIÓN: CARGA ÚNICA DE MAESTRA ---
    const mapaHistorias = cargarMapaHistoriasClinicas(ss);
    if (!mapaHistorias) return;

    // 3. Iterar por las filas seleccionadas
    const startRow = activeRange.getRow();
    const numRows = activeRange.getNumRows();
    let enlacesInsertados = 0;

    for (let i = 0; i < numRows; i++) {
      const currentRow = startRow + i;
      
      // Obtener el nombre del paciente en la celda correspondiente de la fila actual
      const nombrePaciente = sheetAgenda.getRange(currentRow, COL_INDICES.USUARIO).getValue().toString().trim();
      
      if (!nombrePaciente) continue;

      // Buscar en el mapa cargado en memoria (Instantáneo)
      const enlaceInfo = mapaHistorias[nombrePaciente.toLowerCase()];

      if (enlaceInfo) {
        const richTextValue = SpreadsheetApp.newRichTextValue()
          .setText("Ver Historia Clínica")
          .setLinkUrl(enlaceInfo.url)
          .build();
        
        sheetAgenda.getRange(currentRow, COL_INDICES.HC_CLINICA).setRichTextValue(richTextValue);
        enlacesInsertados++;
      }
    }

    if (enlacesInsertados > 0) {
      ss.toast(`Se han insertado ${enlacesInsertados} enlaces de Historia Clínica.`, "Éxito", 3);
    } else {
      ui.alert("Información", "No se encontraron coincidencias para los nombres seleccionados en la Base de Datos Maestra.", ui.ButtonSet.OK);
    }

  } catch (e) {
    ui.alert("Error Crítico", e.message, ui.ButtonSet.OK);
  }
}

/**
 * Función auxiliar optimizada que crea un mapa de nombres -> URLs de HC
 * recorriendo la Base de Datos Maestra una sola vez.
 */
function cargarMapaHistoriasClinicas(ss) {
  const HOJA_MAESTRA = "Base de Datos Maestra";
  const sheetMaestra = ss.getSheetByName(HOJA_MAESTRA);
  
  if (!sheetMaestra) {
    throw new Error("No se encontró la hoja 'Base de Datos Maestra'.");
  }

  const dataRange = sheetMaestra.getDataRange();
  const values = dataRange.getValues();
  const richTextValues = dataRange.getRichTextValues(); 
  
  if (values.length < 2) return null; // Solo encabezados o vacía
  
  const headers = values[0].map(h => h.toString().trim());
  const colNombre = headers.indexOf('Nombre');
  const colHC = headers.indexOf('Historia clínica');

  if (colNombre === -1 || colHC === -1) {
    throw new Error("Columnas 'Nombre' o 'Historia clínica' no halladas en la Maestra.");
  }

  const mapa = {};

  // Recorrer los datos una sola vez y guardar en el objeto mapa
  for (let i = 1; i < values.length; i++) {
    const nombre = values[i][colNombre] ? values[i][colNombre].toString().trim() : '';
    if (!nombre) continue;

    // Extraer URL del RichText o del valor de celda
    const richTextCell = richTextValues[i][colHC];
    let url = richTextCell.getLinkUrl();

    if (!url) {
      const cellValue = values[i][colHC] ? values[i][colHC].toString().trim() : '';
      if (cellValue.toLowerCase().startsWith("http")) {
        url = cellValue;
      }
    }

    if (url) {
      mapa[nombre.toLowerCase()] = { url: url };
    }
  }

  return mapa;
}