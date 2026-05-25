/**
 *Generar historia clínica para el usuario seleccionado
 */
function generarHistoriaClinica() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Base de Datos Maestra");
  if (!sheet) { ui.alert("Error: La hoja 'Base de Datos Maestra' no existe."); return; }

  const templateId = '1xNuxllwhqTI4_hSRwUfSp4PF4je-XTTJSdoNjYEUVjA';
  const folderId = '1L5aoSeaEy3BD3C_Ladk2kfgHLsMDg0Sa';

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
  const newDocName = `HISTORIA CLINICA ${nombre}${dni ? ' (' + dni + ')' : ''}`;
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

  ui.alert('✅ Historia clínica generada.');
}
