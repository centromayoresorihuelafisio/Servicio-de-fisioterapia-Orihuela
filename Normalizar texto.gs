function normalizarTextoSeleccionado() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var rangoSeleccionado = sheet.getActiveRange();
  var valores = rangoSeleccionado.getValues();
  
  var contadorModificados = 0;
  
  for (var fila = 0; fila < valores.length; fila++) {
    for (var col = 0; col < valores[fila].length; col++) {
      var nombreOriginal = valores[fila][col].toString().trim();
      
      if (nombreOriginal === "") continue;
      
      // 1. Generar el nombre limpio para la celda
      var nombreNormalizado = normalizarTexto(nombreOriginal);
      
      // 2. Buscar en Drive archivos que CONTENGAN el nombre original y renombrarlos de forma inteligente
      renombrarArchivosContenidos(nombreOriginal, nombreNormalizado);
      
      // 3. Actualizar la celda si ha cambiado
      if (nombreOriginal !== nombreNormalizado) {
        valores[fila][col] = nombreNormalizado;
        contadorModificados++;
      }
    }
  }
  
  rangoSeleccionado.setValues(valores);
  
  if (contadorModificados > 0) {
    SpreadsheetApp.getActiveSpreadsheet().toast(
      "Procesadas " + contadorModificados + " celdas y actualizados sus archivos en Drive.", 
      "Prueba completada"
    );
  } else {
    SpreadsheetApp.getActiveSpreadsheet().toast(
      "No se realizaron cambios en las celdas.", 
      "Información"
    );
  }
}

// Función para limpiar el texto (MAYÚSCULAS, sin acentos, sin símbolos)
function normalizarTexto(texto) {
  return texto
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Quita acentos
    .replace(/[^A-Z0-9Ñ ]/g, "")    // Quita símbolos extraños
    .replace(/\s+/g, " ")           // Quita dobles espacios
    .trim();
}

// Nueva función de búsqueda inteligente en Drive
function renombrarArchivosContenidos(nombreViejo, nombreNuevoClean) {
  // Buscamos archivos que CONTENGAN la cadena exacta que estaba en la celda
  // Ej: title contains 'Miguel González Martí'
  var querystring = "title contains '" + nombreViejo + "' and trashed = false";
  var archivos = DriveApp.searchFiles(querystring);
  
  while (archivos.hasNext()) {
    var archivo = archivos.next();
    var nombreArchivoActual = archivo.getName();
    
    // Creamos el nuevo nombre para el archivo manteniendo su estructura
    // Ej: Reemplaza "Miguel González Martí" por "MIGUEL GONZALEZ MARTI" 
    // dentro de "Historia Clínica - Miguel González Martí (23194848S)"
    var nuevoNombreArchivo = nombreArchivoActual.replace(nombreViejo, nombreNuevoClean);
    
    // Por seguridad, si el reemplazo generó algún carácter con acento en el resto del título, 
    // podemos limpiar opcionalmente todo el título del archivo si lo deseas. 
    // De momento solo normaliza la parte del nombre del paciente para no destruir los prefijos/DNI:
    archivo.setName(nuevoNombreArchivo);
  }
}