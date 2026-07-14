/**
 * @fileordenar_pacientes.gs
 * @description Optimización de ordenamiento de pacientes para evitar filas extra y mejorar rendimiento.
 * @mentor Scriptor Master
 */

function ordenarPacientes() {
  const ss = getSS();
  const sheet = ss.getSheetByName(SHEETS.MAESTRA);
  
  // 1. Obtención de datos masiva (Una sola llamada)
  const range = sheet.getDataRange();
  const data = range.getValues();
  
  // Validar si hay datos más allá de los encabezados
  if (data.length <= 1) {
    ss.toast("No hay datos de pacientes para ordenar.", "Aviso", 5);
    return;
  }

  const headers = data[0].map(h => h.toString().trim().toLowerCase());

  function findColumnIndex(headers, keyword) {
    return headers.findIndex(h => h.includes(keyword));
  }

  const idxEstado = findColumnIndex(headers, "estado");
  const idxIngreso = findColumnIndex(headers, "ingreso");
  const idxGravedad = findColumnIndex(headers, "gravedad");
  const idxUltimaVisita = findColumnIndex(headers, "última");
  const idxFechaInscripcion = findColumnIndex(headers, "inscripción");

  if (idxEstado === -1 || idxIngreso === -1 || idxGravedad === -1 || idxUltimaVisita === -1 || idxFechaInscripcion === -1) {
    Logger.log("No se encontraron todas las columnas necesarias");
    ss.toast("Error de configuración: revisa los encabezados.", "Error", 8);
    return;
  }

  const now = new Date();
  // Array para almacenar los scores y escribirlos de una sola vez
  // El tamaño debe ser igual a las filas de datos (data.length - 1)
  let scoresArray = [];

  // 2. Procesamiento lógico en memoria (Sin tocar la hoja)
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const estadoRaw = row[idxEstado];
    
    // VALIDACIÓN: Si la fila está vacía en la columna estado, score 0 o saltar
    if (!estadoRaw || estadoRaw.toString().trim() === "") {
      scoresArray.push([null]); // No asignamos puntaje a filas vacías
      continue;
    }

    const estado = estadoRaw.toString().trim();
    const ingreso = row[idxIngreso].toString().trim();
    const gravedad = row[idxGravedad].toString().trim();
    const fechaUlt = parseFecha(row[idxUltimaVisita]);
    const fechaIns = parseFecha(row[idxFechaInscripcion]);

    let score = 0;

    switch (estado) {
      case "🟢 Activo": score += 5000; break;
      case "🟡 En espera": score += 4000; break;
      case "✔️ Alta": score += 3000; break;
      case "🕐 Contactará": score += 2000; break;
      case "🚫 No responde": score += 1000; break;
    }

    if (ingreso === "📄 Volante" || ingreso === "🔁 Derivación propia") {
      score += 200;
    } else if (ingreso === "🕰️ Antiguo paciente") {
      score += 100;
    }

    if (gravedad === "🟢 Leve") score += 10;
    if (gravedad === "🟠 Moderado") score += 20;
    if (gravedad === "🔴 Urgente") score += 30;

    if (fechaIns) {
      let diffDays = Math.floor((now - fechaIns) / (1000 * 60 * 60 * 24));
      if (diffDays < 0) diffDays = 0;
      score += diffDays * 0.02;
    } else if (fechaUlt) {
      let diffDays2 = Math.floor((now - fechaUlt) / (1000 * 60 * 60 * 24));
      if (diffDays2 < 0) diffDays2 = 0;
      score += diffDays2 * 0.01;
    }

    // Guardamos el resultado con formato de 2 decimales
    scoresArray.push([Number(score.toFixed(2))]);
  }

  // 3. Escritura masiva de scores (Una sola llamada)
  if (scoresArray.length > 0) {
    const scoreRange = sheet.getRange(2, 1, scoresArray.length, 1);
    scoreRange.setNumberFormat("0.00");
    scoreRange.setValues(scoresArray);
  }

  // 4. Ordenamiento final
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn())
         .sort({column: 1, ascending: false});
  }

  ss.toast("Usuarios ordenados correctamente", "✅ Completado", 6);
}