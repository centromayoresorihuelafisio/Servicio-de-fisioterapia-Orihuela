/**
 * Abre el diálogo modal con el formulario HTML.
 */
function abrirFormularioPaciente() {
  const html = HtmlService.createHtmlOutputFromFile('Formulario Añadir Usuario')
    .setWidth(700)
    .setHeight(650);
  SpreadsheetApp.getUi().showModalDialog(html, ' ');
}

/**
 * Comprueba si ya existe un usuario con ese DNI en la Base de Datos Maestra.
 * La usa el formulario de Nuevo Usuario para avisar de una posible alta
 * duplicada ANTES de guardar — no bloquea nada por sí sola, solo informa;
 * es el formulario quien decide qué hacer con la respuesta.
 * @param {string} dni
 * @return {{existe: boolean, nombre?: string}}
 */
function buscarUsuarioPorDniWeb(dni) {
  try {
    const dniNormalizado = (dni || '').toString().trim().toUpperCase();
    if (!dniNormalizado) return { existe: false };

    const ss = getSS();
    const hoja = ss.getSheetByName(SHEETS.MAESTRA);
    if (!hoja) return { existe: false };

    const lastRow = hoja.getLastRow();
    if (lastRow < 2) return { existe: false };

    const encabezados = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
    const colDni = encabezados.indexOf(COLUMNAS.MAESTRA.DNI);
    const colNombre = encabezados.indexOf(COLUMNAS.MAESTRA.NOMBRE);
    if (colDni === -1) return { existe: false }; // sin columna DNI, no hay nada que comprobar

    // Solo leemos la columna DNI (no toda la hoja) para localizar la fila.
    const columnaDni = hoja.getRange(2, colDni + 1, lastRow - 1, 1).getValues();

    for (let i = 0; i < columnaDni.length; i++) {
      const dniFila = (columnaDni[i][0] || '').toString().trim().toUpperCase();
      if (dniFila && dniFila === dniNormalizado) {
        const nombre = colNombre !== -1 ? hoja.getRange(i + 2, colNombre + 1).getValue() : '';
        return { existe: true, nombre: (nombre || '').toString() };
      }
    }

    return { existe: false };
  } catch (e) {
    Logger.log('Error en buscarUsuarioPorDniWeb: ' + e.message);
    return { existe: false }; // ante un error en la comprobación, no bloqueamos el alta por esto
  }
}

/**
 * Guarda los datos del paciente recibidos del formulario HTML en la hoja de cálculo.
 */
function guardarPaciente(datos) {
  Logger.log('*** INICIO DE LA FUNCIÓN guardarPaciente ***');

  const ss = getSS()
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
    'Edad',
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
      // patrón que actualizarPaciente (Editar datos usuario.gs). El <input type="date">
      // del formulario manda el valor como texto, y sin esto se guardaría como texto
      // en la hoja (parseFecha y el onEdit no lo reconocen como fecha real).
      if (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor)) {
        const partes = valor.split('-');
        valor = new Date(Number(partes[0]), Number(partes[1]) - 1, Number(partes[2]));
      }
      
      nuevaFila[i] = valor;
    }
  }

  // --- NUEVA LÓGICA: CÁLCULO AUTOMÁTICO DE LA EDAD ---
  // "Edad" está en columnasNoFormulario (el formulario nunca la rellena), así
  // que se calcula aquí a partir de "Fecha nacimiento" con la misma lógica
  // que recalcularEdades() (Edad manual.gs) y el disparador onEdit — antes se
  // quedaba en blanco hasta la próxima vez que alguien ejecutara esa función
  // a mano, porque un guardado desde la Web App no dispara onEdit.
  const colNacimientoIdx = encabezados.indexOf(COLUMNAS.MAESTRA.FECHA_NACIMIENTO);
  const colEdadIdx = encabezados.indexOf(COLUMNAS.MAESTRA.EDAD);
  if (colNacimientoIdx !== -1 && colEdadIdx !== -1) {
    nuevaFila[colEdadIdx] = calcularEdadDesdeFecha_(nuevaFila[colNacimientoIdx]);
  }

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

    // Insertar la nueva fila en la fila vacía encontrada
    hoja.getRange(filaVacia, 1, 1, nuevaFila.length).setValues([nuevaFila]);

    // --- NUEVA LÓGICA: ORDENACIÓN AUTOMÁTICA ---
    // Llamamos a la función de ordenación para que el nuevo paciente 
    // se posicione inmediatamente según su prioridad (puntuación en columna A)
    if (typeof ordenarPacientes === "function") {
      ordenarPacientes();
    }

    // --- NUEVA LÓGICA: CREACIÓN DE CONTACTO EN GOOGLE ---
    // Extraemos el nombre utilizando la propiedad 'Nombre' (o alternativas si varía la mayúscula)
    const nombreContacto = datos['Nombre'] || datos['nombre'] || '';
    // Extraemos el teléfono mapeado a la variable 'telefono1' proporcionada por su formulario
    const telefonoContacto = datos['Teléfono 1'] || datos['telefono1'] || '';
    // Extraemos el valor del toggle de añadir a contactos (enviado desde JS)
    const anadirContacto = datos.anadirContacto;

    // Evaluamos si el usuario dejó marcado el toggle antes de ejecutar la acción.
    // OJO: antes crearContactoGoogle() no devolvía nada, así que un fallo (de
    // cuota, de permisos, de la API en sí) quedaba solo en el registro de
    // ejecuciones de Apps Script — invisible desde este formulario. Ahora si
    // falla, se añade un aviso al mensaje que sí ves en pantalla al guardar.
    let avisoContacto = '';
    if (anadirContacto && nombreContacto) {
      const resultadoContacto = crearContactoGoogle(nombreContacto, telefonoContacto);
      if (!resultadoContacto.success) {
        avisoContacto = ' Aviso: no se pudo crear el contacto en Google (' + resultadoContacto.message + ').';
      }
    } else if (!anadirContacto) {
      Logger.log('Info: Creación de contacto omitida por elección del usuario en el formulario.');
    } else {
      Logger.log('Advertencia: No se intentó crear el contacto en Google porque el campo "Nombre" venía vacío.');
    }

    Logger.log('Fila añadida correctamente a la hoja en la fila ' + filaVacia);
    return { success: true, message: "Paciente guardado correctamente." + avisoContacto }; // Devuelve un objeto de éxito
  } catch (e) {
    Logger.log('ERROR al añadir la fila: ' + e.message);
    return { success: false, message: 'Error al guardar el paciente: ' + e.message }; // Devuelve un objeto de error
  }
}

/**
 * Crea un contacto en Google Contacts utilizando el servicio avanzado People API v1.
 * * @param {string} nombre El nombre del paciente.
 * @param {string} telefono El teléfono del paciente.
 * @return {{success: boolean, message: string}} Antes esta función no
 *   devolvía nada (siempre undefined), así que sincronizarContactosGoogle()
 *   nunca podía saber si había funcionado o no — ver Sincronizar contactos
 *   google.gs. Ahora siempre informa de si funcionó y, si no, de por qué.
 */
function crearContactoGoogle(nombre, telefono) {
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
 * Genera una historia clínica en Google Docs basada en un formato de plantilla
 * para el paciente recién registrado a través del formulario HTML.
 * No depende de la selección manual de filas en la hoja de cálculo.
 * * @param {Object} patientData - Datos del formulario enviados desde el frontend.
 * @return {Object} Respuesta con el estado de la operación y la URL del documento.
 */
function generarHistoriaClinicaRegistroUsuario(patientData) {
  try {
    const ss = getSS()
    const sheet = ss.getSheetByName(SHEETS.MAESTRA);
    if (!sheet) {
      return { success: false, message: "Error: La hoja 'Base de Datos Maestra' no existe." };
    }

    // Identificadores de plantilla y carpeta de destino: misma configuración que
    // usa el menú 🧍 → Añadir Historia Clínica (⚙️ Config), para que ambas vías
    // de generación usen siempre la misma plantilla.
    const scriptProperties = PropertiesService.getScriptProperties();
    const templateId = scriptProperties.getProperty(PROP_KEYS.DOC_TEMPLATE_ID);
    const folderId = scriptProperties.getProperty(PROP_KEYS.DRIVE_FOLDER_ID);

    if (!templateId || !folderId) {
      return { success: false, message: 'Falta configurar el ID de la Plantilla o de la Carpeta de Destino. Ve al menú ⚙️ Config y actualiza los valores.' };
    }

    // Extracción de variables desde el objeto recibido del formulario
    const nombre = patientData['Nombre'] || '';
    const dni = patientData['DNI'] || '';
    const telefono1 = patientData['Teléfono 1'] || '';
    const telefono2 = patientData['Teléfono 2'] || '';
    
    // Cálculo automático de la edad si se envió la fecha de nacimiento
    let edad = '';
    if (patientData['Fecha nacimiento']) {
      const fechaNac = new Date(patientData['Fecha nacimiento']);
      const hoy = new Date();
      let calculoEdad = hoy.getFullYear() - fechaNac.getFullYear();
      const mes = hoy.getMonth() - fechaNac.getMonth();
      // Ajuste si aún no ha cumplido años en el año actual
      if (mes < 0 || (mes === 0 && hoy.getDate() < fechaNac.getDate())) {
        calculoEdad--;
      }
      edad = calculoEdad >= 0 ? calculoEdad.toString() : '';
    }

    // Formatear fechas de HTML (formatos YYYY-MM-DD) a formato común (DD/MM/YYYY) para el documento
    const formatHtmlDate = (dateStr) => {
      if (!dateStr) return '';
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      return dateStr;
    };

    const fechaInscripcion = formatHtmlDate(patientData['Fecha inscripción']);
    const fechaNacimiento = formatHtmlDate(patientData['Fecha nacimiento']);

    // --- VALIDACIÓN ANTI-DUPLICADOS ---
    // Localizamos la fila del paciente ANTES de crear nada en Drive: si ya
    // tiene una Historia Clínica enlazada (p. ej. el formulario se reenvía por
    // error, o se marca el toggle sobre un usuario que ya la tenía), salimos
    // sin generar un documento nuevo. Antes esta función creaba siempre el
    // documento primero y buscaba la fila después, así que un reenvío dejaba
    // un duplicado huérfano en Drive y machacaba el enlace anterior.
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => h.toString().trim().toLowerCase());
    const dniColIndex = headers.indexOf(COLUMNAS.MAESTRA.DNI.toLowerCase());
    const nombreColIndex = headers.indexOf(COLUMNAS.MAESTRA.NOMBRE.toLowerCase());
    const histColIndex = headers.indexOf(COLUMNAS.MAESTRA.HISTORIA_CLINICA.toLowerCase());

    let targetRow = -1;
    if (histColIndex !== -1) {
      const dataValues = sheet.getDataRange().getValues();

      // Escaneo inverso para obtener el último registro de ese paciente
      for (let i = dataValues.length - 1; i > 0; i--) {
        const rowDni = dataValues[i][dniColIndex] ? dataValues[i][dniColIndex].toString().trim() : '';
        const rowNombre = dataValues[i][nombreColIndex] ? dataValues[i][nombreColIndex].toString().trim().toUpperCase() : '';

        // Criterio de búsqueda: Primero por DNI idéntico, y si no tiene DNI por Nombre coincidente
        if (dni && rowDni === dni.trim()) {
          targetRow = i + 1;
          break;
        } else if (!dni && rowNombre === nombre.trim().toUpperCase()) {
          targetRow = i + 1;
          break;
        }
      }

      if (targetRow !== -1) {
        const celdaHC = sheet.getRange(targetRow, histColIndex + 1);
        const urlExistente = extraerUrlHistoriaClinica(
          celdaHC.getValue(),
          celdaHC.getRichTextValue(),
          celdaHC.getFormula()
        );
        if (urlExistente) {
          return {
            success: false,
            message: `${nombre} ya tiene una Historia Clínica enlazada; no se ha creado otra.`,
            url: urlExistente
          };
        }
      }
    }

    // 1. Duplicar la plantilla en la carpeta de destino de Google Drive
    const targetFolder = DriveApp.getFolderById(folderId);
    const newDocName = `HISTORIA CLINICA ${nombre}${dni ? ' ' + dni + '' : ''}`;
    const newDocFile = DriveApp.getFileById(templateId).makeCopy(newDocName, targetFolder);
    const newDoc = DocumentApp.openById(newDocFile.getId());
    const body = newDoc.getBody();

    // 2. Reemplazar los marcadores correspondientes en el cuerpo del documento duplicado
    body.replaceText('{{nombre}}', nombre);
    body.replaceText('{{dni}}', dni);
    body.replaceText('{{edad}}', edad);
    body.replaceText('{{telefono1}}', telefono1);
    body.replaceText('{{telefono2}}', telefono2);
    body.replaceText('{{fechaInscripcion}}', fechaInscripcion);
    body.replaceText('{{fechaNacimiento}}', fechaNacimiento);

    // Guardar cambios y cerrar edición del documento para confirmar su escritura en Drive
    newDoc.saveAndClose();
    const newDocUrl = newDoc.getUrl();

    // 3. Escribir el enlace en la fila que localizamos arriba
    if (histColIndex !== -1 && targetRow !== -1) {
      const richText = SpreadsheetApp.newRichTextValue()
        .setText("Ver Historia Clínica")
        .setLinkUrl(newDocUrl)
        .build();
      sheet.getRange(targetRow, histColIndex + 1).setRichTextValue(richText);
    }

    return { success: true, url: newDocUrl };

  } catch (error) {
    Logger.log("Error en generarHistoriaClinicaRegistroUsuario: " + error.message);
    return { success: false, message: error.message };
  }
}