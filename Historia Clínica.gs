/**
 * Generar historia clínica para el usuario seleccionado
 */
function generarHistoriaClinica() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.MAESTRA);
  if (!sheet) { ui.alert("Error: La hoja 'Base de Datos Maestra' no existe."); return; }

  const scriptProperties = PropertiesService.getScriptProperties();
  const templateId = scriptProperties.getProperty(PROP_KEYS.DOC_TEMPLATE_ID);
  const folderId = scriptProperties.getProperty(PROP_KEYS.DRIVE_FOLDER_ID);

  // Validación de seguridad para evitar que falle el script si están vacíos
  if (!templateId || !folderId) {
    SpreadsheetApp.getUi().alert(
      '⚠️ Error de Configuración',
      'Falta configurar el ID de la Plantilla o de la Carpeta de Destino.\n' +
      'Por favor, ve al menú ⚙️ Config y actualiza los valores.',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    return;
  }

  const activeRange = sheet.getActiveRange();
  const rowIndex = activeRange.getRow();
  if (rowIndex === 1) { ui.alert("Selecciona una fila que contenga los datos de un paciente."); return; }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => h.toString().trim());
  const data = sheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0];

  const patientData = {};
  headers.forEach((header, index) => { patientData[header.toLowerCase()] = data[index]; });

  const nombre = patientData['nombre'] || '';
  const dni = patientData['dni'] || '';
  const edad = patientData['edad'] || '';
  const telefono1 = patientData['teléfono 1'] || '';
  const telefono2 = patientData['teléfono 2'] || '';
  let fechaInscripcion = patientData['fecha inscripción'] || patientData['fecha_inscripción'] || '';
  let fechaNacimiento = patientData['fecha nacimiento'] || patientData['fecha_nacimiento'] || '';

  Logger.log('Raw fechas:', fechaInscripcion, fechaNacimiento);

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

  const formatDate = (date) => {
    if (!date) return '';
    return Utilities.formatDate(date, Session.getScriptTimeZone(), 'dd/MM/yyyy');
  };

  const targetFolder = DriveApp.getFolderById(folderId);
  
  // MODIFICACIÓN 1: Nombre de archivo sin paréntesis para el DNI
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
  const colIndex = headers.findIndex(h => h.toLowerCase() === 'historia clínica');
  if (colIndex !== -1) {
    const richText = SpreadsheetApp.newRichTextValue().setText("Ver Historia Clínica").setLinkUrl(newDocUrl).build();
    sheet.getRange(rowIndex, colIndex + 1).setRichTextValue(richText);
  }

  // MODIFICACIÓN 2: Alerta sutil (Toast) en la parte inferior de la interfaz
  ss.toast('Historia clínica generada correctamente.', '✅ Completado', 6);
}