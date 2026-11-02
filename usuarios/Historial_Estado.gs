/**
 * HISTORIAL DE ESTADO Y PRIORIDAD
 * Paso 4 del "Orden de trabajo" de CONTEXTO.md, sección 11 (decisión 5).
 *
 * Qué guarda: una fila por cada cambio de un campo seguido (HISTORIAL_CAMPOS en core/Config.gs):
 *   Estado, Tipo de Ingreso y Gravedad. Los dos últimos son lo que, junto con el Estado, decide la "Prioridad"
 *   (la puntuación de usuarios/Ordenar.gs). La puntuación en sí NO se guarda: cambia cada día con los días de
 *   espera y se puede recalcular.
 *   Hoja "Historial Estado" (SHEETS.HISTORIAL): ID paciente | Fecha y hora | Campo | Valor anterior | Valor nuevo | Origen.
 *
 * Regla: TODO cambio de esos campos pasa por historialRegistrar_ (no hay respaldo por onEdit). Llamado desde:
 *   cambiarEstadoPacienteWeb_ / cambiarEstadoLoteWeb_ (usuarios/BaseDatos.gs), ejecutarAltaEnFila_ (usuarios/Alta.gs),
 *   actualizarPaciente_ (usuarios/Editar_Usuario.gs), guardarPaciente_ (usuarios/Anadir_Usuario.gs) y
 *   actualizarEstadoPorIdDesdeCitasWeb_ (agenda/Web_Escritura_Citas.gs, "Dar cita" y "Asignar hueco").
 *   Cualquier función nueva que cambie esos campos de la Maestra debe llamarla igual.
 *
 * Seguridad: si el historial falla, NO se bloquea la operación (se anota en el registro de ejecuciones). Para
 * detectar huecos, `verificarHistorialEstado` comprueba que el último valor de cada usuario coincide con la Maestra.
 *
 * Desde el editor de Apps Script (sin menú), tras desplegar:
 *   1. `sembrarHistorialEstado`: UNA vez. Escribe el estado actual de cada usuario y los ingresos/altas de los
 *      episodios de las HC. Solo escribe en la hoja "Historial Estado"; no toca la Maestra. Se puede repetir
 *      (salta los usuarios ya sembrados).
 *   2. `verificarHistorialEstado`: solo lectura; úsala cuando quieras comprobar que no se ha perdido ningún cambio.
 *
 * Reutiliza SIN modificar: getSS_ (core/WebApp.gs), SHEETS, COLUMNAS, HISTORIAL_CAMPOS, ESTADOS_PACIENTE (core/Config.gs),
 * HC_WEB_, hcAISO_ y hcDeISO_ (historia/HC_Web.gs). Nombres con prefijo historial / HIST_ para no chocar en el ámbito global.
 */

const HIST_CABECERAS_ = ['ID paciente', 'Fecha y hora', 'Campo', 'Valor anterior', 'Valor nuevo', 'Origen'];
const HIST_SIEMBRA_ = 'Siembra';

function historialNorm_(s) {
  return String(s === null || s === undefined ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ').trim().toLowerCase();
}
function historialTexto_(v) { return String(v === null || v === undefined ? '' : v).trim(); }

/** Índice (0-based) de la cabecera `nombre` en `headers`, sin distinguir mayúsculas ni tildes; -1 si no está. */
function historialIndiceColumna_(headers, nombre) {
  const objetivo = historialNorm_(nombre);
  return headers.findIndex(h => historialNorm_(h) === objetivo);
}

/** Devuelve la hoja del historial; la crea (con cabeceras) si aún no existe, para que el orden de despliegue no importe. */
function historialAsegurarHoja_(ss) {
  let hoja = ss.getSheetByName(SHEETS.HISTORIAL);
  if (hoja) return hoja;
  hoja = ss.insertSheet(SHEETS.HISTORIAL, ss.getNumSheets());
  hoja.getRange(1, 1, 1, HIST_CABECERAS_.length).setValues([HIST_CABECERAS_]).setFontWeight('bold');
  hoja.setFrozenRows(1);
  [280, 150, 130, 170, 170, 230].forEach((ancho, i) => hoja.setColumnWidth(i + 1, ancho));
  return hoja;
}

/** Escribe filas al final de la hoja (texto plano salvo la fecha, para que Sheets no convierta nada). */
function historialEscribir_(hoja, filas) {
  if (!filas.length) return 0;
  const inicio = hoja.getLastRow() + 1;
  const rango = hoja.getRange(inicio, 1, filas.length, HIST_CABECERAS_.length);
  rango.setNumberFormats(filas.map(() => ['@', 'dd/MM/yyyy HH:mm:ss', '@', '@', '@', '@']));
  rango.setValues(filas);
  return filas.length;
}

/**
 * LA función central. Registra los cambios que de verdad lo sean (valor anterior distinto del nuevo).
 * @param {Array<{id:string, campo:string, antes:*, despues:*}>} cambios ID paciente, campo (nombre de COLUMNAS.MAESTRA), valores.
 * @param {string} origen Qué lo provocó: 'Cambio de estado', 'Alta', 'Editar usuario', 'Dar cita'…
 * @return {number} filas escritas (0 si no había cambios o si falló: el fallo no se propaga).
 */
function historialRegistrar_(cambios, origen) {
  try {
    const ahora = new Date();
    const filas = [];
    (cambios || []).forEach(c => {
      const id = historialTexto_(c.id);
      if (!id) { Logger.log('Historial: cambio sin ID paciente (' + c.campo + '), no registrado.'); return; }
      const antes = historialTexto_(c.antes), despues = historialTexto_(c.despues);
      if (textoSinEmoji_(antes) === textoSinEmoji_(despues)) return;   // solo cambia el emoji (celdas antiguas): no es un cambio
      filas.push([id, ahora, c.campo, antes, despues, origen || '']);
    });
    if (!filas.length) return 0;
    return historialEscribir_(historialAsegurarHoja_(getSS_()), filas);
  } catch (e) {
    Logger.log('ERROR en historialRegistrar_ (' + origen + '): ' + e.message);
    return 0;
  }
}

/**
 * Cambios de los campos seguidos entre dos versiones de una fila de la Maestra (misma cabecera para ambas).
 * Con filaAntes = null (usuario nuevo) el valor anterior es vacío.
 */
function historialCambiosEnFila_(headers, filaAntes, filaDespues) {
  const iId = historialIndiceColumna_(headers, COLUMNAS.MAESTRA.ID_PACIENTE);
  if (iId === -1) return [];
  const id = historialTexto_(filaDespues[iId]) || historialTexto_(filaAntes ? filaAntes[iId] : '');
  const cambios = [];
  HISTORIAL_CAMPOS.forEach(campo => {
    const i = historialIndiceColumna_(headers, campo);
    if (i === -1) return;
    cambios.push({ id: id, campo: campo, antes: filaAntes ? filaAntes[i] : '', despues: filaDespues[i] });
  });
  return cambios;
}

// ----------------------------------------------------------------------------- siembra inicial

/**
 * Siembra inicial (UNA vez): estado actual de cada usuario con ID + ingresos y altas de los episodios de las HC.
 * Los ingresos son aproximados: el Estado pasó a Activo al dar la cita, que es anterior a la fecha de ingreso
 * (la primera cita). Las altas sí son exactas. Todas las filas llevan Origen "Siembra: …".
 * Idempotente por usuario: salta los que ya tienen alguna fila "Siembra". Solo escribe "Historial Estado".
 */
function sembrarHistorialEstado() {
  soloPropietario_('sembrarHistorialEstado');
  const ss = getSS_();
  const maestra = ss.getSheetByName(SHEETS.MAESTRA);
  if (!maestra) throw new Error('No se encontró la hoja "' + SHEETS.MAESTRA + '".');
  const datos = maestra.getDataRange().getValues();
  const headers = datos[0].map(h => String(h).trim());
  const iId = historialIndiceColumna_(headers, COLUMNAS.MAESTRA.ID_PACIENTE);
  if (iId === -1) throw new Error('La Maestra no tiene la columna "ID paciente": ejecuta antes asignarIdsPaciente.');
  const columnas = HISTORIAL_CAMPOS.map(c => ({ campo: c, i: historialIndiceColumna_(headers, c) })).filter(c => c.i !== -1);

  const hoja = historialAsegurarHoja_(ss);
  const sembrados = Object.create(null);
  const ult = hoja.getLastRow();
  if (ult >= 2) {
    hoja.getRange(2, 1, ult - 1, HIST_CABECERAS_.length).getValues().forEach(r => {
      if (historialTexto_(r[5]).indexOf(HIST_SIEMBRA_) === 0) sembrados[historialTexto_(r[0])] = true;
    });
  }

  const ahora = new Date();
  const idsMaestra = Object.create(null);
  const filasActual = [];
  let usuariosSembrados = 0, usuariosYaSembrados = 0;
  for (let r = 1; r < datos.length; r++) {
    const id = historialTexto_(datos[r][iId]);
    if (!id) continue;
    idsMaestra[id] = true;
    if (sembrados[id]) { usuariosYaSembrados++; continue; }
    usuariosSembrados++;
    columnas.forEach(c => {
      const v = historialTexto_(datos[r][c.i]);
      if (v) filasActual.push([id, ahora, c.campo, '', v, HIST_SIEMBRA_ + ': valor actual']);
    });
  }

  // Episodios de las HC: ID HC → ID paciente (col. 8 de "Historias Clínicas"), fechas de "Episodios HC".
  const filasEpisodios = [];
  let episodiosSinUsuario = 0;
  const hojaHC = ss.getSheetByName(HC_WEB_.HOJA_HC), hojaEpi = ss.getSheetByName(HC_WEB_.HOJA_EPI);
  if (hojaHC && hojaEpi && hojaHC.getLastRow() >= 2 && hojaEpi.getLastRow() >= 2) {
    const tz = Session.getScriptTimeZone();
    const idHCaPaciente = Object.create(null);
    hojaHC.getRange(2, 1, hojaHC.getLastRow() - 1, HC_WEB_.COL.ID_PACIENTE).getValues().forEach(r => {
      const idHC = historialTexto_(r[0]);
      if (idHC) idHCaPaciente[idHC] = historialTexto_(r[HC_WEB_.COL.ID_PACIENTE - 1]);
    });
    hojaEpi.getRange(2, 1, hojaEpi.getLastRow() - 1, 3).getValues().forEach(r => {
      const ingreso = hcDeISO_(hcAISO_(r[1], tz)), alta = hcDeISO_(hcAISO_(r[2], tz));
      if (!ingreso && !alta) return;
      const idPac = idHCaPaciente[historialTexto_(r[0])];
      if (!idPac || !idsMaestra[idPac]) { episodiosSinUsuario++; return; }
      if (sembrados[idPac]) return;
      if (ingreso) filasEpisodios.push([idPac, ingreso, COLUMNAS.MAESTRA.ESTADO, '', ESTADOS_PACIENTE.ACTIVO, HIST_SIEMBRA_ + ': ingreso del episodio (HC, aproximado)']);
      if (alta) filasEpisodios.push([idPac, alta, COLUMNAS.MAESTRA.ESTADO, '', ESTADOS_PACIENTE.ALTA, HIST_SIEMBRA_ + ': alta del episodio (HC)']);
    });
  }

  const filas = filasEpisodios.concat(filasActual).sort((a, b) => a[1] - b[1]);
  const escritas = historialEscribir_(hoja, filas);

  // Verificación: se vuelve a leer lo escrito y se compara.
  let ok = true;
  if (escritas) {
    const leidas = hoja.getRange(hoja.getLastRow() - escritas + 1, 1, escritas, HIST_CABECERAS_.length).getValues();
    ok = leidas.every((r, i) => [0, 2, 3, 4, 5].every(k => historialTexto_(r[k]) === historialTexto_(filas[i][k])) && +r[1] === +filas[i][1]);
  }
  const resumen = {
    usuariosSembrados, usuariosYaSembrados, filasEstadoActual: filasActual.length, filasEpisodios: filasEpisodios.length,
    episodiosSinUsuario, escritas, verificacion: ok ? 'OK' : 'FALLO: revisa la hoja "' + SHEETS.HISTORIAL + '"'
  };
  Logger.log('Siembra del historial: ' + JSON.stringify(resumen));
  ss.toast('Siembra del historial: ' + escritas + ' filas (' + resumen.verificacion + ')', 'Historial', 8);
  return resumen;
}

// ----------------------------------------------------------------------------- verificación (solo lectura)

/**
 * Comprueba que, para cada usuario y campo seguido, el ÚLTIMO "Valor nuevo" del historial coincide con la Maestra.
 * Si no coincide, algún cambio no se registró (o se hizo a mano en la hoja). No escribe nada: informa en el
 * registro de ejecuciones y en un aviso.
 */
function verificarHistorialEstado() {
  soloPropietario_('verificarHistorialEstado');
  const ss = getSS_();
  const maestra = ss.getSheetByName(SHEETS.MAESTRA), hoja = ss.getSheetByName(SHEETS.HISTORIAL);
  if (!maestra) throw new Error('No se encontró la hoja "' + SHEETS.MAESTRA + '".');
  if (!hoja || hoja.getLastRow() < 2) { Logger.log('El historial está vacío: ejecuta sembrarHistorialEstado.'); return { vacio: true }; }

  const datos = maestra.getDataRange().getValues();
  const headers = datos[0].map(h => String(h).trim());
  const iId = historialIndiceColumna_(headers, COLUMNAS.MAESTRA.ID_PACIENTE), iNombre = historialIndiceColumna_(headers, COLUMNAS.MAESTRA.NOMBRE);
  if (iId === -1) throw new Error('La Maestra no tiene la columna "ID paciente".');
  const columnas = HISTORIAL_CAMPOS.map(c => ({ campo: c, i: historialIndiceColumna_(headers, c) })).filter(c => c.i !== -1);

  // Último valor por ID|campo (el de fecha más reciente; a igual fecha, el de la fila posterior).
  const ultimo = Object.create(null), idsConHistorial = Object.create(null);
  hoja.getRange(2, 1, hoja.getLastRow() - 1, HIST_CABECERAS_.length).getValues().forEach((r, n) => {
    const id = historialTexto_(r[0]);
    if (!id) return;
    idsConHistorial[id] = true;
    const clave = id + '|' + historialTexto_(r[2]), ms = r[1] instanceof Date ? r[1].getTime() : 0;
    const u = ultimo[clave];
    if (!u || ms > u.ms || (ms === u.ms && n > u.n)) ultimo[clave] = { ms: ms, n: n, valor: historialTexto_(r[4]) };
  });

  const problemas = [];
  const idsMaestra = Object.create(null);
  let usuarios = 0;
  for (let r = 1; r < datos.length; r++) {
    const id = historialTexto_(datos[r][iId]);
    if (!id) continue;
    idsMaestra[id] = true;
    usuarios++;
    columnas.forEach(c => {
      const actual = historialTexto_(datos[r][c.i]), u = ultimo[id + '|' + c.campo];
      if (!u && actual) problemas.push(historialTexto_(datos[r][iNombre]) + ' · ' + c.campo + ': sin historial (hoja: "' + actual + '")');
      else if (u && textoSinEmoji_(u.valor) !== textoSinEmoji_(actual)) problemas.push(historialTexto_(datos[r][iNombre]) + ' · ' + c.campo + ': historial "' + u.valor + '" ≠ hoja "' + actual + '"');
    });
  }
  const idsHuerfanos = Object.keys(idsConHistorial).filter(id => !idsMaestra[id]).length;
  const resumen = { usuarios: usuarios, problemas: problemas.length, idsDeUsuariosYaNoExistentes: idsHuerfanos };
  Logger.log('Verificación del historial: ' + JSON.stringify(resumen));
  problemas.slice(0, 50).forEach(p => Logger.log(' - ' + p));
  ss.toast(problemas.length ? problemas.length + ' diferencias (mira el registro de ejecuciones)' : 'Todo coincide con la Maestra', 'Historial', 8);
  return resumen;
}
