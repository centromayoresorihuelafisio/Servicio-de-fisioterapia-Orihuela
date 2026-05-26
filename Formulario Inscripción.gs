/**
 * Abre el diálogo modal con el formulario HTML.
 */
function abrirFormularioPaciente() {
  const html = HtmlService.createHtmlOutputFromFile('formulario')
    .setWidth(700)
    .setHeight(650);
  SpreadsheetApp.getUi().showModalDialog(html, ' ');
}

/**
 * Guarda los datos del paciente recibidos del formulario HTML en la hoja de cálculo.
 */
function guardarPaciente(datos) {
  Logger.log('*** INICIO DE LA FUNCIÓN guardarPaciente ***');

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hoja = ss.getSheetByName('Base de Datos Maestra'); // Asegúrate de que este nombre sea EXACTO

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
      
      nuevaFila[i] = valor;
    }
  }

  Logger.log('Fila preparada para insertar (nuevaFila): ' + JSON.stringify(nuevaFila));

  try {
    // --- LÓGICA: Encontrar la primera fila vacía en la columna 'Nombre' (Columna B) ---
    // Obtener todos los valores de la columna 'Nombre' (Columna B) a partir de la fila 2
    const columnaNombre = hoja.getRange(2, encabezados.indexOf('Nombre') + 1, hoja.getLastRow()).getValues();
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
    ordenarPacientes();

    // --- NUEVA LÓGICA: CREACIÓN DE CONTACTO EN GOOGLE ---
    // Extraemos el nombre utilizando la propiedad 'Nombre' (o alternativas si varía la mayúscula)
    const nombreContacto = datos['Nombre'] || datos['nombre'] || '';
    // Extraemos el teléfono mapeado a la variable 'telefono1' proporcionada por su formulario
    const telefonoContacto = datos['Teléfono 1'] || datos['telefono1'] || '';

    if (nombreContacto) {
      crearContactoGoogle(nombreContacto, telefonoContacto);
    } else {
      Logger.log('Advertencia: No se intentó crear el contacto en Google porque el campo "Nombre" venía vacío.');
    }

    Logger.log('Fila añadida correctamente a la hoja en la fila ' + filaVacia);
    return { success: true, message: "Paciente guardado correctamente." }; // Devuelve un objeto de éxito
  } catch (e) {
    Logger.log('ERROR al añadir la fila: ' + e.message);
    return { success: false, message: 'Error al guardar el paciente: ' + e.message }; // Devuelve un objeto de error
  }
}

/**
 * Crea un contacto en Google Contacts utilizando el servicio avanzado People API v1.
 * 
 * @param {string} nombre El nombre del paciente.
 * @param {string} telefono El teléfono del paciente.
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

  } catch (e) {
    // Captura cualquier excepción de cuotas, red o formato sin bloquear el flujo principal del Sheets
    Logger.log('ERROR al crear el contacto en Google Contacts: ' + e.message);
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
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("Base de Datos Maestra");
    if (!sheet) {
      return { success: false, message: "Error: La hoja 'Base de Datos Maestra' no existe." };
    }

    // Identificadores de plantilla y carpeta de destino (IDs proporcionados por el usuario)
    const templateId = '1xNuxllwhqTI4_hSRwUfSp4PF4je-XTTJSdoNjYEUVjA';
    const folderId = '1L5aoSeaEy3BD3C_Ladk2kfgHLsMDg0Sa';

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

    // 1. Duplicar la plantilla en la carpeta de destino de Google Drive
    const targetFolder = DriveApp.getFolderById(folderId);
    const newDocName = `HISTORIA CLINICA ${nombre}${dni ? ' (' + dni + ')' : ''}`;
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

    // 3. Buscar la fila que acabamos de guardar en la hoja "Base de Datos Maestra"
    // Buscaremos de abajo hacia arriba (más rápido para registros recientes)
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => h.toString().trim().toLowerCase());
    const dniColIndex = headers.indexOf('dni');
    const nombreColIndex = headers.indexOf('nombre');
    const histColIndex = headers.indexOf('historia clínica');

    if (histColIndex !== -1) {
      const dataRange = sheet.getDataRange();
      const dataValues = dataRange.getValues();
      let targetRow = -1;

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

      // Si localizamos la fila del registro del paciente, escribimos el enlace
      if (targetRow !== -1) {
        const richText = SpreadsheetApp.newRichTextValue()
          .setText("Ver Historia Clínica")
          .setLinkUrl(newDocUrl)
          .build();
        sheet.getRange(targetRow, histColIndex + 1).setRichTextValue(richText);
      }
    }

    return { success: true, url: newDocUrl };

  } catch (error) {
    Logger.log("Error en generarHistoriaClinicaRegistroUsuario: " + error.message);
    return { success: false, message: error.message };
  }
}