/**
 * Función que gestiona la creación y generación de la agenda para un nuevo curso.
 * Pide el año, crea la hoja y la rellena con la agenda.
 */
function generarAgendaCurso() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const scriptTimeZone = ss.getSpreadsheetTimeZone();

  // 1. Preguntar el año académico y validar formato
  const response = ui.prompt('Crear Nueva Agenda', 'Introduce el año de inicio del curso (ej. 2025):', ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() !== ui.Button.OK) {
    ui.alert("Operación cancelada.");
    return;
  }

  const yearStartStr = response.getResponseText();
  const yearStart = parseInt(yearStartStr);

  if (isNaN(yearStart) || yearStartStr.length !== 4) {
    ui.alert("Formato de año incorrecto.", "Por favor, introduce un año válido de 4 dígitos (ej. 2025).");
    return;
  }

  const yearEnd = yearStart + 1;
  const sheetName = `Agenda ${yearStart}-${yearStart + 1}`;

  // 2. Comprobar si la hoja ya existe y preguntar al usuario si desea eliminarla
  let sheet = ss.getSheetByName(sheetName);
  if (sheet) {
    const confirmDelete = ui.alert(
      'Hoja ya existe',
      `Ya existe una hoja con el nombre "${sheetName}". ¿Deseas eliminarla y crear una nueva?`,
      ui.ButtonSet.YES_NO
    );
    if (confirmDelete === ui.Button.YES) {
      ss.deleteSheet(sheet);
      ui.alert('Hoja Eliminada', `La hoja "${sheetName}" ha sido eliminada.`, ui.ButtonSet.OK);
      sheet = ss.insertSheet(sheetName); // Re-insertar la hoja después de eliminarla
    } else {
      ui.alert('Operación Cancelada', `La hoja "${sheetName}" no fue eliminada. Creación de agenda cancelada.`, ui.ButtonSet.OK);
      return; // Cancelar si el usuario no quiere eliminarla
    }
  } else {
    sheet = ss.insertSheet(sheetName);
    // Insertar la hoja si no existe
  }

  // Limpiar la hoja y establecer encabezados iniciales
  sheet.clear();
  const headers = ["Fecha", "Día", "Hora", "Usuario", "Teléfono", "Sesión", "Asistencia", "ID Evento Calendar", "Notas"];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold").setBackground("#c9daf8").setHorizontalAlignment("center");
  sheet.setFrozenRows(1); // Congelar la fila de encabezados

  const numCols = headers.length;

  // Definir Fechas y Horarios de Generación
  const startDate = new Date(yearStart, 8, 1);
  const endDate = new Date(yearEnd, 6, 31, 23, 59, 59, 999);
  const diasLaborables = [1, 2, 3, 4, 5];
  const allRowsToInsert = [];
  const formattingRules = [];
  const groupingRules = [];
  let currentAbsoluteRow = 2;
  const nombresDiasSemanaEs = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const colorPalette = {
    monthHeaderBg: "#DDEBF7",
    monthHeaderFont: "#1F4E79",
    weekHeaderBg: "#EFEFEF",
    weekHeaderFont: "#4F81BD",
    eventRowOddBg: "#FFFFFF",
    eventRowEvenBg: "#F0F0F0",
    spacingRowBg: "#F3F4F6",
    turnHeaderBg: "#e0f2fe",
    turnHeaderFont: "#1F4E79",
    dateDayHeaderBg: "#DDEBF7",
    dateDayHeaderFont: "#1F4E79"
  };
  let fechaActual = new Date(startDate);
  fechaActual.setHours(0, 0, 0, 0);

  let lastMonth = -1;
  let lastWeek = -1;
  let startMonthGroupRow = -1;
  let startWeekGroupRow = -1; // <-- añadido: inicio de grupo por semana (manteniendo todo lo demás intacto)

  while (fechaActual <= endDate) {
    const diaSemana = fechaActual.getDay();
    const currentMonth = fechaActual.getMonth();
    const currentWeek = getSemanaDelMes(fechaActual);

    if (currentMonth !== lastMonth) {
      if (startMonthGroupRow !== -1) {
        groupingRules.push({
          startRow: startMonthGroupRow,
          endRow: currentAbsoluteRow - 1,
          depth: 2
        });
      }

      if (allRowsToInsert.length > 0) {
        allRowsToInsert.push(new Array(numCols).fill(""));
        formattingRules.push({
          type: 'spacing',
          startRow: currentAbsoluteRow,
          endRow: currentAbsoluteRow,
          height: 40,
          bgColor: colorPalette.spacingRowBg
        });
        currentAbsoluteRow++;
      }

      const monthTitleRow = new Array(numCols).fill("");
      monthTitleRow[0] = "📆 " + capitalizar(fechaActual.toLocaleString('es-ES', { month: 'long', year: 'numeric' }));
      allRowsToInsert.push(monthTitleRow);
      formattingRules.push({
        type: 'monthHeader',
        startRow: currentAbsoluteRow,
        endRow: currentAbsoluteRow,
        bgColor: colorPalette.monthHeaderBg,
        fontColor: colorPalette.monthHeaderFont,
        fontSize: 16,
        fontWeight: "bold",
        alignment: "center",
        merge: true,
        mergeCols: numCols
      });
      startMonthGroupRow = currentAbsoluteRow;
      currentAbsoluteRow++;

      lastMonth = currentMonth;
      lastWeek = -1;
    }

    if (currentWeek !== lastWeek) {
      // <-- añadido: cerrar el grupo de la semana anterior exactamente igual que se hace con los meses
      if (startWeekGroupRow !== -1) {
        groupingRules.push({
          startRow: startWeekGroupRow,
          endRow: currentAbsoluteRow - 1,
          depth: 1
        });
      }

      if (allRowsToInsert.length > 0 && lastWeek !== -1) {
        allRowsToInsert.push(new Array(numCols).fill(""));
        formattingRules.push({
          type: 'spacing',
          startRow: currentAbsoluteRow,
          endRow: currentAbsoluteRow,
          height: 30,
          bgColor: colorPalette.spacingRowBg
        });
        currentAbsoluteRow++;
      }
      const weekTitleRow = new Array(numCols).fill("");
      weekTitleRow[0] = `Semana ${currentWeek}`;
      allRowsToInsert.push(weekTitleRow);

      formattingRules.push({
        type: 'weekHeader',
        startRow: currentAbsoluteRow,
        endRow: currentAbsoluteRow,
        bgColor: colorPalette.weekHeaderBg,
        fontColor: colorPalette.weekHeaderFont,
        fontSize: 11,
        fontWeight: "bold",
        alignment: "left",
        merge: true,
        mergeCols: numCols
      });
      // marcar inicio del grupo de la semana en la misma posición que el título (exactamente como meses)
      startWeekGroupRow = currentAbsoluteRow;
      currentAbsoluteRow++;
      lastWeek = currentWeek;
    }

    if (diasLaborables.includes(diaSemana)) {
      const fechaParaFila = new Date(fechaActual);
      const diaSemanaTexto = nombresDiasSemanaEs[fechaParaFila.getDay()];
      const formattedDate = Utilities.formatDate(fechaParaFila, scriptTimeZone, "dd/MM/yyyy");
      const dateDayHeaderRow = new Array(numCols).fill("");
      dateDayHeaderRow[0] = formattedDate;
      dateDayHeaderRow[1] = diaSemanaTexto;
      allRowsToInsert.push(dateDayHeaderRow);
      formattingRules.push({
        type: 'dateDayHeader',
        startRow: currentAbsoluteRow,
        endRow: currentAbsoluteRow,
        fontSize: 12,
        fontWeight: "bold",
        alignment: "left",
        bgColor: colorPalette.dateDayHeaderBg,
        fontColor: colorPalette.dateDayHeaderFont,
        merge: true,
        mergeCols: numCols - 2
      });
      currentAbsoluteRow++;

      const morningTurnRow = new Array(numCols).fill("");
      morningTurnRow[0] = "🟡 Turno MAÑANA";
      allRowsToInsert.push(morningTurnRow);
      formattingRules.push({
        type: 'turnHeader',
        startRow: currentAbsoluteRow,
        endRow: currentAbsoluteRow,
        bgColor: colorPalette.turnHeaderBg,
        fontColor: colorPalette.turnHeaderFont,
        fontSize: 12,
        fontWeight: "bold",
        alignment: "center",
        merge: true,
        mergeCols: numCols
      });
      currentAbsoluteRow++;

      const timeSlotsForDay = [];
      if (diaSemana >= 1 && diaSemana <= 4) {
        timeSlotsForDay.push(...generarBloques('08:00', '14:00', 30));
      } else if (diaSemana === 5) {
        timeSlotsForDay.push(...generarBloques('08:00', '14:00', 30));
      }

      let isOddRow = true;
      timeSlotsForDay.forEach((horaFormateada) => {
        const eventRow = new Array(numCols).fill('');
        eventRow[2] = horaFormateada;
        allRowsToInsert.push(eventRow);

        formattingRules.push({
          type: 'eventRow',
          startRow: currentAbsoluteRow,
          endRow: currentAbsoluteRow,
          bgColor: isOddRow ? colorPalette.eventRowOddBg : colorPalette.eventRowEvenBg,
          verticalAlignment: "middle",
          wrap: true
        });
        currentAbsoluteRow++;
        isOddRow = !isOddRow;
      });
      if (diaSemana >= 1 && diaSemana <= 4) {
        const afternoonTurnRow = new Array(numCols).fill("");
        afternoonTurnRow[0] = "🟠 Turno TARDE";
        allRowsToInsert.push(afternoonTurnRow);
        formattingRules.push({
          type: 'turnHeader',
          startRow: currentAbsoluteRow,
          endRow: currentAbsoluteRow,
          bgColor: colorPalette.turnHeaderBg,
          fontColor: colorPalette.turnHeaderFont,
          fontSize: 12,
          fontWeight: "bold",
          alignment: "center",
          merge: true,
          mergeCols: numCols
        });
        currentAbsoluteRow++;

        const afternoonTimeSlots = generarBloques('16:00', '20:00', 30);
        afternoonTimeSlots.forEach((horaFormateada) => {
          const eventRow = new Array(numCols).fill('');
          eventRow[2] = horaFormateada;
          allRowsToInsert.push(eventRow);
          formattingRules.push({
            type: 'eventRow',
            startRow: currentAbsoluteRow,
            endRow: currentAbsoluteRow,
            bgColor: isOddRow ? colorPalette.eventRowOddBg : colorPalette.eventRowEvenBg,
            verticalAlignment: "middle",
            wrap: true
          });
          currentAbsoluteRow++;
          isOddRow = !isOddRow;
        });
      }
    }
    fechaActual.setDate(fechaActual.getDate() + 1);
  }

  // Cerrar el último grupo de semanas (si existe) y meses exactamente como en la versión original
  if (startWeekGroupRow !== -1) {
    groupingRules.push({
      startRow: startWeekGroupRow,
      endRow: currentAbsoluteRow - 1,
      depth: 1
    });
  }

  if (startMonthGroupRow !== -1) {
    groupingRules.push({
      startRow: startMonthGroupRow,
      endRow: currentAbsoluteRow - 1,
      depth: 1
    });
  }

  if (allRowsToInsert.length > 0) {
    sheet.getRange(2, 1, allRowsToInsert.length, numCols).setValues(allRowsToInsert);
  }

  const rangesToFormat = {
    monthHeader: [],
    weekHeader: [],
    eventRowOdd: [],
    eventRowEven: [],
    spacing: [],
    turnHeader: [],
    dateDayHeader: []
  };
  formattingRules.forEach(rule => {
    const targetCols = (rule.type === 'dateDayHeader') ? 2 : numCols;
    const rangeA1 = sheet.getRange(rule.startRow, 1, rule.endRow - rule.startRow + 1, targetCols).getA1Notation();
    if (rule.type === 'monthHeader') rangesToFormat.monthHeader.push({ range: rangeA1, rule: rule });
    else if (rule.type === 'weekHeader') rangesToFormat.weekHeader.push({ range: rangeA1, rule: rule });
    else if (rule.type === 'eventRow' && rule.bgColor === colorPalette.eventRowOddBg) rangesToFormat.eventRowOdd.push({ range: rangeA1, rule: rule });
    else if (rule.type === 'eventRow' && rule.bgColor === colorPalette.eventRowEvenBg) rangesToFormat.eventRowEven.push({ range: rangeA1, rule: rule });
    else if (rule.type === 'spacing') rangesToFormat.spacing.push({ range: rangeA1, rule: rule });
    else if (rule.type === 'turnHeader') rangesToFormat.turnHeader.push({ range: rangeA1, rule: rule });
    else if (rule.type === 'dateDayHeader') rangesToFormat.dateDayHeader.push({ range: rangeA1, rule: rule });
  });

  function applyBatchFormat(ranges, commonRule) {
    if (ranges.length === 0) return;
    const allRangesA1 = ranges.map(item => item.range);
    const combinedRangeList = sheet.getRangeList(allRangesA1);
    if (commonRule.bgColor) combinedRangeList.setBackground(commonRule.bgColor);
    if (commonRule.fontColor) combinedRangeList.setFontColor(commonRule.fontColor);
    if (commonRule.fontSize) combinedRangeList.setFontSize(commonRule.fontSize);
    if (commonRule.fontWeight) combinedRangeList.setFontWeight(commonRule.fontWeight);
    if (commonRule.alignment) combinedRangeList.setHorizontalAlignment(commonRule.alignment);
    if (commonRule.verticalAlignment) combinedRangeList.setVerticalAlignment(commonRule.verticalAlignment);
    if (commonRule.wrap !== undefined) combinedRangeList.setWrap(commonRule.wrap);
    ranges.forEach(item => {
      if (item.rule.merge) {
        if (item.rule.type === 'dateDayHeader') {
          sheet.getRange(item.rule.startRow, 3, item.rule.endRow - item.rule.startRow + 1, numCols - 2).merge();
        } else {
          sheet.getRange(item.rule.startRow, 1, item.rule.endRow - item.rule.startRow + 1, numCols).merge();
        }
      }
      if (item.rule.height) {
        sheet.setRowHeight(item.rule.startRow, item.rule.height);
      }
    });
  }

  applyBatchFormat(rangesToFormat.monthHeader, {
    bgColor: colorPalette.monthHeaderBg,
    fontColor: colorPalette.monthHeaderFont,
    fontSize: 16,
    fontWeight: "bold",
    alignment: "center",
    merge: true
  });
  applyBatchFormat(rangesToFormat.weekHeader, {
    bgColor: colorPalette.weekHeaderBg,
    fontColor: colorPalette.weekHeaderFont,
    fontSize: 11,
    fontWeight: "bold",
    alignment: "left",
    merge: true
  });
  applyBatchFormat(rangesToFormat.eventRowOdd, {
    bgColor: colorPalette.eventRowOddBg,
    verticalAlignment: "middle",
    wrap: true
  });
  applyBatchFormat(rangesToFormat.eventRowEven, {
    bgColor: colorPalette.eventRowEvenBg,
    verticalAlignment: "middle",
    wrap: true
  });
  applyBatchFormat(rangesToFormat.spacing, {
    bgColor: colorPalette.spacingRowBg
  });
  applyBatchFormat(rangesToFormat.turnHeader, {
    bgColor: colorPalette.turnHeaderBg,
    fontColor: colorPalette.turnHeaderFont,
    fontSize: 12,
    fontWeight: "bold",
    alignment: "center",
    merge: true
  });
  applyBatchFormat(rangesToFormat.dateDayHeader, {
    bgColor: colorPalette.dateDayHeaderBg,
    fontColor: colorPalette.dateDayHeaderFont,
    fontSize: 12,
    fontWeight: "bold",
    alignment: "left",
    merge: true,
    mergeCols: numCols - 2
  });
  
  sheet.getRange("A:A").setNumberFormat("dd/mm/yyyy");

  const hojaBD = ss.getSheetByName("Base de Datos Maestra");
  if (hojaBD) {
    const usuarioValidation = SpreadsheetApp.newDataValidation()
      .requireValueInRange(hojaBD.getRange('B2:B'), true)
      .setAllowInvalid(false)
      .setHelpText('Selecciona un usuario de la lista de tu Base de Datos Maestra.')
      .build();
    sheet.getRange("D2:D").setDataValidation(usuarioValidation);
  }


  const asistenciaValidation = SpreadsheetApp.newDataValidation()
    .requireValueInList(["✅ Sí", "❌ No", "Pendiente", "Justificada"])
    .setAllowInvalid(false)
    .setHelpText('Selecciona el estado de asistencia: Sí, No, Pendiente o Justificada.')
    .build();
  sheet.getRange("G2:G").setDataValidation(asistenciaValidation);

  const horaOptions = "00:00,00:30,01:00,01:30,02:00,02:30,03:00,03:30,04:00,04:30,05:00,05:30,06:00,06:30,07:00,07:30,08:00,08:30,09:00,09:30,10:00,10:30,11:00,11:30,12:00,12:30,13:00,13:30,14:00,14:30,15:00,15:30,16:00,16:30,17:00,17:30,18:00,18:30,19:00,19:30,20:00,20:30,21:00,21:30,22:00,22:30,23:00,23:30";
  const horaValidation = SpreadsheetApp.newDataValidation()
    .requireValueInList(horaOptions.split(','))
    .setAllowInvalid(false)
    .setHelpText('Selecciona la hora de la cita.')
    .build();
  sheet.getRange("C2:C").setDataValidation(horaValidation);

  sheet.autoResizeColumns(1, headers.length);
  sheet.setColumnWidth(1, 120);
  sheet.setColumnWidth(2, 80);
  sheet.setColumnWidth(3, 80);
  sheet.setColumnWidth(4, 250);
  sheet.setColumnWidth(5, 120);
  sheet.setColumnWidth(6, 150);
  sheet.setColumnWidth(7, 100);
  sheet.setColumnWidth(8, 150);
  sheet.setColumnWidth(9, 200);


// Esto evita que un grupo de mayor rango “se trague" a los internos y produzca un único control de colapso.
// Aplicar agrupaciones: crear primero los grupos internos (semanas) y después los externos (meses)
groupingRules.sort(function(a,b){
  if (a.depth !== b.depth) return a.depth - b.depth; // grupos más pequeños (semanas) primero
  return a.startRow - b.startRow; // en empate, ordenar por posición
});

groupingRules.forEach(rule => {
  if (rule.endRow >= rule.startRow) {
    // aplicar la profundidad según el tipo de grupo (1 = semana, 2 = mes)
    sheet.getRange(rule.startRow, 1, rule.endRow - rule.startRow + 1, 1).shiftRowGroupDepth(rule.depth);
  }
});

  ui.alert('Completado', `Agenda "${sheetName}" generada correctamente.`, ui.ButtonSet.OK);
}

// Funciones auxiliares que se utilizan en la función principal
function getSemanaDelMes(d) {
  const firstDayOfMonth = new Date(d.getFullYear(), d.getMonth(), 1);
  const startDay = firstDayOfMonth.getDay() || 7; // Convertir 0 (domingo) a 7 para el cálculo
  if (startDay !== 1) {
    firstDayOfMonth.setDate(firstDayOfMonth.getDate() - startDay + 1);
  }
  return Math.ceil((d.getTime() - firstDayOfMonth.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
}

function capitalizar(string) {
  if (!string) return '';
  return string.charAt(0).toUpperCase() + string.slice(1);
}

function generarBloques(start, end, interval) {
  const result = [];
  const startMinutes = parseTime(start);
  const endMinutes = parseTime(end);

  for (let m = startMinutes; m < endMinutes; m += interval) {
    result.push(formatTime(m));
  }
  return result;
}

function parseTime(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

function formatTime(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}
/**
 * Función auxiliar para generar bloques de horas.
 */
function generarBloques(inicio, fin, duracionMin) {
  const bloques = [];
  let [h, m] = inicio.split(":").map(Number);
  const [hf, mf] = fin.split(':').map(Number);

  while (h < hf || (h === hf && m < mf)) {
    const hora = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    bloques.push(hora);
    m += duracionMin;
    if (m >= 60) {
      m -= 60;
      h += 1;
    }
  }
  return bloques;
}

/**
 * Auxiliar para saber la semana del mes.
 */
function getSemanaDelMes(date) {
  const primerDiaMes = new Date(date.getFullYear(), date.getMonth(), 1);
  const dia = date.getDate();
  // getDay() devuelve 0 para Domingo, 1 para Lunes...
  // Ajustar para que Lunes sea 1, Domingo sea 7 para el cálculo de la semana
  const dayOfWeek = (primerDiaMes.getDay() === 0) ? 7 : primerDiaMes.getDay();
  return Math.ceil((dia + dayOfWeek - 1) / 7);
}

/**
 * Auxiliar para capitalizar nombres de días/meses.
 */
function capitalizar(texto) {
  if (!texto) return '';
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function collapsePastWeeksOnOpen(sheet) {
  const today = new Date();
  today.setHours(0,0,0,0);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();

  // Buscar la primera fila con fecha >= hoy
  let targetRowIndex = -1; // índice en array `values` (0 = fila 2)
  for (let i = 0; i < values.length; i++) {
    const v = values[i][0];
    if (v instanceof Date) {
      const d = new Date(v);
      d.setHours(0,0,0,0);
      if (d >= today) { targetRowIndex = i; break; }
    }
  }

  // Si no hay fecha >= hoy, usar la última fecha disponible (por si abres fuera de rango)
  if (targetRowIndex === -1) {
    for (let i = values.length - 1; i >= 0; i--) {
      if (values[i][0] instanceof Date) { targetRowIndex = i; break; }
    }
    if (targetRowIndex === -1) return; // no hay fechas en la hoja
  }

  // Buscar hacia atrás el encabezado 'Semana' más cercano
  let currentWeekHeaderRow = null;
  for (let k = targetRowIndex; k >= 0; k--) {
    const cell = values[k][0];
    if (typeof cell === 'string' && cell.toString().startsWith('Semana')) {
      currentWeekHeaderRow = k + 2; // +2 porque values[0] corresponde a la fila 2
      break;
    }
  }
  if (!currentWeekHeaderRow) return;

  // Colapsar todas las semanas anteriores y expandir la actual
  for (let k = 0; k < values.length; k++) {
    const cell = values[k][0];
    if (typeof cell === 'string' && cell.toString().startsWith('Semana')) {
      const rowIndex = k + 2;
      try {
        const group = sheet.getRowGroup(rowIndex, 1);
        if (!group) continue;
        if (rowIndex < currentWeekHeaderRow) group.collapse();
        else if (rowIndex === currentWeekHeaderRow) group.expand();
      } catch (e) {
        // ignorar errores en caso de que no exista el grupo exactamente
      }
    }
  }
}