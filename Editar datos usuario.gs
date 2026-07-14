/**
 * Abre el diálogo modal para editar el paciente de la fila activa.
 */
function abrirModalEdicion() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.MAESTRA);
  const cell = sheet.getActiveCell();
  const rowIdx = cell.getRow();
  
  if (rowIdx < 2) {
    SpreadsheetApp.getUi().alert("Por favor, selecciona una fila con datos de paciente.");
    return;
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const rowData = sheet.getRange(rowIdx, 1, 1, sheet.getLastColumn()).getValues()[0];

  // Formatear fechas para que el input type="date" las reconozca (YYYY-MM-DD)
  const formattedData = rowData.map((value, index) => {
    if (Object.prototype.toString.call(value) === '[object Date]') {
      return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
    }
    return value;
  });

  const template = HtmlService.createTemplateFromFile('FormularioEdicion');
  template.headers = headers;
  template.rowData = formattedData;
  template.rowIdx = rowIdx;

  const html = template.evaluate()
    .setWidth(550)
    .setHeight(750)
    .setTitle('Editar Registro de Paciente');
  
  SpreadsheetApp.getUi().showModalDialog(html, ' ');
}

/**
 * Procesa la actualización de los datos en la hoja de cálculo.
 */
function actualizarPaciente(updatedData, rowIdx) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.MAESTRA);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  
  const newRowValues = headers.map((header, index) => {
    // Mantener valor original para ID e Historia Clínica (seguridad extra)
    if (index === 0 || header.toLowerCase().includes("historia")) {
      return sheet.getRange(rowIdx, index + 1).getValue();
    }
    
    let value = updatedData[header];
    
    // Si es una fecha (YYYY-MM-DD), convertir a objeto fecha para Sheets
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const parts = value.split('-');
      // Sheets lo interpretará según el formato de la columna de la hoja
      return new Date(parts[0], parts[1] - 1, parts[2]);
    }
    
    return value || "";
  });

  sheet.getRange(rowIdx, 1, 1, newRowValues.length).setValues([newRowValues]);
  ss.toast("Datos actualizados y guardados en la hoja.", "Éxito ✅", 4);
  return true;
}