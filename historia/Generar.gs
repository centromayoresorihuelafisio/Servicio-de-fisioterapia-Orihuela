/**
 * Versión web-safe: genera la historia clínica del usuario de `fila`,
 * para usar desde el botón "Historia Clínica" de Usuarios.
 */
function generarHistoriaClinicaWeb_(idPaciente) {
  const ss = getSS_();
  const sheet = ss.getSheetByName(SHEETS.MAESTRA);
  if (!sheet) return { success: false, message: "Error: La hoja 'Base de Datos Maestra' no existe." };
  const rowIndex = filaMaestraPorId_(sheet, idPaciente);   // por ID paciente: el número de fila cambia al reordenar
  if (!rowIndex) return { success: false, message: "Ese usuario ya no está en Usuarios. Recarga la página." };

  return generarHistoriaClinicaEnFila_(sheet, rowIndex);
}

/**
 * Lógica compartida: crea la historia clínica (ficha web) del usuario de la fila indicada y
 * enlaza el resultado en la columna "Historia clínica" de esa fila.
 */
function generarHistoriaClinicaEnFila_(sheet, rowIndex) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => h.toString().trim());
  const data = sheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0];

  const patientData = {};
  headers.forEach((header, index) => { patientData[header.toLowerCase()] = data[index]; });

  const nombre = patientData[COLUMNAS.MAESTRA.NOMBRE.toLowerCase()] || '';
  if (!nombre) return { success: false, message: 'Esa fila no tiene un usuario válido.' };

  // --- VALIDACIÓN ANTI-DUPLICADOS ---
  // Si esta fila ya tiene una Historia Clínica enlazada, no generamos otra:
  // antes, cada clic en "Historia Clínica" (o un reenvío del formulario de
  // alta) creaba un documento nuevo en Drive y machacaba el enlace anterior,
  // dejando el documento viejo huérfano y sin que nadie se enterase.
  // Se comprueba con extraerUrlHistoriaClinica_() para cubrir los tres
  // formatos posibles de celda: Rich Text, fórmula =HIPERVINCULO() y texto plano.
  const colIndex = headers.findIndex(h => h.toLowerCase() === COLUMNAS.MAESTRA.HISTORIA_CLINICA.toLowerCase());
  if (colIndex !== -1) {
    const celdaHC = sheet.getRange(rowIndex, colIndex + 1);
    const urlExistente = extraerUrlHistoriaClinica_(
      data[colIndex],
      celdaHC.getRichTextValue(),
      celdaHC.getFormula()
    );
    if (urlExistente) {
      return {
        success: false,
        message: `${nombre} ya tiene una Historia Clínica enlazada.\n\nSi necesitas crear una nueva, borra antes el enlace de la columna "${COLUMNAS.MAESTRA.HISTORIA_CLINICA}".`,
        url: urlExistente
      };
    }
  }

  // La HC es la ficha web (sin Doc): se crea la fila en "Historias Clínicas" con un episodio abierto y el enlace apunta a la ficha.
  try {
    // episodio sin ingreso: lo rellena la primera cita (no se copia la inscripción); la historia guarda el ID paciente del usuario
    const nueva = hcCrearHC_(nombre, '', patientData[COLUMNAS.MAESTRA.ID_PACIENTE.toLowerCase()] || '');
    if (colIndex !== -1) {
      sheet.getRange(rowIndex, colIndex + 1).setRichTextValue(
        SpreadsheetApp.newRichTextValue().setText("Ver Historia Clínica").setLinkUrl(nueva.url).build());
    }
    return { success: true, message: `Historia clínica creada para ${nombre}.`, url: nueva.url };
  } catch (e) {
    return { success: false, message: 'No se pudo crear la historia clínica: ' + e.message };
  }
}
