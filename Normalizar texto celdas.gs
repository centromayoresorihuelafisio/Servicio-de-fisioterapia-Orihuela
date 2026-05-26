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
    // 1. Protegemos la Ñ sustituyéndola temporalmente por un marcador único
    .replace(/Ñ/g, "___N_ENYE___") 
    // 2. Descomponemos el resto de acentos
    .normalize("NFD") 
    // 3. Eliminamos los diacríticos (acentos, diéresis)
    .replace(/[\u0300-\u036f]/g, "") 
    // 4. Restauramos nuestra Ñ original
    .replace(/___N_ENYE___/g, "Ñ") 
    // 5. Mantenemos solo letras, números, Ñ y espacios (eliminando símbolos)
    .replace(/[^A-Z0-9Ñ ]/g, "") 
    // 6. Limpieza de espacios en blanco
    .replace(/\s+/g, " ") 
    .trim();
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