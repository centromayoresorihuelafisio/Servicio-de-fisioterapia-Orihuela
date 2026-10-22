/**
 * ID DE PACIENTE EN LA HOJA "VALORACIONES"
 * Paso 8 del "Orden de trabajo" de CONTEXTO.md, sección 11 (lote A: el dato; el lote B pasa el código a leer por ID).
 *
 * Qué hace: añade a "Valoraciones" la columna "ID paciente" (columna 15, COLUMNAS_NUM.VALORACIONES.ID_PACIENTE, detrás de
 * "DNI") y la rellena con el ID del usuario al que pertenece cada valoración. Así la valoración deja de enlazarse por
 * nombre/DNI (que se escriben a mano y pueden cambiar) y pasa a enlazarse como las citas, el historial y la HC.
 *
 * Cómo decide el usuario de cada fila (la misma regla con la que la web enlaza hoy las valoraciones, para que el ID
 * asignado sea el usuario al que la web ya mostraba la valoración; sin adivinar):
 *   1. Si la fila trae DNI y algún usuario de la Maestra tiene ese DNI, manda el DNI.
 *   2. Si no, se compara el nombre (sin tildes, mayúsculas ni espacios de más), pero solo con usuarios a los que no
 *      les contradice el DNI (si la fila y el usuario tienen DNI distintos, no son la misma persona).
 *   3. Si el nombre coincide con varios usuarios (homónimos), se desempata por teléfono; si aun así no queda uno solo,
 *      la fila NO se asigna y se lista en el informe.
 * Lo que no se puede resolver NO se toca y se lista: valoraciones sin usuario, ambiguas, con un ID que contradice al DNI
 * o al nombre, y con un ID que ya no existe en la Maestra.
 *
 * Seguridad:
 *   - Solo escribe en la columna 15 de "Valoraciones" (cabecera incluida) y en la hoja de informe
 *     "ID paciente en Valoraciones". No toca la Maestra ni ninguna otra columna ni ninguna otra hoja.
 *   - NUNCA cambia un ID paciente que ya esté escrito en una valoración (si contradice lo esperado, lo lista como conflicto).
 *   - Se puede ejecutar de nuevo sin riesgo: solo rellena huecos y vuelve a generar el informe (hazlo también tras
 *     crear valoraciones nuevas mientras el lote B no esté desplegado).
 *   - Comprueba que las filas de la hoja no se han movido antes de escribir y verifica lo escrito al terminar.
 *
 * Cómo usarlo (desde el editor de Apps Script, sin menú):
 *   1. (Opcional) `revisarIdPacienteEnValoraciones`: solo mira y escribe el informe, no asigna nada.
 *   2. `asignarIdPacienteEnValoraciones`: rellena la columna y escribe el informe con los casos que no ha podido resolver.
 *   Requisito: la Maestra ya tiene la columna "ID paciente" rellena (paso 3, `asignarIdsPaciente`).
 *
 * Reutiliza SIN modificar: hcNorm_ y hcAISO_ (historia/HC_Web.gs), normalizarTelefono (usuarios/Contactos_Google.gs),
 * resolverColumnaTelefono_ (core/Utils.gs), _palabrasNombre_ y _nombresParecidos_ (usuarios/Anadir_Usuario.gs),
 * getSS (core/WebApp.gs), SHEETS, COLUMNAS y COLUMNAS_NUM (core/Config.gs).
 *
 * Archivo nuevo en herramientas/. Todos los nombres llevan el prefijo idpVal_ / IDP_VAL_ para no chocar con el ámbito
 * global compartido del proyecto. Se puede borrar cuando ya no haga falta (la hoja de informe también).
 */

const IDP_VAL_ = {
  HOJA: 'ID paciente en Valoraciones',
  MAX_LISTA: 200,   // tope de filas por lista del informe (el recuento es siempre completo)
  ANCHO: 7
};

// ----------------------------------------------------------------------------- puntos de entrada

/** SOLO LECTURA: calcula qué se asignaría y escribe el informe. No cambia "Valoraciones". */
function revisarIdPacienteEnValoraciones() { idpVal_ejecutar_(false); }

/** Rellena la columna "ID paciente" de "Valoraciones" y escribe el informe. */
function asignarIdPacienteEnValoraciones() { idpVal_ejecutar_(true); }

function idpVal_ejecutar_(escribir) {
  const t0 = Date.now();
  const ss = getSS();
  let an, res = null;

  if (escribir) {
    const lock = LockService.getScriptLock(); // nadie guarda ni borra valoraciones mientras se rellena
    if (!lock.tryLock(30000)) throw new Error('Otra operación está escribiendo en la hoja. Espera unos segundos y vuelve a ejecutar.');
    try {
      an = idpVal_analizar_(ss);
      res = idpVal_escribir_(ss, an);
    } finally {
      lock.releaseLock();
    }
  } else {
    an = idpVal_analizar_(ss);
  }

  const segundos = Math.round((Date.now() - t0) / 100) / 10;
  idpVal_escribirInforme_(ss, an, res, escribir, segundos);

  const pendientes = an.sinUsuario.length + an.ambiguas.length + an.conflictos.length + an.idHuerfanos.length + an.bloqueadasSinId;
  const texto = escribir
    ? 'ID paciente en Valoraciones: ' + res.asignadas + ' asignados; ' + pendientes + ' casos sin resolver. Verificación: ' + res.verificacion + '.'
    : 'Revisión: se asignarían ' + an.aAsignar.length + '; ' + pendientes + ' casos sin resolver. No se ha cambiado nada.';
  Logger.log(texto + ' (' + segundos + ' s)');
  try { ss.toast(texto + ' Detalle en la hoja "' + IDP_VAL_.HOJA + '".', 'ID paciente en Valoraciones', 10); } catch (e) { /* sin interfaz */ }
}

// ----------------------------------------------------------------------------- análisis (solo lectura)

/** DNI comparable: sin espacios, puntos ni guiones, en mayúsculas ('' si está vacío). */
function idpVal_dni_(v) {
  return String(v === null || v === undefined ? '' : v).replace(/[^0-9A-Za-z]/g, '').toUpperCase();
}

/** Firma de cada fila de Valoraciones (fecha | nombre | DNI): sirve para comprobar que las filas no se han movido. */
function idpVal_firmas_(val, nF, tz) {
  if (!nF) return [];
  const C = COLUMNAS_NUM.VALORACIONES;
  const ancho = Math.min(val.getMaxColumns(), C.DNI);
  return val.getRange(2, 1, nF, ancho).getValues().map(function (r) {
    return hcAISO_(r[C.FECHA - 1], tz) + '|' + String(r[C.NOMBRE - 1] || '').trim() + '|' + idpVal_dni_(r[C.DNI - 1]);
  });
}

/**
 * Qué usuario de la Maestra es el dueño de una valoración, con la regla del encabezado.
 * Devuelve { tipo: 'unico' | 'ambiguo' | 'ninguno', u, via, cands }.
 */
function idpVal_resolver_(fila, porDni, porNom) {
  let cands = fila.dni ? (porDni[fila.dni] || []).slice() : [];
  let via = 'DNI';
  if (!cands.length) {
    via = 'nombre';
    // Mismo nombre, salvo que la fila y el usuario tengan DNI y sean distintos (entonces no son la misma persona).
    cands = (porNom[fila.nom] || []).filter(function (u) { return !fila.dni || !u.dni; });
  }
  if (cands.length > 1 && fila.tel.length >= 9) {
    const portel = cands.filter(function (u) { return u.tels.indexOf(fila.tel) !== -1; });
    if (portel.length === 1) return { tipo: 'unico', u: portel[0], via: 'teléfono', cands: cands };
  }
  if (cands.length === 1) return { tipo: 'unico', u: cands[0], via: via, cands: cands };
  return { tipo: cands.length ? 'ambiguo' : 'ninguno', u: null, via: via, cands: cands };
}

/**
 * Lee la Maestra y "Valoraciones" una sola vez y clasifica cada valoración. No escribe nada.
 * Devuelve las listas del informe y el plan de escritura (aAsignar, nuevo[]).
 */
function idpVal_analizar_(ss) {
  const maestra = ss.getSheetByName(SHEETS.MAESTRA);
  const val = ss.getSheetByName(SHEETS.VALORACIONES);
  if (!maestra) throw new Error('No se encontró la hoja "' + SHEETS.MAESTRA + '".');
  if (!val) throw new Error('No se encontró la hoja "' + SHEETS.VALORACIONES + '".');
  const tz = ss.getSpreadsheetTimeZone();

  // --- Maestra: usuarios, su ID paciente, su DNI y sus teléfonos
  const ultM = maestra.getLastRow(), ncM = maestra.getLastColumn();
  if (ultM < 2) throw new Error('La Maestra no tiene usuarios.');
  const valoresM = maestra.getRange(1, 1, ultM, ncM).getValues();
  const cab = valoresM[0].map(function (h) { return String(h).trim().toLowerCase(); });
  const idx = function (n) { return cab.indexOf(String(n).trim().toLowerCase()); };
  const cNombre = idx(COLUMNAS.MAESTRA.NOMBRE), cId = idx(COLUMNAS.MAESTRA.ID_PACIENTE), cDni = idx(COLUMNAS.MAESTRA.DNI);
  let cT1 = idx(COLUMNAS.MAESTRA.TELEFONO_1);
  if (cT1 === -1) cT1 = resolverColumnaTelefono_(maestra, valoresM[0]);
  const cT2 = idx(COLUMNAS.MAESTRA.TELEFONO_2);
  if (cNombre === -1) throw new Error('La Maestra no tiene la columna "' + COLUMNAS.MAESTRA.NOMBRE + '".');
  if (cId === -1) throw new Error('La Maestra aún no tiene la columna "' + COLUMNAS.MAESTRA.ID_PACIENTE + '": ejecuta antes asignarIdsPaciente.');
  const celda = function (f, c) { return (c === -1 || f[c] === null || f[c] === undefined) ? '' : f[c].toString().trim(); };

  const usuarios = [], porDni = {}, porNom = {}, porId = {}, sinId = [];
  for (let i = 1; i < valoresM.length; i++) {
    const f = valoresM[i];
    const nombre = celda(f, cNombre);
    if (!nombre) continue;
    const u = {
      fila: i + 1, nombre: nombre, nom: hcNorm_(nombre), dni: idpVal_dni_(celda(f, cDni)), idPaciente: celda(f, cId),
      tels: [celda(f, cT1), celda(f, cT2)].map(normalizarTelefono).filter(function (t) { return t.length >= 9; }),
      palabras: _palabrasNombre_(nombre)
    };
    usuarios.push(u);
    if (u.idPaciente) porId[u.idPaciente] = u; else sinId.push(u);
    (porNom[u.nom] = porNom[u.nom] || []).push(u);
    if (u.dni) (porDni[u.dni] = porDni[u.dni] || []).push(u);
  }
  const txtU = function (u) { return 'fila ' + u.fila + ': ' + u.nombre + (u.dni ? ' (' + u.dni + ')' : ''); };

  // --- Valoraciones
  const C = COLUMNAS_NUM.VALORACIONES, colId = C.ID_PACIENTE;
  const tieneCol = val.getMaxColumns() >= colId;
  const cabV = tieneCol ? String(val.getRange(1, colId).getValue()).trim() : '';
  if (cabV && cabV.toLowerCase() !== COLUMNAS.MAESTRA.ID_PACIENTE.toLowerCase()) {
    throw new Error('La columna ' + colId + ' de "' + SHEETS.VALORACIONES + '" tiene la cabecera "' + cabV + '"; no se escribe encima.');
  }
  const nF = Math.max(val.getLastRow() - 1, 0);
  const leidas = nF ? val.getRange(2, 1, nF, tieneCol ? colId : colId - 1).getValues() : [];
  const firmas = idpVal_firmas_(val, nF, tz);
  const actual = leidas.map(function (r) { return tieneCol ? String(r[colId - 1] || '').trim() : ''; });

  const an = {
    usuarios: usuarios.length, usuarioSinId: [], nF: nF, colId: colId, cabV: cabV, firmas: firmas, actual: actual,
    filasVacias: 0, bloqueadasSinId: 0, totalVal: 0, yaCorrectas: 0, aAsignar: [], nuevo: {}, porVia: { 'DNI': 0, 'nombre': 0, 'teléfono': 0 },
    sinUsuario: [], ambiguas: [], conflictos: [], idHuerfanos: [], dniNombreDistinto: [], porTelefono: []
  };

  for (let i = 0; i < nF; i++) {
    const r = leidas[i];
    const nombre = String(r[C.NOMBRE - 1] || '').trim();
    const f = {
      fila: i + 2, nombre: nombre, nom: hcNorm_(nombre), dni: idpVal_dni_(r[C.DNI - 1]),
      tel: normalizarTelefono(r[C.TELEFONO - 1]), fecha: hcAISO_(r[C.FECHA - 1], tz)
    };
    if (!f.nombre && !f.dni && !actual[i]) { an.filasVacias++; continue; }
    an.totalVal++;

    const res = idpVal_resolver_(f, porDni, porNom);

    // Ya tiene ID escrito: no se toca. Solo se comprueba que existe y que no contradice al DNI/nombre.
    if (actual[i]) {
      if (!porId[actual[i]]) an.idHuerfanos.push({ fila: f.fila, fecha: f.fecha, nombre: f.nombre, id: actual[i] });
      else if (res.tipo === 'unico' && res.u.idPaciente !== actual[i]) {
        an.conflictos.push({ fila: f.fila, fecha: f.fecha, nombre: f.nombre, escrito: txtU(porId[actual[i]]), esperado: txtU(res.u) });
      } else an.yaCorrectas++;
      continue;
    }

    if (res.tipo === 'ninguno') {
      // Sugerencias para que el dueño decida: usuarios con nombre parecido (mismo criterio que los posibles duplicados).
      const pal = _palabrasNombre_(f.nombre);
      const sug = usuarios.filter(function (u) { return _nombresParecidos_(pal, u.palabras); }).slice(0, 5).map(txtU).join(' | ');
      an.sinUsuario.push({ fila: f.fila, fecha: f.fecha, nombre: f.nombre, dni: f.dni, sugerencias: sug });
    } else if (res.tipo === 'ambiguo') {
      an.ambiguas.push({ fila: f.fila, fecha: f.fecha, nombre: f.nombre, dni: f.dni, candidatos: res.cands.map(txtU).join(' | ') });
    } else if (!res.u.idPaciente) {
      // El usuario no tiene ID (no debería pasar tras el paso 3): la valoración no se asigna; el usuario sale en su lista.
      an.bloqueadasSinId++;
    } else {
      an.aAsignar.push(i);
      an.nuevo[i] = res.u.idPaciente;
      an.porVia[res.via]++;
      if (res.via === 'DNI' && res.u.nom !== f.nom) {
        an.dniNombreDistinto.push({ fila: f.fila, fecha: f.fecha, nombre: f.nombre, dni: f.dni, usuario: txtU(res.u) });
      }
      if (res.via === 'teléfono') an.porTelefono.push({ fila: f.fila, fecha: f.fecha, nombre: f.nombre, usuario: txtU(res.u), otros: res.cands.length - 1 });
    }
  }
  an.usuarioSinId = sinId;
  return an;
}

// ----------------------------------------------------------------------------- escritura

/** Escribe SOLO la columna "ID paciente" de "Valoraciones" (se llama con el bloqueo ya tomado). */
function idpVal_escribir_(ss, an) {
  if (!an.aAsignar.length) return { asignadas: 0, verificacion: 'OK (no había nada que asignar)' };
  const val = ss.getSheetByName(SHEETS.VALORACIONES);
  const tz = ss.getSpreadsheetTimeZone();
  const colId = an.colId, nF = an.nF;

  // Justo antes de escribir: si las filas ya no son las que se leyeron, no se escribe nada (ni siquiera la cabecera).
  const firmasAhora = idpVal_firmas_(val, nF, tz);
  if (val.getLastRow() - 1 !== nF) throw new Error('La hoja "' + SHEETS.VALORACIONES + '" ha cambiado mientras se preparaba (ahora tiene otro número de filas). No se ha escrito nada; vuelve a ejecutar.');
  for (let i = 0; i < nF; i++) {
    if (firmasAhora[i] !== an.firmas[i]) throw new Error('La hoja "' + SHEETS.VALORACIONES + '" ha cambiado mientras se preparaba (fila ' + (i + 2) + '). No se ha escrito nada; vuelve a ejecutar.');
  }

  if (val.getMaxColumns() < colId) val.insertColumnsAfter(val.getMaxColumns(), colId - val.getMaxColumns());
  if (!an.cabV) {
    val.getRange(1, colId).setValue(COLUMNAS.MAESTRA.ID_PACIENTE);
    try { val.getRange(1, colId - 1).copyTo(val.getRange(1, colId), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false); } catch (e) { /* solo estética */ }
  }

  const salida = an.actual.map(function (a, i) { return [an.nuevo[i] !== undefined ? an.nuevo[i] : a]; });
  val.getRange(2, colId, nF, 1).setNumberFormat('@').setValues(salida); // SOLO la columna del ID paciente
  SpreadsheetApp.flush();

  // Verificación: mismas valoraciones en las mismas filas y el ID escrito es el previsto.
  const firmasDesp = idpVal_firmas_(val, nF, tz);
  const colDesp = val.getRange(2, colId, nF, 1).getValues().map(function (r) { return String(r[0] || '').trim(); });
  const fallos = [];
  for (let i = 0; i < nF; i++) {
    if (firmasDesp[i] !== an.firmas[i]) fallos.push('fila ' + (i + 2) + ': la valoración cambió durante la escritura');
    if (colDesp[i] !== salida[i][0]) fallos.push('fila ' + (i + 2) + ': el ID paciente leído no coincide con el escrito');
  }
  return {
    asignadas: an.aAsignar.length,
    verificacion: fallos.length ? 'REVISAR: ' + fallos.slice(0, 5).join('; ') + (fallos.length > 5 ? ' (y ' + (fallos.length - 5) + ' más)' : '') : 'OK'
  };
}

// ----------------------------------------------------------------------------- informe

/** Reescribe la hoja "ID paciente en Valoraciones": resumen arriba y, debajo, una lista por cada tipo de caso. */
function idpVal_escribirInforme_(ss, an, res, escribio, segundos) {
  const A = IDP_VAL_.ANCHO;
  const filas = [], negritas = [];
  const pad = function (f) { const r = f.slice(); while (r.length < A) r.push(''); return r.slice(0, A); };
  const add = function (f, negrita) { filas.push(pad(f)); if (negrita) negritas.push(filas.length); };

  add(['ID DE PACIENTE EN "' + SHEETS.VALORACIONES.toUpperCase() + '" (paso 8, lote A)'], true);
  add(['Ejecutado', Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss')]);
  add(['Acción', escribio ? 'Asignación' : 'Revisión (no se ha cambiado nada)']);
  add(['Usuarios con nombre en la Maestra', an.usuarios]);
  add(['Valoraciones en la hoja', an.totalVal]);
  add(['Ya tenían el ID paciente correcto', an.yaCorrectas]);
  add([escribio ? 'ID paciente asignados ahora' : 'ID paciente que se asignarían', escribio ? res.asignadas : an.aAsignar.length]);
  add(['   · por DNI', an.porVia['DNI']]);
  add(['   · por nombre', an.porVia['nombre']]);
  add(['   · por nombre, desempatando por teléfono', an.porVia['teléfono']]);
  if (escribio) add(['Verificación tras escribir', res.verificacion]);
  add(['Valoraciones sin ningún usuario que coincida (no se asignan)', an.sinUsuario.length]);
  add(['Valoraciones que encajan con varios usuarios (no se asignan)', an.ambiguas.length]);
  add(['Valoraciones con un ID que contradice al DNI o al nombre', an.conflictos.length]);
  add(['Valoraciones con un ID que ya no existe en la Maestra', an.idHuerfanos.length]);
  add(['Usuarios sin ID paciente en la Maestra', an.usuarioSinId.length]);
  add(['   · valoraciones que no se han podido asignar por eso', an.bloqueadasSinId]);
  add(['Filas vacías (se ignoran)', an.filasVacias]);
  if (escribio) add(['Duración', segundos + ' s']);

  const lista = function (titulo, cabecera, items, aFila) {
    if (!items.length) return;
    add([]);
    const n = Math.min(items.length, IDP_VAL_.MAX_LISTA);
    add([titulo + ' (' + items.length + ')' + (items.length > n ? ' — se muestran las ' + n + ' primeras' : '')], true);
    add(cabecera, true);
    items.slice(0, n).forEach(function (it) { add(aFila(it)); });
  };
  lista('VALORACIONES SIN USUARIO (no se les ha puesto ID; "Posibles usuarios" = nombres parecidos en la Maestra)',
    ['Fila Valoraciones', 'Fecha', 'Nombre', 'DNI', 'Posibles usuarios'], an.sinUsuario,
    function (x) { return [x.fila, x.fecha, x.nombre, x.dni, x.sugerencias]; });
  lista('VALORACIONES QUE ENCAJAN CON VARIOS USUARIOS (no se les ha puesto ID)',
    ['Fila Valoraciones', 'Fecha', 'Nombre', 'DNI', 'Usuarios candidatos'], an.ambiguas,
    function (x) { return [x.fila, x.fecha, x.nombre, x.dni, x.candidatos]; });
  lista('VALORACIONES CON UN ID QUE CONTRADICE AL DNI O AL NOMBRE (no se han cambiado)',
    ['Fila Valoraciones', 'Fecha', 'Nombre', 'Usuario del ID escrito', 'Usuario esperado por DNI/nombre'], an.conflictos,
    function (x) { return [x.fila, x.fecha, x.nombre, x.escrito, x.esperado]; });
  lista('VALORACIONES CON UN ID QUE YA NO EXISTE EN LA MAESTRA (no se han cambiado)',
    ['Fila Valoraciones', 'Fecha', 'Nombre', 'ID escrito'], an.idHuerfanos,
    function (x) { return [x.fila, x.fecha, x.nombre, x.id]; });
  lista('ASIGNADAS POR DNI, PERO CON NOMBRE DISTINTO AL DEL USUARIO (aviso: comprueba que es la misma persona)',
    ['Fila Valoraciones', 'Fecha', 'Nombre en la valoración', 'DNI', 'Usuario asignado'], an.dniNombreDistinto,
    function (x) { return [x.fila, x.fecha, x.nombre, x.dni, x.usuario]; });
  lista('ASIGNADAS DESEMPATANDO POR TELÉFONO (aviso: había varios usuarios con ese nombre)',
    ['Fila Valoraciones', 'Fecha', 'Nombre en la valoración', 'Usuario asignado', 'Otros con ese nombre'], an.porTelefono,
    function (x) { return [x.fila, x.fecha, x.nombre, x.usuario, x.otros]; });
  lista('USUARIOS SIN ID PACIENTE EN LA MAESTRA',
    ['Fila Maestra', 'Nombre'], an.usuarioSinId,
    function (x) { return [x.fila, x.nombre]; });

  let hoja = ss.getSheetByName(IDP_VAL_.HOJA);
  if (hoja) hoja.clear(); else hoja = ss.insertSheet(IDP_VAL_.HOJA);
  if (hoja.getMaxRows() < filas.length) hoja.insertRowsAfter(hoja.getMaxRows(), filas.length - hoja.getMaxRows());
  if (hoja.getMaxColumns() < A) hoja.insertColumnsAfter(hoja.getMaxColumns(), A - hoja.getMaxColumns());
  const rango = hoja.getRange(1, 1, filas.length, A);
  rango.setNumberFormat('@'); // todo como texto: IDs tal cual, sin conversiones
  rango.setValues(filas.map(function (f) { return f.map(function (v) { return v === null || v === undefined ? '' : v; }); }));
  negritas.forEach(function (n) { hoja.getRange(n, 1, 1, A).setFontWeight('bold'); });
  hoja.setColumnWidth(1, 420);
}
