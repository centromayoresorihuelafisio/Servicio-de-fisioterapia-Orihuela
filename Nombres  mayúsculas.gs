function transformarColumnaAMayusculas() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  
  // Modifica estos dos valores según tu necesidad:
  var columnaNombres = 2; // 1 es la columna A, 2 es la B, etc.
  var filaInicio = 2;     // Pon 2 si la fila 1 es el encabezado
  
  var ultimaFila = sheet.getLastRow();
  if (ultimaFila < filaInicio) return; // Si la hoja está vacía, no hace nada
  
  // Selecciona el rango de la columna con nombres
  var numFilas = ultimaFila - filaInicio + 1;
  var rango = sheet.getRange(filaInicio, columnaNombres, numFilas, 1);
  var valores = rango.getValues();
  
  // Transforma cada nombre a mayúsculas en memoria
  for (var i = 0; i < valores.length; i++) {
    if (typeof valores[i][0] === 'string') {
      valores[i][0] = valores[i][0].toUpperCase();
    }
  }
  
  // Guarda los cambios directamente sobre la misma columna
  rango.setValues(valores);
}