/**
 * Muestra un cuadro de diálogo nativo de Google Sheets al usuario para que ingrese el término de búsqueda.
 */
function mostrarDialogoBusqueda() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const title = 'Búsqueda Avanzada';
  
  // Usamos ui.prompt() para la entrada nativa
  const response = ui.prompt(
      title,
      'Ingrese el Nombre, DNI o Teléfono del paciente a buscar.',
      ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() === ui.Button.OK) {
    const searchTerm = response.getResponseText().trim();
    if (searchTerm === '') {
      // Usar toast (snackbar nativo) para error de entrada
      ss.toast('❌ ERROR: Debe ingresar un término de búsqueda.', 'Error de Búsqueda', 5);
    } else {
      // Llamamos a la función de lógica combinada
      ejecutarBusquedaCombinada(searchTerm);
    }
  }
}

/**
 * Realiza la búsqueda de pacientes combinada: Navega y muestra los detalles del primer resultado.
 * @param {string} searchTerm El término de búsqueda ingresado por el usuario.
 */
function ejecutarBusquedaCombinada(searchTerm) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = SHEETS.MAESTRA;
  const sheet = ss.getSheetByName(sheetName);
  const cleanSearchTerm = searchTerm.trim();
  
  if (!sheet) {
    // Usamos ss.toast()
    ss.toast(`❌ ERROR: No se encontró la hoja "${sheetName}".`, 'Error Crítico', 7);
    return;
  }
  
  const normalizedSearchTerm = normalizarTexto(cleanSearchTerm);
  
  // Obtener todos los datos de la hoja
  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(h => normalizarTexto(h));
  
  // Identificar las columnas de búsqueda
  const colIndices = {
    nombre: headers.indexOf(normalizarTexto(COLUMNAS.MAESTRA.NOMBRE)),
    dni: headers.indexOf(normalizarTexto(COLUMNAS.MAESTRA.DNI)),
    tel1: headers.indexOf(normalizarTexto(COLUMNAS.MAESTRA.TELEFONO_1)),
    tel2: headers.indexOf(normalizarTexto(COLUMNAS.MAESTRA.TELEFONO_2)),
    estado: headers.indexOf(normalizarTexto(COLUMNAS.MAESTRA.ESTADO)),
  };
  
  // Columna Nombre es crucial para la selección y el mensaje
  if (colIndices.nombre === -1) {
    ss.toast('❌ ERROR de Configuración: No se encontró la columna "Nombre".', 'Error de Configuración', 7);
    return;
  }
  
  const validSearchIndices = [colIndices.nombre, colIndices.dni, colIndices.tel1, colIndices.tel2].filter(index => index !== -1);
  
  if (validSearchIndices.length === 0) {
    ss.toast('❌ ERROR de Configuración: Faltan columnas de búsqueda (DNI, Teléfono).', 'Error de Búsqueda', 7);
    return;
  }

  // Iterar sobre las filas de datos (empezando por la segunda fila, índice 1)
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    let found = false;

    // Iterar sobre las columnas relevantes para la búsqueda
    for (const colIndex of validSearchIndices) {
      const cellValue = row[colIndex];
      const normalizedCellValue = normalizarTexto(cellValue);
      
      // Comprobar si el valor normalizado de la celda contiene el término de búsqueda normalizado
      if (normalizedCellValue.includes(normalizedSearchTerm) && normalizedSearchTerm.length > 0) {
        found = true;
        break; // Detener la búsqueda en esta fila si se encuentra una coincidencia
      }
    }

    if (found) {
      const rowNumber = i + 1; // Número de fila en la hoja (1-based)
      const nombreColIndex = colIndices.nombre + 1; // Columna 'Nombre' (1-based)
      
      const pacienteNombre = row[colIndices.nombre];
      const pacienteEstado = row[colIndices.estado] || 'N/A';
      
      try {
        // 1. Activar la hoja
        sheet.activate();
        
        // Desactivar el resaltado de la búsqueda anterior (buena práctica)
        sheet.getDataRange().setBackground(null);
        
        // 2. Resaltar la fila completa
        const rowRange = sheet.getRange(rowNumber, 1, 1, data[0].length);
        rowRange.setBackground('#FFFF00'); // Fondo amarillo
        
        // 3. Seleccionar/Activar la celda del nombre
        const nameCell = sheet.getRange(rowNumber, nombreColIndex);
        nameCell.activate();
        
        SpreadsheetApp.flush(); // Fuerza la actualización de la interfaz
        
        // 4. Mostrar el SNACKBAR de éxito (usando .toast)
        // Se usa '\r' (salto de carro) para forzar las nuevas líneas en el toast.
        const message = 
          `✅ ${pacienteNombre} \r` +
          `Fila: ${rowNumber} \r` +
          `Estado: ${pacienteEstado}`;
          
        ss.toast(message, 'Paciente Encontrado', 7); // Muestra el mensaje por 7 segundos.

      } catch (e) {
        // Mostrar SNACKBAR para error de navegación
        const errorMessage = `⚠️ ERROR al navegar, pero paciente encontrado: ${pacienteNombre}.`;
        ss.toast(errorMessage, 'Error de Navegación', 7); 
      }
      
      return; // Salir de la función después de encontrar y procesar el primer paciente
    }
  }
  
  // Si el bucle termina sin encontrar nada
  ss.toast(`❌ No se encontró ningún paciente con el término "${cleanSearchTerm}".`, 'Resultado de Búsqueda', 5);
}