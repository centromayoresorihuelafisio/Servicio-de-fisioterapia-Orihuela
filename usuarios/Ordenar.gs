/**
 * Reordena la Maestra por prioridad (Estado, Tipo de ingreso, Gravedad y tiempo de espera). Devuelve { success, message }
 * (antes devolvía undefined y avisaba con ss.toast, que en la web no se ve).
 * Quien edite un campo que cuenta en la puntuación sin pasar por aquí debe llamar a ordenarPacientesSiProcede_ DESPUÉS de
 * soltar su LockService (no se sabe si el bloqueo admite reentrada). Solo se pueden dejar sin reordenar los cambios que no
 * tocan Estado, Tipo de ingreso, Gravedad, Fecha de inscripción ni Última visita.
 */
function ordenarPacientes() {
  const ss = getSS();
  const sheet = ss.getSheetByName(SHEETS.MAESTRA);
  if (!sheet) return { success: false, message: 'No se encontró la hoja "' + SHEETS.MAESTRA + '".' };

  // Obtención de datos masiva, incluyendo el Rich Text (imprescindible para
  // no perder el hipervínculo de "Historia clínica" al reordenar filas).
  const range = sheet.getDataRange();
  const data = range.getValues();
  const richTextData = range.getRichTextValues();

  if (data.length <= 1) return { success: true, message: 'No hay datos de usuarios para ordenar.' };

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
    return { success: false, message: 'Error de configuración: revisa los encabezados de la Maestra.' };
  }

  const now = new Date();
  const MS_POR_DIA = 1000 * 60 * 60 * 24;

  // Las etiquetas se comparan sin emoji (textoSinEmoji_): vale igual para celdas antiguas ("🟢 Activo") y nuevas ("Activo").
  const clave = (v) => textoSinEmoji_(v).toLowerCase();
  const PUNTOS_ESTADO = {};
  PUNTOS_ESTADO[clave(ESTADOS_PACIENTE.ACTIVO)] = 5000;
  PUNTOS_ESTADO[clave(ESTADOS_PACIENTE.EN_ESPERA)] = 4000;
  PUNTOS_ESTADO[clave(ESTADOS_PACIENTE.ALTA)] = 3000;
  PUNTOS_ESTADO[clave(ESTADOS_PACIENTE.CONTACTARA)] = 2000;
  PUNTOS_ESTADO[clave(ESTADOS_PACIENTE.NO_RESPONDE)] = 1000;
  const PUNTOS_INGRESO = {};
  PUNTOS_INGRESO[clave(TIPOS_INGRESO.VOLANTE)] = 200;
  PUNTOS_INGRESO[clave(TIPOS_INGRESO.DERIVACION_PROPIA)] = 200;
  PUNTOS_INGRESO[clave(TIPOS_INGRESO.ANTIGUO)] = 100;
  const PUNTOS_GRAVEDAD = {};
  PUNTOS_GRAVEDAD[clave(GRAVEDAD_PACIENTE.LEVE)] = 10;
  PUNTOS_GRAVEDAD[clave(GRAVEDAD_PACIENTE.MODERADO)] = 20;
  PUNTOS_GRAVEDAD[clave(GRAVEDAD_PACIENTE.URGENTE)] = 30;

  // Cálculo de scores en memoria; los guardamos ya en la propia matriz
  // `data` (columna 1) para no necesitar una escritura aparte.
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const estadoRaw = row[idxEstado];

    if (!estadoRaw || estadoRaw.toString().trim() === "") {
      row[0] = null;
      continue;
    }

    const estado = clave(estadoRaw);
    const esAlta = estado === clave(ESTADOS_PACIENTE.ALTA);
    const ingreso = clave(row[idxIngreso]);
    const gravedad = clave(row[idxGravedad]);
    const fechaUlt = parseFecha(row[idxUltimaVisita]);
    const fechaIns = parseFecha(row[idxFechaInscripcion]);

    let score = 0;

    score += PUNTOS_ESTADO[estado] || 0;
    score += PUNTOS_INGRESO[ingreso] || 0;
    score += PUNTOS_GRAVEDAD[gravedad] || 0;

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

  return { success: true, message: 'Usuarios ordenados correctamente.' };
}

/**
 * Reordena SOLO si hay un cambio real en algo que cuenta en la puntuación, para no reescribir la hoja entera al editar,
 * por ejemplo, un teléfono. `cambios` son los { id, campo, antes, despues } de historialCambiosEnFila_ (Estado, Tipo de
 * ingreso y Gravedad; se comparan sin emoji, así "🟢 Activo" → "Activo" no cuenta como cambio). `inscripcionCambio` es
 * true si cambió la Fecha de inscripción, que no está en el historial y se compara aparte.
 * Devuelve { success, ordenado, message }; nunca lanza (si falla el reordenado, el guardado que lo llamó ya está hecho).
 */
function ordenarPacientesSiProcede_(cambios, inscripcionCambio) {
  const clave = (v) => textoSinEmoji_(v).toLowerCase();
  const hay = inscripcionCambio === true || (cambios || []).some(c => c && clave(c.antes) !== clave(c.despues));
  if (!hay) return { success: true, ordenado: false, message: 'No hizo falta reordenar.' };
  try {
    const r = ordenarPacientes();
    return { success: r.success !== false, ordenado: r.success !== false, message: r.message };
  } catch (e) {
    Logger.log('ordenarPacientesSiProcede_: ' + e.message);
    return { success: false, ordenado: false, message: e.message };
  }
}