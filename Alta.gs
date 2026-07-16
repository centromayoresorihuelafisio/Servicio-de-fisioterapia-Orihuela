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

  const resultado = _ejecutarAltaEnFila(sheet, activeRow);
  ui.alert(resultado.message);
  if (resultado.success) ordenarPacientes();
}

/**
 * Versión web-safe: da de alta al paciente de `fila`, para usar desde el
 * botón "Dar de Alta" de la Base de Datos Web.
 */
function darDeAltaPacienteWeb(fila) {
  const rowIdx = parseInt(fila, 10);
  const ss = getSS();
  const sheet = ss.getSheetByName(SHEETS.MAESTRA);
  if (!sheet) return { success: false, message: "No se encontró la hoja 'Base de Datos Maestra'." };
  if (!rowIdx || rowIdx < 2) return { success: false, message: "Fila de paciente no válida." };

  const resultado = _ejecutarAltaEnFila(sheet, rowIdx);
  if (resultado.success) ordenarPacientes();
  return resultado;
}

/**
 * Lógica compartida (antes dentro de darDeAltaPaciente): busca columnas por
 * sinónimos, valida el estado actual, actualiza Estado/Tipo de Ingreso/Fechas
 * y, si es posible, escribe la fecha de alta en el documento de Historia
 * Clínica enlazado. Devuelve { success, message } en vez de usar ui.alert,
 * para poder reutilizarse tanto desde el menú como desde la Web App.
 */
function _ejecutarAltaEnFila(sheet, activeRow) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  function clean(text) {
    return String(text || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .replace(/columna/g, "");
  }

  const synonyms = {
    estado: ["estado", "status"],
    tipoIngreso: ["tipo de ingreso", "ingreso", "alta", "origen"],
    fechaInscripcion: ["fecha inscripción", "inscripción", "alta inicial"],
    ultimaVisita: ["última visita", "visita"],
    historiaClinica: ["historia clínica", "historia", "enlace"],
  };

  function findColumnIndex(targets) {
    return headers.findIndex(header => {
      const cleanHeader = clean(header);
      return targets.some(t => cleanHeader.includes(clean(t)));
    });
  }

  const estadoCol = findColumnIndex(synonyms.estado);
  const tipoIngresoCol = findColumnIndex(synonyms.tipoIngreso);
  const fechaInscripcionCol = findColumnIndex(synonyms.fechaInscripcion);
  const ultimaVisitaCol = findColumnIndex(synonyms.ultimaVisita);
  const historiaClinicaCol = findColumnIndex(synonyms.historiaClinica);

  if (estadoCol === -1 || tipoIngresoCol === -1) {
    return { success: false, message: "Error: No se encontraron las columnas requeridas: 'Estado' o 'Tipo de Ingreso'. Por favor, verifica los encabezados." };
  }

  const isDocUpdatePossible = (historiaClinicaCol !== -1);

  const estadoRange = sheet.getRange(activeRow, estadoCol + 1);
  const tipoIngresoRange = sheet.getRange(activeRow, tipoIngresoCol + 1);

  const estadoActual = estadoRange.getValue();
  if (estadoActual === "✔️ Alta") {
    return { success: false, message: "El paciente ya está dado de alta." };
  }

  const fechaInscripcionRange = (fechaInscripcionCol !== -1) ? sheet.getRange(activeRow, fechaInscripcionCol + 1) : null;
  const ultimaVisitaRange = (ultimaVisitaCol !== -1) ? sheet.getRange(activeRow, ultimaVisitaCol + 1) : null;

  estadoRange.setValue("✔️ Alta");
  tipoIngresoRange.setValue("");

  if (fechaInscripcionRange) fechaInscripcionRange.setValue("");

  let ultimaVisitaMsg = "";
  if (ultimaVisitaRange) {
    ultimaVisitaRange.setValue(new Date());
    ultimaVisitaMsg = "La fecha de última visita se ha actualizada.";
  }

  let finalMessage = "✅ Paciente dado de alta correctamente.";
  if (ultimaVisitaMsg) finalMessage += "\n" + ultimaVisitaMsg;

  if (isDocUpdatePossible) {
    const historiaClinicaRange = sheet.getRange(activeRow, historiaClinicaCol + 1);
    let docUrl = "";

    try {
      const richText = historiaClinicaRange.getRichTextValue();
      if (richText) {
        const linkUrl = richText.getLinkUrl();
        if (linkUrl) docUrl = linkUrl;
      }
    } catch (e) { /* no era rich text */ }

    if (!docUrl) {
      const formula = historiaClinicaRange.getFormula();
      if (formula.startsWith('=HIPERVINCULO')) {
        const match = formula.match(/=HIPERVINCULO\s*\(\s*\"(.*?)\"\s*[;,]/i);
        if (match && match[1]) docUrl = match[1];
      } else if (typeof historiaClinicaRange.getValue() === 'string' && historiaClinicaRange.getValue().startsWith('http')) {
        docUrl = historiaClinicaRange.getValue();
      }
    }

    if (docUrl) {
      const docResult = actualizarFechaAltaEnDoc(docUrl);
      finalMessage += "\n\n" + docResult;
    } else {
      finalMessage += "\n\n⚠️ No se encontró una URL válida de Historia Clínica (hipervínculo) para actualizar.";
    }
  }

  return { success: true, message: finalMessage };
}