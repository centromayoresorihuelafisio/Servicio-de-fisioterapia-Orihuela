/**
 * ID DE PACIENTE EN LA HOJA "HISTORIAS CLÍNICAS"
 * Paso 3b del "Orden de trabajo" de CONTEXTO.md, sección 11 (sigue al paso 3, que puso el ID en la Maestra).
 *
 * Qué hace: añade a "Historias Clínicas" la columna "ID paciente" (columna 8, HC_WEB_.COL.ID_PACIENTE, detrás de
 * "Doc original") y la rellena con el ID del usuario al que pertenece cada historia. Así la historia sabe de quién es
 * sin depender del "Nombre (referencia)", que puede quedarse viejo si se edita el nombre del usuario.
 *
 * De dónde sale el dato (sin adivinar): la Maestra enlaza cada usuario con su historia (?page=hc&id=ID_HC). Cada
 * historia que aparece enlazada desde UN solo usuario recibe el ID paciente de ese usuario. Lo demás NO se toca y se
 * lista en el informe: historias que nadie enlaza, historias enlazadas desde varios usuarios, historias que ya tienen
 * un ID distinto, ID HC repetidos en la hoja, enlaces de la Maestra a una historia que no existe y usuarios cuyo enlace
 * no es una ficha web.
 *
 * Seguridad:
 *   - Solo escribe en la columna 8 de "Historias Clínicas" (cabecera incluida) y en la hoja de informe
 *     "ID paciente en HC". No toca la Maestra, "Episodios HC", ni ninguna otra columna.
 *   - NUNCA cambia un ID paciente que ya esté escrito en una historia (si difiere del esperado, lo lista como conflicto).
 *   - Se puede ejecutar de nuevo sin riesgo: solo rellena huecos y vuelve a generar el informe.
 *   - Comprueba que las filas de la hoja no se han movido antes de escribir y verifica lo escrito al terminar.
 *
 * Cómo usarlo (desde el editor de Apps Script, sin menú):
 *   1. (Opcional) `revisarIdPacienteEnHC`: solo mira y escribe el informe, no asigna nada.
 *   2. `asignarIdPacienteEnHC`: rellena la columna y escribe el informe con los casos que no ha podido resolver.
 *   Requisito: la Maestra ya tiene la columna "ID paciente" rellena (paso 3, `asignarIdsPaciente`).
 *
 * Reutiliza SIN modificar: HC_WEB_, hcIdDeUrl_ y hcNorm_ (historia/HC_Web.gs), extraerUrlHistoriaClinica_ (core/Utils.gs),
 * getSS_ (core/WebApp.gs), SHEETS y COLUMNAS (core/Config.gs).
 *
 * Archivo nuevo en herramientas/. Todos los nombres llevan el prefijo idpHC_ / IDP_HC_ para no chocar con el ámbito
 * global compartido del proyecto. Se puede borrar cuando ya no haga falta (la hoja de informe también).
 */

const IDP_HC_ = {
  HOJA: 'ID paciente en HC',
  MAX_LISTA: 200,   // tope de filas por lista del informe (el recuento es siempre completo)
  ANCHO: 6
};

// ----------------------------------------------------------------------------- puntos de entrada

/** SOLO LECTURA: calcula qué se asignaría y escribe el informe. No cambia "Historias Clínicas". */
function revisarIdPacienteEnHC() { soloPropietario_('revisarIdPacienteEnHC'); idpHC_ejecutar_(false); }

/** Rellena la columna "ID paciente" de "Historias Clínicas" y escribe el informe. */
function asignarIdPacienteEnHC() { soloPropietario_('asignarIdPacienteEnHC'); idpHC_ejecutar_(true); }

function idpHC_ejecutar_(escribir) {
  const t0 = Date.now();
  const ss = getSS_();
  let an, res = null;

  if (escribir) {
    const lock = LockService.getScriptLock(); // el mismo que usa hcCrearHC_: nadie añade historias mientras se rellena
    if (!lock.tryLock(30000)) throw new Error('Otra operación está escribiendo en la hoja. Espera unos segundos y vuelve a ejecutar.');
    try {
      an = idpHC_analizar_(ss);
      res = idpHC_escribir_(ss, an);
    } finally {
      lock.releaseLock();
    }
  } else {
    an = idpHC_analizar_(ss);
  }

  const segundos = Math.round((Date.now() - t0) / 100) / 10;
  idpHC_escribirInforme_(ss, an, res, escribir, segundos);

  const pendientes = an.sinEnlace.length + an.multiples.length + an.conflictos.length + an.repetidos.length;
  const texto = escribir
    ? 'ID paciente en HC: ' + res.asignadas + ' asignados; ' + pendientes + ' casos sin resolver. Verificación: ' + res.verificacion + '.'
    : 'Revisión: se asignarían ' + an.aAsignar.length + '; ' + pendientes + ' casos sin resolver. No se ha cambiado nada.';
  Logger.log(texto + ' (' + segundos + ' s)');
  try { ss.toast(texto + ' Detalle en la hoja "' + IDP_HC_.HOJA + '".', 'ID paciente en HC', 10); } catch (e) { /* sin interfaz */ }
}

// ----------------------------------------------------------------------------- análisis (solo lectura)

/**
 * Lee la Maestra y "Historias Clínicas" una sola vez y clasifica cada historia. No escribe nada.
 * Devuelve las listas del informe y el plan de escritura (aAsignar, nuevo[]).
 */
function idpHC_analizar_(ss) {
  const maestra = ss.getSheetByName(SHEETS.MAESTRA);
  const hc = ss.getSheetByName(HC_WEB_.HOJA_HC);
  if (!maestra) throw new Error('No se encontró la hoja "' + SHEETS.MAESTRA + '".');
  if (!hc) throw new Error('No se encontró la hoja "' + HC_WEB_.HOJA_HC + '".');

  // --- Maestra: usuarios, su ID paciente y la historia que enlazan
  const ultM = maestra.getLastRow(), ncM = maestra.getLastColumn();
  if (ultM < 2) throw new Error('La Maestra no tiene usuarios.');
  const valoresM = maestra.getRange(1, 1, ultM, ncM).getValues();
  const cab = valoresM[0].map(function (h) { return String(h).trim().toLowerCase(); });
  const idx = function (n) { return cab.indexOf(String(n).trim().toLowerCase()); };
  const cNombre = idx(COLUMNAS.MAESTRA.NOMBRE), cId = idx(COLUMNAS.MAESTRA.ID_PACIENTE), cHC = idx(COLUMNAS.MAESTRA.HISTORIA_CLINICA);
  if (cNombre === -1) throw new Error('La Maestra no tiene la columna "' + COLUMNAS.MAESTRA.NOMBRE + '".');
  if (cId === -1) throw new Error('La Maestra aún no tiene la columna "' + COLUMNAS.MAESTRA.ID_PACIENTE + '": ejecuta antes asignarIdsPaciente.');
  if (cHC === -1) throw new Error('La Maestra no tiene la columna "' + COLUMNAS.MAESTRA.HISTORIA_CLINICA + '".');

  const rangoHC = maestra.getRange(2, cHC + 1, ultM - 1, 1);
  const ricos = rangoHC.getRichTextValues(), formulas = rangoHC.getFormulas();

  const porHC = {};          // ID HC -> usuarios que lo enlazan
  const porNombre = {};      // nombre normalizado -> usuarios
  const sinIdPaciente = [], enlacesNoWeb = [];
  let usuarios = 0;
  for (let i = 1; i < valoresM.length; i++) {
    const nombre = String(valoresM[i][cNombre] || '').trim();
    if (!nombre) continue;
    usuarios++;
    const u = { fila: i + 1, nombre: nombre, idPaciente: String(valoresM[i][cId] || '').trim(), enlazaHC: false };
    if (!u.idPaciente) sinIdPaciente.push(u);
    (porNombre[hcNorm_(nombre)] = porNombre[hcNorm_(nombre)] || []).push(u);
    const url = extraerUrlHistoriaClinica_(valoresM[i][cHC], ricos[i - 1][0], formulas[i - 1][0]);
    const idHC = hcIdDeUrl_(url);
    if (idHC) { u.enlazaHC = true; (porHC[idHC] = porHC[idHC] || []).push(u); }
    else if (url) enlacesNoWeb.push({ fila: u.fila, nombre: nombre, url: url });
  }

  // --- Historias Clínicas
  const colId = HC_WEB_.COL.ID_PACIENTE;
  const tieneCol = hc.getMaxColumns() >= colId;
  const cabH = tieneCol ? String(hc.getRange(1, colId).getValue()).trim() : '';
  if (cabH && cabH.toLowerCase() !== COLUMNAS.MAESTRA.ID_PACIENTE.toLowerCase()) {
    throw new Error('La columna ' + colId + ' de "' + HC_WEB_.HOJA_HC + '" tiene la cabecera "' + cabH + '"; no se escribe encima.');
  }
  const nF = Math.max(hc.getLastRow() - 1, 0);
  const leidas = nF ? hc.getRange(2, 1, nF, tieneCol ? colId : colId - 1).getValues() : [];
  const ids = leidas.map(function (r) { return String(r[0] || '').trim(); });
  const actual = leidas.map(function (r) { return tieneCol ? String(r[colId - 1] || '').trim() : ''; });
  const nombres = leidas.map(function (r) { return String(r[HC_WEB_.COL.NOMBRE - 1] || '').trim(); });

  const veces = {};
  ids.forEach(function (id) { if (id) veces[id] = (veces[id] || 0) + 1; });

  const an = {
    usuarios: usuarios, sinIdPaciente: sinIdPaciente, enlacesNoWeb: enlacesNoWeb,
    nF: nF, ids: ids, actual: actual, cabH: cabH, colId: colId,
    totalHC: 0, yaCorrectas: 0, aAsignar: [], nuevo: {},
    sinEnlace: [], multiples: [], conflictos: [], repetidos: [], enlacesRotos: []
  };
  const txtU = function (u) { return 'fila ' + u.fila + ': ' + u.nombre; };

  for (let i = 0; i < nF; i++) {
    const id = ids[i];
    if (!id) continue;
    an.totalHC++;
    const fila = i + 2;
    if (veces[id] > 1) { an.repetidos.push({ fila: fila, id: id, nombre: nombres[i] }); continue; }
    const us = porHC[id] || [];

    if (us.length === 0) {
      const cands = (porNombre[hcNorm_(nombres[i])] || []).map(function (u) {
        return txtU(u) + (u.enlazaHC ? ' (ya enlaza otra historia)' : ' (sin historia enlazada)');
      });
      an.sinEnlace.push({ fila: fila, id: id, nombre: nombres[i], actual: actual[i], candidatos: cands.join(' | ') });
    } else if (us.length > 1) {
      an.multiples.push({ fila: fila, id: id, nombre: nombres[i], usuarios: us.map(txtU).join(' | ') });
    } else if (!us[0].idPaciente) {
      // el usuario enlazado no tiene ID paciente (no debería pasar tras el paso 3): se lista en sinIdPaciente
    } else if (!actual[i]) {
      an.aAsignar.push(i);
      an.nuevo[i] = us[0].idPaciente;
    } else if (actual[i] === us[0].idPaciente) {
      an.yaCorrectas++;
    } else {
      an.conflictos.push({ fila: fila, id: id, nombre: nombres[i], enHC: actual[i], esperado: us[0].idPaciente + ' (' + txtU(us[0]) + ')' });
    }
  }

  const existentes = {};
  ids.forEach(function (id) { if (id) existentes[id] = true; });
  Object.keys(porHC).forEach(function (idHC) {
    if (!existentes[idHC]) porHC[idHC].forEach(function (u) { an.enlacesRotos.push({ fila: u.fila, nombre: u.nombre, id: idHC }); });
  });
  return an;
}

// ----------------------------------------------------------------------------- escritura

/** Escribe SOLO la columna "ID paciente" de "Historias Clínicas" (se llama con el bloqueo ya tomado). */
function idpHC_escribir_(ss, an) {
  if (!an.aAsignar.length) return { asignadas: 0, verificacion: 'OK (no había nada que asignar)' };
  const hc = ss.getSheetByName(HC_WEB_.HOJA_HC);
  const colId = an.colId, nF = an.nF;

  if (hc.getMaxColumns() < colId) hc.insertColumnsAfter(hc.getMaxColumns(), colId - hc.getMaxColumns());
  if (!an.cabH) {
    hc.getRange(1, colId).setValue(COLUMNAS.MAESTRA.ID_PACIENTE);
    try { hc.getRange(1, colId - 1).copyTo(hc.getRange(1, colId), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false); } catch (e) { /* solo estética */ }
  }

  // Justo antes de escribir: si las filas ya no son las que se leyeron, no se escribe nada.
  const idsAhora = hc.getRange(2, 1, nF, 1).getValues().map(function (r) { return String(r[0] || '').trim(); });
  for (let i = 0; i < nF; i++) {
    if (idsAhora[i] !== an.ids[i]) throw new Error('La hoja "' + HC_WEB_.HOJA_HC + '" ha cambiado mientras se preparaba (fila ' + (i + 2) + '). No se ha escrito nada; vuelve a ejecutar.');
  }

  const salida = an.actual.map(function (a, i) { return [an.nuevo[i] !== undefined ? an.nuevo[i] : a]; });
  hc.getRange(2, colId, nF, 1).setNumberFormat('@').setValues(salida); // SOLO la columna del ID paciente
  SpreadsheetApp.flush();

  // Verificación: mismas historias en las mismas filas y el ID escrito es el previsto.
  const idsDesp = hc.getRange(2, 1, nF, 1).getValues().map(function (r) { return String(r[0] || '').trim(); });
  const colDesp = hc.getRange(2, colId, nF, 1).getValues().map(function (r) { return String(r[0] || '').trim(); });
  const fallos = [];
  for (let i = 0; i < nF; i++) {
    if (idsDesp[i] !== an.ids[i]) fallos.push('fila ' + (i + 2) + ': el ID HC cambió durante la escritura');
    if (colDesp[i] !== salida[i][0]) fallos.push('fila ' + (i + 2) + ': el ID paciente leído no coincide con el escrito');
  }
  return {
    asignadas: an.aAsignar.length,
    verificacion: fallos.length ? 'REVISAR: ' + fallos.slice(0, 5).join('; ') + (fallos.length > 5 ? ' (y ' + (fallos.length - 5) + ' más)' : '') : 'OK'
  };
}

// ----------------------------------------------------------------------------- informe

/** Reescribe la hoja "ID paciente en HC": resumen arriba y, debajo, una lista por cada tipo de caso que no se ha podido resolver. */
function idpHC_escribirInforme_(ss, an, res, escribio, segundos) {
  const A = IDP_HC_.ANCHO;
  const filas = [], negritas = [];
  const pad = function (f) { const r = f.slice(); while (r.length < A) r.push(''); return r.slice(0, A); };
  const add = function (f, negrita) { filas.push(pad(f)); if (negrita) negritas.push(filas.length); };

  add(['ID DE PACIENTE EN "' + HC_WEB_.HOJA_HC.toUpperCase() + '" (paso 3b)'], true);
  add(['Ejecutado', Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss')]);
  add(['Acción', escribio ? 'Asignación' : 'Revisión (no se ha cambiado nada)']);
  add(['Usuarios con nombre en la Maestra', an.usuarios]);
  add(['Historias en la hoja', an.totalHC]);
  add(['Ya tenían el ID paciente correcto', an.yaCorrectas]);
  add([escribio ? 'ID paciente asignados ahora' : 'ID paciente que se asignarían', escribio ? res.asignadas : an.aAsignar.length]);
  if (escribio) add(['Verificación tras escribir', res.verificacion]);
  add(['Historias que nadie enlaza desde la Maestra', an.sinEnlace.length]);
  add(['Historias enlazadas desde varios usuarios', an.multiples.length]);
  add(['Historias con un ID paciente distinto del esperado', an.conflictos.length]);
  add(['ID HC repetidos en la hoja (no se tocan)', an.repetidos.length]);
  add(['Enlaces de la Maestra a una historia que no existe', an.enlacesRotos.length]);
  add(['Usuarios cuyo enlace no es una ficha web', an.enlacesNoWeb.length]);
  add(['Usuarios sin ID paciente en la Maestra', an.sinIdPaciente.length]);
  if (escribio) add(['Duración', segundos + ' s']);

  const lista = function (titulo, cabecera, items, aFila) {
    if (!items.length) return;
    add([]);
    const n = Math.min(items.length, IDP_HC_.MAX_LISTA);
    add([titulo + ' (' + items.length + ')' + (items.length > n ? ' — se muestran las ' + n + ' primeras' : '')], true);
    add(cabecera, true);
    items.slice(0, n).forEach(function (it) { add(aFila(it)); });
  };
  lista('HISTORIAS QUE NINGÚN USUARIO ENLAZA (no se les ha puesto ID; "Candidatos" = usuarios con ese mismo nombre)',
    ['Fila HC', 'ID HC', 'Nombre (referencia)', 'ID paciente ya escrito', 'Candidatos por nombre'], an.sinEnlace,
    function (x) { return [x.fila, x.id, x.nombre, x.actual, x.candidatos]; });
  lista('HISTORIAS ENLAZADAS DESDE VARIOS USUARIOS (no se les ha puesto ID)',
    ['Fila HC', 'ID HC', 'Nombre (referencia)', 'Usuarios que la enlazan'], an.multiples,
    function (x) { return [x.fila, x.id, x.nombre, x.usuarios]; });
  lista('HISTORIAS CON UN ID PACIENTE DISTINTO DEL ESPERADO (no se han cambiado)',
    ['Fila HC', 'ID HC', 'Nombre (referencia)', 'ID escrito en la historia', 'ID esperado (usuario que la enlaza)'], an.conflictos,
    function (x) { return [x.fila, x.id, x.nombre, x.enHC, x.esperado]; });
  lista('ID HC REPETIDOS EN LA HOJA (no se tocan)',
    ['Fila HC', 'ID HC', 'Nombre (referencia)'], an.repetidos,
    function (x) { return [x.fila, x.id, x.nombre]; });
  lista('ENLACES DE LA MAESTRA A UNA HISTORIA QUE NO EXISTE',
    ['Fila Maestra', 'Nombre', 'ID HC del enlace'], an.enlacesRotos,
    function (x) { return [x.fila, x.nombre, x.id]; });
  lista('USUARIOS CUYO ENLACE NO ES UNA FICHA WEB',
    ['Fila Maestra', 'Nombre', 'Enlace'], an.enlacesNoWeb,
    function (x) { return [x.fila, x.nombre, x.url]; });
  lista('USUARIOS SIN ID PACIENTE EN LA MAESTRA',
    ['Fila Maestra', 'Nombre'], an.sinIdPaciente,
    function (x) { return [x.fila, x.nombre]; });

  let hoja = ss.getSheetByName(IDP_HC_.HOJA);
  if (hoja) hoja.clear(); else hoja = ss.insertSheet(IDP_HC_.HOJA);
  if (hoja.getMaxRows() < filas.length) hoja.insertRowsAfter(hoja.getMaxRows(), filas.length - hoja.getMaxRows());
  if (hoja.getMaxColumns() < A) hoja.insertColumnsAfter(hoja.getMaxColumns(), A - hoja.getMaxColumns());
  const rango = hoja.getRange(1, 1, filas.length, A);
  rango.setNumberFormat('@'); // todo como texto: IDs tal cual, sin conversiones
  rango.setValues(filas.map(function (f) { return f.map(function (v) { return v === null || v === undefined ? '' : v; }); }));
  negritas.forEach(function (n) { hoja.getRange(n, 1, 1, A).setFontWeight('bold'); });
  hoja.setColumnWidth(1, 420);
}
