function abrirChatWhatsapp() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hoja = ss.getSheetByName("Base de Datos Maestra");
  
  if (!hoja) {
    SpreadsheetApp.getUi().alert("Error: No se encontró la hoja 'Base de Datos Maestra'");
    return;
  }

  const nombre = ss.getActiveCell().getValue();
  if (!nombre) {
    SpreadsheetApp.getUi().alert("Selecciona primero el nombre en la columna B");
    return;
  }

  const datos = hoja.getRange("B:D").getValues();
  let telefono = "";

  for (let i = 0; i < datos.length; i++) {
    if (datos[i][0] === nombre) {
      telefono = datos[i][2]; // Columna D
      break;
    }
  }

  if (!telefono) {
    SpreadsheetApp.getUi().alert("No hay teléfono para " + nombre);
    return;
  }

  const numLimpio = telefono.toString().replace(/\D/g, '');
  const numFinal = numLimpio.startsWith("34") ? numLimpio : "34" + numLimpio;
  const msj = "Hola, soy Fabio, el fisioterapeuta del centro de mayores.";
  const urlGenerada = "https://web.whatsapp.com/send?phone=" + numFinal + "&text=" + encodeURIComponent(msj);

  // --- CONFIGURACIÓN DE LA PLANTILLA ---
  const plantilla = HtmlService.createTemplateFromFile('Lanzador whatsapp');
  
  // CAMBIO DE NOMBRE DE VARIABLE PARA EVITAR EL ERROR 'urls'
  plantilla.linkFinal = urlGenerada; 
  
  const interfaz = plantilla.evaluate() // Línea 40 (aprox)
      .setWidth(350)
      .setHeight(180);
  
  SpreadsheetApp.getUi().showModalDialog(interfaz, "Conectando...");
}