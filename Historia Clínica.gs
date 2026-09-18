/**
 * Generar historia clínica para el paciente de la fila activa (menú de Sheets).
 */
function generarHistoriaClinica() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.MAESTRA);
  if (!sheet) { ui.alert("Error: La hoja 'Base de Datos Maestra' no existe."); return; }

  const activeRange = sheet.getActiveRange();
  const rowIndex = activeRange.getRow();
  if (rowIndex === 1) { ui.alert("Selecciona una fila que contenga los datos de un paciente."); return; }

  const resultado = _generarHistoriaClinicaEnFila(sheet, rowIndex);
  if (!resultado.success) {
    ui.alert(resultado.message);
    return;
  }
  ss.toast(resultado.message, '✅ Completado', 6);
}

/**
 * Versión web-safe: genera la historia clínica del paciente de `fila`,
 * para usar desde el botón "Historia Clínica" de la Base de Datos Web.
 */
function generarHistoriaClinicaWeb(fila) {
  const rowIndex = parseInt(fila, 10);
  const ss = getSS();
  const sheet = ss.getSheetByName(SHEETS.MAESTRA);
  if (!sheet) return { success: false, message: "Error: La hoja 'Base de Datos Maestra' no existe." };
  if (!rowIndex || rowIndex < 2) return { success: false, message: "Fila de paciente no válida." };

  return _generarHistoriaClinicaEnFila(sheet, rowIndex);
}

/**
 * Lógica compartida (antes duplicada dentro de generarHistoriaClinica): genera
 * el documento a partir de la plantilla, rellena las etiquetas {{...}} y
 * enlaza el resultado en la columna "Historia clínica" de la fila indicada.
 */
function _generarHistoriaClinicaEnFila(sheet, rowIndex) {
  const scriptProperties = PropertiesService.getScriptProperties();
  const templateId = scriptProperties.getProperty(PROP_KEYS.DOC_TEMPLATE_ID);
  const folderId = scriptProperties.getProperty(PROP_KEYS.DRIVE_FOLDER_ID);

  if (!templateId || !folderId) {
    return {
      success: false,
      message: '⚠️ Falta configurar el ID de la Plantilla o de la Carpeta de Destino.\nVe al menú ⚙️ Config y actualiza los valores.'
    };
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => h.toString().trim());
  const data = sheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0];

  const patientData = {};
  headers.forEach((header, index) => { patientData[header.toLowerCase()] = data[index]; });

  const nombre = patientData[COLUMNAS.MAESTRA.NOMBRE.toLowerCase()] || '';
  if (!nombre) return { success: false, message: 'Esa fila no tiene un paciente válido.' };

  // --- VALIDACIÓN ANTI-DUPLICADOS ---
  // Si esta fila ya tiene una Historia Clínica enlazada, no generamos otra:
  // antes, cada clic en "Historia Clínica" (o un reenvío del formulario de
  // alta) creaba un documento nuevo en Drive y machacaba el enlace anterior,
  // dejando el documento viejo huérfano y sin que nadie se enterase.
  // Se comprueba con extraerUrlHistoriaClinica() para cubrir los tres
  // formatos posibles de celda: Rich Text, fórmula =HIPERVINCULO() y texto plano.
  const colIndex = headers.findIndex(h => h.toLowerCase() === COLUMNAS.MAESTRA.HISTORIA_CLINICA.toLowerCase());
  if (colIndex !== -1) {
    const celdaHC = sheet.getRange(rowIndex, colIndex + 1);
    const urlExistente = extraerUrlHistoriaClinica(
      data[colIndex],
      celdaHC.getRichTextValue(),
      celdaHC.getFormula()
    );
    if (urlExistente) {
      return {
        success: false,
        message: `${nombre} ya tiene una Historia Clínica enlazada.\n\nSi necesitas crear una nueva, borra antes el enlace de la columna "${COLUMNAS.MAESTRA.HISTORIA_CLINICA}".`,
        url: urlExistente
      };
    }
  }

  const dni = patientData[COLUMNAS.MAESTRA.DNI.toLowerCase()] || '';
  const edad = patientData[COLUMNAS.MAESTRA.EDAD.toLowerCase()] || '';
  const telefono1 = patientData[COLUMNAS.MAESTRA.TELEFONO_1.toLowerCase()] || '';
  const telefono2 = patientData[COLUMNAS.MAESTRA.TELEFONO_2.toLowerCase()] || '';
  let fechaInscripcion = patientData[COLUMNAS.MAESTRA.FECHA_INSCRIPCION.toLowerCase()] || patientData['fecha_inscripción'] || '';
  let fechaNacimiento = patientData[COLUMNAS.MAESTRA.FECHA_NACIMIENTO.toLowerCase()] || patientData['fecha_nacimiento'] || '';

  const parseGoogleSheetDate = (value) => {
    if (!value) return '';
    if (value instanceof Date) return value;
    if (typeof value === 'number') return new Date(Math.round((value - 25569) * 86400 * 1000));
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) return parsed;
    return null;
  };
  fechaInscripcion = parseGoogleSheetDate(fechaInscripcion);
  fechaNacimiento = parseGoogleSheetDate(fechaNacimiento);

  const formatDate = (date) => date ? Utilities.formatDate(date, Session.getScriptTimeZone(), 'dd/MM/yyyy') : '';

  const targetFolder = DriveApp.getFolderById(folderId);
  const newDocName = `HISTORIA CLINICA ${nombre}${dni ? ' ' + dni : ''}`;
  const newDocFile = DriveApp.getFileById(templateId).makeCopy(newDocName, targetFolder);
  const newDoc = DocumentApp.openById(newDocFile.getId());
  const body = newDoc.getBody();

  body.replaceText('{{nombre}}', nombre);
  body.replaceText('{{dni}}', dni);
  body.replaceText('{{edad}}', edad);
  body.replaceText('{{telefono1}}', telefono1);
  body.replaceText('{{telefono2}}', telefono2);
  body.replaceText('{{fechaInscripcion}}', formatDate(fechaInscripcion));
  body.replaceText('{{fechaNacimiento}}', formatDate(fechaNacimiento));

  newDoc.saveAndClose();

  const newDocUrl = newDoc.getUrl();
  // colIndex ya se calculó arriba, en la validación anti-duplicados.
  if (colIndex !== -1) {
    const richText = SpreadsheetApp.newRichTextValue().setText("Ver Historia Clínica").setLinkUrl(newDocUrl).build();
    sheet.getRange(rowIndex, colIndex + 1).setRichTextValue(richText);
  }

  return { success: true, message: `Historia clínica generada correctamente para ${nombre}.`, url: newDocUrl };
}
/**
 * Actualiza los datos personales en una Historia Clínica ya existente (Google Doc).
 * Busca la tabla de datos personales y sobrescribe las celdas adyacentes a las etiquetas.
 * Además, renombra el archivo para reflejar el DNI si ha sido añadido.
 */
function actualizarDatosHistoriaClinicaWeb(fila) {
  const rowIndex = parseInt(fila, 10);
  const ss = getSS();
  const sheet = ss.getSheetByName(SHEETS.MAESTRA);
  if (!sheet) return { success: false, message: "No se encontró la hoja 'Base de Datos Maestra'." };
  if (!rowIndex || rowIndex < 2) return { success: false, message: "Fila no válida." };

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => h.toString().trim());
  const data = sheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0];

  // Construir objeto con los datos actuales del paciente
  const patientData = {};
  headers.forEach((h, i) => patientData[h.toLowerCase()] = data[i]);

  const idxHC = headers.findIndex(h => h.toLowerCase() === COLUMNAS.MAESTRA.HISTORIA_CLINICA.toLowerCase());
  if (idxHC === -1) return { success: false, message: "No se encontró la columna Historia clínica." };

  // Extraer la URL actual
  const celdaHC = sheet.getRange(rowIndex, idxHC + 1);
  const docUrl = extraerUrlHistoriaClinica(data[idxHC], celdaHC.getRichTextValue(), celdaHC.getFormula());

  if (!docUrl) {
    return { success: false, message: "⚠️ Este paciente no tiene ninguna Historia Clínica enlazada para actualizar." };
  }

  // Formatear fechas
  const parseGoogleSheetDate = (value) => {
    if (!value) return '';
    if (value instanceof Date) return value;
    if (typeof value === 'number') return new Date(Math.round((value - 25569) * 86400 * 1000));
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) return parsed;
    return null;
  };

  let fInsc = parseGoogleSheetDate(patientData[COLUMNAS.MAESTRA.FECHA_INSCRIPCION.toLowerCase()]);
  let fNac = parseGoogleSheetDate(patientData[COLUMNAS.MAESTRA.FECHA_NACIMIENTO.toLowerCase()]);
  const formatDate = (date) => date ? Utilities.formatDate(date, Session.getScriptTimeZone(), 'dd/MM/yyyy') : '';

  const updateData = {
    nombre: patientData[COLUMNAS.MAESTRA.NOMBRE.toLowerCase()] || '',
    dni: patientData[COLUMNAS.MAESTRA.DNI.toLowerCase()] || '',
    edad: patientData[COLUMNAS.MAESTRA.EDAD.toLowerCase()] || '',
    telefono1: patientData[COLUMNAS.MAESTRA.TELEFONO_1.toLowerCase()] || '',
    telefono2: patientData[COLUMNAS.MAESTRA.TELEFONO_2.toLowerCase()] || '',
    fechaInscripcion: formatDate(fInsc),
    fechaNacimiento: formatDate(fNac)
  };

  try {
    const docIdMatch = docUrl.match(/[-\w]{25,}/);
    if (!docIdMatch) return { success: false, message: "La URL de la Historia Clínica es inválida." };

    const docId = docIdMatch[0];
    const doc = DocumentApp.openById(docId);
    const body = doc.getBody();
    const tables = body.getTables();
    let tableUpdated = false;

    // Buscar la tabla de DATOS PERSONALES
    for (let t = 0; t < tables.length; t++) {
      let table = tables[t];
      let text = table.getText().toLowerCase();
      
      // Condición para saber si es la tabla correcta
      if (text.includes("nombre") && (text.includes("dni") || text.includes("teléfono"))) {
        for (let r = 0; r < table.getNumRows(); r++) {
          let row = table.getRow(r);
          
          // Iteramos por las celdas buscando la etiqueta, y si la encontramos, actualizamos la celda de su DERECHA
          for (let c = 0; c < row.getNumCells() - 1; c++) {
            let label = row.getCell(c).getText().trim().toLowerCase();
            let cellToUpdate = row.getCell(c + 1);

            if (label === "nombre") { cellToUpdate.setText(updateData.nombre); tableUpdated = true; }
            else if (label === "dni") { cellToUpdate.setText(updateData.dni); tableUpdated = true; }
            else if (label === "fecha nacimiento") { cellToUpdate.setText(updateData.fechaNacimiento); tableUpdated = true; }
            else if (label === "edad") { cellToUpdate.setText(updateData.edad); tableUpdated = true; }
            else if (label === "teléfono 1") { cellToUpdate.setText(updateData.telefono1); tableUpdated = true; }
            else if (label === "teléfono 2") { cellToUpdate.setText(updateData.telefono2); tableUpdated = true; }
            else if (label === "inscripción" || label === "fecha inscripción") { cellToUpdate.setText(updateData.fechaInscripcion); tableUpdated = true; }
          }
        }
      }
    }

    doc.saveAndClose();

    // Actualizar el nombre del archivo en Drive (Por si antes no tenía DNI y ahora sí)
    try {
      const file = DriveApp.getFileById(docId);
      const nuevoNombre = `HISTORIA CLINICA ${updateData.nombre}${updateData.dni ? ' ' + updateData.dni : ''}`;
      if (file.getName() !== nuevoNombre) {
        file.setName(nuevoNombre);
      }
    } catch(e) {
      // Ignoramos errores de renombrado silenciosamente
    }

    if (tableUpdated) {
      return { success: true, message: "✅ Datos de la HC actualizados." };
    } else {
      return { success: false, message: "⚠️ No se encontró la tabla de 'Datos Personales' en el documento." };
    }

  } catch (e) {
    return { success: false, message: "Error al modificar el documento. Revisa permisos: " + e.message };
  }
}