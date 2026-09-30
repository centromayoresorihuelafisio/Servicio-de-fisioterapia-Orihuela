/**
 * Coteja los pacientes de la base de datos con los contactos de Google
 * y añade aquellos nombres que no existan previamente.
 */
function sincronizarContactosGoogle() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.toast("Obteniendo contactos existentes de Google...", "Sincronización", 5);

  // OJO: obtenerTodosLosContactosGoogle() se tragaba en silencio cualquier
  // fallo al listar los contactos (devolvía un array vacío igual si iba bien
  // que si la API fallaba). Si eso fallaba, aquí se creían "0 contactos
  // existentes" y se intentaba recrear a TODO el mundo — y si el fallo era
  // de permisos/API, esa recreación también fallaba, resultando en "0
  // creados" sin ninguna pista de qué pasó. Ahora se distingue el caso.
  const resultadoLista = obtenerTodosLosContactosGoogle();
  if (!resultadoLista.success) {
    SpreadsheetApp.getUi().alert(
      'No se pudo conectar con Google Contacts:\n\n' + resultadoLista.message +
      '\n\nRevisa en el editor de Apps Script que el servicio "People API" esté ' +
      'habilitado (Servicios) y que la autorización del proyecto sea reciente ' +
      '(a veces hace falta volver a autorizar tras añadir un servicio nuevo).'
    );
    return;
  }
  const contactosExistentes = resultadoLista.contactos;

  const hoja = ss.getSheetByName(SHEETS.MAESTRA);
  if (!hoja) {
    SpreadsheetApp.getUi().alert('Error: No se encontró la hoja "Base de Datos Maestra".');
    return;
  }

  const ultimaFila = hoja.getLastRow();
  if (ultimaFila < 2) {
    ss.toast("No hay pacientes registrados en la base de datos para sincronizar.", "Sincronización", 5);
    return;
  }

  const encabezados = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
  const indiceNombre = encabezados.indexOf(COLUMNAS.MAESTRA.NOMBRE);
  const indiceTelefono = encabezados.indexOf(COLUMNAS.MAESTRA.TELEFONO_FORM); // Mapeado a la columna del formulario

  if (indiceNombre === -1) {
    SpreadsheetApp.getUi().alert('Error: No se encontró la columna "Nombre" en la primera fila de la hoja.');
    return;
  }

  // Si no se encuentra 'telefono1', intentamos buscar variantes comunes como 'Teléfono 1' o 'Teléfono'
  let colTelefono = indiceTelefono;
  if (colTelefono === -1) {
    colTelefono = encabezados.findIndex(h => h.toLowerCase().includes('tel') || h.toLowerCase().includes('movil') || h.toLowerCase().includes('móvil'));
  }

  // Obtener todos los datos de la hoja
  const rangoDatos = hoja.getRange(2, 1, ultimaFila - 1, encabezados.length);
  const filas = rangoDatos.getValues();
  
  let creadosCount = 0;
  let omitidosCount = 0;
  const errores = []; // { nombre, message } — para poder enseñar el motivo real si algo falla

  for (let i = 0; i < filas.length; i++) {
    const fila = filas[i];
    const nombrePaciente = String(fila[indiceNombre]).trim();
    const telefonoPaciente = colTelefono !== -1 ? String(fila[colTelefono]).trim() : '';

    if (!nombrePaciente) {
      continue; // Ignorar filas sin nombre válido
    }

    const existe = verificarExistenciaContacto(nombrePaciente, telefonoPaciente, contactosExistentes);

    if (!existe) {
      // Antes: 'exito' era siempre undefined porque crearContactoGoogle() no
      // devolvía nada — este bloque nunca se ejecutaba y el contador de
      // creados se quedaba siempre a 0, aunque el contacto sí se hubiera
      // creado (o hubiera fallado, no había forma de saberlo desde aquí).
      const resultado = crearContactoGoogle(nombrePaciente, telefonoPaciente);
      if (resultado.success) {
        creadosCount++;
        // Añadimos el nuevo contacto a nuestra lista en memoria para evitar crear duplicados de nombres idénticos en la misma hoja
        contactosExistentes.push({
          nombreNormalizado: normalizarTexto(nombrePaciente),
          telefonos: telefonoPaciente ? [normalizarTelefono(telefonoPaciente)] : []
        });
      } else {
        errores.push({ nombre: nombrePaciente, message: resultado.message });
      }
    } else {
      omitidosCount++;
    }
  }

  // Notificación del resultado final de la sincronización
  let mensajeFinal = `Sincronización finalizada.\n• Nuevos contactos creados: ${creadosCount}\n• Pacientes ya existentes omitidos: ${omitidosCount}`;
  if (errores.length > 0) {
    mensajeFinal += `\n• Errores: ${errores.length}`;
    Logger.log('Errores al sincronizar contactos:\n' + errores.map(e => e.nombre + ': ' + e.message).join('\n'));
    // Con errores, usamos un alert (no un toast, que desaparece solo) para
    // que el motivo real no pase desapercibido.
    SpreadsheetApp.getUi().alert(mensajeFinal + '\n\nPrimer error (' + errores[0].nombre + '):\n' + errores[0].message);
  } else {
    ss.toast(mensajeFinal, "Sincronización de Contactos", 10);
  }
  Logger.log(mensajeFinal);
}

/**
 * Obtiene la lista completa de contactos de Google y estructura sus datos esenciales.
 * Maneja la paginación de manera robusta.
 * @return {{success: boolean, contactos: Array<Object>, message: string}}
 *   Antes devolvía directamente el array y, si la llamada a la API fallaba,
 *   devolvía un array vacío indistinguible de "no tienes contactos" — el
 *   fallo quedaba solo en el registro de ejecuciones. Ahora se distingue.
 */
function obtenerTodosLosContactosGoogle() {
  let contactos = [];
  let tokenPagina = '';
  
  try {
    do {
      const respuesta = People.People.Connections.list('people/me', {
        personFields: 'names,phoneNumbers',
        pageSize: 1000,
        pageToken: tokenPagina
      });
      
      if (respuesta.connections) {
        respuesta.connections.forEach(conexion => {
          let nombreCompleto = '';
          if (conexion.names && conexion.names.length > 0) {
            nombreCompleto = conexion.names[0].displayName || '';
          }
          
          let telefonos = [];
          if (conexion.phoneNumbers) {
            telefonos = conexion.phoneNumbers.map(p => normalizarTelefono(p.value));
          }
          
          if (nombreCompleto) {
            contactos.push({
              nombreNormalizado: normalizarTexto(nombreCompleto),
              telefonos: telefonos
            });
          }
        });
      }
      
      tokenPagina = respuesta.nextPageToken;
    } while (tokenPagina);

    return { success: true, contactos: contactos, message: '' };

  } catch (e) {
    Logger.log('Error al obtener los contactos de Google: ' + e.message);
    return { success: false, contactos: [], message: e.message };
  }
}

/**
 * Evalúa si un paciente ya existe en el conjunto de datos de Google Contacts.
 * * @param {string} nombre El nombre del paciente a verificar.
 * @param {string} telefono El teléfono del paciente a verificar.
 * @param {Array<Object>} listaGoogle Lista de contactos estructurados de Google.
 * @return {boolean} True si ya existe un contacto equivalente, false en caso contrario.
 */
function verificarExistenciaContacto(nombre, telefono, listaGoogle) {
  const nombreNorm = normalizarTexto(nombre);
  const telNorm = normalizarTelefono(telefono);

  for (let i = 0; i < listaGoogle.length; i++) {
    const contacto = listaGoogle[i];
    
    // Regla 1: Si el nombre normalizado coincide plenamente
    if (contacto.nombreNormalizado === nombreNorm) {
      return true;
    }
    
    // Regla 2: Si tienen el mismo teléfono registrado (evita duplicados si el nombre varía ligeramente)
    if (telNorm && contacto.telefonos.includes(telNorm)) {
      return true;
    }
  }
  return false;
}

// NOTA: normalizarTexto() se centralizó en core/Utils.gs (14/07/2026) para eliminar la
// definición duplicada que existía aquí. Ver core/Utils.gs — misma lógica, fuente única.

/**
 * Normaliza los números de teléfono eliminando espacios, guiones o códigos de país comunes
 * para permitir una comparación robusta y limpia.
 */
function normalizarTelefono(telefono) {
  if (!telefono) return '';
  // Deja únicamente caracteres numéricos
  let limpio = String(telefono).replace(/\D/g, '');
  // Si tiene el prefijo de España (34) al inicio y es largo, lo removemos para comparar números locales de 9 dígitos
  if (limpio.startsWith('34') && limpio.length > 9) {
    limpio = limpio.substring(2);
  }
  return limpio;
}