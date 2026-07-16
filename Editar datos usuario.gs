/**
 * Lee una fila de la Maestra y la deja lista para el formulario de edición
 * (cabeceras + valores, con las fechas convertidas a "yyyy-MM-dd" para que
 * los <input type="date"> las reconozcan). La usan tanto abrirModalEdicion()
 * (desde el menú) como el router de la Web App (desde la tabla de pacientes).
 */
function prepararDatosFilaParaEdicion(sheet, rowIdx) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const rowData = sheet.getRange(rowIdx, 1, 1, sheet.getLastColumn()).getValues()[0];

  const formattedData = rowData.map((value) => {
    if (Object.prototype.toString.call(value) === '[object Date]') {
      return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
    }
    return value;
  });

  return { headers: headers, rowData: formattedData };
}

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

  const { headers, rowData } = prepararDatosFilaParaEdicion(sheet, rowIdx);

  const template = HtmlService.createTemplateFromFile('FormularioEdicion');
  template.headers = headers;
  template.rowData = rowData;
  template.rowIdx = rowIdx;
  template.esWebApp = false;
  template.baseUrl = '';

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
  const ss = getSS();
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