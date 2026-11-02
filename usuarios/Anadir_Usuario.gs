/** Palabras significativas de un nombre: normalizado con la regla única, sin partículas ni repetidas. */
function _palabrasNombre_(texto) {
  const PARTICULAS = ['DE', 'DEL', 'LA', 'LAS', 'LOS', 'EL', 'Y', 'E'];
  return normalizarNombreUsuario_(texto).split(' ')
    .filter((w, i, arr) => w && PARTICULAS.indexOf(w) === -1 && arr.indexOf(w) === i);
}

/** ¿Dos nombres (ya convertidos en listas de palabras) pueden ser la misma persona? Misma regla que el aviso de duplicados de usuarios/Panel_Nuevo. */
function _nombresParecidos_(a, b) {
  if (!a.length || !b.length) return false;
  const comunes = a.filter(w => b.indexOf(w) !== -1).length;
  if (comunes === a.length && comunes === b.length) return true; // mismas palabras
  return comunes >= 2 && comunes * 2 > Math.min(a.length, b.length);
}

/**
 * Guarda los datos del usuario recibidos del formulario HTML en la hoja de cálculo.
 */
function guardarPaciente_(datos) {
  Logger.log('*** INICIO DE LA FUNCIÓN guardarPaciente ***');

  const ss = getSS_()
  const hoja = ss.getSheetByName(SHEETS.MAESTRA); // Asegúrate de que este nombre sea EXACTO

  if (!hoja) {
    // Devolver un objeto de error en lugar de lanzar una excepción
    return { success: false, message: 'Error: No se encontró la hoja "Base de Datos Maestra". Por favor, verifica el nombre de la pestaña.' };
  }

  // Obtener los encabezados de la primera fila de la hoja
  const encabezados = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
  Logger.log('Encabezados de la hoja: ' + JSON.stringify(encabezados));

  // Columnas que NO deben ser rellenadas por el formulario (se manejan automáticamente o manualmente)
  const columnasNoFormulario = [
    'Nº',
    'Última visita',
    'Merged Doc URL - Historias Clínicas'
  ];

  // Preparamos la fila para insertar, inicializada con cadenas vacías
  const nuevaFila = new Array(encabezados.length).fill("");

  // Mapear los datos recibidos (objeto) a las columnas de la hoja
  for (let i = 0; i < encabezados.length; i++) {
    const nombreColumnaHoja = encabezados[i];

    // Si la columna no debe ser rellenada por el formulario, la saltamos
    if (columnasNoFormulario.includes(nombreColumnaHoja)) {
      continue;
    }

    // Si el nombre del campo del formulario coincide con el encabezado de la hoja
    if (datos.hasOwnProperty(nombreColumnaHoja)) {
      let valor = datos[nombreColumnaHoja];
      
      // CAMBIO CLAVE: Si el valor es un array (por selecciones múltiples), lo unimos en una cadena.
      if (Array.isArray(valor)) {
        valor = valor.join(', ');
      }

      // Si es una fecha (YYYY-MM-DD), convertir a objeto fecha para Sheets — mismo
      // patrón que actualizarPaciente_ (usuarios/Editar_Usuario.gs). El <input type="date">
      // del formulario manda el valor como texto, y sin esto se guardaría como texto
      // en la hoja (parseFecha_ no lo reconoce como fecha real).
      if (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor)) {
        const partes = valor.split('-');
        valor = new Date(Number(partes[0]), Number(partes[1]) - 1, Number(partes[2]));
      }
      
      nuevaFila[i] = valor;
    }
  }

  // ID estable del usuario (CONTEXTO.md, sección 11): se genera aquí, una sola vez, y no lo pide el formulario.
  // Si la columna aún no existe (antes de ejecutar herramientas/Asignar_IDs_Paciente.gs), no se hace nada.
  const colIdPaciente = encabezados.findIndex(h => h.toString().trim() === COLUMNAS.MAESTRA.ID_PACIENTE);
  let idPacienteNuevo = '';
  if (colIdPaciente !== -1) { idPacienteNuevo = Utilities.getUuid(); nuevaFila[colIdPaciente] = idPacienteNuevo; }

  // Formato unificado (core/Utils.gs): el formulario ya lo aplica al escribir; aquí se
  // garantiza también en el servidor por si el dato llega de otra vía.
  const colNombreFormato = encabezados.indexOf(COLUMNAS.MAESTRA.NOMBRE);
  const colDniFormato = encabezados.indexOf(COLUMNAS.MAESTRA.DNI);
  if (colNombreFormato !== -1) nuevaFila[colNombreFormato] = normalizarNombreUsuario_(nuevaFila[colNombreFormato]);
  if (colDniFormato !== -1) nuevaFila[colDniFormato] = normalizarDniUsuario_(nuevaFila[colDniFormato]);

  // Teléfonos (regla única, core/Utils.gs → telefonoNormalizar_): se guardan solo con dígitos y como texto.
  const colTel1Formato = encabezados.indexOf(COLUMNAS.MAESTRA.TELEFONO_1);
  const colTel2Formato = encabezados.indexOf(COLUMNAS.MAESTRA.TELEFONO_2);
  if (colTel1Formato !== -1) nuevaFila[colTel1Formato] = telefonoNormalizar_(nuevaFila[colTel1Formato]);
  if (colTel2Formato !== -1) nuevaFila[colTel2Formato] = telefonoNormalizar_(nuevaFila[colTel2Formato]);

  Logger.log('Fila preparada para insertar (nuevaFila): ' + JSON.stringify(nuevaFila));

  try {
    // --- LÓGICA: Encontrar la primera fila vacía en la columna 'Nombre' (Columna B) ---
    // Obtener todos los valores de la columna 'Nombre' (Columna B) a partir de la fila 2
    const columnaNombre = hoja.getRange(2, encabezados.indexOf(COLUMNAS.MAESTRA.NOMBRE) + 1, hoja.getLastRow()).getValues();
    let filaVacia = -1;

    for (let i = 0; i < columnaNombre.length; i++) {
      if (columnaNombre[i][0] === "") { // Si la celda está vacía
        filaVacia = i + 2; // +2 porque el array es 0-indexado y empezamos desde la fila 2
        break;
      }
    }

    // Si no se encontró ninguna fila vacía en las filas existentes, añadir al final
    if (filaVacia === -1) {
      filaVacia = hoja.getLastRow() + 1;
    }

    Logger.log('Datos se insertarán en la fila: ' + filaVacia);

    // Insertar la nueva fila en la fila vacía encontrada (los teléfonos, antes, en formato texto para que Sheets no los convierta en número)
    telefonoFormatoTexto_(hoja, filaVacia, colTel1Formato + 1);
    telefonoFormatoTexto_(hoja, filaVacia, colTel2Formato + 1);
    hoja.getRange(filaVacia, 1, 1, nuevaFila.length).setValues([nuevaFila]);

    // Historial (sección 11, paso 4): estado inicial del usuario nuevo (Estado, Tipo de Ingreso, Gravedad).
    if (idPacienteNuevo) historialRegistrar_(historialCambiosEnFila_(encabezados, null, nuevaFila), 'Nuevo usuario');

    // --- NUEVA LÓGICA: ORDENACIÓN AUTOMÁTICA ---
    // Llamamos a la función de ordenación para que el nuevo usuario 
    // se posicione inmediatamente según su prioridad (puntuación en columna A)
    if (typeof ordenarPacientes_ === "function") {
      ordenarPacientes_();
    }

    // --- NUEVA LÓGICA: CREACIÓN DE CONTACTO EN GOOGLE ---
    // Extraemos el nombre utilizando la propiedad 'Nombre' (o alternativas si varía la mayúscula)
    const nombreContacto = datos['Nombre'] || datos['nombre'] || '';
    // Extraemos el teléfono mapeado a la variable 'telefono1' proporcionada por su formulario
    const telefonoContacto = telefonoNormalizar_(datos['Teléfono 1'] || datos['telefono1'] || '');
    // Extraemos el valor del toggle de añadir a contactos (enviado desde JS)
    const anadirContacto = datos.anadirContacto;

    // Evaluamos si el usuario dejó marcado el toggle antes de ejecutar la acción.
    // OJO: antes crearContactoGoogle_() no devolvía nada, así que un fallo (de
    // cuota, de permisos, de la API en sí) quedaba solo en el registro de
    // ejecuciones de Apps Script — invisible desde este formulario. Ahora si
    // falla, se añade un aviso al mensaje que sí ves en pantalla al guardar.
    let avisoContacto = '';
    if (anadirContacto && nombreContacto) {
      const resultadoContacto = crearContactoGoogle_(nombreContacto, telefonoContacto);
      if (!resultadoContacto.success) {
        avisoContacto = ' Aviso: no se pudo crear el contacto en Google (' + resultadoContacto.message + ').';
      }
    } else if (!anadirContacto) {
      Logger.log('Info: Creación de contacto omitida por elección del usuario en el formulario.');
    } else {
      Logger.log('Advertencia: No se intentó crear el contacto en Google porque el campo "Nombre" venía vacío.');
    }

    Logger.log('Fila añadida correctamente a la hoja en la fila ' + filaVacia);
    return { success: true, message: "Usuario guardado correctamente." + avisoContacto, idPaciente: idPacienteNuevo }; // Devuelve un objeto de éxito
  } catch (e) {
    Logger.log('ERROR al añadir la fila: ' + e.message);
    return { success: false, message: 'Error al guardar el usuario: ' + e.message }; // Devuelve un objeto de error
  }
}

/**
 * Crea un contacto en Google Contacts utilizando el servicio avanzado People API v1.
 * * @param {string} nombre El nombre del usuario.
 * @param {string} telefono El teléfono del usuario.
 * @return {{success: boolean, message: string}} Antes esta función no
 *   devolvía nada (siempre undefined), así que sincronizarContactosGoogle()
 *   nunca podía saber si había funcionado o no — ver Sincronizar contactos
 *   google.gs. Ahora siempre informa de si funcionó y, si no, de por qué.
 */
function crearContactoGoogle_(nombre, telefono) {
  Logger.log('Iniciando proceso de creación de contacto en Google Contacts...');
  
  try {
    // Definimos la estructura del nuevo contacto según los requerimientos de la People API v1
    const persona = {
      names: [{
        displayName: nombre,
        givenName: nombre
      }]
    };

    // Solo añadimos el teléfono al recurso si el campo no está vacío
    if (telefono && telefono.trim() !== "") {
      persona.phoneNumbers = [{
        value: telefono,
        type: 'mobile'
      }];
    }

    // Llamada al endpoint nativo de People API v1 para la creación del contacto
    const contactoCreado = People.People.createContact(persona);
    Logger.log('Contacto creado con éxito en Google Contacts. ID de Recurso: ' + contactoCreado.resourceName);
    return { success: true, message: contactoCreado.resourceName };

  } catch (e) {
    // Antes esta excepción se tragaba en silencio (solo Logger.log, invisible
    // fuera del editor de Apps Script). Ahora se propaga hacia quien llame a
    // esta función, para que el fallo se pueda mostrar de verdad.
    Logger.log('ERROR al crear el contacto en Google Contacts: ' + e.message);
    return { success: false, message: e.message };
  }
}



/**
 * Crea la historia clínica (ficha web) del usuario recién registrado a través del formulario HTML.
 * No depende de la selección manual de filas en la hoja de cálculo: localiza al usuario por su ID paciente.
 * @param {Object} patientData - Datos del formulario enviados desde el frontend (con `idPaciente`).
 * @return {Object} Respuesta con el estado de la operación y la URL de la ficha.
 */
function generarHistoriaClinicaRegistroUsuario_(patientData) {
  try {
    const ss = getSS_()
    const sheet = ss.getSheetByName(SHEETS.MAESTRA);
    if (!sheet) {
      return { success: false, message: "Error: La hoja 'Base de Datos Maestra' no existe." };
    }

    const nombre = patientData['Nombre'] || '';

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => h.toString().trim().toLowerCase());
    const histColIndex = headers.indexOf(COLUMNAS.MAESTRA.HISTORIA_CLINICA.toLowerCase());
    const colIdMaestra = headers.indexOf(COLUMNAS.MAESTRA.ID_PACIENTE.toLowerCase());

    // El usuario se identifica SOLO por su ID paciente (lo devuelve guardarPaciente; el número de fila no sirve
    // porque guardarPaciente reordena la hoja, y el DNI/nombre pueden repetirse o faltar).
    const idPaciente = String(patientData.idPaciente || '').trim();
    if (!idPaciente || colIdMaestra === -1) {
      return { success: false, message: 'No se pudo identificar al usuario (falta su ID paciente). Crea la historia clínica desde su ficha.' };
    }
    let targetRow = -1;
    const ultimaFila = sheet.getLastRow();
    if (ultimaFila >= 2) {
      const ids = sheet.getRange(2, colIdMaestra + 1, ultimaFila - 1, 1).getValues();
      for (let i = 0; i < ids.length; i++) {
        if (String(ids[i][0] || '').trim() === idPaciente) { targetRow = i + 2; break; }
      }
    }
    if (targetRow === -1) {
      return { success: false, message: 'No se encontró al usuario en la Maestra con ese ID paciente.' };
    }

    // --- VALIDACIÓN ANTI-DUPLICADOS ---
    // Antes de crear nada: si el usuario ya tiene una Historia Clínica enlazada (reenvío del formulario, toggle
    // sobre un usuario que ya la tenía), se sale sin crear otra.
    if (histColIndex !== -1) {
      const celdaHC = sheet.getRange(targetRow, histColIndex + 1);
      const urlExistente = extraerUrlHistoriaClinica_(celdaHC.getValue(), celdaHC.getRichTextValue(), celdaHC.getFormula());
      if (urlExistente) {
        return {
          success: false,
          message: `${nombre} ya tiene una Historia Clínica enlazada; no se ha creado otra.`,
          url: urlExistente
        };
      }
    }

    // La HC es la ficha web (sin Doc): fila nueva en "Historias Clínicas" + episodio abierto SIN ingreso (lo rellena la primera cita;
    // la fecha de inscripción es otra cosa y vive solo en la Maestra).
    const nueva = hcCrearHC_(nombre, '', idPaciente);
    if (histColIndex !== -1 && targetRow !== -1) {
      sheet.getRange(targetRow, histColIndex + 1).setRichTextValue(
        SpreadsheetApp.newRichTextValue().setText("Ver Historia Clínica").setLinkUrl(nueva.url).build());
    }
    return { success: true, url: nueva.url };

  } catch (error) {
    Logger.log("Error en generarHistoriaClinicaRegistroUsuario: " + error.message);
    return { success: false, message: error.message };
  }
}