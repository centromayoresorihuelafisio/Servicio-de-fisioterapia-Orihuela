// acceso/Registro.gs
// Hoja "Registro": solo se añaden filas. Nunca guarda contraseñas ni los datos enviados al entrar (CONTEXTO.md, sección 17.6).
// ================================================================================

const REGISTRO_CABECERAS_ = ['fecha', 'usuario', 'rol', 'accion', 'entidad', 'detalle', 'resultado'];
const REGISTRO_MAX_CELDA_ = 49000;

/** Un texto que empiece por = + - @ se guarda como texto: en la hoja no debe convertirse en fórmula. */
function registroTexto_(v) {
  const s = String(v === null || v === undefined ? '' : v).slice(0, REGISTRO_MAX_CELDA_);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

/** Añade una fila. Si falla, la operación sigue, igual que en historialRegistrar_. */
function registroAnotar_(usuario, rol, accion, entidad, detalle, resultado) {
  try {
    const hoja = getSS().getSheetByName(SHEETS.REGISTRO);
    if (!hoja) return;
    hoja.appendRow([new Date()].concat([usuario, rol, accion, entidad, detalle, resultado].map(registroTexto_)));
  } catch (e) {
    console.error('registroAnotar_: ' + e.message);
  }
}

const REGISTRO_HC_AGRUPAR_MS_ = 30 * 60 * 1000;

/**
 * Textos de la HC (decisión 4 de 17.8): la HC se guarda sola al escribir, así que se anota una sola fila por usuario,
 * historia y campo cada 30 minutos. La primera vez se añade la fila y, mientras dura ese plazo, se actualiza su
 * "detalle" con los caracteres de ahora; "antes" es el tamaño al empezar. Solo se toca la fila si sigue siendo la misma.
 */
function registroTextoHC_(idHC, campo, antes, despues) {
  const sesion = sesionActual_();
  if (!sesion) return;
  try {
    const hoja = getSS().getSheetByName(SHEETS.REGISTRO);
    if (!hoja) return;
    const cache = CacheService.getScriptCache();
    const clave = 'reghc_' + sesion.usuario + '_' + idHC + '_' + campo;
    const previa = JSON.parse(cache.get(clave) || 'null');
    const pasado = previa ? Date.now() - previa.desde : Infinity;
    if (previa && pasado < REGISTRO_HC_AGRUPAR_MS_ && previa.fila <= hoja.getLastRow()) {
      const fila = hoja.getRange(previa.fila, 2, 1, 4).getValues()[0];
      if (fila[0] === sesion.usuario && fila[2] === 'guardarTextoHCWeb' && fila[3] === idHC) {
        hoja.getRange(previa.fila, 6).setValue(registroTexto_(JSON.stringify({ campo: campo, antes: previa.antes, despues: despues })));
        return;
      }
    }
    registroAnotar_(sesion.usuario, sesion.rol, 'guardarTextoHCWeb', idHC, JSON.stringify({ campo: campo, antes: antes, despues: despues }), 'ok');
    const nueva = { fila: hoja.getLastRow(), antes: antes, desde: Date.now() };
    cache.put(clave, JSON.stringify(nueva), Math.ceil(REGISTRO_HC_AGRUPAR_MS_ / 1000));
  } catch (e) {
    console.error('registroTextoHC_: ' + e.message);
  }
}
