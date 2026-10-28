// =====================================================================================
// herramientas/Normalizar_Telefonos.gs
// MIGRACIÓN ÚNICA (F3 de la sección 12 de CONTEXTO.md): deja todos los teléfonos de la hoja con la misma forma.
//
// Regla (la misma que `telefonoNormalizar_`, core/Utils.gs): se guardan SOLO con dígitos, sin espacios y como TEXTO.
//   · español (9 dígitos, con o sin +34 / 0034 / 34 delante)  ->  612345678
//   · extranjero (empieza por + o 00)                          ->  +447911123456
//   · cualquier otro (no tiene 9 dígitos y no lleva prefijo)   ->  solo sus dígitos (no se inventa nada; sale en el informe)
//   · con letras u otros signos (p. ej. dos números en una celda) NO se toca: sale en el informe para arreglarlo a mano.
// En pantalla siempre se muestran como «123 45 67 89» (ui/JS_Telefono.html).
//
// Qué columnas toca: «Teléfono 1» y «Teléfono 2» de la Maestra y la columna Teléfono de «Valoraciones» (copia del de la
// Maestra). La hoja «Citas» no guarda teléfono. Además pone formato de texto (@) a esas columnas para que Sheets no
// convierta los números en cifras (ni se coma el «+»).
//
// Desde el editor de Apps Script, tras `clasp push` y la nueva versión:
//   1. `revisarTelefonos`: SOLO LECTURA. Cuántos están bien, cuántos se cambiarían (con ejemplos), cuáles no se pueden
//      normalizar y qué números están repetidos entre usuarios distintos (puede ser normal: familia). Mira el registro.
//   2. `normalizarTelefonos`: escribe. Se puede repetir (lo ya correcto no cambia).
//   3. `revisarTelefonos` otra vez: debe decir 0 a cambiar.
//
// Reutiliza SIN modificar: getSS (core/WebApp.gs), SHEETS, COLUMNAS, COLUMNAS_NUM (core/Config.gs),
// obtenerIndiceColumnaPorNombre_ (core/Utils.gs), telefonoAnalizar_ (core/Utils.gs).
// Nombres con prefijo telefonos para no chocar en el ámbito global.
// =====================================================================================

/** Columnas de teléfono que se revisan: [{ hoja, etiqueta, col (1 = A), colNombre (1 = A; 0 si no hay) }]. Omite lo que no existe. */
function telefonosColumnas_() {
  const ss = getSS();
  const salida = [];
  const maestra = ss.getSheetByName(SHEETS.MAESTRA);
  if (maestra) {
    const cNombre = obtenerIndiceColumnaPorNombre_(maestra, COLUMNAS.MAESTRA.NOMBRE) + 1;
    [COLUMNAS.MAESTRA.TELEFONO_1, COLUMNAS.MAESTRA.TELEFONO_2].forEach(function (cab) {
      const c = obtenerIndiceColumnaPorNombre_(maestra, cab) + 1;
      if (c > 0) salida.push({ hoja: maestra, etiqueta: SHEETS.MAESTRA + ' · ' + cab, col: c, colNombre: cNombre, esMaestra: true });
    });
  }
  const valoraciones = ss.getSheetByName(SHEETS.VALORACIONES);
  if (valoraciones) {
    salida.push({ hoja: valoraciones, etiqueta: SHEETS.VALORACIONES + ' · Teléfono', col: COLUMNAS_NUM.VALORACIONES.TELEFONO,
                  colNombre: COLUMNAS_NUM.VALORACIONES.NOMBRE, esMaestra: false });
  }
  return salida;
}

/**
 * Lee una columna y calcula, celda a celda, qué pasaría. Devuelve { filas, valores, formulas, items } donde cada item es
 * { fila, nombre, original, nuevo, tipo, cambia }. Solo las celdas con algo escrito.
 */
function telefonosAnalizarColumna_(def) {
  const hoja = def.hoja;
  const ult = hoja.getLastRow();
  if (ult < 2) return { filas: 0, valores: [], formulas: 0, items: [] };
  const n = ult - 1;
  const rango = hoja.getRange(2, def.col, n, 1);
  const valores = rango.getValues();
  const formulas = rango.getFormulas();
  const nombres = def.colNombre > 0 ? hoja.getRange(2, def.colNombre, n, 1).getValues() : null;
  let conFormula = 0;
  const items = [];
  for (let i = 0; i < n; i++) {
    const v = valores[i][0];
    if (formulas[i][0]) { conFormula++; continue; }
    if (v === '' || v === null) continue;
    const raro = typeof v !== 'string' && typeof v !== 'number';   // una fecha u otro objeto: no es un teléfono
    const a = raro ? { ok: false, valor: String(v), tipo: 'ilegible' } : telefonoAnalizar_(v);
    const cambia = a.ok && (typeof v !== 'string' || v !== a.valor);
    items.push({
      fila: i + 2, nombre: nombres ? String(nombres[i][0] || '').trim() : '', original: v, nuevo: a.valor, tipo: a.tipo, cambia: cambia
    });
  }
  return { filas: n, valores: valores, formulas: conFormula, items: items };
}

function telefonosCorto_(v, max) {
  const s = String(v);
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

/** SOLO LECTURA: informa de lo que cambiaría `normalizarTelefonos`. */
function revisarTelefonos() {
  Logger.log('=== Revisión de teléfonos (solo lectura; no se ha cambiado nada) ===');
  const columnas = telefonosColumnas_();
  if (!columnas.length) { Logger.log('No se encontró ninguna columna de teléfono.'); return; }
  let totalCambios = 0, totalIlegibles = 0;
  columnas.forEach(function (def) {
    const r = telefonosAnalizarColumna_(def);
    const cambian = r.items.filter(function (x) { return x.cambia; });
    const ilegibles = r.items.filter(function (x) { return x.tipo === 'ilegible'; });
    const otros = r.items.filter(function (x) { return x.tipo === 'otro'; });
    const extranjeros = r.items.filter(function (x) { return x.tipo === 'extranjero'; });
    totalCambios += cambian.length; totalIlegibles += ilegibles.length;
    Logger.log('');
    Logger.log(def.etiqueta + ' (columna ' + def.col + ', ' + r.filas + ' filas):');
    Logger.log('   · Con teléfono: ' + r.items.length + ' · ya correctos: ' + (r.items.length - cambian.length - ilegibles.length) +
               ' · A CAMBIAR: ' + cambian.length + ' · extranjeros (+): ' + extranjeros.length);
    if (r.formulas) Logger.log('   · AVISO: ' + r.formulas + ' celda(s) con fórmula (no se tocan; si hay alguna, normalizarTelefonos no escribirá esta columna).');
    cambian.slice(0, 8).forEach(function (x) {
      Logger.log('        fila ' + x.fila + (x.nombre ? ' (' + telefonosCorto_(x.nombre, 28) + ')' : '') + ': "' + telefonosCorto_(x.original, 30) + '" → "' + x.nuevo + '"');
    });
    if (cambian.length > 8) Logger.log('        … y ' + (cambian.length - 8) + ' más.');
    if (ilegibles.length) {
      Logger.log('   · NO SE PUEDEN NORMALIZAR (se dejan como están; arréglalos a mano): ' + ilegibles.length);
      ilegibles.slice(0, 40).forEach(function (x) {
        Logger.log('        fila ' + x.fila + (x.nombre ? ' (' + telefonosCorto_(x.nombre, 28) + ')' : '') + ': "' + telefonosCorto_(x.original, 40) + '"');
      });
    }
    if (otros.length) {
      Logger.log('   · NO TIENEN 9 DÍGITOS (se guardan solo con sus dígitos, sin inventar nada; revísalos): ' + otros.length);
      otros.slice(0, 40).forEach(function (x) {
        Logger.log('        fila ' + x.fila + (x.nombre ? ' (' + telefonosCorto_(x.nombre, 28) + ')' : '') + ': "' + telefonosCorto_(x.original, 30) + '" → "' + x.nuevo + '"');
      });
    }
  });

  // Números repetidos entre usuarios distintos (solo la Maestra): puede ser normal (familia), pero conviene saberlo.
  const maestra = columnas.filter(function (d) { return d.esMaestra; });
  if (maestra.length) {
    const porNumero = Object.create(null);
    maestra.forEach(function (def) {
      telefonosAnalizarColumna_(def).items.forEach(function (x) {
        if (x.tipo === 'ilegible' || !x.nuevo) return;
        const clave = String(x.nuevo).replace(/\D/g, '');
        if (clave.length < 9) return;
        (porNumero[clave] = porNumero[clave] || {})[x.fila] = x.nombre;
      });
    });
    const repetidos = Object.keys(porNumero).filter(function (k) { return Object.keys(porNumero[k]).length > 1; });
    Logger.log('');
    Logger.log('NÚMEROS REPETIDOS ENTRE USUARIOS DISTINTOS (Maestra): ' + repetidos.length + (repetidos.length ? ' (puede ser normal: familia)' : ''));
    repetidos.slice(0, 20).forEach(function (k) {
      const filas = porNumero[k];
      Logger.log('        ' + k + ': ' + Object.keys(filas).map(function (f) { return 'fila ' + f + (filas[f] ? ' ' + telefonosCorto_(filas[f], 24) : ''); }).join(' | '));
    });
  }

  Logger.log('');
  Logger.log(totalCambios === 0 && totalIlegibles === 0
    ? 'Todo limpio: no hay nada que cambiar.'
    : 'Resumen: ' + totalCambios + ' celda(s) a cambiar' + (totalIlegibles ? ' y ' + totalIlegibles + ' que no se pueden normalizar (se dejan como están).' : '.'));
}

/**
 * ESCRIBE: normaliza las celdas de teléfono (Maestra: Teléfono 1 y 2; Valoraciones: Teléfono) y deja las columnas en formato texto.
 * Solo reescribe las columnas con algo que cambiar; lo que no se puede normalizar se deja intacto. Se puede repetir.
 */
function normalizarTelefonos() {
  Logger.log('=== Normalizar teléfonos ===');
  const columnas = telefonosColumnas_();
  if (!columnas.length) { Logger.log('No se encontró ninguna columna de teléfono.'); return; }
  let cambiadas = 0;
  columnas.forEach(function (def) {
    const r = telefonosAnalizarColumna_(def);
    if (r.filas === 0) { Logger.log(def.etiqueta + ': sin filas.'); return; }
    if (r.formulas) { Logger.log(def.etiqueta + ': OMITIDA, tiene ' + r.formulas + ' celda(s) con fórmula. Quítalas y vuelve a ejecutar.'); return; }
    const cambian = r.items.filter(function (x) { return x.cambia; });
    const rango = def.hoja.getRange(2, def.col, r.filas, 1);
    // Formato texto en toda la columna (también donde no hay cambios): así los números nuevos que se escriban no se convierten en cifras.
    rango.setNumberFormat('@');
    if (!cambian.length) { Logger.log(def.etiqueta + ': ya estaba todo correcto (formato de texto aplicado).'); return; }
    const salida = r.valores.map(function (f) { return [f[0]]; });
    cambian.forEach(function (x) { salida[x.fila - 2][0] = x.nuevo; });
    rango.setValues(salida);
    cambiadas += cambian.length;
    Logger.log(def.etiqueta + ': ' + cambian.length + ' celda(s) normalizada(s).');
  });
  SpreadsheetApp.flush();
  Logger.log('Hecho: ' + cambiadas + ' celda(s) cambiada(s). Ejecuta `revisarTelefonos` para comprobar que ya no queda nada.');
}
