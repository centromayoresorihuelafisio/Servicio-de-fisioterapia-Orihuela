function normalizarTextoSoloCeldas() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  
  // Captura el rango que tienes seleccionado actualmente
  var rangoSeleccionado = sheet.getActiveRange();
  var valores = rangoSeleccionado.getValues();
  
  var contadorModificados = 0;
  
  // Bucle para recorrer las celdas seleccionadas (filas y columnas)
  for (var fila = 0; fila < valores.length; fila++) {
    for (var col = 0; col < valores[fila].length; col++) {
      var textoOriginal = valores[fila][col].toString().trim();
      
      // Saltamos celdas vacías
      if (textoOriginal === "") continue;
      
      // 1. Limpiar el texto (Mayúsculas, sin acentos, sin símbolos)
      var textoLimpio = textoOriginal
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Elimina acentos y diéresis
        .replace(/[^A-Z0-9Ñ ]/g, "")    // Mantén solo letras, números, Ñ y espacios
        .replace(/\s+/g, " ")           // Elimina espacios dobles
        .trim();                        // Quita espacios al inicio y al final
      
      // 2. Si el texto ha cambiado, lo actualizamos en la memoria
      if (textoOriginal !== textoLimpio) {
        valores[fila][col] = textoLimpio;
        contadorModificados++;
      }
    }
  }
  
  // Guardar los cambios de golpe en las celdas seleccionadas
  rangoSeleccionado.setValues(valores);
  
  // Mostrar notificación de éxito en Sheets
  if (contadorModificados > 0) {
    SpreadsheetApp.getActiveSpreadsheet().toast(
      "Se han normalizado " + contadorModificados + " celdas con éxito.", 
      "Proceso completado"
    );
  } else {
    SpreadsheetApp.getActiveSpreadsheet().toast(
      "No se encontraron celdas que necesitaran cambios.", 
      "Información"
    );
  }
}