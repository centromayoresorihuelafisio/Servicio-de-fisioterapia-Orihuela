/**
 * Se activa automáticamente al editar cualquier celda de la hoja de cálculo.
 */
function onEdit(e) {
  if (!e) return; // Evita errores al ejecutar manualmente

  try {
    onEditPrincipal_(e);
  } finally {
    // Una edición manual en una hoja Agenda no pasa por las funciones de
    // agenda/Web.gs, así que hay que invalidar aquí la caché de la Agenda Web
    // (si no, la web sirve la semana cacheada hasta 90 s). Se hace al FINAL y
    // en un finally para que también cuente lo que escribe onEditPrincipal_
    // (teléfono, Historia Clínica) y para que ningún return anticipado se lo salte.
    try {
      var hojaEditada = e.range.getSheet();
      if (hojaEditada.getName().startsWith('Agenda')) invalidarCacheAgenda_(hojaEditada);
    } catch (err) { /* la caché es opcional: nunca debe romper la edición */ }
  }
}

function onEditPrincipal_(e) {
  if (!e) return;

  var hoja = e.range.getSheet();
  var fila = e.range.getRow();
  var col = e.range.getColumn();
  var sheetName = hoja.getName();
  
  // Guardamos el valor editado una sola vez
  const usuarioBuscado = e.range.getValue() ? e.range.getValue().toString().trim() : "";

  // ==========================
  // 1️⃣ Calcular edad según fecha de nacimiento
  // ==========================
  if (fila > 1) { 
    var encabezados = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
    var colNacimiento = encabezados.indexOf(COLUMNAS.MAESTRA.FECHA_NACIMIENTO) + 1;
    var colEdad = encabezados.indexOf(COLUMNAS.MAESTRA.EDAD) + 1;

    if (colNacimiento !== 0 && colEdad !== 0 && col === colNacimiento) {
      var celdaEdad = hoja.getRange(fila, colEdad);
      var edadCalculada = calcularEdadDesdeFecha_(e.range.getValue());

      if (edadCalculada === "") {
        celdaEdad.clearContent();
      } else {
        celdaEdad.setValue(edadCalculada);
      }
    }
  }

  // ============================================================
  // 2️⃣ Buscar Teléfono e Historia Clínica para la hoja de Agenda
  // ============================================================
  if (sheetName.startsWith('Agenda') && col === COLUMNAS_NUM.AGENDA.USUARIO && fila > 1) {
    // Identificamos las columnas de destino en Agenda
    const encabezadosAgenda = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
    const colHCAgenda = encabezadosAgenda.indexOf(COLUMNAS.AGENDA.HISTORIA_CLINICA) + 1;
    const colTelfAgenda = COLUMNAS_NUM.AGENDA.TELEFONO;

    const celdaTelefono = hoja.getRange(fila, colTelfAgenda);
    const celdaHC = colHCAgenda > 0 ? hoja.getRange(fila, colHCAgenda) : null;
    
    // Si el usuario borra el nombre, limpiamos datos relacionados
    if (!usuarioBuscado) {
      celdaTelefono.clearContent();
      if (celdaHC) celdaHC.clearContent();
      return;
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetBD = ss.getSheetByName(SHEETS.MAESTRA);
    if (!sheetBD) return;

    const lastRowBD = sheetBD.getLastRow();
    if (lastRowBD < 2) return;

    // --- BÚSQUEDA DINÁMICA EN MAESTRA ---
    // Obtenemos encabezados de Maestra para saber dónde está cada cosa
    // La columna de teléfono se resuelve con resolverColumnaTelefono_ (core/Utils.gs),
    // que cubre las cabeceras conocidas y cae al criterio difuso "tel"/"mov".
    const headersBD = sheetBD.getRange(1, 1, 1, sheetBD.getLastColumn()).getValues()[0];
    const idxNombreBD = headersBD.indexOf(COLUMNAS.MAESTRA.NOMBRE);
    const idxTelfBD = resolverColumnaTelefono_(sheetBD, headersBD);
    const idxHCBD = headersBD.indexOf(COLUMNAS.MAESTRA.HISTORIA_CLINICA);

    // Leemos los valores y los RichText (para los enlaces)
    const dataBD = sheetBD.getRange(2, 1, lastRowBD - 1, headersBD.length).getValues();
    const richTextsBD = sheetBD.getRange(2, 1, lastRowBD - 1, headersBD.length).getRichTextValues();

    let telefonoEncontrado = '';
    let urlHCEncontrada = '';

    for (let i = 0; i < dataBD.length; i++) {
      const nombreBD = dataBD[i][idxNombreBD] ? dataBD[i][idxNombreBD].toString().trim() : "";
      
      if (nombreBD.toLowerCase() === usuarioBuscado.toLowerCase()) {
        // 1. Obtener Teléfono desde la columna resuelta dinámicamente
        const colTelfFinal = idxTelfBD !== -1 ? idxTelfBD : COLUMNAS_NUM.MAESTRA.TELEFONO - 1;
        telefonoEncontrado = dataBD[i][colTelfFinal];

        // 2. Obtener URL de Historia Clínica
        if (idxHCBD !== -1) {
          const richTextCell = richTextsBD[i][idxHCBD];
          urlHCEncontrada = richTextCell.getLinkUrl();
          if (!urlHCEncontrada) {
            const valSimple = dataBD[i][idxHCBD].toString();
            if (valSimple.startsWith("http")) urlHCEncontrada = valSimple;
          }
        }
        break;
      }
    }

    // --- APLICAR RESULTADOS ---
    // Teléfono
    if (telefonoEncontrado) {
      celdaTelefono.setValue(telefonoEncontrado);
    } else {
      celdaTelefono.clearContent();
    }

    // Historia Clínica (RichText)
    if (celdaHC) {
      if (urlHCEncontrada) {
        const link = SpreadsheetApp.newRichTextValue()
          .setText("Ver Historia Clínica")
          .setLinkUrl(urlHCEncontrada)
          .build();
        celdaHC.setRichTextValue(link);
      } else {
        celdaHC.clearContent();
      }
    }
    
    // Feedback visual opcional
    ss.toast("Datos de " + usuarioBuscado + " actualizados.", "Agenda Master", 2);
  }
}

/** * Tus funciones originales se mantienen debajo para uso manual si se desea.
 * insertarEnlaceHistoriaClinica()... 
 * cargarMapaHistoriasClinicas()...
 */