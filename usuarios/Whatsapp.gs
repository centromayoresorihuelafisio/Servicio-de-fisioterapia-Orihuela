// Sin nombres: la app la usan varias personas (decisión 6 de la sección 17.8).
const WHATSAPP_PLANTILLA_POR_DEFECTO_ = "Hola {{nombre}}, soy el fisioterapeuta del centro de mayores.";

/**
 * Plantilla de mensaje configurada (con {{nombre}}) o la de por defecto.
 */
function _plantillaWhatsapp_() {
  const scriptProperties = PropertiesService.getScriptProperties();
  return scriptProperties.getProperty(PROP_KEYS.WHATSAPP_MESSAGE) || WHATSAPP_PLANTILLA_POR_DEFECTO_;
}

// Límite de la plantilla guardada desde la web: de sobra para un saludo y lejos del tope de las propiedades.
const WHATSAPP_PLANTILLA_MAX_ = 1000;

/**
 * Guarda desde el diálogo de WhatsApp el texto como plantilla para los mensajes siguientes (Usuarios, HC y Agenda).
 * Pueden hacerlo los dos roles (decisión del dueño, 5-nov-2026); api lo anota en "Registro" con el texto nuevo.
 */
function guardarPlantillaWhatsappWeb_(texto) {
  const plantilla = String(texto == null ? '' : texto).replace(/\r\n?/g, '\n').trim();
  if (!plantilla) return { success: false, message: 'La plantilla no puede quedar vacía.' };
  if (plantilla.length > WHATSAPP_PLANTILLA_MAX_) return { success: false, message: 'La plantilla es demasiado larga (máximo ' + WHATSAPP_PLANTILLA_MAX_ + ' caracteres).' };
  PropertiesService.getScriptProperties().setProperty(PROP_KEYS.WHATSAPP_MESSAGE, plantilla);
  return { success: true, plantilla: plantilla };
}

/**
 * Primer nombre en formato Title Case para el saludo:
 *   · si la primera palabra tiene 2 letras o menos, se une con la segunda (regla de siempre, para «M CARMEN»);
 *   · si empieza por MARIA y tiene más de 3 palabras, saluda con todo lo que va delante de los dos apellidos
 *     («MARIA CARMEN LOPEZ GARCIA» -> «Maria Carmen», «MARIA DEL CARMEN …» -> «Maria del Carmen»; sección 22).
 *     Con 3 palabras o menos solo «Maria» («MARIA PERAL FENOLL»: la segunda es un apellido).
 */
function _primerNombreWhatsapp_(nombreCompleto) {
  const PARTICULAS = ['de', 'del', 'la', 'las', 'los', 'y'];
  const palabras = String(nombreCompleto == null ? '' : nombreCompleto).trim().split(/\s+/)
    .map(function(p) { return p.replace(/[^a-zA-ZñÑáéíóúÁÉÍÓÚüÜ]/g, ""); }).filter(Boolean);
  if (!palabras.length) return "";
  const sinTildes = palabras[0].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  let cuantas = 1;
  if (palabras[0].length <= 2 && palabras.length > 1) cuantas = 2;
  else if (sinTildes === 'MARIA' && palabras.length > 3) cuantas = palabras.length - 2;
  const nombre = palabras.slice(0, cuantas).map(function(p, i) {
    const min = p.toLowerCase();
    return (i > 0 && PARTICULAS.indexOf(min) !== -1) ? min : p.charAt(0).toUpperCase() + min.slice(1);
  });
  while (nombre.length > 1 && PARTICULAS.indexOf(nombre[nombre.length - 1]) !== -1) nombre.pop();
  return nombre.join(" ");
}

/**
 * Saludo con el nombre habitual (columna «Nombre habitual», CONTEXTO.md sección 22): entero y con cada palabra en
 * Title Case («MARI CARMEN» -> «Mari Carmen»). Si está vacío, devuelve '' y se usa el primer nombre de siempre.
 */
function _nombreHabitualWhatsapp_(habitual) {
  return String(habitual || '').trim().split(/\s+/).filter(Boolean)
    .map(function(p) { return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase(); }).join(' ');
}

/**
 * Datos para el asistente de WhatsApp desde Usuarios. Recibe IDs de usuario (no filas ni nombres: con
 * homónimos, buscar el teléfono por nombre escribiría a otra persona) y devuelve lo mismo que datosWhatsappLoteAgendaWeb_
 * (Web.gs): la plantilla cruda con {{nombre}} y, por usuario, nombre, primer nombre y teléfono ya con prefijo (o el
 * error que impide escribirle). `fila` va solo como información (etiqueta si no hubiera nombre).
 * El «primer nombre» del saludo es el nombre habitual si lo tiene; si no, el primer nombre de la columna Nombre.
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
    const idxHabitual = obtenerIndiceColumnaPorNombre_(hoja, COLUMNAS.MAESTRA.NOMBRE_HABITUAL);   // opcional
    const habituales = (lastRow >= 2 && idxHabitual !== -1) ? hoja.getRange(2, idxHabitual + 1, lastRow - 1, 1).getValues() : [];

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
      const saludo = _nombreHabitualWhatsapp_(habituales.length ? habituales[fila - 2][0] : '') || _primerNombreWhatsapp_(nombre);
      items.push({ idPaciente: id, fila: fila, nombre: nombre, primerNombre: saludo, telefono: numFinal, error: null });
    });
    return { success: true, plantilla: _plantillaWhatsapp_(), items: items, duplicados: duplicados };
  } catch (e) {
    Logger.log('Error en datosWhatsappMaestraWeb_: ' + e.message);
    return { success: false, message: e.message };
  }
}