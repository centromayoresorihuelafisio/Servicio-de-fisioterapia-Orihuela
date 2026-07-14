/**
 * Inserta la fecha actual en un documento de Google Docs a partir de su URL.
 * Busca la sección de ALTA en la tabla 'ASISTENCIA' y añade la fecha de hoy.
 */
function actualizarFechaAltaEnDoc(docUrl) {
  Logger.log("--- DEBUG DOC UPDATE ---");
  Logger.log("Attempting to update Doc URL: " + docUrl);
  try {
    // 1. Extraer el ID del documento de la URL
    const docIdMatch = docUrl.match(/[\w-]{25,}/);
    if (!docIdMatch) {
      Logger.log("Error: URL de Google Docs inválida.");
      return "Error: URL de Google Docs inválida o faltante.";
    }
    const docId = docIdMatch[0];
    Logger.log("Extracted Doc ID: " + docId);

    // 2. Abrir el documento
    const doc = DocumentApp.openById(docId);
    const body = doc.getBody();
    
    const newText = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy");
    let altaActualizada = false;

    // 3. Buscar la tabla de ASISTENCIA
    for (let i = 0; i < body.getNumChildren(); i++) {
      const child = body.getChild(i);
      
      if (child.getType() === DocumentApp.ElementType.TABLE) {
        const table = child.asTable();
        
        // Verificamos si la tabla contiene los encabezados relevantes.
        try {
            const firstCellText = table.getCell(0, 0).getText().trim().toUpperCase();
            Logger.log("Checking table: First cell text is '" + firstCellText + "'");
            
            if (firstCellText.includes("INGRESO") || firstCellText.includes("FECHA") || firstCellText.includes("ASISTENCIA")) {
                Logger.log("FOUND ASISTENCIA TABLE. Searching for empty ALTA cell...");
                
                // Iteramos sobre las filas de la tabla, empezando desde la segunda fila (índice 1)
                for (let r = 1; r < table.getNumRows(); r++) {
                    // Columna 1 (ALTA) - Recordar que la columna 0 es INGRESO, la 1 es ALTA
                    const altaCell = table.getCell(r, 1); 
                    
                    const cellContent = altaCell.getText().trim().toLowerCase();
                    Logger.log(`Row ${r}: ALTA cell content is '${cellContent}'`);

                    // Si la celda de ALTA está vacía o tiene el texto de placeholder "Fecha", escribimos la fecha
                    if (cellContent === "" || cellContent === "fecha") {
                        altaCell.setText(newText);
                        altaActualizada = true;
                        Logger.log(`Date written to row ${r}.`);
                        break; // Salimos del bucle de filas
                    }
                }
            }
        } catch(e) {
            // Ignorar errores al acceder a celdas si la tabla no es la correcta
            Logger.log("Error checking cell in table (expected for non-matching tables): " + e);
            continue;
        }

      }
      
      if (altaActualizada) break; // Salimos del bucle de children
    }

    doc.saveAndClose();

    if (altaActualizada) {
      return `✅ Fecha de alta (${newText}) actualizada en la Historia Clínica`;
    } else {
      return "⚠️ No se encontró la tabla de ASISTENCIA/ALTA o no hay celdas de ALTA vacías disponibles en el documento.";
    }

  } catch (e) {
    // Si el usuario del script no tiene permisos o el documento no existe.
    Logger.log("FATAL ERROR IN DOC UPDATE: " + e.toString());
    return "❌ Error al acceder o editar el documento. Esto puede deberse a permisos o a que el documento no existe: " + e.toString();
  }
}

// ... Resto de la función darDeAltaPaciente() queda igual

function darDeAltaPaciente() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.MAESTRA);
  
  const activeRow = sheet.getActiveRange().getRow();

  if (activeRow === 1) {
    ui.alert("Por favor, selecciona una fila de paciente para dar de alta.");
    return;
  }

  // --- Búsqueda de índices robusta con sinónimos ---
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  
  // Función de limpieza
  function clean(text) {
    return String(text || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .replace(/columna/g, "");
  }

  // Lista de sinónimos aceptados por columna
  const synonyms = {
    estado: ["estado", "status"],
    tipoIngreso: ["tipo de ingreso", "ingreso", "alta", "origen"],
    fechaInscripcion: ["fecha inscripción", "inscripción", "alta inicial"],
    ultimaVisita: ["última visita", "visita"],
    historiaClinica: ["historia clínica", "historia", "enlace"],
  };

  // Función que encuentra el índice de un grupo de sinónimos
  function findColumnIndex(targets) {
    return headers.findIndex(header => {
      const cleanHeader = clean(header);
      return targets.some(t => cleanHeader.includes(clean(t)));
    });
  }

  // Usar la función para cada columna
  const estadoCol = findColumnIndex(synonyms.estado);
  const tipoIngresoCol = findColumnIndex(synonyms.tipoIngreso);
  const fechaInscripcionCol = findColumnIndex(synonyms.fechaInscripcion);
  const ultimaVisitaCol = findColumnIndex(synonyms.ultimaVisita);
  const historiaClinicaCol = findColumnIndex(synonyms.historiaClinica);

  // Validar si se encontraron las columnas necesarias
  if (estadoCol === -1 || tipoIngresoCol === -1) {
    ui.alert("Error: No se encontraron las columnas requeridas: 'Estado' o 'Tipo de Ingreso'. Por favor, verifica los encabezados.");
    return;
  }
  
  const isDocUpdatePossible = (historiaClinicaCol !== -1);
  // --- Fin de la búsqueda de índices ---

  // Obtiene el rango de las celdas de estado y tipo de ingreso
  const estadoRange = sheet.getRange(activeRow, estadoCol + 1);
  const tipoIngresoRange = sheet.getRange(activeRow, tipoIngresoCol + 1);
  
  // 1. Verifica el estado actual
  const estadoActual = estadoRange.getValue();
  if (estadoActual === "✔️ Alta") {
    ui.alert("El paciente ya está dado de alta.");
    return;
  }
  
  // Obtiene los rangos de las fechas que deben modificarse (si existen)
  const fechaInscripcionRange = (fechaInscripcionCol !== -1) ? sheet.getRange(activeRow, fechaInscripcionCol + 1) : null;
  const ultimaVisitaRange = (ultimaVisitaCol !== -1) ? sheet.getRange(activeRow, ultimaVisitaCol + 1) : null;
  
  // 2. Realiza las acciones en la hoja de cálculo
  estadoRange.setValue("✔️ Alta");
  tipoIngresoRange.setValue(""); // Borrar Tipo de Ingreso
  
  // Borrar Fecha inscripción
  if (fechaInscripcionRange) {
      fechaInscripcionRange.setValue("");
  }

  // Actualizar Última visita a la fecha de hoy
  let ultimaVisitaMsg = "";
  if (ultimaVisitaRange) {
      const today = new Date();
      ultimaVisitaRange.setValue(today);
      ultimaVisitaMsg = "La fecha de última visita se ha actualizada.";
  }
  

  let finalMessage = "✅ Paciente dado de alta correctamente.";
  if (ultimaVisitaMsg) {
      finalMessage += "\n" + ultimaVisitaMsg;
  }

  // 3. Realiza la acción en Google Docs
  if (isDocUpdatePossible) {
    const historiaClinicaRange = sheet.getRange(activeRow, historiaClinicaCol + 1);
    
    let docUrl = "";
    
    // --- INICIO DEBUGGING LOGS ---
    Logger.log("--- DEBUG URL EXTRACTION ---");
    Logger.log("Active Row: " + activeRow);
    Logger.log("Column Index (1-based): " + (historiaClinicaCol + 1));
    Logger.log("Cell Value: " + historiaClinicaRange.getValue());
    
    // 1. PRIORIDAD: RICH TEXT VALUE (CELDAS CREADAS POR generarHistoriaClinica)
    try {
        const richText = historiaClinicaRange.getRichTextValue();
        if (richText) {
          // *** CORRECCIÓN CRÍTICA: getLinkUrl() SIN ARGUMENTOS ***
          const linkUrl = richText.getLinkUrl(); 
          if (linkUrl) {
            docUrl = linkUrl;
            Logger.log("URL found via RichTextValue (CORRECTED): " + docUrl);
          } else {
            Logger.log("RichTextValue found, but getLinkUrl() returned null.");
          }
        } else {
          Logger.log("RichTextValue is null (not Rich Text formatted).");
        }
    } catch(e) {
      Logger.log("Error al intentar RichTextValue: " + e);
    }

    // 2. RESPALDO A FÓRMULA o TEXTO PLANO
    if (!docUrl) {
        const formula = historiaClinicaRange.getFormula();
        Logger.log("Formula: " + formula);
        
        if (formula.startsWith('=HIPERVINCULO')) {
            // Es una fórmula =HIPERVINCULO(...)
            // Busca el patrón de URL entre comillas, aceptando ; o , como separador
            const match = formula.match(/=HIPERVINCULO\s*\(\s*\"(.*?)\"\s*[;,]/i);
            if (match && match[1]) {
                docUrl = match[1];
                Logger.log("URL found via Formula: " + docUrl);
            }
        } else if (typeof historiaClinicaRange.getValue() === 'string' && historiaClinicaRange.getValue().startsWith('http')) {
            // Opción de respaldo: Es una URL escrita directamente como texto.
             docUrl = historiaClinicaRange.getValue();
             Logger.log("URL found via Plain Text: " + docUrl);
        }
    }
    Logger.log("Final docUrl: " + docUrl);
    // --- FIN DEBUGGING LOGS ---

    if (docUrl) {
      const docResult = actualizarFechaAltaEnDoc(docUrl);
      finalMessage += "\n\n" + docResult;
    } else {
      finalMessage += "\n\n⚠️ No se encontró una URL válida de Historia Clínica (hipervínculo) para actualizar.";
    }
  }

  ui.alert(finalMessage);

  ordenarPacientes(); 
}