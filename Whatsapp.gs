function abrirChatWhatsapp() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hoja = ss.getSheetByName(SHEETS.MAESTRA);
  
  if (!hoja) {
    SpreadsheetApp.getUi().alert("Error: No se encontró la hoja 'Base de Datos Maestra'");
    return;
  }

  const nombreCompleto = ss.getActiveCell().getValue();
  if (!nombreCompleto) {
    SpreadsheetApp.getUi().alert("Selecciona primero el nombre en la columna B");
    return;
  }

  // 1. Buscar el teléfono en la base de datos
  const datos = hoja.getRange("B:D").getValues();
  let telefono = "";

  for (let i = 0; i < datos.length; i++) {
    if (datos[i][0] === nombreCompleto) {
      telefono = datos[i][2]; // Columna D
      break;
    }
  }

  if (!telefono) {
    SpreadsheetApp.getUi().alert("No hay teléfono para " + nombreCompleto);
    return;
  }

  // 2. Procesar el Primer Nombre (Inteligente: Evita "M", "Mª", "Fco", etc.)
  const palabras = nombreCompleto.toString().trim().split(/\s+/); // Divide por cualquier espacio
  let primerNombre = "";

  if (palabras.length > 0) {
    let palabra1 = palabras[0];
    
    // Si la primera palabra es muy corta (1 o 2 letras/símbolos tras limpiar, ej: "M", "M.", "Mª", "J.")
    // y hay más palabras en la celda, unimos la primera y la segunda.
    if (palabra1.replace(/[^a-zA-ZñÑáéíóúÁÉÍÓÚ]/g, "").length <= 2 && palabras.length > 1) {
      let palabra2 = palabras[1];
      
      // Limpiamos símbolos raros de abreviaturas (ej: "M." -> "M", "Mª" -> "M")
      palabra1 = palabra1.replace(/[^a-zA-ZñÑáéíóúÁÉÍÓÚ]/g, "");
      palabra2 = palabra2.replace(/[^a-zA-ZñÑáéíóúÁÉÍÓÚ]/g, "");
      
      // Convertimos ambas a formato Nombre Propio
      const p1Formato = palabra1.charAt(0).toUpperCase() + palabra1.slice(1).toLowerCase();
      const p2Formato = palabra2.charAt(0).toUpperCase() + palabra2.slice(1).toLowerCase();
      
      primerNombre = p1Formato + " " + p2Formato; // Resultado: "M Ángeles"
    } else {
      // Caso normal: la primera palabra ya es un nombre completo (ej: "MANUELA")
      palabra1 = palabra1.replace(/[^a-zA-ZñÑáéíóúÁÉÍÓÚ]/g, "");
      primerNombre = palabra1.charAt(0).toUpperCase() + palabra1.slice(1).toLowerCase();
    }
  }

  // 3. Limpiar el número de teléfono
  const numLimpio = telefono.toString().replace(/\D/g, '');
  const numFinal = numLimpio.startsWith("34") ? numLimpio : "34" + numLimpio;

  // 4. Traer la plantilla guardada desde propiedades
  const scriptProperties = PropertiesService.getScriptProperties();
  const plantillaMensaje = scriptProperties.getProperty('WHATSAPP_MESSAGE') || "Hola {{nombre}}, soy Fabio, el fisioterapeuta del centro de mayores.";
  
  // Reemplazo dinámico global de la etiqueta {{nombre}} por el nombre procesado
  const msjFinal = plantillaMensaje.replace(/{{nombre}}/g, primerNombre);
  
  // 5. Generar URL de WhatsApp Web
  const urlGenerada = "https://web.whatsapp.com/send?phone=" + numFinal + "&text=" + encodeURIComponent(msjFinal);

  // --- CONFIGURACIÓN DE LA PLANTILLA ---
  const plantilla = HtmlService.createTemplateFromFile('Lanzador whatsapp');
  
  // Pasamos la URL final a la interfaz HTML
  plantilla.linkFinal = urlGenerada; 
  
  const interfaz = plantilla.evaluate()
      .setWidth(350)
      .setHeight(180);
  
  SpreadsheetApp.getUi().showModalDialog(interfaz, "Abriendo WhatsApp...");
}