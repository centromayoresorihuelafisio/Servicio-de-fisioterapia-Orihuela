// 3️⃣ Manual: recalcula todas las edades existentes
function recalcularEdades() {
  var hoja = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

  // Buscar encabezados
  var encabezados = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
  var colNacimiento = encabezados.indexOf(COLUMNAS.MAESTRA.FECHA_NACIMIENTO) + 1;
  var colEdad = encabezados.indexOf(COLUMNAS.MAESTRA.EDAD) + 1;

  if (colNacimiento === 0 || colEdad === 0) return;

  var datos = hoja.getRange(2, colNacimiento, hoja.getLastRow()-1, 1).getValues();
  var resultados = datos.map(function(fila) { return [calcularEdadDesdeFecha_(fila[0])]; });

  hoja.getRange(2, colEdad, resultados.length, 1).setValues(resultados);
}