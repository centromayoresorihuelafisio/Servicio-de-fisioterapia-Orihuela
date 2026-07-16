function abrirChatWhatsapp() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hoja = ss.getSheetByName(SHEETS.MAESTRA);
  if (!hoja) { SpreadsheetApp.getUi().alert("Error: No se encontró la hoja 'Base de Datos Maestra'"); return; }

  const nombreCompleto = ss.getActiveCell().getValue();
  if (!nombreCompleto) { SpreadsheetApp.getUi().alert("Selecciona primero el nombre en la columna B"); return; }

  const resultado = _generarUrlWhatsappParaNombre(hoja, nombreCompleto);
  if (!resultado.success) { SpreadsheetApp.getUi().alert(resultado.message); return; }

  const plantilla = HtmlService.createTemplateFromFile('Lanzador whatsapp');
  plantilla.linkFinal = resultado.url;
  const interfaz = plantilla.evaluate().setWidth(350).setHeight(180);
  SpreadsheetApp.getUi().showModalDialog(interfaz, "Abriendo WhatsApp...");
}

/**
 * Versión web-safe: genera la URL de WhatsApp para el paciente de `fila`,
 * para usar desde el botón "WhatsApp" de la Base de Datos Web. Devuelve la
 * URL en vez de abrir un diálogo modal (SpreadsheetApp.getUi() no existe en
 * la Web App); el cliente hace window.open con esa URL.
 */
function generarUrlWhatsappWeb(fila) {
  const rowIdx = parseInt(fila, 10);
  const ss = getSS();
  const hoja = ss.getSheetByName(SHEETS.MAESTRA);
  if (!hoja) return { success: false, message: "No se encontró la hoja 'Base de Datos Maestra'." };
  if (!rowIdx || rowIdx < 2) return { success: false, message: "Paciente no válido." };

  const nombreCompleto = hoja.getRange(rowIdx, COLUMNAS_NUM.MAESTRA.NOMBRE).getValue();
  if (!nombreCompleto) return { success: false, message: "Esa fila no tiene nombre de paciente." };

  return _generarUrlWhatsappParaNombre(hoja, nombreCompleto);
}

/**
 * Lógica compartida (antes dentro de abrirChatWhatsapp): busca el teléfono
 * en la Maestra, arma el primer nombre para el saludo y construye la URL de
 * WhatsApp Web con la plantilla de mensaje configurada.
 */
function _generarUrlWhatsappParaNombre(hoja, nombreCompleto) {
  const datos = hoja.getRange("B:D").getValues();
  let telefono = "";
  for (let i = 0; i < datos.length; i++) {
    if (datos[i][0] === nombreCompleto) { telefono = datos[i][2]; break; }
  }
  if (!telefono) return { success: false, message: "No hay teléfono para " + nombreCompleto };

  const palabras = nombreCompleto.toString().trim().split(/\s+/);
  let primerNombre = "";
  if (palabras.length > 0) {
    let palabra1 = palabras[0];
    if (palabra1.replace(/[^a-zA-ZñÑáéíóúÁÉÍÓÚ]/g, "").length <= 2 && palabras.length > 1) {
      let palabra2 = palabras[1];
      palabra1 = palabra1.replace(/[^a-zA-ZñÑáéíóúÁÉÍÓÚ]/g, "");
      palabra2 = palabra2.replace(/[^a-zA-ZñÑáéíóúÁÉÍÓÚ]/g, "");
      primerNombre = palabra1.charAt(0).toUpperCase() + palabra1.slice(1).toLowerCase() + " " +
                      palabra2.charAt(0).toUpperCase() + palabra2.slice(1).toLowerCase();
    } else {
      palabra1 = palabra1.replace(/[^a-zA-ZñÑáéíóúÁÉÍÓÚ]/g, "");
      primerNombre = palabra1.charAt(0).toUpperCase() + palabra1.slice(1).toLowerCase();
    }
  }

  const numLimpio = telefono.toString().replace(/\D/g, '');
  const numFinal = numLimpio.startsWith("34") ? numLimpio : "34" + numLimpio;

  const scriptProperties = PropertiesService.getScriptProperties();
  const plantillaMensaje = scriptProperties.getProperty(PROP_KEYS.WHATSAPP_MESSAGE) || "Hola {{nombre}}, soy Fabio, el fisioterapeuta del centro de mayores.";
  const msjFinal = plantillaMensaje.replace(/{{nombre}}/g, primerNombre);

  const urlGenerada = "https://web.whatsapp.com/send?phone=" + numFinal + "&text=" + encodeURIComponent(msjFinal);
  return { success: true, url: urlGenerada };
}