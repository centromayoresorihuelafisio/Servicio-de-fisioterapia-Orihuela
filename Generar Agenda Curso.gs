/**
 * @fileoverview Generador de Agenda Anual para Citas Médicas/Clínicas.
 * @version 5.2
 * @author Scriptor Master (Turn Highlighting)
 */

function generarAgendaCurso() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const response = ui.prompt(
    'Configuración de Agenda Clínica',
    'Introduce el año de inicio del curso (ej. 2025):',
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) return;

  const yearStartStr = response.getResponseText();
  const yearStart = parseInt(yearStartStr);

  if (isNaN(yearStart) || yearStartStr.length !== 4) {
    ui.alert("⚠️ Error: El formato del año debe ser de 4 dígitos (ej: 2025).");
    return;
  }

  const yearEnd = yearStart + 1;
  const sheetName = `Agenda ${yearStart}-${yearEnd}`;
  let sheet = ss.getSheetByName(sheetName);

  // --- GESTIÓN DE HOJA Y LIMPIEZA ---
  if (sheet) {
    const confirmDelete = ui.alert('Reiniciar Hoja', `¿Borrar "${sheetName}" y generar de nuevo?`, ui.ButtonSet.YES_NO);
    if (confirmDelete !== ui.Button.YES) return;
    sheet.clear();
    sheet.clearConditionalFormatRules();
    try { 
      // Limpiar grupos previos reseteando profundidad (limpia hasta 8 niveles)
      sheet.getRange("A:A").shiftRowGroupDepth(-8); 
    } catch (e) {}
    sheet.showColumns(1, sheet.getMaxColumns());
  } else {
    sheet = ss.insertSheet(sheetName);
  }

  // --- CONFIGURACIÓN DE CABECERAS PRINCIPALES ---
  const headers = ["Fecha", "Día", "Hora", "Usuario", "Teléfono", "Sesión", "Asistencia", "ID Evento Calendar", "Historia clínica", "Notas"];
  const numCols = headers.length;
  
  sheet.getRange(1, 1, 1, numCols)
    .setValues([headers])
    .setFontWeight("bold")
    .setFontColor("#475569") 
    .setBackground("#F1F5F9") 
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");

  sheet.setFrozenRows(1);
  sheet.setRowHeight(1, 35);

  // --- CONFIGURACIÓN DE FECHAS Y COLORES ---
  const startDate = new Date(yearStart, 8, 1); 
  const endDate = new Date(yearEnd, 6, 31, 23, 59, 59);
  const diasLaborables = [1, 2, 3, 4, 5];

  const cp = {
    monthBg: "#E2E8F0",      
    monthFont: "#1E293B",    
    weekBg: "#F8FAFC",       
    weekFont: "#64748B",     
    dayBg: "#f1f5f9",        
    dayFont: "#1e293b",      
    turnBg: "#cbd5e1",       // CAMBIO SOLICITADO: Color de relleno de turnos
    turnFont: "#1e293b",     // Ajuste ligero para legibilidad sobre el nuevo fondo
    rowEven: "#FFFFFF",
    rowOdd: "#F0F0F0",       
    border: "#F1F5F9"
  };

  const values = [], backgrounds = [], fontColors = [], fontWeights = [], alignments = [], validations = [], merges = [];
  const monthGroups = [], weekGroups = [];
  const monthRows = [], weekRows = [], turnRows = [];

  let currentRow = 2;
  let lastMonth = -1, lastWeek = -1;
  let monthStartRow = -1, weekStartRow = -1;

  // --- REGLAS DE VALIDACIÓN (DESPLEGABLES) ---
  const opcionesAsistencia = ["✅ Asistido", "❌ No Asistido", "⚠️ Justificada", "⏳ Pendiente"];
  const ruleAsistencia = SpreadsheetApp.newDataValidation().requireValueInList(opcionesAsistencia).setAllowInvalid(false).build();
  
  let ruleUser = null;
  const dbSheet = ss.getSheetByName(SHEETS.MAESTRA);
  if (dbSheet && dbSheet.getLastRow() > 1) {
    ruleUser = SpreadsheetApp.newDataValidation().requireValueInRange(dbSheet.getRange(2, 2, dbSheet.getLastRow() - 1, 1), true).build();
  }

  // --- BUCLE DE GENERACIÓN ---
  let cursor = new Date(startDate);
  cursor.setHours(0,0,0,0);

  while (cursor <= endDate) {
    const m = cursor.getMonth();
    const w = getSemanaDelMes(cursor);
    const d = cursor.getDay();
    const dateObj = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());

    // Cambio de Mes
    if (m !== lastMonth) {
      if (weekStartRow !== -1) weekGroups.push([weekStartRow, currentRow - 1]);
      if (monthStartRow !== -1) monthGroups.push([monthStartRow, currentRow - 1]);
      
      monthRows.push(currentRow);
      
      const mLabel = "● " + capitalizar(cursor.toLocaleString('es-ES', { month: 'long', year: 'numeric' }));
      let mRow = buildRow(numCols, dateObj, "", mLabel);
      values.push(mRow);
      backgrounds.push(new Array(numCols).fill(cp.monthBg));
      fontColors.push(buildColorRow(numCols, cp.monthFont, cp.monthBg));
      fontWeights.push(new Array(numCols).fill("bold"));
      alignments.push(buildAlignRow(numCols, "center"));
      validations.push(new Array(numCols).fill(null));
      
      merges.push([currentRow, 3, 1, numCols - 2]);
      
      monthStartRow = currentRow + 1; 
      currentRow++;
      lastMonth = m;
      lastWeek = w; 

      weekRows.push(currentRow);
      let wRow = buildRow(numCols, dateObj, "", `SEMANA ${w}`);
      values.push(wRow);
      backgrounds.push(new Array(numCols).fill(cp.weekBg));
      fontColors.push(buildColorRow(numCols, cp.weekFont, cp.weekBg)); 
      fontWeights.push(new Array(numCols).fill("bold"));
      alignments.push(buildAlignRow(numCols, "left"));
      validations.push(new Array(numCols).fill(null));
      merges.push([currentRow, 3, 1, numCols - 2]);
      weekStartRow = currentRow + 1;
      currentRow++;
    } 
    else if (w !== lastWeek) {
      if (weekStartRow !== -1) weekGroups.push([weekStartRow, currentRow - 1]);
      
      weekRows.push(currentRow);
      let wRow = buildRow(numCols, dateObj, "", `SEMANA ${w}`);
      values.push(wRow);
      backgrounds.push(new Array(numCols).fill(cp.weekBg));
      fontColors.push(buildColorRow(numCols, cp.weekFont, cp.weekBg)); 
      fontWeights.push(new Array(numCols).fill("bold"));
      alignments.push(buildAlignRow(numCols, "left"));
      validations.push(new Array(numCols).fill(null));
      
      merges.push([currentRow, 3, 1, numCols - 2]);
      weekStartRow = currentRow + 1;
      currentRow++;
      lastWeek = w;
    }

    if (diasLaborables.includes(d)) {
      const dTxt = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'][d];

      // Encabezado del Día
      let dRow = buildRow(numCols, dateObj, dTxt, "");
      values.push(dRow);
      backgrounds.push(new Array(numCols).fill(cp.dayBg));
      fontColors.push(new Array(numCols).fill(cp.dayFont));
      fontWeights.push(new Array(numCols).fill("bold"));
      alignments.push(buildAlignRow(numCols, "left"));
      validations.push(new Array(numCols).fill(null));
      merges.push([currentRow, 3, 1, numCols - 2]); 
      currentRow++;

      const turnos = [{ n: "MAÑANA", i: '08:00', f: '14:00' }];
      if (d >= 1 && d <= 4) turnos.push({ n: "TARDE", i: '16:00', f: '20:00' });

      turnos.forEach(t => {
        turnRows.push(currentRow);
        
        let tRow = buildRow(numCols, dateObj, dTxt, "   " + t.n);
        values.push(tRow);
        backgrounds.push(new Array(numCols).fill(cp.turnBg));
        fontColors.push(buildColorRow(numCols, cp.turnFont, cp.turnBg));
        fontWeights.push(new Array(numCols).fill("bold"));
        alignments.push(buildAlignRow(numCols, "left"));
        validations.push(new Array(numCols).fill(null));
        merges.push([currentRow, 3, 1, numCols - 2]);
        currentRow++;

        const slots = generarBloques(t.i, t.f, 30);
        slots.forEach((h, idx) => {
          let [hh, mm] = h.split(':').map(Number);
          let timeObj = new Date(1899, 11, 30, hh, mm, 0); 
          
          let sRow = buildRow(numCols, dateObj, dTxt, timeObj);
          let bgHex = (idx % 2 === 0) ? cp.rowEven : cp.rowOdd;
          
          values.push(sRow);
          backgrounds.push(new Array(numCols).fill(bgHex));
          fontColors.push(buildColorRow(numCols, "#475569", bgHex));
          fontWeights.push(new Array(numCols).fill("normal"));
          
          let al = new Array(numCols).fill("left"); al[2]="center"; al[6]="center";
          alignments.push(al);
          
          let val = new Array(numCols).fill(null);
          if(ruleUser) val[3] = ruleUser; 
          val[6] = ruleAsistencia;
          validations.push(val);
          
          currentRow++;
        });
      });
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  // --- CIERRE DE GRUPOS FINAL ---
  if (weekStartRow !== -1) weekGroups.push([weekStartRow, currentRow - 1]);
  if (monthStartRow !== -1) monthGroups.push([monthStartRow, currentRow - 1]);

  // --- ESCRITURA ---
  if (values.length > 0) {
    const range = sheet.getRange(2, 1, values.length, numCols);
    range.setValues(values);
    range.setBackgrounds(backgrounds);
    range.setFontColors(fontColors);
    range.setFontWeights(fontWeights);
    range.setHorizontalAlignments(alignments);
    range.setDataValidations(validations);
    range.setVerticalAlignment("middle");
    range.setBorder(true, true, true, true, true, true, cp.border, SpreadsheetApp.BorderStyle.SOLID);
    
    sheet.getRange(2, 1, values.length, 1).setNumberFormat("dd/MM/yyyy");
    sheet.getRange(2, 3, values.length, 1).setNumberFormat("HH:mm");
    
    merges.forEach(m => {
      try { sheet.getRange(m[0], m[1], m[2], m[3]).merge(); } catch(e) {}
    });
  }

  // --- SEPARADORES Y OCULTAR ID ---
  monthRows.forEach(r => sheet.getRange(r, 1, 1, numCols).setBorder(true, false, false, false, false, false, "#1E293B", SpreadsheetApp.BorderStyle.SOLID_THICK));
  weekRows.forEach(r => sheet.getRange(r, 1, 1, numCols).setBorder(true, false, false, false, false, false, "#94A3B8", SpreadsheetApp.BorderStyle.SOLID_MEDIUM));
  
  // MODIFICACIÓN SOLICITADA: Borde inferior claro para las filas de turno
  turnRows.forEach(r => {
      const tRange = sheet.getRange(r, 1, 1, numCols);
      tRange.setBorder(null, null, true, null, null, null, "#475569", SpreadsheetApp.BorderStyle.SOLID); // Borde inferior marcado
  });

  sheet.hideColumns(8); 

  // --- FORMATO CONDICIONAL ---
  const asisRange = sheet.getRange(2, 7, currentRow - 2, 1);
  const rules = [];
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("⏳ Pendiente").setBackground("#FFEDD5").setFontColor("#9A3412").setRanges([asisRange]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("⚠️ Justificada").setBackground("#FEF08A").setFontColor("#854D0E").setRanges([asisRange]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("✅ Asistido").setBackground("#BBF7D0").setFontColor("#166534").setRanges([asisRange]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("❌ No Asistido").setBackground("#FECACA").setFontColor("#991B1B").setRanges([asisRange]).build());
  sheet.setConditionalFormatRules(rules);

  const widths = { 1: 110, 2: 90, 3: 70, 4: 220, 7: 130, 9: 150, 10: 250 };
  Object.keys(widths).forEach(k => sheet.setColumnWidth(parseInt(k), widths[k]));

  // --- AGRUPADORES JERÁRQUICOS DE 3 NIVELES ---
  if (currentRow > 3) {
    sheet.getRange(3, 1, currentRow - 3).shiftRowGroupDepth(1);
  }
  monthGroups.forEach(g => {
    if (g[1] >= g[0]) {
      sheet.getRange(g[0], 1, g[1] - g[0] + 1).shiftRowGroupDepth(1);
    }
  });
  weekGroups.forEach(g => {
    if (g[1] >= g[0]) {
      sheet.getRange(g[0], 1, g[1] - g[0] + 1).shiftRowGroupDepth(1);
    }
  });

  ui.alert('✅ Nueva Agenda generada.');
}

function buildRow(numCols, col1, col2, col3) {
  const r = new Array(numCols).fill("");
  r[0] = col1; r[1] = col2; r[2] = col3;
  return r;
}

function buildColorRow(numCols, mainColor, hiddenBgColor) {
  const c = new Array(numCols).fill(mainColor);
  c[0] = hiddenBgColor; 
  c[1] = hiddenBgColor; 
  return c;
}

function buildAlignRow(numCols, col3Align) {
  const a = new Array(numCols).fill("left");
  a[2] = col3Align;
  return a;
}

function getSemanaDelMes(date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const day = (first.getDay() === 0) ? 7 : first.getDay();
  return Math.ceil((date.getDate() + day - 1) / 7);
}

function capitalizar(t) { return t.charAt(0).toUpperCase() + t.slice(1); }

function generarBloques(ini, fin, dur) {
  const b = [];
  let [h, m] = ini.split(":").map(Number);
  const [hf, mf] = fin.split(':').map(Number);
  while (h < hf || (h === hf && m < mf)) {
    b.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    m += dur; if (m >= 60) { m -= 60; h++; }
  }
  return b;
}