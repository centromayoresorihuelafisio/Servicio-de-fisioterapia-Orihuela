/**
 * Modifica la estructura del horario de todos los viernes en la hoja "Agenda 2025-2026".
 * La función ajusta el bloque de celdas que contiene las horas, respetando las filas de encabezado "Viernes" y "Turno MAÑANA".
 *
 * IMPORTANTE:
 * 1. Solo se modifican los viernes cuya fecha sea igual o posterior al 01/11/2025.
 * 2. Las validaciones de datos en las Columnas D y G se RECREAN explícitamente.
 * 3. Se fuerza el formato de hora HH:mm para la Columna C.
 * 4. Se aplica formato de fuente (negra, 10, sin negrita) y color de fondo alterno a TODO el ancho de la fila (de A a J)
 * para seguir la estética de la agenda.
 */
function modificarEstructuraViernes() {
  // --- CONFIGURACIÓN ---
  const NOMBRE_HOJA = "Copia de Agenda 2025-2026";
  const NOMBRE_HOJA_BD = "Base de Datos Maestra"; 
  const COLUMNA_FECHA = 1;  // Columna A (Fecha)
  const COLUMNA_DIA = 2;    // Columna B (Día)
  const HORA_COLUMNA = 3;   // Columna C (Hora)
  const COLUMNA_USUARIO = 4; // Columna D (Usuario)
  const COLUMNA_ASISTENCIA = 7; // Columna G (Asistencia)

  // --- LÍMITE DE FECHA (01/11/2025) ---
  const START_DATE_STRING = "01/11/2025";
  const parts = START_DATE_STRING.split('/');
  const START_DATE_LIMIT = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
  START_DATE_LIMIT.setHours(0, 0, 0, 0); 

  // --- DEFINICIÓN DEL NUEVO HORARIO Y ESTILOS ---
  const NUEVOS_VALORES_HORA = [
    ["08:00"], ["08:30"], ["09:00"], ["09:30"], ["10:00"], ["10:30"],
    ["11:00"], ["11:30"], ["12:00"], ["12:30"], ["13:00"], ["13:30"],
  ];
  const ROWS_TO_INSERT = NUEVOS_VALORES_HORA.length;

  const colorPalette = {
    eventRowOddBg: "#FFFFFF", // Color para filas impares (blanco)
    eventRowEvenBg: "#F0F0F0", // Color para filas pares (gris claro)
  };
  // -----------------------

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(NOMBRE_HOJA);
    
    if (!sheet) {
      Browser.msgBox(`Error: No se encontró la hoja con el nombre "${NOMBRE_HOJA}"`);
      return;
    }

    // --- RECREACIÓN DE VALIDACIONES (DEFINICIONES) ---
    let usuarioValidation = null;
    const hojaBD = ss.getSheetByName(NOMBRE_HOJA_BD);
    if (hojaBD) {
      const lastRowBD = hojaBD.getLastRow();
      const userRange = hojaBD.getRange('B2:B' + lastRowBD); 
      usuarioValidation = SpreadsheetApp.newDataValidation()
        .requireValueInRange(userRange, true)
        .setAllowInvalid(false)
        .setHelpText('Selecciona un usuario de la lista de tu Base de Datos Maestra.')
        .build();
    } else {
       Logger.log(`Advertencia: No se encontró la hoja "${NOMBRE_HOJA_BD}". La validación de usuario (Columna D) NO se aplicará.`);
    }

    const asistenciaValidation = SpreadsheetApp.newDataValidation()
      .requireValueInList(["✅ Sí", "❌ No", "Pendiente"])
      .setAllowInvalid(false)
      .setHelpText('Selecciona el estado de asistencia: Sí, No o Pendiente.')
      .build();

    const HORA_FORMATO = 'HH:mm';

    // Obtenemos todos los valores de las primeras tres columnas (Fecha, Día, Hora)
    const allValues = sheet.getRange(1, 1, sheet.getLastRow(), HORA_COLUMNA).getValues();
    
    // Iteramos de abajo hacia arriba para manejar las eliminaciones/inserciones de forma segura
    for (let i = allValues.length - 1; i >= 0; i--) {
      const dia = allValues[i][COLUMNA_DIA - 1] ? String(allValues[i][COLUMNA_DIA - 1]).trim() : '';
      const filaViernes = i + 1; 

      if (dia === "Viernes") {
        const viernesDateValue = allValues[i][COLUMNA_FECHA - 1]; 
        
        if (viernesDateValue instanceof Date) {
          viernesDateValue.setHours(0, 0, 0, 0); 

          if (viernesDateValue.getTime() >= START_DATE_LIMIT.getTime()) {
            Logger.log(`Modificando Viernes en fila ${filaViernes}. Fecha: ${viernesDateValue.toLocaleDateString()}`);

            const filaTurnoManana = filaViernes + 1;
            let filaInicioBloque = filaViernes + 2; 

            // Paso 2: Encontrar el final del bloque de horario del viernes
            let filaFinBloque = filaInicioBloque;
            while (filaFinBloque <= allValues.length) {
              if (filaFinBloque - 1 >= allValues.length) break;

              const valorColumnaB = allValues[filaFinBloque - 1] ? String(allValues[filaFinBloque - 1][COLUMNA_DIA - 1]).trim() : '';

              if (valorColumnaB !== "" && !valorColumnaB.includes("Turno")) {
                break;
              }
              filaFinBloque++;
            }

            // Paso 3: Calcular y realizar la modificación
            const numFilasAEliminar = filaFinBloque - filaInicioBloque;

            if (numFilasAEliminar > 0) {
              // 3a. Eliminar el horario antiguo (sólo las filas de horas)
              sheet.deleteRows(filaInicioBloque, numFilasAEliminar);
            }

            if (ROWS_TO_INSERT > 0) {
              // 3b. Insertar las nuevas filas vacías después de la fila "Turno MAÑANA"
              sheet.insertRowsAfter(filaTurnoManana, ROWS_TO_INSERT);
              const filaInicioRango = filaTurnoManana + 1;
              
              // El rango de formato va desde la Columna C hasta la última Columna de datos (J=10)
              const COLUMNA_FIN_FORMATO = 10; 
              
              // Rango de todas las celdas afectadas (desde C hasta J) para aplicar formato de fuente
              const rangoNuevoFormatoFuente = sheet.getRange(filaInicioRango, HORA_COLUMNA, ROWS_TO_INSERT, COLUMNA_FIN_FORMATO - HORA_COLUMNA + 1);

              // 3c. Escribir el nuevo horario SÓLO en la Columna C
              const rangoNuevoHorarioC = sheet.getRange(filaInicioRango, HORA_COLUMNA, ROWS_TO_INSERT, 1);
              rangoNuevoHorarioC.setValues(NUEVOS_VALORES_HORA);
              
              // 3d. Aplicar Formato de Hora a la Columna C
              rangoNuevoHorarioC.setNumberFormat(HORA_FORMATO); 

              // --- APLICACIÓN DE FORMATO DE FUENTE ---
              rangoNuevoFormatoFuente.setFontColor("#000000") // Color negro
                               .setFontSize(10)          // Tamaño 10
                               .setFontWeight("normal"); // Sin negrita

              // 3e. Aplicar color de fondo alterno
              // Rango completo desde A (COLUMNA_FECHA) hasta J (COLUMNA_FIN_FORMATO)
              const NUM_COLUMNAS_TOTAL = COLUMNA_FIN_FORMATO - COLUMNA_FECHA + 1;

              for (let j = 0; j < ROWS_TO_INSERT; j++) {
                const filaActual = filaInicioRango + j;
                
                // Determinamos el color basado en el índice de fila (par o impar)
                const color = (filaActual % 2 !== 0) ? colorPalette.eventRowOddBg : colorPalette.eventRowEvenBg;
                
                // APLICAMOS EL COLOR DE FONDO A TODO EL ANCHO DE LA FILA (A:J)
                sheet.getRange(filaActual, COLUMNA_FECHA, 1, NUM_COLUMNAS_TOTAL)
                     .setBackground(color);
                
                // NOTA: Confiamos en que el formato condicional de los encabezados (si existe) 
                // para A y B, lo sobrescribirá.
              }
              // -----------------------------------------------------

              // 3f. Aplicar validación de Usuario (Columna D)
              if (usuarioValidation) {
                const rangoNuevoHorarioD = sheet.getRange(filaInicioRango, COLUMNA_USUARIO, ROWS_TO_INSERT, 1);
                rangoNuevoHorarioD.setDataValidation(usuarioValidation);
              }
              
              // 3g. Aplicar validación de Asistencia (Columna G)
              const rangoNuevoHorarioG = sheet.getRange(filaInicioRango, COLUMNA_ASISTENCIA, ROWS_TO_INSERT, 1);
              rangoNuevoHorarioG.setDataValidation(asistenciaValidation);
            }
          } else {
            Logger.log(`Saltando Viernes en fila ${filaViernes}. Fecha: ${viernesDateValue.toLocaleDateString()}. Es anterior al ${START_DATE_STRING}.`);
          }
        }
      }
    }

    Browser.msgBox("¡Proceso Terminado!", `Se ha modificado el horario de los viernes a partir del ${START_DATE_STRING}. Se ha ajustado el formato de color de fondo para que las columnas A y B sigan la alternancia de la agenda.`, Browser.Buttons.OK);

  } catch (e) {
    Logger.log("Error al ejecutar el script: " + e.toString());
    Browser.msgBox("Error", "Ocurrió un error al ejecutar el script. Consulta los registros de Apps Script para más detalles: " + e.toString(), Browser.Buttons.OK);
  }
}
