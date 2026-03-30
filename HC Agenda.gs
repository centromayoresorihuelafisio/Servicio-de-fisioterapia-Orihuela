/**
 * Inserta un hipervínculo a la Historia Clínica de los pacientes seleccionados.
 * SOPORTA SELECCIÓN MÚLTIPLE (Ctrl + Click) y filtra por validez de hora (Columna Hora).
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

    // Obtener todos los rangos seleccionados (Ctrl + Click)
    const rangeList = sheetAgenda.getActiveRangeList();
    if (!rangeList) return;
    const ranges = rangeList.getRanges();

    const headersAgenda = sheetAgenda.getRange(1, 1, 1, sheetAgenda.getMaxColumns()).getValues()[0];
    
    // 2. Determinar los índices de columna por nombre
    const COL_INDICES = {
      HORA: headersAgenda.findIndex(h => h.toString().trim() === 'Hora') + 1,
      USUARIO: headersAgenda.findIndex(h => h.toString().trim() === 'Usuario') + 1,
      HC_CLINICA: headersAgenda.findIndex(h => h.toString().trim() === 'Historia clínica') + 1
    };
    
    if (COL_INDICES.HORA === 0 || COL_INDICES.USUARIO === 0 || COL_INDICES.HC_CLINICA === 0) {
      ui.alert("Error", "No se encontraron las columnas 'Hora', 'Usuario' o 'Historia clínica'.", ui.ButtonSet.OK);
      return;
    }

    // --- OPTIMIZACIÓN: CARGA ÚNICA DE MAESTRA ---
    const mapaHistorias = cargarMapaHistoriasClinicas(ss);
    if (!mapaHistorias) return;

    let enlacesInsertados = 0;

    // 3. Iterar por cada rango seleccionado
    ranges.forEach(range => {
      const startRow = range.getRow();
      const numRows = range.getNumRows();
      
      for (let i = 0; i < numRows; i++) {
        const currentRow = startRow + i;
        
        // VALIDACIÓN DE SEGURIDAD BASADA EN TIPO DE DATO (Propuesta por el usuario)
        const valorHora = sheetAgenda.getRange(currentRow, COL_INDICES.HORA).getValue();
        
        // Verificamos si es un objeto Date válido (las horas en Sheets se importan como Date)
        // Si no es un Date, significa que es un texto (separador) o está vacío.
        if (!(valorHora instanceof Date) || isNaN(valorHora.getTime())) {
          continue; 
        }

        // Obtener el nombre del paciente
        const nombrePacienteRaw = sheetAgenda.getRange(currentRow, COL_INDICES.USUARIO).getValue().toString().trim();
        
        if (!nombrePacienteRaw) continue;

        // Buscar en el mapa cargado en memoria
        const enlaceInfo = mapaHistorias[nombrePacienteRaw.toLowerCase()];

        if (enlaceInfo) {
          const richTextValue = SpreadsheetApp.newRichTextValue()
            .setText("Ver Historia Clínica")
            .setLinkUrl(enlaceInfo.url)
            .build();
          
          sheetAgenda.getRange(currentRow, COL_INDICES.HC_CLINICA).setRichTextValue(richTextValue);
          enlacesInsertados++;
        }
      }
    });

    if (enlacesInsertados > 0) {
      ss.toast(`Se han insertado ${enlacesInsertados} enlaces de Historia Clínica.`, "Éxito", 3);
    } else {
      ui.alert("Información", "No se encontraron pacientes válidos o coincidencias en la Maestra.", ui.ButtonSet.OK);
    }

  } catch (e) {
    ui.alert("Error Crítico", e.message, ui.ButtonSet.OK);
  }
}

/**
 * Función auxiliar que crea un mapa de nombres -> URLs de HC
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
  
  if (values.length < 2) return null; 
  
  const headers = values[0].map(h => h.toString().trim());
  const colNombre = headers.indexOf('Nombre');
  const colHC = headers.indexOf('Historia clínica');

  if (colNombre === -1 || colHC === -1) {
    throw new Error("Columnas 'Nombre' o 'Historia clínica' no halladas en la Maestra.");
  }

  const mapa = {};

  for (let i = 1; i < values.length; i++) {
    const nombre = values[i][colNombre] ? values[i][colNombre].toString().trim() : '';
    if (!nombre) continue;

    const richTextCell = richTextValues[i][colHC];
    let url = richTextCell ? richTextCell.getLinkUrl() : null;

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