function exportarProyectoAUnicoArchivo() {
  soloPropietario_('exportarProyectoAUnicoArchivo');
  const scriptId = ScriptApp.getScriptId();
  const token = ScriptApp.getOAuthToken();
  const url = `https://script.googleapis.com/v1/projects/${scriptId}/content`;
  
  try {
    // Llamada a la API para obtener el contenido
    const response = UrlFetchApp.fetch(url, {
      method: "get",
      headers: {
        "Authorization": "Bearer " + token
      },
      muteHttpExceptions: true
    });
    
    if (response.getResponseCode() !== 200) {
      throw new Error("Error de la API: " + response.getContentText());
    }
    
    const projectContent = JSON.parse(response.getContentText());
    const files = projectContent.files;
    
    let contenidoConsolidado = "";
    const separador = "=".repeat(80);
    
    // Recorrer y empaquetar intacto cada archivo
    files.forEach(file => {
      let extension = "";
      if (file.type === "SERVER_JS") extension = ".gs";
      else if (file.type === "HTML") extension = ".html";
      else if (file.type === "JSON") extension = ".json";
      
      contenidoConsolidado += `// ${separador}\n`;
      contenidoConsolidado += `// ARCHIVO: ${file.name}${extension}\n`;
      contenidoConsolidado += `// ${separador}\n\n`;
      
      contenidoConsolidado += file.source;
      contenidoConsolidado += "\n\n\n"; 
    });
    
    // CONTROL DE ERRORES PARA EL NOMBRE: Detecta si es un script contenedor o independiente
    let nombreScript = "Proyecto_AppsScript";
    try {
      nombreScript = DriveApp.getFileById(scriptId).getName();
    } catch (e) {
      try {
        // Si falla (script dentro de un Sheet), toma el nombre de la hoja de cálculo
        nombreScript = SpreadsheetApp.getActiveSpreadsheet().getName() + "_Script";
      } catch (err) {
        // Fallback genérico si falla todo lo demás
      }
    }
    
    const fecha = new Date().toISOString().slice(0, 10);
    const nombreArchivoTxt = `Backup_${nombreScript}_${fecha}.txt`;
    
    // Guardar el TXT en la raíz de Google Drive
    const nuevoArchivo = DriveApp.getRootFolder().createFile(
      nombreArchivoTxt, 
      contenidoConsolidado, 
      MimeType.PLAIN_TEXT
    );
    
    Logger.log(`¡Exportación completada con éxito!`);
    Logger.log(`Archivo creado en la raíz de tu Drive: ${nombreArchivoTxt}`);
    Logger.log(`Enlace para descargarlo: ${nuevoArchivo.getUrl()}`);
    
  } catch (error) {
    Logger.log(`Error al exportar: ${error.toString()}`);
  }
}