function formatearArchivosDeCarpeta() {
  var ui = SpreadsheetApp.getUi();
  
  // 1. Solicitar el ID de la carpeta (CORREGIDO: usando ui.prompt)
  var respuesta = ui.prompt(
    "Formatear nombres de archivos en carpeta", 
    "Introduce el ID de la carpeta de Google Drive (el código de su URL):", 
    ui.ButtonSet.OK_CANCEL
  );
  
  // 2. Comprobar qué botón ha pulsado el usuario
  if (respuesta.getSelectedButton() !== ui.Button.OK) {
    ui.alert("Operación cancelada.");
    return;
  }
  
  // Extraer el texto introducido
  var folderId = respuesta.getResponseText().trim();
  
  if (folderId === "") {
    ui.alert("Atención", "No has introducido ningún ID válido.", ui.ButtonSet.OK);
    return;
  }
  
  try {
    // 3. Conectar con la carpeta de Drive
    var carpeta = DriveApp.getFolderById(folderId);
    var archivos = carpeta.getFiles();
    var contadorModificados = 0;
    
    // 4. Recorrer todos los archivos de esa ubicación
    while (archivos.hasNext()) {
      var archivo = archivos.next();
      var nombreOriginal = archivo.getName();
      
      // Separar el nombre de su extensión (ej: "Archivo (Prueba).pdf" -> "Archivo (Prueba)" y ".pdf")
      var puntoIndex = nombreOriginal.lastIndexOf(".");
      var nombreBase = nombreOriginal;
      var extension = "";
      
      if (puntoIndex !== -1) {
        nombreBase = nombreOriginal.substring(0, puntoIndex);
        extension = nombreOriginal.substring(puntoIndex); 
      }
      
      // 5. Normalizar únicamente el cuerpo del nombre
      var nombreBaseLimpio = normalizarTextoCarpeta(nombreBase);
      
      // Volver a unir el nombre limpio con su extensión en minúsculas
      var nuevoNombreCompleto = nombreBaseLimpio + extension.toLowerCase();
      
      // 6. Renombrar el archivo solo si realmente ha cambiado
      if (nombreOriginal !== nuevoNombreCompleto && nombreBaseLimpio !== "") {
        archivo.setName(nuevoNombreCompleto);
        contadorModificados++;
      }
    }
    
    // Alerta final con los resultados
    ui.alert("Proceso completado", "Se han formateado con éxito " + contadorModificados + " archivos.", ui.ButtonSet.OK);
    
  } catch (error) {
    ui.alert("Error", "No se pudo acceder a la carpeta. Revisa que el ID sea correcto y tengas permisos.\n\nDetalle: " + error.toString(), ui.ButtonSet.OK);
  }
}

// Función encargada de limpiar el texto (Mayúsculas, sin acentos y sin símbolos)
function normalizarTextoCarpeta(texto) {
  if (!texto) return ""; // Control de seguridad por si el texto llega vacío o null

  return texto
    .toUpperCase()
    .replace(/Ñ/g, "___N_ENYE___")  // 1. Protege la Ñ antes de normalizar
    .normalize("NFD")               // 2. Descompone acentos y diéresis
    .replace(/[\u0300-\u036f]/g, "") // 3. Elimina los diacríticos
    .replace(/___N_ENYE___/g, "Ñ")  // 4. Recupera la Ñ original
    .replace(/[^A-Z0-9Ñ ]/g, "")    // 5. Elimina símbolos (ahora respeta la Ñ)
    .replace(/\s+/g, " ")           // 6. Elimina espacios dobles o múltiples
    .trim();                        // 7. Elimina espacios al inicio y al final
}