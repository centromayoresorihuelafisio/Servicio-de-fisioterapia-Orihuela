// Sin nombres: la app la usan varias personas (decisión 6 de la sección 17.8).
const WHATSAPP_PLANTILLA_POR_DEFECTO_ = "Hola {{nombre}}, soy el fisioterapeuta del centro de mayores.";

/**
 * Plantilla de mensaje configurada (con {{nombre}}) o la de por defecto.
 */
function _plantillaWhatsapp_() {
  const scriptProperties = PropertiesService.getScriptProperties();
  return scriptProperties.getProperty(PROP_KEYS.WHATSAPP_MESSAGE) || WHATSAPP_PLANTILLA_POR_DEFECTO_;
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
 * Datos para el asistente de WhatsApp desde Usuarios. Recibe IDs de usuario (no filas ni nombres: con
 * homónimos, buscar el teléfono por nombre escribiría a otra persona) y devuelve lo mismo que datosWhatsappLoteAgendaWeb_
 * (Web.gs): la plantilla cruda con {{nombre}} y, por usuario, nombre, primer nombre y teléfono ya con prefijo (o el
 * error que impide escribirle). `fila` va solo como información (etiqueta si no hubiera nombre).
 */
function datosWhatsappMaestraWeb_(idsPaciente) {
  try {
    const hoja = getSS_().getSheetByName(SHEETS.MAESTRA);
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
      const numFinal = telefonoWhatsapp_(telefono);
      if (!numFinal) { items.push({ idPaciente: id, fila: fila, nombre: nombre, primerNombre: '', telefono: '', error: 'No hay teléfono para ' + nombre }); return; }
      items.push({ idPaciente: id, fila: fila, nombre: nombre, primerNombre: _primerNombreWhatsapp_(nombre), telefono: numFinal, error: null });
    });
    return { success: true, plantilla: _plantillaWhatsapp_(), items: items, duplicados: duplicados };
  } catch (e) {
    Logger.log('Error en datosWhatsappMaestraWeb_: ' + e.message);
    return { success: false, message: e.message };
  }
}