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

  // Encabezados normalizados (minúsculas y sin acentos) para que "Última
  // visita" y "Ultima visita" se reconozcan igual.
  const headersNorm = data[0].map(h =>
    h.toString().trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  );

  // Los keywords van por orden de prioridad: se busca primero el más
  // específico y solo si no aparece se prueba el siguiente.
  function findColumnIndex(...keywords) {
    for (const keyword of keywords) {
      const idx = headersNorm.findIndex(h => h.includes(keyword));
      if (idx !== -1) return idx;
    }
    return -1;
  }

  const idxEstado = findColumnIndex("estado");
  const idxIngreso = findColumnIndex("tipo de ingreso", "ingreso");
  const idxGravedad = findColumnIndex("gravedad");
  const idxUltimaVisita = findColumnIndex("ultima visita", "ultima");
  const idxFechaInscripcion = findColumnIndex("fecha inscripcion", "inscripcion");
  const idxHistoria = findColumnIndex("historia clinica", "historia");

  if (idxEstado === -1 || idxIngreso === -1 || idxGravedad === -1 || idxUltimaVisita === -1 || idxFechaInscripcion === -1) {
    Logger.log("No se encontraron todas las columnas necesarias");
    ss.toast("Error de configuración: revisa los encabezados.", "Error", 8);
    return;
  }

  const now = new Date();
  const MS_POR_DIA = 1000 * 60 * 60 * 24;

  // Cálculo de scores en memoria; los guardamos ya en la propia matriz
  // `data` (columna 1) para no necesitar una escritura aparte.
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const estadoRaw = row[idxEstado];

    if (!estadoRaw || estadoRaw.toString().trim() === "") {
      row[0] = null;
      continue;
    }

    const estado = estadoRaw.toString().trim();
    const esAlta = estado === ESTADOS_PACIENTE.ALTA;
    const ingreso = row[idxIngreso].toString().trim();
    const gravedad = row[idxGravedad].toString().trim();
    const fechaUlt = parseFecha(row[idxUltimaVisita]);
    const fechaIns = parseFecha(row[idxFechaInscripcion]);

    let score = 0;

    switch (estado) {
      case ESTADOS_PACIENTE.ACTIVO: score += 5000; break;
      case ESTADOS_PACIENTE.EN_ESPERA: score += 4000; break;
      case ESTADOS_PACIENTE.ALTA: score += 3000; break;
      case ESTADOS_PACIENTE.CONTACTARA: score += 2000; break;
      case ESTADOS_PACIENTE.NO_RESPONDE: score += 1000; break;
    }

    if (ingreso === "📄 Volante" || ingreso === "🔁 Derivación propia") {
      score += 200;
    } else if (ingreso === "🕰️ Antiguo paciente") {
      score += 100;
    }

    if (gravedad === "🟢 Leve") score += 10;
    if (gravedad === "🟠 Moderado") score += 20;
    if (gravedad === "🔴 Urgente") score += 30;

    // Desempate por fechas:
    //  - Si NO está de alta y tiene fecha de inscripción: cuenta el tiempo
    //    de espera desde la inscripción (0,02 puntos por día).
    //  - En cualquier otro caso (alta, o sin inscripción): cuenta el tiempo
    //    desde la última visita (0,01 puntos por día).
    // Así los altas conservan su fecha de inscripción en la hoja sin que
    // eso altere su posición en la lista.
    if (fechaIns && !esAlta) {
      let diffDays = Math.floor((now - fechaIns) / MS_POR_DIA);
      if (diffDays < 0) diffDays = 0;
      score += diffDays * 0.02;
    } else if (fechaUlt) {
      let diffDays2 = Math.floor((now - fechaUlt) / MS_POR_DIA);
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