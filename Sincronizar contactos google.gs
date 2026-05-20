/**
 * Coteja los pacientes de la base de datos con los contactos de Google
 * y añade aquellos nombres que no existan previamente.
 */
function sincronizarContactosGoogle() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.toast("Obteniendo contactos existentes de Google...", "Sincronización", 5);

  const contactosExistentes = obtenerTodosLosContactosGoogle();
  
  const hoja = ss.getSheetByName('Base de Datos Maestra');
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
  const indiceNombre = encabezados.indexOf('Nombre');
  const indiceTelefono = encabezados.indexOf('telefono1'); // Mapeado a la columna del formulario

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

  for (let i = 0; i < filas.length; i++) {
    const fila = filas[i];
    const nombrePaciente = String(fila[indiceNombre]).trim();
    const telefonoPaciente = colTelefono !== -1 ? String(fila[colTelefono]).trim() : '';

    if (!nombrePaciente) {
      continue; // Ignorar filas sin nombre válido
    }

    const existe = verificarExistenciaContacto(nombrePaciente, telefonoPaciente, contactosExistentes);

    if (!existe) {
      const exito = crearContactoGoogle(nombrePaciente, telefonoPaciente);
      if (exito) {
        creadosCount++;
        // Añadimos el nuevo contacto a nuestra lista en memoria para evitar crear duplicados de nombres idénticos en la misma hoja
        contactosExistentes.push({
          nombreNormalizado: normalizarTexto(nombrePaciente),
          telefonos: telefonoPaciente ? [normalizarTelefono(telefonoPaciente)] : []
        });
      }
    } else {
      omitidosCount++;
    }
  }

  // Notificación del resultado final de la sincronización
  const mensajeFinal = `Sincronización finalizada.\n• Nuevos contactos creados: ${creadosCount}\n• Pacientes ya existentes omitidos: ${omitidosCount}`;
  ss.toast(mensajeFinal, "Sincronización de Contactos", 10);
  Logger.log(mensajeFinal);
}

/**
 * Obtiene la lista completa de contactos de Google y estructura sus datos esenciales.
 * Maneja la paginación de manera robusta.
 * * @return {Array<Object>} Lista de contactos mapeada con nombre normalizado y teléfonos.
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
    
  } catch (e) {
    Logger.log('Error al obtener los contactos de Google: ' + e.message);
  }
  
  return contactos;
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

/**
 * Limpia y estandariza cadenas de texto para hacer comparaciones tolerantes (minúsculas, sin acentos).
 */
function normalizarTexto(texto) {
  if (!texto) return '';
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Elimina acentos/diacríticos
    .trim();
}

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