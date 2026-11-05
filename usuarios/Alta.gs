/**
 * Da de alta al usuario con ese ID paciente (botón «Dar de alta» de Usuarios, la Agenda y la historia clínica).
 */
function darDeAltaPacienteWeb_(idPaciente) {
  const ss = getSS_();
  const sheet = ss.getSheetByName(SHEETS.MAESTRA);
  if (!sheet) return { success: false, message: "No se encontró la hoja 'Base de Datos Maestra'." };
  const rowIdx = filaMaestraPorId_(sheet, idPaciente);   // por ID paciente: el número de fila cambia al reordenar
  if (!rowIdx) return { success: false, message: "Ese usuario ya no está en Usuarios. Recarga la página." };

  const resultado = ejecutarAltaEnFila_(sheet, rowIdx);
  if (resultado.success) { try { ordenarPacientes_(); } catch (eOrd) { Logger.log('darDeAltaPacienteWeb_: ordenar: ' + eOrd.message); } }
  return resultado;
}

/**
 * Lógica compartida: busca columnas por sinónimos, valida el estado actual,
 * actualiza Estado, Tipo de Ingreso y Última visita (la Fecha de inscripción
 * se conserva) y, si tiene historia clínica, cierra su ingreso abierto.
 * Devuelve { success, message }. El mensaje va en una sola línea si todo sale bien
 * (la pantalla lo enseña como aviso flotante); lo que falle en la historia va en una
 * línea aparte, y entonces sale como diálogo con el icono de aviso (CONTEXTO.md, sección 6).
 */
function ejecutarAltaEnFila_(sheet, activeRow) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  function clean(text) {
    return String(text || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .replace(/columna/g, "");
  }

  // Los sinónimos van por orden de prioridad: se busca primero el más
  // específico, y solo si no aparece se prueba el siguiente.
  const synonyms = {
    estado: ["estado", "status"],
    tipoIngreso: ["tipo de ingreso", "ingreso", "origen", "alta"],
    ultimaVisita: ["última visita", "visita"],
    historiaClinica: ["historia clínica", "historia", "enlace"],
  };

  const cleanHeaders = headers.map(clean);

  function findColumnIndex(targets) {
    for (const target of targets) {
      const idx = cleanHeaders.findIndex(h => h.includes(clean(target)));
      if (idx !== -1) return idx;
    }
    return -1;
  }

  const estadoCol = findColumnIndex(synonyms.estado);
  const tipoIngresoCol = findColumnIndex(synonyms.tipoIngreso);
  const ultimaVisitaCol = findColumnIndex(synonyms.ultimaVisita);
  const historiaClinicaCol = findColumnIndex(synonyms.historiaClinica);

  if (estadoCol === -1 || tipoIngresoCol === -1) {
    return { success: false, message: "Error: No se encontraron las columnas requeridas: 'Estado' o 'Tipo de Ingreso'. Por favor, verifica los encabezados." };
  }

  const isDocUpdatePossible = (historiaClinicaCol !== -1);

  const estadoRange = sheet.getRange(activeRow, estadoCol + 1);
  const tipoIngresoRange = sheet.getRange(activeRow, tipoIngresoCol + 1);

  const estadoActual = estadoRange.getValue();
  const tipoIngresoAntes = tipoIngresoRange.getValue();   // para el historial (CONTEXTO.md, sección 11, paso 4)
  if (textoSinEmoji_(estadoActual) === ESTADOS_PACIENTE.ALTA) {
    return { success: false, message: "El usuario ya está dado de alta." };
  }

  const ultimaVisitaRange = (ultimaVisitaCol !== -1) ? sheet.getRange(activeRow, ultimaVisitaCol + 1) : null;

  estadoRange.setValue(ESTADOS_PACIENTE.ALTA);
  tipoIngresoRange.setValue("");

  // Historial: el alta cambia el Estado y vacía el Tipo de Ingreso (los dos influyen en la prioridad).
  const idCol = cleanHeaders.findIndex(h => h === clean(COLUMNAS.MAESTRA.ID_PACIENTE));
  const idPaciente = idCol === -1 ? '' : sheet.getRange(activeRow, idCol + 1).getValue();
  historialRegistrar_([
    { id: idPaciente, campo: COLUMNAS.MAESTRA.ESTADO, antes: estadoActual, despues: ESTADOS_PACIENTE.ALTA },
    { id: idPaciente, campo: COLUMNAS.MAESTRA.TIPO_INGRESO, antes: tipoIngresoAntes, despues: '' }
  ], 'Alta');
  // La Fecha de inscripción NO se toca: se conserva al dar el alta.

  if (ultimaVisitaRange) ultimaVisitaRange.setValue(new Date());

  let finalMessage = "Alta realizada correctamente.";

  if (isDocUpdatePossible) {
    const historiaClinicaRange = sheet.getRange(activeRow, historiaClinicaCol + 1);
    let docUrl = "";

    // 1. Hipervínculo en Rich Text (el caso habitual)
    try {
      const richText = historiaClinicaRange.getRichTextValue();
      if (richText) {
        const linkUrl = richText.getLinkUrl();
        if (linkUrl) docUrl = linkUrl;
      }
    } catch (e) { /* no era rich text */ }

    // 2. Fórmula HYPERLINK / HIPERVINCULO, o URL escrita como texto
    if (!docUrl) {
      const formula = historiaClinicaRange.getFormula();
      const match = formula && formula.match(/^=\s*(?:HYPERLINK|HIPERVINCULO)\s*\(\s*"(.*?)"\s*(?:[;,)])/i);
      if (match && match[1]) {
        docUrl = match[1];
      } else {
        const value = historiaClinicaRange.getValue();
        if (typeof value === 'string' && value.startsWith('http')) docUrl = value;
      }
    }

    // Sin enlace no hay historia que cerrar: el alta basta y no se avisa de nada más.
    if (docUrl && hcEsFichaWeb_(docUrl)) {
      // HC en la ficha web → la fecha de alta va al episodio abierto de "Episodios HC".
      const hc = hcAltaEnHoja_(docUrl);
      if (hc.ok) finalMessage = "Alta realizada correctamente; ingreso cerrado en la historia clínica.";
      else finalMessage += "\n" + hc.message;
    } else if (docUrl) {
      finalMessage += "\nEl enlace de la historia clínica no es una ficha web (es un documento antiguo): no se ha anotado la fecha de alta.";
    }
  }

  return { success: true, message: finalMessage };
}