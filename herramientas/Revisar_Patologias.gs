/**
 * REVISIÓN ASISTIDA DE PATOLOGÍAS (conversación 3 de la sección 15 de CONTEXTO.md)
 *
 * Qué hace: repasa las columnas «Patología 1» y «Patología 2» de la Maestra y compara cada valor con la lista oficial
 * (core/Patologias.gs). Lo que ya coincide no se toca. Lo demás lo enseña en una hoja de revisión ("Revisión Patologías")
 * con una propuesta; tú decides en la columna «Decisión final» y solo entonces se guarda.
 *
 * Cómo usarlo (desde el editor de Apps Script, sin menú; no escribas en la Maestra a mano mientras trabaja):
 *   1. `revisarPatologias`: SOLO LECTURA de la Maestra. Crea/rehace la hoja "Revisión Patologías" con una fila por cada valor
 *      que no coincide exactamente con la lista. Estados:
 *        · «Automático»  — cambio de nombre claro (p. ej. «Ictus» → «Ictus (secuelas)», o solo mayúsculas). La decisión viene rellena.
 *        · «Dudoso»      — hay varias opciones posibles (p. ej. «Fractura»: ¿miembro superior, inferior, cadera o vértebra?). La decisión viene VACÍA y la
 *                          sugerencia indica las opciones; eliges de la lista desplegable.
 *        · «Sin equivalente» — nada en la lista se le parece. Decisión vacía (puedes elegir «Otro diagnóstico (no listado)» u otra).
 *      Puedes cambiar cualquier «Decisión final» (desplegable con la lista oficial) o borrarla para no tocar ese valor.
 *      Para ELIMINAR el valor antiguo sin sustituirlo, elige «(Quitar esta patología)» al final del desplegable.
 *   2. Cuando estés conforme, ejecuta `aplicarRevisionPatologias`. Solo cambia las filas con decisión; deja el resto como está.
 *      Antes de escribir comprueba que el valor de la Maestra sigue siendo el que viste (si no, lo salta y lo anota en «Resultado»).
 *   3. Vuelve a ejecutar `revisarPatologias` para ver lo que queda. Se puede repetir las veces que haga falta.
 *
 * Seguridad: `revisarPatologias` solo escribe la hoja de revisión. `aplicarRevisionPatologias` solo escribe las celdas
 * «Patología 1» / «Patología 2» de los usuarios con decisión; localiza al usuario por su ID paciente (no por la fila) y verifica
 * lo escrito al terminar. Una decisión que no esté en la lista oficial se rechaza.
 *
 * Reutiliza SIN modificar: patologiasLista_ (core/Patologias.gs), normalizarTexto, mapaFilasMaestraPorId_ (core/Utils.gs),
 * getSS (core/WebApp.gs), SHEETS y COLUMNAS (core/Config.gs) y DASH_SEP_PATOLOGIA_ (dashboard/Dashboard_Datos.gs, el mismo separador
 * que usa Estadísticas).
 *
 * Archivo nuevo en herramientas/. Prefijo revPat_ / REV_PAT_ por el ámbito global. Se puede borrar cuando todos los usuarios
 * estén revisados (la hoja "Revisión Patologías" también).
 */

const REV_PAT_ = {
  HOJA: 'Revisión Patologías',
  COL_P1: 'Patología 1',
  COL_P2: 'Patología 2',
  CABECERA: ['Fila', 'Usuario', 'Columna', 'Valor actual', 'Estado', 'Sugerencia / opciones', 'Decisión final', 'Código CIE-10', 'Resultado', 'ID paciente'],
  FILA_CAB: 12,       // fila de la hoja donde está la cabecera de la tabla (las de arriba son el resumen)
  COL_LISTA: 12,      // columna L: lista oficial para el desplegable (L = nombre, M = código)
  QUITAR: '(Quitar esta patología)', // decisión especial: borra el valor antiguo de la celda sin sustituirlo
  MAX_OPCIONES: 3     // sugerencias por aproximación de palabras
};

/**
 * Nombres antiguos conocidos (sección 15) → opciones nuevas, con el nombre antiguo sin tildes ni mayúsculas.
 * auto:true = una sola equivalencia clara; si no, se enseñan las opciones y decide el dueño.
 */
const REV_PAT_ALIAS_ = {
  'estenosis medular':       { opciones: ['Estenosis de canal'], auto: true },
  'ictus':                   { opciones: ['Ictus (secuelas)'], auto: true },
  'estabilidad':             { opciones: ['Alteración del equilibrio'], auto: true },
  'radiculopatia ms':        { opciones: ['Radiculopatía cervical'], auto: true },
  'radiculopatia mi':        { opciones: ['Radiculopatía lumbar'], auto: true },
  'otro':                    { opciones: ['Otro diagnóstico (no listado)'], auto: true },
  'hernia discal':           { opciones: ['Hernia discal lumbar'], auto: true },            // decisión del dueño 1-nov-2026
  'enfermedad respiratoria': { opciones: ['Otra enfermedad respiratoria'], auto: true },    // idem
  'esclerosis':              { opciones: ['Esclerosis múltiple'], auto: true },             // idem
  'tendinopatia':            { opciones: ['Tendinopatía de otra localización'], auto: true }, // idem
  'fractura':                { opciones: ['Fractura de miembro superior', 'Fractura de miembro inferior', 'Fractura de cadera', 'Fractura vertebral'] },
  'esguince':                { opciones: ['Esguince o luxación de otras zonas'], auto: true }, // decisión del dueño 1-nov-2026
  'luxacion':                { opciones: ['Esguince o luxación de otras zonas'], auto: true }, // idem
  'caida':                   { opciones: ['Alteración del equilibrio'], auto: true },         // idem
  'ms':                      { opciones: [], quitar: true },                                  // idem: no es un diagnóstico, se quita
  'mi':                      { opciones: [], quitar: true },                                  // idem
  'limitacion funcional':    { opciones: ['Fragilidad o deterioro funcional'], auto: true }   // idem
};

// ----------------------------------------------------------------------------- puntos de entrada

/** SOLO LECTURA de la Maestra. Escribe la hoja "Revisión Patologías" con lo que no coincide con la lista oficial. */
function revisarPatologias() {
  const ss = getSS();
  const datos = revPat_leerMaestra_(ss);
  const lista = patologiasLista_();
  const filas = [];
  const cuenta = { usuarios: 0, celdasConValor: 0, coinciden: 0, automatico: 0, dudoso: 0, sinEquivalente: 0 };

  datos.usuarios.forEach(function (u) {
    let tieneValor = false;
    [[REV_PAT_.COL_P1, u.p1], [REV_PAT_.COL_P2, u.p2]].forEach(function (par) {
      const trozos = revPat_trocear_(par[1]);
      if (trozos.length) { cuenta.celdasConValor++; tieneValor = true; }
      trozos.forEach(function (t) {
        const r = revPat_clasificar_(t, lista);
        if (r.estado === 'Coincide') { cuenta.coinciden++; return; }
        if (r.estado === 'Automático') cuenta.automatico++;
        else if (r.estado === 'Dudoso') cuenta.dudoso++;
        else cuenta.sinEquivalente++;
        filas.push([u.fila, u.nombre, par[0], t, r.estado, r.sugerencia, r.decision, '', '', u.id]);
      });
    });
    if (tieneValor) cuenta.usuarios++;
  });

  revPat_escribirInforme_(ss, datos, cuenta, filas, lista);
  const msg = filas.length
    ? 'Hay ' + filas.length + ' valores por revisar (' + cuenta.automatico + ' automáticos, ' + cuenta.dudoso + ' dudosos, ' + cuenta.sinEquivalente + ' sin equivalente). Mira la hoja "' + REV_PAT_.HOJA + '".'
    : 'Todo coincide con la lista oficial. No hay nada que revisar.';
  revPat_avisar_(ss, msg);
}

/** Guarda en la Maestra las decisiones de la hoja "Revisión Patologías". Solo toca filas con decisión. */
function aplicarRevisionPatologias() {
  const ss = getSS();
  const informe = ss.getSheetByName(REV_PAT_.HOJA);
  if (!informe) throw new Error('No existe la hoja "' + REV_PAT_.HOJA + '". Ejecuta antes revisarPatologias.');
  const cab = REV_PAT_.CABECERA;
  const filaCab = revPat_buscarCabecera_(informe);
  const ult = informe.getLastRow();
  if (ult <= filaCab) { revPat_avisar_(ss, 'La hoja de revisión no tiene filas.'); return; }
  const tabla = informe.getRange(filaCab + 1, 1, ult - filaCab, cab.length).getValues();
  const ix = function (n) { return cab.indexOf(n); };
  const cUsuario = ix('Usuario'), cColumna = ix('Columna'), cActual = ix('Valor actual'), cDecision = ix('Decisión final'), cId = ix('ID paciente');

  const oficial = {};
  patologiasLista_().forEach(function (p) { oficial[normalizarTexto(p.nombre)] = p.nombre; });

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('Otra operación está escribiendo en la hoja. Espera unos segundos y vuelve a ejecutar.');
  try {
    const hoja = ss.getSheetByName(SHEETS.MAESTRA);
    if (!hoja) throw new Error('No se encontró la hoja "' + SHEETS.MAESTRA + '".');
    const cabM = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim().toLowerCase(); });
    const colM = {};
    colM[REV_PAT_.COL_P1] = cabM.indexOf(REV_PAT_.COL_P1.toLowerCase());
    colM[REV_PAT_.COL_P2] = cabM.indexOf(REV_PAT_.COL_P2.toLowerCase());
    if (colM[REV_PAT_.COL_P1] === -1 || colM[REV_PAT_.COL_P2] === -1) throw new Error('La Maestra no tiene las columnas de patología.');
    const filaPorId = mapaFilasMaestraPorId_(hoja);
    const nFilas = hoja.getLastRow() - 1;
    // Foto de las dos columnas: se trabaja en memoria y se escribe solo lo que cambia.
    const ant = {};
    [REV_PAT_.COL_P1, REV_PAT_.COL_P2].forEach(function (c) {
      ant[c] = hoja.getRange(2, colM[c] + 1, nFilas, 1).getValues().map(function (f) { return String(f[0] == null ? '' : f[0]); });
    });
    const nuevo = { };
    [REV_PAT_.COL_P1, REV_PAT_.COL_P2].forEach(function (c) { nuevo[c] = ant[c].slice(); });

    const resultado = tabla.map(function () { return ['']; });
    const cuenta = { aplicadas: 0, sinDecision: 0, rechazadas: 0, saltadas: 0 };
    const cambiadas = {}; // 'col|fila' -> true

    tabla.forEach(function (r, k) {
      const decision = String(r[cDecision] || '').trim();
      const actual = String(r[cActual] || '').trim();
      if (!actual) return;
      if (!decision) { cuenta.sinDecision++; resultado[k][0] = 'Sin decisión: no se toca'; return; }
      const quitar = normalizarTexto(decision) === normalizarTexto(REV_PAT_.QUITAR);
      const oficialNombre = oficial[normalizarTexto(decision)];
      if (!quitar && !oficialNombre) { cuenta.rechazadas++; resultado[k][0] = 'RECHAZADA: "' + decision + '" no está en la lista oficial'; return; }
      const col = String(r[cColumna]);
      const fila = filaPorId[String(r[cId] || '').trim()];
      if (!fila || !(col in nuevo)) { cuenta.saltadas++; resultado[k][0] = 'SALTADA: no se encuentra al usuario'; return; }
      const i = fila - 2;
      const trozos = revPat_trocear_(nuevo[col][i]);
      const pos = trozos.findIndex(function (t) { return normalizarTexto(t) === normalizarTexto(actual); });
      if (pos === -1) { cuenta.saltadas++; resultado[k][0] = 'SALTADA: el valor de la Maestra ya no es "' + actual + '"'; return; }
      if (quitar) trozos.splice(pos, 1); else trozos[pos] = oficialNombre;
      nuevo[col][i] = revPat_unir_(trozos);
      cambiadas[col + '|' + fila] = true;
      cuenta.aplicadas++;
      resultado[k][0] = quitar ? 'Aplicada (patología quitada)' : 'Aplicada';
    });

    // Escritura: solo las celdas que han cambiado de verdad.
    let celdas = 0;
    Object.keys(cambiadas).forEach(function (k) {
      const p = k.split('|'), col = p[0], fila = Number(p[1]);
      if (nuevo[col][fila - 2] !== ant[col][fila - 2]) { hoja.getRange(fila, colM[col] + 1).setValue(nuevo[col][fila - 2]); celdas++; }
    });
    SpreadsheetApp.flush();

    // Verificación: lo escrito se lee igual.
    const fallos = [];
    Object.keys(cambiadas).forEach(function (k) {
      const p = k.split('|'), col = p[0], fila = Number(p[1]);
      const leido = String(hoja.getRange(fila, colM[col] + 1).getValue());
      if (leido !== nuevo[col][fila - 2]) fallos.push('fila ' + fila + ' (' + col + ')');
    });

    informe.getRange(filaCab + 1, ix('Resultado') + 1, resultado.length, 1).setValues(resultado);
    const verif = fallos.length ? 'REVISAR: ' + fallos.slice(0, 5).join('; ') : 'OK';
    const msg = 'Aplicadas ' + cuenta.aplicadas + ' (' + celdas + ' celdas cambiadas), sin decisión ' + cuenta.sinDecision +
      ', rechazadas ' + cuenta.rechazadas + ', saltadas ' + cuenta.saltadas + '. Verificación: ' + verif + '. Ejecuta revisarPatologias para ver lo que queda.';
    informe.getRange(2, 1).setValue('Última acción: aplicado el ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm') + ': ' + msg);
    revPat_avisar_(ss, msg);
  } finally {
    lock.releaseLock();
  }
}

// ----------------------------------------------------------------------------- lógica

function revPat_avisar_(ss, texto) {
  Logger.log(texto);
  try { ss.toast(texto, 'Revisión de patologías', 10); } catch (e) { /* sin interfaz */ }
}

/** Divide una celda en valores sueltos con el mismo separador que usa Estadísticas, sin vacíos ni puntos finales. */
function revPat_trocear_(celda) {
  return String(celda == null ? '' : celda).split(DASH_SEP_PATOLOGIA_)
    .map(function (s) { return s.trim().replace(/[.\s]+$/, ''); })
    .filter(Boolean);
}

/** Une los valores como los guardan los formularios (separados por coma y espacio), sin repetir. */
function revPat_unir_(trozos) {
  const vistos = {};
  return trozos.filter(function (t) {
    const k = normalizarTexto(t);
    if (vistos[k]) return false;
    vistos[k] = true;
    return true;
  }).join(', ');
}

/**
 * Clasifica un valor: { estado, sugerencia, decision }.
 * Coincide (exacto, con mayúsculas y tildes) · Automático (mayúsculas/tildes distintas, o nombre antiguo con una sola equivalencia)
 * · Dudoso (varias opciones o parecido por palabras) · Sin equivalente.
 */
function revPat_clasificar_(valor, lista) {
  const n = normalizarTexto(valor);
  const exacto = lista.filter(function (p) { return p.nombre === valor; })[0];
  if (exacto) return { estado: 'Coincide', sugerencia: '', decision: '' };
  const mismo = lista.filter(function (p) { return normalizarTexto(p.nombre) === n; })[0];
  if (mismo) return { estado: 'Automático', sugerencia: 'Solo cambian mayúsculas o tildes', decision: mismo.nombre };

  const alias = REV_PAT_ALIAS_[n];
  if (alias) {
    if (alias.auto && alias.opciones.length === 1) return { estado: 'Automático', sugerencia: 'Nombre antiguo → ' + alias.opciones[0], decision: alias.opciones[0] };
    if (alias.quitar) return { estado: 'Automático', sugerencia: 'Antiguo, no es un diagnóstico → se quita', decision: REV_PAT_.QUITAR };
    return { estado: 'Dudoso', sugerencia: 'Opciones: ' + alias.opciones.join(' · '), decision: '' };
  }

  // Parecido por palabras importantes (5 letras o más).
  const palabras = function (t) { return normalizarTexto(t).split(/[^a-z0-9ñ]+/).filter(function (w) { return w.length >= 5; }); };
  const mias = palabras(valor);
  const candidatas = [];
  if (mias.length) {
    lista.forEach(function (p) {
      const suyas = palabras(p.nombre);
      const comunes = mias.filter(function (w) { return suyas.some(function (s) { return s === w || s.indexOf(w) === 0 || w.indexOf(s) === 0; }); }).length;
      if (comunes) candidatas.push({ p: p, puntos: comunes / Math.max(mias.length, suyas.length) });
    });
  }
  candidatas.sort(function (a, b) { return b.puntos - a.puntos; });
  const top = candidatas.slice(0, REV_PAT_.MAX_OPCIONES);
  if (top.length) return { estado: 'Dudoso', sugerencia: 'Se parece a: ' + top.map(function (c) { return c.p.nombre; }).join(' · '), decision: '' };
  return { estado: 'Sin equivalente', sugerencia: 'Nada en la lista se le parece; elige una o deja vacío', decision: '' };
}

// ----------------------------------------------------------------------------- lectura y hoja

/** Lee la Maestra una vez (solo lectura): { usuarios:[{ fila, id, nombre, p1, p2 }], conId, filasConNombre }. */
function revPat_leerMaestra_(ss) {
  const hoja = ss.getSheetByName(SHEETS.MAESTRA);
  if (!hoja) throw new Error('No se encontró la hoja "' + SHEETS.MAESTRA + '".');
  const ult = hoja.getLastRow(), nc = hoja.getLastColumn();
  if (ult < 2) return { usuarios: [], filasConNombre: 0, sinId: 0 };
  const valores = hoja.getRange(1, 1, ult, nc).getValues();
  const cab = valores[0].map(function (h) { return String(h).trim().toLowerCase(); });
  const idx = function (n) { return cab.indexOf(String(n).trim().toLowerCase()); };
  const cNombre = idx(COLUMNAS.MAESTRA.NOMBRE), cId = idx(COLUMNAS.MAESTRA.ID_PACIENTE);
  const c1 = idx(REV_PAT_.COL_P1), c2 = idx(REV_PAT_.COL_P2);
  if (cNombre === -1) throw new Error('La Maestra no tiene la columna "' + COLUMNAS.MAESTRA.NOMBRE + '".');
  if (cId === -1) throw new Error('La Maestra no tiene la columna "' + COLUMNAS.MAESTRA.ID_PACIENTE + '". Ejecuta antes asignarIdsPaciente.');
  if (c1 === -1 || c2 === -1) throw new Error('La Maestra no tiene las columnas "' + REV_PAT_.COL_P1 + '" y "' + REV_PAT_.COL_P2 + '".');
  const t = function (f, c) { return f[c] == null ? '' : String(f[c]).trim(); };
  const usuarios = [];
  let sinId = 0;
  for (let i = 1; i < valores.length; i++) {
    const f = valores[i];
    const nombre = t(f, cNombre);
    if (!nombre) continue;
    const id = t(f, cId);
    if (!id) { sinId++; continue; } // sin ID no se puede localizar con seguridad al guardar
    usuarios.push({ fila: i + 1, id: id, nombre: nombre, p1: t(f, c1), p2: t(f, c2) });
  }
  return { usuarios: usuarios, filasConNombre: usuarios.length + sinId, sinId: sinId };
}

function revPat_buscarCabecera_(informe) {
  const col = informe.getRange(1, 1, Math.min(informe.getLastRow(), 40), 1).getValues();
  for (let i = 0; i < col.length; i++) if (String(col[i][0]) === REV_PAT_.CABECERA[0]) return i + 1;
  throw new Error('No se encuentra la tabla en la hoja "' + REV_PAT_.HOJA + '". Ejecuta de nuevo revisarPatologias.');
}

/** Reescribe la hoja de revisión: resumen arriba, tabla de valores por revisar debajo y la lista oficial a la derecha. */
function revPat_escribirInforme_(ss, datos, cuenta, filas, lista) {
  const cab = REV_PAT_.CABECERA, A = cab.length, F0 = REV_PAT_.FILA_CAB;
  let hoja = ss.getSheetByName(REV_PAT_.HOJA);
  if (hoja) { hoja.clear(); hoja.getRange(1, 1, hoja.getMaxRows(), hoja.getMaxColumns()).clearDataValidations(); } // las reglas de la vez anterior rechazarían los valores nuevos else hoja = ss.insertSheet(REV_PAT_.HOJA);
  const filasNecesarias = Math.max(F0 + filas.length, lista.length + 5, 30);
  if (hoja.getMaxRows() < filasNecesarias) hoja.insertRowsAfter(hoja.getMaxRows(), filasNecesarias - hoja.getMaxRows());
  const colesNecesarias = REV_PAT_.COL_LISTA + 1;
  if (hoja.getMaxColumns() < colesNecesarias) hoja.insertColumnsAfter(hoja.getMaxColumns(), colesNecesarias - hoja.getMaxColumns());

  const tz = Session.getScriptTimeZone();
  const resumen = [
    ['REVISIÓN ASISTIDA DE PATOLOGÍAS', ''],
    ['Última acción', 'Revisión del ' + Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy HH:mm') + ' (no se ha guardado nada en la Maestra)'],
    ['Usuarios con nombre en la Maestra', datos.filasConNombre],
    ['   · sin ID paciente (se saltan; ejecuta asignarIdsPaciente)', datos.sinId],
    ['Usuarios con alguna patología escrita', cuenta.usuarios],
    ['Valores que ya coinciden con la lista oficial', cuenta.coinciden],
    ['Valores por revisar (filas de la tabla)', filas.length],
    ['   · Automático (decisión ya rellena) / Dudoso / Sin equivalente', cuenta.automatico + ' / ' + cuenta.dudoso + ' / ' + cuenta.sinEquivalente],
    ['Cómo seguir', 'Revisa la columna «Decisión final» (desplegable). Vacía = no se toca. Cuando estés conforme, ejecuta aplicarRevisionPatologias.']
  ];
  hoja.getRange(1, 1, resumen.length, 1).setNumberFormat('@').setValues(resumen.map(function (f) { return [f[1] === '' ? f[0] : f[0] + ': ' + f[1]]; }));
  hoja.getRange(1, 1).setFontWeight('bold');

  hoja.getRange(F0, 1, 1, A).setValues([cab]).setFontWeight('bold');
  if (filas.length) {
    hoja.getRange(F0 + 1, 1, filas.length, A).setNumberFormat('@').setValues(filas);
    // Código: se calcula solo a partir de la decisión, con la lista oficial de la derecha.
    const L = REV_PAT_.COL_LISTA, nl = lista.length;
    const rl = hoja.getRange(5, L, nl + 1, 1); // la lista oficial + la opción de quitar
    const formulas = [];
    for (let i = 0; i < filas.length; i++) {
      const r = F0 + 1 + i;
      formulas.push(['=IFERROR(VLOOKUP(G' + r + ',$' + revPat_letra_(L) + '$5:$' + revPat_letra_(L + 1) + '$' + (4 + nl) + ',2,FALSE),"")']);
    }
    hoja.getRange(F0 + 1, cab.indexOf('Código CIE-10') + 1, filas.length, 1).setNumberFormat('General').setFormulas(formulas);
    const regla = SpreadsheetApp.newDataValidation().requireValueInRange(rl, true).setAllowInvalid(false)
      .setHelpText('Elige una patología de la lista oficial, o borra la celda para no tocar este valor.').build();
    hoja.getRange(F0 + 1, cab.indexOf('Decisión final') + 1, filas.length, 1).setDataValidation(regla);
  }

  // Lista oficial (para el desplegable y el código).
  hoja.getRange(4, REV_PAT_.COL_LISTA, 1, 2).setValues([['Lista oficial', 'Código']]).setFontWeight('bold');
  hoja.getRange(5, REV_PAT_.COL_LISTA, lista.length, 2).setNumberFormat('@').setValues(lista.map(function (p) { return [p.nombre, p.codigo]; }));
  hoja.getRange(5 + lista.length, REV_PAT_.COL_LISTA, 1, 2).setNumberFormat('@').setValues([[REV_PAT_.QUITAR, '']]);

  [60, 220, 90, 210, 120, 330, 300, 110, 260, 120].forEach(function (w, i) { hoja.setColumnWidth(i + 1, w); });
  hoja.setColumnWidth(REV_PAT_.COL_LISTA, 300);
  hoja.setFrozenRows(0);
}

/** 1 = A, 12 = L. */
function revPat_letra_(n) {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
