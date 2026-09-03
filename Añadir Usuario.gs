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
      
      nuevaFila[i] = valor;
    }
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