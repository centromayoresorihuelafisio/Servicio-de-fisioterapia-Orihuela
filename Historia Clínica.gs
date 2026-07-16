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
  const colIndex = headers.findIndex(h => h.toLowerCase() === COLUMNAS.MAESTRA.HISTORIA_CLINICA.toLowerCase());
  if (colIndex !== -1) {
    const richText = SpreadsheetApp.newRichTextValue().setText("Ver Historia Clínica").setLinkUrl(newDocUrl).build();
    sheet.getRange(rowIndex, colIndex + 1).setRichTextValue(richText);
  }

  return { success: true, message: `Historia clínica generada correctamente para ${nombre}.`, url: newDocUrl };
}