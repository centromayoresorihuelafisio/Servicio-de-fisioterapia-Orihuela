function abrirChatWhatsapp() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hoja = ss.getSheetByName(SHEETS.MAESTRA);
  if (!hoja) { SpreadsheetApp.getUi().alert("Error: No se encontró la hoja 'Base de Datos Maestra'"); return; }

  const nombreCompleto = ss.getActiveCell().getValue();
  if (!nombreCompleto) { SpreadsheetApp.getUi().alert("Selecciona primero el nombre en la columna B"); return; }

  const resultado = _generarUrlWhatsappParaNombre(hoja, nombreCompleto);
  if (!resultado.success) { SpreadsheetApp.getUi().alert(resultado.message); return; }

  const plantilla = HtmlService.createTemplateFromFile('usuarios/Whatsapp_Vista');
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
function generarUrlWhatsappWeb(idPaciente) {
  const d = datosWhatsappMaestraWeb([idPaciente]);
  if (!d.success) return { success: false, message: d.message };
  const it = d.items[0];
  if (!it || it.error) return { success: false, message: (it && it.error) || 'Usuario no encontrado.' };
  const msj = d.plantilla.replace(/{{nombre}}/g, it.primerNombre);
  return { success: true, url: "https://web.whatsapp.com/send?phone=" + it.telefono + "&text=" + encodeURIComponent(msj) };
}

/**
 * Plantilla de mensaje configurada (con {{nombre}}) o la de por defecto.
 */
function _plantillaWhatsapp_() {
  const scriptProperties = PropertiesService.getScriptProperties();
  return scriptProperties.getProperty(PROP_KEYS.WHATSAPP_MESSAGE) || "Hola {{nombre}}, soy Fabio, el fisioterapeuta del centro de mayores.";
}

/**
 * Primer nombre en formato Title Case para el saludo (misma regla de siempre:
 * si la primera palabra tiene 2 letras o menos, se une con la segunda).
 */
function _primerNombreWhatsapp_(nombreCompleto) {
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
  return primerNombre;
}

/**
 * Lee la Maestra UNA sola vez y devuelve, para cada nombre de `nombres`:
 *   { nombre, primerNombre, telefono (solo dígitos, con prefijo 34), error }
 * Igual que antes, si un nombre aparece varias veces en la Maestra se usa la
 * primera fila que coincide. Si falla algo global devuelve { success:false, message }.
 */
function _datosWhatsappParaNombres_(hoja, nombres) {
  const idxNombre = obtenerIndiceColumnaPorNombre_(hoja, COLUMNAS.MAESTRA.NOMBRE);
  const idxTelefono = resolverColumnaTelefono_(hoja);
  if (idxNombre === -1 || idxTelefono === -1) {
    return { success: false, message: "No se encontraron las columnas de Nombre o Teléfono en la Maestra." };
  }

  const lastRow = hoja.getLastRow();
  if (lastRow < 2) {
    return { success: false, message: "No hay pacientes registrados en la Maestra." };
  }

  const numColumnas = Math.abs(idxTelefono - idxNombre) + 1;
  const primerCol = Math.min(idxNombre, idxTelefono) + 1;
  const offsetTelefono = idxTelefono - Math.min(idxNombre, idxTelefono);
  const offsetNombre = idxNombre - Math.min(idxNombre, idxTelefono);

  const datos = hoja.getRange(2, primerCol, lastRow - 1, numColumnas).getValues();
  const telPorNombre = Object.create(null);
  for (let i = 0; i < datos.length; i++) {
    const clave = String(datos[i][offsetNombre]).trim();
    if (!(clave in telPorNombre)) telPorNombre[clave] = datos[i][offsetTelefono];
  }

  const items = nombres.map(function(nombre) {
    const telefono = telPorNombre[String(nombre).trim()];
    if (!telefono) {
      return { nombre: nombre, primerNombre: "", telefono: "", error: "No hay teléfono para " + nombre };
    }
    const numLimpio = telefono.toString().replace(/\D/g, '');
    const numFinal = numLimpio.startsWith("34") ? numLimpio : "34" + numLimpio;
    return { nombre: nombre, primerNombre: _primerNombreWhatsapp_(nombre), telefono: numFinal, error: null };
  });
  return { success: true, items: items };
}

/**
 * Lógica compartida (antes dentro de abrirChatWhatsapp): busca el teléfono
 * en la Maestra, arma el primer nombre para el saludo y construye la URL de
 * WhatsApp Web con la plantilla de mensaje configurada.
 * Devuelve lo mismo que siempre: { success, url } o { success:false, message }.
 */
function _generarUrlWhatsappParaNombre(hoja, nombreCompleto) {
  const datos = _datosWhatsappParaNombres_(hoja, [nombreCompleto]);
  if (!datos.success) return { success: false, message: datos.message };

  const it = datos.items[0];
  if (it.error) return { success: false, message: it.error };

  const msjFinal = _plantillaWhatsapp_().replace(/{{nombre}}/g, it.primerNombre);
  const urlGenerada = "https://web.whatsapp.com/send?phone=" + it.telefono + "&text=" + encodeURIComponent(msjFinal);
  return { success: true, url: urlGenerada };
}

/**
 * Datos para el asistente de WhatsApp desde la Base de Datos Web. Recibe IDs de paciente (no filas ni nombres: con
 * homónimos, buscar el teléfono por nombre escribiría a otra persona) y devuelve lo mismo que datosWhatsappLoteAgendaWeb
 * (Web.gs): la plantilla cruda con {{nombre}} y, por usuario, nombre, primer nombre y teléfono ya con prefijo (o el
 * error que impide escribirle). `fila` va solo como información (etiqueta si no hubiera nombre).
 */
function datosWhatsappMaestraWeb(idsPaciente) {
  try {
    const hoja = getSS().getSheetByName(SHEETS.MAESTRA);
    if (!hoja) return { success: false, message: "No se encontró la hoja 'Base de Datos Maestra'." };

    const idxNombre = obtenerIndiceColumnaPorNombre_(hoja, COLUMNAS.MAESTRA.NOMBRE);
    const idxTelefono = resolverColumnaTelefono_(hoja);
    if (idxNombre === -1 || idxTelefono === -1) {
      return { success: false, message: "No se encontraron las columnas de Nombre o Teléfono en la Maestra." };
    }

    const mapa = mapaFilasMaestraPorId_(hoja);
    const lastRow = hoja.getLastRow();
    const nombres = lastRow >= 2 ? hoja.getRange(2, idxNombre + 1, lastRow - 1, 1).getValues() : [];
    const telefonos = lastRow >= 2 ? hoja.getRange(2, idxTelefono + 1, lastRow - 1, 1).getValues() : [];

    const vistos = Object.create(null);
    const items = [];
    let duplicados = 0;
    (idsPaciente || []).forEach(function(idRaw) {
      const id = String(idRaw || '').trim();
      const fila = id ? mapa[id] : 0;
      if (!fila) { items.push({ idPaciente: id, fila: '', nombre: '', primerNombre: '', telefono: '', error: 'Usuario no encontrado.' }); return; }
      if (vistos[id]) { duplicados++; return; }
      vistos[id] = true;
      const nombre = String(nombres[fila - 2][0] || '').trim();
      const telefono = telefonos[fila - 2][0];
      if (!nombre) { items.push({ idPaciente: id, fila: fila, nombre: '', primerNombre: '', telefono: '', error: 'Ese usuario no tiene nombre.' }); return; }
      if (!telefono) { items.push({ idPaciente: id, fila: fila, nombre: nombre, primerNombre: '', telefono: '', error: 'No hay teléfono para ' + nombre }); return; }
      const numLimpio = telefono.toString().replace(/\D/g, '');
      const numFinal = numLimpio.startsWith("34") ? numLimpio : "34" + numLimpio;
      items.push({ idPaciente: id, fila: fila, nombre: nombre, primerNombre: _primerNombreWhatsapp_(nombre), telefono: numFinal, error: null });
    });
    return { success: true, plantilla: _plantillaWhatsapp_(), items: items, duplicados: duplicados };
  } catch (e) {
    Logger.log('Error en datosWhatsappMaestraWeb: ' + e.message);
    return { success: false, message: e.message };
  }
}