// la base de datos sin abrir la hoja de cálculo. La edición de cada usuario
// se hace desde ahí mismo, en el panel lateral (usuarios/Panel_Editar.html, por ID paciente).
// ================================================================================

/**
 * Devuelve todas las filas de la Maestra (todas las columnas, tal cual están
 * en la hoja) para renderizar la tabla completa en la Web App.
 * Cada usuario incluye `_fila`: el número de fila real en la hoja, necesario
 * como referencia de la tabla (selección, orden). Para actuar sobre un usuario el cliente envía su "ID paciente", nunca `_fila`.
 */
function obtenerBaseDatosCompletaWeb_() {
  try {
    const ss = getSS();
    const sheet = ss.getSheetByName(SHEETS.MAESTRA);
    if (!sheet) {
      return { headers: [], pacientes: [], error: `No se encontró la hoja "${SHEETS.MAESTRA}".` };
    }

    const lastRow = sheet.getLastRow();
    const lastColRaw = sheet.getLastColumn();
    const headersRaw = sheet.getRange(1, 1, 1, lastColRaw).getValues()[0];

    // La hoja suele tener columnas con formato pero sin cabecera al final
    // (celdas de formato heredado, sin dato real) — nos quedamos solo con
    // las columnas hasta la última que sí tiene nombre.
    let lastCol = 0;
    headersRaw.forEach((h, idx) => { if (h && h.toString().trim() !== '') lastCol = idx + 1; });
    const headers = headersRaw.slice(0, lastCol).map(h => h.toString().trim());

    if (lastRow < 2 || lastCol === 0) {
      return { headers: headers, pacientes: [] };
    }

    const rango = sheet.getRange(2, 1, lastRow - 1, lastCol);
    const data = rango.getValues();
    const colHC = headers.indexOf(COLUMNAS.MAESTRA.HISTORIA_CLINICA);
    // La edad no se guarda: se calcula con la fecha de nacimiento tal como está en la celda (Date), antes de que
    // se convierta a texto dd/MM/yyyy. Si la hoja aún conserva una columna "Edad", su valor viejo se ignora.
    const colNacimiento = headers.indexOf(COLUMNAS.MAESTRA.FECHA_NACIMIENTO);

    // OPTIMIZACIÓN DE RENDIMIENTO: antes se pedía getRichTextValues() de TODO
    // el rango (todas las columnas, todos los usuarios) solo para leer el
    // enlace de UNA columna (Historia Clínica) — el mismo patrón que hacía
    // lenta la Agenda al principio. Con muchas columnas de ficha por
    // usuario, eso son muchas más celdas de las que realmente hacen falta.
    // Ahora se pide solo la columna de Historia Clínica.
    let richTextHC = null;
    if (colHC !== -1) {
      richTextHC = sheet.getRange(2, colHC + 1, lastRow - 1, 1).getRichTextValues();
    }

    const pacientes = data
      .map((row, i) => {
        const paciente = { _fila: i + 2 };
        headers.forEach((h, colIdx) => {
          let value = row[colIdx];

          if (colIdx === colHC) {
            // La celda de Historia Clínica es un enlace enriquecido: el texto
            // visible es "Ver Historia Clínica", la URL real va aparte.
            const richTextCell = richTextHC ? richTextHC[i][0] : null;
            const url = richTextCell ? richTextCell.getLinkUrl() : null;
            value = url || (value ? value.toString().trim() : '');
          } else if (Object.prototype.toString.call(value) === '[object Date]') {
            value = Utilities.formatDate(value, Session.getScriptTimeZone(), "dd/MM/yyyy");
          }

          paciente[h] = value;
        });
        if (colNacimiento !== -1) paciente[COLUMNAS.MAESTRA.EDAD] = calcularEdadDesdeFecha_(row[colNacimiento]);
        return paciente;
      })
      // Ignorar filas completamente vacías (huecos en la hoja)
      .filter(p => p[COLUMNAS.MAESTRA.NOMBRE] && p[COLUMNAS.MAESTRA.NOMBRE].toString().trim() !== '');

    // "Edad" viaja siempre como una columna más, haya o no columna "Edad" en la hoja.
    if (colNacimiento !== -1 && headers.indexOf(COLUMNAS.MAESTRA.EDAD) === -1) headers.push(COLUMNAS.MAESTRA.EDAD);
    return { headers: headers, pacientes: pacientes };
  } catch (e) {
    Logger.log("Error en obtenerBaseDatosCompletaWeb: " + e.message);
    return { headers: [], pacientes: [], error: e.message };
  }
}

/**
 * Copia de filas de la Maestra antes de borrarlas, para "Registro" (decisión 2 de la sección 17.8). Tiene la misma forma
 * que la ficha del cliente (cabecera: valor, fechas dd/MM/yyyy, la URL de la Historia Clínica y `_fila`), así que
 * restaurarPacienteWeb_ puede volver a darla de alta tal cual.
 */
function copiaFilasMaestra_(sheet, filas) {
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => h.toString().trim());
  const colHC = headers.indexOf(COLUMNAS.MAESTRA.HISTORIA_CLINICA);
  const tz = Session.getScriptTimeZone();
  return filas.map(fila => {
    const rango = sheet.getRange(fila, 1, 1, lastCol);
    const valores = rango.getValues()[0];
    const enlaceHC = colHC !== -1 ? rango.getCell(1, colHC + 1).getRichTextValue() : null;
    const copia = { _fila: fila };
    headers.forEach((h, i) => {
      if (!h) return;
      let v = valores[i];
      if (i === colHC) v = (enlaceHC && enlaceHC.getLinkUrl()) || String(v || '').trim();
      else if (Object.prototype.toString.call(v) === '[object Date]') v = Utilities.formatDate(v, tz, 'dd/MM/yyyy');
      copia[h] = v;
    });
    return copia;
  });
}

/** Filas de "Registro" con la copia completa de cada usuario borrado (las anota api, acceso/Api.gs). */
function registroCopiasMaestra_(copias) {
  return copias.map(c => ({ entidad: String(c[COLUMNAS.MAESTRA.ID_PACIENTE] || ''), detalle: JSON.stringify(c) }));
}

/**
 * Borra por completo la fila de un usuario en la Maestra (borrado real de la fila, no solo de su contenido). Se localiza
 * por su ID paciente: no depende del número de fila (la hoja se reordena) ni del nombre. No toca las hojas de Agenda ni
 * Valoraciones, así que si ese usuario tenía citas o valoraciones seguirán apareciendo ahí con su nombre. Antes de
 * borrar guarda la fila completa en "Registro" para poder recuperarla.
 */
function eliminarPacienteWeb_(idPaciente) {
  try {
    const ss = getSS();
    const sheet = ss.getSheetByName(SHEETS.MAESTRA);
    if (!sheet) return { success: false, message: `No se encontró la hoja "${SHEETS.MAESTRA}".` };

    const fila = filaMaestraPorId_(sheet, idPaciente);
    if (!fila) return { success: false, message: 'Ese usuario ya no está en Usuarios. Recarga la página.' };

    const copias = copiaFilasMaestra_(sheet, [fila]);
    sheet.deleteRow(fila);
    return { success: true, message: 'Usuario eliminado correctamente.', _registro: registroCopiasMaestra_(copias) };
  } catch (e) {
    Logger.log('Error en eliminarPacienteWeb: ' + e.message);
    return { success: false, message: e.message };
  }
}

/**
 * Deshace un "Eliminar" reciente: vuelve a insertar la fila de un usuario
 * borrado, con los mismos datos que tenía. El cliente ya guardaba la ficha
 * completa en memoria (la misma que pinta en la tabla), así que aquí no hace
 * falta leer nada de la hoja primero — solo volver a escribirla.
 *
 * OJO: el enlace de Historia Clínica se restaura como texto plano (la URL),
 * no como el enlace enriquecido "Ver Historia Clínica" que tiene normalmente
 * — el dato no se pierde, pero para que vuelva a verse como un enlace bonito
 * habría que regenerarlo o pegarlo de nuevo desde Historia Clínica → Enlace HC.
 *
 * Las fechas llegan del cliente como texto "dd/MM/yyyy" (así se sirven en
 * obtenerBaseDatosCompletaWeb): aquí se convierten de nuevo a fecha real para
 * que la celda no quede como texto según la configuración regional de la hoja.
 *
 * @param {object} datosPaciente La ficha completa tal cual la tenía el
 *   cliente (incluye _fila, la fila original que ocupaba).
 */
function restaurarPacienteWeb_(datosPaciente) {
  try {
    const ss = getSS();
    const sheet = ss.getSheetByName(SHEETS.MAESTRA);
    if (!sheet) return { success: false, message: `No se encontró la hoja "${SHEETS.MAESTRA}".` };

    if (!datosPaciente || !datosPaciente[COLUMNAS.MAESTRA.NOMBRE]) {
      return { success: false, message: 'No hay datos que restaurar.' };
    }

    // Idempotente: si ese ID paciente ya está en la Maestra (p. ej. se pulsó Deshacer dos veces), no se duplica la fila.
    if (filaMaestraPorId_(sheet, datosPaciente[COLUMNAS.MAESTRA.ID_PACIENTE])) {
      return { success: true, message: 'Ese usuario ya estaba en Usuarios.' };
    }

    const lastCol = sheet.getLastColumn();
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => h.toString().trim());

    const filaOriginal = parseInt(datosPaciente._fila, 10);
    const fila = (filaOriginal && filaOriginal <= sheet.getLastRow() + 1) ? filaOriginal : (sheet.getLastRow() + 1);

    const valores = headers.map(h => {
      const v = datosPaciente[h];
      return (v === undefined || v === null) ? '' : fechaTextoADate_(v);
    });

    sheet.insertRowBefore(fila);
    sheet.getRange(fila, 1, 1, valores.length).setValues([valores]);

    // Su puntuación pudo quedar obsoleta mientras estuvo eliminado: se reordena siempre (la fila volvió a su posición antigua).
    const orden = ordenarPacientesSiProcede_([], true);
    return { success: true, ordenado: orden.ordenado === true, message: 'Usuario restaurado correctamente.' };
  } catch (e) {
    Logger.log('Error en restaurarPacienteWeb: ' + e.message);
    return { success: false, message: e.message };
  }
}

/**
 * Convierte un texto "dd/MM/yyyy" en un objeto Date (medianoche, en la zona
 * horaria del script). Cualquier otro valor —incluido un texto con formato de
 * fecha imposible como 31/02/2026— se devuelve tal cual.
 */
function fechaTextoADate_(valor) {
  if (typeof valor !== 'string') return valor;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(valor.trim());
  if (!m) return valor;
  const dia = Number(m[1]), mes = Number(m[2]), anio = Number(m[3]);
  const d = new Date(anio, mes - 1, dia);
  if (d.getFullYear() !== anio || d.getMonth() !== mes - 1 || d.getDate() !== dia) return valor;
  return d;
}

/**
 * Cambia solo el Estado de un usuario (menú de estado en línea de Usuarios).
 * "Alta" se rechaza aquí a propósito: tiene su propio flujo (darDeAltaPacienteWeb) que
 * actualiza también fechas, tipo de ingreso y la Historia Clínica.
 * El usuario se localiza por su ID paciente: no depende del número de fila (que cambia al ordenar) ni del nombre.
 */
function cambiarEstadoPacienteWeb_(idPaciente, nuevoEstado) {
  const r = cambiarEstadoPacienteSinOrden_(idPaciente, nuevoEstado);   // el bloqueo ya está liberado al volver
  if (r.success && r._cambios) {
    const orden = ordenarPacientesSiProcede_(r._cambios);
    r.ordenado = orden.ordenado === true;
  }
  delete r._cambios;
  return r;
}

/** Cuerpo de cambiarEstadoPacienteWeb: cambia el Estado dentro del bloqueo. Devuelve además `_cambios` (para decidir si reordenar). */
function cambiarEstadoPacienteSinOrden_(idPaciente, nuevoEstado) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);

    const sheet = getSS().getSheetByName(SHEETS.MAESTRA);
    if (!sheet) return { success: false, message: `No se encontró la hoja "${SHEETS.MAESTRA}".` };

    const rowIdx = filaMaestraPorId_(sheet, idPaciente);
    const estado = (nuevoEstado === null || nuevoEstado === undefined) ? '' : String(nuevoEstado).trim();
    if (!rowIdx) return { success: false, message: 'Ese usuario ya no está en Usuarios. Recarga la página.' };
    if (!estado || estado.length > 60) return { success: false, message: 'Estado no válido.' };
    if (/(^|[^a-záéíóúñ])alta([^a-záéíóúñ]|$)/i.test(estado)) {
      return { success: false, message: 'Para dar de alta usa el botón "Alta": actualiza también fechas e Historia Clínica.' };
    }

    const lastCol = sheet.getLastColumn();
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => h.toString().trim());
    let colEstado = headers.indexOf(COLUMNAS.MAESTRA.ESTADO);
    if (colEstado === -1) colEstado = COLUMNAS_NUM.MAESTRA.ESTADO - 1;

    const celdaEstado = sheet.getRange(rowIdx, colEstado + 1);
    const estadoAntes = celdaEstado.getValue();
    celdaEstado.setValue(estado);
    // Historial (CONTEXTO.md, sección 11, paso 4): todo cambio de Estado pasa por historialRegistrar_.
    historialRegistrar_([{ id: idPaciente, campo: COLUMNAS.MAESTRA.ESTADO, antes: estadoAntes, despues: estado }], 'Cambio de estado');
    SpreadsheetApp.flush();
    return { success: true, message: 'Estado actualizado.', _cambios: [{ id: idPaciente, campo: COLUMNAS.MAESTRA.ESTADO, antes: estadoAntes, despues: estado }] };
  } catch (e) {
    Logger.log('Error en cambiarEstadoPacienteWeb: ' + e.message);
    return { success: false, message: e.message };
  } finally {
    try { lock.releaseLock(); } catch (err) { /* sin bloqueo que liberar */ }
  }
}

/**
 * Cambia el Estado de varios usuarios a la vez (barra de acciones en lote de
 * Usuarios). "Alta" se rechaza aquí: el cliente ya evita
 * enviarla, pero se comprueba también en el servidor por si acaso.
 */
function cambiarEstadoLoteWeb_(idsPaciente, nuevoEstado) {
  const r = cambiarEstadoLoteSinOrden_(idsPaciente, nuevoEstado);   // el bloqueo ya está liberado al volver
  if (r.success && r._cambios) {
    const orden = ordenarPacientesSiProcede_(r._cambios);
    r.ordenado = orden.ordenado === true;
  }
  delete r._cambios;
  return r;
}

/** Cuerpo de cambiarEstadoLoteWeb: cambia el Estado dentro del bloqueo. Devuelve además `_cambios` (para decidir si reordenar). */
function cambiarEstadoLoteSinOrden_(idsPaciente, nuevoEstado) {
  const estado = (nuevoEstado === null || nuevoEstado === undefined) ? '' : String(nuevoEstado).trim();
  if (!estado || estado.length > 60) return { success: false, message: 'Estado no válido.' };
  if (/(^|[^a-záéíóúñ])alta([^a-záéíóúñ]|$)/i.test(estado)) {
    return { success: false, message: 'Para dar de alta hazlo usuario por usuario: actualiza también fechas e Historia Clínica.' };
  }
  if (!Array.isArray(idsPaciente) || idsPaciente.length === 0) return { success: false, message: 'No hay usuarios seleccionados.' };

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const sheet = getSS().getSheetByName(SHEETS.MAESTRA);
    if (!sheet) return { success: false, message: `No se encontró la hoja "${SHEETS.MAESTRA}".` };

    const lastCol = sheet.getLastColumn();
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => h.toString().trim());
    let colEstado = headers.indexOf(COLUMNAS.MAESTRA.ESTADO);
    if (colEstado === -1) colEstado = COLUMNAS_NUM.MAESTRA.ESTADO - 1;

    const mapa = mapaFilasMaestraPorId_(sheet);
    const ids = Array.from(new Set(idsPaciente.map(id => String(id || '').trim()).filter(Boolean)));
    const filasValidas = ids.map(id => mapa[id]).filter(Boolean);
    if (!filasValidas.length) return { success: false, message: 'Esos usuarios ya no están en Usuarios. Recarga la página.' };

    // Estado anterior de cada usuario (una sola lectura de la columna), para el historial.
    const estadosAntes = sheet.getRange(1, colEstado + 1, sheet.getLastRow(), 1).getValues();   // índice = nº de fila - 1
    const cambios = ids.filter(id => mapa[id]).map(id => ({ id: id, campo: COLUMNAS.MAESTRA.ESTADO, antes: estadosAntes[mapa[id] - 1][0], despues: estado }));

    const rangos = filasValidas.map(f => sheet.getRange(f, colEstado + 1).getA1Notation());
    sheet.getRangeList(rangos).setValue(estado);
    historialRegistrar_(cambios, 'Cambio de estado (lote)');

    SpreadsheetApp.flush();
    const faltan = ids.length - filasValidas.length;
    return { success: true, _cambios: cambios, message: 'Estado actualizado en ' + filasValidas.length + (filasValidas.length === 1 ? ' usuario.' : ' usuarios.') + (faltan ? ' (' + faltan + ' ya no estaba' + (faltan === 1 ? '' : 'n') + ' en Usuarios.)' : '') };
  } catch (e) {
    Logger.log('Error en cambiarEstadoLoteWeb: ' + e.message);
    return { success: false, message: e.message };
  } finally {
    try { lock.releaseLock(); } catch (err) { /* sin bloqueo que liberar */ }
  }
}

/**
 * Elimina varios usuarios de la Maestra a la vez (borrado real de fila, no solo de contenido), localizados por su ID
 * paciente. Borra de abajo hacia arriba para que borrar una fila no desplace el número de las que faltan.
 * Igual que eliminarPacienteWeb_: no toca Agenda ni Valoraciones y guarda en "Registro" una copia de cada fila.
 *
 * Todo o nada: si CUALQUIER ID ya no está en la Maestra no se borra ninguno (el cliente guarda una copia de cada ficha
 * para poder deshacer, y no debe restaurar a alguien que ya no estaba).
 */
function eliminarPacientesLoteWeb_(idsPaciente) {
  if (!Array.isArray(idsPaciente) || idsPaciente.length === 0) return { success: false, message: 'No hay usuarios seleccionados.' };

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const sheet = getSS().getSheetByName(SHEETS.MAESTRA);
    if (!sheet) return { success: false, message: `No se encontró la hoja "${SHEETS.MAESTRA}".` };

    const mapa = mapaFilasMaestraPorId_(sheet);
    // Un ID vacío (usuario sin ID paciente) no se puede localizar: se rechaza todo en vez de borrar solo a una parte.
    if (idsPaciente.some(id => !String(id || '').trim())) {
      return { success: false, message: 'Algún usuario seleccionado no tiene ID paciente. No se ha borrado nada.' };
    }
    const ids = Array.from(new Set(idsPaciente.map(id => String(id).trim())));
    const filas = ids.map(id => mapa[id]);
    if (!ids.length || filas.some(f => !f)) {
      return { success: false, message: 'La lista ha cambiado desde que se cargó. Recarga la página e inténtalo de nuevo.' };
    }

    const copias = copiaFilasMaestra_(sheet, filas);
    filas.sort((a, b) => b - a).forEach(f => sheet.deleteRow(f));

    return { success: true, message: filas.length + (filas.length === 1 ? ' usuario eliminado.' : ' usuarios eliminados.'), _registro: registroCopiasMaestra_(copias) };
  } catch (e) {
    Logger.log('Error en eliminarPacientesLoteWeb: ' + e.message);
    return { success: false, message: e.message };
  } finally {
    try { lock.releaseLock(); } catch (err) { /* sin bloqueo que liberar */ }
  }
}
