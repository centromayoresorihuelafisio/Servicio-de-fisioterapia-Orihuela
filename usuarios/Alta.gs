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
        } catch (e) {
          // Ignorar errores al acceder a celdas si la tabla no es la correcta
          Logger.log("Error checking cell in table (expected for non-matching tables): " + e);
          continue;
        }
      }

      if (altaActualizada) break; // Salimos del bucle de children
    }

    doc.saveAndClose();

    if (altaActualizada) {
      return `📅 Fecha de alta (${newText}).`;
    } else {
      return "⚠️ No se encontró la tabla de ASISTENCIA/ALTA o no hay celdas de ALTA vacías disponibles en el documento.";
    }

  } catch (e) {
    // Si el usuario del script no tiene permisos o el documento no existe.
    Logger.log("FATAL ERROR IN DOC UPDATE: " + e.toString());
    return "❌ Error al acceder o editar el documento. Esto puede deberse a permisos o a que el documento no existe: " + e.toString();
  }
}

/**
 * Versión de menú: da de alta al paciente de la fila seleccionada
 * en la hoja maestra.
 */
function darDeAltaPaciente() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.MAESTRA);

  if (!sheet) {
    ui.alert("No se encontró la hoja maestra de pacientes.");
    return;
  }

  // La selección activa pertenece a la hoja que está abierta: si no es la
  // maestra, la fila seleccionada no corresponde a ningún paciente.
  if (ss.getActiveSheet().getName() !== sheet.getName()) {
    ui.alert("Ve a la hoja '" + sheet.getName() + "' y selecciona la fila del paciente.");
    return;
  }

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
function darDeAltaPacienteWeb(idPaciente) {
  const ss = getSS();
  const sheet = ss.getSheetByName(SHEETS.MAESTRA);
  if (!sheet) return { success: false, message: "No se encontró la hoja 'Base de Datos Maestra'." };
  const rowIdx = filaMaestraPorId_(sheet, idPaciente);   // por ID paciente: el número de fila cambia al reordenar
  if (!rowIdx) return { success: false, message: "Ese usuario ya no está en la Base de Datos. Recarga la página." };

  const resultado = _ejecutarAltaEnFila(sheet, rowIdx);
  if (resultado.success) ordenarPacientes();
  return resultado;
}

/**
 * Lógica compartida: busca columnas por sinónimos, valida el estado actual,
 * actualiza Estado, Tipo de Ingreso y Última visita (la Fecha de inscripción
 * se conserva) y, si es posible, escribe la fecha de alta en el documento de
 * Historia Clínica enlazado. Devuelve { success, message } en vez de usar
 * ui.alert, para poder reutilizarse tanto desde el menú como desde la Web App.
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

  // Los sinónimos van por orden de prioridad: se busca primero el más
  // específico, y solo si no aparece se prueba el siguiente.
  const synonyms = {
    estado: ["estado", "status"],
    tipoIngreso: ["tipo de ingreso", "ingreso", "origen", "alta"],
    ultimaVisita: ["última visita", "visita"],
    historiaClinica: ["historia clínica", "historia", "enlace"],
  };

  const cleanHeaders = headers.map(clean);

  function findColumnIndex(targets) {
    for (const target of targets) {
      const idx = cleanHeaders.findIndex(h => h.includes(clean(target)));
      if (idx !== -1) return idx;
    }
    return -1;
  }

  const estadoCol = findColumnIndex(synonyms.estado);
  const tipoIngresoCol = findColumnIndex(synonyms.tipoIngreso);
  const ultimaVisitaCol = findColumnIndex(synonyms.ultimaVisita);
  const historiaClinicaCol = findColumnIndex(synonyms.historiaClinica);

  if (estadoCol === -1 || tipoIngresoCol === -1) {
    return { success: false, message: "Error: No se encontraron las columnas requeridas: 'Estado' o 'Tipo de Ingreso'. Por favor, verifica los encabezados." };
  }

  const isDocUpdatePossible = (historiaClinicaCol !== -1);

  const estadoRange = sheet.getRange(activeRow, estadoCol + 1);
  const tipoIngresoRange = sheet.getRange(activeRow, tipoIngresoCol + 1);

  const estadoActual = estadoRange.getValue();
  const tipoIngresoAntes = tipoIngresoRange.getValue();   // para el historial (CONTEXTO.md, sección 11, paso 4)
  if (estadoActual === ESTADOS_PACIENTE.ALTA) {
    return { success: false, message: "El usuario ya está dado de alta." };
  }

  const ultimaVisitaRange = (ultimaVisitaCol !== -1) ? sheet.getRange(activeRow, ultimaVisitaCol + 1) : null;

  estadoRange.setValue(ESTADOS_PACIENTE.ALTA);
  tipoIngresoRange.setValue("");

  // Historial: el alta cambia el Estado y vacía el Tipo de Ingreso (los dos influyen en la prioridad).
  const idCol = cleanHeaders.findIndex(h => h === clean(COLUMNAS.MAESTRA.ID_PACIENTE));
  const idPaciente = idCol === -1 ? '' : sheet.getRange(activeRow, idCol + 1).getValue();
  historialRegistrar_([
    { id: idPaciente, campo: COLUMNAS.MAESTRA.ESTADO, antes: estadoActual, despues: ESTADOS_PACIENTE.ALTA },
    { id: idPaciente, campo: COLUMNAS.MAESTRA.TIPO_INGRESO, antes: tipoIngresoAntes, despues: '' }
  ], 'Alta');
  // La Fecha de inscripción NO se toca: se conserva al dar el alta.

  let ultimaVisitaMsg = "";
  if (ultimaVisitaRange) {
    ultimaVisitaRange.setValue(new Date());
    ultimaVisitaMsg = "Fecha actualizada.";
  }

  let finalMessage = "✅ Alta correcta.";
  if (ultimaVisitaMsg) finalMessage += "\n" + ultimaVisitaMsg;

  if (isDocUpdatePossible) {
    const historiaClinicaRange = sheet.getRange(activeRow, historiaClinicaCol + 1);
    let docUrl = "";

    // 1. Hipervínculo en Rich Text (el caso habitual)
    try {
      const richText = historiaClinicaRange.getRichTextValue();
      if (richText) {
        const linkUrl = richText.getLinkUrl();
        if (linkUrl) docUrl = linkUrl;
      }
    } catch (e) { /* no era rich text */ }

    // 2. Fórmula HYPERLINK / HIPERVINCULO, o URL escrita como texto
    if (!docUrl) {
      const formula = historiaClinicaRange.getFormula();
      const match = formula && formula.match(/^=\s*(?:HYPERLINK|HIPERVINCULO)\s*\(\s*"(.*?)"\s*(?:[;,)])/i);
      if (match && match[1]) {
        docUrl = match[1];
      } else {
        const value = historiaClinicaRange.getValue();
        if (typeof value === 'string' && value.startsWith('http')) docUrl = value;
      }
    }

    if (docUrl) {
      // HC en la ficha web → la fecha de alta va al episodio abierto de "Episodios HC"; si el enlace aún es un Doc, como siempre.
      const docResult = hcEsFichaWeb_(docUrl) ? hcAltaEnHoja_(docUrl) : actualizarFechaAltaEnDoc(docUrl);
      finalMessage += "\n\n" + docResult;
    } else {
      finalMessage += "\n\n⚠️ No se encontró una URL válida de Historia Clínica (hipervínculo) para actualizar.";
    }
  }

  return { success: true, message: finalMessage };
}