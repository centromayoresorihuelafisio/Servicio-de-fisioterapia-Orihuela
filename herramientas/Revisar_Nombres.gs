// =====================================================================================
// herramientas/Revisar_Nombres.gs
// FASE 2 de la sección 22 de CONTEXTO.md: deja los nombres de la Maestra en su forma oficial (DNI o SIP).
//
// Desde el editor de Apps Script (mejor sin usar la web app durante unos segundos):
//   1. `revisarNombres`: SOLO LECTURA sobre la Maestra. Crea (o rehace) la pestaña «Revisión nombres» con cada
//      nombre que conviene mirar: ID paciente, nombre actual, propuesta, tipo (seguro / dudoso / error a revisar),
//      motivo, el nombre habitual que se guardaría y la columna «Nombre definitivo».
//      · seguro: «Nombre definitivo» viene ya relleno con la propuesta (decisión del dueño, 12-nov-2026). Para no
//        cambiar uno, se borra su celda.
//      · dudoso y error a revisar: «Nombre definitivo» viene vacío; lo escribe el dueño mirando el DNI o la SIP.
//      Si se vuelve a ejecutar, conserva lo que el dueño ya escribió en «Nombre definitivo» (si el nombre actual
//      no ha cambiado).
//   2. `aplicarNombres`: cambia SOLO las filas con algo escrito en «Nombre definitivo». Localiza a cada usuario por
//      su ID paciente, normaliza el nombre (normalizarNombreUsuario_), deja cada cambio en «Registro» y, si
//      «Nombre habitual» está vacío, guarda ahí el de la columna «Nombre habitual (si está vacío)». Escribe el
//      resultado de cada fila en la columna «Resultado». Se puede repetir sin peligro: lo ya cambiado no se toca.
//
// La lista de diminutivos y abreviaturas NO está aquí: es la común de core/Nombres_Oficiales.gs (también para la
// fase 3). Aquí solo van los errores sueltos vistos en la hoja del dueño. Al terminar la fase 2 se retira este archivo.
// Nombres con prefijo revNombres para no chocar en el ámbito global.
// =====================================================================================

const REV_NOMBRES_HOJA_ = 'Revisión nombres';
const REV_NOMBRES_CABECERAS_ = ['ID paciente', 'Nombre actual', 'Propuesta', 'Tipo', 'Motivo',
  'Nombre habitual (si está vacío)', 'Nombre definitivo', 'Resultado'];
const REV_NOMBRES_COL_ = { ID: 0, ACTUAL: 1, PROPUESTA: 2, TIPO: 3, MOTIVO: 4, HABITUAL: 5, DEFINITIVO: 6, RESULTADO: 7 };

/** Errores sueltos vistos en la lista del dueño (12-nov-2026). Con dos opciones: [en el nombre, en los apellidos]. */
const REV_NOMBRES_EXTRA_ = {
  erratas: { DELMORAL: 'DEL MORAL', BAUTIS: 'BAUTISTA', COSTANZA: 'CONSTANZA', ASCENSIO: ['ASCENSION', 'ASENSIO'] },
  ajenas: ['PERSONAL']
};

const REV_NOMBRES_ORDEN_TIPO_ = { 'seguro': 0, 'dudoso': 1, 'error a revisar': 2 };

/**
 * Lógica pura de la revisión (se prueba en comprobar/nombres.mjs). `usuarios` = [{ id, nombre, habitual }].
 * Devuelve las filas de la pestaña (sin cabecera), ya ordenadas, y un resumen { total, seguro, dudoso, error, sinId }.
 * `habitual` null = la Maestra no tiene esa columna. `previos` = { id: { actual, definitivo } } con lo que el dueño ya
 * había escrito.
 */
function revNombresCalcular_(usuarios, previos) {
  previos = previos || {};
  const analisis = usuarios.map(function (u) { return { u: u, a: nombresAnalizar_(u.nombre, REV_NOMBRES_EXTRA_) }; });
  const duplicados = nombresPosiblesDuplicados_(analisis.filter(function (x) { return x.u.id; }).map(function (x) {
    const base = x.a.propuesta ? x.a.propuesta.split(' o ')[0] : normalizarNombreUsuario_(x.u.nombre);
    return { id: x.u.id, nombre: base };
  }));
  const nombrePorId = {};
  usuarios.forEach(function (u) { if (u.id) nombrePorId[u.id] = String(u.nombre || '').trim(); });

  const resumen = { total: usuarios.length, seguro: 0, dudoso: 0, error: 0, sinId: 0 };
  const filas = [];
  analisis.forEach(function (x) {
    const u = x.u, a = x.a;
    let tipo = a.tipo;
    const motivos = a.motivos.slice();
    if (u.id && duplicados[u.id]) {
      motivos.push('¿Duplicado? Se parece a: ' + duplicados[u.id].map(function (id) { return nombrePorId[id]; }).join(' / '));
      tipo = NOMBRES_TIPO_.ERROR;
    }
    if (!tipo) return;
    if (!u.id) { resumen.sinId++; return; }   // sin ID no se puede localizar: no se lista (ver el registro)
    const habitualHoja = normalizarNombreUsuario_(u.habitual);
    let habitual = u.habitual === null ? '' : a.habitual;   // null = la Maestra no tiene la columna
    if (habitual && habitualHoja) { motivos.push('Ya tiene nombre habitual: ' + habitualHoja); habitual = ''; }
    let definitivo = (tipo === NOMBRES_TIPO_.SEGURO && a.cambia) ? a.propuesta : '';
    const previo = previos[u.id];
    if (previo && previo.actual === a.actual) definitivo = previo.definitivo;
    resumen[tipo === NOMBRES_TIPO_.ERROR ? 'error' : tipo]++;
    filas.push([u.id, a.actual, a.propuesta === a.actual ? '' : a.propuesta, tipo, motivos.join('. '), habitual, definitivo, '']);
  });
  filas.sort(function (p, q) {
    return (REV_NOMBRES_ORDEN_TIPO_[p[REV_NOMBRES_COL_.TIPO]] - REV_NOMBRES_ORDEN_TIPO_[q[REV_NOMBRES_COL_.TIPO]]) ||
      String(p[REV_NOMBRES_COL_.ACTUAL]).localeCompare(String(q[REV_NOMBRES_COL_.ACTUAL]), 'es');
  });
  return { filas: filas, resumen: resumen };
}

/**
 * Lógica pura de la aplicación. `fila` es una fila de la pestaña; `maestra` = { nombre, habitual, hayHabitual } de ese
 * usuario en la hoja ahora mismo. Devuelve { nombre, habitual, resultado }: nombre/habitual = lo que hay que escribir
 * (null = no tocar).
 */
function revNombresDecidir_(fila, maestra) {
  const definitivo = normalizarNombreUsuario_(fila[REV_NOMBRES_COL_.DEFINITIVO]);
  if (!definitivo) return { nombre: null, habitual: null, resultado: 'Nombre definitivo sin letras: no se cambia' };
  const enHoja = String(maestra.nombre || '').trim();
  const salida = { nombre: null, habitual: null, resultado: '' };
  if (enHoja === definitivo) {
    salida.resultado = 'Ya estaba así';
  } else if (enHoja !== String(fila[REV_NOMBRES_COL_.ACTUAL] || '').trim()) {
    return { nombre: null, habitual: null, resultado: 'El nombre cambió en la hoja después de la revisión: vuelve a ejecutar revisarNombres' };
  } else {
    salida.nombre = definitivo;
    salida.resultado = 'Cambiado';
  }
  const habitual = normalizarNombreUsuario_(fila[REV_NOMBRES_COL_.HABITUAL]);
  if (habitual && maestra.hayHabitual && !String(maestra.habitual || '').trim() && (definitivo + ' ').indexOf(habitual + ' ') !== 0) {
    salida.habitual = habitual;
    salida.resultado += ' · nombre habitual: ' + habitual;
  }
  return salida;
}

/** Lee de la Maestra { hoja, cNombre, cId, cHabitual (-1 si falta), datos[[nombre, id, habitual]] } (desde la fila 2). */
function revNombresLeerMaestra_() {
  const hoja = getSS_().getSheetByName(SHEETS.MAESTRA);
  if (!hoja) throw new Error('No se encontró la hoja «' + SHEETS.MAESTRA + '».');
  const cNombre = obtenerIndiceColumnaPorNombre_(hoja, COLUMNAS.MAESTRA.NOMBRE);
  const cId = obtenerIndiceColumnaPorNombre_(hoja, COLUMNAS.MAESTRA.ID_PACIENTE);
  const cHabitual = obtenerIndiceColumnaPorNombre_(hoja, COLUMNAS.MAESTRA.NOMBRE_HABITUAL);
  if (cNombre === -1 || cId === -1) throw new Error('Faltan las columnas «Nombre» o «ID paciente» en la Maestra.');
  const ult = hoja.getLastRow();
  const valores = ult < 2 ? [] : hoja.getRange(2, 1, ult - 1, hoja.getLastColumn()).getValues();
  const datos = valores.map(function (f) {
    return [String(f[cNombre] || '').trim(), String(f[cId] || '').trim(), cHabitual === -1 ? '' : String(f[cHabitual] || '').trim()];
  });
  return { hoja: hoja, cNombre: cNombre, cId: cId, cHabitual: cHabitual, datos: datos };
}

/** Paso 1. SOLO LECTURA sobre la Maestra: rehace la pestaña «Revisión nombres». */
function revisarNombres() {
  soloPropietario_('revisarNombres');
  const m = revNombresLeerMaestra_();
  if (m.cHabitual === -1) Logger.log('Aviso: la Maestra no tiene la columna «Nombre habitual»; no se propondrá ninguno.');
  const usuarios = m.datos.filter(function (d) { return d[0] || d[1]; })
    .map(function (d) { return { nombre: d[0], id: d[1], habitual: m.cHabitual === -1 ? null : d[2] }; });

  const ss = getSS_();
  let hoja = ss.getSheetByName(REV_NOMBRES_HOJA_);
  const previos = {};
  if (hoja && hoja.getLastRow() > 1) {
    hoja.getRange(2, 1, hoja.getLastRow() - 1, REV_NOMBRES_CABECERAS_.length).getValues().forEach(function (f) {
      const id = String(f[REV_NOMBRES_COL_.ID] || '').trim();
      if (id) previos[id] = { actual: String(f[REV_NOMBRES_COL_.ACTUAL] || '').trim(), definitivo: String(f[REV_NOMBRES_COL_.DEFINITIVO] || '').trim() };
    });
  }
  const r = revNombresCalcular_(usuarios, previos);

  if (!hoja) hoja = ss.insertSheet(REV_NOMBRES_HOJA_);
  hoja.clear();
  hoja.getRange(1, 1, 1, REV_NOMBRES_CABECERAS_.length).setValues([REV_NOMBRES_CABECERAS_]).setFontWeight('bold');
  hoja.setFrozenRows(1);
  if (r.filas.length) {
    const rango = hoja.getRange(2, 1, r.filas.length, REV_NOMBRES_CABECERAS_.length);
    rango.setNumberFormat('@').setValues(r.filas).setVerticalAlignment('top');
    hoja.getRange(2, REV_NOMBRES_COL_.DEFINITIVO + 1, r.filas.length, 1).setFontWeight('bold');
  }
  [280, 300, 300, 110, 420, 200, 300, 300].forEach(function (w, i) { hoja.setColumnWidth(i + 1, w); });
  hoja.getRange(1, REV_NOMBRES_COL_.MOTIVO + 1, Math.max(1, r.filas.length + 1), 1).setWrap(true);
  hoja.hideColumns(REV_NOMBRES_COL_.ID + 1);

  Logger.log('Usuarios leídos: ' + r.resumen.total + '. A revisar: ' + r.filas.length + ' (seguros ' + r.resumen.seguro +
    ', dudosos ' + r.resumen.dudoso + ', errores a revisar ' + r.resumen.error + ').' +
    (r.resumen.sinId ? ' Sin ID paciente (no salen en la pestaña): ' + r.resumen.sinId + '.' : '') +
    ' Mira la pestaña «' + REV_NOMBRES_HOJA_ + '», completa «Nombre definitivo» y ejecuta aplicarNombres.');
}

/** Paso 2. Cambia en la Maestra solo las filas con «Nombre definitivo». Se puede repetir. */
function aplicarNombres() {
  soloPropietario_('aplicarNombres');
  const rev = getSS_().getSheetByName(REV_NOMBRES_HOJA_);
  if (!rev || rev.getLastRow() < 2) throw new Error('No hay pestaña «' + REV_NOMBRES_HOJA_ + '» con filas: ejecuta antes revisarNombres.');
  const filas = rev.getRange(2, 1, rev.getLastRow() - 1, REV_NOMBRES_CABECERAS_.length).getValues();

  const cuenta = { cambiados: 0, habituales: 0, igual: 0, saltados: 0 };
  const resultados = [];
  conBloqueoScript_(function () {
    const m = revNombresLeerMaestra_();
    const mapa = mapaFilasMaestraPorId_(m.hoja);
    filas.forEach(function (f) {
      const id = String(f[REV_NOMBRES_COL_.ID] || '').trim();
      if (!String(f[REV_NOMBRES_COL_.DEFINITIVO] || '').trim()) { resultados.push([f[REV_NOMBRES_COL_.RESULTADO] || '']); return; }
      const filaHoja = id ? mapa[id] : 0;
      if (!filaHoja) { cuenta.saltados++; resultados.push(['No se encuentra el ID paciente en la Maestra']); return; }
      const d = m.datos[filaHoja - 2];
      const decision = revNombresDecidir_(f, { nombre: d[0], habitual: d[2], hayHabitual: m.cHabitual !== -1 });
      if (decision.nombre !== null) {
        m.hoja.getRange(filaHoja, m.cNombre + 1).setValue(decision.nombre);
        registroAnotar_('propietario', 'administrador', 'aplicarNombres', id,
          JSON.stringify({ campo: COLUMNAS.MAESTRA.NOMBRE, antes: d[0], despues: decision.nombre }), 'ok');
        cuenta.cambiados++;
      } else if (decision.resultado.indexOf('Ya estaba así') === 0) {
        cuenta.igual++;
      } else {
        cuenta.saltados++;
      }
      if (decision.habitual !== null) {
        m.hoja.getRange(filaHoja, m.cHabitual + 1).setValue(decision.habitual);
        registroAnotar_('propietario', 'administrador', 'aplicarNombres', id,
          JSON.stringify({ campo: COLUMNAS.MAESTRA.NOMBRE_HABITUAL, antes: '', despues: decision.habitual }), 'ok');
        cuenta.habituales++;
      }
      resultados.push([decision.resultado]);
    });
  });
  rev.getRange(2, REV_NOMBRES_COL_.RESULTADO + 1, resultados.length, 1).setValues(resultados);
  Logger.log('Nombres cambiados: ' + cuenta.cambiados + '. Nombres habituales guardados: ' + cuenta.habituales +
    '. Ya estaban así: ' + cuenta.igual + '. Sin cambiar (mira la columna «Resultado»): ' + cuenta.saltados + '.');
}
