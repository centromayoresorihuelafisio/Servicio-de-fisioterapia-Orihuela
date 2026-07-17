/**
 * @fileordenar_pacientes.gs
 * @description Optimización de ordenamiento de pacientes para evitar filas extra y mejorar rendimiento.
 * @mentor Scriptor Master
 */

function ordenarPacientes() {
  const ss = getSS();
  const sheet = ss.getSheetByName(SHEETS.MAESTRA);

  // Obtención de datos masiva, incluyendo el Rich Text (imprescindible para
  // no perder el hipervínculo de "Historia clínica" al reordenar filas).
  const range = sheet.getDataRange();
  const data = range.getValues();
  const richTextData = range.getRichTextValues();

  if (data.length <= 1) {
    ss.toast("No hay datos de pacientes para ordenar.", "Aviso", 5);
    return;
  }

  const headersLower = data[0].map(h => h.toString().trim().toLowerCase());

  function findColumnIndex(headers, keyword) {
    return headers.findIndex(h => h.includes(keyword));
  }

  const idxEstado = findColumnIndex(headersLower, "estado");
  const idxIngreso = findColumnIndex(headersLower, "ingreso");
  const idxGravedad = findColumnIndex(headersLower, "gravedad");
  const idxUltimaVisita = findColumnIndex(headersLower, "última");
  const idxFechaInscripcion = findColumnIndex(headersLower, "inscripción");
  const idxHistoria = findColumnIndex(headersLower, "historia");

  if (idxEstado === -1 || idxIngreso === -1 || idxGravedad === -1 || idxUltimaVisita === -1 || idxFechaInscripcion === -1) {
    Logger.log("No se encontraron todas las columnas necesarias");
    ss.toast("Error de configuración: revisa los encabezados.", "Error", 8);
    return;
  }

  const now = new Date();

  // Cálculo de scores en memoria; los guardamos ya en la propia matriz
  // `data` (columna 1) para no necesitar una escritura aparte.
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const estadoRaw = row[idxEstado];

    if (!estadoRaw || estadoRaw.toString().trim() === "") {
      row[0] = 0;
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

    row[0] = Number(score.toFixed(2));
  }

  // Ordenamos un array de ÍNDICES de fila (en vez de usar Range.sort()
  // directamente sobre la hoja): así podemos reconstruir juntos los valores
  // Y el Rich Text de "Historia clínica" en el nuevo orden. Range.sort()
  // pierde ese hipervínculo al reordenar filas — es un bug conocido de
  // Apps Script, no depende de cómo se generó el enlace.
  const indices = [];
  for (let i = 1; i < data.length; i++) indices.push(i);
  indices.sort((a, b) => data[b][0] - data[a][0]);

  const newValues = indices.map(i => data[i]);
  const numFilas = data.length - 1;
  const lastCol = sheet.getLastColumn();

  // Escritura masiva de los valores ya reordenados.
  sheet.getRange(2, 1, numFilas, lastCol).setValues(newValues);
  sheet.getRange(2, 1, numFilas, 1).setNumberFormat("0.00");

  // Reaplicamos el Rich Text de "Historia clínica" en su nuevo orden — el
  // setValues anterior lo habría aplanado a texto plano.
  if (idxHistoria !== -1) {
    const newRichText = indices.map(i => [richTextData[i][idxHistoria]]);
    sheet.getRange(2, idxHistoria + 1, numFilas, 1).setRichTextValues(newRichText);
  }

  ss.toast("Usuarios ordenados correctamente", "✅ Completado", 6);
}